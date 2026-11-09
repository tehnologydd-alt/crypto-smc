/**
 * APEX 9.1: quota-aware GDELT feeds and the official BLS schedule.
 * Sources are queried on demand only. No automated background poller.
 */
import {loadEditorialFeed} from './editorial-core.mjs';
import {createEditorialBudget,EDITORIAL_POLICY} from './editorial-budget.mjs';
import {loadBlsCalendar} from './macro-calendar.mjs';
import {fetchBlsIndicators} from './macro-indicators.mjs';
import {fetchScheduledEventReaction} from './macro-event-reaction.mjs';
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
export function initEditorialDashboard(){
 let storage=null;
 try{storage=window.localStorage;}catch{}
 const budget=createEditorialBudget({storage});
 let active=0,controller=null;
 function showFeed(mode,r){
  const list=get('editorial-'+mode+'-list'),status=get('editorial-'+mode+'-status');
  list.replaceChildren();
  const available=['OK','EMPTY','STALE'].includes(r?.state);
  if(!available){
   status.textContent='GDELT · '+(r?.state||'OFFLINE')+
    (r?.reason?' · '+r.reason:'')+quotaLine(r,mode);
   list.append(node('p','muted','Источник недоступен. Новые публикации не выдумываются.'));
   return;
  }
  const stale=r.state==='STALE';
  const source=r.source==='NETWORK'?'обновлено':
   r.source==='CACHE'?'локальный кеш':'архивная копия';
  status.textContent='GDELT · '+source+' '+niceTime(r.fetchedAt)+
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
   if(stale)meta.append(node('span','editorial-stale-label','Архив · не свежая публикация'));
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
 function showCalendar(r){
  const list=get('macro-calendar-list'),status=get('macro-calendar-status');
  list.replaceChildren();
  if(!['OK','EMPTY','STALE'].includes(r?.state)){
   status.textContent='BLS · '+(r?.state||'OFFLINE')+
    (r?.reason?' · '+r.reason:'')+quotaLine(r,'calendar');
   list.append(node('p','muted','Расписание не подтверждено; даты не подставляются.'));
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
  // A historical BTC comparison does not claim that the scheduled release occurred.
  const recent=(r.events||[]).filter(e=>
   e?.source==='BLS_OFFICIAL_CALENDAR'&&
   e.status==='SCHEDULED_NOT_RELEASED'&&
   Number.isSafeInteger(e.at)&&e.at+4*3600000<Date.now()&&
   Date.now()-e.at<48*3600000).sort((a,b)=>b.at-a.at);
  if(recent.length){
   const e=recent[0];
   const box=node('section','macro-reaction-panel');
   box.append(node('strong','','BTC · цена вокруг времени в календаре'),
    node('p','muted',e.title+' · '+niceTime(e.at)+
     '. Не доказано, что движение вызвано этим событием.'));
   const button=node('button','ghost','Проверить реакцию · M5');
   button.type='button';
   const state=node('p','chart-status',
    'Только вручную · до 6 запросов в сутки · интервал 30 минут');
   const summary=node('div','macro-reaction-steps');
   button.addEventListener('click',async()=>{
    button.disabled=true;
    state.textContent='Проверяем закрытые M5 и лимит…';
    summary.replaceChildren();
    try{
     const result=await budget.load('eventStudy',async()=>{
      const evidence=await fetchScheduledEventReaction(e,{symbol:'BTCUSDT'});
      return evidence.state==='OBSERVED'?{...evidence,state:'OK'}:evidence;
     },{key:'BTCUSDT:'+e.at});
     const accepted=['OK','STALE'].includes(result.state)&&
      Array.isArray(result.observations);
     state.textContent=(accepted?'Источник: Binance Spot · закрытые M5':
      'Наблюдение не подтверждено: '+result.state)+quotaLine(result,'eventStudy');
     if(accepted){
      for(const item of result.observations){
       summary.append(node('span','',item.minutes+' мин · '+
        (item.returnPercent>0?'+':'')+item.returnPercent.toFixed(2)+'%'+
        ' · диапазон '+item.lowestPercent.toFixed(2)+'%…'+
        item.highestPercent.toFixed(2)+'%'));
      }
     }else summary.append(node('p','muted',
      result.reason||'Нет непрерывной полной истории M5.'));
    }catch(err){
     state.textContent='Не удалось проверить M5';
     summary.append(node('p','muted',String(err?.message||err).slice(0,120)));
    }finally{button.disabled=false;}
   });
   box.append(button,state,summary);
   list.append(box);
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
   if(mode==='macro'){
    queries.push(budget.load('macroData',
     ()=>fetchBlsIndicators({signal:current.signal}),{force}));
    queries.push(budget.load('calendar',
     ()=>loadBlsCalendar({signal:current.signal}),{force}));
   }
   const results=await Promise.all(queries);
   if(seq!==active)return;
   showFeed(mode,results[0]);
   if(mode==='macro'){
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
 for(const mode of ['news','macro'])
  get('editorial-'+mode+'-refresh')?.addEventListener('click',
   ()=>void open(mode,{force:true}));
 return {open};
}
