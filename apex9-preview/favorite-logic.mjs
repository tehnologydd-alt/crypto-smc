/** Pure research UI rules. Native DataStore is authoritative for the 10-item limit. */
export const FAVORITES_MAX=10;
export const FORECAST_STAGES=Object.freeze([
 'PENDING_CONFIRMATION','CONFIRMED','ACTIVE','COMPLETED'
]);
export const FORECAST_STAGE_LABELS=Object.freeze({
 PENDING_CONFIRMATION:'Ожидает подтверждения',
 CONFIRMED:'Прогноз подтверждён',
 ACTIVE:'Активный',
 COMPLETED:'Завершён'
});
export function sanitizeFavorites(input){
 if(!Array.isArray(input))return [];
 return [...new Set(input.filter(x=>typeof x==='string'&&/^[A-Z0-9]{5,20}$/.test(x)))].slice(0,FAVORITES_MAX);
}
export function forecastStage(row){
 return FORECAST_STAGES.includes(row?.status)?row.status:'PENDING_CONFIRMATION';
}
export function journalCounts(rows){
 const result=Object.fromEntries(FORECAST_STAGES.map(x=>[x,0]));
 for(const x of Array.isArray(rows)?rows:[])result[forecastStage(x)]++;
 return result;
}
