/** APEX 3.9: frozen prospective Market Pulse validation of PAPER scenarios only.
 * No signals, orders, lifecycle decisions or risk parameters are changed.
 */
import {temporalReport,utcWeekStart} from './time-study';
import {classifyContext} from './context-study';
import type {LearningLedger,LearningRecord,PulseHoldout} from './learning';
const WEEK=604_800_000;
export type HoldoutWeek={start:number;end:number;mature:boolean;eligible:boolean;total:number;
 withTotal:number;againstTotal:number;withTP3:number;withSL:number;againstTP3:number;againstSL:number;
 pending:number;other:number;deltaPct:number|null};
export type HoldoutVerdict='not-frozen'|'collecting'|'repeated'|'not-repeated';
export type HoldoutReport={frozenAt:number|null;expected:PulseHoldout['expected']|null;nextFullWeek:number|null;
 futureTotal:number;eligibleWeeks:number;testedWeeks:number;verdict:HoldoutVerdict;weeks:HoldoutWeek[];note:string};
export function freezePulseHoldout(ledger:LearningLedger,now=Date.now()):LearningLedger{
 if(ledger.pulseHoldout||!Number.isFinite(now))return ledger;
 const study=temporalReport(ledger,now);
 if(study.pattern!=='repeated-with'&&study.pattern!=='repeated-against')return ledger;
 const training=study.weeks.filter(w=>w.comparable).sort((a,b)=>a.start-b.start);
 if(training.length<3)return ledger;
 const expected:PulseHoldout['expected']=study.pattern==='repeated-with'?'with-pulse':'against-pulse';
 const snapshot:PulseHoldout={version:1,frozenAt:now,trainingCutoff:Math.max(...training.map(w=>w.end)),
  expected,trainingWeeks:training.map(w=>w.start)};
 return {...ledger,pulseHoldout:snapshot};
}
export function pulseHoldoutReport(ledger:LearningLedger,now=Date.now()):HoldoutReport{
 const note='Только виртуальные прогнозы после фиксации. Первая неполная неделя исключена, затем дополнительная выдержка 7 дней. Нужно >=20 TP3/SL и >=75% завершений в каждой группе. Вывод основан на первых 3 подходящих неделях, без подбора порогов. Сигналы могут быть коррелированы.';
 const empty:HoldoutReport={frozenAt:null,expected:null,nextFullWeek:null,futureTotal:0,eligibleWeeks:0,testedWeeks:0,verdict:'not-frozen',weeks:[],note};
 const study=ledger.pulseHoldout;
 if(!study||!Number.isFinite(now)||now<study.frozenAt)return empty;
 const start=utcWeekStart(study.frozenAt)+WEEK;
 const rows=ledger.records.filter(r=>r&&Number.isFinite(r.createdAt)&&r.createdAt>study.frozenAt&&r.createdAt>=start&&r.createdAt<=now&&r.createdAt>=ledger.startedAt);
 const current=utcWeekStart(now);
 const count=Math.min(52,Math.max(0,Math.floor((current-start)/WEEK)+1));
 const weeks:HoldoutWeek[]=[];
 for(let i=0;i<count;i++){
  const week=start+i*WEEK,end=week+WEEK;
  const cohort=rows.filter(r=>r.createdAt>=week&&r.createdAt<end);
  const yes=cohort.filter(r=>classifyContext(r)==='with-pulse');
  const no=cohort.filter(r=>classifyContext(r)==='against-pulse');
  const n=(list:LearningRecord[],status:string)=>list.filter(r=>r.status===status).length;
  const wtp=n(yes,'TARGET'),wsl=n(yes,'STOP'),atp=n(no,'TARGET'),asl=n(no,'STOP');
  const wc=wtp+wsl,ac=atp+asl,mature=end+WEEK<=now;
  const eligible=mature&&wc>=20&&ac>=20&&wc/yes.length>=0.75&&ac/no.length>=0.75;
  weeks.push({start:week,end,mature,eligible,total:cohort.length,withTotal:yes.length,againstTotal:no.length,
   withTP3:wtp,withSL:wsl,againstTP3:atp,againstSL:asl,pending:n(cohort,'PENDING')+n(cohort,'ACTIVE'),
   other:cohort.length-yes.length-no.length,deltaPct:eligible?100*(wtp/wc-atp/ac):null});
 }
 const qualified=weeks.filter(w=>w.eligible).slice(0,3);
 let verdict:HoldoutVerdict='collecting';
 if(qualified.length===3){
  const repeated=qualified.every(w=>study.expected==='with-pulse'?(w.deltaPct??0)>=10:(w.deltaPct??0)<=-10);
  verdict=repeated?'repeated':'not-repeated';
 }
 return {frozenAt:study.frozenAt,expected:study.expected,nextFullWeek:start,futureTotal:rows.length,
  eligibleWeeks:weeks.filter(w=>w.eligible).length,testedWeeks:qualified.length,verdict,
  weeks:weeks.filter(w=>w.total>0).slice(-8).reverse(),note};
}
