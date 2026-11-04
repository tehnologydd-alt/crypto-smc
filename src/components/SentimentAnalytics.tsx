import React from 'react';
import { SentimentData } from '../types/crypto';
import { BrainCircuit, MessageSquare, TrendingUp, AlertCircle, Compass, Flame } from 'lucide-react';

interface SentimentAnalyticsProps {
  sentimentData: SentimentData | null;
  isLoading: boolean;
}

export const SentimentAnalytics: React.FC<SentimentAnalyticsProps> = ({
  sentimentData,
  isLoading,
}) => {
  if (!sentimentData) {
    return (
      <div className="bg-[#0b101c] border border-slate-800 rounded-xl p-8 text-center text-slate-400">
        <BrainCircuit className="w-6 h-6 animate-pulse text-indigo-400 mx-auto mb-2" />
        <p className="text-sm">Анализ настроений соцсетей и запуск ML-моделей...</p>
      </div>
    );
  }

  const { fearAndGreed, mlModelMetrics, asset } = sentimentData;

  const getFngColor = (val: number) => {
    if (val >= 75) return 'text-emerald-400';
    if (val >= 55) return 'text-emerald-300';
    if (val >= 45) return 'text-amber-400';
    if (val >= 25) return 'text-orange-400';
    return 'text-rose-400';
  };

  return (
    <div className="bg-[#0b101c] border border-slate-800/90 rounded-xl p-4 sm:p-5 mb-6 shadow-lg">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 mb-4 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <BrainCircuit className="w-5 h-5 text-indigo-400" />
          <h2 className="text-base font-bold text-slate-100">
            Настроения рынка и социальная аналитика
          </h2>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-slate-400">Модель:</span>
          <span className="font-mono text-slate-300 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
            {mlModelMetrics.name}
          </span>
        </div>
      </div>

      {/* Top 2 Cards: Fear & Greed + ML Sentiment Gauge */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
        {/* Fear & Greed Card */}
        <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
              <Compass className="w-4 h-4 text-emerald-400" />
              Индекс Страха и Жадности (Crypto Fear & Greed)
            </span>
            <span className="text-[10px] text-slate-400 font-mono">{sentimentData.fearAndGreedAvailable ? 'LIVE API' : 'НЕТ ДАННЫХ'}</span>
          </div>

          <div className="flex items-baseline gap-3 my-2">
            <div className={`text-4xl font-extrabold font-mono tabular-nums ${getFngColor(fearAndGreed.value)}`}>
              {sentimentData.fearAndGreedAvailable ? fearAndGreed.value : '—'}
            </div>
            <div className="text-sm">
              <span className="text-slate-400 text-xs block">Классификация:</span>
              <strong className={`font-semibold ${getFngColor(fearAndGreed.value)}`}>
                {!sentimentData.fearAndGreedAvailable ? 'Источник недоступен' : fearAndGreed.classification === 'Greed'
                  ? 'Жадность (Greed)'
                  : fearAndGreed.classification === 'Extreme Greed'
                  ? 'Экстремальная Жадность'
                  : fearAndGreed.classification === 'Fear'
                  ? 'Страх (Fear)'
                  : fearAndGreed.classification === 'Extreme Fear'
                  ? 'Экстремальный Страх'
                  : 'Нейтрально (Neutral)'}
              </strong>
            </div>
          </div>

          {/* Meter Bar */}
          <div className="w-full bg-slate-950 h-2.5 rounded-full overflow-hidden flex border border-slate-800 mt-2">
            <div className="w-1/4 bg-rose-600" title="Экстремальный страх (0-24)" />
            <div className="w-1/4 bg-orange-500" title="Страх (25-49)" />
            <div className="w-1/4 bg-amber-400" title="Нейтрально (50-74)" />
            <div className="w-1/4 bg-emerald-500" title="Жадность (75-100)" />
          </div>
          <div className="flex justify-between text-[10px] font-mono text-slate-500 mt-1">
            <span>0 (Паника)</span>
            <span>50 (Баланс)</span>
            <span>100 (Эйфория)</span>
          </div>
        </div>

        {sentimentData.socialDataAvailable ? (
        <>
        {/* ML Sentiment Distribution */}
        <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
              <MessageSquare className="w-4 h-4 text-cyan-400" />
              Распределение настроений (Twitter, Reddit, Telegram)
            </span>
            <span className="text-[10px] text-emerald-400 font-mono bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
              {mlModelMetrics.sentimentDistribution.positive}% БЫЧИЙ СЕНТИМЕНТ
            </span>
          </div>

          {/* Tri-color Stacked Bar */}
          <div className="h-4 bg-slate-950 rounded-md overflow-hidden flex border border-slate-800 my-2">
            <div
              style={{ width: `${mlModelMetrics.sentimentDistribution.positive}%` }}
              className="bg-emerald-500 flex items-center justify-center text-[10px] font-mono font-bold text-slate-950"
            >
              {mlModelMetrics.sentimentDistribution.positive}%
            </div>
            <div
              style={{ width: `${mlModelMetrics.sentimentDistribution.neutral}%` }}
              className="bg-slate-500 flex items-center justify-center text-[10px] font-mono font-bold text-slate-950"
            >
              {mlModelMetrics.sentimentDistribution.neutral}%
            </div>
            <div
              style={{ width: `${mlModelMetrics.sentimentDistribution.negative}%` }}
              className="bg-rose-500 flex items-center justify-center text-[10px] font-mono font-bold text-slate-950"
            >
              {mlModelMetrics.sentimentDistribution.negative}%
            </div>
          </div>

          <div className="grid grid-cols-3 text-center text-xs font-mono pt-1">
            <div>
              <span className="text-slate-400 block text-[10px]">Бычий (Long)</span>
              <strong className="text-emerald-400">{mlModelMetrics.sentimentDistribution.positive}%</strong>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px]">Нейтральный</span>
              <strong className="text-slate-300">{mlModelMetrics.sentimentDistribution.neutral}%</strong>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px]">Медвежий (Short)</span>
              <strong className="text-rose-400">{mlModelMetrics.sentimentDistribution.negative}%</strong>
            </div>
          </div>
        </div>
        </>
        ) : (
          <div className="rounded-xl bg-slate-900/70 border border-slate-800 p-4 text-xs text-amber-200">
            Данные X / Reddit / Telegram и ML-модель не подключены. Социальные проценты не выдумываются.
          </div>
        )}
      </div>

      {/* Social Volume Spikes & Narrative Keywords */}
      {sentimentData.socialDataAvailable && (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Social Spikes */}
        <div className="p-3.5 rounded-lg bg-slate-900/50 border border-slate-800/80">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-200 mb-2">
            <TrendingUp className="w-3.5 h-3.5 text-cyan-400" />
            <span>Всплески активности в социальных сетях:</span>
          </div>
          <div className="space-y-1.5 text-xs">
            <div className="p-2 rounded bg-slate-950/60 border border-slate-800/60 text-slate-300 flex items-center justify-between">
              <span className="font-semibold text-slate-200">X (Twitter):</span>
              <span className="text-cyan-300 font-mono text-[11px]">{mlModelMetrics.socialVolumeSpikes.twitterX}</span>
            </div>
            <div className="p-2 rounded bg-slate-950/60 border border-slate-800/60 text-slate-300 flex items-center justify-between">
              <span className="font-semibold text-slate-200">Reddit:</span>
              <span className="text-cyan-300 font-mono text-[11px]">{mlModelMetrics.socialVolumeSpikes.reddit}</span>
            </div>
            <div className="p-2 rounded bg-slate-950/60 border border-slate-800/60 text-slate-300 flex items-center justify-between">
              <span className="font-semibold text-slate-200">Telegram Alpha:</span>
              <span className="text-cyan-300 font-mono text-[11px]">{mlModelMetrics.socialVolumeSpikes.telegramAlpha}</span>
            </div>
          </div>
        </div>

        {/* Narrative & Keywords */}
        <div className="p-3.5 rounded-lg bg-slate-900/50 border border-slate-800/80">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-200 mb-2">
            <Flame className="w-3.5 h-3.5 text-amber-400" />
            <span>Ключевые вирусные нарративы и смарт-мани триггеры:</span>
          </div>
          <div className="flex flex-wrap gap-1.5 mb-3">
            {mlModelMetrics.viralKeywords.map((word, idx) => (
              <span
                key={idx}
                className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-200 border border-slate-700/60"
              >
                #{word}
              </span>
            ))}
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            {mlModelMetrics.summaryRu}
          </p>
        </div>
      </div>
      )}
    </div>
  );
};
