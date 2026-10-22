// LoreaStations — the hands-on part of each Lorea room. Every station is a paper index card with
// one thing to do: tap stresses, sort a pyramid, hunt words, flip a remix, build a sentence, hear
// the cadence of prose, answer a question. All data-driven (see loreaExhibitTypes).
import React, { useMemo, useState } from 'react';
import type {
  CadenceStation, ChoiceStation, HuntStation, LoreaStation, RemixStation, SentenceStation, SortStation, StressStation,
} from '../../../services/loreaExhibits/loreaExhibitTypes';
import { seedOf, wobblePath } from './paperKit';

/** Seeded shuffle that leaves at least half the items out of place, so a sort is never nearly solved. */
function shuffle<T>(arr: T[], seed: number): T[] {
  let s = seed || 1; let a = arr.slice();
  for (let tries = 0; tries < 12; tries++) {
    a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { s = (s * 1664525 + 1013904223) >>> 0; const j = s % (i + 1); [a[i], a[j]] = [a[j], a[i]]; }
    if (a.filter((x, i) => x !== arr[i]).length >= Math.ceil(arr.length / 2)) return a;
  }
  return a.length > 1 ? [...a.slice(1), a[0]] : a;
}

const Done = ({ children }: { children: React.ReactNode }) => <div className="lxs-done lx-ink-in"><span className="lx-stamp">✓ got it</span><p>{children}</p></div>;

// ── sort ──
function Sort({ st, sid }: { st: SortStation; sid: string }) {
  const [order, setOrder] = useState(() => shuffle(st.items, seedOf(sid)));
  const [picked, setPicked] = useState<number | null>(null);
  const [checked, setChecked] = useState(false);
  const right = order.map((it, i) => it.id === st.items[i].id);
  const solved = right.every(Boolean);
  const tap = (i: number) => {
    setChecked(false);
    if (picked === null) { setPicked(i); return; }
    if (picked !== i) { const o = order.slice(); [o[picked], o[i]] = [o[i], o[picked]]; setOrder(o); }
    setPicked(null);
  };
  const n = order.length;
  return (
    <div className={`lxs-sort lxs-${st.shape}`}>
      {st.shape === 'arc' && (
        <svg className="lxs-arcline" viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden>
          <path d="M2 38 C20 36 30 6 52 4 S80 30 98 38" />
        </svg>
      )}
      <ol>
        {order.map((it, i) => {
          const style: React.CSSProperties = st.shape === 'pyramid'
            ? { width: `${100 - (i / Math.max(1, n - 1)) * 52}%` }
            : st.shape === 'arc'
              ? { ['--lift' as any]: `${Math.sin((i / Math.max(1, n - 1)) * Math.PI * 0.92) * 1}` }
              : {};
          return (
            <li key={it.id} style={style}>
              <button type="button" onClick={() => tap(i)} className={`${picked === i ? 'is-picked' : ''} ${checked ? (right[i] ? 'is-right' : 'is-wrong') : ''}`} aria-pressed={picked === i}>
                <b>{it.label}</b>{it.detail && <small>{it.detail}</small>}
              </button>
            </li>
          );
        })}
      </ol>
      <div className="lxs-row">
        <span className="lx-note">{picked === null ? 'tap two cards to swap them' : 'now tap where it goes'}</span>
        <button type="button" className="lxs-btn" onClick={() => setChecked(true)}>Check</button>
        <button type="button" className="lxs-btn ghost" onClick={() => { setOrder(st.items.slice()); setChecked(true); }}>Show me</button>
      </div>
      {checked && solved && <Done>{st.reveal}</Done>}
      {checked && !solved && <p className="lx-note lxs-hint">{right.filter(Boolean).length} of {n} in place — the ones circled red want to move.</p>}
    </div>
  );
}

// ── stress ──
function Stress({ st }: { st: StressStation }) {
  const [li, setLi] = useState(0);
  const line = st.lines[li];
  const [marks, setMarks] = useState<boolean[]>(() => line.syllables.map(() => false));
  const [checked, setChecked] = useState(false);
  const go = (i: number) => { setLi(i); setMarks(st.lines[i].syllables.map(() => false)); setChecked(false); };
  const truth = line.syllables.map((_, i) => line.stresses.includes(i));
  const score = marks.filter((m, i) => m === truth[i]).length;
  return (
    <div className="lxs-stress">
      <div className="lxs-tabs">{st.lines.map((l, i) => <button type="button" key={i} onClick={() => go(i)} className={i === li ? 'on' : ''}>{l.cite.split(/[,(]/)[0].trim().split(' ').pop()}</button>)}</div>
      <div className="lxs-syls" role="group" aria-label="Syllables — tap the strong ones">
        {line.syllables.map((s, i) => (
          <button type="button" key={i} onClick={() => { const m = marks.slice(); m[i] = !m[i]; setMarks(m); setChecked(false); }}
            className={`${marks[i] ? 'is-on' : ''} ${checked ? (marks[i] === truth[i] ? 'is-right' : 'is-wrong') : ''}`}>
            <i aria-hidden>{(checked ? truth[i] : marks[i]) ? '/' : '˘'}</i>{s}
          </button>
        ))}
      </div>
      <p className="lx-note lxs-cite">— {line.cite}</p>
      <div className="lxs-row">
        <span className="lx-note">tap the syllables you lean on</span>
        <button type="button" className="lxs-btn" onClick={() => setChecked(true)}>Scan it</button>
        <button type="button" className="lxs-btn ghost" onClick={() => { setMarks(truth); setChecked(true); }}>Show me</button>
      </div>
      {checked && (score === line.syllables.length
        ? <Done>That is <b>{line.meter}</b>. Say it aloud and tap the table on the strong beats.</Done>
        : <p className="lx-note lxs-hint">{score} of {line.syllables.length} syllables match. Read it aloud, slowly, a little too much like a song.</p>)}
    </div>
  );
}

// ── hunt ──
function Hunt({ st }: { st: HuntStation }) {
  // split the passage so each target is its own tappable chunk, the rest tappable by word
  const pieces = useMemo(() => {
    type P = { text: string; target?: number };
    let parts: P[] = [{ text: st.passage }];
    st.targets.forEach((t, ti) => {
      const next: P[] = [];
      for (const p of parts) {
        if (p.target !== undefined) { next.push(p); continue; }
        const at = p.text.indexOf(t.text);
        if (at < 0) { next.push(p); continue; }
        if (at > 0) next.push({ text: p.text.slice(0, at) });
        next.push({ text: t.text, target: ti });
        if (at + t.text.length < p.text.length) next.push({ text: p.text.slice(at + t.text.length) });
      }
      parts = next;
    });
    return parts;
  }, [st]);
  const [found, setFound] = useState<Set<number>>(new Set());
  const [miss, setMiss] = useState<string | null>(null);
  const all = found.size === st.targets.length;
  return (
    <div className="lxs-hunt">
      <p className="lxs-passage">
        {pieces.map((p, i) => p.target !== undefined
          ? <button type="button" key={i} className={`lxs-word ${found.has(p.target) ? 'is-found' : ''}`} onClick={() => { setFound(new Set(found).add(p.target!)); setMiss(null); }}>
              {p.text}{found.has(p.target) && <svg viewBox="0 0 100 8" preserveAspectRatio="none" aria-hidden><path d={wobblePath(i * 7 + 3)} /></svg>}
            </button>
          : p.text.split(/(\s+)/).map((w, k) => /\S/.test(w)
            ? <span key={`${i}-${k}`} className="lxs-plain" onClick={() => setMiss(w)}>{w}</span>
            : <React.Fragment key={`${i}-${k}`}>{w}</React.Fragment>))}
      </p>
      <p className="lx-note lxs-cite">— {st.cite}</p>
      <div className="lxs-found">
        {st.targets.map((t, i) => <span key={i} className={found.has(i) ? 'on' : ''}>{found.has(i) ? `“${t.text}” — ${t.label}` : '· · ·'}</span>)}
      </div>
      <div className="lxs-row">
        <span className="lx-note">{miss ? `“${miss}” isn't one — keep looking` : `${found.size} of ${st.targets.length} found`}</span>
        <button type="button" className="lxs-btn ghost" onClick={() => setFound(new Set(st.targets.map((_, i) => i)))}>Show me</button>
      </div>
      {all && <Done>All found. Now you will spot them everywhere.</Done>}
    </div>
  );
}

// ── remix ──
function Remix({ st }: { st: RemixStation }) {
  const [i, setI] = useState(0);
  const v = st.variants[i];
  return (
    <div className="lxs-remix">
      <div className="lxs-tabs">{st.variants.map((x, k) => <button type="button" key={k} onClick={() => setI(k)} className={k === i ? 'on' : ''}>{x.label}</button>)}</div>
      <blockquote key={i} className="lx-ink-in">{v.text.split('\n').map((l, k) => <span key={k}>{l}<br /></span>)}</blockquote>
      <p className="lx-note lxs-margin" key={`n${i}`}>{v.note}</p>
    </div>
  );
}

// ── sentence ──
function Sentence({ st, sid }: { st: SentenceStation; sid: string }) {
  const tiles = useMemo(() => shuffle(st.tiles.map((t, i) => ({ ...t, i })), seedOf(sid)), [st, sid]);
  const [slots, setSlots] = useState<Array<number | null>>(() => st.slots.map(() => null));
  const [held, setHeld] = useState<number | null>(null);
  const used = new Set(slots.filter((x): x is number => x !== null));
  const full = slots.every(x => x !== null);
  const right = slots.map((x, k) => x !== null && st.tiles[x].role === st.slots[k].role);
  const solved = full && right.every(Boolean);
  const place = (k: number) => {
    if (held === null) { if (slots[k] !== null) { const s = slots.slice(); s[k] = null; setSlots(s); } return; }
    const s = slots.slice(); s[k] = held; setSlots(s); setHeld(null);
  };
  return (
    <div className="lxs-sentence">
      <div className="lxs-slots">
        {st.slots.map((s, k) => (
          <button type="button" key={k} onClick={() => place(k)} className={`lxs-slot ${slots[k] !== null ? 'filled' : ''} ${full ? (right[k] ? 'is-right' : 'is-wrong') : ''}`}>
            <span className="lxs-slot-word">{slots[k] !== null ? st.tiles[slots[k]!].text : ' '}</span>
            <span className="lxs-slot-role">{s.role}</span>
            {slots[k] === null && <small className="lx-note">{s.hint}</small>}
          </button>
        ))}
      </div>
      <div className="lxs-tiles">
        {tiles.map(t => (
          <button type="button" key={t.i} disabled={used.has(t.i)} onClick={() => setHeld(held === t.i ? null : t.i)} className={`lxs-tile ${held === t.i ? 'is-held' : ''}`}>{t.text}</button>
        ))}
      </div>
      <div className="lxs-row">
        <span className="lx-note">{held !== null ? 'now tap a blank' : 'pick a word, then a blank'}</span>
        <button type="button" className="lxs-btn ghost" onClick={() => { setSlots(st.slots.map(s => st.tiles.findIndex(t => t.role === s.role))); setHeld(null); }}>Show me</button>
        <button type="button" className="lxs-btn ghost" onClick={() => { setSlots(st.slots.map(() => null)); setHeld(null); }}>Clear</button>
      </div>
      {solved && <Done>{st.reveal}</Done>}
      {full && !solved && <p className="lx-note lxs-hint">Close — a word is wearing the wrong job. Tap a filled blank to empty it.</p>}
    </div>
  );
}

// ── cadence ──
const splitSentences = (t: string) => (t.replace(/\s+/g, ' ').match(/[^.!?;:]+[.!?;:]+["'”’)]*/g) || [t]).map(s => s.trim()).filter(Boolean);
function Cadence({ st }: { st: CadenceStation }) {
  const [i, setI] = useState(0);
  const [hover, setHover] = useState<number | null>(null);
  const p = st.passages[i];
  const sents = splitSentences(p.text);
  const lens = sents.map(s => s.split(/\s+/).filter(Boolean).length);
  const max = Math.max(...lens, 1);
  const avg = lens.reduce((a, b) => a + b, 0) / lens.length;
  const spread = Math.sqrt(lens.reduce((a, b) => a + (b - avg) ** 2, 0) / lens.length);
  return (
    <div className="lxs-cadence">
      <div className="lxs-tabs">{st.passages.map((x, k) => <button type="button" key={k} onClick={() => { setI(k); setHover(null); }} className={k === i ? 'on' : ''}>{x.label}</button>)}</div>
      <div className="lxs-bars" role="img" aria-label={`Sentence lengths: ${lens.join(', ')} words`}>
        {lens.map((n, k) => (
          <button type="button" key={`${i}-${k}`} onMouseEnter={() => setHover(k)} onFocus={() => setHover(k)} onClick={() => setHover(k)} style={{ height: `${12 + (n / max) * 88}%`, animationDelay: `${k * 60}ms` }} className={hover === k ? 'on' : ''}>
            <span>{n}</span>
          </button>
        ))}
      </div>
      <p className="lxs-passage small">{hover !== null ? <mark>{sents[hover]}</mark> : p.text}</p>
      <p className="lx-note lxs-cite">— {p.cite} · {lens.length} sentences, average {avg.toFixed(1)} words, {spread > avg * 0.5 ? 'wide swings — it sings' : spread > avg * 0.25 ? 'some variation' : 'even, steady beat'}</p>
    </div>
  );
}

// ── choice ──
function Choice({ st }: { st: ChoiceStation }) {
  const [pick, setPick] = useState<number | null>(null);
  return (
    <div className="lxs-choice">
      <p className="lxs-q">{st.question}</p>
      <div className="lxs-opts">
        {st.options.map((o, k) => (
          <button type="button" key={k} onClick={() => setPick(k)} className={pick === k ? (o.correct ? 'is-right' : 'is-wrong') : ''}>
            <span className="lxs-bullet">{String.fromCharCode(97 + k)}</span>{o.text}
          </button>
        ))}
      </div>
      {pick !== null && (st.options[pick].correct
        ? <Done>{st.options[pick].why}</Done>
        : <p className="lx-note lxs-hint lx-ink-in">{st.options[pick].why} Try another.</p>)}
    </div>
  );
}

const KIND_LABEL: Record<LoreaStation['kind'], string> = {
  sort: 'Put it in order', stress: 'Tap the beat', hunt: 'Find it', remix: 'Flip it', sentence: 'Build it', cadence: 'Hear the cadence', choice: 'Check yourself',
};

export function LoreaStationCard({ station, sid }: { station: LoreaStation; sid: string }) {
  const prompt = station.kind === 'choice' ? null : station.prompt;
  return (
    <div className="lxs-card lx-sheet">
      <div className="lxs-head"><span className="lx-stamp">{KIND_LABEL[station.kind]}</span>{prompt && <p className="lxs-prompt">{prompt}</p>}</div>
      {station.kind === 'sort' && <Sort st={station} sid={sid} />}
      {station.kind === 'stress' && <Stress st={station} />}
      {station.kind === 'hunt' && <Hunt st={station} />}
      {station.kind === 'remix' && <Remix st={station} />}
      {station.kind === 'sentence' && <Sentence st={station} sid={sid} />}
      {station.kind === 'cadence' && <Cadence st={station} />}
      {station.kind === 'choice' && <Choice st={station} />}
    </div>
  );
}

export const STATION_CSS = `
.lxs-card { border-radius: 3px; padding: 22px 22px 18px; margin: 18px 0; box-shadow: 0 1px 0 var(--lx-edge), 0 14px 30px -18px rgba(40,25,10,.45); border-top: 3px double color-mix(in srgb, var(--lx-accent) 55%, transparent); background-image: var(--lx-grain), repeating-linear-gradient(180deg, transparent 0 31px, color-mix(in srgb, var(--lx-ink) 7%, transparent) 31px 32px); }
.lxs-head { display: flex; flex-wrap: wrap; gap: 10px 14px; align-items: baseline; margin-bottom: 14px; }
.lxs-prompt { margin: 0; font: 500 1.08rem/1.4 var(--lx-body); flex: 1 1 260px; }
.lxs-row { display: flex; flex-wrap: wrap; gap: 8px 12px; align-items: center; margin-top: 14px; }
.lxs-row .lx-note { flex: 1 1 160px; font-size: 1.15rem; opacity: .75; }
.lxs-btn { font: 700 .85rem/1 'Kalam', cursive; padding: 9px 16px; border-radius: 999px; background: var(--lx-ink); color: var(--lx-paper); border: 0; cursor: pointer; transition: transform .15s; }
.lxs-btn:hover { transform: rotate(-1.5deg) scale(1.04); }
.lxs-btn.ghost { background: transparent; color: var(--lx-ink); box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--lx-ink) 45%, transparent); }
.lxs-hint { font-size: 1.2rem; color: var(--lx-accent); margin: 10px 0 0; }
.lxs-done { margin-top: 14px; padding: 12px 14px; background: color-mix(in srgb, var(--lx-wash1) 35%, transparent); border-radius: 2px; }
.lxs-done p { margin: 8px 0 0; font: 1.05rem/1.5 var(--lx-body); }
.lxs-cite { font-size: 1.1rem; opacity: .7; margin: 6px 0 0; }
.lxs-tabs { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px; }
.lxs-tabs button { font: 600 .8rem/1 'Kalam', cursive; padding: 7px 12px; border-radius: 3px 3px 0 0; background: color-mix(in srgb, var(--lx-ink) 8%, transparent); color: var(--lx-ink); border: 0; border-bottom: 2px solid transparent; cursor: pointer; }
.lxs-tabs button.on { background: color-mix(in srgb, var(--lx-wash2) 45%, transparent); border-bottom-color: var(--lx-accent); }
.is-right { box-shadow: inset 0 0 0 2px #3f7a4a !important; }
.is-wrong { box-shadow: inset 0 0 0 2px #b3322a !important; border-radius: 40% 46% 42% 48% / 50% 44% 56% 50% !important; }
/* sort */
.lxs-sort ol { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; position: relative; }
.lxs-sort li { margin: 0 auto; width: 100%; }
.lxs-sort li button { width: 100%; text-align: left; display: flex; flex-direction: column; gap: 2px; padding: 10px 14px; background: color-mix(in srgb, var(--lx-paper) 70%, white); color: var(--lx-ink); border: 0; border-radius: 2px; box-shadow: 0 1px 0 var(--lx-edge), 0 4px 10px -6px rgba(40,25,10,.4); cursor: pointer; transition: transform .18s, box-shadow .18s; }
.lxs-sort li button b { font: 600 1rem/1.3 var(--lx-body); }
.lxs-sort li button small { font: 1rem/1.2 var(--lx-note); opacity: .7; }
.lxs-sort li button.is-picked { transform: rotate(-1.2deg) translateY(-2px); box-shadow: 0 0 0 2px var(--lx-accent), 0 10px 18px -8px rgba(40,25,10,.5); }
.lxs-pyramid li button { align-items: center; text-align: center; }
.lxs-arc { position: relative; }
.lxs-arcline { width: 100%; height: 70px; display: block; margin-bottom: 6px; }
.lxs-arcline path { fill: none; stroke: var(--lx-accent); stroke-width: 2; stroke-dasharray: 4 5; vector-effect: non-scaling-stroke; }
@media (min-width: 760px) {
  .lxs-arc ol { flex-direction: row; align-items: flex-end; gap: 6px; min-height: 190px; }
  .lxs-arc li { flex: 1; transform: translateY(calc(var(--lift) * -90px)); transition: transform .3s; }
  .lxs-arc li button { min-height: 86px; }
  .lxs-line ol { flex-direction: row; flex-wrap: wrap; }
  .lxs-line li { flex: 1 1 150px; }
}
/* stress */
.lxs-syls { display: flex; flex-wrap: wrap; gap: 4px; }
.lxs-syls button { display: flex; flex-direction: column; align-items: center; gap: 2px; min-width: 42px; padding: 8px 8px 10px; font: 500 1.2rem/1 var(--lx-body); color: var(--lx-ink); background: transparent; border: 0; border-radius: 6px; cursor: pointer; transition: background .15s, transform .15s; }
.lxs-syls button i { font: 700 1.3rem/1 'Caveat', cursive; color: color-mix(in srgb, var(--lx-ink) 40%, transparent); font-style: normal; }
.lxs-syls button.is-on { background: color-mix(in srgb, var(--lx-wash1) 55%, transparent); font-weight: 700; transform: translateY(-3px); }
.lxs-syls button.is-on i { color: var(--lx-accent); }
/* hunt */
.lxs-passage { font: 1.22rem/1.75 var(--lx-body); margin: 0; }
.lxs-passage.small { font-size: 1.05rem; line-height: 1.6; margin-top: 12px; min-height: 3.2em; }
.lxs-passage mark { background: color-mix(in srgb, var(--lx-wash1) 60%, transparent); color: inherit; padding: 0 2px; }
.lxs-plain { cursor: pointer; border-radius: 3px; }
.lxs-plain:hover { background: color-mix(in srgb, var(--lx-ink) 7%, transparent); }
.lxs-word { position: relative; font: inherit; color: inherit; background: none; border: 0; padding: 0; cursor: pointer; border-radius: 3px; }
.lxs-word:hover { background: color-mix(in srgb, var(--lx-ink) 7%, transparent); }
.lxs-word.is-found { color: var(--lx-accent); font-weight: 600; }
.lxs-word svg { position: absolute; left: -2%; width: 104%; bottom: -.2em; height: .45em; overflow: visible; }
.lxs-word svg path { fill: none; stroke: var(--lx-accent); stroke-width: 2.4; stroke-linecap: round; stroke-dasharray: 140; stroke-dashoffset: 140; animation: lx-draw .7s ease-out forwards; vector-effect: non-scaling-stroke; }
.lxs-found { display: flex; flex-wrap: wrap; gap: 6px 14px; margin-top: 10px; font: 1.1rem/1.3 var(--lx-note); }
.lxs-found span { opacity: .45; } .lxs-found span.on { opacity: 1; color: var(--lx-accent); }
/* remix */
.lxs-remix blockquote { margin: 0; padding: 14px 18px; font: italic 1.2rem/1.7 var(--lx-body); border-left: 3px solid var(--lx-accent); background: color-mix(in srgb, var(--lx-paper) 60%, white); }
.lxs-margin { font-size: 1.25rem; margin: 10px 0 0 6px; transform: rotate(-.6deg); color: color-mix(in srgb, var(--lx-ink) 85%, var(--lx-accent)); }
/* sentence */
.lxs-slots { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 14px; }
.lxs-slot { min-width: 110px; flex: 1 1 110px; display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 8px 8px 10px; background: transparent; border: 0; border-bottom: 2px solid color-mix(in srgb, var(--lx-ink) 55%, transparent); cursor: pointer; color: var(--lx-ink); }
.lxs-slot-word { font: 600 1.25rem/1.2 var(--lx-body); min-height: 1.3em; }
.lxs-slot-role { font: 700 .66rem/1 'Kalam', cursive; letter-spacing: .1em; text-transform: uppercase; color: var(--lx-accent); }
.lxs-slot small { font-size: .95rem; opacity: .6; }
.lxs-tiles { display: flex; flex-wrap: wrap; gap: 8px; }
.lxs-tile { font: 500 1.08rem/1 var(--lx-body); padding: 10px 14px; color: var(--lx-ink); background: color-mix(in srgb, var(--lx-paper) 65%, white); border: 0; border-radius: 2px; box-shadow: 0 1px 0 var(--lx-edge), 0 4px 8px -5px rgba(40,25,10,.5); cursor: pointer; transition: transform .15s; }
.lxs-tile:nth-child(odd) { transform: rotate(-1deg); } .lxs-tile:nth-child(even) { transform: rotate(1.2deg); }
.lxs-tile.is-held { box-shadow: 0 0 0 2px var(--lx-accent); transform: translateY(-3px) rotate(0); }
.lxs-tile:disabled { opacity: .25; cursor: default; }
/* cadence */
.lxs-bars { display: flex; align-items: flex-end; gap: 5px; height: 140px; padding: 6px 4px 0; border-bottom: 1.5px solid color-mix(in srgb, var(--lx-ink) 50%, transparent); }
.lxs-bars button { flex: 1; min-width: 8px; max-width: 46px; position: relative; border: 0; padding: 0; cursor: pointer; background: linear-gradient(180deg, var(--lx-wash1), var(--lx-wash2)); border-radius: 3px 3px 0 0; opacity: .78; transform-origin: bottom; animation: lxs-grow .5s ease-out both; }
.lxs-bars button.on, .lxs-bars button:hover { opacity: 1; box-shadow: 0 0 0 2px var(--lx-accent); }
.lxs-bars span { position: absolute; top: -1.3em; left: 0; right: 0; text-align: center; font: 700 .95rem/1 'Caveat', cursive; color: var(--lx-ink); }
@keyframes lxs-grow { from { transform: scaleY(0); } }
/* choice */
.lxs-q { font: 600 1.15rem/1.45 var(--lx-body); margin: 0 0 12px; }
.lxs-opts { display: flex; flex-direction: column; gap: 8px; }
.lxs-opts button { text-align: left; display: flex; gap: 10px; align-items: baseline; padding: 10px 14px; font: 1.05rem/1.4 var(--lx-body); color: var(--lx-ink); background: color-mix(in srgb, var(--lx-paper) 65%, white); border: 0; border-radius: 2px; cursor: pointer; box-shadow: 0 1px 0 var(--lx-edge); }
.lxs-bullet { font: 700 1.2rem/1 'Caveat', cursive; color: var(--lx-accent); }
@media (prefers-reduced-motion: reduce) { .lxs-bars button { animation: none; } }
`;
