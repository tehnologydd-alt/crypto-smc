/** Lightweight public-source UI. Triggered only when a relevant page is opened.
 * No market orders, API keys or background jobs. Provider results stay separate.
 */
import {createFreeSourceBudget,FREE_POLICY} from './free-source-budget.mjs';
import {fetchFearGreed,fetchDexPairs,fetchGeckoPools,
 fetchOkxTicker,dexTokenReference} from './free-source-adapters.mjs';
const el=id=>document.getElementById(id);
const div=(tag,cls='',content)=>{
 const node=document.createElement(tag);
 if(cls)node.className=cls;
 if(content!==undefined)node.textContent=String(content);
 return node;
};
const nice=t=>Number.isSafeInteger(t)&&t>0?
 new Date(t).toLocaleString('ru-RU',{day:'2-digit',month:'2-digit',
 hour:'2-digit',minute:'2-digit'}):'неизвестно';
const fmt=(num,d=3)=>Number.isFinite(num)?
 new Intl.NumberFormat('ru-RU',{maximumFractionDigits:d}).format(num):'—';
const caps=(name,r)=>{
 const q=r?.quota;
 if(!q)return ' · квота не определена';
 return ' · '+q.used+'/'+FREE_POLICY[name].daily+' сегодня'+
  ' · '+q.monthlyUsed+'/'+FREE_POLICY[name].monthly+' за месяц';
};
const isPresent=r=>['OK','STALE','EMPTY'].includes(r?.state);
export function initFreeSourceDashboard({getSymbol,storage:provided}={}){
 let storage=provided??null;
 if(!storage)try{storage=window.localStorage;}catch{}
 const budget=createFreeSourceBudget({storage});
 const latest=new Map();
 let assetSeq=0,globalSeq=0;
 function annotate(mode,r){
  latest.set(mode,r?.state||'UNKNOWN');
  refreshCenter();
 }
 function refreshCenter(){
  const container=el('free-provider-center'),timeStatus=el('free-provider-center-status');
  if(!container||!timeStatus)return;
  container.replaceChildren();
  let ok=0;
  const names={
   fear:'Alternative.me · Fear & Greed',
   dex:'DEX Screener · WETH / WSOL',
   gecko:'GeckoTerminal · WETH / WSOL',
   okx:'OKX · Spot ticker'
  };
  for(const mode of ['fear','dex','gecko','okx']){
   const q=budget.status(mode),name=names[mode],last=latest.get(mode)||'НЕ ПРОВЕРЯЛСЯ';
   const row=div('article','free-source-center-row');
   row.append(div('strong','',name),
    div('span','',q.state==='OK'?
     'День '+q.used+'/'+q.limit+' · месяц '+
      q.monthlyUsed+'/'+q.monthlyLimit:
     'Локальный учёт недоступен'),
    div('small','',last+(q.nextAt&&q.nextAt>Date.now()?
     ' · не раньше '+nice(q.nextAt):'')));
   container.append(row);
   if(last==='OK')ok++;
  }
  timeStatus.textContent=ok+' из 4 источников дали корректный ответ в этой сессии. '+
   'Все квоты локальные; IP-лимиты поставщиков действуют отдельно.';
 }
 function showFear(r){
  const status=el('free-fear-status'),value=el('free-fear-value');
  if(!status||!value)return;
  if(isPresent(r)&&r.data){
   value.textContent=String(r.data.value)+' / 100';
   status.textContent='Alternative.me · '+r.data.classification+
    ' · наблюдение '+nice(r.data.observedAt)+
    (r.state==='STALE'?' · архив':'')+caps('fear',r);
  }else{
   value.textContent='—';
   status.textContent='Alternative.me · '+(r?.state||'OFFLINE')+
    (r?.reason?' · '+r.reason:'')+caps('fear',r);
  }
 }
 function cardResult(mode,result,symbol){
  const outer=div('article','free-source-result');
  const label={okx:'OKX Spot',dex:'DEX Screener',gecko:'GeckoTerminal'}[mode];
  outer.append(div('strong','',label));
  if(!isPresent(result)||!result.data){
   const reason=mode!=='okx'&&!dexTokenReference(symbol)?
    'Для этого символа нет проверенного контракта, запрос не выполнялся':
    (result.reason||result.state||'Источник недоступен');
   outer.append(div('small','',reason+caps(mode,result)));
   return outer;
  }
  const data=result.data;
  if(mode==='okx'){
   outer.append(div('span','free-source-figure',
    'Spot: '+fmt(data.price,7)+' USDT'),
    div('small','',
     'Bid '+fmt(data.bid,7)+' · Ask '+fmt(data.ask,7)));
  }else{
   outer.append(div('span','free-source-figure',
    data.tokenLabel+' · '+fmt(data.priceUsd,7)+' USD'),
    div('small','',
     'DEX-пул · ликвидность $'+fmt(data.liquidityUsd,0)+
     ' · объём 24 ч $'+fmt(data.volume24hUsd,0)));
  }
  outer.append(div('small','',
   'Получено '+nice(result.fetchedAt)+
   (result.state==='STALE'?' · архив':'')+caps(mode,result)));
  return outer;
 }
 async function openOverview(){
  const seq=++globalSeq;
  const status=el('free-fear-status');
  if(status)status.textContent='Проверяем Alternative.me и кеш…';
  const r=await budget.load('fear',()=>fetchFearGreed());
  if(seq!==globalSeq)return;
  showFear(r);annotate('fear',r);
 }
 async function openAsset(symbol=getSymbol?.()){
  const seq=++assetSeq;
  const list=el('free-asset-market-results');
  const status=el('free-asset-market-status');
  if(!list||!status)return;
  list.replaceChildren();
  status.textContent='Проверяем бесплатные источники и суточные лимиты…';
  const supportsDex=Boolean(dexTokenReference(symbol));
  const sourceCalls=[
   budget.load('okx',()=>fetchOkxTicker(symbol),{key:symbol}),
   supportsDex?budget.load('dex',()=>fetchDexPairs(symbol),{key:symbol}):
    Promise.resolve({state:'UNSUPPORTED'}),
   supportsDex?budget.load('gecko',()=>fetchGeckoPools(symbol),{key:symbol}):
    Promise.resolve({state:'UNSUPPORTED'})
  ];
  const responses=await Promise.all(sourceCalls);
  if(seq!==assetSeq||getSymbol?.()!==symbol)return;
  for(const [i,mode] of ['okx','dex','gecko'].entries()){
   const r=responses[i];
   list.append(cardResult(mode,r,symbol));
   if(supportsDex||mode==='okx')annotate(mode,r);
  }
  const good=responses.filter(x=>x.state==='OK').length;
  status.textContent=symbol+' · проверено '+good+'/3 источников'+
   (!supportsDex?' · без DEX: нет надёжного контракта':'')+
   '. DEX-цены обёрнутых токенов не равны ценам нативных активов.';
 }
 el('free-fear-refresh')?.addEventListener('click',()=>void openOverview());
 el('free-asset-market-refresh')?.addEventListener('click',
  ()=>void openAsset(getSymbol?.()));
 refreshCenter();
 return {openOverview,openAsset,refreshCenter};
}
