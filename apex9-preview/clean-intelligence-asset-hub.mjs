/**
 * APEX 9 / Clean Intelligence - major redesign stage 7.
 *
 * The new asset command desk and research/source navigator are entirely
 * presentational. All refreshes and data collection stay in existing APEX
 * Android/Room/WebSocket/REST controllers. No example numbers or trading.
 */
const id=name=>document.getElementById(name);
const make=(tag,klass='',value)=>{
 const node=document.createElement(tag);
 if(klass)node.className=klass;
 if(value!==undefined)node.textContent=String(value);
 return node;
};
export function condensedVerifiedText(value,{max=94}={}){
 const text=String(value??'').replace(/\s+/g,' ').trim();
 if(!text||text==='—'||/^проверяем\.\.\.$/i.test(text))return 'Нет проверенного обновления';
 return text.length>max?text.slice(0,max-1).trimEnd()+'…':text;
}
export function researchNavItems(){
 return [
  {id:'chart',title:'График',subtitle:'Закрытые свечи · M1–D1',
   icon:'⌁',area:'chart',target:'candle-canvas',source:'candle-status'},
  {id:'whales',title:'Киты · W',subtitle:'Публичные переводы · Room',
   icon:'W',area:'data',target:'whale-panel',source:'whale-status'},
  {id:'depth',title:'Ликвидность',subtitle:'Стаканы · Binance / Bybit / OKX',
   icon:'▥',area:'data',target:'liquidity-history-panel',source:'depth-sync-status'},
  {id:'news',title:'События',subtitle:'Новости · макро · обсуждения',
   icon:'◉',area:'data',target:'asset-news-list',source:'asset-news-summary'}
 ];
}
export function sourceNavItems(){
 return [
  {id:'market',title:'Рыночные API',target:'source-list',hint:'Фактические ответы'},
  {id:'providers',title:'Лимиты и API',target:'free-provider-center-panel',hint:'Бесплатные лимиты'},
  {id:'storage',title:'Android / Room',target:'native-storage-panel',hint:'Локальный архив'},
  {id:'updates',title:'Обновления',target:'update-panel',hint:'Версия приложения'}
 ];
}
function selectArea(area){
 const btn=document.querySelector('[data-asset-area-button="'+area+'"]');
 if(btn instanceof HTMLButtonElement&&!btn.disabled)btn.click();
}
function scrollTo(selector){
 const target=document.querySelector(selector);
 if(!target||target.hidden)return false;
 target.scrollIntoView({behavior:'smooth',block:'start'});
 return true;
}
function openAssetResearch(area,selector){
 selectArea(area);
 // Native pane selection synchronously updates data-asset-area. Scrolling
 // on the next paint avoids targeting a display:none research panel.
 requestAnimationFrame(()=>scrollTo(selector));
}
function button(label,klass,handler){
 const node=make('button',klass,label);
 node.type='button';node.addEventListener('click',handler);
 return node;
}
function observeText(sourceIds,render){
 const targets=sourceIds.map(id).filter(Boolean);
 let pending=false;
 const update=()=>{
  if(pending)return;
  pending=true;
  queueMicrotask(()=>{pending=false;render();});
 };
 for(const node of targets)
  new MutationObserver(update).observe(node,{
   childList:true,subtree:true,characterData:true,attributes:false
  });
 render();
}
function mountAssetDesk(){
 const root=id('view-asset'),hero=root?.querySelector(':scope > .hero');
 if(!root||!hero||id('ci7-asset-desk'))return;
 const desk=make('section','ci7-asset-desk');
 desk.id='ci7-asset-desk';
 desk.setAttribute('aria-label','Паспорт и исследования выбранного актива');
 const top=make('div','ci7-asset-desk-head');
 top.append(make('p','ci7-kicker','APEX · ASSET INTELLIGENCE'),
  make('h3','','Исследовать актив'));
 const details=make('p','ci7-asset-desk-summary','Фактические наблюдения выбранного актива');
 const status=make('div','ci7-live-states');
 const age=make('div','ci7-live-state');
 age.append(make('span','','Рыночные данные'),make('strong','','Нет проверенного обновления'));
 age.dataset.source='updated-at';
 const candles=make('div','ci7-live-state');
 candles.append(make('span','','Свечная история'),make('strong','','Нет проверенного обновления'));
 candles.dataset.source='candle-status';
 status.append(age,candles);
 const grid=make('div','ci7-research-entry-grid');
 const links=[];
 for(const item of researchNavItems()){
  const card=make('button','ci7-research-entry');
  card.type='button';card.dataset.ci7Navigate=item.id;
  card.setAttribute('aria-label',item.title+'. '+item.subtitle+'. Открыть исследование.');
  const orb=make('span','ci7-entry-icon',item.icon);
  orb.setAttribute('aria-hidden','true');
  const text=make('span','ci7-entry-copy');
  text.append(make('strong','',item.title),make('small','',item.subtitle));
  const marker=make('span','ci7-entry-arrow','›');
  marker.setAttribute('aria-hidden','true');
  const live=make('small','ci7-entry-observation','Проверяем данные…');
  text.append(live);
  card.append(orb,text,marker);
  card.addEventListener('click',()=>openAssetResearch(item.area,'#'+item.target));
  grid.append(card);
  links.push({id:item.source,output:live});
 }
 desk.append(top,details,status,grid);
 hero.after(desk);
 observeText(['updated-at','candle-status',...links.map(x=>x.id)],()=>{
  for(const node of [age,candles]){
   const source=node.dataset.source;
   const output=node.querySelector('strong');
   const current=condensedVerifiedText(id(source)?.textContent,{max:80});
   if(output.textContent!==current)output.textContent=current;
  }
  for(const {id:source,output} of links){
   const current=condensedVerifiedText(id(source)?.textContent,{max:72});
   if(output.textContent!==current)output.textContent=current;
  }
 });
}
function mountAssetDataNavigator(){
 const root=id('view-asset'),anchor=id('asset-workspace-anchor');
 if(!root||!anchor||id('ci7-data-overview'))return;
 const section=make('section','ci7-data-overview');
 section.id='ci7-data-overview';
 section.dataset.assetPane='data';
 section.setAttribute('aria-label','Навигация по источникам и данным актива');
 const upper=make('div','ci7-data-heading');
 upper.append(make('p','ci7-kicker','OBSERVATIONS · SOURCE-BACKED'),
  make('h3','','Данные и ликвидность'),
  make('p','','Проверяйте состояние источников перед выводами.'));
 const nav=make('div','ci7-data-navigation');
 nav.setAttribute('role','group');
 nav.setAttribute('aria-label','Перейти к разделу данных');
 for(const [label,selector] of [
  ['Стаканы','#depth-list'],['История','#liquidity-history-panel'],
  ['Киты и сеть','#whale-panel'],['Новости','#asset-news-list'],
  ['Сверка API','#source-reconciliation-list']
 ]){
  const ctl=button(label,'ci7-data-shortcut',()=>scrollTo(selector));
  nav.append(ctl);
 }
 const status=make('div','ci7-data-status-grid');
 const monitors=[
  {name:'Синхронизация стаканов',source:'depth-sync-status'},
  {name:'Архив ликвидности',source:'liquidity-history-status'},
  {name:'Сверка источников',source:'source-reconciliation-status'}
 ];
 for(const m of monitors){
  const cell=make('div','ci7-data-state');
  cell.dataset.source=m.source;
  cell.append(make('span','',m.name),make('strong','','Нет проверенного обновления'));
  status.append(cell);
 }
 section.append(upper,nav,status);
 anchor.after(section);
 observeText(monitors.map(x=>x.source),()=>{
  for(const item of status.children){
   const output=item.querySelector('strong');
   const value=condensedVerifiedText(id(item.dataset.source)?.textContent,{max:105});
   if(output.textContent!==value)output.textContent=value;
  }
 });
 for(const klass of ['asset-events-panel','liquidity-history-panel','network-panel']){
  root.querySelector('.'+klass)?.classList.add('ci7-refined-data-card');
 }
}
function mountSourcesDesk(){
 const root=id('view-sources');
 const title=root?.querySelector(':scope > .section-title');
 if(!root||!title||id('ci7-sources-desk'))return;
 const section=make('section','ci7-sources-desk');
 section.id='ci7-sources-desk';
 section.append(make('p','ci7-kicker','API RELIABILITY · LOCAL STATE'),
  make('h3','','Контроль источников'),
  make('p','ci7-source-description',
   'Здесь отражаются реальные результаты проверок, доступность и локальный архив.'));
 const metrics=make('div','ci7-source-metrics');
 const cards=[
  {label:'Биржевые API',source:'active-sources'},
  {label:'История проверок',source:'api-reliability-status'},
  {label:'Android / Room',source:'native-storage-status'}
 ];
 for(const card of cards){
  const item=make('div','ci7-source-metric');
  item.dataset.source=card.source;
  item.append(make('span','',card.label),make('strong','','Нет проверенного обновления'));
  metrics.append(item);
 }
 const nav=make('div','ci7-sources-navigation');
 nav.setAttribute('role','group');nav.setAttribute('aria-label','Разделы проверки источников');
 for(const entry of sourceNavItems()){
  const ctl=button('','ci7-source-nav-button',()=>scrollTo(
   entry.id==='updates'?'#view-sources .update-panel':'#'+entry.target
  ));
  ctl.append(make('strong','',entry.title),make('small','',entry.hint));
  nav.append(ctl);
 }
 section.append(metrics,nav);
 title.after(section);
 observeText(cards.map(x=>x.source),()=>{
  for(const box of metrics.children){
   const target=box.querySelector('strong');
   const value=condensedVerifiedText(id(box.dataset.source)?.textContent,{max:93});
   if(target.textContent!==value)target.textContent=value;
  }
 });
 for(const selector of [
  '#view-sources #free-provider-center-panel',
  '#view-sources #native-storage-panel',
  '#view-sources .update-panel'
 ])document.querySelector(selector)?.classList.add('ci7-source-section');
}
function mountResearchDeck(){
 const quality=id('view-quality');
 const landing=id('ci-research-landing');
 if(!quality||!landing||id('ci7-research-insights'))return;
 const pulse=make('section','ci7-research-insights');
 pulse.id='ci7-research-insights';
 pulse.append(make('p','ci7-kicker','EVIDENCE LAB · VERIFIED DATA'),
  make('h3','','Достоверность исследований'));
 const label=make('p','ci7-research-status',
  'Результаты проверки будут доступны по данным Room.');
 const actions=make('div','ci7-research-actions');
 actions.append(
  button('Проверить качество','ci7-primary-action',()=>{
   const btn=document.querySelector('[data-quality-area-button="data"]');
   if(btn instanceof HTMLButtonElement)btn.click();
   requestAnimationFrame(()=>scrollTo('#evidence-lab-panel'));
  }),
  button('Состояние API','ci7-secondary-action',()=>{
   const btn=document.querySelector('.quality-sources-link[data-go="sources"]');
   if(btn instanceof HTMLButtonElement)btn.click();
  })
 );
 pulse.append(label,actions);
 landing.after(pulse);
 observeText(['evidence-status'],()=>{
  const value=condensedVerifiedText(id('evidence-status')?.textContent,{max:160});
  if(label.textContent!==value)label.textContent=value;
 });
}
export function initCleanIntelligenceAssetHub(){
 mountAssetDesk();
 mountAssetDataNavigator();
 mountSourcesDesk();
 mountResearchDeck();
 document.body.dataset.apexAssetLayout='research';
 return true;
}
