import unittest,sqlite3,json,hashlib
from unittest.mock import patch
import worker

class SearchTests(unittest.TestCase):
 def setUp(self):
  self.db=sqlite3.connect(':memory:');self.db.row_factory=sqlite3.Row
  self.db.executescript('CREATE TABLE discover_jobs(id,search_state,updated_at,state); CREATE TABLE discover_hits(job_id,ordinal,platform,source_id,account_key,payload); CREATE TABLE discover_pages(job_id,platform,page_key,response,PRIMARY KEY(job_id,platform,page_key)); CREATE TABLE discover_candidates(job_id,account_key,platform,handle,UNIQUE(job_id,account_key));')
  self.db.execute("INSERT INTO discover_jobs VALUES('j','{}','','queued')")
  self.j=dict(id='j',search_state='{}',platforms='["tiktok","instagram"]',limit_count=3,query='Fashion for Me and My Dog')
 def test_raw_duplicates_preserved_accounts_deduplicated_cap(self):
  tt={'search_item_list':[{'aweme_info':{'aweme_id':'1','author':{'unique_id':'DOG'}}}]*2,'cursor':2}
  ig={'reels':[{'id':'2','owner':{'username':'dog'}},{'id':'3','owner':{'username':'another'}}]}
  with patch.object(worker,'scrape',side_effect=[tt,ig]):worker.search(self.db,self.j,'fake')
  self.assertEqual(self.db.execute('SELECT count(*) FROM discover_hits').fetchone()[0],3)
  self.assertEqual(self.db.execute('SELECT count(*) FROM discover_candidates').fetchone()[0],2)
  self.assertEqual(self.db.execute('SELECT count(*) FROM discover_pages').fetchone()[0],2)
 def test_completed_search_resume_does_not_refetch(self):
  self.j['search_state']=json.dumps({p:{'done':True} for p in ['tiktok','instagram']})
  with patch.object(worker,'scrape') as call:worker.search(self.db,self.j,'fake');call.assert_not_called()
 def test_provider_failure_preserves_other_platform(self):
  with patch.object(worker,'scrape',side_effect=[RuntimeError('http_503'),{'reels':[]}]):worker.search(self.db,self.j,'fake')
  s=json.loads(self.db.execute('SELECT search_state FROM discover_jobs').fetchone()[0])
  self.assertEqual(s['tiktok']['reason'],'provider_error');self.assertEqual(s['instagram']['reason'],'no_results')
 def test_frozen_policy_integrity(self):
  self.assertEqual(hashlib.sha256(worker.CONFIG['prompt'].encode()).hexdigest(),worker.CONFIG['sha256'])
 def test_numeric_tiktok_end_and_instagram_null_next_page(self):
  tt={'search_item_list':[{'aweme_info':{'aweme_id':'1','author':{'unique_id':'dog'}}}],'cursor':30,'has_more':0}
  ig={'reels':[{'id':'2','owner':{'username':'dog'}}],'next_page':None}
  with patch.object(worker,'scrape',side_effect=[tt,ig]) as call:worker.search(self.db,self.j,'fake');self.assertEqual(call.call_count,2)
  s=json.loads(self.db.execute('SELECT search_state FROM discover_jobs').fetchone()[0]);self.assertTrue(all(v['done'] for v in s.values()))

if __name__=='__main__':unittest.main()
