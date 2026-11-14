import test from 'node:test';
import assert from 'node:assert/strict';
import {benchmarkCases,benchmarkInput,evaluateBenchmarkText,summarizeBenchmark} from './offline-research-benchmark.mjs';
test('fixed partitions are disjoint and no live data appears',()=>{
 const a=benchmarkCases('development'),b=benchmarkCases('holdout');
 assert.equal(a.length,4);assert.equal(b.length,4);
 assert.equal(new Set([...a,...b].map(c=>c.id)).size,8);
 assert.match(benchmarkInput(a[0].id).evidence.text,/Fictional measurement/);
 assert.throws(()=>benchmarkCases('other'));
});
test('transcription failures are explicit and exact matches include signed zero and decimals',()=>{
 const c=benchmarkCases('development')[0],line=v=>'APEX_FACT|'+c.id+'|'+c.field+'|'+v;
 assert.equal(evaluateBenchmarkText(c.id,line(c.literal)),'EXACT');
 assert.equal(evaluateBenchmarkText(c.id,line('18.26')),'DIFFERENT');
 assert.equal(evaluateBenchmarkText(c.id,'Plain prose.'),'MISSING');
 assert.equal(evaluateBenchmarkText(c.id,line(c.literal)+'\n'+line(c.literal)),'AMBIGUOUS');
 assert.equal(evaluateBenchmarkText(c.id,line('Infinity')),'INVALID_FORMAT');
 assert.equal(evaluateBenchmarkText(c.id,line('1e999')),'INVALID_FORMAT');
 assert.equal(evaluateBenchmarkText(c.id,line(c.literal).replace(c.id,'wrong-id')),'WRONG_SOURCE_OR_FIELD');
 assert.equal(evaluateBenchmarkText(c.id,null),'INVALID_RESPONSE');
 assert.equal(evaluateBenchmarkText('lab-length-a','APEX_FACT|lab-length-a|LENGTH_CM|-0'),'EXACT');
 assert.equal(evaluateBenchmarkText('lab-temp-b','APEX_FACT|lab-temp-b|TEMPERATURE_C|-3.5'),'EXACT');
});
test('only supplied responses contribute; empty or duplicate submissions cannot inflate results',()=>{
 const c=benchmarkCases('holdout')[0];
 const empty=summarizeBenchmark('holdout',[]);
 assert.equal(empty.models[0].counts.NOT_RUN,4);
 const r={id:c.id,role:'GLM',text:'APEX_FACT|'+c.id+'|'+c.field+'|'+c.literal};
 const x=summarizeBenchmark('holdout',[r]);
 assert.equal(x.models[0].counts.EXACT,1);assert.equal(x.models[0].counts.NOT_RUN,3);
 assert.equal(x.models[1].counts.NOT_RUN,4);
 assert.equal(x.actualModelCalls,0);assert.equal(x.archiveWrites,0);
 assert.throws(()=>summarizeBenchmark('holdout',[r,r]),/DUPLICATE/);
 assert.throws(()=>summarizeBenchmark('development',[r]),/INVALID_RESPONSE_ID/);
});
