/**
 * Fixed pair-feature comparisons on the SAME three preregistered, purged
 * forward windows as Shadow Challenger. No fit, hyperparameter search,
 * model selection, orders or re-scoring of old forecasts.
 *
 * Pair AUC compared with the better of its two single-feature AUCs *on
 * the same cohort*. This is a conservative DESCRIPTIVE benchmark, not an
 * independent significance test. Correlation is descriptive Spearman rho
 * on verified, non-overlapping terminal rows; selection bias remains.
 */
import {inspectPreOutcomeStrength}
 from './forecast-preoutcome-strength.mjs';
import {featureFrameOf,featureWindowAudit,rankingAuc,FROZEN_FEATURES}
 from './forecast-feature-ablation.mjs';
import {SHADOW_CHALLENGER_REGISTRATION,SHADOW_CHALLENGER_RULES}
 from './forecast-shadow-challengers.mjs';

export const FEATURE_PAIRS_VERSION='APEX_FROZEN_FEATURE_PAIRS_V1';
export const FEATURE_PAIRS=Object.freeze([
 Object.freeze({id:'EFFICIENCY_TRAVEL',a:'efficiency',b:'travelNorm',
  label:'Эффективность + импульс'}),
 Object.freeze({id:'EFFICIENCY_VOLUME',a:'efficiency',b:'volumeNorm',
  label:'Эффективность + объём'}),
 Object.freeze({id:'TRAVEL_VOLUME',a:'travelNorm',b:'volumeNorm',
  label:'Импульс + объём'})
]);
export const FEATURE_PAIR_STATES=Object.freeze([
 'REPEATED_ADDITION','OVERLAPPING','RECENT_SETBACK',
 'EARLY_ONLY','LATEST_ONLY','NO_REPEATED_ADDITION'
]);
const TFS=['15m','1h','4h'];
const time=x=>Number.isSafeInteger(x)&&x>0;
const validAsset=s=>typeof s==='string'&&/^[A-Z0-9]{5,20}$/.test(s);
const valid=x=>typeof x==='number'&&Number.isFinite(x);
const normalized=x=>valid(x)&&x>=0&&x<=1;
const round=x=>Math.round(x*10000)/10000;
const weights=Object.fromEntries(FROZEN_FEATURES.map(x=>[x.key,x.weight]));
/** Pair weights are fixed by original .50/.30/.20, never optimized. */
export function frozenPairScore(features,a,b){
 if(!features||!normalized(features[a])||!normalized(features[b])||
  !valid(weights[a])||!valid(weights[b])||a===b)return null;
 return (weights[a]*features[a]+weights[b]*features[b])/
  (weights[a]+weights[b]);
}
const averageRanks=values=>{
 const sorted=values.map((value,i)=>({value,i})).sort((a,b)=>
  a.value-b.value||a.i-b.i);
 const ranks=new Array(values.length);
 for(let i=0;i<sorted.length;){
  let j=i;
  while(j<sorted.length&&sorted[j].value===sorted[i].value)j++;
  const mean=(i+j+1)/2;
  for(let k=i;k<j;k++)ranks[sorted[k].i]=mean;
  i=j;
 }
 return ranks;
};
/** Tied-value Spearman rank correlation. A constant feature = unknown. */
export function spearmanPair(samples,a,b){
 if(!Array.isArray(samples)||samples.length<3||
  samples.some(x=>!normalized(x?.features?.[a])||
   !normalized(x?.features?.[b])))return null;
 const x=averageRanks(samples.map(s=>s.features[a]));
 const y=averageRanks(samples.map(s=>s.features[b]));
 const mean=(samples.length+1)/2;
 let numerator=0,xx=0,yy=0;
 for(let i=0;i<x.length;i++){
  const dx=x[i]-mean,dy=y[i]-mean;
  numerator+=dx*dy;xx+=dx*dx;yy+=dy*dy;
 }
 return xx>0&&yy>0?round(numerator/Math.sqrt(xx*yy)):null;
}
export function comparePairWindows(windows){
 if(!Array.isArray(windows)||windows.length!==3||
  windows.some(w=>!Array.isArray(w)||w.length<
   SHADOW_CHALLENGER_RULES.minDecisivePerWindow||
   w.some(s=>!['TP3','STOP'].includes(s?.outcome)||
    !s.features||Object.keys(weights).some(k=>
     !normalized(s.features[k])))||
   w.filter(s=>s.outcome==='TP3').length<
    SHADOW_CHALLENGER_RULES.minTp3PerWindow||
   w.filter(s=>s.outcome==='STOP').length<
    SHADOW_CHALLENGER_RULES.minStopPerWindow))
  return null;
 const pairs=[];
 for(const pair of FEATURE_PAIRS){
  const periods=[];
  for(const samples of windows){
   const singleA=rankingAuc(samples,s=>s.features[pair.a]);
   const singleB=rankingAuc(samples,s=>s.features[pair.b]);
   const combined=rankingAuc(samples,s=>
    frozenPairScore(s.features,pair.a,pair.b));
   if(!normalized(singleA)||!normalized(singleB)||
    !normalized(combined))return null;
   const gain=round(combined-Math.max(singleA,singleB));
   periods.push({gain,pairAuc:round(combined),
    betterSingleAuc:round(Math.max(singleA,singleB)),
    correlation:spearmanPair(samples,pair.a,pair.b)});
  }
  const deltas=periods.map(x=>x.gain);
  const highCorrelation=periods.filter(x=>
   x.correlation!==null&&Math.abs(x.correlation)>=.85).length>=2;
  const state=deltas.every(d=>d>=.03)?'REPEATED_ADDITION':
   deltas[2]<=-.03?'RECENT_SETBACK':
   highCorrelation&&deltas.every(d=>Math.abs(d)<.03)?'OVERLAPPING':
   (deltas[0]>=.03||deltas[1]>=.03)&&deltas[2]<.03?
    'EARLY_ONLY':
   deltas[2]>=.03?'LATEST_ONLY':'NO_REPEATED_ADDITION';
  pairs.push({id:pair.id,label:pair.label,state,periods});
 }
 return pairs;
}
export function auditFeaturePairs(rows,{asset,complete=false,
 publishedCount=null,now=Date.now(),challenge=null}={}){
 const fail=(state,reason)=>({version:FEATURE_PAIRS_VERSION,
  asset,state,reason,frames:null,trained:false,
  calibratedProbability:null,modelChanged:false});
 if(!validAsset(asset)||!time(now)||!Array.isArray(rows)||
  rows.some(x=>x?.asset!==asset||typeof x.id!=='string'||
   !x.id||!time(x.publishedAt)||x.publishedAt>now+60000))
  return fail('INVALID','Некорректный локальный архив.');
 if(complete!==true||!Number.isSafeInteger(publishedCount)||
  publishedCount!==rows.length)
  return fail('INCOMPLETE','Требуется полный архив выбранного актива.');
 if(new Set(rows.map(x=>x.id)).size!==rows.length)
  return fail('INVALID','Повторяются идентификаторы прогноза.');
 if(challenge?.asset!==asset||!challenge.frames||
  challenge.registeredAt!==SHADOW_CHALLENGER_REGISTRATION)
  return fail('INVALID','Недоступна согласованная Shadow-проверка.');
 const frames={};
 for(const tf of TFS){
  const parent=challenge.frames[tf];
  const base={state:'COLLECTING',pairs:[],
   reason:'Нужно 120 новых проверенных прогнозов после регистрации Shadow.',
   comparableDecisive:null};
  if(!parent||parent.state!=='DESCRIPTIVE'){
   frames[tf]={
    ...base,state:parent?.state==='INVALID_EVIDENCE'?
     'INVALID_EVIDENCE':'COLLECTING',
    reason:parent?.reason||base.reason};
   continue;
  }
  const cohort=rows.filter(x=>featureFrameOf(x)===tf&&
   x.publishedAt>SHADOW_CHALLENGER_REGISTRATION)
   .sort((a,b)=>a.publishedAt-b.publishedAt||a.id.localeCompare(b.id));
  const scored=cohort.filter(row=>
   inspectPreOutcomeStrength(row).state==='VERIFIED');
  const n=SHADOW_CHALLENGER_RULES.windowSize;
  const current=scored.slice(-n*3);
  if(current.length!==n*3||!Array.isArray(parent.cuts)||
   parent.cuts.length!==2||
   current[n].publishedAt!==parent.cuts[0]||
   current[n*2].publishedAt!==parent.cuts[1]){
   frames[tf]={...base,state:'INVALID_EVIDENCE',
    reason:'Временные окна не совпали с исходной Shadow-проверкой.'};
   continue;
  }
  const blocks=[
   featureWindowAudit(current.slice(0,n),
    {now,cutAt:parent.cuts[0]}),
   featureWindowAudit(current.slice(n,2*n),
    {now,cutAt:parent.cuts[1]}),
   featureWindowAudit(current.slice(2*n),{now})
  ];
  // Same exact publication, embargo, outcome and coverage constraints
  // as the registered Shadow experiment. Discrepancies fail closed.
  if(blocks.some((w,i)=>w.metrics.invalid||w.metrics.legacyH1||
   w.metrics.decisive!==parent.windows?.[i]?.decisive||
   w.metrics.tp3!==parent.windows?.[i]?.tp3||
   w.metrics.stop!==parent.windows?.[i]?.stop)){
   frames[tf]={...base,state:'INVALID_EVIDENCE',
    reason:'Несовпадение подтверждённых исходов между исследованиями.'};
   continue;
  }
  const pairs=comparePairWindows(blocks.map(x=>x.samples));
  frames[tf]=pairs?{state:'DESCRIPTIVE',pairs,
   comparableDecisive:blocks.map(x=>x.samples.length),
   reason:'Три фиксированных сочетания исследованы на одинаковых исходах.'}:
   {...base,state:'INVALID_EVIDENCE',
    reason:'Недостаточно проверенных данных для сопоставления пар.'};
 }
 return {version:FEATURE_PAIRS_VERSION,asset,frames,
  state:Object.values(frames).some(x=>x.state==='DESCRIPTIVE')?
   'DESCRIPTIVE':'COLLECTING',
  trained:false,calibratedProbability:null,modelChanged:false,
  note:'Дублирование — это сильная ранговая связь и отсутствие '+
   'заметного описательного прироста. Положительная ΔAUC не доказывает '+
   'причинности, статистической значимости или прибыли. Исходы могут '+
   'быть зависимы из-за общего рынка. Веса, ордера и прогнозы не меняются.'};
}
