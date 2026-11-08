/**
 * APEX Android First On-Chain Core (v1)
 * Public, keyless network-level Bitcoin/Ethereum/TON context only.
 * No wallet surveillance, token/chain inference, execution or forecasts.
 */
const BTC_MEMPOOL='https://mempool.space/api/mempool';
const BTC_FEES='https://mempool.space/api/v1/fees/recommended';
const ETH_STATS='https://eth.blockscout.com/api/v2/stats';
const TON_MASTERCHAIN='https://toncenter.com/api/v2/getMasterchainInfo';
const finite=n=>typeof n==='number'&&Number.isFinite(n);
const validNonnegative=n=>finite(n)&&n>=0;
const validInt=n=>Number.isSafeInteger(n)&&n>=0;
const fail=(state,error,chain=null)=>({state,error,chain,data:null});
const good=(chain,data)=>({state:'OK',chain,error:null,data});
const number=x=>{
 if(typeof x!=='string'&&typeof x!=='number')return NaN;
 if(typeof x==='string'&&!/^[0-9]+(?:\.[0-9]+)?$/.test(x))return NaN;
 return Number(x);
};
export function chainForAsset(symbol){
 if(typeof symbol!=='string')return null;
 // GRAM is the native currency of TON since the 2026 rename.
 // TONUSDT legacy and unrelated jettons are never assumed equivalent.
 const match=/^(BTC|ETH|GRAM)(?:USDT|USDC|EUR|BTC)$/.exec(symbol);
 if(!match)return null;
 return match[1]==='BTC'?'bitcoin':match[1]==='ETH'?'ethereum':'ton';
}
export function parseBitcoinNetwork(raw,{fees=null,receivedAt}={}){
 const count=raw?.count,vsize=raw?.vsize,fee=raw?.total_fee;
 if(!Number.isSafeInteger(receivedAt)||receivedAt<=0||!validInt(count)||
    !validInt(vsize)||!validNonnegative(fee)||vsize>2_000_000_000||
    count>20_000_000)throw Error('Invalid Bitcoin mempool data');
 let feeRates=null;
 if(fees&&['fastestFee','halfHourFee','hourFee','economyFee','minimumFee']
   .every(k=>validNonnegative(fees[k])&&fees[k]<=100000)){
  feeRates={
   fastestFee:fees.fastestFee,halfHourFee:fees.halfHourFee,
   hourFee:fees.hourFee,economyFee:fees.economyFee,minimumFee:fees.minimumFee
  };
 }
 return {
  scope:'BITCOIN_NETWORK_OBSERVATION',chain:'bitcoin',
  provider:'mempool.space',observedAt:receivedAt,collectedAt:receivedAt,
  timestampScope:'CLIENT_CAPTURE_NO_PROVIDER_TIMESTAMP',
  mempoolCount:count,mempoolVBytes:vsize,mempoolFeesSats:fee,
  feeRates,notWhaleEvidence:true,notDirectionalEvidence:true
 };
}
export function parseEthereumNetwork(raw,receivedAt){
 if(!raw||!Number.isSafeInteger(receivedAt)||receivedAt<=0)
  throw Error('Invalid Ethereum response');
 const totalTransactions=number(raw.total_transactions);
 const todayTransactions=number(raw.transactions_today);
 const totalBlocks=number(raw.total_blocks);
 const blockMs=number(raw.average_block_time);
 const utilization=number(raw.network_utilization_percentage);
 const gas=number(raw.gas_prices?.average);
 const gasUpdated=Date.parse(raw.gas_price_updated_at||'');
 if(!validInt(totalTransactions)||!validInt(todayTransactions)||
  !validInt(totalBlocks)||totalBlocks<1||todayTransactions>totalTransactions||
  !finite(blockMs)||blockMs<=0||blockMs>600000||
  !finite(utilization)||utilization<0||utilization>100){
  throw Error('Inconsistent Ethereum network counts');
 }
 const validGas=validNonnegative(gas)&&gas<100000&&Number.isFinite(gasUpdated)
  &&gasUpdated<=receivedAt+60000&&receivedAt-gasUpdated<=3600000;
 return {
  scope:'ETHEREUM_NETWORK_OBSERVATION',chain:'ethereum',
  provider:'Blockscout Ethereum',observedAt:receivedAt,collectedAt:receivedAt,
  timestampScope:'CLIENT_CAPTURE_PROVIDER_STATS_NOT_POINT_IN_TIME',
  totalTransactions,totalBlocks,transactionsToday:todayTransactions,
  averageBlockTimeSeconds:blockMs/1000,networkUtilizationPct:utilization,
  averageGasGwei:validGas?gas:null,
  gasUpdatedAt:validGas?gasUpdated:null,
  notWhaleEvidence:true,notDirectionalEvidence:true
 };
}
/**
 * TON Center API v2 getMasterchainInfo returns masterchain seqno, NOT
 * transaction totals. The timestamp is the phone's local HTTP reception.
 */
export function parseTonNetwork(raw,receivedAt){
 const last=raw?.result?.last;
 if(raw?.ok!==true||!Number.isSafeInteger(receivedAt)||receivedAt<=0||
    !last||last.workchain!==-1||
    !Number.isSafeInteger(last.seqno)||last.seqno<1||
    typeof last.root_hash!=='string'||last.root_hash.length<20||
    typeof last.file_hash!=='string'||last.file_hash.length<20)
  throw Error('Invalid TON masterchain response');
 return {
  scope:'TON_MASTERCHAIN_OBSERVATION',chain:'ton',
  provider:'TON Center API v2',observedAt:receivedAt,collectedAt:receivedAt,
  timestampScope:'CLIENT_CAPTURE_NO_PROVIDER_TIMESTAMP',
  masterchainSeqno:last.seqno,
  notTransactionCount:true,notWhaleEvidence:true,notDirectionalEvidence:true
 };
}

async function getJson(url,{fetchImpl,signal}){
 try{
  const response=await fetchImpl(url,{
   method:'GET',cache:'no-store',credentials:'omit',signal
  });
  if(response?.status===429||response?.status===418)
   return {state:'RATE_LIMITED',error:'Provider limited requests'};
  if(!response?.ok)
   return {state:'OFFLINE',error:'HTTP '+(response?.status||'unavailable')};
  const json=await response.json();
  return {state:'OK',data:json};
 }catch(e){
  return {state:'OFFLINE',error:String(e?.message||e).slice(0,160)};
 }
}
export async function collectOnChainNetwork(symbol,{
 fetchImpl=fetch,now=()=>Date.now(),signal
}={}){
 const chain=chainForAsset(symbol);
 if(!chain)return fail('UNSUPPORTED','Для актива нет прямого проверенного сетевого адаптера');
 if(chain==='bitcoin'){
  const first=await getJson(BTC_MEMPOOL,{fetchImpl,signal});
  if(first.state!=='OK')return fail(first.state,first.error,chain);
  // Fee endpoint is optional: a failure must never erase valid mempool evidence.
  const feeResponse=await getJson(BTC_FEES,{fetchImpl,signal});
  try{
   return good(chain,parseBitcoinNetwork(first.data,{
    fees:feeResponse.state==='OK'?feeResponse.data:null,
    receivedAt:now()
   }));
  }catch(e){return fail('INVALID',String(e.message||e),chain);}
 }
 if(chain==='ton'){
  const response=await getJson(TON_MASTERCHAIN,{fetchImpl,signal});
  if(response.state!=='OK')return fail(response.state,response.error,chain);
  try{return good(chain,parseTonNetwork(response.data,now()));}
  catch(e){return fail('INVALID',String(e.message||e),chain);}
 }
 const first=await getJson(ETH_STATS,{fetchImpl,signal});
 if(first.state!=='OK')return fail(first.state,first.error,chain);
 try{return good(chain,parseEthereumNetwork(first.data,now()));}
 catch(e){return fail('INVALID',String(e.message||e),chain);}
}
/**
 * Validate already-saved source observations. Each row is a snapshot captured
 * when fetched, NOT a backfilled time series from a full blockchain indexer.
 */
export function parseOnChainHistory(rows,chain){
 if(!['bitcoin','ethereum','ton'].includes(chain)||!Array.isArray(rows))return [];
 const source=chain==='bitcoin'?'mempool:bitcoin:network':
  chain==='ethereum'?'blockscout:ethereum:stats':'toncenter:ton:masterchain';
 const scope=chain==='bitcoin'?'BITCOIN_NETWORK_OBSERVATION':
  chain==='ethereum'?'ETHEREUM_NETWORK_OBSERVATION':'TON_MASTERCHAIN_OBSERVATION';
 const out=[];
 for(const row of rows.slice(0,240)){
  if(!row||row.source!==source||!Number.isSafeInteger(row.observedAt)||
   !Number.isSafeInteger(row.collectedAt)||row.collectedAt<row.observedAt||
   row.observedAt<=0)continue;
  let payload;
  try{payload=typeof row.payload==='string'?JSON.parse(row.payload):row.payload;}
  catch{continue;}
  if(!payload||payload.scope!==scope||payload.chain!==chain||
   payload.observedAt!==row.observedAt||
   payload.collectedAt!==row.collectedAt)continue;
  if(chain==='bitcoin'){
   if(!validInt(payload.mempoolCount)||!validInt(payload.mempoolVBytes)||
     !validNonnegative(payload.mempoolFeesSats))continue;
  }else if(chain==='ethereum'){
   if(!validInt(payload.totalTransactions)||!validInt(payload.totalBlocks)||
      !validInt(payload.transactionsToday)||!finite(payload.networkUtilizationPct)||
      payload.networkUtilizationPct<0||payload.networkUtilizationPct>100)continue;
  }else if(!validInt(payload.masterchainSeqno)||payload.masterchainSeqno<1)continue;
  out.push(payload);
 }
 out.sort((a,b)=>a.collectedAt-b.collectedAt);
 const unique=new Map();
 for(const row of out)unique.set(row.collectedAt,row);
 return [...unique.values()];
}
export function summarizeOnChainHistory(rows,{chain,now=Date.now()}={}){
 if(!['bitcoin','ethereum','ton'].includes(chain)||!Number.isSafeInteger(now))
  return {state:'INVALID',points:[]};
 const points=parseOnChainHistory(rows,chain);
 if(!points.length)return {state:'EMPTY',chain,points,samples:0};
 const latest=points.at(-1);
 const old=now-latest.collectedAt>=10*60000||now<latest.collectedAt-60000;
 const previous=points.length>=2?points.at(-2):null;
 const field=chain==='bitcoin'?'mempoolCount':
  chain==='ethereum'?'transactionsToday':'masterchainSeqno';
 const change=previous&&latest.collectedAt-previous.collectedAt>=60000
  ?latest[field]-previous[field]:null;
 const tonRate=chain==='ton'&&change!==null&&change>=0
  ?change/((latest.collectedAt-previous.collectedAt)/60000):null;
 return {
  state:old?'HISTORICAL':'OBSERVED',chain,points,samples:points.length,
  lastCapturedAt:latest.collectedAt,latest,
  comparisonChange:change,
  masterchainBlocksPerMinute:tonRate,
  comparisonNote:'Changes describe separately captured network snapshots, not market direction'
 };
}
