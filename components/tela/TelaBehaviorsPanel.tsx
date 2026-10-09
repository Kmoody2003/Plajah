/**
 * TelaBehaviorsPanel: the "Live" authoring panel. Select an object on a page and see / add / edit what it does in the Lorea reader:
 * idle animation, taps, drags, proximity, sounds, music, goals. Everything is the plain LivingBook JSON from
 * services/living/contracts.ts, stored in TelaDoc.living through the SET_LIVING_PAGE op (so it autosaves, survives
 * save/reload and is part of every published version).
 *
 * Page numbering: LivingPage.page = 1-based position of the frame in doc.frames (see services/living/runtime/objects.ts).
 */
import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronRight, ChevronUp, Copy, Eye, EyeOff, Play, Plus, Redo2, Trash2, Undo2 } from 'lucide-react';
import type { TelaDoc } from '../../types';
import type { Action, Behavior, Cond, LivingPage, Target, Trigger } from '../../services/living/contracts';
import type { TelaOp } from './telaOps';
import { frameObjects, frameSize, objectInfos } from '../../services/living/runtime/objects';
import { resolveTarget } from '../../services/living/runtime/targets';
import { ACTION_TYPES, ANIM_PRESET_LIST, BURST_KIND_LIST, HAPTIC_LIST, TRIGGER_TYPES, loadAudioCatalogue, type AudioCatalogue, parseAudioCatalogue } from '../../services/living/runtime/catalog';
import { audioCatalogLoader } from '../../services/living/runtime/catalogGlob';
import { HINT_REQUIRED, validateLivingPage, type Issue } from '../../services/living/runtime/validate';
import { ACTION_NAMES, TRIGGER_NAMES, defaultAction, defaultTrigger, describeBehavior, describeTarget, getPath, parseScalar, setPath } from '../../services/living/authoring/describe';
import { PRESETS, applyPreset, uniqueId, type PresetDef } from '../../services/living/authoring/presets';
import { duplicateBehavior, getLivingPage, isDisabled, parseLivingPageJson, removeBehavior, runnablePage, setDisabled, upsertBehavior } from '../../services/living/authoring/livingDoc';

const TelaLivePreview = lazy(() => import('../living/TelaLivePreview'));

// ── tiny form kit (matches the Studio panel look) ────────────────────────────────────────────────
const lbl = 'text-[9px] font-extrabold uppercase tracking-[.1em] text-white/40 mb-0.5';
const inp = 'w-full h-7 px-2 rounded-[7px] text-[11px] text-white bg-white/[.06] border border-white/[.14] outline-none focus:border-[#00DAF3]/60';
const chip = 'h-7 px-2 rounded-[7px] text-[10px] font-extrabold border border-white/[.12] bg-white/[.05] text-white/70 hover:text-white hover:bg-white/[.1]';
const iconBtn = 'grid place-items-center w-6 h-6 rounded-[6px] text-white/45 hover:text-white hover:bg-white/[.08] disabled:opacity-30';

type FieldKind = 'text' | 'num' | 'bool' | 'select' | 'scalar';
interface Field { path: string; label: string; kind: FieldKind; options?: string[]; list?: 'sfx' | 'instrument' | 'bed' | 'cue'; placeholder?: string; title?: string }

const TRIGGER_FIELDS: Partial<Record<Trigger['type'], Field[]>> = {
  press: [{ path: 'minMs', label: 'Hold for (ms, 0 = at once)', kind: 'num' }],
  drag: [{ path: 'axis', label: 'Direction', kind: 'select', options: ['both', 'x', 'y'] }, { path: 'progressVar', label: 'Write progress 0..1 to variable', kind: 'text' }, { path: 'snapBack', label: 'Spring back when let go', kind: 'bool' },
    { path: 'bounds.minX', label: 'Min x', kind: 'num' }, { path: 'bounds.maxX', label: 'Max x', kind: 'num' }, { path: 'bounds.minY', label: 'Min y', kind: 'num' }, { path: 'bounds.maxY', label: 'Max y', kind: 'num' }],
  proximity: [{ path: 'radius', label: 'Radius (page units)', kind: 'num' }, { path: 'slowBelow', label: 'Only if slower than (px/s)', kind: 'num', title: 'Shy characters: peeks out when you approach slowly' }, { path: 'fastAbove', label: 'Only if faster than (px/s)', kind: 'num' }],
  tilt: [{ path: 'axis', label: 'Axis', kind: 'select', options: ['both', 'x', 'y'] }, { path: 'gain', label: 'Strength', kind: 'num' }],
  timer: [{ path: 'afterMs', label: 'After (ms)', kind: 'num' }, { path: 'every', label: 'Repeat', kind: 'bool' }],
  event: [{ path: 'name', label: 'Message name', kind: 'text' }],
  key: [{ path: 'key', label: 'Key', kind: 'text' }],
};

const ACTION_FIELDS: Partial<Record<Action['do'], Field[]>> = {
  animate: [{ path: 'anim.preset', label: 'Animation', kind: 'select', options: ANIM_PRESET_LIST }, { path: 'anim.amount', label: 'Strength (0-2)', kind: 'num' }, { path: 'anim.durationMs', label: 'Duration (ms)', kind: 'num' }, { path: 'anim.delayMs', label: 'Delay (ms)', kind: 'num' },
    { path: 'anim.loop', label: 'Repeat (number or "infinite")', kind: 'scalar' }, { path: 'anim.easing', label: 'Easing', kind: 'select', options: ['', 'linear', 'ease', 'ease-in', 'ease-out', 'ease-in-out', 'spring', 'bounce'] },
    { path: 'anim.direction', label: 'Direction', kind: 'select', options: ['', 'normal', 'alternate', 'reverse'] }, { path: 'anim.seed', label: 'Seed', kind: 'num' }],
  set: [{ path: 'props.opacity', label: 'Opacity', kind: 'num' }, { path: 'props.scale', label: 'Scale', kind: 'num' }, { path: 'props.rotate', label: 'Rotate (deg)', kind: 'num' }, { path: 'props.x', label: 'Move x', kind: 'num' }, { path: 'props.y', label: 'Move y', kind: 'num' },
    { path: 'props.visible', label: 'Visible', kind: 'select', options: ['', 'true', 'false'] }, { path: 'props.fill', label: 'Fill colour', kind: 'text' }, { path: 'props.text', label: 'Text', kind: 'text' }],
  show: [{ path: 'anim.preset', label: 'With animation', kind: 'select', options: ['', ...ANIM_PRESET_LIST] }],
  hide: [{ path: 'anim.preset', label: 'With animation', kind: 'select', options: ['', ...ANIM_PRESET_LIST] }],
  toggle: [{ path: 'anim.preset', label: 'With animation', kind: 'select', options: ['', ...ANIM_PRESET_LIST] }],
  sfx: [{ path: 'sound', label: 'Sound', kind: 'text', list: 'sfx' }, { path: 'params.pitch', label: 'Pitch (semitones)', kind: 'num' }, { path: 'params.gain', label: 'Volume (0-1)', kind: 'num' }, { path: 'params.variation', label: 'Random detune (0-1)', kind: 'num' }],
  note: [{ path: 'instrument', label: 'Instrument', kind: 'text', list: 'instrument' }, { path: 'note', label: 'Note (C4, 60, or scale:C4,E4,G4)', kind: 'scalar', title: 'scale:... picks a note by where you tap' }, { path: 'durationMs', label: 'Length (ms, empty = while held)', kind: 'num' }, { path: 'gain', label: 'Volume (0-1)', kind: 'num' }],
  music: [{ path: 'cue', label: 'Music cue', kind: 'text', list: 'cue' }, { path: 'fadeMs', label: 'Fade in (ms)', kind: 'num' }],
  musicStop: [{ path: 'fadeMs', label: 'Fade out (ms)', kind: 'num' }],
  musicTempo: [{ path: 'scale', label: 'Speed (1 = normal)', kind: 'num' }, { path: 'rampMs', label: 'Over (ms)', kind: 'num' }],
  duck: [{ path: 'amount', label: 'Lower by (0-1)', kind: 'num' }, { path: 'ms', label: 'For (ms)', kind: 'num' }],
  ambience: [{ path: 'bed', label: 'Ambience bed (empty = off)', kind: 'text', list: 'bed' }, { path: 'gain', label: 'Volume', kind: 'num' }, { path: 'fadeMs', label: 'Fade (ms)', kind: 'num' }],
  narrate: [{ path: 'from', label: 'From word', kind: 'num' }, { path: 'to', label: 'To word', kind: 'num' }],
  var: [{ path: 'name', label: 'Variable', kind: 'text' }, { path: 'op', label: 'Do', kind: 'select', options: ['set', 'inc', 'dec', 'toggle'] }, { path: 'value', label: 'Value', kind: 'scalar' }],
  goto: [{ path: 'page', label: 'Page (number, next, prev)', kind: 'scalar' }],
  burst: [{ path: 'kind', label: 'Particles', kind: 'select', options: BURST_KIND_LIST }, { path: 'count', label: 'How many', kind: 'num' }],
  trail: [{ path: 'kind', label: 'Particles', kind: 'select', options: BURST_KIND_LIST }, { path: 'whileVar', label: 'Only while variable is true', kind: 'text' }],
  follow: [{ path: 'lagMs', label: 'Lag (ms)', kind: 'num' }, { path: 'lookAt', label: 'Just look (eyes), do not travel', kind: 'bool' }, { path: 'maxOffset', label: 'Max distance', kind: 'num' }],
  haptic: [{ path: 'pattern', label: 'Pattern', kind: 'select', options: HAPTIC_LIST }],
  emit: [{ path: 'name', label: 'Message name', kind: 'text' }],
  wait: [{ path: 'ms', label: 'Wait (ms)', kind: 'num' }],
};
/** Actions that name a target of their own. `required` = cannot be left as "this object". */
const TARGETED: Partial<Record<Action['do'], boolean>> = { animate: false, stop: false, set: false, show: true, hide: true, toggle: true, follow: true, burst: false };

function FieldInput({ f, value, onChange, cat, cues }: { f: Field; value: unknown; onChange: (v: unknown) => void; cat: AudioCatalogue; cues: string[] }) {
  const listId = f.list ? `tbp-${f.list}` : undefined;
  const v = value === undefined ? '' : String(value);
  const common = { title: f.title, 'aria-label': f.label };
  return (
    <label className="block min-w-0">
      <div className={lbl}>{f.label}</div>
      {f.kind === 'bool' ? <input type="checkbox" checked={!!value} onChange={e => onChange(e.target.checked || undefined)} {...common} />
        : f.kind === 'select' ? <select className={inp} value={v} onChange={e => onChange(f.options?.includes('true') ? (e.target.value === '' ? undefined : e.target.value === 'true') : e.target.value)} {...common}>{f.options!.map(o => <option key={o} value={o}>{o || '(default)'}</option>)}</select>
        : f.kind === 'num' ? <input className={inp} type="number" step="any" value={v} onChange={e => onChange(e.target.value === '' ? undefined : Number(e.target.value))} {...common} />
        : f.kind === 'scalar' ? <input className={inp} value={v} onChange={e => onChange(e.target.value === '' ? undefined : parseScalar(e.target.value))} {...common} />
        : <input className={inp} list={listId} value={v} placeholder={f.placeholder} onChange={e => onChange(e.target.value === '' ? undefined : e.target.value)} {...common} />}
      {listId && <datalist id={listId}>{(f.list === 'sfx' ? cat.sfx : f.list === 'instrument' ? cat.instruments : f.list === 'bed' ? cat.ambience : cues).map(o => <option key={o} value={o} />)}</datalist>}
    </label>
  );
}

// ── target editor ─────────────────────────────────────────────────────────────────────────────────
type TKind = 'this' | 'label' | 'prefix' | 'id' | 'role' | 'group' | 'page';
const kindOf = (t: Target | undefined): TKind => !t ? 'this' : 'page' in t ? 'page' : 'id' in t ? 'id' : 'role' in t ? 'role' : 'group' in t ? 'group' : t.label.endsWith('*') ? 'prefix' : 'label';
function TargetEditor({ value, onChange, optional, labels, groups, resolvedCount }: { value: Target | undefined; onChange: (t: Target | undefined) => void; optional: boolean; labels: string[]; groups: string[]; resolvedCount?: number }) {
  const k = kindOf(value);
  const text = !value ? '' : 'id' in value ? value.id : 'role' in value ? value.role : 'group' in value ? value.group : 'label' in value ? (k === 'prefix' ? value.label.slice(0, -1) : value.label) : '';
  const set = (kind: TKind, t: string) => onChange(kind === 'this' ? undefined : kind === 'page' ? { page: true } : kind === 'id' ? { id: t } : kind === 'role' ? { role: t } : kind === 'group' ? { group: t } : kind === 'prefix' ? { label: `${t}*` } : { label: t });
  return (
    <div className="min-w-0">
      <div className={lbl}>Applies to{resolvedCount !== undefined && <span className="ml-1 normal-case tracking-normal text-white/35">({resolvedCount} object{resolvedCount === 1 ? '' : 's'} here)</span>}</div>
      <div className="flex gap-1">
        <select aria-label="Target kind" className={`${inp} !w-[112px] shrink-0`} value={k} onChange={e => set(e.target.value as TKind, text)}>
          {optional && <option value="this">this object</option>}
          <option value="label">label is</option><option value="prefix">label starts with</option><option value="id">object id</option><option value="role">template role</option><option value="group">group</option><option value="page">whole page</option>
        </select>
        {k !== 'this' && k !== 'page' && <input aria-label="Target name" className={inp} list={k === 'group' ? 'tbp-groups' : 'tbp-labels'} value={text} onChange={e => set(k, e.target.value)} />}
      </div>
      <datalist id="tbp-labels">{labels.map(l => <option key={l} value={l} />)}</datalist><datalist id="tbp-groups">{groups.map(g => <option key={g} value={g} />)}</datalist>
    </div>
  );
}

function CondEditor({ value, onChange }: { value: Cond | undefined; onChange: (c: Cond | undefined) => void }) {
  const c = value && 'var' in value ? value : undefined;
  if (value && !c) return <div className="text-[10px] text-white/45">Compound condition: edit it in the JSON tab.</div>;
  return (
    <div className="grid grid-cols-[1fr_64px_1fr] gap-1">
      <label><div className={lbl}>Variable</div><input className={inp} value={c?.var ?? ''} onChange={e => onChange(e.target.value ? { var: e.target.value, op: c?.op ?? '>=', value: c?.value ?? 1 } : undefined)} /></label>
      <label><div className={lbl}>Is</div><select className={inp} value={c?.op ?? '>='} onChange={e => c && onChange({ ...c, op: e.target.value as never })}>{['==', '!=', '>=', '<=', '>', '<'].map(o => <option key={o}>{o}</option>)}</select></label>
      <label><div className={lbl}>Value</div><input className={inp} value={c ? String(c.value) : ''} onChange={e => c && onChange({ ...c, value: parseScalar(e.target.value) })} /></label>
    </div>
  );
}

// ── action list editor ────────────────────────────────────────────────────────────────────────────
interface Ctx { cat: AudioCatalogue; cues: string[]; labels: string[]; groups: string[]; countFor: (t: Target | undefined) => number | undefined }

function ActionEditor({ a, onChange, onDelete, onMove, ctx, first, last }: { a: Action; onChange: (a: Action) => void; onDelete: () => void; onMove: (d: -1 | 1) => void; ctx: Ctx; first: boolean; last: boolean }) {
  const fields = ACTION_FIELDS[a.do] ?? [];
  const [open, setOpen] = useState(true);
  const needsTarget = a.do in TARGETED;
  const target = (a as { target?: Target }).target;
  const setField = (path: string, v: unknown) => {
    let next = setPath(a, path, v) as Action;
    // sensible clean-up so JSON stays readable
    if (next.do === 'animate' && next.anim && !next.anim.preset && !next.anim.keyframes) next = { ...next, anim: { ...next.anim, preset: 'wiggle' } };
    if (next.do === 'var' && (next.op === 'toggle')) { const { value: _v, ...rest } = next as never as { value?: unknown }; next = rest as never as Action; }
    onChange(next);
  };
  return (
    <div className="rounded-[9px] border border-white/[.09] bg-white/[.03]">
      <div className="flex items-center gap-1 px-1.5 h-8">
        <button type="button" className={iconBtn} onClick={() => setOpen(o => !o)} aria-label={open ? 'Collapse' : 'Expand'}>{open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}</button>
        <select aria-label="Action type" className={`${inp} !h-6 flex-1`} value={a.do} onChange={e => onChange(defaultAction(e.target.value as Action['do']))}>{ACTION_TYPES.map(t => <option key={t} value={t}>{ACTION_NAMES[t]}</option>)}</select>
        <button type="button" className={iconBtn} disabled={first} onClick={() => onMove(-1)} aria-label="Move up"><ChevronUp size={13} /></button>
        <button type="button" className={iconBtn} disabled={last} onClick={() => onMove(1)} aria-label="Move down"><ChevronDown size={13} /></button>
        <button type="button" className={`${iconBtn} hover:!text-[#FF8FA8]`} onClick={onDelete} aria-label="Delete action"><Trash2 size={13} /></button>
      </div>
      {open && (
        <div className="px-2 pb-2 grid grid-cols-2 gap-1.5">
          {needsTarget && <div className="col-span-2"><TargetEditor value={target} optional={!TARGETED[a.do]} labels={ctx.labels} groups={ctx.groups} resolvedCount={ctx.countFor(target)} onChange={t => onChange({ ...a, target: t } as Action)} /></div>}
          {a.do === 'depth' && (
            <div className="col-span-2 grid grid-cols-2 gap-1.5">
              <label><div className={lbl}>Fixed depth (0 surface .. 1 deep)</div><input className={inp} type="number" step="0.05" min={0} max={1} value={typeof a.value === 'number' ? a.value : ''} onChange={e => onChange({ do: 'depth', value: Number(e.target.value) || 0 })} /></label>
              <label><div className={lbl}>...or follow variable</div><input className={inp} value={typeof a.value === 'object' ? a.value.fromVar : ''} onChange={e => onChange({ do: 'depth', value: e.target.value ? { fromVar: e.target.value } : 0 })} /></label>
            </div>
          )}
          {a.do === 'if' && <div className="col-span-2 text-[10px] text-white/50 leading-snug">If / else: edit the condition here, and the branches in the JSON tab.<div className="mt-1"><CondEditor value={a.cond} onChange={c => c && onChange({ ...a, cond: c })} /></div></div>}
          {fields.map(f => <FieldInput key={f.path} f={f} value={getPath(a, f.path)} cat={ctx.cat} cues={ctx.cues} onChange={v => setField(f.path, v)} />)}
          {a.do === 'celebrate' && <div className="col-span-2 text-[10px] text-white/45">Confetti, a cheer and a happy buzz. Skipped (silently) for reduced motion.</div>}
        </div>
      )}
    </div>
  );
}

function ActionList({ title, actions, onChange, ctx, hint }: { title: string; actions: Action[]; onChange: (a: Action[]) => void; ctx: Ctx; hint?: string }) {
  const [adding, setAdding] = useState<Action['do']>('animate');
  return (
    <div>
      <div className={lbl}>{title}</div>
      {hint && <div className="text-[10px] text-white/38 mb-1 leading-snug">{hint}</div>}
      <div className="space-y-1.5">
        {actions.map((a, i) => <ActionEditor key={i} a={a} ctx={ctx} first={i === 0} last={i === actions.length - 1}
          onChange={na => onChange(actions.map((x, j) => (j === i ? na : x)))} onDelete={() => onChange(actions.filter((_, j) => j !== i))}
          onMove={d => { const n = [...actions]; const [x] = n.splice(i, 1); n.splice(i + d, 0, x); onChange(n); }} />)}
      </div>
      <div className="flex gap-1 mt-1.5">
        <select aria-label="New action type" className={`${inp} flex-1`} value={adding} onChange={e => setAdding(e.target.value as Action['do'])}>{ACTION_TYPES.map(t => <option key={t} value={t}>{ACTION_NAMES[t]}</option>)}</select>
        <button type="button" className={chip} onClick={() => onChange([...actions, defaultAction(adding)])}><Plus size={11} className="inline -mt-0.5 mr-0.5" />Add</button>
      </div>
    </div>
  );
}

// ── one behaviour's form ──────────────────────────────────────────────────────────────────────────
function BehaviorForm({ b, onChange, ctx, issues }: { b: Behavior; onChange: (b: Behavior) => void; ctx: Ctx; issues: Issue[] }) {
  const tf = TRIGGER_FIELDS[b.on.type] ?? [];
  const needsHint = HINT_REQUIRED.has(b.on.type);
  return (
    <div className="space-y-2 pt-1">
      {issues.map((is, i) => <div key={i} className="flex gap-1.5 text-[10px] leading-snug rounded-[7px] px-2 py-1" style={{ background: is.severity === 'error' ? 'rgba(239,68,68,.12)' : 'rgba(245,158,11,.1)', color: is.severity === 'error' ? '#FF9AA8' : '#F7C46C' }}><AlertTriangle size={11} className="shrink-0 mt-0.5" />{is.message}</div>)}
      <div className="grid grid-cols-2 gap-1.5">
        <label><div className={lbl}>Name (for you)</div><input className={inp} value={b.label ?? ''} onChange={e => onChange({ ...b, label: e.target.value || undefined })} /></label>
        <label><div className={lbl}>When</div>
          <select className={inp} value={b.on.type} onChange={e => onChange({ ...b, on: defaultTrigger(e.target.value as Trigger['type']) })}>{TRIGGER_TYPES.map(t => <option key={t} value={t}>{TRIGGER_NAMES[t]}</option>)}</select></label>
      </div>
      <label className="block"><div className={lbl}>Hint: what a screen reader or keyboard user hears {needsHint && <span className="text-[#FF9AA8]">(required)</span>}</div>
        <input className={`${inp} ${needsHint && !b.hint?.trim() ? '!border-[#EF4444]/70' : ''}`} value={b.hint ?? ''} placeholder="Tap Bo to make him beep" onChange={e => onChange({ ...b, hint: e.target.value || undefined })} /></label>
      <TargetEditor value={b.target} optional={false} labels={ctx.labels} groups={ctx.groups} resolvedCount={ctx.countFor(b.target)} onChange={t => t && onChange({ ...b, target: t })} />
      {(tf.length > 0 || b.on.type === 'when') && (
        <div className="grid grid-cols-2 gap-1.5">
          {tf.map(f => <FieldInput key={f.path} f={f} value={getPath(b.on, f.path)} cat={ctx.cat} cues={ctx.cues} onChange={v => onChange({ ...b, on: setPath(b.on, f.path, v) })} />)}
          {b.on.type === 'when' && <div className="col-span-2"><div className={lbl}>Condition</div><CondEditor value={b.on.cond} onChange={c => c && onChange({ ...b, on: { type: 'when', cond: c } })} /></div>}
        </div>
      )}
      {b.on.type === 'drag' && b.on.snapTo && <div className="text-[10px] text-white/45">Snap points: {b.on.snapTo.length} (edit in the JSON tab).</div>}
      <ActionList title="Then" actions={b.do} ctx={ctx} onChange={d => onChange({ ...b, do: d })} />
      <details className="rounded-[9px] border border-white/[.07] px-2 py-1.5">
        <summary className="text-[10px] font-extrabold uppercase tracking-[.08em] text-white/45 cursor-pointer">Reduced motion / no sound alternative {b.reduced?.length ? `(${b.reduced.length})` : ''}</summary>
        <div className="pt-2"><ActionList title="Instead, run" hint="What a reader with reduced motion (or sound off, when this only makes a sound) gets: show text, change a state, without movement." actions={b.reduced ?? []} ctx={ctx} onChange={r => onChange({ ...b, reduced: r.length ? r : undefined })} /></div>
      </details>
      <div className="grid grid-cols-3 gap-1.5 items-end">
        <label className="flex items-center gap-1.5 text-[10px] text-white/60"><input type="checkbox" checked={!!b.once} onChange={e => onChange({ ...b, once: e.target.checked || undefined })} />Only once</label>
        <label className="col-span-2"><div className={lbl}>Cooldown (ms)</div><input className={inp} type="number" value={b.cooldownMs ?? ''} onChange={e => onChange({ ...b, cooldownMs: e.target.value === '' ? undefined : Number(e.target.value) })} /></label>
      </div>
      <div><div className={lbl}>Only when (optional)</div><CondEditor value={b.when} onChange={c => onChange({ ...b, when: c })} /></div>
    </div>
  );
}

// ── the panel ─────────────────────────────────────────────────────────────────────────────────────
export interface TelaBehaviorsPanelProps {
  doc: TelaDoc;
  frameId: string | null;
  selectedObjectId: string | null;
  dispatchOp: (op: TelaOp) => void;
}

type Tab = 'list' | 'add' | 'json';

export default function TelaBehaviorsPanel({ doc, frameId, selectedObjectId, dispatchOp }: TelaBehaviorsPanelProps) {
  const frame = doc.frames.find(f => f.id === frameId) ?? null;
  const pageNumber = frame ? doc.frames.indexOf(frame) + 1 : 0;
  const objects = useMemo(() => (frame ? frameObjects(doc, frame) : []), [doc, frame]);
  const infos = useMemo(() => objectInfos(objects), [objects]);
  const page = useMemo(() => getLivingPage(doc.living, pageNumber), [doc.living, pageNumber]);
  const sel = objects.find(o => o.id === selectedObjectId) ?? null;

  const [tab, setTab] = useState<Tab>('list');
  const [openId, setOpenId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [preview, setPreview] = useState(false);
  const [cat, setCat] = useState<AudioCatalogue>(() => parseAudioCatalogue(undefined));
  const [jsonText, setJsonText] = useState('');
  const [jsonErr, setJsonErr] = useState('');
  const [flash, setFlash] = useState('');
  const [presetFor, setPresetFor] = useState<PresetDef | null>(null);
  const [pArg, setPArg] = useState({ reveal: '', cue: '' });
  useEffect(() => { let on = true; void loadAudioCatalogue(audioCatalogLoader).then(c => { if (on) setCat(c); }); return () => { on = false; }; }, []);

  // history (per page, this session): the Tela canvas has no global undo, so edits made here can be undone here
  const hist = useRef(new Map<number, { past: LivingPage[]; future: LivingPage[]; key: string; at: number }>());
  const h = () => { let x = hist.current.get(pageNumber); if (!x) { x = { past: [], future: [], key: '', at: 0 }; hist.current.set(pageNumber, x); } return x; };
  const [, force] = useState(0);
  const commit = useCallback((next: LivingPage, coalesce?: string) => {
    const x = h(); const now = Date.now();
    if (!(coalesce && x.key === coalesce && now - x.at < 900)) { x.past.push(page); if (x.past.length > 60) x.past.shift(); }
    x.key = coalesce ?? ''; x.at = now; x.future = [];
    dispatchOp({ type: 'SET_LIVING_PAGE', page: next });
    force(n => n + 1);
  }, [page, dispatchOp, pageNumber]);   // eslint-disable-line react-hooks/exhaustive-deps
  const undo = () => { const x = h(); const p = x.past.pop(); if (!p) return; x.future.push(page); x.key = ''; dispatchOp({ type: 'SET_LIVING_PAGE', page: p }); force(n => n + 1); };
  const redo = () => { const x = h(); const p = x.future.pop(); if (!p) return; x.past.push(page); x.key = ''; dispatchOp({ type: 'SET_LIVING_PAGE', page: p }); force(n => n + 1); };

  useEffect(() => { if (tab === 'json') { setJsonText(JSON.stringify(page, null, 2)); setJsonErr(''); } }, [tab, pageNumber]);   // eslint-disable-line react-hooks/exhaustive-deps

  const cues = useMemo(() => Object.keys(doc.living?.scores ?? {}), [doc.living]);
  const labels = useMemo(() => [...new Set(objects.map(o => o.objectLabel).filter((x): x is string => !!x))], [objects]);
  const groups = useMemo(() => Object.keys(page.groups ?? {}), [page.groups]);
  const countFor = useCallback((t: Target | undefined) => (t ? resolveTarget(t, infos, page.groups).length : undefined), [infos, page.groups]);
  const ctx: Ctx = { cat, cues, labels, groups, countFor };
  const issues = useMemo(() => validateLivingPage(page, { objects: infos, scores: doc.living?.scores ?? {}, sfxIds: cat.fromAudioModule ? cat.sfx : undefined, instruments: cat.fromAudioModule ? cat.instruments : undefined, beds: cat.fromAudioModule ? cat.ambience : undefined }), [page, infos, doc.living, cat]);
  const issuesFor = (id: string) => issues.filter(i => i.behaviorId === id);
  const errorCount = issues.filter(i => i.severity === 'error').length;

  const mine = useMemo(() => (sel && !showAll ? page.behaviors.filter(b => resolveTarget(b.target, infos, page.groups).includes(sel.id)) : page.behaviors), [page, sel, showAll, infos]);

  const selTarget = (): { target: Target; name: string } | null => {
    if (!sel) return null;
    const dup = sel.objectLabel ? objects.filter(o => o.objectLabel === sel.objectLabel).length > 1 : true;
    return { target: sel.objectLabel && !dup ? { label: sel.objectLabel } : { id: sel.id }, name: sel.objectLabel || (sel.kind === 'TEXT' ? (sel.text || 'the text').slice(0, 24) : sel.kind.toLowerCase()) };
  };

  const addPreset = (def: PresetDef) => {
    const t = selTarget();
    if (def.needs === 'object' && !t) { setFlash('Select an object on the canvas first.'); return; }
    const params = { target: t?.target ?? { page: true as const }, name: t?.name ?? 'the page', revealLabel: pArg.reveal || undefined, cue: pArg.cue || cues[0] || 'main' };
    const next = applyPreset(page, def, params);
    commit(next);
    setFlash(`Added "${def.title}"${t ? ` to ${t.name}` : ''}.`); setPresetFor(null); setTab('list'); setShowAll(false);
    const added = next.behaviors.find(b => !page.behaviors.some(x => x.id === b.id)); if (added) setOpenId(added.id);
  };

  const updateB = (b: Behavior, coalesce = true) => commit(upsertBehavior(page, b), coalesce ? `b:${b.id}` : undefined);
  const addBlank = () => { const t = selTarget(); const id = uniqueId(page, 'behavior'); const b: Behavior = { id, label: 'New behaviour', target: t?.target ?? { page: true }, on: { type: 'tap' }, hint: t ? `Tap ${t.name}` : undefined, do: [defaultAction('animate')] }; commit(upsertBehavior(page, b)); setOpenId(id); setTab('list'); };

  if (!frame) return <div className="p-3 text-[11px] text-white/45">Select a page to add living behaviours.</div>;
  const total = page.behaviors.length;

  return (
    <section aria-label="Live behaviours" className="mt-3 pt-3 border-t border-white/10" data-tela-behaviors="1">
      <div className="flex items-center gap-1.5 mb-2">
        <div className="text-[.62rem] font-extrabold uppercase tracking-[.16em] text-white/40 mr-auto">Live · page {pageNumber}{total ? ` · ${total}` : ''}</div>
        {errorCount > 0 && <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded-[6px]" style={{ background: 'rgba(239,68,68,.15)', color: '#FF9AA8' }} title="Fix these before publishing">{errorCount} to fix</span>}
        <button type="button" className={iconBtn} disabled={!h().past.length} onClick={undo} aria-label="Undo behaviour change" title="Undo"><Undo2 size={13} /></button>
        <button type="button" className={iconBtn} disabled={!h().future.length} onClick={redo} aria-label="Redo behaviour change" title="Redo"><Redo2 size={13} /></button>
        <button type="button" className={`${chip} !bg-[rgba(0,218,243,.12)] !text-[#8FF5FF]`} onClick={() => setPreview(true)} disabled={!objects.length}><Play size={11} className="inline -mt-0.5 mr-1" />Preview page</button>
      </div>

      <div className="flex gap-1 mb-2" role="tablist" aria-label="Live panel sections">
        {(['list', 'add', 'json'] as Tab[]).map(t => <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`${chip} flex-1 ${tab === t ? '!bg-[rgba(107,0,153,.55)] !text-white' : ''}`}>{t === 'list' ? 'Behaviours' : t === 'add' ? 'Add' : 'JSON'}</button>)}
      </div>
      {flash && <div role="status" className="mb-2 text-[10px] text-[#8FF5FF]">{flash}</div>}

      {tab === 'list' && (
        <div>
          <div className="flex items-center gap-2 mb-1.5 text-[10px] text-white/50">
            <span className="truncate">{sel && !showAll ? <>On <b className="text-white/75">{sel.objectLabel || sel.kind}</b></> : 'Whole page'}</span>
            {sel && <button type="button" className="underline ml-auto" onClick={() => setShowAll(v => !v)}>{showAll ? 'Only this object' : 'Show all on page'}</button>}
          </div>
          {mine.length === 0 && <div className="rounded-[10px] border border-dashed border-white/15 px-3 py-4 text-[11px] text-white/45 leading-relaxed">{sel ? 'Nothing happens when readers touch this yet.' : 'This page is still. Select an object and add a behaviour.'}<div className="mt-2"><button className={chip} onClick={() => setTab('add')}>Browse presets</button></div></div>}
          <div className="space-y-1.5">
            {mine.map(b => {
              const open = openId === b.id; const bi = issuesFor(b.id); const off = isDisabled(b);
              return (
                <div key={b.id} className="rounded-[10px] border" style={{ borderColor: bi.some(i => i.severity === 'error') ? 'rgba(239,68,68,.45)' : 'rgba(255,255,255,.1)', background: open ? 'rgba(255,255,255,.04)' : 'rgba(255,255,255,.02)', opacity: off ? 0.55 : 1 }}>
                  <div className="flex items-center gap-1 px-1.5 py-1">
                    <button type="button" className="flex-1 min-w-0 text-left px-1" onClick={() => setOpenId(open ? null : b.id)} aria-expanded={open}>
                      <div className="text-[11px] font-bold text-white/85 truncate">{b.label || b.id}{off ? ' (off)' : ''}</div>
                      <div className="text-[9.5px] text-white/42 truncate">{describeBehavior(b)} · {describeTarget(b.target)}</div>
                    </button>
                    {bi.length > 0 && <AlertTriangle size={12} className="shrink-0" style={{ color: bi.some(i => i.severity === 'error') ? '#FF9AA8' : '#F7C46C' }} aria-label={`${bi.length} warning${bi.length === 1 ? '' : 's'}`} />}
                    <button type="button" className={iconBtn} aria-label={off ? 'Enable behaviour' : 'Disable behaviour'} title={off ? 'Enable' : 'Disable'} onClick={() => commit(setDisabled(page, b.id, !off))}>{off ? <EyeOff size={13} /> : <Eye size={13} />}</button>
                    <button type="button" className={iconBtn} aria-label="Duplicate behaviour" title="Duplicate" onClick={() => commit(duplicateBehavior(page, b.id))}><Copy size={13} /></button>
                    <button type="button" className={`${iconBtn} hover:!text-[#FF8FA8]`} aria-label="Delete behaviour" title="Delete" onClick={() => { commit(removeBehavior(page, b.id)); if (openId === b.id) setOpenId(null); }}><Trash2 size={13} /></button>
                  </div>
                  {open && <div className="px-2 pb-2"><BehaviorForm b={b} ctx={ctx} issues={bi} onChange={nb => updateB(nb)} /></div>}
                </div>
              );
            })}
          </div>
          {(page.music || cues.length > 0) && (
            <div className="mt-3 rounded-[10px] border border-white/[.09] p-2">
              <div className={lbl}>Page music</div>
              <div className="grid grid-cols-2 gap-1.5">
                <label><div className={lbl}>Cue when page opens</div><input className={inp} list="tbp-cue-page" value={page.music?.cue ?? ''} onChange={e => commit({ ...page, music: e.target.value ? { cue: e.target.value, fadeMs: page.music?.fadeMs } : undefined }, 'music')} /></label>
                <label><div className={lbl}>Ambience bed</div><input className={inp} list="tbp-bed-page" value={page.ambience?.bed ?? ''} onChange={e => commit({ ...page, ambience: e.target.value ? { bed: e.target.value, gain: page.ambience?.gain } : undefined }, 'amb')} /></label>
              </div>
              <datalist id="tbp-cue-page">{cues.map(c => <option key={c} value={c} />)}</datalist><datalist id="tbp-bed-page">{cat.ambience.map(c => <option key={c} value={c} />)}</datalist>
            </div>
          )}
          {issues.filter(i => !i.behaviorId).map((i, k) => <div key={k} className="mt-2 text-[10px] text-[#F7C46C]">{i.message}</div>)}
        </div>
      )}

      {tab === 'add' && (
        <div>
          {!sel && <div className="mb-2 text-[10.5px] text-[#F7C46C]">Select an object on the canvas to attach a behaviour to it (page presets work without).</div>}
          {sel && <div className="mb-2 text-[10.5px] text-white/55">Adding to <b className="text-white/80">{sel.objectLabel || sel.kind}</b></div>}
          {(['Idle life', 'Reactions', 'Play', 'Page'] as const).map(g => (
            <div key={g} className="mb-2.5">
              <div className={lbl}>{g}</div>
              <div className="grid grid-cols-2 gap-1.5">
                {PRESETS.filter(p => p.group === g).map(p => (
                  <button key={p.id} type="button" onClick={() => (p.id === 'drag-reveal' || p.id === 'music' ? setPresetFor(p) : addPreset(p))} disabled={p.needs === 'object' && !sel}
                    className="text-left rounded-[9px] border border-white/[.1] bg-white/[.03] hover:bg-white/[.07] disabled:opacity-40 px-2 py-1.5">
                    <div className="text-[11px] font-extrabold text-white/85">{p.title}</div>
                    <div className="text-[9.5px] leading-snug text-white/45">{p.blurb}</div>
                  </button>
                ))}
              </div>
            </div>
          ))}
          {presetFor && (
            <div className="rounded-[10px] border border-[#00DAF3]/30 bg-[rgba(0,218,243,.05)] p-2 mb-2">
              <div className="text-[11px] font-extrabold text-[#8FF5FF] mb-1">{presetFor.title}</div>
              {presetFor.id === 'drag-reveal' && <label><div className={lbl}>What is revealed (label, ending * for several)</div><input className={inp} list="tbp-labels" value={pArg.reveal} placeholder="Hidden*" onChange={e => setPArg(a => ({ ...a, reveal: e.target.value }))} /></label>}
              {presetFor.id === 'music' && <label><div className={lbl}>Music cue</div><input className={inp} list="tbp-cue-add" value={pArg.cue} placeholder={cues[0] || 'main'} onChange={e => setPArg(a => ({ ...a, cue: e.target.value }))} /></label>}
              <datalist id="tbp-labels">{labels.map(l => <option key={l} value={l} />)}</datalist><datalist id="tbp-cue-add">{cues.map(c => <option key={c} value={c} />)}</datalist>
              <div className="flex gap-1.5 mt-2"><button className={`${chip} !bg-[rgba(107,0,153,.55)] !text-white`} onClick={() => addPreset(presetFor)}>Add</button><button className={chip} onClick={() => setPresetFor(null)}>Cancel</button></div>
            </div>
          )}
          <button type="button" className={`${chip} w-full`} onClick={addBlank}><Plus size={11} className="inline -mt-0.5 mr-1" />Blank behaviour (advanced)</button>
        </div>
      )}

      {tab === 'json' && (
        <div>
          <div className="text-[10px] text-white/45 mb-1 leading-snug">The raw living data for this page (the same JSON the reader runs). Edit it, then Apply.</div>
          <textarea aria-label="Living page JSON" spellCheck={false} value={jsonText} onChange={e => { setJsonText(e.target.value); setJsonErr(''); }} rows={16} className="w-full rounded-[8px] bg-black/30 border border-white/[.14] text-[10.5px] text-white/85 p-2 font-mono outline-none" />
          {jsonErr && <div role="alert" className="text-[10.5px] text-[#FF9AA8] mt-1">{jsonErr}</div>}
          <div className="flex gap-1.5 mt-1.5">
            <button type="button" className={`${chip} !bg-[rgba(107,0,153,.55)] !text-white`} onClick={() => { const r = parseLivingPageJson(jsonText, pageNumber); if ('error' in r) setJsonErr(r.error); else { commit(r.page); setFlash('JSON applied.'); setJsonErr(''); } }}>Apply</button>
            <button type="button" className={chip} onClick={() => { setJsonText(JSON.stringify(page, null, 2)); setJsonErr(''); }}>Reset</button>
          </div>
        </div>
      )}

      {preview && (
        <Suspense fallback={null}>
          <TelaLivePreview objects={objects} width={frameSize(doc, frame).width} height={frameSize(doc, frame).height} page={runnablePage(page)} scores={doc.living?.scores} defaults={doc.living?.defaults} title={`Page ${pageNumber}`} onClose={() => setPreview(false)} />
        </Suspense>
      )}
    </section>
  );
}
