import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=name=>readFileSync(new URL(name,import.meta.url),'utf8');
const html=read('./index.html');
const app=read('./app.mjs');
const favorites=read('./favorite-dashboard.mjs');
const css=read('./styles.css');

test('favorites carousel is the first overview feature and market passport is asset-only',()=>{
 assert.ok(html.indexOf('id="favorite-rail"')<html.indexOf('id="view-overview"'));
 assert.ok(html.indexOf('id="asset-name"')>html.indexOf('id="view-asset"'));
 assert.ok(!html.slice(html.indexOf('id="view-overview"'),html.indexOf('id="view-catalog"'))
  .includes('РЫНОЧНЫЙ ПАСПОРТ'));
 assert.ok(css.includes('.favorite-card.asset-chip{'));
 assert.ok(css.includes('height:165px!important'));
});

test('complete symbol search is routed to a dedicated catalog without a ten-symbol cap',()=>{
 assert.ok(html.indexOf('id="search-form"')>html.indexOf('id="view-catalog"'));
 assert.ok(html.indexOf('id="search-form"')<html.indexOf('id="view-asset"'));
 for(const id of ['catalog-results','catalog-result-count','catalog-show-more','asset-input'])
  assert.equal(html.split('id="'+id+'"').length-1,1,id);
 assert.ok(app.includes("['overview','catalog','asset'"));
 assert.ok(app.includes('catalog.filter(symbol=>symbol.includes(q))'));
 assert.ok(app.includes('matches.slice(0,catalogPage*60)'));
 assert.ok(app.includes('catalogPage=1;'));
 assert.ok(app.includes('toggleSymbol(symbol)'));
});

test('favorite removal requires deliberate hold and upward swipe with undo',()=>{
 assert.ok(favorites.includes('enableSwipeRemoval(wrapper,symbol)'));
 assert.ok(favorites.includes('setTimeout(()=>{'));
 assert.ok(favorites.includes('},480);'));
 assert.ok(favorites.includes('event.clientY-startY < -65'));
 assert.ok(!favorites.includes("create('button','favorite-remove'"));
 assert.ok(favorites.includes('offerUndo(symbol)'));
 assert.ok(favorites.includes("id('favorites-undo').addEventListener('click'"));
 assert.ok(favorites.includes('FAVORITES_MAX'));
 assert.ok(html.includes('id="favorites-toast"'));
 assert.ok(css.includes('.favorite-armed'));
});

test('no duplicate document IDs or lost research pages',()=>{
 const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(match=>match[1]);
 assert.equal(ids.length,new Set(ids).size);
 for(const id of ['view-overview','view-asset','view-forecasts','view-quality','view-sources',
  'evidence-lab-panel','research-forecast-list','asset-explain','native-storage-status'])
  assert.ok(ids.includes(id),id);
});
