import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {normalizeForecastNotificationTarget,stageNotificationLabel}
 from './forecast-notification-route.mjs';
import {consumeMobileNotificationTarget,listenMobileNotificationOpen}
 from './mobile-bridge.mjs';

const ID='direction2:ZECUSDT:1h:1794480000000';
const ROUTE={pending:true,version:1,forecastId:ID,asset:'ZECUSDT',stage:'SL'};
const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');

test('only a matching exact Room forecast, asset and observed stage can navigate',()=>{
 assert.deepEqual(normalizeForecastNotificationTarget(ROUTE),
  {version:1,forecastId:ID,asset:'ZECUSDT',stage:'SL'});
 assert.equal(stageNotificationLabel('SL'),'Касание стоп-уровня SL');
 for(const bad of [
  {...ROUTE,pending:false},{...ROUTE,version:2},
  {...ROUTE,asset:'BTCUSDT'},
  {...ROUTE,stage:'COMPLETED'},
  {...ROUTE,forecastId:'direction2:ZECUSDT:5m:1794480000000'},
  {...ROUTE,forecastId:'direction2:ZECUSDT:1h:bad'},
  {...ROUTE,forecastId:'direction3:ZECUSDT:1h:1794480000000'},
  {...ROUTE,forecastId:'direction2:BTCUSDT:1h:1794480000000'},
  {...ROUTE,forecastId:'https://example.com/evil'}
 ]) assert.equal(normalizeForecastNotificationTarget(bad),null);
 assert.ok(normalizeForecastNotificationTarget({
  ...ROUTE,forecastId:'direction3:ZECUSDT:4h:1794480000000',
  stage:'TP2'
 }));
});
test('native cold/warm launch consumed once, no URL and no fabricated route',async()=>{
 const previous=globalThis.window;let result=ROUTE,handler=null,count=0;
 const plugin={
  consumeNotificationTarget:async()=>{count++;const r=result;result={pending:false};return r;},
  addListener:async(name,cb)=>{assert.equal(name,'apexNotificationOpen');
   handler=cb;return {remove:async()=>{handler=null}};}
 };
 globalThis.window={Capacitor:{Plugins:{ApexNative:plugin}}};
 try{
  assert.deepEqual(await consumeMobileNotificationTarget(),
   normalizeForecastNotificationTarget(ROUTE));
  assert.equal(await consumeMobileNotificationTarget(),null);
  assert.equal(count,2);
  const events=[];
  const subscription=await listenMobileNotificationOpen(()=>events.push('open'));
  assert.ok(subscription);
  handler({pending:true});
  assert.deepEqual(events,['open']);
  await subscription.remove();assert.equal(handler,null);
 }finally{globalThis.window=previous;}
});
test('Android intent has exact ID/stage; native bridge rejects and clears once',()=>{
 const notifier=read('../apex9-android/native/src/main/java/com/apexintelligence/research/ApexForecastNotifier.kt');
 const activity=read('../apex9-android/native/MainActivity.java');
 const plugin=read('../apex9-android/native/src/main/java/com/apexintelligence/research/ApexNativePlugin.kt');
 for(const snippet of ['putExtra(EXTRA_FORECAST, forecast.id)',
  'putExtra(EXTRA_ASSET, asset)','putExtra(EXTRA_STAGE, stage.stage)',
  'notificationTarget(intent: Intent?)','clearNotificationTarget(intent: Intent)'])
  assert.ok(notifier.includes(snippet),snippet);
 assert.ok(activity.includes('setIntent(intent);'));
 assert.ok(plugin.includes('fun consumeNotificationTarget(call: PluginCall)'));
 assert.ok(plugin.includes('override fun handleOnNewIntent(intent: Intent)'));
 assert.ok(plugin.includes('notifyListeners("apexNotificationOpen"'));
 assert.ok(plugin.includes('ApexForecastNotifier.clearNotificationTarget(intent)'));
});
test('forecast journal uses exact Room lookup, even outside last 75, never another card',()=>{
 const dashboard=read('./favorite-dashboard.mjs'),
  app=read('./app.mjs'),html=read('./index.html'),
  bridge=read('./mobile-bridge.mjs'),
  stage=read('../apex9-android/scripts/prepare-web.mjs');
 assert.ok(dashboard.includes('getMobileMarkedResearchForecasts([target.forecastId])'));
 assert.ok(dashboard.includes('result.forecasts[0]?.id!==target.forecastId'));
 assert.ok(dashboard.includes('result.forecasts[0]?.asset!==target.asset'));
 assert.ok(dashboard.includes('event.stage===target.stage'));
 assert.ok(dashboard.includes('cardForForecast(record,'));
 assert.ok(dashboard.includes('container.scrollIntoView('));
 assert.ok(app.includes('await favoritesReady;'));
 assert.ok(app.includes("navigate('forecasts','forecast-notification-focus')"));
 assert.ok(app.includes('await favoriteManager.openNotificationForecast(target)'));
 assert.ok(bridge.includes('normalizeForecastNotificationTarget(result)'));
 assert.ok(html.includes('id="forecast-notification-focus"'));
 assert.ok(stage.includes("'forecast-notification-route.mjs'"));
});
