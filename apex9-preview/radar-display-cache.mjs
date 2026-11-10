/** Persist a small, validated Radar display. Offline entries are ARCHIVE,
 * never proof of a currently fresh exchange response.
 */
import {validateRadarObservation,compareRadarObservations} from './radar-changes.mjs';
const KEY='apex9:radar-display-cache:v1';
const MAX_MS=5*86400000;
const valid=n=>typeof n==='number'&&Number.isFinite(n);
export function radarRowFromHistory(latest,previous=null){
 if(!validateRadarObservation(latest))return null;
 const change=previous?compareRadarObservations(previous,latest):
  {state:'BASELINE',events:[],reason:'Нет предыдущей закрытой свечи'};
 return {symbol:latest.symbol,quoteVolume:null,lastPrice:null,
  change24h:null,analysis:{state:'OK',direction:latest.direction,
   mode:latest.mode,movement:latest.movement,
   acceleration:latest.acceleration,volumeRatio:latest.volumeRatio,
   lastClosedAt:latest.candleAt},
  change,observedAt:latest.observedAt,source:'Binance Spot',
  saved:true};
}
export function createRadarDisplayCache({storage,now=()=>Date.now()}={}){
 const memory=new Map();
 function read(frame,favorites=[]){
  const selected=new Set(Array.isArray(favorites)?favorites.slice(0,10):[]);
  let archived=null;
  try{archived=JSON.parse(storage?.getItem?.(KEY)||'null')}catch{}
  const rows=[];
  for(const raw of (archived?.[frame]||memory.get(frame)||[]).slice(0,10)){
   const latest=raw?.latest,previous=raw?.previous;
   if(!validateRadarObservation(latest)||!selected.has(latest.symbol)||
    now()-latest.observedAt>MAX_MS||latest.observedAt>now()+60000)continue;
   const row=radarRowFromHistory(latest,previous);
   if(row)rows.push(row);
  }
  return rows;
 }
 function save(frame,rows){
  const selected=Array.isArray(rows)?rows:[];
  const payload=[];
  for(const row of selected.slice(0,10)){
   if(!validateRadarObservation(row?.latest))continue;
   payload.push({latest:row.latest,
    previous:validateRadarObservation(row.previous)?row.previous:null});
  }
  if(!payload.length)return false;
  memory.set(frame,payload);
  try{
   const all=JSON.parse(storage?.getItem?.(KEY)||'{}')||{};
   all[frame]=payload;storage?.setItem?.(KEY,JSON.stringify(all));
  }catch{}
  return true;
 }
 return {read,save};
}
