/**
 * One read-only Binance Spot 24h ticker request for <=10 saved favorites.
 * A bounded on-device snapshot persists through navigation and network faults;
 * cache entries are ALWAYS labelled historical, never claimed as fresh HTTP.
 */
const API='https://data-api.binance.vision/api/v3/ticker/24hr';
const KEY='apex9:favorite-tickers:v1';
const FRESH=90000,MAX_AGE=48*3600000;
const SYMBOL=/^[A-Z0-9]{2,16}USDT$/;
const n=x=>(typeof x==='string'||typeof x==='number')&&
 String(x).trim()!==''&&/^-?\d+(?:\.\d+)?$/.test(String(x))?
 Number(x):NaN;
export function sanitizeFavoriteSymbols(input){
 if(!Array.isArray(input))return [];
 return [...new Set(input.filter(x=>typeof x==='string'&&SYMBOL.test(x)))].slice(0,10);
}
export function parseFavoriteTickers(raw,{favorites=[],now=Date.now()}={}){
 const selected=new Set(sanitizeFavoriteSymbols(favorites));
 if(!Array.isArray(raw)||raw.length>30||!Number.isSafeInteger(now))
  return {state:'INVALID',prices:{},reason:'Unexpected batch ticker response'};
 const prices={};
 for(const item of raw){
  const symbol=item?.symbol;
  if(!selected.has(symbol)||Object.hasOwn(prices,symbol))continue;
  const observedAt=Number(item.closeTime),price=n(item.lastPrice),
   percent=n(item.priceChangePercent);
  if(!Number.isSafeInteger(observedAt)||observedAt<=0||
   observedAt>now+60000||now-observedAt>180000||
   !Number.isFinite(price)||price<=0||
   !Number.isFinite(percent)||Math.abs(percent)>1000)continue;
  prices[symbol]={price,changePercent24h:percent,observedAt,
   source:'BINANCE_SPOT_24H'};
 }
 return {state:Object.keys(prices).length?'OK':'EMPTY',prices};
}
export function createFavoriteTickerFeed({storage,now=()=>Date.now(),
 fetchImpl=fetch}={}){
 let inFlight=null,lastChecked=0,internal={};
 const read=()=>{
  try{
   const raw=storage?.getItem?.(KEY),data=raw?JSON.parse(raw):null;
   return data&&typeof data==='object'&&!Array.isArray(data)?data:{};
  }catch{return internal}
 };
 const valid=(x,at)=>x&&x.source==='BINANCE_SPOT_24H'&&
  Number.isSafeInteger(x.observedAt)&&x.observedAt<=at+60000&&
  at-x.observedAt<=MAX_AGE&&Number.isFinite(x.price)&&x.price>0&&
  Number.isFinite(x.changePercent24h);
 const cached=(favorites)=>{
  const at=now(),raw={...read(),...internal},prices={};
  for(const symbol of sanitizeFavoriteSymbols(favorites))
   if(valid(raw[symbol],at))prices[symbol]={...raw[symbol],fromCache:true};
  return prices;
 };
 async function refresh(favorites,{force=false}={}){
  const selected=sanitizeFavoriteSymbols(favorites);
  if(!selected.length)return {state:'NO_FAVORITES',prices:{}};
  if(inFlight)return inFlight;
  const at=now();
  if(!force&&at-lastChecked<FRESH)
   return {state:'CACHE',prices:cached(selected)};
  lastChecked=at;
  const task=(async()=>{
   try{
    const params=new URLSearchParams({symbols:JSON.stringify(selected)});
    const res=await fetchImpl(API+'?'+params,{
     method:'GET',cache:'no-store',credentials:'omit'
    });
    if([418,429].includes(res?.status))return {state:'RATE_LIMITED',
     prices:cached(selected)};
    if(!res?.ok)return {state:'OFFLINE',prices:cached(selected),
     reason:'Binance HTTP '+String(res?.status||'?')};
    const result=parseFavoriteTickers(await res.json(),{favorites:selected,now:at});
    if(result.state==='OK'){
     const merged={...read(),...internal,...result.prices};
     internal=merged;
     try{storage?.setItem?.(KEY,JSON.stringify(merged))}catch{}
    }
    return {...result,prices:{...cached(selected)}};
   }catch(e){return {state:'OFFLINE',prices:cached(selected),
    reason:String(e?.message||e).slice(0,110)}}
  })();
  inFlight=task;
  try{return await task}finally{inFlight=null}
 }
 return {cached,refresh};
}
