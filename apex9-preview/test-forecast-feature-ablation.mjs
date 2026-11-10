import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {computeReferenceLevels} from './research-level-sequence.mjs';
import {
 rankingAuc,frozenRankScore,auditFeatureContribution,
 FEATURE_ABLATION_RULES,FEATURE_ABLATION_VERSION
} from './forecast-feature-ablation.mjs';

const M=900000,H=3600000,H4=14400000,asset='BTCUSDT';
const now=1900000000000;
const rounded=n=>Number(n.toPrecision(13));
const sameBar=(step)=>Math.floor(1760000000000/step)*step-1;
const tfStep=tf=>tf==='15m'?M:tf==='4h'?H4:H;

function scenario(tf,i,{efficiency=i%2===0?.9:.1,
 travelNorm=.5,volumeNorm=.5,volumeAvailable=true,
 outcome=i%2===0?'TP3':'STOP',offset=0}={}){
 const step=tfStep(tf),anchor=sameBar(step)+(i*25+offset)*step;
 const publishedAt=anchor+2000,close=100,w=.04;
 const horizon=tf==='15m'?16:24;
 const targetCloseAt=anchor+horizon*step;
 const observationStep=tf==='1h'?300000:step;
 const event=(stage,n)=>({
  stage,observedAt:anchor+n*observationStep,
  recordedAt:anchor+n*observationStep+1000
 });
 const stages=[event('LIMIT_READY',2),event('CONFIRMED',3)];
 if(outcome==='TP3')
  stages.push(event('TP1',4),event('TP2',5),event('TP3',6));
 else if(outcome==='STOP')stages.push(event('SL',6));
 else if(outcome==='HORIZON')stages.push(event('TIMEOUT',horizon));
 if(outcome!=='AWAITING')
  stages.push(event('COMPLETED',outcome==='HORIZON'?horizon:6));
 const levels=computeReferenceLevels(close,
  rounded(close*Math.exp(-w)),rounded(close*Math.exp(w))).UP;
 const score=Math.round(1000*(.5*efficiency+.3*travelNorm+
  .2*volumeNorm))/10;
 const h1=tf==='1h';
 const hypothesis=h1?{
  model:'EMPIRICAL_DIRECTION_LEVELS_V2',
  decisionMethod:'SIX_BAR_EFFICIENCY_V1',direction:'UP',
  anchorCloseAt:anchor,targetCloseAt,horizonBars:24,
  anchorClose:close,bandLow:rounded(close*Math.exp(-w)),
  bandHigh:rounded(close*Math.exp(w)),
  levelStudy:{version:'H1_SINGLE_LEVELS_V2',direction:'UP',
   entry:close,...levels},
  evaluationInterval:'5m',observationMethod:'M5_CLOSED_LEVEL_ORDER_V1',
  stageSemantics:'LIMIT_READY_M5_V1',
  calibratedProbability:null
 }:{
  model:'EMPIRICAL_MULTIFRAME_DIRECTION_V1',
  interval:tf,evaluationInterval:tf,
  direction:'UP',decisionMethod:'SIX_BAR_EFFICIENCY_V1',
  stageSemantics:'SAME_FRAME_LIMIT_V1',
  anchorCloseAt:anchor,anchorClose:close,targetCloseAt,
  horizonBars:horizon,sampleBars:96,empiricalSamples:92,
  historicalPercentile:.8,empiricalWidth:w,
  levelStudy:{version:'MULTIFRAME_SINGLE_LEVELS_V1',direction:'UP',
   entry:close,...levels},
  contextAsPublished:{},calibratedProbability:null
 };
 hypothesis.preOutcomeStrength={
  version:'PREOUTCOME_SIGNAL_STRENGTH_V1',state:'OBSERVED',
  interval:tf,scope:'CLOSED_PRICE_VOLUME_ONLY_UNTRAINED',
  event:'TERMINAL_TP3_VS_STOP',candleCutoffAt:anchor,
  capturedAt:publishedAt,sampleBars:96,
  efficiency,travelNorm,volumeNorm,volumeAvailable,
  score,scoreType:'UNTRAINED_SIGNAL_STRENGTH_NOT_PROBABILITY',
  calibratedProbability:null
 };
 return {
  id:(h1?'direction2:':'direction3:')+asset+':'+tf+':'+anchor,
  asset,interval:tf,publishedAt,
  status:outcome==='AWAITING'?'ACTIVE':'COMPLETED',
  hypothesis,stageEvents:stages,
  ...(outcome==='AWAITING'?{}:{
   evaluation:{outcome,
    evaluatedAt:anchor+(outcome==='HORIZON'?horizon*step:
     6*observationStep)+2000,targetCloseAt,actualClose:101,
    actualChangePct:1}
  })
 };
}
const run=rows=>auditFeatureContribution(rows,{
 asset,complete:true,publishedCount:rows.length,now
});
const rows=tf=>Array.from({length:120},(_,i)=>scenario(tf,i));

test('AUC ranks TP3 above STOP, counts ties and rejects single-class cohorts',()=>{
 const p=(v)=>({outcome:'TP3',v}),n=v=>({outcome:'STOP',v});
 assert.equal(rankingAuc([p(.9),p(.8),n(.2),n(.1)],x=>x.v),1);
 assert.equal(rankingAuc([p(.1),p(.2),n(.8),n(.9)],x=>x.v),0);
 assert.equal(rankingAuc([p(.5),n(.5)],x=>x.v),.5);
 assert.equal(rankingAuc([p(.5),p(.3)],x=>x.v),null);
 assert.equal(rankingAuc([p(2),n(NaN)],x=>x.v),null);
 const f={efficiency:.9,travelNorm:.5,volumeNorm:.5};
 assert.ok(Math.abs(frozenRankScore(f)-.7)<1e-10);
 assert.ok(Math.abs(frozenRankScore(f,'efficiency')-.5)<1e-10);
});
test('only true incremental efficiency improves both chronological periods',()=>{
 const report=run(rows('15m')),f=report.frames['15m'];
 assert.equal(report.version,FEATURE_ABLATION_VERSION);
 assert.equal(report.state,'DESCRIPTIVE');
 assert.equal(report.calibratedProbability,null);
 assert.equal(report.trained,false);
 assert.equal(f.state,'DESCRIPTIVE');
 assert.equal(f.newScores,120);
 assert.equal(f.reference.decisive,72);
 assert.equal(f.recent.decisive,48);
 assert.equal(f.reference.tp3,36);
 assert.equal(f.recent.stop,24);
 assert.equal(f.reference.overlap,0);
 assert.equal(f.recent.overlap,0);
 assert.equal(f.referenceFullAuc,1);
 assert.equal(f.lateFullAuc,1);
 const by=Object.fromEntries(f.features.map(x=>[x.key,x]));
 assert.equal(by.efficiency.state,'REPEATED_ADDED_VALUE');
 assert.equal(by.efficiency.deltaAuc.reference,.5);
 assert.equal(by.efficiency.deltaAuc.late,.5);
 assert.equal(by.efficiency.withoutAuc.late,.5);
 assert.equal(by.efficiency.isolatedAuc.late,1);
 assert.equal(by.travelNorm.state,'NO_ADDED_VALUE');
 assert.equal(by.volumeNorm.state,'NO_ADDED_VALUE');
 assert.equal(by.travelNorm.deltaAuc.late,0);
 assert.equal(by.volumeNorm.deltaAuc.late,0);
 assert.equal(f.calibratedProbability,null);
 assert.equal(f.modelChanged,false);
});
test('each timeframe has its own cohorts and H1 uses verified M5',()=>{
 const r=run([...rows('15m'),...rows('1h'),...rows('4h')]);
 for(const tf of ['15m','1h','4h']){
  assert.equal(r.frames[tf].state,'DESCRIPTIVE');
  assert.equal(r.frames[tf].newScores,120);
  assert.equal(r.frames[tf].recent.decisive,48);
  assert.equal(r.frames[tf].features[0].key,'efficiency');
 }
});
test('later reversal is flagged rather than training on favorable reference',()=>{
 const list=Array.from({length:120},(_,i)=>scenario('15m',i,{
  outcome:i<72?(i%2===0?'TP3':'STOP'):
   (i%2===0?'STOP':'TP3')
 }));
 const report=run(list).frames['15m'],eff=report.features[0];
 assert.equal(report.state,'DESCRIPTIVE');
 assert.equal(eff.state,'POSSIBLE_HARM');
 assert.equal(eff.deltaAuc.reference,.5);
 assert.equal(eff.deltaAuc.late,-.5);
});
test('without reliable volume no feature is prematurely promoted',()=>{
 const list=Array.from({length:120},(_,i)=>scenario('15m',i,{
  volumeAvailable:i%2===0,
  volumeNorm:i%2===0?.5:.5
 }));
 const f=run(list).frames['15m'];
 assert.equal(f.state,'LOW_COVERAGE');
 assert.equal(f.features.length,0);
 assert.equal(f.recent.volumeCoverage,.5);
 assert.ok(f.recent.missingVolume>0);
});
test('unknown and delayed outcomes do not count as TP3 improvements',()=>{
 const list=rows('15m');
 list[4].evaluation.outcome='HORIZON';
 list[4].stageEvents=[
  ...list[4].stageEvents.filter(x=>x.stage!=='TP3'&&
   x.stage!=='COMPLETED'),
  {stage:'TIMEOUT',observedAt:
   list[4].hypothesis.targetCloseAt,
   recordedAt:list[4].hypothesis.targetCloseAt+1000},
  {stage:'COMPLETED',observedAt:
   list[4].hypothesis.targetCloseAt,
   recordedAt:list[4].hypothesis.targetCloseAt+1000}
 ];
 list[4].evaluation.evaluatedAt=
  list[4].hypothesis.targetCloseAt+2000;
 const f=run(list).frames['15m'];
 // An entered scenario that expires after TP1/TP2 is a valid OTHER outcome,
 // not a TP3 win or a corrupt Room record.
 assert.equal(f.state,'DESCRIPTIVE');
 assert.equal(f.reference.other,1);
 assert.equal(f.reference.decisive,71);
 const old=rows('15m');
 old[0].evaluation.evaluatedAt=old[72].publishedAt+1000;
 const g=run(old).frames['15m'];
 assert.equal(g.reference.lateRecorded,1);
 assert.equal(g.reference.decisive,71);
});
test('all missing or invalid scores block conclusions without backfill',()=>{
 const all=rows('15m');
 for(let i=0;i<15;i++)
  delete all[i].hypothesis.preOutcomeStrength;
 const g=run(all).frames['15m'];
 assert.equal(g.oldWithoutScores,15);
 assert.equal(g.newScores,105);
 assert.equal(g.reference.decisive+g.recent.decisive,105);
 const changed=structuredClone(rows('15m'));
 changed[4].hypothesis.preOutcomeStrength.score=99;
 const bad=run(changed).frames['15m'];
 assert.equal(bad.state,'INVALID_EVIDENCE');
 assert.equal(bad.features.length,0);
});
test('rejects partial, duplicated and mixed asset archives',()=>{
 const list=rows('15m');
 assert.equal(auditFeatureContribution(list,{
  asset,complete:false,publishedCount:list.length,now}).state,
  'INCOMPLETE');
 assert.equal(run([...list.slice(0,-1),list[0]]).state,'INVALID');
 assert.equal(run([...list.slice(0,-1),
  {...list.at(-1),asset:'ETHUSDT'}]).state,'INVALID');
 assert.equal(FEATURE_ABLATION_RULES.automaticTraining,false);
});
test('UI and Capacitor staging include read-only feature ablation',()=>{
 const ui=readFileSync(new URL('./forecast-probability-dashboard.mjs',
  import.meta.url),'utf8');
 const build=readFileSync(new URL('../apex9-android/scripts/prepare-web.mjs',
  import.meta.url),'utf8');
 assert.ok(ui.includes('auditFeatureContribution(archive?.forecasts'));
 assert.ok(ui.includes('Какие признаки действительно помогают?'));
 assert.ok(ui.includes('ΔAUC'));
 assert.ok(build.includes("'forecast-feature-ablation.mjs'"));
});


test('precommitted feature pairs use no fitted weights or hidden missing inputs',async()=>{
 const {frozenPairScore,spearmanPair,FEATURE_PAIRS}
  =await import('./forecast-feature-pairs.mjs');
 assert.equal(FEATURE_PAIRS.length,3);
 assert.ok(Math.abs(frozenPairScore({
  efficiency:1,travelNorm:0,volumeNorm:.5},'efficiency','travelNorm')-
  .625)<1e-9);
 assert.equal(frozenPairScore({efficiency:0.8},'efficiency','travelNorm'),null);
 const samples=[{features:{efficiency:.1,travelNorm:.1}},
  {features:{efficiency:.3,travelNorm:.3}},
  {features:{efficiency:.6,travelNorm:.6}},
  {features:{efficiency:.9,travelNorm:.9}}];
 assert.equal(spearmanPair(samples,'efficiency','travelNorm'),1);
 assert.equal(spearmanPair(samples.map(s=>({features:{
  ...s.features,travelNorm:1-s.features.travelNorm}})),
 'efficiency','travelNorm'),-1);
 assert.equal(spearmanPair(samples.map(s=>({features:{
  ...s.features,travelNorm:.5}})),
 'efficiency','travelNorm'),null);
});
test('pair research needs verified future nonoverlapping terminal windows',async()=>{
 const {auditFeaturePairs,FEATURE_PAIRS_VERSION}
  =await import('./forecast-feature-pairs.mjs');
 const {auditShadowChallengers,SHADOW_CHALLENGER_REGISTRATION}
  =await import('./forecast-shadow-challengers.mjs');
 const make=tf=>Array.from({length:120},(_,i)=>scenario(tf,i,{
  offset:tf==='15m'?42000:tf==='1h'?12000:3200,
  efficiency:i%2===0?.95:.05,
  travelNorm:(i%2===0?.93:.07),
  volumeNorm:(i%2===0?.92:.08)
 }));
 const all=[...make('15m'),...make('1h'),...make('4h')];
 assert.ok(all.every(row=>row.publishedAt>SHADOW_CHALLENGER_REGISTRATION));
 const challenger=auditShadowChallengers(all,{
  asset,complete:true,publishedCount:all.length,now});
 const paired=auditFeaturePairs(all,{asset,complete:true,
  publishedCount:all.length,now,challenge:challenger});
 assert.equal(paired.version,FEATURE_PAIRS_VERSION);
 assert.equal(paired.trained,false);
 assert.equal(paired.calibratedProbability,null);
 for(const tf of ['15m','1h','4h']){
  assert.equal(challenger.frames[tf].state,'DESCRIPTIVE');
  assert.equal(paired.frames[tf].state,'DESCRIPTIVE');
  assert.equal(paired.frames[tf].pairs.length,3);
  const one=paired.frames[tf].pairs[0];
  assert.equal(one.state,'OVERLAPPING');
  assert.equal(one.periods.length,3);
  assert.equal(one.periods[2].correlation,1);
  assert.equal(one.periods[2].gain,0);
 }
 assert.equal(auditFeaturePairs(all,{asset,complete:false,
  publishedCount:all.length,now,challenge:challenger}).state,'INCOMPLETE');
 assert.equal(auditFeaturePairs(all,{asset,complete:true,
  publishedCount:all.length,now,challenge:{...challenger,asset:'ETHUSDT'}})
  .state,'INVALID');
 const stale=all.map(x=>structuredClone(x));
 stale[0].hypothesis.preOutcomeStrength.score=99;
 const mismatch=auditFeaturePairs(stale,{asset,complete:true,
  publishedCount:stale.length,now,challenge:challenger});
 assert.notEqual(mismatch.frames['15m'].state,'DESCRIPTIVE');
});
test('feature pairs appear only in explicit manual full-archive audit',()=>{
 const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
 const dashboard=read('./forecast-probability-dashboard.mjs');
 assert.ok(dashboard.includes('auditFeaturePairs(archive?.forecasts'));
 assert.ok(dashboard.includes('Сочетания признаков'));
 assert.ok(dashboard.includes('onAudits({challenge,regimes,diagnostics:diagnosis,pairs})'));
 const prepared=read('../apex9-android/scripts/prepare-web.mjs');
 assert.ok(prepared.includes("'forecast-feature-pairs.mjs'"));
});


test('two regimes need actual independent prepublished evidence, not hindsight',async()=>{
 const {auditFeaturePairRegimes,summarizeFeatureStageTwo,
  assessRegimePairReplication}=await import('./forecast-feature-regime-review.mjs');
 const {auditShadowRegimes}=await import('./forecast-shadow-regimes.mjs');
 const {auditShadowChallengers,SHADOW_CHALLENGER_REGISTRATION}
  =await import('./forecast-shadow-challengers.mjs');
 const {auditFeaturePairs}=await import('./forecast-feature-pairs.mjs');
 const {EVIDENCE_VERSION,EVIDENCE_FEEDS,EVIDENCE_FRAMES}
  =await import('./forecast-evidence-context.mjs');
 const tf='15m';
 const all=Array.from({length:120},(_,i)=>scenario(tf,i,{
  offset:42000,efficiency:i%2===0?.92:.08,
  travelNorm:i%2===0?.87:.13,
  volumeNorm:i%2===0?.85:.15
 }));
 const frame=900000;
 const modes=['DIRECTIONAL','RANGE','MIXED'];
 for(let i=0;i<all.length;i++){
  const row=all[i],h=row.hypothesis,
   mode=modes[i%3];
  h.evidenceAsPublished={
   version:EVIDENCE_VERSION,capturedAt:row.publishedAt,
   policy:'DESCRIPTIVE_CONTEXT_ONLY_NO_FUTURE_LEAKAGE',
   feeds:Object.fromEntries(EVIDENCE_FEEDS.map(k=>[k,{state:'MISSING'}])),
   radar:Object.fromEntries(EVIDENCE_FRAMES.map(k=>[k,{state:'MISSING'}]))
  };
  h.evidenceAsPublished.radar[tf]={
   state:'OBSERVED',source:'ANDROID_NATIVE_RADAR',
   candleAt:h.anchorCloseAt,observedAt:h.anchorCloseAt+500,
   direction:'UP',mode,movement:.3,acceleration:.05,
   volumeRatio:1
  };
 }
 assert.ok(all.every(x=>x.publishedAt>SHADOW_CHALLENGER_REGISTRATION));
 const options={asset,complete:true,publishedCount:all.length,now};
 const challenge=auditShadowChallengers(all,options);
 const pair=auditFeaturePairs(all,{...options,challenge});
 const regime=auditShadowRegimes(all,options);
 const result=auditFeaturePairRegimes(all,{
  ...options,challenge,pairs:pair,regimes:regime});
 assert.equal(regime.frames[tf].state,'DESCRIPTIVE');
 assert.equal(result.frames[tf].state,'DESCRIPTIVE');
 assert.equal(result.frames[tf].availableModes,3);
 assert.equal(result.frames[tf].pairs.length,3);
 assert.equal(result.frames[tf].pairs[0].state,'NO_REPEATED_GAIN');
 assert.equal(result.frames[tf].modeResults.DIRECTIONAL.state,'DESCRIPTIVE');
 const stage=summarizeFeatureStageTwo(asset,pair,result);
 assert.equal(stage.checkedFrames,1);
 assert.equal(stage.frames['1h'].state,'COLLECTING');
 assert.equal(stage.frames['15m'].state,'CHECKED');
 assert.equal(stage.trained,false);
 // A future-dated radar capture is *invalid*, not copied from later periods.
 const edited=structuredClone(all);
 edited[0].hypothesis.evidenceAsPublished.radar[tf].observedAt=
  edited[0].publishedAt+1000;
 const unsafeRegime=auditShadowRegimes(edited,options);
 const unsafe=auditFeaturePairRegimes(edited,{
  ...options,challenge,pairs:pair,regimes:unsafeRegime});
 assert.notEqual(unsafe.frames[tf].state,'DESCRIPTIVE');
 // Repeated combined improvement alone is not cross-regime proof.
 const fake=assessRegimePairReplication([
  {id:'EFFICIENCY_TRAVEL',state:'REPEATED_ADDITION'},
  {id:'EFFICIENCY_VOLUME',state:'REPEATED_ADDITION'},
  {id:'TRAVEL_VOLUME',state:'REPEATED_ADDITION'}
 ],[{mode:'DIRECTIONAL',pairs:[]},{mode:'RANGE',pairs:[]}]);
 assert.equal(fake[0].state,'NEED_TWO_MODES');
});
test('stage 2 complete UI shows quality gates and regime-aware pair report',()=>{
 const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
 const ui=read('./forecast-probability-dashboard.mjs');
 const overview=read('./overview-decision-quality.mjs');
 const web=read('../apex9-android/scripts/prepare-web.mjs');
 assert.ok(ui.includes('auditFeaturePairRegimes(archive?.forecasts'));
 assert.ok(ui.includes('summarizeFeatureStageTwo(asset,pairs,pairRegimes)'));
 assert.ok(ui.includes('Этап 2 из 5'));
 assert.ok(overview.includes('pairRegimes:audits?.pairRegimes'));
 assert.ok(web.includes("'forecast-feature-regime-review.mjs'"));
});
