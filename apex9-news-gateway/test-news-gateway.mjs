import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';
import {providerRequest,normalizeProviderNews,createNewsGateway,
 startLocalGateway} from './news-gateway.mjs';
test('fixed hosts and exact supported coins only',()=>{
 assert.equal(providerRequest('evil','BTC','key'),null);
 assert.equal(providerRequest('cryptopanic','BAD','key'),null);
 const cp=providerRequest('cryptopanic','BTC','secret');
 assert.equal(cp.hostname,'cryptopanic.com');
 assert.equal(cp.searchParams.get('currencies'),'BTC');
 const nd=providerRequest('newsdata','ETH','secret');
 assert.equal(nd.hostname,'newsdata.io');
 assert.equal(nd.searchParams.get('qInTitle'),'Ethereum');
});
test('missing keys do not trigger remote requests',async()=>{
 const g=createNewsGateway({env:{},fetchImpl:()=>{throw Error('network called');}});
 assert.equal((await g.load('newsdata','BTC')).state,'NOT_CONFIGURED');
});
test('local persisted quota counts failed attempts and cannot be bypassed by restart',async()=>{
 const d=mkdtempSync(join(tmpdir(),'apex-gateway-'));
 try{
  let t=Date.UTC(2026,10,9,12),n=0;
  const options={env:{APEX_NEWSDATA_KEY:'secret'},ledgerFile:join(d,'ledger'),
   now:()=>t,fetchImpl:async()=>{n++;return {ok:false,status:500};}};
  assert.equal((await createNewsGateway(options).load('newsdata','BTC')).state,'OFFLINE');
  assert.equal((await createNewsGateway(options).load('newsdata','ETH')).state,'WAIT_INTERVAL');
  t+=6*3600000;
  assert.equal((await createNewsGateway(options).load('newsdata','ETH')).state,'OFFLINE');
  assert.equal(n,2);
 }finally{rmSync(d,{recursive:true,force:true});}
});
test('only fresh published HTTPS articles accepted and no directional claims',()=>{
 const t=Date.UTC(2026,10,9,12);
 const r=normalizeProviderNews('newsdata',{results:[
  {title:'Ethereum market infrastructure update',link:'https://site.example/a',
   pubDate:new Date(t-1000).toISOString()},
  {title:'old coverage of ethereum market',link:'https://site.example/b',
   pubDate:'2020-01-01T00:00:00Z'}
 ]},t);
 assert.equal(r.articles.length,1);
 assert.equal(r.articles[0].notDirectionalEvidence,true);
});
test('gateway refuses non-loopback listening',()=>{
 assert.throws(()=>startLocalGateway({host:'0.0.0.0'}),/loopback/);
});

test('status exposes remaining conservative quota but never credentials',async()=>{
 const d=mkdtempSync(join(tmpdir(),'apex-status-'));
 try{
  const g=createNewsGateway({env:{APEX_NEWSDATA_KEY:'sensitive-test-token'},
   ledgerFile:join(d,'quota'),now:()=>Date.UTC(2026,10,9,12),
   fetchImpl:async()=>({ok:false,status:503})});
  assert.equal(g.status().providers.cryptopanic.state,'NOT_CONFIGURED');
  assert.equal(g.status().providers.newsdata.dayRemaining,4);
  assert.equal((await g.load('newsdata','BTC')).state,'OFFLINE');
  assert.equal(g.status().providers.newsdata.dayRemaining,3);
  assert.equal(JSON.stringify(g.status()).includes('sensitive-test-token'),false);
 }finally{rmSync(d,{recursive:true,force:true});}
});
test('news bundle merges repeated headlines without counting two confirmations',async()=>{
 const d=mkdtempSync(join(tmpdir(),'apex-bundle-'));
 try{
  const t=Date.UTC(2026,10,9,12);
  const title='Bitcoin exchange custody and settlement update';
  const fetchImpl=async url=>({
   ok:true,status:200,json:async()=>({results:url.hostname.includes('cryptopanic')?
    [{title,url:'https://publisher.example/bitcoin?utm_source=cp',
      published_at:new Date(t-1000).toISOString()}]:
    [{title,link:'https://publisher.example/bitcoin?utm_source=nd',
      pubDate:new Date(t-1000).toISOString()}]})
  });
  const g=createNewsGateway({env:{APEX_CRYPTOPANIC_TOKEN:'cp',
    APEX_NEWSDATA_KEY:'nd'},now:()=>t,fetchImpl,ledgerFile:join(d,'quota')});
  const r=await g.bundle('BTC');
  assert.equal(r.state,'OK');assert.equal(r.articles.length,1);
  assert.equal(r.coverage,2);
  assert.deepEqual(r.articles[0].indexedBy,['CryptoPanic','NewsData.io']);
  assert.equal(r.sourceScope,'NEWS_CONTEXT_ONLY_NOT_TRADE_SIGNAL');
 }finally{rmSync(d,{recursive:true,force:true});}
});
test('loopback endpoints return sanitized status and reject cross-origin access',async()=>{
 const server=startLocalGateway({port:0,gateway:createNewsGateway({env:{}})});
 try{
  await once(server,'listening');
  const port=server.address().port,url='http://127.0.0.1:'+port;
  const status=await fetch(url+'/v1/status');
  assert.equal(status.status,200);
  assert.equal((await status.json()).providers.newsdata.state,'NOT_CONFIGURED');
  const bundle=await fetch(url+'/v1/bundle?coin=BTC');
  assert.equal((await bundle.json()).state,'NO_VERIFIED_NEWS');
  const hostile=await fetch(url+'/v1/news?coin=BTC&provider=newsdata',{
   headers:{Origin:'https://untrusted.example'}});
  assert.equal(hostile.status,403);
  const spoof=await fetch(url+'/v1/status',{headers:{Host:'untrusted.example'}});
  assert.equal(spoof.status,403);
  assert.equal(hostile.headers.get('access-control-allow-origin'),null);
 }finally{await new Promise((done)=>server.close(done));}
});
