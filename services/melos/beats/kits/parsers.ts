// Kit-file parsers → KitSpec. One per format; all pure (bytes in, spec out).
//
//   Open formats, read structurally:  MPC .xpm (XML) · Ableton .adg (gzip XML) · Studio One
//     Impact .preset (zip + XML) · SFZ · Hydrogen drumkit.xml / .h2drumkit (tar.gz) · Decent
//     Sampler .dspreset (XML) · SoundFont .sf2 (RIFF, samples embedded).
//   Proprietary binaries, read by their embedded sample paths:  Maschine .mxgrp / .mxsnd,
//     Battery .nbkt, Bitwig .bwpreset. These recover WHICH samples sit on WHICH pads (file order);
//     per-sound settings, plugin sounds and FX inside them are not decoded, and the UI says so.

import { all, childText, kid, kids, parseXml, walk, type XmlEl } from './miniXml';
import { AUDIO_EXT, type KitFormat, type KitPadSpec, type KitSpec } from './types';
import { inflate, isGzip, isZip, scanAudioStrings, scanAudioStringsDeep, tarEntries, utf8, zipEntries, zipRead, zlibSections } from './bytes';
import { ENGINE_LABEL, bitwigDrumsAt, fromLiveDs, maschineSynthsIn, type DrumSynthPatch } from '../drumSynth';
import { layoutFolderKit, classifySample, CATEGORY_COLOR } from './drumClassify';

const baseName = (p: string) => p.replace(/\\/g, '/').split('/').pop()!.replace(/\.[^.]+$/, '');
const num = (s: string | undefined, d = 0) => { const n = parseFloat(s ?? ''); return Number.isFinite(n) ? n : d; };
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const toDb = (lin: number) => (lin > 0 ? clamp(20 * Math.log10(lin), -48, 12) : -48);
/** Any choke/mute-group number → MEKA's 1–8 (0 stays "none"). */
const chokeOf = (g: number) => (g > 0 ? ((Math.round(g) - 1) % 8) + 1 : 0);
const padName = (name: string, samplePath?: string) => (name.trim() || (samplePath ? baseName(samplePath) : '') || 'Sound').slice(0, 18);

/** Which format a file is, from its name (and, for the ambiguous .xpm / .xml, its first bytes). */
export function kitFormatFor(fileName: string, head?: Uint8Array): KitFormat | null {
  const n = fileName.toLowerCase();
  if (n.endsWith('.mxgrp')) return 'maschine-group';
  if (n.endsWith('.mxsnd')) return 'maschine-sound';
  if (n.endsWith('.nbkt')) return 'battery';
  if (n.endsWith('.xpm')) {
    // X11 pixmaps share the extension ("/* XPM */"); MPC programs are XML.
    if (head && !utf8(head.subarray(0, 512)).includes('<')) return null;
    return 'mpc';
  }
  if (n.endsWith('.adg')) return 'ableton';
  if (n.endsWith('.preset')) return 'impact';
  if (n.endsWith('.bwpreset')) return 'bitwig';
  if (n.endsWith('.sfz')) return 'sfz';
  if (n.endsWith('.h2drumkit') || n === 'drumkit.xml') return 'hydrogen';
  if (n.endsWith('.dspreset')) return 'decent';
  if (n.endsWith('.sf2')) return 'soundfont';
  return null;
}

export async function parseKitBytes(format: KitFormat, bytes: Uint8Array, fileName: string): Promise<KitSpec> {
  const name = baseName(fileName);
  switch (format) {
    case 'mpc': return parseXpm(utf8(bytes), name);
    case 'ableton': return parseAdg(isGzip(bytes) ? utf8(await inflate(bytes, 'gzip')) : utf8(bytes), name);
    case 'impact': return parseImpact(bytes, name);
    case 'sfz': return parseSfz(utf8(bytes), name);
    case 'hydrogen': return parseHydrogenFile(bytes, name);
    case 'decent': return parseDspreset(utf8(bytes), name);
    case 'soundfont': return parseSf2(bytes, name);
    case 'bitwig': return parseBitwig(bytes, name);
    case 'maschine-group': case 'maschine-sound': case 'battery':
      return parseNiBinary(format, bytes, name);
    case 'folder': return parseFolderKit(name, []);
  }
}

// ── Folder of one-shots ──────────────────────────────────────────────────────

export function parseFolderKit(name: string, paths: string[]): KitSpec {
  const laid = layoutFolderKit(paths.map((path) => ({ path })));
  return {
    name, format: 'folder', notes: [],
    pads: laid.map(({ file, slot, category }) => ({
      slot, name: padName('', file.path), sample: { kind: 'path', path: file.path },
      color: CATEGORY_COLOR[category], choke: category === 'hat-closed' || category === 'hat-open' ? 1 : 0,
    })),
  };
}

// ── NI binaries (Maschine, Battery) ──────────────────────────────────────────

export async function parseNiBinary(format: KitFormat, bytes: Uint8Array, name: string): Promise<KitSpec> {
  const paths = await scanAudioStringsDeep(bytes);
  // Maschine Drum Synths carry no sample — they show up as their engine + model names.
  const synths = format === 'battery' ? [] : await niDrumSynths(bytes);
  const list = format === 'maschine-sound' ? paths.slice(0, 1) : paths;
  const notes = format === 'battery'
    ? ['Battery cell settings (tune, envelopes, effects) stay in Battery — samples and order come across.']
    : ['Maschine plug-in sounds (Massive, Kontakt…) and effects can’t come across — the samples and their pad order do.'];
  const pads: KitPadSpec[] = list.map((p, i) => ({ slot: i, name: padName('', p), sample: { kind: 'path', path: p }, color: CATEGORY_COLOR[classifySample(p)] }));
  const synthList = format === 'maschine-sound' ? (list.length ? [] : synths.slice(0, 1)) : synths;
  for (const d of synthList) pads.push(synthPad(pads.length, d));
  if (synthList.length) {
    notes.push(`${synthList.length} Maschine Drum Synth sound${synthList.length > 1 ? 's' : ''} → MEKA Drum Synth (engine and model carried over; knob settings start from the model’s defaults).`);
    if (list.length) notes.push('Drum Synth sounds are placed after the sample pads — the original pad order between them isn’t known.');
  }
  if (!paths.length && !synthList.length) notes.unshift('No sample references found in this file — it may hold only plug-in sounds.');
  return { name, format, notes, pads };
}

/** A pad spec for a translated drum synth. */
function synthPad(slot: number, d: DrumSynthPatch): KitPadSpec {
  const eng = ENGINE_LABEL[d.engine];
  return { slot, name: eng, sample: null, drumSynth: d, color: CATEGORY_COLOR[classifySample(eng)] };
}

/** Printable UTF-16LE runs in a binary (NI files store their names that way). */
export function utf16Strings(b: Uint8Array, min = 3): string[] {
  const out: string[] = [];
  let cur = '';
  for (let i = 0; i + 1 < b.length; i += 2) {
    const c = b[i] | (b[i + 1] << 8);
    if (c >= 0x20 && c < 0x7f) { cur += String.fromCharCode(c); continue; }
    if (cur.length >= min) out.push(cur);
    cur = '';
  }
  if (cur.length >= min) out.push(cur);
  return out;
}

async function niDrumSynths(b: Uint8Array): Promise<DrumSynthPatch[]> {
  // Both byte alignments: a UTF-16 string may start on an odd offset.
  const scan = (x: Uint8Array) => [...utf16Strings(x), ...utf16Strings(x.subarray(1))];
  let found = maschineSynthsIn(scan(b));
  if (!found.length) for (const inner of await zlibSections(b)) { found = maschineSynthsIn(scan(inner)); if (found.length) break; }
  return found;
}

// ── Bitwig .bwpreset ─────────────────────────────────────────────────────────
// Binary object graph ("BtWg" header). Strings are typed: 0x08, u32 big-endian length, UTF-8.

export function bitwigStrings(b: Uint8Array): string[] {
  const out: string[] = [];
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  for (let i = 0; i + 5 < b.length; i++) {
    if (b[i] !== 0x08) continue;
    const len = v.getUint32(i + 1);
    if (len < 5 || len > 2048 || i + 5 + len > b.length) continue;
    const s = utf8(b.subarray(i + 5, i + 5 + len));
    if (AUDIO_EXT.test(s) && !/[\0�]/.test(s)) { out.push(s); i += 4 + len; }
  }
  return out;
}

/** Typed sample-path strings with their byte offsets (first occurrence of each path). */
function bitwigPathsAt(b: Uint8Array): { at: number; path: string }[] {
  const out: { at: number; path: string }[] = [];
  const seen = new Set<string>();
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  for (let i = 0; i + 5 < b.length; i++) {
    if (b[i] !== 0x08) continue;
    const len = v.getUint32(i + 1);
    if (len < 5 || len > 2048 || i + 5 + len > b.length) continue;
    const s = utf8(b.subarray(i + 5, i + 5 + len));
    if (AUDIO_EXT.test(s) && !/[\0�]/.test(s)) { if (!seen.has(s)) { seen.add(s); out.push({ at: i, path: s }); } i += 4 + len; }
  }
  return out;
}

export function parseBitwig(bytes: Uint8Array, name: string): KitSpec {
  const typed = bitwigPathsAt(bytes);
  const drums = bitwigDrumsAt(bytes);
  // Chains are stored in pad order, so sample chains and E-drum chains interleave by position.
  const events: ({ at: number; path: string } | { at: number; patch: DrumSynthPatch })[] = typed.length
    ? [...typed, ...drums].sort((a, b) => a.at - b.at)
    : [...[...new Set(scanAudioStrings(bytes))].map((path) => ({ at: 0, path })), ...drums];
  const notes = ['Bitwig device settings inside the kit (Sampler envelopes, FX) stay in Bitwig — samples come across in pad order from C1.'];
  if (drums.length) notes.push(`${drums.length} Bitwig E-drum${drums.length > 1 ? 's' : ''} (E-Kick, E-Snare…) → MEKA Drum Synth with tuning and decays.`);
  if (utf8(bytes.subarray(0, 4)) !== 'BtWg') notes.unshift('Not a Bitwig preset file.');
  if (!events.length) notes.unshift('No samples referenced — packaged factory kits keep theirs inside Bitwig’s package store; add that folder to the library.');
  return {
    name, format: 'bitwig', notes,
    pads: events.map((e, i) => ('patch' in e ? synthPad(i, e.patch) : { slot: i, name: padName('', e.path), sample: { kind: 'path', path: e.path } })),
  };
}

// ── MPC .xpm ─────────────────────────────────────────────────────────────────

export function parseXpm(xml: string, fallbackName: string): KitSpec {
  const root = parseXml(xml);
  const program = all(root, 'Program')[0];
  const name = childText(program, 'ProgramName') || fallbackName;
  const notes: string[] = [];
  if (program && program.attrs.type && program.attrs.type !== 'Drum') notes.push(`This is an MPC ${program.attrs.type} program — loaded as drum pads.`);
  const instruments = new Map<number, XmlEl>();
  for (const inst of all(program, 'Instrument')) instruments.set(num(inst.attrs.number, -1), inst);

  const raw: (KitPadSpec & { lin: number })[] = [];
  const fromInstrument = (inst: XmlEl, slot: number) => {
    const layers = all(inst, 'Layer').filter((l) => childText(l, 'SampleName') || childText(l, 'SampleFile'));
    const layer = layers[0];
    if (!layer) return;
    if (layers.length > 1 && !notes.some((n) => n.startsWith('Velocity'))) notes.push('Velocity layers: the first layer of each pad is used.');
    const file = childText(layer, 'SampleFile');
    const sname = childText(layer, 'SampleName');
    const path = file || `${sname}.wav`;
    const lin = num(childText(inst, 'Volume'), 1) * num(childText(layer, 'Volume'), 1);
    const pan = (num(childText(inst, 'Pan'), 0.5) - 0.5) * 2 + (num(childText(layer, 'Pan'), 0.5) - 0.5) * 2;
    const tune = num(childText(inst, 'TuneCoarse')) + num(childText(inst, 'TuneFine')) / 100
      + num(childText(layer, 'TuneCoarse')) + num(childText(layer, 'TuneFine')) / 100 + num(childText(layer, 'Pitch'));
    raw.push({
      slot, name: padName(sname, path), sample: { kind: 'path', path }, lin,
      pan: clamp(pan, -1, 1), tuneSemis: clamp(tune, -24, 24), choke: chokeOf(num(childText(inst, 'MuteGroup'))),
    });
  };

  const padNotes = all(root, 'PadNote');
  if (padNotes.length) {
    for (const pn of padNotes) {
      const pad = num(pn.attrs.number, 0);       // 1-based: A01 = 1 (bottom-left), B01 = 17…
      const note = num(childText(pn, 'Note'), -1);
      const inst = instruments.get(note);
      if (pad >= 1 && inst) fromInstrument(inst, pad - 1);
    }
  }
  if (!raw.length) {
    // No pad map: instruments in number order fill the pads.
    [...instruments.entries()].sort((a, b) => a[0] - b[0]).forEach(([, inst]) => fromInstrument(inst, raw.length));
  }
  // MPC volumes are linear; keep the kit's balance with the loudest pad at 0 dB.
  const peak = Math.max(1e-6, ...raw.map((p) => p.lin));
  const pads = raw.map(({ lin, ...p }) => ({ ...p, gainDb: +toDb(lin / peak).toFixed(2) }));
  return { name, format: 'mpc', notes, pads };
}

// ── Ableton Drum Rack .adg ───────────────────────────────────────────────────

const val = (el: XmlEl | undefined) => el?.attrs.Value ?? '';

function abletonSamplePath(branch: XmlEl): string {
  const p = abletonFileRef(branch);
  // Only audio counts — a device's own file (a Max device, an instrument preset) isn't a sample.
  return AUDIO_EXT.test(p) ? p : '';
}
function abletonFileRef(branch: XmlEl): string {
  const ref = all(branch, 'SampleRef')[0];
  const file = ref ? kid(ref, 'FileRef') : all(branch, 'FileRef')[0];
  if (!file) return '';
  const abs = val(kid(file, 'Path'));
  if (abs) return abs;
  const relEl = kid(file, 'RelativePath');
  if (relEl?.attrs.Value) return relEl.attrs.Value;
  // Live ≤10: <RelativePath><RelativePathElement Dir="…"/>…</RelativePath><Name Value="x.wav"/>
  const dirs = kids(relEl, 'RelativePathElement').map((e) => e.attrs.Dir).filter(Boolean);
  const fname = val(kid(file, 'Name'));
  return fname ? [...dirs, fname].join('/') : '';
}

export function parseAdg(xml: string, fallbackName: string): KitSpec {
  const root = parseXml(xml);
  const branches: XmlEl[] = [];
  if (root) walk(root, (e) => { if (e.name === 'DrumBranchPreset' || e.name === 'DrumBranch') branches.push(e); });
  const notes: string[] = [];
  const pads: KitPadSpec[] = [];
  const used = new Set<number>();
  for (const br of branches) {
    const zone = all(br, 'ZoneSettings')[0];
    const recv = num(val(kid(zone, 'ReceivingNote')), -1);
    const note = recv >= 0 ? 128 - recv : -1;                 // Live stores 128 − MIDI note
    const path = abletonSamplePath(br);
    const nameEl = kid(br, 'Name');
    const name = nameEl?.attrs.Value || val(kid(nameEl, 'EffectiveName')) || val(kid(nameEl, 'UserName'));
    let slot = note >= 36 ? note - 36 : -1;                    // Drum Rack's first pad is C1
    if (slot < 0 || used.has(slot)) { slot = 0; while (used.has(slot)) slot++; }
    used.add(slot);
    const transpose = num(val(kid(all(br, 'TransposeKey')[0], 'Manual')));
    const fine = num(val(kid(all(br, 'TransposeFine')[0], 'Manual')));
    const ds = path ? null : liveDrumSynth(br);
    pads.push({
      slot, name: padName(name, path) || (ds ? ENGINE_LABEL[ds.engine] : ''), sample: path ? { kind: 'path', path } : null,
      tuneSemis: clamp(transpose + fine / 100, -24, 24), choke: chokeOf(num(val(kid(zone, 'ChokeGroup')))),
      ...(ds ? { drumSynth: ds, color: CATEGORY_COLOR[classifySample(ENGINE_LABEL[ds.engine])] } : {}),
    });
  }
  const dsCount = pads.filter((p) => p.drumSynth).length;
  if (dsCount) notes.push(`${dsCount} Live DS drum${dsCount > 1 ? 's' : ''} (DS Kick, DS Snare…) → MEKA Drum Synth.`);
  if (pads.some((p) => !p.sample && !p.drumSynth)) notes.push('Pads holding instruments or effect racks (not samples) are left empty.');
  return { name: fallbackName, format: 'ableton', notes, pads: pads.sort((a, b) => a.slot - b.slot) };
}

/** A Live DS device (Max for Live "DS Kick.amxd"…) in a Drum Rack branch, with its named knobs. */
function liveDrumSynth(br: XmlEl): DrumSynthPatch | null {
  let device = '';
  const params: Record<string, number> = {};
  walk(br, (e) => {
    const v = e.attrs.Value;
    if (!device && v && /(^|[\\/])DS [A-Za-z0-9 ]+(\.amxd)?$/i.test(v)) device = v.split(/[\\/]/).pop()!;
    if (/Parameter$/.test(e.name)) {
      const pn = val(kid(e, 'Name'));
      const manual = all(e, 'Manual')[0];
      if (pn && manual) params[pn] = num(val(manual));
    }
  });
  return device ? fromLiveDs(device, params) : null;
}

// ── Studio One Impact / Impact XT .preset ────────────────────────────────────
// A zip: metainfo.xml (title) + data.fxpreset (XML). One <Layer> per pad: triggerKey1 is the
// MIDI note (C1 = 36 = pad 1), chokeGroup −1 = none; the sample sits as a URL attribute.

export async function parseImpact(bytes: Uint8Array, fallbackName: string): Promise<KitSpec> {
  let dataXml = '';
  let title = '';
  if (isZip(bytes)) {
    const blob = new Blob([bytes as BlobPart]);
    const entries = await zipEntries(blob);
    for (const e of entries) {
      if (/metainfo\.xml$/i.test(e.name)) {
        const meta = parseXml(utf8(await zipRead(blob, e)));
        title = all(meta, 'Attribute').find((a) => a.attrs.id === 'Document:Title')?.attrs.value || '';
      } else if (/\.fxpreset$/i.test(e.name) || /\.xml$/i.test(e.name)) {
        if (!dataXml || /\.fxpreset$/i.test(e.name)) dataXml = utf8(await zipRead(blob, e));
      }
    }
  } else {
    dataXml = utf8(bytes);
  }
  return parseImpactXml(dataXml, title || fallbackName);
}

export function parseImpactXml(xml: string, name: string): KitSpec {
  const root = parseXml(xml);
  const notes: string[] = [];
  const cls = root?.attrs.cid;
  if (cls && cls !== '{3713E26C-2FCA-4024-9F25-17E9D2BE2B9B}' && !/impact/i.test(xml.slice(0, 4000))) notes.push('This preset may not be an Impact kit.');
  const pads: KitPadSpec[] = [];
  const layers = all(root, 'Layer');
  const used = new Set<number>();
  layers.forEach((layer, idx) => {
    const attrs = kids(layer, 'Attributes').find((a) => a.attrs['x:id'] === 'attributes') ?? kid(layer, 'Attributes');
    // The sample: any attribute in the layer whose value is an audio file (url="file:///…").
    let path = '';
    let tune = 0;
    let gainDb: number | undefined;
    const scan = (e: XmlEl) => {
      for (const [k, v] of Object.entries(e.attrs)) {
        if (!path && AUDIO_EXT.test(v)) path = decodeURIComponent(v.replace(/^file:\/\/\/?/i, ''));
        if (k === 'transpose') tune += num(v);
        if (k === 'tune') tune += num(v) / 100;
        if ((k === 'gain' || k === 'volume') && gainDb === undefined) { const g = num(v, NaN); if (Number.isFinite(g)) gainDb = g <= 0 && g >= -96 ? g : toDb(g); }
      }
    };
    scan(layer); walk(layer, scan);
    const key = num(attrs?.attrs.triggerKey1, -1);
    let slot = key >= 36 ? key - 36 : idx;
    while (used.has(slot)) slot++;
    used.add(slot);
    if (!path) return; // an empty Impact pad
    pads.push({
      slot, name: padName(layer.attrs.name || '', path), sample: { kind: 'path', path },
      tuneSemis: clamp(tune, -24, 24), gainDb, choke: chokeOf(num(attrs?.attrs.chokeGroup, -1) + 1),
    });
  });
  if (!pads.length) notes.push('This Impact preset has no samples on its pads.');
  return { name, format: 'impact', notes, pads: pads.sort((a, b) => a.slot - b.slot) };
}

// ── SFZ ──────────────────────────────────────────────────────────────────────

const NOTE_IDX: Record<string, number> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
/** "36", "c1", "C#1", "db2" → MIDI (SFZ: c4 = 60). */
export function sfzNote(v: string | undefined): number {
  if (v === undefined) return -1;
  const t = v.trim().toLowerCase();
  if (/^-?\d+$/.test(t)) return parseInt(t, 10);
  const m = /^([a-g])([#b]?)(-?\d+)$/.exec(t);
  if (!m) return -1;
  return NOTE_IDX[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + (parseInt(m[3], 10) + 1) * 12;
}

export function parseSfz(text: string, name: string): KitSpec {
  const defines: Record<string, string> = {};
  const src = text.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/#define\s+(\$\w+)\s+(\S+)/g, (_m, k: string, v: string) => { defines[k] = v; return ''; })
    .replace(/\$\w+/g, (k) => defines[k] ?? k);
  type Ops = Record<string, string>;
  const regions: Ops[] = [];
  let control: Ops = {}, global: Ops = {}, master: Ops = {}, group: Ops = {};
  let cur: Ops | null = null;
  let curHeader = '';
  const close = () => { if (cur && curHeader === 'region') regions.push({ ...global, ...master, ...group, ...cur }); };
  const re = /<(\w+)>|([A-Za-z0-9_]+)=/g;
  let m: RegExpExecArray | null;
  const tokens: { kind: 'h' | 'k'; v: string; at: number; end: number }[] = [];
  while ((m = re.exec(src))) tokens.push(m[1] ? { kind: 'h', v: m[1], at: m.index, end: re.lastIndex } : { kind: 'k', v: m[2], at: m.index, end: re.lastIndex });
  tokens.forEach((tk, ti) => {
    if (tk.kind === 'h') {
      close();
      curHeader = tk.v;
      cur = {};
      if (tk.v === 'control') control = cur;
      else if (tk.v === 'global') { global = cur; master = {}; group = {}; }
      else if (tk.v === 'master') { master = cur; group = {}; }
      else if (tk.v === 'group') group = cur;
      return;
    }
    // A value runs to the next token; `sample=` may hold spaces, every other opcode is one word.
    const next = tokens[ti + 1]?.at ?? src.length;
    let value = src.slice(tk.end, next);
    value = tk.v === 'sample' ? value.replace(/\s+$/, '') : value.trim().split(/\s+/)[0] ?? '';
    if (cur) cur[tk.v] = value.trim();
  });
  close();

  const defaultPath = (control.default_path || '').replace(/\\/g, '/');
  const byNote = new Map<number, Ops>();
  const unkeyed: Ops[] = [];
  for (const r of regions) {
    if (!r.sample) continue;
    const note = sfzNote(r.key) >= 0 ? sfzNote(r.key) : sfzNote(r.lokey) >= 0 ? sfzNote(r.lokey) : sfzNote(r.pitch_keycenter);
    if (note < 0) { unkeyed.push(r); continue; }
    if (!byNote.has(note)) byNote.set(note, r); // first region per key (velocity layers / round robins → first)
  }
  const keys = [...byNote.keys()].sort((a, b) => a - b);
  const base = keys.length && keys[0] >= 36 && keys[keys.length - 1] - 36 < 64 ? 36 : keys[0] ?? 0;
  const offGroups = new Set(regions.map((r) => r.off_by).filter(Boolean));
  const chokeIds = new Map<string, number>();
  const chokeFor = (r: Ops) => {
    const g = r.off_by || (r.group && offGroups.has(r.group) ? r.group : '');
    if (!g) return 0;
    if (!chokeIds.has(g)) chokeIds.set(g, Math.min(8, chokeIds.size + 1));
    return chokeIds.get(g)!;
  };
  const toPad = (r: Ops, slot: number): KitPadSpec => {
    const path = (defaultPath + r.sample.replace(/\\/g, '/')).replace(/^\.\//, '');
    return {
      slot, name: padName('', path), sample: { kind: 'path', path },
      tuneSemis: clamp(num(r.transpose) + num(r.tune) / 100, -24, 24), gainDb: num(r.volume),
      pan: clamp(num(r.pan) / 100, -1, 1), choke: chokeFor(r),
    };
  };
  const pads: KitPadSpec[] = keys.filter((k) => k >= base && k - base < 128).map((k) => toPad(byNote.get(k)!, k - base));
  let next = pads.length ? Math.max(...pads.map((p) => p.slot)) + 1 : 0;
  for (const r of unkeyed) pads.push(toPad(r, next++));
  const notes: string[] = [];
  const wide = regions.some((r) => sfzNote(r.hikey) - sfzNote(r.lokey) > 3);
  if (wide) notes.push('Melodic regions (key spans) are placed by their low key; one sample per pad.');
  if (regions.length > byNote.size + unkeyed.length) notes.push('Velocity layers / round robins: the first region per key is used.');
  return { name, format: 'sfz', notes, pads };
}

// ── Hydrogen ─────────────────────────────────────────────────────────────────

async function parseHydrogenFile(bytes: Uint8Array, name: string): Promise<KitSpec> {
  if (isGzip(bytes)) {
    // .h2drumkit = tar.gz holding <kit>/drumkit.xml + the samples. Samples come back as bytes.
    const tar = tarEntries(await inflate(bytes, 'gzip'));
    const xmlEntry = tar.find((e) => /(^|\/)drumkit\.xml$/i.test(e.name));
    if (!xmlEntry) return { name, format: 'hydrogen', notes: ['No drumkit.xml inside this .h2drumkit.'], pads: [] };
    const dir = xmlEntry.name.replace(/[^/]*$/, '');
    const spec = parseHydrogenXml(utf8(xmlEntry.data), name);
    for (const p of spec.pads) {
      if (p.sample?.kind !== 'path') continue;
      const rel = p.sample.path.replace(/\\/g, '/');
      const want = (dir + rel).toLowerCase();
      const hit = tar.find((e) => e.name.toLowerCase() === want)
        ?? tar.find((e) => AUDIO_EXT.test(e.name) && baseName(e.name).toLowerCase() === baseName(rel).toLowerCase());
      if (hit) p.sample = { kind: 'bytes', bytes: hit.data, ext: hit.name.split('.').pop()!.toLowerCase() };
    }
    return spec;
  }
  return parseHydrogenXml(utf8(bytes), name);
}

export function parseHydrogenXml(xml: string, fallbackName: string): KitSpec {
  const root = parseXml(xml);
  const name = childText(root, 'name') || fallbackName;
  const insts = all(root, 'instrument');
  const pads: KitPadSpec[] = [];
  const chokeIds = new Map<number, number>();
  insts.forEach((inst, i) => {
    const file = childText(inst, 'filename') || all(inst, 'filename')[0]?.text.trim() || '';
    const l = num(childText(inst, 'pan_L'), 1), r = num(childText(inst, 'pan_R'), 1);
    const mg = num(childText(inst, 'muteGroup'), -1);
    if (mg >= 0 && !chokeIds.has(mg)) chokeIds.set(mg, Math.min(8, chokeIds.size + 1));
    pads.push({
      slot: i, name: padName(childText(inst, 'name'), file), sample: file ? { kind: 'path', path: file } : null,
      gainDb: +toDb(num(childText(inst, 'volume'), 1)).toFixed(2), pan: clamp(r - l, -1, 1),
      choke: mg >= 0 ? chokeIds.get(mg)! : 0,
    });
  });
  return { name, format: 'hydrogen', notes: [], pads };
}

// ── Decent Sampler .dspreset ─────────────────────────────────────────────────

const dsVolume = (v: string | undefined) => {
  if (!v) return 0;
  return /db$/i.test(v.trim()) ? num(v.replace(/db$/i, '')) : toDb(num(v, 1));
};

export function parseDspreset(xml: string, name: string): KitSpec {
  const root = parseXml(xml);
  const byNote = new Map<number, KitPadSpec>();
  const loose: KitPadSpec[] = [];
  let layered = false;
  for (const g of all(root, 'group')) {
    for (const s of kids(g, 'sample')) {
      const a = { ...g.attrs, ...s.attrs };
      if (!a.path) continue;
      const note = num(a.loNote ?? a.rootNote, -1);
      const pad: KitPadSpec = {
        slot: 0, name: padName(g.attrs.name || '', a.path), sample: { kind: 'path', path: a.path },
        tuneSemis: clamp(num(a.tuning), -24, 24), gainDb: dsVolume(a.volume), pan: clamp(num(a.pan) / 100, -1, 1),
      };
      if (note < 0) loose.push(pad);
      else if (byNote.has(note)) layered = true;
      else byNote.set(note, pad);
    }
  }
  const keys = [...byNote.keys()].sort((x, y) => x - y);
  const base = keys.length && keys[0] >= 36 && keys[keys.length - 1] - 36 < 64 ? 36 : keys[0] ?? 0;
  const pads = keys.map((k) => ({ ...byNote.get(k)!, slot: k - base }));
  let next = pads.length ? pads[pads.length - 1].slot + 1 : 0;
  for (const p of loose) pads.push({ ...p, slot: next++ });
  return { name, format: 'decent', notes: layered ? ['Velocity layers: the first sample per key is used.'] : [], pads };
}

// ── SoundFont .sf2 ───────────────────────────────────────────────────────────
// RIFF 'sfbk': sdta/smpl holds 16-bit PCM, pdta the preset → instrument → zone → sample tree.
// We take the percussion preset (bank 128) when there is one, else the first preset, and cut
// each key's sample out as a WAV.

interface Sf2Zone { gens: Map<number, number> }

export function pcm16ToWav(pcm: Uint8Array, rate: number, channels = 1): Uint8Array {
  const out = new Uint8Array(44 + pcm.length);
  const w = new DataView(out.buffer);
  const tag = (o: number, s: string) => { for (let i = 0; i < 4; i++) out[o + i] = s.charCodeAt(i); };
  tag(0, 'RIFF'); w.setUint32(4, 36 + pcm.length, true); tag(8, 'WAVE');
  tag(12, 'fmt '); w.setUint32(16, 16, true); w.setUint16(20, 1, true); w.setUint16(22, channels, true);
  w.setUint32(24, rate, true); w.setUint32(28, rate * channels * 2, true); w.setUint16(32, channels * 2, true); w.setUint16(34, 16, true);
  tag(36, 'data'); w.setUint32(40, pcm.length, true);
  out.set(pcm, 44);
  return out;
}

export function parseSf2(bytes: Uint8Array, fallbackName: string): KitSpec {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const cc = (o: number) => utf8(bytes.subarray(o, o + 4));
  const fail = (msg: string): KitSpec => ({ name: fallbackName, format: 'soundfont', notes: [msg], pads: [] });
  if (bytes.length < 12 || cc(0) !== 'RIFF' || cc(8) !== 'sfbk') return fail('Not a SoundFont 2 file.');
  const chunks: Record<string, Uint8Array> = {};
  const walkList = (start: number, end: number) => {
    let o = start;
    while (o + 8 <= end) {
      const id = cc(o); const size = v.getUint32(o + 4, true);
      if (id === 'LIST') walkList(o + 12, Math.min(end, o + 8 + size));
      else chunks[id] = bytes.subarray(o + 8, Math.min(end, o + 8 + size));
      o += 8 + size + (size % 2);
    }
  };
  walkList(12, bytes.length);
  const { smpl, phdr, pbag, pgen, inst, ibag, igen, shdr } = chunks;
  if (!smpl || !phdr || !pbag || !pgen || !inst || !ibag || !igen || !shdr) return fail('This SoundFont is missing its sample tables.');
  const dv = (c: Uint8Array) => new DataView(c.buffer, c.byteOffset, c.byteLength);
  const str20 = (c: Uint8Array, o: number) => utf8(c.subarray(o, o + 20)).replace(/\0.*$/s, '').trim();
  const name = chunks.INAM ? utf8(chunks.INAM).replace(/\0.*$/s, '').trim() || fallbackName : fallbackName;

  const zones = (bag: Uint8Array, gen: Uint8Array, from: number, to: number): Sf2Zone[] => {
    const b = dv(bag), g = dv(gen);
    const out: Sf2Zone[] = [];
    for (let z = from; z < to; z++) {
      const g0 = b.getUint16(z * 4, true), g1 = b.getUint16(z * 4 + 4, true);
      const gens = new Map<number, number>();
      for (let k = g0; k < g1; k++) {
        const op = g.getUint16(k * 4, true);
        // keyRange (43) / velRange (44) are two bytes; everything else a signed/unsigned word.
        gens.set(op, op === 43 || op === 44 ? g.getUint16(k * 4 + 2, true) : g.getInt16(k * 4 + 2, true));
      }
      out.push({ gens });
    }
    return out;
  };
  const range = (z: Sf2Zone) => { const r = z.gens.get(43); return r === undefined ? [0, 127] : [r & 0xff, (r >> 8) & 0xff]; };

  const pd = dv(phdr);
  const presets: { name: string; bank: number; bag: number }[] = [];
  for (let o = 0; o + 38 <= phdr.length; o += 38) presets.push({ name: str20(phdr, o), bank: pd.getUint16(o + 22, true), bag: pd.getUint16(o + 24, true) });
  presets.pop(); // EOP terminator
  if (!presets.length) return fail('No presets in this SoundFont.');
  const pick = presets.findIndex((p) => p.bank === 128);
  const pi = pick >= 0 ? pick : 0;
  const pz = zones(pbag, pgen, presets[pi].bag, (presets[pi + 1] ?? { bag: pbag.length / 4 - 1 }).bag);

  const idv = dv(inst);
  const instBag = (i: number) => idv.getUint16(i * 22 + 20, true);
  const sd = dv(shdr);
  const keyMap = new Map<number, { zone: Sf2Zone; global?: Sf2Zone; sample: number }>();
  for (const z of pz) {
    const ii = z.gens.get(41);
    if (ii === undefined) continue;
    const [plo, phi] = range(z);
    const iz = zones(ibag, igen, instBag(ii), instBag(ii + 1));
    const global = iz[0] && !iz[0].gens.has(53) ? iz[0] : undefined;
    for (const zone of iz) {
      const sid = zone.gens.get(53);
      if (sid === undefined) continue;
      const [lo, hi] = range(zone);
      for (let k = Math.max(lo, plo); k <= Math.min(hi, phi); k++) if (!keyMap.has(k)) keyMap.set(k, { zone, global, sample: sid });
    }
  }
  const keys = [...keyMap.keys()].sort((a, b) => a - b);
  const melodic = new Set([...keyMap.values()].map((x) => x.sample)).size < keys.length / 2;
  const base = melodic ? 36 : (keyMap.has(36) ? 36 : keys[0] ?? 36);
  const notes: string[] = [`Preset: ${presets[pi].name}${pick >= 0 ? ' (percussion bank)' : ''}.`];
  if (melodic) notes.push('Melodic preset: pads play it chromatically from C1.');
  const pads: KitPadSpec[] = [];
  const chokeIds = new Map<number, number>();
  for (const k of keys) {
    const slot = k - base;
    if (slot < 0 || slot >= (melodic ? 16 : 64)) continue;
    const { zone, global, sample } = keyMap.get(k)!;
    const gen = (op: number, d = 0) => zone.gens.get(op) ?? global?.gens.get(op) ?? d;
    const so = sample * 46;
    if (so + 46 > shdr.length) continue;
    const sname = str20(shdr, so);
    const start = sd.getUint32(so + 20, true) + gen(0) + gen(4) * 32768;
    const end = sd.getUint32(so + 24, true) + gen(1) + gen(12) * 32768;
    const rate = sd.getUint32(so + 36, true) || 44100;
    const origPitch = sd.getUint8(so + 40);
    const root = gen(58, -1) >= 0 ? gen(58) : origPitch;
    if (end <= start || end * 2 > smpl.length) continue;
    const excl = gen(57);
    if (excl > 0 && !chokeIds.has(excl)) chokeIds.set(excl, Math.min(8, chokeIds.size + 1));
    pads.push({
      slot, name: padName(sname, sname),
      sample: { kind: 'bytes', bytes: pcm16ToWav(smpl.subarray(start * 2, end * 2), rate), ext: 'wav' },
      tuneSemis: clamp((melodic ? k - root : 0) + gen(51) + gen(52) / 100, -24, 24),
      gainDb: +(-gen(48) / 10).toFixed(1), pan: clamp(gen(17) / 500, -1, 1), choke: excl > 0 ? chokeIds.get(excl)! : 0,
    });
  }
  return { name, format: 'soundfont', notes, pads };
}
