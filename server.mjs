import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {randomBytes,createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {createBackend} from './lib/api.mjs';
const rand=()=>randomBytes(32).toString('base64url');
const hash=s=>createHash('sha256').update(s).digest('hex');
export function createApp(env=process.env, upstream=fetch){
 const origin=env.APP_ORIGIN||'http://localhost:4317', secure=origin.startsWith('https://');
 if(env.NODE_ENV==='production'&&!secure)throw Error('Production requires HTTPS APP_ORIGIN');
 if(env.NODE_ENV==='production'&&!env.DB_PATH)throw Error('Production requires persistent DB_PATH');
 const backend=createBackend({...env,APP_ORIGIN:origin},upstream);
 const admins=(env.LARK_ADMIN_OPEN_IDS||'').split(',').map(x=>x.trim()).filter(Boolean);
 const sessions=new Map(), flows=new Map();
 const ids=(env.LARK_ALLOWED_OPEN_IDS||'').split(',').map(x=>x.trim()).filter(Boolean);
 const tenants=(env.LARK_ALLOWED_TENANTS||'').split(',').map(x=>x.trim()).filter(Boolean);
 const ready=!!(env.LARK_APP_ID&&env.LARK_APP_SECRET&&tenants.length&&ids.length);
 const cookie=(name,value,age)=>`${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${secure?'; Secure':''}`;
 const cookieName=secure?'__Host-meedoo_session':'meedoo_session';
 const flowName=secure?'__Host-meedoo_flow':'meedoo_flow';
 const callback=origin+'/auth/lark/callback';
 const allowed=u=>!!u.open_id&&ids.includes(u.open_id)&&!!u.tenant_key&&tenants.includes(u.tenant_key);
 async function jsonFetch(url,opts){const r=await upstream(url,{...opts,signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error('Provider unavailable');return r.json();}
 const server=http.createServer(async(req,res)=>{
  const now=Date.now();for(const [k,v]of sessions)if(v.exp<now)sessions.delete(k);for(const[k,v]of flows)if(v.exp<now)flows.delete(k);
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  if(secure)res.setHeader('Strict-Transport-Security','max-age=31536000');
  const send=(status,obj)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(obj));};
  const redirect=location=>{res.writeHead(302,{Location:location});res.end();};
  try{
   const url=new URL(req.url,origin), cookies=Object.fromEntries((req.headers.cookie||'').split(';').map(s=>{const i=s.indexOf('=');return i<0?['','']:[s.slice(0,i).trim(),s.slice(i+1)];}));
   const sess=sessions.get(hash(cookies[cookieName]||''));
   if(url.pathname==='/healthz')return send(200,{status:'ok'});
   if(url.pathname==='/api/auth/status')return send(200,{configured:ready});
   if(url.pathname==='/api/session')return sess?send(200,{user:sess.user,csrf:sess.csrf}):send(401,{error:'authentication_required'});
   if(url.pathname==='/auth/google/callback'&&req.method==='GET'){
    try{await backend.integrations.finish(url,sess);return redirect('/?integration=google-connected');}
    catch{return redirect('/?integration=google-error');}
   }
   if(url.pathname==='/auth/lark/start'&&req.method==='GET'){
    if(!ready)return redirect('/?auth=not-configured');
    if(flows.size>=1000)return send(429,{error:'try_later'});
    const state=rand(), browser=rand();flows.set(state,{browser:hash(browser),exp:now+600000});res.setHeader('Set-Cookie',cookie(flowName,browser,600));
    const dest=new URL('https://accounts.larksuite.com/open-apis/authen/v1/authorize');
    dest.search=new URLSearchParams({client_id:env.LARK_APP_ID,redirect_uri:callback,response_type:'code',state}).toString();return redirect(dest.toString());
   }
   if(url.pathname==='/auth/lark/callback'&&req.method==='GET'){
    const state=url.searchParams.get('state'),flow=flows.get(state);flows.delete(state);
    res.setHeader('Set-Cookie',cookie(flowName,'',0));
    if(!ready||!flow||flow.exp<now||flow.browser!==hash(cookies[flowName]||'')||!url.searchParams.get('code'))return redirect('/?auth=invalid');
    try{
     const token=await jsonFetch('https://open.larksuite.com/open-apis/authen/v2/oauth/token',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({grant_type:'authorization_code',client_id:env.LARK_APP_ID,client_secret:env.LARK_APP_SECRET,code:url.searchParams.get('code'),redirect_uri:callback})});
     if(token.code!==0||!token.access_token)throw Error('Token rejected');
     const info=await jsonFetch('https://open.larksuite.com/open-apis/authen/v1/user_info',{headers:{Authorization:`Bearer ${token.access_token}`}});
     if(info.code!==0||!allowed(info.data||{}))return redirect('/?auth=denied');
     const u=info.data,sid=rand();sessions.delete(hash(cookies[cookieName]||''));
     sessions.set(hash(sid),{exp:now+8*3600000,user:{name:u.name||'Team member',open_id:u.open_id,tenant_key:u.tenant_key,role:admins.includes(u.open_id)?'admin':'operator'},csrf:rand()});
     res.setHeader('Set-Cookie',[cookie(flowName,'',0),cookie(cookieName,sid,28800)]);return redirect('/');
    }catch{return redirect('/?auth=provider-error');}
   }
   if(url.pathname==='/auth/logout'&&req.method==='POST'){
    if(!sess||req.headers.origin!==origin||req.headers['x-csrf-token']!==sess.csrf)return send(403,{error:'forbidden'});
    sessions.delete(hash(cookies[cookieName]));res.setHeader('Set-Cookie',cookie(cookieName,'',0));return send(200,{ok:true});
   }
   if(url.pathname.startsWith('/api/'))return await backend.handle(req,res,url,sess,send);
   if(req.method!=='GET'&&req.method!=='HEAD')return send(405,{error:'method_not_allowed'});
   const assets={'/':['index.html','text/html'],'/app.js':['app.js','text/javascript'],'/workspace.js':['workspace.js','text/javascript'],'/style.css':['style.css','text/css']};
   const asset=assets[url.pathname];if(!asset)return send(404,{error:'not_found'});
   const body=await readFile(new URL('./public/'+asset[0],import.meta.url));res.writeHead(200,{'Content-Type':asset[1]+'; charset=utf-8'});res.end(req.method==='HEAD'?undefined:body);
  }catch{send(500,{error:'internal_error'});}
 });
 server.on('listening',()=>backend.integrations.startWorker());
 server.on('close',()=>{backend.integrations.stopWorker(()=>backend.store.close());});
 return server;
}
if(process.argv[1]===fileURLToPath(import.meta.url))createApp().listen(Number(process.env.PORT||4317),'127.0.0.1',()=>console.log('MeeDoo listening on loopback'));
