import test from 'node:test';
import assert from 'node:assert/strict';
import {cleanArticleUrl,headlineKey,consolidateArticles,
 KEYED_NEWS_PROVIDERS} from './news-source-fusion.mjs';
const at=Date.UTC(2026,10,9,12);
test('strip tracking but keep meaningful query identifiers',()=>{
 assert.equal(cleanArticleUrl('https://news.example/story?id=5&utm_source=reddit#top'),
  'https://news.example/story?id=5');
 assert.equal(cleanArticleUrl('javascript:alert(1)'),null);
 assert.equal(cleanArticleUrl('https://user:pass@news.example/story'),null);
});
test('same story indexed twice never becomes independent confirmation',()=>{
 const a=consolidateArticles([
  {title:'Bitcoin ETF approval update',href:'https://news.example/story?utm_source=x',
   source:'GDELT',observedAt:at},
  {title:'Bitcoin ETF approval update!',href:'https://other.example/article',
   source:'NewsData.io',observedAt:at-2000},
  {title:'Bitcoin ETF approval update',href:'https://news.example/story',
   source:'CryptoPanic',observedAt:at-3000}
 ]);
 assert.equal(a.length,1);
 assert.equal(a[0].confirmationCount,3);
 assert.deepEqual(a[0].indexedBy,['GDELT','NewsData.io','CryptoPanic']);
});
test('different headlines stay separate, domain diversity caps output',()=>{
 const list=consolidateArticles([
  {title:'Bitcoin ETF filing',href:'https://one.example/1',observedAt:at},
  {title:'Ethereum exchange upgrade',href:'https://one.example/2',observedAt:at-1},
  {title:'Solana network status',href:'https://one.example/3',observedAt:at-2},
  {title:'Stablecoin legal update',href:'https://two.example/4',observedAt:at-3}
 ],{perDomain:2});
 assert.equal(list.length,3);
 assert.equal(headlineKey('BITCOIN   ETF filing!'),'bitcoin etf filing');
});
test('keyed providers are not marked live in a client-only build',()=>{
 for(const p of Object.values(KEYED_NEWS_PROVIDERS))
  assert.notEqual(p.state,'OK');
});
