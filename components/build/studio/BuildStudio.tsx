// Plajah Build Studio: beginner 3D design, breadboard circuits and block coding in one free,
// in-browser studio, with starters, step-by-step lessons, safety notes and cloud autosave.
// Contract (Academia STEM track): default export, props below; STUDIO_STARTERS lives in
// services/build/studio/starters.ts.

import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { X, Box, Cpu, BookOpen, ShieldCheck, Sparkles, Check, ChevronRight, ChevronLeft, CloudUpload, Cloud, HardDrive, Send, FolderOpen, Plus, Lightbulb } from 'lucide-react';
import Studio3D from './Studio3D';
import StudioCircuit from './StudioCircuit';
import SafetyPanel from '../../safety/SafetyPanel';
import { openHazards } from '../../../services/safety/hazards';
import { STUDIO_STARTERS, buildStarter } from '../../../services/build/studio/starters';
import { LESSONS, lessonById, type LessonCtx } from '../../../services/build/studio/lessons';
import { blankProject, normalizeProject, type StudioProject, type StudioMode } from '../../../services/build/studio/project';
import { studio3dHazards, studioCircuitHazards } from '../../../services/build/studio/safety';
import { toCircuit } from '../../../services/build/studio/breadboard';
import type { Scene, Audience } from '../../../services/build/studio/shapes';
import type { CircuitProject } from '../../../services/build/studio/breadboard';
import type { Program } from '../../../services/build/studio/blocks';
import type { CadModel } from '../../../services/cad/model';

const MakePanel = React.lazy(() => import('../../fab/MakePanel'));

export interface BuildStudioProps {
  onClose?: () => void; starter?: string; lesson?: string;
  onSubmit?: (work: { kind: 'studio'; title: string; json: unknown; thumbnail?: string }) => Promise<void>;
  /** Signed-in token for Make (machine sending, terms) when the host has one. */
  getToken?: () => Promise<string | null>;
  /** Simple/Pro from the workspace shell: Pro shows every 3D tool. */
  level?: 'simple' | 'pro';
}

// ---------------------------------------------------------------- local + cloud saving
const KEY = 'plajah.studio.v1'; const CLOUD_KIND = 'build-studio';
const ls = { get<T>(k: string): T | null { try { return JSON.parse(localStorage.getItem(`${KEY}.${k}`) ?? 'null') as T; } catch { return null; } }, set(k: string, v: unknown) { try { localStorage.setItem(`${KEY}.${k}`, JSON.stringify(v)); return true; } catch { return false; } } };
interface IndexRow { id: string; title: string; mode: StudioMode; updatedAt: number }
const listLocal = () => (ls.get<IndexRow[]>('index') ?? []).sort((a, b) => b.updatedAt - a.updatedAt);
function saveLocal(p: StudioProject) { const ok = ls.set(`p.${p.id}`, p); const idx = listLocal().filter(r => r.id !== p.id); idx.unshift({ id: p.id, title: p.title, mode: p.mode, updatedAt: p.updatedAt }); ls.set('index', idx.slice(0, 60)); ls.set('last', p.id); return ok; }
const loadLocal = (id: string) => normalizeProject(ls.get(`p.${id}`));
type SaveState = 'idle' | 'local' | 'cloud' | 'offline';

function initial(starter?: string, lesson?: string): StudioProject {
  const L = lessonById(lesson);
  if (L) { const p = (L.starter ? buildStarter(L.starter) : null) ?? blankProject(L.mode, L.title); p.lesson = L.id; p.lessonStep = 0; if (L.mode === 'circuit') p.circuit = { board: null, parts: [], wires: [] }; return p; }
  if (starter) { const p = buildStarter(starter); if (p) return p; }
  const last = ls.get<string>('last'); const saved = last ? loadLocal(last) : null; return saved ?? blankProject('3d');
}

export default function BuildStudio({ onClose, starter, lesson, onSubmit, getToken, level }: BuildStudioProps) {
  const [proj, setProj] = useState<StudioProject>(() => initial(starter, lesson));
  const [past, setPast] = useState<StudioProject[]>([]); const [future, setFuture] = useState<StudioProject[]>([]);
  const lastPush = useRef(0);
  const [gallery, setGallery] = useState<boolean>(() => !starter && !lesson && !ls.get<string>('last'));
  const [lessonOpen, setLessonOpen] = useState<boolean>(() => !!lessonById(lesson) || !!lessonById(proj.lesson));
  const [safetyOpen, setSafetyOpen] = useState(false);
  const [make, setMake] = useState<CadModel | null>(null);
  const [save, setSave] = useState<SaveState>('idle');
  const [ctx, setCtx] = useState<LessonCtx>({ exported: false, ran: false, litLeds: new Set(), sentToMake: false });
  const [acked, setAcked] = useState<string[]>(() => ls.get<string[]>('acked') ?? []);
  const [submitting, setSubmitting] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');
  const thumb = useRef<{ '3d'?: () => string | undefined; circuit?: () => string | undefined }>({});

  // React to a new launch request (the hub or a lesson page can change the props while open).
  const launched = useRef(`${starter}|${lesson}`);
  useEffect(() => { const k = `${starter}|${lesson}`; if (k === launched.current) return; launched.current = k; saveLocal(proj); setProj(initial(starter, lesson)); setPast([]); setFuture([]); setLessonOpen(!!lessonById(lesson)); setGallery(false); }, [starter, lesson]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Change the project content with undo; quick successive edits (typing) merge into one step. */
  const change = useCallback((fn: (p: StudioProject) => StudioProject) => {
    setProj(cur => { const next = { ...fn(cur), updatedAt: Date.now() }; const now = Date.now(); if (now - lastPush.current > 450) setPast(ps => [...ps.slice(-79), cur]); lastPush.current = now; setFuture([]); return next; });
  }, []);
  const undo = () => { setPast(ps => { if (!ps.length) return ps; const prev = ps[ps.length - 1]; setFuture(f => [proj, ...f].slice(0, 80)); setProj({ ...prev, updatedAt: Date.now() }); lastPush.current = 0; return ps.slice(0, -1); }); };
  const redo = () => { setFuture(fs => { if (!fs.length) return fs; const nxt = fs[0]; setPast(ps => [...ps, proj]); setProj({ ...nxt, updatedAt: Date.now() }); lastPush.current = 0; return fs.slice(1); }); };
  const meta = (patch: Partial<StudioProject>) => setProj(p => ({ ...p, ...patch, updatedAt: Date.now() }));

  // Autosave: this device right away, the cloud (with version history) when signed in.
  useEffect(() => {
    const t = setTimeout(() => {
      const ok = saveLocal(proj); setSave(ok ? 'local' : 'offline');
      import('../../../services/creativeCloud/cloudStore').then(m => { m.scheduleCreativeSync({ kind: CLOUD_KIND, localId: proj.id, title: proj.title, json: JSON.stringify(proj) }); setSave(navigator.onLine ? 'cloud' : 'offline'); }).catch(() => { /* cloud not available here: the device copy stands */ });
    }, 700);
    return () => clearTimeout(t);
  }, [proj]);
  useEffect(() => { ls.set('acked', acked); }, [acked]);

  const lessonDef = lessonById(proj.lesson);
  const checks = lessonDef ? lessonDef.steps.map(s => { try { return s.check ? s.check(proj, ctx) : false; } catch { return false; } }) : [];
  const firstOpen = checks.findIndex(c => !c); const stepIdx = Math.min(proj.lessonStep ?? 0, (lessonDef?.steps.length ?? 1) - 1);
  useEffect(() => { if (lessonDef && firstOpen > stepIdx && checks[stepIdx]) meta({ lessonStep: firstOpen < 0 ? lessonDef.steps.length - 1 : firstOpen }); }, [checks.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  const hazards = useMemo(() => (proj.mode === '3d' ? studio3dHazards(proj.audience) : studioCircuitHazards(toCircuit(proj.circuit, {}).circuit)), [proj.mode, proj.audience, proj.circuit]);
  const openH = openHazards(hazards, acked);
  const exportBlocked = openH.length ? `Read the safety notes and tick "${openH[0].title}" before exporting.` : null;

  const open = (p: StudioProject) => { saveLocal(proj); setProj(p); setPast([]); setFuture([]); setGallery(false); setLessonOpen(!!p.lesson); setCtx({ exported: false, ran: false, litLeds: new Set(), sentToMake: false }); };
  const submit = async () => {
    if (!onSubmit) return; setSubmitting('busy');
    try { const thumbnail = thumb.current[proj.mode]?.(); await onSubmit({ kind: 'studio', title: proj.title, json: proj, thumbnail }); setSubmitting('done'); } catch { setSubmitting('error'); }
  };
  const SaveIcon = save === 'cloud' ? Cloud : save === 'offline' ? HardDrive : CloudUpload;

  return <div className="bst" data-testid="build-studio">
    <header className="bst-top">
      <div className="bst-brand"><span className="bst-mark" aria-hidden="true"><i/><i/><i/></span><span>Build Studio</span></div>
      <input className="bst-title" value={proj.title} onChange={e => meta({ title: e.target.value.slice(0, 80) })} aria-label="Project name" data-testid="project-title"/>
      <nav className="bst-modes" role="tablist" aria-label="Workspace">
        <button role="tab" aria-selected={proj.mode === '3d'} className={proj.mode === '3d' ? 'on' : ''} onClick={() => meta({ mode: '3d' })} data-testid="mode-3d"><Box size={15}/>3D design</button>
        <button role="tab" aria-selected={proj.mode === 'circuit'} className={proj.mode === 'circuit' ? 'on' : ''} onClick={() => meta({ mode: 'circuit' })} data-testid="mode-circuit"><Cpu size={15}/>Circuits &amp; code</button>
      </nav>
      <div className="bst-actions">
        <span className={`bst-save ${save}`} title={save === 'cloud' ? 'Saved to your Plajah cloud with version history' : save === 'local' ? 'Saved on this device' : save === 'offline' ? 'Offline: saved on this device' : ''}><SaveIcon size={14}/>{save === 'cloud' ? 'Saved' : save === 'local' ? 'Saved here' : save === 'offline' ? 'Offline' : ''}</span>
        <button onClick={() => setGallery(true)} data-testid="open-gallery"><FolderOpen size={15}/><span>Projects</span></button>
        <button onClick={() => setLessonOpen(o => !o)} className={lessonOpen ? 'on' : ''} data-testid="open-lessons"><BookOpen size={15}/><span>Lessons</span></button>
        <button onClick={() => setSafetyOpen(o => !o)} className={`bst-safety${openH.length ? ' warn' : ''}`} data-testid="open-safety"><ShieldCheck size={15}/><span>Safety</span>{openH.length > 0 && <b>{openH.length}</b>}</button>
        {onSubmit && <button className="bst-submit" onClick={submit} disabled={submitting === 'busy'} data-testid="submit-work"><Send size={15}/><span>{submitting === 'done' ? 'Turned in' : submitting === 'busy' ? 'Sending…' : submitting === 'error' ? 'Try again' : 'Turn in'}</span></button>}
        {onClose && <button className="bst-close" onClick={() => { saveLocal(proj); onClose(); }} aria-label="Close Build Studio" data-testid="close-studio"><X size={18}/></button>}
      </div>
    </header>

    <div className="bst-body">
      {lessonOpen && <aside className="bst-lesson" aria-label="Lesson" data-testid="lesson-panel">
        {lessonDef ? <>
          <div className="bst-lesson-k">Lesson · {lessonDef.level} · {lessonDef.minutes} min</div>
          <h2>{lessonDef.title}</h2><p className="bst-goal">{lessonDef.goal}</p>
          <ol className="bst-steps">{lessonDef.steps.map((s, i) => <li key={i} className={`${checks[i] ? 'done' : ''}${i === stepIdx ? ' cur' : ''}`} onClick={() => meta({ lessonStep: i })}><span className="bst-tick">{checks[i] ? <Check size={12}/> : i + 1}</span>{s.title}</li>)}</ol>
          <div className="bst-stepcard" data-testid="lesson-step"><b>{lessonDef.steps[stepIdx].title}</b><p>{lessonDef.steps[stepIdx].body}</p>
            {lessonDef.steps[stepIdx].hint && !checks[stepIdx] && <details><summary><Lightbulb size={13}/>Hint</summary><p>{lessonDef.steps[stepIdx].hint}</p></details>}
            {checks[stepIdx] && <div className="bst-check"><Check size={14}/>Checkpoint done!</div>}
            <div className="bst-stepnav"><button disabled={stepIdx === 0} onClick={() => meta({ lessonStep: stepIdx - 1 })}><ChevronLeft size={14}/>Back</button><button disabled={stepIdx >= lessonDef.steps.length - 1} onClick={() => meta({ lessonStep: stepIdx + 1 })}>Next<ChevronRight size={14}/></button></div>
          </div>
          {checks.length > 0 && checks.every(Boolean) && <div className="bst-done" data-testid="lesson-complete"><Sparkles size={16}/>Lesson complete! {onSubmit ? 'Turn it in when you are ready.' : ''}</div>}
          <button className="bst-link" onClick={() => meta({ lesson: undefined, lessonStep: 0 })}>Leave lesson</button>
        </> : <>
          <h2>Lessons</h2><p className="bst-goal">Step-by-step builds that check your work as you go.</p>
          {LESSONS.map(L => <button key={L.id} className="bst-lesson-pick" onClick={() => open((() => { const p = initial(undefined, L.id); return p; })())} data-testid={`lesson-${L.id}`}><b>{L.title}</b><span>{L.level} · {L.mode === '3d' ? '3D' : 'Circuit'} · {L.minutes} min</span></button>)}
        </>}
      </aside>}

      <main className="bst-work">
        {proj.mode === '3d'
          ? <Studio3D level={level} scene={proj.scene} commit={(s: Scene) => change(p => ({ ...p, scene: s }))} undo={undo} redo={redo} canUndo={past.length > 0} canRedo={future.length > 0}
              title={proj.title} audience={proj.audience} setAudience={(a: Audience) => meta({ audience: a })} printer={proj.printer} setPrinter={id => meta({ printer: id })}
              exportBlocked={exportBlocked} onExported={() => setCtx(c => ({ ...c, exported: true }))} onSendToMake={m => { setMake(m); setCtx(c => ({ ...c, sentToMake: true })); }}
              registerThumb={fn => { thumb.current['3d'] = fn; }} showSafety={() => setSafetyOpen(true)}/>
          : <StudioCircuit circuit={proj.circuit} program={proj.program} commitCircuit={(c: CircuitProject) => change(p => ({ ...p, circuit: c }))} commitProgram={(pg: Program) => change(p => ({ ...p, program: pg }))}
              lang={proj.lang} setLang={l => meta({ lang: l })} title={proj.title} onRun={lit => setCtx(c => ({ ...c, ran: true, litLeds: new Set([...c.litLeds, ...lit]) }))} registerThumb={fn => { thumb.current.circuit = fn; }}/>}
      </main>

      {safetyOpen && <aside className="bst-safetypane" aria-label="Safety notes" data-testid="safety-pane">
        <button className="bst-x" onClick={() => setSafetyOpen(false)} aria-label="Close safety notes"><X size={16}/></button>
        <SafetyPanel hazards={hazards} acked={acked} onAck={(id, v) => setAcked(a => (v ? [...new Set([...a, id])] : a.filter(x => x !== id)))} title={proj.mode === '3d' ? 'Safety: 3D printing' : 'Safety: circuits'}/>
        <p className="bst-teacher">Build Studio only uses low-voltage parts. Grown-ups: printing and soldering need supervision.</p>
      </aside>}
    </div>

    {gallery && <div className="bst-modal" role="dialog" aria-modal="true" aria-label="Projects" data-testid="gallery">
      <div className="bst-sheet">
        <button className="bst-x" onClick={() => setGallery(false)} aria-label="Close"><X size={18}/></button>
        <h2>What will you build?</h2>
        <div className="bst-new"><button onClick={() => open(blankProject('3d'))} data-testid="new-3d"><Plus size={16}/><Box size={18}/>New 3D design</button><button onClick={() => open({ ...blankProject('circuit'), title: 'My circuit' })} data-testid="new-circuit"><Plus size={16}/><Cpu size={18}/>New circuit</button></div>
        <div className="bst-h">Starters</div>
        <div className="bst-cards">{STUDIO_STARTERS.map(s => <button key={s.id} className={`bst-cardbtn m-${s.mode}`} onClick={() => { const p = buildStarter(s.id); if (p) open(p); }} data-testid={`starter-${s.id}`}>
          <span className="bst-badge">{s.level}</span><span className="bst-cardmode">{s.mode === '3d' ? <Box size={14}/> : <Cpu size={14}/>}{s.mode === '3d' ? '3D' : s.mode === 'code' ? 'Code' : 'Circuit'}</span><b>{s.title}</b><span>{s.about}</span></button>)}</div>
        <div className="bst-h">Lessons</div>
        <div className="bst-cards">{LESSONS.map(L => <button key={L.id} className="bst-cardbtn m-lesson" onClick={() => open(initial(undefined, L.id))}><span className="bst-badge">{L.level}</span><span className="bst-cardmode"><BookOpen size={14}/>{L.minutes} min</span><b>{L.title}</b><span>{L.goal}</span></button>)}</div>
        {listLocal().length > 0 && <><div className="bst-h">My builds</div><div className="bst-mine">{listLocal().slice(0, 12).map(r => <button key={r.id} onClick={() => { const p = loadLocal(r.id); if (p) open(p); }}>{r.mode === '3d' ? <Box size={14}/> : <Cpu size={14}/>}<b>{r.title}</b><span>{new Date(r.updatedAt).toLocaleDateString()}</span></button>)}</div></>}
      </div>
    </div>}

    {make && <div className="bst-modal" role="dialog" aria-modal="true" aria-label="Make" data-testid="make-modal">
      <div className="bst-sheet bst-make"><button className="bst-x" onClick={() => setMake(null)} aria-label="Close Make"><X size={18}/></button>
        <h2>Make: {proj.title}</h2><Suspense fallback={<p>Loading Make…</p>}><MakePanel model={make} getToken={getToken}/></Suspense></div>
    </div>}
    <style>{STUDIO_CSS}</style>
  </div>;
}

const STUDIO_CSS = `
.bst{position:fixed;inset:0;display:flex;flex-direction:column;background:#0d1017;color:#e9edf3;font-family:var(--font-body,Inter,system-ui,sans-serif);font-size:13px;z-index:1}
.bst button{font:inherit;color:inherit;cursor:pointer;background:none;border:0}
.bst button:disabled{opacity:.45;cursor:default}
.bst-top{display:flex;align-items:center;gap:12px;height:52px;padding:0 12px;border-bottom:1px solid rgba(255,255,255,.08);background:#121620;flex:none}
.bst-brand{display:flex;align-items:center;gap:9px;font:800 15px/1 var(--font-display,Outfit,sans-serif);letter-spacing:-.01em;white-space:nowrap}
.bst-mark{display:grid;grid-template-columns:repeat(3,6px);gap:2px}.bst-mark i{width:6px;height:14px;border-radius:2px;background:#ff8c00}.bst-mark i:nth-child(2){background:#00c2d8;height:10px;align-self:end}.bst-mark i:nth-child(3){background:#e64980;height:18px;margin-top:-4px}
.bst-title{min-width:80px;width:200px;height:32px;padding:0 10px;border-radius:8px;background:transparent;border:1px solid transparent;color:#fff;font-weight:600}
.bst-title:hover,.bst-title:focus{border-color:rgba(255,255,255,.18);background:rgba(255,255,255,.04);outline:none}
.bst-modes{display:flex;gap:2px;padding:3px;border-radius:10px;background:rgba(255,255,255,.05)}
.bst-modes button{display:flex;align-items:center;gap:6px;height:30px;padding:0 12px;border-radius:8px;font-weight:600;color:rgba(255,255,255,.7)}
.bst-modes button.on{background:#ff8c00;color:#1a1000}
.bst-actions{margin-left:auto;display:flex;align-items:center;gap:4px}
.bst-actions>button{display:flex;align-items:center;gap:6px;height:32px;padding:0 10px;border-radius:8px;color:rgba(255,255,255,.8)}
.bst-actions>button:hover,.bst-actions>button.on{background:rgba(255,255,255,.08);color:#fff}
.bst-safety.warn{color:#ffd43b!important}.bst-safety b{min-width:18px;height:18px;border-radius:9px;background:#ffd43b;color:#1a1300;font-size:11px;display:grid;place-items:center}
.bst-submit{background:linear-gradient(100deg,#2f9e44,#0ca678)!important;color:#fff!important;font-weight:700}
.bst-save{display:flex;align-items:center;gap:5px;font-size:12px;color:rgba(255,255,255,.5);margin-right:6px}.bst-save.cloud{color:#8ce99a}.bst-save.offline{color:#ffd43b}
.bst-body{flex:1;min-height:0;display:flex}
.bst-work{flex:1;min-width:0;min-height:0;display:flex}
.bst-lesson{width:290px;flex:none;overflow:auto;padding:16px;border-right:1px solid rgba(255,255,255,.08);background:#10141d}
.bst-lesson h2{margin:4px 0 6px;font:800 19px/1.15 var(--font-display,Outfit,sans-serif)}
.bst-lesson-k{font:700 10.5px/1 ui-monospace,monospace;letter-spacing:.14em;text-transform:uppercase;color:#00c2d8}
.bst-goal{margin:0 0 12px;color:rgba(255,255,255,.65);line-height:1.45}
.bst-steps{list-style:none;margin:0 0 12px;padding:0;display:flex;flex-direction:column;gap:3px}
.bst-steps li{display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:8px;cursor:pointer;color:rgba(255,255,255,.72)}
.bst-steps li.cur{background:rgba(255,140,0,.12);color:#fff}.bst-steps li.done{color:#8ce99a}
.bst-tick{width:20px;height:20px;border-radius:50%;display:grid;place-items:center;font-size:11px;font-weight:700;background:rgba(255,255,255,.08);flex:none}
.bst-steps li.done .bst-tick{background:#2f9e44;color:#fff}.bst-steps li.cur:not(.done) .bst-tick{background:#ff8c00;color:#1a1000}
.bst-stepcard{padding:12px;border-radius:12px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.08)}
.bst-stepcard p{margin:6px 0;line-height:1.5;color:rgba(255,255,255,.8)}
.bst-stepcard details summary{display:flex;align-items:center;gap:5px;cursor:pointer;color:#ffd43b;font-weight:600;margin-top:6px}
.bst-check{display:flex;align-items:center;gap:6px;color:#8ce99a;font-weight:700;margin-top:8px}
.bst-stepnav{display:flex;justify-content:space-between;margin-top:10px}.bst-stepnav button{display:flex;align-items:center;gap:4px;padding:6px 10px;border-radius:8px;background:rgba(255,255,255,.06)}
.bst-done{display:flex;align-items:center;gap:8px;margin-top:12px;padding:10px 12px;border-radius:10px;background:rgba(47,158,68,.18);color:#b2f2bb;font-weight:700}
.bst-link{margin-top:14px;color:rgba(255,255,255,.5)!important;text-decoration:underline}
.bst-lesson-pick{display:flex;flex-direction:column;align-items:flex-start;gap:2px;width:100%;padding:10px 12px;margin-bottom:6px;border-radius:10px;background:rgba(255,255,255,.05)!important;text-align:left}
.bst-lesson-pick span{font-size:11.5px;color:rgba(255,255,255,.55)}
.bst-safetypane{position:relative;width:330px;flex:none;overflow:auto;padding:16px;border-left:1px solid rgba(255,255,255,.08);background:#10141d}
.bst-teacher{margin-top:12px;font-size:11.5px;color:rgba(255,255,255,.55)}
.bst-x{position:absolute;top:10px;right:10px;width:30px;height:30px;border-radius:8px;display:grid;place-items:center;background:rgba(255,255,255,.06)!important;z-index:2}
.bst-modal{position:fixed;inset:0;z-index:20;background:rgba(5,7,12,.72);display:grid;place-items:center;padding:20px}
.bst-sheet{position:relative;width:min(980px,100%);max-height:100%;overflow:auto;padding:24px;border-radius:20px;background:#141925;border:1px solid rgba(255,255,255,.1);box-shadow:0 40px 120px -30px rgba(0,0,0,.8)}
.bst-sheet h2{margin:0 0 14px;font:900 26px/1.1 var(--font-display,Outfit,sans-serif);letter-spacing:-.02em}
.bst-make{width:min(1100px,100%);height:min(88vh,900px)}
.bst-new{display:flex;gap:10px;flex-wrap:wrap}.bst-new button{display:flex;align-items:center;gap:8px;height:48px;padding:0 18px;border-radius:12px;background:rgba(255,140,0,.14)!important;border:1px dashed rgba(255,140,0,.5)!important;font-weight:700}
.bst-h{margin:18px 0 8px;font:700 11px/1 ui-monospace,monospace;letter-spacing:.16em;text-transform:uppercase;color:rgba(255,255,255,.5)}
.bst-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px}
.bst-cardbtn{position:relative;display:flex;flex-direction:column;align-items:flex-start;gap:5px;padding:14px;border-radius:14px;text-align:left;background:rgba(255,255,255,.04)!important;border:1px solid rgba(255,255,255,.08)!important;min-height:112px}
.bst-cardbtn:hover{border-color:#ff8c00!important}
.bst-cardbtn b{font-size:15px}.bst-cardbtn>span:last-child{font-size:12px;color:rgba(255,255,255,.6);line-height:1.4}
.bst-cardbtn.m-3d{box-shadow:inset 3px 0 0 #ff8c00}.bst-cardbtn.m-circuit,.bst-cardbtn.m-code{box-shadow:inset 3px 0 0 #00c2d8}.bst-cardbtn.m-lesson{box-shadow:inset 3px 0 0 #e64980}
.bst-badge{position:absolute;top:10px;right:10px;font:700 10px/1 ui-monospace,monospace;padding:4px 6px;border-radius:6px;background:rgba(255,255,255,.08)}
.bst-cardmode{display:flex;align-items:center;gap:5px;font-size:11px;color:rgba(255,255,255,.55)}
.bst-mine{display:flex;flex-wrap:wrap;gap:8px}.bst-mine button{display:flex;align-items:center;gap:8px;padding:8px 12px;border-radius:10px;background:rgba(255,255,255,.05)!important}.bst-mine span{color:rgba(255,255,255,.5);font-size:11px}
/* shared */
.bst .bs-h{margin:12px 0 6px;font:700 10.5px/1 ui-monospace,monospace;letter-spacing:.14em;text-transform:uppercase;color:rgba(255,255,255,.5)}
.bst .bs-tip{margin:10px 0 0;font-size:11.5px;line-height:1.45;color:rgba(255,255,255,.5)}
.bst .bs-card{padding:12px;border-radius:12px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.07);margin-bottom:10px}
.bst .bs-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:32px;padding:0 12px;border-radius:9px;background:rgba(255,255,255,.07)!important;font-weight:600}
.bst .bs-btn:hover:not(:disabled){background:rgba(255,255,255,.12)!important}
.bst .bs-btn.primary{background:#ff8c00!important;color:#1a1000}.bst .bs-btn.make{background:#1098ad!important;color:#fff}
.bst .bs-btn.run{background:#2f9e44!important;color:#fff;padding:0 16px}.bst .bs-btn.stop{background:#e03131!important;color:#fff;padding:0 16px}
.bst .bs-sep{width:1px;height:22px;background:rgba(255,255,255,.12);margin:0 4px;display:inline-block}
.bst .bs-num{display:flex;align-items:center;gap:4px;min-width:0}.bst .bs-num span{font-size:11px;color:rgba(255,255,255,.55);width:22px;flex:none}
.bst .bs-num input,.bst .bs-text,.bst .bs-name,.bst .bs-field select,.bst select{min-width:0;width:100%;height:28px;padding:0 6px;border-radius:7px;background:rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.12);color:#fff;font:inherit}
.bst .bs-name{font-weight:700;height:32px;margin-bottom:8px}
.bst .bs-row3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}
.bst .bs-seg{display:flex;gap:2px;padding:2px;border-radius:9px;background:rgba(0,0,0,.3)}.bst .bs-seg button{flex:1;height:28px;border-radius:7px;font-weight:600;color:rgba(255,255,255,.7)}
.bst .bs-seg button.on{background:#ff8c00;color:#1a1000}.bst .bs-seg button.on.hole{background:repeating-linear-gradient(45deg,#868e96 0 6px,#adb5bd 6px 12px);color:#111}
.bst .bs-range{display:flex;align-items:center;gap:8px;margin-top:8px}.bst .bs-range span{width:70px;font-size:11.5px;color:rgba(255,255,255,.6)}.bst .bs-range input{flex:1;accent-color:#ff8c00}.bst .bs-range b{width:46px;text-align:right;font-size:11.5px}
.bst .bs-field{display:flex;flex-direction:column;gap:4px;margin-top:8px}.bst .bs-field span{font-size:11px;color:rgba(255,255,255,.55)}
.bst .bs-swatches{display:flex;flex-wrap:wrap;gap:5px;align-items:center}.bst .bs-swatches button{width:22px;height:22px;border-radius:6px;border:2px solid transparent!important}.bst .bs-swatches button.on{border-color:#fff!important}.bst .bs-swatches input{width:28px;height:24px;padding:0;border:0;background:none}
/* 3D */
.bs3{flex:1;min-width:0;display:flex}
.bs3-palette{width:116px;flex:none;padding:10px 8px;overflow:auto;border-right:1px solid rgba(255,255,255,.08);background:#10141d}
.bs3-shapes{display:grid;grid-template-columns:1fr 1fr;gap:5px}
.bs3-shapes button{display:flex;flex-direction:column;align-items:center;gap:2px;padding:7px 2px 6px;border-radius:10px;background:rgba(255,255,255,.04)!important;color:var(--c)!important;font-size:10.5px}
.bs3-shapes button span{color:rgba(255,255,255,.8)}.bs3-shapes button:hover{background:rgba(255,255,255,.1)!important}
.bs3-main{flex:1;min-width:0;display:flex;flex-direction:column}
.bs3-toolbar{display:flex;align-items:center;gap:2px;flex-wrap:wrap;padding:5px 8px;border-bottom:1px solid rgba(255,255,255,.08);background:#121620}
.bs-tool{display:flex;align-items:center;gap:5px;height:30px;padding:0 8px;border-radius:7px;color:rgba(255,255,255,.8)!important}
.bs-tool span{font-size:12px}.bs-tool:hover:not(:disabled){background:rgba(255,255,255,.08)!important}.bs-tool.on{background:rgba(255,140,0,.2)!important;color:#ffb347!important}
@container (max-width:1100px){.bs-tool span{display:none}}
.bs3-main{container-type:inline-size}
.bs-pop{position:relative}.bs-menu{position:absolute;top:34px;left:0;z-index:5;padding:8px;border-radius:10px;background:#1b2130;border:1px solid rgba(255,255,255,.12);box-shadow:0 20px 40px rgba(0,0,0,.5);min-width:260px}
.bs-menu-row{display:flex;align-items:center;gap:4px;margin:3px 0}.bs-menu-row b{width:84px;font-size:11.5px;color:rgba(255,255,255,.6)}.bs-menu-row button{padding:4px 8px;border-radius:6px;background:rgba(255,255,255,.07)!important;font-size:12px}
.bs-snap{display:flex;align-items:center;gap:4px;color:rgba(255,255,255,.7)}.bs-snap select{width:76px!important}
.bs3-view{position:relative;flex:1;min-height:0;overflow:hidden;touch-action:none}
.bs3-dims{position:absolute;top:10px;left:50%;transform:translateX(-50%);padding:5px 12px;border-radius:999px;background:rgba(18,22,32,.85);color:#fff;font:600 12px/1.2 ui-monospace,monospace;pointer-events:none;white-space:nowrap}
.bs3-empty{position:absolute;inset:auto 0 18% 0;text-align:center;color:#5c6b80;font:700 18px/1 var(--font-display,Outfit,sans-serif);pointer-events:none}
.bs3-side{width:268px;flex:none;overflow:auto;padding:10px;border-left:1px solid rgba(255,255,255,.08);background:#10141d}
.bs-print-h{display:flex;width:100%;justify-content:space-between;align-items:center}
.bs-print-h span{font-size:11px;padding:3px 8px;border-radius:999px}.bs-print-h .ok{background:rgba(47,158,68,.25);color:#8ce99a}.bs-print-h .warn{background:rgba(250,176,5,.2);color:#ffd43b}.bs-print-h .bad{background:rgba(224,49,49,.25);color:#ffa8a8}
.bs-print-sum{margin-top:6px;font-size:11.5px;color:rgba(255,255,255,.6)}
.bs-findings{margin:8px 0 0;padding:0;list-style:none;display:flex;flex-direction:column;gap:5px}.bs-findings li{font-size:11.5px;line-height:1.4;padding:6px 8px;border-radius:7px;background:rgba(255,255,255,.04)}
.bs-findings li.error{background:rgba(224,49,49,.16);color:#ffc9c9}.bs-findings li.warn{background:rgba(250,176,5,.12);color:#ffec99}
.bs-export{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}.bs-export .make{flex-basis:100%}
.bs-gate{margin:8px 0 0;font-size:11.5px;color:#ffd43b}
/* circuits */
.bc{flex:1;min-width:0;display:flex}
.bc-palette{width:150px;flex:none;padding:10px;overflow:auto;border-right:1px solid rgba(255,255,255,.08);background:#10141d}
.bc-tools{display:flex;gap:4px}.bc-tools button{flex:1;display:flex;align-items:center;justify-content:center;gap:4px;height:30px;border-radius:8px;background:rgba(255,255,255,.05)!important}
.bc-tools button.on,.bc-parts button.on{background:rgba(255,140,0,.22)!important;color:#ffb347!important}
.bc-wirecolors{display:flex;flex-wrap:wrap;gap:4px;margin-top:8px}.bc-wirecolors button{width:16px;height:16px;border-radius:4px;border:2px solid transparent!important}.bc-wirecolors button.on{border-color:#fff!important}
.bc-parts{display:flex;flex-direction:column;gap:3px}.bc-parts button{text-align:left;padding:6px 8px;border-radius:7px;background:rgba(255,255,255,.04)!important;font-size:12px}
.bc-main{flex:1;min-width:0;display:flex;flex-direction:column}
.bc-runbar{display:flex;align-items:center;gap:6px;padding:6px 10px;border-bottom:1px solid rgba(255,255,255,.08);background:#121620}
.bc-speed{display:flex;align-items:center;gap:4px;color:rgba(255,255,255,.7)}.bc-speed select{width:64px!important}
.bc-clock{font:600 12px ui-monospace,monospace;color:#8ce99a;margin-left:6px}
.bc-board-wrap{position:relative;flex:1;min-height:0;overflow:auto;background:#161b26}
.bc-svg{width:100%;height:100%;min-width:640px;display:block;user-select:none;touch-action:none}
.bc-hole{cursor:crosshair}.bc-hole:hover{fill:#ff8c00}
.bc-pad{cursor:crosshair}.bc-wire{cursor:pointer}.bc-ref{fill:#495057;font-weight:700;pointer-events:none}
.bc-inspector{position:absolute;right:10px;top:10px;width:230px;padding:12px;border-radius:12px;background:rgba(20,25,37,.96);border:1px solid rgba(255,255,255,.12);box-shadow:0 20px 40px rgba(0,0,0,.4)}
.bc-inspector p{margin:6px 0;font-size:11.5px;line-height:1.45;color:rgba(255,255,255,.65)}.bc-safe{color:#ffd43b!important}
.bc-colors{display:flex;gap:5px}.bc-colors button{width:24px;height:24px;border-radius:50%;border:2px solid transparent!important}.bc-colors button.on{border-color:#fff!important}
.bc-meter{font:600 12px ui-monospace,monospace;color:#8ce99a!important}
.bc-bottom{height:170px;flex:none;display:flex;gap:10px;padding:8px 10px;border-top:1px solid rgba(255,255,255,.08);background:#10141d}
.bc-serial{flex:1;min-width:0;display:flex;flex-direction:column}.bc-serial .bs-h{margin-top:2px}
.bc-serial pre{flex:1;margin:0;padding:8px;border-radius:8px;background:#05070b;color:#8ce99a;font:12px/1.45 ui-monospace,monospace;overflow:auto;white-space:pre-wrap}
.bc-notes{width:40%;max-width:420px;overflow:auto;display:flex;flex-direction:column;gap:5px}
.bc-note{font-size:11.5px;line-height:1.4;padding:7px 9px;border-radius:8px;background:rgba(255,255,255,.04)}.bc-note.warn{background:rgba(224,49,49,.16);color:#ffc9c9}.bc-note.hint{background:rgba(250,176,5,.12);color:#ffec99}.bc-note.ok{color:#8ce99a}
.bc-code{width:440px;flex:none;border-left:1px solid rgba(255,255,255,.08);background:#10141d;display:flex;min-height:0}
/* blocks */
.be{flex:1;min-width:0;display:flex;flex-direction:column;min-height:0}
.be-tabs{display:flex;gap:2px;padding:6px;border-bottom:1px solid rgba(255,255,255,.08)}.be-tabs button{flex:1;height:30px;border-radius:8px;font-weight:600;color:rgba(255,255,255,.65)}.be-tabs button.on{background:rgba(255,255,255,.1);color:#fff}
.be-body{flex:1;min-height:0;display:flex}
.be-shelf{width:132px;flex:none;overflow:auto;padding:8px 6px;border-right:1px solid rgba(255,255,255,.06)}
.be-cat-h{font:700 10px/1 ui-monospace,monospace;letter-spacing:.12em;text-transform:uppercase;margin:10px 2px 5px}
.be-chip{display:block;width:100%;text-align:left;margin-bottom:3px;padding:5px 8px;border-radius:7px;font-size:11.5px;background:var(--bc)!important;color:#fff!important;font-weight:600;box-shadow:inset 0 -2px 0 rgba(0,0,0,.2);cursor:grab!important}
.be-script{flex:1;min-width:0;overflow:auto;padding:10px}
.be-hat{display:inline-block;padding:6px 12px 8px;border-radius:12px 12px 4px 4px;font-weight:800;color:#fff;margin-top:6px}.be-hat.setup{background:#0b7285}.be-hat.loop{background:#5f3dc4}
.be-list{min-height:22px;padding:2px 0 2px 6px;border-left:3px solid rgba(255,255,255,.08);border-radius:0 0 0 6px}
.be-list.target{border-left-color:#ff8c00}
.be-zone{height:6px;margin:1px 0;border-radius:3px}.be-zone.on{height:14px;background:rgba(255,140,0,.45)}
.be-empty{font-size:11.5px;color:rgba(255,255,255,.35);padding:6px 4px;font-style:italic}
.be-block{background:var(--bc);border-radius:8px;color:#fff;box-shadow:inset 0 -2px 0 rgba(0,0,0,.22);cursor:grab}
.be-block.running{outline:2px solid #fff;outline-offset:1px;box-shadow:0 0 0 5px rgba(255,255,255,.18)}
.be-row{display:flex;align-items:center;flex-wrap:wrap;gap:4px;padding:5px 6px;font-weight:600;font-size:12px}
.be-grip{opacity:.6;flex:none}.be-del{margin-left:auto;width:18px;height:18px;border-radius:5px;display:grid;place-items:center;opacity:.6}.be-del:hover{opacity:1;background:rgba(0,0,0,.25)!important}
.be-inner{margin:0 0 6px 10px;padding:4px 6px 4px 0;background:rgba(0,0,0,.18);border-radius:6px}
.be-else{padding:3px 6px;font-weight:700}
.be-expr{display:inline-flex;align-items:center;gap:3px;flex-wrap:wrap;padding:2px 4px;border-radius:999px;background:rgba(0,0,0,.22)}
.be-num,.be-var,.be-text{height:22px;padding:0 6px;border-radius:999px;border:0;background:#fff;color:#111;font:600 12px/1 inherit}
.be-text{width:140px;border-radius:6px}.be-pin,.be-op{width:auto!important;height:22px!important;padding:0 4px!important;border-radius:6px!important;background:#fff!important;color:#111!important;border:0!important;font-weight:600}
.be-swap{position:relative}.be-swap>button{width:16px;height:16px;border-radius:50%;display:grid;place-items:center;background:rgba(255,255,255,.25)!important}
.be-swap-menu{position:absolute;z-index:10;top:18px;left:0;display:flex;flex-direction:column;min-width:170px;padding:4px;border-radius:8px;background:#1b2130;box-shadow:0 12px 30px rgba(0,0,0,.5)}
.be-swap-menu button{text-align:left;padding:5px 8px;border-radius:6px;font-weight:500}.be-swap-menu button:hover{background:rgba(255,255,255,.08)!important}
.be-mini{padding:2px 7px;border-radius:999px;background:rgba(0,0,0,.25)!important;font-size:10.5px}.be-addelse{margin:2px 0 4px 8px}
.be-check{display:inline-flex;align-items:center;gap:3px;font-size:11px}
.be-tip{font-size:11px;color:rgba(255,255,255,.4);margin-top:14px}
.be-code{flex:1;min-height:0;display:flex;flex-direction:column}
.be-code-bar{display:flex;align-items:center;gap:6px;padding:6px 8px;font-size:11.5px;color:rgba(255,255,255,.6)}.be-code-bar span{flex:1}.be-code-bar button{display:flex;align-items:center;gap:4px;padding:4px 8px;border-radius:6px;background:rgba(255,255,255,.07)!important}
.be-code pre{flex:1;margin:0;padding:12px;overflow:auto;background:#05070b;color:#d0ebff;font:12px/1.5 ui-monospace,monospace}
@media (max-width:1100px){.bc-code{width:360px}.bst-actions>button span{display:none}.bst-title{width:130px}}
@media (max-width:820px){.bst-top{flex-wrap:wrap;height:auto;padding:8px}.bst-body{flex-direction:column;overflow:auto}.bs3,.bc{flex-direction:column}.bs3-palette,.bc-palette{width:auto;border-right:0}.bs3-shapes{grid-template-columns:repeat(5,1fr)}.bs3-view{min-height:360px}.bs3-side,.bc-code,.bst-lesson,.bst-safetypane{width:auto}.bc-code{min-height:420px}.bst-brand span:last-child{display:none}}
`;
