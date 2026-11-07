/** APEX 7.4 — bounded MULTI-SYMBOL educational Futures DEMO observation.
 * No brokerage account, real orders, keys, margin transfer or trade endpoints.
 * Keep automatic virtual tickets source-specific; never infer missing candles.
 */
import type {AssistantExchange,AssistantFrame} from './demo-assistant';
import type {FutureBar} from './v64-futures-market';
import {deriveFuturesStudyPlan,enrollFutureTicket,type FutureLedger,type FutureSetup,type FuturePlan} from './v64-futures-assistant';
export type FuturesScope='single'|'multi';
export const FUTURES_DEMO_SYMBOLS=['BTCUSDT','ETHUSDT','SOLUSDT','XRPUSDT','TONUSDT','ADAUSDT','BNBUSDT','DOGEUSDT'] as const;
export const DEFAULT_MULTI_SYMBOLS=['BTCUSDT','ETHUSDT','SOLUSDT'];
export const MAX_MULTI_SYMBOLS=4,MAX_FUTURES_OBSERVE_KEYS=10;
const known=new Set<string>(FUTURES_DEMO_SYMBOLS);
export function restoreDemoSymbols(raw:string|null):string[]{
 if(raw===null)return [...DEFAULT_MULTI_SYMBOLS];
 try{
  const x=JSON.parse(raw) as unknown;
  if(!Array.isArray(x))return [...DEFAULT_MULTI_SYMBOLS];
  const valid=x.filter((v):v is string=>typeof v==='string'&&known.has(v));
  const unique=[...new Set(valid)].slice(0,MAX_MULTI_SYMBOLS);
  return unique.length?unique:[...DEFAULT_MULTI_SYMBOLS];
 }catch{return [...DEFAULT_MULTI_SYMBOLS];}
}
export function toggleDemoSymbol(current:string[],symbol:string):string[]{
 if(!known.has(symbol))return current;
 const unique=[...new Set(current.filter(s=>known.has(s)))].slice(0,MAX_MULTI_SYMBOLS);
 if(unique.includes(symbol))return unique.length<=1?unique:unique.filter(s=>s!==symbol);
 return unique.length>=MAX_MULTI_SYMBOLS?unique:[...unique,symbol];
}
export function multiDemoKeys(source:AssistantExchange,frame:AssistantFrame,scope:FuturesScope,
 selectedSymbol:string,symbols:string[],isAuto:boolean,isAssistant:boolean,ledger:FutureLedger):string[]{
 const existing=ledger.tickets.filter(o=>o.state==='WAITING'||o.state==='OPEN')
  .map(o=>o.plan.source+':'+o.plan.symbol+':'+o.plan.frame);
 const ui=isAssistant?[source+':'+selectedSymbol+':'+frame]:[];
 const watch=scope==='multi'&&isAuto?
  symbols.filter(s=>known.has(s)).slice(0,MAX_MULTI_SYMBOLS).map(s=>source+':'+s+':'+frame):[];
 return [...new Set([...existing,...watch,...ui])].slice(0,MAX_FUTURES_OBSERVE_KEYS);
}
export function deriveMultiDemoPlans(source:AssistantExchange,frame:AssistantFrame,
 selectedSymbols:string[],bars:Record<string,FutureBar[]>,now=Date.now()):FuturePlan[]{
 const list=[...new Set(selectedSymbols.filter(s=>known.has(s)))].slice(0,MAX_MULTI_SYMBOLS);
 return list.map(symbol=>deriveFuturesStudyPlan(source,symbol,frame,
  bars[source+':'+symbol+':'+frame]||[],now))
  .filter((p):p is FuturePlan=>p!==null&&p.expiresAt>now);
}
export function enrollMultiDemoPlans(old:FutureLedger,plans:FuturePlan[],setup:FutureSetup,
 now=Date.now()):FutureLedger{
 let next=old;
 for(const plan of plans.slice(0,MAX_MULTI_SYMBOLS)){
  if(plan.source!==setup.exchange||plan.expiresAt<=now||plan.createdAt>now)continue;
  // Uses the existing one-signal-one-ID, global six-active, one-way conflict checks.
  next=enrollFutureTicket(next,plan,setup,'auto',now);
 }
 return next;
}
