/**
 * W = source-scoped on-device whale activity RESEARCH at publication time.
 * Not an identity, wallet route, predictive probability or trade signal.
 * Never attach W retroactively to legacy scenarios.
 */
export const W_VERSION='APEX_W_AS_PUBLISHED_V1';
const VALID_SOURCES=new Map([
 ['binance:spot:aggtrade','SPOT_EXECUTIONS'],
 ['bybit:spot:trades','SPOT_EXECUTIONS'],
 ['okx:spot:trades','SPOT_EXECUTIONS'],
 ['kraken:spot:trades','SPOT_EXECUTIONS'],
 ['bingx:spot:trades','SPOT_EXECUTIONS'],
 ['coinbase:spot:trades','SPOT_EXECUTIONS'],
 ['mempool:bitcoin:tx','CHAIN_TRANSFERS'],
 ['blockscout:ethereum:transactions','CHAIN_TRANSFERS']
]);
const validAt=n=>Number.isSafeInteger(n)&&n>0;
function parsed(row){
 try{return typeof row?.hypothesis==='string'?
  JSON.parse(row.hypothesis):row?.hypothesis;}
 catch{return null;}
}
export function inspectWhaleCheck(row){
 const h=parsed(row),w=h?.whaleCheckAsPublished;
 if(w===undefined)return {state:'LEGACY',observed:false};
 const at=row?.publishedAt;
 if(!validAt(at)||w?.version!==W_VERSION||w.capturedAt!==at||
  w.windowStartAt!==at-3600000||
  w.policy!=='PREPUBLICATION_ROOM_ONLY_PARTIAL_COVERAGE'||
  !['OBSERVED','NO_OBSERVATIONS'].includes(w.state)||
  !Number.isSafeInteger(w.sampleCount)||w.sampleCount<0||w.sampleCount>84||
  !Number.isSafeInteger(w.sourceCount)||w.sourceCount<0||w.sourceCount>7||
  !Number.isSafeInteger(w.spotExecutions)||w.spotExecutions<0||
  !Number.isSafeInteger(w.chainTransfers)||w.chainTransfers<0||
  w.spotExecutions+w.chainTransfers!==w.sampleCount||
  !Array.isArray(w.sources)||w.sources.length!==w.sourceCount||
  w.walletRouteVerified!==false||w.predictiveProbability!==null||
  (w.state==='OBSERVED')!==(w.sampleCount>0)||
  (w.sourceCount===0)!==(w.sampleCount===0))
  return {state:'INVALID',observed:false};
 let count=0,spots=0,chains=0,latest=0;
 const seen=new Set();
 for(const item of w.sources){
  const type=VALID_SOURCES.get(item?.source);
  if(!type||seen.has(item.source)||item.type!==type||
   !Number.isSafeInteger(item.count)||item.count<1||item.count>12||
   !validAt(item.latestCollectedAt)||item.latestCollectedAt>at||
   item.latestCollectedAt<w.windowStartAt||
   (item.source==='mempool:bitcoin:tx'&&!row.asset?.startsWith('BTC'))||
   (item.source==='blockscout:ethereum:transactions'&&!row.asset?.startsWith('ETH')))
   return {state:'INVALID',observed:false};
  count+=item.count;
  if(type==='SPOT_EXECUTIONS')spots+=item.count;
  else chains+=item.count;
  latest=Math.max(latest,item.latestCollectedAt);
  seen.add(item.source);
 }
 if(count!==w.sampleCount||spots!==w.spotExecutions||
  chains!==w.chainTransfers||
  (latest===0?w.latestCollectedAt!==null:w.latestCollectedAt!==latest))
  return {state:'INVALID',observed:false};
 return {state:w.state,observed:w.state==='OBSERVED',capturedAt:at,
  sampleCount:count,sourceCount:w.sourceCount,spotExecutions:spots,
  chainTransfers:chains,latestCollectedAt:latest||null,
  sources:w.sources.map(x=>({...x}))};
}
/** The badge is intentionally not green for a missing or invalid check. */
export function whaleCheckBadge(row){
 const check=inspectWhaleCheck(row);
 if(check.state==='LEGACY')return null;
 const node=document.createElement('div');
 node.className='forecast-whale-check state-'+check.state.toLowerCase();
 node.dataset.wState=check.state;
 const letter=document.createElement('strong');
 letter.textContent='W';
 letter.setAttribute('aria-label','Проверка активности китов');
 const desc=document.createElement('span');
 if(check.state==='OBSERVED'){
  desc.textContent='Киты · до публикации: '+
   check.sampleCount+' наблюдений / '+check.sourceCount+' источн. '+
   '(Spot '+check.spotExecutions+', сеть '+check.chainTransfers+')';
 }else if(check.state==='NO_OBSERVATIONS'){
  desc.textContent='Киты · W проверено, сохранённых свежих событий нет';
 }else desc.textContent='Киты · данные W требуют проверки';
 node.append(letter,desc);
 node.title='W — частичная история Room до публикации. '+
  'Не доказывает маршрут средств, направление или точность прогноза.';
 return node;
}
/** Descriptive, no win rates or selection claims before sufficient out-of-sample audit. */
export function whaleCheckCoverage(rows){
 const counts={published:0,observed:0,noObservations:0,legacy:0,invalid:0,
  spotOnly:0,chainPresent:0};
 for(const row of Array.isArray(rows)?rows:[]){
  if(!row||!['1h','15m','4h'].includes(row.interval))continue;
  counts.published++;
  const w=inspectWhaleCheck(row);
  if(w.state==='OBSERVED'){
   counts.observed++;
   if(w.chainTransfers)counts.chainPresent++;
   else counts.spotOnly++;
  }else if(w.state==='NO_OBSERVATIONS')counts.noObservations++;
  else if(w.state==='LEGACY')counts.legacy++;
  else counts.invalid++;
 }
 return counts;
}
