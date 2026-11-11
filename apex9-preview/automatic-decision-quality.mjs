/**
 * Bounded, automatic, READ-ONLY full Room research audit for up to 10 favorites.
 * Runs when the Android WebView is active (startup/return/changed counters).
 * It does not run while the app process is killed; WorkManager market collection
 * is unrelated. No network requests, market polling, model training, promotion
 * or real-money operations. One full archive at a time, 1500 rows maximum.
 *
 * Successful fingerprints are cached for 6h, failed attempts for 30min.
 * A changed native outcome count invalidates the fingerprint immediately.
 * A separate 2min minimum interval protects against rapid tap/retry loops.
 */
import {getMobileAssetResearchArchive,getMobileResearchProgress}
 from './mobile-bridge.mjs';
import {inspectResearchArchive} from './forecast-release-readiness.mjs';
import {auditProbabilityReadiness} from './forecast-probability-readiness.mjs';
import {auditPreOutcomeStrength} from './forecast-preoutcome-strength.mjs';
import {auditFeatureContribution} from './forecast-feature-ablation.mjs';
import {auditRollingFeatureEvidence} from './forecast-feature-rolling.mjs';
import {auditShadowChallengers} from './forecast-shadow-challengers.mjs';
import {auditShadowRegimes} from './forecast-shadow-regimes.mjs';
import {summarizeResearchDataQuality} from './forecast-data-quality-hub.mjs';
import {diagnoseQualityFactors} from './forecast-quality-diagnostics.mjs';
import {auditFeaturePairs} from './forecast-feature-pairs.mjs';
import {auditFeaturePairRegimes,summarizeFeatureStageTwo}
 from './forecast-feature-regime-review.mjs';
import {auditShadowProbabilityLearner}
 from './forecast-shadow-probability-learner.mjs';
import {auditShadowCalibration} from './forecast-shadow-calibration.mjs';
import {inspectResearchRelease} from './forecast-release-readiness.mjs';
import {saveDecisionQualityAudit,readDecisionQuality}
 from './overview-decision-quality.mjs';

export const AUTO_DECISION_QUALITY_VERSION='APEX_AUTO_DECISION_QUALITY_V1';
export const AUTO_DECISION_QUALITY_RULES=Object.freeze({
 maxFavorites:10,maxRowsPerAsset:1500,pageSize:75,
 successTtlMs:6*3600000,failureTtlMs:30*60000,
 minimumRetryMs:2*60000,checkIntervalMs:10*60000,
 noMarketNetwork:true,noAutoTraining:true,modelChanged:false
});
const KEY='apex9:auto-decision-audit:v1';
const FRAMES=['15m','1h','4h'];
const time=x=>Number.isSafeInteger(x)&&x>0;
const count=x=>Number.isSafeInteger(x)&&x>=0;
const assetOK=x=>typeof x==='string'&&/^[A-Z0-9]{5,20}$/.test(x);
const favoritesOf=xs=>Array.isArray(xs)?
 [...new Set(xs.filter(assetOK))].slice(0,10):[];
const safeStorage=()=>{try{return globalThis.localStorage}catch{return null}};
const reasons=e=>String(e?.message||e||'Ошибка проверки')
 .replace(/[\x00-\x1f<>]/g,' ').slice(0,130);
const statusOf=(state,reason,other={})=>({
 state,reason,at:Date.now(),...other
});
const fingerprint=(progress,asset)=>{
 if(progress?.complete!==true||progress.source!=='LOCAL_ROOM_PROGRESS_V1'||
  !Array.isArray(progress.rows)||!Array.isArray(progress.favorites)||
  !progress.favorites.includes(asset))return null;
 const items=[];
 for(const tf of FRAMES){
  const row=progress.rows.find(r=>r?.asset===asset&&r.interval===tf);
  if(row&&(!count(row.published)||!count(row.recordedTerminal)||
   !count(row.newPublished)||row.recordedTerminal>row.published||
   row.newPublished>row.published))return null;
  items.push([row?.published||0,row?.recordedTerminal||0,
   row?.newPublished||0]);
 }
 return {signature:JSON.stringify(items),
  total:items.reduce((sum,x)=>sum+x[0],0)};
};
export function computeAutomaticDecisionAudit(archive,asset,{now=Date.now()}={}){
 const gate=inspectResearchArchive(archive,asset,{now});
 if(!gate.ready)return {state:gate.state,reason:gate.reason,audits:null};
 const input={asset,complete:archive.complete,
  publishedCount:archive.publishedCount,now};
 const rows=archive.forecasts;
 const probability=auditProbabilityReadiness(rows,input);
 if(!probability.frames)return {state:'CHECK_DATA',
  reason:probability.reason||'Исходы не прошли независимую проверку.',
  audits:null};
 const strength=auditPreOutcomeStrength(rows,input);
 const ablation=auditFeatureContribution(rows,input);
 const rolling=auditRollingFeatureEvidence(rows,input);
 const challenge=auditShadowChallengers(rows,input);
 const regimes=auditShadowRegimes(rows,{...input,challenger:challenge});
 const quality=summarizeResearchDataQuality(archive,{
  asset,now,reports:{probability,strength,ablation,rolling,
   challenger:challenge,regimes}
 });
 const pairs=auditFeaturePairs(rows,{...input,challenge});
 const pairRegimes=auditFeaturePairRegimes(rows,{
  ...input,challenge,pairs,regimes});
 const stage2=summarizeFeatureStageTwo(asset,pairs,pairRegimes);
 const shadowLearner=auditShadowProbabilityLearner(rows,input);
 const calibration=auditShadowCalibration(rows,{
  ...input,learner:shadowLearner});
 const release=inspectResearchRelease({asset,archive,quality,
  challenge,regimes,shadowLearner,calibration,checkedAt:now});
 if(!challenge.frames||!regimes.frames||!release.frames)
  return {state:'CHECK_DATA',
   reason:release.reason||'Недостаточно подтверждённого архива.',
   audits:null};
 const diagnostics=diagnoseQualityFactors({
  asset,quality,challenge,regimes});
 return {
  state:release.state,reason:release.note,
  audits:{challenge,regimes,diagnostics,pairs,pairRegimes,
   stage2,shadowLearner,calibration,release},
  changedModels:false
 };
}
const readMeta=(storage,now)=>{
 try{
  const raw=storage?.getItem?.(KEY);
  if(!raw||raw.length>6000)return {};
  const obj=JSON.parse(raw);
  if(obj?.version!==AUTO_DECISION_QUALITY_VERSION||
   !obj.assets||typeof obj.assets!=='object')return {};
  const valid={};
  for(const [asset,item] of Object.entries(obj.assets)){
   if(assetOK(asset)&&time(item?.lastAttempt)&&
    item.lastAttempt<=now+60000&&
    typeof item.signature==='string'&&item.signature.length<180&&
    ['SUCCESS','FAILED','EMPTY'].includes(item.kind)&&
    Object.keys(valid).length<10)
    valid[asset]=item;
  }
  return valid;
 }catch{return {}}
};
const writeMeta=(storage,items,now)=>{
 const entries=Object.entries(items)
  .filter(([k,v])=>assetOK(k)&&time(v?.lastAttempt)&&
   v.lastAttempt<=now+60000).slice(-10);
 try{storage?.setItem?.(KEY,JSON.stringify({
  version:AUTO_DECISION_QUALITY_VERSION,
  assets:Object.fromEntries(entries)
 }))}catch{}
};
export function createAutomaticDecisionAudit({
 getFavorites,loadProgress=getMobileResearchProgress,
 loadArchive=getMobileAssetResearchArchive,
 compute=computeAutomaticDecisionAudit,
 saveAudit=(archive,asset,opts)=>saveDecisionQualityAudit(archive,asset,opts),
 readAudit=(asset,opts)=>readDecisionQuality(asset,opts),
 storage=safeStorage(),now=Date.now,onStatus=()=>{},
 isVisible=()=>typeof document==='undefined'||
  document.visibilityState!=='hidden',
 yieldControl=()=>new Promise(resolve=>setTimeout(resolve,0))
}={}){
 if(typeof getFavorites!=='function')throw Error('Favorites provider required');
 let closed=false,sequence=0,active=null,again=false;
 const statuses=new Map();
 const state=(asset,value)=>{
  statuses.set(asset,{...value,at:now()});
  if(statuses.size>10){
   const first=statuses.keys().next().value;
   statuses.delete(first);
  }
  onStatus(asset,statuses.get(asset));
 };
 const previous=()=>readMeta(storage,now());
 const saveMeta=items=>writeMeta(storage,items,now());
 async function perform({focus=null,force=false}={}){
  const favorites=favoritesOf(getFavorites?.());
  if(closed||!favorites.length||!isVisible())return;
  const generation=sequence;
  let progress;
  try{progress=await loadProgress(favorites)}catch(e){
   for(const asset of favorites)state(asset,statusOf('UNAVAILABLE',reasons(e)));
   return;
  }
  if(closed||generation!==sequence||!isVisible())return;
  if(progress?.complete!==true||
   favorites.length!==progress.favorites?.length||
   favorites.some(x=>!progress.favorites.includes(x))){
   for(const asset of favorites)state(asset,statusOf('UNAVAILABLE',
    progress?.error||'Сводка Room пока недоступна.'));
   return;
  }
  const meta=previous();
  const order=focus&&favorites.includes(focus)?
   [focus,...favorites.filter(x=>x!==focus)]:favorites;
  let finished=0;
  for(const asset of order){
   if(closed||generation!==sequence||!isVisible()||
    !favoritesOf(getFavorites()).includes(asset))break;
   const f=fingerprint(progress,asset);
   if(!f){state(asset,statusOf('CHECK_DATA',
    'Непроверяемые счётчики Room.'));continue;}
   const old=meta[asset],age=now()-(old?.lastAttempt||0);
   const cached=readAudit(asset,{now:now(),storage});
   const matching=old?.signature===f.signature;
   if(!f.total){
    state(asset,statusOf('EMPTY',
     'Пока нет опубликованных сценариев для полного исследования.'));
    meta[asset]={signature:f.signature,lastAttempt:now(),kind:'EMPTY'};
    saveMeta(meta);continue;
   }
   if(old&&age<AUTO_DECISION_QUALITY_RULES.minimumRetryMs){
    state(asset,statusOf(cached?'CACHED':'COOLDOWN',
     cached?'Сохранённый аудит · короткий интервал между проверками':
     'Следующая попытка после защитного интервала.'));
    continue;
   }
   if(!force&&matching&&
    ((old.kind==='SUCCESS'&&cached&&
      age<AUTO_DECISION_QUALITY_RULES.successTtlMs)||
     (old.kind==='FAILED'&&
      age<AUTO_DECISION_QUALITY_RULES.failureTtlMs))){
    state(asset,statusOf(cached?'CACHED':'RETRY_LATER',
     cached?'Результат актуален для текущих счётчиков Room':
     'Повторная попытка запланирована позже.'));
    continue;
   }
   state(asset,statusOf('READING',
    'Автоматически проверяем полный Room-архив · '+(finished+1)+
    ' / '+order.length));
   // Yield between assets so the foreground WebView remains responsive.
   await yieldControl();
   if(closed||generation!==sequence||!isVisible())break;
   const attemptedAt=now();
   meta[asset]={signature:f.signature,lastAttempt:attemptedAt,kind:'FAILED'};
   saveMeta(meta);
   try{
    const archive=await loadArchive(asset,{
     pageSize:AUTO_DECISION_QUALITY_RULES.pageSize,
     maxRows:AUTO_DECISION_QUALITY_RULES.maxRowsPerAsset
    });
    if(closed||generation!==sequence||
     !favoritesOf(getFavorites()).includes(asset))break;
    const result=await compute(archive,asset,{now:now()});
    if(!result?.audits?.release)
     throw Error(result?.reason||'Полный аудит недоступен.');
    if(closed||generation!==sequence||
     !favoritesOf(getFavorites()).includes(asset))break;
    const saved=saveAudit(archive,asset,{
     now:now(),storage,audits:result.audits
    });
    if(!saved)throw Error('Не удалось сохранить проверенную сводку.');
    meta[asset]={signature:f.signature,lastAttempt:now(),kind:'SUCCESS'};
    saveMeta(meta);
    state(asset,statusOf('VERIFIED',
     'Полный архив проверен и сохранён · '+archive.forecasts.length+
     ' записей · статистика только исследовательская.'));
   }catch(e){
    state(asset,statusOf('FAILED',reasons(e)));
   }
   finished++;
  }
 }
 function run(opts={}){
  if(closed)return Promise.resolve();
  if(active){
   if(opts.invalidate){++sequence;again=true;}
   return active;
  }
  active=(async()=>{
   let next=opts;
   do{
    again=false;
    await perform(next);
    next={};
   }while(again&&!closed);
  })().finally(()=>{active=null});
  return active;
 }
 return {
  run,
  favoritesChanged(){++sequence;return run({invalidate:true})},
  getStatus:asset=>statuses.get(asset)||null,
  stop(){closed=true;++sequence;again=false},
  rules:AUTO_DECISION_QUALITY_RULES
 };
}
