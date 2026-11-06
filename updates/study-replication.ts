/** APEX 5.4: transparent H1 out-of-sample replication on disjoint UTC-day cohorts.
 * Registered once on installation; each cohort fixes its observations and never re-trains.
 * This is descriptive research, not independent statistical proof or a trade signal.
 */
import type {HourRegime} from './hour-transitions';
import type {HourHoldoutLedger,FrozenHourHypothesis,ForwardHourOutcome} from './hour-holdout';

const HOUR=3_600_000,DAY=24*HOUR,MAX_COHORTS=24,MAX_WORKING=180,MIN=20,MIN_DAYS=3,STALE=72*HOUR;
const STATES:HourRegime[]=['up','down','mixed'];
export type ReplicationSubject={protocol:'core-h1-holdout-v1';frozenAt:number;from:HourRegime;expected:HourRegime};
export type ReplicationSample={fromAt:number;toAt:number;to:HourRegime};
export type ReplicationCohort={index:number;firstAt:number;lastAt:number;count:number;hits:number;days:number};
export type ReplicationStudy={version:1;registeredAt:number;watermark:number;
 subject?:ReplicationSubject;working:ReplicationSample[];cohorts:ReplicationCohort[]};
export type ReplicationPhase='waiting-for-freeze'|'collecting-reference'|'collecting-repetition'|
 'similar-observed'|'difference-observed'|'observations-stale'|'capacity-reached'|'hypothesis-mismatch';
export type ReplicationOverview={phase:ReplicationPhase;registeredAt:number;subject:ReplicationSubject|null;
 completed:number;workingCount:number;workingDays:number;workingHits:number;
 first:ReplicationCohort|null;latest:ReplicationCohort|null;referencePct:number|null;latestPct:number|null;
 differencePts:number|null;lastSeenAt:number|null;note:string};
const finite=(x:unknown):x is number=>typeof x==='number'&&Number.isFinite(x);
const regime=(x:unknown):x is HourRegime=>STATES.includes(x as HourRegime);
const distinctDays=(xs:{fromAt:number}[])=>new Set(xs.map(x=>new Date(x.fromAt).toISOString().slice(0,10))).size;
const dayStart=(t:number)=>Math.floor(t/DAY)*DAY;
const afterDay=(t:number)=>dayStart(t)+DAY;
const pct=(hits:number,n:number)=>n?Math.round(1000*hits/n)/10:null;
const subjectOf=(f:FrozenHourHypothesis|undefined,now:number):ReplicationSubject|null=>
 f&&f.protocol==='core-h1-holdout-v1'&&finite(f.frozenAt)&&f.frozenAt>0&&f.frozenAt<=now&&
 regime(f.from)&&regime(f.expected)?{protocol:'core-h1-holdout-v1',frozenAt:f.frozenAt,from:f.from,expected:f.expected}:null;
const same=(a:ReplicationSubject,b:ReplicationSubject)=>
 a.protocol===b.protocol&&a.frozenAt===b.frozenAt&&a.from===b.from&&a.expected===b.expected;
const validSample=(x:unknown,after:number,now:number):x is ReplicationSample=>{
 if(!x||typeof x!=='object')return false;
 const e=x as Partial<ReplicationSample>;
 return finite(e.fromAt)&&finite(e.toAt)&&e.fromAt>after&&
  e.toAt===e.fromAt+HOUR&&e.toAt<=now&&regime(e.to);
};
const validCohort=(x:unknown,after:number,now:number,index:number):x is ReplicationCohort=>{
 if(!x||typeof x!=='object')return false;
 const c=x as Partial<ReplicationCohort>;
 return c.index===index&&finite(c.firstAt)&&finite(c.lastAt)&&c.firstAt>after&&
  c.lastAt>c.firstAt&&c.lastAt<=now&&Number.isInteger(c.count)&&c.count!>=MIN&&
  Number.isInteger(c.hits)&&c.hits!>=0&&c.hits!<=c.count!&&
  Number.isInteger(c.days)&&c.days!>=MIN_DAYS&&c.days!<=c.count!;
};
export function validReplicationStudy(x:unknown,now=Date.now()):x is ReplicationStudy{
 if(!x||typeof x!=='object'||!finite(now)||now<=0)return false;
 const s=x as Partial<ReplicationStudy>;
 if(s.version!==1||!finite(s.registeredAt)||s.registeredAt<=0||s.registeredAt>now||
  !finite(s.watermark)||s.watermark<s.registeredAt||s.watermark>now||
  !Array.isArray(s.working)||!Array.isArray(s.cohorts)||s.cohorts.length>MAX_COHORTS||
  s.working.length>MAX_WORKING)return false;
 if(!s.subject)return !s.working.length&&!s.cohorts.length;
 const f=s.subject;
 if(f.protocol!=='core-h1-holdout-v1'||!finite(f.frozenAt)||f.frozenAt<=0||
  f.frozenAt>now||!regime(f.from)||!regime(f.expected))return false;
 let after=Math.max(s.registeredAt,f.frozenAt);
 for(let i=0;i<s.cohorts.length;i++){
  const c=s.cohorts[i];
  if(!validCohort(c,i===0?after:after-1,now,i+1))return false;
  after=afterDay(c.lastAt);
 }
 if(s.cohorts.length===MAX_COHORTS&&s.working.length>0)return false;
 let previous=after;
 for(const t of s.working){
  if(!validSample(t,s.cohorts.length?after-1:after,now)||t.toAt<=previous)return false;
  previous=t.toAt;
 }
 if(s.cohorts.length>0&&s.watermark<s.cohorts.at(-1)!.lastAt)return false;
 const lastObserved=s.working.at(-1)?.toAt??s.cohorts.at(-1)?.lastAt??Math.max(s.registeredAt,f.frozenAt);
 return s.watermark>=Math.max(f.frozenAt,lastObserved);
}
export function openReplicationStudy(raw:string|null,now=Date.now()):ReplicationStudy{
 const fresh:ReplicationStudy={version:1,registeredAt:now,watermark:now,working:[],cohorts:[]};
 if(!finite(now)||now<=0)return {version:1,registeredAt:0,watermark:0,working:[],cohorts:[]};
 try{const x=JSON.parse(raw||'null');return validReplicationStudy(x,now)?x:fresh;}catch{return fresh;}
}
function validOutcome(x:ForwardHourOutcome,after:number,now:number):boolean{
 return !!x&&finite(x.fromAt)&&finite(x.toAt)&&x.fromAt>after&&
  x.toAt===x.fromAt+HOUR&&x.toAt<=now&&regime(x.from)&&regime(x.to);
}
export function advanceReplicationStudy(old:ReplicationStudy,holdout:HourHoldoutLedger,now=Date.now()):ReplicationStudy{
 if(!validReplicationStudy(old,now)||!Array.isArray(holdout?.outcomes))return old;
 const subject=subjectOf(holdout.frozen,now);
 if(!subject||old.subject&&!same(old.subject,subject))return old;
 const attached=!!old.subject, after=Math.max(old.registeredAt,subject.frozenAt);
 let watermark=attached?old.watermark:Math.max(old.watermark,subject.frozenAt);
 const working=old.working.slice(),cohorts=old.cohorts.slice();
 let changed=!attached;
 const incoming=holdout.outcomes.filter(x=>validOutcome(x,after,now)&&x.toAt>watermark)
  .sort((a,b)=>a.toAt-b.toAt);
 for(const e of incoming){
  if(e.toAt<=watermark)continue;
  watermark=e.toAt;changed=true;
  if(cohorts.length>=MAX_COHORTS||e.from!==subject.from)continue;
  // Never reuse another part of the same UTC day in a later cohort.
  const minStart=cohorts.length?afterDay(cohorts.at(-1)!.lastAt):after;
  if(e.fromAt<=after||e.fromAt<minStart)continue;
  if(working.at(-1)?.toAt===e.toAt)continue;
  working.push({fromAt:e.fromAt,toAt:e.toAt,to:e.to});
  if(working.length>=MIN&&distinctDays(working)>=MIN_DAYS){
   cohorts.push({index:cohorts.length+1,firstAt:working[0].fromAt,
    lastAt:e.toAt,count:working.length,hits:working.filter(x=>x.to===subject.expected).length,
    days:distinctDays(working)});
   working.length=0;
  }
 }
 if(!changed)return old;
 return {version:1,registeredAt:old.registeredAt,watermark,subject,working,cohorts};
}
export function replicationOverview(study:ReplicationStudy,now=Date.now(),currentFrozen?:FrozenHourHypothesis):ReplicationOverview{
 const note='Каждый период: ≥20 фактических H1-переходов одного исходного состояния за ≥3 UTC дня. Периоды не используют общие UTC-дни и формируются только после регистрации 5.4. Первая группа навсегда остаётся контрольной. Разница более 20 процентных пунктов — повод исследовать расхождение, а не статистическое доказательство. Соседние часы зависимы.';
 const f=study?.subject||null,cohorts=study?.cohorts||[],first=cohorts[0]||null;
 const latest=cohorts.length>1?cohorts.at(-1)!:null;
 const ref=first?pct(first.hits,first.count):null,recent=latest?pct(latest.hits,latest.count):null;
 const diff=ref!==null&&recent!==null?Math.round(10*(recent-ref))/10:null;
 const last=study?.watermark>study?.registeredAt?study.watermark:null;
 let phase:ReplicationPhase=!f?'waiting-for-freeze':!first?'collecting-reference':
  !latest?'collecting-repetition':diff!==null&&Math.abs(diff)>20?'difference-observed':'similar-observed';
 if(cohorts.length>=MAX_COHORTS)phase='capacity-reached';
 else if(f&&currentFrozen){
  const current=subjectOf(currentFrozen,now);
  if(!current||!same(f,current))phase='hypothesis-mismatch';
 }
 if(f&&phase!=='hypothesis-mismatch'&&phase!=='capacity-reached'&&last!==null&&now-last>STALE)
  phase='observations-stale';
 return {phase,registeredAt:study.registeredAt,subject:f,completed:cohorts.length,
  workingCount:study.working.length,workingDays:distinctDays(study.working),
  workingHits:f?study.working.filter(x=>x.to===f.expected).length:0,
  first,latest,referencePct:ref,latestPct:recent,differencePts:diff,lastSeenAt:last,note};
}
