import {hydrateThread} from './mail-content.mjs';
import {createHash} from 'node:crypto';
import {Store,Problem,fail} from './store.mjs';
import {kinds,canRead,authorize,validate,transition,payload} from './domain.mjs';
import {importAction} from './imports.mjs';
import {createIntegrations} from './integrations.mjs';

async function readBody(req){
  if(!req.headers['content-type']?.startsWith('application/json'))fail(415,'json_required','请使用 JSON 请求');
  let size=0;const parts=[];for await(const part of req){size+=part.length;if(size>1024*1024)fail(413,'body_too_large','请求超过 1 MB');parts.push(part);}
  try{return JSON.parse(Buffer.concat(parts).toString('utf8'));}catch{fail(400,'invalid_json');}
}
export function createBackend(env,upstream=fetch){
  const store=new Store(env.DB_PATH||':memory:');
  store.db.exec('CREATE TABLE IF NOT EXISTS mail_reads(tenant TEXT NOT NULL,actor TEXT NOT NULL,thread TEXT NOT NULL,last_message TEXT NOT NULL,unread INTEGER NOT NULL,PRIMARY KEY(tenant,actor,thread))');
  const integrations=createIntegrations(store,env,upstream);
  async function handle(req,res,url,sess,send){
    if(!sess)return send(401,{error:'authentication_required'});
    const actor=sess.user;
    if(!actor.tenant_key)return send(401,{error:'login_again',message:'请退出后重新登录'});
    try{
      const write=!['GET','HEAD'].includes(req.method);
      if(write&&(req.headers.origin!==env.APP_ORIGIN||req.headers['x-csrf-token']!==sess.csrf))fail(403,'forbidden','请求验证失败');
      if(write&&!['admin','operator'].includes(actor.role))fail(403,'read_only');
      const segments=url.pathname.split('/').filter(Boolean).slice(1),[kind,id,action]=segments;
      if(kind==='agent_queue'&&req.method==='GET'){
        const tasks=store.list('tasks',actor.tenant_key).filter(r=>canRead(actor,r)&&r.status!=='done');
        const runs=store.list('agent_runs',actor.tenant_key).filter(r=>canRead(actor,r)&&r.status==='suggestion'&&['draft','decision_required'].includes(r.action));
        return send(200,{items:[...tasks,...runs].sort((a,b)=>(a.due_at||a.created_at).localeCompare(b.due_at||b.created_at))});
      }
      if(kind==='integrations'){
        if(req.method==='GET')return send(200,integrations.status(actor));
        if(req.method!=='POST')fail(405,'method_not_allowed');
        const input=await readBody(req);
        if(id==='google'&&action==='start')return send(200,integrations.start(sess));
        if(id==='google'&&action==='disconnect')return send(200,integrations.disconnect(actor));
        if(id==='gmail'&&action==='sync')return send(202,integrations.queue(actor));
        fail(404,'not_found');
      }
      if(['mail_threads','agent_runs'].includes(kind)){
        if(req.method==='GET'){
          if(id){const r=store.get(id,actor.tenant_key);if(r.kind!==kind)fail(404,'not_found');authorize(actor,r);return send(200,kind==='mail_threads'?hydrateThread(r):r);}
          if(kind==='mail_threads'){
            const offset=Math.max(0,Math.trunc(Number(url.searchParams.get('offset')))||0),limit=50;
            const q=(url.searchParams.get('q')||'').slice(0,200).toLowerCase(),filter=url.searchParams.get('filter')||'all';
            let where="tenant=? AND kind='mail_threads'",args=[actor.tenant_key];
            if(actor.role!=='admin'){where+=' AND owner=?';args.push(actor.open_id);}
            if(q){where+=" AND lower(json_extract(data,'$.subject') || ' ' || json_extract(data,'$.messages')) LIKE ? ESCAPE '\\'";args.push('%'+q.replace(/[\\%_]/g,'\\$&')+'%');}
            if(['unreviewed','creator','unrelated'].includes(filter)){where+=" AND json_extract(data,'$.classification')=?";args.push(filter);}
            if(filter==='unread'){where+=" AND COALESCE((SELECT unread FROM mail_reads mr WHERE mr.tenant=records.tenant AND mr.actor=? AND mr.thread=records.id AND mr.last_message=COALESCE(json_extract(records.data,'$.messages[#-1].id'),'')),EXISTS (SELECT 1 FROM json_each(json_extract(records.data,'$.messages')) m,json_each(json_extract(m.value,'$.labels')) l WHERE l.value='UNREAD'))=1";args.push(actor.open_id);}
            if(filter==='inbox')where+=" AND EXISTS (SELECT 1 FROM json_each(json_extract(records.data,'$.messages')) m,json_each(json_extract(m.value,'$.labels')) l WHERE l.value='INBOX')";
            const total=store.db.prepare('SELECT count(*) AS n FROM records WHERE '+where).get(...args).n;
            const rows=store.db.prepare("SELECT * FROM records WHERE "+where+" ORDER BY CAST(json_extract(data,'$.messages[#-1].at') AS INTEGER) DESC,id LIMIT ? OFFSET ?").all(...args,limit,offset).map(r=>store.unpack(r));
            const items=rows.map(raw=>{const r=hydrateThread(raw),readState=store.db.prepare('SELECT unread FROM mail_reads WHERE tenant=? AND actor=? AND thread=? AND last_message=?').get(actor.tenant_key,actor.open_id,r.id,r.messages.at(-1)?.id||'');const msgs=r.messages||[],last=msgs.at(-1)||{},other=[...msgs].reverse().find(m=>!m.from?.toLowerCase().includes((env.WORK_EMAIL||'@invalid').toLowerCase()));let state='未关联';if(r.collaboration_id){try{const c=store.get(r.collaboration_id,actor.tenant_key);if(canRead(actor,c))state=c.disposition||c.stage||state;}catch{}}
              return {id:r.id,subject:r.subject,classification:r.classification,complete:r.complete,contact:other?.from||last.to||last.from,message_count:msgs.length,preview:(last.body||(r.has_attachments?'附件邮件':'（无文字正文）')).replace(/\s+/g,' ').slice(0,220),at:last.at,unread:readState?!!readState.unread:msgs.some(m=>m.labels?.includes('UNREAD')),has_attachments:r.has_attachments,status:state};});
            return send(200,{items,total,offset,limit});
          }
          return send(200,{items:store.list(kind,actor.tenant_key).filter(r=>canRead(actor,r)&&(!url.searchParams.get('thread_id')||r.thread_id===url.searchParams.get('thread_id'))).slice(0,100)});
        }
        if(req.method==='POST'&&kind==='agent_runs'&&action==='draft'){
          const input=await readBody(req),r=store.get(id,actor.tenant_key);if(r.kind!==kind)fail(404,'not_found');authorize(actor,r);
          if(typeof input.draft!=='string'||input.draft.length>20000)fail(422,'invalid_draft');
          return send(200,store.transaction(()=>store.write(actor,kind,{...payload(r),original_draft:r.original_draft??r.draft,draft:input.draft,status:'suggestion',edited_at:new Date().toISOString(),edited_by:actor.open_id},{id:r.id,version:input.version,owner:r.owner,parent:r.parent})));
        }
        if(req.method==='POST'&&kind==='agent_runs'&&action==='review'){

          const input=await readBody(req),r=store.get(id,actor.tenant_key);if(r.kind!==kind)fail(404,'not_found');authorize(actor,r);
          return send(200,store.transaction(()=>store.write(actor,kind,{...payload(r),status:'reviewed',reviewed_at:new Date().toISOString(),reviewed_by:actor.open_id},{id:r.id,version:input.version,owner:r.owner,parent:r.parent})));
        }
        if(req.method!=='POST'||kind!=='mail_threads')fail(405,'method_not_allowed');
        const input=await readBody(req);
        if(action==='draft'){
          const r=store.get(id,actor.tenant_key);if(r.kind!=='mail_threads')fail(404,'not_found');authorize(actor,r);if(typeof input.draft!=='string'||input.draft.length>20000)fail(422,'invalid_draft');
          return send(201,store.write(actor,'agent_runs',{thread_id:r.id,thread_version:r.version,draft:input.draft,original_draft:input.draft,summary:'人工回复草稿',unknowns:[],source_ids:[],action:'draft',status:'suggestion',created_by_ai:false},{parent:r.id,owner:r.owner}));
        }
        if(action==='read'){
          const r=store.get(id,actor.tenant_key);if(r.kind!=='mail_threads')fail(404,'not_found');authorize(actor,r);if(typeof input.read!=='boolean')fail(422,'invalid_read_state');
          store.db.prepare('INSERT INTO mail_reads VALUES(?,?,?,?,?) ON CONFLICT(tenant,actor,thread) DO UPDATE SET last_message=excluded.last_message,unread=excluded.unread').run(actor.tenant_key,actor.open_id,r.id,r.messages?.at(-1)?.id||'',input.read?0:1);
          return send(200,{ok:true,read:input.read,scope:'workspace'});
        }
        if(action==='link')return send(200,store.transaction(()=>integrations.link(actor,id,input)));
        if(action==='reply')return send(200,await integrations.analyze(actor,id,{...input,reply:true}));
        if(action==='analyze')return send(200,await integrations.analyze(actor,id,{...input,reply:false}));
        fail(404,'not_found');
      }
      if(kind==='imports'){
        if(actor.role!=='admin')fail(403,'admin_required');
        if(req.method==='GET')return send(200,{items:store.list('imports',actor.tenant_key)});
        if(req.method!=='POST')fail(405,'method_not_allowed');
        const input=await readBody(req);return send(200,store.transaction(()=>importAction(store,actor,id==='preview'?'preview':action,id,input)));
      }
      if(req.method==='GET'&&kind==='workspace'){
        const counts=Object.fromEntries(kinds.map(k=>[k,store.list(k,actor.tenant_key).filter(r=>canRead(actor,r)).length]));
        return send(200,{counts,storage:env.DB_PATH?'persistent':'temporary',integrations:{lark:'connected',gmail:'not_connected',ai:'not_connected',clickwrap:'not_configured'},work_email:env.WORK_EMAIL||'',stages:['NEW_LEAD','REPLIED','INTERESTED']});
      }
      if(!kinds.includes(kind))fail(404,'not_found');
      if(req.method==='GET'){
        if(id){const r=store.get(id,actor.tenant_key);if(r.kind!==kind)fail(404,'not_found');authorize(actor,r);return send(200,action==='history'?{items:store.history(id,actor.tenant_key)}:r);}
        const q=(url.searchParams.get('q')||'').toLowerCase();const offset=Math.max(0,Number(url.searchParams.get('offset'))||0);const limit=Math.min(100,Math.max(1,Number(url.searchParams.get('limit'))||50));
        const items=store.list(kind,actor.tenant_key).filter(r=>canRead(actor,r)&&(!url.searchParams.get('parent')||r.parent===url.searchParams.get('parent'))&&(!q||[r.name,r.title,r.email,r.sku,r.social_url].some(v=>v?.toLowerCase().includes(q))));
        return send(200,{items:items.slice(offset,offset+limit),total:items.length,offset,limit});
      }
      if(!['POST','PATCH'].includes(req.method))fail(405,'method_not_allowed');
      const input=await readBody(req);const key=req.headers['idempotency-key'];
      if(req.method==='POST'&&(!key||!/^[a-zA-Z0-9_-]{8,100}$/.test(key)))fail(422,'idempotency_required');
      const fingerprint=createHash('sha256').update(req.method+url.pathname+JSON.stringify(input)).digest('hex');
      const result=store.transaction(()=>{
        if(key){const prior=store.db.prepare('SELECT * FROM idempotency WHERE tenant=? AND actor=? AND key=?').get(actor.tenant_key,actor.open_id,key);if(prior){if(prior.fingerprint!==fingerprint)fail(409,'idempotency_conflict');return JSON.parse(prior.result);}}
        let r;
        if(id){const old=store.get(id,actor.tenant_key);if(old.kind!==kind)fail(404,'not_found');authorize(actor,old);if(action==='transition'&&req.method==='POST')r=transition(store,actor,old,input);else{
          if(req.method!=='PATCH'||action)fail(405,'method_not_allowed');
          const v=validate(kind,input,actor,store,old);r=store.write(actor,kind,v.data,{...v,id,version:input.version});
        }}else{if(req.method!=='POST')fail(405,'method_not_allowed');const v=validate(kind,input,actor,store);r=store.write(actor,kind,v.data,v);}
        if(key)store.db.prepare('INSERT INTO idempotency VALUES(?,?,?,?,?)').run(actor.tenant_key,actor.open_id,key,fingerprint,JSON.stringify(r));return r;
      });
      return send(req.method==='POST'?201:200,result);
    }catch(e){if(e instanceof Problem)return send(e.status,{error:e.code,message:e.message});return send(500,{error:'internal_error',message:'保存失败，请重试；原数据未被覆盖'});}
  }
  return {handle,store,integrations};
}
