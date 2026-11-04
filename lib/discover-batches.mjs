import {randomUUID} from 'node:crypto';
import {fail} from './store.mjs';
import {canRead} from './domain.mjs';
import {creatorLists} from './creator-lists.mjs';
import {discover,ruleVersion} from './discover.mjs';
export const keywordKey=s=>s.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
export function discoverBatches(store){
 const db=store.db,d=discover(store);
 db.exec(`CREATE TABLE IF NOT EXISTS discover_batches(id TEXT PRIMARY KEY,tenant TEXT NOT NULL,owner TEXT NOT NULL,name TEXT NOT NULL,list_id TEXT NOT NULL,created_at TEXT NOT NULL,request_id TEXT NOT NULL,UNIQUE(tenant,owner,request_id));
 CREATE TABLE IF NOT EXISTS discover_batch_jobs(batch_id TEXT NOT NULL,job_id TEXT PRIMARY KEY,ordinal INTEGER NOT NULL);
 CREATE INDEX IF NOT EXISTS discover_batch_members ON discover_batch_jobs(batch_id);
 CREATE TABLE IF NOT EXISTS discover_exclusions(job_id TEXT NOT NULL,account_key TEXT NOT NULL,reason TEXT NOT NULL,PRIMARY KEY(job_id,account_key));
 CREATE INDEX IF NOT EXISTS discover_candidate_account ON discover_candidates(account_key);
 CREATE INDEX IF NOT EXISTS discover_hit_account ON discover_hits(account_key);
 CREATE INDEX IF NOT EXISTS discover_exclusion_account ON discover_exclusions(account_key);`);
 const get=(actor,id)=>{const b=db.prepare('SELECT * FROM discover_batches WHERE id=? AND tenant=?').get(id,actor.tenant_key);if(!b||!canRead(actor,b))fail(404,'not_found');return b;};
 function jobs(b){return db.prepare('SELECT j.* FROM discover_jobs j JOIN discover_batch_jobs m ON m.job_id=j.id WHERE m.batch_id=? ORDER BY m.ordinal').all(b.id).map(j=>{const v=d.stats(j);return {...v,excluded:db.prepare('SELECT count(*) n FROM discover_exclusions WHERE job_id=?').get(j.id).n};});}
 function detail(actor,id){const b=get(actor,id),items=jobs(b),s={total:0,processed:0,passed:0,errors:0,raw_results:0,excluded:0,in_list:0};for(const j of items)for(const k in s)s[k]+=j[k]||0;const complete=items.filter(j=>['completed','partial','failed'].includes(j.state)).length;return {...b,...s,list_name:store.get(b.list_id,actor.tenant_key).name,items,keywords:items.length,finished:complete,state:complete<items.length?'running':items.some(j=>j.state!=='completed'||j.errors||j.error)?'partial':'completed',pass_rate:s.total?s.passed/s.total:0};}
 function create(actor,input){
  if(!['admin','operator'].includes(actor.role))fail(403,'read_only');
  const raw=typeof input.keywords==='string'?input.keywords.split(/\r?\n/):input.keywords;
  if(!Array.isArray(raw)||!raw.length||raw.length>500||raw.some(k=>typeof k!=='string'||k.trim().length>200))fail(422,'invalid_keywords','每行一个关键词，最多 500 个，每个最多 200 字');
  const name=String(input.name||'').trim(),platforms=input.platforms,limit=input.limit??1000000;
  if(!name||name.length>100||!Array.isArray(platforms)||!platforms.length||platforms.some(p=>!['tiktok','instagram'].includes(p))||!Number.isInteger(limit)||limit<1||limit>1000000)fail(422,'invalid_batch','请填写批次名称、平台及有效上限');
  if(typeof input.request_id!=='string'||!/^[a-zA-Z0-9-]{16,80}$/.test(input.request_id))fail(422,'request_id_required');
  return store.transaction(()=>{
   const prior=db.prepare('SELECT id FROM discover_batches WHERE tenant=? AND owner=? AND request_id=?').get(actor.tenant_key,actor.open_id,input.request_id);if(prior)return {...detail(actor,prior.id),reused:true};
   const seen=new Set(db.prepare('SELECT query FROM discover_jobs WHERE tenant=?').all(actor.tenant_key).map(x=>keywordKey(x.query.replace(/^keywords\d+-\d+:/,'')))),accepted=[],skipped=[];
   for(const v of raw){const q=v.trim(),k=keywordKey(q);if(!k)continue;if(seen.has(k)){skipped.push(q);continue;}seen.add(k);accepted.push(q);}
   if(!accepted.length)fail(422,'no_new_keywords','这些关键词已经搜索过，请添加新的关键词');
   let list;if(input.list_id)list=creatorLists(store).get(actor,input.list_id);else{const n=String(input.list_name||name).trim();if(!n||n.length>100)fail(422,'invalid_list');list=store.list('creator_lists',actor.tenant_key).find(x=>!x.archived&&x.name===n&&canRead(actor,x))||store.write(actor,'creator_lists',{name:n,creator_ids:[],created_by:actor.name||actor.open_id});}
   const id=randomUUID(),at=new Date().toISOString();db.prepare('INSERT INTO discover_batches VALUES(?,?,?,?,?,?,?)').run(id,actor.tenant_key,actor.open_id,name,list.id,at,input.request_id);
   accepted.forEach((query,i)=>{const jid=randomUUID(),state=Object.fromEntries([...new Set(platforms)].map(p=>[p,{provider:'tikhub',cursor:null,done:false,pages:0,results:0,empty_new_pages:0,requests:0}]));db.prepare('INSERT INTO discover_jobs(id,tenant,owner,actor_json,query,platforms,limit_count,list_id,state,rule_version,search_state,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').run(jid,actor.tenant_key,actor.open_id,JSON.stringify(actor),query,JSON.stringify([...new Set(platforms)]),limit,list.id,'queued',ruleVersion,JSON.stringify(state),at,at);db.prepare('INSERT INTO discover_batch_jobs VALUES(?,?,?)').run(id,jid,i);});
   store.audit(actor,'discover_batch_created',id,null,{keywords:accepted.length,skipped:skipped.length,list_id:list.id,platforms,limit});return {...detail(actor,id),skipped};
  });
 }
 function retry(actor,id){const b=get(actor,id);if(!['admin','operator'].includes(actor.role))fail(403,'read_only');let retried=0;for(const j of jobs(b))if(['completed','partial','failed'].includes(j.state)&&(j.errors||j.state!=='completed'||j.error)){d.retry(actor,j.id);retried++;}store.audit(actor,'discover_batch_retry',id,null,{retried});return {...detail(actor,id),retried};}
 function csv(actor,id,selected=false){const b=get(actor,id),cell=v=>'"'+String(v??'').replace(/^[=+@-]/,"'$&").replaceAll('"','""')+'"';let lines=[];for(const j of jobs(b)){const data=d.csv(actor,j.id).replace(/^\uFEFF/,'');if(!lines.length)lines.push('"keyword",'+data.slice(0,data.indexOf('\r\n')));const rows=db.prepare('SELECT * FROM discover_candidates WHERE job_id=?'+(selected?' AND selected=1':'')+' ORDER BY account_key').all(j.id);for(const c of rows){const r=JSON.parse(c.result_json||'{}'),s=JSON.parse(c.source_json||'{}');lines.push([j.query,c.platform,`https://www.${c.platform==='tiktok'?'tiktok.com/@':'instagram.com/'}${c.handle}`,c.selected,c.status,c.error||r.summary||'',(s.posts||[]).filter(p=>p.image).length,c.creator_id||'',c.new_creator,JSON.stringify(r.criteria||[]),j.rule_version,r.followers??'',r.followers_checked_at||''].map(cell).join(','));}}return '\uFEFF'+lines.join('\r\n')+'\r\n';}
 return {create,detail,retry,csv,list(actor){return db.prepare('SELECT * FROM discover_batches WHERE tenant=? ORDER BY created_at DESC LIMIT 100').all(actor.tenant_key).filter(b=>canRead(actor,b)).map(b=>detail(actor,b.id));}};
}
