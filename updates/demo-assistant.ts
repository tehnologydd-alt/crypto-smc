/** APEX 6.3: autonomous DEMO study companion. Not an order router.
 * Every transition uses factual CLOSED market candles from the selected
 * source (Binance or Bybit); no API keys, wallets, real positions, or order APIs.
 * Intrabar path unknown -> protective stop takes precedence.
 */
import type {Scenario} from './lifecycle';
export type AssistantExchange='binance'|'bybit';
export type AssistantMode='manual'|'auto';
export type AssistantFrame='5m'|'1h'|'4h';
export type AssistantPhase='WAITING'|'OPEN'|'CLOSED'|'EXPIRED'|'CANCELLED';
export type DemoBar={time:number;open:number;high:number;low:number;close:number;closed?:boolean};
export type ObservedReversal={direction:'LONG'|'SHORT';phase:string;timestamp:number}|null|undefined;
export type AssistantEvent={at:number;type:'PLANNED'|'ENTRY'|'TP1'|'TP2'|'TP3'|'BREAKEVEN'|'STOP'|'REVERSAL'|'MANUAL_CLOSE'|'EXPIRED'|'CANCELLED';detail:string};
export type AssistantOrder={
 id:string;scenarioId:string;symbol:string;exchange:AssistantExchange;
 frame:AssistantFrame;direction:'LONG'|'SHORT';mode:AssistantMode;type:'LIMIT';
 entry:number;initialStop:number;protectiveStop:number;targets:[number,number,number];
 portions:[number,number,number];breakevenAfterTp1:boolean;
 registeredAt:number;expiresAt:number;state:AssistantPhase;lastBarAt:number;
 tpReached:number;remainingPct:number;lastTpAt?:number;activatedAt?:number;
 closedAt?:number;closedPrice?:number;closeReason?:string;
 events:AssistantEvent[];
};
export type AssistantLedger={version:1;orders:AssistantOrder[]};
export const FRAME_MS:Record<AssistantFrame,number>={'5m':300000,'1h':3600000,'4h':14400000};
export const DEFAULT_PORTIONS:[number,number,number]=[50,30,20];
const MAX_ORDERS=80,MAX_EVENTS=24;
const ok=(n:unknown):n is number=>typeof n==='number'&&Number.isFinite(n);
const price=(n:unknown):n is number=>ok(n)&&n>0;
const exchangeOk=(v:unknown):v is AssistantExchange=>v==='binance'||v==='bybit';
const frameOk=(v:unknown):v is AssistantFrame=>v==='5m'||v==='1h'||v==='4h';
const stateOk=(v:unknown):v is AssistantPhase=>['WAITING','OPEN','CLOSED','EXPIRED','CANCELLED'].includes(String(v));
const complete=(o:AssistantOrder)=>o.state==='CLOSED'||o.state==='EXPIRED'||o.state==='CANCELLED';
const orderId=(s:Scenario,source:AssistantExchange)=>'demo:'+source+':'+s.id;
const event=(o:AssistantOrder,e:AssistantEvent):AssistantOrder=>({...o,events:[...o.events,e].slice(-MAX_EVENTS)});
const closeOrder=(o:AssistantOrder,state:AssistantPhase,at:number,detail:string,type:AssistantEvent['type'],priceAt?:number)=>{
 const closed=event({...o,state,closedAt:at,closeReason:detail,...(priceAt===undefined?{}:{closedPrice:priceAt})},{at,type,detail});
 return closed;
};
export function validAssistantOrder(o:unknown,now=Date.now()):o is AssistantOrder{
 if(!o||typeof o!=='object')return false;
 const x=o as AssistantOrder;
 if(typeof x.id!=='string'||!x.id.startsWith('demo:')||x.id.length>220||
  !exchangeOk(x.exchange)||!frameOk(x.frame)||!['LONG','SHORT'].includes(x.direction)||
  !['manual','auto'].includes(x.mode)||x.type!=='LIMIT'||!stateOk(x.state)||
  !price(x.entry)||!price(x.initialStop)||!price(x.protectiveStop)||
  !Array.isArray(x.targets)||x.targets.length!==3||!x.targets.every(price)||
  !Array.isArray(x.portions)||x.portions.length!==3||!x.portions.every(v=>Number.isInteger(v)&&v>=1&&v<=98)||
  x.portions.reduce((a,b)=>a+b,0)!==100||
  typeof x.scenarioId!=='string'||!x.scenarioId.length||typeof x.symbol!=='string'||!x.symbol.length||
  x.breakevenAfterTp1!==true&&x.breakevenAfterTp1!==false||
  !ok(x.registeredAt)||x.registeredAt<=0||x.registeredAt>now||
  !ok(x.expiresAt)||x.expiresAt<=x.registeredAt||
  !ok(x.lastBarAt)||x.lastBarAt>x.expiresAt+365*86400000||
  !Number.isInteger(x.tpReached)||x.tpReached<0||x.tpReached>3||
  !ok(x.remainingPct)||x.remainingPct<0||x.remainingPct>100||
  !Array.isArray(x.events)||x.events.length>MAX_EVENTS||x.events.length===0)return false;
 const sign=x.direction==='LONG'?1:-1;
 if(sign*(x.entry-x.initialStop)<=0||x.targets.some((v,i)=>sign*(v-(i?x.targets[i-1]:x.entry))<=0))return false;
 if(x.events.some(e=>!e||!ok(e.at)||e.at<x.registeredAt||e.at>now||typeof e.detail!=='string'||e.detail.length>250))return false;
 if(x.state==='WAITING'&&x.tpReached>0)return false;
 return true;
}
export function openAssistantLedger(raw:string|null,now=Date.now()):AssistantLedger{
 const empty:AssistantLedger={version:1,orders:[]};
 try{
  const parsed=JSON.parse(raw||'null') as AssistantLedger;
  if(parsed?.version!==1||!Array.isArray(parsed.orders)||parsed.orders.length>MAX_ORDERS||
   !parsed.orders.every(x=>validAssistantOrder(x,now)))return empty;
  const uniq=new Set(parsed.orders.map(x=>x.id));
  return uniq.size===parsed.orders.length?parsed:empty;
 }catch{return empty;}
}
export function makeDemoOrder(s:Scenario,source:AssistantExchange,mode:AssistantMode,
 portions:[number,number,number],be:boolean,now=Date.now()):AssistantOrder{
 if(!exchangeOk(source)||!['manual','auto'].includes(mode)||s.status!=='PENDING'||
  !ok(s.createdAt)||s.createdAt>now||!ok(s.expiresAt)||s.expiresAt<=now||
  !frameOk(s.frame||'5m')||!['LONG','SHORT'].includes(s.direction)||
  !price(s.entry)||!price(s.stop)||!Array.isArray(portions)||portions.length!==3||
  portions.some(v=>!Number.isInteger(v)||v<1||v>98)||portions.reduce((sum,n)=>sum+n,0)!==100)
  throw Error('Для демо нужен действующий ожидающий сценарий и сумма TP-долей 100%.');
 const targets=s.targets;
 if(!targets||targets.length!==3||!targets.every(price))throw Error('В прогнозе отсутствуют три цели.');
 const id=orderId(s,source),base:AssistantOrder={id,scenarioId:s.id,symbol:s.symbol,
  exchange:source,frame:s.frame||'5m',direction:s.direction,mode,type:'LIMIT',
  entry:s.entry,initialStop:s.stop,protectiveStop:s.stop,targets:[targets[0],targets[1],targets[2]],
  portions:[portions[0],portions[1],portions[2]],breakevenAfterTp1:be,
  registeredAt:now,expiresAt:s.expiresAt,state:'WAITING',lastBarAt:now,tpReached:0,remainingPct:100,
  events:[{at:now,type:'PLANNED',detail:'Зарегистрирован виртуальный лимитный план; источник '+source+'.'}]};
 if(!validAssistantOrder(base,now))throw Error('Границы входа, защиты или целей противоречат направлению сценария.');
 return base;
}
export function addDemoOrder(old:AssistantLedger,s:Scenario,source:AssistantExchange,mode:AssistantMode,
 portions:[number,number,number],be:boolean,now=Date.now()):AssistantLedger{
 if(old.orders.some(x=>x.id===orderId(s,source)))return old;
 if(old.orders.length>=MAX_ORDERS)throw Error('Демо-журнал достиг лимита.');
 const next=makeDemoOrder(s,source,mode,portions,be,now);
 return {version:1,orders:[next,...old.orders]};
}
export function autoEnrollDemoOrders(old:AssistantLedger,scenarios:Scenario[],source:AssistantExchange,
 portions:[number,number,number],be:boolean,now=Date.now()):AssistantLedger{
 let result=old;
 const pending=scenarios.filter(s=>s.status==='PENDING'&&s.expiresAt>now&&s.createdAt<=now)
  .sort((a,b)=>a.createdAt-b.createdAt);
 for(const s of pending){
  if(result.orders.filter(x=>!complete(x)).length>=6||result.orders.length>=MAX_ORDERS)break;
  if(result.orders.some(x=>x.id===orderId(s,source)))continue;
  try{result=addDemoOrder(result,s,source,'auto',portions,be,now);}catch{/* Invalid proposal excluded rather than guessed. */}
 }
 return result;
}
function qualifiedBar(b:DemoBar,at:number,now:number,frame:AssistantFrame):boolean{
 return b&&b.closed!==false&&ok(b.time)&&b.time>=at&&b.time+FRAME_MS[frame]<=now&&
  price(b.open)&&price(b.high)&&price(b.low)&&price(b.close)&&
  b.low<=Math.min(b.open,b.close)&&b.high>=Math.max(b.open,b.close)&&b.low<=b.high;
}
function reachedTarget(o:AssistantOrder,b:DemoBar,n:number){
 return o.direction==='LONG'?b.high>=o.targets[n]:b.low<=o.targets[n];
}
function reachedStop(o:AssistantOrder,b:DemoBar){
 return o.direction==='LONG'?b.low<=o.protectiveStop:b.high>=o.protectiveStop;
}
function reachedEntry(o:AssistantOrder,b:DemoBar){
 return b.low<=o.entry&&b.high>=o.entry;
}
export function advanceDemoOrder(original:AssistantOrder,bars:DemoBar[],now=Date.now(),
 reversal?:ObservedReversal,scenario?:Scenario):AssistantOrder{
 if(complete(original)||!Array.isArray(bars))return original;
 let o=original,changed=false;
 const frame=o.frame,duration=FRAME_MS[frame];
 const forward=bars.filter(b=>qualifiedBar(b,o.registeredAt,now,frame)&&b.time>o.lastBarAt)
  .sort((a,b)=>a.time-b.time);
 for(const b of forward){
  if(complete(o))break;
  const at=b.time+duration;
  if(o.state==='WAITING'){
   if(at>o.expiresAt){
    o=closeOrder(o,'EXPIRED',o.expiresAt,'Срок виртуального лимита истёк до подтверждённого входа.','EXPIRED');changed=true;break;
   }
   if(reachedEntry(o,b)){
    o=event({...o,state:'OPEN',activatedAt:at,lastBarAt:b.time},{at,type:'ENTRY',detail:'Условный лимитный вход по закрытой свече '+o.exchange+'.'});changed=true;
    if(reachedStop(o,b)){
     o=closeOrder(o,'CLOSED',at,'Вход и защитный уровень в одной свече: консервативно учтён защитный выход.','STOP',o.protectiveStop);
    }
    continue; // Never claim same-candle entry + TP as known fill order.
   }
  }else{
   if(reachedStop(o,b)){
    o=closeOrder(o,'CLOSED',at,'Защитный уровень затронут; при TP/SL в одной свече приоритет защите.','STOP',o.protectiveStop);
    changed=true;break;
   }
   let next=o.tpReached;
   while(next<3&&reachedTarget(o,b,next))next++;
   if(next>o.tpReached){
    for(let i=o.tpReached;i<next;i++){
     o=event({...o,tpReached:i+1,remainingPct:Math.max(0,100-o.portions.slice(0,i+1).reduce((sum,v)=>sum+v,0)),lastTpAt:at},
      {at,type:(['TP1','TP2','TP3'][i]) as AssistantEvent['type'],detail:'Виртуальный TP'+(i+1)+' достигнут по закрытой свече; доля '+o.portions[i]+'%.'});
    }
    changed=true;
    if(o.tpReached>=3){o=closeOrder(o,'CLOSED',at,'Все три виртуальные цели достигнуты.','TP3',o.targets[2]);break;}
    if(o.breakevenAfterTp1&&o.protectiveStop!==o.entry){
     o=event({...o,protectiveStop:o.entry},{at,type:'BREAKEVEN',detail:'Оставшаяся виртуальная доля защищена на уровне входа после TP1; действует со следующей свечи.'});
    }
   }
   if(o.state==='OPEN'&&o.tpReached>=1&&reversal?.phase==='CONFIRMED'&&
    reversal.direction!==o.direction&&ok(reversal.timestamp)&&reversal.timestamp>(o.lastTpAt||0)&&
    reversal.timestamp<=at&&at-reversal.timestamp<=duration*2){
    o=closeOrder(o,'CLOSED',at,'Подтверждённое встречное наблюдение APEX после достижения TP; виртуальная оставшаяся доля закрыта.','REVERSAL',b.close);
    changed=true;break;
   }
  }
  if(o.lastBarAt!==b.time){o={...o,lastBarAt:b.time};changed=true;}
 }
 if(o.state==='WAITING'&&now>=o.expiresAt){
  o=closeOrder(o,'EXPIRED',o.expiresAt,'Срок ожидания виртуального лимита истёк без подтверждённого касания.','EXPIRED');changed=true;
 }
 if(o.state==='WAITING'&&scenario&&['CANCELLED','EXPIRED'].includes(scenario.status)&&
  !forward.length&&now<o.expiresAt&&
  ok(scenario.closedAt)&&scenario.closedAt>=o.registeredAt){
  o=closeOrder(o,'CANCELLED',Math.min(now,scenario.closedAt),
   'Исходный прогноз отменён до активации; виртуальная заявка снята.','CANCELLED');changed=true;
 }
 return changed?o:original;
}
export function updateAssistantLedger(old:AssistantLedger,scenarios:Scenario[],
 bars:Record<string,DemoBar[]>,reversals:Record<string,ObservedReversal>,now=Date.now()):AssistantLedger{
 let changed=false;
 const byScenario=new Map(scenarios.map(s=>[s.id,s]));
 const orders=old.orders.map(o=>{
  const key=o.exchange+':'+o.symbol+':'+o.frame;
  const updated=advanceDemoOrder(o,bars[key]||[],now,reversals[o.symbol+':'+o.frame],byScenario.get(o.scenarioId));
  if(updated!==o)changed=true;
  return updated;
 });
 return changed?{...old,orders}:old;
}
export function closeVirtualOrder(old:AssistantLedger,id:string,now=Date.now()):AssistantLedger{
 const existing=old.orders.find(o=>o.id===id);
 if(!existing||complete(existing))return old;
 const updated=closeOrder(existing,existing.state==='WAITING'?'CANCELLED':'CLOSED',now,
  existing.state==='WAITING'?'Виртуальный лимит снят пользователем.':'Виртуальная позиция закрыта вручную; цена исполнения неизвестна.',
  'MANUAL_CLOSE');
 return {...old,orders:old.orders.map(o=>o.id===id?updated:o)};
}
export function assistantSummary(ledger:AssistantLedger){
 return {waiting:ledger.orders.filter(o=>o.state==='WAITING').length,
  open:ledger.orders.filter(o=>o.state==='OPEN').length,
  ended:ledger.orders.filter(o=>complete(o)).length};
}
