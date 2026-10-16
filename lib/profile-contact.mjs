export function profileContact(profile={}){
 const bio=String(profile.biography||profile.signature||profile.bio||'');
 const emails=[...new Set((bio.match(/[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]*[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]*[A-Z0-9])?)+/gi)||[]).map(e=>e.toLowerCase()).filter(e=>e.length<=254&&/\.[a-z]{2,}$/i.test(e)))];
 const name=String(profile.full_name||profile.nickname||profile.nickName||profile.name||'').trim().slice(0,200);
 return {name,bio,emails,email:emails.length===1?emails[0]:''};
}
