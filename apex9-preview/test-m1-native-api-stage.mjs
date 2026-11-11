import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {computeReferenceLevels} from './research-level-sequence.mjs';
import {auditM1Cohort,M1_COHORT_RULES} from './forecast-m1-cohort.mjs';
import {saveSourceCohortSummary,readSourceCohortSummary}
 from './source-cohort-summary.mjs';

const TF=900000, M1=60000;
const T0=Date.UTC(2026,10,12,0,0,0);
const START=Math.floor(T0/TF)*TF-1;
const now=T0+160*17*TF;
const levels=computeReferenceLevels(100,
 Number((100*Math.exp(-.04)).toPrecision(13)),
 Number((100*Math.exp(.04)).toPrecision(13))).UP;
const frames=['15m','1h','4h','1d'];
const feeds=['market','liquidity','onchain','news','macro','social'];
function make(i,{method='M1',finish='TP3',aligned=true}={}){
 const anchor=START+i*17*TF,publishedAt=anchor+2000;
 const targetCloseAt=anchor+16*TF;
 const candleStep=method==='M1'?M1:300000;
 const event=(stage,minute)=>({stage,observedAt:anchor+minute*candleStep,
  recordedAt:anchor+minute*candleStep+1000});
 const finished=[event('LIMIT_READY',1),event('CONFIRMED',2)];
 if(finish==='TP3')finished.push(event('TP1',3),event('TP2',4),event('TP3',5));
 else finished.push(event('SL',5));
 finished.push(event('COMPLETED',5));
 const radar=Object.fromEntries(frames.map(f=>[f,{state:'MISSING'}]));
 radar['15m']={state:'OBSERVED',source:'ANDROID_NATIVE_RADAR',candleAt:anchor,
  observedAt:publishedAt,direction:aligned?'UP':'DOWN',
  mode:'DIRECTIONAL',movement:.1,acceleration:.05,volumeRatio:1.1};
 const kinds=Object.fromEntries(feeds.map(f=>[f,{state:'MISSING'}]));
 kinds.market={state:'OBSERVED',source:'binance:spot:24h',
  observedAt:publishedAt-1000,collectedAt:publishedAt-1000,ageMs:1000,
  features:{price:100,changePercent24h:aligned?1:-1,quoteVolume24h:12000,
   scope:'SPOT_24H_TICKER'}};
 return {asset:'ETHUSDT',interval:'15m',publishedAt,
  id:'direction3:ETHUSDT:15m:'+anchor,status:'COMPLETED',
  hypothesis:{model:'EMPIRICAL_MULTIFRAME_DIRECTION_V1',interval:'15m',
   evaluationInterval:method==='M1'?'1m':'5m',
   observationMethod:method==='M1'?
    'M1_CLOSED_LEVEL_ORDER_V1':'M5_CLOSED_LEVEL_ORDER_V1',
   stageSemantics:method==='M1'?'M1_CLOSED_LIMIT_V1':'M5_CLOSED_LIMIT_V2',
   decisionMethod:'SIX_BAR_EFFICIENCY_V1',
   direction:'UP',anchorCloseAt:anchor,anchorClose:100,targetCloseAt,
   horizonBars:16,sampleBars:96,empiricalSamples:92,historicalPercentile:.8,
   empiricalWidth:.04,contextAsPublished:{},
   levelStudy:{entry:100,...levels,version:'MULTIFRAME_SINGLE_LEVELS_V1',
    direction:'UP'},
   evidenceAsPublished:{version:'AS_OF_ROOM_EVIDENCE_V1',capturedAt:publishedAt,
    policy:'DESCRIPTIVE_CONTEXT_ONLY_NO_FUTURE_LEAKAGE',feeds:kinds,radar}},
  stageEvents:finished,evaluation:{outcome:finish,targetCloseAt,
   actualClose:finish==='TP3'?110:90,
   evaluatedAt:anchor+5*candleStep+2000}};
}
const archive=rows=>({complete:true,publishedCount:rows.length,forecasts:rows});
const storage=()=>{const d=new Map();return{getItem:k=>d.get(k)||null,
 setItem:(k,v)=>d.set(k,String(v)),data:d}};
test('M1 experimental chronology stays distinct from archived M5 publications',()=>{
 const rows=Array.from({length:90},(_,i)=>
  make(i,{aligned:i%2===0,finish:i%3===0?'STOP':'TP3'}));
 rows.push(make(92,{method:'M5'}));
 const result=auditM1Cohort(archive(rows),{asset:'ETHUSDT',now});
 assert.equal(result.frames['15m'].publishedM1,90);
 assert.equal(result.legacyM5['15m'],1);
 assert.equal(result.frames['15m'].reference.published,54);
 assert.equal(result.frames['15m'].holdout.published,36);
 assert.equal(result.frames['15m'].reference.decisive,54);
 assert.equal(result.frames['15m'].holdout.decisive,36);
 assert.equal(result.frames['15m'].reference.verified,54);
 assert.equal(result.frames['15m'].reference.invalid,0);
 assert.equal(result.frames['15m'].comparison.length,4);
 assert.equal(result.frames['15m'].comparison.find(x=>x.id==='sameRadar').state,
  'DESCRIPTIVE');
 assert.equal(result.rules.noTraining,true);
 assert.equal(result.rules.calibratedProbability,null);
});
test('M1 scores cannot be backfilled, attributed to future news or mixed with M5',()=>{
 const m1=make(0),m5=make(1,{method:'M5'});
 m1.hypothesis.evidenceAsPublished.feeds.market.observedAt=m1.publishedAt+2000;
 const output=auditM1Cohort(archive([m1,m5]),{asset:'ETHUSDT',now});
 assert.equal(output.frames['15m'].publishedM1,1);
 assert.equal(output.legacyM5['15m'],1);
 assert.equal(output.frames['15m'].state,'COLLECTING');
 assert.equal(M1_COHORT_RULES.noBackfill,true);
});
test('one bounded source summary per asset uses no network or raw historical values',()=>{
 const rows=[make(0),make(1,{method:'M5'})];
 const store=storage();
 assert.equal(saveSourceCohortSummary(archive(rows),'ETHUSDT',
  {now,storage:store}),true);
 const report=readSourceCohortSummary('ETHUSDT',{now,storage:store});
 assert.equal(report.frames['15m'].m1Published,1);
 assert.equal(report.frames['15m'].m5Archived,1);
 assert.equal(report.frames['15m'].verifiedSources,2);
 assert.equal(report.frames['15m'].providers.some(x=>x.source==='binance:spot:24h'),true);
 assert.equal(report.frames['15m'].providers.some(x=>x.source==='fake'),false);
 assert.equal(readSourceCohortSummary('BTCUSDT',{now,storage:store}),null);
 assert.equal(saveSourceCohortSummary({...archive(rows),complete:false},
  'ETHUSDT',{now,storage:store}),false);
 const raw=[...store.data.values()].join('');
 assert.equal(raw.includes('stageEvents'),false);
 assert.equal(raw.includes('actualClose'),false);
 assert.equal(raw.includes('apiKey'),false);
});
test('all native request paths share the same bounded ledger; UI does not poll API',()=>{
 const root=new URL('../apex9-android/native/src/main/java/com/apexintelligence/research/',import.meta.url);
 const native=p=>readFileSync(new URL(p,root),'utf8');
 const names=['ApexSyncWorker.kt','ApexAutoForecast.kt',
  'ApexM1Evaluation.kt','ApexM5Evaluation.kt','ApexRadarMonitor.kt'];
 for(const file of names)
  assert.ok(native(file).includes('ApexApiLedger.observe('),file);
 const ledger=native('ApexApiLedger.kt');
 for(const phrase of ['MAX_PER_LANE = 120','MAX_LANES = 20',
  'MAX_AGE = 30L','RATE_LIMITED','ACCESS_DENIED','providerAt']){
  assert.ok(ledger.includes(phrase),phrase);
 }
 assert.ok(native('ApexNativePlugin.kt').includes('fun getApiReliability('));
 const bridge=readFileSync(new URL('./mobile-bridge.mjs',import.meta.url),'utf8');
 const screen=readFileSync(new URL('./free-source-dashboard.mjs',import.meta.url),'utf8');
 const automatic=readFileSync(new URL('./automatic-decision-quality.mjs',import.meta.url),'utf8');
 assert.ok(bridge.includes('export async function getMobileApiReliability()'));
 assert.ok(screen.includes('refreshNativeLedger()'));
 assert.ok(screen.includes('readSourceCohortSummary('));
 assert.ok(automatic.includes('saveSourceCohortSummary(archive,asset'));
 const nativeStage=readFileSync(new URL('../apex9-android/scripts/install-native.mjs',
  import.meta.url),'utf8');
 const webStage=readFileSync(new URL('../apex9-android/scripts/prepare-web.mjs',
  import.meta.url),'utf8');
 assert.ok(nativeStage.includes("'ApexApiLedger.kt'"));
 for(const name of ['forecast-m1-cohort.mjs','source-cohort-summary.mjs'])
  assert.ok(webStage.includes("'"+name+"'"));
});
