/**
 * APEX task-oriented, flat workspace routing (no nested section stack).
 * Pure state decisions: no DOM globals, storage, network or mutable history.
 */
export const WORKSPACE=Object.freeze({
 asset:Object.freeze(['chart','structure','data']),
 quality:Object.freeze(['summary','data','tests','regimes','compare'])
});
const DEFAULT=Object.freeze({asset:'chart',quality:'summary'});
const TARGET=Object.freeze({
 'synthesis-panel':'summary',
 'forecast-feature-audit':'summary',
 'forecast-multiframe-quality':'summary',
 'evidence-lab-panel':'data',
 'validation-run':'tests',
 'validation-panel':'tests',
 'patterns-panel':'tests',
 'regimes-panel':'regimes',
 'regimes-run':'regimes',
 'cross-title':'compare',
 'cross-run':'compare'
});
export function workspaceArea(view,requested=null){
 if(!Object.prototype.hasOwnProperty.call(WORKSPACE,view))return null;
 return WORKSPACE[view].includes(requested)?requested:DEFAULT[view];
}
/**
 * A dock return restores the user's last direct asset task.
 * An explicit entry from Radar, Forecasts or the catalog wins over history;
 * an unknown deep-link always goes to the chart rather than a stale task.
 */
export function assetAreaForEntry(target=null,lastArea='chart'){
 if(typeof target==='string'&&target.length>0)
  return workspaceArea('asset',target);
 return workspaceArea('asset',lastArea);
}
export function researchAreaForTarget(target){
 return Object.prototype.hasOwnProperty.call(TARGET,target)?
  TARGET[target]:DEFAULT.quality;
}
export function activeDock(view){
 return ['overview','radar','asset','forecasts','quality'].includes(view)?
  view:view==='sources'?'quality':'overview';
}
