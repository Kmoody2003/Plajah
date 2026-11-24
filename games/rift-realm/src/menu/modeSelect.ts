// The Mode step of the front end: Start → Map → Mode → Character → Loading. Any map hosts any mode (modes/index.ts);
// placeholder modes (PvP, Co-op) show as "coming soon" and can't be picked. Self-contained: its own markup and styles,
// driven by menu.ts (render / move / pick / back), so the frozen menu data files stay untouched.
import { MODES, type ModeId } from '../modes';

const CSS = `
.rr-mode .rr-mode-list{position:absolute;left:6vw;top:22vh;width:min(560px,44vw);display:flex;flex-direction:column;gap:10px}
.rr-mode .rr-mode-row{display:flex;align-items:center;gap:14px;text-align:left;padding:14px 18px;border:1px solid #ffffff22;background:#0a0b16b8;color:#e9e6ff;font:600 16px Segoe UI,sans-serif;letter-spacing:.06em;cursor:pointer;transition:transform .15s,border-color .15s,background .15s}
.rr-mode .rr-mode-row i{width:10px;height:10px;transform:rotate(45deg);background:var(--m);box-shadow:0 0 10px var(--m);flex:none}
.rr-mode .rr-mode-row small{margin-left:auto;font:600 11px Segoe UI,sans-serif;letter-spacing:.2em;color:#a3a0c2;text-transform:uppercase}
.rr-mode .rr-mode-row.focus{transform:translateX(10px);border-color:var(--m);background:linear-gradient(90deg,#16132ae6,#0a0b16b8);box-shadow:0 0 24px -8px var(--m)}
.rr-mode .rr-mode-row.off{opacity:.45;cursor:default}
.rr-mode .rr-mode-info{position:absolute;right:6vw;top:24vh;width:min(440px,36vw);color:#e9e6ff;font-family:Segoe UI,sans-serif}
.rr-mode .rr-mode-info h2{font:800 44px Georgia,serif;margin:6px 0 10px;color:var(--m);text-shadow:0 0 24px color-mix(in srgb,var(--m) 50%,transparent)}
.rr-mode .rr-mode-info p{font-size:16px;line-height:1.5;color:#cfcbe8;margin:0 0 16px}
.rr-mode .rr-mode-info dl{display:grid;grid-template-columns:auto 1fr;gap:6px 14px;font-size:13px;margin:0 0 22px}
.rr-mode .rr-mode-info dt{color:#8f8bb0;letter-spacing:.18em;text-transform:uppercase;font-size:11px;padding-top:2px}
.rr-mode .rr-mode-info dd{margin:0;color:#ece9ff}
`;

export interface ModeScreen {
  /** The <section> markup to put in the menu root. */
  html: string;
  /** Wire pointer events once the section is in the DOM. */
  mount(root: HTMLElement, onPick: () => void): void;
  render(root: HTMLElement, mapName: string): void;
  move(d: number): void;
  /** The focused mode, if it can be picked. */
  pick(): ModeId | null;
  readonly current: ModeId;
}

export function modeScreen(initial?: string | null): ModeScreen {
  if (!document.getElementById('rr-mode-css')) { const st = document.createElement('style'); st.id = 'rr-mode-css'; st.textContent = CSS; document.head.appendChild(st); }
  let i = Math.max(0, MODES.findIndex((m) => m.id === initial));
  let rootEl: HTMLElement | null = null, mapLabel = '';
  const html = `
    <section class="rr-scr rr-mode">
      <header class="rr-step"><b>2</b> Choose the mode <em class="rr-mode-map"></em></header>
      <div class="rr-mode-list">${MODES.map((m, k) => `<button class="rr-mode-row${m.ready ? '' : ' off'}" data-i="${k}" style="--m:${m.hex}"><i></i>${m.name}<small>${m.ready ? (m.scripted ? m.rules.score === 'time' ? 'time' : m.rules.score : 'open') : 'coming soon'}</small></button>`).join('')}</div>
      <div class="rr-mode-info"><div class="rr-kicker">Game mode</div><h2></h2><p></p><dl></dl><button class="rr-go">Choose mode <kbd>Enter</kbd></button></div>
      <div class="rr-hint"><kbd>↑↓</kbd> / <kbd>LB RB</kbd> mode · <kbd>Enter</kbd> / <kbd>A</kbd> choose · <kbd>Esc</kbd> / <kbd>B</kbd> back</div>
    </section>`;
  const scr = {
    html,
    mount(root: HTMLElement, onPick: () => void) {
      rootEl = root;
      root.querySelectorAll<HTMLElement>('.rr-mode .rr-mode-row').forEach((b, k) => {
        b.addEventListener('pointerenter', () => { if (i !== k) { i = k; scr.render(root, mapLabel); } });
        b.addEventListener('click', () => { i = k; scr.render(root, mapLabel); if (MODES[k].ready) onPick(); });
      });
      root.querySelector<HTMLElement>('.rr-mode .rr-go')!.addEventListener('click', () => { if (MODES[i].ready) onPick(); });
    },
    render(root: HTMLElement, mapName: string) {
      mapLabel = mapName;
      const m = MODES[i], sec = root.querySelector<HTMLElement>('.rr-mode')!;
      sec.style.setProperty('--m', m.hex);
      sec.querySelector('.rr-mode-map')!.textContent = `· ${mapName}`;
      sec.querySelectorAll('.rr-mode-row').forEach((b, k) => b.classList.toggle('focus', k === i));
      sec.querySelector('.rr-mode-info h2')!.textContent = m.name;
      sec.querySelector('.rr-mode-info p')!.textContent = m.blurb;
      const r = m.rules;
      sec.querySelector('.rr-mode-info dl')!.innerHTML = `<dt>Win</dt><dd>${r.win}</dd><dt>Lose</dt><dd>${r.lose}</dd><dt>Score</dt><dd>${r.score}</dd>`
        + `<dt>Waves</dt><dd>${r.waves}${r.timer ? ` · ${Math.round(r.timer / 60)} min` : ''}</dd><dt>Respawn</dt><dd>${r.respawn === 'spawn' ? 'at your spawn' : 'where you fall'}${r.lives ? ` · ${r.lives} lives` : ''}</dd>`;
      const go = sec.querySelector<HTMLButtonElement>('.rr-go')!;
      go.disabled = !m.ready; go.innerHTML = m.ready ? 'Choose mode <kbd>Enter</kbd>' : 'Coming soon';
    },
    move(d: number) { i = (i + d + MODES.length) % MODES.length; },
    pick: () => (MODES[i].ready ? MODES[i].id : null),
    get current() { return MODES[i].id; },
  };
  return scr;
}

