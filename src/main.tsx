import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { registerSW } from 'virtual:pwa-register';

// Register service worker for installable PWA
registerSW({
  immediate: true,
  onNeedRefresh() {
    console.log('New PWA content available, ready to update');
  },
  onOfflineReady() {
    console.log('ApexiCrypto is ready for offline usage');
  },
});

createRoot(document.getElementById('root')!).render(<App />);

