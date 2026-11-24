// Campaign beats on screen: dialogue / cutscene cards (intro, mid-chapter, outro) and the chapter-clear / fallen panels.
// DOM only, in the game's match-end style. Enter / Space / A / click advance; Esc / B skips the rest of the beat.
// Placeholder cards (story not written yet) carry a visible PLACEHOLDER tag so nobody mistakes them for canon.
import type { Card } from './data';
import { fmtTime } from '../modes';

const CSS = `
.rr-cards{position:fixed;inset:0;z-index:58;display:flex;align-items:flex-end;justify-content:center;padding-bottom:9vh;background:linear-gradient(#0000 35%,#05030ccc 75%,#05030cf2);font-family:Segoe UI,sans-serif;color:#ece6ff;opacity:0;transition:opacity .35s}
.rr-cards.on{opacity:1}
.rr-cards .bar{position:fixed;left:0;right:0;height:9vh;background:#000;transition:transform .45s}
.rr-cards .bar.t{top:0;transform:translateY(-100%)}.rr-cards .bar.b{bottom:0;transform:translateY(100%)}
.rr-cards.on .bar{transform:none}
.rr-cards .still{position:fixed;inset:0;background:center/cover no-repeat;opacity:.55}
.rr-card-box{position:relative;width:min(860px,88vw);padding:22px 28px 18px;border-left:3px solid var(--c);background:#0b0918d9;box-shadow:0 0 40px -12px var(--c);z-index:1}
.rr-card-box .kick{font:600 11px Segoe UI,sans-serif;letter-spacing:.32em;color:#a39cc8;text-transform:uppercase;margin-bottom:6px}
.rr-card-box .who{font:800 22px Georgia,serif;color:var(--c);margin-bottom:8px;letter-spacing:.03em}
.rr-card-box p{font-size:18px;line-height:1.55;margin:0 0 6px}
.rr-card-box .ph{display:inline-block;margin-left:10px;padding:2px 8px;font:700 10px Segoe UI,sans-serif;letter-spacing:.2em;color:#0b0918;background:#fbbf24;vertical-align:middle}
.rr-card-box p.phl{color:#cbbf8f;font-style:italic}
.rr-card-box .nav{display:flex;justify-content:space-between;margin-top:12px;font-size:12px;color:#8f89b3;letter-spacing:.12em}
.rr-card-box kbd{font:700 11px Segoe UI,sans-serif;padding:1px 6px;border:1px solid #ffffff44;border-radius:3px;color:#ece6ff}
.rr-chap-title{position:fixed;left:0;right:0;top:24vh;text-align:center;z-index:1;pointer-events:none}
.rr-chap-title .n{font:600 13px Segoe UI,sans-serif;letter-spacing:.5em;color:#b9b0e0}
.rr-chap-title .t{font:800 54px Georgia,serif;color:var(--c);text-shadow:0 0 28px var(--c);margin-top:8px}
`;
function css() { if (!document.getElementById('rr-camp-css')) { const s = document.createElement('style'); s.id = 'rr-camp-css'; s.textContent = CSS; document.head.appendChild(s); } }
const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** Show a run of cards; resolves when the player has read (or skipped) them. `heading` adds a chapter title plate. */
export function playCards(cards: Card[], opts: { hex: string; kicker: string; heading?: { n: string; title: string } }): Promise<void> {
  css();
  return new Promise((resolve) => {
    if (!cards.length) { resolve(); return; }
    let i = 0;
    const box = document.createElement('div');
    box.className = 'rr-cards'; box.style.setProperty('--c', opts.hex);
    box.innerHTML = `<div class="still"></div><div class="bar t"></div><div class="bar b"></div>`
      + (opts.heading ? `<div class="rr-chap-title"><div class="n">${esc(opts.heading.n)}</div><div class="t">${esc(opts.heading.title)}</div></div>` : '')
      + `<div class="rr-card-box"></div>`;
    document.body.appendChild(box);
    requestAnimationFrame(() => box.classList.add('on'));
    window.setTimeout(() => box.classList.add('on'), 50);
    const cardEl = box.querySelector<HTMLElement>('.rr-card-box')!, still = box.querySelector<HTMLElement>('.still')!;
    const render = () => {
      const c = cards[i];
      still.style.backgroundImage = c.still ? `url("${c.still}")` : '';
      cardEl.innerHTML = `<div class="kick">${esc(opts.kicker)}</div><div class="who">${esc(c.speaker)}${c.ph ? '<span class="ph">PLACEHOLDER</span>' : ''}</div>`
        + c.lines.map((l) => `<p${c.ph ? ' class="phl"' : ''}>${esc(l)}</p>`).join('')
        + `<div class="nav"><span>${i + 1} / ${cards.length}</span><span><kbd>Enter</kbd> / <kbd>A</kbd> continue · <kbd>Esc</kbd> / <kbd>B</kbd> skip</span></div>`;
    };
    let done = false, lastPad = 0, padHeld = true;
    const close = () => {
      if (done) return; done = true;
      window.removeEventListener('keydown', onKey, true); box.removeEventListener('click', next);
      box.classList.remove('on'); window.setTimeout(() => box.remove(), 380);
      resolve();
    };
    const next = () => { if (++i >= cards.length) close(); else render(); };
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Enter' || e.code === 'Space' || e.code === 'NumpadEnter') { e.preventDefault(); e.stopPropagation(); next(); }
      else if (e.code === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
    };
    // controller: A next, B skip (edge-triggered; buttons held from gameplay are ignored until released)
    const poll = () => {
      if (done) return;
      const g = [...(navigator.getGamepads?.() ?? [])].find(Boolean);
      const a = !!g?.buttons[0]?.pressed, b = !!g?.buttons[1]?.pressed;
      if (!a && !b) padHeld = false;
      else if (!padHeld && performance.now() - lastPad > 250) { padHeld = true; lastPad = performance.now(); if (b) close(); else next(); }
      window.setTimeout(poll, 50);
    };
    window.addEventListener('keydown', onKey, true);
    box.addEventListener('click', next);
    render(); poll();
  });
}

export interface ChapterResult { won: boolean; time: number; kills: number; downs: number; best?: boolean; bestTime?: number | null }
export interface ResultButton { label: string; run: () => void; primary?: boolean }

/** The chapter-clear (or fallen) panel. */
export function showChapterResult(r: ChapterResult, opts: { hex: string; kicker: string; title: string; unlocked?: string; buttons: ResultButton[] }) {
  css();
  const box = document.createElement('div');
  box.className = 'rr-camp-result';
  box.style.cssText = 'position:fixed;inset:0;z-index:60;display:grid;place-items:center;background:radial-gradient(#0a0618dd,#03020af2);font-family:Segoe UI,sans-serif;color:#ece6ff';
  const best = r.won ? (r.best ? ' · <b style="color:#fde68a">NEW BEST</b>' : r.bestTime ? ` · best ${fmtTime(r.bestTime)}` : '') : '';
  box.innerHTML = `<div style="text-align:center;max-width:90vw"><div style="letter-spacing:.4em;font-size:13px;color:#b4a6d9">${esc(opts.kicker)}</div>
    <div style="font:800 46px Georgia,serif;margin:10px 0 2px;color:${opts.hex};text-shadow:0 0 24px ${opts.hex}">${esc(opts.title)}</div>
    <div style="font-size:60px;font-weight:800;letter-spacing:.08em;margin:0 0 10px">${r.won ? 'CHAPTER CLEAR' : 'FALLEN'}</div>
    <div style="font-size:18px;margin-bottom:10px">${fmtTime(r.time)} · ${r.kills} kills · downed ${r.downs}×${best}</div>
    ${opts.unlocked ? `<div style="font-size:14px;letter-spacing:.2em;color:#a7f3d0;margin-bottom:18px">UNLOCKED · ${esc(opts.unlocked.toUpperCase())}</div>` : '<div style="height:18px"></div>'}
    <div class="btns"></div></div>`;
  const row = box.querySelector<HTMLElement>('.btns')!;
  let focus = Math.max(0, opts.buttons.findIndex((b) => b.primary));
  const els = opts.buttons.map((b, k) => {
    const el = document.createElement('button');
    el.textContent = b.label; el.dataset.k = String(k);
    el.style.cssText = `margin:0 6px;padding:12px 24px;font:700 13px Segoe UI,sans-serif;letter-spacing:.14em;color:#0a0618;border:0;cursor:pointer;background:${b.primary ? `linear-gradient(90deg,${opts.hex},#f5f3ff)` : '#cbd5e1'}`;
    el.onclick = () => go(k);
    el.onpointerenter = () => { focus = k; paint(); };
    row.appendChild(el);
    return el;
  });
  const paint = () => els.forEach((e, k) => { e.style.outline = k === focus ? `2px solid ${opts.hex}` : 'none'; e.style.outlineOffset = '3px'; });
  const go = (k: number) => { window.removeEventListener('keydown', onKey, true); box.remove(); opts.buttons[k].run(); };
  const onKey = (e: KeyboardEvent) => {
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') { focus = (focus + els.length - 1) % els.length; paint(); }
    else if (e.code === 'ArrowRight' || e.code === 'KeyD') { focus = (focus + 1) % els.length; paint(); }
    else if (e.code === 'Enter' || e.code === 'Space') go(focus);
    else return;
    e.preventDefault(); e.stopPropagation();
  };
  window.addEventListener('keydown', onKey, true);
  document.body.appendChild(box);
  paint();
}
