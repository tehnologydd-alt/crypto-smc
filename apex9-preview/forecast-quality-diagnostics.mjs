/**
 * APEX quality triage: hypotheses from one verified, manually requested
 * Room audit, NEVER proofs of causality or trade-model modifications.
 * No background requests, no archived evidence backfill.
 */
export const QUALITY_DIAGNOSTICS_VERSION='APEX_RESEARCH_DIAGNOSTICS_V1';
export const DIAGNOSTIC_LABELS=Object.freeze({
 INTEGRITY:'Ошибки исходных записей или снимков',
 NEED_OUTCOMES:'Недостаточно исходов TP3/SL',
 NEED_SCORES:'Недостаточно новых оценённых сценариев',
 SOURCE_GAP:'Не хватает снимков источников при публикации',
 RADAR_GAP:'Недостаточное покрытие Radar в проверочных окнах',
 RADAR_DROP:'Свежесть Radar ухудшилась между периодами',
 REGIME_SHIFT:'Состав рыночных режимов заметно изменился',
 BASELINE_DROP:'Снижение контрольной AUC между периодами',
 CANDIDATE_DROP:'Альтернатива уступила контролю в новом периоде',
 NO_SIGNAL:'Однозначного фактора пока не видно'
});
export const DIAGNOSTIC_CODES=Object.freeze(Object.keys(DIAGNOSTIC_LABELS));
export const DIAGNOSTIC_ACTIONS=Object.freeze({
 INTEGRITY:'Проверить ошибки Room и подтверждение времени источников.',
 NEED_OUTCOMES:'Дождаться исходов TP3/SL на новых свечах.',
 NEED_SCORES:'Продолжать собирать наблюдения после регистрации опыта.',
 SOURCE_GAP:'Проверить сохранение снимков источников при публикации.',
 RADAR_GAP:'Проверить доступность свежего Radar до прогноза.',
 RADAR_DROP:'Сверить время Radar в трёх независимых периодах.',
 REGIME_SHIFT:'Сравнить одинаковые формулы отдельно по режимам.',
 BASELINE_DROP:'Проверить контроль на следующей новой выборке.',
 CANDIDATE_DROP:'Повторить сравнение формул на новых исходах.',
 NO_SIGNAL:'Продолжать наблюдение, не придумывая объяснений.'
});
const FRAMES=['15m','1h','4h'],MODES=['DIRECTIONAL','RANGE','MIXED'];
const integer=v=>Number.isSafeInteger(v)&&v>=0;
const rate=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=1;
const assetOk=v=>typeof v==='string'&&/^[A-Z0-9]{5,20}$/.test(v);
export function diagnoseQualityFactors({asset,quality,challenge,regimes}={}){
 if(!assetOk(asset)||quality?.asset!==asset||
  challenge?.asset!==asset||regimes?.asset!==asset||
  !quality.frames||!challenge.frames||!regimes.frames||
  FRAMES.some(tf=>!quality.frames[tf]||!challenge.frames[tf]||
   !regimes.frames[tf]))
  return {version:QUALITY_DIAGNOSTICS_VERSION,asset,
   state:'UNAVAILABLE',frames:null,causalProof:false};
 const frames={};
 for(const tf of FRAMES){
  const q=quality.frames[tf],c=challenge.frames[tf],
   r=regimes.frames[tf],found=[];
  const add=code=>{if(!found.includes(code))found.push(code)};
  if(q.status==='CHECK_DATA'||q.issueCount>0||
   ['INVALID','INVALID_EVIDENCE','UNVERIFIED'].includes(c.state)||
   ['INVALID','INVALID_EVIDENCE','UNVERIFIED'].includes(r.state)){
   frames[tf]={state:'CHECK_DATA',codes:['INTEGRITY'],
    nextAction:DIAGNOSTIC_ACTIONS.INTEGRITY,causalProof:false};
   continue;
  }
  if(q.readiness?.some(g=>['decisive','lateDecisive'].includes(g.key)&&
   g.state!=='MET'))add('NEED_OUTCOMES');
  if(q.readiness?.some(g=>g.key==='futureScored'&&g.state!=='MET')||
   c.state==='LOW_SCORE_COVERAGE')add('NEED_SCORES');
  if(integer(q.source?.published)&&q.source.published>=20&&
   integer(q.source?.verifiedSnapshots)&&
   q.source.verifiedSnapshots/q.source.published<.70)
   add('SOURCE_GAP');
  const windows=Array.isArray(r.windows)&&r.windows.length===3?
   r.windows:null;
  if(windows){
   if(windows.some(w=>!integer(w?.eligible)||!integer(w?.invalid)||
    w.invalid>0)){
    frames[tf]={state:'CHECK_DATA',codes:['INTEGRITY'],
     nextAction:DIAGNOSTIC_ACTIONS.INTEGRITY,causalProof:false};
    continue;
   }
   const earliest=windows[0],latest=windows[2];
   if(latest.eligible>=20&&rate(latest.coverage)&&
    latest.coverage<.70)add('RADAR_GAP');
   if(earliest.eligible>=20&&latest.eligible>=20&&
    rate(earliest.coverage)&&rate(latest.coverage)&&
    earliest.coverage-latest.coverage>=.20)add('RADAR_DROP');
   if(earliest.eligible>=20&&latest.eligible>=20&&
    earliest.coverage>=.70&&latest.coverage>=.70&&
    integer(earliest.radarObserved)&&integer(latest.radarObserved)&&
    earliest.radarObserved>=20&&latest.radarObserved>=20&&
    MODES.every(m=>integer(earliest.modeEligible?.[m])&&
     integer(latest.modeEligible?.[m]))&&
    MODES.some(m=>Math.abs(
     earliest.modeEligible[m]/earliest.radarObserved-
     latest.modeEligible[m]/latest.radarObserved)>=.25))
    add('REGIME_SHIFT');
  }
  if(c.state==='DESCRIPTIVE'&&Array.isArray(c.models)){
   const baseline=c.models.find(x=>x.id==='STRUCTURE_V1')?.baselineAuc;
   if(Array.isArray(baseline)&&baseline.length===3&&baseline.every(rate)&&
    baseline[2]-baseline[0]<=-.10&&
    baseline[2]-baseline[1]<=-.04)add('BASELINE_DROP');
   if(c.models.some(x=>x.state==='RECENTLY_WORSE'))add('CANDIDATE_DROP');
  }
  if(!found.length)add('NO_SIGNAL');
  const codes=found.slice(0,5);
  frames[tf]={state:codes.includes('NEED_OUTCOMES')||
   codes.includes('NEED_SCORES')?'COLLECTING':
   codes[0]==='NO_SIGNAL'?'NO_FLAGS':'REVIEW',
   codes,nextAction:DIAGNOSTIC_ACTIONS[codes[0]],causalProof:false};
 }
 return {version:QUALITY_DIAGNOSTICS_VERSION,asset,frames,
  state:Object.values(frames).some(x=>x.state==='CHECK_DATA')?
   'CHECK_DATA':Object.values(frames).some(x=>x.state==='REVIEW')?
    'REVIEW':Object.values(frames).some(x=>x.state==='COLLECTING')?
    'COLLECTING':'NO_FLAGS',causalProof:false,modelChanged:false,
  note:'Факторы для проверки — не доказанные причины ошибки. '+
   'Снимки Radar фиксировались при публикации; отсутствие данных '+
   'не означает отключение API. Действующая модель не изменяется.'};
}
