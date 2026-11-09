/**
 * Neutral, explainable news metadata. No price impact prediction.
 * We only know what a headline says; we DO NOT verify the event itself.
 */
const MENTIONS=Object.freeze({
 BTC:/\b(?:BTC|Bitcoin)\b/i,
 ETH:/\b(?:ETH|Ethereum)\b/i,
 SOL:/\bSolana\b|\bSOL\b/,
 XRP:/\bXRP\b|\bRipple\b/i,
 ADA:/\bCardano\b|\bADA\b/,
 BNB:/\bBNB\b|\bBinance Coin\b/i,
 DOGE:/\bDogecoin\b|\bDOGE\b/i,
 LTC:/\bLitecoin\b|\bLTC\b/i,
 AVAX:/\bAvalanche\b|\bAVAX\b/i,
 LINK:/\bChainlink\b|\bLINK\b/i,
 DOT:/\bPolkadot\b|\bDOT\b/i,
 TRX:/\bTron\b|\bTRX\b/i,
 SHIB:/\bShiba Inu\b|\bSHIB\b/i,
 BCH:/\bBitcoin Cash\b|\bBCH\b/i,
 TON:/\bToncoin\b|\bThe Open Network\b/i,
 GRAM:/\bToncoin\b|\bThe Open Network\b/i
});
const TOPICS=Object.freeze([
 {name:'Регулирование',pattern:/\b(?:regulation|regulator|regulatory|law|laws|bill|legislation|policy|sec|court)\b/i},
 {name:'Безопасность',pattern:/\b(?:hack|hacked|security|exploit|breach|theft|vulnerability)\b/i},
 {name:'Сеть',pattern:/\b(?:network|protocol|validator|upgrade|outage|blockchain|consensus)\b/i},
 {name:'Биржи',pattern:/\b(?:exchange|listing|delisting|custody)\b/i},
 {name:'Инвестиционные фонды',pattern:/\b(?:ETF|fund|funds|institutional|investment)\b/i}
]);
export function describeNewsEvidence(article,{now=Date.now(),asset=null}={}){
 const title=typeof article?.title==='string'?article.title.slice(0,220):'';
 const mentions=Object.keys(MENTIONS).filter(id=>MENTIONS[id].test(title));
 const topics=TOPICS.filter(t=>t.pattern.test(title)).map(t=>t.name).slice(0,2);
 const seen=article?.observedAt;
 const ageMinutes=Number.isSafeInteger(seen)&&Number.isSafeInteger(now)&&
  seen>0&&seen<=now+60000?Math.max(0,Math.floor((now-seen)/60000)):null;
 const timeKind=article?.timeKind==='PUBLISHED'?'PUBLISHED':
  article?.timeKind==='INDEXED'?'INDEXED':'UNKNOWN';
 const timing=timeKind==='INDEXED'?'Время индексации':
  timeKind==='PUBLISHED'?'Время публикации':'Время события не подтверждено';
 const ageLabel=ageMinutes===null?'возраст неизвестен':
  ageMinutes<60?ageMinutes+' мин назад':
  Math.floor(ageMinutes/60)+' ч назад';
 const freshness=ageMinutes===null?'UNKNOWN':
  ageMinutes>=24*60?'OLD':ageMinutes>=6*60?'DELAYED':'RECENT';
 const focus=mentions.includes(asset)?'DIRECT':
  mentions.length?'OTHER_ASSETS':/\b(?:crypto|cryptocurrency|digital asset|blockchain|stablecoin)\b/i.test(title)?
  'GENERAL':'UNCLEAR';
 const indexers=[...new Set((Array.isArray(article?.indexedBy)?
  article.indexedBy:article?.source?[article.source]:[])
   .filter(x=>typeof x==='string'&&x.length<=50))];
 return {timeKind,timing,ageLabel,freshness,focus,mentions,topics,
  indexers,indexerCount:indexers.length,
  verification:'HEADLINE_NOT_INDEPENDENTLY_VERIFIED',
  hasIndependentConfirmation:false,
  marketDirection:'NOT_INFERRED'};
}
