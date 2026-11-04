import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Header } from './components/Header';
import { AssetSelector } from './components/AssetSelector';
import { ExchangeComparison } from './components/ExchangeComparison';
import { OrderBlockVisualizer } from './components/OrderBlockVisualizer';
import { WhaleRadar } from './components/WhaleRadar';
import { SentimentAnalytics } from './components/SentimentAnalytics';
import { AISignalPanel } from './components/AISignalPanel';
import { OfflineIndicator } from './components/OfflineIndicator';
import type { PriceSnapshot, SentimentData, LocalAnalysis } from './types/crypto';
import { ASSETS, fetchMarket, fetchSentiment, deriveOrderWalls, analyzeLocally } from './lib/market';
import { ShieldCheck, AlertTriangle } from 'lucide-react';

const cacheKey=(symbol:string)=>`apexi_snapshot_v2_${symbol}`;
const readCache=(symbol:string):PriceSnapshot|null=>{
  try {const s=localStorage.getItem(cacheKey(symbol)); return s?JSON.parse(s):null;}catch {return null;}
};
export default function App(){
  const [activeTab,setActiveTab]=useState('overview');
  const [selectedSymbol,setSelectedSymbol]=useState('BTCUSDT');
  const [favorites,setFavorites]=useState<string[]>(()=>{try {const saved=localStorage.getItem('apex_favorites');return saved?JSON.parse(saved):['BTCUSDT','ETHUSDT','SOLUSDT'];}catch{return ['BTCUSDT','ETHUSDT','SOLUSDT'];}});
  const [showOnlyFavorites,setShowOnlyFavorites]=useState(false);
  const [snapshot,setSnapshot]=useState<PriceSnapshot|null>(()=>readCache('BTCUSDT'));
  const [sentimentData,setSentimentData]=useState<SentimentData|null>(null);
  const [signalData,setSignalData]=useState<LocalAnalysis|null>(null);
  const [isLoading,setIsLoading]=useState(false);
  const [isGeneratingSignal,setIsGeneratingSignal]=useState(false);
  const [stale,setStale]=useState(!!readCache('BTCUSDT'));
  const [error,setError]=useState('');
  const requestNumber=useRef(0);
  const selectedRef=useRef(selectedSymbol);
  selectedRef.current=selectedSymbol;
  const toggleFavorite=(symbol:string)=>setFavorites(prev=>{const next=prev.includes(symbol)?prev.filter(s=>s!==symbol):[...prev,symbol];try{localStorage.setItem('apex_favorites',JSON.stringify(next));}catch{}return next;});
  const refresh=useCallback(async(symbol:string)=>{
    const req=++requestNumber.current;
    setIsLoading(true);setError('');
    try {
      const result=await fetchMarket(symbol);
      if(req!==requestNumber.current) return;
      setSnapshot(result);setStale(false);setSignalData(null);setSentimentData(null);
      try {localStorage.setItem(cacheKey(symbol),JSON.stringify(result));}catch{}
      void fetchSentiment(result).then(data=>{if(req===requestNumber.current)setSentimentData(data);});
    } catch(e) {
      if(req!==requestNumber.current)return;
      setError(e instanceof Error?e.message:'Нет связи с источниками');setStale(true);
      setSnapshot(readCache(symbol));setSentimentData(null);setSignalData(null);
    } finally {if(req===requestNumber.current)setIsLoading(false);}
  },[]);
  useEffect(()=>{setSnapshot(readCache(selectedSymbol));setStale(true);setSentimentData(null);setSignalData(null);void refresh(selectedSymbol);},[selectedSymbol,refresh]);
  useEffect(()=>{
    const reload=()=>{ if(document.visibilityState==='visible' && navigator.onLine) void refresh(selectedRef.current); };
    const id=setInterval(()=>{if(navigator.onLine && document.visibilityState==='visible')void refresh(selectedRef.current);},60000);
    document.addEventListener('visibilitychange',reload);
    return()=>{clearInterval(id);document.removeEventListener('visibilitychange',reload);};
  },[refresh]);
  const walls=snapshot?deriveOrderWalls(snapshot):null;
  const price=snapshot?(snapshot.exchanges.binance?.price??snapshot.exchanges.bybit?.price??0):0;
  const runAnalysis=()=>{if(!snapshot||stale){setError('Для нового анализа необходимы свежие данные биржи.');return;}setIsGeneratingSignal(true);setSignalData(analyzeLocally(snapshot,deriveOrderWalls(snapshot)));setIsGeneratingSignal(false);setActiveTab('signals');};
  const smcPanel=snapshot?.smc&&price>0?<OrderBlockVisualizer smc={snapshot.smc} currentPrice={price} symbol={selectedSymbol}/>:<div className="rounded-xl bg-slate-900/50 border border-slate-800 p-4 text-xs text-amber-300 mb-6">SMC недоступен: нужны минимум 24 закрытые часовые свечи с Binance. Фальшивые уровни не создаются.</div>;
  return <div className="min-h-screen bg-[#080c14] text-slate-100 font-sans flex flex-col">
    <Header activeTab={activeTab} onTabChange={setActiveTab} onRefreshSnapshot={()=>void refresh(selectedSymbol)} isLoading={isLoading} selectedAsset={selectedSymbol}/>
    <main className="max-w-7xl w-full mx-auto px-3 sm:px-6 py-5 flex-1">
      <AssetSelector assets={ASSETS} selectedSymbol={selectedSymbol} onSelectAsset={setSelectedSymbol} favorites={favorites} onToggleFavorite={toggleFavorite} showOnlyFavorites={showOnlyFavorites} setShowOnlyFavorites={setShowOnlyFavorites} isLoading={isLoading}/>
      {(stale||error)&&<div role="status" className="border border-amber-500/30 bg-amber-950/20 rounded-lg p-3 mb-5 text-xs text-amber-200 flex gap-2 items-start"><AlertTriangle size={16} className="shrink-0"/><div>{error||'Показан сохранённый срез. Данные могут быть устаревшими.'}{snapshot&&<div className="mt-1">Последнее обновление: {new Date(snapshot.timestamp).toLocaleString('ru-RU')} · сохранено на устройстве.</div>}</div></div>}
      {activeTab==='overview'&&<><ExchangeComparison snapshot={snapshot} stale={stale} isLoading={isLoading} onRefresh={()=>void refresh(selectedSymbol)}/><AISignalPanel signalData={signalData} isGenerating={isGeneratingSignal} onGenerate={runAnalysis} symbol={selectedSymbol}/><div className="grid lg:grid-cols-2 gap-4"><div>{smcPanel}</div><SentimentAnalytics sentimentData={sentimentData} isLoading={isLoading}/></div><WhaleRadar radarData={walls} isLoading={isLoading}/></>}
      {activeTab==='smc'&&<>{smcPanel}</>}
      {activeTab==='whales'&&<WhaleRadar radarData={walls} isLoading={isLoading}/>}
      {activeTab==='sentiment'&&<SentimentAnalytics sentimentData={sentimentData} isLoading={isLoading}/>}
      {activeTab==='signals'&&<><AISignalPanel signalData={signalData} isGenerating={isGeneratingSignal} onGenerate={runAnalysis} symbol={selectedSymbol}/>{smcPanel}</>}
    </main>
    <footer className="border-t border-slate-800 bg-[#060910] p-4 text-[11px] text-slate-400"><div className="max-w-7xl mx-auto flex items-start gap-2"><ShieldCheck size={16} className="text-emerald-400 shrink-0"/><span>ApexiCrypto Android Standalone · Никаких подключений к AI Studio или торговым счетам. Интернет нужен только для публичных рыночных API; локальные алгоритмы и сохранённые данные работают без сервера. Аналитика не является гарантированным прогнозом.</span></div></footer>
    <OfflineIndicator/>
  </div>;
}
