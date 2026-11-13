import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import worker,{MODELS,authorized,validateAgentInput,reserveRequest,extractModelResult}
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


test('Qwen reasoning-only payload cannot be misreported as a successful model answer',()=>{
 const thinking={choices:[{finish_reason:'length',message:{
  content:null,reasoning_content:'PRIVATE_REASONING_MUST_NOT_BE_OUTPUT'}}]};
 assert.deepEqual(extractModelResult(thinking),
  {text:null,error:'MODEL_COMPLETION_TOKEN_LIMIT'});
 const ended={choices:[{finish_reason:'stop',message:{
  content:'',reasoning_content:'PRIVATE_REASONING_MUST_NOT_BE_OUTPUT'}}]};
 assert.deepEqual(extractModelResult(ended),
  {text:null,error:'MODEL_REASONING_WITHOUT_FINAL'});
 assert.deepEqual(extractModelResult({choices:[{finish_reason:'stop',message:{
  content:'  Verified public evidence is insufficient.  '}}]}),{
  text:'Verified public evidence is insufficient.',error:null
 });
 assert.deepEqual(extractModelResult({response:' Response string format. '}),{
  text:'Response string format.',error:null
 });
});

test('Qwen receives low reasoning effort and compact budget without extra retries',async()=>{
 let calls=0;
 const env={APEX_EDGE_TOKEN:secret,
  DB:{prepare:()=>({bind:()=>({first:async()=>({attempts:1})})})},
  AI:{run:async(model,args)=>{
   calls++;
   assert.equal(model,MODELS.critic);
   assert.equal(args.reasoning_effort,'low');
   assert.equal(args.max_completion_tokens,900);
   assert.equal(args.stream,undefined);
   return {choices:[{finish_reason:'stop',message:{content:'Evidence checked.'}}]};
  }}
 };
 const req=()=>new Request(origin+'/v1/agents/analyze',{method:'POST',
  headers:{Authorization:'Bearer '+secret},
  body:JSON.stringify({role:'critic',evidence:[item]})});
 const ok=await worker.fetch(req(),env);
 assert.equal(ok.status,200);
 assert.equal((await ok.json()).text,'Evidence checked.');
 assert.equal(calls,1,'one tap causes exactly one model invocation');
});
test('no final Qwen text exposes classified failure not fake success',async()=>{
 let calls=0;
 const env={APEX_EDGE_TOKEN:secret,
  DB:{prepare:()=>({bind:()=>({first:async()=>({attempts:1})})})},
  AI:{run:async()=>{calls++;return {choices:[{finish_reason:'length',
   message:{content:null,reasoning_content:'HIDDEN_PRIVATE'}}]};}}
 };
 const req=new Request(origin+'/v1/agents/analyze',{method:'POST',
  headers:{Authorization:'Bearer '+secret},
  body:JSON.stringify({role:'critic',evidence:[item]})});
 const output=await worker.fetch(req,env),body=await output.json();
 assert.equal(output.status,503);
 assert.equal(body.error,'MODEL_COMPLETION_TOKEN_LIMIT');
 assert.equal(calls,1);
 assert.ok(!JSON.stringify(body).includes('HIDDEN_PRIVATE'));
});

test('GLM short audit disables default thinking without changing the quota',async()=>{
 let invoked=0;
 const env={APEX_EDGE_TOKEN:secret,
  DB:{prepare:()=>({bind:()=>({first:async()=>({attempts:1})})})},
  AI:{run:async(model,args)=>{
   invoked++;
   assert.equal(model,MODELS.analyst);
   assert.deepEqual(args.chat_template_kwargs,{enable_thinking:false});
   assert.equal(args.max_completion_tokens,900);
   assert.equal(args.reasoning_effort,undefined);
   return {choices:[{finish_reason:'stop',message:{
    content:'Concise cited observations; no inference of intent.'}}]};
  }}
 };
 const req=new Request(origin+'/v1/agents/analyze',{method:'POST',
  headers:{Authorization:'Bearer '+secret},
  body:JSON.stringify({role:'analyst',evidence:[item]})});
 const r=await worker.fetch(req,env);
 assert.equal(r.status,200);
 const data=await r.json();
 assert.equal(data.role,'analyst');
 assert.equal(data.text,'Concise cited observations; no inference of intent.');
 assert.equal(invoked,1,'no hidden extra attempts or retries');
});

test('GLM length-only failure remains an explicit failed attempt, never a fake answer',async()=>{
 let invoked=0;
 const env={APEX_EDGE_TOKEN:secret,
  DB:{prepare:()=>({bind:()=>({first:async()=>({attempts:1})})})},
  AI:{run:async()=>{invoked++;return {choices:[{finish_reason:'length',
    message:{content:null,reasoning_content:'not for display'}}]};}}
 };
 const req=new Request(origin+'/v1/agents/analyze',{method:'POST',
  headers:{Authorization:'Bearer '+secret},
  body:JSON.stringify({role:'analyst',evidence:[item]})});
 const r=await worker.fetch(req,env);
 assert.equal(r.status,503);
 const value=await r.json();
 assert.equal(value.error,'MODEL_COMPLETION_TOKEN_LIMIT');
 assert.equal(invoked,1);
 assert.ok(!JSON.stringify(value).includes('not for display'));
});

test('second-stage critic accepts only bounded source-matched GLM claims, not market evidence',()=>{
 const now=Date.now(),report={
  text:'GLM observed short-lived price changes, but cannot establish causality.',
  source_ids:[item.source_id],captured_at:now-7*60000
 };
 const ok=validateAgentInput({role:'critic',evidence:[item],analyst:report},now);
 assert.equal(ok.analyst.text,report.text);
 assert.equal(validateAgentInput({role:'analyst',evidence:[item],analyst:report},now),null);
 assert.equal(validateAgentInput({role:'critic',evidence:[item],analyst:{
  ...report,source_ids:['not-in-evidence']}},now),null);
 assert.equal(validateAgentInput({role:'critic',evidence:[item],analyst:{
  ...report,captured_at:now-61*60000}},now),null);
 assert.equal(validateAgentInput({role:'critic',evidence:[item],analyst:{
  ...report,text:'x'.repeat(2401)}},now),null);
 assert.equal(validateAgentInput({role:'critic',evidence:[item],analyst:{
  ...report,source_ids:[item.source_id,item.source_id]}},now),null);
});
test('Qwen independently receives clock, old hypotheses, current observations once',async()=>{
 let count=0;const at=Date.now();
 const report={text:'GLM observed trend; source uncertainty remains.',
  source_ids:[item.source_id],captured_at:at-6*60000};
 const env={APEX_EDGE_TOKEN:secret,
  DB:{prepare:()=>({bind:()=>({first:async()=>({attempts:1})})})},
  AI:{run:async(model,args)=>{
   count++;
   assert.equal(model,MODELS.critic);
   assert.equal(args.reasoning_effort,'low');
   const user=JSON.parse(args.messages[1].content);
   assert.ok(user.server_clock.utc.includes('T'));
   assert.ok(user.server_clock.kyiv_date.startsWith('20'));
   assert.equal(user.evidence.length,1);
   assert.equal(user.analyst_claims.untrusted_model_output,report.text);
   assert.equal(user.analyst_claims.status,'UNVERIFIED_HYPOTHESES_NOT_MARKET_EVIDENCE');
   assert.match(args.messages[0].content,/UNTRUSTED/);
   return {response:'Prior analyst claims are not proven by one observation.'};
  }}
 };
 const req=new Request(origin+'/v1/agents/analyze',{method:'POST',
  headers:{Authorization:'Bearer '+secret},
  body:JSON.stringify({role:'critic',evidence:[item],analyst:report})});
 const result=await worker.fetch(req,env);
 assert.equal(result.status,200);
 assert.equal((await result.json()).state,'OBSERVED_MODEL_OUTPUT');
 assert.equal(count,1);
});
