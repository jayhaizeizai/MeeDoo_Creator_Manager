const emails=s=>[...String(s||'').matchAll(/[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9-]+(?:\.[A-Z0-9-]+)+/gi)].map(m=>m[0].toLowerCase());
export function matchCreators(thread,creators,workEmail){
 const external=new Set();for(const m of thread.messages||[]){const from=emails(m.from);if(from.some(e=>e!==workEmail.toLowerCase())){from.forEach(e=>external.add(e));}else for(const e of emails(m.to))external.add(e);for(const e of emails(m.cc))external.add(e);}external.delete(workEmail.toLowerCase());
 const candidates=[];for(const c of creators.filter(c=>!c.archived)){const exact=emails(c.email).some(e=>external.has(e));if(exact)candidates.push({id:c.id,name:c.name,email:c.email||'',social_url:c.social_url||'',reason:exact?'邮箱一致':'姓名或账号相似，需确认',exact});}
 const exact=candidates.filter(c=>c.exact);return {candidates,automatic:external.size===1&&exact.length===1?exact[0].id:null};
}
