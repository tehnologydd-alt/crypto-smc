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
  storage,now,roomRows:[{asset,interval:'15m',published:summary.frames['15m'].published+1,recordedTerminal:0}]
 }).frames['15m'].outOfDate,true);
 assert.equal(decisionQualityView(asset,{storage,now,
  roomRows:[{asset,interval:'15m',published:summary.frames['15m'].published,recordedTerminal:0}]
 }).frames['15m'].outOfDate,false);
 assert.equal(decisionQualityView(asset,{storage,now,
  roomRows:[{asset,interval:'15m',
   published:summary.frames['15m'].published,recordedTerminal:1}]
 }).frames['15m'].outOfDate,true);
 assert.equal(readDecisionQuality(asset,{storage,now:now+31*86400000}),null);
 const forged=JSON.parse(storage.getItem(DECISION_QUALITY_KEY));
 forged.summaries[asset].frames['15m'].repeatedModels=99;
 storage.setItem(DECISION_QUALITY_KEY,JSON.stringify(forged));
 assert.equal(readDecisionQuality(asset,{storage,now}),null);
});
test('independent audit results are reused instead of rerunning archive comparisons',()=>{
 const source=readFileSync(new URL('./forecast-feature-dashboard.mjs',import.meta.url),'utf8');
 const render=readFileSync(new URL('./forecast-probability-dashboard.mjs',import.meta.url),'utf8');
 assert.ok(source.includes('audits:verifiedAudits'));
 assert.ok(render.includes("onAudits({challenge,regimes,diagnostics:diagnosis})"));
});
test('manual audit of an empty complete archive stores only collecting states',()=>{
 const map=new Map();
 const storage={
  getItem:key=>map.get(key)??null,
  setItem:(key,value)=>map.set(key,value)
 };
 const emptyArchive={complete:true,publishedCount:0,forecasts:[]};
 assert.equal(saveDecisionQualityAudit(emptyArchive,asset,{
  storage,now,emit:false
 }),true);
 const snapshot=readDecisionQuality(asset,{storage,now});
 assert.equal(snapshot.frames['15m'].state,'COLLECTING');
 assert.equal(snapshot.frames['15m'].repeatedModels,0);
 assert.equal(snapshot.autoTraining,false);
});
test('overview, full-archive audit, web staging, and routing are wired',()=>{
 const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
 assert.ok(read('./overview-research-progress.mjs').includes(
  "window.addEventListener('apex:decision-quality-checked'"));
 assert.ok(read('./forecast-feature-dashboard.mjs').includes(
  'saveDecisionQualityAudit(archive,asset,{'));
 assert.ok(read('./index.html').includes('id="overview-decision-quality"'));
 assert.ok(read('./index.html').includes('data-target="forecast-feature-audit"'));
 assert.ok(read('../apex9-android/scripts/prepare-web.mjs').includes(
  "'overview-decision-quality.mjs'"));
 assert.ok(!read('./overview-decision-quality.mjs').includes(
  'getMobileAssetResearchArchive('));
});


test('degradation is measured across three verified chronological windows',async()=>{
 const {assessBaselineRankTrend}=await import('./overview-decision-quality.mjs');
 assert.deepEqual(assessBaselineRankTrend([.8,.68,.55]),
  {state:'DECLINING',delta:-.25});
 assert.deepEqual(assessBaselineRankTrend([.4,.5,.62]),
  {state:'RISING',delta:.22});
 assert.equal(assessBaselineRankTrend([.6,.58,.61]).state,'MIXED');
 for(const input of [null,[],[.3,.4],[.3,.2,NaN],[-1,.5,.2]])
  assert.equal(assessBaselineRankTrend(input).state,'NO_DATA');
});
test('manual audits record bounded distinct local history without repeated progress',async()=>{
 const {readDecisionHistory,DECISION_HISTORY_KEY,DECISION_HISTORY_LIMIT}
  =await import('./overview-decision-quality.mjs');
 const map=new Map(),storage={getItem:k=>map.get(k)??null,
  setItem:(k,v)=>map.set(k,v)};
 const mkAudit=(value,at)=>({
  asset,complete:true,publishedCount:value,
  forecasts:Array.from({length:value},(_,i)=>({
   asset,id:'direction3:abcdefghijkl'+i,interval:'15m',
   publishedAt:at-1000-i
  }))
 });
 const ch=()=>({asset,frames:Object.fromEntries(
  ['15m','1h','4h'].map(tf=>[tf,{
   state:'DESCRIPTIVE',futurePublished:130,newScored:120,
   models:[{id:'STRUCTURE_V1',state:'NOT_BETTER',
    baselineAuc:[.80,.69,.55],deltaAuc:[0,0,0]}]
  }]))});
 const regime=()=>({asset,frames:Object.fromEntries(
  ['15m','1h','4h'].map(tf=>[tf,{state:'COLLECTING'}]))});
 let at=Date.UTC(2026,11,1);
 for(let i=1;i<=15;i++){
  const args={storage,now:at+i*1000,emit:false,
   audits:{challenge:ch(),regimes:regime()}};
  assert.equal(saveDecisionQualityAudit(mkAudit(i,at+i*1000),asset,args),true);
 }
 let history=readDecisionHistory(asset,{storage,now:at+16000});
 assert.equal(history.length,DECISION_HISTORY_LIMIT);
 assert.equal(history[0].archiveCount,4);
 assert.equal(history.at(-1).archiveCount,15);
 assert.equal(history.at(-1).frames['15m'].trend,'DECLINING');
 assert.equal(history.at(-1).frames['15m'].lateAuc,.55);
 const repeat={storage,now:at+16000,emit:false,
  audits:{challenge:ch(),regimes:regime()}};
 assert.equal(saveDecisionQualityAudit(mkAudit(15,at+16000),asset,repeat),true);
 assert.equal(readDecisionHistory(asset,{storage,now:at+16000}).length,12);
 assert.equal(readDecisionHistory('ETHUSDT',{storage,now:at+16000}).length,0);
 const corrupt=JSON.parse(storage.getItem(DECISION_HISTORY_KEY));
 corrupt.assets[asset][0].frames['15m'].lateAuc=55;
 storage.setItem(DECISION_HISTORY_KEY,JSON.stringify(corrupt));
 assert.equal(readDecisionHistory(asset,{storage,now:at+16000}).length,0);
});
test('cached history is only created after a successful complete audit',()=>{
 const map=new Map(),storage={getItem:k=>map.get(k)??null,
  setItem:(k,v)=>map.set(k,v)};
 assert.equal(saveDecisionQualityAudit({complete:false,forecasts:[]},asset,{
  now:Date.UTC(2026,11,1),storage,emit:false}),false);
 assert.equal(map.size,0);
 const source=readFileSync(new URL('./overview-decision-quality.mjs',import.meta.url),'utf8');
 assert.ok(source.includes('rememberDecisionHistory(result,{storage,now})'));
 assert.ok(source.includes('readDecisionHistory(asset,{storage,now})'));
 assert.ok(!source.includes('getMobileAssetResearchArchive('));
});
