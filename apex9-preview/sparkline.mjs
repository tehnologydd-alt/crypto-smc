/** Tiny graphics only from actual finished OHLCV; never synthetic trend lines. */
export function sparklinePoints(candles,{width=120,height=36}={}){
 if(!Array.isArray(candles)||candles.length<3||!Number.isFinite(width)||
    !Number.isFinite(height)||width<=0||height<=0)return null;
 const rows=candles.filter(x=>x?.closed===true&&
  Number.isFinite(x.close)&&x.close>0&&Number.isSafeInteger(x.t))
  .slice(-35);
 if(rows.length<3)return null;
 for(let i=1;i<rows.length;i++)
  if(rows[i].t<=rows[i-1].t)return null;
 const values=rows.map(x=>x.close);
 const lo=Math.min(...values),hi=Math.max(...values);
 const margin=3,range=Math.max(1e-10,hi-lo);
 const out=values.map((v,i)=>({
  x:margin+(width-2*margin)*i/(values.length-1),
  y:margin+(height-2*margin)*(1-(v-lo)/range)
 }));
 return {points:out,path:out.map((p,i)=>
  (i?'L':'M')+p.x.toFixed(2)+','+p.y.toFixed(2)).join(' '),
  rising:values.at(-1)>=values[0]};
}
export function attachSparkline(target,candles){
 const detail=sparklinePoints(candles);
 const NS='http://www.w3.org/2000/svg';
 const svg=document.createElementNS(NS,'svg');
 svg.setAttribute('viewBox','0 0 120 36');
 svg.setAttribute('class','apex-sparkline');
 svg.setAttribute('role','img');
 svg.setAttribute('aria-label',detail?
  'Мини-график реальных завершённых свечей':'Недостаточно локальных данных для мини-графика');
 if(detail){
  const line=document.createElementNS(NS,'path');
  line.setAttribute('d',detail.path);
  line.setAttribute('fill','none');
  line.setAttribute('stroke',detail.rising?'#5fe1d4':'#d4a6b2');
  line.setAttribute('stroke-width','2.4');
  line.setAttribute('stroke-linejoin','round');
  line.setAttribute('stroke-linecap','round');
  svg.append(line);
 }else{
  const label=document.createElementNS(NS,'text');
  label.setAttribute('x','60');label.setAttribute('y','21');
  label.setAttribute('text-anchor','middle');
  label.setAttribute('fill','#92afb8');label.setAttribute('font-size','8');
  label.textContent='нет истории';svg.append(label);
 }
 target.replaceChildren(svg);
}
