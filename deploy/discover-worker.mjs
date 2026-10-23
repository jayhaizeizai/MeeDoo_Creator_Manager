import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {Store} from '../lib/store.mjs';
import {discover} from '../lib/discover.mjs';
const env=process.env,store=new Store(env.DB_PATH),service=discover(store);let child=null,stopping=false;
function publish(id){try{service.publish(id);}catch{store.db.prepare('UPDATE discover_jobs SET error=? WHERE id=?').run('list_publish_failed',id);}}
async function tick(){
 if(stopping)return;
 for(const j of store.db.prepare("SELECT DISTINCT j.id FROM discover_jobs j JOIN discover_candidates c ON c.job_id=j.id WHERE c.selected=1 AND c.creator_id IS NULL AND j.state!='failed'").all())publish(j.id);
 if(child)return;
 const j=store.db.prepare("SELECT * FROM discover_jobs WHERE state IN ('queued','searching','analyzing') ORDER BY created_at LIMIT 1").get();if(!j)return;
 if(!env.SCRAPECREATORS_API_KEY||!env.DISCOVER_OPENAI_API_KEY){store.db.prepare("UPDATE discover_jobs SET state='failed',error='discover_keys_missing' WHERE id=?").run(j.id);return;}
 child=spawn(env.DISCOVER_PYTHON||'python3',[fileURLToPath(new URL('../discover/worker.py',import.meta.url)),env.DB_PATH,j.id],{env:{PATH:env.PATH,LANG:'C.UTF-8',PYTHONUNBUFFERED:'1',DISCOVER_CONCURRENCY:env.DISCOVER_CONCURRENCY||'6',SCRAPECREATORS_API_KEY:env.SCRAPECREATORS_API_KEY,DISCOVER_OPENAI_API_KEY:env.DISCOVER_OPENAI_API_KEY,DISCOVER_DATA_DIR:env.DISCOVER_DATA_DIR||'/var/lib/meedoo-creator/discover'},stdio:['ignore','pipe','pipe']});
 child.stdout.on('data',b=>process.stdout.write(b));child.stderr.on('data',()=>{});
 child.on('error',()=>{store.db.prepare("UPDATE discover_jobs SET state='failed',error='worker_start_failed' WHERE id=?").run(j.id);});
 child.on('close',code=>{child=null;publish(j.id);if(code&&!stopping)store.db.prepare("UPDATE discover_jobs SET state='failed',error=coalesce(error,'worker_interrupted') WHERE id=?").run(j.id);});
}
const timer=setInterval(()=>tick().catch(()=>console.error('discover_tick_failed')),5000);await tick();
process.on('SIGTERM',()=>{stopping=true;clearInterval(timer);if(child){child.kill('SIGTERM');child.once('close',()=>{store.close();process.exit(0);});}else{store.close();process.exit(0);}});
