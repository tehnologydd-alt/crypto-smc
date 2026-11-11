/**
 * APEX Provider Contribution Lab V1 — prospective, frozen, read-only.
 *
 * The fixed three-block study compares a PREDECLARED provider-alignment
 * modifier against the SAME frozen pre-outcome strength rank on exactly the
 * SAME M1-verified TP3/STOP observations. Missing/neutral/stale observations
 * do not count as contradictions or failure. Outcomes NEVER select windows.
 *
 * THIS IS NOT model training, provider accuracy, causal proof, significance,
 * calibrated probability or an instruction to place/close an order.
 */
import {featureFrameOf,frozenRankScore,rankingAuc}
 from './forecast-feature-ablation.mjs';
import {inspectPreOutcomeStrength} from './forecast-preoutcome-strength.mjs';
import {inspectEvidenceContext,EVIDENCE_VERSION_V2}
 from './forecast-evidence-context.mjs';
import {planDirectionalScenario} from './directional-scenario.mjs';
import {planMultiFrameForecast,multiFrameEvidence}
 from './forecast-multiframe.mjs';
import {verifiedDirectionalEvidence} from './forecast-quality.mjs';

export const PROVIDER_FORWARD_VERSION='APEX_PROVIDER_FORWARD_VALUE_V1';
export const PROVIDER_FORWARD_REGISTRATION=Date.UTC(2026,10,13,0,0,0);
export const PROVIDER_FORWARD_TESTS=Object.freeze([
 Object.freeze({id:'binance:spot:24h',kind:'market',
  label:'Binance · Spot 24ч',field:'changePercent24h',minimum:.000001}),
 Object.freeze({id:'binance:spot:depth',kind:'liquidity',
  label:'Binance · видимый стакан',field:'visibleDepthImbalance',minimum:.10}),
 Object.freeze({id:'bybit:spot:depth',kind:'liquidity',
  label:'Bybit · видимый стакан',field:'visibleDepthImbalance',minimum:.10})
]);
export const PROVIDER_FORWARD_RULES=Object.freeze({
 registrationUtc:'2026-11-13T00:00:00.000Z',
 cohorts:Object.freeze(['15m','1h','4h']),
 evaluationInterval:'1m',evidence:EVIDENCE_VERSION_V2,
 independentPublicationsPerWindow:16,windows:3,
 minScoredOutcomesPerWindow:10,minPerClass:3,
 minFreshProviderPerWindow:12,minMeasuredCoverage:.70,
 fixedRankModifier:.10,minDeltaAuc:.03,
 scope:'FIRST_48_NONOVERLAPPING_POST_REGISTRATION_V2_M1_PUBLICATIONS',
 holdout:'EMBARGO_PREVIOUS_OUTCOMES_AT_NEXT_WINDOW_START',
 noRetroactiveBackfill:true,noWeightUpdates:true,
 noAutoTraining:true,calibratedProbability:null,
 noProviderAccuracyClaim:true,maxArchive:1500
});
export const PROVIDER_METADATA_ONLY=Object.freeze([
 Object.freeze({kind:'onchain',reason:'NETWORK_METADATA_NOT_DIRECTIONAL_CONTENT'}),
 Object.freeze({kind:'news',reason:'UNVERIFIED_ARTICLE_METADATA'}),
 Object.freeze({kind:'macro',reason:'UNVERIFIED_MACRO_METADATA'}),
 Object.freeze({kind:'social',reason:'UNVERIFIED_SOCIAL_METADATA'})
]);
const RULES=PROVIDER_FORWARD_RULES;
const validAsset=x=>typeof x==='string'&&/^[A-Z0-9]{5,20}$/.test(x);
const time=x=>Number.isSafeInteger(x)&&x>0;
const number=x=>typeof x==='number'&&Number.isFinite(x);
const fail=(state,reason,asset)=>({
 version:PROVIDER_FORWARD_VERSION,state,reason,asset,frames:null,
 providerTests:PROVIDER_FORWARD_TESTS,metadataOnly:PROVIDER_METADATA_ONLY,
 rules:RULES,modelChanged:false,trained:false
});
const parse=row=>{
 try{return typeof row?.hypothesis==='string'?
  JSON.parse(row.hypothesis):row?.hypothesis;}
 catch{return null;}
};
const blank=()=>({selected:0,decisive:0,tp3:0,stop:0,other:0,
 awaiting:0,lateRecorded:0,invalid:0,missingStrength:0,
 invalidStrength:0,invalidContext:0});
const freshProvider=()=>({observed:0,stale:0,missing:0,neutral:0,
 scored:0,tp3:0,stop:0,samples:[]});
const getPlan=(row,tf,now)=>tf==='1h'?
 planDirectionalScenario(row,{now}):planMultiFrameForecast(row,{now});
const getOutcome=(row,tf,now)=>tf==='1h'?
 verifiedDirectionalEvidence(row,{now}):multiFrameEvidence(row,{now});
function providerAlignment(evidence,plan,def){
 const item=evidence.sources?.[def.kind]?.find(x=>x.source===def.id);
 if(!item)return {state:'MISSING'};
 if(item.state!=='OBSERVED')return {state:'STALE'};
 const value=item.features?.[def.field];
 if(!number(value)||Math.abs(value)<def.minimum)
  return {state:'NEUTRAL'};
 return {state:'MEASURED',signed:(value>0)===(plan.side==='UP')?1:-1};
}
const pct=(n,d)=>d?Math.round(1000*n/d)/10:null;
function summarizeProvider(id,blocks,cutoffsReady){
 const periods=blocks.map(b=>b.providers[id]);
 const diagnostics=periods.map((p,i)=>({
  window:i+1,published:blocks[i].counts.selected,
  observed:p.observed,stale:p.stale,missing:p.missing,
  neutral:p.neutral,scored:p.scored,tp3:p.tp3,stop:p.stop,
  freshnessCoverage:pct(p.observed,blocks[i].counts.selected),
  outcomeCoverage:pct(p.scored,blocks[i].counts.selected)
 }));
 const base={id,
  label:PROVIDER_FORWARD_TESTS.find(d=>d.id===id).label,
  state:'COLLECTING',reason:'Нужно три независимых периода и завершённые M1-исходы.',
  windows:diagnostics,baselineAuc:null,withProviderAuc:null,
  reversedControlAuc:null,deltaAuc:null,
  repeatabilityNotCausation:true};
 if(!cutoffsReady)return base;
 for(let i=0;i<blocks.length;i++){
  const b=blocks[i],p=periods[i];
  if(b.counts.invalid||b.counts.invalidStrength||b.counts.invalidContext)
   return {...base,state:'CHECK_DATA',reason:'Непроверенный опубликованный контекст или M1-исход.'};
  if(b.counts.missingStrength>b.counts.selected*(1-RULES.minMeasuredCoverage))
   return {...base,state:'LOW_COVERAGE',reason:'Недостаточно проверенных баллов до публикации.'};
  if(p.observed<RULES.minFreshProviderPerWindow||
   p.scored<RULES.minScoredOutcomesPerWindow||
   p.tp3<RULES.minPerClass||p.stop<RULES.minPerClass)
   return {...base,state:'COLLECTING',
    reason:'Недостаточно свежих наблюдений и двух классов исхода в каждом периоде.'};
 }
 const reference=periods.map(p=>rankingAuc(p.samples,x=>x.baseline));
 const challenger=periods.map(p=>rankingAuc(p.samples,x=>x.withProvider));
 const reversed=periods.map(p=>rankingAuc(p.samples,x=>x.reversed));
 if([...reference,...challenger,...reversed].some(x=>!number(x)))
  return {...base,state:'CHECK_DATA',reason:'Не удалось вычислить парный AUC на одинаковых строках.'};
 const delta=challenger.map((v,i)=>v-reference[i]);
 const reverseDelta=reversed.map((v,i)=>v-reference[i]);
 const t=RULES.minDeltaAuc;
 const state=delta[2]<=-t?'RECENTLY_WORSE':
  delta.every((v,i)=>v>=t&&reverseDelta[i]<=0)?
   'REPEATED_DESCRIPTIVE':
   delta.some(v=>v>=t)&&delta.some(v=>v<=-t)?'CONFLICTING':
   'NO_REPEATED_GAIN';
 return {...base,state,
  reason:state==='REPEATED_DESCRIPTIVE'?
   'Фиксированный признак повторил описательное улучшение в трёх периодах; не доказательство причинности.':
   'Устойчивого добавочного различения относительно базового балла не установлено.',
  baselineAuc:reference,withProviderAuc:challenger,
  reversedControlAuc:reversed,deltaAuc:delta,
  negativeControlDeltaAuc:reverseDelta};
}
export function auditProviderForwardValue(archive,{asset,now=Date.now()}={}){
 if(!validAsset(asset)||!time(now))
  return fail('INVALID','Неверный актив или время',asset||null);
 if(archive?.complete!==true||!Array.isArray(archive.forecasts)||
  !Number.isSafeInteger(archive.publishedCount)||
  archive.publishedCount!==archive.forecasts.length||
  archive.forecasts.length>RULES.maxArchive)
  return fail('INCOMPLETE','Нужен полный ограниченный Room-архив',asset);
 const ids=new Set();
 for(const row of archive.forecasts){
  if(row?.asset!==asset||typeof row.id!=='string'||!row.id||
   ids.has(row.id)||!time(row.publishedAt)||
   row.publishedAt>now+60000)
   return fail('INVALID','Повреждённый или повторяющийся архив',asset);
  ids.add(row.id);
 }
 const frames={};
 const targetCount=RULES.independentPublicationsPerWindow*RULES.windows;
 for(const tf of RULES.cohorts){
  const history=archive.forecasts.filter(row=>featureFrameOf(row)===tf);
  const forward=history.filter(row=>{
   const h=parse(row);
   return row.publishedAt>PROVIDER_FORWARD_REGISTRATION&&
    h?.evaluationInterval===RULES.evaluationInterval;
  }).sort((a,b)=>a.publishedAt-b.publishedAt||a.id.localeCompare(b.id));
  // Any post-registration V1 cannot be silently filtered based on provider
  // availability. Halt the study instead of cherry-picking V2 publications.
  const legacy=forward.filter(row=>
   parse(row)?.evidenceAsPublished?.version!==EVIDENCE_VERSION_V2).length;
  const independent=[];let occupied=-Infinity,overlap=0,badPlans=0;
  for(const row of forward){
   const plan=getPlan(row,tf,now);
   if(plan.state!=='READY'||!time(plan.plan?.targetCloseAt)||
    plan.plan.targetCloseAt<=row.publishedAt){badPlans++;continue;}
   if(row.publishedAt<=occupied){overlap++;continue;}
   occupied=plan.plan.targetCloseAt;
   if(independent.length<targetCount)
    independent.push({row,plan:plan.plan});
  }
  const groups=Array.from({length:RULES.windows},(_,i)=>
   independent.slice(i*RULES.independentPublicationsPerWindow,
    (i+1)*RULES.independentPublicationsPerWindow));
  const full=groups.every(g=>g.length===RULES.independentPublicationsPerWindow);
  const cutoffs=groups.slice(1).map(g=>g[0]?.row.publishedAt||null);
  const blocks=groups.map((group,i)=>{
   const counts=blank(),providers=Object.fromEntries(
    PROVIDER_FORWARD_TESTS.map(d=>[d.id,freshProvider()]));
   const cutoff=i<RULES.windows-1?cutoffs[i]:null;
   for(const {row,plan} of group){
    counts.selected++;
    const evidence=inspectEvidenceContext(row);
    if(evidence.state!=='VERIFIED'||evidence.version!==EVIDENCE_VERSION_V2){
     counts.invalidContext++;continue;
    }
    const strength=inspectPreOutcomeStrength(row);
    if(strength.state==='INVALID')counts.invalidStrength++;
    else if(strength.state!=='VERIFIED')counts.missingStrength++;
    const checks=Object.fromEntries(PROVIDER_FORWARD_TESTS.map(d=>
     [d.id,providerAlignment(evidence,plan,d)]));
    for(const def of PROVIDER_FORWARD_TESTS){
     const p=providers[def.id],v=checks[def.id];
     if(v.state==='MEASURED')p.observed++;
     else if(v.state==='STALE')p.stale++;
     else if(v.state==='NEUTRAL')p.neutral++;
     else p.missing++;
    }
    const result=getOutcome(row,tf,now);
    if(result.state!=='OBSERVED'){counts.invalid++;continue;}
    if(!result.finished){counts.awaiting++;continue;}
    if(cutoff!==null&&(row.evaluation?.evaluatedAt>=cutoff||
     row.stageEvents?.some(x=>x?.recordedAt>=cutoff))){
     counts.lateRecorded++;continue;
    }
    if(!['TP3','STOP'].includes(result.outcome)){counts.other++;continue;}
    counts.decisive++;
    if(result.outcome==='TP3')counts.tp3++;
    else counts.stop++;
    if(strength.state!=='VERIFIED')continue;
    const baseline=frozenRankScore(strength.features);
    if(!number(baseline)){counts.invalidStrength++;continue;}
    for(const def of PROVIDER_FORWARD_TESTS){
     const v=checks[def.id],p=providers[def.id];
     if(v.state!=='MEASURED')continue;
     p.scored++;
     if(result.outcome==='TP3')p.tp3++;
     else p.stop++;
     p.samples.push({outcome:result.outcome,baseline,
      withProvider:baseline+RULES.fixedRankModifier*v.signed,
      reversed:baseline-RULES.fixedRankModifier*v.signed});
    }
   }
   return {counts,providers,cutoff};
  });
  const sourceChecks=PROVIDER_FORWARD_TESTS.map(def=>
   summarizeProvider(def.id,blocks,full&&!legacy&&!badPlans));
  const integrity=legacy||badPlans||
   blocks.some(b=>b.counts.invalid||b.counts.invalidStrength||b.counts.invalidContext);
  const state=integrity?'CHECK_DATA':!full?'COLLECTING':
   sourceChecks.some(x=>x.state==='REPEATED_DESCRIPTIVE')?
    'DESCRIPTIVE':'COLLECTING';
  frames[tf]={
   state,registeredAt:PROVIDER_FORWARD_REGISTRATION,
   totalPublished:history.length,postRegistrationM1:forward.length,
   notV2:legacy,invalidPlans:badPlans,overlapExcluded:overlap,
   selectedIndependent:independent.length,targetIndependent:targetCount,
   boundaries:full?cutoffs:null,
   periods:blocks.map((b,i)=>({window:i+1,...b.counts,
    endAt:b.cutoff})),
   providers:sourceChecks,
   reason:integrity?'Повреждённые планы, исходы или отсутствует V2 после регистрации.':
    !full?'Накапливаем 48 непересекающихся M1-публикаций после регистрации.':
    'Парный AUC по одинаковым исходам; статистическая значимость не заявляется.'
  };
 }
 return {version:PROVIDER_FORWARD_VERSION,asset,
  registeredAt:PROVIDER_FORWARD_REGISTRATION,
  state:Object.values(frames).some(x=>x.state==='CHECK_DATA')?
   'CHECK_DATA':Object.values(frames).some(x=>x.state==='DESCRIPTIVE')?
    'DESCRIPTIVE':'COLLECTING',
  frames,metadataOnly:PROVIDER_METADATA_ONLY,
  rules:RULES,trained:false,modelChanged:false,
  calibratedProbability:null,
  note:'Сравниваются фиксированные исследовательские ранги, НЕ реальные сделки. '+
   'Нельзя вывести причинность или точность источника из этих результатов. '+
   'Отсутствие API, новости и метаданные кошельков не получают ложных баллов. '+
   'M1 и архив M5 не смешиваются.'};
}
