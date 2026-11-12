/**
 * One-shot navigation target emitted only by APEX's own Android forecast alert.
 * This is a local UI route, not a market instruction or an external deep link.
 */
const STAGES=new Set(['LIMIT_READY','TP1','TP2','TP3','SL']);
const ID=/^(direction2):([A-Z0-9]{5,20}):(1h):([0-9]{10,16})$|^(direction3):([A-Z0-9]{5,20}):(15m|4h):([0-9]{10,16})$/;
export function normalizeForecastNotificationTarget(input){
 if(!input||input.pending!==true||input.version!==1||
  typeof input.asset!=='string'||typeof input.forecastId!=='string'||
  typeof input.stage!=='string'||!STAGES.has(input.stage))return null;
 const m=ID.exec(input.forecastId);
 if(!m)return null;
 const asset=m[2]||m[6];
 if(asset!==input.asset)return null;
 return {version:1,asset,forecastId:input.forecastId,stage:input.stage};
}
export const stageNotificationLabel=stage=>({
 LIMIT_READY:'Лимитный прогноз',
 TP1:'Касание TP1',TP2:'Касание TP2',TP3:'Касание TP3',
 SL:'Касание стоп-уровня SL'
})[stage]||'Наблюдение';
