import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Store} from '../lib/store.mjs';
import {parseCSV,importAction} from '../lib/imports.mjs';
const actor={open_id:'admin',tenant_key:'t1',role:'admin'};
test('CSV handles quoted line breaks, BOM, empty values and rejects broken quoting',()=>{
 const p=parseCSV('\uFEFFname,email\r\n"A\nB",\r\n');assert.equal(p.rows[0].name,'A\nB');assert.equal(p.rows[0].email,'');
 assert.throws(()=>parseCSV('name,email\n"broken,x'));assert.throws(()=>parseCSV('name,name\na,b'));
});
test('imports are reviewed, repeatable without duplicates and never overwrite existing fields',()=>{
 const s=new Store();try{
 const csv='name,email,social_url,人种\nOne,note not email,https://www.tiktok.com/@one?lang=en,excluded\nOther,,https://tiktok.com/@one,excluded';
 const b=s.transaction(()=>importAction(s,actor,'preview',null,{csv}));assert.equal(b.items[0].email,'');assert.ok(b.items[1].issues.includes('本批次重复账号'));assert.ok(!JSON.stringify(b).includes('excluded'));
 assert.equal(importAction(s,actor,'preview',null,{csv}).id,b.id);
 const decisions=[{row:2,action:'create',confirm:true},{row:3,action:'skip'}];
 s.transaction(()=>importAction(s,actor,'commit',b.id,{decisions}));s.transaction(()=>importAction(s,actor,'commit',b.id,{decisions}));assert.equal(s.list('creators','t1').length,1);
 const r=s.list('creators','t1')[0];s.write(actor,'creators',{name:'Manual'},{id:r.id,version:1});
 assert.throws(()=>s.transaction(()=>importAction(s,actor,'rollback',b.id,{})),e=>e.code==='rollback_conflict');assert.equal(s.get(r.id,'t1').name,'Manual');
 }finally{s.close();}
});
test('failed batch is atomic and rollback never removes later collaboration history',()=>{
 const s=new Store();try{
 const b=importAction(s,actor,'preview',null,{csv:'name,email\nOne,one@example.test\nTwo,two@example.test'});
 assert.throws(()=>s.transaction(()=>importAction(s,actor,'commit',b.id,{decisions:[{row:2,action:'create'},{row:3,action:'invalid'}]})));
 assert.equal(s.list('creators','t1').length,0);
 const committed=s.transaction(()=>importAction(s,actor,'commit',b.id,{decisions:[{row:2,action:'create'},{row:3,action:'skip'}]}));
 s.write(actor,'collaborations',{name:'History'},{parent:committed.created_ids[0]});
 assert.throws(()=>s.transaction(()=>importAction(s,actor,'rollback',b.id,{})),e=>e.code==='rollback_conflict');
 }finally{s.close();}
});
