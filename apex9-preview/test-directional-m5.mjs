import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {computeReferenceLevels} from './research-level-sequence.mjs';
import {
 DIRECTIONAL_MODEL,DIRECTIONAL_LEVEL_VERSION,planDirectionalScenario,
 auditDirectionalScenario,auditDirectionalM5
} from './directional-scenario.mjs';
const H=3600000,M=300000;
const anchor=1800003599999,publication=anchor+1000;
function row(side='UP',withM5=true){
 const levels=computeReferenceLevels(100,94,106);
 return {id:'direction2:BTCUSDT:1h:'+anchor,asset:'BTCUSDT',interval:'1h',
  publishedAt:publication,status:'PENDING_CONFIRMATION',
  hypothesis:JSON.stringify({
   model:DIRECTIONAL_MODEL,decisionMethod:'SIX_BAR_EFFICIENCY_V1',direction:side,
   anchorCloseAt:anchor,targetCloseAt:anchor+24*H,horizonBars:24,
   anchorClose:100,bandLow:94,bandHigh:106,
   levelStudy:{version:DIRECTIONAL_LEVEL_VERSION,direction:side,entry:100,
    ...levels[side]},
   ...(withM5?{evaluationInterval:'5m',
    observationMethod:'M5_CLOSED_LEVEL_ORDER_V1'}:{})
  })
 };
}
const plan=(side='UP',withM5=true)=>planDirectionalScenario(
 row(side,withM5),{now:publication+10000}).plan;
function bar(i,{open=101.3,high=101.5,low=101.1,close=101.3}={}){
 return {t:anchor+1+(i-1)*M,closeAt:anchor+i*M,
  open,high,low,close,volume:3,closed:true};
}
const entering=bar(2,{open:100.1,high:100.2,low:99.9,close:100.1});
const start=()=>[bar(1),entering];
const audit=(candles,at=anchor+5*M+1000,side='UP')=>
 auditDirectionalScenario(plan(side),candles,{now:at});
test('H1 remains the direction, archived M5 studies retain the evaluation method',()=>{
 const fresh=plan();
 assert.equal(fresh.side,'UP');
 assert.equal(fresh.evaluationInterval,'5m');
 assert.equal(fresh.anchorCloseAt,anchor);
 assert.equal(fresh.targetCloseAt-anchor,24*H);
 const old=plan('UP',false);
 assert.equal(old.evaluationInterval,'1h');
 const altered=row();
 altered.hypothesis=JSON.stringify({
  ...JSON.parse(altered.hypothesis),observationMethod:'FAKE'});
 assert.equal(planDirectionalScenario(altered,{now:publication+10000}).state,'INVALID');
});
test('M5 progression is chronological and nested TP1, TP2, TP3 are not H1 guesses',()=>{
 const r=audit([...start(),
  bar(3,{open:101,high:102.5,low:100.5,close:102}),
  bar(4,{open:103,high:104.5,low:102.5,close:104}),
  bar(5,{open:104,high:106.3,low:103.5,close:105})]);
 assert.equal(r.outcome,'TP3');
 assert.equal(r.finished,true);
 assert.equal(r.entryAt,anchor+2*M);
 assert.deepEqual(r.hits.map(x=>x.key),['tp1','tp2','tp3']);
 assert.deepEqual(r.hits.map(x=>x.at),[anchor+3*M,anchor+4*M,anchor+5*M]);
 assert.equal(r.observedBars,5);
 assert.match(r.note,/M5/);
});
test('M5 SL first receives no unobserved TP credit',()=>{
 const r=audit([...start(),
  bar(3,{open:100,high:101,low:97.8,close:99})],
  anchor+3*M+1000);
 assert.equal(r.outcome,'STOP');
 assert.deepEqual(r.hits,[]);
});
test('SL and a newly reached TP in the same M5 are indeterminate',()=>{
 const r=audit([...start(),
  bar(3,{open:100,high:103,low:97.7,close:101})],anchor+3*M+1000);
 assert.equal(r.outcome,'AMBIGUOUS');
 assert.equal(r.hits.length,0);
 assert.match(r.reason,/одной M5/);
});
test('entry plus TP1 in a single completed M5 is never credited as a win',()=>{
 const r=audit([bar(1),
  bar(2,{open:100.1,high:103,low:99.9,close:102})],anchor+2*M+1000);
 assert.equal(r.outcome,'AMBIGUOUS');
 assert.deepEqual(r.hits,[]);
});
test('partly pre-publication M5 is skipped, not fabricated ambiguous',()=>{
 const partial=bar(1,{open:100.1,high:103,low:97,close:100.2});
 const r=audit([partial],anchor+M+1000);
 assert.equal(r.outcome,'OPEN');
 assert.equal(r.state,'WAITING');
 assert.equal(r.entryAt,null);
 const after=audit([partial,entering,
  bar(3,{open:101.1,high:101.6,low:100.8,close:101.2})],
  anchor+3*M+1000);
 assert.equal(after.state,'ACTIVE');
 assert.equal(after.entryAt,anchor+2*M);
 assert.deepEqual(after.hits,[]);
});
test('a missing M5 candle yields unverified evidence, not TP3 or STOP',()=>{
 const r=audit([bar(1),bar(3)],anchor+3*M+1000);
 assert.equal(r.state,'NEEDS_DATA');
 assert.equal(r.finished,false);
 assert.equal(r.hits.length,0);
});
test('DOWN M5 TP and SL orientation remains opposite to UP',()=>{
 const bars=[bar(1,{open:98.8,high:99.1,low:98.6,close:98.8}),
  bar(2,{open:100,high:100.2,low:99.9,close:100}),
  bar(3,{open:98.9,high:99.1,low:97.8,close:98.1}),
  bar(4,{open:97,high:97.4,low:95.8,close:96.1}),
  bar(5,{open:95,high:95.5,low:93.8,close:94.2})];
 const r=audit(bars,anchor+5*M+1000,'DOWN');
 assert.equal(r.outcome,'TP3');
 assert.deepEqual(r.hits.map(x=>x.key),['tp1','tp2','tp3']);
});
test('24h without entry completes as NOT_ENTERED using 288 M5, not 24 H1',()=>{
 const r=audit(Array.from({length:288},(_,i)=>bar(i+1)),anchor+24*H+1000);
 assert.equal(r.outcome,'NOT_ENTERED');
 assert.equal(r.observedBars,288);
 assert.equal(r.finished,true);
});
test('room bridge, M5 native publisher and card routing are all connected',()=>{
 const nativePath='../apex9-android/native/src/main/java/com/apexintelligence/research/';
 const kotlin=readFileSync(new URL(nativePath+'ApexM5Evaluation.kt',import.meta.url),'utf8');
 const auto=readFileSync(new URL(nativePath+'ApexAutoForecast.kt',import.meta.url),'utf8');
 const dir=readFileSync(new URL(nativePath+'ApexDirectionalForecast.kt',import.meta.url),'utf8');
 const plugin=readFileSync(new URL(nativePath+'ApexNativePlugin.kt',import.meta.url),'utf8');
 const pkg=readFileSync(new URL('../apex9-android/scripts/install-native.mjs',import.meta.url),'utf8');
 const bridge=readFileSync(new URL('./mobile-bridge.mjs',import.meta.url),'utf8');
 const cards=readFileSync(new URL('./forecast-directional-card.mjs',import.meta.url),'utf8');
 const favorites=readFileSync(new URL('./favorite-dashboard.mjs',import.meta.url),'utf8');
 assert.ok(auto.includes('ApexM5Evaluation.downloadAndSave(asset, dao, now)'));
 assert.ok(auto.includes('.put("evaluationInterval",ApexM1Evaluation.INTERVAL)'));
 assert.ok(dir.includes('return ApexM5Evaluation.progress('));
 assert.ok(kotlin.includes('interval=5m&limit=$LIMIT'));
 assert.ok(kotlin.includes('for (index in 1..count)'));
 assert.ok(kotlin.includes('terminal = "AMBIGUOUS"'));
 assert.ok(plugin.includes('fun getCandlesWindow(call: PluginCall)'));
 assert.ok(pkg.includes("'ApexM5Evaluation.kt'"));
 assert.ok(bridge.includes('export async function getMobileM5Window('));
 assert.ok(favorites.includes("getMobileM5Window(plan.asset,start,end)"));
 assert.ok(cards.includes('const reader=isM1?sourceM1:isM5?sourceM5:sourceH1'));
 assert.ok(cards.includes("const control=controlMethodLabel(plan?.evaluationInterval)"));
 assert.ok(cards.includes("const sourceFrame=control.frame"));
 assert.ok(cards.includes("control.label+' · '+labelForSide(plan.side)"));
});

test('M5 source window backfill is paged and never creates synthetic candles',()=>{
 const base='../apex9-android/native/src/main/java/com/apexintelligence/research/';
 const read=f=>readFileSync(new URL(base+f,import.meta.url),'utf8');
 const evaluation=read('ApexM5Evaluation.kt');
 const multiframes=read('ApexMultiFrameForecast.kt');
 const h1=read('ApexAutoForecast.kt');
 assert.ok(evaluation.includes('suspend fun ensureWindow('));
 assert.ok(evaluation.includes('val batch = min(LIMIT, count - offset)'));
 assert.ok(evaluation.includes('endTime='));
 assert.ok(evaluation.includes('response.length().toLong() !='));
 assert.ok(evaluation.includes('dao.insertHistoricalCandlesOnce(source)'));
 assert.ok(evaluation.includes('if (pages > 4)'));
 assert.ok(multiframes.includes('ApexM5Evaluation.ensureWindow('));
 assert.ok(h1.includes('ApexM5Evaluation.ensureWindow('));
 assert.ok(evaluation.includes('Skip it entirely'));
});
