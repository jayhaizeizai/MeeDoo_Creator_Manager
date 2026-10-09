import {replyRoleProblem} from './reply-direction.mjs';
import {hydrateThread} from './mail-content.mjs';
import {randomUUID,createHash} from 'node:crypto';
import {fail} from './store.mjs';
import {payload,authorize} from './domain.mjs';
export const mailContentFingerprint=t=>createHash('sha256').update(JSON.stringify({subject:t.subject,messages:hydrateThread(t).messages.map(({id,at,from,to,cc,subject,body,html_body,attachments})=>({id,at,from,to,cc,subject,body,html_body,attachments}))})).digest('hex');
// A conservative single-recipient reply. Never infer reply-all or accept header injection.
function mailbox(value){
 if(typeof value!=='string'||/[\r\n\x00]/.test(value))fail(422,'invalid_recipient','收件地址无法安全识别，请在 Gmail 中处理');
 const match=value.trim().match(/^(?:[^<>]*<([^<>]+)>|([^<>\s]+))$/),address=(match?.[1]||match?.[2]||'').trim();
 if(!/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/.test(address))fail(422,'invalid_recipient','需要一个明确的收件地址，请在 Gmail 中处理多人邮件');
 return address;
}

const headers=m=>Object.fromEntries((m.payload?.headers||[]).map(h=>[h.name.toLowerCase(),h.value]));
function envelope(raw,from){
 const last=raw.messages?.at(-1);if(!last)fail(409,'empty_thread');const h=headers(last);
 const sender=mailbox(h.from),to=mailbox(sender.toLowerCase()===from.toLowerCase()?h.to:(h['reply-to']||h.from));
 if(to.toLowerCase()===from.toLowerCase())fail(422,'self_reply','无法确定外部收件人，请在 Gmail 中处理');
 const subject=h.subject||'';if(/[\r\n\x00]/.test(subject)||subject.length>900)fail(422,'invalid_subject');
 const replyTo=h['message-id'];if(!/^<[^<>\s\r\n]+@[^<>\s\r\n]+>$/.test(replyTo||''))fail(422,'missing_message_id','原邮件缺少回复标识，请在 Gmail 中处理');
 const references=[...(h.references||'').matchAll(/<[^<>\s\r\n]+@[^<>\s\r\n]+>/g)].map(m=>m[0]);references.push(replyTo);
 return {from,to,cc:'',subject,reply_to:replyTo,references:[...new Set(references)].slice(-20)};
}
function mime(p,attachments=[]){
 const chunks=[''];for(const c of p.subject){if(Buffer.byteLength(chunks.at(-1)+c)>42)chunks.push('');chunks[chunks.length-1]+=c;}const encoded=chunks.map(c=>Buffer.from(c).toString('base64'));
 const head=['From: '+p.from,'To: '+p.to,'Subject: '+encoded.map(s=>'=?UTF-8?B?'+s+'?=').join('\r\n '),'Date: '+new Date().toUTCString(),'Message-ID: '+p.message_id,'In-Reply-To: '+p.reply_to,'References: '+p.references.join('\r\n '),'MIME-Version: 1.0'];
 const body=['Content-Type: text/plain; charset=UTF-8','Content-Transfer-Encoding: base64','',Buffer.from(p.body.replace(/\r?\n/g,'\r\n')).toString('base64').match(/.{1,76}/g).join('\r\n')].join('\r\n');
 if(!attachments.length)return [...head,body].join('\r\n');
 const boundary='meedoo_'+randomUUID();const parts=attachments.map(a=>['Content-Type: '+a.type,"Content-Disposition: attachment; filename*=UTF-8''"+encodeURIComponent(a.name).replace(/'/g,'%27'),'Content-Transfer-Encoding: base64','',a.data.match(/.{1,76}/g).join('\r\n')].join('\r\n'));
 return [...head,'Content-Type: multipart/mixed; boundary="'+boundary+'"','','--'+boundary,body,...parts.flatMap(p=>['--'+boundary,p]),'--'+boundary+'--',''].join('\r\n');
}
export function createMailSending(store,{env,access,gmail,upstream,queue,normalizeThread,library}){
 const db=store.db;
 const fingerprint=raw=>createHash('sha256').update(JSON.stringify({content:mailContentFingerprint(normalizeThread(raw)),routing:envelope(raw,mailbox(env.WORK_EMAIL))})).digest('hex');
 db.exec(`CREATE TABLE IF NOT EXISTS mail_sends(id TEXT PRIMARY KEY,tenant TEXT NOT NULL,actor TEXT NOT NULL,draft TEXT NOT NULL,version INTEGER NOT NULL,thread TEXT NOT NULL,state TEXT NOT NULL,snapshot TEXT NOT NULL,expires INTEGER NOT NULL,result TEXT);
 CREATE INDEX IF NOT EXISTS mail_sends_draft ON mail_sends(tenant,draft);
 UPDATE mail_sends SET state='unknown' WHERE state='sending';`);
 function draft(actor,id){const r=store.get(id,actor.tenant_key);if(r.kind!=='agent_runs')fail(404,'not_found');authorize(actor,r);return r;}
 function assertEditable(actor,id){const r=draft(actor,id);if(r.status==='sent'||db.prepare("SELECT id FROM mail_sends WHERE tenant=? AND draft=? AND state IN ('sending','unknown','sent')").get(actor.tenant_key,id))fail(409,'send_locked','此草稿已发送或发送结果待确认，不能修改或重复发送');}
 function admin(actor){if(actor.role!=='admin')fail(403,'admin_required','仅管理员可以确认发送');}
 async function token(actor){const value=await access(actor);const scopes=(db.prepare('SELECT scopes FROM connection_scopes WHERE tenant=?').get(actor.tenant_key)?.scopes||'').split(' ');if(!scopes.some(s=>['gmail.send','gmail.compose','gmail.modify'].some(x=>s==='https://www.googleapis.com/auth/'+x)||s==='https://mail.google.com/'))fail(409,'send_scope_missing','请到设置重新授权 Google 邮箱，并勾选发送权限');return value;}
 function thread(actor,id){const t=store.get(id,actor.tenant_key);if(t.kind!=='mail_threads')fail(404,'not_found');authorize(actor,t);return t;}
 function blocked(actor,threadId){if(db.prepare("SELECT id FROM mail_sends WHERE tenant=? AND thread=? AND state IN ('sending','unknown')").get(actor.tenant_key,threadId))fail(409,'send_uncertain','该会话有发送结果待确认，请先检查 Gmail 已发送邮件，勿重复发送');}
 function policies(actor,r){for(const ref of r.policy_versions||[]){const p=store.get(ref.id,actor.tenant_key);if(p.status!=='approved'||p.version!==ref.version)fail(409,'policies_changed','合作政策已变化，请重新起草和审核');}}
 async function prepare(actor,id,input){
  admin(actor);assertEditable(actor,id);const r=draft(actor,id);if(r.created_by_ai&&!r.edited_at&&replyRoleProblem(r.draft,env))fail(409,'invalid_reply_direction','这份 AI 草稿的发信身份不正确，请重新起草');if(r.version!==input.version)fail(409,'version_conflict','草稿已变化，请重新打开审核');if(!r.draft?.trim()||r.draft.length>20000)fail(422,'empty_draft','请先填写回复正文');if(/\{\{[^}]+\}\}/.test(r.draft))fail(422,'unfilled_template','请先填写正文中的模板占位符');const t=thread(actor,r.thread_id);blocked(actor,t.id);policies(actor,r);
  const auth=await token(actor),raw=await gmail(auth,'threads/'+encodeURIComponent(t.provider_id)+'?format=full');
  if(mailContentFingerprint(normalizeThread(raw))!==(r.thread_content||mailContentFingerprint(t))){queue(actor);fail(409,'thread_changed','邮件内容已变化，已安排同步；请重新打开对话并重新起草或核对保存草稿');}
  // Preview always uses current Gmail routing; confirmation binds this exact snapshot.
  const p={...envelope(raw,mailbox(env.WORK_EMAIL)),body:r.draft,attachments:library.refs(actor,(r.attachments||[]).map(a=>a.id)),provider_thread:t.provider_id,fingerprint:fingerprint(raw),message_id:'<'+randomUUID()+'@'+mailbox(env.WORK_EMAIL).split('@')[1]+'>',unknowns:r.unknowns||[],has_attachments:!!t.has_attachments};
  return store.transaction(()=>{assertEditable(actor,id);blocked(actor,t.id);if(draft(actor,id).version!==r.version)fail(409,'version_conflict','草稿已变化，请重新审核');thread(actor,t.id);const preview_id=randomUUID();db.prepare('INSERT INTO mail_sends VALUES(?,?,?,?,?,?,?,?,?,NULL)').run(preview_id,actor.tenant_key,actor.open_id,id,r.version,t.id,'prepared',JSON.stringify(p),Date.now()+600000);return {preview_id,...p};});
 }
 async function send(actor,id,input){
  admin(actor);draft(actor,id);if(input.confirm!==true)fail(422,'confirmation_required','请核对收件人和正文后确认发送');
  const row=db.prepare('SELECT * FROM mail_sends WHERE id=? AND tenant=? AND actor=? AND draft=?').get(input.preview_id||'',actor.tenant_key,actor.open_id,id);if(!row)fail(404,'preview_not_found');
  if(row.state==='sent')return JSON.parse(row.result);
  if(row.state!=='prepared')fail(409,'send_uncertain','该发送请求已处理或结果待确认，请检查 Gmail 已发送邮件，勿重复发送');
  if(row.expires<Date.now())fail(409,'preview_expired','审核已过期，请重新审核');
  assertEditable(actor,id);blocked(actor,row.thread);const t=thread(actor,row.thread),p=JSON.parse(row.snapshot),auth=await token(actor);
  const raw=await gmail(auth,'threads/'+encodeURIComponent(t.provider_id)+'?format=full');
  if(fingerprint(raw)!==p.fingerprint||t.provider_id!==p.provider_thread)fail(409,'thread_changed','会话有新内容，请重新打开对话、核对草稿后再发送');
  const attachments=library.materialize(actor,p.attachments||[]);
  store.transaction(()=>{assertEditable(actor,id);blocked(actor,row.thread);thread(actor,row.thread);policies(actor,draft(actor,id));if(draft(actor,id).version!==row.version)fail(409,'version_conflict','草稿已修改，请重新审核');const changed=db.prepare("UPDATE mail_sends SET state='sending' WHERE id=? AND state='prepared' AND expires>=?").run(row.id,Date.now());if(changed.changes!==1)fail(409,'send_in_progress');store.audit(actor,'mail_send_confirmed',id,null,{send_id:row.id,to:p.to,subject:p.subject});});
  let response,data;
  try{response=await upstream('https://gmail.googleapis.com/gmail/v1/users/me/messages/send',{method:'POST',headers:{Authorization:'Bearer '+auth,'Content-Type':'application/json'},body:JSON.stringify({threadId:p.provider_thread,raw:Buffer.from(mime(p,attachments)).toString('base64url')}),signal:AbortSignal.timeout(20000)});if(response.ok)data=await response.json();}catch{}
  if(!data?.id){const rejected=response&&!response.ok&&[400,401,403,404,413,429].includes(response.status);db.prepare('UPDATE mail_sends SET state=? WHERE id=?').run(rejected?'failed':'unknown',row.id);store.audit(actor,rejected?'mail_send_rejected':'mail_send_unknown',id,null,{send_id:row.id});fail(rejected?502:409,rejected?'send_rejected':'send_uncertain',rejected?'Google 拒绝发送，邮件未发出。请检查发送权限或额度，再重新审核。':'发送结果待确认，请先检查 Gmail 已发送邮件；系统已阻止重复发送。');}
  const result={sent:true,message_id:data.id,sent_at:new Date().toISOString()};
  store.transaction(()=>{const current=draft(actor,id);store.write(actor,'agent_runs',{...payload(current),status:'sent',sent_at:result.sent_at,sent_message_id:data.id,send_id:row.id},{id,version:current.version,owner:current.owner,parent:current.parent});db.prepare("UPDATE mail_sends SET state='sent',result=? WHERE id=?").run(JSON.stringify(result),row.id);store.audit(actor,'mail_sent',id,null,result);const currentThread=thread(actor,row.thread),sameContent=mailContentFingerprint(currentThread)===mailContentFingerprint(normalizeThread(raw));if(!currentThread.messages?.some(m=>m.id===data.id)){const message={id:data.id,threadId:p.provider_thread,at:String(Date.parse(result.sent_at)),labels:['SENT'],from:p.from,to:p.to,cc:p.cc,subject:p.subject,body:p.body,html_body:'',attachments:(p.attachments||[]).map(({name,type,size})=>({name,type,size})),pending_provider_sync:true};store.write(actor,'mail_threads',payload(hydrateThread({...currentThread,has_attachments:currentThread.has_attachments||message.attachments.length>0,messages:[...(currentThread.messages||[]),message]})),{id:currentThread.id,version:currentThread.version,owner:currentThread.owner,parent:currentThread.parent});}const updated=thread(actor,row.thread);if(sameContent)db.prepare('INSERT INTO mail_reads VALUES(?,?,?,?,0) ON CONFLICT(tenant,actor,thread) DO UPDATE SET last_message=excluded.last_message,unread=0').run(actor.tenant_key,actor.open_id,row.thread,updated.messages?.at(-1)?.id||'');});
  try{queue(actor);}catch{}return result;
 }
 async function recipient(actor,id){const t=thread(actor,id),auth=await access(actor),raw=await gmail(auth,'threads/'+encodeURIComponent(t.provider_id)+'?format=full');const p=envelope(raw,mailbox(env.WORK_EMAIL));return {to:p.to,subject:p.subject};}
 return {prepare,send,assertEditable,recipient};
}
