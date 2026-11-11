import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {saveSourceCohortSummary,readSourceCohortSummary,
 sourceCohortCacheHealth,SOURCE_COHORT_CACHE_LIMIT}
 from './source-cohort-summary.mjs';

const KEY='apex9:source-cohort-summary:v4',NOW=Date.UTC(2026,11,1);
const archive=()=>({complete:true,publishedCount:0,forecasts:[]});
const mem=()=>{
 const rows=new Map();
 return {getItem:key=>rows.get(key)||null,
  setItem:(key,value)=>rows.set(key,String(value))};
};
const byteSize=s=>new TextEncoder().encode(s).length;
const asset=n=>'TOKEN'+String(n).padStart(2,'0')+'USDT';
const save=(storage,id,at=NOW)=>
 saveSourceCohortSummary(archive(),id,{storage,now:at});

test('empty verified archive has explicit zero feed slots, not fabricated failures',()=>{
 const storage=mem(),id=asset(1);
 assert.equal(save(storage,id),true);
 const report=readSourceCohortSummary(id,{storage,now:NOW});
 assert.ok(report);
 for(const tf of ['15m','1h','4h']){
  assert.deepEqual(report.frames[tf].feedSummary,{
   observed:0,stale:0,missing:0});
  assert.equal(report.frames[tf].sourceLegacy,0);
  assert.equal(report.frames[tf].verifiedSources,0);
  assert.equal(report.frames[tf].providerResearch.required,48);
 }
 assert.equal(sourceCohortCacheHealth({storage}).state,'STORED');
 assert.ok(sourceCohortCacheHealth({storage}).bytes<=SOURCE_COHORT_CACHE_LIMIT);
});
test('up to ten assets are kept with a finite local-only cache footprint',()=>{
 const storage=mem();
 for(let i=0;i<10;i++)assert.equal(save(storage,asset(i),NOW+i),true);
 const root=JSON.parse(storage.getItem(KEY));
 assert.equal(Object.keys(root.summaries).length,10);
 for(let i=0;i<10;i++)assert.ok(readSourceCohortSummary(asset(i),{
  storage,now:NOW+20}));
 assert.equal(byteSize(storage.getItem(KEY)),
  sourceCohortCacheHealth({storage}).bytes);
});
test('oldest summary is evicted under byte pressure; current asset preserved',()=>{
 const storage=mem();
 assert.ok(save(storage,asset(0),NOW));
 assert.ok(save(storage,asset(1),NOW+1));
 const original=JSON.parse(storage.getItem(KEY));
 // Simulate version-compatible legacy descriptive text without raw price data.
 const current=byteSize(storage.getItem(KEY));
 const filler=SOURCE_COHORT_CACHE_LIMIT-current-1024;
 assert.ok(filler>1000);
 original.summaries[asset(0)].legacyDescription='x'.repeat(filler);
 storage.setItem(KEY,JSON.stringify(original));
 assert.ok(byteSize(storage.getItem(KEY))<SOURCE_COHORT_CACHE_LIMIT);
 assert.equal(save(storage,asset(2),NOW+2),true);
 const root=JSON.parse(storage.getItem(KEY));
 assert.ok(root.summaries[asset(2)]);
 assert.equal(root.summaries[asset(0)],undefined);
 assert.ok(root.summaries[asset(1)]);
 assert.ok(readSourceCohortSummary(asset(2),{storage,now:NOW+10}));
 assert.ok(sourceCohortCacheHealth({storage}).bytes<=SOURCE_COHORT_CACHE_LIMIT);
});
test('read remains compatible with older v4 summaries without new counters',()=>{
 const storage=mem(),id=asset(0);
 assert.ok(save(storage,id));
 const old=JSON.parse(storage.getItem(KEY));
 for(const f of Object.values(old.summaries[id].frames))
  delete f.feedSummary;
 storage.setItem(KEY,JSON.stringify(old));
 const loaded=readSourceCohortSummary(id,{storage,now:NOW});
 assert.ok(loaded);
 assert.equal(loaded.frames['15m'].feedSummary,undefined);
});
test('invalid or unavailable local cache never invents availability',()=>{
 const storage=mem(),id=asset(0);
 assert.ok(save(storage,id));
 const raw=storage.getItem(KEY);
 storage.setItem(KEY,raw+'x'.repeat(SOURCE_COHORT_CACHE_LIMIT));
 assert.equal(readSourceCohortSummary(id,{storage,now:NOW}),null);
 assert.equal(sourceCohortCacheHealth({storage}).state,'OVER_LIMIT');
 const denied={getItem:()=>{throw Error('offline')},
  setItem:()=>{throw Error('denied')}};
 assert.equal(save(denied,id),false);
 assert.equal(sourceCohortCacheHealth({storage:denied}).state,'UNAVAILABLE');
});
test('stage 5 displays per-feed states and coalesces DOM updates without polling',()=>{
 const ui=readFileSync(new URL('./free-source-dashboard.mjs',import.meta.url),'utf8');
 const store=readFileSync(new URL('./source-cohort-summary.mjs',import.meta.url),'utf8');
 const auto=readFileSync(new URL('./automatic-decision-quality.mjs',import.meta.url),'utf8');
 const html=readFileSync(new URL('./index.html',import.meta.url),'utf8');
 assert.ok(ui.includes("document.createDocumentFragment()"));
 assert.ok(ui.includes("lastReliabilityFingerprint=fingerprint"));
 assert.ok(ui.includes("lab.dataset.sourcePanelKey=frame+':value'"));
 assert.ok(ui.includes("OBSERVED '+feed.observed"));
 assert.ok(ui.includes("sourceCohortCacheHealth({storage})"));
 assert.ok(html.includes('id="api-reliability-list"'));
 assert.ok(store.includes('utf8')===false); // Browser-native TextEncoder, no file I/O.
 assert.equal(store.includes('fetch('),false);
 assert.equal(store.includes('setInterval('),false);
 assert.ok(auto.includes('saveSourceCohortSummary(archive,asset'));
 assert.ok(auto.includes('favoritesOf(getFavorites())'));
});
