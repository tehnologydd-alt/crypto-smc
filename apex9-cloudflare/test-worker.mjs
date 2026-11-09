import test from 'node:test';
import assert from 'node:assert/strict';
import worker,{authorized,newsResponse,statusResponse,reserveQuota} from './worker.mjs';
import {prepareCloud} from './prepare.mjs';
const origin='https://apex9-research-private.account.workers.dev';
const login='Basic '+btoa('researcher:unique-test-password');
const request=(path,headers={},method='GET')=>new Request(origin+path,
 {method,headers});
test('no user credentials means no website and no news',async()=>{
 let assets=0;
 const env={ASSETS:{fetch:async()=>{assets++;return new Response('private');}}};
 const r=await worker.fetch(request('/index.html'),env);
 assert.equal(r.status,401);
 assert.equal(r.headers.get('WWW-Authenticate')?.includes('Basic'),true);
 assert.equal(assets,0);
 const news=await worker.fetch(request('/v1/bundle?coin=BTC'),env);
 assert.equal(news.status,401);
 assert.equal(assets,0);
});
test('wrong login fails closed; valid login serves private assets',async()=>{
 let files=0;
 const env={APEX_SITE_USER:'researcher',APEX_SITE_PASSWORD:'unique-test-password',
  ASSETS:{fetch:async()=>{files++;return new Response('HTML rendered');}}};
 assert.equal(await authorized(request('/',{Authorization:login}),env),true);
 assert.equal(await authorized(request('/',{Authorization:'Basic '+btoa('researcher:wrong')}),env),false);
 const r=await worker.fetch(request('/index.html',{Authorization:login}),env);
 assert.equal(r.status,200);
 assert.equal(r.headers.get('X-Frame-Options'),'DENY');
 assert.equal(files,1);
});
test('cross-origin and non-GET API requests are blocked before any DB query',async()=>{
 const env={APEX_SITE_USER:'researcher',APEX_SITE_PASSWORD:'unique-test-password'};
 const hostile=await worker.fetch(request('/v1/bundle?coin=BTC',
  {Authorization:login,Origin:'https://hostile.example','Sec-Fetch-Site':'cross-site'}),env);
 assert.equal(hostile.status,403);
 const wrong=await worker.fetch(request('/v1/bundle?coin=BTC',
  {Authorization:login},'POST'),env);
 assert.equal(wrong.status,405);
});
test('missing shared DB never triggers upstream vendor requests',async()=>{
 let calls=0;
 const result=await newsResponse('BTC',{APEX_NEWSDATA_KEY:'example-key'},{
  fetchImpl:async()=>{calls++;throw Error('should not fetch');}});
 assert.equal(result.state,'STORAGE_UNAVAILABLE');assert.equal(calls,0);
 assert.equal((await statusResponse({})).state,'STORAGE_UNAVAILABLE');
});
test('provider quotas fail closed if D1 rejects the write',async()=>{
 const fake={prepare:()=>({bind:()=>({first:async()=>{throw Error('D1 unavailable');}})})};
 await assert.rejects(reserveQuota(fake,'newsdata',Date.UTC(2026,10,9,12)));
});
test('hosted preparation refuses incomplete or insecure owner configuration',()=>{
 const valid={APEX_WORKER_ORIGIN:origin,
  APEX_D1_DATABASE_ID:'01234567-1234-4123-8123-123456789abc',
  APEX_HOSTED_NEWS_ENABLED:'1'};
 assert.equal(prepareCloud(valid,{stage:false}).origin,origin);
 assert.throws(()=>prepareCloud({...valid,APEX_WORKER_ORIGIN:'http://local'},
  {stage:false}));
 assert.throws(()=>prepareCloud({...valid,APEX_D1_DATABASE_ID:'not-an-id'},
  {stage:false}));
});
