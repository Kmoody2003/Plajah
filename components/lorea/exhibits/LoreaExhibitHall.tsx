// LoreaExhibitHall — Lorea's exhibition hall of craft: story, character, plot, prose, poetry,
// rhythm, grammar and journalism as walk-through exhibits on paper. The lobby is a writing desk of
// folios; an exhibit is a stack of rooms with wall text at five reading depths, pasted-in library
// passages, a Story Intelligence lens that pulls live examples from the shelf, and hands-on
// stations. Same shape as the Academia Dossier hall, drawn in ink instead of glass.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { DEPTH_LABEL, DEPTH_LEVELS, type DepthLevel } from '../../../services/dossier/dossierTypes';
import type { ExhibitNode, ExhibitRoom, LibraryExample, LoreaExhibit, LoreaExhibitId } from '../../../services/loreaExhibits/loreaExhibitTypes';
import { takeRequestedLoreaExhibit, useLoreaDepth, useLoreaExhibits } from '../../../services/loreaExhibits/loreaExhibitStore';
import { LENS_LABEL, deepScan, deepScanShelf, lensFinds, type LensFind } from '../../../services/loreaExhibits/storyLens';
import { COUNCIL_DIRECTORS } from '../../../services/council/councilDirectors';
import { openClassicInLorea } from '../../../services/loreaOpen';
import { InkMarks, Motif, PAPER_CSS, materialVars, seedOf, tornClip, usePaperFonts } from './paperKit';
import { LoreaStationCard, STATION_CSS } from './LoreaStations';

export const DEPTH_NAME: Record<DepthLevel, string> = {
  early: 'Little readers', elementary: 'Elementary', middle: 'Middle school', high: 'High school', university: 'University',
};
const DEPTH_RANK: Record<DepthLevel, number> = { early: 0, elementary: 1, middle: 2, high: 3, university: 4 };

interface Props { onBack?: () => void; initialId?: LoreaExhibitId | null }

export default function LoreaExhibitHall({ onBack, initialId }: Props) {
  usePaperFonts();
  const exhibits = useLoreaExhibits();
  const req = useRef(takeRequestedLoreaExhibit());
  const [chosen, setChosen] = useState<LoreaExhibitId | null>(initialId ?? req.current?.id ?? null);
  const [depth, setDepth] = useLoreaDepth();
  const ex = exhibits?.find(e => e.id === chosen) || null;

  return (
    <div className="lx" style={ex ? materialVars(ex.materials) : undefined}>
      <style>{PAPER_CSS + STATION_CSS + HALL_CSS}</style>
      {!exhibits && <div className="lx-loading lx-note">unrolling the paper…</div>}
      {exhibits && !ex && <Lobby exhibits={exhibits} depth={depth} setDepth={setDepth} onChoose={setChosen} onBack={onBack} />}
      {ex && <Exhibit key={ex.id} ex={ex} depth={depth} setDepth={setDepth} initialRoom={req.current?.id === ex.id ? req.current.roomId : undefined} onBack={() => { req.current = null; setChosen(null); }} />}
    </div>
  );
}

function DepthLens({ depth, setDepth }: { depth: DepthLevel; setDepth: (d: DepthLevel) => void }) {
  return (
    <div className="lx-depth" role="radiogroup" aria-label="Reading level">
      {DEPTH_LEVELS.map(d => (
        <button type="button" key={d} role="radio" aria-checked={d === depth} className={d === depth ? 'on' : ''} onClick={() => setDepth(d)} title={DEPTH_LABEL[d]}>
          {DEPTH_NAME[d]}
        </button>
      ))}
    </div>
  );
}

// ── lobby ──
function Lobby({ exhibits, depth, setDepth, onChoose, onBack }: { exhibits: LoreaExhibit[]; depth: DepthLevel; setDepth: (d: DepthLevel) => void; onChoose: (id: LoreaExhibitId) => void; onBack?: () => void }) {
  return (
    <div className="lx-lobby">
      <header className="lx-lobby-top">
        {onBack && <button type="button" className="lx-back" onClick={onBack}>← Lorea</button>}
        <DepthLens depth={depth} setDepth={setDepth} />
      </header>
      <div className="lx-lobby-title">
        <p className="lx-note">the Lorea</p>
        <h1>Exhibition Hall <span>of the Writer's Craft</span></h1>
        <p className="lx-lede">Eight rooms of ink and paper. Walk in, read the walls, pick up the pen. Every exhibit speaks to a {DEPTH_NAME[depth].toLowerCase()} reader — change the lens any time.</p>
      </div>
      <div className="lx-folios">
        {exhibits.map((e, i) => {
          const seed = seedOf(e.id);
          const hookN = e.nuggets.find(n => !n.depths || n.depths.includes(depth)) || e.nuggets[0];
          return (
            <button type="button" key={e.id} className="lx-folio" style={{ ...materialVars(e.materials), ['--tilt' as any]: `${((seed % 7) - 3) * 0.45}deg`, animationDelay: `${i * 70}ms` }} onClick={() => onChoose(e.id)}>
              <span className="lx-folio-sheet lx-sheet" style={{ clipPath: tornClip(seed, { bottom: true, right: i % 2 === 0 }) }}>
                <span className="lx-wash" style={{ width: 220, height: 160, right: -40, top: -30, background: 'var(--lx-wash1)' }} />
                <span className="lx-wash" style={{ width: 160, height: 120, left: -30, bottom: 10, background: 'var(--lx-wash2)' }} />
                <span className="lx-folio-motif"><Motif glyph={e.materials.motif} size={48} /></span>
                <span className="lx-folio-kicker">{e.kicker}</span>
                <span className="lx-folio-title lx-hand">{e.title}</span>
                <span className="lx-folio-tag">{e.tagline}</span>
                <span className="lx-folio-meta lx-note">{e.rooms.length} rooms · {e.rooms.reduce((a, r) => a + r.nodes.filter(n => n.station).length, 0)} things to try</span>
              </span>
              {hookN && <span className="lx-folio-scrap lx-note" style={{ clipPath: tornClip(seed + 5, { top: true, bottom: true }, 6) }}>{hookN.hook}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── exhibit ──
function Exhibit({ ex, depth, setDepth, initialRoom, onBack }: { ex: LoreaExhibit; depth: DepthLevel; setDepth: (d: DepthLevel) => void; initialRoom?: string; onBack: () => void }) {
  const [ri, setRi] = useState(() => Math.max(0, ex.rooms.findIndex(r => r.id === initialRoom)));
  const [entered, setEntered] = useState(!!initialRoom);
  const mainRef = useRef<HTMLDivElement>(null);
  const room = ex.rooms[ri];
  const go = (i: number) => { setRi(i); mainRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); };

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('input,textarea')) return;
      if (e.key === 'ArrowRight' && ri < ex.rooms.length - 1) go(ri + 1);
      else if (e.key === 'ArrowLeft' && ri > 0) go(ri - 1);
      else if (e.key === 'Escape') onBack();
    };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  });

  if (!entered) return (
    <div className="lx-entrance" onClick={() => setEntered(true)}>
      <div className="lx-entrance-sheet lx-sheet">
        <span className="lx-wash" style={{ width: 420, height: 300, left: -80, top: -60, background: 'var(--lx-wash1)' }} />
        <span className="lx-wash" style={{ width: 360, height: 260, right: -60, bottom: -40, background: 'var(--lx-wash2)' }} />
        <div className="lx-entrance-motif"><Motif glyph={ex.materials.motif} size={72} /></div>
        <p className="lx-folio-kicker">{ex.kicker}</p>
        <h1 className="lx-hand lx-ink-in">{ex.title}</h1>
        <blockquote className="lx-ink-in" style={{ animationDelay: '.5s' }}>{ex.epigraph.text}<cite className="lx-note">— {ex.epigraph.cite}</cite></blockquote>
        <button type="button" className="lxs-btn" onClick={() => setEntered(true)}>Walk in →</button>
      </div>
    </div>
  );

  return (
    <div className="lx-exhibit">
      <header className="lx-top">
        <button type="button" className="lx-back" onClick={onBack}>← Hall</button>
        <span className="lx-top-title lx-hand">{ex.title}</span>
        <DepthLens depth={depth} setDepth={setDepth} />
      </header>
      <div className="lx-body">
        <nav className="lx-rail" aria-label="Rooms">
          {ex.rooms.map((r, i) => (
            <button type="button" key={r.id} className={i === ri ? 'on' : ''} onClick={() => go(i)}>
              <span className="lx-rail-n">{['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'][i] || i + 1}</span>{r.title}
            </button>
          ))}
          <ShareToFeed ex={ex} room={room} />
        </nav>
        <main ref={mainRef} className="lx-main">
          <Room key={room.id} ex={ex} room={room} ri={ri} depth={depth} />
          <div className="lx-pager">
            {ri > 0 ? <button type="button" className="lxs-btn ghost" onClick={() => go(ri - 1)}>← {ex.rooms[ri - 1].title}</button> : <span />}
            {ri < ex.rooms.length - 1
              ? <button type="button" className="lxs-btn" onClick={() => go(ri + 1)}>{ex.rooms[ri + 1].title} →</button>
              : <button type="button" className="lxs-btn" onClick={onBack}>Back to the hall →</button>}
          </div>
          <Credits ex={ex} />
        </main>
      </div>
    </div>
  );
}

function Room({ ex, room, ri, depth }: { ex: LoreaExhibit; room: ExhibitRoom; ri: number; depth: DepthLevel }) {
  const nodes = room.nodes.filter(n => !n.minDepth || DEPTH_RANK[depth] >= DEPTH_RANK[n.minDepth]);
  const folded = room.nodes.length - nodes.length;
  return (
    <article className="lx-room lx-sheet lx-room-in">
      <span className="lx-wash" style={{ width: 380, height: 220, right: -60, top: -40, background: 'var(--lx-wash1)' }} />
      <span className="lx-wash" style={{ width: 260, height: 180, left: -50, top: 120, background: 'var(--lx-wash2)', opacity: .35 }} />
      <header className="lx-room-head">
        <p className="lx-folio-kicker">Room {ri + 1} of {ex.rooms.length}</p>
        <h2 className="lx-hand">{room.title}</h2>
        <p className="lx-note lx-room-sub">{room.subtitle}</p>
      </header>
      {nodes.map((n, i) => <Node key={n.id} ex={ex} node={n} depth={depth} seed={seedOf(n.id) + i} />)}
      {folded > 0 && <p className="lx-note lx-folded">{folded === 1 ? 'One more station' : `${folded} more stations`} open up at an older reading level.</p>}
    </article>
  );
}

function Node({ ex, node, depth, seed }: { ex: LoreaExhibit; node: ExhibitNode; depth: DepthLevel; seed: number }) {
  return (
    <section className={`lx-node lx-node-${node.kind}`}>
      <h3>{node.title}</h3>
      <p className="lx-wall" key={depth}>{node.text[depth]}</p>
      {node.timeline && <Timeline items={node.timeline} />}
      {node.examples?.map((e, i) => <Clipping key={e.id} ex={e} seed={seed + i * 11} />)}
      {node.station && <LoreaStationCard station={node.station} sid={`${ex.id}/${node.id}`} />}
      {node.lens && <LensPanel tag={node.lens} seed={seed} />}
    </section>
  );
}

function Clipping({ ex, seed }: { ex: LibraryExample; seed: number }) {
  const tilt = ((seed % 5) - 2) * 0.5;
  return (
    <figure className="lx-clip" style={{ ['--tilt' as any]: `${tilt}deg` }}>
      <span className="lx-tape" style={{ top: -9, left: `${20 + (seed % 40)}%`, transform: `rotate(${(seed % 9) - 4}deg)` }} />
      <div className="lx-clip-paper" style={{ clipPath: tornClip(seed, { bottom: true, top: seed % 3 === 0 }, 1.2) }}>
        <blockquote><InkMarks text={ex.passage} marks={ex.marks} seed={seed} /></blockquote>
        <figcaption>
          <span><i>{ex.work}</i> — {ex.author}{ex.year ? `, ${ex.year}` : ''}</span>
          {ex.gutenbergId && <button type="button" className="lx-read" onClick={() => openClassicInLorea({ id: ex.gutenbergId!, title: ex.work, authors: [ex.author] })}>Read it in Lorea →</button>}
        </figcaption>
      </div>
      <p className="lx-note lx-clip-note">{ex.note}</p>
    </figure>
  );
}

function Timeline({ items }: { items: NonNullable<ExhibitNode['timeline']> }) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <ol className="lx-timeline">
      {items.map((t, i) => (
        <li key={i} className={open === i ? 'on' : ''}>
          <button type="button" onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i}>
            <span className="lx-tl-year lx-note">{t.year}</span>
            <span className="lx-tl-label">{t.label}</span>
          </button>
          {open === i && <p className="lx-ink-in">{t.text}</p>}
        </li>
      ))}
    </ol>
  );
}

/** Story Intelligence: live examples from the library's shelf, with a deep search into one book. */
function LensPanel({ tag, seed }: { tag: ExhibitNode['lens'] & string; seed: number }) {
  const quick = useMemo(() => lensFinds(tag, 2, seed), [tag, seed]);
  const shelf = useMemo(() => deepScanShelf(), []);
  const [book, setBook] = useState('');
  const [deep, setDeep] = useState<LensFind[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const run = async (id: string) => {
    setBook(id); setDeep(null); setErr(''); if (!id) return;
    setBusy(true);
    try { const r = await deepScan(tag, id, 3); setDeep(r); if (!r.length) setErr('Nothing that clear in this one — try another book.'); }
    catch { setErr('That book would not open just now.'); }
    finally { setBusy(false); }
  };
  const finds = deep && deep.length ? deep : quick;
  if (!finds.length && !shelf.length) return null;
  return (
    <aside className="lx-lens">
      <div className="lx-lens-head">
        <span className="lx-stamp">Story Intelligence</span>
        <span className="lx-note">found {LENS_LABEL[tag]} in the library</span>
      </div>
      {finds.map((f, i) => (
        <div key={`${f.gutenbergId}-${i}`} className="lx-lens-find lx-ink-in" style={{ animationDelay: `${i * 160}ms` }}>
          <p><InkMarks text={f.text} marks={f.marks} seed={seed + i} /></p>
          <p className="lx-lens-src"><i>{f.work}</i>{f.author ? ` — ${f.author}` : ''} <button type="button" className="lx-read" onClick={() => openClassicInLorea({ id: f.gutenbergId, title: f.work, authors: [f.author] })}>open →</button></p>
          <p className="lx-note lx-lens-why">{f.why}</p>
        </div>
      ))}
      {shelf.length > 0 && (
        <label className="lx-lens-deep">
          <span className="lx-note">search a whole book:</span>
          <select value={book} onChange={e => run(e.target.value)} disabled={busy}>
            <option value="">choose a classic…</option>
            {shelf.map(b => <option key={b.id} value={b.id}>{b.title}{b.author ? ` — ${b.author}` : ''}</option>)}
          </select>
          {busy && <span className="lx-note">reading…</span>}
          {err && <span className="lx-note">{err}</span>}
        </label>
      )}
    </aside>
  );
}

function ShareToFeed({ ex, room }: { ex: LoreaExhibit; room: ExhibitRoom }) {
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'err'>('idle');
  const share = async () => {
    setState('busy');
    try {
      const { createPost } = await import('../../../services/backendService');
      const nug = ex.nuggets.find(n => n.roomId === room.id) || ex.nuggets[0];
      await createPost({
        text: `${nug?.hook || ex.tagline}\n\nFrom the Lorea Exhibition Hall: ${ex.title} — ${room.title}`,
        tags: ['lorea', 'writing', ex.id],
        hashtags: ['Lorea', ex.title.replace(/\W+/g, '')],
        assetEmbed: { type: 'LOREA_EXHIBIT', id: ex.id, roomId: room.id, title: ex.title, subtitle: room.title, accent: ex.materials.accent, motif: ex.materials.motif },
      } as any);
      setState('done');
    } catch { setState('err'); }
  };
  return (
    <button type="button" className="lx-share" onClick={share} disabled={state === 'busy' || state === 'done'}>
      {state === 'done' ? 'Pinned to your feed ✓' : state === 'err' ? 'Sign in to share' : state === 'busy' ? 'Pinning…' : 'Pin this room to your feed'}
    </button>
  );
}

function Credits({ ex }: { ex: LoreaExhibit }) {
  const lead = COUNCIL_DIRECTORS[ex.council.art.lead];
  const cp = ex.council.art.counterpoint ? COUNCIL_DIRECTORS[ex.council.art.counterpoint] : null;
  return (
    <footer className="lx-credits lx-note">
      <p><b>Art Council</b> — led by {lead?.name || ex.council.art.lead}{cp ? `, with ${cp.name} as counterpoint` : ''}: {ex.council.art.note}</p>
      <p><b>Writers Council</b> — {ex.council.writers.note}</p>
      <p className="lx-credits-small">Every passage is from the public-domain library. {ex.council.source === 'council' ? 'Directed in council session.' : 'Hand-authored in the councils’ shape.'}</p>
    </footer>
  );
}

const HALL_CSS = `
.lx { min-height: 100%; width: 100%; color: #f4ecdc; background: #1c1424; background-image: radial-gradient(1200px 600px at 15% -10%, color-mix(in srgb, var(--lx-wash1, #7a3f8f) 26%, transparent), transparent 70%), radial-gradient(900px 600px at 110% 30%, color-mix(in srgb, var(--lx-wash2, #c06b2c) 18%, transparent), transparent 70%), ${'url("data:image/svg+xml,' + encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' width='300' height='300'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.02 .6' numOctaves='3' seed='4'/><feColorMatrix values='0 0 0 0 .5  0 0 0 0 .35  0 0 0 0 .3  0 0 0 .09 0'/></filter><rect width='100%' height='100%' filter='url(#n)'/></svg>") + '")'}; font-family: var(--lx-body); overflow-x: hidden; }
.lx * { box-sizing: border-box; }
.lx-loading { padding: 80px; text-align: center; font-size: 1.6rem; opacity: .6; }
.lx-back { font: 700 .95rem/1 'Kalam', cursive; color: #f4ecdc; background: transparent; border: 1.5px solid rgba(244,236,220,.4); border-radius: 999px; padding: 9px 16px; cursor: pointer; }
.lx-depth { display: flex; flex-wrap: wrap; gap: 4px; padding: 4px; background: rgba(0,0,0,.25); border-radius: 999px; }
.lx-depth button { font: 600 .78rem/1 'Kalam', cursive; color: rgba(244,236,220,.75); background: transparent; border: 0; border-radius: 999px; padding: 8px 12px; cursor: pointer; }
.lx-depth button.on { background: #f4ecdc; color: #2a1d33; }
/* lobby */
.lx-lobby { max-width: 1240px; margin: 0 auto; padding: 20px 16px 80px; }
.lx-lobby-top { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 12px; align-items: center; }
.lx-lobby-title { text-align: center; margin: 44px auto 34px; max-width: 760px; }
.lx-lobby-title > .lx-note { font-size: 1.7rem; margin: 0; color: #f0b37a; transform: rotate(-3deg); }
.lx-lobby-title h1 { font: 400 clamp(2.4rem, 6vw, 4.4rem)/1 'IM Fell English', serif; margin: 6px 0 0; letter-spacing: -.01em; }
.lx-lobby-title h1 span { display: block; font: italic 400 clamp(1.1rem, 2.4vw, 1.6rem)/1.3 'EB Garamond', serif; opacity: .8; margin-top: 8px; }
.lx-lede { font: 1.15rem/1.6 'EB Garamond', serif; opacity: .82; margin-top: 18px; }
.lx-folios { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 34px 26px; }
.lx-folio { position: relative; border: 0; padding: 0 0 26px; background: transparent; cursor: pointer; text-align: left; transform: rotate(var(--tilt)); transition: transform .3s cubic-bezier(.2,.8,.3,1.2); animation: lx-drop .6s ease-out both; }
.lx-folio:hover, .lx-folio:focus-visible { transform: rotate(0) translateY(-6px) scale(1.02); outline: none; }
@keyframes lx-drop { from { opacity: 0; transform: translateY(18px) rotate(calc(var(--tilt) * 3)); } }
.lx-folio-sheet { display: flex; flex-direction: column; gap: 8px; min-height: 270px; padding: 26px 22px 30px; overflow: hidden; box-shadow: 0 22px 40px -22px rgba(0,0,0,.7); }
.lx-folio-motif { color: var(--lx-accent); position: relative; }
.lx-folio-kicker { position: relative; font: 700 .7rem/1 'Kalam', cursive; letter-spacing: .14em; text-transform: uppercase; color: var(--lx-accent); margin: 0; }
.lx-folio-title { position: relative; font-size: 2.6rem; line-height: .95; color: var(--lx-ink); }
.lx-folio-tag { position: relative; font: 1.02rem/1.4 'EB Garamond', serif; color: var(--lx-ink); opacity: .85; }
.lx-folio-meta { position: relative; margin-top: auto; font-size: 1.1rem; color: var(--lx-ink); opacity: .65; }
.lx-folio-scrap { position: absolute; right: -8px; bottom: 0; max-width: 78%; padding: 10px 14px 12px; background: #fbf6e8; color: #3a2a1c; font-size: 1.12rem; line-height: 1.15; transform: rotate(2.5deg); box-shadow: 0 8px 14px -8px rgba(0,0,0,.6); }
/* entrance */
.lx-entrance { min-height: 100vh; display: grid; place-items: center; padding: 30px 16px; cursor: pointer; }
.lx-entrance-sheet { position: relative; overflow: hidden; max-width: 720px; width: 100%; padding: 56px clamp(22px, 6vw, 64px); text-align: center; box-shadow: 0 40px 80px -40px rgba(0,0,0,.8); cursor: default; }
.lx-entrance-motif { color: var(--lx-accent); position: relative; display: flex; justify-content: center; margin-bottom: 10px; }
.lx-entrance-sheet h1 { position: relative; font-size: clamp(3rem, 9vw, 5.6rem); line-height: .95; margin: 10px 0 24px; color: var(--lx-ink); }
.lx-entrance-sheet blockquote { position: relative; font: italic 1.3rem/1.6 'EB Garamond', serif; margin: 0 auto 30px; max-width: 520px; color: var(--lx-ink); }
.lx-entrance-sheet cite { display: block; font-style: normal; font-size: 1.3rem; margin-top: 10px; opacity: .75; }
.lx-entrance-sheet .lxs-btn { position: relative; font-size: 1.05rem; padding: 12px 24px; }
/* exhibit */
.lx-top { position: sticky; top: 0; z-index: 5; display: flex; flex-wrap: wrap; gap: 10px 16px; align-items: center; padding: 12px 16px; background: color-mix(in srgb, #1c1424 82%, transparent); backdrop-filter: blur(10px); }
.lx-top-title { font-size: 1.8rem; flex: 1; color: #f4ecdc; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.lx-body { display: grid; grid-template-columns: 230px minmax(0, 1fr); gap: 28px; max-width: 1180px; margin: 0 auto; padding: 22px 16px 80px; }
.lx-rail { position: sticky; top: 76px; align-self: start; display: flex; flex-direction: column; gap: 8px; }
.lx-rail > button:not(.lx-share) { display: flex; gap: 10px; align-items: baseline; text-align: left; padding: 11px 14px 11px 12px; font: 500 1.02rem/1.25 'EB Garamond', serif; color: #f4ecdc; background: rgba(255,255,255,.04); border: 0; border-left: 3px solid transparent; border-radius: 0 3px 3px 0; cursor: pointer; transition: background .2s, transform .2s; }
.lx-rail > button.on { background: var(--lx-paper); background-image: var(--lx-grain); color: var(--lx-ink); border-left-color: var(--lx-accent); transform: translateX(6px); }
.lx-rail-n { font: 400 1rem/1 'IM Fell English', serif; color: var(--lx-accent); min-width: 22px; }
.lx-share { margin-top: 14px; font: 700 .9rem/1.2 'Kalam', cursive; padding: 11px 14px; color: #f4ecdc; background: transparent; border: 1.5px dashed rgba(244,236,220,.45); border-radius: 4px; cursor: pointer; }
.lx-main { min-width: 0; scroll-margin-top: 80px; }
.lx-room { overflow: hidden; padding: clamp(24px, 5vw, 54px) clamp(18px, 5vw, 58px) 34px; box-shadow: 0 40px 70px -40px rgba(0,0,0,.85); border-radius: 2px; }
.lx-room-in { animation: lx-room-in .45s ease-out both; }
@keyframes lx-room-in { from { opacity: 0; transform: translateY(14px) rotate(.4deg); } }
.lx-room-head { position: relative; margin-bottom: 18px; }
.lx-room-head h2 { font-size: clamp(2.4rem, 6vw, 3.8rem); line-height: 1; margin: 6px 0 4px; color: var(--lx-ink); }
.lx-room-sub { font-size: 1.45rem; margin: 0; color: color-mix(in srgb, var(--lx-ink) 80%, var(--lx-accent)); }
.lx-node { position: relative; margin: 34px 0 0; }
.lx-node h3 { font: 600 1.45rem/1.2 'EB Garamond', serif; margin: 0 0 10px; display: flex; align-items: center; gap: 10px; }
.lx-node h3::before { content: ''; width: 18px; height: 2px; background: var(--lx-accent); border-radius: 2px; }
.lx-wall { font: 1.2rem/1.72 'EB Garamond', serif; margin: 0; max-width: 68ch; animation: lx-fade .45s ease-out both; }
@keyframes lx-fade { from { opacity: 0; } }
.lx-folded { font-size: 1.2rem; opacity: .65; margin-top: 26px; }
/* clipping */
.lx-clip { position: relative; margin: 24px 0 6px; transform: rotate(var(--tilt)); max-width: 640px; }
.lx-clip-paper { background: color-mix(in srgb, var(--lx-paper) 55%, white); padding: 20px 22px 22px; box-shadow: 0 10px 22px -14px rgba(40,25,10,.6); }
.lx-clip blockquote { margin: 0; font: italic 1.2rem/1.65 'EB Garamond', serif; color: var(--lx-ink); }
.lx-clip figcaption { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 8px; margin-top: 12px; font: .95rem/1.3 'EB Garamond', serif; opacity: .85; }
.lx-read { font: 700 .9rem/1 'Kalam', cursive; color: var(--lx-accent); background: none; border: 0; cursor: pointer; padding: 0; }
.lx-clip-note { font-size: 1.28rem; line-height: 1.25; margin: 10px 0 0 24px; color: color-mix(in srgb, var(--lx-ink) 82%, var(--lx-accent)); transform: rotate(-.8deg); }
/* timeline */
.lx-timeline { list-style: none; margin: 20px 0 0; padding: 0 0 0 22px; border-left: 2px dashed color-mix(in srgb, var(--lx-ink) 35%, transparent); }
.lx-timeline li { position: relative; margin: 0 0 6px; }
.lx-timeline li::before { content: ''; position: absolute; left: -29px; top: 14px; width: 12px; height: 12px; border-radius: 50%; background: var(--lx-paper); box-shadow: inset 0 0 0 2.5px var(--lx-accent); }
.lx-timeline li.on::before { background: var(--lx-accent); }
.lx-timeline button { display: flex; gap: 14px; align-items: baseline; width: 100%; text-align: left; padding: 8px 4px; background: none; border: 0; cursor: pointer; color: var(--lx-ink); }
.lx-tl-year { font-size: 1.3rem; width: 140px; flex-shrink: 0; color: var(--lx-accent); }
@media (max-width: 520px) { .lx-timeline button { flex-direction: column; gap: 0; } .lx-tl-year { width: auto; } }
.lx-tl-label { font: 600 1.08rem/1.3 'EB Garamond', serif; }
.lx-timeline p { margin: 0 0 10px 4px; font: 1.05rem/1.6 'EB Garamond', serif; max-width: 62ch; }
/* lens */
.lx-lens { margin: 22px 0 0; padding: 18px 20px; border: 1.5px dashed color-mix(in srgb, var(--lx-accent) 60%, transparent); border-radius: 4px; background: color-mix(in srgb, var(--lx-wash2) 14%, transparent); }
.lx-lens-head { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin-bottom: 8px; }
.lx-lens-head .lx-note { font-size: 1.25rem; }
.lx-lens-find { padding: 10px 0; border-bottom: 1px solid color-mix(in srgb, var(--lx-ink) 12%, transparent); }
.lx-lens-find p { margin: 0; }
.lx-lens-find > p:first-child { font: 1.1rem/1.6 'EB Garamond', serif; }
.lx-lens-src { font: .92rem/1.4 'EB Garamond', serif; opacity: .8; margin-top: 4px !important; }
.lx-lens-why { font-size: 1.15rem; opacity: .85; margin-top: 2px !important; }
.lx-lens-deep { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 12px; }
.lx-lens-deep .lx-note { font-size: 1.15rem; }
.lx-lens-deep select { font: 1rem 'EB Garamond', serif; padding: 6px 10px; background: var(--lx-paper); color: var(--lx-ink); border: 1.5px solid color-mix(in srgb, var(--lx-ink) 35%, transparent); border-radius: 3px; max-width: 100%; }
.lx-pager { display: flex; justify-content: space-between; gap: 12px; margin: 26px 0 0; }
.lx-pager .lxs-btn { background: #f4ecdc; color: #2a1d33; }
.lx-pager .lxs-btn.ghost { background: transparent; color: #f4ecdc; box-shadow: inset 0 0 0 1.5px rgba(244,236,220,.4); }
.lx-credits { margin-top: 34px; font-size: 1.15rem; opacity: .75; max-width: 70ch; }
.lx-credits b { font-family: 'Kalam', cursive; }
.lx-credits-small { font-size: 1rem; opacity: .8; }
@media (max-width: 820px) {
  .lx-body { grid-template-columns: 1fr; gap: 14px; }
  .lx-rail { position: static; flex-direction: row; overflow-x: auto; gap: 6px; padding-bottom: 4px; }
  .lx-rail > button:not(.lx-share) { flex: 0 0 auto; border-left: 0; border-bottom: 3px solid transparent; border-radius: 3px 3px 0 0; }
  .lx-rail > button.on { transform: none; border-bottom-color: var(--lx-accent); }
  .lx-share { margin: 0; flex: 0 0 auto; }
  .lx-top-title { display: none; }
}
@media (prefers-reduced-motion: reduce) { .lx-folio, .lx-room-in, .lx-wall { animation: none; } }
`;
