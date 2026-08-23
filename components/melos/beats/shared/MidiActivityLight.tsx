// The MIDI activity light — the thing every hardware box and every DAW has, and the fastest
// answer to "is it even plugged in".
//
// Three states rather than two, because "connected" and "working" are different questions and
// the gap between them is exactly where an evening goes:
//
//   dim    — no device
//   green  — data arriving AND Melos acted on it
//   amber  — data arriving and NOTHING happened to it
//
// Amber is the one that earns its place. A controller can be connected, lit, sending, and still
// make no sound because nothing is armed or the notes are landing on empty pads; without this you
// are left guessing whether the cable, the browser, the device or the app is at fault.

import React, { useEffect, useRef, useState } from 'react';
import { subscribeMidiActivity, midiOutEnabled } from '../../../../services/melos/midiInput';

/** How long one blink stays lit. Short enough to read as a pulse, long enough to catch at 60fps. */
const BLINK_MS = 110;
/** How long after an unrouted note we keep warning. Longer, because it is a diagnosis. */
const WARN_MS = 900;

interface Props {
  connected: boolean;
  /** Compact form for the transport bar; the panel uses the labelled one. */
  showLabel?: boolean;
}

export const MidiActivityLight: React.FC<Props> = ({ connected, showLabel }) => {
  const [lit, setLit] = useState<'off' | 'in' | 'out' | 'unrouted'>('off');
  const timers = useRef<{ blink?: number; warn?: number }>({});
  // The unrouted warning has to survive a routed ping arriving milliseconds later for the SAME
  // event — input is reported before routing, so every routed note is briefly "unrouted" first.
  const routedAt = useRef(0);

  useEffect(() => {
    const stop = subscribeMidiActivity((a) => {
      const now = performance.now();
      if (a.dir === 'out') {
        setLit('out');
      } else if (a.routed) {
        routedAt.current = now;
        setLit('in');
        window.clearTimeout(timers.current.warn);
      } else {
        setLit('in');
        // Warn about unrouted NOTES only. An unmapped CC is completely normal — a mod wheel or a
        // fader nobody has learned yet is not a fault, and flashing amber every time one moves
        // would train you to ignore the one signal that matters. A note that produces nothing is
        // the actual "why is this silent" case.
        if (a.note !== undefined) {
          window.clearTimeout(timers.current.warn);
          timers.current.warn = window.setTimeout(() => {
            if (performance.now() - routedAt.current > 60) setLit('unrouted');
          }, 140);
        }
      }
      window.clearTimeout(timers.current.blink);
      timers.current.blink = window.setTimeout(
        () => setLit((s) => (s === 'unrouted' ? s : 'off')),
        BLINK_MS,
      );
    });
    return () => {
      stop();
      window.clearTimeout(timers.current.blink);
      window.clearTimeout(timers.current.warn);
    };
  }, []);

  // Clear a stale warning so the light does not sit amber forever after one bad note.
  useEffect(() => {
    if (lit !== 'unrouted') return;
    const t = window.setTimeout(() => setLit('off'), WARN_MS);
    return () => window.clearTimeout(t);
  }, [lit]);

  const color =
    lit === 'unrouted' ? '#F0B429'
    : lit === 'out' ? '#00DAF3'
    : lit === 'in' ? '#06D6A0'
    : connected ? 'rgba(6,214,160,0.30)'
    : 'rgba(255,255,255,0.18)';

  const title =
    !connected ? 'No MIDI device'
    : lit === 'unrouted' ? 'MIDI arriving, but nothing is routed to it — arm an instrument track'
    : lit === 'out' ? `MIDI out${midiOutEnabled() ? '' : ' (disabled)'}`
    : 'MIDI';

  return (
    <span className="inline-flex items-center gap-1" title={title}>
      <span
        aria-label={title}
        className="rounded-full"
        style={{
          width: 6,
          height: 6,
          background: color,
          boxShadow: lit !== 'off' ? `0 0 6px ${color}` : 'none',
          transition: 'background 60ms linear, box-shadow 60ms linear',
        }}
      />
      {showLabel && (
        <span className="text-[9px] uppercase tracking-[0.12em]" style={{ color: lit === 'unrouted' ? '#F0B429' : 'rgba(255,255,255,0.45)' }}>
          {lit === 'unrouted' ? 'not routed' : 'midi'}
        </span>
      )}
    </span>
  );
};
