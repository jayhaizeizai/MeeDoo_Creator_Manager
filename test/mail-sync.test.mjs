import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Store} from '../lib/store.mjs';
import {createIntegrations} from '../lib/integrations.mjs';
const env={GMAIL_REQUEST_INTERVAL_MS:'0',APP_ORIGIN:'https://creator.example',GOOGLE_CLIENT_ID:'fixture',GOOGLE_CLIENT_SECRET:'fixture',TOKEN_ENCRYPTION_KEY:'11'.repeat(32),WORK_EMAIL:'work@example.test'};
const actor={role:'admin',open_id:'admin',tenant_key:'tenant'},sess={user:actor,csrf:'fixture'};
function fixture(){
 const store=new Store(),calls=[];let history={historyId:'101'},failure=null;
 const raw=id=>({id,historyId:'100',messages:[{id:'m-'+id,threadId:id,internalDate:'1',labelIds:['INBOX'],payload:{mimeType:'text/plain',headers:[],body:{data:'SGVsbG8'}}}]});
 const upstream=async url=>{calls.push(url);let data;
  if(url.includes('/token'))data={access_token:'fixture',refresh_token:'fixture',scope:'https://www.googleapis.com/auth/gmail.readonly'};
  else if(url.endsWith('/profile'))data={emailAddress:env.WORK_EMAIL,historyId:'100'};
  else if(url.includes('threads?'))data={threads:[{id:'a'},{id:'b'}]};
  else if(url.includes('history?')){if(failure==='history')return {ok:false,status:404,json:async()=>({})};data=typeof history==='function'?history(new URL(url)):history;}
  else {const id=new URL(url).pathname.split('/').at(-1);if(failure===id)return {ok:false,status:failure==='deleted'?404:503,json:async()=>({})};data=raw(id);}
  return {ok:true,json:async()=>data};
 };
 let service=createIntegrations(store,env,upstream);
 return {store,calls,get service(){return service;},setHistory:x=>history=x,setFailure:x=>failure=x,restart:()=>service=createIntegrations(store,env,upstream),async connect(){const state=new URL(service.start(sess).url).searchParams.get('state');await service.finish(new URL(env.APP_ORIGIN+'/auth/google/callback?code=fixture&state='+state),sess);},job:()=>store.db.prepare('SELECT * FROM mail_sync').get(),async tick(){service.queue(actor);await service.tick();},gets:()=>calls.filter(x=>x.includes('/threads/'))};
}
test('initial baseline precedes full traversal; unchanged polls download no conversations',async()=>{
 const h=fixture();try{await h.connect();h.calls.length=0;await h.tick();assert.equal(h.job().history_id,'100');assert.ok(h.calls.findIndex(x=>x.endsWith('/profile'))<h.calls.findIndex(x=>x.includes('threads?')));assert.equal(h.gets().length,2);
 h.calls.length=0;await h.tick();assert.equal(h.job().history_id,'101');assert.equal(h.gets().length,0);assert.equal(h.calls.filter(x=>x.includes('history?')).length,1);assert.equal(h.service.status(actor).sync.mode,'incremental');assert.ok(h.job().next_at>Date.now()+50000);
 h.restart();h.calls.length=0;await h.tick();assert.equal(h.gets().length,0);assert.ok(h.calls.find(x=>x.includes('startHistoryId=101')));
 }finally{h.store.close();}
});
test('history deduplicates changed threads, persists pagination and retries without skipping changes',async()=>{
 const h=fixture();try{await h.connect();await h.tick();h.calls.length=0;
 h.setHistory(url=>url.searchParams.has('pageToken')?{historyId:'110',history:[{messagesAdded:[{message:{threadId:'c'}}]}]}:{historyId:'110',nextPageToken:'next',history:[{messages:[{threadId:'ignored-duplicate'}],messagesAdded:[{message:{threadId:'a'}}],labelsAdded:[{message:{threadId:'a'}}]}]});
 await h.tick();assert.equal(h.gets().length,1);assert.equal(h.job().history_id,'100');assert.equal(h.job().page_token,'next');
 h.restart();h.setFailure('c');await h.tick();assert.equal(h.job().state,'error');assert.equal(h.job().history_id,'100');assert.equal(h.job().page_token,'next');
 h.setFailure(null);await h.tick();assert.equal(h.job().history_id,'110');assert.equal(h.job().page_token,null);assert.equal(h.store.list('mail_threads','tenant').length,3);assert.ok(h.gets().every(x=>!x.includes('/b?')));
 }finally{h.store.close();}
});
test('expired history falls back to full; deleted threads do not poison the cursor',async()=>{
 const h=fixture();try{await h.connect();await h.tick();h.setFailure('history');await h.tick();assert.equal(h.job().history_id,null);assert.equal(h.service.status(actor).sync.mode,'full');h.setFailure(null);await h.tick();assert.equal(h.job().history_id,'100');
 h.store.write(actor,'mail_threads',{provider_id:'deleted',messages:[],subject:'fixture'});h.setFailure('deleted');h.setHistory({historyId:'120',history:[{messagesDeleted:[{message:{threadId:'deleted'}}]}]});await h.tick();assert.equal(h.job().history_id,'120');assert.equal(h.job().state,'idle');assert.equal(h.store.list('mail_threads','tenant').find(x=>x.provider_id==='deleted').provider_deleted,true);
 }finally{h.store.close();}
});
