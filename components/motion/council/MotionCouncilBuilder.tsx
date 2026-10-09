// MotionCouncilBuilder — give the Motion Council your assets, say what you want, and it BUILDS options in the host
// editor (Fabula). Three modes:
//   BUILD    — pick sources from the media pool, describe the piece, see the cast crew, get N options. Each option is
//              led by one crew member (their grammar: pace, in-cut move, look, effects, transition, title), carries
//              one counterpoint from a rival and is edited to the beat by a council director. Build places it on the
//              timeline as ONE undo step; "Swap in" replaces the last council build with another option.
//   RECIPES  — the council's recipe library (one per roster member + director) and your saved recipes; rebuild any
//              recipe on the selected sources. Any built option can be saved as a recipe.
//   PLATFORM — every platform lower third / full page / broadcast pack with the council's motion direction (lead,
//              counterpoint, editor, timing, notes); add one to the timeline.
// The host owns the timeline: it receives a BuildOption + the bound assets and commits. See services/motion/council/
// motionBuild.ts (engine), motionTemplates.ts (recipes + platform direction).
import React, { useEffect, useMemo, useState } from 'react';
import { Hammer, Loader2, Check, Save, Layers, BookOpen, Film, Image as ImageIcon, Music, X, Pin, BookUser, Repeat, Plus, Search } from 'lucide-react';
import { planBuild, leadsFor, type BuildAsset, type BuildOption, type BuildCatalog, type BuildBrief } from '../../../services/motion/council/motionBuild';
import { councilRecipeTemplates, listSavedRecipeTemplates, saveRecipeTemplate, deleteRecipeTemplate, templateFromOption, buildFromTemplate, searchRecipeTemplates, platformTemplateDirections, type RecipeTemplate, type TemplateDirection } from '../../../services/motion/council/motionTemplates';
import { rosterMember } from '../../../services/motion/council/motionRoster';
import { speakerName } from '../../../services/motion/council/motionCouncilService';
import { LOWER_THIRDS } from '../../../services/fabula/lowerThirdRegistry';
import { FABULA_BROADCAST_PACKS } from '../../../services/fabula/broadcastPacks';
import MotionRosterBrowser, { GUILD_HUE } from './MotionRosterBrowser';

const AC = '#3DD6FF';
const AC_SOFT = '#B6ECFF';
const hueOf = (id?: string) => { const m = id ? rosterMember(id) : undefined; return m ? GUILD_HUE[m.guild] : AC_SOFT; };
const SLOT_HUES = ['#3DD6FF', '#FF6FA8', '#FFC23D', '#3DFFA0', '#B57CFF', '#FF7A45', '#7C8CFF', '#C98B5A'];

type Mode = 'build' | 'recipes' | 'platform';
type Placement = 'end' | 'playhead';

export interface MotionCouncilBuilderProps {
  assets: BuildAsset[];
  /** pre-selected sources (e.g. the selected clip's asset) */
  initialSelected?: string[];
  fps: number;
  aspect?: string;
  catalog: BuildCatalog;
  initialAsk?: string;
  /** commit an option on the timeline; return the build id, or false when it could not be placed */
  onBuild: (opt: BuildOption, sources: BuildAsset[], placement: Placement, replaceBuildId?: string) => string | false;
  /** add a platform template (lower third / full page / broadcast pack) with the council's direction */
  onAddPlatformTemplate?: (d: TemplateDirection) => boolean | void;
}

export default function MotionCouncilBuilder({ assets, initialSelected = [], fps, aspect, catalog, initialAsk, onBuild, onAddPlatformTemplate }: MotionCouncilBuilderProps) {
  const [mode, setMode] = useState<Mode>('build');
  const [selected, setSelected] = useState<string[]>(() => initialSelected.filter(id => assets.some(a => a.id === id)));
  const [ask, setAsk] = useState(initialAsk || '');
  const [tempo, setTempo] = useState('120');
  const [count, setCount] = useState(3);
  const [placement, setPlacement] = useState<Placement>('end');
  const [pinned, setPinned] = useState<string[]>([]);
  const [showRoster, setShowRoster] = useState(false);
  const [assetQ, setAssetQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [options, setOptions] = useState<BuildOption[] | null>(null);
  const [lastBuild, setLastBuild] = useState<{ optId: string; buildId: string } | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [saveName, setSaveName] = useState('');
  const [savedTick, setSavedTick] = useState(0);
  const [recipeQ, setRecipeQ] = useState('');
  const [platQ, setPlatQ] = useState('');
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => { if (initialSelected.length && !selected.length) setSelected(initialSelected.filter(id => assets.some(a => a.id === id))); }, [initialSelected.join('|')]); // eslint-disable-line react-hooks/exhaustive-deps

  const sources = useMemo(() => selected.map(id => assets.find(a => a.id === id)).filter(Boolean) as BuildAsset[], [selected, assets]);
  const bpm = Math.max(40, Math.min(240, parseInt(tempo, 10) || 120));
  const brief: BuildBrief = useMemo(() => ({ ask: ask.trim() || 'a short piece from these sources', assets: sources, fps, aspect, tempo: bpm, optionCount: count, crew: pinned.length ? [...pinned, ...leadsFor({ ask, assets: sources, fps, optionCount: count }).crew.filter(id => !pinned.includes(id))].slice(0, Math.max(count, pinned.length)) : undefined }), [ask, sources, fps, aspect, bpm, count, pinned]);
  const crew = useMemo(() => leadsFor(brief).leads, [brief]);
  const visualsChosen = sources.some(a => a.type !== 'audio');

  const flash = (m: string) => { setNote(m); window.setTimeout(() => setNote(n => (n === m ? null : n)), 2600); };
  const toggle = (id: string) => setSelected(s => (s.includes(id) ? s.filter(x => x !== id) : [...s, id]));
  const run = async () => {
    if (busy || !visualsChosen) return;
    setBusy(true); setOptions(null); setLastBuild(null);
    try { setOptions(await planBuild(brief, catalog)); } finally { setBusy(false); }
  };
  const build = (opt: BuildOption, swap: boolean) => {
    const id = onBuild(opt, sources, placement, swap ? lastBuild?.buildId : undefined);
    if (id) { setLastBuild({ optId: opt.id, buildId: id }); flash(`${swap ? 'Swapped in' : 'Built'}: ${opt.title}`); }
  };
  const saveRecipe = (opt: BuildOption) => {
    saveRecipeTemplate(templateFromOption(opt, saveName || opt.title, brief));
    setSaving(null); setSaveName(''); setSavedTick(t => t + 1); flash('Saved to your motion recipes');
  };

  const pool = useMemo(() => {
    const q = assetQ.trim().toLowerCase();
    return assets.filter(a => !q || a.name.toLowerCase().includes(q) || String(a.type).includes(q)).slice(0, 120);
  }, [assets, assetQ]);
  const recipes = useMemo(() => (recipeQ.trim() ? searchRecipeTemplates(recipeQ) : [...listSavedRecipeTemplates(), ...councilRecipeTemplates()]), [recipeQ, savedTick]);
  const directions = useMemo(() => platformTemplateDirections(LOWER_THIRDS as any, FABULA_BROADCAST_PACKS as any), []);
  const platList = useMemo(() => {
    const q = platQ.trim().toLowerCase();
    return directions.filter(d => !q || [d.templateName, d.templateId, d.family, speakerName(d.lead), speakerName(d.counterpoint)].join(' ').toLowerCase().includes(q));
  }, [directions, platQ]);

  return (
    <div className="rounded-2xl border border-white/10 bg-[#0c0f14] p-4 text-white">
      <div className="flex items-center gap-2 mb-3">
        <Hammer size={15} style={{ color: AC }} />
        <span className="text-[11px] font-black uppercase tracking-[0.25em] text-white/70">Council Builder</span>
        <div className="ml-auto flex gap-1">
          {([['build', 'Build', Hammer], ['recipes', 'Recipes', BookOpen], ['platform', 'Platform templates', Layers]] as const).map(([id, label, Icon]) => (
            <button key={id} onClick={() => setMode(id)} className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest rounded-full px-2.5 py-1 border"
              style={mode === id ? { color: '#04121a', background: AC, borderColor: AC } : { color: 'rgba(255,255,255,0.55)', borderColor: 'rgba(255,255,255,0.12)' }}>
              <Icon size={11} /> {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── sources (shared by BUILD and RECIPES) ── */}
      {mode !== 'platform' && (
        <div className="rounded-xl border border-white/8 bg-white/[0.015] p-2.5 mb-3">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[9px] font-black uppercase tracking-widest text-white/45">Sources · {sources.length} chosen</span>
            <div className="ml-auto flex items-center gap-1 bg-white/5 border border-white/10 rounded-md px-1.5 py-0.5">
              <Search size={10} className="text-white/35" />
              <input value={assetQ} onChange={e => setAssetQ(e.target.value)} placeholder="filter pool" className="w-28 bg-transparent text-[10px] text-white outline-none placeholder:text-white/25" />
            </div>
            {sources.length > 0 && <button onClick={() => setSelected([])} className="text-[9px] uppercase tracking-widest text-white/35 hover:text-white/70">clear</button>}
          </div>
          {assets.length === 0
            ? <p className="text-[11px] text-white/35">The media pool is empty — import footage, stills or music first, then give them to the council.</p>
            : (
              <div className="flex flex-wrap gap-1 max-h-[96px] overflow-y-auto">
                {pool.map(a => {
                  const on = selected.includes(a.id); const n = selected.indexOf(a.id);
                  const Icon = a.type === 'audio' ? Music : a.type === 'video' ? Film : ImageIcon;
                  return (
                    <button key={a.id} onClick={() => toggle(a.id)} title={`${a.name} · ${a.type}${a.duration ? ` · ${a.duration.toFixed(1)}s` : ''}`}
                      className="flex items-center gap-1 text-[10px] rounded-md pl-1.5 pr-2 py-1 border max-w-[180px]"
                      style={on ? { color: '#04121a', background: a.type === 'audio' ? '#3DFFA0' : SLOT_HUES[n % SLOT_HUES.length], borderColor: 'transparent' } : { color: 'rgba(255,255,255,0.65)', borderColor: 'rgba(255,255,255,0.1)' }}>
                      <Icon size={10} className="shrink-0" /><span className="truncate">{a.name}</span>
                    </button>
                  );
                })}
              </div>
            )}
          {sources.length > 0 && !visualsChosen && <p className="text-[10px] text-amber-300/70 mt-1.5">Add at least one video, still or graphic — audio alone becomes the bed under the pictures.</p>}
        </div>
      )}

      {mode === 'build' && (
        <>
          <textarea value={ask} onChange={e => setAsk(e.target.value)} rows={2}
            placeholder={'Describe what you want, e.g. a 15 second anime-style opener titled "NIGHT MARKET", hits on the drop'}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-[13px] text-white placeholder:text-white/25 outline-none mb-2 resize-none" />
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <div className="flex items-center gap-1 bg-white/5 border border-white/10 rounded-lg px-2 py-1">
              <input value={tempo} onChange={e => setTempo(e.target.value.replace(/[^0-9]/g, ''))} inputMode="numeric" className="w-9 bg-transparent text-[11px] font-bold text-white outline-none" />
              <span className="text-[9px] text-white/30 uppercase tracking-widest">bpm</span>
            </div>
            <select value={String(count)} onChange={e => setCount(parseInt(e.target.value, 10))} className="bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-[11px] font-bold text-white outline-none">
              {[2, 3, 4, 5].map(n => <option key={n} value={n} className="bg-[#0c0f14]">{n} options</option>)}
            </select>
            <select value={placement} onChange={e => setPlacement(e.target.value as Placement)} className="bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-[11px] font-bold text-white outline-none">
              <option value="end" className="bg-[#0c0f14]">Build at end of timeline</option>
              <option value="playhead" className="bg-[#0c0f14]">Build at playhead</option>
            </select>
            <button onClick={run} disabled={busy || !visualsChosen} className="ml-auto h-8 px-4 rounded-full text-[10px] font-black uppercase tracking-widest disabled:opacity-40 flex items-center gap-1.5" style={{ background: AC, color: '#04121a' }}>
              {busy ? <><Loader2 size={13} className="animate-spin" /> The council is building…</> : <><Hammer size={13} /> Build options</>}
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-1 mb-3">
            <span className="text-[9px] font-black uppercase tracking-widest text-white/40 mr-1">Leads</span>
            {crew.map(id => (
              <span key={id} className="flex items-center gap-1 text-[10px] font-bold rounded-full pl-2 pr-1 py-0.5" style={{ color: hueOf(id), background: `${hueOf(id)}14`, border: `1px solid ${hueOf(id)}40` }}>
                {pinned.includes(id) && <Pin size={9} />}{speakerName(id).replace(/^The /, '')}
                {pinned.includes(id) && <button onClick={() => setPinned(p => p.filter(x => x !== id))} className="opacity-60 hover:opacity-100"><X size={10} /></button>}
              </span>
            ))}
            <button onClick={() => setShowRoster(v => !v)} className="ml-auto flex items-center gap-1 text-[9px] font-black uppercase tracking-widest rounded-full px-2 py-1" style={{ color: AC, background: `${AC}14`, border: `1px solid ${AC}40` }}>
              <BookUser size={11} /> {showRoster ? 'Hide roster' : 'Choose leads'}
            </button>
          </div>
          {showRoster && <div className="mb-3"><MotionRosterBrowser pinned={pinned} onTogglePin={id => setPinned(p => (p.includes(id) ? p.filter(x => x !== id) : [...p, id]))} crew={crew} /></div>}

          {options && options.length === 0 && <p className="text-[11px] text-white/40">Nothing to build — choose at least one visual source.</p>}
          {options && options.length > 0 && (
            <div className="space-y-2">
              {options.map(o => (
                <OptionCard key={o.id} o={o} sources={sources} built={lastBuild?.optId === o.id} canSwap={!!lastBuild && lastBuild.optId !== o.id}
                  onBuild={() => build(o, false)} onSwap={() => build(o, true)}
                  saving={saving === o.id} saveName={saveName} setSaveName={setSaveName}
                  onStartSave={() => { setSaving(o.id); setSaveName(o.title); }} onSave={() => saveRecipe(o)} onCancelSave={() => setSaving(null)} />
              ))}
              <p className="text-[9px] text-white/30 uppercase tracking-widest">{options[0].source === 'ai' ? 'the model chose, the engine built' : 'built locally from the roster grammar'} · each build is one undo step</p>
            </div>
          )}
        </>
      )}

      {mode === 'recipes' && (
        <div>
          <div className="flex items-center gap-1.5 bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 mb-2">
            <Search size={12} className="text-white/35" />
            <input value={recipeQ} onChange={e => setRecipeQ(e.target.value)} placeholder="Search recipes — claymation, 80s, ink wash, sports…" className="flex-1 bg-transparent text-[12px] text-white outline-none placeholder:text-white/25" />
          </div>
          <div className="max-h-[420px] overflow-y-auto space-y-1 pr-1">
            {recipes.map(t => (
              <RecipeRow key={t.id} t={t} disabled={!visualsChosen}
                onBuild={() => { const opt = buildFromTemplate(t, { ...brief, ask: ask.trim() || t.name }); build(opt, false); }}
                onDelete={t.origin === 'user' ? () => { deleteRecipeTemplate(t.id); setSavedTick(x => x + 1); } : undefined} />
            ))}
          </div>
          {!visualsChosen && <p className="text-[10px] text-white/35 mt-2">Choose sources above, then build any recipe on them.</p>}
        </div>
      )}

      {mode === 'platform' && (
        <div>
          <div className="flex items-center gap-1.5 bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 mb-2">
            <Search size={12} className="text-white/35" />
            <input value={platQ} onChange={e => setPlatQ(e.target.value)} placeholder={`Search ${directions.length} platform templates by name, family or director…`} className="flex-1 bg-transparent text-[12px] text-white outline-none placeholder:text-white/25" />
          </div>
          <div className="max-h-[460px] overflow-y-auto space-y-1 pr-1">
            {platList.map(d => <DirectionRow key={d.templateId} d={d} onAdd={onAddPlatformTemplate ? () => { if (onAddPlatformTemplate(d) !== false) flash(`Added ${d.templateName}`); } : undefined} />)}
          </div>
        </div>
      )}

      {note && <div className="mt-3 text-[11px] font-bold rounded-lg px-3 py-1.5" style={{ color: AC, background: `${AC}14`, border: `1px solid ${AC}33` }}><Check size={11} className="inline mr-1" />{note}</div>}
    </div>
  );
}

// ─────────────────────────────── pieces ───────────────────────────────

function Strip({ o, sources }: { o: BuildOption; sources: BuildAsset[] }) {
  const R = o.recipe; const T = Math.max(0.001, R.duration);
  const visuals = sources.filter(a => a.type !== 'audio');
  const lane = (role: string) => R.clips.filter(c => c.role === role);
  const pct = (x: number) => `${(x / T) * 100}%`;
  return (
    <div className="relative rounded-md bg-black/40 border border-white/8 p-1 space-y-[3px]">
      {lane('title').length > 0 && (
        <div className="relative h-3">{lane('title').map((c, i) => <div key={i} className="absolute h-full rounded-sm text-[7px] font-black uppercase tracking-widest text-black/70 px-1 truncate" style={{ left: pct(c.start), width: pct(c.duration), background: AC_SOFT }}>{c.title?.text}</div>)}</div>
      )}
      <div className="relative h-5">
        {lane('picture').map((c, i) => (
          <div key={i} title={`${c.label} · ${c.duration.toFixed(2)}s`} className="absolute h-full rounded-[2px] border-r border-black/60"
            style={{ left: pct(c.start), width: pct(c.duration), background: SLOT_HUES[(c.slot ?? 0) % SLOT_HUES.length], opacity: 0.85, outline: c.counterpoint ? '2px solid #FFC23D' : undefined }}>
            {c.trans && <span className="absolute left-0 top-0 h-full w-[3px] bg-white/80" />}
          </div>
        ))}
      </div>
      {(lane('music').length > 0 || lane('sourceAudio').length > 0) && (
        <div className="relative h-2">{[...lane('music'), ...lane('sourceAudio')].map((c, i) => <div key={i} className="absolute h-full rounded-sm" style={{ left: pct(c.start), width: pct(c.duration), background: c.role === 'music' ? '#3DFFA0' : '#3DFFA066' }} />)}</div>
      )}
      <div className="flex justify-between text-[8px] font-mono text-white/30 pt-0.5"><span>0s</span><span>{visuals.length} source{visuals.length === 1 ? '' : 's'} · {R.bpm} BPM</span><span>{R.duration.toFixed(1)}s</span></div>
    </div>
  );
}

function OptionCard({ o, sources, built, canSwap, onBuild, onSwap, saving, saveName, setSaveName, onStartSave, onSave, onCancelSave }: {
  o: BuildOption; sources: BuildAsset[]; built: boolean; canSwap: boolean; onBuild: () => void; onSwap: () => void;
  saving: boolean; saveName: string; setSaveName: (s: string) => void; onStartSave: () => void; onSave: () => void; onCancelSave: () => void;
}) {
  const hue = hueOf(o.leadId);
  return (
    <div className="rounded-xl border bg-white/[0.02] p-3" style={{ borderColor: built ? `${hue}88` : 'rgba(255,255,255,0.08)' }}>
      <div className="flex items-baseline gap-2 mb-1 flex-wrap">
        <span className="text-[12px] font-black uppercase tracking-widest" style={{ color: hue }}>{o.title}</span>
        <span className="text-[10px] text-white/40">lead {speakerName(o.leadId).replace(/^The /, '')}{o.counterId ? ` · counterpoint ${speakerName(o.counterId).replace(/^The /, '')}` : ''} · editor {speakerName(o.editorId).replace(/^The /, '')}</span>
      </div>
      <p className="text-[11.5px] text-white/65 italic leading-snug mb-2">{o.rationale}</p>
      <Strip o={o} sources={sources} />
      <ul className="mt-2 grid gap-0.5">{o.summary.map((s, i) => <li key={i} className="text-[10.5px] text-white/55 flex gap-1.5"><span style={{ color: hue }}>▸</span>{s}</li>)}</ul>
      <div className="flex items-center gap-2 mt-2.5 flex-wrap">
        {built
          ? <span className="text-[9px] font-black uppercase tracking-widest text-[#3DFFC0] flex items-center gap-1"><Check size={11} /> on the timeline</span>
          : <button onClick={canSwap ? onSwap : onBuild} className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest rounded-full px-3 py-1.5" style={{ color: '#04121a', background: hue }}>
              {canSwap ? <><Repeat size={11} /> Swap in</> : <><Hammer size={11} /> Build this</>}
            </button>}
        {canSwap && !built && <button onClick={onBuild} className="text-[9px] font-black uppercase tracking-widest text-white/45 hover:text-white">or build alongside</button>}
        {saving
          ? <span className="flex items-center gap-1 ml-auto">
              <input autoFocus value={saveName} onChange={e => setSaveName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') onSave(); if (e.key === 'Escape') onCancelSave(); }}
                className="w-40 bg-white/5 border border-white/15 rounded-md px-2 py-1 text-[11px] text-white outline-none" />
              <button onClick={onSave} className="text-[9px] font-black uppercase tracking-widest rounded px-2 py-1" style={{ color: AC, border: `1px solid ${AC}55` }}>Save</button>
              <button onClick={onCancelSave} className="text-white/40 hover:text-white"><X size={12} /></button>
            </span>
          : <button onClick={onStartSave} className="ml-auto flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-white/45 hover:text-white"><Save size={11} /> Save as recipe</button>}
      </div>
    </div>
  );
}

function RecipeRow({ t, disabled, onBuild, onDelete }: { t: RecipeTemplate; disabled: boolean; onBuild: () => void; onDelete?: () => void }) {
  const hue = hueOf(t.leadId);
  return (
    <div className="flex items-center gap-2 rounded-lg border border-white/6 bg-white/[0.02] px-2 py-1.5">
      <span className="w-1.5 h-7 rounded-full shrink-0" style={{ background: hue }} />
      <div className="flex-1 min-w-0">
        <div className="text-[12px] font-bold text-white/85 truncate">{t.name}{t.origin === 'user' && <span className="ml-1.5 text-[8px] font-black uppercase tracking-widest" style={{ color: AC }}>yours</span>}</div>
        <div className="text-[9px] uppercase tracking-widest text-white/35 truncate">{t.council.lead.replace(/^The /, '')}{t.council.counterpoint ? ` vs ${t.council.counterpoint.replace(/^The /, '')}` : ''}{t.era ? ` · ${t.era}` : ''} · {t.tags.slice(0, 3).join(' · ')}</div>
      </div>
      {onDelete && <button onClick={onDelete} title="Delete recipe" className="text-white/30 hover:text-red-300"><X size={12} /></button>}
      <button disabled={disabled} onClick={onBuild} className="shrink-0 flex items-center gap-1 text-[9px] font-black uppercase tracking-widest rounded-full px-2.5 py-1 disabled:opacity-30" style={{ color: hue, border: `1px solid ${hue}55` }}>
        <Hammer size={10} /> Build
      </button>
    </div>
  );
}

function DirectionRow({ d, onAdd }: { d: TemplateDirection; onAdd?: () => void }) {
  const [open, setOpen] = useState(false);
  const hue = hueOf(d.lead);
  return (
    <div className="rounded-lg border border-white/6 bg-white/[0.02]">
      <div className="flex items-center gap-2 px-2 py-1.5">
        <span className="w-1.5 h-7 rounded-full shrink-0" style={{ background: hue }} />
        <button onClick={() => setOpen(v => !v)} className="flex-1 min-w-0 text-left">
          <div className="text-[12px] font-bold text-white/85 truncate">{d.templateName} <span className="text-[8px] font-black uppercase tracking-widest text-white/30 ml-1">{d.family}</span></div>
          <div className="text-[9px] uppercase tracking-widest truncate" style={{ color: `${hue}cc` }}>{speakerName(d.lead).replace(/^The /, '')}{d.counterpoint ? ` · vs ${speakerName(d.counterpoint).replace(/^The /, '')}` : ''} · edit {speakerName(d.editor).replace(/^The /, '')}</div>
        </button>
        <span className="text-[9px] font-mono text-white/35 shrink-0">{d.timing.fps}fps · {d.timing.on === 'mixed' ? '1s+2s' : `on ${d.timing.on}s`} · {d.timing.ease}</span>
        {onAdd && <button onClick={onAdd} className="shrink-0 flex items-center gap-1 text-[9px] font-black uppercase tracking-widest rounded-full px-2.5 py-1" style={{ color: hue, border: `1px solid ${hue}55` }}><Plus size={10} /> Add</button>}
      </div>
      {open && <ul className="px-4 pb-2 space-y-0.5">{d.notes.map((n, i) => <li key={i} className="text-[10.5px] text-white/55 leading-snug">{n}</li>)}<li className="text-[10px] font-mono text-white/35">enter {d.timing.enterSec}s · hold {d.timing.holdSec}s</li></ul>}
    </div>
  );
}
