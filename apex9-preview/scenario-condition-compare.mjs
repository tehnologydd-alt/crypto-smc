/**
 * APEX cohort audit: compare formation conditions known BEFORE each M5 result.
 * Uses immutable Room evidence only. No inferred fills, no trade returns,
 * no probability or superiority rankings from sparse observations.
 */
import {directionalHypothesis} from './directional-scenario.mjs';
import {verifiedDirectionalEvidence} from './forecast-quality.mjs';

const cohort=(label,rows)=>({
 label,published:rows.length,
 finished:rows.filter(x=>x.proof.finished).length,
 entered:rows.filter(x=>x.proof.finished&&x.proof.entered).length,
 tp1:rows.filter(x=>x.proof.finished&&x.proof.touched.includes('TP1')).length,
 tp3:rows.filter(x=>x.proof.finished&&x.proof.outcome==='TP3').length,
 stop:rows.filter(x=>x.proof.finished&&x.proof.outcome==='STOP').length,
 ambiguous:rows.filter(x=>x.proof.finished&&x.proof.outcome==='AMBIGUOUS').length
});
const dimension=(title,groups,note,minPerGroup)=>({
 title,note,groups:groups.map(([label,rows])=>cohort(label,rows)),
 sufficient:groups.every(([,rows])=>
  rows.filter(x=>x.proof.finished&&x.proof.entered).length>=minPerGroup)
});
export function compareScenarioConditions(rows,{now=Date.now(),minPerGroup=12}={}){
 const accepted=[],sourceRows=Array.isArray(rows)?rows:[];
 let excluded=0;
 for(const row of sourceRows){
  const source=directionalHypothesis(row);
  if(!source||source.evaluationInterval!=='5m')continue;
  const proof=verifiedDirectionalEvidence(row,{now});
  if(proof.state!=='OBSERVED'||proof.source!=='M5'){
   excluded++;continue;
  }
  const width=100*(source.bandHigh-source.bandLow)/source.anchorClose;
  if(!Number.isFinite(width)||width<=0){excluded++;continue;}
  accepted.push({proof,width});
 }
 const dimensions=[];
 if(accepted.length){
  dimensions.push(dimension('Направление при публикации',[
   ['↑ Рост',accepted.filter(x=>x.proof.plan.side==='UP')],
   ['↓ Снижение',accepted.filter(x=>x.proof.plan.side==='DOWN')]
  ],null,minPerGroup));
  // Relative bands are based solely on saved publication-time H1 values,
  // never on realized future M5 outcomes.
  const values=accepted.map(x=>x.width).sort((a,b)=>a-b);
  const half=Math.floor(values.length/2);
  const median=values.length%2?values[half]:(values[half-1]+values[half])/2;
  const narrow=accepted.filter(x=>x.width<=median);
  const wide=accepted.filter(x=>x.width>median);
  if(narrow.length&&wide.length)dimensions.push(dimension(
   'Ширина опубликованного диапазона',[
    ['Уже медианы',narrow],['Шире медианы',wide]
   ],'порог '+median.toFixed(2)+'%',minPerGroup));
 }
 return {included:accepted.length,excluded,dimensions,minPerGroup};
}
