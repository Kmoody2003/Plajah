import { useEffect, useState, useCallback, useRef } from 'react';
import { usePlatform } from '../hooks/usePlatform';
import {
  findInDirection,
  focusTVElement,
  getFocusables,
  getFocusableElements,
  invalidateFocusables,
  type Dir,
  makeCardsFocusable,
} from '../hooks/useDpadNavigation';
import { isShellFocused } from '../hooks/useTvShellFocus';

// ── Modal detection (for focus-trapping + Back-to-close) ──────────────────────
// A "modal scope" is an explicit dialog, or a heuristic full-screen fixed overlay
// with a high z-index (how nearly every modal in this app is built). Spatial nav
// is confined to it while open, and the remote Back button closes it.
const isOverlay = (el: HTMLElement): boolean => {
  const cs = getComputedStyle(el);
  if (cs.position !== 'fixed') return false;
  const z = parseInt(cs.zIndex || '0', 10) || 0;
  if (z < 40) return false;
  const r = el.getBoundingClientRect();
  const vw = window.innerWidth || document.documentElement.clientWidth || 0;
  const vh = window.innerHeight || document.documentElement.clientHeight || 0;
  // A modal backdrop covers most of the viewport (distinguishes it from the short
  // full-width transport bar / toasts). If the viewport can't be read, fall back
  // to an absolute size that a real backdrop clears but a bar/toast doesn't.
  if (vw > 0 && vh > 0) return r.width > vw * 0.55 && r.height > vh * 0.55;
  return r.width >= 240 && r.height >= 240;
};

/** The modal container the element sits inside, if any (walks up to the nearest overlay). */
const modalScopeOf = (el: HTMLElement | null): HTMLElement | null => {
  if (!el) return null;
  const dlg = el.closest('[role="dialog"],[aria-modal="true"]') as HTMLElement | null;
  if (dlg) return dlg;
  let node: HTMLElement | null = el;
  while (node && node !== document.body) {
    if (isOverlay(node)) return node;
    node = node.parentElement;
  }
  return null;
};

/** The top-most open modal overlay on the page (highest z-index), or null. */
const topScope = (): HTMLElement | null => {
  let best: HTMLElement | null = null;
  let bestZ = 39;
  const dialogs = document.querySelectorAll<HTMLElement>('[role="dialog"],[aria-modal="true"]');
  for (const d of dialogs) {
    const z = parseInt(getComputedStyle(d).zIndex || '0', 10) || 0;
    if (z >= bestZ && d.getClientRects().length) { bestZ = z; best = d; }
  }
  if (best) return best;
  for (const f of getFocusables()) {
    const scope = modalScopeOf(f);
    if (scope) {
      const z = parseInt(getComputedStyle(scope).zIndex || '0', 10) || 0;
      if (z >= bestZ) { bestZ = z; best = scope; }
    }
  }
  return best;
};

/**
 * Dismiss a modal with a remote.
 *
 * Escalates, because no single strategy covers the app's modals. Observed on the TCL: the
 * Plajah+ paywall's close control is an icon-only button with no text, no aria-label and no
 * title, and the modal doesn't listen for Escape — so the original selector found nothing, the
 * Escape dispatch did nothing, and Back left the viewer stuck in an overlay they could not
 * dismiss. That is a harder trap than the one it replaced.
 *
 * The last step is the safety net: if the overlay is still up after everything else, leave the
 * screen entirely. Being sent back a page is a bad outcome; being unable to leave is a broken TV.
 */
/**
 * Does a screen on this page own the arrows?
 *
 * `t.closest('[data-tv-capture]')` alone is not enough. A screen that tracks focus in state
 * rather than in the DOM — like the Chora TV view — has no focusable nodes of its own, so the
 * event target is whatever this layer last focused. Two navigation systems on one keypress is
 * precisely the unpredictability the capture zone exists to prevent.
 *
 * Testing for a body-level target used to be the stand-in for "the screen is handling this in
 * state". It is not sufficient: entering Chora from the tab bar leaves real DOM focus on the tab
 * button, which is neither inside the capture zone nor body-level — so this layer kept the arrows,
 * found nothing focusable below (the capture screens expose none), and the viewer was stuck in the
 * tab bar. Taleo escaped that because it is an ordinary view full of real buttons.
 *
 * The shell-focus store is already the designed arbiter of who owns the remote, so ask it: a
 * mounted capture screen owns the arrows unless the shell has explicitly claimed them back
 * (useTvGrid's onExitTop, i.e. the viewer arrowed up out of the grid).
 */
const inCaptureZone = (t: HTMLElement | null): boolean => {
  if (t?.closest('[data-tv-capture]')) return true;
  if (!document.querySelector('[data-tv-capture]')) return false;
  return !isShellFocused();
};

const closeModal = (modal: HTMLElement): void => {
  const explicit = modal.querySelector<HTMLElement>(
    '[data-tv-close],button[aria-label*="close" i],button[title*="close" i],button[title*="dismiss" i]'
  );
  if (explicit) { explicit.click(); return; }

  // Icon-only button in the modal's top-right — the near-universal close affordance, and the
  // only thing identifying the Plajah+ control.
  const box = modal.getBoundingClientRect();
  const iconOnly = Array.from(modal.querySelectorAll<HTMLElement>('button')).find(b => {
    if ((b.textContent || '').trim().length > 0) return false;   // has a label: not a close X
    const r = b.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return false;
    if (r.width > 96 || r.height > 96) return false;             // a big blank button isn't an X
    return r.top < box.top + box.height * 0.25 && r.right > box.left + box.width * 0.6;
  });
  if (iconOnly) { iconOnly.click(); return; }

  // Modals that only listen for Escape, plus any backdrop handler.
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

  // Safety net: still there a beat later? Leave the screen rather than trap the viewer.
  window.setTimeout(() => {
    if (modal.isConnected && modal.getClientRects().length > 0) {
      try { window.history.back(); } catch { /* nothing else to try */ }
    }
  }, 250);
};

/** True while the app still has an in-app view to return to (App.tsx pushes {view} per screen). */
const canGoBackInApp = (): boolean => window.history.length > 1 && !!window.history.state;

// Long-press on a remote fires the browser's native key-repeat, which on a TV overshoots by
// several items before the user's thumb lifts. Gate repeats to a deliberate ramp instead:
// slow for the first few, then faster, never faster than ~10/sec.
const repeatInterval = (run: number): number => (run < 2 ? 300 : run < 6 ? 170 : 100);

/**
 * Global D-pad / 10-foot navigation layer.
 *
 * Renders nothing but an exit confirmation. When active it:
 *  - adds a `tv-nav` class to <html> (drives the strong focus-ring CSS),
 *  - moves DOM focus spatially with the arrow keys (auto-discovering native
 *    focusables — no per-element tagging required),
 *  - guarantees something is always focused, so the remote can never appear frozen,
 *  - scrolls the focused element clear of the TV's overscan edges,
 *  - activates custom (non-native) focusables on Enter / DPAD_CENTER,
 *  - resolves Back against a strict layer stack (modal → view → exit confirm).
 *
 * It is deliberately *yielding*: it never touches a key that targets a text field, or that
 * lands inside a `[data-tv-capture]` zone (readers / editors that own the arrows). So it is
 * safe to mount app-wide without fighting the surfaces that manage their own keys.
 *
 * Activation: real D-pad devices (usePlatform().hasDpad), or `?tv=1` in the URL,
 * or localStorage `plajah:tvnav = '1'` (handy for testing on a desktop). A global
 * `window.__tvNav(bool)` toggle is exposed for the same reason.
 */
const TVNavigationLayer = () => {
  const platform = usePlatform();

  const initialActive = () => {
    if (platform.hasDpad) return true;
    try {
      const p = new URLSearchParams(window.location.search);
      if (p.get('tv') === '1') return true;
      if (localStorage.getItem('plajah:tvnav') === '1') return true;
    } catch { /* ignore */ }
    return false;
  };

  const [active, setActive] = useState<boolean>(initialActive);
  const [confirmExit, setConfirmExit] = useState(false);

  // Last element that genuinely held focus. This is the anchor for the focus invariant: when a
  // re-render destroys the focused node, React drops focus to <body> and every further keypress
  // is a no-op — the "TV is frozen" report. Tracked via focusin (cheap) rather than polling.
  const lastFocusedRef = useRef<HTMLElement | null>(null);
  // Guards against our own `plajah:hardware-back` dispatch re-entering our own listener.
  const dispatchingBackRef = useRef(false);
  const repeatRunRef = useRef(0);
  const lastMoveAtRef = useRef(0);

  // Expose a manual toggle for testing / a future settings switch.
  useEffect(() => {
    (window as any).__tvNav = (on: boolean) => {
      try { localStorage.setItem('plajah:tvnav', on ? '1' : '0'); } catch { /* ignore */ }
      setActive(on);
    };
    return () => { delete (window as any).__tvNav; };
  }, []);

  // Promote clickable-but-unfocusable cards so the D-pad can reach them, and keep doing it as
  // content streams in. Debounced: a rail of album art mounts in bursts, and re-walking the DOM
  // per mutation would cost more than the navigation it enables.
  useEffect(() => {
    if (!active) return;
    let raf = 0;
    const promote = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        // A capture screen navigates from its own model, so nothing here can help it — and this
        // walk measures every image in the document, which is a forced layout per mutation burst
        // on exactly the content-heavy screens (Chora, Reello) that can least afford it.
        if (document.querySelector('[data-tv-capture]')) return;
        try { makeCardsFocusable(document); invalidateFocusables(); } catch { /* ignore */ }
      });
    };
    promote();
    const mo = new MutationObserver(promote);
    mo.observe(document.body, { childList: true, subtree: true });
    return () => { mo.disconnect(); cancelAnimationFrame(raf); };
  }, [active]);

  // Toggle the CSS hook on <html>.
  useEffect(() => {
    const root = document.documentElement;
    if (active) root.classList.add('tv-nav');
    else root.classList.remove('tv-nav');
    return () => root.classList.remove('tv-nav');
  }, [active]);

  // Auto-enable on the FIRST remote key. TV detection (UA/touch heuristics) is unreliable on
  // Android TV / Fire TV WebViews, so a device can boot with D-pad nav off and feel frozen. A
  // real remote sends arrow/OK keydowns that a phone or a mouse-driven desktop never would, so
  // treat the first such key as proof this is a leanback device — but ONLY in a native app or an
  // already-detected TV, so desktop keyboard users are never hijacked.
  useEffect(() => {
    if (active) return;
    if (!(platform.isNative || platform.isTV)) return;
    const onFirstKey = (e: KeyboardEvent) => {
      const kc = e.keyCode || e.which;
      const isDpad =
        e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight' ||
        e.key === 'Enter' || e.key === 'Select' ||
        kc === 37 || kc === 38 || kc === 39 || kc === 40 || kc === 13 || kc === 23;
      if (isDpad) setActive(true);
    };
    window.addEventListener('keydown', onFirstKey, true);
    return () => window.removeEventListener('keydown', onFirstKey, true);
  }, [active, platform.isNative, platform.isTV]);

  // Remember the real focus owner so it can be restored after a re-render.
  useEffect(() => {
    if (!active) return;
    const onFocusIn = (e: FocusEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && t !== document.body) lastFocusedRef.current = t;
    };
    window.addEventListener('focusin', onFocusIn, true);
    return () => window.removeEventListener('focusin', onFocusIn, true);
  }, [active]);

  /**
   * The focus invariant. Returns the element focus should move FROM, or null when the screen
   * has nothing focusable at all. `seeded` means we had to re-establish focus from scratch, in
   * which case the caller should consume the keypress: the user sees the ring reappear rather
   * than focus teleporting from wherever it silently was.
   */
  const ensureFocus = useCallback((): { el: HTMLElement | null; seeded: boolean } => {
    // Same reasoning as seedFocus: never impose DOM focus on a screen that manages its own.
    if (document.querySelector('[data-tv-capture]')) return { el: null, seeded: false };
    const el = document.activeElement as HTMLElement | null;
    if (el && el !== document.body && el.isConnected) return { el, seeded: false };

    // Focus was lost (re-render destroyed the node, a modal closed, a route changed).
    const last = lastFocusedRef.current;
    if (last && last.isConnected && last.getClientRects().length > 0) {
      focusTVElement(last);
      return { el: last, seeded: false }; // still the same element — the move can proceed
    }

    const scope = topScope();
    const candidates = getFocusables(scope ?? document);
    // Skip text inputs when choosing where to put focus. Landing a remote in a search box is
    // never what the viewer wanted, and before the escape logic above it was unrecoverable.
    const first = candidates.find(el => {
      const tg = el.tagName;
      return tg !== 'INPUT' && tg !== 'TEXTAREA' && !el.isContentEditable;
    }) ?? candidates[0];
    if (first) {
      focusTVElement(first);
      return { el: first, seeded: true };
    }
    return { el: null, seeded: true };
  }, []);

  const move = useCallback((direction: Dir) => {
    const { el: origin, seeded } = ensureFocus();
    if (!origin || seeded) return;

    // Focus-trap: while focus is INSIDE a modal, confine navigation to its focusables so the
    // remote can't wander onto the page behind it. (We only scope when already inside — never
    // yank focus around the page.)
    const scope = modalScopeOf(origin);
    const candidates = scope ? getFocusableElements(scope) : getFocusableElements();
    const target = findInDirection(origin, direction, candidates)
      || (scope ? getFocusables(scope)[0] ?? null : null); // wrap to the modal's first item at an edge
    if (target && target !== origin) focusTVElement(target);
  }, [ensureFocus]);

  /**
   * Back resolves against a strict layer stack, so the same press always means the same thing:
   *   1. close the top-most modal/overlay,
   *   2. let any other overlay that listens for `plajah:hardware-back` absorb it,
   *   3. go to the previous in-app view,
   *   4. at the root, ASK before leaving — a remote Back at root killing the app outright is
   *      the single most jarring TV behaviour.
   * `fromNative` skips step 2 because useHardwareBack has already dispatched that event.
   */
  const handleBack = useCallback((fromNative: boolean): boolean => {
    const modal = modalScopeOf(document.activeElement as HTMLElement) || topScope();
    if (modal) { closeModal(modal); return true; }

    if (!fromNative) {
      dispatchingBackRef.current = true;
      const consumed = !window.dispatchEvent(new CustomEvent('plajah:hardware-back', { cancelable: true }));
      dispatchingBackRef.current = false;
      if (consumed) return true;
    }

    if (canGoBackInApp()) { window.history.back(); return true; }

    setConfirmExit(true);
    return true;
  }, []);

  // Native (Capacitor) back button. useHardwareBack owns the plumbing and would otherwise
  // exitApp() straight from the root; we consume the event for the two cases it can't see —
  // an open modal, and the root-screen confirmation.
  useEffect(() => {
    if (!active) return;
    const onNativeBack = (e: Event) => {
      if (dispatchingBackRef.current) return; // our own dispatch — don't recurse
      const modal = modalScopeOf(document.activeElement as HTMLElement) || topScope();
      if (modal) { e.preventDefault(); closeModal(modal); return; }
      if (!canGoBackInApp()) { e.preventDefault(); setConfirmExit(true); }
      // else: fall through and let useHardwareBack run history.back()
    };
    window.addEventListener('plajah:hardware-back', onNativeBack);
    return () => window.removeEventListener('plajah:hardware-back', onNativeBack);
  }, [active]);

  useEffect(() => {
    if (!active) return;

    // Grab an initial focus so there's always something to move from, and so a
    // remote can act on a freshly-loaded / just-changed screen. Retries because
    // the page (and modals) mount asynchronously — otherwise a slow route could
    // leave the D-pad with nothing to focus.
    let seedTimer = 0;
    let tries = 0;
    const seedFocus = () => {
      // A capture screen owns its own focus and deliberately keeps activeElement on <body>.
      // Seeding here would yank DOM focus onto its first card and drag the ring back there
      // mid-navigation — the "something keeps selecting the first album" behaviour.
      if (document.querySelector('[data-tv-capture]')) return;
      const el = document.activeElement as HTMLElement | null;
      const scope = topScope();
      if (el && el !== document.body && el.isConnected && !(scope && !scope.contains(el))) return;
      const target = getFocusables(scope ?? document)[0];
      if (target) { focusTVElement(target); return; }
      if (tries++ < 24) seedTimer = window.setTimeout(seedFocus, 250); // keep trying as content loads
    };
    seedTimer = window.setTimeout(seedFocus, 300);

    const reseedSoon = (delay: number) => {
      tries = 0;
      window.clearTimeout(seedTimer);
      seedTimer = window.setTimeout(seedFocus, delay);
    };

    // The DOM changed: the cached focusable set is stale, and the focused node may have been
    // destroyed by the re-render that caused this. Both checks are deliberately cheap — a flag
    // flip and an activeElement comparison — because this app mutates constantly and this
    // observer runs on a TV SoC.
    let scheduled = false;
    const observer = new MutationObserver(() => {
      invalidateFocusables();
      if (scheduled) return;
      scheduled = true;
      window.setTimeout(() => {
        scheduled = false;
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body || !el.isConnected) reseedSoon(60);
      }, 200);
    });
    observer.observe(document.body, { childList: true, subtree: true });

    // A route change swaps the whole screen; re-seed rather than waiting for a mutation tick.
    const onRoute = () => { invalidateFocusables(); lastFocusedRef.current = null; reseedSoon(120); };
    window.addEventListener('popstate', onRoute);

    // Capture phase: we run BEFORE the app's own global key handlers so spatial
    // nav can claim the arrows (many surfaces preventDefault arrows for their own
    // reasons). We deliberately do NOT bail on `defaultPrevented` here — instead we
    // yield only for text fields and explicit `[data-tv-capture]` zones (readers /
    // editors that own the arrows), then stop propagation for keys we consume so
    // the app's handlers don't double-act.
    const onKey = (e: KeyboardEvent) => {
      const t = e.target instanceof HTMLElement ? e.target : null;
      const tag = t?.tagName;
      const inField =
        tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || !!t?.isContentEditable;

      // Some Android TV / Fire TV WebViews deliver the D-pad as keyCodes without a
      // standard `key` (or a vendor `key`), so fall back to keyCodes. 19-22 are the
      // Android DPAD codes; 37-40 are what most WebView builds actually report.
      const kc = e.keyCode || e.which;
      const dir: Dir | null =
        (e.key === 'ArrowUp' || kc === 38 || kc === 19) ? 'up' :
        (e.key === 'ArrowDown' || kc === 40 || kc === 20) ? 'down' :
        (e.key === 'ArrowLeft' || kc === 37 || kc === 21) ? 'left' :
        (e.key === 'ArrowRight' || kc === 39 || kc === 22) ? 'right' : null;

      if (dir) {
        // A text field must never be a one-way door. `inField` used to bail for BOTH arrows and
        // OK, so once focus landed in a search box — which is exactly what happened on the TCL —
        // neither key did anything and the viewer was stuck with no way out and no way to select
        // anything. On a TV, up/down always leave the field; left/right only move the caret while
        // there is still text to move through, and leave once the caret reaches the edge.
        if (inField) {
          const input = t as HTMLInputElement | null;
          const isText = tag === 'INPUT' || tag === 'TEXTAREA';
          const caret = isText ? (input?.selectionStart ?? 0) : 0;
          const len = isText ? (input?.value?.length ?? 0) : 0;
          const atStart = caret <= 0;
          const atEnd = caret >= len;
          const escaping =
            dir === 'up' || dir === 'down' ||
            (dir === 'left' && atStart) ||
            (dir === 'right' && atEnd);
          if (!escaping) return;                      // still editing — let the caret move
          try { input?.blur(); } catch { /* ignore */ }
          // fall through to move(): focus leaves the field in the pressed direction
        }
        if (inCaptureZone(t)) return;                 // that screen owns the arrows
        e.preventDefault();
        e.stopImmediatePropagation();

        // Throttle held-down repeats so a long press steps deliberately instead of
        // flying past the target at the WebView's native repeat rate.
        const now = Date.now();
        if (e.repeat) {
          if (now - lastMoveAtRef.current < repeatInterval(repeatRunRef.current)) return;
          repeatRunRef.current++;
        } else {
          repeatRunRef.current = 0;
        }
        lastMoveAtRef.current = now;
        move(dir);
        return;
      }

      // OK / center button: 'Enter' (13), KEYCODE_DPAD_CENTER (23), or vendor 'Select'.
      const isOk = e.key === 'Enter' || e.key === 'Select' || kc === 13 || kc === 23;
      if (isOk) {
        // Same rule for OK: a screen that owns its arrows owns its selection.
        if (inCaptureZone(t)) return;
        // In a field, OK means "start typing" — surface the system keyboard rather than doing
        // nothing. Enter (13) still submits, which is what a search box expects.
        if (inField) {
          if (kc === 23 || e.key === 'Select') {
            e.preventDefault();
            e.stopImmediatePropagation();
            try { (t as HTMLElement)?.focus(); (t as HTMLElement)?.click(); } catch { /* ignore */ }
          }
          return;
        }
        const { el, seeded } = ensureFocus();
        if (!el || seeded) { e.preventDefault(); e.stopImmediatePropagation(); return; }
        const nativeActivates = ['A', 'BUTTON', 'INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName);
        // Native controls fire their own click on a real Enter. But DPAD_CENTER (23) and
        // vendor 'Select' often DON'T auto-activate in a WebView, so synth-click them —
        // that was the "can navigate but can't select / sign in" failure on TV.
        if (!nativeActivates || kc === 23 || e.key === 'Select') {
          e.preventDefault();
          e.stopImmediatePropagation();
          el.click();
        }
        return;
      }

      // Back: Android KEYCODE_BACK (4), Tizen/desktop names, Apple TV Menu.
      const isBack =
        kc === 4 || e.key === 'Backspace' || e.key === 'XF86Back' ||
        e.key === 'GoBack' || e.key === 'BrowserBack' || e.key === 'Menu';
      if (isBack && !inField) {
        e.preventDefault();
        e.stopImmediatePropagation();
        handleBack(false);
      }
    };

    window.addEventListener('keydown', onKey, true);
    return () => {
      window.clearTimeout(seedTimer);
      observer.disconnect();
      window.removeEventListener('popstate', onRoute);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [active, move, ensureFocus, handleBack]);

  const doExit = useCallback(() => {
    setConfirmExit(false);
    // Kept as a best-effort chain: the native exit on device, and the legacy `tv:back` event
    // for any surface that still listens for it on the TV web builds.
    import('@capacitor/app')
      .then(({ App }) => App.exitApp())
      .catch(() => { window.dispatchEvent(new CustomEvent('tv:back')); });
  }, []);

  if (!active || !confirmExit) return null;

  // Rendered here rather than in App.tsx so the layer owns its whole Back contract. role=dialog
  // + a viewport-covering fixed overlay is exactly what modalScopeOf detects, so the D-pad is
  // trapped inside it and Back cancels it, with no special-casing.
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Exit Plajah"
      className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-sm flex items-center justify-center p-8"
    >
      <div className="bg-neutral-900 border border-white/15 rounded-2xl p-8 max-w-lg w-full text-center shadow-2xl">
        <h2 className="text-2xl font-semibold text-white mb-2">Exit Plajah?</h2>
        <p className="text-neutral-400 mb-8">You're at the home screen. Close the app?</p>
        <div className="flex gap-4 justify-center">
          <button
            data-tv-close
            autoFocus
            onClick={() => setConfirmExit(false)}
            className="px-8 py-3 rounded-xl bg-white/10 text-white font-medium hover:bg-white/20 focus:bg-white/20"
          >
            Stay
          </button>
          <button
            onClick={doExit}
            className="px-8 py-3 rounded-xl bg-red-600 text-white font-medium hover:bg-red-500 focus:bg-red-500"
          >
            Exit
          </button>
        </div>
      </div>
    </div>
  );
};

export default TVNavigationLayer;
