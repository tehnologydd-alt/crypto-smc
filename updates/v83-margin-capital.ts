/** APEX 8.3 — source-specific hypothetical Futures DEMO margin/equity guard.
 *
 * This is educational capital accounting, NOT exchange collateral, liquidation,
 * maintenance tiers, broker leverage permission, finance advice or real orders.
 * Data is from the selected source's CLOSED candles only. Unknown/stale OPEN
 * marks block NEW virtual reservations rather than inventing available money.
 */
import type {FutureBar} from './v64-futures-market';
import {
 FUTURE_FRAME_MS,enrollFutureTicket,validFutureSetup,type FutureLedger,
 type FutureTicket,type FuturePlan,type FutureSetup
} from './v64-futures-assistant';
import type {AssistantExchange,AssistantFrame,AssistantMode} from './demo-assistant';
import {
 reportDemoWallet,type DemoWalletBook,type DemoAccountKey
} from './v82-demo-accounts';
import type {DemoVenueChoice} from './v76-scope-demo';

const round6=(n:number)=>Math.round(n*1_000_000)/1_000_000;
const active=(t:FutureTicket)=>t.state==='WAITING'||t.state==='OPEN';
const keyOf=(venue:AssistantExchange,symbol:string,frame:AssistantFrame)=>
 venue+':'+symbol+':'+frame;
export type FuturesCapitalRow={
 venue:AssistantExchange;balanceUSDT:number;reservedUSDT:number;
 pendingMarginUSDT:number;openMarginUSDT:number;
 floatingUSDT:number;equityUSDT:number;freeEquityUSDT:number;
 admissionFreeUSDT:number;activeCount:number;waitingCount:number;openCount:number;
 unknownMarks:number;capacityStatus:'OK'|'NO_ACCOUNT'|'NO_FUNDS'|'UNPRICED';
 noMarkNote:string;
};
export type CapitalPermission={allowed:boolean;reason:string;
 neededUSDT:number;availableUSDT:number;maxAdditional:number;row:FuturesCapitalRow};
export type MarkInfo={mark:number|null;closedAt:number|null;status:'FRESH'|'MISSING'|'STALE'|'GAP'};

/** Mark only against a valid, fresh, closed Futures bar on this exact exchange.
 * No mark from a different exchange, unrelated symbol, Spot or an open candle.
 */
export function confirmedFutureMark(t:FutureTicket,bars:Record<string,FutureBar[]>,
 now=Date.now()):MarkInfo{
 if(t.state!=='OPEN')return {mark:null,closedAt:null,status:'MISSING'};
 if(t.quality!=='OK')return {mark:null,closedAt:null,status:'GAP'};
 const ms=FUTURE_FRAME_MS[t.plan.frame],key=keyOf(t.plan.source,t.plan.symbol,t.plan.frame);
 const observations=bars[key];
 if(!observations?.length)return {mark:null,closedAt:null,status:'MISSING'};
 const latest=[...observations].reverse().find(b=>
  b.closed===true&&Number.isSafeInteger(b.time)&&b.time>0&&
  b.time+ms<=now&&b.open>0&&b.high>=b.open&&b.low>0&&
  b.low<=b.open&&b.close>0&&b.high>=b.close&&b.low<=b.close);
 if(!latest)return {mark:null,closedAt:null,status:'MISSING'};
 const closedAt=latest.time+ms;
 const age=now-closedAt;
 if(age<0||age>Math.max(2*ms,600000))
  return {mark:null,closedAt,status:'STALE'};
 // If OHLC history skipped the last processed bar, do not assume continuity.
 if(latest.time<t.lastBarAt)return {mark:null,closedAt,status:'STALE'};
 return {mark:latest.close,closedAt,status:'FRESH'};
}
function positionFloating(t:FutureTicket,mark:number):number{
 const sign=t.plan.direction==='LONG'?1:-1;
 if(!(t.plan.entry>0)||!(t.setup.notionalUSDT>0))return 0;
 return sign*(mark-t.plan.entry)/t.plan.entry*t.setup.notionalUSDT*
  Math.max(0,Math.min(100,t.remainingPct))/100;
}
export function futuresCapitalRow(book:DemoWalletBook|null,venue:AssistantExchange,
 ledger:FutureLedger,bars:Record<string,FutureBar[]>,now=Date.now()):FuturesCapitalRow{
 const walletKey=('futures:'+venue) as DemoAccountKey;
 const wallet=book?.wallets[walletKey];
 const balanceUSDT=wallet?reportDemoWallet(book!,walletKey,ledger).balanceUSDT:0;
 let pendingMarginUSDT=0,openMarginUSDT=0,floatingUSDT=0,unknownMarks=0,waitingCount=0,openCount=0;
 for(const t of ledger.tickets){
  if(t.plan.source!==venue||!active(t))continue;
  const initialMargin=t.setup.leverage>0?t.setup.notionalUSDT/t.setup.leverage:Infinity;
  const validMargin=Number.isFinite(initialMargin)&&initialMargin>=0?initialMargin:0;
  if(t.state==='WAITING'){waitingCount++;pendingMarginUSDT+=validMargin;continue;}
  openCount++;openMarginUSDT+=validMargin*Math.min(100,Math.max(0,t.remainingPct))/100;
  const mark=confirmedFutureMark(t,bars,now);
  if(mark.mark===null){unknownMarks++;continue;}
  floatingUSDT+=positionFloating(t,mark.mark);
 }
 const reservedUSDT=round6(pendingMarginUSDT+openMarginUSDT);
 const freeEquityUSDT=round6(balanceUSDT+floatingUSDT-reservedUSDT);
 // Positive unrealized PnL is not offered as new reservation capacity.
 const admissionFreeUSDT=round6(balanceUSDT+Math.min(0,floatingUSDT)-reservedUSDT);
 const capacityStatus:FuturesCapitalRow['capacityStatus']=!wallet?'NO_ACCOUNT':
  unknownMarks>0?'UNPRICED':admissionFreeUSDT<=0?'NO_FUNDS':'OK';
 const noMarkNote=unknownMarks?
  'Для '+unknownMarks+' открытых виртуальных позиций нет свежих проверенных свечей. Новые планы приостановлены.':
  'Свободные средства условные; реальные требования бирж и ликвидация не моделируются.';
 return {venue,balanceUSDT,reservedUSDT,pendingMarginUSDT:round6(pendingMarginUSDT),
  openMarginUSDT:round6(openMarginUSDT),floatingUSDT:round6(floatingUSDT),
  equityUSDT:round6(balanceUSDT+floatingUSDT),freeEquityUSDT,admissionFreeUSDT,
  activeCount:waitingCount+openCount,waitingCount,openCount,unknownMarks,
  capacityStatus,noMarkNote};
}
/** Require enough capital for the ENTIRE pending simulated LIMIT reservation.
 * A 100 USDT notional position at virtual 5x consumes 20 USDT on THIS venue,
 * not 100 USDT margin. Global six-active cap is preserved separately.
 */
export function checkDemoMargin(book:DemoWalletBook|null,venue:AssistantExchange,
 setup:FutureSetup,ledger:FutureLedger,bars:Record<string,FutureBar[]>,
 now=Date.now()):CapitalPermission{
 const row=futuresCapitalRow(book,venue,ledger,bars,now);
 const neededUSDT=validFutureSetup(setup)?round6(setup.notionalUSDT/setup.leverage):Infinity;
 const room=Math.max(0,Math.min(6-ledger.tickets.filter(active).length,80-ledger.tickets.length));
 const maxAdditional=Number.isFinite(neededUSDT)&&neededUSDT>0&&row.unknownMarks===0?
  Math.max(0,Math.min(room,Math.floor((row.admissionFreeUSDT+1e-8)/neededUSDT))):0;
 let reason='';
 if(!book?.wallets[('futures:'+venue) as DemoAccountKey])reason='DEMO-счёт не создан или повреждён — новые сценарии отключены.';
 else if(!validFutureSetup(setup)||setup.exchange!==venue)reason='Некорректные настройки виртуальной позиции для этой биржи.';
 else if(ledger.tickets.length>=80||room<=0)reason='Достигнут лимит активных виртуальных сценариев или размер журнала.';
 else if(row.unknownMarks>0)reason='Нет свежей проверенной свечи для открытой позиции на этой бирже; свободная маржа неопределённа.';
 else if(row.admissionFreeUSDT+1e-8<neededUSDT)reason='Недостаточно свободного виртуального капитала для резервирования '+neededUSDT.toFixed(2)+' USDT.';
 return {allowed:reason==='',reason,neededUSDT,availableUSDT:row.admissionFreeUSDT,
  maxAdditional,row};
}
export function enrollMarginAwareTicket(ledger:FutureLedger,plan:FuturePlan,
 setup:FutureSetup,mode:AssistantMode,book:DemoWalletBook|null,
 observations:Record<string,FutureBar[]>,now=Date.now()):FutureLedger{
 const admission=checkDemoMargin(book,plan.source,setup,ledger,observations,now);
 if(!admission.allowed)return ledger;
 return enrollFutureTicket(ledger,plan,setup,mode,now);
}
export function enrollMarginAwareMulti(ledger:FutureLedger,plans:FuturePlan[],
 setup:FutureSetup,book:DemoWalletBook|null,observations:Record<string,FutureBar[]>,
 now=Date.now()):FutureLedger{
 let next=ledger;
 // Fair interleave between public market venues, and re-evaluate margin after
 // EVERY accepted paper LIMIT. Never reserve the same money twice.
 const sourceOrder:AssistantExchange[]=['binance','bybit'];
 const batches=sourceOrder.map(source=>plans.filter(p=>p.source===source).slice(0,4));
 for(let i=0;i<4;i++)for(let j=0;j<sourceOrder.length;j++){
  const plan=batches[j][i];if(!plan)continue;
  const own={...setup,exchange:sourceOrder[j]} as FutureSetup;
  next=enrollMarginAwareTicket(next,plan,own,'auto',book,observations,now);
 }
 return next;
}
export function maxDemoPositionsForSetup(book:DemoWalletBook|null,
 venue:AssistantExchange,setup:FutureSetup,ledger:FutureLedger,
 bars:Record<string,FutureBar[]>,now=Date.now()):number{
 return checkDemoMargin(book,venue,{...setup,exchange:venue},ledger,bars,now).maxAdditional;
}
/** Withdrawal must respect the reservation, not merely gross cash balance.
 * Cash-outs never count as profitability in the paper wallet.
 */
export function checkDemoWithdrawal(book:DemoWalletBook|null,venue:AssistantExchange,
 ledger:FutureLedger,bars:Record<string,FutureBar[]>,cents:number,now=Date.now()):
 {allowed:boolean;reason:string;freeUSDT:number}{
 const row=futuresCapitalRow(book,venue,ledger,bars,now);
 if(!Number.isSafeInteger(cents)||cents<1)return {allowed:false,reason:'Неверная виртуальная сумма.',freeUSDT:row.admissionFreeUSDT};
 if(!book||row.unknownMarks>0)return {allowed:false,
  reason:!book?'DEMO-счёт недоступен.':'Не хватает свежих свечей для оценки доступной маржи.',
  freeUSDT:row.admissionFreeUSDT};
 const allowed=row.admissionFreeUSDT+1e-8>=cents/100;
 return {allowed,reason:allowed?'':'После списания не хватит свободной виртуальной маржи.',
  freeUSDT:row.admissionFreeUSDT};
}
