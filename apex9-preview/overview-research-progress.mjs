/**
 * APEX Research Experience overview.
 *
 * ONE indexed, native read-only Room aggregate over max 10 favorites, never
 * market polling, per-forecast archive reads or background training.
 *
 * "Experience" here is progress toward RECORD-COUNT checkpoints only:
 * published scenarios / recorded terminal outcomes / forward observations.
 * Room stage sequences, source quality and independence require the manual
 * full-archive audit. Percent is NOT model intelligence or predicted success.
 */
import {getMobileResearchProgress} from './mobile-bridge.mjs';

export const OVERVIEW_EXPERIENCE_VERSION='APEX_RESEARCH_EXPERIENCE_OVERVIEW_V1';
export const OVERVIEW_EXPERIENCE_RULES=Object.freeze({
 frames:['15m','1h','4h'],
 checkpoints:[
  {key:'published',target:30,label:'Сценарии'},
  {key:'recordedTerminal',target:40,label:'Исходы TP3/SL'},
  {key:'newPublished',target:120,label:'Новые Shadow'}
 ],
 cacheMaxAgeMs:7*86400000,refreshIntervalMs:5*60000,
 noModelTraining:true,calibratedProbability:null,
 noNetwork:true
});
const KEY='apex9:research-experience:v1';
const assetOK=s=>typeof s==='string'&&/^[A-Z0-9]{5,20}$/.test(s);
const integer=n=>Number.isSafeInteger(n)&&n>=0;
const validTime=n=>Number.isSafeInteger(n)&&n>0;
const today=()=>Date.now();
const safeStorage=()=>{
 try{return globalThis.localStorage;}catch{return null;}
};
const get=id=>document.getElementById(id);
const node=(tag,className='',value='')=>{
 const el=document.createElement(tag);
 if(className)el.className=className;
 el.textContent=String(value);
 return el;
};
function normalizedFavorites(favorites){
 return Array.isArray(favorites)?
  [...new Set(favorites.filter(assetOK))].slice(0,10):[];
}
export function measureResearchExperience(data,asset){
 const missing=reason=>({state:'INVALID',reason,frames:null,
  trained:false,calibratedProbability:null});
 if(data?.complete!==true||data.source!=='LOCAL_ROOM_PROGRESS_V1'||
  !Array.isArray(data.favorites)||!Array.isArray(data.rows)||
  !data.favorites.includes(asset)||!validTime(data.sampledAt)||
  data.registrationAt!==Date.UTC(2026,10,11,0,0,0)||
  data.rows.length>30)return missing('Недоступна подтверждённая сводка Room.');
 const frames={};
 const seen=new Set();
 for(const row of data.rows){
  const key=row?.asset+':'+row?.interval;
  if(!data.favorites.includes(row?.asset)||
   !OVERVIEW_EXPERIENCE_RULES.frames.includes(row?.interval)||
   seen.has(key)||!integer(row.published)||
   !integer(row.recordedTerminal)||!integer(row.newPublished)||
   row.recordedTerminal>row.published||row.newPublished>row.published||
   !validTime(row.latestPublishedAt)||
   row.latestPublishedAt>data.sampledAt+60000)
   return missing('Некорректный накопленный счётчик Room.');
  seen.add(key);
 }
 for(const tf of OVERVIEW_EXPERIENCE_RULES.frames){
  const row=data.rows.find(r=>r.asset===asset&&r.interval===tf)||
   {published:0,recordedTerminal:0,newPublished:0};
  const checkpoints=OVERVIEW_EXPERIENCE_RULES.checkpoints.map(c=>{
   const n=row[c.key],reached=Math.min(n,c.target);
   return {key:c.key,label:c.label,observed:n,
    target:c.target,progress:reached/c.target,
    filled:n>=c.target};
  });
  // Equal weight among three explicitly stated data-count milestones;
  // not a probability and NOT evidence of actual model learning.
  const progress=Math.round(checkpoints.reduce((sum,c)=>
   sum+c.progress,0)/checkpoints.length*100);
  frames[tf]={interval:tf,progress,checkpoints,
   countMilestonesMet:checkpoints.filter(x=>x.filled).length,
   readyForQualityAudit:checkpoints.every(x=>x.filled),
   trained:false,calibratedProbability:null};
 }
 return {state:'COUNTS_AVAILABLE',asset,frames,
  sampledAt:data.sampledAt,trained:false,calibratedProbability:null,
  note:'Процент показывает заполнение трёх порогов по количеству записей, '+
   'а НЕ степень интеллекта, проверенную точность или вероятность успеха. '+
   'Качество исходов, свежесть источников и устойчивость проверяются '+
   'только при исследовании полного архива.'};
}
export function initOverviewResearchProgress({getFavorites,
 storage=safeStorage(),now=today}={}){
 const select=get('overview-experience-asset');
 const list=get('overview-experience-bars');
 const status=get('overview-experience-status');
 const refresh=get('overview-experience-refresh');
 if(!select||!list||!status||!refresh)return {openOverview(){},
  favoritesChanged(){},researchUpdated(){}};
 let current=null,busy=false,lastReadAt=0,request=0,lastError=null;
 const favoriteList=()=>normalizedFavorites(getFavorites?.());
 const same=(a,b)=>a.length===b.length&&a.every(x=>b.includes(x));
 function fromCache(favorites){
  let cache;
  try{
   const raw=storage?.getItem?.(KEY);
   if(!raw||raw.length>14000)return null;
   cache=JSON.parse(raw);
  }catch{return null;}
  if(cache?.version!==OVERVIEW_EXPERIENCE_VERSION||
   !same(cache?.favorites||[],favorites)||
   !validTime(cache.sampledAt)||cache.sampledAt>now()+60000||
   now()-cache.sampledAt>OVERVIEW_EXPERIENCE_RULES.cacheMaxAgeMs||
   !Array.isArray(cache.rows))return null;
  const data={source:'LOCAL_ROOM_PROGRESS_V1',
   complete:true,favorites:cache.favorites,
   sampledAt:cache.sampledAt,
   registrationAt:Date.UTC(2026,10,11),rows:cache.rows};
  if(favorites.some(x=>measureResearchExperience(data,x).state!=='COUNTS_AVAILABLE'))
   return null;
  return data;
 }
 function cache(data){
  try{storage?.setItem?.(KEY,JSON.stringify({
   version:OVERVIEW_EXPERIENCE_VERSION,
   sampledAt:data.sampledAt,favorites:data.favorites,rows:data.rows
  }))}catch{}
 }
 function render(){
  const favorites=favoriteList(),old=select.value;
  if([...select.options].map(x=>x.value).join('|')!==favorites.join('|')){
   select.replaceChildren();
   for(const symbol of favorites){
    const option=document.createElement('option');
    option.value=symbol;option.textContent=symbol;
    select.append(option);
   }
   select.value=favorites.includes(old)?old:(favorites[0]||'');
  }
  const asset=select.value;
  select.disabled=favorites.length<=1;
  refresh.disabled=busy||!favorites.length;
  list.replaceChildren();
  if(!favorites.length){
   status.textContent='Добавьте актив в избранное для учёта наблюдений.';
   return;
  }
  const counts=measureResearchExperience(current,asset);
  if(counts.state!=='COUNTS_AVAILABLE'){
   status.textContent=lastError||
    'Ожидаем сохранённую сводку Room по избранному.';
   return;
  }
  const cachedAge=now()-current.sampledAt;
  const prefix=cachedAge>OVERVIEW_EXPERIENCE_RULES.refreshIntervalMs?
   'Сохранённые данные':'Room';
  status.textContent=prefix+' · '+new Date(current.sampledAt)
   .toLocaleString('ru-RU')+
   (lastError?' · обновление недоступно: '+lastError:'');
  for(const [tf,title] of [['15m','M15'],['1h','H1'],['4h','H4']]){
   const item=counts.frames[tf];
   const wrap=node('div','overview-experience-frame');
   const head=node('div','overview-experience-heading');
   head.append(node('strong','',title),
    node('span','',item.progress+'% материала'));
   wrap.append(head);
   const bar=node('div','overview-experience-track');
   bar.setAttribute('role','progressbar');
   bar.setAttribute('aria-label',title+' · заполнение порогов по количеству записей');
   bar.setAttribute('aria-valuemin','0');
   bar.setAttribute('aria-valuemax','100');
   bar.setAttribute('aria-valuenow',String(item.progress));
   const fill=node('span','overview-experience-fill');
   fill.style.width=item.progress+'%';
   bar.append(fill);wrap.append(bar);
   const breakdown=node('div','overview-experience-counts');
   for(const milestone of item.checkpoints){
    const text=node('span','',
     milestone.label+' '+milestone.observed+'/'+milestone.target);
    breakdown.append(text);
   }
   wrap.append(breakdown);
   if(item.readyForQualityAudit){
    wrap.append(node('small','overview-experience-caveat',
     'Числовые ориентиры выполнены · требуется проверка качества истории'));
   }
   list.append(wrap);
  }
 }
 async function poll(force=false){
  if(busy)return;
  const favorites=favoriteList();
  if(!favorites.length){current=null;render();return;}
  if(!force&&current&&same(current.favorites,favorites)&&
   now()-lastReadAt<OVERVIEW_EXPERIENCE_RULES.refreshIntervalMs){
   render();return;
  }
  const token=++request;
  busy=true;lastError=null;render();
  const answer=await getMobileResearchProgress(favorites);
  busy=false;
  if(token!==request||!same(favorites,favoriteList()))return;
  if(answer.complete){
   current=answer;lastReadAt=now();cache(answer);
  }else{
   lastError=answer.error||'Сводка Room недоступна.';
  }
  render();
 }
 function favoritesChanged(){
  ++request;
  current=fromCache(favoriteList());
  lastReadAt=0;
  lastError=null;
  if(document.body.dataset.view==='overview')void poll(true);
  else render();
 }
 select.addEventListener('change',render);
 refresh.addEventListener('click',()=>void poll(true));
 current=fromCache(favoriteList());
 render();
 return {
  openOverview(){
   if(!current||!same(current.favorites,favoriteList()))
    current=fromCache(favoriteList());
   render();void poll(false);
  },
  favoritesChanged,
  researchUpdated(){
   if(document.body.dataset.view==='overview')void poll(true);
   else lastReadAt=0;
  }
 };
}
