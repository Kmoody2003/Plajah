// CampusSilentModeGate — the lock over a teacher's Independent (creator) surface while Silent
// Mode is engaged.
//
// Tone matters more than usual here. This screen reads as PROTECTION, not punishment: the
// teacher hasn't done anything wrong, the platform is keeping a boundary on their behalf, and
// nothing is lost while it holds. So: the storefront stays live, notifications queue rather than
// vanish, and every transition is logged to a record the teacher owns and can hand to HR.
//
// Render it above the creator dashboard, not around it — it's an overlay, and the surface
// underneath keeps its state so leaving campus resumes exactly where they were.

import React, { useEffect, useState } from 'react';
import { ShieldCheck, MapPin, Clock, Hand, FileText } from 'lucide-react';
import type { CampusSilentModeEngine, SilentModeState } from '../../services/campusSilentMode';
import { T, btn } from './integrityTheme';

interface Props {
  engine: CampusSilentModeEngine;
  /** Optional deep link to the integrity record, so the log is one tap away from the lock. */
  onViewRecord?: () => void;
}

const CampusSilentModeGate: React.FC<Props> = ({ engine, onViewRecord }) => {
  const [state, setState] = useState<SilentModeState | null>(null);
  const [holdUntil, setHoldUntil] = useState<number | null>(null);

  useEffect(() => engine.subscribe(setState), [engine]);

  if (!state?.engaged) return null;

  const since = state.since
    ? new Date(state.since).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : '';

  const trigger =
    state.trigger === 'geofence' ? { Icon: MapPin, text: "you're on campus" } :
    state.trigger === 'schedule' ? { Icon: Clock, text: "you're within contracted hours" } :
    { Icon: Hand, text: 'you turned it on' };

  const tryExit = async () => {
    const result = await engine.setManual(false);
    if (result.ok === false) setHoldUntil(result.retryAt);
  };

  const holdMinutes = holdUntil ? Math.max(1, Math.ceil((holdUntil - Date.now()) / 60000)) : 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Campus Silent Mode"
      style={{
        position: 'fixed', inset: 0, zIndex: 4000, background: T.bg,
        display: 'grid', placeItems: 'center', padding: 24, fontFamily: T.font, color: T.ink,
      }}
    >
      <div style={{ maxWidth: 460, textAlign: 'center' }}>
        <div
          aria-hidden
          style={{
            width: 62, height: 62, margin: '0 auto 18px', borderRadius: 20,
            background: `linear-gradient(135deg, ${T.purple}, ${T.cyan})`,
            display: 'grid', placeItems: 'center',
          }}
        >
          <ShieldCheck size={28} />
        </div>

        <h1 style={{ margin: '0 0 10px', fontSize: 24, fontWeight: 900 }}>Silent Mode is on</h1>

        <p style={{ margin: '0 0 14px', color: T.muted, fontSize: 15, lineHeight: 1.65 }}>
          Your creator tools are paused because <strong style={{ color: T.ink }}>{trigger.text}</strong>.
          Your storefront stays live for buyers — nothing is lost, and any notifications arrive
          when you leave.
        </p>

        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
          justifyContent: 'center', color: T.faint, fontSize: 12.5, marginBottom: 20,
        }}>
          <trigger.Icon size={13} />
          <span>Engaged at {since}</span>
          <span aria-hidden>·</span>
          <span>Logged to your integrity record</span>
        </div>

        {state.failedClosed && (
          <p style={{
            margin: '0 0 18px', fontSize: 12.5, lineHeight: 1.6, color: T.warning,
            background: `${T.warning}14`, border: `1px solid ${T.warning}40`,
            borderRadius: 10, padding: '10px 14px', textAlign: 'left',
          }}>
            We couldn't get a location fix, so Silent Mode is holding on your contracted hours
            instead. That's deliberate — during district time it stays on rather than off.
          </p>
        )}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button onClick={tryExit} style={btn('solid', T.orange)}>
            {state.trigger === 'manual' ? 'Turn off Silent Mode' : "I've left campus"}
          </button>
          {onViewRecord && (
            <button onClick={onViewRecord} style={btn('outline', T.muted)}>
              <FileText size={14} /> View my record
            </button>
          )}
        </div>

        {holdUntil !== null && (
          <p role="status" style={{ marginTop: 16, fontSize: 12.5, lineHeight: 1.6, color: T.lilac }}>
            Silent Mode stays on until the campus boundary clears, or for about {holdMinutes} more
            minute{holdMinutes === 1 ? '' : 's'}. The hold is what makes your record worth
            something — a log you could switch off on demand wouldn't prove anything.
          </p>
        )}
      </div>
    </div>
  );
};

export default CampusSilentModeGate;
