import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {publicationTiming,publishedBarCloseAt,publicationCaveat,
 PUBLICATION_MAX_DELAY} from './scenario-publication-timing.mjs';
import {mapScenarioToViewport} from './scenario-map.mjs';
import {auditDirectionalM1,DIRECTIONAL_LEVEL_VERSION} from './directional-scenario.mjs';
const H=3600000,M=60000;
const anchor=Date.UTC(2026,10,12,3)-1; // last H1 close: 02:59:59.999
const publishedAt=anchor+49*M+44_000;  // publication: 03:49:43.999
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');

test('real 03:49 publication is 49min later than source close, hence stale entry',()=>{
 const s={sourceInterval:'1h',anchorCloseAt:anchor,publishedAt};
 const r=publicationTiming(s);
 assert.equal(r.state,'LATE');
 assert.equal(r.seconds,49*60+44);
 assert.equal(PUBLICATION_MAX_DELAY['1h'],180000);
 assert.match(publicationCaveat(s),/задержкой/);
 assert.equal(publicationTiming({...s,publishedAt:anchor+180000}).state,'FRESH');
 assert.equal(publicationTiming({...s,publishedAt:anchor+180001}).state,'LATE');
 assert.equal(PUBLICATION_MAX_DELAY['15m'],90000);
 assert.equal(PUBLICATION_MAX_DELAY['4h'],300000);
});
test('P belongs to publication candle, not previous close or hypothetical fill',()=>{
 const bars=Array.from({length:4},(_,i)=>({
  closed:true,closeAt:anchor+i*H
 }));
 const scenario={sourceInterval:'1h',anchorCloseAt:anchor,
  targetCloseAt:anchor+24*H,bandLow:115,bandHigh:121,
  publishedAt,milestones:[{key:'PUBLISHED',label:'Публикация',
   observedAt:publishedAt,recordedAt:publishedAt}]};
 const mapped=mapScenarioToViewport(scenario,bars);
 assert.equal(publishedBarCloseAt(publishedAt,'1h'),anchor+H);
 assert.equal(mapped.marks.length,1);
 assert.equal(mapped.marks[0].key,'PUBLISHED');
 assert.equal(mapped.marks[0].index,1);
 assert.equal(mapped.marks[0].observedAt,publishedAt);
 assert.ok(!mapped.marks.some(m=>m.index===0));
 // The still-forming bar isn't painted as though it has closed.
 bars[1].closed=false;
 assert.ok(!mapScenarioToViewport(scenario,bars).marks.some(x=>x.key==='PUBLISHED'));
 assert.equal(publishedBarCloseAt(null,'1h'),null);
});
test('post-publication minute prices below E do NOT create imaginary sell-limit entry',()=>{
 const entry=119.78;
 const plan={version:DIRECTIONAL_LEVEL_VERSION,evaluationInterval:'1m',
  side:'DOWN',entry,sl:120.48,tp1:119.10,tp2:118.41,tp3:117.73,
  anchorCloseAt:anchor,publishedAt,targetCloseAt:anchor+24*H};
 const bar=(i,lateHit=false)=>({
  t:anchor+1+(i-1)*M,closeAt:anchor+i*M,
  open:i<=50?119.78:lateHit?119.77:118.99,
  high:i<=50?120.12:lateHit?119.86:119.21,
  low:i<=50?119.5:lateHit?119.65:118.80,
  close:i<=50?119.78:lateHit?119.76:118.99,
  volume:5,closed:true
 });
 const bars=Array.from({length:53},(_,k)=>bar(k+1));
 const result=auditDirectionalM1(plan,bars,{now:anchor+53*M+1});
 assert.equal(result.state,'WAITING');
 assert.equal(result.entryAt,null);
 assert.equal(result.outcome,'OPEN');
 assert.ok(result.observedBars>=53);
 // A genuine later return to 119.78 CAN be recorded, and only at its close.
 const retest=[...bars];retest[52]=bar(53,true);
 const actual=auditDirectionalM1(plan,retest,{now:anchor+53*M+1});
 assert.equal(actual.entryAt,anchor+53*M);
 assert.equal(actual.state,'ACTIVE');
 assert.deepEqual(actual.hits,[]);
});
test('native rejects stale publication time for each timeframe and old rows stay immutable',()=>{
 const base='../apex9-android/native/src/main/java/com/apexintelligence/research/';
 const gate=read(base+'ApexPublicationGate.kt');
 for(const s of ['H1_LAG = 180_000L','M15_LAG = 90_000L','H4_LAG = 300_000L',
  'now-anchorCloseAt<=allowed','fun isFresh('])
  assert.ok(gate.includes(s),s);
 const h1=read(base+'ApexAutoForecast.kt');
 const multi=read(base+'ApexMultiFrameForecast.kt');
 assert.match(h1,/ApexPublicationGate\.isFresh\("1h",last\.closeTime,now\)/);
 assert.match(multi,/ApexPublicationGate\.isFresh\(spec\.interval,anchor,now\)/);
 assert.ok(!h1.includes('now - last.closeTime > STEP + 90_000'));
 assert.ok(!multi.includes('now-anchor>spec.step+90_000L'));
 assert.ok(read('../apex9-android/scripts/install-native.mjs').includes(
  "'ApexPublicationGate.kt'"));
 assert.ok(read('../apex9-android/scripts/prepare-web.mjs').includes(
  "'scenario-publication-timing.mjs'"));
 const app=read('./app.mjs'),card=read('./forecast-compact-card.mjs');
 assert.ok(app.includes('const lagNotice=publicationCaveat(scenario)'));
 assert.ok(card.includes('publicationCaveat('));
 assert.ok(read('./candle-chart.mjs').includes('actual publication'));
});
