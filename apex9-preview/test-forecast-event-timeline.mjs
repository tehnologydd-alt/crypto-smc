import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {computeReferenceLevels} from './research-level-sequence.mjs';
import {buildForecastEventTimeline} from './forecast-event-timeline.mjs';

const H=3600000,M=300000,anchor=1800003599999;
const publishedAt=anchor+1000,now=anchor+26*H;
function scenario(symbol,{frame='5m',side='UP',entry=true,
 touched=[],outcome=null,terminalAt=anchor+7*M}={}){
 const levels=computeReferenceLevels(100,94,106)[side];
 const hypothesis={
  model:'EMPIRICAL_DIRECTION_LEVELS_V2',
  decisionMethod:'SIX_BAR_EFFICIENCY_V1',
  direction:side,anchorCloseAt:anchor,targetCloseAt:anchor+24*H,
  horizonBars:24,anchorClose:100,bandLow:94,bandHigh:106,
  levelStudy:{version:'H1_SINGLE_LEVELS_V2',direction:side,
   entry:100,...levels}
 };
 if(frame==='5m'){
  hypothesis.evaluationInterval='5m';
  hypothesis.observationMethod='M5_CLOSED_LEVEL_ORDER_V1';
 }
 const stages=[];
 const append=(stage,at)=>stages.push({
  stage,observedAt:at,recordedAt:at+1000
 });
 const span=frame==='5m'?M:H;
 if(entry)append('CONFIRMED',anchor+2*span);
 for(const [i,point] of touched.entries())append(point,anchor+(3+i)*span);
 if(outcome){
  const stage={TP3:'TP3',STOP:'SL',AMBIGUOUS:'ORDER_UNKNOWN',
   NOT_ENTERED:'NO_ENTRY',HORIZON:'TIMEOUT'}[outcome];
  if(stage&&!touched.includes(stage))append(stage,terminalAt);
  append('COMPLETED',terminalAt);
 }
 return {
  id:'direction2:'+symbol+':1h:'+anchor,
  asset:symbol,interval:'1h',publishedAt,
  status:outcome?'COMPLETED':entry?'ACTIVE':'PENDING_CONFIRMATION',
  hypothesis:JSON.stringify(hypothesis),
  stageEvents:stages,
  evaluation:outcome?{
   outcome,actualClose:101,evaluatedAt:terminalAt+1000,
   targetCloseAt:anchor+24*H
  }:null
 };
}
test('TP1, TP2 then SL display as source-preserved M5 chronology',()=>{
 const row=scenario('BTCUSDT',{touched:['TP1','TP2'],outcome:'STOP'});
 const timeline=buildForecastEventTimeline(row,{now});
 assert.equal(timeline.state,'VERIFIED');
 assert.equal(timeline.source,'M5');
 assert.equal(timeline.finished,true);
 assert.equal(timeline.outcome,'STOP');
 assert.deepEqual(timeline.events.map(x=>x.stage),
  ['PUBLISHED','CONFIRMED','TP1','TP2','SL']);
 assert.equal(timeline.events[1].price,100);
 assert.equal(timeline.events[2].price,102);
 assert.equal(timeline.events[3].price,104);
 assert.equal(timeline.events[4].price,98);
 assert.equal(timeline.events[4].terminal,true);
 assert.equal(timeline.label,'Активный · вход → TP1 → TP2 → SL');
 assert.equal(timeline.events[2].at,anchor+3*M);
 assert.equal(timeline.events[4].at,anchor+7*M);
});
test('TP3 is terminal exactly once, with no repeated COMPLETED event',()=>{
 const row=scenario('ETHUSDT',{touched:['TP1','TP2','TP3'],
  outcome:'TP3',terminalAt:anchor+5*M});
 const history=buildForecastEventTimeline(row,{now});
 assert.equal(history.state,'VERIFIED');
 assert.deepEqual(history.events.map(x=>x.stage),
  ['PUBLISHED','CONFIRMED','TP1','TP2','TP3']);
 assert.equal(history.events.filter(x=>x.terminal).length,1);
 assert.equal(history.events.at(-1).price,106);
});
test('when two take-profit levels land on the same M5, order is deterministic',()=>{
 const row=scenario('SOLUSDT',{touched:['TP1','TP2','TP3'],
  outcome:'TP3',terminalAt:anchor+5*M});
 row.stageEvents.find(x=>x.stage==='TP2').observedAt=anchor+3*M;
 row.stageEvents.find(x=>x.stage==='TP3').observedAt=anchor+3*M;
 row.stageEvents.find(x=>x.stage==='TP3').recordedAt=anchor+5*M+1000;
 row.stageEvents.find(x=>x.stage==='TP2').recordedAt=anchor+5*M+1000;
 row.stageEvents.find(x=>x.stage==='COMPLETED').observedAt=anchor+3*M;
 row.stageEvents.find(x=>x.stage==='COMPLETED').recordedAt=anchor+5*M+1000;
 const result=buildForecastEventTimeline(row,{now});
 assert.equal(result.state,'VERIFIED');
 assert.deepEqual(result.events.map(x=>x.stage).slice(-3),
  ['TP1','TP2','TP3']);
 assert.deepEqual(result.events.map(x=>x.at).slice(-3),
  [anchor+3*M,anchor+3*M,anchor+3*M]);
});
test('ambiguous M5 is explicitly unknown, not a TP or SL success',()=>{
 const row=scenario('BNBUSDT',{entry:false,outcome:'AMBIGUOUS',
  terminalAt:anchor+M});
 const result=buildForecastEventTimeline(row,{now});
 assert.equal(result.state,'VERIFIED');
 assert.equal(result.finished,true);
 assert.equal(result.entered,false);
 assert.deepEqual(result.events.map(x=>x.stage),['PUBLISHED','ORDER_UNKNOWN']);
 assert.equal(result.events.at(-1).label,'Порядок неизвестен');
 assert.equal(result.events.at(-1).price,null);
});
test('not entered and expired scenarios close at fixed 24h deadline',()=>{
 const missed=scenario('ADAUSDT',{entry:false,outcome:'NOT_ENTERED',
  terminalAt:anchor+24*H});
 const timed=scenario('LTCUSDT',{entry:true,outcome:'HORIZON',
  terminalAt:anchor+24*H});
 assert.equal(buildForecastEventTimeline(missed,{now}).events.at(-1).stage,'NO_ENTRY');
 assert.equal(buildForecastEventTimeline(timed,{now}).events.at(-1).stage,'TIMEOUT');
});
test('active scenario has a partial trail, not a made-up terminal',()=>{
 const row=scenario('DOGEUSDT',{touched:['TP1']});
 const timeline=buildForecastEventTimeline(row,{now});
 assert.equal(timeline.state,'VERIFIED');
 assert.equal(timeline.finished,false);
 assert.deepEqual(timeline.events.map(x=>x.stage),['PUBLISHED','CONFIRMED','TP1']);
 assert.equal(timeline.events.some(x=>x.terminal),false);
});
test('old H1 research keeps H1 source and is never rewritten as M5',()=>{
 const row=scenario('XRPUSDT',{frame:'1h',touched:['TP1'],
  terminalAt:anchor+4*H});
 const x=buildForecastEventTimeline(row,{now});
 assert.equal(x.state,'VERIFIED');
 assert.equal(x.source,'H1');
 assert.equal(x.events.find(y=>y.stage==='TP1').source,'H1');
});
test('invalid, duplicate or absent Room evidence cannot fabricate a trail',()=>{
 const valid=scenario('AVAXUSDT',{outcome:'STOP',touched:['TP1']});
 const missing=structuredClone(valid);missing.stageEvents=null;
 assert.equal(buildForecastEventTimeline(missing,{now}).state,'UNVERIFIED');
 assert.deepEqual(buildForecastEventTimeline(missing,{now}).events,[]);
 const duplicate=structuredClone(valid);duplicate.stageEvents.push({
  ...duplicate.stageEvents.find(x=>x.stage==='TP1')});
 assert.equal(buildForecastEventTimeline(duplicate,{now}).state,'UNVERIFIED');
 const bad=structuredClone(valid);
 bad.stageEvents.find(x=>x.stage==='TP1').observedAt+=3400;
 assert.equal(buildForecastEventTimeline(bad,{now}).state,'UNVERIFIED');
});
test('visual chronology remains separate from independent M5 replay',()=>{
 const card=readFileSync(new URL('./forecast-directional-card.mjs',import.meta.url),'utf8');
 const css=readFileSync(new URL('./styles.css',import.meta.url),'utf8');
 const asset=readFileSync(new URL('../apex9-android/scripts/prepare-web.mjs',import.meta.url),'utf8');
 assert.ok(card.includes('buildForecastEventTimeline(row,{now:Date.now()})'));
 assert.ok(card.includes('forecast-event-timeline'));
 assert.ok(card.includes("const sameEntry=(audit.entryAt??null)"));
 assert.ok(card.includes('сохранённые события Room не изменены')||
   card.includes('отображённые события Room не изменены'));
 assert.ok(css.includes('.forecast-event-items'));
 assert.ok(css.includes('.forecast-visual.is-completed .forecast-event-timeline'));
 assert.ok(asset.includes("'forecast-event-timeline.mjs'"));
});
