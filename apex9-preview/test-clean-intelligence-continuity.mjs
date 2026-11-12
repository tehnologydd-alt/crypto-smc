import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {scenarioDisclosureKey,scenarioSideSummary,assetIntelligenceTabs}
 from './clean-intelligence.mjs';
const read=name=>readFileSync(new URL(name,import.meta.url),'utf8');

test('expanded cards use a stable presentation-only key',()=>{
 assert.equal(scenarioDisclosureKey('direction3:BTCUSDT:123',0),
  'direction3:BTCUSDT:123::detail::0');
 assert.equal(scenarioDisclosureKey('direction3:BTCUSDT:123',1),
  'direction3:BTCUSDT:123::detail::1');
 assert.notEqual(scenarioDisclosureKey('a',0),scenarioDisclosureKey('b',0));
 for(const bad of [null,undefined,'',32])assert.equal(scenarioDisclosureKey(bad,0),null);
 for(const bad of [-1,1.5,Number.NaN])assert.equal(scenarioDisclosureKey('x',bad),null);
});
test('Room journal only exposes stable identifier; no persistence change',()=>{
 const journal=read('./favorite-dashboard.mjs');
 const layout=read('./clean-intelligence.mjs');
 assert.match(journal,/card\.dataset\.ciScenarioId=row\.id/);
 assert.match(journal,/card\.dataset\.ciSide=recordedForecastSide\(row\)\|\|'UNKNOWN'/);
 assert.match(layout,/list\.addEventListener\('toggle',event=>/);
 assert.match(layout,/if\(preferences\.has\(key\)\)preferences\.delete\(key\)/);
 assert.match(layout,/if\(preferences\.size>250\)/);
 assert.match(layout,/new MutationObserver\(restore\)\.observe\(list,\{childList:true\}\)/);
 assert.match(layout,/detail\.open=preferences\.get\(key\)/);
 assert.ok(!layout.includes('setMobileSettings('));
 assert.ok(!layout.includes('getMobileResearchForecasts('));
});
test('chart tab indicators observe existing aria-pressed source controls',()=>{
 const layout=read('./clean-intelligence.mjs');
 const css=read('./clean-intelligence.css');
 assert.deepEqual(assetIntelligenceTabs().map(t=>t.id),['whales','blocks','info']);
 assert.match(layout,/const syncOverlays=\(\)=>/);
 assert.match(layout,/source\.getAttribute\('aria-pressed'\)==='true'/);
 assert.match(layout,/tab\.dataset\.ciOverlayEnabled=String\(enabled\)/);
 assert.match(layout,/attributeFilter:\['aria-pressed'\]/);
 assert.match(css,/data-ci-overlay-enabled="true"/);
 assert.match(css,/data-ci-overlay-enabled="false"/);
 // The visual state is not tied to "which panel is open".
 assert.match(layout,/control\.setAttribute\('aria-pressed',String\(key===id\)\)/);
});
test('view-only detail memory does not modify scenario outcome counts',()=>{
 const sides=['SHORT','LONG','SHORT','UNKNOWN'];
 assert.deepEqual([scenarioSideSummary(sides,'SHORT').shown,
  scenarioSideSummary(sides,'SHORT').total],[2,4]);
 const journal=read('./favorite-dashboard.mjs');
 assert.match(journal,/const view=scenarioJournalState\(displayedJournal\(\),/);
 assert.ok(!journal.includes("'Убрать из журнала'"));
 assert.match(journal,/persistSelected\(\)/);
 const layout=read('./clean-intelligence.mjs');
 assert.match(layout,/mountForecastContinuity\(\)/);
 assert.match(layout,/const preferences=new Map\(\)/);
});
