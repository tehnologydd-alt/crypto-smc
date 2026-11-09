/**
 * Radar observation transitions. Each transition needs TWO different,
 * verified, closed, chronological candles from the same asset and timeframe.
 * We do not infer an intrabar turning point from snapshots or price ticks.
 */
import {CANDLE_INTERVALS} from './candles.mjs';
export const RADAR_CHANGE_STORE_KEY='apex9_radar_observations_v1';
const VERSION=1,MAX_ENTRIES=64;
const finite=n=>typeof n==='number'&&Number.isFinite(n);
const validClock=t=>Number.isSafeInteger(t)&&t>0;
const symbolOK=s=>typeof s==='string'&&/^[A-Z0-9]{5,20}$/.test(s)&&s.endsWith('USDT');
const directions=new Set(['UP','DOWN','FLAT']);
const modes=new Set(['DIRECTIONAL','RANGE','MIXED']);
const pct=n=>Number.isFinite(n)?Math.round(n*10000)/10000:null;
const event=(kind,description)=>({kind,description});
export function validateRadarObservation(o){
 if(!o||o.version!==VERSION||!symbolOK(o.symbol)||
  !Object.hasOwn(CANDLE_INTERVALS,o.interval)||
  !validClock(o.candleAt)||!validClock(o.observedAt)||
  (o.candleAt+1)%CANDLE_INTERVALS[o.interval]!==0||
  o.observedAt<o.candleAt||o.observedAt>o.candleAt+
   2*CANDLE_INTERVALS[o.interval]+60000||
  !directions.has(o.direction)||!modes.has(o.mode)||
  !finite(o.movement)||Math.abs(o.movement)>1000||
  !finite(o.acceleration)||Math.abs(o.acceleration)>1000||
  !(o.volumeRatio===null||finite(o.volumeRatio)&&o.volumeRatio>=0&&o.volumeRatio<1e6)||
  o.source!=='Binance Spot')return false;
 return true;
}
export function createRadarObservation(row,interval,{now=Date.now()}={}){
 const analysis=row?.analysis;
 if(analysis?.state!=='OK'||!CANDLE_INTERVALS[interval]||
  !validClock(analysis?.lastClosedAt)||!finite(analysis?.movement)||
  !finite(analysis?.acceleration)||!validClock(now))return null;
 const record={version:VERSION,symbol:row.symbol,interval,
  candleAt:analysis.lastClosedAt,observedAt:now,
  direction:analysis.direction,mode:analysis.mode,
  movement:pct(analysis.movement),acceleration:pct(analysis.acceleration),
  volumeRatio:finite(analysis.volumeRatio)?pct(analysis.volumeRatio):null,
  source:'Binance Spot'};
 return validateRadarObservation(record)?record:null;
}
export function compareRadarObservations(before,after){
 if(!validateRadarObservation(after))
  return {state:'INVALID',events:[],reason:'Текущий снимок не прошёл проверку'};
 if(!before)return {state:'BASELINE',events:[],
  reason:'Первое наблюдение; сравнение появится после новой свечи'};
 if(!validateRadarObservation(before)||before.symbol!==after.symbol||
  before.interval!==after.interval)
  return {state:'INCOMPARABLE',events:[],
   reason:'Нет сопоставимого предыдущего наблюдения'};
 if(after.candleAt===before.candleAt)
  return {state:'SAME_CANDLE',events:[],
   reason:'Новая закрытая свеча ещё не появилась'};
 if(after.candleAt<before.candleAt)
  return {state:'OLDER_CANDLE',events:[],reason:'Новые данные старее сохранённых'};
 const step=CANDLE_INTERVALS[after.interval];
 const span=(after.candleAt-before.candleAt)/step;
 if(!Number.isInteger(span)||span>8)
  return {state:'GAP',events:[],
   reason:'Между снимками пропущено больше 8 свечей — порядок перемен неизвестен'};
 const events=[];
 if(before.direction!==after.direction)
  events.push(event('DIRECTION','Наблюдаемое направление: '+before.direction+' → '+after.direction));
 if(before.mode!==after.mode)
  events.push(event('MODE','Режим: '+before.mode+' → '+after.mode));
 const oldSpeed=Math.abs(before.movement),newSpeed=Math.abs(after.movement);
 const speedDelta=newSpeed-oldSpeed;
 const meaningful=Math.max(.025,oldSpeed*.25);
 if(Math.abs(speedDelta)>=meaningful){
  events.push(event(speedDelta>0?'SPEED_UP':'SPEED_DOWN',
   speedDelta>0?'Модуль скорости вырос':'Модуль скорости снизился'));
 }
 if(before.volumeRatio!==null&&after.volumeRatio!==null){
  const diff=after.volumeRatio-before.volumeRatio;
  if(Math.abs(diff)>=Math.max(.35,before.volumeRatio*.4)){
   events.push(event(diff>0?'VOLUME_UP':'VOLUME_DOWN',
    diff>0?'Относительный объём вырос':'Относительный объём снизился'));
  }
 }
 return {state:events.length?'CHANGED':'STABLE',events,span,
  beforeAt:before.candleAt,afterAt:after.candleAt,
  reason:events.length?'Перемены между двумя завершёнными свечами':
   'Значимых изменений между наблюдениями не выявлено'};
}
// Store only bounded, source-validated observations, never positions or private data.
export function readRadarChanges(storage){
 if(!storage||typeof storage.getItem!=='function')return {};
 let parsed;
 try{parsed=JSON.parse(storage.getItem(RADAR_CHANGE_STORE_KEY)||'null');}catch{return {};}
 if(!parsed||parsed.version!==VERSION||!Array.isArray(parsed.records))return {};
 const values={};
 for(const item of parsed.records.slice(0,MAX_ENTRIES)){
  if(!item||!validateRadarObservation(item.latest))continue;
  const latest=item.latest;
  const previous=validateRadarObservation(item.previous)&&
   item.previous.symbol===latest.symbol&&item.previous.interval===latest.interval&&
   item.previous.candleAt<latest.candleAt?item.previous:null;
  values[latest.symbol+'|'+latest.interval]={latest,previous};
 }
 return values;
}
export function saveRadarChanges(storage,records){
 if(!storage||typeof storage.setItem!=='function')return false;
 const safe=Object.values(records||{}).filter(x=>
  validateRadarObservation(x?.latest)).sort((a,b)=>
  b.latest.observedAt-a.latest.observedAt).slice(0,MAX_ENTRIES).map(x=>({
   latest:x.latest,
   previous:validateRadarObservation(x.previous)&&
    x.previous.symbol===x.latest.symbol&&x.previous.interval===x.latest.interval&&
    x.previous.candleAt<x.latest.candleAt?x.previous:null
  }));
 try{storage.setItem(RADAR_CHANGE_STORE_KEY,JSON.stringify({
  version:VERSION,records:safe}));return true;}catch{return false;}
}
export function mergeRadarObservation(records,incoming){
 if(!validateRadarObservation(incoming))return {state:'INVALID',events:[]};
 const key=incoming.symbol+'|'+incoming.interval;
 const old=records[key]||null;
 if(old?.latest?.candleAt>incoming.candleAt){
  return {state:'OLDER_CANDLE',events:[],
   reason:'Текущая свеча старее сохранённого наблюдения'};
 }
 if(old?.latest?.candleAt===incoming.candleAt){
  // Preserve the last *real* two-candle transition across repeated refreshes.
  // An identical completed candle is never counted as a new event.
  return compareRadarObservations(old.previous,old.latest);
 }
 const next={previous:old?.latest||null,latest:incoming};
 records[key]=next;
 return compareRadarObservations(next.previous,next.latest);
}
export function radarChangeCount(rows){
 return Array.isArray(rows)?rows.filter(x=>x?.change?.state==='CHANGED').length:0;
}
