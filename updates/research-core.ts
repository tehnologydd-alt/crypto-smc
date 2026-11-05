/** APEX 4.1 independent research cohort: fixed, versioned universe.
 * User favorites control visible radar and alerts, never this cohort's membership.
 */
import type {LearningLedger} from './learning';
export const CORE_ID='fixed-core-v1' as const;
export const CORE_SYMBOLS=['BTCUSDT','ETHUSDT','SOLUSDT','BNBUSDT','XRPUSDT'] as const;
const allowed=new Set<string>(CORE_SYMBOLS);
export function isCoreSymbol(symbol:string):boolean{return allowed.has(symbol);}
export function researchUniverse(favorites:string[]):string[]{
 const unique=new Set<string>(CORE_SYMBOLS);
 for(const symbol of favorites)if(typeof symbol==='string'&&symbol)unique.add(symbol);
 return [...unique];
}
/** Preserve all history in the vault, but expose only forward core records to new studies. */
export function coreLearning(ledger:LearningLedger):LearningLedger{
 const records=ledger.records.filter(r=>r.cohort===CORE_ID);
 return {version:1,startedAt:ledger.startedAt,records,
  ...(ledger.corePulseHoldout?{pulseHoldout:ledger.corePulseHoldout}:{})};
}
