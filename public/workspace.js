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
 const api=async(path,options={})=>{const r=await fetch('/api/'+path,{...options,headers:{'Content-Type':'application/json','X-CSRF-Token':csrf,...options.headers}});let d;try{d=await r.json();}catch{throw Error('服务器响应异常');}if(!r.ok)throw Error(d.message||({authentication_required:'登录已过期，请刷新页面',not_found:'记录不存在'}[d.error]||d.error));return d;};
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
  const panel=document.createElement('div');panel.className='card info-card';panel.innerHTML=`<h2>Google 与 OpenAI 接入</h2><p>工作邮箱：${esc(s.work_email||'未配置')} · Gmail：${s.gmail_connected?'已授权（只读）':s.google_configured?'等待授权':'等待管理员配置 Google OAuth'} · OpenAI：${s.ai_configured?'已配置':'等待服务器密钥和模型配置'}</p><p>Google 重定向地址：<code>${esc(s.callback)}</code></p>${session.role==='admin'?button('connect-google','连接 Google 工作邮箱')+button('disconnect-google','断开邮箱连接'):''}<p>当前仅提供读取、人工关联和 AI 建议；邮件发送尚未启用。</p><p role="alert"></p>`;target.append(panel);
  const connect=panel.querySelector('#connect-google');if(connect){connect.disabled=!s.google_configured;connect.onclick=async()=>{try{const r=await api('integrations/google/start',{method:'POST',body:'{}'});location.assign(r.url);}catch(e){panel.querySelector('[role="alert"]').textContent=e.message;}};}
  const disconnect=panel.querySelector('#disconnect-google');if(disconnect){disconnect.disabled=!s.gmail_connected;disconnect.onclick=async()=>{try{await api('integrations/google/disconnect',{method:'POST',body:'{}'});toast('应用已移除邮箱凭证；可在 Google 账号中撤销授权');await connections();}catch(e){panel.querySelector('[role="alert"]').textContent=e.message;}};}
 }
 async function mailbox(){
  const status=await api('integrations'),threads=await api('mail_threads');if(!alive())return;
  target.innerHTML=note(status.gmail_connected?'已连接工作邮箱。先核对会话身份并关联合作，再生成 AI 建议。未关联的普通工作邮件不会自动进入 CRM。':'Gmail 尚未授权。可先维护 Creators 和合作，再到设置连接工作邮箱。')+`<form id="sync-mail" class="toolbar"><label>读取此日期之后的会话 <input type="date" name="after" required></label><button class="secondary" ${!status.gmail_connected||session.role!=='admin'?'disabled':''}>同步一批（最多 20 个会话）</button><p role="status"></p></form><div class="card table-wrap"><table><thead><tr><th>主题</th><th>分类</th><th>完整性</th><th>操作</th></tr></thead><tbody>${threads.items.map(t=>`<tr><td>${esc(t.subject)}</td><td>${esc(t.classification)}</td><td>${t.complete?'正文完整':'正文或附件需人工补齐'}</td><td><button class="secondary" data-thread="${t.id}">查看会话</button></td></tr>`).join('')||'<tr><td colspan="4">尚无同步会话</td></tr>'}</tbody></table></div>`;
  let next=null,lastDate='';target.querySelector('#sync-mail').onsubmit=async e=>{e.preventDefault();const form=e.target,b=form.querySelector('button');b.disabled=true;const after=new FormData(form).get('after');if(after!==lastDate)next=null;try{const r=await api('integrations/gmail/sync',{method:'POST',body:JSON.stringify({after,page_token:next})});next=r.next_page_token;lastDate=after;form.querySelector('[role="status"]').textContent=`已同步 ${r.count} 个会话。${next?'点击继续读取下一批。':'本次范围已读完；刷新页面查看。'}`;}catch(e){form.querySelector('[role="status"]').textContent=e.message;}finally{b.disabled=false;}};
  target.querySelectorAll('[data-thread]').forEach(b=>b.onclick=()=>run(async()=>{
   const thread=await api('mail_threads/'+b.dataset.thread),collabs=(await api('collaborations?limit=100')).items;
   const modal=dialog(thread.subject||'邮件会话',thread.messages.map(m=>`<article><strong>${esc(m.from)}</strong><p>收件人：${esc(m.to)} · 抄送：${esc(m.cc)}</p><pre>${esc(m.body||'无法解析正文；请在原邮箱查看')}</pre></article>`).join('')+`<form><label>关联合作<select name="collaboration_id" required><option value="">请选择；多人收件 / 代理身份请先人工核对</option>${collabs.map(c=>`<option value="${c.id}" ${thread.collaboration_id===c.id?'selected':''}>${esc(c.name)}</option>`).join('')}</select></label><button class="primary" type="submit">确认关联</button><p role="alert"></p></form><button class="secondary" id="unrelated">标记为非 Creator 邮件</button><button class="secondary" id="analyze-mail" ${!status.ai_configured||!thread.complete||thread.classification!=='creator'?'disabled':''}>用 OpenAI 分析并准备建议</button><div id="analysis-result"></div>`);
   let version=thread.version;
   modal.querySelector('form').onsubmit=async e=>{e.preventDefault();try{const r=await api('mail_threads/'+thread.id+'/link',{method:'POST',body:JSON.stringify({collaboration_id:new FormData(e.target).get('collaboration_id'),version})});version=r.version;modal.querySelector('#analyze-mail').disabled=!status.ai_configured||!thread.complete;toast('已关联');}catch(e){modal.querySelector('[role="alert"]').textContent=e.message;}};
   modal.querySelector('#unrelated').onclick=async()=>{try{await api('mail_threads/'+thread.id+'/link',{method:'POST',body:JSON.stringify({classification:'unrelated',version})});modal.close();await mailbox();}catch(e){modal.querySelector('[role="alert"]').textContent=e.message;}};
   modal.querySelector('#analyze-mail').onclick=async e=>{e.target.disabled=true;try{const r=await api('mail_threads/'+thread.id+'/analyze',{method:'POST',body:'{}'});modal.querySelector('#analysis-result').innerHTML=`<h3>AI 建议 · 尚未发送</h3><p>${esc(r.summary)}</p><pre>${esc(r.draft)}</pre><p>待确认：${esc(r.unknowns.join('；'))}</p><p>依据：${esc(r.source_ids.join('，'))}</p>`;}catch(e){modal.querySelector('[role="alert"]').textContent=e.message;}finally{e.target.disabled=false;}};
  }));
 }
 async function run(fn){try{await fn();}catch(e){if(alive()){target.innerHTML=note(e.message)+button('retry-live','重试');target.querySelector('#retry-live').onclick=()=>run(fn);}}}
 target.innerHTML='<div class="card empty">正在加载真实数据…</div>';
 const kind={2:'creators',3:'collaborations',4:'agreements',6:'deliverables',7:'policies'}[page];
 if(kind)run(()=>list(kind));else if(page===5)target.innerHTML=note('目前没有满足发货门槛的合作。合同接受、产品、尺寸、地址、库存和国家资格全部核验后才能发货。');else run(page===8?connections:page===0?mailbox:home);
}
