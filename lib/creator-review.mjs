import {readFile,realpath} from 'node:fs/promises';
import path from 'node:path';
import {fail} from './store.mjs';
import {creatorLists} from './creator-lists.mjs';
import {canRead} from './domain.mjs';
export const defaultReviewList='de1b31bf-d3f7-4c3d-80e1-40a1b9dc160c';
export function creatorReview(store,env={}){
 const db=store.db,lists=creatorLists(store),root=env.DISCOVER_DATA_DIR||'/var/lib/meedoo-creator/discover';
 db.exec('CREATE TABLE IF NOT EXISTS creator_review_scores(tenant TEXT NOT NULL,list_id TEXT NOT NULL,account_key TEXT NOT NULL,reviewer TEXT NOT NULL,score INTEGER NOT NULL CHECK(score BETWEEN 0 AND 10),updated_at TEXT NOT NULL,PRIMARY KEY(tenant,list_id,account_key,reviewer))');
 function candidates(actor,listId,account=null){
  if(actor.role==='reviewer'&&listId!==defaultReviewList)fail(404,'not_found');
  const list=actor.role==='reviewer'?store.get(listId,actor.tenant_key):lists.get(actor,listId);
  if(list.kind!=='creator_lists'||list.archived)fail(404,'not_found');
  const members=new Set(list.creator_ids||[]);
  return {list,rows:db.prepare('SELECT c.*,j.owner,j.tenant FROM discover_candidates c JOIN discover_jobs j ON j.id=c.job_id WHERE j.list_id=? AND j.tenant=? AND c.selected=1 AND (? IS NULL OR c.account_key=?) ORDER BY c.account_key,j.created_at DESC').all(listId,actor.tenant_key,account,account).filter((r,i,a)=>(actor.role==='reviewer'||canRead(actor,r))&&members.has(r.creator_id)&&a.findIndex(x=>x.account_key===r.account_key)===i)};
 }
 function get(actor,listId){const {list,rows}=candidates(actor,listId);const scores=new Map(db.prepare('SELECT * FROM creator_review_scores WHERE tenant=? AND list_id=? AND reviewer=?').all(actor.tenant_key,listId,actor.open_id).map(r=>[r.account_key,r]));return {id:listId,name:list.name,items:rows.map(c=>{
  const s=JSON.parse(c.source_json||'{}'),p=s.profile||{},rating=scores.get(c.account_key);
  const media=file=>file&&/^post-\d{2}\.jpg$/.test(file)?`/api/creator-review/${listId}/image?account=${encodeURIComponent(c.account_key)}&file=${file}`:null;
  return {key:c.account_key,handle:c.handle,name:p.full_name||p.nickname||p.nickName||c.handle,platform:c.platform,url:c.platform==='tiktok'?`https://www.tiktok.com/@${encodeURIComponent(c.handle)}`:`https://www.instagram.com/${encodeURIComponent(c.handle)}/`,avatar:media(s.avatar_image),posts:(s.posts||[]).slice(0,24).map(p=>({index:p.index,image:media(p.image)})),score:rating?.score??null,updated_at:rating?.updated_at??null};
 })};}
 function score(actor,listId,input){if(input.scale!=='five-v1')fail(409,'score_scale_changed','评分标准已更新，请刷新页面后重新评分');if(!['admin','operator','reviewer'].includes(actor.role))fail(403,'read_only');if(!Number.isInteger(input.score)||input.score<1||input.score>5)fail(422,'invalid_score');const {rows}=candidates(actor,listId,input.account);if(!rows.some(c=>c.account_key===input.account))fail(404,'not_found');const at=new Date().toISOString();db.prepare('INSERT INTO creator_review_scores VALUES(?,?,?,?,?,?) ON CONFLICT(tenant,list_id,account_key,reviewer) DO UPDATE SET score=excluded.score,updated_at=excluded.updated_at').run(actor.tenant_key,listId,input.account,actor.open_id,input.score,at);return {score:input.score,updated_at:at};}
 async function image(actor,listId,account,file){const {rows}=candidates(actor,listId,account),c=rows.find(r=>r.account_key===account);if(!c||!/^post-\d{2}\.jpg$/.test(file||'')||! /^[a-z0-9_-]+$/i.test(c.job_id)||! /^(tiktok|instagram)--[a-z0-9_.]+$/i.test(account))fail(404,'not_found');const s=JSON.parse(c.source_json||'{}');if(![s.avatar_image,...(s.posts||[]).slice(0,24).map(p=>p.image)].includes(file))fail(404,'not_found');try{const base=await realpath(root),full=await realpath(path.join(base,c.job_id,account,file));if(!full.startsWith(base+path.sep))fail(404,'not_found');return await readFile(full);}catch{fail(404,'image_unavailable');}}
 return {get,score,image};
}
