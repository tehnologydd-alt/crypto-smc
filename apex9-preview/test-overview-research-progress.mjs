import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 measureResearchExperience,OVERVIEW_EXPERIENCE_VERSION,
 OVERVIEW_EXPERIENCE_RULES
} from './overview-research-progress.mjs';
import {getMobileResearchProgress} from './mobile-bridge.mjs';

const registeredAt=Date.UTC(2026,10,11);
const now=Date.now();
const item=(asset,interval,published,recordedTerminal,newPublished)=>({
 asset,interval,published,recordedTerminal,newPublished,
 latestPublishedAt:now-3600000
});
const data=rows=>({
 native:true,complete:true,source:'LOCAL_ROOM_PROGRESS_V1',
 favorites:['BTCUSDT','ETHUSDT'],rows,
 sampledAt:now,registrationAt:registeredAt
});
test('progress shows record-count milestones per favorite and timeframe only',()=>{
 const d=data([
  item('BTCUSDT','15m',60,32,30),
  item('BTCUSDT','1h',15,4,0),
  item('ETHUSDT','15m',300,120,120)
 ]);
 const btc=measureResearchExperience(d,'BTCUSDT');
 assert.equal(btc.state,'COUNTS_AVAILABLE');
 assert.equal(btc.frames['15m'].progress,Math.round(
  (1+32/40+30/120)/3*100));
 assert.deepEqual(btc.frames['15m'].checkpoints.map(x=>[x.observed,x.target]),[
  [60,30],[32,40],[30,120]
 ]);
 assert.equal(btc.frames['4h'].progress,0);
 assert.equal(btc.frames['1h'].progress,Math.round((15/30+4/40+0)/3*100));
 assert.equal(btc.trained,false);
 assert.equal(btc.calibratedProbability,null);
 assert.ok(btc.note.includes('НЕ степень интеллекта'));
 assert.ok(OVERVIEW_EXPERIENCE_RULES.noModelTraining);
});
test('reaching count milestones never claims the AI is trained',()=>{
 const d=data([item('BTCUSDT','4h',300,40,150)]);
 const result=measureResearchExperience(d,'BTCUSDT');
 assert.equal(result.frames['4h'].progress,100);
 assert.equal(result.frames['4h'].countMilestonesMet,3);
 assert.equal(result.frames['4h'].readyForQualityAudit,true);
 assert.equal(result.frames['4h'].trained,false);
 assert.equal(result.frames['4h'].calibratedProbability,null);
});
test('missing records count zero; unrelated favorites never inflate the selected asset',()=>{
 const d=data([item('ETHUSDT','15m',1000,500,500)]);
 const selected=measureResearchExperience(d,'BTCUSDT');
 for(const tf of ['15m','1h','4h'])
  assert.equal(selected.frames[tf].progress,0);
 assert.equal(measureResearchExperience(d,'SOLUSDT').state,'INVALID');
});
test('duplicated, forged, future and inconsistent Room counters fail closed',()=>{
 const normal=item('BTCUSDT','15m',80,40,20);
 for(const corrupted of [
  [normal,normal],
  [{...normal,published:1}],
  [{...normal,recordedTerminal:81}],
  [{...normal,newPublished:81}],
  [{...normal,latestPublishedAt:now+3600000}],
  [{...normal,asset:'SOLUSDT'}],
  [{...normal,interval:'5m'}],
  [{...normal,published:-1}]
 ]){
  assert.equal(measureResearchExperience(data(corrupted),'BTCUSDT').state,
   'INVALID');
 }
 assert.equal(measureResearchExperience({...data([normal]),complete:false},
  'BTCUSDT').state,'INVALID');
 assert.equal(measureResearchExperience({...data([normal]),
  favorites:['BTCUSDT','BTCUSDT']},'BTCUSDT').state,'INVALID');
});
test('native bridge accepts ONLY requested favorites and bounded result rows',async()=>{
 const previous=globalThis.window;
 const sample={
  source:'LOCAL_ROOM_PROGRESS_V1',
  sampledAt:now,registrationAt:registeredAt,
  favorites:['BTCUSDT','ETHUSDT'],
  rows:[item('BTCUSDT','15m',25,10,0),
   item('ETHUSDT','4h',12,5,0)],
  verifiedOutcomeRate:null,modelTrainingEnabled:false
 };
 globalThis.window={Capacitor:{Plugins:{ApexNative:{
  getResearchProgress:async()=>sample
 }}}};
 try{
  const pass=await getMobileResearchProgress(['ETHUSDT','BTCUSDT']);
  assert.equal(pass.complete,true);
  assert.equal(pass.rows.length,2);
  const mismatch=await getMobileResearchProgress(['BTCUSDT']);
  assert.equal(mismatch.complete,false);
  assert.ok(mismatch.error.includes('избранное'));
  const original=globalThis.window.Capacitor.Plugins.ApexNative;
  original.getResearchProgress=async()=>({
   ...sample,rows:[...sample.rows,item('BTCUSDT','15m',1,1,0)]
  });
  assert.equal((await getMobileResearchProgress([
   'BTCUSDT','ETHUSDT'])).complete,false);
  original.getResearchProgress=async()=>({...sample,modelTrainingEnabled:true});
  assert.equal((await getMobileResearchProgress([
   'BTCUSDT','ETHUSDT'])).complete,false);
 }finally{
  if(previous===undefined)delete globalThis.window;
  else globalThis.window=previous;
 }
});
test('overview UI, Kotlin aggregation, sync cache and APK staging are connected',()=>{
 const nativeFolder=new URL('../apex9-android/native/src/main/java/com/apexintelligence/research/',
  import.meta.url);
 const db=readFileSync(new URL('ApexDatabase.kt',nativeFolder),'utf8');
 const plugin=readFileSync(new URL('ApexNativePlugin.kt',nativeFolder),'utf8');
 const index=readFileSync(new URL('./index.html',import.meta.url),'utf8');
 const main=readFileSync(new URL('./app.mjs',import.meta.url),'utf8');
 const favorites=readFileSync(new URL('./favorite-dashboard.mjs',import.meta.url),'utf8');
 const module=readFileSync(new URL('./overview-research-progress.mjs',import.meta.url),'utf8');
 const web=readFileSync(new URL('../apex9-android/scripts/prepare-web.mjs',
  import.meta.url),'utf8');
 assert.ok(/@Dao\s+interface ResearchDao/.test(db));
 assert.ok(db.includes('suspend fun researchProgressForFavorites('));
 assert.ok(db.includes('WHERE f.asset IN (:assets)'));
 assert.ok(db.includes('LEFT JOIN research_forecast_results'));
 assert.ok(plugin.includes('fun getResearchProgress(call: PluginCall)'));
 assert.ok(plugin.includes('ApexPreferences.read(context.applicationContext)'));
 assert.ok(plugin.includes('LOCAL_ROOM_PROGRESS_V1'));
 assert.ok(plugin.includes('modelTrainingEnabled", false'));
 assert.ok(index.includes('id="overview-experience-bars"'));
 assert.ok(index.includes('id="overview-experience-asset"'));
 assert.ok(main.includes('experienceOverview?.openOverview()'));
 assert.ok(main.includes('experienceOverview?.favoritesChanged()'));
 assert.ok(favorites.includes('onResearchSynced?.()'));
 assert.ok(module.includes('storage?.setItem?.(KEY'));
 assert.ok(module.includes('cacheMaxAgeMs'));
 assert.ok(module.includes('request'));
 assert.ok(!module.includes('getMobileAssetResearchArchive'));
 assert.ok(web.includes("'overview-research-progress.mjs'"));
 assert.equal(OVERVIEW_EXPERIENCE_VERSION,
  'APEX_RESEARCH_EXPERIENCE_OVERVIEW_V1');
});
