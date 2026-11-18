// Story tab (docs/game-studio-unified-plan.md §7a): Story Intelligence breaks a story into a game, the
// author reads it as cards per act, the canon reviews it, and Build turns it into levels and rules. The
// story lives on the project (op setStory), so it undoes, saves to the cloud and versions with the game.
// Also: RulesPanel, the level's rules as sentences.

import React, { useMemo, useState } from 'react';
import { BookOpen, ChevronDown, ChevronRight, Hammer, Lightbulb, Sparkles, Trash2, TriangleAlert } from 'lucide-react';
import type { Op } from '../../services/gamestudio/ops';
import type { GameLevel, GameProject, Rule, TemplateId } from '../../services/gamestudio/schema';
import { ruleSentence } from '../../services/gamestudio/rules';
import { allLevels, BEATS, goalSentence, totalMinutes, type Beat, type GameStory, type StoryLevel } from '../../services/gamestudio/story/schema';
import { BEAT_MEANING, PACING, reviewStory, type StoryNote } from '../../services/gamestudio/story/canon';
import { buildFromStory, builtLevelId, storyNames } from '../../services/gamestudio/story/build';
import { RAVENCREST_STORY } from '../../services/gamestudio/story/samples/ravencrest';

const C = { line: 'rgba(255,255,255,.08)', text: 'rgba(255,255,255,.88)', dim: 'rgba(255,255,255,.52)', accent: '#38bdf8', warn: '#fbbf24', field: '#0d0c12' };
export const BEAT_COLOR: Record<Beat, string> = { hook: '#f472b6', teach: '#4ade80', test: '#38bdf8', twist: '#c084fc', breather: '#94a3b8', climax: '#f97316', resolution: '#facc15' };
const TEMPLATE_NAME: Record<TemplateId, string> = { 'arena-shooter': 'Arena shooter', racer: 'Racer', fighter: 'Fighter', platformer: 'Platformer', adventure: 'Adventure', 'picture-walk': 'Picture walk', party: 'Party' };

export interface StoryPanelProps {
  project: GameProject;
  apply: (op: Op) => boolean;
  onOpenLevel: (levelId: string) => void;
}

async function askStoryIntelligence(text: string, template: TemplateId | 'auto'): Promise<{ story?: GameStory; repairs?: string[]; error?: string }> {
  let token: string | undefined;
  try { token = await (await import('../../services/firebase')).auth.currentUser?.getIdToken(); } catch { /* no auth in this host */ }
  if (!token) return { error: 'Sign in to have Story Intelligence break your story down. You can also open the example and edit it.' };
  try {
    const res = await fetch('/api/gamestudio/breakdown', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ text, template }) });
    const j = await res.json().catch(() => ({}));
    return res.ok ? j : { error: j.error ?? `Story Intelligence answered ${res.status}.` };
  } catch { return { error: 'Could not reach Story Intelligence. Check your connection and try again.' }; }
}

export function StoryPanel({ project, apply, onOpenLevel }: StoryPanelProps) {
  const story = project.story ?? null;
  return story ? <StoryView story={story} project={project} apply={apply} onOpenLevel={onOpenLevel}/> : <StoryStart apply={apply}/>;
}

function StoryStart({ apply }: { apply: (op: Op) => boolean }) {
  const [text, setText] = useState('');
  const [template, setTemplate] = useState<TemplateId | 'auto'>('auto');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const go = async () => {
    setBusy(true); setMsg(null);
    const out = await askStoryIntelligence(text, template);
    setBusy(false);
    if (out.story) {
      apply({ op: 'setStory', story: out.story, label: `Story Intelligence broke "${out.story.title}" into ${allLevels(out.story).length} levels` });
      if (out.repairs?.length) setMsg(`Tidied ${out.repairs.length} thing${out.repairs.length === 1 ? '' : 's'} in the answer.`);
    } else setMsg(out.error ?? 'Something went wrong.');
  };
  return <div className="px-2 pb-3" data-testid="gs-story-start">
    <div className="flex items-center gap-2 px-1 pt-1 text-[13px] font-bold"><Sparkles size={14} style={{ color: C.accent }}/>Make a game from a story</div>
    <p className="px-1 mt-1 text-[12px] leading-snug" style={{ color: C.dim }}>Describe your idea or paste a chapter. Story Intelligence breaks it into levels: where each one happens, what you do there, who you face, and what it adds to the story. You can change all of it.</p>
    <textarea value={text} onChange={e => setText(e.target.value)} rows={7} placeholder="A courier races across a flooded city to deliver a heart before dawn, chased by the man who wants it…" className="mt-2 w-full p-2 rounded-lg text-[12.5px] leading-snug outline-none resize-y" style={{ background: C.field, border: `1px solid ${C.line}`, color: C.text }} data-testid="gs-story-text"/>
    <label className="block mt-2 text-[11.5px]" style={{ color: C.dim }}>Kind of game
      <select value={template} onChange={e => setTemplate(e.target.value as TemplateId | 'auto')} className="mt-1 w-full h-8 px-2 rounded-md text-[13px] outline-none" style={{ background: C.field, border: `1px solid ${C.line}`, color: C.text }} data-testid="gs-story-template">
        <option value="auto">Let Story Intelligence pick</option>
        {(Object.keys(TEMPLATE_NAME) as TemplateId[]).map(t => <option key={t} value={t}>{TEMPLATE_NAME[t]}</option>)}
      </select>
    </label>
    <button disabled={busy || text.trim().length < 20} onClick={go} className="mt-2 w-full h-9 rounded-lg text-[13px] font-bold disabled:opacity-40" style={{ background: 'rgba(56,189,248,.18)', border: `1px solid ${C.accent}` }} data-testid="gs-story-go">{busy ? 'Reading your story…' : 'Break it into a game'}</button>
    {msg && <p className="mt-2 px-1 text-[12px] leading-snug" style={{ color: C.warn }} role="status">{msg}</p>}
    <div className="mt-4 pt-3 px-1" style={{ borderTop: `1px solid ${C.line}` }}>
      <div className="text-[11px] font-bold tracking-[.14em] uppercase" style={{ color: C.dim }}>Or start from an example</div>
      <button onClick={() => apply({ op: 'setStory', story: { ...RAVENCREST_STORY, createdAt: Date.now(), updatedAt: Date.now() }, label: 'Opened the Ravencrest story example' })} className="mt-2 w-full text-left p-2 rounded-lg" style={{ background: 'rgba(255,255,255,.03)', border: `1px solid ${C.line}` }} data-testid="gs-story-example">
        <div className="text-[13px] font-semibold flex items-center gap-1.5"><BookOpen size={13}/>Ravencrest: The Liberation Campaign</div>
        <div className="text-[11.5px] leading-snug" style={{ color: C.dim }}>4 acts, 13 levels, about an hour. From the campaign draft.</div>
      </button>
    </div>
  </div>;
}

function StoryView({ story, project, apply, onOpenLevel }: { story: GameStory; project: GameProject; apply: (op: Op) => boolean; onOpenLevel: (id: string) => void }) {
  const [open, setOpen] = useState<string | null>(null);
  const [built, setBuilt] = useState<string[] | null>(null);
  const [showNotes, setShowNotes] = useState(true);
  const levels = allLevels(story);
  const notes = useMemo(() => reviewStory(story), [story]);
  const notesFor = (id: string) => notes.filter(n => n.levelId === id);
  const have = new Set(project.levels.map(l => l.id));
  const unbuilt = levels.filter(l => !have.has(builtLevelId(l.id))).length;
  const pace = PACING[story.template];

  const editLevel = (l: StoryLevel, patch: Partial<StoryLevel>, what: string) => {
    const next: GameStory = { ...story, updatedAt: Date.now(), chapters: story.chapters.map(c => ({ ...c, levels: c.levels.map(x => x.id === l.id ? { ...x, ...patch } : x) })) };
    apply({ op: 'setStory', story: next, label: `Story: ${l.title}, ${what}` });
  };
  const build = () => {
    const out = buildFromStory(story, project);
    if (out.op && apply(out.op)) { setBuilt(out.notes); const first = levels.find(l => !have.has(builtLevelId(l.id))); if (first) onOpenLevel(builtLevelId(first.id)); }
    else setBuilt(out.skipped.length ? ['Every level is already built. Edit them by hand, or remove one to rebuild it.'] : out.notes);
  };

  return <div className="px-2 pb-3" data-testid="gs-story">
    <div className="px-1 pt-1">
      <div className="text-[14px] font-bold leading-tight">{story.title}</div>
      {story.logline && <p className="mt-1 text-[12px] leading-snug" style={{ color: C.dim }}>{story.logline}</p>}
      <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
        <Chip>{TEMPLATE_NAME[story.template]}</Chip><Chip>{levels.length} levels</Chip><Chip>~{totalMinutes(story)} min</Chip>
      </div>
      {story.templateWhy && <p className="mt-2 text-[11.5px] leading-snug" style={{ color: C.dim }} title={pace.carries}>{story.templateWhy}</p>}
    </div>

    {/* the shape of the game: one bar per level, height = intensity, colour = beat */}
    <div className="mt-3 px-1">
      <div className="text-[11px] font-bold tracking-[.14em] uppercase mb-1" style={{ color: C.dim }}>Shape</div>
      <div className="flex items-end gap-[3px] h-14 p-1.5 rounded-lg" style={{ background: 'rgba(255,255,255,.03)', border: `1px solid ${C.line}` }} data-testid="gs-story-shape">
        {story.chapters.map((c, ci) => <React.Fragment key={c.id}>
          {ci > 0 && <div className="w-px self-stretch" style={{ background: C.line }}/>}
          {c.levels.map(l => <button key={l.id} onClick={() => setOpen(l.id)} title={`${l.title}: ${l.beat}, intensity ${l.intensity}`} className="flex-1 rounded-sm min-w-[5px]" style={{ height: `${l.intensity * 20}%`, background: BEAT_COLOR[l.beat], opacity: open && open !== l.id ? 0.45 : 0.9 }}/>)}
        </React.Fragment>)}
      </div>
    </div>

    <button onClick={build} disabled={!unbuilt} className="mt-3 w-full h-9 rounded-lg text-[13px] font-bold flex items-center justify-center gap-1.5 disabled:opacity-40" style={{ background: 'rgba(74,222,128,.16)', border: '1px solid #4ade80' }} data-testid="gs-story-build">
      <Hammer size={14}/>{unbuilt === levels.length ? `Build ${levels.length} levels` : unbuilt ? `Build ${unbuilt} remaining` : 'All levels built'}
    </button>
    {built && <ul className="mt-2 px-1 space-y-1 text-[11.5px] leading-snug" style={{ color: C.dim }} data-testid="gs-story-built">{built.map((n, i) => <li key={i}>• {n}</li>)}</ul>}

    {notes.length > 0 && <div className="mt-3 px-1">
      <button onClick={() => setShowNotes(s => !s)} className="w-full flex items-center gap-1 text-[11px] font-bold tracking-[.14em] uppercase" style={{ color: C.dim }}>
        {showNotes ? <ChevronDown size={12}/> : <ChevronRight size={12}/>}Story notes <span className="ml-1 normal-case tracking-normal">{notes.length}</span>
      </button>
      {showNotes && <ul className="mt-1 space-y-1.5" data-testid="gs-story-notes">{summaryNotes(notes).map((n, i) => <NoteRow key={i} n={n}/>)}</ul>}
    </div>}

    {story.chapters.map(c => <section key={c.id} className="mt-3">
      <div className="px-1 text-[11px] font-bold tracking-[.14em] uppercase" style={{ color: C.dim }}>Act {c.act} · {c.title}</div>
      {c.levels.map(l => {
        const isOpen = open === l.id;
        const isBuilt = have.has(builtLevelId(l.id));
        const ln = notesFor(l.id);
        return <div key={l.id} className="mt-1.5 rounded-lg" style={{ background: 'rgba(255,255,255,.03)', border: `1px solid ${isOpen ? BEAT_COLOR[l.beat] : C.line}` }} data-testid={`gs-story-card-${l.id}`}>
          <button onClick={() => setOpen(isOpen ? null : l.id)} className="w-full text-left p-2">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-bold uppercase px-1.5 py-[1px] rounded" style={{ background: `${BEAT_COLOR[l.beat]}26`, color: BEAT_COLOR[l.beat] }}>{l.beat}</span>
              <span className="text-[12.5px] font-semibold flex-1 truncate">{l.title}</span>
              {ln.some(n => n.severity === 'warn') ? <TriangleAlert size={12} style={{ color: C.warn }}/> : ln.length ? <Lightbulb size={12} style={{ color: C.dim }}/> : null}
            </div>
            <div className="mt-0.5 text-[11.5px]" style={{ color: C.dim }}>{goalSentence(l, story)} · {l.minutes} min{l.verb ? ` · new: ${l.verb}` : ''}</div>
          </button>
          {isOpen && <div className="px-2 pb-2">
            <p className="text-[12px] leading-snug" style={{ color: C.text }}>{l.story}</p>
            <div className="mt-1 text-[11.5px]" style={{ color: C.dim }}>{story.places.find(p => p.id === l.place)?.name}{l.cast.length ? ` · ${l.cast.map(lc => story.cast.find(x => x.id === lc.castId)?.name).filter(Boolean).join(', ')}` : ''}</div>
            <label className="block mt-2 text-[11.5px]" style={{ color: C.dim }}>Beat
              <select value={l.beat} onChange={e => editLevel(l, { beat: e.target.value as Beat }, 'beat')} className="mt-1 w-full h-8 px-2 rounded-md text-[12.5px] outline-none" style={{ background: C.field, border: `1px solid ${C.line}`, color: C.text }} data-testid="gs-story-beat">
                {BEATS.map(b => <option key={b} value={b}>{b}: {BEAT_MEANING[b]}</option>)}
              </select>
            </label>
            <label className="block mt-2 text-[11.5px]" style={{ color: C.dim }}>
              <span className="flex"><span className="flex-1">Intensity</span><span style={{ color: C.text }}>{l.intensity} / 5</span></span>
              <input type="range" min={1} max={5} step={1} value={l.intensity} onChange={e => editLevel(l, { intensity: +e.target.value }, 'intensity')} className="w-full" data-testid="gs-story-intensity"/>
            </label>
            <label className="block mt-1 text-[11.5px]" style={{ color: C.dim }}>
              <span className="flex"><span className="flex-1">Play time</span><span style={{ color: C.text }}>{l.minutes} min</span></span>
              <input type="range" min={1} max={20} step={1} value={l.minutes} onChange={e => editLevel(l, { minutes: +e.target.value }, 'play time')} className="w-full"/>
            </label>
            {ln.length > 0 && <ul className="mt-2 space-y-1.5">{ln.map((n, i) => <NoteRow key={i} n={n}/>)}</ul>}
            {isBuilt && <button onClick={() => onOpenLevel(builtLevelId(l.id))} className="mt-2 h-7 px-2 rounded-md text-[12px] font-semibold" style={{ border: `1px solid ${C.line}` }} data-testid="gs-story-open">Open this level</button>}
          </div>}
        </div>;
      })}
    </section>)}

    <button onClick={() => apply({ op: 'setStory', story: null })} className="mt-4 ml-1 text-[11.5px] flex items-center gap-1 underline" style={{ color: C.dim }} data-testid="gs-story-remove"><Trash2 size={11}/>Remove the story (built levels stay)</button>
  </div>;
}

/** The summary: warnings first, then one note per pattern (the rest are on their level cards). */
function summaryNotes(notes: StoryNote[]): StoryNote[] {
  const seen = new Set<string>();
  return [...notes].sort((a, b) => (a.severity === 'warn' ? 0 : 1) - (b.severity === 'warn' ? 0 : 1))
    .filter(n => (seen.has(n.pattern) ? false : (seen.add(n.pattern), true))).slice(0, 4);
}

function NoteRow({ n }: { n: StoryNote }) {
  return <li className="flex gap-1.5 text-[11.5px] leading-snug" style={{ color: n.severity === 'warn' ? '#fde68a' : C.dim }}>
    {n.severity === 'warn' ? <TriangleAlert size={12} className="shrink-0 mt-[2px]"/> : <Lightbulb size={12} className="shrink-0 mt-[2px]"/>}<span>{n.text}</span>
  </li>;
}

function Chip({ children }: { children: React.ReactNode }) {
  return <span className="px-1.5 py-[1px] rounded" style={{ border: `1px solid ${C.line}`, color: C.text }}>{children}</span>;
}

/** The level's logic as sentences, each switchable on/off. */
export function RulesPanel({ level, project, apply, pro }: { level: GameLevel; project: GameProject; apply: (op: Op) => boolean; pro: boolean }) {
  const names = useMemo(() => storyNames(project.story ?? null, project), [project]);
  const [all, setAll] = useState(false);
  if (!level.rules.length) return null;
  const shown = all || level.rules.length <= 5 ? level.rules : level.rules.slice(0, 4);
  const toggle = (r: Rule) => apply({ op: 'putRule', levelId: level.id, rule: { ...r, enabled: !r.enabled } });
  return <section data-testid="gs-rules">
    <h3 className="text-[11px] font-bold tracking-[.16em] uppercase mb-2" style={{ color: C.dim }}>What happens here</h3>
    <ul className="space-y-1.5">{shown.map(r => <li key={r.id} className="flex gap-2 items-start">
      <input type="checkbox" checked={r.enabled} onChange={() => toggle(r)} className="mt-[3px]" aria-label="Rule on"/>
      <span className="text-[12px] leading-snug flex-1" style={{ color: r.enabled ? C.text : C.dim, textDecoration: r.enabled ? 'none' : 'line-through' }}>{ruleSentence({ ...r, enabled: true }, names)}</span>
      {pro && <button aria-label="Delete rule" onClick={() => apply({ op: 'removeRule', levelId: level.id, ruleId: r.id })} style={{ color: C.dim }}><Trash2 size={11}/></button>}
    </li>)}</ul>
    {level.rules.length > 5 && <button onClick={() => setAll(a => !a)} className="mt-1 text-[11px] underline" style={{ color: C.dim }}>{all ? 'Show fewer' : `Show all ${level.rules.length}`}</button>}
    <p className="mt-2 text-[10.5px] leading-snug" style={{ color: C.dim }}>Rules run in the game once its rule player lands (Phase 2); they are saved now.</p>
  </section>;
}
