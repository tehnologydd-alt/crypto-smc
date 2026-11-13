import test from 'node:test';
import assert from 'node:assert/strict';
import {LIMITS,FREE_NEURON_BUDGET,estimateInferenceNeurons,utcNeuronKey,
 reserveAdaptiveLanguage} from './budget-governor.mjs';
test('tier is increased but conservative free quota includes explicit reserve',()=>{
 assert.equal(LIMITS.language.daily,36);
 assert.equal(LIMITS.language.monthly,720);
 assert.equal(FREE_NEURON_BUDGET.apexCeiling,7500);
 assert.equal(FREE_NEURON_BUDGET.dailyAllocation-
  FREE_NEURON_BUDGET.apexCeiling,2500);
});
test('Qwen costs more per call and prompt size, never claims exact billing',()=>{
 const cheap=estimateInferenceNeurons('analyst',2000,900);
 const costly=estimateInferenceNeurons('critic',2000,900);
 assert.ok(costly>cheap&&cheap>0);
 assert.ok(estimateInferenceNeurons('critic',4500,1400)>costly);
 assert.equal(estimateInferenceNeurons('bad',2000),null);
 assert.equal(estimateInferenceNeurons('critic',26000),null);
 assert.equal(estimateInferenceNeurons('critic',2000,2000),null);
});
test('provider UTC midnight is independent of Kyiv midnight',()=>{
 const before=Date.parse('2026-11-13T23:59:59Z');
 const after=Date.parse('2026-11-14T00:00:00Z');
 assert.equal(utcNeuronKey(before),'2026-11-13');
 assert.equal(utcNeuronKey(after),'2026-11-14');
});
test('single D1 upsert checks cooldown, Kyiv day/night and UTC Neurons together',async()=>{
 const at=Date.parse('2026-11-13T18:00:00Z');
 let queries=[];
 const db={prepare:sql=>({bind:(...args)=>({
  first:async()=>{queries.push({sql,args});
   return {day_used:1,month_used:1,night_used:0,
    neuron_reserved:args[6],last_at:at};}
 })})};
 const got=await reserveAdaptiveLanguage(db,'critic',2400,1400,at);
 assert.ok(got.estimatedNeurons>0);
 assert.equal(got.neuronDayUtc,'2026-11-13');
 assert.equal(queries.length,1);
 assert.equal(queries[0].args.length,12);
 assert.equal(queries[0].args[11],7500);
 for(const text of ['neuron_reserved+excluded.neuron_reserved',
  'last_at+?8','month_used<?10','night_used<?11','RETURNING day_used'])
  assert.ok(queries[0].sql.includes(text));
 assert.equal(await reserveAdaptiveLanguage(
  {prepare:()=>({bind:()=>({first:async()=>null})})},
  'critic',2400,1400,at),null);
 assert.equal(await reserveAdaptiveLanguage(null,'critic',2400,1400,at),null);
});
