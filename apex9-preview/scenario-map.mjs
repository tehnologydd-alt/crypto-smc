/**
 * APEX Scenario Map — read-only research overlays derived from immutable Room
 * hypotheses and recorded source-time H1 stages. Never implies orders or fills.
 */
import {inspectResearchTimeline} from './research-timeline.mjs';
const STEP=3600000;
const time=x=>Number.isSafeInteger(x)&&x>0;
const assetOK=x=>typeof x==='string'&&/^[A-Z0-9]{5,20}$/.test(x);
const label={PUBLISHED:'Публикация',CONFIRMED:'H1 №1',
 ACTIVE:'H1 №2',EVALUATED:'Итог H1 №4'};
const priority={ACTIVE:0,CONFIRMED:1,PENDING_CONFIRMATION:2,
 DUE_UNVERIFIED:3,EVALUATED:4,INCONSISTENT_RESULT:5};
export function buildScenarioMap(rows,{asset,selectedIds=[],mode='all',
 now=Date.now(),max=3,focusId=null}={}){
 if(!assetOK(asset)||!Array.isArray(rows)||!time(now)||
  !['all','tracked'].includes(mode)||!Number.isSafeInteger(max)||max<1||max>8)
  return {state:'INVALID',scenarios:[],available:0,totalForAsset:0};
 const selected=new Set(Array.isArray(selectedIds)?selectedIds:[]);
 const eligible=[];
 for(const row of rows){
  if(row?.asset!==asset)continue;
  if(mode==='tracked'&&!selected.has(row.id))continue;
  const trace=inspectResearchTimeline(row,{now});
  if(trace.state==='INVALID')continue;
  eligible.push({
   id:row.id,asset,tracked:selected.has(row.id),
   focused:row.id===focusId,trace,
   stage:trace.state,anchorCloseAt:trace.anchorCloseAt,
   targetCloseAt:trace.targetCloseAt,
   bandLow:trace.bandLow,bandHigh:trace.bandHigh,
   publishedAt:row.publishedAt,
   milestones:trace.steps.filter(s=>s.observed).map(s=>({
    key:s.key,label:label[s.key],observedAt:s.at,
    recordedAt:s.recordedAt
   })),
   result:trace.result||null
  });
 }
 eligible.sort((a,b)=>
  Number(b.focused)-Number(a.focused)||
  Number(b.tracked)-Number(a.tracked)||
  (priority[a.stage]??9)-(priority[b.stage]??9)||
  b.publishedAt-a.publishedAt);
 return {state:eligible.length?'OBSERVED':'EMPTY',asset,mode,
  totalForAsset:rows.filter(r=>r?.asset===asset).length,
  available:eligible.length,scenarios:eligible.slice(0,max),
  hidden:Math.max(0,eligible.length-max)};
}
/**
 * Map only FINISHED 1-hour candles already present in the viewport. An
 * envelope is painted across actual consecutive observations, stopping at
 * latest completed bar; no hypothetical future candles or stage labels.
 * A missing intermediate H1 bar splits the visible region.
 */
export function mapScenarioToViewport(scenario,bars,{interval='1h'}={}){
 if(interval!=='1h'||!Array.isArray(bars)||!scenario||
  !time(scenario.anchorCloseAt)||!time(scenario.targetCloseAt)||
  !(scenario.targetCloseAt>scenario.anchorCloseAt)||
  !Number.isFinite(scenario.bandLow)||!Number.isFinite(scenario.bandHigh)||
  !(scenario.bandLow>0&&scenario.bandLow<scenario.bandHigh))
  return {visible:false,segments:[],marks:[]};
 const eligible=[];
 const indexByClose=new Map();
 for(let i=0;i<bars.length;i++){
  const c=bars[i];
  if(c?.closed!==true||!time(c.closeAt)||indexByClose.has(c.closeAt))continue;
  indexByClose.set(c.closeAt,i);
  if(c.closeAt>=scenario.anchorCloseAt&&c.closeAt<=scenario.targetCloseAt)
   eligible.push({index:i,time:c.closeAt});
 }
 if(!eligible.length)return {visible:false,segments:[],marks:[]};
 const segments=[];
 let indices=[];
 for(const c of eligible){
  if(indices.length&&
   (c.index!==indices.at(-1).index+1||c.time-indices.at(-1).time!==STEP)){
   segments.push({from:indices[0].index,to:indices.at(-1).index});
   indices=[];
  }
  indices.push(c);
 }
 if(indices.length)segments.push({from:indices[0].index,to:indices.at(-1).index});
 const marks=[];
 for(const mark of scenario.milestones||[]){
  // Publication is shortly AFTER its last known H1 close. Its anchor is that
  // actual bar, not an invented candle at the HTTP/save timestamp.
  const sourceCloseAt=mark.key==='PUBLISHED'?
   scenario.anchorCloseAt:mark.observedAt;
  const index=indexByClose.get(sourceCloseAt);
  if(!Number.isSafeInteger(index)||sourceCloseAt<scenario.anchorCloseAt||
   sourceCloseAt>scenario.targetCloseAt)continue;
  if(bars[index]?.closed!==true)continue;
  marks.push({index,key:mark.key,label:mark.label,
   observedAt:mark.observedAt,sourceCloseAt});
 }
 return {visible:true,segments,marks,
  from:eligible[0].index,to:eligible.at(-1).index};
}
