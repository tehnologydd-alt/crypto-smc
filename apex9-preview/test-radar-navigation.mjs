import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=x=>readFileSync(new URL(x,import.meta.url),'utf8');
const html=read('./index.html'),app=read('./app.mjs'),
 dashboard=read('./radar-dashboard.mjs'),css=read('./styles.css');
const packager=read('../apex9-android/scripts/prepare-web.mjs');
test('four direct destinations, asset opens from favorites, sources stay in research',()=>{
 const dock=html.slice(html.indexOf('<nav class="tabs bottom-dock"'),
  html.indexOf('</nav>',html.indexOf('<nav class="tabs bottom-dock"')));
 assert.deepEqual([...dock.matchAll(/data-tab="([^"]+)"/g)].map(x=>x[1]),
  ['overview','radar','forecasts','quality']);
 assert.equal(html.split('id="view-radar"').length-1,1);
 assert.equal(html.split('id="view-sources"').length-1,1);
 assert.ok(html.includes('class="ghost quality-sources-link" data-go="sources"'));
 assert.ok(html.includes('data-go="quality" type="button">‹ Исследования'));
 assert.ok(app.includes("for(const name of ['overview','catalog','asset','forecasts','sources','news','macro','quality','radar'])"));
 assert.ok(app.includes("if(view!=='radar')radarDashboard.close();"));
 assert.ok(app.includes("if(view==='radar')radarDashboard.open();"));
 assert.ok(app.includes('radarDashboard.catalogChanged()'));
});
test('radar is dedicated exploration and does not clone other pages',()=>{
 const start=html.indexOf('id="view-radar"');
 const end=html.indexOf('id="view-catalog"',start);
 const radar=html.slice(start,end);
 for(const key of ['radar-title','radar-refresh','radar-sort','radar-coverage',
  'radar-status','radar-results','data-radar-filter="up"','data-radar-frame="4h"'])
  assert.ok(radar.includes(key),key);
 for(const excluded of ['id="favorite-rail"','id="global-context"',
  'id="research-forecast-list"','id="evidence-lab-panel"','id="candle-canvas"'])
  assert.ok(!radar.includes(excluded),excluded);
 assert.ok(dashboard.includes('const batch=candidate.slice(offset,offset+3)'));
 assert.ok(dashboard.includes("if(received.state!=='OK')"));
 assert.ok(dashboard.includes("onOpenAsset(row.symbol)"));
 assert.ok(dashboard.includes('selectRadarAutoFrame(getFavorites(),checkpoints'));
 assert.ok(dashboard.includes('timer=setInterval(autoTick,60000)'));
 assert.ok(dashboard.includes('open(){active=true;syncUi();void syncNative();}'));
 assert.ok(dashboard.includes('active=false'));
 assert.ok(dashboard.includes('createRadarObservation(row,selectedFrame'));
 assert.ok(dashboard.includes('saveRadarChanges(storage,history)'));
 assert.ok(dashboard.includes('compareMarketFrames(frameResults,{asset:symbol})'));
 assert.ok(dashboard.includes("fetchCandles(symbol,frame,{signal:local.signal,limit:64})"));
 assert.ok(html.includes('data-radar-filter="events"'));
 assert.ok(html.includes('id="radar-change-count"'));
 assert.ok(html.includes('class="radar-history-note"'));

 assert.ok(css.includes('.radar-results'));
});
test('radar modules are included in Android package and no IDs are duplicated',()=>{
 for(const name of ['radar-core.mjs','radar-dashboard.mjs'])
  assert.ok(packager.includes("'"+name+"'"),name);
 const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]);
 assert.equal(ids.length,new Set(ids).size);
});
