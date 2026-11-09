/** UI-only stages. Native Room stage codes are immutable historical evidence.
 * Directional Room CONFIRMED historically means touched entry, not ready limit.
 */
import {directionalHypothesis,planDirectionalScenario} from './directional-scenario.mjs';
export const FAVORITES_MAX=10;
export const FORECAST_STAGES=Object.freeze([
 'PENDING_CONFIRMATION','CONFIRMED','ACTIVE','COMPLETED'
]);
export const FORECAST_STAGE_LABELS=Object.freeze({
 PENDING_CONFIRMATION:'Ожидает',
 CONFIRMED:'Лимитный',
 ACTIVE:'Активный',
 COMPLETED:'Завершён'
});
export function sanitizeFavorites(input){
 if(!Array.isArray(input))return [];
 return [...new Set(input.filter(x=>typeof x==='string'&&/^[A-Z0-9]{5,20}$/.test(x)))].slice(0,FAVORITES_MAX);
}
export function forecastStage(row,{now=Date.now()}={}){
 const saved=FORECAST_STAGES.includes(row?.status)?row.status:'PENDING_CONFIRMATION';
 if(!directionalHypothesis(row)||saved==='COMPLETED')return saved;
 const checked=planDirectionalScenario(row,{now});
 if(checked.state!=='READY')return 'PENDING_CONFIRMATION';
 const plan=checked.plan,period=plan.evaluationInterval==='5m'?300000:3600000;
 // Derived view: published directional levels = limit; the historical
 // CONFIRMED Room event is actual entry touch, therefore display Active.
 const entered=Array.isArray(row.stageEvents)&&row.stageEvents.some(e=>
  e?.stage==='CONFIRMED'&&Number.isSafeInteger(e.observedAt)&&
  e.observedAt>=plan.publishedAt&&e.observedAt<=plan.targetCloseAt&&
  e.observedAt%period===period-1&&Number.isSafeInteger(e.recordedAt)&&
  e.recordedAt>=e.observedAt&&e.recordedAt<=now+60000);
 return entered?'ACTIVE':'CONFIRMED';
}
export function journalCounts(rows,{now=Date.now()}={}){
 const result=Object.fromEntries(FORECAST_STAGES.map(x=>[x,0]));
 for(const x of Array.isArray(rows)?rows:[])result[forecastStage(x,{now})]++;
 return result;
}
