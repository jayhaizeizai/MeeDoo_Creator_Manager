import test from 'node:test';
import assert from 'node:assert/strict';
import {Store} from '../lib/store.mjs';
import {discoverBatches} from '../lib/discover-batches.mjs';
const a={tenant_key:'t',open_id:'jay',name:'Jay',role:'admin'};
const input={name:'New batch',keywords:['Dog mom','dog-mom','me and my dog'],platforms:['tiktok','instagram'],request_id:'1234567890123456',limit:1000000};
test('batch is atomic, idempotent, deduplicates history and protects tenant boundaries',()=>{
 const s=new Store(),b=discoverBatches(s),r=b.create(a,input);assert.equal(r.keywords,2);assert.equal(r.skipped.length,1);assert.equal(r.items[0].search_state.tiktok.provider,'tikhub');assert.equal(b.create(a,input).id,r.id);
 assert.throws(()=>b.detail({...a,tenant_key:'other'},r.id),e=>e.status===404);assert.throws(()=>b.detail({...a,role:'operator',open_id:'other'},r.id),e=>e.status===404);assert.throws(()=>b.create({...a,role:'reviewer'},input),e=>e.status===403);
 assert.throws(()=>b.create(a,{...input,request_id:'2234567890123456'}),e=>e.code==='no_new_keywords');
 assert.throws(()=>b.create(a,{...input,keywords:['new'],request_id:'3234567890123456',list_id:'missing'}));assert.equal(b.list(a).length,1);s.close();
});
test('retry retains completed assessments, resets only errors, exports selected and all',()=>{
 const s=new Store(),b=discoverBatches(s),r=b.create(a,input),jid=r.items[0].id;
 s.db.prepare("UPDATE discover_jobs SET state='completed' WHERE id=?").run(jid);
 for(const [h,status,selected] of [['yes','done',1],['no','done',0],['broken','error',0]])s.db.prepare('INSERT INTO discover_candidates(job_id,account_key,platform,handle,status,selected,result_json,error) VALUES(?,?,?,?,?,?,?,?)').run(jid,'tiktok--'+h,'tiktok',h,status,selected,JSON.stringify({summary:'Reason, with newline\nmore'}),status==='error'?'http_403':null);
 assert.match(b.csv(a,r.id),/@no/);assert.doesNotMatch(b.csv(a,r.id,true),/@no/);assert.match(b.csv(a,r.id,true),/@yes/);
 const x=b.retry(a,r.id);assert.equal(x.retried,1);assert.equal(x.passed,1);assert.equal(x.errors,0);assert.equal(s.db.prepare("SELECT status FROM discover_candidates WHERE handle='yes'").get().status,'done');assert.equal(s.db.prepare("SELECT status FROM discover_candidates WHERE handle='broken'").get().status,'pending');s.close();
});
