"""Local CSV screening. Public profile/first 12 previews only; resumable, no secrets saved."""
import argparse, base64, csv, getpass, io, json, re, shutil, sys, threading, time
from collections import Counter
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urlparse
from urllib.request import Request, urlopen

from PIL import Image


ROOT=Path(__file__).resolve().parent.parent/'outputs'/'creator-batch'
CRITERIA=['USA','female','age_20_39','small_dog','owner_visible','fit_body','face_visible_and_aesthetic','fashion_aesthetic']
SCHEMA={'type':'object','additionalProperties':False,'required':['account_type','summary','criteria','limitations'],'properties':{
    'account_type':{'type':'string','enum':['individual','brand','unknown']},'summary':{'type':'string'},
    'criteria':{'type':'array','minItems':8,'maxItems':8,'items':{'type':'object','additionalProperties':False,'required':['criterion','status','evidence_posts','explanation'],'properties':{'criterion':{'type':'string','enum':CRITERIA},'status':{'type':'string','enum':['pass','fail','unknown']},'evidence_posts':{'type':'array','items':{'type':'integer'}},'explanation':{'type':'string'}}}},
    'limitations':{'type':'array','items':{'type':'string'}}}}
LOCK=threading.Lock()
COUNTS=Counter()

def save(path,data):
    temp=path.with_suffix('.tmp')
    temp.write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8')
    temp.replace(path)

def api(url,headers,payload=None):
    started=time.monotonic()
    endpoint=urlparse(url)
    try:
        result=_api_with_retries(url,headers,payload)
        return result
    finally:
        print(json.dumps({'event':'api_call','provider':endpoint.hostname,'endpoint':endpoint.path,'seconds':round(time.monotonic()-started,3)}),flush=True)

def _api_with_retries(url,headers,payload=None):
    for attempt in range(3):
        try:
            data=json.dumps(payload).encode() if payload is not None else None
            with urlopen(Request(url,headers=headers,data=data),timeout=90) as response:
                result=json.load(response)
            if result.get('success') is False:
                raise RuntimeError('provider_unsuccessful')
            return result
        except HTTPError as exc:
            print(json.dumps({'event':'api_error','provider':urlparse(url).hostname,'endpoint':urlparse(url).path,'attempt':attempt+1,'error':'http_'+str(exc.code)}),flush=True)
            if exc.code not in (429,500,502,503,504) or attempt==2:
                error=RuntimeError('http_'+str(exc.code))
                try: error.response=json.loads(exc.read())
                except (ValueError,OSError): error.response={}
                raise error from None
        except (URLError,TimeoutError):
            print(json.dumps({'event':'api_error','provider':urlparse(url).hostname,'endpoint':urlparse(url).path,'attempt':attempt+1,'error':'network_timeout'}),flush=True)
            if attempt==2: raise RuntimeError('network_timeout') from None
        time.sleep(2**(attempt+1))

def scrape(path,params,key):
    result=api('https://api.scrapecreators.com'+path+'?'+urlencode(params),{'x-api-key':key})
    with LOCK: COUNTS['credits']+=result.get('credits_charged',0)
    return result

def identity(url):
    parsed=urlparse(url.strip())
    host=(parsed.hostname or '').lower().removeprefix('www.')
    name=parsed.path.strip('/').split('/')[0].removeprefix('@')
    if host not in ('tiktok.com','instagram.com') or not re.fullmatch(r'[A-Za-z0-9_.]+',name): return None
    return ('tiktok' if host=='tiktok.com' else 'instagram',name.lower())

def url_list(v): return (v or {}).get('url_list',[])

def preview(folder,index,candidates):
    name=f'post-{index:02d}.jpg'
    if (folder/name).exists(): return name
    for url in candidates:
        if not isinstance(url,str) or urlparse(url).scheme!='https': continue
        try:
            with urlopen(Request(url,headers={'User-Agent':'Mozilla/5.0'}),timeout=18) as r: data=r.read(10_000_001)
            if len(data)>10_000_000: continue
            im=Image.open(io.BytesIO(data)).convert('RGB')
            im.thumbnail((640,800)); im.save(folder/name,quality=82)
            return name
        except Exception as exc:
            with LOCK:
                with (folder/'image-errors.jsonl').open('a',encoding='utf-8') as out:
                    out.write(json.dumps({'index':index,'host':urlparse(url).hostname,'error':type(exc).__name__,'code':getattr(exc,'code',None),'reason':str(getattr(exc,'reason',''))[:200]})+'\n')
            continue
    return None

def source_for(platform,handle,key,folder,profile_response=None):
    path=folder/'source.json'
    if path.exists(): return json.loads(path.read_text(encoding='utf-8'))
    profile={}; posts=[]; candidates=[]
    if platform=='tiktok':
        response=profile_response if profile_response is not None else scrape('/v1/tiktok/profile',{'handle':handle},key)
        user=response.get('user') or {}
        if not user: raise RuntimeError('missing_profile')
        profile={k:user.get(k) for k in ('uniqueId','nickname','signature','verified','privateAccount')}
        params={'handle':handle,'sort_by':'latest','include_pinned':'true'}
        raw=[]; seen=set()
        for page in range(5):
            feed=scrape('/v3/tiktok/profile/videos',params,key)
            for p in feed.get('aweme_list',[]):
                if p.get('aweme_id') not in seen: raw.append(p); seen.add(p.get('aweme_id'))
            if len(raw)>=24 or not feed.get('has_more') or not feed.get('max_cursor'): break
            params['max_cursor']=feed['max_cursor']
        for i,p in enumerate(raw[:24],1):
            video=p.get('video') or {}
            images=url_list(video.get('cover'))+url_list(video.get('origin_cover'))+url_list(video.get('dynamic_cover'))
            for slide in (p.get('image_post_info') or {}).get('images',[])[:1]: images+=url_list(slide.get('thumbnail'))+url_list(slide.get('display_image'))
            posts.append({'index':i,'id':p.get('aweme_id'),'caption':p.get('desc','')[:2500],'url':f'https://www.tiktok.com/@{handle}/video/{p.get("aweme_id")}','pinned':bool(p.get('is_top'))})
            candidates.append(images)
    else:
        response=profile_response if profile_response is not None else scrape('/v1/instagram/profile',{'handle':handle},key)
        user=(response.get('data') or {}).get('user') or response.get('user') or {}
        if not user: raise RuntimeError('missing_profile')
        profile={k:user.get(k) for k in ('username','full_name','biography','pronouns','category_name','is_private')}
        # Avoid passing street addresses or contact information to the model.
        try: profile['declared_city']=json.loads(user.get('business_address_json') or '{}').get('city_name')
        except (ValueError,AttributeError): pass
        raw=[]; params={'handle':handle}; seen=set()
        for page in range(5):
            feed=scrape('/v2/instagram/user/posts',params,key)
            for p in feed.get('items',[]):
                pid=str(p.get('pk') or p.get('id'))
                if pid not in seen: raw.append(p); seen.add(pid)
            if len(raw)>=24 or not feed.get('more_available') or not feed.get('next_max_id'): break
            params['next_max_id']=feed['next_max_id']
        for i,p in enumerate(raw[:24],1):
            cap=p.get('caption') or {}
            cap=cap.get('text','') if isinstance(cap,dict) else str(cap)
            images=[x['url'] for x in (p.get('image_versions2') or {}).get('candidates',[]) if x.get('url')]
            images += [p[k] for k in ('display_uri','display_url','thumbnail_url') if isinstance(p.get(k),str)]
            if not images:
                for slide in (p.get('carousel_media') or [])[:1]: images += [x['url'] for x in (slide.get('image_versions2') or {}).get('candidates',[]) if x.get('url')]
            posts.append({'index':i,'id':str(p.get('pk') or p.get('id')),'caption':cap[:2500],'url':f'https://www.instagram.com/p/{p.get("code")}/'})
            candidates.append(images)
    with ThreadPoolExecutor(max_workers=4) as pool:
        images=list(pool.map(lambda pair:preview(folder,pair[0],pair[1]),enumerate(candidates,1)))
    for p,img in zip(posts,images): p['image']=img
    result={'platform':platform,'handle':handle,'profile':profile,'posts':posts,'retrieved_at':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'scope':'First 24 API feed posts, pinned included; preview images only, not complete videos; omissions possible'}
    save(path,result); return result
