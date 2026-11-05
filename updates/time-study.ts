/** APEX 3.8 — prospective temporal cohorts (paper scenarios only).
 * Weekly groups use scenario CREATED time, never future candles or current Market Pulse.
 * Incomplete and immature weeks are visible but excluded from pattern labels.
 */
import {classifyContext} from './context-study';
import type {LearningLedger,LearningRecord} from './learning';

export type TemporalSide={
 total:number;tp3:number;stop:number;pending:number;cancelled:number;expired:number;
 completed:number;tp3Pct:number|null;coverage:number|null;
};
export type TemporalWeek={
 start:number;end:number;complete:boolean;mature:boolean;total:number;missing:number;
 mixed:number;quiet:number;withPulse:TemporalSide;againstPulse:TemporalSide;
 comparable:boolean;deltaPct:number|null;
};
export type TemporalPattern='insufficient'|'repeated-with'|'repeated-against'|'variable';
export type TemporalReport={
 weeks:TemporalWeek[];comparableWeeks:number;pattern:TemporalPattern;
 note:string;
};
const DAY=86_400_000,WEEK=7*DAY;
export function utcWeekStart(time:number):number{
 if(!Number.isFinite(time))return NaN;
 const d=new Date(time);
 const weekday=(d.getUTCDay()+6)%7;
 return Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate()-weekday);
}
function side(rows:LearningRecord[]):TemporalSide{
 const count=(s:string)=>rows.filter(r=>r.status===s).length;
 const tp3=count('TARGET'),stop=count('STOP');
 const pending=count('PENDING')+count('ACTIVE'),cancelled=count('CANCELLED'),expired=count('EXPIRED');
 const completed=tp3+stop,total=rows.length;
 return {total,tp3,stop,pending,cancelled,expired,completed,
  tp3Pct:completed>=20?100*tp3/completed:null,
  coverage:total?completed/total:null};
}
export function temporalReport(ledger:LearningLedger,now=Date.now()):TemporalReport{
 const note='Когорты по неделе появления виртуального прогноза (UTC). Сравнение только после 7 дней выдержки и при >=20 TP3/SL и >=75% завершённых сценариев в каждой группе. Не учитывает корреляцию активов и не подтверждает будущую точность.';
 if(!Number.isFinite(now)||!ledger||!Array.isArray(ledger.records)||!Number.isFinite(ledger.startedAt))
  return {weeks:[],comparableWeeks:0,pattern:'insufficient',note};
 const current=utcWeekStart(now);
 const all=ledger.records.filter(r=>r&&Number.isFinite(r.createdAt)&&
  r.createdAt>=ledger.startedAt&&r.createdAt<=now);
 const weeks:TemporalWeek[]=[];
 for(let i=0;i<8;i++){
  const start=current-i*WEEK,end=start+WEEK;
  const records=all.filter(r=>r.createdAt>=start&&r.createdAt<end);
  if(!records.length)continue;
  const a=side(records.filter(r=>classifyContext(r)==='with-pulse'));
  const b=side(records.filter(r=>classifyContext(r)==='against-pulse'));
  const complete=end<=now,mature=end+WEEK<=now;
  const comparable=mature&&a.completed>=20&&b.completed>=20&&
   (a.coverage??0)>=0.75&&(b.coverage??0)>=0.75;
  const deltaPct=comparable&&a.tp3Pct!==null&&b.tp3Pct!==null?a.tp3Pct-b.tp3Pct:null;
  weeks.push({start,end,complete,mature,total:records.length,
   missing:records.filter(r=>classifyContext(r)==='missing').length,
   mixed:records.filter(r=>classifyContext(r)==='mixed').length,
   quiet:records.filter(r=>classifyContext(r)==='quiet').length,
   withPulse:a,againstPulse:b,comparable,deltaPct});
 }
 const comparable=weeks.filter(w=>w.comparable&&w.deltaPct!==null);
 let pattern:TemporalPattern='insufficient';
 if(comparable.length>=3){
  if(comparable.every(w=>w.deltaPct!==null&&w.deltaPct>=10))pattern='repeated-with';
  else if(comparable.every(w=>w.deltaPct!==null&&w.deltaPct<=-10))pattern='repeated-against';
  else pattern='variable';
 }
 return {weeks,comparableWeeks:comparable.length,pattern,note};
}
