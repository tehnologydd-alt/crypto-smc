import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {summarizeDecisionQuality,saveDecisionQualityAudit,
 readDecisionQuality,decisionQualityView,DECISION_QUALITY_KEY}
 from './overview-decision-quality.mjs';

const asset='BTCUSDT';
const now=Date.UTC(2026,10,21);
const forecasts=['15m','1h','4h'].map((interval,i)=>({
 asset,id:interval==='1h'?'direction2:abc12345678':
  'direction3:abc1234567'+i,interval,publishedAt:now-1000
}));
const archive={complete:true,publishedCount:3,forecasts};
const mk=(state='DESCRIPTIVE',deltas=[.04,.05,.06])=>({
 asset,frames:Object.fromEntries(['15m','1h','4h'].map(tf=>[tf,{
 state,futurePublished:130,newScored:120,
 models:state==='DESCRIPTIVE'?['STRUCTURE_V1','IMPULSE_V1','VOLUME_V1']
  .map((id,i)=>({id,state:i===0?'OBSERVED_THREE_TIMES':'NOT_BETTER',
   deltaAuc:i===0?deltas:[0,0,0]})):[]}])),
});
const mode=(supported=true)=>({
 asset,frames:Object.fromEntries(['15m','1h','4h'].map(tf=>[tf,{
 state:supported?'DESCRIPTIVE':'COLLECTING',
 regimes:supported?{DIRECTIONAL:{state:'DESCRIPTIVE',models:[
  {id:'STRUCTURE_V1',state:'OBSERVED_THREE_TIMES'}]}}:null
 }])),
});
test('quality is an independent research summary, NOT a trained model probability',()=>{
 const s=summarizeDecisionQuality({
  asset,archive,challenge:mk(),regimes:mode(),now
 });
 assert.equal(s.frames['1h'].state,'REGIME_SUPPORT');
 assert.equal(s.frames['4h'].repeatedModels,1);
 assert.equal(s.frames['15m'].regimeRepeatedModels,1);
 assert.deepEqual(s.frames['15m'].structureDelta,[.04,.05,.06]);
 assert.equal(s.autoTraining,false);
 assert.equal(s.calibratedProbability,null);
});
test('missing regime repetition is not presented as cross-regime support',()=>{
 const s=summarizeDecisionQuality({
  asset,archive,challenge:mk(),regimes:mode(false),now
 });
 assert.equal(s.frames['15m'].state,'REPEATED');
 const no=summarizeDecisionQuality({
  asset,archive,challenge:mk('COLLECTING'),regimes:mode(false),now
 });
 assert.equal(no.frames['15m'].state,'COLLECTING');
 assert.equal(no.frames['15m'].structureDelta,null);
});
test('unstable, worse and not better do not become increased accuracy',()=>{
 const unstable=mk();
 for(const f of Object.values(unstable.frames)){
  f.models[0].state='RECENTLY_WORSE';
  f.models[0].deltaAuc=[.05,.04,-.05];
 }
 const s=summarizeDecisionQuality({
  asset,archive,challenge:unstable,regimes:mode(false),now
 });
 assert.equal(s.frames['1h'].state,'UNSTABLE');
 assert.equal(s.frames['1h'].repeatedModels,0);
 for(const f of Object.values(unstable.frames))
  f.models[0].state='NOT_BETTER';
 const b=summarizeDecisionQuality({
  asset,archive,challenge:unstable,regimes:mode(false),now
 });
 assert.equal(b.frames['1h'].state,'NOT_BETTER');
});
test('invalid and incomplete data fails closed',()=>{
 assert.equal(summarizeDecisionQuality({
  asset,archive:{...archive,complete:false},challenge:mk(),
  regimes:mode(),now}),null);
 assert.equal(summarizeDecisionQuality({
  asset,archive,challenge:{...mk(),asset:'ETHUSDT'},regimes:mode(),now}),null);
 const invalid=mk('INVALID_EVIDENCE');
 assert.equal(summarizeDecisionQuality({
  asset,archive,challenge:invalid,regimes:mode(false),now
 }).frames['1h'].state,'CHECK_DATA');
});
test('separate favorite cache, stale Room counts and audited timestamps',()=>{
 const map=new Map();
 const storage={
  getItem:key=>map.get(key)??null,
  setItem:(key,value)=>map.set(key,value)
 };
 assert.equal(readDecisionQuality(asset,{storage,now}),null);
 // A valid externally audited view can only be cached by the actual
 // full-archive audit path; a browser does not fabricate the summary.
 const summary=summarizeDecisionQuality({
  asset,archive,challenge:mk(),regimes:mode(),now
 });
 storage.setItem(DECISION_QUALITY_KEY,JSON.stringify({
  version:summary.version,summaries:{[asset]:summary}
 }));
 assert.equal(readDecisionQuality(asset,{storage,now}).archiveCount,3);
 assert.equal(readDecisionQuality('ETHUSDT',{storage,now}),null);
 assert.equal(decisionQualityView(asset,{
  storage,now,roomRows:[{asset,interval:'15m',published:2}]
 }).frames['15m'].outOfDate,true);
 assert.equal(decisionQualityView(asset,{storage,now,
  roomRows:[{asset,interval:'15m',published:1}]
 }).frames['15m'].outOfDate,false);
 assert.equal(readDecisionQuality(asset,{storage,now:now+31*86400000}),null);
 const forged=JSON.parse(storage.getItem(DECISION_QUALITY_KEY));
 forged.summaries[asset].frames['15m'].repeatedModels=99;
 storage.setItem(DECISION_QUALITY_KEY,JSON.stringify(forged));
 assert.equal(readDecisionQuality(asset,{storage,now}),null);
});
test('overview, full-archive audit, web staging, and routing are wired',()=>{
 const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
 assert.ok(read('./overview-research-progress.mjs').includes(
  "window.addEventListener('apex:decision-quality-checked'"));
 assert.ok(read('./forecast-feature-dashboard.mjs').includes(
  'saveDecisionQualityAudit(archive,asset,{now:auditedAt})'));
 assert.ok(read('./index.html').includes('id="overview-decision-quality"'));
 assert.ok(read('./index.html').includes('data-target="forecast-feature-audit"'));
 assert.ok(read('../apex9-android/scripts/prepare-web.mjs').includes(
  "'overview-decision-quality.mjs'"));
 assert.ok(!read('./overview-decision-quality.mjs').includes(
  'getMobileAssetResearchArchive('));
});
