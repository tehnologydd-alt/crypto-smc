import React from 'react';
import type { ExchangeData, PriceSnapshot } from '../types/crypto';
import { ArrowDownRight, ArrowRightLeft, ArrowUpRight, RefreshCw } from 'lucide-react';

type Props = { snapshot:PriceSnapshot|null; isLoading:boolean; onRefresh:()=>void; stale?:boolean };
const price = (x:number)=>x.toLocaleString('ru-RU',{maximumFractionDigits:x<1?7:4});
const amount=(x:number)=>x.toLocaleString('ru-RU',{maximumFractionDigits:2});
function Venue({name,data,stale}:{name:string;data:ExchangeData|null;stale?:boolean}) {
  if(!data) return <section className="rounded-xl border border-slate-800 bg-[#0b101c] p-4"><h3 className="font-bold text-slate-100">{name}</h3><p className="mt-3 text-sm text-amber-300">Источник временно недоступен. Подставных котировок нет.</p></section>;
  return <section className="rounded-xl border border-slate-800 bg-[#0b101c] p-4 shadow-lg">
    <div className="flex justify-between items-center gap-3 mb-3"><h3 className="font-semibold">{name} · Spot</h3><span className="text-[11px] rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-2 py-1">{stale?'СОХРАНЕНО':'LIVE API'}</span></div>
    <p className="text-3xl font-extrabold tracking-tight font-mono text-white">${price(data.price)}</p>
    <div className={`text-sm font-semibold flex items-center gap-1 mt-1 ${data.change24h>=0?'text-emerald-400':'text-rose-400'}`}>{data.change24h>=0?<ArrowUpRight size={16}/>:<ArrowDownRight size={16}/>} {data.change24h.toFixed(2)}% / 24ч</div>
    <div className="grid grid-cols-3 gap-2 mt-4 text-[11px] text-slate-400 border-y border-slate-800 py-3">
      <div>Максимум 24ч <p className="font-mono text-slate-200 mt-1">{price(data.high24h)}</p></div>
      <div>Минимум 24ч <p className="font-mono text-slate-200 mt-1">{price(data.low24h)}</p></div>
      <div>Объём 24ч <p className="font-mono text-slate-200 mt-1">{amount(data.volume24h)}</p></div>
    </div>
    <p className="text-[11px] text-slate-400 mt-3">Публичная книга заявок (верхние уровни)</p>
    <div className="grid grid-cols-2 gap-3 mt-2 text-xs font-mono">
      <div>{data.orderBook.topBids.slice(0,4).map((x,i)=><div className="flex justify-between gap-2 text-emerald-400 my-1" key={i}><span>{price(x.price)}</span><span className="text-slate-400">{amount(x.amount)}</span></div>)}</div>
      <div>{data.orderBook.topAsks.slice(0,4).map((x,i)=><div className="flex justify-between gap-2 text-rose-400 my-1" key={i}><span>{price(x.price)}</span><span className="text-slate-400">{amount(x.amount)}</span></div>)}</div>
    </div>
  </section>;
}
export const ExchangeComparison:React.FC<Props>=({snapshot,isLoading,onRefresh,stale}) => {
  if(!snapshot) return <div className="rounded-xl bg-slate-900 border border-slate-800 p-6 text-slate-400">{isLoading?'Загружаем публичные котировки…':'Рыночные данные пока не получены.'}</div>;
  return <section className="mb-6 space-y-3">
    <div className="flex flex-wrap justify-between items-center gap-3 bg-[#0d1424] rounded-xl border border-slate-800 p-4">
      <div><h2 className="text-xl font-extrabold">{snapshot.asset.name} <span className="text-sm text-emerald-400 font-mono">{snapshot.symbol}</span></h2><p className="text-xs text-slate-400 mt-1">Срез: {new Date(snapshot.timestamp).toLocaleString('ru-RU')} · исключительно полученные данные</p></div>
      <button onClick={onRefresh} disabled={isLoading} className="flex items-center gap-2 rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-xs disabled:opacity-40"><RefreshCw size={14} className={isLoading?'animate-spin':''}/>Обновить</button>
    </div>
    {snapshot.comparison.spreadPercent!==null && <div className="rounded-lg border border-slate-800 bg-[#0d1424] p-3 text-xs text-slate-300 flex gap-2 items-center"><ArrowRightLeft size={16} className="text-cyan-400"/>Разница котировок: <strong>${snapshot.comparison.spreadAbsolute?.toFixed(4)} ({snapshot.comparison.spreadPercent.toFixed(3)}%)</strong> · Ниже цена на {snapshot.comparison.cheaperExchange}. Комиссии и глубина исполнения не учтены.</div>}
    <div className="grid gap-4 md:grid-cols-2"><Venue name="Binance" data={snapshot.exchanges.binance} stale={stale}/><Venue name="Bybit" data={snapshot.exchanges.bybit} stale={stale}/></div>
  </section>;
};
