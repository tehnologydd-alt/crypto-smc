import React from 'react';
import { Radio, RefreshCw } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { PWAInstallButton } from './PWAInstallButton';

type Props={activeTab:string;onTabChange:(id:string)=>void;onRefreshSnapshot:()=>void;isLoading:boolean;selectedAsset:string};
const tabs=[['overview','Рынок'],['smc','SMC'],['whales','Крупные заявки'],['sentiment','Настроение'],['signals','Анализ']];
export const Header:React.FC<Props>=({activeTab,onTabChange,onRefreshSnapshot,isLoading,selectedAsset})=><header className="sticky top-0 z-40 bg-[#080c14]/95 backdrop-blur-md border-b border-slate-800 px-4 py-3">
  <div className="max-w-7xl mx-auto flex flex-wrap justify-between gap-3 items-center"><div className="flex items-center gap-2"><div className="rounded-lg bg-emerald-500/15 border border-emerald-500/40 text-emerald-400 font-extrabold p-2 text-xs">AX</div><span className="font-bold tracking-tight">ApexiCrypto</span><span className="hidden sm:inline-flex items-center gap-1 text-[11px] text-slate-400"><Radio size={13} className="text-emerald-400"/>Android Standalone</span></div><div className="flex items-center gap-2"><button title="Обновить котировки" onClick={onRefreshSnapshot} disabled={isLoading} className="flex items-center gap-2 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs disabled:opacity-50"><RefreshCw size={15} className={isLoading?'animate-spin':''}/>{selectedAsset.replace('USDT','')} обновить</button>{!Capacitor.isNativePlatform()&&<PWAInstallButton/>}</div></div>
  <nav className="max-w-7xl mx-auto flex gap-2 overflow-x-auto pt-3 scrollbar-none">{tabs.map(([id,label])=><button key={id} onClick={()=>onTabChange(id)} className={`shrink-0 px-3 py-2 rounded-lg text-xs font-semibold ${activeTab===id?'bg-emerald-500/20 border border-emerald-500/40 text-emerald-300':'bg-slate-900/70 border border-slate-800 text-slate-400'}`}>{label}</button>)}</nav>
</header>;
