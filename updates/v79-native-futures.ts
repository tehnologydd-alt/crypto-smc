/** APEX 7.9 — actual native WorkManager status for PUBLIC Futures DEMO
 * observational health. This bridge NEVER places or reconstructs orders.
 */
import {Capacitor,registerPlugin} from '@capacitor/core';
import type {AssistantExchange,AssistantFrame} from './demo-assistant';
import type {DemoVenueChoice} from './v76-scope-demo';

export type NativeFuturesCheckStatus='READY'|'GAP'|'STALE'|'NO_DATA'|'ERROR';
export type NativeFuturesCheck={
 source:AssistantExchange;symbol:string;frame:AssistantFrame;
 sourceVersion:string;checkedAt:number;lastClosedAt:number;barCount:number;gapCount:number;
 status:NativeFuturesCheckStatus;message:string;
};
export type NativeFuturesSample={
 startedAt:number;finishedAt:number;source:'public-futures-health-v1';
 venues:DemoVenueChoice;frame:AssistantFrame;selectedCount:number;
 checks:NativeFuturesCheck[];ready:number;problems:number;
};
export type NativeFuturesStatus={
 supported:boolean;enabled:boolean;scheduled:boolean;
 workState:string;checkedAt:number;lastRunAt:number;lastResult:string;
 symbols:string[];venues:DemoVenueChoice;frame:AssistantFrame;
 samples:NativeFuturesSample[];
};
export const EMPTY_NATIVE_FUTURES:NativeFuturesStatus={
 supported:false,enabled:false,scheduled:false,workState:'UNKNOWN',
 checkedAt:0,lastRunAt:0,lastResult:'Доступно только в Android',
 symbols:[],venues:'binance',frame:'5m',samples:[]
};
interface FuturesNativeBridge {
 configureFuturesStudy(args:{enabled:boolean;symbols:string[];venues:DemoVenueChoice;frame:AssistantFrame}):Promise<unknown>;
 futuresStudyStatus():Promise<unknown>;
 runFuturesStudyNow():Promise<{queued:boolean}>;
}
const native=registerPlugin<FuturesNativeBridge>('BackgroundMonitor');
const validTime=(n:unknown):n is number=>Number.isSafeInteger(n)&&Number(n)>=0;
const nonNeg=(n:unknown)=>Number.isSafeInteger(n)&&Number(n)>=0?Number(n):0;
const venues=(raw:unknown):DemoVenueChoice=>raw==='bybit'||raw==='both'?raw:'binance';
const frame=(raw:unknown):AssistantFrame=>raw==='1h'||raw==='4h'?raw:'5m';
const symbolOK=(s:unknown):s is string=>typeof s==='string'&&/^[A-Z0-9]{2,20}USDT$/.test(s);
const venueOK=(v:unknown)=>v==='binance'||v==='bybit'||v==='both';
function parseCheck(raw:unknown,finished:number):NativeFuturesCheck|null{
 if(!raw||typeof raw!=='object')return null;
 const x=raw as Record<string,unknown>;
 if((x.source!=='binance'&&x.source!=='bybit')||!symbolOK(x.symbol)||
  !['5m','1h','4h'].includes(String(x.frame))||
  !['READY','GAP','STALE','NO_DATA','ERROR'].includes(String(x.status))||
  !validTime(x.checkedAt)||x.checkedAt>finished||
  !validTime(x.lastClosedAt)||x.lastClosedAt>finished||
  !Number.isSafeInteger(x.barCount)||Number(x.barCount)<0||Number(x.barCount)>40||
  !Number.isSafeInteger(x.gapCount)||Number(x.gapCount)<0||Number(x.gapCount)>40)return null;
 const src=x.source as AssistantExchange,fr=x.frame as AssistantFrame;
 if(x.sourceVersion!==(src==='binance'?'binance-futures-public-v1':'bybit-linear-public-v1'))return null;
 return {source:src,symbol:x.symbol,frame:fr,sourceVersion:x.sourceVersion,
  checkedAt:x.checkedAt,lastClosedAt:x.lastClosedAt,barCount:x.barCount,gapCount:x.gapCount,
  status:x.status as NativeFuturesCheckStatus,message:typeof x.message==='string'?x.message.slice(0,160):''} as NativeFuturesCheck;
}
function parseSample(raw:unknown,now:number):NativeFuturesSample|null{
 if(!raw||typeof raw!=='object')return null;
 const x=raw as Record<string,unknown>;
 if(x.source!=='public-futures-health-v1'||!validTime(x.startedAt)||!validTime(x.finishedAt)||
  x.finishedAt<x.startedAt||x.finishedAt>now||!venueOK(x.venues)||
  !['5m','1h','4h'].includes(String(x.frame))||
  !Number.isSafeInteger(x.selectedCount)||Number(x.selectedCount)<1||Number(x.selectedCount)>4||
  !Array.isArray(x.checks)||x.checks.length>8||x.checks.length===0)return null;
 const checks=x.checks.map(c=>parseCheck(c,x.finishedAt));
 if(checks.some(c=>c===null))return null;
 const valid=checks as NativeFuturesCheck[];
 const distinct=new Set(valid.map(c=>c.source+':'+c.symbol+':'+c.frame));
 if(distinct.size!==valid.length||valid.some(c=>c.frame!==x.frame||
   x.venues==='binance'&&c.source!=='binance'||x.venues==='bybit'&&c.source!=='bybit'))return null;
 const ready=valid.filter(c=>c.status==='READY').length,problems=valid.length-ready;
 if(x.ready!==ready||x.problems!==problems)return null;
 return {startedAt:x.startedAt,finishedAt:x.finishedAt,
  source:'public-futures-health-v1',venues:x.venues as DemoVenueChoice,frame:x.frame as AssistantFrame,
  selectedCount:x.selectedCount,checks:valid,ready,problems};
}
export function parseNativeFuturesStatus(raw:unknown,nativeEnabled=true,now=Date.now()):NativeFuturesStatus{
 if(!nativeEnabled)return EMPTY_NATIVE_FUTURES;
 if(!raw||typeof raw!=='object')return {...EMPTY_NATIVE_FUTURES,supported:true,lastResult:'Android не вернул результаты'};
 const x=raw as Record<string,unknown>;
 const selected=Array.isArray(x.symbols)?[...new Set(x.symbols.filter(symbolOK))].slice(0,4):[];
 const samples=Array.isArray(x.samples)?x.samples.slice(-64)
  .map(r=>parseSample(r,now)).filter((s):s is NativeFuturesSample=>s!==null):[];
 return {supported:true,enabled:x.enabled===true,scheduled:x.scheduled===true,
  workState:typeof x.workState==='string'?x.workState.slice(0,30):'UNKNOWN',
  checkedAt:validTime(x.checkedAt)&&x.checkedAt<=now?x.checkedAt:0,
  lastRunAt:validTime(x.lastRunAt)&&x.lastRunAt<=now?x.lastRunAt:0,
  lastResult:typeof x.lastResult==='string'?x.lastResult.slice(0,190):'Нет фактических запусков',
  symbols:selected,venues:venues(x.venues),frame:frame(x.frame),samples};
}
export function latestFuturesSample(status:NativeFuturesStatus):NativeFuturesSample|null{
 return status.samples.at(-1)||null;
}
export function backgroundSnapshotSummary(status:NativeFuturesStatus,now=Date.now()){
 if(!status.supported)return {title:'Доступно только на Android',detail:'Веб-версия не выполняет Android WorkManager.'};
 if(!status.enabled)return {title:'Фоновый Futures-сбор выключен',detail:'Включается вручную. Текущее наблюдение на экране от этого не зависит.'};
 if(!status.scheduled)return {title:'Фоновое расписание не подтверждено',detail:'Android WorkManager не показал запланированную задачу; проверь интернет и настройки.'};
 const last=latestFuturesSample(status);
 if(!last)return {title:'Фоновое задание запланировано',detail:'Подтверждённых запусков и новых закрытых свечей пока нет.'};
 const age=now-last.finishedAt;
 return {title:age>45*60000?'Фоновый сбор задерживается':'Последний фоновый сбор записан',
  detail:'Последний фактический запуск '+new Date(last.finishedAt).toLocaleString('ru-RU')+
   '. Готовых рынков '+last.ready+' из '+last.checks.length+
   '. Время следующего запуска определяется Android.'};
}
export async function getFuturesNativeStatus():Promise<NativeFuturesStatus>{
 if(!Capacitor.isNativePlatform())return EMPTY_NATIVE_FUTURES;
 return parseNativeFuturesStatus(await native.futuresStudyStatus());
}
export async function configureFuturesNative(enabled:boolean,symbols:readonly string[],
 selectedVenues:DemoVenueChoice,selectedFrame:AssistantFrame):Promise<NativeFuturesStatus>{
 if(!Capacitor.isNativePlatform())throw Error('Фоновая задача доступна только в Android');
 const clean=[...new Set(symbols.filter(symbolOK))].slice(0,4);
 if(enabled&&clean.length===0)throw Error('Выбери хотя бы одну пару из избранного');
 await native.configureFuturesStudy({enabled,symbols:clean,venues:selectedVenues,frame:selectedFrame});
 return getFuturesNativeStatus();
}
export async function queueFuturesNativeCheck():Promise<boolean>{
 if(!Capacitor.isNativePlatform())return false;
 return (await native.runFuturesStudyNow()).queued===true;
}
