import React, { useState } from 'react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { Download, Package } from 'lucide-react';
import { PackageBuilderModal } from './PackageBuilderModal';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, install } = usePWAInstall();
  const [showBuilderModal, setShowBuilderModal] = useState<boolean>(false);

  const handleInstallClick = async () => {
    if (isInstallable) {
      const outcome = await install();
      if (!outcome) {
        setShowBuilderModal(true);
      }
    } else {
      setShowBuilderModal(true);
    }
  };

  return (
    <>
      <div className="flex items-center gap-2">
        <button
          onClick={handleInstallClick}
          className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white px-3.5 py-1.5 text-xs font-semibold transition-all shadow-md shadow-emerald-600/20 active:scale-95 cursor-pointer whitespace-nowrap shrink-0"
          title="Собрать установочный файл или установить приложение"
        >
          <Package className="w-3.5 h-3.5" />
          <span>Установочный файл</span>
        </button>
      </div>

      <PackageBuilderModal
        isOpen={showBuilderModal}
        onClose={() => setShowBuilderModal(false)}
        onNativeInstall={install}
        isInstallable={isInstallable}
      />
    </>
  );
};
