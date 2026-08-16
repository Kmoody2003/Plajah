// Turn a source — an SF2 preset, an SFZ folder, or a single dropped file — into a KeraProgram
// with decoded audio the engine can play. The parsers produce zones and sample references; this
// resolves those references into real PCM.

import { parseSf2 } from './sf2';
import { parseSfz } from './sfz';
import { emptyProgram, type KeraProgram, type KeraSample, type KeraZone } from './zones';

function bufferToSample(id: string, name: string, buf: AudioBuffer, rootNote = 60): KeraSample {
  const channels: Float32Array[] = [];
  for (let c = 0; c < buf.numberOfChannels; c++) channels.push(buf.getChannelData(c).slice());
  return {
    id, name, channels, sampleRate: buf.sampleRate, rootNote, fineTune: 0,
    loopStart: 0, loopEnd: 0, loopMode: 'off',
  };
}

/**
 * A single audio file → a one-zone program mapped across the whole keyboard. The fastest path to
 * "drop a sample and play it chromatically", and the honest fallback for anything that isn't a
 * recognised instrument format.
 */
export async function programFromFile(file: Blob, name: string, ctx: BaseAudioContext, rootNote = 60): Promise<KeraProgram | null> {
  try {
    const buf = await ctx.decodeAudioData(await file.arrayBuffer());
    const prog = emptyProgram(name);
    prog.source = 'file';
    const sample = bufferToSample('s0', name, buf, rootNote);
    prog.samples = [sample];
    prog.zones = [{
      sampleId: 's0', loKey: 0, hiKey: 127, loVel: 1, hiVel: 127,
      rrGroup: 0, rrIndex: 0, tuneSemis: 0, tuneCents: 0, gainDb: 0, pan: 0, offGroup: 0,
    }];
    return prog;
  } catch {
    return null;
  }
}

/** Parse an SF2/SF3 and load one preset. Samples are already PCM-decoded by the parser. */
export function programFromSf2(bytes: Uint8Array, presetIndex = 0): { program: KeraProgram | null; presets: { name: string; index: number }[] } {
  const sf = parseSf2(bytes);
  if (!sf) return { program: null, presets: [] };
  return { program: sf.load(presetIndex), presets: sf.presets };
}

/**
 * Parse an SFZ and resolve its sample paths via a caller-supplied fetcher (a directory handle, a
 * File map, whatever the UI has). Samples SFZ keeps on the region — root note, loops — are folded
 * onto the built KeraSample.
 */
export async function programFromSfz(
  text: string,
  name: string,
  ctx: BaseAudioContext,
  fetchSample: (path: string) => Promise<Blob | null>,
): Promise<{ program: KeraProgram | null; missing: string[] }> {
  const parsed = parseSfz(text);
  const prog = emptyProgram(name);
  prog.source = 'sfz';
  prog.amp = parsed.amp;

  const idByPath = new Map<string, string>();
  const missing: string[] = [];
  let sid = 0;

  for (const region of parsed.regions) {
    if (!idByPath.has(region.samplePath)) {
      const blob = await fetchSample(region.samplePath);
      if (!blob) { missing.push(region.samplePath); continue; }
      try {
        const buf = await ctx.decodeAudioData(await blob.arrayBuffer());
        const id = `s${sid++}`;
        const sample = bufferToSample(id, region.samplePath.split('/').pop() || id, buf, region.rootNote);
        sample.loopStart = region.loopStart;
        sample.loopEnd = region.loopEnd;
        sample.loopMode = region.loopMode;
        prog.samples.push(sample);
        idByPath.set(region.samplePath, id);
      } catch {
        missing.push(region.samplePath);
        continue;
      }
    }
    const sampleId = idByPath.get(region.samplePath);
    if (!sampleId) continue;
    const zone: KeraZone = {
      sampleId,
      loKey: region.loKey, hiKey: region.hiKey, loVel: region.loVel, hiVel: region.hiVel,
      rrGroup: region.rrGroup, rrIndex: region.rrIndex,
      tuneSemis: region.tuneSemis, tuneCents: region.tuneCents,
      gainDb: region.gainDb, pan: region.pan, offGroup: region.offGroup,
    };
    prog.zones.push(zone);
  }

  return { program: prog.zones.length ? prog : null, missing };
}
