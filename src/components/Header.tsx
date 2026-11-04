import React from 'react';
import { PWAInstallButton } from './PWAInstallButton';
import { RefreshCw, Radio } from 'lucide-react';

interface HeaderProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  onRefreshSnapshot: () => void;
  isLoading: boolean;
  selectedAsset: string;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  onTabChange,
  onRefreshSnapshot,
  isLoading,
  selectedAsset,
}) => {
  const navItems = [
    { id: 'overview', label: 'Срез Рынка' },
    { id: 'smc', label: 'Ордер-Блоки SMC' },
    { id: 'whales', label: 'Радар Китов' },
    { id: 'sentiment', label: 'ML-Сентимент' },
    { id: 'signals', label: 'Сигналы ИИ' },
  ];

  return (
    <header className="sticky top-0 z-40 bg-[#080c14]/90 backdrop-blur-md border-b border-slate-800/80 px-4 lg:px-8 py-3">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-6">
        {/* Zone 1: Single text element Brand Zone */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-emerald-600 to-cyan-500 p-0.5 flex items-center justify-center shadow-lg shadow-emerald-500/10">
              <div className="w-full h-full bg-[#080c14] rounded-[7px] flex items-center justify-center">
                <span className="text-emerald-400 font-extrabold text-sm tracking-tighter">AX</span>
              </div>
            </div>
            <a href="/" className="text-lg font-bold tracking-tight text-white whitespace-nowrap">
              ApexiCrypto
            </a>
          </div>
          <span className="hidden sm:inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-mono text-slate-400 bg-slate-800/50 border border-slate-800">
            <Radio className="w-3 h-3 text-emerald-400 animate-pulse" />
            Binance & Bybit Live
          </span>
        </div>

        {/* Zone 2: 4-5 clean single-line text navigation links */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium">
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onTabChange(item.id)}
                className={`transition-colors whitespace-nowrap shrink-0 cursor-pointer text-xs uppercase tracking-wider ${
                  isActive
                    ? 'text-emerald-400 font-semibold border-b-2 border-emerald-400 pb-0.5'
                    : 'text-slate-400 hover:text-slate-100'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: Primary Action & Install */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={onRefreshSnapshot}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-200 border border-slate-700/80 text-xs font-medium transition cursor-pointer disabled:opacity-50"
            title="Получить свежий срез цен с Binance и Bybit"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-cyan-400 ${isLoading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Срез {selectedAsset.replace('USDT', '')}</span>
          </button>

          <PWAInstallButton />
        </div>
      </div>

      {/* Mobile Sub-Navigation Bar */}
      <div className="md:hidden flex items-center gap-2 overflow-x-auto pt-2.5 pb-1 border-t border-slate-800/60 mt-2 text-xs scrollbar-none">
        {navItems.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              className={`px-2.5 py-1 rounded text-xs whitespace-nowrap shrink-0 transition-colors ${
                isActive
                  ? 'bg-emerald-500/20 text-emerald-300 font-medium border border-emerald-500/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </div>
    </header>
  );
};
