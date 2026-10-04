// Machine Atlas viewer shell: system picker, views, explode / isolate / x-ray / section / labels / search,
// scenario playback with tier badges, healthy-vs-faulted, part info panel. 3D lives in AtlasScene (lazy).
import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import ContentStatusBadge from '../ContentStatusBadge';
import { ATLAS_SYSTEMS, loadSystem, OPEN_MACHINE_ATLAS, parseAtlasQuery, type LoadedSystem, type OpenAtlasDetail } from '../../services/machineAtlas/registry';
import { runScenario, runKindOf, traceDuration, type RunResult } from '../../services/machineAtlas/sim/runner';
import { PartPanel } from './PartPanel';
import { ScenarioPanel } from './ScenarioPanel';
import type { SceneStats, SectionState } from './AtlasScene';

const AtlasScene = React.lazy(() => import('./AtlasScene'));

export interface AtlasViewerProps {
  systemId?: string; partId?: string; scenarioId?: string; faultId?: string; viewId?: string;
  variant?: 'page' | 'overlay'; onClose?: () => void; onOpenLesson?: (lessonId: string) => void;
}

const useMedia = (q: string) => {
  const [m, setM] = useState(() => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(q).matches : false));
  useEffect(() => {
    if (!window.matchMedia) return; const mq = window.matchMedia(q), f = () => setM(mq.matches);
    f(); mq.addEventListener?.('change', f); return () => mq.removeEventListener?.('change', f);
  }, [q]);
  return m;
};

class SceneBoundary extends React.Component<{ children: React.ReactNode }, { err: string | null }> {
  state = { err: null as string | null };
  static getDerivedStateFromError(e: Error) { return { err: e.message }; }
  render() {
    return this.state.err ? (
      <div className="flex h-full items-center justify-center p-6 text-center text-sm text-white/70">
        The 3D view could not start on this device ({this.state.err}). The part information and simulations still work from the panels.
      </div>
    ) : this.props.children;
  }
}

const VIEW_FOR_RUN: Record<string, string> = { apply: 'circuit', heat: 'disc', abs: 'circuit', 's0-compare': 'compare', 's0-parking': 'drum' };

export default function AtlasViewer(props: AtlasViewerProps) {
  const { variant = 'page' } = props;
  const [systemId, setSystemId] = useState(props.systemId || 'brakes');
  const [loaded, setLoaded] = useState<LoadedSystem | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [viewId, setViewId] = useState(props.viewId || 'circuit');
  const [selectedId, setSelectedId] = useState<string | null>(props.partId || null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [explode, setExplode] = useState(0);
  const [xray, setXray] = useState(false);
  const [isolate, setIsolate] = useState(false);
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());
  const [labels, setLabels] = useState(false);
  const [section, setSection] = useState<SectionState>({ on: false, axis: 'x', offset: 0 });
  const [search, setSearch] = useState('');
  const [focus, setFocus] = useState<{ id: string; n: number } | null>(null);
  const [resetNonce, setResetNonce] = useState(0);
  const [scenarioId, setScenarioId] = useState(props.scenarioId || 'apply');
  const [faulted, setFaulted] = useState(false);
  const [activeFaults, setActiveFaults] = useState<string[]>([]);
  const [run, setRun] = useState<RunResult | null>(null);
  const [computing, setComputing] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [t, setT] = useState(0);
  const [stats, setStats] = useState<SceneStats | null>(null);
  const [showSim, setShowSim] = useState(false);
  const [showPart, setShowPart] = useState(true);
  const [footerOpen, setFooterOpen] = useState(false);
  const [mobileTab, setMobileTab] = useState<'part' | 'sim'>('part');
  const playheadRef = useRef(0);
  const wide = useMedia('(min-width: 900px)');
  const reduced = useMedia('(prefers-reduced-motion: reduce)');

  // ---- load system lazily ----
  useEffect(() => {
    let live = true; setLoaded(null); setLoadErr(null);
    loadSystem(systemId).then(l => { if (live) { setLoaded(l); if (props.partId) setFocus({ id: props.partId, n: 1 }); } }).catch(e => { if (live) setLoadErr(String(e?.message || e)); });
    return () => { live = false; };
  }, [systemId]);

  const scenario = useMemo(() => loaded?.scenarios.find(s => s.id === scenarioId) || loaded?.scenarios[0] || null, [loaded, scenarioId]);
  const faultOptions = useMemo(() => (loaded && scenario ? loaded.faults.filter(f => scenario.faults.includes(f.id)) : []), [loaded, scenario]);

  // ---- apply deep-link / scenario defaults when scenario changes ----
  const appliedScenario = useRef<string | null>(null);
  useEffect(() => {
    if (!loaded || !scenario || appliedScenario.current === scenario.id) return;
    appliedScenario.current = scenario.id;
    const drill = scenario.setup.faulted === true;
    const wanted = props.faultId && scenario.faults.includes(props.faultId) ? [props.faultId] : scenario.faults.slice(0, drill ? 1 : 0);
    setFaulted(drill || !!(props.faultId && scenario.faults.includes(props.faultId))); setActiveFaults(wanted);
    setPlaying(false); playheadRef.current = 0; setT(0);
    const v = VIEW_FOR_RUN[runKindOf(scenario)];
    if (v && !props.viewId) setViewId(v);
    setShowSim(true);
  }, [loaded, scenario, props.faultId, props.viewId]);

  // ---- run simulation (off the click handler so the UI paints first) ----
  const runFaults = useMemo(() => (faulted ? activeFaults : []), [faulted, activeFaults]);
  useEffect(() => {
    if (!scenario) return;
    setComputing(true); setPlaying(false);
    const h = window.setTimeout(() => {
      const r = runScenario(scenario, runFaults); setRun(r); setComputing(false);
      playheadRef.current = Math.min(playheadRef.current, r.trace ? traceDuration(r.trace) : 0); setT(playheadRef.current);
    }, 0);
    return () => window.clearTimeout(h);
  }, [scenario, runFaults]);

  // ---- deep link events + selection ----
  useEffect(() => {
    const h = (e: Event) => {
      const d = (e as CustomEvent<OpenAtlasDetail>).detail || {};
      if (d.systemId) setSystemId(d.systemId);
      if (d.scenarioId) { appliedScenario.current = null; setScenarioId(d.scenarioId); }
      if (d.partId) selectPart(d.partId, true);
    };
    window.addEventListener(OPEN_MACHINE_ATLAS, h); return () => window.removeEventListener(OPEN_MACHINE_ATLAS, h);
  });
  useEffect(() => {
    if (!props.systemId && !props.partId && typeof window !== 'undefined') {
      const d = parseAtlasQuery(window.location.search);
      if (d) { if (d.systemId) setSystemId(d.systemId); if (d.scenarioId) setScenarioId(d.scenarioId); if (d.partId) setSelectedId(d.partId); }
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const selectPart = useCallback((id: string | null, focusIt = false) => {
    setSelectedId(id); if (id) { setShowPart(true); setMobileTab('part'); if (focusIt) setFocus(f => ({ id, n: (f?.n || 0) + 1 })); }
    if (!id) setIsolate(false);
  }, []);
  // when a part is selected from search / deep link, make sure the current view contains it
  useEffect(() => {
    if (!loaded || !selectedId) return;
    if (!loaded.layout.placements.some(p => p.part === selectedId && p.views.includes(viewId) && !p.decor)) {
      const v = loaded.layout.views.find(vw => loaded.layout.placements.some(p => p.part === selectedId && p.views.includes(vw.id)));
      if (v) setViewId(v.id);
    }
  }, [loaded, selectedId, viewId]);

  const part = loaded && selectedId ? loaded.parts.get(selectedId) || null : null;
  const matches = useMemo(() => {
    if (!loaded || search.trim().length < 2) return [];
    const q = search.trim().toLowerCase();
    return [...loaded.parts.values()].filter(p => p.name.toLowerCase().includes(q) || p.id.includes(q.replace(/\s+/g, '_'))).slice(0, 6);
  }, [loaded, search]);

  const onPlay = () => {
    if (!run?.trace) return;
    if (playheadRef.current >= traceDuration(run.trace) - 1e-3) { playheadRef.current = 0; setT(0); }
    setPlaying(p => !p);
  };
  const onSeek = (v: number) => { playheadRef.current = v; setT(v); setPlaying(false); };
  const toggleFault = (id: string) => setActiveFaults(a => (a.includes(id) ? a.filter(x => x !== id) : [...a, id]));
  const setFaultedMode = (b: boolean) => { setFaulted(b); if (b && activeFaults.length === 0 && faultOptions[0]) setActiveFaults([faultOptions[0].id]); };
  const injectFromPart = (id: string) => {
    if (!loaded) return;
    // switch to a scenario that offers this fault, then inject it
    const sc = loaded.scenarios.find(s => !s.id.startsWith('fault_') && s.faults.includes(id)) || loaded.scenarios.find(s => s.faults.includes(id));
    if (sc && sc.id !== scenario?.id) { appliedScenario.current = sc.id; setScenarioId(sc.id); const v = VIEW_FOR_RUN[runKindOf(sc)]; if (v) setViewId(v); }
    setFaulted(true); setActiveFaults(a => (a.includes(id) ? a.filter(x => x !== id) : [...a, id])); setShowSim(true);
  };

  const licenses = useMemo(() => {
    const m = new Map<string, number>(); if (loaded) for (const p of loaded.parts.values()) m.set(p.license.license, (m.get(p.license.license) || 0) + 1);
    return [...m.entries()];
  }, [loaded]);

  const views = loaded?.layout.views || [];
  const glass = 'border border-white/10 backdrop-blur-xl';
  const glassBg = { background: 'rgba(16,12,30,0.78)' } as const;
  const chip = (on: boolean) => ({ background: on ? 'var(--pj-grad-brand)' : 'rgba(255,255,255,0.08)', color: '#fff' });

  const partPanel = part && loaded && showPart ? (
    <PartPanel part={part} faults={loaded.faults} activeFaults={runFaults} onToggleFault={injectFromPart} onClose={() => selectPart(null)}
      onHide={() => { setHidden(h => new Set(h).add(part.id)); selectPart(null); }} onIsolate={() => setIsolate(i => !i)} isolated={isolate} onOpenLesson={props.onOpenLesson} />
  ) : null;
  const simPanel = loaded && scenario && showSim ? (
    <ScenarioPanel loaded={loaded} scenario={scenario} onScenario={id => { appliedScenario.current = null; setScenarioId(id); }} run={run} running={computing}
      t={t} playing={playing} onPlay={onPlay} onSeek={onSeek} speed={speed} onSpeed={setSpeed} faulted={faulted} onFaulted={setFaultedMode}
      activeFaults={activeFaults} onToggleFault={toggleFault} faultOptions={faultOptions} onClose={() => setShowSim(false)} />
  ) : null;

  const root = (
    <div className={`${variant === 'overlay' ? 'fixed inset-0 z-[80]' : 'relative h-[100dvh] w-full'} flex flex-col overflow-hidden text-white`} style={{ background: '#0b0814', fontFamily: 'Inter, system-ui, sans-serif' }} data-testid="atlas-viewer">
      {/* top bar */}
      <header className={`z-20 flex flex-wrap items-center gap-2 px-3 py-2 ${glass}`} style={glassBg}>
        {props.onClose && <button onClick={props.onClose} aria-label="Back" className="h-9 rounded-full bg-white/10 px-3 text-sm font-semibold hover:bg-white/20">Back</button>}
        <div className="font-display text-xl font-black italic leading-none" style={{ fontFamily: 'Outfit, system-ui, sans-serif' }}>Machine <span style={{ background: 'var(--pj-grad-ember)', WebkitBackgroundClip: 'text', color: 'transparent' }}>Atlas</span></div>
        <label className="sr-only" htmlFor="atlas-system">System</label>
        <select id="atlas-system" value={systemId} onChange={e => { setSystemId(e.target.value); setSelectedId(null); }} className="h-9 rounded-full border border-white/15 bg-[#17122a] px-3 text-sm">
          {ATLAS_SYSTEMS.map(s => <option key={s.id} value={s.id} disabled={!s.ready}>{s.label}{s.status === 'UNDER_REVIEW' ? ' (under review)' : s.ready ? '' : ' (coming soon)'}</option>)}
        </select>
        {ATLAS_SYSTEMS.find(s => s.id === systemId)?.status === 'UNDER_REVIEW' && <ContentStatusBadge status="UNDER_REVIEW" />}
        <nav className="flex gap-1 overflow-x-auto" aria-label="Views">
          {views.map(v => <button key={v.id} title={v.description} onClick={() => setViewId(v.id)} className="h-9 whitespace-nowrap rounded-full px-3 text-xs font-bold" style={chip(viewId === v.id)}>{v.label}</button>)}
        </nav>
        <div className="relative ml-auto min-w-[160px] flex-1 sm:max-w-[260px]">
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Find a part (e.g. caliper)" aria-label="Search parts" className="h-9 w-full rounded-full border border-white/15 bg-[#17122a] px-3 text-sm placeholder:text-white/40" />
          {matches.length > 0 && (
            <ul className={`absolute left-0 right-0 top-10 z-30 overflow-hidden rounded-xl ${glass}`} style={{ background: 'rgba(16,12,30,0.96)' }}>
              {matches.map(m => <li key={m.id}><button className="w-full px-3 py-2 text-left text-sm hover:bg-white/10" onClick={() => { selectPart(m.id, true); setSearch(''); }}>{m.name}</button></li>)}
            </ul>
          )}
        </div>
        <button onClick={() => { setShowSim(s => !s); setMobileTab('sim'); }} className="h-9 rounded-full px-4 text-xs font-bold" style={chip(showSim)}>Simulate</button>
      </header>

      {/* tool strip */}
      <div className={`z-10 flex items-center gap-3 overflow-x-auto px-3 py-1.5 text-xs ${glass}`} style={glassBg} role="toolbar" aria-label="View tools">
        <label className="flex shrink-0 items-center gap-2 font-semibold text-white/75">Explode
          <input type="range" min={0} max={1} step={0.01} value={explode} onChange={e => setExplode(Number(e.target.value))} aria-label="Explode" className="w-28 accent-[#FF8C00]" /></label>
        <button onClick={() => setXray(x => !x)} aria-pressed={xray} className="h-8 shrink-0 rounded-full px-3 font-bold" style={chip(xray)}>X-ray</button>
        <button onClick={() => setIsolate(i => !i)} aria-pressed={isolate} disabled={!selectedId} className="h-8 shrink-0 rounded-full px-3 font-bold disabled:opacity-40" style={chip(isolate)}>Isolate</button>
        <button onClick={() => setLabels(l => !l)} aria-pressed={labels} className="h-8 shrink-0 rounded-full px-3 font-bold" style={chip(labels)}>Labels</button>
        <button onClick={() => setSection(s => ({ ...s, on: !s.on }))} aria-pressed={section.on} className="h-8 shrink-0 rounded-full px-3 font-bold" style={chip(section.on)}>Section</button>
        {section.on && (<>
          {(['x', 'y', 'z'] as const).map(a => <button key={a} onClick={() => setSection(s => ({ ...s, axis: a }))} className="h-8 w-8 shrink-0 rounded-full font-bold uppercase" style={chip(section.axis === a)}>{a}</button>)}
          <input type="range" min={-2.5} max={2.5} step={0.02} value={section.offset} onChange={e => setSection(s => ({ ...s, offset: Number(e.target.value) }))} aria-label="Section position" className="w-28 shrink-0 accent-[#00DAF3]" />
        </>)}
        <button onClick={() => setResetNonce(n => n + 1)} className="h-8 shrink-0 rounded-full bg-white/10 px-3 font-bold hover:bg-white/20">Reset view</button>
        {hidden.size > 0 && <button onClick={() => setHidden(new Set())} className="h-8 shrink-0 rounded-full bg-white/10 px-3 font-bold hover:bg-white/20">Show {hidden.size} hidden</button>}
      </div>

      {/* canvas */}
      <main className="relative min-h-0 flex-1">
        {loadErr && <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-white/70">{loadErr}</div>}
        {!loaded && !loadErr && <div className="absolute inset-0 flex items-center justify-center text-sm text-white/60">Loading system...</div>}
        {loaded && scenario && (
          <SceneBoundary>
            <Suspense fallback={<div className="flex h-full items-center justify-center text-sm text-white/60">Preparing 3D...</div>}>
              <AtlasScene loaded={loaded} viewId={viewId} explode={explode} selectedId={selectedId} hoverId={hoverId} onSelect={id => selectPart(id)} onHover={setHoverId}
                xray={xray} isolate={isolate} hidden={hidden} section={section} labels={labels} run={run} playing={playing} speed={speed} playheadRef={playheadRef}
                onTick={setT} onEnd={() => { setPlaying(false); setT(playheadRef.current); }} faults={runFaults} faultTint={faulted && runFaults.length > 0}
                focus={focus} resetNonce={resetNonce} reducedMotion={reduced} onStats={setStats} />
            </Suspense>
          </SceneBoundary>
        )}
        {hoverId && loaded && <div className="pointer-events-none absolute left-1/2 top-12 -translate-x-1/2 rounded-full px-3 py-1 text-xs font-semibold" style={{ background: 'rgba(10,8,18,0.85)', border: '1px solid rgba(255,255,255,0.18)' }}>{loaded.parts.get(hoverId)?.name}</div>}
        {faulted && runFaults.length > 0 && <div className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 whitespace-nowrap rounded-full px-3 py-1 text-[11px] font-bold" style={{ background: 'var(--pj-danger-soft)', border: '1px solid var(--pj-danger)', color: '#fff' }}>Faulted: {runFaults.map(f => loaded?.faults.find(x => x.id === f)?.label || f).join(', ')}</div>}
        {!selectedId && loaded && <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full px-3 py-1 text-[11px] text-white/70" style={{ background: 'rgba(10,8,18,0.7)' }}>Tap a part to learn about it. Drag to orbit, scroll to zoom.</div>}

        {/* desktop docked panels */}
        {wide && simPanel && <aside className={`absolute bottom-3 left-3 top-3 z-10 w-[372px] overflow-hidden rounded-2xl ${glass}`} style={glassBg} aria-label="Simulation">{simPanel}</aside>}
        {wide && partPanel && <aside className={`absolute bottom-3 right-3 top-3 z-10 w-[404px] overflow-hidden rounded-2xl ${glass}`} style={glassBg} aria-label="Part information">{partPanel}</aside>}
        {/* mobile bottom sheet */}
        {!wide && ((showSim && simPanel) || partPanel) && (
          <aside className={`absolute inset-x-0 bottom-0 z-10 flex flex-col overflow-hidden rounded-t-3xl ${glass}`} style={{ ...glassBg, height: '46dvh' }} aria-label="Details">
            <div className="flex justify-center gap-2 pt-2" role="tablist">
              {partPanel && <button role="tab" aria-selected={mobileTab === 'part' || !simPanel} onClick={() => setMobileTab('part')} className="rounded-full px-3 py-1 text-xs font-bold" style={chip(mobileTab === 'part' || !simPanel)}>Part</button>}
              {simPanel && <button role="tab" aria-selected={mobileTab === 'sim' || !partPanel} onClick={() => setMobileTab('sim')} className="rounded-full px-3 py-1 text-xs font-bold" style={chip(mobileTab === 'sim' || !partPanel)}>Simulate</button>}
            </div>
            <div className="min-h-0 flex-1">{(mobileTab === 'sim' && simPanel) || partPanel || simPanel}</div>
          </aside>
        )}
        {!wide && !simPanel && !partPanel && <button onClick={() => { setShowSim(true); setMobileTab('sim'); }} className="absolute bottom-3 right-3 z-10 h-10 rounded-full px-4 text-sm font-bold" style={{ background: 'var(--pj-grad-brand)' }}>Simulate</button>}
      </main>

      {/* attribution footer */}
      <footer className={`z-20 px-3 py-1 text-[10px] text-white/55 ${glass}`} style={glassBg}>
        <button onClick={() => setFooterOpen(o => !o)} className="font-semibold underline-offset-2 hover:underline" aria-expanded={footerOpen}>Models, licenses and content status</button>
        {stats && <span className="ml-3">{stats.triangles.toLocaleString()} triangles · {stats.meshes} draw calls</span>}
        {footerOpen && loaded && (
          <div className="mt-1 space-y-0.5">
            {licenses.map(([l, n]) => <div key={l}>{n} parts: {l}. No third-party meshes or textures are loaded.</div>)}
            <div>Generic archetypes only: no manufacturer models or branding. Brake content is an AI draft awaiting ASE master technician review. Simulations are labelled by tier (S0 to S3); none is engineering-grade. Costs are estimate ranges. Always consult the factory service manual.</div>
          </div>
        )}
      </footer>
    </div>
  );
  return variant === 'overlay' && typeof document !== 'undefined' ? createPortal(root, document.body) : root;
}
