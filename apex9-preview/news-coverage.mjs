/**
 * Descriptive audit of articles that APEX actually displayed.
 * No sentiment scoring, event truth verification, or market direction.
 * An article being indexed by multiple services is NOT corroboration.
 */
import {describeNewsEvidence} from './news-evidence.mjs';
const VALID=/^(BTC|ETH|SOL|XRP|ADA|BNB|DOGE|LTC)$/;
export function auditDisplayedNews(articles,{asset='BTC',now=Date.now()}={}){
 if(!Array.isArray(articles)||articles.length>100||
  typeof asset!=='string'||!VALID.test(asset)||
  !Number.isSafeInteger(now)||now<=0)return {state:'INVALID'};
 const result={state:'OK',total:0,mentionsAsset:0,generalTopic:0,
  otherAsset:0,unresolved:0,publishedTime:0,indexedTime:0,
  unknownTime:0,olderThan12h:0,olderThan24h:0,
  multiIndexerStories:0,uniquePublisherDomains:0,
  providerIndexers:[],scope:'HEADLINES_ONLY_NO_CAUSAL_OR_SENTIMENT_INFERENCE'};
 const publishers=new Set(),indexers=new Set();
 for(const article of articles){
  if(!article||typeof article.title!=='string'||
   typeof article.href!=='string')continue;
  const evidence=describeNewsEvidence(article,{asset,now});
  result.total++;
  if(evidence.focus==='DIRECT')result.mentionsAsset++;
  else if(evidence.focus==='GENERAL')result.generalTopic++;
  else if(evidence.focus==='OTHER_ASSETS')result.otherAsset++;
  else result.unresolved++;
  if(evidence.timeKind==='PUBLISHED')result.publishedTime++;
  else if(evidence.timeKind==='INDEXED')result.indexedTime++;
  else result.unknownTime++;
  const age=article.observedAt;
  if(Number.isSafeInteger(age)&&age>0&&age<=now){
   if(now-age>=12*3600000)result.olderThan12h++;
   if(now-age>=24*3600000)result.olderThan24h++;
  }
  if(evidence.indexerCount>1)result.multiIndexerStories++;
  for(const name of evidence.indexers)indexers.add(name);
  try{
   const host=new URL(article.href).hostname;
   if(host&&host.includes('.'))publishers.add(host);
  }catch{}
 }
 result.uniquePublisherDomains=publishers.size;
 result.providerIndexers=[...indexers].sort();
 return result;
}
export function formatDisplayedNewsAudit(report,asset){
 if(report?.state!=='OK')return 'Качество подборки проверить не удалось.';
 if(!report.total)return 'Публикаций для проверки пока нет.';
 return report.total+' публикаций · '+report.mentionsAsset+
  ' с явным упоминанием '+asset+' в заголовке · '+
  report.uniquePublisherDomains+' доменов издателей · '+
  report.publishedTime+' дат публикации / '+
  report.indexedTime+' дат индексации · '+
  report.olderThan12h+' старше 12 ч · '+
  report.multiIndexerStories+' перепечаток через несколько индексаторов. '+
  'Это оценка полноты ленты, не проверка истинности событий.';
}
