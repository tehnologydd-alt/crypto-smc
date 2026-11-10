import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 summarizeResearchDataQuality,DATA_QUALITY_HUB_VERSION,
 DATA_QUALITY_HUB_RULES
} from './forecast-data-quality-hub.mjs';

const asset='BTCUSDT',now=1900000000000;
const frames=['15m','1h','4h'];
const step={'15m':900000,'1h':3600000,'4h':14400000};
const base=1763000000000;
function snapshot(tf,at,{radar='OBSERVED',market='MISSING'}={}){
 const frameObj=Object.fromEntries(['15m','1h','4h','1d'].map(t=>[
  t,{state:'MISSING'}
 ]));
 if(radar!=='MISSING'){
  const size=step[tf];
  const close=Math.floor((at-50000)/size)*size-1-
   (radar==='STALE'?3*size:0);
  frameObj[tf]={
   state:radar,source:'ANDROID_NATIVE_RADAR',
   candleAt:close,observedAt:close+1000,
   direction:'UP',mode:'DIRECTIONAL',
   movement:.4,acceleration:0,volumeRatio:1
  };
 }
 const feeds=Object.fromEntries([
  'market','liquidity','onchain','news','macro','social'
 ].map(x=>[x,{state:'MISSING'}]));
 if(market==='OBSERVED'){
  feeds.market={
   state:'OBSERVED',source:'binance:spot:24h',
   observedAt:at-15000,collectedAt:at-10000,ageMs:10000,
   features:{scope:'SPOT_24H_TICKER',price:100,
    quoteVolume24h:1000,changePercent24h:0}
  };
 }
 return {version:'AS_OF_ROOM_EVIDENCE_V1',
  capturedAt:at,policy:'DESCRIPTIVE_CONTEXT_ONLY_NO_FUTURE_LEAKAGE',
  radar:frameObj,feeds};
}
function record(tf,i,{kind='OBSERVED',radar='OBSERVED',market='MISSING'}={}){
 const at=Math.floor(base/step[tf])*step[tf]+50000+
  i*step[tf]*30;
 const hypothesis={
  model:tf==='1h'?'EMPIRICAL_DIRECTION_LEVELS_V2':
   'EMPIRICAL_MULTIFRAME_DIRECTION_V1'
 };
 if(kind!=='LEGACY'){
  hypothesis.evidenceAsPublished=snapshot(tf,at,{radar,market});
  if(kind==='INVALID')
   hypothesis.evidenceAsPublished.radar[tf].observedAt=at+1;
 }
 return {id:'direction'+(tf==='1h'?'2':'3')+':'+asset+':'+tf+':'+at,
  asset,interval:tf,publishedAt:at,hypothesis};
}
function reports(rows){
 const counts=Object.fromEntries(frames.map(tf=>[
  tf,rows.filter(r=>r.interval===tf).length
 ]));
 const cohort=make=>({asset,frames:Object.fromEntries(
  frames.map(tf=>[tf,make(tf,counts[tf])])
 )});
 return {
  probability:cohort((tf,n)=>({
   status:'MORE_DATA',published:n,total:{decisive:0,invalid:0},
   holdout:{decisive:0}
  })),
  strength:cohort(()=>({
   state:'COLLECTING',precommitted:0,total:{invalid:0}
  })),
  ablation:cohort(()=>({state:'COLLECTING',invalidScores:0})),
  rolling:cohort(()=>({state:'COLLECTING',invalidScores:0})),
  challenger:cohort(()=>({
   state:'COLLECTING',futurePublished:0,newScored:0,
   invalidStrength:0
  })),
  regimes:cohort(()=>({state:'COLLECTING',windows:null}))
 };
}
const audit=(rows,overrides={})=>summarizeResearchDataQuality({
 forecasts:rows,publishedCount:rows.length,complete:true
},{asset,now,reports:reports(rows),...overrides});

test('readiness gate is a research status, never an estimate or an order',()=>{
 const list=[record('15m',0),record('1h',0),record('4h',0)];
 const result=audit(list);
 assert.equal(result.version,DATA_QUALITY_HUB_VERSION);
 assert.equal(result.state,'COLLECTING');
 assert.equal(result.autoTraining,false);
 assert.equal(result.calibratedProbability,null);
 assert.equal(DATA_QUALITY_HUB_RULES.noBackgroundRefresh,true);
 assert.equal(DATA_QUALITY_HUB_RULES.tradeExecution,false);
 for(const tf of frames){
  const f=result.frames[tf];
  assert.equal(f.published,1);
  assert.equal(f.status,'COLLECTING');
  assert.equal(f.readiness[0].observed,1);
  assert.equal(f.readiness[0].required,30);
  assert.equal(f.readiness[3].required,120);
  assert.equal(f.readiness[3].observed,0);
  assert.equal(f.source.verifiedSnapshots,1);
  assert.equal(f.source.ownRadar.OBSERVED,1);
  assert.equal(f.modelChanged,false);
 }
});
test('source availability uses immutable publication evidence, not API online status',()=>{
 const rows=[
  record('15m',0,{market:'OBSERVED'}),
  record('15m',1,{kind:'LEGACY'}),
  record('15m',2,{kind:'INVALID'}),
  record('1h',0,{radar:'STALE'}),
  record('4h',0,{radar:'MISSING'})
 ];
 const report=audit(rows);
 const m=report.frames['15m'];
 assert.equal(report.state,'CHECK_DATA');
 assert.equal(m.status,'CHECK_DATA');
 assert.equal(m.source.published,3);
 assert.equal(m.source.verifiedSnapshots,1);
 assert.equal(m.source.legacySnapshots,1);
 assert.equal(m.source.invalidSnapshots,1);
 assert.equal(m.source.snapshotCoverage,1/3);
 assert.equal(m.source.feeds.market.OBSERVED,1);
 assert.equal(m.source.feedFreshCoverage.market,1/3);
 assert.equal(report.frames['1h'].source.ownRadar.STALE,1);
 assert.equal(report.frames['1h'].source.freshRadarCoverage,0);
 assert.equal(report.frames['4h'].source.ownRadar.MISSING,1);
 assert.equal(report.frames['4h'].source.freshRadarCoverage,0);
 assert.ok(report.note.includes('не состояние подключения API'));
});
test('readiness thresholds are read from actual audit results, not hardcoded success',()=>{
 const rows=[record('15m',0),record('1h',0),record('4h',0)];
 const input=reports(rows);
 const f=input.probability.frames['15m'];
 f.published=1;f.total.decisive=45;f.holdout.decisive=22;
 input.challenger.frames['15m']={
  state:'COLLECTING',newScored:75,futurePublished:80,invalidStrength:0
 };
 const result=audit(rows,{reports:input});
 const m=result.frames['15m'];
 assert.deepEqual(m.readiness.map(x=>[x.key,x.observed,x.required,x.state]),[
  ['published',1,30,'COLLECTING'],
  ['decisive',45,40,'MET'],
  ['lateDecisive',22,20,'MET'],
  ['futureScored',75,120,'COLLECTING']
 ]);
 assert.equal(m.status,'COLLECTING');
 assert.equal(m.calibratedProbability,null);
});
test('an invalid audit or mismatched publication cohort fails closed',()=>{
 const rows=[record('15m',0),record('1h',0),record('4h',0)];
 const incomplete=summarizeResearchDataQuality({
  forecasts:rows,publishedCount:rows.length,complete:false
 },{asset,now,reports:reports(rows)});
 assert.equal(incomplete.state,'INCOMPLETE');
 assert.equal(audit([...rows,rows[0]]).state,'INVALID');
 const other=structuredClone(rows);
 other[0].asset='ETHUSDT';
 assert.equal(audit(other).state,'INVALID');
 const badReports=reports(rows);
 badReports.probability.frames['15m'].published=1000;
 assert.equal(audit(rows,{reports:badReports}).state,'INVALID');
 const missing=reports(rows);
 missing.challenger.frames=null;
 assert.equal(audit(rows,{reports:missing}).state,'INVALID');
});
test('missing snapshots are not silently considered fresh',()=>{
 const rows=[record('15m',0,{kind:'LEGACY'}),
  record('15m',1,{radar:'MISSING'})];
 const f=audit(rows).frames['15m'];
 assert.equal(f.source.published,2);
 assert.equal(f.source.verifiedSnapshots,1);
 assert.equal(f.source.legacySnapshots,1);
 assert.equal(f.source.ownRadar.OBSERVED,0);
 assert.equal(f.source.freshRadarCoverage,0);
 assert.equal(f.source.ownRadar.MISSING,1);
});
test('manual full archive UI and Android staging include research hub',()=>{
 const view=readFileSync(new URL('./forecast-probability-dashboard.mjs',
  import.meta.url),'utf8');
 const entry=readFileSync(new URL('./forecast-feature-dashboard.mjs',
  import.meta.url),'utf8');
 const bundle=readFileSync(new URL('../apex9-android/scripts/prepare-web.mjs',
  import.meta.url),'utf8');
 assert.ok(view.includes('summarizeResearchDataQuality(archive,'));
 assert.ok(view.includes('slot.prepend(diagnosticRoot,pairPanel,qualityRoot)'));
 assert.ok(view.includes('Качество исследовательских данных'));
 assert.ok(view.includes('Отсутствующий снимок не означает'));
 assert.ok(entry.includes('getMobileAssetResearchArchive('));
 assert.ok(bundle.includes("'forecast-data-quality-hub.mjs'"));
});
