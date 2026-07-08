import { useEffect, useState, useCallback } from 'react';
import { usePlatform } from '../hooks/usePlatform';
import { findInDirection, getFocusables } from '../hooks/useDpadNavigation';

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

  const move = useCallback((direction: 'up' | 'down' | 'left' | 'right') => {
    const activeEl = document.activeElement as HTMLElement | null;
    const rootedActive = activeEl && activeEl !== document.body ? activeEl : null;
    const target = findInDirection(rootedActive, direction);
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
      if (el && el !== document.body) return; // something is already focused — done
      const focusables = getFocusables();
      // Prefer a focusable inside the top-most overlay/dialog if one is open, so a
      // popup that appears over the page grabs focus instead of the page behind it.
      const inDialog = focusables.filter((f) => f.closest('[role="dialog"],[aria-modal="true"]'));
      const target = (inDialog.length ? inDialog : focusables)[0];
      if (target) {
        target.focus();
        target.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
        return;
      }
      if (tries++ < 24) seedTimer = window.setTimeout(seedFocus, 250); // keep trying as content loads
    };
    seedTimer = window.setTimeout(seedFocus, 300);

    // Re-seed whenever the DOM changes enough that focus was lost (route change,
    // modal open/close) — keeps the remote from getting "stuck" with no focus.
    const reseedObserver = new MutationObserver(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) { tries = 0; window.clearTimeout(seedTimer); seedTimer = window.setTimeout(seedFocus, 120); }
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

      const dir =
        e.key === 'ArrowUp' ? 'up' :
        e.key === 'ArrowDown' ? 'down' :
        e.key === 'ArrowLeft' ? 'left' :
        e.key === 'ArrowRight' ? 'right' : null;

      if (dir) {
        if (inField) return;                          // arrows move the caret / adjust value
        if (t?.closest('[data-tv-capture]')) return;  // reader/editor owns the arrows
        e.preventDefault();
        e.stopImmediatePropagation();
        move(dir);
        return;
      }

      if (e.key === 'Enter') {
        if (inField) return;
        const el = document.activeElement as HTMLElement | null;
        // Native controls already activate on Enter; only synth-activate custom ones.
        if (el && !['A', 'BUTTON', 'INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)) {
          e.preventDefault();
          el.click();
        }
        return;
      }

      if ((e.key === 'Backspace' || e.key === 'XF86Back' || e.key === 'Menu') && !inField) {
        e.preventDefault();
        e.stopImmediatePropagation();
        window.dispatchEvent(new CustomEvent('tv:back'));
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
