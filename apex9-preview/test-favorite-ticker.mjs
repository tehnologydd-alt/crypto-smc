import test from 'node:test';
import assert from 'node:assert/strict';
import {createFavoriteTickerFeed,parseFavoriteTickers,
 sanitizeFavoriteSymbols} from './favorite-ticker.mjs';
import {assetLogoSource} from './asset-logo.mjs';
const at=Date.UTC(2026,10,10,9);
const symbols=['BTCUSDT','ETHUSDT'];
const tick=(symbol,observedAt=at)=>({symbol,lastPrice:'100.25',
 priceChangePercent:'-0.9',closeTime:observedAt,quoteVolume:'1000'});
const memory=()=>{const m=new Map();return{getItem:k=>m.get(k)||null,
 setItem:(k,v)=>m.set(k,v)}};
test('one batch only for favorites, never unrelated assets',async()=>{
 const requested=[];
 const feed=createFavoriteTickerFeed({storage:memory(),now:()=>at,
  fetchImpl:async(url,options)=>{
   const u=new URL(url);
   assert.equal(u.origin,'https://data-api.binance.vision');
   assert.equal(u.pathname,'/api/v3/ticker/24hr');
   assert.equal(options.credentials,'omit');assert.equal(options.method,'GET');
   const listed=JSON.parse(u.searchParams.get('symbols'));
   requested.push(listed);
   return {ok:true,json:async()=>[tick('BTCUSDT'),tick('ETHUSDT'),
    tick('XRPUSDT')]};
  }});
 const r=await feed.refresh(['BTCUSDT','ETHUSDT','BTCUSDT','BADTEXT']);
 assert.equal(r.state,'OK');
 assert.deepEqual(requested,[symbols]);
 assert.deepEqual(Object.keys(r.prices).sort(),symbols);
 assert.equal(r.prices.BTCUSDT.price,100.25);
 assert.equal(r.prices.BTCUSDT.fromCache,true);
});
test('bad tickers are discarded, not invented or mixed between favorites',()=>{
 const r=parseFavoriteTickers([tick('BTCUSDT'),tick('ETHUSDT'),tick('DOGEUSDT')],
  {favorites:['BTCUSDT'],now:at});
 assert.deepEqual(Object.keys(r.prices),['BTCUSDT']);
 assert.equal(parseFavoriteTickers([tick('BTCUSDT',at-3600000)],
  {favorites:['BTCUSDT'],now:at}).state,'EMPTY');
 assert.equal(parseFavoriteTickers({},{favorites:symbols,now:at}).state,'INVALID');
});
test('reload uses persisted values on HTTP 429 and never claims a new quote',async()=>{
 const storage=memory();
 let requests=0,current=at;
 const success=createFavoriteTickerFeed({storage,now:()=>current,
  fetchImpl:async()=>{requests++;return {ok:true,json:async()=>[tick('BTCUSDT')]}}});
 const first=await success.refresh(['BTCUSDT']);
 assert.equal(first.state,'OK');
 current+=2*60000;
 const offline=createFavoriteTickerFeed({storage,now:()=>current,
  fetchImpl:async()=>({ok:false,status:429})});
 const fallback=await offline.refresh(['BTCUSDT']);
 assert.equal(fallback.state,'RATE_LIMITED');
 assert.equal(fallback.prices.BTCUSDT.price,100.25);
 assert.equal(fallback.prices.BTCUSDT.fromCache,true);
 assert.equal(requests,1);
});
test('no favorites means zero fetches',async()=>{
 let called=false;
 const feed=createFavoriteTickerFeed({storage:memory(),now:()=>at,
  fetchImpl:async()=>{called=true;throw Error('not allowed')}});
 assert.equal((await feed.refresh([])).state,'NO_FAVORITES');
 assert.equal(called,false);
});
test('icons must have a curated association and fall back on unknown symbols',()=>{
 assert.match(assetLogoSource('BTCUSDT'),/trustwallet\/assets/);
 assert.equal(assetLogoSource('UNKNOWNUSDT'),null);
 assert.equal(assetLogoSource('NOT_A_SYMBOL'),null);
 assert.deepEqual(sanitizeFavoriteSymbols(
 ['BTCUSDT','BTCUSDT','ETHUSDT','RANDOM']),symbols);
});
