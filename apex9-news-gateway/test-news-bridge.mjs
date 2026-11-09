/**
 * Fake upstreams + real loopback HTTP server + real browser client parser.
 * This tests the data contract, NOT TLS, Caddy auth or real provider access.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';
import {createNewsGateway,startLocalGateway} from './news-gateway.mjs';
import {fetchNewsBundle} from '../apex9-preview/news-gateway-client.mjs';

test('simulated HTTPS proxy bridges client to two sanitized news feeds under quota',async()=>{
 const directory=mkdtempSync(join(tmpdir(),'apex-bridge-'));
 const now=Date.UTC(2026,10,9,12,0);
 const title='Bitcoin network industry custody update';
 const vendorCalls=[];
 const gateway=createNewsGateway({
  env:{APEX_NEWSDATA_KEY:'private-newsdata-token',
   APEX_CRYPTOPANIC_TOKEN:'private-cryptopanic-token'},
  ledgerFile:join(directory,'quota.json'),
  now:()=>now,
  fetchImpl:async url=>{
   vendorCalls.push(url.hostname);
   if(url.hostname==='cryptopanic.com')return {
    ok:true,status:200,json:async()=>({results:[{
     title,published_at:new Date(now-60_000).toISOString(),
     original_url:'https://publisher.example/story?utm_source=cryptopanic',
     url:'https://cryptopanic.com/news/copy'
    }]})
   };
   if(url.hostname==='newsdata.io')return {
    ok:true,status:200,json:async()=>({results:[{
     title,link:'https://publisher.example/story?utm_source=newsdata',
     pubDate:'2026-11-09 11:59:00'
    }]})
   };
   throw Error('Unexpected upstream host');
  }
 });
 const server=startLocalGateway({port:0,gateway,
  proxyOrigin:'https://research.example'});
 try{
  await once(server,'listening');
  const port=server.address().port;
  const fakeProxyFetch=async (url,opts)=>{
   assert.equal(new URL(url).origin,'https://research.example');
   assert.equal(opts.credentials,'same-origin');
   assert.equal(opts.method,'GET');
   const u=new URL(url);
   return fetch('http://127.0.0.1:'+port+u.pathname+u.search,{
    method:'GET',headers:{Origin:'https://research.example',
     'Sec-Fetch-Site':'same-origin',Accept:'application/json'}
   });
  };
  const config={enabled:true,location:{protocol:'https:',
   origin:'https://research.example'},fetchImpl:fakeProxyFetch,now:()=>now};
  const first=await fetchNewsBundle('BTC',config);
  assert.equal(first.state,'OK');
  assert.equal(first.articles.length,1);
  assert.equal(first.articles[0].href,'https://publisher.example/story');
  assert.deepEqual(first.articles[0].indexedBy,['CryptoPanic','NewsData.io']);
  const second=await fetchNewsBundle('BTC',config);
  assert.equal(second.state,'OK');
  assert.equal(vendorCalls.length,2,'6-hour cache avoids duplicate upstream calls');
  const response=await fakeProxyFetch('https://research.example/v1/status',{
   credentials:'same-origin',method:'GET'});
  const status=await response.json();
  assert.equal(status.providers.newsdata.dayRemaining,179);
  assert.equal(status.providers.cryptopanic.dayRemaining,3);
  assert.equal(status.scope,'LOCAL_ONLY_NOT_PUBLIC_APK');
  const raw=JSON.stringify({first,status});
  assert.equal(raw.includes('private-newsdata-token'),false);
  assert.equal(raw.includes('private-cryptopanic-token'),false);
  const other=await fetch('http://127.0.0.1:'+port+'/v1/bundle?coin=BTC',{
   headers:{Origin:'https://untrusted.example','Sec-Fetch-Site':'cross-site'}});
  assert.equal(other.status,403);
 }finally{
  await new Promise(done=>server.close(done));
  rmSync(directory,{recursive:true,force:true});
 }
});
