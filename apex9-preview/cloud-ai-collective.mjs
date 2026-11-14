/** Two-explicit-tap APEX research: analyst -> independent critic.
 * The shared server budget prevents a free-tier burst. No timers, no trade calls.
 * A single bounded report is cached on this phone for the 5-minute pause.
 * Historical analyst claims are not evidence and are not assigned confidence.
 */
import {buildCloudAuditEvidence,checkCloudAiLanguageBudget,
 explainCloudAiAuditFailure} from './cloud-ai-manual-audit.mjs';
const KEY='apex.collective.research.v1';
const ASSET=/^[A-Z0-9]{5,20}$/;
const HOUR=60*60000;
const textOk=s=>typeof s==='string'&&s.trim().length>=15&&s.length<=2400;
const evidenceOk=e=>Array.isArray(e)&&e.length>=1&&e.length<=5&&
 e.every(x=>typeof x?.source_id==='string'&&x.source_id.length<=100&&
   Number.isSafeInteger(x?.observed_at)&&typeof x?.text==='string'&&x.text.length<=1500);
const sourceIds=e=>e.map(x=>x.source_id);
export function validateCollectiveSession(value,now=Date.now()){
 if(!value||value.version!==1||!ASSET.test(value.asset||'')||
  !Number.isSafeInteger(value.startedAt)||
  value.startedAt>now+120000||now-value.startedAt>HOUR||
  !evidenceOk(value.evidence)||!textOk(value.analystText)||
  !Array.isArray(value.sourceIds)||
  JSON.stringify(value.sourceIds)!==JSON.stringify(sourceIds(value.evidence))||
  !['ANALYST_READY','COMPLETE'].includes(value.stage))return null;
 const base={version:1,asset:value.asset,startedAt:value.startedAt,
  evidence:value.evidence,sourceIds:value.sourceIds,analystText:value.analystText,
  stage:value.stage};
 if(value.stage==='COMPLETE'){
  if(!textOk(value.criticText)||!Number.isSafeInteger(value.criticAt)||
    value.criticAt<value.startedAt||value.criticAt>now+120000||
    !evidenceOk(value.criticEvidence))return null;
  base.criticText=value.criticText;
  base.criticAt=value.criticAt;
  base.criticEvidence=value.criticEvidence;
 }
 return base;
}
export function mergeResearchEvidence(historical,recent){
 const used=new Set(),out=[];
 for(const row of [...historical,...recent]){
  if(!row||used.has(row.source_id))continue;
  used.add(row.source_id);out.push(row);
  if(out.length>=10)break;
 }
 return out;
}
/** Local session readiness, not permission to call the server. */
export function reviewSessionReadiness(session,selectionMatches,now=Date.now()){
 if(!session)return 'Нет текущей сессии GLM.';
 if(session.stage==='COMPLETE')return 'Оба ответа сохранены в текущей сессии.';
 if(!selectionMatches)return 'Выберите тот же состав активов, что и при исследовании GLM.';
 const left=55*60000-(now-session.startedAt);
 if(left<=0)return 'Сессия устарела. Нужна новая сессия GLM.';
 const mins=Math.ceil(left/60000);
 return 'Ответ GLM сохранён. До окончания сессии: '+mins+
  ' мин. Бюджет и общая пауза проверяются отдельно перед запросом Qwen.';
}
/** Audit coverage is NOT a forecast probability or agreement score. */
export function collectiveCoverage(session){
 if(!session)return 'Нет проверенного исследования';
 const n=new Set(session.evidence.map(x=>x.source_id.split(':').slice(0,2).join(':'))).size;
 return n===1?'Один тип источника: независимого подтверждения мало':
  n+' типов источников; выводы моделей ещё не доказательство точности';
}
const success=(r,role,evidence)=>r?.httpStatus===200&&
 r.state==='OBSERVED_MODEL_OUTPUT'&&r.role===role&&
 typeof r.text==='string'&&r.text.trim().length>=15&&
 Array.isArray(r.source_ids)&&
 JSON.stringify(r.source_ids)===JSON.stringify(sourceIds(evidence));
const getStore=()=>{
 try{return globalThis.localStorage||null;}catch{return null;}
};
export function initCloudAiCollective({getFavorites,getHistory,fetchTicker,
 getPairing,getBudget,runAudit,refreshMonitor,onSession=()=>{},
 store=getStore(),now=()=>Date.now()}){
 const node=id=>document.getElementById(id);
 const assetPicker=node('apex-ai-test-asset');
 const begin=node('apex-ai-collective-start'),review=node('apex-ai-collective-review');
 const status=node('apex-ai-collective-status'),coverage=node('apex-ai-collective-coverage');
 const readiness=node('apex-ai-collective-readiness');
 const analystOutput=node('apex-ai-collective-analyst-output');
 const criticOutput=node('apex-ai-collective-critic-output');
 let busy=false,session=null;
 try{const raw=store?.getItem(KEY);if(raw)session=validateCollectiveSession(JSON.parse(raw),now());}
 catch{session=null;}
 const say=s=>{status.textContent=s;};
 const save=()=>{
  try{if(session)store?.setItem(KEY,JSON.stringify(session));}catch{
   // WebView storage may be disabled: this still works for the current session.
  }
 };
 const sync=()=>{
  const current=assetPicker.value;
  const favorite=getFavorites();
  const enabled=Array.isArray(favorite)&&favorite.includes(current)&&ASSET.test(current);
  begin.disabled=busy||!enabled;
  const pending=session?.stage==='ANALYST_READY'&&session.asset===current&&
   now()-session.startedAt<55*60000;
  review.disabled=busy||!enabled||!pending;
  analystOutput.hidden=!session||session.asset!==current;
  criticOutput.hidden=!session||session.asset!==current||session.stage!=='COMPLETE';
  const analystText=!analystOutput.hidden?session.analystText:'';
  const criticText=!criticOutput.hidden?session.criticText:'';
  if(analystOutput.textContent!==analystText)analystOutput.textContent=analystText;
  if(criticOutput.textContent!==criticText)criticOutput.textContent=criticText;
  if(readiness){
   const value=reviewSessionReadiness(session,enabled&&session?.asset===current,now());
   if(readiness.textContent!==value)readiness.textContent=value;
  }
  coverage.textContent=session&&session.asset===current?collectiveCoverage(session):
   'Данные и выводы появятся после успешного ответа GLM';
  if(!busy&&session?.stage==='ANALYST_READY'&&session.asset===current)
   say(now()-session.startedAt>=55*60000?
    'Исследование устарело: начните новый анализ GLM.':
    'GLM готов. После общей паузы запустите независимую проверку Qwen вручную.');
  else if(!busy&&session?.stage==='COMPLETE'&&session.asset===current)
   say('Сверка завершена. Это исследование, не прогноз и не доказательство точности.');
  else if(!busy&&session&&session.asset!==current)
   say('Есть сохранённая сессия для '+session.asset+'. Выберите её в избранном.');
  else if(!busy)say('Начните с GLM; второе обращение к Qwen выполняется отдельно.');
  return enabled;
 };
 async function freshEvidence(asset){
  let rows=[];
  try{const h=await getHistory(asset,30);
   if(h?.native===true&&Array.isArray(h.observations))rows=h.observations;
  }catch{/* A fresh ticker may still be sufficient. */}
  const t=await fetchTicker(asset);
  return buildCloudAuditEvidence({asset,rows,ticker:t?.state==='OK'?t.data:null,now:now()});
 }
 const perform=async role=>{
  if(busy||!sync())return;
  const asset=assetPicker.value;
  if(role==='critic'&&(!session||session.stage!=='ANALYST_READY'||
   session.asset!==asset||now()-session.startedAt>=55*60000)){
   say('Нет актуального ответа GLM для проверки.');return;
  }
  busy=true;sync();say('Проверяем одобрение телефона и общий бюджет GLM/Qwen…');
  let succeeded=false,failure='';
  try{
   const pair=await getPairing();
   if(pair?.state!=='APPROVED')throw Error('Устройство не одобрено в Cloudflare.');
   const budget=await getBudget(),guard=checkCloudAiLanguageBudget(budget,now());
   if(!guard.allowed)throw Error(guard.message);
   say('Собираем подтверждённые данные '+asset+'…');
   const recent=await freshEvidence(asset);
   if(!recent.length)throw Error('Нет свежих рыночных данных. Вызов модели отменён.');
   const evidence=role==='critic'?
    mergeResearchEvidence(session.evidence,recent):recent;
   const options=role==='critic'?{analyst:{
    text:session.analystText,source_ids:session.sourceIds,
    captured_at:session.startedAt
   }}:{};
   say(role==='analyst'?'GLM анализирует источники…':
    'Qwen независимо проверяет прошлые выводы GLM и новые снимки…');
   const result=await runAudit(role,evidence,options);
   if(!success(result,role,evidence))
    throw Error(explainCloudAiAuditFailure(result,role));
   if(role==='analyst')session={
    version:1,asset,stage:'ANALYST_READY',startedAt:now(),
    evidence:evidence.slice(0,5),sourceIds:sourceIds(evidence.slice(0,5)),
    analystText:result.text.slice(0,2400)
   };
   else session={...session,stage:'COMPLETE',
    criticAt:now(),criticText:result.text.slice(0,2400),
    criticEvidence:recent.slice(0,5)};
   save();succeeded=true;
   try{onSession(session);}catch{/* Journal failure never changes the real AI outcome. */}
  }catch(error){failure=String(error?.message||error).slice(0,230);}
  finally{
   busy=false;
   // Preserve the exact budget or network error; previous successful sessions
   // must not turn a failed attempt into a success label.
   sync();
   if(succeeded)say(role==='analyst'?
    'GLM готов. Qwen можно запускать вручную после общей паузы в 5 минут.':
    'Qwen проверил GLM. Оба текста сохранены локально; точность не подтверждена.');
   else if(failure)say(failure);
   try{await refreshMonitor();}catch{}
  }
 };
 begin.addEventListener('click',()=>void perform('analyst'));
 review.addEventListener('click',()=>void perform('critic'));
 assetPicker.addEventListener('change',sync);
 sync();
 return {sync,getSession:()=>session};
}
