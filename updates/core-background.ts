/** APEX 4.3: independent CORE background study, Android only.
 * Samples are observations of CLOSED public exchange candles, never paper trade results.
 */
import {Capacitor,registerPlugin} from '@capacitor/core';
import {CORE_SYMBOLS} from './research-core';
export type CoreNativeBar={frame:'5m'|'1h'|'4h';closedAt:number;open:number;high:number;low:number;close:number;volume:number;fresh:boolean;rangeHigh:number;rangeLow:number;meanVolume:number};
export type CoreNativeAsset={symbol:string;frames:CoreNativeBar[];ready:boolean};
export type CoreNativeSample={runAt:number;finishedAt:number;assets:CoreNativeAsset[];readyAssets:number;complete:boolean;source:'binance-spot-klines-v1'};
export type CoreNativeState={supported:boolean;enabled:boolean;intervalMinutes:number;lastRunAt:number;lastResult:string;samples:CoreNativeSample[]};
const EMPTY:CoreNativeState={supported:false,enabled:false,intervalMinutes:15,lastRunAt:0,lastResult:'Android недоступен',samples:[]};
interface CoreNativePlugin{
 configureCore(options:{enabled:boolean}):Promise<unknown>;
 coreStatus():Promise<unknown>;
 runCoreNow():Promise<unknown>;
}
const plugin=registerPlugin<CoreNativePlugin>('BackgroundMonitor');
const finite=(x:unknown):x is number=>typeof x==='number'&&Number.isFinite(x);
const frames=new Set(['5m','1h','4h']);
function cleanFrame(raw:unknown):CoreNativeBar|null{
 if(!raw||typeof raw!=='object')return null;
 const x=raw as Partial<CoreNativeBar>;
 if(!frames.has(String(x.frame))||!finite(x.closedAt)||x.closedAt<1||
  ![x.open,x.high,x.low,x.close,x.volume,x.rangeHigh,x.rangeLow,x.meanVolume].every(finite)||
  !(x.open!>0&&x.close!>0&&x.low!>0&&x.high!>=x.low!&&x.volume!>=0&&x.rangeHigh!>=x.rangeLow!&&x.meanVolume!>=0))
  return null;
 return {...x,frame:x.frame!,closedAt:x.closedAt,open:x.open!,high:x.high!,low:x.low!,close:x.close!,
   volume:x.volume!,rangeHigh:x.rangeHigh!,rangeLow:x.rangeLow!,meanVolume:x.meanVolume!,fresh:x.fresh===true};
}
export function parseCoreNative(raw:unknown,native=true):CoreNativeState{
 if(!native)return EMPTY;
 if(!raw||typeof raw!=='object')return {...EMPTY,supported:true,lastResult:'Нет сведений от Android'};
 const x=raw as Record<string,unknown>;
 const samples:CoreNativeSample[]=[];
 if(Array.isArray(x.samples)){
  for(const s of x.samples.slice(-96)){
   if(!s||typeof s!=='object')continue;
   const v=s as Record<string,unknown>;
   if(!finite(v.runAt)||!finite(v.finishedAt)||v.finishedAt<v.runAt||
      v.source!=='binance-spot-klines-v1'||!Array.isArray(v.assets))continue;
   const assets:CoreNativeAsset[]=[];
   for(const a of v.assets){
    if(!a||typeof a!=='object')continue;
    const p=a as Record<string,unknown>;
    if(typeof p.symbol!=='string'||!CORE_SYMBOLS.some(s=>s===p.symbol)||!Array.isArray(p.frames))continue;
    const fs=p.frames.map(cleanFrame).filter((y):y is CoreNativeBar=>y!==null);
    assets.push({symbol:p.symbol,frames:fs,ready:p.ready===true&&fs.length===3&&fs.every(f=>f.fresh)&&new Set(fs.map(f=>f.frame)).size===3});
   }
   const complete=assets.length===CORE_SYMBOLS.length&&new Set(assets.map(a=>a.symbol)).size===CORE_SYMBOLS.length&&assets.every(a=>a.ready);
   samples.push({runAt:v.runAt,finishedAt:v.finishedAt,assets,readyAssets:assets.filter(a=>a.ready).length,complete,source:'binance-spot-klines-v1'});
  }
 }
 return {supported:true,enabled:x.enabled===true,intervalMinutes:15,
  lastRunAt:finite(x.lastRunAt)&&x.lastRunAt>0?x.lastRunAt:0,
  lastResult:typeof x.lastResult==='string'?x.lastResult.slice(0,220):'Нет результатов',
  samples:samples.sort((a,b)=>a.runAt-b.runAt)};
}
export async function getCoreNativeStatus():Promise<CoreNativeState>{
 if(!Capacitor.isNativePlatform())return EMPTY;
 return parseCoreNative(await plugin.coreStatus());
}
export async function configureCoreNative(enabled:boolean):Promise<CoreNativeState>{
 if(!Capacitor.isNativePlatform())return EMPTY;
 await plugin.configureCore({enabled});
 return getCoreNativeStatus();
}
export async function requestCoreCheck():Promise<void>{
 if(!Capacitor.isNativePlatform())throw Error('Доступно только на Android');
 await plugin.runCoreNow();
}
