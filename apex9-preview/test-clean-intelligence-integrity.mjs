import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 canRenderView,createScreenUpdateCoordinator,observeSourceUpdates,getRenderMetrics
} from './clean-intelligence-render-governor.mjs';
import {auditMountedScreens,auditTargets}
 from './clean-intelligence-ui-audit.mjs';
const read=name=>readFileSync(new URL(name,import.meta.url),'utf8');

test('governor distinguishes inactive tab, background app and asset area',()=>{
 assert.equal(canRenderView({}),true);
 assert.equal(canRenderView({pageHidden:true}),false);
 assert.equal(canRenderView({documentHidden:true}),false);
 assert.equal(canRenderView({expectedArea:'chart',currentArea:'data'}),false);
 assert.equal(canRenderView({expectedArea:'chart',currentArea:'chart'}),true);
 assert.equal(canRenderView({expectedArea:null,currentArea:'data'}),true);
});
test('source status changes batch into one animation frame and resume on return',()=>{
 const original=globalThis.MutationObserver;
 const watchers=[];
 class FakeObserver{
  constructor(cb){this.cb=cb;this.nodes=[];this.closed=false;watchers.push(this);}
  observe(target,opts){this.nodes.push({target,opts});}
  disconnect(){this.closed=true;}
 }
 globalThis.MutationObserver=FakeObserver;
 try{
  let hidden=true,docHidden=false,renders=0,nextId=0;
  const jobs=new Map();
  const callbacks=new Map();
  const view={
   id:'view-news',
   classList:{contains:key=>key==='hidden'&&hidden},
   dataset:{assetArea:'chart'}
  };
  const doc={
   get hidden(){return docHidden;},
   addEventListener:(name,cb)=>callbacks.set(name,cb),
   removeEventListener:(name,cb)=>{
    if(callbacks.get(name)===cb)callbacks.delete(name);
   }
  };
  const frame=fn=>{const id=++nextId;jobs.set(id,fn);return id;};
  const cancelFrame=id=>jobs.delete(id);
  const flushFrame=()=>{
   const current=[...jobs.values()];jobs.clear();
   current.forEach(fn=>fn());
  };
  const control=createScreenUpdateCoordinator(view,()=>{renders++;},
   {doc,frame,cancelFrame});
  const observe=observeSourceUpdates([{id:'news-source'},{id:'rss-source'}],
   control.schedule);
  assert.equal(observe.count,2);
  assert.equal(watchers.length,2);
  assert.equal(watchers[1].nodes.length,2);
  assert.equal(renders,0);
  control.schedule();
  control.schedule();
  assert.equal(jobs.size,0,'hidden page must not schedule animation');
  hidden=false;watchers[0].cb([]);
  control.schedule();control.schedule();
  assert.equal(jobs.size,1,'rapid source changes coalesce');
  flushFrame();
  assert.equal(renders,1);
  assert.equal(control.stats().coalesced>0,true);
  hidden=true;watchers[0].cb([]);
  control.schedule();
  assert.equal(jobs.size,0);
  hidden=false;watchers[0].cb([]);
  flushFrame();
  assert.equal(renders,2,'hidden changes reconcile on tab return');
  docHidden=true;
  callbacks.get('visibilitychange')();
  assert.equal(jobs.size,0);
  docHidden=false;callbacks.get('visibilitychange')();
  flushFrame();
  assert.equal(renders,3);
  const metrics=getRenderMetrics();
  assert.ok(metrics.some(x=>x.screen==='view-news'&&x.renders===3));
  assert.ok(control.stats().deferrals>=3);
  observe.disconnect();control.dispose();
  assert.equal(callbacks.size,0);
  assert.equal(watchers[0].closed,true);
  assert.equal(watchers[1].closed,true);
  assert.equal(getRenderMetrics().some(x=>x.screen==='view-news'),false);
 }finally{globalThis.MutationObserver=original;}
});
test('asset pane updates do not run in a different pane',()=>{
 const original=globalThis.MutationObserver;
 globalThis.MutationObserver=class{
  constructor(cb){this.cb=cb;}
  observe(){}
  disconnect(){}
 };
 try{
  const view={id:'view-asset',classList:{contains:()=>false},
   dataset:{assetArea:'chart'}};
  const listeners=new Map(),queue=[];
  const doc={hidden:false,addEventListener:(key,cb)=>listeners.set(key,cb),
   removeEventListener:()=>{}};
  let renders=0;
  const c=createScreenUpdateCoordinator(view,()=>renders++,
   {area:'data',doc,frame:fn=>{queue.push(fn);return queue.length;},
    cancelFrame:()=>{}});
  c.schedule();assert.equal(queue.length,0);
  view.dataset.assetArea='data';c.schedule();
  assert.equal(queue.length,1);
  queue.shift()();assert.equal(renders,1);
  c.dispose();
 }finally{globalThis.MutationObserver=original;}
});
test('stage 6 workspaces expose real Room stageboard OUTSIDE collapsed archive',()=>{
 const old=read('./clean-intelligence.mjs');
 const major=read('./clean-intelligence-major.mjs');
 assert.match(old,/archives\.append\(intro\)/);
 assert.match(major,/workspace\.before\(intro,board\)/);
 assert.ok(!major.includes('intro.after(board)'));
 assert.match(major,/board\.append\(stages\)/);
 assert.match(major,/workspace\.append\(advanced\)/);
 assert.ok(!major.includes('replaceChildren(stages)'));
});
test('on-demand audit does not claim success for a stageboard hidden in details',()=>{
 const ids=auditTargets().map(x=>x.id);
 assert.equal(ids.length,8);
 const missing=auditMountedScreens({getElementById:()=>null});
 assert.equal(missing.ok,false);
 assert.equal(missing.mounted,0);
 const complete=auditMountedScreens({getElementById:key=>({
  id:key,parentElement:{id:'view-forecasts'}
 })});
 assert.equal(complete.ok,true);
 assert.equal(complete.mounted,8);
 const bad=auditMountedScreens({getElementById:key=>({
  id:key,parentElement:{id:key==='ci6-stage-board'?'collapsed-archives':'other'}
 })});
 assert.equal(bad.ok,false);
 assert.equal(bad.mounted,7);
});
test('news and macro data are still updated by original APIs but UI is screen-gated',()=>{
 const editorial=read('./clean-intelligence-editorial.mjs');
 const asset=read('./clean-intelligence-asset-hub.mjs');
 const market=read('./clean-intelligence.mjs');
 const major=read('./clean-intelligence-major.mjs');
 assert.match(editorial,/createScreenUpdateCoordinator\(page,render\)/);
 assert.match(editorial,/createScreenUpdateCoordinator\(page,update\)/);
 assert.match(editorial,/observeSourceUpdates\(\[events,\.\.\.Object\.values\(stateTexts\)\]/);
 assert.match(editorial,/sourceState\.state==='UNAVAILABLE'/);
 assert.match(asset,/createScreenUpdateCoordinator\(view,render,\{area\}\)/);
 assert.match(asset,/view:root,area:'chart'/);
 assert.match(asset,/view:root,area:'data'/);
 assert.match(market,/createScreenUpdateCoordinator\(overview,update\)/);
 assert.match(market,/createScreenUpdateCoordinator\(byId\('view-forecasts'\),apply\)/);
 assert.match(major,/createScreenUpdateCoordinator\(root,render\)/);
 assert.ok(!editorial.includes('getMobileResearchForecasts('));
 assert.ok(!asset.includes('fetch('));
});
test('Android includes audited UI without modifying native backup and M1 logic',()=>{
 const p=read('../apex9-android/scripts/prepare-web.mjs');
 for(const x of ['clean-intelligence-render-governor.mjs',
  'clean-intelligence-ui-audit.mjs','clean-intelligence-integrity.css'])
  assert.ok(p.includes("'"+x+"'"),x);
 const app=read('./app.mjs');
 const html=read('./index.html');
 assert.match(app,/initCleanIntelligenceAudit\(\)/);
 assert.ok(html.includes('./clean-intelligence-integrity.css'));
 const skin=read('./clean-intelligence-integrity.css');
 assert.ok(skin.includes('#apex-settings-dialog .ci9-interface-audit'));
 assert.ok(skin.includes('prefers-reduced-motion'));
 assert.ok(app.includes('setMobileSettings({alertScope:requested,alertMarkedIds:ids})'));
 assert.ok(app.includes("el('apex-backup-passphrase')"));
 assert.ok(app.includes('function setAssetArea(requested)'));
});
