import base64,json
from pathlib import Path
from collector import source_for,preview,scrape,url_list,save,api
CONFIG=json.loads(Path(__file__).with_name('policy.json').read_text(encoding='utf-8'))
POLICY=CONFIG['prompt'];SCHEMA=CONFIG['schema'];CRITERIA=CONFIG['criteria']
_original_source_for=source_for
def source_for(platform,handle,key,folder):
    source=_original_source_for(platform,handle,key,folder)
    if any(not p.get('image') for p in source['posts']):
        (folder/'source.json').replace(folder/'source-first-attempt.json')
        for image in folder.glob('post-*.jpg'): image.unlink()
        source=_original_source_for(platform,handle,key,folder)
    return source

def screen(pair,sk,ok,root):
    name='--'.join(pair);folder=root/name;folder.mkdir(parents=True,exist_ok=True)
    result_path=folder/'assessment.json'
    if result_path.exists(): return name,json.loads(result_path.read_text(encoding='utf-8'))
    try:
        source=source_for(*pair,sk,folder)
        if 'avatar_checked' not in source or source.get('avatar_error'):
            try:
                response=scrape('/v1/'+pair[0]+'/profile',{'handle':pair[1]},sk)
                if pair[0]=='tiktok':
                    user=response.get('user') or {}
                    urls=[user[k] for k in ('avatarLarger','avatarMedium','avatarThumb') if isinstance(user.get(k),str)]
                    for k in ('avatar_larger','avatar_medium','avatar_thumb'): urls+=url_list(user.get(k))
                else:
                    user=(response.get('data') or {}).get('user') or response.get('user') or {}
                    urls=[user[k] for k in ('profile_pic_url_hd','profile_pic_url') if isinstance(user.get(k),str)]
                source['avatar_image']=preview(folder,0,urls)
                source['avatar_checked']=True
                source.pop('avatar_error',None)
            except Exception as exc:
                source['avatar_checked']=True;source['avatar_error']=type(exc).__name__
            save(folder/'source.json',source)
        if any(not p.get('image') for p in source['posts']): raise RuntimeError('incomplete_previews_after_retry')
        content=[{'type':'input_text','text':json.dumps(source,ensure_ascii=False)}];indices=set()
        pics=([{'index':0,'image':source['avatar_image']}] if source.get('avatar_image') else [])+source['posts']
        for post in pics:
            if not post.get('image'): continue
            indices.add(post['index'])
            content += [{'type':'input_text','text':('Avatar' if post['index']==0 else 'Post')+' '+str(post['index'])},{'type':'input_image','detail':'high','image_url':'data:image/jpeg;base64,'+base64.b64encode((folder/post['image']).read_bytes()).decode()}]
        response=api('https://api.openai.com/v1/responses',{'Authorization':'Bearer '+ok,'Content-Type':'application/json'}, {'model':CONFIG['model'],'store':False,'reasoning':{'effort':'none'},'max_output_tokens':4500,'text':{'format':{'type':'json_schema','name':'creator_screen','strict':True,'schema':SCHEMA}},'input':[{'role':'system','content':POLICY},{'role':'user','content':content}]})
        text=''.join(c.get('text','') for o in response.get('output',[]) for c in o.get('content',[]) if c.get('type')=='output_text')
        if response.get('status')!='completed': raise RuntimeError('model_incomplete')
        try:
            result=json.loads(text)
        except json.JSONDecodeError:
            (folder/'model-output.txt').write_text(text,encoding='utf-8')
            result=json.JSONDecoder().raw_decode(text[text.index('{'):])[0]
        assert len(result['criteria'])==8 and {c['criterion'] for c in result['criteria']}==set(CRITERIA)
        for c in result['criteria']:
            early={i for i in indices if 1<=i<=12}
            allowed=early if c['criterion'] in ('small_dog','owner_visible','fit_body') else early|({0}&indices)
            if c['status']=='pass' and c['criterion']!='USA' and (not set(c['evidence_posts']) or not set(c['evidence_posts'])<=allowed):
                c['status']='unknown';c['explanation']='前12条的有效肯定证据不足；第13–24条不能补足通过条件。'+c['explanation']
            if c['criterion']=='USA' and c['status']=='pass' and any(i>12 for i in c['evidence_posts']):
                c['status']='unknown';c['explanation']='肯定所在地的依据超出前12条，按所在地未知处理。'
        vals={c['criterion']:c['status'] for c in result['criteria']}
        result['selected']=int(result['account_type']!='brand' and vals['USA']!='fail' and all(vals[k]=='pass' for k in CRITERIA if k!='USA'))
        result['avatar_used']=bool(source.get('avatar_image'));result['preview_count']=len(indices-{0});result['usage']=response.get('usage',{})
        result['source_date']=source.get('retrieved_at','');save(result_path,result)
        return name,result
    except Exception as exc:
        result={'selected':0,'error':str(exc)[:100] if isinstance(exc,RuntimeError) else type(exc).__name__}
        save(folder/'error.json',result);return name,result

