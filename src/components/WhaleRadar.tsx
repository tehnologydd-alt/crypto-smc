import React from 'react';
import type { WhaleRadarData } from '../types/crypto';
import { Radio, Info } from 'lucide-react';

type Props={radarData:WhaleRadarData|null;isLoading:boolean};
const usd=(n:number)=>'$'+n.toLocaleString('ru-RU',{maximumFractionDigits:0});
const px=(n:number)=>n.toLocaleString('ru-RU',{maximumFractionDigits:6});
export const WhaleRadar:React.FC<Props>=({radarData,isLoading})=><section className="bg-[#0b101c] border border-slate-800 rounded-xl p-4 sm:p-5 mb-6">
  <h2 className="flex gap-2 items-center font-bold text-slate-100"><Radio size={18} className="text-cyan-400"/>Радар крупных заявок · Binance / Bybit</h2>
  <p className="text-xs text-slate-400 mt-2 mb-4">{radarData?.source ?? (isLoading?'Чтение публичных стаканов…':'Нет данных')}</p>
  {!radarData || !radarData.walls.length?<p className="text-sm text-amber-300 py-6">Данные о крупных заявках сейчас недоступны. События о китах не выдумываются.</p>:<>
    <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs mb-4"><div className="bg-slate-900/70 border border-slate-800 p-3 rounded-lg"><div className="text-slate-400">Сумма BID в срезе</div><div className="font-mono font-bold text-emerald-400 mt-2">{usd(radarData.bidLiquidityUsd)}</div></div><div className="bg-slate-900/70 border border-slate-800 p-3 rounded-lg"><div className="text-slate-400">Сумма ASK в срезе</div><div className="font-mono font-bold text-rose-400 mt-2">{usd(radarData.askLiquidityUsd)}</div></div><div className="bg-slate-900/70 border border-slate-800 p-3 rounded-lg col-span-2 md:col-span-1"><div className="text-slate-400">Дисбаланс видимых заявок</div><div className="font-mono font-bold text-slate-100 mt-2">{radarData.imbalance===null?'—':`${(radarData.imbalance*100).toFixed(1)}%`}</div></div></div>
    <div className="space-y-2">{radarData.walls.map(w=><div key={w.id} className="grid grid-cols-[1fr_auto] gap-2 rounded-lg border border-slate-800 bg-slate-900/60 p-3"><div className="text-xs"><span className={`font-bold ${w.side==='BID'?'text-emerald-400':'text-rose-400'}`}>{w.side==='BID'?'Покупка BID':'Продажа ASK'}</span><span className="text-slate-400"> · {w.exchange}</span><p className="text-slate-300 font-mono mt-1">Цена: {px(w.price)} · Объём: {w.amount.toFixed(4)}</p></div><div className="font-mono font-bold text-sm text-white self-center">{usd(w.usdValue)}</div></div>)}</div>
    <div className="text-[11px] text-slate-400 mt-4 flex items-start gap-2"><Info size={14} className="shrink-0 mt-0.5"/>Заявки могут быть отменены. Они не раскрывают владельца кошелька и не подтверждают сделки, ETF-потоки или ончейн-переводы.</div>
  </>}
</section>;
