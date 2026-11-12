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
 const chips=create('div','ci-radar-chips');
 const mode=card.querySelector('.radar-record-metric strong')?.textContent.trim();
 if(mode&&mode!=='—')chips.append(create('span','ci-radar-chip',mode));
 const metrics=[...card.querySelectorAll('.radar-record-metric')];
 const volume=metrics.find(x=>x.querySelector('span')?.textContent.includes('Объём / медиана'))
  ?.querySelector('strong')?.textContent.trim();
 if(volume&&volume!=='—')
  chips.append(create('span','ci-radar-chip','Объём '+volume));
 const historical=card.querySelector('.radar-record-name small')
  ?.textContent.includes('сохранённый снимок');
 if(historical)chips.append(create('span','ci-radar-chip','Архив'));
 for(const tag of [...card.querySelectorAll('.radar-change-tag')].slice(0,2)){
  const word=tag.textContent.trim();
  if(word)chips.append(create('span','ci-radar-chip is-change',word));
 }
 if(!chips.children.length)
  chips.append(create('span','ci-radar-chip','Проверка наблюдений'));
 const details=create('details','ci-radar-details');
 details.append(create('summary','','Все метрики, изменения и источники'));
 for(const node of [...card.children]){
  if(node===head||node===open)continue;
  details.append(node);
 }
 head.after(chips);
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
/** Navigation, handlers, and data fetching remain owned by app.mjs. */
export function initCleanIntelligence(){
 mountOverview();
 mountForecasts();
 mountRadar();
 document.body.dataset.apexTheme='clean-intelligence';
 return true;
}
