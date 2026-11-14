// Multisample instruments from the library: open one (parse its file), then build a playable
// KERA program from it — samples resolved through the same library lookup kits use, decoded,
// cropped to their play windows, loop points rescaled to the decoded rate.

import type { FsHandle, SampleLookup } from './kitLibrary';
import { fileAt, readKitSample } from './kitLibrary';
import { fitToSlots, parseInstrumentBytes, sampleKey, zonesFromFileNames } from './instruments';
import { wavFacts } from './bytes';
import type { InstrumentSpec, KitLibraryIndex, LibraryInstrument, LibraryKit, ZoneSpec } from './types';
import { programFromSf2 } from '../../instruments/kera/loader';
import { emptyProgram, type KeraProgram, type KeraSample } from '../../instruments/kera/zones';

/** Parse an instrument. Folder instruments map their own samples by name. */
export async function openInstrument(roots: FsHandle[], index: KitLibraryIndex, inst: LibraryInstrument, presetIndex?: number): Promise<InstrumentSpec | null> {
  const root = roots[inst.root];
  if (!root) return null;
  if (inst.format === 'folder') {
    const files = index.samples.filter((s) => s.root === inst.root && s.path.startsWith(inst.path) && !s.path.slice(inst.path.length).includes('/'));
    return zonesFromFileNames(files.map((f) => f.path), inst.name);
  }
  const file = await fileAt(root, inst.path);
  if (!file) return null;
  return parseInstrumentBytes(inst.format, new Uint8Array(await file.arrayBuffer()), file.name, { presetIndex });
}

/** An instrument stands in for a kit when resolving its sample paths (same library rules). */
const asKit = (inst: LibraryInstrument): LibraryKit => ({
  id: inst.id, root: inst.root, path: inst.path, name: inst.name, product: inst.product,
  format: inst.format === 'folder' ? 'folder' : 'sfz',
});

export interface BuiltInstrument { program: KeraProgram; missing: string[]; notes: string[] }

/**
 * Build the playable program. SoundFonts go through KERA's own SF2 loader (exact PCM, no decode);
 * everything else resolves each distinct sample once, decodes it, and shares it across zones.
 */
export async function buildInstrumentProgram(
  roots: FsHandle[], lookup: SampleLookup, inst: LibraryInstrument, spec: InstrumentSpec, ctx: BaseAudioContext,
  onProgress?: (done: number, total: number) => void,
): Promise<BuiltInstrument | null> {
  if (inst.format === 'soundfont') {
    const file = await fileAt(roots[inst.root], inst.path);
    if (!file) return null;
    const { program } = programFromSf2(new Uint8Array(await file.arrayBuffer()), spec.presetIndex ?? 0);
    return program ? { program, missing: [], notes: spec.notes } : null;
  }
  const fitted = fitToSlots(spec);
  const prog = emptyProgram(spec.name);
  prog.source = 'sfz';
  if (spec.amp) prog.amp = { ...spec.amp };
  const kit = asKit(inst);
  const idOf = new Map<string, string | null>();
  const missing: string[] = [];
  const keys = [...new Set(fitted.zones.map(sampleKey))];
  let done = 0;
  for (const z of fitted.zones) {
    const k = sampleKey(z);
    if (!idOf.has(k)) {
      onProgress?.(++done, keys.length);
      const sample = await loadZoneSample(roots, lookup, kit, z, `s${prog.samples.length}`, ctx);
      if (sample) prog.samples.push(sample);
      else missing.push(z.sample.kind === 'path' ? z.sample.path : 'embedded sample');
      idOf.set(k, sample?.id ?? null);
    }
    const id = idOf.get(k);
    if (!id) continue;
    const s = prog.samples.find((x) => x.id === id)!;
    // One sample, several zones with different roots: the sample keeps the first root, the others
    // fold the difference into their tuning (the engine resamples from the sample's root).
    prog.zones.push({
      sampleId: id, loKey: z.loKey, hiKey: z.hiKey, loVel: z.loVel, hiVel: z.hiVel,
      rrGroup: z.rrGroup, rrIndex: z.rrIndex,
      tuneSemis: z.tuneSemis + (s.rootNote - z.rootNote), tuneCents: z.tuneCents,
      gainDb: z.gainDb, pan: z.pan, offGroup: z.offGroup,
    });
  }
  if (!prog.zones.length) return null;
  return { program: prog, missing: [...new Set(missing)], notes: fitted.notes };
}

async function loadZoneSample(roots: FsHandle[], lookup: SampleLookup, kit: LibraryKit, z: ZoneSpec, id: string, ctx: BaseAudioContext): Promise<KeraSample | null> {
  const got = await readKitSample(roots, lookup, kit, z.sample);
  if (!got) return null;
  const bytes = new Uint8Array(await got.file.arrayBuffer());
  const facts = wavFacts(bytes);
  let buf: AudioBuffer;
  try { buf = await ctx.decodeAudioData(bytes.slice().buffer); } catch { return null; }
  // Frame positions are in the file's frames; the decoded buffer runs at the context's rate.
  const ratio = facts?.sampleRate ? buf.sampleRate / facts.sampleRate : 1;
  const at = (f: number) => Math.round(f * ratio);
  const start = Math.min(buf.length, at(z.startFrame));
  const end = z.endFrame > z.startFrame ? Math.min(buf.length, at(z.endFrame)) : buf.length;
  if (end - start < 16) return null;
  const channels: Float32Array[] = [];
  for (let c = 0; c < Math.min(2, buf.numberOfChannels); c++) channels.push(buf.getChannelData(c).slice(start, end));
  let loopMode = z.loopMode, loopStart = z.loopStart, loopEnd = z.loopEnd;
  let rootNote = z.rootNote, fineTune = 0;
  if (z.useFileLoop && facts?.loopEnd && facts.loopStart !== undefined) {
    loopMode = 'sustain'; loopStart = facts.loopStart; loopEnd = facts.loopEnd;
  }
  // A file-named zone with no root of its own trusts the WAV's recorded root.
  if (z.useFileLoop && facts?.rootNote !== undefined && z.rootNote < 0) { rootNote = facts.rootNote; fineTune = facts.fineCents ?? 0; }
  const ls = clampTo(at(loopStart) - start, channels[0].length), le = clampTo(at(loopEnd) - start, channels[0].length);
  return {
    id, name: (z.sample.kind === 'path' ? z.sample.path : got.file.name).split('/').pop()!.replace(/\.[^.]+$/, ''),
    channels, sampleRate: buf.sampleRate, rootNote, fineTune,
    loopStart: ls, loopEnd: le, loopMode: le > ls + 8 ? loopMode : 'off',
  };
}

const clampTo = (v: number, n: number) => Math.max(0, Math.min(n, v));
