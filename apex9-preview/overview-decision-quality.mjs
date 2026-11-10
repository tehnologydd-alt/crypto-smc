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
import {DIAGNOSTIC_CODES,DIAGNOSTIC_LABELS}
 from './forecast-quality-diagnostics.mjs';
import {FEATURE_PAIRS,FEATURE_PAIR_STATES}
 from './forecast-feature-pairs.mjs';
import {FEATURE_REGIME_STATES}
 from './forecast-feature-regime-review.mjs';

export const DECISION_QUALITY_VERSION='APEX_OVERVIEW_DECISION_QUALITY_V1';
export const DECISION_QUALITY_KEY='apex9:decision-quality:v1';
export const DECISION_QUALITY_MAX_AGE=30*86400000;
export const DECISION_HISTORY_KEY='apex9:decision-history:v1';
export const DECISION_HISTORY_LIMIT=12;
const FRAMES=['15m','1h','4h'];
const STATES=['COLLECTING','CHECK_DATA','NOT_BETTER','UNSTABLE','REPEATED','REGIME_SUPPORT'];
const validAsset=x=>typeof x==='string'&&/^[A-Z0-9]{5,20}$/.test(x);
const count=x=>Number.isSafeInteger(x)&&x>=0;
const time=x=>Number.isSafeInteger(x)&&x>0;
const auc=x=>typeof x==='number'&&Number.isFinite(x)&&x>=0&&x<=1;
const validRegimes=p=>p===undefined||p===null||(
 Array.isArray(p)&&p.length===3&&p.every((item,i)=>
  item?.id===FEATURE_PAIRS[i].id&&
  FEATURE_REGIME_STATES.includes(item.state)&&
  Number.isSafeInteger(item.comparableModes)&&
  item.comparableModes>=0&&item.comparableModes<=3));
const validPairs=p=>p===undefined||p===null||(
 Array.isArray(p)&&p.length===3&&p.every((item,i)=>
  item?.id===FEATURE_PAIRS[i].id&&
  FEATURE_PAIR_STATES.includes(item.state)&&
  typeof item.latestGain==='number'&&Number.isFinite(item.latestGain)&&
  item.latestGain>=-1&&item.latestGain<=1));
const validDiagnosis=d=>d===undefined||d===null||
 (d&&['CHECK_DATA','COLLECTING','REVIEW','NO_FLAGS'].includes(d.state)&&
  Array.isArray(d.codes)&&d.codes.length>=1&&d.codes.length<=5&&
  d.codes.every(x=>DIAGNOSTIC_CODES.includes(x)));
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
  count(f.recordedTerminal)&&f.recordedTerminal<=f.published&&
  count(f.newPublished)&&count(f.newScored)&&
  f.newScored<=f.newPublished&&count(f.repeatedModels)&&
  f.repeatedModels<=3&&count(f.regimeRepeatedModels)&&
  f.regimeRepeatedModels<=f.repeatedModels&&
  validDiagnosis(f.diagnosis)&&validPairs(f.pairs)&&validRegimes(f.pairRegimes)&&
  (f.baselineAuc===undefined||f.baselineAuc===null||
   (Array.isArray(f.baselineAuc)&&f.baselineAuc.length===3&&
    f.baselineAuc.every(auc)))&&
  (f.structureDelta===null||
   (Array.isArray(f.structureDelta)&&f.structureDelta.length===3&&
    f.structureDelta.every(x=>typeof x==='number'&&Number.isFinite(x)&&
     x>=-1&&x<=1)));
}
export function summarizeDecisionQuality({archive,asset,challenge,regimes,
 diagnostics=null,pairs=null,pairRegimes=null,now=Date.now()}={}){
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
  // Same inclusion as indexed native Room overview aggregate (by ID prefix).
  // Comparing BOTH published and terminal counts detects newly resolved TP/SL
  // even when no new forecast was published after the last audit.
  const matching=archive.forecasts.filter(x=>x?.interval===tf&&
   (tf==='1h'?x.id.startsWith('direction2:'):
    x.id.startsWith('direction3:')));
  const published=matching.length;
  const recordedTerminal=matching.filter(x=>
   ['TP3','STOP'].includes(x.evaluation?.outcome)).length;
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
  const rawBaseline=structure?.baselineAuc;
  const baselineAuc=Array.isArray(rawBaseline)&&rawBaseline.length===3&&
   rawBaseline.every(auc)?
    rawBaseline.map(x=>Math.round(x*10000)/10000):null;
  let state='COLLECTING';
  if(checkData)state='CHECK_DATA';
  else if(compared.state==='DESCRIPTIVE'){
   state=regimeSupport.length?'REGIME_SUPPORT':
    repeated.length?'REPEATED':
    models.some(m=>m.state==='RECENTLY_WORSE'||
      m.state==='NO_LONGER_BETTER'||m.state==='LATE_ONLY')?
     'UNSTABLE':'NOT_BETTER';
  }
  const pairFrame=pairs?.asset===asset&&
   pairs.frames?.[tf]?.state==='DESCRIPTIVE'?
    pairs.frames[tf]:null;
  const pairSummary=Array.isArray(pairFrame?.pairs)&&
   pairFrame.pairs.length===FEATURE_PAIRS.length?
    pairFrame.pairs.map((p,i)=>({
     id:FEATURE_PAIRS[i].id,state:p.state,
     latestGain:Math.round(p.periods[2].gain*10000)/10000
    })):null;
  const regimeFrame=pairRegimes?.asset===asset&&
   pairRegimes.frames?.[tf]?.state==='DESCRIPTIVE'?
    pairRegimes.frames[tf]:null;
  const regimeSummary=Array.isArray(regimeFrame?.pairs)&&
   regimeFrame.pairs.length===FEATURE_PAIRS.length?
    regimeFrame.pairs.map((p,i)=>({
     id:FEATURE_PAIRS[i].id,state:p.state,
     comparableModes:p.comparableModes
    })):null;
  const diagnosticFrame=diagnostics?.asset===asset?
   diagnostics.frames?.[tf]:null;
  frames[tf]={state,published,recordedTerminal,
   newPublished:compared.futurePublished,
   newScored:compared.newScored,repeatedModels:repeated.length,
   regimeRepeatedModels:regimeSupport.length,structureDelta,baselineAuc,
   pairs:validPairs(pairSummary)?pairSummary:null,
   pairRegimes:validRegimes(regimeSummary)?regimeSummary:null,
   diagnosis:diagnosticFrame&&validDiagnosis(diagnosticFrame)?
    {state:diagnosticFrame.state,codes:diagnosticFrame.codes.slice(0,5)}:null};
  if(!validFrame(frames[tf]))return null;
 }
 return {version:DECISION_QUALITY_VERSION,asset,auditedAt:now,
  archiveCount:archive.publishedCount,
  registrationAt:SHADOW_CHALLENGER_REGISTRATION,
  frames,autoTraining:false,calibratedProbability:null};
}
/** Three disjoint, forward-tested outcome cohorts in ONE manual audit.
 * Thresholds flag a descriptive change, never statistical significance,
 * future performance, a recalibrated probability, or permission to retrain.
 */
export function assessBaselineRankTrend(values){
 if(!Array.isArray(values)||values.length!==3||!values.every(auc))
  return {state:'NO_DATA',delta:null};
 const delta=Math.round((values[2]-values[0])*10000)/10000;
 const lastStep=values[2]-values[1];
 return {state:delta<=-.10&&lastStep<=-.04?'DECLINING':
  delta>=.10&&lastStep>=.04?'RISING':'MIXED',delta};
}
const historyFrames=['15m','1h','4h'];
const validHistoryFrame=x=>x&&
 count(x.published)&&count(x.recordedTerminal)&&
 x.recordedTerminal<=x.published&&count(x.newScored)&&
 ['NO_DATA','DECLINING','RISING','MIXED'].includes(x.trend)&&
 (x.lateAuc===null||auc(x.lateAuc));
function validHistoryPoint(p){
 return p&&count(p.archiveCount)&&time(p.auditedAt)&&p.frames&&
  historyFrames.every(tf=>validHistoryFrame(p.frames[tf]));
}
function storedHistory(storage){
 try{
  const raw=storage?.getItem?.(DECISION_HISTORY_KEY);
  if(!raw||raw.length>150000)return {};
  const obj=JSON.parse(raw);
  return obj?.version===1&&obj.assets&&
   typeof obj.assets==='object'&&!Array.isArray(obj.assets)?
    obj.assets:{};
 }catch{return {}}
}
/** Only stored manual audits; no Room queries or market polling on Overview. */
export function readDecisionHistory(asset,{
 storage=safeStorage(),now=Date.now()
}={}){
 if(!validAsset(asset)||!time(now))return [];
 const entries=storedHistory(storage)[asset];
 if(!Array.isArray(entries)||entries.length>DECISION_HISTORY_LIMIT||
  entries.some(p=>!validHistoryPoint(p)||p.auditedAt>now+60000)||
  entries.some((p,i)=>i>0&&entries[i-1].auditedAt>=p.auditedAt))
  return [];
 return entries.map(p=>({auditedAt:p.auditedAt,archiveCount:p.archiveCount,
  frames:Object.fromEntries(historyFrames.map(tf=>[tf,{...p.frames[tf]}]))
 }));
}
const historySignature=p=>JSON.stringify(historyFrames.map(tf=>{
 const f=p.frames[tf];
 return [f.published,f.recordedTerminal,f.newScored,f.trend,f.lateAuc];
}));
function rememberDecisionHistory(snapshot,{storage,now}){
 if(!storage||!time(now)||!validAsset(snapshot?.asset)||
  !time(snapshot.auditedAt)||snapshot.auditedAt>now+60000||
  !count(snapshot.archiveCount))return false;
 const point={auditedAt:snapshot.auditedAt,archiveCount:snapshot.archiveCount,
  frames:{}};
 for(const tf of historyFrames){
  const f=snapshot.frames?.[tf];
  const vals=f?.baselineAuc;
  point.frames[tf]={published:f?.published,
   recordedTerminal:f?.recordedTerminal,newScored:f?.newScored,
   trend:assessBaselineRankTrend(vals).state,
   lateAuc:Array.isArray(vals)&&vals.length===3&&vals.every(auc)?
    Math.round(vals[2]*10000)/10000:null};
 }
 if(!validHistoryPoint(point))return false;
 const all=storedHistory(storage),next={};
 for(const asset of Object.keys(all)){
  if(!validAsset(asset)||asset===snapshot.asset||
   Object.keys(next).length>=9)continue;
  const entries=readDecisionHistory(asset,{storage,now});
  if(entries.length)next[asset]=entries;
 }
 let entries=readDecisionHistory(snapshot.asset,{storage,now});
 const last=entries.at(-1);
 if(last&&last.auditedAt>point.auditedAt)return false;
 // Same observations and AUC => no new point. Manual re-run is NOT learning.
 if(last&&historySignature(last)===historySignature(point))return true;
 entries=[...entries,point].slice(-DECISION_HISTORY_LIMIT);
 next[snapshot.asset]=entries;
 try{
  storage.setItem(DECISION_HISTORY_KEY,JSON.stringify({
   version:1,assets:next}));
  return true;
 }catch{return false}
}

export function saveDecisionQualityAudit(archive,asset,{
 now=Date.now(),storage=safeStorage(),emit=true,audits=null
}={}){
 if(!storage||!validAsset(asset))return false;
 const opts={asset,complete:archive?.complete,
  publishedCount:archive?.publishedCount,now};
 const challenge=audits?.challenge||
  auditShadowChallengers(archive?.forecasts,opts);
 const regimes=audits?.regimes||
  auditShadowRegimes(archive?.forecasts,opts);
 const result=summarizeDecisionQuality({archive,asset,challenge,regimes,
  diagnostics:audits?.diagnostics,pairs:audits?.pairs,
  pairRegimes:audits?.pairRegimes,now});
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
 // A separate bounded local chronology is best-effort; current audit remains.
 rememberDecisionHistory(result,{storage,now});
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
   (native.published!==frame.published||
    count(native.recordedTerminal)&&
    native.recordedTerminal!==frame.recordedTerminal);
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
 const history=readDecisionHistory(asset,{storage,now});
 for(const [tf,label] of [['15m','M15'],['1h','H1'],['4h','H4']]){
  const frame=result.frames[tf],row=setText('div','',
   'overview-quality-frame');
  const title=setText('strong',label);
  const status=setText('span',frame.outOfDate?
   'Архив изменился · повторить аудит':titles[frame.state],
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
  if(!frame.outOfDate&&frame.diagnosis?.codes?.length){
   const explanation=document.createElement('details');
   explanation.className='overview-quality-diagnosis';
   explanation.append(setText('summary','Что могло повлиять?'));
   for(const code of frame.diagnosis.codes)
    explanation.append(setText('small',DIAGNOSTIC_LABELS[code]||code,
     'overview-quality-hint'));
   explanation.append(setText('small','Это факторы для проверки, '+
    'не доказанные причины.','overview-quality-hint'));
   row.append(explanation);
  }
  if(!frame.outOfDate&&frame.pairs?.length){
   const details=document.createElement('details');
   details.className='overview-quality-diagnosis';
   details.append(setText('summary','Комбинации признаков'));
   for(const item of frame.pairs){
    const label=FEATURE_PAIRS.find(x=>x.id===item.id)?.label||item.id;
    const desc=item.state==='REPEATED_ADDITION'?'прирост в 3 периодах':
     item.state==='OVERLAPPING'?'высокое сходство':
     item.state==='RECENT_SETBACK'?'хуже в свежем периоде':
     'нет устойчивого прироста';
    details.append(setText('small',label+' · '+desc+
     ' · ΔAUC свежего периода '+(item.latestGain>=0?'+':'')+
     item.latestGain.toFixed(3),'overview-quality-hint'));
   }
   row.append(details);
  }
  if(!frame.outOfDate&&frame.pairRegimes?.length){
   const section=setText('small','Проверка сочетаний по режимам: '+
    frame.pairRegimes.filter(x=>x.state==='REPEATED_TWO_MODES').length+
    ' из 3 пар повторились минимум в двух режимах (описательно)',
    'overview-quality-hint');
   row.append(section);
  }
  const trend=assessBaselineRankTrend(frame.baselineAuc);
  if(!frame.outOfDate&&trend.state==='DECLINING')
   row.append(setText('p','Внимание: AUC базовой формулы снизилась '+
    'на трёх непересекающихся проверочных периодах. '+
    'Это исследовательское наблюдение, не прогноз убытка.',
    'overview-quality-decline'));
  if(!frame.outOfDate&&trend.state==='RISING')
   row.append(setText('small','AUC выросла между периодами; '+
    'это ещё не доказательство обучения или прибыли.',
    'overview-quality-hint'));
  if(frame.regimeRepeatedModels>0&&!frame.outOfDate)
   row.append(setText('small','Повторяется также по режимам: '+
    frame.regimeRepeatedModels+' / 3 альтернатив','overview-quality-hint'));
  root.append(row);
 }
 if(history.length){
  const details=document.createElement('details');
  details.className='overview-quality-history';
  details.append(setText('summary','История ручных аудитов · '+
   history.length+' / 12'));
  for(const [tf,label] of [['15m','M15'],['1h','H1'],['4h','H4']]){
   const panel=setText('div','', 'overview-quality-history-row');
   panel.append(setText('strong',label+' · AUC последнего окна',
    'overview-quality-hint'));
   const plot=document.createElement('div');
   plot.className='overview-quality-history-bars';
   for(const point of history){
    const value=point.frames[tf].lateAuc;
    const bar=document.createElement('span');
    bar.className='overview-quality-history-bar';
    if(value===null)bar.classList.add('is-unavailable');
    bar.style.height=value===null?'4px':
     Math.max(6,Math.round(value*42))+'px';
    bar.title=new Date(point.auditedAt).toLocaleString('ru-RU')+
     (value===null?' · недостаточно данных':' · AUC '+value.toFixed(3));
    plot.append(bar);
   }
   panel.append(plot);details.append(panel);
  }
  details.append(setText('small','Только ручные полные проверки Room. '+
   'Между аудитами часть исходов повторяется; нельзя считать '+
   'изменение соседних столбцов независимым улучшением или ухудшением.',
   'overview-quality-hint'));
  root.append(details);
 }
 root.append(setText('small','AUC показывает различение TP3 и SL на '+
  'проверенных исходах. Это не вероятность прибыли, доказанная '+
  'точность или обученность ИИ. Веса действующей модели не менялись.',
  'overview-quality-hint'));
}
