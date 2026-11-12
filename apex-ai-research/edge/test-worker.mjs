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
 assert.equal(MODELS.critic,'@cf/qwen/qwen3-30b-a3b-fp8');
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
  assert.match(key,/^\\d{4}-\\d\\d-\\d\\d$/);
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
