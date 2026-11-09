import test from 'node:test';
import assert from 'node:assert/strict';
import {changePersonalNewsKey,removePersonalNewsKey,personalNewsStatus,
 parsePersonalProvider,fetchPersonalNewsBundle,
 checkPersonalNewsProvider,personalNewsDiagnosticLabel} from './personal-news-client.mjs';
const at=Date.UTC(2026,10,9,12);
const crypto={results:[{title:'Bitcoin network research announcement',
 original_url:'https://publisher.example/story?utm_source=panic',
 published_at:new Date(at-60_000).toISOString()}]};
const data={results:[{title:'Bitcoin network research announcement',
 link:'https://publisher.example/story?utm_source=newsdata',
 pubDate:'2026-11-09 11:59:00'}]};
test('raw provider timestamps and URLs are validated locally',()=>{
 assert.equal(parsePersonalProvider('newsdata',data,at).state,'OK');
 assert.equal(parsePersonalProvider('cryptopanic',crypto,at).state,'OK');
 assert.equal(parsePersonalProvider('newsdata',{results:[
  {...data.results[0],link:'http://unsafe.example'}]},at).state,'EMPTY');
 assert.equal(parsePersonalProvider('newsdata',{results:[
  {...data.results[0],pubDate:'2022-01-01 00:00:00'}]},at).state,'EMPTY');
});
test('personal Android news combines two permitted native sources without passing a key',async()=>{
 const requests=[];
 const fake={fetchPersonalNews:async args=>{
  requests.push(args);
  return {state:'OK',raw:args.provider==='newsdata'?data:crypto};
 }};
 const result=await fetchPersonalNewsBundle('BTC',{plugin:fake,now:()=>at});
 assert.equal(result.state,'OK');
 assert.equal(result.articles.length,1);
 assert.deepEqual(result.articles[0].indexedBy,['CryptoPanic','NewsData.io']);
 assert.deepEqual(requests,[{provider:'cryptopanic',coin:'BTC'},
  {provider:'newsdata',coin:'BTC'}]);
 assert.equal(JSON.stringify(result).includes('auth_token'),false);
});
test('native Keystore can be configured only explicitly and key is not echoed',async()=>{
 const calls=[];
 const plugin={
  getPersonalNewsStatus:async()=>({providers:{
   cryptopanic:{configured:false},newsdata:{configured:true}}}),
  setPersonalNewsKey:async args=>{calls.push(args);return{};},
  removePersonalNewsKey:async args=>{calls.push(args);return{};}
 };
 const key='sampletesttoken0123456';
 const result=await changePersonalNewsKey('newsdata',key,{plugin});
 assert.deepEqual(result,{state:'SAVED',provider:'newsdata'});
 assert.equal(JSON.stringify(result).includes(key),false);
 assert.equal((await personalNewsStatus({plugin})).providers.newsdata.configured,true);
 assert.equal((await removePersonalNewsKey('newsdata',{plugin})).state,'REMOVED');
 assert.deepEqual(calls,[{provider:'newsdata',key},{provider:'newsdata'}]);
 assert.equal((await changePersonalNewsKey('newsdata','short',{plugin})).state,'INVALID');
 assert.equal((await changePersonalNewsKey('reddit',key,{plugin})).state,'INVALID');
});
test('missing native plugin never creates a fabricated connection',async()=>{
 assert.equal((await fetchPersonalNewsBundle('BTC',{plugin:null})).state,'ANDROID_ONLY');
 assert.equal((await personalNewsStatus({plugin:null})).native,false);
 const fake={fetchPersonalNews:async ({provider})=>({state:provider==='newsdata'?
  'INVALID_CREDENTIALS':'NOT_CONFIGURED'})};
 const result=await fetchPersonalNewsBundle('BTC',{plugin:fake});
 assert.equal(result.state,'NO_VERIFIED_NEWS');
 assert.equal(result.providers.newsdata,'INVALID_CREDENTIALS');
 assert.equal(result.providers.cryptopanic,'NOT_CONFIGURED');
});

test('on-demand single-provider check reveals actual source state without token or extra calls',async()=>{
 const requests=[];
 const plugin={fetchPersonalNews:async args=>{
  requests.push(args);
  return {state:'OK',cached:true,raw:data};
 }};
 const checked=await checkPersonalNewsProvider('newsdata','BTC',{plugin,now:()=>at});
 assert.deepEqual(requests,[{provider:'newsdata',coin:'BTC'}]);
 assert.equal(checked.state,'OK');
 assert.equal(checked.articleCount,1);
 assert.equal(checked.cached,true);
 assert.equal(checked.newestPublishedAt,at-60_000);
 assert.match(personalNewsDiagnosticLabel(checked),/кеш устройства/);
 assert.equal(JSON.stringify(checked).includes('apikey'),false);
});
test('provider checks distinguish auth, limit and connection problems honestly',async()=>{
 const cases=[
  ['NOT_CONFIGURED','Ключ не настроен'],
  ['INVALID_CREDENTIALS','Неверный'],
  ['FORBIDDEN_OR_LIMITED','Доступ или тариф'],
  ['RATE_LIMITED','Ограничение запросов'],
  ['DAILY_LIMIT','суточный лимит'],
  ['MONTHLY_LIMIT','месячный лимит'],
  ['WAIT_INTERVAL','Интервал'],
  ['OFFLINE','недоступен']
 ];
 for(const [state,label] of cases){
  const r=await checkPersonalNewsProvider('cryptopanic','BTC',{
   plugin:{fetchPersonalNews:async()=>({state})},now:()=>at});
  assert.equal(r.state,state);
  assert.equal(r.articleCount,0);
  assert.ok(personalNewsDiagnosticLabel(r).includes(label));
 }
 const wait=await checkPersonalNewsProvider('newsdata','BTC',{
  plugin:{fetchPersonalNews:async()=>({state:'WAIT_INTERVAL',nextAt:at+600000})}});
 assert.equal(wait.nextAt,at+600000);
 const bad=await checkPersonalNewsProvider('reddit','BTC',{
  plugin:{fetchPersonalNews:async()=>{throw Error('should not run')}}});
 assert.equal(bad.state,'UNSUPPORTED');
});
test('empty valid response means connection succeeded but does not invent articles',async()=>{
 const r=await checkPersonalNewsProvider('newsdata','BTC',{
  plugin:{fetchPersonalNews:async()=>({state:'OK',cached:false,raw:{results:[]}})},
  now:()=>at});
 assert.equal(r.state,'EMPTY');
 assert.equal(r.articleCount,0);
 assert.match(personalNewsDiagnosticLabel(r),/Ответ получен/);
});
