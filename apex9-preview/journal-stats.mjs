/**
 * APEX real-only research outcomes. Same native journal for all and selected.
 * Verify source horizon and original immutable range before counting results.
 */
import {forecastStage} from './favorite-logic.mjs';
import {inspectResearchTimeline} from './research-timeline.mjs';
export function journalObservedStats(rows,{selectedIds=[],totalPublished=null,now=Date.now()}={}){
 const all=Array.isArray(rows)?rows:[];
 const picked=new Set(selectedIds);
 const grouped=(records)=>{
  const result={total:records.length,waiting:0,confirmed:0,active:0,
   completed:0,within:0,outside:0,unverifiedDue:0,inconsistent:0,
   verifiedOutcomes:0};
  for(const row of records){
   const stage=forecastStage(row);
   if(stage==='PENDING_CONFIRMATION')result.waiting++;
   else if(stage==='CONFIRMED')result.confirmed++;
   else if(stage==='ACTIVE')result.active++;
   else if(stage==='COMPLETED')result.completed++;
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
