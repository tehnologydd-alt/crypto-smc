/** APEX 6.5 educational review: separate observations, never a trading recommendation.
 * Never describe gross futures PnL as net, and never merge Spot and Futures returns.
 * Only actual saved prospective demo tickets are counted. No historical backfill.
 */
import type {AssistantLedger} from './demo-assistant';
import type {FutureLedger} from './v64-futures-assistant';
type CountByVenue={binance:number;bybit:number};
export type DemoEvidence={
 spot:{total:number;pending:number;open:number;closed:number;reviewable:number;
  tp1:number;tp2:number;tp3:number;expired:number;cancelled:number;byVenue:CountByVenue};
 futures:{total:number;pending:number;open:number;closed:number;reviewable:number;
  tp1:number;tp2:number;tp3:number;gap:number;unresolved:number;expired:number;
  positive:number;negative:number;flat:number;grossTotalUSDT:number;byVenue:CountByVenue;
  withContext:number;firstAt:number|null;lastAt:number|null};
 status:'INSUFFICIENT'|'OBSERVATIONAL';
 notice:string;
};
const venueCount=():CountByVenue=>({binance:0,bybit:0});
export function summarizeDemoEvidence(spot:AssistantLedger,futures:FutureLedger):DemoEvidence{
 const s=spot.orders,f=futures.tickets;
 const spotReviewable=s.filter(o=>o.state==='CLOSED'&&o.events.some(e=>['TP3','STOP','REVERSAL'].includes(e.type)));
 const futuresReviewable=f.filter(o=>o.state==='CLOSED'&&o.quality==='OK'&&o.remainingPct===0&&
  Number.isFinite(o.grossUSDT)&&o.events.some(e=>['STOP','COMPLETED','MANUAL'].includes(e.type)));
 const a=venueCount(),b=venueCount();
 for(const o of s){if(o.exchange==='binance'||o.exchange==='bybit')a[o.exchange]++;}
 for(const o of f){if(o.plan.source==='binance'||o.plan.source==='bybit')b[o.plan.source]++;}
 const times=f.map(o=>o.createdAt).filter(t=>Number.isFinite(t)&&t>0).sort((x,y)=>x-y);
 const gross=futuresReviewable.reduce((sum,o)=>sum+o.grossUSDT,0);
 const gap=f.filter(o=>o.quality==='GAP').length;
 const unresolved=f.filter(o=>o.state==='CLOSED'&&!futuresReviewable.includes(o)).length;
 const status=futuresReviewable.length>=30?'OBSERVATIONAL':'INSUFFICIENT';
 return {
  spot:{total:s.length,pending:s.filter(o=>o.state==='WAITING').length,open:s.filter(o=>o.state==='OPEN').length,
   closed:s.filter(o=>o.state==='CLOSED').length,reviewable:spotReviewable.length,
   tp1:s.filter(o=>o.tpReached>=1).length,tp2:s.filter(o=>o.tpReached>=2).length,
   tp3:s.filter(o=>o.tpReached>=3).length,expired:s.filter(o=>o.state==='EXPIRED').length,
   cancelled:s.filter(o=>o.state==='CANCELLED').length,byVenue:a},
  futures:{total:f.length,pending:f.filter(o=>o.state==='WAITING').length,open:f.filter(o=>o.state==='OPEN').length,
   closed:f.filter(o=>o.state==='CLOSED').length,reviewable:futuresReviewable.length,
   tp1:f.filter(o=>o.tpReached>=1).length,tp2:f.filter(o=>o.tpReached>=2).length,
   tp3:f.filter(o=>o.tpReached>=3).length,gap,unresolved,
   expired:f.filter(o=>o.state==='EXPIRED').length,
   positive:futuresReviewable.filter(o=>o.grossUSDT>0).length,
   negative:futuresReviewable.filter(o=>o.grossUSDT<0).length,
   flat:futuresReviewable.filter(o=>o.grossUSDT===0).length,
   grossTotalUSDT:gross,byVenue:b,withContext:f.filter(o=>o.plan.study?.modelVersion==='futures-study-v1'&&o.plan.study?.continuous===true).length,
   firstAt:times.length?times[0]:null,lastAt:times.length?times[times.length-1]:null},
  status,
  notice:status==='INSUFFICIENT'
   ?'Выборка мала. Это журнал проверки учебной модели, а не подтверждение прибыли или готовая ИИ-система.'
   :'Это только описательная статистика учебной модели: без комиссий, funding, проскальзывания и полноценной проверки на независимых будущих данных.'
 };
}