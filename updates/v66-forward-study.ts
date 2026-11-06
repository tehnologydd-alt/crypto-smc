/** APEX 6.6: prospective, frozen educational evidence cohort.
 * Start must be explicitly requested. No backfill, no training, no rewrites
 * of an existing protocol and no hidden decision tuning.
 */
import type {FutureLedger,FutureTicket} from './v64-futures-assistant';
export type StudyProtocol={version:1;id:string;startedAt:number;modelVersion:'futures-study-v1';rule:'forward-demo-v1'};
export type StudyVenue={plans:number;complete:number;active:number;expired:number;gaps:number;unscored:number;
 positive:number;negative:number;flat:number;grossUSDT:number};
export type StudyReport={startedAt:number|null;modelVersion:string;eligible:number;
 binance:StudyVenue;bybit:StudyVenue;priorExcluded:number;unmatchedExcluded:number;daysObserved:number;
 verdict:'NOT_STARTED'|'COLLECTING'|'DESCRIPTIVE';reviewable:number};
const emptyVenue=():StudyVenue=>({plans:0,complete:0,active:0,expired:0,gaps:0,unscored:0,
 positive:0,negative:0,flat:0,grossUSDT:0});
export function startStudyProtocol(now:number):StudyProtocol{
 if(!Number.isSafeInteger(now)||now<=0)throw Error('Неверное время запуска наблюдения');
 return {version:1,id:'forward-demo-v1:'+now,startedAt:now,modelVersion:'futures-study-v1',rule:'forward-demo-v1'};
}
export function restoreStudyProtocol(raw:string|null,now=Date.now()):StudyProtocol|null{
 try{
  const x=JSON.parse(raw||'null') as StudyProtocol;
  if(!x||x.version!==1||x.rule!=='forward-demo-v1'||x.modelVersion!=='futures-study-v1'||
   !Number.isSafeInteger(x.startedAt)||x.startedAt<=0||x.startedAt>now||
   x.id!=='forward-demo-v1:'+x.startedAt)return null;
  return x;
 }catch{return null;}
}
const scored=(t:FutureTicket)=>
 t.state==='CLOSED'&&t.quality==='OK'&&t.remainingPct===0&&Number.isFinite(t.grossUSDT)&&
 t.events.some(e=>e.type==='STOP'||e.type==='COMPLETED');
/** New tickets only: existing virtual orders, later-backfilled context, manual exits
 * and gaps never become holdout evidence. Gross results are not performance proof.
 */
export function summarizeStudyProtocol(protocol:StudyProtocol|null,ledger:FutureLedger,now=Date.now()):StudyReport{
 const result:StudyReport={startedAt:protocol?.startedAt||null,modelVersion:'futures-study-v1',eligible:0,
  binance:emptyVenue(),bybit:emptyVenue(),priorExcluded:0,unmatchedExcluded:0,daysObserved:0,
  verdict:protocol?'COLLECTING':'NOT_STARTED',reviewable:0};
 if(!protocol)return result;
 result.daysObserved=Math.max(0,Math.floor((now-protocol.startedAt)/86400000));
 for(const t of ledger.tickets){
  if(!t||!Number.isFinite(t.createdAt)||t.createdAt<=protocol.startedAt){
   result.priorExcluded++;continue;
  }
  const ctx=t.plan?.study;
  if(t.plan?.model!==protocol.modelVersion||ctx?.modelVersion!==protocol.modelVersion||
   ctx.continuous!==true||!Number.isFinite(ctx.capturedAt)||ctx.capturedAt<protocol.startedAt||
   ctx.capturedAt>t.createdAt||t.createdAt>now||t.plan.observedBarAt>=t.createdAt||
   !['binance','bybit'].includes(t.plan.source)){
    result.unmatchedExcluded++;continue;
  }
  result.eligible++;
  const venue=t.plan.source==='binance'?result.binance:result.bybit;
  venue.plans++;
  if(t.quality==='GAP'){venue.gaps++;continue;}
  if(t.state==='WAITING'||t.state==='OPEN'){venue.active++;continue;}
  if(t.state==='EXPIRED'||t.state==='CANCELLED'){venue.expired++;continue;}
  if(!scored(t)){venue.unscored++;continue;}
  venue.complete++;result.reviewable++;
  venue.grossUSDT+=t.grossUSDT;
  if(t.grossUSDT>0)venue.positive++;
  else if(t.grossUSDT<0)venue.negative++;
  else venue.flat++;
 }
 if(result.reviewable>=30)result.verdict='DESCRIPTIVE';
 return result;
}