/** APEX 4.7: pre-registered, immutable early-vs-recent CORE H1 drift study.
 * Observation-only; no live action, forecast, adaptation or notification.
 * Older outcomes and missing hours are never backfilled.
 */
import type {HourRegime} from './hour-transitions';
import type {HourHoldoutLedger,FrozenHourHypothesis} from './hour-holdout';

const HOUR=3_600_000,DAY=24*HOUR,RECENT=7*DAY,STALE=72*HOUR;
const MIN=20,MIN_DAYS=3,MAX_SAMPLES=600,Z=1.645;
const regimes:HourRegime[]=['up','down','mixed'];
export type DriftEvidence={fromAt:number;toAt:number;to:HourRegime};
export type DriftSubject={frozenAt:number;from:HourRegime;expected:HourRegime};
export type DriftAnchor={firstAt:number;lastAt:number;count:number;matches:number;days:number};
export type DriftLedger={
 version:1;registeredAt:number;watermark:number;subject?:DriftSubject;
 collecting:DriftEvidence[];anchor?:DriftAnchor;recent:DriftEvidence[];
};
export type DriftPhase='awaiting-hypothesis'|'collecting-baseline'|'collecting-recent'|
 'observations-stale'|'no-clear-decline'|'possible-decline';
export type DriftReport={
 phase:DriftPhase;registeredAt:number;subject:DriftSubject|null;
 baselineCount:number;baselineDays:number;baselineHits:number;baselinePct:number|null;
 recentCount:number;recentDays:number;recentHits:number;recentPct:number|null;
 differencePct:number|null;lastObservedAt:number|null;
 baselineBounds:[number,number]|null;recentBounds:[number,number]|null;
 rule:string;
};
const isNum=(n:unknown):n is number=>typeof n==='number'&&Number.isFinite(n);
const isReg=(x:unknown):x is HourRegime=>regimes.includes(x as HourRegime);
const dates=(list:DriftEvidence[])=>new Set(list.map(x=>new Date(x.fromAt).toISOString().slice(0,10))).size;
const pct=(a:number,b:number)=>b>0?Math.round(1000*a/b)/10:null;
const subjectFrom=(f:FrozenHourHypothesis|undefined):DriftSubject|null=>
 f&&f.protocol==='core-h1-holdout-v1'&&isNum(f.frozenAt)&&f.frozenAt>0&&
 isReg(f.from)&&isReg(f.expected)?{frozenAt:f.frozenAt,from:f.from,expected:f.expected}:null;
const subjectMatches=(a:DriftSubject,b:DriftSubject)=>
 a.frozenAt===b.frozenAt&&a.from===b.from&&a.expected===b.expected;
const validEdge=(e:unknown,start:number,now:number):e is DriftEvidence=>{
 if(!e||typeof e!=='object')return false;
 const x=e as Partial<DriftEvidence>;
 return isNum(x.fromAt)&&isNum(x.toAt)&&x.fromAt>start&&
  x.toAt===x.fromAt+HOUR&&x.toAt<=now&&isReg(x.to);
};
const cleanEvidence=(raw:unknown,start:number,now:number,max=MAX_SAMPLES):DriftEvidence[]=>{
 if(!Array.isArray(raw))return [];
 const sorted=raw.filter(e=>validEdge(e,start,now)).sort((a:DriftEvidence,b:DriftEvidence)=>a.toAt-b.toAt);
 const seen=new Set<number>(),out:DriftEvidence[]=[];
 for(const e of sorted){
  if(seen.has(e.toAt))continue;
  seen.add(e.toAt);out.push({fromAt:e.fromAt,toAt:e.toAt,to:e.to});
 }
 return out.slice(-max);
};
const validAnchor=(a:unknown,registeredAt:number,subject:DriftSubject,watermark:number):a is DriftAnchor=>{
 if(!a||typeof a!=='object')return false;
 const x=a as Partial<DriftAnchor>;
 return isNum(x.firstAt)&&isNum(x.lastAt)&&x.firstAt>Math.max(registeredAt,subject.frozenAt)&&
  x.lastAt>=x.firstAt&&x.lastAt<=watermark&&Number.isInteger(x.count)&&
  x.count!>=MIN&&Number.isInteger(x.matches)&&x.matches!>=0&&x.matches!<=x.count!&&
  Number.isInteger(x.days)&&x.days!>=MIN_DAYS&&x.days!<=x.count!;
};
export function openDriftLedger(raw:string|null,now=Date.now()):DriftLedger{
 const fresh:DriftLedger={version:1,registeredAt:now,watermark:now,collecting:[],recent:[]};
 if(!isNum(now)||now<=0)return {version:1,registeredAt:0,watermark:0,collecting:[],recent:[]};
 try{
  const x=JSON.parse(raw||'null') as DriftLedger;
  if(x?.version!==1||!isNum(x.registeredAt)||x.registeredAt<=0||
   x.registeredAt>now||!isNum(x.watermark)||x.watermark<x.registeredAt||x.watermark>now)return fresh;
  if(!x.subject)return {...fresh,registeredAt:x.registeredAt,watermark:x.watermark};
  const s=x.subject;
  if(!isNum(s.frozenAt)||s.frozenAt<=0||s.frozenAt>now||!isReg(s.from)||!isReg(s.expected))return fresh;
  const bound=Math.max(x.registeredAt,s.frozenAt);
  const anchor=x.anchor&&validAnchor(x.anchor,x.registeredAt,s,x.watermark)?x.anchor:undefined;
  const collecting=anchor?[]:cleanEvidence(x.collecting,bound,x.watermark);
  const recent=anchor?cleanEvidence(x.recent,anchor.lastAt,x.watermark):[];
  if(x.anchor&&!anchor)return fresh;
  return {version:1,registeredAt:x.registeredAt,watermark:x.watermark,subject:s,
   collecting,anchor,recent};
 }catch{return fresh;}
}
export function advanceDriftLedger(old:DriftLedger,holdout:HourHoldoutLedger,now=Date.now()):DriftLedger{
 if(!old||old.version!==1||!isNum(old.registeredAt)||old.registeredAt<=0||
  !isNum(now)||now<old.registeredAt)return old;
 const incomingSubject=subjectFrom(holdout?.frozen);
 if(!incomingSubject||!Array.isArray(holdout.outcomes))return old;
 if(old.subject&&!subjectMatches(old.subject,incomingSubject))return old; // no silent hypothesis replacement
 const subject=old.subject||incomingSubject;
 const bound=Math.max(old.registeredAt,subject.frozenAt);
 let watermark=old.subject?old.watermark:Math.max(old.watermark,bound);
 let collecting=old.collecting.slice(),anchor=old.anchor,recent=old.recent.slice();
 let changed=!old.subject||watermark!==old.watermark;
 const next=holdout.outcomes
  .filter(x=>x.from===subject.from&&validEdge(x,bound,now)&&x.toAt>watermark)
  .sort((a,b)=>a.toAt-b.toAt);
 for(const e of next){
  if(e.toAt<=watermark)continue;
  const row={fromAt:e.fromAt,toAt:e.toAt,to:e.to};
  watermark=e.toAt;changed=true;
  if(!anchor){
   collecting.push(row);
   if(collecting.length>=MIN&&dates(collecting)>=MIN_DAYS){
    anchor={firstAt:collecting[0].fromAt,lastAt:row.toAt,count:collecting.length,
     matches:collecting.filter(x=>x.to===subject.expected).length,days:dates(collecting)};
    collecting=[];
   }
  }else recent.push(row);
 }
 if(!changed)return old;
 return {version:1,registeredAt:old.registeredAt,watermark,subject,anchor,
  collecting:collecting.slice(0,MAX_SAMPLES),recent:recent.slice(-MAX_SAMPLES)};
}
/** Wilson interval with z=1.645 is used ONLY as a heuristic.
 * Adjacent H1 samples are correlated; do not interpret as calibrated confidence.
 */
export function wilson90(hits:number,total:number):[number,number]|null{
 if(!Number.isInteger(hits)||!Number.isInteger(total)||total<=0||hits<0||hits>total)return null;
 const p=hits/total,d=1+Z*Z/total;
 const middle=(p+Z*Z/(2*total))/d;
 const half=(Z/d)*Math.sqrt(p*(1-p)/total+Z*Z/(4*total*total));
 return [Math.max(0,middle-half),Math.min(1,middle+half)];
}
export function driftReport(ledger:DriftLedger,now=Date.now()):DriftReport{
 const rule='Предзаданные правила: первые ≥20 подходящих H1-переходов за ≥3 дня после установки 4.7 фиксируют основу. Следующие наблюдения за последние 7 дней (≥20 и ≥3 дня) сравниваются с ней. Возможное ослабление: снижение ≥25 процентных пунктов и неперекрытие приближённых 90% интервалов Уилсона. Соседние часы зависимы — это диагностический сигнал, а не статистическое доказательство.';
 const subject=ledger?.subject||null,anchor=ledger?.anchor;
 const baselineCount=anchor?.count||ledger?.collecting?.length||0,
  baselineHits=anchor?.matches||(anchor?0:ledger?.collecting?.filter(x=>x.to===subject?.expected).length||0),
  baselineDays=anchor?.days||dates(ledger?.collecting||[]),baselinePct=anchor?pct(anchor.matches,anchor.count):null;
 const recent=anchor?(ledger.recent||[]).filter(x=>validEdge(x,anchor.lastAt,now)&&x.toAt>=now-RECENT):[];
 const recentCount=recent.length,recentHits=recent.filter(x=>x.to===subject?.expected).length,
  recentDays=dates(recent),recentPct=pct(recentHits,recentCount);
 const earlyInterval=anchor?wilson90(anchor.matches,anchor.count):null;
 const recentInterval=recentCount?wilson90(recentHits,recentCount):null;
 const drop=baselinePct!==null&&recentPct!==null?Math.round(10*(baselinePct-recentPct))/10:null;
 const newest=(ledger?.recent||[]).at(-1)?.toAt||anchor?.lastAt||ledger?.collecting?.at(-1)?.toAt||null;
 let phase:DriftPhase=!subject?'awaiting-hypothesis':!anchor?'collecting-baseline':'collecting-recent';
 if(anchor&&newest!==null&&now-newest>STALE)phase='observations-stale';
 else if(anchor&&recentCount>=MIN&&recentDays>=MIN_DAYS&&earlyInterval&&recentInterval)
  phase=drop!==null&&drop>=25&&recentInterval[1]<earlyInterval[0]?'possible-decline':'no-clear-decline';
 return {phase,registeredAt:ledger.registeredAt,subject,
  baselineCount,baselineHits,baselineDays,baselinePct,recentCount,recentHits,recentDays,recentPct,
  differencePct:drop,lastObservedAt:newest,
  baselineBounds:earlyInterval,recentBounds:recentInterval,rule};
}
