/** APEX Radar: closed-bar cadence, no screen-dependent starting trigger.
 * Foreground performs at most one timeframe per minute while visible.
 * Android background is covered separately by opt-in WorkManager.
 */
import {CANDLE_INTERVALS} from './candles.mjs';
export const RADAR_AUTO_FRAMES=Object.freeze(['15m','1h','4h','1d']);
export const RADAR_AUTO_KEY='apex9:radar-auto-checkpoints:v1';
const valid=s=>typeof s==='string'&&/^[A-Z0-9]{2,16}USDT$/.test(s);
export function radarFavoriteSignature(favorites){
 if(!Array.isArray(favorites))return '';
 return [...new Set(favorites.filter(valid))].slice(0,10).sort().join(',');
}
export function radarExpectedClose(frame,now=Date.now()){
 const step=CANDLE_INTERVALS[frame];
 if(!step||!Number.isSafeInteger(now)||now<step+30000)return null;
 // Allow the exchange 30 seconds to publish the just-completed candle.
 return Math.floor((now-30000)/step)*step-1;
}
export function selectRadarAutoFrame(favorites,checkpoints,{now=Date.now()}={}){
 const signature=radarFavoriteSignature(favorites);
 if(!signature)return {state:'NO_FAVORITES'};
 for(const frame of RADAR_AUTO_FRAMES){
  const close=radarExpectedClose(frame,now);
  if(close===null)continue;
  const p=checkpoints?.[frame];
  if(!p||p.signature!==signature||p.close!==close)
   return {state:'DUE',frame,close,signature};
  // One bounded retry after an actual failed/partial source check,
  // never spin on every timer tick or claim successful observation.
  if(p.failed===true&&p.attempts===1&&
   now-p.checkedAt>=10*60000)
   return {state:'DUE',frame,close,signature};
 }
 return {state:'CURRENT',signature};
}
export function readRadarAutoCheckpoints(storage){
 try{
  const raw=storage?.getItem?.(RADAR_AUTO_KEY);
  if(!raw)return {};
  const data=JSON.parse(raw);
  if(!data||typeof data!=='object')return {};
  return Object.fromEntries(RADAR_AUTO_FRAMES.filter(frame=>{
   const p=data[frame];
   return p&&Number.isSafeInteger(p.close)&&p.close>0&&
    typeof p.signature==='string'&&p.signature.length<=200&&
    typeof p.checkedAt==='number'&&Number.isSafeInteger(p.checkedAt);
  }).map(frame=>[frame,data[frame]]));
 }catch{return {}}
}
export function writeRadarAutoCheckpoint(storage,checkpoints,plan,at=Date.now()){
 if(plan?.state!=='DUE'||!RADAR_AUTO_FRAMES.includes(plan.frame)||
  !Number.isSafeInteger(at))return false;
 const old=checkpoints[plan.frame];
 const same=old?.signature===plan.signature&&old?.close===plan.close;
 checkpoints[plan.frame]={signature:plan.signature,close:plan.close,
  checkedAt:at,attempts:same?Math.min(2,(old.attempts||1)+1):1,failed:false};
 try{storage?.setItem?.(RADAR_AUTO_KEY,JSON.stringify(checkpoints));return true}
 catch{return false}
}

export function markRadarAutoFailure(storage,checkpoints,plan,at=Date.now()){
 if(plan?.state!=='DUE'||!RADAR_AUTO_FRAMES.includes(plan.frame))return false;
 const current=checkpoints?.[plan.frame];
 if(!current||current.signature!==plan.signature||current.close!==plan.close)return false;
 current.failed=true;
 current.checkedAt=at;
 try{storage?.setItem?.(RADAR_AUTO_KEY,JSON.stringify(checkpoints));return true}
 catch{return false}
}
