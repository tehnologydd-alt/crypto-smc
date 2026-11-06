/** APEX 6.9: READ-ONLY explanation of outcomes by PREDECISION observations.
 * Fixed categories selected before evaluating outcomes. No model update, rank,
 * trade gating, parameter optimization, or assertion of a predictive edge.
 */
import type {StudyProtocol} from './v66-forward-study';
import type {FutureLedger,FutureTicket} from './v64-futures-assistant';
import type {AssistantExchange} from './demo-assistant';
export type AuditFactor='volume'|'impulse'|'direction'|'frame';
export type AuditPeriod='all'|'early'|'later';
export type AuditCount={n:number;positive:number;negative:number;zero:number;
 tp1:number;stopped:number;completed:number;avgGrossPct:number|null;sampleDays:number;status:'EMPTY'|'SMALL'|'DESCRIPTIVE'};
export type AuditRow={key:string;label:string;all:AuditCount;early:AuditCount;later:AuditCount};
export type VenueAudit={source:AssistantExchange;observations:number;rows:AuditRow[]};
export type AuditReport={protocolStartedAt:number|null;cutoverAt:number|null;factor:AuditFactor;
 binance:VenueAudit;bybit:VenueAudit;total:number;early:number;later:number;
 message:string};
export const AUDIT_EARLY_DAYS=7,MIN_OBSERVATIONS_PER_GROUP=10;
export const AUDIT_FACTORS:Record<AuditFactor,string>={
 volume:'Относительный объём',impulse:'Движение / диапазон',
 direction:'Направление',frame:'Таймфрейм'
};
const MS_DAY=86400000;
const N=(x:unknown)=>typeof x==='number'&&Number.isFinite(x);
export const auditWarning='Исследовательская группировка по заранее установленным порогам, а НЕ доказательство причинности или прибыльности. Множество сравнений, малые выборки, зависимость между сценариями, комиссии и funding могут искажать впечатление. Никаких автоматических изменений сигналов.';
function evidence(t:FutureTicket,p:StudyProtocol,now:number):boolean{
 const c=t?.plan?.study;
 return N(t?.createdAt)&&t.createdAt>p.startedAt&&t.createdAt<=now&&
  t.plan?.model===p.modelVersion&&c?.modelVersion===p.modelVersion&&c?.continuous===true&&
  N(c?.capturedAt)&&c.capturedAt>=p.startedAt&&c.capturedAt<=t.createdAt&&
  N(t.plan.observedBarAt)&&t.plan.observedBarAt<t.createdAt&&
  (t.plan.source==='binance'||t.plan.source==='bybit')&&
  t.state==='CLOSED'&&t.quality==='OK'&&t.remainingPct===0&&
  N(t.grossUSDT)&&N(t.setup?.notionalUSDT)&&t.setup.notionalUSDT>0&&
  Array.isArray(t.events)&&t.events.some(e=>e.type==='STOP'||e.type==='COMPLETED');
}
type Group={key:string;label:string;match:(t:FutureTicket)=>boolean};
const groups:Record<AuditFactor,Group[]>={
 volume:[
  {key:'low',label:'Объём ниже 0,8×',match:t=>N(t.plan.study?.volumeRatio20)&&t.plan.study!.volumeRatio20!<0.8&&t.plan.study!.volumeRatio20!>=0},
  {key:'middle',label:'Объём 0,8–1,2×',match:t=>N(t.plan.study?.volumeRatio20)&&t.plan.study!.volumeRatio20!>=0.8&&t.plan.study!.volumeRatio20!<=1.2},
  {key:'high',label:'Объём выше 1,2×',match:t=>N(t.plan.study?.volumeRatio20)&&t.plan.study!.volumeRatio20!>1.2},
  {key:'unknown',label:'Объём неизвестен',match:t=>!N(t.plan.study?.volumeRatio20)||t.plan.study!.volumeRatio20!<0}
 ],
 impulse:[
  {key:'moderate',label:'Движение менее 1,2 диапазона',match:t=>normalized(t)!==null&&normalized(t)!<1.2},
  {key:'medium',label:'Движение 1,2–2,5 диапазона',match:t=>normalized(t)!==null&&normalized(t)!>=1.2&&normalized(t)!<2.5},
  {key:'strong',label:'Движение от 2,5 диапазона',match:t=>normalized(t)!==null&&normalized(t)!>=2.5},
  {key:'unknown',label:'Нет измерения движения',match:t=>normalized(t)===null}
 ],
 direction:[
  {key:'long',label:'LONG (учебный)',match:t=>t.plan.direction==='LONG'},
  {key:'short',label:'SHORT (учебный)',match:t=>t.plan.direction==='SHORT'},
  {key:'unknown',label:'Без направления',match:t=>!['LONG','SHORT'].includes(t.plan.direction)}
 ],
 frame:[
  {key:'5m',label:'M5',match:t=>t.plan.frame==='5m'},
  {key:'1h',label:'H1',match:t=>t.plan.frame==='1h'},
  {key:'4h',label:'H4',match:t=>t.plan.frame==='4h'},
  {key:'unknown',label:'Нет таймфрейма',match:t=>!['5m','1h','4h'].includes(t.plan.frame)}
 ]
};
function normalized(t:FutureTicket):number|null{
 const s=t.plan.study;
 return N(s?.move8)&&N(s?.range20)&&s!.range20>0?Math.abs(s!.move8)/s!.range20:null;
}
function count(items:FutureTicket[]):AuditCount{
 const days=new Set(items.map(t=>Math.floor(t.createdAt/MS_DAY))).size;
 const n=items.length;
 return {n,positive:items.filter(t=>t.grossUSDT>0).length,
  negative:items.filter(t=>t.grossUSDT<0).length,zero:items.filter(t=>t.grossUSDT===0).length,
  tp1:items.filter(t=>t.tpReached>=1).length,
  stopped:items.filter(t=>t.events.some(e=>e.type==='STOP')).length,
  completed:items.filter(t=>t.events.some(e=>e.type==='COMPLETED')).length,
  avgGrossPct:n?items.reduce((sum,t)=>sum+(t.grossUSDT/t.setup.notionalUSDT)*100,0)/n:null,
  sampleDays:days,status:n===0?'EMPTY':n<MIN_OBSERVATIONS_PER_GROUP||days<3?'SMALL':'DESCRIPTIVE'};
}
function venue(source:AssistantExchange,tickets:FutureTicket[],factor:AuditFactor,cutover:number):VenueAudit{
 const selected=tickets.filter(t=>t.plan.source===source);
 const rows=groups[factor].map(g=>{
  const found=selected.filter(g.match);
  return {key:g.key,label:g.label,all:count(found),
   early:count(found.filter(t=>t.createdAt<cutover)),
   later:count(found.filter(t=>t.createdAt>=cutover))};
 });
 return {source,observations:selected.length,rows};
}
/** Split is frozen at protocol start + 7 days, not selected after seeing results.
 * Later cohort is an audit, not an automatic retraining/validation certificate.
 */
export function auditStudyOutcomes(p:StudyProtocol|null,ledger:FutureLedger,
 factor:AuditFactor='volume',now=Date.now()):AuditReport{
 const selected:AuditFactor=Object.prototype.hasOwnProperty.call(groups,factor)?factor:'volume';
 const cutover=p?p.startedAt+AUDIT_EARLY_DAYS*MS_DAY:0;
 const tickets=p?ledger.tickets.filter(t=>evidence(t,p,now)):[];
 const early=tickets.filter(t=>t.createdAt<cutover).length;
 const later=tickets.length-early;
 return {protocolStartedAt:p?.startedAt||null,cutoverAt:p?cutover:null,factor:selected,
  binance:venue('binance',tickets,selected,cutover),
  bybit:venue('bybit',tickets,selected,cutover),
  total:tickets.length,early,later,message:auditWarning};
}
