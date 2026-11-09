/**
 * Asset-news M5 observation panel. Only user clicks cause public Binance GET.
 * Never adds evidence to trading forecasts or makes event-causality claims.
 */
import {newsM5Eligibility,fetchNewsPublishedM5} from './news-m5-reaction.mjs';
import {createNewsM5Budget} from './news-m5-budget.mjs';
const el=id=>document.getElementById(id);
const div=(tag,cls='',content)=>{
 const x=document.createElement(tag);
 if(cls)x.className=cls;
 if(content!==undefined)x.textContent=String(content);
 return x;
};
const fmt=(value,places=4)=>Number.isFinite(value)?
 new Intl.NumberFormat('ru-RU',{maximumFractionDigits:places}).format(value):'—';
const signed=value=>(value>0?'+':'')+fmt(value)+'%';
const labels={
 INELIGIBLE:'Не подходит для исследования M5',
 NOT_READY:'Горизонт 15 мин ещё не завершён',
 INCOMPLETE:'Недостаточно непрерывных M5 свечей',
 INVALID:'Обнаружены неверные свечные данные',
 RATE_LIMITED:'Binance ограничила запросы',
 OFFLINE:'Нет ответа Binance Spot',
 DAILY_LIMIT:'Суточный лимит проверок M5 исчерпан',
 WAIT_INTERVAL:'Ещё не прошёл интервал между запросами M5',
 CLOCK_ERROR:'Проверьте системное время устройства',
 STORAGE_UNAVAILABLE:'Локальный журнал лимитов недоступен'
};
export function initNewsM5Panel({getSymbol,storage,
 now=()=>Date.now(),fetcher=fetchNewsPublishedM5}={}){
 const budget=createNewsM5Budget({storage,now});
 let request=0,controller=null;
 const container=()=>el('asset-news-m5-results');
 const state=()=>el('asset-news-m5-status');
 function reset(){
  request++;controller?.abort();controller=null;
  container()?.replaceChildren();
  if(state())state().textContent='Выберите публикацию для сопоставления с M5.';
 }
 function show(result){
  const card=div('section','news-m5-card');
  card.append(div('strong','',result.eventTitle),
   div('p','muted','Binance Spot · закрытые M5 · дата публикации '+
    new Date(result.eventAt).toLocaleString('ru-RU')));
  card.append(div('p','muted','За 60 минут до публикации: '+
   signed(result.priorHourReturnPercent)+
   ' · последняя полностью закрытая цена до публикации '+
   fmt(result.baselineClose,8)+' USDT.'));
  for(const point of result.observations){
   const line=div('div','news-m5-step');
   const volume=point.volumeVsPreviousHour===null?
    'объём не сопоставим':
    'средний объём '+fmt(point.volumeVsPreviousHour,2)+
     '× относительно предыдущих 12 M5';
   line.append(div('strong','',point.minutes+' мин · '+signed(point.changePercent)+
    ' · замер через '+fmt(point.sampledAfterMinutes,2)+' мин'),
    div('small','',
     'Диапазон относительно исходной цены: '+
     signed(point.lowestPercent)+' … '+signed(point.highestPercent)+
     ' · '+volume));
   card.append(line);
  }
  if(result.mixedCandleCaveat)card.append(div('p','footnote',
   'Время публикации попало внутрь свечи M5. Её объём и экстремумы исключены из оценки; движение внутри этой свечи разделить нельзя.'));
  card.append(div('p','footnote',
   'Сопоставление времени публикации с движением цены не устанавливает факта события, причинности или будущего направления рынка.'));
  container()?.replaceChildren(card);
 }
 async function run(article,symbol){
  const eligibility=newsM5Eligibility(article,{symbol,now:now()});
  if(eligibility.state!=='READY'){
   if(state())state().textContent=eligibility.reason||labels[eligibility.state];
   return;
  }
  controller?.abort();
  const signalController=new AbortController();
  controller=signalController;
  const id=++request;
  container()?.replaceChildren();
  if(state())state().textContent='Получаем закрытые M5 свечи Binance Spot…';
  try{
   const r=await budget.load(symbol,article.observedAt,
    ()=>fetcher(article,{symbol,signal:signalController.signal,now}));
   if(id!==request||getSymbol?.()!==symbol)return;
   const quota=r?.quota?' · проверок '+r.quota.used+'/'+r.quota.limit:'';
   if(!['OBSERVED','PARTIAL'].includes(r?.state)){
    state().textContent=(labels[r?.state]||r?.state||'Неизвестное состояние')+
     (r?.reason?' · '+r.reason:'')+quota;
    return;
   }
   state().textContent=(r.state==='PARTIAL'?
    'Часть горизонтов M5 ещё формируется':
    'Наблюдения M5: 15, 60 и 240 минут')+
    (r.cached?' · локальный кеш':' · ответ Binance Spot')+quota;
   show(r);
  }finally{
   if(controller===signalController)controller=null;
  }
 }
 function attach(article,row,symbol=getSymbol?.()){
  if(article?.timeKind!=='PUBLISHED')return;
  const check=newsM5Eligibility(article,{symbol,now:now()});
  const button=div('button','ghost asset-news-m5-button',
   check.state==='READY'?'Сопоставить M5':
    check.state==='NOT_READY'?'M5: свечи закрываются':'M5 недоступно');
  button.type='button';
  button.disabled=check.state!=='READY';
  button.title=check.reason||'Посмотреть движение цены после даты публикации';
  button.addEventListener('click',()=>void run(article,symbol));
  row.append(button);
 }
 return {attach,reset,status:()=>budget.status()};
}
