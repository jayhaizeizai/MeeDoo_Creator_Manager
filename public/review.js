const $=s=>document.querySelector(s),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let session,list,items=[],index=0,busy=false,noticeTimer;
const history=[];
const cached=new Map(),loading=new Set();let desired=new Set();
function notice(s){$('#notice').textContent=s;clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>$('#notice').textContent='',5000);}
async function api(url,body){const r=await fetch('/api/'+url,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json','X-CSRF-Token':session.csrf}:{},...(body?{body:JSON.stringify(body)}:{})});if(r.status===401)throw Error('登录已过期，请返回主页重新登录');const data=await r.json();if(!r.ok)throw Error(data.message||'操作失败，请重试');return data;}
function urls(c){return [c.avatar,...c.posts.map(p=>p.image)].filter(Boolean);}
function prefetch(){
 // Keep only the current, previous and next 20 profiles in memory; four requests at a time.
 desired=new Set(items.slice(Math.max(0,index-1),index+21).flatMap(urls));
 for(const u of cached.keys())if(!desired.has(u))cached.delete(u);
 pump();
}
function pump(){
 if(loading.size>=4)return;
 for(const u of desired){if(cached.has(u)||loading.has(u))continue;if(loading.size>=4)break;
  loading.add(u);const img=new Image();img.decoding='async';
  img.onload=()=>{loading.delete(u);if(desired.has(u))cached.set(u,img);pump();};
  img.onerror=()=>{loading.delete(u);if(desired.has(u))cached.set(u,null);pump();};img.src=u;
 }
}
function render(){
 const count=items.filter(c=>c.score!==null).length;$('#progress').textContent=`${session.user?.name||"当前用户"} · 已评分 ${count} / ${items.length}`;
 if(!items.length){$('#app').innerHTML='<div class="empty"><h1>暂无待审核账号</h1></div>';return;}
 const c=items[index];
 $('#app').innerHTML=`<div class="review-layout"><section><div class="identity">${c.avatar?`<img class="avatar" src="${esc(c.avatar)}" alt="${esc(c.name)} 头像">`:'<div class="avatar avatar-placeholder">?</div>'}<div><h1>${esc(c.name)}</h1><p><a href="${esc(c.url)}" target="_blank" rel="noopener noreferrer">@${esc(c.handle)}</a> · ${esc(c.platform)} · ${index+1} / ${items.length}</p></div><div class="tools"><select aria-label="选择账号">${items.map((x,i)=>`<option value="${i}" ${i===index?'selected':''}>${x.score===null?'○':x.score+'分'} · @${esc(x.handle)}</option>`).join('')}</select><button data-unrated>下个未评分</button></div></div><div class="gallery">${Array.from({length:24},(_,i)=>{const p=c.posts.find(p=>p.index===i+1);return `<button class="tile" ${p?.image?`data-image="${esc(p.image)}" aria-label="放大第 ${i+1} 张预览图"`:'disabled'}>${p?.image?`<img src="${esc(p.image)}" alt="第 ${i+1} 张预览图" decoding="async">`:'<span class="missing">暂无预览图</span>'}<span class="num">${i+1}</span></button>`;}).join('')}</div><div class="footer"><button data-prev ${!history.length&&index===0?'disabled':''}>← 上一位</button><button data-next ${index===items.length-1?'disabled':''}>下一位 →</button><span>${c.score===null?'未评分':`已保存 · ${c.score} 分`}</span></div></section><section class="scoring" aria-label="评分"><h2>我的评分</h2>${Array.from({length:11},(_,i)=>10-i).map(n=>`<button class="score ${n>=6?'score-positive':'score-negative'} ${c.score===n?'active':''}" aria-pressed="${c.score===n}" data-score="${n}">${n}</button>`).join('')}<button data-back ${!history.length&&index===0?'disabled':''}>← 返回上一个</button></section></div>`;
 $('#app select').onchange=e=>go(Number(e.target.value));
 $('[data-back]').onclick=back;$('[data-prev]').onclick=back;$('[data-next]').onclick=()=>go(index+1);$('[data-unrated]').onclick=()=>{const n=nextUnrated();if(n>=0)go(n);else notice('全部账号已评分');};
 document.querySelectorAll('[data-score]').forEach(b=>b.onclick=()=>save(Number(b.dataset.score)));
 document.querySelectorAll('[data-image]').forEach(b=>b.onclick=()=>{$('#viewer img').src=b.dataset.image;$('#viewer').showModal();});
 $('#app .avatar')?.addEventListener('click',()=>{$('#viewer img').src=c.avatar;$('#viewer').showModal();});
 document.querySelectorAll('.tile img').forEach(img=>img.onerror=()=>{img.replaceWith(Object.assign(document.createElement('span'),{className:'missing',textContent:'图片暂不可用'}));});
 prefetch();
}
function go(n){if(busy||n<0||n>=items.length)return;if(n!==index)history.push(index);index=n;render();window.scrollTo({top:0});}
function back(){if(busy)return;const n=history.length?history.pop():index-1;if(n<0)return;index=n;render();window.scrollTo({top:0});}
function nextUnrated(){for(let step=1;step<=items.length;step++){const n=(index+step)%items.length;if(items[n].score===null)return n;}return -1;}
async function save(score){if(busy)return;busy=true;$('#app').querySelectorAll('button,select').forEach(b=>b.disabled=true);const c=items[index];try{const result=await api(`creator-review/${list.id}/score`,{account:c.key,score});c.score=result.score;c.updated_at=result.updated_at;const n=nextUnrated();if(n>=0&&n!==index){history.push(index);index=n;}notice(n<0?'全部账号已评分，已保存':`已保存 ${score} 分`);}catch(e){notice(e.message);}finally{busy=false;render();window.scrollTo({top:0});}}
$('#close-viewer').onclick=()=>$('#viewer').close();
try{session=await api('session');if(session.user?.role==='reviewer'){const link=document.querySelector('header a');link.textContent='退出登录';link.href='#';link.onclick=async e=>{e.preventDefault();await fetch('/auth/logout',{method:'POST',headers:{'X-CSRF-Token':session.csrf}});location.href='/';};}const id=new URLSearchParams(location.search).get('list');list=await api('creator-review'+(id?'/'+encodeURIComponent(id):''));items=list.items;index=Math.max(0,items.findIndex(c=>c.score===null));render();}catch(e){$('#app').innerHTML=`<div class="empty"><h1>${esc(e.message)}</h1><p><a href="/">返回主页登录</a></p></div>`;}
