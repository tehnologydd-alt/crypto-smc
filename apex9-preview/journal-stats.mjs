/**
 * APEX real-only research outcomes. Same native journal for all and selected.
 * Verify source horizon and original immutable range before counting results.
 */
import {forecastStage} from './favorite-logic.mjs';
import {inspectResearchTimeline} from './research-timeline.mjs';
import {directionalHypothesis,planDirectionalScenario} from './directional-scenario.mjs';
export function journalObservedStats(rows,{selectedIds=[],totalPublished=null,now=Date.now()}={}){
 const all=Array.isArray(rows)?rows:[];
 const picked=new Set(selectedIds);
 const grouped=(records)=>{
  const result={total:records.length,waiting:0,confirmed:0,active:0,
   completed:0,within:0,outside:0,unverifiedDue:0,inconsistent:0,
   verifiedOutcomes:0,directional:{published:0,tp3:0,stop:0,
    ambiguous:0,notEntered:0,horizon:0,pending:0}};
  for(const row of records){
   const stage=forecastStage(row);
   if(stage==='PENDING_CONFIRMATION')result.waiting++;
   else if(stage==='CONFIRMED')result.confirmed++;
   else if(stage==='ACTIVE')result.active++;
   else if(stage==='COMPLETED')result.completed++;
   if(directionalHypothesis(row)){
    const planned=planDirectionalScenario(row,{now});
    if(planned.state!=='READY'){result.inconsistent++;continue;}
    result.directional.published++;
    const evaluation=row.evaluation;
    if(stage==='COMPLETED'&&evaluation&&
     Number.isSafeInteger(evaluation.evaluatedAt)&&evaluation.evaluatedAt<=now+60000&&
     evaluation.evaluatedAt>planned.plan.publishedAt&&
     evaluation.targetCloseAt===planned.plan.targetCloseAt&&
     typeof evaluation.actualClose==='number'&&
     Number.isFinite(evaluation.actualClose)&&evaluation.actualClose>0){
     const index={TP3:'tp3',STOP:'stop',AMBIGUOUS:'ambiguous',
      NOT_ENTERED:'notEntered',HORIZON:'horizon'}[evaluation.outcome];
     if(index)result.directional[index]++;
     else result.inconsistent++;
    }else{
     result.directional.pending++;
     if(stage==='COMPLETED'&&!evaluation)result.unverifiedDue++;
    }
    continue;
   }
   const trace=inspectResearchTimeline(row,{now});
   if(trace.state==='EVALUATED'){
    result.verifiedOutcomes++;
    if(trace.result?.outcome==='WITHIN_RANGE')result.within++;
    else if(trace.result?.outcome==='OUTSIDE_RANGE')result.outside++;
   }else{
    if(trace.state==='INCONSISTENT_RESULT'||trace.state==='INVALID')
     result.inconsistent++;
    if(trace.dueUnverified===true||(stage==='COMPLETED'&&!row?.evaluation))
     result.unverifiedDue++;
   }
  }
  return result;
 };
 return {all:grouped(all),
  tracked:grouped(all.filter(row=>picked.has(row.id))),
  truncated:Number.isSafeInteger(totalPublished)&&totalPublished>all.length};
}
