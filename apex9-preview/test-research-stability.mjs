import test from 'node:test';
import assert from 'node:assert/strict';
import {wilsonShare,analyzeResearchStability} from './research-stability.mjs';
const types=[['STAYED_INSIDE','Внутри'],['RETURNED_INSIDE','Возврат'],
 ['FINISHED_OUTSIDE','Снаружи']];
function comparison(rows){
 return {state:'DESCRIPTIVE',
  periods:rows.map(a=>({samples:a.reduce((x,y)=>x+y,0),
   counts:Object.fromEntries(types.map(([id],i)=>[id,a[i]]))})),
  patterns:types.map(([id,label])=>({id,label}))};
}
test('Wilson bounds bracket shares, including 0 and 100 percent',()=>{
 for(const k of [0,1,6,11,12]){
  const b=wilsonShare(k,12);
  assert.ok(b.lower<=k/12&&k/12<=b.upper);
  assert.ok(b.lower>=0&&b.upper<=1);
 }
 assert.equal(wilsonShare(0,12).lower,0);
 assert.equal(wilsonShare(12,12).upper,1);
});
test('bad sample sizes and impossible counts are hidden',()=>{
 for(const [k,n] of [[-1,12],[13,12],[1,0],[1,1.2],[NaN,12]])
  assert.equal(wilsonShare(k,n),null);
});
test('constant shares remain purely descriptive',()=>{
 const x=analyzeResearchStability(comparison([[4,4,4],[4,4,4],[4,4,4]]));
 assert.equal(x.state,'DESCRIPTIVE');
 assert.equal(x.patterns.length,3);
 assert.equal(x.patterns[0].earlyLateChange,0);
 assert.equal(x.patterns[0].commonWilsonIntersection,true);
 assert.match(x.note,/не доказывает стабильность/);
});
test('fixed early-to-late shift is historical only',()=>{
 const x=analyzeResearchStability(comparison([[12,0,0],[6,6,0],[0,0,12]]));
 assert.equal(x.patterns[0].earlyLateChange,-1);
 assert.equal(x.patterns[0].largestHistoricalDifference,1);
 assert.equal(x.patterns[0].commonWilsonIntersection,false);
 assert.equal(x.patterns[2].earlyLateChange,1);
});
test('missing underlying evidence suppresses ALL comparative values',()=>{
 for(const state of ['INCOMPLETE_EVIDENCE','INSUFFICIENT','INVALID']){
  const x=analyzeResearchStability({...comparison([
   [4,4,4],[4,4,4],[4,4,4]]),state,reason:'Нет исходных данных'});
  assert.equal(x.state,'HIDDEN');
  assert.deepEqual(x.patterns,[]);
 }
});
test('partial period, broken totals, duplicate category never yield intervals',()=>{
 for(const a of [
  [[4,4,4],[4,4,4],[1,2,3]],
  [[4,4,4],[4,-1,9],[4,4,4]],
  [[4,4,4],[4,4,4],[4,4,4.5]]
 ])assert.equal(analyzeResearchStability(comparison(a)).state,'HIDDEN');
 const dup=comparison([[4,4,4],[4,4,4],[4,4,4]]);
 dup.patterns[2].id=dup.patterns[0].id;
 assert.equal(analyzeResearchStability(dup).state,'HIDDEN');
});
