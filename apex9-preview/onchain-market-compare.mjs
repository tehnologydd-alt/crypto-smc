/**
 * APEX On-chain ↔ Market Core historical comparison (research only).
 *
 * Each captured network snapshot is paired with the LAST FINISHED Binance
 * Spot H1 candle available at that capture time. One network sample per
 * hourly bucket; no future-candle leakage or synthetic history.
 *
 * Pearson is only a descriptive contemporaneous association, never a
 * forecast, causal attribution, calibration, or advice.
 */
import {chainForAsset,parseOnChainHistory} from './onchain-core.mjs';
import {inspectClosedCandles} from './market-core.mjs';

const HOUR=3600000;
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const validTime=t=>Number.isSafeInteger(t)&&t>0;
const empty=(state,asset,reason,extras={})=>({
 state,asset,reason,pairedHours:0,intervals:0,correlation:null,
 networkMeasure:null,marketMeasure:'Completed Binance Spot H1 close-to-close log return per hour',
 ...extras
});
const networkField={
 bitcoin:{key:'mempoolCount',description:'Изменение числа ожидающих BTC-транзакций в час'},
 ethereum:{key:'networkUtilizationPct',description:'Изменение загруженности Ethereum, п.п./час'},
 ton:{key:'masterchainSeqno',description:'Наблюдаемая скорость прироста TON masterchain seqno, блоков/час'}
};
function pearson(x,y){
 if(x.length!==y.length||x.length<2)return null;
 const ax=x.reduce((s,v)=>s+v,0)/x.length;
 const ay=y.reduce((s,v)=>s+v,0)/y.length;
 let num=0,xx=0,yy=0;
 for(let i=0;i<x.length;i++){
  const dx=x[i]-ax,dy=y[i]-ay;
  num+=dx*dy;xx+=dx*dx;yy+=dy*dy;
 }
 if(xx<=1e-12||yy<=1e-16)return null;
 const r=num/Math.sqrt(xx*yy);
 return finite(r)?Math.max(-1,Math.min(1,r)):null;
}
export function compareOnChainMarketHistory(raw,ohlcv,{
 asset,now=Date.now(),minIntervals=12
}={}){
 const chain=chainForAsset(asset);
 if(!chain)return empty('UNSUPPORTED',asset,'Нет подтверждённого соответствия актива и сети');
 if(!validTime(now)||!Number.isSafeInteger(minIntervals)||
    minIntervals<8||minIntervals>100)
  return empty('INVALID',asset,'Некорректный интервал наблюдений');
 const parsed=inspectClosedCandles(ohlcv,'1h');
 if(parsed.state==='INVALID')return empty('INVALID',asset,'Неверная история OHLCV');
 const candles=parsed.bars;
 const source=Array.isArray(raw)
  ?raw.filter(x=>x?.asset===asset&&x?.collectedAt<=now+60000):[];
 const samples=parseOnChainHistory(source,chain);
 const measure=networkField[chain];
 const properties={chain,networkMeasure:measure.description,
  networkSamples:samples.length,closedCandles:candles.length,
  methodology:'Сопоставление ранее полученных сетевых снимков с последней завершённой H1-свечой'};
 if(candles.length<minIntervals+1||samples.length<minIntervals+1)
  return empty('INSUFFICIENT',asset,'Нужно больше реальных наблюдений и закрытых H1-свечей',properties);
 const byClose=new Map(candles.map(c=>[c.closeAt,c]));
 // A snapshot is captured *after* this completed hourly close.
 const byHour=new Map();
 for(const item of samples){
  const value=item[measure.key];
  if(!finite(value)||value<0||!validTime(item.collectedAt)||item.collectedAt>now+60000)
   continue;
  const finishedCloseAt=Math.floor(item.collectedAt/HOUR)*HOUR-1;
  const candle=byClose.get(finishedCloseAt);
  if(!candle||!finite(candle.close)||candle.close<=0)continue;
  const prev=byHour.get(finishedCloseAt);
  if(!prev||item.collectedAt>prev.sample.collectedAt)
   byHour.set(finishedCloseAt,{candle,sample:item});
 }
 const pairs=[...byHour.values()].sort((a,b)=>a.candle.closeAt-b.candle.closeAt);
 if(pairs.length<minIntervals+1)
  return empty('INSUFFICIENT',asset,'Недостаточно отдельных часов с реальными совместными наблюдениями',{
   ...properties,pairedHours:pairs.length
  });
 let intervals=[],networkChanges=[],priceChanges=[];
 const candlesByTime=new Set(candles.map(x=>x.closeAt));
 for(let i=1;i<pairs.length;i++){
  const left=pairs[i-1],right=pairs[i];
  const deltaHours=(right.candle.closeAt-left.candle.closeAt)/HOUR;
  if(deltaHours<1||deltaHours>6)continue;
  // Reject missing intermediary H1 bars, even if endpoints exist.
  let contiguous=true;
  for(let h=1;h<deltaHours;h++)
   if(!candlesByTime.has(left.candle.closeAt+h*HOUR)){contiguous=false;break;}
  if(!contiguous)continue;
  const a=left.sample[measure.key],b=right.sample[measure.key];
  const delta=b-a;
  // TON masterchain sequence must not roll backward on a consistent source.
  if(chain==='ton'&&delta<0)continue;
  const normalized=delta/deltaHours;
  const returnPerHour=Math.log(right.candle.close/left.candle.close)/deltaHours;
  if(!finite(normalized)||!finite(returnPerHour))continue;
  intervals.push({start:left.candle.closeAt,end:right.candle.closeAt,
   hours:deltaHours,networkChangePerHour:normalized,
   logReturnPctPerHour:returnPerHour*100});
  networkChanges.push(normalized);priceChanges.push(returnPerHour);
 }
 const meta={...properties,pairedHours:pairs.length,
  intervals:intervals.length,firstAt:pairs[0].sample.collectedAt,
  lastAt:pairs.at(-1).sample.collectedAt,
  matchedIntervals:intervals.slice(-40)};
 if(intervals.length<minIntervals)return {
  ...empty('INSUFFICIENT',asset,
   'Недостаточно независимых временных интервалов без больших пропусков',meta),
  intervals:intervals.length
 };
 const r=pearson(networkChanges,priceChanges);
 if(r===null)return {
  ...empty('LOW_VARIATION',asset,
   'Недостаточно изменения сетевого показателя или рыночных закрытий',meta),
  intervals:intervals.length
 };
 return {state:'DESCRIPTIVE',asset,reason:null,correlation:r,
  ...meta,interpretation:'Только статистическое совпадение в прошлых данных; не прогноз, не причинность и не торговый сигнал'};
}
