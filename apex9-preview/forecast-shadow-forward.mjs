/**
 * APEX Shadow Research v1.
 * Frozen proposals are registered ONLY after an explicit user action in Room.
 * New outcomes must be published after registration + horizon embargo.
 * No synthetic signals, no order actions, no model weight changes, no claims
 * of causality or calibrated probability.
 */
import {FEATURE_DEFINITIONS,observedFeatureMatch}
 from './forecast-feature-holdout.mjs';
import {STABILITY_VERSION} from './forecast-feature-stability.mjs';
import {directionalHypothesis} from './directional-scenario.mjs';
import {verifiedDirectionalEvidence} from './forecast-quality.mjs';
import {multiFrameHypothesis,multiFrameEvidence} from './forecast-multiframe.mjs';
import {inspectEvidenceContext} from './forecast-evidence-context.mjs';

export const SHADOW_VERSION='APEX_SHADOW_FORWARD_V1';
export const SHADOW_RULES=Object.freeze({
 frameMs:Object.freeze({'15m':900000,'1h':3600000,'4h':14400000}),
 horizonBars:Object.freeze({'15m':16,'1h':24,'4h':24}),
 minDecisive:40,minPerGroup:12,minCoverage:.70,
 autopromote:false,tradeExecution:false,
 evidence:'IMMUTABLE_ROOM_AS_OF_PUBLICATION',
 embargo:'REGISTRATION_PLUS_FULL_FORECAST_HORIZON',
 observation:'FUTURE_PUBLICATIONS_ONLY'
});
const stamp=v=>Number.isSafeInteger(v)&&v>0;
const safeAsset=s=>typeof s==='string'&&/^[A-Z0-9]{5,20}$/.test(s);
const frames=Object.keys(SHADOW_RULES.frameMs);
const association=a=>a==='MATCH_MORE_TP3'||a==='MISMATCH_MORE_TP3';
const knownFeature=f=>FEATURE_DEFINITIONS.some(x=>x.id===f);
const failing=(state,reason)=>({
 state,reason,proposal:null,eligible:0,decisive:0,
 positive:{tp3:0,stop:0},negative:{tp3:0,stop:0},
 unavailable:0,awaiting:0,other:0,invalid:0,overlapExcluded:0,
 readyToApply:false,modelChanged:false
});
const rate=counts=>{
 const n=counts.tp3+counts.stop;
 return n?counts.tp3/n:null;
};
export function canDraftShadow(holdout,stability,{asset,frame,featureId,now=Date.now(),
 latestPublishedAt}={}){
 if(!safeAsset(asset)||!frames.includes(frame)||!knownFeature(featureId)||
  !stamp(now)||!stamp(latestPublishedAt)||latestPublishedAt>now||
  holdout?.asset!==asset||stability?.version!==STABILITY_VERSION||
  stability.asset!==asset||holdout?.frames?.[frame]?.frame!==frame||
  stability?.frames?.[frame]?.state!=='DESCRIPTIVE')
  return {state:'BLOCKED',reason:'Нет полной проверки выбранного признака'};
 const finding=stability.frames[frame].features
  ?.find(f=>f.id===featureId);
 if(finding?.state!=='REPEATED'||!association(finding.association)||
   finding.approvedForForecast!==false)
  return {state:'BLOCKED',reason:'Нет повторяющейся независимой исторической связи'};
 const history=holdout.frames[frame];
 if(history.state!=='DESCRIPTIVE'||!stamp(history.splitAt)||
  !stamp(history.confirmationAt)||history.confirmationAt<=history.splitAt||
  !Number.isSafeInteger(history.published)||history.published<30)
  return {state:'BLOCKED',reason:'Неполная временная история'};
 const evidence={asset,interval:frame,featureId,association:finding.association,
  sourceCutoffAt:latestPublishedAt,historySize:holdout.archiveRows,
  evidenceVersion:SHADOW_VERSION};
 return {state:'READY',reason:null,evidence};
}
export function inspectShadowProposal(proposal,{now=Date.now()}={}){
 if(!safeAsset(proposal?.asset)||!frames.includes(proposal?.interval)||
  !knownFeature(proposal?.featureId)||!association(proposal?.association)||
  proposal.evidenceVersion!==SHADOW_VERSION||
  !stamp(proposal.registeredAt)||proposal.registeredAt>now+60000||
  !stamp(proposal.sourceCutoffAt)||proposal.sourceCutoffAt>proposal.registeredAt||
  !Number.isSafeInteger(proposal.historySize)||proposal.historySize<1||
  !stamp(proposal.embargoUntil)||
  proposal.embargoUntil!==proposal.registeredAt+
   SHADOW_RULES.frameMs[proposal.interval]*
    SHADOW_RULES.horizonBars[proposal.interval]||
  proposal.id!==['shadow1',proposal.asset,proposal.interval,
   proposal.featureId,proposal.registeredAt].join(':'))
  return {state:'INVALID',reason:'Повреждённая или неизвестная запись'};
 return {state:'VERIFIED',reason:null,proposal};
}
function evidence(row,frame,now){
 return frame==='1h'?verifiedDirectionalEvidence(row,{now}):
  multiFrameEvidence(row,{now});
}
function rowFrame(row){
 if(directionalHypothesis(row)&&row.interval==='1h')return '1h';
 if(multiFrameHypothesis(row)&&
  (row.interval==='15m'||row.interval==='4h'))return row.interval;
 return null;
}
export function evaluateShadowProposal(proposal,rows,{
 asset,complete=false,publishedCount=null,now=Date.now()
}={}){
 const inspected=inspectShadowProposal(proposal,{now});
 if(inspected.state!=='VERIFIED')
  return failing('INVALID',inspected.reason);
 if(asset!==proposal.asset||!Array.isArray(rows)||
  rows.some(x=>x?.asset!==asset||!stamp(x.publishedAt)||
   typeof x.id!=='string')||new Set(rows.map(x=>x.id)).size!==rows.length)
  return failing('INVALID','Требуется неизменённая история одного актива');
 if(complete!==true||!Number.isSafeInteger(publishedCount)||
  publishedCount!==rows.length)
  return failing('INCOMPLETE','Нужен полный постраничный архив Room');
 const report={...failing('COLLECTING','Ещё недостаточно новых наблюдений'),
  proposal,postRegistration:0,covered:0,finished:0,
  // Compact as-published, non-overlapping outcome ledger. No price levels,
  // no inference of unobserved TP/SL and no retroactive source fills.
  timeline:[],timelineVersion:'SHADOW_OBSERVATION_LEDGER_V1',
  usedSourceVersions:['AS_OF_ROOM_EVIDENCE_V1'],now};
 const after=rows.filter(row=>rowFrame(row)===proposal.interval&&
  row.publishedAt>proposal.embargoUntil&&row.publishedAt<=now)
  .sort((a,b)=>a.publishedAt-b.publishedAt||a.id.localeCompare(b.id));
 report.postRegistration=after.length;
 let blockedUntil=proposal.embargoUntil;
 for(const row of after){
  const result=evidence(row,proposal.interval,now);
  if(result.state!=='OBSERVED'||!result.plan||
   !stamp(result.plan.targetCloseAt)||
   result.plan.targetCloseAt<=row.publishedAt){
   report.invalid++;continue;
  }
  if(row.publishedAt<=blockedUntil){report.overlapExcluded++;continue;}
  blockedUntil=result.plan.targetCloseAt;
  report.eligible++;
  const item={publishedAt:row.publishedAt,targetCloseAt:result.plan.targetCloseAt,
   outcomeRecordedAt:null,state:'AWAITING',supports:null,outcome:null};
  report.timeline.push(item);
  if(!result.finished){report.awaiting++;continue;}
  report.finished++;
  item.outcomeRecordedAt=row.evaluation?.evaluatedAt??null;
  if(!['TP3','STOP'].includes(result.outcome)){
   report.other++;item.state='OTHER';continue;
  }
  const ctx=inspectEvidenceContext(row);
  if(ctx.state!=='VERIFIED'){
   report.unavailable++;item.state='UNAVAILABLE';continue;
  }
  const observed=observedFeatureMatch(ctx,proposal.interval,
   result.plan.side,proposal.featureId);
  if(observed===null){
   report.unavailable++;item.state='UNAVAILABLE';continue;
  }
  const supports=proposal.association==='MATCH_MORE_TP3'?observed:!observed;
  item.state='DECISIVE';
  item.supports=supports;
  item.outcome=result.outcome;
  const group=supports?report.positive:report.negative;
  group[result.outcome==='TP3'?'tp3':'stop']++;
  report.covered++;
 }
 report.decisive=report.positive.tp3+report.positive.stop+
  report.negative.tp3+report.negative.stop;
 const p=report.positive.tp3+report.positive.stop;
 const n=report.negative.tp3+report.negative.stop;
 report.positiveShare=rate(report.positive);
 report.negativeShare=rate(report.negative);
 report.observedGapPp=p&&n?
  100*(report.positiveShare-report.negativeShare):null;
 report.coverage=report.finished?
  report.covered/report.finished:null;
 const good=report.decisive>=SHADOW_RULES.minDecisive&&
  p>=SHADOW_RULES.minPerGroup&&n>=SHADOW_RULES.minPerGroup&&
  report.coverage>=SHADOW_RULES.minCoverage;
 report.state=good?'DESCRIPTIVE':'COLLECTING';
 report.reason=good?
  'Результаты собраны на новых прогнозах; не доказательство улучшения.':
  'Нужно ≥40 проверенных TP3/SL, ≥12 в каждой группе и покрытие ≥70%.';
 return report;
}
