/**
 * APEX as-published evidence: validator and descriptive research cohort audit.
 * Does not calculate AI confidence, trade signals or causal effects.
 * Sources are counted only when their observation was stored before publication.
 */
import {multiFrameHypothesis,multiFrameEvidence} from './forecast-multiframe.mjs';
import {directionalHypothesis} from './directional-scenario.mjs';
import {verifiedDirectionalEvidence} from './forecast-quality.mjs';

export const EVIDENCE_VERSION='AS_OF_ROOM_EVIDENCE_V1';
export const EVIDENCE_FEEDS=Object.freeze(['market','liquidity','onchain',
 'news','macro','social']);
export const EVIDENCE_FRAMES=Object.freeze(['15m','1h','4h','1d']);
const DURATIONS={market:20*60000,liquidity:5*60000,onchain:45*60000,
 news:48*3600000,macro:6*3600000,social:24*3600000};
const FRAME_STEPS={'15m':900000,'1h':3600000,'4h':14400000,'1d':86400000};
const validTime=x=>Number.isSafeInteger(x)&&x>0;
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const validPositive=x=>finite(x)&&x>0;
const parse=row=>{
 try{return typeof row?.hypothesis==='string'?JSON.parse(row.hypothesis):row?.hypothesis;}
 catch{return null;}
};
const fail=(state,reason)=>({state,reason,feeds:null,radar:null});
function inspectFeed(name,item,at){
 if(!item||!['MISSING','STALE','OBSERVED'].includes(item.state))return false;
 if(item.state==='MISSING')return Object.keys(item).length===1;
 if(typeof item.source!=='string'||!item.source.length||
  !validTime(item.observedAt)||!validTime(item.collectedAt)||
  item.observedAt>item.collectedAt||item.collectedAt>at||
  item.ageMs!==at-item.collectedAt||
  (item.state==='OBSERVED')!==(item.ageMs<=DURATIONS[name]))
  return false;
 if(!item.features||typeof item.features!=='object'||Array.isArray(item.features))
  return false;
 if(name==='market')
  return item.source==='binance:spot:24h'&&
   validPositive(item.features.price)&&validPositive(item.features.quoteVolume24h)&&
   finite(item.features.changePercent24h)&&
   Math.abs(item.features.changePercent24h)<=1000&&
   item.features.scope==='SPOT_24H_TICKER';
 if(name==='liquidity')
  return ['binance:spot:depth','bybit:spot:depth'].includes(item.source)&&
   finite(item.features.spreadBps)&&item.features.spreadBps>0&&
   item.features.spreadBps<=2000&&
   finite(item.features.visibleDepthImbalance)&&
   Math.abs(item.features.visibleDepthImbalance)<=1&&
   item.features.scope==='LIMITED_PUBLIC_ORDERBOOK_NOT_HIDDEN_LIQUIDITY';
 if(name==='onchain')
  return ['mempool:bitcoin:network','blockscout:ethereum:stats',
   'toncenter:ton:masterchain'].includes(item.source);
 return item.features.scope==='UNVERIFIED_CONTEXT_METADATA_ONLY';
}
function inspectRadar(frame,item,at){
 if(!item||!['MISSING','STALE','OBSERVED','INVALID'].includes(item.state))return false;
 if(item.state==='MISSING'||item.state==='INVALID')
  return Object.keys(item).length===1;
 const step=FRAME_STEPS[frame];
 if(item.source!=='ANDROID_NATIVE_RADAR'||
  !validTime(item.candleAt)||!validTime(item.observedAt)||
  item.candleAt%step!==step-1||item.candleAt>=at||
  item.observedAt<item.candleAt||item.observedAt>at||
  !['UP','DOWN','FLAT'].includes(item.direction)||
  !['DIRECTIONAL','RANGE','MIXED'].includes(item.mode)||
  !finite(item.movement)||!finite(item.acceleration)||
  !(item.volumeRatio===null||finite(item.volumeRatio)&&item.volumeRatio>=0)||
  (item.state==='OBSERVED')!==(at-item.observedAt<=2*step+60000))return false;
 return true;
}
export function inspectEvidenceContext(row){
 const hypothesis=parse(row);
 if(!hypothesis||!directionalHypothesis(row)&&!multiFrameHypothesis(row))
  return fail('NOT_DIRECTIONAL','Нет опубликованного направленного исследования');
 const context=hypothesis.evidenceAsPublished;
 if(context===undefined)return fail('LEGACY','В момент публикации этот контекст не сохранялся');
 if(!validTime(row?.publishedAt)||context?.version!==EVIDENCE_VERSION||
  context.capturedAt!==row.publishedAt||
  context.policy!=='DESCRIPTIVE_CONTEXT_ONLY_NO_FUTURE_LEAKAGE'||
  !context.feeds||!context.radar||typeof context.feeds!=='object'||
  typeof context.radar!=='object')
  return fail('INVALID','Ошибка источника или времени записи');
 for(const key of EVIDENCE_FEEDS)
  if(!inspectFeed(key,context.feeds[key],context.capturedAt))
   return fail('INVALID','Некорректный источник '+key);
 for(const frame of EVIDENCE_FRAMES)
  if(!inspectRadar(frame,context.radar[frame],context.capturedAt))
   return fail('INVALID','Некорректный Radar '+frame);
 return {state:'VERIFIED',feeds:context.feeds,radar:context.radar,
  capturedAt:context.capturedAt,policy:context.policy};
}
export function evidenceCohorts(rows,{now=Date.now()}={}){
 const empty=()=>({published:0,verified:0,legacy:0,invalid:0,
  completed:0,tp3:0,sl:0,other:0,feeds:Object.fromEntries(
   EVIDENCE_FEEDS.map(name=>[name,{observed:0,stale:0,missing:0}])),
  frames:Object.fromEntries(EVIDENCE_FRAMES.map(name=>[name,{observed:0,stale:0,missing:0}]))});
 const result={'15m':empty(),'1h':empty(),'4h':empty()};
 for(const row of Array.isArray(rows)?rows:[]){
  const h=parse(row);
  const frame=multiFrameHypothesis(row)?row.interval:
   directionalHypothesis(row)?'1h':null;
  if(!frame||!result[frame])continue;
  const cohort=result[frame];
  const valid=frame==='1h'?verifiedDirectionalEvidence(row,{now}):
   multiFrameEvidence(row,{now});
  if(valid.state!=='OBSERVED')continue;
  cohort.published++;
  const evidence=inspectEvidenceContext(row);
  if(evidence.state==='LEGACY'){cohort.legacy++;continue;}
  if(evidence.state!=='VERIFIED'){cohort.invalid++;continue;}
  cohort.verified++;
  for(const feed of EVIDENCE_FEEDS){
   const state=evidence.feeds[feed].state.toLowerCase();
   cohort.feeds[feed][state]++;
  }
  for(const f of EVIDENCE_FRAMES){
   const st=evidence.radar[f].state;
   if(st==='INVALID')continue;
   cohort.frames[f][st.toLowerCase()]++;
  }
  if(!valid.finished)continue;
  cohort.completed++;
  if(valid.outcome==='TP3')cohort.tp3++;
  else if(valid.outcome==='STOP')cohort.sl++;
  else cohort.other++;
 }
 return result;
}
