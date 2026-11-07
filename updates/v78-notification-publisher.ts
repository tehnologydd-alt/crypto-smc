/** APEX 7.8: Android-only, user-consented INFORMATIONAL alerts.
 * No financial signal, no real order instruction, no notification when Android
 * stops the WebView; delivery requires actual OS permission and active JS.
 */
import {Capacitor} from '@capacitor/core';
import {LocalNotifications} from '@capacitor/local-notifications';
import type {MonitorNotice} from './v78-observation-notices';

const stableId=(value:string)=>{
 let hash=0;
 for(let i=0;i<value.length;i++)hash=(Math.imul(hash,31)+value.charCodeAt(i))|0;
 return 78000000+(hash>>>0)%9000000;
};
export async function publishObservationNotice(n:MonitorNotice):Promise<boolean>{
 if(!Capacitor.isNativePlatform())return false;
 if((await LocalNotifications.checkPermissions()).display!=='granted')return false;
 await LocalNotifications.schedule({notifications:[{
  id:stableId(n.id),title:n.title,body:n.body,
  smallIcon:'ic_apex_notification',iconColor:'#36D7C2',
  schedule:{at:new Date(Date.now()+1200)},
  extra:{type:'observation-health',eventId:n.id}
 }]});
 return true;
}
