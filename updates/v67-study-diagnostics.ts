/** APEX 6.7: explanation of educational holdout exclusions.
 * Counts exactly one category per ticket. This module does not evaluate, tune or route orders.
 */
import type {StudyProtocol} from './v66-forward-study';
import type {FutureLedger,FutureTicket} from './v64-futures-assistant';

export type StudyDiagnostics={
 excludedBeforeStart:number;excludedModelMismatch:number;excludedMissingContext:number;
 active:number;expiredOrCancelled:number;dataGaps:number;unscoredClosed:number;reviewed:number;
 eligible:number;total:number;
};
const isScoreable=(t:FutureTicket)=>t.state==='CLOSED'&&t.quality==='OK'&&t.remainingPct===0&&
 Number.isFinite(t.grossUSDT)&&Array.isArray(t.events)&&
 t.events.some(e=>e.type==='STOP'||e.type==='COMPLETED');
export function explainFutureStudy(protocol:StudyProtocol|null,ledger:FutureLedger,now=Date.now()):StudyDiagnostics{
 const result:StudyDiagnostics={excludedBeforeStart:0,excludedModelMismatch:0,excludedMissingContext:0,
  active:0,expiredOrCancelled:0,dataGaps:0,unscoredClosed:0,reviewed:0,eligible:0,total:ledger.tickets.length};
 if(!protocol)return result;
 for(const t of ledger.tickets){
  if(!t||!Number.isFinite(t.createdAt)||t.createdAt<=protocol.startedAt){
   result.excludedBeforeStart++;continue;
  }
  if(t.plan?.model!==protocol.modelVersion){
   result.excludedModelMismatch++;continue;
  }
  const c=t.plan?.study;
  if(c?.modelVersion!==protocol.modelVersion||c.continuous!==true||
   !Number.isFinite(c.capturedAt)||c.capturedAt<protocol.startedAt||
   c.capturedAt>t.createdAt||t.createdAt>now||
   t.plan.observedBarAt>=t.createdAt||
   !['binance','bybit'].includes(t.plan.source)){
   result.excludedMissingContext++;continue;
  }
  result.eligible++;
  if(t.quality==='GAP'){result.dataGaps++;continue;}
  if(t.state==='WAITING'||t.state==='OPEN'){result.active++;continue;}
  if(t.state==='EXPIRED'||t.state==='CANCELLED'){result.expiredOrCancelled++;continue;}
  if(!isScoreable(t)){result.unscoredClosed++;continue;}
  result.reviewed++;
 }
 return result;
}