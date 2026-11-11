/**
 * APEX Clean Chart: presentation-only scenario selection.
 * Never changes immutable Research Room records, outcomes or evidence.
 * A scenario remains invisible until a user explicitly selects its ID.
 */
export const CLEAN_CHART_VERSION='APEX_CLEAN_CHART_SELECTED_V1';
const TFS=new Set(['1m','15m','1h','4h']);
const finite=x=>typeof x==='number'&&Number.isFinite(x);
export function visibleChartScenarios(scenarios,{
 selectedId=null,interval='1h'
}={}){
 if(typeof selectedId!=='string'||!selectedId||!TFS.has(interval)||
  !Array.isArray(scenarios))return [];
 const match=scenarios.find(s=>s?.id===selectedId&&
  (s.sourceInterval===interval||
   (interval==='1m'&&s.evaluationInterval==='1m'))&&
  finite(s.bandLow)&&finite(s.bandHigh)&&
  s.bandLow>0&&s.bandHigh>s.bandLow);
 return match?[{...match,focused:true}]:[];
}
export function compactScenarioDetails(scenario){
 if(!scenario||typeof scenario.id!=='string')return null;
 const level=scenario.levels;
 if(!level||!['DIRECTIONAL','MULTIFRAME'].includes(scenario.model))
  return {id:scenario.id,kind:'RANGE',rows:[
   ['Нижняя граница',scenario.bandLow],
   ['Верхняя граница',scenario.bandHigh]],
   direction:null,stage:scenario.stage,finished:scenario.stage==='EVALUATED',
   riskReward:null};
 if(![level.entry,level.sl,level.tp1,level.tp2,level.tp3].every(
  x=>finite(x)&&x>0))return null;
 const dir=scenario.side==='UP'?'UP':scenario.side==='DOWN'?'DOWN':null;
 const risk=dir?Math.abs(level.entry-level.sl):0;
 const orientationValid=dir==='UP'?level.sl<level.entry&&
  [level.tp1,level.tp2,level.tp3].every(x=>x>level.entry):
 dir==='DOWN'?level.sl>level.entry&&
  [level.tp1,level.tp2,level.tp3].every(x=>x<level.entry):false;
 const rr=orientationValid&&risk>0?
  [level.tp1,level.tp2,level.tp3].map(x=>
   Number((Math.abs(x-level.entry)/risk).toFixed(2))):null;
 return {id:scenario.id,kind:'LEVELS',rows:[
  ['E',level.entry],['SL',level.sl],
  ['T1',level.tp1],['T2',level.tp2],['T3',level.tp3]],
  direction:dir,stage:scenario.stage,
  finished:scenario.stage==='EVALUATED',riskReward:rr,
  sourceInterval:scenario.sourceInterval,
  evaluationInterval:scenario.evaluationInterval||null};
}
/** An overlay label belongs to a zone group, not each dashed segment.
 * Nearby same-type labels are combined, leaving the candlesticks readable.
 */
export function groupOrderBlockLabels(items,{minGapPx=14}={}){
 if(!Array.isArray(items)||items.length>12)return [];
 const groups=[];
 for(const x of items){
  if(!x||!['DEMAND','SUPPLY'].includes(x.kind)||
   !finite(x.y)||!finite(x.x))continue;
  const found=groups.find(g=>g.kind===x.kind&&
   Math.abs(g.y-x.y)<minGapPx);
  if(found){found.count++;found.x=Math.min(found.x,x.x);}
  else groups.push({kind:x.kind,x:x.x,y:x.y,count:1});
 }
 return groups;
}
