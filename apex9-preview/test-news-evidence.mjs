import test from 'node:test';
import assert from 'node:assert/strict';
import {describeNewsEvidence} from './news-evidence.mjs';
const now=Date.UTC(2026,10,9,12);
test('never treats publication indexers as independent fact confirmation',()=>{
 const r=describeNewsEvidence({title:'Bitcoin network upgrade',
  observedAt:now-60_000,timeKind:'PUBLISHED',
  source:'CryptoPanic',indexedBy:['CryptoPanic','NewsData.io']},
 {now,asset:'BTC'});
 assert.equal(r.focus,'DIRECT');
 assert.equal(r.timeKind,'PUBLISHED');
 assert.equal(r.timing,'Время публикации');
 assert.equal(r.indexerCount,2);
 assert.equal(r.hasIndependentConfirmation,false);
 assert.equal(r.marketDirection,'NOT_INFERRED');
});
test('GDELT indexed date is distinct from provider published date',()=>{
 const r=describeNewsEvidence({title:'Ethereum exchange policy update',
  observedAt:now-10*3600_000,timeKind:'INDEXED',source:'GDELT'},
 {now,asset:'BTC'});
 assert.equal(r.timeKind,'INDEXED');
 assert.equal(r.timing,'Время индексации');
 assert.equal(r.focus,'OTHER_ASSETS');
 assert.equal(r.freshness,'DELAYED');
 assert.equal(r.ageLabel,'10 ч назад');
});
test('coin tickers avoid SOL as ordinary lowercase word and missing dates',()=>{
 const sol=describeNewsEvidence({title:'New report from sol teams',observedAt:0},
  {now,asset:'SOL'});
 assert.equal(sol.focus,'UNCLEAR');
 assert.equal(sol.freshness,'UNKNOWN');
 const real=describeNewsEvidence({title:'Solana blockchain upgrade',
  observedAt:now-25*3600_000,timeKind:'PUBLISHED'}, {now,asset:'SOL'});
 assert.equal(real.focus,'DIRECT');
 assert.equal(real.freshness,'OLD');
 assert.equal(real.topics.includes('Сеть'),true);
});
test('general crypto coverage is not attributed to a particular asset',()=>{
 const r=describeNewsEvidence({title:'Cryptocurrency regulation updates',
  observedAt:now,timeKind:'INDEXED'}, {now,asset:'BTC'});
 assert.equal(r.focus,'GENERAL');
 assert.deepEqual(r.mentions,[]);
});

test('extended asset names remain explicit headline mentions, not generic tokens',()=>{
 const ton=describeNewsEvidence({title:'Toncoin network upgrade',
  href:'https://publisher.example/ton',observedAt:now,timeKind:'PUBLISHED'},
  {now,asset:'GRAM'});
 assert.equal(ton.focus,'DIRECT');
 assert.equal(ton.marketDirection,'NOT_INFERRED');
 const chainlink=describeNewsEvidence({title:'Chainlink network upgrade',
  href:'https://publisher.example/link',observedAt:now},
  {now,asset:'LINK'});
 assert.equal(chainlink.focus,'DIRECT');
 const unrelated=describeNewsEvidence({title:'Online links and internet reports',
  href:'https://publisher.example/other',observedAt:now},
  {now,asset:'LINK'});
 assert.equal(unrelated.focus,'UNCLEAR');
});
