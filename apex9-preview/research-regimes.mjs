/**
 * APEX Research Regimes v1 — fixed, historical H1 regime cohorts.
 * No model fitting, indicators, future-data leakage or live trade signals.
 * The 4 following H1 closes are evaluated AFTER classifying the anchor.
 */
import {inspectClosedCandles} from './market-core.mjs';

const H=3600000;
export const REGIME_RULES=Object.freeze({
 interval:'1h',baselineBars:20,lookbackBars:20,horizonBars:4,
 stepBars:4,directionalEfficiency:.57,rangeEfficiency:.28,
 volatilityExpandRatio:1.25,volatilityContractRatio:.8,
 minWindows:45,periods:3,minPerPeriod:15,
 minPerRegimePeriod:5,maxBars:4800
});
export const REGIME_TYPES=Object.freeze([
 {id:'DIRECTIONAL',label:'Направленное движение',description:'Высокая эффективность пройденного пути'},
 {id:'RANGE',label:'Боковик',description:'Небольшое чистое движение при колебаниях'},
 {id:'TRANSITION',label:'Переходный режим',description:'Промежуточная эффективность движения'}
]);
export const VOLATILITY_STATES=Object.freeze([
 {id:'EXPANDING',label:'Волатильность растёт'},
 {id:'CONTRACTING',label:'Волатильность снижается'},
 {id:'STABLE',label:'Без выраженного изменения'}
]);
const safeTime=x=>Number.isSafeInteger(x)&&x>0;
const safeAsset=x=>typeof x==='string'&&/^[A-Z0-9]{5,20}$/.test(x);
const mean=x=>x.length?x.reduce((s,v)=>s+v,0)/x.length:null;
function median(array){
 if(!array.length)return null;
 const a=[...array].sort((a,b)=>a-b),mid=a.length>>1;
 return a.length%2?a[mid]:(a[mid-1]+a[mid])/2;
}
function rmsLogReturns(bars){
 const changes=[];
 for(let j=1;j<bars.length;j++)
  changes.push(Math.log(bars[j].close/bars[j-1].close));
 return Math.sqrt(mean(changes.map(x=>x*x)));
}
function empty(state,reason,details={}){
 return {state,reason,asset:details.asset??null,
  rules:REGIME_RULES,closedBars:details.closedBars||0,
  missingHours:details.missingHours||0,
  windows:[],periods:[],overall:null,
  archiveComplete:details.archiveComplete===true,
  firstAt:null,lastAt:null};
}

/**
 * Accept only 40 chronologically closed training bars. Both the mode and
 * volatility comparison are fixed before the following evaluation horizon.
 */
export function classifyHistoricalRegime(history){
 const {baselineBars,lookbackBars,directionalEfficiency,
  rangeEfficiency,volatilityExpandRatio,volatilityContractRatio}=REGIME_RULES;
 if(!Array.isArray(history)||history.length!==baselineBars+lookbackBars)return null;
 const old=history.slice(0,baselineBars);
 const recent=history.slice(-lookbackBars);
 const path=recent.slice(1).reduce((sum,bar,j)=>
  sum+Math.abs(Math.log(bar.close/recent[j].close)),0);
 const move=Math.log(recent.at(-1).close/recent[0].close);
 const efficiency=path>1e-12?Math.min(1,Math.abs(move)/path):0;
 const mode=efficiency>=directionalEfficiency?'DIRECTIONAL':
  efficiency<=rangeEfficiency?'RANGE':'TRANSITION';
 const direction=Math.abs(move)<1e-12?'FLAT':move>0?'UP':'DOWN';
 const priorVol=rmsLogReturns(old),recentVol=rmsLogReturns(recent);
 const volRatio=priorVol<1e-12?(recentVol<1e-12?1:null):recentVol/priorVol;
 const volatility=volRatio===null?'EXPANDING':
  volRatio>=volatilityExpandRatio?'EXPANDING':
  volRatio<=volatilityContractRatio?'CONTRACTING':'STABLE';
 return {mode,direction,efficiency,volatility,volRatio,
  corridorLow:Math.min(...recent.map(x=>x.low)),
  corridorHigh:Math.max(...recent.map(x=>x.high))};
}
const countBy=(items,keys,field)=>
 Object.fromEntries(keys.map(key=>[key,items.filter(x=>x[field]===key).length]));
function groupStats(items){
 return {samples:items.length,
  firstAt:items[0]?.targetAt??null,lastAt:items.at(-1)?.targetAt??null,
  regimeCounts:countBy(items,REGIME_TYPES.map(x=>x.id),'mode'),
  volatilityCounts:countBy(items,VOLATILITY_STATES.map(x=>x.id),'volatility')};
}
const observedStats=items=>({
 samples:items.length,
 insideCount:items.filter(x=>x.nextCloseInCorridor).length,
 insideShare:items.length?items.filter(x=>x.nextCloseInCorridor).length/items.length:null,
 medianAbsFourHourPct:median(items.map(x=>x.absChangePct))
});
/**
 * A complete, truly continuous, original closed-H1 archive is required.
 * Windows are 4h non-overlapping, split into THREE chronological periods.
 * The reference is a source OHLCV snapshot, not a live forecast journal.
 */
export function analyzeResearchRegimes(candles,{
 asset,now=Date.now(),archiveComplete=false
}={}){
 const details={asset,archiveComplete,closedBars:Array.isArray(candles)?candles.length:0};
 if(!safeAsset(asset)||!safeTime(now)||!Array.isArray(candles)||
  candles.length>REGIME_RULES.maxBars)
  return empty('INVALID','Некорректный актив, время или объём архива',details);
 if(archiveComplete!==true)
  return empty('PARTIAL_ARCHIVE','Архив H1 прочитан не полностью: проценты скрыты',details);
 if(candles.some(x=>x?.closed!==true||!safeTime(x.closeAt)||x.closeAt>=now))
  return empty('INVALID','История содержит незакрытые или будущие H1-свечи',details);
 const parsed=inspectClosedCandles(candles,'1h',{maxBars:REGIME_RULES.maxBars});
 if(parsed.state==='INVALID')
  return empty('INVALID','Не прошла проверка OHLCV и хронологии источника',details);
 const bars=parsed.bars;
 const minimum=REGIME_RULES.baselineBars+REGIME_RULES.lookbackBars+
  REGIME_RULES.horizonBars+REGIME_RULES.stepBars*(REGIME_RULES.minWindows-1);
 if(bars.length<minimum)
  return empty('INSUFFICIENT',
   'Нужно не менее '+minimum+' непрерывных закрытых H1-свечей',details);
 let missing=0;
 for(let j=1;j<bars.length;j++){
  const difference=bars[j].t-bars[j-1].t;
  if(difference%H!==0||difference<=0)
   return empty('INVALID','Нарушен шаг часовых свечей',details);
  missing+=difference/H-1;
 }
 if(missing>0)
  return empty('GAPPED','Обнаружено '+missing+' недостающих H1-часов. Выборочное сравнение запрещено',
   {...details,missingHours:missing});
 const windows=[];
 const start=REGIME_RULES.baselineBars+REGIME_RULES.lookbackBars-1;
 for(let anchorIndex=start;
  anchorIndex+REGIME_RULES.horizonBars<bars.length;
  anchorIndex+=REGIME_RULES.stepBars){
  const training=bars.slice(anchorIndex+1-40,anchorIndex+1);
  const label=classifyHistoricalRegime(training);
  if(!label)return empty('INVALID','Не удалось проверить исторический режим',details);
  const anchor=bars[anchorIndex],target=bars[anchorIndex+REGIME_RULES.horizonBars];
  const actualChange=Math.log(target.close/anchor.close);
  if(!Number.isFinite(actualChange))
   return empty('INVALID','Недостоверное изменение за четыре часа',details);
  windows.push({anchorAt:anchor.closeAt,targetAt:target.closeAt,
   mode:label.mode,direction:label.direction,
   volatility:label.volatility,efficiency:label.efficiency,
   absChangePct:Math.abs(actualChange)*100,
   nextCloseInCorridor:target.close>=label.corridorLow&&
    target.close<=label.corridorHigh});
 }
 if(windows.length<REGIME_RULES.minWindows)
  return empty('INSUFFICIENT','Недостаточно неперекрывающихся четырёхчасовых окон',details);
 const foldSize=Math.floor(windows.length/REGIME_RULES.periods);
 const periods=Array.from({length:REGIME_RULES.periods},(_,j)=>{
  const subset=windows.slice(j*foldSize,
   j===REGIME_RULES.periods-1?windows.length:(j+1)*foldSize);
  return {...groupStats(subset),label:['Ранний','Средний','Поздний'][j]};
 });
 if(periods.some(x=>x.samples<REGIME_RULES.minPerPeriod))
  return empty('INSUFFICIENT','Мало наблюдений в одном из трёх периодов',details);
 const modeStats=REGIME_TYPES.map(type=>{
  const subsets=periods.map(p=>windows.filter(x=>
   x.targetAt>=p.firstAt&&x.targetAt<=p.lastAt&&x.mode===type.id));
  const all=windows.filter(x=>x.mode===type.id);
  const publish=subsets.every(x=>x.length>=REGIME_RULES.minPerRegimePeriod);
  return {id:type.id,label:type.label,description:type.description,
   samples:all.length,periods:subsets.map((subset,j)=>({
    label:periods[j].label,samples:subset.length,
    ...(publish?observedStats(subset):{insideCount:null,insideShare:null,
     medianAbsFourHourPct:null})
   })),sufficient:publish,
   overall:publish?observedStats(all):null};
 });
 return {state:'DESCRIPTIVE',reason:null,asset,
  rules:REGIME_RULES,closedBars:bars.length,missingHours:0,
  archiveComplete:true,windows,periods,modeStats,
  overall:groupStats(windows),
  firstAt:windows[0].targetAt,lastAt:windows.at(-1).targetAt,
  warning:'Fixed retrospective regimes, not a calibrated forecast. Consecutive training windows overlap and regime proportions do not prove causality or future repeatability.'};
}
