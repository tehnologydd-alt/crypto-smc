/**
 * APEX Stage 5: bounded release-readiness and archive-integrity checks.
 *
 * Pure functions. Release readiness here means the LOCAL RESEARCH AUDIT
 * has verified inputs, NOT a proven predictor, live uptime, installed
 * APK behavior, trading permission or a deployment certificate.
 *
 * No network requests, persisted fitted parameters, model promotion,
 * source backfilling or background Room scans.
 */
export const RESEARCH_RELEASE_VERSION='APEX_RESEARCH_RELEASE_GATE_V1';
export const RELEASE_ARCHIVE_MAX=1500;
const TFS=['15m','1h','4h'];
const validAsset=x=>typeof x==='string'&&/^[A-Z0-9]{5,20}$/.test(x);
const time=x=>Number.isSafeInteger(x)&&x>0;
const count=x=>Number.isSafeInteger(x)&&x>=0;
const auditFail=(state,reason,details={})=>({
 version:RESEARCH_RELEASE_VERSION,state,reason,ready:false,
 ...details
});
/** Single O(n) preflight for a user-initiated Room archive. Never truncate
 * at 1500 and misleadingly report a partial archive as complete.
 */
export function inspectResearchArchive(archive,asset,{
 now=Date.now(),maxRows=RELEASE_ARCHIVE_MAX
}={}){
 if(!validAsset(asset)||!time(now))
  return auditFail('CHECK_DATA','Некорректный актив или время аудита.');
 if(archive?.native!==true||archive?.error)
  return auditFail('UNAVAILABLE',
   archive?.error||'Нет подтверждённого локального Room-архива.');
 if(archive.complete!==true||!Array.isArray(archive.forecasts)||
  !count(archive.publishedCount)||
  archive.publishedCount!==archive.forecasts.length)
  return auditFail('INCOMPLETE','Полный локальный архив недоступен.');
 if(!Number.isSafeInteger(maxRows)||maxRows<=0||
  archive.forecasts.length>maxRows)
  return auditFail('LIMIT_REACHED',
   'Лимит записей достигнут, частичный архив запрещён.',{
    records:archive.forecasts.length,limit:maxRows});
 const seen=new Set();
 for(const row of archive.forecasts){
  if(row?.asset!==asset||typeof row.id!=='string'||!row.id||
   !time(row.publishedAt)||row.publishedAt>now+60000||
   !['15m','1h','4h'].includes(row.interval))
   return auditFail('CHECK_DATA',
    'Повреждена запись, таймфрейм или дата публикации.');
  if(seen.has(row.id))
   return auditFail('CHECK_DATA',
    'Повторный идентификатор прогноза: история не проверена.');
  seen.add(row.id);
 }
 return {version:RESEARCH_RELEASE_VERSION,
  state:archive.forecasts.length?'READY_TO_AUDIT':'EMPTY',
  reason:archive.forecasts.length?
   'Проверена целостность списка. Исходы сверяются отдельно.':
   'Архив пуст. Собирать события без подстановки истории.',
  ready:archive.forecasts.length>0,
  asset,records:archive.forecasts.length,limit:maxRows,
  checkedAt:now,fullArchive:true,trained:false,
  calibratedProbability:null};
}
const untrusted=['INVALID','INVALID_EVIDENCE','UNVERIFIED',
 'CHECK_DATA','INCOMPLETE','LOW_SCORE_COVERAGE'];
/** Post-audit summary uses ALREADY COMPUTED manual research reports.
 * Never converts statistical findings into production model readiness.
 */
export function inspectResearchRelease({asset,archive,quality,
 challenge,regimes,shadowLearner,calibration,
 checkedAt=Date.now(),elapsedMs=null}={}){
 const base=inspectResearchArchive(archive,asset,{now:checkedAt});
 if(!base.ready)return {...base,frames:null,modelChanged:false};
 const reports=[quality,challenge,regimes,shadowLearner,calibration];
 if(reports.some(x=>x?.asset!==asset||!x.frames||
  TFS.some(tf=>!x.frames[tf])))
  return auditFail('CHECK_DATA',
   'Отсутствуют согласованные результаты полного ручного аудита.',{
    frames:null,asset,records:base.records,modelChanged:false});
 const frames={};
 for(const tf of TFS){
  const q=quality.frames[tf],c=challenge.frames[tf],
   r=regimes.frames[tf],s=shadowLearner.frames[tf],
   p=calibration.frames[tf];
  const anyInvalid=untrusted.some(x=>
   x===q.status||x===c.state||x===r.state||
   x===s.state||x===p.state)||q.issueCount>0;
  const state=anyInvalid?'CHECK_DATA':
   s.state==='EVALUATED'&&p.holdoutMetrics?.length===2&&
    p.regime?.state==='STABLE'?'REVIEWED':
   s.state==='EVALUATED'&&p.holdoutMetrics?.length===2?
    'NEEDS_REVIEW':'COLLECTING';
  frames[tf]={state,newScored:count(c.newScored)?c.newScored:0,
   learnerScored:count(s.scored)?s.scored:0,
   required:240,
   calibrationState:p.state,
   reason:state==='CHECK_DATA'?'Проверить исходные данные и время записи':
    state==='REVIEWED'?'Проверены выборки, прогноз не подтверждён':
    state==='NEEDS_REVIEW'?'Есть предупреждение калибровки или режима':
    'Накопление подтверждённых будущих исходов'};
 }
 const states=Object.values(frames).map(x=>x.state);
 const state=states.includes('CHECK_DATA')?'CHECK_DATA':
  states.every(x=>x==='REVIEWED')?'RESEARCH_REVIEWED':
  states.includes('NEEDS_REVIEW')?'NEEDS_REVIEW':'COLLECTING';
 return {version:RESEARCH_RELEASE_VERSION,asset,
  state,frames,records:base.records,fullArchive:true,
  elapsedMs:count(elapsedMs)&&elapsedMs<=600000?elapsedMs:null,
  modelChanged:false,trainedForProduction:false,
  calibratedProbability:null,automaticTrading:false,
  note:'Это проверка целостности и исследовательской воспроизводимости '+
   'для избранного актива, не подтверждение точности, доходности или '+
   'готовности к торговле. Android-сборка и проверки реального устройства '+
   'отслеживаются отдельно. Никакие модели не внедряются автоматически.'};
}
