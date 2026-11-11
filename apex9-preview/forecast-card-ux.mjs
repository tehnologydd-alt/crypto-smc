/**
 * Research-only, source-preserving forecast card view model.
 * Never treat a historical range hypothesis as a directional order.
 */
export const SIDE_LABEL=Object.freeze({UP:'Условно вверх',DOWN:'Условно вниз'});
export const LEVEL_TITLE=Object.freeze({tp1:'TP1',tp2:'TP2',tp3:'TP3',sl:'SL'});

export function displayPair(asset){
 if(typeof asset!=='string')return '—';
 return asset.endsWith('USDT')?asset.slice(0,-4)+'/USDT':asset;
}
/**
 * The evaluation interval is immutable metadata captured at publication.
 * Old M5/H1 or same-frame M15/H4 outcomes MUST NOT be renamed M1.
 */
export function controlMethodLabel(interval,{fallback='H1'}={}){
 if(interval==='1m')
  return {frame:'M1',label:'Контроль M1 · новый метод',archived:false};
 if(interval==='5m')
  return {frame:'M5',label:'Архивный прогноз · контроль M5',archived:true};
 return {frame:fallback,label:'Архивный прогноз · контроль '+fallback,archived:true};
}

export function priceText(value){
 if(typeof value!=='number'||!Number.isFinite(value)||value<=0)return '—';
 const normalized=Number(value.toPrecision(10));
 // Avoid float tails such as 1.050449999999 and scientific notation on tiny pairs.
 return normalized.toLocaleString('en-US',{useGrouping:false,maximumFractionDigits:16});
}
export function stagePresentation(trace){
 if(!trace||trace.state==='INVALID'||trace.state==='INCONSISTENT_RESULT')
  return {name:'Требует проверки',tone:'warning',observed:0};
 if(trace.state==='EVALUATED')return {name:'Итог проверен',tone:'finished',observed:3};
 if(trace.state==='DUE_UNVERIFIED')
  return {name:'Срок прошёл · нет проверки',tone:'warning',observed:2};
 const verified=Array.isArray(trace.steps)?
  trace.steps.filter(x=>x.observed).length:0;
 return {name:verified>1?'Наблюдение идёт':'Опубликован',tone:'active',
  observed:verified>1?2:1};
}
export function observedLevelSummary(branch){
 if(!branch)return {state:'NOT_CHECKED',label:'Касания ещё не проверены',
  progress:0,hitKeys:[],ambiguous:false};
 const hitKeys=['tp1','tp2','tp3','sl'].filter(key=>
  Boolean(branch.found?.[key]));
 const ambiguous=branch.state==='SAME_H1_UNKNOWN'||
  branch.state==='PUBLICATION_HOUR_UNKNOWN';
 const label=ambiguous?'Порядок касаний не определён по H1':
  branch.state==='SL_FIRST'?'Первым наблюдался защитный уровень':
  branch.state==='TP1_FIRST'?'Первым наблюдался TP1':
  'Контрольных касаний пока нет';
 return {state:branch.state,label,
  progress:hitKeys.filter(x=>x.startsWith('tp')).length,
  hitKeys,ambiguous};
}
export function scenarioCopyText(row,plan,side){
 if(!plan||!['UP','DOWN'].includes(side)||!plan[side])return '';
 const levels=plan[side];
 const lines=[
  displayPair(row?.asset)+' · H1 · '+SIDE_LABEL[side],
  'Контрольные уровни исследования ('+
   (plan.origin==='PUBLISHED'?'зафиксированы':'восстановлены задним числом')+')',
  'Опорная цена: '+priceText(plan.entry),
  'Защитный уровень: '+priceText(levels.sl),
  'TP1: '+priceText(levels.tp1),
  'TP2: '+priceText(levels.tp2),
  'TP3: '+priceText(levels.tp3),
  'Источник: Binance Spot · закрытые H1',
  'Не подтверждённый вход и не биржевой ордер.'
 ];
 return lines.join('\n');
}
