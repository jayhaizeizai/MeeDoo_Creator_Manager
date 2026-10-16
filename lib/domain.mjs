import {fail} from './store.mjs';

export const creatorStatuses=[['UNCONTACTED','未联系'],['CONTACTED','已联系'],['REPLIED','已回复'],['INTERESTED','有意向'],['ADDRESS_CONFIRMED','已确认地址'],['PAID_ONLY','仅付费合作'],['DECLINED','已拒绝'],['NO_RESPONSE','未回复'],['FOLLOW_UP_LATER','稍后跟进'],['NO_EMAIL','暂无邮箱'],['BOUNCED','邮件退信']].map(([value,label])=>({value,label}));
export const stages=['NEW_LEAD','CONTACTED','REPLIED','INTERESTED','LOOKBOOK_SENT','LOOK_SELECTED','TERMS_SENT','AGREED','READY_TO_SHIP','SHIPPED','DELIVERED','CONTENT_DUE','CONTENT_RECEIVED','CONTENT_APPROVED','PUBLISHED','PERFORMANCE_REVIEW','RETURN_VALIDATION','COMPLETED'];
export const kinds=['creators','collaborations','tasks','products','policies','agreements','shipments','deliverables'];
const metadata=['id','kind','tenant','owner','parent','version','created_at','updated_at'];
export const payload=r=>Object.fromEntries(Object.entries(r).filter(([k])=>!metadata.includes(k)));
const text=(x,name,max=2000,required=false)=>{if(typeof x!=='string'||x.length>max||(required&&!x.trim()))fail(422,'invalid_field',`${name}格式不正确`);return x.trim();};
const strings=(x,name)=>{if(!Array.isArray(x)||x.length>30||x.some(v=>typeof v!=='string'||v.length>200))fail(422,'invalid_field',name);return [...new Set(x.map(s=>s.trim()).filter(Boolean))];};
const url=x=>{if(!x)return '';try{const u=new URL(x);if(u.protocol!=='https:'&&u.protocol!=='http:')throw Error();return u.href;}catch{fail(422,'invalid_url','网址须以 https:// 或 http:// 开头');}};
export function canRead(actor,r){return actor.role==='admin'||r.owner===actor.open_id;}
export function authorize(actor,r){if(!canRead(actor,r))fail(404,'not_found','记录不存在');}
export function validate(kind,input,actor,store,old=null){
  if(!input||typeof input!=='object'||Array.isArray(input))fail(422,'invalid_body');
  const fields={creators:['name','first_name','email','country','social_url','tags','notes','archived','status'],collaborations:['creator_id','name','next_action','due_at','waiting_reason','blockers','disposition'],tasks:['collaboration_id','title','due_at','status','notes'],products:['name','sku','size_guide','url','status'],policies:['title','body','source','status','effective_at'],agreements:['collaboration_id','title','terms','source','status'],shipments:['collaboration_id','carrier','tracking','shipped_at','delivered_at','evidence'],deliverables:['collaboration_id','title','url','notes','status']};
  for(const key of Object.keys(input))if(!fields[kind]?.includes(key)&&key!=='version')fail(422,'unknown_field',`不支持字段：${key}`);
  const d=old?payload(old):{};
  for(const [k,v]of Object.entries(input)){
    if(k==='version')continue;
    if(k==='archived'){if(typeof v!=='boolean')fail(422,'invalid_field');d[k]=v;}
    else if(['tags','blockers'].includes(k))d[k]=strings(v,k);
    else if(['url','social_url'].includes(k))d[k]=url(text(v,k));
    else d[k]=text(v,k,['terms','body','notes'].includes(k)?30000:2000);
  }
  const required={creators:['name'],collaborations:['creator_id','name','next_action'],tasks:['title','collaboration_id'],products:['name','sku'],policies:['title','body','source'],agreements:['title','terms','collaboration_id'],shipments:['collaboration_id','carrier','tracking','evidence'],deliverables:['title','url','collaboration_id']};
  for(const field of required[kind])text(d[field],field,30000,true);
  if(d.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email))fail(422,'invalid_email','邮箱格式不正确');
  for(const field of ['due_at','effective_at','shipped_at','delivered_at'])if(d[field]&&!Number.isFinite(Date.parse(d[field])))fail(422,'invalid_date',`${field}日期无效`);
  let parent=null;
  if(d.creator_id||d.collaboration_id){parent=store.get(d.creator_id||d.collaboration_id,actor.tenant_key);authorize(actor,parent);if(parent.kind!==(d.creator_id?'creators':'collaborations'))fail(422,'invalid_parent');if(old&&old.parent!==parent.id)fail(409,'immutable_parent','创建后不能更换所属记录');}
  if(['products','policies','agreements'].includes(kind)&&actor.role!=='admin')fail(403,'admin_required','仅管理员可修改此模块');
  if(kind==='creators'){d.tags ||= [];d.archived ??=false;d.status ||= 'UNCONTACTED';if(!creatorStatuses.some(x=>x.value===d.status))fail(422,'invalid_status','请选择有效的联系状态');}
  if(kind==='collaborations'){d.stage ||= 'NEW_LEAD';d.blockers ||= [];d.disposition ||= '';if(!['','PAID_ONLY','DECLINED','NO_RESPONSE','FOLLOW_UP_LATER','BOUNCED'].includes(d.disposition))fail(422,'invalid_disposition');}
  if(kind==='tasks'){d.status ||= 'open';if(!['open','done','snoozed'].includes(d.status))fail(422,'invalid_status');if(d.status==='snoozed'&&(!d.due_at||!d.notes))fail(422,'snooze_reason_required');}
  if(['products','policies'].includes(kind)){d.status ||= 'draft';if(!['draft','approved','retired'].includes(d.status))fail(422,'invalid_status');if(d.status==='approved'&&kind==='products'&&!d.size_guide)fail(422,'size_guide_required');if(old?.status==='approved'&&(d.status!=='retired'||Object.keys(input).some(k=>!['status','version'].includes(k)&&JSON.stringify(d[k])!==JSON.stringify(old[k]))))fail(409,'immutable_approved','已批准版本不可修改，请新建版本');}
  if(kind==='agreements'){d.status='draft';if(input.status&&input.status!=='draft')fail(422,'issuing_not_configured','合同身份验证、正式条款和邮件服务配置完成前，仅可保存草稿');}
  if(kind==='shipments')fail(409,'shipping_gate','尚无经验证的合同接受及发货门槛记录，不能创建发货记录');
  if(kind==='deliverables'){d.status ||= 'received';if(!['received','approved','revision_requested'].includes(d.status))fail(422,'invalid_status');if(d.status==='revision_requested'&&!d.notes)fail(422,'revision_reason_required');}
  return {data:d,parent:parent?.id||null,owner:parent?.owner||old?.owner||actor.open_id};
}

export function transition(store,actor,record,input){
  authorize(actor,record);if(record.kind!=='collaborations')fail(422,'invalid_kind');
  const target=input.stage;if(!stages.includes(target))fail(422,'invalid_stage');
  // These milestones require authoritative integration/fulfillment evidence, never client-supplied flags.
  if(!['NEW_LEAD','REPLIED','INTERESTED'].includes(target))fail(409,'evidence_required','此阶段需要邮件、协议或履约模块的已验证证据，不能手动跳过');
  const reason=text(input.reason,'依据',2000,true);
  if(!Number.isInteger(input.version))fail(422,'version_required');
  return store.write(actor,'collaborations',{...payload(record),stage:target,stage_evidence:{type:'manual_observation',reason,actor:actor.open_id,at:new Date().toISOString()}},{id:record.id,version:input.version,parent:record.parent,owner:record.owner});
}
