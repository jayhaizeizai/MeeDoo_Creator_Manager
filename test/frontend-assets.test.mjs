import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createApp} from '../server.mjs';
test('real HTTP server serves every transitive frontend module with JavaScript MIME',async()=>{
 const server=createApp({APP_ORIGIN:'http://localhost'});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,seen=new Set();
 async function visit(path){if(seen.has(path))return;seen.add(path);const response=await fetch(base+path);assert.equal(response.status,200,path);assert.match(response.headers.get('content-type'),/^(?:text|application)\/javascript/,path);const text=await response.text();for(const m of text.matchAll(/(?:from\s*|import\s*)['"](\.[^'"]+)['"]/g))await visit(new URL(m[1],base+path).pathname);}
 try{await visit('/app.js');await visit('/workspace.js');assert.equal((await fetch(base+'/import-review.mjs')).status,200);assert.ok(seen.has('/vendor/dompurify.mjs'));assert.equal((await fetch(base+'/lib/store.mjs')).status,404);}finally{await new Promise(r=>server.close(r));}
});
