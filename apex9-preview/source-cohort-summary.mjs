/**
 * Compact read-only summary for existing Sources UI. Produced ONLY from
 * the complete local Room archive already fetched by automatic research audit.
 * Stores counts and provider IDs, never raw forecasts, prices or keys.
 */
import {auditM1Cohort,M1_COHORT_VERSION} from './forecast-m1-cohort.mjs';
import {auditPublishedSourceLineage,SOURCE_LINEAGE_VERSION}
 from './source-lineage-audit.mjs';
import {auditProviderForwardValue,PROVIDER_FORWARD_REGISTRATION,
 PROVIDER_FORWARD_TESTS} from './source-provider-forward-audit.mjs';

export const SOURCE_COHORT_VERSION='APEX_SOURCE_COHORT_VIEW_V4';
const KEY='apex9:source-cohort-summary:v4',AGE=30*86400000,MAX_BYTES=96000;
const FRAMES=['15m','1h','4h'];
const assetOK=x=>typeof x==='string'&&/^[A-Z0-9]{5,20}$/.test(x);
const time=x=>Number.isSafeInteger(x)&&x>0;
const sourceCheck=x=>typeof x==='string'&&/^[a-zA-Z0-9:._-]{1,64}$/.test(x);
function safeStorage(){
 try{return globalThis.localStorage}catch{return null}
}
function compress(asset,cohort,lineage,providerStudy,now){
 const frames={};
 for(const tf of FRAMES){
  const m=cohort.frames?.[tf],s=lineage.frames?.[tf],
   v=providerStudy.frames?.[tf];
  frames[tf]={
   m1Published:m?.publishedM1||0,
   m1Forward:m?.publishedForward||0,
   m5Archived:cohort.legacyM5?.[tf]||0,
   m1State:m?.state||'COLLECTING',
   referenceDecisive:m?.reference?.decisive||0,
   holdoutDecisive:m?.holdout?.decisive||0,
   verifiedSources:s?.verified||0,sourceLegacy:s?.legacy||0,
   sourceInvalid:s?.invalid||0,
   sourceV1:s?.v1Verified||0,sourceV2:s?.v2Verified||0,
   multiProviderForecasts:s?.multiProviderForecasts||0,
   providerResearch:{
    state:v?.state||'COLLECTING',
    published:v?.postRegistrationM1||0,
    selected:v?.selectedIndependent||0,
    required:v?.targetIndependent||48,
    excludedNoV2:v?.notV2||0,
    invalidPlans:v?.invalidPlans||0,
    // AUC and percentages are descriptive only, NEVER success probabilities.
    studies:(v?.providers||[]).slice(0,3).map(p=>({
     id:p.id,state:p.state,
     windows:p.windows.map(w=>({measured:w.scored,
      fresh:w.observed,missing:w.missing,stale:w.stale})),
     deltaAuc:Array.isArray(p.deltaAuc)?
      p.deltaAuc.map(n=>Math.round(n*10000)/10000):null,
     sensitivity:{
      state:p.sensitivity?.state||'COLLECTING',
      caution:p.sensitivity?.caution||null,
      windows:(p.sensitivity?.windows||[]).map(w=>({
       leaveOneOutMin:w.leaveOneOutMin,
       leaveOneOutMax:w.leaveOneOutMax,
       timeShiftBeatsOriginal:w.timeShiftBeatsOriginal,
       timeShiftTotal:w.timeShiftTotal,
       classMixGap:w.classMixGap,
       selectionCaution:w.selectionCaution
      }))
     }
    }))
   },
   providers:(s?.providers||[]).filter(p=>sourceCheck(p.source)&&
    ['market','liquidity','onchain','news','macro','social'].includes(p.feed))
    .slice(0,14).map(p=>({feed:p.feed,source:p.source,
     observed:p.observed,stale:p.stale}))
  };
 }
 return {version:SOURCE_COHORT_VERSION,asset,auditedAt:now,
  archiveRows:cohort.archiveRows,m1State:cohort.state,
  lineageState:lineage.state,
  providerRegistrationAt:PROVIDER_FORWARD_REGISTRATION,frames,
  note:'Фиксированные будущие выборки сравнивают исследовательское '+
   'ранжирование с источником и без него на одинаковых TP3/STOP, '+
   'не причинность, точность провайдера или реальные сделки.'};
}
export function saveSourceCohortSummary(archive,asset,{
 now=Date.now(),storage=safeStorage()
}={}){
 if(!storage?.setItem||!assetOK(asset)||!time(now))return false;
 const cohort=auditM1Cohort(archive,{asset,now});
 const lineage=auditPublishedSourceLineage(archive,{asset,now});
 const forward=auditProviderForwardValue(archive,{asset,now});
 if(!cohort.frames||!lineage.frames||!forward.frames)return false;
 const report=compress(asset,cohort,lineage,forward,now);
 let old={};
 try{
  const raw=storage.getItem(KEY);
  if(raw&&raw.length<MAX_BYTES){
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
  if(!raw||raw.length>MAX_BYTES)return null;
  const stored=JSON.parse(raw);
  const report=stored?.version===SOURCE_COHORT_VERSION?
   stored.summaries?.[asset]:null;
  if(report?.version!==SOURCE_COHORT_VERSION||report.asset!==asset||
   report.providerRegistrationAt!==PROVIDER_FORWARD_REGISTRATION||
   !time(report.auditedAt)||report.auditedAt>now+60000||
   now-report.auditedAt>AGE||!Number.isSafeInteger(report.archiveRows)||
   !report.frames||!FRAMES.every(tf=>{
    const f=report.frames[tf];
    return f&&['COLLECTING','CHECK_DATA','DESCRIPTIVE'].includes(f.m1State)&&
     ['m1Published','m1Forward','m5Archived','referenceDecisive',
      'holdoutDecisive','verifiedSources','sourceLegacy','sourceInvalid',
      'sourceV1','sourceV2','multiProviderForecasts']
     .every(k=>Number.isSafeInteger(f[k])&&f[k]>=0)&&
     f.verifiedSources===f.sourceV1+f.sourceV2&&
     f.multiProviderForecasts<=f.sourceV2&&
     f.providerResearch&&
     ['COLLECTING','CHECK_DATA','DESCRIPTIVE'].includes(f.providerResearch.state)&&
     ['published','selected','required','excludedNoV2','invalidPlans']
      .every(k=>Number.isSafeInteger(f.providerResearch[k])&&
       f.providerResearch[k]>=0)&&
     f.providerResearch.required===48&&
     f.providerResearch.selected<=f.providerResearch.required&&
     Array.isArray(f.providerResearch.studies)&&
     f.providerResearch.studies.length===PROVIDER_FORWARD_TESTS.length&&
     f.providerResearch.studies.every((s,i)=>
      s.id===PROVIDER_FORWARD_TESTS[i].id&&
      ['COLLECTING','CHECK_DATA','LOW_COVERAGE','REPEATED_DESCRIPTIVE',
       'RECENTLY_WORSE','CONFLICTING','NO_REPEATED_GAIN'].includes(s.state)&&
      Array.isArray(s.windows)&&s.windows.length===3&&
      s.windows.every(w=>['measured','fresh','missing','stale']
       .every(k=>Number.isSafeInteger(w[k])&&w[k]>=0&&w[k]<=16))&&
      (s.deltaAuc===null||
       Array.isArray(s.deltaAuc)&&s.deltaAuc.length===3&&
       s.deltaAuc.every(n=>typeof n==='number'&&
        Number.isFinite(n)&&n>=-1&&n<=1))&&
      s.sensitivity&&
      ['COLLECTING','CHECK_DATA','DESCRIPTIVE'].includes(s.sensitivity.state)&&
      [null,'SENSITIVE','NO_FLAG_IN_THESE_CHECKS'].includes(s.sensitivity.caution)&&
      Array.isArray(s.sensitivity.windows)&&
      [0,3].includes(s.sensitivity.windows.length)&&
      s.sensitivity.windows.every(w=>
       ['leaveOneOutMin','leaveOneOutMax','classMixGap'].every(k=>
        w[k]===null||typeof w[k]==='number'&&Number.isFinite(w[k])&&
        w[k]>=0-1&&w[k]<=1)&&
       ['timeShiftBeatsOriginal','timeShiftTotal'].every(k=>
        Number.isSafeInteger(w[k])&&w[k]>=0&&w[k]<=15)&&
       typeof w.selectionCaution==='boolean'))&&
     Array.isArray(f.providers)&&f.providers.length<=14&&
     f.providers.every(p=>sourceCheck(p.source)&&
      Number.isSafeInteger(p.observed)&&p.observed>=0&&
      Number.isSafeInteger(p.stale)&&p.stale>=0);
   }))return null;
  return report;
 }catch{return null}
}
