import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {computeReferenceLevels} from './research-level-sequence.mjs';
import {auditProbabilityReadiness,wilsonIndicative,READINESS_RULES}
 from './forecast-probability-readiness.mjs';

const M=900000,H=3600000,H4=14400000,asset='BTCUSDT';
const anchorFor=step=>Math.floor(1760000000000/step)*step-1;
const around=n=>Number(n.toPrecision(13));
const now=1900000000000;
const levels=(low,high,type)=>
 ({version:type,direction:'UP',entry:100,
  ...computeReferenceLevels(100,low,high).UP});
function scenario(frame,i,{outcome='TP3',offset=0,observer='5m'}={}){
 const step=frame==='15m'?M:frame==='4h'?H4:H;
 const horizon=frame==='15m'?16:24;
 const anchor=anchorFor(step)+(25*i+offset)*step;
 const publishedAt=anchor+1000,targetCloseAt=anchor+horizon*step;
 const interval=frame==='1h'?observer:frame;
 const eventStep=frame==='1h'&&observer==='5m'?300000:step;
 const staged=(stage,n)=>({stage,
  observedAt:anchor+n*eventStep,
  recordedAt:anchor+n*eventStep+1000});
 const events=frame==='1h'&&observer==='1h'?
  [staged('CONFIRMED',2)]:
  [staged('LIMIT_READY',2),staged('CONFIRMED',3)];
 let terminal=anchor+6*eventStep;
 if(outcome==='TP3')
  events.push(staged('TP1',4),staged('TP2',5),staged('TP3',6));
 if(outcome==='STOP')
  events.push(staged('SL',6));
 if(outcome==='AMBIGUOUS')
  events.push(staged('ORDER_UNKNOWN',6));
 if(outcome==='HORIZON'){
  events.push(staged('TIMEOUT',horizon));
  terminal=targetCloseAt;
 }
 if(outcome==='NOT_ENTERED'){
  events.splice(0,events.length);
  events.push(staged('NO_ENTRY',horizon));
  terminal=targetCloseAt;
 }
 if(outcome!==null)events.push({
  stage:'COMPLETED',observedAt:terminal,
  recordedAt:terminal+1000
 });
 const hypothesis=frame==='1h'?{
  model:'EMPIRICAL_DIRECTION_LEVELS_V2',
  decisionMethod:'SIX_BAR_EFFICIENCY_V1',direction:'UP',
  anchorCloseAt:anchor,targetCloseAt,horizonBars:24,
  anchorClose:100,bandLow:95,bandHigh:105,
  levelStudy:levels(95,105,'H1_SINGLE_LEVELS_V2'),
  evaluationInterval:interval,
  ...(interval==='5m'?{
   observationMethod:'M5_CLOSED_LEVEL_ORDER_V1',
   stageSemantics:'LIMIT_READY_M5_V1'}:{})
 }:{
  model:'EMPIRICAL_MULTIFRAME_DIRECTION_V1',
  interval:frame,evaluationInterval:frame,
  direction:'UP',decisionMethod:'SIX_BAR_EFFICIENCY_V1',
  stageSemantics:'SAME_FRAME_LIMIT_V1',anchorCloseAt:anchor,
  anchorClose:100,targetCloseAt,horizonBars:horizon,
  sampleBars:96,empiricalSamples:92,historicalPercentile:.8,
  empiricalWidth:.04,
  levelStudy:levels(around(100*Math.exp(-.04)),
   around(100*Math.exp(.04)),'MULTIFRAME_SINGLE_LEVELS_V1'),
  contextAsPublished:{}
 };
 const id=(frame==='1h'?'direction2:':'direction3:')+
  asset+':'+frame+':'+anchor;
 return {asset,id,interval:frame,publishedAt,status:outcome?'COMPLETED':'ACTIVE',
  hypothesis,stageEvents:events,
  ...(outcome?{evaluation:{outcome,
   evaluatedAt:terminal+2000,targetCloseAt,actualClose:101}}:{})};
}
function audit(rows){
 return auditProbabilityReadiness(rows,{asset,complete:true,
  publishedCount:rows.length,now});
}
test('Wilson 95% calculation is a math sensitivity, not calibrated forecast',()=>{
 const half=wilsonIndicative(50,100);
 assert.ok(Math.abs(half.lower-.4038)<.002);
 assert.ok(Math.abs(half.upper-.5962)<.002);
 assert.deepEqual(wilsonIndicative(0,0),null);
 assert.deepEqual(wilsonIndicative(101,100),null);
 assert.equal(READINESS_RULES.calibratedProbability,false);
 assert.equal(READINESS_RULES.autoTraining,false);
});
test('M15 independent conditional TP3/STOP rates and 60/40 time split',()=>{
 const rows=Array.from({length:100},(_,i)=>scenario('15m',i,{
  outcome:i%2===0?'TP3':'STOP'
 }));
 const report=audit(rows);
 assert.equal(report.status,'DESCRIPTIVE');
 assert.equal(report.calibratedProbability,null);
 assert.equal(report.approvedForTraining,false);
 const r=report.frames['15m'];
 assert.equal(r.status,'FREQUENCY_OBSERVED');
 assert.equal(r.published,100);
 assert.equal(r.total.verified,100);
 assert.equal(r.total.invalid,0);
 assert.equal(r.total.decisive,100);
 assert.equal(r.total.outcomes.TP3,50);
 assert.equal(r.total.outcomes.STOP,50);
 assert.equal(r.total.tp3OfDecisive,.5);
 assert.equal(r.reference.verified,60);
 assert.equal(r.holdout.verified,40);
 assert.equal(r.reference.outcomes.TP3,30);
 assert.equal(r.holdout.outcomes.STOP,20);
 assert.equal(r.calibration,'NO_PUBLISHED_PROBABILITIES');
});
test('non-binary outcomes and open forecasts never become TP3 successes',()=>{
 const rows=Array.from({length:90},(_,i)=>scenario('15m',i,{
  outcome:['TP3','STOP','AMBIGUOUS','HORIZON','NOT_ENTERED',null][i%6]
 }));
 const report=audit(rows);
 const r=report.frames['15m'].total;
 assert.equal(r.verified,90);
 assert.equal(r.outcomes.TP3,15);
 assert.equal(r.outcomes.STOP,15);
 assert.equal(r.outcomes.AMBIGUOUS,15);
 assert.equal(r.outcomes.HORIZON,15);
 assert.equal(r.outcomes.NOT_ENTERED,15);
 assert.equal(r.awaiting,15);
 assert.equal(r.decisive,30);
 assert.equal(r.tp3OfDecisive,.5);
 assert.equal(report.frames['15m'].status,'MORE_DATA');
 assert.equal(r.tp3OfAllVerified,15/90);
});
test('independence embargo excludes overlapping plans without selecting by outcome',()=>{
 const rows=Array.from({length:60},(_,i)=>scenario('15m',i,{
  outcome:'STOP'}));
 const overlap=scenario('15m',10,{outcome:'TP3',offset:8});
 rows.push(overlap);
 const total=audit(rows).frames['15m'].total;
 assert.equal(total.published,61);
 assert.equal(total.overlapExcluded,1);
 assert.equal(total.outcomes.TP3,0);
 assert.equal(total.outcomes.STOP,60);
 assert.equal(total.decisive,60);
});
test('late outcomes after holdout start cannot improve reference',()=>{
 const rows=Array.from({length:80},(_,i)=>scenario('15m',i,{
  outcome:i%2===0?'TP3':'STOP'
 }));
 const boundary=rows[48].publishedAt;
 rows[8].evaluation.evaluatedAt=boundary+1000;
 const result=audit(rows).frames['15m'];
 assert.equal(result.reference.lateOutcome,1);
 assert.equal(result.reference.outcomes.TP3,23);
 assert.equal(result.holdout.outcomes.TP3,16);
});
test('older H1 observer is excluded; H1→M5 and H4 remain independent',()=>{
 const h1=Array.from({length:60},(_,i)=>scenario('1h',i,{
  outcome:i%2===0?'TP3':'STOP'
 }));
 const h4=Array.from({length:30},(_,i)=>scenario('4h',i,{
  outcome:i%2===0?'TP3':'STOP'
 }));
 const old=scenario('1h',70,{observer:'1h',outcome:'TP3'});
 const report=audit([...h1,...h4,old]);
 assert.equal(report.frames['1h'].total.legacyH1,1);
 assert.equal(report.frames['1h'].total.decisive,60);
 assert.equal(report.frames['1h'].total.outcomes.TP3,30);
 assert.equal(report.frames['4h'].total.verified,30);
 assert.equal(report.frames['4h'].total.decisive,30);
 assert.equal(report.frames['15m'].published,0);
});
test('partial, duplicated, mixed and malformed archives are rejected',()=>{
 const full=Array.from({length:45},(_,i)=>scenario('15m',i));
 assert.equal(auditProbabilityReadiness(full.slice(0,30),{
  asset,complete:false,publishedCount:45,now}).status,'INCOMPLETE');
 assert.equal(auditProbabilityReadiness([...full.slice(0,-1),full[0]],{
  asset,complete:true,publishedCount:45,now}).status,'INVALID');
 assert.equal(auditProbabilityReadiness([...full.slice(0,-1),
  {...full.at(-1),asset:'ETHUSDT'}],{
  asset,complete:true,publishedCount:45,now}).status,'INVALID');
 const damaged=full.map(x=>structuredClone(x));
 damaged[6].stageEvents[1].recordedAt=0;
 assert.equal(audit(damaged).frames['15m'].status,'INVALID_EVIDENCE');
});
test('foreign calibrated numbers cannot be promoted to model confidence',()=>{
 const rows=Array.from({length:60},(_,i)=>scenario('15m',i,{
  outcome:i%2===0?'TP3':'STOP'
 }));
 rows[3].hypothesis.calibratedProbability=.99;
 const r=audit(rows).frames['15m'];
 assert.equal(r.calibration,'UNVERIFIED_SCORES');
 assert.equal(r.readyForModelTraining,false);
});
test('manifest and selected-favorite manual UI bind audited frequencies',()=>{
 const ui=readFileSync(new URL('./forecast-feature-dashboard.mjs',import.meta.url),'utf8');
 const html=readFileSync(new URL('./index.html',import.meta.url),'utf8');
 const build=readFileSync(new URL('../apex9-android/scripts/prepare-web.mjs',import.meta.url),'utf8');
 assert.ok(ui.includes('renderProbabilityReadiness(archive,asset,'));
 assert.ok(ui.includes('maxRows:1500'));
 assert.ok(html.includes('id="forecast-probability-report"'));
 assert.ok(build.includes("'forecast-probability-readiness.mjs'"));
 assert.ok(build.includes("'forecast-probability-dashboard.mjs'"));
});
