import test from 'node:test';
import assert from 'node:assert/strict';
import {validateBatchAudit,makeBatchPrompt,parseBatchOutput}
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
