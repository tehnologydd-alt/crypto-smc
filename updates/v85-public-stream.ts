/** APEX 8.5 — PUBLIC, credential-free streaming data diagnostics.
 * Separate Binance USD-M and Bybit linear WebSocket candles. This module does
 * not enter futuresBars, orders, wallet balances, signals, trading APIs or
 * trusted REST history; a socket is merely a second observational channel.
 */
import type {AssistantExchange,AssistantFrame} from './demo-assistant';
import type {FutureBar} from './v64-futures-market';
import {FUTURE_FRAME_MS} from './v64-futures-assistant';

export type StreamKey=string;
export type PublicSocketStatus='OFF'|'CONNECTING'|'OPEN'|'RETRYING'|'ERROR'|'PAUSED';
export type PublicVenueStatus={venue:AssistantExchange;status:PublicSocketStatus;
 connectedAt:number|null;lastMessageAt:number|null;attempts:number;
 error:string|null;subscriptions:number};
export type PublicStreamObservation={key:string;venue:AssistantExchange;
 symbol:string;frame:AssistantFrame;lastConfirmedAt:number;
 receivedAt:number;close:number;volume:number;messages:number;gaps:number};
export const STREAM_LIMIT_PER_VENUE=10;
export const streamKeyValid=(key:string):boolean=>
 /^(binance|bybit):[A-Z0-9]{5,24}:(5m|1h|4h)$/.test(key);
const positive=(v:number)=>Number.isFinite(v)&&v>0;
function parseNumbers(start:unknown,open:unknown,high:unknown,low:unknown,
 close:unknown,volume:unknown,frame:AssistantFrame,now:number):FutureBar|null{
 const t=Number(start),o=Number(open),h=Number(high),l=Number(low),c=Number(close),v=Number(volume);
 const ms=FUTURE_FRAME_MS[frame];
 if(!Number.isSafeInteger(t)||t<=0||t+ms>now+5000||t+ms<now-7*86400000||
  ![o,h,l,c].every(positive)||!Number.isFinite(v)||v<0||
  h<Math.max(o,c)||l>Math.min(o,c)||l<=0)return null;
 return {time:t,open:o,high:h,low:l,close:c,volume:v,closed:true};
}
export function venueSocketKeys(keys:readonly string[],venue:AssistantExchange):string[]{
 return [...new Set(keys)].filter(k=>streamKeyValid(k)&&k.startsWith(venue+':')).slice(0,STREAM_LIMIT_PER_VENUE);
}
const binanceStream=(key:string)=>{
 const [,symbol,frame]=key.split(':');return symbol.toLowerCase()+'@kline_'+frame;
};
const bybitTopic=(key:string)=>{
 const [,symbol,frame]=key.split(':');
 const interval=frame==='5m'?'5':frame==='1h'?'60':'240';
 return 'kline.'+interval+'.'+symbol;
};
export function publicSocketEndpoint(venue:AssistantExchange,keys:readonly string[]):string|null{
 const selected=venueSocketKeys(keys,venue);if(!selected.length)return null;
 return venue==='binance'?
  'wss://fstream.binance.com/stream?streams='+selected.map(binanceStream).join('/'):
  'wss://stream.bybit.com/v5/public/linear';
}
export function bybitSubscriptionArgs(keys:readonly string[]):string[]{
 return venueSocketKeys(keys,'bybit').map(bybitTopic);
}
export type ClosedSocketCandle={key:string;bar:FutureBar;venue:AssistantExchange};
export function decodePublicClosedSocketMessage(raw:unknown,venue:AssistantExchange,
 allowedKeys:readonly string[],now=Date.now()):ClosedSocketCandle[]{
 if(!raw||typeof raw!=='object'||!Number.isSafeInteger(now))return [];
 const allowed=new Set(venueSocketKeys(allowedKeys,venue));
 const x=raw as Record<string,unknown>;
 if(venue==='binance'){
  // Binance combined-stream payload wraps the raw kline in {stream,data}.
  const data=x.data&&typeof x.data==='object'?x.data as Record<string,unknown>:x;
  if(data.e!=='kline'||!data.k||typeof data.k!=='object')return [];
  const candle=data.k as Record<string,unknown>;
  if(candle.x!==true||typeof data.s!=='string'||data.s!==candle.s||
   typeof candle.i!=='string'||!['5m','1h','4h'].includes(candle.i))return [];
  const key='binance:'+data.s+':'+candle.i;
  if(!allowed.has(key))return [];
  if(typeof x.stream==='string'&&x.stream!==binanceStream(key))return [];
  const bar=parseNumbers(candle.t,candle.o,candle.h,candle.l,candle.c,candle.v,
   candle.i as AssistantFrame,now);
  return bar?[{key,bar,venue}]:[];
 }
 if(typeof x.topic!=='string'||!Array.isArray(x.data))return [];
 const match=/^kline\.(5|60|240)\.([A-Z0-9]{5,24})$/.exec(x.topic);
 if(!match)return [];
 const frame:AssistantFrame=match[1]==='5'?'5m':match[1]==='60'?'1h':'4h';
 const key='bybit:'+match[2]+':'+frame;
 if(!allowed.has(key))return [];
 const result:ClosedSocketCandle[]=[];
 for(const part of x.data.slice(0,10)){
  if(!part||typeof part!=='object')continue;
  const candle=part as Record<string,unknown>;
  if(candle.confirm!==true||candle.interval!==match[1])continue;
  const bar=parseNumbers(candle.start,candle.open,candle.high,candle.low,candle.close,
   candle.volume,frame,now);
  if(bar)result.push({key,bar,venue});
 }
 return result;
}
/** A confirmed and still recent close is logged once per source+symbol+frame;
 * duplicates are ignored, backdated events never replace newer receipts.
 * This is a monitoring event, not an order/mark trigger.
 */
export function addSocketObservation(prev:Record<string,PublicStreamObservation>,
 c:ClosedSocketCandle,receivedAt=Date.now()):Record<string,PublicStreamObservation>{
 if(!streamKeyValid(c.key)||!Number.isSafeInteger(receivedAt)||receivedAt<c.bar.time||
  c.bar.time+FUTURE_FRAME_MS[c.key.split(':')[2] as AssistantFrame]>receivedAt+5000)return prev;
 const old=prev[c.key];
 if(old&&c.bar.time<=old.lastConfirmedAt-FUTURE_FRAME_MS[c.key.split(':')[2] as AssistantFrame])return prev;
 const closedAt=c.bar.time+FUTURE_FRAME_MS[c.key.split(':')[2] as AssistantFrame];
 if(old&&closedAt===old.lastConfirmedAt)return prev;
 const expected=FUTURE_FRAME_MS[c.key.split(':')[2] as AssistantFrame];
 const gaps=old&&closedAt-old.lastConfirmedAt>expected?
  Math.min(1000,Math.max(1,Math.floor((closedAt-old.lastConfirmedAt)/expected)-1)):0;
 const out:{[key:string]:PublicStreamObservation}={...prev};
 out[c.key]={key:c.key,venue:c.venue,symbol:c.key.split(':')[1],
  frame:c.key.split(':')[2] as AssistantFrame,
  lastConfirmedAt:closedAt,receivedAt,close:c.bar.close,volume:c.bar.volume,
  messages:(old?.messages||0)+1,gaps:(old?.gaps||0)+gaps};
 return out;
}
export function socketAgeState(row:PublicStreamObservation|undefined,
 connected:PublicVenueStatus|undefined,frame:AssistantFrame,now=Date.now()):
 'OFF'|'CONNECTING'|'NO_CLOSE'|'FRESH'|'STALE'|'ERROR'|'PAUSED'{
 if(!connected||connected.status==='OFF')return 'OFF';
 if(connected.status==='PAUSED')return 'PAUSED';
 if(connected.status==='ERROR')return 'ERROR';
 if(connected.status==='CONNECTING'||connected.status==='RETRYING')return 'CONNECTING';
 if(!row)return 'NO_CLOSE';
 const age=now-row.lastConfirmedAt;
 return age>=0&&age<=Math.max(2*FUTURE_FRAME_MS[frame],600000)?'FRESH':'STALE';
}
