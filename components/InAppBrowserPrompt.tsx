// InAppBrowserPrompt — nudge users out of embedded WebViews (the Google app, Facebook,
// Instagram, etc.) into real Chrome, where Plajah actually works well.
//
// Some phones (e.g. a Galaxy A54 opening a link from the Google Search app) render the site
// in an in-app WebView instead of Chrome. Those embedded browsers are older/quirkier and the
// app can behave badly (unresponsive touches, broken media). This shows a dismissible prompt
// with a one-tap "Open in Chrome" that fires an Android intent targeting Chrome specifically.
//
// It NEVER shows inside the Plajah native app (Capacitor is also a WebView) or on a real
// standalone browser — only genuine in-app/embedded WebViews on Android (where the Chrome
// intent works).

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Chrome, X } from 'lucide-react';

const DISMISS_KEY = 'plajah:iab-dismissed-until';
const DISMISS_MS = 14 * 24 * 60 * 60 * 1000; // snooze 14 days after dismiss

/** True only for a genuine embedded/in-app WebView on Android (not the Plajah app, not Chrome). */
export function isInAppBrowser(): boolean {
  if (typeof navigator === 'undefined' || typeof window === 'undefined') return false;
  const ua = navigator.userAgent || '';
  // Never inside the Plajah native app (Capacitor is a WebView too) or on the TV build.
  if ((window as any).Capacitor || /Plajah\/|PlajahTV/i.test(ua)) return false;
  // The Chrome intent is Android-only; iOS in-app browsers can't be redirected this way.
  if (!/Android/i.test(ua)) return false;
  const isAndroidWebView = /;\s*wv\)/i.test(ua);                 // generic Android WebView marker
  const isGoogleApp = /\bGSA\//i.test(ua);                        // Google Search app
  const isSocialInApp = /FBAN|FBAV|FB_IAB|Instagram|Line\/|MicroMessenger|Snapchat|Pinterest|TikTok|Twitter/i.test(ua);
  return isAndroidWebView || isGoogleApp || isSocialInApp;
}

const InAppBrowserPrompt: React.FC = () => {
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      const until = Number(localStorage.getItem(DISMISS_KEY) || 0);
      if (Date.now() < until) return;
    } catch { /* private mode — just proceed */ }
    if (isInAppBrowser()) setShow(true);
  }, []);

  if (!show) return null;

  const dismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now() + DISMISS_MS)); } catch { /* */ }
    setShow(false);
  };

  const openInChrome = () => {
    const bare = window.location.href.replace(/^https?:\/\//, '');
    // Android intent targeting Chrome specifically. If Chrome isn't installed nothing happens
    // and the user can dismiss; that's an acceptable fallback for a best-effort nudge.
    try { window.location.href = `intent://${bare}#Intent;scheme=https;package=com.android.chrome;end`; } catch { /* */ }
  };

  const node = (
    <div
      style={{ paddingTop: 'max(10px, env(safe-area-inset-top))' }}
      className="fixed top-0 inset-x-0 z-[2147483000] px-3 pointer-events-none"
    >
      <div className="pointer-events-auto mx-auto max-w-md flex items-center gap-3 rounded-2xl px-4 py-3 bg-[#111318]/95 backdrop-blur-xl border border-white/12 shadow-[0_18px_50px_-12px_rgba(0,0,0,0.7)]">
        <div className="w-9 h-9 shrink-0 rounded-xl bg-white/8 grid place-items-center">
          <Chrome size={19} className="text-white/85" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-black text-white leading-tight">Open in Chrome</p>
          <p className="text-[11px] text-white/55 leading-tight mt-0.5">You're in an in-app browser — Plajah runs best in Chrome.</p>
        </div>
        <button
          onClick={openInChrome}
          className="shrink-0 px-3 py-2 rounded-xl bg-small-orange text-white text-[11px] font-black uppercase tracking-wide active:scale-95 transition-transform"
        >
          Open
        </button>
        <button onClick={dismiss} aria-label="Dismiss" className="shrink-0 p-1.5 rounded-lg text-white/35 hover:text-white hover:bg-white/8 transition-colors">
          <X size={16} />
        </button>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(node, document.body) : node;
};

export default InAppBrowserPrompt;
