/** On-demand audit presentation; no network requests or scheduled work. */
import {auditProbabilityReadiness} from './forecast-probability-readiness.mjs';
import {auditPreOutcomeStrength} from './forecast-preoutcome-strength.mjs';
import {auditFeatureContribution} from './forecast-feature-ablation.mjs';
import {auditRollingFeatureEvidence} from './forecast-feature-rolling.mjs';
import {auditShadowChallengers} from './forecast-shadow-challengers.mjs';
import {auditShadowRegimes} from './forecast-shadow-regimes.mjs';
import {summarizeResearchDataQuality} from './forecast-data-quality-hub.mjs';
import {diagnoseQualityFactors,DIAGNOSTIC_LABELS}
 from './forecast-quality-diagnostics.mjs';
import {auditFeaturePairs} from './forecast-feature-pairs.mjs';
import {auditFeaturePairRegimes,summarizeFeatureStageTwo}
 from './forecast-feature-regime-review.mjs';
import {auditShadowProbabilityLearner}
 from './forecast-shadow-probability-learner.mjs';

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
export function renderProbabilityReadiness(archive,asset,slot,{
 now=Date.now(),onAudits=null
}={}){
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
 const contribution=auditFeatureContribution(archive?.forecasts,{
  asset,complete:archive?.complete,
  publishedCount:archive?.publishedCount,now});
 const ablation=element('details','forecast-probability-details forecast-strength-section');
 ablation.append(element('summary','',
  'Какие признаки действительно помогают? · независимая проверка'));
 const abody=element('div','forecast-probability-detail-body');
 if(!contribution.frames){
  abody.append(element('p','forecast-quality-warning',contribution.reason));
 }else{
  abody.append(element('p','forecast-confluence-caveat',
   'Метод: сравниваем различение TP3 и SL (AUC) у одного и того же '+
   'фиксированного балла с признаком и без него. На раннем и более позднем '+
   'участках, без обучения и пересчёта старых прогнозов.'));
  const stateLabel={
   REPEATED_ADDED_VALUE:'Наблюдаемое улучшение повторилось',
   NOT_REPEATED:'Раннее улучшение не повторилось',
   POSSIBLE_HARM:'Признак ухудшил различение на поздних данных',
   LATE_ONLY:'Улучшение только в поздней выборке',
   NO_ADDED_VALUE:'Дополнительная польза не подтверждена'
  };
  const formatAuc=value=>typeof value==='number'&&Number.isFinite(value)?
   value.toFixed(3):'—';
  const gain=value=>typeof value==='number'&&Number.isFinite(value)?
   (value>=0?'+':'')+value.toFixed(3):'—';
  for(const tf of ['15m','1h','4h']){
   const frame=contribution.frames[tf];
   const panel=element('section','forecast-probability-frame');
   panel.append(element('strong','',
    label[tf]+' · новых опубликованных баллов: '+frame.newScores),
    element('small','',frame.reason));
   const evidence=element('div','forecast-probability-metrics');
   for(const [name,value] of [
    ['Старые без балла',frame.oldWithoutScores],
    ['Ранние TP3/SL',frame.reference?.decisive??0],
    ['Поздние TP3/SL',frame.recent?.decisive??0],
    ['Ранние без объёма',frame.reference?.missingVolume??0],
    ['Поздние без объёма',frame.recent?.missingVolume??0],
    ['Непроверенные исходы',(
     (frame.reference?.invalid??0)+(frame.recent?.invalid??0)
    )]]){
    const tile=element('div','forecast-probability-metric');
    tile.append(element('span','',name),element('strong','',value));
    evidence.append(tile);
   }
   panel.append(evidence);
   if(frame.state==='DESCRIPTIVE'){
    for(const feature of frame.features){
     const item=element('div','forecast-feature-period');
     item.append(element('strong','',feature.label),
      element('small','',stateLabel[feature.state]||'Вывод недоступен'));
     const metrics=element('div','forecast-feature-periods');
     for(const [name,key] of [['Ранние','reference'],['Поздние','late']]){
      const col=element('div','forecast-feature-period');
      col.append(element('span','',
       name+' · ΔAUC '+gain(feature.deltaAuc[key])),
       element('small','',
        'AUC без: '+formatAuc(feature.withoutAuc[key])+
        ' · с признаком: '+formatAuc(feature.fullAuc[key])));
      metrics.append(col);
     }
     item.append(metrics,
      element('p','forecast-confluence-caveat',
       'Отдельный признак · AUC: '+
       formatAuc(feature.isolatedAuc.late)+
       '. Это оценка ранжирования, не вероятность.'));
     panel.append(item);
    }
   }else{
    panel.append(element('p','forecast-quality-warning',
     'Нет доказательной базы для вывода о полезности: '+frame.reason));
   }
   abody.append(panel);
  }
 }
 const repeat=auditRollingFeatureEvidence(archive?.forecasts,{
  asset,complete:archive?.complete,
  publishedCount:archive?.publishedCount,now});
 const follow=element('section','forecast-probability-frame');
 follow.append(element('strong','',
  'Устойчивость признаков · три последовательных периода'));
 if(!repeat.frames){
  follow.append(element('p','forecast-quality-warning',repeat.reason));
 }else{
  follow.append(element('small','',
   'Дополнительная проверка на новых данных: три независимые '+
   'по горизонту группы без подгонки весов.'));
  const readable={
   OBSERVED_IN_ALL_THREE:'Улучшение наблюдалось во всех трёх периодах',
   RECENT_DETERIORATION:'На последнем периоде признак ухудшил AUC',
   EARLIER_ONLY:'Раннее улучшение не повторилось',
   LATE_ONLY:'Улучшение есть только на последнем периоде',
   NO_REPEATED_VALUE:'Повторяющейся пользы не обнаружено'
  };
  const fmt=x=>typeof x==='number'&&Number.isFinite(x)?
   (x>=0?'+':'')+x.toFixed(3):'—';
  for(const tf of ['15m','1h','4h']){
   const window=repeat.frames[tf],tile=element('div','forecast-feature-period');
   tile.append(element('strong','',
    label[tf]+' · '+window.scored+' / 120 сохранённых баллов'),
    element('small','',window.reason));
   if(window.windows){
    const counters=element('div','forecast-feature-periods');
    for(let i=0;i<3;i++){
     const section=element('div','forecast-feature-period'),part=window.windows[i];
     section.append(element('span','','Период '+(i+1)),
      element('small','',
       'TP3 '+part.tp3+' · SL '+part.stop+
       ' · непроверенных '+part.invalid+
       ' · пропущено '+(part.purged+part.lateRecorded)));
     counters.append(section);
    }
    tile.append(counters);
   }
   if(window.state==='DESCRIPTIVE'){
    for(const feature of window.features){
     tile.append(element('strong','',feature.label),
      element('small','',readable[feature.state]||
       'Нет однозначного заключения'),
      element('span','',
       'ΔAUC: '+feature.deltaAuc.map(fmt).join(' / ')));
    }
   }
   follow.append(tile);
  }
 }
 follow.append(element('p','forecast-confluence-caveat',
  repeat.note||'Обучение и изменение прогнозов отключены.'));
 abody.append(follow);
 const challenge=auditShadowChallengers(archive?.forecasts,{
  asset,complete:archive?.complete,
  publishedCount:archive?.publishedCount,now});
 const arena=element('section','forecast-probability-frame');
 arena.append(element('strong','',
  'Shadow Challenger · три экспериментальные формулы'),
  element('small','',
   'Регистрация 11.11.2026, 00:00 UTC. Для сравнения учитываются только '+
   'опубликованные ПОСЛЕ неё прогнозы. Ни одна формула не используется '+
   'для изменения сценариев.'));
 if(!challenge.frames){
  arena.append(element('p','forecast-quality-warning',challenge.reason));
 }else{
  const labels={
   OBSERVED_THREE_TIMES:'Прирост AUC наблюдался в трёх периодах',
   RECENTLY_WORSE:'В последнем периоде AUC ниже контроля',
   NO_LONGER_BETTER:'Раннее улучшение не повторилось',
   LATE_ONLY:'Улучшение только в позднем периоде',
   NOT_BETTER:'Прирост AUC не подтверждён'
  };
  const df=n=>typeof n==='number'&&Number.isFinite(n)?
   (n>=0?'+':'')+n.toFixed(3):'—';
  for(const tf of ['15m','1h','4h']){
   const item=challenge.frames[tf];
   const group=element('div','forecast-feature-period');
   group.append(element('strong','',
    label[tf]+' · новых баллов после регистрации: '+
    item.newScored+' / 120'),
    element('small','',item.reason));
   if(item.windows){
    const measure=element('div','forecast-feature-periods');
    for(let i=0;i<3;i++){
     const x=item.windows[i],period=element('div','forecast-feature-period');
     period.append(element('span','','Период '+(i+1)),
      element('small','',
       'TP3 '+x.tp3+' · SL '+x.stop+
       ' · без данных '+(x.invalid+x.missingVolume)+
       ' · пересечения '+(x.overlap+x.purged)));
     measure.append(period);
    }
    group.append(measure);
   }
   if(item.state==='DESCRIPTIVE'){
    for(const challenger of item.models){
     const row=element('div','forecast-feature-period');
     row.append(element('strong','',challenger.name),
      element('small','',labels[challenger.state]||'Нет заключения'),
      element('span','',
       'ΔAUC с контролем: '+challenger.deltaAuc.map(df).join(' / ')));
     group.append(row);
    }
   }
   arena.append(group);
  }
 }
 arena.append(element('p','forecast-confluence-caveat',
  challenge.note||
   'Все альтернативы остаются исследовательскими.'));
 abody.append(arena);
 const regimes=auditShadowRegimes(archive?.forecasts,{
  asset,complete:archive?.complete,
  publishedCount:archive?.publishedCount,now});
 const modes=element('details',
  'forecast-probability-details forecast-shadow-regime-detail');
 modes.append(element('summary','',
  'В каких режимах рынка формулы работают лучше или хуже?'));
 const bodyMode=element('div','forecast-probability-detail-body');
 bodyMode.append(element('p','forecast-confluence-caveat',
  'Классификация берётся только из сохранённого до публикации Radar: '+
  'направленный рынок, боковик, смешанный режим. '+
  'Неизвестные или устаревшие состояния исключаются из оценки.'));
 if(!regimes.frames){
  bodyMode.append(element('p','forecast-quality-warning',regimes.reason));
 }else{
  const groupLabels={
   DIRECTIONAL:'Направленный рынок',RANGE:'Боковик',
   MIXED:'Смешанный режим'
  };
  const modelLabels={
   OBSERVED_THREE_TIMES:'Описательный прирост на трёх периодах',
   RECENTLY_WORSE:'Ухудшение на последнем периоде',
   NO_LONGER_BETTER:'Ранний прирост не повторился',
   LATE_ONLY:'Прирост только на последнем периоде',
   NOT_BETTER:'Прирост AUC не обнаружен'
  };
  const pct=x=>typeof x==='number'&&Number.isFinite(x)?
   (x*100).toFixed(0)+'%':'—';
  const fmt=x=>typeof x==='number'&&Number.isFinite(x)?
   (x>=0?'+':'')+x.toFixed(3):'—';
  for(const tf of ['15m','1h','4h']){
   const frame=regimes.frames[tf],panel=element('section','forecast-probability-frame');
   panel.append(element('strong','',
    label[tf]+' · снимков для исследования: '+frame.newScored),
    element('small','',frame.reason));
   if(frame.windows){
    const cover=element('div','forecast-feature-periods');
    for(let i=0;i<frame.windows.length;i++){
     const part=frame.windows[i];
     const box=element('div','forecast-feature-period');
     box.append(element('strong','','Период '+(i+1)),
      element('span','','Radar: '+part.radarObserved+'/'+part.eligible+
       ' · '+pct(part.coverage)),
      element('small','',
       'Нет: '+part.missing+' · устарело: '+part.stale+
       ' · ошибки: '+part.invalid));
     cover.append(box);
    }
    panel.append(cover);
   }
   if(frame.regimes){
    for(const [mode,labelName] of Object.entries(groupLabels)){
     const regime=frame.regimes[mode];
     const details=element('details','forecast-probability-details');
     details.append(element('summary','',labelName+' · '+regime.state));
     const body=element('div','forecast-probability-detail-body');
     body.append(element('p','forecast-confluence-caveat',regime.reason));
     const counts=element('div','forecast-feature-periods');
     for(let i=0;i<(regime.windows?.length||0);i++){
      const count=regime.windows[i],item=element('div','forecast-feature-period');
      item.append(element('strong','','Период '+(i+1)),
       element('span','','TP3 '+count.tp3+' · SL '+count.stop),
       element('small','','Всего в режиме: '+count.eligible));
      counts.append(item);
     }
     body.append(counts);
     if(regime.state==='DESCRIPTIVE'){
      for(const item of regime.models){
       body.append(element('strong','',item.name),
        element('small','',modelLabels[item.state]||'Без заключения'),
        element('span','',
         'ΔAUC к контролю: '+item.deltaAuc.map(fmt).join(' / ')));
      }
     }
     details.append(body);panel.append(details);
    }
   }
   bodyMode.append(panel);
  }
 }
 bodyMode.append(element('p','forecast-confluence-caveat',
  regimes.note||'Нет оснований изменять действующую модель.'));
 modes.append(bodyMode);abody.append(modes);
 abody.append(element('p','forecast-confluence-caveat',
  contribution.note||'Прогнозы, веса и исходы не менялись.'));
 ablation.append(abody);slot.append(ablation);
 const quality=summarizeResearchDataQuality(archive,{
  asset,now,reports:{probability:report,strength:frozen,
   ablation:contribution,rolling:repeat,challenger:challenge,
   regimes}
 });
 const qualityRoot=element('section','forecast-data-quality-hub');
 qualityRoot.append(element('strong','',
  'Качество исследовательских данных · '+asset));
 if(!quality.frames){
  qualityRoot.append(element('p','forecast-quality-warning',quality.reason));
 }else{
  qualityRoot.append(element('p','forecast-confluence-caveat',
   'По каждому таймфрейму: что уже можно проверить, каких наблюдений '+
   'не хватает и какие источники были доступны при публикации.'));
  const sourceLabels={
   market:'Рынок Spot',liquidity:'Стакан',
   onchain:'Ончейн',news:'Новости',macro:'Макро',social:'Соцсети'
  };
  const tfLabels={'15m':'M15','1h':'H1','4h':'H4'};
  const gateLabels={
   published:'Публикации',decisive:'Проверенные TP3/SL',
   lateDecisive:'Поздние TP3/SL',
   futureScored:'Новые баллы Shadow'
  };
  const proportion=(a,b)=>b>0?
   (a*100/b).toFixed(0)+'%':'—';
  for(const tf of ['15m','1h','4h']){
   const item=quality.frames[tf];
   const part=element('div','forecast-data-quality-frame');
   part.append(element('strong','',tfLabels[tf]+' · '+item.reason),
    element('p','',item.nextAction));
   const cells=element('div','forecast-probability-metrics');
   for(const required of item.readiness){
    const tile=element('div','forecast-probability-metric');
    tile.append(element('span','',gateLabels[required.key]),
     element('strong','',
      required.observed+' / '+required.required));
    cells.append(tile);
   }
   part.append(cells);
   const feedBox=element('details','forecast-probability-details');
   feedBox.append(element('summary','',
    'Сохранённые источники · полнота и возраст данных'));
   const feedBody=element('div','forecast-probability-detail-body');
   const snapshot=item.source;
   feedBody.append(element('p','forecast-confluence-caveat',
    'Проверенные снимки при публикации: '+
    snapshot.verifiedSnapshots+' / '+snapshot.published+
    ' · без старого формата: '+snapshot.legacySnapshots+
    ' · ошибки: '+snapshot.invalidSnapshots));
   const feedList=element('div','forecast-data-quality-feeds');
   for(const [source,counts] of [
    ['Радар '+tfLabels[tf],snapshot.ownRadar],
    ...Object.entries(snapshot.feeds).map(([key,c])=>[
     sourceLabels[key]||key,c])
   ]){
    const row=element('div','forecast-data-quality-feed');
    row.append(element('strong','',source),
     element('span','',
      'Свежие '+counts.OBSERVED+' / '+snapshot.published+
      ' · '+proportion(counts.OBSERVED,snapshot.published)),
     element('small','',
      'Устарели: '+counts.STALE+' · отсутствуют: '+
      counts.MISSING+' · ошибки: '+counts.INVALID));
    feedList.append(row);
   }
   feedBody.append(feedList,
    element('p','forecast-confluence-caveat',
     'Это доступность источников на момент публикации прогнозов. '+
     'Отсутствующий снимок не означает, что API отключён сейчас.'));
   feedBox.append(feedBody);part.append(feedBox);
   qualityRoot.append(part);
  }
 }
 qualityRoot.append(element('p','forecast-confluence-caveat',
  quality.note||'Исследование доступно только в полном локальном Room-архиве.'));
 const pairs=auditFeaturePairs(archive?.forecasts,{
  asset,complete:archive?.complete,publishedCount:archive?.publishedCount,
  now,challenge
 });
 const pairPanel=element('details','forecast-quality-pairs');
 pairPanel.append(element('summary','',
  'Сочетания признаков · повторение, дублирование и спад'));
 const pairBody=element('div','forecast-quality-pairs-body');
 pairBody.append(element('p','forecast-confluence-caveat',
  'Три фиксированные пары, три новых непересекающихся периода. '+
  'ΔAUC к лучшему отдельному признаку на тех же исходах.'));
 for(const tf of ['15m','1h','4h']){
  const frame=pairs.frames?.[tf],section=element('section',
   'forecast-quality-pairs-frame');
  section.append(element('strong','',
   label[tf]+' · '+(frame?.state||pairs.state)));
  if(frame?.state==='DESCRIPTIVE'){
   for(const pair of frame.pairs){
    const box=element('div','forecast-quality-pair');
    box.append(element('b','',pair.label),
     element('small','',
      ({REPEATED_ADDITION:'Добавляет различение в трёх периодах',
       OVERLAPPING:'Сильно пересекаются · прирост не выявлен',
       RECENT_SETBACK:'На новом периоде сочетание хуже',
       EARLY_ONLY:'Ранний результат не повторился',
       LATEST_ONLY:'Прирост только в новом периоде',
       NO_REPEATED_ADDITION:'Повторяющегося прироста нет'})[pair.state]));
    const vals=pair.periods.map(x=>
     (x.gain>=0?'+':'')+x.gain.toFixed(3)).join(' / ');
    box.append(element('small','','ΔAUC: '+vals));
    section.append(box);
   }
  }else section.append(element('small','',
   frame?.reason||pairs.reason));
  pairBody.append(section);
 }
 pairBody.append(element('small','forecast-confluence-caveat',
  pairs.note||'Неполный архив не позволяет сравнить признаки.'));
 pairPanel.append(pairBody);
 const pairRegimes=auditFeaturePairRegimes(archive?.forecasts,{
  asset,complete:archive?.complete,publishedCount:archive?.publishedCount,
  now,challenge,pairs,regimes
 });
 const stage2=summarizeFeatureStageTwo(asset,pairs,pairRegimes);
 const stagePanel=element('section','forecast-quality-stage2');
 stagePanel.append(element('strong','',
  'Этап 2 из 5 · исследование сочетаний признаков'));
 stagePanel.append(element('p','',
  'Проверено '+stage2.checkedFrames+' / 3 таймфреймов · '+
  'состояние исходов: '+stage2.state+
  '. Готовность к оценке не означает, что модель обучилась.'));
 const reviewBody=element('details','forecast-probability-details');
 reviewBody.append(element('summary','','Повторяемость пар по рыночным режимам'));
 const reviewContent=element('div','forecast-quality-pairs-body');
 for(const tf of ['15m','1h','4h']){
  const item=pairRegimes.frames?.[tf];
  const panel=element('section','forecast-quality-pairs-frame');
  panel.append(element('strong','',label[tf]+' · '+
   (item?.state||pairRegimes.state)+
   ' · режимов с проверкой: '+(item?.availableModes||0)+'/3'));
  if(item?.state==='DESCRIPTIVE'){
   for(const p of item.pairs){
    const line=element('div','forecast-quality-pair');
    line.append(element('b','',p.label),
     element('small','',
      ({REPEATED_TWO_MODES:'Повторение в двух режимах (описательно)',
       CONFLICTING_REGIMES:'Противоречие: в одном режиме результат ухудшился',
       LIMITED_SUPPORT:'Поддержка только в части режимов',
       NO_REPEATED_GAIN:'Повторение преимущества не найдено',
       NEED_TWO_MODES:'Нужно больше проверенных режимов'})[p.state]),
     element('small','',
      'Проверено режимов: '+p.comparableModes+
      ' · с повторением: '+p.supportingModes.length));
    panel.append(line);
   }
  }else panel.append(element('small','',item?.reason||pairRegimes.reason));
  reviewContent.append(panel);
 }
 reviewContent.append(element('p','forecast-confluence-caveat',
  pairRegimes.note||
   'Без трёх проверенных периодов APEX не делает выводов по режимам.'));
 reviewBody.append(reviewContent);stagePanel.append(reviewBody);
 pairBody.prepend(stagePanel);
 const shadowLearner=auditShadowProbabilityLearner(archive?.forecasts,{
  asset,complete:archive?.complete,publishedCount:archive?.publishedCount,now
 });
 const learned=document.createElement('details');
 learned.className='forecast-shadow-learned';
 learned.append(element('summary','',
  'Этап 3 из 5 · теневая обучаемая модель и контрольные периоды'));
 const learnedBody=element('div','forecast-shadow-learned-body');
 learnedBody.append(element('p','forecast-confluence-caveat',
  'Экспериментальная логистическая модель, только вручную. '+
  'Ранние 120 прогнозов — обучение, следующие 40 — проверка, '+
  'ещё два блока по 40 — независимые контрольные периоды. '+
  'Без автоматического применения к прогнозам.'));
 for(const tf of ['15m','1h','4h']){
  const f=shadowLearner.frames?.[tf];
  const pane=element('section','forecast-shadow-learned-frame');
  pane.append(element('strong','',label[tf]+' · '+
   (f?.state||shadowLearner.state)));
  pane.append(element('small','',
   f?.reason||shadowLearner.reason));
  pane.append(element('small','',
   'Новых проверенных признаков: '+(f?.scored||0)+
   ' / '+(f?.required||240)));
  if(f?.state==='EVALUATED'){
   pane.append(element('strong','',
    'Только исследование · '+f.verdict));
   const metrics=element('div','forecast-shadow-learned-metrics');
   for(const [name,test] of [['Проверка',f.validation],
    ['Контроль 1',f.holdouts[0]],['Контроль 2',f.holdouts[1]]]){
    const row=element('div','forecast-quality-pair');
    row.append(element('b','',name+' · '+test.sampleCount+' исходов'),
     element('small','','Brier '+test.brier.toFixed(3)+
      ' · контроль '+test.baselineBrier.toFixed(3)),
     element('small','','ΔBrier к базовой частоте '+
      (test.brierGain>=0?'+':'')+test.brierGain.toFixed(3)+
      ' · AUC '+test.auc.toFixed(3)));
    metrics.append(row);
   }
   pane.append(metrics,element('small','',
    'Это доля TP3 среди подтверждённых TP3/SL, '+
    'не прогноз прибыли и не калиброванная уверенность.'));
  }
  learnedBody.append(pane);
 }
 learnedBody.append(element('p','forecast-confluence-caveat',
  shadowLearner.note||'Недостаточно проверенных данных.'));
 learned.append(learnedBody);
 const diagnosis=diagnoseQualityFactors({asset,quality,challenge,regimes});
 const diagnosticRoot=element('details','forecast-quality-diagnostics');
 diagnosticRoot.append(element('summary','',
  'Что могло повлиять на качество? · диагностика факторов'));
 const diagnosticBody=element('div','forecast-quality-diagnostics-body');
 diagnosticBody.append(element('p','forecast-confluence-caveat',
  'Факторы для исследования, а не доказанные причины.'));
 if(!diagnosis.frames)
  diagnosticBody.append(element('p','forecast-quality-warning',
   'Недоступна согласованная полная проверка архива.'));
 else for(const tf of ['15m','1h','4h']){
  const frame=diagnosis.frames[tf];
  const part=element('div','forecast-quality-diagnostics-frame');
  part.append(element('strong','',label[tf]+' · '+frame.state));
  for(const code of frame.codes)
   part.append(element('span','',DIAGNOSTIC_LABELS[code]));
  part.append(element('small','',
   'Следующая проверка: '+frame.nextAction));
  diagnosticBody.append(part);
 }
 diagnosticBody.append(element('p','forecast-confluence-caveat',
  diagnosis.note||'Ни одна формула не изменяется.'));
 diagnosticRoot.append(diagnosticBody);
 slot.prepend(learned,diagnosticRoot,pairPanel,qualityRoot);
 // Reuse already computed independent audits in the explicit manual workflow;
 // avoid repeating three full 1500-row passes on a slow Android device.
 if(typeof onAudits==='function')onAudits({challenge,regimes,diagnostics:diagnosis,pairs,pairRegimes,stage2,shadowLearner});
 return report;
}
