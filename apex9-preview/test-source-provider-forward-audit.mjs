import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {computeReferenceLevels} from './research-level-sequence.mjs';
import {auditProviderForwardValue,PROVIDER_FORWARD_REGISTRATION,
 PROVIDER_FORWARD_RULES,PROVIDER_FORWARD_TESTS}
 from './source-provider-forward-audit.mjs';
import {saveSourceCohortSummary,readSourceCohortSummary}
 from './source-cohort-summary.mjs';

const STEP=900000,M1=60000,START=Math.floor(
 Date.UTC(2026,10,14,0)/STEP)*STEP-1;
const NOW=Date.UTC(2026,11,1,0);
const levels=computeReferenceLevels(100,
 Number((100*Math.exp(-.04)).toPrecision(13)),
 Number((100*Math.exp(.04)).toPrecision(13))).UP;
const feeds=['market','liquidity','onchain','news','macro','social'];
const radarFrames=['15m','1h','4h','1d'];
const clone=x=>structuredClone(x);
const save=forecasts=>({complete:true,publishedCount:forecasts.length,forecasts});
function snap(state,source,at,age,features,kind){
 return {state,source,observedAt:at-age,collectedAt:at-age,
  ageMs:age,features,
  clockBasis:kind==='market'?'EXCHANGE_CLOSE':'OBSERVATION_RECORD_TIME'};
}
function scenario(i,{method='1m',v2=true}={}){
 const anchor=START+i*17*STEP,publishedAt=anchor+2000,
  targetCloseAt=anchor+16*STEP,outcome=i%2===0?'TP3':'STOP';
 const features={
  efficiency:.48+.02*(i%3),travelNorm:.51+.02*(i%5),
  volumeNorm:.49+.025*(i%4),volumeAvailable:true};
 const score=Math.round(100*(.5*features.efficiency+
  .3*features.travelNorm+.2*features.volumeNorm)*10)/10;
 const event=(stage,min)=>({stage,observedAt:anchor+min*M1,
  recordedAt:anchor+min*M1+1000});
 const stages=[event('LIMIT_READY',1),event('CONFIRMED',2)];
 if(outcome==='TP3')stages.push(event('TP1',3),event('TP2',4),
  event('TP3',5));
 else stages.push(event('SL',5));
 stages.push(event('COMPLETED',5));
 const aligned=outcome==='TP3'?1:-1;
 const ticker=snap('OBSERVED','binance:spot:24h',publishedAt,500,
  {price:100,changePercent24h:1.5*aligned,quoteVolume24h:12000,
   scope:'SPOT_24H_TICKER'},'market');
 const depth1=snap('OBSERVED','binance:spot:depth',publishedAt,1000,
  {spreadBps:4,visibleDepthImbalance:.3*aligned,
   scope:'LIMITED_PUBLIC_ORDERBOOK_NOT_HIDDEN_LIQUIDITY'},'liquidity');
 const depth2=snap('OBSERVED','bybit:spot:depth',publishedAt,2000,
  {spreadBps:5,visibleDepthImbalance:-.3*aligned,
   scope:'LIMITED_PUBLIC_ORDERBOOK_NOT_HIDDEN_LIQUIDITY'},'liquidity');
 const all={market:[ticker],liquidity:[depth1,depth2],onchain:[],
  news:[],macro:[],social:[]};
 const ctx={version:v2?'AS_OF_ROOM_EVIDENCE_V2':'AS_OF_ROOM_EVIDENCE_V1',
  capturedAt:publishedAt,policy:'DESCRIPTIVE_CONTEXT_ONLY_NO_FUTURE_LEAKAGE',
  feeds:Object.fromEntries(feeds.map(kind=>[kind,
   all[kind].length?Object.fromEntries(Object.entries(all[kind][0])
    .filter(([k])=>k!=='clockBasis')):{state:'MISSING'}])),
  radar:Object.fromEntries(radarFrames.map(x=>[x,{state:'MISSING'}]))};
 if(v2)ctx.sources=all;
 const h={model:'EMPIRICAL_MULTIFRAME_DIRECTION_V1',
  interval:'15m',evaluationInterval:method,
  observationMethod:method==='1m'?
   'M1_CLOSED_LEVEL_ORDER_V1':'M5_CLOSED_LEVEL_ORDER_V1',
  stageSemantics:method==='1m'?'M1_CLOSED_LIMIT_V1':'M5_CLOSED_LIMIT_V2',
  decisionMethod:'SIX_BAR_EFFICIENCY_V1',direction:'UP',
  anchorCloseAt:anchor,anchorClose:100,targetCloseAt,
  horizonBars:16,sampleBars:96,empiricalSamples:92,
  historicalPercentile:.8,empiricalWidth:.04,
  levelStudy:{entry:100,...levels,version:'MULTIFRAME_SINGLE_LEVELS_V1',
   direction:'UP'},contextAsPublished:{},evidenceAsPublished:ctx,
  calibratedProbability:null,
  preOutcomeStrength:{version:'PREOUTCOME_SIGNAL_STRENGTH_V1',
   state:'OBSERVED',scope:'CLOSED_PRICE_VOLUME_ONLY_UNTRAINED',
   scoreType:'UNTRAINED_SIGNAL_STRENGTH_NOT_PROBABILITY',
   event:'TERMINAL_TP3_VS_STOP',interval:'15m',
   calibratedProbability:null,capturedAt:publishedAt,
   candleCutoffAt:anchor,sampleBars:96,...features,score}};
 return {asset:'BTCUSDT',id:'direction3:BTCUSDT:15m:'+anchor,
  interval:'15m',publishedAt,hypothesis:h,status:'COMPLETED',
  stageEvents:stages,
  evaluation:{outcome,targetCloseAt,actualClose:outcome==='TP3'?110:90,
   evaluatedAt:anchor+5*M1+2000}};
}
const fixture=()=>Array.from({length:48},(_,i)=>scenario(i));
const inspect=xs=>auditProviderForwardValue(save(xs),{asset:'BTCUSDT',now:NOW});
const probe=(r,id)=>r.frames['15m'].providers.find(x=>x.id===id);
test('frozen preregistered rules and metadata-only sources cannot become predictions',()=>{
 assert.equal(PROVIDER_FORWARD_REGISTRATION,
  Date.UTC(2026,10,13,0,0,0));
 assert.equal(PROVIDER_FORWARD_RULES.noAutoTraining,true);
 assert.equal(PROVIDER_FORWARD_RULES.calibratedProbability,null);
 assert.equal(PROVIDER_FORWARD_RULES.independentPublicationsPerWindow,16);
 assert.equal(PROVIDER_FORWARD_TESTS.length,3);
 const r=inspect([]);
 assert.equal(r.state,'COLLECTING');
 assert.ok(r.metadataOnly.some(x=>x.kind==='news'));
 assert.ok(r.metadataOnly.some(x=>x.kind==='onchain'));
 assert.equal(r.trained,false);assert.equal(r.modelChanged,false);
});
test('paired 3-window study uses exactly same observed outcomes for both ranks',()=>{
 const r=inspect(fixture()),frame=r.frames['15m'];
 assert.equal(frame.selectedIndependent,48);
 assert.deepEqual(frame.periods.map(x=>x.selected),[16,16,16]);
 assert.deepEqual(frame.periods.map(x=>x.decisive),[16,16,16]);
 assert.equal(frame.periods.some(x=>x.invalid||x.lateRecorded),false);
 const market=probe(r,'binance:spot:24h');
 assert.equal(market.state,'REPEATED_DESCRIPTIVE');
 assert.ok(market.deltaAuc.every(x=>x>=PROVIDER_FORWARD_RULES.minDeltaAuc));
 assert.ok(market.negativeControlDeltaAuc.every(x=>x<=0));
 assert.deepEqual(market.windows.map(x=>x.scored),[16,16,16]);
 assert.equal(market.sensitivity.state,'DESCRIPTIVE');
 assert.equal(market.sensitivity.windows.length,3);
 assert.ok(market.sensitivity.windows.every(w=>
  w.leaveOneOutMin<=w.deltaAuc&&w.deltaAuc<=w.leaveOneOutMax));
 assert.equal(market.windows[0].tp3,8);
 assert.equal(market.windows[0].stop,8);
 const bybit=probe(r,'bybit:spot:depth');
 assert.equal(bybit.state,'RECENTLY_WORSE');
 assert.ok(bybit.deltaAuc.every(x=>x<0));
 assert.equal(frame.state,'DESCRIPTIVE');
});
test('immutable first 48 chosen by time/horizon even if outcomes change',()=>{
 const rows=fixture(),original=inspect(rows);
 const mutated=clone(rows);
 for(const x of mutated.slice(0,16)){
  x.evaluation.evaluatedAt=original.frames['15m'].boundaries[0]+1000;
 }
 const changed=inspect(mutated);
 assert.equal(changed.frames['15m'].selectedIndependent,48);
 assert.deepEqual(changed.frames['15m'].boundaries,
  original.frames['15m'].boundaries);
 assert.equal(changed.frames['15m'].periods[0].lateRecorded,16);
 assert.equal(probe(changed,'binance:spot:24h').state,'COLLECTING');
});
test('missing, stale or neutral source never counts as negative provider vote',()=>{
 const rows=fixture();
 for(let i=0;i<6;i++){
  const ctx=rows[i].hypothesis.evidenceAsPublished;
  const m=ctx.sources.market[0];
  m.state='STALE';
  m.observedAt=rows[i].publishedAt-21*60000;
  m.collectedAt=m.observedAt;
  m.ageMs=21*60000;
  ctx.feeds.market={...m};
  delete ctx.feeds.market.clockBasis;
 }
 const report=inspect(rows);
 const m=probe(report,'binance:spot:24h');
 assert.equal(m.windows[0].stale,6);
 assert.equal(m.windows[0].observed,10);
 assert.equal(m.windows[0].scored,10);
 assert.equal(m.state,'COLLECTING');
 const neutral=fixture();
 for(let i=0;i<5;i++){
  const ctx=neutral[i].hypothesis.evidenceAsPublished;
  const bybit=ctx.sources.liquidity[1];
  bybit.features.visibleDepthImbalance=.01;
 }
 const r=inspect(neutral);
 assert.equal(probe(r,'bybit:spot:depth').windows[0].neutral,5);
 assert.equal(probe(r,'bybit:spot:depth').windows[0].scored,11);
});
test('historical M5/V1 or before registration is never promoted into V2 research',()=>{
 const rows=fixture();
 rows.push(scenario(49,{method:'5m',v2:false}));
 const report=inspect(rows);
 assert.equal(report.frames['15m'].selectedIndependent,48);
 assert.equal(report.frames['15m'].postRegistrationM1,48);
 const v1=fixture();v1[5]=scenario(5,{v2:false});
 assert.equal(inspect(v1).frames['15m'].state,'CHECK_DATA');
 assert.equal(inspect(v1).frames['15m'].notV2,1);
});
test('incomplete, duplicate, wrong asset and tampered evidence fail closed',()=>{
 const rows=fixture();
 assert.equal(auditProviderForwardValue({...save(rows),complete:false},
  {asset:'BTCUSDT',now:NOW}).state,'INCOMPLETE');
 assert.equal(inspect([...rows,rows[0]]).state,'INVALID');
 assert.equal(auditProviderForwardValue(save(rows),
  {asset:'ETHUSDT',now:NOW}).state,'INVALID');
 const broken=fixture();
 broken[0].hypothesis.evidenceAsPublished.sources.market[0]
  .observedAt=broken[0].publishedAt+1000;
 assert.equal(inspect(broken).frames['15m'].state,'CHECK_DATA');
 const score=fixture();
 score[0].hypothesis.preOutcomeStrength.score=99;
 assert.equal(inspect(score).frames['15m'].state,'CHECK_DATA');
});
test('read-only compact cache persists research without raw outcomes, market data or keys',()=>{
 const rows=fixture(),data=new Map(),storage={
  getItem:k=>data.get(k)||null,
  setItem:(k,v)=>data.set(k,String(v))};
 assert.equal(saveSourceCohortSummary(save(rows),'BTCUSDT',
  {now:NOW,storage}),true);
 const view=readSourceCohortSummary('BTCUSDT',{now:NOW,storage});
 assert.equal(view.frames['15m'].providerResearch.selected,48);
 assert.equal(view.frames['15m'].providerResearch.required,48);
 assert.equal(view.frames['15m'].providerResearch.studies.length,3);
 assert.ok(view.frames['15m'].providerResearch.studies[0].deltaAuc);
 assert.equal(view.frames['15m'].providerResearch.studies[0]
  .sensitivity.state,'DESCRIPTIVE');
 assert.equal(view.frames['15m'].providerResearch.studies[0]
  .sensitivity.windows.length,3);
 assert.ok(!JSON.stringify(view).includes('outcome'));
 const raw=[...data.values()].join('');
 for(const forbidden of ['stageEvents','actualClose','apiKey',
  'quoteVolume24h','visibleDepthImbalance'])
  assert.equal(raw.includes(forbidden),false,forbidden);
});
test('existing automatic Room audit/Android packaging uses no provider-specific HTTP',()=>{
 const file=p=>readFileSync(new URL(p,import.meta.url),'utf8');
 const auto=file('./automatic-decision-quality.mjs'),
  source=file('./source-cohort-summary.mjs'),
  stage=file('../apex9-android/scripts/prepare-web.mjs'),
  screen=file('./free-source-dashboard.mjs');
 assert.ok(auto.includes('saveSourceCohortSummary(archive,asset'));
 assert.ok(source.includes('auditProviderForwardValue(archive,{asset,now})'));
 assert.ok(stage.includes("'source-provider-forward-audit.mjs'"));
 assert.ok(screen.includes('value.selected'));
 assert.ok(!file('./source-provider-forward-audit.mjs').includes('fetch('));
});

test('H1 and H4 each form their own M1/V2 forward cohort without sharing M15',()=>{
 const h1=scenario(0),one=h1.hypothesis;
 const orig=one.anchorCloseAt,H=3600000;
 const anchor=Math.floor((orig+1)/H)*H-1,offset=anchor-orig;
 const ctx=one.evidenceAsPublished;
 ctx.capturedAt+=offset;
 for(const arr of Object.values(ctx.sources))
  for(const item of arr){
   item.observedAt+=offset;item.collectedAt+=offset;
  }
 for(const item of Object.values(ctx.feeds))
  if(item.state!=='MISSING'){
   item.observedAt+=offset;item.collectedAt+=offset;
  }
 h1.interval='1h';h1.publishedAt+=offset;
 h1.id='direction2:BTCUSDT:1h:'+anchor;
 h1.status='PENDING_CONFIRMATION';h1.stageEvents=[];h1.evaluation=null;
 one.model='EMPIRICAL_DIRECTION_LEVELS_V2';
 one.interval='1h';one.anchorCloseAt=anchor;
 one.targetCloseAt=anchor+24*H;one.horizonBars=24;
 one.bandLow=94;one.bandHigh=106;
 one.levelStudy={entry:100,...computeReferenceLevels(100,94,106).UP,
  version:'H1_SINGLE_LEVELS_V2',direction:'UP'};
 one.stageSemantics='LIMIT_READY_M1_V1';
 one.preOutcomeStrength.interval='1h';
 one.preOutcomeStrength.capturedAt=h1.publishedAt;
 one.preOutcomeStrength.candleCutoffAt=anchor;
 const h4=scenario(1),h4h=h4.hypothesis,H4=14400000;
 const oldH4=h4h.anchorCloseAt;
 const newH4=Math.floor((oldH4+1)/H4)*H4-1,shift=newH4-oldH4;
 const h4ctx=h4h.evidenceAsPublished;
 h4ctx.capturedAt+=shift;
 for(const arr of Object.values(h4ctx.sources))
  for(const item of arr){
   item.observedAt+=shift;item.collectedAt+=shift;
  }
 for(const item of Object.values(h4ctx.feeds))
  if(item.state!=='MISSING'){
   item.observedAt+=shift;item.collectedAt+=shift;
  }
 h4.interval='4h';h4.publishedAt+=shift;
 h4.id='direction3:BTCUSDT:4h:'+newH4;
 h4.status='PENDING_CONFIRMATION';h4.stageEvents=[];h4.evaluation=null;
 h4h.interval='4h';h4h.anchorCloseAt=newH4;
 h4h.targetCloseAt=newH4+24*H4;h4h.horizonBars=24;
 h4h.preOutcomeStrength.interval='4h';
 h4h.preOutcomeStrength.capturedAt=h4.publishedAt;
 h4h.preOutcomeStrength.candleCutoffAt=newH4;
 const report=inspect([h1,h4]);
 assert.equal(report.frames['15m'].selectedIndependent,0);
 assert.equal(report.frames['1h'].selectedIndependent,1);
 assert.equal(report.frames['4h'].selectedIndependent,1);
 assert.equal(report.frames['1h'].invalidPlans,0);
 assert.equal(report.frames['4h'].invalidPlans,0);
 assert.equal(report.frames['1h'].periods[0].awaiting,1);
 assert.equal(report.frames['4h'].periods[0].awaiting,1);
});
