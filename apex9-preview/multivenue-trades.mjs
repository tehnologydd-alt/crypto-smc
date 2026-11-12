/**
 * Source-specific public Spot trade readers.
 * These are exchange executions, not wallet transfers. Never infer identity.
 * Binance aggTrade is handled by the existing separate adapter.
 */
export const MULTIVENUE_VERSION='APEX_MULTIVENUE_SPOT_TRADE_V1';
export const MULTIVENUE_MIN=150000;
export const MULTIVENUE=['bybit','okx','kraken','bingx','coinbase'];
const assetOk=s=>typeof s==='string'&&/^[A-Z0-9]{2,16}USDT$/.test(s);
const positive=n=>typeof n==='number'&&Number.isFinite(n)&&n>0;
const tradeId=s=>typeof s==='string'&&/^[A-Za-z0-9-]{1,80}$/.test(s);
const millis=t=>typeof t==='number'?t:typeof t==='string'?
 (/^\d{13}$/.test(t)?Number(t):Date.parse(t)):NaN;
const base=a=>a.slice(0,-4);
export function venueTradeConfig(venue,asset){
 if(!MULTIVENUE.includes(venue)||!assetOk(asset))return null;
 const dashed=base(asset)+'-USDT';
 if(venue==='bybit')return {url:'wss://stream.bybit.com/v5/public/spot',
  symbol:asset,quote:'USDT',subscribe:{op:'subscribe',args:['publicTrade.'+asset]}};
 if(venue==='okx')return {url:'wss://ws.okx.com:8443/ws/v5/public',
  symbol:dashed,quote:'USDT',subscribe:{op:'subscribe',
   args:[{channel:'trades',instId:dashed}]}};
 if(venue==='kraken')return {url:'wss://ws.kraken.com/v2',
  symbol:base(asset)+'/USDT',quote:'USDT',subscribe:{method:'subscribe',
   params:{channel:'trade',symbol:[base(asset)+'/USDT'],snapshot:false}}};
 if(venue==='bingx')return {url:'wss://open-api-ws.bingx.com/market',
  symbol:dashed,quote:'USDT',compressed:true,subscribe:
   {id:'apex-public-trades',reqType:'sub',dataType:dashed+'@trade'}};
 return {url:'wss://ws-feed.exchange.coinbase.com',
  symbol:base(asset)+'-USD',quote:'USD',subscribe:{type:'subscribe',
   product_ids:[base(asset)+'-USD'],channels:['matches']}};
}
function convert(venue,asset,input,now){
 const id=typeof input.id==='number'&&Number.isSafeInteger(input.id)?
  String(input.id):input.id;
 const price=Number(input.price),quantity=Number(input.quantity);
 const tradeAt=millis(input.time);
 const config=venueTradeConfig(venue,asset);
 if(!config||!tradeId(id)||!positive(price)||!positive(quantity)||
  !positive(price*quantity)||price*quantity<MULTIVENUE_MIN||
  price*quantity>1e12||!Number.isSafeInteger(tradeAt)||
  tradeAt>now||now-tradeAt>120000||
  !['BUY_TAKER','SELL_TAKER'].includes(input.side))
  return null;
 return {version:MULTIVENUE_VERSION,source:venue+':spot:trades',
  venue,market:'SPOT',asset,tradeId:id,
  price,quantity,quoteNotional:price*quantity,
  quoteCurrency:config.quote,takerSide:input.side,
  tradeAt,receivedAt:now,
  walletOwner:null,exchangeFlow:null,blockchainTxHash:null};
}
export function validateVenueTrade(t,asset,{now=Date.now(),maxAgeMs=14*86400000}={}){
 const cfg=venueTradeConfig(t?.venue,asset);
 if(!cfg||t?.version!==MULTIVENUE_VERSION||
  t?.source!==t.venue+':spot:trades'||t.asset!==asset||
  t.market!=='SPOT'||!tradeId(t.tradeId)||
  !positive(t.price)||!positive(t.quantity)||
  !positive(t.quoteNotional)||t.quoteNotional<MULTIVENUE_MIN||
  t.quoteNotional>1e12||t.quoteCurrency!==cfg.quote||
  !['BUY_TAKER','SELL_TAKER'].includes(t.takerSide)||
  !Number.isSafeInteger(t.tradeAt)||!Number.isSafeInteger(t.receivedAt)||
  t.tradeAt>t.receivedAt||t.receivedAt>now+60000||
  now-t.receivedAt>maxAgeMs||t.receivedAt-t.tradeAt>120000||
  t.walletOwner!==null||t.exchangeFlow!==null||
  t.blockchainTxHash!==null)return false;
 return Math.abs(t.price*t.quantity-t.quoteNotional)/
  t.quoteNotional<=1e-8;
}
export function parseVenueTrades(venue,asset,payload,now=Date.now()){
 if(!venueTradeConfig(venue,asset)||!Number.isSafeInteger(now)||
  typeof payload!=='string'||payload.length>250000)return [];
 let data;
 try{data=JSON.parse(payload)}catch{return []}
 let rows=[];
 if(venue==='bybit'){
  if(data?.topic!=='publicTrade.'+asset||!Array.isArray(data.data))return [];
  rows=data.data.slice(0,1024).filter(x=>x?.s===asset)
   .map(x=>convert(venue,asset,
   {id:x.i,price:x.p,quantity:x.v,time:x.T,
    side:x.S==='Buy'?'BUY_TAKER':x.S==='Sell'?'SELL_TAKER':null},now));
 }else if(venue==='okx'){
  if(data?.arg?.channel!=='trades'||data.arg.instId!==base(asset)+'-USDT'||
   !Array.isArray(data.data))return [];
  rows=data.data.slice(0,1024).map(x=>convert(venue,asset,
   {id:x.tradeId,price:x.px,quantity:x.sz,time:x.ts,
    side:x.side==='buy'?'BUY_TAKER':x.side==='sell'?'SELL_TAKER':null},now));
 }else if(venue==='kraken'){
  if(data?.channel!=='trade'||data.type!=='update'||!Array.isArray(data.data))
   return [];
  rows=data.data.slice(0,1024).filter(x=>x.symbol===base(asset)+'/USDT')
   .map(x=>convert(venue,asset,
    {id:x.trade_id,price:x.price,quantity:x.qty,time:x.timestamp,
     side:x.side==='buy'?'BUY_TAKER':x.side==='sell'?'SELL_TAKER':null},now));
 }else if(venue==='bingx'){
  if(data?.dataType!==base(asset)+'-USDT@trade')return [];
  const items=Array.isArray(data.data)?data.data:[data.data];
  rows=items.slice(0,1024).filter(x=>x?.s===base(asset)+'-USDT')
   .map(x=>convert(venue,asset,
   {id:x?.t,price:x?.p,quantity:x?.q,time:x?.T,
    side:x?.m===false?'BUY_TAKER':x?.m===true?'SELL_TAKER':null},now));
 }else if(venue==='coinbase'){
  // Coinbase 'match' side is MAKER side, unlike the other exchanges.
  if(data?.type!=='match'||data.product_id!==base(asset)+'-USD')return [];
  rows=[convert(venue,asset,
   {id:data.trade_id,price:data.price,quantity:data.size,time:data.time,
    side:data.side==='sell'?'BUY_TAKER':data.side==='buy'?'SELL_TAKER':null},now)];
 }
 return rows.filter(t=>t&&validateVenueTrade(t,asset,{now,maxAgeMs:120000}));
}
/**
 * WebView's DecompressionStream is optional. If unavailable, BingX stays
 * unsupported and never fabricates an empty stream. No third-party scripts.
 */
export async function decodePublicFrame(frame,venue){
 if(typeof frame==='string')return frame;
 if(venue!=='bingx')return null;
 if(typeof DecompressionStream!=='function'||typeof Response!=='function')
  return null;
 const input=frame instanceof ArrayBuffer?new Uint8Array(frame):
  (typeof Blob!=='undefined'&&frame instanceof Blob?
   new Uint8Array(await frame.arrayBuffer()):null);
 if(!input||input.byteLength>250000)return null;
 try{
  const stream=new Blob([input]).stream().pipeThrough(new DecompressionStream('gzip'));
  const text=await new Response(stream).text();
  return text.length<250000?text:null;
 }catch{return null}
}
/** One selected asset, five independent sockets; each venue fails independently. */
export function createMultivenueStreams({
 now=()=>Date.now(),socketFactory=url=>new WebSocket(url),
 onTrades=()=>{},onStatus=()=>{}
}={}){
 const lanes=new Map();
 let activeAsset='',allowed=false,generation=0;
 const status=(venue,state,detail='')=>onStatus({venue,state,detail,asset:activeAsset,at:now()});
 function closeLane(venue){
  const lane=lanes.get(venue);if(!lane)return;
  lanes.delete(venue);
  try{lane.ws.onopen=null;lane.ws.onmessage=null;lane.ws.onclose=null;
   lane.ws.onerror=null;lane.ws.close()}catch{}
 }
 function stop(){
  generation++;allowed=false;
  for(const venue of [...lanes.keys()])closeLane(venue);
  activeAsset='';
 }
 function connect(venue){
  if(!allowed||lanes.has(venue))return;
  const cfg=venueTradeConfig(venue,activeAsset);
  if(!cfg)return;
  let ws;
  try{ws=socketFactory(cfg.url)}catch{status(venue,'OFFLINE');return}
  const lane={ws,generation,asset:activeAsset,lastAt:now(),seen:new Set(),
   count:0,minute:now(),connectedAt:now()};
  lanes.set(venue,lane);status(venue,'CONNECTING');
  const valid=()=>lanes.get(venue)===lane&&allowed&&
   lane.asset===activeAsset&&lane.generation===generation;
  const fail=detail=>{if(!valid())return;closeLane(venue);status(venue,'OFFLINE',detail)};
  ws.onopen=()=>{
   if(!valid())return;
   try{ws.send(JSON.stringify(cfg.subscribe));status(venue,'LIVE')}
   catch{fail('Subscribe failed')}
  };
  ws.onmessage=async event=>{
   if(!valid())return;
   const raw=await decodePublicFrame(event.data,venue);
   if(!valid())return;
   if(raw===null){
    if(venue==='bingx')fail('GZIP decoder unavailable');
    return;
   }
   lane.lastAt=now();
   if(venue==='bingx'){
    if(raw==='Ping'){try{ws.send('Pong')}catch{};return}
    let ping;try{ping=JSON.parse(raw)}catch{}
    if(ping&&Object.hasOwn(ping,'ping')){
     try{ws.send(JSON.stringify({pong:ping.ping}))}catch{}
     return;
    }
   }
   const trades=parseVenueTrades(venue,lane.asset,raw,now());
   const filtered=[];
   for(const trade of trades){
    if(lane.seen.has(trade.tradeId))continue;
    lane.seen.add(trade.tradeId);
    if(lane.seen.size>450)lane.seen.delete(lane.seen.values().next().value);
    if(now()-lane.minute>=60000){lane.minute=now();lane.count=0}
    if(lane.count>=60){status(venue,'RATE_CAPPED');break}
    lane.count++;filtered.push(trade);
   }
   if(filtered.length)onTrades({venue,asset:lane.asset,trades:filtered});
  };
  ws.onerror=()=>fail('WebSocket error');
  ws.onclose=()=>fail('Connection closed');
 }
 function sync({symbol='',visible=false,favorite=false,native=false,dataArea=false}={}){
  const desired=visible&&favorite&&native&&dataArea&&assetOk(symbol);
  if(!desired){if(allowed||lanes.size)stop();return false}
  if(!allowed||activeAsset!==symbol){stop();activeAsset=symbol;allowed=true;
   for(const v of MULTIVENUE)connect(v)}
  return true;
 }
 function tick(){
  if(!allowed)return;
  for(const v of MULTIVENUE){
   const lane=lanes.get(v);
   if(lane&&now()-lane.lastAt>60000){closeLane(v);status(v,'STALE')}
  }
  // Deliberately no uncontrolled reconnect loop.
 }
 return {sync,tick,stop};
}
