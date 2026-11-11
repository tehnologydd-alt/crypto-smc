/**
 * Compact read-only summary for existing Sources UI. Produced ONLY from
 * the complete local Room archive already fetched by automatic research audit.
 * Stores counts and provider IDs, never raw forecasts, prices or keys.
 */
import {auditM1Cohort,M1_COHORT_VERSION} from './forecast-m1-cohort.mjs';
import {auditPublishedSourceLineage,SOURCE_LINEAGE_VERSION}
 from './source-lineage-audit.mjs';

export const SOURCE_COHORT_VERSION='APEX_SOURCE_COHORT_VIEW_V1';
const KEY='apex9:source-cohort-summary:v1',AGE=30*86400000;
const FRAMES=['15m','1h','4h'];
const assetOK=x=>typeof x==='string'&&/^[A-Z0-9]{5,20}$/.test(x);
const time=x=>Number.isSafeInteger(x)&&x>0;
const sourceCheck=x=>typeof x==='string'&&/^[a-zA-Z0-9:._-]{1,64}$/.test(x);
function safeStorage(){
 try{return globalThis.localStorage}catch{return null}
}
function compress(asset,cohort,lineage,now){
 const frames={};
 for(const tf of FRAMES){
  const m=cohort.frames?.[tf],s=lineage.frames?.[tf];
  frames[tf]={
   m1Published:m?.publishedM1||0,
   m1Forward:m?.publishedForward||0,
   m5Archived:cohort.legacyM5?.[tf]||0,
   m1State:m?.state||'COLLECTING',
   referenceDecisive:m?.reference?.decisive||0,
   holdoutDecisive:m?.holdout?.decisive||0,
   verifiedSources:s?.verified||0,sourceLegacy:s?.legacy||0,
   sourceInvalid:s?.invalid||0,
   providers:(s?.providers||[]).filter(p=>sourceCheck(p.source)&&
    ['market','liquidity','onchain','news','macro','social'].includes(p.feed))
    .slice(0,14).map(p=>({feed:p.feed,source:p.source,
     observed:p.observed,stale:p.stale}))
  };
 }
 return {version:SOURCE_COHORT_VERSION,asset,auditedAt:now,
  archiveRows:cohort.archiveRows,m1State:cohort.state,
  lineageState:lineage.state,frames,
  note:'Результаты M1 и M5 независимы; источники отражают только наличие '+
   'при публикации, не точность прогноза.'};
}
export function saveSourceCohortSummary(archive,asset,{
 now=Date.now(),storage=safeStorage()
}={}){
 if(!storage?.setItem||!assetOK(asset)||!time(now))return false;
 const cohort=auditM1Cohort(archive,{asset,now});
 const lineage=auditPublishedSourceLineage(archive,{asset,now});
 if(!cohort.frames||!lineage.frames)return false;
 const report=compress(asset,cohort,lineage,now);
 let old={};
 try{
  const raw=storage.getItem(KEY);
  if(raw&&raw.length<48000){
   const parsed=JSON.parse(raw);
   if(parsed?.version===SOURCE_COHORT_VERSION&&parsed.summaries)
    old=parsed.summaries;
  }
 }catch{}
 const summaries={};
 for(const [key,value] of Object.entries(old)){
  if(assetOK(key)&&key!==asset&&time(value?.auditedAt)&&
   value.auditedAt<=now+60000&&now-value.auditedAt<=AGE&&
   Object.keys(summaries).length<9)summaries[key]=value;
 }
 summaries[asset]=report;
 try{storage.setItem(KEY,JSON.stringify({
  version:SOURCE_COHORT_VERSION,summaries}));return true;}catch{return false}
}
export function readSourceCohortSummary(asset,{
 now=Date.now(),storage=safeStorage()
}={}){
 if(!assetOK(asset)||!storage?.getItem)return null;
 try{
  const raw=storage.getItem(KEY);
  if(!raw||raw.length>48000)return null;
  const stored=JSON.parse(raw);
  const report=stored?.version===SOURCE_COHORT_VERSION?
   stored.summaries?.[asset]:null;
  if(report?.version!==SOURCE_COHORT_VERSION||report.asset!==asset||
   !time(report.auditedAt)||report.auditedAt>now+60000||
   now-report.auditedAt>AGE||!Number.isSafeInteger(report.archiveRows)||
   !report.frames||!FRAMES.every(tf=>{
    const f=report.frames[tf];
    return f&&['COLLECTING','CHECK_DATA','DESCRIPTIVE'].includes(f.m1State)&&
     ['m1Published','m1Forward','m5Archived','referenceDecisive',
      'holdoutDecisive','verifiedSources','sourceLegacy','sourceInvalid']
     .every(k=>Number.isSafeInteger(f[k])&&f[k]>=0)&&
     Array.isArray(f.providers)&&f.providers.length<=14&&
     f.providers.every(p=>sourceCheck(p.source)&&
      Number.isSafeInteger(p.observed)&&p.observed>=0&&
      Number.isSafeInteger(p.stale)&&p.stale>=0);
   }))return null;
  return report;
 }catch{return null}
}
