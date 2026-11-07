/** APEX 7.8 — opt-in low-noise evidence-based DEMO observation notices.
 * Only reports events recorded while the app is executing / on return.
 * No invented background futures samples, financial alerts or automatic trading.
 */
import type {MonitorJournal,MonitorEvent} from './v77-monitor-health';
import type {CoreReliabilityNativeState} from './core-background';

export const MONITOR_NOTICE_COOLDOWN_MS=30*60*1000;
export const MONITOR_NOTICE_WINDOW_MS=30*60*1000;
export const MONITOR_NOTICE_MAX_PER_DAY=3;
export const MONITOR_NOTICE_MIN_PAUSE_MS=10*60*1000;
export type NoticeType='INTERRUPTED'|'NO_NETWORK'|'REPEATED_ERRORS'|'CANDLE_GAP';
export type MonitorNotice={id:string;type:NoticeType;title:string;body:string;eventAt:number};
export type NoticeRecord={id:string;at:number};
export type NoticePreferences={version:1;enabled:boolean;armedAt:number;sent:NoticeRecord[]};
export const EMPTY_NOTICE_PREFS:NoticePreferences={version:1,enabled:false,armedAt:0,sent:[]};
const isTime=(n:unknown)=>Number.isSafeInteger(n)&&Number(n)>=0;
export function restoreNoticePreferences(raw:string|null,now=Date.now()):NoticePreferences{
 try{
  const x=JSON.parse(raw||'null') as NoticePreferences;
  if(x?.version!==1||typeof x.enabled!=='boolean'||!isTime(x.armedAt)||x.armedAt>now||
   !Array.isArray(x.sent)||x.sent.length>32||x.sent.some(s=>!s||typeof s.id!=='string'||s.id.length>180||
    !isTime(s.at)||s.at>now)||new Set(x.sent.map(s=>s.id)).size!==x.sent.length)
   return EMPTY_NOTICE_PREFS;
  return x;
 }catch{return EMPTY_NOTICE_PREFS;}
}
export function setNoticePermission(old:NoticePreferences,enabled:boolean,now=Date.now()):NoticePreferences{
 if(!isTime(now))return old;
 if(!enabled)return {...old,enabled:false};
 if(old.enabled)return old;
 // Arming never retroactively delivers OLD log events.
 return {...old,enabled:true,armedAt:now};
}
function noticeFor(e:MonitorEvent,j:MonitorJournal):MonitorNotice|null{
 if(e.type==='RESUMED'&&e.durationMs!==null&&e.durationMs>=MONITOR_NOTICE_MIN_PAUSE_MS)
  return {id:e.id,type:'INTERRUPTED',title:'APEX · перерыв DEMO-наблюдения',
   body:'Приложение вернулось после перерыва. Свечи проверяются заново; пропущенные сценарии не восстанавливаются.',eventAt:e.at};
 if(e.type==='OFFLINE'&&!j.online)
  return {id:e.id,type:'NO_NETWORK',title:'APEX · нет сети',
   body:'Фьючерсные DEMO-наблюдения приостановлены. Прогнозы по отсутствующим данным не создаются.',eventAt:e.at};
 if(e.type==='DATA_ERROR'&&e.key&&j.feeds[e.key]?.consecutiveFailures>=3)
  return {id:e.id,type:'REPEATED_ERRORS',title:'APEX · источник данных недоступен',
   body:e.key.replaceAll(':',' · ')+': серия ошибок публичных запросов. Новые DEMO-планы приостановлены.',eventAt:e.at};
 if(e.type==='GAP'&&e.key&&j.feeds[e.key]?.observedGaps>0)
  return {id:e.id,type:'CANDLE_GAP',title:'APEX · разрыв свечей',
   body:e.key.replaceAll(':',' · ')+': обнаружен пропуск свечей; отчёт отмечает неполные данные.',eventAt:e.at};
 return null;
}
export function pickMonitoringNotice(j:MonitorJournal,p:NoticePreferences,now=Date.now()):MonitorNotice|null{
 if(!p.enabled||!isTime(now)||j.pausedAt!==null)return null;
 const recent=p.sent.filter(s=>s.at<=now&&now-s.at<86400000);
 if(recent.length>=MONITOR_NOTICE_MAX_PER_DAY)return null;
 const last=Math.max(0,...p.sent.map(s=>s.at));
 if(last>0&&now-last<MONITOR_NOTICE_COOLDOWN_MS)return null;
 // Newest-first; only after deliberate user opt-in.
 for(const e of [...j.events].reverse()){
  if(!isTime(e.at)||e.at<p.armedAt||e.at>now||now-e.at>MONITOR_NOTICE_WINDOW_MS||
   p.sent.some(s=>s.id===e.id))continue;
  const candidate=noticeFor(e,j);
  if(candidate)return candidate;
 }
 return null;
}
export function recordMonitoringNotice(p:NoticePreferences,n:MonitorNotice,now=Date.now()):NoticePreferences{
 if(!p.enabled||!isTime(now)||p.sent.some(s=>s.id===n.id))return p;
 return {...p,sent:[...p.sent,{id:n.id,at:now}].slice(-32)};
}
export type BackgroundTruth={
 coreTitle:string;coreDetail:string;coreLastRunAt:number|null;coreWorkState:string;
 futuresTitle:string;futuresDetail:string;
};
export function explainAndroidBackground(core:CoreReliabilityNativeState,j:MonitorJournal,
 tracked:number,now=Date.now()):BackgroundTruth{
 let coreTitle='Фон CORE: Android не проверен';
 let coreDetail='В браузере или без свежей диагностики нельзя подтвердить расписание Android.';
 if(core.supported&&core.checkedAt>0&&core.checkedAt<=now&&now-core.checkedAt<=20*60*1000){
  if(!core.enabled) {
   coreTitle='Фон CORE: выключен';
   coreDetail='Пользователь не включал отдельное фоновое CORE-исследование.';
  }else if(core.workState==='REQUEUED'||core.repairQueued){
   coreTitle='Фон CORE: восстановление запрошено';
   coreDetail='Повторная постановка задания выполнена, очередное успешное выполнение ещё не подтверждено.';
  }else if(!core.scheduled||core.workState==='MISSING'||core.workState==='DISABLED'){
   coreTitle='Фон CORE: расписание не обнаружено';
   coreDetail='WorkManager не подтвердил активную задачу; проверь состояние в Центре CORE.';
  }else{
   const age=core.lastRunAt>0&&core.lastRunAt<=now?Math.floor((now-core.lastRunAt)/60000):null;
   coreTitle=age!==null&&age>=45?'Фон CORE: задание задерживается':'Фон CORE: задание запланировано';
   coreDetail=age===null?'Планировщик видит CORE, но фактических завершённых запусков пока нет.':
    'Последний реальный запуск CORE: '+age+' мин назад. Наличие расписания не гарантирует свежие Futures-данные.';
  }
 } else if(core.supported){
  coreTitle='Фон CORE: нужна новая проверка';
  coreDetail='Последняя диагностика Android WorkManager устарела.';
 }
 const futuresTitle=tracked===0?'Futures DEMO: нет отслеживаемых потоков':
  j.pausedAt!==null?'Futures DEMO: экран скрыт':
  !j.online?'Futures DEMO: нет сети':'Futures DEMO: наблюдение в приложении';
 const futuresDetail=tracked===0?
  'Выбранных или активных фьючерсных потоков сейчас нет.':
  j.pausedAt!==null?'Когда экран скрыт, получение свечей WebView не гарантируется.':
  !j.online?'Новые публичные данные пока недоступны; старые свечи не считаются актуальными.':
  'Состояние основано на отдельных успешных запросах к Binance/Bybit. Отдельное фоновое CORE-задание НЕ мониторит эти Futures DEMO-пары.';
 return {coreTitle,coreDetail,coreLastRunAt:core.lastRunAt>0?core.lastRunAt:null,
  coreWorkState:core.workState,futuresTitle,futuresDetail};
}
