/**
 * APEX Clean Intelligence: shared UI render governor (Stage 9).
 *
 * Purely a presentation coordinator. It has no fetch, Room, timers,
 * trading logic, or persistence. Schedules at most one render per frame,
 * defers work for hidden Android tabs, and catches up when shown again.
 * The original source DOM keeps receiving new data in the background.
 */
export function canRenderView({pageHidden=false,documentHidden=false,
 expectedArea=null,currentArea=null}={}){
 return !pageHidden&&!documentHidden&&
  (!expectedArea||expectedArea===currentArea);
}
export function createScreenUpdateCoordinator(view,render,{
 area=null,doc=document,frame=requestAnimationFrame,
 cancelFrame=cancelAnimationFrame
}={}){
 if(!view||typeof render!=='function')
  throw new TypeError('A screen and its render callback are required');
 let disposed=false,dirty=false,scheduled=false,frameId=null;
 const counters={renders:0,deferrals:0,coalesced:0,lastMs:0};
 const active=()=>canRenderView({
  pageHidden:view.classList.contains('hidden'),
  documentHidden:Boolean(doc.hidden),
  expectedArea:area,
  currentArea:view.dataset.assetArea||null
 });
 const flush=()=>{
  scheduled=false;frameId=null;
  if(disposed||!dirty)return;
  if(!active()){counters.deferrals++;return;}
  dirty=false;
  const before=typeof performance!=='undefined'?performance.now():0;
  try{render();}finally{
   counters.renders++;
   counters.lastMs=before&&typeof performance!=='undefined'?
    Math.max(0,performance.now()-before):0;
  }
 };
 const schedule=()=>{
  if(disposed)return;
  dirty=true;
  if(!active()){counters.deferrals++;return;}
  if(scheduled){counters.coalesced++;return;}
  scheduled=true;
  frameId=frame(flush);
 };
 const viewObserver=new MutationObserver(schedule);
 viewObserver.observe(view,{attributes:true,
  attributeFilter:['class','data-asset-area']});
 doc.addEventListener('visibilitychange',schedule);
 const dispose=()=>{
  if(disposed)return;
  disposed=true;
  viewObserver.disconnect();
  doc.removeEventListener('visibilitychange',schedule);
  if(scheduled&&frameId!==null)cancelFrame(frameId);
  scheduled=false;frameId=null;
 };
 const stats=()=>({...counters,dirty,scheduled,disposed});
 return {schedule,flush,dispose,stats};
}
export function observeSourceUpdates(nodes,schedule,{
 attributes=false,subtree=true
}={}){
 if(typeof schedule!=='function')throw new TypeError('Missing update callback');
 const watcher=new MutationObserver(schedule);
 let count=0;
 for(const node of nodes||[]){
  if(!node)continue;
  watcher.observe(node,{childList:true,characterData:true,subtree,
   attributes});
  count++;
 }
 return {watcher,count,disconnect:()=>watcher.disconnect()};
}
