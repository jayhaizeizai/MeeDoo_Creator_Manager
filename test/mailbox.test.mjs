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
