import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 forecastLevelMetrics,displayPriceMove,displayRiskReward,
 completedResearchPresentation
} from './forecast-level-metrics.mjs';

const long={side:'UP',entry:100,sl:98,tp1:102,tp2:104,tp3:106};
const short={side:'DOWN',entry:100,sl:102,tp1:98,tp2:96,tp3:94};
test('LONG: % is signed price move from entry; R:R measures target versus SL',()=>{
 const m=forecastLevelMetrics(long);
 assert.equal(m.state,'VALID');
 assert.equal(m.riskPct,2);
 assert.equal(m.sl.deltaPct,-2);
 assert.equal(m.sl.rMultiple,-1);
 assert.equal(m.targets.tp1.deltaPct,2);
 assert.equal(m.targets.tp2.deltaPct,4);
 assert.equal(m.targets.tp3.deltaPct,6);
 assert.equal(m.targets.tp1.rMultiple,1);
 assert.equal(m.targets.tp2.rMultiple,2);
 assert.equal(m.targets.tp3.rMultiple,3);
 assert.equal(displayPriceMove(m.sl.deltaPct),'−2.00%');
 assert.equal(displayPriceMove(m.targets.tp1.deltaPct),'+2.00%');
 assert.equal(displayRiskReward(m.targets.tp3.rMultiple),'R:R 1:3');
 assert.match(m.note,/не результат сделки/);
});
test('SHORT: falling price is negative %, but each target has positive R multiple',()=>{
 const m=forecastLevelMetrics(short);
 assert.equal(m.state,'VALID');
 assert.equal(m.sl.deltaPct,2);
 assert.equal(m.targets.tp1.deltaPct,-2);
 assert.equal(m.targets.tp2.deltaPct,-4);
 assert.equal(m.targets.tp3.deltaPct,-6);
 assert.equal(m.targets.tp3.rMultiple,3);
 assert.equal(displayPriceMove(m.targets.tp3.deltaPct),'−6.00%');
 assert.equal(displayRiskReward(2.5),'R:R 1:2.5');
});
test('invalid levels or zero SL risk never produce misleading R:R',()=>{
 assert.equal(forecastLevelMetrics({...long,sl:100}).state,'INVALID');
 assert.equal(forecastLevelMetrics({...long,side:'DOWN'}).state,'INVALID');
 assert.equal(forecastLevelMetrics({...short,tp2:99}).state,'INVALID');
 assert.equal(forecastLevelMetrics({...short,tp3:0}).state,'INVALID');
 assert.equal(forecastLevelMetrics({...long,sl:NaN}).state,'INVALID');
 assert.equal(displayPriceMove(Infinity),'—');
 assert.equal(displayRiskReward(0),'—');
 assert.equal(displayPriceMove(.00005),'+0.0001%');
});
test('completed TP3 and STOP are vividly distinguished only if verified by Room',()=>{
 const green=completedResearchPresentation({
  outcome:'TP3',verified:true,entered:true,
  touched:['TP1','TP2','TP3'],frame:'M5'});
 assert.equal(green.tone,'tp3');
 assert.equal(green.label,'Цель TP3 достигнута');
 assert.equal(green.stages.length,3);
 assert.deepEqual(green.stages.map(s=>s.done),[true,true,true]);
 assert.equal(green.touchedCount,3);
 assert.deepEqual(green.touched,['TP1','TP2','TP3']);
 assert.equal(green.frame,'M5');
 const red=completedResearchPresentation({
  outcome:'STOP',verified:true,entered:true,touched:['TP1'],frame:'M15'});
 assert.equal(red.tone,'stop');
 assert.equal(red.label,'Стоп достигнут');
 assert.equal(red.touchedCount,1);
 assert.deepEqual(red.stages.map(s=>s.done),[true,true,true]);
 const unknown=completedResearchPresentation({
  outcome:'AMBIGUOUS',verified:true,entered:true,touched:[]});
 assert.equal(unknown.tone,'unknown');
 const noEntry=completedResearchPresentation({
  outcome:'NOT_ENTERED',verified:true,entered:false});
 assert.equal(noEntry.stages[1].done,false);
 const unverified=completedResearchPresentation({
  outcome:'TP3',verified:false,entered:true,touched:['TP1','TP2','TP3']});
 assert.equal(unverified.tone,'unknown');
 assert.equal(unverified.touchedCount,0);
 assert.equal(unverified.stages[2].done,false);
});
test('both All and Marked render through shared cards with outcome strip and level math',()=>{
 const file=p=>readFileSync(new URL(p,import.meta.url),'utf8');
 const favorites=file('./favorite-dashboard.mjs');
 const directional=file('./forecast-directional-card.mjs');
 const multiframes=file('./forecast-multiframe.mjs');
 const css=file('./styles.css');
 const prep=file('../apex9-android/scripts/prepare-web.mjs');
 assert.ok(favorites.includes('mode:journalMode,stage'));
 assert.ok(favorites.includes('for(const row of directed)box.append(renderCard(row))'));
 assert.ok(favorites.includes('for(const row of multi)box.append(renderCard(row))'));
 assert.ok(favorites.includes("if(journalMode==='tracked')void loadMarkedRows"));
 assert.ok(directional.includes('renderCompletedResearchPanel(plan,'));
 assert.ok(multiframes.includes('renderCompletedResearchPanel(plan,'));
 assert.ok(directional.includes('forecastLevelMetrics(plan)'));
 assert.ok(multiframes.includes('forecastLevelMetrics(plan)'));
 assert.ok(directional.includes('displayRiskReward(metrics.targets[key].rMultiple)'));
 assert.ok(multiframes.includes('displayRiskReward(metrics.targets[key].rMultiple)'));
 assert.ok(directional.includes('Показать вход, цели и итог'));
 assert.ok(multiframes.includes('Показать вход, цели и итог'));
 assert.ok(directional.includes("tone-'+completion.tone"));
 assert.ok(multiframes.includes("tone-'+completion.tone"));
 assert.ok(css.includes('.forecast-completed-stages'));
 assert.ok(css.includes('.forecast-record.forecast-visual.is-completed.tone-stop'));
 assert.ok(css.includes('.forecast-record.forecast-visual.is-completed.tone-tp3'));
 assert.ok(prep.includes("'forecast-level-metrics.mjs'"));
 const legacy=file('./forecast-directional-card.mjs');
 assert.ok(legacy.includes('Архив диапазона · H1 · без направления'));
});
