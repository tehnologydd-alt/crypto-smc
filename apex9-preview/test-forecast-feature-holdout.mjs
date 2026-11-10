import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {computeReferenceLevels} from './research-level-sequence.mjs';
import {inspectEvidenceContext} from './forecast-evidence-context.mjs';
import {assessFeatureStability} from './forecast-feature-stability.mjs';
import {observedFeatureMatch,analyzeForecastFeatureHoldout,
 FEATURE_HOLDOUT_RULES,FEATURE_DEFINITIONS} from './forecast-feature-holdout.mjs';

const STEP=900000,anchor0=Math.floor(1760000000000/STEP)*STEP-1;
const price=100,side='UP',width=.04;
const round=n=>Number(n.toPrecision(13));
const levels={entry:price,...computeReferenceLevels(price,
 round(price*Math.exp(-width)),round(price*Math.exp(width))).UP,
 direction:side,version:'MULTIFRAME_SINGLE_LEVELS_V1'};
const frameStates=['15m','1h','4h','1d'];
const feedStates=['market','liquidity','onchain','news','macro','social'];
function row(i,{isAligned=i%2===0,finish=i%4<2?'TP3':'STOP',
 overlap=false}={}){
 const anchor=anchor0+i*17*STEP+(overlap?-16*STEP:0);
 const publishedAt=anchor+2000;
 const targetCloseAt=anchor+16*STEP;
 const stamp=n=>({observedAt:anchor+n*STEP,recordedAt:anchor+n*STEP+1000});
 const stages=[
  {stage:'LIMIT_READY',...stamp(2)},
  {stage:'CONFIRMED',...stamp(3)}];
 if(finish==='TP3'){
  stages.push({stage:'TP1',...stamp(4)},
   {stage:'TP2',...stamp(5)},
   {stage:'TP3',...stamp(6)});
 }else stages.push({stage:'SL',...stamp(6)});
 stages.push({stage:'COMPLETED',...stamp(6)});
 const radar=Object.fromEntries(frameStates.map(x=>[x,{state:'MISSING'}]));
 radar['15m']={state:'OBSERVED',source:'ANDROID_NATIVE_RADAR',
  candleAt:anchor,observedAt:publishedAt,
  direction:isAligned?'UP':'DOWN',mode:'DIRECTIONAL',
  movement:.15,acceleration:.02,volumeRatio:1.1};
 const feeds=Object.fromEntries(feedStates.map(x=>[x,{state:'MISSING'}]));
 feeds.market={state:'OBSERVED',source:'binance:spot:24h',
  observedAt:publishedAt-1000,collectedAt:publishedAt-1000,ageMs:1000,
  features:{price:100,quoteVolume24h:10000,
   changePercent24h:isAligned?2:-2,scope:'SPOT_24H_TICKER'}};
 const h={model:'EMPIRICAL_MULTIFRAME_DIRECTION_V1',
  interval:'15m',evaluationInterval:'15m',
  decisionMethod:'SIX_BAR_EFFICIENCY_V1',
  stageSemantics:'SAME_FRAME_LIMIT_V1',direction:side,
  anchorCloseAt:anchor,anchorClose:price,
  targetCloseAt,horizonBars:16,
  sampleBars:96,empiricalSamples:92,
  historicalPercentile:.8,empiricalWidth:width,
  levelStudy:levels,contextAsPublished:{},
  evidenceAsPublished:{version:'AS_OF_ROOM_EVIDENCE_V1',
   capturedAt:publishedAt,
   policy:'DESCRIPTIVE_CONTEXT_ONLY_NO_FUTURE_LEAKAGE',
   feeds,radar}};
 return {asset:'BTCUSDT',interval:'15m',publishedAt,
  id:'direction3:BTCUSDT:15m:'+anchor,
  hypothesis:h,status:'COMPLETED',stageEvents:stages,
  evaluation:{outcome:finish,evaluatedAt:anchor+6*STEP+2000,
   targetCloseAt,actualClose:101,actualChangePct:1}};
}
const current=anchor0+140*17*STEP;
const archive=Array.from({length:100},(_,i)=>
 row(i,{isAligned:i%2===0,
  finish:i%2===0?(i%6===0?'STOP':'TP3'):(i%6===1?'TP3':'STOP')}));
test('synthetic published levels and pre-publication source observations validate',()=>{
 assert.equal(inspectEvidenceContext(archive[0]).state,'VERIFIED');
 assert.equal(observedFeatureMatch(inspectEvidenceContext(archive[0]),
  '15m','UP','sameRadar'),true);
 assert.equal(observedFeatureMatch(inspectEvidenceContext(archive[1]),
  '15m','UP','marketDay'),false);
 assert.equal(observedFeatureMatch(inspectEvidenceContext(archive[1]),
  '15m','UP','visibleDepth'),null);
 assert.equal(FEATURE_DEFINITIONS.length,4);
});
test('predeclared temporal holdout compares only disjoint confirmed outcomes',()=>{
 const result=analyzeForecastFeatureHoldout(archive,{
  asset:'BTCUSDT',complete:true,publishedCount:archive.length,now:current});
 assert.equal(result.state,'DESCRIPTIVE');
 assert.equal(result.frames['15m'].state,'DESCRIPTIVE');
 const data=result.frames['15m'];
 assert.equal(data.reference.counters.candidates,60);
 assert.equal(data.holdout.counters.candidates,40);
 assert.equal(data.reference.counters.nonoverlap,60);
 assert.equal(data.holdout.counters.nonoverlap,40);
 assert.equal(data.reference.counters.decisive,60);
 assert.equal(data.holdout.counters.decisive,40);
 assert.equal(data.purged,0);
 assert.equal(data.features.find(x=>x.id==='sameRadar').state,'DESCRIPTIVE');
 assert.equal(data.features.find(x=>x.id==='marketDay').state,'DESCRIPTIVE');
 assert.equal(data.features.find(x=>x.id==='visibleDepth').state,'INSUFFICIENT');
 assert.equal(result.frames['4h'].state,'INSUFFICIENT');
 assert.equal(result.frames['1h'].state,'INSUFFICIENT');
});
test('truncated or overlapping journal cannot establish a feature relationship',()=>{
 const partial=analyzeForecastFeatureHoldout(archive.slice(-75),{
  asset:'BTCUSDT',complete:false,publishedCount:100,now:current});
 assert.equal(partial.state,'INCOMPLETE');
 const masquerade=analyzeForecastFeatureHoldout(archive.slice(-75),{
  asset:'BTCUSDT',complete:true,publishedCount:100,now:current});
 assert.equal(masquerade.state,'INCOMPLETE');
 const duplicate=analyzeForecastFeatureHoldout([...archive.slice(0,99),archive[0]],{
  asset:'BTCUSDT',complete:true,publishedCount:100,now:current});
 assert.equal(duplicate.state,'INVALID');
 const mixed=analyzeForecastFeatureHoldout([...archive.slice(0,99),
  {...archive[99],asset:'ETHUSDT'}],{
  asset:'BTCUSDT',complete:true,publishedCount:100,now:current});
 assert.equal(mixed.state,'INVALID');
});
test('outcomes not available before test start are excluded from reference',()=>{
 const newer=archive.map(x=>({...x,hypothesis:{...x.hypothesis}}));
 const ref=newer[30];
 newer[30]={...ref,evaluation:{...ref.evaluation,
  evaluatedAt:archive[60].publishedAt+2000}};
 const report=analyzeForecastFeatureHoldout(newer,{
  asset:'BTCUSDT',complete:true,publishedCount:100,now:current});
 assert.equal(report.frames['15m'].reference.counters.lateReference,1);
 assert.equal(report.frames['15m'].reference.counters.decisive,59);
});
test('pre-published target horizon purge is independent of outcome choice',()=>{
 const altered=archive.map(x=>({...x,hypothesis:{...x.hypothesis}}));
 const penultimate=altered[59];
 altered[59]={...penultimate,hypothesis:{...penultimate.hypothesis,
  targetCloseAt:archive[60].publishedAt+5000}};
 const report=analyzeForecastFeatureHoldout(altered,{
  asset:'BTCUSDT',complete:true,publishedCount:100,now:current});
 assert.equal(report.frames['15m'].purged,1);
 assert.equal(report.frames['15m'].reference.counters.candidates,59);
});
test('stale data, unverified articles and model-free results never count as alignment',()=>{
 const r=row(0),context=inspectEvidenceContext(r);
 assert.equal(observedFeatureMatch(context,'15m','UP','sameRadar'),true);
 r.hypothesis.evidenceAsPublished.radar['15m'].state='STALE';
 assert.equal(inspectEvidenceContext(r).state,'INVALID');
 const r2=row(1);
 r2.hypothesis.evidenceAsPublished.feeds.news={
  state:'OBSERVED',source:'gdelt',observedAt:r2.publishedAt-1000,
  collectedAt:r2.publishedAt-1000,ageMs:1000,
  features:{scope:'UNVERIFIED_CONTEXT_METADATA_ONLY'}};
 assert.equal(inspectEvidenceContext(r2).state,'VERIFIED');
 assert.equal(observedFeatureMatch(inspectEvidenceContext(r2),
  '15m','UP','higherRadar'),null);
});
test('on-demand UI, Android packaging and declared caps are present',()=>{
 const ui=readFileSync(new URL('./forecast-feature-dashboard.mjs',import.meta.url),'utf8');
 const html=readFileSync(new URL('./index.html',import.meta.url),'utf8');
 const manifest=readFileSync(new URL('../apex9-android/scripts/prepare-web.mjs',
  import.meta.url),'utf8');
 const favorites=readFileSync(new URL('./favorite-dashboard.mjs',import.meta.url),'utf8');
 assert.ok(ui.includes('getMobileAssetResearchArchive(asset,'));
 assert.ok(ui.includes('maxRows:1500'));
 assert.ok(ui.includes("button.addEventListener('click'"));
 assert.ok(html.includes('id="feature-holdout-run"'));
 assert.ok(manifest.includes("'forecast-feature-holdout.mjs'"));
 assert.ok(manifest.includes("'forecast-feature-dashboard.mjs'"));
 assert.ok(favorites.includes('initFeatureHoldoutDashboard('));
 assert.equal(FEATURE_HOLDOUT_RULES.referenceFraction,.6);
 assert.equal(FEATURE_HOLDOUT_RULES.minGroup,12);
});


test('fixed 60/20/20 publication split preserves entire holdout and embargo',()=>{
 const audit=analyzeForecastFeatureHoldout(archive,{
  asset:'BTCUSDT',complete:true,publishedCount:archive.length,now:current});
 const frame=audit.frames['15m'];
 assert.equal(frame.reference.counters.candidates,60);
 assert.equal(frame.holdout.counters.candidates,40);
 assert.equal(frame.validation.counters.candidates,20);
 assert.equal(frame.confirmation.counters.candidates,20);
 assert.equal(frame.validation.counters.decisive,20);
 assert.equal(frame.confirmation.counters.decisive,20);
 assert.equal(frame.purgedValidation,0);
 assert.equal(frame.confirmationAt,archive[80].publishedAt);
 assert.ok(frame.splitAt<frame.confirmationAt);
 const quality=assessFeatureStability(audit);
 const feature=quality.frames['15m'].features.find(f=>f.id==='sameRadar');
 // Although its sign repeats, this deliberately uneven small sample
 // changes effect size by >20 percentage points between the two late windows.
 // The gate must label it DRIFTING instead of promoting a convenient pattern.
 assert.equal(feature.state,'DRIFTING');
 assert.equal(feature.approvedForForecast,false);
 assert.equal(quality.approvedForForecast,false);
});
test('second boundary purges crossing horizon before confirmation',()=>{
 const copies=archive.map(x=>({...x,hypothesis:{...x.hypothesis}}));
 // The candidate is removed based on its original published target horizon,
 // never because of its observed result.
 copies[79].hypothesis.targetCloseAt=archive[80].publishedAt+1;
 const audit=analyzeForecastFeatureHoldout(copies,{
  asset:'BTCUSDT',complete:true,publishedCount:copies.length,now:current});
 const frame=audit.frames['15m'];
 assert.equal(frame.purgedValidation,1);
 assert.equal(frame.validation.counters.candidates,19);
 assert.equal(frame.holdout.counters.candidates,40);
});
test('source snapshots and outcome labels remain read-only during stability',()=>{
 const before=JSON.stringify(archive);
 const audit=analyzeForecastFeatureHoldout(archive,{
  asset:'BTCUSDT',complete:true,publishedCount:archive.length,now:current});
 assessFeatureStability(audit);
 assert.equal(JSON.stringify(archive),before);
});
