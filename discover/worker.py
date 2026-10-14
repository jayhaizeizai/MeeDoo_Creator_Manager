"""Resumable search + screening. Raw search pages/hits always persisted before screening."""
import os,sys,json,sqlite3,time,hashlib,re
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor,as_completed
from collector import scrape
from screening import screen,CONFIG

def connect(path):
 db=sqlite3.connect(path,timeout=30);db.row_factory=sqlite3.Row;db.execute('PRAGMA busy_timeout=30000');return db
def stamp():return time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime())
def extract(platform,response):
 items=response.get('search_item_list',response.get('aweme_list',[])) if platform=='tiktok' else response.get({'instagram_profiles':'profiles','instagram_hashtag':'posts','instagram_popular':'posts'}.get(platform,'reels'),[])
 out=[]
 for item in items:
  media=item.get('aweme_info',item) if platform=='tiktok' else item
  author=media.get('author',{}) if platform=='tiktok' else media if platform=='instagram_profiles' else media.get('owner',media.get('user',{}))
  author=author or {}
  handle=author.get('unique_id') or author.get('uniqueId') or author.get('username') or ''
  if not handle and platform=='tiktok':
   m=re.search(r'tiktok\.com/@([\w.]+)',media.get('url',''));handle=m.group(1) if m else ''
  handle=handle.lower().lstrip('@');handle=handle if re.fullmatch(r'[a-z0-9_.]+',handle) else ''
  source_id=str(media.get('aweme_id') or media.get('id') or media.get('shortcode') or hashlib.sha256(json.dumps(item,sort_keys=True).encode()).hexdigest())
  out.append((source_id,handle,item))
 return out
def search(db,j,key):
 state=json.loads(j['search_state']);platforms=json.loads(j['platforms']);count=db.execute('SELECT count(*) FROM discover_hits WHERE job_id=?',(j['id'],)).fetchone()[0]
 channels=platforms+[c for c in ('instagram_profiles','instagram_hashtag','instagram_popular') if c in state and 'instagram' in platforms]
 for p in platforms:state.setdefault(p,{'cursor':0 if p=='tiktok' else 1,'done':False,'pages':0,'empty_new_pages':0})
 while count<j['limit_count'] and any(not state[p]['done'] for p in channels):
  for channel in channels:
   platform='tiktok' if channel=='tiktok' else 'instagram';s=state[channel]
   if s['done'] or count>=j['limit_count']:continue
   cursor=s['cursor'];params={'query':j['query']}
   if channel=='tiktok':path='/v1/tiktok/search/keyword';params.update(cursor=cursor,sort_by='relevance',region='US')
   elif channel=='instagram':path='/v2/instagram/reels/search';params['page']=cursor
   elif channel=='instagram_popular':
    path='/v1/instagram/search/popular'
    if cursor:params['cursor']=cursor
   elif channel=='instagram_profiles':path='/v1/instagram/search/profiles'
   else:path='/v1/instagram/search/hashtag';params={'hashtag':s['query'],'media_type':'all','cursor':str(cursor)}
   try:response=scrape(path,params,key)
   except Exception as e:
    if channel in ('instagram_hashtag','instagram_popular') and str(e)=='http_404' and getattr(e,'response',{}).get('message') in ('No posts found','Instagram does not have a popular page for that query'):response=e.response
    else:
     s['done']=True;s['reason']='provider_error';s['error']=str(e)[:100];db.execute('UPDATE discover_jobs SET search_state=?,updated_at=? WHERE id=?',(json.dumps(state),stamp(),j['id']));db.commit();continue
   items=extract(channel,response);fresh=0;saved=0
   with db:
    db.execute('INSERT OR REPLACE INTO discover_pages VALUES(?,?,?,?)',(j['id'],channel,str(cursor),json.dumps(response)))
    for source_id,handle,item in items:
     if count>=j['limit_count']:break
     exists=db.execute("SELECT 1 FROM discover_hits WHERE job_id=? AND platform=? AND source_id=? AND (json_extract(payload,'$.source')=? OR (json_extract(payload,'$.source') IS NULL AND platform=?)) LIMIT 1",(j['id'],platform,source_id,channel,channel)).fetchone()
     fresh+=not bool(exists);count+=1;saved+=1;account=platform+'--'+handle if handle else None
     db.execute('INSERT INTO discover_hits VALUES(?,?,?,?,?,?)',(j['id'],count,platform,source_id,account,json.dumps({'source':channel,'item':item})))
     if handle:db.execute('INSERT OR IGNORE INTO discover_candidates(job_id,account_key,platform,handle) VALUES(?,?,?,?)',(j['id'],account,platform,handle))
    s['pages']+=1;s['results']=s.get('results',0)+saved;s['empty_new_pages']=s.get('empty_new_pages',0)+1 if not fresh else 0
    next_cursor=response.get('cursor') if channel in ('tiktok','instagram_hashtag','instagram_popular') else response.get('next_page',cursor+1)
    if not items:s.update(done=True,reason='no_results')
    elif channel=='instagram_profiles':s.update(done=True,reason='ranked_results_complete')
    elif channel in ('instagram','instagram_hashtag') and int(cursor)>=11:s.update(done=True,reason='provider_page_limit')
    elif next_cursor is None or str(next_cursor)==str(cursor) or (channel in ('tiktok','instagram_popular') and response.get('has_more') in (False,0,'0')):s.update(done=True,reason='end_of_results')
    elif s['empty_new_pages']>=3:s.update(done=True,reason='repeated_results')
    else:s['cursor']=next_cursor
    db.execute('UPDATE discover_jobs SET search_state=?,updated_at=? WHERE id=?',(json.dumps(state),stamp(),j['id']))
   print(json.dumps({'event':'search','saved':count,'platform':platform,'source':channel}),flush=True)
 with db:db.execute("UPDATE discover_jobs SET state='analyzing',updated_at=? WHERE id=?",(stamp(),j['id']))

def run(path,job_id):
 db=connect(path);j=db.execute('SELECT * FROM discover_jobs WHERE id=?',(job_id,)).fetchone()
 if not j:raise RuntimeError('missing_job')
 if j['rule_version']!=CONFIG['version']:raise RuntimeError('rule_version_mismatch')
 sk=os.environ['SCRAPECREATORS_API_KEY'];ok=os.environ['DISCOVER_OPENAI_API_KEY']
 root=Path(os.environ.get('DISCOVER_DATA_DIR','/var/lib/meedoo-creator/discover'))/job_id;root.mkdir(parents=True,exist_ok=True)
 with db:db.execute("UPDATE discover_jobs SET state='searching',updated_at=? WHERE id=?",(stamp(),job_id))
 search(db,j,sk)
 candidates=db.execute("SELECT * FROM discover_candidates WHERE job_id=? AND status='pending' ORDER BY account_key",(job_id,)).fetchall()
 def one(c):
  pair=(c['platform'],c['handle']);name,result=screen(pair,sk,ok,root)
  if result.get('error') and result['error'] not in ('missing_profile',):name,result=screen(pair,sk,ok,root)
  source_file=root/name/'source.json';source=json.loads(source_file.read_text()) if source_file.exists() else {}
  return c,result,source
 with ThreadPoolExecutor(max_workers=6) as pool:
  for f in as_completed([pool.submit(one,c) for c in candidates]):
   c,r,source=f.result()
   with db:
    db.execute('UPDATE discover_candidates SET status=?,selected=?,result_json=?,source_json=?,error=? WHERE job_id=? AND account_key=?',('error' if r.get('error') else 'done',r['selected'],json.dumps(r),json.dumps(source),r.get('error'),job_id,c['account_key']))
    db.execute('UPDATE discover_jobs SET updated_at=? WHERE id=?',(stamp(),job_id))
   print(json.dumps({'event':'screened','account':c['account_key'],'selected':r['selected']}),flush=True)
 state=json.loads(db.execute('SELECT search_state FROM discover_jobs WHERE id=?',(job_id,)).fetchone()[0]);partial=any(s.get('reason')=='provider_error' for s in state.values())
 with db:db.execute('UPDATE discover_jobs SET state=?,updated_at=? WHERE id=?',('partial' if partial else 'completed',stamp(),job_id))
 db.close()
if __name__=='__main__':
 try:run(sys.argv[1],sys.argv[2])
 except Exception as e:
  db=connect(sys.argv[1]);db.execute("UPDATE discover_jobs SET state='failed',error=?,updated_at=? WHERE id=?",(type(e).__name__,stamp(),sys.argv[2]));db.commit();print(json.dumps({'event':'failed','error':type(e).__name__}),flush=True);sys.exit(1)
