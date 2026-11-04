import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vite';

export default defineConfig({
  // Relative paths: the build is bundled inside the Android APK (no remote server URL).
  base: './',
  plugins:[
    react(), tailwindcss(),
    VitePWA({
      registerType:'autoUpdate',
      injectRegister:false,
      includeAssets:['icon.svg','favicon.ico','apple-touch-icon.png'],
      manifest: {
        name:'ApexiCrypto — независимый аналитический терминал', short_name:'ApexiCrypto',
        description:'Котировки двух бирж, SMC и локальный анализ без AI Studio.',
        start_url:'/',display:'standalone',scope:'/',theme_color:'#090d16',background_color:'#090d16',
        icons:[
          {src:'/pwa-192x192.png',sizes:'192x192',type:'image/png'},
          {src:'/pwa-512x512.png',sizes:'512x512',type:'image/png'},
        ],
      },
      workbox:{globPatterns:['**/*.{js,css,html,ico,png,svg,woff,woff2}']},
    }),
  ],
});
