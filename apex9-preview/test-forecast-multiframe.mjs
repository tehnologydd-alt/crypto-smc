import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {computeReferenceLevels} from './research-level-sequence.mjs';
import {MULTIFRAME_MODEL,multiFrameHypothesis,planMultiFrameForecast,
 multiFrameEvidence,multiFrameQuality,multiFrameAgreement} from './forecast-multiframe.mjs';

const M=900000,H4=14400000;
const anchor=Math.floor(1760000000000/H4)*H4-1;
const price=100,width=.04;
const rounded=n=>Number(n.toPrecision(13));
function scenario(frame='15m',side='UP'){
 const step=frame==='15m'?M:H4,bars=frame==='15m'?16:24;
 const range=computeReferenceLevels(price,
  rounded(price*Math.exp(-width)),rounded(price*Math.exp(width)));
 const levels={
  version:'MULTIFRAME_SINGLE_LEVELS_V1',direction:side,
  entry:price,...range[side]
 };
 const h={
  model:MULTIFRAME_MODEL,interval:frame,evaluationInterval:frame,
  direction:side,decisionMethod:'SIX_BAR_EFFICIENCY_V1',
  stageSemantics:'SAME_FRAME_LIMIT_V1',
  anchorCloseAt:anchor,anchorClose:price,
  targetCloseAt:anchor+step*bars,horizonBars:bars,
  sampleBars:96,empiricalSamples:92,empiricalWidth:width,
  historicalPercentile:.8,levelStudy:levels,contextAsPublished:{}
 };
 const asset='BTCUSDT';
 return {id:'direction3:'+asset+':'+frame+':'+anchor,
  asset,interval:frame,publishedAt:anchor+2000,status:'PENDING_CONFIRMATION',
  hypothesis:h,stageEvents:[]};
}
function fullEnd(row,ending='TP3'){
 const step=row.interval==='15m'?M:H4;
 const make=(stage,n)=>({stage,observedAt:anchor+n*step,
  recordedAt:anchor+n*step+1000});
 const states=[make('LIMIT_READY',2),make('CONFIRMED',3)];
 if(ending==='TP3')states.push(make('TP1',4),make('TP2',5),make('TP3',6));
 if(ending==='STOP')states.push(make('SL',6));
 states.push(make('COMPLETED',6));
 const close=anchor+6*step;
 return {...row,status:'COMPLETED',stageEvents:states,
  evaluation:{outcome:ending,
   evaluatedAt:close+2000,targetCloseAt:row.hypothesis.targetCloseAt,
   actualClose:price+1,actualChangePct:1}};
}
test('multi-frame M15 and H4 forecasts are independent and validated',()=>{
 for(const frame of ['15m','4h']){
  const row=scenario(frame);
  assert.equal(multiFrameHypothesis(row).model,MULTIFRAME_MODEL);
  assert.equal(planMultiFrameForecast(row,{now:anchor+H4*30}).state,'READY');
  assert.equal(multiFrameEvidence(row,{now:anchor+H4*30}).state,'OBSERVED');
  assert.equal(row.hypothesis.targetCloseAt-anchor,
   frame==='15m'?4*3600000:4*86400000);
 }
});
test('no fabricated confluence or accuracy from missing H1',()=>{
 const up=scenario('15m','UP'),h4=scenario('4h','UP');
 const now=anchor+M*3;
 const s=multiFrameAgreement([up,h4],'BTCUSDT',{now});
 assert.equal(s.active,2);assert.equal(s.aligned,true);
 assert.equal(s.side,'UP');assert.equal(s.signals[1].side,null);
 const conflict=multiFrameAgreement([up,scenario('4h','DOWN')],'BTCUSDT',{now});
 assert.equal(conflict.conflict,true);
 assert.equal(conflict.aligned,false);
 const expired=multiFrameAgreement([up,h4],'BTCUSDT',{now:anchor+H4*25});
 assert.equal(expired.active,0);
});
test('tampered levels, future radar observations and timeframes fail closed',()=>{
 const row=scenario();
 const tampered=scenario();tampered.hypothesis.levelStudy.tp1+=1;
 assert.equal(planMultiFrameForecast(tampered,{now:anchor+H4*30}).state,'INVALID');
 const future=scenario();
 future.hypothesis.contextAsPublished={'1d':{
  candleAt:future.publishedAt+10,observedAt:future.publishedAt+11}};
 assert.equal(planMultiFrameForecast(future,{now:anchor+H4*30}).state,'INVALID');
 const mix=scenario();
 mix.interval='4h';
 assert.equal(planMultiFrameForecast(mix,{now:anchor+H4*30}).state,'INVALID');
 assert.equal(planMultiFrameForecast(row,{now:anchor-100000}).state,'INVALID');
});
test('verified outcome keeps target touches separate from terminal STOP',()=>{
 const now=anchor+H4*30;
 const tp3=fullEnd(scenario(),'TP3');
 const stopped=fullEnd(scenario('4h','DOWN'),'STOP');
 assert.equal(multiFrameEvidence(tp3,{now}).state,'OBSERVED');
 assert.equal(multiFrameEvidence(stopped,{now}).state,'OBSERVED');
 const q=multiFrameQuality([tp3,stopped],{now});
 assert.equal(q['15m'].tp3,1);assert.equal(q['4h'].stop,1);
 assert.equal(q['4h'].tp3,0);
 const bad=fullEnd(scenario(),'TP3');
 bad.stageEvents.find(x=>x.stage==='TP3').observedAt=anchor+2*M;
 assert.equal(multiFrameEvidence(bad,{now}).state,'INVALID');
});
test('native source connects Radar closed candles and Room without new schema',()=>{
 const base='../apex9-android/native/src/main/java/com/apexintelligence/research/';
 const read=p=>readFileSync(new URL(base+p,import.meta.url),'utf8');
 const dao=read('ApexDatabase.kt'),radar=read('ApexRadarMonitor.kt');
 const worker=read('ApexSyncWorker.kt'),native=read('ApexNativePlugin.kt');
 const engine=read('ApexMultiFrameForecast.kt');
 assert.ok(dao.includes('latestMultiFrameForecast(asset: String, interval: String)'));
 assert.ok(dao.includes("id LIKE 'direction3:%'"));
 assert.ok(radar.includes('dao.insertHistoricalCandlesOnce(rows)'));
 assert.ok(radar.includes('private const val LIMIT = 120'));
 assert.ok(worker.includes('ApexMultiFrameForecast.syncAll('));
 assert.ok(native.includes('ApexMultiFrameForecast.syncAll('));
 assert.ok(native.includes('"SAME_FRAME_LIMIT_V1"'));
 assert.ok(engine.includes('for(spec in specs)'));
 assert.ok(engine.includes('Spec("15m",900_000L,16)'));
 assert.ok(engine.includes('Spec("4h",14_400_000L,24)'));
 assert.ok(engine.includes('contextAtPublication('));
 assert.ok(engine.includes('if(candle.openTime<row.publishedAt)continue'));
 assert.ok(engine.includes('dao.recordResearchResult('));
 const ui=readFileSync(new URL('./favorite-dashboard.mjs',import.meta.url),'utf8');
 const html=readFileSync(new URL('./index.html',import.meta.url),'utf8');
 assert.ok(ui.includes('multiFrameForecastCard(row'));
 assert.ok(ui.includes('multiFrameAgreement(scoped,asset)'));
 assert.ok(html.includes('id="forecast-confluence-summary"'));
});


test('M15/H4 newly published studies use M5 while preserving old studies',()=>{
 for(const frame of ['15m','4h']){
  const original=scenario(frame);
  const fine=scenario(frame);
  fine.hypothesis.evaluationInterval='5m';
  fine.hypothesis.stageSemantics='M5_CLOSED_LIMIT_V2';
  fine.hypothesis.observationMethod='M5_CLOSED_LEVEL_ORDER_V1';
  const now=anchor+H4*30;
  assert.equal(planMultiFrameForecast(original,{now}).state,'READY');
  const plan=planMultiFrameForecast(fine,{now});
  assert.equal(plan.state,'READY');
  assert.equal(plan.plan.evaluationInterval,'5m');
  assert.equal(multiFrameEvidence(fine,{now}).state,'OBSERVED');
  const M5=300000;
  fine.stageEvents=[
   {stage:'LIMIT_READY',observedAt:anchor+2*M5,
    recordedAt:anchor+2*M5+1000},
   {stage:'CONFIRMED',observedAt:anchor+3*M5,
    recordedAt:anchor+3*M5+1000},
   {stage:'TP1',observedAt:anchor+4*M5,
    recordedAt:anchor+4*M5+1000}
  ];
  const evaluated=multiFrameEvidence(fine,{now});
  assert.equal(evaluated.state,'OBSERVED');
  assert.deepEqual(evaluated.touched,['TP1']);
  const wrong=structuredClone(fine);
  wrong.stageEvents[2].observedAt=anchor+4*M5+1;
  assert.equal(multiFrameEvidence(wrong,{now}).state,'INVALID');
  const missing=structuredClone(fine);
  delete missing.hypothesis.observationMethod;
  assert.equal(planMultiFrameForecast(missing,{now}).state,'INVALID');
 }
});
test('native M15/H4 publish M1 method while archived M5 cohorts are preserved',()=>{
 const base='../apex9-android/native/src/main/java/com/apexintelligence/research/';
 const read=f=>readFileSync(new URL(base+f,import.meta.url),'utf8');
 const evaluator=read('ApexM5Evaluation.kt');
 const engine=read('ApexMultiFrameForecast.kt');
 const plugin=read('ApexNativePlugin.kt');
 assert.ok(engine.includes('M5_CLOSED_LIMIT_V2'));
 assert.ok(engine.includes('.put("evaluationInterval",ApexM1Evaluation.INTERVAL)'));
 assert.ok(engine.includes('horizonMs=spec.step*spec.bars'));
 assert.ok(engine.includes('if(m5)return ApexM5Evaluation.progress('));
 assert.ok(engine.includes('val legacy='));
 assert.ok(engine.includes('if(candle.openTime<row.publishedAt)continue'));
 assert.ok(evaluator.includes('horizonMs: Long = HORIZON * HOUR'));
 assert.ok(evaluator.includes('val count = (horizonMs / STEP).toInt()'));
 assert.ok(evaluator.includes('candle.openTime < forecast.publishedAt) {'));
 assert.ok(!evaluator.includes('Часть первой M5 до публикации:'));
 assert.ok(plugin.includes('"M5_CLOSED_LIMIT_V2"'));
 assert.ok(plugin.includes('"M1_CLOSED_LIMIT_V1"'));
});
