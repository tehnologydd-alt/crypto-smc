import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {computeReferenceLevels} from './research-level-sequence.mjs';
import {inspectEvidenceContext,EVIDENCE_VERSION,EVIDENCE_VERSION_V2,
 EVIDENCE_FEEDS,EVIDENCE_FRAMES,EVIDENCE_MAX_SOURCES_PER_KIND}
 from './forecast-evidence-context.mjs';
import {auditPublishedSourceLineage} from './source-lineage-audit.mjs';
import {saveSourceCohortSummary,readSourceCohortSummary}
 from './source-cohort-summary.mjs';

const STEP=900000;
const NOW=Date.UTC(2026,10,11,16,0,0);
const ANCHOR=Math.floor((NOW-27*STEP)/STEP)*STEP-1;
const levels=computeReferenceLevels(100,
 Number((100*Math.exp(-.04)).toPrecision(13)),
 Number((100*Math.exp(.04)).toPrecision(13))).UP;
const copy=x=>structuredClone(x);
function feed(state,source,age,features,at){
 return {state,source,observedAt:at-age,collectedAt:at-age,
  ageMs:age,features};
}
function published(index=0,{v2=true}={}){
 const anchor=ANCHOR+index*17*STEP,publishedAt=anchor+2000;
 const f=Object.fromEntries(EVIDENCE_FEEDS.map(x=>[x,{state:'MISSING'}]));
 const r=Object.fromEntries(EVIDENCE_FRAMES.map(x=>[x,{state:'MISSING'}]));
 const ticker=feed('OBSERVED','binance:spot:24h',500,
  {price:100,changePercent24h:1.7,quoteVolume24h:12500,
   scope:'SPOT_24H_TICKER'},publishedAt);
 const binance=feed('OBSERVED','binance:spot:depth',1000,
  {spreadBps:5.1,visibleDepthImbalance:.3,
   scope:'LIMITED_PUBLIC_ORDERBOOK_NOT_HIDDEN_LIQUIDITY'},publishedAt);
 const bybit=feed('OBSERVED','bybit:spot:depth',2000,
  {spreadBps:6.2,visibleDepthImbalance:-.2,
   scope:'LIMITED_PUBLIC_ORDERBOOK_NOT_HIDDEN_LIQUIDITY'},publishedAt);
 const onchain=feed('OBSERVED','mempool:bitcoin:network',10000,
  {mempoolCount:1000,mempoolVBytes:333333,
   scope:'BITCOIN_NETWORK_NOT_WHALES'},publishedAt);
 const news=feed('OBSERVED','gdelt:news',3000,
  {scope:'UNVERIFIED_CONTEXT_METADATA_ONLY'},publishedAt);
 f.market=ticker;f.liquidity=binance;f.onchain=onchain;f.news=news;
 r['15m']={state:'OBSERVED',source:'ANDROID_NATIVE_RADAR',
  candleAt:anchor,observedAt:publishedAt,mode:'DIRECTIONAL',direction:'UP',
  movement:.2,acceleration:.03,volumeRatio:1.1};
 const ctx={version:v2?EVIDENCE_VERSION_V2:EVIDENCE_VERSION,
  capturedAt:publishedAt,policy:'DESCRIPTIVE_CONTEXT_ONLY_NO_FUTURE_LEAKAGE',
  feeds:f,radar:r};
 if(v2)ctx.sources=Object.fromEntries(EVIDENCE_FEEDS.map(kind=>[kind,
  (kind==='market'?[ticker]:kind==='liquidity'?[binance,bybit]:
   kind==='onchain'?[onchain]:kind==='news'?[news]:[]).map(i=>({
    ...copy(i),clockBasis:kind==='market'?'EXCHANGE_CLOSE':
     'OBSERVATION_RECORD_TIME'}))]));
 const row={asset:'BTCUSDT',interval:'15m',publishedAt,
  id:'direction3:BTCUSDT:15m:'+anchor,
  status:'PENDING_CONFIRMATION',stageEvents:[],
  hypothesis:{model:'EMPIRICAL_MULTIFRAME_DIRECTION_V1',interval:'15m',
   decisionMethod:'SIX_BAR_EFFICIENCY_V1',
   stageSemantics:'M1_CLOSED_LIMIT_V1',
   observationMethod:'M1_CLOSED_LEVEL_ORDER_V1',evaluationInterval:'1m',
   direction:'UP',anchorCloseAt:anchor,anchorClose:100,
   targetCloseAt:anchor+16*STEP,horizonBars:16,sampleBars:96,
   empiricalSamples:92,historicalPercentile:.8,empiricalWidth:.04,
   levelStudy:{entry:100,...levels,version:'MULTIFRAME_SINGLE_LEVELS_V1',
    direction:'UP'},contextAsPublished:{},evidenceAsPublished:ctx}};
 return row;
}
function archive(rows){return {complete:true,publishedCount:rows.length,forecasts:rows}}
function invalid(change){
 const row=published();change(row.hypothesis.evidenceAsPublished);
 assert.equal(inspectEvidenceContext(row).state,'INVALID');
}
test('V2 frozen snapshots validate two independent spot depth providers',()=>{
 const row=published(),result=inspectEvidenceContext(row);
 assert.equal(result.state,'VERIFIED');
 assert.equal(result.version,EVIDENCE_VERSION_V2);
 assert.deepEqual(result.sources.liquidity.map(x=>x.source),
  ['binance:spot:depth','bybit:spot:depth']);
 assert.equal(result.feeds.liquidity.source,result.sources.liquidity[0].source);
 assert.equal(result.sources.market[0].clockBasis,'EXCHANGE_CLOSE');
 assert.equal(result.sources.news[0].features.scope,
  'UNVERIFIED_CONTEXT_METADATA_ONLY');
 assert.equal(EVIDENCE_MAX_SOURCES_PER_KIND,3);
});
test('V2 rejects future, duplicate, unsorted, wrong source and fake clock',()=>{
 invalid(x=>{x.sources.liquidity[1].collectedAt=x.capturedAt+1});
 invalid(x=>{x.sources.liquidity[1].source='binance:spot:depth'});
 invalid(x=>{x.sources.liquidity.reverse()});
 invalid(x=>{x.sources.liquidity[1].clockBasis='EXCHANGE_CLOSE'});
 invalid(x=>{x.sources.market[0].clockBasis='EXCHANGE_CLOSE_UNVERIFIED'});
 invalid(x=>{x.sources.liquidity[1].features.scope='FULL_MARKET_LIQUIDITY'});
 invalid(x=>{x.sources.news[0].features.impactScore=1});
 invalid(x=>{x.sources.liquidity.push(copy(x.sources.liquidity[0]),
  copy(x.sources.liquidity[1]))});
 invalid(x=>{x.sources.social=[{state:'MISSING'}]});
 invalid(x=>{delete x.sources.social});
 invalid(x=>{x.sources.onchain[0].features.mempoolCount=-3});
});
test('V2 rejects primary-feed discrepancies and tampered source freshness',()=>{
 invalid(x=>{x.feeds.liquidity.source='bybit:spot:depth'});
 invalid(x=>{x.feeds.liquidity.features.spreadBps=999});
 invalid(x=>{x.sources.market[0].ageMs+=5});
 invalid(x=>{x.sources.liquidity[1].state='STALE'});
 invalid(x=>{x.sources.liquidity[1].source='evil.example/<script>'});
 invalid(x=>{x.sources.liquidity[0].features.spreadBps=Number.POSITIVE_INFINITY});
});
test('legacy V1 remains readable without retroactive providers',()=>{
 const row=published(0,{v2:false});
 const result=inspectEvidenceContext(row);
 assert.equal(result.state,'VERIFIED');
 assert.equal(result.version,EVIDENCE_VERSION);
 assert.equal(result.sources,null);
 assert.equal('sources' in row.hypothesis.evidenceAsPublished,false);
});
test('lineage and cached summary count both V2 providers without double-counting V1',()=>{
 const rows=[published(0,{v2:false}),published(1)];
 const report=auditPublishedSourceLineage(archive(rows),
  {asset:'BTCUSDT',now:NOW});
 assert.equal(report.state,'OBSERVED');
 const s=report.frames['15m'];
 assert.equal(s.verified,2);
 assert.equal(s.v1Verified,1);
 assert.equal(s.v2Verified,1);
 assert.equal(s.multiProviderForecasts,1);
 const bin=s.providers.find(p=>p.source==='binance:spot:depth');
 const byt=s.providers.find(p=>p.source==='bybit:spot:depth');
 assert.equal(bin.observed,2);
 assert.equal(byt.observed,1);
 const data=new Map(),storage={getItem:k=>data.get(k)||null,
  setItem:(k,v)=>data.set(k,String(v))};
 assert.equal(saveSourceCohortSummary(archive(rows),'BTCUSDT',
  {now:NOW,storage}),true);
 const saved=readSourceCohortSummary('BTCUSDT',{now:NOW,storage});
 assert.equal(saved.frames['15m'].sourceV1,1);
 assert.equal(saved.frames['15m'].sourceV2,1);
 assert.equal(saved.frames['15m'].multiProviderForecasts,1);
 assert.equal([...data.values()].join('').includes('mempoolVBytes'),false);
});
test('native V2 capture is bounded, immutable, whitelisted, and no DB migration',()=>{
 const root=new URL('../apex9-android/native/src/main/java/com/apexintelligence/research/',import.meta.url);
 const native=p=>readFileSync(new URL(p,root),'utf8');
 const kotlin=native('ApexEvidenceContext.kt');
 const db=native('ApexDatabase.kt');
 for(const phrase of ['AS_OF_ROOM_EVIDENCE_V2','MAX_PER_KIND = 3',
  '.distinctBy{it.first.source}','SOURCE_ID.matches',
  '.put("sources",JSONObject())','.put("clockBasis",clock)',
  'sources.put(kind,records)','validTimes(it,asset,at)'])
  assert.ok(kotlin.includes(phrase),phrase);
 assert.ok(kotlin.includes('ApexRadarMonitor.read(context,listOf(asset))'));
 assert.ok(db.includes('research_forecasts'));
 assert.equal(kotlin.includes('apiKey'),false);
});
