import fs from 'node:fs';
import {randomUUID} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import assert from 'node:assert/strict';
import {Store} from '../lib/store.mjs';
import {discover,ruleVersion} from '../lib/discover.mjs';
const root='/var/lib/meedoo-creator/discover/keywords16-20261022',manifest=root+'/screening.json';
assert(!fs.existsSync(manifest),'Already scheduled');
const sources=JSON.parse(fs.readFileSync(root+'/manifest.json','utf8')),accounts=[],hits=[];
for(const j of sources){const d=new DatabaseSync(j.directory+'/search.sqlite',{readOnly:true});for(const r of d.prepare('select * from accounts where is_new=1').all())accounts.push({...r,keyword:j.keyword});for(const r of d.prepare('select * from hits').all())hits.push({...r,keyword:j.keyword});d.close();}
assert.equal(accounts.length,3689);assert.equal(new Set(accounts.map(a=>a.account_key)).size,3689);
const s=new Store('/var/lib/meedoo-creator/workspace.sqlite');discover(s);
const old=s.db.prepare('select * from discover_jobs order by created_at desc limit 1').get(),actor=JSON.parse(old.actor_json),id=randomUUID(),at=new Date().toISOString();let list;
s.transaction(()=>{
 list=s.write(actor,'creator_lists',{name:'Discover · 16 Keywords · 20261022',creator_ids:[],created_by:actor.name||actor.open_id});
 s.db.prepare('INSERT INTO discover_jobs(id,tenant,owner,actor_json,query,platforms,limit_count,list_id,state,rule_version,search_state,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id,old.tenant,old.owner,old.actor_json,'16 Keywords · 20261022',JSON.stringify(['tiktok','instagram']),1000000,list.id,'preparing',ruleVersion,JSON.stringify({tiktok:{done:true,reason:'reused_saved_search'},instagram:{done:true,reason:'reused_saved_search'}}),at,at);
 for(const a of accounts)s.db.prepare('INSERT INTO discover_candidates(job_id,account_key,platform,handle) VALUES(?,?,?,?)').run(id,a.account_key,a.platform,a.handle);
 let ordinal=0;for(const h of hits)s.db.prepare('INSERT INTO discover_hits VALUES(?,?,?,?,?,?)').run(id,ordinal++,h.platform,h.source_id,h.account_key,JSON.stringify({keyword:h.keyword,data:JSON.parse(h.raw)}));
 s.audit(actor,'discover_saved_search_screening',id,null,{total:accounts.length,rule_version:ruleVersion,list_id:list.id});
});
fs.writeFileSync(manifest,JSON.stringify({id,list_id:list.id,list_name:list.name,total:accounts.length,rule_version:ruleVersion,created_at:at},null,2));
s.db.prepare("UPDATE discover_jobs SET state='queued' WHERE id=?").run(id);console.log(fs.readFileSync(manifest,'utf8'));s.close();
