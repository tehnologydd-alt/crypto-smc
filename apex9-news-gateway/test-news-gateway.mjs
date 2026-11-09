import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
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
