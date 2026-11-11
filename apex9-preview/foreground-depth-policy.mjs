/**
 * Selected-favorite visible-depth cadence (in-memory; no background service).
 * Pure request scheduler. Never fetches or persists by itself.
 * Each venue has an independent backoff; missing responses are NOT fabricated.
 */
export const FOREGROUND_DEPTH_POLICY=Object.freeze({
 successGapMs:60000,
 rateLimitedGapMs:10*60000,
 accessDeniedGapMs:60*60000,
 notListedGapMs:60*60000,
 clockSkewGapMs:10*60000,
 invalidGapMs:5*60000,
 maxTransientGapMs:10*60000,
 maxAssets:10
});
const VALID_ASSET=/^[A-Z0-9]{5,20}$/;
const VALID_VENUE=new Set(['binance','okx']);
const VALID_RESULT=new Set(['OK','OFFLINE','STALE','INVALID',
 'RATE_LIMITED','ACCESS_DENIED','NOT_LISTED','CLOCK_SKEW']);
export function createForegroundDepthPolicy({now=()=>Date.now()}={}){
 const lanes=new Map();
 const key=(asset,venue)=>asset+':'+venue;
 const valid=(asset,venue)=>VALID_ASSET.test(asset)&&VALID_VENUE.has(venue);
 function allowed(asset,venue,{visible=false,favorite=false,native=false,busy=false}={}){
  if(!valid(asset,venue))return {allowed:false,reason:'INVALID'};
  if(!visible||!favorite||!native||busy)
   return {allowed:false,reason:'INACTIVE'};
  const t=now();
  if(!Number.isSafeInteger(t)||t<=0)return {allowed:false,reason:'CLOCK'};
  const nextAt=lanes.get(key(asset,venue))?.nextAt||0;
  return t>=nextAt?{allowed:true,reason:'DUE'}:
   {allowed:false,reason:'COOLDOWN',nextAt};
 }
 function record(asset,venue,status){
  if(!valid(asset,venue)||!VALID_RESULT.has(status))return false;
  const t=now(),k=key(asset,venue);
  if(!Number.isSafeInteger(t)||t<=0)return false;
  const previous=lanes.get(k);
  const failures=status==='OK'?0:Math.min(5,(previous?.failures||0)+1);
  const gap=status==='OK'?FOREGROUND_DEPTH_POLICY.successGapMs:
   status==='RATE_LIMITED'?FOREGROUND_DEPTH_POLICY.rateLimitedGapMs:
   status==='ACCESS_DENIED'?FOREGROUND_DEPTH_POLICY.accessDeniedGapMs:
   status==='NOT_LISTED'?FOREGROUND_DEPTH_POLICY.notListedGapMs:
   status==='CLOCK_SKEW'?FOREGROUND_DEPTH_POLICY.clockSkewGapMs:
   status==='INVALID'?FOREGROUND_DEPTH_POLICY.invalidGapMs:
   Math.min(FOREGROUND_DEPTH_POLICY.maxTransientGapMs,60000*2**failures);
  lanes.delete(k);lanes.set(k,{nextAt:t+gap,failures,status});
  // At most two venue entries for ten selected assets; excess recent assets
  // are removed rather than retaining unbounded in-memory scheduling state.
  while(lanes.size>FOREGROUND_DEPTH_POLICY.maxAssets*2)
   lanes.delete(lanes.keys().next().value);
  return true;
 }
 function removeAsset(asset){
  for(const venue of VALID_VENUE)lanes.delete(key(asset,venue));
 }
 return {allowed,record,removeAsset,policies:FOREGROUND_DEPTH_POLICY};
}
