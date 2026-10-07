import {createHash} from 'node:crypto';
import {fail} from './store.mjs';
import {payload} from './domain.mjs';
export function parseCSV(text){
 if(typeof text!=='string'||text.length>700000)fail(422,'invalid_csv','CSV 过大或格式无效');
 text=text.replace(/^\uFEFF/,'');let rows=[],row=[],cell='',quoted=false,closed=false;
 for(let i=0;i<text.length;i++){
  const c=text[i];if(quoted){if(c==='"'){if(text[i+1]==='"'){cell+='"';i++;}else{quoted=false;closed=true;}}else cell+=c;continue;}
  if(c==='"'&&!cell&&!closed){quoted=true;continue;}
  if(c===','||c==='\n'||c==='\r'){row.push(cell);cell='';closed=false;if(c!==','){if(c==='\r'&&text[i+1]==='\n')i++;if(row.some(x=>x))rows.push(row);row=[];}continue;}
  if(closed)fail(422,'invalid_csv','引号后的字符无效');cell+=c;
 }
 if(quoted)fail(422,'invalid_csv','CSV 引号未闭合');if(cell||row.length){row.push(cell);rows.push(row);}if(rows.length<2||rows.length>2001)fail(422,'row_limit','每次导入须为 1–2000 行');
 const headers=rows.shift().map(s=>s.trim());if(new Set(headers).size!==headers.length)fail(422,'duplicate_headers');
 return {headers,rows:rows.map((r,i)=>{if(r.length!==headers.length)fail(422,'column_count',`第 ${i+2} 行列数不一致`);return Object.fromEntries(headers.map((k,n)=>[k,r[n]]));})};
}
function social(value){
 if(!value)return '';try{const u=new URL(value);const host=u.hostname.toLowerCase().replace(/^www\./,'');if(!['tiktok.com','instagram.com','youtube.com'].includes(host)||!/^\/@?[\w.-]+\/?$/.test(u.pathname))return '';return 'https://'+host+u.pathname.toLowerCase().replace(/\/$/,'');}catch{return '';}
}
export function importAction(store,actor,action,id,input){
 if(actor.role!=='admin')fail(403,'admin_required');
 if(action==='preview'){
  const {headers,rows}=parseCSV(input.csv);const fingerprint=createHash('sha256').update(input.csv).digest('hex');
  const prior=store.list('imports',actor.tenant_key).find(r=>r.fingerprint===fingerprint);if(prior)return prior;
  const existing=store.list('creators',actor.tenant_key);const seen=new Set();
  const items=rows.map((r,i)=>{
   const rawUrl=(r.social_url||r['Tictok KOL']||'').trim(),account=social(rawUrl);const rawEmail=(r.email||r['Collab email']||'').trim().replace(/^mailto:/i,'');const email=/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail)?rawEmail:'';
   const name=(r.name||r['姓名']||account.split('/').pop()||'').trim();const issues=[];
   if(!name)issues.push('缺少姓名或有效账号');if(rawUrl&&!account)issues.push('账号网址需人工修正');if(rawEmail&&!email)issues.push('邮箱字段包含非邮箱内容，未作为联系地址');if(account&&seen.has(account))issues.push('本批次重复账号');if(account)seen.add(account);
   const matches=existing.filter(e=>(account&&social(e.social_url)===account)||(email&&e.email?.toLowerCase()===email.toLowerCase())).map(e=>({id:e.id,name:e.name}));
   return {row:i+2,name,email,social_url:account,country:r.country||'',source_owner:r.Owner||'',source_followers:r['关注者数量']||'',issues,matches};
  });
  const ignored=headers.filter(h=>!['name','姓名','social_url','Tictok KOL','email','Collab email','country','Owner','关注者数量'].includes(h));
  return store.write(actor,'imports',{fingerprint,status:'preview',items,ignored_columns:ignored,created_ids:[],linked_ids:[],skipped_rows:[]});
 }
 const batch=store.get(id,actor.tenant_key);if(batch.kind!=='imports')fail(404,'not_found');
 if(action==='commit'){
  if(batch.status==='committed')return batch;if(batch.status!=='preview')fail(409,'invalid_import_status');
  if(!Array.isArray(input.decisions)||input.decisions.length!==batch.items.length)fail(422,'review_all_rows','每行都必须选择新建、关联或跳过');
  const map=new Map(input.decisions.map(x=>[x.row,x]));if(map.size!==batch.items.length)fail(422,'duplicate_decision');
  const created=[],linked=[],skipped=[];
  for(const r of batch.items){const d=map.get(r.row);if(!d)fail(422,'missing_decision');
   if(d.action==='skip'){skipped.push(r.row);continue;}
   if(d.action==='link'){if(!r.matches.some(m=>m.id===d.id))fail(422,'invalid_match');linked.push(d.id);continue;}
   if(d.action!=='create'||!r.name)fail(422,'invalid_decision');
   if((r.issues.length||r.matches.length)&&d.confirm!==true)fail(422,'conflict_confirmation','存在重复或字段问题，需逐行确认');
   const record=store.write(actor,'creators',{name:r.name,email:r.email,social_url:r.social_url,country:r.country,tags:[],notes:'',archived:false,import_source:{batch:batch.id,row:r.row,owner_label:r.source_owner,followers_raw:r.source_followers,observation_time:null},review_status:'IMPORTED_REVIEW_PENDING'});created.push(record.id);
  }
  return store.write(actor,'imports',{...payload(batch),status:'committed',created_ids:created,linked_ids:linked,skipped_rows:skipped},{id:batch.id,version:batch.version,owner:batch.owner});
 }
 if(action==='rollback'){
  if(batch.status==='rolled_back')return batch;if(batch.status!=='committed')fail(409,'invalid_import_status');
  for(const rid of batch.created_ids){const r=store.get(rid,actor.tenant_key);if(r.version!==1||store.db.prepare('SELECT 1 FROM records WHERE tenant=? AND parent=? LIMIT 1').get(actor.tenant_key,rid))fail(409,'rollback_conflict','导入记录已有后续修改或合作，不可自动撤销');}
  for(const rid of batch.created_ids){const r=store.get(rid,actor.tenant_key);store.write(actor,'creators',{...payload(r),archived:true,review_status:'IMPORT_ROLLED_BACK'},{id:r.id,version:r.version,owner:r.owner});}
  return store.write(actor,'imports',{...payload(batch),status:'rolled_back'},{id:batch.id,version:batch.version,owner:batch.owner});
 }
 fail(404,'not_found');
}
