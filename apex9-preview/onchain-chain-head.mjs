/**
 * Additional public blockchain HEAD snapshots, separate from existing
 * BTC/ETH/GRAM full on-chain adapters. All requests are READ ONLY and fixed
 * per known base asset. A network head is NOT token transaction analytics.
 * No secrets, addresses, orders or external user-configurable endpoints.
 */
const SOURCES=Object.freeze({
 AVAX:{chain:'avalanche',label:'Avalanche C-Chain',provider:'Avalanche public JSON-RPC',
  url:'https://api.avax.network/ext/bc/C/rpc',method:'eth_blockNumber',kind:'evm'},
 BNB:{chain:'bsc',label:'BNB Smart Chain',provider:'BNB Chain public JSON-RPC',
  url:'https://bsc-dataseed.bnbchain.org',method:'eth_blockNumber',kind:'evm'},
 SOL:{chain:'solana',label:'Solana Mainnet',provider:'Solana public JSON-RPC',
  url:'https://api.mainnet.solana.com',method:'getSlot',kind:'solana'},
 ADA:{chain:'cardano',label:'Cardano Mainnet',provider:'Koios Cardano API',
  url:'https://api.koios.rest/api/v1/tip',kind:'koios'},
 XRP:{chain:'xrpl',label:'XRP Ledger',provider:'XRPL public JSON-RPC',
  url:'https://xrplcluster.com/',method:'ledger',kind:'xrpl'},
 DOT:{chain:'polkadot',label:'Polkadot Relay Chain',provider:'Polkadot public JSON-RPC',
  url:'https://rpc.polkadot.io',method:'chain_getHeader',kind:'dot'},
 TRX:{chain:'tron',label:'TRON Mainnet',provider:'TronGrid Solidity Node',
  url:'https://api.trongrid.io/walletsolidity/getnowblock',kind:'tron'},
 DOGE:{chain:'dogecoin',label:'Dogecoin Mainnet',provider:'BlockCypher',
  url:'https://api.blockcypher.com/v1/doge/main',kind:'blockcypher'},
 LTC:{chain:'litecoin',label:'Litecoin Mainnet',provider:'BlockCypher',
  url:'https://api.blockcypher.com/v1/ltc/main',kind:'blockcypher'}
});
const finite=n=>Number.isSafeInteger(n)&&n>0&&n<Number.MAX_SAFE_INTEGER;
const hex=h=>typeof h==='string'&&/^0x[0-9a-fA-F]{1,14}$/.test(h)?
 parseInt(h.slice(2),16):NaN;
const numeric=s=>typeof s==='number'?s:
 typeof s==='string'&&/^\d{1,15}$/.test(s)?Number(s):NaN;
const error=(state,reason,info)=>({state,reason,chain:info?.chain||null,data:null});
const symbolBase=s=>typeof s==='string'&&/^[A-Z0-9]{2,16}USDT$/.test(s)?
 s.slice(0,-4):null;
export function chainHeadSourceForAsset(symbol){
 const base=symbolBase(symbol),entry=SOURCES[base];
 return entry?{...entry,base}:null;
}
export function supportedChainHeadSymbols(){
 return Object.keys(SOURCES).map(x=>x+'USDT');
}
export function parseChainHead(raw,symbol,{now=Date.now()}={}){
 const info=chainHeadSourceForAsset(symbol);
 if(!info||!finite(now))return error('UNSUPPORTED','Нет подтверждённого источника для этой пары',info);
 let height=NaN,providerAt=null,unit='блок';
 switch(info.kind){
  case 'evm':
   if(raw?.jsonrpc!=='2.0'||raw.error)break;
   height=hex(raw.result);break;
  case 'solana':
   if(raw?.jsonrpc!=='2.0'||raw.error)break;
   height=numeric(raw.result);unit='слот';break;
  case 'koios':{
   const row=Array.isArray(raw)&&raw.length===1?raw[0]:null;
   height=numeric(row?.block_no);
   providerAt=finite(numeric(row?.block_time))?Number(row.block_time)*1000:null;
   break;
  }
  case 'xrpl':{
   const result=raw?.result;
   if(result?.status!=='success'||result?.validated===false)break;
   height=numeric(result?.ledger?.ledger_index||result?.ledger_index);
   break;
  }
  case 'dot':
   if(raw?.jsonrpc!=='2.0'||raw.error)break;
   height=hex(raw?.result?.number);break;
  case 'tron':
   height=numeric(raw?.block_header?.raw_data?.number);break;
  case 'blockcypher':
   height=numeric(raw?.height);
   if(typeof raw?.time==='string'){
    const t=Date.parse(raw.time);if(Number.isFinite(t))providerAt=t;
   }
   break;
 }
 if(!finite(height)||providerAt!==null&&(!finite(providerAt)||providerAt>now+60000))
  return error('INVALID','Источник не подтвердил корректный номер блока или слота',info);
 const stale=providerAt!==null&&now-providerAt>45*60000;
 const data={scope:'CHAIN_HEAD_ONLY',chain:info.chain,base:info.base,
  label:info.label,provider:info.provider,chainHeight:height,unit,
  observedAt:now,collectedAt:now,
  timestampScope:providerAt===null?'CLIENT_CAPTURE_NO_PROVIDER_TIMESTAMP':
   'PROVIDER_BLOCK_TIMESTAMP',providerAt,assetSpecificNetwork:true,
  notTransactionCount:true,notWalletEvidence:true,notDirectionalEvidence:true};
 return {state:stale?'STALE':'OK',chain:info.chain,data,
  reason:stale?'Источник сообщил устаревший блок':'Блок или слот подтверждён источником'};
}
export async function collectChainHead(symbol,{fetchImpl=fetch,now=()=>Date.now(),signal}={}){
 const info=chainHeadSourceForAsset(symbol);
 if(!info)return error('UNSUPPORTED','Для актива ещё нет проверенного сетевого адаптера');
 let method='GET',body,headers={Accept:'application/json'};
 if(info.kind!=='koios'&&info.kind!=='blockcypher'){
  method='POST';headers['Content-Type']='application/json';
  body=JSON.stringify({jsonrpc:'2.0',id:1,method:info.method,
   params:info.kind==='solana'?[{commitment:'finalized'}]:
    info.kind==='xrpl'?[{ledger_index:'validated',transactions:false}]:[]});
  if(info.kind==='tron'){body='{}';}
 }
 try{
  const r=await fetchImpl(info.url,{method,headers,body,cache:'no-store',
   credentials:'omit',signal});
  if([418,429].includes(r?.status))return error('RATE_LIMITED','API ограничил запросы',info);
  if([401,403,451].includes(r?.status))return error('ACCESS_DENIED','HTTP '+r.status,info);
  if(!r?.ok)return error('OFFLINE','HTTP '+(r?.status||'?'),info);
  return parseChainHead(await r.json(),symbol,{now:now()});
 }catch(e){return error('OFFLINE',String(e?.message||e).slice(0,110),info);}
}
const KEY='apex9:chain-head-history:v1';
export function createChainHeadCache({storage,now=()=>Date.now()}={}){
 let memory={};
 const readAll=()=>{
  try{
   const raw=storage?.getItem?.(KEY),data=raw&&raw.length<28000?JSON.parse(raw):null;
   return data&&typeof data==='object'&&!Array.isArray(data)?{...data,...memory}:memory;
  }catch{return memory;}
 };
 function history(symbol){
  const info=chainHeadSourceForAsset(symbol),at=now();
  if(!info)return [];
  const rows=readAll()[symbol];
  if(!Array.isArray(rows))return [];
  return rows.filter(x=>x?.scope==='CHAIN_HEAD_ONLY'&&x.chain===info.chain&&
   finite(x.chainHeight)&&finite(x.collectedAt)&&x.collectedAt<=at+60000&&
   at-x.collectedAt<=7*86400000).slice(-48);
 }
 function store(symbol,result){
  if(result?.state!=='OK'||result.data?.chain!==chainHeadSourceForAsset(symbol)?.chain)
   return false;
  const d=result.data,at=now();
  if(!finite(d.chainHeight)||!finite(d.collectedAt)||d.collectedAt>at+60000)
   return false;
  const list=[...history(symbol).filter(x=>x.collectedAt!==d.collectedAt),d]
   .sort((a,b)=>a.collectedAt-b.collectedAt).slice(-48);
  const next=readAll();next[symbol]=list;
  memory=Object.fromEntries(Object.entries(next).slice(-10));
  try{storage?.setItem?.(KEY,JSON.stringify(memory))}catch{}
  return true;
 }
 return {history,store};
}
