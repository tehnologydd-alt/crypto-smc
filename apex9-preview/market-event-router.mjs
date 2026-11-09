/**
 * APEX 9.1 — route public editorial items and official macro schedules.
 * "Important" = deterministic editorial topic match, NEVER measured impact.
 * Source timestamps and asset names are preserved; no fabricated association.
 */
const SYMBOLS=Object.freeze({
 BTCUSDT:['bitcoin','btc'],
 ETHUSDT:['ethereum','ether','eth'],
 SOLUSDT:['solana'],
 XRPUSDT:['ripple','xrp'],
 BNBUSDT:['binance coin','bnb'],
 ADAUSDT:['cardano'],
 DOGEUSDT:['dogecoin','doge'],
 AVAXUSDT:['avalanche','avax'],
 LINKUSDT:['chainlink'],
 DOTUSDT:['polkadot'],
 GRAMUSDT:['toncoin','the open network','ton blockchain'],
 TONUSDT:['toncoin','the open network','ton blockchain'],
 LTCUSDT:['litecoin'],
 BCHUSDT:['bitcoin cash'],
 TRXUSDT:['tron network','tron blockchain'],
 SHIBUSDT:['shiba inu']
});
const important=/\b(ETF|SEC|CPI|PPI|FOMC|Federal Reserve|ECB|interest rates?|inflation|employment|regulation|regulator|exploit|hack|breach|listing|delisting|bankrupt|liquidat|tariff|sanction|stablecoin)\b/i;
const bound=(s,word)=>new RegExp('(^|[^a-z0-9])'+word.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'([^a-z0-9]|$)','i').test(s);
export function assetHeadlineMatches(symbol,headline){
 if(typeof headline!=='string'||headline.length>1500)return false;
 const names=SYMBOLS[symbol];
 return Array.isArray(names)&&names.some(word=>bound(headline,word));
}
const eligible=r=>['OK','CACHE','STALE'].includes(r?.state);
export function routeGlobalEvents(news,macro,calendar,{now=Date.now(),max=5}={}){
 const events=[],seen=new Set();
 const add=(row)=>{
  if(!row||!Number.isSafeInteger(row.observedAt)||row.observedAt<now-72*3600000||
   row.observedAt>now+72*3600000||seen.has(row.id))return;
  seen.add(row.id);events.push(row);
 };
 for(const [group,result] of [['news',news],['macro',macro]]){
  if(!result||!['OK','EMPTY','STALE'].includes(result.state))continue;
  for(const a of result.articles||[]){
   if(!a||typeof a.title!=='string'||!a.href?.startsWith('https://')||
    !Number.isSafeInteger(a.observedAt)||!important.test(a.title))continue;
   add({id:a.href,title:a.title,observedAt:a.observedAt,href:a.href,
    group,scope:group==='macro'?'GENERAL_MACRO':'CRYPTO_HEADLINE',
    importance:'TOPIC_MATCH_NOT_VERIFIED_IMPACT',
    outdated:result.state==='STALE'});
  }
 }
 if(calendar&&['OK','EMPTY','STALE'].includes(calendar.state)){
  for(const x of calendar.events||[]){
   if(!x||x.source!=='BLS_OFFICIAL_CALENDAR'||
    x.status!=='SCHEDULED_NOT_RELEASED'||!Number.isSafeInteger(x.at)||
    x.at<now||x.at>now+48*3600000)continue;
   add({id:'bls:'+x.id,title:x.title,observedAt:x.at,
    href:x.sourceUrl,group:'calendar',scope:'SCHEDULE_ONLY',
    importance:'SCHEDULED_NOT_ACTUAL',outdated:calendar.state==='STALE'});
  }
 }
 events.sort((a,b)=>{
  // Keep upcoming schedule after observed headlines while preserving recency.
  const aFuture=a.group==='calendar',bFuture=b.group==='calendar';
  return Number(aFuture)-Number(bFuture)||
   (aFuture?a.observedAt-b.observedAt:b.observedAt-a.observedAt);
 });
 return events.slice(0,Math.min(8,Math.max(1,max)));
}
export function routeAssetNews(symbol,result,{max=5}={}){
 if(!result||!['OK','EMPTY','STALE'].includes(result.state))return [];
 const arr=result.data?.articles||[];
 // GDELT parser now returns canonical news entries (href/observedAt);
 // older persisted snapshots may still contain url/seenAt.
 return arr.filter(x=>{
  if(!assetHeadlineMatches(symbol,x?.title))return false;
  const href=x.href||x.url,at=x.observedAt??x.seenAt;
  if(typeof href!=='string'||!Number.isSafeInteger(at)||at<=0)return false;
  try{const u=new URL(href);return u.protocol==='https:'&&
   !u.username&&!u.password&&u.hostname.includes('.');}
  catch{return false;}
 }).slice(0,max).map(x=>({
  title:x.title,url:x.href||x.url,seenAt:x.observedAt??x.seenAt,
  provider:'GDELT',scope:'NAME_MATCH_NOT_VERIFIED_IMPACT',
  outdated:result.state==='STALE'
 }));
}
