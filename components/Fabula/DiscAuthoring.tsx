// Fabula › DISC — Blu-ray and Ultra HD Blu-ray authoring. Build once, then burn for print on
// demand / short runs or hand a press package to a replicator for a retail release.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { zipSync } from 'fflate';
import {
  Disc3, Plus, Trash2, Film, LayoutGrid, Play, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Circle,
  AlertTriangle, CheckCircle2, Info, PenTool, Download, RefreshCw, Hammer, Package, Flame, Factory, ListOrdered, Subtitles, AudioLines,
} from 'lucide-react';
import { applyTemplate, TEMPLATES } from '../../services/disc/templates';
import { autoChapters, autoNav, newProject, newTitle, uid, type DiscMenu, type DiscProject, type DiscTitle, type MenuAction, type MenuButton, type TitleKind } from '../../services/disc/project';
import { planBudget, suggestMedium } from '../../services/disc/budget';
import { validate, summarize, type Issue } from '../../services/disc/validate';
import { DESTINATIONS, MEDIA, mediumById, VIDEO_MODES, GRAPHICS_PLANE, AUDIO, type DiscFormat, type DestinationId } from '../../services/disc/spec';
import { drawMenu, prepareRaster } from '../../services/disc/menuRaster';
import { prepareArt } from '../../services/disc/telaArt';
import { buildPackage } from '../../services/disc/build';
import { compile } from '../../services/disc/navigation';
import { disasm } from '../../services/disc/hdmv';
import { menuToTelaDoc, telaToMenu } from '../../services/disc/menuTela';
import { makeDisc, type StepUpdate, type StepId } from '../../services/disc/discWriter';

export interface DiscSource { id: string; name: string; durationSec: number; kind: 'timeline' | 'edit' | 'asset'; markers?: { t: number; label?: string }[]; path?: string; url?: string }

interface Props {
  discs: DiscProject[];
  onChange: (discs: DiscProject[]) => void;
  sources: DiscSource[];
  productionTitle?: string;
  ownerId?: string;
  ping?: (m: string) => void;
}

const C = { bg: '#0d0d11', panel: '#15151b', panel2: '#1c1c24', line: '#2a2a35', ink: '#ecebf2', dim: '#8d8b99', accent: '#ff9a3c', good: '#4ade80', warn: '#fbbf24', bad: '#f87171', blue: '#7fd4ff' };
const box: React.CSSProperties = { background: C.panel, border: `1px solid ${C.line}`, borderRadius: 10 };
const lbl: React.CSSProperties = { fontSize: 10, letterSpacing: 1.2, textTransform: 'uppercase', color: C.dim, fontWeight: 700 };
const inp: React.CSSProperties = { background: C.panel2, color: C.ink, border: `1px solid ${C.line}`, borderRadius: 6, padding: '5px 7px', fontSize: 12, width: '100%', boxSizing: 'border-box' };
const btnS = (on = false, tone = C.accent): React.CSSProperties => ({ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 7, border: `1px solid ${on ? tone : C.line}`, background: on ? `${tone}22` : C.panel2, color: on ? tone : C.ink, fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' });
const hms = (s: number) => `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const parseHms = (v: string) => v.split(':').map(Number).reduce((a, n) => a * 60 + (n || 0), 0);

type Sel = { kind: 'menu'; id: string } | { kind: 'title'; id: string } | { kind: 'firstplay' } | { kind: 'build' };

export default function DiscAuthoring({ discs, onChange, sources, productionTitle, ownerId, ping }: Props) {
  const [activeId, setActiveId] = useState<string | undefined>(discs[0]?.id);
  const disc = discs.find(d => d.id === activeId);
  const [sel, setSel] = useState<Sel | null>(null);
  const [selBtn, setSelBtn] = useState<string | null>(null);

  const save = (next: DiscProject) => onChange(discs.map(d => (d.id === next.id ? { ...next, updatedAt: Date.now() } : d)));
  const mut = (fn: (d: DiscProject) => void) => { if (!disc) return; const n = structuredClone(disc); fn(n); save(n); };

  const create = (format: DiscFormat, templateId: string) => {
    const name = productionTitle || 'Untitled Disc';
    let p = newProject(name, format);
    const main = sources.find(s => s.kind === 'timeline') || sources[0];
    if (main && main.durationSec > 0) {
      const t = newTitle(main.name || name, main.durationSec, 'FEATURE');
      t.source = { ...t.source, assetId: main.id, path: main.path, url: main.url };
      t.chapters = main.markers?.length ? [{ id: uid('ch'), name: 'Opening', timeSec: 0 }, ...main.markers.filter(m => m.t > 1).map((m, i) => ({ id: uid('ch'), name: m.label || `Chapter ${i + 2}`, timeSec: m.t }))] : autoChapters(main.durationSec, main.durationSec > 3600 ? 600 : 300);
      p.titles.push(t);
    } else p.titles.push(newTitle(name, 5400, 'FEATURE'));
    p = applyTemplate(p, templateId);
    p.mediumId = suggestMedium(p, DESTINATIONS[0].media) || p.mediumId;
    onChange([...discs, p]); setActiveId(p.id); setSel({ kind: 'menu', id: p.topMenuId! });
  };

  const budget = useMemo(() => { if (!disc) return null; try { return planBudget(disc); } catch { return null; } }, [disc]);
  const issues = useMemo(() => (disc ? validate(disc) : []), [disc]);
  if (!disc) return <NewDisc onCreate={create} hasSource={sources.length > 0} existing={discs} onOpen={setActiveId} />;
  const sum = summarize(issues);
  const current: Sel = sel || { kind: 'menu', id: disc.topMenuId || disc.menus[0]?.id || '' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 640, background: C.bg, color: C.ink, fontFamily: 'Inter, system-ui, sans-serif' }} data-testid="disc-authoring">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: `1px solid ${C.line}`, flexWrap: 'wrap' }}>
        <Disc3 size={18} color={C.accent} />
        <select value={disc.id} onChange={e => (e.target.value === '__new' ? setActiveId(undefined) : setActiveId(e.target.value))} style={{ ...inp, width: 220, fontWeight: 700 }}>
          {discs.map(d => <option key={d.id} value={d.id}>{d.name} · {d.format === 'UHD' ? '4K UHD' : 'Blu-ray'}</option>)}
          <option value="__new">＋ New disc…</option>
        </select>
        <input value={disc.name} onChange={e => mut(d => { d.name = e.target.value; })} style={{ ...inp, width: 200 }} aria-label="Disc name" />
        <div style={{ display: 'flex', gap: 4 }}>
          {(['BD', 'UHD'] as DiscFormat[]).map(f => (
            <button key={f} style={btnS(disc.format === f)} onClick={() => mut(d => {
              const fresh = newProject(d.name, f);
              d.format = f; d.video = fresh.video;
              if (!mediumById(d.mediumId)?.format.includes(f)) d.mediumId = destinationMedia(d.destination).find(id => mediumById(id)?.format.includes(f)) || d.mediumId;
            })}>{f === 'UHD' ? '4K Ultra HD' : 'Blu-ray'}</button>
          ))}
        </div>
        <select value={disc.templateId || ''} onChange={e => { const t = e.target.value; if (t && confirm('Rebuild the menus from this template? Titles and tracks stay; menu edits are replaced.')) save(applyTemplate(disc, t)); }} style={{ ...inp, width: 170 }} aria-label="Template">
          <option value="">Template…</option>
          {TEMPLATES.filter(t => t.formats.includes(disc.format)).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <div style={{ flex: 1 }} />
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: sum.ready ? C.good : C.bad }}>
          {sum.ready ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}{sum.ready ? 'Compliant' : `${sum.errors} to fix`}{sum.warnings ? <span style={{ color: C.warn }}> · {sum.warnings} warnings</span> : null}
        </span>
        <button style={btnS(current.kind === 'build', C.good)} onClick={() => setSel({ kind: 'build' })} data-testid="disc-build-tab"><Hammer size={13} />Build & Deliver</button>
      </div>

      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '230px 1fr 290px', minHeight: 0 }}>
        <DiscTree disc={disc} sel={current} onSel={s => { setSel(s); setSelBtn(null); }} mut={mut} sources={sources} />
        <div style={{ minWidth: 0, overflow: 'auto', padding: 14 }}>
          {current.kind === 'menu' && disc.menus.find(m => m.id === current.id) && <MenuStage disc={disc} menu={disc.menus.find(m => m.id === current.id)!} selBtn={selBtn} setSelBtn={setSelBtn} mut={mut} onGoMenu={id => setSel({ kind: 'menu', id })} ping={ping} />}
          {current.kind === 'title' && disc.titles.find(t => t.id === current.id) && <TitleEditor disc={disc} title={disc.titles.find(t => t.id === current.id)!} mut={mut} sources={sources} />}
          {current.kind === 'firstplay' && <FirstPlay disc={disc} mut={mut} />}
          {current.kind === 'build' && <BuildPanel disc={disc} mut={mut} issues={issues} ping={ping} />}
        </div>
        <Inspector disc={disc} sel={current} selBtn={selBtn} mut={mut} ownerId={ownerId} ping={ping} />
      </div>

      {/* Capacity */}
      {budget && (
        <div style={{ borderTop: `1px solid ${C.line}`, padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 14, fontSize: 12 }} data-testid="disc-capacity">
          <span style={lbl}>{mediumById(disc.mediumId)?.label}</span>
          <div style={{ flex: 1, height: 10, background: C.panel2, borderRadius: 5, overflow: 'hidden', border: `1px solid ${C.line}` }}>
            <div style={{ width: `${Math.min(100, budget.fill * 100)}%`, height: '100%', background: budget.fits ? `linear-gradient(90deg, ${C.accent}, ${C.good})` : C.bad }} />
          </div>
          <span style={{ color: budget.fits ? C.ink : C.bad, fontWeight: 700 }}>{(budget.usedBytes / 1e9).toFixed(1)} / {(budget.mediumBytes / 1e9).toFixed(0)} GB</span>
          {budget.titles.slice(0, 3).map(t => <span key={t.titleId} style={{ color: C.dim }}>{t.name}: <b style={{ color: t.grade === 'poor' ? C.bad : t.grade === 'fair' ? C.warn : C.good }}>{(t.videoKbps / 1000).toFixed(1)} Mb/s</b></span>)}
        </div>
      )}
    </div>
  );
}

const destinationMedia = (id: DestinationId) => DESTINATIONS.find(d => d.id === id)!.media;

function NewDisc({ onCreate, hasSource, existing, onOpen }: { onCreate: (f: DiscFormat, t: string) => void; hasSource: boolean; existing: DiscProject[]; onOpen: (id: string) => void }) {
  const [fmt, setFmt] = useState<DiscFormat>('BD');
  return (
    <div style={{ background: C.bg, color: C.ink, minHeight: 640, padding: 28, fontFamily: 'Inter, system-ui, sans-serif' }} data-testid="disc-new">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}><Disc3 size={22} color={C.accent} /><h2 style={{ margin: 0, fontSize: 22 }}>Disc Authoring</h2></div>
      <p style={{ color: C.dim, marginTop: 0, maxWidth: 720, fontSize: 13 }}>Build a Blu-ray or 4K Ultra HD Blu-ray with real menus, chapters, audio and subtitle tracks. Then burn it for print-on-demand and short runs, or send a press package to a replicator for a retail release.</p>
      {existing.length > 0 && <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>{existing.map(d => <button key={d.id} style={btnS()} onClick={() => onOpen(d.id)}><Disc3 size={13} />{d.name} · {d.format}</button>)}</div>}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button style={btnS(fmt === 'BD')} onClick={() => setFmt('BD')}>Blu-ray (1080p)</button>
        <button style={btnS(fmt === 'UHD')} onClick={() => setFmt('UHD')}>4K Ultra HD Blu-ray (HDR)</button>
      </div>
      {!hasSource && <p style={{ color: C.warn, fontSize: 12 }}>No timeline open — the disc starts with a placeholder feature you can point at a cut later.</p>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 12 }}>
        {TEMPLATES.filter(t => t.formats.includes(fmt)).map(t => (
          <button key={t.id} onClick={() => onCreate(fmt, t.id)} data-testid={`disc-template-${t.id}`} style={{ ...box, padding: 0, textAlign: 'left', cursor: 'pointer', color: C.ink, overflow: 'hidden' }}>
            <TemplateThumb id={t.id} />
            <div style={{ padding: 12 }}><div style={{ fontWeight: 700, marginBottom: 4 }}>{t.name}</div><div style={{ fontSize: 12, color: C.dim }}>{t.blurb}</div></div>
          </button>
        ))}
      </div>
    </div>
  );
}

function TemplateThumb({ id }: { id: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    let p = newProject('Feature Title', 'BD'); const f = newTitle('Feature Title', 5400, 'FEATURE'); f.chapters = autoChapters(5400, 900);
    p.titles = [f, { ...newTitle('Behind the Scenes', 900, 'EXTRA') }]; if (id === 'boxset') p.titles = [1, 2, 3, 4].map(n => newTitle(`Episode ${n}`, 1500, 'EPISODE'));
    p = applyTemplate(p, id);
    const top = p.menus.find(m => m.id === p.topMenuId)!;
    let alive = true;
    prepareArt(p, top.id).then(art => {
      if (!alive) return;
      const ctx = c.getContext('2d')!; ctx.save(); ctx.scale(c.width / 1920, c.height / 1080); drawMenu(ctx, top, { selected: top.defaultButton, art, time: 3 }); ctx.restore();
    });
    return () => { alive = false; };
  }, [id]);
  return <canvas ref={ref} width={480} height={270} style={{ width: '100%', display: 'block', background: '#000' }} />;
}

function DiscTree({ disc, sel, onSel, mut, sources }: { disc: DiscProject; sel: Sel; onSel: (s: Sel) => void; mut: (fn: (d: DiscProject) => void) => void; sources: DiscSource[] }) {
  const [adding, setAdding] = useState(false);
  const row = (on: boolean): React.CSSProperties => ({ display: 'flex', alignItems: 'center', gap: 7, padding: '6px 8px', borderRadius: 6, cursor: 'pointer', fontSize: 12, background: on ? `${C.accent}22` : 'transparent', color: on ? C.accent : C.ink });
  const addTitle = (s: DiscSource | null, kind: TitleKind) => mut(d => {
    const t = newTitle(s?.name || 'New title', s?.durationSec || 600, kind);
    if (s) { t.source = { ...t.source, assetId: s.id, path: s.path, url: s.url }; if (s.markers?.length) t.chapters = [{ id: uid('ch'), name: 'Chapter 1', timeSec: 0 }, ...s.markers.filter(m => m.t > 1).map((m, i) => ({ id: uid('ch'), name: m.label || `Chapter ${i + 2}`, timeSec: m.t }))]; }
    if (kind !== 'FEATURE' && kind !== 'EPISODE') t.audio = [{ id: uid('aud'), lang: 'eng', label: 'Stereo', codec: 'ac3', channels: 2, kbps: 224 }];
    d.titles.push(t);
  });
  return (
    <div style={{ borderRight: `1px solid ${C.line}`, padding: 10, overflow: 'auto' }} data-testid="disc-tree">
      <div style={row(sel.kind === 'firstplay')} onClick={() => onSel({ kind: 'firstplay' })}><Play size={13} />First Play</div>
      <div style={{ ...lbl, margin: '12px 0 4px', display: 'flex', justifyContent: 'space-between' }}>Menus
        <button title="Add menu" style={{ background: 'none', border: 'none', color: C.dim, cursor: 'pointer' }} onClick={() => mut(d => { const m: DiscMenu = { id: uid('menu'), name: `Menu ${d.menus.length + 1}`, kind: 'EXTRAS', background: { kind: 'color', value: '#0b0b10' }, decor: [], buttons: [] }; d.menus.push(m); })}><Plus size={13} /></button>
      </div>
      {disc.menus.map(m => (
        <div key={m.id} style={row(sel.kind === 'menu' && sel.id === m.id)} onClick={() => onSel({ kind: 'menu', id: m.id })}>
          <LayoutGrid size={13} /><span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.name}</span>
          {m.id === disc.topMenuId && <span style={{ fontSize: 9, color: C.dim }}>TOP</span>}{m.id === disc.popupMenuId && <span style={{ fontSize: 9, color: C.dim }}>POP-UP</span>}
        </div>
      ))}
      <div style={{ ...lbl, margin: '12px 0 4px', display: 'flex', justifyContent: 'space-between' }}>Titles
        <button title="Add title" style={{ background: 'none', border: 'none', color: C.dim, cursor: 'pointer' }} onClick={() => setAdding(a => !a)} data-testid="disc-add-title"><Plus size={13} /></button>
      </div>
      {adding && (
        <div style={{ ...box, padding: 8, marginBottom: 8, display: 'grid', gap: 4 }}>
          {sources.map(s => (
            <div key={s.id} style={{ display: 'flex', gap: 4, alignItems: 'center', fontSize: 11 }}>
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={s.name}>{s.name} <span style={{ color: C.dim }}>{hms(s.durationSec)}</span></span>
              {(['FEATURE', 'EPISODE', 'EXTRA'] as TitleKind[]).map(k => <button key={k} style={{ ...btnS(), padding: '2px 5px', fontSize: 9 }} onClick={() => { addTitle(s, k); setAdding(false); }}>{k[0] + k.slice(1).toLowerCase()}</button>)}
            </div>
          ))}
          <button style={{ ...btnS(), fontSize: 11 }} onClick={() => { addTitle(null, 'EXTRA'); setAdding(false); }}>Empty title</button>
        </div>
      )}
      {disc.titles.map((t, i) => (
        <div key={t.id} data-testid={`disc-title-${i}`} style={row(sel.kind === 'title' && sel.id === t.id)} onClick={() => onSel({ kind: 'title', id: t.id })}>
          <Film size={13} /><span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{i + 1}. {t.name}</span><span style={{ fontSize: 9, color: C.dim }}>{t.kind}</span>
        </div>
      ))}
    </div>
  );
}

/** Menu canvas: drag buttons, see nav arrows, drive it with a remote. */
function MenuStage({ disc, menu, selBtn, setSelBtn, mut, onGoMenu, ping }: { disc: DiscProject; menu: DiscMenu; selBtn: string | null; setSelBtn: (id: string | null) => void; mut: (fn: (d: DiscProject) => void) => void; onGoMenu: (id: string) => void; ping?: (m: string) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [showNav, setShowNav] = useState(true);
  const [showSafe, setShowSafe] = useState(true);
  const [remote, setRemote] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [lastAction, setLastAction] = useState('');
  const drag = useRef<{ id: string; dx: number; dy: number } | null>(null);
  const navd = useMemo(() => ({ ...menu, buttons: autoNav(menu.buttons) }), [menu]);
  const focus = remote ?? selBtn ?? menu.defaultButton ?? menu.buttons[0]?.id;

  // Tela art (static layer, button states, motion layers) renders async; the canvas redraws when it lands.
  const [art, setArt] = useState<Map<string, CanvasImageSource> | undefined>();
  useEffect(() => { let alive = true; prepareArt(disc, menu.id).then(a => { if (alive) setArt(a); }); return () => { alive = false; }; }, [menu]);
  const [playing, setPlaying] = useState(true);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    let raf = 0; const t0 = performance.now();
    const frame = () => {
      const ctx = c.getContext('2d')!; ctx.save(); ctx.scale(c.width / 1920, c.height / 1080);
      drawMenu(ctx, navd, { selected: focus, activated: flash || undefined, showNav, showSafe, filmUnder: menu.id === disc.popupMenuId, art, time: (performance.now() - t0) / 1000 });
      if (selBtn && remote == null) { const b = menu.buttons.find(x => x.id === selBtn); if (b) { ctx.strokeStyle = C.accent; ctx.lineWidth = 3; ctx.setLineDash([]); ctx.strokeRect(b.x - 4, b.y - 4, b.w + 8, b.h + 8); } }
      ctx.restore();
      if (playing && menu.motion && art) raf = requestAnimationFrame(frame);
    };
    frame();
    return () => cancelAnimationFrame(raf);
  }, [navd, focus, flash, showNav, showSafe, selBtn, remote, menu, disc.popupMenuId, art, playing]);

  const toPlane = (e: React.MouseEvent) => { const r = ref.current!.getBoundingClientRect(); return { x: ((e.clientX - r.left) / r.width) * 1920, y: ((e.clientY - r.top) / r.height) * 1080 }; };
  const hit = (x: number, y: number) => [...menu.buttons].reverse().find(b => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h);
  const describe = (a: MenuAction): string => {
    const t = (id: string) => disc.titles.find(x => x.id === id)?.name || '?';
    switch (a.kind) {
      case 'PLAY_TITLE': { const tt = disc.titles.find(x => x.id === a.titleId); const ci = tt && a.chapterId ? tt.chapters.findIndex(c => c.id === a.chapterId) : -1; return `▶ Play "${t(a.titleId)}"${ci >= 0 ? ` from chapter ${ci + 1}` : ''}`; }
      case 'PLAY_ALL': return `▶ Play all (${a.titleIds.length})`;
      case 'GO_MENU': return `→ ${disc.menus.find(m => m.id === a.menuId)?.name}`;
      case 'SET_AUDIO': return `🔊 Audio → ${disc.titles.find(x => x.id === a.titleId)?.audio[a.trackIndex]?.label}`;
      case 'SET_SUBTITLE': return `💬 Subtitles → ${a.trackIndex === 'off' ? 'Off' : disc.titles.find(x => x.id === a.titleId)?.subtitles[a.trackIndex]?.label}`;
      case 'CLOSE_POPUP': return '✕ Close pop-up, keep playing';
      case 'RESUME': return '⏯ Resume';
      default: return 'Does nothing';
    }
  };
  const press = (k: 'up' | 'down' | 'left' | 'right' | 'ok') => {
    const cur = navd.buttons.find(b => b.id === focus); if (!cur) return;
    if (k === 'ok') {
      setFlash(cur.id); setTimeout(() => setFlash(null), 220);
      setLastAction(describe(cur.action));
      if (cur.action.kind === 'GO_MENU') { const id = cur.action.menuId; setTimeout(() => { setRemote(null); onGoMenu(id); }, 240); }
      return;
    }
    const n = cur.nav[k]; if (n) setRemote(n);
  };
  useEffect(() => {
    if (remote == null) return;
    const on = (e: KeyboardEvent) => { const m: Record<string, any> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', Enter: 'ok' }; if (m[e.key]) { e.preventDefault(); press(m[e.key]); } };
    window.addEventListener('keydown', on); return () => window.removeEventListener('keydown', on);
  });

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <b style={{ fontSize: 14, marginRight: 6 }}>{menu.name}</b>
        <button style={btnS(showNav, C.blue)} onClick={() => setShowNav(v => !v)}>Nav arrows</button>
        <button style={btnS(showSafe, C.warn)} onClick={() => setShowSafe(v => !v)}>Safe areas</button>
        <button style={btnS(remote != null, C.good)} onClick={() => { setRemote(remote == null ? (menu.defaultButton || menu.buttons[0]?.id || null) : null); setLastAction(''); }} data-testid="disc-remote-toggle"><Circle size={12} />Remote simulator</button>
        {menu.motion && <button style={btnS(playing, C.blue)} onClick={() => setPlaying(v => !v)} title={menu.motion.note}>{playing ? 'Motion on' : 'Motion off'}</button>}
        <button style={btnS()} onClick={() => mut(d => { const m = d.menus.find(x => x.id === menu.id)!; const l = m.buttons[0]?.style; m.buttons.push({ id: uid('btn'), label: 'New button', x: 760, y: 820, w: 400, h: 64, style: l ? { ...l } : { font: 'Inter', size: 36, color: '#999', selColor: '#fff', actColor: '#ff9a3c', mark: 'underline' }, nav: {}, action: { kind: 'NONE' } }); })}><Plus size={12} />Button</button>
        <span style={{ fontSize: 11, color: C.dim }}>Graphics plane {GRAPHICS_PLANE.w}×{GRAPHICS_PLANE.h}{disc.format === 'UHD' ? ' (UHD menus are HD graphics, scaled by the player)' : ''}</span>
      </div>
      <div style={{ position: 'relative', ...box, overflow: 'hidden' }}>
        <canvas ref={ref} width={1280} height={720} data-testid="disc-menu-canvas" style={{ width: '100%', display: 'block', cursor: remote != null ? 'default' : 'pointer' }}
          onMouseDown={e => { if (remote != null) return; const p = toPlane(e); const b = hit(p.x, p.y); setSelBtn(b?.id || null); if (b) drag.current = { id: b.id, dx: p.x - b.x, dy: p.y - b.y }; }}
          onMouseMove={e => { if (!drag.current) return; const p = toPlane(e); const { id, dx, dy } = drag.current; mut(d => { const b = d.menus.find(x => x.id === menu.id)!.buttons.find(x => x.id === id)!; b.x = Math.round(Math.max(0, Math.min(1920 - b.w, p.x - dx)) / 4) * 4; b.y = Math.round(Math.max(0, Math.min(1080 - b.h, p.y - dy)) / 4) * 4; b.nav = {}; }); }}
          onMouseUp={() => { drag.current = null; }} onMouseLeave={() => { drag.current = null; }} />
      </div>
      {remote != null && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 10 }} data-testid="disc-remote">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 34px)', gap: 4 }}>
            <span /><button style={btnS()} onClick={() => press('up')} aria-label="Up"><ChevronUp size={14} /></button><span />
            <button style={btnS()} onClick={() => press('left')} aria-label="Left"><ChevronLeft size={14} /></button>
            <button style={btnS(true, C.good)} onClick={() => press('ok')} aria-label="OK">OK</button>
            <button style={btnS()} onClick={() => press('right')} aria-label="Right"><ChevronRight size={14} /></button>
            <span /><button style={btnS()} onClick={() => press('down')} aria-label="Down"><ChevronDown size={14} /></button><span />
          </div>
          <div style={{ fontSize: 12, color: C.dim }}>Arrow keys + Enter work too.<div style={{ color: C.ink, fontSize: 14, marginTop: 6 }} data-testid="disc-remote-result">{lastAction}</div></div>
        </div>
      )}
    </div>
  );
}

function TitleEditor({ disc, title, mut, sources }: { disc: DiscProject; title: DiscTitle; mut: (fn: (d: DiscProject) => void) => void; sources: DiscSource[] }) {
  const ti = (fn: (t: DiscTitle) => void) => mut(d => fn(d.titles.find(x => x.id === title.id)!));
  const src = sources.find(s => s.id === title.source.assetId);
  return (
    <div style={{ display: 'grid', gap: 12 }} data-testid="disc-title-editor">
      <div style={{ ...box, padding: 12, display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 10 }}>
        <label><div style={lbl}>Title</div><input style={inp} value={title.name} onChange={e => ti(t => { t.name = e.target.value; })} /></label>
        <label><div style={lbl}>Kind</div><select style={inp} value={title.kind} onChange={e => ti(t => { t.kind = e.target.value as TitleKind; })}>{['FEATURE', 'EPISODE', 'EXTRA', 'TRAILER', 'INTRO'].map(k => <option key={k}>{k}</option>)}</select></label>
        <label><div style={lbl}>Runtime</div><input style={inp} value={hms(title.source.durationSec)} onChange={e => ti(t => { t.source.durationSec = parseHms(e.target.value); })} /></label>
        <label><div style={lbl}>When it ends</div><select style={inp} value={title.endAction} onChange={e => ti(t => { t.endAction = e.target.value as any; })}><option value="MENU">Back to menu</option><option value="NEXT">Play next title</option><option value="STOP">Stop</option></select></label>
        <label style={{ gridColumn: '1 / 3' }}><div style={lbl}>Source</div><select style={inp} value={title.source.assetId || ''} onChange={e => ti(t => { const s = sources.find(x => x.id === e.target.value); if (s) t.source = { ...t.source, assetId: s.id, durationSec: s.durationSec, path: s.path, url: s.url }; })}><option value="">— choose a cut or file —</option>{sources.map(s => <option key={s.id} value={s.id}>{s.name} ({hms(s.durationSec)})</option>)}</select></label>
        {(window as any).__plajahMediaEngine?.invoke && <button style={{ ...btnS(), alignSelf: 'end' }} onClick={async () => { const f = (await (window as any).__plajahMediaEngine.invoke('crossover_pick_files'))?.files?.[0]; if (f) ti(t => { t.source = { ...t.source, path: f.path, assetId: undefined }; }); }}>{title.source.path ? 'Change file…' : 'Use a file…'}</button>}
        {title.source.path && <div style={{ gridColumn: '1 / 5', fontSize: 11, color: C.dim, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>File: {title.source.path}</div>}
        <label><div style={lbl}>Video bitrate</div><input style={inp} placeholder="auto" value={title.videoKbps ? title.videoKbps / 1000 : ''} onChange={e => ti(t => { const v = parseFloat(e.target.value); t.videoKbps = v > 0 ? Math.round(v * 1000) : undefined; })} /></label>
        <label style={{ display: 'flex', alignItems: 'end', gap: 6, fontSize: 12 }}><input type="checkbox" checked={!!title.noSkip} onChange={e => ti(t => { t.noSkip = e.target.checked; })} />No skipping (logos)</label>
      </div>

      <div style={{ ...box, padding: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}><ListOrdered size={14} /><b style={{ fontSize: 13 }}>Chapters</b><span style={{ color: C.dim, fontSize: 11 }}>{title.chapters.length}</span><div style={{ flex: 1 }} />
          {src?.markers?.length ? <button style={btnS()} onClick={() => ti(t => { t.chapters = [{ id: uid('ch'), name: 'Opening', timeSec: 0 }, ...src.markers!.filter(m => m.t > 1).map((m, i) => ({ id: uid('ch'), name: m.label || `Chapter ${i + 2}`, timeSec: m.t }))]; })}>From timeline markers</button> : null}
          <button style={btnS()} onClick={() => ti(t => { t.chapters = autoChapters(t.source.durationSec, 600); })}>Every 10 min</button>
          <button style={btnS()} onClick={() => ti(t => { const last = t.chapters[t.chapters.length - 1]?.timeSec || 0; t.chapters.push({ id: uid('ch'), name: `Chapter ${t.chapters.length + 1}`, timeSec: Math.min(t.source.durationSec, last + 300) }); })}><Plus size={12} /></button>
        </div>
        <div style={{ display: 'grid', gap: 4, maxHeight: 220, overflow: 'auto' }}>
          {title.chapters.map((c, i) => (
            <div key={c.id} style={{ display: 'grid', gridTemplateColumns: '30px 90px 1fr 28px', gap: 6, alignItems: 'center' }}>
              <span style={{ color: C.dim, fontSize: 11 }}>{i + 1}</span>
              <input style={inp} value={hms(c.timeSec)} onChange={e => ti(t => { t.chapters[i].timeSec = parseHms(e.target.value); })} />
              <input style={inp} value={c.name} onChange={e => ti(t => { t.chapters[i].name = e.target.value; })} />
              <button style={{ ...btnS(), padding: 4 }} onClick={() => ti(t => { t.chapters.splice(i, 1); })} aria-label="Remove chapter"><Trash2 size={12} /></button>
            </div>
          ))}
        </div>
      </div>

      <div style={{ ...box, padding: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}><AudioLines size={14} /><b style={{ fontSize: 13 }}>Audio</b><div style={{ flex: 1 }} />
          <button style={btnS()} onClick={() => ti(t => { t.audio.push({ id: uid('aud'), lang: 'eng', label: 'Commentary', codec: 'ac3', channels: 2, kbps: 192, commentary: true }); })}><Plus size={12} />Track</button></div>
        {title.audio.map((a, i) => (
          <div key={a.id} style={{ display: 'grid', gridTemplateColumns: '1.4fr 70px 1.3fr 70px 80px 28px', gap: 6, marginBottom: 4 }}>
            <input style={inp} value={a.label} onChange={e => ti(t => { t.audio[i].label = e.target.value; })} />
            <input style={inp} value={a.lang} maxLength={3} onChange={e => ti(t => { t.audio[i].lang = e.target.value.toLowerCase(); })} aria-label="Language (ISO 639-2)" />
            <select style={inp} value={a.codec} onChange={e => ti(t => { const c = e.target.value as any; t.audio[i].codec = c; t.audio[i].kbps = c === 'lpcm' ? (t.audio[i].channels === 2 ? 2304 : t.audio[i].channels === 6 ? 6912 : 9216) : c === 'ac3' ? (t.audio[i].channels === 2 ? 224 : 640) : t.audio[i].kbps; })}>
              {Object.values(AUDIO).filter(s => s.codec !== 'eac3').map(s => <option key={s.codec} value={s.codec}>{s.label}{s.licensedEncoder ? ' (bring encoded)' : ''}</option>)}
            </select>
            <select style={inp} value={a.channels} onChange={e => ti(t => { t.audio[i].channels = +e.target.value as any; })}><option value={2}>2.0</option><option value={6}>5.1</option><option value={8}>7.1</option></select>
            <input style={inp} value={a.kbps} onChange={e => ti(t => { t.audio[i].kbps = +e.target.value || 0; })} aria-label="kbps" />
            <button style={{ ...btnS(), padding: 4 }} onClick={() => ti(t => { t.audio.splice(i, 1); })} aria-label="Remove track"><Trash2 size={12} /></button>
          </div>
        ))}
      </div>

      <div style={{ ...box, padding: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}><Subtitles size={14} /><b style={{ fontSize: 13 }}>Subtitles</b><span style={{ color: C.dim, fontSize: 11 }}>Rendered to Blu-ray graphics subtitles (PGS)</span><div style={{ flex: 1 }} />
          <button style={btnS()} onClick={() => ti(t => { t.subtitles.push({ id: uid('sub'), lang: 'eng', label: 'English' }); })}><Plus size={12} />Track</button></div>
        {title.subtitles.map((s, i) => (
          <div key={s.id} style={{ display: 'grid', gridTemplateColumns: '1fr 70px auto auto 28px', gap: 6, marginBottom: 6, alignItems: 'start' }}>
            <div style={{ display: 'grid', gap: 4 }}>
              <input style={inp} value={s.label} onChange={e => ti(t => { t.subtitles[i].label = e.target.value; })} />
              <textarea style={{ ...inp, height: 60, fontFamily: 'monospace', fontSize: 11 }} placeholder="Paste SRT…" value={s.srt || ''} onChange={e => ti(t => { t.subtitles[i].srt = e.target.value; })} />
            </div>
            <input style={inp} value={s.lang} maxLength={3} onChange={e => ti(t => { t.subtitles[i].lang = e.target.value.toLowerCase(); })} />
            <label style={{ fontSize: 11 }}><input type="checkbox" checked={!!s.forced} onChange={e => ti(t => { t.subtitles[i].forced = e.target.checked; })} /> Forced</label>
            <label style={{ fontSize: 11 }}><input type="checkbox" checked={!!s.sdh} onChange={e => ti(t => { t.subtitles[i].sdh = e.target.checked; })} /> SDH</label>
            <button style={{ ...btnS(), padding: 4 }} onClick={() => ti(t => { t.subtitles.splice(i, 1); })} aria-label="Remove subtitles"><Trash2 size={12} /></button>
          </div>
        ))}
        {!title.subtitles.length && <div style={{ color: C.dim, fontSize: 12 }}>No subtitles. Paste SRT or export your Fabula captions as SRT.</div>}
      </div>
      {disc.titles.length > 1 && <button style={{ ...btnS(), justifySelf: 'start', color: C.bad }} onClick={() => mut(d => { d.titles = d.titles.filter(x => x.id !== title.id); })}><Trash2 size={12} />Remove title</button>}
    </div>
  );
}

function FirstPlay({ disc, mut }: { disc: DiscProject; mut: (fn: (d: DiscProject) => void) => void }) {
  return (
    <div style={{ ...box, padding: 14, display: 'grid', gap: 12, maxWidth: 640 }}>
      <b>When the disc goes in</b>
      <div style={lbl}>Play first (studio logo, ratings card)</div>
      {disc.titles.filter(t => t.kind === 'INTRO' || t.kind === 'TRAILER').map(t => (
        <label key={t.id} style={{ fontSize: 12 }}><input type="checkbox" checked={disc.firstPlay.introTitleIds.includes(t.id)} onChange={e => mut(d => { d.firstPlay.introTitleIds = e.target.checked ? [...d.firstPlay.introTitleIds, t.id] : d.firstPlay.introTitleIds.filter(x => x !== t.id); })} /> {t.name}</label>
      ))}
      {!disc.titles.some(t => t.kind === 'INTRO' || t.kind === 'TRAILER') && <div style={{ color: C.dim, fontSize: 12 }}>Add a title of kind INTRO or TRAILER to play it before the menu.</div>}
      <div style={lbl}>Then</div>
      <div style={{ display: 'flex', gap: 6 }}>
        <button style={btnS(disc.firstPlay.then === 'TOP_MENU')} onClick={() => mut(d => { d.firstPlay.then = 'TOP_MENU'; })}>Show the main menu</button>
        <button style={btnS(disc.firstPlay.then === 'PLAY_FEATURE')} onClick={() => mut(d => { d.firstPlay.then = 'PLAY_FEATURE'; })}>Start the film</button>
      </div>
      <div style={lbl}>Region</div>
      <select style={{ ...inp, width: 220 }} value={disc.region} onChange={e => mut(d => { d.region = e.target.value as any; })}><option value="ABC">Region free (A/B/C)</option><option value="A">A — Americas, East Asia</option><option value="B">B — Europe, Africa, Oceania</option><option value="C">C — Asia (rest)</option></select>
      {disc.format === 'UHD' && <div style={{ fontSize: 11, color: C.dim }}>Ultra HD Blu-ray has no region coding — this only applies to the Blu-ray disc in a combo pack.</div>}
    </div>
  );
}

function Inspector({ disc, sel, selBtn, mut, ownerId, ping }: { disc: DiscProject; sel: Sel; selBtn: string | null; mut: (fn: (d: DiscProject) => void) => void; ownerId?: string; ping?: (m: string) => void }) {
  const wrap: React.CSSProperties = { borderLeft: `1px solid ${C.line}`, padding: 12, overflow: 'auto', display: 'grid', gap: 10, alignContent: 'start' };
  if (sel.kind === 'build') return <div style={wrap}><Destinations disc={disc} mut={mut} /></div>;
  if (sel.kind === 'title') return <div style={wrap}><Destinations disc={disc} mut={mut} /><VideoFormat disc={disc} mut={mut} /></div>;
  if (sel.kind !== 'menu') return <div style={wrap}><VideoFormat disc={disc} mut={mut} /></div>;
  const menu = disc.menus.find(m => m.id === sel.id); if (!menu) return <div style={wrap} />;
  const mm = (fn: (m: DiscMenu) => void) => mut(d => fn(d.menus.find(x => x.id === menu.id)!));
  const b = menu.buttons.find(x => x.id === selBtn);
  const bb = (fn: (b: MenuButton) => void) => mm(m => fn(m.buttons.find(x => x.id === selBtn)!));
  const openTela = async () => {
    try {
      const { newTelaId, saveTelaDoc } = await import('../../services/telaStore');
      const id = menu.telaDocId || newTelaId();
      await saveTelaDoc(menuToTelaDoc(menu, { id, ownerId: ownerId || 'local', discName: disc.name }));
      mm(m => { m.telaDocId = id; });
      window.dispatchEvent(new CustomEvent('plajah:openTela', { detail: { docId: id } }));
      ping?.('Menu opened in Tela — design it, then Pull from Tela');
    } catch (e: any) { ping?.(`Could not open Tela: ${e?.message || e}`); }
  };
  const pullTela = async () => {
    if (!menu.telaDocId) return;
    const { loadTelaDocFreshest } = await import('../../services/telaStore');
    const doc = await loadTelaDocFreshest(menu.telaDocId);
    if (!doc) { ping?.('That Tela design was not found'); return; }
    mut(d => { const i = d.menus.findIndex(x => x.id === menu.id); d.menus[i] = telaToMenu(doc, d.menus[i]); });
    ping?.('Pulled the Tela design into the menu');
  };
  return (
    <div style={wrap} data-testid="disc-inspector">
      {b ? (
        <>
          <div style={lbl}>Button</div>
          <input style={inp} value={b.label} onChange={e => bb(x => { x.label = e.target.value; })} aria-label="Button label" />
          <ActionEditor disc={disc} action={b.action} onChange={a => bb(x => { x.action = a; })} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
            {(['color', 'selColor', 'actColor'] as const).map(k => <label key={k} style={{ fontSize: 10, color: C.dim }}>{k === 'color' ? 'Normal' : k === 'selColor' ? 'Selected' : 'Activated'}<input type="color" value={toHex(b.style[k])} onChange={e => bb(x => { x.style[k] = e.target.value; })} style={{ width: '100%', height: 26, border: 'none', background: 'none' }} /></label>)}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            <label style={{ fontSize: 10, color: C.dim }}>Size<input style={inp} type="number" value={b.style.size} onChange={e => bb(x => { x.style.size = +e.target.value || 24; })} /></label>
            <label style={{ fontSize: 10, color: C.dim }}>Selection<select style={inp} value={b.style.mark || 'underline'} onChange={e => bb(x => { x.style.mark = e.target.value as any; })}>{['underline', 'pill', 'glow', 'arrow', 'none'].map(m => <option key={m}>{m}</option>)}</select></label>
            {(['x', 'y', 'w', 'h'] as const).map(k => <label key={k} style={{ fontSize: 10, color: C.dim }}>{k.toUpperCase()}<input style={inp} type="number" value={b[k]} onChange={e => bb(x => { x[k] = +e.target.value || 0; if (k === 'x' || k === 'y') x.nav = {}; })} /></label>)}
          </div>
          <div style={lbl}>Remote neighbours</div>
          {(['up', 'down', 'left', 'right'] as const).map(dir => (
            <label key={dir} style={{ display: 'grid', gridTemplateColumns: '50px 1fr', alignItems: 'center', fontSize: 11 }}>{dir}
              <select style={inp} value={b.nav[dir] || ''} onChange={e => bb(x => { x.nav[dir] = e.target.value || undefined; })}>
                <option value="">auto</option>{menu.buttons.map(o => <option key={o.id} value={o.id}>{o.id === b.id ? '(stay)' : o.label}</option>)}
              </select></label>
          ))}
          <label style={{ fontSize: 11 }}><input type="checkbox" checked={menu.defaultButton === b.id} onChange={() => mm(m => { m.defaultButton = b.id; })} /> Selected when the menu opens</label>
          <button style={{ ...btnS(), color: C.bad }} onClick={() => mm(m => { m.buttons = m.buttons.filter(x => x.id !== b.id); })}><Trash2 size={12} />Delete button</button>
        </>
      ) : (
        <>
          <div style={lbl}>Menu</div>
          <input style={inp} value={menu.name} onChange={e => mm(m => { m.name = e.target.value; })} aria-label="Menu name" />
          <select style={inp} value={menu.kind} onChange={e => mm(m => { m.kind = e.target.value as any; })}>{['TOP', 'POPUP', 'SCENES', 'SETUP', 'EXTRAS', 'EPISODES'].map(k => <option key={k}>{k}</option>)}</select>
          <div style={{ display: 'flex', gap: 6 }}>
            <button style={btnS(disc.topMenuId === menu.id)} onClick={() => mut(d => { d.topMenuId = menu.id; })}>Top menu</button>
            <button style={btnS(disc.popupMenuId === menu.id)} onClick={() => mut(d => { d.popupMenuId = d.popupMenuId === menu.id ? undefined : menu.id; })}>Pop-up</button>
          </div>
          <div style={lbl}>Background</div>
          <select style={inp} value={menu.background.kind} onChange={e => mm(m => { const k = e.target.value as any; m.background = k === 'title' ? { kind: 'title', value: '', titleId: disc.titles[0]?.id, fromSec: 300, loopSec: 30 } : { kind: k, value: k === 'color' ? '#0b0b10' : '' }; })}>
            <option value="color">Colour</option><option value="image">Still image</option><option value="title">Loop from a title</option><option value="video">Video file</option>
          </select>
          {menu.background.kind === 'color' && <input type="color" value={toHex(menu.background.value)} onChange={e => mm(m => { m.background.value = e.target.value; })} style={{ width: '100%', height: 28, border: 'none', background: 'none' }} />}
          {(menu.background.kind === 'image' || menu.background.kind === 'video') && <input style={inp} placeholder="URL or file path" value={menu.background.value} onChange={e => mm(m => { m.background.value = e.target.value; })} />}
          {menu.background.kind === 'title' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 70px 60px', gap: 6 }}>
              <select style={inp} value={menu.background.titleId} onChange={e => mm(m => { m.background.titleId = e.target.value; })}>{disc.titles.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
              <input style={inp} value={hms(menu.background.fromSec || 0)} onChange={e => mm(m => { m.background.fromSec = parseHms(e.target.value); })} title="Start" />
              <input style={inp} type="number" value={menu.background.loopSec || 30} onChange={e => mm(m => { m.background.loopSec = +e.target.value || 30; })} title="Loop seconds" />
            </div>
          )}
          <div style={lbl}>Design</div>
          <button style={btnS(false, C.blue)} onClick={openTela} data-testid="disc-open-tela"><PenTool size={13} />Design in Tela</button>
          {menu.telaDocId && <button style={btnS()} onClick={pullTela}><RefreshCw size={13} />Pull from Tela</button>}
          <div style={{ fontSize: 11, color: C.dim }}>Click a button on the canvas to edit it. Drag to move. Neighbours fill in from layout unless you set them.</div>
          {disc.menus.length > 1 && <button style={{ ...btnS(), color: C.bad }} onClick={() => mut(d => { d.menus = d.menus.filter(x => x.id !== menu.id); if (d.topMenuId === menu.id) d.topMenuId = d.menus[0]?.id; if (d.popupMenuId === menu.id) d.popupMenuId = undefined; })}><Trash2 size={12} />Delete menu</button>}
        </>
      )}
    </div>
  );
}

function ActionEditor({ disc, action, onChange }: { disc: DiscProject; action: MenuAction; onChange: (a: MenuAction) => void }) {
  const t0 = disc.titles[0]?.id || '';
  const titleId = 'titleId' in action ? action.titleId : t0;
  const tt = disc.titles.find(t => t.id === titleId);
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <div style={lbl}>When pressed</div>
      <select style={inp} value={action.kind} onChange={e => {
        const k = e.target.value as MenuAction['kind'];
        onChange(k === 'PLAY_TITLE' ? { kind: k, titleId: t0 } : k === 'PLAY_ALL' ? { kind: k, titleIds: disc.titles.filter(t => t.kind === 'EPISODE' || t.kind === 'FEATURE').map(t => t.id) } : k === 'GO_MENU' ? { kind: k, menuId: disc.menus[0]?.id || '' } : k === 'SET_AUDIO' ? { kind: k, titleId: t0, trackIndex: 0 } : k === 'SET_SUBTITLE' ? { kind: k, titleId: t0, trackIndex: 'off' } : { kind: k } as MenuAction);
      }}>
        <option value="PLAY_TITLE">Play a title / chapter</option><option value="PLAY_ALL">Play all</option><option value="GO_MENU">Go to menu</option>
        <option value="SET_AUDIO">Choose audio</option><option value="SET_SUBTITLE">Choose subtitles</option><option value="CLOSE_POPUP">Close pop-up</option><option value="RESUME">Resume</option><option value="NONE">Nothing</option>
      </select>
      {'titleId' in action && <select style={inp} value={action.titleId} onChange={e => onChange({ ...action, titleId: e.target.value } as MenuAction)}>{disc.titles.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select>}
      {action.kind === 'PLAY_TITLE' && tt && <select style={inp} value={action.chapterId || ''} onChange={e => onChange({ ...action, chapterId: e.target.value || undefined })}><option value="">From the start</option>{tt.chapters.map((c, i) => <option key={c.id} value={c.id}>{i + 1}. {c.name} ({hms(c.timeSec)})</option>)}</select>}
      {action.kind === 'GO_MENU' && <select style={inp} value={action.menuId} onChange={e => onChange({ ...action, menuId: e.target.value })}>{disc.menus.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select>}
      {action.kind === 'SET_AUDIO' && tt && <select style={inp} value={action.trackIndex} onChange={e => onChange({ ...action, trackIndex: +e.target.value })}>{tt.audio.map((a, i) => <option key={a.id} value={i}>{a.label}</option>)}</select>}
      {action.kind === 'SET_SUBTITLE' && tt && <select style={inp} value={String(action.trackIndex)} onChange={e => onChange({ ...action, trackIndex: e.target.value === 'off' ? 'off' : +e.target.value })}><option value="off">Off</option>{tt.subtitles.map((s, i) => <option key={s.id} value={i}>{s.label}</option>)}</select>}
    </div>
  );
}

function Destinations({ disc, mut }: { disc: DiscProject; mut: (fn: (d: DiscProject) => void) => void }) {
  const icon = { 'burn-pod': <Flame size={14} />, 'burn-run': <Package size={14} />, 'press-retail': <Factory size={14} /> } as const;
  return (
    <div style={{ display: 'grid', gap: 8 }} data-testid="disc-destinations">
      <div style={lbl}>Destination</div>
      {DESTINATIONS.map(d => (
        <button key={d.id} onClick={() => mut(p => { p.destination = d.id; if (!d.media.includes(p.mediumId)) p.mediumId = suggestMedium(p, d.media) || d.media.find(id => mediumById(id)?.format.includes(p.format)) || d.media[0]; })}
          style={{ ...box, padding: 10, textAlign: 'left', cursor: 'pointer', color: C.ink, borderColor: disc.destination === d.id ? C.accent : C.line, background: disc.destination === d.id ? `${C.accent}14` : C.panel }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, fontSize: 12 }}>{icon[d.id]}{d.label}</div>
          <div style={{ fontSize: 11, color: C.dim, marginTop: 3 }}>{d.blurb}</div>
        </button>
      ))}
      <div style={lbl}>Disc</div>
      <select style={inp} value={disc.mediumId} onChange={e => mut(p => { p.mediumId = e.target.value; })}>
        {MEDIA.filter(m => destinationMedia(disc.destination).includes(m.id) && m.format.includes(disc.format)).map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
      </select>
    </div>
  );
}

function VideoFormat({ disc, mut }: { disc: DiscProject; mut: (fn: (d: DiscProject) => void) => void }) {
  const modes = VIDEO_MODES[disc.format];
  const cur = modes.findIndex(m => m.w === disc.video.w && m.h === disc.video.h && m.fps === disc.video.fps && m.scan === disc.video.scan);
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <div style={lbl}>Video</div>
      <select style={inp} value={cur} onChange={e => mut(p => { const m = modes[+e.target.value]; p.video = { ...p.video, w: m.w, h: m.h, fps: m.fps, scan: m.scan }; })}>
        {modes.map((m, i) => <option key={m.label} value={i}>{m.w}×{m.h} {m.label}</option>)}
      </select>
      {disc.format === 'UHD' && (
        <>
          <select style={inp} value={disc.video.dynamic} onChange={e => mut(p => { p.video.dynamic = e.target.value as any; if (!p.video.hdr && e.target.value !== 'SDR709' && e.target.value !== 'SDR2020') p.video.hdr = { maxCll: 1000, maxFall: 400, masterDisplay: 'P3-D65-1000' }; })}>
            <option value="HDR10">HDR10</option><option value="HDR10PLUS">HDR10+</option><option value="DOLBY_VISION">Dolby Vision (licence)</option><option value="SDR2020">SDR BT.2020</option><option value="SDR709">SDR BT.709</option>
          </select>
          {disc.video.hdr && disc.video.dynamic !== 'SDR709' && disc.video.dynamic !== 'SDR2020' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              <label style={{ fontSize: 10, color: C.dim }}>MaxCLL<input style={inp} type="number" value={disc.video.hdr.maxCll} onChange={e => mut(p => { p.video.hdr!.maxCll = +e.target.value || 0; })} /></label>
              <label style={{ fontSize: 10, color: C.dim }}>MaxFALL<input style={inp} type="number" value={disc.video.hdr.maxFall} onChange={e => mut(p => { p.video.hdr!.maxFall = +e.target.value || 0; })} /></label>
              <label style={{ fontSize: 10, color: C.dim, gridColumn: '1 / 3' }}>Mastering display<select style={inp} value={disc.video.hdr.masterDisplay} onChange={e => mut(p => { p.video.hdr!.masterDisplay = e.target.value as any; })}><option value="P3-D65-1000">P3-D65 1000 nits</option><option value="P3-D65-4000">P3-D65 4000 nits</option><option value="BT2020-1000">BT.2020 1000 nits</option></select></label>
            </div>
          )}
        </>
      )}
      <div style={{ fontSize: 11, color: C.dim }}>{disc.format === 'UHD' ? 'HEVC Main10 · x265 UHD-BD profile' : 'H.264 High@4.1 · x264 Blu-ray compatible'}</div>
    </div>
  );
}

function BuildPanel({ disc, mut, issues, ping }: { disc: DiscProject; mut: (fn: (d: DiscProject) => void) => void; issues: Issue[]; ping?: (m: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ files: string[]; jobs: string[]; where?: string } | null>(null);
  const [showNav, setShowNav] = useState(false);
  const sum = summarize(issues);
  const comp = useMemo(() => compile(disc), [disc]);
  const dest = DESTINATIONS.find(d => d.id === disc.destination)!;
  const run = async (target: 'zip' | 'folder') => {
    setBusy(true);
    try {
      const safe = disc.name.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '_') || 'Disc';
      const engine = (window as any).__plajahMediaEngine;
      let root = 'C:/Plajah/Discs';
      if (target === 'folder' && engine?.invoke) {
        const picked = (await engine.invoke('crossover_pick_folder'))?.path;
        if (!picked) { setBusy(false); return; }
        root = `${picked}\\${safe}_${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}`;
      }
      const pkg = buildPackage(disc, await prepareRaster(disc), { workDir: root, inputFor: t => t.source.path || t.source.url || `${t.name}.mov` });
      const names = [...pkg.files.keys()];
      if (target === 'folder' && engine?.invoke) {
        for (const [rel, bytes] of pkg.files) {
          const path = `${root}\\${rel.replace(/\//g, '\\')}`;
          await engine.invoke('crossover_write_text', { path, text: '' });
          for (let o = 0; o < bytes.length; o += 1 << 20) {
            let bin = ''; const chunk = bytes.subarray(o, o + (1 << 20));
            for (let i = 0; i < chunk.length; i += 0x8000) bin += String.fromCharCode(...chunk.subarray(i, i + 0x8000));
            await engine.invoke('crossover_append_base64', { path, data: btoa(bin) });
          }
        }
        await engine.invoke('crossover_write_text', { path: `${root}\\WORK\\encode_jobs.json`, text: JSON.stringify(pkg.encodeJobs, null, 2) });
        setResult({ files: names, jobs: pkg.encodeJobs.map(j => j.label), where: root });
        ping?.(`Disc package written to ${root}`);
      } else {
        const z: Record<string, Uint8Array> = {};
        for (const [k, v] of pkg.files) z[`${safe}/${k}`] = v;
        z[`${safe}/WORK/encode_jobs.json`] = new TextEncoder().encode(JSON.stringify(pkg.encodeJobs, null, 2));
        const blob = new Blob([zipSync(z)], { type: 'application/zip' });
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${safe}_disc_package.zip`; a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
        setResult({ files: names, jobs: pkg.encodeJobs.map(j => j.label) });
      }
    } catch (e: any) { ping?.(`Build failed: ${e?.message || e}`); }
    setBusy(false);
  };
  const sevIcon = (s: Issue['severity']) => (s === 'error' ? <AlertTriangle size={13} color={C.bad} /> : s === 'warn' ? <AlertTriangle size={13} color={C.warn} /> : <Info size={13} color={C.blue} />);
  return (
    <div style={{ display: 'grid', gap: 12 }} data-testid="disc-build">
      <div style={{ ...box, padding: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><b style={{ fontSize: 15 }}>{dest.label}</b><span style={{ color: C.dim, fontSize: 12 }}>· {mediumById(disc.mediumId)?.label} · {disc.format === 'UHD' ? 'Ultra HD Blu-ray' : 'Blu-ray'}</span></div>
        <div style={{ fontSize: 12, color: C.dim, margin: '6px 0 10px' }}>Output: {dest.output.join(' · ')}{dest.needsAacs ? ` · minimum ${dest.minUnits} discs` : ''}</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button style={btnS()} disabled={busy} onClick={() => run('folder')} data-testid="disc-build-folder"><Hammer size={13} />{busy ? 'Building…' : 'Authoring package to folder'}</button>
          <button style={btnS()} disabled={busy} onClick={() => run('zip')} data-testid="disc-build-zip"><Download size={13} />Download package (.zip)</button>
        </div>
        {!sum.ready && <div style={{ color: C.warn, fontSize: 12, marginTop: 8 }}>You can build a working package now, but fix the {sum.errors} error{sum.errors === 1 ? '' : 's'} below before burning or sending to press.</div>}
        {result && <div style={{ marginTop: 10, fontSize: 12 }} data-testid="disc-build-result"><b style={{ color: C.good }}>Package built</b>{result.where ? ` → ${result.where}` : ''} · {result.files.length} files · {result.jobs.length} encode jobs queued for the desktop engine</div>}
      </div>
      <MakeDiscPanel disc={disc} ready={sum.ready} ping={ping} />
      <div style={{ ...box, padding: 14 }}>
        <b style={{ fontSize: 13 }}>Compliance</b>
        <div style={{ display: 'grid', gap: 6, marginTop: 8 }} data-testid="disc-issues">
          {issues.map((i, k) => <div key={k} style={{ display: 'grid', gridTemplateColumns: '18px 1fr', gap: 6, fontSize: 12 }}>{sevIcon(i.severity)}<div>{i.message}{i.fix && <div style={{ color: C.dim, fontSize: 11 }}>{i.fix}</div>}</div></div>)}
        </div>
      </div>
      <div style={{ ...box, padding: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><b style={{ fontSize: 13 }}>Disc program</b><span style={{ color: C.dim, fontSize: 11 }}>{comp.objects.length} movie objects · {comp.playlists.length} playlists · {comp.menus.length} menus</span><div style={{ flex: 1 }} /><button style={btnS(showNav)} onClick={() => setShowNav(v => !v)}>Show commands</button></div>
        {showNav && <pre style={{ fontSize: 11, color: C.dim, maxHeight: 260, overflow: 'auto', marginBottom: 0 }}>{comp.objects.map((o, i) => `#${i} ${o.name}\n${o.obj.commands.map((c, j) => `   ${String(j).padStart(2)}  ${disasm(c)}`).join('\n')}`).join('\n\n')}</pre>}
      </div>
      <div style={{ ...box, padding: 14, fontSize: 12, color: C.dim }}>
        <b style={{ color: C.ink }}>What the package contains</b>
        <ul style={{ margin: '6px 0 0', paddingLeft: 18, lineHeight: 1.6 }}>
          <li>Disc navigation: index.bdmv, MovieObject.bdmv, every playlist (with backups).</li>
          <li>Menus as Blu-ray interactive graphics streams, subtitles as PGS streams.</li>
          <li>Two-pass x264 / x265 encode jobs for the desktop engine, plus the {dest.needsAacs ? 'press package' : 'burn job sheet'}.</li>
          <li>On the desktop app, Make the disc runs the whole chain: encode → mux (M2TS + clip info) → UDF 2.50 ISO → burn + verify.</li>
        </ul>
      </div>
      <PackagingFields disc={disc} mut={mut} />
    </div>
  );
}

function PackagingFields({ disc, mut }: { disc: DiscProject; mut: (fn: (d: DiscProject) => void) => void }) {
  return (
    <div style={{ ...box, padding: 14, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8 }}>
      <b style={{ gridColumn: '1 / 5', fontSize: 13 }}>Packaging</b>
      <label><div style={lbl}>Case</div><select style={inp} value={disc.packaging.case} onChange={e => mut(d => { d.packaging.case = e.target.value as any; })}>{['AMARAY', 'ELITE', 'STEELBOOK', 'DIGIPAK', 'SLEEVE'].map(c => <option key={c}>{c}</option>)}</select></label>
      <label><div style={lbl}>UPC</div><input style={inp} value={disc.packaging.upc || ''} onChange={e => mut(d => { d.packaging.upc = e.target.value.replace(/\D/g, '').slice(0, 13) || undefined; })} /></label>
      <label><div style={lbl}>Catalog #</div><input style={inp} value={disc.packaging.catalog || ''} onChange={e => mut(d => { d.packaging.catalog = e.target.value || undefined; })} /></label>
      <label style={{ display: 'flex', alignItems: 'end', fontSize: 12, gap: 6 }}><input type="checkbox" checked={!!disc.packaging.slipcover} onChange={e => mut(d => { d.packaging.slipcover = e.target.checked; })} />Slipcover</label>
    </div>
  );
}

function toHex(c?: string) {
  if (!c) return '#000000';
  if (/^#[0-9a-f]{6}$/i.test(c)) return c;
  if (/^#[0-9a-f]{3}$/i.test(c)) return `#${c.slice(1).split('').map(x => x + x).join('')}`;
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(c);
  return m ? `#${[m[1], m[2], m[3]].map(v => (+v).toString(16).padStart(2, '0')).join('')}` : '#000000';
}

const STEPS: { id: StepId; label: string }[] = [
  { id: 'encode', label: 'Encode' }, { id: 'menus', label: 'Menu clips' }, { id: 'mux', label: 'Mux + clip info' },
  { id: 'navigation', label: 'Navigation' }, { id: 'image', label: 'ISO image' }, { id: 'burn', label: 'Burn + verify' },
];

function MakeDiscPanel({ disc, ready, ping }: { disc: DiscProject; ready: boolean; ping?: (m: string) => void }) {
  const engine = (window as any).__plajahMediaEngine;
  const press = DESTINATIONS.find(d => d.id === disc.destination)!.needsAacs;
  const [until, setUntil] = useState<'folder' | 'iso' | 'burn'>(press ? 'iso' : 'burn');
  const [recorders, setRecorders] = useState<{ id: string; name: string; drive: string; canWriteBd: boolean; media: string; freeBytes: number; blank: boolean }[]>([]);
  const [rec, setRec] = useState('');
  const [verify, setVerify] = useState(true);
  const [steps, setSteps] = useState<Partial<Record<StepId, StepUpdate>>>({});
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const ctl = useRef<AbortController | null>(null);
  useEffect(() => { if (press && until === 'burn') setUntil('iso'); }, [press, until]);
  const refresh = async () => {
    if (!engine?.invoke) return;
    const r = await engine.invoke('disc_recorders');
    const list = (r?.recorders || []).filter((x: any) => x.canWriteBd);
    setRecorders(list); if (!rec && list[0]) setRec(list[0].id);
  };
  useEffect(() => { void refresh(); }, []);
  const noSource = disc.titles.filter(t => !t.source.path && !t.source.url);
  const go = async () => {
    setErr(null); setDone(null); setSteps({}); setRunning(true);
    ctl.current = new AbortController();
    try {
      const folder = (await engine.invoke('crossover_pick_folder'))?.path;
      if (!folder) { setRunning(false); return; }
      const { runNativeFfmpeg, localMediaUrl } = await import('../../services/crossover/nativeEngine');
      const safe = disc.name.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '_') || 'Disc';
      const root = `${folder}\\${safe}_${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}`;
      const r = await makeDisc(disc, {
        invoke: (c, a) => engine.invoke(c, a),
        readUrl: p => localMediaUrl(p),
        runFfmpeg: (args, out, dur, on) => runNativeFfmpeg(() => args, out, dur, false, pr => on(pr.progress || 0), ctl.current!.signal).then(() => {}),
      }, { root, until, recorderId: rec, verify, raster: await prepareRaster(disc), signal: ctl.current.signal, onStep: s => setSteps(prev => ({ ...prev, [s.step]: s })) });
      const msg = r.burned ? 'Disc burned and verified.' : r.iso ? `ISO ready: ${r.iso}` : `Disc folder ready: ${r.folder}`;
      setDone(msg); ping?.(msg);
    } catch (e: any) { setErr(e?.name === 'AbortError' ? 'Cancelled.' : String(e?.message || e)); }
    setRunning(false);
  };
  const active = STEPS.filter(s => until === 'burn' || (until === 'iso' ? s.id !== 'burn' : s.id !== 'burn' && s.id !== 'image'));
  return (
    <div style={{ ...box, padding: 14, display: 'grid', gap: 10 }} data-testid="disc-make">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Disc3 size={15} color={C.accent} /><b style={{ fontSize: 14 }}>Make the disc</b><span style={{ fontSize: 11, color: C.dim }}>desktop app · ffmpeg + Windows disc imaging</span></div>
      {!engine?.invoke ? (
        <div style={{ fontSize: 12, color: C.dim }}>Encoding, muxing, imaging and burning run on your PC in the Plajah desktop app. In the browser you can author the disc and download the package.</div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button style={btnS(until === 'folder')} onClick={() => setUntil('folder')}>Disc folder (BDMV)</button>
            <button style={btnS(until === 'iso')} onClick={() => setUntil('iso')}>{press ? 'ISO for the replicator' : 'ISO image'}</button>
            {!press && <button style={btnS(until === 'burn')} onClick={() => setUntil('burn')}><Flame size={12} />Burn a disc</button>}
          </div>
          {until === 'burn' && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <select style={{ ...inp, width: 320 }} value={rec} onChange={e => setRec(e.target.value)} aria-label="Burner">
                {!recorders.length && <option value="">No Blu-ray burner found</option>}
                {recorders.map(r => <option key={r.id} value={r.id}>{r.name} ({r.drive}) · {r.media}{r.blank ? ` · ${(r.freeBytes / 1e9).toFixed(1)} GB blank` : r.media !== 'none' ? ' · not blank' : ''}</option>)}
              </select>
              <button style={btnS()} onClick={refresh}><RefreshCw size={12} />Rescan</button>
              <label style={{ fontSize: 12 }}><input type="checkbox" checked={verify} onChange={e => setVerify(e.target.checked)} /> Verify after burning</label>
            </div>
          )}
          {noSource.length > 0 && <div style={{ fontSize: 12, color: C.warn }}>Point these titles at a rendered file first (Title › Use a file…): {noSource.map(t => t.name).join(', ')}</div>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={{ ...btnS(true, ready ? C.good : C.warn), ...(running || noSource.length > 0 || (until === 'burn' && !rec) ? { opacity: 0.4, cursor: 'not-allowed' } : {}) }} disabled={running || noSource.length > 0 || (until === 'burn' && !rec)} onClick={go} data-testid="disc-make-go"><Hammer size={13} />{running ? 'Working…' : until === 'burn' ? 'Make and burn' : until === 'iso' ? 'Make ISO' : 'Make disc folder'}</button>
            {running && <button style={btnS()} onClick={() => ctl.current?.abort()}>Cancel</button>}
          </div>
          {(running || done || err || Object.keys(steps).length > 0) && (
            <div style={{ display: 'grid', gap: 6 }}>
              {active.map(s => {
                const u = steps[s.id]; const pct = u ? (u.progress < 0 ? null : Math.round(u.progress * 100)) : 0;
                return (
                  <div key={s.id} style={{ display: 'grid', gridTemplateColumns: '120px 1fr 44px', gap: 8, alignItems: 'center', fontSize: 12 }}>
                    <span style={{ color: u ? C.ink : C.dim }}>{s.label}</span>
                    <div style={{ height: 6, background: C.panel2, borderRadius: 3, overflow: 'hidden' }}><div style={{ width: pct == null ? '100%' : `${pct}%`, height: '100%', background: pct === 100 ? C.good : C.accent, opacity: pct == null ? 0.5 : 1 }} /></div>
                    <span style={{ color: C.dim, textAlign: 'right' }}>{u ? (pct == null ? '…' : `${pct}%`) : ''}</span>
                    {u?.label && <span style={{ gridColumn: '2 / 4', fontSize: 11, color: C.dim, marginTop: -4 }}>{u.label}{u.detail ? ` · ${u.detail}` : ''}</span>}
                  </div>
                );
              })}
              {done && <div style={{ color: C.good, fontSize: 12 }}>✓ {done}</div>}
              {err && <div style={{ color: C.bad, fontSize: 12 }}>⚠ {err}</div>}
            </div>
          )}
          {press && <div style={{ fontSize: 11, color: C.dim }}>For a pressed release, the replicator takes this ISO, premasters the cutting master and applies {disc.format === 'UHD' ? 'AACS 2' : 'AACS'}. The press package (manifest + checklist) is written next to it.</div>}
        </>
      )}
    </div>
  );
}
