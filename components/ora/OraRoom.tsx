import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, Check, Lock, Sparkles, ArrowLeft, Share2 } from 'lucide-react';
import { Button, IconButton, Surface, Actions, Eyebrow, Input, Textarea, Chip } from '../ui';
import Stillness from './Stillness';
import Together from './Together';
import Commonplace from './Commonplace';
import SeasonCardModal from './SeasonCardModal';
import Workbench from './Workbench';
import { Circle, Shelf, Portfolio, Rhythm } from './WorkSurfaces';
import {
  getProfile, enableOra, getCheckin, saveCheckin, listCheckins,
  listEntries, saveEntry, deleteEntry,
  listGoals, saveGoal, deleteGoal,
  listRituals, saveRitual,
  today, currentSeason,
} from '../../services/oraService';
import {
  ORA_ADAPTERS, adapterFor, refreshGoals, isStale, previewAdapters,
} from '../../services/oraAdapters';
import type { OraProfile, OraCheckin, OraEntry, OraGoal, OraRitual } from '../../types';

/**
 * Ora — the Room (Direction A behind the orb).
 *
 * One thing at a time, and the controls stay out of the way until reached for.
 * This is the destination the Companion Rail opens into: Today (the breath and
 * the check-in), Longhand (journal), Compass (goals).
 *
 * Blueprint: docs/PLAJAH_WELLBEING_SUITE_BLUEPRINT.md
 */

const MOODS: Array<{ v: 1 | 2 | 3 | 4 | 5; glyph: string; label: string }> = [
  { v: 1, glyph: '◔', label: 'Rough' },
  { v: 2, glyph: '◑', label: 'Low' },
  { v: 3, glyph: '◕', label: 'Steady' },
  { v: 4, glyph: '●', label: 'Good' },
  { v: 5, glyph: '◉', label: 'Bright' },
];

const PROMPTS = [
  'What actually happened today?',
  'What took more out of you than it should have?',
  'What are you carrying that is not yours?',
  'Name one thing that went right.',
  'What would you tell someone else in your position?',
];

type Rail = 'CARE' | 'WORK';
type Tab = 'TODAY' | 'STILLNESS' | 'TOGETHER' | 'LONGHAND'
  | 'COMPASS' | 'WORKBENCH' | 'RHYTHM' | 'NOTES' | 'CIRCLE' | 'SHELF' | 'PORTFOLIO';

/**
 * Two rails, because the halves win on different arguments: the care side is
 * about showing up, the work side is about what Plajah can already see. Keeping
 * them in one flat row would have put nine tabs on a phone.
 */
const RAILS: Record<Rail, { label: string; tabs: Tab[] }> = {
  CARE: { label: 'Care', tabs: ['TODAY', 'STILLNESS', 'TOGETHER', 'LONGHAND'] },
  WORK: { label: 'Work', tabs: ['COMPASS', 'WORKBENCH', 'RHYTHM', 'NOTES', 'CIRCLE', 'SHELF', 'PORTFOLIO'] },
};

const TAB_LABEL: Record<Tab, string> = {
  TODAY: 'Today', STILLNESS: 'Breathe', TOGETHER: 'Together',
  LONGHAND: 'Journal', COMPASS: 'Goals', WORKBENCH: 'Workbench',
  RHYTHM: 'Rhythm', NOTES: 'Notes', CIRCLE: 'Circle', SHELF: 'Shelf', PORTFOLIO: 'Portfolio',
};

function greeting(d = new Date()): string {
  const h = d.getHours();
  if (h < 5) return 'Still up';
  if (h < 12) return 'Morning';
  if (h < 17) return 'Afternoon';
  if (h < 22) return 'Evening';
  return 'Late';
}

// ── onboarding ───────────────────────────────────────────────────────────

const Welcome: React.FC<{ onEnable: () => void; busy: boolean }> = ({ onEnable, busy }) => (
  <div style={{ maxWidth: 620, margin: '0 auto', padding: 'var(--pj-space-12) var(--pj-space-6)' }}>
    <Eyebrow>Ora</Eyebrow>
    <h1 className="type-display-sm" style={{ margin: 'var(--pj-space-3) 0 var(--pj-space-4)' }}>
      The hour Plajah gets quiet.
    </h1>
    <p className="type-body-lg" style={{ color: 'var(--on-surface-variant)', marginTop: 0 }}>
      A check-in that takes five seconds, a journal only you can read, and goals that
      Plajah can actually verify — because it already holds the work.
    </p>

    <Surface level={2} shape="sheet" style={{ marginTop: 'var(--pj-space-8)' }}>
      <div style={{ display: 'flex', gap: 'var(--pj-space-3)', alignItems: 'flex-start' }}>
        <Lock size={18} style={{ color: 'var(--pj-cyan)', flex: 'none', marginTop: 2 }} />
        <div>
          <p className="type-title-md" style={{ margin: '0 0 6px' }}>Private is the floor, not a setting</p>
          <p className="type-body-sm" style={{ margin: 0, color: 'var(--on-surface-variant)', lineHeight: 1.6 }}>
            Journal entries and check-in notes are encrypted before they leave your device.
            Nothing here is ever placed in a feed, a search index, a link preview, a
            recommendation, an advert, or a training set. You can export or delete all of
            it in one action, whenever you want.
          </p>
        </div>
      </div>
    </Surface>

    <Actions style={{ marginTop: 'var(--pj-space-8)', justifyContent: 'flex-start' }}>
      <Button variant="primary" size="lg" icon={<Sparkles />} loading={busy} onClick={onEnable}>
        Turn on Ora
      </Button>
    </Actions>
    <p className="type-body-sm" style={{ color: 'var(--on-surface-variant)', marginTop: 'var(--pj-space-4)' }}>
      Nothing is written anywhere until you do.
    </p>
  </div>
);

// ── Today ────────────────────────────────────────────────────────────────

const RITUAL_STEPS: Array<{ k: OraRitual['steps'][number]; label: string }> = [
  { k: 'CHECKIN', label: 'Check in' },
  { k: 'BREATH', label: 'Breathe' },
  { k: 'JOURNAL', label: 'Write' },
  { k: 'GRATITUDE', label: 'Name one good thing' },
  { k: 'GOALS', label: 'Look at goals' },
];

/**
 * Rituals — Stoic's structure without its severity. A named chain of things you
 * already do, offered rather than demanded: there is no notification, no red
 * badge and no penalty for skipping one.
 */
const Rituals: React.FC<{ rituals: OraRitual[]; onAdd: (name: string, steps: OraRitual['steps']) => void }> = ({
  rituals, onAdd,
}) => {
  const [making, setMaking] = useState(false);
  const [name, setName] = useState('');
  const [steps, setSteps] = useState<OraRitual['steps']>(['CHECKIN', 'BREATH']);

  const toggle = (k: OraRitual['steps'][number]) =>
    setSteps((prev) => (prev.includes(k) ? prev.filter((s) => s !== k) : [...prev, k]));

  return (
    <div style={{ width: '100%', maxWidth: 460 }}>
      <Eyebrow style={{ marginBottom: 'var(--pj-space-3)' }}>Rituals</Eyebrow>
      {rituals.map((r) => (
        <Surface key={r.id} level={1} style={{ marginBottom: 'var(--pj-space-2)' }}>
          <p className="type-title-md" style={{ margin: 0 }}>{r.name}</p>
          <p className="type-body-sm" style={{ margin: 0, color: 'var(--on-surface-variant)' }}>
            {r.steps.map((k) => RITUAL_STEPS.find((s) => s.k === k)?.label).filter(Boolean).join(' · ')}
          </p>
        </Surface>
      ))}

      {making ? (
        <Surface level={2} shape="sheet">
          <Input label="Name it" placeholder="Evening wind-down" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--pj-space-2)', margin: 'var(--pj-space-4) 0' }}>
            {RITUAL_STEPS.map((s) => (
              <Chip key={s.k} interactive selected={steps.includes(s.k)} onClick={() => toggle(s.k)}>{s.label}</Chip>
            ))}
          </div>
          <Actions>
            <Button variant="ghost" onClick={() => setMaking(false)}>Cancel</Button>
            <Button
              variant="primary"
              disabled={!name.trim() || steps.length === 0}
              onClick={() => { onAdd(name.trim(), steps); setName(''); setSteps(['CHECKIN', 'BREATH']); setMaking(false); }}
            >
              Save ritual
            </Button>
          </Actions>
        </Surface>
      ) : (
        <Button variant="secondary" size="sm" icon={<Plus />} onClick={() => setMaking(true)} fullWidth>
          {rituals.length === 0 ? 'Build a ritual' : 'Add another'}
        </Button>
      )}
    </div>
  );
};

const TodayTab: React.FC<{
  checkin: OraCheckin | null;
  recent: OraCheckin[];
  streak: number;
  rituals: OraRitual[];
  onCheckin: (m: 1 | 2 | 3 | 4 | 5) => void;
  onAddRitual: (name: string, steps: OraRitual['steps']) => void;
  onSeasonCard: () => void;
}> = ({ checkin, recent, streak, rituals, onCheckin, onAddRitual, onSeasonCard }) => (
  <div style={{ display: 'grid', gap: 'var(--pj-space-8)', placeItems: 'center', textAlign: 'center', paddingTop: 'var(--pj-space-8)' }}>
    {/* The breath ring. The interface does the exercise with you — this is the
        one piece of motion in Ora that is the feature rather than decoration. */}
    <div className="ora-breath" aria-hidden="true">
      <span />
    </div>

    <div>
      <h2 className="type-headline-lg" style={{ margin: '0 0 var(--pj-space-2)' }}>{greeting()}</h2>
      <p className="type-body-lg" style={{ margin: 0, color: 'var(--on-surface-variant)' }}>
        {checkin ? 'Checked in today. Nothing else is asked of you.' : 'Four seconds, then you are done.'}
      </p>
    </div>

    <div style={{ display: 'flex', gap: 'var(--pj-space-2)' }}>
      {MOODS.map((m) => (
        <button
          key={m.v}
          type="button"
          aria-label={m.label}
          aria-pressed={checkin?.mood === m.v}
          onClick={() => onCheckin(m.v)}
          className="tap-lg"
          style={{
            width: 52, height: 52, borderRadius: '50%', cursor: 'pointer',
            border: '1px solid ' + (checkin?.mood === m.v ? 'var(--pj-orange)' : 'var(--pj-border)'),
            background: checkin?.mood === m.v ? 'var(--pj-orange-soft)' : 'var(--pj-glass-2)',
            color: checkin?.mood === m.v ? 'var(--pj-orange)' : 'var(--text-primary)',
            fontSize: 20, lineHeight: 1,
            transition: 'all var(--pj-dur-base) var(--pj-ease-standard)',
          }}
        >
          {m.glyph}
        </button>
      ))}
    </div>

    {/* The ribbon. A month of days, no numbers, no grade — you are looking at a
        shape, not a score. Deliberately not a chart. */}
    {recent.length > 0 && (
      <div style={{ width: '100%', maxWidth: 460 }}>
        <Eyebrow style={{ marginBottom: 'var(--pj-space-3)' }}>
          {streak > 0 ? `${streak} day${streak === 1 ? '' : 's'} tended` : 'Your last month'}
        </Eyebrow>
        <div style={{ display: 'flex', gap: 3, justifyContent: 'center' }}>
          {recent.slice(0, 30).reverse().map((c) => (
            <span
              key={c.day}
              title={c.day}
              style={{
                flex: 1, height: 26, maxWidth: 12, borderRadius: 3,
                background: `color-mix(in srgb, var(--pj-lilac) ${c.mood * 18}%, var(--pj-glass-2))`,
              }}
            />
          ))}
        </div>
      </div>
    )}

    {/* The one thing in Ora meant to be shared — counts only, nothing private.
        It is also the suite's only growth loop, so it earns a place on the
        first screen rather than being buried in a menu. */}
    {(streak > 0 || recent.length > 2) && (
      <Button variant="outline" size="sm" icon={<Share2 />} onClick={onSeasonCard}>
        Share your season
      </Button>
    )}

    <Rituals rituals={rituals} onAdd={onAddRitual} />
  </div>
);

// ── Longhand ─────────────────────────────────────────────────────────────

const LonghandTab: React.FC<{
  entries: OraEntry[];
  onSave: (title: string, body: string) => Promise<void>;
  onDelete: (id: string) => void;
}> = ({ entries, onSave, onDelete }) => {
  const [writing, setWriting] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const prompt = useMemo(() => PROMPTS[new Date().getDate() % PROMPTS.length], []);

  const submit = async () => {
    if (!body.trim()) return;
    setBusy(true);
    await onSave(title.trim(), body.trim());
    setBusy(false);
    setTitle(''); setBody(''); setWriting(false);
  };

  return (
    <div style={{ display: 'grid', gap: 'var(--pj-space-6)' }}>
      {writing ? (
        <Surface level={2} shape="sheet">
          <Eyebrow>{prompt}</Eyebrow>
          <div style={{ display: 'grid', gap: 'var(--pj-space-4)', marginTop: 'var(--pj-space-4)' }}>
            <Input placeholder="Title (optional)" value={title} onChange={(e) => setTitle(e.target.value)} />
            <Textarea
              placeholder="Write as much or as little as you want."
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={9}
              autoFocus
            />
          </div>
          <Actions style={{ marginTop: 'var(--pj-space-5)' }}>
            <Button variant="ghost" onClick={() => setWriting(false)}>Discard</Button>
            <Button variant="primary" icon={<Check />} loading={busy} onClick={submit} disabled={!body.trim()}>
              Save entry
            </Button>
          </Actions>
          <p className="type-body-sm" style={{ margin: 'var(--pj-space-4) 0 0', color: 'var(--on-surface-variant)' }}>
            Encrypted before it leaves this device.
          </p>
        </Surface>
      ) : (
        <Button variant="primary" size="lg" icon={<Plus />} onClick={() => setWriting(true)} fullWidth>
          Write today
        </Button>
      )}

      {entries.length === 0 && !writing && (
        <p className="type-body-md" style={{ color: 'var(--on-surface-variant)', textAlign: 'center', padding: 'var(--pj-space-8) 0' }}>
          Nothing written yet. A year of these compiles into a book in Lorea.
        </p>
      )}

      {entries.map((e) => (
        <Surface key={e.id} level={1}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 'var(--pj-space-3)' }}>
            <div style={{ minWidth: 0 }}>
              <p className="type-title-md" style={{ margin: 0 }}>{e.title || 'Untitled'}</p>
              <p className="type-body-sm" style={{ margin: 0, color: 'var(--on-surface-variant)' }}>{e.day}</p>
            </div>
            <IconButton variant="ghost" size="sm" aria-label="Delete entry" onClick={() => onDelete(e.id)}>
              <Trash2 />
            </IconButton>
          </div>
          <p className="type-body-md" style={{ margin: 'var(--pj-space-3) 0 0', whiteSpace: 'pre-wrap', color: 'var(--on-surface-variant)' }}>
            {e.body}
          </p>
        </Surface>
      ))}
    </div>
  );
};

// ── Compass ──────────────────────────────────────────────────────────────

const CompassTab: React.FC<{
  goals: OraGoal[];
  preview: Record<string, number | null>;
  onAdd: (title: string, target?: number, unit?: string, adapterKey?: string) => Promise<void>;
  onBump: (g: OraGoal, delta: number) => void;
  onDelete: (id: string) => void;
}> = ({ goals, preview, onAdd, onBump, onDelete }) => {
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('');
  const [target, setTarget] = useState('');
  const [unit, setUnit] = useState('');
  const [adapterKey, setAdapterKey] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  const chosen = adapterFor(adapterKey);

  const submit = async () => {
    if (!title.trim()) return;
    setBusy(true);
    const t = Number(target);
    await onAdd(
      title.trim(),
      Number.isFinite(t) && t > 0 ? t : undefined,
      unit.trim() || chosen?.unit || undefined,
      adapterKey,
    );
    setBusy(false);
    setTitle(''); setTarget(''); setUnit(''); setAdapterKey(undefined); setAdding(false);
  };

  return (
    <div style={{ display: 'grid', gap: 'var(--pj-space-5)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--pj-space-3)' }}>
        <Eyebrow>{currentSeason()}</Eyebrow>
        {!adding && (
          <Button variant="secondary" size="sm" icon={<Plus />} onClick={() => setAdding(true)}>Add goal</Button>
        )}
      </div>

      {adding && (
        <Surface level={2} shape="sheet">
          <div style={{ display: 'grid', gap: 'var(--pj-space-4)' }}>
            <Input label="Goal" placeholder="Release the EP" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--pj-space-3)' }}>
              <Input label="Target" type="number" inputMode="numeric" placeholder="9" value={target} onChange={(e) => setTarget(e.target.value)} />
              <Input label="Unit" placeholder={chosen?.unit || 'tracks'} value={unit} onChange={(e) => setUnit(e.target.value)} />
            </div>

            {/* The adapter picker — the reason this is not another habit tracker.
                Each option shows what the signal says right now, so the choice is
                concrete rather than a promise. A signal that cannot be read says
                so, and is never dressed up as a zero. */}
            <div>
              <p className="type-label-lg" style={{ margin: '0 0 var(--pj-space-2)' }}>How does progress arrive?</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--pj-space-2)' }}>
                <Chip interactive selected={!adapterKey} onClick={() => setAdapterKey(undefined)}>
                  I'll track it myself
                </Chip>
                {ORA_ADAPTERS.map((a) => {
                  const v = preview[a.key];
                  return (
                    <Chip
                      key={a.key}
                      interactive
                      selected={adapterKey === a.key}
                      onClick={() => setAdapterKey(a.key)}
                    >
                      {a.goalLabel}
                      <span style={{ opacity: 0.6, marginLeft: 6, fontVariantNumeric: 'tabular-nums' }}>
                        {v === null || v === undefined ? '—' : v}
                      </span>
                    </Chip>
                  );
                })}
              </div>
              <p className="type-body-sm" style={{ margin: 'var(--pj-space-3) 0 0', color: 'var(--on-surface-variant)' }}>
                {chosen
                  ? `${chosen.explains} Plajah updates this for you — you never tick it off.`
                  : 'You update this one by hand. It will be labelled self-reported.'}
              </p>
            </div>
          </div>
          <Actions style={{ marginTop: 'var(--pj-space-5)' }}>
            <Button variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
            <Button variant="primary" loading={busy} onClick={submit} disabled={!title.trim()}>Add goal</Button>
          </Actions>
        </Surface>
      )}

      {goals.length === 0 && !adding && (
        <p className="type-body-md" style={{ color: 'var(--on-surface-variant)', textAlign: 'center', padding: 'var(--pj-space-8) 0' }}>
          No goals this season yet.
        </p>
      )}

      {goals.map((g) => {
        const pct = g.target ? Math.min(100, Math.round((g.progress / g.target) * 100)) : 0;
        return (
          <Surface key={g.id} level={1}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 'var(--pj-space-3)' }}>
              <p className="type-title-md" style={{ margin: 0 }}>{g.title}</p>
              {g.target != null && (
                <span className="type-body-sm" style={{ color: 'var(--on-surface-variant)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                  {g.progress} / {g.target}{g.unit ? ` ${g.unit}` : ''}
                </span>
              )}
            </div>

            {g.target != null && (
              <div style={{ height: 4, borderRadius: 2, background: 'var(--pj-glass-2)', margin: 'var(--pj-space-3) 0', overflow: 'hidden' }}>
                <span style={{ display: 'block', height: '100%', width: `${pct}%`, borderRadius: 2, backgroundImage: 'var(--pj-grad-ember)' }} />
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--pj-space-2)', flexWrap: 'wrap' }}>
              {/* The provenance chip — the one thing no standalone tracker can print.
                  Three honest states, never blurred: verified against a live signal,
                  verified but the signal has not been read recently, or self-reported.
                  A goal is never shown as verified on the strength of an old read. */}
              {g.mode === 'AUTO' && g.provenance && !isStale(g) ? (
                <Chip selected>verified · {g.provenance.label}</Chip>
              ) : g.mode === 'AUTO' ? (
                <Chip>{g.provenance ? `${g.provenance.label} · not synced yet` : 'waiting for signal'}</Chip>
              ) : (
                <Chip>self-reported</Chip>
              )}
              <span style={{ flex: 1 }} />
              {g.target != null && g.mode === 'MANUAL' && (
                <>
                  <Button variant="ghost" size="xs" onClick={() => onBump(g, -1)} disabled={g.progress <= 0}>−</Button>
                  <Button variant="secondary" size="xs" onClick={() => onBump(g, 1)}>+1</Button>
                </>
              )}
              <IconButton variant="ghost" size="sm" aria-label="Delete goal" onClick={() => onDelete(g.id)}>
                <Trash2 />
              </IconButton>
            </div>
          </Surface>
        );
      })}
    </div>
  );
};

// ── the room ─────────────────────────────────────────────────────────────

export const OraRoom: React.FC<{ onBack?: () => void }> = ({ onBack }) => {
  const [profile, setProfile] = useState<OraProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [rail, setRail] = useState<Rail>('CARE');
  const [tab, setTab] = useState<Tab>('TODAY');
  const [checkin, setCheckin] = useState<OraCheckin | null>(null);
  const [recent, setRecent] = useState<OraCheckin[]>([]);
  const [entries, setEntries] = useState<OraEntry[]>([]);
  const [goals, setGoals] = useState<OraGoal[]>([]);
  const [preview, setPreview] = useState<Record<string, number | null>>({});
  const [rituals, setRituals] = useState<OraRitual[]>([]);
  const [showSeasonCard, setShowSeasonCard] = useState(false);

  const refresh = async () => {
    const [c, r, e, g, rt] = await Promise.all([
      getCheckin(), listCheckins(30), listEntries(50), listGoals(currentSeason()), listRituals(),
    ]);
    setCheckin(c); setRecent(r); setEntries(e); setGoals(g); setRituals(rt);
    // Read the live signals after the goals are on screen, not before — a slow
    // adapter must never hold up the room. Goals appear with their last known
    // numbers and quietly settle to current.
    void refreshGoals(g).then(setGoals);
    void previewAdapters().then(setPreview);
  };

  useEffect(() => {
    let alive = true;
    (async () => {
      const p = await getProfile();
      if (!alive) return;
      setProfile(p);
      if (p?.enabled) await refresh();
      if (alive) setLoading(false);
    })();
    return () => { alive = false; };
  }, []);

  const turnOn = async () => {
    setBusy(true);
    const p = await enableOra();
    setProfile(p);
    if (p) await refresh();
    setBusy(false);
  };

  const doCheckin = async (mood: 1 | 2 | 3 | 4 | 5) => {
    const saved = await saveCheckin({ mood, surface: 'ROOM' });
    if (saved) { setCheckin(saved); setRecent(await listCheckins(30)); }
  };

  const addRitual = async (name: string, steps: OraRitual['steps']) => {
    await saveRitual({ name, steps });
    setRituals(await listRituals());
  };

  const addEntry = async (title: string, body: string) => {
    await saveEntry({ title: title || undefined, body });
    setEntries(await listEntries(50));
  };

  const removeEntry = async (id: string) => {
    await deleteEntry(id);
    setEntries((prev) => prev.filter((e) => e.id !== id));
  };

  const addGoal = async (title: string, target?: number, unit?: string, adapterKey?: string) => {
    await saveGoal({
      title, target, unit,
      mode: adapterKey ? 'AUTO' : 'MANUAL',
      adapter: adapterKey,
    });
    const next = await listGoals(currentSeason());
    setGoals(next);
    // A new AUTO goal should show its real number immediately, not on next open.
    setGoals(await refreshGoals(next));
  };

  const bumpGoal = async (g: OraGoal, delta: number) => {
    const progress = Math.max(0, g.progress + delta);
    const status: OraGoal['status'] = g.target != null && progress >= g.target ? 'DONE' : 'ACTIVE';
    await saveGoal({ ...g, progress, status, completedAt: status === 'DONE' ? Date.now() : undefined });
    setGoals(await listGoals(currentSeason()));
  };

  const removeGoal = async (id: string) => {
    await deleteGoal(id);
    setGoals((prev) => prev.filter((g) => g.id !== id));
  };

  const shell = (children: React.ReactNode) => (
    <div
      style={{
        minHeight: '100dvh', overflowY: 'auto',
        background: 'var(--bg-color)', color: 'var(--text-primary)',
        backgroundImage:
          'radial-gradient(900px 520px at 15% -10%, color-mix(in srgb, var(--pj-purple) 30%, transparent), transparent 62%),' +
          'radial-gradient(700px 620px at 85% 108%, color-mix(in srgb, var(--pj-cyan) 12%, transparent), transparent 66%)',
      }}
    >
      {children}
    </div>
  );

  if (loading) return shell(<div style={{ padding: 'var(--pj-space-16)', textAlign: 'center', color: 'var(--on-surface-variant)' }}>…</div>);
  if (!profile?.enabled) return shell(<Welcome onEnable={turnOn} busy={busy} />);

  return shell(
    <div style={{ maxWidth: 720, margin: '0 auto', padding: 'var(--pj-space-6) var(--pj-space-5) var(--pj-space-20)' }}>
      <div style={{ display: 'grid', gap: 'var(--pj-space-4)', marginBottom: 'var(--pj-space-6)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--pj-space-3)' }}>
          {onBack && <IconButton variant="ghost" size="sm" aria-label="Back" onClick={onBack}><ArrowLeft /></IconButton>}
          <Eyebrow style={{ marginRight: 'auto' }}>Ora</Eyebrow>
          {(Object.keys(RAILS) as Rail[]).map((r) => (
            <Chip
              key={r}
              interactive
              selected={rail === r}
              onClick={() => { setRail(r); setTab(RAILS[r].tabs[0]); }}
            >
              {RAILS[r].label}
            </Chip>
          ))}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--pj-space-2)' }}>
          {RAILS[rail].tabs.map((t) => (
            <Chip key={t} interactive selected={tab === t} onClick={() => setTab(t)}>
              {TAB_LABEL[t]}
            </Chip>
          ))}
        </div>
      </div>

      {tab === 'TODAY' && (
        <TodayTab
          checkin={checkin}
          recent={recent}
          streak={profile.streak?.current ?? 0}
          rituals={rituals}
          onCheckin={doCheckin}
          onAddRitual={addRitual}
          onSeasonCard={() => setShowSeasonCard(true)}
        />
      )}
      {/* A finished session can move a minutes goal, so refresh when one lands. */}
      {tab === 'STILLNESS' && <Stillness onLogged={() => void refresh()} />}
      {tab === 'TOGETHER' && <Together onLogged={() => void refresh()} />}
      {tab === 'LONGHAND' && <LonghandTab entries={entries} onSave={addEntry} onDelete={removeEntry} />}
      {tab === 'WORKBENCH' && <Workbench />}
      {tab === 'RHYTHM' && <Rhythm />}
      {tab === 'NOTES' && <Commonplace />}
      {tab === 'CIRCLE' && <Circle />}
      {tab === 'SHELF' && <Shelf />}
      {tab === 'PORTFOLIO' && <Portfolio />}

      {showSeasonCard && <SeasonCardModal onClose={() => setShowSeasonCard(false)} />}
      {tab === 'COMPASS' && (
        <CompassTab goals={goals} preview={preview} onAdd={addGoal} onBump={bumpGoal} onDelete={removeGoal} />
      )}
    </div>
  );
};

export default OraRoom;
