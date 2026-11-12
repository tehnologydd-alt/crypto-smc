import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {computeReferenceLevels} from './research-level-sequence.mjs';
import {EVIDENCE_VERSION,inspectEvidenceContext,evidenceCohorts,
 EVIDENCE_FEEDS,EVIDENCE_FRAMES} from './forecast-evidence-context.mjs';

const STEP=900000;
const anchor=Math.floor(1760000000000/STEP)*STEP-1;
const publishedAt=anchor+2000;
const round=n=>Number(n.toPrecision(13));
function snapshot(at=publishedAt){
 return {version:EVIDENCE_VERSION,capturedAt:at,
  policy:'DESCRIPTIVE_CONTEXT_ONLY_NO_FUTURE_LEAKAGE',
  feeds:Object.fromEntries(EVIDENCE_FEEDS.map(x=>[x,{state:'MISSING'}])),
  radar:Object.fromEntries(EVIDENCE_FRAMES.map(x=>[x,{state:'MISSING'}]))};
}
function row(){
 const entry=100,width=.04;
 const low=round(entry*Math.exp(-width));
 const high=round(entry*Math.exp(width));
 const levels=computeReferenceLevels(entry,low,high)?.UP;
 const hypothesis={
  model:'EMPIRICAL_MULTIFRAME_DIRECTION_V1',interval:'15m',
  evaluationInterval:'15m',decisionMethod:'SIX_BAR_EFFICIENCY_V1',
  stageSemantics:'SAME_FRAME_LIMIT_V1',direction:'UP',
  anchorCloseAt:anchor,anchorClose:entry,
  targetCloseAt:anchor+16*STEP,horizonBars:16,
  historicalPercentile:.8,empiricalSamples:92,sampleBars:96,
  empiricalWidth:width,
  levelStudy:{version:'MULTIFRAME_SINGLE_LEVELS_V1',direction:'UP',
   entry,...levels},
  contextAsPublished:{},evidenceAsPublished:snapshot()
 };
 return {asset:'BTCUSDT',interval:'15m',publishedAt,
  id:'direction3:BTCUSDT:15m:'+anchor,hypothesis,
  stageEvents:[],status:'PENDING_CONFIRMATION'};
}
const now=anchor+20*STEP;
test('new independent M15 and H4 research uses immutable evidence context',()=>{
 const r=row();
 assert.equal(inspectEvidenceContext(r).state,'VERIFIED');
 const cohort=evidenceCohorts([r],{now});
 assert.equal(cohort['15m'].published,1);
 assert.equal(cohort['15m'].verified,1);
 assert.equal(cohort['15m'].feeds.market.missing,1);
 assert.equal(cohort['15m'].completed,0);
 assert.equal(cohort['1h'].published,0);
});
test('legacy records never gain retrospectively reconstructed evidence',()=>{
 const r=row();
 delete r.hypothesis.evidenceAsPublished;
 assert.equal(inspectEvidenceContext(r).state,'LEGACY');
 assert.equal(evidenceCohorts([r],{now})['15m'].legacy,1);
});
test('future-captured, future-collected and manipulated age are invalid',()=>{
 const r=row();
 r.hypothesis.evidenceAsPublished.capturedAt=publishedAt+1;
 assert.equal(inspectEvidenceContext(r).state,'INVALID');
 r.hypothesis.evidenceAsPublished.capturedAt=publishedAt;
 r.hypothesis.evidenceAsPublished.feeds.market={
  state:'OBSERVED',source:'binance:spot:24h',
  observedAt:publishedAt-2000,collectedAt:publishedAt+1000,ageMs:-1000,
  features:{scope:'SPOT_24H_TICKER',price:100,
   quoteVolume24h:20000,changePercent24h:1}
 };
 assert.equal(inspectEvidenceContext(r).state,'INVALID');
 r.hypothesis.evidenceAsPublished.feeds.market.collectedAt=publishedAt-500;
 r.hypothesis.evidenceAsPublished.feeds.market.ageMs=499;
 assert.equal(inspectEvidenceContext(r).state,'INVALID');
});
test('stale is not fresh, missing is not offline, order-book not whale evidence',()=>{
 const r=row();
 const age=9*60000;
 r.hypothesis.evidenceAsPublished.feeds.liquidity={
  state:'STALE',source:'bybit:spot:depth',
  observedAt:publishedAt-age,collectedAt:publishedAt-age,ageMs:age,
  features:{scope:'LIMITED_PUBLIC_ORDERBOOK_NOT_HIDDEN_LIQUIDITY',
   spreadBps:4.1,visibleDepthImbalance:0.25}
 };
 assert.equal(inspectEvidenceContext(r).state,'VERIFIED');
 r.hypothesis.evidenceAsPublished.feeds.liquidity.state='OBSERVED';
 assert.equal(inspectEvidenceContext(r).state,'INVALID');
 r.hypothesis.evidenceAsPublished.feeds.liquidity.state='STALE';
 r.hypothesis.evidenceAsPublished.feeds.news={
  state:'OBSERVED',source:'gdelt',observedAt:publishedAt-1000,
  collectedAt:publishedAt-1000,ageMs:1000,
  features:{scope:'UNVERIFIED_CONTEXT_METADATA_ONLY'}
 };
 assert.equal(inspectEvidenceContext(r).state,'VERIFIED');
});
test('native collection is timestamp gated and never fuses into direction',()=>{
 const root=new URL('../apex9-android/native/src/main/java/com/apexintelligence/research/',import.meta.url);
 const ctx=readFileSync(new URL('ApexEvidenceContext.kt',root),'utf8');
 const h1=readFileSync(new URL('ApexAutoForecast.kt',root),'utf8');
 const m=readFileSync(new URL('ApexMultiFrameForecast.kt',root),'utf8');
 const install=readFileSync(new URL('../apex9-android/scripts/install-native.mjs',import.meta.url),'utf8');
 const web=readFileSync(new URL('../apex9-android/scripts/prepare-web.mjs',import.meta.url),'utf8');
 for(const keyword of ['row.collectedAt<=at','row.observedAt<=at',
  'row.sourceState=="OK"','"MISSING"','"STALE"','"OBSERVED"',
  'ApexRadarMonitor.read','"onchain"','"liquidity"','"news"']){
  assert.ok(ctx.includes(keyword),'Missing causal guard '+keyword);
 }
 assert.ok(h1.includes('ApexEvidenceContext.capture(context,dao,asset,now)'));
 assert.ok(m.includes('ApexEvidenceContext.capture(context,dao,asset,now)'));
 assert.ok(install.includes("'ApexEvidenceContext.kt'"));
 assert.ok(web.includes("'forecast-evidence-context.mjs'"));
 assert.ok(!ctx.includes('calibratedProbability'));
});

test('OKX Spot liquidity is validated and kept as immutable publication-time context',()=>{
 const r=row();
 r.hypothesis.evidenceAsPublished.feeds.liquidity={
  state:'OBSERVED',source:'okx:spot:depth',
  observedAt:publishedAt-1000,collectedAt:publishedAt-1000,ageMs:1000,
  features:{scope:'LIMITED_PUBLIC_ORDERBOOK_NOT_HIDDEN_LIQUIDITY',
   spreadBps:3,visibleDepthImbalance:-.2}
 };
 assert.equal(inspectEvidenceContext(r).state,'VERIFIED');
 const native=readFileSync(new URL('../apex9-android/native/src/main/java/com/apexintelligence/research/ApexEvidenceContext.kt',import.meta.url),'utf8');
 assert.match(native,/row.source!="okx:spot:depth"/);
 r.hypothesis.evidenceAsPublished.feeds.liquidity.features.visibleDepthImbalance=1.2;
 assert.equal(inspectEvidenceContext(r).state,'INVALID');
});
