/** APEX 6.3 isolated, demo-only assistant. It never submits real exchange orders. */
import type {Scenario} from './lifecycle';
import type {Candle,RadarSignal,Timeframe} from './engine';

export type AssistantMode='manual'|'auto';
export type DemoStatus='WAITING'|'OPEN'|'CLOSED'|'EXPIRED'|'CANCELLED'|'NEEDS_REVIEW';
export type DemoExit='TP3'|'STOP'|'BREAK_EVEN'|'REVERSAL'|'EXPIRED'|'CANCELLED'|'MANUAL'|'DATA_GAP';
export type DemoEvent={at:number;type:string;price:number|null;note:string};
export type DemoContext={
 capturedAt:number;signalId:string;forecastReason:string;price:number|null;quoteAgeMs:number|null;
 volumeRatio:number|null;votes:Record<Timeframe,{phase:'WATCH'|'CONFIRMED'|'NONE';direction:'LONG'|'SHORT'|null}>;
};
export type DemoOrder={
 id:string;scenarioId:string;symbol:string;frame:Timeframe;direction:'LONG'|'SHORT';
 kind:'LIMIT';marketSource:'binance-public';virtualAmount:number;
 entry:number;initialStop:number;effectiveStop:number;targets:[number,number,number];
 tpShares:[number,number,number];tpReached:number;remainingShare:number;breakEven:boolean;
 grossPnl:number;status:DemoStatus;createdAt:number;expiresAt:number;lastCandleTime:number;
 lastTpCandleTime:number;activatedAt?:number;closedAt?:number;closedPrice?:number;
 exit?:DemoExit;note:string;events:DemoEvent[];origin:'manual'|'auto';context:DemoContext;
};
export type AssistantBook={version:1;mode:AssistantMode;autoSince:number;orders:DemoOrder[]};
export type AssistantMarket={price:number;lastTick:number;signals:Partial<Record<Timeframe,RadarSignal|null>>;
 candles?:Candle[];frames?:Partial<Record<Timeframe,Candle[]>>;volumeRatio?:number};
export const ASSISTANT_STORE='apex_v63_demo_assistant';
export const TP_SPLIT:[number,number,number]=[0.4,0.3,0.3];
const frameMs:Record<Timeframe,number>={'5m':300_000,'1h':3_600_000,'4h':14_400_000};
const terminal=new Set<DemoStatus>(['CLOSED','EXPIRED','CANCELLED','NEEDS_REVIEW']);
const positive=(n:number)=>Number.isFinite(n)&&n>0;
const fresh=(m:AssistantMarket|undefined,now:number)=>!!m&&positive(m.price)
 &&Number.isFinite(m.lastTick)&&m.lastTick>0&&now>=m.lastTick&&now-m.lastTick<=180_000;
const append=(o:DemoOrder,type:string,at:number,price:number|null,note:string):DemoOrder=>
 ({...o,note,events:[...o.events,{at,type,price,note}].slice(-50)});
const pnl=(o:DemoOrder,price:number,share:number)=>o.virtualAmount*share*
 (price-o.entry)/o.entry*(o.direction==='LONG'?1:-1);

export function readAssistantBook(raw:string|null):AssistantBook{
 const empty:AssistantBook={version:1,mode:'manual',autoSince:0,orders:[]};
 try{
  const data=JSON.parse(raw||'null');
  if(data?.version!==1||!Array.isArray(data.orders))return empty;
  const orders:DemoOrder[]=data.orders.filter((o:DemoOrder)=>o&&typeof o.id==='string'
    &&typeof o.scenarioId==='string'&&typeof o.symbol==='string'
    &&['WAITING','OPEN','CLOSED','EXPIRED','CANCELLED','NEEDS_REVIEW'].includes(o.status)
    &&positive(o.entry)&&positive(o.initialStop)&&positive(o.effectiveStop)
    &&Array.isArray(o.targets)&&o.targets.length===3&&o.targets.every(positive)
    &&Number.isFinite(o.createdAt)&&Number.isFinite(o.expiresAt)&&Number.isFinite(o.virtualAmount)
    &&Array.isArray(o.events)).slice(0,250);
  return {version:1,mode:data.mode==='auto'?'auto':'manual',
    autoSince:Number.isFinite(data.autoSince)?data.autoSince:0,orders};
 }catch{return empty;}
}
export function setAssistantMode(book:AssistantBook,mode:AssistantMode,now:number):AssistantBook{
 if(book.mode===mode)return book;
 return {...book,mode,autoSince:mode==='auto'?now:0};
}
function captureContext(s:Scenario,m:AssistantMarket|undefined,now:number):DemoContext{
 const votes={} as DemoContext['votes'];
 for(const frame of ['5m','1h','4h'] as Timeframe[]){
  const signal=m?.signals?.[frame];
  votes[frame]={phase:signal?.phase==='CONFIRMED'||signal?.phase==='WATCH'?signal.phase:'NONE',
   direction:signal&&(signal.direction==='LONG'||signal.direction==='SHORT')?signal.direction:null};
 }
 return {capturedAt:now,signalId:s.originalSignalId,forecastReason:s.reason,
  price:fresh(m,now)?m!.price:null,
  quoteAgeMs:m?.lastTick&&m.lastTick<=now?now-m.lastTick:null,
  volumeRatio:Number.isFinite(m?.volumeRatio)?m!.volumeRatio!:null,votes};
}
export function makeDemoLimit(s:Scenario,now:number,amount=100,origin:'manual'|'auto'='manual',
 m?:AssistantMarket):DemoOrder|null{
 if(s.status!=='PENDING'||!positive(s.entry)||!positive(s.stop)
    ||!Array.isArray(s.targets)||s.targets.length!==3||!s.targets.every(positive)
    ||!Number.isFinite(s.expiresAt)||now>=s.expiresAt||!positive(amount))return null;
 const sign=s.direction==='LONG'?1:-1;
 if(sign*(s.entry-s.stop)<=0||s.targets.some((target,i)=>sign*(target-(i?s.targets![i-1]:s.entry))<=0))return null;
 return {id:'demo:'+s.id,scenarioId:s.id,symbol:s.symbol,frame:s.frame||'5m',direction:s.direction,
  kind:'LIMIT',marketSource:'binance-public',virtualAmount:amount,
  entry:s.entry,initialStop:s.stop,effectiveStop:s.stop,targets:[...s.targets] as [number,number,number],
  tpShares:[...TP_SPLIT],tpReached:0,remainingShare:1,breakEven:false,grossPnl:0,
  status:'WAITING',createdAt:now,expiresAt:s.expiresAt,lastCandleTime:s.lastCandleTime,
  lastTpCandleTime:0,origin,context:captureContext(s,m,now),events:[{at:now,type:'CREATED',price:null,note:'Виртуальная LIMIT заявка создана из прогноза APEX.'}],
  note:'Ожидаем вход по лимитной цене. Истечение не относится к активной позиции.'};
}
export function addManualDemo(book:AssistantBook,s:Scenario,now:number,amount=100,m?:AssistantMarket):AssistantBook{
 if(book.mode!=='manual'||book.orders.some(o=>o.scenarioId===s.id)
    ||book.orders.filter(o=>!terminal.has(o.status)).length>=3)return book;
 const order=makeDemoLimit(s,now,amount,'manual',m);
 return order?{...book,orders:[order,...book.orders].slice(0,250)}:book;
}
function finish(o:DemoOrder,status:DemoStatus,exit:DemoExit,at:number,price:number,note:string):DemoOrder{
 const open=o.status==='OPEN',remaining=open?o.remainingShare:0;
 const next={...o,status,exit,closedAt:at,closedPrice:price,
  grossPnl:o.grossPnl+(open?pnl(o,price,remaining):0),remainingShare:0};
 return append(next,exit,at,price,note);
}
function candlesAfter(o:DemoOrder,m:AssistantMarket|undefined):Candle[]{
 const bars=(o.frame==='5m'?m?.candles:m?.frames?.[o.frame])||[];
 return bars.filter(c=>c.closed!==false&&Number.isFinite(c.time)&&c.time>o.lastCandleTime
  &&positive(c.high)&&positive(c.low)&&positive(c.close))
  .sort((a,b)=>a.time-b.time);
}
function hitTarget(o:DemoOrder,c:Candle,target:number):boolean{
 return o.direction==='LONG'?c.high>=target:c.low<=target;
}
function hitStop(o:DemoOrder,c:Candle):boolean{
 return o.direction==='LONG'?c.low<=o.effectiveStop:c.high>=o.effectiveStop;
}
/** Only an opposing fresh confirmed signal AFTER the TP candle can trigger reversal exit. */
function reversed(o:DemoOrder,m:AssistantMarket|undefined,now:number):boolean{
 const s=m?.signals?.[o.frame];
 return o.status==='OPEN'&&o.tpReached>=1&&o.lastTpCandleTime>0&&fresh(m,now)
  &&s?.phase==='CONFIRMED'&&s.direction!==o.direction&&s.candleTime>o.lastTpCandleTime
  &&now-s.timestamp>=0&&now-s.timestamp<=frameMs[o.frame]*2;
}
/** Deterministic closed-candle execution. Ambiguous same-bar SL/TP always resolves to SL. */
export function advanceDemo(o:DemoOrder,m:AssistantMarket|undefined,now:number):DemoOrder{
 if(terminal.has(o.status))return o;
 let out=o;
 for(const c of candlesAfter(out,m)){
  const observedAt=c.time+frameMs[out.frame];
  if(c.time-out.lastCandleTime>2*frameMs[out.frame]){
   return append({...out,status:'NEEDS_REVIEW',exit:'DATA_GAP'},'DATA_GAP',observedAt,null,
    'Пропущены свечи. Демо приостановлено: нельзя достоверно восстановить последовательность исполнения.');
  }
  if(out.status==='WAITING'){
   if(c.time>=out.expiresAt){
    return finish(out,'EXPIRED','EXPIRED',out.expiresAt,out.entry,'Срок лимитной заявки истёк без подтверждённого входа.');
   }
   const touch=c.low<=out.entry&&c.high>=out.entry;
   if(touch&&observedAt<=out.expiresAt){
    const stopOnSameBar=out.direction==='LONG'?c.low<=out.initialStop:c.high>=out.initialStop;
    if(stopOnSameBar){
     const activated=append({...out,status:'OPEN',activatedAt:observedAt,lastCandleTime:c.time},
      'ACTIVATED',observedAt,out.entry,'Вход и стоп на одной свече: считаем неблагоприятный порядок.');
     return finish(activated,'CLOSED','STOP',observedAt,out.initialStop,
      'В одной свече затронуты вход и стоп; демо консервативно учитывает стоп.');
    }
    out=append({...out,status:'OPEN',activatedAt:observedAt,lastCandleTime:c.time},
     'ACTIVATED',observedAt,out.entry,'Касание лимитного входа подтверждено закрытой свечой.');
    continue; // No favorable same-candle TP after an ambiguous entry.
   }
   if(observedAt>=out.expiresAt)return finish(out,'EXPIRED','EXPIRED',out.expiresAt,out.entry,'Срок лимитного входа истёк.');
  }else if(out.status==='OPEN'){
   if(hitStop(out,c))return finish({...out,lastCandleTime:c.time},'CLOSED',
    out.breakEven?'BREAK_EVEN':'STOP',observedAt,out.effectiveStop,
    out.breakEven?'Оставшаяся доля закрыта по безубытку.':'Виртуальная защита достигнута.');
   while(out.tpReached<3&&hitTarget(out,c,out.targets[out.tpReached])){
    const index=out.tpReached,price=out.targets[index],share=out.tpShares[index];
    out={...out,tpReached:index+1,remainingShare:Math.max(0,1-out.tpShares.slice(0,index+1).reduce((a,b)=>a+b,0)),
     grossPnl:out.grossPnl+pnl(out,price,share),lastTpCandleTime:c.time};
    out=append(out,'TP'+(index+1),observedAt,price,
      'TP'+(index+1)+' достигнут: закрыто виртуально '+Math.round(share*100)+'% начального объёма.');
    if(index===0){
     out=append({...out,breakEven:true,effectiveStop:out.entry},'BE',observedAt,out.entry,
      'После TP1 защита оставшейся доли перемещена в безубыток.');
    }
   }
   if(out.tpReached===3)return finish({...out,lastCandleTime:c.time},'CLOSED','TP3',observedAt,out.targets[2],
    'TP3 выполнен. Все три части демо-позиции закрыты.');
  }
  out={...out,lastCandleTime:c.time};
 }
 if(out.status==='WAITING'&&now>=out.expiresAt)
  return finish(out,'EXPIRED','EXPIRED',out.expiresAt,out.entry,
   'Лимитная демо-заявка отменена по истечении срока ожидания.');
 if(reversed(out,m,now))
  return finish(out,'CLOSED','REVERSAL',now,m!.price,
   'После TP1/TP2 поступило новое подтверждение противоположного движения. Остаток закрыт виртуально.');
 return out;
}
export function closeDemo(book:AssistantBook,id:string,now:number,m:AssistantMarket|undefined):AssistantBook{
 const updated=book.orders.map(o=>{
  if(o.id!==id||terminal.has(o.status))return o;
  if(o.status==='WAITING')return finish(o,'CANCELLED','CANCELLED',now,o.entry,
   'Лимитная демо-заявка отменена пользователем.');
  if(o.status==='OPEN'&&fresh(m,now))return finish(o,'CLOSED','MANUAL',now,m!.price,
   'Пользователь завершил демо-позицию по свежей котировке.');
  return o;
 });
 return updated.some((o,i)=>o!==book.orders[i])?{...book,orders:updated}:book;
}
export function reconcileAssistant(book:AssistantBook,scenarios:Scenario[],markets:Record<string,AssistantMarket>,
 now:number):AssistantBook{
 let changed=false;
 let orders=book.orders.map(o=>{
  const next=advanceDemo(o,markets[o.symbol],now);
  if(next!==o)changed=true;
  return next;
 });
 if(book.mode==='auto'){
  const candidates=scenarios.filter(s=>s.status==='PENDING'&&s.createdAt>=book.autoSince
    &&now-s.createdAt<=frameMs[s.frame||'5m']*2).sort((a,b)=>a.createdAt-b.createdAt);
  for(const s of candidates){
   if(orders.filter(o=>!terminal.has(o.status)).length>=3)break;
   if(orders.some(o=>o.scenarioId===s.id)||orders.some(o=>o.symbol===s.symbol&&!terminal.has(o.status)))continue;
   const m=markets[s.symbol],signal=m?.signals?.[s.frame||'5m'];
   if(!fresh(m,now)||signal?.phase!=='CONFIRMED'||signal.direction!==s.direction
     ||signal.id!==s.originalSignalId)continue;
   const order=makeDemoLimit(s,now,100,'auto',m);
   if(order){orders=[order,...orders];changed=true;}
  }
 }
 return changed?{...book,orders:orders.slice(0,250)}:book;
}
export function assistantSummary(book:AssistantBook){
 const completed=book.orders.filter(o=>terminal.has(o.status));
 return {waiting:book.orders.filter(o=>o.status==='WAITING').length,
  open:book.orders.filter(o=>o.status==='OPEN').length,
  done:completed.length,review:completed.filter(o=>o.status==='NEEDS_REVIEW').length,
  grossPnl:completed.filter(o=>o.status!=='NEEDS_REVIEW').reduce((sum,o)=>sum+o.grossPnl,0),
  tp1:book.orders.filter(o=>o.tpReached>=1).length};
}
