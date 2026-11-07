/** APEX 8.2 — independent, local-only DEMO cash accounts per venue AND market.
 *
 * Transactions are explicitly manual; transfer inflows/outflows NEVER count
 * as simulated strategy profits. Futures journal provides limited verified
 * gross hypothetical outcomes from closed candles (not exchange executions).
 * Spot journal has no notional sizing, so no imaginary Spot USDT PnL.
 * Previous tickets are frozen at account creation: no backdating winnings.
 */
import type {FutureLedger,FutureTicket} from './v64-futures-assistant';
import type {AssistantExchange} from './demo-assistant';

export const DEMO_ACCOUNT_KEY='apex_v82_virtual_accounts';
export type DemoMarket='futures'|'spot';
export type DemoAccountKey='futures:binance'|'futures:bybit'|'spot:binance'|'spot:bybit';
export type DemoCashKind='DEPOSIT'|'WITHDRAW';
export type DemoCashTransfer={id:string;at:number;kind:DemoCashKind;cents:number};
export type DemoBasis={ticketId:string;valueUSDT:number};
export type DemoWallet={startedAt:number;basis:DemoBasis[];transfers:DemoCashTransfer[]};
export type DemoWalletBook={version:1;wallets:Record<DemoAccountKey,DemoWallet>};
export type DemoWalletReport={
 key:DemoAccountKey;market:DemoMarket;venue:AssistantExchange;startedAt:number;
 depositsUSDT:number;withdrawalsUSDT:number;netAddedUSDT:number;
 realizedGrossUSDT:number;balanceUSDT:number;closedCount:number;
 partialCount:number;excludedCount:number;transferCount:number;
 hasProfitModel:boolean;note:string;
};
export const WALLET_KEYS:DemoAccountKey[]=[
 'futures:binance','futures:bybit','spot:binance','spot:bybit'
];
const MAX_RECEIPTS=1024,MAX_BASES=80,MAX_CENTS=10_000_000; // <=100k USDT / cash operation
const validAt=(n:unknown,now:number)=>Number.isSafeInteger(n)&&Number(n)>0&&Number(n)<=now;
const safeAmount=(n:unknown)=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<=10_000_000;
const round6=(n:number)=>Math.round(n*1_000_000)/1_000_000;

/** Ledger TP amounts already reflect REDUCED fraction of original nominal.
 * Their event types are explicit; do not infer nonexistent intrabar fills.
 * Manual closure's unverified residual does NOT enter verified account return.
 */
export function recognizedFutureGross(t:FutureTicket):number{
 if(!t||!t.plan||!t.setup||!['OPEN','WAITING','CLOSED','EXPIRED','CANCELLED'].includes(t.state))
  return 0;
 const sign=t.plan.direction==='LONG'?1:-1;
 const base=t.plan.entry,nominal=t.setup.notionalUSDT;
 if(!Number.isFinite(base)||base<=0||!Number.isFinite(nominal)||nominal<=0||
  !Array.isArray(t.plan.targets)||!Array.isArray(t.setup.portions)||!Array.isArray(t.events))
  return 0;
 const tpEvents=new Set(t.events.filter(e=>/^TP[123]$/.test(e.type)).map(e=>e.type));
 const observed=Math.min(3,Math.max(0,Number.isInteger(t.tpReached)?t.tpReached:0));
 let partial=0;
 for(let i=0;i<observed;i++){
  if(!tpEvents.has('TP'+(i+1)))continue;
  const target=t.plan.targets[i],pct=t.setup.portions[i];
  if(!Number.isFinite(target)||target<=0||!Number.isFinite(pct)||pct<=0)continue;
  partial+=sign*(target-base)/base*nominal*pct/100;
 }
 // Only STOP or COMPLETED with no gaps and all fractions closed can settle
 // the full result; don't treat manual estimated price or missing candles
 // as a reliable closure.
 const settled=t.state==='CLOSED'&&t.quality==='OK'&&t.remainingPct===0&&
  t.events.some(e=>e.type==='STOP'||e.type==='COMPLETED');
 if(settled&&Number.isFinite(t.grossUSDT))return round6(t.grossUSDT);
 return round6(partial);
}
const initialWallet=(now:number,ledger:FutureLedger,venue:AssistantExchange,market:DemoMarket):DemoWallet=>{
 const basis:DemoBasis[]=market==='futures'?ledger.tickets.filter(t=>
  t.plan.source===venue&&(t.state==='WAITING'||t.state==='OPEN'))
  .slice(0,MAX_BASES).map(t=>({ticketId:t.id,valueUSDT:recognizedFutureGross(t)})):[];
 return {startedAt:now,basis,transfers:[]};
};
/** Existing study tickets never get credited retroactively.
 * Future changes to an OPEN pre-existing ticket count only AFTER this cutoff.
 */
export function openDemoWallets(ledger:FutureLedger,now=Date.now()):DemoWalletBook{
 if(!validAt(now,now))throw Error('Некорректное время создания учебного счёта.');
 return {version:1,wallets:{
  'futures:binance':initialWallet(now,ledger,'binance','futures'),
  'futures:bybit':initialWallet(now,ledger,'bybit','futures'),
  'spot:binance':initialWallet(now,ledger,'binance','spot'),
  'spot:bybit':initialWallet(now,ledger,'bybit','spot')
 }};
}
export function restoreDemoWallets(raw:string|null,now=Date.now()):DemoWalletBook|null{
 if(!raw)return null;
 try{
  const parsed=JSON.parse(raw) as DemoWalletBook;
  if(parsed?.version!==1||!parsed.wallets||Object.keys(parsed.wallets).length!==4)return null;
  const transferIds=new Set<string>();
  for(const key of WALLET_KEYS){
   const w=parsed.wallets[key];
   if(!w||!validAt(w.startedAt,now)||!Array.isArray(w.basis)||w.basis.length>MAX_BASES||
    !Array.isArray(w.transfers)||w.transfers.length>MAX_RECEIPTS)return null;
   const basisIds=new Set<string>();
   for(const b of w.basis){
    if(!b||typeof b.ticketId!=='string'||b.ticketId.length>230||
     !b.ticketId.startsWith('futures:')||!safeAmount(b.valueUSDT)||
     basisIds.has(b.ticketId))return null;
    if(!b.ticketId.startsWith('futures:'+key.split(':')[1]+':'))return null;
    basisIds.add(b.ticketId);
   }
   if(key.startsWith('spot:')&&w.basis.length>0)return null;
   for(const x of w.transfers){
    if(!x||typeof x.id!=='string'||x.id.length>120||transferIds.has(x.id)||
     !validAt(x.at,now)||x.at<w.startedAt||
     !['DEPOSIT','WITHDRAW'].includes(x.kind)||!Number.isSafeInteger(x.cents)||
     x.cents<1||x.cents>MAX_CENTS)return null;
    transferIds.add(x.id);
   }
  }
  return parsed;
 }catch{return null;}
}
const walletFor=(book:DemoWalletBook,key:DemoAccountKey)=>book.wallets[key];
export function reportDemoWallet(book:DemoWalletBook,key:DemoAccountKey,
 ledger:FutureLedger):DemoWalletReport{
 const wallet=walletFor(book,key);
 const [market,venue]=key.split(':') as [DemoMarket,AssistantExchange];
 const deposits=wallet.transfers.filter(t=>t.kind==='DEPOSIT').reduce((n,t)=>n+t.cents,0)/100;
 const withdrawals=wallet.transfers.filter(t=>t.kind==='WITHDRAW').reduce((n,t)=>n+t.cents,0)/100;
 let gross=0,closed=0,partial=0,excluded=0;
 if(market==='futures'){
  const offsets=new Map(wallet.basis.map(b=>[b.ticketId,b.valueUSDT]));
  for(const t of ledger.tickets){
   if(t.plan.source!==venue)continue;
   const prior=offsets.get(t.id);
   if(t.createdAt<wallet.startedAt&&prior===undefined)continue; // old closed history omitted
   const total=recognizedFutureGross(t);
   const delta=total-(prior??0);
   if(Number.isFinite(delta))gross+=delta;
   const verified=t.state==='CLOSED'&&t.quality==='OK'&&t.remainingPct===0&&
    t.events.some(e=>e.type==='STOP'||e.type==='COMPLETED');
   if(verified)closed++;
   else if(t.tpReached>0)partial++;
   if(t.state==='CLOSED'&&!verified)excluded++;
  }
 }
 gross=round6(gross);
 const netAdded=round6(deposits-withdrawals);
 return {key,market,venue,startedAt:wallet.startedAt,
  depositsUSDT:deposits,withdrawalsUSDT:withdrawals,netAddedUSDT:netAdded,
  realizedGrossUSDT:gross,balanceUSDT:round6(netAdded+gross),
  closedCount:closed,partialCount:partial,excludedCount:excluded,
  transferCount:wallet.transfers.length,hasProfitModel:market==='futures',
  note:market==='futures'?
   'Условный валовый результат подтверждённых TP и завершений. Не включает комиссии, funding, проскальзывание, ликвидацию и неизвестный результат ручного выхода.':
   'Spot DEMO не сохраняет размер позиции в USDT, поэтому результат стратегии в деньгах не рассчитывается.'};
}
/** Strict locale-decimal parser: 0.01..100000 USDT in cents.
 * Invalid, zero, negative and >2-decimal entries are rejected; no NaN.
 */
export function parseDemoCashAmount(text:string):number|null{
 const s=text.trim().replace(',','.');
 if(!/^(?:\d{1,6})(?:\.\d{1,2})?$/.test(s))return null;
 const cents=Math.round(Number(s)*100);
 return Number.isSafeInteger(cents)&&cents>=1&&cents<=MAX_CENTS?cents:null;
}
export function transferDemoCash(book:DemoWalletBook,key:DemoAccountKey,kind:DemoCashKind,
 value:string,ledger:FutureLedger,now=Date.now()):DemoWalletBook{
 if(!WALLET_KEYS.includes(key)||!['DEPOSIT','WITHDRAW'].includes(kind)||!validAt(now,now))
  throw Error('Неправильные настройки виртуальной операции.');
 const cents=parseDemoCashAmount(value),wallet=book.wallets[key];
 if(!wallet||cents===null||now<wallet.startedAt)throw Error('Укажи сумму от 0,01 до 100 000 USDT (не более двух знаков после запятой).');
 if(wallet.transfers.length>=MAX_RECEIPTS)throw Error('Лимит журнала счёта. Сохранённые записи нельзя удалять автоматически.');
 if(kind==='WITHDRAW'&&cents>Math.floor(reportDemoWallet(book,key,ledger).balanceUSDT*100+1e-7))
  throw Error('Списание превышает доступный виртуальный баланс.');
 const id='cash:'+key+':'+now+':'+wallet.transfers.length;
 const transfer:DemoCashTransfer={id,at:now,kind,cents};
 const next:DemoWalletBook={...book,wallets:{
  ...book.wallets,[key]:{...wallet,transfers:[...wallet.transfers,transfer]}
 }};
 if(!restoreDemoWallets(JSON.stringify(next),now))throw Error('Новый журнал счёта не прошёл проверку.');
 return next;
}
