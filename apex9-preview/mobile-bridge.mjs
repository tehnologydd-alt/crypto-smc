/**
 * Lightweight WebView ↔ Kotlin native bridge, no cloud service.
 * Calls only user-device storage and opt-in Android WorkManager scheduling.
 * Web preview transparently reports unsupported native features.
 */
const plugin = () => globalThis.window?.Capacitor?.Plugins?.ApexNative ?? null;
const unavailable = {native:false,storage:'WEB_ONLY',observationCount:0,forecastCount:0,
 backgroundSyncEnabled:false,latestObservationAt:0};
export async function getMobileStatus() {
 const native=plugin();
 if(!native) return unavailable;
 try{return await native.getStatus();}
 catch(error){return {...unavailable,error:String(error?.message||error)};}
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
export async function setMobileSettings({asset,backgroundSyncEnabled}){
 const native=plugin();
 if(!native)throw Error('Нативное хранилище доступно только в Android-приложении.');
 return native.setSettings({asset,backgroundSyncEnabled});
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
