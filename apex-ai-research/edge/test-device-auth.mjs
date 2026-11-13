import test from 'node:test';
import assert from 'node:assert/strict';
import {deviceRoute,authorizedDevice,validatePublicKey} from './device-auth.mjs';
import worker from './worker.mjs';

const origin = 'https://apex-ai-collective.example.test';
const sha256 = async bytes => new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
const url64 = bytes => Buffer.from(bytes).toString('base64url');
function dbMock() {
 const devices = new Map();
 const nonces = new Set();
 let counter = 0;
 return {devices,nonces,prepare(sql){
  return {bind(...args){
   return {
    async first() {
     if(sql.includes('INSERT INTO ai_pair_guard')){
      if(++counter > 6) return null;
      return {attempts:counter};
     }
     if(sql.includes('SELECT approved,revoked FROM ai_devices')) {
      const d=devices.get(args[0]);
      return d && {approved:d.approved,revoked:d.revoked};
     }
     if(sql.includes('SELECT public_key,approved,revoked FROM ai_devices')) {
      return devices.get(args[0]) || null;
     }
     if(sql.includes('INSERT INTO ai_device_nonces')) {
      const key=args[0]+'/'+args[1];
      if(nonces.has(key))return null;
      nonces.add(key);
      return {nonce:args[1]};
     }
     if(sql.includes('FROM ai_budget'))return null;
     throw Error('Unexpected first query: '+sql);
    },
    async run() {
     if(sql.includes('INSERT INTO ai_devices')){
      devices.set(args[0],{
       public_key:args[1],fingerprint:args[2],verification_code:args[3],
       approved:0,revoked:0
      });
      return {success:true};
     }
     if(sql.includes('DELETE FROM ai_device_nonces'))return {success:true};
     throw Error('Unexpected run: '+sql);
    }
   };
  }};
 }};
}
test('RSA 2048 registration requires valid public key and Cloudflare D1',async()=>{
 const pair=await crypto.subtle.generateKey(
  {name:'RSA-PSS',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},
  true,['sign','verify']
 );
 const raw=new Uint8Array(await crypto.subtle.exportKey('spki',pair.publicKey));
 const pub=Buffer.from(raw).toString('base64');
 const verified=await validatePublicKey(pub);
 assert.ok(verified);
 assert.match(verified.fingerprint,/^[A-F0-9]{16}$/);
 assert.equal(await validatePublicKey('not-a-key'),null);
 const db=dbMock();
 const env={DB:db};
 const registration=new Request(origin+'/v1/device/enroll',{
  method:'POST',headers:{'Content-Type':'application/json'},
  body:JSON.stringify({publicKey:pub})
 });
 const response=await deviceRoute(registration,env);
 assert.equal(response.status,200);
 const data=await response.json();
 assert.equal(data.state,'PENDING_APPROVAL');
 assert.match(data.verificationCode,/^[A-F0-9]{10}$/);
 assert.equal(db.devices.size,1);
 const status=await deviceRoute(new Request(origin+
  '/v1/device/status?device='+data.deviceId),env);
 assert.equal((await status.json()).state,'PENDING_APPROVAL');
 const unauth=await worker.fetch(new Request(origin+'/v1/budget/status'),env);
 assert.equal(unauth.status,401);
 const nonce='this-is-a-unique-signed-nonce-0001';
 const time=String(Math.floor(Date.now()/1000));
 const path='/v1/budget/status';
 const canonical='GET\n'+path+'\n'+time+'\n'+nonce+'\n'+url64(await sha256(new Uint8Array(0)));
 const signature=url64(new Uint8Array(await crypto.subtle.sign(
  {name:'RSA-PSS',saltLength:32},pair.privateKey,new TextEncoder().encode(canonical)
 )));
 const signed=new Request(origin+path,{headers:{
  'X-Apex-Device':data.deviceId,
  'X-Apex-Nonce':nonce,
  'X-Apex-Time':time,
  'X-Apex-Signature':signature
 }});
 assert.equal(await authorizedDevice(signed,env),false,'pending cannot authenticate');
 db.devices.get(data.deviceId).approved=1;
 const approved=await deviceRoute(new Request(origin+
  '/v1/device/status?device='+data.deviceId),env);
 assert.equal((await approved.json()).state,'APPROVED');
 assert.equal(await authorizedDevice(signed,env),true);
 assert.equal(await authorizedDevice(signed,env),false,'replay must be denied');
 const stale = new Request(origin+path,{headers:{
  'X-Apex-Device':data.deviceId,'X-Apex-Nonce':'another-unique-signed-nonce-0002',
  'X-Apex-Time':String(Number(time)-500),'X-Apex-Signature':signature
 }});
 assert.equal(await authorizedDevice(stale,env),false,'old signed requests denied');
 db.devices.get(data.deviceId).revoked=1;
 assert.equal(await authorizedDevice(signed,env),false,'revoked must be denied');
});
test('pairing request is strictly bounded and fails closed without storage',async()=>{
 const request = new Request(origin+'/v1/device/enroll',{method:'POST',body:'{}'});
 const response=await deviceRoute(request,{DB:null});
 assert.equal(response.status,503);
 assert.equal(await deviceRoute(new Request(origin+'/v1/not-pairing'),{}),null);
});
