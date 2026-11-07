/** APEX 7.5: dynamic favorites-only public Futures DEMO watch, never a trading API.
 * The existing Radar favorites are the single source of symbols. A bounded rotating
 * batch avoids flooding public REST endpoints while keeping a finite phone workload.
 */
import type {AssistantExchange,AssistantFrame} from './demo-assistant';
import type {FutureBar} from './v64-futures-market';
import {deriveFuturesStudyPlan,type FutureLedger,type FuturePlan} from './v64-futures-assistant';
export const FAVORITE_BATCH_SIZE=4,MAX_FAVORITE_FEED_KEYS=10;
export function normalizeFavoriteSymbol(input:unknown):string|null{
 if(typeof input!=='string')return null;
 const s=input.trim().toUpperCase();
 // Coin migrated in 2026; normalize NEW research requests but never rewrite old tickets.
 const renamed=s==='TONUSDT'?'GRAMUSDT':s;
 return /^[A-Z0-9]{2,20}USDT$/.test(renamed)?renamed:null;
}
export function futuresFavoriteUniverse(favorites:readonly string[]):string[]{
 const result:string[]=[];const seen=new Set<string>();
 for(const raw of favorites){
  const symbol=normalizeFavoriteSymbol(raw);
  if(symbol&&!seen.has(symbol)){seen.add(symbol);result.push(symbol);}
 }
 return result;
}
export function favoriteBatch(universe:readonly string[],round:number,capacity=FAVORITE_BATCH_SIZE):string[]{
 const ordered=futuresFavoriteUniverse(universe);
 if(!ordered.length||!Number.isSafeInteger(round)||round<0||capacity<=0)return [];
 const count=Math.min(FAVORITE_BATCH_SIZE,capacity,ordered.length);
 const start=(round*FAVORITE_BATCH_SIZE)%ordered.length;
 return Array.from({length:count},(_,i)=>ordered[(start+i)%ordered.length]);
}
export function favoritesObserveKeys(source:AssistantExchange,frame:AssistantFrame,
 selectedSymbol:string,favorites:readonly string[],round:number,isAutoMulti:boolean,
 isAssistant:boolean,ledger:FutureLedger):string[]{
 const existing=ledger.tickets.filter(t=>t.state==='OPEN'||t.state==='WAITING')
  .map(t=>t.plan.source+':'+t.plan.symbol+':'+t.plan.frame);
 const ui=isAssistant?[source+':'+selectedSymbol+':'+frame]:[];
 const base=[...new Set([...existing,...ui])].slice(0,MAX_FAVORITE_FEED_KEYS);
 const budget=Math.max(0,MAX_FAVORITE_FEED_KEYS-base.length);
 if(!isAutoMulti||budget===0)return base;
 const keys=favoriteBatch(favorites,round,budget).map(s=>source+':'+s+':'+frame);
 return [...new Set([...base,...keys])].slice(0,MAX_FAVORITE_FEED_KEYS);
}
export function deriveFavoritePlans(source:AssistantExchange,frame:AssistantFrame,
 favorites:readonly string[],round:number,bars:Record<string,FutureBar[]>,now=Date.now()):FuturePlan[]{
 const batch=favoriteBatch(favorites,round);
 const plans:FuturePlan[]=[];
 for(const symbol of batch){
  const plan=deriveFuturesStudyPlan(source,symbol,frame,bars[source+':'+symbol+':'+frame]||[],now);
  if(plan&&plan.expiresAt>now)plans.push(plan);
 }
 return plans;
}
export type FavoriteFeedRow={symbol:string;state:'SIGNAL'|'OBSERVING'|'NO_DATA'|'STALE';lastBarAt:number|null;virtualPlans:number};
export function favoriteFeedOverview(source:AssistantExchange,frame:AssistantFrame,
 favorites:readonly string[],bars:Record<string,FutureBar[]>,ledger:FutureLedger,
 now=Date.now()):FavoriteFeedRow[]{
 const ms=frame==='5m'?300000:frame==='1h'?3600000:14400000;
 return futuresFavoriteUniverse(favorites).map(symbol=>{
  const sourceBars=bars[source+':'+symbol+':'+frame]||[];
  const last=sourceBars.at(-1),lastBarAt=last?last.time+ms:null;
  const fresh=lastBarAt!==null&&now-lastBarAt>=0&&now-lastBarAt<=ms*1.5;
  const plan=fresh?deriveFuturesStudyPlan(source,symbol,frame,sourceBars,now):null;
  const virtualPlans=ledger.tickets.filter(t=>t.plan.source===source&&t.plan.symbol===symbol).length;
  return {symbol,lastBarAt,virtualPlans,state:!last?'NO_DATA':!fresh?'STALE':plan?'SIGNAL':'OBSERVING'};
 });
}
