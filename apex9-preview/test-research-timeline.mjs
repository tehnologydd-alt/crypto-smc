import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectResearchTimeline,RESEARCH_STEPS} from './research-timeline.mjs';
const H=3600000,anchor=1700002799999,target=anchor+4*H,now=target+600000;
const source={
 id:'range1:BTCUSDT:1h:'+anchor,asset:'BTCUSDT',interval:'1h',
 publishedAt:anchor+1000,status:'ACTIVE',
 hypothesis:JSON.stringify({
  model:'EMPIRICAL_CLOSE_RANGE_V1',anchorCloseAt:anchor,targetCloseAt:target,
  anchorClose:100,bandLow:95,bandHigh:105
 }),
 stageEvents:[
  {stage:'PENDING_CONFIRMATION',observedAt:anchor+1000,recordedAt:anchor+1000},
  {stage:'CONFIRMED',observedAt:anchor+H,recordedAt:anchor+H+500,
   explanation:'Первое закрытие внутри диапазона'},
  {stage:'ACTIVE',observedAt:anchor+2*H,recordedAt:anchor+2*H+500,
   explanation:'Второе закрытие получено'}
 ]
};
test('stage events preserve observed close timestamps and separate ingestion delays',()=>{
 const r=inspectResearchTimeline(source,{now:target-1000});
 assert.equal(r.state,'ACTIVE');
 assert.equal(r.verifiedSteps,3);
 assert.deepEqual(r.steps.map(x=>x.observed),[true,true,true,false]);
 assert.equal(r.steps[1].at,anchor+H);
 assert.equal(r.steps[1].recordedAt,anchor+H+500);
 assert.equal(r.remainingMs,1000);
 assert.equal(RESEARCH_STEPS.length,4);
});
test('clock reaching forecast horizon never fabricates outcome or timeout cancellation',()=>{
 const r=inspectResearchTimeline(source,{now});
 assert.equal(r.state,'DUE_UNVERIFIED');
 assert.equal(r.verifiedSteps,3);
 assert.equal(r.dueUnverified,true);
 assert.equal(r.result,null);
});
test('verified immutable outcome produces historical result only, not any TP/SL',()=>{
 const row={...source,evaluation:{
  outcome:'WITHIN_RANGE',actualClose:102,targetCloseAt:target,evaluatedAt:target+1000
 }};
 const r=inspectResearchTimeline(row,{now});
 assert.equal(r.state,'EVALUATED');
 assert.equal(r.verifiedSteps,4);
 assert.equal(r.result.outcome,'WITHIN_RANGE');
 assert.equal(r.takeProfit,undefined);
});
test('contradictory outcome is never treated as completed evidence',()=>{
 const row={...source,evaluation:{
  outcome:'OUTSIDE_RANGE',actualClose:102,targetCloseAt:target,evaluatedAt:target+1000
 }};
 const r=inspectResearchTimeline(row,{now});
 assert.equal(r.state,'INCONSISTENT_RESULT');
 assert.equal(r.dueUnverified,true);
 assert.equal(r.result,null);
});
test('unverified claimed stage, malformed record and future event are rejected',()=>{
 const invalidStage={...source,stageEvents:[
  {stage:'CONFIRMED',observedAt:anchor+2*H,recordedAt:anchor+2*H+1},
  {stage:'ACTIVE',observedAt:anchor+2*H,recordedAt:now+2*H}
 ]};
 const r=inspectResearchTimeline(invalidStage,{now:target-100});
 assert.equal(r.verifiedSteps,1);
 assert.equal(r.state,'PENDING_CONFIRMATION');
 assert.equal(inspectResearchTimeline({...source,hypothesis:'?'},{now}).state,'INVALID');
});
test('old research with no stage log does not fabricate milestone history',()=>{
 const r=inspectResearchTimeline({...source,stageEvents:[]},{now:target-1});
 assert.equal(r.state,'PENDING_CONFIRMATION');
 assert.deepEqual(r.steps.map(x=>x.observed),[true,false,false,false]);
});
