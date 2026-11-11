import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {computeReferenceLevels} from './research-level-sequence.mjs';
import {
 DIRECTIONAL_MODEL,DIRECTIONAL_LEVEL_VERSION,planDirectionalScenario,
 auditDirectionalScenario,auditDirectionalM1
} from './directional-scenario.mjs';
const H=3600000,M=60000;
const anchor=1800003599999,publication=anchor+1000;
function row(side='UP',withM1=true){
 const levels=computeReferenceLevels(100,94,106);
 return {id:'direction2:BTCUSDT:1h:'+anchor,asset:'BTCUSDT',interval:'1h',
  publishedAt:publication,status:'PENDING_CONFIRMATION',
  hypothesis:JSON.stringify({
   model:DIRECTIONAL_MODEL,decisionMethod:'SIX_BAR_EFFICIENCY_V1',direction:side,
   anchorCloseAt:anchor,targetCloseAt:anchor+24*H,horizonBars:24,
   anchorClose:100,bandLow:94,bandHigh:106,
   levelStudy:{version:DIRECTIONAL_LEVEL_VERSION,direction:side,entry:100,
    ...levels[side]},
   ...(withM1?{evaluationInterval:'1m',
    observationMethod:'M1_CLOSED_LEVEL_ORDER_V1'}:{})
  })
 };
}
const plan=(side='UP',withM1=true)=>planDirectionalScenario(
 row(side,withM1),{now:publication+10000}).plan;
function bar(i,{open=101.3,high=101.5,low=101.1,close=101.3}={}){
 return {t:anchor+1+(i-1)*M,closeAt:anchor+i*M,
  open,high,low,close,volume:3,closed:true};
}
const entering=bar(2,{open:100.1,high:100.2,low:99.9,close:100.1});
const start=()=>[bar(1),entering];
const audit=(candles,at=anchor+5*M+1000,side='UP')=>
 auditDirectionalScenario(plan(side),candles,{now:at});
test('H1 remains the direction, archived M1 studies retain the evaluation method',()=>{
 const fresh=plan();
 assert.equal(fresh.side,'UP');
 assert.equal(fresh.evaluationInterval,'1m');
 assert.equal(fresh.anchorCloseAt,anchor);
 assert.equal(fresh.targetCloseAt-anchor,24*H);
 const old=plan('UP',false);
 assert.equal(old.evaluationInterval,'1h');
 const altered=row();
 altered.hypothesis=JSON.stringify({
  ...JSON.parse(altered.hypothesis),observationMethod:'FAKE'});
 assert.equal(planDirectionalScenario(altered,{now:publication+10000}).state,'INVALID');
});
test('M1 progression is chronological and nested TP1, TP2, TP3 are not H1 guesses',()=>{
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
 assert.match(r.note,/M1/);
});
test('M1 SL first receives no unobserved TP credit',()=>{
 const r=audit([...start(),
  bar(3,{open:100,high:101,low:97.8,close:99})],
  anchor+3*M+1000);
 assert.equal(r.outcome,'STOP');
 assert.deepEqual(r.hits,[]);
});
test('SL and a newly reached TP in the same M1 are indeterminate',()=>{
 const r=audit([...start(),
  bar(3,{open:100,high:103,low:97.7,close:101})],anchor+3*M+1000);
 assert.equal(r.outcome,'AMBIGUOUS');
 assert.equal(r.hits.length,0);
 assert.match(r.reason,/одной M1/);
});
test('entry plus TP1 in a single completed M1 is never credited as a win',()=>{
 const r=audit([bar(1),
  bar(2,{open:100.1,high:103,low:99.9,close:102})],anchor+2*M+1000);
 assert.equal(r.outcome,'AMBIGUOUS');
 assert.deepEqual(r.hits,[]);
});
test('partly pre-publication M1 is skipped, not fabricated ambiguous',()=>{
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
test('a missing M1 candle yields unverified evidence, not TP3 or STOP',()=>{
 const r=audit([bar(1),bar(3)],anchor+3*M+1000);
 assert.equal(r.state,'NEEDS_DATA');
 assert.equal(r.finished,false);
 assert.equal(r.hits.length,0);
});
test('DOWN M1 TP and SL orientation remains opposite to UP',()=>{
 const bars=[bar(1,{open:98.8,high:99.1,low:98.6,close:98.8}),
  bar(2,{open:100,high:100.2,low:99.9,close:100}),
  bar(3,{open:98.9,high:99.1,low:97.8,close:98.1}),
  bar(4,{open:97,high:97.4,low:95.8,close:96.1}),
  bar(5,{open:95,high:95.5,low:93.8,close:94.2})];
 const r=audit(bars,anchor+5*M+1000,'DOWN');
 assert.equal(r.outcome,'TP3');
 assert.deepEqual(r.hits.map(x=>x.key),['tp1','tp2','tp3']);
});
test('24h without entry completes as NOT_ENTERED using 1440 M1, not 24 H1',()=>{
 const r=audit(Array.from({length:1440},(_,i)=>bar(i+1)),anchor+24*H+1000);
 assert.equal(r.outcome,'NOT_ENTERED');
 assert.equal(r.observedBars,1440);
 assert.equal(r.finished,true);
});

test('M1 is deployed in native, bridge and chart without recasting M5',()=>{
 const base='../apex9-android/native/src/main/java/com/apexintelligence/research/';
 const read=f=>readFileSync(new URL(base+f,import.meta.url),'utf8');
 const kotlin=read('ApexM1Evaluation.kt');
 const auto=read('ApexAutoForecast.kt');
 const multi=read('ApexMultiFrameForecast.kt');
 const pkg=readFileSync(new URL('../apex9-android/scripts/install-native.mjs',import.meta.url),'utf8');
 const plugin=read('ApexNativePlugin.kt');
 const bridge=readFileSync(new URL('./mobile-bridge.mjs',import.meta.url),'utf8');
 const chart=readFileSync(new URL('./candle-chart.mjs',import.meta.url),'utf8');
 assert.ok(kotlin.includes('interval=1m&limit=$LIMIT'));
 assert.ok(kotlin.includes('const val STEP = 60_000L'));
 assert.ok(kotlin.includes('if (pages > 16)'));
 assert.ok(auto.includes('.put("evaluationInterval",ApexM1Evaluation.INTERVAL)'));
 assert.ok(multi.includes('.put("observationMethod",ApexM1Evaluation.METHOD)'));
 assert.ok(plugin.includes('"1m" to 60_000L'));
 assert.ok(pkg.includes("'ApexM1Evaluation.kt'"));
 assert.ok(bridge.includes('export async function getMobileM1Window('));
 assert.ok(chart.includes("this.interval==='1m'&&sc.evaluationInterval==='1m'"));
});
