/** APEX 7.6: choose up to FOUR Radar-favorite symbols and Binance/Bybit/BOTH
 * for independent, automatic Futures DEMO observation (never real trading).
 * One candle belongs to one source; missing source data is never copied.
 */
import type {AssistantExchange,AssistantFrame} from './demo-assistant';
import type {FutureBar} from './v64-futures-market';
import type {FutureLedger,FutureSetup,FuturePlan} from './v64-futures-assistant';
import {enrollMultiDemoPlans} from './v74-multi-demo';
import {futuresFavoriteUniverse,deriveFavoritePlans,favoriteFeedOverview} from './v75-favorites-research';

export type DemoVenueChoice='binance'|'bybit'|'both';
export const MAX_SELECTED_FAVORITES=4,MAX_MONITOR_KEYS=10;
export function restoreSelectedFavorites(raw:string|null):string[]|null{
 if(raw===null)return null; // migration: pick first four existing favorites
 try{
  const x=JSON.parse(raw) as unknown;
  if(!Array.isArray(x))return null;
  return futuresFavoriteUniverse(x.filter(v=>typeof v==='string')).slice(0,MAX_SELECTED_FAVORITES);
 }catch{return null;}
}
export function chosenFavorites(favorites:readonly string[],saved:readonly string[]|null):string[]{
 const universe=futuresFavoriteUniverse(favorites);
 return saved===null?universe.slice(0,MAX_SELECTED_FAVORITES):
  futuresFavoriteUniverse(saved).filter(x=>universe.includes(x)).slice(0,MAX_SELECTED_FAVORITES);
}
export function toggleFavoriteChoice(favorites:readonly string[],saved:readonly string[]|null,
 symbol:string):string[]{
 const valid=futuresFavoriteUniverse(favorites);
 if(!valid.includes(symbol))return chosenFavorites(valid,saved);
 const old=chosenFavorites(valid,saved);
 if(old.includes(symbol))return old.length===1?old:old.filter(x=>x!==symbol);
 return old.length===MAX_SELECTED_FAVORITES?old:[...old,symbol];
}
export function restoreDemoVenue(raw:string|null,fallback:AssistantExchange):DemoVenueChoice{
 return raw==='binance'||raw==='bybit'||raw==='both'?raw:fallback;
}
export const chosenVenues=(choice:DemoVenueChoice):AssistantExchange[]=>
 choice==='both'?['binance','bybit']:[choice];
/** Prioritize active simulated positions. Then selected visible UI pair.
 * With 4 x 2 markets there are normally eight source-specific feeds.
 * If active tickets exceed budget rotate remaining requests fairly.
 */
export function chosenMonitorKeys(choice:DemoVenueChoice,frame:AssistantFrame,
 uiSource:AssistantExchange,uiSymbol:string,selected:readonly string[],round:number,
 autoMulti:boolean,showFutures:boolean,ledger:FutureLedger):string[]{
 const existing=ledger.tickets.filter(t=>t.state==='OPEN'||t.state==='WAITING')
  .map(t=>t.plan.source+':'+t.plan.symbol+':'+t.plan.frame);
 const ui=showFutures?[uiSource+':'+uiSymbol+':'+frame]:[];
 const base=[...new Set([...existing,...ui])].slice(0,MAX_MONITOR_KEYS);
 if(!autoMulti)return base;
 const markets=chosenVenues(choice);
 const pool=chosenFavorites(selected,selected).flatMap(symbol=>markets.map(venue=>venue+':'+symbol+':'+frame));
 const remainder=pool.filter(k=>!base.includes(k));
 const space=MAX_MONITOR_KEYS-base.length;
 if(space<=0||!remainder.length)return base;
 const start=(Number.isSafeInteger(round)&&round>=0?round:0)%remainder.length;
 const rotated=Array.from({length:Math.min(space,remainder.length)},(_,i)=>remainder[(start+i)%remainder.length]);
 return [...base,...rotated];
}
export function plansForChosenVenues(choice:DemoVenueChoice,frame:AssistantFrame,
 selected:readonly string[],bars:Record<string,FutureBar[]>,now=Date.now()):FuturePlan[]{
 const picks=chosenFavorites(selected,selected);
 return chosenVenues(choice).flatMap(source=>deriveFavoritePlans(source,frame,picks,0,bars,now));
}
export function enrollChosenDemoPlans(old:FutureLedger,plans:FuturePlan[],
 setup:FutureSetup,now=Date.now()):FutureLedger{
 let next=old;
 // Preserve the two independent venue ledgers within the existing Futures DEMO
 // archive. Each ticket records its actual public-market source.
 // Fairly interleave pair/venue attempts. The existing six-active DEMO limit
 // is global; when both sources are enabled, one should not take all slots first.
 const ownSources=['binance','bybit'] as const;
 const pools=ownSources.map(source=>plans.filter(p=>p.source===source).slice(0,MAX_SELECTED_FAVORITES));
 for(let i=0;i<MAX_SELECTED_FAVORITES;i++){
  for(let j=0;j<ownSources.length;j++){
   const plan=pools[j][i];if(!plan)continue;
   next=enrollMultiDemoPlans(next,[plan],{...setup,exchange:ownSources[j]},now);
  }
 }
 return next;
}
export type ChosenFeedRow={source:AssistantExchange;symbol:string;
 state:'SIGNAL'|'OBSERVING'|'NO_DATA'|'STALE';lastBarAt:number|null;virtualPlans:number};
export function chosenFeedRows(choice:DemoVenueChoice,frame:AssistantFrame,selected:readonly string[],
 bars:Record<string,FutureBar[]>,ledger:FutureLedger,now=Date.now()):ChosenFeedRow[]{
 const picks=chosenFavorites(selected,selected);
 return chosenVenues(choice).flatMap(source=>
  favoriteFeedOverview(source,frame,picks,bars,ledger,now).map(x=>({source,...x})));
}
