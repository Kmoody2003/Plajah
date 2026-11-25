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
  c = c.trim();
  // Custom properties come back exactly as authored/minified — often #rrggbbaa, which the first
  // version could not read (it fell back to a BLACK scrim and judged light pages dark).
  if (c[0] === '#') {
    let h = c.slice(1);
    if (h.length === 3 || h.length === 4) h = h.split('').map(x => x + x).join('');
    if (h.length !== 6 && h.length !== 8) return null;
    const n = parseInt(h.slice(0, 6), 16);
    if (Number.isNaN(n)) return null;
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: h.length === 8 ? parseInt(h.slice(6), 16) / 255 : 1 };
  }
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

/** Text nodes scanned per pass / nodes actually measured per pass. Scanning is cheap; measuring is not. */
const MAX_SCAN = 9000;
const MAX_MEASURE = 2600;
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

type Backdrop = { bg: RGBA; media: boolean; mediaKnown: boolean; confidentDark: boolean };

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
function backdropFor(el: Element, page: RGBA, textRect?: DOMRect): Backdrop {
  // Measure the glyphs, not the element box: a block-level heading spans the full width of its
  // hero, which made the photo behind it look "not much bigger than the text".
  const r = textRect && textRect.width > 0 && textRect.height > 0 ? textRect : el.getBoundingClientRect();
  const x = Math.min(innerWidth - 1, Math.max(1, r.left + r.width / 2));
  const y = Math.min(innerHeight - 1, Math.max(1, r.top + r.height / 2));
  const inView = r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
  const hit = inView ? document.elementsFromPoint(x, y) : [];
  const idx = hit.indexOf(el);
  const below: Element[] = [];
  if (idx >= 0) for (let i = idx + 1; i < hit.length; i++) below.push(hit[i]);
  else { let n: Element | null = el.parentElement; while (n) { below.push(n); n = n.parentElement; } }
  let acc: RGBA = page;
  let media = false, mediaKnown = false, confidentDark = false;
  for (let i = below.length - 1; i >= 0; i--) {
    const n = below[i];
    if (n === document.body || n === document.documentElement) continue;
    if (n.closest('#universal-background')) continue; // modelled by `page` (scrim + tone)
    const cs = getComputedStyle(n);
    // A theme wash (e.g. the album page's frosted layer) sits ABOVE the dark ambient art beneath it:
    // everything under it no longer shows through, so restart the model from the wash itself.
    if (n.hasAttribute('data-pj-wash') && cs.display !== 'none') {
      const w = parseColor(cs.backgroundColor);
      if (w && w.a > 0) { acc = over(w, { r: 128, g: 128, b: 128, a: 1 }); media = false; mediaKnown = false; confidentDark = false; continue; }
    }
    const isEl = n instanceof HTMLImageElement || n instanceof HTMLVideoElement || n instanceof HTMLCanvasElement;
    if (isEl || cs.backgroundImage.includes('url(')) {
      const l = isEl ? mediaLuminance(n) : null;
      // Media counts as the text's BACKDROP when it actually sits behind it: it contains the text
      // box, is clearly larger than it, and isn't an icon. (An earlier viewport-relative size test
      // skipped narrow columns — an ad slot's photo — and judged their text against the light page.)
      const backdrop = (() => {
        const b = n.getBoundingClientRect();
        const slack = 2;
        return b.left <= r.left + slack && b.right >= r.right - slack && b.top <= r.top + slack && b.bottom >= r.bottom - slack
          && b.width * b.height >= r.width * r.height * 3 && Math.min(b.width, b.height) >= 60;
      })();
      if (!backdrop) continue;
      media = true;
      if (l !== null) { acc = grey(l); mediaKnown = true; confidentDark = l < 0.25; } else { acc = grey(0.06); confidentDark = true; } // unknown: heroes are almost always dark
      continue;
    }
    const bg = parseColor(cs.backgroundColor);
    if (bg && bg.a > 0) { acc = over(bg, acc); if (bg.a >= 0.85 && luminance(bg) < 0.12) confidentDark = true; if (bg.a >= 0.85 && luminance(bg) > 0.5) confidentDark = false; }
  }
  return { bg: acc, media, mediaKnown, confidentDark };
}

const ink = (dark: boolean, muted: boolean) =>
  dark ? (muted ? 'rgb(71,85,105)' : 'rgb(15,23,42)') : (muted ? 'rgb(226,232,240)' : 'rgb(255,255,255)');

/**
 * Stability rules (the first version flickered):
 *  - A fix is remembered per element together with the className it was computed for. A pass
 *    that finds the same element, same className, still carrying our marker does NOTHING — so a
 *    steady page costs no style writes at all and nothing can blink.
 *  - Fixes are only torn down when the theme/background actually changes (resetContrastGuard),
 *    or when that one element's classes change (selected <-> unselected), in which case just it
 *    is re-evaluated.
 *  - No CSS transition on the corrected colour: it lands in one frame.
 */
// ── Surface adaptation ──────────────────────────────────────────────────────
/**
 * Plenty of pages hard-code near-black panels (bg-[#0a0a0f], inline background:#07070b, dark
 * gradients). Class remapping in CSS cannot reach those, so on light/pastel themes this pass
 * finds genuinely dark, mostly-opaque panels and tags them `data-pj-surface`; theme-system.css
 * gives tagged panels the theme's frosted surface. It never touches: anything holding or sitting
 * on video / canvas / iframe / a photo (players, heroes, ad slots), tiny elements, full-screen
 * modal dimmers, or anything opted out with data-keep-dark / .pj-keep-dark.
 */
const SURFACE_SELECTOR = 'div,section,aside,main,header,footer,nav,article,ul,form,table,dialog,[role="dialog"],[role="menu"],[role="listbox"],input,textarea,select';
const KEEP_DARK = '[data-keep-dark],.pj-keep-dark,.ev-leaf,#universal-background,video,canvas,iframe';
const surfaceSig = new WeakMap<Element, string>();
let surfaceList: HTMLElement[] = [];

function darkFill(cs: CSSStyleDeclaration): boolean {
  if (cs.backgroundImage.includes('url(')) return false; // a picture, not a plain panel
  const bg = parseColor(cs.backgroundColor);
  if (bg && bg.a >= 0.5 && luminance(bg) < 0.12) return true;
  if (cs.backgroundImage.includes('gradient')) {
    const cols = (cs.backgroundImage.match(/rgba?\([^)]*\)/g) || []).map(parseColor).filter(Boolean) as RGBA[];
    if (cols.length && cols.every(c => c.a >= 0.3 && luminance(c) < 0.12)) return true;
  }
  return false;
}

export function unadaptSurfaces() {
  for (const el of surfaceList) { el.removeAttribute('data-pj-surface'); surfaceSig.delete(el); }
  surfaceList = [];
}

export function adaptSurfaces(): number {
  let n = 0, measured = 0;
  const els = document.body.querySelectorAll<HTMLElement>(SURFACE_SELECTOR);
  for (let i = 0; i < els.length && measured < 2600; i++) {
    const el = els[i];
    const sig = (typeof el.className === 'string' ? el.className : '') + '|' + (el.getAttribute('style') || '');
    if (el.hasAttribute('data-pj-surface')) { if (surfaceSig.get(el) === sig) { n++; continue; } el.removeAttribute('data-pj-surface'); }
    const r = el.getBoundingClientRect();
    const form = el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT';
    if (r.bottom < -innerHeight || r.top > innerHeight * 2) continue;
    if (!form && (r.width < 120 || r.height < 36)) continue;
    measured++;
    const cs = getComputedStyle(el);
    if (!darkFill(cs)) continue;
    // Full-screen DIMMERS behind modals must stay dark — they are translucent. An OPAQUE fixed
    // full-screen fill is an app shell (Build Studio, editors) and should take the theme.
    if (cs.position === 'fixed' && r.width >= innerWidth * 0.9 && r.height >= innerHeight * 0.9) {
      const fill = parseColor(cs.backgroundColor);
      if (!fill || fill.a < 0.95) continue;
    }
    if (el.closest(KEEP_DARK)) continue;
    if (!form && el.querySelector('video,canvas,iframe')) continue;
    el.setAttribute('data-pj-surface', '1');
    surfaceSig.set(el, sig);
    surfaceList.push(el);
    n++;
  }
  return n;
}

const fixedFor = new WeakMap<Element, string>();
let revertList: HTMLElement[] = [];

function unfix(el: HTMLElement) {
  el.style.removeProperty('color');
  el.style.removeProperty('text-shadow');
  el.removeAttribute('data-pj-contrast');
  fixedFor.delete(el);
}

export function resetContrastGuard() {
  for (const el of revertList) unfix(el);
  revertList = [];
  unadaptSurfaces();
}

export function runContrastGuard(root: ParentNode = document.body): number {
  if (typeof document === 'undefined') return 0;
  const page = pageBackdrop();
  const lightTheme = document.body.classList.contains('theme-light') || document.body.classList.contains('theme-pastel');
  if (lightTheme && luminance(page) < 0.4) { page.r = 221; page.g = 227; page.b = 234; page.a = 1; }
  // Panels first, so the text pass below judges the backgrounds as they will actually look.
  if (lightTheme) adaptSurfaces(); else if (surfaceList.length) unadaptSurfaces();
  let visited = 0, measured = 0, fixed = 0;
  const walker = document.createTreeWalker(root as Node, NodeFilter.SHOW_TEXT, {
    acceptNode: n => (n.nodeValue && n.nodeValue.trim().length > 1 ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT),
  });
  const seen = new Set<Element>();
  let node: Node | null;
  while ((node = walker.nextNode()) && visited < MAX_SCAN && measured < MAX_MEASURE) {
    const el = node.parentElement as HTMLElement | null;
    if (!el || seen.has(el) || SKIP.has(el.tagName.toUpperCase())) continue;
    seen.add(el);
    visited++;
    const cls = typeof el.className === 'string' ? el.className : '';
    // Already corrected for exactly this state — leave it alone (this is what stops the flicker).
    if (el.hasAttribute('data-pj-contrast') && fixedFor.get(el) === cls) { fixed++; continue; }
    // State changed since we fixed it: judge its NATURAL colour again.
    if (el.hasAttribute('data-pj-contrast')) unfix(el);

    const rect = el.getBoundingClientRect();
    // Cover one screen above and below so text is already right when it scrolls into view.
    if (rect.width === 0 || rect.height === 0 || rect.bottom < -innerHeight || rect.top > innerHeight * 2) continue;
    measured++;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || parseFloat(cs.opacity) < 0.05) continue;
    const fg = parseColor(cs.color);
    if (!fg) continue;
    let textRect: DOMRect | undefined;
    try { const rg = document.createRange(); rg.selectNodeContents(node); textRect = rg.getBoundingClientRect(); } catch { /* fall back to the element box */ }
    const bd = backdropFor(el, page, textRect);
    const { media } = bd;
    let bg = bd.bg;
    // Light themes put light frosted glass over everything by construction. A model that says
    // "dark" without hard evidence (real dark media, or an opaque dark fill) is a model error —
    // trust the theme, never flip to white on a guess.
    if (lightTheme && !bd.confidentDark && luminance(bg) < 0.4) bg = { ...page, a: 1 };
    const fgOver = over(fg, { ...bg, a: 1 });
    const ratio = contrastRatio(fgOver, bg);
    const size = parseFloat(cs.fontSize);
    const bold = parseInt(cs.fontWeight, 10) >= 700;
    const need = size >= 24 || (size >= 18.66 && bold) ? 3 : 4.5;
    if (ratio >= need) continue;
    const bgIsLight = luminance(bg) > 0.4;
    const muted = fg.a < 0.8;
    el.style.setProperty('color', ink(bgIsLight, muted), 'important');
    // Over photography the average is a guess; a soft halo keeps text readable either way.
    if (media) el.style.setProperty('text-shadow', bgIsLight ? '0 1px 2px rgba(255,255,255,.7)' : '0 1px 3px rgba(0,0,0,.6)', 'important');
    el.setAttribute('data-pj-contrast', '1');
    fixedFor.set(el, cls);
    revertList.push(el);
    fixed++;
  }
  return fixed;
}

/**
 * Idle-scheduled guard.
 *  - DOM additions / class changes → a cheap incremental pass (steady elements are skipped).
 *  - Theme, background tone or palette change → full reset first, then a pass.
 */
export function startContrastGuard(enabled: () => boolean): () => void {
  let timer: number | undefined;
  let needFullReset = false;
  const schedule = (delay: number) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      if (!enabled()) { resetContrastGuard(); return; }
      const run = () => { if (needFullReset) { resetContrastGuard(); needFullReset = false; } runContrastGuard(); };
      (window as any).requestIdleCallback ? (window as any).requestIdleCallback(run, { timeout: 1500 }) : run();
    }, delay);
  };
  // Content changes: incremental.
  const content = new MutationObserver(muts => {
    if (muts.every(m => m.type === 'attributes' && (m.attributeName === 'style' || m.attributeName === 'data-pj-contrast'))) return;
    schedule(600);
  });
  content.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'], characterData: false });
  // Global look changes (theme class, bg tone, palette vars on <body style>): full re-evaluation.
  const look = new MutationObserver(() => { needFullReset = true; schedule(200); });
  look.observe(document.body, { attributes: true, attributeFilter: ['class', 'data-bg-tone', 'data-pj-palette', 'style'] });
  // Scrolling reveals text that was never judged. Capture phase so inner scroll containers count.
  const onScroll = () => schedule(140);
  window.addEventListener('scroll', onScroll, { capture: true, passive: true });
  window.addEventListener('resize', onScroll, { passive: true });
  schedule(150);
  return () => { content.disconnect(); look.disconnect(); window.removeEventListener('scroll', onScroll, true); window.removeEventListener('resize', onScroll); window.clearTimeout(timer); resetContrastGuard(); };
}
