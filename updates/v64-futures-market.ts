/** Public USDⓈ-M / USDT perpetual observations only. No private API or exchange account control. */
import type {AssistantExchange,AssistantFrame} from './demo-assistant';
export type FutureBar={time:number;open:number;high:number;low:number;close:number;volume:number;closed:true};
const DURATION:Record<AssistantFrame,number>={'5m':300000,'1h':3600000,'4h':14400000};
const BYBIT_INTERVAL:Record<AssistantFrame,string>={'5m':'5','1h':'60','4h':'240'};
const BINANCE_INTERVAL:Record<AssistantFrame,string>={'5m':'5m','1h':'1h','4h':'4h'};
const finite=(n:number)=>Number.isFinite(n)&&n>0;
function unpack(rows:unknown,frame:AssistantFrame,now:number,volumeIndex:number):FutureBar[]{
 if(!Array.isArray(rows))throw Error('Нет списка фьючерсных свечей.');
 const out:FutureBar[]=[];
 for(const value of rows.slice(0,160)){
  if(!Array.isArray(value)||value.length<6)continue;
  const time=Number(value[0]),open=Number(value[1]),high=Number(value[2]),low=Number(value[3]),close=Number(value[4]),volume=Number(value[volumeIndex]);
  if(!Number.isInteger(time)||time<=0||time+DURATION[frame]>now||![open,high,low,close].every(finite)||
   !Number.isFinite(volume)||volume<0||low>high||low>Math.min(open,close)||high<Math.max(open,close))continue;
  out.push({time,open,high,low,close,volume,closed:true});
 }
 out.sort((a,b)=>a.time-b.time);
 return out.filter((b,i)=>i===0||b.time!==out[i-1].time);
}
export function decodeFutureKlines(raw:unknown,exchange:AssistantExchange,frame:AssistantFrame,now=Date.now()):FutureBar[]{
 if(exchange==='bybit'){
  const packet=raw as {retCode?:unknown;result?:{category?:unknown;list?:unknown}}|null;
  if(!packet||packet.retCode!==0||packet.result?.category!=='linear')
   throw Error('Bybit: ответ не относится к USDT linear-фьючерсам.');
  return unpack(packet.result.list,frame,now,5);
 }
 return unpack(raw,frame,now,5);
}
export async function fetchFuturesClosedBars(exchange:AssistantExchange,symbol:string,frame:AssistantFrame,now=Date.now()):Promise<FutureBar[]>{
 if(!/^[A-Z0-9]{5,24}$/.test(symbol)||!['5m','1h','4h'].includes(frame))throw Error('Неверный фьючерсный символ или таймфрейм.');
 const url=exchange==='bybit'
  ?'https://api.bybit.com/v5/market/kline?'+new URLSearchParams({category:'linear',symbol,interval:BYBIT_INTERVAL[frame],limit:'120'}).toString()
  :'https://fapi.binance.com/fapi/v1/klines?'+new URLSearchParams({symbol,interval:BINANCE_INTERVAL[frame],limit:'120'}).toString();
 const response=await fetch(url,{method:'GET',cache:'no-store'});
 if(!response.ok)throw Error((exchange==='bybit'?'Bybit':'Binance Futures')+': HTTP '+response.status);
 const result=decodeFutureKlines(await response.json(),exchange,frame,now);
 if(!result.length)throw Error('Нет завершённых фьючерсных свечей для '+symbol+'.');
 return result;
}