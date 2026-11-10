/**
 * APEX public-source smoke checks for GitHub Actions.
 * Uses 1 GET per source, zero credentials, no retry/polling and no invented
 * fallback data. This tests CI-host network reachability, NOT Android.
 */
const now=Date.now();
const HOUR=3600000;
const checks=[
 ['Binance Spot M5','https://data-api.binance.vision/api/v3/klines?symbol=BTCUSDT&interval=5m&limit=4','json',data=>{
   if(!Array.isArray(data)||data.length<2)return {state:'INVALID',reason:'Missing real candles'};
   const bars=data.filter(r=>Array.isArray(r)&&Number.isSafeInteger(Number(r[0]))&&
     Number.isSafeInteger(Number(r[6]))&&Number(r[6])<now&&
     Number.isFinite(Number(r[4]))&&Number(r[4])>0);
   if(!bars.length)return {state:'EMPTY',reason:'No fully closed M5 candles'};
   const end=Number(bars.at(-1)[6]);
   return {state:now-end<20*60000?'OK':'STALE',count:bars.length,
     observedAt:end};
 }],
 ['mempool.space BTC network','https://mempool.space/api/mempool','json',data=>{
   if(!Number.isSafeInteger(data?.count)||data.count<0||
      !Number.isSafeInteger(data?.vsize)||data.vsize<0||
      !Number.isFinite(data?.total_fee)||data.total_fee<0)
     return {state:'INVALID',reason:'Invalid Bitcoin mempool counts'};
   return {state:'OK',count:data.count,
     scope:'BITCOIN_NETWORK_ONLY',observedAt:null};
 }],
 ['CoinGecko global','https://api.coingecko.com/api/v3/global','json',data=>{
   const row=data?.data,stamp=Number(row?.updated_at)*1000;
   if(!row||!Number.isFinite(row.total_market_cap?.usd)||!Number.isSafeInteger(stamp))
     return {state:'INVALID',reason:'Missing global data or timestamp'};
   return {state:now-stamp<2*HOUR&&stamp<now+60000?'OK':'STALE',
     observedAt:stamp};
 }],
 ['Alternative.me FNG','https://api.alternative.me/fng/?limit=1','json',data=>{
   const r=data?.data?.[0],stamp=Number(r?.timestamp)*1000;
   if(!r||!Number.isFinite(Number(r.value))||!Number.isSafeInteger(stamp))
     return {state:'INVALID',reason:'Missing index or timestamp'};
   return {state:now-stamp<48*HOUR&&stamp<now+60000?'OK':'STALE',
     observedAt:stamp};
 }],
 ['GDELT DOC','https://api.gdeltproject.org/api/v2/doc/doc?query=bitcoin&mode=artlist&maxrecords=5&timespan=24h&format=json&sort=datedesc','json',data=>{
   if(!Array.isArray(data?.articles))return {state:'INVALID',reason:'Missing article list'};
   if(!data.articles.length)return {state:'EMPTY',count:0};
   const valid=data.articles.filter(a=>typeof a.title==='string'&&
     typeof a.url==='string'&&a.url.startsWith('https://'));
   return {state:valid.length?'OK':'INVALID',count:valid.length};
 }],
 ['Cointelegraph RSS','https://cointelegraph.com/rss','xml',data=>{
   if(!/<rss\b|<feed\b/i.test(data))return {state:'INVALID',reason:'RSS/XML feed not recognized'};
   const count=(data.match(/<item\b/g)||[]).length;
   return {state:count?'OK':'EMPTY',count};
 }]
];
async function check([name,url,format,validate]){
 try{
   const response=await fetch(url,{method:'GET',credentials:'omit',
    headers:{'accept':format==='xml'?'application/xml, text/xml, application/rss+xml':'application/json'},
    signal:AbortSignal.timeout(12000),redirect:'follow'});
   if([418,429].includes(response.status))return {name,state:'RATE_LIMITED',http:response.status};
   if([401,403].includes(response.status))return {name,state:'ACCESS_DENIED',http:response.status};
   if(!response.ok)return {name,state:'OFFLINE',http:response.status};
   const raw=format==='json'?await response.json():await response.text();
   const r=validate(raw);
   return {name,http:response.status,...r};
 }catch(err){
   return {name,state:'OFFLINE',reason:String(err?.name||'Network error').slice(0,60)};
 }
}
const results=await Promise.all(checks.map(check));
const summary={
 checkedAt:new Date(now).toISOString(),scope:'GITHUB_RUNNER_ONLY',
 total:results.length,ok:results.filter(x=>x.state==='OK').length,
 sourceStates:results
};
console.log(JSON.stringify(summary,null,2));
if(process.env.GITHUB_STEP_SUMMARY){
 const fs=await import('node:fs');
 const rows=results.map(r=>'| '+r.name+' | '+r.state+' | '+(r.http??'—')+
   ' | '+(r.count??'—')+' |').join('\n');
 fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,
  '## APEX live public-source check (GitHub runner only)\n\n'+
  '| Provider | State | HTTP | Items |\n|---|---|---|---|\n'+rows+
  '\n\nGitHub network results are not proof of Android device connectivity.\n');
}
if(summary.ok===0){console.error('No source returned a recent valid response.');process.exitCode=1;}
