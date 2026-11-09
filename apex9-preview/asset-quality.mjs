/**
 * Per-asset descriptive M5 research scoreboard.
 * No invented success rate, no cross-asset rank by profitability,
 * no inclusion of reconstructed H1 studies.
 */
import {directionalQualitySummary} from './forecast-quality.mjs';
import {directionalHypothesis} from './directional-scenario.mjs';
const isAsset=s=>typeof s==='string'&&/^[A-Z0-9]{5,20}$/.test(s);
export function summarizeAssetQuality(rows,{
 now=Date.now(),selectedIds=null,totalLoaded=null,minFinished=12
}={}){
 const accepted=Array.isArray(rows)?rows:[];
 const chosen=selectedIds===null?null:new Set(selectedIds);
 const grouped=new Map();
 for(const row of accepted){
  if(!isAsset(row?.asset)||!directionalHypothesis(row))continue;
  if(chosen&&!chosen.has(row.id))continue;
  const records=grouped.get(row.asset)||[];
  records.push(row);grouped.set(row.asset,records);
 }
 const assets=[...grouped.entries()].map(([symbol,items])=>{
  const q=directionalQualitySummary(items,{now}).all;
  const limited=q.invalid+q.unverified>0||q.finished<minFinished;
  return {symbol,loaded:items.length,...q,
   enoughHistory:!limited,
   note:q.invalid||q.unverified?'Есть записи без достаточной M5-проверки':
    q.finished<minFinished?'Мало завершённых M5 (нужно '+minFinished+')':
    'Только описательные исходы, не оценка вероятности'};
 }).sort((a,b)=>b.finished-a.finished||b.published-a.published||
  a.symbol.localeCompare(b.symbol));
 return {assets,scanned:accepted.length,
  partial:Number.isInteger(totalLoaded)&&totalLoaded>accepted.length,
  note:'TP1–TP3 являются касаниями; SL — исход. Ставки успеха не рассчитаны.'};
}
