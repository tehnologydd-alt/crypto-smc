import test from 'node:test';
import assert from 'node:assert/strict';
import {LEVEL_STUDY_VERSION,computeReferenceLevels,
 planResearchLevels,analyzeResearchLevelSequence} from './research-level-sequence.mjs';
const H=3600000,T=1700000000000-1700000000000%H;
const anchor=T+H-1;
const h=()=>({model:'EMPIRICAL_CLOSE_RANGE_V1',anchorCloseAt:anchor,
 targetCloseAt:anchor+4*H,anchorClose:100,bandLow:91,bandHigh:109});
const row=(obj=h())=>({id:'range1:BTCUSDT:1h:'+anchor,
 asset:'BTCUSDT',interval:'1h',publishedAt:anchor+500,
 hypothesis:JSON.stringify(obj)});
const bar=(i,low=99,high=101,closed=true)=>({
 t:T+i*H,closeAt:anchor+i*H,open:100,high,low,close:100,volume:10,closed
});
const plan=()=>planResearchLevels(row(),{now:anchor+10*H}).plan;
const audit=(bars,at=anchor+5*H)=>analyzeResearchLevelSequence(plan(),bars,{now:at});
test('fixed immutable symmetric levels are deterministic and cannot imply direction',()=>{
 const p=plan();
 assert.equal(p.entry,100);assert.equal(p.UP.tp1,103);
 assert.equal(p.UP.tp2,106);assert.equal(p.UP.tp3,109);
 assert.equal(p.UP.sl,97);
 assert.equal(p.DOWN.tp1,97);assert.equal(p.DOWN.tp2,94);
 assert.equal(p.DOWN.tp3,91);assert.equal(p.DOWN.sl,103);
 assert.equal(p.origin,'RETROSPECTIVE');
 assert.ok(!('signal' in p));
 assert.ok(!('side' in p));
});
test('a published immutable commitment is acknowledged but tampering fails closed',()=>{
 const levels=computeReferenceLevels(100,91,109);
 const commit={version:LEVEL_STUDY_VERSION,...levels};
 const r=planResearchLevels(row({...h(),levelStudy:commit}),{now:anchor+H});
 assert.equal(r.state,'READY');assert.equal(r.plan.origin,'PUBLISHED');
 const bad=planResearchLevels(row({...h(),levelStudy:{
  ...commit,UP:{...levels.UP,tp1:104}}}),{now:anchor+H});
 assert.equal(bad.state,'INVALID');assert.equal(bad.plan,null);
});
test('first TP touch on later hour is recorded before subsequent SL without fabricated P&L',()=>{
 const out=audit([bar(0),bar(1,99,101),bar(2,99,104),
  bar(3,96,105),bar(4,98,100)]);
 assert.equal(out.state,'COMPLETE');
 const up=out.branches[0];
 assert.equal(up.state,'TP1_FIRST');assert.equal(up.firstTouch.bar,2);
 assert.equal(up.found.tp1.bar,2);assert.equal(up.found.sl.bar,3);
 assert.equal(up.observations.length,2);
 assert.ok(!('profit' in out));
});
test('SL touched in a later full hour before any TP',()=>{
 const out=audit([bar(0),bar(1),bar(2,96,102),bar(3),bar(4)]);
 assert.equal(out.branches[0].state,'SL_FIRST');
 assert.equal(out.branches[0].firstTouch.bar,2);
});
test('first one-hour candle with a touch is ambiguous because it begins before publication',()=>{
 const out=audit([bar(0),bar(1,98,106),bar(2),bar(3),bar(4)]);
 assert.equal(out.branches[0].state,'PUBLICATION_HOUR_UNKNOWN');
 assert.equal(out.branches[0].firstTouch.beforePublicationPossible,true);
});
test('TP1 and SL within same later H1 is NOT assigned an artificial sequence',()=>{
 const out=audit([bar(0),bar(1),bar(2,96,104),bar(3),bar(4)]);
 assert.equal(out.branches[0].state,'SAME_H1_UNKNOWN');
 assert.deepEqual(out.branches[0].firstTouch.levels,['tp1','sl']);
});
test('higher targets in one bar keep same hour, no fictitious within-hour ordering',()=>{
 const out=audit([bar(0),bar(1),bar(2,99,111),bar(3),bar(4)]);
 assert.equal(out.branches[0].state,'TP1_FIRST');
 assert.deepEqual(out.branches[0].firstTouch.levels,['tp1','tp2','tp3']);
 assert.equal(out.branches[0].firstTouch.bar,2);
});
test('incomplete horizon remains partial; one missing completed candle blocks study',()=>{
 assert.equal(audit([bar(0),bar(1),bar(2)],anchor+2*H+1).state,'PARTIAL');
 assert.equal(audit([bar(0),bar(1),bar(3),bar(4)]).state,'NEEDS_DATA');
 assert.equal(audit([bar(0),bar(1),bar(2),bar(2),bar(3),bar(4)]).state,'NEEDS_DATA');
 assert.equal(audit([bar(0),bar(1),bar(2,98,104,false),bar(3),bar(4)]).state,'NEEDS_DATA');
});
test('source anchor mismatch and modified plan are rejected',()=>{
 const bars=[{...bar(0),close:90,low:89},bar(1),bar(2),bar(3),bar(4)];
 assert.equal(audit(bars).state,'NEEDS_DATA');
 const invalid={...plan(),UP:{...plan().UP,tp1:500}};
 assert.equal(analyzeResearchLevelSequence(invalid,[bar(0),bar(1)],{
  now:anchor+2*H
 }).state,'INVALID');
});
test('unconfirmed source/invalid row refuses level reconstruction',()=>{
 const r=row();
 assert.equal(planResearchLevels({...r,id:'BAD'},{now:anchor+H}).state,'INVALID');
 assert.equal(planResearchLevels({...r,publishedAt:anchor-1},{now:anchor+H}).state,'INVALID');
 assert.equal(computeReferenceLevels(100,120,200),null);
});
