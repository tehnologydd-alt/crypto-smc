import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {computeReferenceLevels} from './research-level-sequence.mjs';
import {verifiedDirectionalEvidence,directionalQualitySummary} from './forecast-quality.mjs';
import {journalObservedStats} from './journal-stats.mjs';

const H=3600000,M=300000,anchor=1800003599999;
const publication=anchor+1000,now=anchor+26*H;
function scenario(symbol,{method='5m',side='UP',outcome=null,
 points=[],entryAt=anchor+2*M,terminalAt=anchor+7*M}={}){
 const low=94,high=106,price=100;
 const p=computeReferenceLevels(price,low,high)[side];
 const hypothesis={model:'EMPIRICAL_DIRECTION_LEVELS_V2',
  decisionMethod:'SIX_BAR_EFFICIENCY_V1',direction:side,
  anchorCloseAt:anchor,targetCloseAt:anchor+24*H,horizonBars:24,
  anchorClose:price,bandLow:low,bandHigh:high,
  levelStudy:{version:'H1_SINGLE_LEVELS_V2',direction:side,
   entry:100,...p}};
 if(method==='5m'){
  hypothesis.evaluationInterval='5m';
  hypothesis.observationMethod='M5_CLOSED_LEVEL_ORDER_V1';
 }
 const timeline=[];
 const push=(stage,observedAt)=>timeline.push({
  stage,observedAt,recordedAt:Math.max(observedAt+1000,publication+1000)});
 const close=method==='5m'?M:H;
 if(entryAt!==null){
  push('CONFIRMED',entryAt);
 }
 for(const [i,point] of points.entries())push(point,anchor+(3+i)*close);
 let result=null;
 if(outcome){
  const stage={TP3:'TP3',STOP:'SL',AMBIGUOUS:'ORDER_UNKNOWN',
   NOT_ENTERED:'NO_ENTRY',HORIZON:'TIMEOUT'}[outcome];
  if(stage&&!points.includes(stage))push(stage,terminalAt);
  push('COMPLETED',terminalAt);
  result={outcome,actualClose:100.5,evaluatedAt:terminalAt+1000,
   targetCloseAt:anchor+24*H};
 }
 return {id:'direction2:'+symbol+':1h:'+anchor,asset:symbol,
  interval:'1h',publishedAt:publication,
  status:outcome?'COMPLETED':entryAt!==null?'ACTIVE':'PENDING_CONFIRMATION',
  hypothesis:JSON.stringify(hypothesis),stageEvents:timeline,evaluation:result};
}

test('TP1 and TP2 remain observed even when a later M5 closes at SL',()=>{
 const row=scenario('BTCUSDT',{outcome:'STOP',points:['TP1','TP2'],
  terminalAt:anchor+7*M});
 const evidence=verifiedDirectionalEvidence(row,{now});
 assert.equal(evidence.state,'OBSERVED');
 assert.equal(evidence.source,'M5');
 assert.equal(evidence.outcome,'STOP');
 assert.deepEqual(evidence.touched,['TP1','TP2']);
 const stats=directionalQualitySummary([row],{now});
 assert.equal(stats.all.published,1);
 assert.equal(stats.all.entered,1);
 assert.equal(stats.all.tp1,1);
 assert.equal(stats.all.tp2,1);
 assert.equal(stats.all.tp3,0);
 assert.equal(stats.all.stop,1);
 assert.equal(stats.all.finished,1);
});
test('final TP3 needs an authentic TP1→TP2→TP3 chain',()=>{
 const row=scenario('ETHUSDT',{outcome:'TP3',
  points:['TP1','TP2','TP3'],terminalAt:anchor+5*M});
 const proof=verifiedDirectionalEvidence(row,{now});
 assert.equal(proof.state,'OBSERVED');
 assert.equal(proof.touched.length,3);
 assert.equal(directionalQualitySummary([row],{now}).all.tp3,1);
 assert.equal(directionalQualitySummary([row],{now}).all.tp3Outcome,1);
 const forged=scenario('SOLUSDT',{outcome:'TP3',
  points:['TP3'],terminalAt:anchor+5*M});
 assert.equal(verifiedDirectionalEvidence(forged,{now}).state,'INVALID');
 assert.equal(directionalQualitySummary([forged],{now}).all.tp3,0);
});
test('completed ambiguous order is separate from TP and SL outcomes',()=>{
 const row=scenario('BNBUSDT',{outcome:'AMBIGUOUS',points:['TP1'],
  terminalAt:anchor+8*M});
 const q=directionalQualitySummary([row],{now}).all;
 assert.equal(q.ambiguous,1);
 assert.equal(q.tp1,1);
 assert.equal(q.stop,0);
 assert.equal(q.tp3,0);
 assert.equal(q.finished,1);
});
test('no-entry, expired, active, and incomplete source are distinct states',()=>{
 const noEntry=scenario('ADAUSDT',{entryAt:null,outcome:'NOT_ENTERED',
  terminalAt:anchor+24*H});
 const expired=scenario('LTCUSDT',{outcome:'HORIZON',
  terminalAt:anchor+24*H});
 const active=scenario('DOGEUSDT',{points:['TP1'],outcome:null});
 const missing=scenario('AVAXUSDT',{points:['TP1'],outcome:null});
 missing.stageEvents=null;
 const sum=directionalQualitySummary([noEntry,expired,active,missing],{now}).all;
 assert.equal(sum.published,3);
 assert.equal(sum.notEntered,1);
 assert.equal(sum.expired,1);
 assert.equal(sum.awaiting,1);
 assert.equal(sum.unverified,1);
 assert.equal(sum.finished,2);
 assert.equal(sum.entered,2);
});
test('old H1-evaluated studies do not inflate new M5 results',()=>{
 const old=scenario('XRPUSDT',{method:'1h',outcome:'TP3',
  points:['TP1','TP2','TP3'],entryAt:anchor+2*H,
  terminalAt:anchor+5*H});
 const fresh=scenario('BTCUSDT',{outcome:'STOP',points:['TP1']});
 const summary=directionalQualitySummary([old,fresh],{now});
 assert.equal(summary.all.published,1);
 assert.equal(summary.all.tp3,0);
 assert.equal(summary.archivedH1,1);
});
test('same journal supports all and independently tracked cohorts',()=>{
 const a=scenario('BTCUSDT',{outcome:'STOP',points:['TP1']});
 const b=scenario('ETHUSDT',{outcome:'TP3',points:['TP1','TP2','TP3'],
  terminalAt:anchor+5*M});
 const x=directionalQualitySummary([a,b],{selectedIds:[b.id],now});
 assert.equal(x.all.published,2);
 assert.equal(x.tracked.published,1);
 assert.equal(x.tracked.tp3,1);
 assert.equal(x.tracked.stop,0);
});
test('wrong timestamps, duplicated stages and future outcomes do not score',()=>{
 const good=scenario('BTCUSDT',{outcome:'STOP',points:['TP1']});
 const crossed=structuredClone(good);
 crossed.stageEvents[1].observedAt+=4000;
 assert.equal(verifiedDirectionalEvidence(crossed,{now}).state,'INVALID');
 const duplicate=structuredClone(good);
 duplicate.stageEvents.push({...duplicate.stageEvents[1]});
 assert.equal(verifiedDirectionalEvidence(duplicate,{now}).state,'INVALID');
 const wrong=structuredClone(good);
 wrong.evaluation.targetCloseAt+=M;
 assert.equal(verifiedDirectionalEvidence(wrong,{now}).state,'INVALID');
 const sum=directionalQualitySummary([crossed,duplicate,wrong],{now}).all;
 assert.equal(sum.published,0);
 assert.equal(sum.invalid,3);
 assert.equal(sum.tp1,0);
 assert.equal(sum.stop,0);
});
test('all source summaries remain non-trading, bounded and explain denominators',()=>{
 const ui=readFileSync(new URL('./favorite-dashboard.mjs',import.meta.url),'utf8');
 const css=readFileSync(new URL('./styles.css',import.meta.url),'utf8');
 assert.ok(ui.includes('directionalQualitySummary(lastRows'));
 assert.ok(ui.includes('Качество прогнозов'));
 assert.ok(ui.includes('Касания TP'));
 assert.ok(css.includes('.forecast-quality-summary'));
 // Existing journal stats still support the legacy archival subset.
 assert.ok(typeof journalObservedStats==='function');
});
