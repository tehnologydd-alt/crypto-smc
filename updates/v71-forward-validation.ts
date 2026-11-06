/** APEX 7.1: prospective read-only check of previously FROZEN research hypotheses.
 * This is temporal out-of-sample DESCRIPTIVE evidence, not a claim of independent
 * market experiments, validated causation, model adaptation or profitable signals.
 * Every future outcome must have been created AFTER the particular freeze timestamp.
 */
import type {StudyProtocol} from './v66-forward-study';
import type {FutureLedger,FutureTicket} from './v64-futures-assistant';
import {FUTURE_FRAME_MS} from './v64-futures-assistant';
import type {HypothesisArchive,FrozenHypothesis} from './v70-hypothesis-discovery';

export const V71_MIN_EACH=10,V71_MIN_DAYS_EACH=3,V71_VISIBLE_GAP_PP=10;
export type V71Verdict='COLLECTING'|'SAME_DIRECTION'|'OPPOSITE_DIRECTION'|'NO_CLEAR_DIFFERENCE';
export type V71Group={n:number;stops:number;completed:number;days:number;stopPct:number|null};
export type V71Exclusions={beforeFreeze:number;differentVenue:number;pending:number;expired:number;
 missingOrGap:number;uncertain:number;missingFactor:number;duplicate:number;notYetClosed:number};
export type V71Item={
 id:string;source:'binance'|'bybit';factor:FrozenHypothesis['factor'];
 focusLabel:string;comparisonLabel:string;frozenAt:number;baselineGapPP:number;
 focus:V71Group;comparison:V71Group;futureGapPP:number|null;
 verdict:V71Verdict;daysSinceFreeze:number;exclusions:V71Exclusions;
};
export type V71Report={protocolId:string|null;hypotheses:number;ready:number;
 collecting:number;items:V71Item[];note:string};
const DAY=86400000;
const number=(n:unknown):n is number=>typeof n==='number'&&Number.isFinite(n);
const time=(n:unknown):n is number=>Number.isSafeInteger(n)&&Number(n)>0;
const empty=():V71Group=>({n:0,stops:0,completed:0,days:0,stopPct:null});
const excluded=():V71Exclusions=>({beforeFreeze:0,differentVenue:0,pending:0,expired:0,
 missingOrGap:0,uncertain:0,missingFactor:0,duplicate:0,notYetClosed:0});
const qualified=(t:FutureTicket,h:FrozenHypothesis,p:StudyProtocol,now:number)=>{
 const c=t.plan?.study,d=t.plan?.frame;
 if(t.plan?.model!==h.modelVersion||t.plan?.source!==h.source||!c||
  c.modelVersion!==p.modelVersion||c.continuous!==true||
  c.sampleBars!==36||!number(c.range20)||c.range20<=0||
  !time(c.capturedAt)||c.capturedAt<=h.frozenAt||c.capturedAt>t.createdAt||
  !time(t.plan.observedBarAt)||!d||!(d in FUTURE_FRAME_MS)||
  t.plan.observedBarAt+FUTURE_FRAME_MS[d]>t.createdAt||
  !number(t.grossUSDT)||!number(t.setup?.notionalUSDT)||t.setup.notionalUSDT<=0||
  !Array.isArray(t.events)||t.plan.symbol.length===0||
  !time(t.createdAt)||t.createdAt>now)return false;
 return true;
};
type Bucket='focus'|'comparison'|'unknown';
const bucket=(t:FutureTicket,h:FrozenHypothesis):Bucket=>{
 const c=t.plan.study;
 if(!c)return 'unknown';
 let focus:boolean;
 switch(h.factor){
  case 'volume':
   if(!number(c.volumeRatio20)||c.volumeRatio20<0)return 'unknown';
   focus=c.volumeRatio20>1.2;break;
  case 'impulse':
   if(!number(c.move8)||!number(c.range20)||c.range20<=0)return 'unknown';
   focus=Math.abs(c.move8)/c.range20>=2.5;break;
  case 'direction':
   if(t.plan.direction!=='LONG'&&t.plan.direction!=='SHORT')return 'unknown';
   focus=t.plan.direction==='LONG';break;
  case 'frame':
   if(!['5m','1h','4h'].includes(t.plan.frame))return 'unknown';
   focus=t.plan.frame==='5m';break;
  default:return 'unknown';
 }
 return (focus?'focus':'comparison');
};
function from(tickets:FutureTicket[]):V71Group{
 const n=tickets.length;
 const stops=tickets.filter(t=>t.events.some(e=>e.type==='STOP')).length;
 const completed=tickets.filter(t=>t.events.some(e=>e.type==='COMPLETED')).length;
 return {n,stops,completed,days:new Set(tickets.map(t=>Math.floor(t.createdAt/DAY))).size,
  stopPct:n?100*stops/n:null};
}
function evaluate(h:FrozenHypothesis,p:StudyProtocol,ledger:FutureLedger,now:number):V71Item{
 const exclusions=excluded();
 const focus:FutureTicket[]=[],comparison:FutureTicket[]=[];
 const seen=new Set<string>();
 // Deterministic first accepted event per (venue, symbol, timeframe, decision bar).
 // Duplicated imports/overlapping virtual records must not enlarge sample size.
 const sorted=[...ledger.tickets].filter(Boolean).sort((a,b)=>a.createdAt-b.createdAt||a.id.localeCompare(b.id));
 for(const t of sorted){
  if(t.plan?.source!==h.source){exclusions.differentVenue++;continue;}
  if(!time(t.createdAt)||t.createdAt<=h.frozenAt){
   exclusions.beforeFreeze++;continue;
  }
  if(t.createdAt>now){exclusions.notYetClosed++;continue;}
  if(t.quality==='GAP'){exclusions.missingOrGap++;continue;}
  if(t.state==='WAITING'||t.state==='OPEN'){exclusions.pending++;continue;}
  if(t.state==='EXPIRED'||t.state==='CANCELLED'){exclusions.expired++;continue;}
  if(t.state!=='CLOSED'||!time(t.closedAt)||t.closedAt<t.createdAt){
   exclusions.uncertain++;continue;
  }
  if(t.closedAt>now){exclusions.notYetClosed++;continue;}
  if(t.remainingPct!==0||!t.events.some(e=>e.type==='STOP'||e.type==='COMPLETED')){
   exclusions.uncertain++;continue;
  }
  if(!qualified(t,h,p,now)){exclusions.missingOrGap++;continue;}
  const group=bucket(t,h);
  if(group==='unknown'){exclusions.missingFactor++;continue;}
  const k=t.plan.source+':'+t.plan.symbol+':'+t.plan.frame+':'+t.plan.observedBarAt;
  if(seen.has(k)){exclusions.duplicate++;continue;}
  seen.add(k);
  (group==='focus'?focus:comparison).push(t);
 }
 const f=from(focus),c=from(comparison);
 const futureGapPP=f.stopPct!==null&&c.stopPct!==null?f.stopPct-c.stopPct:null;
 const ready=f.n>=V71_MIN_EACH&&c.n>=V71_MIN_EACH&&
  f.days>=V71_MIN_DAYS_EACH&&c.days>=V71_MIN_DAYS_EACH;
 const baseSign=Math.sign(h.contrast.differencePctPoints);
 const stepSign=futureGapPP===null||Math.abs(futureGapPP)<V71_VISIBLE_GAP_PP?0:Math.sign(futureGapPP);
 const verdict:V71Verdict=!ready?'COLLECTING':stepSign===0?'NO_CLEAR_DIFFERENCE':
  stepSign===baseSign?'SAME_DIRECTION':'OPPOSITE_DIRECTION';
 return {id:h.id,source:h.source,factor:h.factor,focusLabel:h.focusLabel,
  comparisonLabel:h.comparisonLabel,frozenAt:h.frozenAt,
  baselineGapPP:h.contrast.differencePctPoints,focus:f,comparison:c,
  futureGapPP,verdict,daysSinceFreeze:Math.max(0,Math.floor((now-h.frozenAt)/DAY)),exclusions};
}
/** This function never writes the hypothesis archive, source ledger or study protocol.
 * It can be re-evaluated as new CLOSED demo observations arrive; original baselines
 * and the freeze cutoff remain fixed.
 */
export function evaluateFrozenHypotheses(p:StudyProtocol|null,archive:HypothesisArchive,
 ledger:FutureLedger,now=Date.now()):V71Report{
 const result:V71Report={protocolId:p?.id||null,hypotheses:0,ready:0,collecting:0,
  items:[],note:'Только новые закрытые Futures DEMO после фиксации гипотезы; без переобучения, реальных биржевых ордеров и доказанной прибыльности.'};
 if(!p||!time(now)||now<p.startedAt)return result;
 const items=archive.items.filter(h=>h.protocolId===p.id&&h.modelVersion===p.modelVersion&&
  h.researchOnly===true&&h.stage==='AWAITING_FUTURE_TEST'&&time(h.frozenAt)&&h.frozenAt<=now)
  .map(h=>evaluate(h,p,ledger,now));
 return {...result,hypotheses:items.length,
  ready:items.filter(i=>i.verdict!=='COLLECTING').length,
  collecting:items.filter(i=>i.verdict==='COLLECTING').length,items};
}
