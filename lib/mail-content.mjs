import {compile} from './vendor/html-to-text.mjs';
const convert=compile({wordwrap:false,limits:{maxInputLength:1000000,maxDepth:1000},selectors:[{selector:'img',format:'skip'},{selector:'script',format:'skip'},{selector:'style',format:'skip'},{selector:'a',options:{ignoreHref:true}}]});
export function hydrateThread(thread){
 const messages=(thread.messages||[]).map(m=>({...m,body:m.body?.trim()?m.body:(m.html_body?convert(m.html_body):'')}));
 const body_ready=messages.length>0&&messages.every(m=>!!m.body?.trim());
 return {...thread,messages,body_ready,complete:body_ready&&!thread.has_attachments};
}
