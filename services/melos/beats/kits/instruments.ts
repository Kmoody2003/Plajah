// Multisample instrument parsers → InstrumentSpec. One per format; all pure (bytes in, spec out),
// sharing the kit layer's readers (miniXml, zip, zlib scanning) rather than new ones.
//
//   Read structurally:  SFZ (KERA's own parser — full key/velocity zones, round robins, loops) ·
//     Decent Sampler .dspreset (XML) · SoundFont .sf2 (KERA's SF2 parser, melodic presets) ·
//     Bitwig .multisample (zip + multisample.xml) · Logic EXS24 .exs (binary chunks).
//   Kontakt .nki:  Kontakt 2–4 kept zones in zlib-packed XML, read when present; newer files are
//     a closed binary, so the sample list is recovered from the file's embedded paths and the
//     zone map rebuilt from the sample names ("Piano C3 v2.wav"). Encrypted content (.nkx
//     monoliths, encrypted .ncw) can't be read at all — the spec says so, plainly.

import { all, kid, kids, parseXml, type XmlEl } from './miniXml';
import { isZip, scanAudioStringsDeep, utf8, zipEntries, zipRead, zlibSections } from './bytes';
import { AUDIO_EXT, type InstrumentFormat, type InstrumentSpec, type ZoneSpec, type KitSampleSource } from './types';
import { parseSfz as parseKeraSfz } from '../../instruments/kera/sfz';
import { parseSf2 as parseKeraSf2 } from '../../instruments/kera/sf2';

const baseName = (p: string) => p.replace(/\\/g, '/').split('/').pop()!.replace(/\.[^.]+$/, '');
const num = (s: string | undefined, d = 0) => { const n = parseFloat(s ?? ''); return Number.isFinite(n) ? n : d; };
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const key7 = (v: number) => clamp(Math.round(v), 0, 127);
const splitTune = (semis: number) => { const s = Math.trunc(semis); return { tuneSemis: s, tuneCents: Math.round((semis - s) * 100) }; };

/** A zone with defaults filled — every parser starts here. */
export function zone(sample: KitSampleSource, over: Partial<ZoneSpec> = {}): ZoneSpec {
  return {
    sample, rootNote: 60, loKey: 0, hiKey: 127, loVel: 1, hiVel: 127, rrGroup: 0, rrIndex: 0,
    tuneSemis: 0, tuneCents: 0, gainDb: 0, pan: 0, offGroup: 0,
    loopMode: 'off', loopStart: 0, loopEnd: 0, startFrame: 0, endFrame: 0, ...over,
  };
}

/** Which instrument format a file is, from its name. */
export function instrumentFormatFor(fileName: string): InstrumentFormat | null {
  const n = fileName.toLowerCase();
  if (n.endsWith('.sfz')) return 'sfz';
  if (n.endsWith('.dspreset')) return 'decent';
  if (n.endsWith('.sf2')) return 'soundfont';
  if (n.endsWith('.multisample')) return 'bitwig-multisample';
  if (n.endsWith('.exs')) return 'exs';
  if (n.endsWith('.nki')) return 'kontakt';
  return null;
}

export const KONTAKT_LOCKED_NOTE = 'Encrypted Kontakt content (.nkx monoliths, encrypted .ncw samples) can’t be opened outside Kontakt. The NKS browser still plays this instrument’s preview audio.';

export async function parseInstrumentBytes(format: InstrumentFormat, bytes: Uint8Array, fileName: string, opts: { presetIndex?: number } = {}): Promise<InstrumentSpec> {
  const name = baseName(fileName);
  switch (format) {
    case 'sfz': return parseSfzInstrument(utf8(bytes), name);
    case 'decent': return parseDsInstrument(utf8(bytes), name);
    case 'soundfont': return parseSf2Instrument(bytes, name, opts.presetIndex);
    case 'bitwig-multisample': return parseBitwigMultisample(bytes, name);
    case 'exs': return parseExs(bytes, name);
    case 'kontakt': return parseNki(bytes, name);
    case 'folder': return zonesFromFileNames([], name);
  }
}

// ── Sample names → zones ─────────────────────────────────────────────────────
// The fallback every library format eventually needs: "Piano C3 v2 rr1.wav" says its key, its
// velocity layer and its round robin. Note names read C3 = middle C (60), the Kontakt / Logic /
// Yamaha convention most sample libraries are named in.

const NOTE_PC: Record<string, number> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
const DYNAMICS = ['ppp', 'pp', 'p', 'mp', 'mf', 'f', 'ff', 'fff'];
const DYN_WORDS: Record<string, number> = { soft: 1, quiet: 1, low: 1, light: 1, med: 4, medium: 4, mid: 4, normal: 4, hard: 6, loud: 7, high: 6, strong: 6 };
const SEP = String.raw`(?:^|[\s_\-.()\[\]+,])`;

export interface NameFacts { note: number; layer: number | null; layerKind: 'index' | 'velocity' | 'dynamic' | null; rr: number | null }

/** What a sample's file name says about its zone. `note` is -1 when no key is named. */
export function nameFacts(path: string, middleCOctave = 3): NameFacts {
  const b = baseName(path);
  let note = -1;
  // Note names: C3, C#3, Db3, F#-1, "Csharp3". The last one in the name wins ("Harp 060 C3").
  const re = new RegExp(`${SEP}([A-Ga-g])(#|b|sharp|s(?=-?\\d))?(-?\\d)(?![\\d])`, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(b))) {
    const letter = m[1];
    // A lone lowercase letter is too often a word ending ("…e3" in "Vibe3") — only uppercase,
    // unless it's the whole token.
    if (letter === letter.toLowerCase() && m.index > 0 && /[A-Za-z]/.test(b[m.index - 1] ?? '')) continue;
    let pc = NOTE_PC[letter.toLowerCase()];
    if (m[2] === '#' || m[2] === 'sharp' || m[2] === 's') pc += 1;
    else if (m[2] === 'b') pc -= 1;
    note = (parseInt(m[3], 10) + (5 - middleCOctave)) * 12 + pc;
  }
  if (note < 0) {
    // A bare MIDI number token ("Piano_060.wav", "Rhodes-72-v3").
    const mm = new RegExp(`${SEP}(\\d{2,3})(?=$|[\\s_\\-.()\\[\\]+,])`).exec(b);
    if (mm) { const n = parseInt(mm[1], 10); if (n >= 12 && n <= 120) note = n; }
  }
  // Round robin: rr2, RR_3, "round robin 2", alt2, var3, seq2.
  const rrm = new RegExp(`${SEP}(?:rr|round[\\s_-]?robin|alt|var|seq)[\\s_-]?(\\d{1,2})(?=$|[^\\d])`, 'i').exec(b);
  const rr = rrm ? parseInt(rrm[1], 10) : null;
  // Velocity layer: v2, vel3, vl1, layer 2, velocity 64, dyn2 — or a dynamic marking / word.
  let layer: number | null = null;
  let layerKind: NameFacts['layerKind'] = null;
  const vm = new RegExp(`${SEP}(?:v|vel|velocity|vl|layer|lyr|dyn)[\\s_-]?(\\d{1,3})(?=$|[^\\d])`, 'i').exec(b);
  if (vm) { layer = parseInt(vm[1], 10); layerKind = layer > 16 ? 'velocity' : 'index'; }
  else {
    const tokens = b.split(/[\s_\-.()\[\]+,]+/).map((t) => t.toLowerCase());
    for (const t of tokens) {
      const d = DYNAMICS.indexOf(t);
      if (d >= 0 && t !== 'p' && t !== 'f') { layer = d; layerKind = 'dynamic'; break; }
      if (DYN_WORDS[t] !== undefined) { layer = DYN_WORDS[t]; layerKind = 'dynamic'; break; }
    }
  }
  return { note, layer, layerKind, rr };
}

/**
 * Build a keygroup from sample names: each named key spans halfway to its neighbours (the lowest
 * reaches down to 0, the highest up to 127), velocity layers split 1–127 in order, round robins
 * cycle. Files that name no key are listed in the notes.
 */
export function zonesFromFileNames(paths: string[], name: string, middleCOctave = 3, format: InstrumentFormat = 'folder'): InstrumentSpec {
  const facts = paths.filter((p) => AUDIO_EXT.test(p)).map((p) => ({ path: p, ...nameFacts(p, middleCOctave) }));
  const keyed = facts.filter((f) => f.note >= 0 && f.note <= 127);
  const notes: string[] = [];
  const unmapped = facts.length - keyed.length;
  if (!keyed.length) return { name, format, zones: [], notes: facts.length ? ['None of the sample names say which key they are (like “Piano C3.wav”), so there’s no keyboard map to build.'] : ['No samples found.'] };
  if (unmapped) notes.push(`${unmapped} sample${unmapped > 1 ? 's' : ''} without a key in the name left out.`);
  notes.push('Zones were mapped from the sample names (C3 = middle C). If it plays an octave off, use Transpose.');

  const roots = [...new Set(keyed.map((f) => f.note))].sort((a, b) => a - b);
  const span = new Map<number, [number, number]>();
  roots.forEach((r, i) => {
    const lo = i === 0 ? 0 : Math.floor((roots[i - 1] + r) / 2) + 1;
    const hi = i === roots.length - 1 ? 127 : Math.floor((r + roots[i + 1]) / 2);
    span.set(r, [lo, hi]);
  });
  // Velocity layers: order the distinct layer values (per instrument — layer naming is uniform).
  const layerVals = [...new Set(keyed.map((f) => f.layer).filter((v): v is number => v !== null))].sort((a, b) => a - b);
  const velocityNamed = keyed.some((f) => f.layerKind === 'velocity');
  const velRange = (layer: number | null): [number, number] => {
    if (layer === null || layerVals.length < 2) return [1, 127];
    const i = layerVals.indexOf(layer);
    if (velocityNamed) {
      // "vel_064": the number is the layer's top velocity.
      const lo = i === 0 ? 1 : layerVals[i - 1] + 1;
      return [clamp(lo, 1, 127), i === layerVals.length - 1 ? 127 : clamp(layer, 1, 127)];
    }
    const n = layerVals.length;
    return [Math.round((i * 127) / n) + 1, Math.round(((i + 1) * 127) / n)];
  };
  if (layerVals.length > 1) notes.push(`${layerVals.length} velocity layers.`);

  // Round robins: same key + layer, several files → a cycling group.
  const cell = new Map<string, typeof keyed>();
  for (const f of keyed) { const k = `${f.note}:${f.layer ?? ''}`; (cell.get(k) ?? cell.set(k, []).get(k)!).push(f); }
  const zones: ZoneSpec[] = [];
  let group = 0;
  for (const files of cell.values()) {
    const rrG = files.length > 1 ? ++group : 0;
    files.sort((a, b) => (a.rr ?? 0) - (b.rr ?? 0) || a.path.localeCompare(b.path));
    files.forEach((f, i) => {
      const [lo, hi] = span.get(f.note)!;
      const [lv, hv] = velRange(f.layer);
      zones.push(zone({ kind: 'path', path: f.path }, { rootNote: f.note, loKey: lo, hiKey: hi, loVel: lv, hiVel: hv, rrGroup: rrG, rrIndex: i, useFileLoop: true }));
    });
  }
  if (group) notes.push('Round robins cycle in turn.');
  zones.sort((a, b) => a.rootNote - b.rootNote || a.loVel - b.loVel || a.rrIndex - b.rrIndex);
  return { name, format, zones, notes };
}

/** A folder whose samples name their keys (≥ 4 distinct) — a melodic instrument, not a drum kit. */
export function looksLikeMultisample(paths: string[]): boolean {
  const audio = paths.filter((p) => AUDIO_EXT.test(p));
  if (audio.length < 4) return false;
  const notes = audio.map((p) => nameFacts(p).note).filter((n) => n >= 0);
  return new Set(notes).size >= 4 && notes.length >= audio.length * 0.6;
}

// ── SFZ ──────────────────────────────────────────────────────────────────────

export function parseSfzInstrument(text: string, name: string): InstrumentSpec {
  const parsed = parseKeraSfz(text);
  const zones = parsed.regions.map((r) => zone({ kind: 'path', path: r.samplePath.replace(/^\.\//, '') }, {
    rootNote: r.rootNote, loKey: r.loKey, hiKey: r.hiKey, loVel: r.loVel, hiVel: r.hiVel,
    rrGroup: r.rrGroup, rrIndex: r.rrIndex, tuneSemis: r.tuneSemis, tuneCents: r.tuneCents,
    gainDb: r.gainDb, pan: r.pan, offGroup: r.offGroup,
    loopMode: r.loopMode, loopStart: r.loopStart, loopEnd: r.loopEnd,
    startFrame: r.startFrame, endFrame: r.endFrame,
    // SFZ without loop opcodes defers to the file's own loop (spec: loop_mode defaults from it).
    useFileLoop: r.loopEnd <= r.loopStart && !/loop_mode|loopmode/.test(text),
  }));
  const notes = [...parsed.notes];
  const skip = parsed.ignoredOpcodes.filter((o) => !/^(lo|hi)(cc|bend|chanaft|polyaft|bpm|timer)|^(amp|fil|pitch)_|^(fil|pitch)eg_|^(amp|fil|pitch)lfo_|^label_|^set_cc|^xf/.test(o));
  if (parsed.ignoredOpcodes.length) notes.push(`Not carried over: ${(skip.length ? skip : parsed.ignoredOpcodes).slice(0, 6).join(', ')}${parsed.ignoredOpcodes.length > 6 ? '…' : ''} (filters, LFOs and CC controls stay in the SFZ).`);
  if (!zones.length) notes.unshift('No playable regions in this SFZ.');
  return { name, format: 'sfz', zones, amp: parsed.amp, notes };
}

// ── Decent Sampler .dspreset ─────────────────────────────────────────────────

const dsDb = (v: string | undefined) => {
  if (!v) return 0;
  const t = v.trim();
  if (/db$/i.test(t)) return num(t.replace(/db$/i, ''));
  const lin = num(t, 1);
  return lin > 0 ? clamp(20 * Math.log10(lin), -60, 12) : -60;
};

export function parseDsInstrument(xml: string, name: string): InstrumentSpec {
  const root = parseXml(xml);
  const groupsEl = all(root, 'groups')[0];
  const notes: string[] = [];
  const zones: ZoneSpec[] = [];
  let release = 0;
  const env = (a: Record<string, string>) => ({
    attack: num(a.attack, 0.001), hold: 0, decay: num(a.decay, 0), sustain: clamp(num(a.sustain, 1), 0, 1), release: num(a.release, 0.15),
  });
  let amp = env(groupsEl?.attrs ?? {});
  const groups = all(root, 'group');
  groups.forEach((g, gi) => {
    if (g.attrs.enabled === 'false') return;
    const ga = { ...(groupsEl?.attrs ?? {}), ...g.attrs };
    if (gi === 0 && (g.attrs.attack || g.attrs.release)) amp = env(ga);
    const groupDb = dsDb(groupsEl?.attrs.volume) + dsDb(g.attrs.volume);
    for (const s of kids(g, 'sample')) {
      const a = { ...ga, ...s.attrs };
      if (!a.path) continue;
      if ((a.trigger || '').toLowerCase() === 'release') { release++; continue; }
      const root = key7(num(a.rootNote, 60));
      const rr = /round_robin|random/i.test(a.seqMode || '');
      const loopOn = (a.loopEnabled || '').toLowerCase() === 'true';
      zones.push(zone({ kind: 'path', path: a.path.replace(/\\/g, '/') }, {
        rootNote: root, loKey: key7(num(a.loNote, 0)), hiKey: key7(num(a.hiNote, 127)),
        loVel: clamp(Math.round(num(a.loVel, 1)), 1, 127), hiVel: clamp(Math.round(num(a.hiVel, 127)), 1, 127),
        rrGroup: rr ? gi + 1 : 0, rrIndex: Math.max(0, Math.round(num(a.seqPosition, 1)) - 1),
        ...splitTune(num(a.tuning)),
        gainDb: groupDb + (s.attrs.volume ? dsDb(s.attrs.volume) : 0),
        pan: clamp(num(a.pan) / 100, -1, 1),
        loopMode: loopOn ? 'forward' : 'off', loopStart: Math.round(num(a.loopStart)), loopEnd: Math.round(num(a.loopEnd)),
        startFrame: Math.round(num(a.start)), endFrame: Math.round(num(a.end)),
        useFileLoop: !a.loopEnabled,
      }));
    }
  });
  if (release) notes.push(`${release} release-trigger sample${release > 1 ? 's' : ''} skipped — KERA plays attacks only.`);
  if (groups.some((g) => g.attrs.tags)) notes.push('Tagged groups (articulation / mic toggles) are all loaded together.');
  if (all(root, 'effects')[0]?.children.length) notes.push('Decent Sampler effects stay behind — add Chora inserts instead.');
  if (!zones.length) notes.unshift('No samples in this preset.');
  return { name, format: 'decent', zones, amp, notes };
}

// ── SoundFont .sf2 (melodic presets) ─────────────────────────────────────────
// KERA's SF2 parser materialises one preset with its PCM. The spec carries the preset list; the
// loader re-parses the same bytes for the chosen preset (instrumentLibrary.ts), so here the zones
// are a preview whose samples point back at the file.

export function parseSf2Instrument(bytes: Uint8Array, name: string, presetIndex?: number): InstrumentSpec {
  const sf = parseKeraSf2(bytes);
  if (!sf || !sf.presets.length) return { name, format: 'soundfont', zones: [], notes: ['Not a readable SoundFont 2 file.'] };
  const presets = sf.presets.map((p) => ({ name: p.name, index: p.index, bank: p.bank }));
  // Melodic first: bank 128 is the percussion bank (the Groups tab loads those as drum pads).
  const pick = presetIndex ?? (presets.find((p) => p.bank !== 128) ?? presets[0]).index;
  const prog = sf.load(pick);
  const notes: string[] = [];
  if (presets.length > 1) notes.push(`${presets.length} presets in this SoundFont — pick one below.`);
  if (presets[pick]?.bank === 128) notes.push('This is a percussion-bank preset — the Groups tab lays it out on drum pads.');
  if (!prog) return { name, format: 'soundfont', zones: [], notes: [...notes, 'This preset has no playable zones.'], presets, presetIndex: pick };
  const byId = new Map(prog.samples.map((s) => [s.id, s]));
  const zones = prog.zones.map((z) => {
    const s = byId.get(z.sampleId)!;
    return zone({ kind: 'path', path: `sf2:${pick}:${z.sampleId}` }, {
      rootNote: s.rootNote, loKey: z.loKey, hiKey: z.hiKey, loVel: z.loVel, hiVel: z.hiVel,
      tuneSemis: z.tuneSemis, tuneCents: z.tuneCents, gainDb: z.gainDb, pan: z.pan,
      loopMode: s.loopMode, loopStart: s.loopStart, loopEnd: s.loopEnd,
    });
  });
  return { name: prog.name || name, format: 'soundfont', zones, amp: prog.amp, notes, presets, presetIndex: pick };
}

// ── Bitwig .multisample ──────────────────────────────────────────────────────
// A zip: multisample.xml + the samples. <sample file gain tune sample-start sample-stop
// zone-logic> with <key root low high tune/>, <velocity low high/>, <loop mode start stop/>.

export async function parseBitwigMultisample(bytes: Uint8Array, fallbackName: string): Promise<InstrumentSpec> {
  const fail = (msg: string): InstrumentSpec => ({ name: fallbackName, format: 'bitwig-multisample', zones: [], notes: [msg] });
  if (!isZip(bytes)) return fail('Not a Bitwig multisample (expected a zip).');
  const blob = new Blob([bytes as BlobPart]);
  const entries = await zipEntries(blob);
  const xmlEntry = entries.find((e) => /(^|\/)multisample\.xml$/i.test(e.name));
  if (!xmlEntry) return fail('No multisample.xml inside this file.');
  const spec = parseMultisampleXml(utf8(await zipRead(blob, xmlEntry)), fallbackName);
  // Samples ride in the same zip — hand them over as bytes.
  const byName = new Map(entries.filter((e) => AUDIO_EXT.test(e.name)).map((e) => [e.name.toLowerCase(), e]));
  const byBase = new Map(entries.filter((e) => AUDIO_EXT.test(e.name)).map((e) => [e.name.split('/').pop()!.toLowerCase(), e]));
  const cache = new Map<string, Uint8Array>();
  for (const z of spec.zones) {
    if (z.sample.kind !== 'path') continue;
    const want = z.sample.path.replace(/\\/g, '/').toLowerCase();
    const e = byName.get(want) ?? byBase.get(want.split('/').pop()!);
    if (!e) continue;
    if (!cache.has(e.name)) cache.set(e.name, await zipRead(blob, e));
    z.sample = { kind: 'bytes', bytes: cache.get(e.name)!, ext: e.name.split('.').pop()!.toLowerCase() };
  }
  return spec;
}

export function parseMultisampleXml(xml: string, fallbackName: string): InstrumentSpec {
  const root = parseXml(xml);
  const name = root?.attrs.name || fallbackName;
  const zones: ZoneSpec[] = [];
  const samples = all(root, 'sample');
  const rrSeen = new Map<string, number>();
  for (const s of samples) {
    const file = s.attrs.file;
    if (!file) continue;
    const k = kid(s, 'key'), v = kid(s, 'velocity'), l = kid(s, 'loop');
    const rootNote = key7(num(k?.attrs.root, 60));
    const lo = key7(num(k?.attrs.low, 0)), hi = key7(num(k?.attrs.high, 127));
    const loVel = clamp(Math.round(num(v?.attrs.low, 1)), 1, 127), hiVel = clamp(Math.round(num(v?.attrs.high, 127)), 1, 127);
    const rr = (s.attrs['zone-logic'] || '').toLowerCase() === 'round-robin';
    let rrGroup = 0, rrIndex = 0;
    if (rr) {
      const cellKey = `${lo}:${hi}:${loVel}:${hiVel}`;
      rrIndex = rrSeen.get(cellKey) ?? 0;
      rrSeen.set(cellKey, rrIndex + 1);
      rrGroup = 1 + lo * 128 + hi;
    }
    const mode = (l?.attrs.mode || 'off').toLowerCase();
    zones.push(zone({ kind: 'path', path: file }, {
      rootNote, loKey: Math.min(lo, hi), hiKey: Math.max(lo, hi), loVel, hiVel, rrGroup, rrIndex,
      ...splitTune(num(s.attrs.tune) + num(k?.attrs.tune)),
      gainDb: num(s.attrs.gain),
      loopMode: mode === 'off' || !l ? 'off' : /sustain/.test(mode) ? 'sustain' : 'forward',
      loopStart: Math.round(num(l?.attrs.start)), loopEnd: Math.round(num(l?.attrs.stop)),
      startFrame: Math.round(num(s.attrs['sample-start'])), endFrame: Math.round(num(s.attrs['sample-stop'])),
    }));
  }
  const notes: string[] = [];
  if (samples.some((s) => s.attrs.reverse === 'true')) notes.push('Reversed samples play forwards.');
  if (samples.some((s) => kid(s, 'key')?.attrs.track === '0')) notes.push('Zones that don’t follow pitch play tuned across their range.');
  if (!zones.length) notes.push('No samples in this multisample.');
  return { name, format: 'bitwig-multisample', zones, notes };
}

// ── Logic EXS24 .exs ─────────────────────────────────────────────────────────
// A run of chunks, each an 84-byte header (signature, size, id, flags, 'TBOS'/'SOBT' magic, a
// 64-byte name) and a body. Chunk type is the signature's high byte & 0x0F: 1 zone, 2 group,
// 3 sample. Byte order varies by Logic version, so the walk tries both and keeps the one whose
// chunk sizes chain cleanly through the file.

interface ExsChunk { type: number; at: number; size: number; name: string }

function exsChunks(b: Uint8Array, little: boolean): ExsChunk[] | null {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const out: ExsChunk[] = [];
  const magicAt = (o: number) => o + 20 <= b.length && /^(TBOS|SOBT|JBOS|SOBJ)$/.test(utf8(b.subarray(o + 16, o + 20)));
  let i = 0;
  while (i + 84 <= b.length) {
    const sig = v.getUint32(i, little);
    const raw = v.getUint32(i + 4, little);
    if (!magicAt(i)) return out.length ? out : null;
    // Later Logic versions set flag bits (0x8000) in the size word — use whichever size chains to
    // the next chunk (or the end of the file).
    const size = [raw, raw & 0xffff7fff, raw & 0x7fff].find((n) => i + 84 + n === b.length || magicAt(i + 84 + n)) ?? raw;
    if (size > b.length) return out.length ? out : null;
    out.push({ type: (sig >>> 24) & 0x0f, at: i, size, name: utf8(b.subarray(i + 20, i + 84)).replace(/\0.*$/s, '').trim() });
    i += 84 + size;
  }
  return out;
}

export async function parseExs(bytes: Uint8Array, fallbackName: string): Promise<InstrumentSpec> {
  const fail = (msg: string): InstrumentSpec => ({ name: fallbackName, format: 'exs', zones: [], notes: [msg] });
  if (bytes.length < 84) return fail('Not an EXS24 instrument.');
  // Pick the byte order that walks furthest with sane zones.
  const tries = [true, false].map((little) => ({ little, chunks: exsChunks(bytes, little) ?? [] }));
  const best = tries.sort((a, b) => b.chunks.length - a.chunks.length)[0];
  if (!best.chunks.length) {
    // Logic Sampler's newer bundles aren't chunked; fall back to the sample names.
    return fromEmbeddedNames(bytes, fallbackName, 'exs', 'This EXS file isn’t in the chunk layout KERA reads — zones were rebuilt from sample names.');
  }
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const le = best.little;
  const u8 = (o: number) => (o < bytes.length ? bytes[o] : 0);
  const s8 = (o: number) => (o < bytes.length ? v.getInt8(o) : 0);
  const u32 = (o: number) => (o + 4 <= bytes.length ? v.getUint32(o, le) : 0);
  const cstr = (o: number, n: number) => (o < bytes.length ? utf8(bytes.subarray(o, Math.min(bytes.length, o + n))).replace(/\0.*$/s, '').trim() : '');

  const sampleFiles: string[] = [];
  for (const c of best.chunks.filter((x) => x.type === 3)) {
    // Folders are POSIX ("/Users/…") or classic Mac HFS ("Disk:Folder:Sub:") — normalise to '/'.
    const rawFolder = c.size >= 164 + 256 - 84 ? cstr(c.at + 164, 256) : '';
    const folder = rawFolder.includes('/') || !rawFolder.includes(':') ? rawFolder : rawFolder.replace(/:/g, '/');
    const file = c.size >= 420 + 256 - 84 ? cstr(c.at + 420, 256) : '';
    const fname = file || (AUDIO_EXT.test(c.name) ? c.name : `${c.name}.wav`);
    sampleFiles.push(folder && !fname.includes('/') ? `${folder.replace(/[\\/]+$/, '')}/${fname}` : fname);
  }
  const zones: ZoneSpec[] = [];
  let loopsTuned = false;
  for (const c of best.chunks.filter((x) => x.type === 1)) {
    const at = c.at;
    const opts = u8(at + 84);
    const root = u8(at + 85);
    const fine = s8(at + 86), pan = s8(at + 87), vol = s8(at + 88);
    const lo = u8(at + 90), hi = u8(at + 91);
    const velOn = (opts & 8) !== 0;
    const loVel = velOn ? u8(at + 93) : 1, hiVel = velOn ? u8(at + 94) : 127;
    const start = u32(at + 96), end = u32(at + 100), ls = u32(at + 104), lend = u32(at + 108);
    const loopOn = (u8(at + 117) & 1) !== 0;
    const coarse = c.size >= 164 - 84 + 1 ? s8(at + 164) : 0;
    const si = c.size >= 176 - 84 + 4 ? u32(at + 176) : -1;
    const path = sampleFiles[si];
    if (!path || root > 127 || lo > 127 || hi > 127) continue;
    if (loopOn && lend > ls) loopsTuned = true;
    zones.push(zone({ kind: 'path', path }, {
      rootNote: root, loKey: Math.min(lo, hi), hiKey: Math.max(lo, hi),
      loVel: clamp(Math.min(loVel, hiVel), 1, 127), hiVel: clamp(Math.max(loVel, hiVel), 1, 127),
      tuneSemis: coarse, tuneCents: fine, gainDb: vol, pan: clamp(pan / 50, -1, 1),
      loopMode: loopOn && lend > ls ? 'sustain' : 'off', loopStart: ls, loopEnd: lend,
      startFrame: start, endFrame: end > start ? end : 0,
      useFileLoop: !loopOn,
    }));
    // Zones with pitch tracking off (opts bit 1) still play tuned from their root.
  }
  const notes: string[] = [];
  if (!zones.length && sampleFiles.length) {
    return fromEmbeddedNames(bytes, exsName(best.chunks.find((c) => c.type === 0)?.name, fallbackName), 'exs', 'The zone table couldn’t be read — zones were rebuilt from sample names.');
  }
  if (best.chunks.some((c) => c.type === 2)) notes.push('EXS group settings (round-robin selection, group envelopes) aren’t read — zones play as mapped.');
  if (loopsTuned) notes.push('Loops play while a key is held.');
  return { name: exsName(best.chunks.find((c) => c.type === 0)?.name, fallbackName), format: 'exs', zones, notes };
}

/** Logic names unsaved instruments "Instrument #2539" — the file name says more. */
const exsName = (stored: string | undefined, fileName: string) => (stored && !/^Instrument\s*#?\d*$/i.test(stored) ? stored : fileName);

async function fromEmbeddedNames(bytes: Uint8Array, name: string, format: InstrumentFormat, why: string): Promise<InstrumentSpec> {
  const paths = await scanAudioStringsDeep(bytes);
  const spec = zonesFromFileNames(paths, name, 3, format);
  spec.notes.unshift(why);
  return spec;
}

// ── Kontakt .nki ─────────────────────────────────────────────────────────────

const ENCRYPTED_REF = /\.(nkx|nkc|nkr|ncw)$/i;

/** Kontakt 2–4 zone XML: <Zone> elements with <V name="…" value="…"/> parameters. */
function kontaktXmlZones(xmlText: string): ZoneSpec[] {
  const root = parseXml(xmlText);
  if (!root) return [];
  const out: ZoneSpec[] = [];
  const params = (el: XmlEl) => {
    const p: Record<string, string> = { ...el.attrs };
    for (const vEl of all(el, 'V')) if (vEl.attrs.name) p[vEl.attrs.name.toLowerCase()] = vEl.attrs.value ?? vEl.text.trim();
    for (const c of el.children) if (!c.children.length && c.text.trim()) p[c.name.toLowerCase()] = c.text.trim();
    return p;
  };
  const pick = (p: Record<string, string>, ...names: string[]) => { for (const n of names) if (p[n.toLowerCase()] !== undefined) return p[n.toLowerCase()]; return undefined; };
  for (const z of all(root, 'Zone')) {
    const p = params(z);
    const file = pick(p, 'filename', 'file', 'samplefile', 'path') ?? Object.values(p).find((x) => AUDIO_EXT.test(x) || ENCRYPTED_REF.test(x));
    if (!file) continue;
    const rootKey = num(pick(p, 'rootkey', 'root', 'rootnote'), NaN);
    if (!Number.isFinite(rootKey)) continue;
    out.push(zone({ kind: 'path', path: file.replace(/\\/g, '/') }, {
      rootNote: key7(rootKey),
      loKey: key7(num(pick(p, 'lowkey', 'keyrangelow', 'lokey'), 0)), hiKey: key7(num(pick(p, 'highkey', 'keyrangehigh', 'hikey'), 127)),
      loVel: clamp(Math.round(num(pick(p, 'lowvelocity', 'velrangelow', 'lovel'), 1)), 1, 127),
      hiVel: clamp(Math.round(num(pick(p, 'highvelocity', 'velrangehigh', 'hivel'), 127)), 1, 127),
      startFrame: Math.round(num(pick(p, 'samplestart'), 0)), endFrame: Math.round(num(pick(p, 'sampleend'), 0)),
      useFileLoop: true,
    }));
  }
  return out;
}

export async function parseNki(bytes: Uint8Array, name: string): Promise<InstrumentSpec> {
  // Kontakt 2–4: zones in zlib-packed XML.
  for (const sec of await zlibSections(bytes)) {
    const text = utf8(sec);
    if (!/<Zone[\s>]/.test(text)) continue;
    const zones = kontaktXmlZones(text.slice(text.indexOf('<')));
    if (zones.length) {
      const locked = zones.filter((z) => z.sample.kind === 'path' && ENCRYPTED_REF.test(z.sample.path)).length;
      if (locked === zones.length) return { name, format: 'kontakt', zones: [], notes: [KONTAKT_LOCKED_NOTE], locked: true };
      const notes = ['Zone map read from the instrument. Kontakt scripts, groups’ round-robin logic and effects stay in Kontakt.'];
      if (locked) notes.push(`${locked} zone${locked > 1 ? 's use' : ' uses'} compressed .ncw samples and stay silent.`);
      return { name, format: 'kontakt', zones: zones.filter((z) => !(z.sample.kind === 'path' && ENCRYPTED_REF.test(z.sample.path))), notes };
    }
  }
  // Kontakt 5+: a closed binary. The sample list is still there as plain paths.
  const refs = await scanAudioStringsDeep(bytes);
  const all_ = refs.concat(scanEncryptedRefs(bytes));
  const plain = refs.filter((r) => /\.(wav|wave|aif|aiff)$/i.test(r));
  if (!plain.length) {
    return {
      name, format: 'kontakt', zones: [], locked: true,
      notes: [all_.length ? `This instrument’s samples are ${all_.some((r) => /\.ncw$/i.test(r)) ? 'Kontakt-compressed (.ncw)' : 'in an encrypted monolith'}.` : 'No plain WAV/AIFF samples are referenced — they’re inside an encrypted .nkx monolith or the .nki itself.', KONTAKT_LOCKED_NOTE],
    };
  }
  const spec = zonesFromFileNames(plain, name, 3, 'kontakt');
  if (!spec.zones.length) {
    // Nothing named by key: the stray names found are not its samples, which live in a monolith.
    return { name, format: 'kontakt', zones: [], locked: true, notes: ['No zone map or key-named samples could be read — this instrument’s samples are most likely inside an encrypted .nkx monolith.', KONTAKT_LOCKED_NOTE] };
  }
  spec.notes.unshift('Newer Kontakt instruments keep their zone map in a closed format — zones were rebuilt from the sample names.');
  if (all_.length > plain.length) spec.notes.push('Some samples are .ncw (Kontakt-compressed) and are left out.');
  return spec;
}

/** .ncw / .nkx references (UTF-16LE in NI files) — only to explain what's locked. */
function scanEncryptedRefs(b: Uint8Array): string[] {
  const out: string[] = [];
  let run = '';
  for (let i = 0; i + 1 < b.length; i += 2) {
    const c = b[i] | (b[i + 1] << 8);
    if (c >= 0x20 && c < 0xd800 && c !== 0x7f) run += String.fromCharCode(c);
    else { if (ENCRYPTED_REF.test(run)) out.push(run); run = ''; }
  }
  if (ENCRYPTED_REF.test(run)) out.push(run);
  return out;
}

// ── Fit to the engine ────────────────────────────────────────────────────────

/** Distinct audio a spec needs (a sample + play window is one engine slot). */
export function sampleKey(z: ZoneSpec): string {
  const src = z.sample.kind === 'path' ? z.sample.path.toLowerCase() : `#${z.sample.bytes.byteOffset}:${z.sample.bytes.byteLength}`;
  return `${src}|${z.startFrame}|${z.endFrame}`;
}

/**
 * KERA holds 128 samples per instrument. A big library (88 keys × 8 layers × 4 round robins) is
 * thinned the way a "lite" patch would be: round robins first, then every other velocity layer
 * (the kept layer widens to cover the dropped one), then every other key (spans widen).
 */
export function fitToSlots(spec: InstrumentSpec, cap = 128): InstrumentSpec {
  const count = (zs: ZoneSpec[]) => new Set(zs.map(sampleKey)).size;
  let zones = spec.zones;
  const before = count(zones);
  if (before <= cap) return spec;
  const steps: string[] = [];
  if (zones.some((z) => z.rrGroup)) {
    zones = zones.filter((z) => !z.rrGroup || z.rrIndex === Math.min(...zones.filter((y) => y.rrGroup === z.rrGroup).map((y) => y.rrIndex)));
    zones = zones.map((z) => ({ ...z, rrGroup: 0, rrIndex: 0 }));
    steps.push('round robins');
  }
  while (count(zones) > cap) {
    const layers = [...new Set(zones.map((z) => `${z.loVel}-${z.hiVel}`))]
      .map((s) => s.split('-').map(Number) as [number, number]).sort((a, b) => a[0] - b[0]);
    if (layers.length < 2) break;
    // Keep odd layers counted from the top (the loudest survives), each widening downward.
    const keep = layers.filter((_, i) => (layers.length - 1 - i) % 2 === 0);
    const widened = new Map<string, number>();
    keep.forEach((l, i) => widened.set(`${l[0]}-${l[1]}`, i === 0 ? 1 : keep[i - 1][1] + 1));
    zones = zones.filter((z) => widened.has(`${z.loVel}-${z.hiVel}`)).map((z) => ({ ...z, loVel: widened.get(`${z.loVel}-${z.hiVel}`)! }));
    if (!steps.includes('velocity layers')) steps.push('velocity layers');
  }
  while (count(zones) > cap) {
    const roots = [...new Set(zones.map((z) => z.rootNote))].sort((a, b) => a - b);
    if (roots.length < 2) { zones = zones.slice(0, cap); break; }
    const keep = new Set(roots.filter((_, i) => i % 2 === 0));
    const kept = [...keep].sort((a, b) => a - b);
    zones = zones.filter((z) => keep.has(z.rootNote)).map((z) => {
      const i = kept.indexOf(z.rootNote);
      return { ...z, loKey: i === 0 ? Math.min(z.loKey, 0) : Math.floor((kept[i - 1] + z.rootNote) / 2) + 1, hiKey: i === kept.length - 1 ? 127 : Math.floor((z.rootNote + kept[i + 1]) / 2) };
    });
    if (!steps.includes('keys')) steps.push('keys');
  }
  return { ...spec, zones, notes: [...spec.notes, `This library has ${before} samples; KERA holds ${cap}, so ${steps.join(', then ')} were thinned.`] };
}
