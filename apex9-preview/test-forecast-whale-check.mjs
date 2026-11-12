import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {inspectWhaleCheck,whaleCheckBadge,whaleCheckCoverage,whaleShadowOutcomes}
 from './forecast-whale-check.mjs';

const T=Date.UTC(2026,10,12,13,30);
const base={version:'APEX_W_AS_PUBLISHED_V1',capturedAt:T,
 windowStartAt:T-3600000,state:'OBSERVED',
 policy:'PREPUBLICATION_ROOM_ONLY_PARTIAL_COVERAGE',
 sourceCount:2,sampleCount:3,spotExecutions:2,chainTransfers:1,
 latestCollectedAt:T-10000,walletRouteVerified:false,
 predictiveProbability:null,sources:[
  {source:'binance:spot:aggtrade',type:'SPOT_EXECUTIONS',count:2,
   latestCollectedAt:T-10000},
  {source:'mempool:bitcoin:tx',type:'CHAIN_TRANSFERS',count:1,
   latestCollectedAt:T-30000}
 ]};
const row=(w=base)=>({asset:'BTCUSDT',interval:'1h',publishedAt:T,
 hypothesis:JSON.stringify({whaleCheckAsPublished:w})});
const source=p=>readFileSync(new URL(p,import.meta.url),'utf8');

test('W badge verifies observation already stored before forecast publication',()=>{
 const r=inspectWhaleCheck(row());
 assert.equal(r.state,'OBSERVED');
 assert.equal(r.sampleCount,3);
 assert.equal(r.sourceCount,2);
 assert.equal(r.spotExecutions,2);
 assert.equal(r.chainTransfers,1);
 const old=globalThis.document;
 globalThis.document={createElement(tag){
  return {tagName:tag.toUpperCase(),className:'',dataset:{},
   children:[],setAttribute(k,v){this[k]=v},append(...xs){this.children.push(...xs)}};
 }};
 try{
  const badge=whaleCheckBadge(row());
  assert.equal(badge.children[0].textContent,'W');
  assert.match(badge.children[1].textContent,/3 наблюдений/);
  assert.equal(badge.dataset.wState,'OBSERVED');
 }finally{globalThis.document=old}
});
test('Missing prepublication events is not a negative predictive signal',()=>{
 const w={...base,state:'NO_OBSERVATIONS',sourceCount:0,sampleCount:0,
  spotExecutions:0,chainTransfers:0,latestCollectedAt:null,sources:[]};
 assert.equal(inspectWhaleCheck(row(w)).state,'NO_OBSERVATIONS');
 assert.equal(inspectWhaleCheck({...row(),hypothesis:JSON.stringify({})}).state,'LEGACY');
 assert.deepEqual(whaleCheckCoverage([row(w),row(),{
  ...row(),hypothesis:JSON.stringify({})
 }]),{published:3,observed:1,noObservations:1,legacy:1,
 invalid:0,spotOnly:0,chainPresent:1});
});
test('reject future publication contamination, fake owner routes and incomplete source metadata',()=>{
 for(const bad of [
  {...base,capturedAt:T+1000},
  {...base,windowStartAt:T-300000},
  {...base,walletRouteVerified:true},
  {...base,predictiveProbability:0.8},
  {...base,sourceCount:1},
  {...base,sampleCount:99},
  {...base,latestCollectedAt:T+2000},
  {...base,sources:[base.sources[0],base.sources[0]]},
  {...base,sources:[{...base.sources[0],latestCollectedAt:T+100},base.sources[1]]},
  {...base,sources:[{...base.sources[0],source:'unknown:synthetic'},base.sources[1]]},
  {...base,spotExecutions:3},
  {...base,sources:[{...base.sources[1],source:'blockscout:ethereum:transactions'},
   base.sources[0]]},
  {...base,state:'NO_OBSERVATIONS'}
 ])assert.equal(inspectWhaleCheck(row(bad)).state,'INVALID');
 assert.equal(inspectWhaleCheck({...row(),publishedAt:T+1000}).state,'INVALID');
});
test('prospective W cohorts use later VERIFIED outcomes without changing forecast',()=>{
 const no={...base,state:'NO_OBSERVATIONS',sourceCount:0,sampleCount:0,
  spotExecutions:0,chainTransfers:0,latestCollectedAt:null,sources:[]};
 const items=[row(),row(no),{...row(),interval:'4h'},
  {...row(),hypothesis:'{}'}];
 const result=whaleShadowOutcomes(items,{evaluate:x=>
  x.interval==='4h'?{state:'OBSERVED',finished:false}:
   {state:'OBSERVED',finished:true,outcome:x.hypothesis.includes('NO_OBSERVATIONS')?
    'STOP':'TP3'}});
 assert.equal(result.withW.published,2);
 assert.equal(result.withW.verifiedCompleted,1);
 assert.equal(result.withW.tp3,1);
 assert.equal(result.withoutEvents.sl,1);
 assert.equal(result.legacy,1);
});
test('native W is captured at publication, bounded per source, never synthesized on old rows',()=>{
 const dao=source('../apex9-android/native/src/main/java/com/apexintelligence/research/ApexDatabase.kt');
 const model=source('../apex9-android/native/src/main/java/com/apexintelligence/research/ApexWhalePrepublication.kt');
 const h1=source('../apex9-android/native/src/main/java/com/apexintelligence/research/ApexAutoForecast.kt');
 const multi=source('../apex9-android/native/src/main/java/com/apexintelligence/research/ApexMultiFrameForecast.kt');
 const native=source('../apex9-android/scripts/install-native.mjs');
 const stage=source('../apex9-android/scripts/prepare-web.mjs');
 for(const s of ['whaleChecksBySource','collectedAt <= :at','observedAt <= :at'])
  assert.ok(dao.includes(s),s);
 for(const s of ['PER_SOURCE = 12','PREPUBLICATION_ROOM_ONLY_PARTIAL_COVERAGE',
  'walletRouteVerified",false','predictiveProbability",JSONObject.NULL'])
  assert.ok(model.includes(s),s);
 for(const file of [h1,multi])assert.ok(file.includes(
  'ApexWhalePrepublication.capture(dao,asset,now)'));
 assert.ok(native.includes("'ApexWhalePrepublication.kt'"));
 assert.ok(stage.includes("'forecast-whale-check.mjs'"));
 for(const file of ['./forecast-compact-card.mjs','./forecast-directional-card.mjs',
  './forecast-multiframe.mjs']){
  assert.ok(source(file).includes('whaleCheckBadge(row)'));
 }
});
