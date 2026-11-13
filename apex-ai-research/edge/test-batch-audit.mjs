import test from 'node:test';
import assert from 'node:assert/strict';
import {validateBatchAudit,makeBatchPrompt,parseBatchOutput,inspectBatchOutput}
 from './batch-audit.mjs';
import worker from './worker.mjs';
const at=Date.parse('2026-11-13T20:40:00Z');
const asset=['BTCUSDT','GRAMUSDT'];
const src=a=>({source_id:'binance:spot:24h:'+a+':'+at,
 observed_at:at,text:'Confirmed public spot ticker snapshot on Binance for '+a});
const items=asset.map(a=>({asset:a,evidence:[src(a)]}));
test('batch accepts exactly 2-3 distinct asset-scoped, fresh observations',()=>{
 const valid=validateBatchAudit({role:'analyst',items},at);
 assert.equal(valid.items.length,2);
 assert.equal(validateBatchAudit({role:'analyst',items:items.slice(0,1)},at),null);
 assert.equal(validateBatchAudit({role:'analyst',items:[items[0],items[0]]},at),null);
 assert.equal(validateBatchAudit({role:'analyst',items:[{...items[0],
  evidence:[src('GRAMUSDT')]},items[1]]},at),null);
 assert.equal(validateBatchAudit({role:'analyst',items:[{...items[0],
  evidence:[{...src('BTCUSDT'),observed_at:at-25*3600000}]},items[1]]},at),null);
 assert.equal(validateBatchAudit({role:'analyst',items:[{...items[0],
  analyst:{text:'Injected unexpected model response'}},items[1]]},at),null);
});
test('critic receives only pre-existing source-matched hypotheses',()=>{
 const analyst=src('BTCUSDT').source_id;
 const report={text:'GLM noted uncertainty and public source quality.',
  source_ids:[analyst],captured_at:at-5*60000};
 const valid=validateBatchAudit({role:'critic',items:[
  {...items[0],analyst:report},
  {...items[1],analyst:{...report,source_ids:[src('GRAMUSDT').source_id]}}
 ]},at);
 assert.equal(valid.items[0].analyst.text,report.text);
 assert.equal(makeBatchPrompt(valid,at).items.length,2);
 assert.equal(validateBatchAudit({role:'critic',items:[
  {...items[0],analyst:{...report,source_ids:['false:source:BTCUSDT:11']}},
  {...items[1],analyst:report}
 ]},at),null);
});
test('batch output must contain independent verified sources for ALL assets',()=>{
 const valid=validateBatchAudit({role:'analyst',items},at);
 const records=items.map(x=>({asset:x.asset,summary:
  'A single snapshot cannot confirm a directional movement.',
  source_ids:[x.evidence[0].source_id]}));
 assert.equal(parseBatchOutput({response:JSON.stringify({results:records})},valid).length,2);
 assert.equal(parseBatchOutput({response:JSON.stringify({results:records.slice(0,1)})},valid),null);
 assert.equal(parseBatchOutput({response:JSON.stringify({results:[
  {...records[0],source_ids:records[1].source_ids},records[1]
 ]})},valid),null);
 assert.equal(parseBatchOutput({response:'Some plausible but unstructured text'},valid),null);
});
test('server charges a single reservation and one model run for a multi-asset analysis',async()=>{
 let reservations=0,inferences=0;
 const db={prepare:sql=>({bind:(...args)=>({
  first:async()=>{reservations++;
   assert.match(sql,/neuron_reserved/);
   assert.equal(args.length,12);
   return {day_used:1,month_used:1,night_used:0,neuron_reserved:350};}
 })})};
 const env={APEX_EDGE_TOKEN:'fake-only-local-unit-test',
  DB:db,AI:{run:async(_,options)=>{
   inferences++;
   assert.equal(options.max_completion_tokens,1400);
   assert.equal(options.chat_template_kwargs.enable_thinking,false);
   const prompt=JSON.parse(options.messages[1].content);
   assert.equal(prompt.items.length,2);
   return {response:JSON.stringify({results:items.map(x=>({
    asset:x.asset,summary:'Observed snapshot lacks confirmation from independent sources.',
    source_ids:[x.evidence[0].source_id]}))})};
  }}};
 // Test payload timestamps must be near actual clock, not the historical fixture.
 const fresh=Date.now();
 const payload={role:'analyst',items:items.map(x=>({
  asset:x.asset,evidence:[{...x.evidence[0],observed_at:fresh,
   source_id:x.evidence[0].source_id.replace(String(at),String(fresh))}]
 }))};
 // Make the mock follow the current source IDs.
 env.AI.run=async(_,options)=>{
  inferences++;
  const req=JSON.parse(options.messages[1].content);
  return {response:JSON.stringify({results:req.items.map(x=>({
   asset:x.asset,summary:'Only observed market facts, not predictions.',
   source_ids:[x.evidence[0].source_id]
  }))})};
 };
 const url='https://apex.test/v1/agents/batch';
 const res=await worker.fetch(new Request(url,{method:'POST',
  headers:{Authorization:'Bearer fake-only-local-unit-test'},
  body:JSON.stringify(payload)}),env);
 const body=await res.json();
 assert.equal(res.status,200);
 assert.equal(body.state,'OBSERVED_MODEL_BATCH');
 assert.equal(body.results.length,2);
 assert.equal(reservations,1);
 assert.equal(inferences,1);
});


test('batch JSON mode accepts a single fenced JSON object and reordered assets',()=>{
 const valid=validateBatchAudit({role:'analyst',items},at);
 const data={results:[
  {asset:'GRAMUSDT',summary:'A timestamped public quote does not establish a future direction.',source_ids:[src('GRAMUSDT').source_id]},
  {asset:'BTCUSDT',summary:'A verified snapshot needs independent corroboration.',source_ids:[src('BTCUSDT').source_id]}
 ]};
 const ticks=String.fromCharCode(96).repeat(3);
 const text='Here is the JSON:\n'+ticks+'json\n'+JSON.stringify(data)+'\n'+ticks;
 const fromFence=inspectBatchOutput({response:text},valid);
 assert.equal(fromFence.error,null);
 assert.deepEqual(fromFence.rows.map(x=>x.asset),['BTCUSDT','GRAMUSDT']);
 assert.equal(inspectBatchOutput({response:data},valid).rows.length,2);
 assert.equal(inspectBatchOutput({choices:[{message:{
  content:[{type:'text',text:JSON.stringify(data)}]}}]},valid).rows.length,2);
});

test('batch rejects invented citations, duplicated or absent assets, and truncated output',()=>{
 const valid=validateBatchAudit({role:'analyst',items},at);
 const original={results:items.map(x=>({asset:x.asset,
  summary:'The public snapshot is not sufficient to determine a future price direction.',
  source_ids:[x.evidence[0].source_id]}))};
 const changed=JSON.parse(JSON.stringify(original));
 changed.results[0].source_ids=[items[1].evidence[0].source_id];
 assert.equal(inspectBatchOutput({response:JSON.stringify(changed)},valid).error,
  'BATCH_SOURCE_MISMATCH');
 assert.equal(inspectBatchOutput({response:JSON.stringify({
  results:original.results.slice(0,1)})},valid).error,
  'BATCH_MISSING_ASSET_RESULTS');
 assert.equal(inspectBatchOutput({response:JSON.stringify({
  results:[original.results[0],original.results[0]]})},valid).error,
  'BATCH_ASSET_MISMATCH');
 assert.equal(inspectBatchOutput({response:'Normal prose.'},valid).error,
  'BATCH_JSON_NOT_PARSEABLE');
 assert.equal(inspectBatchOutput({choices:[{finish_reason:'length',
  message:{content:'{"results":['}}]},valid).error,'BATCH_COMPLETION_TRUNCATED');
 assert.equal(inspectBatchOutput({choices:[{finish_reason:'stop',
  message:{content:null,reasoning_content:'PRIVATE_DO_NOT_SHARE'}}]},valid).error,
  'BATCH_REASONING_WITHOUT_FINAL');
});

test('one live-format batch requests JSON mode and uses exactly one model invocation',async()=>{
 let calls=0;
 const now=Date.now();
 const fresh=items.map(x=>({asset:x.asset,evidence:[{
  ...x.evidence[0],observed_at:now,
  source_id:x.evidence[0].source_id.replace(String(at),String(now))
 }]}));
 const env={APEX_EDGE_TOKEN:'unit-test-key-not-deployed',
  DB:{prepare:()=>({bind:()=>({first:async()=>({neuron_reserved:500})})})},
  AI:{run:async(_name,options)=>{
   calls++;
   assert.equal(options.response_format?.type,'json_object');
   assert.equal(options.chat_template_kwargs.enable_thinking,false);
   const input=JSON.parse(options.messages[1].content);
   assert.equal(input.items.length,2);
   const results=[...input.items].reverse().map(item=>({
    asset:item.asset,
    summary:'An observed market snapshot alone cannot establish what happens next.',
    source_ids:item.evidence.map(x=>x.source_id)
   }));
   return {choices:[{finish_reason:'stop',message:{
    content:JSON.stringify({results})}}]};
  }}
 };
 const result=await worker.fetch(new Request(
  'https://apex.example.test/v1/agents/batch',{
  method:'POST',headers:{Authorization:'Bearer unit-test-key-not-deployed'},
  body:JSON.stringify({role:'analyst',items:fresh})
 }),env);
 assert.equal(result.status,200);
 const output=await result.json();
 assert.equal(output.state,'OBSERVED_MODEL_BATCH');
 assert.deepEqual(output.results.map(x=>x.asset),asset);
 assert.equal(calls,1);
});

test('invalid batch output exposes a safe diagnostic without leaking model content',async()=>{
 const now=Date.now();let calls=0;
 const fresh=items.map(x=>({asset:x.asset,evidence:[{
  ...x.evidence[0],observed_at:now,
  source_id:x.evidence[0].source_id.replace(String(at),String(now))
 }]}));
 const env={APEX_EDGE_TOKEN:'unit-test-key-not-deployed',
  DB:{prepare:()=>({bind:()=>({first:async()=>({neuron_reserved:500})})})},
  AI:{run:async()=>{calls++;return {response:'DO_NOT_LEAK_MODEL_OUTPUT_PLAIN_TEXT'};}}
 };
 const result=await worker.fetch(new Request(
  'https://apex.example.test/v1/agents/batch',{
  method:'POST',headers:{Authorization:'Bearer unit-test-key-not-deployed'},
  body:JSON.stringify({role:'analyst',items:fresh})
 }),env);
 assert.equal(result.status,503);
 const output=await result.json();
 assert.equal(output.error,'INVALID_BATCH_MODEL_OUTPUT');
 assert.equal(output.diagnostic,'BATCH_JSON_NOT_PARSEABLE');
 assert.equal(calls,1);
 assert.equal(JSON.stringify(output).includes('DO_NOT_LEAK'),false);
});
