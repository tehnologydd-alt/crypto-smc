import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createAutomaticDecisionAudit,computeAutomaticDecisionAudit,
 AUTO_DECISION_QUALITY_VERSION,AUTO_DECISION_QUALITY_RULES}
 from './automatic-decision-quality.mjs';
const T0=Date.UTC(2026,10,11,12,0,0);
const frames=['15m','1h','4h'];
const makeProgress=(favorites,counts={})=>({
 complete:true,source:'LOCAL_ROOM_PROGRESS_V1',favorites,
 rows:favorites.flatMap(asset=>frames.map(interval=>({
  asset,interval,published:counts[asset]?.[interval]??(interval==='15m'?2:0),
  recordedTerminal:0,newPublished:0
 })))
});
const storage=()=>{const data=new Map();return{
 getItem:key=>data.get(key)||null,setItem:(key,val)=>data.set(key,String(val)),
 data
}};
const wait=()=>new Promise(resolve=>setTimeout(resolve,0));
test('automatic audit is read-only and rejects incomplete, empty or mismatched archives',()=>{
 const asset='ETHUSDT';
 assert.equal(computeAutomaticDecisionAudit({
  native:true,complete:true,forecasts:[],publishedCount:0
 },asset,{now:T0}).state,'EMPTY');
 assert.equal(computeAutomaticDecisionAudit({
  native:true,complete:false,forecasts:[],publishedCount:1
 },asset,{now:T0}).state,'INCOMPLETE');
 assert.equal(computeAutomaticDecisionAudit({
  native:false,error:'no Room',complete:false
 },asset,{now:T0}).state,'UNAVAILABLE');
 assert.equal(computeAutomaticDecisionAudit({
  native:true,complete:true,
  forecasts:[{id:'a',asset:'TRBUSDT',interval:'1h',publishedAt:T0-60000}],
  publishedCount:1
 },asset,{now:T0}).state,'CHECK_DATA');
 assert.equal(AUTO_DECISION_QUALITY_VERSION,'APEX_AUTO_DECISION_QUALITY_V1');
 assert.equal(AUTO_DECISION_QUALITY_RULES.maxRowsPerAsset,1500);
 assert.equal(AUTO_DECISION_QUALITY_RULES.noAutoTraining,true);
 assert.equal(AUTO_DECISION_QUALITY_RULES.noMarketNetwork,true);
});
test('every favorite audited once, repeat reads skipped while counters unchanged',async()=>{
 let time=T0;
 const favorite=['ETHUSDT','BTCUSDT'];
 let changes={};
 const fetched=[],saved=[],statuses=[];
 const store=storage(),cached=new Map();
 const worker=createAutomaticDecisionAudit({
  getFavorites:()=>favorite,
  loadProgress:async()=>makeProgress(favorite,changes),
  loadArchive:async(asset,opts)=>{
   fetched.push({asset,opts});
   return {native:true,complete:true,publishedCount:1,
    forecasts:[{id:asset,asset,interval:'15m',publishedAt:T0-1000}]};
  },
  compute:async()=>({state:'COLLECTING',audits:{release:{frames:{}}}}),
  saveAudit:(archive,asset,opts)=>{
   saved.push({asset,opts});
   cached.set(asset,{valid:true});return true;
  },
  readAudit:asset=>cached.get(asset)||null,
  storage:store,now:()=>time,
  yieldControl:wait,
  onStatus:(asset,summary)=>statuses.push([asset,summary.state])
 });
 await worker.run();
 assert.deepEqual(fetched.map(x=>x.asset),favorite);
 assert.ok(fetched.every(x=>x.opts.pageSize===75&&x.opts.maxRows===1500));
 assert.deepEqual(saved.map(x=>x.asset),favorite);
 assert.ok(saved.every(x=>x.opts.audits.release));
 assert.equal(worker.getStatus('ETHUSDT').state,'VERIFIED');
 assert.equal(worker.getStatus('BTCUSDT').state,'VERIFIED');
 assert.ok(statuses.some(x=>x[1]==='READING'));
 await worker.run();
 assert.equal(fetched.length,2);
 time+=3*60000;
 await worker.run();
 assert.equal(fetched.length,2);
 changes={ETHUSDT:{'15m':3}};
 await worker.run();
 assert.deepEqual(fetched.map(x=>x.asset),
  ['ETHUSDT','BTCUSDT','ETHUSDT']);
 time+=AUTO_DECISION_QUALITY_RULES.successTtlMs+1;
 await worker.run();
 assert.equal(fetched.length,5);
 const meta=JSON.parse(store.getItem('apex9:auto-decision-audit:v1'));
 assert.equal(meta.version,AUTO_DECISION_QUALITY_VERSION);
 assert.equal(Object.keys(meta.assets).length,2);
 worker.stop();
});
test('empty favorites skipped, failed archives back off without false completion',async()=>{
 let time=T0,fail=true,reads=0;
 const fav=['TRBUSDT','ZECUSDT'];
 const worker=createAutomaticDecisionAudit({
  getFavorites:()=>fav,
  loadProgress:async()=>makeProgress(fav,{TRBUSDT:{'15m':0},
   ZECUSDT:{'15m':3}}),
  loadArchive:async()=>{reads++;if(fail)throw Error('Room incomplete');
   return {native:true,complete:true,publishedCount:1,
    forecasts:[{id:'zec-1',asset:'ZECUSDT',
     interval:'15m',publishedAt:T0-60000}]};
  },
  compute:()=>({audits:{release:{}}}),
  saveAudit:()=>true,readAudit:()=>null,
  storage:storage(),now:()=>time,yieldControl:wait
 });
 await worker.run();
 assert.equal(worker.getStatus('TRBUSDT').state,'EMPTY');
 assert.equal(worker.getStatus('ZECUSDT').state,'FAILED');
 assert.equal(reads,1);
 time+=10*60000;
 await worker.run();
 assert.equal(reads,1);
 fail=false;
 time+=31*60000;
 await worker.run();
 assert.equal(reads,2);
 assert.equal(worker.getStatus('ZECUSDT').state,'VERIFIED');
 worker.stop();
});
test('removed favorite cannot be saved after an in-flight Room request',async()=>{
 let fav=['ETHUSDT','TRBUSDT'],continueRead;
 const entered=new Promise(resolve=>{continueRead={entered:resolve}});
 const held=new Promise(resolve=>{continueRead.finish=resolve});
 const saved=[];
 const worker=createAutomaticDecisionAudit({
  getFavorites:()=>fav,
  loadProgress:async items=>makeProgress(items),
  loadArchive:async asset=>{
   if(asset==='ETHUSDT'){
    continueRead.entered();
    await held;
   }
   return {native:true,complete:true,publishedCount:1,forecasts:[]};
  },
  compute:()=>({audits:{release:{}}}),
  saveAudit:(archive,asset)=>{saved.push(asset);return true},
  readAudit:()=>null,storage:storage(),now:()=>T0,yieldControl:wait
 });
 const started=worker.run();
 await entered;
 fav=['TRBUSDT'];
 const repeat=worker.favoritesChanged();
 continueRead.finish();
 await started;await repeat;
 assert.deepEqual(saved,['TRBUSDT']);
 assert.equal(worker.getStatus('TRBUSDT').state,'VERIFIED');
 worker.stop();
});
test('automatic audit is on app startup/return, manual detailed audit stays available',()=>{
 const file=p=>readFileSync(new URL(p,import.meta.url),'utf8');
 const overview=file('./overview-research-progress.mjs'),
  view=file('./overview-decision-quality.mjs'),
  app=file('./app.mjs'),
  detail=file('./forecast-feature-dashboard.mjs'),
  prepared=file('../apex9-android/scripts/prepare-web.mjs');
 assert.ok(overview.includes('createAutomaticDecisionAudit({'));
 assert.ok(overview.includes('visibilitychange'));
 assert.ok(overview.includes('automatic.favoritesChanged()'));
 assert.ok(overview.includes('automatic.run()'));
 assert.ok(app.includes('experienceOverview?.favoritesChanged();'));
 assert.ok(view.includes('Автоматически проверяем полный архив Room'));
 assert.ok(!view.includes('Проверка запускается вручную'));
 assert.ok(detail.includes("button.addEventListener('click',async()=>"));
 assert.ok(prepared.includes("'automatic-decision-quality.mjs'"));
 assert.ok(!file('./automatic-decision-quality.mjs').includes('fetch('));
});
