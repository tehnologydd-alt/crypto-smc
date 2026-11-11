/**
 * APEX Scenario Map — read-only research overlays derived from immutable Room
 * hypotheses and recorded source-time H1 stages. Never implies orders or fills.
 */
import {inspectResearchTimeline} from './research-timeline.mjs';
import {directionalHypothesis,planDirectionalScenario} from './directional-scenario.mjs';
import {forecastStage} from './favorite-logic.mjs';
import {multiFrameHypothesis,multiFrameEvidence}
 from './forecast-multiframe.mjs';
const STEPS=Object.freeze({'1m':60000,'15m':900000,'1h':3600000,'4h':14400000});
const time=x=>Number.isSafeInteger(x)&&x>0;
const assetOK=x=>typeof x==='string'&&/^[A-Z0-9]{5,20}$/.test(x);
const label={PUBLISHED:'Публикация',CONFIRMED:'H1 №1',
 ACTIVE:'H1 №2',EVALUATED:'Итог H1 №4'};
const priority={ACTIVE:0,CONFIRMED:1,PENDING_CONFIRMATION:2,
 DUE_UNVERIFIED:3,EVALUATED:4,INCONSISTENT_RESULT:5};
export function buildScenarioMap(rows,{asset,selectedIds=[],mode='all',
 now=Date.now(),max=3,focusId=null,interval='1h'}={}){
 if(!assetOK(asset)||!Array.isArray(rows)||!time(now)||
  !STEPS[interval]||!['all','tracked'].includes(mode)||
  !Number.isSafeInteger(max)||max<1||max>8)
  return {state:'INVALID',scenarios:[],available:0,totalForAsset:0};
 const selected=new Set(Array.isArray(selectedIds)?selectedIds:[]);
 const eligible=[];
 for(const row of rows){
  if(row?.asset!==asset)continue;
  if(row?.interval!==interval){
   if(interval!=='1m')continue;
   let h;try{h=typeof row.hypothesis==='string'?
    JSON.parse(row.hypothesis):row.hypothesis;}catch{continue;}
   if(h?.evaluationInterval!=='1m')continue;
  }
  if(mode==='tracked'&&!selected.has(row.id))continue;
  if(multiFrameHypothesis(row)){
   const evidence=multiFrameEvidence(row,{now});
   if(evidence.state!=='OBSERVED')continue;
   const plan=evidence.plan,stage=forecastStage(row);
   const milestones=[{key:'PUBLISHED',label:'Публикация',
    observedAt:row.publishedAt,recordedAt:row.publishedAt}];
   for(const key of ['CONFIRMED','ACTIVE','COMPLETED']){
    const event=evidence.events.get(key);
    if(event&&time(event.observedAt)&&time(event.recordedAt)&&
     event.recordedAt>=event.observedAt)
     milestones.push({key,label:key==='CONFIRMED'?'Касание входа':
      key==='ACTIVE'?'TP1':'Итог исследования',
      observedAt:event.observedAt,recordedAt:event.recordedAt});
   }
   eligible.push({
    id:row.id,asset,sourceInterval:row.interval,
    evaluationInterval:plan.evaluationInterval,
    model:'MULTIFRAME',side:plan.side,
    levels:{entry:plan.entry,tp1:plan.tp1,tp2:plan.tp2,
     tp3:plan.tp3,sl:plan.sl},
    tracked:selected.has(row.id),focused:row.id===focusId,
    stage:evidence.finished?'EVALUATED':stage,
    anchorCloseAt:plan.anchorCloseAt,anchorClose:plan.entry,
    targetCloseAt:plan.targetCloseAt,
    bandLow:Math.min(plan.sl,plan.tp3),
    bandHigh:Math.max(plan.sl,plan.tp3),
    publishedAt:plan.publishedAt,milestones,
    result:row.evaluation||null
   });
   continue;
  }
  if(directionalHypothesis(row)){
   const result=planDirectionalScenario(row,{now});
   if(result.state!=='READY')continue;
   const plan=result.plan;
   const stage=forecastStage(row);
   const milestones=[{key:'PUBLISHED',label:'Публикация',
    observedAt:row.publishedAt,recordedAt:row.publishedAt}];
   for(const event of Array.isArray(row.stageEvents)?row.stageEvents:[]){
    if(!['CONFIRMED','ACTIVE','COMPLETED'].includes(event.stage)||
     !time(event.observedAt)||event.observedAt<=row.publishedAt||
     event.observedAt>plan.targetCloseAt||event.recordedAt<event.observedAt)continue;
    milestones.push({key:event.stage==='COMPLETED'?'EVALUATED':event.stage,
     label:event.stage==='CONFIRMED'?'Касание опорной цены':
      event.stage==='ACTIVE'?'TP1':'Завершено',
     observedAt:event.observedAt,recordedAt:event.recordedAt});
   }
   eligible.push({
    id:row.id,asset,sourceInterval:'1h',
    evaluationInterval:plan.evaluationInterval,model:'DIRECTIONAL',side:plan.side,
    levels:{entry:plan.entry,tp1:plan.tp1,tp2:plan.tp2,
     tp3:plan.tp3,sl:plan.sl},
    tracked:selected.has(row.id),focused:row.id===focusId,
    stage:stage==='COMPLETED'?'EVALUATED':stage,
    anchorCloseAt:plan.anchorCloseAt,anchorClose:plan.entry,
    targetCloseAt:plan.targetCloseAt,
    bandLow:Math.min(plan.sl,plan.tp3),
    bandHigh:Math.max(plan.sl,plan.tp3),
    publishedAt:plan.publishedAt,
    milestones,result:row.evaluation||null
   });
   continue;
  }
  const trace=inspectResearchTimeline(row,{now});
  if(trace.state==='INVALID')continue;
  // The original anchor close is immutable research data. Expose it only
  // after the existing strict hypothesis validator accepted this record.
  let hypothesis;
  try{hypothesis=typeof row.hypothesis==='string'?
   JSON.parse(row.hypothesis):row.hypothesis;}catch{continue;}
  eligible.push({
   id:row.id,asset,sourceInterval:'1h',tracked:selected.has(row.id),
   focused:row.id===focusId,trace,
   stage:trace.state,anchorCloseAt:trace.anchorCloseAt,
   anchorClose:hypothesis.anchorClose,targetCloseAt:trace.targetCloseAt,
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
 return {state:eligible.length?'OBSERVED':'EMPTY',asset,mode,interval,
  totalForAsset:rows.filter(r=>r?.asset===asset&&r?.interval===interval).length,
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
 if(!STEPS[interval]||!Array.isArray(bars)||!scenario||
  (scenario.sourceInterval&&scenario.sourceInterval!==interval&&
   !(interval==='1m'&&scenario.evaluationInterval==='1m'))||
  !time(scenario.anchorCloseAt)||!time(scenario.targetCloseAt)||
  !(scenario.targetCloseAt>scenario.anchorCloseAt)||
  !Number.isFinite(scenario.bandLow)||!Number.isFinite(scenario.bandHigh)||
  !(scenario.bandLow>0&&scenario.bandLow<scenario.bandHigh))
  return {visible:false,segments:[],marks:[]};
 const step=STEPS[interval];
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
   (c.index!==indices.at(-1).index+1||c.time-indices.at(-1).time!==step)){
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
  // A M5 stage appears on the enclosing actual CLOSED M15/H4 candle,
  // not at an invented source-timestamp or on an unfinished candle.
  const sourceCloseAt=mark.key==='PUBLISHED'?
   scenario.anchorCloseAt:
   scenario.model==='MULTIFRAME'&&interval!=='1m'?
    Math.floor(mark.observedAt/step)*step+step-1:
    mark.observedAt;
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
