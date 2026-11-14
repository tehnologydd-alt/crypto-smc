/**
 * APEX AI Cloudflare monitor.
 * Health means HTTPS Worker reachable, NOT that a model executed.
 * D1 budget displays guarded attempts, NOT provider billing or Neurons.
 * Real model completions are counted only by Android native Keystore bridge.
 */
const known = (value) => Number.isSafeInteger(value) && value >= 0 ? value : null;
const shown = (value) => value === null ? '—' : String(value);
const names = Object.freeze({
 analyst: 'GLM-4.7-Flash', critic: 'Qwen3.8-27B'
});
const h = (s) => typeof s === 'string' ? s : '';
const failureLabels=Object.freeze({
 MODEL_RESPONSE_TIMEOUT:'истекло время ожидания ответа',
 MODEL_NETWORK_UNAVAILABLE:'ошибка сети',
 MODEL_COMPLETION_TOKEN_LIMIT:'лимит токенов ответа',
 EMPTY_MODEL_OUTPUT:'пустой ответ модели',
 MODEL_QUOTA_OR_UNAVAILABLE:'модель недоступна',
 CLOUD_UNAVAILABLE:'нет соединения с облаком'
});
const failureTitle=(value)=>failureLabels[value]||'ошибка';

/** Descriptive categories from observed native codes, never infer billing. */
export function classifyAiEvent(state,success=false){
 if(success===true&&state==='MODEL_OUTPUT')return 'response';
 if(['MODEL_RESPONSE_TIMEOUT','MODEL_NETWORK_UNAVAILABLE','CLOUD_UNAVAILABLE'].includes(state))return 'connection';
 if(['MODEL_COMPLETION_TOKEN_LIMIT','EMPTY_MODEL_OUTPUT','BATCH_COMPLETION_TRUNCATED','BATCH_REASONING_WITHOUT_FINAL','BATCH_EMPTY_MODEL_OUTPUT','BATCH_JSON_NOT_PARSEABLE','BATCH_MISSING_ASSET_RESULTS','BATCH_ASSET_MISMATCH','BATCH_INVALID_SUMMARY','BATCH_MISSING_SOURCE_IDS','BATCH_SOURCE_MISMATCH'].includes(state))return 'output';
 if(state==='MODEL_QUOTA_OR_UNAVAILABLE')return 'provider';
 return 'unknown';
}
export function recentAiDiagnostics(local){
 if(local?.state!=='LOCAL_AUDIT'||!Array.isArray(local.events))return null;
 const out={total:0,response:0,connection:0,output:0,provider:0,unknown:0};
 for(const e of local.events.slice(0,8)){
  if(!e||!['analyst','critic'].includes(e.role)||typeof e.state!=='string'||known(e.at)===null)continue;
  out.total++;out[classifyAiEvent(e.state,e.success)]++;
 }
 return out;
}

export function renderTime(ms,{allowFuture=false}={}) {
 const t = known(ms);
 if (!t || t < 1_500_000_000_000 ||
   t > Date.now()+(allowFuture?48*3600_000:120_000)) return '—';
 return new Date(t).toLocaleString('ru-RU', {
  day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'
 });
}

function modelState(raw) {
 if (!raw || typeof raw !== 'object') return {
  title:'Нет данных Android',count:null,lastSuccessAt:null,lastAt:null,lastOk:null
 };
 const count = known(raw.successCount);
 const lastAt = known(raw.lastAt);
 const lastSuccessAt = known(raw.lastSuccessAt);
 const lastOk = raw.lastOk === true;
 return {
  title:!lastAt?'Нет подтверждённых ответов':
   (lastOk?'Последний запрос успешен':
    'Последний запрос: '+failureTitle(h(raw.lastState))),
  count,lastSuccessAt,lastAt,lastOk,lastState:h(raw.lastState).slice(0,48)
 };
}

export function deriveCloudAiView(data = {}) {
 const health = data.health || {};
 const pair = data.pair || {};
 const budget = data.budget || {};
 const local = data.local || {};
 const online = health.state === 'RUNNING' && health.httpStatus === 200;
 const deviceState = h(pair.state);
 const approved = deviceState === 'APPROVED';
 const pending = deviceState === 'PENDING_APPROVAL';
 const budgetVerified = approved && budget.state === 'POLICY_ACTIVE' &&
   budget.httpStatus === 200;
 const quota = budgetVerified ? budget.usage?.language : null;
 const count = known(quota?.dailyUsed);
 const cap = known(quota?.dailyLimit);
 const monthUsed = known(quota?.monthlyUsed);
 const monthCap = known(quota?.monthlyLimit);
 const nightUsed = known(quota?.nightUsed);
 const nightCap = known(quota?.nightLimit);
 const mode = budgetVerified ? h(budget.clock?.mode) :
  online ? h(health.mode) : '';
 const access = deviceState === 'APPROVED'?'Подтверждён':
  pending?'Ждёт подтверждения':
  deviceState === 'NOT_PAIRED'?'Не привязан':
  deviceState === 'REVOKED'?'Доступ отозван':
  deviceState === 'ANDROID_UPDATE_REQUIRED'?'Нужна новая APK':
  'Нет данных';
 const status = !online ? 'offline' :
   (approved && budgetVerified) ? 'ok' : 'pending';
 const statusLabel = !online ? 'Нет связи' :
  approved && budgetVerified ? 'Подключён' :
  pending ? 'Ожидает одобрения' :
  approved ? 'Лимиты не проверены' :
  deviceState === 'REVOKED' ? 'Доступ отозван' : 'Не привязан';
 const modeLabel = mode === 'ACTIVE' ? 'День' :
  mode === 'ECO' ? 'ЭКО · ночь' : '—';
 const daily = budgetVerified && count !== null && cap !== null ?
   String(count)+' / '+String(cap) : '—';
 const next = known(quota?.nextEligibleAt);
 const nextEligibleAt = budgetVerified && next ? next : null;
 const eventItems = local.state === 'LOCAL_AUDIT' && Array.isArray(local.events)
  ? local.events.slice(0,8).filter(x=>x && ['analyst','critic'].includes(x.role) &&
    typeof x.state === 'string' && known(x.at) !== null).map(x=>({
     at:x.at, role:x.role, success:x.success === true,
     // Only fixed UI text from a bounded known result code.
     title:names[x.role]+' · '+(x.success === true?
      'получен ответ':failureTitle(h(x.state))+' · без ответа')
    })) : [];
 return {
  status,statusLabel,server:online?'Доступен':'Нет ответа',
  access,approved,pending,deviceState,
  mode:modeLabel,daily,
  quotas:{
   verified:budgetVerified,
   count,cap,monthUsed,monthCap,nightUsed,nightCap,
   nextEligibleAt,
   estimatedNeurons:budgetVerified?known(quota?.neuronEstimateReserved):null,
   estimatedCap:budgetVerified?known(quota?.neuronEstimateCeiling):null
  },
  checkedAt:online?known(health.checkedAt):null,
  lastHealthyAt:known(health.lastHealthyAt),
  verificationCode:pending?h(pair.verificationCode).slice(0,12):'',
  fingerprint:pending?h(pair.fingerprint).slice(0,18):'',
  analyst:modelState(local.state==='LOCAL_AUDIT'?local.analyst:null),
  critic:modelState(local.state==='LOCAL_AUDIT'?local.critic:null),
  events:eventItems,
  diagnostics:recentAiDiagnostics(local),
  localKnown:local.state==='LOCAL_AUDIT',
  note:budgetVerified?
   'Это внутренние лимиты попыток D1, не баланс Neurons и не счёт Cloudflare. Модели подтверждаются только реальными ответами.' :
   'Лимиты ИИ станут видны после одобрения устройства и успешной подписанной проверки D1.'
 };
}

/** Unknown, zero capacity and confirmed empty usage are distinct. */
export function quotaMeter(used,limit,verified=true){
 const count=known(used),cap=known(limit);
 if(!verified||count===null||cap===null)return {label:'—',percent:null,state:'unknown'};
 const label=count+' / '+cap;
 if(cap===0)return {label,percent:null,state:'closed'};
 const percent=Math.round(100*Math.min(1,count/cap));
 return {label,percent,state:count>=cap?'full':count/cap>=.8?'near':'ok'};
}

function text(id, value) {
 const node=document.getElementById(id),next=String(value);
 if(node&&node.textContent!==next)node.textContent=next;
}
function renderMeter(id,view){
 const bar=document.getElementById(id),fill=document.getElementById(id+'-fill');
 if(bar){
  bar.dataset.state=view.state;
  if(view.percent===null)bar.removeAttribute('aria-valuenow');
  else bar.setAttribute('aria-valuenow',String(view.percent));
  bar.setAttribute('aria-valuetext',view.state==='unknown'?'Нет подтверждённых данных':
   view.state==='closed'?'Лимит равен нулю':view.label+' ('+view.percent+'%)');
 }
 if(fill&&fill.style.width!==(view.percent??0)+'%')fill.style.width=(view.percent??0)+'%';
}
function setStatus(el, value) {
 const node=document.getElementById(el);
 if(node)node.dataset.status=value;
}
function putTime(id, ms) {text(id,renderTime(ms));}

export function initCloudAiMonitor({
 health, pairing, enroll, budget, activity, intervalMs=90000
}) {
 const refreshButton=document.getElementById('apex-ai-live-refresh');
 const enrollButton=document.getElementById('apex-ai-enroll');
 const checkButton=document.getElementById('apex-ai-check');
 const statusBox=document.getElementById('apex-ai-pair-status');
 let latestAt=0,work=null,lastLocal=null,lastEventsSignature='',lastHealthyAt=null;
 const busy=(value)=>{
  for(const node of [refreshButton,enrollButton,checkButton])if(node)node.disabled=value;
 };

 function render(data) {
  const v=deriveCloudAiView(data);
  setStatus('apex-ai-live-dot',v.status);
  setStatus('apex-ai-live-state',v.status);
  text('apex-ai-live-state',v.statusLabel);
  text('apex-ai-live-server',v.server);
  text('apex-ai-live-device',v.access);
  text('apex-ai-live-mode',v.mode);
  text('apex-ai-live-usage',v.daily);
  setStatus('apex-ai-page-dot',v.status);
  setStatus('apex-ai-page-state',v.status);
  text('apex-ai-page-state',v.statusLabel);
  text('apex-ai-page-server',v.server);
  text('apex-ai-page-device',v.access);
  text('apex-ai-page-mode',v.mode);
  text('apex-ai-page-usage',v.daily);
  text('apex-ai-live-checked',v.checkedAt?
   'Проверено: '+renderTime(v.checkedAt):
   'Последняя связь: '+renderTime(v.lastHealthyAt));
  putTime('apex-ai-health-checked',v.checkedAt||v.lastHealthyAt);
  const q=v.quotas;
  for(const [suffix,id,used,limit] of [
   ['daily','apex-ai-meter',q.count,q.cap],
   ['monthly','apex-ai-meter-month',q.monthUsed,q.monthCap],
   ['night','apex-ai-meter-night',q.nightUsed,q.nightCap],
   ['neurons','apex-ai-meter-neurons',q.estimatedNeurons,q.estimatedCap]
  ]){
   const view=quotaMeter(used,limit,q.verified);
   text('apex-ai-quota-'+suffix,view.label);
   renderMeter(id,view);
  }
  text('apex-ai-next-eligible',v.quotas.verified?
   (v.quotas.nextEligibleAt &&
    v.quotas.nextEligibleAt > Date.now()?
     renderTime(v.quotas.nextEligibleAt,{allowFuture:true}):
     'Пауза истекла · проверьте остальные лимиты'):'—');
  for(const [role,prefix] of [['analyst','glm'],['critic','qwen']]){
   const model=v[role];
   // Date must belong to the last attempt, not an older successful run.
   text('apex-ai-'+prefix+'-status',model.title+
    (model.lastAt?' · '+renderTime(model.lastAt):''));
   text('apex-ai-'+prefix+'-count','Ответов на этом телефоне: '+shown(model.count));
  }
  text('apex-ai-limit-note',v.note);
  text('apex-ai-neurons-estimate',
   v.quotas.estimatedNeurons!==null&&v.quotas.estimatedCap>0?
    'APEX · оценочно зарезервировано '+v.quotas.estimatedNeurons+
    ' / '+v.quotas.estimatedCap+' Neurons за сутки UTC. Не фактический остаток Cloudflare.':
    'Neurons: оценка пока недоступна. Действуют ограничения попыток.');
  if(statusBox){
   let detail='';
   if(v.pending)detail='Для подтверждения сверим код '+(v.verificationCode||'—')+
    ' и отпечаток '+(v.fingerprint||'—')+' с записью Cloudflare D1.';
   else if(v.approved)detail=v.quotas.verified?
    'Устройство одобрено. Лимиты D1 проверены; запросы к ИИ автоматически не отправляются.':
    'Устройство одобрено, но подписанная проверка лимитов не прошла. Проверьте сеть и время.';
   else if(v.deviceState==='NOT_PAIRED')
    detail='Телефон пока не привязан. Нажмите «Привязать это устройство».';
   else if(v.deviceState==='REVOKED')
    detail='Доступ этого телефона отозван.';
   else if(v.deviceState==='ANDROID_UPDATE_REQUIRED')
    detail='Эта версия APEX не поддерживает монитор подключения.';
   else detail='Статус привязки не получен. Проверьте соединение.';
   statusBox.textContent='Cloudflare: '+v.server+' · '+detail;
  }
  const d=v.diagnostics;
  text('apex-ai-recent-diagnostics',d?
   'Последние события: '+d.total+' / 8 · ответы: '+d.response+
   ' · связь/ожидание: '+d.connection+' · формат/содержимое: '+d.output+
   ' · поставщик/квота: '+d.provider+' · не классифицировано: '+d.unknown:
   'Нет доступного журнала Android.');
  const ul=document.getElementById('apex-ai-events');
  const signature=JSON.stringify([v.localKnown,v.events]);
  if(ul&&signature!==lastEventsSignature){
   lastEventsSignature=signature;
   ul.replaceChildren();
   if(v.events.length===0){
    const li=document.createElement('li');
    li.textContent=v.localKnown?'Реальных запросов к ИИ с телефона пока не было.':
      'Нет данных о запросах с этого телефона.';
    ul.append(li);
   } else for(const event of v.events){
    const li=document.createElement('li'),span=document.createElement('span'),
      time=document.createElement('time');
    span.textContent=event.title;
    time.textContent=renderTime(event.at);
    li.append(span,time);
    ul.append(li);
   }
  }
 }

 async function refresh({enrollDevice=false,afterCurrent=false}={}) {
  if(work){
   if(!enrollDevice&&!afterCurrent)return work;
   try{await work;}catch{}
   if(work)return refresh({enrollDevice,afterCurrent});
  }
  const task=(async()=>{
   busy(true);
   text('apex-ai-live-checked','Проверяем Cloudflare…');
   try{
    const safe=fn=>Promise.resolve().then(fn).catch(()=>null);
    const [h,p,l]=await Promise.all([
     safe(health),safe(enrollDevice?enroll:pairing),safe(activity)
    ]);
    if(l?.state==='LOCAL_AUDIT')lastLocal=l;
    const b=p?.state==='APPROVED'?await safe(budget):null;
    const confirmed=h?.state==='RUNNING'&&h?.httpStatus===200;
    if(confirmed)lastHealthyAt=known(h.checkedAt)||Date.now();
    else if(known(h?.lastHealthyAt))lastHealthyAt=Math.max(lastHealthyAt||0,h.lastHealthyAt);
    const data={health:{...h,lastHealthyAt},pair:p,local:l?.state==='LOCAL_AUDIT'?l:lastLocal,budget:b};
    render(data);
    latestAt=Date.now();
    return deriveCloudAiView(data);
   }catch{
    render({health:{state:'CLOUD_UNAVAILABLE',lastHealthyAt},pair:{state:'CLOUD_UNAVAILABLE'},local:lastLocal});
    latestAt=Date.now();
    return deriveCloudAiView({});
   }finally{busy(false);}
  })();
  work=task;
  try{return await task;}finally{if(work===task)work=null;}
 }
 function refreshIfDue(){
  if(document.hidden)return;
  if(!['overview','ai'].includes(document.body?.dataset?.view))return;
  if(Date.now()-latestAt>=intervalMs)void refresh();
 }
 refreshButton?.addEventListener('click',()=>void refresh());
 checkButton?.addEventListener('click',()=>void refresh());
 enrollButton?.addEventListener('click',()=>void refresh({enrollDevice:true}));
 const jump=event=>{
  const button=event.target?.closest?.('[data-ai-jump]');
  if(!button||!document.getElementById('view-ai')?.contains(button))return;
  const target=document.getElementById(button.dataset.aiJump);
  if(!target)return;
  if(target.tagName==='DETAILS')target.open=true;
  target.scrollIntoView({block:'start',behavior:'auto'});
 };
 document.addEventListener('click',jump);
 document.addEventListener('visibilitychange',refreshIfDue);
 const timer=setInterval(refreshIfDue,intervalMs);
 void refresh();
 return {refresh,destroy(){clearInterval(timer);
  document.removeEventListener('click',jump);
  document.removeEventListener('visibilitychange',refreshIfDue);}};
}
