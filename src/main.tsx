import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import {installNativeClipboard} from './lib/nativeClipboard';

// Aktif hanya di aplikasi Android (WebView); di browser biasa tidak berpengaruh.
installNativeClipboard();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
