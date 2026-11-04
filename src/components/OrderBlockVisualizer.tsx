import React from 'react';
import { SMCData } from '../types/crypto';
import { Target, Shield, AlertTriangle, TrendingUp, Layers, CheckCircle2 } from 'lucide-react';

interface OrderBlockVisualizerProps {
  smc: SMCData;
  currentPrice: number;
  symbol: string;
}

export const OrderBlockVisualizer: React.FC<OrderBlockVisualizerProps> = ({
  smc,
  currentPrice,
  symbol,
}) => {
  const formatPrice = (val: number) => {
    if (!val) return '0.00';
    if (val >= 1000) return val.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (val >= 1) return val.toLocaleString('ru-RU', { minimumFractionDigits: 3, maximumFractionDigits: 4 });
    return val.toLocaleString('ru-RU', { minimumFractionDigits: 4, maximumFractionDigits: 6 });
  };

  const isDiscount = currentPrice <= smc.discountZone.max;
  const isPremium = currentPrice >= smc.premiumZone.min;

  return (
    <div className="bg-[#0b101c] border border-slate-800/90 rounded-xl p-4 sm:p-5 mb-6 shadow-lg">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 mb-4 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Layers className="w-5 h-5 text-emerald-400" />
          <h2 className="text-base font-bold text-slate-100">
            Анализ по системе Ордер-Блоков и Smart Money (SMC)
          </h2>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-slate-400">Структура рынка:</span>
          <span className="font-mono font-semibold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
            {smc.marketStructure.replace('_', ' ')}
          </span>
        </div>
      </div>

      {/* Institutional Equilibrium Strip (Discount vs Premium) */}
      <div className="p-3.5 rounded-lg bg-slate-900/80 border border-slate-800 mb-5">
        <div className="flex items-center justify-between text-xs mb-2">
          <span className="text-slate-300 font-medium">Институциональные зоны набора (Discount vs Premium):</span>
          <span className="font-mono text-slate-400 text-[11px]">
            Текущая цена: <strong className="text-white">${formatPrice(currentPrice)}</strong>
          </span>
        </div>

        {/* Visual Range Bar */}
        <div className="relative h-6 bg-slate-950 rounded-md overflow-hidden flex items-stretch border border-slate-800">
          {/* Discount Zone (Green) */}
          <div className="w-1/2 bg-gradient-to-r from-emerald-950/60 to-emerald-900/30 border-r border-slate-700 flex items-center justify-start px-3 text-[10px] font-mono text-emerald-400 font-semibold">
            Зона Дисконта (Набор Long) &lt; ${formatPrice(smc.discountZone.max)}
          </div>
          {/* Premium Zone (Red) */}
          <div className="w-1/2 bg-gradient-to-r from-rose-900/30 to-rose-950/60 flex items-center justify-end px-3 text-[10px] font-mono text-rose-400 font-semibold">
            Зона Премиума (Продажи Short) &gt; ${formatPrice(smc.premiumZone.min)}
          </div>

          {/* Current Price Marker Pin */}
          <div
            className="absolute top-0 bottom-0 w-1 bg-cyan-400 shadow-md shadow-cyan-500"
            style={{
              left: `${Math.max(8, Math.min(92, isDiscount ? 30 : isPremium ? 75 : 50))}%`,
            }}
            title={`Текущая цена: $${formatPrice(currentPrice)}`}
          />
        </div>
        <div className="flex justify-between text-[10px] text-slate-400 mt-1 font-mono">
          <span>Оптимальный диапазон входа Смарт-мани: ${formatPrice(smc.discountZone.min)} - ${formatPrice(smc.discountZone.max)}</span>
          <span className={isDiscount ? 'text-emerald-400 font-semibold' : 'text-slate-400'}>
            {isDiscount ? 'Актив в зоне выгодных цен для покупок (Discount Zone)' : 'Актив приближается к пулу ликвидности продавцов'}
          </span>
        </div>
      </div>

      {/* Order Blocks Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
        {/* Bullish Order Blocks */}
        <div className="space-y-3">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
            <TrendingUp className="w-4 h-4" />
            <span>Бычьи Ордер-Блоки (OB+ Покупателей)</span>
          </div>
          <div className="space-y-2">
            {smc.orderBlocks
              .filter((ob) => ob.type === 'bullish')
              .map((ob, idx) => (
                <div
                  key={idx}
                  className="p-3 rounded-lg bg-emerald-950/20 border border-emerald-500/30 hover:border-emerald-500/50 transition"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold font-mono text-emerald-300">{ob.label}</span>
                    <span className="text-[10px] font-mono text-slate-400 bg-slate-900/80 px-2 py-0.5 rounded border border-slate-800">
                      Сила: {ob.strength}%
                    </span>
                  </div>
                  <div className="text-xs font-mono text-slate-200">
                    Зона блока: <strong className="text-emerald-400">${formatPrice(ob.levelLow)}</strong> — <strong className="text-emerald-400">${formatPrice(ob.levelHigh)}</strong>
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1">
                    {ob.mitigated
                      ? 'Блок был частично протестирован. Возможен прокол нижней тени.'
                      : 'Свежий неснятый блок ликвидности — приоритетная зона реакции Smart Money.'}
                  </div>
                </div>
              ))}
          </div>
        </div>

        {/* Bearish Order Blocks */}
        <div className="space-y-3">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-rose-400">
            <Shield className="w-4 h-4" />
            <span>Медвежьи Ордер-Блоки (OB- Продавцов)</span>
          </div>
          <div className="space-y-2">
            {smc.orderBlocks
              .filter((ob) => ob.type === 'bearish')
              .map((ob, idx) => (
                <div
                  key={idx}
                  className="p-3 rounded-lg bg-rose-950/20 border border-rose-500/30 hover:border-rose-500/50 transition"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold font-mono text-rose-300">{ob.label}</span>
                    <span className="text-[10px] font-mono text-slate-400 bg-slate-900/80 px-2 py-0.5 rounded border border-slate-800">
                      Сила: {ob.strength}%
                    </span>
                  </div>
                  <div className="text-xs font-mono text-slate-200">
                    Зона блока: <strong className="text-rose-400">${formatPrice(ob.levelLow)}</strong> — <strong className="text-rose-400">${formatPrice(ob.levelHigh)}</strong>
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1">
                    {ob.mitigated
                      ? 'Зона сопротивления с ослабленным давлением.'
                      : 'Активная стена продавцов. Целевая зона для фиксации длинных позиций (Take Profit).'}
                  </div>
                </div>
              ))}
          </div>
        </div>
      </div>

      {/* Levels of Support & Resistance + FVG */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 border-t border-slate-800 text-xs">
        <div className="p-3 rounded-lg bg-slate-900/50 border border-slate-800/80">
          <span className="text-slate-400 block mb-1">Уровни Поддержки (Swing Lows):</span>
          <div className="space-y-1 font-mono text-emerald-400 font-semibold">
            {smc.supportLevels.map((lvl, idx) => (
              <div key={idx} className="flex justify-between">
                <span>S{idx + 1}:</span>
                <span className="tabular-nums">${formatPrice(lvl)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="p-3 rounded-lg bg-slate-900/50 border border-slate-800/80">
          <span className="text-slate-400 block mb-1">Уровни Сопротивления (Swing Highs):</span>
          <div className="space-y-1 font-mono text-rose-400 font-semibold">
            {smc.resistanceLevels.map((lvl, idx) => (
              <div key={idx} className="flex justify-between">
                <span>R{idx + 1}:</span>
                <span className="tabular-nums">${formatPrice(lvl)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="p-3 rounded-lg bg-slate-900/50 border border-slate-800/80">
          <span className="text-slate-400 block mb-1">Дисбаланс FVG (Fair Value Gap):</span>
          {smc.fvg?.present ? (
            <div className="font-mono text-xs text-amber-300">
              <div>{smc.fvg.description}</div>
              <div className="text-slate-300 mt-1">
                ${formatPrice(smc.fvg.bottom || 0)} — ${formatPrice(smc.fvg.top || 0)}
              </div>
              <div className="text-[10px] text-slate-400 mt-1 font-sans">
                Магнит для закрытия ценового разрыва перед продолжением тренда.
              </div>
            </div>
          ) : (
            <div className="text-slate-400 text-xs mt-1">
              Локальный ценовой баланс в норме, значимых разрывов ликвидности не обнаружено.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
