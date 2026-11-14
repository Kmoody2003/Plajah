// LYRA's band seat — the Session Band member who plays the instrument on screen, live beside it
// (band/live): the pianist Theo for the piano and the tine electric piano, Rosa for guitar, Priya or
// Ingrid for the bowed strings, Lena for sax, Corny for brass, Felix for the winds. They hear what
// you play on the keys or a controller (the keys lens: chords, touch, time, the tine's bark), talk
// in the pauses, play demos on this instrument, answer questions, and open up the instrument's lore.

import React, { useEffect, useMemo, useState } from 'react';
import type { ArrangeTrack } from '../../../../services/melos/beats/grooveDoc';
import { BeatsEngine } from '../../../../services/melos/beats/engine/BeatsEngine';
import type { LyraModel } from '../../../../services/melos/instruments/lyra/params';
import { sheetById } from '../../../../services/melos/beats/band/character/sheets';
import { loreById, type InstrumentLore } from '../../../../services/melos/beats/band/lore';
import { KeysLens } from '../../../../services/melos/beats/band/live/keysLens';
import { liveBus, now } from '../../../../services/melos/beats/band/live/events';
import type { LiveDirector } from '../../../../services/melos/beats/band/live/director';
import { LiveAvatar } from '../band/live/LiveAvatar';
import { LYRA_SEAT_INTROS } from '../../../../services/melos/beats/band/live/lineAudio';
import { LoreCard } from '../band/live/LoreCard';
import type { LiveHost } from '../band/live/useLiveCharacter';

/** Who plays which LYRA model, and the lore they bring. Variant matters for the violin family. */
function seatFor(model: LyraModel, variant: number): { player: string; lore: string; role: string } | null {
  switch (model) {
    case 'tine': return { player: 'theo', lore: 'tine-electric-piano', role: 'Session Band keys · live' };
    case 'piano': return { player: 'theo', lore: 'piano', role: 'Session Band keys · live' };
    case 'guitar': return { player: 'rosa', lore: 'guitar', role: 'Session Band guitar · live' };
    case 'violin': return variant === 2 ? { player: 'ingrid', lore: 'cello', role: 'Session Band cello · live' } : { player: 'priya', lore: 'violin', role: 'Session Band violin · live' };
    case 'sax': return { player: 'lena', lore: 'saxophone', role: 'Session Band sax · live' };
    case 'trumpet': case 'brass': return { player: 'corny', lore: 'trumpet', role: 'Session Band trumpet · live' };
    case 'flute': return { player: 'felix', lore: 'flute', role: 'Session Band winds · live' };
    case 'clarinet': case 'reed': return { player: 'felix', lore: 'clarinet', role: 'Session Band winds · live' };
    default: return null;
  }
}

/** A sentence to open with, true to the model as built — shared with the line renderer. */
const INTRO: Partial<Record<LyraModel, string>> = LYRA_SEAT_INTROS;

export const LyraBandSeat: React.FC<{ track: ArrangeTrack; model: LyraModel; variant: number; presetName: string; accent: string }> = ({ track, model, variant, presetName, accent }) => {
  const seat = seatFor(model, variant);
  const sheet = seat ? sheetById(seat.player) : undefined;
  const lore: InstrumentLore | undefined = seat ? loreById(seat.lore) : undefined;
  const [director, setDirector] = useState<LiveDirector | null>(null);
  const lens = useMemo(() => new KeysLens('lyra', model === 'tine'), [model]);

  useEffect(() => {
    liveBus.emit({ kind: 'open', instrument: 'lyra', trackId: track.id, at: now() });
    return () => liveBus.emit({ kind: 'close', instrument: 'lyra', trackId: track.id, at: now() });
  }, [track.id, model]);

  if (!seat || !sheet) return null;

  const host: LiveHost = {
    lens,
    playStep: (_stroke, velocity, note, holdMs) => {
      const eng = BeatsEngine.get();
      void eng.init().then(async () => {
        const inst = await eng.ensureInstrument(track);
        if (!inst) return;
        const vid = inst.noteOn(60 + (note ?? 0), velocity, 0, 0, 48000, true);
        setTimeout(() => inst.noteOff(vid, true), Math.max(60, holdMs ?? 300));
      });
    },
    enrich: () => ({ intro: INTRO[model] ?? '', preset: presetName }),
    screen: () => `The learner has LYRA open on "${presetName}" (the ${model === 'tine' ? 'tine electric piano' : model} model).`,
    trivia: () => {
      if (!lore) return undefined;
      const pool = [...lore.physics, ...lore.construction, ...lore.traditions, ...lore.variants.map((v) => `In ${v.where} there's the ${v.name}: ${v.how}`)];
      return pool[Math.floor(Math.random() * pool.length)];
    },
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-black/30 p-3 flex flex-col gap-2.5">
      <LiveAvatar key={sheet.id + model} sheet={sheet} host={host} fallbackLine={INTRO[model]} role={seat.role} onDirector={setDirector} />
      {lore && (
        <div className="flex flex-col gap-1">
          <span className="text-[9px] uppercase tracking-[0.2em] text-white/35">{lore.name}</span>
          <LoreCard lore={lore} accent={accent} reader={{ name: sheet.displayName.split(' ')[0], director }} />
        </div>
      )}
    </div>
  );
};
