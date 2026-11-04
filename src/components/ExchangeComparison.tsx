import React from 'react';
import { PriceSnapshot } from '../types/crypto';
import { ArrowUpRight, ArrowDownRight, Layers, ArrowRightLeft, ShieldCheck, Clock } from 'lucide-react';

interface ExchangeComparisonProps {
  snapshot: PriceSnapshot | null;
  isLoading: boolean;
  onRefresh: () => void;
}

export const ExchangeComparison: React.FC<ExchangeComparisonProps> = ({
  snapshot,
  isLoading,
  onRefresh,
}) => {
  if (!snapshot) {
    return (
      <div className="bg-[#0b101c] border border-slate-800 rounded-xl p-8 text-center text-slate-400">
        <div className="inline-block animate-spin mb-2">
          <Layers className="w-8 h-8 text-emerald-400" />
        </div>
        <p className="text-sm">Загрузка данных с Binance и Bybit...</p>
      </div>
    );
  }

  const { exchanges, comparison, symbol, timestamp } = snapshot;
  const binance = exchanges.binance;
  const bybit = exchanges.bybit;

  const formatPrice = (val: number) => {
    if (val >= 1000) return val.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (val >= 1) return val.toLocaleString('ru-RU', { minimumFractionDigits: 3, maximumFractionDigits: 4 });
    return val.toLocaleString('ru-RU', { minimumFractionDigits: 4, maximumFractionDigits: 6 });
  };

  const formatVolume = (val: number) => {
    if (val >= 1000000) return `${(val / 1000000).toFixed(2)}M`;
    if (val >= 1000) return `${(val / 1000).toFixed(1)}K`;
    return val.toFixed(1);
  };

  const formattedTime = new Date(timestamp).toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  return (
    <div className="space-y-4 mb-6">
      {/* Overview Top Info Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-[#0d1424] border border-slate-800/80 rounded-xl p-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-extrabold text-white tracking-tight">{snapshot.asset.name}</h1>
            <span className="text-xs font-mono text-emerald-400 font-semibold bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
              {symbol}
            </span>
            <span className="text-xs text-slate-400">· {snapshot.asset.network}</span>
          </div>
          <div className="flex items-center gap-3 text-xs text-slate-400 mt-1">
            <span className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-slate-500" />
              Срез зафиксирован в <strong className="text-slate-300 font-mono">{formattedTime}</strong>
            </span>
            <span aria-hidden="true">·</span>
            <span>Только реальные котировки (Без торговли и симуляций)</span>
          </div>
        </div>

        {/* Spread badge & Cheaper exchange note */}
        <div className="flex items-center gap-3 bg-slate-900/80 border border-slate-800 p-2.5 rounded-lg">
          <ArrowRightLeft className="w-4 h-4 text-cyan-400 shrink-0" />
          <div className="text-xs">
            <div className="text-slate-400 text-[11px]">Межбиржевой спред:</div>
            <div className="font-mono font-semibold text-slate-100 tabular-nums">
              {binance.status==='LIVE' && bybit.status==='LIVE' ? `$${comparison.spreadAbsolute.toFixed(2)} (${comparison.spreadPercent.toFixed(3)}%)` : 'Нет данных двух бирж'}
            </div>
          </div>
          <div className="pl-2 border-l border-slate-800 text-xs">
            <span className="text-slate-400 text-[11px]">Выгоднее на:</span>
            <div className="font-semibold text-emerald-400">{binance.status==='LIVE' && bybit.status==='LIVE' ? comparison.cheaperExchange : '—'}</div>
          </div>
        </div>
      </div>

      {/* 2-Column Grid: Binance vs Bybit Spot Tickers */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* BINANCE CARD */}
        <div className="bg-[#0b101c] border border-slate-800/90 rounded-xl p-4 relative overflow-hidden shadow-md hover:border-slate-700 transition">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800/70 mb-3">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-[#f3ba2f]/10 border border-[#f3ba2f]/30 flex items-center justify-center font-bold text-[#f3ba2f] text-xs">
                B
              </div>
              <span className="font-bold text-sm text-slate-100">Binance Spot</span>
              <span className="text-[10px] text-emerald-400 font-mono bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                {binance.status==='LIVE'?'LIVE СРЕЗ':'НЕТ СВЯЗИ'}
              </span>
            </div>
            <div className={`flex items-center gap-1 font-mono text-xs font-semibold px-2 py-0.5 rounded ${
              binance.change24h >= 0 ? 'text-emerald-400 bg-emerald-500/10' : 'text-rose-400 bg-rose-500/10'
            }`}>
              {binance.change24h >= 0 ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
              <span>{binance.change24h >= 0 ? '+' : ''}{binance.change24h.toFixed(2)}%</span>
            </div>
          </div>

          {/* Current Price */}
          <div className="mb-4">
            <div className="text-xs text-slate-400">Текущая цена:</div>
            <div className="text-2xl sm:text-3xl font-extrabold font-mono text-white tracking-tight tabular-nums">
              {binance.status==='LIVE'?`$${formatPrice(binance.price)}`:'—'} <span className="text-sm font-normal text-slate-400">USDT</span>
            </div>
          </div>

          {/* 24h Stats Row */}
          <div className="grid grid-cols-3 gap-2 p-2.5 rounded-lg bg-slate-900/60 border border-slate-800/80 text-xs font-mono mb-4">
            <div>
              <span className="text-[10px] text-slate-400 block font-sans">24ч High</span>
              <span className="text-slate-200 tabular-nums">${formatPrice(binance.high24h)}</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 block font-sans">24ч Low</span>
              <span className="text-slate-200 tabular-nums">${formatPrice(binance.low24h)}</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 block font-sans">24ч Объём</span>
              <span className="text-slate-200 tabular-nums">{formatVolume(binance.volume24h)} {snapshot.asset.base}</span>
            </div>
          </div>

          {/* Order Book Micro Depth */}
          <div>
            <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1.5">
              <span>Глубина книги ордеров (Binance)</span>
              <span>Цена (USDT) / Объём</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
              {/* Bids */}
              <div className="space-y-1">
                {binance.orderBook.topBids.slice(0, 3).map((b, idx) => (
                  <div key={idx} className="flex justify-between p-1 rounded bg-emerald-500/5 text-emerald-400 border border-emerald-500/10">
                    <span className="tabular-nums">${formatPrice(b.price)}</span>
                    <span className="text-slate-400 tabular-nums">{b.amount.toFixed(3)}</span>
                  </div>
                ))}
              </div>
              {/* Asks */}
              <div className="space-y-1">
                {binance.orderBook.topAsks.slice(0, 3).map((a, idx) => (
                  <div key={idx} className="flex justify-between p-1 rounded bg-rose-500/5 text-rose-400 border border-rose-500/10">
                    <span className="tabular-nums">${formatPrice(a.price)}</span>
                    <span className="text-slate-400 tabular-nums">{a.amount.toFixed(3)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* BYBIT CARD */}
        <div className="bg-[#0b101c] border border-slate-800/90 rounded-xl p-4 relative overflow-hidden shadow-md hover:border-slate-700 transition">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800/70 mb-3">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-[#f7a600]/10 border border-[#f7a600]/30 flex items-center justify-center font-bold text-[#f7a600] text-xs">
                Y
              </div>
              <span className="font-bold text-sm text-slate-100">Bybit Spot</span>
              <span className="text-[10px] text-emerald-400 font-mono bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                {bybit.status==='LIVE'?'LIVE СРЕЗ':'НЕТ СВЯЗИ'}
              </span>
            </div>
            <div className={`flex items-center gap-1 font-mono text-xs font-semibold px-2 py-0.5 rounded ${
              bybit.change24h >= 0 ? 'text-emerald-400 bg-emerald-500/10' : 'text-rose-400 bg-rose-500/10'
            }`}>
              {bybit.change24h >= 0 ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
              <span>{bybit.change24h >= 0 ? '+' : ''}{bybit.change24h.toFixed(2)}%</span>
            </div>
          </div>

          {/* Current Price */}
          <div className="mb-4">
            <div className="text-xs text-slate-400">Текущая цена:</div>
            <div className="text-2xl sm:text-3xl font-extrabold font-mono text-white tracking-tight tabular-nums">
              {bybit.status==='LIVE'?`$${formatPrice(bybit.price)}`:'—'} <span className="text-sm font-normal text-slate-400">USDT</span>
            </div>
          </div>

          {/* 24h Stats Row */}
          <div className="grid grid-cols-3 gap-2 p-2.5 rounded-lg bg-slate-900/60 border border-slate-800/80 text-xs font-mono mb-4">
            <div>
              <span className="text-[10px] text-slate-400 block font-sans">24ч High</span>
              <span className="text-slate-200 tabular-nums">${formatPrice(bybit.high24h)}</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 block font-sans">24ч Low</span>
              <span className="text-slate-200 tabular-nums">${formatPrice(bybit.low24h)}</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 block font-sans">24ч Объём</span>
              <span className="text-slate-200 tabular-nums">{formatVolume(bybit.volume24h)} {snapshot.asset.base}</span>
            </div>
          </div>

          {/* Order Book Micro Depth */}
          <div>
            <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1.5">
              <span>Глубина книги ордеров (Bybit)</span>
              <span>Цена (USDT) / Объём</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
              {/* Bids */}
              <div className="space-y-1">
                {bybit.orderBook.topBids.slice(0, 3).map((b, idx) => (
                  <div key={idx} className="flex justify-between p-1 rounded bg-emerald-500/5 text-emerald-400 border border-emerald-500/10">
                    <span className="tabular-nums">${formatPrice(b.price)}</span>
                    <span className="text-slate-400 tabular-nums">{b.amount.toFixed(3)}</span>
                  </div>
                ))}
              </div>
              {/* Asks */}
              <div className="space-y-1">
                {bybit.orderBook.topAsks.slice(0, 3).map((a, idx) => (
                  <div key={idx} className="flex justify-between p-1 rounded bg-rose-500/5 text-rose-400 border border-rose-500/10">
                    <span className="tabular-nums">${formatPrice(a.price)}</span>
                    <span className="text-slate-400 tabular-nums">{a.amount.toFixed(3)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
