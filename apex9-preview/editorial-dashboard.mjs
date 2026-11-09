/**
 * APEX 9.1: quota-aware GDELT feeds and the official BLS schedule.
 * Sources are queried on demand only. No automated background poller.
 */
import {loadEditorialFeed} from './editorial-core.mjs';
import {fetchNewsBundle} from './news-gateway-client.mjs';
import {fetchPersonalNewsBundle} from './personal-news-client.mjs';
import {fetchPublicRssNews} from './public-rss-client.mjs';
import {composeLiveNews,sourceStatusLine} from './live-news-collection.mjs';
import {consolidateArticles} from './news-source-fusion.mjs';
import {describeNewsEvidence} from './news-evidence.mjs';
import {auditDisplayedNews,formatDisplayedNewsAudit} from './news-coverage.mjs';
import {createEditorialBudget,EDITORIAL_POLICY} from './editorial-budget.mjs';
import {loadBlsCalendar} from './macro-calendar.mjs';
import {fetchBlsIndicators} from './macro-indicators.mjs';
import {fetchBlsM5Comparison,COMPARE_VERSION} from './macro-event-comparison.mjs';
import {createBlsComparisonHistory} from './event-comparison-history.mjs';
import {routeGlobalEvents} from './market-event-router.mjs';
import {createEventHistory} from './event-history.mjs';
const get=id=>document.getElementById(id);
const node=(tag,cls='',content)=>{
 const x=document.createElement(tag);
 if(cls)x.className=cls;
 if(content!==undefined)x.textContent=String(content);
 return x;
};
const niceTime=t=>Number.isSafeInteger(t)&&t>0?
 new Date(t).toLocaleString('ru-RU',{day:'2-digit',month:'2-digit',
 year:'numeric',hour:'2-digit',minute:'2-digit'}):'неизвестно';
const quotaLine=(r,mode)=>{
 const v=r?.quota;
 if(!v)return ' · лимит недоступен';
 const next=v.nextAt&&v.nextAt>Date.now()?
  ' · следующий запрос не раньше '+niceTime(v.nextAt):'';
 return ' · запросов '+v.used+' / '+EDITORIAL_POLICY[mode].daily+
  ' за сутки (UTC)'+next;
};
export function initEditorialDashboard({getSymbol}={}){
 let storage=null;
 try{storage=window.localStorage;}catch{}
 const budget=createEditorialBudget({storage});
 const archive=createEventHistory({storage});
 const comparisonHistory=createBlsComparisonHistory({storage});
 const gatewayEnabled=document.querySelector('meta[name="apex-news-gateway-mode"]')?.content==='same-origin';
 let active=0,controller=null;
 function showFeed(mode,r){
  const list=get('editorial-'+mode+'-list'),status=get('editorial-'+mode+'-status');
  list.replaceChildren();
  if(mode==='news'){
   const symbol=String(getSymbol?.()||'BTCUSDT');
   const asset=symbol.replace(/(USDT|USDC|USD|EUR)$/,'');
   const quality=get('editorial-news-quality');
   if(quality)quality.textContent=formatDisplayedNewsAudit(
    auditDisplayedNews(r?.articles||[],{asset,now:Date.now()}),asset);
  }
  const available=['OK','EMPTY','STALE'].includes(r?.state);
  if(!available){
   status.textContent='GDELT · '+(r?.state||'OFFLINE')+
    (r?.reason?' · '+r.reason:'')+quotaLine(r,mode);
   list.append(node('p','muted','Источник недоступен. Новые публикации не выдумываются.'));
   return;
  }
  const stale=r.state==='STALE';
  const source=r.source==='MIXED'?'несколько источников':
   r.source==='NETWORK'?'обновлено':
   r.source==='CACHE'?'локальный кеш':'архивная копия';
  const label=r.source==='MIXED'?'Новостная сводка из доступных источников':'GDELT';
  status.textContent=label+' · '+source+' '+niceTime(r.fetchedAt)+
   (stale?' · актуальность не подтверждена':'')+quotaLine(r,mode);
  if(!r.articles?.length){
   list.append(node('p','muted','Нет публикаций, подходящих под выбранную тему.'));
   return;
  }
  for(const article of r.articles){
   const story=node('article','editorial-story');
   const link=node('a','editorial-story-title',article.title);
   link.href=article.href;link.target='_blank';link.rel='noopener noreferrer';
   const meta=node('div','editorial-story-meta');
   meta.append(node('span','',article.domain),
    node('time','',niceTime(article.observedAt)));
   if(mode==='news'){
    const asset=String(getSymbol?.()||'').replace(/(USDT|USDC|USD|EUR)$/,'');
    const evidence=describeNewsEvidence(article,{asset,now:Date.now()});
    meta.append(node('span','',evidence.timing+' · '+evidence.ageLabel));
    if(evidence.topics.length)
     meta.append(node('span','',evidence.topics.join(' / ')));
    if(evidence.focus==='DIRECT')
     meta.append(node('span','','Упоминает '+asset));
    if(evidence.indexerCount>1)
     meta.append(node('span','','Индексаторы: '+evidence.indexers.join(', ')+
      ' · не независимая проверка'));
    else if(evidence.indexerCount===1)
     meta.append(node('span','','Индексатор: '+evidence.indexers[0]));
    if(evidence.freshness==='OLD')
     meta.append(node('span','editorial-stale-label',
      'Материал старше 24 часов'));
   }else if(article.indexedBy?.length){
    meta.append(node('span','',article.indexedBy.join(' / ')));
   }
   if(stale||article.outdated===true)meta.append(node('span','editorial-stale-label','Архив · не свежая публикация'));
   story.append(link,meta);list.append(story);
  }
 }
 function showIndicators(r){
  const list=get('macro-indicators-list'),status=get('macro-indicators-status');
  list.replaceChildren();
  if(!['OK','EMPTY','STALE'].includes(r?.state)){
   status.textContent='BLS Public Data API v1 · '+(r?.state||'OFFLINE')+
    (r?.reason?' · '+r.reason:'')+quotaLine(r,'macroData');
   list.append(node('p','muted','Числовые данные недоступны. Значения не подставляются.'));
   return;
  }
  const stale=r.state==='STALE';
  status.textContent='BLS API v1 · '+(stale?'архив от ':'получено ')+
   niceTime(r.fetchedAt)+(stale?' · устарело':'')+quotaLine(r,'macroData');
  if(!r.indicators?.length){
   list.append(node('p','muted','По выбранным сериям нет числовых наблюдений.'));
   return;
  }
  for(const s of r.indicators){
   const card=node('article','macro-indicator-card');
   card.append(node('strong','',s.name),
    node('span','macro-indicator-value',
     s.value.toLocaleString('ru-RU',{maximumFractionDigits:3})+' '+s.unit),
    node('small','',s.period+' · месяц наблюдения'+
     (s.preliminary?' · предварительно':'')));
   if(s.yoyPercent!==null)card.append(node('small','',
    'Изменение к тому же месяцу год назад: '+s.yoyPercent.toFixed(2)+
    '% (расчёт из доступных значений)'));
   card.append(node('small','','Дата фактической публикации не указана в ряду.'));
   list.append(card);
  }
 }
 let refreshSavedComparisons=()=>{};
 function showSavedComparisons(target){
  const box=node('details','macro-compare-history');
  const title=node('summary','','История сравнений по BTC и ETH · устройство');
  const state=node('p','muted');
  const list=node('div','apex-event-history-list');
  box.append(title,state,list);target.append(box);
  refreshSavedComparisons=()=>{
   list.replaceChildren();
   const report=comparisonHistory.list({limit:20});
   if(report.state!=='OK'){
    state.textContent='Архив сравнений недоступен · '+report.state;
    return;
   }
   state.textContent='Наблюдений BTC: '+report.btc+
    ' · ETH: '+report.eth+' · всего: '+report.total+
    '. Только первые сохранённые полные проверки.';
   if(!report.entries.length)list.append(node('p','muted',
    'Сравнения появятся после ручной проверки события по закрытым M5.'));
   for(const entry of report.entries){
    const row=node('article','apex-event-history-row');
    row.append(node('strong','',entry.symbol+' · '+entry.title),
     node('small','','Запланировано '+niceTime(entry.eventAt)+
      ' · наблюдение сохранено '+niceTime(entry.savedAt)));
    for(const m of entry.comparison){
     row.append(node('small','',m.minutes+' мин: изменение '+
      (m.eventReturnPercent>0?'+':'')+m.eventReturnPercent.toFixed(2)+'%'+
      ' · контрольная |амплитуда| '+m.priorMeanAbsolutePercent.toFixed(2)+'%'));
    }
    row.append(node('small','','Публикация не подтверждалась; влияние не доказано.'));
    list.append(row);
   }
  };
  refreshSavedComparisons();
 }
 function showCalendar(r){
  const list=get('macro-calendar-list'),status=get('macro-calendar-status');
  list.replaceChildren();
  if(!['OK','EMPTY','STALE'].includes(r?.state)){
   status.textContent='BLS · '+(r?.state||'OFFLINE')+
    (r?.reason?' · '+r.reason:'')+quotaLine(r,'calendar');
   list.append(node('p','muted','Расписание не подтверждено; даты не подставляются.'));
   showSavedComparisons(list);
   return;
  }
  const stale=r.state==='STALE';
  status.textContent='BLS · '+(stale?'сохранённый архив':'календарь')+
   ' от '+niceTime(r.fetchedAt)+
   (stale?' · требуется перепроверка':'')+quotaLine(r,'calendar');
  const future=(r.events||[]).filter(e=>Number.isSafeInteger(e.at)&&e.at>Date.now())
   .sort((a,b)=>a.at-b.at).slice(0,10);
  if(!future.length)
   list.append(node('p','muted','Ближайших подтверждённых дат в сохранённых данных нет.'));
  for(const event of future){
   const row=node('article','editorial-calendar-event');
   row.append(node('time','',niceTime(event.at)),
    node('strong','',event.title),
    node('span','',stale?'Архив: проверьте актуальный календарь BLS':
     'Плановая публикация · значения ещё не получены'));
   list.append(row);
  }
  // The observed market movement cannot prove the official release happened.
  const recent=(r.events||[]).filter(e=>
   e?.source==='BLS_OFFICIAL_CALENDAR'&&
   e.status==='SCHEDULED_NOT_RELEASED'&&
   Number.isSafeInteger(e.at)&&e.at+4*3600000<Date.now()&&
   Date.now()-e.at<48*3600000).sort((a,b)=>b.at-a.at);
  if(recent.length){
   const event=recent[0];
   const box=node('section','macro-reaction-panel');
   box.append(node('strong','','BTC / ETH · сравнение с двумя предыдущими днями'),
    node('p','muted',event.title+' · '+niceTime(event.at)+
     '. Один запрос 625 закрытых M5 по Spot; тот же час UTC за 1 и 2 дня '+
     'до планового события. Это не контроль всех других новостей.'));
   for(const symbol of ['BTCUSDT','ETHUSDT']){
    const row=node('section','macro-comparison-symbol');
    const button=node('button','ghost',
     'Исследовать '+(symbol==='BTCUSDT'?'BTC':'ETH')+' · M5');
    button.type='button';
    const state=node('p','chart-status',
     'По запросу · общий лимит 6 исследований/сутки · интервал 30 минут');
    const summary=node('div','macro-reaction-steps');
    button.addEventListener('click',async()=>{
     button.disabled=true;
     state.textContent='Проверяем 625 свечей M5 и локальный лимит…';
     summary.replaceChildren();
     try{
      // A unique cache key avoids reusing old, single-window eventStudy data.
      const result=await budget.load('eventStudy',async()=>{
       const response=await fetchBlsM5Comparison(event,{symbol});
       return response.state==='OBSERVED'?{...response,state:'OK'}:response;
      },{key:symbol+':'+event.at+':compare'});
      const accepted=['OK','STALE'].includes(result.state)&&
       result.version===COMPARE_VERSION&&
       result.completeM5Candles===625&&
       Array.isArray(result.comparison)&&result.comparison.length===3;
      if(!accepted){
       state.textContent='Исследование не подтверждено: '+result.state+
        (result.sourceState?' / '+result.sourceState:'')+
        quotaLine(result,'eventStudy');
       summary.append(node('p','muted',
        result.reason||'Требуются полные закрытые M5; пропуски не восстанавливаем.'));
      }else{
       state.textContent=(result.state==='STALE'?
        'Сохранённый архив сравнения · ':'Полное сравнение · ')+symbol+
        ' · '+result.completeM5Candles+' M5'+quotaLine(result,'eventStudy');
       for(const observation of result.comparison){
        const signed=x=>(x>0?'+':'')+x.toFixed(2)+'%';
        const difference=observation.differenceAbsolutePp;
        summary.append(node('span','',
         observation.minutes+' мин · событие '+signed(observation.eventReturnPercent)+
         ' · вчера '+signed(observation.previousDayReturnPercent)+
         ' · 2 дня назад '+signed(observation.twoDaysBeforeReturnPercent)+
         ' · средняя |амплитуда| контроля '+
         observation.priorMeanAbsolutePercent.toFixed(2)+'%'+
         ' · разница |движения| '+(difference>0?'+':'')+
         difference.toFixed(2)+' п.п.'));
       }
       // Preserve the first complete observation; never rewrite older snapshots.
       comparisonHistory.save({...result,state:'OBSERVED'});
       refreshSavedComparisons();
      }
     }catch(err){
      state.textContent='Ошибка исследования M5';
      summary.append(node('p','muted',
       String(err?.message||err).slice(0,120)));
     }finally{button.disabled=false;}
    });
    row.append(button,state,summary);
    box.append(row);
   }
   box.append(node('p','footnote',
    'Всего 2 контрольных окна. Не исключены другие события, '+
    'пересмотры данных и рыночный шум. Ни причинность, ни точность прогноза '+
    'по этим числам не установлены.'));
   list.append(box);
  }
  showSavedComparisons(list);
 }
 function showEventHistory(){
  const status=get('overview-event-history-status'),
   target=get('overview-event-history');
  if(!status||!target)return;
  target.replaceChildren();
  const saved=archive.list({limit:12});
  if(saved.state!=='OK'){
   status.textContent='Локальный архив недоступен';
   target.append(node('p','muted','Не удалось проверить сохранённые события.'));
   return;
  }
  status.textContent='Сохранено на этом устройстве: '+saved.stored+
   ' · показано: '+saved.events.length;
  if(!saved.events.length)target.append(node('p','muted',
   'История будет пополняться после получения публикаций.'));
  for(const event of saved.events){
   const card=node('article','apex-event-history-row');
   const link=node('a','',event.title);
   link.href=event.href;link.rel='noopener noreferrer';link.target='_blank';
   const label=event.kind==='MACRO'?'Макро':event.kind==='SCHEDULE'?
    'План BLS':event.kind==='SOCIAL'?'Соцсети':'Новости';
   card.append(link,node('small','',
    label+' · '+niceTime(event.eventAt)+' · '+event.source+
    (event.timeKind==='SCHEDULED'?' · событие только запланировано':'')+
    ' · влияние не доказано'));
   target.append(card);
  }
 }
 async function open(mode,{force=false}={}){
  if(!['news','macro'].includes(mode))return;
  const seq=++active;
  controller?.abort();
  const current=new AbortController();
  controller=current;
  const timer=setTimeout(()=>current.abort(),11000);
  get('editorial-'+mode+'-status').textContent='Проверяем источник и кеш…';
  if(mode==='macro'){
   get('macro-calendar-status').textContent='Проверяем расписание BLS…';
   get('macro-indicators-status').textContent='Проверяем числовые показатели BLS…';
  }
  try{
   const queries=[
    budget.load(mode,()=>loadEditorialFeed(mode,{signal:current.signal}),{force})
   ];
   if(mode==='news'){
    const symbol=String(getSymbol?.()||'BTCUSDT');
    const coin=symbol.endsWith('USDT')?symbol.slice(0,-4):'';
    queries.push(gatewayEnabled?fetchNewsBundle(coin,{
     enabled:true,location:window.location,signal:current.signal}):
     fetchPersonalNewsBundle(coin));
    queries.push(fetchPublicRssNews());
   }
   if(mode==='macro'){
    queries.push(budget.load('macroData',
     ()=>fetchBlsIndicators({signal:current.signal}),{force}));
    queries.push(budget.load('calendar',
     ()=>loadBlsCalendar({signal:current.signal}),{force}));
   }
   const results=await Promise.all(queries);
   if(seq!==active)return;
   if(mode==='news'){
    const merged=composeLiveNews({
     gdelt:results[0],personal:results[1],rss:results[2]},{now:Date.now()});
    showFeed(mode,merged);
    const statuses=sourceStatusLine(merged.sources);
    get('editorial-news-status').textContent=
     'Новостей: '+merged.articles.length+
     ' · фактические источники: '+statuses+
     quotaLine(results[0],'news');
    const extra=get('news-extra-provider-status');
    if(extra)extra.textContent='Подключения: '+statuses+
     ' · отсутствие статей не означает отсутствие событий';
    archive.captureGlobal({news:merged});
   }else showFeed(mode,results[0]);
   if(mode==='macro'){
    archive.captureGlobal({macro:results[0],calendar:results[2]});
    showEventHistory();
    showIndicators(results[1]);
    showCalendar(results[2]);
   }
  }catch(e){
   if(seq!==active)return;
   showFeed(mode,{state:'OFFLINE',reason:String(e?.message||e).slice(0,140)});
   if(mode==='macro'){
    showIndicators({state:'OFFLINE'});
    showCalendar({state:'OFFLINE'});
   }
  }finally{
   clearTimeout(timer);
   if(seq===active)controller=null;
  }
 }
 async function openOverview(){
  const status=get('overview-events-status');
  const list=get('overview-events-list');
  if(!status||!list)return;
  status.textContent='Проверяем публичные источники и сохранённые события…';
  const [gdelt,macro,calendar,rss,personal]=await Promise.all([
   budget.load('news',()=>loadEditorialFeed('news')),
   budget.load('macro',()=>loadEditorialFeed('macro')),
   budget.load('calendar',()=>loadBlsCalendar()),
   fetchPublicRssNews(),
   fetchPersonalNewsBundle(
    String(getSymbol?.()||'BTCUSDT').replace(/(USDT|USDC|USD|EUR)$/,''))
  ]);
  const news=composeLiveNews({gdelt,rss,personal},{now:Date.now()});
  list.replaceChildren();
  archive.captureGlobal({news,macro,calendar});
  showEventHistory();
  const results=routeGlobalEvents(news,macro,calendar,{now:Date.now(),max:5});
  status.textContent='Новости '+news.articles.length+
   ' · '+sourceStatusLine(news.sources)+
   ' · макро: '+sourceStatusLine({gdelt_macro:macro.state,
    bls_calendar:calendar.state})+
   ' · заголовки не подтверждают влияние на рынок';
  if(!results.length){
   list.append(node('p','muted','Проверенных по формату новостных заголовков и актуальных календарных записей пока нет. Причины указаны выше.'));
   return;
  }
  for(const event of results){
   const item=node('article','overview-event-row');
   const link=node('a','',event.title);
   link.href=event.href;link.rel='noopener noreferrer';link.target='_blank';
   item.append(link,node('small','',
    (event.group==='calendar'?'План BLS · ':
     event.group==='macro'?'Макроэкономика · ':'Криптоновости · ')+
    niceTime(event.observedAt)+
    (event.outdated?' · архивная информация':'')+
    (event.importance==='RECENT_UNRANKED'?' · обычная публикация':' · тематическое совпадение')));
   list.append(item);
  }
 }
 for(const mode of ['news','macro'])
  get('editorial-'+mode+'-refresh')?.addEventListener('click',
   ()=>void open(mode,{force:true}));
 return {open,openOverview};
}
