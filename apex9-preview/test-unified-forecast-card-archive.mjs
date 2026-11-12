import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createForecastIdentity,recordedForecastSide}
 from './forecast-card-identity.mjs';
import {forecastExpiredUnverified,filterForecastJournal}
 from './forecast-stale-archive.mjs';
import {scenarioJournalState} from './scenario-journal-state.mjs';
const H=3600000,M=60000;
const baseAt=Date.UTC(2026,10,12,4)-1;
const publishedAt=baseAt+M+1000;
const now=publishedAt+30*H;
const row=(asset='ADAUSDT',horizon='15m',isDone=false)=>{
 const hours=horizon==='15m'?4:horizon==='1h'?24:96;
 const close=baseAt+hours*H;
 const prefix=horizon==='1h'?'direction2':'direction3';
 return {id:prefix+':'+asset+':'+horizon+':'+baseAt,
  asset,interval:horizon,publishedAt,
  stageEvents:[],status:'PENDING_CONFIRMATION',
  hypothesis:{model:horizon==='1h'?'EMPIRICAL_DIRECTION_LEVELS_V2':
    'EMPIRICAL_MULTIFRAME_DIRECTION_V1',
   direction:'DOWN',anchorCloseAt:baseAt,targetCloseAt:close},
  ...(isDone?{evaluation:{outcome:'NOT_ENTERED',targetCloseAt:close}}:{})};
};
const source=p=>readFileSync(new URL(p,import.meta.url),'utf8');
test('the creation timestamp is directly BELOW asset+LONG/SHORT on all card types',()=>{
 const before=globalThis.document;
 globalThis.document={createElement(tag){
  return {tag,children:[],className:'',textContent:'',
   append(...xs){this.children.push(...xs)}};
 }};
 try{
  const yes=row('ADAUSDT','15m');
  assert.equal(recordedForecastSide(yes),'SHORT');
  const x=createForecastIdentity(yes,{frame:'M15',method:'M1 контроль'});
  assert.match(x.children[0].textContent,/ADA\/USDT · M15 · SHORT/);
  assert.match(x.children[1].textContent,/Создан: 12\.11\.2026/);
  assert.match(x.children[1].textContent,/04:01/);
  assert.equal(x.children[2].textContent,'M1 контроль');
  assert.equal(createForecastIdentity({...yes,hypothesis:{...yes.hypothesis,
   direction:'UP'}}).children[0].textContent.includes('LONG'),true);
  const legacy={id:'range1:ADAUSDT:1h:1794480000000',
   asset:'ADAUSDT',interval:'1h',publishedAt};
  assert.equal(recordedForecastSide(legacy),null);
  assert.match(createForecastIdentity(legacy).children[0].textContent,/без направления/);
 }finally{globalThis.document=before;}
});
test('old unverified scenarios become separate archive, not forged completed outcomes',()=>{
 const old=row('ADAUSDT');
 assert.equal(forecastExpiredUnverified(old,{now})?.state,'EXPIRED_UNVERIFIED');
 const oldH1=row('BTCUSDT','1h');
 assert.equal(forecastExpiredUnverified(oldH1,{now})?.state,'EXPIRED_UNVERIFIED');
 const h4=row('ETHUSDT','4h');
 assert.equal(forecastExpiredUnverified(h4,{now}),null);
 assert.equal(forecastExpiredUnverified(row('AVAXUSDT','15m',true),{now}),null);
 const r=filterForecastJournal([old,oldH1,h4],{now,
  hiddenIds:[oldH1.id]});
 assert.equal(r.expired.length,1);
 assert.equal(r.active.length,1);
 assert.equal(r.suppressed.length,1);
 const view=scenarioJournalState([old,oldH1,h4],{now,hiddenIds:[oldH1.id]});
 assert.equal(view.archiveUnverified.length,1);
 assert.equal(view.archiveUnverified[0].id,old.id);
 assert.equal(view.counts.COMPLETED,0);
 assert.equal(view.counts.PENDING_CONFIRMATION,1);
 assert.equal(view.inWork,1);
 assert.equal(view.hiddenCount,1);
});
test('an expired old row never mutates Android data or stage events',()=>{
 const original=row('BTCUSDT');
 const snapshot=JSON.stringify(original);
 const out=filterForecastJournal([original],{now});
 assert.equal(out.expired.length,1);
 assert.equal(JSON.stringify(original),snapshot);
 assert.equal(original.evaluation,undefined);
 assert.equal(out.expired[0].archiveReason.includes('не TP и не SL'),true);
 assert.equal(forecastExpiredUnverified({...original,
  hypothesis:{...original.hypothesis,targetCloseAt:NaN}},{now}),null);
 assert.equal(forecastExpiredUnverified(original,{now:publishedAt+20*M}),null);
});
test('all category layouts use the shared heading; terminal tone styles remain',()=>{
 const compact=source('./forecast-compact-card.mjs');
 const direction=source('./forecast-directional-card.mjs');
 const multi=source('./forecast-multiframe.mjs');
 const dashboard=source('./favorite-dashboard.mjs');
 const css=source('./styles.css');
 const pack=source('../apex9-android/scripts/prepare-web.mjs');
 for(const s of [compact,direction,multi])
  assert.match(s,/createForecastIdentity\(row/);
 assert.ok(css.includes('.forecast-visual.is-completed .forecast-created-at'));
 assert.ok(css.includes('.forecast-journal-hide'));
 assert.ok(css.includes('.forecast-expired-archive'));
 assert.ok(dashboard.includes('apex9_hidden_research_ids_v1'));
 assert.ok(dashboard.includes('Перенесено в архив')===false); // archive reason comes from helper
 assert.ok(dashboard.includes('Просроченные · без подтверждённого исхода'));
 assert.ok(dashboard.includes("'Убрать из журнала'"));
 assert.ok(dashboard.includes("'Вернуть все'"));
 assert.ok(dashboard.includes('function compactifyCompletedCard(row,card)'));
 assert.ok(dashboard.includes("card.classList.add('forecast-compact-card','forecast-unified-completed')"));
 assert.ok(dashboard.includes('card.append(levelRow,feedback)'));
 assert.ok(dashboard.includes('card.append(details,...buttons)'));
 assert.ok(css.includes('.forecast-unified-completed>.forecast-compact-price-row'));
 // The visual wrapper must not discard source levels/events: its original
 // full card nodes are attached to the single folded source-data section.
 assert.ok(dashboard.includes('else details.append(item)'));
 assert.ok(source('./app.mjs').includes("'apex9_hidden_research_ids_v1'"));
 assert.ok(source('../apex9-android/native/src/main/java/com/apexintelligence/research/ApexPortableBackup.kt')
  .includes('uiHiddenIds'));
 assert.ok(source('../apex9-android/native/src/main/java/com/apexintelligence/research/ApexNativePlugin.kt')
  .includes('uiHiddenIds'));
 for(const file of ['forecast-card-identity.mjs','forecast-stale-archive.mjs'])
  assert.ok(pack.includes("'"+file+"'"));
});
