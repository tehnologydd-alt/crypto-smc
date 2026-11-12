/**
 * Extra public Binance Spot search source for APEX.
 * aggTrade = one or more fills from the same taker order at the same price.
 * It is NOT a blockchain transfer, wallet flow, liquidation, or whale ID.
 * WebSocket only for one visible favorited asset; no background timer/API key.
 */
export const LARGE_TRADE_VERSION='APEX_PUBLIC_AGGTRADE_V1';
export const LARGE_TRADE_SOURCE='binance:spot:aggtrade';
export const LARGE_TRADE_MIN_USDT=150000;
export const LARGE_TRADE_POLICY=Object.freeze({
 maxMessageBytes:8192,reconnectMs:60000,connectionTimeoutMs:12000,
 idleTimeoutMs:60000,maxRecordedPerMinute:60
});
const SYMBOL=/^[A-Z0-9]{2,16}USDT$/;
const positive=x=>typeof x==='number'&&Number.isFinite(x)&&x>0;
const goodTime=x=>Number.isSafeInteger(x)&&x>0;
export function largeTradeStreamUrl(asset){
 return SYMBOL.test(asset||'')?'wss://stream.binance.com:9443/ws/'+
  asset.toLowerCase()+'@aggTrade':null;
}
export function validateLargeTrade(item,asset,{now=Date.now(),maxAgeMs=14*86400000}={}){
 if(!item||item.version!==LARGE_TRADE_VERSION||
  item.source!==LARGE_TRADE_SOURCE||item.symbol!==asset||
  !SYMBOL.test(asset||'')||item.market!=='SPOT'||
  item.eventType!=='aggTrade'||
  !Number.isSafeInteger(item.aggregateId)||item.aggregateId<0||
  !positive(item.price)||!positive(item.quantity)||
  !positive(item.quoteNotional)||item.quoteNotional<LARGE_TRADE_MIN_USDT||
  item.quoteNotional>1e12||!['BUY_TAKER','SELL_TAKER'].includes(item.takerSide)||
  item.buyerIsMaker!==(item.takerSide==='SELL_TAKER')||
  !goodTime(item.tradeAt)||!goodTime(item.receivedAt)||
  item.tradeAt>item.receivedAt||item.receivedAt>now+60000||
  now-item.receivedAt>maxAgeMs||item.tradeAt<item.receivedAt-120000||
  item.walletOwner!==null||item.exchangeFlow!==null||
  item.blockchainTxHash!==null)return false;
 return Math.abs(item.price*item.quantity-item.quoteNotional)/
  item.quoteNotional<1e-8;
}
export function parseBinanceAggTrade(raw,asset,receivedAt){
 if(!largeTradeStreamUrl(asset)||!goodTime(receivedAt)||
  typeof raw!=='string'||raw.length>LARGE_TRADE_POLICY.maxMessageBytes)
  return {state:'INVALID',trade:null};
 let packet;
 try{packet=JSON.parse(raw);}catch{return {state:'INVALID',trade:null};}
 // Accept both the raw stream and documented combined-stream envelope.
 const x=packet?.data&&packet.stream===asset.toLowerCase()+'@aggTrade'?
  packet.data:packet;
 if(x?.e!=='aggTrade'||x.s!==asset||
  !Number.isSafeInteger(x.a)||x.a<0||
  typeof x.p!=='string'||!/^(?:0|[1-9]\d*)(?:\.\d{1,18})?$/.test(x.p)||
  typeof x.q!=='string'||!/^(?:0|[1-9]\d*)(?:\.\d{1,18})?$/.test(x.q)||
  typeof x.m!=='boolean'||!goodTime(x.T)||
  x.T>receivedAt||receivedAt-x.T>120000)
  return {state:'INVALID',trade:null};
 const price=Number(x.p),quantity=Number(x.q);
 if(!positive(price)||!positive(quantity)||!positive(price*quantity))
  return {state:'INVALID',trade:null};
 const quoteNotional=price*quantity;
 if(quoteNotional<LARGE_TRADE_MIN_USDT)return {state:'BELOW_THRESHOLD',trade:null};
 const trade={version:LARGE_TRADE_VERSION,source:LARGE_TRADE_SOURCE,
  market:'SPOT',eventType:'aggTrade',symbol:asset,
  aggregateId:x.a,price,quantity,quoteNotional,
  buyerIsMaker:x.m,takerSide:x.m?'SELL_TAKER':'BUY_TAKER',
  tradeAt:x.T,receivedAt,walletOwner:null,exchangeFlow:null,
  blockchainTxHash:null};
 return validateLargeTrade(trade,asset,{now:receivedAt,maxAgeMs:120000})?
  {state:'OK',trade}:{state:'INVALID',trade:null};
}
export function createLargeTradeStream({
 now=()=>Date.now(),socketFactory=url=>new WebSocket(url),
 onTrade=()=>{},onStatus=()=>{}
}={}){
 let asset='',active=false,socket=null,token=0,createdAt=0;
 let lastMessageAt=0,nextConnectAt=0;
 const seen=new Set();let windowAt=0,captured=0;
 const state=(status,reason='')=>onStatus({asset,status,reason,at:now()});
 function stop(){
  active=false;token++;
  if(socket){const ws=socket;socket=null;
   try{ws.onmessage=null;ws.onopen=null;ws.onerror=null;
    ws.onclose=null;ws.close();}catch{}}
 }
 function connect(){
  if(!active||socket||now()<nextConnectAt)return;
  const url=largeTradeStreamUrl(asset);if(!url){state('UNSUPPORTED');return;}
  let ws;
  try{ws=socketFactory(url);}catch{nextConnectAt=now()+LARGE_TRADE_POLICY.reconnectMs;
   state('OFFLINE');return;}
  socket=ws;const current=token,expected=asset;
  createdAt=now();lastMessageAt=createdAt;state('CONNECTING');
  const valid=()=>active&&socket===ws&&current===token&&asset===expected;
  const reject=(reason='')=>{
   if(!valid())return;socket=null;
   nextConnectAt=now()+LARGE_TRADE_POLICY.reconnectMs;
   try{ws.onmessage=null;ws.onclose=null;ws.onerror=null;ws.close();}catch{}
   state('OFFLINE',reason);
  };
  ws.onopen=()=>{if(valid())state('LIVE')};
  ws.onmessage=evt=>{
   if(!valid())return;
   const receivedAt=now();lastMessageAt=receivedAt;
   const result=parseBinanceAggTrade(evt.data,expected,receivedAt);
   if(result.state!=='OK')return;
   const trade=result.trade;
   if(seen.has(trade.aggregateId))return;
   seen.add(trade.aggregateId);
   if(seen.size>300)seen.delete(seen.values().next().value);
   if(receivedAt-windowAt>=60000){windowAt=receivedAt;captured=0;}
   if(captured>=LARGE_TRADE_POLICY.maxRecordedPerMinute){
    state('RATE_CAPPED','Частичная выборка крупных сделок: ограничение нагрузки');
    return;
   }
   captured++;onTrade({asset:expected,trade});
  };
  ws.onerror=()=>reject('WebSocket недоступен');
  ws.onclose=()=>reject('Соединение закрыто');
 }
 function sync({symbol='',visible=false,favorite=false,native=false,
  dataArea=false}={}){
  const enabled=visible&&favorite&&native&&dataArea&&
   Boolean(largeTradeStreamUrl(symbol));
  if(!enabled){if(active||socket)stop();asset='';return false;}
  if(asset!==symbol){stop();asset=symbol;seen.clear();
   windowAt=0;captured=0;nextConnectAt=0;token++;}
  active=true;connect();return true;
 }
 function tick(){
  if(!active)return;
  if(!socket){connect();return;}
  const t=now();
  if(t-createdAt>LARGE_TRADE_POLICY.connectionTimeoutMs&&
   !lastMessageAt)stop();
  else if(t-lastMessageAt>LARGE_TRADE_POLICY.idleTimeoutMs){
   const prev=asset;stop();asset=prev;active=true;
   nextConnectAt=t+LARGE_TRADE_POLICY.reconnectMs;state('STALE');
  }
 }
 return {sync,tick,stop,getStatus:()=>({asset,active,connected:!!socket})};
}
