/** APEX 6.4 forward-only educational futures ledger. Read-only market data, zero exchange account operations.
 * The notional and leverage are VIRTUAL. Gross PnL excludes actual fees, funding, slippage,
 * mark-price liquidation and maintenance tiers; this is not a broker execution simulator.
 */
import type {AssistantExchange,AssistantFrame,AssistantMode} from './demo-assistant';
import type {FutureBar} from './v64-futures-market';
export type FutureMarginMode='ISOLATED'|'CROSS';
export type FuturePositionMode='ONE_WAY'|'HEDGE';
export type FuturePhase='WAITING'|'OPEN'|'CLOSED'|'EXPIRED'|'CANCELLED';
export type FutureQuality='OK'|'GAP';
export type FutureSetup={
 exchange:AssistantExchange;leverage:1|2|3|5;marginMode:FutureMarginMode;
 positionMode:FuturePositionMode;notionalUSDT:number;portions:[number,number,number];breakeven:boolean;
};
export type FuturePlan={
 id:string;source:AssistantExchange;symbol:string;frame:AssistantFrame;direction:'LONG'|'SHORT';
 entry:number;stop:number;targets:[number,number,number];createdAt:number;expiresAt:number;
 observedBarAt:number;reason:string;model:'futures-study-v1';
};
export type FutureEvent={at:number;type:string;detail:string};
export type FutureTicket={
 id:string;plan:FuturePlan;setup:FutureSetup;mode:AssistantMode;state:FuturePhase;quality:FutureQuality;
 createdAt:number;lastBarAt:number;activatedAt?:number;closedAt?:number;closeReason?:string;
 protectiveStop:number;tpReached:number;remainingPct:number;grossUSDT:number;
 events:FutureEvent[];
};
export type FutureLedger={version:1;tickets:FutureTicket[]};
export const FUTURE_FRAME_MS:Record<AssistantFrame,number>={'5m':300000,'1h':3600000,'4h':14400000};
export const EMPTY_FUTURES_LEDGER:FutureLedger={version:1,tickets:[]};
const MAX=80,MAX_EVENTS=32;
const finite=(x:unknown):x is number=>typeof x==='number'&&Number.isFinite(x);
const positive=(x:unknown):x is number=>finite(x)&&x>0;
export function validFutureSetup(s:unknown):s is FutureSetup{
 if(!s||typeof s!=='object')return false;
 const x=s as FutureSetup;
 return ['binance','bybit'].includes(x.exchange)&&[1,2,3,5].includes(x.leverage)&&
  ['ISOLATED','CROSS'].includes(x.marginMode)&&['ONE_WAY','HEDGE'].includes(x.positionMode)&&
  finite(x.notionalUSDT)&&x.notionalUSDT>=10&&x.notionalUSDT<=10000&&
  Array.isArray(x.portions)&&x.portions.length===3&&
  x.portions.every(n=>Number.isInteger(n)&&n>=1&&n<=98)&&x.portions.reduce((a,b)=>a+b,0)===100&&
  typeof x.breakeven==='boolean';
}
const sign=(d:'LONG'|'SHORT')=>d==='LONG'?1:-1;
const event=(o:FutureTicket,at:number,type:string,detail:string):FutureTicket=>
 ({...o,events:[...o.events,{at,type,detail}].slice(-MAX_EVENTS)});
const close=(o:FutureTicket,at:number,why:string,type:string,price?:number):FutureTicket=>{
 const p=o.plan;
 const gross=price===undefined?o.grossUSDT:o.grossUSDT+
  sign(p.direction)*(price-p.entry)/p.entry*o.setup.notionalUSDT*(o.remainingPct/100);
 return event({...o,state:type==='EXPIRED'?'EXPIRED':type==='CANCELLED'?'CANCELLED':'CLOSED',
  closedAt:at,closeReason:why,remainingPct:price===undefined?o.remainingPct:0,grossUSDT:gross},at,type,why);
};
function validBar(b:FutureBar,frame:AssistantFrame,now:number){
 return b?.closed===true&&Number.isInteger(b.time)&&b.time>0&&
  b.time+FUTURE_FRAME_MS[frame]<=now&&
  positive(b.open)&&positive(b.high)&&positive(b.low)&&positive(b.close)&&
  b.low<=Math.min(b.open,b.close)&&b.high>=Math.max(b.open,b.close)&&b.low<=b.high;
}
/** Uses ONLY selected exchange's closed linear futures candles; never reuses Spot proposals.
 * One proposal per immutable last candle, no historical signals manufactured.
 */
export function deriveFuturesStudyPlan(source:AssistantExchange,symbol:string,frame:AssistantFrame,
 bars:FutureBar[],now=Date.now()):FuturePlan|null{
 if(!/^[A-Z0-9]{5,24}$/.test(symbol)||!Array.isArray(bars)||bars.length<36)return null;
 const duration=FUTURE_FRAME_MS[frame],recent=bars.slice(-36);
 if(recent.some(b=>!validBar(b,frame,now)))return null;
 for(let i=1;i<recent.length;i++)if(recent[i].time-recent[i-1].time!==duration)return null;
 const last=recent[recent.length-1];
 if(now-(last.time+duration)>duration*1.5)return null;
 const avgRange=recent.slice(-20).reduce((sum,b)=>sum+(b.high-b.low),0)/20;
 if(!positive(avgRange))return null;
 const delta=last.close-recent[recent.length-9].close;
 if(Math.abs(delta)<avgRange*0.8)return null;
 const direction=delta>0?'LONG':'SHORT',side=sign(direction);
 const entry=last.close-side*avgRange*.45,risk=avgRange*1.6;
 const stop=entry-side*risk;
 const targets:[number,number,number]=[entry+side*risk*.8,entry+side*risk*1.5,entry+side*risk*2.4];
 if(![entry,stop,...targets].every(positive))return null;
 return {id:'futures:'+source+':'+symbol+':'+frame+':'+last.time+':'+direction,source,symbol,frame,
  direction,entry,stop,targets,createdAt:now,expiresAt:now+Math.min(24*3600000,Math.max(3600000,duration*12)),
  observedBarAt:last.time,reason:'Исследовательская модель: движение 8 свечей против среднего диапазона 20; не подтверждённый торговый сигнал.',
  model:'futures-study-v1'};
}
export function createFutureTicket(p:FuturePlan,s:FutureSetup,mode:AssistantMode,now=Date.now()):FutureTicket{
 if(!validFutureSetup(s)||s.exchange!==p.source||!['manual','auto'].includes(mode)||!positive(p.entry)||
  !positive(p.stop)||!p.targets.every(positive)||p.createdAt>now||p.expiresAt<=now||
  p.observedBarAt+FUTURE_FRAME_MS[p.frame]>now||
  sign(p.direction)*(p.entry-p.stop)<=0||
  p.targets.some((v,i)=>sign(p.direction)*(v-(i?p.targets[i-1]:p.entry))<=0))
  throw Error('Недействительный виртуальный фьючерсный план.');
 return {id:p.id,plan:p,setup:{...s,portions:[...s.portions] as [number,number,number]},mode,
  state:'WAITING',quality:'OK',createdAt:now,lastBarAt:p.observedBarAt,
  protectiveStop:p.stop,tpReached:0,remainingPct:100,grossUSDT:0,
  events:[{at:now,type:'PLAN',detail:'Виртуальный '+p.direction+' LIMIT · '+s.exchange+' USDT perpetual · '+s.marginMode+' · '+s.positionMode+' · '+s.leverage+'x.'}]};
}
const done=(o:FutureTicket)=>!['WAITING','OPEN'].includes(o.state);
export function enrollFutureTicket(old:FutureLedger,p:FuturePlan,s:FutureSetup,mode:AssistantMode,now=Date.now()):FutureLedger{
 if(old.tickets.some(o=>o.id===p.id))return old;
 if(old.tickets.length>=MAX||old.tickets.filter(o=>!done(o)).length>=6)return old;
 if(s.positionMode==='ONE_WAY'&&old.tickets.some(o=>!done(o)&&o.plan.source===p.source&&o.plan.symbol===p.symbol&&o.plan.direction!==p.direction))
  return old; // one-way demo cannot carry opposite directions concurrently
 const ticket=createFutureTicket(p,s,mode,now);
 return {...old,tickets:[ticket,...old.tickets]};
}
function targetHit(o:FutureTicket,b:FutureBar,i:number){
 return o.plan.direction==='LONG'?b.high>=o.plan.targets[i]:b.low<=o.plan.targets[i];
}
function stopHit(o:FutureTicket,b:FutureBar){
 return o.plan.direction==='LONG'?b.low<=o.protectiveStop:b.high>=o.protectiveStop;
}
export function advanceFuturesTicket(original:FutureTicket,bars:FutureBar[],now=Date.now()):FutureTicket{
 if(done(original)||!Array.isArray(bars))return original;
 const duration=FUTURE_FRAME_MS[original.plan.frame],p=original.plan;
 const forward=bars.filter(b=>validBar(b,p.frame,now)&&b.time>original.lastBarAt).sort((a,b)=>a.time-b.time);
 let o=original;
 for(const b of forward){
  if(done(o))break;
  // Missing futures observations => hold state; NEVER silently skip and invent fills.
  if(b.time!==o.lastBarAt+duration){
   return o.quality==='GAP'?o:{...o,quality:'GAP'};
  }
  const at=b.time+duration;
  o={...o,lastBarAt:b.time,quality:'OK'};
  // Candle opened before demo registration: intrabar entry timing is unknowable.
  if(b.time<o.createdAt)continue;
  if(o.state==='WAITING'){
   if(at>p.expiresAt){o=close(o,p.expiresAt,'Срок виртуального лимита истёк; внутрисвечное касание на границе срока не считается подтверждённым.','EXPIRED');break;}
   if(b.low<=p.entry&&b.high>=p.entry){
    o=event({...o,state:'OPEN',activatedAt:at},at,'ENTRY','Касание виртуального LIMIT по завершённой фьючерсной свече; точное исполнение неизвестно.');
    if(stopHit(o,b)){o=close(o,at,'На свече входа затронута защита; консервативный выход.','STOP',o.protectiveStop);break;}
   }
   continue; // Don't assert an entry followed by TP on the same OHLC bar.
  }
  if(stopHit(o,b)){o=close(o,at,'Защитный уровень затронут (при неоднозначности приоритет защите).','STOP',o.protectiveStop);break;}
  for(let i=o.tpReached;i<3&&targetHit(o,b,i);i++){
   const pct=o.setup.portions[i],gain=sign(p.direction)*(p.targets[i]-p.entry)/p.entry*o.setup.notionalUSDT*pct/100;
   o=event({...o,tpReached:i+1,remainingPct:Math.max(0,o.remainingPct-pct),grossUSDT:o.grossUSDT+gain},
     at,'TP'+(i+1),'Виртуальная цель TP'+(i+1)+': закрыто '+pct+'%.');
  }
  if(o.tpReached===3){o=close(o,at,'Три виртуальные цели достигнуты.','COMPLETED');break;}
  if(o.tpReached>=1&&o.setup.breakeven&&o.protectiveStop!==p.entry){
   o=event({...o,protectiveStop:p.entry},at,'BE','Безубыток виртуальной остаточной доли от следующей свечи; комиссии не включены.');
  }
 }
 // No time-only expiration without candle evidence; the app may have been suspended.
 return o===original?original:o;
}
export function stepFuturesLedger(old:FutureLedger,observations:Record<string,FutureBar[]>,now=Date.now()):FutureLedger{
 let changed=false;
 const tickets=old.tickets.map(o=>{
  const k=o.plan.source+':'+o.plan.symbol+':'+o.plan.frame;
  const next=advanceFuturesTicket(o,observations[k]||[],now);
  if(next!==o)changed=true;
  return next;
 });
 return changed?{...old,tickets}:old;
}
export function stopFutureDemo(old:FutureLedger,id:string,observations:Record<string,FutureBar[]>,now=Date.now()):FutureLedger{
 const existing=old.tickets.find(o=>o.id===id);
 if(!existing||done(existing))return old;
 let updated:FutureTicket;
 if(existing.state==='WAITING')updated=close(existing,now,'Виртуальный лимит отменён вручную.','CANCELLED');
 else{
  const p=existing.plan,frame=FUTURE_FRAME_MS[p.frame];
  const bars=observations[p.source+':'+p.symbol+':'+p.frame]||[];
  const last=[...bars].reverse().find(b=>validBar(b,p.frame,now));
  if(!last||now-(last.time+frame)>frame*2)return old; // stale data cannot supply a closure price
  updated=close(existing,now,'Закрыто в учебной модели по последней закрытой свече (не фактическая котировка исполнения).','MANUAL',last.close);
 }
 return {...old,tickets:old.tickets.map(o=>o.id===id?updated:o)};
}
export function restoreFuturesLedger(raw:string|null,now=Date.now()):FutureLedger{
 try{
  const r=JSON.parse(raw||'null') as FutureLedger;
  if(r?.version!==1||!Array.isArray(r.tickets)||r.tickets.length>MAX)return EMPTY_FUTURES_LEDGER;
  const ids=new Set<string>();
  const tickets=r.tickets.filter(o=>{
   if(!o||typeof o.id!=='string'||!o.id.startsWith('futures:')||ids.has(o.id)||
    !validFutureSetup(o.setup)||!o.plan||o.id!==o.plan.id||
    !['WAITING','OPEN','CLOSED','EXPIRED','CANCELLED'].includes(o.state)||
    !positive(o.plan.entry)||!positive(o.plan.stop)||!Number.isInteger(o.lastBarAt)||
    !finite(o.createdAt)||o.createdAt>now||!finite(o.grossUSDT)||
    !Array.isArray(o.events)||o.events.length>MAX_EVENTS)return false;
   ids.add(o.id);return true;
  });
  return {version:1,tickets}; // invalid items are excluded rather than erasing valid entries
 }catch{return EMPTY_FUTURES_LEDGER;}
}
export function futureSummary(ledger:FutureLedger){
 return {waiting:ledger.tickets.filter(o=>o.state==='WAITING').length,
  open:ledger.tickets.filter(o=>o.state==='OPEN').length,
  ended:ledger.tickets.filter(o=>done(o)).length};
}
export function virtualMarginUSDT(s:FutureSetup){return s.notionalUSDT/s.leverage;}