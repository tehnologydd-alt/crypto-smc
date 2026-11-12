/**
 * APEX public Spot depth: top-of-book SNAPSHOT WebSockets, not L2 deltas.
 * Only active selected favorite in visible Asset/Data WebView; max two sockets.
 *
 * Binance depth20 stream: top 20 bids/asks, no authoritative exchange time.
 * OKX books5 stream: top 5 bids/asks, provider timestamp `ts`.
 *
 * V5 Nov 2026: OKX WebSocket uses port 443 (old :8443 retired Oct 31).
 * This module never sends API keys, account IDs, private data or trades.
 */
import {parseDepthSnapshot} from './research.mjs';
export const LIVE_BOOK_POLICY=Object.freeze({
 saveGapMs:30000,healthyBinanceMs:12000,healthyOkxMs:25000,
 connectionTimeoutMs:12000,okxPingMs:20000,okxDisconnectMs:45000,
 reconnectGapMs:120000,maxBytes:65536
});
const VENUES=Object.freeze(['binance','okx']);
const symbolPattern=/^[A-Z0-9]{5,20}$/;
const safeTime=x=>Number.isSafeInteger(x)&&x>0;
const pair=s=>{
 const m=/^([A-Z0-9]{2,16})(USDT|USDC|EUR|BTC)$/.exec(s||'');
 return m?m[1]+'-'+m[2]:null;
};
export function streamAddress(venue,symbol){
 if(!symbolPattern.test(symbol||'')||!VENUES.includes(venue))return null;
 if(venue==='binance')
  return 'wss://stream.binance.com:9443/ws/'+
   symbol.toLowerCase()+'@depth20';
 const instId=pair(symbol);
 return instId?'wss://ws.okx.com/ws/v5/public':null;
}
/**
 * Strict provider shape & source identity. Snapshots are complete partial
 * books; treating them as diff updates would invent orderbook state.
 */
export function parseLiveBookMessage(venue,symbol,raw,receivedAt){
 if(!safeTime(receivedAt)||!streamAddress(venue,symbol)||
  typeof raw!=='string'||raw.length>LIVE_BOOK_POLICY.maxBytes)
  return {state:'INVALID',data:null};
 if(raw==='pong'&&venue==='okx')return {state:'KEEPALIVE',data:null};
 let packet;
 try{packet=JSON.parse(raw);}catch{return {state:'INVALID',data:null};}
 if(venue==='okx'){
  if(packet?.event==='subscribe'&&
   packet.arg?.channel==='books5'&&packet.arg.instId===pair(symbol))
   return {state:'ACK',data:null};
  if(packet?.event==='error')return {state:'REMOTE_ERROR',data:null,
   error:String(packet.msg||'OKX rejected channel').slice(0,100)};
  if(packet?.arg?.channel!=='books5'||packet.arg.instId!==pair(symbol)||
   !Array.isArray(packet.data)||packet.data.length!==1)
   return {state:'INVALID',data:null};
  const row=packet.data[0];
  if(!row||row.instId&&row.instId!==pair(symbol)||
   !Array.isArray(row.bids)||row.bids.length>5||
   !Array.isArray(row.asks)||row.asks.length>5)
   return {state:'INVALID',data:null};
  try{
   const normalized=parseDepthSnapshot('okx',symbol,
    {code:'0',data:[row]},receivedAt);
   normalized.collectionMethod='PUBLIC_WS_BOOK_SNAPSHOT';
   normalized.snapshotLevelsMax=5;
   return {state:'OK',data:normalized};
  }catch(error){
   const reason=String(error?.message||error);
   return {state:reason.includes('stale')?'STALE':
    reason.startsWith('device clock')?'CLOCK_SKEW':'INVALID',
    data:null,error:reason.slice(0,100)};
  }
 }
 if(!packet||!Array.isArray(packet.bids)||!Array.isArray(packet.asks)||
  packet.bids.length>20||packet.asks.length>20)
  return {state:'INVALID',data:null};
 try{
  const normalized=parseDepthSnapshot('binance',symbol,packet,receivedAt);
  if(!Number.isSafeInteger(normalized.updateId)||
   normalized.updateId<=0)return {state:'INVALID',data:null};
  normalized.collectionMethod='PUBLIC_WS_BOOK_SNAPSHOT';
  normalized.snapshotLevelsMax=20;
  return {state:'OK',data:normalized};
 }catch(error){
  return {state:'INVALID',data:null,
   error:String(error?.message||error).slice(0,100)};
 }
}
/**
 * This manager owns two sockets AT MOST and holds only newest snapshots.
 * A consumer receives at most one persisted sample/venue/30 seconds.
 * Call sync() on selected UI lifecycle, and tick() on existing foreground
 * app timer. There is NO independent background interval or service.
 */
export function createForegroundBookStreams({
 now=()=>Date.now(),socketFactory=url=>new WebSocket(url),
 onSample=()=>{},onBook=()=>{},onStatus=()=>{}
}={}){
 let current='',active=false,generation=0;
 const lanes=new Map(),nextAllowed=new Map();
 const state=(venue,status,error='')=>{
  onStatus({symbol:current,venue,state:status,error,
   at:now(),sampleAt:lanes.get(venue)?.lastSampleAt||0});
 };
 function shutdown({clearAsset=false}={}){
  generation++;
  for(const lane of lanes.values()){
   try{
    lane.ws.onopen=null;lane.ws.onclose=null;
    lane.ws.onmessage=null;lane.ws.onerror=null;
    lane.ws.close();
   }catch{}
  }
  lanes.clear();active=false;
  if(clearAsset)current='';
 }
 function reject(venue,lane,status,error=''){
  if(lanes.get(venue)!==lane)return;
  nextAllowed.set(venue+':'+current,now()+LIVE_BOOK_POLICY.reconnectGapMs);
  state(venue,status,String(error).slice(0,90));
  try{lane.ws.close();}catch{}
  lanes.delete(venue);
 }
 function connect(venue){
  if(!active||lanes.has(venue))return;
  const at=now(),key=venue+':'+current;
  if((nextAllowed.get(key)||0)>at)return;
  const url=streamAddress(venue,current);
  if(!url)return;
  let ws;
  try{ws=socketFactory(url);}catch{
   nextAllowed.set(key,at+LIVE_BOOK_POLICY.reconnectGapMs);
   state(venue,'UNAVAILABLE');return;
  }
  const token=generation,expected=current;
  const lane={ws,createdAt:at,lastMessageAt:at,lastSampleAt:0,
   lastSavedAt:0,lastRenderedAt:0,lastSequence:null,lastPingAt:0,
   awaitingPong:false};
  lanes.set(venue,lane);state(venue,'CONNECTING');
  const live=()=>active&&generation===token&&expected===current&&
   lanes.get(venue)===lane;
  ws.onopen=()=>{
   if(!live())return;
   lane.openedAt=now();
   if(venue==='okx')try{ws.send(JSON.stringify({
    op:'subscribe',args:[{channel:'books5',instId:pair(expected)}]
   }));}catch{reject(venue,lane,'OFFLINE');}
  };
  ws.onmessage=evt=>{
   if(!live())return;
   const received=now();
   if(typeof evt.data!=='string'||evt.data.length>LIVE_BOOK_POLICY.maxBytes){
    reject(venue,lane,'INVALID');return;
   }
   lane.lastMessageAt=received;
   // A valid incoming book itself proves that the heartbeat connection
   // is alive, even if the explicit pong is delayed or not delivered.
   lane.awaitingPong=false;
   const result=parseLiveBookMessage(venue,expected,evt.data,received);
   if(result.state==='KEEPALIVE'){lane.awaitingPong=false;return;}
   if(result.state==='ACK')return;
   if(result.state!=='OK'){
    reject(venue,lane,result.state,result.error||'');return;
   }
   const book=result.data;
   if(venue==='binance'&&lane.lastSequence!==null&&
    book.updateId<lane.lastSequence){
    reject(venue,lane,'SEQUENCE_RESET');return;
   }
   if(venue==='okx'&&lane.lastSequence!==null&&
    Number.isSafeInteger(book.updateId)&&book.updateId<lane.lastSequence){
    reject(venue,lane,'SEQUENCE_RESET');return;
   }
   // Some snapshot channels can repeat seqId without a new book; compare
   // verified best prices and visible totals as well as provider sequence.
   const signature=[book.updateId,book.bestBid,book.bestAsk,
    book.bidNotional,book.askNotional].join('|');
   const changed=lane.lastSignature!==signature;
   lane.lastSignature=signature;
   lane.lastSequence=book.updateId;
   lane.lastSampleAt=received;lane.lastBook=book;
   // Every valid snapshot refreshes the live view (throttled to 1/s),
   // including unchanged books. Persisted Room history still records only
   // meaningful changes at a separate 30s cadence.
   if(received-lane.lastRenderedAt>=1000){
    lane.lastRenderedAt=received;
    onBook({symbol:expected,venue,depth:book,collectedAt:received});
   }
   if(changed&&received-lane.lastSavedAt>=LIVE_BOOK_POLICY.saveGapMs){
    lane.lastSavedAt=received;
    onSample({symbol:expected,venue,depth:book,collectedAt:received});
   }
   if(!lane.firstSample){lane.firstSample=true;state(venue,'LIVE');}
  };
  ws.onerror=()=>{if(live())reject(venue,lane,'OFFLINE');};
  ws.onclose=()=>{if(live())reject(venue,lane,'DISCONNECTED');};
 }
 function sync({asset='',visible=false,favorite=false,native=false,
  dataArea=false}={}){
  const enable=visible&&favorite&&native&&dataArea&&
   symbolPattern.test(asset);
  if(!enable){if(active||lanes.size)shutdown({clearAsset:true});return false;}
  if(asset!==current){shutdown({clearAsset:false});current=asset;}
  active=true;
  for(const venue of VENUES)connect(venue);
  return true;
 }
 function isFresh(venue){
  const lane=lanes.get(venue),t=now();
  return !!(active&&lane?.lastBook&&
   t-lane.lastSampleAt>=0&&t-lane.lastSampleAt<
    (venue==='okx'?LIVE_BOOK_POLICY.healthyOkxMs:
     LIVE_BOOK_POLICY.healthyBinanceMs));
 }
 function tick(){
  if(!active)return;
  const t=now();
  for(const venue of VENUES){
   const lane=lanes.get(venue);
   if(!lane){connect(venue);continue;}
   if(!lane.openedAt&&t-lane.createdAt>LIVE_BOOK_POLICY.connectionTimeoutMs){
    reject(venue,lane,'TIMEOUT');continue;
   }
   if(venue==='okx'&&lane.openedAt&&
    t-lane.lastMessageAt>LIVE_BOOK_POLICY.okxPingMs){
    if(lane.awaitingPong&&t-lane.lastPingAt>LIVE_BOOK_POLICY.okxPingMs){
     reject(venue,lane,'TIMEOUT');continue;
    }
    if(!lane.awaitingPong){
     try{lane.ws.send('ping');lane.lastPingAt=t;lane.awaitingPong=true;}
     catch{reject(venue,lane,'OFFLINE');}
    }
   }
   if(lane.openedAt&&t-lane.lastMessageAt>
    (venue==='okx'?LIVE_BOOK_POLICY.okxDisconnectMs:30000))
    reject(venue,lane,'TIMEOUT');
  }
 }
 function stop(){shutdown({clearAsset:true});}
 function getStatus(){
  return {asset:current,active,venues:Object.fromEntries(VENUES.map(venue=>{
   const lane=lanes.get(venue);
   return [venue,{connected:!!lane?.firstSample,fresh:isFresh(venue),
    lastSampleAt:lane?.lastSampleAt||0,
    depthLimit:venue==='binance'?20:5}];
  }))};
 }
 return {sync,isFresh,tick,stop,getStatus};
}
