import {mailContentFingerprint} from './mail-send.mjs';
import {payload} from './domain.mjs';
const HOUR=60*60*1000;
export function agentTone(r){if(r.status==='snoozed')return 'neutral';if(r.send_problem||r.failure_code||r.issue==='delivery_failure')return 'red';return r.action==='draft'&&r.draft&&!r.unknowns?.length&&!r.needs_refresh?'green':'amber';}
export function createAgentWorker(store,{analyze,ready,workEmail,authorized=()=>true,now=Date.now}){
 const db=store.db;
 db.exec(`CREATE TABLE IF NOT EXISTS agent_jobs(tenant TEXT PRIMARY KEY,actor TEXT NOT NULL,initialized_at INTEGER NOT NULL,next_at INTEGER NOT NULL,last_at TEXT,state TEXT NOT NULL DEFAULT 'idle',checked INTEGER NOT NULL DEFAULT 0,error TEXT);
 CREATE TABLE IF NOT EXISTS agent_checks(tenant TEXT NOT NULL,thread TEXT NOT NULL,content TEXT NOT NULL,unread INTEGER NOT NULL,request INTEGER NOT NULL,outcome TEXT NOT NULL,PRIMARY KEY(tenant,thread));
 CREATE TABLE IF NOT EXISTS agent_rechecks(tenant TEXT NOT NULL,thread TEXT NOT NULL,request INTEGER NOT NULL DEFAULT 1,PRIMARY KEY(tenant,thread));
 CREATE TABLE IF NOT EXISTS agent_ignored(tenant TEXT NOT NULL,scope TEXT NOT NULL,actor TEXT NOT NULL,at TEXT NOT NULL,PRIMARY KEY(tenant,scope));
 UPDATE agent_jobs SET state='idle' WHERE state='running';`);
 const readState=db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='mail_reads'").get()?db.prepare('SELECT unread FROM mail_reads WHERE tenant=? AND actor=? AND thread=? AND last_message=?'):null;
 let timer=null,pending=Promise.resolve(),stopped=false,running=false;
 const request=(actor,id)=>db.prepare('INSERT INTO agent_rechecks(tenant,thread) VALUES(?,?) ON CONFLICT(tenant,thread) DO UPDATE SET request=request+1').run(actor.tenant_key,id);
 const status=tenant=>db.prepare('SELECT state,last_at,next_at,checked,error FROM agent_jobs WHERE tenant=?').get(tenant)||null;
 const ignored=(tenant,t,content)=>!!db.prepare('SELECT 1 FROM agent_ignored WHERE tenant=? AND scope=?').get(tenant,'mail:'+t.id+':'+content);
 const save=(tenant,t,content,unread,request,outcome)=>db.prepare('INSERT INTO agent_checks VALUES(?,?,?,?,?,?) ON CONFLICT(tenant,thread) DO UPDATE SET content=excluded.content,unread=excluded.unread,request=excluded.request,outcome=excluded.outcome').run(tenant,t.id,content,unread?1:0,request,outcome);
 async function tick(){
  if(stopped||running||!ready())return;running=true;
  try{
   for(const row of db.prepare('SELECT c.tenant,m.actor FROM connections c JOIN mail_sync m ON m.tenant=c.tenant').all())db.prepare('INSERT INTO agent_jobs(tenant,actor,initialized_at,next_at) VALUES(?,?,?,?) ON CONFLICT(tenant) DO UPDATE SET actor=excluded.actor').run(row.tenant,row.actor,now(),now());
   const job=db.prepare("SELECT j.* FROM agent_jobs j JOIN mail_sync m ON m.tenant=j.tenant JOIN connections c ON c.tenant=j.tenant WHERE j.next_at<=? AND m.history_id IS NOT NULL ORDER BY j.next_at LIMIT 1").get(now());if(!job)return;
   const actor={role:'admin',open_id:job.actor,tenant_key:job.tenant},connection=db.prepare('SELECT secret FROM connections WHERE tenant=?').get(job.tenant)?.secret;
   if(!authorized(actor)){db.prepare('UPDATE agent_jobs SET next_at=?,error=? WHERE tenant=?').run(now()+HOUR,'自动检查账号需要管理员权限',job.tenant);return;}
   const valid=()=>!stopped&&db.prepare('SELECT secret FROM connections WHERE tenant=?').get(job.tenant)?.secret===connection;
   db.prepare("UPDATE agent_jobs SET state='running',checked=0,error=NULL,next_at=? WHERE tenant=?").run(now()+HOUR,job.tenant);
   let checked=0,errors=0;
   for(const t of store.list('mail_threads',job.tenant)){
    if(!valid())break;
    const content=mailContentFingerprint(t),prior=db.prepare('SELECT * FROM agent_checks WHERE tenant=? AND thread=?').get(job.tenant,t.id),req=db.prepare('SELECT request FROM agent_rechecks WHERE tenant=? AND thread=?').get(job.tenant,t.id)?.request||0;
    const localRead=readState?.get(job.tenant,job.actor,t.id,t.messages?.at(-1)?.id||'');
    const unread=localRead?!!localRead.unread:t.messages?.some(m=>m.labels?.includes('UNREAD'))||false;
    const newContent=prior?prior.content!==content:Date.parse(t.created_at)>=job.initialized_at;
    const trigger=newContent||req>(prior?.request||0)||(unread&&!prior?.unread)||prior?.outcome==='error';
    if(!trigger){if(!prior)save(job.tenant,t,content,unread,req,'baseline');else if(prior.unread!==Number(unread))save(job.tenant,t,content,unread,req,prior.outcome);continue;}
    checked++;
    const last=t.messages?.at(-1),from=(last?.from?.match(/<([^<>]+)>/)?.[1]||last?.from||'').trim().toLowerCase();
    const runs=store.list('agent_runs',job.tenant).filter(r=>r.thread_id===t.id);
    const handled=runs.some(r=>r.thread_content===content&&(['sent','reviewed','ignored'].includes(r.status)||(r.status==='suggestion'&&r.action!=='wait'&&!r.failure_code)));
    if(t.provider_deleted||t.provider_hidden||t.classification==='unrelated'||!last||last.labels?.includes('SENT')||last.labels?.includes('DRAFT')||from===workEmail.toLowerCase()||ignored(job.tenant,t,content)||handled){save(job.tenant,t,content,unread,req,'skipped');continue;}
    if(/(?:mailer-daemon|postmaster)@/i.test(from)||/^(?:undeliverable|delivery status notification|mail delivery failed)/i.test(t.subject||'')){
     const old=runs.find(r=>r.status==='suggestion'&&r.automatic&&!r.edited_at);store.write(actor,'agent_runs',{thread_id:t.id,thread_content:content,status:'suggestion',action:'decision_required',draft:'',summary:'邮件投递异常，请查看退信原因后处理',issue:'delivery_failure',created_by_ai:true,automatic:true},{id:old?.id,version:old?.version,owner:t.owner,parent:t.id});save(job.tenant,t,content,unread,req,'done');continue;
    }
    const edited=runs.find(r=>r.status==='suggestion'&&(r.edited_at||r.created_by_ai===false)&&!r.failure_code);
    if(edited){if(!edited.needs_refresh)store.write(actor,'agent_runs',{...payload(edited),needs_refresh:true,action:'decision_required',summary:'收到新邮件，请核对已有人工草稿后回复'},{id:edited.id,version:edited.version,owner:edited.owner,parent:edited.parent});save(job.tenant,t,content,unread,req,'preserved');continue;}
    try{await analyze(actor,t.id,{reply:true,background:true,cached:true,valid});if(valid())save(job.tenant,t,content,unread,req,'done');}
    catch(e){if(!valid())break;errors++;save(job.tenant,t,content,unread,req,'error');
     // A visible, retryable failure without copying provider error bodies or secrets.
     if(!ignored(job.tenant,t,content)&&mailContentFingerprint(store.get(t.id,job.tenant))===content){const old=store.list('agent_runs',job.tenant).find(r=>r.thread_id===t.id&&r.status==='suggestion'&&r.failure_code);if(!old)store.write(actor,'agent_runs',{thread_id:t.id,thread_content:content,status:'suggestion',action:'decision_required',draft:'',summary:'自动检查暂未完成，下次检查将重试；也可以打开会话手动起草',failure_code:'analysis_failed',created_by_ai:true,automatic:true},{owner:t.owner,parent:t.id});}
    }
    db.prepare('UPDATE agent_jobs SET checked=? WHERE tenant=?').run(checked,job.tenant);
   }
   if(!stopped)db.prepare("UPDATE agent_jobs SET state='idle',last_at=?,checked=?,error=? WHERE tenant=?").run(new Date(now()).toISOString(),checked,errors?'部分会话检查失败，将在下一轮重试':null,job.tenant);
  }finally{running=false;}
 }
 function start(){if(timer)return;stopped=false;const loop=()=>{pending=tick().catch(()=>{}).finally(()=>{if(!stopped){timer=setTimeout(loop,1000);timer.unref();}});};timer=setTimeout(loop,100);timer.unref();}
 function stop(){stopped=true;clearTimeout(timer);timer=null;return running?pending:null;}
 return {tick,start,stop,request,status};
}
