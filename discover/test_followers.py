import unittest
from followers import follower_count,follower_criterion,validate_visual_evidence
class RulesTests(unittest.TestCase):
 def test_boundaries_and_missing(self):
  for n,status in [(None,'unknown'),(0,'fail'),(2999,'fail'),(3000,'pass'),(100000,'pass'),(100001,'fail')]:self.assertEqual(follower_criterion(n)['status'],status)
 def test_profiles(self):
  self.assertEqual(follower_count('tiktok',{'stats':{'followerCount':3000}}),3000)
  self.assertEqual(follower_count('instagram',{'data':{'user':{'edge_followed_by':{'count':100000}}}}),100000)
  self.assertIsNone(follower_count('instagram',{'user':{'follower_count':True}}))
 def test_full_window_and_avatar(self):
  for index,status in [(13,'pass'),(24,'pass'),(0,'unknown')]:
   r={'criteria':[{'criterion':'small_dog','status':'pass','evidence_posts':[index],'explanation':''}]}
   self.assertEqual(validate_visual_evidence(r,{0,13,24},['small_dog'])['criteria'][0]['status'],status)
  with self.assertRaises(RuntimeError):validate_visual_evidence({'criteria':[{'criterion':'face_visible','status':'pass','evidence_posts':[25]}]},set(range(25)),['face_visible'])
if __name__=='__main__':unittest.main()
