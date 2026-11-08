import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('./index.html',import.meta.url),'utf8');
const app=readFileSync(new URL('./app.mjs',import.meta.url),'utf8');
const count=s=>html.split(s).length-1;
test('quality laboratory exists exactly once on its own page',()=>{
 assert.equal(count('id="view-quality"'),1);
 assert.equal(count('id="evidence-lab-panel"'),1);
 assert.equal(count('id="validation-run"'),1);
 const begin=html.indexOf('id="view-quality"');
 const end=html.indexOf('id="view-news"',begin);
 const quality=html.slice(begin,end);
 assert.ok(quality.includes('id="evidence-lab-panel"'));
 assert.ok(quality.includes('id="evidence-run"'));
 assert.ok(quality.includes('id="validation-run"'));
 assert.ok(quality.includes('id="regimes-run"'));
 assert.ok(quality.includes('id="regimes-summary"'));
 assert.ok(quality.includes('id="cross-run"'));
 assert.ok(quality.includes('id="cross-cancel"'));
 assert.ok(quality.includes('id="cross-sources"'));
 assert.ok(quality.includes('id="cross-result"'));
 assert.ok(quality.includes('id="synthesis-run"'));
 assert.ok(quality.includes('id="synthesis-cancel"'));
 assert.ok(quality.includes('id="synthesis-summary"'));
 assert.ok(quality.includes('id="synthesis-cards"'));
 const overview=html.slice(html.indexOf('id="view-overview"'),
  html.indexOf('id="view-asset"'));
 assert.ok(!overview.includes('id="evidence-lab-panel"'),
  'Overview cannot contain the full research audit');
});
test('visible quality entry is before long Forecasts journal',()=>{
 const forecastStart=html.indexOf('id="view-forecasts"');
 const forecastEnd=html.indexOf('id="view-quality"',forecastStart);
 const section=html.slice(forecastStart,forecastEnd);
 assert.ok(section.includes('data-go="quality"'));
 assert.ok(section.indexOf('class="card block quality-entry"')<
  section.indexOf('class="card block forecast-workspace"'));
 assert.ok(html.includes('class="quality-back" data-go="forecasts"'));
});
test('the router explicitly controls quality visibility and dock selection',()=>{
 assert.match(app,/['"]quality['"]\]/);
 assert.match(app,/view==='quality'/);
 assert.match(app,/if\(view==='quality'\)evidenceDashboard\.open\(\)/);
 assert.match(app,/tab\.dataset\.tab==='forecasts'&&view==='quality'/);
});
test('no duplicate HTML IDs were introduced',()=>{
 const all=[...html.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]);
 assert.equal(all.length,new Set(all).size);
});
