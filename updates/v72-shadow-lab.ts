/** APEX 7.2 — DEMO-only read-only SHADOW RESEARCH LAB.
 * Experimental versions are labeled observation filters, never executable
 * strategies or modifications to the original frozen Futures model.
 *
 * Every candidate and its rule are frozen explicitly before observing its
 * evaluation cohort. Both reference and shadow view use the EXACT SAME
 * subsequent completed paper-position observations, after the candidate's
 * own creation time. Empty/uncertain outcomes never turn into successes.
 */
import type {StudyProtocol} from './v66-forward-study';
import type {FutureLedger} from './v64-futures-assistant';
import {restoreHypothesisArchive,type FrozenHypothesis} from './v70-hypothesis-discovery';
import {evaluateFrozenHypotheses,type V71Exclusions} from './v71-forward-validation';

export const MAX_SHADOW_VERSIONS=8;
export type ShadowGroup='focus'|'comparison';
export type ShadowVersion={
 version:1;id:string;protocolId:string;source:'binance'|'bybit';
 model:'shadow-study-v1';rule:'prefer-lower-observed-stop-group-v1';
 createdAt:number;selected:ShadowGroup;hypothesis:FrozenHypothesis;
 researchOnly:true;
};
export type ShadowArchive={version:1;items:ShadowVersion[]};
export const EMPTY_SHADOW_ARCHIVE:ShadowArchive={version:1,items:[]};
export type ShadowResult={
 id:string;source:'binance'|'bybit';createdAt:number;focusLabel:string;
 selectedLabel:string;ruleLabel:string;originalGapPP:number;
 baselineCount:number;baselineStops:number;baselineStopPct:number|null;
 shadowCount:number;shadowStops:number;shadowStopPct:number|null;
 passedOverCount:number;coveragePct:number|null;observedDifferencePP:number|null;
 daysSelected:number;daysPassedOver:number;
 status:'COLLECTING'|'DESCRIPTIVE';exclusions:V71Exclusions;
};
export type ShadowReport={protocolId:string|null;items:ShadowResult[];experiments:number;
 descriptive:number;notice:string};
const nat=(n:unknown)=>Number.isSafeInteger(n)&&Number(n)>0;
const validFrozen=(h:unknown,now:number):h is FrozenHypothesis=>{
 try{
  const result=restoreHypothesisArchive(JSON.stringify({version:1,items:[h]}),now);
  return result.items.length===1;
 }catch{return false;}
};
const shadowId=(h:FrozenHypothesis)=>h.id+':shadow-study-v1';
function validVersion(x:unknown,now:number):x is ShadowVersion{
 if(!x||typeof x!=='object')return false;
 const s=x as ShadowVersion;
 if(s.version!==1||s.model!=='shadow-study-v1'||
  s.rule!=='prefer-lower-observed-stop-group-v1'||s.researchOnly!==true||
  !nat(s.createdAt)||s.createdAt>now||!validFrozen(s.hypothesis,now)||
  s.id!==shadowId(s.hypothesis)||s.protocolId!==s.hypothesis.protocolId||
  s.source!==s.hypothesis.source||s.createdAt<=s.hypothesis.frozenAt||
  s.selected!==(s.hypothesis.contrast.differencePctPoints>0?'comparison':'focus'))return false;
 return true;
}
export function restoreShadowArchive(raw:string|null,now=Date.now()):ShadowArchive{
 try{
  const x=JSON.parse(raw||'null') as ShadowArchive;
  if(x?.version!==1||!Array.isArray(x.items)||x.items.length>MAX_SHADOW_VERSIONS||
   !x.items.every(s=>validVersion(s,now)))return EMPTY_SHADOW_ARCHIVE;
  if(new Set(x.items.map(s=>s.id)).size!==x.items.length||
   new Set(x.items.map(s=>s.protocolId)).size>1||
   x.items.some((s,i)=>i>0&&s.createdAt<=x.items[i-1].createdAt))
   return EMPTY_SHADOW_ARCHIVE;
  return x;
 }catch{return EMPTY_SHADOW_ARCHIVE;}
}
export function createShadowVersion(old:ShadowArchive,p:StudyProtocol,h:FrozenHypothesis,
 now=Date.now()):ShadowArchive{
 if(old.items.some(s=>s.id===shadowId(h))||old.items.length>=MAX_SHADOW_VERSIONS)return old;
 if(!p||h.protocolId!==p.id||h.modelVersion!==p.modelVersion||
  !nat(now)||now<=h.frozenAt||!validFrozen(h,now)||
  old.items.some(s=>s.protocolId!==p.id)||old.items.some(s=>s.createdAt>=now))
  throw Error('Нельзя создать учебную экспериментальную версию для этой гипотезы.');
 const selected:ShadowGroup=h.contrast.differencePctPoints>0?'comparison':'focus';
 const shadow:ShadowVersion={version:1,id:shadowId(h),protocolId:p.id,source:h.source,
  model:'shadow-study-v1',rule:'prefer-lower-observed-stop-group-v1',
  createdAt:now,selected,hypothesis:{...h,contrast:{...h.contrast}},researchOnly:true};
 if(!validVersion(shadow,now))throw Error('Ошибка фиксации экспериментальных условий.');
 return {version:1,items:[...old.items,shadow]};
}
export function shadowsForProtocol(archive:ShadowArchive,p:StudyProtocol|null):ShadowVersion[]{
 return p?archive.items.filter(s=>s.protocolId===p.id):[];
}
function evaluateOne(p:StudyProtocol,s:ShadowVersion,ledger:FutureLedger,now:number):ShadowResult|null{
 // Convert only the temporal freeze cutoff for an ephemeral read-only
 // evaluator. Original stored hypothesis remains untouched.
 const ephemeral:FrozenHypothesis={...s.hypothesis,frozenAt:s.createdAt};
 const result=evaluateFrozenHypotheses(p,{version:1,items:[ephemeral]},ledger,now).items[0];
 if(!result)return null;
 const selected=s.selected==='focus'?result.focus:result.comparison;
 const other=s.selected==='focus'?result.comparison:result.focus;
 const baselineCount=result.focus.n+result.comparison.n;
 const baselineStops=result.focus.stops+result.comparison.stops;
 const baselineStopPct=baselineCount?100*baselineStops/baselineCount:null;
 const shadowStopPct=selected.stopPct;
 const coveragePct=baselineCount?100*selected.n/baselineCount:null;
 const ready=result.verdict!=='COLLECTING'; // ten each across >=3 independent UTC dates
 return {id:s.id,source:s.source,createdAt:s.createdAt,focusLabel:s.hypothesis.focusLabel,
  selectedLabel:s.selected==='focus'?s.hypothesis.focusLabel:s.hypothesis.comparisonLabel,
  ruleLabel:'В учебной модели отдельно наблюдать группу с меньшей исходной частотой защитных выходов',
  originalGapPP:s.hypothesis.contrast.differencePctPoints,
  baselineCount,baselineStops,baselineStopPct,shadowCount:selected.n,shadowStops:selected.stops,
  shadowStopPct,passedOverCount:other.n,coveragePct,
  observedDifferencePP:shadowStopPct===null||baselineStopPct===null?null:shadowStopPct-baselineStopPct,
  daysSelected:selected.days,daysPassedOver:other.days,
  status:ready?'DESCRIPTIVE':'COLLECTING',exclusions:{...result.exclusions}};
}
export function compareShadowVersions(p:StudyProtocol|null,archive:ShadowArchive,
 ledger:FutureLedger,now=Date.now()):ShadowReport{
 const base:ShadowReport={protocolId:p?.id||null,items:[],experiments:0,descriptive:0,
  notice:'Только исследовательский ярлык и описательные частоты событий в будущих DEMO-наблюдениях. Это не реальные параллельные сделки, не тест доходности и не доказательство преимущества.'};
 if(!p||!nat(now)||p.startedAt>now)return base;
 const items=shadowsForProtocol(archive,p)
  .filter(s=>validVersion(s,now)).map(s=>evaluateOne(p,s,ledger,now))
  .filter((s):s is ShadowResult=>s!==null);
 return {...base,items,experiments:items.length,
  descriptive:items.filter(s=>s.status==='DESCRIPTIVE').length};
}
