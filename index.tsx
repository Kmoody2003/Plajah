
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import { GlobalPlayerProvider } from './contexts/GlobalPlayerContext';
import { CHANGELOG } from './data/changelog';
import { isChunkLoadError, recoverFromStaleChunk } from './src/lib/staleChunk';
// @ts-ignore
import { registerSW } from 'virtual:pwa-register';

// Stale-deploy self-heal. Vite fires `vite:preloadError` when a dynamically imported
// chunk fails to load — almost always because a newer deploy rehashed assets while a
// service worker keeps serving the old index.html. Bust the SW + caches and reload so
// the fresh shell loads, instead of dead-ending on the crash screen. preventDefault()
// stops Vite from rethrowing while we recover.
window.addEventListener('vite:preloadError', (e: any) => {
  try { e.preventDefault(); } catch { /* */ }
  recoverFromStaleChunk();
});
// Belt-and-suspenders: catch chunk errors that surface as unhandled rejections.
window.addEventListener('unhandledrejection', (e: any) => {
  if (isChunkLoadError(e?.reason)) recoverFromStaleChunk();
});

// Plajah Pixels external program-output window. Opened with ?programOut=1, this
// is its OWN minimal entry — it must NOT boot the whole platform (auth, router,
// player), or the popup just shows the website instead of the live composite.
// We short-circuit here and mount only the ProgramOutView clone, lazily so it
// never weighs on the main bundle.
const ProgramOutView = React.lazy(() => import('./components/plajahPixels/components/ProgramOutView'));
// Teleprompter talent window — opened by the Operator Console at ?role=prompter.
// Its OWN minimal entry (like ProgramOut): render only the scrolling Prompter,
// which syncs to the operator over a same-origin BroadcastChannel.
const PrompterScreen = React.lazy(() => import('./components/teleprompter/PrompterScreen'));
// Content HQ account-free reviewer page. Opened at /review/:shareId?t=<token>. It gets its
// OWN minimal entry — BEFORE <App/> and its auth gate — so a logged-out external reviewer
// lands straight on the review UI and never flashes the marketing/login screen.
const HqReviewPublic = React.lazy(() => import('./components/HqReviewPublic'));
const UniversalLibraryLab = React.lazy(() => import('./components/shared/UniversalLibrary/UniversalLibraryLab'));
const reviewMatch = window.location.pathname.match(/^\/review\/([A-Za-z0-9_-]+)\/?$/);
const reviewToken = new URLSearchParams(window.location.search).get('t') || '';

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

// A small, non-intrusive bottom toast offering a MANUAL reload when a new build is waiting.
// It never reloads on its own — the user taps Reload when they're ready, or snoozes with "Later"
// (the update also lands by itself whenever every tab is closed). Plain DOM so it works regardless
// of React state. Notes come from the ONE changelog ledger (data/changelog.ts), never a second list.
function showUpdateToast(onReload: () => void) {
  if (document.getElementById('plajah-sw-toast')) return;
  const card = document.createElement('div');
  card.id = 'plajah-sw-toast';
  card.style.cssText = 'position:fixed;bottom:18px;left:50%;transform:translateX(-50%);z-index:2147483647;display:flex;flex-direction:column;gap:0;max-width:min(92vw,400px);border-radius:14px;background:#1b1b24;color:#fff;border:1px solid rgba(255,140,0,0.4);box-shadow:0 8px 30px rgba(0,0,0,.5);font:500 13px system-ui,sans-serif;overflow:hidden';

  // Top row — message + Later (snooze) + Reload. No auto-anything: the viewer decides.
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;align-items:center;gap:10px;padding:11px 14px';
  const msg = document.createElement('span'); msg.textContent = 'A new version of Plajah is ready.';
  msg.style.cssText = 'flex:1;line-height:1.3';
  const later = document.createElement('button'); later.textContent = 'Later';
  later.style.cssText = 'padding:6px 12px;border-radius:7px;border:1px solid rgba(255,255,255,0.16);background:transparent;color:#c9c9d4;font-weight:600;cursor:pointer;white-space:nowrap';
  later.title = 'Keep going — it applies when you next reload, or when every tab is closed.';
  later.onclick = () => card.remove();
  const btn = document.createElement('button'); btn.textContent = 'Reload now';
  btn.style.cssText = 'padding:6px 14px;border-radius:7px;border:none;background:linear-gradient(90deg,#FF8C00,#ffa733);color:#1a1a1a;font-weight:700;cursor:pointer;white-space:nowrap';
  btn.onclick = () => { btn.textContent = 'Updating…'; onReload(); };
  row.append(msg, later, btn);
  card.append(row);

  // Expandable "What's new" — the newest entries from the changelog ledger.
  const notes = CHANGELOG.slice(0, 5).map(e => e.title);
  const version = CHANGELOG[0]?.date;
  if (notes.length) {
    const toggle = document.createElement('button');
    toggle.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%;padding:8px 14px;background:rgba(255,255,255,0.03);border:none;border-top:1px solid rgba(255,255,255,0.07);color:#c9c9d4;font:700 10px system-ui,sans-serif;letter-spacing:.12em;text-transform:uppercase;cursor:pointer';
    const label = document.createElement('span');
    label.textContent = `What’s new${version ? ' · ' + version : ''}`;
    const chevron = document.createElement('span'); chevron.textContent = '▾'; chevron.style.cssText = 'transition:transform .2s;color:#FF8C00';
    toggle.append(label, chevron);

    const body = document.createElement('div');
    body.style.cssText = 'max-height:0;overflow:hidden;transition:max-height .28s ease';
    const ul = document.createElement('ul');
    ul.style.cssText = 'list-style:none;margin:0;padding:4px 16px 14px;display:flex;flex-direction:column;gap:8px';
    notes.forEach(n => {
      const li = document.createElement('li');
      li.style.cssText = 'display:flex;gap:8px;font:500 12px system-ui,sans-serif;color:#d6d6de;line-height:1.4';
      const dot = document.createElement('span'); dot.textContent = '•'; dot.style.cssText = 'color:#FF8C00;font-weight:800;flex:none';
      const txt = document.createElement('span'); txt.textContent = n;
      li.append(dot, txt); ul.append(li);
    });
    body.append(ul);

    let open = false;
    toggle.onclick = () => {
      open = !open;
      body.style.maxHeight = open ? body.scrollHeight + 'px' : '0';
      chevron.style.transform = open ? 'rotate(180deg)' : 'rotate(0)';
    };
    card.append(toggle, body);
  }

  (document.body || document.documentElement).appendChild(card);
}


// ─── Television viewport ──────────────────────────────────────────────────────
//
// A 1920x1080 TV panel at Android density 320 gives the WebView a CSS viewport of only 960px
// — tablet width — which it then stretches 2x across the screen. `theme-big-screen` was scaling
// type UP another 1.25x on top of that, so text landed at roughly 2.5x and a page's worth of
// content no longer fit on a page.
//
// Widening the viewport makes everything proportionally smaller and fits more on screen. 1280
// was still too large in practice; 1600 takes another ~20% off and raises content density,
// which is what a TV wants — a wall of things to browse, not four huge cards. The panel scales
// 1600 -> 1920 (1.2x), and text still reads comfortably from ten feet. Done here rather than in index.html because the decision needs the
// native TV token, which only exists on a television.
(function applyTvViewport() {
  try {
    const ua = navigator.userAgent.toLowerCase();
    const isTv = ua.includes('plajahtv/1') ||
      /smart-?tv|smarttv|googletv|android\s?tv|leanback|aftt|aftmm|aftb|kfapwi|silk|tizen|web0s|webos|roku|bravia|hbbtv/.test(ua);
    if (!isTv) return;
    const el = document.querySelector('meta[name="viewport"]');
    // NO initial-scale. Verified live over CDP: with `initial-scale=1.0` present the WebView
    // pins the layout viewport to the device width (960) and ignores `width` entirely —
    // innerWidth stayed 960 through two deploys. Dropping it, innerWidth becomes 1600 on the
    // same page with no other change.
    if (el) el.setAttribute('content', 'width=1600, user-scalable=no, viewport-fit=cover');
    document.documentElement.classList.add('tv-viewport');
  } catch { /* leave the default viewport */ }
})();

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  // Use 'prompt' mode so we control exactly when the update is applied.
  // autoUpdate would call location.reload() the moment any new deploy lands,
  // which interrupts video, audio, and games with no warning.
  const updateSW = registerSW({
    onNeedRefresh() {
      // A platform update must NEVER yank a viewer out of what they're doing — no silent reloads.
      // Two non-intrusive paths:
      //
      //  • TV / native shell — a D-pad user can't reach a corner toast, and the WebView would
      //    otherwise serve the stale bundle forever (this is how shipped TV fixes failed to reach the
      //    device). So apply the waiting update the next time the app is BACKGROUNDED
      //    (visibilitychange → hidden): the reload happens off-screen while they've stepped away, so
      //    the fix is simply there next time they open it. Zero interruption, and it still lands.
      //
      //  • Desktop / mobile web — show a small "new version ready" prompt with an explicit Reload and
      //    a Later (snooze). The viewer reloads when THEY are ready; it also applies on its own once
      //    every tab is closed.
      //
      // Removed: the old unconditional TV/native reload and the "silently reload if the page loaded
      // <10s ago" desktop path — a returning visitor a few seconds in was still mid-action, and it
      // read as the page spontaneously refreshing.
      let isTvOrNative = false;
      try {
        const ua = navigator.userAgent.toLowerCase();
        isTvOrNative =
          ua.includes('plajahtv/1') ||
          ua.includes('plajah/2.0 android') ||          // the Capacitor shell's appendUserAgent
          /smart-?tv|smarttv|googletv|android\s?tv|leanback|aftt|aftmm|aftb|kfapwi|silk|tizen|web0s|webos|roku|bravia|hbbtv/.test(ua) ||
          (navigator.maxTouchPoints === 0 && /android/.test(ua));
      } catch { /* treat as desktop web */ }

      if (isTvOrNative) {
        // Already backgrounded? Safe to apply now. Otherwise wait for the app to be hidden.
        if (document.visibilityState === 'hidden') { updateSW(true); return; }
        const applyWhenHidden = () => {
          if (document.visibilityState === 'hidden') {
            document.removeEventListener('visibilitychange', applyWhenHidden);
            updateSW(true);
          }
        };
        document.addEventListener('visibilitychange', applyWhenHidden);
        return;
      }

      // Desktop / web: user-driven only, never automatic.
      showUpdateToast(() => updateSW(true));
    },
    onOfflineReady() {
      console.log('[SW] App ready for offline use.');
    },
    onRegisteredSW(_swUrl: string, r: ServiceWorkerRegistration | undefined) {
      // Browsers only check for a new SW on navigation by default. Check once
      // immediately on load so a returning visitor sitting on a stale cached
      // bundle picks up the latest deploy right away (→ silent reload if fresh,
      // else the Reload toast) instead of waiting up to a minute for the poll.
      // Then keep polling so a deploy that lands while the tab stays open is
      // noticed within ~1 min.
      if (r) {
        r.update().catch(() => { /* offline */ });
        setInterval(() => { r.update().catch(() => { /* offline */ }); }, 60_000);
        // Also check the moment the user returns to the tab — long-lived editor
        // sessions (Fabula etc.) otherwise sit on a stale bundle until they notice
        // the toast, which reads as "the fixes didn't ship".
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') r.update().catch(() => { /* offline */ });
        });
      }
    },
  });
} else if (import.meta.env.DEV && 'serviceWorker' in navigator) {
  // Dev self-heal. A service worker left over from a local production build
  // (`npm run build` / `preview`) keeps controlling the page and answers
  // /assets/* from its precache, so the Vite dev server is shadowed — you edit
  // source and the browser shows the last built bundle. Unregister any leftover
  // SW, drop its caches, and reload once (loop-guarded) so dev always reflects
  // live source.
  // Key the decision on whether THIS page is actually controlled by a SW (the stale-shadow
  // condition) rather than a one-shot sessionStorage flag — a single leftover SW can survive one
  // reload, and the old flag then blocked any further clearing, so dev stayed stale forever.
  const controlled = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.getRegistrations().then(async (regs) => {
    await Promise.all(regs.map((r) => r.unregister()));
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
    // Reload only while a SW is still controlling this page (that's what shadows the dev server).
    // After an unregister the next navigation is uncontrolled, so controller becomes null and this
    // stops. Loop-guarded to a few attempts so a wedged unregister can never reload-loop.
    if (controlled) {
      const n = parseInt(sessionStorage.getItem('__sw_dev_reloads') || '0', 10);
      if (n < 4) { sessionStorage.setItem('__sw_dev_reloads', String(n + 1)); location.reload(); }
      else console.warn('[dev] A service worker keeps shadowing the dev server — unregister it manually in DevTools → Application → Service Workers.');
    } else {
      sessionStorage.removeItem('__sw_dev_reloads');
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

// Retire the pre-mount splash (index.html #pj-boot) once React has actually painted.
// Two rAFs: the first lands after the commit, the second after the browser has painted it, so
// the splash is never pulled while the app's own first frame is still blank. The 4s failsafe
// exists because rAF does not fire in a never-painting webview — the same starvation the guard
// in index.html handles — and a splash that outlived the app would be worse than the flash.
function dismissBootSplash(): void {
  const el = document.getElementById('pj-boot');
  if (!el) return;
  const done = () => { el.classList.add('pj-boot-done'); setTimeout(() => el.remove(), 320); };
  requestAnimationFrame(() => requestAnimationFrame(done));
  setTimeout(done, 4000);
}

const search = new URLSearchParams(window.location.search);
const isProgramOut = search.get('programOut') === '1';
const isUlLab = search.get('ullab') === '1';
const isPrompterWindow = search.get('role') === 'prompter';

if (isProgramOut) {
  // External display / video-wall clone — composite only, no platform shell.
  root.render(
    <ErrorBoundary>
        <React.Suspense fallback={<div style={{ width: '100vw', height: '100vh', background: '#000' }} />}>
          <ProgramOutView />
        </React.Suspense>
      </ErrorBoundary>
  );
} else if (isUlLab) {
  // Dev harness for the Universal Library — no platform shell, no auth.
  root.render(
    <ErrorBoundary>
        <React.Suspense fallback={<div style={{ width: '100vw', height: '100vh', background: '#08070C' }} />}>
          <UniversalLibraryLab />
        </React.Suspense>
      </ErrorBoundary>
  );
} else if (reviewMatch && reviewToken) {
  // Account-free external reviewer — standalone, no platform shell, no auth gate.
  root.render(
    <ErrorBoundary>
        <React.Suspense fallback={<div style={{ width: '100vw', height: '100vh', background: '#0b0b10' }} />}>
          <HqReviewPublic shareId={reviewMatch[1]} token={reviewToken} />
        </React.Suspense>
      </ErrorBoundary>
  );
} else if (isPrompterWindow) {
  // Teleprompter talent display — only the scrolling prompter; syncs to the
  // operator over BroadcastChannel. No platform shell (a clean confidence monitor).
  root.render(
    <ErrorBoundary>
        <React.Suspense fallback={<div style={{ width: '100vw', height: '100vh', background: '#000' }} />}>
          <PrompterScreen
            initialScriptTitle="Waiting for script…"
            initialScriptContent={'# [No Script Loaded]\nOpen the Operator Console and select a script to begin.'}
            isStandalone={false}
          />
        </React.Suspense>
      </ErrorBoundary>
  );
} else {
  // NOT wrapped in <React.StrictMode> ON PURPOSE. StrictMode double-invokes effects in DEV, which
  // double-subscribes then tears down every onSnapshot listener (~149 of them). That teardown race
  // reliably trips Firestore's ca9/b815 INTERNAL ASSERTION, and the ErrorBoundary "recovers" by
  // hard-reloading the page — which drops audio mid-song and fails profile loads. Production never
  // double-mounts, so it was rock-solid there; removing StrictMode makes DEV behave like prod (this
  // is a no-op in production builds anyway). Re-add only once the watch-stream assertion is gone
  // (a firebase-js-sdk fix, or every listener routed through services/safeSnapshot).
  root.render(
    <ErrorBoundary>
      <GlobalPlayerProvider>
        <App />
      </GlobalPlayerProvider>
    </ErrorBoundary>
  );
}

dismissBootSplash();
