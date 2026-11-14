/**
 * APEX offline Research Director: surface verified Radar queue; link only
 * confirmed two-tap GLM/Qwen sessions. All native reads are local and bounded.
 */
import {DIRECTOR_STORAGE_KEY,readDirectorJournal,persistDirectorJournal,
 discoverResearchTasks,mergeDirectorTasks,attachCollectiveResult,
 evaluateDirectorTask,summarizeDirectorTasks}
 from './apex-research-director-core.mjs';
const getStore=()=>{
 try{return globalThis.localStorage||null;}catch{return null;}
};
const fmt=at=>new Intl.DateTimeFormat('ru-RU',{
 day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',
 timeZone:'Europe/Kyiv'
}).format(new Date(at));
const names={
 FRAME_CONFLICT:'Расхождение M15 / H1',
 MOMENTUM_VOLUME:'Ускорение и объём M15',
 MANUAL:'Исследование по запросу'
};
export function initApexResearchDirector({getFavorites,getRadar,getCandles,
 onChoose,store=getStore(),now=()=>Date.now()}){
 const node=id=>document.getElementById(id);
 const panel=node('apex-director-panel');
 const status=node('apex-director-status');
 const summary=node('apex-director-summary');
 const list=node('apex-director-tasks');
 const refresh=node('apex-director-refresh');
 let tasks=readDirectorJournal(store,{now:now()}),selected=null,scanning=false;
 let lastScan=0;
 const getSelected=()=>selected;
 const persist=()=>persistDirectorJournal(store,tasks);
 function render(){
  const favorite=new Set((getFavorites()||[]).slice(0,10));
  const shown=tasks.filter(t=>favorite.has(t.asset)).slice(0,12);
  const stats=summarizeDirectorTasks(tasks);
  summary.textContent='Очередь '+stats.queued+
   ' · GLM '+stats.analystReady+' · проверено Qwen '+stats.reviewed+
   ' · уникальных сессий '+stats.distinctSessions+
   ' · наблюдаемых исходов H1 '+stats.marketOutcomes+
   ' · точность моделей ещё не измерена';
  list.replaceChildren();
  if(!shown.length){
   const empty=document.createElement('li');
   empty.textContent='Нет подтверждённых событий для избранного. Журнал не заполняется вымышленными данными.';
   list.append(empty);return;
  }
  for(const task of shown){
   const li=document.createElement('li');
   const main=document.createElement('div');
   const label=document.createElement('strong');
   label.textContent=task.asset+' · '+names[task.kind];
   const meta=document.createElement('small');
   const stage=task.stage==='REVIEWED'?'GLM + Qwen':
    task.stage==='ANALYST_READY'?'GLM выполнен · Qwen ожидается':'Ожидает исследования';
   const movement=task.outcome?
    ' · H1 факт '+(task.outcome.deltaPct>=0?'+':'')+
     task.outcome.deltaPct.toFixed(2)+'% (не оценка прогноза)':'';
   meta.textContent=fmt(task.detectedAt)+' · '+stage+movement;
   main.append(label,meta);
   if(task.reason){
    const reason=document.createElement('span');
    reason.textContent=task.reason;
    main.append(reason);
   }
   const choose=document.createElement('button');
   choose.type='button';choose.className='ghost';
   choose.textContent=task.stage==='REVIEWED'?'Проверка завершена':
    task.stage==='ANALYST_READY'?'Открыть сессию':'Выбрать для исследования';
   choose.disabled=!favorite.has(task.asset)||task.stage==='REVIEWED';
   choose.addEventListener('click',()=>{
    selected=task.id;
    onChoose(task.asset);
    status.textContent='Выбран '+task.asset+
     '. Запуск GLM и Qwen возможен только вашими кнопками ниже.';
   });
   li.append(main,choose);list.append(li);
  }
 }
 async function scan({force=false}={}){
  if(scanning||!force&&now()-lastScan<90000)return;
  if(!(getFavorites()||[]).length){render();return;}
  scanning=true;refresh.disabled=true;
  try{
   const radar=await getRadar();
   if(radar?.native!==true){
    status.textContent='Локальный Радар Android недоступен; заявки не создавались.';
    return;
   }
   const candidates=discoverResearchTasks(radar,getFavorites(),{now:now()});
   tasks=mergeDirectorTasks(tasks,candidates,{now:now()});
   // Room cache only. No external fetch and no source repair/backfill.
   const targets=tasks.filter(x=>x.kind!=='MANUAL'&&
    (!x.baseline||!x.outcome)&&now()-x.detectedAt<36*3600000).slice(0,8);
   const cache=new Map();
   for(const task of targets){
    if(!cache.has(task.asset)){
     const candles=await getCandles(task.asset,'15m',180);
     cache.set(task.asset,candles?.native===true&&
      candles.source==='LOCAL_ROOM_CACHE'&&!candles.error?
      candles.candles:[]);
    }
    tasks=tasks.map(t=>t.id===task.id?
     evaluateDirectorTask(t,cache.get(task.asset),{now:now()}):t);
   }
   persist();
   lastScan=now();
   status.textContent='Проверено '+candidates.length+
    ' подтверждённых ситуаций из локального Радара. Запросов к ИИ: 0.';
  }catch{
   status.textContent='Не удалось прочитать локальный архив. Новые задачи не созданы.';
  }finally{scanning=false;refresh.disabled=false;render();}
 }
 function onCollectiveSession(result){
  const next=attachCollectiveResult(tasks,result,{now:now(),selectedId:selected});
  if(next!==tasks){tasks=next;persist();render();}
 }
 refresh.addEventListener('click',()=>void scan({force:true}));
 render();
 return {scan,render,onCollectiveSession,getTasks:()=>tasks.map(t=>({...t})),
  getSelected,storageKey:DIRECTOR_STORAGE_KEY,panel};
}
