// Biology Lab (phase 0): molecules (PDB / mmCIF / AlphaFold) and pathway simulation (SBML,
// live sliders). Results go into Tela as a 3D item or a native chart.
// Plan: docs/CAD_BIM_ENGINEERING_SUITE_PLAN.md (biology stack).

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRoomHost } from '../workspace/roomHost';
import { useToolRail, AriaToolHint, type ToolRail } from '../workspace/useToolRail';
import { BIO, registerBioTools, fewMolecules, moleculeFacts, type BioToolDoc, type BioToolId } from '../../services/bio/workspaceTools';
import type { Level } from '../../services/workspace/guidePath';
import * as THREE from 'three';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { X, FolderOpen, Dna, Activity, Eye, EyeOff, FilePlus2, Download, RotateCcw, AlertTriangle, CheckCircle2, Search } from 'lucide-react';
import { parseStructure, proteinMass, structureBounds, type Structure } from '../../services/bio/structure';
import { structureToGroup, type MolStyle, type MolColor } from '../../services/bio/molScene';
import { fetchPdbEntry, fetchAlphaFold, STRUCTURE_PICKS, searchBioModels, fetchBioModel, type SourceFile, type BioModelHit } from '../../services/bio/sources';
import { parseSbml, simulate, simulateStochastic, writeSbml, describeReaction, type BioModel, type SimResult } from '../../services/bio/sbml';
import { STARTERS } from '../../services/bio/models';
import type { TelaMediaDevice, TelaChartDevice } from '../../types';
import { structureToTelaDevice, simulationToTelaChart, type Upload } from '../../services/bio/telaBio';

registerBioTools();
const NO_SEL: number[] = [];
const MOLECULE_GROUP = ['Molecule'], PATHWAY_GROUP = ['Pathway'];

const C = { bg: '#0b0d10', panel: '#12151a', line: 'rgba(255,255,255,.08)', text: 'rgba(255,255,255,.88)', dim: 'rgba(255,255,255,.5)', accent: '#5eead4', warm: '#fbbf24' };
const SERIES = ['#5eead4', '#f472b6', '#fbbf24', '#60a5fa', '#a78bfa', '#fb923c', '#4ade80', '#f87171'];

export interface BioRoomProps {
  onClose?: () => void;
  /** Present when opened from a Tela document. */
  onAddToTela?: (device: TelaMediaDevice | TelaChartDevice) => Promise<void>;
  upload?: Upload;
  makeId?: () => string;
  initialTab?: 'molecule' | 'pathway';
  /** Reopen a structure kept on a Tela item. */
  loadStructure?: () => Promise<SourceFile>;
  /** Reopen the simulation a Tela chart came from. */
  loadModel?: () => Promise<{ xml: string; tEnd: number; name: string }>;
  /** Simple/Pro from the workspace shell: Pro shows every tool, Simple lets them join as needed. */
  level?: Level;
}

/** Well-known curated BioModels entries: they load by ID even when search is down. Durations are starting points. */
const BIOMODEL_PICKS: Array<{ id: string; label: string; field: string; tEnd: number }> = [
  { id: 'BIOMD0000000012', label: 'Repressilator (Elowitz 2000)', field: 'Synthetic biology', tEnd: 1000 },
  { id: 'BIOMD0000000005', label: 'Cell cycle (Tyson 1991)', field: 'Cell biology', tEnd: 100 },
  { id: 'BIOMD0000000010', label: 'MAPK oscillations (Kholodenko 2000)', field: 'Signalling', tEnd: 6000 },
  { id: 'BIOMD0000000021', label: 'Circadian clock, fly (Leloup 1999)', field: 'Chronobiology', tEnd: 240 },
  { id: 'BIOMD0000000035', label: 'Noise-resistant oscillator (Vilar 2002)', field: 'Gene networks', tEnd: 400 },
  { id: 'BIOMD0000000064', label: 'Yeast glycolysis (Teusink 2000)', field: 'Metabolism', tEnd: 20 },
  { id: 'BIOMD0000000098', label: 'Calcium spikes (Goldbeter 1990)', field: 'Physiology', tEnd: 10 },
  { id: 'BIOMD0000000140', label: 'NF-κB signalling (Hoffmann 2002)', field: 'Immunology', tEnd: 600 },
];

function useNarrow(px: number) {
  const q = `(max-width: ${px - 1}px)`;
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches);
  useEffect(() => { const mq = window.matchMedia(q); const on = () => setNarrow(mq.matches); on(); mq.addEventListener('change', on); return () => mq.removeEventListener('change', on); }, [q]);
  return narrow;
}

export default function BioRoom({ onClose, onAddToTela, upload, makeId, initialTab = 'molecule', loadStructure, loadModel, level = 'simple' }: BioRoomProps) {
  const roomHost = useRoomHost();
  const [tab, setTab] = useState<'molecule' | 'pathway'>(loadStructure ? 'molecule' : loadModel ? 'pathway' : initialTab);
  const [note, setNote] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const narrow = useNarrow(900);
  const add = onAddToTela && upload && makeId ? async (build: () => Promise<TelaMediaDevice | TelaChartDevice>) => {
    try { await onAddToTela(await build()); setNote({ kind: 'ok', text: 'Added to the document.' }); } catch (e: any) { setNote({ kind: 'err', text: e?.message || String(e) }); }
  } : undefined;
  return createPortal(
    <div className="fixed inset-0 z-[200] flex flex-col" style={{ background: C.bg, color: C.text, fontFamily: 'Inter, system-ui, sans-serif' }} data-testid="bio-room">
      <header className="flex items-center gap-2 px-3 h-12 shrink-0 overflow-x-auto bio-bar" style={{ borderBottom: `1px solid ${C.line}`, background: C.panel }}>
        <div className="flex items-center gap-2 pr-3 mr-1 shrink-0" style={{ borderRight: `1px solid ${C.line}` }}>
          <div className="w-7 h-7 rounded-lg grid place-items-center" style={{ background: 'linear-gradient(135deg,#14b8a6,#8b5cf6)' }}><Dna size={15} color="#fff"/></div>
          {!narrow && <div className="text-[13px] font-bold whitespace-nowrap">Biology Lab</div>}
        </div>
        <div className="flex items-center rounded-lg overflow-hidden shrink-0" style={{ border: `1px solid ${C.line}` }}>
          {(['molecule', 'pathway'] as const).map(t => <button key={t} onClick={() => setTab(t)} data-testid={`bio-tab-${t}`} className="px-3 h-8 text-[12px] font-semibold flex items-center gap-1.5" style={{ background: tab === t ? 'rgba(94,234,212,.14)' : 'transparent', color: tab === t ? C.accent : C.dim }}>{t === 'molecule' ? <><Dna size={13}/>Molecule</> : <><Activity size={13}/>Pathway</>}</button>)}
        </div>
        <div className="flex-1"/>
        {onClose && <button className="bio-btn" onClick={onClose} aria-label="Close"><X size={15}/></button>}
      </header>
      <div className="flex-1 min-h-0 relative">
        {tab === 'molecule' ? <MoleculeTab narrow={narrow} level={level} add={add && upload && makeId ? (s, src, o) => add(() => structureToTelaDevice(s, src, o, upload, makeId)) : undefined} loadStructure={loadStructure} onError={t => setNote({ kind: 'err', text: t })}/>
          : <PathwayTab narrow={narrow} level={level} loadModel={loadModel} add={add && upload && makeId ? (m, r, shown, st) => add(() => simulationToTelaChart(m, r, shown, st, upload, makeId)) : undefined} onError={t => setNote({ kind: 'err', text: t })}/>}
        {note && <div role={note.kind === 'err' ? 'alert' : 'status'} className="absolute top-3 left-1/2 -translate-x-1/2 z-30 max-w-[min(560px,calc(100%-32px))] px-4 py-2.5 rounded-xl text-[12px] flex gap-2 items-start" style={note.kind === 'err' ? { background: '#2a1416', border: '1px solid rgba(248,113,113,.4)', color: '#fecaca' } : { background: '#0f2a1d', border: '1px solid rgba(52,211,153,.4)', color: '#a7f3d0' }}>
          {note.kind === 'err' ? <AlertTriangle size={14} className="shrink-0 mt-0.5"/> : <CheckCircle2 size={14} className="shrink-0 mt-0.5"/>}<span className="flex-1">{note.text}</span><button onClick={() => setNote(null)} aria-label="Dismiss"><X size={13}/></button>
        </div>}
      </div>
      <style>{`.bio-btn{display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 10px;border-radius:8px;font-size:12px;font-weight:600;color:rgba(255,255,255,.82);background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);flex-shrink:0;white-space:nowrap}.bio-btn:hover{background:rgba(255,255,255,.1);color:#fff}.bio-btn:disabled{opacity:.45}.bio-on{background:rgba(94,234,212,.14);border-color:rgba(94,234,212,.45);color:#5eead4}.bio-primary{background:linear-gradient(135deg,#14b8a6,#8b5cf6);border-color:transparent;color:#fff}.bio-in{height:32px;border-radius:8px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.12);padding:0 10px;font-size:12px;color:#fff;min-width:0}.bio-bar{scrollbar-width:none}.bio-bar::-webkit-scrollbar{display:none}`}</style>
    </div>,
    roomHost,
  );
}

/** "+N more tools" / "Fewer": reveals every tool in this workspace without switching to Pro. */
function MoreTools({ rail }: { rail: ToolRail }) {
  if (!rail.hidden && !rail.showAll) return null;
  return <button className="mt-2 text-[11px] font-semibold underline-offset-2 hover:underline" style={{ color: C.dim }} onClick={() => rail.setShowAll(!rail.showAll)} data-testid="bio-tools-more">{rail.showAll ? 'Fewer tools' : `+${rail.hidden} more tools`}</button>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="mb-4"><div className="text-[10px] font-extrabold uppercase tracking-[.12em] mb-1.5" style={{ color: C.dim }}>{title}</div>{children}</section>;
}
function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return <div className="flex justify-between gap-3 py-0.5 text-[12px]"><span style={{ color: C.dim }} className="shrink-0">{k}</span><span className="text-right break-words min-w-0">{v}</span></div>;
}

/** Side panel that becomes a bottom sheet on narrow screens. */
function Panel({ narrow, side, children, testid }: { narrow: boolean; side: 'left' | 'right'; children: React.ReactNode; testid?: string }) {
  if (narrow) return <div className="shrink-0 overflow-auto p-3" style={{ maxHeight: '42%', borderTop: `1px solid ${C.line}`, background: C.panel }} data-testid={testid}>{children}</div>;
  return <aside className={`${side === 'left' ? 'w-72' : 'w-80'} shrink-0 overflow-auto p-3`} style={{ [side === 'left' ? 'borderRight' : 'borderLeft']: `1px solid ${C.line}`, background: C.panel }} data-testid={testid}>{children}</aside>;
}

// ── Molecule ────────────────────────────────────────────────────────────────

function MoleculeTab({ narrow, level, add, loadStructure, onError }: { narrow: boolean; level: Level; add?: (s: Structure, src: SourceFile, o: { style: MolStyle; color: MolColor }) => Promise<void>; loadStructure?: () => Promise<SourceFile>; onError: (t: string) => void }) {
  const [src, setSrc] = useState<SourceFile | null>(null);
  const [busy, setBusy] = useState('');
  const [pdbId, setPdbId] = useState(''); const [uniprot, setUniprot] = useState('');
  const [style, setStyle] = useState<MolStyle>('cartoon');
  const [color, setColor] = useState<MolColor>('secondary');
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [showWater, setShowWater] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const structure = useMemo(() => src ? parseStructure(src.text, src.name) : null, [src]);
  useEffect(() => { if (structure) { setColor(structure.predicted ? 'confidence' : 'secondary'); setHidden(new Set()); } }, [structure]);
  const run = async (label: string, job: () => Promise<SourceFile>) => {
    setBusy(label);
    try { setSrc(await job()); } catch (e: any) { onError(e?.message || String(e)); } finally { setBusy(''); }
  };
  useEffect(() => { if (loadStructure) void run('Loading the saved structure…', loadStructure); else void run('Loading crambin…', () => fetchPdbEntry('1CRN')); }, [loadStructure]); // eslint-disable-line react-hooks/exhaustive-deps
  const residues = structure?.chains.reduce((n, c) => n + c.residues, 0) ?? 0;
  const protSeq = structure?.chains.filter(c => c.kind === 'protein').map(c => c.sequence).join('') ?? '';
  // Atom views and chain colours join when this molecule calls for them (services/bio/workspaceTools.ts).
  const railDoc = useMemo<BioToolDoc | null>(() => structure ? { tab: 'molecule', ...moleculeFacts(structure) } : null, [structure]);
  const rail = useToolRail<BioToolDoc>(BIO, railDoc, NO_SEL, level, undefined, MOLECULE_GROUP);
  const pickStyle = (x: MolStyle) => { setStyle(x); if (x !== 'cartoon') rail.used('atoms'); };
  const pickColor = (x: MolColor) => { setColor(x); if (x === 'element') rail.used('atoms'); if (x === 'chain') rail.used('chains'); };
  const styleShown = (x: MolStyle) => x === 'cartoon' || style === x || rail.shows('atoms');
  const colorShown = (x: MolColor) => x === 'secondary' || x === 'confidence' || color === x || rail.shows(x === 'chain' ? 'chains' : 'atoms');

  const controls = <>
    <Section title="Load">
      <form className="flex gap-1.5 mb-1.5" onSubmit={e => { e.preventDefault(); void run(`Fetching ${pdbId.toUpperCase()} from the PDB…`, () => fetchPdbEntry(pdbId)); }}>
        <input className="bio-in flex-1" placeholder="PDB ID (4HHB)" value={pdbId} onChange={e => setPdbId(e.target.value)} aria-label="PDB ID" data-testid="bio-pdb-id"/>
        <button className="bio-btn" type="submit" disabled={!pdbId.trim() || !!busy}><Search size={13}/></button>
      </form>
      <form className="flex gap-1.5 mb-1.5" onSubmit={e => { e.preventDefault(); void run(`Fetching the AlphaFold model for ${uniprot.toUpperCase()}…`, () => fetchAlphaFold(uniprot)); }}>
        <input className="bio-in flex-1" placeholder="UniProt for AlphaFold (P69905)" value={uniprot} onChange={e => setUniprot(e.target.value)} aria-label="UniProt accession"/>
        <button className="bio-btn" type="submit" disabled={!uniprot.trim() || !!busy}><Search size={13}/></button>
      </form>
      <button className="bio-btn w-full justify-center" onClick={() => fileRef.current?.click()}><FolderOpen size={13}/>Open .pdb / .cif file</button>
      <input ref={fileRef} type="file" accept=".pdb,.ent,.cif,.mmcif" className="hidden" onChange={async e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) setSrc({ name: f.name, text: await f.text(), credit: f.name, licence: 'Your file', url: '' }); }}/>
      <div className="flex flex-wrap gap-1 mt-2">
        {STRUCTURE_PICKS.map(p => <button key={p.id} title={p.about} className="px-2 py-1 rounded-md text-[11px]" style={{ background: 'rgba(255,255,255,.05)', border: `1px solid ${C.line}`, color: C.text }} onClick={() => void run(`Fetching ${p.label}…`, () => p.kind === 'pdb' ? fetchPdbEntry(p.id) : fetchAlphaFold(p.id))}>{p.label}</button>)}
      </div>
    </Section>
    <Section title="Style">
      <div className="flex gap-1 flex-wrap">{(['cartoon', 'ball-stick', 'spacefill'] as MolStyle[]).filter(styleShown).map(s => <button key={s} className={`bio-btn${style === s ? ' bio-on' : ''}`} onClick={() => pickStyle(s)} data-testid={`bio-style-${s}`}>{s === 'ball-stick' ? 'Ball & stick' : s === 'spacefill' ? 'Space-filling' : 'Cartoon'}</button>)}</div>
    </Section>
    <Section title="Colour by">
      <div className="flex gap-1 flex-wrap">{(['secondary', 'element', 'chain', 'confidence'] as MolColor[]).filter(c => (c !== 'confidence' || structure?.predicted) && colorShown(c)).map(c => <button key={c} className={`bio-btn${color === c ? ' bio-on' : ''}`} onClick={() => pickColor(c)} data-testid={`bio-color-${c}`}>{c === 'secondary' ? 'Structure' : c === 'confidence' ? 'Confidence' : c[0].toUpperCase() + c.slice(1)}</button>)}</div>
      {color === 'confidence' && <div className="flex gap-2 mt-2 text-[10px]" style={{ color: C.dim }}>{[['#0053d6', '>90'], ['#65cbf3', '70–90'], ['#ffdb13', '50–70'], ['#ff7d45', '<50']].map(([c, l]) => <span key={l} className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: c }}/>{l}</span>)}</div>}
      {(rail.shows('water') || showWater) && <label className="flex items-center gap-2 mt-2 text-[12px]" style={{ color: C.dim }}><input type="checkbox" checked={showWater} onChange={e => { if (e.target.checked) rail.used('water'); setShowWater(e.target.checked); }} data-testid="bio-water"/>Show water</label>}
      <MoreTools rail={rail}/>
    </Section>
  </>;

  const info = structure && <>
    <Section title="Structure">
      <div className="text-[13px] font-semibold mb-1" data-testid="bio-structure-title">{structure.id}{structure.title ? ` · ${structure.title.toLowerCase().replace(/^./, c => c.toUpperCase())}` : ''}</div>
      {structure.method && <Row k="Method" v={structure.method.toLowerCase()}/>}
      {structure.resolution && <Row k="Resolution" v={`${structure.resolution} Å`}/>}
      <Row k="Atoms" v={structure.atoms.length.toLocaleString()}/>
      <Row k="Residues" v={residues.toLocaleString()}/>
      {protSeq && <Row k="Protein mass" v={`≈ ${(proteinMass(protSeq) / 1000).toFixed(1)} kDa`}/>}
      <Row k="Size" v={`${(structureBounds(structure.atoms).radius * 2 / 10).toFixed(1)} nm across`}/>
      {src && <Row k="Source" v={src.url ? <a href={src.url} target="_blank" rel="noreferrer" style={{ color: C.accent }}>{src.credit}</a> : src.credit}/>}
      {src && <Row k="Licence" v={src.licence}/>}
    </Section>
    <Section title={`Chains (${structure.chains.length})`}>
      {structure.chains.map(c => <div key={c.id} className="py-1" style={{ borderBottom: `1px solid ${C.line}` }}>
        <div className="flex items-center gap-2 text-[12px]">
          <span className="font-bold w-5">{c.id}</span>
          <span className="flex-1" style={{ color: C.dim }}>{c.kind}{c.residues ? ` · ${c.residues} res` : ''}{c.ligands.length ? ` · ${c.ligands.join(', ')}` : ''}{c.waters ? ` · ${c.waters} water` : ''}</span>
          <button onClick={() => setHidden(h => { const n = new Set(h); n.has(c.id) ? n.delete(c.id) : n.add(c.id); return n; })} style={{ color: C.dim }} aria-label={`Toggle chain ${c.id}`}>{hidden.has(c.id) ? <EyeOff size={13}/> : <Eye size={13}/>}</button>
        </div>
        {c.sequence && <div className="font-mono text-[10px] break-all mt-0.5 leading-relaxed" style={{ color: 'rgba(255,255,255,.6)' }} data-testid={`bio-seq-${c.id}`}>{c.sequence}</div>}
      </div>)}
    </Section>
    {structure.warnings.length > 0 && <Section title="Notes">{structure.warnings.map((w, i) => <div key={i} className="text-[12px]" style={{ color: '#fcd34d' }}>{w}</div>)}</Section>}
    {add && src && <button className="bio-btn bio-primary w-full justify-center" data-testid="bio-add-structure" onClick={() => void add(structure, src, { style, color })}><FilePlus2 size={13}/>Add to document</button>}
  </>;

  return <div className={`absolute inset-0 flex ${narrow ? 'flex-col' : ''}`}>
    {!narrow && <Panel narrow={false} side="left">{controls}</Panel>}
    <main className="flex-1 min-h-0 min-w-0 relative">
      {structure && <MolCanvas structure={structure} style={style} color={color} hidden={hidden} showWater={showWater}/>}
      {rail.suggestion && !busy && <AriaToolHint tool={rail.suggestion} level={level} testid="bio-aria-hint" style={{ bottom: 14 }} onDismiss={rail.dismiss} onTry={() => {
        const id = rail.suggestion!.id as BioToolId;
        if (id === 'atoms') pickStyle('ball-stick'); else if (id === 'chains') pickColor('chain');
      }}/>}
      {busy && <div className="absolute inset-0 grid place-items-center" style={{ background: 'rgba(11,13,16,.55)' }}><div className="px-4 py-2.5 rounded-xl text-[13px] font-semibold" style={{ background: C.panel, border: `1px solid ${C.line}` }}>{busy}</div></div>}
    </main>
    <Panel narrow={narrow} side="right" testid="bio-structure-info">{narrow && controls}{info}</Panel>
  </div>;
}

function MolCanvas({ structure, style, color, hidden, showWater }: { structure: Structure; style: MolStyle; color: MolColor; hidden: Set<string>; showWater: boolean }) {
  const group = useMemo(() => structureToGroup(structure, { style, color, hiddenChains: hidden, showWater }), [structure, style, color, hidden, showWater]);
  useEffect(() => () => { group.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) m.geometry.dispose(); }); }, [group]);
  const radius = Math.max(5, structureBounds(structure.atoms).radius);
  return <Canvas data-testid="bio-canvas" camera={{ fov: 35, near: radius / 100, far: radius * 50 }} gl={{ antialias: true, preserveDrawingBuffer: true }} dpr={[1, 1.75]} style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 50% 40%, #1a2026, #08090b 75%)' }}>
    <hemisphereLight args={['#ffffff', '#2a3340', 1.0]}/>
    <directionalLight position={[1, 2, 2]} intensity={1.5}/>
    <directionalLight position={[-2, -1, -1]} intensity={0.35}/>
    <primitive object={group}/>
    <Fit radius={radius} id={structure.id}/>
  </Canvas>;
}

function Fit({ radius, id }: { radius: number; id: string }) {
  const { camera, size } = useThree(); const controls = useRef<any>(null);
  useEffect(() => {
    const cam = camera as THREE.PerspectiveCamera; const vfov = cam.fov * Math.PI / 180; const hfov = 2 * Math.atan(Math.tan(vfov / 2) * cam.aspect);
    const d = radius / Math.sin(Math.min(vfov, hfov) / 2) * 0.95;
    cam.position.set(0, 0, d); cam.near = d / 100; cam.far = d * 20; cam.lookAt(0, 0, 0); cam.updateProjectionMatrix();
    if (controls.current) { controls.current.target.set(0, 0, 0); controls.current.update(); }
  }, [camera, radius, id, size.width, size.height]);
  return <OrbitControls ref={controls} makeDefault enableDamping dampingFactor={0.1} autoRotate autoRotateSpeed={0.6}/>;
}

// ── Pathway ─────────────────────────────────────────────────────────────────

type SimSettings = { params: Record<string, number>; initial: Record<string, number>; tEnd: number; mode?: 'ode' | 'stochastic'; unit?: number };

function PathwayTab({ narrow, level, add, onError, loadModel }: { narrow: boolean; level: Level; add?: (m: BioModel, r: SimResult, shown: string[], settings: SimSettings) => Promise<void>; onError: (t: string) => void; loadModel?: () => Promise<{ xml: string; tEnd: number; name: string }> }) {
  const [model, setModel] = useState<BioModel>(STARTERS[1].model);
  const [starterId, setStarterId] = useState<string | null>(STARTERS[1].id);
  const starter = STARTERS.find(s => s.id === starterId);
  const [tEnd, setTEnd] = useState(STARTERS[1].tEnd);
  const [params, setParams] = useState<Record<string, number>>({});
  const [initial, setInitial] = useState<Record<string, number>>({});
  const [shown, setShown] = useState<string[]>(STARTERS[1].plot ?? []);
  const fileRef = useRef<HTMLInputElement>(null);

  const [mode, setMode] = useState<'ode' | 'stochastic'>('ode');
  const [unit, setUnit] = useState(1);
  const [seed, setSeed] = useState(1);
  const [source, setSource] = useState<{ credit: string; url: string; licence: string } | null>(null);
  const [query, setQuery] = useState(''); const [hits, setHits] = useState<BioModelHit[] | null>(null); const [busy, setBusy] = useState('');

  const choose = (m: BioModel, s?: typeof STARTERS[number], tEndHint?: number, src?: { credit: string; url: string; licence: string } | null) => {
    setModel(m); setStarterId(s?.id ?? null); setParams({}); setInitial({}); setTEnd(tEndHint ?? s?.tEnd ?? 100); setSource(src ?? null);
    setShown(s?.plot ?? m.species.filter(x => !x.constant && !x.boundary).slice(0, 8).map(x => x.id));
    // Stochastic runs count molecules: models already written in counts use 1 molecule per unit.
    // Whole-number starting values usually mean the model already counts molecules (genes, mRNAs).
    setUnit(m.species.every(x => Number.isInteger(x.initial)) ? 1 : 1000);
  };
  const loadBioModel = async (id: string, tEndHint?: number) => {
    setBusy(`Loading ${id} from BioModels…`);
    try { const f = await fetchBioModel(id); choose(parseSbml(f.text), undefined, tEndHint ?? 100, f); }
    catch (e: any) { onError(e?.message || String(e)); } finally { setBusy(''); }
  };
  const runSearch = async () => {
    const q = query.trim(); if (!q) return;
    if (/^(BIOMD|MODEL)\d{10}$/i.test(q)) return loadBioModel(q.toUpperCase());
    setBusy('Searching BioModels…');
    try { const r = await searchBioModels(q); setHits(r); if (!r.length) onError('BioModels search found nothing (their search is sometimes down). A model ID like BIOMD0000000012 always works, or pick one below.'); }
    catch (e: any) { onError(e?.message || String(e)); } finally { setBusy(''); }
  };
  useEffect(() => {
    if (!loadModel) return;
    setBusy('Loading the saved model…');
    loadModel().then(({ xml, tEnd: te }) => choose(parseSbml(xml), undefined, te)).catch(e => onError(e?.message || String(e))).finally(() => setBusy(''));
  }, [loadModel]); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-simulates on every change in a background worker: the page never freezes, and a newer
  // request makes older answers irrelevant (only the latest id is shown). Falls back to the
  // main thread where workers are unavailable (tests, very old browsers).
  const [result, setResult] = useState<{ r?: SimResult & { events?: number }; err?: string }>({});
  const [running, setRunning] = useState(false);
  const worker = useRef<Worker | null>(null); const reqId = useRef(0);
  useEffect(() => {
    try { worker.current = new Worker(new URL('../../services/bio/sim.worker.ts', import.meta.url), { type: 'module' }); } catch { worker.current = null; }
    return () => { worker.current?.terminate(); worker.current = null; };
  }, []);
  useEffect(() => {
    const id = ++reqId.current;
    const stochastic = { tEnd, points: 400, params, initial, unit, seed, budgetMs: 8000 };
    // Live runs use rtol 1e-5: visually identical, several times faster on stiff models.
    const ode = { tEnd, points: 400, params, initial, method: starter?.method ?? 'auto', budgetMs: 20000, rtol: 1e-5 } as const;
    const w = worker.current;
    if (!w) {
      try { setResult({ r: mode === 'stochastic' ? simulateStochastic(model, stochastic) : simulate(model, ode) }); } catch (e: any) { setResult({ err: e?.message || String(e) }); }
      return;
    }
    setRunning(true);
    const timer = window.setTimeout(() => {
      w.onmessage = (ev: MessageEvent) => {
        const msg = ev.data; if (msg.id !== reqId.current) return; // a newer run was asked for
        setRunning(false); setResult(msg.ok ? { r: msg.result } : { err: msg.error });
      };
      w.postMessage(mode === 'stochastic' ? { id, model, mode, options: stochastic } : { id, model, mode, options: ode });
    }, 30); // coalesce a burst of slider events into one run
    return () => window.clearTimeout(timer);
  }, [model, tEnd, params, initial, starter, mode, unit, seed]);
  const names = useMemo(() => new Map(model.species.map(s => [s.id, s.name])), [model]);
  // Stochastic runs join when copy numbers are small; starting amounts once a rate has been tuned.
  const tuned = Object.keys(params).length > 0;
  const railDoc = useMemo<BioToolDoc>(() => ({ tab: 'pathway', fewMolecules: fewMolecules(model), tuned }), [model, tuned]);
  const rail = useToolRail<BioToolDoc>(BIO, railDoc, NO_SEL, level, undefined, PATHWAY_GROUP);
  const tunedModel = useRef(''); // count one use of the rate sliders per model, not one per slider tick
  const tune = (id: string, x: number) => { if (tunedModel.current !== model.id) { tunedModel.current = model.id; rail.used('params'); } setParams(o => ({ ...o, [id]: x })); };
  const pickMode = (mo: 'ode' | 'stochastic') => { setMode(mo); rail.used(mo); };
  const plotted = shown.filter(id => result.r?.series[id]);

  const left = <>
    <Section title="Models">
      {STARTERS.map(s => <button key={s.id} onClick={() => choose(s.model, s)} data-testid={`bio-model-${s.id}`} className="w-full text-left px-2.5 py-2 rounded-lg mb-1" style={{ background: starterId === s.id ? 'rgba(94,234,212,.1)' : 'rgba(255,255,255,.03)', border: `1px solid ${starterId === s.id ? 'rgba(94,234,212,.4)' : C.line}` }}>
        <div className="text-[12px] font-semibold">{s.name}</div><div className="text-[10px]" style={{ color: C.dim }}>{s.field}</div>
      </button>)}
      <button className="bio-btn w-full justify-center mt-1" onClick={() => fileRef.current?.click()}><FolderOpen size={13}/>Open SBML model</button>
      <input ref={fileRef} type="file" accept=".xml,.sbml" className="hidden" onChange={async e => { const f = e.target.files?.[0]; e.target.value = ''; if (!f) return; try { choose(parseSbml(await f.text()), undefined, 100, { credit: f.name, url: '', licence: 'Your file' }); } catch (err: any) { onError(err?.message || String(err)); } }}/>
    </Section>
    <Section title="BioModels library">
      <form className="flex gap-1.5 mb-1.5" onSubmit={e => { e.preventDefault(); void runSearch(); }}>
        <input className="bio-in flex-1" placeholder="Search, or BIOMD0000000012" value={query} onChange={e => setQuery(e.target.value)} aria-label="Search BioModels" data-testid="bio-biomodels-q"/>
        <button className="bio-btn" type="submit" disabled={!query.trim() || !!busy}><Search size={13}/></button>
      </form>
      {hits && hits.map(h => <button key={h.id} onClick={() => void loadBioModel(h.id)} className="w-full text-left px-2 py-1.5 rounded-md mb-0.5 text-[11px]" style={{ background: 'rgba(255,255,255,.03)', border: `1px solid ${C.line}` }}><div className="font-semibold truncate">{h.name}</div><div style={{ color: C.dim }}>{h.id}</div></button>)}
      <div className="text-[10px] mt-1 mb-1" style={{ color: C.dim }}>Famous curated models</div>
      {BIOMODEL_PICKS.map(p => <button key={p.id} onClick={() => void loadBioModel(p.id, p.tEnd)} data-testid={`bio-pick-${p.id}`} className="w-full text-left px-2 py-1 rounded-md mb-0.5 text-[11px]" style={{ background: model.id === p.id ? 'rgba(94,234,212,.1)' : 'transparent', border: `1px solid ${model.id === p.id ? 'rgba(94,234,212,.4)' : 'transparent'}` }}>{p.label}<span style={{ color: C.dim }}> · {p.field}</span></button>)}
      {busy && <div className="text-[11px] mt-1" style={{ color: C.accent }}>{busy}</div>}
    </Section>
    <Section title="About">
      <div className="text-[12px] leading-relaxed" style={{ color: 'rgba(255,255,255,.75)' }}>{starter?.about ?? (model.notes || model.name)}</div>
      {starter && <div className="text-[10px] mt-1.5" style={{ color: C.dim }}>{starter.source}</div>}
      {source && <div className="text-[10px] mt-1.5" style={{ color: C.dim }}>{source.url ? <a href={source.url} target="_blank" rel="noreferrer" style={{ color: C.accent }}>{source.credit}</a> : source.credit} · {source.licence}</div>}
      {model.events.length > 0 && <div className="text-[10px] mt-1" style={{ color: C.dim }}>{model.events.length} event{model.events.length > 1 ? 's' : ''} in this model{mode === 'stochastic' ? ' (the stochastic run leaves them out)' : ''}</div>}
    </Section>
    <Section title={`Reactions (${model.reactions.length})`}>
      {model.reactions.map(r => { const d = describeReaction(r, names); return <div key={r.id} className="py-1 text-[11px]" style={{ borderBottom: `1px solid ${C.line}` }}><div className="font-semibold">{d.equation}</div><div className="font-mono" style={{ color: C.dim }}>{d.rate}</div></div>; })}
    </Section>
  </>;

  const right = <>
    <Section title="Run">
      <label className="flex items-center justify-between gap-2 text-[12px] mb-1"><span style={{ color: C.dim }}>Simulate until</span><input className="bio-in w-24 text-right" type="number" min={0.01} step="any" value={tEnd} onChange={e => setTEnd(Math.max(0.01, +e.target.value || 1))} aria-label="End time"/></label>
      {(rail.shows('stochastic') || mode === 'stochastic') && <div className="flex items-center rounded-lg overflow-hidden my-2" style={{ border: `1px solid ${C.line}` }}>
        {(['ode', 'stochastic'] as const).map(mo => <button key={mo} onClick={() => pickMode(mo)} data-testid={`bio-mode-${mo}`} className="flex-1 h-8 text-[11px] font-semibold" style={{ background: mode === mo ? 'rgba(94,234,212,.14)' : 'transparent', color: mode === mo ? C.accent : C.dim }}>{mo === 'ode' ? 'Smooth (ODE)' : 'Stochastic'}</button>)}
      </div>}
      {mode === 'stochastic' && <div className="mb-2">
        <label className="flex items-center justify-between gap-2 text-[12px] mb-1"><span style={{ color: C.dim }}>Molecules per unit</span><input className="bio-in w-24 text-right" type="number" min={1} step="any" value={unit} onChange={e => setUnit(Math.max(1e-6, +e.target.value || 1))} aria-label="Molecules per unit"/></label>
        <button className="bio-btn w-full justify-center" onClick={() => setSeed(s => s + 1)} data-testid="bio-run-again"><RotateCcw size={13}/>Run again (new random draw)</button>
        <div className="text-[10px] mt-1" style={{ color: C.dim }}>Each reaction fires one molecule at a time (Gillespie). Fewer molecules, more noise.</div>
      </div>}
      {running && <div className="text-[11px] mb-0.5" style={{ color: C.accent }} data-testid="bio-running">Running…</div>}
      {result.r && <div className="text-[11px]" style={{ color: C.dim }} data-testid="bio-sim-stats">{mode === 'stochastic' ? `Gillespie · ${(result.r.events ?? 0).toLocaleString()} reaction events · seed ${seed}` : `${result.r.solution.method === 'ros23' ? 'Stiff solver (Rosenbrock)' : 'Dormand–Prince'}${result.r.solution.stiffSwitch ? ' · switched: stiff' : ''} · ${result.r.solution.steps} steps`} · {result.r.ms.toFixed(1)} ms</div>}
      {result.err && <div className="text-[12px]" style={{ color: '#fca5a5' }}>{result.err}</div>}
    </Section>
    <Section title="Parameters">
      {model.params.map(p => { const v = params[p.id] ?? p.value; return <Slider key={p.id} label={p.name !== p.id ? `${p.id} · ${p.name}` : p.id} base={p.value} value={v} onChange={x => tune(p.id, x)} testid={`bio-param-${p.id}`}/>; })}
      {!model.params.length && <div className="text-[12px]" style={{ color: C.dim }}>No global parameters.</div>}
    </Section>
    {(rail.shows('amounts') || Object.keys(initial).length > 0) && <Section title="Starting amounts">
      {model.species.map(s => { const v = initial[s.id] ?? s.initial; return <Slider key={s.id} label={s.name !== s.id ? `${s.id} · ${s.name}` : s.id} base={s.initial || 1} value={v} allowZero onChange={x => { if (!Object.keys(initial).length) rail.used('amounts'); setInitial(o => ({ ...o, [s.id]: x })); }}/>; })}
    </Section>}
    <MoreTools rail={rail}/>
    <div className="flex gap-1.5 flex-wrap">
      <button className="bio-btn" onClick={() => { setParams({}); setInitial({}); }}><RotateCcw size={13}/>Reset</button>
      {rail.shows('sbml') && <button className="bio-btn" data-testid="bio-sbml" onClick={() => { rail.used('sbml'); const url = URL.createObjectURL(new Blob([writeSbml(model, { params, initial })], { type: 'application/xml' })); const a = document.createElement('a'); a.href = url; a.download = `${model.id}.xml`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 5000); }}><Download size={13}/>SBML</button>}
      {add && result.r && <button className="bio-btn bio-primary" data-testid="bio-add-chart" disabled={!plotted.length} onClick={() => void add(model, result.r!, plotted, { params, initial, tEnd, mode, unit })}><FilePlus2 size={13}/>Add chart to document</button>}
    </div>
    {model.warnings.length > 0 && <div className="mt-3">{model.warnings.map((w, i) => <div key={i} className="text-[11px]" style={{ color: '#fcd34d' }}>{w}</div>)}</div>}
  </>;

  return <div className={`absolute inset-0 flex ${narrow ? 'flex-col overflow-auto' : ''}`}>
    {!narrow && <Panel narrow={false} side="left">{left}</Panel>}
    <main className="flex-1 min-w-0 flex flex-col p-4" style={{ minHeight: narrow ? 360 : 0 }}>
      <div className="flex items-baseline gap-2 mb-2"><div className="text-[15px] font-bold" data-testid="bio-model-name">{model.name}</div><div className="text-[11px]" style={{ color: C.dim }}>{starter?.field}</div></div>
      <div className="flex flex-wrap gap-1 mb-2">
        {model.species.map((s, i) => { const on = shown.includes(s.id); const c = SERIES[shown.indexOf(s.id) % SERIES.length]; return <button key={s.id} onClick={() => setShown(v => on ? v.filter(x => x !== s.id) : [...v, s.id])} className="px-2 py-0.5 rounded-full text-[11px] flex items-center gap-1.5" style={{ border: `1px solid ${on ? c : C.line}`, color: on ? C.text : C.dim, background: on ? 'rgba(255,255,255,.04)' : 'transparent' }} data-testid={`bio-species-${s.id}`}><span className="w-2 h-2 rounded-full" style={{ background: on ? c : 'transparent', border: on ? 'none' : `1px solid ${C.dim}` }}/>{s.name}{i < 0 ? '' : ''}</button>; })}
      </div>
      <div className="flex-1 min-h-[260px] relative rounded-xl" style={{ background: 'rgba(255,255,255,.02)', border: `1px solid ${C.line}` }}>
        {rail.suggestion && <AriaToolHint tool={rail.suggestion} level={level} testid="bio-aria-hint" style={{ bottom: 14, zIndex: 20 }} onDismiss={rail.dismiss} onTry={() => {
          const id = rail.suggestion!.id as BioToolId;
          if (id === 'stochastic') pickMode('stochastic'); else if (id === 'amounts') { rail.used('amounts'); setInitial(o => ({ ...o })); }
        }}/>}
        {result.r && <LineChart time={result.r.time} series={plotted.map((id, i) => ({ id, name: names.get(id) ?? id, color: SERIES[i % SERIES.length], values: result.r!.series[id] }))}/>}
      </div>
    </main>
    {narrow ? <div className="p-3" style={{ background: C.panel, borderTop: `1px solid ${C.line}` }}>{right}{left}</div> : <Panel narrow={false} side="right">{right}</Panel>}
  </div>;
}

/** Log-scale slider from base/10 to base*10 (or linear 0..2*base when the value can be zero). */
function Slider({ label, base, value, onChange, allowZero, testid }: { label: string; base: number; value: number; onChange: (v: number) => void; allowZero?: boolean; testid?: string }) {
  const b = Math.abs(base) || 1; const lin = allowZero;
  const pos = lin ? value / (2 * b) : (Math.log10(Math.max(value, 1e-300) / b) + 1) / 2;
  const fromPos = (p: number) => lin ? +(p * 2 * b).toPrecision(4) : +(b * 10 ** (p * 2 - 1)).toPrecision(4);
  return <label className="block mb-2">
    <div className="flex justify-between text-[11px] mb-0.5"><span className="truncate" style={{ color: C.dim }}>{label}</span><span className="font-mono">{+value.toPrecision(4)}</span></div>
    <input type="range" min={0} max={1} step={0.001} value={Math.min(1, Math.max(0, pos))} onChange={e => onChange(fromPos(+e.target.value))} className="w-full accent-teal-400" data-testid={testid}/>
  </label>;
}

/** Plain SVG line chart: nice ticks, hover readout. */
function LineChart({ time, series }: { time: number[]; series: Array<{ id: string; name: string; color: string; values: number[] }> }) {
  const box = useRef<HTMLDivElement>(null); const [size, setSize] = useState({ w: 600, h: 300 }); const [hover, setHover] = useState<number | null>(null);
  useEffect(() => { const el = box.current; if (!el) return; const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight })); ro.observe(el); return () => ro.disconnect(); }, []);
  const pad = { l: 56, r: 16, t: 12, b: 32 }; const W = Math.max(100, size.w - pad.l - pad.r), H = Math.max(80, size.h - pad.t - pad.b);
  const t0 = time[0] ?? 0, t1 = time[time.length - 1] ?? 1;
  let lo = Infinity, hi = -Infinity; for (const s of series) for (const v of s.values) if (Number.isFinite(v)) { if (v < lo) lo = v; if (v > hi) hi = v; }
  if (!Number.isFinite(lo)) { lo = 0; hi = 1; } if (lo > 0 && lo < hi * 0.3) lo = 0; if (hi === lo) hi = lo + 1;
  const ticks = (a: number, b: number, n: number) => { const step = 10 ** Math.floor(Math.log10((b - a) / n)); const m = [1, 2, 5, 10].find(k => (b - a) / (step * k) <= n)! * step; const out: number[] = []; for (let v = Math.ceil(a / m) * m; v <= b + m * 1e-9; v += m) out.push(+v.toPrecision(10)); return out; };
  const X = (t: number) => pad.l + (t - t0) / (t1 - t0 || 1) * W; const Y = (v: number) => pad.t + H - (v - lo) / (hi - lo) * H;
  const fmt = (v: number) => Math.abs(v) >= 1e4 || (Math.abs(v) < 1e-2 && v !== 0) ? v.toExponential(1) : +v.toPrecision(3) + '';
  return <div ref={box} className="absolute inset-0" onPointerLeave={() => setHover(null)} onPointerMove={e => { const r = box.current!.getBoundingClientRect(); const t = t0 + (e.clientX - r.left - pad.l) / W * (t1 - t0); let best = 0; for (let i = 1; i < time.length; i++) if (Math.abs(time[i] - t) < Math.abs(time[best] - t)) best = i; setHover(best); }} data-testid="bio-chart">
    <svg width={size.w} height={size.h} className="absolute inset-0">
      {ticks(lo, hi, 5).map(v => <g key={v}><line x1={pad.l} x2={pad.l + W} y1={Y(v)} y2={Y(v)} stroke="rgba(255,255,255,.07)"/><text x={pad.l - 6} y={Y(v) + 3} fill="rgba(255,255,255,.45)" fontSize={10} textAnchor="end">{fmt(v)}</text></g>)}
      {ticks(t0, t1, 8).map(v => <text key={v} x={X(v)} y={pad.t + H + 18} fill="rgba(255,255,255,.45)" fontSize={10} textAnchor="middle">{fmt(v)}</text>)}
      <text x={pad.l + W} y={size.h - 2} fill="rgba(255,255,255,.35)" fontSize={10} textAnchor="end">time</text>
      {series.map(s => <path key={s.id} d={s.values.map((v, i) => `${i ? 'L' : 'M'}${X(time[i]).toFixed(1)} ${Y(v).toFixed(1)}`).join('')} fill="none" stroke={s.color} strokeWidth={1.8} strokeLinejoin="round"/>)}
      {hover !== null && <line x1={X(time[hover])} x2={X(time[hover])} y1={pad.t} y2={pad.t + H} stroke="rgba(255,255,255,.25)"/>}
    </svg>
    {hover !== null && series.length > 0 && <div className="absolute pointer-events-none px-2 py-1.5 rounded-md text-[11px]" style={{ left: Math.min(X(time[hover]) + 10, size.w - 170), top: pad.t + 4, background: 'rgba(10,12,14,.92)', border: `1px solid ${C.line}` }}>
      <div style={{ color: C.dim }}>t = {fmt(time[hover])}</div>
      {series.map(s => <div key={s.id} className="flex gap-2 justify-between"><span style={{ color: s.color }}>{s.name}</span><span className="font-mono">{fmt(s.values[hover])}</span></div>)}
    </div>}
  </div>;
}
