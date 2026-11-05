/** Stable preliminary market observation; separate from confirmed signals and paper scenarios. */
import {FRAME_DURATION,type Candle,type RadarSignal,type Timeframe} from './engine';
export type WatchMemory={signal:RadarSignal;firstSeenAt:number;lastSeenAt:number;quietSince:number|null;anchorHigh:number;anchorLow:number};
export type WatchDecision={memory:WatchMemory|null;signal:RadarSignal|null;reason:string};
export type WatchContext={now:number;frame:Timeframe;price:number;rangeHigh:number;rangeLow:number;lastClosed:Candle|null;liveFresh:boolean};
const valid=(n:number)=>Number.isFinite(n)&&n>0;
const MAX_BARS=12;
export function stabilizeWatch(previous:WatchMemory|null,raw:RadarSignal|null,ctx:WatchContext):WatchDecision{
 const duration=FRAME_DURATION[ctx.frame],c=ctx.lastClosed;
 const usable=valid(ctx.price)&&valid(ctx.rangeHigh)&&valid(ctx.rangeLow)&&ctx.rangeHigh>ctx.rangeLow;
 const candidate=raw?.frame===ctx.frame||(!raw?.frame&&ctx.frame==='5m')?raw:null;
 if(candidate?.phase==='CONFIRMED')return {memory:null,signal:candidate,reason:'Подтверждённый пробой'};
 if(!previous){
  if(!ctx.liveFresh||!usable||candidate?.phase!=='WATCH')return {memory:null,signal:null,reason:'Ожидание свежих данных'};
  const signal:RadarSignal={...candidate,id:candidate.symbol+':'+ctx.frame+':'+candidate.direction+':WATCH:'+ctx.now,
   timestamp:ctx.now,watchState:'LIVE',watchNote:'Подготовка обнаружена, наблюдаем за уровнем'};
  return {memory:{signal,firstSeenAt:ctx.now,lastSeenAt:ctx.now,quietSince:null,anchorHigh:ctx.rangeHigh,anchorLow:ctx.rangeLow},signal,reason:'Новая подготовка'};
 }
 const age=ctx.now-previous.firstSeenAt;
 if(age<0||age>=MAX_BARS*duration)return {memory:null,signal:null,reason:'Срок наблюдения истёк'};
 if(!usable){
  const signal:RadarSignal={...previous.signal,watchState:'STALE',watchNote:'Данные недоступны; прежнее наблюдение не является свежим сигналом'};
  return {memory:previous,signal,reason:'Нет свежего рынка'};
 }
 const width=previous.anchorHigh-previous.anchorLow,level=previous.signal.level;
 const shiftLimit=Math.max(width*.27,level*.0015);
 const boundary=previous.signal.direction==='LONG'?ctx.rangeHigh:ctx.rangeLow;
 if(Math.abs(boundary-level)>shiftLimit)return {memory:null,signal:null,reason:'Изменение структуры диапазона'};
 if(c&&c.time>previous.signal.candleTime){
  const invalid=previous.signal.direction==='LONG'?c.close<=previous.signal.invalidation:c.close>=previous.signal.invalidation;
  if(invalid)return {memory:null,signal:null,reason:'Закрытая свеча нарушила отмену'};
  const beyond=previous.signal.direction==='LONG'?c.close>level+width*.16:c.close<level-width*.16;
  if(beyond)return {memory:null,signal:null,reason:'Цена закрепилась за уровнем без подтверждения'};
 }
 if(!ctx.liveFresh){
  const signal:RadarSignal={...previous.signal,watchState:'STALE',watchNote:'Биржевые тики задерживаются; наблюдение сохранено, но не обновлено'};
  return {memory:previous,signal,reason:'Нет свежих тиков'};
 }
 const matching=candidate?.phase==='WATCH'&&candidate.direction===previous.signal.direction&&Math.abs(candidate.level-level)<=shiftLimit;
 const quietSince=matching?null:(previous.quietSince??ctx.now);
 const excursion=previous.signal.direction==='LONG'?level-ctx.price:ctx.price-level;
 const departure=excursion>width*.58||excursion< -width*.35;
 const quietMs=quietSince===null?0:ctx.now-quietSince;
 if(departure&&quietMs>=duration)return {memory:null,signal:null,reason:'Цена существенно ушла от уровня'};
 if(quietSince!==null&&quietMs>=3*duration)return {memory:null,signal:null,reason:'Подготовка не возвращалась несколько свечей'};
 const signal:RadarSignal={...previous.signal,price:ctx.price,
  volumeRatio:matching?candidate.volumeRatio:previous.signal.volumeRatio,
  watchState:matching?'LIVE':'HELD',
  watchNote:matching?'Подготовка сохраняется; ждём существенного изменения':
   'Краткое отклонение — уровень остаётся под наблюдением'};
 return {memory:{...previous,signal,lastSeenAt:matching?ctx.now:previous.lastSeenAt,quietSince},signal,reason:matching?'Сохраняем':'Ожидание существенного изменения'};
}
export function restoreWatches(raw:unknown,now=Date.now()):Record<string,WatchMemory>{
 if(!raw||typeof raw!=='object')return {};
 const result:Record<string,WatchMemory>={};
 for(const [key,memory] of Object.entries(raw).slice(0,40)){
  const m=memory as WatchMemory,frame=m?.signal?.frame||'5m';
  if(!['5m','1h','4h'].includes(frame)||!m?.signal||m.signal.phase!=='WATCH'||!valid(m.signal.level)||
    !valid(m.signal.invalidation)||!valid(m.anchorHigh)||!valid(m.anchorLow)||
    !Number.isFinite(m.firstSeenAt)||m.firstSeenAt>now||now-m.firstSeenAt>=FRAME_DURATION[frame]*MAX_BARS)continue;
  result[key]=m;
 }
 return result;
}
