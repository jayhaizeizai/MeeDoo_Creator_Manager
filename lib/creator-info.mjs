import {readFile,realpath} from 'node:fs/promises';
import path from 'node:path';
import {authorize,canRead} from './domain.mjs';
import {fail} from './store.mjs';
export function socialInfo(value){try{const u=new URL(value),host=u.hostname.toLowerCase().replace(/^www\./,''),part=u.pathname.split('/').filter(Boolean);const platform=({'tiktok.com':'TikTok','instagram.com':'Instagram','youtube.com':'YouTube'})[host]||'';return {platform,username:platform?(part[0]||'').replace(/^@/,''):'',profile_url:platform?u.href:''};}catch{return {platform:'',username:'',profile_url:''};}}
export function creatorInfo(store,env={}){
 const db=store.db;db.exec('CREATE TABLE IF NOT EXISTS creator_profile_info(tenant TEXT NOT NULL,creator_id TEXT NOT NULL,profile TEXT NOT NULL,checked_at TEXT NOT NULL,PRIMARY KEY(tenant,creator_id))');
 function snapshot(actor,c){const row=db.prepare('SELECT c.source_json,c.result_json,c.job_id,c.account_key,j.owner FROM discover_candidates c JOIN discover_jobs j ON j.id=c.job_id WHERE c.creator_id=? AND j.tenant=? ORDER BY j.created_at DESC LIMIT 1').get(c.id,actor.tenant_key);if(!row||!canRead(actor,row))return null;return {...row,source:JSON.parse(row.source_json||'{}'),result:JSON.parse(row.result_json||'{}')};}
 function enrich(actor,c){const social=socialInfo(c.social_url),snap=snapshot(actor,c),saved=db.prepare('SELECT profile,checked_at FROM creator_profile_info WHERE tenant=? AND creator_id=?').get(actor.tenant_key,c.id),profile=saved?JSON.parse(saved.profile):{};
  const followers=profile.followers??snap?.result.followers??snap?.source.followers?.count??null;
  const threads=store.list('mail_threads',actor.tenant_key).filter(t=>canRead(actor,t)&&t.creator_id===c.id&&!t.provider_deleted).sort((a,b)=>Number(b.messages?.at(-1)?.at||0)-Number(a.messages?.at(-1)?.at||0));
  return {...c,...social,followers,avatar:(profile.avatar||snap?.source.avatar_image)?`/api/creators/${c.id}/avatar`:null,conversations:threads.length,thread_id:threads[0]?.id||null,last_email_at:threads[0]?.messages?.at(-1)?.at||null,next_email_at:c.next_email_at||null};
 }
 async function avatar(actor,id){const c=store.get(id,actor.tenant_key);authorize(actor,c);if(c.kind!=='creators')fail(404,'not_found');const saved=db.prepare('SELECT profile FROM creator_profile_info WHERE tenant=? AND creator_id=?').get(actor.tenant_key,id);if(saved&&JSON.parse(saved.profile).avatar&&/^[a-f0-9-]{36}$/.test(id)){try{return await readFile(path.join(env.CREATOR_PROFILE_DIR||'/var/lib/meedoo-creator/creator-profiles',id,'post-00.jpg'));}catch{fail(404,'image_unavailable');}}const snap=snapshot(actor,c),file=snap?.source.avatar_image;if(!file||!/^post-\d{2}\.jpg$/.test(file)||! /^[a-z0-9-]+$/i.test(snap.job_id)||! /^(tiktok|instagram)--[a-z0-9_.]+$/i.test(snap.account_key))fail(404,'not_found');try{const root=await realpath(env.DISCOVER_DATA_DIR||'/var/lib/meedoo-creator/discover'),full=await realpath(path.join(root,snap.job_id,snap.account_key,file));if(!full.startsWith(root+path.sep))fail(404,'not_found');return await readFile(full);}catch{fail(404,'image_unavailable');}}
 return {enrich,avatar};
}
