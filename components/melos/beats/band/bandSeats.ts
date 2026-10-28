// Seats for the session band: the real Chora instrument and preset each player sits down at
// (BAJO for Dwayne and Ingrid, LYRA's physical models for Rosie, Theo, Priya, Corny and Lena,
// AURA for the organ, woodwinds and section, SOMA for Amara, ONDA for Nova…), chosen per genre where the player would reach for a different sound. Kept out of the
// pure band/ core because the patch factories pull in the instrument modules.

import type { ArrangeTrack, GrooveDoc, InstrumentType } from '../../../../services/melos/beats/grooveDoc';
import { addInstrument } from '../../../../services/melos/beats/instrumentFactory';
import type { BandPlayer } from '../../../../services/melos/beats/band/roster';
import { findPreset } from '../../../../services/melos/instruments/onda/presets';
import { serializePatch } from '../../../../services/melos/instruments/onda/patch';
import { AURA_PRESETS, newAuraPatch, serializeAuraPatch } from '../../../../services/melos/instruments/aura/patch';
import { BAJO_PRESETS, newBajoPatch, serializeBajoPatch } from '../../../../services/melos/instruments/bajo/patch';
import { SOMA_PRESETS, newSomaPatch, serializeSomaPatch } from '../../../../services/melos/instruments/soma/patch';
import { lyraPresetById } from '../../../../services/melos/instruments/lyra/presets';
import { newLyraPatch, serializeLyraPatch } from '../../../../services/melos/instruments/lyra/patch';
import { newVelaPatch, serializeVelaPatch } from '../../../../services/melos/instruments/vela/patch';
import { presetsFor } from '../../../../services/melos/instruments/vela/suite';

export interface SeatSoundChoice { type: InstrumentType; presetId: string; patch?: Record<string, unknown>; presetName?: string }

/** The instrument + preset a player sits at for a genre. */
export function seatSound(player: BandPlayer, genre: string): SeatSoundChoice | null {
  if (player.seat.kind !== 'instrument') return null;
  const id = player.seat.byGenre?.[genre] ?? player.seat.preset;
  if (id.startsWith('pneuma-')) {
    const p = presetsFor('pneuma').find((x) => x.id === id);
    return { type: 'pneuma', presetId: id, patch: p ? serializeVelaPatch(newVelaPatch(p)) : undefined, presetName: p?.name };
  }
  switch (player.seat.type) {
    case 'aura': { const p = AURA_PRESETS.find((x) => x.id === id); return { type: 'aura', presetId: id, patch: p ? serializeAuraPatch(newAuraPatch(p)) : undefined, presetName: p?.name }; }
    case 'bajo': { const p = BAJO_PRESETS.find((x) => x.id === id); return { type: 'bajo', presetId: id, patch: p ? serializeBajoPatch(newBajoPatch(p)) : undefined, presetName: p?.name }; }
    case 'soma': { const p = SOMA_PRESETS.find((x) => x.id === id); return { type: 'soma', presetId: id, patch: p ? serializeSomaPatch(newSomaPatch(p)) : undefined, presetName: p?.name }; }
    case 'lyra': { const p = lyraPresetById(id); return { type: 'lyra', presetId: id, patch: p ? serializeLyraPatch(newLyraPatch(p)) : undefined, presetName: p?.name }; }
    case 'onda': { const p = findPreset(id); return { type: 'onda', presetId: id, patch: p ? serializePatch(p) : undefined, presetName: p?.name }; }
    default: return { type: player.seat.type, presetId: id };
  }
}

/** Make a player's seat track (pushed onto the doc, after `after` when given). */
export function createSeatTrack(doc: GrooveDoc, player: BandPlayer, genre: string, name: string, after?: ArrangeTrack): ArrangeTrack {
  const s = seatSound(player, genre) ?? { type: 'onda' as InstrumentType, presetId: '' };
  const id = addInstrument(doc, s.type, s.patch as Parameters<typeof addInstrument>[2], s.presetName);
  const idx = doc.arrangement.findIndex((t) => t.id === id);
  const track = doc.arrangement[idx];
  track.name = name;
  track.color = player.color;
  track.armed = false;
  if (after) {
    doc.arrangement.splice(idx, 1);
    doc.arrangement.splice(doc.arrangement.findIndex((t) => t.id === after.id) + 1, 0, track);
  }
  return track;
}
