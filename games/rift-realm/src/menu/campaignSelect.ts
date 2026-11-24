// The Campaign screens of the front end: Start → Campaign (pick the vessel's story) → Chapter select → Loading.
// Self-contained like modeSelect.ts: its own markup and styles, driven by menu.ts (render / move / ok), so the frozen
// menu data files (content.ts, pedestal.ts) stay untouched. Campaign data: campaign/data.ts; progress: campaign/progress.ts.
import { CAMPAIGNS, type Campaign, type Chapter } from '../campaign/data';
import { progress, cloud } from '../campaign/progress';
import { fmtTime } from '../modes';

const CSS = `
.rr-camp .rr-camp-list,.rr-chap .rr-camp-list{position:absolute;left:6vw;top:21vh;width:min(560px,44vw);display:flex;flex-direction:column;gap:9px;max-height:64vh;overflow:auto;padding-right:6px}
.rr-camp-row{display:flex;align-items:center;gap:14px;text-align:left;padding:13px 18px;border:1px solid #ffffff22;background:#0a0b16b8;color:#e9e6ff;font:600 16px Segoe UI,sans-serif;letter-spacing:.06em;cursor:pointer;transition:transform .15s,border-color .15s,background .15s}
.rr-camp-row i{width:10px;height:10px;transform:rotate(45deg);background:var(--m);box-shadow:0 0 10px var(--m);flex:none}
.rr-camp-row small{margin-left:auto;font:600 11px Segoe UI,sans-serif;letter-spacing:.2em;color:#a3a0c2;text-transform:uppercase;white-space:nowrap}
.rr-camp-row.focus{transform:translateX(10px);border-color:var(--m);background:linear-gradient(90deg,#16132ae6,#0a0b16b8);box-shadow:0 0 24px -8px var(--m)}
.rr-camp-row.off{opacity:.45}
.rr-camp-row.done small{color:#a7f3d0}
.rr-camp-info{position:absolute;right:6vw;top:22vh;width:min(440px,36vw);color:#e9e6ff;font-family:Segoe UI,sans-serif}
.rr-camp-info h2{font:800 42px Georgia,serif;margin:6px 0 4px;color:var(--m);text-shadow:0 0 24px color-mix(in srgb,var(--m) 50%,transparent)}
.rr-camp-info .sub{font-size:14px;letter-spacing:.14em;color:#b9b4dc;text-transform:uppercase;margin-bottom:14px}
.rr-camp-info p{font-size:16px;line-height:1.5;color:#cfcbe8;margin:0 0 14px}
.rr-camp-info dl{display:grid;grid-template-columns:auto 1fr;gap:6px 14px;font-size:13px;margin:0 0 20px}
.rr-camp-info dt{color:#8f8bb0;letter-spacing:.18em;text-transform:uppercase;font-size:11px;padding-top:2px}
.rr-camp-info dd{margin:0;color:#ece9ff}
.rr-camp-info .ph{display:inline-block;padding:2px 8px;font:700 10px Segoe UI,sans-serif;letter-spacing:.2em;color:#0b0918;background:#fbbf24;margin-bottom:12px}
.rr-camp-info .cloud{font-size:11px;letter-spacing:.16em;color:#8f8bb0;text-transform:uppercase;margin-top:12px}
`;

const LEVEL_NAMES: Record<string, string> = {
  elderwood: 'Elderwood Hollow', shrine: 'Cyber-Forest Shrine', glacial: 'Glacial Citadel', volcanic: 'Obsidian Volcanic Compound',
  marsh: 'Sunken Marshland Village', celestial: 'Celestial Void Citadel', sanctum: 'Void Sanctum',
};
export const levelName = (p: string) => LEVEL_NAMES[p] ?? p;

const stepLine = (ch: Chapter) => ch.steps.filter((s) => s.kind !== 'card').map((s) => (s as { label: string }).label).join(' → ');

export interface CampaignPick { id: string; chapter: number; level: string; vessel: NonNullable<Campaign['vessel']> }

export interface CampaignScreens {
  html: string;
  mount(root: HTMLElement, on: { okCamp: () => void; okChap: () => void }): void;
  renderCamp(root: HTMLElement): void;
  renderChap(root: HTMLElement): void;
  moveCamp(d: number): void;
  moveChap(d: number): void;
  /** the focused campaign can be opened (its vessel exists) */
  campReady(): boolean;
  /** the focused chapter, if it's unlocked */
  pick(): CampaignPick | null;
  /** the level the focused row shows (for the background video) */
  readonly focusLevel: string;
}

export function campaignScreens(): CampaignScreens {
  if (!document.getElementById('rr-camp-css')) { const st = document.createElement('style'); st.id = 'rr-camp-css'; st.textContent = CSS; document.head.appendChild(st); }
  // open on the campaign / chapter last played
  const last = progress.get().last;
  let ci = Math.max(0, CAMPAIGNS.findIndex((c) => c.id === last?.campaign));
  let hi = 0;
  const camp = () => CAMPAIGNS[ci];
  const html = `
    <section class="rr-scr rr-camp">
      <header class="rr-step"><b>1</b> Campaign · choose a vessel's story</header>
      <div class="rr-camp-list">${CAMPAIGNS.map((c, k) => `<button class="rr-camp-row" data-i="${k}" style="--m:${c.hex}"><i></i>${c.name}<small></small></button>`).join('')}</div>
      <div class="rr-camp-info"><div class="rr-kicker">Campaign</div><h2></h2><div class="sub"></div><div class="body"></div><button class="rr-go">Choose <kbd>Enter</kbd></button><div class="cloud"></div></div>
      <div class="rr-hint"><kbd>↑↓</kbd> / <kbd>LB RB</kbd> vessel · <kbd>Enter</kbd> / <kbd>A</kbd> choose · <kbd>Esc</kbd> / <kbd>B</kbd> back</div>
    </section>
    <section class="rr-scr rr-chap">
      <header class="rr-step"><b>2</b> Choose the chapter <em class="rr-chap-of"></em></header>
      <div class="rr-camp-list"></div>
      <div class="rr-camp-info"><div class="rr-kicker"></div><h2></h2><div class="sub"></div><div class="body"></div><button class="rr-go">Play chapter <kbd>Enter</kbd></button></div>
      <div class="rr-hint"><kbd>↑↓</kbd> / <kbd>LB RB</kbd> chapter · <kbd>Enter</kbd> / <kbd>A</kbd> play · <kbd>Esc</kbd> / <kbd>B</kbd> back</div>
    </section>`;
  let rootEl: HTMLElement | null = null, onChap: (() => void) | null = null;

  const scr: CampaignScreens = {
    html,
    mount(root, on) {
      rootEl = root; onChap = on.okChap;
      root.querySelectorAll<HTMLElement>('.rr-camp .rr-camp-row').forEach((b, k) => {
        b.addEventListener('pointerenter', () => { if (ci !== k) { ci = k; hi = firstOpen(); scr.renderCamp(root); } });
        b.addEventListener('click', () => { if (ci !== k) { ci = k; hi = firstOpen(); } scr.renderCamp(root); if (scr.campReady()) on.okCamp(); });
      });
      root.querySelector<HTMLElement>('.rr-camp .rr-go')!.addEventListener('click', () => { if (scr.campReady()) on.okCamp(); });
      root.querySelector<HTMLElement>('.rr-chap .rr-go')!.addEventListener('click', () => { if (scr.pick()) on.okChap(); });
      progress.onChange(() => { if (rootEl) { scr.renderCamp(rootEl); } });
    },
    renderCamp(root) {
      const c = camp(), sec = root.querySelector<HTMLElement>('.rr-camp')!;
      sec.style.setProperty('--m', c.hex);
      sec.querySelectorAll<HTMLElement>('.rr-camp-row').forEach((b, k) => {
        const x = CAMPAIGNS[k], n = progress.clearedCount(x.id, x.chapters.length);
        b.classList.toggle('focus', k === ci);
        b.classList.toggle('off', !x.vessel);
        b.classList.toggle('done', n === x.chapters.length);
        b.querySelector('small')!.textContent = x.vessel ? `${n} / ${x.chapters.length}` : 'in the forge';
      });
      sec.querySelector('h2')!.textContent = c.name;
      sec.querySelector('.sub')!.textContent = c.title;
      const n = progress.clearedCount(c.id, c.chapters.length);
      sec.querySelector('.body')!.innerHTML = (c.vessel ? '' : '<div class="ph">VESSEL IN THE FORGE</div>')
        + `<p>${c.vessel ? `${c.chapters.length} chapters across the Rift Realm.` : 'This vessel is still being built. Its campaign opens when the vessel joins the roster.'}</p>`
        + `<p class="rr-canon" style="color:#cbbf8f;font-style:italic">Story: awaiting canon from the Legend of Elohim. Chapter text is placeholder.</p>`
        + `<dl><dt>Progress</dt><dd>${n} of ${c.chapters.length} cleared</dd><dt>Maps</dt><dd>${[...new Set(c.chapters.map((h) => levelName(h.level)))].join(', ')}</dd></dl>`;
      const go = sec.querySelector<HTMLButtonElement>('.rr-go')!;
      go.disabled = !c.vessel; go.innerHTML = c.vessel ? 'Choose <kbd>Enter</kbd>' : 'Coming soon';
      sec.querySelector('.cloud')!.textContent = cloud.available ? 'Progress synced to your Plajah account' : 'Progress saved on this device';
    },
    renderChap(root) {
      const c = camp(), sec = root.querySelector<HTMLElement>('.rr-chap')!;
      sec.style.setProperty('--m', c.hex);
      sec.querySelector('.rr-chap-of')!.textContent = `· ${c.name}`;
      const list = sec.querySelector<HTMLElement>('.rr-camp-list')!;
      if (list.dataset.c !== c.id) {
        list.dataset.c = c.id;
        list.innerHTML = c.chapters.map((h, k) => `<button class="rr-camp-row" data-i="${k}" style="--m:${c.hex}"><i></i>${h.n}. ${h.title}<small></small></button>`).join('');
        list.querySelectorAll<HTMLElement>('.rr-camp-row').forEach((b, k) => {
          b.addEventListener('pointerenter', () => { if (hi !== k) { hi = k; scr.renderChap(root); } });
          b.addEventListener('click', () => { hi = k; scr.renderChap(root); if (scr.pick()) onChap?.(); });
        });
      }
      list.querySelectorAll<HTMLElement>('.rr-camp-row').forEach((b, k) => {
        const h = c.chapters[k], open = progress.unlocked(c.id, h.n), rec = progress.rec(c.id, h.n);
        b.classList.toggle('focus', k === hi);
        b.classList.toggle('off', !open);
        b.classList.toggle('done', !!rec?.cleared);
        b.querySelector('small')!.textContent = !open ? 'locked' : rec?.cleared ? `clear · ${fmtTime(rec.bestTime ?? 0)}` : h.stub ? 'draft' : 'new';
      });
      const h = c.chapters[hi], open = progress.unlocked(c.id, h.n), rec = progress.rec(c.id, h.n);
      sec.querySelector('.rr-kicker')!.textContent = `Chapter ${h.n}`;
      sec.querySelector('h2')!.textContent = h.title;
      sec.querySelector('.sub')!.textContent = levelName(h.level);
      sec.querySelector('.body')!.innerHTML = (h.stub ? '<div class="ph">DRAFT · STORY PLACEHOLDER</div>' : '')
        + `<p>${h.summary}</p>`
        + `<dl><dt>Objectives</dt><dd>${stepLine(h)}</dd><dt>Lives</dt><dd>${h.lives}</dd>`
        + `<dt>Best</dt><dd>${rec?.bestTime ? `${fmtTime(rec.bestTime)} · cleared ${rec.clears}×` : '—'}</dd></dl>`;
      const go = sec.querySelector<HTMLButtonElement>('.rr-go')!;
      go.disabled = !open; go.innerHTML = open ? `${rec?.cleared ? 'Replay' : 'Play'} chapter <kbd>Enter</kbd>` : `Clear chapter ${h.n - 1} first`;
      list.querySelectorAll<HTMLElement>('.rr-camp-row')[hi]?.scrollIntoView({ block: 'nearest' });
    },
    moveCamp(d) { ci = (ci + d + CAMPAIGNS.length) % CAMPAIGNS.length; },
    moveChap(d) { const n = camp().chapters.length; hi = (hi + d + n) % n; },
    campReady: () => !!camp().vessel,
    pick() {
      const c = camp(), h = c.chapters[hi];
      if (!c.vessel || !h || !progress.unlocked(c.id, h.n)) return null;
      return { id: c.id, chapter: h.n, level: h.level, vessel: c.vessel };
    },
    get focusLevel() { return rootEl?.querySelector('.rr-chap.on') ? camp().chapters[hi]?.level ?? 'shrine' : camp().chapters[0]?.level ?? 'shrine'; },
  };
  // the chapter list opens on the next chapter to play
  const firstOpen = () => { const c = camp(); const k = c.chapters.findIndex((h) => !progress.cleared(c.id, h.n)); return k < 0 ? 0 : k; };
  const moveCamp = scr.moveCamp;
  scr.moveCamp = (d) => { moveCamp(d); hi = firstOpen(); };
  hi = last && camp().id === last.campaign ? Math.max(0, camp().chapters.findIndex((h) => h.n === last.chapter)) : firstOpen();
  return scr;
}
