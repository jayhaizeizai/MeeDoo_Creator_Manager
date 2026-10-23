"""Authoritative profile follower counts; never infer counts from images."""
def follower_count(platform, response):
    user=(response.get('data') or {}).get('user') or response.get('user') or {}
    values=[(response.get('stats') or {}).get('followerCount'),(response.get('statsV2') or {}).get('followerCount'),user.get('followerCount'),user.get('follower_count'),(user.get('edge_followed_by') or {}).get('count')]
    for value in values:
        if isinstance(value,bool): continue
        if isinstance(value,str) and value.isdigit(): value=int(value)
        if isinstance(value,int) and value>=0:return value
    return None

def follower_criterion(value):
    status='unknown' if value is None else 'pass' if 3000<=value else 'fail'
    explanation='无法取得有效粉丝数，不满足本轮必选条件。' if value is None else f'主页接口粉丝数 {value:,}；要求为 至少 3,000（无上限）。'
    return {'criterion':'followers_min_3000','status':status,'evidence_posts':[],'explanation':explanation}

def validate_visual_evidence(result, indices, criteria):
    if len(result['criteria'])!=len(criteria) or {c['criterion'] for c in result['criteria']}!=set(criteria):raise RuntimeError('invalid_criteria')
    for c in result['criteria']:
        allowed={i for i in indices if 1<=i<=24}
        if c['criterion'] in ('age_20_39','face_visible'):allowed|=({0}&indices)
        cited=set(c['evidence_posts'])
        if not cited<=indices:raise RuntimeError('invalid_evidence_index')
        if c['status']=='pass' and c['criterion']!='USA' and (not cited or not cited<=allowed):
            c['status']='unknown';c['explanation']='前24条及允许的头像证据不足。'+c['explanation']
    return result
