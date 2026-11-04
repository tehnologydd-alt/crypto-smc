import React, { useState } from 'react';
import { AISignalResponse } from '../types/crypto';
import { playAlertSound } from '../utils/audio';
import {
  Sparkles,
  Zap,
  Target,
  ShieldAlert,
  TrendingUp,
  Percent,
  Sliders,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  DollarSign,
  Volume2,
  VolumeX,
  Copy,
  Check,
  Send,
  Lock,
  Calculator,
} from 'lucide-react';

interface AISignalPanelProps {
  signalData: AISignalResponse | null;
  isGenerating: boolean;
  onGenerate: () => void;
  symbol: string;
}

export const AISignalPanel: React.FC<AISignalPanelProps> = ({
  signalData,
  isGenerating,
  onGenerate,
  symbol,
}) => {
  const [positionAmountUsd, setPositionAmountUsd] = useState<number>(500);
  const [leverage, setLeverage] = useState<number>(1);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [copiedWebhook, setCopiedWebhook] = useState<boolean>(false);
  const [showOrderCalculator, setShowOrderCalculator] = useState<boolean>(false);

  const baseCoin = symbol.replace('USDT', '');

  const formatPrice = (val: number) => {
    if (!val) return '0.00';
    if (val >= 1000) return val.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (val >= 1) return val.toLocaleString('ru-RU', { minimumFractionDigits: 3, maximumFractionDigits: 4 });
    return val.toLocaleString('ru-RU', { minimumFractionDigits: 4, maximumFractionDigits: 6 });
  };

  const handleTriggerGenerate = () => {
    if (soundEnabled) {
      playAlertSound('signal');
    }
    onGenerate();
  };

  // Calculations for Position Sizing
  const totalPositionSizeUsd = positionAmountUsd * leverage;
  const entryPrice = signalData?.signal.entryPrice || 1;
  const coinsAmount = entryPrice > 0 ? totalPositionSizeUsd / entryPrice : 0;

  // Real Dollar Risk & Profit
  const stopLossRiskUsd = signalData ? (totalPositionSizeUsd * (signalData.signal.stopLossPercent / 100)) : 0;
  const profitTp1Usd = signalData ? (totalPositionSizeUsd * (signalData.signal.takeProfit1Percent / 100)) : 0;
  const profitTp2Usd = signalData ? (totalPositionSizeUsd * (signalData.signal.takeProfit2Percent / 100)) : 0;
  const profitTp3Usd = signalData ? (totalPositionSizeUsd * (signalData.signal.takeProfit3Percent / 100)) : 0;

  // Webhook JSON Payload for external execution
  const webhookPayload = signalData ? JSON.stringify({
    broker: "BINANCE_BYBIT",
    symbol: symbol,
    side: signalData.signal.direction === 'LONG' ? 'BUY' : signalData.signal.direction === 'SHORT' ? 'SELL' : 'WAIT',
    type: "LIMIT",
    marginUsd: positionAmountUsd,
    leverage: leverage,
    positionSizeUsd: totalPositionSizeUsd,
    coinsAmount: parseFloat(coinsAmount.toFixed(4)),
    entryPrice: signalData.signal.entryPrice,
    stopLoss: signalData.signal.stopLoss,
    takeProfit1: signalData.signal.takeProfit1,
    takeProfit2: signalData.signal.takeProfit2,
    takeProfit3: signalData.signal.takeProfit3,
    riskReward: signalData.signal.riskRewardRatio,
    timestamp: Date.now()
  }, null, 2) : '';

  const handleCopyWebhook = async () => {
    try {
      await navigator.clipboard.writeText(webhookPayload);
      setCopiedWebhook(true);
      setTimeout(() => setCopiedWebhook(false), 2500);
    } catch {
      setCopiedWebhook(true);
      setTimeout(() => setCopiedWebhook(false), 2500);
    }
  };

  return (
    <div className="bg-[#0b101c] border border-slate-800/90 rounded-xl p-4 sm:p-5 mb-6 shadow-xl relative overflow-hidden">
      {/* Header with trigger button & sound toggle */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 mb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-amber-400" />
            <h2 className="text-base font-bold text-slate-100">
              Мультиагентный ИИ-Анализ & Торговые Рекомендации
            </h2>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Комплексный синтез данных Смарт-Мани, ордер-блоков, кошельков китов и ML-сентимента
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Sound Alert Toggle */}
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className={`p-2 rounded-lg border transition cursor-pointer ${
              soundEnabled
                ? 'bg-slate-800 text-emerald-400 border-slate-700'
                : 'bg-slate-900 text-slate-500 border-slate-800'
            }`}
            title={soundEnabled ? 'Звуковые алерты включены' : 'Звуковые алерты выключены'}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>

          <button
            onClick={handleTriggerGenerate}
            disabled={isGenerating}
            className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-semibold text-xs transition-all shadow-md shadow-emerald-600/20 active:scale-98 cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            <Sparkles className={`w-4 h-4 ${isGenerating ? 'animate-spin' : ''}`} />
            <span>{isGenerating ? 'Агенты вычисляют сигнал...' : `Запустить ИИ-анализ по ${baseCoin}`}</span>
          </button>
        </div>
      </div>

      {!signalData ? (
        <div className="py-10 px-4 text-center border border-dashed border-slate-800 rounded-xl bg-slate-900/30">
          <Sparkles className="w-8 h-8 text-emerald-400/80 mx-auto mb-2 animate-bounce" />
          <h3 className="text-sm font-semibold text-slate-200">
            Готов к запуску институциональных ИИ-агентов
          </h3>
          <p className="text-xs text-slate-400 max-w-md mx-auto mt-1 mb-4">
            Нажмите кнопку выше, чтобы запустить одновременную оценку всеми агентами и получить прогноз (вход, уровни и неопределённость) с точкой входа, стоп-лоссом и тремя уровнями тейк-профита.
          </p>
          <button
            onClick={handleTriggerGenerate}
            disabled={isGenerating}
            className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition cursor-pointer"
          >
            Сгенерировать сигнал прямо сейчас
          </button>
        </div>
      ) : (
        <div className="space-y-5 animate-fade-in">
          <p className="text-[11px] text-amber-300/90 mb-2">Прогноз основан на реальных доступных рыночных данных. Баллы агентов — эвристика, не проверенная вероятность выигрыша; при отсутствии ончейн и соцсетей агент указывает ограничения.</p>
          {/* Main High-Probability Signal Card */}
          <div className="p-4 sm:p-5 rounded-xl bg-gradient-to-br from-slate-900 to-[#0e1628] border border-slate-700/80 shadow-lg relative">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 mb-3 border-b border-slate-800/80">
              <div className="flex items-center gap-3">
                <span
                  className={`px-3 py-1 rounded-md text-xs font-mono font-extrabold tracking-wider ${
                    signalData.signal.direction === 'LONG'
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                      : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                  }`}
                >
                  СИГНАЛ: {signalData.signal.direction}
                </span>
                <span className="text-xs text-slate-300 font-mono">
                  Сила сигнала (не вероятность):{' '}
                  <strong className="text-emerald-400 text-sm font-bold tabular-nums">
                    {signalData.signal.winProbability}%
                  </strong>
                </span>
              </div>

              <div className="flex items-center gap-2 text-xs font-mono">
                <span className="text-slate-400">Соотношение R:R:</span>
                <span className="text-amber-300 font-bold bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20 tabular-nums">
                  {signalData.signal.riskRewardRatio}
                </span>
                <span className="text-slate-400 pl-2">Уровень риска:</span>
                <span className="text-slate-200 font-semibold">{signalData.signal.riskLevel}</span>
              </div>
            </div>

            {/* Execution Targets Grid: Entry, SL, TP1, TP2, TP3 */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 my-4 text-xs font-mono">
              {/* Entry Price */}
              <div className="p-2.5 rounded-lg bg-slate-950/70 border border-slate-800">
                <span className="text-[10px] text-slate-400 block font-sans">Точка входа (Entry)</span>
                <span className="text-slate-100 font-bold tabular-nums">
                  ${formatPrice(signalData.signal.entryPrice)}
                </span>
                <span className="text-[10px] text-slate-500 block truncate mt-0.5">
                  {signalData.signal.entryZone}
                </span>
              </div>

              {/* Stop Loss */}
              <div className="p-2.5 rounded-lg bg-rose-950/20 border border-rose-500/30">
                <span className="text-[10px] text-rose-300 block font-sans">Стоп-лосс (SL)</span>
                <span className="text-rose-400 font-bold tabular-nums">
                  ${formatPrice(signalData.signal.stopLoss)}
                </span>
                <span className="text-[10px] text-rose-400/80 block mt-0.5">
                  -{signalData.signal.stopLossPercent}% риск
                </span>
              </div>

              {/* Take Profit 1 */}
              <div className="p-2.5 rounded-lg bg-emerald-950/20 border border-emerald-500/30">
                <span className="text-[10px] text-emerald-300 block font-sans">Тейк 1 (Консервативный)</span>
                <span className="text-emerald-400 font-bold tabular-nums">
                  ${formatPrice(signalData.signal.takeProfit1)}
                </span>
                <span className="text-[10px] text-emerald-400/80 block mt-0.5">
                  +{signalData.signal.takeProfit1Percent}% профит
                </span>
              </div>

              {/* Take Profit 2 */}
              <div className="p-2.5 rounded-lg bg-emerald-950/20 border border-emerald-500/30">
                <span className="text-[10px] text-emerald-300 block font-sans">Тейк 2 (Основная цель)</span>
                <span className="text-emerald-400 font-bold tabular-nums">
                  ${formatPrice(signalData.signal.takeProfit2)}
                </span>
                <span className="text-[10px] text-emerald-400/80 block mt-0.5">
                  +{signalData.signal.takeProfit2Percent}% профит
                </span>
              </div>

              {/* Take Profit 3 */}
              <div className="p-2.5 rounded-lg bg-emerald-950/20 border border-emerald-500/30 col-span-2 sm:col-span-1">
                <span className="text-[10px] text-emerald-300 block font-sans">Тейк 3 (Максимум)</span>
                <span className="text-emerald-400 font-bold tabular-nums">
                  ${formatPrice(signalData.signal.takeProfit3)}
                </span>
                <span className="text-[10px] text-emerald-400/80 block mt-0.5">
                  +{signalData.signal.takeProfit3Percent}% профит
                </span>
              </div>
            </div>

            {/* Validation Rationale */}
            <div className="text-xs text-slate-300 bg-slate-950/50 p-3 rounded-lg border border-slate-800/80 space-y-1 mb-4">
              <div>
                <strong className="text-slate-100">Целевой ордер-блок:</strong> {signalData.signal.orderBlockTarget}
              </div>
              <div>
                <strong className="text-slate-100">Обоснование сделки:</strong> {signalData.signal.validationRationale}
              </div>
            </div>

            {/* Position Sizer and Order Dispatcher with Custom $ Amount */}
            <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 mb-3 border-b border-slate-800/80">
                <div className="flex items-center gap-2">
                  <Calculator className="w-4 h-4 text-emerald-400" />
                  <span className="text-xs font-bold text-white uppercase tracking-wider">
                    Калькулятор суммы сделки и расчёт прибыли в $
                  </span>
                </div>
                <button
                  onClick={() => setShowOrderCalculator(!showOrderCalculator)}
                  className="text-xs text-cyan-400 hover:text-cyan-300 cursor-pointer underline decoration-cyan-500/40"
                >
                  {showOrderCalculator ? 'Скрыть параметры ордера' : 'Настроить сумму входа ($)'}
                </button>
              </div>

              {/* Controls */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs mb-3">
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">Сумма входа (Маржа $):</label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min={10}
                      step={50}
                      value={positionAmountUsd}
                      onChange={(e) => setPositionAmountUsd(Math.max(10, parseFloat(e.target.value) || 0))}
                      className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-white font-mono text-xs focus:outline-none focus:border-emerald-500"
                    />
                    <span className="text-slate-400 font-mono">USD</span>
                  </div>
                </div>

                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">Кредитное плечо:</label>
                  <div className="flex items-center gap-1">
                    {[1, 2, 5, 10].map((lev) => (
                      <button
                        key={lev}
                        onClick={() => setLeverage(lev)}
                        className={`flex-1 py-1 rounded text-xs font-mono transition cursor-pointer ${
                          leverage === lev
                            ? 'bg-emerald-600 text-white font-bold'
                            : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
                        }`}
                      >
                        {lev === 1 ? '1x Спот' : `${lev}x`}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">Объём позиции в монетах:</label>
                  <div className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 font-mono text-emerald-400 font-bold truncate">
                    {coinsAmount.toFixed(4)} {baseCoin} (${totalPositionSizeUsd.toLocaleString()})
                  </div>
                </div>
              </div>

              {/* Real Dollar Outcomes Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono p-2.5 rounded-lg bg-slate-900/60 border border-slate-800/80 mb-3">
                <div>
                  <span className="text-[10px] text-rose-400 font-sans block">Риск при Stop Loss:</span>
                  <strong className="text-rose-400 tabular-nums">-${stopLossRiskUsd.toFixed(2)}</strong>
                </div>
                <div>
                  <span className="text-[10px] text-emerald-400 font-sans block">Профит на TP1:</span>
                  <strong className="text-emerald-400 tabular-nums">+${profitTp1Usd.toFixed(2)}</strong>
                </div>
                <div>
                  <span className="text-[10px] text-emerald-400 font-sans block">Профит на TP2:</span>
                  <strong className="text-emerald-400 tabular-nums">+${profitTp2Usd.toFixed(2)}</strong>
                </div>
                <div>
                  <span className="text-[10px] text-emerald-400 font-sans block">Профит на TP3:</span>
                  <strong className="text-emerald-400 tabular-nums">+${profitTp3Usd.toFixed(2)}</strong>
                </div>
              </div>

              {/* Security Alert & Safe Webhook Dispatch */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-2 border-t border-slate-800/60">
                <div className="flex items-center gap-2 text-[11px] text-slate-400">
                  <Lock className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span>
                    Безопасный экспорт: API-ключи бирж не запрашиваются во избежание риска утечки данных.
                  </span>
                </div>

                <button
                  onClick={handleCopyWebhook}
                  className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition cursor-pointer whitespace-nowrap"
                  title="Скопировать параметры ордера для Binance / Bybit бота"
                >
                  {copiedWebhook ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedWebhook ? 'Ордер скопирован!' : 'Копировать JSON-ордер для биржи'}</span>
                </button>
              </div>

              {showOrderCalculator && (
                <div className="mt-3 p-3 rounded-lg bg-slate-950 font-mono text-[11px] text-slate-300 border border-slate-800 overflow-x-auto">
                  <pre>{webhookPayload}</pre>
                </div>
              )}
            </div>
          </div>

          {/* 4 Agents Consensus Breakdown */}
          <div>
            <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2.5">
              Консилиум ИИ-Агентов:
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              {/* SMC Agent */}
              <div className="p-3.5 rounded-lg bg-slate-900/60 border border-slate-800">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-bold text-slate-100 flex items-center gap-1.5">
                    <Target className="w-3.5 h-3.5 text-emerald-400" />
                    {signalData.agents.smcAgent.name}
                  </span>
                  <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                    Score: {signalData.agents.smcAgent.score}/100
                  </span>
                </div>
                <div className="text-slate-300 font-medium mb-1.5">
                  {signalData.agents.smcAgent.verdict}
                </div>
                <ul className="space-y-1 text-slate-400 text-[11px] list-disc list-inside">
                  {signalData.agents.smcAgent.keyFindings.map((f, i) => (
                    <li key={i}>{f}</li>
                  ))}
                </ul>
              </div>

              {/* Whale Agent */}
              <div className="p-3.5 rounded-lg bg-slate-900/60 border border-slate-800">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-bold text-slate-100 flex items-center gap-1.5">
                    <Zap className="w-3.5 h-3.5 text-cyan-400" />
                    {signalData.agents.whaleAgent.name}
                  </span>
                  <span className="text-[10px] font-mono text-cyan-400 bg-cyan-500/10 px-1.5 py-0.5 rounded">
                    Score: {signalData.agents.whaleAgent.score}/100
                  </span>
                </div>
                <div className="text-slate-300 font-medium mb-1.5">
                  {signalData.agents.whaleAgent.verdict}
                </div>
                <ul className="space-y-1 text-slate-400 text-[11px] list-disc list-inside">
                  {signalData.agents.whaleAgent.keyFindings.map((f, i) => (
                    <li key={i}>{f}</li>
                  ))}
                </ul>
              </div>

              {/* Sentiment Agent */}
              <div className="p-3.5 rounded-lg bg-slate-900/60 border border-slate-800">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-bold text-slate-100 flex items-center gap-1.5">
                    <Percent className="w-3.5 h-3.5 text-indigo-400" />
                    {signalData.agents.sentimentAgent.name}
                  </span>
                  <span className="text-[10px] font-mono text-indigo-400 bg-indigo-500/10 px-1.5 py-0.5 rounded">
                    Score: {signalData.agents.sentimentAgent.score}/100
                  </span>
                </div>
                <div className="text-slate-300 font-medium mb-1.5">
                  {signalData.agents.sentimentAgent.verdict}
                </div>
                <ul className="space-y-1 text-slate-400 text-[11px] list-disc list-inside">
                  {signalData.agents.sentimentAgent.keyFindings.map((f, i) => (
                    <li key={i}>{f}</li>
                  ))}
                </ul>
              </div>

              {/* Chief Arbiter */}
              <div className="p-3.5 rounded-lg bg-slate-900/60 border border-amber-500/30">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-bold text-amber-300 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-amber-400" />
                    {signalData.agents.chiefArbiter.name}
                  </span>
                  <span className="text-[10px] font-mono text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded">
                    Консенсус: {signalData.agents.chiefArbiter.consensusConfidence}%
                  </span>
                </div>
                <div className="text-slate-200 font-medium mb-1.5">
                  {signalData.agents.chiefArbiter.verdict}
                </div>
                <div className="text-slate-400 text-[11px] leading-relaxed">
                  {signalData.agents.chiefArbiter.executionPlan}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
