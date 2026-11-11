/**
 * Stage 4 — operational public Spot depth request audit.
 * Input: verified per-provider WEBVIEW source-reliability summaries, NOT
 * native WorkManager ledger. Never declares a superior exchange or forecasts.
 */
export const SPOT_DEPTH_QUALITY_VERSION='APEX_SPOT_DEPTH_QUALITY_STAGE4_V1';
const IDS=Object.freeze(['binance-depth','okx-depth']);
const valid=n=>Number.isSafeInteger(n)&&n>=0;
const age=x=>Number.isSafeInteger(x)&&x>0;
const empty=(id)=>({id,state:'COLLECTING',attempts:0,ok:0,failures:0,
 rateLimited:0,invalid:0,uniqueDays:0,availabilityPercent:null,
 freshnessChecked:0,freshnessConfirmed:0,freshnessPercent:null,
 latencyMedianMs:null,lastAt:null});
/** No raw API payloads, IP, addresses or user telemetry. */
export function auditSpotDepthQuality(summaries,{now=Date.now()}={}){
 const rows=[];
 for(const id of IDS){
  const s=summaries?.[id];
  if(!s||s.provider!==id||!valid(s.attempts)||
   !valid(s.ok)||!valid(s.failures)||s.ok+s.failures!==s.attempts||
   !valid(s.uniqueDays)||!valid(s.rateLimited)||!valid(s.invalid)||
   s.rateLimited+s.invalid>s.failures||
   s.uniqueDays>s.attempts||
   !['OBSERVED','COLLECTING'].includes(s.state)||
   (s.lastAt!==null&&(!age(s.lastAt)||s.lastAt>now+60000))||
   !valid(s.freshness?.checked)||!valid(s.freshness?.confirmed)||
   s.freshness.confirmed>s.freshness.checked||
   s.freshness.checked>s.ok)
    return {version:SPOT_DEPTH_QUALITY_VERSION,state:'INVALID',
     sources:[],comparability:'NONE',predictive:false,superior:null};
  const mature=s.attempts>=12&&s.uniqueDays>=2;
  if(mature!==(s.state==='OBSERVED'))return {version:SPOT_DEPTH_QUALITY_VERSION,
   state:'INVALID',sources:[],comparability:'NONE',predictive:false,superior:null};
  if(mature&&(!Number.isFinite(s.availabilityPercent)||
    Math.abs(s.availabilityPercent-Math.round(1000*s.ok/s.attempts)/10)>.11))
   return {version:SPOT_DEPTH_QUALITY_VERSION,
    state:'INVALID',sources:[],comparability:'NONE',predictive:false,superior:null};
  if(!mature&&s.availabilityPercent!==null)
   return {version:SPOT_DEPTH_QUALITY_VERSION,
    state:'INVALID',sources:[],comparability:'NONE',predictive:false,superior:null};
  rows.push({...empty(id),id,state:s.state,attempts:s.attempts,
   ok:s.ok,failures:s.failures,rateLimited:s.rateLimited,
   invalid:s.invalid,uniqueDays:s.uniqueDays,
   availabilityPercent:mature?s.availabilityPercent:null,
   freshnessChecked:s.freshness.checked,
   freshnessConfirmed:s.freshness.confirmed,
   // Only OKX has exchange-generated 'ts' from the REST depth snapshot.
   freshnessPercent:id==='okx-depth'&&s.freshness.checked>=5?
    s.freshness.percent:null,
   latencyMedianMs:Number.isFinite(s.latencyMedianMs)?
    s.latencyMedianMs:null,lastAt:s.lastAt});
 }
 return {version:SPOT_DEPTH_QUALITY_VERSION,
  state:rows.every(r=>r.state==='OBSERVED')?'DESCRIPTIVE':'COLLECTING',
  sources:rows,
  // Different assets, hours, network states and sample sizes;
  // percentage differences are NOT a matched or causal test.
  comparability:'UNMATCHED_LOCAL_REQUESTS',
  superior:null,predictive:false,changesForecasts:false,
  attribution:'WEBVIEW_PUBLIC_GET_ONLY',
  note:'Только реальные завершённые WebView-запросы выбранных активов '+
   'за 30 дней. Кэш и отменённые запросы не учитываются; '+
   'сравнение не выравнивает активы/время/условия сети. '+
   'У Binance REST depth нет подтверждённого времени снимка, '+
   'поэтому метрика свежести доступна только для OKX.'};
}
