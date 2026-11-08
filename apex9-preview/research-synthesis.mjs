/**
 * APEX Research Synthesis — provenance-first, historical observations only.
 * No confidence score, live signals, purchase advice, model fitting or orders.
 * All evidence re-computed from full original closed H1 Room archive records.
 */
import {analyzeResearchRegimes,REGIME_TYPES} from './research-regimes.mjs';
import {analyzeRegimeStability} from './regime-stability.mjs';
import {analyzeRegimeTransitions} from './regime-transitions.mjs';
import {analyzeRegimeHoldout} from './regime-holdout.mjs';
import {analyzeCrossAssetRegimes,CROSS_ASSETS} from './cross-asset-research.mjs';

export const SYNTHESIS_RULES=Object.freeze({
 interval:'1h',origin:'ANDROID_ROOM_CLOSED_H1',
 descriptiveDifferencePp:20,lowCrossAgreementShare:.45,
 maxObservations:8,maxVariations:8,
 noImputation:true,noPredictiveScore:true
});
export const SYNTHESIS_NOTE=
 'Это объяснение проверенных исторических наблюдений, а не прогноз '+
 'движения цены. Порог отличия 20 п.п. и доля совпадений ниже 45% '+ 
 'используются только для сортировки заметных исторических расхождений, '+ 
 'без статистического теста. У криптоактивов общие факторы, а соседние '+ 
 '40-часовые окна классификации перекрываются. Пересечение интервалов '+ 
 'не доказывает устойчивости, различия — причинности; независимая '+ 
 'проверка и прогнозная точность не подтверждены.';
const safeAsset=x=>typeof x==='string'&&/^[A-Z0-9]{5,20}$/.test(x);
const t=x=>Number.isSafeInteger(x)&&x>0;
const pct=x=>Math.round(x*1000)/10;
const dp=x=>Math.round(x*10)/10;
const displayAsset=x=>x.replace(/USDT$/,'');
const obs=(title,detail,source)=>({title,detail,source});
const missing=(title,detail)=>({title,detail});
const hidden=(asset,reason)=>({
 state:'HIDDEN',asset,reason,
 source:null,observations:[],differences:[],missing:[
  missing('Нет проверенного исходного архива',reason)],
 coverage:{regimes:'UNVERIFIED',stability:'UNVERIFIED',
  transitions:'UNVERIFIED',holdout:'UNVERIFIED',crossAsset:'UNVERIFIED'},
 note:SYNTHESIS_NOTE,rules:SYNTHESIS_RULES
});
function getPeerRecords(asset,primary,peers){
 if(!CROSS_ASSETS.includes(asset))return null;
 return CROSS_ASSETS.map(id=>{
  if(id===asset)return primary;
  return peers.find(p=>p.asset===id)||{
   asset:id,native:false,archiveComplete:false,
   candles:[],error:'Архив не был прочитан'
  };
 });
}
/**
 * Example:
 * synthesizeResearch({asset:'BTCUSDT',primary:{asset:'BTCUSDT',
 *  native:true,archiveComplete:true,candles:[...]},peers:[...],now})
 *
 * Even if a caller constructs fake summaries, this function never accepts
 * them as evidence: the source is re-classified from original H1 bars.
 */
export function synthesizeResearch({
 asset,primary,peers=[],now=Date.now()
}={}){
 if(!safeAsset(asset)||!t(now)||primary?.asset!==asset||
  !Array.isArray(peers)||peers.some(x=>!x||!safeAsset(x.asset))||
  new Set(peers.map(x=>x.asset)).size!==peers.length||
  peers.some(x=>x.asset===asset||
   !CROSS_ASSETS.includes(x.asset)))
  return hidden(asset??null,'Некорректный актив или состав архивов');
 if(primary.native!==true||primary.error)
  return hidden(asset,primary.error||
   'Нужен установленный Android APK и исходный архив H1');
 const report=analyzeResearchRegimes(primary.candles,{
  asset,now,archiveComplete:primary.archiveComplete===true
 });
 if(report.state!=='DESCRIPTIVE')
  return hidden(asset,report.reason||'Архив H1 не прошёл проверку');
 const stability=analyzeRegimeStability(report);
 const transitions=analyzeRegimeTransitions(report);
 if(stability.state!=='DESCRIPTIVE'||transitions.state!=='DESCRIPTIVE')
  return hidden(asset,stability.reason||transitions.reason||
   'Исторические режимы или переходы не прошли повторную проверку');
 const holdout=analyzeRegimeHoldout(report);
 const crossRecords=getPeerRecords(asset,primary,peers);
 const cross=crossRecords?analyzeCrossAssetRegimes(crossRecords,{now}):null;
 const observations=[],differences=[],missingEvidence=[];
 const source={
  type:'ANDROID_ROOM_CLOSED_H1',asset,
  closedBars:report.closedBars,windows:report.windows.length,
  firstAt:report.firstAt,lastAt:report.lastAt,
  missingHours:report.missingHours,archiveComplete:true
 };
 observations.push(obs('Полная проверенная история',
  report.closedBars+' закрытых H1-свечей, '+
  report.windows.length+' неперекрывающихся четырёхчасовых окон. '+
  'Пропусков H1: '+report.missingHours+'.',
  'Research Regimes · Android Room'));
 const ranked=REGIME_TYPES.map(mode=>({
  ...mode,count:report.overall.regimeCounts[mode.id]
 })).sort((a,b)=>b.count-a.count||a.id.localeCompare(b.id));
 observations.push(obs('Какие режимы встречались в истории',
  ranked.map(m=>m.label+': '+m.count+' ('+
   pct(m.count/report.windows.length)+'%)').join(' · ')+
  '. Это частоты, а не оценка текущей ситуации.',
  'Research Regimes · проверенные 4H-окна'));
 observations.push(obs('Известные исторические смены режима',
  transitions.transitions+' последовательных переходов, '+
  transitions.excludedBoundaries+
  ' пары между периодами исключены. '+
  'Метка следующего режима определяется спустя четыре часа.',
  'Regime Transition Lab · хронология'));
 const drift=stability.regimes
  .map(x=>({id:x.id,label:x.label,
   pp:x.occurrence.earlyLateChangePp}))
  .sort((a,b)=>Math.abs(b.pp)-Math.abs(a.pp));
 if(Math.abs(drift[0].pp)>=SYNTHESIS_RULES.descriptiveDifferencePp)
  differences.push(obs('Изменялась частота рыночного режима',
   drift[0].label+': ранний и поздний периоды отличаются на '+
   dp(drift[0].pp)+' п.п. '+
   'Это описательный порог, а не статистическая значимость.',
   'Research Regime Stability · три периода'));
 else observations.push(obs('Исторические доли сравнимы по заданному порогу',
  'Максимальное изменение доли одного режима между ранним и поздним '+
  'периодами: '+dp(drift[0].pp)+
  ' п.п. (порог выделения 20 п.п.). Это не доказывает устойчивость.',
  'Research Regime Stability · три периода'));
 if(holdout.state==='DESCRIPTIVE'){
  observations.push(obs('Более поздний контрольный участок проверен',
   holdout.reference.pairs+' опорных и '+
   holdout.holdout.pairs+' поздних переходов; '+
   holdout.embargo.excludedHours+
   ' часов классификации исключены между участками. '+
   'Сопоставимых режимов: '+holdout.comparableModes+' из 3.',
   'Research Holdout · фиксированное разделение истории'));
  const differencesAll=holdout.rows
   .filter(x=>x.state==='DESCRIPTIVE')
   .flatMap(x=>x.transitions
    .filter(v=>Number.isFinite(v.differencePp))
    .map(v=>({from:x.label,to:v.label,
     ref:x.referencePairs,late:x.holdoutPairs,
     pp:v.differencePp})));
  differencesAll.sort((a,b)=>Math.abs(b.pp)-Math.abs(a.pp));
  if(differencesAll.length&&
   Math.abs(differencesAll[0].pp)>=SYNTHESIS_RULES.descriptiveDifferencePp){
   const d=differencesAll[0];
   differences.push(obs('Контрольный участок отличается от опорного',
    d.from+' → '+d.to+': '+dp(d.pp)+
    ' п.п. между ранней и поздней частотами '+
    '(наблюдений: '+d.ref+' и '+d.late+'). '+
    'Выбрано максимальное историческое отличие среди проверенных пар; '+
    'это не статистический тест.',
    'Research Holdout · проверенные переходы'));
  }else if(differencesAll.length)observations.push(obs(
   'Крупных расхождений переходов по заданному порогу не выделено',
   'Максимальная абсолютная разница в проверенных парах: '+
   dp(Math.abs(differencesAll[0].pp))+
   ' п.п. Это не означает совпадения вероятностей или качества прогнозов.',
   'Research Holdout · проверенные пары'));
  for(const mode of holdout.rows.filter(x=>x.state!=='DESCRIPTIVE'))
   missingEvidence.push(missing('Мало наблюдений: '+mode.label,
    mode.reason+'. Сравниваемые доли для этого режима скрыты.'));
 }else missingEvidence.push(missing('Контрольный исторический участок',
  holdout.reason||'Недостаточно проверенных данных для Research Holdout.'));
 if(!crossRecords){
  missingEvidence.push(missing('Межактивное сопоставление',
   'Cross-Asset Research в этой версии сравнивает только BTC, ETH и SOL. '+
   'Для '+asset+' не строим подменённых сравнений.'));
 }else if(cross.state==='DESCRIPTIVE'&&cross.assets.includes(asset)){
  const pairList=cross.pairs.filter(p=>p.a===asset||p.b===asset);
  observations.push(obs('Сопоставлены те же часы других криптоактивов',
   cross.matchedWindows+' совпадающих по времени 4H-окон для '+
   cross.assets.map(displayAsset).join(', ')+'. '+
   pairList.map(pair=>
    displayAsset(pair.a)+'/'+displayAsset(pair.b)+': '+
    pct(pair.sameModeShare)+'% одинаковых режимов').join(' · ')+'. '+
   'Монеты не считаются независимыми.',
   'Cross-Asset Research · общие H1-часы'));
  const divergent=pairList.filter(x=>
   x.sameModeShare<SYNTHESIS_RULES.lowCrossAgreementShare);
  if(divergent.length)
   differences.push(obs('В одинаковые часы режимы часто различались',
    divergent.map(x=>displayAsset(x.a)+'/'+displayAsset(x.b)+': '+
     pct(x.sameModeShare)+'% совпадений').join(' · ')+
    '. Порог выделения: менее 45%, без утверждений о причинности.',
    'Cross-Asset Research · синхронные метки'));
  for(const status of cross.statuses.filter(x=>x.state==='EXCLUDED'))
   missingEvidence.push(missing('Исключён актив '+status.asset,
    status.reason));
 }else{
  missingEvidence.push(missing('Межактивное сравнение недоступно',
   cross.reason||'Нет двух достоверных H1-архивов на одинаковых часах.'));
  for(const status of cross.statuses.filter(x=>x.state==='EXCLUDED'))
   missingEvidence.push(missing('Исключён актив '+status.asset,status.reason));
 }
 missingEvidence.push(missing('Прогнозная применимость не установлена',
  'Исторические совпадения, сдвиги и сравнения не доказывают будущую '+
  'точность, доходность или причинно-следственную связь.'));
 return {state:'DESCRIPTIVE',reason:null,asset,source,
  coverage:{regimes:'VERIFIED',stability:'VERIFIED',
   transitions:'VERIFIED',holdout:holdout.state,
   crossAsset:cross?.state||'NOT_APPLICABLE'},
  observations:observations.slice(0,SYNTHESIS_RULES.maxObservations),
  differences:differences.slice(0,SYNTHESIS_RULES.maxVariations),
  missing:missingEvidence,
  note:SYNTHESIS_NOTE,rules:SYNTHESIS_RULES};
}
