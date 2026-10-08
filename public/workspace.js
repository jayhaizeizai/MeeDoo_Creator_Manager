import {mountMailLibrary} from './mail-library.js';
import {mountThread} from './mail-view.mjs';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const definitions={
 creators:{title:'Creator',fields:[['name','姓名','text',true],['email','联系邮箱','email'],['social_url','社交账号网址','url'],['country','国家 / 地区'],['tags','标签（逗号分隔）'],['notes','内部备注','textarea']]},
 collaborations:{title:'合作',fields:[['creator_id','Creator','creators',true],['name','合作名称','text',true],['next_action','下一步行动','text',true],['due_at','截止时间','datetime-local'],['waiting_reason','等待原因'],['blockers','阻塞事项（逗号分隔）'],['disposition','联系结果','|PAID_ONLY|DECLINED|NO_RESPONSE|FOLLOW_UP_LATER|BOUNCED']]},
 tasks:{title:'任务',fields:[['collaboration_id','所属合作','collaborations',true],['title','任务名称','text',true],['due_at','截止时间','datetime-local'],['status','状态','open|done|snoozed'],['notes','备注 / 延后原因','textarea']]},
 products:{title:'产品',fields:[['name','产品名称','text',true],['sku','SKU','text',true],['size_guide','尺寸指南及版本','textarea'],['url','产品链接','url'],['status','状态','draft|approved|retired']]},
 policies:{title:'政策版本',fields:[['title','标题','text',true],['body','政策内容','textarea',true],['source','依据 / 来源','text',true],['effective_at','生效时间','datetime-local'],['status','状态','draft|approved|retired']]},
 agreements:{title:'合同草稿',fields:[['collaboration_id','所属合作','collaborations',true],['title','标题','text',true],['terms','完整条款草稿','textarea',true],['source','条款来源']]},
 deliverables:{title:'内容交付',fields:[['collaboration_id','所属合作','collaborations',true],['title','内容名称','text',true],['url','素材链接','url',true],['notes','审核说明','textarea'],['status','状态','received|approved|revision_requested']]}
};
const labels={NEW_LEAD:'新线索',REPLIED:'已回复',INTERESTED:'有意向',open:'待办',done:'已完成',snoozed:'已延后',draft:'草稿',approved:'已批准',retired:'已停用',received:'已收到',revision_requested:'需要修改'};
let generation=0;
export function showWorkspace({page,session,csrf,toast}){
 const target=document.querySelector('#body'),generationId=++generation;
 const alive=()=>generationId===generation&&document.querySelector('#body')===target;
 const api=async(path,options={})=>{const r=await fetch('/api/'+path,{...options,headers:{'Content-Type':'application/json','X-CSRF-Token':csrf,...options.headers}});let d;try{d=await r.json();}catch{throw Error('服务器响应异常');}if(!r.ok){const error=Error(d.message||({authentication_required:'登录已过期，请刷新页面',not_found:'记录不存在'}[d.error]||d.error));error.status=r.status;error.code=d.error;throw error;}return d;};
 const note=t=>`<div class="notice">${esc(t)}</div>`;
 const button=(id,label)=>`<button class="secondary" id="${id}">${label}</button>`;
 let currentKind='',offset=0,query='';
 const tabs=()=>page===3?`<div class="tabs"><button data-kind="collaborations">合作流程</button><button data-kind="tasks">任务</button></div>`:page===7?`<div class="tabs"><button data-kind="policies">政策版本</button><button data-kind="products">产品目录</button></div>`:'';
 async function list(kind){
  currentKind=kind;
  const d=await api(`${kind}?offset=${offset}&q=${encodeURIComponent(query)}`);if(!alive())return;
  const def=definitions[kind];
  target.innerHTML=tabs()+((kind==='agreements')?note('当前可保存和审查草稿。正式条款、身份验证和邮件发送配置完成前，不能发出或代替 Creator 接受。'):'')+((kind==='deliverables')?note('登记素材外链与审核记录。私有文件上传尚未接入；单份素材不代表已完成全部交付。'):'')+`<div class="toolbar"><form id="search-live"><input name="q" aria-label="搜索记录" placeholder="搜索名称、邮箱或账号" value="${esc(query)}"><button class="secondary">搜索</button></form>${def?button('create-live','＋ 新建'+def.title):''}${kind==='creators'&&session.role==='admin'?button('import-live','导入 CSV'):''}</div><div class="card table-wrap"><table><thead><tr><th>名称</th><th>状态</th><th>下一步 / 联系信息</th><th>更新时间</th><th>操作</th></tr></thead><tbody>${d.items.map(r=>`<tr><td><strong>${esc(r.name||r.title)}</strong><small>${esc(r.social_url||r.sku||'')}</small></td><td>${esc(labels[r.stage||r.status]||r.stage||r.status||(r.archived?'已归档':'在跟进'))}</td><td>${esc(r.next_action||r.email||r.source||'—')}</td><td>${esc(new Date(r.updated_at).toLocaleString())}</td><td><button class="secondary" data-edit="${r.id}">查看 / 编辑</button> <button class="secondary" data-history="${r.id}">历史</button>${kind==='collaborations'?` <button class="secondary" data-stage="${r.id}">更新阶段</button>`:''}</td></tr>`).join('')||'<tr><td colspan="5">暂无记录，可新建第一条。</td></tr>'}</tbody></table></div><div class="toolbar"><span>共 ${d.total} 条</span>${button('previous-live','上一页')}${button('next-live','下一页')}</div>`;
  target.querySelectorAll('[data-kind]').forEach(b=>b.onclick=()=>{offset=0;query='';run(()=>list(b.dataset.kind));});
  target.querySelector('#search-live').onsubmit=e=>{e.preventDefault();query=new FormData(e.target).get('q');offset=0;run(()=>list(kind));};
  target.querySelector('#previous-live').disabled=offset===0;target.querySelector('#next-live').disabled=offset+d.items.length>=d.total;
  target.querySelector('#previous-live').onclick=()=>{offset=Math.max(0,offset-50);run(()=>list(kind));};target.querySelector('#next-live').onclick=()=>{offset+=50;run(()=>list(kind));};
  target.querySelector('#import-live')?.addEventListener('click',()=>run(importer));
  target.querySelector('#create-live')?.addEventListener('click',()=>run(()=>editor(kind)));
  target.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>run(()=>editor(kind,d.items.find(r=>r.id===b.dataset.edit))));
  target.querySelectorAll('[data-history]').forEach(b=>b.onclick=()=>run(async()=>{const h=await api(`${kind}/${b.dataset.history}/history`);dialog('变更历史',h.items.map(x=>`<article><strong>${esc(x.action)} · ${esc(new Date(x.at).toLocaleString())}</strong><p>操作成员：${esc(x.actor)}</p><pre>${esc(JSON.stringify({before:x.before,after:x.after},null,2))}</pre></article>`).join('')||'暂无历史');}));
  target.querySelectorAll('[data-stage]').forEach(b=>b.onclick=()=>{
   const r=d.items.find(x=>x.id===b.dataset.stage);const modal=dialog('更新合作阶段',`<form><label>阶段<select name="stage">${['NEW_LEAD','REPLIED','INTERESTED'].map(x=>`<option value="${x}">${labels[x]}</option>`).join('')}</select></label><label>依据<textarea name="reason" required></textarea></label><p>发信、签约、发货等阶段需相应模块的证据，不能手动跳过。</p><button class="primary">保存</button><p role="alert"></p></form>`);
   submit(modal,async form=>{await api(`${kind}/${r.id}/transition`,{method:'POST',headers:{'Idempotency-Key':crypto.randomUUID()},body:JSON.stringify({...Object.fromEntries(form),version:r.version})});});
  });
 }
 function dialog(title,content){const modal=document.createElement('dialog');modal.className='workspace-modal';modal.innerHTML=`<div class="toolbar"><h2>${esc(title)}</h2><button class="secondary" data-close>关闭</button></div>${content}`;document.body.append(modal);modal.querySelector('[data-close]').onclick=()=>modal.close();modal.addEventListener('close',()=>modal.remove());modal.showModal();return modal;}
 function submit(modal,save){const form=modal.querySelector('form');form.onsubmit=async e=>{e.preventDefault();const b=form.querySelector('button[type="submit"],button.primary');b.disabled=true;try{await save(new FormData(form));modal.close();toast('已保存');await list(currentKind);}catch(e){form.querySelector('[role="alert"]').textContent=e.message;}finally{b.disabled=false;}};}
 async function editor(kind,record={}){
  const def=definitions[kind],choices={};
  for(const [, ,type] of def.fields)if(['creators','collaborations'].includes(type)){choices[type]=(await api(type+'?limit=100')).items;}
  if(!alive())return;
  const modal=dialog((record.id?'编辑':'新建')+def.title,`<form class="workspace-form">${def.fields.map(([key,label,type='text',required])=>{
    let value=record[key]??'';if(Array.isArray(value))value=value.join(', ');if(type==='datetime-local'&&value){const dt=new Date(value);value=new Date(dt-dt.getTimezoneOffset()*60000).toISOString().slice(0,16);}
    const attrs=`name="${key}" ${required?'required':''}`;
    const options=choices[type]?.map(x=>[x.id,x.name])|| (type.includes('|')?type.split('|').map(x=>[x,labels[x]||x||'未指定']):null);
    return `<label>${label}${options?`<select ${attrs}><option value="">请选择</option>${options.map(([id,label])=>`<option value="${esc(id)}" ${id===value?'selected':''}>${esc(label)}</option>`).join('')}</select>`:type==='textarea'?`<textarea ${attrs} rows="5">${esc(value)}</textarea>`:`<input ${attrs} type="${type}" value="${esc(value)}">`}</label>`;
  }).join('')}<p role="alert"></p><button type="submit" class="primary">保存</button></form>`);
  const key=crypto.randomUUID();
  submit(modal,async form=>{const data=Object.fromEntries(form);for(const k of ['tags','blockers'])if(k in data)data[k]=data[k].split(',').map(x=>x.trim()).filter(Boolean);for(const k of ['due_at','effective_at'])if(data[k])data[k]=new Date(data[k]).toISOString();if(record.id)data.version=record.version;await api(kind+(record.id?'/'+record.id:''),{method:record.id?'PATCH':'POST',headers:{'Idempotency-Key':key},body:JSON.stringify(data)});});
 }
 async function importer(){
  const modal=dialog('导入 CSV',`<p>支持 name、email、social_url、country，或原表的 Tictok KOL、Collab email。Owner 和粉丝原值仅保留为来源，不覆盖负责人或当前指标。其他列不会导入。</p><input type="file" accept=".csv,text/csv" aria-label="CSV 文件"><div id="import-preview"></div><p role="alert"></p>`);
  modal.querySelector('input').onchange=async e=>{try{
   const file=e.target.files[0];if(!file)return;if(file.size>700000)throw Error('CSV 不能超过 700 KB');
   const batch=await api('imports/preview',{method:'POST',body:JSON.stringify({csv:await file.text()})});
   const container=modal.querySelector('#import-preview');
   if(batch.status!=='preview'){container.textContent='该文件已处理，状态：'+batch.status;return;}
   container.innerHTML=`<p>${batch.items.length} 行。忽略的列：${esc(batch.ignored_columns.join('、')||'无')}。逐行决定；默认跳过。</p><form>${batch.items.map(r=>`<label>第 ${r.row} 行 · ${esc(r.name||'缺少名称')}<small>${esc(r.issues.join('；'))}</small><select name="row-${r.row}"><option value="skip">跳过</option><option value="create">确认新建（已核对重复及字段问题）</option>${r.matches.map(m=>`<option value="${m.id}">关联现有：${esc(m.name)}（不覆盖字段）</option>`).join('')}</select></label>`).join('')}<button class="primary" type="submit">确认导入</button><p role="alert"></p></form>`;
   submit(modal,async form=>{const decisions=batch.items.map(r=>{const choice=form.get('row-'+r.row);return {row:r.row,action:choice==='create'?'create':choice==='skip'?'skip':'link',id:choice,confirm:true};});await api('imports/'+batch.id+'/commit',{method:'POST',body:JSON.stringify({decisions})});});
  }catch(e){modal.querySelector('[role="alert"]').textContent=e.message;}};
 }
 async function home(){const w=await api('workspace');if(!alive())return;target.innerHTML=`<div class="stats">${[['Creators',w.counts.creators],['合作',w.counts.collaborations],['任务记录',w.counts.tasks]].map(([t,n])=>`<div class="stat"><span>${t}</span><strong>${n}</strong><p>当前成员可访问的真实记录</p></div>`).join('')}</div>`+(page===8?`<div class="card settings"><h2>工作空间连接</h2><p>当前角色：${esc(session.role==='admin'?'管理员':'合作运营')}</p>${[['数据库',w.storage==='persistent'?'已连接 · 持久化保存':'临时测试数据库'],['Lark','已连接'],['工作邮箱',w.work_email||'待确认'],['Gmail / Sent','未授权'],['AI 服务','未配置'],['合同身份验证 / 文件上传','未配置']].map(([k,v])=>`<div class="setting-row"><strong>${k}</strong><span>${esc(v)}</span></div>`).join('')}</div>`:note(page===0?'邮件与 AI 服务尚未连接。你现在可以维护 Creators、合作、任务、产品目录和政策；尚无邮件同步或自动发送。':'统计来自真实数据库。邮件、销售和佣金数据未接入，不将缺失数据计为零。'));}
 async function connections(){
  await home();if(!alive())return;const s=await api('integrations');
  if(!alive())return;target.querySelectorAll('.setting-row').forEach(row=>{const key=row.querySelector('strong')?.textContent;if(key==='Gmail / Sent')row.querySelector('span').textContent=s.gmail_connected?'已连接 · 自动同步':'未授权';if(key==='AI 服务')row.querySelector('span').textContent=s.ai_configured?'已配置':'未配置';});
  const panel=document.createElement('div');panel.className='card info-card';panel.innerHTML=`<h2>邮箱与 AI 接入</h2><p>工作邮箱：${esc(s.work_email||'未配置')} · Gmail：${s.gmail_connected?(s.send_authorized?'已授权读取和发送':'已连接，仅有读取权限，请重新授权发送'):s.google_configured?'等待授权':'等待管理员配置 Google OAuth'} · AI：${s.ai_configured?esc(s.ai_model||'已配置'):'等待服务器配置'}</p><p>Google 重定向地址：<code>${esc(s.callback)}</code></p>${session.role==='admin'?button('connect-google',s.gmail_connected?'重新授权 Google 邮箱（读取＋发送）':'连接 Google 工作邮箱（读取＋发送）')+button('disconnect-google','断开邮箱连接'):''}<p>AI 只起草回复，点击发送后才会发出。</p><p role="alert"></p>`;target.append(panel);
  const connect=panel.querySelector('#connect-google');if(connect){connect.disabled=!s.google_configured;connect.onclick=async()=>{try{const r=await api('integrations/google/start',{method:'POST',body:'{}'});location.assign(r.url);}catch(e){panel.querySelector('[role="alert"]').textContent=e.message;}};}
  const disconnect=panel.querySelector('#disconnect-google');if(disconnect){disconnect.disabled=!s.gmail_connected;disconnect.onclick=async()=>{try{await api('integrations/google/disconnect',{method:'POST',body:'{}'});toast('应用已移除邮箱凭证；可在 Google 账号中撤销授权');await connections();}catch(e){panel.querySelector('[role="alert"]').textContent=e.message;}};}
  if(session.role==='admin')await mountMailLibrary(target,api);
 }
 let mailOffset=0,mailQuery='',mailFilter='all',mailTimer=null,mailRequest=0;
 async function mailbox(){
  clearTimeout(mailTimer);const request=++mailRequest;
  const [status,threads]=await Promise.all([api('integrations'),api('mail_threads?offset='+mailOffset+'&q='+encodeURIComponent(mailQuery)+'&filter='+mailFilter)]);if(!alive()||request!==mailRequest)return;
  if(mailOffset&&mailOffset>=threads.total){mailOffset=0;return mailbox();}
  const job=status.sync,working=job&&['queued','running'].includes(job.state);
  const syncText=!status.gmail_connected?'尚未连接工作邮箱':job?.state==='error'?job.error:working?`正在后台同步全部历史邮件 · 本轮已读取 ${job.count} 个会话`:job?.completed_at?`全部历史邮件已同步 · ${new Date(job.completed_at).toLocaleString()} · 自动检查新邮件`:'已连接 · 正在准备自动同步';
  const stateLabels={NEW_LEAD:'新线索',REPLIED:'已回复',INTERESTED:'有意向',PAID_ONLY:'仅付费合作',DECLINED:'已婉拒',NO_RESPONSE:'暂无回复',FOLLOW_UP_LATER:'稍后跟进',BOUNCED:'邮件退回'};
  const contactName=t=>(t.contact||'未知联系人').replace(/<[^>]*>/g,'').replace(/^"|"$/g,'').trim()||t.contact;
  const focused=document.activeElement?.id==='mail-search';const selection=focused?document.activeElement.selectionStart:null;
  target.innerHTML=`<section class="mailbox"><div class="mail-heading"><div><h2>My inbox</h2><p>${esc(status.work_email||'工作邮箱')}</p></div><span class="mail-readonly">${status.send_authorized?'已授权读取与发送':'邮箱读取已授权'}</span></div><div class="mail-sync" role="status"><span class="sync-dot ${working?'sync-active':''}"></span>${esc(syncText)}</div><form id="mail-filters" class="mail-tools"><input id="mail-search" name="q" aria-label="搜索邮件" placeholder="搜索联系人、主题或正文…" value="${esc(mailQuery)}"><button class="secondary">搜索</button><select name="filter" aria-label="筛选邮件">${[['all','全部邮件'],['inbox','收件箱'],['unread','未读'],['unreviewed','待分类'],['creator','已关联合作'],['unrelated','其他邮件']].map(([v,t])=>`<option value="${v}" ${mailFilter===v?'selected':''}>${t}</option>`).join('')}</select><div class="mail-pages">${button('sync-all','↻ 同步')}<span>${threads.total?threads.offset+1:0}–${threads.offset+threads.items.length} / ${threads.total}</span>${button('mail-prev','←')}${button('mail-next','→')}</div></form><div class="mail-list">${threads.items.map(t=>`<div class="mail-row-wrap"><button type="button" class="mail-row ${t.unread?'mail-unread':''}" data-thread="${esc(t.id)}"><span class="mail-avatar">${esc(contactName(t).slice(0,1).toUpperCase())}</span><span class="mail-contact" title="${esc(t.contact)}">${esc(contactName(t))} <small>(${t.message_count})</small></span><span class="mail-tag">${esc(stateLabels[t.status]||t.status)}</span><span class="mail-copy"><strong>${esc(t.subject||'（无主题）')}</strong><span>${esc(t.preview)}</span></span><span title="${t.has_attachments?'包含附件':''}">${t.has_attachments?'📎':''}</span><time>${t.at?esc(new Date(Number(t.at)).toLocaleDateString('zh-CN',{month:'short',day:'numeric'})):'—'}</time></button><details class="mail-actions"><summary aria-label="更多邮件操作" title="更多操作">…</summary><div class="mail-action-menu"><button type="button" data-read="${esc(t.id)}" data-value="${t.unread?'true':'false'}">${t.unread?'标为已读':'标为未读'}</button></div></details></div>`).join('')||`<div class="mail-empty">${status.gmail_connected?(working?'正在读取邮件，会话会自动出现在这里…':'没有符合条件的邮件'):'请先到设置连接 Google 工作邮箱，连接后将自动导入全部历史会话。'}</div>`}</div><p class="mail-footnote">包含收件与已发送会话，排除垃圾邮件和回收站。已读状态仅保存在本系统，不更改 Gmail。普通邮件不会自动创建 Creator。</p></section>`;
  target.querySelectorAll('[data-read]').forEach(b=>b.onclick=async()=>{b.disabled=true;try{await api('mail_threads/'+b.dataset.read+'/read',{method:'POST',body:JSON.stringify({read:b.dataset.value==='true'})});toast(b.dataset.value==='true'?'已标为已读（本系统）':'已标为未读（本系统）');await mailbox();}catch(e){toast(e.message);b.disabled=false;}});
  target.querySelectorAll('.mail-actions').forEach(menu=>menu.ontoggle=()=>{if(menu.open)target.querySelectorAll('.mail-actions[open]').forEach(other=>{if(other!==menu)other.open=false;});});
  if(focused){const input=target.querySelector('#mail-search');input.focus();input.setSelectionRange(selection,selection);}
  const form=target.querySelector('#mail-filters');form.onsubmit=e=>{e.preventDefault();mailQuery=new FormData(form).get('q');mailOffset=0;run(mailbox);};form.querySelector('select').onchange=()=>{mailFilter=form.elements.filter.value;mailQuery=form.elements.q.value;mailOffset=0;run(mailbox);};
  form.elements.q.oninput=()=>{mailQuery=form.elements.q.value;};
  target.querySelector('#mail-prev').disabled=mailOffset===0;target.querySelector('#mail-next').disabled=mailOffset+threads.items.length>=threads.total;
  target.querySelector('#mail-prev').onclick=()=>{mailOffset=Math.max(0,mailOffset-50);run(mailbox);};target.querySelector('#mail-next').onclick=()=>{mailOffset+=50;run(mailbox);};
  const refresh=target.querySelector('#sync-all');refresh.disabled=!status.gmail_connected||working||session.role!=='admin';refresh.onclick=()=>run(async()=>{await api('integrations/gmail/sync',{method:'POST',body:'{}'});await mailbox();});
  mailTimer=setTimeout(()=>{if(alive()&&!document.querySelector('dialog[open]')&&!document.querySelector('.mail-actions[open]')&&document.activeElement?.id!=='mail-search')run(mailbox);else if(alive())mailTimer=setTimeout(()=>{if(alive())run(mailbox);},10000);},working?4000:15000);
  target.querySelectorAll('[data-thread]').forEach(b=>b.onclick=()=>run(()=>openMailThread(b.dataset.thread)));
 }
 async function openMailThread(threadId,draftId=null){
   const status=await api('integrations'),thread=await api('mail_threads/'+threadId),collabs=(await api('collaborations?limit=100')).items;
   const modal=dialog(thread.subject||'邮件会话','<div class="email-thread"></div>'+`<form><label>关联合作<select name="collaboration_id" required><option value="">请选择；多人收件 / 代理身份请先人工核对</option>${collabs.map(c=>`<option value="${c.id}" ${thread.collaboration_id===c.id?'selected':''}>${esc(c.name)}</option>`).join('')}</select></label><button class="primary" type="submit">确认关联</button><p role="alert"></p></form><button class="secondary" id="unrelated">标记为非 Creator 邮件</button><button class="secondary" id="analyze-mail" ${!status.ai_configured||!thread.body_ready?'disabled':''}>AI 起草回复</button><div id="analysis-result"></div>`);
   modal.classList.add('mail-reader');mountThread(modal.querySelector('.email-thread'),thread.messages,{collapsible:true});
   if(!thread.body_ready||thread.has_attachments){const warning=document.createElement('p');warning.className='notice';warning.textContent=!thread.body_ready?'这封邮件没有可读取的文字正文，请在原邮箱核对。':'AI 可以根据正文起草回复；附件内容尚未读取，请在使用草稿前核对附件。';modal.querySelector('form').before(warning);}
   modal.classList.add('mail-detail-layout');
   const layout=document.createElement('div');layout.className='mail-detail-grid';
   const sidebar=document.createElement('aside');sidebar.className='mail-detail-sidebar';
   const correspondent=[...thread.messages].reverse().find(m=>!m.from?.toLowerCase().includes((status.work_email||'@invalid').toLowerCase()));
   const person=correspondent?.from||thread.messages.at(-1)?.to||'邮件联系人';
   sidebar.innerHTML=`<section><span class="detail-eyebrow">联系人</span><h3>${esc(person.replace(/<[^>]*>/g,'').trim()||person)}</h3><p>${thread.messages.length} 封邮件</p></section><section class="detail-relationship"><h4>合作关联</h4></section><section><h4>邮箱与参与人</h4><p>${esc(person)}</p><p>工作邮箱：${esc(status.work_email)}</p></section><section><h4>当前会话</h4><div class="detail-conversation">${esc(thread.subject||'（无主题）')}</div></section>`;
   sidebar.querySelector('.detail-relationship').append(modal.querySelector('form'),modal.querySelector('#unrelated'));
   const main=document.createElement('div');main.className='mail-detail-main';main.append(modal.querySelector('.email-thread'));
   const reply=document.createElement('section');reply.className='mail-reply-panel';const replyTitle=document.createElement('h3');replyTitle.textContent='回复';reply.append(replyTitle);const warning=modal.querySelector('.notice');warning?.remove();const feedback=document.createElement('p');feedback.id='reply-feedback';feedback.setAttribute('role','status');feedback.setAttribute('aria-live','polite');reply.append(modal.querySelector('#analyze-mail'),feedback,modal.querySelector('#analysis-result'));main.append(reply);layout.append(sidebar,main);modal.append(layout);
   let version=thread.version;
   let messageIds=thread.messages.map(m=>m.id).join(','),refreshingThread=false;
   async function refreshOpenThread(){if(refreshingThread||!modal.open)return;refreshingThread=true;try{const latest=await api('mail_threads/'+thread.id);version=latest.version;const ids=latest.messages.map(m=>m.id).join(',');if(modal.open&&ids!==messageIds){messageIds=ids;mountThread(modal.querySelector('.email-thread'),latest.messages,{collapsible:true});sidebar.querySelector('section>p').textContent=latest.messages.length+' 封邮件';}}finally{refreshingThread=false;}}
   const threadTimer=setInterval(()=>{if(modal.open)refreshOpenThread().catch(()=>{});},10000);modal.addEventListener('close',()=>clearInterval(threadTimer),{once:true});

   modal.querySelector('form').onsubmit=async e=>{e.preventDefault();try{const r=await api('mail_threads/'+thread.id+'/link',{method:'POST',body:JSON.stringify({collaboration_id:new FormData(e.target).get('collaboration_id'),version})});version=r.version;modal.querySelector('#analyze-mail').disabled=!status.ai_configured||!thread.body_ready;toast('已关联');}catch(e){modal.querySelector('[role="alert"]').textContent=e.message;}};
   modal.querySelector('#unrelated').onclick=async()=>{try{await api('mail_threads/'+thread.id+'/link',{method:'POST',body:JSON.stringify({classification:'unrelated',version})});modal.close();if(page===9)await agentQueue();else await mailbox();}catch(e){modal.querySelector('[role="alert"]').textContent=e.message;}};
   const results=modal.querySelector('#analysis-result');
   let activeDraft=null,dirty=false,recipient=null,attachments=[];
   results.innerHTML='<section class="ai-reply"><div class="reply-recipient">收件人：<span data-recipient>正在读取…</span><span data-draft-state></span></div><textarea rows="12" aria-label="回复草稿" placeholder="填写回复，或使用 AI 起草…"></textarea><div class="draft-context" hidden></div><div data-outgoing-attachments></div><select data-use-template aria-label="使用邮件模板"><option value="">使用模板…</option></select><select data-add-attachment aria-label="添加品牌附件"><option value="">添加附件…</option></select><div class="toolbar"><button class="secondary" data-save>保存草稿</button><button class="primary" data-send disabled>发送</button></div><p role="status" class="draft-save-status"></p></section><details class="draft-history"><summary>历史草稿</summary><div></div></details>';
   const editor=results.querySelector('textarea'),saveStatus=results.querySelector('.draft-save-status'),context=results.querySelector('.draft-context'),history=results.querySelector('.draft-history>div');
   const sendButton=results.querySelector('[data-send]');
   sendButton.disabled=true;
   async function loadRecipient(){try{recipient=await api('mail_threads/'+thread.id+'/recipient');results.querySelector('[data-recipient]').textContent=recipient.to;sendButton.disabled=session.role!=='admin'||activeDraft?.status==='sent';}catch(e){results.querySelector('[data-recipient]').textContent='暂时无法读取';saveStatus.textContent=e.message;}}
   void loadRecipient();
   const attachmentBox=results.querySelector('[data-outgoing-attachments]');
   function drawAttachments(){attachmentBox.innerHTML=attachments.map(a=>`<span class="outgoing-file">📎 ${esc(a.name)} <button type="button" data-remove-attachment="${a.id}" aria-label="移除 ${esc(a.name)}" ${activeDraft?.status==='sent'?'disabled':''}>×</button></span>`).join('');attachmentBox.querySelectorAll('button').forEach(b=>b.onclick=()=>{attachments=attachments.filter(a=>a.id!==b.dataset.removeAttachment);dirty=true;drawAttachments();});}
   if(session.role==='admin')api('mail_library').then(library=>{
    const templates=results.querySelector('[data-use-template]'),assets=results.querySelector('[data-add-attachment]');
    templates.innerHTML='<option value="">使用模板…</option>'+library.templates.filter(t=>t.enabled).map(t=>`<option value="${t.id}">${esc(t.title)}</option>`).join('');
    assets.innerHTML='<option value="">添加附件…</option>'+library.assets.map(a=>`<option value="${a.id}">${esc(a.name)}</option>`).join('');
    templates.onchange=()=>{const t=library.templates.find(t=>t.id===templates.value);if(!t)return;if(t.attachments.some(a=>!library.assets.some(x=>x.id===a.id))){saveStatus.textContent='模板中有已停用的附件，请先到设置更换';templates.value='';return;}editor.value=t.body.replaceAll('{{creator_name}}',person.replace(/<[^>]*>/g,'').trim()||'there');attachments=t.attachments.filter(a=>library.assets.some(x=>x.id===a.id));dirty=true;drawAttachments();templates.value='';};
    assets.onchange=()=>{const a=library.assets.find(a=>a.id===assets.value);if(a&&!attachments.some(x=>x.id===a.id)){attachments.push(a);dirty=true;drawAttachments();}assets.value='';};
   }).catch(()=>{});
   editor.oninput=()=>{dirty=true;saveStatus.textContent='有未保存的修改';};
   function showDraft(r,{activate=true}={}){
    if(!history.querySelector('[data-run="'+r.id+'"]')){const item=document.createElement('div');item.dataset.run=r.id;const text=document.createElement('pre');text.textContent=r.draft||r.summary;item.append(text);history.prepend(item);}
    if(activate){results.querySelector('[data-draft-state]').textContent=r.status==='sent'?'已发送':'';editor.readOnly=r.status==='sent';results.querySelector('[data-save]').disabled=r.status==='sent';sendButton.disabled=r.status==='sent'||session.role!=='admin'||!recipient;activeDraft=r;attachments=r.attachments||[];drawAttachments();results.querySelectorAll('[data-use-template],[data-add-attachment]').forEach(b=>b.disabled=r.status==='sent');editor.value=r.draft||'';dirty=false;context.replaceChildren();}
   }
   async function saveDraft(){const r=await api(activeDraft?'agent_runs/'+activeDraft.id+'/draft':'mail_threads/'+thread.id+'/draft',{method:'POST',body:JSON.stringify({draft:editor.value,attachment_ids:attachments.map(a=>a.id),version:activeDraft?.version})});activeDraft=r;dirty=false;saveStatus.textContent='草稿已保存，尚未发送';return r;}
   results.querySelector('[data-save]').onclick=async e=>{e.target.disabled=true;try{await saveDraft();}catch(e){saveStatus.textContent=e.message;}finally{e.target.disabled=false;}};
   sendButton.onclick=async()=>{
    if(!recipient||!editor.value.trim())return;
    results.querySelectorAll('[data-use-template],[data-add-attachment],[data-remove-attachment]').forEach(b=>b.disabled=true);
    sendButton.disabled=true;sendButton.textContent='发送中…';editor.readOnly=true;results.querySelector('[data-save]').disabled=true;modal.querySelector('#analyze-mail').disabled=true;
    try{
     if(dirty||!activeDraft)await saveDraft();
     saveStatus.textContent='';
     const preview=await api('agent_runs/'+activeDraft.id+'/send-preview',{method:'POST',body:JSON.stringify({version:activeDraft.version})});
     if(preview.to!==recipient.to||preview.subject!==recipient.subject){await loadRecipient();throw Error('收件人或主题已变化，请核对后再次发送');}
     const sent=await api('agent_runs/'+activeDraft.id+'/send',{method:'POST',body:JSON.stringify({preview_id:preview.preview_id,confirm:true})});
     activeDraft={...activeDraft,status:'sent',sent_at:sent.sent_at};showDraft(activeDraft);feedback.textContent='';saveStatus.textContent='已发送 · '+new Date(sent.sent_at).toLocaleString();try{await refreshOpenThread();if(page===9)await agentQueue();else await mailbox();}catch{saveStatus.textContent+=' · 会话稍后自动更新';}
    }catch(error){saveStatus.textContent=error.message;}
    finally{const sent=activeDraft?.status==='sent';results.querySelectorAll('[data-use-template],[data-add-attachment],[data-remove-attachment]').forEach(b=>b.disabled=sent);sendButton.textContent=sent?'已发送':'发送';sendButton.disabled=sent||session.role!=='admin'||!recipient;editor.readOnly=sent;results.querySelector('[data-save]').disabled=sent;modal.querySelector('#analyze-mail').disabled=!status.ai_configured;}
   };
   if(!status.ai_configured)feedback.textContent='AI 服务尚未配置，连接后可起草回复。';
   modal.querySelector('#analyze-mail').onclick=async e=>{const button=e.target;button.disabled=true;button.textContent='正在起草…';feedback.className='';feedback.textContent='正在读取当前会话并生成回复，请稍候…';feedback.scrollIntoView({block:'nearest'});try{if(dirty)await saveDraft();const r=await api('mail_threads/'+thread.id+'/reply',{method:'POST',body:'{}',signal:AbortSignal.timeout(75000)});showDraft(r,{activate:!dirty});try{const latest=await api('mail_threads/'+thread.id);version=latest.version;mountThread(modal.querySelector('.email-thread'),latest.messages,{collapsible:true});}catch{}feedback.textContent=dirty?'新草稿已保存至历史草稿，保留你正在编辑的内容。':r.draft?'':r.summary||'AI 建议暂不回复。';results.firstElementChild?.scrollIntoView({block:'nearest'});}catch(e){feedback.className='reply-error';feedback.textContent='起草未完成：'+(e.name==='TimeoutError'?'等待时间较长，请稍后重试。':e.message);feedback.scrollIntoView({block:'nearest'});}finally{button.disabled=false;button.textContent='AI 重新起草';}};
   try{if(draftId)showDraft(await api('agent_runs/'+draftId),{activate:!dirty&&!activeDraft});for(const r of (await api('agent_runs?thread_id='+thread.id)).items)showDraft(r,{activate:!dirty&&!activeDraft&&(!draftId||r.id===draftId)});}catch(e){feedback.className='reply-error';feedback.textContent='历史草稿加载失败：'+e.message;}


 }
 async function agentQueue(){
  const result=await api('agent_queue');if(!alive())return;
  target.innerHTML=`<div class="agent-heading"><span>${result.items.length} 项待处理</span><p>展开卡片查看详情，处理完成后勾选完成。</p></div><div class="agent-cards">${result.items.map(r=>`<details class="agent-card"><summary><span class="agent-check">○</span><div><span class="mail-tag">${r.kind==='tasks'?(r.status==='snoozed'?'已延后':'待办'):r.action==='decision_required'?'需要决策':'草稿待审核'}</span><h2>${esc(r.title||r.summary)}</h2><p>${r.due_at?'截止 '+esc(new Date(r.due_at).toLocaleString()):'等待你处理'}</p></div><span class="agent-expand">展开</span></summary><div class="agent-details"><p>${esc(r.notes||r.summary||'暂无补充说明')}</p>${r.draft?`<h3>回复建议 · 尚未发送</h3><p data-agent-recipient>收件人：正在读取…</p><pre>${esc(r.draft)}</pre>${r.attachments?.length?`<p>附件：${r.attachments.map(a=>esc(a.name)).join('、')}</p>`:''}`:''}${r.unknowns?.length?`<h3>待确认</h3><ul>${r.unknowns.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:''}<div class="toolbar">${r.thread_id?`<button class="secondary" data-agent-thread="${esc(r.thread_id)}" data-agent-draft="${esc(r.id)}">${r.draft?'编辑回复':'查看相关对话'}</button>`:''}${r.draft&&r.thread_id&&session.role==='admin'?`<button class="primary" data-agent-send="${esc(r.id)}" disabled>直接发送</button>`:''}<button class="secondary" data-agent-done="${esc(r.id)}">${r.kind==='tasks'?'标记完成':'标记已审核（不发送）'}</button><button class="secondary" data-agent-ignore="${esc(r.id)}">忽视并不再提醒</button></div><p role="alert"></p></div></details>`).join('')||'<div class="agent-empty"><span>✓</span><h2>暂时没有需要你处理的事项</h2><p>合作任务和需要审核的 AI 建议会出现在这里。全部邮件可在 Inbox 查看。</p></div>'}</div>`;
  target.querySelectorAll('[data-agent-send]').forEach(button=>{
   const r=result.items.find(r=>r.id===button.dataset.agentSend),card=button.closest('details'),message=card.querySelector('[role="alert"]');let recipient=null,loading=false;
   card.addEventListener('toggle',async()=>{if(!card.open||recipient||loading)return;loading=true;try{recipient=await api('mail_threads/'+r.thread_id+'/recipient');card.querySelector('[data-agent-recipient]').textContent='收件人：'+recipient.to;button.disabled=false;message.textContent='';}catch(e){message.textContent=e.message;}finally{loading=false;}});
   button.onclick=async()=>{if(!recipient)return;card.querySelectorAll('button').forEach(b=>b.disabled=true);button.textContent='发送中…';message.textContent='';let sent=false;
    try{const preview=await api('agent_runs/'+r.id+'/send-preview',{method:'POST',body:JSON.stringify({version:r.version})});if(preview.to!==recipient.to||preview.subject!==recipient.subject){recipient=null;throw Error('收件人或主题已变化，请重新展开卡片核对');}await api('agent_runs/'+r.id+'/send',{method:'POST',body:JSON.stringify({preview_id:preview.preview_id,confirm:true})});sent=true;toast('邮件已发送');await agentQueue();}
    catch(e){message.textContent=sent?'邮件已发送，请刷新列表':e.message;}
    finally{if(card.isConnected){card.querySelectorAll('button').forEach(b=>b.disabled=sent);button.disabled=sent||!recipient;button.textContent=sent?'已发送':'直接发送';}}
   };
  });
  target.querySelectorAll('[data-agent-ignore]').forEach(button=>button.onclick=()=>{
   const r=result.items.find(r=>r.id===button.dataset.agentIgnore);
   const confirmation=dialog('忽视这条需求？',`<p>${esc(r.title||r.summary||'当前待办')}</p><p>确认后，这条需求将从 Agent 待办中移除，不再提醒。${r.thread_id?'相同邮件的重复分析也不会再次提醒；后续新邮件仍正常处理。':''}</p><div class="toolbar"><button class="secondary" data-cancel-ignore>取消</button><button class="primary" data-confirm-ignore>确认忽视</button></div><p role="alert"></p>`);
   confirmation.querySelector('[data-cancel-ignore]').onclick=()=>confirmation.close();
   confirmation.querySelector('[data-confirm-ignore]').onclick=async e=>{e.target.disabled=true;try{await api('agent_queue/'+r.id+'/ignore',{method:'POST',body:JSON.stringify({version:r.version,confirm:true})});confirmation.close();toast('已忽视，不再提醒');await agentQueue();}catch(error){confirmation.querySelector('[role="alert"]').textContent=error.message;e.target.disabled=false;}};
  });
  target.querySelectorAll('[data-agent-done]').forEach(b=>b.onclick=async()=>{const r=result.items.find(r=>r.id===b.dataset.agentDone);b.disabled=true;try{await api(r.kind+'/'+r.id+(r.kind==='tasks'?'':'/review'),{method:r.kind==='tasks'?'PATCH':'POST',body:JSON.stringify({version:r.version,...(r.kind==='tasks'?{status:'done'}:{})})});await agentQueue();}catch(e){b.closest('.agent-details').querySelector('[role="alert"]').textContent=e.message;b.disabled=false;}});
  target.querySelectorAll('[data-agent-thread]').forEach(b=>b.onclick=()=>run(()=>openMailThread(b.dataset.agentThread,b.dataset.agentDraft)));
 }
 async function run(fn){try{await fn();}catch(e){if(alive()){target.innerHTML=note(e.message)+button('retry-live','重试');target.querySelector('#retry-live').onclick=()=>{if(e.status===401||['authentication_required','login_again'].includes(e.code))location.reload();else run(fn);};}}}
 target.innerHTML='<div class="card empty">正在加载真实数据…</div>';
 const kind={2:'creators',3:'collaborations',4:'agreements',6:'deliverables',7:'policies'}[page];
 if(kind)run(()=>list(kind));else if(page===5)target.innerHTML=note('目前没有满足发货门槛的合作。合同接受、产品、尺寸、地址、库存和国家资格全部核验后才能发货。');else run(page===9?agentQueue:page===8?connections:page===0?mailbox:home);
}
