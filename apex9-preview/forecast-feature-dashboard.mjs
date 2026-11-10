/**
 * Explicit user-initiated full-archive research audit.
 * One selected favorite per run: never auto-download all favorite archives
 * or silently promote associations to trading signals.
 */
import {getMobileAssetResearchArchive,registerMobileShadowCandidate,
 getMobileShadowCandidates} from './mobile-bridge.mjs';
import {analyzeForecastFeatureHoldout} from './forecast-feature-holdout.mjs';
import {assessFeatureStability} from './forecast-feature-stability.mjs';
import {canDraftShadow,inspectShadowProposal,evaluateShadowProposal}
 from './forecast-shadow-forward.mjs';
import {assessShadowTemporalMonitor} from './forecast-shadow-monitor.mjs';
import {explainShadowEvidence} from './forecast-shadow-explanation.mjs';
import {renderProbabilityReadiness} from './forecast-probability-dashboard.mjs';

const get=id=>document.getElementById(id);
const node=(tag,klass='',value='')=>{
 const n=document.createElement(tag);
 if(klass)n.className=klass;
 if(value!==undefined)n.textContent=String(value);
 return n;
};
const pct=x=>typeof x==='number'&&Number.isFinite(x)?
 (100*x).toFixed(1)+'%':'—';
const pp=x=>typeof x==='number'&&Number.isFinite(x)?
 (x>0?'+':'')+x.toFixed(1)+' п.п.':'—';
const name={'15m':'M15','1h':'H1','4h':'H4'};
const counts=arm=>arm.tp3+' TP3 / '+arm.stop+' SL';
export function initFeatureHoldoutDashboard({getFavorites}={}){
 const select=get('feature-holdout-asset'),button=get('feature-holdout-run'),
  status=get('feature-holdout-status'),root=get('feature-holdout-report');
 if(!select||!button||!status||!root)return {refresh(){}};
 let running=false,serial=0;
 function refresh(){
  const raw=typeof getFavorites==='function'?getFavorites():[];
  const favorites=[...new Set((Array.isArray(raw)?raw:[])
   .filter(x=>typeof x==='string'&&/^[A-Z0-9]{5,20}$/.test(x)))].slice(0,10);
  const old=select.value;
  const current=[...select.options].map(x=>x.value);
  if(current.join('|')!==favorites.join('|')){
   select.replaceChildren();
   for(const asset of favorites){
    const opt=document.createElement('option');
    opt.value=asset;opt.textContent=asset;select.append(opt);
   }
   if(favorites.includes(old))select.value=old;
   root.replaceChildren();
   get('feature-shadow-content')?.replaceChildren();
   if(get('feature-shadow-status'))
    get('feature-shadow-status').textContent='';
   status.textContent=favorites.length?
    'Для проверки выберите актив и запустите аудит полного архива.':
    'Добавьте актив в избранное, чтобы исследовать его историю.';
   serial++;
  }
  button.disabled=running||!favorites.length;
 }
 function oneArm(label,arm){
  const box=node('div','forecast-feature-arm');
  box.append(node('span','',label),
   node('strong','',counts(arm)),
   node('small','',pct((arm.tp3+arm.stop)>0?
    arm.tp3/(arm.tp3+arm.stop):null)));
  return box;
 }
 function render(report){
  root.replaceChildren();
  const quality=assessFeatureStability(report);
  if(!report.frames){
   root.append(node('p','forecast-quality-warning',
    report.reason||'Полная история недоступна.'));
   return;
  }
  for(const tf of ['15m','1h','4h']){
   const r=report.frames[tf],panel=node('section','forecast-feature-frame');
   panel.append(node('strong','forecast-feature-title',
    name[tf]+' · '+r.published+' опубликовано'));
   if(!r.reference||!r.holdout){
    panel.append(node('p','forecast-confluence-caveat',
     r.reason||'Недостаточно опубликованных событий'));
    root.append(panel);continue;
   }
   const metadata=node('div','forecast-feature-periods');
   for(const [title,s] of [['Опорный 60%',r.reference],
    ['Контрольный 40%',r.holdout]]){
    const sub=node('div','forecast-feature-period');
    sub.append(node('strong','',title),
     node('span','','Без пересечений: '+s.counters.nonoverlap),
     node('span','','Однозначных TP3/SL: '+s.counters.decisive),
     node('small','',
      'Другие исходы: '+s.counters.other+' · ожидание: '+
      s.counters.awaiting));
    metadata.append(sub);
   }
   panel.append(metadata,node('p','forecast-feature-reasons',
    'Исключено из опорного периода из-за пересечения: '+r.purged+
    '. Граница контроля: '+new Date(r.splitAt).toLocaleDateString('ru-RU')+'.'));
   const choices=node('div','forecast-feature-results');
   let comparable=0;
   for(const f of r.features){
    const item=node('details','forecast-feature-item');
    const summary=node('summary','',f.label);
    item.append(summary);
    if(f.state!=='DESCRIPTIVE'){
     item.append(node('p','forecast-confluence-caveat',
      'Недостаточно наблюдений: требуется не менее 12 TP3/SL '+
      'в каждой группе на обоих периодах.'));
    }else{
     comparable++;
     item.classList.add('is-descriptive');
     item.append(node('div','forecast-feature-periods',
      'Разница долей TP3 · опорный: '+pp(f.referenceGapPp)+
      ' · контрольный: '+pp(f.holdoutGapPp)));
    }
    for(const [label,s] of [['Опорный период',f.reference],
     ['Контрольный период',f.holdout]]){
     const part=node('div','forecast-feature-contrast');
     part.append(node('strong','',label),
      oneArm('Совпало',s.yes),
      oneArm('Не совпало',s.no),
      node('small','','Без измерения: '+s.unavailable));
     item.append(part);
    }
    choices.append(item);
   }
   panel.append(node('p','forecast-confluence-caveat',
    comparable?'Сопоставимых признаков: '+comparable+' из '+r.features.length+
     '. Это историческая ассоциация, не доказательство улучшения.':
     'Пока ни один признак не прошёл порог достаточности обеих выборок.'));
   panel.append(choices);
   const check=quality.frames?.[tf];
   const stability=node('details','forecast-feature-stability');
   const findings=check?.features?.filter(f=>f.state==='REPEATED')||[];
   stability.append(node('summary','',
    'Устойчивость на трёх периодах · '+findings.length+
    '/4 повторяющихся наблюдений'));
   stability.append(node('p','forecast-confluence-caveat',
    'Опорный 60% · проверочный A 20% · проверочный Б 20%. '+
    'Каждый участок очищен от пересекающихся сценариев. '+
    'Совпадение не доказывает прогнозируемость.'));
   if(!check?.features?.length)
    stability.append(node('p','forecast-quality-warning',
     check?.reason||'Недостаточно истории для проверки устойчивости.'));
   else {
    const descriptions={
     REPEATED:'Повторяется описательно · дополнительная проверка нужна',
     CONFLICTING:'Направление связи меняется',
     DRIFTING:'Связь неустойчива по величине',
     WEAK:'Слабое различие между группами',
     LOW_COVERAGE:'Не хватает сохранённых источников',
     INSUFFICIENT:'Недостаточно проверенных исходов'
    };
    for(const candidate of check.features){
     const item=node('div','forecast-feature-stability-row');
     item.append(node('strong','',candidate.label),
      node('span','',descriptions[candidate.state]||
       'Нельзя сделать вывод'));
     const observations=node('small','',
      'Ранний '+pp(candidate.reference?.differencePp)+
      ' · A '+pp(candidate.validation?.differencePp)+
      ' · Б '+pp(candidate.confirmation?.differencePp));
     item.append(observations);
     stability.append(item);
    }
   }
   stability.append(node('p','forecast-confluence-caveat',
    'Изменения весов прогноза и автоматическое обучение отключены.'));
   panel.append(stability);
   root.append(panel);
  }
  root.append(node('p','forecast-confluence-caveat',
   report.note||'Никакие результаты не используются для новых прогнозов.'));
 }
 async function renderShadowState(asset,archive,holdout,token){
  const slot=get('feature-shadow-content'),label=get('feature-shadow-status');
  if(!slot||!label||token!==serial)return;
  slot.replaceChildren();
  label.textContent='Проверяем зарегистрированные в Room гипотезы…';
  const found=await getMobileShadowCandidates(asset);
  if(token!==serial||select.value!==asset)return;
  if(!found.native||found.error){
   label.textContent=found.error||
    'Этот раздел доступен в Android APK с локальным Room v5.';
   return;
  }
  const stability=assessFeatureStability(holdout);
  const existing=found.proposals;
  const taken=new Set(existing.map(x=>x.interval+':'+x.featureId));
  let available=0;
  for(const frame of ['15m','1h','4h']){
   const stable=stability.frames?.[frame];
   for(const feature of stable?.features||[]){
    if(feature.state!=='REPEATED'||taken.has(frame+':'+feature.id))continue;
    const mostRecent=Math.max(...archive.forecasts.map(x=>x.publishedAt));
    const draft=canDraftShadow(holdout,stability,{
     asset,frame,featureId:feature.id,now:Date.now(),
     latestPublishedAt:mostRecent});
    if(draft.state!=='READY')continue;
    available++;
    const box=node('div','forecast-feature-stability-row');
    const tf=frame==='15m'?'M15':frame==='4h'?'H4':'H1';
    box.append(node('strong','',tf+' · '+feature.label),
     node('span','','Повторение в старой истории · только исследовательская гипотеза'));
    const save=node('button','forecast-feature-register',
     'Зафиксировать кандидата в Room');
    save.type='button';
    save.addEventListener('click',async()=>{
     if(token!==serial||select.value!==asset||
      !getFavorites?.().includes(asset)||save.disabled)return;
     save.disabled=true;
     label.textContent='Сверяем локальный журнал и фиксируем гипотезу…';
     const result=await registerMobileShadowCandidate(draft.evidence);
     if(token!==serial)return;
     if(result.error){
      label.textContent='Не сохранено: '+result.error;
      save.disabled=false;
      return;
     }
     label.textContent=result.created?
      'Исследовательский кандидат сохранён в Room.':
      'Такой кандидат уже зарегистрирован.';
     await renderShadowState(asset,archive,holdout,token);
    });
    box.append(save);slot.append(box);
   }
  }
  for(const proposal of existing){
   const check=inspectShadowProposal(proposal);
   const card=node('div','forecast-feature-stability-row');
   const title=proposal.interval==='15m'?'M15':
    proposal.interval==='4h'?'H4':'H1';
   card.append(node('strong','',
    title+' · '+(proposal.featureId||'неизвестный признак')),
    node('small','',
     'Room · '+(Number.isSafeInteger(proposal.registeredAt)?
      new Date(proposal.registeredAt).toLocaleString('ru-RU'):'некорректная дата')));
   if(check.state!=='VERIFIED'){
    card.append(node('span','forecast-quality-warning',
     'Запись повреждена: '+check.reason));slot.append(card);continue;
   }
   const observation=evaluateShadowProposal(proposal,archive.forecasts,{
    asset,complete:archive.complete,publishedCount:archive.publishedCount,
    now:Date.now()});
   card.append(node('span','',
    observation.state==='DESCRIPTIVE'?
     'Получены новые наблюдения · описательная проверка':
     'Сбор новых наблюдений · без итогового вывода'));
   card.append(node('small','',
    'Новые после защитного периода: '+(observation.postRegistration||0)+
    ' · непересекающиеся: '+observation.eligible+
    ' · TP3/SL: '+observation.decisive));
   card.append(node('small','',
    'Группа кандидата: '+observation.positive.tp3+' TP3 / '+
    observation.positive.stop+' SL · остальные: '+
    observation.negative.tp3+' TP3 / '+observation.negative.stop+' SL'));
   card.append(node('small','',
    'Источник недоступен: '+observation.unavailable+
    ' · ожидание: '+observation.awaiting+
    ' · неоднозначное/иное: '+observation.other));
   card.append(node('small','',observation.reason||
    'Автоматическое применение всегда отключено.'));
   const monitor=assessShadowTemporalMonitor(observation);
   const labels={
    REPEATED_OBSERVATION:'Историческая связь повторяется на новых данных',
    REVERSED:'Внимание: связь поменяла направление',
    WEAKENED:'Внимание: связь ослабла',
    DRIFTING:'Связь нестабильна по величине',
    UNSTABLE:'Связь не подтверждена в обоих периодах',
    LOW_COVERAGE:'Недостаточно подтверждённых источников',
    COLLECTING:'Продолжается сбор независимых наблюдений',
    INVALID:'Исследование требует проверки исходных данных',
    INVALID_EVIDENCE:'Исходные данные содержат несогласованные события'
   };
   card.append(node('strong','forecast-shadow-monitor-status',
    'Проверка новых периодов: '+(labels[monitor.state]||'Нет заключения')));
   const evidenceBox=node('div','forecast-feature-periods');
   for(const [title,slice] of [['Ранние новые',monitor.reference],
    ['Последние новые',monitor.recent]]){
    const part=node('div','forecast-feature-period');
    part.append(node('strong','',title));
    if(slice){
     part.append(node('span','',
      'Проверенные TP3/SL: '+slice.decisive),
      node('span','','Разница групп: '+pp(slice.gapPp)),
      node('small','',
       'Нет источника: '+slice.unavailable+
       ' · ожидание: '+slice.awaiting+
       ' · исключено: '+(slice.purged+slice.lateRecorded)));
    }else part.append(node('span','','Ожидаем новые наблюдения'));
    evidenceBox.append(part);
   }
   card.append(evidenceBox,
    node('small','forecast-confluence-caveat',
     monitor.reason+' Никакие веса и прогнозы не изменяются.'));
   const explanation=explainShadowEvidence(proposal,observation,monitor);
   const why=node('details','forecast-shadow-explanation');
   why.append(node('summary','','Почему такой вывод · источник и данные'));
   const body=node('div','forecast-shadow-explanation-body');
   body.append(node('strong','',explanation.headline),
    node('p','',explanation.conclusion||'Нет подтверждённого заключения.'));
   if(explanation.sourceTitle){
    body.append(node('strong','',explanation.sourceTitle),
     node('p','',explanation.sourceExplanation),
     node('small','',explanation.observedAssociation));
   }
   if(explanation.requirements?.length){
    const list=node('div','forecast-shadow-requirements');
    for(const requirement of explanation.requirements){
     const item=node('div','forecast-shadow-requirement');
     const label=node('span','',requirement.label);
     const value=node('strong','',
      requirement.done+' / '+requirement.required);
     item.append(label,value);list.append(item);
    }
    body.append(node('strong','','Сколько ещё нужно собрать'),list);
   }
   for(const warning of explanation.warnings||[]){
    body.append(node('p','forecast-confluence-caveat',warning));
   }
   body.append(node('small','',
    explanation.recommendedAction||
     'Нет оснований изменять действующую исследовательскую модель.'));
   why.append(body);card.append(why);
   slot.append(card);
  }
  label.textContent='Room: '+existing.length+
   ' зарегистрированных · '+available+' доступных для регистрации. '+
   'Все результаты только исследовательские.';
 }
 button.addEventListener('click',async()=>{
  if(running)return;
  refresh();
  const asset=select.value;
  if(!asset||!getFavorites?.().includes(asset))return;
  running=true;button.disabled=true;root.replaceChildren();
  const token=++serial;
  status.textContent='Читаем исходные записи Room '+asset+'…';
  try{
   const archive=await getMobileAssetResearchArchive(asset,{
    pageSize:75,maxRows:1500,
    onProgress:(loaded,total)=>{
     if(token===serial)status.textContent=
      'Проверяем архив '+asset+': '+loaded+' / '+total;
    }});
   if(token!==serial||!getFavorites?.().includes(asset))return;
   if(!archive.native||archive.error||archive.complete!==true){
    status.textContent='Аудит не выполнен: полный архив недоступен.';
    root.append(node('p','forecast-quality-warning',
     archive.error||'Достигнут лимит чтения 1500 записей или история неполная.'));
    return;
   }
   const report=analyzeForecastFeatureHoldout(archive.forecasts,{
    asset,complete:archive.complete,
    publishedCount:archive.publishedCount,now:Date.now()});
   if(token!==serial)return;
   status.textContent='Проверен локальный архив '+asset+' · '+
    archive.forecasts.length+' записей · '+(report.readyFrames||0)+
    ' ТФ с достаточной описательной выборкой. ' +
    'Автоматическое изменение прогнозов отключено.';
   render(report);
   await renderShadowState(asset,archive,report,token);
  }catch(error){
   if(token===serial){
    status.textContent='Аудит недоступен.';
    root.append(node('p','forecast-quality-warning',
     String(error?.message||error)));
   }
  }finally{
   running=false;refresh();
  }
 });
 select.addEventListener('change',()=>{
  serial++;root.replaceChildren();
  get('feature-shadow-content')?.replaceChildren();
  if(get('feature-shadow-status'))
   get('feature-shadow-status').textContent='';
  status.textContent='Выбран '+select.value+
   '. Нажмите «Исследовать полный архив».';
 });
 refresh();
 return {refresh};
}
