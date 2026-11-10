/** UI-only stages. Native Room stage codes are immutable historical evidence.
 * Directional Room CONFIRMED historically means touched entry, not ready limit.
 */
import {directionalHypothesis,planDirectionalScenario} from './directional-scenario.mjs';
import {multiFrameHypothesis,multiFrameEvidence} from './forecast-multiframe.mjs';
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
 // M15 and H4 use their OWN immutable Room milestones. Do not trust a
 // cached generic "Наблюдение" badge or count historical outcomes as live.
 if(multiFrameHypothesis(row)){
  const checked=multiFrameEvidence(row,{now});
  if(checked.state==='OBSERVED'){
   if(checked.finished)return 'COMPLETED';
   if(checked.events.has('CONFIRMED'))return 'ACTIVE';
   if(checked.events.has('LIMIT_READY'))return 'CONFIRMED';
   return 'PENDING_CONFIRMATION';
  }
  // An unverified terminal row stays visible for a data-integrity warning,
  // never silently becomes an active scenario.
  return row?.evaluation||saved==='COMPLETED'?'COMPLETED':'PENDING_CONFIRMATION';
 }
 if(!directionalHypothesis(row)||saved==='COMPLETED')return saved;
 const checked=planDirectionalScenario(row,{now});
 if(checked.state!=='READY')return 'PENDING_CONFIRMATION';
 const plan=checked.plan,period=plan.evaluationInterval==='5m'?300000:3600000;
 // Older Room CONFIRMED means entry touch. New LIMIT_READY is an
 // independent verified M5 milestone; do not promote preliminary plans.
 const evidence=stage=>Array.isArray(row.stageEvents)&&row.stageEvents.some(e=>
  e?.stage===stage&&Number.isSafeInteger(e.observedAt)&&
  e.observedAt>=plan.publishedAt&&e.observedAt<=plan.targetCloseAt&&
  e.observedAt%period===period-1&&Number.isSafeInteger(e.recordedAt)&&
  e.recordedAt>=e.observedAt&&e.recordedAt<=now+60000);
 if(evidence('CONFIRMED'))return 'ACTIVE';
 return evidence('LIMIT_READY')?'CONFIRMED':'PENDING_CONFIRMATION';
}
export function journalCounts(rows,{now=Date.now()}={}){
 const result=Object.fromEntries(FORECAST_STAGES.map(x=>[x,0]));
 for(const x of Array.isArray(rows)?rows:[])result[forecastStage(x,{now})]++;
 return result;
}
