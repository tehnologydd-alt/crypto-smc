import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseEthereumTransfers,parseBitcoinLargeOutputs}
 from './whale-observer.mjs';
import {analyzeWhaleActivity,distinctObservedTransactions,
 studyWhalePriceHistory,WHALE_STUDY_POLICY,WHALE_ANALYSIS_VERSION}
 from './whale-activity-analysis.mjs';

const HOUR=3600000,DAY=86400000,NOW=Date.UTC(2026,10,11,13,30);
const ETH='ETHUSDT',BTC='BTCUSDT',from='0x'+'1'.repeat(40),
 to='0x'+'2'.repeat(40);
const txid=n=>n.toString(16).padStart(64,'0');
function events(n=12){
 const results=[];
 for(let i=0;i<n;i++){
  const detected=NOW-11*DAY+i*5*HOUR+20*60000;
  const tx={hash:'0x'+txid(i+1),value:'101000000000000000000',
   status:'ok',result:'success',
   timestamp:new Date(detected-12*60000).toISOString(),
   from:{hash:from},to:{hash:to}};
  const parsed=parseEthereumTransfers(ETH,{items:[tx]},detected);
  assert.equal(parsed.events.length,1);
  results.push(parsed.events[0]);
 }
 return results;
}
function bars(){
 const start=Math.floor((NOW-13*DAY)/HOUR)*HOUR;
 const result=[];
 for(let i=0;i<13*24;i++){
  const t=start+i*HOUR;
  if(t+HOUR-1>=NOW)break;
  const base=100*Math.exp(i*.00025+.022*Math.sin(i/7));
  result.push({t,closeAt:t+HOUR-1,open:base,high:base*1.001,
   low:base*.999,close:base,volume:100+i,closed:true});
 }
 return result;
}
test('unique TX is separate from number of outputs; no fabricated whale ownership',()=>{
 const e=parseBitcoinLargeOutputs(BTC,{
  txid:txid(1),status:{confirmed:false},
  vout:[{value:11000000000,scriptpubkey_address:'bc1q'+'a'.repeat(36)},
   {value:19000000000,scriptpubkey_address:'bc1q'+'b'.repeat(36)}]
 },NOW);
 assert.equal(e.length,2);
 const dedup=distinctObservedTransactions(e,BTC,{now:NOW});
 assert.equal(dedup.length,1);
 assert.equal(dedup[0].amountAtomic,'19000000000');
 const a=analyzeWhaleActivity(e,bars(),{asset:BTC,now:NOW});
 assert.equal(a.activity.transactions,1);
 assert.equal(a.activity.sourceScope,'RECENT_MEMPOOL_OUTPUTS');
 assert.equal(a.activity.accumulation,null);
 assert.equal(a.activity.exchangeFlow,null);
 assert.equal(a.activity.ownerIdentity,null);
});
test('source-specific activity counts actual TX, repeat-address is not attribution',()=>{
 const report=analyzeWhaleActivity(events(),bars(),{asset:ETH,now:NOW});
 assert.equal(report.version,WHALE_ANALYSIS_VERSION);
 assert.equal(report.state,'OBSERVED');
 assert.equal(report.activity.transactions,12);
 assert.equal(report.activity.observedBatches,12);
 assert.equal(report.activity.repeatAddresses.length,2);
 assert.equal(report.activity.repeatAddresses[0].transactions,12);
 assert.equal(report.activity.eventTimeReliability,
  'BLOCK_TIMESTAMP_BUT_FIRST_SEEN_AT_COLLECTION');
 assert.equal(report.activity.completeness,'PARTIAL_SAMPLED_ONLY');
 assert.equal(report.activity.exchangeFlow,null);
 assert.equal(report.trained,false);
 assert.equal(report.predictive,false);
 assert.equal(report.changedForecasts,false);
});
test('forward outcomes require eight independent 4h-spaced completed studies',()=>{
 const a=analyzeWhaleActivity(events(7),bars(),{asset:ETH,now:NOW});
 assert.equal(a.price.state,'COLLECTING');
 assert.equal(a.price.eligibleIndependent,7);
 assert.equal(a.price.requiredIndependent,8);
 assert.equal(a.price.cohortA,null);
 const b=analyzeWhaleActivity(events(),bars(),{asset:ETH,now:NOW});
 assert.equal(b.price.state,'DESCRIPTIVE');
 assert.equal(b.price.eligibleIndependent,12);
 assert.equal(b.price.cohortA.count,6);
 assert.equal(b.price.cohortB.count,6);
 for(const c of [b.price.cohortA,b.price.cohortB]){
  assert.ok(Number.isFinite(c.medianAfter4hPct));
  assert.ok(Number.isFinite(c.medianAbsoluteBefore4hPct));
  assert.ok(Number.isFinite(c.medianAbsoluteAfter4hPct));
  assert.ok(c.positiveAfter4h+c.negativeAfter4h<=c.count);
 }
 assert.ok(b.price.cohortA.lastCollectionAt<
  b.price.cohortB.firstCollectionAt);
 assert.equal(b.price.significant,false);
 assert.equal(b.price.causal,false);
 assert.equal(b.price.predictive,false);
 assert.equal(b.price.changedForecasts,false);
});
test('event timestamp earlier than discovery cannot change forward price anchor',()=>{
 const src=events(),c=bars();
 const shifted=src.map(e=>({...e,observedAt:e.observedAt-4*HOUR}));
 const original=analyzeWhaleActivity(src,c,{asset:ETH,now:NOW});
 const older=analyzeWhaleActivity(shifted,c,{asset:ETH,now:NOW});
 assert.equal(older.price.state,'DESCRIPTIVE');
 assert.deepEqual(older.price.cohortA,original.price.cohortA);
 assert.deepEqual(older.price.cohortB,original.price.cohortB);
});
test('missing one H1 bar is not silently interpolated or guessed',()=>{
 const es=events(8),base=bars(),at=es[2].collectedAt;
 const anchor=Math.floor((at+1)/HOUR)*HOUR-1;
 const missing=base.filter(x=>x.closeAt!==anchor+HOUR);
 const result=studyWhalePriceHistory(es,missing,{now:NOW});
 assert.equal(result.state,'COLLECTING');
 assert.equal(result.eligibleIndependent,7);
 assert.equal(result.excludedMissingPrice,1);
 const invalid=base.map(x=>({...x}));
 invalid[0].high=invalid[0].low-1;
 assert.equal(studyWhalePriceHistory(es,invalid,{now:NOW}).state,
  'INVALID_CANDLES');
});
test('overlapping windows are suppressed before any temporal comparison',()=>{
 const src=events(9);
 src[1].collectedAt=src[0].collectedAt+HOUR;
 src[1].observedAt=src[1].collectedAt-60000;
 const study=studyWhalePriceHistory(src,bars(),{now:NOW});
 assert.equal(study.excludedOverlapping,1);
 assert.equal(study.eligibleIndependent,8);
 assert.equal(study.state,'DESCRIPTIVE');
});
test('unfinished forward window does not leak future H1 bars',()=>{
 const source=events(8);
 source[7].collectedAt=NOW-15*60000;
 source[7].observedAt=source[7].collectedAt-60000;
 const study=studyWhalePriceHistory(source,bars(),{now:NOW});
 assert.equal(study.excludedPendingFuture,1);
 assert.equal(study.state,'COLLECTING');
 assert.equal(study.eligibleIndependent,7);
});
test('no source observations is not interpreted as absence of whale activity',()=>{
 const study=analyzeWhaleActivity([],bars(),{asset:ETH,now:NOW});
 assert.equal(study.state,'COLLECTING');
 assert.equal(study.activity.transactions,0);
 assert.equal(study.activity.accumulation,null);
 assert.equal(study.price.state,'COLLECTING');
 assert.equal(analyzeWhaleActivity(events(),bars(),{
  asset:'GRAMUSDT',now:NOW}).state,'UNSUPPORTED');
});
test('UI reports history-only H1; Room never changes first-seen on repeated TX',()=>{
 const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
 const dash=read('./whale-dashboard.mjs'),
  html=read('./index.html'),work=read('./app.mjs'),
  native=read('../apex9-android/native/src/main/java/com/apexintelligence/research/ApexNativePlugin.kt'),
  dao=read('../apex9-android/native/src/main/java/com/apexintelligence/research/ApexDatabase.kt'),
  prepare=read('../apex9-android/scripts/prepare-web.mjs');
 assert.equal(WHALE_STUDY_POLICY.horizonHours,4);
 assert.equal(WHALE_STUDY_POLICY.minimumIndependent,8);
 assert.ok(html.includes('id="whale-analysis-metrics"'));
 assert.ok(html.includes('id="whale-market-report"'));
 assert.ok(html.includes('id="whale-market-check"'));
 assert.ok(dash.includes("getMobileCandles(current,'1h'"));
 assert.ok(dash.includes('getFavorites().includes(asset)'));
 assert.ok(dash.includes("node('whale-market-check')?.addEventListener('click'"));
 assert.ok(dash.includes('await fetchCandles(current,\'1h\''));
 assert.ok(work.includes("import {initWhaleDashboard}"));
 assert.ok(native.includes('dao.insertWhaleObservationOnce(record) != -1L'));
 assert.ok(dao.includes('OnConflictStrategy.IGNORE'));
 assert.ok(prepare.includes("'whale-activity-analysis.mjs'"));
 const core=read('./whale-activity-analysis.mjs');
 assert.equal(core.includes('fetch('),false);
 assert.equal(core.includes('setInterval('),false);
 assert.equal(core.includes('Math.random('),false);
});
