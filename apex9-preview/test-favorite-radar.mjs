import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {getFavoriteRadarNotices,summarizeFavoriteRadar} from './favorite-radar.mjs';
import {createRadarObservation,readRadarChanges,saveRadarChanges} from './radar-changes.mjs';

const step=3600000;
const now=Math.floor(1800000000000/step)*step+30000;
const last=Math.floor(now/step)*step-1;
const observation=(symbol,at,{direction='UP',mode='RANGE',speed=.15,volume=1}={})=>
 createRadarObservation({symbol,analysis:{
  state:'OK',lastClosedAt:at,direction,mode,
  movement:speed,acceleration:.04,volumeRatio:volume}},
 '1h',{now:at+10000});
const sample=(symbol='ETHUSDT',at=last)=>{
 const previous=observation(symbol,at-step);
 const latest=observation(symbol,at,{direction:'DOWN',mode:'DIRECTIONAL',
  speed:-.5,volume:2.2});
 return {previous,latest};
};
const mockStorage=()=>{const m=new Map();
 return {setItem:(k,v)=>m.set(k,v),getItem:k=>m.get(k)||null};};

test('only listed favorites with verified two-candle changes get a mini notice',()=>{
 const history={'ETHUSDT|1h':sample(),'BTCUSDT|1h':sample('BTCUSDT')};
 const notices=getFavoriteRadarNotices(['ETHUSDT','XRPUSDT'],history,{now});
 assert.equal(notices.length,1);
 assert.equal(notices[0].symbol,'ETHUSDT');
 assert.equal(notices[0].frame,'H1');
 assert.equal(notices[0].interval,'1h');
 assert.ok(notices[0].label.includes('Режим'));
 assert.deepEqual(notices[0].events.map(e=>e.kind),
  ['DIRECTION','MODE','SPEED_UP','VOLUME_UP']);
 assert.equal(summarizeFavoriteRadar(notices).count,1);
 assert.match(summarizeFavoriteRadar(notices).text,/1 избранных активов/);
});
test('no valid change, no notice: no fabricated alerts',()=>{
 const same=observation('ETHUSDT',last);
 assert.deepEqual(getFavoriteRadarNotices(['ETHUSDT'],{
  'ETHUSDT|1h':{latest:same,previous:null}
 },{now}),[]);
 assert.deepEqual(getFavoriteRadarNotices(['ETHUSDT'],{
  'ETHUSDT|1h':{latest:same,previous:same}
 },{now}),[]);
 const stable=observation('ETHUSDT',last-step);
 assert.deepEqual(getFavoriteRadarNotices(['ETHUSDT'],{
  'ETHUSDT|1h':{latest:same,previous:stable}
 },{now}),[]);
 assert.equal(summarizeFavoriteRadar([]).count,0);
});
test('previous saved event disappears when candle age exceeds freshness window',()=>{
 const history={'ETHUSDT|1h':sample()};
 assert.equal(getFavoriteRadarNotices(['ETHUSDT'],history,{now}).length,1);
 assert.deepEqual(getFavoriteRadarNotices(['ETHUSDT'],history,{now:now+3*step}),[]);
 assert.deepEqual(getFavoriteRadarNotices(['ETHUSDT'],history,{now:last-1}),[]);
 const broken={'ETHUSDT|1h':sample()};
 broken['ETHUSDT|1h'].previous.symbol='BTCUSDT';
 assert.deepEqual(getFavoriteRadarNotices(['ETHUSDT'],broken,{now}),[]);
});
test('corrupt history cannot display an event and local storage never needs API',()=>{
 const storage=mockStorage();
 assert.equal(saveRadarChanges(storage,{'ETHUSDT|1h':sample()}),true);
 const loaded=readRadarChanges(storage);
 assert.equal(getFavoriteRadarNotices(['ETHUSDT'],loaded,{now}).length,1);
 storage.setItem('apex9_radar_observations_v1','{error');
 assert.deepEqual(getFavoriteRadarNotices(['ETHUSDT'],readRadarChanges(storage),{now}),[]);
 assert.deepEqual(getFavoriteRadarNotices(null,{}, {now}),[]);
 assert.deepEqual(getFavoriteRadarNotices(['ETHUSDT'],{}, {now:NaN}),[]);
});
test('at most one label per favorite, preferring newest verified timeframe',()=>{
 const history={'ETHUSDT|1h':sample(),'BTCUSDT|1h':sample('BTCUSDT')};
 const favs=Array.from({length:12},(_,i)=>i===0?'ETHUSDT':i===1?'BTCUSDT':
  'OTHER'+i+'USDT');
 const notices=getFavoriteRadarNotices(favs,history,{now});
 assert.deepEqual(new Set(notices.map(x=>x.symbol)).size,notices.length);
 assert.equal(notices.length,2);
});
test('overview badge is a user-controlled route, not a duplicate radar card',()=>{
 const html=readFileSync(new URL('./index.html',import.meta.url),'utf8');
 const favorite=readFileSync(new URL('./favorite-dashboard.mjs',import.meta.url),'utf8');
 const radar=readFileSync(new URL('./radar-dashboard.mjs',import.meta.url),'utf8');
 const app=readFileSync(new URL('./app.mjs',import.meta.url),'utf8');
 const css=readFileSync(new URL('./styles.css',import.meta.url),'utf8');
 assert.ok(html.includes('id="favorites-radar-summary"'));
 assert.ok(html.includes('id="radar-focus-panel"'));
 assert.ok(favorite.includes('getFavoriteRadarNotices(favorites,readRadarChanges(storage)'));
 assert.ok(favorite.includes("event.stopPropagation();\n     onOpenRadar?.(symbol,notice.interval)"));
 const gesture=readFileSync(new URL('./favorite-gesture.mjs',import.meta.url),'utf8');
 assert.ok(gesture.includes("const ignored='.favorite-explain, .favorite-radar-link'"));
 assert.ok(gesture.includes("card.addEventListener('touchmove',touchMove,{passive:false})"));
 assert.ok(app.includes("radarDashboard.focus(symbol,interval)"));
 assert.ok(app.includes("navigate('radar','radar-focus-panel')"));
 assert.ok(radar.includes('getFavoriteRadarNotices([focusedSymbol],history'));
 assert.ok(radar.includes("window.dispatchEvent(new CustomEvent('apex-radar-updated'))"));
 assert.ok(css.includes('.favorite-radar-link'));
 const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
 assert.equal(new Set(ids).size,ids.length);
});
