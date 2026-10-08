// Trusted outbound identity and explicit direction for AI drafting.
export function replyIdentity(env){return {name:env.MAIL_SENDER_NAME||'Jay Lee',email:env.WORK_EMAIL||'',organization:'MeeDoo',signature:'Jay Lee\nMeeDoo Creator Partnerships'};}
export function messageDirection(message,email){const from=(message.from?.match(/<([^<>]+)>/)?.[1]||message.from||'').trim().toLowerCase();return from===email.toLowerCase()||message.labels?.includes('SENT')?'outbound':'inbound';}
export function replyRoleProblem(draft,env){
 if(!draft?.trim())return false;
 const name=replyIdentity(env).name,first=name.split(/\s+/)[0],escape=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 if(new RegExp('^\\s*(?:hi|hello|dear|hey)\\s+'+escape(first)+'(?:\\s+'+escape(name.slice(first.length).trim())+')?\\s*[,!:]','i').test(draft))return true;
 const closing=draft.match(/(?:^|\n)(?:warm(?:est)? regards|kind regards|best regards|regards|warmly|best|sincerely|thanks again)[,!]?\s*\n([\s\S]{1,250})$/i)?.[1];
 return !!closing&&!new RegExp('\\b'+escape(first)+'\\b|MeeDoo','i').test(closing);
}
