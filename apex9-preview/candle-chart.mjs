/**
 * Native-feeling responsive Canvas OHLCV chart for Android WebView.
 * Supports drag, pinch and mouse wheel. No fake sample series, orders or signals.
 * Displays only observed OHLCV and retrospective structure annotations.
 */
export class CandleChart {
 constructor(canvas,{onSelect}={}){
  if(!canvas||typeof canvas.getContext!=='function')throw Error('Chart canvas required');
  this.canvas=canvas;this.ctx=canvas.getContext('2d');
  if(!this.ctx)throw Error('Canvas 2D unavailable');
  this.data=[];this.events=[];this.scenarios=[];this.visible=55;this.offset=0;
  this.pointers=new Map();this.lastPinch=null;this.selected=null;this.onSelect=onSelect;
  this.width=0;this.height=0;this.frame=0;
  this.onResize=()=>this.resize();
  this.onWheel=e=>{e.preventDefault();this.zoom(e.deltaY>0?1.12:.89);};
  this.onDown=e=>{
   this.canvas.setPointerCapture?.(e.pointerId);
   this.pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
   if(this.pointers.size===2)this.lastPinch=this.pointerDistance();
  };
  this.onMove=e=>{
   if(!this.pointers.has(e.pointerId))return;
   const prev=this.pointers.get(e.pointerId);
   this.pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
   if(this.pointers.size===2){
    const distance=this.pointerDistance();
    if(this.lastPinch&&distance>10)this.zoom(this.lastPinch/distance);
    this.lastPinch=distance;
   }else{
    const dx=e.clientX-prev.x,barWidth=this.width/Math.max(1,this.visible);
    this.offset=this.clampOffset(this.offset+dx/barWidth);
    this.schedule();
   }
  };
  this.onUp=e=>{
   const old=this.pointers.get(e.pointerId);
   this.pointers.delete(e.pointerId);this.lastPinch=null;
   if(old&&Math.abs((old.x||0)-e.clientX)<4&&this.pointers.size===0)this.selectAt(e.clientX);
  };
  canvas.addEventListener('wheel',this.onWheel,{passive:false});
  canvas.addEventListener('pointerdown',this.onDown);
  canvas.addEventListener('pointermove',this.onMove);
  canvas.addEventListener('pointerup',this.onUp);
  canvas.addEventListener('pointercancel',this.onUp);
  this.observer=typeof ResizeObserver!=='undefined'?new ResizeObserver(this.onResize):null;
  this.observer?.observe(canvas);
  if(!this.observer)window.addEventListener('resize',this.onResize);
  this.resize();
 }
 pointerDistance(){
  const points=[...this.pointers.values()];
  return points.length<2?0:Math.hypot(points[0].x-points[1].x,points[0].y-points[1].y);
 }
 clampOffset(value){return Math.max(0,Math.min(Math.max(0,this.data.length-this.visible),value));}
 zoom(multiplier){
  this.visible=Math.max(18,Math.min(150,Math.round(this.visible*multiplier)));
  this.offset=this.clampOffset(this.offset);this.schedule();
 }
 setScenarios(scenarios=[]){
  // Only immutable research envelopes with coherent future deadlines.
  this.scenarios=Array.isArray(scenarios)?scenarios.filter(x=>
   Number.isFinite(x.bandLow)&&Number.isFinite(x.bandHigh)&&
   x.bandLow>0&&x.bandLow<x.bandHigh&&Number.isSafeInteger(x.anchorCloseAt)&&
   Number.isSafeInteger(x.targetCloseAt)&&x.targetCloseAt>x.anchorCloseAt
  ).slice(0,3):[];
  this.schedule();
 }
 setData(candles,events=[]){
  this.data=Array.isArray(candles)?candles:[];
  this.events=Array.isArray(events)?events:[];
  this.offset=0;this.selected=null;this.schedule();
 }
 reset(){this.offset=0;this.visible=55;this.selected=null;this.schedule();}
 resize(){
  const rect=this.canvas.getBoundingClientRect();
  const w=Math.max(1,Math.round(rect.width)),h=Math.max(1,Math.round(rect.height));
  const dpr=Math.max(1,Math.min(3,globalThis.devicePixelRatio||1));
  this.width=w;this.height=h;
  this.canvas.width=Math.round(w*dpr);this.canvas.height=Math.round(h*dpr);
  this.ctx.setTransform(dpr,0,0,dpr,0,0);
  this.schedule();
 }
 schedule(){
  if(this.frame)return;
  this.frame=requestAnimationFrame(()=>{this.frame=0;this.draw();});
 }
 viewport(){
  const end=Math.max(0,this.data.length-Math.round(this.offset));
  const start=Math.max(0,end-this.visible);
  return {start,end,bars:this.data.slice(start,end)};
 }
 selectAt(clientX){
  const {start,bars}=this.viewport();
  if(!bars.length||!this.width)return;
  const rect=this.canvas.getBoundingClientRect();
  const plotW=Math.max(1,this.width-69);
  const idx=Math.floor((clientX-rect.left)/plotW*bars.length);
  const bar=bars[Math.max(0,Math.min(bars.length-1,idx))];
  this.selected=bar;
  this.onSelect?.(bar);
  this.schedule();
 }
 draw(){
  const ctx=this.ctx,w=this.width,h=this.height;
  if(!ctx||!w||!h)return;
  ctx.clearRect(0,0,w,h);
  ctx.fillStyle='#08151c';ctx.fillRect(0,0,w,h);
  const {start,end,bars}=this.viewport();
  ctx.font='11px system-ui, sans-serif';
  ctx.textBaseline='middle';
  if(!bars.length){
   ctx.textAlign='center';ctx.fillStyle='#9cb7c0';
   ctx.fillText('Нет проверенных свечных данных',w/2,h/2);return;
  }
  const labelW=65,plotW=Math.max(30,w-labelW);
  const mainH=Math.floor(h*.73),volumeTop=Math.floor(h*.80),volumeH=h-volumeTop-23;
  const minV=Math.min(...bars.map(b=>b.low)),maxV=Math.max(...bars.map(b=>b.high));
  const range=Math.max(1e-12,maxV-minV);
  const padding=range*.09;
  const low=minV-padding,high=maxV+padding;
  const priceY=p=>14+(high-p)/(high-low)*(mainH-22);
  const step=plotW/bars.length;
  // Visualize ORIGINAL empirical scenario envelopes, not executable orders.
  for(const sc of this.scenarios){
   if(sc.bandHigh<low||sc.bandLow>high)continue;
   const top=Math.max(14,priceY(Math.min(high,sc.bandHigh)));
   const bottom=Math.min(mainH-8,priceY(Math.max(low,sc.bandLow)));
   ctx.fillStyle='rgba(55,190,194,.11)';
   ctx.fillRect(0,top,plotW,Math.max(1,bottom-top));
   ctx.save();ctx.setLineDash([5,4]);ctx.strokeStyle='#69dfe0';ctx.lineWidth=1.5;
   for(const price of [sc.bandLow,sc.bandHigh]){
    if(price<low||price>high)continue;
    const y=priceY(price);ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(plotW,y);ctx.stroke();
   }
   ctx.restore();
   ctx.fillStyle='#b2efea';ctx.textAlign='left';ctx.font='10px system-ui';
   ctx.fillText('Исследуемый диапазон · H1',6,Math.max(12,top-8));
  }
  ctx.strokeStyle='#24424a';ctx.lineWidth=1;
  for(let j=0;j<=4;j++){
   const y=14+(mainH-22)*j/4;
   ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(plotW,y);ctx.stroke();
   const value=high-(high-low)*j/4;
   ctx.fillStyle='#9db7c0';ctx.textAlign='right';
   ctx.fillText(new Intl.NumberFormat('en-US',{maximumSignificantDigits:7}).format(value),w-4,y);
  }
  const volMax=Math.max(1,...bars.map(b=>b.volume));
  for(let i=0;i<bars.length;i++){
   const bar=bars[i],x=(i+.5)*step;
   const up=bar.close>=bar.open;
   const color=up?'#43d8c8':'#ef8298';
   const wickTop=priceY(bar.high),wickBottom=priceY(bar.low);
   const bodyTop=priceY(Math.max(bar.open,bar.close)),bodyBottom=priceY(Math.min(bar.open,bar.close));
   ctx.strokeStyle=color;ctx.fillStyle=color;ctx.lineWidth=Math.max(1,Math.min(2,step*.15));
   ctx.beginPath();ctx.moveTo(x,wickTop);ctx.lineTo(x,wickBottom);ctx.stroke();
   const candleWidth=Math.min(12,Math.max(1,step*.68));
   ctx.fillRect(x-candleWidth/2,bodyTop,candleWidth,Math.max(1,bodyBottom-bodyTop));
   ctx.fillStyle=up?'#28796f':'#814656';
   ctx.fillRect(x-candleWidth/2,volumeTop+volumeH*(1-bar.volume/volMax),
    candleWidth,Math.max(1,volumeH*bar.volume/volMax));
  }
  // Annotate only confirmed retrospective breaks, never preemptive signals.
  const eventByTime=new Map(this.events.map(e=>[e.time,e]));
  for(let i=0;i<bars.length;i++){
   const event=eventByTime.get(bars[i].closeAt);
   if(!event)continue;
   const x=(i+.5)*step,y=priceY(bars[i].close);
   ctx.fillStyle=event.type==='CHoCH'?'#e3c17c':'#8de5ee';
   ctx.textAlign='center';ctx.font='bold 10px system-ui';
   ctx.fillText(event.type,x,Math.max(12,y-17));
  }
  ctx.strokeStyle='#203c43';
  ctx.beginPath();ctx.moveTo(0,volumeTop-9);ctx.lineTo(plotW,volumeTop-9);ctx.stroke();
  const labels=[0,Math.floor((bars.length-1)/2),bars.length-1];
  ctx.font='10px system-ui';ctx.fillStyle='#8fa9b3';
  for(const i of labels){
   if(i<0)continue;
   const b=bars[i];
   if(!b)continue;
   const text=new Date(b.t).toLocaleDateString('ru-RU',{day:'2-digit',month:'2-digit'});
   const x=(i+.5)*step;
   ctx.textAlign=i===0?'left':i===bars.length-1?'right':'center';
   ctx.fillText(text,Math.min(plotW-2,Math.max(2,x)),h-9);
  }
  if(this.selected){
   const i=bars.findIndex(b=>b.t===this.selected.t);
   if(i>=0){
    const x=(i+.5)*step;
    ctx.strokeStyle='#6ce8ec';ctx.setLineDash([4,4]);ctx.lineWidth=1;
    ctx.beginPath();ctx.moveTo(x,5);ctx.lineTo(x,h-24);ctx.stroke();ctx.setLineDash([]);
   }
  }
  ctx.fillStyle='#7ba8ad';ctx.textAlign='left';ctx.font='10px system-ui';
  ctx.fillText('Объём',7,volumeTop-16);
  if(bars.at(-1)?.closed===false){
   ctx.fillStyle='#f1c685';ctx.textAlign='right';
   ctx.fillText('Текущая свеча формируется',plotW-8,13);
  }
 }
 destroy(){
  this.observer?.disconnect();
  if(!this.observer)window.removeEventListener('resize',this.onResize);
  this.canvas.removeEventListener('wheel',this.onWheel);
  this.canvas.removeEventListener('pointerdown',this.onDown);
  this.canvas.removeEventListener('pointermove',this.onMove);
  this.canvas.removeEventListener('pointerup',this.onUp);
  this.canvas.removeEventListener('pointercancel',this.onUp);
  if(this.frame)cancelAnimationFrame(this.frame);
 }
}
