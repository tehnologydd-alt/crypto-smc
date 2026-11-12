/**
 * APEX comparative visible Spot depth: present only truly matched snapshots.
 * Equal 50-level REST budgets do not replace equal price-band checks.
 * Read-only, no API calls and no persistence in this module.
 */
import {synchronizeSpotDepth} from './depth-synchronization.mjs';

const VENUES=['binance','okx'];
function pair(books,asset){
 return VENUES.map(venue=>(Array.isArray(books)?books:[]).find(b=>
  b?.venue===venue&&b.symbol===asset)).filter(Boolean);
}
export function selectDepthComparison(activeBooks,restBooks,{asset,now=Date.now()}={}){
 const current=synchronizeSpotDepth(pair(activeBooks,asset),{asset,now});
 if(current.state==='SYNCED')
  return {comparison:current,method:'CURRENT',levelsEqual:false};
 const rest=pair(restBooks,asset);
 // Never use a stale or single source to backfill a 'matched' pair.
 if(rest.length!==2)return {comparison:current,method:'CURRENT',levelsEqual:false};
 const fallback=synchronizeSpotDepth(rest,{asset,now});
 if(fallback.state!=='SYNCED')
  return {comparison:current,method:'CURRENT',levelsEqual:false};
 const levelsEqual=rest.every(b=>b?.collectionMethod==='PUBLIC_REST_BOOK_SNAPSHOT'&&
  b.snapshotLevelsMax===50);
 return {comparison:fallback,method:'PAIRED_REST',levelsEqual};
}
export function needsMatchedRest(availableBooks,{asset,now=Date.now(),due={}}={}){
 // Both REST slots must be due independently; no extra requests beyond
 // existing per-provider rate limits. A live WS + REST mix, or a missing WS,
 // must NOT block acquiring a same-depth 50/50 comparison pair.
 if(due.binance!==true||due.okx!==true)return false;
 if(!Array.isArray(availableBooks)||
  availableBooks.some(b=>b&&b.symbol!==asset))return false;
 const current=pair(availableBooks,asset);
 return synchronizeSpotDepth(current,{asset,now}).state!=='SYNCED';
}
