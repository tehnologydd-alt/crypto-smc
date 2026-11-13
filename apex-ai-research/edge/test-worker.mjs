import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import worker,{MODELS,authorized,validateAgentInput,reserveRequest}
 from './worker.mjs';

const origin='https://apex-ai.example.test';
const secret='this-is-a-local-ci-test-secret-that-is-not-deployed';
const item={source_id:'unit-test-only',observed_at:1234567,
 text:'Observation freshness has not been confirmed.'};

test('two distinct cloud-hosted agents use actual catalog identifiers',()=>{
 assert.equal(MODELS.analyst,'@cf/zai-org/glm-4.7-flash');
 assert.equal(MODELS.critic,'@cf/qwen/qwen3.8-27b');
 assert.notEqual(MODELS.analyst,MODELS.critic);
});
test('evidence schema rejects anonymous, oversized and ungrounded input',()=>{
 assert.deepEqual(validateAgentInput({role:'critic',evidence:[item]}),
  {role:'critic',evidence:[item]});
 assert.equal(validateAgentInput({role:'unknown',evidence:[item]}),null);
 assert.equal(validateAgentInput({role:'analyst',evidence:[]}),null);
 assert.equal(validateAgentInput({role:'analyst',evidence:[{...item,source_id:''}]}),null);
 assert.equal(validateAgentInput({role:'analyst',evidence:[{...item,text:'x'.repeat(1501)}]}),null);
 assert.equal(validateAgentInput({role:'analyst',evidence:[{...item,observed_at:NaN}]}),null);
});
test('private API refuses missing or wrong bearer credentials',async()=>{
 const req=key=>new Request(origin+'/v1/agents/analyze',{method:'POST',
  headers:{Authorization:'Bearer '+key},body:JSON.stringify({role:'analyst',evidence:[item]})});
 assert.equal(await authorized(req(secret),{APEX_EDGE_TOKEN:secret}),true);
 assert.equal(await authorized(req('wrong'),{APEX_EDGE_TOKEN:secret}),false);
 assert.equal(await authorized(req(secret),{}),false);
 const res=await worker.fetch(req('wrong'),{APEX_EDGE_TOKEN:secret});
 assert.equal(res.status,401);
});
test('public health does not report live model success or private metadata',async()=>{
 const res=await worker.fetch(new Request(origin+'/health'),{});
 assert.equal(res.status,200);
 const value=await res.json();
 assert.equal(value.state,'RUNNING');
 assert.match(value.note,/not guaranteed/);
 assert.ok(!JSON.stringify(value).includes(secret));
});
test('model calls require D1 and never claim Oracle is present before setup',async()=>{
 const headers={Authorization:'Bearer '+secret};
 const env={APEX_EDGE_TOKEN:secret};
 const model=await worker.fetch(new Request(origin+'/v1/boosters/status',{headers}),env);
 assert.equal((await model.json()).state,'NOT_CONFIGURED');
 const req=new Request(origin+'/v1/agents/analyze',{method:'POST',headers,
  body:JSON.stringify({role:'analyst',evidence:[item]})});
 const ai=await worker.fetch(req,env);
 assert.equal(ai.status,503);
 assert.equal((await ai.json()).error,'NOT_CONFIGURED');
});
test('quota reservation is made before each Workers AI invocation',async()=>{
 const calls=[];
 const db={prepare(sql){calls.push(sql);return {bind(key){
  assert.ok(key==='language'||/^\d{4}-\d{2}-\d{2}$/.test(key));
  return {first:async()=>({attempts:1})};
 }}}};
 assert.equal(await reserveRequest(db,1794500000000),true);
 assert.match(calls[0],/ON CONFLICT\(day_key\)/);
 assert.match(calls[0],/attempts<12/);
 let modelInvocations=0;
 const env={APEX_EDGE_TOKEN:secret,DB:db,AI:{run:async(model,args)=>{
  modelInvocations++;
  assert.equal(model,MODELS.critic);
  assert.ok(args.messages[0].content.includes('independent scientific critic'));
  return {response:'Only the provided evidence can be considered.'};
 }}};
 const res=await worker.fetch(new Request(origin+'/v1/agents/analyze',{
  method:'POST',headers:{Authorization:'Bearer '+secret},
  body:JSON.stringify({role:'critic',evidence:[item]})
 }),env);
 assert.equal(res.status,200);
 const data=await res.json();
 assert.equal(data.model,MODELS.critic);
 assert.deepEqual(data.source_ids,['unit-test-only']);
 assert.equal(modelInvocations,1);
 const blocked=await worker.fetch(new Request(origin+'/v1/agents/analyze',{
  method:'POST',headers:{Authorization:'Bearer '+secret},
  body:JSON.stringify({role:'critic',evidence:[item]})
 }),{...env,DB:{prepare(){return {bind(){return {first:async()=>null}}}}}});
 assert.equal(blocked.status,429);
 assert.equal(modelInvocations,1);
});
test('Android standalone APK must not embed server pilot secret or AI routes',()=>{
 const staged=readFileSync(new URL('../../apex9-android/scripts/prepare-web.mjs',
  import.meta.url),'utf8');
 assert.ok(!staged.includes('apex-ai-research/edge'));
 assert.ok(!staged.includes('APEX_EDGE_TOKEN'));
 assert.ok(!staged.includes('APEX_COMPUTE_TOKEN'));
});

test('all four agents share one authenticated edge; booster proxy requires Oracle',async()=>{
 const header={Authorization:'Bearer '+secret,'Content-Type':'application/json'};
 const features=Object.fromEntries([
  'return_1m','return_5m','volatility_15m','volume_z_15m',
  'spread_bps','book_imbalance','large_trade_pressure',
  'whale_flow_score','relative_volume','cross_venue_disagreement'
 ].map(key=>[key,0]));
 const observation={observation:{
  asset:'BTCUSDT',source_ids:['unit-test-only'],features
 }};
 const endpoint=origin+'/v1/boosters/predict';
 const make=body=>new Request(endpoint,{method:'POST',headers:header,body:JSON.stringify(body)});
 assert.equal((await worker.fetch(make(observation),{APEX_EDGE_TOKEN:secret})).status,503);
 assert.equal((await worker.fetch(make({observation:{...observation.observation,features:{fake:1}}}),{
  APEX_EDGE_TOKEN:secret,COMPUTE_ORIGIN:'https://compute.example',
  APEX_COMPUTE_TOKEN:'secret-not-real'
 })).status,422);
 let called=0;
 const previous=globalThis.fetch;
 globalThis.fetch=async(_,options)=>{
  called++;
  assert.equal(options.method,'POST');
  assert.ok(options.headers.Authorization.startsWith('Bearer '));
  assert.equal(JSON.parse(options.body).observation.asset,'BTCUSDT');
  return new Response(JSON.stringify({
   state:'MODEL_ESTIMATE',model_version:'ciVersion',
   xgboost_p:0.4,lightgbm_p:0.6,disagreement:0.2,
   source_ids:['unit-test-only'],notice:'Unit test only'
  }),{headers:{'Content-Type':'application/json'}});
 };
 try{
  const env={APEX_EDGE_TOKEN:secret,COMPUTE_ORIGIN:'https://compute.example',
   APEX_COMPUTE_TOKEN:'unit-test-token-for-cross-server-check',
   DB:{prepare:()=>({bind:()=>({first:async()=>({attempts:1})})})}};
  const good=await worker.fetch(make(observation),env);
  assert.equal(good.status,200);
  assert.equal((await good.json()).state,'MODEL_ESTIMATE');
  assert.equal(called,1);
  const unauthorized=await worker.fetch(new Request(endpoint,{method:'POST',
   body:JSON.stringify(observation)}),env);
  assert.equal(unauthorized.status,401);
  assert.equal(called,1);
 }finally{globalThis.fetch=previous;}
});
test('Worker validates Oracle response and refuses forged source lineage',async()=>{
 const original=globalThis.fetch;
 globalThis.fetch=async()=>Response.json({state:'MODEL_ESTIMATE',
  model_version:'ciVersion',xgboost_p:0.6,lightgbm_p:0.3,
  disagreement:0.3,source_ids:['wrong-source']});
 try{
  const features=Object.fromEntries([
   'return_1m','return_5m','volatility_15m','volume_z_15m',
   'spread_bps','book_imbalance','large_trade_pressure',
   'whale_flow_score','relative_volume','cross_venue_disagreement'
  ].map(x=>[x,0]));
  const request=new Request(origin+'/v1/boosters/predict',{
   method:'POST',headers:{Authorization:'Bearer '+secret},
   body:JSON.stringify({observation:{asset:'BTCUSDT',features,
    source_ids:['unit-test-only']}})
  });
  const result=await worker.fetch(request,{
   APEX_EDGE_TOKEN:secret,COMPUTE_ORIGIN:'https://compute.example',
   APEX_COMPUTE_TOKEN:'unit-test-only',
   DB:{prepare:()=>({bind:()=>({first:async()=>({attempts:1})})})}
  });
  assert.equal(result.status,503);
  assert.equal((await result.json()).state,'INVALID_COMPUTE_RESPONSE');
 }finally{globalThis.fetch=original;}
});
