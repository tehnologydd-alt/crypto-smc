/**
 * APEX Research Validation Lab v1
 *
 * Pure, deterministic, retrospective rolling-origin H1 interval experiment.
 * Neither simulated "signals" nor a future predictive accuracy estimate.
 * Fixed, predeclared rules; no parameter search; no network or exchange calls.
 */
import {inspectClosedCandles} from './market-core.mjs';
import {CANDLE_INTERVALS} from './candles.mjs';

export const VALIDATION_RULES=Object.freeze({
 interval:'1h',trainingBars:96,horizonBars:4,stepBars:4,
 quantile:.8,referenceMedianFactor:2,intervalScoreAlpha:.2,
 minComparisons:45,foldCount:3,minFoldComparisons:15,maxCandles:600
});
const HOUR=CANDLE_INTERVALS['1h'];
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const stamp=x=>Number.isSafeInteger(x)&&x>0;
const mean=a=>a.length?a.reduce((sum,value)=>sum+value,0)/a.length:null;
const median=arr=>{
 const a=[...arr].sort((x,y)=>x-y),i=a.length>>1;
 return a.length?(a.length%2?a[i]:(a[i-1]+a[i])/2):null;
};
const quantile80=arr=>{
 const a=[...arr].sort((x,y)=>x-y);
 return a[Math.min(a.length-1,Math.max(0,Math.ceil(a.length*.8)-1))];
};
const blank=(state,details={})=>({
 state,interval:'1h',basis:'RETROSPECTIVE_ROLLING_ORIGIN',
 rules:VALIDATION_RULES,closedBars:0,comparisons:0,
 folds:[],overall:null,gaps:0,firstCloseAt:null,lastCloseAt:null,
 ...details
});
function intervalScoreLog(logChange,width){
 // Interval score with a fixed nominal alpha=0.2 for comparison only.
 // Historical percentile is not independently calibrated to 80% probability.
 const outside=Math.max(0,Math.abs(logChange)-width);
 return 2*width+2/VALIDATION_RULES.intervalScoreAlpha*outside;
}
function summarize(rows,label){
 const total=rows.length;
 const extract=(key)=>mean(rows.map(x=>x[key]));
 const hitA=rows.filter(x=>x.apexInside).length;
 const hitB=rows.filter(x=>x.referenceInside).length;
 return {
  label,comparisons:total,firstTargetAt:rows[0]?.targetAt??null,
  lastTargetAt:rows.at(-1)?.targetAt??null,
  apex:{observedInside:hitA,observedCoverage:total?hitA/total:null,
   meanLogWidth:extract('apexLogWidth'),meanIntervalScore:extract('apexScore')},
  reference:{observedInside:hitB,observedCoverage:total?hitB/total:null,
   meanLogWidth:extract('referenceLogWidth'),meanIntervalScore:extract('referenceScore')},
  note:'Descriptive retrospective windows only; no future predictive calibration'
 };
}
/**
 * Fixed 96-bar rolling windows; each evaluation uses exactly four NEXT closed
 * H1 bars, never any data after its training anchor.
 *
 * Reject incomplete time ranges instead of cherry-picking easy windows.
 * Simultaneous training intervals are dependent even if target windows do not
 * overlap; folds are consecutive historical periods, not independent trials.
 */
export function validateHistoricalRanges(candles,{now=Date.now()}={}){
 if(!stamp(now)||!Array.isArray(candles)||candles.length>VALIDATION_RULES.maxCandles+20)
  return blank('INVALID',{reason:'Некорректные границы локальной истории'});
 const inspected=inspectClosedCandles(candles,'1h');
 if(inspected.state==='INVALID')return blank('INVALID',{reason:'Нарушена проверка закрытых свечей'});
 // Real source history only; do not process "closed" future bars.
 const bars=inspected.bars.filter(x=>x.closeAt<now);
 if(bars.length<VALIDATION_RULES.trainingBars+VALIDATION_RULES.horizonBars+1)
  return blank('INSUFFICIENT',{closedBars:bars.length,
   reason:'Недостаточно завершённых свечей: требуется минимум 101 H1'});
 const last=bars.at(-1);
 let gaps=0;
 for(let i=1;i<bars.length;i++){
  const delta=bars[i].t-bars[i-1].t;
  if(delta<=0||delta%HOUR!==0)
   return blank('INVALID',{closedBars:bars.length,
    reason:'Нарушена хронология часовых свечей'});
  gaps+=delta/HOUR-1;
 }
 if(gaps>0)return blank('GAPPED',{closedBars:bars.length,gaps,
  firstCloseAt:bars[0].closeAt,lastCloseAt:last.closeAt,
  reason:'В локальной истории есть пропущенные часовые свечи; выборочное сравнение заблокировано'});
 const events=[];
 const {trainingBars,horizonBars,stepBars}=VALIDATION_RULES;
 // At index i, bars[0..i] are known. Evaluate bars[i+4] afterwards.
 for(let i=trainingBars-1;i+horizonBars<bars.length;i+=stepBars){
  const history=bars.slice(i-trainingBars+1,i+1);
  const moves=[];
  for(let k=horizonBars;k<history.length;k++){
   const magnitude=Math.abs(Math.log(history[k].close/history[k-horizonBars].close));
   if(!finite(magnitude))return blank('INVALID',{reason:'Некорректная историческая амплитуда'});
   moves.push(magnitude);
  }
  const apexWidth=quantile80(moves);
  const referenceWidth=2*median(moves);
  if(!finite(apexWidth)||!finite(referenceWidth)||
     apexWidth<=0||referenceWidth<=0)
   return blank('LOW_VARIATION',{closedBars:bars.length,
    reason:'В обучающей истории недостаточно отличимых изменений для сравнения'});
  const anchor=history.at(-1),future=bars[i+horizonBars];
  const change=Math.log(future.close/anchor.close);
  if(!finite(change))return blank('INVALID',{reason:'Некорректное завершённое закрытие'});
  events.push({
   anchorAt:anchor.closeAt,targetAt:future.closeAt,
   apexInside:Math.abs(change)<=apexWidth,
   referenceInside:Math.abs(change)<=referenceWidth,
   apexLogWidth:2*apexWidth,referenceLogWidth:2*referenceWidth,
   apexScore:intervalScoreLog(change,apexWidth),
   referenceScore:intervalScoreLog(change,referenceWidth)
  });
 }
 const info={closedBars:bars.length,gaps,firstCloseAt:bars[0].closeAt,
  lastCloseAt:last.closeAt,comparisons:events.length,
  studyBoundary:'Only completed H1 bars; fixed rules; no lookahead'};
 if(events.length<VALIDATION_RULES.minComparisons)
  return blank('INSUFFICIENT',{...info,
   reason:'Для трёх исторических периодов нужно минимум 45 неперекрывающихся четырёхчасовых окон'});
 const length=Math.floor(events.length/3);
 const folds=[];
 for(let i=0;i<3;i++){
  const start=i*length,end=i===2?events.length:(i+1)*length;
  const subset=events.slice(start,end);
  if(subset.length<VALIDATION_RULES.minFoldComparisons)
   return blank('INSUFFICIENT',{...info,
    reason:'Недостаточно проверяемых окон в одном из исторических периодов'});
  folds.push(summarize(subset,['Ранний период','Средний период','Поздний период'][i]));
 }
 return {
  ...blank('DESCRIPTIVE',info),folds,
  overall:summarize(events,'Все исторические окна'),
  warning:'This is in-sample-of-history retrospective walk-forward REPLAY, not a live forward test. Comparison scores include width penalties; neither method was independently calibrated or established as predictively useful.'
 };
}
