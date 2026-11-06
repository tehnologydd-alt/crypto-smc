/** APEX 6.8: transparent sensitivity, NOT exchange fee data or a net trading statement.
 * Modeled costs are hypothetical round-trip notional percentages, applied after
 * the educational closed-candle GROSS simulation; funding and slippage remain unknown.
 * The original ledger, outcomes, protocol and frozen checkpoints are unchanged.
 */
import type {StudyProtocol} from './v66-forward-study';
import type {FutureLedger,FutureTicket} from './v64-futures-assistant';
import type {AssistantExchange} from './demo-assistant';
export const EDUCATIONAL_BPS_PER_SIDE=[0,5,10] as const;
export type CostScenario={bpsPerSide:number;observations:number;grossUSDT:number;
 estimatedFeesUSDT:number;illustrativeAfterFeesUSDT:number};
export type VenueSensitivity={source:AssistantExchange;cases:CostScenario[]};
export type StudySensitivity={observations:number;binance:VenueSensitivity;bybit:VenueSensitivity;
 scope:'FROZEN_FORWARD_DEMO';warning:string};
export const sensitivityWarning='Условная проверка влияния издержек, а НЕ фактический чистый результат. Размер комиссии придуман для сценария, funding, проскальзывание, ликвидация и точность биржевого исполнения не учтены.';
function eligible(t:FutureTicket,p:StudyProtocol,now:number){
 const c=t?.plan?.study;
 return t.createdAt>p.startedAt&&t.createdAt<=now&&
  t.plan.model===p.modelVersion&&c?.modelVersion===p.modelVersion&&c.continuous===true&&
  Number.isFinite(c.capturedAt)&&c.capturedAt>=p.startedAt&&c.capturedAt<=t.createdAt&&
  t.plan.observedBarAt<t.createdAt&&t.state==='CLOSED'&&t.quality==='OK'&&
  t.remainingPct===0&&Number.isFinite(t.grossUSDT)&&
  t.events.some(e=>e.type==='STOP'||e.type==='COMPLETED')&&
  Number.isFinite(t.setup.notionalUSDT)&&t.setup.notionalUSDT>0;
}
function summarizeVenue(source:AssistantExchange,tickets:FutureTicket[]):VenueSensitivity{
 const cases=EDUCATIONAL_BPS_PER_SIDE.map(bpsPerSide=>{
  // Two hypothetical fee events (full entry + total closing quantity).
  // Actual commissions depend on venue tiers, order type and exit price.
  const fees=tickets.reduce((sum,t)=>sum+2*bpsPerSide/10000*t.setup.notionalUSDT,0);
  const gross=tickets.reduce((sum,t)=>sum+t.grossUSDT,0);
  return {bpsPerSide,observations:tickets.length,grossUSDT:gross,
   estimatedFeesUSDT:fees,illustrativeAfterFeesUSDT:gross-fees};
 });
 return {source,cases};
}
export function studyCostSensitivity(p:StudyProtocol|null,ledger:FutureLedger,now=Date.now()):StudySensitivity{
 const forward=p?ledger.tickets.filter(t=>eligible(t,p,now)):[];
 const binance=forward.filter(t=>t.plan.source==='binance');
 const bybit=forward.filter(t=>t.plan.source==='bybit');
 return {observations:binance.length+bybit.length,binance:summarizeVenue('binance',binance),
  bybit:summarizeVenue('bybit',bybit),scope:'FROZEN_FORWARD_DEMO',warning:sensitivityWarning};
}