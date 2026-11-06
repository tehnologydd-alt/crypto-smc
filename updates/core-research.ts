/** APEX 4.4: durable, prospective research of actual native CORE observations.
 * Separate from Learning/scenario outcomes. Never interpolates missed checks.
 * UTC days; duplicate runs immutable, not silently revised.
 */
import {CORE_SYMBOLS} from './research-core';
import type {CoreNativeSample,CoreNativeBar} from './core-background';
export const RESEARCH_SOURCE='binance-spot-klines-v1';
export const STUDY_VERSION='core-native-observations-v1';
export type CoreDirection='up'|'down'|'mixed'|'unavailable';
export type CoreFrameEvidence={frame:'5m'|'1h'|'4h';closedAt:number;changePct:number;relativeVolume:number|null};
export type CoreAssetEvidence={symbol:string;ready:boolean;direction:CoreDirection;frames:CoreFrameEvidence[]};
export type CoreResearchEntry={
 runAt:number;finishedAt:number;source:typeof STUDY_VERSION;complete:boolean;
 readyAssets:number;up:number;down:number;mixed:number;direction:'mostly-up'|'mostly-down'|'mixed'|'insufficient';
 assets:CoreAssetEvidence[];
};
export type CoreResearchArchive={version:1;startedAt:number;entries:CoreResearchEntry[]};
export type CoreResearchDay={day:string;checks:number;complete:number;up:number;down:number;mixed:number};
export type CoreResearchReport={
 checks:number;complete:number;partial:number;latestAt:number|null;latestFullAt:number|null;
 observedDays:number;maxGapMinutes:number|null;lastDirection:CoreResearchEntry['direction']|null;
 days:CoreResearchDay[];
};
const DAY=86_400_000,RETAIN=14*DAY,MAX=1_200;
const finite=(x:unknown):x is number=>typeof x==='number'&&Number.isFinite(x);
const validFrame=(f:CoreNativeBar,finishedAt:number):boolean=>
 !!f&&['5m','1h','4h'].includes(f.frame)&&f.fresh===true&&
 [f.closedAt,f.open,f.high,f.low,f.close,f.volume,f.rangeHigh,f.rangeLow,f.meanVolume].every(finite)&&
 f.closedAt>0&&f.closedAt<=finishedAt&&f.open>0&&f.close>0&&f.high>=f.low&&
 f.volume>=0&&f.rangeHigh>f.rangeLow&&f.meanVolume>=0;
const isDirection=(x:unknown):x is CoreDirection=>['up','down','mixed','unavailable'].includes(String(x));
const isEntry=(x:unknown,now:number):x is CoreResearchEntry=>{
 if(!x||typeof x!=='object'||Array.isArray(x))return false;
 const e=x as Partial<CoreResearchEntry>;
 if(!finite(e.runAt)||!finite(e.finishedAt)||e.runAt<0||e.runAt>e.finishedAt||
  e.finishedAt>now+60_000||e.finishedAt<now-RETAIN||
  e.source!==STUDY_VERSION||typeof e.complete!=='boolean'||!Number.isInteger(e.readyAssets)||
  !Number.isInteger(e.up)||!Number.isInteger(e.down)||!Number.isInteger(e.mixed)||
  !['mostly-up','mostly-down','mixed','insufficient'].includes(String(e.direction))||
  !Array.isArray(e.assets)||e.assets.length>CORE_SYMBOLS.length)return false;
 const seen=new Set<string>();
 for(const a of e.assets){
  if(!a||!CORE_SYMBOLS.some(s=>s===a.symbol)||seen.has(a.symbol)||typeof a.ready!=='boolean'||
   !isDirection(a.direction)||!Array.isArray(a.frames)||a.frames.length>3)return false;
  seen.add(a.symbol);
  const frames=new Set<string>();
  for(const f of a.frames){
   if(!f||!['5m','1h','4h'].includes(f.frame)||frames.has(f.frame)||
    !finite(f.closedAt)||f.closedAt<1||f.closedAt>e.finishedAt||
    !finite(f.changePct)||Math.abs(f.changePct)>1_000_000||
    !(f.relativeVolume===null||(finite(f.relativeVolume)&&f.relativeVolume>=0)))return false;
   frames.add(f.frame);
  }
  if(a.ready&&(a.frames.length!==3||a.direction==='unavailable'))return false;
 }
 return e.readyAssets!>=0&&e.readyAssets!<=CORE_SYMBOLS.length&&e.up!>=0&&e.down!>=0&&e.mixed!>=0&&
  e.up!+e.down!+e.mixed!<=e.readyAssets!&&
  (e.complete?e.readyAssets===CORE_SYMBOLS.length&&e.assets.length===CORE_SYMBOLS.length:true);
};
export function openCoreResearch(raw:string|null,now=Date.now()):CoreResearchArchive{
 const fresh:CoreResearchArchive={version:1,startedAt:now,entries:[]};
 if(!finite(now)||now<0)return {version:1,startedAt:0,entries:[]};
 try{
  const x=JSON.parse(raw||'null') as CoreResearchArchive;
  if(x?.version!==1||!finite(x.startedAt)||x.startedAt<0||x.startedAt>now+60_000||!Array.isArray(x.entries))return fresh;
  const seen=new Map<number,CoreResearchEntry>();
  for(const e of x.entries.slice(-MAX*2))if(isEntry(e,now)&&!seen.has(e.runAt))seen.set(e.runAt,e);
  return {version:1,startedAt:x.startedAt,entries:[...seen.values()].sort((a,b)=>a.runAt-b.runAt).slice(-MAX)};
 }catch{return fresh;}
}
export function normalizeCoreNative(sample:CoreNativeSample,now=Date.now()):CoreResearchEntry|null{
 if(!sample||sample.source!==RESEARCH_SOURCE||!finite(sample.runAt)||!finite(sample.finishedAt)||
  sample.runAt<1||sample.runAt>sample.finishedAt||sample.finishedAt>now+60_000||
  sample.finishedAt<now-RETAIN||!Array.isArray(sample.assets)||sample.assets.length>5)return null;
 const seen=new Set<string>(),assets:CoreAssetEvidence[]=[];
 for(const a of sample.assets){
  if(!a||!CORE_SYMBOLS.some(s=>s===a.symbol)||seen.has(a.symbol)||!Array.isArray(a.frames))return null;
  seen.add(a.symbol);
  const frames:CoreFrameEvidence[]=[];
  const unique=new Set<string>();
  for(const f of a.frames){
   if(!f||unique.has(f.frame))return null;
   unique.add(f.frame);
   if(!validFrame(f,sample.finishedAt))continue;
   const changePct=Math.round(10000*(f.close/f.open-1))/100;
   if(!finite(changePct))continue;
   const relativeVolume=f.meanVolume>0?Math.round(100*f.volume/f.meanVolume)/100:null;
   frames.push({frame:f.frame,closedAt:f.closedAt,changePct,relativeVolume:finite(relativeVolume)?relativeVolume:null});
  }
  const ready=a.ready===true&&frames.length===3;
  const votes=frames.map(f=>f.changePct>0?'up':f.changePct<0?'down':'mixed');
  const direction:CoreDirection=!ready?'unavailable':
   votes.every(v=>v==='up')?'up':votes.every(v=>v==='down')?'down':'mixed';
  assets.push({symbol:a.symbol,ready,direction,frames});
 }
 const readyAssets=assets.filter(a=>a.ready).length;
 const complete=assets.length===CORE_SYMBOLS.length&&readyAssets===CORE_SYMBOLS.length;
 const up=assets.filter(a=>a.direction==='up').length,down=assets.filter(a=>a.direction==='down').length;
 const mixed=assets.filter(a=>a.direction==='mixed').length;
 const direction:CoreResearchEntry['direction']=!complete?'insufficient':up>=4?'mostly-up':down>=4?'mostly-down':'mixed';
 return {runAt:sample.runAt,finishedAt:sample.finishedAt,source:STUDY_VERSION,complete,
  readyAssets,up,down,mixed,direction,assets};
}
/** Exact timestamp dedupe. The first accepted observation is immutable. */
export function appendCoreResearch(old:CoreResearchArchive,samples:CoreNativeSample[],now=Date.now()):CoreResearchArchive{
 if(!old||old.version!==1||!finite(now)||now<old.startedAt||!Array.isArray(samples))return old;
 const kept=old.entries.filter(e=>isEntry(e,now));
 const seen=new Map(kept.map(e=>[e.runAt,e] as const));
 for(const s of samples){
  const e=normalizeCoreNative(s,now);
  if(e&&!seen.has(e.runAt))seen.set(e.runAt,e);
 }
 const entries=[...seen.values()].sort((a,b)=>a.runAt-b.runAt).slice(-MAX);
 if(entries.length===old.entries.length&&entries.every((e,i)=>e===old.entries[i]))return old;
 return {...old,entries};
}
export function coreResearchReport(archive:CoreResearchArchive,now=Date.now()):CoreResearchReport{
 const empty:CoreResearchReport={checks:0,complete:0,partial:0,latestAt:null,latestFullAt:null,
  observedDays:0,maxGapMinutes:null,lastDirection:null,days:[]};
 if(!archive||archive.version!==1||!finite(now))return empty;
 const entries=archive.entries.filter(e=>isEntry(e,now)).sort((a,b)=>a.runAt-b.runAt);
 const checks=entries.length,complete=entries.filter(e=>e.complete).length;
 const dayKey=(time:number)=>new Date(time).toISOString().slice(0,10);
 const byDay=new Map<string,CoreResearchDay>();
 for(const e of entries){
  const key=dayKey(e.finishedAt);
  let day=byDay.get(key);
  if(!day){day={day:key,checks:0,complete:0,up:0,down:0,mixed:0};byDay.set(key,day);}
  day.checks++;if(e.complete)day.complete++;
  if(e.direction==='mostly-up')day.up++;
  else if(e.direction==='mostly-down')day.down++;
  else if(e.direction==='mixed')day.mixed++;
 }
 const start=Date.UTC(new Date(now).getUTCFullYear(),new Date(now).getUTCMonth(),new Date(now).getUTCDate());
 const days:CoreResearchDay[]=[];
 for(let i=6;i>=0;i--){
  const key=dayKey(start-i*DAY);
  days.push(byDay.get(key)||{day:key,checks:0,complete:0,up:0,down:0,mixed:0});
 }
 let maxGapMinutes:number|null=null;
 for(let i=1;i<entries.length;i++){
  const gap=(entries[i].runAt-entries[i-1].runAt)/60_000;
  if(maxGapMinutes===null||gap>maxGapMinutes)maxGapMinutes=Math.round(gap);
 }
 const last=entries.at(-1),latestFull=entries.filter(e=>e.complete).at(-1);
 return {checks,complete,partial:checks-complete,latestAt:last?.finishedAt??null,
  latestFullAt:latestFull?.finishedAt??null,observedDays:byDay.size,maxGapMinutes,
  lastDirection:latestFull?.direction??null,days};
}
