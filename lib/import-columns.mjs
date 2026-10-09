import {createHash} from 'node:crypto';
import {fail} from './store.mjs';
import {payload} from './domain.mjs';
export const columnFields=[['skip','跳过此列'],['name','Creator 姓名'],['email','联系邮箱'],['social_url','社交账号网址'],['tiktok','TikTok'],['instagram','Instagram'],['youtube','YouTube'],['country','国家 / 地区'],['tags','标签'],['notes','备注'],['source_owner','原表负责人（来源）'],['source_followers','粉丝数（来源）']];
const accountFields=['social_url','tiktok','instagram','youtube'];
function guess(h){const k=h.trim().toLowerCase();return ({name:'name','姓名':'name',email:'email','collab email':'email',social_url:'social_url','tictok kol':'tiktok',tiktok:'tiktok',instagram:'instagram',youtube:'youtube',country:'country','国家':'country',owner:'source_owner','关注者数量':'source_followers','media kit':'notes',notes:'notes','备注':'notes',tags:'tags','标签':'tags','priority 1':'tags','selling own products':'tags','品牌匹配':'tags','有小型狗':'tags'})[k]||'skip';}
function social(value,field='social_url'){let v=value.trim();if(/^@?[\w.-]+$/.test(v)&&['tiktok','instagram','youtube'].includes(field))v='https://'+field+'.com/'+(field==='tiktok'?'@':'')+v.replace(/^@/,'');try{const u=new URL(v),host=u.hostname.toLowerCase().replace(/^www\./,'');if(!['tiktok.com','instagram.com','youtube.com'].includes(host)||!/^\/@?[\w.-]+\/?$/.test(u.pathname))return '';if(field!=='social_url'&&host!==field+'.com')return '';return 'https://'+host+u.pathname.toLowerCase().replace(/\/$/,'');}catch{return '';}}
function plan(items,existing){const pool=[...existing],result=[];for(const r of items){let matches=[];if(!r.name){result.push({...r,operation:'blocked',reason:'姓名、有效账号和邮箱均为空'});continue;}
 const accounts=r.social_url?pool.filter(e=>social(e.social_url||'')===r.social_url):[];
 const emails=r.email?pool.filter(e=>e.email?.toLowerCase()===r.email.toLowerCase()):[];
 if(accounts.length){matches=accounts;if(emails.some(e=>!accounts.some(a=>a.id===e.id))&&!accounts.some(a=>a.email?.toLowerCase()===r.email.toLowerCase())){result.push({...r,operation:'blocked',reason:'账号和邮箱指向不同记录'});continue;}}
 else matches=r.social_url?emails.filter(e=>!e.social_url):emails;
 if(matches.length>1){result.push({...r,operation:'blocked',reason:'多个现有记录匹配，需核对身份'});continue;}
 if(matches.length){result.push({...r,operation:'link',match_id:matches[0].id});continue;}
 result.push({...r,operation:'create'});pool.push({...r,id:'row:'+r.row});
 }return result;}
export function columnImport(store,actor,action,id,input,parseCSV){
 if(action==='columns'){const {headers,rows}=parseCSV(input.csv);const seen=new Set();return {count:rows.length,fields:columnFields,columns:headers.map(header=>{let suggested=guess(header),group=accountFields.includes(suggested)?'account':suggested;if(!['skip','tags','notes'].includes(group)&&seen.has(group))suggested='skip';if(suggested!=='skip')seen.add(group);return {header,suggested,samples:rows.map(r=>r[header]).filter(Boolean).slice(0,3).map(v=>v.slice(0,120))};})};}
 if(action==='mapped-preview'){
 const {headers,rows}=parseCSV(input.csv),mapping=input.mapping;if(!Array.isArray(mapping)||mapping.length!==headers.length)fail(422,'invalid_mapping','每列必须指定字段或跳过');const selected=new Set(),names=new Set();
 for(const m of mapping){if(!headers.includes(m.header)||names.has(m.header)||!columnFields.some(([v])=>v===m.field))fail(422,'invalid_mapping');names.add(m.header);const group=accountFields.includes(m.field)?'account':m.field;if(!['skip','tags','notes'].includes(group)&&selected.has(group))fail(422,'duplicate_mapping','姓名、邮箱、账号等字段只能匹配一个来源列');selected.add(group);}
 if(!['name','email','account'].some(k=>selected.has(k)))fail(422,'identity_mapping_required','请至少匹配姓名、邮箱或社交账号中的一列');
 const fingerprint=createHash('sha256').update(JSON.stringify({version:2,csv:input.csv,mapping})).digest('hex');const prior=store.list('imports',actor.tenant_key).find(r=>r.fingerprint===fingerprint&&r.status==='committed');if(prior)return prior;
 const items=rows.map((r,i)=>{const item={row:i+2,name:'',email:'',social_url:'',country:'',tags:[],notes:'',source_owner:'',source_followers:'',warnings:[]};for(const m of mapping){const value=r[m.header].trim();if(m.field==='skip'||!value)continue;
 if(m.field==='email'){const email=value.replace(/^mailto:/i,'').trim();if(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))item.email=email;else item.warnings.push('已忽略无效邮箱，其他字段保留');}
 else if(accountFields.includes(m.field)){item.social_url=social(value,m.field);if(!item.social_url)item.warnings.push('已忽略无效账号，其他字段保留');}
 else if(m.field==='tags')item.tags.push(m.header+': '+value);
 else if(m.field==='notes')item.notes+=(item.notes?'\n':'')+m.header+': '+value;
 else item[m.field]=value;
 }item.name ||= item.social_url.split('/').pop()||item.email;return item;});
 const planned=plan(items,store.list('creators',actor.tenant_key).filter(r=>!r.archived));return store.write(actor,'imports',{mode:'columns',fingerprint,status:'preview',mapping,items,preview:planned,summary:{create:planned.filter(r=>r.operation==='create').length,link:planned.filter(r=>r.operation==='link').length,blocked:planned.filter(r=>r.operation==='blocked').length,field_warnings:items.reduce((n,r)=>n+r.warnings.length,0)},created_ids:[],linked_ids:[],skipped_rows:[]});
 }
 if(action==='mapped-commit'){const batch=store.get(id,actor.tenant_key);if(batch.kind!=='imports'||batch.mode!=='columns')fail(404,'not_found');if(batch.status==='committed')return batch;if(batch.status!=='preview')fail(409,'invalid_import_status');if(input.confirm!==true)fail(422,'confirmation_required');
 const planned=plan(batch.items,store.list('creators',actor.tenant_key).filter(r=>!r.archived)),created=[],linked=[],skipped=[],refs=new Map();
 for(const r of planned){if(r.operation==='blocked'){skipped.push(r.row);continue;}if(r.operation==='link'){linked.push(refs.get(r.match_id)||r.match_id);continue;}
 const record=store.write(actor,'creators',{status:'UNCONTACTED',name:r.name,email:r.email,social_url:r.social_url,country:r.country,tags:r.tags,notes:r.notes,archived:false,review_status:'IMPORTED_REVIEW_PENDING',import_source:{batch:id,row:r.row,owner_label:r.source_owner,followers_raw:r.source_followers,observation_time:null}},{owner:actor.open_id});created.push(record.id);refs.set('row:'+r.row,record.id);
 }
 return store.write(actor,'imports',{...payload(batch),status:'committed',created_ids:created,linked_ids:linked,skipped_rows:skipped,exceptions:planned.filter(r=>r.operation==='blocked').map(r=>({row:r.row,name:r.name,reason:r.reason}))},{id:batch.id,version:batch.version,owner:batch.owner});
 }
}
