import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertTriangle, BellOff, CalendarDays, Check, ChevronLeft, ChevronRight, Copy, Download, ExternalLink,
  EyeOff, Layers, Link2, ListTodo, Loader2, MapPin, Pencil, Pin, Plus, RefreshCw, Repeat, Sparkles, Trash2, Upload, X,
} from 'lucide-react';
import { Button, IconButton } from '../../ui';
import { auth } from '../../../services/firebase';
import {
  CAL_LAYERS, DEFAULT_CAL_PREFS, deleteEvent, fetchFeedUrl, fetchGoogleEvents, fetchPlatformFeed,
  invalidatePlatformFeed, keepPlatformItem, layerColor, listenMyEvents, loadCalendarPrefs, newEventId,
  pushToGoogle, saveCalendarPrefs, saveEvent, skipOccurrence,
  type CalendarEvent, type CalendarPrefs, type CalLayer,
} from '../../../services/postman/calendarService';
import {
  addDays, addMonths, DAY, dayKey, downloadIcs, expandOccurrences, fmtRange, fmtTime, googleCalendarLink,
  HOUR, localZone, MIN, monthGrid, parseIcs, parseQuickAdd, RECURRENCE_LABEL, relativeWhen, sameDay,
  startOfDay, startOfWeek, zoneAbbrev, type Recurrence,
} from '../../../services/postman/calendarTime';
import { listenCorrespondences } from '../../../services/postman/lettersService';

/**
 * Calendar — the Post Man's Schedule room.
 *
 * Frustrations it is designed against, one by one:
 *  - "I have to type everything twice." Releases, tickets, RSVPs, classes,
 *    games and services arrive on their own, from the data Plajah already has.
 *  - "8pm whose time?" Every event remembers its zone; when it differs from
 *    yours, both are shown.
 *  - "Forms to add one event." Type a sentence. Enter.
 *  - "Double-booked again." Overlaps are flagged where you will see them.
 *  - "Another calendar to check." One private link puts all of it into the
 *    calendar app you already use, and Google Calendar shows up here.
 *  - "Spam on my calendar." Only things you follow, bought or joined appear,
 *    and "not for me" / "mute this creator" is one tap.
 */

type View = 'month' | 'week' | 'agenda';
type Occ = CalendarEvent & { occurrenceStart: number };

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

interface Props {
  onNotice: (n: { kind: 'ok' | 'error'; text: string }) => void;
  onConnectGoogle: () => void;
  googleAccounts: number;
}

const CalendarRoom: React.FC<Props> = ({ onNotice, onConnectGoogle, googleAccounts }) => {
  const [prefs, setPrefs] = useState<CalendarPrefs>(DEFAULT_CAL_PREFS);
  const [view, setView] = useState<View>('month');
  const [anchor, setAnchor] = useState(() => startOfDay(Date.now()));
  const [mine, setMine] = useState<CalendarEvent[]>([]);
  const [platform, setPlatform] = useState<CalendarEvent[]>([]);
  const [google, setGoogle] = useState<CalendarEvent[]>([]);
  const [letterEvents, setLetterEvents] = useState<CalendarEvent[]>([]);
  const [needsConsent, setNeedsConsent] = useState<string[]>([]);
  const [loadingFeed, setLoadingFeed] = useState(true);
  const [quick, setQuick] = useState('');
  const [selected, setSelected] = useState<Occ | null>(null);
  const [editing, setEditing] = useState<CalendarEvent | null>(null);
  const [showLayers, setShowLayers] = useState(false);
  const [showSubscribe, setShowSubscribe] = useState(false);
  const [dayOpen, setDayOpen] = useState<Date | null>(null);
  const [now, setNow] = useState(Date.now());
  const fileRef = useRef<HTMLInputElement>(null);
  const quickRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void loadCalendarPrefs().then((p) => { setPrefs(p); setView(p.defaultView); });
    return listenMyEvents(setMine);
  }, []);
  useEffect(() => { const t = window.setInterval(() => setNow(Date.now()), MIN); return () => window.clearInterval(t); }, []);

  // Letters in transit and sealed letters are moments too.
  useEffect(() => listenCorrespondences((list) => {
    setLetterEvents(list.filter((c) => c.inTransitUntil).map((c) => ({
      id: `l:${c.roomId}`, title: `A letter from ${c.others.map((o) => o.name).join(', ')} arrives`,
      start: c.inTransitUntil!, end: c.inTransitUntil! + 15 * MIN, allDay: false, layer: 'letters' as const,
      source: 'letter' as const, readOnly: true, kindLabel: 'Letters', open: { kind: 'letter' as const, correspondenceId: c.roomId },
    })));
  }), []);

  // Visible range — a little wider than the grid so paging feels instant.
  const range = useMemo(() => {
    if (view === 'month') { const g = monthGrid(anchor, prefs.weekStartsOn); return { from: g[0].getTime(), to: addDays(g[41], 1).getTime() }; }
    if (view === 'week') { const s = startOfWeek(anchor, prefs.weekStartsOn); return { from: s.getTime(), to: addDays(s, 7).getTime() }; }
    return { from: startOfDay(now).getTime(), to: addDays(startOfDay(now), 60).getTime() };
  }, [view, anchor, prefs.weekStartsOn, now]);

  const loadRemote = useCallback(async (force = false) => {
    setLoadingFeed(true);
    const [p, g] = await Promise.all([
      fetchPlatformFeed(range.from - 7 * DAY, range.to + 7 * DAY, force).catch(() => []),
      googleAccounts > 0 ? fetchGoogleEvents(range.from - 7 * DAY, range.to + 7 * DAY) : Promise.resolve({ events: [], needsCalendarConsent: [], configured: true }),
    ]);
    setPlatform(p);
    setGoogle(g.events);
    setNeedsConsent(g.needsCalendarConsent);
    setLoadingFeed(false);
  }, [range.from, range.to, googleAccounts]);
  useEffect(() => { void loadRemote(); }, [loadRemote]);

  const updatePrefs = (patch: Partial<Omit<CalendarPrefs, 'updatedAt'>>) => {
    setPrefs((p) => ({ ...p, ...patch, updatedAt: Date.now() }));
    void saveCalendarPrefs(patch);
  };

  /* ── Merge, filter, expand ─────────────────────────────────────────────── */

  const keptKeys = useMemo(() => new Set(mine.map((e) => e.sourceKey).filter(Boolean) as string[]), [mine]);
  const occurrences: Occ[] = useMemo(() => {
    const hidden = new Set(prefs.hiddenLayers);
    const hiddenKeys = new Set(prefs.hiddenKeys);
    const muted = new Set(prefs.mutedCreators);
    const all = [
      ...mine,
      // A kept platform item already lives in "mine" — don't draw it twice.
      ...platform.filter((e) => !keptKeys.has(e.sourceKey ?? '') && !hiddenKeys.has(e.sourceKey ?? e.id) && !(e.byUid && muted.has(e.byUid))),
      ...google,
      ...letterEvents,
    ].filter((e) => !hidden.has(e.layer));
    return all.flatMap((e) => expandOccurrences(e, range.from - DAY, range.to + DAY)).sort((a, b) => a.start - b.start || Number(b.allDay) - Number(a.allDay));
  }, [mine, platform, google, letterEvents, prefs, keptKeys, range]);

  const byDay = useMemo(() => {
    const m = new Map<string, Occ[]>();
    for (const o of occurrences) {
      // Multi-day events appear on each day they cover.
      let d = startOfDay(o.start);
      const last = startOfDay(Math.max(o.start, o.end - 1));
      for (let i = 0; i < 40 && d.getTime() <= last.getTime(); i++, d = addDays(d, 1)) {
        const k = dayKey(d);
        if (!m.has(k)) m.set(k, []);
        m.get(k)!.push(o);
      }
    }
    return m;
  }, [occurrences]);

  /** Timed events that overlap another timed event you are committed to. */
  const conflicts = useMemo(() => {
    const committed = occurrences.filter((o) => !o.allDay && (o.layer === 'mine' || o.layer === 'events' || o.layer === 'learning' || o.layer === 'google'));
    const out = new Map<string, string>();
    for (let i = 0; i < committed.length; i++) {
      for (let j = i + 1; j < committed.length && committed[j].start < committed[i].end; j++) {
        const a = committed[i]; const b = committed[j];
        if (a.id === b.id) continue;
        out.set(`${a.id}@${a.start}`, b.title);
        out.set(`${b.id}@${b.start}`, a.title);
      }
    }
    return out;
  }, [occurrences]);

  const upNext = useMemo(() => occurrences.filter((o) => o.end > now).slice(0, 8), [occurrences, now]);

  /* ── Actions ───────────────────────────────────────────────────────────── */

  const parsed = useMemo(() => (quick.trim().length > 1 ? parseQuickAdd(quick) : null), [quick]);

  const addQuick = async () => {
    if (!parsed) return;
    try {
      await saveEvent({
        id: newEventId(), title: parsed.title, start: parsed.start, end: parsed.end, allDay: parsed.allDay,
        recurrence: parsed.recurrence, location: parsed.location, layer: 'mine', source: 'manual', tz: localZone(),
      });
      setQuick('');
      setAnchor(startOfDay(parsed.start));
      onNotice({ kind: 'ok', text: `Added “${parsed.title}” — ${new Date(parsed.start).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}.` });
    } catch (err) {
      onNotice({ kind: 'error', text: err instanceof Error ? err.message : 'Could not add that.' });
    }
  };

  const step = (dir: -1 | 1) => {
    if (view === 'month') setAnchor((a) => addMonths(a, dir));
    else if (view === 'week') setAnchor((a) => addDays(a, 7 * dir));
    else setAnchor((a) => addDays(a, 30 * dir));
  };

  // Keyboard: t = today, ←/→ = page, n = new, / = quick add.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || selected || editing) return;
      if (e.key === 't') setAnchor(startOfDay(Date.now()));
      else if (e.key === 'ArrowLeft') step(-1);
      else if (e.key === 'ArrowRight') step(1);
      else if (e.key === '/' || e.key === 'n') { e.preventDefault(); quickRef.current?.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const importIcs = async (file: File) => {
    try {
      const events = parseIcs(await file.text()).slice(0, 500);
      for (const e of events) {
        await saveEvent({
          id: `imp_${e.uid.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 80)}`, title: e.title, start: e.start, end: e.end,
          allDay: !!e.allDay, location: e.location, notes: e.description, recurrence: e.recurrence, layer: 'mine', source: 'import',
        });
      }
      onNotice({ kind: 'ok', text: `Imported ${events.length} ${events.length === 1 ? 'event' : 'events'}.` });
    } catch {
      onNotice({ kind: 'error', text: 'That file could not be read as a calendar.' });
    }
  };

  const title = view === 'month'
    ? anchor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
    : view === 'week'
      ? (() => { const s = startOfWeek(anchor, prefs.weekStartsOn); const e = addDays(s, 6); return `${s.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${e.toLocaleDateString(undefined, { month: s.getMonth() === e.getMonth() ? undefined : 'short', day: 'numeric', year: 'numeric' })}`; })()
      : 'Coming up';

  const [monthWord, yearWord] = view === 'month' ? [anchor.toLocaleDateString(undefined, { month: 'long' }), String(anchor.getFullYear())] : [title, ''];

  return (
    <div className="flex-1 min-h-0 flex">
      {/* ── Rail: up next + layers ─────────────────────────────────────────── */}
      <aside className="hidden 2xl:flex w-[300px] shrink-0 border-r border-theme flex-col overflow-y-auto" aria-label="Up next">
        <div className="p-5">
          <p className="pj-eyebrow mb-1">Today</p>
          <p className="text-2xl font-black tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
            {new Date(now).toLocaleDateString(undefined, { weekday: 'long' })}
          </p>
          <p className="text-sm" style={{ color: 'var(--on-surface-variant)' }}>
            {new Date(now).toLocaleDateString(undefined, { month: 'long', day: 'numeric' })} · {zoneAbbrev(now, localZone())}
          </p>
        </div>
        <div className="px-3 pb-4">
          <p className="pj-eyebrow px-2 mb-2">Up next</p>
          {upNext.length === 0 && <p className="text-xs px-2" style={{ color: 'var(--on-surface-variant)' }}>Nothing on the horizon. Enjoy it.</p>}
          <div className="flex flex-col gap-1">
            {upNext.map((o) => (
              <button key={`${o.id}@${o.start}`} type="button" onClick={() => setSelected(o)} className="pm-next tap text-left">
                <span className="pm-next__bar" style={{ background: layerColor(o.layer) }} />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold truncate">{o.title}</span>
                  <span className="block text-[11px] truncate" style={{ color: 'var(--on-surface-variant)' }}>
                    {o.start <= now ? 'Happening now' : relativeWhen(o.start, now)}
                    {!o.allDay && ` · ${fmtTime(o.start)}`}
                    {o.kindLabel ? ` · ${o.kindLabel}` : ''}
                  </span>
                  {conflicts.has(`${o.id}@${o.start}`) && (
                    <span className="flex items-center gap-1 text-[11px] mt-0.5" style={{ color: 'var(--pj-warning, #f59e0b)' }}>
                      <AlertTriangle size={10} /> overlaps {conflicts.get(`${o.id}@${o.start}`)}
                    </span>
                  )}
                </span>
                {o.byPhoto && <img src={o.byPhoto} alt="" className="w-7 h-7 rounded-full object-cover shrink-0" />}
              </button>
            ))}
          </div>
        </div>
        <div className="px-3 pb-6 mt-auto">
          <LayerList prefs={prefs} onToggle={(l) => updatePrefs({ hiddenLayers: prefs.hiddenLayers.includes(l) ? prefs.hiddenLayers.filter((x) => x !== l) : [...prefs.hiddenLayers, l] })} />
        </div>
      </aside>

      {/* ── Main ──────────────────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 flex flex-col">
        <div className="shrink-0 px-4 sm:px-6 pt-4 pb-3 border-b border-theme flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-baseline gap-3 min-w-0">
              <h2 className="text-3xl sm:text-4xl font-black tracking-tighter leading-none truncate" style={{ fontFamily: 'var(--font-display)' }}>
                {monthWord} {yearWord && <span style={{ color: 'var(--on-surface-variant)', fontWeight: 300 }}>{yearWord}</span>}
              </h2>
              {loadingFeed && <Loader2 size={14} className="animate-spin shrink-0" style={{ opacity: 0.5 }} />}
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <div className="pm-seg" role="tablist" aria-label="Calendar view">
                {(['month', 'week', 'agenda'] as View[]).map((v) => (
                  <button key={v} role="tab" aria-selected={view === v} type="button" onClick={() => { setView(v); updatePrefs({ defaultView: v }); }}>
                    {v === 'month' ? 'Month' : v === 'week' ? 'Week' : 'Agenda'}
                  </button>
                ))}
              </div>
              <IconButton variant="ghost" size="sm" aria-label="Previous" onClick={() => step(-1)}><ChevronLeft /></IconButton>
              <Button variant="secondary" size="sm" onClick={() => setAnchor(startOfDay(Date.now()))}>Today</Button>
              <IconButton variant="ghost" size="sm" aria-label="Next" onClick={() => step(1)}><ChevronRight /></IconButton>
              <IconButton variant="ghost" size="sm" aria-label="Layers" className="2xl:hidden" onClick={() => setShowLayers(true)}><Layers /></IconButton>
              <IconButton variant="ghost" size="sm" aria-label="Refresh" onClick={() => { invalidatePlatformFeed(); void loadRemote(true); }}><RefreshCw /></IconButton>
              <Button variant="ghost" size="sm" icon={<Link2 />} onClick={() => setShowSubscribe(true)}>Connect</Button>
            </div>
          </div>

          {/* Quick add — a sentence, not a form. */}
          <form
            className="pm-quick"
            onSubmit={(e) => { e.preventDefault(); void addQuick(); }}
          >
            <Sparkles size={15} className="text-brand-orange shrink-0" />
            <input
              ref={quickRef}
              value={quick}
              onChange={(e) => setQuick(e.target.value)}
              placeholder="Add anything — “dinner with Ana fri 7pm at Nuit”, “standup every weekday 9:30”, “Mom’s birthday may 4”"
              aria-label="Quick add"
              className="flex-1 bg-transparent outline-none text-sm min-w-0"
            />
            <Button type="submit" variant="accent" size="xs" icon={<Plus />} disabled={!parsed}>Add</Button>
          </form>
          {parsed && (
            <p className="-mt-1.5 px-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs" style={{ color: 'var(--on-surface-variant)' }} aria-live="polite">
              <span>Adds</span>
              <b style={{ color: 'var(--text-primary)' }}>{parsed.title}</b>
              <span>· {new Date(parsed.start).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}</span>
              <span>· {parsed.allDay ? 'all day' : `${fmtTime(parsed.start)} – ${fmtTime(parsed.end)}`}</span>
              {parsed.recurrence !== 'none' && <span className="inline-flex items-center gap-1">· <Repeat size={11} />{RECURRENCE_LABEL[parsed.recurrence].toLowerCase()}</span>}
              {parsed.location && <span className="inline-flex items-center gap-1">· <MapPin size={11} />{parsed.location}</span>}
              {!parsed.confident && <span>· add a day or time to place it</span>}
            </p>
          )}

          {needsConsent.length > 0 && (
            <div className="flex items-center justify-between gap-3 rounded-card px-3 py-2 text-xs" style={{ background: 'var(--pj-warning-soft)' }}>
              <span>{needsConsent.join(', ')} {needsConsent.length === 1 ? 'is' : 'are'} connected for mail only. Allow calendar access once to see Google events here.</span>
              <Button variant="secondary" size="xs" onClick={onConnectGoogle}>Allow</Button>
            </div>
          )}
        </div>

        <div className="flex-1 min-h-0 overflow-auto">
          {view === 'month' && (
            <MonthGrid
              anchor={anchor}
              weekStartsOn={prefs.weekStartsOn}
              byDay={byDay}
              now={now}
              conflicts={conflicts}
              onSelect={setSelected}
              onDay={(d) => setDayOpen(d)}
            />
          )}
          {view === 'week' && (
            <WeekGrid anchor={anchor} weekStartsOn={prefs.weekStartsOn} byDay={byDay} now={now} onSelect={setSelected}
              onCreateAt={(t) => setEditing(blankEvent(t))} />
          )}
          {view === 'agenda' && <Agenda occurrences={occurrences.filter((o) => o.end > startOfDay(now).getTime())} conflicts={conflicts} onSelect={setSelected} />}
        </div>

        <div className="pm-cal-foot shrink-0 px-4 sm:px-6 py-2 border-t border-theme flex items-center justify-between gap-3 text-[11px]" style={{ color: 'var(--on-surface-variant)' }}>
          <span className="hidden sm:inline">Keys: <kbd>T</kbd> today · <kbd>←</kbd><kbd>→</kbd> page · <kbd>/</kbd> quick add</span>
          <span className="flex items-center gap-3">
            <button type="button" className="flex items-center gap-1 tap" onClick={() => fileRef.current?.click()}><Upload size={11} /> Import .ics</button>
            <button type="button" className="flex items-center gap-1 tap" onClick={() => setEditing(blankEvent(anchor.getTime() + 10 * HOUR))}><Plus size={11} /> New event</button>
          </span>
          <input ref={fileRef} type="file" accept=".ics,text/calendar" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void importIcs(f); e.target.value = ''; }} />
        </div>
      </div>

      {/* ── Sheets ────────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {dayOpen && (
          <Sheet title={dayOpen.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })} onClose={() => setDayOpen(null)}>
            <div className="flex flex-col gap-1.5">
              {(byDay.get(dayKey(dayOpen)) ?? []).map((o) => (
                <EventRow key={`${o.id}@${o.start}`} o={o} conflict={conflicts.get(`${o.id}@${o.start}`)} onClick={() => { setDayOpen(null); setSelected(o); }} />
              ))}
              {(byDay.get(dayKey(dayOpen)) ?? []).length === 0 && <p className="text-sm" style={{ color: 'var(--on-surface-variant)' }}>A clear day.</p>}
              <Button variant="secondary" size="sm" icon={<Plus />} className="mt-2" onClick={() => { const d = dayOpen; setDayOpen(null); setEditing(blankEvent(d.getTime() + 10 * HOUR)); }}>Add to this day</Button>
            </div>
          </Sheet>
        )}
        {selected && (
          <EventDetail
            o={selected}
            conflict={conflicts.get(`${selected.id}@${selected.start}`)}
            kept={keptKeys.has(selected.sourceKey ?? '')}
            googleReady={googleAccounts > 0}
            onClose={() => setSelected(null)}
            onEdit={() => { const series = mine.find((m) => m.id === selected.id); setSelected(null); if (series) setEditing(series); }}
            onNotice={onNotice}
            onHide={() => { updatePrefs({ hiddenKeys: [...prefs.hiddenKeys, selected.sourceKey ?? selected.id].slice(-500) }); setSelected(null); }}
            onMute={() => { if (selected.byUid) updatePrefs({ mutedCreators: [...prefs.mutedCreators, selected.byUid] }); setSelected(null); }}
          />
        )}
        {editing && <EventEditor ev={editing} onClose={() => setEditing(null)} onNotice={onNotice} />}
        {showLayers && (
          <Sheet title="Layers" onClose={() => setShowLayers(false)}>
            <LayerList prefs={prefs} onToggle={(l) => updatePrefs({ hiddenLayers: prefs.hiddenLayers.includes(l) ? prefs.hiddenLayers.filter((x) => x !== l) : [...prefs.hiddenLayers, l] })} />
          </Sheet>
        )}
        {showSubscribe && (
          <SubscribeSheet
            googleAccounts={googleAccounts}
            needsConsent={needsConsent}
            onConnectGoogle={onConnectGoogle}
            prefs={prefs}
            onPrefs={updatePrefs}
            onClose={() => setShowSubscribe(false)}
            onNotice={onNotice}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

const blankEvent = (t: number): CalendarEvent => {
  const s = new Date(t);
  s.setMinutes(0, 0, 0);
  return { id: newEventId(), title: '', start: s.getTime(), end: s.getTime() + HOUR, allDay: false, layer: 'mine', source: 'manual', tz: localZone(), recurrence: 'none' };
};

/* ── Month ─────────────────────────────────────────────────────────────────── */

const MonthGrid: React.FC<{
  anchor: Date; weekStartsOn: 0 | 1; byDay: Map<string, Occ[]>; now: number; conflicts: Map<string, string>;
  onSelect: (o: Occ) => void; onDay: (d: Date) => void;
}> = ({ anchor, weekStartsOn, byDay, now, conflicts, onSelect, onDay }) => {
  const days = monthGrid(anchor, weekStartsOn);
  const dow = weekStartsOn === 1 ? DOW : ['Sun', ...DOW.slice(0, 6)];
  return (
    <div className="pm-month">
      {dow.map((d) => <div key={d} className="pm-month__dow">{d}</div>)}
      {days.map((d) => {
        const items = byDay.get(dayKey(d)) ?? [];
        const out = d.getMonth() !== anchor.getMonth();
        const today = sameDay(d, now);
        const past = d.getTime() < startOfDay(now).getTime();
        return (
          <div
            key={d.toISOString()}
            className={`pm-month__cell ${out ? 'is-out' : ''} ${today ? 'is-today' : ''} ${past ? 'is-past' : ''}`}
            onClick={() => onDay(d)}
            role="button"
            tabIndex={0}
            aria-label={`${d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}, ${items.length} ${items.length === 1 ? 'item' : 'items'}`}
            onKeyDown={(e) => { if (e.key === 'Enter') onDay(d); }}
          >
            <span className="pm-month__num">{d.getDate()}</span>
            <div className="pm-month__items">
              {items.slice(0, 3).map((o) => (
                <button
                  key={`${o.id}@${o.start}`}
                  type="button"
                  className={`pm-chip-ev ${o.allDay || o.end - o.start >= DAY ? 'is-block' : ''}`}
                  style={{ ['--ev' as string]: layerColor(o.layer) }}
                  onClick={(e) => { e.stopPropagation(); onSelect(o); }}
                  title={o.title}
                >
                  {conflicts.has(`${o.id}@${o.start}`) && <AlertTriangle size={9} className="shrink-0" />}
                  {!o.allDay && <span className="pm-chip-ev__time">{fmtTime(o.start).replace(/:00(?=\s|$)/, '')}</span>}
                  <span className="truncate">{o.title}</span>
                </button>
              ))}
              {items.length > 3 && <span className="pm-month__more">+{items.length - 3} more</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
};

/* ── Week ──────────────────────────────────────────────────────────────────── */

const HOUR_PX = 52;

const WeekGrid: React.FC<{
  anchor: Date; weekStartsOn: 0 | 1; byDay: Map<string, Occ[]>; now: number;
  onSelect: (o: Occ) => void; onCreateAt: (t: number) => void;
}> = ({ anchor, weekStartsOn, byDay, now, onSelect, onCreateAt }) => {
  const start = startOfWeek(anchor, weekStartsOn);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => { scroller.current?.scrollTo({ top: HOUR_PX * 7.5 }); }, []);

  return (
    <div className="pm-week">
      <div className="pm-week__head">
        <div />
        {days.map((d) => (
          <div key={d.toISOString()} className={`pm-week__day ${sameDay(d, now) ? 'is-today' : ''}`}>
            <span>{d.toLocaleDateString(undefined, { weekday: 'short' })}</span>
            <b>{d.getDate()}</b>
          </div>
        ))}
        <div className="pm-week__allday-label">all day</div>
        {days.map((d) => (
          <div key={`a${d.toISOString()}`} className="pm-week__allday">
            {(byDay.get(dayKey(d)) ?? []).filter((o) => o.allDay || o.end - o.start >= DAY).slice(0, 3).map((o) => (
              <button key={`${o.id}@${o.start}`} type="button" className="pm-chip-ev is-block" style={{ ['--ev' as string]: layerColor(o.layer) }} onClick={() => onSelect(o)}>
                <span className="truncate">{o.title}</span>
              </button>
            ))}
          </div>
        ))}
      </div>
      <div ref={scroller} className="pm-week__body">
        <div className="pm-week__hours">
          {Array.from({ length: 24 }, (_, h) => (
            <div key={h} style={{ height: HOUR_PX }}>{h === 0 ? '' : new Date(2000, 0, 1, h).toLocaleTimeString(undefined, { hour: 'numeric' })}</div>
          ))}
        </div>
        {days.map((d) => {
          const timed = (byDay.get(dayKey(d)) ?? []).filter((o) => !o.allDay && o.end - o.start < DAY);
          const lanes = layoutLanes(timed, d);
          return (
            <div
              key={d.toISOString()}
              className="pm-week__col"
              style={{ height: HOUR_PX * 24 }}
              onDoubleClick={(e) => {
                const r = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                const mins = Math.floor(((e.clientY - r.top) / HOUR_PX) * 2) * 30;
                onCreateAt(d.getTime() + mins * MIN);
              }}
            >
              {sameDay(d, now) && <div className="pm-week__now" style={{ top: ((now - d.getTime()) / HOUR) * HOUR_PX }} />}
              {lanes.map(({ o, lane, lanesTotal }) => {
                const s = Math.max(o.start, d.getTime());
                const e = Math.min(o.end, d.getTime() + DAY);
                return (
                  <button
                    key={`${o.id}@${o.start}`}
                    type="button"
                    className="pm-week__ev"
                    style={{
                      top: ((s - d.getTime()) / HOUR) * HOUR_PX,
                      height: Math.max(22, ((e - s) / HOUR) * HOUR_PX - 2),
                      left: `calc(${(lane / lanesTotal) * 100}% + 2px)`,
                      width: `calc(${100 / lanesTotal}% - 4px)`,
                      ['--ev' as string]: layerColor(o.layer),
                    }}
                    onClick={() => onSelect(o)}
                  >
                    <b className="truncate block">{o.title}</b>
                    <span className="truncate block">{fmtTime(o.start)}{o.location ? ` · ${o.location}` : ''}</span>
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
};

/** Side-by-side lanes for overlapping events — the visual half of conflict radar. */
function layoutLanes(items: Occ[], day: Date): Array<{ o: Occ; lane: number; lanesTotal: number }> {
  const sorted = [...items].sort((a, b) => a.start - b.start);
  const out: Array<{ o: Occ; lane: number; lanesTotal: number }> = [];
  let cluster: Array<{ o: Occ; lane: number }> = [];
  let clusterEnd = 0;
  const flush = () => {
    const total = Math.max(1, ...cluster.map((c) => c.lane + 1));
    for (const c of cluster) out.push({ ...c, lanesTotal: total });
    cluster = [];
  };
  for (const o of sorted) {
    const s = Math.max(o.start, day.getTime());
    if (cluster.length && s >= clusterEnd) flush();
    const used = new Set(cluster.filter((c) => c.o.end > s).map((c) => c.lane));
    let lane = 0;
    while (used.has(lane)) lane++;
    cluster.push({ o, lane });
    clusterEnd = Math.max(clusterEnd, o.end);
  }
  if (cluster.length) flush();
  return out;
}

/* ── Agenda ────────────────────────────────────────────────────────────────── */

const Agenda: React.FC<{ occurrences: Occ[]; conflicts: Map<string, string>; onSelect: (o: Occ) => void }> = ({ occurrences, conflicts, onSelect }) => {
  const groups = useMemo(() => {
    const m = new Map<string, Occ[]>();
    for (const o of occurrences) {
      const k = dayKey(o.start);
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(o);
    }
    return [...m.entries()];
  }, [occurrences]);
  if (!groups.length) {
    return (
      <div className="py-20 text-center px-6">
        <ListTodo className="mx-auto mb-3" style={{ opacity: 0.4 }} />
        <p className="text-sm" style={{ color: 'var(--on-surface-variant)' }}>Nothing in the next two months. Follow creators and their releases will appear here on their own.</p>
      </div>
    );
  }
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 flex flex-col gap-6">
      {groups.map(([k, items]) => {
        const d = new Date(items[0].start);
        return (
          <section key={k} className="pm-agenda-day">
            <div className="pm-agenda-day__date">
              <b>{d.getDate()}</b>
              <span>{d.toLocaleDateString(undefined, { weekday: 'short' })}</span>
              <span style={{ opacity: 0.6 }}>{d.toLocaleDateString(undefined, { month: 'short' })}</span>
            </div>
            <div className="flex-1 min-w-0 flex flex-col gap-1.5">
              {items.map((o) => <EventRow key={`${o.id}@${o.start}`} o={o} conflict={conflicts.get(`${o.id}@${o.start}`)} onClick={() => onSelect(o)} />)}
            </div>
          </section>
        );
      })}
    </div>
  );
};

const EventRow: React.FC<{ o: Occ; conflict?: string; onClick: () => void }> = ({ o, conflict, onClick }) => (
  <button type="button" onClick={onClick} className="pm-ev-row tap text-left" style={{ ['--ev' as string]: layerColor(o.layer) }}>
    {o.image ? <img src={o.image} alt="" className="w-11 h-11 rounded-lg object-cover shrink-0" /> : <span className="pm-ev-row__dot" />}
    <span className="min-w-0 flex-1">
      <span className="block text-sm font-semibold truncate">{o.title}</span>
      <span className="block text-xs truncate" style={{ color: 'var(--on-surface-variant)' }}>
        {fmtRange(o.start, o.end, o.allDay)}{o.kindLabel ? ` · ${o.kindLabel}` : ''}{o.byName ? ` · ${o.byName}` : ''}
      </span>
      {conflict && <span className="flex items-center gap-1 text-[11px]" style={{ color: 'var(--pj-warning, #f59e0b)' }}><AlertTriangle size={10} /> overlaps {conflict}</span>}
    </span>
    {o.recurrence && o.recurrence !== 'none' && <Repeat size={12} style={{ opacity: 0.5 }} />}
  </button>
);

/* ── Layers ────────────────────────────────────────────────────────────────── */

const LayerList: React.FC<{ prefs: CalendarPrefs; onToggle: (l: CalLayer) => void }> = ({ prefs, onToggle }) => (
  <div>
    <p className="pj-eyebrow px-2 mb-2">Layers</p>
    <div className="flex flex-col">
      {CAL_LAYERS.map((l) => {
        const on = !prefs.hiddenLayers.includes(l.id);
        return (
          <button key={l.id} type="button" onClick={() => onToggle(l.id)} aria-pressed={on} className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-white/5 tap text-left" title={l.hint}>
            <span className="w-3.5 h-3.5 rounded-[4px] grid place-items-center shrink-0" style={{ background: on ? l.color : 'transparent', boxShadow: `inset 0 0 0 1.5px ${l.color}` }}>
              {on && <Check size={10} strokeWidth={3} color="#000" />}
            </span>
            <span className="text-sm" style={{ opacity: on ? 1 : 0.5 }}>{l.label}</span>
          </button>
        );
      })}
    </div>
  </div>
);

/* ── Sheet shell ───────────────────────────────────────────────────────────── */

const Sheet: React.FC<{ title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }> = ({ title, onClose, children, wide }) => {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 z-[130] flex items-end sm:items-center justify-center sm:p-6 bg-black/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <motion.div
        initial={{ y: 30, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 30, opacity: 0 }}
        transition={{ duration: 0.28, ease: [0.2, 0, 0, 1] }}
        onClick={(e) => e.stopPropagation()}
        className={`pj-surface pj-surface--5 pj-surface--sheet w-full ${wide ? 'sm:max-w-xl' : 'sm:max-w-md'} max-h-[88vh] overflow-y-auto`}
        style={{ padding: 0 }}
      >
        <div className="px-5 py-3.5 border-b border-theme flex items-center justify-between sticky top-0 z-10" style={{ background: 'var(--card-bg)' }}>
          <h3 className="type-title-md truncate">{title}</h3>
          <IconButton variant="ghost" size="sm" aria-label="Close" onClick={onClose}><X /></IconButton>
        </div>
        <div className="p-5">{children}</div>
      </motion.div>
    </motion.div>
  );
};

/* ── Event detail ──────────────────────────────────────────────────────────── */

const EventDetail: React.FC<{
  o: Occ; conflict?: string; kept: boolean; googleReady: boolean;
  onClose: () => void; onEdit: () => void; onHide: () => void; onMute: () => void;
  onNotice: (n: { kind: 'ok' | 'error'; text: string }) => void;
}> = ({ o, conflict, kept, googleReady, onClose, onEdit, onHide, onMute, onNotice }) => {
  const [busy, setBusy] = useState<string | null>(null);
  const tzHere = localZone();
  const otherZone = o.tz && o.tz !== tzHere && !o.allDay ? o.tz : null;
  const ics = { uid: o.id, title: o.title, start: o.start, end: o.end, allDay: o.allDay, location: o.location, description: [o.kindLabel, o.byName && `from ${o.byName}`, o.notes].filter(Boolean).join(' — ') };
  const editable = o.layer === 'mine' || o.source === 'letter' || o.source === 'import' || (o.source === 'platform' && !o.readOnly);

  const run = async (key: string, fn: () => Promise<void>, ok: string) => {
    setBusy(key);
    try { await fn(); onNotice({ kind: 'ok', text: ok }); onClose(); }
    catch (err) { onNotice({ kind: 'error', text: err instanceof Error ? err.message : 'That did not work.' }); }
    finally { setBusy(null); }
  };

  const openIt = () => {
    const t = o.open;
    if (!t) return;
    if (t.kind === 'url') window.open(t.href, '_blank', 'noopener');
    else if (t.kind === 'profile') window.dispatchEvent(new CustomEvent('plajah:visit-user', { detail: { uid: t.uid } }));
    else if (t.kind === 'navigate') window.dispatchEvent(new CustomEvent('NAVIGATE', { detail: { target: t.target, params: t.params } }));
    else if (t.kind === 'letter') window.dispatchEvent(new CustomEvent('postman:intent', { detail: { room: 'LETTERS', roomId: t.correspondenceId } }));
    onClose();
  };

  return (
    <Sheet title={o.kindLabel ?? CAL_LAYERS.find((l) => l.id === o.layer)?.label ?? 'Event'} onClose={onClose}>
      {o.image && <img src={o.image} alt="" className="w-full aspect-[16/9] object-cover rounded-card mb-4" />}
      <div className="flex items-start gap-3 mb-4">
        <span className="w-1.5 self-stretch rounded-full shrink-0" style={{ background: layerColor(o.layer) }} />
        <div className="min-w-0">
          <h4 className="text-xl font-bold leading-tight">{o.title}</h4>
          <p className="text-sm mt-1">
            {new Date(o.start).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
          </p>
          <p className="text-sm" style={{ color: 'var(--on-surface-variant)' }}>
            {fmtRange(o.start, o.end, o.allDay)} {!o.allDay && zoneAbbrev(o.start, tzHere)}
            {o.start > Date.now() && ` · ${relativeWhen(o.start)}`}
          </p>
          {otherZone && (
            <p className="text-xs mt-1" style={{ color: 'var(--on-surface-variant)' }}>
              That’s {fmtTime(o.start, otherZone)} {zoneAbbrev(o.start, otherZone)} where it was announced.
            </p>
          )}
          {o.recurrence && o.recurrence !== 'none' && <p className="text-xs mt-1 flex items-center gap-1"><Repeat size={11} /> {RECURRENCE_LABEL[o.recurrence]}</p>}
        </div>
      </div>
      {conflict && (
        <p className="text-xs mb-3 flex items-center gap-1.5 rounded-lg px-3 py-2" style={{ background: 'var(--pj-warning-soft)' }}>
          <AlertTriangle size={12} /> Overlaps “{conflict}”.
        </p>
      )}
      {o.byName && (
        <p className="text-sm mb-2 flex items-center gap-2">
          {o.byPhoto && <img src={o.byPhoto} alt="" className="w-6 h-6 rounded-full object-cover" />}
          From {o.byName}
        </p>
      )}
      {o.location && <p className="text-sm mb-2 flex items-center gap-1.5"><MapPin size={13} /> {o.location}</p>}
      {o.notes && <p className="text-sm whitespace-pre-wrap mb-3" style={{ color: 'var(--on-surface-variant)' }}>{o.notes}</p>}

      <div className="flex flex-wrap gap-2 mt-4">
        {o.open && <Button variant="secondary" size="sm" icon={<ExternalLink />} onClick={openIt}>Open</Button>}
        {o.source === 'platform' && o.readOnly && !kept && (
          <Button variant="accent" size="sm" icon={<Pin />} loading={busy === 'keep'} onClick={() => void run('keep', () => keepPlatformItem(o), 'Kept on your calendar.')}>Keep</Button>
        )}
        {editable && <Button variant="secondary" size="sm" icon={<Pencil />} onClick={onEdit}>Edit</Button>}
        {googleReady && o.layer !== 'google' && (
          <Button variant="secondary" size="sm" loading={busy === 'google'} onClick={() => void run('google', () => pushToGoogle(o), 'Added to Google Calendar.')}>Add to Google</Button>
        )}
        {!googleReady && o.layer !== 'google' && (
          <Button as="a" href={googleCalendarLink(ics)} target="_blank" rel="noopener noreferrer" variant="ghost" size="sm">Google Calendar</Button>
        )}
        <Button variant="ghost" size="sm" icon={<Download />} onClick={() => downloadIcs(ics)}>.ics</Button>
      </div>

      {(o.source === 'platform' && o.readOnly) && (
        <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-theme">
          <Button variant="ghost" size="xs" icon={<EyeOff />} onClick={onHide}>Not for me</Button>
          {o.byUid && <Button variant="ghost" size="xs" icon={<BellOff />} onClick={onMute}>Mute {o.byName ?? 'this creator'} on my calendar</Button>}
        </div>
      )}
      {editable && (
        <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-theme">
          {o.recurrence && o.recurrence !== 'none' && (
            <Button variant="ghost" size="xs" onClick={() => void run('skip', () => skipOccurrence(o, o.occurrenceStart), 'Skipped this one.')}>Skip this occurrence</Button>
          )}
          <Button variant="danger-quiet" size="xs" icon={<Trash2 />} loading={busy === 'del'} onClick={() => void run('del', () => deleteEvent(o.id), 'Deleted.')}>Delete</Button>
        </div>
      )}
    </Sheet>
  );
};

/* ── Editor ────────────────────────────────────────────────────────────────── */

const toLocalInput = (t: number, dateOnly = false) => {
  const d = new Date(t);
  const pad = (n: number) => String(n).padStart(2, '0');
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return dateOnly ? date : `${date}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const EventEditor: React.FC<{ ev: CalendarEvent; onClose: () => void; onNotice: (n: { kind: 'ok' | 'error'; text: string }) => void }> = ({ ev, onClose, onNotice }) => {
  const [d, setD] = useState<CalendarEvent>(ev);
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof CalendarEvent>(k: K, v: CalendarEvent[K]) => setD((x) => ({ ...x, [k]: v }));
  const save = async () => {
    if (!d.title.trim()) return;
    setSaving(true);
    try {
      await saveEvent({ ...d, title: d.title.trim(), end: Math.max(d.end, d.start + (d.allDay ? DAY : 15 * MIN)) });
      onNotice({ kind: 'ok', text: 'Saved.' });
      onClose();
    } catch (err) {
      onNotice({ kind: 'error', text: err instanceof Error ? err.message : 'Could not save.' });
    } finally { setSaving(false); }
  };
  return (
    <Sheet title={ev.title ? 'Edit event' : 'New event'} onClose={onClose} wide>
      <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); void save(); }}>
        <input autoFocus className="pj-input text-lg font-semibold" placeholder="What’s happening?" value={d.title} onChange={(e) => set('title', e.target.value)} aria-label="Title" />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={d.allDay} onChange={(e) => {
            const allDay = e.target.checked;
            const s = startOfDay(d.start).getTime();
            setD((x) => ({ ...x, allDay, start: allDay ? s : s + 10 * HOUR, end: allDay ? s + DAY : s + 11 * HOUR }));
          }} className="accent-[color:var(--pj-orange)]" />
          All day
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="text-xs flex flex-col gap-1">Starts
            <input className="pj-input" type={d.allDay ? 'date' : 'datetime-local'} value={toLocalInput(d.start, d.allDay)}
              onChange={(e) => { const t = new Date(d.allDay ? `${e.target.value}T00:00` : e.target.value).getTime(); if (Number.isFinite(t)) setD((x) => ({ ...x, start: t, end: t + Math.max(x.end - x.start, d.allDay ? DAY : 30 * MIN) })); }} />
          </label>
          <label className="text-xs flex flex-col gap-1">Ends
            <input className="pj-input" type={d.allDay ? 'date' : 'datetime-local'} value={toLocalInput(d.allDay ? d.end - DAY : d.end, d.allDay)}
              onChange={(e) => { const t = new Date(d.allDay ? `${e.target.value}T00:00` : e.target.value).getTime(); if (Number.isFinite(t)) set('end', d.allDay ? t + DAY : t); }} />
          </label>
        </div>
        <label className="text-xs flex flex-col gap-1">Repeats
          <select className="pj-input" value={d.recurrence ?? 'none'} onChange={(e) => set('recurrence', e.target.value as Recurrence)}>
            {(Object.keys(RECURRENCE_LABEL) as Recurrence[]).map((r) => <option key={r} value={r}>{RECURRENCE_LABEL[r]}</option>)}
          </select>
        </label>
        <input className="pj-input" placeholder="Where (optional)" value={d.location ?? ''} onChange={(e) => set('location', e.target.value || undefined)} aria-label="Location" />
        <textarea className="pj-input" rows={3} placeholder="Notes (optional)" value={d.notes ?? ''} onChange={(e) => set('notes', e.target.value || undefined)} aria-label="Notes" />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="accent" size="sm" icon={<CalendarDays />} loading={saving} disabled={!d.title.trim()}>Save</Button>
        </div>
      </form>
    </Sheet>
  );
};

/* ── Connect / subscribe ──────────────────────────────────────────────────── */

const SubscribeSheet: React.FC<{
  googleAccounts: number; needsConsent: string[]; onConnectGoogle: () => void;
  prefs: CalendarPrefs; onPrefs: (p: Partial<Omit<CalendarPrefs, 'updatedAt'>>) => void;
  onClose: () => void; onNotice: (n: { kind: 'ok' | 'error'; text: string }) => void;
}> = ({ googleAccounts, needsConsent, onConnectGoogle, prefs, onPrefs, onClose, onNotice }) => {
  const [feed, setFeed] = useState<{ url: string | null; reason?: string } | null>(null);
  const [rotating, setRotating] = useState(false);
  useEffect(() => { void fetchFeedUrl().then(setFeed); }, []);

  const rotate = async () => {
    setRotating(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch('/api/postman/calendar/feed-url/rotate', { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
      const body = await res.json().catch(() => null) as { url?: string; error?: string } | null;
      if (body?.url) { setFeed({ url: body.url }); onNotice({ kind: 'ok', text: 'New link issued. The old one has stopped working.' }); }
      else onNotice({ kind: 'error', text: body?.error ?? 'Could not issue a new link.' });
    } finally { setRotating(false); }
  };

  return (
    <Sheet title="Connect your calendars" onClose={onClose} wide>
      <section className="mb-6">
        <p className="pj-eyebrow mb-1">Google Calendar</p>
        <p className="text-sm mb-3" style={{ color: 'var(--on-surface-variant)' }}>
          Shows your Google events here and lets you send Plajah events to Google with one tap. Uses the same connection as your mail.
        </p>
        {googleAccounts === 0
          ? <Button variant="secondary" size="sm" onClick={onConnectGoogle}>Connect Google</Button>
          : needsConsent.length
            ? <Button variant="secondary" size="sm" onClick={onConnectGoogle}>Allow calendar access</Button>
            : <p className="text-sm flex items-center gap-1.5 text-state-success"><Check size={14} /> Connected</p>}
      </section>

      <section className="mb-6">
        <p className="pj-eyebrow mb-1">Subscribe from any calendar app</p>
        <p className="text-sm mb-3" style={{ color: 'var(--on-surface-variant)' }}>
          Apple Calendar, Outlook, or Google (“Other calendars → From URL”). Your own events and anything you kept from Plajah, kept in sync.
          The link is private — anyone with it can read those events.
        </p>
        {feed === null && <Loader2 className="animate-spin" size={16} />}
        {feed?.url && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <input readOnly value={feed.url} className="pj-input flex-1 text-xs font-mono" onFocus={(e) => e.currentTarget.select()} aria-label="Subscription link" />
              <IconButton variant="secondary" size="sm" aria-label="Copy link" onClick={() => { void navigator.clipboard?.writeText(feed.url!); onNotice({ kind: 'ok', text: 'Link copied.' }); }}><Copy /></IconButton>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button as="a" href={feed.url.replace(/^https?:/, 'webcal:')} variant="ghost" size="xs">Open in my calendar app</Button>
              <Button variant="ghost" size="xs" loading={rotating} onClick={() => void rotate()}>Reset link</Button>
            </div>
          </div>
        )}
        {feed && !feed.url && <p className="text-xs" style={{ color: 'var(--on-surface-variant)' }}>{feed.reason}</p>}
      </section>

      <section>
        <p className="pj-eyebrow mb-2">Week starts on</p>
        <div className="pm-seg inline-flex">
          <button type="button" aria-selected={prefs.weekStartsOn === 1} onClick={() => onPrefs({ weekStartsOn: 1 })}>Monday</button>
          <button type="button" aria-selected={prefs.weekStartsOn === 0} onClick={() => onPrefs({ weekStartsOn: 0 })}>Sunday</button>
        </div>
        {(prefs.mutedCreators.length > 0 || prefs.hiddenKeys.length > 0) && (
          <div className="mt-5">
            <Button variant="ghost" size="xs" onClick={() => { onPrefs({ mutedCreators: [], hiddenKeys: [] }); onNotice({ kind: 'ok', text: 'Everything you hid is back.' }); }}>
              Show everything I hid ({prefs.mutedCreators.length + prefs.hiddenKeys.length})
            </Button>
          </div>
        )}
      </section>
    </Sheet>
  );
};

export default CalendarRoom;
