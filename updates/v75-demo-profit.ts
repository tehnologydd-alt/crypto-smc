/** APEX 7.5 — transparent hypothetical futures DEMO outcome accounting.
 * Positive and negative GROSS figures are shown separately. Scenario fees
 * are illustrative bps/side, NOT a price or account quotation from an exchange.
 * No funding, slippage, liquidation, taxes or guaranteed execution.
 */
import type {StudyProtocol} from './v66-forward-study';
import type {FutureLedger,FutureTicket} from './v64-futures-assistant';
import type {AssistantExchange} from './demo-assistant';
export type DemoProfitRow={source:AssistantExchange|'total';reviewed:number;
 profitable:number;losing:number;flat:number;
 grossGainsUSDT:number;grossLossesUSDT:number;grossUSDT:number;
 hypotheticalFeesUSDT:number;illustrativeNetUSDT:number};
export type DemoProfitReport={bpsPerSide:number;binance:DemoProfitRow;bybit:DemoProfitRow;total:DemoProfitRow;notice:string};
export const DEMO_COST_CHOICES=[0,5,10] as const;
const eligible=(t:FutureTicket,p:StudyProtocol,now:number)=>{
 const s=t.plan?.study;
 return t.createdAt>p.startedAt&&t.createdAt<=now&&t.plan.model===p.modelVersion&&
  s?.modelVersion===p.modelVersion&&s.continuous===true&&
  Number.isFinite(s.capturedAt)&&s.capturedAt>=p.startedAt&&s.capturedAt<=t.createdAt&&
  t.plan.observedBarAt<t.createdAt&&t.state==='CLOSED'&&t.quality==='OK'&&
  t.remainingPct===0&&Number.isFinite(t.grossUSDT)&&
  t.events.some(e=>e.type==='STOP'||e.type==='COMPLETED')&&
  Number.isFinite(t.setup.notionalUSDT)&&t.setup.notionalUSDT>0;
};
function row(source:AssistantExchange,tickets:FutureTicket[],bpsPerSide:number):DemoProfitRow{
 const gains=tickets.filter(t=>t.grossUSDT>0);
 const losses=tickets.filter(t=>t.grossUSDT<0);
 const grossGainsUSDT=gains.reduce((sum,t)=>sum+t.grossUSDT,0);
 const grossLossesUSDT=losses.reduce((sum,t)=>sum+t.grossUSDT,0);
 const grossUSDT=grossGainsUSDT+grossLossesUSDT;
 // Assumes full initial+exit notional identical for estimate only.
 const hypotheticalFeesUSDT=tickets.reduce((sum,t)=>sum+2*bpsPerSide/10000*t.setup.notionalUSDT,0);
 return {source,reviewed:tickets.length,profitable:gains.length,losing:losses.length,
  flat:tickets.length-gains.length-losses.length,grossGainsUSDT,grossLossesUSDT,grossUSDT,
  hypotheticalFeesUSDT,illustrativeNetUSDT:grossUSDT-hypotheticalFeesUSDT};
}
export function demoProfitBreakdown(protocol:StudyProtocol|null,ledger:FutureLedger,
 bpsPerSide:number,now=Date.now()):DemoProfitReport{
 const bps=DEMO_COST_CHOICES.includes(bpsPerSide as 0|5|10)?bpsPerSide:5;
 const t=protocol?ledger.tickets.filter(ticket=>eligible(ticket,protocol,now)):[];
 const binance=row('binance',t.filter(o=>o.plan.source==='binance'),bps);
 const bybit=row('bybit',t.filter(o=>o.plan.source==='bybit'),bps);
 const total:DemoProfitRow={
  source:'total',
  reviewed:binance.reviewed+bybit.reviewed,
  profitable:binance.profitable+bybit.profitable,
  losing:binance.losing+bybit.losing,
  flat:binance.flat+bybit.flat,
  grossGainsUSDT:binance.grossGainsUSDT+bybit.grossGainsUSDT,
  grossLossesUSDT:binance.grossLossesUSDT+bybit.grossLossesUSDT,
  grossUSDT:binance.grossUSDT+bybit.grossUSDT,
  hypotheticalFeesUSDT:binance.hypotheticalFeesUSDT+bybit.hypotheticalFeesUSDT,
  illustrativeNetUSDT:binance.illustrativeNetUSDT+bybit.illustrativeNetUSDT
 };
 return {bpsPerSide:bps,binance,bybit,total,
  notice:'Условный итог завершённых Futures DEMO, не реальные деньги. Комиссии смоделированы с выбранной ставкой за сторону и не являются тарифами Binance или Bybit. Funding, проскальзывание, ликвидация, налоги и неточности исполнения не учтены.'};
}
