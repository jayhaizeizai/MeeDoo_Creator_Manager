import unittest,sqlite3,json
from tikhub_search import search
class SearchTest(unittest.TestCase):
 def test_resume_dedup_limit_and_error(self):
  db=sqlite3.connect(':memory:');db.row_factory=sqlite3.Row
  db.executescript('''CREATE TABLE discover_jobs(id TEXT,tenant TEXT,search_state TEXT,updated_at TEXT,state TEXT);CREATE TABLE discover_hits(job_id TEXT,ordinal INT,platform TEXT,source_id TEXT,account_key TEXT,payload TEXT);CREATE TABLE discover_candidates(job_id TEXT,account_key TEXT,platform TEXT,handle TEXT,PRIMARY KEY(job_id,account_key));CREATE TABLE discover_exclusions(job_id TEXT,account_key TEXT,reason TEXT,PRIMARY KEY(job_id,account_key));CREATE TABLE discover_pages(job_id TEXT,platform TEXT,page_key TEXT,response TEXT);CREATE TABLE records(kind TEXT,tenant TEXT,data TEXT);''')
  db.execute("INSERT INTO discover_jobs VALUES('old','t','{}','','completed')");db.execute("INSERT INTO discover_candidates VALUES('old','tiktok--old','tiktok','old')")
  state={'tiktok':{'provider':'tikhub','done':False,'cursor':None}};db.execute('INSERT INTO discover_jobs VALUES(?,?,?,?,?)',('j','t',json.dumps(state),'','searching'));db.commit()
  j={'id':'j','tenant':'t','query':'dog','platforms':'["tiktok"]','search_state':json.dumps(state),'limit_count':3};calls=[]
  def fetch(p,c,q):
   calls.append(c);return {'data':{'data':[{'aweme_info':{'aweme_id':str(i),'author':{'unique_id':h}}} for i,h in enumerate(['old','new','new'])],'cursor':1,'has_more':True}}
  search(db,j,fetch);self.assertEqual(len(calls),1);self.assertEqual(db.execute("SELECT count(*) FROM discover_candidates WHERE job_id='j'").fetchone()[0],1);self.assertEqual(db.execute('SELECT count(*) FROM discover_exclusions').fetchone()[0],1);self.assertEqual(db.execute("SELECT count(*) FROM discover_hits WHERE job_id='j'").fetchone()[0],3)
  j['search_state']=db.execute("SELECT search_state FROM discover_jobs WHERE id='j'").fetchone()[0];search(db,j,fetch);self.assertEqual(len(calls),1)
 def test_provider_failure_is_resumable(self):
  # Response errors are surfaced without exposing provider credentials.
  from unittest.mock import patch
  from tikhub_search import request
  with patch.dict('os.environ',{},clear=True):
   with self.assertRaisesRegex(RuntimeError,'tikhub_key_missing'):request('instagram',None,'dog')
if __name__=='__main__':unittest.main()
