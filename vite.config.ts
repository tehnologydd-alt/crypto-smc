import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'icon.svg'],
        manifest: {
          id: '/',
          name: 'ApexiCrypto SMC & Whale Intelligence',
          short_name: 'ApexiCrypto',
          description: 'Платформа анализа криптовалют: ордер-блоки (Smart Money SMC), отслеживание китов, ML-оценка настроений соцсетей, срез цен с Binance и Bybit, сигналы ИИ-агентов.',
          theme_color: '#090d16',
          background_color: '#090d16',
          display: 'standalone',
          display_override: ['window-controls-overlay', 'standalone', 'minimal-ui'],
          orientation: 'any',
          start_url: '/',
          scope: '/',
          lang: 'ru',
          dir: 'ltr',
          categories: ['finance', 'utilities', 'productivity'],
          prefer_related_applications: false,
          icons: [
            {
              src: '/pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-maskable-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
          screenshots: [
            {
              src: '/screenshot-wide.jpg',
              sizes: '1280x720',
              type: 'image/jpeg',
              form_factor: 'wide',
              label: 'Терминал аналитики Смарт-Мани, котировок Binance и Bybit и сигналов ИИ',
            },
            {
              src: '/screenshot-narrow.jpg',
              sizes: '720x1280',
              type: 'image/jpeg',
              form_factor: 'narrow',
              label: 'Мобильный интерфейс мониторинга ордер-блоков и ончейн-радара китов',
            },
          ],
          shortcuts: [
            {
              name: 'Срез цен Binance & Bybit',
              short_name: 'Срез цен',
              description: 'Моментальный срез котировок и книги ордеров',
              url: '/?tab=overview',
              icons: [{ src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' }],
            },
            {
              name: 'Радар Китов',
              short_name: 'Киты',
              description: 'Мониторинг крупных перемещений свыше $1M',
              url: '/?tab=whales',
              icons: [{ src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' }],
            },
            {
              name: 'Ордер-Блоки SMC',
              short_name: 'SMC Блоки',
              description: 'Анализ зон дисконта и имбалансов FVG',
              url: '/?tab=smc',
              icons: [{ src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' }],
            },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
        },
        devOptions: {
          enabled: true,
          type: 'module',
        },
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
