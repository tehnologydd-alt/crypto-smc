/**
 * APEX Evidence Lab UI: user-initiated, entirely device-local integrity review.
 * No new network requests or price predictions. Native bridge is read-only.
 */
import {auditCandleSeries,auditVisibleDepth,auditNetwork,
 auditForwardResearch,MIN_FORWARD_SAMPLES} from './evidence-lab.mjs';
import {chainForAsset} from './onchain-core.mjs';
import {getMobileCandleArchive,getMobileLiquidityHistory,getMobileOnChainHistory,
 getMobileAssetResearchArchive} from './mobile-bridge.mjs';

const get=id=>document.getElementById(id);
const fmt=(n,d=1)=>Number.isFinite(n)
 ?new Intl.NumberFormat('ru-RU',{maximumFractionDigits:d}).format(n):'—';
function create(tag,className='',value){
 const n=document.createElement(tag);
 if(className)n.className=className;
 if(value!==undefined)n.textContent=String(value);
 return n;
}
const appendMetric=(box,label,value,detail='')=>{
 const card=create('div','evidence-metric');
 card.append(create('span','',label),create('strong','',value));
 if(detail)card.append(create('small','',detail));
 box.append(card);
};
const sourceName={binance:'Binance Spot',bybit:'Bybit Spot'};
const dataState={
 RECENT:'Наблюдения актуальны',HISTORICAL:'Только история',
 EMPTY:'Нет накопленных данных',UNSUPPORTED:'Источник не подключён',
 INVALID:'Проверка не пройдена',OBSERVED:'История существует'
};
const horizonState={
 INSUFFICIENT:'Мало результатов',PARTIAL_HISTORY:'Неполный журнал',
 INCOMPLETE_RESULTS:'Непроверенные или противоречивые записи',
 REPORTABLE:'Достаточно наблюдений для описательной сводки'
};
export function initEvidenceDashboard({getSelectedSymbol,getFavorites}){
 let busy=false,generation=0,lastAsset='';
 const select=get('evidence-asset'),run=get('evidence-run'),
  status=get('evidence-status'),cards=get('evidence-data-cards'),
  summary=get('evidence-forecast-summary'),cohorts=get('evidence-cohorts');
 const message=(text,warning=false)=>{
  status.textContent=text;status.classList.toggle('is-offline',warning);
 };
 function updateAssets(){
  const options=[...new Set([getSelectedSymbol(),...getFavorites()]
   .filter(x=>typeof x==='string'&&/^[A-Z0-9]{5,20}$/.test(x)))].slice(0,11);
  const preferred=options.includes(select.value)?select.value:
   options.includes(lastAsset)?lastAsset:options[0];
  select.replaceChildren();
  for(const value of options){
   const opt=create('option','',value);opt.value=value;select.append(opt);
  }
  if(preferred)select.value=preferred;
 }
 function clearResults(){
  cards.replaceChildren();summary.replaceChildren();cohorts.replaceChildren();
 }
 async function runAudit(){
  if(busy||!select.value)return;
  const asset=select.value,seq=++generation;
  busy=true;run.disabled=true;lastAsset=asset;
  clearResults();
  message('Проверяем локальные свечи, стаканы, сеть и зафиксированные результаты '+asset+'…');
  try{
   const chain=chainForAsset(asset);
   // All reads are from Android Room. No external exchanges or APIs.
   const [candles,depth,network,journal]=await Promise.all([
    getMobileCandleArchive(asset,'1h',{
     onProgress:(loaded,total)=>{if(generation===seq)
      message('Считываем H1: '+loaded+' из '+total+' сохранённых свечей…');}
    }),
    getMobileLiquidityHistory(asset,120),
    chain?getMobileOnChainHistory(asset,100):Promise.resolve({native:true,rows:[]}),
    getMobileAssetResearchArchive(asset,{
     onProgress:(loaded,total)=>{if(generation===seq)
      message('Считываем журнал: '+loaded+' из '+total+' исследований…');}
    })
   ]);
   if(generation!==seq)return;
   if(!candles.native||!journal.native||!journal.assetScoped||
    journal.asset!==asset||journal.error)
    throw Error(journal.error||'Веб-версия не поддерживает нативный аудит.');
   const now=Date.now();
   const c=auditCandleSeries(candles.candles,'1h',{now});
   const d=auditVisibleDepth(depth.rows,asset,{now});
   const n=auditNetwork(network.rows,asset,{now});
   const f=auditForwardResearch(journal.forecasts,{
    now,totalPublished:journal.publishedCount
   });
   appendMetric(cards,'H1 · доступно / сохранено',
    fmt(candles.candles.length,0)+' / '+fmt(candles.totalCount,0),
    candles.complete?'Локальный свечной архив прочитан полностью':
     'Архив частичный; пропущенные часы нельзя подменить данными');
   appendMetric(cards,'Исследования · доступно / сохранено',
    fmt(journal.forecasts.length,0)+' / '+fmt(journal.publishedCount,0),
    journal.complete?'Журнал выбранного актива прочитан полностью':
     'Превышен предел 1500 записей; проценты скрыты');
   appendMetric(cards,'H1 · завершённые свечи',fmt(c.samples,0),
    c.state==='INVALID'?'Ошибка исходной хронологии':
    c.state==='HISTORICAL'?'Последние свечи из локальной истории':
    c.state==='RECENT'?'Недавние сохранённые свечи':'История отсутствует');
   appendMetric(cards,'Пропуски H1',c.gaps===null?'—':fmt(c.gaps,0),
    c.coverage===undefined?'Полнота не вычислена':
    'Покрытие диапазона: '+fmt(c.coverage*100,1)+'%');
   appendMetric(cards,'Публичный стакан',fmt(d.samples,0)+' снимков',
    d.venues.map(v=>(sourceName[v.venue]||v.venue)+': '+
     fmt(v.samples,0)).join(' · '));
   appendMetric(cards,'Блокчейн · '+(chain?.toUpperCase()||'—'),
    chain?fmt(n.samples,0)+' снимков':'Не подключён',
    dataState[n.state]||'Недостаточно источников');
   if(candles.error||depth.error||network.error)
    cards.append(create('p','evidence-note',
     'Часть локальных данных недоступна: '+[
      candles.error,depth.error,network.error].filter(Boolean).join(' · ')));
   renderForecastAudit(f,asset);
   message('Локальная проверка выполнена для '+asset+' · '+new Date(now).toLocaleTimeString('ru-RU')+
    ' · сеть не запрашивалась.');
  }catch(error){
   if(generation===seq){
    message('Проверка не выполнена: '+String(error?.message||error),true);
    clearResults();
   }
  }finally{
   if(generation===seq){busy=false;run.disabled=false;}
  }
 }
 function renderForecastAudit(audit,asset){
  if(audit.state==='INVALID'){
   summary.append(create('p','evidence-note','Невозможно проверить журнал прогнозов.'));
   return;
  }
  const count=document.createElement('div');count.className='evidence-audit-counts';
  for(const [label,value] of [
   ['Завершённых исходов',audit.counts.evaluated],
   ['Срок наступил, результат не получен',audit.counts.dueUnevaluated],
   ['Ещё ожидают',audit.counts.awaiting],
   ['Ошибки целостности',audit.counts.invalid]]){
    const metric=create('div','evidence-count');
    metric.append(create('strong','',fmt(value,0)),create('span','',label));
    count.append(metric);
  }
  summary.append(count);
  if(audit.truncated)summary.append(create('p','evidence-note',
   'В журнале '+fmt(audit.reportedTotal,0)+' записей, а локальный запрос показывает только '+
   fmt(audit.loaded,0)+' последних. Процент покрытия скрыт: история неполная.'));
  if(audit.counts.invalid)summary.append(create('p','evidence-note',
   'Обнаружены непроверяемые, повторные или противоречивые записи. Показатель результатов скрыт.'));
  const all=audit.cohorts||[];
  const target=all.find(row=>row.asset===asset);
  const visible=target?[target]:[];
  if(!visible.length){
   cohorts.append(create('p','muted','По выбранному активу ещё нет проверенных завершённых результатов.'));
   return;
  }
  for(const c of visible){
   const panel=create('div','evidence-cohort');
   panel.append(create('strong','',c.asset+' · '+fmt(c.independentWindows,0)+
    ' неперекрывающихся 4-часовых результатов'));
   panel.append(create('p','',horizonState[c.status]||c.status));
   if(c.status==='REPORTABLE'){
    panel.append(create('div','evidence-coverage',
     'Наблюдалось попадание в диапазон: '+fmt(c.coverage*100,1)+'%'));
    panel.append(create('p','',
     'Описательный интервал Уилсона (95%): '+fmt(c.interval95.lower*100,1)+
     '–'+fmt(c.interval95.upper*100,1)+'%. Не является вероятностью следующего прогноза.'));
   }else{
    panel.append(create('p','',c.status==='INSUFFICIENT'?
     'До статистической сводки нужно минимум '+MIN_FORWARD_SAMPLES+
      ' неперекрывающихся завершённых наблюдений по одному активу.':
     'Сводка скрыта, пока не проверена полнота истории и исходов.'));
   }
   cohorts.append(panel);
  }
 }
 select.addEventListener('change',()=>{
  // The previous audit can still be reading Room pages: invalidate it and
  // immediately enable a new audit for the newly selected asset.
  generation++;busy=false;run.disabled=false;lastAsset=select.value;clearResults();
  message('Выбран '+select.value+'. Запустите локальную проверку.');
 });
 run.addEventListener('click',()=>void runAudit());
 updateAssets();
 return {
  refreshAssetChoices(){updateAssets();},
  open(){updateAssets();}
 };
}
