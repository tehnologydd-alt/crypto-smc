import {attachAssetLogo} from './asset-logo.mjs';
/**
 * APEX Clean Intelligence / Concept 1
 *
 * Pure presentation adapter; never changes immutable forecasts, Room,
 * source observations, market polling, or forecast outcome statistics.
 * Reorganizes existing live widgets without introducing sample data.
 */
const byId=id=>document.getElementById(id);
const create=(tag,klass='',value)=>{
 const node=document.createElement(tag);
 if(klass)node.className=klass;
 if(value!==undefined)node.textContent=String(value);
 return node;
};
const actual=value=>{
 const s=String(value??'').trim();
 return s&&s!=='—'&&s!=='-'&&!/^ожида|^проверя|^нет |^недоступ/i.test(s)?s:'—';
};
export function marketOverviewSnapshot({
 change='',dominance='',mood='',value='',state='',sentimentSource=''
}={}){
 const marketState=state==='OK'?'OBSERVED':state==='STALE'?'STALE':'UNKNOWN';
 const available=marketState!=='UNKNOWN';
 const c=available?actual(change):'—';
 const d=available?actual(dominance):'—';
 const m=actual(mood),v=actual(value);
 const sentiment=m==='—'?'—':m+(v==='—'?'':' · '+v);
 const source=String(sentimentSource||'');
 const fearState=sentiment==='—'?'UNKNOWN':
  source.includes('Сохранённый индекс')||source.includes('Исторический')?
   'STALE':source.includes('Свежий ответ')?'OBSERVED':'UNKNOWN';
 const marketLabel=marketState==='STALE'?' · архив':
  marketState==='UNKNOWN'?' · нет данных':'';
 const fearLabel=fearState==='STALE'?' · архив':
  fearState==='UNKNOWN'?' · не проверено':'';
 const coin=marketState==='OBSERVED'?'CoinGecko: ответ API':
  marketState==='STALE'?'CoinGecko: сохранённая сводка, данные устарели':
  'CoinGecko: нет подтверждённого ответа';
 const fear=fearState==='OBSERVED'?'Alternative.me: ответ API':
  fearState==='STALE'?'Alternative.me: сохранённый индекс':
  'Alternative.me: свежесть не подтверждена';
 return {
  change:c,dominance:d,sentiment,marketState,fearState,
  marketLabel,fearLabel,
  trend:c==='—'||marketState==='STALE'?'unknown':
   c.trim().startsWith('-')||c.trim().startsWith('−')?'negative':'positive',
  note:coin+' · '+fear
 };
}
function mountOverview(){
 const overview=byId('view-overview'),market=byId('ci-market');
 if(!overview||!market)return;
 const sourceFold=byId('ci-market-sources');
 const global=overview.querySelector('.overview-global-panel');
 const fear=overview.querySelector('.free-fear-panel');
 if(global)sourceFold?.append(global);
 if(fear)sourceFold?.append(fear);
 const experience=overview.querySelector('.overview-experience-panel');
 const quick=document.querySelector('main .home-actions.overview-only');
 if(quick&&experience)experience.after(quick);
 let scheduled=false;
 const update=()=>{
  scheduled=false;
  const state=byId('overview-global-state')?.dataset.state;
  const snapshot=marketOverviewSnapshot({
   change:byId('overview-global-change')?.textContent,
   dominance:byId('overview-global-btc')?.textContent,
   mood:byId('free-fear-label')?.textContent,
   value:byId('free-fear-value')?.textContent,
   sentimentSource:byId('free-fear-status')?.textContent,
   state
  });
  const change=byId('ci-cap-change');
  const btc=byId('ci-btc-dominance');
  const mood=byId('ci-fear-mood');
  if(change){change.textContent=snapshot.change;
   change.dataset.trend=snapshot.trend;change.dataset.freshness=snapshot.marketState;}
  if(btc){btc.textContent=snapshot.dominance;
   btc.dataset.trend=snapshot.dominance==='—'?'unknown':'neutral';
   btc.dataset.freshness=snapshot.marketState;}
  if(mood){mood.textContent=snapshot.sentiment;
   mood.dataset.trend=snapshot.sentiment==='—'?'unknown':'neutral';
   mood.dataset.freshness=snapshot.fearState;}
  const cap=byId('ci-cap-caption'),btclabel=byId('ci-btc-caption');
  const fearLabel=byId('ci-fear-caption');
  if(cap)cap.textContent='Капитализация · 24 ч'+snapshot.marketLabel;
  if(btclabel)btclabel.textContent='Доля BTC'+snapshot.marketLabel;
  if(fearLabel)fearLabel.textContent='Настроение'+snapshot.fearLabel;
  const provenance=byId('ci-market-provenance');
  if(provenance)provenance.textContent=snapshot.note;
 };
 const schedule=()=>{
  if(scheduled)return;
  scheduled=true;
  queueMicrotask(update);
 };
 const observer=new MutationObserver(schedule);
 for(const target of [
  byId('overview-global-change'),byId('overview-global-btc'),
  byId('overview-global-state'),byId('free-fear-label'),
  byId('free-fear-value'),byId('free-fear-status')]){
  if(target)observer.observe(target,{childList:true,characterData:true,
   attributes:true,subtree:true});
 }
 update();
}
/** Preserve the old stats/data sections but stop forcing users to scroll
 * through them before seeing the actual forecasts.
 */
function mountForecasts(){
 const view=byId('view-forecasts');
 if(!view)return;
 const journal=view.querySelector('.forecast-workspace');
 const intro=view.querySelector('.forecast-intro');
 const insights=view.querySelector('.forecast-insights');
 const stageTabs=journal?.querySelector('.forecast-compact-stages');
 const modes=insights?.querySelector('.forecast-mode-tabs');
 if(modes&&stageTabs)stageTabs.before(modes);
 if(!journal||(!intro&&!insights))return;
 const archives=create('details','ci-forecast-archives');
 archives.append(create('summary','','Статистика и качество исследований'));
 if(intro)archives.append(intro);
 if(insights)archives.append(insights);
 journal.after(archives);
}
/** One threshold for initial render, foreground re-entry and periodic UI
 * refresh. Source candle time remains immutable; this makes NO API calls.
 */
export function radarCandleFreshness({
 closedAt,interval='1h',saved=false,now=Date.now()
}={}){
 const valid=Number.isSafeInteger(closedAt)&&closedAt>0&&
  Number.isSafeInteger(now)&&closedAt<=now+60000;
 if(!valid)return {state:'UNKNOWN',label:'Время свечи не подтверждено',
  warning:'Нет подтверждённого времени'};
 const step={'15m':900000,'1h':3600000,'4h':14400000,'1d':86400000}[interval];
 if(!step)return {state:'UNKNOWN',label:'Таймфрейм неизвестен',
  warning:'Невозможно оценить свежесть'};
 const archive=saved===true||now-closedAt>2*step+60000;
 const when=new Date(closedAt).toLocaleString('ru-RU',{
  day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'
 });
 return {state:archive?'STALE':'OBSERVED',
  label:(archive?'Архив':'Свеча')+' · '+when,
  warning:archive?'Архивные данные':null};
}
function refreshRadarAge(card,now=Date.now()){
 const age=radarCandleFreshness({
  closedAt:Number(card.dataset.candleAt),
  interval:card.dataset.interval,
  saved:card.dataset.saved==='true',now
 });
 const observed=card.querySelector('.ci-radar-observed');
 if(observed){observed.textContent=age.label;observed.dataset.freshness=age.state;}
 const chip=card.querySelector('.ci-radar-age-chip');
 if(chip){
  chip.hidden=!age.warning;
  chip.textContent=age.warning||'';
  chip.dataset.freshness=age.state;
 }
 return age;
}
/** Radar cards keep the original verified metadata but show only the meaningful
 * surface summary until the reader requests the observed measurements.
 */
export function compactRadarCard(card){
 if(!card?.classList?.contains('radar-record')||
  card.querySelector('.ci-radar-details'))return card;
 const head=card.querySelector('.radar-record-top');
 const open=card.querySelector('.radar-open');
 if(!head||!open)return card;
 const symbol=card.dataset.symbol||'';
 const frame=card.dataset.interval==='15m'?'M15':
  card.dataset.interval==='1h'?'H1':
  card.dataset.interval==='4h'?'H4':
  card.dataset.interval==='1d'?'D1':'—';
 if(/^[A-Z0-9]{5,20}$/.test(symbol)){
  const coin=create('span','ci-radar-coin');
  coin.setAttribute('aria-hidden','true');
  const base=symbol.replace(/(USDT|USDC|BTC|ETH)$/,'');
  attachAssetLogo(coin,symbol,base.slice(0,1));
  head.prepend(coin);
 }
 const timeNote=create('small','ci-radar-observed','Время свечи не подтверждено');
 head.querySelector('.radar-record-name')?.append(timeNote);
 const metrics=[...card.querySelectorAll('.radar-record-metric')];
 const extract=label=>metrics.find(x=>x.querySelector('span')
  ?.textContent.includes(label))?.querySelector('strong')?.textContent.trim()||'';
 const mode=extract('Режим'),velocity=extract('Скорость'),volume=extract('Объём / медиана');
 const direction=card.querySelector('.radar-direction')?.textContent.trim()||'';
 // This description always refers to already CLOSED candles, never signals.
 const statement=create('p','ci-radar-synopsis',
  frame+' · '+(mode&&mode!=='—'?mode:direction||'Направление не подтверждено')+
  (velocity&&velocity!=='—'?' · скорость '+velocity:'')+
  ' · закрытые свечи');
 const chips=create('div','ci-radar-chips');
 if(volume&&volume!=='—')chips.append(create('span','ci-radar-chip','Объём '+volume));
 const ageChip=create('span','ci-radar-chip is-caution ci-radar-age-chip');
 ageChip.hidden=true;
 chips.append(ageChip);
 const change=card.dataset.changeState==='CHANGED';
 if(change){
  for(const tag of [...card.querySelectorAll('.radar-change-tag')].slice(0,2)){
   const word=tag.textContent.trim();
   if(word)chips.append(create('span','ci-radar-chip is-change',word));
  }
 }else chips.append(create('span','ci-radar-chip','Нет новых подтверждённых изменений'));
 const details=create('details','ci-radar-details');
 details.append(create('summary','','Метрики, история и сверка ТФ'));
 for(const node of [...card.children]){
  if(node===head||node===open)continue;
  details.append(node);
 }
 head.after(statement,chips);
 card.insertBefore(details,open);
 refreshRadarAge(card);
 return card;
}
function mountRadar(){
 const list=byId('radar-results');
 if(!list)return;
 const enhance=()=>{
  for(const card of list.children){
   compactRadarCard(card);
   if(card.classList?.contains('radar-record'))refreshRadarAge(card);
  }
 };
 new MutationObserver(enhance).observe(list,{childList:true});
 // Re-evaluate displayed age without touching source polling or Room:
 // important when the user leaves APEX open across a candle boundary.
 document.addEventListener('visibilitychange',()=>{
  if(!document.hidden)enhance();
 });
 const ageClock=setInterval(()=>{
  if(!document.hidden&&document.body.dataset.view==='radar')enhance();
 },60000);
 if(typeof ageClock?.unref==='function')ageClock.unref();
 enhance();
}
/** Actual favorites carousel pagination (0..10), not static preview dots. */
function mountFavoritePagination(){
 const rail=byId('favorite-rail');if(!rail)return;
 const dots=create('div','ci-favorite-pagination');
 dots.setAttribute('role','group');
 dots.setAttribute('aria-label','Быстрый переход к активам избранного');
 rail.after(dots);
 let previous='';
 const cards=()=>[...rail.children].filter(x=>x.classList?.contains('favorite-card'));
 const setCurrent=()=>{
  const list=cards();
  let index=0,best=Infinity;
  list.forEach((card,i)=>{
   const left=card.offsetLeft-rail.offsetLeft;
   const d=Math.abs(left-rail.scrollLeft);
   if(d<best){best=d;index=i;}
  });
  for(const [i,button] of [...dots.children].entries()){
   button.setAttribute('aria-pressed',String(i===index));
  }
 };
 const update=()=>{
  const list=cards(),signature=list.map(x=>x.dataset.symbol).join('|');
  dots.hidden=list.length<2;
  if(signature!==previous){
   previous=signature;
   dots.replaceChildren();
   for(const [i,card] of list.entries()){
    const control=create('button','ci-favorite-dot');
    control.type='button';
    control.setAttribute('aria-label','Карточка '+(i+1)+': '+card.dataset.symbol);
    control.addEventListener('click',()=>{
     const target=cards().find(x=>x.dataset.symbol===card.dataset.symbol);
     if(target)rail.scrollTo({left:target.offsetLeft-rail.offsetLeft,
      behavior:'smooth'});
    });
    dots.append(control);
   }
  }
  setCurrent();
 };
 new MutationObserver(update).observe(rail,{childList:true});
 rail.addEventListener('scroll',setCurrent,{passive:true});
 update();
}
/** Directions are a view filter. Stage and Room result counters stay intact. */
export function visibleScenarioSide(side,selected){
 return selected==='ALL'||side===selected;
}
/** Count only cards in the visible stage. This is a display counter, not
 * the immutable Room stage total shown in the stage tabs.
 */
export function scenarioSideSummary(sides=[],selected='ALL'){
 const cards=Array.isArray(sides)?sides.filter(x=>typeof x==='string'):[];
 const total=cards.length;
 const shown=cards.filter(x=>visibleScenarioSide(x,selected)).length;
 return {total,shown,
  label:total?
   'Показано '+shown+' из '+total+' на выбранном этапе · архивы отдельно':
   'Направление публикации · архивы отдельно'};
}
function mountDirectionFilter(){
 const journal=byId('view-forecasts')?.querySelector('.forecast-workspace');
 const list=byId('research-forecast-list');
 const stageTabs=journal?.querySelector('.forecast-compact-stages');
 if(!journal||!list||!stageTabs)return;
 const filters=create('div','ci-direction-filters');
 filters.setAttribute('role','group');
 filters.setAttribute('aria-label','Фильтр направления списка');
 const note=create('small','ci-direction-hint',
  'Направление публикации · архивы отдельно');
 const buttons=create('div','ci-direction-buttons');
 const empty=create('p','ci-direction-empty','Нет сценариев выбранного направления на этом этапе.');
 empty.hidden=true;
 let current='ALL';
 const controls=[];
 const apply=()=>{
  const cards=[...list.children].filter(x=>x.dataset?.ciSide);
  const summary=scenarioSideSummary(cards.map(x=>x.dataset.ciSide),current);
  for(const card of cards)
   card.hidden=!visibleScenarioSide(card.dataset.ciSide,current);
  note.textContent=summary.label;
  empty.hidden=current==='ALL'||!summary.total||summary.shown>0;
 };
 for(const [key,label] of [['ALL','Все'],['LONG','LONG'],['SHORT','SHORT']]){
  const button=create('button','ci-direction-button',label);
  button.type='button';button.setAttribute('aria-pressed',String(key==='ALL'));
  button.addEventListener('click',()=>{
   current=key;
   for(const [id,control] of controls)
    control.setAttribute('aria-pressed',String(id===current));
   apply();
  });
  controls.push([key,button]);buttons.append(button);
 }
 filters.append(buttons,note);
 stageTabs.before(filters);
 list.after(empty);
 new MutationObserver(apply).observe(list,{childList:true,subtree:true});
 apply();
}
/**
 * A per-screen-only UI memory of expanded forecast details. Room owns the
 * scenario itself. Expanding a card is not a prediction state and must never
 * modify or be restored from the immutable research log.
 */
export function scenarioDisclosureKey(id,slot=0){
 if(typeof id!=='string'||!id||!Number.isSafeInteger(slot)||slot<0)return null;
 return id+'::detail::'+slot;
}
function mountForecastContinuity(){
 const list=byId('research-forecast-list');
 if(!list||list.dataset.ciContinuityMounted==='true')return;
 list.dataset.ciContinuityMounted='true';
 const preferences=new Map();
 const cardDetails=card=>[...card.querySelectorAll(
  'details.forecast-compact-details, details.forecast-card-fold')];
 // Capture is important: the <details> toggle event does not bubble.
 list.addEventListener('toggle',event=>{
  const detail=event.target;
  if(!detail?.matches?.(
   'details.forecast-compact-details, details.forecast-card-fold'))return;
  const card=detail.closest('[data-ci-scenario-id]');
  if(!card)return;
  const slot=cardDetails(card).indexOf(detail);
  const key=scenarioDisclosureKey(card.dataset.ciScenarioId,slot);
  if(!key)return;
  // Bounded local UI map, not a stored journal or background task.
  if(preferences.has(key))preferences.delete(key);
  preferences.set(key,detail.open===true);
  if(preferences.size>250)preferences.delete(preferences.keys().next().value);
 },true);
 const restore=()=>{
  for(const card of list.querySelectorAll('[data-ci-scenario-id]')){
   for(const [slot,detail] of cardDetails(card).entries()){
    const key=scenarioDisclosureKey(card.dataset.ciScenarioId,slot);
    if(key&&preferences.has(key))
     detail.open=preferences.get(key);
   }
  }
 };
 new MutationObserver(restore).observe(list,{childList:true});
 restore();
}
/** Keep asset price on top, before advanced workspace tabs; do not move graph
 * canvases out of their original asset pane, preserving all event listeners. */
function mountAsset(){
 const asset=byId('view-asset');
 const strip=byId('asset-favorite-strip');
 const hero=asset?.querySelector(':scope > .hero');
 const workspace=byId('asset-workspace-anchor');
 if(!asset||!strip||!hero||!workspace)return;
 strip.before(hero);
 strip.after(workspace);
}
/** Asset intelligence uses the ORIGINAL chart overlay controls and source
 * status nodes. Moving them preserves their event listeners, live timestamps,
 * and original native Room/M1/whale data flow. No cloned "whale" figures.
 */
export function assetIntelligenceTabs(){
 return [
  {id:'whales',label:'Киты'},
  {id:'blocks',label:'Ордер-блоки'},
  {id:'info',label:'Инфо'}
 ];
}
function mountAssetIntelligence(){
 const asset=byId('view-asset');
 const chart=asset?.querySelector('.candle-panel');
 const after=byId('chart-selected');
 const ob=byId('chart-ob-toggle');
 const whales=byId('chart-whale-toggle');
 const obStatus=byId('chart-ob-status');
 const whaleStatus=byId('chart-whale-status');
 if(!asset||!chart||!after||!ob||!whales||!obStatus||!whaleStatus)return;
 if(byId('ci-asset-intelligence'))return;
 const root=create('section','ci-asset-intelligence');
 root.id='ci-asset-intelligence';
 root.setAttribute('aria-label','Исследования на графике');
 const tabs=create('div','ci-asset-intel-tabs');
 tabs.setAttribute('role','group');
 tabs.setAttribute('aria-label','Выберите исследование');
 const contents=create('div','ci-asset-intel-contents');
 const panelMap=new Map();
 const buttons=new Map();
 for(const {id,label} of assetIntelligenceTabs()){
  const button=create('button','ci-asset-intel-tab',label);
  button.type='button';button.dataset.ciIntelTab=id;
  button.setAttribute('aria-pressed',String(id==='whales'));
  tabs.append(button);buttons.set(id,button);
  const panel=create('div','ci-asset-intel-panel');
  panel.id='ci-asset-intel-'+id;
  panel.hidden=id!=='whales';panelMap.set(id,panel);
  contents.append(panel);
  button.addEventListener('click',()=>{
   for(const [key,control] of buttons)
    control.setAttribute('aria-pressed',String(key===id));
   for(const [key,content] of panelMap)content.hidden=key!==id;
  });
 }
 const whalesPanel=panelMap.get('whales');
 whalesPanel.append(create('strong','','W · архив крупных переводов'),whales,
  whaleStatus);
 const whalesHelp=create('p','ci-asset-intel-disclaimer',
  'W показывает время подтверждённого наблюдения. Перевод не означает покупку или продажу.');
 whalesPanel.append(whalesHelp);
 const whaleArchive=create('button','ci-asset-intel-action',
  'История китов и крупных сделок');
 whaleArchive.type='button';
 whaleArchive.addEventListener('click',()=>{
  // App owns the actual data-pane switch, streams and native refresh.
  const target=asset.querySelector('[data-asset-area-button="data"]');
  target?.click();
  requestAnimationFrame(()=>{
   const full=byId('whale-panel')||byId('large-trade-panel');
   if(full&&!full.hidden)full.scrollIntoView({behavior:'smooth',block:'start'});
  });
 });
 whalesPanel.append(whaleArchive);
 const blocksPanel=panelMap.get('blocks');
 blocksPanel.append(create('strong','','Расчётные зоны по закрытым свечам'),ob,
  obStatus);
 blocksPanel.append(create('p','ci-asset-intel-disclaimer',
  'Order Blocks — исторические расчётные зоны, не реальные лимитные ордера.'));
 const orderResearch=create('button','ci-asset-intel-action',
  'Исследовать структуру рынка');
 orderResearch.type='button';
 orderResearch.addEventListener('click',()=>{
  asset.querySelector('[data-asset-area-button="structure"]')?.click();
 });
 blocksPanel.append(orderResearch);
 const infoPanel=panelMap.get('info');
 infoPanel.append(create('strong','','Источник и свежесть графика'));
 const updated=create('p','ci-asset-intel-source','Нет проверенного обновления');
 updated.setAttribute('aria-live','polite');
 const candle=create('p','ci-asset-intel-source','История свечей ещё не получена');
 candle.setAttribute('aria-live','polite');
 infoPanel.append(updated,candle);
 const update=()=>{
  updated.textContent=byId('updated-at')?.textContent||'Время источника неизвестно';
  candle.textContent=byId('candle-status')?.textContent||'Свечи не проверены';
 };
 const infoButton=create('button','ci-asset-intel-action','Состояние источников');
 infoButton.type='button';
 infoButton.addEventListener('click',()=>{
  const diagnostics=byId('asset-source-diagnostics');
  if(!diagnostics)return;
  diagnostics.open=true;
  diagnostics.scrollIntoView({behavior:'smooth',block:'center'});
 });
 infoPanel.append(infoButton);
 for(const source of [byId('updated-at'),byId('candle-status')]){
  if(source)new MutationObserver(update).observe(source,{
   childList:true,characterData:true,subtree:true
  });
 }
 update();
 root.append(tabs,contents);
 after.after(root);
}
/** Research landing sits above the original Evidence Lab without remounting
 * any native module or double-fetching sources. Navigation delegates to
 * pre-existing, already wired buttons in app.mjs.
 */
export function researchEntryPoints(){
 return [
  {id:'news',label:'Новости',description:'Проверенные публикации и важные события',
   target:'[data-go="news"]',symbol:'▤'},
  {id:'macro',label:'Макроэкономика',
   description:'Календарь, показатели и рыночный контекст',
   target:'[data-go="macro"]',symbol:'◉'},
  {id:'patterns',label:'Паттерны и режимы',
   description:'Исторические условия и проверка устойчивости',
   target:'[data-quality-area-button="regimes"]',symbol:'▥'},
  {id:'quality',label:'Надёжность источников',
   description:'Проверка доступа, свежести и ограничений API',
   target:'.quality-sources-link[data-go="sources"]',symbol:'◇'}
 ];
}
function mountResearchLanding(){
 const quality=byId('view-quality');
 if(!quality||byId('ci-research-landing'))return;
 const heading=create('section','ci-research-landing');
 heading.id='ci-research-landing';
 heading.append(create('h2','','Исследования'),
  create('p','','Новости, макроэкономика, закономерности и качество данных.'));
 const grid=create('div','ci-research-grid');
 for(const entry of researchEntryPoints()){
  const button=create('button','ci-research-card');
  button.type='button';
  button.setAttribute('aria-label',entry.label+' · открыть раздел');
  const symbol=create('span','ci-research-symbol',entry.symbol);
  symbol.setAttribute('aria-hidden','true');
  const body=create('span','ci-research-copy');
  body.append(create('strong','',entry.label),
   create('small','',entry.description));
  const arrow=create('span','ci-research-arrow','›');
  arrow.setAttribute('aria-hidden','true');
  button.append(symbol,body,arrow);
  button.addEventListener('click',()=>{
   // Original navigation enforces the same permissions and refresh policy.
   const existing=document.querySelector(entry.target);
   existing?.click();
  });
  grid.append(button);
 }
 heading.append(grid);
 quality.prepend(heading);
}
/** Navigation, handlers, and data fetching remain owned by app.mjs. */
export function initCleanIntelligence(){
 mountOverview();
 mountForecasts();
 mountRadar();
 mountFavoritePagination();
 mountDirectionFilter();
 mountForecastContinuity();
 mountAsset();
 mountAssetIntelligence();
 mountResearchLanding();
 document.body.dataset.apexTheme='clean-intelligence';
 return true;
}
