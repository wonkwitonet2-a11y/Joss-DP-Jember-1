import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import './theme.css';
import {installNativeClipboard} from './lib/nativeClipboard';

// The workspace reserves /api for its shared API service. Route this app's
// legacy JOSS endpoints through a private path when the browser allows fetch to
// be overridden. Some app builders expose window.fetch as a read-only getter.
const nativeFetch = window.fetch.bind(window);
let fetchOwner: object | null = window;
let fetchDescriptor: PropertyDescriptor | undefined;
while (fetchOwner && !fetchDescriptor) {
  fetchDescriptor = Object.getOwnPropertyDescriptor(fetchOwner, "fetch");
  fetchOwner = Object.getPrototypeOf(fetchOwner);
}

const canOverrideFetch =
  !fetchDescriptor || fetchDescriptor.writable === true || typeof fetchDescriptor.set === "function";

if (canOverrideFetch) {
  window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const sourceUrl = input instanceof Request
      ? new URL(input.url)
      : new URL(input.toString(), window.location.href);

    if (sourceUrl.origin !== window.location.origin || !/^\/api(?:\/|$)/.test(sourceUrl.pathname)) {
      return nativeFetch(input, init);
    }

    sourceUrl.pathname = sourceUrl.pathname.replace(/^\/api(?=\/|$)/, '/joss-api');
    const rewrittenInput = input instanceof Request
      ? new Request(sourceUrl.toString(), input)
      : input instanceof URL
        ? sourceUrl
        : `${sourceUrl.pathname}${sourceUrl.search}${sourceUrl.hash}`;

    return nativeFetch(rewrittenInput, init);
  }) as typeof window.fetch;
}

// Aktif hanya di aplikasi Android (WebView); di browser biasa tidak berpengaruh.
installNativeClipboard();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
