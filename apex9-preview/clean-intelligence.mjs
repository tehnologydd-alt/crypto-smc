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
 change='',dominance='',mood='',value='',state=''
}={}){
 const available=state==='OK'||state==='STALE';
 const c=available?actual(change):'—';
 const d=available?actual(dominance):'—';
 const m=actual(mood),v=actual(value);
 const sentiment=m==='—'?'—':m+(v==='—'?'':' · '+v);
 return {
  change:c,dominance:d,sentiment,
  trend:c==='—'||state==='STALE'?'unknown':c.trim().startsWith('-')||c.trim().startsWith('−')?
   'negative':'positive',
  note:state==='OK'?'CoinGecko · Alternative.me · независимые источники':
   state==='STALE'?'CoinGecko: сохранённая сводка, данные устарели · Alternative.me отдельно':
   'Капитализация: данные ещё не проверены · настроение отдельного источника'
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
   state
  });
  const change=byId('ci-cap-change');
  const btc=byId('ci-btc-dominance');
  const mood=byId('ci-fear-mood');
  if(change){change.textContent=snapshot.change;change.dataset.trend=snapshot.trend;}
  if(btc){btc.textContent=snapshot.dominance;
   btc.dataset.trend=snapshot.dominance==='—'?'unknown':'neutral';}
  if(mood){mood.textContent=snapshot.sentiment;
   mood.dataset.trend=snapshot.sentiment==='—'?'unknown':'neutral';}
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
  byId('overview-global-state'),byId('free-fear-label'),byId('free-fear-value')]){
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
 const time=Number(card.dataset.candleAt);
 const stored=card.dataset.saved==='true';
 const observed=Number.isSafeInteger(time)&&time>0&&time<=Date.now()+60000?
  new Date(time).toLocaleString('ru-RU',{day:'2-digit',month:'2-digit',
   hour:'2-digit',minute:'2-digit'}):null;
 const ms={'15m':900000,'1h':3600000,'4h':14400000,'1d':86400000}[
  card.dataset.interval]||3600000;
 const stale=!observed||Date.now()-time>2*ms+60000;
 const timeNote=create('small','ci-radar-observed',
  (stored||stale?'Архив':'Свеча')+' · '+(observed||'время неизвестно'));
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
 if(stored||stale)chips.append(create('span','ci-radar-chip is-caution','Архивные данные'));
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
 return card;
}
function mountRadar(){
 const list=byId('radar-results');
 if(!list)return;
 const enhance=()=>{
  for(const card of list.children)compactRadarCard(card);
 };
 new MutationObserver(enhance).observe(list,{childList:true});
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
  let visible=0;
  const cards=[...list.children].filter(x=>x.dataset?.ciSide);
  for(const card of cards){
   const shown=visibleScenarioSide(card.dataset.ciSide,current);
   card.hidden=!shown;
   if(shown)visible++;
  }
  empty.hidden=current==='ALL'||!cards.length||visible>0;
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
 mountAsset();
 mountAssetIntelligence();
 mountResearchLanding();
 document.body.dataset.apexTheme='clean-intelligence';
 return true;
}
