/** APEX 3.5 Market Pulse — observational breadth of FAVORITES, not the whole crypto market.
 * Every asset contributes at most one category; only fresh confirmed scenarios count.
 */
import type {RadarSignal,Timeframe} from './engine';
import type {DataHealth} from './data-quality';

export type PulseCategory='bullish'|'bearish'|'conflict'|'partial'|'quiet'|'unavailable';
export type PulseAsset={
 symbol:string;category:PulseCategory;longVotes:number;shortVotes:number;
 verifiedFrames:number;reason:string;
};
export type MarketPulse={
 watched:number;eligible:number;bullish:number;bearish:number;
 conflict:number;partial:number;quiet:number;unavailable:number;
 title:string;note:string;assets:PulseAsset[];
};
export type PulseInput={
 symbol:string;price:number;lastTick:number;error?:string;
 signals:Partial<Record<Timeframe,RadarSignal|null>>;
};
const frames:Timeframe[]=['5m','1h','4h'];
const duration:Record<Timeframe,number>={'5m':300_000,'1h':3_600_000,'4h':14_400_000};
const ok=(x:number)=>Number.isFinite(x)&&x>0;
const validConfirmation=(signal:RadarSignal|null|undefined,frame:Timeframe,symbol:string,now:number):boolean=>{
 if(!signal||signal.phase!=='CONFIRMED'||signal.symbol!==symbol||signal.frame!==frame)return false;
 if(signal.direction!=='LONG'&&signal.direction!=='SHORT')return false;
 if(!Number.isFinite(signal.candleTime)||signal.candleTime<=0)return false;
 const age=now-signal.candleTime;
 return age>=-120_000&&age<=duration[frame]*2+120_000;
};
export function evaluatePulseAsset(asset:PulseInput,health:DataHealth|undefined,now=Date.now()):PulseAsset{
 const base={symbol:asset.symbol,longVotes:0,shortVotes:0,verifiedFrames:0};
 const tickAge=now-asset.lastTick;
 if(!ok(asset.price)||!Number.isFinite(asset.lastTick)||asset.lastTick<=0||tickAge<0||tickAge>120_000||
  asset.error||!health||health.level==='bad'||health.level==='loading'||!health.tickFresh){
  return {...base,category:'unavailable',reason:'Недостаточно свежих подтверждённых данных'};
 }
 let longVotes=0,shortVotes=0,verifiedFrames=0;
 for(const frame of frames){
  if(health.frames[frame]?.status!=='ok')continue;
  verifiedFrames++;
  const signal=asset.signals?.[frame];
  if(!validConfirmation(signal,frame,asset.symbol,now))continue;
  if(signal?.direction==='LONG')longVotes++;
  if(signal?.direction==='SHORT')shortVotes++;
 }
 const rest={symbol:asset.symbol,longVotes,shortVotes,verifiedFrames};
 if(verifiedFrames===0)return {...rest,category:'unavailable',reason:'Нет пригодных таймфреймов'};
 if(longVotes&&shortVotes)return {...rest,category:'conflict',reason:'Подтверждения разных направлений'};
 if(longVotes>=2)return {...rest,category:'bullish',reason:'Не менее двух таймфреймов подтверждают рост'};
 if(shortVotes>=2)return {...rest,category:'bearish',reason:'Не менее двух таймфреймов подтверждают снижение'};
 if(longVotes||shortVotes)return {...rest,category:'partial',reason:'Подтверждён только один таймфрейм'};
 return {...rest,category:'quiet',reason:'Нет свежих подтверждённых сигналов'};
}
export function summarizePulse(assets:PulseInput[],quality:Record<string,DataHealth>,now=Date.now()):MarketPulse{
 // Duplicate symbols must not artificially inflate market breadth.
 const unique=new Map<string,PulseInput>();
 for(const asset of assets){
  if(asset&&typeof asset.symbol==='string'&&!unique.has(asset.symbol))unique.set(asset.symbol,asset);
 }
 const rows=[...unique.values()].map(a=>evaluatePulseAsset(a,quality[a.symbol],now));
 const count=(c:PulseCategory)=>rows.filter(x=>x.category===c).length;
 const bullish=count('bullish'),bearish=count('bearish'),conflict=count('conflict');
 const partial=count('partial'),quiet=count('quiet'),unavailable=count('unavailable');
 const eligible=rows.length-unavailable;
 let title:string;
 if(rows.length===0)title='Нет избранных активов';
 else if(eligible<3)title='Мало данных для общего вывода';
 else if(bullish===0&&bearish===0)title='Нет согласованного направления';
 else if(bullish>bearish&&bullish>=2)title='Больше подтверждений роста';
 else if(bearish>bullish&&bearish>=2)title='Больше подтверждений снижения';
 else title='Смешанная картина';
 return {watched:rows.length,eligible,bullish,bearish,conflict,partial,quiet,unavailable,title,
  note:'Только избранные монеты. Подтверждения M5/H1/H4 — это наблюдения, не вероятность прибыли или индекс всего крипторынка.',
  assets:rows};
}
