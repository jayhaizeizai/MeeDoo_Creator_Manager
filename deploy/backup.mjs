import {DatabaseSync,backup} from 'node:sqlite';
import {mkdir,chmod} from 'node:fs/promises';
import {join} from 'node:path';
if(!process.env.DB_PATH)throw Error('DB_PATH is required');
const directory=process.env.BACKUP_DIR||'/var/backups/meedoo-creator';
await mkdir(directory,{recursive:true,mode:0o700});
const db=new DatabaseSync(process.env.DB_PATH,{readOnly:true});
const path=join(directory,'workspace-'+new Date().toISOString().replace(/[:.]/g,'-')+'.sqlite');
try{await backup(db,path);await chmod(path,0o600);const verify=new DatabaseSync(path,{readOnly:true});try{if(verify.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')throw Error('Backup integrity failure');}finally{verify.close();}console.log('Database backup completed and verified');}finally{db.close();}
