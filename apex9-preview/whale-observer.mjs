/**
 * APEX Whale Intelligence / Stage 1: SOURCE-SCOPED, read-only native-coin
 * transfer observations. A "large" observation does not establish who owns
 * an address, exchange affiliation, a whale, a purchase, or a sale.
 *
 * Bitcoin: recent 10 UNCONFIRMED txs from mempool.space. Follow up at most
 * three large-tx candidates with /api/tx/{txid}; store *individual outputs*
 * over threshold, which may be change (not recipient evidence).
 * No provider timestamp for /mempool/recent: we record CLIENT_SEEN time.
 *
 * Ethereum: one Blockscout /transactions page, validated coin_transfer only.
 * Persist native ETH value, not token transfers or internal transfers.
 * No currency conversion, cross-chain aggregation, or trading actions.
 */
export const WHALE_OBSERVATION_VERSION='APEX_WHALE_NATIVE_STAGE1_V1';
export const WHALE_SOURCES=Object.freeze({
 bitcoin:'mempool:bitcoin:tx',
 ethereum:'blockscout:ethereum:transactions'
});
export const WHALE_MIN_ATOMIC=Object.freeze({
 bitcoin:'10000000000', // 100 BTC, satoshis — display threshold, NOT a "whale" identity.
 ethereum:'100000000000000000000' // 100 ETH, wei.
});
const HOSTS=Object.freeze({
 bitcoin:'https://mempool.space',
 ethereum:'https://eth.blockscout.com'
});
const pair=/^(BTC|ETH)(USDT|USDC|EUR|BTC)$/;
const hash64=/^[a-fA-F0-9]{64}$/;
const ethAddress=/^0x[a-fA-F0-9]{40}$/;
const btcAddress=/^[a-zA-Z0-9]{14,90}$/;
const safeTime=n=>Number.isSafeInteger(n)&&n>0;
const decimal=x=>typeof x==='string'&&/^(0|[1-9][0-9]{0,70})$/.test(x);
const saneTime=(when,now)=>safeTime(when)&&when<=now+60000&&
 when>=now-14*86400000;
const simpleError=e=>String(e?.message||e||'network error').slice(0,110);
export function chainForWhaleAsset(asset){
 if(typeof asset!=='string'||!pair.test(asset))return null;
 return asset.startsWith('BTC')?'bitcoin':'ethereum';
}
export function whaleMinAmount(chain){
 return WHALE_MIN_ATOMIC[chain]||null;
}
export function formatNativeAmount(amountAtomic,chain){
 if(!decimal(amountAtomic)||!WHALE_MIN_ATOMIC[chain])return '—';
 const decimals=chain==='bitcoin'?8:18;
 const str=amountAtomic.padStart(decimals+1,'0'),split=str.length-decimals;
 const whole=str.slice(0,split),fraction=str.slice(split).replace(/0+$/,'');
 return whole+(fraction?'.'+fraction:'')+' '+(chain==='bitcoin'?'BTC':'ETH');
}
function eventBase(chain,asset,txid,observedAt,collectedAt){
 return {
  version:WHALE_OBSERVATION_VERSION,asset,network:chain,
  source:WHALE_SOURCES[chain],txid,observedAt,collectedAt,
  unit:chain==='bitcoin'?'BTC':'ETH',
  decimals:chain==='bitcoin'?8:18,thresholdAtomic:WHALE_MIN_ATOMIC[chain],
  walletOwner:'UNKNOWN',exchangeLabel:null,tradeDirection:null,
  isWhaleIdentityVerified:false,calibratedProbability:null
 };
}
export function validateWhaleEvent(event,asset,now=Date.now()){
 const chain=chainForWhaleAsset(asset);
 if(!chain||event?.version!==WHALE_OBSERVATION_VERSION||
  event.asset!==asset||event.network!==chain||
  event.source!==WHALE_SOURCES[chain]||
  !hash64.test(event.txid||'')||
  !saneTime(event.observedAt,now)||
  !saneTime(event.collectedAt,now)||
  event.observedAt>event.collectedAt||
  !decimal(event.amountAtomic)||
  BigInt(event.amountAtomic)<BigInt(WHALE_MIN_ATOMIC[chain])||
  event.unit!==(chain==='bitcoin'?'BTC':'ETH')||
  event.decimals!==(chain==='bitcoin'?8:18)||
  event.thresholdAtomic!==WHALE_MIN_ATOMIC[chain]||
  event.walletOwner!=='UNKNOWN'||event.exchangeLabel!==null||
  event.tradeDirection!==null||event.isWhaleIdentityVerified!==false||
  event.calibratedProbability!==null)return false;
 if(chain==='bitcoin'){
  return event.eventType==='LARGE_OUTPUT_CANDIDATE'&&
   event.confirmation==='UNCONFIRMED_AT_FETCH'&&
   event.timeBasis==='CLIENT_SEEN'&&event.observedAt===event.collectedAt&&
   event.from===null&&btcAddress.test(event.to||'')&&
   Number.isSafeInteger(event.outputIndex)&&event.outputIndex>=0&&
   event.outputIndex<=10000&&
   event.addressRole==='OUTPUT_MAY_BE_CHANGE';
 }
 return event.eventType==='NATIVE_COIN_TRANSFER'&&
  event.confirmation==='VALIDATED_AT_FETCH'&&
  event.timeBasis==='BLOCK_TIMESTAMP'&&
  event.outputIndex===null&&event.addressRole==='UNVERIFIED_ADDRESSES'&&
  ethAddress.test(event.from||'')&&ethAddress.test(event.to||'')&&
  event.from.toLowerCase()!==event.to.toLowerCase();
}
function state(state,chain,asset,at,events=[],{
 scanned=0,lookups=0,reason='',coverage=''
}={}){
 return {state,chain,asset,source:WHALE_SOURCES[chain]||null,
  fetchedAt:at,events,scanned,lookups,reason,coverage,
  completeMarketCoverage:false,canInferIntent:false};
}
async function getJson(url,{fetchImpl,signal}){
 try{
  const res=await fetchImpl(url,{method:'GET',signal,cache:'no-store',
   credentials:'omit'});
  if(res.status===429||res.status===418)return {state:'RATE_LIMITED'};
  if([401,403,451].includes(res.status))return {state:'ACCESS_DENIED'};
  if(!res.ok)return {state:'OFFLINE',reason:'HTTP '+res.status};
  const json=await res.json();
  return {state:'OK',json};
 }catch(e){
  if(signal?.aborted)return {state:'CANCELLED'};
  return {state:'OFFLINE',reason:simpleError(e)};
 }
}
function ethereumTimestamp(raw){
 if(typeof raw!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(raw))
  return null;
 const ms=Date.parse(raw);
 return safeTime(ms)?ms:null;
}
/** Strict input: validated successful native ETH value, not ERC20 transfers. */
export function parseEthereumTransfers(asset,json,receivedAt){
 if(chainForWhaleAsset(asset)!=='ethereum'||!safeTime(receivedAt)||
  !json||!Array.isArray(json.items)||json.items.length>100)
  return {state:'INVALID',events:[],scanned:0};
 const seen=new Set(),events=[];
 for(const tx of json.items){
  if(!tx||!hash64.test((tx.hash||'').replace(/^0x/,''))||
   !decimal(tx.value)||!tx.timestamp||
   typeof tx.status!=='string')continue;
  const amount=BigInt(tx.value);
  if(amount<BigInt(WHALE_MIN_ATOMIC.ethereum))continue;
  const at=ethereumTimestamp(tx.timestamp);
  if(!at||!saneTime(at,receivedAt)||
   tx.status!=='ok'||tx.result!=='success')continue;
  const from=tx.from?.hash,to=tx.to?.hash;
  if(!ethAddress.test(from||'')||!ethAddress.test(to||'')||
   from.toLowerCase()===to.toLowerCase())continue;
  const txid=tx.hash.replace(/^0x/,'').toLowerCase();
  if(seen.has(txid))continue;
  seen.add(txid);
  const ev={...eventBase('ethereum',asset,txid,at,receivedAt),
   amountAtomic:tx.value,from,to,outputIndex:null,
   eventType:'NATIVE_COIN_TRANSFER',addressRole:'UNVERIFIED_ADDRESSES',
   timeBasis:'BLOCK_TIMESTAMP',confirmation:'VALIDATED_AT_FETCH'};
  if(validateWhaleEvent(ev,asset,receivedAt))events.push(ev);
 }
 return {state:'OK',events:events.slice(0,20),scanned:json.items.length};
}
/** One exact mempool transaction; outputs are not necessarily payments. */
export function parseBitcoinLargeOutputs(asset,tx,receivedAt){
 if(chainForWhaleAsset(asset)!=='bitcoin'||!safeTime(receivedAt)||
  !tx||!hash64.test(tx.txid||'')||
  tx.status?.confirmed!==false||!Array.isArray(tx.vout)||
  tx.vout.length>10001)return [];
 const out=[],txid=tx.txid.toLowerCase();
 for(let i=0;i<tx.vout.length;i++){
  const output=tx.vout[i];
  if(!Number.isSafeInteger(output?.value)||output.value<0||
   BigInt(output.value)<BigInt(WHALE_MIN_ATOMIC.bitcoin)||
   !btcAddress.test(output.scriptpubkey_address||''))continue;
  const ev={...eventBase('bitcoin',asset,txid,receivedAt,receivedAt),
   amountAtomic:String(output.value),from:null,to:output.scriptpubkey_address,
   outputIndex:i,eventType:'LARGE_OUTPUT_CANDIDATE',
   addressRole:'OUTPUT_MAY_BE_CHANGE',timeBasis:'CLIENT_SEEN',
   confirmation:'UNCONFIRMED_AT_FETCH'};
  if(validateWhaleEvent(ev,asset,receivedAt))out.push(ev);
 }
 return out.slice(0,16);
}
/**
 * One bounded collection. Not a network scan, not a watch of any address.
 * BTC=1 recent-list GET + up to 3 exact details GETs; ETH=1 list GET.
 * Never rewrites the saved source event time after the observation.
 */
export async function collectWhaleObservations(asset,{
 fetchImpl=fetch,now=()=>Date.now(),signal
}={}){
 const chain=chainForWhaleAsset(asset),at=now();
 if(!chain||!safeTime(at))return state('UNSUPPORTED',chain,asset,at);
 if(chain==='ethereum'){
  const res=await getJson(HOSTS.ethereum+
   '/api/v2/transactions?filter=validated&type=coin_transfer',
   {fetchImpl,signal});
  if(res.state!=='OK')return state(res.state,chain,asset,at,[],{
   reason:res.reason||'Публичный источник не ответил',coverage:'LATEST_PAGE_ONLY'});
  const parsed=parseEthereumTransfers(asset,res.json,at);
  return state(parsed.state,chain,asset,at,parsed.events,{
   scanned:parsed.scanned,coverage:'LATEST_PAGE_ONLY',
   reason:parsed.state!=='OK'?'Формат страницы Blockscout не подтверждён':''});
 }
 const res=await getJson(HOSTS.bitcoin+'/api/mempool/recent',{fetchImpl,signal});
 if(res.state!=='OK')return state(res.state,chain,asset,at,[],{
  reason:res.reason||'Публичный источник не ответил',coverage:'RECENT_10_ONLY'});
 if(!Array.isArray(res.json)||res.json.length>10)
  return state('INVALID',chain,asset,at,[],{
   reason:'Некорректная страница последних 10 транзакций',
   coverage:'RECENT_10_ONLY'});
 const seen=new Set(),large=[];
 for(const tx of res.json){
  if(!tx||!hash64.test(tx.txid||'')||
   !Number.isSafeInteger(tx.value)||tx.value<0)continue;
  const txid=tx.txid.toLowerCase();
  if(seen.has(txid))continue;
  seen.add(txid);
  if(BigInt(tx.value)>=BigInt(WHALE_MIN_ATOMIC.bitcoin))
   large.push(txid);
 }
 const candidates=large.slice(0,3),events=[],failed=[];
 for(const txid of candidates){
  const detail=await getJson(HOSTS.bitcoin+'/api/tx/'+txid,
   {fetchImpl,signal});
  if(detail.state==='CANCELLED')return state('CANCELLED',chain,asset,at,[],{
   coverage:'RECENT_10_ONLY'});
  if(detail.state!=='OK'){failed.push(detail.state);continue;}
  if(detail.json?.txid?.toLowerCase()!==txid||
   !Array.isArray(detail.json?.vout)){failed.push('INVALID');continue;}
  events.push(...parseBitcoinLargeOutputs(asset,detail.json,at));
 }
 const partial=failed.length>0;
 return state(partial?'PARTIAL':'OK',chain,asset,at,events.slice(0,20),{
  scanned:res.json.length,lookups:candidates.length,
  coverage:'RECENT_10_ONLY',
  reason:partial?'Часть точных выходов недоступна: '+failed.join(', '):''});
}
/** Checked, source-specific Room history. Old and duplicate rows stay historical. */
export function parseWhaleHistory(rows,asset,{now=Date.now()}={}){
 const chain=chainForWhaleAsset(asset);
 if(!chain||!Array.isArray(rows)||rows.length>120)return [];
 const seen=new Set(),events=[];
 for(const row of rows){
  if(row?.asset!==asset||row?.source!==WHALE_SOURCES[chain]||
   row.kind!=='whale'||row.sourceState!=='OK')continue;
  let item;try{item=typeof row.payload==='string'?
   JSON.parse(row.payload):null;}catch{continue;}
  if(!validateWhaleEvent(item,asset,now)||
   row.observedAt!==item.observedAt||
   row.collectedAt!==item.collectedAt)continue;
  const id=item.txid+':'+String(item.outputIndex??'eth');
  if(seen.has(id))continue;seen.add(id);events.push(item);
 }
 return events.sort((a,b)=>b.observedAt-a.observedAt||
  b.collectedAt-a.collectedAt||a.txid.localeCompare(b.txid)).slice(0,100);
}
