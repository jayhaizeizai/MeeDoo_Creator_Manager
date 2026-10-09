import {messageDirection} from './reply-direction.mjs';
export function latestReplyAssessment(thread,email){
 const last=thread.messages?.at(-1);if(!last)return null;
 if(messageDirection(last,email)==='outbound')return {reason:'我方已发送最新回复，等待对方回应',message_id:last.id};
 // Ignore quoted history and signatures when deciding whether the NEW message asks anything.
 const text=(last.body||'').split(/\nOn [\s\S]{0,400}?wrote:|\n-{2,}\s*Original Message/i)[0].split(/\n(?:Best|Warmly|Regards|Kind regards|Warm regards)[,!]?\s*\n/i)[0].split('\n').filter(l=>!/^\s*>/.test(l)).join(' ').replace(/\s+/g,' ').trim();
 if(!text||/[?？]/.test(text)||/\b(?:can|could|would|will) you\b|\bplease\s+(?:send|share|confirm|provide|let|check)|\b(?:need|require|waiting for)\s+(?:you|your|the)\b/i.test(text))return null;
 if(/\b(?:politely pass|pass for now|have to pass|will pass|we(?:'ll| will) pass|not interested|not a fit|decline (?:this|the) (?:offer|collaboration))\b/i.test(text))return {reason:'对方已婉拒本次合作，未提出新的问题或行动要求，无需再发礼貌收尾邮件',message_id:last.id};
 const body=text.replace(/^(?:hi|hello|hey|dear)\s+[^,!]{1,40}[,!]\s*/i,'');
 if(/^(?:(?:thanks|thank you)(?: so much| very much| for (?:the update|letting me know|clarifying))?[!., ]*|(?:got it|noted|understood|sounds good|appreciate it)[!., ]*)+$/i.test(body))return {reason:'对方仅确认收到或致谢，没有需要回复的新事项',message_id:last.id};
 return null;
}
