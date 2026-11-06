/** APEX 5.0 Research Director: interpretable, deterministic research queue.
 * It proposes what to investigate, never places orders, re-trains signals,
 * changes the hypothesis or invents observations. All evidence is read-only.
 */
import type {CoreQualityPassport} from './core-quality-passport';
import type {CoreResearchReport} from './core-research';
import type {HourTransitionReport} from './hour-transitions';
import type {HourHoldoutReport} from './hour-holdout';
import type {DriftReport} from './regime-drift';
import type {ContextAuditReport} from './context-audit';

export type DirectorTaskId=
 'integrity'|'freshness'|'raw-quality'|'h1-coverage'|'hypothesis'|
 'holdout'|'drift-change'|'context-change'|'drift-coverage'|'context-coverage'|'replication';
export type DirectorStage='investigate'|'collect'|'verify'|'observe';
export type DirectorPriority='critical'|'high'|'normal';
export type DirectorMission={
 id:DirectorTaskId;stage:DirectorStage;priority:DirectorPriority;
 title:string;why:string;question:string;nextStep:string;acceptance:string;
};
export type ResearchDirectorDecision={
 protocol:'research-director-rules-v1';focus:DirectorMission;
 alternatives:DirectorMission[];reasonCount:number;
 researchOnly:true;signature:string;
};
export type ResearchDirectorInputs={
 passport:CoreQualityPassport;core:CoreResearchReport;transitions:HourTransitionReport;
 holdout:HourHoldoutReport;drift:DriftReport;context:ContextAuditReport;
};
export type DirectorHistoryEvent={at:number;signature:string;task:DirectorTaskId;title:string;stage:DirectorStage};
export type DirectorHistory={version:1;events:DirectorHistoryEvent[]};
const PROTOCOL='research-director-rules-v1' as const,MAX=32,RETENTION=90*86400000;
const TASK_IDS:DirectorTaskId[]=[
 'integrity','freshness','raw-quality','h1-coverage','hypothesis','holdout',
 'drift-change','context-change','drift-coverage','context-coverage','replication'
];
const STAGES:DirectorStage[]=['investigate','collect','verify','observe'];
const finite=(x:unknown):x is number=>typeof x==='number'&&Number.isFinite(x);
const task=(id:DirectorTaskId,stage:DirectorStage,priority:DirectorPriority,
 title:string,why:string,question:string,nextStep:string,acceptance:string):DirectorMission=>
 ({id,stage,priority,title,why,question,nextStep,acceptance});
const min=(n:unknown)=>finite(n)?Math.max(0,Math.trunc(n)):0;
const LABEL:{[K in DirectorTaskId]:string}={
 integrity:'Проверить совместимость журналов',freshness:'Восстановить последовательность H1',
 'raw-quality':'Разобраться с неполными данными','h1-coverage':'Проверить пропуски H1',
 hypothesis:'Сформировать первую гипотезу H1',holdout:'Проверить гипотезу на будущих данных',
 'drift-change':'Перепроверить изменение частоты','context-change':'Повторить наблюдения в разных H4',
 'drift-coverage':'Собрать данные для проверки устойчивости',
 'context-coverage':'Изучить недостающие состояния H4',
 replication:'Подтвердить воспроизводимость в новом периоде'
};
function available(p:ResearchDirectorInputs):boolean{
 return !!p&&!!p.passport&&!!p.core&&!!p.transitions&&!!p.holdout&&!!p.drift&&!!p.context;
}
/** Predeclared ordering of concerns: consistency > freshness > source quality
 * > frozen hypothesis > future holdout > detected drift/context > coverage.
 * No percent-based composite score or simulated model confidence.
 */
export function researchDirector(p:ResearchDirectorInputs):ResearchDirectorDecision{
 const candidates:{rank:number;mission:DirectorMission}[]=[];
 const add=(rank:number,m:DirectorMission)=>candidates.push({rank,mission:m});
 if(!available(p)){
  const fallback=task('integrity','investigate','critical',LABEL.integrity,
   'Не все исходные отчёты доступны.',
   'Можно ли сопоставить исследования из одной версии и одной гипотезы?',
   'Проверить наличие локальных CORE-журналов и метаданных.',
   'Все обязательные отчёты доступны и прошли проверку.');
  return {protocol:PROTOCOL,focus:fallback,alternatives:[],reasonCount:1,researchOnly:true,
   signature:PROTOCOL+':'+fallback.id+':'+fallback.stage};
 }
 const {passport:q,core,transitions:t,holdout:h,drift:d,context:c}=p;
 const mismatched=h.frozen===true&&q.studyAligned===false;
 if(mismatched)add(100,task('integrity','investigate','critical',LABEL.integrity,
  'Паспорт обнаружил несовпадающие идентификаторы исследовательской гипотезы.',
  'Все журналы действительно относятся к одной замороженной гипотезе?',
  'Сверить временную отметку фиксации и состояния H1 в журналах 4.6–4.8. Ничего автоматически не объединять.',
  'Идентификаторы совпадают, а пропущенные данные не восстановлены искусственно.'));
 const stale=q.state==='observations-stale'||d.phase==='observations-stale';
 if(stale)add(95,task('freshness','investigate','critical',LABEL.freshness,
  'Последние полноценные исследовательские наблюдения H1 устарели.',
  'Работает ли последовательный сбор пяти активов, а не только обновление цен?',
  'Проверить реальные фоновые проверки, дату закрытия H1 и пропуски; повторить сбор новых завершённых свечей.',
  'Появились новые полные H1-наблюдения с честными временными отметками.'));
 const lowCapture=min(core.checks)>=10&&min(core.partial)/Math.max(1,min(core.checks))>0.3;
 if(lowCapture)add(90,task('raw-quality','investigate','high',LABEL['raw-quality'],
  'Более 30% последних проверок CORE неполные.',
  'Почему не удаётся получить согласованный набор пяти активов × трёх интервалов?',
  'Изучить фактические ошибки и недоступные свечи, не подменяя их оценочными значениями.',
  'Новый период показывает устойчивое наличие полного набора 5×3.'));
 const highGaps=min(t.missingHours)>=6&&min(t.missingHours)>min(t.observations)/2;
 if(highGaps)add(85,task('h1-coverage','investigate','high',LABEL['h1-coverage'],
  'В наблюдениях H1 много пропущенных последовательных часов.',
  'Откуда возникают разрывы между реально закрытыми H1?',
  'Сопоставить запуски Android с часами H1; не создавать переходы через разрывы.',
  'Наблюдаются соседние полные H1-часы без искусственного восполнения истории.'));
 if(!h.frozen)add(80,task('hypothesis','collect','normal',LABEL.hypothesis,
  'Гипотеза ещё не зафиксирована, поэтому проверка на новых данных пока невозможна.',
  'Есть ли повторяющийся переход состояния H1, достойный дальнейшего испытания?',
  'Собирать реальные переходы H1 для одной исходной категории, сохраняя предзаданные правила.',
  'Не менее 20 переходов одного исходного состояния за 3 разных UTC-дня; после этого гипотеза фиксируется однократно.'));
 if(h.frozen&&h.status!=='observational-comparison')add(75,task('holdout','collect','high',LABEL.holdout,
  'После фиксации гипотезы пока недостаточно новых независимых по времени наблюдений.',
  'Повторяется ли зафиксированный переход на новых часах, а не только на обучении?',
  'Не менять обучающую гипотезу. Накопить переходы после отметки фиксации и сравнить их с рыночным фоном.',
  'Не менее 20 новых подходящих H1-переходов за 3 UTC-дня.'));
 if(h.frozen&&d.phase==='possible-decline')add(74,task('drift-change','verify','high',LABEL['drift-change'],
  'Монитор устойчивости обнаружил заметное ослабление исследуемой частоты.',
  'Сохраняется ли падение частоты перехода в следующем временном периоде?',
  'Продолжить новые перспективные наблюдения с исходной неизменной гипотезой; сравнить с замороженной базой.',
  'Есть дополнительный новый период достаточной длины, а результат не основан на пропусках.'));
 if(h.frozen&&c.state==='context-dependent')add(72,task('context-change','verify','high',LABEL['context-change'],
  'Различие результатов между группами H4 достигло порога описательной проверки.',
  'Повторяется ли различие для разных состояний H4 в другом периоде?',
  'Продолжить сбор полных H4-контекстов, известных до следующей H1, без переоценки старых исходов.',
  'В следующем периоде накоплены достаточные разные группы H4 и результат проверен отдельно.'));
 if(h.frozen&&!['no-clear-decline','possible-decline'].includes(d.phase)&&
  d.phase!=='observations-stale')add(62,task('drift-coverage','collect','normal',LABEL['drift-coverage'],
  'Для сравнения устойчивости между периодами ещё не собраны достаточные выборки.',
  'Устойчива ли частота перехода за разные дни?',
  'Собирать две последовательные серии фактических наблюдений без повторного обучения.',
  'Ранняя и более поздняя серии удовлетворяют порогу 20 наблюдений за 3 дня каждая.'));
 if(h.frozen&&c.qualified<2)add(60,task('context-coverage','collect','normal',LABEL['context-coverage'],
  'Недостаточно разных полноценных групп рыночного контекста H4.',
  'В каких условиях H4 гипотеза ещё не была проверена?',
  'Накопить закрытые H4-свечи для пяти активов, сохраняя контекст именно исходного часа H1.',
  'Как минимум две группы H4 с 12 наблюдениями за 3 дня каждая.'));
 add(10,task('replication','observe','normal',LABEL.replication,
  'Основная задача — продолжить оценку переносимости результата на другие временные периоды.',
  'Сохранится ли описательная закономерность в следующем неиспользованном периоде?',
  'Продолжить перспективный сбор, не менять замороженные правила, отдельно отмечать пробелы и противоречия.',
  'Следующий самостоятельный период накоплен и сопоставлен с предыдущим без подгонки.'));
 candidates.sort((a,b)=>b.rank-a.rank);
 const focus=candidates[0].mission,alternatives=candidates.slice(1,3).map(x=>x.mission);
 return {protocol:PROTOCOL,focus,alternatives,reasonCount:candidates.length,researchOnly:true,
  signature:PROTOCOL+':'+focus.id+':'+focus.stage};
}
export function openDirectorHistory(raw:string|null,now=Date.now()):DirectorHistory{
 const empty:DirectorHistory={version:1,events:[]};
 if(!finite(now)||now<=0)return empty;
 try{
  const x=JSON.parse(raw||'null') as DirectorHistory;
  if(x?.version!==1||!Array.isArray(x.events))return empty;
  const events:DirectorHistoryEvent[]=[];
  for(const row of x.events.slice(-MAX*3)){
   if(!row||!finite(row.at)||row.at<now-RETENTION||row.at>now||
    !TASK_IDS.includes(row.task)||!STAGES.includes(row.stage)||
    row.title!==LABEL[row.task]||row.signature!==PROTOCOL+':'+row.task+':'+row.stage)continue;
   if(events.at(-1)?.signature===row.signature)continue;
   events.push({at:row.at,signature:row.signature,task:row.task,title:row.title,stage:row.stage});
  }
  return {version:1,events:events.slice(-MAX)};
 }catch{return empty;}
}
/** Log changes in research priority only, not every new market snapshot/minute. */
export function recordDirectorDecision(old:DirectorHistory,decision:ResearchDirectorDecision,now=Date.now()):DirectorHistory{
 if(!old||old.version!==1||!Array.isArray(old.events)||!finite(now)||now<=0||
  !decision||decision.protocol!==PROTOCOL||!TASK_IDS.includes(decision.focus?.id)||
  decision.focus.title!==LABEL[decision.focus.id]||
  decision.signature!==PROTOCOL+':'+decision.focus.id+':'+decision.focus.stage)return old;
 if(old.events.at(-1)?.signature===decision.signature)return old;
 const row:DirectorHistoryEvent={at:now,signature:decision.signature,task:decision.focus.id,
  title:decision.focus.title,stage:decision.focus.stage};
 return {version:1,events:[...old.events.filter(e=>e.at>=now-RETENTION),row].slice(-MAX)};
}
