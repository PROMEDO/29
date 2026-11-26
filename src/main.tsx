import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './styles/platform-style.css';
import { registerWebMcpTools } from './utils/webmcp';

const IN_APP_BROWSER_RE =
  /\b(Instagram|FBAN|FBAV|FB_IAB|Threads|TikTok|BytedanceWebview|musical_ly|Snapchat|Line|MicroMessenger)\b/i;

if (typeof window !== 'undefined') {
  registerWebMcpTools();
  try {
    const url = new URL(window.location.href);
    let urlChanged = false;
    if (url.searchParams.has('_mp_recover')) {
      url.searchParams.delete('_mp_recover');
      urlChanged = true;
    }
    if (url.searchParams.has('_v')) {
      url.searchParams.delete('_v');
      urlChanged = true;
    }
    if (urlChanged) {
      const cleaned = url.pathname + (url.search ? url.search : '') + url.hash;
      window.history.replaceState(null, '', cleaned || '/');
    }
  } catch {
    // ignore URL cleanup errors
  }

  const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
  const isInAppBrowser = IN_APP_BROWSER_RE.test(ua);

  if ('serviceWorker' in navigator) {
    if (isInAppBrowser) {
      // In-app WebViews (Instagram/Facebook/TikTok) often get stuck on stale SW caches;
      // actively purge SWs & CacheStorage and perform one guarded reload if an old SW controlled this page.
      const hadController = Boolean(navigator.serviceWorker.controller);
      Promise.all([
        navigator.serviceWorker
          .getRegistrations()
          .then((regs) => Promise.all(regs.map((r) => r.unregister().catch(() => false))))
          .catch(() => []),
        typeof caches !== 'undefined'
          ? caches
              .keys()
              .then((keys) => Promise.all(keys.map((k) => caches.delete(k).catch(() => false))))
              .catch(() => [])
          : Promise.resolve([]),
      ]).then(() => {
        if (!hadController) return;
        try {
          const reloadGuardKey = 'menuplus_iab_sw_purged';
          if (window.sessionStorage.getItem(reloadGuardKey)) return;
          window.sessionStorage.setItem(reloadGuardKey, '1');
          const nextUrl = new URL(window.location.href);
          nextUrl.searchParams.set('_v', Date.now().toString(36));
          window.location.replace(nextUrl.toString());
        } catch {
          // ignore storage/navigation errors
        }
      });
    } else {
      window.addEventListener('load', () => {
        navigator.serviceWorker
          .register('/sw.js', { updateViaCache: 'none' })
          .then((reg) => reg.update().catch(() => {}))
          .catch(() => {});
      });
    }
  }
}

createRoot(document.getElementById('root')!).render(<App />);
