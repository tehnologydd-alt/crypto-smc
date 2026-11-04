import React from 'react';
import { Star, Sparkles, SlidersHorizontal } from 'lucide-react';
import { AssetInfo } from '../types/crypto';

interface AssetSelectorProps {
  assets: AssetInfo[];
  selectedSymbol: string;
  onSelectAsset: (symbol: string) => void;
  favorites: string[];
  onToggleFavorite: (symbol: string) => void;
  showOnlyFavorites: boolean;
  setShowOnlyFavorites: (val: boolean) => void;
  isLoading: boolean;
}

export const AssetSelector: React.FC<AssetSelectorProps> = ({
  assets,
  selectedSymbol,
  onSelectAsset,
  favorites,
  onToggleFavorite,
  showOnlyFavorites,
  setShowOnlyFavorites,
  isLoading,
}) => {
  const displayedAssets = showOnlyFavorites
    ? assets.filter((a) => favorites.includes(a.symbol))
    : assets;

  return (
    <div className="bg-[#0b101c] border border-slate-800/80 rounded-xl p-3 sm:p-4 mb-6 shadow-lg">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3 pb-2.5 border-b border-slate-800/60">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="w-4 h-4 text-emerald-400" />
          <h2 className="text-sm font-semibold text-slate-200">Выбор актива для среза данных</h2>
          <span className="text-xs text-slate-400 hidden sm:inline">
            (Цены запрашиваются с Binance & Bybit в момент клика)
          </span>
        </div>

        {/* Favorite filter toggle */}
        <div className="flex items-center gap-1.5 self-start sm:self-auto bg-slate-900/90 p-1 rounded-lg border border-slate-800">
          <button
            onClick={() => setShowOnlyFavorites(false)}
            className={`px-3 py-1 rounded text-xs font-medium transition cursor-pointer whitespace-nowrap ${
              !showOnlyFavorites
                ? 'bg-slate-800 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Все ({assets.length})
          </button>
          <button
            onClick={() => setShowOnlyFavorites(true)}
            className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium transition cursor-pointer whitespace-nowrap ${
              showOnlyFavorites
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
            <span>Избранные ({favorites.length})</span>
          </button>
        </div>
      </div>

      {displayedAssets.length === 0 ? (
        <div className="py-6 text-center text-xs text-slate-400">
          <p>В избранном пока нет активов.</p>
          <p className="mt-1 text-slate-400">Нажмите на звёздочку рядом с любым активом, чтобы добавить его сюда.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-10 gap-2">
          {displayedAssets.map((asset) => {
            const isSelected = asset.symbol === selectedSymbol;
            const isFav = favorites.includes(asset.symbol);

            return (
              <div
                key={asset.symbol}
                className={`relative group rounded-lg transition-all border ${
                  isSelected
                    ? 'bg-gradient-to-b from-slate-800 to-slate-900 border-emerald-500/60 shadow-md shadow-emerald-500/5 ring-1 ring-emerald-500/30'
                    : 'bg-slate-900/70 hover:bg-slate-800/80 border-slate-800/90 hover:border-slate-700'
                }`}
              >
                <button
                  onClick={() => onSelectAsset(asset.symbol)}
                  disabled={isLoading}
                  className="w-full text-left p-2.5 cursor-pointer disabled:opacity-60"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold font-mono tracking-tight text-white group-hover:text-emerald-300 transition-colors">
                      {asset.base}
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-400 truncate mt-0.5">
                    {asset.name}
                  </div>
                </button>

                {/* Favorite Star Button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleFavorite(asset.symbol);
                  }}
                  className="absolute top-1.5 right-1.5 p-1 rounded hover:bg-slate-800 transition cursor-pointer text-slate-500 hover:text-amber-400"
                  title={isFav ? 'Удалить из избранного' : 'Добавить в избранное'}
                >
                  <Star
                    className={`w-3.5 h-3.5 ${
                      isFav ? 'fill-amber-400 text-amber-400' : 'text-slate-600 hover:text-slate-400'
                    }`}
                  />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
