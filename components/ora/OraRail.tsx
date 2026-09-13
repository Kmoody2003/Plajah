import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, Pin, PinOff, PenLine, Wind } from 'lucide-react';
import { usePersistentFloating } from '../../hooks/usePersistentFloating';
import { IconButton } from '../ui';
import { getProfile, getCheckin, saveCheckin, saveEntry, today } from '../../services/oraService';
import {
  currentJournalDaypart, shouldShowNudge, dismissDaypart,
  markWrittenToday, markAppOpened, getNudgePrompt, DAYPART_LABELS,
  type JournalDaypart,
} from '../../services/oraJournalNudge';
import type { AppView } from '../../types';

/**
 * Ora — the Companion Rail (Direction C), elevated.
 *
 * The orb now offers three actions — mood check-in, journal entry, and a breath
 * — plus daypart-aware journal nudges at morning, midday, and evening.
 *
 * Rules this component holds itself to:
 *   · It never appears uninvited more than once per daypart.
 *   · It never appears at all until the user has switched Ora on.
 *   · It is silent about what it holds — the orb reveals nothing to a passer-by.
 *   · Dismissing is always one tap, and dismissal is remembered per daypart.
 *   · Writing a journal entry suppresses all remaining nudges for the day.
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

/** Surfaces where a wellbeing nudge would be an intrusion rather than an offer. */
const MUTED_VIEWS: AppView[] = [
  'LANDING', 'CHAT', 'ROOM', 'LIVE_HUB', 'GAME_PLAYER', 'PODCAST_CALLIN',
  'BOOK_READER', 'PLAJAH_PIXELS', 'EVENT_KIOSK', 'DELETE_ACCOUNT',
];

const dismissKey = () => `ora:rail:dismissed:${today()}`;

/** Which sub-panel of the expanded card is active. */
type RailMode = 'ACTIONS' | 'JOURNAL' | 'NUDGE' | 'POST_MOOD';

interface OraRailProps {
  currentView: AppView;
  /** Opens the full room behind the orb. */
  onOpenRoom: () => void;
}

export const OraRail: React.FC<OraRailProps> = ({ currentView, onOpenRoom }) => {
  const [enabled, setEnabled] = useState(false);
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState<number | null>(null);
  const [mode, setMode] = useState<RailMode>('ACTIONS');
  const [journalBody, setJournalBody] = useState('');
  const [savingJournal, setSavingJournal] = useState(false);
  const [lastMood, setLastMood] = useState<1 | 2 | 3 | 4 | 5 | null>(null);
  const holdTimer = useRef<number | null>(null);
  const nudgeTimer = useRef<number | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const floating = usePersistentFloating('plajah:floating:ora', () => ({ x: window.innerWidth - 60, y: window.innerHeight - 205 }));

  // Record when the app opened, so nudges wait 2 minutes.
  useEffect(() => { markAppOpened(); }, []);

  // Ora is opt-in. Until the profile says so, this component renders nothing.
  useEffect(() => {
    let alive = true;
    (async () => {
      const profile = await getProfile();
      if (!alive || !profile?.enabled) return;
      setEnabled(true);
      const existing = await getCheckin();
      if (alive && existing) setDone(true);
    })();
    return () => { alive = false; };
  }, []);

  // Daypart nudge timer — check every 60s if a nudge should appear.
  useEffect(() => {
    if (!enabled) return;
    const check = () => {
      if (MUTED_VIEWS.includes(currentView)) return;
      const { show, daypart } = shouldShowNudge(today());
      if (show && daypart && !open) {
        setMode('NUDGE');
        setOpen(true);
        // Auto-recede after 12 seconds if the user doesn't interact.
        window.setTimeout(() => {
          setOpen((o) => {
            // Only auto-close if still showing the nudge (user hasn't interacted).
            return o ? false : o;
          });
        }, 12000);
      }
    };
    // Initial check after 2 minutes (the app-open grace period is handled by shouldShowNudge).
    nudgeTimer.current = window.setTimeout(() => {
      check();
      // Then check every 60s.
      nudgeTimer.current = window.setInterval(check, 60000) as unknown as number;
    }, 3000); // Small initial delay — shouldShowNudge internally enforces the 2-min rule.
    return () => {
      if (nudgeTimer.current !== null) {
        window.clearTimeout(nudgeTimer.current);
        window.clearInterval(nudgeTimer.current);
      }
    };
  }, [enabled, currentView, open]);

  const dismissedToday = typeof window !== 'undefined' && sessionStorage.getItem(dismissKey()) === '1';

  // Current nudge prompt (memoized per daypart rotation).
  const nudgePrompt = useMemo(() => {
    const dp = currentJournalDaypart();
    return dp ? getNudgePrompt(dp) : null;
  }, []);
  const nudgeDaypart = currentJournalDaypart();

  if (!enabled || MUTED_VIEWS.includes(currentView)) return null;

  // ── Handlers ──────────────────────────────────────────────────────────

  const record = async (mood: 1 | 2 | 3 | 4 | 5) => {
    setSaving(mood);
    await saveCheckin({ mood, surface: 'RAIL' });
    setSaving(null);
    setDone(true);
    setLastMood(mood);
    // Instead of auto-closing, transition to POST_MOOD to invite journaling.
    setMode('POST_MOOD');
  };

  const handleSaveJournal = async () => {
    if (!journalBody.trim()) return;
    setSavingJournal(true);
    const daypart = currentJournalDaypart();
    const title = daypart ? DAYPART_LABELS[daypart] : 'Quick entry';
    await saveEntry({
      body: journalBody.trim(),
      title,
      moodAtWriting: lastMood ?? undefined,
    });
    markWrittenToday(today());
    setSavingJournal(false);
    setJournalBody('');
    setMode('ACTIONS');
    // Gently close after save.
    window.setTimeout(() => setOpen(false), 600);
  };

  const dismiss = () => {
    setOpen(false);
    setMode('ACTIONS');
    try { sessionStorage.setItem(dismissKey(), '1'); } catch { /* private mode */ }
  };

  const dismissNudge = () => {
    if (nudgeDaypart) dismissDaypart(nudgeDaypart, today());
    setOpen(false);
    setMode('ACTIONS');
  };

  const openJournal = () => {
    setMode('JOURNAL');
    // Focus the textarea on next tick.
    window.setTimeout(() => textareaRef.current?.focus(), 50);
  };

  // Press-and-hold on the orb opens the room; a tap opens the rail.
  const startHold = () => {
    holdTimer.current = window.setTimeout(() => { holdTimer.current = null; onOpenRoom(); }, 450);
  };
  const endHold = () => {
    if (floating.didDragRef.current) { if (holdTimer.current !== null) window.clearTimeout(holdTimer.current); holdTimer.current = null; return; }
    if (holdTimer.current === null) return;
    window.clearTimeout(holdTimer.current);
    holdTimer.current = null;
    if (open) {
      setOpen(false);
      setMode('ACTIONS');
    } else {
      setMode('ACTIONS');
      setOpen(true);
    }
  };

  // ── Glass card styles ─────────────────────────────────────────────────

  const cardStyle: React.CSSProperties = {
    pointerEvents: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: 0,
    borderRadius: 20,
    background: 'color-mix(in srgb, var(--bg-color) 82%, transparent)',
    backdropFilter: 'blur(20px) saturate(180%)',
    WebkitBackdropFilter: 'blur(20px) saturate(180%)',
    border: '1px solid var(--pj-border-strong)',
    boxShadow: 'var(--pj-elev-4)',
    maxWidth: 'min(92vw, 340px)',
    minWidth: 260,
    overflow: 'hidden',
  };

  const rowStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 'var(--pj-space-3)',
    padding: 'var(--pj-space-3) var(--pj-space-4)',
    cursor: 'pointer',
    transition: 'background var(--pj-dur-base) var(--pj-ease-standard)',
  };

  const dividerStyle: React.CSSProperties = {
    height: 1,
    background: 'var(--pj-border)',
    margin: 0,
  };

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <div
      style={{
        position: 'fixed',
        left: floating.pos.x,
        top: floating.pos.y,
        zIndex: 60,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        gap: 'var(--pj-space-2)',
        pointerEvents: 'none',
      }}
      {...floating.dragProps}
    >
      {open && (
        <div role="group" aria-label="Ora companion" style={cardStyle}>

          {/* ── NUDGE MODE: daypart journal invitation ── */}
          {mode === 'NUDGE' && nudgePrompt && (
            <div style={{ padding: 'var(--pj-space-4)' }}>
              <p className="type-label-sm" style={{ margin: '0 0 var(--pj-space-1)', color: 'var(--pj-lilac)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                {nudgeDaypart ? DAYPART_LABELS[nudgeDaypart] : 'Reflection'}
              </p>
              <p className="type-title-md" style={{ margin: '0 0 var(--pj-space-2)' }}>
                {nudgePrompt.prompt}
              </p>
              <p className="type-body-sm" style={{ margin: '0 0 var(--pj-space-4)', color: 'var(--on-surface-variant)', fontStyle: 'italic' }}>
                {nudgePrompt.insight}
              </p>
              <div style={{ display: 'flex', gap: 'var(--pj-space-2)' }}>
                <button
                  type="button"
                  onClick={openJournal}
                  className="tap"
                  style={{
                    flex: 1, padding: 'var(--pj-space-2) var(--pj-space-3)',
                    borderRadius: 'var(--pj-radius-full)',
                    background: 'var(--pj-grad-ethereal)',
                    border: 'none', color: '#160826', fontWeight: 700,
                    fontSize: 13, cursor: 'pointer',
                  }}
                >
                  ✏️ Write
                </button>
                <button
                  type="button"
                  onClick={dismissNudge}
                  className="tap"
                  style={{
                    flex: 1, padding: 'var(--pj-space-2) var(--pj-space-3)',
                    borderRadius: 'var(--pj-radius-full)',
                    background: 'transparent',
                    border: '1px solid var(--pj-border-strong)',
                    color: 'var(--text-primary)', fontWeight: 600,
                    fontSize: 13, cursor: 'pointer',
                  }}
                >
                  Later
                </button>
              </div>
            </div>
          )}

          {/* ── POST-MOOD: bridge from check-in to journal ── */}
          {mode === 'POST_MOOD' && (
            <div style={{ padding: 'var(--pj-space-4)', textAlign: 'center' }}>
              <p className="type-title-md" style={{ margin: '0 0 var(--pj-space-1)' }}>
                Logged. Rest easy.
              </p>
              <p className="type-body-sm" style={{ margin: '0 0 var(--pj-space-4)', color: 'var(--on-surface-variant)' }}>
                Want to write about it?
              </p>
              <div style={{ display: 'flex', gap: 'var(--pj-space-2)' }}>
                <button
                  type="button"
                  onClick={openJournal}
                  className="tap"
                  style={{
                    flex: 1, padding: 'var(--pj-space-2) var(--pj-space-3)',
                    borderRadius: 'var(--pj-radius-full)',
                    background: 'var(--pj-grad-ethereal)',
                    border: 'none', color: '#160826', fontWeight: 700,
                    fontSize: 13, cursor: 'pointer',
                  }}
                >
                  Write
                </button>
                <button
                  type="button"
                  onClick={() => { setOpen(false); setMode('ACTIONS'); }}
                  className="tap"
                  style={{
                    flex: 1, padding: 'var(--pj-space-2) var(--pj-space-3)',
                    borderRadius: 'var(--pj-radius-full)',
                    background: 'transparent',
                    border: '1px solid var(--pj-border-strong)',
                    color: 'var(--text-primary)', fontWeight: 600,
                    fontSize: 13, cursor: 'pointer',
                  }}
                >
                  Not now
                </button>
              </div>
            </div>
          )}

          {/* ── JOURNAL MODE: inline textarea ── */}
          {mode === 'JOURNAL' && (
            <div style={{ padding: 'var(--pj-space-4)' }}>
              <p className="type-label-sm" style={{ margin: '0 0 var(--pj-space-2)', color: 'var(--pj-lilac)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                {nudgeDaypart ? DAYPART_LABELS[nudgeDaypart] : 'Quick entry'}
              </p>
              <textarea
                ref={textareaRef}
                value={journalBody}
                onChange={(e) => setJournalBody(e.target.value)}
                placeholder={nudgePrompt?.prompt ?? 'Write as much or as little as you want.'}
                rows={4}
                style={{
                  width: '100%', resize: 'vertical',
                  background: 'var(--pj-glass-2)',
                  border: '1px solid var(--pj-border)',
                  borderRadius: 12, padding: 'var(--pj-space-3)',
                  color: 'var(--text-primary)', fontFamily: 'inherit',
                  fontSize: 14, lineHeight: 1.5,
                  outline: 'none',
                }}
              />
              <p className="type-body-xs" style={{ margin: 'var(--pj-space-2) 0 var(--pj-space-3)', color: 'var(--on-surface-variant)' }}>
                Encrypted before it leaves this device.
              </p>
              <div style={{ display: 'flex', gap: 'var(--pj-space-2)' }}>
                <button
                  type="button"
                  onClick={() => { setMode('ACTIONS'); setJournalBody(''); }}
                  className="tap"
                  style={{
                    flex: 1, padding: 'var(--pj-space-2)',
                    borderRadius: 'var(--pj-radius-full)',
                    background: 'transparent',
                    border: '1px solid var(--pj-border)',
                    color: 'var(--on-surface-variant)', fontWeight: 600,
                    fontSize: 13, cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveJournal}
                  disabled={!journalBody.trim() || savingJournal}
                  className="tap"
                  style={{
                    flex: 1, padding: 'var(--pj-space-2)',
                    borderRadius: 'var(--pj-radius-full)',
                    background: journalBody.trim() ? 'var(--pj-grad-ethereal)' : 'var(--pj-glass-3)',
                    border: 'none',
                    color: journalBody.trim() ? '#160826' : 'var(--on-surface-variant)',
                    fontWeight: 700, fontSize: 13, cursor: 'pointer',
                    opacity: savingJournal ? 0.6 : 1,
                  }}
                >
                  {savingJournal ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          )}

          {/* ── ACTIONS MODE: the three-action menu ── */}
          {mode === 'ACTIONS' && (
            <>
              {/* Row 1: Mood check-in */}
              <div style={{ ...rowStyle, flexDirection: 'column', alignItems: 'stretch', gap: 'var(--pj-space-2)' }}>
                <p className="type-label-lg" style={{ margin: 0 }}>
                  {done ? 'Checked in ✓' : 'How are you?'}
                </p>
                {!done && (
                  <div style={{ display: 'flex', gap: 4 }}>
                    {MOODS.map((m) => (
                      <button
                        key={m.v}
                        type="button"
                        aria-label={m.label}
                        disabled={saving !== null}
                        onClick={() => record(m.v)}
                        className="tap"
                        style={{
                          width: 34, height: 34, borderRadius: '50%',
                          border: '1px solid var(--pj-border)',
                          background: saving === m.v ? 'var(--pj-orange)' : 'var(--pj-glass-2)',
                          color: saving === m.v ? '#12080a' : 'var(--text-primary)',
                          fontSize: 15, lineHeight: 1, cursor: 'pointer',
                          transition: 'background-color var(--pj-dur-base) var(--pj-ease-standard)',
                        }}
                      >
                        {m.glyph}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div style={dividerStyle} />

              {/* Row 2: Write in journal */}
              <div
                role="button"
                tabIndex={0}
                onClick={openJournal}
                onKeyDown={(e) => { if (e.key === 'Enter') openJournal(); }}
                style={rowStyle}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--pj-glass-2)'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
              >
                <PenLine size={16} style={{ color: 'var(--pj-lilac)', flex: 'none' }} />
                <span className="type-label-lg" style={{ flex: 1 }}>Write in journal</span>
              </div>

              <div style={dividerStyle} />

              {/* Row 3: Breathe → opens the full room on the Stillness tab */}
              <div
                role="button"
                tabIndex={0}
                onClick={() => { setOpen(false); onOpenRoom(); }}
                onKeyDown={(e) => { if (e.key === 'Enter') { setOpen(false); onOpenRoom(); } }}
                style={rowStyle}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--pj-glass-2)'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
              >
                <Wind size={16} style={{ color: 'var(--pj-cyan)', flex: 'none' }} />
                <span className="type-label-lg" style={{ flex: 1 }}>Breathe</span>
              </div>

              {/* Dismiss row */}
              <div style={{ ...dividerStyle }} />
              <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--pj-space-1)' }}>
                <IconButton variant="ghost" size="sm" aria-label="Not now" onClick={dismiss}>
                  <X size={14} />
                </IconButton>
              </div>
            </>
          )}
        </div>
      )}

      {/* The orb. Unlabelled and unrevealing by design — handing someone your
          phone should not advertise that you keep a journal on it. */}
      <button
        type="button"
        aria-label={open ? 'Close Ora' : 'Ora — tap to check in, hold to open'}
        aria-expanded={open}
        onPointerDown={startHold}
        onPointerUp={endHold}
        onPointerLeave={() => { if (holdTimer.current) { window.clearTimeout(holdTimer.current); holdTimer.current = null; } }}
        style={{
          pointerEvents: 'auto',
          width: 44, height: 44, borderRadius: '50%', flex: 'none',
          border: '1px solid var(--pj-border-strong)',
          background: done || dismissedToday
            ? 'var(--pj-glass-3)'
            : 'var(--pj-grad-ethereal)',
          boxShadow: done || dismissedToday ? 'var(--pj-elev-2)' : 'var(--pj-glow-cyan)',
          display: 'grid', placeItems: 'center',
          cursor: 'pointer', touchAction: 'manipulation',
          transition: 'background var(--pj-dur-slow) var(--pj-ease-standard), box-shadow var(--pj-dur-slow) var(--pj-ease-standard)',
        }}
      >
        <span
          aria-hidden="true"
          style={{
            width: 14, height: 14, borderRadius: '50%',
            border: '2px solid ' + (done || dismissedToday ? 'var(--on-surface-variant)' : '#160826'),
          }}
        />
      </button>
      <button type="button" onPointerDown={(e) => e.stopPropagation()} onClick={floating.togglePinned} aria-label={floating.pinned ? 'Unpin Ora' : 'Pin Ora here'} aria-pressed={floating.pinned} style={{ pointerEvents: 'auto', position: 'absolute', right: -5, top: -7, width: 20, height: 20, borderRadius: '50%', display: 'grid', placeItems: 'center', background: 'var(--bg-color)', border: '1px solid var(--pj-border-strong)', color: 'var(--on-surface-variant)' }}>{floating.pinned ? <Pin size={10} /> : <PinOff size={10} />}</button>
    </div>
  );
};

export default OraRail;
