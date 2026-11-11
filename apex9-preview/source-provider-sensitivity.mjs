/**
 * APEX Stage 4 — read-only sensitivity diagnostics for the frozen
 * preregistered provider contribution study. Do not choose samples or tune
 * any ranking weights here. Input order must remain publication-time order.
 *
 * Leave-one-out ranges are NOT confidence intervals. Circular time shifts
 * are negative-control diagnostics, NOT randomization p-values.
 */
import {rankingAuc} from './forecast-feature-ablation.mjs';

export const PROVIDER_SENSITIVITY_VERSION='APEX_PROVIDER_SENSITIVITY_V1';
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const round=x=>Math.round(x*10000)/10000;
const empty=()=>({version:PROVIDER_SENSITIVITY_VERSION,
 state:'COLLECTING',windows:[],causal:false,significant:false,
 trained:false,modelChanged:false});
const delta=rows=>{
 const a=rankingAuc(rows,r=>r.baseline);
 const b=rankingAuc(rows,r=>r.withProvider);
 return finite(a)&&finite(b)?b-a:null;
};
const validRow=r=>r&&['TP3','STOP'].includes(r.outcome)&&
 finite(r.baseline)&&r.baseline>=0&&r.baseline<=1&&
 finite(r.withProvider)&&finite(r.reversed)&&
 Math.abs(r.withProvider+r.reversed-2*r.baseline)<1e-8&&
 Math.abs(Math.abs(r.withProvider-r.baseline)-.10)<1e-8;

/**
 * Check SAME paired source-available completed observations as the
 * preregistered AUC. No dates, outcomes or provider availability are used to
 * reselect any of the original 3 x 16 publication windows.
 */
export function assessProviderSensitivity(periods,{eligible=false}={}){
 const base=empty();
 if(!Array.isArray(periods)||periods.length!==3)
  return {...base,state:'CHECK_DATA'};
 if(!eligible)return base;
 const windows=[];
 for(const period of periods){
  const samples=period?.samples;
  const decisive=period?.decisive,tp3=period?.tp3;
  if(!Array.isArray(samples)||samples.length>16||
   !Number.isSafeInteger(decisive)||decisive<0||decisive>16||
   !Number.isSafeInteger(tp3)||tp3<0||tp3>decisive||
   samples.some(r=>!validRow(r)))
   return {...base,state:'CHECK_DATA'};
  const n=samples.length,pos=samples.filter(r=>r.outcome==='TP3').length;
  if(n<10||pos<3||n-pos<3) return base;
  const original=delta(samples);
  const reversed=rankingAuc(samples,r=>r.reversed);
  const reference=rankingAuc(samples,r=>r.baseline);
  if(!finite(original)||!finite(reversed)||!finite(reference))
   return {...base,state:'CHECK_DATA'};
  const jackknife=[];
  for(let i=0;i<n;i++){
   const leaveOut=delta(samples.filter((_,j)=>i!==j));
   if(!finite(leaveOut))return {...base,state:'CHECK_DATA'};
   jackknife.push(leaveOut);
  }
  const offsets=samples.map(r=>r.withProvider-r.baseline);
  const shifted=[];
  for(let shift=1;shift<n;shift++){
   const rotated=samples.map((r,i)=>({
    ...r,withProvider:r.baseline+offsets[(i+shift)%n]}));
   const d=delta(rotated);
   if(!finite(d))return {...base,state:'CHECK_DATA'};
   shifted.push(d);
  }
  const classShare=pos/n,fullShare=decisive?tp3/decisive:null;
  windows.push({
   measured:n,decisive,positive:pos,negative:n-pos,
   deltaAuc:round(original),
   leaveOneOutMin:round(Math.min(...jackknife)),
   leaveOneOutMax:round(Math.max(...jackknife)),
   leaveOneOutPositive:jackknife.filter(v=>v>0).length,
   leaveOneOutTotal:jackknife.length,
   timeShiftBest:round(Math.max(...shifted)),
   timeShiftBeatsOriginal:shifted.filter(v=>v>=original-1e-12).length,
   timeShiftTotal:shifted.length,
   conditionalTp3Share:round(classShare),
   fullDecisiveTp3Share:fullShare===null?null:round(fullShare),
   classMixGap:fullShare===null?null:round(Math.abs(classShare-fullShare)),
   selectionCaution:fullShare===null||Math.abs(classShare-fullShare)>=.20
  });
 }
 const sensitive=windows.some(w=>w.leaveOneOutMin<=0||
  w.timeShiftBeatsOriginal>0||w.selectionCaution);
 return {version:PROVIDER_SENSITIVITY_VERSION,
  state:'DESCRIPTIVE',caution:sensitive?'SENSITIVE':'NO_FLAG_IN_THESE_CHECKS',
  windows,causal:false,significant:false,trained:false,modelChanged:false,
  note:'Leave-one-out range is not a confidence interval; circular shifts '+
   'are a weak negative control. Descriptive diagnostics only. '+
   'No statistical significance, causality or automatic model changes.'};
}
