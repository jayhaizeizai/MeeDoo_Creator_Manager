import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createApp} from '../server.mjs';
const origin='https://creator.meedoo.fun';
async function setup(run){
 const dir=mkdtempSync(join(tmpdir(),'meedoo-test-'));let identity={open_id:'admin',tenant_key:'t1',name:'Admin'};
 const env={APP_ORIGIN:origin,DB_PATH:join(dir,'test.sqlite'),LARK_APP_ID:'test',LARK_APP_SECRET:'test',LARK_ALLOWED_OPEN_IDS:'admin,operator,other',LARK_ADMIN_OPEN_IDS:'admin',LARK_ALLOWED_TENANTS:'t1,t2'};
 const provider=async url=>({ok:true,json:async()=>url.includes('/token')?{code:0,access_token:'test'}:{code:0,data:identity}});
 let server,base;
 async function start(){server=createApp(env,provider);await new Promise(r=>server.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+server.address().port;}
 async function login(open_id='admin',tenant_key='t1'){
  identity={open_id,tenant_key,name:open_id};const s=await fetch(base+'/auth/lark/start',{redirect:'manual'});const state=new URL(s.headers.get('location')).searchParams.get('state');
  const cb=await fetch(base+'/auth/lark/callback?code=test&state='+state,{redirect:'manual',headers:{cookie:s.headers.getSetCookie()[0].split(';')[0]}});
  const cookie=cb.headers.getSetCookie().find(s=>s.startsWith('__Host-meedoo_session=')).split(';')[0];const session=await fetch(base+'/api/session',{headers:{cookie}}).then(r=>r.json());
  return async(path,{method='GET',data,headers={}}={})=>{const r=await fetch(base+'/api/'+path,{method,headers:{cookie,origin,'X-CSRF-Token':session.csrf,'Content-Type':'application/json','Idempotency-Key':randomUUID(),...headers},body:data?JSON.stringify(data):undefined});return {status:r.status,data:await r.json()};};
 }
 await start();try{await run({login,restart:async()=>{await new Promise(r=>server.close(r));await start();}});}finally{await new Promise(r=>server.close(r));rmSync(dir,{recursive:true,force:true});}
}
test('records survive restart, reject stale writes and expose audit history',()=>setup(async({login,restart})=>{
 let api=await login();let r=await api('creators',{method:'POST',data:{name:'Test Creator',email:'creator@example.test'}});assert.equal(r.status,201);const id=r.data.id;
 r=await api('creators/'+id,{method:'PATCH',data:{name:'Updated',version:1}});assert.equal(r.status,200);
 assert.equal((await api('creators/'+id,{method:'PATCH',data:{name:'Lost update',version:1}})).status,409);
 assert.equal((await api('creators/'+id+'/history')).data.items.length,2);
 await restart();api=await login();assert.equal((await api('creators/'+id)).data.name,'Updated');
}));
test('tenant and owner isolation apply to reads, updates and parent references',()=>setup(async({login})=>{
 const owner=await login('operator');const r=await owner('creators',{method:'POST',data:{name:'Private'}});
 const other=await login('other');assert.equal((await other('creators')).data.total,0);
 assert.equal((await other('creators/'+r.data.id)).status,404);
 assert.equal((await other('creators/'+r.data.id,{method:'PATCH',data:{name:'overwrite',version:1}})).status,404);
 assert.equal((await other('collaborations',{method:'POST',data:{creator_id:r.data.id,name:'Test',next_action:'Review'}})).status,404);
 const foreign=await login('admin','t2');assert.equal((await foreign('creators/'+r.data.id)).status,404);
 const admin=await login();assert.equal((await admin('creators')).data.total,1);
}));
test('CSRF, overposting, role checks and idempotency prevent unsafe writes',()=>setup(async({login})=>{
 const api=await login();const input={method:'POST',data:{name:'Once'},headers:{'Idempotency-Key':'repeat-creation-123'}};
 const first=await api('creators',input),second=await api('creators',input);assert.equal(first.data.id,second.data.id);assert.equal((await api('creators')).data.total,1);
 assert.equal((await api('creators',{...input,data:{name:'Changed'}})).status,409);
 assert.equal((await api('creators',{method:'POST',data:{name:'Blocked'},headers:{origin:'https://evil.example'}})).status,403);
 assert.equal((await api('creators',{method:'POST',data:{name:'Blocked',owner:'other'}})).status,422);
 const operator=await login('operator');assert.equal((await operator('policies',{method:'POST',data:{title:'Test',body:'Test',source:'Test'}})).status,403);
}));
test('milestones cannot invent acceptance or shipping; approved policy snapshots cannot be overwritten',()=>setup(async({login})=>{
 const api=await login();const c=await api('creators',{method:'POST',data:{name:'Creator'}});
 const work=await api('collaborations',{method:'POST',data:{creator_id:c.data.id,name:'Trial',next_action:'Review'}});
 assert.equal((await api('collaborations/'+work.data.id+'/transition',{method:'POST',data:{stage:'AGREED',reason:'looks interested',version:1}})).status,409);
 assert.equal((await api('collaborations/'+work.data.id,{method:'PATCH',data:{stage:'AGREED',version:1}})).status,422);
 assert.equal((await api('agreements',{method:'POST',data:{collaboration_id:work.data.id,title:'Terms',terms:'Draft only',status:'accepted'}})).status,422);
 const p=await api('policies',{method:'POST',data:{title:'Approved',body:'Version one',source:'approved source',status:'approved'}});
 assert.equal((await api('policies/'+p.data.id,{method:'PATCH',data:{version:1,body:'Rewrite'}})).status,409);
}));
