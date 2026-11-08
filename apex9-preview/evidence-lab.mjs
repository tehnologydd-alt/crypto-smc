/**
 * APEX Evidence Lab: deterministic audit of ORIGINAL device-held source data.
 * No network access, no indicator fitting, no trading, no confidence forecast.
 */
import {CANDLE_INTERVALS} from './candles.mjs';
import {inspectClosedCandles} from './market-core.mjs';
import {normalizeLiquidityHistory} from './liquidity-core.mjs';
import {chainForAsset,summarizeOnChainHistory} from './onchain-core.mjs';
export const MIN_FORWARD_SAMPLES=30;
const validNumber=x=>typeof x==='number'&&Number.isFinite(x);
const validTime=x=>Number.isSafeInteger(x)&&x>0;
const validSymbol=x=>typeof x==='string'&&/^[A-Z0-9]{5,20}$/.test(x);

export function auditCandleSeries(rows,interval,{now=Date.now()}={}){
 const step=CANDLE_INTERVALS[interval];
 if(!step||!validTime(now))return {state:'INVALID',samples:0,gaps:null};
 const parsed=inspectClosedCandles(rows,interval);
 if(parsed.state==='INVALID')
  return {state:'INVALID',samples:0,gaps:null,reason:parsed.reason};
 const bars=parsed.bars;
 if(!bars.length)return {state:'EMPTY',samples:0,gaps:0,ageMs:null};
 let missing=0;
 for(let i=1;i<bars.length;i++){
  const delta=bars[i].t-bars[i-1].t;
  if(delta%step!==0||delta<=0)return {
   state:'INVALID',samples:bars.length,gaps:null,reason:'Некорректная хронология свечей'
  };
  missing+=delta/step-1;
 }
 const last=bars.at(-1);
 // Data cached on the phone may be old, but that does not invalidate history.
 const ageMs=now-last.closeAt;
 const freshness=ageMs>=0&&ageMs<=2*step+60000?'RECENT':'HISTORICAL';
 return {state:freshness,samples:bars.length,gaps:missing,
  coverage:bars.length/(bars.length+missing),firstAt:bars[0].t,
  lastClosedAt:last.closeAt,ageMs,
  claim:'Завершённые свечи из Room; полнота в сохранённом временном диапазоне'};
}
export function auditVisibleDepth(rows,asset,{now=Date.now()}={}){
 if(!validSymbol(asset)||!validTime(now))return {state:'INVALID',samples:0,venues:[]};
 const points=normalizeLiquidityHistory(rows,asset);
 const venues=['binance','bybit'].map(venue=>{
  const data=points.filter(x=>x.venue===venue);
  const last=data.at(-1);
  return {venue,samples:data.length,lastAt:last?.collectedAt??null,
   state:!last?'EMPTY':now-last.collectedAt>3*60000?'HISTORICAL':'RECENT'};
 });
 return {state:points.length?'OBSERVED':'EMPTY',samples:points.length,venues};
}
export function auditNetwork(rows,asset,{now=Date.now()}={}){
 const chain=chainForAsset(asset);
 if(!chain)return {state:'UNSUPPORTED',chain:null,samples:0};
 const result=summarizeOnChainHistory(
  (Array.isArray(rows)?rows:[]).filter(x=>x?.asset===asset),{chain,now}
 );
 return {state:result.state,chain,samples:result.samples||0,
  lastAt:result.lastCapturedAt||null};
}
const forecastMethod='EMPIRICAL_CLOSE_RANGE_V1';
const hour=3600000;
/** Reject altered, impossible or backward-looking records rather than count them. */
export function inspectOutcomeRow(row,{now=Date.now()}={}){
 if(!validTime(now)||!row||!validSymbol(row.asset)||row.interval!=='1h'||
    !validTime(row.publishedAt))return {state:'INVALID'};
 let h;
 try{h=typeof row.hypothesis==='string'?JSON.parse(row.hypothesis):row.hypothesis;}
 catch{return {state:'INVALID'};}
 if(!h||h.model!==forecastMethod||!validTime(h.anchorCloseAt)||
    h.anchorCloseAt%hour!==hour-1||
    !validTime(h.targetCloseAt)||h.targetCloseAt!==h.anchorCloseAt+4*hour||
    h.anchorCloseAt>row.publishedAt||row.publishedAt>=h.targetCloseAt||
    !validNumber(h.anchorClose)||h.anchorClose<=0||
    !validNumber(h.bandLow)||!validNumber(h.bandHigh)||
    !(h.bandLow<h.anchorClose&&h.anchorClose<h.bandHigh)||
    h.sampleBars!==96||h.horizonBars!==4||
    row.id!=='range1:'+row.asset+':1h:'+h.anchorCloseAt)
  return {state:'INVALID'};
 const core={asset:row.asset,id:row.id,anchorCloseAt:h.anchorCloseAt,
  targetCloseAt:h.targetCloseAt,publishedAt:row.publishedAt};
 if(!row.evaluation)return {...core,state:now>h.targetCloseAt?'DUE_UNEVALUATED':'AWAITING'};
 const result=row.evaluation;
 if(!validTime(result.evaluatedAt)||result.evaluatedAt<=h.targetCloseAt||
    result.targetCloseAt!==h.targetCloseAt||
    !validNumber(result.actualClose)||result.actualClose<=0||
    !['WITHIN_RANGE','OUTSIDE_RANGE'].includes(result.outcome)||
    (result.actualClose>=h.bandLow&&result.actualClose<=h.bandHigh)!==
      (result.outcome==='WITHIN_RANGE'))
  return {state:'INVALID',id:row.id};
 return {...core,state:'EVALUATED',within:result.outcome==='WITHIN_RANGE',
  evaluatedAt:result.evaluatedAt};
}
export function wilson95(successes,n){
 if(!Number.isSafeInteger(n)||n<1||!Number.isSafeInteger(successes)||
    successes<0||successes>n)return null;
 const z=1.959963984540054,p=successes/n;
 const scale=1+z*z/n,mid=(p+z*z/(2*n))/scale;
 const radius=z*Math.sqrt(p*(1-p)/n+z*z/(4*n*n))/scale;
 return {lower:Math.max(0,mid-radius),upper:Math.min(1,mid+radius)};
}
export function auditForwardResearch(rows,{now=Date.now(),totalPublished=null}={}){
 if(!validTime(now)||!Array.isArray(rows))return {state:'INVALID'};
 const sorted=[...rows].sort((a,b)=>(a.publishedAt||0)-(b.publishedAt||0));
 const seen=new Set(),valid=[],counts={awaiting:0,dueUnevaluated:0,
  evaluated:0,invalid:0,excludedOverlaps:0};
 for(const row of sorted){
  if(typeof row?.id!=='string'||seen.has(row.id)){counts.invalid++;continue;}
  seen.add(row.id);
  const result=inspectOutcomeRow(row,{now});
  if(result.state==='INVALID'){counts.invalid++;continue;}
  if(result.state==='AWAITING')counts.awaiting++;
  if(result.state==='DUE_UNEVALUATED')counts.dueUnevaluated++;
  if(result.state==='EVALUATED'){counts.evaluated++;valid.push(result);}
 }
 // Strictly non-overlapping 4-hour outcomes within each asset.
 // Different assets share market time and are NOT statistically independent:
 // we do not pool across assets to claim a model-wide confidence interval.
 const byAsset=new Map();
 for(const row of valid){
  if(!byAsset.has(row.asset))byAsset.set(row.asset,[]);
  byAsset.get(row.asset).push(row);
 }
 const cohorts=[];
 for(const [asset,records] of byAsset){
  records.sort((a,b)=>a.targetCloseAt-b.targetCloseAt||
   a.publishedAt-b.publishedAt);
  let lastTarget=0;const chosen=[];
  for(const row of records){
   if(row.anchorCloseAt<lastTarget){counts.excludedOverlaps++;continue;}
   chosen.push(row);lastTarget=row.targetCloseAt;
  }
  const success=chosen.filter(x=>x.within).length;
  cohorts.push({asset,independentWindows:chosen.length,within:success,
   status:chosen.length>=MIN_FORWARD_SAMPLES?'REPORTABLE':'INSUFFICIENT',
   coverage:chosen.length>=MIN_FORWARD_SAMPLES?success/chosen.length:null,
   interval95:chosen.length>=MIN_FORWARD_SAMPLES?
    wilson95(success,chosen.length):null});
 }
 cohorts.sort((a,b)=>b.independentWindows-a.independentWindows||
  a.asset.localeCompare(b.asset));
 const loaded=seen.size;
 const knownTotal=Number.isSafeInteger(totalPublished)&&totalPublished>=loaded
  ?totalPublished:null;
 const truncated=knownTotal!==null&&knownTotal>loaded;
 // A partially loaded journal or missing/invalid mature observations can
 // selectively distort coverage. Withhold percentages, don't "adjust" them.
 for(const cohort of cohorts){
  const dueMissing=sorted.some(row=>{
   if(row?.asset!==cohort.asset)return false;
   return inspectOutcomeRow(row,{now}).state==='DUE_UNEVALUATED';
  });
  if(truncated||dueMissing||counts.invalid){
   cohort.status=truncated?'PARTIAL_HISTORY':'INCOMPLETE_RESULTS';
   cohort.coverage=null;cohort.interval95=null;
  }
 }
 return {state:counts.invalid?'CHECK_INTEGRITY':'AUDITED',counts,
  loaded,reportedTotal:knownTotal,truncated,
  cohorts,
  disclosure:'Only forward-published, evaluated, nonoverlapping per-asset 4h outcomes; one exchange source, no external validation or calibration.'};
}
