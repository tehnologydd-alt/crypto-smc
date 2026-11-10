/**
 * Small, favorite-only asset selector. Works while the asset page is open:
 * swipe horizontally across the selector/price card or tap a saved favorite.
 * Never triggers research for an unrelated catalogue symbol.
 */
const SYMBOL=/^[A-Z0-9]{2,16}USDT$/;
export function assetFavoriteList(values){
 if(!Array.isArray(values))return [];
 return [...new Set(values.filter(v=>typeof v==='string'&&SYMBOL.test(v)))].slice(0,10);
}
export function adjacentFavorite(favorites,current,direction){
 const list=assetFavoriteList(favorites);
 if(!list.length)return null;
 const i=list.indexOf(current);
 if(i<0)return list[0];
 if(direction!==1&&direction!==-1)return current;
 return list[(i+direction+list.length)%list.length];
}
export function initAssetFavoritePicker({getFavorites,getSelected,onSelect}){
 const strip=document.getElementById('asset-favorite-strip');
 const hero=document.querySelector('#view-asset .hero');
 if(!strip||!hero)throw Error('Asset favorite navigation elements missing');
 let signature='',selected='',touch=null;
 const favorites=()=>assetFavoriteList(getFavorites?.());
 function select(symbol){
  if(!favorites().includes(symbol)||symbol===getSelected?.())return;
  onSelect?.(symbol);
 }
 function move(direction){
  const target=adjacentFavorite(favorites(),getSelected?.(),direction);
  if(target)select(target);
 }
 function swipe(target){
  target.addEventListener('touchstart',event=>{
   if(event.touches.length!==1)return;
   touch={x:event.touches[0].clientX,y:event.touches[0].clientY,
    at:Date.now(),from:target};
  },{passive:true});
  target.addEventListener('touchend',event=>{
   if(!touch||touch.from!==target||event.changedTouches.length!==1)return;
   const dx=event.changedTouches[0].clientX-touch.x;
   const dy=event.changedTouches[0].clientY-touch.y;
   touch=null;
   if(Math.abs(dx)>=55&&Math.abs(dx)>Math.abs(dy)*1.6)
    move(dx<0?1:-1);
  },{passive:true});
  target.addEventListener('touchcancel',()=>{touch=null},{passive:true});
 }
 swipe(strip);swipe(hero);
 function render(){
  const list=favorites(),current=getSelected?.();
  const next=list.join(',');
  if(signature!==next){
   signature=next;
   strip.replaceChildren();
   if(!list.length){
    const info=document.createElement('span');
    info.className='asset-picker-empty';
    info.textContent='Избранное пусто · добавьте актив через «Каталог» в Обзоре';
    strip.append(info);
   }else{
    for(const symbol of list){
     const b=document.createElement('button');b.type='button';
     b.className='asset-favorite-chip';b.dataset.assetFavorite=symbol;
     b.textContent=symbol.replace(/USDT$/,'');
     b.setAttribute('aria-label','Показать '+symbol+' из избранного');
     b.addEventListener('click',()=>select(symbol));
     strip.append(b);
    }
   }
  }
  if(current!==selected||next!==signature){
   selected=current;
  }
  const buttons=[...strip.querySelectorAll('[data-asset-favorite]')];
  for(const button of buttons){
   const active=button.dataset.assetFavorite===current;
   button.classList.toggle('is-current',active);
   button.setAttribute('aria-pressed',String(active));
  }
  strip.setAttribute('aria-label','Избранные активы · листайте влево и вправо'+
   (list.length?' · '+list.length+' всего':''));
 }
 return {render,move};
}
