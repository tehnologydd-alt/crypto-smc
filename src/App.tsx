import React, { useState, useEffect, useCallback } from 'react';
import { Header } from './components/Header';
import { AssetSelector } from './components/AssetSelector';
import { ExchangeComparison } from './components/ExchangeComparison';
import { OrderBlockVisualizer } from './components/OrderBlockVisualizer';
import { WhaleRadar } from './components/WhaleRadar';
import { SentimentAnalytics } from './components/SentimentAnalytics';
import { AISignalPanel } from './components/AISignalPanel';
import { OfflineIndicator } from './components/OfflineIndicator';
import { AssetInfo, PriceSnapshot, WhaleRadarData, SentimentData, AISignalResponse } from './types/crypto';
import { ShieldCheck, Layers, Radio, Sparkles, TrendingUp, Info } from 'lucide-react';
import { getMarketSnapshot, getSentiment, getWhaleRadar } from './lib/market';
import { forecast } from './lib/forecast';
import { checkGeminiKey, optionalGeminiForecast } from './lib/gemini';

const ASSETS: AssetInfo[] = [
  { symbol: 'BTCUSDT', base: 'BTC', quote: 'USDT', name: 'Bitcoin', network: 'Bitcoin' },
  { symbol: 'ETHUSDT', base: 'ETH', quote: 'USDT', name: 'Ethereum', network: 'Ethereum' },
  { symbol: 'SOLUSDT', base: 'SOL', quote: 'USDT', name: 'Solana', network: 'Solana' },
  { symbol: 'BNBUSDT', base: 'BNB', quote: 'USDT', name: 'BNB', network: 'BNB Chain' },
  { symbol: 'XRPUSDT', base: 'XRP', quote: 'USDT', name: 'Ripple', network: 'XRP Ledger' },
  { symbol: 'AVAXUSDT', base: 'AVAX', quote: 'USDT', name: 'Avalanche', network: 'Avalanche' },
  { symbol: 'SUIUSDT', base: 'SUI', quote: 'USDT', name: 'Sui', network: 'Sui' },
  { symbol: 'NEARUSDT', base: 'NEAR', quote: 'USDT', name: 'NEAR Protocol', network: 'NEAR' },
  { symbol: 'LINKUSDT', base: 'LINK', quote: 'USDT', name: 'Chainlink', network: 'Ethereum' },
  { symbol: 'DOGEUSDT', base: 'DOGE', quote: 'USDT', name: 'Dogecoin', network: 'Dogecoin' },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<string>('overview');
  const [selectedSymbol, setSelectedSymbol] = useState<string>('BTCUSDT');
  const [favorites, setFavorites] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('apex_favorites');
      return saved ? JSON.parse(saved) : ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'];
    } catch {
      return ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'];
    }
  });
  const [showOnlyFavorites, setShowOnlyFavorites] = useState<boolean>(false);

  const [snapshot, setSnapshot] = useState<PriceSnapshot | null>(null);
  const [whaleData, setWhaleData] = useState<WhaleRadarData | null>(null);
  const [sentimentData, setSentimentData] = useState<SentimentData | null>(null);
  const [signalData, setSignalData] = useState<AISignalResponse | null>(null);

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string>('');
  const [signalError, setSignalError] = useState<string>('');
  // User-supplied optional key exists in volatile memory only; never saved or embedded.
  const [geminiKey, setGeminiKey] = useState<string>('');
  const [geminiModel, setGeminiModel] = useState<string>('');
  const [geminiStatus, setGeminiStatus] = useState<string>('');
  const [isTestingGemini, setIsTestingGemini] = useState<boolean>(false);
  const [isGeneratingSignal, setIsGeneratingSignal] = useState<boolean>(false);

  // Toggle favorite and persist
  const handleToggleFavorite = (symbol: string) => {
    setFavorites((prev) => {
      const next = prev.includes(symbol)
        ? prev.filter((s) => s !== symbol)
        : [...prev, symbol];
      try {
        localStorage.setItem('apex_favorites', JSON.stringify(next));
      } catch (e) {
        console.error('Failed to save favorites', e);
      }
      return next;
    });
  };

  // Direct HTTP on the Android device, no AI Studio/Express server.
  const fetchMarketSnapshot = useCallback(async (symbol: string) => {
    setIsLoading(true);
    setLoadError('');
    setSignalData(null);
    setSignalError('');
    setSnapshot(null);
    setWhaleData(null);
    setSentimentData(null);
    try {
      const result=await getMarketSnapshot(symbol);
      setSnapshot(result);
      setWhaleData(getWhaleRadar(result));
      setSentimentData(await getSentiment(symbol));
      try {localStorage.setItem(`apex_last_${symbol}`,JSON.stringify(result));}catch{}
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Источники недоступны');
      // Saved data is NEVER presented as current live market data.
      try {
        const raw=localStorage.getItem(`apex_last_${symbol}`);
        if(raw){
          const cached=JSON.parse(raw) as PriceSnapshot;
          if(cached?.symbol===symbol&&Date.now()-cached.timestamp<24*60*60*1000){
            setSnapshot(cached);
            setWhaleData(getWhaleRadar(cached));
            setLoadError('Нет связи. Показан старый сохранённый срез; новый прогноз недоступен до обновления.');
          }
        }
      }catch{}
    } finally {setIsLoading(false);}
  }, []);

  useEffect(() => {void fetchMarketSnapshot(selectedSymbol);}, [fetchMarketSnapshot,selectedSymbol]);
  const handleSelectAsset=(symbol:string)=>{setSelectedSymbol(symbol);};

  const handleCheckGeminiKey = async () => {
    if (!geminiKey.trim()) {setGeminiStatus('Введите Gemini API-ключ.'); return;}
    setIsTestingGemini(true);
    setGeminiStatus('Проверка доступа к Gemini API…');
    try {
      const model = await checkGeminiKey(geminiKey);
      setGeminiModel(model);
      setGeminiStatus('Ключ принят. Доступна модель: ' + model);
    } catch (e) {
      setGeminiModel('');
      setGeminiStatus('Проверка не пройдена: ' + (e instanceof Error ? e.message : String(e)));
    } finally {setIsTestingGemini(false);}
  };

  const handleGenerateSignal = async () => {
    if(!snapshot) {setSignalError('Сначала загрузите котировки и свечи');return;}
    setIsGeneratingSignal(true);
    setSignalError('');
    try {
      const local=forecast(snapshot,whaleData,sentimentData);
      if(geminiKey.trim()){
        try {const {report,model}=await optionalGeminiForecast(geminiKey,snapshot,local,geminiModel||undefined);setSignalData(report);setGeminiModel(model);setGeminiStatus('Gemini подключён: '+model);}
        catch(e){setSignalData(local);setSignalError(`Gemini недоступен, показан локальный прогноз: ${e instanceof Error?e.message:String(e)}`);}
      }else setSignalData(local);
    }catch(err){setSignalError(err instanceof Error?err.message:'Не удалось рассчитать прогноз');}
    finally {setIsGeneratingSignal(false);}
  };

  return (
    <div className="min-h-screen bg-[#080c14] text-slate-100 flex flex-col font-sans">
      <Header
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onRefreshSnapshot={() => fetchMarketSnapshot(selectedSymbol)}
        isLoading={isLoading}
        selectedAsset={selectedSymbol}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-5">
        {/* Asset Selection & Favorites Switcher */}
        <AssetSelector
          assets={ASSETS}
          selectedSymbol={selectedSymbol}
          onSelectAsset={handleSelectAsset}
          favorites={favorites}
          onToggleFavorite={handleToggleFavorite}
          showOnlyFavorites={showOnlyFavorites}
          setShowOnlyFavorites={setShowOnlyFavorites}
          isLoading={isLoading}
        />

        <section className="mb-4 rounded-lg border border-slate-800 bg-[#0b101c] p-3 text-xs text-slate-400">
          <div className="flex flex-wrap gap-2 items-center justify-between">
            <span>Режим: <strong className="text-emerald-400">Локальные прогнозы без AI Studio</strong>. Gemini API необязателен и не нужен для запуска.</span>
            <div className="flex flex-wrap gap-2 items-center">
              <input aria-label="Необязательный Gemini API ключ" className="w-56 max-w-full rounded bg-slate-900 border border-slate-700 px-2 py-2 text-slate-200" type="password" autoComplete="off" autoCapitalize="none" spellCheck={false} placeholder="Gemini API ключ (необязательно)" value={geminiKey} onChange={e=>{setGeminiKey(e.target.value);setGeminiModel('');setGeminiStatus('');}} />
              <button type="button" onClick={handleCheckGeminiKey} disabled={isTestingGemini||!geminiKey.trim()} className="rounded bg-indigo-700 disabled:opacity-50 px-3 py-2 text-white">{isTestingGemini?'Проверка…':'Проверить ключ'}</button>
            </div>
          </div>
          {geminiStatus && <p role="status" className="text-sky-300 mt-2">{geminiStatus}</p>}
          {loadError && <p role="alert" className="text-amber-300 mt-2">{loadError}</p>}
          {signalError && <p role="alert" className="text-amber-300 mt-2">{signalError}</p>}
        </section>

        {/* View Routing / Tab Filtering */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            <ExchangeComparison
              snapshot={snapshot}
              isLoading={isLoading}
              onRefresh={() => fetchMarketSnapshot(selectedSymbol)}
            />

            <AISignalPanel
              signalData={signalData}
              isGenerating={isGeneratingSignal}
              onGenerate={handleGenerateSignal}
              symbol={selectedSymbol}
            />

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {snapshot?.smc && (
                <OrderBlockVisualizer
                  smc={snapshot.smc}
                  currentPrice={snapshot.exchanges.binance.price||snapshot.exchanges.bybit.price}
                  symbol={selectedSymbol}
                />
              )}
              <SentimentAnalytics sentimentData={sentimentData} isLoading={isLoading} />
            </div>

            <WhaleRadar radarData={whaleData} isLoading={isLoading} />
          </div>
        )}

        {activeTab === 'smc' && (
          <div>
            <ExchangeComparison
              snapshot={snapshot}
              isLoading={isLoading}
              onRefresh={() => fetchMarketSnapshot(selectedSymbol)}
            />
            {snapshot?.smc ? (
              <OrderBlockVisualizer
                smc={snapshot.smc}
                currentPrice={snapshot.exchanges.binance.price||snapshot.exchanges.bybit.price}
                symbol={selectedSymbol}
              />
            ) : null}
          </div>
        )}

        {activeTab === 'whales' && (
          <div>
            <WhaleRadar radarData={whaleData} isLoading={isLoading} />
          </div>
        )}

        {activeTab === 'sentiment' && (
          <div>
            <SentimentAnalytics sentimentData={sentimentData} isLoading={isLoading} />
          </div>
        )}

        {activeTab === 'signals' && (
          <div>
            <AISignalPanel
              signalData={signalData}
              isGenerating={isGeneratingSignal}
              onGenerate={handleGenerateSignal}
              symbol={selectedSymbol}
            />
            {snapshot?.smc && (
              <OrderBlockVisualizer
                smc={snapshot.smc}
                currentPrice={snapshot.exchanges.binance.price||snapshot.exchanges.bybit.price}
                symbol={selectedSymbol}
              />
            )}
          </div>
        )}
      </main>

      {/* Footer strictly fulfilling "No simulation / purely monitoring" requirement */}
      <footer className="border-t border-slate-800/80 bg-[#060910] py-6 px-4 text-xs text-slate-500">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>
              ApexiCrypto SMC & Whale Intelligence Terminal
            </span>
          </div>

          <div className="text-center sm:text-right text-[11px] text-slate-400">
            Данные с бирж Binance и Bybit · PWA с офлайн-кешированием · Без торговли и симуляций
          </div>
        </div>
      </footer>

      <OfflineIndicator />
    </div>
  );
}
