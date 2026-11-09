import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeNewsCollection,formatNewsCollectionAnalysis} from './news-research-analysis.mjs';

const now=Date.UTC(2026,10,9,12);
const story=(title,hoursAgo,extra={})=>({
 title,href:'https://publisher.example/article-'+hoursAgo,
 observedAt:now-hoursAgo*3600_000,timeKind:'PUBLISHED',
 source:'CoinDesk RSS',...extra
});

test('analyzes only real attributed recent headlines and neutral themes',()=>{
 const rows=[
  story('Bitcoin regulation law update',1),
  story('Bitcoin network security incident',9,{
   href:'https://other.example/incident',timeKind:'INDEXED',
   indexedBy:['GDELT','NewsData.io']}),
  story('Ethereum blockchain upgrade',26),
  story('Bitcoin ETF filing',49),
  story('Bitcoin exchange report',0,{
   href:'http://insecure.example/insecure'})
 ];
 const r=analyzeNewsCollection(rows,{asset:'BTC',now});
 assert.equal(r.state,'OK');
 assert.equal(r.total,3);
 assert.equal(r.direct,2);
 assert.equal(r.otherAssets,1);
 assert.equal(r.recent6h,1);
 assert.equal(r.within24h,1);
 assert.equal(r.older24h,1);
 assert.equal(r.publishedTimes,2);
 assert.equal(r.indexedTimes,1);
 assert.equal(r.uniquePublishers,2);
 assert.equal(r.multiIndexed,1);
 assert.equal(r.topics['Регулирование'],1);
 assert.equal(r.topics['Сеть'],2);
 assert.match(formatNewsCollectionAnalysis(r,'BTC'),/Регулирование/);
 assert.match(formatNewsCollectionAnalysis(r,'BTC'),/не являются независимым/);
 assert.equal(r.scope,'HEADLINE_CONTEXT_ONLY_NO_EVENT_VERIFICATION_OR_PRICE_DIRECTION');
});

test('zero headlines do not create thematic findings or a trade inference',()=>{
 const r=analyzeNewsCollection([], {asset:'ETH',now});
 assert.equal(r.state,'EMPTY');
 assert.equal(r.total,0);
 assert.equal(r.uniquePublishers,0);
 assert.match(formatNewsCollectionAnalysis(r,'ETH'),/заголовков нет/);
});

test('invalid or stale rows are excluded and unsupported input is explicit',()=>{
 const rows=[story('Bitcoin network release',1,{observedAt:now+120000}),
  story('Bitcoin network release',1,{href:'javascript:alert(1)'}),
  story('Ethereum ETF report',1,{href:'https://auth:pw@bad.example/x'}),
  story('Ethereum network update',1)];
 const r=analyzeNewsCollection(rows,{asset:'BTC',now});
 assert.equal(r.total,1);
 assert.equal(r.direct,0);
 assert.equal(r.otherAssets,1);
 assert.match(formatNewsCollectionAnalysis(r,'BTC'),/Прямых упоминаний BTC/);
 assert.equal(analyzeNewsCollection(null,{now}).state,'INVALID');
 assert.equal(analyzeNewsCollection(Array(101),{now}).state,'INVALID');
 assert.equal(analyzeNewsCollection([],{asset:'BTC<script>',now}).state,'INVALID');
});
