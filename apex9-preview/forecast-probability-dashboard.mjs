/** On-demand audit presentation; no network requests or scheduled work. */
import {auditProbabilityReadiness} from './forecast-probability-readiness.mjs';
import {auditPreOutcomeStrength} from './forecast-preoutcome-strength.mjs';

const label={'15m':'M15','1h':'H1','4h':'H4'};
const element=(tag,klass='',value)=>{
 const n=document.createElement(tag);
 if(klass)n.className=klass;
 if(value!==undefined)n.textContent=String(value);
 return n;
};
const percent=n=>typeof n==='number'&&Number.isFinite(n)?
 (n*100).toFixed(1)+'%':'—';
const counts=s=>s?.outcomes||{};
export function renderProbabilityReadiness(archive,asset,slot,{now=Date.now()}={}){
 if(!slot)return null;
 slot.replaceChildren();
 const report=auditProbabilityReadiness(archive?.forecasts,{
  asset,complete:archive?.complete,
  publishedCount:archive?.publishedCount,now
 });
 if(!report.frames){
  slot.append(element('p','forecast-quality-warning',report.reason));
  return report;
 }
 for(const tf of ['15m','1h','4h']){
  const frame=report.frames[tf],box=element('section','forecast-probability-frame');
  box.append(element('strong','',label[tf]+
   ' · опубликовано '+frame.published),
   element('small','',frame.reason));
  if(!frame.total){slot.append(box);continue;}
  const summary=frame.total;
  const cards=element('div','forecast-probability-metrics');
  for(const [name,value] of [
   ['Проверено без пересечений',summary.verified],
   ['TP3 · конечный исход',summary.outcomes.TP3],
   ['SL · конечный исход',summary.outcomes.STOP],
   ['Прочие завершения',summary.outcomes.AMBIGUOUS+
    summary.outcomes.NOT_ENTERED+summary.outcomes.HORIZON],
   ['Ожидают',summary.awaiting],
   ['Исключено пересечений',summary.overlapExcluded]]){
   const tile=element('div','forecast-probability-metric');
   tile.append(element('span','',name),
    element('strong','',String(value)));
   cards.append(tile);
  }
  box.append(cards);
  const extra=element('details','forecast-probability-details');
  extra.append(element('summary','','Частота, временная проверка и ограничения'));
  const content=element('div','forecast-probability-detail-body');
  content.append(element('p','',
   'Однозначных исходов TP3/SL: '+summary.decisive+
   '. Исторические касания TP1–TP2 не приравниваются к TP3.'));
  if(frame.status==='FREQUENCY_OBSERVED'){
   const r=summary.indicativeWilson95;
   content.append(element('strong','',
    'Доля TP3 среди однозначных исходов: '+
    percent(summary.tp3OfDecisive)),
    element('p','',
    'Ориентировочный интервал Wilson 95%: '+
    percent(r?.lower)+' – '+percent(r?.upper)+
    '. Это не гарантия и не откалиброванная вероятность.'));
  }else{
   content.append(element('p','forecast-quality-warning',
    'Числовой вывод пока недоступен: '+frame.reason));
  }
  const periods=element('div','forecast-feature-periods');
  for(const [title,period] of [['Ранний период',frame.reference],
   ['Поздний период',frame.holdout]]){
   const part=element('div','forecast-feature-period');
   part.append(element('strong','',title));
   if(period){
    part.append(element('span','',
     'TP3: '+period.outcomes.TP3+' · SL: '+period.outcomes.STOP),
     element('span','',
      'Непересекающихся публикаций: '+period.verified),
     element('small','',
      'Других исходов: '+(period.resolved-period.decisive)+
      ' · ожиданий: '+period.awaiting+
      ' · поздних записей: '+period.lateOutcome));
   }else part.append(element('small','','Недостаточно истории'));
   periods.append(part);
  }
  content.append(periods,
   element('p','forecast-confluence-caveat',
    'Калибровка недоступна: текущий алгоритм не публикует проверенные '+
    'числовые вероятности до наступления исхода. Статус источника: '+
    (frame.calibration==='UNVERIFIED_SCORES'?
     'старые оценки не соответствуют проверенной схеме.':
     'вероятности не записывались.')),
   element('p','forecast-confluence-caveat',
    'Временное исключение пересечений снижает зависимость наблюдений, '+
    'но не устраняет зависимость рыночных событий.'));
  extra.append(content);box.append(extra);slot.append(box);
 }
 slot.append(element('p','forecast-confluence-caveat',report.note));
 const frozen=auditPreOutcomeStrength(archive?.forecasts,{
  asset,complete:archive?.complete,
  publishedCount:archive?.publishedCount,now});
 const section=element('details','forecast-probability-details forecast-strength-section');
 section.append(element('summary','',
  'Экспериментальный балл силы сигнала · до исхода · M15/H1/H4'));
 const body=element('div','forecast-probability-detail-body');
 if(!frozen.frames){
  body.append(element('p','forecast-quality-warning',frozen.reason));
 }else{
  body.append(element('p','forecast-confluence-caveat',
   'Это НЕ вероятность успеха. Число 0–100 вычисляется из закрытых '+
   'ценовых свечей и относительного объёма на момент публикации, '+
   'без подгонки по будущим результатам.'));
  for(const tf of ['15m','1h','4h']){
   const audit=frozen.frames[tf];
   const card=element('section','forecast-probability-frame');
   card.append(element('strong','',
    label[tf]+' · баллов до исхода: '+audit.precommitted),
    element('small','',audit.reason));
   const counts=element('div','forecast-probability-metrics');
   for(const [title,value] of [
    ['Старые без балла',audit.oldWithoutScore],
    ['Исходы TP3/SL',audit.total.decisive],
    ['Незавершённые',audit.total.unfinished],
    ['Без проверки',audit.total.unverified+audit.total.invalid],
    ['Исключены пересечения',audit.total.excludedOverlap],
    ['Поздний период TP3/SL',audit.late?.decisive??0]]){
    const item=element('div','forecast-probability-metric');
    item.append(element('span','',title),element('strong','',value));
    counts.append(item);
   }
   card.append(counts);
   const detail=element('details','forecast-probability-details');
   detail.append(element('summary','','Группы баллов и фактические исходы'));
   const inner=element('div','forecast-probability-detail-body');
   if(audit.state!=='DESCRIPTIVE'){
    inner.append(element('p','forecast-quality-warning',
     'Вывод о полезности балла пока запрещён: '+audit.reason));
   }
   for(const [name,cohort] of [
    ['Ранние новые',audit.reference],['Поздние новые',audit.late]]){
    inner.append(element('strong','',name));
    if(!cohort){
     inner.append(element('p','','Недостаточно новых оценок.'));
     continue;
    }
    const groups=element('div','forecast-feature-periods');
    for(const band of Object.values(cohort.bands)){
     const group=element('div','forecast-feature-period');
     group.append(element('strong','',
      'Балл '+band.label),
      element('span','',
       'TP3 '+band.tp3+' · SL '+band.stop),
      element('small','',
       'Закончено иначе: '+band.other+' · ожидает: '+band.unfinished));
     groups.append(group);
    }
    inner.append(groups);
   }
   detail.append(inner);card.append(detail);body.append(card);
  }
 }
 body.append(element('p','forecast-confluence-caveat',
  frozen.note||'Рабочая модель не меняется и новых вероятностей не создаёт.'));
 section.append(body);slot.append(section);
 return report;
}
