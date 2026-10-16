import test from 'node:test';import assert from 'node:assert/strict';
import {profileContact} from '../lib/profile-contact.mjs';
test('Extract only explicit bio emails and real display name',()=>{
 assert.deepEqual(profileContact({nickname:'Coley',signature:'Business: Hello@Example.com ❤️'}),{name:'Coley',bio:'Business: Hello@Example.com ❤️',emails:['hello@example.com'],email:'hello@example.com'});
 assert.equal(profileContact({biography:'Email me at hello@example.com.'}).email,'hello@example.com');
 assert.equal(profileContact({biography:'@creator • DM for collabs'}).email,'');
 assert.equal(profileContact({biography:'a@example.com b@example.org'}).email,'');
 assert.equal(profileContact({email:'not-in-bio@example.com'}).email,'');
});
