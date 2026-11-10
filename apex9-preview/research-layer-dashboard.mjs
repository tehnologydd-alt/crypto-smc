/**
 * Four honest optional research layers on the Sources screen. Read-only.
 * A module existing in code is never evidence of a successful provider GET.
 * No background refresh, no orders, no account access, no wallet identity tags.
 */
import {fetchLinearDerivatives,fetchPublicWallet,publicWalletNetwork,
 summarizePublicDiscussion} from './research-layer-core.mjs';
import {createResearchLayerBudget} from './research-layer-budget.mjs';
const get=id=>document.getElementById(id);
const fmt=(n,d=3)=>Number.isFinite(n)?
 new Intl.NumberFormat('ru-RU',{maximumFractionDigits:d}).format(n):'—';
const when=t=>Number.isSafeInteger(t)&&t>0?
 new Date(t).toLocaleString('ru-RU',{day:'2-digit',month:'2-digit',
 hour:'2-digit',minute:'2-digit'}):'неизвестно';
const labels={
 OK:'OK',EMPTY:'ПУСТО',PARTIAL:'ЧАСТИЧНО',STALE:'АРХИВ',
 NOT_CHECKED:'НЕ ПРОВЕРЕНО',NOT_CONFIGURED:'НЕ НАСТРОЕНО',
 UNSUPPORTED:'НЕТ ДАННЫХ',INVALID:'ОШИБКА ДАННЫХ',
 RATE_LIMITED:'ЛИМИТ API',ACCESS_DENIED:'НЕТ ДОСТУПА',
 OFFLINE:'НЕТ СОЕДИНЕНИЯ',NOT_FOUND:'АДРЕС НЕ НАЙДЕН',
 DAILY_LIMIT:'ЛИМИТ',WAIT_INTERVAL:'ПАУЗА',
 STORAGE_UNAVAILABLE:'ОШИБКА ХРАНЕНИЯ',UNAVAILABLE:'НЕДОСТУПНО'
};
const readable=r=>r?.state==='STALE'?'Сохранённый архив. '+(r?.reason||'Проверка недоступна'):
 r?.reason||r?.error||'Источник не проверен';
export function initResearchLayersDashboard({getSymbol,storage,
 checkSocial,checkMacro}={}){
 const budget=createResearchLayerBudget({storage});
 let symbol=getSymbol?.()||'BTCUSDT',derivRequest=0,walletRequest=0;
 const KEY='apex9:public-wallet-watch:v1';
 function value(row,state,description){
  const label=get('research-'+row+'-state');
  const detail=get('research-'+row+'-detail');
  if(!label||!detail)return;
  label.textContent=labels[state]||String(state||'НЕ ПРОВЕРЕНО');
  label.className='research-layer-state'+
   (state==='OK'?' is-ok':state==='NOT_CHECKED'||state==='NOT_CONFIGURED'?
    ' is-neutral':' is-other');
  detail.textContent=description;
 }
 function clear(row){get('research-'+row+'-metrics')?.replaceChildren();}
 function line(row,label,message){
  const outer=get('research-'+row+'-metrics');
  if(!outer)return;
  const d=document.createElement('div');d.className='research-layer-metric';
  const k=document.createElement('span');k.textContent=label;
  const v=document.createElement('strong');v.textContent=message;
  d.append(k,v);outer.append(d);
 }
 function updateQuota(row,result){
  const q=result?.quota;
  if(q)line(row,'Локальные запросы',q.used+'/'+q.limit+
   ' сегодня'+(q.nextAt>Date.now()?' · следующий '+when(q.nextAt):''));
 }
 function statusDetails(row,r){
  clear(row);
  value(row,r?.state||'OFFLINE',readable(r));updateQuota(row,r);
 }
 function open(requested){
  if(typeof requested!=='string')return;
  if(requested!==symbol){
   symbol=requested;derivRequest++;
   clear('derivatives');
   value('derivatives','NOT_CHECKED','Запрос линейного рынка только по кнопке. Ликвидации не подключены.');
   clear('social');
   value('social','NOT_CHECKED','Выберите проверку публичных обсуждений этого актива.');
  }
 }
 async function derivatives(){
  const forSymbol=getSymbol?.()||symbol;
  open(forSymbol);
  const id=++derivRequest;
  value('derivatives','NOT_CHECKED','Получаем публичный срез открытого интереса и финансирования…');
  const r=await budget.load('derivatives',forSymbol,
   ()=>fetchLinearDerivatives(forSymbol));
  if(id!==derivRequest||forSymbol!==getSymbol?.())return;
  if(!['OK','STALE'].includes(r.state)||!r.data){
   statusDetails('derivatives',r);return;
  }
  clear('derivatives');
  value('derivatives',r.state,'Bybit · линейные USDT-контракты · '+
   (r.cache==='FRESH'?'кеш':r.state==='STALE'?'архив':'ответ API')+
   ' · источник '+when(r.data.observedAt));
  line('derivatives','Открытый интерес',fmt(r.data.openInterestUnits,6)+
   ' единиц базового актива');
  line('derivatives','Оценка открытого интереса',fmt(r.data.openInterestUsd,0)+' USD');
  line('derivatives','Ставка финансирования',fmt(r.data.fundingRatePercent,5)+'%');
  line('derivatives','События ликвидаций','Нет проверенного потока · не показываются');
  updateQuota('derivatives',r);
 }
 function savedAddress(){
  try{
   const a=storage?.getItem(KEY)||'';
   return publicWalletNetwork(a)?a:'';
  }catch{return '';}
 }
 const input=get('research-wallet-address');
 if(input)input.value=savedAddress();
 if(input?.value)
  value('wallet','NOT_CHECKED','Адрес сохранён только на устройстве · проверка по кнопке.');
 async function wallet(){
  const address=(input?.value||'').trim();
  const network=publicWalletNetwork(address);
  if(!network){
   clear('wallet');
   value('wallet','INVALID','Укажите публичный адрес BTC или Ethereum. Ключи, seed-фразы и личные данные не вводите.');
   return;
  }
  const id=++walletRequest;
  try{storage?.setItem(KEY,address)}catch{
   value('wallet','STORAGE_UNAVAILABLE','Невозможно безопасно хранить адрес и учёт запросов.');
   return;
  }
  value('wallet','NOT_CHECKED','Проверяем публичный баланс по выбранному адресу…');
  const r=await budget.load('wallet',network+':'+address.toLowerCase(),
   ()=>fetchPublicWallet(address));
  if(id!==walletRequest)return;
  if(!['OK','STALE'].includes(r.state)||!r.data){
   statusDetails('wallet',r);return;
  }
  clear('wallet');
  value('wallet',r.state,r.data.provider+' · '+
   (r.cache==='FRESH'?'кеш':r.state==='STALE'?'архив':'ответ API')+
   ' · проверено '+when(r.data.receivedAt));
  line('wallet','Публичный адрес',address.slice(0,8)+'…'+address.slice(-6));
  line('wallet','Сеть',network==='bitcoin'?'Bitcoin':'Ethereum');
  line('wallet','Подтверждённый нативный баланс',
   fmt(r.data.confirmedNativeBalance,8)+' '+r.data.nativeUnit);
  line('wallet','Владелец и статус крупного кошелька',
   'Не подтверждены. Метки владельцев не придумываем');
  updateQuota('wallet',r);
 }
 function clearWallet(){
  walletRequest++;
  const address=(input?.value||'').trim();
  try{
   storage?.removeItem(KEY);
   const net=publicWalletNetwork(address);
   if(net)budget.clear('wallet',net+':'+address.toLowerCase());
  }catch{}
  if(input)input.value='';
  clear('wallet');
  value('wallet','NOT_CONFIGURED','Введите публичный адрес, чтобы начать наблюдение. Ничего не запрашивается автоматически.');
 }
 function socialResult(asset,r){
  if(asset!==getSymbol?.())return;
  symbol=asset;
  const summary=summarizePublicDiscussion(r);
  if(!['OK','EMPTY','STALE'].includes(summary.state)){
   statusDetails('social',{...r,state:summary.state});return;
  }
  clear('social');
  value('social',summary.state,'Bluesky · '+summary.posts+
   ' публичных сообщений за последние сутки'+
   (r.source==='CACHE'?' · кеш':r.state==='STALE'?' · архив':' · ответ источника'));
  line('social','Слова роста / оптимизма',String(summary.keywordUp));
  line('social','Слова падения / пессимизма',String(summary.keywordDown));
  line('social','Смешанные и прочие сообщения',String(summary.ambiguous));
  line('social','Достоверность общего настроения',
   'Не установлена · 6 сообщений не представляют весь рынок');
  if(r?.quota)line('social','Локальные запросы',r.quota.used+'/'+r.quota.limit+' сегодня');
 }
 function macroResult(r){
  const list=[['Публикации СМИ',r?.news],['Показатели BLS',r?.indicators],
   ['Календарь BLS',r?.calendar]];
  const workable=list.filter(([,v])=>v?.state==='OK'||v?.state==='EMPTY');
  const archives=list.filter(([,v])=>v?.state==='STALE');
  const state=workable.length===3?'OK':workable.length||archives.length?'PARTIAL':
   'OFFLINE';
  clear('macro');
  value('macro',state,'Проверено '+workable.length+'/3 ответов источников.'+
   (archives.length?' Есть архивные данные.':'')+
   ' BLS — США; даты календаря не означают публикацию значений.');
  for(const [name,v] of list){
   line('macro',name,(labels[v?.state]||v?.state||'НЕ ПРОВЕРЕНО')+
    (v?.state==='OK'&&name==='Показатели BLS'?
     ' · рядов '+(v.indicators?.length||0):
     v?.state==='OK'&&name==='Календарь BLS'?
      ' · событий '+(v.events?.length||0):
      '')+(v?.reason?' · '+String(v.reason).slice(0,90):''));
  }
 }
 get('research-derivatives-check')?.addEventListener('click',()=>void derivatives());
 get('research-wallet-check')?.addEventListener('click',()=>void wallet());
 get('research-wallet-clear')?.addEventListener('click',clearWallet);
 get('research-social-check')?.addEventListener('click',()=>void checkSocial?.(getSymbol?.()));
 get('research-macro-check')?.addEventListener('click',()=>void checkMacro?.());
 return {open,setSocial:socialResult,setMacro:macroResult,
  checkDerivatives:derivatives,status:mode=>budget.status(mode)};
}
