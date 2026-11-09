import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=filename=>readFileSync(new URL(filename,import.meta.url),'utf8');
const html=read('./index.html');
const app=read('./app.mjs');
const css=read('./styles.css');
function segment(start,end){
 const a=html.indexOf(start),b=html.indexOf(end,a);
 assert.ok(a>=0&&b>a,start);
 return html.slice(a,b);
}
test('five primary destinations include a direct research screen',()=>{
 const dock=segment('<nav class="tabs bottom-dock"','</nav>');
 const tabs=[...dock.matchAll(/data-tab="([^"]+)"/g)].map(x=>x[1]);
 assert.deepEqual(tabs,['overview','asset','forecasts','quality','sources']);
 assert.equal(tabs.filter(x=>x==='quality').length,1);
 assert.ok(app.includes('tab.dataset.tab===activeDock(view)'));
 assert.ok(css.includes('grid-template-columns:repeat(5,minmax(0,1fr))'));
});
test('asset has three one-level sections and every original card remains',()=>{
 const section=segment('id="view-asset"','id="view-forecasts"');
 assert.deepEqual([...section.matchAll(/data-asset-area-button="([^"]+)"/g)]
  .map(x=>x[1]),['chart','structure','data']);
 assert.equal((section.match(/data-asset-pane="chart"/g)||[]).length,2);
 assert.equal((section.match(/data-asset-pane="structure"/g)||[]).length,3);
 assert.equal((section.match(/data-asset-pane="data"/g)||[]).length,4);
 const articles=[...section.matchAll(/<article class="card block[^>]+>/g)];
 assert.equal(articles.length,9);
 assert.ok(articles.every(x=>/data-asset-pane="(chart|structure|data)"/.test(x[0])));
 assert.ok(section.indexOf('class="card block candle-panel"')<
  section.indexOf('class="card block asset-scenarios"'));
 assert.ok(section.includes('id="asset-workspace-anchor"'));
});
test('research area presents five mutually-exclusive direct tasks',()=>{
 const section=segment('id="view-quality"','id="view-news"');
 const sections=[...section.matchAll(/data-quality-area-button="([^"]+)"/g)].map(x=>x[1]);
 assert.deepEqual(sections,['summary','data','tests','regimes','compare']);
 assert.ok(section.includes('id="quality-workspace-anchor"'));
 assert.ok(section.includes('data-quality-area="summary"'));
 assert.ok(app.includes('setQualityArea(researchAreaForTarget(targetId))'));
 for(const item of sections)
  assert.ok(css.includes('data-quality-area="'+item+'"'),item);
});
test('one visible source selector is shared across all research tasks',()=>{
 assert.equal(html.split('id="evidence-asset"').length-1,1);
 const head=segment('id="view-quality"','id="evidence-lab-panel"');
 assert.ok(head.includes('id="evidence-asset"'));
 assert.ok(head.includes('Актив для аудита и исследований'));
});
test('data integrity and research modules remain present exactly once',()=>{
 for(const id of ['evidence-lab-panel','validation-run','patterns-run',
  'regimes-run','cross-run','synthesis-run','synthesis-brief'])
  assert.equal(html.split('id="'+id+'"').length-1,1,id);
 assert.ok(css.includes('#view-asset > [data-asset-pane]{display:none!important}'));
 assert.ok(css.includes('.quality-view #evidence-lab-panel > *{display:none!important}'));
 assert.ok(app.includes('researchSynthesisDashboard.openForAsset(route.asset)'));
});
test('contextual explanation always opens a visible research summary',()=>{
 assert.ok(app.includes('setQualityArea(researchAreaForTarget(targetId))'));
 assert.ok(app.includes("el('view-quality').dataset.qualityEntry"));
 assert.ok(css.includes('data-quality-entry="dock"'));
 assert.ok(app.includes("button.setAttribute('aria-pressed',String(active))"));
});

test('contextual research entry keeps direct task selector visible',()=>{
 assert.ok(app.includes("view==='quality'&&targetId?"));
 assert.ok(app.includes("el('quality-workspace-anchor')"));
 assert.ok(html.includes('id="quality-workspace-anchor"'));
});
