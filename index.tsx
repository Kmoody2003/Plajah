
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import { GlobalPlayerProvider } from './contexts/GlobalPlayerContext';
// @ts-ignore
import { registerSW } from 'virtual:pwa-register';

// Plajah Pixels external program-output window. Opened with ?programOut=1, this
// is its OWN minimal entry — it must NOT boot the whole platform (auth, router,
// player), or the popup just shows the website instead of the live composite.
// We short-circuit here and mount only the ProgramOutView clone, lazily so it
// never weighs on the main bundle.
const ProgramOutView = React.lazy(() => import('./components/plajahPixels/components/ProgramOutView'));

// ── Force the whole app onto the discrete GPU (NVIDIA), not the integrated one ──
// A browser binds a page to ONE GPU, decided by the power-preference of its WebGL
// contexts. If any library creates a default (low-power) context first, the page
// lands on the integrated Intel/Arc GPU and every later 'high-performance' request
// is ignored for the rest of the page's life. We patch getContext so EVERY webgl/
// webgl2 context app-wide (three.js, butterchurn, tfjs, custom GLSL, 3rd-party)
// requests the discrete GPU — and log the active renderer once so it's verifiable.
// NOTE: this is only a strong *hint*; the OS/driver can still override it. To fully
// pin Chrome to NVIDIA, also set Windows → Graphics → (browser) → High performance
// and NVIDIA Control Panel → Manage 3D settings → (browser) → High-performance GPU.
(() => {
  try {
    const proto: any = HTMLCanvasElement.prototype;
    const orig = proto.getContext;
    let logged = false;
    proto.getContext = function (type: string, attrs?: any) {
      if (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl') {
        // Spread attrs AFTER so an explicit caller preference still wins.
        attrs = { powerPreference: 'high-performance', ...(attrs || {}) };
        const ctx = orig.call(this, type, attrs);
        if (ctx && !logged) {
          logged = true;
          try {
            const dbg = ctx.getExtension('WEBGL_debug_renderer_info');
            if (dbg) console.info('[Plajah GPU] active renderer →', ctx.getParameter(dbg.UNMASKED_RENDERER_WEBGL));
          } catch { /* */ }
        }
        return ctx;
      }
      return orig.call(this, type, attrs);
    };
    // WebGPU path (tfjs / MediaPipe) — prefer the high-performance adapter too.
    const gpu: any = (navigator as any).gpu;
    if (gpu?.requestAdapter) {
      const ogReq = gpu.requestAdapter.bind(gpu);
      gpu.requestAdapter = (opts?: any) => ogReq({ powerPreference: 'high-performance', ...(opts || {}) });
    }
  } catch { /* non-fatal — keep booting */ }
})();

// Returns true if any audio or video element is actively playing.
// We also check window.__plajahMediaActive which media components can set
// for cases that don't use HTMLMediaElement (e.g. Web Audio, YouTube iframe API).
function isMediaActive(): boolean {
  if ((window as any).__plajahMediaActive) return true;
  return Array.from(document.querySelectorAll<HTMLMediaElement>('audio, video'))
    .some(el => !el.paused && !el.ended && el.readyState > 2);
}

// A small, non-intrusive bottom toast offering a one-click reload when a new build
// is waiting mid-session. Plain DOM so it works regardless of React state.
function showUpdateToast(onReload: () => void) {
  if (document.getElementById('plajah-sw-toast')) return;
  const bar = document.createElement('div');
  bar.id = 'plajah-sw-toast';
  bar.style.cssText = 'position:fixed;bottom:18px;left:50%;transform:translateX(-50%);z-index:2147483647;display:flex;align-items:center;gap:12px;padding:11px 16px;border-radius:10px;background:#1b1b24;color:#fff;border:1px solid rgba(255,140,0,0.4);box-shadow:0 8px 30px rgba(0,0,0,.5);font:500 13px system-ui,sans-serif';
  const msg = document.createElement('span'); msg.textContent = 'A new version of Plajah is ready.';
  const btn = document.createElement('button'); btn.textContent = 'Reload';
  btn.style.cssText = 'padding:6px 14px;border-radius:7px;border:none;background:linear-gradient(90deg,#FF8C00,#ffa733);color:#1a1a1a;font-weight:700;cursor:pointer';
  btn.onclick = () => { btn.textContent = 'Updating…'; onReload(); };
  const x = document.createElement('button'); x.textContent = '✕';
  x.style.cssText = 'background:none;border:none;color:#888;cursor:pointer;font-size:14px;line-height:1';
  x.title = 'Dismiss (update applies next time all tabs are closed)';
  x.onclick = () => bar.remove();
  bar.append(msg, btn, x);
  (document.body || document.documentElement).appendChild(bar);
}

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  // Use 'prompt' mode so we control exactly when the update is applied.
  // autoUpdate would call location.reload() the moment any new deploy lands,
  // which interrupts video, audio, and games with no warning.
  const updateSW = registerSW({
    onNeedRefresh() {
      // If the user just arrived (page loaded under 6 seconds ago) AND nothing
      // is playing yet, silently reload to apply the update — feels like normal
      // page load to the user. Use setTimeout so updateSW is definitely assigned.
      if (performance.now() < 6000 && !isMediaActive()) {
        setTimeout(() => updateSW(true), 0);
        return;
      }
      // Mid-session: don't auto-reload (would interrupt a live VJ set / video), but
      // DO surface a one-click "Reload" toast so a new deploy actually reaches the
      // user instead of waiting until every tab is closed. They update when ready.
      showUpdateToast(() => updateSW(true));
    },
    onOfflineReady() {
      console.log('[SW] App ready for offline use.');
    },
    onRegisteredSW(_swUrl: string, r: ServiceWorkerRegistration | undefined) {
      // Browsers only check for a new SW on navigation by default; poll so a deploy
      // that lands while the tab stays open is noticed (→ the Reload toast) within ~1 min.
      if (r) setInterval(() => { r.update().catch(() => { /* offline */ }); }, 60_000);
    },
  });
} else if (import.meta.env.DEV && 'serviceWorker' in navigator) {
  // Dev self-heal. A service worker left over from a local production build
  // (`npm run build` / `preview`) keeps controlling the page and answers
  // /assets/* from its precache, so the Vite dev server is shadowed — you edit
  // source and the browser shows the last built bundle. Unregister any leftover
  // SW, drop its caches, and reload once (loop-guarded) so dev always reflects
  // live source.
  navigator.serviceWorker.getRegistrations().then(async (regs) => {
    if (!regs.length) return;
    await Promise.all(regs.map((r) => r.unregister()));
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
    if (!sessionStorage.getItem('__sw_dev_cleared')) {
      sessionStorage.setItem('__sw_dev_cleared', '1');
      location.reload();
    }
  }).catch(() => { /* best effort */ });
}

// Contain the known firebase-js-sdk Watch-stream assertion bug (thrown as
// uncaught errors from the SDK's own event queue after quota/permission
// failures). Without this, backend noise crashes the whole tab.
const FIRESTORE_NOISE = /FIRESTORE.*INTERNAL ASSERTION/i;
window.addEventListener('error', (e) => {
  if (FIRESTORE_NOISE.test(e.message || '')) {
    e.preventDefault();
    console.warn('[global] Suppressed Firestore internal assertion error.');
  }
});
window.addEventListener('unhandledrejection', (e) => {
  if (FIRESTORE_NOISE.test(String(e.reason?.message || e.reason || ''))) {
    e.preventDefault();
    console.warn('[global] Suppressed Firestore internal assertion rejection.');
  }
});

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);

const isProgramOut =
  new URLSearchParams(window.location.search).get('programOut') === '1';

if (isProgramOut) {
  // External display / video-wall clone — composite only, no platform shell.
  root.render(
    <React.StrictMode>
      <ErrorBoundary>
        <React.Suspense fallback={<div style={{ width: '100vw', height: '100vh', background: '#000' }} />}>
          <ProgramOutView />
        </React.Suspense>
      </ErrorBoundary>
    </React.StrictMode>
  );
} else {
  root.render(
    <React.StrictMode>
      <ErrorBoundary>
        <GlobalPlayerProvider>
          <App />
        </GlobalPlayerProvider>
      </ErrorBoundary>
    </React.StrictMode>
  );
}
