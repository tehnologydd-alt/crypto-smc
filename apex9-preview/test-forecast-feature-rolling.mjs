import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {computeReferenceLevels} from './research-level-sequence.mjs';
import {auditRollingFeatureEvidence,ROLLING_FEATURE_VERSION,
 ROLLING_FEATURE_RULES} from './forecast-feature-rolling.mjs';
import {
 auditShadowChallengers,challengerScore,SHADOW_CHALLENGER_VERSION,
 SHADOW_CHALLENGER_RECIPES,SHADOW_CHALLENGER_REGISTRATION
} from './forecast-shadow-challengers.mjs';
import {auditShadowRegimes,inspectPublishedRegime,
 SHADOW_REGIMES_VERSION,SHADOW_REGIMES_RULES}
 from './forecast-shadow-regimes.mjs';

const M=900000,H=3600000,H4=14400000;
const asset='BTCUSDT',now=1900000000000;
const tfStep=tf=>tf==='15m'?M:tf==='4h'?H4:H;
const clean=x=>Number(x.toPrecision(13));
function scenario(tf,i,{efficiency=i%2===0?.9:.1,
 travelNorm=.5,volumeNorm=.5,volumeAvailable=true,
 outcome=i%2===0?'TP3':'STOP',offset=0,baseEpoch=1760000000000}={}){
 const step=tfStep(tf),a=Math.floor(baseEpoch/step)*step-1+
  (25*i+offset)*step;
 const publishedAt=a+2000,horizon=tf==='15m'?16:24;
 const end=a+horizon*step,observe=tf==='1h'?300000:step;
 const event=(stage,n)=>({stage,observedAt:a+n*observe,
  recordedAt:a+n*observe+1000});
 const history=[event('LIMIT_READY',2),event('CONFIRMED',3)];
 if(outcome==='TP3')
  history.push(event('TP1',4),event('TP2',5),event('TP3',6));
 if(outcome==='STOP')history.push(event('SL',6));
 if(outcome==='HORIZON')history.push(event('TIMEOUT',horizon));
 if(outcome!=='AWAITING')
  history.push(event('COMPLETED',outcome==='HORIZON'?horizon:6));
 const low=clean(100*Math.exp(-.04)),high=clean(100*Math.exp(.04));
 const levels=computeReferenceLevels(100,low,high).UP;
 const h1=tf==='1h';
 const hypothesis=h1?{
  model:'EMPIRICAL_DIRECTION_LEVELS_V2',
  decisionMethod:'SIX_BAR_EFFICIENCY_V1',direction:'UP',
  anchorCloseAt:a,targetCloseAt:end,horizonBars:24,anchorClose:100,
  bandLow:low,bandHigh:high,levelStudy:{
   version:'H1_SINGLE_LEVELS_V2',direction:'UP',entry:100,...levels},
  evaluationInterval:'5m',observationMethod:'M5_CLOSED_LEVEL_ORDER_V1',
  stageSemantics:'LIMIT_READY_M5_V1',calibratedProbability:null
 }:{
  model:'EMPIRICAL_MULTIFRAME_DIRECTION_V1',interval:tf,
  evaluationInterval:tf,direction:'UP',decisionMethod:'SIX_BAR_EFFICIENCY_V1',
  stageSemantics:'SAME_FRAME_LIMIT_V1',anchorCloseAt:a,anchorClose:100,
  targetCloseAt:end,horizonBars:horizon,sampleBars:96,
  empiricalSamples:92,historicalPercentile:.8,empiricalWidth:.04,
  levelStudy:{version:'MULTIFRAME_SINGLE_LEVELS_V1',
   direction:'UP',entry:100,...levels},
  contextAsPublished:{},calibratedProbability:null
 };
 hypothesis.preOutcomeStrength={
  version:'PREOUTCOME_SIGNAL_STRENGTH_V1',
  state:'OBSERVED',interval:tf,
  scope:'CLOSED_PRICE_VOLUME_ONLY_UNTRAINED',
  event:'TERMINAL_TP3_VS_STOP',candleCutoffAt:a,
  capturedAt:publishedAt,sampleBars:96,
  efficiency,travelNorm,volumeNorm,volumeAvailable,
  score:Math.round(1000*(.5*efficiency+.3*travelNorm+
   .2*volumeNorm))/10,
  scoreType:'UNTRAINED_SIGNAL_STRENGTH_NOT_PROBABILITY',
  calibratedProbability:null
 };
 return {id:(h1?'direction2:':'direction3:')+
  asset+':'+tf+':'+a,asset,interval:tf,publishedAt,
  status:outcome==='AWAITING'?'ACTIVE':'COMPLETED',
  hypothesis,stageEvents:history,
  ...(outcome==='AWAITING'?{}:{evaluation:{
   outcome,evaluatedAt:a+(outcome==='HORIZON'?horizon*step:
    6*observe)+2000,targetCloseAt:end,
   actualClose:101,actualChangePct:1
  }})};
}
const group=(tf,n=150,options={})=>Array.from({length:n},(_,i)=>
 scenario(tf,i,{...options,
  outcome:options.outcomeOf?.(i)??(i%2===0?'TP3':'STOP'),
  efficiency:options.efficiencyOf?.(i)??(i%2===0?.9:.1),
  volumeAvailable:options.volumeOf?.(i)??true,
  volumeNorm:options.volumeNormOf?.(i)??.5,
  travelNorm:options.travelNormOf?.(i)??.5,
  baseEpoch:options.baseEpoch??1760000000000
 }));
const audit=rows=>auditRollingFeatureEvidence(rows,{
 asset,complete:true,publishedCount:rows.length,now});

test('three pure future windows repeat only truly informative fixed efficiency',()=>{
 const report=audit(group('15m'));
 assert.equal(report.version,ROLLING_FEATURE_VERSION);
 assert.equal(report.state,'DESCRIPTIVE');
 assert.equal(report.calibratedProbability,null);
 assert.equal(report.trained,false);
 const f=report.frames['15m'];
 assert.equal(f.state,'DESCRIPTIVE');
 assert.equal(f.scored,150);
 assert.deepEqual(f.windows.map(x=>x.decisive),[50,50,50]);
 assert.deepEqual(f.windows.map(x=>x.tp3),[25,25,25]);
 assert.deepEqual(f.windows.map(x=>x.overlap),[0,0,0]);
 assert.deepEqual(f.windows.map(x=>x.purged),[0,0,0]);
 assert.equal(f.features.length,3);
 const features=Object.fromEntries(f.features.map(x=>[x.key,x]));
 assert.equal(features.efficiency.state,'OBSERVED_IN_ALL_THREE');
 assert.deepEqual(features.efficiency.deltaAuc,[.5,.5,.5]);
 assert.deepEqual(features.efficiency.fullAuc,[1,1,1]);
 assert.deepEqual(features.efficiency.withoutAuc,[.5,.5,.5]);
 assert.equal(features.volumeNorm.state,'NO_REPEATED_VALUE');
 assert.equal(features.travelNorm.state,'NO_REPEATED_VALUE');
 assert.deepEqual(features.volumeNorm.deltaAuc,[0,0,0]);
 assert.equal(f.modelChanged,false);
 assert.equal(ROLLING_FEATURE_RULES.autoTraining,false);
});
test('late reversal prevents false stability conclusion',()=>{
 const rows=group('15m',150,{
  outcomeOf:i=>i>=100?
   (i%2===0?'STOP':'TP3'):(i%2===0?'TP3':'STOP')
 });
 const f=audit(rows).frames['15m'];
 assert.equal(f.state,'DESCRIPTIVE');
 const eff=f.features.find(x=>x.key==='efficiency');
 assert.equal(eff.state,'RECENT_DETERIORATION');
 assert.deepEqual(eff.deltaAuc,[.5,.5,-.5]);
});
test('no last-window observation becomes early evidence if Room recorded it later',()=>{
 const rows=group('15m'),cutAt=rows[50].publishedAt;
 rows[3].evaluation.evaluatedAt=cutAt+1000;
 const f=audit(rows).frames['15m'];
 assert.equal(f.state,'DESCRIPTIVE');
 assert.equal(f.windows[0].lateRecorded,1);
 assert.equal(f.windows[0].decisive,49);
 assert.equal(f.windows[2].decisive,50);
});
test('H1 M5 and H4 remain separately evaluated without mixed observations',()=>{
 const report=audit([...group('15m'),...group('1h'),...group('4h')]);
 for(const frame of ['15m','1h','4h']){
  const f=report.frames[frame];
  assert.equal(f.state,'DESCRIPTIVE');
  assert.equal(f.scored,150);
  assert.deepEqual(f.windows.map(x=>x.decisive),[50,50,50]);
 }
});
test('missing volume is not silently converted into performance evidence',()=>{
 const rows=group('15m',150,{volumeOf:i=>i%2===0});
 const f=audit(rows).frames['15m'];
 assert.equal(f.state,'LOW_COVERAGE');
 assert.equal(f.features.length,0);
 assert.equal(f.windows[2].volumeCoverage,.5);
 assert.equal(f.windows[2].missingVolume,25);
});
test('old records and insufficient history remain COLLECTING',()=>{
 const original=group('15m',150);
 const shortened=group('15m',110);
 const start=audit(shortened).frames['15m'];
 assert.equal(start.state,'COLLECTING');
 assert.equal(start.scored,110);
 assert.equal(start.windows,null);
 for(let i=0;i<35;i++)
  delete original[i].hypothesis.preOutcomeStrength;
 const still=audit(original).frames['15m'];
 assert.equal(still.oldWithoutScore,35);
 assert.equal(still.scored,115);
 assert.equal(still.state,'COLLECTING');
});
test('horizon and ambiguous cases cannot be reclassified as successful TP3',()=>{
 const rows=group('15m');
 rows[5]=scenario('15m',5,{outcome:'HORIZON',efficiency:.1});
 const f=audit(rows).frames['15m'];
 assert.equal(f.windows[0].other,1);
 assert.equal(f.windows[0].decisive,49);
 assert.equal(f.state,'DESCRIPTIVE');
 assert.equal(f.features[0].descriptiveOnly,true);
});
test('invalid score, archive, duplicate ID and cross-asset data block evaluation',()=>{
 const rows=group('15m');
 assert.equal(auditRollingFeatureEvidence(rows,{
  asset,complete:false,publishedCount:150,now}).state,'INCOMPLETE');
 assert.equal(audit([...rows.slice(0,-1),rows[0]]).state,'INVALID');
 assert.equal(audit([...rows.slice(0,-1),{
  ...rows.at(-1),asset:'ETHUSDT'}]).state,'INVALID');
 const tampered=structuredClone(rows);
 tampered[8].hypothesis.preOutcomeStrength.score=99;
 assert.equal(audit(tampered).frames['15m'].state,'INVALID_EVIDENCE');
});
test('manual UI and APK include the same frozen triple-window logic',()=>{
 const ui=readFileSync(new URL('./forecast-probability-dashboard.mjs',
  import.meta.url),'utf8');
 const web=readFileSync(new URL('../apex9-android/scripts/prepare-web.mjs',
  import.meta.url),'utf8');
 assert.ok(ui.includes('auditRollingFeatureEvidence(archive?.forecasts'));
 assert.ok(ui.includes('Устойчивость признаков · три последовательных периода'));
 assert.ok(ui.includes('ΔAUC:'));
 assert.ok(web.includes("'forecast-feature-rolling.mjs'"));
});


const futureEpoch=Date.UTC(2026,10,12,0,0,0);
const shadow=rows=>auditShadowChallengers(rows,{
 asset,complete:true,publishedCount:rows.length,now});
const challengers=tf=>group(tf,150,{
 baseEpoch:futureEpoch,
 efficiencyOf:i=>i%2===0?.6:.4,
 volumeNormOf:i=>i%2===0?0:1
});
test('shadow recipes are frozen, preregistered and never probabilities',()=>{
 assert.equal(SHADOW_CHALLENGER_VERSION,'APEX_SHADOW_CHALLENGERS_V1');
 assert.equal(SHADOW_CHALLENGER_REGISTRATION,Date.UTC(2026,10,11));
 assert.deepEqual(SHADOW_CHALLENGER_RECIPES.map(x=>x.id),[
  'CURRENT_V1','STRUCTURE_V1','IMPULSE_V1','VOLUME_V1']);
 assert.equal(SHADOW_CHALLENGER_RECIPES[0].weights.efficiency,.5);
 assert.equal(Object.isFrozen(SHADOW_CHALLENGER_RECIPES[0].weights),true);
 assert.ok(Math.abs(challengerScore({efficiency:.6,travelNorm:.5,
  volumeNorm:0},SHADOW_CHALLENGER_RECIPES[0])-.45)<1e-12);
 assert.equal(challengerScore({efficiency:NaN,travelNorm:.5,
  volumeNorm:1},SHADOW_CHALLENGER_RECIPES[0]),null);
});
test('old pre-registration forecasts cannot be used even when their outcomes are known',()=>{
 const old=group('15m',150);
 const report=shadow(old);
 const x=report.frames['15m'];
 assert.equal(x.historicalExcluded,150);
 assert.equal(x.futurePublished,0);
 assert.equal(x.newScored,0);
 assert.equal(x.state,'COLLECTING');
 assert.equal(x.models.length,0);
 assert.equal(report.autoPromoted,false);
});
test('future-only STRUCTURE challenger beats same baseline in three windows',()=>{
 const rows=challengers('15m'),report=shadow(rows);
 const frame=report.frames['15m'];
 assert.equal(report.state,'DESCRIPTIVE');
 assert.equal(frame.state,'DESCRIPTIVE');
 assert.equal(frame.futurePublished,150);
 assert.equal(frame.newScored,150);
 assert.deepEqual(frame.windows.map(w=>w.decisive),[40,40,40]);
 assert.deepEqual(frame.windows.map(w=>w.tp3),[20,20,20]);
 assert.equal(frame.models.length,3);
 const structure=frame.models.find(x=>x.id==='STRUCTURE_V1');
 assert.equal(structure.state,'OBSERVED_THREE_TIMES');
 assert.deepEqual(structure.baselineAuc,[0,0,0]);
 assert.deepEqual(structure.challengerAuc,[1,1,1]);
 assert.deepEqual(structure.deltaAuc,[1,1,1]);
 assert.ok(frame.models.every(m=>m.promoted===false));
 assert.equal(frame.modelChanged,false);
 assert.equal(report.calibratedProbability,null);
});
test('late change reverses comparison: no model is promoted',()=>{
 const rows=group('15m',150,{
  baseEpoch:futureEpoch,
  efficiencyOf:i=>i%2===0?.6:.4,
  volumeNormOf:i=>i%2===0?0:1,
  // Last 120 scored rows are 30..149: three windows 30..69,
  // 70..109 and 110..149. Flip only the final window.
  outcomeOf:i=>i>=110?
   (i%2===0?'STOP':'TP3'):(i%2===0?'TP3':'STOP')
 });
 const report=shadow(rows),struct=report.frames['15m'].models.find(x=>
  x.id==='STRUCTURE_V1');
 assert.equal(struct.state,'RECENTLY_WORSE');
 assert.deepEqual(struct.deltaAuc,[1,1,-1]);
 assert.equal(report.autoPromoted,false);
});
test('post-registration M15 H1 and H4 use separate fixed observations',()=>{
 const rows=[
  ...challengers('15m'),...challengers('1h'),...challengers('4h')
 ];
 const report=shadow(rows);
 for(const tf of ['15m','1h','4h']){
  const f=report.frames[tf];
  assert.equal(f.state,'DESCRIPTIVE');
  assert.deepEqual(f.windows.map(w=>w.decisive),[40,40,40]);
  assert.equal(f.models.find(x=>x.id==='STRUCTURE_V1').state,
   'OBSERVED_THREE_TIMES');
 }
});
test('future outcome timestamps are embargoed and cannot influence earlier window',()=>{
 const rows=challengers('15m');
 const nextWindowStart=rows[70].publishedAt; // first of the last 120/3 windows
 rows[31].evaluation.evaluatedAt=nextWindowStart+1000;
 const f=shadow(rows).frames['15m'];
 assert.equal(f.state,'DESCRIPTIVE');
 assert.equal(f.windows[0].lateRecorded,1);
 assert.equal(f.windows[0].decisive,39);
});
test('unknown volume never produces a claimed challenger winner',()=>{
 const rows=group('15m',150,{
  baseEpoch:futureEpoch,volumeOf:i=>i%2===0
 });
 const f=shadow(rows).frames['15m'];
 assert.equal(f.state,'LOW_COVERAGE');
 assert.equal(f.models.length,0);
 assert.equal(f.windows[2].volumeCoverage,.5);
});
test('too many missing pre-publication scores cannot produce a winning candidate',()=>{
 const rows=group('15m',210,{baseEpoch:futureEpoch});
 for(let i=0;i<rows.length;i+=3)
  delete rows[i].hypothesis.preOutcomeStrength;
 const a=shadow(rows).frames['15m'];
 assert.equal(a.newScored,140);
 assert.equal(a.futurePublished,210);
 assert.equal(a.state,'LOW_SCORE_COVERAGE');
 assert.ok(a.scoreCoverage<.8);
 assert.equal(a.models.length,0);
});
test('incomplete archive, duplicate IDs and forged scores block shadow comparison',()=>{
 const rows=challengers('15m');
 assert.equal(auditShadowChallengers(rows,{
  asset,complete:false,publishedCount:150,now}).state,'INCOMPLETE');
 assert.equal(shadow([...rows.slice(0,-1),rows[0]]).state,'INVALID');
 const forged=structuredClone(rows);
 forged[50].hypothesis.preOutcomeStrength.score=99;
 assert.equal(shadow(forged).frames['15m'].state,'INVALID_EVIDENCE');
});
test('new challenger module is present in manual research and APK packaging',()=>{
 const panel=readFileSync(new URL('./forecast-probability-dashboard.mjs',
  import.meta.url),'utf8');
 const builder=readFileSync(new URL('../apex9-android/scripts/prepare-web.mjs',
  import.meta.url),'utf8');
 assert.ok(panel.includes('auditShadowChallengers(archive?.forecasts'));
 assert.ok(panel.includes('Shadow Challenger · три экспериментальные формулы'));
 assert.ok(panel.includes('Регистрация 11.11.2026, 00:00 UTC'));
 assert.ok(builder.includes("'forecast-shadow-challengers.mjs'"));
});


const asPublishedRadar=(row,mode)=>{
 const tf=row.interval,step=tfStep(tf);
 const candleAt=row.hypothesis.anchorCloseAt;
 const radar=Object.fromEntries(['15m','1h','4h','1d'].map(x=>
  [x,{state:'MISSING'}]));
 radar[tf]={state:'OBSERVED',source:'ANDROID_NATIVE_RADAR',
  candleAt,observedAt:candleAt+1000,direction:'UP',
  mode,movement:.4,acceleration:.02,volumeRatio:1};
 const feeds=Object.fromEntries([
  'market','liquidity','onchain','news','macro','social'
 ].map(x=>[x,{state:'MISSING'}]));
 row.hypothesis.evidenceAsPublished={
  version:'AS_OF_ROOM_EVIDENCE_V1',
  capturedAt:row.publishedAt,
  policy:'DESCRIPTIVE_CONTEXT_ONLY_NO_FUTURE_LEAKAGE',
  feeds,radar
 };
 return row;
};
const regimeSet=(tf,n=150,modeOf=i=>
 ['DIRECTIONAL','RANGE','MIXED'][i%3],options={})=>{
 const rows=group(tf,n,{
  baseEpoch:futureEpoch,
  efficiencyOf:i=>i%2===0?.6:.4,
  volumeNormOf:i=>i%2===0?0:1,
  ...options
 });
 return rows.map((row,i)=>asPublishedRadar(row,modeOf(i)));
};
const regimeAudit=rows=>auditShadowRegimes(rows,{
 asset,complete:true,publishedCount:rows.length,now
});

test('all three regimes compare exactly the same forward TP3/SL cohorts',()=>{
 const rows=regimeSet('15m'),r=regimeAudit(rows);
 assert.equal(r.version,SHADOW_REGIMES_VERSION);
 assert.equal(r.state,'DESCRIPTIVE');
 assert.equal(r.autoPromoted,false);
 assert.equal(r.modelChanged,false);
 assert.equal(r.calibratedProbability,null);
 const f=r.frames['15m'];
 assert.equal(f.state,'DESCRIPTIVE');
 assert.equal(f.newScored,150);
 assert.equal(f.comparedModes,3);
 assert.deepEqual(f.windows.map(x=>x.eligible),[40,40,40]);
 assert.deepEqual(f.windows.map(x=>x.radarObserved),[40,40,40]);
 assert.deepEqual(f.windows.map(x=>x.coverage),[1,1,1]);
 for(const mode of SHADOW_REGIMES_RULES.modes){
  const c=f.regimes[mode];
  assert.equal(c.state,'DESCRIPTIVE');
  assert.equal(c.models.length,3);
  assert.equal(c.windows.reduce((s,x)=>s+x.decisive,0),40);
  assert.equal(c.models.find(x=>x.id==='STRUCTURE_V1').state,
   'OBSERVED_THREE_TIMES');
  assert.deepEqual(c.models.find(x=>x.id==='STRUCTURE_V1').deltaAuc,
   [1,1,1]);
 }
});
test('only the matching timeframe pre-publication Radar can classify a regime',()=>{
 const row=regimeSet('15m',1)[0];
 assert.deepEqual({
  state:inspectPublishedRegime(row).state,
  mode:inspectPublishedRegime(row).mode
 },{state:'OBSERVED',mode:'DIRECTIONAL'});
 const tampered=structuredClone(row);
 tampered.hypothesis.evidenceAsPublished.radar['15m']={state:'MISSING'};
 tampered.hypothesis.evidenceAsPublished.radar['1h']={
  ...row.hypothesis.evidenceAsPublished.radar['15m'],mode:'RANGE',
  candleAt:Math.floor(row.publishedAt/H)*H-1,
  observedAt:Math.floor(row.publishedAt/H)*H+1000
 };
 // Wrong TF cannot masquerade as this prediction's native market mode.
 assert.equal(inspectPublishedRegime(tampered).state,'MISSING');
 const future=structuredClone(row);
 future.hypothesis.evidenceAsPublished.radar['15m'].observedAt=
  future.publishedAt+1000;
 assert.equal(inspectPublishedRegime(future).state,'INVALID');
});
test('missing mode snapshots do not silently select favorable outcomes',()=>{
 const rows=regimeSet('15m',150,i=>
  ['DIRECTIONAL','RANGE','MIXED'][i%3]);
 for(let i=0;i<rows.length;i+=2)
  rows[i].hypothesis.evidenceAsPublished.radar['15m']={state:'MISSING'};
 const f=regimeAudit(rows).frames['15m'];
 assert.equal(f.state,'LOW_COVERAGE');
 assert.equal(f.windows[2].coverage,.5);
 assert.equal(f.windows[2].missing,20);
 for(const mode of SHADOW_REGIMES_RULES.modes)
  assert.equal(f.regimes[mode].models.length,0);
});
test('stale Radar is never reclassified as a known regime',()=>{
 const rows=regimeSet('15m');
 const stale=rows[40].hypothesis.evidenceAsPublished.radar['15m'];
 stale.candleAt-=3*M;stale.observedAt=stale.candleAt+1000;
 stale.state='STALE';
 assert.equal(inspectPublishedRegime(rows[40]).state,'STALE');
 const f=regimeAudit(rows).frames['15m'];
 assert.equal(f.windows[0].stale,1);
 assert.equal(f.windows[0].coverage,39/40);
});
test('corrupt as-published Radar invalidates regime comparisons',()=>{
 const rows=regimeSet('15m');
 rows[40].hypothesis.evidenceAsPublished.radar['15m'].observedAt=
  rows[40].publishedAt+1;
 const f=regimeAudit(rows).frames['15m'];
 assert.equal(f.state,'INVALID_EVIDENCE');
 for(const mode of SHADOW_REGIMES_RULES.modes)
  assert.equal(f.regimes[mode].models.length,0);
});
test('late-reported result does not enter earlier regime analysis',()=>{
 const rows=regimeSet('15m');
 const cut=rows[70].publishedAt;
 rows[31].evaluation.evaluatedAt=cut+1000;
 const f=regimeAudit(rows).frames['15m'];
 assert.equal(f.state,'DESCRIPTIVE');
 assert.equal(f.regimes.RANGE.windows[0].decisive,12);
 assert.equal(f.regimes.RANGE.windows[0].tp3+
  f.regimes.RANGE.windows[0].stop,12);
});
test('regimes are independent per M15 H1 and H4 after registration',()=>{
 const rows=[...regimeSet('15m'),...regimeSet('1h'),
  ...regimeSet('4h')];
 const r=regimeAudit(rows);
 for(const tf of ['15m','1h','4h']){
  assert.equal(r.frames[tf].state,'DESCRIPTIVE');
  assert.equal(r.frames[tf].comparedModes,3);
  assert.equal(r.frames[tf].regimes.DIRECTIONAL.models.length,3);
 }
});
test('old forecasts, partial archives and too few outcomes never produce winners',()=>{
 const historical=group('15m',150);
 historical.forEach(row=>asPublishedRadar(row,'DIRECTIONAL'));
 const f=regimeAudit(historical).frames['15m'];
 assert.equal(f.state,'COLLECTING');
 assert.equal(f.newScored,0);
 const active=regimeSet('15m',80);
 assert.equal(regimeAudit(active).frames['15m'].state,'COLLECTING');
 assert.equal(auditShadowRegimes(active,{
  asset,complete:false,publishedCount:80,now}).state,'INCOMPLETE');
 const sparse=regimeSet('15m',150,()=> 'DIRECTIONAL');
 assert.equal(regimeAudit(sparse).frames['15m'].regimes.RANGE.state,
  'COLLECTING');
 assert.equal(regimeAudit(sparse).frames['15m'].regimes.RANGE.models.length,0);
});
test('regime module is part of the Android WebView and opt-in audited UI',()=>{
 const ui=readFileSync(new URL('./forecast-probability-dashboard.mjs',
  import.meta.url),'utf8');
 const build=readFileSync(new URL('../apex9-android/scripts/prepare-web.mjs',
  import.meta.url),'utf8');
 assert.ok(ui.includes('auditShadowRegimes(archive?.forecasts'));
 assert.ok(ui.includes('В каких режимах рынка формулы работают лучше или хуже?'));
 assert.ok(build.includes("'forecast-shadow-regimes.mjs'"));
});
