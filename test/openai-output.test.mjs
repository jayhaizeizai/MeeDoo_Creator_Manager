import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createBackend} from '../lib/api.mjs';

for(const recover of [true,false])test(`OpenAI invalid citation ${recover?'recovers once':'fails without saving'} and final output excludes commentary`,async()=>{
 const actor={role:'admin',open_id:'a',tenant_key:'t'};let calls=0;
 const b=createBackend({AI_PROVIDER:'openai',OPENAI_API_KEY:'fake',OPENAI_MODEL:'test-model',WORK_EMAIL:'jay@example.test'},async(url,opts)=>{
  assert.equal(url,'https://api.openai.com/v1/responses');calls++;
  const req=JSON.parse(opts.body),schema=req.text.format.schema;
  assert.ok(schema.properties.source_ids.items.enum.includes('m1'));
  assert.ok(!schema.properties.source_ids.items.enum.includes('invented'));
  if(calls===2)assert.match(req.instructions,/previous validation failure: invalid_source_ids/);
  const output={summary:'回复问题',action:'draft',draft:'Hi there,\nThank you for your question. We will confirm the details.\nWarmly,\nJay Lee\nMeeDoo',unknowns:[],source_ids:[recover&&calls===2?'m1':'invented'],reply_reason:'对方提出问题',reply_evidence_ids:['m1'],requested_materials:[],template_id:''};
  return {ok:true,json:async()=>({status:'completed',output:[{type:'message',phase:'commentary',content:[{type:'output_text',text:'Preparing a response.'}]},{type:'message',phase:'final_answer',content:[{type:'output_text',text:JSON.stringify(output)}]}]})};
 });
 try{
  const raw={id:'thread',messages:[{id:'m1',payload:{mimeType:'text/plain',headers:[{name:'From',value:'creator@example.test'}],body:{data:Buffer.from('Can you confirm the commission details?').toString('base64url')}}}]};
  const t=b.store.write(actor,'mail_threads',{...b.integrations.normalizeThread(raw),classification:'unreviewed'});
  if(recover){const result=await b.integrations.analyze(actor,t.id,{reply:true,cached:true});assert.ok(result.draft);assert.deepEqual(result.source_ids,['m1']);}
  else{await assert.rejects(b.integrations.analyze(actor,t.id,{reply:true,cached:true}),e=>e.code==='invalid_ai_output'&&e.message.includes('引用来源'));assert.equal(b.store.list('agent_runs','t').length,0);}
  assert.equal(calls,2);
 }finally{b.store.close();}
});
