/**
 * Shadow Challenger regimes V1.
 * Only published, source-verified as-of Radar modes. No hindsight regimes.
 * Comparable candidate and control AUC are calculated on the EXACT same
 * non-overlapping M15/H1/H4 outcomes, separately in each time block and mode.
 * Descriptive, read-only research; no probability or model promotion.
 */
import {inspectEvidenceContext} from './forecast-evidence-context.mjs';
import {inspectPreOutcomeStrength} from './forecast-preoutcome-strength.mjs';
import {featureFrameOf,featureWindowAudit,rankingAuc}
 from './forecast-feature-ablation.mjs';
import {
 auditShadowChallengers,SHADOW_CHALLENGER_VERSION,SHADOW_CHALLENGER_REGISTRATION,
 SHADOW_CHALLENGER_RECIPES,SHADOW_CHALLENGER_RULES,
 challengerScore
} from './forecast-shadow-challengers.mjs';

export const SHADOW_REGIMES_VERSION='APEX_SHADOW_REGIME_COMPARISON_V1';
export const SHADOW_REGIMES_RULES=Object.freeze({
 modes:Object.freeze(['DIRECTIONAL','RANGE','MIXED']),
 minModeCoverage:.70,minModeDecisivePerWindow:10,
 minModeTp3PerWindow:3,minModeStopPerWindow:3,
 minDeltaAuc:SHADOW_CHALLENGER_RULES.minimumDeltaAuc,
 noHindsight:true,modelChanged:false,autoPromotion:false
});
const time=v=>Number.isSafeInteger(v)&&v>0;
const num=v=>typeof v==='number'&&Number.isFinite(v);
const empty=()=>({
 eligible:0,radarObserved:0,missing:0,stale:0,invalid:0,
 excludedMissingStrength:0,coverage:null,
 modeEligible:{DIRECTIONAL:0,RANGE:0,MIXED:0}
});
const modeCounts=()=>({eligible:0,tp3:0,stop:0,decisive:0});
const no=(state,reason)=>({state,reason,models:[]});
/** Match an as-published regime strictly to the scenario's own timeframe. */
export function inspectPublishedRegime(row){
 const frame=featureFrameOf(row);
 if(!frame)return {state:'NOT_DIRECTIONAL',mode:null};
 const evidence=inspectEvidenceContext(row);
 if(evidence.state==='INVALID')
  return {state:'INVALID',mode:null,
   reason:'Ошибка времени или формата сохранённого Radar'};
 if(evidence.state!=='VERIFIED')
  return {state:'MISSING',mode:null,
   reason:'Радар не был сохранён при публикации'};
 const radar=evidence.radar[frame];
 if(radar?.state!=='OBSERVED')
  return {state:radar?.state==='INVALID'?'INVALID':
   radar?.state==='STALE'?'STALE':'MISSING',
   mode:null,reason:'Нет свежего подтверждённого Radar на момент публикации'};
 if(!SHADOW_REGIMES_RULES.modes.includes(radar.mode))
  return {state:'INVALID',mode:null};
 return {state:'OBSERVED',mode:radar.mode,
  observedAt:radar.observedAt,candleAt:radar.candleAt};
}
function groupWindow(win,byId,tf){
 const coverage=empty();
 const modes=Object.fromEntries(SHADOW_REGIMES_RULES.modes.map(m=>[
  m,{...modeCounts(),samples:[]}]));
 const observedById=new Map();
 // Coverage denominator includes ALL non-overlapping eligible forecasts,
 // not only favorable/decisive outcomes. No outcome-based source selection.
 for(const item of win.eligibleRows){
  const row=byId.get(item.id);
  coverage.eligible++;
  if(!row){coverage.invalid++;continue;}
  const regime=inspectPublishedRegime(row);
  if(regime.state==='INVALID'){coverage.invalid++;continue;}
  if(regime.state==='MISSING'){coverage.missing++;continue;}
  if(regime.state==='STALE'){coverage.stale++;continue;}
  if(regime.state!=='OBSERVED'){coverage.invalid++;continue;}
  coverage.radarObserved++;
  coverage.modeEligible[regime.mode]++;
  modes[regime.mode].eligible++;
  observedById.set(item.id,regime.mode);
 }
 coverage.coverage=coverage.eligible?
  coverage.radarObserved/coverage.eligible:null;
 for(const sample of win.samples){
  const mode=observedById.get(sample.id);
  if(!mode)continue;
  const m=modes[mode];m.samples.push(sample);
  m.decisive++;
  if(sample.outcome==='TP3')m.tp3++;
  else m.stop++;
 }
 return {coverage,modes,verifiedOutcomes:win.samples.length};
}
function regimeComparison(windows,mode){
 const groups=windows.map(x=>x.modes[mode]);
 const readiness=groups.every(x=>
  x.decisive>=SHADOW_REGIMES_RULES.minModeDecisivePerWindow&&
  x.tp3>=SHADOW_REGIMES_RULES.minModeTp3PerWindow&&
  x.stop>=SHADOW_REGIMES_RULES.minModeStopPerWindow);
 if(!readiness)return no('COLLECTING',
  'Нужно ≥10 TP3/SL, включая ≥3 TP3 и ≥3 SL, для этого режима в каждом периоде.');
 const ref=SHADOW_CHALLENGER_RECIPES[0];
 const baseline=groups.map(g=>rankingAuc(g.samples,
  x=>challengerScore(x.features,ref)));
 if(baseline.some(x=>!num(x)))
  return no('COLLECTING','Для этого режима недостаточно двух типов исходов.');
 const models=SHADOW_CHALLENGER_RECIPES.slice(1).map(candidate=>{
  const auc=groups.map(g=>rankingAuc(g.samples,
   x=>challengerScore(x.features,candidate)));
  const delta=auc.map((x,i)=>x-baseline[i]);
  const threshold=SHADOW_REGIMES_RULES.minDeltaAuc;
  const state=delta[2]<=-threshold?'RECENTLY_WORSE':
   delta.every(x=>x>=threshold)?'OBSERVED_THREE_TIMES':
   (delta[0]>=threshold||delta[1]>=threshold)&&
    delta[2]<threshold?'NO_LONGER_BETTER':
   delta[2]>=threshold?'LATE_ONLY':'NOT_BETTER';
  return {
   id:candidate.id,name:candidate.name,state,
   referenceAuc:baseline,challengerAuc:auc,deltaAuc:delta,
   counts:groups.map(g=>({tp3:g.tp3,stop:g.stop})),
   promoted:false,calibratedProbability:null
  };
 });
 return {state:'DESCRIPTIVE',
  reason:'Три периода одного режима сопоставлены на одинаковых подтверждённых исходах.',
  models};
}
export function auditShadowRegimes(rows,{
 asset,complete=false,publishedCount=null,now=Date.now(),
 challenger=null
}={}){
 // The manual full-archive audit has already computed this report.
 // Reusing it avoids a second O(n) challenger pass on Android.
 const core=challenger??auditShadowChallengers(rows,{
  asset,complete,publishedCount,now
 });
 const blocked=(state,reason)=>({
  version:SHADOW_REGIMES_VERSION,asset,state,reason,
  frames:null,autoPromoted:false,modelChanged:false,
  calibratedProbability:null,rules:SHADOW_REGIMES_RULES
 });
 if(challenger&&(core.version!==SHADOW_CHALLENGER_VERSION||
  core.asset!==asset||
  core.registeredAt!==SHADOW_CHALLENGER_REGISTRATION||
  core.autoPromoted!==false||core.modelChanged!==false||
  !core.frames))
  return blocked('INVALID_EVIDENCE',
   'Несогласованный исходный аудит Shadow. Повторите полный архив.');
 if(!core.frames)return blocked(core.state,core.reason);
 const frames={};
 for(const tf of ['15m','1h','4h']){
  const baseline=core.frames[tf];
  const base={interval:tf,registrationAt:SHADOW_CHALLENGER_REGISTRATION,
   futurePublished:baseline.futurePublished,
   newScored:baseline.newScored,
   state:baseline.state,reason:baseline.reason,
   windows:null,regimes:null,
   modelChanged:false,calibratedProbability:null};
  if(baseline.state!=='DESCRIPTIVE'){
   frames[tf]=base;continue;
  }
  const forward=rows.filter(row=>featureFrameOf(row)===tf&&
   row.publishedAt>SHADOW_CHALLENGER_REGISTRATION)
   .sort((a,b)=>a.publishedAt-b.publishedAt||a.id.localeCompare(b.id));
  const scored=forward.filter(row=>
   inspectPreOutcomeStrength(row).state==='VERIFIED');
  const current=scored.slice(-SHADOW_CHALLENGER_RULES.minPostRegistrationScores);
  const n=SHADOW_CHALLENGER_RULES.windowSize;
  if(current.length!==3*n){
   frames[tf]={...base,state:'INVALID_EVIDENCE',
    reason:'Не удалось восстановить контрольные окна.'};
   continue;
  }
  const cuts=[current[n].publishedAt,current[2*n].publishedAt];
  // The exact same window and purge algorithm as the parent challenger audit.
  const slices=[
   featureWindowAudit(current.slice(0,n),{now,cutAt:cuts[0]}),
   featureWindowAudit(current.slice(n,2*n),{now,cutAt:cuts[1]}),
   featureWindowAudit(current.slice(2*n),{now})
  ];
  const byId=new Map(current.map(x=>[x.id,x]));
  const windows=slices.map(s=>groupWindow(s,byId,tf));
  const overview=windows.map(x=>x.coverage);
  const common={...base,windows:overview,
   regimes:Object.fromEntries(SHADOW_REGIMES_RULES.modes.map(mode=>[
    mode,{
     ...no('COLLECTING','Ещё недостаточно наблюдений режима.'),
     windows:windows.map(x=>{
      const group=x.modes[mode];
      return {eligible:group.eligible,tp3:group.tp3,
       stop:group.stop,decisive:group.decisive};
     })
    }
   ]))};
  if(overview.some(x=>x.invalid)){
   frames[tf]={...common,state:'INVALID_EVIDENCE',
    reason:'Повреждён опубликованный контекст Radar. Вывод запрещён.'};
   continue;
  }
  if(overview.some(x=>x.coverage===null||
   x.coverage<SHADOW_REGIMES_RULES.minModeCoverage)){
   frames[tf]={...common,state:'LOW_COVERAGE',
    reason:'Менее 70% прогнозов имеют проверенный Radar на момент публикации.'};
   continue;
  }
  const regimes={};
  for(const mode of SHADOW_REGIMES_RULES.modes){
   const verdict=regimeComparison(windows,mode);
   regimes[mode]={...verdict,windows:windows.map(x=>{
    const group=x.modes[mode];
    return {eligible:group.eligible,tp3:group.tp3,
     stop:group.stop,decisive:group.decisive};
   })};
  }
  const compared=Object.values(regimes).filter(x=>
   x.state==='DESCRIPTIVE').length;
  frames[tf]={...common,regimes,
   state:compared?'DESCRIPTIVE':'COLLECTING',
   reason:compared?
    'По некоторым режимам доступны описательные сравнения фиксированных формул.':
    'В каждом режиме нужны оба типа исходов на трёх отдельных периодах.',
   comparedModes:compared};
 }
 return {
  version:SHADOW_REGIMES_VERSION,asset,frames,
  state:Object.values(frames).some(x=>x.state==='DESCRIPTIVE')?
   'DESCRIPTIVE':'COLLECTING',
  registrationAt:SHADOW_CHALLENGER_REGISTRATION,
  autoPromoted:false,modelChanged:false,calibratedProbability:null,
  note:'Рыночный режим берётся только из Radar, записанного до прогноза. '+
   'Режимы могут зависеть от тех же свечей, что и исследуемые баллы; '+
   'разница AUC не доказывает стабильной точности, значимости или прибыльности. '+
   'Нет выбора победителей, торговли, автообучения и изменения прогнозов.',
  rules:SHADOW_REGIMES_RULES
 };
}
