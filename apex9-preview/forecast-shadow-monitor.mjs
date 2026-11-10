/**
 * Shadow Research 2.0 — forward-only, descriptive temporal deterioration
 * audit of a frozen research feature. No model training, weights or orders.
 *
 * Fixed method (not learned): chronological 50/50 split of ALL eligible
 * post-registration publications; purge early forecast horizons crossing the
 * later period; exclude early outcomes recorded after later period started.
 * Missing observations stay missing; no selected-on-outcome cohorts.
 */
import {inspectShadowProposal} from './forecast-shadow-forward.mjs';

export const SHADOW_MONITOR_VERSION='APEX_SHADOW_MONITOR_V1';
export const SHADOW_MONITOR_RULES=Object.freeze({
 split:'FIRST_50_PERCENT_VS_LATEST_50_PERCENT_OF_PUBLISHED_ELIGIBLE',
 minPublished:48,minDecisivePerWindow:20,minPerArm:8,
 minCoverage:.70,minimumAbsoluteGapPp:8,
 maxGapDriftPp:20,
 noAutoTraining:true,noOrderActions:true,
 source:'COMPLETE_LOCAL_ROOM_POST_REGISTRATION_OBSERVATIONS'
});
const stamp=n=>Number.isSafeInteger(n)&&n>0;
const states=new Set(['AWAITING','OTHER','UNAVAILABLE','DECISIVE']);
const blank=()=>({published:0,eligible:0,finished:0,decisive:0,
 awaiting:0,other:0,unavailable:0,lateRecorded:0,purged:0,
 supports:{tp3:0,stop:0},otherGroup:{tp3:0,stop:0},
 coverage:null,gapPp:null});
const size=arm=>arm.tp3+arm.stop;
const ratio=arm=>size(arm)?arm.tp3/size(arm):null;
const fail=(state,reason,additional={})=>({
 version:SHADOW_MONITOR_VERSION,state,reason,
 readyToApply:false,modelChanged:false,
 reference:null,recent:null,
 referenceCutAt:null,latestPublishedAt:null,
 ...additional
});
function valid(item,proposal,now){
 if(!stamp(item?.publishedAt)||item.publishedAt<=proposal.embargoUntil||
  !stamp(item.targetCloseAt)||item.targetCloseAt<=item.publishedAt||
  item.publishedAt>now||!states.has(item.state))return false;
 if(item.state==='AWAITING')
  return item.outcomeRecordedAt===null&&item.supports===null&&
   item.outcome===null;
 if(!stamp(item.outcomeRecordedAt)||
  item.outcomeRecordedAt<item.publishedAt||
  item.outcomeRecordedAt>now)return false;
 if(item.state!=='DECISIVE')
  return item.supports===null&&item.outcome===null;
 return typeof item.supports==='boolean'&&
  ['TP3','STOP'].includes(item.outcome);
}
function tally(items,cutAt=null){
 const result=blank();
 result.published=items.length;
 for(const x of items){
  if(cutAt!==null&&x.targetCloseAt>=cutAt){
   result.purged++;continue;
  }
  result.eligible++;
  if(x.state==='AWAITING'){result.awaiting++;continue;}
  if(cutAt!==null&&x.outcomeRecordedAt>=cutAt){
   result.lateRecorded++;continue;
  }
  result.finished++;
  if(x.state==='OTHER'){result.other++;continue;}
  if(x.state==='UNAVAILABLE'){result.unavailable++;continue;}
  const arm=x.supports?result.supports:result.otherGroup;
  arm[x.outcome==='TP3'?'tp3':'stop']++;
  result.decisive++;
 }
 result.coverage=result.finished?
  result.decisive/result.finished:null;
 const a=ratio(result.supports),b=ratio(result.otherGroup);
 result.gapPp=a!==null&&b!==null?(a-b)*100:null;
 return result;
}
function enough(cohort){
 return cohort.decisive>=SHADOW_MONITOR_RULES.minDecisivePerWindow&&
  size(cohort.supports)>=SHADOW_MONITOR_RULES.minPerArm&&
  size(cohort.otherGroup)>=SHADOW_MONITOR_RULES.minPerArm;
}
export function assessShadowTemporalMonitor(report){
 const proposal=report?.proposal;
 const now=report?.now;
 const validProposal=inspectShadowProposal(proposal,{now});
 if(validProposal.state!=='VERIFIED'||
  !Array.isArray(report?.timeline)||
  report.timelineVersion!=='SHADOW_OBSERVATION_LEDGER_V1'||
  !Number.isSafeInteger(report.eligible)||
  report.timeline.length!==report.eligible||
  !Number.isSafeInteger(report.invalid)||report.invalid<0||
  !Number.isSafeInteger(report.postRegistration)||
  report.postRegistration<report.timeline.length||
  !['COLLECTING','DESCRIPTIVE'].includes(report.state))
  return fail('INVALID','Нужен исходный проверенный журнал Shadow Research');
 const events=report.timeline;
 if(events.some(x=>!valid(x,proposal,now)))
  return fail('INVALID','Некорректные временные отметки наблюдений');
 for(let i=1;i<events.length;i++)
  if(events[i].publishedAt<=events[i-1].publishedAt)
   return fail('INVALID','Нарушен порядок публикаций');
 if(report.invalid>0)
  return fail('INVALID_EVIDENCE',
   'Некоторые исходы не прошли проверку событий Room; вывод заблокирован.',
   {invalid:report.invalid});
 const latestPublishedAt=events.at(-1)?.publishedAt??null;
 if(events.length<SHADOW_MONITOR_RULES.minPublished)
  return fail('COLLECTING',
   'Нужно минимум 48 непересекающихся новых публикаций этого ТФ.',
   {eligible:events.length,latestPublishedAt});
 const split=Math.floor(events.length/2);
 const cutAt=events[split]?.publishedAt;
 if(!stamp(cutAt)||cutAt<=events[split-1].publishedAt)
  return fail('INVALID','Невозможно разделить публикации по времени');
 const reference=tally(events.slice(0,split),cutAt);
 const recent=tally(events.slice(split));
 const common={reference,recent,referenceCutAt:cutAt,
  latestPublishedAt,eligible:events.length};
 if(!enough(reference)||!enough(recent))
  return fail('COLLECTING',
   'В каждом периоде нужно ≥20 TP3/SL и ≥8 в обеих группах.',
   common);
 if(reference.coverage<SHADOW_MONITOR_RULES.minCoverage||
    recent.coverage<SHADOW_MONITOR_RULES.minCoverage)
  return fail('LOW_COVERAGE',
   'Данных источников недостаточно для сравнения периодов.',
   common);
 const a=reference.gapPp,b=recent.gapPp;
 if(!Number.isFinite(a)||!Number.isFinite(b))
  return fail('COLLECTING','Невозможно рассчитать независимые доли TP3.',common);
 if(b<=-SHADOW_MONITOR_RULES.minimumAbsoluteGapPp)
  return fail('REVERSED',
   'В более поздней выборке наблюдается обратная связь с исходом TP3.',
   common);
 if(b<SHADOW_MONITOR_RULES.minimumAbsoluteGapPp)
  return fail('WEAKENED',
   'На более поздней выборке преимущество группы не подтверждается.',
   common);
 if(a<SHADOW_MONITOR_RULES.minimumAbsoluteGapPp)
  return fail('UNSTABLE',
   'Сравнение выявило связь только в позднем периоде; повторение не подтверждено.',
   common);
 if(Math.abs(a-b)>SHADOW_MONITOR_RULES.maxGapDriftPp)
  return fail('DRIFTING',
   'Величина различия между группами заметно изменилась.',
   common);
 return fail('REPEATED_OBSERVATION',
  'Различие повторилось на новых временных участках, но не доказало пользу модели.',
  common);
}
