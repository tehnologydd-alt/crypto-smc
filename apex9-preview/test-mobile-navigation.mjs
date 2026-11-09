import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 FAVORITE_HOLD_MS,FAVORITE_REMOVE_PX,
 favoriteSwipeDecision,bindFavoriteHoldSwipe
} from './favorite-gesture.mjs';

const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const html=read('./index.html'),css=read('./styles.css'),
 app=read('./app.mjs'),favorites=read('./favorite-dashboard.mjs');
class FakeCard{
 constructor(){
  this.events=new Map();this.style={};
  const names=new Set();
  this.classList={
   add:n=>names.add(n),remove:n=>names.delete(n),contains:n=>names.has(n)
  };
 }
 addEventListener(type,handler){
  const handlers=this.events.get(type)||[];
  handlers.push(handler);this.events.set(type,handlers);
 }
 removeEventListener(type,handler){
  this.events.set(type,(this.events.get(type)||[]).filter(h=>h!==handler));
 }
 emit(type,event){
  for(const fn of this.events.get(type)||[])fn(event);
 }
}
const touch=(x,y,identifier=1)=>({clientX:x,clientY:y,identifier});
const target={closest:()=>null};

test('five navigation destinations fit in one dock row, overview returns to favorites',()=>{
 const dock=css.slice(css.indexOf('.tabs.bottom-dock{'),css.indexOf('.bottom-dock .tab{'));
 assert.match(dock,/grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/);
 assert.ok(html.includes('id="overview-favorites-anchor"'));
 assert.ok(app.includes("const node=view==='overview'?"));
 assert.ok(app.includes("el('overview-favorites-anchor')"));
 const nav=html.slice(html.indexOf('<nav class="tabs bottom-dock"'),
  html.indexOf('</nav>',html.indexOf('<nav class="tabs bottom-dock"')));
 assert.equal([...nav.matchAll(/data-tab="[^"]+"/g)].length,5);
 assert.ok(nav.includes('aria-label="Исследования"'));
});
test('swipe requires hold and mostly upward movement',()=>{
 assert.equal(FAVORITE_HOLD_MS,480);
 assert.equal(FAVORITE_REMOVE_PX,65);
 assert.equal(favoriteSwipeDecision({held:false,dy:-80}),false);
 assert.equal(favoriteSwipeDecision({held:true,dy:-64}),false);
 assert.equal(favoriteSwipeDecision({held:true,dy:80}),false);
 assert.equal(favoriteSwipeDecision({held:true,dx:90,dy:-130}),false);
 assert.equal(favoriteSwipeDecision({held:true,dx:20,dy:-80}),true);
 assert.equal(favoriteSwipeDecision({held:true,dy:NaN}),false);
});
test('swipe before arming is native scroll, not a deletion',()=>{
 const card=new FakeCard();
 let removes=0;
 const stop=bindFavoriteHoldSwipe(card,{onRemove:()=>removes++});
 card.emit('touchstart',{touches:[touch(30,110)],target});
 let prevented=false;
 card.emit('touchmove',{touches:[touch(30,15)],cancelable:true,
  preventDefault(){prevented=true;}});
 card.emit('touchend',{changedTouches:[touch(30,15)]});
 assert.equal(removes,0);
 assert.equal(prevented,false);
 assert.equal(card.classList.contains('favorite-armed'),false);
 stop();
});
test('deliberate hold + upward swipe removes once without accidental asset opening',async()=>{
 const card=new FakeCard();
 let removes=0,opens=0,prevented=false,stopped=false;
 const stop=bindFavoriteHoldSwipe(card,{
  onRemove:()=>removes++,onOpen:()=>opens++
 });
 card.emit('pointerdown',{pointerType:'touch',button:0,pointerId:21,
  clientX:30,clientY:130,target});
 card.emit('touchstart',{touches:[touch(30,130)],target});
 await new Promise(resolve=>setTimeout(resolve,FAVORITE_HOLD_MS+25));
 assert.equal(card.classList.contains('favorite-armed'),true);
 card.emit('touchmove',{touches:[touch(24,35)],cancelable:true,
  preventDefault(){prevented=true;}});
 card.emit('touchend',{changedTouches:[touch(24,35)]});
 card.emit('pointerup',{pointerType:'touch',pointerId:21,clientX:24,clientY:35});
 card.emit('click',{preventDefault(){stopped=true;},stopImmediatePropagation(){}});
 assert.equal(removes,1);
 assert.equal(opens,0);
 assert.equal(prevented,true);
 assert.equal(stopped,true);
 assert.equal(card.classList.contains('favorite-armed'),false);
 card.emit('keydown',{target:card,key:'Enter',preventDefault(){}});
 card.emit('keydown',{target:card,key:'Delete',preventDefault(){}});
 assert.equal(opens,1);
 assert.equal(removes,2);
 stop();
});
test('carousel state is preserved when badges or favorites re-render',()=>{
 assert.ok(favorites.includes('const previousScrollLeft=rail.scrollLeft'));
 assert.ok(favorites.includes('rail.scrollLeft=previousScrollLeft'));
 assert.ok(favorites.includes("target.focus({preventScroll:true})"));
 assert.ok(favorites.includes('bindFavoriteHoldSwipe(card,{'));
 assert.ok(css.includes('.asset-rail{touch-action:auto}'));
 assert.ok(css.includes('.favorite-card.asset-chip{touch-action:auto!important}'));
 assert.ok(html.includes('id="favorites-radar-summary"'));
 assert.ok(app.includes("navigate('radar','radar-focus-panel')"));
});
