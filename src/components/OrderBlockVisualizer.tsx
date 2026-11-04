import React from 'react';
import type { SMCData } from '../types/crypto';
import { Layers, Activity } from 'lucide-react';

type Props = {smc:SMCData;currentPrice:number;symbol:string};
const fmt=(n:number)=>n.toLocaleString('ru-RU',{maximumFractionDigits:n<1?7:4});
export const OrderBlockVisualizer:React.FC<Props>=({smc,currentPrice,symbol})=>{
  const width=Math.max(0.00000001,smc.premiumZone.max-smc.discountZone.min);
  const position=Math.min(100,Math.max(0,(currentPrice-smc.discountZone.min)/width*100));
  return <section className="bg-[#0b101c] border border-slate-800 rounded-xl p-4 sm:p-5 mb-6">
    <div className="flex flex-wrap justify-between gap-2 mb-4"><h2 className="flex gap-2 items-center font-bold text-slate-100"><Layers size={18} className="text-emerald-400"/>SMC · Свечные структуры {symbol}</h2><span className="text-xs text-slate-400">{smc.marketStructure.replaceAll('_',' ')}</span></div>
    <div className="rounded-xl bg-slate-900/70 p-4 border border-slate-800">
      <div className="text-xs flex justify-between gap-3 text-slate-400 mb-2"><span>Диапазон последних 48 закрытых часовых свечей</span><span className="font-mono text-white">${fmt(currentPrice)}</span></div>
      <div className="h-4 rounded-lg relative overflow-hidden flex border border-slate-700"><div className="w-1/2 bg-emerald-700/35"/><div className="w-1/2 bg-rose-700/35"/><div className="absolute top-0 bottom-0 w-1 bg-cyan-400" style={{left:`${position}%`}}/></div>
      <div className="flex justify-between mt-2 text-[11px] text-slate-400 font-mono"><span>${fmt(smc.discountZone.min)}</span><span>Середина ${fmt(smc.discountZone.max)}</span><span>${fmt(smc.premiumZone.max)}</span></div>
    </div>
    <div className="grid sm:grid-cols-2 gap-3 my-4"><div className="p-3 bg-slate-900/70 rounded-lg border border-slate-800"><h3 className="text-emerald-400 font-semibold text-sm mb-2">Поддержки (свинг-минимумы)</h3>{smc.supportLevels.length?smc.supportLevels.map((x,i)=><p key={i} className="text-xs font-mono py-1">${fmt(x)}</p>):<p className="text-xs text-slate-400">Подтверждённые уровни не найдены</p>}</div><div className="p-3 bg-slate-900/70 rounded-lg border border-slate-800"><h3 className="text-rose-400 font-semibold text-sm mb-2">Сопротивления (свинг-максимумы)</h3>{smc.resistanceLevels.length?smc.resistanceLevels.map((x,i)=><p key={i} className="text-xs font-mono py-1">${fmt(x)}</p>):<p className="text-xs text-slate-400">Подтверждённые уровни не найдены</p>}</div></div>
    <h3 className="text-sm text-slate-200 font-semibold mb-3 flex items-center gap-2"><Activity size={16} className="text-cyan-400"/>Непротестированные свечные зоны ({smc.orderBlocks.length})</h3>
    {smc.orderBlocks.length ? <div className="grid sm:grid-cols-2 gap-2">{smc.orderBlocks.map((o,i)=><div key={`${o.time}-${i}`} className="border border-slate-800 bg-slate-900/60 p-3 rounded-lg"><div className={`text-xs font-semibold ${o.type==='bullish'?'text-emerald-400':'text-rose-400'}`}>{o.label}</div><div className="text-sm font-mono mt-1">${fmt(o.levelLow)} — ${fmt(o.levelHigh)}</div><p className="text-[11px] text-slate-400 mt-1">{o.time?new Date(o.time).toLocaleString('ru-RU'):''} · Относительный объём: {o.strength}/99 (не вероятность)</p></div>)}</div> : <p className="text-xs text-slate-400">По строгим условиям подтверждённых зон сейчас нет. Искусственные уровни не добавляются.</p>}
    <div className="border-t border-slate-800 mt-4 pt-3 text-xs text-slate-400">FVG: {smc.fvg.present?`${smc.fvg.type==='bullish'?'бычий':'медвежий'} диапазон ${fmt(smc.fvg.bottom!)} – ${fmt(smc.fvg.top!)}`:'не найден по последним 3 закрытым свечам'}. Это эвристический анализ OHLC, не обнаружение реальных институциональных ордеров.</div>
  </section>;
};
