import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createBackend} from '../lib/api.mjs';
test('mailbox lists all pages with search, filters and owner/tenant isolation without returning bodies',async()=>{
 const backend=createBackend({APP_ORIGIN:'https://example.test',WORK_EMAIL:'work@example.test'});
 const actor={role:'admin',open_id:'a',tenant_key:'t'};
 try{for(let i=0;i<125;i++)backend.store.write(actor,'mail_threads',{subject:'Message '+i,classification:'unreviewed',messages:[{from:'Jane <jane@example.test>',to:'work@example.test',body:'private text '+i,at:String(i),labels:i%2?['INBOX','UNREAD']:['SENT']}],fingerprint:String(i)});
 backend.store.write({...actor,tenant_key:'other'},'mail_threads',{subject:'Other tenant',messages:[]});
 async function get(query='',user=actor){let result;await backend.handle({method:'GET',headers:{}},{},new URL('https://example.test/api/mail_threads'+query),{user},(status,data)=>{result={status,data};});return result;}
 const first=await get();assert.equal(first.status,200);assert.equal(first.data.total,125);assert.equal(first.data.items.length,50);assert.equal(first.data.items[0].subject,'Message 124');assert.equal(first.data.items[0].messages,undefined);
 assert.equal((await get('?offset=100')).data.items.length,25);
 assert.equal((await get('?q=Message%20124')).data.total,1);
 assert.equal((await get('?filter=unread')).data.total,62);
 assert.equal((await get('',{...actor,role:'operator',open_id:'b'})).data.total,0);
 }finally{backend.store.close();}
});

test('Agent queue excludes completed and passive suggestions; review is owner-bound, versioned and never sends',async()=>{
 const backend=createBackend({APP_ORIGIN:'https://example.test'}),a={role:'admin',open_id:'a',tenant_key:'t'};
 try{backend.store.write(a,'tasks',{title:'Open task',status:'open'});backend.store.write(a,'tasks',{title:'Done',status:'done'});
 const r=backend.store.write(a,'agent_runs',{status:'suggestion',action:'decision_required',summary:'Review this'});
 backend.store.write(a,'agent_runs',{status:'suggestion',action:'wait'});
 async function call(path,method='GET',user=a,version=1){let result;const req={method,headers:{origin:'https://example.test','x-csrf-token':'csrf','content-type':'application/json'},async *[Symbol.asyncIterator](){yield Buffer.from(JSON.stringify({version}));}};await backend.handle(req,{},new URL('https://example.test/api/'+path),{user,csrf:'csrf'},(status,data)=>result={status,data});return result;}
 assert.equal((await call('agent_queue')).data.items.length,2);
 assert.equal((await call('agent_runs/'+r.id+'/review','POST',{...a,role:'operator',open_id:'b'})).status,404);
 assert.equal((await call('agent_runs/'+r.id+'/review','POST')).status,200);
 assert.equal((await call('agent_queue')).data.items.length,1);
 assert.equal((await call('agent_runs/'+r.id+'/review','POST')).status,409);
 }finally{backend.store.close();}
});
import {hydrateThread} from '../lib/mail-content.mjs';
test('HTML extraction decodes entities, preserves paragraphs and excludes executable content',()=>{const t=hydrateThread({messages:[{html_body:'<style>hide me</style><script>bad()</script><p>Hello &amp; welcome</p><p>Next &eacute; &#x1F436;</p>'}]});assert.equal(t.body_ready,true);assert.match(t.messages[0].body,/Hello & welcome/);assert.match(t.messages[0].body,/Next é 🐶/);assert.doesNotMatch(t.messages[0].body,/bad|hide me|<p>/);});
test('workspace read state is user-scoped, survives refresh and resets for new messages',async()=>{const backend=createBackend({APP_ORIGIN:'https://test.example'}),a={role:'admin',open_id:'a',tenant_key:'t'};try{let t=backend.store.write(a,'mail_threads',{messages:[{id:'m1',body:'hello',labels:['UNREAD']}],subject:'hello'});async function call(path,method='GET',user=a,read=true){let out;await backend.handle({method,headers:{origin:'https://test.example','x-csrf-token':'c','content-type':'application/json'},async *[Symbol.asyncIterator](){yield Buffer.from(JSON.stringify({read}));}},{},new URL('https://test.example/api/'+path),{user,csrf:'c'},(status,data)=>out={status,data});return out;}
assert.equal((await call('mail_threads?filter=unread')).data.total,1);assert.equal((await call('mail_threads/'+t.id+'/read','POST',{...a,role:'operator',open_id:'other'})).status,404);assert.equal((await call('mail_threads/'+t.id+'/read','POST')).status,200);assert.equal((await call('mail_threads?filter=unread')).data.total,0);assert.equal((await call('mail_threads')).data.items[0].unread,false);assert.equal((await call('mail_threads?filter=unread','GET',{...a,open_id:'other'})).data.total,1);backend.store.write(a,'mail_threads',{messages:[...t.messages,{id:'m2',body:'new',labels:['UNREAD']}],subject:'hello'},{id:t.id,version:t.version});assert.equal((await call('mail_threads?filter=unread')).data.total,1);assert.equal((await call('mail_threads/'+t.id+'/read','POST',a,false)).status,200);
}finally{backend.store.close();}});
test('manual reply can be saved before AI runs and remains draft-only',async()=>{const b=createBackend({APP_ORIGIN:'https://example.test'}),user={role:'admin',open_id:'a',tenant_key:'t'};try{const t=b.store.write(user,'mail_threads',{messages:[]});let result;await b.handle({method:'POST',headers:{origin:'https://example.test','x-csrf-token':'c','content-type':'application/json'},async *[Symbol.asyncIterator](){yield Buffer.from(JSON.stringify({draft:'A manually written reply'}));}},{},new URL('https://example.test/api/mail_threads/'+t.id+'/draft'),{user,csrf:'c'},(status,data)=>result={status,data});assert.equal(result.status,201);assert.equal(result.data.created_by_ai,false);assert.equal(result.data.status,'suggestion');assert.equal(result.data.draft,'A manually written reply');}finally{b.store.close();}});
