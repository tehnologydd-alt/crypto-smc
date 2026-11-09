/**
 * One-sided forecast card for new immutable Android Room research.
 * Earlier directionless range records remain accessible as archive cards.
 * The UI NEVER mistakes an H1 touch for an executed order.
 */
import {planDirectionalScenario,auditDirectionalScenario,directionalOutcomeLabel}
 from './directional-scenario.mjs';
import {forecastStage} from './favorite-logic.mjs';
import {inspectResearchTimeline} from './research-timeline.mjs';
import {displayPair,priceText} from './forecast-card-ux.mjs';
import {buildForecastEventTimeline} from './forecast-event-timeline.mjs';

const create=(tag,style='',label)=>{
 const element=document.createElement(tag);
 if(style)element.className=style;
 if(label!==undefined)element.textContent=String(label);
 return element;
};
const date=when=>Number.isSafeInteger(when)&&when>0?
 new Date(when).toLocaleString('ru-RU',{
  day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'—';
const labelForSide=s=>s==='UP'?'↑ РОСТ':'↓ СНИЖЕНИЕ';
const terminalStates=new Set(['TP3','STOP','AMBIGUOUS','NOT_ENTERED','HORIZON']);
const btn=(klass,label,fn)=>{
 const b=create('button',klass,label);b.type='button';b.addEventListener('click',fn);
 return b;
};
function followButtons(row,{tracked,onToggle,onOpen}={}){
 const wrapper=create('div','forecast-visual-actions');
 wrapper.append(
  btn('forecast-follow',tracked?'✓ В отмеченных':'☆ Добавить в отмеченные',
   ()=>onToggle?.(row.id)),
  btn('forecast-copy-all','Открыть актив',()=>onOpen?.(row.asset,row.id))
 );
 return wrapper;
}
export function legacyRangeCard(row,options={}){
 const trace=inspectResearchTimeline(row,{now:Date.now()});
 const finished=trace.state==='EVALUATED'||forecastStage(row)==='COMPLETED';
 const card=create('article','forecast-record forecast-visual forecast-legacy'+
  (finished?' is-completed':''));
 const head=create('div','forecast-visual-head');
 const name=create('div','forecast-visual-identity');
 name.append(create('strong','',displayPair(row.asset)),
  create('small','','Архив диапазона · H1 · без направления'));
 head.append(name,create('span','forecast-visual-state '+(finished?'finished':'warning'),
  finished?'Завершено · архив':'Архив · не направленный'));
 card.append(head,create('p','forecast-visual-provenance',
  'Старая гипотеза не содержала единого направления или зафиксированных TP/SL. '+
  'Задним числом приписывать их нельзя.'));
 const details=create('details','forecast-record-details');
 details.append(create('summary','','Исходный диапазон и история H1'));
 let h=null;
 try{h=typeof row.hypothesis==='string'?JSON.parse(row.hypothesis):row.hypothesis;}
 catch{}
 if(h&&Number.isFinite(h.bandLow)&&Number.isFinite(h.bandHigh))
  details.append(create('p','forecast-band',
   priceText(h.bandLow)+' — '+priceText(h.bandHigh)+' USDT'));
 if(trace.state==='EVALUATED')
  details.append(create('p','forecast-result',
   'Проверен исход диапазона · '+date(trace.result.evaluatedAt)));
 else details.append(create('p','muted',
  'Архив исследования сохраняется без пересчёта направления.'));
 card.append(details,followButtons(row,options));
 return card;
}
export function directionalForecastCard(row,{
 tracked,onToggle,onOpen,sourceH1,sourceM5,copyText
}={}){
 const verified=planDirectionalScenario(row,{now:Date.now()});
 const plan=verified.plan;
 const isM5=plan?.evaluationInterval==='5m';
 const sourceFrame=isM5?'M5':'H1';
 const timeline=buildForecastEventTimeline(row,{now:Date.now()});
 const finishedNative=forecastStage(row)==='COMPLETED'&&
  terminalStates.has(row.evaluation?.outcome);
 const card=create('article','forecast-record forecast-visual forecast-directional'+
  (finishedNative?' is-completed':''));
 const top=create('div','forecast-visual-head');
 const names=create('div','forecast-visual-identity');
 names.append(create('strong','',displayPair(row.asset)),
  create('small','',plan?'H1 · '+labelForSide(plan.side):
   'Сценарий · проверка целостности'));
 const state=create('span','forecast-visual-state '+(finishedNative?'finished':'active'),
  finishedNative?'Завершено':'Ожидает проверки');
 top.append(names,state);card.append(top);
 if(verified.state!=='READY'){
  card.append(create('p','forecast-level-warning',
   'Исходный сценарий не прошёл проверку: '+verified.reason));
  card.append(followButtons(row,{tracked,onToggle,onOpen}));
  return card;
 }
 card.append(create('p','forecast-visual-provenance',
  'Одно направление и все контрольные уровни сохранены при публикации в Room. '+
  'Направление формируется по H1; контроль уровней — по '+sourceFrame+'. '+
  'Касание цены не означает исполненной сделки.'));
 const steps=create('div','forecast-step-strip');
 const stageNodes=['Создан','Вход','Итог'].map((title,i)=>{
  const node=create('span','forecast-step '+(i===0?'is-done':'is-pending'),
   (i===0?'✓ ':'· ')+title);steps.append(node);return node;
 });
 card.append(steps);
 const status=create('p','forecast-visual-horizon',
  finishedNative?'Итог записан · проверяем историю касаний':
   'Ожидаем проверенных '+sourceFrame+'-свечей после публикации.');
 status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 card.append(status);
 const levels=create('div','forecast-visual-levels');
 const first=create('div','forecast-baseline-row');
 const copied=create('p','forecast-copy-feedback');
 copied.setAttribute('aria-live','polite');
 async function copy(value){
  if(typeof copyText!=='function'){copied.textContent='Копирование недоступно';return;}
  copied.textContent=await copyText(value)?'Скопировано':'Копирование недоступно';
 }
 function level(name,key,protective=false){
  const box=create('div','forecast-price-box'+(protective?' protective':''));
  box.append(create('span','forecast-price-label',name),
   create('strong','forecast-price-value',priceText(plan[key])));
  const control=btn('forecast-copy','▢',()=>void copy(priceText(plan[key])));
  control.setAttribute('aria-label','Копировать '+name);
  box.append(control);
  return box;
 }
 first.append(level('Опорная цена · вход H1','entry'),
  level('Защитный уровень SL','sl',true));
 levels.append(first);
 const grid=create('div','forecast-target-grid'),cells={};
 for(const key of ['tp1','tp2','tp3']){
  const tile=create('div','forecast-target');
  tile.append(create('span','forecast-target-name',key.toUpperCase()),
   create('strong','forecast-target-price',priceText(plan[key])));
  const control=btn('forecast-copy','▢',()=>void copy(priceText(plan[key])));
  control.setAttribute('aria-label','Копировать '+key.toUpperCase());
  const info=create('small','forecast-target-mark','Не проверено');
  tile.append(control,info);grid.append(tile);cells[key]={tile,info};
 }
 levels.append(grid);
 const progress=create('div','forecast-observation-progress');
 const summary=create('p','forecast-observation-summary',
  'Проверяем вход, TP1–TP3 и SL по закрытым '+sourceFrame+' в хронологическом порядке.');
 const bars=create('div','forecast-progress-track');
 const parts=['tp1','tp2','tp3'].map(k=>{
  const bar=create('span','forecast-progress-step');
  bar.setAttribute('aria-label',k.toUpperCase()+' · не проверено');bars.append(bar);
  return bar;
 });
 progress.append(summary,bars);levels.append(progress);card.append(levels,copied);
 // An immediately visible, immutable Room chronology. A later candle replay is
 // only a cross-check; it must never silently overwrite the saved event order.
 const chronology=create('section','forecast-event-timeline');
 chronology.setAttribute('aria-label','Хронология достижения уровней');
 const chronologyHeader=create('div','forecast-event-heading');
 chronologyHeader.append(create('strong','',
  'Порядок уровней · '+sourceFrame),
  create('span','',
   timeline.state==='VERIFIED'?'Журнал Room':'Нет полной проверки'));
 chronology.append(chronologyHeader);
 const story=create('p','forecast-event-path',
  timeline.state==='VERIFIED'?timeline.label:
   'Последовательность уровней пока не подтверждена');
 chronology.append(story);
 if(timeline.state==='VERIFIED'){
  const ordered=create('div','forecast-event-items');
  for(const mark of timeline.events){
   const item=create('div','forecast-event-item'+
    (mark.terminal?' is-terminal':''));
   item.append(create('span','forecast-event-item-name',mark.label),
    create('strong','forecast-event-item-time',date(mark.at)));
   if(mark.price!==null)
    item.append(create('small','forecast-event-item-price',
     priceText(mark.price)+' USDT'));
   else if(mark.stage==='PUBLISHED')
    item.append(create('small','forecast-event-item-price','Модель H1'));
   else item.append(create('small','forecast-event-item-price',
    mark.source+' · наблюдение'));
   ordered.append(item);
  }
  chronology.append(ordered);
  chronology.append(create('p','forecast-event-note',timeline.note));
 }else{
  chronology.append(create('p','forecast-event-warning',
   timeline.reason||'Данные событий Room отсутствуют'));
 }
 card.append(chronology);
 const replayStatus=create('p','forecast-event-replay',
  'Сверка по закрытым '+sourceFrame+'-свечам доступна при наличии архива.');
 card.append(replayStatus);
 if(timeline.state==='VERIFIED'){
  for(const [i,observed] of [
   true,timeline.entered,timeline.finished
  ].entries()){
   stageNodes[i].className='forecast-step '+(observed?'is-done':'is-pending');
   stageNodes[i].textContent=(observed?'✓ ':'· ')+['Создан','Вход','Итог'][i];
  }
  const roomTouches=new Set(timeline.events.map(mark=>mark.stage));
  for(const [i,key] of ['tp1','tp2','tp3'].entries()){
   const hit=roomTouches.has(key.toUpperCase());
   cells[key].tile.classList.toggle('is-hit',hit);
   cells[key].info.textContent=hit?'✓ Касание '+sourceFrame:'Не отмечено Room';
   parts[i].classList.toggle('is-hit',hit);
   parts[i].setAttribute('aria-label',key.toUpperCase()+
    (hit?' · подтверждено Room':' · не отмечено Room'));
  }
  if(timeline.finished){
   card.classList.add('is-completed');
   state.className='forecast-visual-state finished';
   state.textContent='Завершено';
   status.textContent=directionalOutcomeLabel(timeline.outcome)+
    ' · подтверждено событиями Room';
  }else if(timeline.entered){
   state.textContent='Вход отмечен · '+sourceFrame;
   status.textContent='Вход подтверждён. Отслеживаем контрольные точки '+sourceFrame+'.';
  }
 }
 const actions=create('div','forecast-visual-actions');
 actions.append(
  btn('forecast-follow',tracked?'✓ В отмеченных':'☆ Добавить в отмеченные',
   ()=>onToggle?.(row.id)),
  btn('forecast-copy-all','▢ Скопировать сценарий',()=>void copy([
   displayPair(row.asset)+' · H1 · '+labelForSide(plan.side),
   'Опубликовано '+date(plan.publishedAt),
   'Опорная цена: '+priceText(plan.entry),
   'TP1 '+priceText(plan.tp1),'TP2 '+priceText(plan.tp2),
   'TP3 '+priceText(plan.tp3),'SL '+priceText(plan.sl),
   'Направление H1 · контроль по закрытым '+sourceFrame+' · не биржевой ордер'
  ].join('\n')))
 );
 card.append(actions);
 const open=btn('forecast-open','Открыть актив',()=>onOpen?.(row.asset,row.id));
 const bottom=create('div','forecast-card-actions');
 bottom.append(open);card.append(bottom);
 const reader=isM5?sourceM5:sourceH1;
 if(typeof reader!=='function')return card;
 void (isM5?reader(plan):reader(row.asset)).then(archive=>{
  if(!card.isConnected)return;
  if(!archive.native||archive.error||!archive.complete){
   replayStatus.textContent='Повторная проверка '+sourceFrame+
    ' сейчас недоступна. Исходный журнал Room остаётся без изменений.';
   if(timeline.state!=='VERIFIED')
    status.textContent='Нет подтверждённого порядка уровней: архив '+sourceFrame+' недоступен.';
   return;
  }
  const audit=auditDirectionalScenario(plan,archive.candles,{now:Date.now()});
  if(['NEEDS_DATA','INVALID'].includes(audit.state)){
   replayStatus.textContent='Повторная проверка '+sourceFrame+
    ': недостаточно достоверных свечей. '+audit.reason;
   if(timeline.state!=='VERIFIED')
    status.textContent='Нет подтверждённого порядка касаний: '+audit.reason;
   return;
  }
  if(timeline.state==='VERIFIED'){
   const sameEntry=(audit.entryAt??null)===(timeline.events.find(
    x=>x.stage==='CONFIRMED')?.at??null);
   const sameTargets=['TP1','TP2','TP3'].every(key=>
    (audit.hits.find(x=>x.key===key.toLowerCase())?.at??null)===
    (timeline.events.find(x=>x.stage===key)?.at??null));
   const sameOutcome=audit.finished===timeline.finished&&
    (!audit.finished||audit.outcome===timeline.outcome);
   if(sameEntry&&sameTargets&&sameOutcome){
    replayStatus.textContent='✓ Сверено: история Room совпадает с закрытыми '+
     sourceFrame+'-свечами.';
   }else{
    replayStatus.textContent='⚠️ Журнал Room и повторная проверка '+
     sourceFrame+' расходятся. Требуется проверка источника; '+
     'отображённые события Room не изменены.';
    replayStatus.classList.add('is-warning');
   }
   return;
  }
  replayStatus.textContent='Независимая проверка по закрытым '+sourceFrame+
   ' завершена; события Room остаются неподтверждёнными.';
  const finished=audit.finished;
  card.classList.toggle('is-completed',finished||finishedNative);
  state.className='forecast-visual-state '+(finished||finishedNative?'finished':'active');
  state.textContent=finished?'Завершено':audit.entryAt?'Опорная цена отмечена':'Ожидает входа';
  for(const [i,observed] of [true,Boolean(audit.entryAt),finished].entries()){
   stageNodes[i].className='forecast-step '+(observed?'is-done':'is-pending');
   stageNodes[i].textContent=(observed?'✓ ':'· ')+['Создан','Вход','Итог'][i];
  }
  const hitSet=new Set(audit.hits.map(x=>x.key));
  for(const [i,key] of ['tp1','tp2','tp3'].entries()){
   const hit=hitSet.has(key);
   cells[key].tile.classList.toggle('is-hit',hit);
   cells[key].info.textContent=hit?'✓ Касание '+sourceFrame:'Не достигнут';
   parts[i].classList.toggle('is-hit',hit);
   parts[i].setAttribute('aria-label',key.toUpperCase()+(hit?' · наблюдался':' · не достигнут'));
  }
  status.textContent=directionalOutcomeLabel(audit.outcome)+
   (finished?' · '+date(audit.terminalAt):' · проверка до '+date(plan.targetCloseAt));
  summary.textContent='Проверено '+(isM5?audit.observedBars+'/288 M5':audit.observedHours+'/24 H1')+' · TP: '+
   audit.hits.length+'/3. '+(audit.reason||audit.note);
  if(audit.reason)replayStatus.textContent+=' '+audit.reason;
 }).catch(()=>{
  if(card.isConnected){
   replayStatus.textContent='Архив '+sourceFrame+
    ' недоступен для независимой проверки.';
   if(timeline.state!=='VERIFIED')
    status.textContent='Хронология уровней не подтверждена.';
  }
 });
 return card;
}
