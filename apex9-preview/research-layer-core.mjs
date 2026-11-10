/** Read-only, source-attributed additional APEX 9 research layers.
 * No orders, auth tokens, wallet ownership inference, liquidation guessing,
 * directional ratings or synthetic observations.
 */
const BYBIT='https://api.bybit.com/v5/market/tickers';
const BLOCKSCOUT='https://eth.blockscout.com/api/v2/addresses/';
const BTC_ADDRESS='https://mempool.space/api/address/';
const VALID_SYMBOL=/^[A-Z0-9]{2,16}USDT$/;
const ETH=/^0x[0-9a-fA-F]{40}$/;
const BTC=/^(bc1[ac-hj-np-z02-9]{11,71}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})$/;
const number=x=>(typeof x==='string'&&/^-?\d+(?:\.\d+)?$/.test(x))?
 Number(x):NaN;
const validTime=(x,now,windowMs=15*60000)=>Number.isSafeInteger(x)&&x>0&&
 x<=now+60000&&now-x<=windowMs;
const denied=(state,reason)=>({state,reason,data:null});
export function publicWalletNetwork(address){
 if(typeof address!=='string')return null;
 const a=address.trim();
 return ETH.test(a)?'ethereum':BTC.test(a)?'bitcoin':null;
}
export function parseLinearDerivatives(raw,{symbol,now=Date.now()}={}){
 if(!VALID_SYMBOL.test(symbol||'')||!Number.isSafeInteger(now))
  return denied('INVALID','Некорректная торговая пара или время');
 if(raw?.retCode!==0){
  if(raw?.retCode===10006)return denied('RATE_LIMITED','Bybit ограничил запросы');
  return denied('UNAVAILABLE','Bybit не предоставил данные этого инструмента');
 }
 const rows=raw?.result?.list;
 if(!Array.isArray(rows)||rows.length!==1||rows[0]?.symbol!==symbol)
  return denied('UNSUPPORTED','Нет однозначного линейного контракта для выбранной пары');
 const item=rows[0],timestamp=Number(raw.time);
 const oi=number(item.openInterest),oiValue=number(item.openInterestValue);
 const rate=number(item.fundingRate),mark=number(item.markPrice);
 if(!validTime(timestamp,now)||!Number.isFinite(oi)||oi<0||
  !Number.isFinite(oiValue)||oiValue<0||
  !Number.isFinite(rate)||Math.abs(rate)>0.25||
  !Number.isFinite(mark)||mark<=0)
  return denied('INVALID','Данные OI, финансирования или время не прошли проверку');
 const nextFunding=Number(item.nextFundingTime);
 return {state:'OK',data:{
  symbol,provider:'Bybit public market ticker',
  receivedAt:now,observedAt:timestamp,market:'USDT_LINEAR_PERPETUAL',
  openInterestUnits:oi,openInterestUsd:oiValue,
  markPrice:mark,fundingRatePercent:Number((rate*100).toFixed(6)),
  nextFundingAt:validTime(nextFunding,now+24*3600000,24*3600000)&&nextFunding>=timestamp?
   nextFunding:null,
  liquidationEvents:{state:'NOT_CONNECTED',
   reason:'Публичный тикер не содержит подтверждённую историю ликвидаций'},
  notDirectionalEvidence:true
 }};
}
export async function fetchLinearDerivatives(symbol,{
 fetchImpl=fetch,now=()=>Date.now(),signal
}={}){
 if(typeof symbol!=='string'||!VALID_SYMBOL.test(symbol))
  return denied('UNSUPPORTED','Нужна подтверждённая USDT-пара');
 const url=BYBIT+'?category=linear&symbol='+encodeURIComponent(symbol);
 try{
  const r=await fetchImpl(url,{method:'GET',cache:'no-store',credentials:'omit',signal});
  if([418,429].includes(r?.status))return denied('RATE_LIMITED','HTTP '+r.status);
  if([401,403,451].includes(r?.status))return denied('ACCESS_DENIED','HTTP '+r.status);
  if(!r?.ok)return denied('OFFLINE','HTTP '+String(r?.status||'?'));
  return parseLinearDerivatives(await r.json(),{symbol,now:now()});
 }catch(e){return denied('OFFLINE',String(e?.name||e?.message||e).slice(0,95));}
}
const units=(wei,scale)=>Number(wei/scale)+Number(wei%scale)/Number(scale);
export function parsePublicWallet(raw,{address,network,now=Date.now()}={}){
 if(!Number.isSafeInteger(now)||now<=0||publicWalletNetwork(address)!==network)
  return denied('INVALID','Неверная сеть или адрес');
 if(network==='ethereum'){
  if(typeof raw?.hash!=='string'||raw.hash.toLowerCase()!==address.toLowerCase()||
    typeof raw.coin_balance!=='string'||!/^\d{1,80}$/.test(raw.coin_balance))
   return denied('INVALID','Blockscout вернул неправильный адрес или баланс');
  let wei;
  try{wei=BigInt(raw.coin_balance);}catch{return denied('INVALID','Ошибка баланса');}
  if(wei<0n)return denied('INVALID','Отрицательный баланс');
  const approx=units(wei,1000000000000000000n);
  if(!Number.isFinite(approx))return denied('INVALID','Баланс вне допустимого диапазона');
  return {state:'OK',data:{network,address,
   provider:'Blockscout Ethereum API v2',confirmedNativeBalance:approx,
   nativeUnit:'ETH',receivedAt:now,ownerVerified:false,
   largeWalletVerified:false,scope:'PUBLIC_ADDRESS_CURRENT_BALANCE_ONLY'}};
 }
 if(raw?.address!==address||!raw.chain_stats||
  !['funded_txo_sum','spent_txo_sum'].every(k=>
   Number.isSafeInteger(raw.chain_stats[k])&&raw.chain_stats[k]>=0)||
  raw.chain_stats.spent_txo_sum>raw.chain_stats.funded_txo_sum)
  return denied('INVALID','mempool.space вернул некорректную историю адреса');
 return {state:'OK',data:{network,address,provider:'mempool.space Address API',
  confirmedNativeBalance:(raw.chain_stats.funded_txo_sum-
   raw.chain_stats.spent_txo_sum)/100000000,
  nativeUnit:'BTC',receivedAt:now,ownerVerified:false,
  largeWalletVerified:false,scope:'PUBLIC_ADDRESS_CONFIRMED_BALANCE_ONLY'}};
}
export async function fetchPublicWallet(address,{
 fetchImpl=fetch,now=()=>Date.now(),signal
}={}){
 const network=publicWalletNetwork(address);
 if(!network)return denied('INVALID','Поддерживается только публичный адрес BTC или Ethereum');
 const clean=address.trim();
 const url=network==='ethereum'?BLOCKSCOUT+encodeURIComponent(clean):
  BTC_ADDRESS+encodeURIComponent(clean);
 try{
  const r=await fetchImpl(url,{method:'GET',cache:'no-store',credentials:'omit',signal});
  if([418,429].includes(r?.status))return denied('RATE_LIMITED','HTTP '+r.status);
  if([401,403,451].includes(r?.status))return denied('ACCESS_DENIED','HTTP '+r.status);
  if(r?.status===404)return denied('NOT_FOUND','Адрес не найден в источнике');
  if(!r?.ok)return denied('OFFLINE','HTTP '+String(r?.status||'?'));
  return parsePublicWallet(await r.json(),{address:clean,network,now:now()});
 }catch(e){return denied('OFFLINE',String(e?.name||e?.message||e).slice(0,95));}
}
/** A lexical audit of actual public messages, not an AI model or public vote. */
const tokens=(s)=>String(s||'').normalize('NFKC').toLowerCase()
 .match(/[\p{L}]+/gu)||[];
const UP=new Set(['bullish','rally','surge','uptrend','growth','optimistic',
 'растёт','рост','восходящий','оптимизм']);
const DOWN=new Set(['bearish','dump','crash','downtrend','falling','pessimistic',
 'падение','снижение','снижается','обвал']);
export function summarizePublicDiscussion(result,{now=Date.now()}={}){
 if(!['OK','EMPTY','STALE'].includes(result?.state))
  return {state:result?.state||'NOT_CHECKED',posts:0,reason:result?.reason||null};
 const posts=Array.isArray(result.posts)?result.posts.filter(x=>
  typeof x?.text==='string'&&validTime(x.indexedAt,now,24*3600000)):null;
 if(!posts)return {state:'INVALID',posts:0};
 let up=0,down=0,neutral=0;
 for(const post of posts.slice(0,12)){
  const words=tokens(post.text),a=words.some(x=>UP.has(x)),b=words.some(x=>DOWN.has(x));
  if(a&&!b)up++;
  else if(b&&!a)down++;
  else neutral++;
 }
 return {state:result.state,posts:up+down+neutral,keywordUp:up,
  keywordDown:down,ambiguous:neutral,
  observedAt:posts.length?Math.max(...posts.map(p=>p.indexedAt)):null,
  credibleSentiment:'NOT_ESTABLISHED',
  note:'Простые совпадения слов; выборка не является измерением настроения всего рынка'};
}
