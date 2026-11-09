import test from 'node:test';
import assert from 'node:assert/strict';
import {buildAssetNewsContext} from './asset-news-context.mjs';

const now=Date.UTC(2026,10,9,12);
const article=(title,hoursAgo,extra={})=>({
 title,href:'https://publisher.example/story-'+hoursAgo,
 observedAt:now-hoursAgo*3600_000,
 source:'CoinDesk RSS',timeKind:'PUBLISHED',...extra
});
test('joins a GDELT mention and RSS news for one asset without inventing associations',()=>{
 const gdelt={state:'OK',data:{articles:[{
  title:'Bitcoin network outage',
  url:'https://one.example/bitcoin-outage',
  seenAt:now-10*60000,provider:'GDELT'
 }]}};
 const live={state:'OK',checkedAt:now,sources:{RSS:'OK',CryptoPanic:'NOT_CONFIGURED'},
  articles:[
   article('Bitcoin ETF application update',1),
   article('Ethereum exchange update',1),
   article('Cryptocurrency market update',1)
  ]};
 const r=buildAssetNewsContext('BTCUSDT',{gdelt,live},{now});
 assert.equal(r.state,'OK');
 assert.equal(r.stories.length,2);
 assert.equal(r.sources.RSS,'OK');
 assert.equal(r.sources.CryptoPanic,'NOT_CONFIGURED');
 assert.ok(r.stories.some(x=>x.title==='Bitcoin network outage'&&x.timeKind==='INDEXED'));
 assert.ok(r.stories.some(x=>x.title==='Bitcoin ETF application update'&&x.timeKind==='PUBLISHED'));
 assert.ok(r.stories.every(x=>x.notDirectionalEvidence));
 assert.equal(r.sourceScope,'HEADLINE_NAME_MATCH_NOT_INDEPENDENT_FACT_OR_MARKET_DIRECTION');
});
test('same article in GDELT and RSS is one story with both indexers',()=>{
 const title='Bitcoin network protocol upgraded';
 const gdelt={state:'OK',data:{articles:[{title,url:'https://publisher.example/item?utm_source=gdelt',
  seenAt:now-180000,provider:'GDELT'}]}};
 const live={state:'OK',checkedAt:now,
  articles:[article(title,1,{href:'https://publisher.example/item?utm_source=rss'})]};
 const r=buildAssetNewsContext('BTCUSDT',{gdelt,live},{now});
 assert.equal(r.stories.length,1);
 assert.deepEqual(r.stories[0].indexedBy,['GDELT','CoinDesk RSS']);
});
test('unavailable connections do not become positive statuses or fabricated articles',()=>{
 const r=buildAssetNewsContext('SOLUSDT',{
  gdelt:{state:'OFFLINE'},live:{state:'UNAVAILABLE',sources:{RSS:'OFFLINE'}}
 },{now});
 assert.equal(r.state,'UNAVAILABLE');
 assert.deepEqual(r.stories,[]);
 assert.equal(r.sources.RSS,'OFFLINE');
 assert.equal(buildAssetNewsContext('SUDO<script>',{},{now}).state,'INVALID');
});
test('empty valid connection is different from unavailable service',()=>{
 const r=buildAssetNewsContext('ETHUSDT',{
  gdelt:{state:'EMPTY',data:{articles:[]}},
  live:{state:'EMPTY',checkedAt:now,articles:[]}
 },{now});
 assert.equal(r.state,'EMPTY');
 assert.equal(r.stories.length,0);
});
test('old shared news is visibly an archive; stale or unsafe entries cannot pass',()=>{
 const live={state:'OK',checkedAt:now-2*3600000,articles:[
  article('Bitcoin market security update',2),
  article('Bitcoin old protocol change',49),
  article('Bitcoin unsafe website',1,{href:'http://bad.example/article'}),
  article('Bitcoin future event',-1)
 ]};
 const r=buildAssetNewsContext('BTCUSDT',{live},{now});
 assert.equal(r.stories.length,1);
 assert.equal(r.stories[0].outdated,true);
});
test('token match is specific and does not attach generic market news',()=>{
 const r=buildAssetNewsContext('SOLUSDT',{live:{state:'OK',checkedAt:now,articles:[
  article('Bitcoin and Ethereum market update',1),
  article('Solana network upgrade',1),
  article('Cryptocurrency regulatory update',2)
 ]}},{now});
 assert.equal(r.stories.length,1);
 assert.equal(r.stories[0].title,'Solana network upgrade');
});
