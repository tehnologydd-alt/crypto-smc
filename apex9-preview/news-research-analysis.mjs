/**
 * APEX news observation analysis. It describes the actually returned
 * headlines, NOT the truth of events, publisher independence, causality,
 * sentiment or a price forecast. Offline, deterministic and quota-free.
 */
import {describeNewsEvidence} from './news-evidence.mjs';

const PERIOD=48*3600_000;
const TOPIC_NAMES=['Регулирование','Безопасность','Сеть','Биржи','Инвестиционные фонды'];
const allowedAsset=/^[A-Z0-9]{2,12}$/;

export function analyzeNewsCollection(articles,{asset='BTC',now=Date.now()}={}){
 if(!Array.isArray(articles)||articles.length>100||
  !allowedAsset.test(asset)||!Number.isSafeInteger(now)||now<=0)
  return {state:'INVALID',scope:'HEADLINE_CONTEXT_ONLY'};
 const topics=Object.fromEntries(TOPIC_NAMES.map(name=>[name,0]));
 const publishers=new Set(),indexers=new Set();
 const result={state:'EMPTY',total:0,direct:0,general:0,otherAssets:0,
  unclear:0,recent6h:0,within24h:0,older24h:0,
  timestampUnknown:0,publishedTimes:0,indexedTimes:0,
  multiIndexed:0,uniquePublishers:0,topics,
  providerIndexers:[],
  scope:'HEADLINE_CONTEXT_ONLY_NO_EVENT_VERIFICATION_OR_PRICE_DIRECTION'};
 for(const article of articles){
  if(typeof article?.title!=='string'||!article.title.trim())continue;
  const stamp=article.observedAt;
  if(!Number.isSafeInteger(stamp)||stamp<=0||stamp>now+60000||
   now-stamp>PERIOD)continue;
  let host;
  try{const u=new URL(article.href);
   if(u.protocol!=='https:'||u.username||u.password||!u.hostname.includes('.'))
    continue;
   host=u.hostname.toLowerCase();
  }catch{continue;}
  const evidence=describeNewsEvidence(article,{asset,now});
  result.total++;
  publishers.add(host);
  for(const name of evidence.indexers)indexers.add(name);
  if(evidence.indexerCount>1)result.multiIndexed++;
  if(evidence.focus==='DIRECT')result.direct++;
  else if(evidence.focus==='GENERAL')result.general++;
  else if(evidence.focus==='OTHER_ASSETS')result.otherAssets++;
  else result.unclear++;
  if(evidence.timeKind==='PUBLISHED')result.publishedTimes++;
  else if(evidence.timeKind==='INDEXED')result.indexedTimes++;
  else result.timestampUnknown++;
  if(stamp>=now-6*3600_000)result.recent6h++;
  else if(stamp>=now-24*3600_000)result.within24h++;
  else result.older24h++;
  for(const name of evidence.topics)if(Object.hasOwn(topics,name))topics[name]++;
 }
 result.state=result.total?'OK':'EMPTY';
 result.uniquePublishers=publishers.size;
 result.providerIndexers=[...indexers].sort();
 return result;
}

export function formatNewsCollectionAnalysis(report,asset='BTC'){
 if(report?.state==='INVALID')return 'Анализ ленты недоступен: данные не прошли проверку.';
 if(!report||report.state==='EMPTY')
  return 'Анализ ленты: свежих проверенных по формату заголовков нет. Причины смотрите в статусах источников.';
 const themes=Object.entries(report.topics)
  .filter(([,count])=>count>0)
  .sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0],'ru'))
  .slice(0,3).map(([name,count])=>name+' — '+count).join('; ');
 const focus=report.direct?
  'Явно упоминают '+asset+': '+report.direct:
  'Прямых упоминаний '+asset+' в заголовках нет';
 return 'Анализ полученной ленты: '+report.total+' публикаций, '+
  report.uniquePublishers+' доменов издателей. '+focus+
  '. За 6 ч: '+report.recent6h+
  ', от 6 до 24 ч: '+report.within24h+
  ', старше суток: '+report.older24h+
  '. Темы: '+(themes||'не определены')+
  '. Несколько индексаторов одной статьи не являются независимым подтверждением. '+
  'События и влияние на цену не подтверждены.';
}
