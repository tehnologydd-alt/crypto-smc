/**
 * Merges ONLY news actually returned by source adapters, keeping their health
 * statuses separate. A replayed cached story is not a fresh network response.
 */
import {consolidateArticles} from './news-source-fusion.mjs';
const valid=new Set(['OK','EMPTY','STALE']);
const stateOf=x=>typeof x?.state==='string'?x.state:'NOT_QUERIED';
export function composeLiveNews({gdelt,rss,personal}={}, {now=Date.now(),limit=18}={}){
 const sources={
  GDELT:stateOf(gdelt),RSS:stateOf(rss),
  CryptoPanic:personal?.providers?.cryptopanic||'NOT_CONFIGURED',
  'NewsData.io':personal?.providers?.newsdata||'NOT_CONFIGURED'
 };
 for(const [name,detail] of Object.entries(rss?.sources||{})){
  if(detail?.state&&typeof detail.state==='string')
   sources[name]={state:detail.state,count:detail.count};
 }
 const inputs=[['GDELT',gdelt],['RSS',rss],['PERSONAL',personal]];
 const candidates=[];
 for(const [id,result] of inputs){
  if(!valid.has(result?.state)||!Array.isArray(result.articles))continue;
  for(const article of result.articles){
   if(!article||!Number.isSafeInteger(article.observedAt)||
    article.observedAt<=0||article.observedAt>now+60000||
    now-article.observedAt>48*3600000)continue;
   candidates.push({...article,outdated:article.outdated===true||
    result.state==='STALE',source:article.source||(id==='GDELT'?'GDELT':id)});
  }
 }
 const articles=consolidateArticles(candidates,{limit,perDomain:4});
 const anyUsable=inputs.some(([,r])=>r?.state==='OK'||r?.state==='EMPTY');
 const hasStale=inputs.some(([,r])=>r?.state==='STALE');
 const newest=articles.reduce((max,r)=>Math.max(max,r.observedAt),0);
 const state=articles.length?
  (articles.some(a=>!a.outdated)?'OK':'STALE'):
  anyUsable?'EMPTY':hasStale?'STALE':'UNAVAILABLE';
 const stamps=[gdelt?.fetchedAt,rss?.fetchedAt].filter(v=>
  Number.isSafeInteger(v)&&v>0&&v<=now+60000);
 const fetchedAt=stamps.length?Math.max(...stamps):null;
 return {state,articles,sources,latestArticleAt:newest,fetchedAt,
  checkedSources:inputs.filter(([,r])=>r&&r.state!=='ANDROID_ONLY'&&
   r.state!=='NOT_CONFIGURED').length,
  source:'MIXED',scope:'HEADLINE_OBSERVATIONS_NOT_VERIFIED_CAUSALITY'};
}
export function sourceStatusLine(sources={}){
 const labels={
  OK:'ответ получен',EMPTY:'ответ без подходящих статей',
  STALE:'только архив',WAIT_INTERVAL:'пауза локального лимита',
  DAILY_LIMIT:'суточный лимит',MONTHLY_LIMIT:'месячный лимит',
  LIMIT_REACHED:'суточный лимит',RATE_LIMITED:'429 от сервиса',
  OFFLINE:'нет ответа',ACCESS_DENIED:'отказ в доступе',INVALID:'неподходящий ответ',
  NOT_CONFIGURED:'ключ не настроен',ANDROID_ONLY:'нужна новая Android APK',
  UNAVAILABLE:'не удалось получить',NOT_QUERIED:'не запрашивался',
  FORBIDDEN_OR_LIMITED:'нет доступа по тарифу',
  INVALID_CREDENTIALS:'ключ отклонён',TIMEOUT:'время ожидания истекло',
  NETWORK_OR_FORMAT_ERROR:'ошибка сети или формата',
  OVERSIZED:'ответ слишком большой'
 };
 return Object.entries(sources).map(([source,raw])=>{
  const state=typeof raw==='string'?raw:raw?.state;
  const count=Number.isSafeInteger(raw?.count)&&raw.count>0?
   ' ('+raw.count+' записей)':'';
  const human=/^HTTP_\d{3}$/.test(state)?'HTTP '+state.slice(5):
   (labels[state]||String(state||'неизвестно'));
  return source+': '+human+count;
 }).join(' · ');
}
