/**
 * APEX AI one-shot model check. The only submission route is an explicit
 * tap on Android; source-verified spot observations, no orders or forecasts.
 */
const ASSET=/^[A-Z0-9]{5,20}$/;
const DEPTH=/^(binance|okx|bybit):spot:depth$/;
const ageOk=(t,now)=>Number.isSafeInteger(t)&&t>0&&now>=t&&now-t<=180000;
const positive=(v)=>typeof v==='number'&&Number.isFinite(v)&&v>0;
const finite=(v)=>typeof v==='number'&&Number.isFinite(v);
const snapshotText=(asset,source,t,payload)=>{
 const when=new Date(t).toISOString();
 if(source==='binance:spot:24h'){
  if(!positive(payload.price)||!finite(payload.changePercent24h)||
   !finite(payload.quoteVolume)||payload.quoteVolume<0)return null;
  return 'Asset '+asset+'; source Binance public spot 24h ticker; observed '+when+
   '; last price '+payload.price+' USDT; last 24h change '+
   payload.changePercent24h+'%; last 24h quote volume '+
   payload.quoteVolume+' USDT. This is past-market context, not a prediction.';
 }
 if(DEPTH.test(source)){
  if(!positive(payload.bestBid)||!positive(payload.bestAsk)||
   payload.bestBid>payload.bestAsk||!finite(payload.spreadBps)||
   payload.spreadBps<0||!finite(payload.visibleDepthImbalance)||
   Math.abs(payload.visibleDepthImbalance)>1)return null;
  return 'Asset '+asset+'; source '+source+' public visible spot order book; observed '+
   when+'; best bid '+payload.bestBid+'; best ask '+payload.bestAsk+
   '; spread '+payload.spreadBps+' bps; visible depth imbalance '+
   payload.visibleDepthImbalance+
   '. Visible levels are partial and can change rapidly; no inferred whale intent.';
 }
 return null;
};
/** Never forward arbitrary archived JSON (news text, wallet identifiers, keys). */
export function buildCloudAuditEvidence({asset,rows=[],ticker=null,now=Date.now()}={}){
 if(typeof asset!=='string'||!ASSET.test(asset)||!Number.isSafeInteger(now))return [];
 const out=[],seen=new Set();
 const add=(source,t,payload)=>{
  if(!ageOk(t,now)||seen.has(source))return;
  const txt=snapshotText(asset,source,t,payload);
  if(!txt||txt.length>1500)return;
  seen.add(source);
  out.push({source_id:source+':'+asset+':'+t,observed_at:t,text:txt});
 };
 if(ticker?.symbol===asset&&ticker.scope==='24H_SPOT_SNAPSHOT'&&
    Number.isSafeInteger(ticker.receivedAt)&&
    ticker.receivedAt>=ticker.observedAt&&ticker.receivedAt<=now+60000)
  add('binance:spot:24h',ticker.observedAt,{
   price:ticker.price,changePercent24h:ticker.changePercent,
   quoteVolume:ticker.quoteVolume
  });
 if(Array.isArray(rows))for(const row of [...rows].sort(
  (a,b)=>(b?.observedAt||0)-(a?.observedAt||0))){
  if(out.length>=5)break;
  if(!row||row.asset!==asset||row.sourceState!=='OK'||
     !Number.isSafeInteger(row.collectedAt)||row.collectedAt>now+60000||
     row.collectedAt<row.observedAt)continue;
  if(!((row.source==='binance:spot:24h'&&row.kind==='market')||
    (DEPTH.test(row.source)&&row.kind==='liquidity')))continue;
  try{add(row.source,row.observedAt,JSON.parse(row.payload));}
  catch{/* Damaged local data cannot become research evidence. */}
 }
 return out.slice(0,5);
}
const labels={analyst:'GLM-4.7-Flash',critic:'Qwen3.8-27B'};
/** No polling, and no model traffic until the person taps a model button. */
export function initCloudAiAudit({getFavorites,getSelectedAsset,getHistory,
 fetchTicker,getPairing,getBudget,runAudit,refreshMonitor}){
 const select=document.getElementById('apex-ai-test-asset');
 const status=document.getElementById('apex-ai-test-status');
 const result=document.getElementById('apex-ai-test-output');
 const buttons={
  analyst:document.getElementById('apex-ai-test-analyst'),
  critic:document.getElementById('apex-ai-test-critic')
 };
 let busy=false,previousFavoriteSignature=null;
 const say=message=>{status.textContent=message;};
 const sync=()=>{
  // Android favorites arrive asynchronously and can change while Settings is open.
  // Never offer a catalogue-only symbol or issue a model request on refresh.
  const raw=getFavorites();
  const favorites=(Array.isArray(raw)?raw:[])
   .filter(s=>typeof s==='string'&&ASSET.test(s)).slice(0,10);
  const signature=favorites.join(',');
  const previous=select.value;
  const active=getSelectedAsset();
  const preferred=favorites.includes(previous)?previous:
   favorites.includes(active)?active:favorites[0]||'';
  select.replaceChildren();
  if(favorites.length===0){
   const empty=document.createElement('option');
   empty.value='';empty.textContent='Нет избранных активов';
   select.append(empty);
  }else for(const symbol of favorites){
   const option=document.createElement('option');
   option.value=symbol;option.textContent=symbol;select.append(option);
  }
  select.value=preferred;
  for(const button of Object.values(buttons))button.disabled=busy||favorites.length===0;
  select.disabled=busy||favorites.length===0;
  if(!busy&&signature!==previousFavoriteSignature){
   if(!favorites.length) say('В избранном нет активов. Добавьте актив через «Каталог» на экране «Обзор».');
   else if(!previousFavoriteSignature)
    say('Активы загружены. Выберите актив и нажмите кнопку проверки модели.');
  }
  previousFavoriteSignature=signature;
  return favorites;
 };
 const go=async role=>{
  if(busy)return;
  const favorites=sync(),asset=select.value;
  if(!favorites.includes(asset)){say('Сначала добавьте актив в избранное.');return;}
  busy=true;sync();result.hidden=true;result.textContent='';
  try{
   say('Проверяем подтверждение телефона и доступные лимиты…');
   const pair=await getPairing();
   if(pair?.state!=='APPROVED')throw Error('Сначала подтвердите устройство в Cloudflare.');
   const budget=await getBudget(),q=budget?.usage?.language;
   if(budget?.state!=='POLICY_ACTIVE'||budget?.httpStatus!==200||!q)
    throw Error('Защищённая проверка лимитов не прошла.');
   if(!Number.isSafeInteger(q.dailyUsed)||!Number.isSafeInteger(q.dailyLimit)||
      !Number.isSafeInteger(q.monthlyUsed)||!Number.isSafeInteger(q.monthlyLimit)||
      q.dailyUsed>=q.dailyLimit||q.monthlyUsed>=q.monthlyLimit||
      (budget.clock?.mode==='ECO'&&q.nightUsed>=q.nightLimit)||
      (Number.isSafeInteger(q.nextEligibleAt)&&q.nextEligibleAt>Date.now()))
    throw Error('Попытка пока запрещена внутренними лимитами APEX.');
   say('Собираем только проверенные публичные данные '+asset+'…');
   let rows=[];
   try{const history=await getHistory(asset,30);
    if(history?.native===true&&Array.isArray(history.observations))
     rows=history.observations;
   }catch{/* A valid fresh public ticker remains a possible evidence source. */}
   const live=await fetchTicker(asset);
   const evidence=buildCloudAuditEvidence({
    asset,rows,ticker:live?.state==='OK'?live.data:null
   });
   if(!evidence.length)throw Error('Нет свежих подтверждённых рыночных наблюдений для '+asset+'. Запрос к ИИ не отправлен.');
   say('Отправляем '+evidence.length+' подтверждённых наблюдений в '+labels[role]+'…');
   const answer=await runAudit(role,evidence);
   if(answer?.httpStatus!==200||answer?.state!=='OBSERVED_MODEL_OUTPUT'||
      answer?.role!==role||typeof answer?.text!=='string'||!answer.text.trim()){
    throw Error('Нет подтверждённого ответа модели: '+
     String(answer?.error||answer?.state||'UNKNOWN').slice(0,80));
   }
   say('Реальный ответ '+labels[role]+' получен · '+asset+
    ' · источников: '+evidence.length+'. Это исследовательский разбор, не прогноз.');
   result.textContent=answer.text.slice(0,3500);
   result.hidden=false;
  }catch(error){say(String(error?.message||error).slice(0,240));}
  finally{busy=false;sync();try{await refreshMonitor();}catch{}}
 };
 select.addEventListener('focus',sync);
 buttons.analyst.addEventListener('click',()=>void go('analyst'));
 buttons.critic.addEventListener('click',()=>void go('critic'));
 sync();
 return {sync};
}
