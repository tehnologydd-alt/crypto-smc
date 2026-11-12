import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {compactLevelPrice,compactOpenForecastCard} from './forecast-compact-card.mjs';
import {priceText} from './forecast-card-ux.mjs';

const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const flatten=(node)=>[node,...(node.children||[]).flatMap(flatten)];
const makeDocument=()=>({
 createElement(tag){
  return {
   tagName:tag,className:'',textContent:'',children:[],
   attrs:{},handlers:{},dataset:{},
   append(...children){this.children.push(...children);},
   setAttribute(k,v){this.attrs[k]=v;},
   addEventListener(k,v){this.handlers[k]=v;}
  };
 }
});
function scenario(){
 const now=Date.now();
 const plan={asset:'ETHUSDT',side:'UP',entry:1.02345678,
  sl:1.0000091234,tp1:1.123456789,tp2:1.223456789,
  tp3:1.323456789,evaluationInterval:'1m',
  publishedAt:now-60000,targetCloseAt:now+3600000};
 return {row:{id:'direction2:ETHUSDT:1h:1762880000000',asset:'ETHUSDT',
  interval:'1h'},plan};
}
test('show at most 5 decimal digits and never show a positive micro-price as 0',()=>{
 assert.equal(compactLevelPrice(1.123456789),'1.12346');
 assert.equal(compactLevelPrice(1.2),'1.2');
 assert.equal(compactLevelPrice(10),'10');
 assert.equal(compactLevelPrice(0.00001),'0.00001');
 assert.equal(compactLevelPrice(0.00000009),'<0.00001');
 assert.equal(compactLevelPrice(0),'—');
 assert.equal(compactLevelPrice(NaN),'—');
 for(const p of [1.112345678,12.0,0.00002,0.017849]) {
  const value=compactLevelPrice(p);
  assert.match(value,/^(?:<)?\d+(?:\.\d{1,5})?$/);
 }
});
test('open-card SL and each TP copy source-derived full decimal, not rounded UI label',async()=>{
 const previous=globalThis.document;
 globalThis.document=makeDocument();
 try {
  const {row,plan}=scenario();
  const clipboard=[];
  const card=compactOpenForecastCard(row,{plan,stage:'ACTIVE',
   copyText:async s=>(clipboard.push(s),true)});
  const buttons=flatten(card).filter(x=>x.className==='forecast-compact-level-copy');
  assert.equal(buttons.length,8); // entry/TP1/SL, then entry/SL/TP1/TP2/TP3
  assert.equal(buttons[1].textContent,'1.12346');
  assert.equal(buttons[2].textContent,'1.00001');
  assert.equal(buttons[6].textContent,'1.22346');
  assert.equal(buttons[7].textContent,'1.32346');
  assert.equal(buttons[1].attrs['aria-label'].includes('скопировать'),true);
  assert.equal(buttons[2].title.includes('полную цену'),true);
  for(const [key,idx] of [['tp1',1],['sl',2],['tp2',6],['tp3',7]]) {
   buttons[idx].handlers.click();
   await new Promise(resolve=>setImmediate(resolve));
   assert.equal(clipboard.at(-1),priceText(plan[key]));
  }
  assert.notEqual(clipboard[0],buttons[1].textContent);
  const feedback=flatten(card).find(x=>x.className==='forecast-compact-copy-feedback');
  assert.match(feedback.textContent,/скопирована полная цена/);
 } finally {globalThis.document=previous;}
});
test('clipboard is wired for both one-frame and multiframe active card renderers',()=>{
 const single=read('./forecast-directional-card.mjs');
 const multi=read('./forecast-multiframe.mjs');
 const dispatcher=read('./favorite-dashboard.mjs');
 assert.match(single,/events:timeline.state==='VERIFIED'\?row.stageEvents:\[\]/);
 assert.match(single,/tracked,onToggle,onOpen,copyText/);
 assert.match(multi,/events:row.stageEvents,tracked,onToggle,onOpen,copyText/);
 assert.match(dispatcher,/compactifyCompletedCard\(row,multiFrameForecastCard\(row,\{/);
 assert.match(dispatcher,/sourceM1:sourceM5,copyText:copyResearchText/);
});
test('completed cards share compact outer layout but preserve verified result details',()=>{
 const single=read('./forecast-directional-card.mjs');
 const multi=read('./forecast-multiframe.mjs');
 assert.match(single,/if\(!finishedRoom&&visibleStage!=='COMPLETED'\)/);
 assert.match(multi,/if\(!complete\)\{/);
 assert.match(single,/renderCompletedResearchPanel/);
 assert.match(multi,/renderCompletedResearchPanel/);
 const dispatcher=read('./favorite-dashboard.mjs');
 assert.match(dispatcher,/function compactifyCompletedCard\(row,card\)/);
 assert.match(dispatcher,/card.append\(details,\.\.\.buttons\)/);
 assert.match(dispatcher,/card.classList.add\('forecast-compact-card','forecast-unified-completed'\)/);
});
