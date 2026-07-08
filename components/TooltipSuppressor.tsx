import { useEffect } from 'react';
import { areTooltipsOff, TOOLTIPS_EVENT } from '../lib/tooltipPref';

/**
 * Renders nothing. When tooltips are turned off (see lib/tooltipPref), it strips
 * every `title` attribute in the document — stashing it in `data-title` — and
 * keeps stripping newly-added ones via a MutationObserver, so native tooltips
 * never pop (helpful on touch/WebView where a long-press surfaces them). Turning
 * tooltips back on restores the stashed titles and disconnects the observer.
 */
const TooltipSuppressor = () => {
  useEffect(() => {
    let observer: MutationObserver | null = null;

    const strip = (el: Element) => {
      const t = el.getAttribute('title');
      if (t !== null) { el.setAttribute('data-title', t); el.removeAttribute('title'); }
    };
    const stripTree = (root: ParentNode) => {
      if (root instanceof Element) strip(root);
      root.querySelectorAll?.('[title]').forEach(strip);
    };
    const restoreAll = () => {
      document.querySelectorAll('[data-title]').forEach((el) => {
        const t = el.getAttribute('data-title');
        if (t !== null) el.setAttribute('title', t);
        el.removeAttribute('data-title');
      });
    };

    const apply = () => {
      if (areTooltipsOff()) {
        stripTree(document.body);
        if (!observer) {
          observer = new MutationObserver((muts) => {
            for (const m of muts) {
              if (m.type === 'attributes' && m.target instanceof Element) strip(m.target);
              else if (m.type === 'childList') m.addedNodes.forEach((n) => { if (n instanceof Element) stripTree(n); });
            }
          });
          observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['title'] });
        }
      } else {
        observer?.disconnect();
        observer = null;
        restoreAll();
      }
    };

    apply();
    window.addEventListener(TOOLTIPS_EVENT, apply);
    return () => { window.removeEventListener(TOOLTIPS_EVENT, apply); observer?.disconnect(); };
  }, []);

  return null;
};

export default TooltipSuppressor;
