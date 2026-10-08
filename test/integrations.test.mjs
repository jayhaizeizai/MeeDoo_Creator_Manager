import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Store} from '../lib/store.mjs';
import {createIntegrations} from '../lib/integrations.mjs';
const env={GMAIL_REQUEST_INTERVAL_MS:'0',APP_ORIGIN:'https://creator.example',GOOGLE_CLIENT_ID:'test-client',GOOGLE_CLIENT_SECRET:'test-secret',TOKEN_ENCRYPTION_KEY:'11'.repeat(32),WORK_EMAIL:'work@example.test'};
const sess={user:{role:'admin',open_id:'admin',tenant_key:'tenant'},csrf:'browser-binding'};
function harness(overrides={}){const store=new Store();const calls=[];const upstream=async(url,options)=>{calls.push(url);let data;if(url.includes('/token'))data={access_token:'private-access',refresh_token:'private-refresh',scope:overrides.scope||'https://www.googleapis.com/auth/gmail.readonly'};else if(url.endsWith('/profile'))data={emailAddress:overrides.email||env.WORK_EMAIL};else if(url.includes('threads?'))data={threads:[{id:'thread-1'}]};else data={id:'thread-1',historyId:'10',messages:[{id:'msg-1',threadId:'thread-1',labelIds:['SENT'],internalDate:'1',payload:{mimeType:'text/plain',headers:[{name:'From',value:env.WORK_EMAIL},{name:'To',value:'creator@example.test'},{name:'Subject',value:'Collaboration'}],body:{data:Buffer.from('Hello').toString('base64url')}}}]};return {ok:true,json:async()=>data};};const service=createIntegrations(store,env,upstream);return {store,service,calls};}
async function connect(service){const start=service.start(sess);const state=new URL(start.url).searchParams.get('state');const callback=new URL(env.APP_ORIGIN+'/auth/google/callback?code=test&state='+state);await service.finish(callback,sess);return callback;}
test('Google OAuth is browser-bound, one-use, mailbox-restricted and encrypted at rest',async()=>{
 const h=harness();try{
 const callback=await connect(h.service);assert.equal(h.service.status(sess.user).gmail_connected,true);
 const row=h.store.db.prepare('SELECT * FROM connections').get();assert.ok(!JSON.stringify(row).includes('private-refresh'));assert.ok(!JSON.stringify(h.store.history('gmail','tenant')).includes('private-refresh'));
 await assert.rejects(()=>h.service.finish(callback,sess),e=>e.code==='invalid_google_state');
 const start=h.service.start(sess),wrong=new URL(env.APP_ORIGIN+'/auth/google/callback?code=test&state='+new URL(start.url).searchParams.get('state'));
 await assert.rejects(()=>h.service.finish(wrong,{...sess,csrf:'different'}),e=>e.code==='invalid_google_state');
 }finally{h.store.close();}
 const wrong=harness({email:'other@example.test'});try{await assert.rejects(()=>connect(wrong.service),e=>e.code==='wrong_mailbox');assert.equal(wrong.service.status(sess.user).gmail_connected,false);}finally{wrong.store.close();}
});
test('full-thread synchronization is idempotent, unclassified and never sends',async()=>{
 const h=harness();try{await connect(h.service);await h.service.sync(sess.user,{after:'2026-01-01'});await h.service.sync(sess.user,{after:'2026-01-01'});
 const rows=h.store.list('mail_threads','tenant');assert.equal(rows.length,1);assert.equal(rows[0].version,1);assert.equal(rows[0].classification,'unreviewed');assert.equal(rows[0].messages[0].labels[0],'SENT');assert.ok(h.calls.every(url=>!url.includes('/send')));
 h.service.disconnect(sess.user);await assert.rejects(()=>h.service.sync(sess.user,{after:'2026-01-01'}),e=>e.code==='gmail_not_connected');
 }finally{h.store.close();}
});
test('attachments stay incomplete while HTML-only text is extracted',()=>{
 const h=harness();try{const raw={id:'t',messages:[{id:'m',payload:{mimeType:'multipart/mixed',parts:[{mimeType:'text/plain',body:{data:Buffer.from('text').toString('base64url')}},{filename:'terms.pdf',body:{attachmentId:'attachment'}}]}}]};assert.equal(h.service.normalizeThread(raw).complete,false);assert.equal(h.service.normalizeThread({id:'t',messages:[{id:'m',payload:{mimeType:'text/html',body:{data:'eA'}}}]}).complete,true);}finally{h.store.close();}
});

test('automatic job follows every page, resumes a persisted cursor and deduplicates refreshes',async()=>{
 const store=new Store();let failPage=false;
 const upstream=async url=>{let data;
 if(url.includes('/token'))data={access_token:'access',refresh_token:'refresh',scope:'https://www.googleapis.com/auth/gmail.readonly'};
 else if(url.endsWith('/profile'))data={emailAddress:env.WORK_EMAIL};
 else if(url.includes('threads?')){assert.ok(!new URL(url).searchParams.get('q').includes('after:'));const second=new URL(url).searchParams.get('pageToken');if(second&&failPage)return {ok:false};data=second?{threads:[{id:'two'}]}:{threads:[{id:'one'}],nextPageToken:'cursor'};}
 else {const id=url.includes('/two?')?'two':'one';data={id,messages:[{id:'m-'+id,internalDate:'1',payload:{mimeType:'text/plain',headers:[],body:{data:'SGVsbG8'}}}]};}
 return {ok:true,json:async()=>data};};
 let service=createIntegrations(store,env,upstream);
 try{await connect(service);await service.tick();assert.equal(store.list('mail_threads','tenant').length,1);assert.equal(service.status(sess.user).sync.state,'queued');
 service=createIntegrations(store,env,upstream);failPage=true;await service.tick();assert.equal(service.status(sess.user).sync.state,'error');assert.equal(store.db.prepare('SELECT page_token FROM mail_sync').get().page_token,'cursor');
 failPage=false;service.queue(sess.user);await service.tick();assert.equal(store.list('mail_threads','tenant').length,2);assert.equal(service.status(sess.user).sync.state,'idle');assert.equal(service.status(sess.user).sync.count,2);
 service.queue(sess.user);await service.tick();await service.tick();assert.equal(store.list('mail_threads','tenant').length,2);assert.ok(store.list('mail_threads','tenant').every(r=>r.version===1));
 service.disconnect(sess.user);await service.tick();assert.equal(service.status(sess.user).sync,null);
 }finally{store.close();}
});


test('HTML alternatives and declared charsets are retained without mixing, with HTML-only text extraction',()=>{
 const h=harness();try{const msg={id:'m',payload:{mimeType:'multipart/alternative',parts:[{mimeType:'text/plain',headers:[{name:'Content-Type',value:'text/plain; charset=iso-8859-1'}],body:{data:Buffer.from([99,97,102,233]).toString('base64url')}},{mimeType:'text/html',body:{data:Buffer.from('<p><b>café</b></p>').toString('base64url')}}]}};
 const result=h.service.normalizeThread({id:'t',messages:[msg]});assert.equal(result.messages[0].body,'café');assert.equal(result.messages[0].html_body,'<p><b>café</b></p>');assert.equal(result.render_version,3);assert.equal(result.complete,true);
 msg.payload.parts.shift();assert.equal(h.service.normalizeThread({id:'t',messages:[msg]}).complete,true);
 }finally{h.store.close();}
});
test('unchanged provider content is reprocessed once when the rendering format changes',async()=>{
 const h=harness();try{await connect(h.service);await h.service.sync(sess.user);h.store.db.prepare("UPDATE records SET data=json_remove(data,'$.render_version') WHERE kind='mail_threads'").run();await h.service.sync(sess.user);assert.equal(h.store.list('mail_threads','tenant')[0].render_version,3);assert.equal(h.store.list('mail_threads','tenant')[0].version,2);await h.service.sync(sess.user);assert.equal(h.store.list('mail_threads','tenant')[0].version,2);}finally{h.store.close();}
});

test('OAuth requests read and send; granted scopes are recorded without enabling sending',async()=>{
 const h=harness({scope:'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send'});try{const url=new URL(h.service.start(sess).url);assert.deepEqual(url.searchParams.get('scope').split(' '),['https://www.googleapis.com/auth/gmail.readonly','https://www.googleapis.com/auth/gmail.send']);assert.equal(url.searchParams.get('prompt'),'consent');await connect(h.service);assert.equal(h.service.status(sess.user).send_authorized,true);assert.equal(h.service.status(sess.user).send_enabled,false);assert.equal(h.service.status(sess.user).reauthorization_required,false);h.service.disconnect(sess.user);assert.equal(h.store.db.prepare('SELECT count(*) n FROM connection_scopes').get().n,0);}finally{h.store.close();}
 const partial=harness();try{await connect(partial.service);assert.equal(partial.service.status(sess.user).gmail_connected,true);assert.equal(partial.service.status(sess.user).send_authorized,false);assert.equal(partial.service.status(sess.user).reauthorization_required,true);}finally{partial.store.close();}
});
