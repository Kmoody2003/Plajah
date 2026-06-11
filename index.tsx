
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import { GlobalPlayerProvider } from './contexts/GlobalPlayerContext';
// @ts-ignore
import { registerSW } from 'virtual:pwa-register';

// Returns true if any audio or video element is actively playing.
// We also check window.__plajahMediaActive which media components can set
// for cases that don't use HTMLMediaElement (e.g. Web Audio, YouTube iframe API).
function isMediaActive(): boolean {
  if ((window as any).__plajahMediaActive) return true;
  return Array.from(document.querySelectorAll<HTMLMediaElement>('audio, video'))
    .some(el => !el.paused && !el.ended && el.readyState > 2);
}

if ('serviceWorker' in navigator) {
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
      // Mid-session: leave the waiting SW alone. It will activate automatically
      // the next time the user opens a fresh tab (all old tabs closed). No
      // interruption to whatever they are doing now.
    },
    onOfflineReady() {
      console.log('[SW] App ready for offline use.');
    },
  });
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
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <GlobalPlayerProvider>
        <App />
      </GlobalPlayerProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
