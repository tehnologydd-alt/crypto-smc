/** APEX 7.0: conservative, explainable hypothesis *discovery* in FUTURES DEMO.
 * READ-ONLY. Nothing here modifies scenarios, weights, exchange accounts or research protocol.
 * Frozen source/categorical contrasts and minimums prevent post-hoc threshold searches.
 * A hypothesis is NOT a validated pattern and must never be presented as a signal.
 */
import type {StudyProtocol} from './v66-forward-study';
import type {FutureLedger} from './v64-futures-assistant';
import {auditStudyOutcomes,type AuditFactor,type AuditCount} from './v69-outcome-audit';
import type {AssistantExchange} from './demo-assistant';

export type DiscoveryContrast={focusN:number;otherN:number;focusDays:number;otherDays:number;
 focusStop:number;otherStop:number;focusStopPct:number;otherStopPct:number;differencePctPoints:number};
export type DiscoveryCandidate={
 id:string;protocolId:string;modelVersion:'futures-study-v1';source:AssistantExchange;
 factor:AuditFactor;focusKey:string;focusLabel:string;comparisonLabel:string;
 observationEndAt:number;discoveryAt:number;description:string;contrast:DiscoveryContrast;
 researchOnly:true;
};
export type DiscoveryReport={protocolId:string|null;screened:number;eligibleClosed:number;
 candidates:DiscoveryCandidate[];message:string};
export type FrozenHypothesis=DiscoveryCandidate & {frozenAt:number;stage:'AWAITING_FUTURE_TEST'};
export type HypothesisArchive={version:1;items:FrozenHypothesis[]};
export const EMPTY_HYPOTHESES:HypothesisArchive={version:1,items:[]};
export const MAX_FROZEN_HYPOTHESES=16;
export const MIN_PER_SIDE=5,MIN_DISTINCT_DAYS=2,MIN_STOP_DIFFERENCE_PP=10;
const specs:{factor:AuditFactor;key:string}[]=[
 {factor:'volume',key:'high'},
 {factor:'impulse',key:'strong'},
 {factor:'direction',key:'long'},
 {factor:'frame',key:'5m'}
];
const finite=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v);
const nat=(v:unknown):v is number=>Number.isSafeInteger(v)&&Number(v)>=0;
const title=(f:AuditFactor)=>f==='volume'?'относительного объёма':
 f==='impulse'?'силы движения':f==='direction'?'направления':'таймфрейма';
const makeId=(p:StudyProtocol,source:AssistantExchange,factor:AuditFactor,key:string)=>
 p.id+':'+source+':'+factor+':'+key;
function isKnownGroup(key:string){return key!=='unknown';}
function countOther(rows:{key:string;all:AuditCount}[],key:string){
 const rest=rows.filter(r=>r.key!==key&&isKnownGroup(r.key)).map(r=>r.all);
 // Unique days may overlap across buckets. Do not sum them as if independent;
 // conservatively use the max known days. This never inflates evidence.
 return {n:rest.reduce((s,r)=>s+r.n,0),stopped:rest.reduce((s,r)=>s+r.stopped,0),
  days:rest.reduce((max,r)=>Math.max(max,r.sampleDays),0)};
}
export function discoverHypotheses(p:StudyProtocol|null,ledger:FutureLedger,now=Date.now()):DiscoveryReport{
 const base:DiscoveryReport={protocolId:p?.id||null,screened:specs.length*2,eligibleClosed:0,
  candidates:[],message:'Фиксированные контрасты по одному признаку на биржу: нет автоматического обучения и нет доказанных торговых закономерностей.'};
 if(!p||!Number.isSafeInteger(now)||now<=p.startedAt)return base;
 // Stronger than 6.9: exclude outcomes that were not yet recorded as CLOSED at discovery.
 // No hindsight: even an otherwise valid ticket closed after now cannot be included.
 const known:FutureLedger={version:1,tickets:ledger.tickets.filter(t=>
  t?.state==='CLOSED'&&nat(t.closedAt)&&t.closedAt!<=now&&t.closedAt!>=t.createdAt&&
  t.createdAt>p.startedAt&&t.createdAt<=now)};
 const audits=new Map<AuditFactor,ReturnType<typeof auditStudyOutcomes>>();
 for(const spec of specs)if(!audits.has(spec.factor))
  audits.set(spec.factor,auditStudyOutcomes(p,known,spec.factor,now));
 base.eligibleClosed=audits.get('volume')?.total||0;
 for(const source of ['binance','bybit'] as const){
  for(const spec of specs){
   const audit=audits.get(spec.factor)![source];
   const focus=audit.rows.find(r=>r.key===spec.key);
   if(!focus)continue;
   const other=countOther(audit.rows,spec.key);
   const own=focus.all;
   if(own.n<MIN_PER_SIDE||other.n<MIN_PER_SIDE||
    own.sampleDays<MIN_DISTINCT_DAYS||other.days<MIN_DISTINCT_DAYS)continue;
   const focusStopPct=100*own.stopped/own.n,otherStopPct=100*other.stopped/other.n;
   const differencePctPoints=focusStopPct-otherStopPct;
   if(Math.abs(differencePctPoints)<MIN_STOP_DIFFERENCE_PP)continue;
   const trend=differencePctPoints>0?'чаще':'реже';
   const description='В учебной выборке '+source+' группа «'+focus.label+
    '» имела защитные выходы '+trend+' остальных известных групп '+title(spec.factor)+
    '. Требуется будущая проверка; отличие не доказывает причинную связь.';
   base.candidates.push({id:makeId(p,source,spec.factor,spec.key),
    protocolId:p.id,modelVersion:p.modelVersion,source,factor:spec.factor,
    focusKey:spec.key,focusLabel:focus.label,
    comparisonLabel:'Остальные известные группы ('+title(spec.factor)+')',
    observationEndAt:now,discoveryAt:now,description,
    contrast:{focusN:own.n,otherN:other.n,focusDays:own.sampleDays,otherDays:other.days,
     focusStop:own.stopped,otherStop:other.stopped,focusStopPct,otherStopPct,
     differencePctPoints},researchOnly:true});
  }
 }
 return base;
}
function validFrozen(h:unknown,now:number):h is FrozenHypothesis{
 if(!h||typeof h!=='object')return false;
 const x=h as FrozenHypothesis,c=x.contrast;
 if(!x.protocolId?.startsWith('forward-demo-v1:')||!['binance','bybit'].includes(x.source)||
  !specs.some(s=>s.factor===x.factor&&s.key===x.focusKey)||
  x.id!==x.protocolId+':'+x.source+':'+x.factor+':'+x.focusKey||
  x.modelVersion!=='futures-study-v1'||x.stage!=='AWAITING_FUTURE_TEST'||
  x.researchOnly!==true||!nat(x.discoveryAt)||!nat(x.observationEndAt)||
  !nat(x.frozenAt)||x.discoveryAt!==x.observationEndAt||x.frozenAt<x.discoveryAt||
  x.frozenAt>now||typeof x.description!=='string'||x.description.length>1000||
  typeof x.focusLabel!=='string'||typeof x.comparisonLabel!=='string'||!c)return false;
 const v=[c.focusN,c.otherN,c.focusDays,c.otherDays,c.focusStop,c.otherStop];
 return v.every(nat)&&c.focusN>=MIN_PER_SIDE&&c.otherN>=MIN_PER_SIDE&&
  c.focusDays>=MIN_DISTINCT_DAYS&&c.otherDays>=MIN_DISTINCT_DAYS&&
  c.focusStop<=c.focusN&&c.otherStop<=c.otherN&&
  [c.focusStopPct,c.otherStopPct,c.differencePctPoints].every(finite)&&
  Math.abs(c.focusStopPct-100*c.focusStop/c.focusN)<1e-7&&
  Math.abs(c.otherStopPct-100*c.otherStop/c.otherN)<1e-7&&
  Math.abs(c.differencePctPoints-(c.focusStopPct-c.otherStopPct))<1e-7&&
  Math.abs(c.differencePctPoints)>=MIN_STOP_DIFFERENCE_PP;
}
export function restoreHypothesisArchive(raw:string|null,now=Date.now()):HypothesisArchive{
 try{
  const x=JSON.parse(raw||'null') as HypothesisArchive;
  if(x?.version!==1||!Array.isArray(x.items)||x.items.length>MAX_FROZEN_HYPOTHESES||
   !x.items.every(h=>validFrozen(h,now)))return EMPTY_HYPOTHESES;
  const ids=new Set(x.items.map(h=>h.id));
  if(ids.size!==x.items.length||new Set(x.items.map(h=>h.protocolId)).size>1)return EMPTY_HYPOTHESES;
  return x;
 }catch{return EMPTY_HYPOTHESES;}
}
export function freezeHypothesis(old:HypothesisArchive,p:StudyProtocol,
 candidate:DiscoveryCandidate,now=Date.now()):HypothesisArchive{
 if(old.items.length>=MAX_FROZEN_HYPOTHESES||old.items.some(h=>h.id===candidate.id))return old;
 if(candidate.protocolId!==p.id||candidate.modelVersion!==p.modelVersion||
  candidate.id!==makeId(p,candidate.source,candidate.factor,candidate.focusKey)||
  candidate.researchOnly!==true||candidate.discoveryAt>now||candidate.discoveryAt<=p.startedAt||
  candidate.observationEndAt!==candidate.discoveryAt||
  (old.items.length>0&&old.items[0].protocolId!==p.id))
  throw Error('Гипотеза не соответствует закреплённому исследовательскому протоколу.');
 const saved:FrozenHypothesis={...candidate,contrast:{...candidate.contrast},frozenAt:now,stage:'AWAITING_FUTURE_TEST'};
 if(!validFrozen(saved,now))throw Error('Недостаточно надёжных данных для сохранения гипотезы.');
 return {version:1,items:[...old.items,saved]};
}
export function hypothesesForProtocol(archive:HypothesisArchive,p:StudyProtocol|null):FrozenHypothesis[]{
 return p?archive.items.filter(h=>h.protocolId===p.id):[];
}
