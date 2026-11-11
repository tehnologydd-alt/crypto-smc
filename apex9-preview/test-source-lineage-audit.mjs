import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {computeReferenceLevels} from './research-level-sequence.mjs';
import {auditPublishedSourceLineage,SOURCE_LINEAGE_VERSION}
 from './source-lineage-audit.mjs';

const STEP=900000;
const T0=Date.UTC(2026,10,11,11,0,0);
const start=Math.floor((T0-22*STEP)/STEP)*STEP-1;
const levels=computeReferenceLevels(100,
 Number((100*Math.exp(-.04)).toPrecision(13)),
 Number((100*Math.exp(.04)).toPrecision(13))).UP;
const feeds=['market','liquidity','onchain','news','macro','social'];
const frames=['15m','1h','4h','1d'];
function row(i,{method='M1',legacy=false,invalid=false}={}){
 const anchor=start+i*20*STEP,publishedAt=anchor+2000;
 const snapshot={version:'AS_OF_ROOM_EVIDENCE_V1',capturedAt:publishedAt,
  policy:'DESCRIPTIVE_CONTEXT_ONLY_NO_FUTURE_LEAKAGE',
  feeds:Object.fromEntries(feeds.map(f=>[f,{state:'MISSING'}])),
  radar:Object.fromEntries(frames.map(f=>[f,{state:'MISSING'}]))};
 snapshot.feeds.market={state:'OBSERVED',source:'binance:spot:24h',
  observedAt:publishedAt-1000,collectedAt:publishedAt-1000,ageMs:1000,
  features:{price:100,quoteVolume24h:12000,changePercent24h:1.2,
   scope:'SPOT_24H_TICKER'}};
 snapshot.feeds.liquidity={state:'STALE',source:'bybit:spot:depth',
  observedAt:publishedAt-7*60000,collectedAt:publishedAt-7*60000,
  ageMs:7*60000,
  features:{spreadBps:4,visibleDepthImbalance:.2,
   scope:'LIMITED_PUBLIC_ORDERBOOK_NOT_HIDDEN_LIQUIDITY'}};
 snapshot.radar['15m']={state:'OBSERVED',source:'ANDROID_NATIVE_RADAR',
  candleAt:anchor,observedAt:publishedAt,direction:'UP',mode:'DIRECTIONAL',
  movement:.2,acceleration:.03,volumeRatio:1.1};
 const h={model:'EMPIRICAL_MULTIFRAME_DIRECTION_V1',interval:'15m',
  evaluationInterval:method==='M1'?'1m':'5m',
  observationMethod:method==='M1'?'M1_CLOSED_LEVEL_ORDER_V1':'M5_CLOSED_LEVEL_ORDER_V1',
  stageSemantics:method==='M1'?'M1_CLOSED_LIMIT_V1':'M5_CLOSED_LIMIT_V2',
  decisionMethod:'SIX_BAR_EFFICIENCY_V1',
  direction:'UP',anchorCloseAt:anchor,anchorClose:100,targetCloseAt:anchor+16*STEP,
  horizonBars:16,sampleBars:96,empiricalSamples:92,historicalPercentile:.8,
  empiricalWidth:.04,
  levelStudy:{entry:100,...levels,version:'MULTIFRAME_SINGLE_LEVELS_V1',
   direction:'UP'},contextAsPublished:{},evidenceAsPublished:snapshot};
 if(legacy)delete h.evidenceAsPublished;
 if(invalid)h.evidenceAsPublished.feeds.market.observedAt=publishedAt+1;
 return {asset:'BTCUSDT',id:'direction3:BTCUSDT:15m:'+anchor,
  interval:'15m',publishedAt,hypothesis:h,stageEvents:[],
  status:'PENDING_CONFIRMATION'};
}
const asArchive=forecasts=>({complete:true,publishedCount:forecasts.length,forecasts});
test('published M1 and archived M5 cases both retain original source lineage',()=>{
 const x=auditPublishedSourceLineage(asArchive([row(0),row(1,{method:'M5'})]),
  {asset:'BTCUSDT',now:T0});
 assert.equal(x.version,SOURCE_LINEAGE_VERSION);
 assert.equal(x.state,'OBSERVED');
 const m=x.frames['15m'];
 assert.equal(m.published,2);assert.equal(m.verified,2);
 assert.equal(m.feeds.market.observed,2);
 assert.equal(m.feeds.liquidity.stale,2);
 assert.equal(m.feeds.news.missing,2);
 assert.equal(m.radar['15m'].observed,2);
 assert.deepEqual(m.providers.map(p=>[p.source,p.observed,p.stale]),[
  ['bybit:spot:depth',0,2],['binance:spot:24h',2,0]
 ]);
 assert.equal(x.frames['4h'].published,0);
 assert.equal(JSON.stringify(x).includes('availabilityPercent'),false);
 assert.equal(JSON.stringify(x).includes('accuracy'),false);
});
test('legacy context and invalid future observation cannot be treated as verified',()=>{
 const result=auditPublishedSourceLineage(asArchive([
  row(0,{legacy:true}),row(1,{invalid:true})]),{asset:'BTCUSDT',now:T0});
 const f=result.frames['15m'];
 assert.equal(f.published,2);
 assert.equal(f.legacy,1);
 assert.equal(f.invalid,1);
 assert.equal(f.verified,0);
 assert.equal(f.providers.length,0);
 assert.equal(result.state,'COLLECTING');
});
test('incomplete, duplicate, cross-asset and future archives fail closed',()=>{
 const old=row(0);
 assert.equal(auditPublishedSourceLineage({...asArchive([old]),complete:false},
  {asset:'BTCUSDT',now:T0}).state,'INCOMPLETE');
 assert.equal(auditPublishedSourceLineage(asArchive([old,old]),
  {asset:'BTCUSDT',now:T0}).state,'INVALID');
 assert.equal(auditPublishedSourceLineage(asArchive([old]),
  {asset:'ETHUSDT',now:T0}).state,'INVALID');
 assert.equal(auditPublishedSourceLineage(asArchive([
  {...old,publishedAt:T0+120000}]),{asset:'BTCUSDT',now:T0}).state,'INVALID');
});
test('Android background ticker schema matches the immutable native and web contracts',()=>{
 const root=new URL('../apex9-android/native/src/main/java/com/apexintelligence/research/',import.meta.url);
 const worker=readFileSync(new URL('ApexSyncWorker.kt',root),'utf8');
 const evidence=readFileSync(new URL('ApexEvidenceContext.kt',root),'utf8');
 const bridge=readFileSync(new URL('./mobile-bridge.mjs',import.meta.url),'utf8');
 for(const field of ['price','changePercent24h','quoteVolume']){
  assert.ok(worker.includes('.put("'+field+'",'),field+' absent from worker');
  assert.ok(evidence.includes('number(json,"'+field+'")'),field+' absent from native context');
  assert.ok(bridge.includes(field+':'),field+' absent from bridge payload');
 }
 assert.ok(worker.includes('quoteVolume <= 0'));
 assert.equal(worker.includes('.put("priceChangePercent24h",'),false);
});
