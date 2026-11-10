import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {computeReferenceLevels} from './research-level-sequence.mjs';
import {canDraftShadow,inspectShadowProposal,evaluateShadowProposal,
 SHADOW_RULES,SHADOW_VERSION} from './forecast-shadow-forward.mjs';
import {STABILITY_VERSION} from './forecast-feature-stability.mjs';

const S=900000,anchor0=Math.floor(1760000000000/S)*S-1;
const round=n=>Number(n.toPrecision(13));
const width=.04,price=100;
const levels={version:'MULTIFRAME_SINGLE_LEVELS_V1',
 direction:'UP',entry:price,
 ...computeReferenceLevels(price,
 round(price*Math.exp(-width)),round(price*Math.exp(width))).UP};
const frameNames=['15m','1h','4h','1d'];
const feeds=['market','liquidity','onchain','news','macro','social'];
function scenario(i,{aligned=i%2===0,finish=i%3===0?'STOP':'TP3'}={}){
 const anchor=anchor0+i*17*S;
 const publishedAt=anchor+2000;
 const stage=n=>({observedAt:anchor+n*S,recordedAt:anchor+n*S+1000});
 const events=[{stage:'LIMIT_READY',...stage(2)},{stage:'CONFIRMED',...stage(3)}];
 if(finish==='TP3')events.push(
  {stage:'TP1',...stage(4)},
  {stage:'TP2',...stage(5)},
  {stage:'TP3',...stage(6)});
 else events.push({stage:'SL',...stage(6)});
 events.push({stage:'COMPLETED',...stage(6)});
 const radar=Object.fromEntries(frameNames.map(f=>[f,{state:'MISSING'}]));
 radar['15m']={state:'OBSERVED',source:'ANDROID_NATIVE_RADAR',
  candleAt:anchor,observedAt:publishedAt,mode:'DIRECTIONAL',
  direction:aligned?'UP':'DOWN',movement:.2,acceleration:.01,volumeRatio:1.2};
 const source=Object.fromEntries(feeds.map(f=>[f,{state:'MISSING'}]));
 const h={
  model:'EMPIRICAL_MULTIFRAME_DIRECTION_V1',interval:'15m',
  evaluationInterval:'15m',decisionMethod:'SIX_BAR_EFFICIENCY_V1',
  stageSemantics:'SAME_FRAME_LIMIT_V1',direction:'UP',
  anchorCloseAt:anchor,anchorClose:price,
  targetCloseAt:anchor+16*S,horizonBars:16,
  sampleBars:96,empiricalSamples:92,historicalPercentile:.8,
  empiricalWidth:width,levelStudy:levels,contextAsPublished:{},
  evidenceAsPublished:{version:'AS_OF_ROOM_EVIDENCE_V1',
   policy:'DESCRIPTIVE_CONTEXT_ONLY_NO_FUTURE_LEAKAGE',
   capturedAt:publishedAt,feeds:source,radar}
 };
 return {asset:'BTCUSDT',interval:'15m',publishedAt,
  id:'direction3:BTCUSDT:15m:'+anchor,
  hypothesis:h,stageEvents:events,status:'COMPLETED',
  evaluation:{outcome:finish,evaluatedAt:anchor+6*S+2000,
   targetCloseAt:h.targetCloseAt,actualClose:101,actualChangePct:1}};
}
const training=Array.from({length:100},(_,i)=>scenario(i));
const registration=anchor0+100*17*S+2000;
function mockHoldout(){
 return {asset:'BTCUSDT',archiveRows:100,
  frames:{'15m':{frame:'15m',state:'DESCRIPTIVE',published:100,
   splitAt:training[60].publishedAt,
   confirmationAt:training[80].publishedAt}}};
}
function mockStability(){
 return {version:STABILITY_VERSION,asset:'BTCUSDT',
  frames:{'15m':{state:'DESCRIPTIVE',features:[
   {id:'sameRadar',state:'REPEATED',approvedForForecast:false,
    association:'MATCH_MORE_TP3'}]}}};
}
function candidate(){
 const c={
  asset:'BTCUSDT',interval:'15m',featureId:'sameRadar',
  association:'MATCH_MORE_TP3',registeredAt:registration,
  embargoUntil:registration+16*S,
  sourceCutoffAt:training[99].publishedAt,historySize:100,
  evidenceVersion:SHADOW_VERSION
 };
 return {...c,id:['shadow1',c.asset,c.interval,
  c.featureId,c.registeredAt].join(':')};
}
const future=Array.from({length:50},(_,i)=>
 scenario(101+i,{aligned:i%2===0,finish:i%2===0?'TP3':'STOP'}));
const now=future.at(-1).evaluation.evaluatedAt+S;

test('only repeated checked old-history findings can be frozen',()=>{
 const ready=canDraftShadow(mockHoldout(),mockStability(),{
  asset:'BTCUSDT',frame:'15m',featureId:'sameRadar',
  latestPublishedAt:training[99].publishedAt,now:registration
 });
 assert.equal(ready.state,'READY');
 assert.equal(ready.evidence.historySize,100);
 assert.equal(ready.evidence.evidenceVersion,SHADOW_VERSION);
 const weak=mockStability();
 weak.frames['15m'].features[0].state='DRIFTING';
 assert.equal(canDraftShadow(mockHoldout(),weak,{
  asset:'BTCUSDT',frame:'15m',featureId:'sameRadar',
  latestPublishedAt:training[99].publishedAt,now:registration
 }).state,'BLOCKED');
});
test('frozen proposal id, source cutoff and horizon embargo are immutable',()=>{
 const p=candidate();
 assert.equal(inspectShadowProposal(p,{now}).state,'VERIFIED');
 assert.equal(SHADOW_RULES.autopromote,false);
 assert.equal(SHADOW_RULES.tradeExecution,false);
 assert.equal(inspectShadowProposal({...p,embargoUntil:p.embargoUntil-1},{now}).state,'INVALID');
 assert.equal(inspectShadowProposal({...p,sourceCutoffAt:p.registeredAt+1},{now}).state,'INVALID');
 assert.equal(inspectShadowProposal({...p,featureId:'unknown'},{now}).state,'INVALID');
});
test('future-only collection does not count historical training outcomes',()=>{
 const p=candidate();
 const historical=evaluateShadowProposal(p,training,{
  asset:'BTCUSDT',complete:true,publishedCount:100,now
 });
 assert.equal(historical.postRegistration,0);
 assert.equal(historical.decisive,0);
 assert.equal(historical.state,'COLLECTING');
 const all=[...training,...future];
 const actual=evaluateShadowProposal(p,all,{
  asset:'BTCUSDT',complete:true,publishedCount:all.length,now});
 assert.equal(actual.state,'DESCRIPTIVE');
 assert.equal(actual.postRegistration,50);
 assert.equal(actual.eligible,50);
 assert.equal(actual.decisive,50);
 assert.deepEqual(actual.positive,{tp3:25,stop:0});
 assert.deepEqual(actual.negative,{tp3:0,stop:25});
 assert.equal(actual.coverage,1);
 assert.equal(actual.modelChanged,false);
 assert.equal(actual.readyToApply,false);
});
test('insufficient/missing evidence never counts as shadow wins',()=>{
 const noEvidence=future.map((x,i)=>{
  const cloned=structuredClone(x);
  if(i%3===0)
   cloned.hypothesis.evidenceAsPublished.radar['15m']={state:'MISSING'};
  return cloned;
 });
 const result=evaluateShadowProposal(candidate(),[...training,...noEvidence],{
  asset:'BTCUSDT',complete:true,
  publishedCount:training.length+noEvidence.length,now
 });
 assert.ok(result.unavailable>0);
 assert.ok(result.decisive<50);
 assert.equal(result.readyToApply,false);
});
test('missing Room pages, duplicates and mixed assets are refused',()=>{
 const p=candidate();
 const all=[...training,...future];
 for(const options of [
  {complete:false,publishedCount:all.length},
  {complete:true,publishedCount:all.length+2}
 ]){
  const result=evaluateShadowProposal(p,all,{asset:'BTCUSDT',now,...options});
  assert.equal(result.state,'INCOMPLETE');
 }
 const altered=[...all.slice(0,-1),{...all.at(-1),asset:'ETHUSDT'}];
 assert.equal(evaluateShadowProposal(p,altered,{
  asset:'BTCUSDT',complete:true,publishedCount:altered.length,now
 }).state,'INVALID');
 const dup=[...all.slice(0,-1),all[0]];
 assert.equal(evaluateShadowProposal(p,dup,{
  asset:'BTCUSDT',complete:true,publishedCount:dup.length,now
 }).state,'INVALID');
});
test('Room v5 migration, native bridge, manual UI and APK manifest stay aligned',()=>{
 const root=new URL('../apex9-android/native/src/main/java/com/apexintelligence/research/',import.meta.url);
 const db=readFileSync(new URL('ApexDatabase.kt',root),'utf8');
 const plugin=readFileSync(new URL('ApexNativePlugin.kt',root),'utf8');
 const js=readFileSync(new URL('./mobile-bridge.mjs',import.meta.url),'utf8');
 const ui=readFileSync(new URL('./forecast-feature-dashboard.mjs',import.meta.url),'utf8');
 const html=readFileSync(new URL('./index.html',import.meta.url),'utf8');
 const web=readFileSync(new URL('../apex9-android/scripts/prepare-web.mjs',import.meta.url),'utf8');
 for(const key of ['ResearchShadowCandidate::class','version = 5',
  'migration4To5','CREATE TABLE IF NOT EXISTS research_shadow_candidates',
  'registerShadowCandidate(candidate: ResearchShadowCandidate)',
  'shadowCandidates(asset: String)'])
   assert.ok(db.includes(key),'No schema step: '+key);
 for(const key of ['fun registerShadowCandidate(call: PluginCall)',
  'fun getShadowCandidates(call: PluginCall)',
  'dao.forecastCountForAsset(asset) != historySize',
  'latest.publishedAt != sourceAt',
  'ApexPreferences.read(app).favorites'])
  assert.ok(plugin.includes(key),'No native guard: '+key);
 assert.ok(js.includes('native.registerShadowCandidate('));
 assert.ok(js.includes('native.getShadowCandidates('));
 assert.ok(ui.includes("save.addEventListener('click'"));
 assert.ok(ui.includes('evaluateShadowProposal('));
 assert.ok(html.includes('id="feature-shadow-panel"'));
 assert.ok(web.includes("'forecast-shadow-forward.mjs'"));
});
