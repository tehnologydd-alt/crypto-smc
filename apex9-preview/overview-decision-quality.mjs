/**
 * Overview of independent, pre-registered Shadow Challenger research.
 * Purely read-only. The overview NEVER reads a full Room archive itself.
 * The user explicitly audits one favorite in the Forecasts panel; only a
 * bounded summary of that audit is cached for this overview.
 *
 * The 3-way check is descriptive, NOT significance, learning, probability,
 * profitability or permission to promote a trading model.
 */
import {auditShadowChallengers,SHADOW_CHALLENGER_REGISTRATION}
 from './forecast-shadow-challengers.mjs';
import {auditShadowRegimes} from './forecast-shadow-regimes.mjs';
import {featureFrameOf} from './forecast-feature-ablation.mjs';

export const DECISION_QUALITY_VERSION='APEX_OVERVIEW_DECISION_QUALITY_V1';
export const DECISION_QUALITY_KEY='apex9:decision-quality:v1';
export const DECISION_QUALITY_MAX_AGE=30*86400000;
const FRAMES=['15m','1h','4h'];
const STATES=['COLLECTING','CHECK_DATA','NOT_BETTER','UNSTABLE','REPEATED','REGIME_SUPPORT'];
const validAsset=x=>typeof x==='string'&&/^[A-Z0-9]{5,20}$/.test(x);
const count=x=>Number.isSafeInteger(x)&&x>=0;
const time=x=>Number.isSafeInteger(x)&&x>0;
const auc=x=>typeof x==='number'&&Number.isFinite(x)&&x>=0&&x<=1;
const safeStorage=()=>{
 try{return globalThis.localStorage}catch{return null}
};
const setText=(tag,value,klass='')=>{
 const n=document.createElement(tag);
 n.textContent=String(value);
 if(klass)n.className=klass;
 return n;
};
function validFrame(f){
 return f&&STATES.includes(f.state)&&count(f.published)&&
  count(f.newPublished)&&count(f.newScored)&&
  f.newScored<=f.newPublished&&count(f.repeatedModels)&&
  f.repeatedModels<=3&&count(f.regimeRepeatedModels)&&
  f.regimeRepeatedModels<=f.repeatedModels&&
  (f.structureDelta===null||
   (Array.isArray(f.structureDelta)&&f.structureDelta.length===3&&
    f.structureDelta.every(x=>typeof x==='number'&&Number.isFinite(x)&&
     x>=-1&&x<=1)));
}
export function summarizeDecisionQuality({archive,asset,challenge,regimes,
 now=Date.now()}={}){
 if(!validAsset(asset)||!time(now)||archive?.complete!==true||
  !Array.isArray(archive.forecasts)||!count(archive.publishedCount)||
  archive.publishedCount!==archive.forecasts.length||
  archive.forecasts.some(x=>x?.asset!==asset)||
  challenge?.asset!==asset||regimes?.asset!==asset||
  !challenge.frames||!regimes.frames)
  return null;
 const frames={};
 for(const tf of FRAMES){
  const compared=challenge.frames[tf],modes=regimes.frames[tf];
  if(!compared||!modes||!count(compared.futurePublished)||
   !count(compared.newScored)||compared.newScored>compared.futurePublished||
   typeof compared.state!=='string'||typeof modes.state!=='string')
   return null;
  const published=archive.forecasts.filter(x=>featureFrameOf(x)===tf).length;
  const invalid=['INVALID','INCOMPLETE','INVALID_EVIDENCE','LOW_SCORE_COVERAGE',
   'LOW_COVERAGE','UNVERIFIED'];
  const checkData=invalid.includes(compared.state)||
   invalid.includes(modes.state);
  const models=compared.state==='DESCRIPTIVE'?compared.models:[];
  if(!Array.isArray(models)||models.length>3)return null;
  const repeated=models.filter(m=>m.state==='OBSERVED_THREE_TIMES');
  const regimeSupport=repeated.filter(model=>
   Object.values(modes.regimes||{}).some(mode=>
    mode?.state==='DESCRIPTIVE'&&
    mode.models?.some(m=>m.id===model.id&&m.state==='OBSERVED_THREE_TIMES')));
  const structure=models.find(m=>m.id==='STRUCTURE_V1');
  const deltas=structure?.deltaAuc;
  const structureDelta=Array.isArray(deltas)&&deltas.length===3&&
   deltas.every(x=>typeof x==='number'&&Number.isFinite(x)&&x>=-1&&x<=1)?
    deltas.map(x=>Math.round(x*10000)/10000):null;
  let state='COLLECTING';
  if(checkData)state='CHECK_DATA';
  else if(compared.state==='DESCRIPTIVE'){
   state=regimeSupport.length?'REGIME_SUPPORT':
    repeated.length?'REPEATED':
    models.some(m=>m.state==='RECENTLY_WORSE'||
      m.state==='NO_LONGER_BETTER'||m.state==='LATE_ONLY')?
     'UNSTABLE':'NOT_BETTER';
  }
  frames[tf]={state,published,newPublished:compared.futurePublished,
   newScored:compared.newScored,repeatedModels:repeated.length,
   regimeRepeatedModels:regimeSupport.length,structureDelta};
  if(!validFrame(frames[tf]))return null;
 }
 return {version:DECISION_QUALITY_VERSION,asset,auditedAt:now,
  archiveCount:archive.publishedCount,
  registrationAt:SHADOW_CHALLENGER_REGISTRATION,
  frames,autoTraining:false,calibratedProbability:null};
}
export function saveDecisionQualityAudit(archive,asset,{
 now=Date.now(),storage=safeStorage(),emit=true
}={}){
 if(!storage||!validAsset(asset))return false;
 const opts={asset,complete:archive?.complete,
  publishedCount:archive?.publishedCount,now};
 const challenge=auditShadowChallengers(archive?.forecasts,opts);
 const regimes=auditShadowRegimes(archive?.forecasts,opts);
 const result=summarizeDecisionQuality({archive,asset,challenge,regimes,now});
 if(!result)return false;
 let previous={};
 try{
  const raw=storage.getItem(DECISION_QUALITY_KEY);
  if(raw&&raw.length<20000){
   const decoded=JSON.parse(raw);
   if(decoded?.version===DECISION_QUALITY_VERSION&&
    decoded.summaries&&typeof decoded.summaries==='object')
    previous=decoded.summaries;
  }
 }catch{}
 const summaries={};
 for(const [symbol,value] of Object.entries(previous)){
  if(validAsset(symbol)&&validSnapshot(value,now)&&
   symbol!==asset&&Object.keys(summaries).length<9)
   summaries[symbol]=value;
 }
 summaries[asset]=result;
 try{storage.setItem(DECISION_QUALITY_KEY,JSON.stringify({
  version:DECISION_QUALITY_VERSION,summaries
 }))}catch{return false}
 if(emit&&typeof window!=='undefined'&&
  typeof window.dispatchEvent==='function'&&
  typeof CustomEvent==='function')
  window.dispatchEvent(new CustomEvent('apex:decision-quality-checked'));
 return true;
}
function validSnapshot(s,now){
 return s?.version===DECISION_QUALITY_VERSION&&validAsset(s.asset)&&
  time(s.auditedAt)&&s.auditedAt<=now+60000&&
  now-s.auditedAt<=DECISION_QUALITY_MAX_AGE&&
  count(s.archiveCount)&&
  s.registrationAt===SHADOW_CHALLENGER_REGISTRATION&&
  s.autoTraining===false&&s.calibratedProbability===null&&
  FRAMES.every(tf=>validFrame(s.frames?.[tf]));
}
export function readDecisionQuality(asset,{
 now=Date.now(),storage=safeStorage()
}={}){
 if(!validAsset(asset)||!storage)return null;
 try{
  const raw=storage.getItem(DECISION_QUALITY_KEY);
  if(!raw||raw.length>20000)return null;
  const payload=JSON.parse(raw);
  const snapshot=payload?.version===DECISION_QUALITY_VERSION?
   payload.summaries?.[asset]:null;
  return validSnapshot(snapshot,now)&&snapshot.asset===asset?snapshot:null;
 }catch{return null}
}
export function decisionQualityView(asset,{
 now=Date.now(),storage=safeStorage(),roomRows=null
}={}){
 const snapshot=readDecisionQuality(asset,{now,storage});
 if(!snapshot)return {state:'NOT_AUDITED',frames:null};
 const frames={};
 for(const tf of FRAMES){
  const frame=snapshot.frames[tf];
  const native=Array.isArray(roomRows)?roomRows.find(r=>
   r?.asset===asset&&r.interval===tf):null;
  const outOfDate=native&&count(native.published)&&
   native.published!==frame.published;
  frames[tf]={...frame,outOfDate:Boolean(outOfDate)};
 }
 return {state:'AUDITED',auditedAt:snapshot.auditedAt,frames};
}
const titles={COLLECTING:'Накопление новых исходов',
 CHECK_DATA:'Нужно проверить исходные данные',
 NOT_BETTER:'Устойчивого преимущества нет',
 UNSTABLE:'Результаты между периодами расходятся',
 REPEATED:'Повторение в трёх периодах',
 REGIME_SUPPORT:'Повторение и проверка по режимам'};
export function renderDecisionQuality({root,asset,now=Date.now(),
 storage=safeStorage(),roomRows=null}={}){
 if(!root)return;
 root.replaceChildren();
 const heading=setText('div','Проверка качества решений','overview-quality-heading');
 root.append(heading);
 const result=decisionQualityView(asset,{now,storage,roomRows});
 if(result.state==='NOT_AUDITED'){
  root.append(setText('p','Пока нет завершённого полного аудита этого актива. '+
   'Проверка запускается вручную во вкладке «Сценарии».',
   'overview-quality-hint'));
  return;
 }
 root.append(setText('small','Последний полный аудит: '+
  new Date(result.auditedAt).toLocaleString('ru-RU')+
  ' · сохранённая оценка, не онлайн',
  'overview-quality-hint'));
 for(const [tf,label] of [['15m','M15'],['1h','H1'],['4h','H4']]){
  const frame=result.frames[tf],row=setText('div','',
   'overview-quality-frame');
  const title=setText('strong',label);
  const status=setText('span',frame.outOfDate?
   'Новые записи · повторить аудит':titles[frame.state],
   'overview-quality-verdict');
  const line=document.createElement('div');
  line.className='overview-quality-line';
  line.append(title,status);row.append(line);
  row.append(setText('small','Новые предварительно оценённые сценарии: '+
   frame.newScored+' / 120 · повторяющиеся альтернативы: '+
   frame.repeatedModels+' / 3','overview-quality-hint'));
  if(frame.structureDelta&& !frame.outOfDate){
   const vals=frame.structureDelta;
   const track=document.createElement('div');
   track.className='overview-quality-windows';
   track.setAttribute('aria-label','Структура: положительная разница AUC в '+
    vals.filter(x=>x>=.03).length+' из 3 окон');
   for(const d of vals){
    const segment=document.createElement('span');
    segment.className='overview-quality-window'+(d>=.03?' is-positive':
     d<=-.03?' is-negative':'');
    segment.title='Разница AUC: '+(d>=0?'+':'')+d.toFixed(3);
    track.append(segment);
   }
   row.append(track);
   row.append(setText('small','Структура против базовой модели · '+
    vals.map(x=>(x>=0?'+':'')+x.toFixed(3)).join(' / ')+
    ' ΔAUC по трём периодам','overview-quality-hint'));
  }
  if(frame.regimeRepeatedModels>0&&!frame.outOfDate)
   row.append(setText('small','Повторяется также по режимам: '+
    frame.regimeRepeatedModels+' / 3 альтернатив','overview-quality-hint'));
  root.append(row);
 }
 root.append(setText('small','AUC показывает различение TP3 и SL на '+
  'проверенных исходах. Это не вероятность прибыли, доказанная '+
  'точность или обученность ИИ. Веса действующей модели не менялись.',
  'overview-quality-hint'));
}
