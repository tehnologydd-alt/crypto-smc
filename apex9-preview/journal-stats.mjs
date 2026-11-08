/** Read-only grouped statistics for archived research scenario outcomes. */
import {forecastStage} from './favorite-logic.mjs';
export function journalObservedStats(rows,{selectedIds=[],totalPublished=null}={}){
 const all=Array.isArray(rows)?rows:[];
 const picked=new Set(selectedIds);
 const grouped=(records)=>{
  const result={total:records.length,waiting:0,confirmed:0,active:0,
   completed:0,within:0,outside:0,unverifiedDue:0};
  for(const row of records){
   const stage=forecastStage(row);
   if(stage==='PENDING_CONFIRMATION')result.waiting++;
   else if(stage==='CONFIRMED')result.confirmed++;
   else if(stage==='ACTIVE')result.active++;
   else if(stage==='COMPLETED')result.completed++;
   if(row?.evaluation?.outcome==='WITHIN_RANGE')result.within++;
   else if(row?.evaluation?.outcome==='OUTSIDE_RANGE')result.outside++;
   else if(!row?.evaluation&&stage==='COMPLETED')result.unverifiedDue++;
  }
  return result;
 };
 return {all:grouped(all),
  tracked:grouped(all.filter(row=>picked.has(row.id))),
  truncated:Number.isSafeInteger(totalPublished)&&totalPublished>all.length};
}
