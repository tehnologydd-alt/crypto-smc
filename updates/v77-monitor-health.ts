/** APEX 7.7 — bounded, honest observability for PUBLIC Futures DEMO monitoring.
 * Read-only journal: never fabricates bars, trades or activity while Android pauses.
 * Does not restart the independent study or modify frozen virtual ledgers.
 */
import type {AssistantFrame} from './demo-assistant';
import type {FutureBar} from './v64-futures-market';
import {FUTURE_FRAME_MS} from './v64-futures-assistant';
export type MonitorEventType='STARTED'|'RESUMED'|'PAUSED'|'OFFLINE'|'ONLINE'|'DATA_ERROR'|'DATA_RECOVERED'|'GAP';
export type MonitorEvent={id:string;at:number;type:MonitorEventType;key:string|null;message:string;durationMs:number|null};
export type MonitorFeed={key:string;lastAttemptAt:number|null;lastSuccessAt:number|null;
 lastClosedAt:number|null;lastErrorAt:number|null;error:string|null;
 consecutiveFailures:number;observedGaps:number;checkedBars:number};
export type MonitorJournal={version:1;lastSeenAt:number|null;pausedAt:number|null;
 online:boolean;events:MonitorEvent[];feeds:Record<string,MonitorFeed>};
export const MONITOR_MAX_EVENTS=40,MONITOR_MAX_FEEDS=48;
export const EMPTY_MONITOR:MonitorJournal={version:1,lastSeenAt:null,pausedAt:null,
 online:true,events:[],feeds:{}};
const safeTime=(t:unknown):t is number=>Number.isSafeInteger(t)&&Number(t)>0;
const keyOk=(k:string)=>/^(binance|bybit):[A-Z0-9]{5,24}:(5m|1h|4h)$/.test(k);
const newFeed=(key:string):MonitorFeed=>({key,lastAttemptAt:null,lastSuccessAt:null,
 lastClosedAt:null,lastErrorAt:null,error:null,consecutiveFailures:0,observedGaps:0,checkedBars:0});
function event(j:MonitorJournal,type:MonitorEventType,key:string|null,message:string,
 at:number,durationMs:number|null=null):MonitorJournal{
 const last=j.events.at(-1);
 if(last&&last.type===type&&last.key===key&&at-last.at<3000)return j;
 return {...j,events:[...j.events,{id:type+':'+(key||'all')+':'+at,at,type,key,
  message:message.slice(0,180),durationMs}].slice(-MONITOR_MAX_EVENTS)};
}
export function restoreMonitorJournal(raw:string|null,now=Date.now()):MonitorJournal{
 try{
  const x=JSON.parse(raw||'null') as MonitorJournal;
  if(x?.version!==1||!Array.isArray(x.events)||x.events.length>MONITOR_MAX_EVENTS||
   !x.feeds||typeof x.feeds!=='object'||Array.isArray(x.feeds)||
   Object.keys(x.feeds).length>MONITOR_MAX_FEEDS||typeof x.online!=='boolean'||
   !(x.pausedAt===null||safeTime(x.pausedAt)&&x.pausedAt<=now)||
   !(x.lastSeenAt===null||safeTime(x.lastSeenAt)&&x.lastSeenAt<=now))return EMPTY_MONITOR;
  const goodEvents=x.events.every(e=>e&&safeTime(e.at)&&e.at<=now&&
   ['STARTED','RESUMED','PAUSED','OFFLINE','ONLINE','DATA_ERROR','DATA_RECOVERED','GAP'].includes(e.type)&&
   typeof e.message==='string'&&e.message.length<=180&&
   (e.key===null||typeof e.key==='string'&&keyOk(e.key))&&
   (e.durationMs===null||Number.isSafeInteger(e.durationMs)&&e.durationMs>=0));
  const goodFeeds=Object.entries(x.feeds).every(([key,f])=>keyOk(key)&&f?.key===key&&
   [f.lastAttemptAt,f.lastSuccessAt,f.lastClosedAt,f.lastErrorAt].every(v=>v===null||safeTime(v)&&v<=now)&&
   Number.isSafeInteger(f.consecutiveFailures)&&f.consecutiveFailures>=0&&f.consecutiveFailures<=1000000&&
   Number.isSafeInteger(f.observedGaps)&&f.observedGaps>=0&&
   Number.isSafeInteger(f.checkedBars)&&f.checkedBars>=0&&
   (f.error===null||typeof f.error==='string'&&f.error.length<=180));
  return goodEvents&&goodFeeds?x:EMPTY_MONITOR;
 }catch{return EMPTY_MONITOR;}
}
export function startMonitorSession(old:MonitorJournal,now=Date.now()):MonitorJournal{
 if(!safeTime(now)||old.lastSeenAt===now)return old;
 const last=old.lastSeenAt;
 const duration=last!==null?Math.max(0,now-last):null;
 return event({...old,lastSeenAt:now,pausedAt:null},last===null?'STARTED':'RESUMED',null,
  last===null?'Начало локальной сессии мониторинга.':'Возврат после перезапуска; пропущенный период не считается непрерывным наблюдением.',
  now,duration);
}
export function noteMonitorVisibility(old:MonitorJournal,visible:boolean,now=Date.now()):MonitorJournal{
 if(!safeTime(now))return old;
 if(!visible){
  if(old.pausedAt!==null)return old;
  return event({...old,pausedAt:now,lastSeenAt:now},'PAUSED',null,
   'Android/WebView скрыл приложение. Непрерывное получение свечей не гарантируется.',now);
 }
 if(old.pausedAt===null)return old;
 const gap=Math.max(0,now-old.pausedAt);
 return event({...old,pausedAt:null,lastSeenAt:now},'RESUMED',null,
  'Экран снова активен: обновить реальные данные; пропущенный интервал не восстанавливается искусственно.',
  now,gap);
}
export function noteMonitorNetwork(old:MonitorJournal,online:boolean,now=Date.now()):MonitorJournal{
 if(!safeTime(now)||old.online===online)return old;
 return event({...old,online,lastSeenAt:now},online?'ONLINE':'OFFLINE',null,
  online?'Сеть снова доступна; потребуется новый успешный запрос.':'Сеть недоступна, обновление DEMO-наблюдений остановлено.',
  now);
}
function setFeed(old:MonitorJournal,entry:MonitorFeed):MonitorJournal{
 const feeds={...old.feeds,[entry.key]:entry},keys=Object.keys(feeds);
 if(keys.length>MONITOR_MAX_FEEDS){
  const remove=keys.filter(k=>k!==entry.key).sort((a,b)=>
   (feeds[a].lastAttemptAt||0)-(feeds[b].lastAttemptAt||0))[0];
  if(remove)delete feeds[remove];
 }
 return {...old,feeds};
}
function gapsIn(bars:FutureBar[],frame:AssistantFrame):number{
 const duration=FUTURE_FRAME_MS[frame];
 let gaps=0;
 const times=[...new Set(bars.map(b=>b.time))].sort((a,b)=>a-b);
 for(let i=1;i<times.length;i++)if(times[i]!==times[i-1]+duration)gaps++;
 return gaps;
}
export function noteMonitorSuccess(old:MonitorJournal,key:string,bars:FutureBar[],at=Date.now()):MonitorJournal{
 if(!keyOk(key)||!safeTime(at)||!Array.isArray(bars)||bars.length===0)return old;
 const frame=key.split(':')[2] as AssistantFrame,ms=FUTURE_FRAME_MS[frame];
 const valid=bars.filter(b=>b?.closed===true&&safeTime(b.time)&&b.time+ms<=at);
 if(!valid.length)return noteMonitorFailure(old,key,'Нет завершённых свечей',at);
 const last=Math.max(...valid.map(b=>b.time+ms));
 const prior=old.feeds[key]||newFeed(key),gaps=gapsIn(valid,frame);
 let next=setFeed({...old,lastSeenAt:at},{...prior,lastAttemptAt:at,lastSuccessAt:at,lastClosedAt:last,
  error:null,consecutiveFailures:0,checkedBars:valid.length,observedGaps:gaps});
 if(prior.consecutiveFailures>0)next=event(next,'DATA_RECOVERED',key,'Публичный источник данных снова отвечает.',at);
 if(gaps>0&&gaps!==prior.observedGaps)
  next=event(next,'GAP',key,'Обнаружен разрыв во временной последовательности закрытых свечей.',at);
 return next;
}
export function noteMonitorFailure(old:MonitorJournal,key:string,reason:unknown,at=Date.now()):MonitorJournal{
 if(!keyOk(key)||!safeTime(at))return old;
 const prior=old.feeds[key]||newFeed(key);
 // Do not persist untrusted API error payload verbatim beyond a short generic label.
 const error=String(reason).slice(0,180);
 let next=setFeed({...old,lastSeenAt:at},{...prior,lastAttemptAt:at,lastErrorAt:at,error,
  consecutiveFailures:Math.min(1000000,prior.consecutiveFailures+1)});
 if(prior.consecutiveFailures===0||at-(prior.lastErrorAt||0)>=900000)
  next=event(next,'DATA_ERROR',key,'Не удалось получить публичные фьючерсные данные: '+error,at);
 return next;
}
export type MonitorFeedStatus='FRESH'|'DELAYED'|'ERROR'|'NO_DATA'|'PAUSED'|'OFFLINE';
export type MonitorRow={key:string;status:MonitorFeedStatus;lastSuccessAt:number|null;
 lastClosedAt:number|null;failures:number;observedGaps:number;ageMs:number|null;error:string|null};
export function monitorRows(j:MonitorJournal,keys:readonly string[],now=Date.now()):MonitorRow[]{
 return [...new Set(keys)].filter(keyOk).map(key=>{
  const f=j.feeds[key],frame=key.split(':')[2] as AssistantFrame,duration=FUTURE_FRAME_MS[frame];
  const age=f?.lastClosedAt===null||f?.lastClosedAt===undefined?null:Math.max(0,now-f.lastClosedAt);
  const status:MonitorFeedStatus=j.pausedAt!==null?'PAUSED':!j.online?'OFFLINE':
   !f||!f.lastSuccessAt?'NO_DATA':f.consecutiveFailures>0?'ERROR':
   age!==null&&age>Math.max(2*duration,600000)?'DELAYED':'FRESH';
  return {key,status,lastSuccessAt:f?.lastSuccessAt||null,lastClosedAt:f?.lastClosedAt||null,
   failures:f?.consecutiveFailures||0,observedGaps:f?.observedGaps||0,ageMs:age,error:f?.error||null};
 });
}
/** A successful HTTP response alone is insufficient: the last CLOSED candle must
 * also be recent on that exact exchange/symbol/frame. No new paper signal from
 * a suspended/delisted or otherwise stale instrument.
 */
export function hasFreshSourceEvidence(j:MonitorJournal,key:string,now=Date.now()):boolean{
 if(!j.online||j.pausedAt!==null||!keyOk(key)||!safeTime(now))return false;
 const f=j.feeds[key];
 if(!f?.lastSuccessAt||!f.lastClosedAt||f.consecutiveFailures>0)return false;
 const frame=key.split(':')[2] as AssistantFrame;
 const age=now-f.lastClosedAt;
 return now-f.lastSuccessAt>=0&&now-f.lastSuccessAt<=150000&&
  age>=0&&age<=Math.max(2*FUTURE_FRAME_MS[frame],600000);
}
export function monitorOverview(rows:MonitorRow[]){
 return {total:rows.length,fresh:rows.filter(r=>r.status==='FRESH').length,
  delayed:rows.filter(r=>r.status==='DELAYED').length,
  errors:rows.filter(r=>r.status==='ERROR').length,
  noData:rows.filter(r=>r.status==='NO_DATA').length,
  suspended:rows.filter(r=>r.status==='PAUSED'||r.status==='OFFLINE').length};
}
