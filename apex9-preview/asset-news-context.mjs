/**
 * APEX 9.0 — join already fetched asset-specific GDELT and shared news.
 * No network calls, sentiment inference, event verification, trading signals
 * or global-news-to-asset attribution without an explicit headline match.
 */
import {assetHeadlineMatches} from './market-event-router.mjs';
import {consolidateArticles,cleanArticleUrl} from './news-source-fusion.mjs';

const eligible=new Set(['OK','EMPTY','STALE']);
const NEWS_WINDOW=48*3600_000;
const SNAPSHOT_WINDOW=60*60_000;
const stateOf=x=>typeof x?.state==='string'?x.state:'NOT_QUERIED';
const acceptableTime=(stamp,now)=>Number.isSafeInteger(stamp)&&stamp>0&&
 stamp<=now+60000&&now-stamp<=NEWS_WINDOW;

export function buildAssetNewsContext(symbol,{gdelt=null,live=null}={},{
 now=Date.now(),limit=6
}={}){
 if(typeof symbol!=='string'||!/^[A-Z0-9]{5,20}$/.test(symbol)||
  !Number.isSafeInteger(now)||now<=0||
  !Number.isInteger(limit)||limit<1||limit>18)
  return {state:'INVALID',stories:[],sources:{}};
 const sources={
  'GDELT (актив)':stateOf(gdelt),
  'Общая лента':stateOf(live)
 };
 if(live?.sources&&typeof live.sources==='object'){
  for(const [name,state] of Object.entries(live.sources).slice(0,16))
   if(typeof name==='string'&&name.length<70)
    sources[name]=typeof state==='string'?state:state?.state||'UNKNOWN';
 }
 const candidates=[];
 function append(article,{fallbackSource,timeKind,old=false}={}){
  const title=typeof article?.title==='string'?article.title.trim():'';
  const stamp=article?.observedAt??article?.seenAt;
  if(!title||!assetHeadlineMatches(symbol,title)||
   !acceptableTime(stamp,now))return;
  const href=article?.href||article?.url;
  let u;
  try{u=new URL(href);}catch{return;}
  if(u.protocol!=='https:'||u.username||u.password||!u.hostname.includes('.'))
   return;
  candidates.push({
   title,href:u.href,observedAt:stamp,
   source:typeof article?.source==='string'?article.source:
    typeof article?.provider==='string'?article.provider:fallbackSource,
   indexedBy:Array.isArray(article?.indexedBy)?article.indexedBy:[],
   timeKind:article?.timeKind==='PUBLISHED'?'PUBLISHED':
    article?.timeKind==='INDEXED'?'INDEXED':timeKind,
   outdated:old||article?.outdated===true,
   notDirectionalEvidence:true
  });
 }
 if(eligible.has(gdelt?.state))
  for(const article of gdelt?.data?.articles||[])
   append(article,{fallbackSource:'GDELT',timeKind:'INDEXED',
    old:gdelt.state==='STALE'});
 const snapshotOld=!Number.isSafeInteger(live?.checkedAt)||
  live.checkedAt>now+60000||now-live.checkedAt>SNAPSHOT_WINDOW;
 if(eligible.has(live?.state))
  for(const article of live?.articles||[])
   append(article,{fallbackSource:'Общая лента',timeKind:'UNKNOWN',
    old:live.state==='STALE'||snapshotOld});
 const stories=consolidateArticles(candidates,{limit,perDomain:4});
 // When an indexer and a publisher point to the SAME canonical article URL,
 // use the publisher's PUBLISHED date for the timeline, not the later
 // GDELT index timestamp. Never carry metadata across different URLs.
 for(const story of stories){
  const published=candidates.filter(x=>
   x.timeKind==='PUBLISHED'&&cleanArticleUrl(x.href)===story.href)
   .sort((a,b)=>b.observedAt-a.observedAt)[0];
  if(!published)continue;
  story.observedAt=published.observedAt;
  story.timeKind='PUBLISHED';
  story.source=published.source;
  story.outdated=published.outdated;
 }
 stories.sort((a,b)=>b.observedAt-a.observedAt);
 const usable=eligible.has(gdelt?.state)||eligible.has(live?.state);
 return {
  state:stories.length?'OK':usable?'EMPTY':'UNAVAILABLE',
  symbol,stories,sources,
  newestAt:stories.length?Math.max(...stories.map(a=>a.observedAt)):null,
  sourceScope:'HEADLINE_NAME_MATCH_NOT_INDEPENDENT_FACT_OR_MARKET_DIRECTION'
 };
}
