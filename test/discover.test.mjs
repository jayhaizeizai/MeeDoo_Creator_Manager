import test from 'node:test';
import assert from 'node:assert/strict';
import {Store} from '../lib/store.mjs';
import {discover,canonical} from '../lib/discover.mjs';
const actor={tenant_key:'tenant',open_id:'user',name:'Jay',role:'admin'};
test('Discover persists all outcomes, deduplicates published creators and scopes access',()=>{
 const s=new Store(),d=discover(s);const j=d.create(actor,{query:'Fashion for Me and My Dog',limit:5000,list_name:'Key Word “Fashion for Me and My Dog” 1'});
 assert.equal(j.limit_count,5000);assert.equal(j.total,0);
 assert.throws(()=>d.create(actor,{query:'another',list_name:'x'}),e=>e.code==='discover_already_running');
 assert.throws(()=>d.get({...actor,tenant_key:'other'},j.id),e=>e.status===404);
 assert.throws(()=>d.get({...actor,role:'operator',open_id:'other'},j.id),e=>e.status===404);
 for(const [handle,selected] of [['yes',1],['no',0]])s.db.prepare("INSERT INTO discover_candidates(job_id,account_key,platform,handle,status,selected,result_json) VALUES(?,?,?,?,?,?,?)").run(j.id,'tiktok--'+handle,'tiktok',handle,'done',selected,JSON.stringify({summary:'test',criteria:[]}));
 d.publish(j.id);d.publish(j.id);assert.equal(s.list('creators','tenant').length,1);assert.equal(s.get(j.list_id,'tenant').creator_ids.length,1);
 assert.equal(d.detail(actor,j.id).total,2);assert.equal(d.detail(actor,j.id).pass_rate,.5);assert.equal(d.detail(actor,j.id).new_creators,1);
 assert.equal(d.detail(actor,j.id,0,'selected').items.length,1);assert.match(d.csv(actor,j.id),/tiktok.com\/@no/);
 s.db.prepare("UPDATE discover_jobs SET state='completed' WHERE id=?").run(j.id);
 const second=d.create(actor,{query:'same creator',list_name:'second'});s.db.prepare("INSERT INTO discover_candidates(job_id,account_key,platform,handle,status,selected,result_json) VALUES(?,?,?,?,?,?,?)").run(second.id,'tiktok--yes','tiktok','yes','done',1,'{}');d.publish(second.id);assert.equal(s.list('creators','tenant').length,1);assert.equal(d.detail(actor,second.id).new_creators,0);s.close();
});
test('Discover validates limits and profile identities',()=>{
 const s=new Store(),d=discover(s);assert.throws(()=>d.create(actor,{query:'x',limit:5001,list_name:'x'}));assert.throws(()=>d.create(actor,{query:'x',platforms:['invalid'],list_name:'x'}));
 assert.equal(canonical('https://www.tiktok.com/@Foo?x=1'),'tiktok--foo');assert.equal(canonical('https://evil.test/foo'),null);s.close();
});
