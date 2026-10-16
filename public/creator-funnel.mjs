const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function funnelData(creators){
 const rows=creators.filter(c=>!c.archived),total=rows.length,count=ss=>rows.filter(c=>ss.includes(c.status)).length;
 const replies=['REPLIED','INTERESTED','ADDRESS_CONFIRMED','PAID_ONLY','DECLINED'];
 const make=xs=>xs.map(([label,n])=>({label,percent:total?n/total*100:0}));
 return {total,stages:make([['名单',total],['已联系',count(['CONTACTED','NO_RESPONSE','FOLLOW_UP_LATER','BOUNCED',...replies])],['有回复',count(replies)],['有意向',count(['INTERESTED','ADDRESS_CONFIRMED'])],['已确认地址',count(['ADDRESS_CONFIRMED'])]]),outcomes:make([['仅付费合作',count(['PAID_ONLY'])],['已拒绝',count(['DECLINED'])],['邮件退信',count(['BOUNCED'])],['暂无邮箱',count(['NO_EMAIL'])]])};
}
export async function mountCreatorFunnel(target,api,alive){
 const lists=(await api('creator_lists')).items;if(!alive())return;
 target.innerHTML=`<style>.funnel-head{display:flex;align-items:center;gap:16px;justify-content:space-between;flex-wrap:wrap}.funnel-head select{padding:12px;border:1px solid #e3dff2;border-radius:10px;background:#faf9ff;color:#10223f;max-width:100%}.funnel-chart{display:grid;grid-template-columns:minmax(90px,1fr) minmax(100px,4fr) 75px;align-items:center;gap:0 12px;margin:32px 0}.funnel-chart svg{width:100%;height:72px;display:block}.funnel-chart strong{text-align:right;font-size:20px;font-variant-numeric:tabular-nums}.funnel-outcomes{display:flex;gap:32px;flex-wrap:wrap;border-top:1px solid #ebe7f4;padding-top:24px}.funnel-outcomes div{display:grid;gap:8px}.funnel-outcomes strong{font-size:22px}.funnel-base{color:#7d86a6;font-size:12px;margin-top:12px}</style><section class="card" style="padding:28px"><div class="funnel-head"><h2>Creators 沟通漏斗</h2><select aria-label="选择统计名单" data-funnel-list>${lists.map(l=>`<option value="${esc(l.id)}">${esc(l.name)}</option>`).join('')}</select></div><div data-funnel-content aria-live="polite"></div></section>`;
 const select=target.querySelector('[data-funnel-list]'),content=target.querySelector('[data-funnel-content]');select.value=lists.find(l=>l.name==='Lark base Creators 1')?.id||'all';let revision=0;
 async function load(){const rev=++revision,id=select.value;content.textContent='正在加载…';try{let rows=[],offset=0;while(true){const d=await api(`creators?limit=100&offset=${offset}${id==='all'?'':'&list_id='+encodeURIComponent(id)}`);if(!alive()||rev!==revision)return;rows.push(...d.items);offset+=d.items.length;if(offset>=d.total||!d.items.length)break;}
 const data=funnelData(rows),format=p=>data.total?p.toFixed(2)+'%':'—';
 content.innerHTML=`<p class="funnel-base">占当前名单比例</p>${data.total?'':'<p>暂无数据</p>'}<div class="funnel-chart">${data.stages.map((s,i)=>{const w=s.percent*5,next=(data.stages[i+1]?.percent??s.percent)*5;return `<span>${s.label}</span><svg viewBox="0 0 500 72" preserveAspectRatio="none" aria-hidden="true"><polygon points="${250-w/2},3 ${250+w/2},3 ${250+next/2},69 ${250-next/2},69" fill="${['#7354eb','#886cf0','#9b84f3','#ad9bf5','#bdb0f8'][i]}"/></svg><strong>${format(s.percent)}</strong>`;}).join('')}</div><div class="funnel-outcomes">${data.outcomes.map(s=>`<div><span>${s.label}</span><strong>${format(s.percent)}</strong></div>`).join('')}</div>`;
 }catch(e){if(alive()&&rev===revision)content.textContent=e.message;}}
 select.onchange=load;await load();
}
