import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {researchAreaForTarget} from './research-workspace.mjs';

const read=file=>readFileSync(new URL(file,import.meta.url),'utf8');
const html=read('./index.html');
const favorite=read('./favorite-dashboard.mjs');
const css=read('./styles.css');
const app=read('./app.mjs');

test('Scenarios journal stays compact, M15/H1/H4 panel moves entirely into Quality',()=>{
 const scenarios=html.indexOf('id="view-forecasts"');
 const quality=html.indexOf('id="view-quality"');
 const panel=html.indexOf('class="card block forecast-confluence quality-confluence-workspace"');
 const journal=html.indexOf('class="card block forecast-workspace"');
 const qualityLab=html.indexOf('id="evidence-lab-panel"');
 assert.ok(scenarios>=0&&quality>scenarios&&journal>scenarios);
 assert.ok(journal<quality,'journal must precede the quality screen');
 assert.ok(panel>quality&&panel<qualityLab,
  'the multiframe panel belongs to the quality summary, not scenarios');
 for(const id of [
  'forecast-multiframe-quality',
  'forecast-confluence-summary',
  'forecast-evidence-cohorts',
  'forecast-feature-audit',
  'feature-holdout-run',
  'forecast-probability-report',
  'feature-shadow-panel'
 ]){
  const matches=html.match(new RegExp('id="'+id+'"','g'))||[];
  assert.equal(matches.length,1,'all existing research IDs kept exactly once: '+id);
  assert.ok(html.indexOf('id="'+id+'"')>quality,
   'all actual research controls moved to Quality: '+id);
 }
 assert.ok(favorite.includes("id('forecast-multiframe-quality')"));
 assert.ok(favorite.includes("id('forecast-confluence-summary')"));
 assert.ok(favorite.includes("id('forecast-evidence-cohorts')"));
 assert.ok(css.includes('.quality-view[data-quality-area="summary"] .quality-confluence-workspace'));
 assert.ok(css.includes('.quality-view .quality-confluence-workspace{display:none!important'));
});
test('Whale W coverage is a default-collapsed detail, not a long paragraph in journal',()=>{
 const fold=html.indexOf('<details class="forecast-whale-details"');
 const summary=html.indexOf('id="forecast-whale-summary"');
 const text=html.indexOf('id="forecast-whale-coverage"');
 const close=html.indexOf('</details>',fold);
 assert.ok(fold>scenariosIndex()&&fold<qualityIndex());
 assert.ok(summary>fold&&summary<text&&text<close);
 assert.ok(!html.slice(fold,summary).includes(' open'),
  'W detail must not be expanded on initial render');
 assert.equal((html.match(/id="forecast-whale-coverage"/g)||[]).length,1);
 assert.ok(favorite.includes("id('forecast-whale-summary')"));
 assert.ok(favorite.includes("id('forecast-whale-coverage')"));
 assert.ok(css.includes('.forecast-whale-details>summary'));
});
function scenariosIndex(){return html.indexOf('id="view-forecasts"')}
function qualityIndex(){return html.indexOf('id="view-quality"')}
test('Full archive audit deep link opens Quality and its original details',()=>{
 assert.match(html,/data-go="quality" data-target="forecast-feature-audit"/);
 assert.equal(researchAreaForTarget('forecast-feature-audit'),'summary');
 assert.equal(researchAreaForTarget('forecast-multiframe-quality'),'summary');
 assert.ok(app.includes("if(targetId==='forecast-feature-audit')"));
 assert.ok(app.includes("el('forecast-feature-audit').open=true"));
 const target=app.lastIndexOf("view==='quality'&&targetId==='forecast-feature-audit'?");
 assert.ok(target>0);
 assert.ok(app.slice(target).includes("el('forecast-feature-audit')"));
});
