import {payload,authorize} from './domain.mjs';
const address=s=>(String(s||'').match(/<([^<>]+)>/)?.[1]||String(s||'')).trim().toLowerCase();
export function proposedCreatorStatus(thread,workEmail,current='UNCONTACTED'){
 if(['DECLINED','PAID_ONLY','FOLLOW_UP_LATER','BOUNCED','NO_EMAIL'].includes(current))return null;
 const last=[...(thread.messages||[])].reverse().find(m=>!m.labels?.includes('SENT')&&address(m.from)!==workEmail.toLowerCase());
 if(!last)return current==='UNCONTACTED'?'CONTACTED':null;
 const text=(last.body||'').split(/On .{1,250}wrote:|^>|[-_]{3,}.*Original Message/im)[0];
 if(/\b(?:paid (?:collaborations?|partnerships?) only|only (?:accept|consider|do)[^.!?]{0,30}paid|prioriti[sz](?:e|ing)[^.!?]{0,20}paid|not (?:accepting|doing)[^.!?]{0,20}gifted)\b/i.test(text))return 'PAID_ONLY';
 if(/\b(?:not interested|politely pass|have to pass|must decline|won't be able to (?:participate|collaborate))\b/i.test(text))return 'DECLINED';
 if(/\b(?:interested in (?:learning|this|the collaboration)|would love to (?:collaborate|learn|take a look)|look [12] (?:is|caught)|love (?:the|your) (?:black|pink|set|look))\b/i.test(text))return 'INTERESTED';
 return ['UNCONTACTED','CONTACTED','NO_RESPONSE'].includes(current)?'REPLIED':null;
}
export function statusSnapshot(store,actor,thread,workEmail){
 if(!thread.creator_id)return null;let c;try{c=store.get(thread.creator_id,actor.tenant_key);authorize(actor,c);}catch{return null;}if(c.kind!=='creators'||c.archived)return null;
 const next=proposedCreatorStatus(thread,workEmail,c.status||'UNCONTACTED');return next&&next!==c.status?{id:c.id,version:c.version,status:next}:null;
}
export function applySentStatus(store,actor,thread,snapshot,sendId){
 if(!snapshot||thread.creator_id!==snapshot.id)return false;let c;try{c=store.get(snapshot.id,actor.tenant_key);authorize(actor,c);}catch{return false;}if(c.archived||c.version!==snapshot.version)return false;
 store.write(actor,'creators',{...payload(c),status:snapshot.status},{id:c.id,version:c.version,owner:c.owner,parent:c.parent});store.audit(actor,'creator_status_after_reply',c.id,{status:c.status||'UNCONTACTED'},{status:snapshot.status,thread_id:thread.id,send_id:sendId});return true;
}
