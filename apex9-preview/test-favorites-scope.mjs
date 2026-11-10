import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const app=read('./app.mjs'),favorites=read('./favorite-dashboard.mjs'),
 radar=read('./radar-dashboard.mjs'),radarCore=read('./radar-core.mjs');
const android=read('../apex9-android/native/src/main/java/com/apexintelligence/research/ApexSyncWorker.kt');
const notifier=read('../apex9-android/native/src/main/java/com/apexintelligence/research/ApexForecastNotifier.kt');
const manifest=read('../apex9-android/scripts/prepare-web.mjs');
const html=read('./index.html'),css=read('./styles.css');
const overview=read('./editorial-dashboard.mjs');
test('Android background worker never monitors the selected-only asset',()=>{
 assert.ok(android.includes('val favorites = settings.favorites'));
 assert.ok(android.includes('for (asset in favorites)'));
 assert.ok(android.includes('ApexAutoForecast.syncAll(applicationContext, favorites)'));
 assert.equal(android.includes('val asset = settings.asset'),false);
 assert.ok(notifier.includes('.setSmallIcon(R.drawable.ic_stat_apex)'));
 assert.equal(notifier.includes('android.R.drawable.ic_dialog_info'),false);
});
test('Radar never downloads all market ticker data',()=>{
 assert.ok(radar.includes('getFavorites=()=>[]'));
 assert.ok(radar.includes('const favorites=getFavorites()'));
 assert.ok(radar.includes('if(!allow.size)'));
 assert.ok(radarCore.includes('symbols='));
 assert.equal(radarCore.includes("fetchImpl(URL,{"),false);
 assert.ok(app.includes('getFavorites:()=>favoriteManager.getFavorites()'));
});
test('unfavorite search stays manual, automatic polling requires saved favorite',()=>{
 assert.ok(app.includes("if(!catalog.length)void loadCatalog()"));
 assert.ok(app.includes("favoriteManager.hasFavorite(chosen)"));
 assert.ok(app.includes('renderGlobalOverview(null)'));
 assert.ok(favorites.includes('favoriteTickers.refresh(selected,{force})'));
 assert.ok(favorites.includes('getMobileCandles(symbol'));
});
test('overview preserved and technical verbosity moved behind disclosure',()=>{
 assert.ok(app.includes('overviewCache.readGlobal()'));
 assert.ok(overview.includes('overviewCache.readEvents()'));
 assert.ok(overview.includes("get('overview-events-diagnostics-text')"));
 assert.ok(html.includes('id="overview-events-diagnostics"'));
 assert.ok(html.includes('id="free-fear-track"'));
 assert.ok(css.includes('.free-fear-needle'));
});
test('favorite card includes separate logo, price, chart with reusable DOM',()=>{
 assert.ok(favorites.includes('attachAssetLogo(icon,symbol,mark)'));
 assert.ok(favorites.includes("create('div','favorite-price-box')"));
 assert.ok(favorites.includes("create('div','favorite-market-row')"));
 assert.ok(favorites.includes('if(unchanged)'));
 assert.ok(css.includes('.favorite-card .favorite-market-row'));
});
test('Android WebView packages every newly imported favorite/cache module',()=>{
 for(const x of ['favorite-ticker.mjs','asset-logo.mjs','overview-cache.mjs'])
  assert.ok(manifest.includes("'"+x+"'"),x);
});
