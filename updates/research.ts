/** APEX 3.1 Research: transparent, frozen prospective hypothesis checks.
 * Training data is snapshotted once. Later-created signals form a never-trained holdout.
 * Outcomes are paper TP3 vs SL and must not be called trade profitability.
 */
import type {LearningLedger,LearningRecord} from './learning';
export type RuleId='h4-confirmed'|'h1-confirmed'|'opposing-frame'|'volume-surge'|'h4-scenario'|'long-direction';
export type Rule={id:RuleId;label:string;trainEffect:number;trainWith:number;trainWithout:number;expected:'higher'|'lower'};
export type ResearchStudy={version:1;trainedAt:number;trainingCount:number;trainingCutoff:number;rules:Rule[]};
export type RuleCheck={rule:Rule;withCount:number;withoutCount:number;withTarget:number;withoutTarget:number;effect:number|null;state:'collecting'|'consistent'|'not-repeated'};
export type ResearchReport={ready:boolean;sampleCount:number;needed:number;sampleDays:number;frozenAt:number|null;futureCount:number;checks:RuleCheck[];note:string};
const minTrain=60;
const minValidation=24;
const ruleSpecs:{id:RuleId;label:string;test:(x:LearningRecord)=>boolean}[]=[
 {id:'h4-confirmed',label:'Подтверждение H4',test:x=>x.initialVotes?.['4h']===x.direction},
 {id:'h1-confirmed',label:'Подтверждение H1',test:x=>x.initialVotes?.['1h']===x.direction},
 {id:'opposing-frame',label:'Противоположный старший/младший сигнал',test:x=>['5m','1h','4h'].some(f=>x.initialVotes?.[f]!==undefined&&x.initialVotes[f as '5m'|'1h'|'4h']!=='UNKNOWN'&&x.initialVotes[f as '5m'|'1h'|'4h']!==x.direction)},
 {id:'volume-surge',label:'Повышенный объём M5 при создании (≥1.5×)',test:x=>typeof x.volumeRatio==='number'&&Number.isFinite(x.volumeRatio)&&x.volumeRatio>=1.5},
 {id:'h4-scenario',label:'Сценарий H4',test:x=>x.frame==='4h'},
 {id:'long-direction',label:'Направление LONG',test:x=>x.direction==='LONG'},
];
const tp=(r:LearningRecord)=>r.status==='TARGET'?1:0;
function usable(r:LearningRecord,now:number){
 return !!r&&typeof r.id==='string'&&!!r.contextCaptured&&
 Number.isFinite(r.createdAt)&&r.createdAt<=now&&
 (r.status==='TARGET'||r.status==='STOP')&&
 (r.frame==='5m'||r.frame==='1h'||r.frame==='4h');
}
/** One earliest resolved record per symbol per UTC day, conservatively limiting correlated alerts. */
export function independentOutcomes(rows:LearningRecord[],now:number):LearningRecord[]{
 const unique=new Map<string,LearningRecord>();
 for(const r of [...rows].filter(x=>usable(x,now)).sort((a,b)=>a.createdAt-b.createdAt||a.id.localeCompare(b.id))){
  const day=Math.floor(r.createdAt/86400000);
  const key=r.symbol+':'+day;
  if(!unique.has(key))unique.set(key,r);
 }
 return [...unique.values()];
}
function effect(rows:LearningRecord[],test:(r:LearningRecord)=>boolean){
 const yes=rows.filter(test),no=rows.filter(r=>!test(r));
 const diff=yes.length&&no.length?(yes.reduce((s,x)=>s+tp(x),0)/yes.length-no.reduce((s,x)=>s+tp(x),0)/no.length):null;
 return {yes,no,diff};
}
const format=(n:number)=>Math.round(n*10000)/100;
export function studyFromStorage(raw:string|null):ResearchStudy|null{
 try{
  const s=JSON.parse(raw||'null') as ResearchStudy;
  if(s?.version!==1||!Number.isFinite(s.trainedAt)||s.trainingCount<minTrain||!Array.isArray(s.rules)||s.rules.length>3)return null;
  if(s.rules.some(x=>!ruleSpecs.some(p=>p.id===x.id)||!Number.isFinite(x.trainEffect)))return null;
  return s;
 }catch{return null;}
}
export function freezeResearch(existing:ResearchStudy|null,ledger:LearningLedger,now=Date.now()):ResearchStudy|null{
 if(existing)return existing;
 const rows=independentOutcomes(ledger.records.filter(x=>x.createdAt>=ledger.startedAt),now);
 if(rows.length<minTrain)return null;
 const studied=rows.slice(0,minTrain);
 const rules=ruleSpecs.map(spec=>{
  const {yes,no,diff}=effect(studied,spec.test);
  if(diff===null||yes.length<12||no.length<12||Math.abs(diff)<0.15)return null;
  return {id:spec.id,label:spec.label,trainEffect:diff,trainWith:yes.length,trainWithout:no.length,
   expected:(diff>0?'higher':'lower') as 'higher'|'lower'};
 }).filter((r):r is Rule=>r!==null).sort((a,b)=>Math.abs(b.trainEffect)-Math.abs(a.trainEffect)).slice(0,3);
 return {version:1,trainedAt:now,trainingCutoff:Math.max(...studied.map(x=>x.createdAt)),
  trainingCount:studied.length,rules};
}
export function researchReport(ledger:LearningLedger,study:ResearchStudy|null,now=Date.now()):ResearchReport{
 const rows=independentOutcomes(ledger.records.filter(x=>x.createdAt>=ledger.startedAt),now);
 const days=new Set(rows.map(x=>Math.floor(x.createdAt/86400000))).size;
 if(!study)return {ready:false,sampleCount:rows.length,needed:Math.max(0,minTrain-rows.length),sampleDays:days,frozenAt:null,futureCount:0,checks:[],note:'Собираются независимые завершённые наблюдения. Гипотезы ещё не зафиксированы.'};
 // Do not score cases CREATED before freeze even when their results arrive later.
 const future=independentOutcomes(ledger.records.filter(x=>x.createdAt>study.trainedAt),now);
 const checks=study.rules.map(rule=>{
  const spec=ruleSpecs.find(x=>x.id===rule.id);
  if(!spec)return {rule,withCount:0,withoutCount:0,withTarget:0,withoutTarget:0,effect:null,state:'collecting' as const};
  const {yes,no,diff}=effect(future,spec.test);
  const enough=future.length>=minValidation&&yes.length>=8&&no.length>=8;
  const consistent=diff!==null&&((rule.trainEffect>0&&diff>0)||(rule.trainEffect<0&&diff<0))&&Math.abs(diff)>=0.05;
  return {rule,withCount:yes.length,withoutCount:no.length,withTarget:yes.reduce((s,x)=>s+tp(x),0),
   withoutTarget:no.reduce((s,x)=>s+tp(x),0),effect:diff,
   state:(!enough?'collecting':consistent?'consistent':'not-repeated') as RuleCheck['state']};
 });
 const note=study.rules.length===0?'В обучающем наборе не обнаружены достаточно заметные контрасты. Нельзя делать вывод о преимуществе.':future.length<minValidation?
  'Гипотезы зафиксированы. Данные будущих сценариев пока накапливаются без подгонки порогов.':
  'Показано только предварительное совпадение направления эффекта на новых виртуальных результатах, без гарантий.';
 return {ready:true,sampleCount:rows.length,needed:0,sampleDays:days,frozenAt:study.trainedAt,futureCount:future.length,checks,note};
}
export const researchPercent=(n:number|null)=>n===null?'—':(n>=0?'+':'')+format(n)+' п.п.';
