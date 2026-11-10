import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {computeReferenceLevels} from './research-level-sequence.mjs';
import {forecastStage,journalCounts} from './favorite-logic.mjs';
import {scenarioJournalState} from './scenario-journal-state.mjs';
import {multiFrameEvidence} from './forecast-multiframe.mjs';

const M=900000,H4=14400000;
const anchor=Math.floor(1760000000000/H4)*H4-1;
const price=100,width=.04;
const rounded=n=>Number(n.toPrecision(13));
const now=anchor+H4*30;
function scenario(asset,frame='15m',state='PENDING_CONFIRMATION'){
 const step=frame==='15m'?M:H4,bars=frame==='15m'?16:24;
 const refs=computeReferenceLevels(price,
  rounded(price*Math.exp(-width)),rounded(price*Math.exp(width)));
 const levels={version:'MULTIFRAME_SINGLE_LEVELS_V1',
  direction:'UP',entry:price,...refs.UP};
 const make=(stage,n)=>({
  stage,observedAt:anchor+step*n,recordedAt:anchor+step*n+1000
 });
 const stageEvents=[];
 if(['CONFIRMED','ACTIVE','COMPLETED'].includes(state))
  stageEvents.push(make('LIMIT_READY',2));
 if(['ACTIVE','COMPLETED'].includes(state))
  stageEvents.push(make('CONFIRMED',3));
 if(state==='COMPLETED')
  stageEvents.push(make('SL',6),make('COMPLETED',6));
 const targetCloseAt=anchor+step*bars;
 return {id:'direction3:'+asset+':'+frame+':'+anchor,
  asset,interval:frame,publishedAt:anchor+2000,
  status:'PENDING_CONFIRMATION',stageEvents,
  hypothesis:{
   model:'EMPIRICAL_MULTIFRAME_DIRECTION_V1',interval:frame,
   evaluationInterval:frame,decisionMethod:'SIX_BAR_EFFICIENCY_V1',
   stageSemantics:'SAME_FRAME_LIMIT_V1',direction:'UP',
   anchorCloseAt:anchor,anchorClose:price,
   targetCloseAt,horizonBars:bars,sampleBars:96,empiricalSamples:92,
   historicalPercentile:.8,empiricalWidth:width,
   levelStudy:levels,contextAsPublished:{}
  },
  ...(state==='COMPLETED'?{
   evaluation:{outcome:'STOP',targetCloseAt,
    evaluatedAt:anchor+step*6+2000,
    actualClose:99,actualChangePct:-1}}:{})};
}
const pending=scenario('BTCUSDT','15m');
const limit=scenario('ADAUSDT','15m','CONFIRMED');
const active=scenario('SOLUSDT','15m','ACTIVE');
const completed=scenario('ETHUSDT','4h','COMPLETED');
const legacy={
 id:'range1:OTHERUSDT:1h:'+anchor,asset:'OTHERUSDT',
 status:'ACTIVE',interval:'1h',
 publishedAt:anchor+1000,hypothesis:{
  model:'EMPIRICAL_CLOSE_RANGE_V1',
  anchorCloseAt:anchor,targetCloseAt:anchor+4*3600000,
  anchorClose:100,bandLow:95,bandHigh:105}
};
const rows=[pending,limit,active,completed,legacy];

test('source-verified M15 stages override generic cached native status',()=>{
 for(const [row,stage] of [[pending,'PENDING_CONFIRMATION'],
  [limit,'CONFIRMED'],[active,'ACTIVE'],[completed,'COMPLETED']]){
  assert.equal(multiFrameEvidence(row,{now}).state,'OBSERVED');
  assert.equal(forecastStage(row,{now}),stage);
 }
 const stale={...active,stageEvents:[{stage:'CONFIRMED',
  observedAt:anchor+3*M,recordedAt:anchor+3*M+1000}]};
 assert.equal(forecastStage(stale,{now}),'PENDING_CONFIRMATION');
 assert.equal(forecastStage({...pending,status:'PENDING_CONFIRMATION'},{
  now}),'PENDING_CONFIRMATION');
});
test('All counts and list both use the same directional M15/H4 records',()=>{
 const view=scenarioJournalState(rows,{now,stage:'CONFIRMED'});
 assert.deepEqual(view.counts,{
  PENDING_CONFIRMATION:1,CONFIRMED:1,ACTIVE:1,COMPLETED:1
 });
 assert.equal(view.inWork,3);
 assert.equal(view.completed,1);
 assert.deepEqual(view.visible.map(x=>x.id),[limit.id]);
 assert.equal(view.archive.length,0);
 assert.equal(view.loaded,5);
 assert.equal(view.scenarios.length,4);
 assert.equal(view.preferred,'PENDING_CONFIRMATION');
});
test('Marked mode does not copy All tab badges or historical entry totals',()=>{
 const onlyCompleted=scenarioJournalState(rows,{
  now,mode:'tracked',stage:'ACTIVE',selectedIds:[completed.id,'missing-id']
 });
 assert.deepEqual(onlyCompleted.counts,{
  PENDING_CONFIRMATION:0,CONFIRMED:0,ACTIVE:0,COMPLETED:1
 });
 assert.equal(onlyCompleted.inWork,0);
 assert.equal(onlyCompleted.visible.length,0);
 assert.equal(onlyCompleted.preferred,'COMPLETED');
 assert.equal(onlyCompleted.unavailableMarked,1);
 const onlyLive=scenarioJournalState(rows,{
  now,mode:'tracked',stage:'ACTIVE',selectedIds:[active.id]
 });
 assert.equal(onlyLive.inWork,1);
 assert.deepEqual(onlyLive.visible.map(x=>x.id),[active.id]);
 assert.equal(onlyLive.completed,0);
 assert.equal(scenarioJournalState(rows,{
  now,mode:'tracked',stage:'ACTIVE',selectedIds:[]
 }).inWork,0);
});
test('V1 range archive does not inflate live directed-scenario counters',()=>{
 const counted=scenarioJournalState(rows,{now,stage:'ACTIVE'});
 assert.equal(counted.counts.ACTIVE,1);
 assert.equal(counted.archive.length,1);
 const onlyOld=scenarioJournalState(rows,{
  now,mode:'tracked',stage:'ACTIVE',selectedIds:[legacy.id]
 });
 assert.equal(onlyOld.inWork,0);
 assert.equal(onlyOld.archive.length,1);
 assert.deepEqual(journalCounts([limit,active,completed],{now}),{
  PENDING_CONFIRMATION:0,CONFIRMED:1,ACTIVE:1,COMPLETED:1
 });
});
test('scenario UI, APK module manifest and Room labels remain synchronized',()=>{
 const ui=readFileSync(new URL('./favorite-dashboard.mjs',import.meta.url),'utf8');
 const card=readFileSync(new URL('./forecast-multiframe.mjs',import.meta.url),'utf8');
 const html=readFileSync(new URL('./index.html',import.meta.url),'utf8');
 const manifest=readFileSync(new URL('../apex9-android/scripts/prepare-web.mjs',import.meta.url),'utf8');
 assert.ok(ui.includes('scenarioJournalState(lastRows,'));
 assert.ok(ui.includes("id('forecast-pending-count').textContent=String(view.inWork)"));
 assert.ok(ui.includes("id('forecast-evaluated-count').textContent=String(view.completed)"));
 assert.ok(!ui.includes('const counts=journalCounts(lastRows);'));
 assert.ok(ui.includes("if(!view.counts[stage])stage=view.preferred"));
 assert.ok(ui.includes("['В работе сейчас · все ТФ',live.inWork]"));
 assert.ok(ui.includes('Касание входа за всю историю H1 → M5'));
 assert.ok(card.includes("evidence.events.has('LIMIT_READY')?'Лимитный'"));
 assert.ok(card.includes('multiFrameCardActions(row,{tracked,onToggle,onOpen})'));
 assert.ok(card.includes('shortPrice(plan[key])'));
 assert.ok(html.includes('id="stage-count-CONFIRMED"'));
 assert.ok(manifest.includes("'scenario-journal-state.mjs'"));
});
