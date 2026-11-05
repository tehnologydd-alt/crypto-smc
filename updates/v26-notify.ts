import {Capacitor,registerPlugin} from '@capacitor/core';
import {LocalNotifications} from '@capacitor/local-notifications';
import type {Scenario} from './lifecycle';
import type {RadarSignal} from './engine';
import {scenarioNotificationId,scenarioStageText,shouldNotifyScenario,STAGE_KEYS,type StagePrefs} from './stages';

export type NativeMonitorStatus={enabled:boolean;intervalMinutes:number;lastRunAt?:number;lastResult?:string};
interface MonitorPlugin {
 configure(options:{symbols:string[];enabled:boolean;notifyEnabled:boolean;stages:string[]}):Promise<NativeMonitorStatus>;
 status():Promise<NativeMonitorStatus>;
 syncScenarios(options:{scenarios:Scenario[]}):Promise<{count:number}>;
 drainEvents():Promise<{scenarios:Scenario[]}>;
 testNotification():Promise<{ok:boolean}>;
 heartbeat():Promise<void>;
 openedScenario():Promise<{id:string}>;
}
const BackgroundMonitor=registerPlugin<MonitorPlugin>('BackgroundMonitor');
export async function requestAlerts():Promise<boolean>{
 if(!Capacitor.isNativePlatform())return 'Notification' in window&&Notification.permission==='granted';
 const status=await LocalNotifications.requestPermissions();return status.display==='granted';
}
export async function configureBackground(symbols:string[],enabled:boolean,notifyEnabled=true,prefs:StagePrefs):Promise<NativeMonitorStatus>{
 if(!Capacitor.isNativePlatform())return {enabled:false,intervalMinutes:15};
 return BackgroundMonitor.configure({symbols,enabled,notifyEnabled,stages:STAGE_KEYS.filter(k=>prefs[k])});
}
export async function nativeForegroundHeartbeat(){if(Capacitor.isNativePlatform())await BackgroundMonitor.heartbeat();}
export async function getBackgroundStatus():Promise<NativeMonitorStatus>{
 if(!Capacitor.isNativePlatform())return {enabled:false,intervalMinutes:15};return BackgroundMonitor.status();
}
export async function syncNativeScenarios(scenarios:Scenario[]):Promise<void>{
 if(Capacitor.isNativePlatform())await BackgroundMonitor.syncScenarios({scenarios:scenarios.slice(0,400)});
}
export async function getNativeScenarioUpdates():Promise<Scenario[]>{
 if(!Capacitor.isNativePlatform())return [];
 const r=await BackgroundMonitor.drainEvents();return Array.isArray(r.scenarios)?r.scenarios:[];
}
export async function getOpenedScenarioId():Promise<string>{
 if(!Capacitor.isNativePlatform())return '';return (await BackgroundMonitor.openedScenario()).id||'';
}
export async function testNotification():Promise<void>{
 if(!Capacitor.isNativePlatform()){
  if('Notification' in window&&Notification.permission==='granted')new Notification('APEX · тест',{body:'Тестовое уведомление успешно.'});
  else throw Error('Для теста разреши уведомления в Android-приложении.');return;
 }
 if((await LocalNotifications.checkPermissions()).display!=='granted')throw Error('Сначала разреши уведомления Android.');
 await BackgroundMonitor.testNotification();
}
/** One Android notification ID per scenario; WATCH never notifies. */
export async function publishScenarioStage(s:Scenario,prefs:StagePrefs):Promise<boolean>{
 if(!shouldNotifyScenario(s,prefs))return false;
 const key='apex_v26_stage_sent_'+s.id, stage=s.status+':'+(s.tpReached||0);
 if(localStorage.getItem(key)===stage)return false;
 const {title,body}=scenarioStageText(s);
 if(Capacitor.isNativePlatform()){
  if((await LocalNotifications.checkPermissions()).display!=='granted')return false;
  await LocalNotifications.schedule({notifications:[{id:scenarioNotificationId(s.id),title,body,channelId:'apex_signals',
   smallIcon:'ic_apex_notification',largeIcon:'apex_notification_large',iconColor:'#36D7C2',
   extra:{scenarioId:s.id},schedule:{at:new Date(Date.now()+300)}}]});
 }else if('Notification' in window&&Notification.permission==='granted'){
  new Notification(title,{body,tag:s.id});
 }else return false;
 localStorage.setItem(key,stage);return true;
}

export function retainAlert(signal:RadarSignal,items:RadarSignal[]):RadarSignal[]{
 if(items.some(x=>x.id===signal.id))return items;
 return [signal,...items].slice(0,120);
}
