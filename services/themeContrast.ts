/**
 * Theme contrast engine.
 *
 * CSS (styles/theme-system.css) re-maps the common Tailwind text utilities per theme. That
 * covers the vast majority of text, but a platform this size has thousands of one-off colours
 * (text-[#9aa], inline styles, third-party widgets). This module is the safety net:
 *
 *  1. measureBackgroundTone() — samples the active custom background (photo or video frame)
 *     and tags <body data-bg-tone="dark|mid|bright"> so the scrim can be sized to the image.
 *  2. runContrastGuard() — walks visible text nodes, resolves the real backdrop colour behind
 *     each one (compositing translucent ancestors; assuming the scrim over custom backgrounds),
 *     and when the ratio is under WCAG AA nudges the text to the theme's ink colour.
 *
 * It is idle-scheduled, capped, and skipped entirely on TV / low-perf tiers.
 */

type RGBA = { r: number; g: number; b: number; a: number };

const parseColor = (c: string): RGBA | null => {
  const m = c.match(/rgba?\(([^)]+)\)/);
  if (!m) return null;
  const p = m[1].split(/[,/ ]+/).filter(Boolean).map(parseFloat);
  if (p.length < 3 || p.some(n => Number.isNaN(n))) return null;
  return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
};

const lin = (v: number) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
export const luminance = (c: { r: number; g: number; b: number }) => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
export const contrastRatio = (a: { r: number; g: number; b: number }, b: { r: number; g: number; b: number }) => {
  const l1 = luminance(a), l2 = luminance(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
};
const over = (top: RGBA, bottom: RGBA): RGBA => {
  const a = top.a + bottom.a * (1 - top.a);
  if (a === 0) return { r: 0, g: 0, b: 0, a: 0 };
  return {
    r: (top.r * top.a + bottom.r * bottom.a * (1 - top.a)) / a,
    g: (top.g * top.a + bottom.g * bottom.a * (1 - top.a)) / a,
    b: (top.b * top.a + bottom.b * bottom.a * (1 - top.a)) / a,
    a,
  };
};

// ── Background tone sampling ────────────────────────────────────────────────

/** Average luminance (0..1) of an image/video frame, or null if the pixels can't be read (CORS). */
export function sampleLuminance(src: CanvasImageSource, w: number, h: number): number | null {
  try {
    const cv = document.createElement('canvas');
    cv.width = 24; cv.height = 24;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    if (!ctx || !w || !h) return null;
    ctx.drawImage(src, 0, 0, w, h, 0, 0, 24, 24);
    const d = ctx.getImageData(0, 0, 24, 24).data;
    let sum = 0;
    for (let i = 0; i < d.length; i += 4) sum += luminance({ r: d[i], g: d[i + 1], b: d[i + 2] });
    return sum / (d.length / 4);
  } catch {
    return null; // tainted canvas — caller falls back to the "bright" (safest) scrim
  }
}

export function setBackgroundTone(lum: number | null) {
  const tone = lum === null ? 'bright' : lum > 0.42 ? 'bright' : lum < 0.12 ? 'dark' : 'mid';
  document.body.dataset.bgTone = tone;
}

export function clearBackgroundTone() { delete document.body.dataset.bgTone; }

export function measureImageUrl(url: string): Promise<number | null> {
  return new Promise(resolve => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(sampleLuminance(img, img.naturalWidth, img.naturalHeight));
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

// ── Contrast guard ──────────────────────────────────────────────────────────

const MAX_NODES = 1800;
const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'CANVAS', 'VIDEO', 'SVG', 'IMG', 'IFRAME', 'TEXTAREA', 'OPTION']);

/** Colour that sits behind the UI when the page background is custom (scrim over the image). */
function pageBackdrop(): RGBA {
  const body = document.body;
  const cs = getComputedStyle(body);
  const scrim = parseColor(cs.getPropertyValue('--pj-scrim').trim()) ?? { r: 0, g: 0, b: 0, a: 0.4 };
  if (body.classList.contains('has-custom-background')) {
    const tone = body.dataset.bgTone;
    const lum = tone === 'dark' ? 0.04 : tone === 'mid' ? 0.25 : 0.7;
    const g = Math.round(255 * Math.pow(lum, 1 / 2.2));
    return over(scrim, { r: g, g, b: g, a: 1 });
  }
  const bg = parseColor(cs.backgroundColor);
  if (bg && bg.a > 0.9) return bg;
  const base = parseColor(cs.getPropertyValue('--bg-color').trim());
  if (base) return { ...base, a: 1 };
  const light = body.classList.contains('theme-light') || body.classList.contains('theme-pastel');
  return light ? { r: 221, g: 227, b: 234, a: 1 } : { r: 8, g: 8, b: 12, a: 1 };
}

type Backdrop = { bg: RGBA; media: boolean; mediaKnown: boolean };

const mediaLumCache = new WeakMap<Element, number | null>();

function mediaLuminance(el: Element): number | null {
  if (mediaLumCache.has(el)) return mediaLumCache.get(el)!;
  let lum: number | null = null;
  if (el instanceof HTMLImageElement && el.complete && el.naturalWidth) lum = sampleLuminance(el, el.naturalWidth, el.naturalHeight);
  else if (el instanceof HTMLVideoElement && el.readyState >= 2) lum = sampleLuminance(el, el.videoWidth, el.videoHeight);
  else if (el instanceof HTMLCanvasElement) lum = sampleLuminance(el, el.width, el.height);
  mediaLumCache.set(el, lum);
  return lum;
}

const grey = (lum: number): RGBA => {
  const g = Math.round(255 * Math.pow(Math.max(0, Math.min(1, lum)), 1 / 2.2));
  return { r: g, g, b: g, a: 1 };
};

/**
 * What is really painted behind this text? Hit-tests the centre of the text and composites every
 * background beneath it, so photos, videos and stacked frosted panels are all seen — not just
 * the parent chain. (The first version only walked ancestors and so judged hero text over a
 * photo against the empty page colour.)
 */
function backdropFor(el: Element, page: RGBA): Backdrop {
  const r = el.getBoundingClientRect();
  const x = Math.min(innerWidth - 1, Math.max(1, r.left + r.width / 2));
  const y = Math.min(innerHeight - 1, Math.max(1, r.top + r.height / 2));
  const hit = document.elementsFromPoint(x, y);
  const idx = hit.indexOf(el);
  const below: Element[] = [];
  if (idx >= 0) for (let i = idx + 1; i < hit.length; i++) below.push(hit[i]);
  else { let n: Element | null = el.parentElement; while (n) { below.push(n); n = n.parentElement; } }
  let acc: RGBA = page;
  let media = false, mediaKnown = false;
  for (let i = below.length - 1; i >= 0; i--) {
    const n = below[i];
    if (n === document.body || n === document.documentElement) continue;
    if (n.closest('#universal-background')) continue; // modelled by `page` (scrim + tone)
    const cs = getComputedStyle(n);
    const isEl = n instanceof HTMLImageElement || n instanceof HTMLVideoElement || n instanceof HTMLCanvasElement;
    if (isEl || cs.backgroundImage.includes('url(')) {
      media = true;
      const l = isEl ? mediaLuminance(n) : null;
      if (l !== null) { acc = grey(l); mediaKnown = true; } else acc = grey(0.06); // unknown: heroes are almost always dark
      continue;
    }
    const bg = parseColor(cs.backgroundColor);
    if (bg && bg.a > 0) acc = over(bg, acc);
  }
  return { bg: acc, media, mediaKnown };
}

const ink = (dark: boolean, muted: boolean) =>
  dark ? (muted ? 'rgb(71,85,105)' : 'rgb(15,23,42)') : (muted ? 'rgb(226,232,240)' : 'rgb(255,255,255)');

let revertList: HTMLElement[] = [];

export function resetContrastGuard() {
  for (const el of revertList) {
    el.style.removeProperty('color');
    el.style.removeProperty('text-shadow');
    el.removeAttribute('data-pj-contrast');
  }
  revertList = [];
}

export function runContrastGuard(root: ParentNode = document.body): number {
  if (typeof document === 'undefined') return 0;
  resetContrastGuard();
  const page = pageBackdrop();
  let visited = 0, fixed = 0;
  const walker = document.createTreeWalker(root as Node, NodeFilter.SHOW_TEXT, {
    acceptNode: n => (n.nodeValue && n.nodeValue.trim().length > 1 ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT),
  });
  const seen = new Set<Element>();
  let node: Node | null;
  while ((node = walker.nextNode()) && visited < MAX_NODES) {
    const el = node.parentElement;
    if (!el || seen.has(el) || SKIP.has(el.tagName.toUpperCase())) continue;
    seen.add(el);
    visited++;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0 || rect.bottom < 0 || rect.top > innerHeight) continue; // offscreen / hidden
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || parseFloat(cs.opacity) < 0.05) continue;
    const fg = parseColor(cs.color);
    if (!fg) continue;
    const { bg, media } = backdropFor(el, page);
    const fgOver = over(fg, { ...bg, a: 1 });
    const ratio = contrastRatio(fgOver, bg);
    const size = parseFloat(cs.fontSize);
    const bold = parseInt(cs.fontWeight, 10) >= 700;
    const need = size >= 24 || (size >= 18.66 && bold) ? 3 : 4.5;
    if (ratio >= need) continue;
    const bgIsLight = luminance(bg) > 0.4;
    const muted = fg.a < 0.8 && size < 14 ? false : fg.a < 0.8;
    const h = el as HTMLElement;
    h.style.setProperty('color', ink(bgIsLight, muted), 'important');
    // Over photography the average is a guess; a soft halo keeps text readable either way.
    if (media) h.style.setProperty('text-shadow', bgIsLight ? '0 1px 2px rgba(255,255,255,.7)' : '0 1px 3px rgba(0,0,0,.6)', 'important');
    h.setAttribute('data-pj-contrast', '1');
    revertList.push(h);
    fixed++;
  }
  return fixed;
}

/** Debounced, idle-scheduled guard that re-runs on DOM changes and theme/background changes. */
export function startContrastGuard(enabled: () => boolean): () => void {
  let timer: number | undefined;
  const schedule = (delay = 450) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      if (!enabled()) { resetContrastGuard(); return; }
      const run = () => runContrastGuard();
      (window as any).requestIdleCallback ? (window as any).requestIdleCallback(run, { timeout: 1200 }) : run();
    }, delay);
  };
  const mo = new MutationObserver(muts => {
    // Ignore our own attribute/style writes so the guard doesn't loop.
    if (muts.every(m => m.type === 'attributes' && (m.attributeName === 'style' || m.attributeName === 'data-pj-contrast'))) return;
    schedule();
  });
  mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'data-bg-tone'] });
  schedule(150);
  return () => { mo.disconnect(); window.clearTimeout(timer); resetContrastGuard(); };
}
