import {fail} from './store.mjs';
import {authorize,canRead,payload} from './domain.mjs';
export function creatorLists(store){
 const get=(actor,id)=>{const r=store.get(id,actor.tenant_key);if(r.kind!=='creator_lists'||r.archived)fail(404,'not_found');authorize(actor,r);return r;};
 const members=(actor,id)=>new Set(get(actor,id).creator_ids||[]);
 function summary(actor,r,creators){const ids=new Set(r.creator_ids||[]);const items=r.id==='all'?creators:creators.filter(c=>ids.has(c.id));return {...r,count:items.length,channels:[...new Set(items.flatMap(c=>{try{const h=new URL(c.social_url).hostname;return h.includes('tiktok.com')?['TikTok']:h.includes('instagram.com')?['Instagram']:h.includes('youtube.com')||h==='youtu.be'?['YouTube']:[];}catch{return [];}}))],updated_at:[r.updated_at,...items.map(c=>c.updated_at)].filter(Boolean).sort().at(-1)};}
 return {members,get,
 list(actor,query=''){const q=String(query).trim().toLowerCase().replace(/^@/,'');const cs=store.list('creators',actor.tenant_key).filter(c=>canRead(actor,c));return [summary(actor,{id:'all',name:'All creators',created_by:'—',created_at:null},cs),...store.list('creator_lists',actor.tenant_key).filter(r=>!r.archived&&canRead(actor,r)).map(r=>summary(actor,r,cs))].filter(r=>!q||r.name.toLowerCase().includes(q)||cs.some(c=>(r.id==='all'||(r.creator_ids||[]).includes(c.id))&&[c.name,c.first_name,c.handle,c.username,c.social_url,c.email].some(v=>String(v||'').toLowerCase().includes(q))));},
 change(actor,id,action,input){return store.transaction(()=>{
 if(!['admin','operator'].includes(actor.role))fail(403,'read_only');
 const old=id?get(actor,id):null;
 if(old&&input.version!==old.version)fail(409,'version_conflict','名单已更新，请刷新后重试');
 let data=old?payload(old):{creator_ids:[],created_by:actor.name||actor.open_id};
 if(action==='members'){
 if(!Array.isArray(input.creator_ids)||!input.creator_ids.length||input.creator_ids.length>20000||!['add','remove'].includes(input.operation))fail(422,'invalid_members');
 const ids=[...new Set(input.creator_ids)];for(const cid of ids){const c=store.get(cid,actor.tenant_key);if(c.kind!=='creators')fail(422,'invalid_creator');authorize(actor,c);}
 const set=new Set(data.creator_ids);for(const cid of ids)input.operation==='add'?set.add(cid):set.delete(cid);data.creator_ids=[...set];
 }else if(action==='delete'){if(input.confirm!==true)fail(422,'confirmation_required');data.archived=true;}
 else if(action==='save'){
 const name=typeof input.name==='string'?input.name.trim():'';if(!name||name.length>100)fail(422,'invalid_name','名单名称需为 1–100 个字符');
 if(store.list('creator_lists',actor.tenant_key).some(r=>!r.archived&&r.id!==id&&r.name.toLowerCase()===name.toLowerCase()))fail(409,'duplicate_name','已有同名 List');data.name=name;
 }else fail(405,'method_not_allowed');
 return store.write(actor,'creator_lists',data,old?{id,version:old.version,owner:old.owner}:{});
 });}
 };
}
