import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {assessProviderSensitivity,PROVIDER_SENSITIVITY_VERSION}
 from './source-provider-sensitivity.mjs';

const period=(inverted=false)=>{
 const samples=Array.from({length:16},(_,i)=>{
  const outcome=(i*7)%16<8?'TP3':'STOP';
  const baseline=.47+.004*((i*3)%9);
  const sign=(outcome==='TP3'?1:-1)*(inverted?-1:1);
  return {outcome,baseline,
   withProvider:baseline+.10*sign,reversed:baseline-.10*sign};
 });
 return {samples,decisive:16,tp3:8};
};
const fixture=(inverted=false)=>Array.from({length:3},
 ()=>period(inverted));

test('stage 4 is withheld until the frozen temporal windows are eligible',()=>{
 const r=assessProviderSensitivity(fixture());
 assert.equal(r.state,'COLLECTING');
 assert.deepEqual(r.windows,[]);
 assert.equal(r.trained,false);
 assert.equal(r.modelChanged,false);
});
test('three paired windows report leave-one-out and time-shift diagnostics',()=>{
 const src=fixture(),before=structuredClone(src);
 const r=assessProviderSensitivity(src,{eligible:true});
 assert.equal(r.version,PROVIDER_SENSITIVITY_VERSION);
 assert.equal(r.state,'DESCRIPTIVE');
 assert.equal(r.windows.length,3);
 for(const w of r.windows){
  assert.equal(w.measured,16);
  assert.equal(w.positive,8);assert.equal(w.negative,8);
  assert.ok(w.deltaAuc>0);
  assert.ok(w.leaveOneOutMin<=w.leaveOneOutMax);
  assert.ok(w.leaveOneOutTotal===16);
  assert.ok(w.timeShiftTotal===15);
  assert.ok(w.timeShiftBeatsOriginal>=0&&w.timeShiftBeatsOriginal<=15);
  assert.equal(w.selectionCaution,false);
  assert.equal(w.classMixGap,0);
 }
 assert.deepEqual(src,before,'diagnostic must not change published samples');
 assert.equal(r.causal,false);assert.equal(r.significant,false);
});
test('reverse source does not turn a worse contribution into improvement',()=>{
 const r=assessProviderSensitivity(fixture(true),{eligible:true});
 assert.equal(r.state,'DESCRIPTIVE');
 assert.ok(r.windows.every(w=>w.deltaAuc<0));
 assert.ok(r.windows.every(w=>w.leaveOneOutMax<0));
});
test('provider-availability class imbalance is labeled a selection risk',()=>{
 const src=fixture();
 src[1].decisive=16;src[1].tp3=2;
 const r=assessProviderSensitivity(src,{eligible:true});
 assert.equal(r.state,'DESCRIPTIVE');
 assert.equal(r.windows[1].selectionCaution,true);
 assert.ok(r.windows[1].classMixGap>=.20);
 assert.equal(r.caution,'SENSITIVE');
});
test('incomplete, tampered and one-class samples fail closed',()=>{
 const arr=fixture();
 assert.equal(assessProviderSensitivity(arr.slice(0,2),{eligible:true}).state,
  'CHECK_DATA');
 const short=fixture();short[1].samples=short[1].samples.slice(0,8);
 assert.equal(assessProviderSensitivity(short,{eligible:true}).state,
  'COLLECTING');
 const bad=fixture();bad[0].samples[0].withProvider=99;
 assert.equal(assessProviderSensitivity(bad,{eligible:true}).state,
  'CHECK_DATA');
 const one=fixture();one[0].samples=one[0].samples.map(x=>({
  ...x,outcome:'TP3'}));
 assert.equal(assessProviderSensitivity(one,{eligible:true}).state,
  'COLLECTING');
});
test('stage 4 never adds polling, outcomes, source ranking weights or training',()=>{
 const source=readFileSync(new URL('./source-provider-sensitivity.mjs',
  import.meta.url),'utf8');
 const frozen=readFileSync(new URL('./source-provider-forward-audit.mjs',
  import.meta.url),'utf8');
 const pack=readFileSync(new URL('../apex9-android/scripts/prepare-web.mjs',
  import.meta.url),'utf8');
 assert.ok(frozen.includes('assessProviderSensitivity('));
 assert.ok(pack.includes("'source-provider-sensitivity.mjs'"));
 assert.equal(source.includes('fetch('),false);
 assert.equal(source.includes('Date.now('),false);
 assert.equal(source.includes('localStorage'),false);
 assert.equal(source.includes('Math.random('),false);
});
