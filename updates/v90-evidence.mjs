/**
 * APEX 9.0 — multi-source evidence normalization and conservative fusion.
 * No live APIs, trade decisions, forecasts, personal information or account access.
 * Input must come from separately validated adapters. Output is NOT a probability.
 *
 * @typedef {'market'|'liquidity'|'onchain'|'news'|'social'|'macro'|'cross_asset'} EvidenceLayer
 * @typedef {'UPWARD_CONTEXT'|'DOWNWARD_CONTEXT'|'MIXED'|'INSUFFICIENT'} EvidenceAssessment
 * @typedef {{
 *   id:string, asset:string, layer:EvidenceLayer, source:string, sourceGroup:string,
 *   observedAt:number, ingestedAt:number, polarity:-1|0|1,
 *   intensity:number, reliability:number, ttlMs?:number,
 *   note?:string, reference?:string
 * }} EvidenceRecord
 */
export const EVIDENCE_LAYERS=Object.freeze([
 'market','liquidity','onchain','news','social','macro','cross_asset'
]);
export const DEFAULT_TTL_MS=Object.freeze({
 market:120000, liquidity:300000, onchain:3600000,
 news:21600000, social:3600000, macro:86400000, cross_asset:300000
});
const finite=(x)=>typeof x==='number'&&Number.isFinite(x);
const bounded=(x)=>finite(x)&&x>=0&&x<=1;
const maxSkewMs=60000;
const cleanKey=(x)=>typeof x==='string'?x.trim().toUpperCase():'';
const layerSet=new Set(EVIDENCE_LAYERS);

/** Validation deliberately rejects unverified timestamps and unsupported layers. */
export function validateEvidence(record,nowMs){
 if(!record||typeof record!=='object'||!finite(nowMs))return 'invalid';
 if(typeof record.id!=='string'||!record.id.trim()||
    !cleanKey(record.asset)||!layerSet.has(record.layer)||
    typeof record.source!=='string'||!record.source.trim()||
    typeof record.sourceGroup!=='string'||!record.sourceGroup.trim())return 'invalid';
 if(!finite(record.observedAt)||!finite(record.ingestedAt)||
    record.observedAt>nowMs+maxSkewMs||record.ingestedAt>nowMs+maxSkewMs||
    record.ingestedAt<record.observedAt)return 'invalid';
 if(record.polarity!==-1&&record.polarity!==0&&record.polarity!==1)return 'invalid';
 if(!bounded(record.intensity)||!bounded(record.reliability))return 'invalid';
 const ttl=record.ttlMs===undefined?DEFAULT_TTL_MS[record.layer]:record.ttlMs;
 if(!finite(ttl)||ttl<=0||ttl>604800000)return 'invalid';
 if(nowMs-record.observedAt>ttl)return 'stale';
 return null;
}

/**
 * Groups repeated events and correlated sources, then caps influence per layer.
 * The score is a descriptive context balance [-1,+1], not a calibrated
 * probability or a buy/sell signal. Missing data stays missing.
 * @param {EvidenceRecord[]} records
 * @param {string} asset
 * @param {number} nowMs
 */
export function summarizeEvidence(records,asset,nowMs=Date.now()){
 const requested=cleanKey(asset);
 const dropped={invalid:0,stale:0,otherAsset:0,duplicate:0};
 /** @type {Map<string,EvidenceRecord>} */
 const unique=new Map();
 if(!Array.isArray(records)||!requested||!finite(nowMs)){
  return {asset:requested,assessment:'INSUFFICIENT',contextBalance:null,
   coveredLayers:[],missingLayers:[...EVIDENCE_LAYERS],evidence:[],dropped,
   contradictingLayers:[],isCalibratedProbability:false};
 }
 // Stable choice across reorderings: newer timestamp and then record id wins.
 const ordered=[...records].sort((a,b)=>{
  const ta=finite(a?.observedAt)?a.observedAt:-Infinity;
  const tb=finite(b?.observedAt)?b.observedAt:-Infinity;
  return tb-ta||String(a?.id??'').localeCompare(String(b?.id??''));
 });
 const ids=new Set();
 for(const item of ordered){
  if(cleanKey(item?.asset)!==requested){dropped.otherAsset++;continue;}
  const problem=validateEvidence(item,nowMs);
  if(problem){dropped[problem]++;continue;}
  // An event can be reported by multiple sources. Count each ID once.
  if(ids.has(item.id)){dropped.duplicate++;continue;}
  ids.add(item.id);
  // Repeated posts from a common origin should not amplify the signal.
  const key=item.layer+'|'+item.sourceGroup.trim().toLowerCase();
  if(unique.has(key)){dropped.duplicate++;continue;}
  unique.set(key,item);
 }
 const buckets=new Map(EVIDENCE_LAYERS.map(l=>[l,[]]));
 const evidence=[...unique.values()].map(item=>{
  const ttl=item.ttlMs===undefined?DEFAULT_TTL_MS[item.layer]:item.ttlMs;
  const age=Math.max(0,nowMs-item.observedAt);
  const freshness=Math.max(0,1-age/ttl);
  const weight=item.reliability*freshness;
  const score=item.polarity*item.intensity;
  const row={id:item.id,layer:item.layer,source:item.source,observedAt:item.observedAt,
   polarity:item.polarity,intensity:item.intensity,reliability:item.reliability,
   freshness,reference:typeof item.reference==='string'?item.reference:null};
  buckets.get(item.layer).push({score,weight,row});
  return row;
 });
 const coveredLayers=[],contradictingLayers=[],balances=[];
 for(const layer of EVIDENCE_LAYERS){
  const bucket=buckets.get(layer);
  if(!bucket.length)continue;
  coveredLayers.push(layer);
  let weighted=0,totalWeight=0,positive=false,negative=false;
  for(const entry of bucket){
   weighted+=entry.score*entry.weight;totalWeight+=entry.weight;
   if(entry.score>0)positive=true;
   if(entry.score<0)negative=true;
  }
  if(positive&&negative)contradictingLayers.push(layer);
  if(totalWeight>0)balances.push(weighted/totalWeight);
 }
 const missingLayers=EVIDENCE_LAYERS.filter(x=>!coveredLayers.includes(x));
 const contextBalance=balances.length?balances.reduce((a,b)=>a+b,0)/balances.length:null;
 const hasUp=balances.some(x=>x>0.1),hasDown=balances.some(x=>x< -0.1);
 let assessment='INSUFFICIENT';
 if(coveredLayers.length>=3&&balances.length>=3){
  if(hasUp&&hasDown)assessment='MIXED';
  else if(contextBalance>=0.25)assessment='UPWARD_CONTEXT';
  else if(contextBalance<=-0.25)assessment='DOWNWARD_CONTEXT';
  else assessment='MIXED';
 }
 return {asset:requested,assessment,contextBalance,
  coveredLayers,missingLayers,evidence,dropped,contradictingLayers,
  isCalibratedProbability:false};
}
