import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {computeReferenceLevels} from './research-level-sequence.mjs';
import {scenarioJournalRows,scenarioJournalState}
 from './scenario-journal-state.mjs';

const M=900000,H4=14400000;
const anchor=Math.floor(1760000000000/H4)*H4-1;
const now=anchor+H4*55;
function scenario(asset,idx,frame='15m',outcome='STOP'){
 const step=frame==='15m'?M:H4,bars=frame==='15m'?16:24;
 const a=anchor+idx*30*step;
 const price=100,width=.04;
 const r=x=>Number(x.toPrecision(13));
 const lv=computeReferenceLevels(price,
  r(price*Math.exp(-width)),r(price*Math.exp(width))).UP;
 const make=(stage,n)=>({stage,observedAt:a+n*step,
  recordedAt:a+n*step+1000});
 const events=[make('LIMIT_READY',2),make('CONFIRMED',3)];
 if(outcome==='STOP')events.push(make('SL',6),make('COMPLETED',6));
 return {
  id:'direction3:'+asset+':'+frame+':'+a,asset,interval:frame,
  publishedAt:a+1000,status:outcome?'COMPLETED':'ACTIVE',
  hypothesis:{
   model:'EMPIRICAL_MULTIFRAME_DIRECTION_V1',
   interval:frame,evaluationInterval:frame,
   direction:'UP',decisionMethod:'SIX_BAR_EFFICIENCY_V1',
   stageSemantics:'SAME_FRAME_LIMIT_V1',
   anchorCloseAt:a,anchorClose:price,targetCloseAt:a+bars*step,
   horizonBars:bars,sampleBars:96,empiricalSamples:92,
   historicalPercentile:.8,empiricalWidth:width,
   levelStudy:{version:'MULTIFRAME_SINGLE_LEVELS_V1',
    direction:'UP',entry:price,...lv},
   contextAsPublished:{}
  },
  stageEvents:events,
  ...(outcome?{evaluation:{
   outcome,evaluatedAt:a+6*step+2000,
   targetCloseAt:a+bars*step,actualClose:99,
   actualChangePct:-1}}:{})
 };
}
const recent=Array.from({length:75},(_,i)=>({
 id:'range1:RECENTUSDT:1h:'+String(1800000000000+i*3600000),
 asset:'RECENTUSDT',interval:'1h',publishedAt:1800000000000+i*3600000,
 status:'COMPLETED',hypothesis:{model:'EMPIRICAL_CLOSE_RANGE_V1'},
 stageEvents:[]
}));
const older=scenario('ADAUSDT',0,'15m','STOP');
const legacy={
 id:'range1:ADAUSDT:1h:1700000000000',asset:'ADAUSDT',
 interval:'1h',publishedAt:1700000000000,status:'COMPLETED',
 hypothesis:{model:'EMPIRICAL_CLOSE_RANGE_V1'},stageEvents:[]};
test('the 75 recent cards remain unchanged in All mode',()=>{
 const merged=scenarioJournalRows(recent,[older,legacy],{mode:'all'});
 assert.equal(merged,recent);
 assert.equal(merged.length,75);
 assert.ok(!merged.some(x=>x.id===older.id));
});
test('Marked mode restores exact old Room records and never duplicates IDs',()=>{
 const latest=scenario('BTCUSDT',1,'15m','STOP');
 const a=scenarioJournalRows([latest,...recent],[
  {...latest,status:'COMPLETED'},older,legacy],{mode:'tracked'});
 assert.equal(a.length,78);
 assert.equal(a.filter(x=>x.id===latest.id).length,1);
 assert.deepEqual(new Set(a.map(x=>x.id)).size,a.length);
 assert.ok(a.some(x=>x.id===older.id));
 assert.ok(a.some(x=>x.id===legacy.id));
 const mark=[older.id,legacy.id];
 const view=scenarioJournalState(a,{selectedIds:mark,
  mode:'tracked',stage:'COMPLETED',now});
 assert.equal(view.counts.COMPLETED,1);
 assert.equal(view.inWork,0);
 assert.deepEqual(view.visible.map(x=>x.id),[older.id]);
 assert.equal(view.archive.length,1);
 assert.equal(view.archive[0].id,legacy.id);
 assert.equal(view.unavailableMarked,0);
 assert.equal(view.markedLoaded,1); // directional cards, not old range
});
test('saved archive remains visible even when stage filter is PENDING',()=>{
 const all=scenarioJournalRows(recent,[older,legacy],{mode:'tracked'});
 const view=scenarioJournalState(all,{
  mode:'tracked',stage:'PENDING_CONFIRMATION',selectedIds:[legacy.id],now});
 assert.equal(view.counts.PENDING_CONFIRMATION,0);
 assert.equal(view.archive.length,1);
 assert.equal(view.archive[0].id,legacy.id);
 assert.equal(view.completed,0);
});
test('missing saved IDs are reported but never fabricated or marked completed',()=>{
 const all=scenarioJournalRows(recent,[older],{mode:'tracked'});
 const marked=scenarioJournalState(all,{
  mode:'tracked',stage:'COMPLETED',
  selectedIds:[older.id,'direction3:UNKNOWNUSDT:15m:1700000000000'],now});
 assert.equal(marked.unavailableMarked,1);
 assert.equal(marked.counts.COMPLETED,1);
 assert.equal(marked.visible.length,1);
});
test('native exact-ID lookup, mobile validation and on-demand UI all exist',()=>{
 const base=new URL('../apex9-android/native/src/main/java/com/apexintelligence/research/',
  import.meta.url);
 const db=readFileSync(new URL('ApexDatabase.kt',base),'utf8');
 const native=readFileSync(new URL('ApexNativePlugin.kt',base),'utf8');
 const bridge=readFileSync(new URL('./mobile-bridge.mjs',import.meta.url),'utf8');
 const ui=readFileSync(new URL('./favorite-dashboard.mjs',import.meta.url),'utf8');
 assert.ok(db.includes('suspend fun researchForecastsByIds(ids: List<String>)'));
 assert.ok(native.includes('fun getMarkedResearchForecasts(call: PluginCall)'));
 assert.ok(native.includes('forecastJournalItems(dao, found)'));
 assert.ok(native.includes('forecastJournalItems(dao, published)'));
 assert.ok(native.includes('requestedArray.length() !in 1..75'));
 assert.ok(bridge.includes('export async function getMobileMarkedResearchForecasts(ids)'));
 assert.ok(bridge.includes("offset+=75"));
 assert.ok(bridge.includes('response.missingIds'));
 assert.ok(ui.includes('async function loadMarkedRows('));
 assert.ok(ui.includes("markedReadyFor===selectedKey()"));
 assert.ok(ui.includes('getMobileMarkedResearchForecasts([...selected])'));
 assert.ok(ui.includes("archive.open=journalMode==='tracked'||archiveExpanded"));
 assert.ok(ui.includes("if(journalMode==='tracked')void loadMarkedRows({force:true})"));
});
