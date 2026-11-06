/** APEX 4.2 independent CORE observation audit. No synthetic backfill.
 * A checked minute means one active-app observation, NOT a whole minute of streaming.
 */
import {CORE_SYMBOLS} from './research-core';
import type {MarketPulse} from './market-pulse';
const MINUTE=60_000, RETAIN=2_880, WINDOW=1_440;
export type CoreObservation={symbol:string;lastTick:number;framesReady:boolean};
export type CoreCoverageSample={minute:number;fresh:number;ready:number};
export type CoreCoverage={version:1;startedAt:number;samples:CoreCoverageSample[]};
export type CoreCoverageReport={
 expectedSlots:number;observedSlots:number;missingSlots:number;freshSlots:number;readySlots:number;
 observedPct:number;readyPct:number;readyAmongObservedPct:number|null;lastAt:number|null;
};
const finite=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v);
const validSample=(x:unknown):x is CoreCoverageSample=>{
 if(!x||typeof x!=='object'||Array.isArray(x))return false;
 const s=x as Partial<CoreCoverageSample>;
 return Number.isSafeInteger(s.minute)&&Number.isInteger(s.fresh)&&Number.isInteger(s.ready)&&
  typeof s.fresh==='number'&&typeof s.ready==='number'&&
  s.ready>=0&&s.fresh>=s.ready&&s.fresh<=CORE_SYMBOLS.length;
};
export function openCoreCoverage(raw:string|null,now=Date.now()):CoreCoverage{
 const fresh={version:1 as const,startedAt:now,samples:[] as CoreCoverageSample[]};
 if(!finite(now)||now<0)return {version:1,startedAt:0,samples:[]};
 try{
  const x=JSON.parse(raw||'null') as CoreCoverage;
  if(x?.version!==1||!finite(x.startedAt)||x.startedAt<0||x.startedAt>now+MINUTE||!Array.isArray(x.samples))return fresh;
  const minute=Math.floor(now/MINUTE);
  const byMinute=new Map<number,CoreCoverageSample>();
  for(const s of x.samples.slice(-RETAIN*2)){
   if(validSample(s)&&s.minute>=minute-RETAIN+1&&s.minute<=minute)byMinute.set(s.minute,s);
  }
  return {version:1,startedAt:x.startedAt,samples:[...byMinute.values()].sort((a,b)=>a.minute-b.minute).slice(-RETAIN)};
 }catch{return fresh;}
}
/** UTC-minute slots are logged only when the app is visible and actively executing. */
export function recordCoreCoverage(old:CoreCoverage,observations:CoreObservation[],now=Date.now()):CoreCoverage{
 if(!old||old.version!==1||!finite(now)||now<old.startedAt)return old;
 const minute=Math.floor(now/MINUTE);
 const unique=new Map<string,CoreObservation>();
 for(const o of observations||[])if(o&&CORE_SYMBOLS.some(symbol=>symbol===o.symbol))unique.set(o.symbol,o);
 let fresh=0,ready=0;
 for(const symbol of CORE_SYMBOLS){
  const o=unique.get(symbol);
  const age=o?now-o.lastTick:Infinity;
  if(!o||!finite(o.lastTick)||o.lastTick<=0||age<0||age>120_000)continue;
  fresh++;
  if(o.framesReady===true)ready++;
 }
 const next={minute,fresh,ready};
 const rows=old.samples.filter(s=>s.minute>=minute-RETAIN+1&&s.minute<minute);
 const last=old.samples.find(s=>s.minute===minute);
 if(last&&last.fresh===fresh&&last.ready===ready&&rows.length+1===old.samples.length)return old;
 rows.push(next);
 return {...old,samples:rows.slice(-RETAIN)};
}
export function coreCoverageReport(ledger:CoreCoverage,now=Date.now()):CoreCoverageReport{
 const empty={expectedSlots:0,observedSlots:0,missingSlots:0,freshSlots:0,readySlots:0,
  observedPct:0,readyPct:0,readyAmongObservedPct:null,lastAt:null} as CoreCoverageReport;
 if(!ledger||ledger.version!==1||!finite(now)||now<ledger.startedAt)return empty;
 const current=Math.floor(now/MINUTE);
 const initial=Math.floor(ledger.startedAt/MINUTE);
 const expectedSlots=Math.min(WINDOW,Math.max(0,current-initial+1));
 const start=Math.max(initial,current-WINDOW+1);
 const unique=new Map<number,CoreCoverageSample>();
 for(const s of ledger.samples)if(validSample(s)&&s.minute>=start&&s.minute<=current)unique.set(s.minute,s);
 const samples=[...unique.values()];
 const observedSlots=samples.length;
 const freshSlots=samples.filter(s=>s.fresh===CORE_SYMBOLS.length).length;
 const readySlots=samples.filter(s=>s.ready===CORE_SYMBOLS.length).length;
 const pct=(a:number,b:number)=>b>0?Math.round(1000*a/b)/10:0;
 return {expectedSlots,observedSlots,missingSlots:Math.max(0,expectedSlots-observedSlots),
  freshSlots,readySlots,observedPct:pct(observedSlots,expectedSlots),
  readyPct:pct(readySlots,expectedSlots),readyAmongObservedPct:observedSlots?pct(readySlots,observedSlots):null,
  lastAt:samples.length?Math.max(...samples.map(s=>s.minute))*MINUTE:null};
}
/** Only a fixed five-symbol, three-frame complete Pulse may enter the research classification. */
export function strictCorePulse(pulse:MarketPulse):MarketPulse|undefined{
 if(!pulse||pulse.watched!==CORE_SYMBOLS.length||pulse.eligible!==CORE_SYMBOLS.length||
  !Array.isArray(pulse.assets)||pulse.assets.length!==CORE_SYMBOLS.length)return undefined;
 const seen=new Set(pulse.assets.map(a=>a.symbol));
 if(CORE_SYMBOLS.some(symbol=>!seen.has(symbol))||
  pulse.assets.some(a=>a.category==='unavailable'||a.verifiedFrames!==3))return undefined;
 return pulse;
}
