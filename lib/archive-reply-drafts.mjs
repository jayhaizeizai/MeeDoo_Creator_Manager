import {payload} from './domain.mjs';

// Only retire drafts for the exact mail snapshot that was successfully answered.
export function archiveReplyDrafts(store,actor,sent,cutoff=sent.sent_at){
 if(sent.status!=='sent'||!sent.thread_content||!cutoff)return [];
 const archived=[];
 for(const r of store.list('agent_runs',actor.tenant_key)){
  if(r.id===sent.id||r.thread_id!==sent.thread_id||r.thread_content!==sent.thread_content||r.status!=='suggestion'||r.updated_at>cutoff)continue;
  store.write(actor,'agent_runs',{...payload(r),status:'reviewed',superseded_by:sent.id,archived_at:sent.sent_at,archive_reason:'reply_sent'},{id:r.id,version:r.version,owner:r.owner,parent:r.parent});
  archived.push(r.id);
 }
 return archived;
}
