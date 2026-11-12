/**
 * APEX 9 / Clean Intelligence - major redesign stage 6.
 *
 * A phone-first WORKSPACE, not demo content. All statistics are projections
 * from the original Room/public-API backed DOM nodes and original buttons.
 * Navigation remains owned by app.mjs; this module never calls APIs itself.
 */
const id=name=>document.getElementById(name);
const el=(tag,klass='',label)=>{
 const n=document.createElement(tag);
 if(klass)n.className=klass;
 if(label!==undefined)n.textContent=label;
 return n;
};
const observed=s=>{
 const value=String(s||'').trim();
 return value&&value!=='—'&&!/^загружа|^ожида|^проверя/i.test(value)?
  value:'—';
};
/** Avoid reporting default HTML zeroes as verified research. */
export function dashboardPulseSnapshot({
 roomReady=false,active='0',limit='0',radarReady=false,radarChanges='0',
 sources='',favoriteCount='0 / 10'
}={}){
 const count=value=>roomReady&&/^\d+$/.test(String(value).trim())?
  String(value).trim():'—';
 const radar=radarReady&&/^\d+/.test(String(radarChanges).trim())?
  String(radarChanges).trim().match(/^\d+/)[0]:'—';
 return {
  active:count(active),limit:count(limit),radar,
  favoriteCount:observed(favoriteCount),
  source:observed(sources),
  note:roomReady?'Room · сохранённый журнал APEX':
   'Room · исследовательский журнал ещё не получен'
 };
}
export function scenarioTaskStage(stage){
 return ['PENDING_CONFIRMATION','CONFIRMED','ACTIVE','COMPLETED']
  .includes(stage)?stage:null;
}
function existingButton(selector){
 const target=document.querySelector(selector);
 if(target instanceof HTMLButtonElement&&!target.disabled)target.click();
}
function action(label,klass,click,description){
 const b=el('button',klass,label);
 b.type='button';b.addEventListener('click',click);
 if(description)b.setAttribute('aria-label',description);
 return b;
}
function mountCommandOverview(){
 const root=id('view-overview'),market=id('ci-market');
 const favorite=id('overview-favorites-anchor');
 if(!root||!market||!favorite||id('ci6-command-center'))return;
 // Scope header and favorites together: the original swipeable rail and its
 // native Android persistence stay mounted, not cloned.
 const heading=document.querySelector('.ci-screen-heading');
 const header=el('section','ci6-welcome');
 header.id='ci6-command-center';
 const kicker=el('p','ci6-kicker','APEX · MARKET INTELLIGENCE');
 const headline=el('h2','','Пульс рынка');
 const lead=el('p','ci6-welcome-lead',
  'Избранные активы, исследования и изменения — сразу под рукой.');
 const source=el('p','ci6-source-state','Проверяем источники…');
 source.setAttribute('role','status');
 const pulse=el('div','ci6-pulse-grid');
 const metrics=[
  ['Активные','ci6-pulse-active',()=>{
   existingButton('[data-tab="forecasts"]');
   existingButton('[data-journal-stage="ACTIVE"]');
  },'Открыть активные сценарии'],
  ['Лимитные','ci6-pulse-limit',()=>{
   existingButton('[data-tab="forecasts"]');
   existingButton('[data-journal-stage="CONFIRMED"]');
  },'Открыть лимитные сценарии'],
  ['Изменения','ci6-pulse-radar',()=>existingButton(
   '[data-tab="radar"]'),'Открыть рыночный радар']
 ];
 for(const [title,dom,fn,aria] of metrics){
  const btn=action('', 'ci6-pulse-stat',fn,aria);
  const label=el('span','',title),count=el('strong','','—');
  count.id=dom;btn.append(label,count);pulse.append(btn);
 }
 const ctas=el('div','ci6-command-actions');
 ctas.append(
  action('Активные сценарии','ci6-cta-primary',()=>{
   existingButton('[data-tab="forecasts"]');
   existingButton('[data-journal-stage="ACTIVE"]');
  }),
  action('События Радара','ci6-cta-outline',()=>{
   existingButton('[data-tab="radar"]');
   existingButton('[data-radar-filter="events"]');
  }),
  action('Исследования','ci6-cta-outline',()=>existingButton('[data-tab="quality"]'))
 );
 header.append(kicker,headline,lead,source,pulse,ctas);
 root.insertBefore(header,market);
 // Keep original screen heading visually but not duplicated in overview.
 if(heading)heading.classList.add('ci6-heading-superseded');
 const render=()=>{
  const srcCount=id('forecast-pending-count')?.textContent?.trim()||'—';
  const roomReady=srcCount!=='—'&&/^\d+$/.test(srcCount);
  const radarCoverage=id('radar-coverage')?.textContent||'';
  const radarReady=Boolean(radarCoverage)&&
   !/проверяем|ожидаем|сохранённые наблюдения/i.test(
    id('radar-status')?.textContent||'');
  const data=dashboardPulseSnapshot({
   roomReady,
   active:id('stage-count-ACTIVE')?.textContent,
   limit:id('stage-count-CONFIRMED')?.textContent,
   radarReady,
   radarChanges:id('radar-change-count')?.textContent,
   sources:id('top-status')?.textContent,
   favoriteCount:id('favorites-count')?.textContent
  });
  const nodes=[['ci6-pulse-active',data.active],
   ['ci6-pulse-limit',data.limit],
   ['ci6-pulse-radar',data.radar]];
  for(const [key,value] of nodes){
   const node=id(key);if(node&&node.textContent!==value)node.textContent=value;
  }
  const text=data.source==='—'?'Проверяем доступность источников':data.source;
  if(source.textContent!==text)source.textContent=text;
 };
 let pending=false;
 const schedule=()=>{if(pending)return;pending=true;queueMicrotask(()=>{
  pending=false;render();
 });};
 const observer=new MutationObserver(schedule);
 for(const field of ['forecast-pending-count','stage-count-ACTIVE',
  'stage-count-CONFIRMED','radar-coverage','radar-change-count',
  'radar-status','top-status','favorites-count']){
  const node=id(field);
  if(node)observer.observe(node,{subtree:true,characterData:true,childList:true});
 }
 render();
}
function mountScenarioWorkspace(){
 const view=id('view-forecasts');
 const workspace=view?.querySelector('.forecast-workspace');
 const intro=view?.querySelector('.forecast-intro');
 const stages=workspace?.querySelector('.forecast-compact-stages');
 if(!view||!workspace||!intro||!stages||id('ci6-stage-board'))return;
 const board=el('section','ci6-stage-board');
 board.id='ci6-stage-board';
 board.setAttribute('aria-label','Этапы сценариев APEX');
 const head=el('div','ci6-section-heading');
 head.append(el('h3','','Этапы наблюдения'),
  el('small','','Нажмите этап, чтобы увидеть карточки'));
 board.append(head);
 // Use the ACTUAL stage buttons; do not add a second event router.
 board.append(stages);
 intro.after(board);
 const info=workspace.querySelector('.forecast-technical-notes');
 const whales=id('forecast-whale-details');
 const system=intro.querySelector('#forecast-system-details');
 const advanced=el('details','ci6-research-rules');
 advanced.append(el('summary','','Методика, W и статус автоматической проверки'));
 if(info)advanced.append(info);
 if(whales)advanced.append(whales);
 if(system)advanced.append(system);
 workspace.append(advanced);
 intro.classList.add('ci6-scenarios-glance');
 workspace.classList.add('ci6-scenarios-workspace');
 // Main task first; independent quality/summary panels remain in existing
 // archive fold, moved during Clean Intelligence stage 1.
 const journalHeading=workspace.querySelector(':scope > .section-title h3');
 if(journalHeading)journalHeading.textContent='Прогнозы и уровни';
}
function mountRadarWorkspace(){
 const view=id('view-radar');
 const controls=view?.querySelector('.radar-controls');
 const heading=view?.querySelector('.radar-heading');
 const status=id('radar-status');
 const counters=view?.querySelector('.radar-summary');
 const filters=view?.querySelector('.radar-filter-tabs');
 const frames=view?.querySelector('.radar-frame-tabs');
 const sort=view?.querySelector('.radar-sort-line');
 if(!view||!controls||!heading||!status||!counters||!filters||!frames||
  !sort||id('ci6-radar-workspace'))return;
 const top=el('section','ci6-radar-dashboard');
 top.id='ci6-radar-workspace';
 top.append(el('p','ci6-kicker','MONITORING · FAVORITES ONLY'),
  el('h3','','Изменения рынка'));
 top.append(counters,status);
 heading.after(top);
 const quick=el('section','ci6-radar-quick');
 quick.append(el('h3','','Наблюдения'),filters);
 top.after(quick);
 const details=el('details','ci6-radar-advanced');
 details.append(el('summary','','Таймфрейм и сортировка'));
 // Reuse existing controls, including original listener and selected state.
 const frameHeading=controls.querySelector('.radar-control-heading');
 if(frameHeading)details.append(frameHeading);
 details.append(frames,sort);
 quick.after(details);
 controls.remove();
}
export function initCleanIntelligenceMajor(){
 mountCommandOverview();
 mountScenarioWorkspace();
 mountRadarWorkspace();
 document.body.dataset.apexLayout='command';
 return true;
}
