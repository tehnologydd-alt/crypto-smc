import test from 'node:test';
import assert from 'node:assert/strict';
import {buildResearchBrief,BRIEF_RULES} from './research-explanation-brief.mjs';

const source={archiveComplete:true,asset:'ETHUSDT',
  closedBars:900,windows:210,missingHours:0};
const good=()=>({state:'DESCRIPTIVE',asset:'ETHUSDT',source,
 coverage:{regimes:'VERIFIED',transitions:'VERIFIED'},
 observations:[
  {title:'Полная проверенная история',detail:'900 закрытых H1-свечей',
   source:'Research Regimes · Android Room'},
  {title:'Какие режимы встречались в истории',
   detail:'Боковик: 110 (52%), направленный: 60, переход: 40. Это прошлое.',
   source:'Research Regimes · проверенные 4H-окна'}
 ],differences:[
  {title:'Контрольный участок отличается от опорного',
   detail:'Тренд → боковик: +22 п.п. в истории.',
   source:'Research Holdout · проверенные переходы'}
 ],missing:[
  {title:'Мало наблюдений: направленный',
   detail:'Менее 15 случаев в позднем периоде.'},
  {title:'Прогнозная применимость не установлена',
   detail:'История не доказывает будущую точность.'}
 ]});
test('short brief leads with historical mode evidence, not arbitrary score',()=>{
 const r=buildResearchBrief(good());
 assert.equal(r.state,'DESCRIPTIVE');
 assert.equal(r.asset,'ETHUSDT');
 assert.match(r.headline.detail,/Боковик/);
 assert.match(r.headline.source,/Research Regimes/);
 assert.match(r.variance.detail,/22 п.п/);
 assert.match(r.limitation.detail,/Мало наблюдений/);
 assert.deepEqual(r.counts,{observations:2,differences:1,missing:2});
 assert.equal('confidence' in r,false);
 assert.equal('score' in r,false);
 assert.equal(BRIEF_RULES.defaultDetailExpanded,false);
});
test('no flagged variation never becomes stability proof',()=>{
 const x=good();x.differences=[];
 const r=buildResearchBrief(x);
 assert.equal(r.state,'DESCRIPTIVE');
 assert.match(r.variance.title,/не выделены/);
 assert.match(r.variance.detail,/не доказывает устойчивость/);
 assert.equal(r.counts.differences,0);
});
test('generic limitation remains visible if only one missing entry',()=>{
 const x=good();x.missing=x.missing.slice(-1);
 const r=buildResearchBrief(x);
 assert.match(r.limitation.detail,/Прогнозная применимость/);
 assert.match(r.note,/не доказывают прогнозную точность/);
});
test('incomplete, incorrect or absent source never publishes a historic finding',()=>{
 for(const x of [
  null,{state:'HIDDEN',reason:'H1 incomplete'},
  {...good(),source:{...source,missingHours:3}},
  {...good(),source:{...source,archiveComplete:false}},
  {...good(),source:{...source,asset:'BTCUSDT'}},
  {...good(),source:{...source,closedBars:Infinity}},
  {...good(),source:{...source,windows:0}},
  {...good(),coverage:{regimes:'HIDDEN',transitions:'VERIFIED'}},
  {...good(),observations:[]},
  {...good(),observations:[{title:'X'}]},
  {...good(),differences:[{title:'No detail'}]}
 ]){
  const r=buildResearchBrief(x);
  assert.equal(r.state,'BLOCKED');
  assert.equal(r.counts.observations,0);
  assert.equal(r.counts.differences,0);
  assert.match(r.headline.title,/не подтверждена/);
 }
});
test('only verified record sources may appear on the compact leading finding',()=>{
 const report=good();
 report.observations.reverse();
 const out=buildResearchBrief(report);
 assert.match(out.headline.source,/проверенные 4H-окна/);
 assert.match(out.headline.detail,/Боковик/);
});
test('unrecognized difference title remains descriptive and source-attributed',()=>{
 const x=good();
 x.differences=[{title:'Расхождение разметки',
  detail:'Ранний участок отличается от позднего.',
  source:'Research Regime Stability'}];
 const r=buildResearchBrief(x);
 assert.match(r.variance.detail,/Ранний участок/);
 assert.equal(r.variance.source,'Research Regime Stability');
 assert.match(r.note,/Только закрытая проверенная H1-история/);
});
