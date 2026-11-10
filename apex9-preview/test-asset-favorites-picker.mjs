import test from 'node:test';
import assert from 'node:assert/strict';
import {assetFavoriteList,adjacentFavorite} from './asset-favorites-picker.mjs';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const html=read('./index.html'),app=read('./app.mjs'),css=read('./styles.css');
const selected=['BTCUSDT','AVAXUSDT','SOLUSDT'];
test('only saved valid favorite assets can appear in swipe picker',()=>{
 assert.deepEqual(assetFavoriteList([
 'BTCUSDT','BTCUSDT','../../etc','AVAXUSDT','LINKUSDT','ETHBTC',
 'SOLUSDT']),['BTCUSDT','AVAXUSDT','LINKUSDT','SOLUSDT']);
 assert.deepEqual(assetFavoriteList(Array.from({length:20},(_,i)=>'A'+i+'USDT')).length,10);
});
test('swipes move only within favorites, wrap safely, never discover symbols',()=>{
 assert.equal(adjacentFavorite(selected,'BTCUSDT',1),'AVAXUSDT');
 assert.equal(adjacentFavorite(selected,'BTCUSDT',-1),'SOLUSDT');
 assert.equal(adjacentFavorite(selected,'SOLUSDT',1),'BTCUSDT');
 assert.equal(adjacentFavorite(selected,'DOGEUSDT',1),'BTCUSDT');
 assert.equal(adjacentFavorite([], 'BTCUSDT',1),null);
});
test('favorite swiper replaces redundant Asset dock, catalog remains manual',()=>{
 assert.ok(html.includes('id="asset-favorite-strip"'));
 assert.ok(!html.includes('data-tab="asset"'));
 assert.ok(!html.includes('>Выбрать другой</button>'));
 assert.ok(app.includes('assetFavoritePicker=initAssetFavoritePicker({'));
 assert.ok(app.includes('assetFavoritePicker?.render()'));
 assert.ok(css.includes('.asset-favorite-strip'));
 const dock=html.slice(html.indexOf('<nav class="tabs bottom-dock"'),
  html.indexOf('</nav>',html.indexOf('<nav class="tabs bottom-dock"')));
 assert.deepEqual([...dock.matchAll(/data-tab="([^"]+)"/g)].map(x=>x[1]),
 ['overview','radar','forecasts','quality']);
});
test('primary chart remains visible while status and research explanations fold',()=>{
 assert.ok(html.includes('id="asset-source-diagnostics"'));
 assert.ok(html.includes('<details class="asset-explain-panel asset-explain-fold"'));
 assert.ok(html.includes('class="asset-quiet-detail"><summary>О графике'));
 assert.ok(app.includes('foldAssetTechnicalNotes()'));
 assert.ok(css.includes('.structure-event.is-up'));
 assert.ok(css.includes('.structure-event.is-down'));
});
