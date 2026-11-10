/**
 * APEX Shadow Explanation v1.
 * Human-readable, deterministic evidence interpretation, not AI confidence.
 * It uses only the frozen proposal and the verified forward-only monitor
 * from an opt-in, complete Room archive for one favorite.
 */
import {FEATURE_DEFINITIONS} from './forecast-feature-holdout.mjs';
import {inspectShadowProposal,SHADOW_RULES}
 from './forecast-shadow-forward.mjs';
import {SHADOW_MONITOR_VERSION,SHADOW_MONITOR_RULES}
 from './forecast-shadow-monitor.mjs';

export const SHADOW_EXPLANATION_VERSION='APEX_SHADOW_EXPLANATION_V1';

const featureScope=Object.freeze({
 sameRadar:{
  heading:'Радар выбранного таймфрейма',
  explanation:'Направление закрытых свечей и состояние рынка по этому ТФ, сохранённые на момент публикации. Нужен режим направленного движения.',
  evidence:'РАДАР: доступность и согласованность с исходным прогнозом',
  caveat:'Не является вторым независимым прогнозом: используется та же ценовая история.'
 },
 higherRadar:{
  heading:'Радар старшего таймфрейма',
  explanation:'Направление старшего ТФ из снимка, существовавшего при публикации сценария.',
  evidence:'РАДАР: согласование горизонтов, только при свежих данных',
  caveat:'Таймфреймы математически зависимы; их совпадение не удваивает вероятность.'
 },
 marketDay:{
  heading:'Суточная динамика Spot',
  explanation:'Знак доступного при публикации изменения цены за 24 часа.',
  evidence:'BINANCE SPOT: направление 24-часового изменения цены',
  caveat:'Это описание прошлой динамики, а не независимое подтверждение будущей.'
 },
 visibleDepth:{
  heading:'Публичный снимок стакана',
  explanation:'Направление видимого дисбаланса с заранее зафиксированным порогом 10%.',
  evidence:'BINANCE / BYBIT: ограниченная видимая глубина рынка',
  caveat:'Снимок не включает скрытую ликвидность и не доказывает движение цены.'
 }
});
const min=(x,n)=>Math.max(0,Math.min(n,Number.isSafeInteger(x)?x:0));
const number=n=>typeof n==='number'&&Number.isFinite(n);
const percentage=n=>number(n)?Math.round(n*1000)/10:null;
const safe=(s,fallback='Нет данных')=>typeof s==='string'&&s.length?s:fallback;
const empty=(state,why)=>({
 version:SHADOW_EXPLANATION_VERSION,state,
 headline:why,conclusion:null,evidence:null,requirements:[],
 warnings:[why],recommendedAction:'Не изменять модель. Проверить полноту исходных наблюдений.',
 eligibleForAutomaticTraining:false,forecastWeightsChanged:false,
 calibratedProbability:null
});
const integer=n=>Number.isSafeInteger(n)&&n>=0;
export function explainShadowEvidence(proposal,observation,monitor){
 const verification=inspectShadowProposal(proposal,{now:observation?.now});
 if(verification.state!=='VERIFIED'||!featureScope[proposal.featureId])
  return empty('INVALID','Недействительная или неподдерживаемая гипотеза.');
 if(monitor?.version!==SHADOW_MONITOR_VERSION||
  !['COLLECTING','LOW_COVERAGE','INVALID','INVALID_EVIDENCE','REVERSED',
    'WEAKENED','DRIFTING','UNSTABLE','REPEATED_OBSERVATION'].includes(monitor.state)||
  monitor.modelChanged!==false||monitor.readyToApply!==false||
  !integer(observation?.eligible)||!integer(observation?.decisive)||
  !integer(observation?.postRegistration)||observation.postRegistration<observation.eligible||
  !integer(observation?.invalid)||!integer(observation?.unavailable)||
  observation.proposal?.id!==proposal.id)
  return empty('INVALID','Нет проверенного результата полного исследовательского архива.');
 const type=featureScope[proposal.featureId];
 const early=monitor.reference||null;
 const later=monitor.recent||null;
 const matched=proposal.association==='MATCH_MORE_TP3';
 const perspective=matched?
  'При согласованном признаке исторически чаще наблюдался TP3.':
  'В исторической выборке TP3 чаще наблюдался без согласования этого признака.';
 const verdicts={
  COLLECTING:['Накопление данных','Пока нельзя заключить, помогает ли этот признак.'],
  LOW_COVERAGE:['Недостаточно источников','Сравнение заблокировано из-за пропущенных данных.'],
  INVALID:['Нужно проверить архив','Нельзя подтвердить причинную последовательность событий.'],
  INVALID_EVIDENCE:['Нужно проверить исходы Room','Некоторые события не имеют достоверного подтверждения.'],
  REVERSED:['Направление связи изменилось','На позднем участке наблюдается обратное историческое соотношение TP3 и SL.'],
  WEAKENED:['Связь ослабла','Поздняя выборка не подтверждает прежнее преимущество группы.'],
  DRIFTING:['Связь меняется','Величина различия между периодами нестабильна.'],
  UNSTABLE:['Неустойчивый результат','Связь пока проявилась только в одном из новых временных периодов.'],
  REPEATED_OBSERVATION:['Повторяется на новых данных','Описательное различие сохранилось в обеих новых частях истории.']
 };
 const [headline,conclusion]=verdicts[monitor.state];
 const window=v=>v&&integer(v.decisive)&&integer(v.finished)?{
  decisive:v.decisive,finished:v.finished,
  coverage:percentage(v.coverage),
  matchedTp3:v.supports?.tp3??null,
  matchedStop:v.supports?.stop??null,
  otherTp3:v.otherGroup?.tp3??null,
  otherStop:v.otherGroup?.stop??null,
  differencePp:number(v.gapPp)?Math.round(v.gapPp*10)/10:null,
  missing:v.unavailable??null,awaiting:v.awaiting??null,
  purged:(v.purged||0)+(v.lateRecorded||0)
 }:null;
 const req=[
  {key:'new',label:'Новые независимые публикации',
   done:min(observation.eligible,SHADOW_MONITOR_RULES.minPublished),
   required:SHADOW_MONITOR_RULES.minPublished},
  {key:'decisive',label:'Проверенные TP3/SL всего',
   done:min(observation.decisive,SHADOW_RULES.minDecisive),
   required:SHADOW_RULES.minDecisive},
  {key:'early',label:'Однозначные исходы раннего периода',
   done:min(early?.decisive,SHADOW_MONITOR_RULES.minDecisivePerWindow),
   required:SHADOW_MONITOR_RULES.minDecisivePerWindow},
  {key:'late',label:'Однозначные исходы позднего периода',
   done:min(later?.decisive,SHADOW_MONITOR_RULES.minDecisivePerWindow),
   required:SHADOW_MONITOR_RULES.minDecisivePerWindow}
 ];
 const warnings=[type.caveat,
  'Указанные количества не означают доказанную вероятность будущего результата.',
  'Статистика TP3/SL исключает другие исходы; доходность и исполнение ордеров не оцениваются.',
  'Новости, социальные сети и ончейн пока не проходят данную проверку направления.',
  'Алгоритм построения прогнозов и веса источников не изменяются.'];
 if(observation.invalid>0)
  warnings.unshift('Есть непроверенные исходы Room: вывод запрещён.');
 if(!later)warnings.unshift('Поздняя контрольная выборка ещё не сформирована.');
 const state=monitor.state;
 return {
  version:SHADOW_EXPLANATION_VERSION,state,headline,conclusion,
  feature:proposal.featureId,interval:proposal.interval,asset:proposal.asset,
  sourceTitle:type.heading,sourceExplanation:type.explanation,
  sourceEvidence:type.evidence,observedAssociation:perspective,
  expectedComparison:matched?'MATCH':'MISMATCH',
  sourceAsPublished:true,
  early:window(early),late:window(later),
  requirements:req,warnings,
  observationCount:observation.eligible,
  missingSources:observation.unavailable,
  inconclusive:observation.other+observation.awaiting,
  conflicts:state==='REVERSED'||state==='WEAKENED'||state==='DRIFTING'||state==='UNSTABLE',
  recommendedAction:state==='REPEATED_OBSERVATION'?
   'Сохранять гипотезу только в исследовательском режиме и проверять следующие наблюдения.':
   'Продолжить сбор проверенных наблюдений или изучить противоречия; рабочую модель не менять.',
  eligibleForAutomaticTraining:false,
  forecastWeightsChanged:false,calibratedProbability:null
 };
}
