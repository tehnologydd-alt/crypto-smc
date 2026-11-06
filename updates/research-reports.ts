/** APEX 5.2: immutable, local research review reports.
 * Strictly summarises completed SAMPLE collection in APEX 5.1, never confirms
 * accuracy, changes hypotheses, calculates signals or places orders.
 */
import type {ResearchQueue,ResearchQueueItem} from './research-queue';
import type {DirectorTaskId} from './research-director';
import type {CoreQualityPassport,QualityState} from './core-quality-passport';
import type {HourHoldoutReport} from './hour-holdout';
import type {DriftReport} from './regime-drift';
import type {ContextAuditReport} from './context-audit';

const VERSION=1 as const,MAX=24;
const TASKS:DirectorTaskId[]=['integrity','freshness','raw-quality','h1-coverage','hypothesis','holdout',
 'drift-change','context-change','drift-coverage','context-coverage','replication'];
const QUALITY:QualityState[]=['awaiting-evidence','observations-stale','needs-review','data-limited','descriptive-only'];
export type ResearchReview={
 key:string;taskId:DirectorTaskId;title:string;question:string;
 assignedAt:number;sampleReadyAt:number;recordedAt:number;
 sampleCount:number;requiredCount:number;observedPeriods:number;requiredPeriods:number;
 evidenceLastAt:number;metric:string;
 qualityState:QualityState;issues:string[];
 hypothesis:string|null;findings:string[];limitations:string[];
 nextQuestion:string;nextCheck:string;
 verdict:'review-required';source:'apex-director-research-v1';
};
export type ResearchReviewArchive={version:1;reports:ResearchReview[]};
export type ResearchReviewInputs={
 queue:ResearchQueue;quality:CoreQualityPassport;
 holdout:HourHoldoutReport;drift:DriftReport;context:ContextAuditReport;
};
export type ResearchReviewOverview={count:number;latest:ResearchReview|null;pending:number;hasUnreviewed:boolean};
const finite=(n:unknown):n is number=>typeof n==='number'&&Number.isFinite(n);
const words=(x:unknown,max:number):x is string=>typeof x==='string'&&x.length>0&&x.length<=max;
const safeText=(x:unknown,max:number)=>typeof x==='string'?x.slice(0,max):'';
const known=(id:unknown):id is DirectorTaskId=>TASKS.includes(id as DirectorTaskId);
const keyFor=(task:ResearchQueueItem)=>task.id+':'+task.createdAt;
const NEXT:Record<DirectorTaskId,{question:string;check:string}>={
 integrity:{question:'Все ли исследовательские журналы относятся к одной неизменной гипотезе?',
  check:'Сверить идентификаторы и происхождение данных вручную; не объединять несовместимые журналы.'},
 freshness:{question:'Продолжится ли корректная последовательность закрытых H1 в следующий день?',
  check:'Проверить новые реальные H1 с пятью активами; отсутствие часов отмечать, не заполнять.'},
 'raw-quality':{question:'Сохранится ли полнота исходных данных CORE на следующем временном отрезке?',
  check:'Сравнить новую серию полноты 5×3 и зарегистрировать фактические пропуски.'},
 'h1-coverage':{question:'Удержится ли последовательность наблюдений H1 без разрывов?',
  check:'Повторить наблюдение непрерывных закрытий H1 в новом периоде.'},
 hypothesis:{question:'Повторяется ли замороженный переход на ещё не использованных часах?',
  check:'Набрать будущую выборку после фиксации; не подбирать параметры по ней.'},
 holdout:{question:'Согласуется ли частота перехода с другими будущими периодами и рыночным фоном?',
  check:'Сравнить следующие закрытые часы с общей частотой состояния и ранней выборкой.'},
 'drift-change':{question:'Сохраняется ли изменение частоты вне окна, в котором оно впервые обнаружено?',
  check:'Зарегистрировать и проверить следующий непересекающийся временной период.'},
 'context-change':{question:'Повторяется ли различие условий H4 в следующих независимых наблюдениях?',
  check:'Сопоставить новые H4-группы, используя только контекст, известный до исхода H1.'},
 'drift-coverage':{question:'Получен ли тот же описательный вывод в следующем временном периоде?',
  check:'Продолжить новые наблюдения устойчивости, не менять контрольную выборку.'},
 'context-coverage':{question:'Сохраняется ли отличие между H4-контекстами при новом наборе данных?',
  check:'Собрать новые группы H4 без восстановления пропущенного контекста.'},
 replication:{question:'Повторится ли наблюдаемая закономерность на следующем неиспользованном периоде?',
  check:'Зарегистрировать следующий период и повторить тот же исследовательский протокол.'}
};
function eligible(t:ResearchQueueItem,now:number):boolean{
 return !!t&&known(t.id)&&t.id!=='integrity'&&t.phase==='review'&&
  words(t.title,100)&&words(t.question,500)&&words(t.acceptance,600)&&
  finite(t.createdAt)&&t.createdAt>0&&t.createdAt<=now&&
  finite(t.readyAt)&&t.readyAt>=t.createdAt&&t.readyAt<=now&&
  finite(t.lastEvidenceAt)&&t.lastEvidenceAt>t.createdAt&&t.lastEvidenceAt<=now&&
  Number.isInteger(t.count)&&Number.isInteger(t.target)&&t.target>=1&&t.count>=t.target&&
  Number.isInteger(t.periods)&&Number.isInteger(t.periodTarget)&&t.periodTarget>=1&&t.periods>=t.periodTarget;
}
function safeReview(x:unknown,now:number):x is ResearchReview{
 if(!x||typeof x!=='object')return false;
 const r=x as Partial<ResearchReview>;
 return known(r.taskId)&&r.taskId!=='integrity'&&r.source==='apex-director-research-v1'&&
  r.verdict==='review-required'&&words(r.title,100)&&words(r.question,500)&&
  finite(r.assignedAt)&&r.assignedAt>0&&finite(r.sampleReadyAt)&&r.sampleReadyAt>=r.assignedAt&&
  finite(r.recordedAt)&&r.recordedAt>=r.sampleReadyAt&&r.recordedAt<=now&&
  r.key===r.taskId+':'+r.assignedAt&&
  Number.isInteger(r.sampleCount)&&Number.isInteger(r.requiredCount)&&r.requiredCount!>=1&&
  r.sampleCount!>=r.requiredCount!&&Number.isInteger(r.observedPeriods)&&Number.isInteger(r.requiredPeriods)&&
  r.requiredPeriods!>=1&&r.observedPeriods!>=r.requiredPeriods!&&
  finite(r.evidenceLastAt)&&r.evidenceLastAt>r.assignedAt&&r.evidenceLastAt<=r.recordedAt&&
  typeof r.metric==='string'&&r.metric.length<=120&&
  QUALITY.includes(r.qualityState as QualityState)&&Array.isArray(r.issues)&&r.issues.length<=8&&
  r.issues.every(v=>words(v,250))&&
  (r.hypothesis===null||words(r.hypothesis,170))&&
  Array.isArray(r.findings)&&r.findings.length>=2&&r.findings.length<=6&&
  r.findings.every(v=>words(v,350))&&Array.isArray(r.limitations)&&
  r.limitations.length>=2&&r.limitations.length<=6&&r.limitations.every(v=>words(v,350))&&
  words(r.nextQuestion,350)&&words(r.nextCheck,350);
}
export function openResearchReviews(raw:string|null,now=Date.now()):ResearchReviewArchive{
 const empty:ResearchReviewArchive={version:VERSION,reports:[]};
 if(!finite(now)||now<=0)return empty;
 try{
  const x=JSON.parse(raw||'null') as ResearchReviewArchive;
  if(x?.version!==VERSION||!Array.isArray(x.reports))return empty;
  const seen=new Set<string>(),reports:ResearchReview[]=[];
  for(const r of x.reports.slice(-MAX*2)){
   if(!safeReview(r,now)||seen.has(r.key))continue;
   seen.add(r.key);
   reports.push(r);
  }
  reports.sort((a,b)=>a.recordedAt-b.recordedAt);
  return {version:1,reports:reports.slice(-MAX)};
 }catch{return empty;}
}
function formatHypothesis(h:HourHoldoutReport):string|null{
 if(!h?.frozen||!h.from||!h.expected||!finite(h.frozenAt))return null;
 return 'H1: '+h.from+' → '+h.expected+'; фиксация: '+new Date(h.frozenAt).toISOString().slice(0,16)+' UTC';
}
function buildReview(task:ResearchQueueItem,quality:CoreQualityPassport,holdout:HourHoldoutReport,
 drift:DriftReport,context:ContextAuditReport,now:number):ResearchReview{
 const n=NEXT[task.id];
 const issues=(Array.isArray(quality.flags)?quality.flags:[])
  .filter((v):v is string=>words(v,250)).slice(0,7);
 const findings=[
  'После постановки задачи учтено '+task.count+' наблюдений (порог '+task.target+'), охвачено '+task.periods+' периодов (порог '+task.periodTarget+').',
  'Последнее засчитанное наблюдение: '+new Date(task.lastEvidenceAt!).toISOString().slice(0,16)+' UTC.',
  'Паспорт качества на момент составления отчёта: '+quality.state+'.'
 ];
 if(task.id==='holdout'||task.id==='replication'||task.id==='drift-change')
  findings.push('Будущая выборка H1: '+(holdout.futureEdges||0)+' подходящих переходов; это описательный результат.');
 if(task.id==='context-change'||task.id==='context-coverage')
  findings.push('Контекст H4: '+(context.qualified||0)+' групп с достаточными наблюдениями.');
 if(task.id==='drift-coverage'||task.id==='drift-change')
  findings.push('Проверка временной устойчивости: '+safeText(drift.phase,45)+'.');
 const limitations=[
  'Достижение порога наблюдений означает лишь готовность данных к рассмотрению — не подтверждение гипотезы.',
  'Последовательные часовые наблюдения могут быть зависимыми, а пропущенные часы не восполнялись.',
  'Результат является локальным снимком исследовательских данных и требует повторной проверки.'
 ];
 if(issues.length)limitations.push('На момент фиксации есть нерешённые замечания к данным.');
 return {key:keyFor(task),taskId:task.id,title:task.title,question:task.question,
  assignedAt:task.createdAt,sampleReadyAt:task.readyAt!,recordedAt:now,
  sampleCount:task.count,requiredCount:task.target,observedPeriods:task.periods,requiredPeriods:task.periodTarget,
  evidenceLastAt:task.lastEvidenceAt!,metric:safeText(task.measureLabel,120),
  qualityState:quality.state,issues,hypothesis:formatHypothesis(holdout),findings,limitations,
  nextQuestion:n.question,nextCheck:n.check,verdict:'review-required',source:'apex-director-research-v1'};
}
/** Snapshot the first review-ready observation only. Reports never get silently edited.
 * New data can produce a different future task, not rewrite an earlier report.
 */
export function advanceResearchReviews(old:ResearchReviewArchive,input:ResearchReviewInputs,now=Date.now()):ResearchReviewArchive{
 if(!old||old.version!==VERSION||!Array.isArray(old.reports)||!finite(now)||now<=0||
  !input?.queue||!Array.isArray(input.queue.items)||!input.quality||
  !input.holdout||!input.drift||!input.context)return old;
 const seen=new Set(old.reports.map(r=>r.key));
 const fresh:ResearchReview[]=[];
 for(const task of input.queue.items){
  if(!eligible(task,now)||seen.has(keyFor(task)))continue;
  // Do not fabricate coherent conclusions from mismatched frozen studies.
  if(input.holdout.frozen&&input.quality.studyAligned===false&&
   ['hypothesis','holdout','replication','drift-change','drift-coverage','context-change','context-coverage'].includes(task.id))continue;
  const review=buildReview(task,input.quality,input.holdout,input.drift,input.context,now);
  if(!safeReview(review,now))continue;
  fresh.push(review);seen.add(review.key);
 }
 if(!fresh.length)return old;
 return {version:1,reports:[...old.reports,...fresh].sort((a,b)=>a.recordedAt-b.recordedAt).slice(-MAX)};
}
export function researchReviewOverview(archive:ResearchReviewArchive,queue:ResearchQueue):ResearchReviewOverview{
 const reports=Array.isArray(archive?.reports)?archive.reports:[];
 const expected=(queue?.items||[]).filter(x=>x.phase==='review').length;
 return {count:reports.length,latest:reports.at(-1)||null,
  pending:Math.max(0,expected-reports.filter(r=>(queue?.items||[]).some(t=>t.id===r.taskId&&t.createdAt===r.assignedAt)).length),
  hasUnreviewed:reports.length>0};
}
