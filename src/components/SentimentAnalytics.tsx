import React from 'react';
import type { SentimentData } from '../types/crypto';
import { Gauge, Info } from 'lucide-react';

type Props={sentimentData:SentimentData|null;isLoading:boolean};
export const SentimentAnalytics:React.FC<Props>=({sentimentData,isLoading})=><section className="bg-[#0b101c] border border-slate-800 rounded-xl p-4 sm:p-5 mb-6">
  <h2 className="font-bold text-slate-100 flex items-center gap-2"><Gauge size={18} className="text-indigo-400"/>Настроение крипторынка · проверяемые данные</h2>
  {!sentimentData?<div className="text-sm py-5 text-slate-400">{isLoading?'Запрашиваем общерыночный индекс…':'Нет данных'}</div>:<>
    <div className="grid grid-cols-2 gap-3 mt-4"><div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4"><p className="text-xs text-slate-400">Fear & Greed (общий рынок)</p><p className="text-3xl font-extrabold font-mono mt-2">{sentimentData.fearAndGreed?.value??'—'}<span className="text-xs font-normal text-slate-400"> / 100</span></p><p className="text-xs text-indigo-300 mt-2">{sentimentData.fearAndGreed?.classification??'API недоступен'}</p></div><div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4"><p className="text-xs text-slate-400">{sentimentData.asset} · движение за 24ч</p><p className={`text-3xl font-bold font-mono mt-2 ${sentimentData.marketChange24h>=0?'text-emerald-400':'text-rose-400'}`}>{sentimentData.marketChange24h>=0?'+':''}{sentimentData.marketChange24h.toFixed(2)}%</p><p className="text-xs text-slate-400 mt-2">Биржевой тикер</p></div></div>
    <div className="mt-4 text-xs text-slate-400 flex gap-2 items-start"><Info size={15} className="shrink-0 mt-0.5"/>{sentimentData.description}</div>
  </>}
</section>;
