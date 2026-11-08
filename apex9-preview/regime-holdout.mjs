/**
 * APEX Regime Holdout Audit — historical, embargoed reference vs later segment.
 *
 * The reference uses the earliest 60% of fixed 4H labels. Ten subsequent
 * windows (40h) are purged before the later holdout. Thus each holdout label's
 * 40h training bars are strictly later than the reference's last label.
 *
 * This is temporal segregation, NOT independent financial observations.
 * It is not a future price model, a trading signal, or calibrated accuracy.
 */
import {analyzeRegimeStability} from './regime-stability.mjs';
import {REGIME_TYPES} from './research-regimes.mjs';
import {wilsonShare} from './research-stability.mjs';

const HOUR=3_600_000;
const MODES=REGIME_TYPES.map(x=>x.id);
const VALID=new Set(MODES);
export const HOLDOUT_RULES=Object.freeze({
 referenceFraction:0.60,embargoWindows:10,embargoHours:40,
 labelHours:4,labelLookbackHours:40,
 minWindows:144,minOriginPairsPerSegment:15,
 source:'LOCAL_ROOM_CLOSED_H1',method:'FIXED_TEMPORAL_HOLDOUT'
});
export const HOLDOUT_NOTE=
 'Историческая проверка: первые 60% H1-режимов — опорный участок; '+ 
 'последующий 40-часовой зазор исключён, оставшаяся история — контрольная. '+
 'Методы и границы заданы до сравнения. Соседние события внутри участков '+ 
 'зависят друг от друга, поэтому интервалы Уилсона условны. '+ 
 'Повторение исторических долей не является независимым доказательством '+ 
 'прогнозируемости или будущей прибыли.';
const empty=(state,reason)=>({
 state,reason,asset:null,reference:null,holdout:null,
 embargo:null,rows:[],note:HOLDOUT_NOTE,rules:HOLDOUT_RULES
});
function createPairs(windows){
 const pairs=[];
 for(let i=0;i<windows.length-1;i++){
  const prev=windows[i],next=windows[i+1];
  if(!VALID.has(prev.mode)||!VALID.has(next.mode)||
   prev.targetAt!==next.anchorAt||
   next.anchorAt-prev.anchorAt!==4*HOUR)
   return null;
  pairs.push({from:prev.mode,to:next.mode,
   fromAt:prev.anchorAt,toAt:next.anchorAt});
 }
 return pairs;
}
const countRows=pairs=>
 Object.fromEntries(MODES.map(id=>[id,pairs.filter(p=>p.from===id).length]));
function segment(label,pairs,windows){
 return {label,firstAt:windows[0].anchorAt,
  lastAt:windows.at(-1).anchorAt,
  labels:windows.length,pairs:pairs.length,
  originCounts:countRows(pairs)};
}
function describePair(source,reference,holdout){
 const older=reference.filter(p=>p.from===source.id);
 const newer=holdout.filter(p=>p.from===source.id);
 const enough=older.length>=HOLDOUT_RULES.minOriginPairsPerSegment&&
  newer.length>=HOLDOUT_RULES.minOriginPairsPerSegment;
 const countsFor=(rows,destination)=>
  rows.filter(pair=>pair.to===destination).length;
 const transitions=REGIME_TYPES.map(to=>{
  const referenceCount=countsFor(older,to.id);
  const holdoutCount=countsFor(newer,to.id);
  if(!enough)return {
   id:to.id,label:to.label,
   referenceCount,holdoutCount,
   referenceRate:null,holdoutRate:null,differencePp:null
  };
  const refBand=wilsonShare(referenceCount,older.length);
  const holdoutBand=wilsonShare(holdoutCount,newer.length);
  return {id:to.id,label:to.label,
   referenceCount,holdoutCount,
   referenceRate:refBand,holdoutRate:holdoutBand,
   differencePp:(holdoutBand.share-refBand.share)*100};
 });
 return {id:source.id,label:source.label,
  referencePairs:older.length,holdoutPairs:newer.length,
  state:enough?'DESCRIPTIVE':'INSUFFICIENT',
  reason:enough?null:'Менее 15 наблюдаемых переходов из этого режима в одном из участков',
  transitions};
}

/**
 * This audit accepts only a fully source-gated Research Regimes report.
 * No parameter fitting on holdout observations. First/last time and counts
 * must match the original chronology in analyzeRegimeStability.
 */
export function analyzeRegimeHoldout(report){
 const source=analyzeRegimeStability(report);
 if(source.state!=='DESCRIPTIVE')
  return empty('HIDDEN',source.reason||'Нет подтверждённого полного архива H1');
 const windows=report.windows;
 if(windows.length<HOLDOUT_RULES.minWindows)
  return empty('INSUFFICIENT',
   'Нужно минимум '+HOLDOUT_RULES.minWindows+
   ' неперекрывающихся исторических наблюдения');
 const referenceEnd=Math.floor(windows.length*HOLDOUT_RULES.referenceFraction);
 const holdoutStart=referenceEnd+HOLDOUT_RULES.embargoWindows;
 const referenceWindows=windows.slice(0,referenceEnd);
 const holdoutWindows=windows.slice(holdoutStart);
 if(referenceWindows.length<2||holdoutWindows.length<2)
  return empty('INSUFFICIENT','Не осталось достаточно наблюдений после временного зазора');
 const separation=holdoutWindows[0].anchorAt-
  referenceWindows.at(-1).anchorAt;
 if(separation<=(HOLDOUT_RULES.labelLookbackHours)*HOUR)
  return empty('HIDDEN','Окна опорного и проверочного участков пересекаются');
 if(separation!==(HOLDOUT_RULES.embargoWindows+1)*4*HOUR)
  return empty('HIDDEN','Нарушен фиксированный временной зазор');
 const referencePairs=createPairs(referenceWindows);
 const holdoutPairs=createPairs(holdoutWindows);
 if(!referencePairs||!holdoutPairs)
  return empty('HIDDEN','Несогласованная хронология переходов на контрольном участке');
 const reference=segment('Опорный',referencePairs,referenceWindows);
 const holdout=segment('Проверочный',holdoutPairs,holdoutWindows);
 const rows=REGIME_TYPES.map(mode=>describePair(mode,referencePairs,holdoutPairs));
 const validCounts=rows.filter(row=>row.state==='DESCRIPTIVE').length;
 // Result is still a usable study when one mode is too sparse; its rates
 // are suppressed independently of sufficient modes.
 return {state:'DESCRIPTIVE',reason:null,asset:report.asset,
  reference,holdout,embargo:{
   firstAt:windows[referenceEnd].anchorAt,
   lastAt:windows[holdoutStart-1].anchorAt,
   excludedLabels:HOLDOUT_RULES.embargoWindows,
   excludedHours:separation/HOUR-HOLDOUT_RULES.labelHours,
   separationHours:separation/HOUR
  },rows,comparableModes:validCounts,
  allComparable:validCounts===REGIME_TYPES.length,
  note:HOLDOUT_NOTE,rules:HOLDOUT_RULES};
}
