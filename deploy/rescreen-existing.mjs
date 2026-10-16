// One-time 2026-10-16 rescreen. Keeps all original jobs, decisions and Lists intact.
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {Store} from '../lib/store.mjs';
import {discover,ruleVersion} from '../lib/discover.mjs';
const root='/var/lib/meedoo-creator/discover';
const uid=Number(execFileSync('id',['-u','meedoo-creator'],{encoding:'utf8'})),gid=Number(execFileSync('id',['-g','meedoo-creator'],{encoding:'utf8'}));
const manifest=path.join(root,'rescreen-20261016.json');
if(fs.existsSync(manifest))throw Error('Rescreen already created; use existing manifest');
const s=new Store('/var/lib/meedoo-creator/workspace.sqlite');discover(s);
const originals=s.db.prepare("SELECT * FROM discover_jobs WHERE rule_version='positive12-negative24-v1' ORDER BY created_at").all();
assert.equal(originals.length,6);assert(originals.every(j=>j.state==='completed'));
assert.equal(s.db.prepare('SELECT count(*) n FROM discover_candidates').get().n,1112);
const actor=JSON.parse(originals[0].actor_json),jobs=[];
s.transaction(()=>{
 const list=s.write(actor,'creator_lists',{name:'Discover 复筛 · 24条 · 3K–100K · 2026-10-16',creator_ids:[],created_by:actor.name||actor.open_id});
 for(const old of originals){
  assert.equal(old.tenant,actor.tenant_key);
  const id=randomUUID(),at=new Date().toISOString();
  const state=JSON.parse(old.search_state);
  for(const p of Object.values(state)){p.done=true;p.reason='reused_saved_search';delete p.error;}
  s.db.prepare(`INSERT INTO discover_jobs(id,tenant,owner,actor_json,query,platforms,limit_count,list_id,state,rule_version,search_state,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id,old.tenant,old.owner,old.actor_json,old.query+' · 复筛 2026-10-16',old.platforms,old.limit_count,list.id,'preparing',ruleVersion,JSON.stringify(state),at,at);
  s.db.prepare(`INSERT INTO discover_candidates(job_id,account_key,platform,handle) SELECT ?,account_key,platform,handle FROM discover_candidates WHERE job_id=?`).run(id,old.id);
  s.db.prepare('INSERT INTO discover_hits SELECT ?,ordinal,platform,source_id,account_key,payload FROM discover_hits WHERE job_id=?').run(id,old.id);
  for(const c of s.db.prepare('SELECT account_key FROM discover_candidates WHERE job_id=?').all(old.id)){
   const src=path.join(root,old.id,c.account_key),dst=path.join(root,id,c.account_key);fs.mkdirSync(dst,{recursive:true});
   if(fs.existsSync(src))for(const file of fs.readdirSync(src))if(file==='source.json'||/^post-\d+\.jpg$/.test(file))fs.copyFileSync(path.join(src,file),path.join(dst,file),fs.constants.COPYFILE_FICLONE);
   for(const file of fs.readdirSync(dst))fs.chownSync(path.join(dst,file),uid,gid);
   fs.chownSync(dst,uid,gid);fs.chownSync(path.dirname(dst),uid,gid);
  }
  s.audit(actor,'discover_rescreen_created',id,{source_job:old.id},{rule_version:ruleVersion,list_id:list.id});
  jobs.push({id,source_job:old.id,query:old.query,list_id:list.id});
 }
});
fs.writeFileSync(manifest,JSON.stringify({rule_version:ruleVersion,jobs},null,2),{mode:0o600});
s.transaction(()=>{for(const j of jobs)s.db.prepare("UPDATE discover_jobs SET state='queued' WHERE id=? AND state='preparing'").run(j.id);});
console.log(JSON.stringify({manifest,jobs,total:1112}));s.close();
