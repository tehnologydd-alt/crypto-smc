import React from 'react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { Download } from 'lucide-react';

/** Web-only install prompt. On Android this component is hidden by Header. */
export const PWAInstallButton:React.FC=()=>{
  const {isInstallable,isInstalled,install}=usePWAInstall();
  if (isInstalled || !isInstallable) return null;
  return <button onClick={()=>void install()} className="flex gap-1 items-center rounded-lg border border-emerald-600/50 bg-emerald-600/20 text-emerald-300 px-3 py-2 text-xs"><Download size={14}/>Установить PWA</button>;
};
