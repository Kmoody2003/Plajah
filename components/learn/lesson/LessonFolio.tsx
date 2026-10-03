import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Type } from 'lucide-react';
import { parseFolio, seedOf, wobblyRule, SCALE, type Band, type Block, type BulletMarker } from './folioParse';
import { placeFigures, type Figure } from './figures';
import LessonCheck from './LessonCheck';
import { lessonToTelaDoc } from '../../../services/tela/lessonDoc';
import { renderDevice, buildRenderMaps } from '../../tela/renderDevice';
import { TelaReveal, TELA_MOTION_CSS, useTelaPointerGlow } from '../../tela/telaMotion';

/**
 * The lesson page. One structure, three themes the learner can switch between:
 *   default   the built page: book serif, drop cap, one timed glow on "Why it matters" (council synthesis)
 *   baroque   a lit stage: warm single source of light, the brightest block is "Why it matters"
 *   eclectic  a field notebook: callouts as pasted slips, ruled margin, ribbon, brass accent
 * Themes only change look and rhythm; the text, the order and the figures never change. Figures (plates, audio, video,
 * charts, graphs, diagrams, timelines) sit between paragraphs and take their colours from the theme.
 * Controls: text size, theme, Easier to read (Atkinson Hyperlegible, no drop cap), Calm (no motion or glow).
 */
export type FolioThemeId = 'default' | 'baroque' | 'eclectic';
export const FOLIO_THEMES: Array<{ id: FolioThemeId; label: string }> = [{ id: 'default', label: 'Classic' }, { id: 'baroque', label: 'Lit stage' }, { id: 'eclectic', label: 'Field notebook' }];
interface Prefs { size: 0 | 1 | 2; bullets: BulletMarker; motion: 'auto' | 'on' | 'off'; easy: boolean; theme: FolioThemeId }
const DEFAULT: Prefs = { size: 1, bullets: 'auto', motion: 'on', easy: false, theme: 'default' };
const PREF_KEY = 'plajah:folio';
const loadPrefs = (): Prefs => { try { const r = JSON.parse(localStorage.getItem(PREF_KEY) || '{}'); if (r.calm === true && !r.motion) r.motion = 'off'; return { ...DEFAULT, ...r }; } catch { return DEFAULT; } };
const savePrefs = (p: Prefs) => { try { localStorage.setItem(PREF_KEY, JSON.stringify(p)); } catch { /* private mode */ } };
const understoodKey = (id: string) => `plajah:folio:understood:${id}`;

let fontsAdded = false;
function ensureFonts() {
  if (fontsAdded || typeof document === 'undefined') return; fontsAdded = true;
  const l = document.createElement('link'); l.rel = 'stylesheet';
  l.href = 'https://fonts.googleapis.com/css2?family=Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,600;1,8..60,400&family=Atkinson+Hyperlegible:wght@400;700&family=Cormorant+Garamond:wght@500;600&family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,600;1,6..72,400&family=Fraunces:opsz,wght@9..144,600;9..144,700&display=swap';
  document.head.appendChild(l);
}
const reducedMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const SIZE_MUL = [0.92, 1, 1.18];

/** Theme tokens. `acc` is the colour of light/ink; the default theme uses the course colour. */
const THEMES: Record<FolioThemeId, { acc?: string; acc2: string; acc3: string; body: string; display: string; paper: string }> = {
  default: { acc2: '#ffb547', acc3: '#5ff0c6', body: '"Source Serif 4", Georgia, serif', display: '"Cormorant Garamond", Georgia, serif', paper: '#14111e' },
  baroque: { acc: '#ffb547', acc2: '#ff7a59', acc3: '#e9e4da', body: '"Newsreader", Georgia, serif', display: '"Fraunces", Georgia, serif', paper: '#08060d' },
  eclectic: { acc: '#d4a017', acc2: '#c24b3a', acc3: '#86a4d1', body: '"Source Serif 4", Georgia, serif', display: '"Cormorant Garamond", Georgia, serif', paper: '#f1ead7' },
};

const CSS = TELA_MOTION_CSS + `
.folio{--ink:rgba(240,236,228,.92)}
.folio .fl{font-variant-caps:all-small-caps;letter-spacing:.1em;font-size:.82em;font-style:normal}
.folio .ft{font-weight:600;line-height:1.05}
.folio .fp::first-letter{float:left;font-family:var(--disp);font-weight:600;font-size:3.6em;line-height:.82;padding:.06em .1em 0 0;color:var(--acc)}
.folio .fc{margin:1.3em 0;padding-left:14px;border-left:2px solid var(--acc)}
.folio .fc .fl{display:block;color:var(--acc);margin-bottom:.3em}
.folio .fc-why{font-style:italic;font-size:1.08em;transition:box-shadow 350ms ease-out}
.folio .fc-worked{background:rgba(255,255,255,.035);border-block:1px solid rgba(255,255,255,.12);padding:.7em 12px;font-variant-numeric:tabular-nums lining-nums}
.folio .fc-trap{border-left:4px double var(--acc);padding-right:12px}
.folio .fc-try{border-left-style:dotted;background:rgba(255,255,255,.03);padding-block:.7em;border-radius:0 12px 12px 0}
.folio .fc-example{border-color:rgba(255,255,255,.25);font-style:italic;opacity:.92}
.folio .fc-lit{box-shadow:-14px 0 28px -18px var(--acc)}

/* figures, shared */
.folio .ff{margin:1.6em 0;color:var(--ink);--f-ink:rgba(240,236,228,.88);--f-grid:rgba(255,255,255,.12);--f-accent:var(--acc);--f-accent2:var(--acc2);--f-accent3:var(--acc3);--f-paper:var(--paper)}
.folio .ff-title{margin:0 0 .5em;font-variant-caps:all-small-caps;letter-spacing:.1em;color:var(--acc)}
.folio .ff-body{background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.1);border-radius:6px;padding:10px;overflow:hidden}
.folio .ff-plate .ff-body,.folio .ff-video .ff-body,.folio .ff-audio .ff-body{padding:0;background:none;border:none}
.folio .ff figcaption{font-size:.84em;line-height:1.5;margin-top:.55em;opacity:.85}
.folio .ff figcaption em{opacity:.7}
.folio .ff figcaption a{text-decoration:underline;text-underline-offset:2px}
.folio .ff svg text{font-family:system-ui,sans-serif}
.folio .ff-video iframe,.folio .ff-video video{width:100%;aspect-ratio:16/9;border:0;border-radius:6px;background:#000;display:block}
.folio .ff-wait{opacity:.6;font-size:.85em}
.folio .ff-timeline{list-style:none;margin:0;padding:6px 4px 6px 18px;border-left:2px solid var(--acc)}
.folio .ff-timeline li{position:relative;padding:0 0 .9em 14px;display:grid;grid-template-columns:5.5em 1fr;gap:10px}
.folio .ff-timeline li:last-child{padding-bottom:0}
.folio .ff-timeline li::before{content:"";position:absolute;left:-24px;top:.45em;width:10px;height:10px;border-radius:50%;background:var(--acc)}
.folio .ff-timeline b{font-variant-numeric:tabular-nums;color:var(--acc)}
.folio .ff-data{font-size:.8em;margin-top:.4em}
.folio .ff-data summary{cursor:pointer;opacity:.75}
.folio .ff-data table{border-collapse:collapse;margin-top:.4em;font-variant-numeric:tabular-nums}
.folio .ff-data th,.folio .ff-data td{border:1px solid rgba(255,255,255,.14);padding:2px 8px;text-align:right}
@media(min-width:900px){.folio .ff-margin{float:right;width:44%;margin:.2em -48% 1em 1.2em}}
.folio .ff-inline{max-width:100%}

/* BAROQUE: a lit stage */
.folio.t-baroque .fc{border-left-width:3px;background:rgba(255,255,255,.025)}
.folio.t-baroque .fp{text-shadow:none}
.folio.t-baroque .fp::first-letter{text-shadow:0 0 22px rgba(255,181,71,.55)}
.folio.t-baroque .fc-worked{background:#07050c;box-shadow:inset 0 0 0 1px rgba(255,255,255,.07);border:0;border-left:3px solid var(--acc)}
.folio.t-baroque .fc-why{margin-inline:-12px;padding:18px 20px;background:linear-gradient(0deg,rgba(255,181,71,.22),rgba(255,181,71,.04));font-size:1.12em}
.folio.t-baroque .fc-trap{border-left-style:solid;border-image:repeating-linear-gradient(45deg,#c9a36a 0 4px,transparent 4px 8px) 1}
.folio.t-baroque .ff-body{background:#07050c;border-color:rgba(255,181,71,.25);box-shadow:0 0 38px -16px var(--acc)}
.folio.t-baroque .ff-plate .ff-body{box-shadow:0 22px 50px -26px var(--acc);border:0}
.folio.t-baroque .ff figcaption{font-style:italic}

/* ECLECTIC: a field notebook */
.folio.t-eclectic{background-image:linear-gradient(90deg,transparent 31px,rgba(194,75,58,.18) 31px 32px,transparent 32px);background-repeat:no-repeat}
.folio.t-eclectic .fc{border:0;color:#1c1a24;padding:12px 16px;position:relative;font-size:.96em}
.folio.t-eclectic .fc .fl{color:#7a5a00}
.folio.t-eclectic .fc-worked{background:#f4efe0 repeating-linear-gradient(0deg,transparent 0 20px,rgba(134,164,209,.35) 20px 21px),repeating-linear-gradient(90deg,transparent 0 20px,rgba(134,164,209,.35) 20px 21px);transform:rotate(-.4deg);border:0}
.folio.t-eclectic .fc-why{background:#efe3c8;padding-left:64px;font-style:normal}
.folio.t-eclectic .fc-why::before{content:"";position:absolute;left:14px;top:50%;width:34px;height:34px;margin-top:-17px;border-radius:50%;background:radial-gradient(circle at 35% 35%,#c24b3a,#7e1f14);box-shadow:0 0 0 3px rgba(163,50,31,.35)}
.folio.t-eclectic .fc-trap{background:#f1e8d4;clip-path:polygon(0 3%,6% 0,14% 4%,24% 1%,38% 4%,52% 0,66% 3%,80% 0,92% 4%,100% 1%,99% 97%,86% 100%,70% 96%,52% 100%,35% 97%,18% 100%,6% 97%,0 100%);border:0}
.folio.t-eclectic .fc-try{background:#f4efe0;border:0;border-radius:0}
.folio.t-eclectic .fc-try::after{content:"";display:block;border-bottom:1px solid rgba(28,26,36,.4);margin-top:1.6em}
.folio.t-eclectic .fc-example{background:#f4efe0;font-style:normal;opacity:1;transform:rotate(.3deg)}
.folio.t-eclectic .ff{--f-ink:#1c1a24;--f-grid:rgba(28,26,36,.18);--ink:#1c1a24}
.folio.t-eclectic .ff-body{background:#f4efe0;border:0;box-shadow:0 2px 0 rgba(0,0,0,.35);transform:rotate(-.3deg);position:relative}
.folio.t-eclectic .ff-plate .ff-body{background:#fffaf0;padding:10px 10px 14px}
.folio.t-eclectic .ff-body::before{content:"";position:absolute;left:50%;top:-9px;width:78px;height:18px;margin-left:-39px;background:rgba(212,160,23,.55);transform:rotate(-2deg)}
.folio.t-eclectic .ff-title,.folio.t-eclectic .ff-timeline b{color:#d4a017}
.folio.t-eclectic .ff-timeline{border-left-color:#d4a017}
.folio.t-eclectic .ff-timeline li::before{background:#c24b3a}
.folio.t-eclectic .ff figcaption{color:rgba(240,236,228,.85)}

/* ALIVE: slow, subtle motion. Everything is visible without it; Calm and reduced motion switch it all off. */
@keyframes f-rise{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
@keyframes f-settle{from{opacity:0;transform:translateY(8px) rotate(var(--r0,-1.2deg))}to{opacity:1;transform:rotate(var(--r1,0deg))}}
@keyframes f-draw{from{stroke-dashoffset:1}to{stroke-dashoffset:0}}
@keyframes f-breathe{0%,100%{opacity:.5;transform:translate3d(0,0,0) scale(1)}50%{opacity:.85;transform:translate3d(14px,6px,0) scale(1.07)}}
@keyframes f-glow{0%,100%{box-shadow:-14px 0 24px -18px var(--acc)}50%{box-shadow:-18px 0 36px -15px var(--acc)}}
@keyframes f-sheen{0%,100%{background-position:0% 100%}50%{background-position:0% 60%}}
.folio .fglow{position:absolute;left:-60px;top:-70px;width:420px;height:280px;background:radial-gradient(closest-side,var(--acc),transparent);opacity:.12;pointer-events:none;z-index:0}
.folio figure{background:var(--paper)}
.folio.t-baroque .fglow{opacity:.26}
.folio.t-eclectic .fglow{opacity:.07}
.folio:not(.calm) .fa{animation:f-rise .8s cubic-bezier(.2,.7,.2,1) both;animation-delay:calc(var(--i,0)*90ms)}
.folio:not(.calm).t-eclectic .fa.fc,.folio:not(.calm).t-eclectic .fa.ff{animation-name:f-settle;--r0:-1.4deg;--r1:-.3deg}
.folio:not(.calm) .fglow{animation:f-breathe 12s ease-in-out infinite}
.folio:not(.calm) .fc-lit{animation:f-glow 7s ease-in-out infinite}
.folio:not(.calm).t-baroque .fc-why{background-size:100% 220%;animation:f-sheen 11s ease-in-out infinite}
.folio:not(.calm) .frule path{stroke-dasharray:1;animation:f-draw 1.2s ease-out .2s both}
@media (prefers-reduced-motion:reduce){.folio:not(.force-motion) .fa,.folio:not(.force-motion) .fglow,.folio:not(.force-motion) .fc-lit,.folio:not(.force-motion) .fc-why,.folio:not(.force-motion) .frule path{animation:none!important}}

/* TELA MOTION (shared layer) */
.folio .tm:has(figure){position:relative;z-index:2}
.folio.t-baroque{--tm-glow-a:.26}
.folio.t-eclectic{--tm-glow-a:.1}
.folio.nomo .tm-glow{display:none}
.folio .ff-controls{display:flex;flex-wrap:wrap;align-items:center;gap:8px 14px;margin-top:8px;font:12px/1.4 system-ui,sans-serif;color:var(--f-ink)}
.folio .ff-controls label{display:inline-flex;align-items:center;gap:8px}
.folio .ff-controls input[type=range]{accent-color:var(--f-accent);width:150px}
.folio .ff-controls output{opacity:.8;font-variant-numeric:tabular-nums}
.folio .ff-controls button{font:inherit;padding:3px 12px;border-radius:99px;border:1px solid currentColor;background:transparent;color:inherit;cursor:pointer;opacity:.9}
.folio .ff-controls button:disabled{opacity:.35;cursor:default}
.folio .fcheck{margin:2em 0 0;padding:14px 16px;border-radius:10px;border:1px solid color-mix(in srgb,var(--acc) 40%,transparent);background:color-mix(in srgb,var(--acc) 7%,transparent);font-family:system-ui,sans-serif}
.folio .fcheck .fcq{margin:.4em 0 .8em;font-family:inherit;font-size:1.02em;line-height:1.5}
.folio .fcheck .fca{display:grid;gap:7px}
.folio .fcheck .fcc{text-align:left;font:inherit;font-size:.94em;padding:8px 12px;border-radius:8px;border:1px solid rgba(255,255,255,.25);background:transparent;color:inherit;cursor:pointer;transition:border-color .2s,background .2s}
.folio .fcheck .fcc:hover:not(:disabled){border-color:var(--acc)}
.folio .fcheck .fcc.ok{border-color:#5ff0c6;background:rgba(95,240,198,.14)}
.folio .fcheck .fcc.no{border-color:#ff7a59;background:rgba(255,122,89,.14)}
.folio .fcheck .fcx{margin-top:.8em;font-size:.9em;line-height:1.55;min-height:1.2em}
.folio .fcheck .fcr{font:inherit;margin-left:6px;padding:2px 10px;border-radius:99px;border:1px solid currentColor;background:transparent;color:inherit;cursor:pointer}
.folio.t-eclectic .fcheck{background:#f4efe0;color:#1c1a24;border-color:#d6c9a4}
.folio.t-eclectic .fcheck .fcc{border-color:#b9ab80}
/* LISTS: markers are a viewer choice (reading settings) or authored (- * + > 1.) */
.folio .fl-list{margin:0 0 1.1em;padding:0;list-style:none;counter-reset:fl}
.folio .fl-list li{position:relative;padding-left:1.6em;margin:0 0 .45em;counter-increment:fl}
.folio .fl-list li::before{position:absolute;left:0;top:0;color:var(--acc);font-weight:600}
.folio .fl-list.fb-auto li::before,.folio .fl-list.fb-dot li::before{content:"";width:.42em;height:.42em;border-radius:50%;background:var(--acc);top:.62em;left:.3em}
.folio.t-baroque .fl-list.fb-auto li::before{border-radius:0;transform:rotate(45deg);box-shadow:0 0 8px var(--acc)}
.folio.t-eclectic .fl-list.fb-auto li::before{content:"\\2726";width:auto;height:auto;background:none;top:0;left:0;color:var(--acc2)}
.folio .fl-list.fb-dash li::before{content:"\\2013"}
.folio .fl-list.fb-arrow li::before{content:"\\2192"}
.folio .fl-list.fb-check li::before{content:"\\2713"}
.folio .fl-list.fb-star li::before{content:"\\2605";font-size:.8em;top:.12em}
.folio .fl-list.fb-number li::before{content:counter(fl) ".";font-variant-numeric:tabular-nums}
/* TEACHER VERSION */
.folio .fcust{margin:0 0 1.2em;padding:10px 14px;border-radius:8px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.12);font-size:.86em;line-height:1.5}
.folio .fcust b{color:var(--acc)}
.folio .fcust .fcn{opacity:.8;font-style:italic;margin-top:.3em}
.folio .fcust button{font:inherit;font-size:.95em;margin-top:.5em;padding:3px 12px;border-radius:99px;border:1px solid rgba(255,255,255,.3);background:transparent;color:inherit;cursor:pointer}
.folio .fchg{box-shadow:inset 3px 0 0 -1px rgba(255,255,255,.55);padding-left:10px;margin-left:-10px;border-radius:2px}
.folio.t-eclectic .fcust{background:#f4efe0;color:#1c1a24;border-color:#d6c9a4}
.folio.t-eclectic .fcust b{color:#7a5a00}
@media print{.folio-controls{display:none}}
`;

const Callout: React.FC<{ b: Block; light: boolean; anim?: number; chg?: boolean }> = ({ b, light, anim = 0, chg = false }) => {
  const ref = useRef<HTMLElement>(null);
  const [lit, setLit] = useState(!b.emphasised || !light);
  useEffect(() => {
    if (!b.emphasised || !light || !ref.current) return;
    const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { setLit(true); io.disconnect(); } }, { threshold: 0.6 });
    io.observe(ref.current); return () => io.disconnect();
  }, [b.emphasised, light]);
  return <aside ref={ref as any} role="note" aria-label={b.label} className={`fa fc fc-${b.variant || 'example'}${lit && b.emphasised ? ' fc-lit' : ''}${chg ? ' fchg' : ''}`} title={chg ? 'Changed by the teacher' : undefined} style={{ ['--i' as any]: anim }}><span className="fl">{b.label}</span>{b.text}</aside>;
};

export interface Customization { credit: string; adapted?: string | null; note?: string; stale?: boolean; changed: Set<number>; showingOriginal?: boolean; onToggleOriginal?: () => void; integrity: string }
const LessonFolio: React.FC<{ lessonId: string; title: string; courseTitle: string; body: string; accent: string; band?: Band; figures?: Figure[]; customization?: Customization | null; actions?: React.ReactNode; scrollRef?: React.RefObject<HTMLElement | null>; onUnderstood?: (id: string) => void }> = ({ lessonId, title, courseTitle, body, accent, band = 'adult', figures = [], customization = null, actions = null, scrollRef, onUnderstood }) => {
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);
  const [open, setOpen] = useState(false);
  const [understood, setUnderstood] = useState(() => { try { return localStorage.getItem(understoodKey(lessonId)) === '1'; } catch { return false; } });
  const [progress, setProgress] = useState(0);
  useEffect(() => { ensureFonts(); }, []);
  useEffect(() => { try { setUnderstood(localStorage.getItem(understoodKey(lessonId)) === '1'); } catch { setUnderstood(false); } }, [lessonId]);
  const set = (p: Partial<Prefs>) => setPrefs(cur => { const n = { ...cur, ...p }; savePrefs(n); return n; });

  // The lesson IS a Tela document: text in a Writer device, charts in CHART devices, the rest in FIGURE devices.
  const doc = useMemo(() => lessonToTelaDoc({ lessonId, title, courseTitle, body, figures, theme: prefs.theme }), [lessonId, title, courseTitle, body, figures, prefs.theme]);
  const minutes = useMemo(() => parseFolio(body).minutes, [body]);
  const blocks = useMemo<Block[]>(() => {
    const w = Object.values(doc.devices).find(d => d.type === 'WRITER');
    const out: Block[] = [];
    if (w && w.type === 'WRITER') for (const b of w.blocks) {
      const l = b.lesson; if (!l) continue;
      if (l.role === 'list') {
        const last = out[out.length - 1];
        if (last && last.kind === 'list' && last.index === (l.sourceIndex ?? 0)) { last.items!.push(b.text); last.text += '\n' + b.text; }
        else out.push({ kind: 'list', marker: l.bullet as any, items: [b.text], text: b.text, index: l.sourceIndex ?? 0, section: l.section ?? 0 });
        continue;
      }
      out.push({ kind: l.role as any, variant: l.variant as any, label: l.label, text: b.text, index: l.sourceIndex ?? 0, section: l.section ?? 0, emphasised: l.emphasised });
    }
    return out;
  }, [doc]);
  const placed = useMemo(() => {
    const m = new Map<number, NonNullable<typeof doc.lesson>['figures']>();
    for (const f of doc.lesson?.figures || []) (m.get(f.after) || m.set(f.after, []).get(f.after)!).push(f);
    return m;
  }, [doc]);
  const renderCtx = useMemo(() => {
    const maps = buildRenderMaps(doc.devices, doc.frames, b => b.text);
    return { devices: doc.devices, dispatchOp: () => {}, uid: (p: string) => p, ...maps };
  }, [doc]);
  const seed = useMemo(() => seedOf(lessonId), [lessonId]);
  const rule = useMemo(() => wobblyRule(seed), [seed]);
  const sysReduced = reducedMotion();
  const calm = prefs.motion === 'off' || (prefs.motion === 'auto' && sysReduced);
  const forced = prefs.motion === 'on';
  const sc = SCALE[band];
  const px = sc.px * SIZE_MUL[prefs.size];
  const th = THEMES[prefs.theme] || THEMES.default;
  const acc = th.acc || accent;
  const bodyFont = prefs.easy ? '"Atkinson Hyperlegible", Verdana, sans-serif' : th.body;

  const rootRef = useRef<HTMLDivElement>(null);
  const pointRef = useRef<HTMLDivElement>(null);
  useTelaPointerGlow(rootRef, pointRef, prefs.motion !== 'off'); // follows the viewer's own pointer, so it stays on under the device's reduced-motion hint; only an explicit Motion: off hides it

  useEffect(() => {
    const el = scrollRef?.current; if (!el) return;
    const on = () => { const max = el.scrollHeight - el.clientHeight; setProgress(max > 0 ? Math.min(1, el.scrollTop / max) : 1); };
    on(); el.addEventListener('scroll', on, { passive: true }); return () => el.removeEventListener('scroll', on);
  }, [scrollRef, lessonId, body]);

  const mark = () => { const v = !understood; setUnderstood(v); try { localStorage.setItem(understoodKey(lessonId), v ? '1' : '0'); } catch { /* */ } if (v) onUnderstood?.(lessonId); };
  const roman = ((n: number) => { const r: Array<[number, string]> = [[10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']]; let o = ''; for (const [v, s] of r) while (n >= v) { o += s; n -= v; } return o; })(parseInt(lessonId.slice(lessonId.lastIndexOf('.l') + 2), 10) || 0);

  let textIdx = -1;
  const pill = (on: boolean) => `px-3 py-1 rounded-full border ${on ? 'bg-white text-black border-white' : 'border-white/20 text-white/70'}`;
  return (
    <div className={`folio t-${prefs.theme}${calm ? ' calm' : ''}${forced ? ' force-motion' : ''}${prefs.motion === 'off' ? ' nomo' : ''} relative`} ref={rootRef} style={{ ['--acc' as any]: acc, ['--acc2' as any]: th.acc2, ['--acc3' as any]: th.acc3, ['--paper' as any]: th.paper, ['--tm-glow' as any]: acc, ['--disp' as any]: th.display, fontFamily: bodyFont, fontSize: px, lineHeight: prefs.easy ? sc.lead + 0.15 : sc.lead, letterSpacing: prefs.easy ? '0.02em' : undefined, color: 'rgba(240,236,228,.92)' }}>
      <style>{CSS}</style>
      <div className="fglow" aria-hidden="true" />
      <div className="tm-glow fpoint" ref={pointRef} aria-hidden="true" />
      <div aria-hidden="true" className="absolute left-[-14px] top-0 bottom-0 w-[2px]" style={{ background: 'rgba(255,255,255,.08)', boxShadow: prefs.theme === 'baroque' && !calm ? `0 0 12px ${acc}` : undefined }}>
        <div style={{ height: `${progress * 100}%`, background: acc, transition: calm ? 'none' : 'height 120ms linear' }} />
      </div>

      <header className="mb-6 fa" style={{ maxWidth: sc.measure, ['--i' as any]: 0 }}>
        <div className="flex items-baseline gap-3">
          <span className="fl" style={{ color: acc }}>{courseTitle}</span>
          <span className="fl opacity-60">{roman ? `Lesson ${roman}` : ''} · {minutes} min</span>
          <button type="button" aria-label="Reading settings" aria-expanded={open} onClick={() => setOpen(o => !o)} className="folio-controls ml-auto text-white/50 hover:text-white p-1 rounded"><Type size={15} /></button>
        </div>
        <h2 className="ft mt-1" style={{ fontFamily: th.display, fontSize: '1.9em' }}>{title}</h2>
        <svg aria-hidden="true" viewBox="0 0 600 4" preserveAspectRatio="none" className="w-full h-[4px] mt-2 frule"><path pathLength={1} d={rule} fill="none" stroke={acc} strokeWidth="1.4" strokeLinecap="round" /></svg>
        {open && (
          <div role="group" aria-label="Reading settings" className="folio-controls mt-3 grid gap-2 text-[12px]" style={{ fontFamily: 'system-ui, sans-serif' }}>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Look">{FOLIO_THEMES.map(t => <button key={t.id} type="button" aria-pressed={prefs.theme === t.id} onClick={() => set({ theme: t.id })} className={pill(prefs.theme === t.id)}>{t.label}</button>)}</div>
            <div className="flex flex-wrap gap-2">
              {(['Smaller', 'Normal', 'Larger'] as const).map((l, i) => <button key={l} type="button" aria-pressed={prefs.size === i} onClick={() => set({ size: i as 0 | 1 | 2 })} className={pill(prefs.size === i)}>{l}</button>)}
              <button type="button" aria-pressed={prefs.easy} onClick={() => set({ easy: !prefs.easy })} className={pill(prefs.easy)}>Easier to read</button>
              <label className="inline-flex items-center gap-1 text-white/70">Bullets <select aria-label="Bullet style" value={prefs.bullets} onChange={e => set({ bullets: e.target.value as BulletMarker })} className="bg-transparent border border-white/20 rounded-full px-2 py-1">{(['auto', 'dot', 'dash', 'arrow', 'check', 'star', 'number'] as const).map(m => <option key={m} value={m} style={{ color: '#000' }}>{m === 'auto' ? 'As written' : m[0].toUpperCase() + m.slice(1)}</option>)}</select></label>
              {(['auto', 'on', 'off'] as const).map(m => <button key={m} type="button" aria-pressed={prefs.motion === m} onClick={() => set({ motion: m })} className={pill(prefs.motion === m)}>{m === 'auto' ? 'Motion: auto' : m === 'on' ? 'Motion: on' : 'Motion: off'}</button>)}
            </div>
          </div>)}
      </header>

      <div style={{ maxWidth: sc.measure }}>
        {sysReduced && prefs.motion === 'auto' && (
          <div className="fcust folio-controls" role="note" style={{ fontFamily: 'system-ui, sans-serif' }}>
            Your device asks apps to reduce motion, so this lesson is holding still. <button type="button" onClick={() => set({ motion: 'on' })}>Turn gentle motion on</button>
          </div>)}
        {customization && (
          <div className="fcust fa" role="note" style={{ ['--i' as any]: 1 }}>
            <b>{customization.showingOriginal ? 'Original lesson' : customization.credit}</b>
            {!customization.showingOriginal && <> for their class{customization.adapted ? `. ${customization.adapted}` : ''}.</>}
            {!customization.showingOriginal && customization.note && <div className="fcn">"{customization.note}"</div>}
            <div style={{ opacity: .75, marginTop: '.3em' }}>{customization.showingOriginal ? 'This is the lesson as Plajah wrote it.' : customization.integrity}</div>
            {customization.stale && !customization.showingOriginal && <div style={{ marginTop: '.3em' }}>The original lesson has been updated since this version was made. Compare the two before you rely on it.</div>}
            {customization.onToggleOriginal && <button type="button" onClick={customization.onToggleOriginal}>{customization.showingOriginal ? 'Show the teacher version' : 'Show the original'}</button>}
          </div>)}
        {blocks.map((b, i) => {
          const prev = blocks[i - 1];
          const gap = prev && prev.section !== b.section && b.kind !== 'callout';
          const anim = Math.min(i + 2, 12);
          const chg = !!customization && !customization.showingOriginal && customization.changed.has(b.index);
          if (b.kind === 'list') {
            const m: BulletMarker = prefs.bullets !== 'auto' ? prefs.bullets : (b.marker && b.marker !== 'auto' ? b.marker : 'auto');
            const Tag = m === 'number' ? 'ol' : 'ul';
            return <TelaReveal key={i} enabled={!calm} className="fa" style={{ ['--i' as any]: anim }}><Tag className={`fl-list fb-${m}${chg ? ' fchg' : ''}`}>{(b.items || []).map((it, k) => <li key={k}>{it}</li>)}</Tag></TelaReveal>;
          }
          if (b.kind === 'callout') return <Callout key={i} b={b} light={!calm} anim={anim} chg={chg} />;
          textIdx++;
          const figs = placed.get(textIdx) || [];
          return (
            <React.Fragment key={i}>
              {gap && <div aria-hidden="true" className="my-7 text-center opacity-40" style={{ color: acc, letterSpacing: '0.6em' }}>· · ·</div>}
              <p className={`${b.kind === 'lede' && !prefs.easy && band !== 'early' ? 'fp ' : ''}fa${chg ? ' fchg' : ''} mb-[1.1em]`} title={chg ? 'Changed by the teacher' : undefined} style={{ fontSize: b.kind === 'lede' ? '1.1em' : undefined, ['--i' as any]: anim }}>{b.text}</p>
              {figs.map(f => { const dev = doc.devices[f.deviceId]; if (!dev) return null; return (
                <TelaReveal key={f.deviceId} enabled={!calm} className="fa" style={{ ['--i' as any]: Math.min(anim + 1, 13) }}>
                  {dev.type === 'CHART'
                    ? <figure className="ff ff-chart ff-inline"><div className="ff-body">{renderDevice(dev, renderCtx, true)}</div><figcaption><span>{f.caption}</span>{(f.credit || f.sourceUrl) && <em> {f.credit}{f.sourceUrl && <> <a href={f.sourceUrl} target="_blank" rel="noreferrer noopener">Source</a></>}</em>}</figcaption></figure>
                    : renderDevice(dev, renderCtx, true)}
                </TelaReveal>); })}
            </React.Fragment>);
        })}
        {!(customization && !customization.showingOriginal) && <LessonCheck lessonId={lessonId} />}
        <div className="folio-controls mt-8 pt-5 border-t border-white/10 flex items-center gap-3 flex-wrap">
          <button type="button" aria-pressed={understood} onClick={mark} className="inline-flex items-center gap-2 text-[13px] px-4 py-2 rounded-full border" style={{ fontFamily: 'system-ui, sans-serif', borderColor: understood ? acc : 'rgba(255,255,255,.25)', background: understood ? acc : 'transparent', color: understood ? '#0b0b10' : 'rgba(255,255,255,.8)' }}>
            {understood ? <Check size={14} /> : <span aria-hidden="true" className="w-3.5 h-3.5 rounded-full border border-current inline-block" />} {understood ? 'Understood' : 'Mark as understood'}
          </button>
          <span className="fl opacity-50">Set by Plajah Academia</span>{actions}
        </div>
      </div>
    </div>
  );
};
export default LessonFolio;
