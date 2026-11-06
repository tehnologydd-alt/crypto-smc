/** APEX 4.9 - Read-only research quality passport.
 * The result is NOT a score, price forecast, trade recommendation or model calibration.
 * Combines pre-existing, prospectively captured reports without modifying their ledgers.
 */
import type {CoreResearchReport} from './core-research';
import type {HourTransitionReport} from './hour-transitions';
import type {HourHoldoutReport} from './hour-holdout';
import type {DriftReport} from './regime-drift';
import type {ContextAuditReport,ContextSubject} from './context-audit';

const THREE_DAYS=72*3_600_000;
export type QualityState='awaiting-evidence'|'observations-stale'|'needs-review'|'data-limited'|'descriptive-only';
export type QualityItemState='pending'|'caution'|'descriptive';
export type QualityItem={id:'capture'|'h1'|'holdout'|'drift'|'h4';state:QualityItemState;label:string;detail:string};
export type CoreQualityPassport={
 state:QualityState;title:string;subtitle:string;nextAction:string;
 items:QualityItem[];checksReady:number;checksTotal:number;
 flags:string[];registeredAt:number;lastObservedAt:number|null;
 studyAligned:boolean;
};
export type CoreQualityInputs={
 core:CoreResearchReport;
 transitions:HourTransitionReport;
 holdout:HourHoldoutReport;
 drift:DriftReport;
 context:ContextAuditReport;
 contextSubject?:ContextSubject;
};
const finite=(x:unknown):x is number=>typeof x==='number'&&Number.isFinite(x);
const str=(x:number|null)=>x===null?'нет':String(x);
const item=(id:QualityItem['id'],label:string,state:QualityItemState,detail:string):QualityItem=>
 ({id,label,state,detail});
export function coreQualityPassport(p:CoreQualityInputs,now=Date.now()):CoreQualityPassport{
 const flags:string[]=[];
 const core=p?.core,trans=p?.transitions,hold=p?.holdout,drift=p?.drift,ctx=p?.context;
 const registeredAt=finite(trans?.registeredAt)?trans.registeredAt:0;
 // Research freshness must come from prospective H1 evidence, not raw CORE polling.
 // A fresh raw market snapshot cannot repair a stalled or missing H1 study.
 const lastCandidates=[trans?.newestAt,hold?.latestToAt,drift?.lastObservedAt,ctx?.latestAt].filter((x):x is number=>finite(x)&&x>0&&x<=now);
 const lastObservedAt=lastCandidates.length?Math.max(...lastCandidates):null;
 const valid=finite(now)&&now>0&&registeredAt>0&&registeredAt<=now&&!!core&&!!trans&&!!hold&&!!drift&&!!ctx;
 const captureLimited=valid&&core.checks>=10&&core.partial/core.checks>0.3;
 const gapsLimited=valid&&trans.missingHours>=6&&trans.missingHours>trans.observations/2;
 const holdoutReady=valid&&hold.status==='observational-comparison'&&hold.futureEdges>=20&&hold.conditionDays>=3;
 const subject=ctx? p.contextSubject:undefined;
 const held=hold.frozen===true&&finite(hold.frozenAt)&&hold.frozenAt>0&&
  !!hold.from&&!!hold.expected;
 const same=(x:{frozenAt:number;from:string;expected:string}|null|undefined)=>
  !x||!!(held&&x.frozenAt===hold.frozenAt&&x.from===hold.from&&x.expected===hold.expected);
 const studyAligned=valid&&same(drift.subject)&&same(subject);
 const driftReady=valid&&studyAligned&&
  (drift.phase==='no-clear-decline'||drift.phase==='possible-decline');
 const contextReady=valid&&studyAligned&&
  (ctx.state==='context-dependent'||ctx.state==='no-clear-difference')&&ctx.qualified>=2;
 const driftConcern=driftReady&&drift.phase==='possible-decline';
 const contextConcern=contextReady&&ctx.state==='context-dependent';
 const trainingConcern=holdoutReady&&finite(hold.differenceToTraining)&&hold.differenceToTraining<=-25;
 const baselineConcern=holdoutReady&&finite(hold.differenceToBaseline)&&hold.differenceToBaseline<=-20;
 const stale=valid&&held&&lastObservedAt!==null&&now-lastObservedAt>THREE_DAYS;
 if(!studyAligned&&held)flags.push('Разные исследовательские гипотезы в журналах: сравнение заблокировано');
 if(captureLimited)flags.push('Слишком много неполных снимков CORE');
 if(gapsLimited)flags.push('Много пропущенных часов H1');
 if(driftConcern)flags.push('Частота перехода в новых наблюдениях заметно снизилась');
 if(contextConcern)flags.push('Результат различается между условиями H4');
 if(trainingConcern)flags.push('Новые наблюдения расходятся с обучающей выборкой');
 if(baselineConcern)flags.push('Частота ниже общего фона того же состояния');
 if(stale||drift.phase==='observations-stale')flags.push('Недостаточно свежих наблюдений для текущего вывода');
 const items:QualityItem[]=[
  item('capture','Данные CORE',!valid||core.checks===0?'pending':captureLimited?'caution':'descriptive',
   valid?str(core.complete)+' полных / '+str(core.checks)+' фактических проверок'+(captureLimited?' · частые неполные снимки':''):'Нет достоверных метаданных'),
  item('h1','Наблюдения H1',!valid||trans.transitions<20?'pending':gapsLimited?'caution':'descriptive',
   valid?str(trans.transitions)+' переходов подряд; пропущено часов: '+str(trans.missingHours):'Нет подтверждённых данных'),
  item('holdout','Будущая выборка',!held||!holdoutReady?'pending':trainingConcern||baselineConcern?'caution':'descriptive',
   !held?'Гипотеза ещё не заморожена':str(hold.futureEdges)+' новых переходов / '+str(hold.conditionDays)+' дней'+(holdoutReady?' · сравнение описательное':' · сбор продолжается')),
  item('drift','Стабильность',!driftReady?'pending':driftConcern?'caution':'descriptive',
   !driftReady?(drift.phase==='observations-stale'?'Наблюдения устарели':'Нет законченного сравнения периодов'):
    driftConcern?'Возможное ослабление частоты':'Выраженное снижение не обнаружено'),
  item('h4','Разные условия H4',!contextReady?'pending':contextConcern?'caution':'descriptive',
   !contextReady?'Подходящих контекстов: '+str(ctx.qualified)+'/2':
    contextConcern?'Заметное различие между H4-группами':'Заметного различия не выявлено')
 ];
 const checksReady=items.filter(x=>x.state!=='pending').length;
 let state:QualityState='awaiting-evidence',title='Исследование ещё формируется',subtitle='Нужна подтверждённая гипотеза и новые наблюдения.';
 let nextAction='Оставить сбор CORE включённым и накапливать полные наблюдения H1.';
 if(!valid){state='data-limited';title='Паспорт ожидает корректные данные';subtitle='Не все источники исследования доступны.';nextAction='Проверить полноту и сохранение данных CORE.';}
 else if(!held){state='awaiting-evidence';title='Гипотеза пока не зафиксирована';subtitle='Нельзя оценивать устойчивость до окончания первого этапа.';nextAction='Накопить необходимые H1-переходы для фиксации гипотезы.';}
 else if(!studyAligned){state='data-limited';title='Журналы исследования не согласованы';subtitle='Результаты относятся к разным зафиксированным гипотезам.';nextAction='Проверить целостность локальных исследовательских данных.';}
 else if(stale||drift.phase==='observations-stale'){state='observations-stale';title='Исследовательские данные устарели';subtitle='Текущую устойчивость пока определить нельзя.';nextAction='Проверить свежесть данных и работу фонового сбора CORE.';}
 else if(driftConcern||contextConcern||trainingConcern||baselineConcern){
  state='needs-review';title='Есть противоречия для проверки';subtitle='Несколько наблюдений не согласуются с ранней картиной или меняются по условиям.';
  nextAction='Продолжить независимую проверку на новых полных данных, не меняя замороженную гипотезу.';
 }else if(captureLimited||gapsLimited){
  state='data-limited';title='Качество наблюдений ограничено';subtitle='Пропуски и неполные снимки затрудняют оценку.';
  nextAction='Проверить устойчивость фонового сбора и наличие полного набора 5×3.';
 }else if(!holdoutReady||!driftReady||!contextReady||trans.transitions<20||core.complete<20){
  state='awaiting-evidence';title='Выводов пока недостаточно';subtitle='Не все независимые этапы собрали нужную выборку.';
  nextAction='Продолжить наблюдения: нужны завершённые выборки будущих переходов, периодов и H4-контекстов.';
 }else{
  state='descriptive-only';title='Наблюдения пока согласуются';subtitle='Предварительная согласованность без доказанной прогностической силы.';
  nextAction='Продолжить отслеживание других дней и условий; не считать текущие частоты гарантией.';
 }
 return {state,title,subtitle,nextAction,items,checksReady,checksTotal:items.length,
  flags,registeredAt,lastObservedAt,studyAligned};
}
