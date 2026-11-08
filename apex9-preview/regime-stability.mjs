/**
 * APEX Research Regime Stability — descriptive historical comparison.
 * Consumes ONLY complete, gap-free, source-checked Research Regimes output.
 * All thresholds are fixed; no signal fitting or causal/predictive claims.
 */
import {wilsonShare} from './research-stability.mjs';
import {REGIME_TYPES,VOLATILITY_STATES,REGIME_RULES} from './research-regimes.mjs';

const H=3_600_000;
const names=['Ранний','Средний','Поздний'];
const REGIMES=new Set(REGIME_TYPES.map(x=>x.id));
const VOLATILITY=new Set(VOLATILITY_STATES.map(x=>x.id));
export const REGIME_STABILITY_RULES=Object.freeze({
 periods:3,minWindowsPerPeriod:15,minModeOutcomesPerPeriod:12,
 intervalLabel:'Ориентировочный интервал Уилсона 95%'
});
export const REGIME_STABILITY_NOTE=
 'Сравниваются только три уже завершённых исторических периода. '+
 'Оценки Уилсона используют допущение независимости, которое для рынка '+
 'может нарушаться: соседние 40-часовые обучающие окна перекрываются. '+
 'Пересечение интервалов не доказывает устойчивости, а расхождение долей '+
 'не доказывает причинности или пригодности для будущих прогнозов.';
const validInteger=x=>Number.isSafeInteger(x)&&x>0;
const countModes=(rows,key,allowed)=>
 Object.fromEntries([...allowed].map(id=>[id,rows.filter(x=>x[key]===id).length]));
const hidden=reason=>({
 state:'HIDDEN',reason:reason||'Нет полной проверенной истории',
 periods:[],regimes:[],volatility:[],note:REGIME_STABILITY_NOTE
});
const intersection=bands=>
 Math.max(...bands.map(b=>b.lower))<=Math.min(...bands.map(b=>b.upper));
function occupancy(id,rows,key){
 const periods=rows.map((p,i)=>({
  label:names[i],...wilsonShare(p.filter(x=>x[key]===id).length,p.length)
 }));
 const values=periods.map(p=>p.share);
 return {periods,
  earlyLateChangePp:(values[2]-values[0])*100,
  largestDifferencePp:(Math.max(...values)-Math.min(...values))*100,
  commonWilsonIntersection:intersection(periods)
 };
}
export function analyzeRegimeStability(report){
 if(report?.state!=='DESCRIPTIVE'||report.archiveComplete!==true||
  report.missingHours!==0)
  return hidden(report?.reason||'Нет проверенного полного архива H1');
 const windows=report.windows,periods=report.periods;
 if(!Array.isArray(windows)||windows.length<REGIME_RULES.minWindows||
  windows.length>REGIME_RULES.maxBars||
  !Array.isArray(periods)||periods.length!==REGIME_STABILITY_RULES.periods||
  !report.overall||report.overall.samples!==windows.length)
  return hidden('Нарушена структура или общий размер исторической выборки');
 let lastAnchor=null;
 for(const w of windows){
  if(!validInteger(w?.anchorAt)||w.anchorAt%H!==H-1||
   !validInteger(w.targetAt)||w.targetAt!==w.anchorAt+4*H||
   (lastAnchor!==null&&w.anchorAt!==lastAnchor+4*H)||
   !REGIMES.has(w.mode)||!VOLATILITY.has(w.volatility)||
   typeof w.nextCloseInCorridor!=='boolean'||
   !Number.isFinite(w.absChangePct)||w.absChangePct<0)
   return hidden('Непроверяемое окно, хронология или классификация режима');
  lastAnchor=w.anchorAt;
 }
 if(report.firstAt!==windows[0].targetAt||
  report.lastAt!==windows.at(-1).targetAt)
  return hidden('Границы исторической выборки не совпадают');
 const foldLength=Math.floor(windows.length/3),groups=[];
 for(let i=0;i<3;i++){
  const group=windows.slice(i*foldLength,i===2?windows.length:(i+1)*foldLength);
  const p=periods[i];
  if(group.length<REGIME_STABILITY_RULES.minWindowsPerPeriod||
   p?.samples!==group.length||
   p.firstAt!==group[0].targetAt||p.lastAt!==group.at(-1).targetAt||
   !p.regimeCounts||!p.volatilityCounts)
   return hidden('Размер и границы одного из периодов противоречивы');
  const countedModes=countModes(group,'mode',REGIMES);
  const countedVol=countModes(group,'volatility',VOLATILITY);
  if([...REGIMES].some(x=>p.regimeCounts[x]!==countedModes[x])||
   [...VOLATILITY].some(x=>p.volatilityCounts[x]!==countedVol[x]))
   return hidden('Нарушена целостность количества режимов в периодах');
  groups.push(group);
 }
 const fullModeCounts=countModes(windows,'mode',REGIMES);
 const fullVolCounts=countModes(windows,'volatility',VOLATILITY);
 if([...REGIMES].some(x=>report.overall.regimeCounts?.[x]!==fullModeCounts[x])||
  [...VOLATILITY].some(x=>report.overall.volatilityCounts?.[x]!==fullVolCounts[x]))
  return hidden('Нарушена целостность общей сводки режимов');
 const regimes=REGIME_TYPES.map(meta=>{
  const occurrence=occupancy(meta.id,groups,'mode');
  const cohorts=groups.map(g=>g.filter(x=>x.mode===meta.id));
  const sufficient=cohorts.every(c=>
   c.length>=REGIME_STABILITY_RULES.minModeOutcomesPerPeriod);
  const outcomePeriods=sufficient?cohorts.map((c,i)=>({
   label:names[i],
   ...wilsonShare(c.filter(x=>x.nextCloseInCorridor).length,c.length)
  })):[];
  const medians=sufficient?cohorts.map(c=>{
   const changes=c.map(x=>x.absChangePct).sort((a,b)=>a-b);
   const mid=changes.length>>1;
   return changes.length%2?changes[mid]:(changes[mid-1]+changes[mid])/2;
  }):[];
  return {id:meta.id,label:meta.label,occurrence,
   outcomes:sufficient?{
    state:'DESCRIPTIVE',periods:outcomePeriods,
    earlyLateChangePp:(outcomePeriods[2].share-outcomePeriods[0].share)*100,
    commonWilsonIntersection:intersection(outcomePeriods),
    medianAbsFourHourPct:medians
   }:{
    state:'INSUFFICIENT',periods:[],
    reason:'Для сравнения исходов нужно не менее 12 наблюдений в каждом периоде'
   }};
 });
 const volatility=VOLATILITY_STATES.map(meta=>({
  id:meta.id,label:meta.label,occurrence:occupancy(meta.id,groups,'volatility')
 }));
 return {state:'DESCRIPTIVE',reason:null,asset:report.asset,
  periods:groups.map((g,i)=>({
   label:names[i],samples:g.length,
   firstAt:g[0].targetAt,lastAt:g.at(-1).targetAt
  })),regimes,volatility,note:REGIME_STABILITY_NOTE,
  rules:REGIME_STABILITY_RULES};
}
