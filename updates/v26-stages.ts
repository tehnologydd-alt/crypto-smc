import type {Scenario} from './lifecycle';
export const STAGE_KEYS=['PENDING','ACTIVE','TP1','TP2','TARGET','STOP','CANCELLED','EXPIRED'] as const;
export type NotificationStage=typeof STAGE_KEYS[number];
export type StagePrefs=Record<NotificationStage,boolean>;
export const DEFAULT_STAGE_PREFS:StagePrefs={PENDING:true,ACTIVE:true,TP1:true,TP2:false,TARGET:true,STOP:true,CANCELLED:true,EXPIRED:true};
export function loadStagePrefs(raw:string|null):StagePrefs{
 try{const parsed=JSON.parse(raw||'null');if(!parsed||typeof parsed!=='object')return {...DEFAULT_STAGE_PREFS};
 return Object.fromEntries(STAGE_KEYS.map(k=>[k,typeof parsed[k]==='boolean'?parsed[k]:DEFAULT_STAGE_PREFS[k]])) as StagePrefs;}
 catch{return {...DEFAULT_STAGE_PREFS};}
}
export function scenarioStage(s:Pick<Scenario,'status'|'tpReached'>):NotificationStage{
 if(s.status!=='ACTIVE')return s.status;
 return s.tpReached===1?'TP1':s.tpReached===2?'TP2':'ACTIVE';
}
export function shouldNotifyScenario(s:Pick<Scenario,'status'|'tpReached'>,p:StagePrefs){return p[scenarioStage(s)]===true;}
export function scenarioNotificationId(id:string):number{
 let hash=0;for(let i=0;i<id.length;i++)hash=(Math.imul(hash,31)+id.charCodeAt(i))|0;
 return hash&0x7fffffff;
}
export function scenarioStageText(s:Scenario):{title:string;body:string}{
 const stage=scenarioStage(s);
 const label:Record<NotificationStage,string>={
 PENDING:'🟡 Ожидает лимитного входа',ACTIVE:'🔵 Вход активирован',
 TP1:'🔵 Первая цель TP1 достигнута',TP2:'🔵 Вторая цель TP2 достигнута',
 TARGET:'🟢 Финальная цель TP3 достигнута',STOP:'🔴 Достигнут стоп',
 CANCELLED:'⚪ Сценарий отменён',EXPIRED:'⚪ Срок ожидания истёк'};
 const number=(v:number)=>Number(v).toPrecision(7);
 const levels=stage==='PENDING'? 'Entry '+number(s.entry)+' · SL '+number(s.stop)+' · TP1 '+number(s.targets?.[0]??s.target):
 stage==='ACTIVE'?'Entry '+number(s.entry)+' · следующая TP1 '+number(s.targets?.[0]??s.target):
 stage==='TP1'||stage==='TP2'?'Следующая цель '+(stage==='TP1'?'TP2':'TP3')+' · SL '+number(s.stop):s.resultNote||'Сценарий завершён';
 return {title:'APEX · '+s.symbol+' '+(s.frame||'5m').toUpperCase()+' '+s.direction,body:label[stage]+'. '+levels};
}
