/** Provider adapters usable by Node and Cloudflare; no filesystem or credentials in browser. */
const CONFIG=Object.freeze({cryptopanic:{env:'APEX_CRYPTOPANIC_TOKEN'},newsdata:{env:'APEX_NEWSDATA_KEY'}});
const validCoin=/^(BTC|ETH|SOL|XRP|ADA|BNB|DOGE|LTC)$/;
export function providerRequest(provider,coin,secret){
 if(!CONFIG[provider]||!validCoin.test(coin)||typeof secret!=='string'||!secret.trim())
  return null;
 let url;
 if(provider==='cryptopanic'){
  url=new URL('https://cryptopanic.com/api/developer/v2/posts/');
  url.searchParams.set('auth_token',secret);
  url.searchParams.set('public','true');
  url.searchParams.set('currencies',coin);
  url.searchParams.set('kind','news');
 }else{
  url=new URL('https://newsdata.io/api/1/crypto');
  url.searchParams.set('apikey',secret);
  url.searchParams.set('coin',coin.toLowerCase());
  url.searchParams.set('language','en');
  url.searchParams.set('timezone','Etc/UTC');
  url.searchParams.set('timeframe','48');
  url.searchParams.set('removeduplicate','1');
 }
 return url;
}
/** NewsData.io may return a timezone-naive pubDate when the request
 * explicitly selects Etc/UTC. Interpret ONLY that documented response
 * shape as UTC; reject unknown date formats instead of guessing. */
export function parseProviderPublicationDate(value,provider){
 if(typeof value!=='string'||value.length>48)return NaN;
 let date=value.trim();
 if(provider==='newsdata'&&/^\d{4}-\d\d-\d\d[ T]\d\d:\d\d:\d\d$/.test(date))
  date=date.replace(' ','T')+'Z';
 if(!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(date))
  return NaN;
 return Date.parse(date);
}
export function normalizeProviderNews(provider,raw,now=Date.now()){
 const entries=raw?.results;
 if(!Array.isArray(entries))return {state:'INVALID',articles:[]};
 const articles=[];
 for(const entry of entries.slice(0,60)){
  const title=String(entry?.title||'').trim().slice(0,220);
  // Link to the original publisher, not the aggregator's copy, when supplied.
  const href=String(provider==='cryptopanic'?
   (entry?.original_url||entry?.url||''):(entry?.link||entry?.url||''));
  const timestamp=parseProviderPublicationDate(provider==='cryptopanic'?
   entry?.published_at:entry?.pubDate,provider);
  let url;
  try{url=new URL(href);}catch{continue;}
  if(url.protocol!=='https:'||url.username||url.password||
   !Number.isFinite(timestamp)||timestamp>now+60000||
   now-timestamp>48*3600000||title.length<10)continue;
  articles.push({title,href:url.href,observedAt:timestamp,source:
   provider==='cryptopanic'?'CryptoPanic':'NewsData.io',
   domain:url.hostname,notDirectionalEvidence:true});
 }
 return {state:articles.length?'OK':'EMPTY',articles};
}
