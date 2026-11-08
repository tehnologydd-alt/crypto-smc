/**
 * APEX Regime Transition Lab: observed H1 regime changes sampled every 4 hours.
 * Never interprets future mode labels as knowable at the previous anchor.
 * Works solely on a complete and independently integrity-gated regime report.
 */
import {analyzeRegimeStability} from './regime-stability.mjs';
import {REGIME_TYPES,VOLATILITY_STATES} from './research-regimes.mjs';
import {wilsonShare} from './research-stability.mjs';

const MODE_IDS=REGIME_TYPES.map(x=>x.id);
const MODE_SET=new Set(MODE_IDS);
const VOL_IDS=VOLATILITY_STATES.map(x=>x.id);
const HOUR=3_600_000;
export const TRANSITION_RULES=Object.freeze({
 interval:'1h',samplingHours:4,foldCount:3,
 minOriginTransitionsPerPeriod:12,minVolatilityTransitionsPerPeriod:12,
 boundaryPolicy:'EXCLUDE_FOLD_BOUNDARY_PAIRS',
 source:'LOCAL_ROOM_CLOSED_H1'
});
export const TRANSITION_NOTE=
 'Матрица описывает переход от режима, известного в первом четырёхчасовом '+
 'окне, к метке режима, определённой только через следующие 4 часа. '+
 'Обучающие 40-часовые окна перекрываются, наблюдения зависимы; '+
 'интервалы Уилсона лишь приблизительные. Доли не являются вероятностью '+
 'будущих переходов, а различия периодов не подтверждают причинность.';
function hidden(reason){
 return {state:'HIDDEN',reason:reason||'Недостаточно проверенной истории',
  periods:[],matrix:[],origins:[],volatility:[],
  transitions:0,excludedBoundaries:null,note:TRANSITION_NOTE};
}
function matrix(pairs){
 return MODE_IDS.map(from=>({
  id:from,
  counts:Object.fromEntries(MODE_IDS.map(to=>[
   to,pairs.filter(x=>x.from===from&&x.to===to).length
  ])),
  total:pairs.filter(x=>x.from===from).length
 }));
}
function comparativeRate(groups,filter,match,{minSamples}){
 const selected=groups.map(group=>group.filter(filter));
 if(!selected.every(group=>group.length>=minSamples))return {
  state:'INSUFFICIENT',periods:[],reason:
   'Недостаточно исходных наблюдений во всех трёх периодах (минимум '+minSamples+')'
 };
 const periods=selected.map((group,i)=>{
  const positives=group.filter(match).length;
  const band=wilsonShare(positives,group.length);
  return {label:groups[i].label,...band};
 });
 const rates=periods.map(x=>x.share);
 const overlap=Math.max(...periods.map(x=>x.lower))<=
  Math.min(...periods.map(x=>x.upper));
 return {state:'DESCRIPTIVE',periods,
  earlyLateChangePp:(rates[2]-rates[0])*100,
  largestDifferencePp:(Math.max(...rates)-Math.min(...rates))*100,
  commonWilsonIntersection:overlap};
}

/**
 * Each validated fold contains k regime labels and k-1 paired transitions.
 * Pairs connecting adjacent folds are excluded to avoid cross-fold leakage.
 * A transition to the next label is observed only at the second anchor.
 */
export function analyzeRegimeTransitions(report){
 const validated=analyzeRegimeStability(report);
 if(validated.state!=='DESCRIPTIVE')
  return hidden(validated.reason||'Данные исследования режимов не проверены');
 const windows=report.windows;
 const foldSize=Math.floor(windows.length/TRANSITION_RULES.foldCount);
 const groups=[];
 for(let fold=0;fold<TRANSITION_RULES.foldCount;fold++){
  const section=windows.slice(fold*foldSize,
   fold===TRANSITION_RULES.foldCount-1?windows.length:(fold+1)*foldSize);
  const pairs=[];
  for(let i=0;i<section.length-1;i++){
   const previous=section[i],next=section[i+1];
   if(!MODE_SET.has(previous.mode)||!MODE_SET.has(next.mode)||
    next.anchorAt!==previous.anchorAt+4*HOUR||
    next.anchorAt!==previous.targetAt)
    return hidden('Временные границы перехода не согласованы');
   pairs.push({
    from:previous.mode,to:next.mode,
    fromAt:previous.anchorAt,toAt:next.anchorAt,
    volatility:previous.volatility,
    changed:previous.mode!==next.mode
   });
  }
  groups.push(Object.assign(pairs,{
   label:validated.periods[fold].label
  }));
 }
 const paired=groups.flat();
 const expected=windows.length-TRANSITION_RULES.foldCount;
 if(paired.length!==expected)
  return hidden('Пары переходов не совпадают с проверенным архивом');
 // Recompute all counts from individual historical pairs, not from UI stats.
 const periods=groups.map((pairs,i)=>({
  label:pairs.label,pairs:pairs.length,
  firstFromAt:pairs[0]?.fromAt||null,lastToAt:pairs.at(-1)?.toAt||null,
  matrix:matrix(pairs),
  changedCount:pairs.filter(x=>x.changed).length,
  unchangedCount:pairs.filter(x=>!x.changed).length
 }));
 const grandMatrix=matrix(paired);
 const origins=REGIME_TYPES.map(mode=>{
  const all=grandMatrix.find(x=>x.id===mode.id);
  const sufficient=groups.every(group=>
   group.filter(x=>x.from===mode.id).length>=
    TRANSITION_RULES.minOriginTransitionsPerPeriod);
  const destinations=REGIME_TYPES.map(next=>({
   id:next.id,label:next.label,count:all.counts[next.id],
   comparison:comparativeRate(groups,x=>x.from===mode.id,
    x=>x.to===next.id,{minSamples:TRANSITION_RULES.minOriginTransitionsPerPeriod})
  }));
  return {id:mode.id,label:mode.label,count:all.total,
   counts:all.counts,sufficient,
   destinations,persistence:destinations.find(x=>x.id===mode.id).comparison};
 });
 const volatility=VOLATILITY_STATES.map(state=>({
  id:state.id,label:state.label,
  count:paired.filter(x=>x.volatility===state.id).length,
  switching:comparativeRate(groups,x=>x.volatility===state.id,x=>x.changed,{
   minSamples:TRANSITION_RULES.minVolatilityTransitionsPerPeriod
  })
 }));
 return {state:'DESCRIPTIVE',reason:null,asset:report.asset,
  transitions:paired.length,excludedBoundaries:2,
  rules:TRANSITION_RULES,periods,matrix:grandMatrix,origins,volatility,
  startAt:paired[0]?.fromAt??null,endAt:paired.at(-1)?.toAt??null,
  note:TRANSITION_NOTE};
}
