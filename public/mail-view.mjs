import DOMPurify from './vendor/dompurify.mjs';

const tags=['div','p','br','span','b','strong','i','em','u','s','strike','ul','ol','li','table','thead','tbody','tfoot','tr','td','th','caption','blockquote','a','hr','h1','h2','h3','h4','h5','h6','pre','code','img'];

const diagnostic=/^\s*(?:Diagnostic information for administrators\s*:|诊断信息[：:]|Final-Recipient\s*:)/im;
const quoted=/^(?:On .{1,250}wrote:|在.{1,250}写道[：:]|[-_]{3,}\s*(?:Original Message|原始邮件)\s*[-_]{3,}|>)/im;
function foldNode(node,label){const details=document.createElement('details'),summary=document.createElement('summary');summary.textContent=label;details.dataset.mailQuote='true';node.before(details);details.append(summary,node);}
function foldTail(root,pattern,label){const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let node;while((node=walker.nextNode())){if(node.parentElement?.closest('details'))continue;const match=pattern.exec(node.textContent);if(!match)continue;const range=document.createRange();range.setStart(node,match.index);range.setEnd(root,root.childNodes.length);const tail=range.extractContents(),details=document.createElement('details'),summary=document.createElement('summary'),body=document.createElement('div');summary.textContent=label;if(label.includes('引用'))details.dataset.mailQuote='true';body.append(tail);details.append(summary,body);root.append(details);return;}}
export function renderBody(host,message){
 const shadow=host.attachShadow({mode:'open'}),style=document.createElement('link');style.rel='stylesheet';style.href=new URL('./mail-body.css',import.meta.url).href;shadow.append(style);
 const body=document.createElement('div');shadow.append(body);
 if(message.html_body&&DOMPurify.isSupported){
  // Strict attributes: no CSS, URLs on images, event handlers, forms, frames or SVG.
  body.append(DOMPurify.sanitize(message.html_body,{ALLOWED_TAGS:tags,ALLOWED_ATTR:['href','title','alt','colspan','rowspan','class'],ALLOW_DATA_ATTR:false,ALLOW_ARIA_ATTR:false,RETURN_DOM_FRAGMENT:true,SANITIZE_NAMED_PROPS:true}));
  for(const a of body.querySelectorAll('a')){let safe=false;try{const url=new URL(a.getAttribute('href'));safe=['https:','http:','mailto:'].includes(url.protocol);}catch{}if(!safe)a.removeAttribute('href');else{a.target='_blank';a.rel='noopener noreferrer';a.referrerPolicy='no-referrer';}}
  for(const img of body.querySelectorAll('img')){const placeholder=document.createElement('span');placeholder.className='image-placeholder';placeholder.textContent=img.alt?'图片：'+img.alt:'图片未加载';img.replaceWith(placeholder);}
  foldTail(body,diagnostic,'展开退信诊断信息');
  for(const quote of body.querySelectorAll('blockquote,.gmail_quote,.yahoo_quoted')){if(quote.closest('details'))continue;foldNode(quote,'展开历史引用');}
  if(!body.textContent.trim()){body.className='plain';body.textContent=message.body||'邮件正文为空或无法显示，请在原邮箱查看。';}
 }else{
  body.className='plain';body.textContent=message.body||'正文尚未解析，请在原邮箱查看。';
  foldTail(body,diagnostic,'展开退信诊断信息');foldTail(body,quoted,'展开历史引用');
 }
 const quotes=[...body.querySelectorAll('details[data-mail-quote]')].filter(q=>!q.parentElement?.closest('details[data-mail-quote]'));
 if(quotes.length){const combined=document.createElement('details'),summary=document.createElement('summary');combined.className='original-quotes';summary.textContent='查看原邮件引用（上方已展示历史会话）';combined.append(summary);const seen=new Set();for(const quote of quotes){const content=document.createElement('div');for(const child of [...quote.childNodes])if(child.nodeName!=='SUMMARY')content.append(child);const key=content.textContent.replace(/\s+/g,' ').trim();if(key&&!seen.has(key)){seen.add(key);combined.append(content);}quote.remove();}if(seen.size)body.append(combined);}
 return shadow;
}
export function mountThread(container,messages,{collapsible=false}={}){
 container.replaceChildren();
 for(const m of messages){
  const article=document.createElement(collapsible?'details':'article');if(collapsible)article.open=m===messages.at(-1);article.className='email-message';
  const header=document.createElement(collapsible?'summary':'div');header.className='email-message-head';const sender=document.createElement('strong');sender.textContent=m.from||'未知发件人';const date=document.createElement('time');date.textContent=m.at&&Number.isFinite(Number(m.at))?new Date(Number(m.at)).toLocaleString():'';header.append(sender,date);if(collapsible){const preview=document.createElement('span');preview.className='email-message-preview';preview.textContent=(m.body||'').replace(/\s+/g,' ').slice(0,180);header.append(preview);}
  const recipients=document.createElement('p');recipients.className='email-recipients';recipients.textContent='收件人：'+(m.to||'—')+(m.cc?' · 抄送：'+m.cc:'');
  const host=document.createElement('div');host.className='email-body';article.append(header,recipients,host);renderBody(host,m);
  if(m.attachments?.length){const attachments=document.createElement('p');attachments.className='email-attachments';attachments.textContent='附件（请在原邮箱打开）：'+m.attachments.map(a=>a.name).join('、');article.append(attachments);}
  container.append(article);
 }
}
