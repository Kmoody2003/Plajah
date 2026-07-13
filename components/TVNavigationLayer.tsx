import { useEffect, useState, useCallback } from 'react';
import { usePlatform } from '../hooks/usePlatform';
import { findInDirection, getFocusables } from '../hooks/useDpadNavigation';

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

const closeModal = (modal: HTMLElement): void => {
  const closeBtn = modal.querySelector<HTMLElement>(
    '[data-tv-close],button[aria-label*="close" i],button[title*="close" i],button[title*="dismiss" i]'
  );
  if (closeBtn) closeBtn.click();
  // Also fire Escape so modals that only listen for it (and any backdrop handlers) close too.
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
};

/**
 * Global D-pad / 10-foot navigation layer.
 *
 * Renders nothing. When active it:
 *  - adds a `tv-nav` class to <html> (drives the strong focus-ring CSS),
 *  - moves DOM focus spatially with the arrow keys (auto-discovering native
 *    focusables — no per-element tagging required),
 *  - activates custom (non-native) focusables on Enter,
 *  - emits a `tv:back` window event on the remote Back button.
 *
 * It is deliberately *yielding*: it never touches a key that a component already
 * handled (`defaultPrevented`), that targets a text field, or that lands inside a
 * `[data-tv-capture]` zone (readers / editors that own the arrows). So it is safe
 * to mount app-wide without fighting the surfaces that manage their own keys.
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

  // Expose a manual toggle for testing / a future settings switch.
  useEffect(() => {
    (window as any).__tvNav = (on: boolean) => {
      try { localStorage.setItem('plajah:tvnav', on ? '1' : '0'); } catch { /* ignore */ }
      setActive(on);
    };
    return () => { delete (window as any).__tvNav; };
  }, []);

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

  const move = useCallback((direction: 'up' | 'down' | 'left' | 'right') => {
    const activeEl = document.activeElement as HTMLElement | null;
    const rootedActive = activeEl && activeEl !== document.body ? activeEl : null;
    // Focus-trap: while focus is INSIDE a modal, confine navigation to its
    // focusables so the remote can't wander onto the page behind it. (We only
    // scope when already inside — never yank focus around the page.)
    const scope = modalScopeOf(rootedActive);
    const candidates = scope ? getFocusables(scope) : getFocusables();
    const target = findInDirection(rootedActive, direction, candidates)
      || (scope ? candidates[0] ?? null : null); // wrap to the modal's first item at an edge
    if (target) {
      target.focus();
      target.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
    }
  }, []);

  useEffect(() => {
    if (!active) return;

    // Grab an initial focus so there's always something to move from, and so a
    // remote can act on a freshly-loaded / just-changed screen. Retries because
    // the page (and modals) mount asynchronously — otherwise a slow route could
    // leave the D-pad with nothing to focus. Scrolls the target into view in case
    // it's below the fold (e.g. the landing page's sign-in buttons).
    let seedTimer = 0;
    let tries = 0;
    const seedFocus = () => {
      const el = document.activeElement as HTMLElement | null;
      // If a modal opened while focus sat on the page behind it, pull focus in.
      const scope = topScope();
      if (el && el !== document.body && !(scope && !scope.contains(el))) return; // already focused in the right place
      const target = getFocusables(scope ?? document)[0];
      if (target) {
        target.focus();
        target.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
        return;
      }
      if (tries++ < 24) seedTimer = window.setTimeout(seedFocus, 250); // keep trying as content loads
    };
    seedTimer = window.setTimeout(seedFocus, 300);

    // Re-seed when focus is fully lost (route change unmounts the focused element)
    // so the remote never gets stuck with nothing focused. Kept cheap: the only
    // work per debounced tick is an activeElement check; the (heavier) seedFocus —
    // which prefers an open modal — runs only when focus has actually dropped to
    // <body>. This deliberately does NOT yank focus into a modal that opens while
    // the page still holds focus (that risks churn on this mutation-heavy app);
    // the modal's buttons are still reachable by arrow, and Back closes it.
    let reseedScheduled = false;
    const reseedObserver = new MutationObserver(() => {
      if (reseedScheduled) return;
      reseedScheduled = true;
      window.setTimeout(() => {
        reseedScheduled = false;
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body) {
          tries = 0;
          window.clearTimeout(seedTimer);
          seedTimer = window.setTimeout(seedFocus, 60);
        }
      }, 200);
    });
    reseedObserver.observe(document.body, { childList: true, subtree: true });

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
      // standard `key` (or a vendor `key`), so fall back to keyCode 37–40.
      const kc = e.keyCode || e.which;
      const dir =
        (e.key === 'ArrowUp' || kc === 38) ? 'up' :
        (e.key === 'ArrowDown' || kc === 40) ? 'down' :
        (e.key === 'ArrowLeft' || kc === 37) ? 'left' :
        (e.key === 'ArrowRight' || kc === 39) ? 'right' : null;

      if (dir) {
        if (inField) return;                          // arrows move the caret / adjust value
        if (t?.closest('[data-tv-capture]')) return;  // reader/editor owns the arrows
        e.preventDefault();
        e.stopImmediatePropagation();
        move(dir);
        return;
      }

      // OK / center button: 'Enter' (13), KEYCODE_DPAD_CENTER (23), or vendor 'Select'.
      const isOk = e.key === 'Enter' || e.key === 'Select' || kc === 13 || kc === 23;
      if (isOk) {
        if (inField) return;
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body) return;
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

      if ((e.key === 'Backspace' || e.key === 'XF86Back' || e.key === 'Menu') && !inField) {
        e.preventDefault();
        e.stopImmediatePropagation();
        // Back closes an open modal first (so the remote can dismiss the popup that
        // was previously un-exitable); otherwise it's an app-level "back".
        const modal = modalScopeOf(document.activeElement as HTMLElement) || topScope();
        if (modal) closeModal(modal);
        else window.dispatchEvent(new CustomEvent('tv:back'));
      }
    };

    window.addEventListener('keydown', onKey, true);
    return () => {
      window.clearTimeout(seedTimer);
      reseedObserver.disconnect();
      window.removeEventListener('keydown', onKey, true);
    };
  }, [active, move]);

  return null;
};

export default TVNavigationLayer;
