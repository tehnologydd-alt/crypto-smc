/**
 * APEX Android First: research-only historical on-chain / H1 overlap.
 * By design triggered by the user, not a background predictive model.
 */
import {chainForAsset} from './onchain-core.mjs';
import {compareOnChainMarketHistory} from './onchain-market-compare.mjs';
import {getMobileOnChainHistory,getMobileCandles,saveMobileCandles} from './mobile-bridge.mjs';
import {fetchCandles} from './candles.mjs';

const el=id=>document.getElementById(id);
const fmt=(x,d=2)=>Number.isFinite(x)
 ?new Intl.NumberFormat('ru-RU',{maximumFractionDigits:d}).format(x):'—';
const localTime=t=>Number.isSafeInteger(t)?new Date(t).toLocaleString('ru-RU'):'—';
function node(tag,cls,text){
 const n=document.createElement(tag);
 if(cls)n.className=cls;
 if(text!==undefined)n.textContent=String(text);
 return n;
}
const keyStatus={
 INSUFFICIENT:'Пока недостаточно совместной истории',
 LOW_VARIATION:'Сетевые изменения слишком однообразны для расчёта',
 INVALID:'Данные не прошли проверку',
 UNSUPPORTED:'Прямой сетевой адаптер отсутствует'
};
export function initOnChainMarketDashboard(){
 let selected='',seq=0,controller=null,busy=false;
 const run=el('onchain-market-run'),status=el('onchain-market-status'),
  area=el('onchain-market-results');
 const setStatus=(message,warning=false)=>{
  status.textContent=message;
  status.classList.toggle('is-offline',warning);
 };
 function blank(){
  area.replaceChildren();
  run.disabled=busy||!chainForAsset(selected);
 }
 function setAsset(asset){
  if(asset===selected)return;
  selected=asset;seq++;
  controller?.abort();controller=null;busy=false;
  blank();
  setStatus(chainForAsset(asset)
   ?'Доступно сравнение локальной истории '+asset+
     '. Для расчёта потребуется минимум 12 самостоятельных временных интервалов.'
   :'Для этого актива нет прямого проверенного сетевого адаптера.',!chainForAsset(asset));
 }
 function show(result){
  area.replaceChildren();
  const facts=node('div','onchain-match-grid');
  const entries=[
   ['Часов с наблюдениями',fmt(result.pairedHours,0)],
   ['Сопоставимых интервалов',fmt(result.intervals,0)],
   ['Сетевой показатель',result.networkMeasure||'—'],
   ['Исторический Pearson r',result.state==='DESCRIPTIVE'
     ?fmt(result.correlation,3):'Не вычислен']
  ];
  for(const [label,value] of entries){
   const cell=node('div','onchain-match-cell');
   cell.append(node('span','',label),node('strong','',value));
   facts.append(cell);
  }
  area.append(facts);
  if(result.state!=='DESCRIPTIVE'){
   area.append(node('p','onchain-match-note',
    (keyStatus[result.state]||'Для сравнения не хватает подтверждённых сведений')+
     ' · '+(result.reason||'Нужны дополнительные закрытые свечи и сетевые наблюдения')+'.'));
  }else{
   area.append(node('p','onchain-match-note',
    'r='+fmt(result.correlation,3)+' · '+result.intervals+
    ' исторических интервалов · '+localTime(result.firstAt)+
    ' — '+localTime(result.lastAt)+
    '. Положительная или отрицательная связь сама по себе не доказывает причинность и не имеет проверенной прогностической ценности.'));
  }
 }
 async function check(){
  if(busy||!chainForAsset(selected))return;
  const selectedAsset=selected,id=++seq;
  busy=true;run.disabled=true;controller?.abort();
  const abort=new AbortController();controller=abort;
  const watchdog=setTimeout(()=>abort.abort(),12000);
  setStatus('Считываем локальные сетевые наблюдения и завершённые H1-свечи…');
  try{
   const [network,local]=await Promise.all([
    getMobileOnChainHistory(selectedAsset,120),
    getMobileCandles(selectedAsset,'1h',500)
   ]);
   if(seq!==id||selectedAsset!==selected)return;
   let candles=local.candles||[];
   if(candles.length<20){
    setStatus('Недостаточно H1 в локальной базе. Однократно запрашиваем публичную историю Binance Spot…');
    const fetched=await fetchCandles(selectedAsset,'1h',{
     limit:500,signal:abort.signal,now:()=>Date.now()
    });
    if(seq!==id||selectedAsset!==selected)return;
    if(fetched.candles?.length){
     candles=fetched.candles;
     // Historical caching only; no saved synthetic series.
     void saveMobileCandles(selectedAsset,'1h',candles.filter(c=>c.closed));
    }
   }
   const result=compareOnChainMarketHistory(network.rows,candles,{
    asset:selectedAsset,now:Date.now()
   });
   if(seq!==id||selectedAsset!==selected)return;
   show(result);
   setStatus(result.state==='DESCRIPTIVE'
    ?'Рассчитано только историческое совпадение сетевых и рыночных наблюдений.'
    :'Проверка завершена: '+(keyStatus[result.state]||'неполные данные'),result.state!=='DESCRIPTIVE');
  }catch(error){
   if(seq===id)setStatus('Сопоставление недоступно: '+String(error?.message||error),true);
  }finally{
   clearTimeout(watchdog);
   if(seq===id){busy=false;controller=null;run.disabled=!chainForAsset(selected);}
  }
 }
 run.addEventListener('click',()=>void check());
 blank();
 return {setAsset};
}
