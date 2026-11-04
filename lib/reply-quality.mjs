import {readFileSync} from 'node:fs';
export const playbookReference={id:'playbook:2026-10-07',version:'0.3',body:readFileSync(new URL('../docs/AGENT_CONTEXT.md',import.meta.url),'utf8')};
export const stageInstructions=`Use the supplied Playbook reference as general program guidance, not proof of accepted individual terms or live inventory. Current approved policies and verified accepted terms take precedence. At first interest / learning-more stage, thank the creator, briefly introduce only relevant supported collaboration facts and proactively share the available Brand Overview and Product Lookbook, briefly summarize the supported Level 1 offer and deliverables, then invite them to browse and say which look they like. Do not ask permission again to share materials. Do NOT ask for sizing, breed/measurements, shipping city/country/address, platform, audience metrics, or content availability at this stage. Never re-ask known platform or audience information. Collect logistics only after explicit agreement to proceed and look selection, and only missing details relevant to that next step. Do not invent a 4–6 week timeline, negotiable deliverables, posting cadence, or flexibility absent from the Playbook. Missing later-stage information is not a current blocker: do not fill unknowns with future shipping, budget, tax or campaign checklists. Keep early replies short and natural. Positive interest or asking to learn more warrants proactively sharing both brand materials, even without naming those files. When no real eligible files exist, offer to share materials later; NEVER say attached, enclosed, included files, or invent a download link. Distinguish inbound files from outgoing attachments.`;
export function attachmentClaimProblem(text,attachments=[]){
 const claimPattern=/(?:\b(?:I|we)[’']?(?:ve| have)?\s+(?:attached|enclosed)|\b(?:please\s+)?(?:find|see)\b[^.!?\n]{0,80}\b(?:attached|attachments?|enclosed)|\b(?:is|are)\s+(?:attached|enclosed)|\b(?:attached|enclosed)\s+(?:is|are|our|the|my)|已附|随信附|附件中)/i;
 const claims=String(text||'').split(/[.!?\n]+/).filter(sentence=>claimPattern.test(sentence));
 if(!claims.length)return false;
 if(!attachments.length)return true;
 const purposes=new Set(attachments.map(a=>a.purpose));
 return claims.some(sentence=>(/brand overview/i.test(sentence)&&!purposes.has('brand_overview'))||(/lookbook/i.test(sentence)&&!purposes.has('lookbook')));
}

export function prematureRequest(output,context){
 const last=[...context.messages].reverse().find(m=>m.direction==='inbound');
 const stage=context.collaboration?.stage;
 if(stage&&!['NEW_LEAD','CONTACTED','REPLIED','INTERESTED'].includes(stage))return false;
 const incoming=(last?.body||'').split(/On .*wrote:|^>/m)[0];
 if(!/interested|learn(?:ing)? more|tell me more/i.test(incoming)||/siz|ship|address|deliver|deadline|platform|audience|availability/i.test(incoming))return false;
 return /(?:your|you|pup|dog)[^.!?\n]{0,80}\b(?:size|sizing|breed|measurements|city|country|address|platforms?|audience|availability)\b|\b(?:size|country|platform|audience)\b[^.!?\n]{0,60}\?/i.test(output.draft||'');
}

export function proactiveMaterials(context){
 const stage=context.collaboration?.stage;if(stage&&!['NEW_LEAD','CONTACTED','REPLIED','INTERESTED'].includes(stage))return [];
 const message=context.messages.at(-1);if(message?.direction!=='inbound')return [];
 const text=(message.body||'').split(/On .*wrote:|^>/m)[0];
 if(/not interested|declin|pass for now|paid (?:only|collab|partnership)|budget|rates|unsubscribe/i.test(text))return [];
 return /(?:interested|learn(?:ing)? more|tell me more|share (?:more )?details)/i.test(text)?['brand_overview','lookbook']:[];
}
export function selectMaterialFiles(purposes,assets,template){
 return [...new Set(purposes)].flatMap(purpose=>{const preferred=assets.filter(a=>a.purpose===purpose&&template?.attachments?.some(ref=>ref.id===a.id));const matches=preferred.length?preferred:assets.filter(a=>a.purpose===purpose);return matches.length===1?matches:[];});
}
