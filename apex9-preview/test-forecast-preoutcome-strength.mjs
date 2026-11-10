import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {computeReferenceLevels} from './research-level-sequence.mjs';
import {
 PREOUTCOME_STRENGTH_VERSION,STRENGTH_AUDIT_RULES,
 inspectPreOutcomeStrength,auditPreOutcomeStrength
} from './forecast-preoutcome-strength.mjs';

const M=900000,BASE=Math.floor(1760000000000/M)*M-1;
const now=1900000000000,asset='BTCUSDT';
const round=x=>Number(x.toPrecision(13));
function score(hot,at){
 const e=hot?.9:.5,t=hot?.9:.1,v=hot?.9:.5;
 const score=Math.round(1000*(.5*e+.3*t+.2*v))/10;
 return {
  version:PREOUTCOME_STRENGTH_VERSION,state:'OBSERVED',
  interval:'15m',scope:'CLOSED_PRICE_VOLUME_ONLY_UNTRAINED',
  event:'TERMINAL_TP3_VS_STOP',
  candleCutoffAt:at,capturedAt:at+2000,sampleBars:96,
  efficiency:e,travelNorm:t,volumeNorm:v,volumeAvailable:true,
  score,scoreType:'UNTRAINED_SIGNAL_STRENGTH_NOT_PROBABILITY',
  calibratedProbability:null
 };
}
function scenario(i,{high=i%2===0,stop=i%4===1,withScore=true,
 outcome=null}={}){
 const a=BASE+i*25*M,close=100,w=.04;
 const targets=computeReferenceLevels(close,
  round(close*Math.exp(-w)),round(close*Math.exp(w))).UP;
 const make=(stage,n)=>({
  stage,observedAt:a+n*M,recordedAt:a+n*M+1000
 });
 const term=outcome|| (stop?'STOP':'TP3');
 const events=[make('LIMIT_READY',2),make('CONFIRMED',3)];
 if(term==='TP3')events.push(make('TP1',4),make('TP2',5),make('TP3',6));
 else if(term==='STOP')events.push(make('SL',6));
 else if(term==='HORIZON')events.push(make('TIMEOUT',16));
 if(term!=='AWAITING')events.push(make('COMPLETED',term==='HORIZON'?16:6));
 const h={
  model:'EMPIRICAL_MULTIFRAME_DIRECTION_V1',
  interval:'15m',evaluationInterval:'15m',
  direction:'UP',decisionMethod:'SIX_BAR_EFFICIENCY_V1',
  stageSemantics:'SAME_FRAME_LIMIT_V1',anchorCloseAt:a,
  anchorClose:close,targetCloseAt:a+16*M,horizonBars:16,
  sampleBars:96,empiricalSamples:92,historicalPercentile:.8,
  empiricalWidth:w,
  levelStudy:{version:'MULTIFRAME_SINGLE_LEVELS_V1',
   direction:'UP',entry:close,...targets},
  contextAsPublished:{},calibratedProbability:null
 };
 if(withScore)h.preOutcomeStrength=score(high,a);
 return {id:'direction3:'+asset+':15m:'+a,asset,interval:'15m',
  publishedAt:a+2000,status:term==='AWAITING'?'ACTIVE':'COMPLETED',
  hypothesis:h,stageEvents:events,
  ...(term==='AWAITING'?{}:{evaluation:{
   outcome:term,evaluatedAt:a+(term==='HORIZON'?16:6)*M+2000,
   targetCloseAt:a+16*M,actualClose:101,actualChangePct:1}})};
}
const audit=rows=>auditPreOutcomeStrength(rows,{asset,complete:true,
 publishedCount:rows.length,now});

test('frozen strength recomputes from features and cannot impersonate confidence',()=>{
 const x=scenario(0);
 const v=inspectPreOutcomeStrength(x);
 assert.equal(v.state,'VERIFIED');
 assert.equal(v.score,90);
 assert.equal(x.hypothesis.calibratedProbability,null);
 assert.equal(STRENGTH_AUDIT_RULES.calibratedProbability,null);
 assert.equal(STRENGTH_AUDIT_RULES.trainingEnabled,false);
 const tamper=structuredClone(x);
 tamper.hypothesis.preOutcomeStrength.score=99;
 assert.equal(inspectPreOutcomeStrength(tamper).state,'INVALID');
 const later=structuredClone(x);
 later.hypothesis.preOutcomeStrength.capturedAt+=1000;
 assert.equal(inspectPreOutcomeStrength(later).state,'INVALID');
 const fake=structuredClone(x);
 fake.hypothesis.preOutcomeStrength.calibratedProbability=.9;
 assert.equal(inspectPreOutcomeStrength(fake).state,'INVALID');
 const absent=scenario(1,{withScore:false});
 assert.equal(inspectPreOutcomeStrength(absent).state,'ABSENT');
});

test('early/late nonoverlap strength groups show only outcomes, not probabilities',()=>{
 const rows=Array.from({length:140},(_,i)=>scenario(i,{
  high:i%2===0,stop:i%4===1
 }));
 const result=audit(rows);
 const frame=result.frames['15m'];
 assert.equal(result.state,'DESCRIPTIVE');
 assert.equal(frame.state,'DESCRIPTIVE');
 assert.equal(frame.precommitted,140);
 assert.equal(frame.oldWithoutScore,0);
 assert.equal(frame.total.decisive,140);
 assert.equal(frame.total.scored,140);
 assert.equal(frame.total.bands.b3.tp3,70);
 assert.equal(frame.total.bands.b0.stop,35);
 assert.equal(frame.late.scored,56);
 assert.equal(frame.reference.scored,84);
 assert.equal(frame.late.decisive,56);
 assert.equal(frame.calibratedProbability,null);
 assert.equal(frame.modelWeightChanged,false);
});

test('old forecasts are not retroactively given scores',()=>{
 const rows=[
  ...Array.from({length:50},(_,i)=>scenario(i,{withScore:false})),
  ...Array.from({length:90},(_,i)=>scenario(100+i))
 ];
 const result=audit(rows);
 const m=result.frames['15m'];
 assert.equal(m.oldWithoutScore,50);
 assert.equal(m.precommitted,90);
 assert.equal(m.total.missing,50);
 assert.equal(m.total.scored,90);
 assert.equal(result.calibratedProbability,null);
});

test('incomplete, duplicated and mixed assets invalidate the whole audit',()=>{
 const rows=Array.from({length:50},(_,i)=>scenario(i));
 assert.equal(auditPreOutcomeStrength(rows,{asset,complete:false,
  publishedCount:50,now}).state,'INCOMPLETE');
 assert.equal(audit([...rows.slice(0,-1),rows[0]]).state,'INVALID');
 assert.equal(audit([...rows.slice(0,-1),
  {...rows.at(-1),asset:'ETHUSDT'}]).state,'INVALID');
});
test('overlap, missing source and unknown terminal outcome do not count wins',()=>{
 const rows=Array.from({length:100},(_,i)=>scenario(i,{stop:i%2===0}));
 rows.push(scenario(10,{high:true,stop:false}));
 rows.at(-1).id+=':duplicate-new-id'; // distinct ID, same published time
 const bad=structuredClone(rows);
 bad[3].hypothesis.preOutcomeStrength.score=60;
 const report=audit(bad).frames['15m'];
 assert.equal(report.state,'UNVERIFIED');
 assert.equal(report.total.invalid,1);
 assert.ok(report.total.excludedOverlap>=1);
 assert.equal(report.total.decisisive,undefined);
 const oldRows=Array.from({length:100},(_,i)=>scenario(i,{
  outcome:i%4===0?'HORIZON':null
 }));
 const other=audit(oldRows).frames['15m'];
 assert.ok(other.total.other>0);
 assert.ok(other.total.decisive<100);
 assert.ok(other.total.tp3<100);
});
test('new native formula and WebView packaging are present with no order actions',()=>{
 const root=new URL('../apex9-android/native/src/main/java/com/apexintelligence/research/',
  import.meta.url);
 const native=readFileSync(new URL('ApexPreOutcomeStrength.kt',root),'utf8');
 const h1=readFileSync(new URL('ApexAutoForecast.kt',root),'utf8');
 const frames=readFileSync(new URL('ApexMultiFrameForecast.kt',root),'utf8');
 const web=readFileSync(new URL('../apex9-android/scripts/prepare-web.mjs',
  import.meta.url),'utf8');
 const ui=readFileSync(new URL('./forecast-probability-dashboard.mjs',
  import.meta.url),'utf8');
 assert.ok(native.includes('CLOSED_PRICE_VOLUME_ONLY_UNTRAINED'));
 assert.ok(native.includes('UNTRAINED_SIGNAL_STRENGTH_NOT_PROBABILITY'));
 assert.ok(native.includes('0.5 * efficiency + 0.3 * travel + 0.2 * relativeVolumeNorm'));
 assert.ok(native.includes('bar.recordedAt > capturedAt'));
 assert.ok(h1.includes('ApexPreOutcomeStrength.snapshot(recent,width,now)'));
 assert.ok(frames.includes('ApexPreOutcomeStrength.snapshot(candles,width,now)'));
 assert.ok(web.includes("'forecast-preoutcome-strength.mjs'"));
 assert.ok(ui.includes('auditPreOutcomeStrength('));
 assert.ok(ui.includes('Экспериментальный балл силы сигнала'));
});
