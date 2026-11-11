/**
 * As-published source lineage for one COMPLETE Room asset archive.
 * Describes WHICH provider evidence reached immutable forecasts; does NOT
 * claim provider accuracy, causal effect, predictive gain or API availability.
 * Never requests network data, reconstructs missing history or changes models.
 */
import {inspectEvidenceContext,EVIDENCE_FEEDS,EVIDENCE_FRAMES}
 from './forecast-evidence-context.mjs';
import {featureFrameOf} from './forecast-feature-ablation.mjs';
import {verifiedDirectionalEvidence} from './forecast-quality.mjs';
import {multiFrameEvidence} from './forecast-multiframe.mjs';

export const SOURCE_LINEAGE_VERSION='APEX_SOURCE_LINEAGE_V1';
export const SOURCE_LINEAGE_RULES=Object.freeze({
 perAsset:true,completeRoomOnly:true,maxRows:1500,
 frames:Object.freeze(['15m','1h','4h']),
 noRetroactiveAttribution:true,noAutomaticWeights:true,
 noOutcomeDerivedProviderScore:true
});
const assetCode=x=>typeof x==='string'&&/^[A-Z0-9]{5,20}$/.test(x);
const timestamp=x=>Number.isSafeInteger(x)&&x>0;
const counter=()=>({observed:0,stale:0,missing:0});
const feedStats=()=>Object.fromEntries(EVIDENCE_FEEDS.map(f=>[f,counter()]));
const radarStats=()=>Object.fromEntries(EVIDENCE_FRAMES.map(f=>[f,counter()]));
const blankFrame=()=>({published:0,verified:0,legacy:0,invalid:0,
 feeds:feedStats(),radar:radarStats(),providers:{}});
const safeSource=x=>typeof x==='string'&&/^[a-zA-Z0-9:._-]{1,64}$/.test(x)?
 x:'UNIDENTIFIED_DECLARED_SOURCE';
function blocked(state,reason,asset){
 return {version:SOURCE_LINEAGE_VERSION,state,reason,asset,
  frames:null,unclassified:0,rules:SOURCE_LINEAGE_RULES};
}
export function auditPublishedSourceLineage(archive,{asset,now=Date.now()}={}){
 if(!assetCode(asset)||!timestamp(now)||now<0)
  return blocked('INVALID','Неверные границы аудита',asset||null);
 if(archive?.complete!==true||!Array.isArray(archive.forecasts)||
    !Number.isSafeInteger(archive.publishedCount)||
    archive.publishedCount!==archive.forecasts.length||
    archive.forecasts.length>SOURCE_LINEAGE_RULES.maxRows)
  return blocked('INCOMPLETE','Нужен полный ограниченный архив Room',asset);
 const ids=new Set();
 for(const row of archive.forecasts){
  if(row?.asset!==asset||typeof row.id!=='string'||!row.id||
   ids.has(row.id)||!timestamp(row.publishedAt)||
   row.publishedAt>now+60000)
   return blocked('INVALID','Несогласованные или повторяющиеся прогнозы',asset);
  ids.add(row.id);
 }
 const frames=Object.fromEntries(SOURCE_LINEAGE_RULES.frames.map(f=>[f,blankFrame()]));
 let unclassified=0;
 for(const row of archive.forecasts){
  const tf=featureFrameOf(row);
  if(!tf||!frames[tf]){unclassified++;continue;}
  const frame=frames[tf];
  frame.published++;
  const plan=tf==='1h'?verifiedDirectionalEvidence(row,{now}):
   multiFrameEvidence(row,{now});
  if(plan.state!=='OBSERVED'){frame.invalid++;continue;}
  const context=inspectEvidenceContext(row);
  if(context.state==='LEGACY'){frame.legacy++;continue;}
  if(context.state!=='VERIFIED'){frame.invalid++;continue;}
  frame.verified++;
  for(const feed of EVIDENCE_FEEDS){
   const item=context.feeds[feed],state=item.state.toLowerCase();
   frame.feeds[feed][state]++;
   if(item.state==='MISSING')continue;
   const source=safeSource(item.source);
   const key=feed+':'+source;
   const counter=frame.providers[key]||(frame.providers[key]={
    feed,source,observed:0,stale:0});
   counter[state]++;
  }
  for(const tf2 of EVIDENCE_FRAMES){
   const state=context.radar[tf2].state;
   // Radar INVALID is a malformed source record, not missing/offline.
   if(state==='INVALID')continue;
   frame.radar[tf2][state.toLowerCase()]++;
  }
 }
 const ready=Object.values(frames).some(f=>f.verified>0);
 return {version:SOURCE_LINEAGE_VERSION,
  state:ready?'OBSERVED':'COLLECTING',
  reason:ready?'Учтены только источники, зафиксированные при публикации':
   'Пока нет проверенного контекста источников в опубликованных прогнозах',
  asset,archiveRows:archive.forecasts.length,unclassified,
  frames:Object.fromEntries(Object.entries(frames).map(([tf,f])=>[
   tf,{...f,providers:Object.values(f.providers).sort((a,b)=>
    a.feed.localeCompare(b.feed)||a.source.localeCompare(b.source))}
  ])),
  disclaimer:'Это проверяемость происхождения данных в опубликованных прогнозах. '+
   'Не сравнение эффективности источников и не доказательство их влияния.',
  rules:SOURCE_LINEAGE_RULES};
}
