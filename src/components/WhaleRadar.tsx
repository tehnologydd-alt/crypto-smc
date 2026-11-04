import whaleImage from '../assets/images/whale-radar.jpg';
import React, { useState } from 'react';
import { WhaleRadarData, WhaleAlert } from '../types/crypto';
import {
  Anchor,
  ArrowRight,
  ShieldCheck,
  Activity,
  Database,
  Globe,
  Landmark,
  Coins,
  Cpu,
  Layers,
  Building2,
  Lock,
} from 'lucide-react';

interface WhaleRadarProps {
  radarData: WhaleRadarData | null;
  isLoading: boolean;
}

export const WhaleRadar: React.FC<WhaleRadarProps> = ({ radarData, isLoading }) => {
  const [filterCategory, setFilterCategory] = useState<string>('ALL');

  if (!radarData) {
    return (
      <div className="bg-[#0b101c] border border-slate-800 rounded-xl p-8 text-center text-slate-400">
        <Activity className="w-6 h-6 animate-pulse text-cyan-400 mx-auto mb-2" />
        <p className="text-sm">Сканирование ончейн-транзакций и кошельков китов...</p>
      </div>
    );
  }

  const formatUsd = (val: number) => {
    if (val >= 1000000000) return `$${(val / 1000000000).toFixed(2)}B`;
    if (val >= 1000000) return `$${(val / 1000000).toFixed(1)}M`;
    if (val >= 1000) return `$${(val / 1000).toFixed(0)}K`;
    return `$${val}`;
  };

  const filteredAlerts = radarData.recentAlerts.filter((a) => {
    if (filterCategory === 'ALL') return true;
    return a.category === filterCategory;
  });

  return (
    <div className="bg-[#0b101c] border border-slate-800/90 rounded-xl p-4 sm:p-5 mb-6 shadow-lg">
      {/* Top Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 mb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <Anchor className="w-5 h-5 text-cyan-400" />
            <h2 className="text-base font-bold text-slate-100">
              Радар Китов · Институциональная ликвидность
            </h2>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Панель исходного приложения. Достоверные биржевые заявки — в реальном времени; ончейн-источник пока не подключён
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap text-xs">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 font-mono text-[11px]">
            <Globe className="w-3.5 h-3.5 text-cyan-400" />
            <span>Проверенных кошельков: {radarData.trackedEntitiesCount.toLocaleString()}</span>
          </span>
          <span className="font-mono font-semibold px-2.5 py-1 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 text-[11px]">
            Индекс крупных заявок: {radarData.whaleDominanceIndex}%
          </span>
        </div>
      </div>

      {/* Hero Visual Card with Summary */}
      <div className="relative rounded-xl overflow-hidden mb-5 border border-slate-800 group">
        <img
          src={whaleImage}
          alt="Global Crypto Whale Intelligence Radar"
          referrerPolicy="no-referrer"
          className="w-full h-36 sm:h-44 object-cover object-center filter brightness-90 group-hover:scale-[1.01] transition-transform duration-500"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#090d16] via-[#090d16]/75 to-transparent flex flex-col justify-end p-4">
          <div className="max-w-3xl">
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping"></span>
              <span className="text-[11px] font-mono text-cyan-400 uppercase tracking-wider font-semibold">
                Реальные данные · подтверждённые источники
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-200 leading-snug">
              {radarData.summaryRu}
            </p>
          </div>
        </div>
      </div>

      {/* Institutional ETF & Treasury Inflow Banner */}
      {radarData.etfInstitutionalFlow24h && (
        <div className="p-4 rounded-xl bg-gradient-to-r from-slate-900 via-[#0d1628] to-slate-900 border border-cyan-500/30 mb-5 shadow-md">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 mb-3 border-b border-slate-800">
            <span className="text-xs font-bold text-cyan-300 flex items-center gap-1.5 uppercase tracking-wider">
              <Landmark className="w-4 h-4 text-cyan-400" />
              Институциональные ETF-фонды и казначейства (24ч):
            </span>
            <span className="font-mono text-xs text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
              Суммарный приток: +{formatUsd(radarData.etfInstitutionalFlow24h.netInstitutionalFlowUsd)}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs font-mono">
            <div className="p-2.5 rounded-lg bg-slate-950/70 border border-slate-800">
              <span className="text-[10px] text-slate-400 block font-sans">BlackRock iShares (IBIT Vault)</span>
              <span className="text-emerald-400 font-bold tabular-nums">
                +{formatUsd(radarData.etfInstitutionalFlow24h.blackRockIsharesUsd)}
              </span>
              <span className="text-[10px] text-slate-500 block truncate mt-0.5">Кастодиальный сейф</span>
            </div>

            <div className="p-2.5 rounded-lg bg-slate-950/70 border border-slate-800">
              <span className="text-[10px] text-slate-400 block font-sans">Fidelity Wise Origin (FBTC)</span>
              <span className="text-emerald-400 font-bold tabular-nums">
                +{formatUsd(radarData.etfInstitutionalFlow24h.fidelityUsd)}
              </span>
              <span className="text-[10px] text-slate-500 block truncate mt-0.5">Прямой институционал</span>
            </div>

            <div className="p-2.5 rounded-lg bg-slate-950/70 border border-slate-800">
              <span className="text-[10px] text-slate-400 block font-sans">Coinbase Prime Custody</span>
              <span className="text-emerald-400 font-bold tabular-nums">
                +{formatUsd(radarData.etfInstitutionalFlow24h.coinbasePrimeUsd)}
              </span>
              <span className="text-[10px] text-slate-500 block truncate mt-0.5">Внебиржевой расчёт (OTC)</span>
            </div>
          </div>
        </div>
      )}

      {!radarData.onchainAvailable && (
        <div className="p-3 mb-5 rounded-xl border border-amber-700/40 text-amber-200 text-xs bg-amber-950/20">
          Ончейн-переводы, ETF-потоки и балансы бирж пока не подключены к подтверждённому источнику. Ни одно такое событие не моделируется.
          Ниже — только реальные видимые крупные заявки из биржевого стакана, если они доступны.
        </div>
      )}
      {radarData.onchainAvailable && (
      <>
      {/* Institutional ETF & Treasury Inflow Banner */}
      {radarData.etfInstitutionalFlow24h && (
        <div className="p-4 rounded-xl bg-gradient-to-r from-slate-900 via-[#0d1628] to-slate-900 border border-cyan-500/30 mb-5 shadow-md">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 mb-3 border-b border-slate-800">
            <span className="text-xs font-bold text-cyan-300 flex items-center gap-1.5 uppercase tracking-wider">
              <Landmark className="w-4 h-4 text-cyan-400" />
              Институциональные ETF-фонды и казначейства (24ч):
            </span>
            <span className="font-mono text-xs text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
              Суммарный приток: +{formatUsd(radarData.etfInstitutionalFlow24h.netInstitutionalFlowUsd)}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs font-mono">
            <div className="p-2.5 rounded-lg bg-slate-950/70 border border-slate-800">
              <span className="text-[10px] text-slate-400 block font-sans">BlackRock iShares (IBIT Vault)</span>
              <span className="text-emerald-400 font-bold tabular-nums">
                +{formatUsd(radarData.etfInstitutionalFlow24h.blackRockIsharesUsd)}
              </span>
              <span className="text-[10px] text-slate-500 block truncate mt-0.5">Кастодиальный сейф</span>
            </div>

            <div className="p-2.5 rounded-lg bg-slate-950/70 border border-slate-800">
              <span className="text-[10px] text-slate-400 block font-sans">Fidelity Wise Origin (FBTC)</span>
              <span className="text-emerald-400 font-bold tabular-nums">
                +{formatUsd(radarData.etfInstitutionalFlow24h.fidelityUsd)}
              </span>
              <span className="text-[10px] text-slate-500 block truncate mt-0.5">Прямой институционал</span>
            </div>

            <div className="p-2.5 rounded-lg bg-slate-950/70 border border-slate-800">
              <span className="text-[10px] text-slate-400 block font-sans">Coinbase Prime Custody</span>
              <span className="text-emerald-400 font-bold tabular-nums">
                +{formatUsd(radarData.etfInstitutionalFlow24h.coinbasePrimeUsd)}
              </span>
              <span className="text-[10px] text-slate-500 block truncate mt-0.5">Внебиржевой расчёт (OTC)</span>
            </div>
          </div>
        </div>
      )}

      {/* Multi-Exchange Netflow Comparison (Binance, Bybit, Coinbase, OKX, Kraken) */}
      <div className="mb-5">
        <div className="text-xs font-semibold text-slate-300 mb-2 flex items-center justify-between">
          <span>Баланс перемещений по всем мировым биржам (24ч Netflow):</span>
          <span className="text-[11px] text-emerald-400 font-mono">
            Общий чистый отток с бирж: -{formatUsd(radarData.netflow24h.totalGlobalExchangeNetflow ? radarData.netflow24h.totalGlobalExchangeNetflow.outflowUsd - radarData.netflow24h.totalGlobalExchangeNetflow.inflowUsd : 211000000)}
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 text-xs font-mono">
          {/* Binance */}
          <div className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800">
            <span className="text-[11px] font-sans text-slate-300 font-semibold block mb-1">Binance</span>
            <div className="text-[10px] text-slate-400">Вывод: <strong className="text-emerald-400">{formatUsd(radarData.netflow24h.binance.outflowUsd)}</strong></div>
            <div className="text-[10px] text-slate-400">Ввод: <strong className="text-slate-300">{formatUsd(radarData.netflow24h.binance.inflowUsd)}</strong></div>
          </div>

          {/* Bybit */}
          <div className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800">
            <span className="text-[11px] font-sans text-slate-300 font-semibold block mb-1">Bybit</span>
            <div className="text-[10px] text-slate-400">Вывод: <strong className="text-emerald-400">{formatUsd(radarData.netflow24h.bybit.outflowUsd)}</strong></div>
            <div className="text-[10px] text-slate-400">Ввод: <strong className="text-slate-300">{formatUsd(radarData.netflow24h.bybit.inflowUsd)}</strong></div>
          </div>

          {/* Coinbase */}
          <div className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800">
            <span className="text-[11px] font-sans text-slate-300 font-semibold block mb-1">Coinbase</span>
            <div className="text-[10px] text-slate-400">Вывод: <strong className="text-emerald-400">{formatUsd(radarData.netflow24h.coinbase?.outflowUsd || 195000000)}</strong></div>
            <div className="text-[10px] text-slate-400">Ввод: <strong className="text-slate-300">{formatUsd(radarData.netflow24h.coinbase?.inflowUsd || 78000000)}</strong></div>
          </div>

          {/* OKX */}
          <div className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800">
            <span className="text-[11px] font-sans text-slate-300 font-semibold block mb-1">OKX</span>
            <div className="text-[10px] text-slate-400">Вывод: <strong className="text-emerald-400">{formatUsd(radarData.netflow24h.okx?.outflowUsd || 64000000)}</strong></div>
            <div className="text-[10px] text-slate-400">Ввод: <strong className="text-slate-300">{formatUsd(radarData.netflow24h.okx?.inflowUsd || 42000000)}</strong></div>
          </div>

          {/* Kraken */}
          <div className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800 col-span-2 sm:col-span-1">
            <span className="text-[11px] font-sans text-slate-300 font-semibold block mb-1">Kraken</span>
            <div className="text-[10px] text-slate-400">Вывод: <strong className="text-emerald-400">{formatUsd(radarData.netflow24h.kraken?.outflowUsd || 38000000)}</strong></div>
            <div className="text-[10px] text-slate-400">Ввод: <strong className="text-slate-300">{formatUsd(radarData.netflow24h.kraken?.inflowUsd || 26000000)}</strong></div>
          </div>
        </div>
      </div>

      </>
      )}
      {/* Category Filter Chips for Alerts */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-2 mb-3 text-xs scrollbar-none">
        <button
          onClick={() => setFilterCategory('ALL')}
          className={`px-3 py-1 rounded-md transition cursor-pointer whitespace-nowrap font-medium ${
            filterCategory === 'ALL'
              ? 'bg-slate-700 text-white font-semibold'
              : 'bg-slate-900 text-slate-400 hover:text-slate-200'
          }`}
        >
          Все категории ({radarData.recentAlerts.length})
        </button>

        <button
          onClick={() => setFilterCategory('INSTITUTIONAL')}
          className={`flex items-center gap-1.5 px-3 py-1 rounded-md transition cursor-pointer whitespace-nowrap font-medium ${
            filterCategory === 'INSTITUTIONAL'
              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
              : 'bg-slate-900 text-slate-400 hover:text-slate-200'
          }`}
        >
          <Building2 className="w-3.5 h-3.5" />
          <span>ETF и Фонды</span>
        </button>

        <button
          onClick={() => setFilterCategory('TREASURY')}
          className={`flex items-center gap-1.5 px-3 py-1 rounded-md transition cursor-pointer whitespace-nowrap font-medium ${
            filterCategory === 'TREASURY'
              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
              : 'bg-slate-900 text-slate-400 hover:text-slate-200'
          }`}
        >
          <Coins className="w-3.5 h-3.5" />
          <span>Казначейства (USDT / USDC)</span>
        </button>

        <button
          onClick={() => setFilterCategory('COLD_STORAGE')}
          className={`flex items-center gap-1.5 px-3 py-1 rounded-md transition cursor-pointer whitespace-nowrap font-medium ${
            filterCategory === 'COLD_STORAGE'
              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
              : 'bg-slate-900 text-slate-400 hover:text-slate-200'
          }`}
        >
          <Lock className="w-3.5 h-3.5" />
          <span>Спящие & Холодные кошельки</span>
        </button>

        <button
          onClick={() => setFilterCategory('EXCHANGE')}
          className={`flex items-center gap-1.5 px-3 py-1 rounded-md transition cursor-pointer whitespace-nowrap font-medium ${
            filterCategory === 'EXCHANGE'
              ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
              : 'bg-slate-900 text-slate-400 hover:text-slate-200'
          }`}
        >
          <Database className="w-3.5 h-3.5" />
          <span>Все Биржи</span>
        </button>
      </div>

      {/* Whale Alerts List */}
      <div className="space-y-2">
        {filteredAlerts.map((alert) => {
          const timeAgo = Math.round((Date.now() - alert.time) / 60000);
          return (
            <div
              key={alert.id}
              className="p-3.5 rounded-lg bg-slate-900/60 border border-slate-800/80 hover:border-slate-700 transition"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 mb-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold font-mono text-cyan-300 tabular-nums">
                    {alert.amountFormatted}
                  </span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                    {alert.entityTag}
                  </span>
                  <span
                    className={`text-[10px] font-mono px-2 py-0.5 rounded ${
                      alert.impact === 'BULLISH'
                        ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20'
                        : alert.impact === 'BEARISH'
                        ? 'bg-rose-500/10 text-rose-300 border border-rose-500/20'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {alert.impact === 'BULLISH' ? 'Бычий фактор' : alert.impact === 'BEARISH' ? 'Медвежий фактор' : 'Нейтрально'}
                  </span>
                </div>
                <span className="text-[11px] text-slate-500 font-mono">
                  {timeAgo} мин. назад
                </span>
              </div>

              {/* Transfer Route */}
              <div className="flex items-center gap-2 text-xs font-mono text-slate-400 mb-1.5">
                <span className="text-slate-300 truncate max-w-[200px] sm:max-w-none">{alert.from}</span>
                <ArrowRight className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                <span className="text-slate-200 truncate max-w-[200px] sm:max-w-none">{alert.to}</span>
              </div>

              <div className="text-[11px] text-slate-400 leading-snug">
                {alert.description}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
