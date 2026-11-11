/**
 * Independent M15 and H4 forward-only forecast records.
 * Reader validates immutable Room controls before showing evidence.
 * Confluence is descriptive: overlapping horizons are NOT independent votes.
 */
import {computeReferenceLevels} from './research-level-sequence.mjs';
import {directionalHypothesis,planDirectionalScenario,directionalOutcomeLabel}
 from './directional-scenario.mjs';
import {displayPair,priceText,controlMethodLabel} from './forecast-card-ux.mjs';
import {compactOpenForecastCard} from './forecast-compact-card.mjs';
import {forecastLevelMetrics,displayPriceMove,displayRiskReward,
 completedResearchPresentation,renderCompletedResearchPanel}
 from './forecast-level-metrics.mjs';

export const MULTIFRAME_MODEL='EMPIRICAL_MULTIFRAME_DIRECTION_V1';
export const MULTIFRAME_SPEC=Object.freeze({
 '15m':Object.freeze({step:900000,bars:16,title:'M15',horizon:'4 часа'}),
 '4h':Object.freeze({step:14400000,bars:24,title:'H4',horizon:'4 дня'})
});
const time=n=>Number.isSafeInteger(n)&&n>0;
const price=n=>typeof n==='number'&&Number.isFinite(n)&&n>0;
const near=(a,b)=>price(a)&&price(b)&&
 Math.abs(a-b)<=Math.max(1e-9,Math.abs(b)*2e-11);
const parse=row=>{
 try{return typeof row?.hypothesis==='string'?JSON.parse(row.hypothesis):row?.hypothesis;}
 catch{return null;}
};
export function multiFrameHypothesis(row){
 const h=parse(row);
 return h?.model===MULTIFRAME_MODEL?h:null;
}
const fail=(state,reason)=>({state,reason,plan:null});
export function planMultiFrameForecast(row,{now=Date.now()}={}){
 const h=multiFrameHypothesis(row);
 if(!h)return fail('NOT_MULTIFRAME','Это не прогноз M15/H4');
 const spec=MULTIFRAME_SPEC[row.interval];
 const legacy=h.evaluationInterval===row.interval&&
  h.stageSemantics==='SAME_FRAME_LIMIT_V1';
 const fineM1=h.evaluationInterval==='1m'&&
  h.stageSemantics==='M1_CLOSED_LIMIT_V1'&&
  h.observationMethod==='M1_CLOSED_LEVEL_ORDER_V1';
 const fine=h.evaluationInterval==='5m'&&
  h.stageSemantics==='M5_CLOSED_LIMIT_V2'&&
  h.observationMethod==='M5_CLOSED_LEVEL_ORDER_V1';
 if(!spec||h.interval!==row.interval||
  !(legacy||fine||fineM1)||
  h.decisionMethod!=='SIX_BAR_EFFICIENCY_V1'||
  h.horizonBars!==spec.bars||h.sampleBars!==96||
  h.historicalPercentile!==.8||h.empiricalSamples!==92||
  !price(h.empiricalWidth)||!price(h.anchorClose)||
  !time(h.anchorCloseAt)||!time(h.targetCloseAt)||
  h.anchorCloseAt%spec.step!==spec.step-1||
  h.targetCloseAt!==h.anchorCloseAt+spec.step*spec.bars||
  !time(row.publishedAt)||row.publishedAt<h.anchorCloseAt||
  row.publishedAt>=h.anchorCloseAt+spec.step||row.publishedAt>now+60000||
  row.id!=='direction3:'+row.asset+':'+row.interval+':'+h.anchorCloseAt||
  !/^[A-Z0-9]{5,20}$/.test(row.asset)||
  !['UP','DOWN'].includes(h.direction))
  return fail('INVALID','Временная структура или метод не соответствует публикации');
 const low=Number((h.anchorClose*Math.exp(-h.empiricalWidth)).toPrecision(13));
 const high=Number((h.anchorClose*Math.exp(h.empiricalWidth)).toPrecision(13));
 const expected=computeReferenceLevels(h.anchorClose,low,high)?.[h.direction];
 const saved=h.levelStudy;
 if(!expected||saved?.version!=='MULTIFRAME_SINGLE_LEVELS_V1'||
  saved.direction!==h.direction||!near(saved.entry,h.anchorClose)||
  !['tp1','tp2','tp3','sl'].every(k=>near(saved[k],expected[k])))
  return fail('INVALID','Уровни не согласованы с исходной исторической амплитудой');
 const order=h.direction==='UP'?
  saved.sl<saved.entry&&saved.entry<saved.tp1&&
  saved.tp1<saved.tp2&&saved.tp2<saved.tp3:
  saved.tp3<saved.tp2&&saved.tp2<saved.tp1&&
  saved.tp1<saved.entry&&saved.entry<saved.sl;
 if(!order)return fail('INVALID','Контрольные уровни расположены неверно');
 // Publication-time context may only contain previously available observations.
 const context=h.contextAsPublished||{};
 for(const v of Object.values(context)){
  if(!v||!time(v.candleAt)||!time(v.observedAt)||
   v.candleAt>=row.publishedAt||v.observedAt>row.publishedAt||
   v.observedAt<v.candleAt)
   return fail('INVALID','Контекст содержит будущие данные');
 }
 return {state:'READY',plan:{
  asset:row.asset,id:row.id,interval:row.interval,
  side:h.direction,publishedAt:row.publishedAt,
  anchorCloseAt:h.anchorCloseAt,targetCloseAt:h.targetCloseAt,
  source:'Binance Spot · закрытые '+row.interval,
  evaluationInterval:h.evaluationInterval,
  stageSemantics:h.stageSemantics,
  ...saved,contextAsPublished:context,spec
 }};
}
const STAGES=['LIMIT_READY','CONFIRMED','ACTIVE','TP1','TP2','TP3',
 'SL','ORDER_UNKNOWN','NO_ENTRY','TIMEOUT','COMPLETED'];
const FINALS={TP3:'TP3',STOP:'SL',AMBIGUOUS:'ORDER_UNKNOWN',
 NOT_ENTERED:'NO_ENTRY',HORIZON:'TIMEOUT'};
/** Separate source-evidence validation, without pretending to trade. */
export function multiFrameEvidence(row,{now=Date.now()}={}){
 const checked=planMultiFrameForecast(row,{now});
 if(checked.state!=='READY')return {state:checked.state,reason:checked.reason};
 const {plan}=checked,events=new Map();
 if(!Array.isArray(row.stageEvents))return {state:'UNVERIFIED',reason:'Нет этапов Room'};
 for(const item of row.stageEvents){
  if(!STAGES.includes(item?.stage))continue;
  const evaluationStep=plan.evaluationInterval==='1m'?60000:
   plan.evaluationInterval==='5m'?300000:
   plan.spec.step;
  if(events.has(item.stage)||!time(item.observedAt)||!time(item.recordedAt)||
   item.observedAt<plan.publishedAt||item.observedAt>plan.targetCloseAt||
   item.observedAt%evaluationStep!==evaluationStep-1||
   item.recordedAt<item.observedAt||item.recordedAt>now+60000)
   return {state:'INVALID',reason:'Неверная последовательность событий Room'};
  events.set(item.stage,item);
 }
 const ready=events.get('LIMIT_READY'),entry=events.get('CONFIRMED');
 const touched=['TP1','TP2','TP3'].filter(x=>events.has(x));
 if(entry&&(!ready||entry.observedAt<ready.observedAt)||
    touched.length&&(!entry||!events.has('TP1'))||
    events.has('TP2')&&!events.has('TP1')||
    events.has('TP3')&&!events.has('TP2'))
   return {state:'INVALID',reason:'Касания не согласованы с входом'};
 for(let i=1;i<touched.length;i++)
  if(events.get(touched[i]).observedAt<events.get(touched[i-1]).observedAt)
   return {state:'INVALID',reason:'TP отмечены не по порядку'};
 if(entry&&touched.some(x=>events.get(x).observedAt<entry.observedAt))
  return {state:'INVALID',reason:'Цель раньше входа'};
 const finished=Boolean(row.evaluation);
 if(!finished&&events.has('COMPLETED'))
  return {state:'UNVERIFIED',reason:'Нет окончательного исхода Room'};
 if(finished){
  const outcome=row.evaluation.outcome,terminal=events.get(FINALS[outcome]);
  const done=events.get('COMPLETED');
  if(!terminal||!done||done.observedAt!==terminal.observedAt||
    row.evaluation.targetCloseAt!==plan.targetCloseAt||
    !time(row.evaluation.evaluatedAt)||
    row.evaluation.evaluatedAt<done.observedAt||
    row.evaluation.evaluatedAt>now+60000||
    !price(row.evaluation.actualClose)||
    touched.some(x=>events.get(x).observedAt>terminal.observedAt)||
    entry&&entry.observedAt>terminal.observedAt||
    (outcome==='TP3'&&touched.length!==3)||
    (outcome==='NOT_ENTERED'&&(entry||touched.length))||
    (outcome==='HORIZON'&&!entry)||
    (outcome==='STOP'&&!entry)||
    (['NOT_ENTERED','HORIZON'].includes(outcome)&&
     terminal.observedAt!==plan.targetCloseAt))
   return {state:'INVALID',reason:'Исход противоречит этапам Room'};
 }
 return {state:'OBSERVED',plan,events,
  entered:Boolean(entry),touched,finished,
  outcome:finished?row.evaluation.outcome:null};
}
export function multiFrameQuality(rows,{now=Date.now()}={}){
 const counters=Object.fromEntries(Object.keys(MULTIFRAME_SPEC).map(tf=>
  [tf,{published:0,entered:0,completed:0,tp3:0,stop:0,unknown:0,invalid:0}]));
 for(const row of rows||[]){
  if(!multiFrameHypothesis(row))continue;
  const s=counters[row.interval];
  if(!s)continue;
  const e=multiFrameEvidence(row,{now});
  if(e.state!=='OBSERVED'){s.invalid++;continue;}
  s.published++;
  if(e.entered)s.entered++;
  if(e.finished){
   s.completed++;
   if(e.outcome==='TP3')s.tp3++;
   else if(e.outcome==='STOP')s.stop++;
   else s.unknown++;
  }
 }
 return counters;
}
/**
 * Latest still-open plans per symbol and frame. Never infer alignment from
 * closed or expired forecasts; do not call it a calibrated probability.
 */
export function multiFrameAgreement(rows,asset,{now=Date.now()}={}){
 const latest=new Map();
 for(const row of rows||[]){
  if(row?.asset!==asset)continue;
  let plan=null,frame=null;
  if(multiFrameHypothesis(row)){
   const record=multiFrameEvidence(row,{now});
   if(record.state!=='OBSERVED'||record.finished)continue;
   plan=record.plan;frame=row.interval;
  }else if(directionalHypothesis(row)){
   const found=planDirectionalScenario(row,{now});
   if(found.state!=='READY'||row.evaluation)continue;
   plan=found.plan;frame='1h';
  }
  if(!plan||now>plan.targetCloseAt||
    !time(plan.publishedAt)||plan.publishedAt>now)continue;
  if(!latest.has(frame)||latest.get(frame).publishedAt<plan.publishedAt)
   latest.set(frame,{frame,side:plan.side,publishedAt:plan.publishedAt});
 }
 const signals=['15m','1h','4h'].map(frame=>latest.get(frame)||
  {frame,side:null,publishedAt:null});
 const active=signals.filter(x=>x.side);
 const ups=active.filter(x=>x.side==='UP').length;
 const downs=active.length-ups;
 return {asset,signals,active:active.length,
  aligned:active.length>=2&&(ups===active.length||downs===active.length),
  conflict:ups>0&&downs>0,
  side:ups===active.length&&active.length>=2?'UP':
       downs===active.length&&active.length>=2?'DOWN':null,
  note:'Описательное совпадение направлений, не доказательство точности'};
}
const el=(tag,klass='',value)=>{
 const n=document.createElement(tag);
 if(klass)n.className=klass;
 if(value!==undefined)n.textContent=String(value);
 return n;
};
const fmt=at=>time(at)?new Date(at).toLocaleString('ru-RU'): '—';
// Compact display only; original immutable values remain intact.
const shortPrice=value=>typeof value==='number'&&value>0&&Number.isFinite(value)?
 Number(value.toPrecision(8)).toLocaleString('en-US',{
  useGrouping:false,maximumFractionDigits:16}):'—';
function multiFrameCardActions(row,{tracked=false,onToggle,onOpen}={}){
 const actions=el('div','forecast-visual-actions');
 const follow=el('button','forecast-follow',
  tracked?'✓ В отмеченных':'☆ Отметить');
 follow.type='button';follow.setAttribute('aria-pressed',String(tracked));
 follow.addEventListener('click',()=>onToggle?.(row.id));
 const open=el('button','forecast-copy-all','Открыть актив');
 open.type='button';open.addEventListener('click',()=>onOpen?.(row.asset,row.id));
 actions.append(follow,open);
 return actions;
}
export function multiFrameForecastCard(row,{tracked=false,onToggle,onOpen,copyText}={}){
 const evidence=multiFrameEvidence(row);
 const card=el('article','forecast-record forecast-visual forecast-multiframe');
 const head=el('div','forecast-visual-head');
 const identity=el('div','forecast-visual-identity');
 const title=MULTIFRAME_SPEC[row.interval]?.title||row.interval;
 const complete=evidence.state==='OBSERVED'&&evidence.finished;
 const {plan}=evidence.state==='OBSERVED'?evidence:{plan:null};
 const control=controlMethodLabel(plan?.evaluationInterval,{fallback:title});
 const sourceFrame=control.frame;
 const completion=completedResearchPresentation({
  outcome:evidence.outcome,verified:complete,entered:evidence.entered,
  touched:evidence.touched||[],frame:sourceFrame
 });
 identity.append(el('strong','',displayPair(row.asset)+
  (plan?' · '+title+' · '+(plan.side==='DOWN'?'SHORT':'LONG'):'')),
  el('small','',title+' · '+(plan?control.label:'метод не подтверждён')+
   ' · отдельное исследование'));
 const stageLabel=complete?completion.symbol+' '+completion.label:
  evidence.state!=='OBSERVED'?'Проверка данных':
  evidence.events.has('CONFIRMED')?'Активный':
  evidence.events.has('LIMIT_READY')?'Лимитный':'Ожидает';
 const badge=el('span','forecast-visual-state '+(complete?
  'finished tone-'+completion.tone:
  evidence.state!=='OBSERVED'?'warning':'active'),stageLabel);
 head.append(identity,badge);card.append(head);
 if(evidence.state!=='OBSERVED'){
  card.append(el('p','forecast-quality-warning',
   'Данные сценария требуют проверки: '+(evidence.reason||'нет подтверждения')));
  card.append(multiFrameCardActions(row,{tracked,onToggle,onOpen}));
  return card;
 }
 if(!complete){
  const stage=evidence.events.has('CONFIRMED')?'ACTIVE':
   evidence.events.has('LIMIT_READY')?'CONFIRMED':'PENDING_CONFIRMATION';
  return compactOpenForecastCard(row,{plan,stage,
   events:row.stageEvents,tracked,onToggle,onOpen,copyText});
 }
 if(complete){
  card.classList.add('is-completed','tone-'+completion.tone);
  card.append(renderCompletedResearchPanel(plan,{
   outcome:evidence.outcome,verified:true,entered:evidence.entered,
   touched:evidence.touched,frame:sourceFrame
  }));
 }else{
  card.append(el('p','forecast-final-reason',
   'Направление: '+(plan.side==='UP'?'↑ Рост':'↓ Снижение')+
   ' · срок '+plan.spec.horizon));
 }
 if(complete&&evidence.outcome==='AMBIGUOUS'){
  const unknown=row.stageEvents?.find(x=>x.stage==='ORDER_UNKNOWN');
  const explanation=typeof unknown?.explanation==='string'?
   unknown.explanation.trim().slice(0,180):'';
  card.append(el('p','forecast-quality-warning',
   explanation||'Порядок в исходной свече неизвестен. '+
    'Старые H4/M15 архивы проверялись собственным таймфреймом; '+
    'новые публикации проверяются по закрытым M1.'));
 }
 const show=el('details','forecast-card-fold');
 show.open=!complete;
 show.append(el('summary','','Показать вход, цели и итог'));
 const grid=el('div','forecast-baseline-row');
 const metrics=forecastLevelMetrics(plan);
 for(const [label,value] of [
  ['Вход',plan.entry],['SL',plan.sl]]){
  const tile=el('div','forecast-price-box');
  const number=el('strong','forecast-price-value',shortPrice(value));
  number.title='Точное значение: '+priceText(value);
  tile.append(el('span','forecast-price-label',label),number);
  if(metrics.state==='VALID')
   tile.append(el('small','forecast-level-percentage',
    label==='Вход'?'От входа: 0%':
     'Δ цены '+displayPriceMove(metrics.sl.deltaPct)+' · риск 1R'));
  grid.append(tile);
 }
 show.append(grid);
 const targets=el('div','forecast-target-grid');
 for(const key of ['tp1','tp2','tp3']){
  const item=el('div','forecast-target');
  const stage=key.toUpperCase();
  if(evidence.events.has(stage))item.classList.add('is-hit');
  const number=el('strong','forecast-target-price',shortPrice(plan[key]));
  number.title='Точное значение: '+priceText(plan[key]);
  item.append(el('span','forecast-target-name',stage),number);
  if(metrics.state==='VALID')
   item.append(el('small','forecast-level-percentage',
     'Δ цены '+displayPriceMove(metrics.targets[key].deltaPct)),
    el('small','forecast-level-reward',
     displayRiskReward(metrics.targets[key].rMultiple)));
  item.append(el('small','forecast-target-mark',
    evidence.events.has(stage)?'✓ Касание':'Не отмечено'));
  targets.append(item);
 }
 show.append(targets);
 if(metrics.state==='VALID')
  show.append(el('p','forecast-level-math-note',metrics.note));
 show.append(el('p','forecast-visual-horizon',
  'Опубликовано '+fmt(plan.publishedAt)+
  ' · последний срок '+fmt(plan.targetCloseAt)+
  ' · контроль по закрытым '+
   (plan.evaluationInterval==='1m'?'M1':
    plan.evaluationInterval==='5m'?'M5':'архивным '+title)+
   ' · порядок внутри свечи не предполагается.'));
 const history=el('div','forecast-event-timeline');
 for(const event of [...evidence.events.values()].sort((a,b)=>a.observedAt-b.observedAt)){
  const item=el('p','forecast-event-note',
   event.stage+' · '+fmt(event.observedAt));history.append(item);
 }
 show.append(history);
 const context=el('details','forecast-technical-notes');
 context.append(el('summary','','Сохранённый контекст радара'));
 const snapshot=plan.contextAsPublished||{};
 const keys=Object.keys(snapshot);
 context.append(el('p','',keys.length?
  keys.map(k=>k+': '+snapshot[k].direction+' · '+snapshot[k].mode).join(' / '):
  'Контекст на момент публикации отсутствовал.'));
 show.append(context);
 card.append(show);
 card.append(multiFrameCardActions(row,{tracked,onToggle,onOpen}));
 return card;
}
