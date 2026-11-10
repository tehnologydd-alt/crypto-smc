import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const radar=read('./radar-dashboard.mjs');
const app=read('./app.mjs');
const favorites=read('./favorite-dashboard.mjs');
const worker=read('../apex9-android/native/src/main/java/com/apexintelligence/research/ApexSyncWorker.kt');
const native=read('../apex9-android/native/src/main/java/com/apexintelligence/research/ApexRadarMonitor.kt');
const plugin=read('../apex9-android/native/src/main/java/com/apexintelligence/research/ApexNativePlugin.kt');
const install=read('../apex9-android/scripts/install-native.mjs');
const bundle=read('../apex9-android/scripts/prepare-web.mjs');
const html=read('./index.html');
test('Radar starts on app init, NOT navigation, and scans while other views are open',()=>{
 assert.ok(app.includes('radarDashboard.start()'));
 assert.ok(app.includes('onFavoritesChanged:()=>{radarDashboard.favoritesChanged();assetFavoritePicker?.render();}'));
 assert.ok(radar.includes('timer=setInterval(autoTick,60000)'));
 assert.ok(radar.includes('selectRadarAutoFrame(getFavorites(),checkpoints'));
 assert.ok(radar.includes('document.hidden'));
 assert.ok(radar.includes('open(){active=true;syncUi();void syncNative();}'));
 assert.equal(radar.includes('open(){active=true;renderFocus();void scan();}'),false);
 assert.ok(radar.includes("if(active&&interval===selectedFrame)"));
});
test('Only favorites and source-validated closed candles produce Radar history',()=>{
 assert.ok(radar.includes("const allowed=new Set(favorites)"));
 assert.ok(radar.includes("if(!getFavorites().includes(item.ticker.symbol))continue;"));
 assert.ok(radar.includes('createRadarObservation(row,selectedFrame'));
 assert.ok(radar.includes('mergeRadarObservation(history,observation)'));
 assert.ok(radar.includes('validateRadarObservation(latest)'));
 assert.ok(favorites.includes('onFavoritesChanged?.(favorites.slice())'));
});
test('Android background persists native history using close-time-aware source analysis',()=>{
 assert.ok(worker.includes('ApexRadarMonitor.sync(applicationContext, favorites, dao)'));
 assert.ok(native.includes('MAX_HTTP_PER_WORK = 16'));
 assert.ok(native.includes('putLong(closeKey,expected)'));
 assert.ok(native.includes('if (count>=2 || count>0 && now-last<15*60_000L) continue'));
 assert.equal(native.includes('if (attempts >= expected'),false);
 assert.ok(radar.includes('markRadarAutoFailure(storage,checkpoints,plan,Date.now())'));
 assert.ok(native.includes('for (frame in listOf("15m","1h","4h","1d"))'));
 assert.ok(native.includes('dao.candles(asset,frame,LIMIT).reversed()'));
 assert.ok(native.includes('if (last.closeTime > now'));
 assert.ok(native.includes('connection.responseCode != 200'));
 assert.ok(native.includes('if (last.optString("symbol") in selected)'));
 assert.ok(native.includes('.put("source","Binance Spot")'));
 assert.equal(worker.includes('ApexRadarMonitor.sync(applicationContext, settings.asset'),false);
});
test('WebView bridge uses read-only favorites-scoped native archive',()=>{
 assert.ok(plugin.includes('fun getRadarHistory(call: PluginCall)'));
 assert.ok(plugin.includes('ApexRadarMonitor.read(app,favorites)'));
 assert.ok(install.includes("'ApexRadarMonitor.kt'"));
 assert.ok(read('./mobile-bridge.mjs').includes('export async function getMobileRadarHistory()'));
 assert.ok(radar.includes('const native=await getMobileRadarHistory()'));
});
test('Android bundle includes auto scheduler and historical display cache',()=>{
 for(const path of ['radar-auto-policy.mjs','radar-display-cache.mjs'])
  assert.ok(bundle.includes("'"+path+"'"),path);
 assert.ok(html.includes('Автоматически наблюдаем избранные активы'));
 assert.ok(html.includes('Android вправе задерживать его'));
});
