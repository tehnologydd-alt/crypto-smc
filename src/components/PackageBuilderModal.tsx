import React, { useState } from 'react';
import {
  X,
  Download,
  Monitor,
  Smartphone,
  ExternalLink,
  Check,
  Copy,
  Package,
  ShieldAlert,
  ArrowRight,
  Terminal,
  Layers,
  FileCode,
  Sparkles,
} from 'lucide-react';

interface PackageBuilderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNativeInstall?: () => void;
  isInstallable?: boolean;
}

export const PackageBuilderModal: React.FC<PackageBuilderModalProps> = ({
  isOpen,
  onClose,
  onNativeInstall,
  isInstallable,
}) => {
  const [activeTab, setActiveTab] = useState<'windows' | 'android' | 'pwa' | 'linux'>('windows');
  const [copiedLink, setCopiedLink] = useState(false);

  if (!isOpen) return null;

  const appUrl = typeof window !== 'undefined'
    ? window.location.origin
    : 'https://github.com/tehnologydd-alt/crypto-smc/tree/apexicrypto-android';

  const pwabuilderUrl = `https://www.pwabuilder.com/reportcard?site=${encodeURIComponent(appUrl)}`;

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(appUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    } catch {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 overflow-y-auto animate-fade-in">
      <div className="w-full max-w-2xl rounded-2xl bg-[#0d1424] border border-slate-700/80 p-5 sm:p-7 shadow-2xl text-slate-100 relative my-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-500/20 to-cyan-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
              <Package className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                Центр сборки установочных файлов ApexiCrypto
              </h2>
              <p className="text-xs text-slate-400">
                Выберите платформу для скачивания или сборки автономного пакета
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Selector */}
        <div className="grid grid-cols-4 gap-2 my-5 p-1 bg-slate-950/80 rounded-xl border border-slate-800 text-xs font-medium">
          <button
            onClick={() => setActiveTab('windows')}
            className={`flex items-center justify-center gap-1.5 py-2.5 rounded-lg transition cursor-pointer ${
              activeTab === 'windows'
                ? 'bg-slate-800 text-white font-semibold shadow border border-slate-700'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Monitor className="w-4 h-4 text-cyan-400" />
            <span>Windows (.bat)</span>
          </button>

          <button
            onClick={() => setActiveTab('android')}
            className={`flex items-center justify-center gap-1.5 py-2.5 rounded-lg transition cursor-pointer ${
              activeTab === 'android'
                ? 'bg-slate-800 text-white font-semibold shadow border border-slate-700'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Smartphone className="w-4 h-4 text-emerald-400" />
            <span>Android (APK)</span>
          </button>

          <button
            onClick={() => setActiveTab('pwa')}
            className={`flex items-center justify-center gap-1.5 py-2.5 rounded-lg transition cursor-pointer ${
              activeTab === 'pwa'
                ? 'bg-slate-800 text-white font-semibold shadow border border-slate-700'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Download className="w-4 h-4 text-amber-400" />
            <span>PWA в 1 клик</span>
          </button>

          <button
            onClick={() => setActiveTab('linux')}
            className={`flex items-center justify-center gap-1.5 py-2.5 rounded-lg transition cursor-pointer ${
              activeTab === 'linux'
                ? 'bg-slate-800 text-white font-semibold shadow border border-slate-700'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Terminal className="w-4 h-4 text-indigo-400" />
            <span>Linux (.desktop)</span>
          </button>
        </div>

        {/* Tab 1: Windows Installer */}
        {activeTab === 'windows' && (
          <div className="space-y-4 animate-fade-in text-xs text-slate-300">
            <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-bold text-white text-sm flex items-center gap-2">
                  <Monitor className="w-4 h-4 text-cyan-400" />
                  Установочный файл для Windows (7 / 10 / 11)
                </span>
                <span className="font-mono text-[11px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                  Готов к скачиванию
                </span>
              </div>
              <p className="text-slate-400 leading-relaxed">
                Скрипт автоматически создаёт ярлыки <strong>«ApexiCrypto Terminal»</strong> на Рабочем столе и в меню «Пуск» с запуском в автономном нативном окне без рамок и строки браузера.
              </p>

              <div className="pt-2 flex flex-col sm:flex-row items-center gap-3">
                <a
                  href="https://github.com/tehnologydd-alt/crypto-smc/tree/apexicrypto-android"
                  download="ApexiCrypto_Setup.bat"
                  className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold shadow-lg shadow-emerald-600/20 transition cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>Скачать ApexiCrypto_Setup.bat (Windows)</span>
                </a>

                <button
                  onClick={handleCopyLink}
                  className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition cursor-pointer"
                >
                  {copiedLink ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  <span>{copiedLink ? 'Ссылка скопирована' : 'Скопировать URL приложения'}</span>
                </button>
              </div>
            </div>

            <div className="p-3.5 rounded-lg bg-slate-950/60 border border-slate-800/80 space-y-2">
              <strong className="text-slate-200 block">Инструкция по установке:</strong>
              <ol className="list-decimal list-inside space-y-1 text-slate-400 text-[11px]">
                <li>Нажмите зеленую кнопку <strong>«Скачать ApexiCrypto_Setup.bat»</strong>.</li>
                <li>Запустите скачанный файл (при запросе SmartScreen нажмите <em>«Подробнее» &rarr; «Выполнить в любом случае»</em>).</li>
                <li>Ярлык приложения появится на вашем Рабочем столе!</li>
              </ol>
            </div>
          </div>
        )}

        {/* Tab 2: Android APK */}
        {activeTab === 'android' && (
          <div className="space-y-4 animate-fade-in text-xs text-slate-300">
            <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-bold text-white text-sm flex items-center gap-2">
                  <Smartphone className="w-4 h-4 text-emerald-400" />
                  Сборка установочного APK файла для Android
                </span>
                <span className="font-mono text-[11px] text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/20">
                  Через Cloud Builder
                </span>
              </div>
              <p className="text-slate-400 leading-relaxed">
                Наш PWA-манифест уже содержит все маскированные иконки 512x512, скриншоты и Service Worker, необходимые для сборки нативного пакета Android APK.
              </p>

              <div className="pt-2 flex flex-col sm:flex-row items-center gap-3">
                <a
                  href={pwabuilderUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-semibold shadow-lg shadow-emerald-600/20 transition cursor-pointer"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>Открыть сборщик APK в PWABuilder</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>

                <button
                  onClick={handleCopyLink}
                  className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition cursor-pointer"
                >
                  {copiedLink ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  <span>{copiedLink ? 'Скопировано!' : 'Скопировать URL для сборки'}</span>
                </button>
              </div>
            </div>

            <div className="p-3.5 rounded-lg bg-slate-950/60 border border-slate-800/80 space-y-2">
              <strong className="text-slate-200 block">Порядок действий в PWABuilder:</strong>
              <ol className="list-decimal list-inside space-y-1 text-slate-400 text-[11px]">
                <li>Нажмите кнопку выше <strong>«Открыть сборщик APK в PWABuilder»</strong>.</li>
                <li>Сервис проверит статус приложения (манифест и иконки получат максимальный балл).</li>
                <li>Нажмите <strong>«Package for Android»</strong> &rarr; <strong>«Download APK / AAB»</strong>.</li>
                <li>Перенесите скачанный <code>.apk</code> на телефон и запустите установку!</li>
              </ol>
            </div>
          </div>
        )}

        {/* Tab 3: PWA in Browser */}
        {activeTab === 'pwa' && (
          <div className="space-y-4 animate-fade-in text-xs text-slate-300">
            <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-3">
              <span className="font-bold text-white text-sm block">
                Прямая установка через браузер (Chrome / Edge / Safari / Samsung)
              </span>
              <p className="text-slate-400 leading-relaxed">
                Если вы открыли приложение не во встроенном фрейме, браузер может установить его сразу в 1 клик прямо на рабочий стол или экран телефона.
              </p>

              <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
                {isInstallable && onNativeInstall ? (
                  <button
                    onClick={onNativeInstall}
                    className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold transition cursor-pointer"
                  >
                    <Download className="w-4 h-4" />
                    <span>Установить прямо сейчас</span>
                  </button>
                ) : (
                  <a
                    href={appUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold transition cursor-pointer"
                  >
                    <ExternalLink className="w-4 h-4" />
                    <span>Открыть в отдельной вкладке</span>
                  </a>
                )}

                <button
                  onClick={handleCopyLink}
                  className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition cursor-pointer"
                >
                  {copiedLink ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  <span>{copiedLink ? 'Скопировано!' : 'Скопировать прямую ссылку'}</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Tab 4: Linux Desktop */}
        {activeTab === 'linux' && (
          <div className="space-y-4 animate-fade-in text-xs text-slate-300">
            <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-3">
              <span className="font-bold text-white text-sm block">
                Установочный файл для Linux (Ubuntu / Debian / Fedora / Arch)
              </span>
              <p className="text-slate-400 leading-relaxed">
                Скачайте файл <code>ApexiCrypto.desktop</code> и поместите в папку <code>~/.local/share/applications/</code>.
              </p>

              <div className="pt-2">
                <a
                  href="https://github.com/tehnologydd-alt/crypto-smc/tree/apexicrypto-android"
                  download="ApexiCrypto.desktop"
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold shadow transition cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>Скачать ApexiCrypto.desktop</span>
                </a>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="mt-6 pt-3 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-400">
          <span>ApexiCrypto не требует установки сторонних библиотек и весит менее 2 МБ.</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold transition cursor-pointer"
          >
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
};
