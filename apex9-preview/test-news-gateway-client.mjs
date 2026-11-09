import test from 'node:test';
import assert from 'node:assert/strict';
import {parseNewsBundle,fetchNewsBundle} from './news-gateway-client.mjs';
const now=Date.UTC(2026,10,9,12);
const source=(title,url,at=now-1000)=>({title,href:url,observedAt:at,
 source:'CryptoPanic',notDirectionalEvidence:true});
test('disabled Android client does not contact any network service',async()=>{
 let calls=0;
 const r=await fetchNewsBundle('BTC',{fetchImpl:async()=>{calls++;}});
 assert.equal(r.state,'NOT_CONFIGURED');assert.equal(calls,0);
});
test('client requires an explicit same-origin HTTPS target',async()=>{
 let calls=0;const fetchImpl=async()=>{calls++;return {ok:true};};
 assert.equal((await fetchNewsBundle('BTC',{enabled:true,
  location:{origin:'http://localhost:8787',protocol:'http:'},fetchImpl})).state,
  'INSECURE_ORIGIN');
 assert.equal(calls,0);
});
test('client accepts only time bounded, correctly scoped, attributed articles',()=>{
 const valid={coin:'BTC',state:'OK',sourceScope:'NEWS_CONTEXT_ONLY_NOT_TRADE_SIGNAL',
  providers:{cryptopanic:'OK',newsdata:'NOT_CONFIGURED'},articles:[
   source('Bitcoin custody update','https://real.example/a'),
   source('Bitcoin network analysis','https://real.example/b',now-6*86400000),
   {...source('Safe headline','javascript:alert(1)')},
   {...source('Unverified source entry','https://real.example/c'),source:'Unknown'}
  ]};
 const r=parseNewsBundle(valid,{coin:'BTC',now});
 assert.equal(r.state,'OK');assert.equal(r.articles.length,1);
 assert.equal(parseNewsBundle({...valid,coin:'ETH'},{coin:'BTC',now}).state,'INVALID');
});
test('HTTPS bundle fetch uses same-origin auth and no vendor keys',async()=>{
 const location={protocol:'https:',origin:'https://research.example'};
 let called=false;
 const r=await fetchNewsBundle('ETH',{enabled:true,location,now:()=>now,
  fetchImpl:async(url,init)=>{
   called=true;
   assert.equal(url,'https://research.example/v1/bundle?coin=ETH');
   assert.equal(init.credentials,'same-origin');
   assert.equal(init.redirect,'error');
   return {ok:true,status:200,json:async()=>({
    coin:'ETH',state:'NO_VERIFIED_NEWS',
    sourceScope:'NEWS_CONTEXT_ONLY_NOT_TRADE_SIGNAL',
    providers:{cryptopanic:'NOT_CONFIGURED',newsdata:'NOT_CONFIGURED'},
    articles:[]})};
  }});
 assert.equal(called,true);assert.equal(r.state,'EMPTY');
});
