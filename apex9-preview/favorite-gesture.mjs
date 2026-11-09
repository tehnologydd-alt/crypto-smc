/**
 * Hold + upward swipe for favorites: touch scrolling stays native until a
 * deliberate long press arms removal. Mouse and keyboard have equivalent input.
 */
export const FAVORITE_HOLD_MS=480;
export const FAVORITE_REMOVE_PX=65;
export const FAVORITE_START_SLOP=14;
const ignored='.favorite-explain, .favorite-radar-link';
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
export function favoriteSwipeDecision({held=false,dx=0,dy=0}={}){
 return held===true&&Number.isFinite(dx)&&Number.isFinite(dy)&&
  dy<=-FAVORITE_REMOVE_PX&&Math.abs(dx)<=55;
}
export function bindFavoriteHoldSwipe(card,{onRemove,onOpen}={}){
 if(!card||typeof card.addEventListener!=='function')
  return ()=>{};
 let start=null,armed=false,holdTimer=null,suppressClickUntil=0,
  pointerId=null;
 const now=()=>Date.now();
 const disarm=()=>{
  if(holdTimer!==null){clearTimeout(holdTimer);holdTimer=null;}
  start=null;armed=false;pointerId=null;
  card.classList.remove('favorite-armed');card.style.transform='';
 };
 const begin=(x,y,type,id,target)=>{
  if(start||target?.closest?.(ignored))return;
  start={x,y,type,id};
  holdTimer=setTimeout(()=>{
   holdTimer=null;
   if(!start)return;
   armed=true;
   suppressClickUntil=now()+1200;
   card.classList.add('favorite-armed');
  },FAVORITE_HOLD_MS);
 };
 const move=(x,y,type,id,e)=>{
  if(!start||start.type!==type||start.id!==id)return;
  const next={x,y};
  if(!armed){
   if(distance(start,next)>FAVORITE_START_SLOP)disarm();
   return;
  }
  // The finger can scroll the page/carousel normally *before* arming.
  // Once held, prevent default pan so the upward swipe is detectable.
  if(e?.cancelable)e.preventDefault();
  card.style.transform='translateY('+Math.max(-80,Math.min(0,y-start.y))+'px)';
 };
 const finish=(x,y,type,id)=>{
  if(!start||start.type!==type||start.id!==id)return;
  const remove=favoriteSwipeDecision({held:armed,dx:x-start.x,dy:y-start.y});
  if(armed)suppressClickUntil=now()+1200;
  disarm();
  if(remove)onRemove?.();
 };
 const cancel=()=>disarm();
 const blocked=event=>{
  if(now()>suppressClickUntil)return;
  event.preventDefault();
  event.stopImmediatePropagation();
 };
 const context=event=>{if(armed||start?.type==='touch')event.preventDefault();};
 const pointerDown=e=>{
  if(e.pointerType==='touch'||e.button!==0)return;
  pointerId=e.pointerId;
  begin(e.clientX,e.clientY,'pointer',pointerId,e.target);
 };
 const pointerMove=e=>{
  if(e.pointerType==='touch')return;
  move(e.clientX,e.clientY,'pointer',e.pointerId,e);
 };
 const pointerUp=e=>{
  if(e.pointerType==='touch')return;
  finish(e.clientX,e.clientY,'pointer',e.pointerId);
 };
 const pointerCancel=e=>{
  if(e.pointerType!=='touch'&&start?.id===e.pointerId)cancel();
 };
 const touchStart=e=>{
  if(e.touches.length!==1)return;
  const touch=e.touches[0];
  begin(touch.clientX,touch.clientY,'touch',touch.identifier,e.target);
 };
 const touchMove=e=>{
  if(!start||start.type!=='touch'||e.touches.length!==1)return;
  const touch=e.touches[0];
  move(touch.clientX,touch.clientY,'touch',touch.identifier,e);
 };
 const touchEnd=e=>{
  for(const touch of e.changedTouches){
   if(start?.type==='touch'&&start.id===touch.identifier){
    finish(touch.clientX,touch.clientY,'touch',touch.identifier);
    return;
   }
  }
 };
 const keyboard=e=>{
  if(e.target!==card)return;
  if(e.key==='Delete'||e.key==='Backspace'){
   e.preventDefault();onRemove?.();
  }else if(e.key==='Enter'){
   e.preventDefault();onOpen?.();
  }
 };
 card.addEventListener('pointerdown',pointerDown);
 card.addEventListener('pointermove',pointerMove);
 card.addEventListener('pointerup',pointerUp);
 card.addEventListener('pointercancel',pointerCancel);
 card.addEventListener('touchstart',touchStart,{passive:true});
 card.addEventListener('touchmove',touchMove,{passive:false});
 card.addEventListener('touchend',touchEnd);
 card.addEventListener('touchcancel',cancel);
 card.addEventListener('click',blocked,true);
 card.addEventListener('contextmenu',context);
 card.addEventListener('keydown',keyboard);
 // Useful when components are later moved/recycled instead of recreated.
 return ()=>{
  disarm();
  for(const [type,fn,opts] of [
   ['pointerdown',pointerDown],['pointermove',pointerMove],
   ['pointerup',pointerUp],['pointercancel',pointerCancel],
   ['touchstart',touchStart],['touchmove',touchMove],
   ['touchend',touchEnd],['touchcancel',cancel],
   ['click',blocked,true],['contextmenu',context],['keydown',keyboard]
  ])card.removeEventListener(type,fn,opts);
 };
}
