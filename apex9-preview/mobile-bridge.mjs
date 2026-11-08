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
