/**
 * APEX Cross-Asset Research — retrospective, same-clock H1 market regimes.
 *
 * Fixed universe BTC/ETH/SOL. Requires two or three complete, genuine
 * per-asset H1 Room archives. No imputation, synthetic records, auto-trading,
 * fitted thresholds or cross-asset forecast claims.
 */
import {analyzeResearchRegimes,REGIME_TYPES,REGIME_RULES} from './research-regimes.mjs';

export const CROSS_ASSETS=Object.freeze(['BTCUSDT','ETHUSDT','SOLUSDT']);
export const CROSS_RULES=Object.freeze({
 maxAssets:3,minComparableAssets:2,minMatchedWindows:144,
 interval:'1h',stepHours:4,folds:3,
 minOriginPairsForRate:15,
 source:'LOCAL_ROOM_CLOSED_H1',sourcePolicy:'NO_IMPUTATION',
 timing:'IDENTICAL_H1_ANCHORS'
});
export const CROSS_NOTE=
 'Сравниваются одинаковые исторические H1-часы без подмены данных. '+
 'Активы крипторынка могут двигаться вместе из-за общих факторов: '+ 
 'сходство между монетами не является независимой проверкой закономерности. '+
 'Частоты, совпадения и переходы описывают прошлое, не прогнозируют цены. '+
 'Классификация основана на 40 предыдущих закрытых H1-свечах, а новая '+
 'метка перехода появляется лишь после следующего четырёхчасового шага.';
const validTime=x=>Number.isSafeInteger(x)&&x>0;
const round=x=>Math.round(x*1e9)/1e9;
function empty(state,reason,statuses=[]){
 return {state,reason,assets:[],statuses,partial:true,
  commonStart:null,commonEnd:null,matchedWindows:0,folds:[],
  rows:[],pairs:[],note:CROSS_NOTE,rules:CROSS_RULES};
}
const tally=(windows,field,mode)=>windows.filter(x=>x[field]===mode).length;
function modeCounts(windows){
 return Object.fromEntries(REGIME_TYPES.map(x=>[x.id,tally(windows,'mode',x.id)]));
}
function pairsFor(windows){
 const items=[];
 for(let i=1;i<windows.length;i++){
  const a=windows[i-1],b=windows[i];
  if(b.anchorAt!==a.anchorAt+4*3600000)return null;
  items.push({from:a.mode,to:b.mode});
 }
 return items;
}
function groupSummary(asset,windows,groups){
 const pairs=pairsFor(windows);
 if(!pairs)return null;
 const modes=REGIME_TYPES.map(m=>{
  const count=tally(windows,'mode',m.id);
  const origin=pairs.filter(x=>x.from===m.id);
  const stayed=origin.filter(x=>x.to===m.id).length;
  return {id:m.id,label:m.label,count,share:count/windows.length,
   transitions:origin.length,stayed,
   persistenceShare:origin.length>=CROSS_RULES.minOriginPairsForRate?
    stayed/origin.length:null};
 });
 return {asset,samples:windows.length,
  firstAt:windows[0].anchorAt,lastAt:windows.at(-1).anchorAt,
  modes,totalTransitions:pairs.length,periodCounts:groups.map(part=>({
   samples:part.length,counts:modeCounts(part)
  }))};
}
/**
 * records: [{asset, candles, archiveComplete, native, error}]
 * Fixed three-asset universe, but 2 validated sources may be compared with
 * the third explicitly identified as excluded. Never silently omit an input.
 */
export function analyzeCrossAssetRegimes(records,{now=Date.now()}={}){
 if(!Array.isArray(records)||records.length!==CROSS_ASSETS.length||
  !validTime(now)||new Set(records.map(x=>x?.asset)).size!==3||
  records.some((x,i)=>x?.asset!==CROSS_ASSETS[i]))
  return empty('INVALID','Нарушен фиксированный состав BTC/ETH/SOL');
 const statuses=[],valid=[];
 for(const item of records){
  if(item.native!==true||item.error){
   statuses.push({asset:item.asset,state:'EXCLUDED',
    reason:item.error||'Недоступен локальный Android-архив',closedBars:0});
   continue;
  }
  const report=analyzeResearchRegimes(item.candles,{
   asset:item.asset,archiveComplete:item.archiveComplete===true,now
  });
  if(report.state!=='DESCRIPTIVE'){
   statuses.push({asset:item.asset,state:'EXCLUDED',
    reason:report.reason||'Не прошла проверка закрытых H1-свечей',
    closedBars:report.closedBars});
   continue;
  }
  statuses.push({asset:item.asset,state:'VERIFIED',reason:null,
   closedBars:item.candles.length});
  valid.push(item);
 }
 if(valid.length<CROSS_RULES.minComparableAssets)
  return empty('INSUFFICIENT',
   'Для сравнения нужны хотя бы два полных проверенных архива H1',statuses);
 const commonStart=Math.max(...valid.map(x=>x.candles[0].t));
 const commonEnd=Math.min(...valid.map(x=>x.candles.at(-1).t));
 if(!validTime(commonStart)||!validTime(commonEnd)||commonEnd<=commonStart)
  return empty('NO_OVERLAP',
   'У выбранных архивов нет общего полного исторического участка H1',statuses);
 const aligned=valid.map(x=>({
  asset:x.asset,
  candles:x.candles.filter(c=>c.t>=commonStart&&c.t<=commonEnd)
 }));
 if(aligned.some(x=>x.candles.length===0))
  return empty('NO_OVERLAP','Общая история не содержит H1-свечей',statuses);
 const expectedCount=(commonEnd-commonStart)/3600000+1;
 if(!Number.isSafeInteger(expectedCount)||expectedCount>REGIME_RULES.maxBars||
  aligned.some(x=>x.candles.length!==expectedCount||
   x.candles[0].t!==commonStart||x.candles.at(-1).t!==commonEnd))
  return empty('MISALIGNED',
   'У активов не совпадает полный набор H1-часов; сравнение запрещено',statuses);
 const reportList=aligned.map(item=>({
  asset:item.asset,
  report:analyzeResearchRegimes(item.candles,{
   asset:item.asset,archiveComplete:true,now
  })
 }));
 if(reportList.some(x=>x.report.state!=='DESCRIPTIVE'))
  return empty('MISALIGNED',
   'Не удалось независимо проверить общий исторический участок',statuses);
 const sample=reportList[0].report.windows;
 if(sample.length<CROSS_RULES.minMatchedWindows)
  return empty('INSUFFICIENT',
   'Для Cross-Asset нужно не менее '+CROSS_RULES.minMatchedWindows+
   ' одинаковых четырёхчасовых окон',statuses);
 if(reportList.some(x=>x.report.windows.length!==sample.length||
  x.report.windows.some((w,i)=>w.anchorAt!==sample[i].anchorAt||
   w.targetAt!==sample[i].targetAt)))
  return empty('MISALIGNED',
   'Временные границы классификации разных активов не совпадают',statuses);
 const count=sample.length,foldSize=Math.floor(count/CROSS_RULES.folds);
 const folds=Array.from({length:CROSS_RULES.folds},(_,i)=>{
  const a=i*foldSize,b=i===2?count:(i+1)*foldSize;
  return {label:['Ранний','Средний','Поздний'][i],
   start:a,end:b,count:b-a,
   firstAt:sample[a].anchorAt,lastAt:sample[b-1].anchorAt};
 });
 const rows=[];
 for(const item of reportList){
  const windows=item.report.windows;
  const groups=folds.map(f=>windows.slice(f.start,f.end));
  const row=groupSummary(item.asset,windows,groups);
  if(!row)return empty('MISALIGNED','Повреждены исторические переходы',statuses);
  rows.push(row);
 }
 const pairs=[];
 for(let i=0;i<reportList.length;i++){
  for(let j=i+1;j<reportList.length;j++){
   const first=reportList[i],second=reportList[j];
   const agreements=folds.map(f=>{
    let matches=0;
    for(let k=f.start;k<f.end;k++)
     if(first.report.windows[k].mode===second.report.windows[k].mode)matches++;
    return {label:f.label,samples:f.count,matches,share:round(matches/f.count)};
   });
   pairs.push({a:first.asset,b:second.asset,
    samples:count,matches:agreements.reduce((s,g)=>s+g.matches,0),
    sameModeShare:round(agreements.reduce((s,g)=>s+g.matches,0)/count),
    folds:agreements});
  }
 }
 return {state:'DESCRIPTIVE',reason:null,
  assets:valid.map(x=>x.asset),statuses,
  partial:valid.length!==CROSS_ASSETS.length,
  commonStart,commonEnd,matchedWindows:count,
  folds:folds.map(({start,end,...rest})=>rest),
  rows,pairs,note:CROSS_NOTE,rules:CROSS_RULES};
}
