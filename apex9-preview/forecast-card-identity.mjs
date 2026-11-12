/**
 * Unified scenario identity for pending, limit, active, terminal and
 * unverified archive. Every available direction is clearly identified.
 * Publication time is ALWAYS directly underneath the asset heading.
 * Invalid / directionless archives are never assigned a guessed side.
 */
import {displayPair} from './forecast-card-ux.mjs';
const FRAME={'1h':'H1','15m':'M15','4h':'H4'};
const fmt=t=>Number.isSafeInteger(t)&&t>0?
 new Date(t).toLocaleString('ru-RU',{day:'2-digit',month:'2-digit',
  year:'numeric',hour:'2-digit',minute:'2-digit'}):'время неизвестно';
export function recordedForecastSide(row){
 let h=row?.hypothesis;
 if(typeof h==='string'){try{h=JSON.parse(h)}catch{return null}}
 if(!row||!(row.id?.startsWith('direction2:')||
  row.id?.startsWith('direction3:')))return null;
 return h?.direction==='DOWN'?'SHORT':h?.direction==='UP'?'LONG':null;
}
export function createForecastIdentity(row,{frame,side,method='',unverified=false}={}){
 const identity=document.createElement('div');
 identity.className='forecast-compact-identity forecast-visual-identity forecast-unified-identity';
 const original=recordedForecastSide(row);
 const direction=side==='UP'?'LONG':side==='DOWN'?'SHORT':original;
 const primary=document.createElement('strong');
 primary.textContent=displayPair(row.asset)+' · '+(frame||FRAME[row.interval]||row.interval)+
  (direction?' · '+direction:' · без направления');
 const stamp=document.createElement('small');
 stamp.className='forecast-created-at';
 stamp.textContent='Создан: '+fmt(row.publishedAt);
 identity.append(primary,stamp);
 if(method){
  const subtitle=document.createElement('span');
  subtitle.className='forecast-unified-context';
  subtitle.textContent=method+(unverified?' · метод не подтверждён':'');
  identity.append(subtitle);
 }
 return identity;
}
