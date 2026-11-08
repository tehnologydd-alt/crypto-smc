import test from 'node:test';import assert from 'node:assert/strict';
import {buildScenarioReplay,REPLAY_LABELS} from './scenario-replay.mjs';
const H=3600000,a=1700002799999;
const scenario={
 id:'range1:BTCUSDT:1h:'+a,asset:'BTCUSDT',anchorCloseAt:a,
 targetCloseAt:a+4*H,anchorClose:100,bandLow:95,bandHigh:105,
 milestones:[
  {key:'PUBLISHED',observedAt:a+200},
  {key:'CONFIRMED',observedAt:a+H},
  {key:'ACTIVE',observedAt:a+2*H},
  {key:'EVALUATED',observedAt:a+4*H}
 ],
 result:{actualClose:102,outcome:'WITHIN_RANGE'}
};
function candles(prices=[100,98,103,106,102]){
 return prices.map((close,i)=>({
  closeAt:a+i*H,t:a+i*H-H+1,closed:true,
  open:close,high:close+1,low:close-1,close,volume:100+i
 }));
}
test('five real closed-H1 observations retain published prices unchanged',()=>{
 const original=JSON.stringify(scenario),history=candles();
 const replay=buildScenarioReplay(scenario,history,{now:a+6*H});
 assert.equal(replay.state,'COMPLETE');
 assert.equal(replay.observed,5);
 assert.deepEqual(replay.points.map(x=>x.inside),[true,true,true,false,true]);
 assert.equal(replay.points[3].stageObserved,false);
 assert.equal(replay.verifiedFinal,true);
 assert.equal(JSON.stringify(scenario),original);
 assert.equal(REPLAY_LABELS.length,5);
});
test('missing third H1 remains missing, no smooth interpolated close',()=>{
 const h=candles().filter((_,i)=>i!==3);
 const r=buildScenarioReplay(scenario,h,{now:a+6*H});
 assert.equal(r.state,'PARTIAL');assert.equal(r.observed,4);
 assert.equal(r.points[3].state,'MISSING');assert.equal(r.points[3].close,null);
 assert.equal(r.points[3].deltaPct,null);
});
test('later candles already in cache but not yet closed are not revealed',()=>{
 const r=buildScenarioReplay(scenario,candles(),{now:a+2*H+1});
 assert.equal(r.points[4].state,'NOT_CLOSED');
 assert.equal(r.points[4].close,null);
 assert.equal(r.verifiedFinal,false);
});
test('bad bar and duplicate H1 time never qualify as evidence',()=>{
 const bad=candles();bad[2]={...bad[2],high:80};
 let r=buildScenarioReplay(scenario,bad,{now:a+6*H});
 assert.equal(r.state,'SOURCE_CONFLICT');
 assert.equal(r.points[2].state,'INVALID_SOURCE');
 const h=candles();h.push({...h[1]});
 r=buildScenarioReplay(scenario,h,{now:a+6*H});
 assert.equal(r.state,'SOURCE_CONFLICT');
 assert.equal(r.points[1].state,'AMBIGUOUS');
});
test('conflicting true close vs Room evaluation withholds final verification',()=>{
 const r=buildScenarioReplay({...scenario,result:{
  actualClose:90,outcome:'OUTSIDE_RANGE'
 }},candles(),{now:a+6*H});
 assert.equal(r.state,'RESULT_CONFLICT');
 assert.equal(r.verifiedFinal,false);
});
test('anchor data mismatch exposes source discrepancy instead of false replay',()=>{
 const r=buildScenarioReplay(scenario,candles([101,98,103,106,102]),
  {now:a+6*H});
 assert.equal(r.state,'ANCHOR_MISMATCH');assert.equal(r.verifiedFinal,false);
});
test('independent historical close does not invent stage event',()=>{
 const r=buildScenarioReplay({...scenario,milestones:[]},candles(),
  {now:a+6*H});
 assert.equal(r.points[1].state,'OBSERVED');
 assert.equal(r.points[1].stageObserved,false);
 assert.equal(r.verifiedFinal,false);
});
