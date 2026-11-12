import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {marketOverviewSnapshot,radarCandleFreshness,scenarioSideSummary}
 from './clean-intelligence.mjs';

const read=name=>readFileSync(new URL(name,import.meta.url),'utf8');

test('independent CoinGecko and Fear & Greed freshness is explicit',()=>{
 const live=marketOverviewSnapshot({state:'OK',change:'+1,25%',dominance:'52,1%',
  mood:'Страх',value:'27 / 100',
  sentimentSource:'Alternative.me · Свежий ответ · наблюдение 12.11.2026'});
 assert.equal(live.marketState,'OBSERVED');
 assert.equal(live.fearState,'OBSERVED');
 assert.equal(live.trend,'positive');
 assert.equal(live.marketLabel,'');
 assert.equal(live.fearLabel,'');
 const mixed=marketOverviewSnapshot({state:'OK',change:'-2,0%',dominance:'52%',
  mood:'Страх',value:'27 / 100',
  sentimentSource:'Alternative.me · Сохранённый индекс · наблюдение 11.11.2026'});
 assert.equal(mixed.marketState,'OBSERVED');
 assert.equal(mixed.fearState,'STALE');
 assert.equal(mixed.fearLabel,' · архив');
 assert.match(mixed.note,/сохранённый индекс/);
 const staleMarket=marketOverviewSnapshot({state:'STALE',change:'+3,9%',
  dominance:'53%',mood:'Нейтрально',value:'50 / 100',
  sentimentSource:'Alternative.me · Свежий ответ'});
 assert.equal(staleMarket.marketState,'STALE');
 assert.equal(staleMarket.fearState,'OBSERVED');
 assert.equal(staleMarket.trend,'unknown');
 assert.match(staleMarket.note,/устарели/);
 const missing=marketOverviewSnapshot({state:'INVALID',change:'+10%',dominance:'60%',
  mood:'Нет свежего значения',value:'—',sentimentSource:'нет ответа'});
 assert.equal(missing.change,'—');
 assert.equal(missing.dominance,'—');
 assert.equal(missing.sentiment,'—');
 assert.equal(missing.fearState,'UNKNOWN');
});
test('Radar age changes only on closed-candle source time, not generated prices',()=>{
 const now=Date.UTC(2026,10,12,17,0,0);
 const fresh=radarCandleFreshness({closedAt:now-60000,interval:'15m',now});
 assert.equal(fresh.state,'OBSERVED');
 assert.match(fresh.label,/Свеча/);
 assert.equal(fresh.warning,null);
 const expired=radarCandleFreshness({
  closedAt:now-(2*900000+60001),interval:'15m',now
 });
 assert.equal(expired.state,'STALE');
 assert.match(expired.label,/Архив/);
 const saved=radarCandleFreshness({
  closedAt:now-60000,interval:'1h',saved:true,now
 });
 assert.equal(saved.state,'STALE');
 const missing=radarCandleFreshness({closedAt:0,interval:'1h',now});
 assert.equal(missing.state,'UNKNOWN');
 assert.match(missing.warning,/времени/);
 const future=radarCandleFreshness({closedAt:now+61000,interval:'1h',now});
 assert.equal(future.state,'UNKNOWN');
 assert.equal(radarCandleFreshness({closedAt:now-1,interval:'3h',now}).state,'UNKNOWN');
});
test('side filter count matches only the cards displayed, not total Room history',()=>{
 const sides=['LONG','SHORT','UNKNOWN','SHORT'];
 const all=scenarioSideSummary(sides,'ALL');
 assert.deepEqual([all.shown,all.total],[4,4]);
 const long=scenarioSideSummary(sides,'LONG');
 assert.deepEqual([long.shown,long.total],[1,4]);
 const short=scenarioSideSummary(sides,'SHORT');
 assert.deepEqual([short.shown,short.total],[2,4]);
 assert.match(short.label,/2 из 4/);
 assert.match(scenarioSideSummary([], 'LONG').label,/архивы отдельно/);
});
test('new UI freshness states are live DOM projections, no extra source calls',()=>{
 const layout=read('./clean-intelligence.mjs');
 const index=read('./index.html');
 const css=read('./clean-intelligence.css');
 for(const id of ['ci-cap-caption','ci-btc-caption','ci-fear-caption']){
  assert.ok(index.includes('id="'+id+'"'),'Market source caption: '+id);
 }
 assert.match(layout,/sentimentSource:byId\('free-fear-status'\)\?\.textContent/);
 assert.match(layout,/byId\('free-fear-status'\)/);
 assert.match(layout,/observeSourceUpdates\(\[/);
 assert.match(layout,/refreshRadarAge\(card\)/);
 assert.match(layout,/document\.addEventListener\('visibilitychange'/);
 assert.match(layout,/const ageClock=setInterval/);
 assert.match(layout,/const summary=scenarioSideSummary/);
 assert.match(css,/strong\[data-freshness="STALE"\]/);
 assert.match(css,/ci-radar-age-chip\[hidden\]/);
 assert.ok(!layout.includes('getMobileCandles('));
 assert.ok(!layout.includes('getMobileResearchForecasts('));
});
