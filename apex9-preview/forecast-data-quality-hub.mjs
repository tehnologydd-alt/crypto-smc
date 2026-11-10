/**
 * APEX Research Data Quality Hub v1.
 *
 * A compact, READ-ONLY synthesis of existing on-demand research audits
 * for one favorite and one full local Room archive. Never schedules a fetch,
 * changes a prediction, backfills research scores or claims calibrated
 * probability. Source coverage is taken from immutable as-published evidence;
 * missing data is NOT proof that a service is offline.
 */
import {featureFrameOf} from './forecast-feature-ablation.mjs';
import {inspectEvidenceContext,EVIDENCE_FEEDS}
 from './forecast-evidence-context.mjs';
import {READINESS_RULES} from './forecast-probability-readiness.mjs';
import {SHADOW_CHALLENGER_RULES}
 from './forecast-shadow-challengers.mjs';

export const DATA_QUALITY_HUB_VERSION='APEX_RESEARCH_DATA_QUALITY_HUB_V1';
export const DATA_QUALITY_HUB_RULES=Object.freeze({
 frames:Object.freeze(['15m','1h','4h']),
 noBackgroundRefresh:true,autoTraining:false,
 calibratedProbability:null,tradeExecution:false,
 source:'FULL_LOCAL_ROOM_ARCHIVE_SELECTED_FAVORITE'
});
const safeAsset=s=>typeof s==='string'&&/^[A-Z0-9]{5,20}$/.test(s);
const integer=n=>Number.isSafeInteger(n)&&n>=0;
const timestamp=n=>Number.isSafeInteger(n)&&n>0;
const statuses=['OBSERVED','STALE','MISSING','INVALID'];
const makeCounter=()=>({OBSERVED:0,STALE:0,MISSING:0,INVALID:0});
const count=(bucket,state)=>{
 if(Object.hasOwn(bucket,state))bucket[state]++;
 else bucket.INVALID++;
};
const ratio=(x,n)=>n>0?x/n:null;
const validReport=(r,asset)=>r?.asset===asset&&
 r.frames&&typeof r.frames==='object';
const gate=(name,observed,required)=>{
 const done=integer(observed)?observed:0;
 return {key:name,observed:done,required,
  state:done>=required?'MET':'COLLECTING'};
};
function asPublishedCoverage(rows){
 const frames=Object.fromEntries(DATA_QUALITY_HUB_RULES.frames.map(tf=>[
  tf,{published:0,verifiedSnapshots:0,legacySnapshots:0,
   invalidSnapshots:0,
   ownRadar:makeCounter(),
   feeds:Object.fromEntries(EVIDENCE_FEEDS.map(f=>[f,makeCounter()]))}
 ]));
 for(const row of rows){
  const tf=featureFrameOf(row);
  if(!frames[tf])continue;
  const item=frames[tf];
  item.published++;
  const snapshot=inspectEvidenceContext(row);
  if(snapshot.state==='LEGACY'){
   item.legacySnapshots++;
   continue;
  }
  if(snapshot.state!=='VERIFIED'){
   item.invalidSnapshots++;
   continue;
  }
  item.verifiedSnapshots++;
  count(item.ownRadar,snapshot.radar[tf]?.state);
  for(const feed of EVIDENCE_FEEDS){
   count(item.feeds[feed],snapshot.feeds[feed]?.state);
  }
 }
 for(const tf of DATA_QUALITY_HUB_RULES.frames){
  const item=frames[tf];
  item.snapshotCoverage=ratio(item.verifiedSnapshots,item.published);
  item.freshRadarCoverage=ratio(item.ownRadar.OBSERVED,item.published);
  item.feedFreshCoverage=Object.fromEntries(EVIDENCE_FEEDS.map(f=>[
   f,ratio(item.feeds[f].OBSERVED,item.published)
  ]));
 }
 return frames;
}
function frameOverview(tf,sources,reports){
 const probability=reports.probability.frames[tf];
 const strength=reports.strength.frames[tf];
 const ablation=reports.ablation.frames[tf];
 const rolling=reports.rolling.frames[tf];
 const challenger=reports.challenger.frames[tf];
 const regimes=reports.regimes.frames[tf];
 const published=probability?.published??sources.published;
 const decisive=probability?.total?.decisive??0;
 const lateDecisive=probability?.holdout?.decisive??0;
 const sinceRegistration=challenger?.futurePublished??0;
 const newScored=challenger?.newScored??0;
 const readiness=[
  gate('published',published,READINESS_RULES.minPublished),
  gate('decisive',decisive,READINESS_RULES.minDecisive),
  gate('lateDecisive',lateDecisive,READINESS_RULES.minHoldoutDecisive),
  gate('futureScored',newScored,
   SHADOW_CHALLENGER_RULES.minPostRegistrationScores)
 ];
 const errCount=(sources.invalidSnapshots||0)+
  (probability?.total?.invalid||0)+
  (strength?.total?.invalid||0)+
  (ablation?.invalidScores||0)+
  (rolling?.invalidScores||0)+
  (challenger?.invalidStrength||0);
 const invalidState=[probability?.status,strength?.state,
  ablation?.state,rolling?.state,challenger?.state,regimes?.state]
  .some(x=>['INVALID','INVALID_EVIDENCE','UNVERIFIED'].includes(x));
 const errors=errCount>0||invalidState;
 let reason,action;
 if(errors){
  reason='Обнаружены недостоверные события или снимки данных.';
  action='Проверить целостность записей Room и исходных источников.';
 }else if(!published){
  reason='Пока нет опубликованных направленных прогнозов этого ТФ.';
  action='Наблюдать за сбором закрытых свечей для избранного актива.';
 }else if(published<READINESS_RULES.minPublished){
  reason='Накоплено меньше минимальной исторической выборки.';
  action='Продолжить пассивное накопление проверяемых исследований.';
 }else if(decisive<READINESS_RULES.minDecisive||
  lateDecisive<READINESS_RULES.minHoldoutDecisive){
  reason='Для независимой оценки исходов пока недостаточно TP3/SL.';
  action='Дождаться проверенных конечных исходов; не считать TP1/TP2 за TP3.';
 }else if(newScored<SHADOW_CHALLENGER_RULES.minPostRegistrationScores){
  reason='История есть, но после регистрации Challenger мало новых баллов.';
  action='Продолжить наблюдения; не заполнять старые прогнозы задним числом.';
 }else if(challenger?.state==='LOW_SCORE_COVERAGE'){
  reason='Слишком много новых прогнозов без подтверждённого балла.';
  action='Проверить доступность закрытых свечей и данных объёма.';
 }else if(regimes?.state==='LOW_COVERAGE'||
  (regimes?.windows&&regimes.windows.some(w=>
   w.coverage!==null&&w.coverage<.70))){
  reason='Для сравнений по режимам не хватает свежего Radar.';
  action='Проверить время наблюдений Radar и полноту снимков.';
 }else if(challenger?.state!=='DESCRIPTIVE'){
  reason='Модели пока не прошли независимое сравнение по всем периодам.';
  action='Накопить TP3 и SL для каждого исследовательского периода.';
 }else if(regimes?.state!=='DESCRIPTIVE'){
  reason='Модели исследованы, но для отдельных режимов данных ещё мало.';
  action='Собирать дополнительные исходы в разных рыночных состояниях.';
 }else{
  reason='Накоплены данные для описательного сравнения моделей и режимов.';
  action='Продолжать проверку на будущих данных; выводы не менять автоматически.';
 }
 return {
  interval:tf,published,decisive,lateDecisive,
  sinceRegistration,newScored,
  readiness,source:sources,issueCount:errCount,
  status:errors?'CHECK_DATA':
   challenger?.state==='DESCRIPTIVE'&&regimes?.state==='DESCRIPTIVE'?
    'DESCRIPTIVE_READY':'COLLECTING',
  reason,nextAction:action,
  audits:{
   probability:probability?.status||'UNKNOWN',
   strength:strength?.state||'UNKNOWN',
   ablation:ablation?.state||'UNKNOWN',
   rolling:rolling?.state||'UNKNOWN',
   challenger:challenger?.state||'UNKNOWN',
   regimes:regimes?.state||'UNKNOWN'
  },
  calibratedProbability:null,modelChanged:false
 };
}
export function summarizeResearchDataQuality(archive,{
 asset,now=Date.now(),reports
}={}){
 const blocked=(state,reason)=>({
  version:DATA_QUALITY_HUB_VERSION,asset,state,reason,
  frames:null,autoTraining:false,calibratedProbability:null,
  rules:DATA_QUALITY_HUB_RULES
 });
 if(!safeAsset(asset)||!timestamp(now)||!Array.isArray(archive?.forecasts)||
  archive.forecasts.some(r=>r?.asset!==asset||typeof r.id!=='string'||
   !r.id||!timestamp(r.publishedAt)||r.publishedAt>now+60000))
  return blocked('INVALID','Ошибка формата исходного Room-архива.');
 if(archive.complete!==true||!integer(archive.publishedCount)||
  archive.forecasts.length!==archive.publishedCount)
  return blocked('INCOMPLETE','Нужен полный Room-архив одного избранного актива.');
 if(new Set(archive.forecasts.map(x=>x.id)).size!==archive.forecasts.length)
  return blocked('INVALID','В исходном архиве повторяются ID прогнозов.');
 for(const key of ['probability','strength','ablation','rolling',
  'challenger','regimes']){
  if(!validReport(reports?.[key],asset))
   return blocked('INVALID','Недоступен проверенный результат '+key+'.');
 }
 const coverage=asPublishedCoverage(archive.forecasts);
 for(const tf of DATA_QUALITY_HUB_RULES.frames){
  if(reports.probability.frames[tf]?.published!==coverage[tf].published)
   return blocked('INVALID','Несогласованная выборка прогнозов для '+tf+'.');
 }
 const frames=Object.fromEntries(DATA_QUALITY_HUB_RULES.frames.map(tf=>[
  tf,frameOverview(tf,coverage[tf],reports)
 ]));
 return {version:DATA_QUALITY_HUB_VERSION,
  asset,archiveRows:archive.forecasts.length,
  state:Object.values(frames).some(x=>x.status==='CHECK_DATA')?
   'CHECK_DATA':Object.values(frames).every(x=>x.status==='DESCRIPTIVE_READY')?
    'DESCRIPTIVE':'COLLECTING',
  frames,autoTraining:false,calibratedProbability:null,
  note:'Это статус полноты локальных исследовательских данных, '+
   'а не состояние подключения API, гарантия точности или '+
   'вероятность положительного результата. Нет автоматического обучения '+
   'и изменения действующих прогнозов.',
  rules:DATA_QUALITY_HUB_RULES};
}
