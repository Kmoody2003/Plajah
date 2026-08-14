import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Play, Square, Moon } from 'lucide-react';
import { Button, Surface, Eyebrow, Chip } from '../ui';
import { saveSession, updateProfile } from '../../services/oraService';

/**
 * Ora — Stillness. Guided breathwork.
 *
 * The timing is the product, so it is driven by the wall clock rather than by
 * counting animation frames: a backgrounded tab throttles rAF and setInterval,
 * and a breathing exercise that silently slows down when you look away is worse
 * than none. Each tick asks "how long has actually passed" and derives the
 * phase from that.
 *
 * The ring is not decoration either — it expands on the inhale and contracts on
 * the exhale, so the screen is doing the exercise with you. Under
 * `prefers-reduced-motion` the scale is pinned and the words carry it instead.
 *
 * Blueprint: docs/PLAJAH_WELLBEING_SUITE_BLUEPRINT.md
 */

interface Pattern {
  key: string;
  name: string;
  /** [inhale, hold, exhale, hold] in seconds. A 0 phase is skipped. */
  phases: [number, number, number, number];
  blurb: string;
}

const PATTERNS: Pattern[] = [
  { key: 'coherent', name: 'Coherent', phases: [5, 0, 5, 0], blurb: 'Five in, five out. The steady one — good any time.' },
  { key: 'box', name: 'Box', phases: [4, 4, 4, 4], blurb: 'Four sides, four counts. Settles a racing head.' },
  { key: '478', name: '4-7-8', phases: [4, 7, 8, 0], blurb: 'Long exhale. Built for the end of the day.' },
  { key: 'physio', name: 'Physiological sigh', phases: [4, 1, 8, 0], blurb: 'Two-stage inhale, long release. The fastest way down.' },
];

const DURATIONS = [1, 3, 5, 10] as const;

const PHASE_LABEL = ['Breathe in', 'Hold', 'Breathe out', 'Hold'] as const;

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export const Stillness: React.FC<{ onLogged?: () => void }> = ({ onLogged }) => {
  const [pattern, setPattern] = useState<Pattern>(PATTERNS[0]);
  const [minutes, setMinutes] = useState<number>(3);
  const [running, setRunning] = useState(false);
  const [phaseIdx, setPhaseIdx] = useState(0);
  const [phaseLeft, setPhaseLeft] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [scale, setScale] = useState(0.86);
  const [justLogged, setJustLogged] = useState<number | null>(null);

  const startedAt = useRef<number>(0);
  const raf = useRef<number | null>(null);
  const reduced = useRef(prefersReducedMotion());

  const cycle = pattern.phases.reduce((a, b) => a + b, 0);
  const totalSeconds = minutes * 60;

  /** Stop and persist. `seconds` is what was actually practised, never planned. */
  const stop = useCallback(async (completed: boolean) => {
    if (raf.current !== null) { cancelAnimationFrame(raf.current); raf.current = null; }
    const seconds = startedAt.current ? (Date.now() - startedAt.current) / 1000 : 0;
    setRunning(false);
    setScale(0.86);
    document.body.classList.remove('ora-quiet-hours');
    void updateProfile({ quietHours: false });
    startedAt.current = 0;
    setElapsed(0);
    if (seconds >= 5) {
      const saved = await saveSession({ kind: 'BREATH', pattern: pattern.key, seconds, completed });
      if (saved) { setJustLogged(Math.round(seconds)); onLogged?.(); }
    }
  }, [pattern.key, onLogged]);

  const tick = useCallback(() => {
    // Wall clock, not a frame counter — a throttled tab must not stretch a
    // five-minute session into eleven.
    const secs = (Date.now() - startedAt.current) / 1000;
    setElapsed(secs);

    if (secs >= totalSeconds) { void stop(true); return; }

    const into = secs % cycle;
    let acc = 0;
    let idx = 0;
    for (let i = 0; i < pattern.phases.length; i++) {
      const len = pattern.phases[i];
      if (len === 0) continue;
      if (into < acc + len) { idx = i; break; }
      acc += len;
      idx = i;
    }
    const len = pattern.phases[idx] || 1;
    const p = Math.min(1, Math.max(0, (into - acc) / len));
    setPhaseIdx(idx);
    setPhaseLeft(Math.ceil(len - (into - acc)));

    if (!reduced.current) {
      // 0 inhale → grow, 2 exhale → shrink, holds stay put at the boundary.
      const s =
        idx === 0 ? 0.86 + 0.24 * p :
        idx === 1 ? 1.10 :
        idx === 2 ? 1.10 - 0.24 * p :
        0.86;
      setScale(s);
    }
    raf.current = requestAnimationFrame(tick);
  }, [cycle, pattern.phases, totalSeconds, stop]);

  const start = () => {
    setJustLogged(null);
    startedAt.current = Date.now();
    setRunning(true);
    // Quiet Hours: the rest of Plajah steps back for the length of the session.
    // A wellbeing feature that can turn the host app down is a promise no
    // standalone app is able to make.
    document.body.classList.add('ora-quiet-hours');
    void updateProfile({ quietHours: true });
    raf.current = requestAnimationFrame(tick);
  };

  // Never leave the platform dimmed because a component unmounted mid-session.
  useEffect(() => () => {
    if (raf.current !== null) cancelAnimationFrame(raf.current);
    document.body.classList.remove('ora-quiet-hours');
  }, []);

  const remaining = Math.max(0, Math.ceil(totalSeconds - elapsed));
  const mmss = `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`;

  if (running) {
    return (
      <div style={{ display: 'grid', gap: 'var(--pj-space-8)', placeItems: 'center', textAlign: 'center', paddingTop: 'var(--pj-space-8)' }}>
        <div
          className="ora-breath"
          aria-hidden="true"
          style={{ transform: `scale(${scale})`, animation: 'none', transition: 'transform 120ms linear' }}
        >
          <span />
        </div>
        <div aria-live="polite">
          <p className="type-headline-md" style={{ margin: 0 }}>{PHASE_LABEL[phaseIdx]}</p>
          <p className="type-display-sm" style={{ margin: 'var(--pj-space-2) 0 0', fontVariantNumeric: 'tabular-nums' }}>
            {phaseLeft}
          </p>
        </div>
        <p className="type-body-md" style={{ margin: 0, color: 'var(--on-surface-variant)', fontVariantNumeric: 'tabular-nums' }}>
          {mmss} left · {pattern.name}
        </p>
        <Button variant="secondary" size="lg" icon={<Square />} onClick={() => void stop(false)}>
          Stop
        </Button>
        <p className="type-body-sm" style={{ margin: 0, color: 'var(--on-surface-variant)' }}>
          Stopping early still counts what you did.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 'var(--pj-space-6)' }}>
      {justLogged !== null && (
        <Surface level={2}>
          <p className="type-title-md" style={{ margin: 0 }}>
            {Math.floor(justLogged / 60) > 0
              ? `${Math.floor(justLogged / 60)} min ${justLogged % 60}s practised.`
              : `${justLogged} seconds practised.`}
          </p>
          <p className="type-body-sm" style={{ margin: '4px 0 0', color: 'var(--on-surface-variant)' }}>
            Logged. If you have a minutes goal, it just moved on its own.
          </p>
        </Surface>
      )}

      <div>
        <Eyebrow style={{ marginBottom: 'var(--pj-space-3)' }}>Pattern</Eyebrow>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--pj-space-2)' }}>
          {PATTERNS.map((p) => (
            <Chip key={p.key} interactive selected={pattern.key === p.key} onClick={() => setPattern(p)}>
              {p.name}
            </Chip>
          ))}
        </div>
        <p className="type-body-sm" style={{ margin: 'var(--pj-space-3) 0 0', color: 'var(--on-surface-variant)' }}>
          {pattern.blurb}
        </p>
      </div>

      <div>
        <Eyebrow style={{ marginBottom: 'var(--pj-space-3)' }}>How long</Eyebrow>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--pj-space-2)' }}>
          {DURATIONS.map((m) => (
            <Chip key={m} interactive selected={minutes === m} onClick={() => setMinutes(m)}>
              {m} min
            </Chip>
          ))}
        </div>
      </div>

      <Button variant="primary" size="xl" icon={<Play />} onClick={start} fullWidth>
        Begin
      </Button>

      <Surface level={1}>
        <div style={{ display: 'flex', gap: 'var(--pj-space-3)', alignItems: 'flex-start' }}>
          <Moon size={16} style={{ color: 'var(--pj-lilac)', flex: 'none', marginTop: 3 }} />
          <p className="type-body-sm" style={{ margin: 0, color: 'var(--on-surface-variant)', lineHeight: 1.6 }}>
            While a session runs, the rest of Plajah dims out of the way. Nothing is
            posted, nothing is shared, and only the minutes you actually practise are counted.
          </p>
        </div>
      </Surface>
    </div>
  );
};

export default Stillness;
