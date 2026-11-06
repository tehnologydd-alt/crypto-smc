/** APEX 5.5: three separately reasoned, read-only research auditors.
 * The council is deterministic and transparent, not multiple independent LLMs.
 * These auditors share the same factual CORE source and are NOT independent
 * experimental replications. Their disagreement triggers review, never voting.
 */
import type {CoreQualityPassport} from './core-quality-passport';
import type {CoreResearchReport} from './core-research';
import type {HourTransitionReport} from './hour-transitions';
import type {HourHoldoutReport} from './hour-holdout';
import type {DriftReport} from './regime-drift';
import type {ContextAuditReport} from './context-audit';
import type {ReplicationOverview} from './study-replication';
import type {DirectorTaskId} from './research-director';

const STALE=72*3_600_000;
export type CouncilRole='data'|'pattern'|'challenge';
export type CouncilFinding='blocked'|'caution'|'pending'|'descriptive';
export type CouncilState='blocked'|'review'|'collecting'|'descriptive';
export type ResearchAuditor={role:CouncilRole;title:string;state:CouncilFinding;
 evidence:string;question:string;source:string};
export type ResearchCouncilInputs={
 passport:CoreQualityPassport;core:CoreResearchReport;transitions:HourTransitionReport;
 holdout:HourHoldoutReport;drift:DriftReport;context:ContextAuditReport;
 replication:ReplicationOverview;directorFocus:DirectorTaskId;
};
export type ResearchCouncilReport={
 protocol:'core-research-council-v1';state:CouncilState;auditors:[ResearchAuditor,ResearchAuditor,ResearchAuditor];
 noteworthy:string[];decision:string;nextQuestion:string;priorityGap:boolean;
 reviewCount:number;readyCount:number;researchOnly:true;
};
const finite=(x:unknown):x is number=>typeof x==='number'&&Number.isFinite(x);
const pct=(a:number,b:number)=>b?Math.round(1000*a/b)/10:0;
function finding(role:CouncilRole,title:string,state:CouncilFinding,evidence:string,question:string,source:string):ResearchAuditor{
 return {role,title,state,evidence,question,source};
}
/** The DATA auditor reads source capture/H1 continuity and time; it cannot
 * overrule study integrity problems with fresh polling alone. */
export function auditResearchData(p:ResearchCouncilInputs,now=Date.now()):ResearchAuditor{
 const core=p.core,h1=p.transitions,q=p.passport;
 if(q.studyAligned===false&&p.holdout.frozen)
  return finding('data','Аудитор данных','blocked','Несовместимы идентификаторы замороженных гипотез в исследовательских журналах.','Какие журналы относятся к одной исходной гипотезе?','Паспорт 4.9');
 if(core.checks<10||h1.transitions<20)
  return finding('data','Аудитор данных','pending',core.complete+' полных CORE, '+h1.transitions+' H1-переходов; материала пока мало.','Хватает ли полных наблюдений без разрывов?','CORE 4.4–4.5');
 if(finite(h1.newestAt)&&now-h1.newestAt>STALE)
  return finding('data','Аудитор данных','caution','Последнее достоверное H1 наблюдение старше 72 часов, хотя данные цены могут обновляться.','Почему прекратилось поступление новых завершённых H1?','Переходы H1 · 4.5');
 if(core.checks>0&&core.partial/core.checks>0.3)
  return finding('data','Аудитор данных','caution','Доля неполных CORE-проверок составляет '+pct(core.partial,core.checks)+'%.','Какие активы или интервалы не проходят проверку источников?','CORE 4.4');
 if(h1.missingHours>=6&&h1.missingHours>h1.observations/2)
  return finding('data','Аудитор данных','caution','Пропущено '+h1.missingHours+' часов при '+h1.observations+' точках H1.','Можно ли устранить разрывы в будущем сборе без восстановления истории?','Переходы H1 · 4.5');
 return finding('data','Аудитор данных','descriptive',core.complete+' полных проверок CORE, '+h1.transitions+' наблюдаемых H1-переходов.','Будут ли источники столь же полными в следующем периоде?','CORE 4.4–4.5');
}
/** Pattern auditor only evaluates prospective frozen outcomes and temporally
 * disjoint replication; a good training score is never counted as proof. */
export function auditResearchPattern(p:ResearchCouncilInputs):ResearchAuditor{
 const h=p.holdout,r=p.replication;
 if(!h.frozen)
  return finding('pattern','Аудитор закономерности','pending','Исходная гипотеза H1 ещё не зафиксирована.','Какую гипотезу можно закрепить по заранее заданным правилам?','Holdout 4.6');
 if(r.phase==='hypothesis-mismatch')
  return finding('pattern','Аудитор закономерности','blocked','Новые повторные проверки относятся к другой замороженной гипотезе.','Можно ли доказать общую идентичность гипотез и периодов?','Повторение 5.4');
 if(h.futureEdges<20||h.conditionDays<3)
  return finding('pattern','Аудитор закономерности','pending','Будущая выборка: '+h.futureEdges+' переходов за '+h.conditionDays+' UTC-дней.','Повторяется ли переход после обучения на достаточном новом периоде?','Holdout 4.6');
 if(r.completed<2)
  return finding('pattern','Аудитор закономерности','pending','Будущая выборка H1 есть, но непересекающиеся повторные группы ещё не завершены: '+r.completed+'/2.','Будет ли повторена частота на других календарных днях?','Повторение 5.4');
 if(r.phase==='observations-stale')
  return finding('pattern','Аудитор закономерности','caution','Повторные периоды собраны, но новые факты не поступали вовремя.','Сохраняется ли наблюдение после возобновления сбора?','Повторение 5.4');
 if(r.differencePts!==null&&Math.abs(r.differencePts)>20)
  return finding('pattern','Аудитор закономерности','caution','Частоты контрольной и последней группы различаются на '+Math.abs(r.differencePts).toFixed(1)+' п.п.','Воспроизводится ли различие на следующей непересекающейся группе?','Повторение 5.4');
 return finding('pattern','Аудитор закономерности','descriptive','Получены '+r.completed+' группы без общих UTC-дней; яркого расхождения частот по правилу 5.4 нет.','Повторится ли описание на следующем периоде без изменения гипотезы?','Holdout 4.6 · Повторение 5.4');
}
/** Challenge auditor explicitly searches for objections that do not disappear
 * just because the other two auditors are optimistic. */
export function auditResearchChallenges(p:ResearchCouncilInputs):ResearchAuditor{
 const d=p.drift,c=p.context,h=p.holdout,r=p.replication;
 if(h.frozen&&!p.passport.studyAligned)
  return finding('challenge','Аудитор возражений','blocked','Части исследования приписаны несовместимым замороженным гипотезам.','Какие сравнения нужно исключить до ручной сверки?','Паспорт 4.9');
 const objections:string[]=[];
 if(d.phase==='possible-decline')objections.push('в последних данных наблюдается возможное ослабление частоты');
 if(c.state==='context-dependent')objections.push('частоты различаются между условиями H4');
 if(h.status==='observational-comparison'&&finite(h.differenceToTraining)&&h.differenceToTraining<=-25)
  objections.push('будущая выборка заметно слабее исходной обучающей');
 if(h.status==='observational-comparison'&&finite(h.differenceToBaseline)&&h.differenceToBaseline<=-20)
  objections.push('результат слабее общего фона');
 if(r.completed>=2&&r.differencePts!==null&&Math.abs(r.differencePts)>20)
  objections.push('повторная группа отличается от контрольной');
 if(objections.length)
  return finding('challenge','Аудитор возражений','caution',objections.join('; ')+'.','Сохраняются ли эти расхождения на будущих данных с теми же правилами?','Drift 4.7 · Контекст 4.8 · Holdout 4.6 · 5.4');
 if(d.phase==='observations-stale'||c.state==='collecting'||c.state==='need-variety'||
  !['no-clear-decline','possible-decline'].includes(d.phase)||c.qualified<2)
  return finding('challenge','Аудитор возражений','pending','Пока нет достаточных проверок устойчивости по времени и в разных состояниях H4.','Какие независимые от обучения периоды и условия ещё не охвачены?','Drift 4.7 · Контекст 4.8');
 return finding('challenge','Аудитор возражений','descriptive','Крупных расхождений в уже завершённых проверках не обнаружено; это не доказательство отсутствия проблем.','Какие новые условия могут опровергнуть текущую гипотезу?','Drift 4.7 · Контекст 4.8');
}
/** Director arbitrates by veto for invalid provenance, then unresolved objections.
 * Auditors don't vote and aren't represented as three independent AI models.
 */
export function researchCouncil(p:ResearchCouncilInputs,now=Date.now()):ResearchCouncilReport{
 const auditors:[ResearchAuditor,ResearchAuditor,ResearchAuditor]=[
  auditResearchData(p,now),auditResearchPattern(p),auditResearchChallenges(p)];
 const blocked=auditors.some(a=>a.state==='blocked');
 const cautious=auditors.some(a=>a.state==='caution');
 const pending=auditors.some(a=>a.state==='pending');
 const state:CouncilState=blocked?'blocked':cautious?'review':pending?'collecting':'descriptive';
 const noteworthy=auditors.filter(a=>a.state==='blocked'||a.state==='caution')
  .map(a=>a.title+': '+a.evidence);
 let decision:string, nextQuestion:string;
 if(blocked){
  decision='Остановить объединённый вывод: проверить происхождение исследований. Итоги не объединяются.';
  nextQuestion='Совпадают ли замороженные гипотезы, временные отметки и источники?';
 }else if(cautious){
  decision='Есть возражения: не повышать статус гипотезы, продолжить отдельную проверку.';
  nextQuestion=auditors.find(a=>a.state==='caution')!.question;
 }else if(pending){
  decision='Сохранять гипотезу неизменной и собирать недостающие наблюдения.';
  nextQuestion=auditors.find(a=>a.state==='pending')!.question;
 }else{
  decision='Завершённые описательные проверки пока согласуются. Продолжить проверку в новых условиях.';
  nextQuestion='Какая ещё независимая по времени выборка может опровергнуть результат?';
 }
 const priorityGap=blocked&&p.directorFocus!=='integrity'||
  !blocked&&auditors[0].state==='caution'&&
   !['freshness','raw-quality','h1-coverage'].includes(p.directorFocus);
 return {protocol:'core-research-council-v1',state,auditors,noteworthy,decision,
  nextQuestion,priorityGap,reviewCount:auditors.filter(a=>a.state==='caution'||a.state==='blocked').length,
  readyCount:auditors.filter(a=>a.state==='descriptive').length,researchOnly:true};
}
