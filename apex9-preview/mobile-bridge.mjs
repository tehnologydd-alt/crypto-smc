/**
 * Lightweight WebView ↔ Kotlin native bridge, no cloud service.
 * Calls only user-device storage and opt-in Android WorkManager scheduling.
 * Web preview transparently reports unsupported native features.
 */
import {planHistoricalH1Repair,checkHistoricalH1Chunk} from './historical-repair.mjs';
const plugin = () => globalThis.window?.Capacitor?.Plugins?.ApexNative ?? null;
const unavailable = {native:false,storage:'WEB_ONLY',observationCount:0,forecastCount:0,
 backgroundSyncEnabled:false,forecastAlertsEnabled:false,alertLimitReady:true,
 alertTargets:true,alertStop:true,keepScreenOn:false,
 notificationPermissionGranted:false,latestObservationAt:0};
export async function getMobileStatus() {
 const native=plugin();
 if(!native) return unavailable;
 try{return await native.getStatus();}
 catch(error){return {...unavailable,error:String(error?.message||error)};}
}
/** Device-local HTTP attempts only; separate from the WebView source ledger. */
export async function getMobileApiReliability(){
 const native=plugin();
 const empty={native:false,source:'UNAVAILABLE',rows:[]};
 if(!native?.getApiReliability)return empty;
 try {
  const data=await native.getApiReliability();
  if(data?.native!==true||data?.version!=='APEX_NATIVE_API_LEDGER_V1'||
   data?.source!=='ANDROID_NATIVE_REQUEST_LEDGER'||
   !Array.isArray(data.rows)||data.rows.length>12)return empty;
  return data;
 }catch(error){return {...empty,error:String(error?.message||error).slice(0,120)};}
}
export async function saveMobileSnapshot(snapshot) {
 const native=plugin();
 if(!native||!snapshot?.symbol)return {native:false,saved:0};
 const items=[];
 const symbol=snapshot.symbol,received=Number(snapshot.collectedAt);
 const ticker=snapshot.ticker;
 if(ticker?.scope==='24H_SPOT_SNAPSHOT' && Number.isFinite(ticker.observedAt)) {
  items.push({
   id:'ticker:'+symbol+':'+ticker.observedAt,
   asset:symbol,source:'binance:spot:24h',kind:'market',
   observedAt:ticker.observedAt,collectedAt:received,
   payload:JSON.stringify({price:ticker.price,changePercent24h:ticker.changePercent,
    quoteVolume:ticker.quoteVolume,source:'Binance public spot 24h'})
  });
 }
 for(const depth of snapshot.depth||[]){
  if(depth?.sampleScope!=='LIMITED_PUBLIC_SNAPSHOT')continue;
  const observedAt=depth.exchangeTimestamp||depth.receivedAt;
  if(!Number.isFinite(observedAt))continue;
  items.push({
   id:'book:'+depth.venue+':'+symbol+':'+depth.receivedAt,
   asset:symbol,source:depth.venue+':spot:depth',kind:'liquidity',
   observedAt,collectedAt:received,
   payload:JSON.stringify({bestBid:depth.bestBid,bestAsk:depth.bestAsk,
    spreadBps:depth.spreadBps,visibleDepthImbalance:depth.visibleDepthImbalance,
    bidNotional:depth.bidNotional,askNotional:depth.askNotional,
    bidLevels:depth.bidLevels,askLevels:depth.askLevels,
    updateId:depth.updateId,scope:'SPOT',
    levelSelection:depth.levelSelection,
    topVisibleLevels:Array.isArray(depth.topVisibleLevels)
      ?depth.topVisibleLevels.slice(0,16):undefined,
    sampleScope:depth.sampleScope})
  });
 }
 let saved=0,errors=[];
 for(const item of items){
  try{const result=await native.saveObservation(item);if(result?.saved)saved++;}
  catch(error){errors.push(String(error?.message||error));}
 }
 return {native:true,saved,errors};
}
export async function getMobileHistory(symbol,limit=15){
 const native=plugin();
 if(!native)return {native:false,observations:[]};
 const response=await native.getObservations({asset:symbol,limit:Math.min(50,Math.max(1,limit))});
 return {native:true,observations:response?.observations||[]};
}
export async function setMobileSettings(settings={}){
 const native=plugin();
 if(!native)throw Error('Нативное хранилище доступно только в Android-приложении.');
 const allowed=['asset','backgroundSyncEnabled','forecastAlertsEnabled',
  'alertLimitReady','alertTargets','alertStop','keepScreenOn'];
 const payload={};
 for(const k of allowed)if(settings[k]!==undefined)payload[k]=settings[k];
 return native.setSettings(payload);
}
/** Request permission only on an explicit user gesture enabling alerts. */
export async function requestMobileForecastNotificationPermission(){
 const localNotifications=globalThis.window?.Capacitor?.Plugins?.LocalNotifications;
 if(!localNotifications?.requestPermissions)
  return {granted:false,error:'Плагин уведомлений недоступен'};
 try{
  const r=await localNotifications.requestPermissions();
  return {granted:r?.display==='granted'};
 }catch(error){
  return {granted:false,error:String(error?.message||error).slice(0,140)};
 }
}

/** Batch-persist only confirmed closed candles, no speculative data. */
export async function saveMobileCandles(symbol,interval,candles){
 const native=plugin();
 if(!native)return {native:false,saved:0};
 const rows=Array.isArray(candles)?candles.filter(x=>x?.closed===true).slice(-500):[];
 if(!rows.length)return {native:true,saved:0};
 try{
  const result=await native.saveCandles({asset:symbol,interval,candles:rows});
  return {native:true,saved:result?.saved||0};
 }catch(error){return {native:true,saved:0,error:String(error?.message||error)};}
}
/** Local candles remain expressly historical, even if the network is down. */
export async function getMobileCandles(symbol,interval,limit=500){
 const native=plugin();
 if(!native)return {native:false,candles:[],source:'WEB_ONLY'};
 try{
  const result=await native.getCandles({asset:symbol,interval,limit:Math.min(600,Math.max(1,limit))});
  return {native:true,candles:result?.candles||[],source:'LOCAL_ROOM_CACHE'};
 }catch(error){
  return {native:true,candles:[],source:'LOCAL_ROOM_CACHE',
   error:String(error?.message||error)};
 }
}


/**
 * Published research hypotheses and first observed results are immutable in
 * native Android Room. The browser preview never simulates a forecast journal.
 */
export async function publishMobileResearchForecast(forecast){
 const native=plugin();
 if(!native)return {native:false,created:false,error:'Журнал исследований требует Android APK.'};
 try{
  const response=await native.publishResearchForecast(forecast);
  return {native:true,...response};
 }catch(error){
  return {native:true,created:false,error:String(error?.message||error)};
 }
}
/** Frozen shadow hypotheses, never order actions or automatic model weights. */
export async function registerMobileShadowCandidate(candidate){
 const native=plugin();
 if(!native)return {native:false,error:'Требуется Android с Room v5'};
 if(!candidate||!['15m','1h','4h'].includes(candidate.interval)||
  !/^[A-Z0-9]{5,20}$/.test(candidate.asset||'')||
  !['sameRadar','higherRadar','marketDay','visibleDepth'].includes(candidate.featureId)||
  !['MATCH_MORE_TP3','MISMATCH_MORE_TP3'].includes(candidate.association)||
  candidate.evidenceVersion!=='APEX_SHADOW_FORWARD_V1')
  return {native:true,error:'Неверные параметры экспериментальной гипотезы'};
 try{
  const data=await native.registerShadowCandidate({
   asset:candidate.asset,interval:candidate.interval,
   featureId:candidate.featureId,association:candidate.association,
   evidenceVersion:candidate.evidenceVersion,
   sourceCutoffAt:candidate.sourceCutoffAt,historySize:candidate.historySize});
  if(data?.assetScoped!==true||data?.proposal?.asset!==candidate.asset||
   data.proposal.interval!==candidate.interval||
   data.proposal.featureId!==candidate.featureId)
   throw Error('Непроверенное подтверждение Room');
  return {native:true,created:data.created===true,proposal:data.proposal};
 }catch(error){return {native:true,error:String(error?.message||error)};}
}

export async function getMobileShadowCandidates(asset){
 const native=plugin();
 if(!native)return {native:false,proposals:[],error:'Требуется Android с Room v5'};
 if(typeof asset!=='string'||!/^[A-Z0-9]{5,20}$/.test(asset))
  return {native:true,proposals:[],error:'Неверный актив'};
 try{
  const data=await native.getShadowCandidates({asset});
  if(data?.assetScoped!==true||data.asset!==asset||
   !Array.isArray(data.proposals)||data.proposals.length>30||
   data.proposals.some(x=>x?.asset!==asset))
   throw Error('Невозможно подтвердить локальный реестр гипотез');
  return {native:true,proposals:data.proposals,source:'IMMUTABLE_LOCAL_ROOM_V5'};
 }catch(error){
  return {native:true,proposals:[],error:String(error?.message||error)};
 }
}

/**
 * Exact bookmarked forecast lookup (including records outside last 75).
 * Local Room query in <=75-ID batches; never downloads an entire market
 * archive, overwrites history, or treats missing records as completed.
 */
export async function getMobileMarkedResearchForecasts(ids){
 const native=plugin();
 const base={native:Boolean(native),source:'LOCAL_ROOM_MARKED_JOURNAL',
  forecasts:[],missingIds:[],requestedCount:0,complete:false};
 if(!Array.isArray(ids)||ids.length>300||ids.some(id=>
  typeof id!=='string'||!/^[A-Za-z0-9:_-]{10,160}$/.test(id)||
  !['range1','direction2','direction3'].includes(id.split(':')[0]))||
  new Set(ids).size!==ids.length)
  return {...base,error:'Некорректные сохранённые отметки.'};
 if(!native)return {...base,error:'Требуется Android с архивом Room.'};
 if(!ids.length)return {...base,complete:true,requestedCount:0};
 const seen=new Set(),rows=[],missing=[];
 try{
  for(let offset=0;offset<ids.length;offset+=75){
   const batch=ids.slice(offset,offset+75);
   const response=await native.getMarkedResearchForecasts({ids:batch});
   if(response?.source!=='LOCAL_ROOM_MARKED_JOURNAL'||
    response.requestedCount!==batch.length||
    !Array.isArray(response.forecasts)||
    !Array.isArray(response.missingIds)||
    response.foundCount!==response.forecasts.length)
    throw Error('Обновите Android APK: целевая загрузка отмеченных недоступна.');
   const wanted=new Set(batch),found=new Set();
   for(const row of response.forecasts){
    if(typeof row?.id!=='string'||!wanted.has(row.id)||
     !/^[A-Z0-9]{5,20}$/.test(row.asset||'')||
     !Number.isSafeInteger(row.publishedAt)||row.publishedAt<=0||
     found.has(row.id)||seen.has(row.id))
     throw Error('Журнал Room вернул несогласованный отмеченный сценарий.');
    found.add(row.id);seen.add(row.id);rows.push(row);
   }
   const absent=batch.filter(x=>!found.has(x));
   if(response.missingIds.length!==absent.length||
    new Set(response.missingIds).size!==absent.length||
    response.missingIds.some(x=>!absent.includes(x)))
    throw Error('Room не подтвердил список отсутствующих отметок.');
   missing.push(...absent);
  }
  rows.sort((a,b)=>b.publishedAt-a.publishedAt||b.id.localeCompare(a.id));
  return {...base,forecasts:rows,missingIds:missing,
   requestedCount:ids.length,complete:true};
 }catch(error){
  return {...base,error:String(error?.message||error),
   requestedCount:ids.length};
 }
}

/**
 * Fast favorites-only Room milestones. A terminal count is NOT proof of
 * complete stage verification; full archived research remains manual.
 */
export async function getMobileResearchProgress(expectedFavorites=[]){
 const native=plugin();
 const empty={native:Boolean(native),source:'LOCAL_ROOM_PROGRESS_V1',
  favorites:[],rows:[],complete:false};
 if(!native)return {...empty,error:'Данные опыта доступны в Android APK.'};
 const validAsset=value=>typeof value==='string'&&
  /^[A-Z0-9]{5,20}$/.test(value);
 if(!Array.isArray(expectedFavorites)||expectedFavorites.length>10||
  expectedFavorites.some(x=>!validAsset(x))||
  new Set(expectedFavorites).size!==expectedFavorites.length)
  return {...empty,error:'Некорректное избранное.'};
 try{
  const result=await native.getResearchProgress();
  const favorites=result?.favorites;
  if(result?.source!=='LOCAL_ROOM_PROGRESS_V1'||
   !Array.isArray(favorites)||favorites.length>10||
   favorites.some(x=>!validAsset(x))||
   new Set(favorites).size!==favorites.length||
   expectedFavorites.length!==favorites.length||
   expectedFavorites.some(x=>!favorites.includes(x))||
   !Number.isSafeInteger(result?.sampledAt)||
   result.sampledAt<=0||
   result.sampledAt>Date.now()+60000||
   result.registrationAt!==Date.UTC(2026,10,11,0,0,0)||
   !Array.isArray(result?.rows)||result.rows.length>30||
   result.modelTrainingEnabled!==false||
   result.verifiedOutcomeRate!==null)
   throw Error('Несогласованная сводка Room или изменилось избранное.');
  const keys=new Set();
  for(const row of result.rows){
   const fields=['published','recordedTerminal','newPublished'];
   if(!favorites.includes(row?.asset)||
    !['15m','1h','4h'].includes(row?.interval)||
    fields.some(k=>!Number.isSafeInteger(row[k])||row[k]<0)||
    row.recordedTerminal>row.published||
    row.newPublished>row.published||
    !Number.isSafeInteger(row.latestPublishedAt)||
    row.latestPublishedAt<result.registrationAt-10*365*86400000||
    row.latestPublishedAt>result.sampledAt+60000)
    throw Error('В сводке Room повреждены счётчики.');
   const key=row.asset+':'+row.interval;
   if(keys.has(key))throw Error('Дублируются строки опыта.');
   keys.add(key);
  }
  return {...empty,complete:true,favorites:[...favorites],
   sampledAt:result.sampledAt,registrationAt:result.registrationAt,
   rows:result.rows.map(row=>({...row}))};
 }catch(error){
  return {...empty,error:String(error?.message||error)};
 }
}

export async function getMobileResearchForecasts(limit=40){
 const native=plugin();
 if(!native)return {native:false,forecasts:[],publishedCount:0,evaluatedCount:0};
 try{
  const response=await native.getResearchForecasts({limit:Math.min(75,Math.max(1,limit))});
  return {native:true,forecasts:response?.forecasts||[],
   publishedCount:response?.publishedCount||0,
   evaluatedCount:response?.evaluatedCount||0,
   source:'LOCAL_ROOM_JOURNAL'};
 }catch(error){
  return {native:true,forecasts:[],publishedCount:0,evaluatedCount:0,
   error:String(error?.message||error)};
 }
}

/** Verified selected-asset archive: old APK global-journal fallback is rejected. */
export async function getMobileAssetResearchForecasts(asset,limit=75){
 const native=plugin();
 const empty={native:Boolean(native),asset,assetScoped:false,forecasts:[],
  publishedCount:null,evaluatedCount:null,complete:false,
  source:'LOCAL_ROOM_JOURNAL'};
 if(typeof asset!=='string'||!/^[A-Z0-9]{5,20}$/.test(asset))
  return {...empty,error:'Некорректный актив для локального аудита.'};
 if(!native)return {...empty,error:'Требуется установленный Android APK.'};
 const safeLimit=Number.isSafeInteger(limit)?Math.min(75,Math.max(1,limit)):75;
 try{
  const data=await native.getResearchForecasts({asset,limit:safeLimit});
  if(data?.assetScoped!==true||data?.asset!==asset)
   throw Error('Android не поддерживает проверенную выборку по активу. Обновите APEX.');
  if(!Array.isArray(data.forecasts)||data.forecasts.length>safeLimit||
   !Number.isSafeInteger(data.publishedCount)||
   !Number.isSafeInteger(data.evaluatedCount)||
   data.publishedCount<0||data.evaluatedCount<0||
   data.evaluatedCount>data.publishedCount||
   data.publishedCount<data.forecasts.length||
   data.forecasts.some(x=>x?.asset!==asset))
   throw Error('Журнал Room вернул непроверяемую выборку по активу.');
  return {...empty,assetScoped:true,
   forecasts:data.forecasts,publishedCount:data.publishedCount,
   evaluatedCount:data.evaluatedCount,
   complete:data.forecasts.length===data.publishedCount};
 }catch(error){
  return {...empty,error:String(error?.message||error)};
 }
}

/** Verified, bounded, multi-page archive. Rejects concurrent count drift. */
export async function getMobileAssetResearchArchive(asset,{
 pageSize=75,maxRows=1500,onProgress=null
}={}){
 const native=plugin();
 const empty={native:Boolean(native),asset,assetScoped:false,forecasts:[],
  publishedCount:null,evaluatedCount:null,complete:false,
  source:'LOCAL_ROOM_JOURNAL'};
 if(typeof asset!=='string'||!/^[A-Z0-9]{5,20}$/.test(asset))
  return {...empty,error:'Некорректный актив для архива исследований.'};
 if(!native)return {...empty,error:'Нужен установленный Android APK.'};
 if(!Number.isSafeInteger(pageSize)||pageSize<1||pageSize>75||
  !Number.isSafeInteger(maxRows)||maxRows<1||maxRows>1500)
  return {...empty,error:'Неверные ограничения чтения архива.'};
 let total=null,evaluated=null,previous=null;
 const seen=new Set(),rows=[];
 try{
  while(rows.length<maxRows){
   const offset=rows.length,limit=Math.min(pageSize,maxRows-offset);
   const data=await native.getResearchForecasts({asset,offset,limit});
   if(data?.assetScoped!==true||data?.asset!==asset||data?.offset!==offset)
    throw Error('Требуется обновление Android для постраничного архива APEX.');
   if(!Number.isSafeInteger(data.publishedCount)||data.publishedCount<0||
    !Number.isSafeInteger(data.evaluatedCount)||data.evaluatedCount<0||
    data.evaluatedCount>data.publishedCount||
    !Array.isArray(data.forecasts))
    throw Error('Непроверяемые метаданные журнала Room.');
   if(total===null){total=data.publishedCount;evaluated=data.evaluatedCount;}
   else if(total!==data.publishedCount||evaluated!==data.evaluatedCount)
    throw Error('Архив изменился во время чтения. Повторите проверку.');
   const expected=Math.min(limit,total-offset);
   if(expected<0||data.forecasts.length!==expected)
    throw Error('Неполная страница архива Room.');
   for(const row of data.forecasts){
    if(row?.asset!==asset||typeof row.id!=='string'||!row.id||
     !Number.isSafeInteger(row.publishedAt)||row.publishedAt<=0||
     seen.has(row.id)||
     (previous&&(row.publishedAt>previous.publishedAt||
      (row.publishedAt===previous.publishedAt&&row.id>=previous.id))))
     throw Error('Нарушен порядок или целостность архива.');
    seen.add(row.id);rows.push(row);previous=row;
   }
   if(typeof onProgress==='function')onProgress(rows.length,total);
   if(rows.length===total)break;
   if(data.forecasts.length===0)throw Error('Пустая страница неполного архива.');
  }
  return {...empty,assetScoped:true,forecasts:rows,
   publishedCount:total,evaluatedCount:evaluated,
   complete:rows.length===total};
 }catch(error){
  return {...empty,error:String(error?.message||error)};
 }
}

/**
 * Narrow, verified M5 window for one published 24h directional scenario.
 * A completed query is not evidence of complete candles: the caller must
 * validate each expected 5-minute slot and refuse any missing interval.
 */
export async function getMobileM5Window(asset,startTime,endExclusive){
 const native=plugin();
 const empty={native:Boolean(native),asset,interval:'5m',candles:[],complete:false,
  source:'LOCAL_ROOM_CACHE'};
 const M=300000;
 if(typeof asset!=='string'||!/^[A-Z0-9]{5,20}$/.test(asset)||
  !Number.isSafeInteger(startTime)||startTime<=0||startTime%M!==0||
  !Number.isSafeInteger(endExclusive)||endExclusive<=startTime||
  endExclusive%M!==0||endExclusive-startTime>290*M)
  return {...empty,error:'Неверные границы архива M5.'};
 if(!native)return {...empty,error:'Нужен Android APK с архивом M5.'};
 try{
  const reply=await native.getCandlesWindow({
   asset,interval:'5m',startTime,endExclusive
  });
  if(reply?.asset!==asset||reply?.interval!=='5m'||
   reply?.startTime!==startTime||reply?.endExclusive!==endExclusive||
   !Array.isArray(reply.candles)||reply.candles.length>290)
   throw Error('Ответ M5 не соответствует исходному запросу.');
  const seen=new Set();
  let previous=-1;
  for(const bar of reply.candles){
   if(!Number.isSafeInteger(bar?.t)||bar.t%M!==0||
    bar.t<startTime||bar.t>=endExclusive||
    bar.closeAt!==bar.t+M-1||bar.closed!==true||
    bar.t<=previous||seen.has(bar.t)||
    ![bar.open,bar.high,bar.low,bar.close,bar.volume]
     .every(x=>typeof x==='number'&&Number.isFinite(x))||
    bar.low<=0||bar.volume<0||bar.low>Math.min(bar.open,bar.close)||
    bar.high<Math.max(bar.open,bar.close,bar.low))
    throw Error('История M5 содержит некорректные свечи.');
   seen.add(bar.t);previous=bar.t;
  }
  return {...empty,complete:true,candles:reply.candles};
 }catch(error){
  return {...empty,error:String(error?.message||error)};
 }
}

/** Paginated, strictly verified M1 candle history, without interpolation. */
export async function getMobileM1Window(asset,startTime,endExclusive){
 const native=plugin(),M=60000,max=4*24*60;
 const empty={native:Boolean(native),asset,interval:'1m',candles:[],
  complete:false,source:'LOCAL_ROOM_CACHE'};
 if(typeof asset!=='string'||!/^[A-Z0-9]{5,20}$/.test(asset)||
  !Number.isSafeInteger(startTime)||startTime<=0||startTime%M!==0||
  !Number.isSafeInteger(endExclusive)||endExclusive<=startTime||
  endExclusive%M!==0||endExclusive-startTime>max*M)
  return {...empty,error:'Неверные границы архива M1.'};
 if(!native)return {...empty,error:'Нужен Android APK с архивом M1.'};
 const rows=[];
 try{
  for(let start=startTime;start<endExclusive;start+=450*M){
   const end=Math.min(endExclusive,start+450*M);
   const data=await native.getCandlesWindow({
    asset,interval:'1m',startTime:start,endExclusive:end
   });
   if(data?.asset!==asset||data?.interval!=='1m'||
    data?.startTime!==start||data?.endExclusive!==end||
    !Array.isArray(data.candles)||data.candles.length!==(end-start)/M)
    throw Error('Неполный архив M1: отсутствуют закрытые свечи.');
   for(let i=0;i<data.candles.length;i++){
    const b=data.candles[i],t=start+i*M;
    if(b?.t!==t||b.closeAt!==t+M-1||b.closed!==true||
     ![b.open,b.high,b.low,b.close,b.volume]
      .every(x=>typeof x==='number'&&Number.isFinite(x))||
     b.low<=0||b.volume<0||
     b.high<Math.max(b.open,b.close,b.low)||
     b.low>Math.min(b.open,b.close))
     throw Error('Повреждённая закрытая свеча M1.');
    rows.push(b);
   }
  }
  return {...empty,candles:rows,complete:true};
 }catch(error){
  return {...empty,error:String(error?.message||error).slice(0,180)};
 }
}

/** Offline source candles only. No interpolation of missing H1 records. */
export async function getMobileCandleArchive(asset,interval='1h',{
 pageSize=500,maxRows=4800,onProgress=null
}={}){
 const native=plugin();
 const empty={native:Boolean(native),asset,interval,candles:[],
  totalCount:null,complete:false,source:'LOCAL_ROOM_CACHE'};
 if(typeof asset!=='string'||!/^[A-Z0-9]{5,20}$/.test(asset)||
  !['15m','1h','4h','1d'].includes(interval))
  return {...empty,error:'Некорректный актив или интервал архива свечей.'};
 if(!native)return {...empty,error:'Нужен установленный Android APK.'};
 if(!Number.isSafeInteger(pageSize)||pageSize<1||pageSize>600||
  !Number.isSafeInteger(maxRows)||maxRows<1||maxRows>4800)
  return {...empty,error:'Неверный размер архива свечей.'};
 let total=null,previousNewest=null;
 const rows=[],seen=new Set();
 try{
  while(rows.length<maxRows){
   const offset=rows.length,limit=Math.min(pageSize,maxRows-offset);
   const data=await native.getCandles({asset,interval,offset,limit});
   if(data?.asset!==asset||data?.interval!==interval||
    data?.offset!==offset||
    !Number.isSafeInteger(data.totalCount)||data.totalCount<0||
    !Array.isArray(data.candles))
    throw Error('Требуется обновление Android для архива H1-свечей.');
   if(total===null)total=data.totalCount;
   else if(total!==data.totalCount)
    throw Error('Свечная история изменилась во время чтения.');
   const expected=Math.min(limit,total-offset);
   if(expected<0||data.candles.length!==expected)
    throw Error('Неполная страница свечной истории.');
   let pagePrev=null;
   for(const bar of data.candles){
    if(!Number.isSafeInteger(bar?.t)||bar.t<=0||
     !Number.isSafeInteger(bar.closeAt)||bar.closeAt<=bar.t||
     bar.closed!==true||seen.has(bar.t)||
     (pagePrev!==null&&bar.t<=pagePrev)||
     ![bar.open,bar.high,bar.low,bar.close,bar.volume]
      .every(x=>typeof x==='number'&&Number.isFinite(x))||
     bar.low<=0||bar.high<Math.max(bar.open,bar.close,bar.low)||
     bar.low>Math.min(bar.open,bar.close)||bar.volume<0)
     throw Error('Невалидная или повторная сохранённая свеча.');
    pagePrev=bar.t;seen.add(bar.t);
   }
   if(data.candles.length&&previousNewest!==null&&
    data.candles.at(-1).t>=previousNewest)
    throw Error('Нарушен хронологический порядок страниц H1.');
   if(data.candles.length)previousNewest=data.candles[0].t;
   rows.push(...data.candles);
   if(typeof onProgress==='function')onProgress(rows.length,total);
   if(rows.length===total)break;
   if(data.candles.length===0)throw Error('Пустая страница свечной истории.');
  }
  return {...empty,candles:rows.sort((a,b)=>a.t-b.t),
   totalCount:total,complete:rows.length===total};
 }catch(error){
  return {...empty,error:String(error?.message||error)};
 }
}
export async function checkMobileResearchForecast(id){
 const native=plugin();
 if(!native)return {native:false,state:'UNSUPPORTED'};
 try{
  const result=await native.checkResearchForecast({id});
  return {native:true,...result};
 }catch(error){
  return {native:true,state:'ERROR',error:String(error?.message||error)};
 }
}


/**
 * User-initiated, rate-paced and cancellable-on-next-chunk H1 archive repair.
 * Only real data acquired by the Android native module can be persisted.
 * A failed chunk stops this particular run and never claims full completion.
 */
export async function repairMobileH1Archive(asset,{
 days=30,shouldStop=()=>false,onProgress=()=>{},now=Date.now()
}={}){
 const plan=planHistoricalH1Repair(asset,days,{now});
 const native=plugin();
 const base={native:Boolean(native),asset,days,added:0,existing:0,
  processed:0,total:plan.windows.length,expectedBars:plan.expectedBars||0};
 if(plan.state!=='READY')return {...base,state:'INVALID',error:plan.reason};
 if(!native||typeof native.repairHistoricalH1!=='function')
  return {...base,state:'UNSUPPORTED',
   error:'В этой версии Android нет безопасного восстановления H1. Обновите APEX.'};
 let added=0,existing=0,processed=0;
 for(const window of plan.windows){
  if(shouldStop())return {...base,state:'CANCELLED',added,existing,processed};
  try{
   const reply=await native.repairHistoricalH1({
    asset,startTime:window.startTime,endExclusive:window.endExclusive
   });
   const verified=checkHistoricalH1Chunk(window,reply);
   if(verified.state!=='OK')throw Error(verified.reason);
   added+=verified.added;existing+=verified.existing;processed++;
   onProgress({asset,processed,total:plan.windows.length,
    added,existing,verifiedSource:verified.networkVerified});
  }catch(error){
   return {...base,state:'ERROR',added,existing,processed,
    error:String(error?.message||error).slice(0,260)};
  }
  if(processed<plan.windows.length){
   // Throttle deliberate foreground requests; never retry on 418/429.
   await new Promise(resolve=>setTimeout(resolve,350));
  }
 }
 return {...base,state:'COMPLETE',added,existing,processed};
}
/** User-curated watchlist; authoritative 10-item cap enforced by DataStore. */
export async function getMobileFavorites(){
 const status=await getMobileStatus();
 return {native:status.native===true,favorites:Array.isArray(status.favorites)?status.favorites:[],
  limit:10,error:status.error};
}
export async function changeMobileFavorite(asset,add){
 const native=plugin();
 if(!native)throw Error('Избранное доступно в установленном Android APK.');
 const response=await native.changeResearchFavorite({asset,add:Boolean(add)});
 return {favorites:response?.favorites||[],limit:response?.limit||10};
}
/** APEX generates hypotheses by itself for favorites; user never creates them. */
export async function syncMobileFavoriteResearch(){
 const native=plugin();
 if(!native)return {native:false,checked:0,reports:[]};
 try{
  const result=await native.syncFavoriteResearch();
  return {native:true,checked:result?.checked||0,reports:result?.reports||[]};
 }catch(error){
  return {native:true,checked:0,reports:[],error:String(error?.message||error)};
 }
}

/** Read-only, bounded phone-local public depth history; no network or predictions. */
export async function getMobileLiquidityHistory(asset,limit=120){
 const native=plugin();
 if(!native)return {native:false,rows:[],source:'WEB_ONLY'};
 try{
  const result=await native.getLiquidityHistory({
   asset,limit:Math.min(200,Math.max(1,Math.trunc(limit)))
  });
  return {native:true,rows:result?.rows||[],source:'LOCAL_ROOM_DEPTH_HISTORY'};
 }catch(error){
  return {native:true,rows:[],source:'LOCAL_ROOM_DEPTH_HISTORY',
   error:String(error?.message||error)};
 }
}

/**
 * Network-level research snapshots. Never use tokens from a different chain.
 * The native Room write validates actual capture timestamps and bounded JSON.
 */
export async function saveMobileOnChainObservation(asset,result){
 const native=plugin();
 if(!native)return {native:false,saved:false};
 const data=result?.data,chain=result?.chain;
 const expected=chain==='bitcoin'?'mempool:bitcoin:network':
  chain==='ethereum'?'blockscout:ethereum:stats':
  chain==='ton'?'toncenter:ton:masterchain':null;
 if(result?.state!=='OK'||!expected||!data||
    !Number.isSafeInteger(data.observedAt)||!Number.isSafeInteger(data.collectedAt)||
    data.collectedAt!==data.observedAt)return {native:true,saved:false};
 try{
  const response=await native.saveObservation({
   id:'network:'+chain+':'+asset+':'+data.observedAt,
   asset,source:expected,kind:'onchain',
   observedAt:data.observedAt,collectedAt:data.collectedAt,
   payload:JSON.stringify(data)
  });
  return {native:true,saved:response?.saved===true};
 }catch(error){
  return {native:true,saved:false,error:String(error?.message||error)};
 }
}
export async function getMobileOnChainHistory(asset,limit=80){
 const native=plugin();
 if(!native)return {native:false,rows:[],source:'WEB_ONLY'};
 try{
  const response=await native.getOnChainHistory({
   asset,limit:Math.max(1,Math.min(120,Math.trunc(limit)))
  });
  return {native:true,rows:response?.rows||[],source:'LOCAL_ROOM_NETWORK_HISTORY'};
 }catch(error){
  return {native:true,rows:[],source:'LOCAL_ROOM_NETWORK_HISTORY',
   error:String(error?.message||error)};
 }
}

/** Android WorkManager's historical Radar observations, never a live UI scan.
 * Only the native repository can attest the source and close time.
 */
export async function getMobileRadarHistory(){
 const native=plugin();
 if(!native?.getRadarHistory)
  return {native:false,records:[],source:'UNAVAILABLE'};
 try{
  const res=await native.getRadarHistory();
  return {native:res?.native===true&&res.source==='ANDROID_NATIVE_RADAR',
   records:Array.isArray(res?.records)?res.records.slice(0,40):[],
   source:res?.source||'INVALID'};
 }catch(e){
  return {native:false,records:[],source:'OFFLINE',
   error:String(e?.message||e).slice(0,125)};
 }
}
