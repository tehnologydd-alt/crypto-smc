import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {diagnoseQualityFactors} from './forecast-quality-diagnostics.mjs';
const asset='BTCUSDT',frames=['15m','1h','4h'];
const data=(q={},c={},r={})=>({
 asset,
 quality:{asset,frames:Object.fromEntries(frames.map(tf=>[tf,{
  status:'DESCRIPTIVE_READY',issueCount:0,source:{
   published:140,verifiedSnapshots:140},
  readiness:[{key:'decisive',state:'MET'},
   {key:'lateDecisive',state:'MET'},
   {key:'futureScored',state:'MET'}],...q
 }]))},
 challenge:{asset,frames:Object.fromEntries(frames.map(tf=>[tf,{
  state:'DESCRIPTIVE',models:[{id:'STRUCTURE_V1',
   state:'NOT_BETTER',baselineAuc:[.6,.6,.6]}],...c
 }]))},
 regimes:{asset,frames:Object.fromEntries(frames.map(tf=>[tf,{
  state:'DESCRIPTIVE',windows:null,...r
 }]))}
});
const codes=r=>r.frames['15m'].codes;
test('does not create findings without complete matching reports',()=>{
 assert.equal(diagnoseQualityFactors({asset}).state,'UNAVAILABLE');
 const bad=data();bad.regimes.asset='ETHUSDT';
 assert.equal(diagnoseQualityFactors(bad).state,'UNAVAILABLE');
});
test('data integrity overrides hypothetical AUC changes',()=>{
 const x=diagnoseQualityFactors(data({status:'CHECK_DATA'},
  {models:[{id:'STRUCTURE_V1',baselineAuc:[.9,.8,.4],
   state:'RECENTLY_WORSE'}]}));
 assert.equal(x.state,'CHECK_DATA');
 assert.deepEqual(codes(x),['INTEGRITY']);
 assert.equal(x.causalProof,false);
});
test('lack of independent future outcomes is not performance degradation',()=>{
 const x=diagnoseQualityFactors(data({
  readiness:[{key:'decisive',state:'COLLECTING'},
   {key:'lateDecisive',state:'COLLECTING'},
   {key:'futureScored',state:'COLLECTING'}]
 },{state:'COLLECTING',models:[]}));
 assert.equal(x.state,'COLLECTING');
 assert.deepEqual(codes(x),['NEED_OUTCOMES','NEED_SCORES']);
});
test('source coverage and verified Radar are separate observations',()=>{
 const x=diagnoseQualityFactors(data({
  source:{published:140,verifiedSnapshots:43}
 }));
 assert.ok(codes(x).includes('SOURCE_GAP'));
 const windows=[
  {eligible:100,invalid:0,radarObserved:92,coverage:.92,
   modeEligible:{DIRECTIONAL:70,RANGE:12,MIXED:10}},
  {eligible:100,invalid:0,radarObserved:82,coverage:.82,
   modeEligible:{DIRECTIONAL:60,RANGE:12,MIXED:10}},
  {eligible:100,invalid:0,radarObserved:60,coverage:.60,
   modeEligible:{DIRECTIONAL:20,RANGE:30,MIXED:10}}
 ];
 const d=diagnoseQualityFactors(data({}, {},{windows}));
 assert.ok(codes(d).includes('RADAR_GAP'));
 assert.ok(codes(d).includes('RADAR_DROP'));
 assert.ok(!codes(d).includes('REGIME_SHIFT'));
});
test('mode shift requires enough prepublished verified snapshots',()=>{
 const win=[
  {eligible:100,invalid:0,radarObserved:90,coverage:.9,
   modeEligible:{DIRECTIONAL:70,RANGE:12,MIXED:8}},
  {eligible:100,invalid:0,radarObserved:90,coverage:.9,
   modeEligible:{DIRECTIONAL:45,RANGE:30,MIXED:15}},
  {eligible:100,invalid:0,radarObserved:90,coverage:.9,
   modeEligible:{DIRECTIONAL:20,RANGE:50,MIXED:20}}
 ];
 assert.ok(codes(diagnoseQualityFactors(data({}, {},{windows:win})))
  .includes('REGIME_SHIFT'));
 const broken=win.map(w=>({...w}));broken[1].invalid=2;
 assert.deepEqual(codes(diagnoseQualityFactors(data({}, {},{
  windows:broken}))),['INTEGRITY']);
});
test('forward AUC flags only after complete independent challenger audit',()=>{
 const models=[{id:'STRUCTURE_V1',state:'RECENTLY_WORSE',
  baselineAuc:[.83,.72,.55]}];
 assert.deepEqual(codes(diagnoseQualityFactors(data({},{
  models}))),['BASELINE_DROP','CANDIDATE_DROP']);
 assert.deepEqual(codes(diagnoseQualityFactors(data({},{
  models,state:'COLLECTING'}))),['NO_SIGNAL']);
 assert.equal(diagnoseQualityFactors(data()).causalProof,false);
});
test('audit is reused on overview; Android packaging ships diagnostics module',()=>{
 const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
 assert.ok(read('./forecast-probability-dashboard.mjs').includes(
  'diagnoseQualityFactors({asset,quality,challenge,regimes})'));
 assert.ok(read('./overview-decision-quality.mjs').includes(
  'diagnostics:audits?.diagnostics'));
 assert.ok(read('../apex9-android/scripts/prepare-web.mjs').includes(
  "'forecast-quality-diagnostics.mjs'"));
});
