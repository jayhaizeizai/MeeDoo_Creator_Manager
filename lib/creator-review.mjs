import {readFile,realpath} from 'node:fs/promises';
import path from 'node:path';
import {fail} from './store.mjs';
import {creatorLists} from './creator-lists.mjs';
import {canRead} from './domain.mjs';
export const defaultReviewList='de1b31bf-d3f7-4c3d-80e1-40a1b9dc160c';
export function creatorReview(store,env={}){
 const db=store.db,lists=creatorLists(store),root=env.DISCOVER_DATA_DIR||'/var/lib/meedoo-creator/discover';
 db.exec('CREATE TABLE IF NOT EXISTS creator_review_scores(tenant TEXT NOT NULL,list_id TEXT NOT NULL,account_key TEXT NOT NULL,reviewer TEXT NOT NULL,score INTEGER NOT NULL CHECK(score BETWEEN 0 AND 10),updated_at TEXT NOT NULL,PRIMARY KEY(tenant,list_id,account_key,reviewer))');
 const assignments=JSON.parse(env.REVIEW_LIST_ASSIGNMENTS||'{}');
 const assignedList=actor=>assignments[actor.open_id]||defaultReviewList;
 function candidates(actor,listId,account=null){
  if(actor.role==='reviewer'&&listId!==defaultReviewList&&listId!==assignedList(actor))fail(404,'not_found');
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
 function records(actor,filter={}){
  if(actor.role!=='admin')fail(403,'admin_required');
  const names={'ou_e2f22ea7b693a591f5c7a888e83dca23':'Albert Liang','ou_bc237e1ed4c34bfba53b85932558bded':'Albert Liang','ou_a5d7d0bf848c6b227f379cdac8efc646':'Sunny Li','ou_3da8289aea07b4b214490f2cc49fdbf6':'Jay Lee'};
  const scores=filter.scores?String(filter.scores).split(',').map(Number):[],reviewers=filter.reviewers?String(filter.reviewers).split(','):[];
  if(scores.some(n=>!Number.isInteger(n)||n<1||n>5))fail(422,'invalid_score');
  const from=filter.from?Date.parse(filter.from):null,to=filter.to?Date.parse(filter.to):null;
  if((from!==null&&!Number.isFinite(from))||(to!==null&&!Number.isFinite(to))||(from!==null&&to!==null&&from>=to))fail(422,'invalid_dates','请选择有效日期范围');
  const all=db.prepare(`SELECT r.*,c.creator_id FROM creator_review_scores r JOIN discover_jobs j ON j.list_id=r.list_id AND j.tenant=r.tenant JOIN discover_candidates c ON c.job_id=j.id AND c.account_key=r.account_key WHERE r.tenant=? AND c.creator_id IS NOT NULL ORDER BY r.updated_at DESC`).all(actor.tenant_key);
  const seen=new Set(),rows=[];
  for(const r of all){const key=[r.list_id,r.account_key,r.reviewer].join('|');if(seen.has(key))continue;seen.add(key);const creator=store.get(r.creator_id,actor.tenant_key),list=store.get(r.list_id,actor.tenant_key);if(!canRead(actor,creator))continue;rows.push({...r,name:creator.name,handle:r.account_key.split('--').slice(1).join('--'),url:creator.social_url,list_name:list.name,reviewer_name:names[r.reviewer]||r.reviewer});}
  return {reviewers:[...new Map(rows.map(r=>[r.reviewer,{id:r.reviewer,name:r.reviewer_name}])).values()],items:rows.filter(r=>(!scores.length||scores.includes(r.score))&&(!reviewers.length||reviewers.includes(r.reviewer))&&(from===null||Date.parse(r.updated_at)>=from)&&(to===null||Date.parse(r.updated_at)<to))};
 }
 function addRecords(actor,input){const result=records(actor,input.filter||{}),ids=[...new Set(result.items.map(r=>r.creator_id))];if(!ids.length)fail(422,'empty_selection','没有符合筛选的账号');const list=lists.get(actor,input.list_id),before=new Set(list.creator_ids||[]);const updated=lists.change(actor,list.id,'members',{version:list.version,operation:'add',creator_ids:ids});return {count:ids.length,added:ids.filter(id=>!before.has(id)).length,list_name:updated.name};}
 return {get,score,image,records,addRecords,defaultList:assignedList};
}
