/** APEX 4.6: one frozen H1 market-state hypothesis with out-of-sample observations.
 * Never revises training after freeze, and never uses past transitions to score a new hypothesis.
 * Descriptive educational research only; serial dependence remains possible.
 */
import type {HourRegime,HourTransition} from './hour-transitions';

const HOUR=3_600_000;
const MAX=1_500;
const reg:HourRegime[]=['up','down','mixed'];
const PROTOCOL='core-h1-holdout-v1' as const;
export type FrozenHourHypothesis={
 protocol:typeof PROTOCOL;registeredAt:number;frozenAt:number;
 from:HourRegime;expected:HourRegime;
 trainingCount:number;trainingMatches:number;trainingDays:number;lastTrainingToAt:number;
};
export type ForwardHourOutcome={fromAt:number;toAt:number;from:HourRegime;to:HourRegime};
export type HourHoldoutLedger={version:1;frozen?:FrozenHourHypothesis;outcomes:ForwardHourOutcome[];watermark:number};
export type HourHoldoutReport={
 frozen:boolean;frozenAt:number|null;from:HourRegime|null;expected:HourRegime|null;
 trainingCount:number;trainingMatches:number;trainingDays:number;trainingPct:number|null;
 futureEdges:number;futureMatched:number;futurePct:number|null;conditionEdges:number;
 baselineMatched:number;baselinePct:number|null;conditionDays:number;
 differenceToTraining:number|null;differenceToBaseline:number|null;
 latestToAt:number|null;status:'collecting-training'|'collecting-future'|'observational-comparison';
 bestTrainingCount:number;bestTrainingDays:number;
};
const isNum=(x:unknown):x is number=>typeof x==='number'&&Number.isFinite(x);
const isReg=(x:unknown):x is HourRegime=>reg.includes(x as HourRegime);
const day=(t:number)=>new Date(t).toISOString().slice(0,10);
const pct=(a:number,b:number)=>b?Math.round(1_000*a/b)/10:null;
const validEdge=(e:unknown,now:number):e is HourTransition=>{
 if(!e||typeof e!=='object')return false;
 const x=e as Partial<HourTransition>;
 return isNum(x.fromAt)&&isNum(x.toAt)&&x.fromAt>0&&x.toAt===x.fromAt+HOUR&&
  x.toAt<=now&&isReg(x.from)&&isReg(x.to);
};
function validFreeze(x:unknown,now:number):x is FrozenHourHypothesis{
 if(!x||typeof x!=='object')return false;
 const f=x as Partial<FrozenHourHypothesis>;
 return f.protocol===PROTOCOL&&isNum(f.registeredAt)&&isNum(f.frozenAt)&&
  f.registeredAt>0&&f.registeredAt<=f.frozenAt&&f.frozenAt<=now&&
  isReg(f.from)&&isReg(f.expected)&&Number.isInteger(f.trainingCount)&&
  Number.isInteger(f.trainingMatches)&&Number.isInteger(f.trainingDays)&&
  f.trainingCount!>=20&&f.trainingMatches!>=0&&f.trainingMatches!<=f.trainingCount!&&
  f.trainingDays!>=3&&isNum(f.lastTrainingToAt)&&f.lastTrainingToAt!<=f.frozenAt;
}
export function openHourHoldout(raw:string|null,now=Date.now()):HourHoldoutLedger{
 const empty:HourHoldoutLedger={version:1,outcomes:[],watermark:0};
 try{
  const x=JSON.parse(raw||'null') as HourHoldoutLedger;
  if(!x||x.version!==1||!validFreeze(x.frozen,now)||!Array.isArray(x.outcomes))return empty;
  const seen=new Set<number>(),outcomes:ForwardHourOutcome[]=[];
  for(const e of x.outcomes.slice(-MAX*2)){
   if(!validEdge(e,now)||e.fromAt<=x.frozen.frozenAt||seen.has(e.toAt))continue;
   seen.add(e.toAt);outcomes.push({fromAt:e.fromAt,toAt:e.toAt,from:e.from,to:e.to});
  }
  outcomes.sort((a,b)=>a.toAt-b.toAt);
  const last=outcomes.at(-1)?.toAt||x.frozen.frozenAt;
  const watermark=isNum(x.watermark)&&x.watermark>=last&&x.watermark<=now?x.watermark:last;
  return {version:1,frozen:x.frozen,outcomes:outcomes.slice(-MAX),watermark};
 }catch{return empty;}
}
function selectTraining(edges:HourTransition[],registeredAt:number,now:number):
 {candidate:FrozenHourHypothesis|null;bestCount:number;bestDays:number}{
 const valid=edges.filter(e=>validEdge(e,now)&&e.fromAt>=registeredAt);
 let bestCount=0,bestDays=0;
 const candidates:FrozenHourHypothesis[]=[];
 for(const from of reg){
  const group=valid.filter(e=>e.from===from);
  const days=new Set(group.map(e=>day(e.fromAt))).size;
  if(group.length>bestCount){bestCount=group.length;bestDays=days;}
  if(group.length<20||days<3)continue;
  for(const expected of reg){
   const hits=group.filter(e=>e.to===expected).length;
   candidates.push({protocol:PROTOCOL,registeredAt,frozenAt:now,from,expected,
    trainingCount:group.length,trainingMatches:hits,trainingDays:days,
    lastTrainingToAt:Math.max(...group.map(e=>e.toAt))});
  }
 }
 candidates.sort((a,b)=>{
  const rateDiff=b.trainingMatches/b.trainingCount-a.trainingMatches/a.trainingCount;
  if(rateDiff)return rateDiff;
  if(b.trainingCount!==a.trainingCount)return b.trainingCount-a.trainingCount;
  const aFrom=reg.indexOf(a.from),bFrom=reg.indexOf(b.from);
  return aFrom-bFrom||reg.indexOf(a.expected)-reg.indexOf(b.expected);
 });
 return {candidate:candidates[0]||null,bestCount,bestDays};
}
/** On reaching the predeclared training threshold, freeze exactly once.
 * Every subsequent observation must originate strictly AFTER frozenAt.
 * The high-water mark rejects late replay and prevents double scoring after archive rotation.
 */
export function advanceHourHoldout(old:HourHoldoutLedger,edges:HourTransition[],registeredAt:number,now=Date.now()):HourHoldoutLedger{
 if(!old||old.version!==1||!Array.isArray(old.outcomes)||!Array.isArray(edges)||
  !isNum(now)||!isNum(registeredAt)||registeredAt<=0||registeredAt>now)return old;
 if(!old.frozen){
  const next=selectTraining(edges,registeredAt,now).candidate;
  return next?{version:1,frozen:next,outcomes:[],watermark:now}:old;
 }
 if(!validFreeze(old.frozen,now)||old.frozen.registeredAt!==registeredAt)return old;
 const incoming=edges.filter(e=>validEdge(e,now)&&e.fromAt>old.frozen!.frozenAt&&e.toAt>old.watermark)
  .sort((a,b)=>a.toAt-b.toAt);
 if(!incoming.length)return old;
 const out=old.outcomes.slice(),seen=new Set(out.map(e=>e.toAt));
 let maxWatermark=old.watermark;
 for(const edge of incoming){
  if(edge.toAt<=maxWatermark||seen.has(edge.toAt))continue;
  out.push({fromAt:edge.fromAt,toAt:edge.toAt,from:edge.from,to:edge.to});
  maxWatermark=edge.toAt;seen.add(edge.toAt);
 }
 if(maxWatermark===old.watermark)return old;
 return {...old,outcomes:out.sort((a,b)=>a.toAt-b.toAt).slice(-MAX),watermark:maxWatermark};
}
export function hourHoldoutReport(ledger:HourHoldoutLedger,edges:HourTransition[],registeredAt:number,now=Date.now()):HourHoldoutReport{
 const valid=Array.isArray(edges)?edges:[];
 const candidates=selectTraining(valid,registeredAt,now);
 const f=ledger?.frozen&&validFreeze(ledger.frozen,now)?ledger.frozen:null;
 const outcomes=f?ledger.outcomes.filter(e=>validEdge(e,now)&&e.fromAt>f.frozenAt):[];
 const selected=f?outcomes.filter(e=>e.from===f.from):[];
 const hits=f?selected.filter(e=>e.to===f.expected).length:0;
 const baseHits=f?outcomes.filter(e=>e.to===f.expected).length:0;
 const trainingPct=f?pct(f.trainingMatches,f.trainingCount):null;
 const futurePct=pct(hits,selected.length);
 const baselinePct=pct(baseHits,outcomes.length);
 const days=new Set(selected.map(e=>day(e.fromAt))).size;
 return {frozen:!!f,frozenAt:f?.frozenAt??null,from:f?.from??null,expected:f?.expected??null,
  trainingCount:f?.trainingCount??0,trainingMatches:f?.trainingMatches??0,
  trainingDays:f?.trainingDays??0,trainingPct,
  futureEdges:selected.length,futureMatched:hits,futurePct,conditionEdges:outcomes.length,
  baselineMatched:baseHits,baselinePct,conditionDays:days,
  differenceToTraining:futurePct===null||trainingPct===null?null:Math.round(10*(futurePct-trainingPct))/10,
  differenceToBaseline:futurePct===null||baselinePct===null?null:Math.round(10*(futurePct-baselinePct))/10,
  latestToAt:outcomes.at(-1)?.toAt??null,
  status:!f?'collecting-training':selected.length>=20&&days>=3?'observational-comparison':'collecting-future',
  bestTrainingCount:candidates.bestCount,bestTrainingDays:candidates.bestDays};
}
