"""Reuse successful, same-scope and same-policy screenings before paid work."""
import json,re,shutil
from pathlib import Path

def reuse_completed(db,job,root):
    root=Path(root)
    reused=0
    pending=db.execute("SELECT * FROM discover_candidates WHERE job_id=? AND status='pending' ORDER BY account_key",(job['id'],)).fetchall()
    for candidate in pending:
        account=candidate['account_key']
        if not re.fullmatch(r'(tiktok|instagram)--[a-z0-9_.]+',account):
            continue
        history=db.execute("""SELECT c.*,j.rule_version FROM discover_candidates c
          JOIN discover_jobs j ON j.id=c.job_id
          WHERE c.account_key=? AND c.job_id!=? AND c.status='done'
          AND j.tenant=? AND j.owner=? AND j.rule_version=?
          ORDER BY j.updated_at DESC,j.id DESC""",
          (account,job['id'],job['tenant'],job['owner'],job['rule_version'])).fetchall()
        for previous in history:
            try:
                result=json.loads(previous['result_json'] or 'null')
                source=json.loads(previous['source_json'] or '{}')
                if not isinstance(result,dict) or not isinstance(source,dict):
                    continue
                if result.get('error') or result.get('rule_version')!=job['rule_version']:
                    continue
                if result.get('selected') not in (0,1) or result['selected']!=previous['selected']:
                    continue
                if not re.fullmatch(r'[a-zA-Z0-9_-]+',previous['job_id']):
                    continue
                # The review UI resolves media relative to the current job.
                files=[source.get('avatar_image')]+[p.get('image') for p in source.get('posts',[])]
                files=[f for f in files if f]
                if any(not isinstance(f,str) or not re.fullmatch(r'post-\d{2}\.jpg',f) for f in files):
                    continue
                origin=root.parent/previous['job_id']/account
                if result['selected'] and (not files or any(not (origin/f).is_file() for f in files)):
                    continue
                dest=root/account
                if result['selected']:
                    dest.mkdir(parents=True,exist_ok=True)
                    for f in set(files):
                        shutil.copy2(origin/f,dest/f)
                result=dict(result)
                result['reused_from_job']=previous['job_id']
                result['reuse_rule_version']=job['rule_version']
                with db:
                    changed=db.execute("""UPDATE discover_candidates
                      SET status='done',selected=?,result_json=?,source_json=?,error=NULL
                      WHERE job_id=? AND account_key=? AND status='pending'""",
                      (previous['selected'],json.dumps(result),previous['source_json'],job['id'],account)).rowcount
                reused+=changed
                break
            except (ValueError,TypeError,AttributeError,OSError):
                # Missing/corrupt evidence must fall through to fresh screening.
                continue
    return reused
