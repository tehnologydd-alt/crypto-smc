/**
 * Quiet, compact presentation for OPEN research only.
 * Finished cards continue using their existing completed-outcome design.
 * The module only reads immutable Room forecast levels and observed stages.
 */
import {displayPair,priceText} from './forecast-card-ux.mjs';
import {whaleCheckBadge} from './forecast-whale-check.mjs';
import {forecastLevelMetrics,displayPriceMove,displayRiskReward}
 from './forecast-level-metrics.mjs';

const el=(tag,klass='',value)=>{
 const n=document.createElement(tag);
 if(klass)n.className=klass;
 if(value!==undefined)n.textContent=String(value);
 return n;
};
const datetime=t=>Number.isSafeInteger(t)&&t>0?
 new Date(t).toLocaleString('ru-RU',{day:'2-digit',month:'2-digit',
  hour:'2-digit',minute:'2-digit'}):'—';
const LABELS={
 PENDING_CONFIRMATION:['Ожидает','Ожидаем первую подтверждённую свечу после публикации'],
 CONFIRMED:['Лимитный','Уровни опубликованы, ожидаем касание входа'],
 ACTIVE:['Активный','Касание входа записано; наблюдаем TP1–TP3 и SL']
};
const FRAME={'1h':'H1','15m':'M15','4h':'H4'};
/** Presentation only: five decimals maximum; immutable Room prices are unchanged.
 * Ultra-small positive prices must not be deceptively rendered as zero.
 */
export function compactLevelPrice(value){
 if(typeof value!=='number'||!Number.isFinite(value)||value<=0)return '—';
 if(value<0.000005)return '<0.00001';
 return value.toFixed(5).replace(/\.?0+$/,'');
}
export function compactOpenForecastCard(row,{plan,stage='PENDING_CONFIRMATION',
 events=[],tracked=false,onToggle,onOpen,copyText}={}){
 if(!plan||!['PENDING_CONFIRMATION','CONFIRMED','ACTIVE'].includes(stage))
  throw Error('Only verified open scenarios can use compact cards');
 const timeframe=FRAME[row.interval]||row.interval;
 const evaluation=plan.evaluationInterval==='1m'?'M1':
  plan.evaluationInterval==='5m'?'M5':timeframe;
 const side=plan.side==='UP'?'↑ Рост':'↓ Снижение';
 const [status,note]=LABELS[stage];
 const card=el('article','forecast-record forecast-compact-card stage-'+stage.toLowerCase());
 card.dataset.scenarioId=row.id;
 const head=el('div','forecast-compact-head');
 const title=el('div','forecast-compact-identity');
 title.append(el('strong','',displayPair(row.asset)+' · '+timeframe),
  el('span','',side+' · контроль '+evaluation));
 const badge=el('span','forecast-compact-status',status);
 head.append(title,badge);card.append(head);
 const w=whaleCheckBadge(row);
 if(w)card.append(w);
 card.append(el('p','forecast-compact-note',
  Number.isSafeInteger(plan.targetCloseAt)&&Date.now()>plan.targetCloseAt?
   'Срок наблюдения прошёл · ожидаем подтверждённый итог Room':note));
 const moves=forecastLevelMetrics(plan);
 const copied=el('p','forecast-compact-copy-feedback');
 copied.setAttribute('role','status');
 copied.setAttribute('aria-live','polite');
 const copyLevel=async(label,key)=>{
  if(typeof copyText!=='function'){
   copied.textContent='Копирование недоступно на этом устройстве';
   return;
  }
  // Always copy the source-derived decimal, not the rounded presentation:
  // critical for low-price tokens and exact research-level replay.
  const full=priceText(plan[key]);
  const ok=full!=='—'&&await copyText(full);
  copied.textContent=ok?
   label+': скопирована полная цена '+full:
   'Не удалось скопировать '+label;
 };
 const levelButton=(label,key)=>{
  const display=key==='entry'?priceText(plan[key]):compactLevelPrice(plan[key]);
  const button=el('button','forecast-compact-level-copy',display);
  button.type='button';
  button.title='Копировать '+label+' (полную цену без округления)';
  button.setAttribute('aria-label',label+' '+display+
   ' · скопировать полное значение');
  button.addEventListener('click',()=>void copyLevel(label,key));
  return button;
 };
 const priceRow=el('div','forecast-compact-price-row');
 const near=[['Вход','entry'],['TP1','tp1'],['SL','sl']];
 for(const [label,key] of near){
  const tile=el('div','forecast-compact-price '+key);
  tile.append(el('small','',label),levelButton(label,key));
  if(moves.state==='VALID'&&key==='tp1')
   tile.append(el('small','',displayRiskReward(moves.targets.tp1.rMultiple)));
  priceRow.append(tile);
 }
 card.append(priceRow,copied);
 const checked=new Set((Array.isArray(events)?events:[]).map(x=>x.stage));
 const progress=el('div','forecast-compact-progress');
 for(const [key,label] of [['CONFIRMED','Вход'],['TP1','TP1'],
  ['TP2','TP2'],['TP3','TP3']]){
  const item=el('span','forecast-compact-event'+(checked.has(key)?' is-hit':''), 
   (checked.has(key)?'✓ ':'· ')+label);
  progress.append(item);
 }
 card.append(progress);
 const details=el('details','forecast-compact-details');
 details.append(el('summary','','Все уровни и история'));
 const grid=el('div','forecast-compact-full-levels');
 for(const [label,key] of [['Вход','entry'],['SL','sl'],['TP1','tp1'],
  ['TP2','tp2'],['TP3','tp3']]){
  const item=el('div','forecast-compact-full-level');
  item.append(el('span','',label),levelButton(label,key));
  if(moves.state==='VALID'){
   const info=key==='entry'?'Опорная цена':
    key==='sl'?'Δ '+displayPriceMove(moves.sl.deltaPct)+' · риск 1R':
    'Δ '+displayPriceMove(moves.targets[key].deltaPct)+
    ' · '+displayRiskReward(moves.targets[key].rMultiple);
   item.append(el('small','',info));
  }
  grid.append(item);
 }
 details.append(grid);
 details.append(el('p','forecast-compact-meta',
  'Публикация '+datetime(plan.publishedAt)+
  ' · срок '+datetime(plan.targetCloseAt)+' · наблюдение по закрытым '+evaluation));
 const validEvents=(Array.isArray(events)?events:[]).filter(x=>
  typeof x.stage==='string'&&Number.isSafeInteger(x.observedAt)&&
  x.observedAt>=plan.publishedAt&&
  x.observedAt<=plan.targetCloseAt&&Number.isSafeInteger(x.recordedAt)&&
  x.recordedAt>=x.observedAt).sort((a,b)=>a.observedAt-b.observedAt);
 if(validEvents.length){
  const history=el('div','forecast-compact-history');
  history.append(el('strong','','Подтверждено в журнале Room'));
  for(const x of validEvents.slice(-8)){
   const item=el('p','',x.stage+' · '+datetime(x.observedAt));
   history.append(item);
  }
  details.append(history);
 }else details.append(el('p','forecast-compact-meta',
  'Подтверждённые этапы пока отсутствуют.'));
 details.append(el('p','forecast-compact-meta',
  'Касание уровня — наблюдение, а не факт исполнения ордера.'));
 card.append(details);
 const actions=el('div','forecast-compact-actions');
 const mark=el('button','forecast-compact-mark',
  tracked?'★ Отмечен':'☆ Отметить');
 mark.type='button';mark.setAttribute('aria-pressed',String(tracked));
 mark.addEventListener('click',()=>onToggle?.(row.id));
 const open=el('button','forecast-compact-open','Открыть актив');
 open.type='button';open.addEventListener('click',()=>onOpen?.(row.asset,row.id));
 actions.append(mark,open);
 if(typeof copyText==='function'){
  const copy=el('button','forecast-compact-copy','Копировать');
  copy.type='button';
  copy.addEventListener('click',async()=>{
   const lines=[displayPair(row.asset)+' · '+timeframe+' · '+side,
    'Вход '+priceText(plan.entry),'SL '+priceText(plan.sl),
    ...['tp1','tp2','tp3'].map(k=>k.toUpperCase()+' '+priceText(plan[k]))];
   copy.textContent=await copyText(lines.join('\n'))?'✓ Скопировано':'Копировать';
  });
  actions.append(copy);
 }
 card.append(actions);
 return card;
}
