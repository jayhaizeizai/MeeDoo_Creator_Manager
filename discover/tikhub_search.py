"""Durable TikHub pagination for GUI batches; screen only previously unseen accounts."""
import json,os,re,time,urllib.request,urllib.parse,urllib.error

def request(platform,cursor,query):
 params={'keyword':query}
 if platform=='instagram':
  endpoint='/api/v1/instagram/v2/search_reels'
  if cursor:params['pagination_token']=cursor
 else:
  endpoint='/api/v1/tiktok/app/v3/fetch_general_search_result'
  params.update(offset=cursor or 0,count=20,sort_type=0,publish_time=0)
 key=os.environ.get('TIKHUB_API_KEY')
 if not key:raise RuntimeError('tikhub_key_missing')
 req=urllib.request.Request('https://api.tikhub.io'+endpoint+'?'+urllib.parse.urlencode(params),headers={'Authorization':'Bearer '+key,'Accept':'application/json'})
 try:
  with urllib.request.urlopen(req,timeout=90) as f:data=json.load(f)
 except urllib.error.HTTPError as e:raise RuntimeError('http_'+str(e.code)) from None
 except (TimeoutError,urllib.error.URLError):raise RuntimeError('provider_timeout') from None
 if data.get('code')!=200:raise RuntimeError('provider_code_'+str(data.get('code')))
 return data

def search(db,j,fetch=request):
 state=json.loads(j['search_state']);platforms=json.loads(j['platforms']);stamp=lambda:time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime())
 count=db.execute('SELECT count(*) FROM discover_hits WHERE job_id=?',(j['id'],)).fetchone()[0]
 seen=set()
 for table in ['discover_candidates','discover_hits','discover_exclusions']:
  seen.update(r[0] for r in db.execute('SELECT DISTINCT c.account_key FROM '+table+' c JOIN discover_jobs j ON j.id=c.job_id WHERE j.tenant=? AND j.id!=?',(j['tenant'],j['id'])) if r[0])
 for row in db.execute("SELECT data FROM records WHERE kind='creators' AND tenant=?",(j['tenant'],)):
  for url in re.findall(r'https?://(?:www\.)?(?:instagram\.com|tiktok\.com)/[^\s"<>]+',row[0]):
   u=urllib.parse.urlparse(url);h=urllib.parse.unquote(u.path).strip('/').split('/')[0].lstrip('@').lower()
   if h and h not in ('p','reel','reels','stories','explore'):seen.add(('tiktok' if 'tiktok.com' in u.netloc else 'instagram')+'--'+h)
 def save():db.execute('UPDATE discover_jobs SET search_state=?,updated_at=? WHERE id=?',(json.dumps(state),stamp(),j['id']))
 while sum(s.get('results',0) for s in state.values())<j['limit_count'] and any(not state[p]['done'] for p in platforms):
  for p in platforms:
   s=state[p];remaining=j['limit_count']-sum(v.get('results',0) for v in state.values())
   if s['done'] or remaining<=0:continue
   cursor=s.get('cursor');page=json.dumps(cursor,sort_keys=True)
   if db.execute('SELECT 1 FROM discover_pages WHERE job_id=? AND platform=? AND page_key=?',(j['id'],p,page)).fetchone():
    with db:s.update(done=True,reason='repeated_results');save()
    continue
   response=None
   for attempt in range(3):
    with db:s['requests']=s.get('requests',0)+1;save()
    try:response=fetch(p,cursor,j['query']);break
    except Exception as e:
     error=str(e)[:100]
     if error in ('http_401','http_402','tikhub_key_missing'):break
     if attempt<2:time.sleep(2**(attempt+1))
   if response is None:
    with db:s.update(done=True,reason='provider_error',error=error);save()
    continue
   data=response.get('data') or {};items=(data.get('data') or {}).get('items',[]) if p=='instagram' else [v['aweme_info'] for v in data.get('data',[]) if v.get('aweme_info')]
   fresh=0
   with db:
    db.execute('INSERT INTO discover_pages VALUES(?,?,?,?)',(j['id'],p,page,json.dumps(response)))
    for v in items[:remaining]:
     sid=v.get('aweme_id') or v.get('id') or v.get('pk')
     if sid is None:continue
     sid=str(sid)
     if db.execute('SELECT 1 FROM discover_hits WHERE job_id=? AND platform=? AND source_id=?',(j['id'],p,sid)).fetchone():continue
     fresh+=1;count+=1;u=v.get('user',{}) if p=='instagram' else v.get('author',{});h=(u.get('username') or u.get('unique_id') or '').strip().lower().lstrip('@');key=p+'--'+h if re.fullmatch(r'[a-z0-9_.]+',h) else None
     db.execute('INSERT INTO discover_hits VALUES(?,?,?,?,?,?)',(j['id'],count,p,sid,key,json.dumps(v)))
     if key:
      if key in seen:db.execute('INSERT OR IGNORE INTO discover_exclusions VALUES(?,?,?)',(j['id'],key,'already_collected'))
      else:db.execute('INSERT OR IGNORE INTO discover_candidates(job_id,account_key,platform,handle) VALUES(?,?,?,?)',(j['id'],key,p,h))
    s['pages']=s.get('pages',0)+1;s['results']=s.get('results',0)+len(items[:remaining]);s['empty_new_pages']=s.get('empty_new_pages',0)+1 if not fresh else 0
    nxt=data.get('pagination_token') if p=='instagram' else data.get('cursor')
    if not nxt or (p=='tiktok' and not data.get('has_more')):s.update(done=True,reason='end_of_results')
    elif nxt==cursor or s['empty_new_pages']>=3:s.update(done=True,reason='repeated_results')
    s['cursor']=nxt;save()
   print(json.dumps({'event':'search','job':j['id'],'provider':'tikhub','platform':p,'pages':s['pages'],'saved':count}),flush=True)
 for s in state.values():
  if not s['done']:s.update(done=True,reason='limit_reached')
 with db:save();db.execute("UPDATE discover_jobs SET state='analyzing' WHERE id=?",(j['id'],))
