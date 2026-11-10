/**
 * Single source of truth for the visible Scenario journal and counters.
 * Do not mix archived directionless V1, stale selections or the full Room
 * count into live directional stages. No results are inferred or rewritten.
 */
import {forecastStage,journalCounts,FORECAST_STAGES} from './favorite-logic.mjs';
import {directionalHypothesis} from './directional-scenario.mjs';
import {multiFrameHypothesis} from './forecast-multiframe.mjs';

const stageOrder=['PENDING_CONFIRMATION','CONFIRMED','ACTIVE','COMPLETED'];
/**
 * "All" remains fast: last 75. "Marked" adds exact, older Room rows,
 * preferring the fresh exact-ID record on duplicate IDs, never duplicates.
 */
export function scenarioJournalRows(recent,bookmarked,{mode='all'}={}){
 const latest=Array.isArray(recent)?recent:[];
 if(mode!=='tracked')return latest;
 const byId=new Map();
 for(const row of [...latest,...(Array.isArray(bookmarked)?bookmarked:[])]){
  if(row&&typeof row.id==='string')byId.set(row.id,row);
 }
 return [...byId.values()].sort((a,b)=>
  (b.publishedAt||0)-(a.publishedAt||0)||b.id.localeCompare(a.id));
}

export function scenarioJournalState(rows,{
 selectedIds=[],mode='all',stage='PENDING_CONFIRMATION',now=Date.now()
}={}){
 const all=Array.isArray(rows)?rows:[];
 const marked=new Set(selectedIds);
 const isTracked=mode==='tracked';
 // A visible stage card must also be eligible to appear in this journal.
 const scenarios=all.filter(row=>Boolean(directionalHypothesis(row)||
  multiFrameHypothesis(row)));
 const scoped=isTracked?scenarios.filter(row=>marked.has(row.id)):scenarios;
 const stages=journalCounts(scoped,{now});
 const visible=scoped.filter(row=>forecastStage(row,{now})===stage);
 // When viewing saved records, the legacy archive must remain accessible
 // regardless of the active directed stage tab (which it never contributes to).
 const archive=all.filter(row=>!directionalHypothesis(row)&&
  !multiFrameHypothesis(row)&&(!isTracked||marked.has(row.id))&&
  (isTracked||forecastStage(row,{now})===stage));
 const preferred=stageOrder.find(key=>stages[key]>0)||stageOrder[0];
 const inWork=stages.PENDING_CONFIRMATION+stages.CONFIRMED+stages.ACTIVE;
 return {scenarios:scoped,visible,archive,counts:stages,
  inWork,completed:stages.COMPLETED,
  preferred,chosen:stage,mode,
  markedLoaded:scenarios.filter(row=>marked.has(row.id)).length,
  loaded:all.length,unavailableMarked:[...marked].filter(key=>
   !all.some(row=>row?.id===key)).length};
}
