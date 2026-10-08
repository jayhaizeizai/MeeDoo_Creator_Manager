import {compile} from './vendor/html-to-text.mjs';
const convert=compile({wordwrap:false,limits:{maxInputLength:1000000,maxDepth:1000},selectors:[{selector:'img',format:'skip'},{selector:'script',format:'skip'},{selector:'style',format:'skip'},{selector:'a',options:{ignoreHref:true}}]});
export function hydrateThread(thread){
 const messages=(thread.messages||[]).map(m=>({...m,body:m.body?.trim()?m.body:(m.html_body?convert(m.html_body):'')}));
 const body_ready=messages.length>0&&messages.every(m=>!!m.body?.trim());
 return {...thread,messages,body_ready,complete:body_ready&&!thread.has_attachments};
}

// Gmail can briefly omit a just-accepted send from a full-thread read.
// Keep confirmed local messages until the provider returns the same message ID.
export function mergePendingMessages(fresh,prior){
 const ids=new Set((fresh.messages||[]).map(m=>m.id));const pending=(prior?.messages||[]).filter(m=>m.pending_provider_sync&&!ids.has(m.id));
 if(!pending.length)return fresh;
 return hydrateThread({...fresh,has_attachments:fresh.has_attachments||pending.some(m=>m.attachments?.length),messages:[...(fresh.messages||[]),...pending].sort((a,b)=>Number(a.at||0)-Number(b.at||0))});
}
