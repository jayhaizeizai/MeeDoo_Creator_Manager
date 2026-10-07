import {createHash} from 'node:crypto';
import {Store,Problem,fail} from './store.mjs';
import {kinds,canRead,authorize,validate,transition} from './domain.mjs';
import {importAction} from './imports.mjs';
import {createIntegrations} from './integrations.mjs';

async function readBody(req){
  if(!req.headers['content-type']?.startsWith('application/json'))fail(415,'json_required','请使用 JSON 请求');
  let size=0;const parts=[];for await(const part of req){size+=part.length;if(size>1024*1024)fail(413,'body_too_large','请求超过 1 MB');parts.push(part);}
  try{return JSON.parse(Buffer.concat(parts).toString('utf8'));}catch{fail(400,'invalid_json');}
}
export function createBackend(env,upstream=fetch){
  const store=new Store(env.DB_PATH||':memory:');
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
      if(kind==='integrations'){
        if(req.method==='GET')return send(200,integrations.status(actor));
        if(req.method!=='POST')fail(405,'method_not_allowed');
        const input=await readBody(req);
        if(id==='google'&&action==='start')return send(200,integrations.start(sess));
        if(id==='google'&&action==='disconnect')return send(200,integrations.disconnect(actor));
        if(id==='gmail'&&action==='sync')return send(200,await integrations.sync(actor,input));
        fail(404,'not_found');
      }
      if(['mail_threads','agent_runs'].includes(kind)){
        if(req.method==='GET'){
          if(id){const r=store.get(id,actor.tenant_key);if(r.kind!==kind)fail(404,'not_found');authorize(actor,r);return send(200,r);}
          return send(200,{items:store.list(kind,actor.tenant_key).filter(r=>canRead(actor,r)).slice(0,100)});
        }
        if(req.method!=='POST'||kind!=='mail_threads')fail(405,'method_not_allowed');
        const input=await readBody(req);
        if(action==='link')return send(200,store.transaction(()=>integrations.link(actor,id,input)));
        if(action==='analyze')return send(200,await integrations.analyze(actor,id,input));
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
