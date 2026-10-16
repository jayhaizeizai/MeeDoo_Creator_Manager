import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Store} from '../lib/store.mjs';
import {discover} from '../lib/discover.mjs';
import {creatorReview,defaultReviewList} from '../lib/creator-review.mjs';
test('Review scopes images and scores, accepts zero, persists revisions without changing selection',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'review-'));const s=new Store();
 try{
 const a={tenant_key:'t',open_id:'u',role:'admin'},d=discover(s),j=d.create(a,{query:'x',list_name:'review'});
 s.db.prepare('INSERT INTO discover_candidates(job_id,account_key,platform,handle,status,selected,result_json,source_json) VALUES(?,?,?,?,?,?,?,?)').run(j.id,'tiktok--alice','tiktok','alice','done',1,'{}',JSON.stringify({profile:{nickname:'Alice'},avatar_image:'post-00.jpg',posts:[{index:1,image:'post-01.jpg'}]}));d.publish(j.id);
 const r=creatorReview(s,{DISCOVER_DATA_DIR:root});await mkdir(path.join(root,j.id,'tiktok--alice'),{recursive:true});await writeFile(path.join(root,j.id,'tiktok--alice','post-01.jpg'),'test-image');
 assert.equal(r.get(a,j.list_id).items[0].score,null);r.score(a,j.list_id,{account:'tiktok--alice',score:0});assert.equal(r.get(a,j.list_id).items[0].score,0);
 r.score(a,j.list_id,{account:'tiktok--alice',score:10});assert.equal(r.get(a,j.list_id).items[0].score,10);
 for(const score of [-1,11,1.5,'5',null])assert.throws(()=>r.score(a,j.list_id,{account:'tiktok--alice',score}));
 assert.equal(r.get({...a,open_id:'admin2'},j.list_id).items[0].score,null);
 assert.throws(()=>r.get({...a,tenant_key:'other'},j.list_id));assert.throws(()=>r.get({...a,role:'operator',open_id:'other'},j.list_id));
 assert.throws(()=>r.score(a,j.list_id,{account:'tiktok--no',score:3}));
 assert.equal(String(await r.image(a,j.list_id,'tiktok--alice','post-01.jpg')),'test-image');
 await assert.rejects(r.image(a,j.list_id,'tiktok--alice','../../secret'));await assert.rejects(r.image(a,j.list_id,'tiktok--alice','post-02.jpg'));
 assert.equal(d.detail(a,j.id).passed,1);
 s.db.prepare('UPDATE records SET id=? WHERE id=?').run(defaultReviewList,j.list_id);
 s.db.prepare('UPDATE discover_jobs SET list_id=? WHERE id=?').run(defaultReviewList,j.id);
 const reviewer={tenant_key:'t',open_id:'sunny',role:'reviewer'};
 assert.equal(r.get(reviewer,defaultReviewList).items.length,1);
 r.score(reviewer,defaultReviewList,{account:'tiktok--alice',score:7});
 assert.equal(r.get(reviewer,defaultReviewList).items[0].score,7);
 assert.equal(r.get({...reviewer,open_id:'albert'},defaultReviewList).items[0].score,null);
 assert.throws(()=>r.get({...reviewer,tenant_key:'elsewhere'},defaultReviewList));
 assert.throws(()=>r.get(reviewer,j.list_id));
 }finally{s.close();await rm(root,{recursive:true,force:true});}
});
