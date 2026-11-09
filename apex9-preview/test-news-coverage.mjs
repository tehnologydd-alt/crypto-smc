import test from 'node:test';
import assert from 'node:assert/strict';
import {auditDisplayedNews,formatDisplayedNewsAudit} from './news-coverage.mjs';
const at=Date.UTC(2026,10,9,12);
const article=(title,hoursAgo,more={})=>({title,
 href:'https://publisher.example/'+title.toLowerCase().replaceAll(' ','-'),
 observedAt:at-hoursAgo*3600000,source:'GDELT',timeKind:'INDEXED',...more});
test('audit distinguishes title mention, indexing time, real publication and delay',()=>{
 const r=auditDisplayedNews([
  article('Bitcoin network update',1,{timeKind:'PUBLISHED',
   source:'CryptoPanic',indexedBy:['CryptoPanic','NewsData.io']}),
  article('Cryptocurrency regulation report',14),
  article('Ethereum security incident',28,{
   href:'https://another.example/eth-report'}),
  article('Unknown interview headline',2)
 ],{asset:'BTC',now:at});
 assert.equal(r.state,'OK');
 assert.equal(r.total,4);
 assert.equal(r.mentionsAsset,1);
 assert.equal(r.generalTopic,1);
 assert.equal(r.otherAsset,1);
 assert.equal(r.unresolved,1);
 assert.equal(r.publishedTime,1);
 assert.equal(r.indexedTime,3);
 assert.equal(r.olderThan12h,2);
 assert.equal(r.olderThan24h,1);
 assert.equal(r.uniquePublisherDomains,2);
 assert.equal(r.multiIndexerStories,1);
 assert.deepEqual(r.providerIndexers,['CryptoPanic','GDELT','NewsData.io']);
 assert.match(formatDisplayedNewsAudit(r,'BTC'),/не проверка истинности/);
 assert.equal(r.scope,'HEADLINES_ONLY_NO_CAUSAL_OR_SENTIMENT_INFERENCE');
});
test('empty and bad results do not invent news coverage',()=>{
 const empty=auditDisplayedNews([],{now:at});
 assert.equal(empty.state,'OK');
 assert.equal(empty.total,0);
 assert.match(formatDisplayedNewsAudit(empty,'BTC'),/пока нет/);
 assert.equal(auditDisplayedNews(null,{now:at}).state,'INVALID');
 assert.equal(auditDisplayedNews(Array(101),{now:at}).state,'INVALID');
 assert.equal(auditDisplayedNews([],{asset:'__proto__',now:at}).state,'INVALID');
});
test('one indexed story appearing in two providers is not two independent articles',()=>{
 const r=auditDisplayedNews([article('Bitcoin developer network upgrade',13,{
  indexedBy:['CryptoPanic','NewsData.io','GDELT']})],{asset:'BTC',now:at});
 assert.equal(r.total,1);
 assert.equal(r.multiIndexerStories,1);
 assert.equal(r.providerIndexers.length,3);
 assert.equal(r.mentionsAsset,1);
});
