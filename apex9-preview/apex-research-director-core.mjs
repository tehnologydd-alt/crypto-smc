/**
 * APEX Research Director stage 1: offline evidence-prioritized task queue.
 * NO automatic Workers AI calls, orders, public network requests or predictions.
 * Closed native Radar observations and Room 15m candles are the only sources.
 */
import {validateRadarObservation} from './radar-changes.mjs';
import {validateCollectiveSession} from './cloud-ai-collective.mjs';
export const DIRECTOR_STORAGE_KEY='apex9.research.director.v1';
const STEP=900000,HOUR=3600000,DAY=86400000,MAX=24;
const SYMBOL=/^[A-Z0-9]{2,16}USDT$/;
const KINDS=new Set(['FRAME_CONFLICT','MOMENTUM_VOLUME','MANUAL']);
const STAGES=new Set(['QUEUED','ANALYST_READY','REVIEWED']);
const clock=t=>Number.isSafeInteger(t)&&t>0;
const numeric=x=>typeof x==='number'&&Number.isFinite(x);
const evidence=e=>e&&typeof e.source_id==='string'&&e.source_id.length<=100&&
 clock(e.observed_at)&&typeof e.text==='string'&&e.text.length<=1500;
const concise=s=>typeof s==='string'&&s.trim().length>=15&&s.length<=2400;
function fact(row){
 return {interval:row.interval,candleAt:row.candleAt,
  direction:row.direction,mode:row.mode,
  movement:row.movement,acceleration:row.acceleration,
  volumeRatio:row.volumeRatio,source:'ANDROID_NATIVE_RADAR'};
}
function validFact(x){
 return x&&['15m','1h'].includes(x.interval)&&clock(x.candleAt)&&
 ['UP','DOWN','FLAT'].includes(x.direction)&&
 ['DIRECTIONAL','RANGE','MIXED'].includes(x.mode)&&
 numeric(x.movement)&&Math.abs(x.movement)<=1000&&
 numeric(x.acceleration)&&Math.abs(x.acceleration)<=1000&&
 (x.volumeRatio===null||numeric(x.volumeRatio)&&x.volumeRatio>=0)&&
 x.source==='ANDROID_NATIVE_RADAR';
}
function latest(records,asset,interval,now){
 const found=(records||[]).filter(x=>x?.latest?.symbol===asset&&
  x.latest.interval===interval&&validateRadarObservation(x.latest)&&
  x.latest.candleAt<=now&&x.latest.observedAt<=now+60000&&
  now-x.latest.candleAt<= (interval==='15m'?45:120)*60000)
  .sort((a,b)=>b.latest.candleAt-a.latest.candleAt);
 return found[0]?.latest||null;
}
export function discoverResearchTasks(native,favorites,{now=Date.now()}={}){
 if(native?.native!==true||native.source!=='ANDROID_NATIVE_RADAR'||
  !Array.isArray(native.records)||!Array.isArray(favorites)||!clock(now))return [];
 const tasks=[],selected=[...new Set(favorites.filter(x=>SYMBOL.test(x)))].slice(0,10);
 for(const asset of selected){
  const a=latest(native.records,asset,'15m',now);
  const b=latest(native.records,asset,'1h',now);
  if(!a)continue;
  let kind=null,reason='';
  if(b&&a.direction!=='FLAT'&&b.direction!=='FLAT'&&
   a.direction!==b.direction){
   kind='FRAME_CONFLICT';
   reason='M15 и H1 расходятся по направлению; причины ещё не установлены';
  }else if(a.volumeRatio!==null&&a.volumeRatio>=2.3&&
   Math.abs(a.movement)>=0.4){
   kind='MOMENTUM_VOLUME';
   reason='M15: повышенный объём и модуль движения; направленный прогноз не выдан';
  }
  if(!kind)continue;
  const facts=[fact(a),...(b?[fact(b)]:[])];
  const id='director:'+asset+':'+kind+':'+a.candleAt;
  tasks.push({id,asset,kind,reason,detectedAt:now,sourceAt:a.candleAt,
   stage:'QUEUED',facts,priority:kind==='FRAME_CONFLICT'?'REVIEW':'WATCH',
   analyst:null,critic:null,baseline:null,outcome:null});
 }
 return tasks;
}
const boundedReport=x=>x&&clock(x.at)&&concise(x.text)&&
 Array.isArray(x.sourceIds)&&x.sourceIds.length>=1&&x.sourceIds.length<=5&&
 x.sourceIds.every(s=>typeof s==='string'&&s.length<=100)&&
 new Set(x.sourceIds).size===x.sourceIds.length;
const validBar=(bar,now)=>bar?.closed===true&&clock(bar.t)&&
 bar.t%STEP===0&&bar.closeAt===bar.t+STEP-1&&bar.closeAt<=now&&
 numeric(bar.close)&&bar.close>0&&numeric(bar.low)&&numeric(bar.high)&&
 bar.low>0&&bar.low<=bar.close&&bar.high>=bar.close&&
 clock(bar.recordedAt)&&bar.recordedAt>=bar.closeAt&&
 bar.recordedAt<=now+60000;
function safeBaseline(v){
 return v&&clock(v.closeAt)&&v.closeAt%STEP===STEP-1&&
 numeric(v.close)&&v.close>0&&clock(v.recordedAt)?v:null;
}
function safeOutcome(v,base,now){
 return v&&base&&v.horizonAt===base.closeAt+4*STEP&&
 clock(v.verifiedAt)&&v.verifiedAt<=now+60000&&
 v.verifiedAt>=v.horizonAt&&numeric(v.close)&&v.close>0&&
 numeric(v.deltaPct)&&Math.abs(v.deltaPct)<=100000&&
 Math.abs(v.deltaPct-((v.close/base.close-1)*100))<0.0001?v:null;
}
function verifyTask(raw,now){
 if(!raw||typeof raw.id!=='string'||raw.id.length>110||
  !SYMBOL.test(raw.asset)||!KINDS.has(raw.kind)||
  !STAGES.has(raw.stage)||!clock(raw.detectedAt)||
  raw.detectedAt>now+60000||now-raw.detectedAt>30*DAY||
  !clock(raw.sourceAt)||raw.sourceAt>raw.detectedAt+60000||
  typeof raw.reason!=='string'||raw.reason.length>190||
  !['REVIEW','WATCH','MANUAL'].includes(raw.priority)||
  !Array.isArray(raw.facts)||raw.facts.length>2||
  !raw.facts.every(validFact))return null;
 const expected=raw.kind==='MANUAL'?
  'manual:'+raw.asset+':'+raw.detectedAt:
  'director:'+raw.asset+':'+raw.kind+':'+raw.sourceAt;
 if(raw.id!==expected||raw.kind!=='MANUAL'&&!raw.facts.length)return null;
 const analyst=raw.analyst===null?null:boundedReport(raw.analyst)?{
  at:raw.analyst.at,text:raw.analyst.text,sourceIds:[...raw.analyst.sourceIds]
 }:null;
 const critic=raw.critic===null?null:boundedReport(raw.critic)?{
  at:raw.critic.at,text:raw.critic.text,sourceIds:[...raw.critic.sourceIds]
 }:null;
 if(raw.analyst!==null&&!analyst||raw.critic!==null&&!critic||
  raw.stage==='ANALYST_READY'&&!analyst||
  raw.stage==='REVIEWED'&&(!analyst||!critic))return null;
 const baseline=raw.baseline===null?null:safeBaseline(raw.baseline);
 if(raw.baseline!==null&&!baseline)return null;
 const outcome=raw.outcome===null?null:safeOutcome(raw.outcome,baseline,now);
 if(raw.outcome!==null&&!outcome)return null;
 return {...raw,facts:raw.facts.map(x=>({...x})),analyst,critic,
  baseline:baseline?{closeAt:baseline.closeAt,close:baseline.close,
    recordedAt:baseline.recordedAt}:null,
  outcome:outcome?{horizonAt:outcome.horizonAt,close:outcome.close,
    deltaPct:outcome.deltaPct,verifiedAt:outcome.verifiedAt}:null};
}
export function readDirectorJournal(storage,{now=Date.now()}={}){
 try{
  const str=storage?.getItem?.(DIRECTOR_STORAGE_KEY);
  if(!str||str.length>150000)return [];
  const value=JSON.parse(str);
  if(value?.version!==1||!Array.isArray(value.tasks)||value.tasks.length>MAX)return [];
  const used=new Set(),out=[];
  for(const raw of value.tasks){
   const row=verifyTask(raw,now);
   if(row&&!used.has(row.id)){used.add(row.id);out.push(row);}
  }
  return out;
 }catch{return [];}
}
export function persistDirectorJournal(storage,tasks){
 try{
  const payload=JSON.stringify({version:1,tasks:tasks.slice(0,MAX)});
  if(payload.length>150000)return false;
  storage?.setItem?.(DIRECTOR_STORAGE_KEY,payload);
  return Boolean(storage?.setItem);
 }catch{return false;}
}
export function mergeDirectorTasks(existing,candidates,{now=Date.now()}={}){
 const indexed=new Set(existing.map(x=>x.id));
 const newTasks=[];
 for(const c of candidates){
  const validated=verifyTask(c,now);
  if(!validated||indexed.has(validated.id))continue;
  // Keep only one open task per asset, not a new one every M15 bar.
  if(existing.some(t=>t.asset===validated.asset&&t.stage!=='REVIEWED'&&
     now-t.detectedAt<2*HOUR))continue;
  indexed.add(validated.id);newTasks.push(validated);
 }
 return [...newTasks,...existing].sort((a,b)=>b.detectedAt-a.detectedAt).slice(0,MAX);
}
/** Sessions are actual previously verified model results, not synthetic claims. */
export function attachCollectiveResult(tasks,session,{
 now=Date.now(),selectedId=null
}={}){
 const checked=validateCollectiveSession(session,now);
 if(!checked||!SYMBOL.test(checked.asset))return tasks;
 const find=t=>t.asset===checked.asset&&t.detectedAt<=checked.startedAt&&
  checked.startedAt-t.detectedAt<=2*HOUR;
 let target=tasks.find(t=>t.id===selectedId&&find(t))||
  tasks.find(t=>find(t)&&t.stage!=='REVIEWED');
 if(!target){
  const started=checked.startedAt;
  target={id:'manual:'+checked.asset+':'+started,asset:checked.asset,
   kind:'MANUAL',reason:'Проверенная пользователем совместная исследовательская сессия',
   detectedAt:started,sourceAt:started,stage:'QUEUED',facts:[],
   priority:'MANUAL',analyst:null,critic:null,baseline:null,outcome:null};
 }
 const analyst={at:checked.startedAt,text:checked.analystText,
  sourceIds:[...checked.sourceIds]};
 const critic=checked.stage==='COMPLETE'?{
  at:checked.criticAt,text:checked.criticText,
  sourceIds:checked.criticEvidence.map(x=>x.source_id)
 }:null;
 const updated={...target,stage:critic?'REVIEWED':'ANALYST_READY',analyst,
  critic:critic||target.critic};
 if(!verifyTask(updated,now))return tasks;
 return [updated,...tasks.filter(t=>t.id!==updated.id)]
  .sort((a,b)=>b.detectedAt-a.detectedAt).slice(0,MAX);
}
/** Evaluate descriptive movement only, never claim the model predicted direction. */
export function evaluateDirectorTask(task,candles,{now=Date.now()}={}){
 if(!task||!Array.isArray(candles)||task.kind==='MANUAL')return task;
 const bars=candles.filter(b=>validBar(b,now)).sort((a,b)=>a.closeAt-b.closeAt);
 if(!task.baseline){
  const candidates=bars.filter(b=>b.closeAt<=task.detectedAt&&
   task.detectedAt-b.closeAt<=3*STEP&&
   b.recordedAt<=task.detectedAt+60000);
  const bar=candidates.at(-1);
  if(!bar)return task;
  task={...task,baseline:{closeAt:bar.closeAt,close:bar.close,
   recordedAt:bar.recordedAt}};
 }
 if(task.outcome)return task;
 const horizonAt=task.baseline.closeAt+4*STEP;
 const end=bars.find(b=>b.closeAt===horizonAt&&
  b.recordedAt>=horizonAt&&b.recordedAt<=now+60000);
 if(!end||now<horizonAt)return task;
 const deltaPct=(end.close/task.baseline.close-1)*100;
 if(!Number.isFinite(deltaPct))return task;
 return {...task,outcome:{horizonAt,close:end.close,
   deltaPct:Number(deltaPct.toFixed(6)),verifiedAt:now}};
}
export function summarizeDirectorTasks(tasks){
 const selected=tasks||[];
 return {total:selected.length,queued:selected.filter(x=>x.stage==='QUEUED').length,
  analystReady:selected.filter(x=>x.stage==='ANALYST_READY').length,
  reviewed:selected.filter(x=>x.stage==='REVIEWED').length,
  marketOutcomes:selected.filter(x=>x.outcome!==null).length,
  modelAccuracy:null,calibratedProbability:null,
  note:'Наблюдаемая цена через H1 не подтверждает правильность текстовых выводов моделей'};
}
