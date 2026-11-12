/**
 * APEX 9 / Clean Intelligence - Major Stage 8.
 * News + Macro + Settings are re-composed around existing API-backed DOM
 * nodes. No new fetching, retrying, artificial scores, fabricated events,
 * or persistence of secrets. Existing Android listeners remain attached.
 */
const id=name=>document.getElementById(name);
const make=(tag,cls='',text)=>{
 const node=document.createElement(tag);
 if(cls)node.className=cls;
 if(text!==undefined)node.textContent=String(text);
 return node;
};
const meaningful=s=>String(s??'').trim().replace(/\s+/g,' ');
export function editorialState(raw){
 const text=meaningful(raw);
 if(!text||/^(?:проверяем|ожидаем|загружаем|читаем)(?:\s|$|[.…])/i.test(text))
  return {state:'LOADING',label:'Проверяем источники'};
 if(/(?:\b(?:OFFLINE|ERROR|FAILED|INVALID)\b|недоступ|сбой|не удалось|не получен)/i.test(text))
  return {state:'UNAVAILABLE',label:'Источник недоступен'};
 if(/(?:архив|локальный кеш|локальный кэш|сохранён|устарел|требуется перепроверка|актуальность не подтверждена)/i.test(text))
  return {state:'SAVED',label:'Сохранённые данные'};
 if(/^новостей:\s*\d+/i.test(text))
  return {state:'REPORTED',label:'Сводка источников доступна'};
 if(/(?:обновлено|календарь|^BLS ·)/i.test(text))
  return {state:'OBSERVED',label:'Проверен ответ источника'};
 return {state:'UNKNOWN',label:'Свежесть неизвестна'};
}
export function visibleEditorialStory({mode='all',archived=false,direct=false}={}){
 if(mode==='all')return true;
 if(mode==='direct')return direct===true;
 if(mode==='archive')return archived===true;
 return true;
}
export function nextObservedMacroEvent(entries=[]){
 if(!Array.isArray(entries))return null;
 const first=entries.find(x=>
  x&&typeof x.title==='string'&&x.title.trim()&&
  typeof x.time==='string'&&x.time.trim());
 if(!first)return null;
 return {title:first.title.trim(),time:first.time.trim(),
  archive:first.archive===true};
}
function bindSourceText(source,render){
 if(!source)return;
 new MutationObserver(render).observe(source,{
  childList:true,characterData:true,subtree:true
 });
 render();
}
function button(label,cls,callback){
 const node=make('button',cls,label);
 node.type='button';
 node.addEventListener('click',callback);
 return node;
}
function scrollWithin(node){
 if(!node)return;
 node.scrollIntoView({behavior:'smooth',block:'start'});
}
function mountNews(){
 const page=id('view-news'),title=page?.querySelector(':scope > .section-title');
 const list=id('editorial-news-list'),status=id('editorial-news-status');
 const analysis=id('editorial-news-analysis'),quality=id('editorial-news-quality');
 const budget=page?.querySelector('.editorial-budget-row');
 const refresh=id('editorial-news-refresh');
 const sources=id('news-extra-provider-status');
 if(!page||!title||!list||!status||!analysis||!quality||!budget||
  !refresh||!sources||id('ci8-news-hero'))return;
 const intro=page.querySelector(':scope > p.muted');
 const hero=make('section','ci8-editorial-hero ci8-news-hero');
 hero.id='ci8-news-hero';
 hero.append(make('p','ci8-kicker','APEX · VERIFIED NEWS'),
  make('h3','','Новостная картина'),
  make('p','ci8-lead',
   'Реальные публикации, их свежесть и связь с избранным активом.'));
 const facts=make('div','ci8-editorial-facts');
 const statusBox=make('div','ci8-editorial-fact');
 statusBox.append(make('span','','Состояние источников'),
  make('strong','','Проверяем источники'));
 const countBox=make('div','ci8-editorial-fact');
 countBox.append(make('span','','Найдено материалов'),
  make('strong','','—'));
 facts.append(statusBox,countBox);
 const actions=make('div','ci8-editorial-hero-actions');
 actions.append(refresh,
  button('Исследовать актив','ci8-secondary-action',()=>{
   document.querySelector('[data-tab="overview"]')?.click();
   scrollWithin(id('overview-favorites-anchor'));
  }));
 hero.append(facts,actions);
 title.after(hero);
 const filters=make('section','ci8-news-filters');
 filters.setAttribute('aria-label','Отбор новостей по фактическим меткам');
 const toolbar=make('div','ci8-news-filter-actions');
 const explanation=make('p','ci8-filter-explain',
  'Прямые упоминания — только отмеченные источником публикации. Архив показан отдельно.');
 const result=make('p','ci8-news-filter-result','Источники проверяются');
 result.setAttribute('role','status');
 let current='all';
 const controlSet=[];
 const buttons=[
  {key:'all',name:'Все публикации'},
  {key:'direct',name:'По активу'},
  {key:'archive',name:'Архив'}
 ];
 for(const {key,name} of buttons){
  const control=button(name,'ci8-filter-button',()=>{
   current=key;
   for(const [value,btn] of controlSet)
    btn.setAttribute('aria-pressed',String(current===value));
   render();
  });
  control.setAttribute('aria-pressed',String(key===current));
  controlSet.push([key,control]);
  toolbar.append(control);
 }
 filters.append(toolbar,result,explanation);
 hero.after(filters);
 const details=make('details','ci8-editorial-method');
 details.append(make('summary','','Методика, лимиты и качество источников'));
 if(intro)details.append(intro);
 details.append(budget,status,analysis,quality,sources);
 list.after(details);
 const render=()=>{
  const sourceState=editorialState(status.textContent);
  const box=statusBox.querySelector('strong');
  box.textContent=sourceState.label;
  box.dataset.state=sourceState.state;
  const stories=[...list.querySelectorAll(':scope > .editorial-story')];
  const entries=stories.map(card=>({
   node:card,
   archived:Boolean(card.querySelector('.editorial-stale-label')),
   direct:(card.querySelector('.editorial-story-meta')?.textContent||'')
    .includes('Упоминает ')
  }));
  const count=countBox.querySelector('strong');
  const known=sourceState.state!=='LOADING'&&sourceState.state!=='UNKNOWN';
  count.textContent=known?String(entries.length):'—';
  let shown=0;
  for(const entry of entries){
   const visible=visibleEditorialStory({...entry,mode:current});
   entry.node.hidden=!visible;
   if(visible)shown++;
  }
  const message=!known?'Ожидаем подтверждения источников':
   !entries.length?'Подходящих публикаций пока нет':
   'Показано '+shown+' из '+entries.length+' · '+(
    current==='all'?'все материалы':
    current==='direct'?'упоминания актива':'архивные материалы');
  result.textContent=message;
 };
 new MutationObserver(render).observe(list,{childList:true});
 bindSourceText(status,render);
 render();
}
function mountMacro(){
 const page=id('view-macro'),title=page?.querySelector(':scope > .section-title');
 const feed=id('editorial-macro-list');
 const feedStatus=id('editorial-macro-status');
 const indicators=page?.querySelector('.macro-indicators-panel');
 const indicatorStatus=id('macro-indicators-status');
 const calendar=page?.querySelector('.editorial-calendar-card');
 const calendarStatus=id('macro-calendar-status');
 const events=id('macro-calendar-list');
 const refresh=id('editorial-macro-refresh');
 const budget=page?.querySelector('.editorial-budget-row');
 const links=page?.querySelector('.macro-source-links');
 if(!page||!title||!feed||!feedStatus||!indicators||!indicatorStatus||
  !calendar||!calendarStatus||!events||!refresh||!budget||!links||
  id('ci8-macro-hero'))return;
 const intro=page.querySelector(':scope > p.muted');
 const hero=make('section','ci8-editorial-hero ci8-macro-hero');
 hero.id='ci8-macro-hero';
 hero.append(make('p','ci8-kicker','APEX · MACRO CONTEXT'),
  make('h3','','События и экономика'),
  make('p','ci8-lead',
   'Официальный календарь и показатели — без предположений о влиянии на рынок.'));
 const stateGrid=make('div','ci8-macro-brief');
 for(const [title,idKey] of [
  ['Календарь BLS','calendar'],
  ['Показатели','indicators'],
  ['Публикации','news']
 ]){
  const cell=make('div','ci8-macro-state');
  cell.dataset.source=idKey;
  cell.append(make('span','',title),
   make('strong','','Проверяем источники'));
  stateGrid.append(cell);
 }
 const next=make('div','ci8-next-event');
 next.append(make('small','','Ближайшее событие по данным BLS'),
  make('strong','','Нет подтверждённой даты'),
  make('span','','Даты без проверенного ответа не подставляются.'));
 const refreshArea=make('div','ci8-editorial-hero-actions');
 refreshArea.append(refresh);
 hero.append(stateGrid,next,refreshArea);
 title.after(hero);
 // Put the official calendar before numeric indicators, then news stories.
 hero.after(calendar);
 calendar.after(indicators);
 indicators.after(feed);
 const shortcuts=make('nav','ci8-macro-shortcuts');
 shortcuts.setAttribute('aria-label','Перейти к макроисследованиям');
 for(const [name,node] of [
  ['Календарь',calendar],['Показатели',indicators],['Новости',feed]
 ]){
  const ctl=button(name,'ci8-macro-shortcut',()=>scrollWithin(node));
  shortcuts.append(ctl);
 }
 hero.after(shortcuts);
 const details=make('details','ci8-editorial-method');
 details.append(make('summary','','Официальные источники, методика и лимиты'));
 if(intro)details.append(intro);
 details.append(links,budget,feedStatus);
 feed.after(details);
 const stateTexts={
  calendar:calendarStatus,indicators:indicatorStatus,news:feedStatus
 };
 const update=()=>{
  for(const cell of stateGrid.children){
   const kind=cell.dataset.source;
   const state=editorialState(stateTexts[kind]?.textContent);
   const label=cell.querySelector('strong');
   label.textContent=state.label;
   label.dataset.state=state.state;
  }
  const entries=[...events.querySelectorAll(':scope > .editorial-calendar-event')];
  const values=entries.map(entry=>({
   title:entry.querySelector('strong')?.textContent||'',
   time:entry.querySelector('time')?.textContent||'',
   archive:entry.textContent.includes('Архив')
  }));
  const first=nextObservedMacroEvent(values);
  const name=next.querySelector('strong'),sub=next.querySelector('span');
  if(first){
   name.textContent=first.title;
   sub.textContent=first.time+(first.archive?
    ' · архив: перепроверьте официальный календарь':
    ' · плановая дата, публикация ещё не подтверждена');
  }else{
   name.textContent='Нет подтверждённой даты';
   sub.textContent='Календарь BLS не сообщил ближайшего события.';
  }
 };
 new MutationObserver(update).observe(events,{childList:true});
 for(const s of Object.values(stateTexts))bindSourceText(s,update);
 update();
}
export function settingGroupTitles(){
 return [
  {id:'updates',title:'Синхронизация',tag:'Обновления и фон'},
  {id:'alerts',title:'Оповещения',tag:'Прогнозы · M1'},
  {id:'screen',title:'Экран',tag:'Поведение телефона'},
  {id:'backup',title:'Резервный архив',tag:'Облако · шифрование'}
 ];
}
function mountSettings(){
 const dialog=id('apex-settings-dialog');
 const header=dialog?.querySelector(':scope > .apex-settings-head');
 if(!dialog||!header||id('ci8-settings-nav'))return;
 const groups=[[],[],[],[]];
 let index=0;
 // Moving real labels and controls preserves native listeners, disabled
 // status, Android lifecycle and secret input handling.
 for(const node of [...dialog.children]){
  if(node===header)continue;
  if(node.classList.contains('apex-settings-divider')){
   index=Math.min(index+1,3);
   node.remove();
   continue;
  }
  groups[index].push(node);
 }
 const nav=make('nav','ci8-settings-nav');
 nav.id='ci8-settings-nav';
 nav.setAttribute('aria-label','Категории настроек APEX');
 const sections=[];
 for(const [index,info] of settingGroupTitles().entries()){
  const section=make('section','ci8-settings-section');
  section.id='ci8-settings-'+info.id;
  section.append(make('p','ci8-settings-kicker',info.tag));
  section.append(make('h3','',info.title));
  for(const node of groups[index]){
   if(node.classList.contains('apex-settings-subtitle'))node.hidden=true;
   section.append(node);
  }
  dialog.append(section);
  sections.push(section);
  const control=button(info.title,'ci8-settings-nav-button',()=>{
   scrollWithin(section);
  });
  nav.append(control);
 }
 header.after(nav);
 dialog.classList.add('ci8-settings-redesigned');
}
/** Runs AFTER the original app registers all controls. */
export function initCleanIntelligenceEditorial(){
 mountNews();
 mountMacro();
 mountSettings();
 document.body.dataset.apexEditorialLayout='professional';
 return true;
}
