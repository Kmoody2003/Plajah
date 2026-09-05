import React, { useEffect, useRef, useState } from 'react';
import { X, Pin, PinOff } from 'lucide-react';
import { usePersistentFloating } from '../../hooks/usePersistentFloating';
import { IconButton } from '../ui';
import { getProfile, getCheckin, saveCheckin, today } from '../../services/oraService';
import type { AppView } from '../../types';

/**
 * Ora — the Companion Rail (Direction C).
 *
 * Ora is not a destination you have to remember to visit. A small orb rides
 * along with the rest of the platform; tapping it opens a glass rail with the
 * whole check-in in it, and the check-in never opens a screen.
 *
 * This is the piece that attacks the category's actual problem. Standalone
 * wellbeing apps lose ~70% of users inside 100 days because opening them is a
 * chore you are already avoiding. A rail borrows the host app's reason to
 * exist: the user came for the music, and the check-in costs them one tap.
 *
 * Rules this component holds itself to:
 *   · It never appears uninvited more than once a day.
 *   · It never appears at all until the user has switched Ora on.
 *   · It is silent about what it holds — the orb reveals nothing to a passer-by.
 *   · Dismissing is always one tap, and dismissal is remembered for the day.
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
  const holdTimer = useRef<number | null>(null);
  const floating = usePersistentFloating('plajah:floating:ora', () => ({ x: window.innerWidth - 60, y: window.innerHeight - 205 }));

  // Ora is opt-in. Until the profile says so, this component renders nothing
  // and — just as importantly — reads and writes nothing.
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

  const dismissedToday = typeof window !== 'undefined' && sessionStorage.getItem(dismissKey()) === '1';

  if (!enabled || MUTED_VIEWS.includes(currentView)) return null;

  const record = async (mood: 1 | 2 | 3 | 4 | 5) => {
    setSaving(mood);
    await saveCheckin({ mood, surface: 'RAIL' });
    setSaving(null);
    setDone(true);
    // Let the confirmation land, then get out of the way. The rail's job is to
    // disappear — a wellbeing surface that lingers becomes another thing to close.
    window.setTimeout(() => setOpen(false), 900);
  };

  const dismiss = () => {
    setOpen(false);
    try { sessionStorage.setItem(dismissKey(), '1'); } catch { /* private mode */ }
  };

  // Press-and-hold on the orb opens the room; a tap opens the rail. One control,
  // two depths — which is the whole "ambient, with a room" integration model.
  const startHold = () => {
    holdTimer.current = window.setTimeout(() => { holdTimer.current = null; onOpenRoom(); }, 450);
  };
  const endHold = () => {
    if (holdTimer.current === null) return; // hold already fired
    window.clearTimeout(holdTimer.current);
    holdTimer.current = null;
    setOpen((o) => !o);
  };

  return (
    <div
      style={{
        position: 'fixed',
        left: floating.pos.x,
        top: floating.pos.y,
        zIndex: 60,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        gap: 'var(--pj-space-2)',
        pointerEvents: 'none',
      }}
      {...floating.dragProps}
    >
      {open && (
        <div
          role="group"
          aria-label="Ora check-in"
          style={{
            pointerEvents: 'auto',
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--pj-space-3)',
            padding: 'var(--pj-space-2) var(--pj-space-3)',
            borderRadius: 'var(--pj-radius-full)',
            background: 'color-mix(in srgb, var(--bg-color) 82%, transparent)',
            backdropFilter: 'blur(20px) saturate(180%)',
            WebkitBackdropFilter: 'blur(20px) saturate(180%)',
            border: '1px solid var(--pj-border-strong)',
            boxShadow: 'var(--pj-elev-4)',
            maxWidth: 'min(92vw, 420px)',
          }}
        >
          <div style={{ minWidth: 0 }}>
            <p className="type-label-lg" style={{ margin: 0, whiteSpace: 'nowrap' }}>
              {done ? 'Logged. Rest easy.' : 'How is it going?'}
            </p>
            <p className="type-body-sm" style={{ margin: 0, color: 'var(--on-surface-variant)', whiteSpace: 'nowrap' }}>
              {done ? 'That is all Ora needs today.' : 'One tap. Nothing opens.'}
            </p>
          </div>

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

          <IconButton variant="ghost" size="sm" aria-label="Not now" onClick={dismiss}>
            <X />
          </IconButton>
        </div>
      )}

      {/* The orb. Unlabelled and unrevealing by design — handing someone your
          phone should not advertise that you keep a journal on it. */}
      <button
        type="button"
        aria-label={open ? 'Close Ora check-in' : 'Ora — tap to check in, hold to open'}
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
