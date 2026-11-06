/** APEX 5.1: prospective research task queue for the explainable Director.
 * Records when a question was assigned and watches only subsequently closed evidence.
 * 'review' means the specified sampling threshold was reached, NOT proven/validated.
 * Does not write predictions, market signals, frozen studies or simulated orders.
 */
import type {ResearchDirectorDecision,DirectorMission,DirectorTaskId} from './research-director';
import type {CoreResearchArchive} from './core-research';
import type {HourTransitionReport} from './hour-transitions';
import type {HourHoldoutLedger} from './hour-holdout';
import type {DriftLedger} from './regime-drift';
import type {ContextAuditLedger} from './context-audit';

const VERSION=1 as const,MAX_TASKS=11,MAX_EVENTS=48,DAY=86_400_000,HOUR=3_600_000;
const ALLOWED:DirectorTaskId[]=['integrity','freshness','raw-quality','h1-coverage','hypothesis','holdout',
 'drift-change','context-change','drift-coverage','context-coverage','replication'];
export type TaskPhase='queued'|'observing'|'review'|'manual';
export type ResearchQueueItem={
 id:DirectorTaskId;signature:string;title:string;question:string;acceptance:string;
 createdAt:number;phase:TaskPhase;count:number;target:number;periods:number;periodTarget:number;
 measureLabel:string;lastEvidenceAt:number|null;readyAt:number|null;
};
export type ResearchQueueEvent={at:number;id:DirectorTaskId;phase:TaskPhase};
export type ResearchQueue={version:1;registeredAt:number;items:ResearchQueueItem[];events:ResearchQueueEvent[]};
export type ResearchQueueEvidence={
 archive:CoreResearchArchive;transitions:HourTransitionReport;holdout:HourHoldoutLedger;
 drift:DriftLedger;context:ContextAuditLedger;
};
export type ResearchQueueSummary={
 active:ResearchQueueItem|null;ready:number;waiting:number;manual:number;total:number;
 recent:ResearchQueueEvent[];
};
type Progress={count:number;target:number;periods:number;periodTarget:number;
 measureLabel:string;ready:boolean;lastEvidenceAt:number|null};
const finite=(n:unknown):n is number=>typeof n==='number'&&Number.isFinite(n);
const safeAt=(n:unknown,start:number,now:number)=>finite(n)&&n>start&&n<=now;
const distinctDays=(xs:{fromAt:number}[])=>new Set(xs.map(x=>new Date(x.fromAt).toISOString().slice(0,10))).size;
const entryKey=(m:DirectorMission)=>m.id+':'+m.stage;
const allowedMission=(m:DirectorMission|undefined):m is DirectorMission=>
 !!m&&ALLOWED.includes(m.id)&&['collect','verify','investigate','observe'].includes(m.stage)&&
 typeof m.title==='string'&&m.title.length<=100&&typeof m.question==='string'&&m.question.length<=500&&
 typeof m.acceptance==='string'&&m.acceptance.length<=600;
const makeProgress=(count:number,target:number,periods:number,periodTarget:number,measureLabel:string,lastEvidenceAt:number|null):Progress=>
 ({count,target,periods,periodTarget,measureLabel,ready:count>=target&&periods>=periodTarget,lastEvidenceAt});
function uniqueSorted<T extends {fromAt:number;toAt:number}>(raw:T[],start:number,now:number):T[]{
 const seen=new Set<number>(),out:T[]=[];
 for(const e of [...raw].sort((a,b)=>a.toAt-b.toAt)){
  if(!e||!safeAt(e.fromAt,start,now)||e.toAt!==e.fromAt+HOUR||!finite(e.toAt)||
   e.toAt>now||seen.has(e.toAt))continue;
  seen.add(e.toAt);out.push(e);
 }
 return out;
}
export function taskProgress(id:DirectorTaskId,start:number,source:ResearchQueueEvidence,now=Date.now()):Progress{
 const none=makeProgress(0,1,0,1,'Недостаточно исходных данных',null);
 if(!safeAt(now,start-1,now)||!source||!finite(start)||start<=0||start>now)return none;
 const archive=source.archive?.entries||[],transitions=source.transitions?.evidence||[],
  hold=source.holdout?.outcomes||[],drift=source.drift?.recent||[],context=source.context?.observations||[];
 const edges=uniqueSorted(transitions,start,now),outcomes=uniqueSorted(hold,start,now),
  driftEvents=uniqueSorted(drift,start,now),ctx=uniqueSorted(context,start,now);
 const last=(arr:{toAt:number}[])=>arr.at(-1)?.toAt??null;
 const selected=outcomes.filter(x=>x.from===source.holdout?.frozen?.from);
 if(id==='integrity')return makeProgress(0,1,0,1,'Требуется ручная сверка исходных журналов',null);
 if(id==='hypothesis'){
  const group=edges.filter(x=>x.from===source.holdout?.frozen?.from);
  const freeze=source.holdout?.frozen;
  const achieved=!!freeze&&safeAt(freeze.frozenAt,start,now)&&group.length>=20&&distinctDays(group)>=3;
  return {...makeProgress(group.length,20,distinctDays(group),3,'переходов / UTC-дней',last(group)),ready:achieved};
 }
 if(id==='freshness'){
  const complete=archive.some(e=>e.complete&&e.source==='core-native-observations-v1'&&
   safeAt(e.finishedAt,start,now));
  return {...makeProgress(edges.length,2,complete?1:0,1,'новых H1 / наличие полного CORE',last(edges)),
   ready:edges.length>=2&&complete};
 }
 if(id==='raw-quality'){
  const samples=archive.filter(e=>e.source==='core-native-observations-v1'&&safeAt(e.finishedAt,start,now))
   .sort((a,b)=>a.runAt-b.runAt);
  let streak:typeof samples=[],seen=new Set<number>();
  for(const s of samples){
   if(!s.complete){streak=[];seen=new Set();continue;}
   if(seen.has(s.runAt))continue;
   seen.add(s.runAt);streak.push(s);
  }
  const hours=new Set(streak.map(e=>Math.floor(e.finishedAt/HOUR))).size;
  return makeProgress(streak.length,10,hours,2,'полных проверок подряд / часов',streak.at(-1)?.finishedAt??null);
 }
 if(id==='h1-coverage'){
  let best=0,count=0,previous:number|null=null,bestEnd:number|null=null;
  for(const e of edges){
   count=previous===e.fromAt?count+1:1;
   previous=e.toAt;
   if(count>best){best=count;bestEnd=e.toAt;}
  }
  return makeProgress(best,6,best>0?1:0,1,'подряд закрытых H1',bestEnd);
 }
 if(id==='holdout'||id==='drift-change'||id==='replication'){
  const days=distinctDays(selected);
  return makeProgress(selected.length,20,days,3,'новых H1 / UTC-дней',last(selected));
 }
 if(id==='drift-coverage'){
  const valid=source.drift?.anchor?driftEvents:[];
  return makeProgress(valid.length,20,distinctDays(valid),3,'новых проверок периода / UTC-дней',last(valid));
 }
 if(id==='context-change'||id==='context-coverage'){
  const groups=['up','down','mixed'].map(h4=>{
   const g=ctx.filter(e=>e.h4===h4);
   return {count:g.length,days:distinctDays(g)};
  });
  const qualified=groups.filter(g=>g.count>=12&&g.days>=3).length;
  return makeProgress(qualified,2,ctx.length,24,'условий H4 (≥12 за ≥3 дня)',last(ctx));
 }
 return none;
}
function validItem(x:unknown,registeredAt:number,now:number):x is ResearchQueueItem{
 if(!x||typeof x!=='object')return false;
 const e=x as Partial<ResearchQueueItem>;
 return ALLOWED.includes(e.id as DirectorTaskId)&&
  typeof e.signature==='string'&&e.signature.startsWith('research-director-rules-v1:'+e.id+':')&&
  typeof e.title==='string'&&e.title.length>0&&e.title.length<=100&&
  typeof e.question==='string'&&e.question.length<=500&&
  typeof e.acceptance==='string'&&e.acceptance.length<=600&&
  finite(e.createdAt)&&e.createdAt>=registeredAt&&e.createdAt<=now&&
  ['queued','observing','review','manual'].includes(String(e.phase))&&
  Number.isInteger(e.count)&&e.count!>=0&&Number.isInteger(e.target)&&e.target!>=1&&
  Number.isInteger(e.periods)&&e.periods!>=0&&Number.isInteger(e.periodTarget)&&e.periodTarget!>=1&&
  typeof e.measureLabel==='string'&&e.measureLabel.length<=120&&
  (e.lastEvidenceAt===null||finite(e.lastEvidenceAt)&&e.lastEvidenceAt<=now)&&
  (e.readyAt===null||finite(e.readyAt)&&e.readyAt>=e.createdAt&&e.readyAt<=now);
}
export function openResearchQueue(raw:string|null,now=Date.now()):ResearchQueue{
 const fresh:ResearchQueue={version:VERSION,registeredAt:now,items:[],events:[]};
 if(!finite(now)||now<=0)return {version:VERSION,registeredAt:0,items:[],events:[]};
 try{
  const q=JSON.parse(raw||'null') as ResearchQueue;
  if(q?.version!==VERSION||!finite(q.registeredAt)||q.registeredAt<=0||q.registeredAt>now||
   !Array.isArray(q.items)||!Array.isArray(q.events))return fresh;
  const seen=new Set<DirectorTaskId>();
  const items:ResearchQueueItem[]=[];
  for(const x of q.items.slice(-MAX_TASKS*2)){
   if(!validItem(x,q.registeredAt,now)||seen.has(x.id))continue;
   seen.add(x.id);items.push(x);
  }
  const events=q.events.filter(x=>x&&finite(x.at)&&x.at>=q.registeredAt&&x.at<=now&&
   ALLOWED.includes(x.id)&&['queued','observing','review','manual'].includes(x.phase))
   .slice(-MAX_EVENTS);
  return {version:VERSION,registeredAt:q.registeredAt,items:items.slice(-MAX_TASKS),events};
 }catch{return fresh;}
}
function emit(events:ResearchQueueEvent[],at:number,id:DirectorTaskId,phase:TaskPhase){
 if(events.at(-1)?.id===id&&events.at(-1)?.phase===phase)return;
 events.push({at,id,phase});
 if(events.length>MAX_EVENTS)events.shift();
}
export function advanceResearchQueue(old:ResearchQueue,decision:ResearchDirectorDecision,
 evidence:ResearchQueueEvidence,now=Date.now()):ResearchQueue{
 if(!old||old.version!==VERSION||!finite(old.registeredAt)||old.registeredAt<=0||
  !finite(now)||now<old.registeredAt||!decision||decision.protocol!=='research-director-rules-v1'||
  !allowedMission(decision.focus)||!Array.isArray(decision.alternatives))return old;
 const offered=[decision.focus,...decision.alternatives.slice(0,2)].filter(allowedMission);
 const selected=new Set(offered.map(x=>x.id));
 const entries=old.items.slice(),events=old.events.slice();
 let changed=false;
 for(const m of offered){
  if(entries.some(e=>e.id===m.id)||entries.length>=MAX_TASKS)continue;
  const p=taskProgress(m.id,now,evidence,now);
  const phase:TaskPhase=m.id==='integrity'?'manual':
    m.id===decision.focus.id?'observing':'queued';
  entries.push({id:m.id,signature:entryKey(m),title:m.title,question:m.question,acceptance:m.acceptance,
   createdAt:now,phase,count:p.count,target:p.target,periods:p.periods,periodTarget:p.periodTarget,
   measureLabel:p.measureLabel,lastEvidenceAt:p.lastEvidenceAt,readyAt:null});
  emit(events,now,m.id,phase);changed=true;
 }
 const updated=entries.map(e=>{
  const p=taskProgress(e.id,e.createdAt,evidence,now);
  const phase:TaskPhase=e.id==='integrity'?'manual':e.phase==='review'?'review':
   p.ready?'review':e.id===decision.focus.id?'observing':'queued';
  const readyAt=phase==='review'?(e.readyAt??now):null;
  if(e.phase===phase&&e.count===p.count&&e.target===p.target&&e.periods===p.periods&&
   e.periodTarget===p.periodTarget&&e.measureLabel===p.measureLabel&&
   e.lastEvidenceAt===p.lastEvidenceAt&&e.readyAt===readyAt)return e;
  changed=true;
  if(e.phase!==phase)emit(events,now,e.id,phase);
  return {...e,phase,count:p.count,target:p.target,periods:p.periods,periodTarget:p.periodTarget,
   measureLabel:p.measureLabel,lastEvidenceAt:p.lastEvidenceAt,readyAt};
 });
 if(!changed)return old;
 return {...old,items:updated,events};
}
export function researchQueueSummary(q:ResearchQueue,focus:DirectorTaskId):ResearchQueueSummary{
 const active=q.items.find(x=>x.id===focus)||null;
 return {active,ready:q.items.filter(x=>x.phase==='review').length,
  waiting:q.items.filter(x=>x.phase==='queued'||x.phase==='observing').length,
  manual:q.items.filter(x=>x.phase==='manual').length,total:q.items.length,
  recent:q.events.slice(-5).reverse()};
}
