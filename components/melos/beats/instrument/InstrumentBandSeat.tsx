// Shared live Session Band seat for all instrument panels (TONOS, AURA, ONDA, BAJO, VELA suite,
// KERA, and Maschine Kit). Reuses LiveAvatar, LoreCard, MusicianStageControls, KeysLens / KitLens,
// and BeatsEngine so every instrument gets live jamming, recording, audio listening, creative
// reference research, interactive demos, voice/text Q&A, and verified history.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Users } from 'lucide-react';
import type { ArrangeTrack } from '../../../../services/melos/beats/grooveDoc';
import { BeatsEngine } from '../../../../services/melos/beats/engine/BeatsEngine';
import { sheetById } from '../../../../services/melos/beats/band/character/sheets';
import { loreById, type InstrumentLore } from '../../../../services/melos/beats/band/lore';
import { KeysLens } from '../../../../services/melos/beats/band/live/keysLens';
import type { Lens } from '../../../../services/melos/beats/band/live/observations';
import { liveBus, now } from '../../../../services/melos/beats/band/live/events';
import type { LiveDirector } from '../../../../services/melos/beats/band/live/director';
import { summarizeStudioContext } from '../../../../services/melos/beats/band/studioContext';
import { LiveAvatar } from '../band/live/LiveAvatar';
import { LoreCard } from '../band/live/LoreCard';
import { MusicianStageControls } from '../band/live/MusicianStageControls';
import type { LiveHost } from '../band/live/useLiveCharacter';

export interface InstrumentBandSeatProps {
  /** Instrument id used on liveBus & lens matching ('tonos', 'aura', 'onda', 'bajo', 'vela', ..., 'kit'). */
  instrument: string;
  /** Session Band character id ('rosa', 'nova', 'hez', 'dwayne', 'priya', 'ingrid', 'felix', 'elena', 'marcus', 'amara', 'theo'). */
  playerId: string;
  /** Entry id inside INSTRUMENT_LORE (services/melos/beats/band/lore.ts). */
  loreId: string;
  /** Seat role line shown beside the musician's name. */
  role: string;
  /** Spoken/caption opener explaining this specific instrument/model. */
  intro: string;
  /** Live screen summary passed to the band AI mind. */
  screenText: string;
  accent: string;
  track?: ArrangeTrack;
  presetName?: string;
  defaultNote?: number;
  /** Optional custom lens (e.g. KitLens for Marcus); defaults to KeysLens(instrument). */
  customLens?: Lens;
  /** Optional custom demo step performer (e.g. Kit pad triggering). */
  playStep?: (stroke: string, velocity: number, note?: number, holdMs?: number) => void;
  /** Optional compact toggle header so denser views (like MachineView) can collapse/expand cleanly. */
  collapsible?: boolean;
  defaultCollapsed?: boolean;
}

export const InstrumentBandSeat: React.FC<InstrumentBandSeatProps> = ({
  instrument,
  playerId,
  loreId,
  role,
  intro,
  screenText,
  accent,
  track,
  presetName,
  defaultNote = 60,
  customLens,
  playStep,
  collapsible = false,
  defaultCollapsed = false,
}) => {
  const sheet = sheetById(playerId);
  const lore: InstrumentLore | undefined = loreById(loreId);
  const [director, setDirector] = useState<LiveDirector | null>(null);
  const [expanded, setExpanded] = useState(!defaultCollapsed);
  const referenceRef = useRef('');

  const trackId = track?.id ?? instrument;
  const lens = useMemo(() => customLens ?? new KeysLens(instrument, false), [customLens, instrument]);

  useEffect(() => {
    if (!expanded) return;
    liveBus.emit({ kind: 'open', instrument, trackId, at: now() });
    return () => liveBus.emit({ kind: 'close', instrument, trackId, at: now() });
  }, [expanded, instrument, trackId, playerId]);

  const fallbackPlayStep = useCallback((_stroke: string, velocity: number, note?: number, holdMs?: number) => {
    if (!track) return;
    const eng = BeatsEngine.get();
    const key = Math.max(0, Math.min(127, defaultNote + (note ?? 0)));
    void eng.init().then(async () => {
      const inst = await eng.ensureInstrument(track);
      if (!inst) return;
      if (inst.hasKeraProgram()) {
        inst.keraNoteOn(key, Math.round(velocity * 127));
        window.setTimeout(() => inst.keraNoteOff(key), Math.max(80, holdMs ?? 300));
        return;
      }
      const vid = inst.noteOn(key, velocity, 0, 0, 48000, true);
      window.setTimeout(() => inst.noteOff(vid, true), Math.max(80, holdMs ?? 300));
    });
  }, [defaultNote, track]);

  if (!sheet) return null;

  const resolvedPlayStep = playStep ?? (track ? fallbackPlayStep : undefined);

  const host: LiveHost = {
    lens,
    playStep: resolvedPlayStep,
    enrich: () => ({ intro, preset: presetName ?? '' }),
    screen: () => screenText,
    projectSummary: () => {
      const eng = BeatsEngine.get();
      return summarizeStudioContext(eng.getDoc(), {
        trackId: track?.id,
        recentChords: eng.playedChords(),
        activeInstrument: instrument,
        activePreset: presetName,
      }).promptSummary;
    },
    referenceSummary: () => referenceRef.current || undefined,
    activeInstrument: () => `${instrument.toUpperCase()}${presetName ? ` · ${presetName}` : ''}`,
    trivia: () => {
      if (!lore) return undefined;
      const pool = [
        ...lore.physics,
        ...lore.construction,
        ...lore.traditions,
        ...lore.variants.map((v) => `In ${v.where} there's the ${v.name}: ${v.how}`),
      ];
      return pool[Math.floor(Math.random() * pool.length)];
    },
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-black/30 p-3 flex flex-col gap-2.5">
      {collapsible && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="w-full flex items-center justify-between gap-2 text-left"
        >
          <span className="flex items-center gap-2 min-w-0">
            <Users size={12} style={{ color: sheet.look.color }} />
            <span className="text-[11px] font-bold" style={{ color: sheet.look.color }}>{sheet.displayName}</span>
            <span className="text-[10px] text-white/45 truncate">{role}{lore ? ` · ${lore.name}` : ''}</span>
          </span>
          <span className="text-[10px] text-white/55 flex items-center gap-1 shrink-0">
            {expanded ? 'Hide coach' : 'Live coach & history'}
            <ChevronDown size={12} style={{ transform: expanded ? 'rotate(180deg)' : undefined }} />
          </span>
        </button>
      )}
      {expanded && (
        <>
          <LiveAvatar
            key={`${sheet.id}-${instrument}-${loreId}`}
            sheet={sheet}
            host={host}
            fallbackLine={intro}
            role={role}
            onDirector={setDirector}
          />
          <MusicianStageControls
            playerId={sheet.id}
            instrument={instrument}
            accent={accent}
            track={track}
            presetName={presetName}
            defaultNote={defaultNote}
            director={director}
            playStep={resolvedPlayStep}
            onReferenceUpdate={(s) => { referenceRef.current = s; }}
          />
          {lore && (
            <div className="flex flex-col gap-1">
              <span className="text-[9px] uppercase tracking-[0.2em] text-white/35">{lore.name}</span>
              <LoreCard lore={lore} accent={accent} reader={{ name: sheet.displayName.split(' ')[0], director }} />
            </div>
          )}
        </>
      )}
    </div>
  );
};
