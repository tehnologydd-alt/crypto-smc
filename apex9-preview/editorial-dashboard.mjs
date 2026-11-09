/**
 * APEX 9.1: quota-aware GDELT feeds and the official BLS schedule.
 * Sources are queried on demand only. No automated background poller.
 */
import {loadEditorialFeed} from './editorial-core.mjs';
import {createEditorialBudget,EDITORIAL_POLICY} from './editorial-budget.mjs';
import {loadBlsCalendar} from './macro-calendar.mjs';
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
  if(!future.length){
   list.append(node('p','muted','Ближайших подтверждённых дат в сохранённых данных нет.'));
   return;
  }
  for(const event of future){
   const row=node('article','editorial-calendar-event');
   row.append(node('time','',niceTime(event.at)),
    node('strong','',event.title),
    node('span','',stale?'Архив: проверьте актуальный календарь BLS':
     'Плановая публикация · значения ещё не получены'));
   list.append(row);
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
  if(mode==='macro')get('macro-calendar-status').textContent='Проверяем расписание BLS…';
  try{
   const queries=[
    budget.load(mode,()=>loadEditorialFeed(mode,{signal:current.signal}),{force})
   ];
   if(mode==='macro')
    queries.push(budget.load('calendar',
     ()=>loadBlsCalendar({signal:current.signal}),{force}));
   const results=await Promise.all(queries);
   if(seq!==active)return;
   showFeed(mode,results[0]);
   if(mode==='macro')showCalendar(results[1]);
  }catch(e){
   if(seq!==active)return;
   showFeed(mode,{state:'OFFLINE',reason:String(e?.message||e).slice(0,140)});
   if(mode==='macro')showCalendar({state:'OFFLINE'});
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
