/** Read-only public candles for APEX demo assistant.
 * No trading endpoints, authentication tokens, wallet permissions or orders.
 */
import type {DemoBar,AssistantFrame} from './demo-assistant';
const DURATION:{[key in AssistantFrame]:number}={'5m':300000,'1h':3600000,'4h':14400000};
const BYBIT_INTERVAL:{[key in AssistantFrame]:string}={'5m':'5','1h':'60','4h':'240'};
const FINITE=(n:number)=>Number.isFinite(n)&&n>0;
export function decodeBybitSpotKlines(raw:unknown,frame:AssistantFrame,now=Date.now()):DemoBar[]{
 if(!raw||typeof raw!=='object')throw Error('Bybit: пустой ответ.');
 const packet=raw as {retCode?:unknown;result?:{category?:unknown;list?:unknown}};
 if(packet.retCode!==0||packet.result?.category!=='spot'||!Array.isArray(packet.result.list))
  throw Error('Bybit: неверный или недоступный публичный рынок Spot.');
 const out:DemoBar[]=[];
 for(const x of packet.result.list.slice(0,150)){
  if(!Array.isArray(x)||x.length<5)continue;
  const [time,open,high,low,close]=x.slice(0,5).map(Number);
  if(!Number.isInteger(time)||time<=0||time+DURATION[frame]>now||
   ![open,high,low,close].every(FINITE)||low>high||low>Math.min(open,close)||high<Math.max(open,close))continue;
  out.push({time,open,high,low,close,closed:true});
 }
 out.sort((a,b)=>a.time-b.time);
 return out.filter((x,i)=>i===0||x.time!==out[i-1].time);
}
export async function fetchBybitSpotClosedBars(symbol:string,frame:AssistantFrame,now=Date.now()):Promise<DemoBar[]>{
 if(!/^[A-Z0-9]{5,24}$/.test(symbol))throw Error('Bybit: неверный тикер.');
 const params=new URLSearchParams({category:'spot',symbol,interval:BYBIT_INTERVAL[frame],limit:'120'});
 const response=await fetch('https://api.bybit.com/v5/market/kline?'+params.toString(),{method:'GET',cache:'no-store'});
 if(!response.ok)throw Error('Bybit: публичные свечи недоступны ('+response.status+').');
 const rows=decodeBybitSpotKlines(await response.json(),frame,now);
 if(!rows.length)throw Error('Bybit: нет завершённых свечей для '+symbol+'.');
 return rows;
}
