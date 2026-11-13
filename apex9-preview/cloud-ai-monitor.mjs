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
   nextEligibleAt
  },
  checkedAt:online?known(health.checkedAt):null,
  lastHealthyAt:known(health.lastHealthyAt),
  verificationCode:pending?h(pair.verificationCode).slice(0,12):'',
  fingerprint:pending?h(pair.fingerprint).slice(0,18):'',
  analyst:modelState(local.state==='LOCAL_AUDIT'?local.analyst:null),
  critic:modelState(local.state==='LOCAL_AUDIT'?local.critic:null),
  events:eventItems,
  localKnown:local.state==='LOCAL_AUDIT',
  note:budgetVerified?
   'Это внутренние лимиты попыток D1, не баланс Neurons и не счёт Cloudflare. Модели подтверждаются только реальными ответами.' :
   'Лимиты ИИ станут видны после одобрения устройства и успешной подписанной проверки D1.'
 };
}

function text(id, value) {
 const node=document.getElementById(id);
 if(node)node.textContent=String(value);
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
 const detailsButton=document.getElementById('apex-ai-live-details');
 const statusBox=document.getElementById('apex-ai-pair-status');
 let latestAt=0,work=null;
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
  text('apex-ai-live-checked',v.checkedAt?
   'Проверено: '+renderTime(v.checkedAt):
   'Последняя связь: '+renderTime(v.lastHealthyAt));
  putTime('apex-ai-health-checked',v.checkedAt||v.lastHealthyAt);
  text('apex-ai-quota-daily',v.quotas.verified?v.daily:'—');
  text('apex-ai-quota-monthly',v.quotas.verified?
   shown(v.quotas.monthUsed)+' / '+shown(v.quotas.monthCap):'—');
  text('apex-ai-quota-night',v.quotas.verified?
   shown(v.quotas.nightUsed)+' / '+shown(v.quotas.nightCap):'—');
  text('apex-ai-next-eligible',v.quotas.verified?
   (v.quotas.nextEligibleAt &&
    v.quotas.nextEligibleAt > Date.now()?
     renderTime(v.quotas.nextEligibleAt,{allowFuture:true}):
     'Пауза истекла · проверьте остальные лимиты'):'—');
  const bar=document.getElementById('apex-ai-meter');
  const fill=document.getElementById('apex-ai-meter-fill');
  const percent=v.quotas.verified && v.quotas.cap>0 && v.quotas.count!==null?
   Math.round(100*Math.min(1,v.quotas.count/v.quotas.cap)):0;
  if(bar)bar.setAttribute('aria-valuenow',String(percent));
  if(fill)fill.style.width=percent+'%';
  for(const [role,prefix] of [['analyst','glm'],['critic','qwen']]){
   const model=v[role];
   // Date must belong to the last attempt, not an older successful run.
   text('apex-ai-'+prefix+'-status',model.title+
    (model.lastAt?' · '+renderTime(model.lastAt):''));
   text('apex-ai-'+prefix+'-count','Ответов на этом телефоне: '+shown(model.count));
  }
  text('apex-ai-limit-note',v.note);
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
  const ul=document.getElementById('apex-ai-events');
  if(ul){
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

 async function refresh({enrollDevice=false}={}) {
  if(work){
   if(!enrollDevice)return work;
   await work;
  }
  const task=(async()=>{
   busy(true);
   text('apex-ai-live-checked','Проверяем Cloudflare…');
   try{
    const [h,p,l]=await Promise.all([
     Promise.resolve().then(health),
     Promise.resolve().then(enrollDevice?enroll:pairing),
     Promise.resolve().then(activity)
    ]);
    const b=p?.state==='APPROVED'?await budget():null;
    const data={health:h,pair:p,local:l,budget:b};
    render(data);
    latestAt=Date.now();
    return deriveCloudAiView(data);
   }catch{
    render({health:{state:'CLOUD_UNAVAILABLE'},pair:{state:'CLOUD_UNAVAILABLE'}});
    latestAt=Date.now();
    return deriveCloudAiView({});
   }finally{busy(false);}
  })();
  work=task;
  try{return await task;}finally{if(work===task)work=null;}
 }
 function refreshIfDue(){
  if(document.hidden)return;
  if(document.body?.dataset?.view!=='overview')return;
  if(Date.now()-latestAt>=intervalMs)void refresh();
 }
 refreshButton?.addEventListener('click',()=>void refresh());
 checkButton?.addEventListener('click',()=>void refresh());
 enrollButton?.addEventListener('click',()=>void refresh({enrollDevice:true}));
 detailsButton?.addEventListener('click',()=>{
  const dialog=document.getElementById('apex-settings-dialog');
  if(typeof dialog?.showModal==='function'&&!dialog.open)dialog.showModal();
  else if(dialog&&!dialog.open)dialog.setAttribute('open','');
  document.getElementById('apex-ai-settings-anchor')?.scrollIntoView({block:'start'});
  void refresh();
 });
 document.addEventListener('visibilitychange',refreshIfDue);
 const timer=setInterval(refreshIfDue,intervalMs);
 void refresh();
 return {refresh,destroy(){clearInterval(timer);
  document.removeEventListener('visibilitychange',refreshIfDue);}};
}
