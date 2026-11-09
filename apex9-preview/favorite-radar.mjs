/**
 * One tiny, verified Radar notice per Android favorite. Pure presentation model.
 * The raw scanner stores at most two real closed-candle observations.
 * Empty, unsupported, stale or ambiguous histories are intentionally invisible.
 */
import {CANDLE_INTERVALS} from './candles.mjs';
import {compareRadarObservations,validateRadarObservation} from './radar-changes.mjs';

const LABELS=Object.freeze({
 DIRECTION:'Направление',MODE:'Режим',
 SPEED_UP:'Ускорение',SPEED_DOWN:'Замедление',
 VOLUME_UP:'Объём вырос',VOLUME_DOWN:'Объём снизился'
});
const FRAME=Object.freeze({'15m':'M15','1h':'H1','4h':'H4','1d':'D1'});
const SYMBOL=/^[A-Z0-9]{5,20}$/;
export const MAX_OVERVIEW_NOTICES=10;

export function getFavoriteRadarNotices(favorites,history,{now=Date.now()}={}){
 if(!Array.isArray(favorites)||!history||typeof history!=='object'||
  !Number.isSafeInteger(now)||now<=0)return [];
 const allowed=new Set(favorites.slice(0,MAX_OVERVIEW_NOTICES).filter(x=>
  typeof x==='string'&&SYMBOL.test(x)&&x.endsWith('USDT')));
 if(!allowed.size)return [];
 const chosen=new Map();
 for(const slot of Object.values(history).slice(0,64)){
  const after=slot?.latest,before=slot?.previous;
  if(!validateRadarObservation(after)||!validateRadarObservation(before)||
   !allowed.has(after.symbol)||after.symbol!==before.symbol||
   after.interval!==before.interval)continue;
  const step=CANDLE_INTERVALS[after.interval];
  // No delayed "fresh" events from old app sessions, even with a valid saved pair.
  if(!step||after.observedAt>now+60000||after.candleAt>now||
   now-after.candleAt>2*step+60000)continue;
  const comparison=compareRadarObservations(before,after);
  if(comparison.state!=='CHANGED'||!comparison.events.length)continue;
  const events=comparison.events.filter(x=>Object.hasOwn(LABELS,x.kind));
  if(!events.length)continue;
  const notice={symbol:after.symbol,interval:after.interval,
   frame:FRAME[after.interval],candleAt:after.candleAt,
   observedAt:after.observedAt,beforeAt:before.candleAt,
   label:events.slice(0,2).map(x=>LABELS[x.kind]).join(' · '),
   events:events.map(x=>({kind:x.kind,label:LABELS[x.kind],description:x.description})),
   span:comparison.span};
  const old=chosen.get(after.symbol);
  if(!old||old.candleAt<notice.candleAt||
   (old.candleAt===notice.candleAt&&old.interval==='1d'))
   chosen.set(after.symbol,notice);
 }
 return [...chosen.values()].sort((a,b)=>b.candleAt-a.candleAt||
  a.symbol.localeCompare(b.symbol)).slice(0,MAX_OVERVIEW_NOTICES);
}
export function summarizeFavoriteRadar(notices){
 const valid=Array.isArray(notices)?notices:[];
 return {count:valid.length,
  text:valid.length?'Изменения у '+valid.length+' избранных активов · открыть радар':
   'Пока нет свежих подтверждённых изменений'};
}
