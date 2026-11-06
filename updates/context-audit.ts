/** APEX 4.8: pre-registered context audit of the frozen CORE H1 hypothesis.
 * H4 context comes from the earliest complete baseline H1 snapshot, BEFORE its next H1 close.
 * Descriptive ONLY: no trading orders, forecast modifications or outcome recalibration.
 */
import {CORE_SYMBOLS} from './research-core';
import {hourState} from './hour-transitions';
import type {HourRegime} from './hour-transitions';
import type {CoreResearchArchive,CoreResearchEntry} from './core-research';
import type {HourHoldoutLedger,ForwardHourOutcome,FrozenHourHypothesis} from './hour-holdout';
const HOUR=3_600_000,MAX=1_200,MIN=12,MIN_DAYS=3;
const PROTOCOL='core-h4-context-v1' as const;
const REGIMES:HourRegime[]=['up','down','mixed'];
export type ContextSubject={frozenAt:number;from:HourRegime;expected:HourRegime};
export type ContextEvent={fromAt:number;toAt:number;to:HourRegime;h4:HourRegime;h4ClosedAt:number};
export type ContextAuditLedger={version:1;registeredAt:number;watermark:number;subject?:ContextSubject;
 observations:ContextEvent[];missingContext:number};
export type ContextAuditRow={h4:HourRegime;count:number;matches:number;days:number;
 matchPct:number|null;status:'limited'|'descriptive'};
export type ContextAuditReport={state:'awaiting-hypothesis'|'collecting'|'need-variety'|'context-dependent'|'no-clear-difference';
 registeredAt:number;frozen:boolean;checked:number;missingContext:number;distinctConditions:number;
 qualified:number;differencePct:number|null;rows:ContextAuditRow[];latestAt:number|null;note:string};
const finite=(x:unknown):x is number=>typeof x==='number'&&Number.isFinite(x);
const isReg=(x:unknown):x is HourRegime=>REGIMES.includes(x as HourRegime);
const day=(n:number)=>new Date(n).toISOString().slice(0,10);
const pct=(hits:number,total:number)=>total?Math.round(1000*hits/total)/10:null;
function subjectFrom(f:FrozenHourHypothesis|undefined):ContextSubject|null{
 if(!f||f.protocol!=='core-h1-holdout-v1'||!finite(f.frozenAt)||f.frozenAt<=0||
  !isReg(f.from)||!isReg(f.expected))return null;
 return {frozenAt:f.frozenAt,from:f.from,expected:f.expected};
}
const sameSubject=(x:ContextSubject,y:ContextSubject)=>x.frozenAt===y.frozenAt&&x.from===y.from&&x.expected===y.expected;
function eligibleOutcome(x:ForwardHourOutcome,start:number,now:number):boolean{
 return !!x&&finite(x.fromAt)&&finite(x.toAt)&&x.fromAt>start&&
  x.toAt===x.fromAt+HOUR&&x.toAt<=now&&isReg(x.from)&&isReg(x.to);
}
function validEvent(x:unknown,start:number,now:number):x is ContextEvent{
 if(!x||typeof x!=='object')return false;
 const e=x as ContextEvent;
 return finite(e.fromAt)&&finite(e.toAt)&&e.fromAt>start&&e.toAt===e.fromAt+HOUR&&
  e.toAt<=now&&isReg(e.to)&&isReg(e.h4)&&finite(e.h4ClosedAt)&&
  e.h4ClosedAt>0&&e.h4ClosedAt<=e.fromAt;
}
export function openContextAudit(raw:string|null,now=Date.now()):ContextAuditLedger{
 const fresh:ContextAuditLedger={version:1,registeredAt:now,watermark:now,observations:[],missingContext:0};
 if(!finite(now)||now<=0)return {version:1,registeredAt:0,watermark:0,observations:[],missingContext:0};
 try{
  const x=JSON.parse(raw||'null') as ContextAuditLedger;
  if(x?.version!==1||!finite(x.registeredAt)||x.registeredAt<=0||x.registeredAt>now||
   !finite(x.watermark)||x.watermark<x.registeredAt||x.watermark>now||!Array.isArray(x.observations)||
   !Number.isInteger(x.missingContext)||x.missingContext<0)return fresh;
  if(!x.subject){
   if(x.observations.length||x.missingContext)return fresh;
   return {version:1,registeredAt:x.registeredAt,watermark:x.watermark,observations:[],missingContext:0};
  }
  const s=x.subject,subject:ContextSubject={frozenAt:s.frozenAt,from:s.from,expected:s.expected};
  if(!finite(s.frozenAt)||s.frozenAt<=0||s.frozenAt>now||!isReg(s.from)||!isReg(s.expected))return fresh;
  const start=Math.max(s.frozenAt,x.registeredAt);
  const observations:ContextEvent[]=[],seen=new Set<number>();
  for(const e of x.observations.slice(-MAX*2)){
   if(!validEvent(e,start,x.watermark)||seen.has(e.toAt))continue;
   seen.add(e.toAt);
   observations.push({fromAt:e.fromAt,toAt:e.toAt,to:e.to,h4:e.h4,h4ClosedAt:e.h4ClosedAt});
  }
  observations.sort((a,b)=>a.toAt-b.toAt);
  return {version:1,registeredAt:x.registeredAt,watermark:x.watermark,
   subject,observations:observations.slice(-MAX),missingContext:x.missingContext};
 }catch{return fresh;}
}
/** Snapshots must match the H1 time used by 4.5, be present before the following
 * hour closes, and contain FIVE aligned H4 closes that were already known.
 */
export function h4AtBaseline(e:CoreResearchEntry,expectedH1:number,nextH1:number,
 registration:number,now=Date.now()):{state:HourRegime;at:number}|null{
 const h1=hourState(e,registration,now);
 if(!h1||h1.closedAt!==expectedH1||e.finishedAt>=nextH1||e.runAt>=nextH1)return null;
 let at:number|null=null,up=0,down=0;
 if(e.assets.length!==CORE_SYMBOLS.length)return null;
 const seen=new Set<string>();
 for(const a of e.assets){
  if(!a.ready||seen.has(a.symbol)||!CORE_SYMBOLS.some(s=>s===a.symbol))return null;
  seen.add(a.symbol);
  const frames=a.frames.filter(f=>f.frame==='4h');
  if(frames.length!==1)return null;
  const f=frames[0];
  if(!finite(f.closedAt)||!finite(f.changePct)||f.closedAt<=0||
   f.closedAt>expectedH1||f.closedAt>e.finishedAt||
   expectedH1-f.closedAt>4*HOUR+5*60_000)return null;
  if(at===null)at=f.closedAt;else if(at!==f.closedAt)return null;
  if(f.changePct>0)up++;else if(f.changePct<0)down++;
 }
 if(at===null)return null;
 return {state:up>=4?'up':down>=4?'down':'mixed',at};
}
export function advanceContextAudit(old:ContextAuditLedger,holdout:HourHoldoutLedger,
 archive:CoreResearchArchive,h1RegisteredAt:number,now=Date.now()):ContextAuditLedger{
 if(!old||old.version!==1||!finite(old.registeredAt)||old.registeredAt<=0||
  !finite(old.watermark)||old.watermark<old.registeredAt||
  !finite(h1RegisteredAt)||!finite(now)||now<old.registeredAt||
  !Array.isArray(holdout?.outcomes)||!Array.isArray(archive?.entries))return old;
 const nextSubject=subjectFrom(holdout.frozen);
 if(!nextSubject||old.subject&&!sameSubject(old.subject,nextSubject))return old;
 const subject=old.subject||nextSubject,start=Math.max(subject.frozenAt,old.registeredAt);
 // Build a canonical earliest snapshot index, using the same H1 validator as v4.5.
 const index=new Map<number,CoreResearchEntry>();
 for(const e of [...archive.entries].sort((a,b)=>a.runAt-b.runAt)){
  const h=hourState(e,h1RegisteredAt,now);
  if(h&&!index.has(h.closedAt))index.set(h.closedAt,e);
 }
 let watermark=old.watermark,missing=old.missingContext;
 const observations=old.observations.slice();
 const seen=new Set(observations.map(x=>x.toAt));
 let changed=!old.subject;
 const incoming=holdout.outcomes.filter(o=>o.from===subject.from&&eligibleOutcome(o,start,now)&&o.toAt>watermark)
  .sort((a,b)=>a.toAt-b.toAt);
 for(const o of incoming){
  if(o.toAt<=watermark||seen.has(o.toAt))continue;
  watermark=o.toAt;changed=true;
  const baseline=index.get(o.fromAt),ctx=baseline?h4AtBaseline(baseline,o.fromAt,o.toAt,h1RegisteredAt,now):null;
  if(!ctx){missing++;continue;}
  observations.push({fromAt:o.fromAt,toAt:o.toAt,to:o.to,h4:ctx.state,h4ClosedAt:ctx.at});
  seen.add(o.toAt);
 }
 if(!changed)return old;
 return {version:1,registeredAt:old.registeredAt,watermark,subject,missingContext:missing,
  observations:observations.sort((a,b)=>a.toAt-b.toAt).slice(-MAX)};
}
export function contextAuditReport(ledger:ContextAuditLedger):ContextAuditReport{
 const note='Только H1-переходы после установки 4.8 и фиксации гипотезы. H4 определяется из самого раннего полного снимка до следующего закрытия H1. Для описательного сравнения нужны ≥12 наблюдений за ≥3 UTC дня как минимум в двух условиях H4; разница ≥25 п.п. отмечается как возможная зависимость от контекста. Часы зависимы, поэтому это не доказательство причинности или прогностической силы.';
 const subject=ledger?.subject,events=ledger?.observations||[];
 const rows:ContextAuditRow[]=REGIMES.map(h4=>{
  const group=events.filter(e=>e.h4===h4),count=group.length;
  const matches=group.filter(e=>e.to===subject?.expected).length;
  const days=new Set(group.map(e=>day(e.fromAt))).size;
  return {h4,count,matches,days,matchPct:pct(matches,count),
   status:count>=MIN&&days>=MIN_DAYS?'descriptive':'limited'};
 });
 const sufficient=rows.filter(r=>r.status==='descriptive'),values=sufficient.map(r=>r.matchPct).filter((x):x is number=>x!==null);
 const differencePct=values.length>=2?Math.round(10*(Math.max(...values)-Math.min(...values)))/10:null;
 const state:ContextAuditReport['state']=!subject?'awaiting-hypothesis':
  !events.length?'collecting':sufficient.length<2?'need-variety':
   differencePct!==null&&differencePct>=25?'context-dependent':'no-clear-difference';
 return {state,registeredAt:ledger.registeredAt,frozen:!!subject,checked:events.length,
  missingContext:ledger.missingContext,distinctConditions:rows.filter(r=>r.count>0).length,
  qualified:sufficient.length,differencePct,rows,latestAt:events.at(-1)?.toAt??null,note};
}
