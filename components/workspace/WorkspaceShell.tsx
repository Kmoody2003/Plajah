// The unified workspace shell (docs/TELA_UNIFIED_WORKSPACE_PLAN.md, step 1). One place to design,
// make, engineer and do science: workspaces open as tabs, each tab keeps its room alive while you
// switch (your drawing is still there when you come back), and one Simple/Pro switch follows you.
// Tools inside each room come from the workspace tool registry (services/workspace/tools.ts) and grow
// with the person's skill profile; Aria guides each workspace the same way.
//
// Rooms draw themselves `fixed inset-0`; each tab wraps its room in a transformed box, which makes
// that box the containing block, so the room fills the area under the tab bar without changes.

import React, { Suspense, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { ArrowLeft, Plus, X, Ruler, Trees, Sun, Cpu, Blocks, Scissors, Cog, Car, Bot, Rocket, Sigma, Telescope, Dna, LayoutGrid, Sparkles } from 'lucide-react';
import { WORKSPACES, GROUPS, workspaceById, type Workspace } from '../../services/workspace/workspaces';
import { getProfile, subscribe, updateProfile, connectAccount } from '../../services/workspace/profileStore';
import { setLevel } from '../../services/workspace/skillProfile';
import type { Level } from '../../services/workspace/guidePath';
import { RoomHostContext } from './roomHost';
import type { CadRoomProps } from '../cad/CadRoom';
import type { ElecRoomProps } from '../elec/ElecRoom';
import type { PatternRoomProps } from '../soft/PatternRoom';
import type { BioRoomProps } from '../bio/BioRoom';

const CadRoom = React.lazy(() => import('../cad/CadRoom'));
const ElecRoom = React.lazy(() => import('../elec/ElecRoom'));
const PatternRoom = React.lazy(() => import('../soft/PatternRoom'));
const BioRoom = React.lazy(() => import('../bio/BioRoom'));
const BuildStudio = React.lazy(() => import('../build/studio/BuildStudio'));

const ICONS: Record<string, React.ComponentType<{ size?: number; style?: React.CSSProperties }>> = { Ruler, Trees, Sun, Cpu, Blocks, Scissors, Cog, Car, Bot, Rocket, Sigma, Telescope, Dna };
const C = { bg: '#0d0c12', bar: '#0a0910', panel: '#15131d', line: 'rgba(255,255,255,.08)', text: 'rgba(255,255,255,.88)', dim: 'rgba(255,255,255,.52)' };
/** Where to start today while a planned workspace is being built. */
const START_TODAY: Record<string, string[]> = { landscape: ['architecture'], render: ['architecture'], automotive: ['mechanical', 'electronics'], robotics: ['studio', 'electronics', 'mechanical'], aerospace: ['mechanical', 'electronics'], compute: [], astronomy: [] };

/** What the first room should open with (a Build launch: prompt, pattern, starter, lesson). */
export interface ShellLaunch { prompt?: string; template?: string; starter?: string; lesson?: string; guided?: boolean }
/** Extra props a host passes to a workspace's room: Tela's send-to-document hooks and the file it
 *  opened. The shell's own props (onClose, level, getToken) win, so a host can't break tab handling. */
export interface ShellRoomProps {
  architecture?: Partial<CadRoomProps>;
  mechanical?: Partial<CadRoomProps>;
  electronics?: Partial<ElecRoomProps>;
  sewing?: Partial<PatternRoomProps>;
  biology?: Partial<BioRoomProps>;
}
export interface WorkspaceShellProps {
  initial?: string;
  launch?: ShellLaunch;
  getToken?: () => Promise<string | null>;
  onClose?: () => void;
  /** Per-room hooks from the host (Tela documents). */
  roomProps?: ShellRoomProps;
  /** Names what the back button returns to, e.g. the Tela document's title. */
  backLabel?: string;
}

export default function WorkspaceShell({ initial = 'architecture', launch, getToken, onClose, roomProps, backLabel }: WorkspaceShellProps) {
  const first = workspaceById(initial) ? initial : 'architecture';
  const [tabs, setTabs] = useState<string[]>([first]);
  const [active, setActive] = useState(first);
  const [picker, setPicker] = useState(false);
  const profile = useSyncExternalStore(subscribe, getProfile, getProfile);
  useEffect(() => { connectAccount(getToken); }, [getToken]);
  const level: Level = profile.workspaces[active]?.level ?? 'simple';
  const changeLevel = (ws: string, l: Level) => updateProfile(p => setLevel(p, ws, l));

  const open = (id: string) => { setTabs(t => t.includes(id) ? t : [...t, id]); setActive(id); setPicker(false); };
  const close = (id: string) => {
    const rest = tabs.filter(t => t !== id);
    if (!rest.length) { onClose ? onClose() : setPicker(true); setTabs(rest.length ? rest : [id]); return; }
    setTabs(rest); if (active === id) setActive(rest[Math.max(0, tabs.indexOf(id) - 1)]);
  };
  // Keyboard: Ctrl+Alt+→/← cycles workspace tabs (Ctrl+Tab belongs to the browser).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (!e.ctrlKey || !e.altKey || (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft')) return; e.preventDefault(); const i = tabs.indexOf(active); setActive(tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length]); };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  }, [tabs, active]);

  return <div className="fixed inset-0 z-[200] flex flex-col" style={{ background: C.bg, color: C.text, fontFamily: 'Inter, system-ui, sans-serif' }} data-testid="workspace-shell">
    <header className="h-11 shrink-0 flex items-center gap-1 px-2" style={{ background: C.bar, borderBottom: `1px solid ${C.line}` }}>
      {onClose && (backLabel
        ? <button className="ws-back" onClick={onClose} aria-label={`Back to ${backLabel}`} title={`Back to ${backLabel}`} data-testid="ws-back"><ArrowLeft size={14}/><span className="truncate">{backLabel}</span></button>
        : <button className="ws-btn" onClick={onClose} aria-label="Leave the workspace" data-testid="ws-back"><ArrowLeft size={15}/></button>)}
      <div className="ws-brand" aria-hidden="true">Tela</div>
      <nav className="flex-1 min-w-0 flex items-center gap-1 overflow-x-auto ws-scroll" role="tablist" aria-label="Open workspaces">
        {tabs.map(id => { const w = workspaceById(id)!; const I = ICONS[w.icon] ?? LayoutGrid; const on = id === active; return <div key={id} role="tab" aria-selected={on} className={`ws-tab${on ? ' ws-on' : ''}`} style={{ ['--tone' as any]: w.tone }}>
          <button onClick={() => setActive(id)} className="flex items-center gap-1.5 min-w-0" data-testid={`ws-tab-${id}`}><I size={14} style={{ color: w.tone }}/><span className="truncate">{w.name}</span>{w.status === 'planned' && <span className="ws-soon">soon</span>}</button>
          <button onClick={() => close(id)} aria-label={`Close ${w.name}`} className="ws-x"><X size={12}/></button>
        </div>; })}
        <button className="ws-btn" onClick={() => setPicker(v => !v)} aria-label="Open a workspace" aria-expanded={picker} data-testid="ws-add"><Plus size={15}/></button>
      </nav>
      <div className="ws-level" role="group" aria-label="Explanation level">
        {(['simple', 'pro'] as const).map(l => <button key={l} className={level === l ? 'ws-lon' : ''} onClick={() => changeLevel(active, l)} data-testid={`ws-level-${l}`}>{l === 'simple' ? 'Simple' : 'Pro'}</button>)}
      </div>
    </header>

    <div className="flex-1 min-h-0 relative">
      {tabs.map(id => { const w = workspaceById(id)!; return <Pane key={id} id={id} on={id === active}>
        <RoomBoundary name={w.name}><Suspense fallback={<div className="absolute inset-0 grid place-items-center text-sm" style={{ color: C.dim }}>Loading {w.name}…</div>}>
          <Room w={w} level={profile.workspaces[id]?.level ?? 'simple'} onLevel={l => changeLevel(id, l)} launch={id === first ? launch : undefined} extra={roomProps} getToken={getToken} onClose={() => close(id)} onOpen={open}/>
        </Suspense></RoomBoundary>
      </Pane>; })}
      {picker && <Picker open={tabs} onPick={open} onClose={() => setPicker(false)} level={level}/>}
    </div>

    <style>{`
.ws-btn{display:inline-grid;place-items:center;flex:none;width:32px;height:30px;border-radius:8px;color:rgba(255,255,255,.75);background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08)}
.ws-btn:hover{color:#fff;background:rgba(255,255,255,.1)}
.ws-back{display:flex;align-items:center;gap:6px;flex:none;max-width:180px;height:30px;padding:0 10px 0 8px;border-radius:8px;font-size:12px;font-weight:600;color:rgba(255,255,255,.75);background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08)}
.ws-back:hover{color:#fff;background:rgba(255,255,255,.1)}
.ws-brand{flex:none;padding:0 8px 0 4px;font:900 italic 15px/1 Outfit,Inter,sans-serif;letter-spacing:-.02em;background:linear-gradient(95deg,#FF8C00,#D40055 55%,#a855f7);-webkit-background-clip:text;background-clip:text;color:transparent}
.ws-scroll{scrollbar-width:none}.ws-scroll::-webkit-scrollbar{display:none}
.ws-tab{flex:none;display:flex;align-items:center;gap:4px;height:32px;max-width:200px;padding:0 4px 0 10px;border-radius:9px;font-size:12px;font-weight:600;color:rgba(255,255,255,.62);border:1px solid transparent}
.ws-tab:hover{background:rgba(255,255,255,.05);color:#fff}
.ws-on{background:color-mix(in srgb,var(--tone) 14%,#15131d);border-color:color-mix(in srgb,var(--tone) 45%,transparent);color:#fff}
.ws-x{display:grid;place-items:center;width:20px;height:20px;border-radius:6px;color:rgba(255,255,255,.45)}
.ws-x:hover{background:rgba(255,255,255,.1);color:#fff}
.ws-soon{font-size:9px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;padding:2px 5px;border-radius:999px;background:rgba(255,255,255,.08);color:rgba(255,255,255,.6)}
.ws-level{flex:none;display:flex;padding:2px;border-radius:9px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.08)}
.ws-level button{height:26px;padding:0 10px;border-radius:7px;font-size:11.5px;font-weight:700;color:rgba(255,255,255,.6)}
.ws-level .ws-lon{background:rgba(167,139,250,.2);color:#e9d5ff}
@media (max-width:639px){.ws-brand{display:none}.ws-tab{max-width:140px}.ws-back{max-width:44px}.ws-back span{display:none}}
`}</style>
  </div>;
}

/** A room that crashes (no WebGL, a bad file) shows a message in its own tab; the other tabs keep working. */
class RoomBoundary extends React.Component<{ name: string; children: React.ReactNode }, { error: Error | null; key: number }> {
  state = { error: null as Error | null, key: 0 };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error) { console.error(`[workspace] ${this.props.name} stopped:`, error); }
  render() {
    const { error, key } = this.state;
    if (!error) return <React.Fragment key={key}>{this.props.children}</React.Fragment>;
    const gl = /webgl/i.test(error.message);
    return <div className="absolute inset-0 grid place-items-center p-6" data-testid="ws-room-error" role="alert">
      <div className="max-w-[440px] text-center">
        <div className="text-[15px] font-bold">{this.props.name} stopped</div>
        <p className="mt-2 text-[13px]" style={{ color: C.dim }}>{gl ? 'This room needs 3D graphics (WebGL), and the browser has turned them off for now. Restarting the browser usually brings them back.' : error.message}</p>
        <p className="mt-1 text-[12px]" style={{ color: C.dim }}>Your other tabs are fine.</p>
        <button className="ws-btn mt-4" style={{ width: 'auto', padding: '0 14px' }} onClick={() => this.setState({ error: null, key: key + 1 })} data-testid="ws-room-retry">Try again</button>
      </div>
    </div>;
  }
}

/** One tab's area. Rooms portal into it (RoomHostContext), and its transform makes it the box their `fixed inset-0` fills. */
function Pane({ id, on, children }: { id: string; on: boolean; children: React.ReactNode }) {
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  return <div ref={setHost} className="absolute inset-0" style={{ transform: 'translateZ(0)', overflow: 'hidden', display: on ? 'block' : 'none' }} data-testid={`ws-pane-${id}`}>
    {host && <RoomHostContext.Provider value={host}>{children}</RoomHostContext.Provider>}
  </div>;
}

function Room({ w, level, onLevel, launch, extra, getToken, onClose, onOpen }: { w: Workspace; level: Level; onLevel: (l: Level) => void; launch?: ShellLaunch; extra?: ShellRoomProps; getToken?: () => Promise<string | null>; onClose: () => void; onOpen: (id: string) => void }) {
  if (w.status === 'planned' || !w.room) return <Coming w={w} level={level} onOpen={onOpen}/>;
  // A file the host opened decides the start, so the parts library / guide don't pop over it.
  const opened = (p?: Partial<CadRoomProps>) => !!(p?.initialFile || p?.loadInitial);
  switch (w.id) {
    case 'architecture': return <CadRoom startWith={launch?.guided && !opened(extra?.architecture) ? 'guided' : undefined} {...extra?.architecture} getToken={getToken} onClose={onClose} level={level} onLevel={onLevel}/>;
    case 'mechanical': return <CadRoom startWith={opened(extra?.mechanical) ? undefined : 'parts'} {...extra?.mechanical} getToken={getToken} onClose={onClose} level={level} onLevel={onLevel}/>;
    case 'electronics': return <ElecRoom initialPrompt={launch?.prompt} {...extra?.electronics} getToken={getToken} onClose={onClose} level={level}/>;
    case 'sewing': return <PatternRoom initialTemplate={launch?.template} {...extra?.sewing} getToken={getToken} onClose={onClose} level={level}/>;
    case 'studio': return <BuildStudio getToken={getToken} onClose={onClose} starter={launch?.starter} lesson={launch?.lesson} level={level}/>;
    case 'biology': return <BioRoom {...extra?.biology} onClose={onClose} level={level}/>;
    default: return <Coming w={w} level={level} onOpen={onOpen}/>;
  }
}

/** A workspace that isn't built yet: what it will do, the paths Aria will guide, and where to start today. */
function Coming({ w, level, onOpen }: { w: Workspace; level: Level; onOpen: (id: string) => void }) {
  const I = ICONS[w.icon] ?? LayoutGrid;
  const today = (START_TODAY[w.id] ?? []).map(workspaceById).filter((x): x is Workspace => !!x);
  return <div className="absolute inset-0 overflow-auto" data-testid={`ws-coming-${w.id}`}>
    <div className="max-w-[720px] mx-auto px-4 py-10">
      <div className="w-12 h-12 rounded-2xl grid place-items-center" style={{ background: `color-mix(in srgb, ${w.tone} 18%, #15131d)`, border: `1px solid color-mix(in srgb, ${w.tone} 45%, transparent)` }}><I size={22} style={{ color: w.tone }}/></div>
      <div className="mt-4 text-[11px] font-bold tracking-[.18em] uppercase" style={{ color: w.tone }}>{GROUPS.find(g => g.id === w.group)?.name} · coming</div>
      <h2 className="mt-1 text-[28px] font-black tracking-tight" style={{ fontFamily: 'Outfit, Inter, sans-serif' }}>{w.name}</h2>
      <p className="mt-2 text-[15px] leading-relaxed" style={{ color: C.text }}>{w.door[level]}</p>
      <p className="mt-3 text-[13px]" style={{ color: C.dim }}>This workspace isn't built yet. It will open on the same document as the others, with tools that appear as your work needs them.</p>
      {w.paths.length > 0 && <section className="mt-6 p-4 rounded-2xl" style={{ background: C.panel, border: `1px solid ${C.line}` }}>
        <div className="flex items-center gap-2 text-[12px] font-bold"><span className="w-6 h-6 rounded-full grid place-items-center text-[11px] font-black" style={{ background: 'linear-gradient(135deg,#a855f7,#ec4899)', color: '#fff' }}>A</span>{level === 'simple' ? 'Aria will walk you through' : 'Guided paths planned'}</div>
        <ul className="mt-2 space-y-1 text-[13.5px]">{w.paths.map(x => <li key={x.id} className="flex items-center gap-2"><Sparkles size={13} style={{ color: '#c084fc' }}/>{x.title[level]}</li>)}</ul>
      </section>}
      {today.length > 0 && <section className="mt-4">
        <div className="text-[12px] font-bold" style={{ color: C.dim }}>{level === 'simple' ? 'You can start today in' : 'Available now'}</div>
        <div className="mt-2 flex flex-wrap gap-2">{today.map(t => { const TI = ICONS[t.icon] ?? LayoutGrid; return <button key={t.id} onClick={() => onOpen(t.id)} className="flex items-center gap-2 h-9 px-3 rounded-xl text-[13px] font-semibold" style={{ background: C.panel, border: `1px solid color-mix(in srgb, ${t.tone} 40%, transparent)` }} data-testid={`ws-start-${t.id}`}><TI size={14} style={{ color: t.tone }}/>{t.name}</button>; })}</div>
      </section>}
    </div>
  </div>;
}

function Picker({ open, onPick, onClose, level }: { open: string[]; onPick: (id: string) => void; onClose: () => void; level: Level }) {
  const byGroup = useMemo(() => GROUPS.map(g => ({ g, items: WORKSPACES.filter(w => w.group === g.id) })), []);
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
  return <div className="absolute inset-0 z-[300] overflow-auto" style={{ background: 'rgba(8,7,11,.92)', backdropFilter: 'blur(8px)' }} onClick={onClose} data-testid="ws-picker">
    <div className="max-w-[980px] mx-auto px-4 py-8" onClick={e => e.stopPropagation()}>
      <div className="flex items-center gap-3"><h2 className="flex-1 text-[22px] font-black" style={{ fontFamily: 'Outfit, Inter, sans-serif' }}>{level === 'simple' ? 'What do you want to work on?' : 'Open a workspace'}</h2><button className="ws-btn" onClick={onClose} aria-label="Close"><X size={15}/></button></div>
      {byGroup.map(({ g, items }) => <section key={g.id} className="mt-6">
        <div className="text-[11px] font-bold tracking-[.2em] uppercase" style={{ color: C.dim }}>{g.name}</div>
        <div className="mt-2 grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))' }}>
          {items.map(w => { const I = ICONS[w.icon] ?? LayoutGrid; return <button key={w.id} onClick={() => onPick(w.id)} className="text-left p-3 rounded-xl" style={{ background: C.panel, border: `1px solid ${open.includes(w.id) ? w.tone : C.line}` }} data-testid={`ws-pick-${w.id}`}>
            <div className="flex items-center gap-2 text-[14px] font-bold"><I size={15} style={{ color: w.tone }}/>{w.name}{w.status === 'planned' && <span className="ws-soon ml-auto">soon</span>}</div>
            <div className="mt-1 text-[12px] leading-snug" style={{ color: C.dim }}>{w.door[level]}</div>
          </button>; })}
        </div>
      </section>)}
    </div>
  </div>;
}
