/** APEX 8.7 — NON-TRADING TESTNET connectivity and simulated order-response lab.
 *
 * No API keys. No signed endpoints, POST, DELETE, PUT, leverage operations,
 * real-money accounts, orders or account data. Fixed public TESTNET hosts,
 * response-boundary checks and session-only mock lifecycle observations.
 *
 * This helps verify transport and UI before anyone works with an actual
 * exchange-account integration in a separate, appropriately authorized system.
 */
export type SandboxVenue='binance'|'bybit';
export type SandboxLinkState='IDLE'|'CHECKING'|'OK'|'ERROR';
export type SandboxProbe={
 venue:SandboxVenue;status:'OK'|'ERROR';checkedAt:number;
 latencyMs:number|null;exchangeClockMs:number|null;clockSkewMs:number|null;
 note:string;kind:'TESTNET_PUBLIC_CLOCK';
};
export type SandboxOrderStatus=
 'NEW'|'PARTIALLY_FILLED'|'FILLED'|'CANCELLED'|'REJECTED'|'EXPIRED';
export type SandboxEvent={
 venue:SandboxVenue;stage:SandboxOrderStatus;at:number;
 filledPct:number;symbol:string;origin:'LOCAL_FIXTURE';
 note:string;
};
export const FIXED_TESTNET_PUBLIC_CLOCK_ENDPOINTS:Readonly<Record<SandboxVenue,string>>={
 binance:'https://demo-fapi.binance.com/fapi/v1/time',
 bybit:'https://api-testnet.bybit.com/v5/market/time'
};
const HOSTS:Readonly<Record<SandboxVenue,string>>={
 binance:'demo-fapi.binance.com',bybit:'api-testnet.bybit.com'
};
const allowed=(venue:SandboxVenue,url:string)=>{
 try{
  const parsed=new URL(url);
  return parsed.protocol==='https:'&&parsed.host===HOSTS[venue]&&
   parsed.pathname===(venue==='binance'?'/fapi/v1/time':'/v5/market/time')&&
   parsed.search===''&&parsed.hash===''&&parsed.username===''&&parsed.password==='';
 }catch{return false;}
};
const validTime=(value:unknown)=>Number.isSafeInteger(value)&&Number(value)>0;
const nonNegative=(value:unknown)=>typeof value==='number'&&Number.isFinite(value)&&value>=0;
const isRecord=(v:unknown):v is Record<string,unknown>=>
 v!==null&&typeof v==='object'&&!Array.isArray(v);
const bounded=(message:string)=>message.slice(0,160);
export function parseSandboxClockResponse(venue:SandboxVenue,raw:unknown,now=Date.now()):number{
 if(!isRecord(raw))throw Error('Тестовый API вернул неизвестную структуру времени.');
 let value:unknown;
 if(venue==='binance'){value=raw.serverTime;}
 else {
  if(raw.retCode!==0)throw Error('Тестовый API вернул отказ в запросе.');
  const result=isRecord(raw.result)?raw.result:null;
  const seconds=result?.timeSecond;
  value=validTime(raw.time)?raw.time:
   typeof seconds==='string'&&/^\d{9,12}$/.test(seconds)?Number(seconds)*1000:null;
 }
 if(!validTime(value)||Math.abs(Number(value)-now)>30*86400000)
  throw Error('Время тестового сервера не подтверждено или отличается более чем на 30 дней.');
 return Number(value);
}
/** A public GET: never accept custom hosts, params or auth headers.
 * Browser/Android restrictions may block cross-origin requests; those errors
 * are reported, never misrepresented as a live account connection.
 */
export async function checkSandboxPublicClock(venue:SandboxVenue,
 request:typeof fetch=fetch,clock:()=>number=Date.now,
 signal?:AbortSignal):Promise<SandboxProbe>{
 const started=clock(),url=FIXED_TESTNET_PUBLIC_CLOCK_ENDPOINTS[venue];
 if(!allowed(venue,url))throw Error('Нельзя выполнять запрос к неизвестному биржевому серверу.');
 const controller=new AbortController();
 const abort=()=>controller.abort();
 if(signal?.aborted)abort();
 signal?.addEventListener('abort',abort,{once:true});
 const timer=setTimeout(()=>controller.abort(),7000);
 try{
  const response=await request(url,{method:'GET',cache:'no-store',redirect:'error',
   credentials:'omit',mode:'cors',signal:controller.signal,
   headers:{Accept:'application/json'}});
  if(!response.ok)throw Error('Тестовый сервер: HTTP '+response.status);
  const body=await response.text();
  if(body.length>2048)throw Error('Необычно большой ответ тестового сервера.');
  let raw:unknown;try{raw=JSON.parse(body);}catch{throw Error('Нечитаемый ответ тестового сервера.');}
  const received=clock(),exchangeClockMs=parseSandboxClockResponse(venue,raw,received);
  return {venue,status:'OK',kind:'TESTNET_PUBLIC_CLOCK',
   checkedAt:received,latencyMs:Math.max(0,received-started),
   exchangeClockMs,clockSkewMs:exchangeClockMs-received,
   note:'Подтверждён публичный ответ тестового API. Личный счёт не подключён.'};
 }catch(e){
  const received=clock();
  return {venue,status:'ERROR',kind:'TESTNET_PUBLIC_CLOCK',
   checkedAt:received,latencyMs:null,exchangeClockMs:null,clockSkewMs:null,
   note:bounded(controller.signal.aborted?
    'Запрос тестового сервера прерван или превысил ограничение времени.':
    e instanceof Error&&/^Тестовый сервер: HTTP \d{3}$/.test(e.message)?e.message:
    'Тестовый публичный API недоступен или запрос заблокирован сетью/WebView.')};
 }finally{
  clearTimeout(timer);signal?.removeEventListener('abort',abort);
 }
}
/** Locally generated DEMO lifecycle fixtures; NOT actual order receipts.
 * These events are never persisted or imported into paper trading statistics.
 */
export function makeLocalSandboxOrderSequence(venue:SandboxVenue,
 now=Date.now(),scenario:'complete'|'cancel'='complete'):SandboxEvent[]{
 const symbol='BTCUSDT';
 if(!validTime(now))throw Error('Некорректное локальное время демонстрации.');
 const base:{stage:SandboxOrderStatus;filledPct:number;note:string}[]=
 scenario==='cancel'?[
  {stage:'NEW',filledPct:0,note:'Учебная заявка создана'},
  {stage:'PARTIALLY_FILLED',filledPct:30,note:'Часть учебного объёма исполнена'},
  {stage:'CANCELLED',filledPct:30,note:'Оставшаяся часть отменена'}
 ]:[
  {stage:'NEW',filledPct:0,note:'Учебная заявка создана'},
  {stage:'PARTIALLY_FILLED',filledPct:30,note:'Часть учебного объёма исполнена'},
  {stage:'FILLED',filledPct:100,note:'Учебное исполнение завершено'}
 ];
 return base.map((event,i)=>({venue,symbol,stage:event.stage,filledPct:event.filledPct,
  at:now+i,origin:'LOCAL_FIXTURE',note:event.note}));
}
const TRANSITIONS:Record<SandboxOrderStatus,SandboxOrderStatus[]>={
 NEW:['PARTIALLY_FILLED','FILLED','CANCELLED','REJECTED','EXPIRED'],
 PARTIALLY_FILLED:['PARTIALLY_FILLED','FILLED','CANCELLED','EXPIRED'],
 FILLED:[],CANCELLED:[],REJECTED:[],EXPIRED:[]
};
export function checkLocalSandboxLifecycle(events:readonly SandboxEvent[]):{
 valid:boolean;ending:SandboxOrderStatus|null;note:string
}{
 if(events.length===0||events.length>20)return {valid:false,ending:null,note:'Нужна ограниченная последовательность.'};
 const first=events[0];
 if(first.stage!=='NEW'||first.filledPct!==0||first.origin!=='LOCAL_FIXTURE')
  return {valid:false,ending:null,note:'Последовательность должна начинаться с NEW без исполнения.'};
 for(let i=0;i<events.length;i++){
  const e=events[i],prev=events[i-1];
  if(e.origin!=='LOCAL_FIXTURE'||e.symbol!==first.symbol||e.venue!==first.venue||
   !validTime(e.at)||!nonNegative(e.filledPct)||e.filledPct>100||
   (i>0&&(!prev||e.at<prev.at||e.filledPct<prev.filledPct||
    !TRANSITIONS[prev.stage]?.includes(e.stage)))||
   (e.stage==='FILLED'&&e.filledPct!==100))
   return {valid:false,ending:null,note:'Нарушены допустимые состояния или данные объёма.'};
 }
 return {valid:true,ending:events[events.length-1].stage,
  note:'Корректная локальная демонстрация переходов; не является ответом приватного API.'};
}
