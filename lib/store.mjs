import {DatabaseSync} from 'node:sqlite';
import {mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
import {randomUUID} from 'node:crypto';

export class Problem extends Error {
  constructor(status, code, detail=code) { super(detail); this.status=status; this.code=code; }
}
export const fail=(status,code,detail)=>{throw new Problem(status,code,detail);};
export class Store {
  constructor(path=':memory:') {
    if(path!==':memory:')mkdirSync(dirname(path),{recursive:true,mode:0o700});
    this.db=new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS records (
        id TEXT PRIMARY KEY, kind TEXT NOT NULL, tenant TEXT NOT NULL, owner TEXT NOT NULL,
        parent TEXT, version INTEGER NOT NULL, data TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS records_scope ON records(tenant,kind,owner);
      CREATE INDEX IF NOT EXISTS records_parent ON records(tenant,parent);
      CREATE TABLE IF NOT EXISTS audit (
        seq INTEGER PRIMARY KEY AUTOINCREMENT, tenant TEXT NOT NULL, actor TEXT NOT NULL,
        action TEXT NOT NULL, record_id TEXT NOT NULL, before_json TEXT, after_json TEXT, at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS audit_scope ON audit(tenant,record_id,seq);
      CREATE TABLE IF NOT EXISTS idempotency (
        tenant TEXT NOT NULL, actor TEXT NOT NULL, key TEXT NOT NULL, fingerprint TEXT NOT NULL,
        result TEXT NOT NULL, PRIMARY KEY(tenant,actor,key)
      );
      PRAGMA user_version=1;`);
  }
  close(){this.db.close();}
  transaction(fn){this.db.exec('BEGIN IMMEDIATE');try{const result=fn();this.db.exec('COMMIT');return result;}catch(e){this.db.exec('ROLLBACK');throw e;}}
  unpack(r){return r?{...JSON.parse(r.data),id:r.id,kind:r.kind,tenant:r.tenant,owner:r.owner,parent:r.parent,version:r.version,created_at:r.created_at,updated_at:r.updated_at}:null;}
  list(kind,tenant){return this.db.prepare('SELECT * FROM records WHERE tenant=? AND kind=? ORDER BY created_at DESC,id').all(tenant,kind).map(r=>this.unpack(r));}
  get(id,tenant){const r=this.unpack(this.db.prepare('SELECT * FROM records WHERE id=? AND tenant=?').get(id,tenant));if(!r)fail(404,'not_found','记录不存在');return r;}
  write(actor,kind,data,{id,version,parent=null,owner=actor.open_id}={}){
    const at=new Date().toISOString();const before=id?this.get(id,actor.tenant_key):null;
    if(before&&before.version!==version)fail(409,'version_conflict','记录已被更新，请刷新后重试');
    if(before&&before.kind!==kind)fail(400,'wrong_kind');
    id ||= randomUUID(); const nextVersion=before?before.version+1:1;
    this.db.prepare(`INSERT INTO records VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET owner=excluded.owner,parent=excluded.parent,version=excluded.version,data=excluded.data,updated_at=excluded.updated_at`).run(id,kind,actor.tenant_key,owner,parent,nextVersion,JSON.stringify(data),before?.created_at||at,at);
    const result=this.get(id,actor.tenant_key);this.audit(actor,before?'update':'create',id,before,result);return result;
  }
  audit(actor,action,id,before,after){this.db.prepare('INSERT INTO audit(tenant,actor,action,record_id,before_json,after_json,at) VALUES(?,?,?,?,?,?,?)').run(actor.tenant_key,actor.open_id,action,id,before?JSON.stringify(before):null,after?JSON.stringify(after):null,new Date().toISOString());}
  history(id,tenant){return this.db.prepare('SELECT seq,actor,action,record_id,before_json,after_json,at FROM audit WHERE tenant=? AND record_id=? ORDER BY seq DESC LIMIT 200').all(tenant,id).map(r=>({...r,before:JSON.parse(r.before_json),after:JSON.parse(r.after_json),before_json:undefined,after_json:undefined}));}
}
