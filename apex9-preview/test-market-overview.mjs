import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {globalMarketSnapshot} from './market-overview.mjs';

const read=name=>readFileSync(new URL(name,import.meta.url),'utf8');
const html=read('./index.html'),app=read('./app.mjs'),css=read('./styles.css');
const now=1800000000000;
const market={
 scope:'GLOBAL_CRYPTO_NOT_ASSET',provider:'CoinGecko',
 observedAt:now-30000,receivedAt:now-20000,
 marketCapUsd:3800000000000,totalVolumeUsd:125000000000,
 btcDominancePercent:53.2,marketCapChange24hPercent:-1.52
};
const context=data=>({symbol:'ETHUSDT',sources:[
 {id:'coingecko-global',state:'OK',data},
 {id:'bitcoin-mempool',state:'UNSUPPORTED',data:null},
 {id:'gdelt-news',state:'EMPTY',data:null}
]});

test('global overview only accepts source-scoped CoinGecko crypto aggregates',()=>{
 const good=globalMarketSnapshot(context(market),{now});
 assert.equal(good.state,'OK');
 assert.equal(good.marketCapUsd,market.marketCapUsd);
 assert.equal(good.marketCapChange24hPercent,-1.52);
 assert.equal(good.btcDominancePercent,53.2);
 assert.equal(good.observedAt,market.observedAt);
 assert.equal(globalMarketSnapshot(context({...market,scope:'ASSET_24H'}),{now}).state,'INVALID');
 assert.equal(globalMarketSnapshot(context({...market,btcDominancePercent:150}),{now}).state,'INVALID');
 assert.equal(globalMarketSnapshot(context({...market,observedAt:now+62000}),{now}).state,'INVALID');
});
test('missing, unsupported or aged source never appears as a fresh quote',()=>{
 assert.equal(globalMarketSnapshot(null,{now}).state,'WAITING');
 assert.equal(globalMarketSnapshot({sources:[{id:'coingecko-global',state:'RATE_LIMITED'}]},{now}).state,'RATE_LIMITED');
 assert.equal(globalMarketSnapshot(context({...market,observedAt:now-3*3600000}),{now}).state,'STALE');
 assert.equal(globalMarketSnapshot(context({...market,marketCapUsd:Infinity}),{now}).state,'INVALID');
 assert.equal(globalMarketSnapshot({sources:[{id:'bitcoin-mempool',state:'OK',data:{}}]},{now}).state,'WAITING');
});
test('overview shows favorites, global market, and then news without duplicate asset details',()=>{
 const start=html.indexOf('id="view-overview"'),end=html.indexOf('id="view-catalog"');
 const overview=html.slice(start,end);
 assert.ok(html.indexOf('id="favorite-rail"')<start);
 assert.ok(overview.includes('id="overview-global-cap"'));
 assert.ok(overview.includes('id="overview-global-change"'));
 assert.ok(overview.includes('id="overview-global-state"'));
 assert.ok(overview.includes('id="overview-global-updated"'));
 assert.ok(!overview.includes('id="active-sources"'));
 assert.ok(!overview.includes('id="assessment-text"'));
 assert.ok(!overview.includes('id="global-context"'));
 assert.ok(!overview.includes('РЫНОЧНЫЙ ПАСПОРТ'));
 assert.ok(html.indexOf('class="home-actions overview-only"')>start);
 assert.ok(html.indexOf('class="home-actions overview-only"')<end);
});
test('sources own diagnostics while asset detail still owns its individual price',()=>{
 const asset=html.slice(html.indexOf('id="view-asset"'),html.indexOf('id="view-forecasts"'));
 const sources=html.slice(html.indexOf('id="view-sources"'));
 assert.ok(asset.includes('id="market-price"'));
 assert.ok(asset.includes('id="quote-volume"'));
 assert.ok(!asset.includes('id="global-context"'));
 assert.ok(sources.includes('id="global-context"'));
 for(const id of ['active-sources','layer-coverage','context-status','assessment-text',
  'missing-layers','external-summary','context-source-list']){
  assert.ok(sources.includes('id="'+id+'"'),id);
  assert.ok(!asset.includes('id="'+id+'"'),id);
 }
 assert.ok(app.includes('globalMarketSnapshot(context,{now:Date.now()})'));
 assert.ok(app.includes('renderGlobalOverview(context)'));
 assert.ok(!app.includes("text('daily-change'"));
 assert.ok(!app.includes("text('asset-passport-name'"));
});
test('single stage filter retains all count labels; one ID means one source of truth',()=>{
 const forecast=html.slice(html.indexOf('id="view-forecasts"'),html.indexOf('id="view-quality"'));
 for(const stage of ['PENDING_CONFIRMATION','CONFIRMED','ACTIVE','COMPLETED']){
  assert.ok(forecast.includes('data-journal-stage="'+stage+'"'));
  assert.ok(forecast.includes('id="stage-count-'+stage+'"'));
  assert.equal(html.split('id="stage-count-'+stage+'"').length-1,1);
 }
 const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]);
 assert.equal(ids.length,new Set(ids).size);
 assert.ok(!css.includes('body[data-view="overview"] #view-overview>.metrics .metric:nth-child(2)'));
});
