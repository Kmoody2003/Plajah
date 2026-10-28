// MEKA kit import: every format parser, path resolution, and loading a kit onto a Group.
// Pure — tsx --test. Fixtures are built in-test to each format's layout; the real Studio One /
// Bitwig default kits are read too when this machine has them installed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { gzipSync, deflateRawSync, deflateSync, crc32 } from 'node:zlib';
import {
  kitFormatFor, parseAdg, parseBitwig, parseDspreset, parseImpact, parseImpactXml, parseKitBytes, parseNiBinary,
  parseSf2, parseSfz, parseXpm, parseFolderKit, sfzNote,
} from '../services/melos/beats/kits/parsers';
import { aiffToWav, scanAudioStrings, tarEntries, zipEntries, zipRead } from '../services/melos/beats/kits/bytes';
import { classifySample, layoutFolderKit, looksLikeKit } from '../services/melos/beats/kits/drumClassify';
import { buildLookup, pathSegments, resolveSamplePath } from '../services/melos/beats/kits/kitLibrary';
import { applyKitToGroup, applyUserKit, snapshotGroup } from '../services/melos/beats/kits/applyKit';
import { newGrooveDoc, type SampleRef } from '../services/melos/beats/grooveDoc';
import type { KitLibraryIndex, LibraryKit } from '../services/melos/beats/kits/types';
import { chordLabel, chordSemis, keySemi, scaleSteps, tonicOffset } from '../services/melos/beats/padModes';
import { recordPadHit } from '../services/melos/beats/padRecord';

const enc = (s: string) => new TextEncoder().encode(s);
const u16le = (s: string) => { const b = new Uint8Array(s.length * 2); for (let i = 0; i < s.length; i++) { b[i * 2] = s.charCodeAt(i) & 0xff; b[i * 2 + 1] = s.charCodeAt(i) >> 8; } return b; };
const cat = (...parts: Uint8Array[]) => { const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; } return out; };
const junk = (n: number, seed = 7) => { const b = new Uint8Array(n); let x = seed; for (let i = 0; i < n; i++) { x = (x * 1103515245 + 12345) & 0x7fffffff; b[i] = x & 0x1f; } return b; };

/** A minimal zip (deflate) writer for fixtures. */
function makeZip(files: Record<string, Uint8Array>): Uint8Array {
  const locals: Uint8Array[] = []; const centrals: Uint8Array[] = []; let off = 0;
  for (const [name, data] of Object.entries(files)) {
    const nb = enc(name); const comp = deflateRawSync(data); const crc = crc32(data);
    const lh = new Uint8Array(30 + nb.length); const lv = new DataView(lh.buffer);
    lv.setUint32(0, 0x04034b50, true); lv.setUint16(4, 20, true); lv.setUint16(8, 8, true); lv.setUint32(14, crc, true);
    lv.setUint32(18, comp.length, true); lv.setUint32(22, data.length, true); lv.setUint16(26, nb.length, true); lh.set(nb, 30);
    const ch = new Uint8Array(46 + nb.length); const cv = new DataView(ch.buffer);
    cv.setUint32(0, 0x02014b50, true); cv.setUint16(6, 20, true); cv.setUint16(10, 8, true); cv.setUint32(16, crc, true);
    cv.setUint32(20, comp.length, true); cv.setUint32(24, data.length, true); cv.setUint16(28, nb.length, true); cv.setUint32(42, off, true); ch.set(nb, 46);
    locals.push(lh, comp); centrals.push(ch); off += lh.length + comp.length;
  }
  const cd = cat(...centrals);
  const end = new Uint8Array(22); const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, centrals.length, true); ev.setUint16(10, centrals.length, true);
  ev.setUint32(12, cd.length, true); ev.setUint32(16, off, true);
  return cat(...locals, cd, end);
}

function makeTar(files: Record<string, Uint8Array>): Uint8Array {
  const parts: Uint8Array[] = [];
  for (const [name, data] of Object.entries(files)) {
    const h = new Uint8Array(512); h.set(enc(name), 0);
    h.set(enc(data.length.toString(8).padStart(11, '0') + '\0'), 124); h[156] = 0x30;
    parts.push(h, data, new Uint8Array((512 - (data.length % 512)) % 512));
  }
  parts.push(new Uint8Array(1024));
  return cat(...parts);
}

// ── Format detection ─────────────────────────────────────────────────────────

test('format detection, incl. X11 pixmaps that share .xpm', () => {
  assert.equal(kitFormatFor('Certified Gold Kit.mxgrp'), 'maschine-group');
  assert.equal(kitFormatFor('Kick.mxsnd'), 'maschine-sound');
  assert.equal(kitFormatFor('Kit.nbkt'), 'battery');
  assert.equal(kitFormatFor('Boom.xpm', enc('<?xml version="1.0"?><MPCVObject>')), 'mpc');
  assert.equal(kitFormatFor('folder.xpm', enc('/* XPM */\nstatic char * folder_xpm[] = {')), null);
  assert.equal(kitFormatFor('808 Rack.adg'), 'ableton');
  assert.equal(kitFormatFor('Trap Kit.preset'), 'impact');
  assert.equal(kitFormatFor('Kit.bwpreset'), 'bitwig');
  assert.equal(kitFormatFor('drumkit.xml'), 'hydrogen');
  assert.equal(kitFormatFor('GM.sf2'), 'soundfont');
  assert.equal(kitFormatFor('notes.txt'), null);
});

// ── MPC ──────────────────────────────────────────────────────────────────────

const XPM = `<?xml version="1.0" encoding="UTF-8"?>
<MPCVObject><Version><File_Version>1.7</File_Version></Version>
<Program type="Drum"><ProgramName>Boom Bap Kit</ProgramName>
<Instruments>
 <Instrument number="37"><Volume>1.0</Volume><Pan>0.5</Pan><TuneCoarse>-2</TuneCoarse><MuteGroup>0</MuteGroup>
  <Layers><Layer number="1"><SampleName>BB Kick</SampleName><SampleFile></SampleFile><Volume>1.0</Volume></Layer>
          <Layer number="2"><SampleName></SampleName></Layer></Layers></Instrument>
 <Instrument number="38"><Volume>0.5</Volume><Pan>0.75</Pan><MuteGroup>0</MuteGroup>
  <Layers><Layer number="1"><SampleName>BB Snare</SampleName><Volume>1.0</Volume></Layer></Layers></Instrument>
 <Instrument number="42"><Volume>1.0</Volume><MuteGroup>2</MuteGroup>
  <Layers><Layer number="1"><SampleName>BB Hat Closed</SampleName></Layer><Layer number="2"><SampleName>BB Hat Closed soft</SampleName></Layer></Layers></Instrument>
</Instruments>
<PadNoteMap><PadNote number="1"><Note>37</Note></PadNote><PadNote number="5"><Note>38</Note></PadNote><PadNote number="17"><Note>42</Note></PadNote></PadNoteMap>
</Program></MPCVObject>`;

test('MPC .xpm: pad note map, tune, pan, relative volume, mute groups, banks', () => {
  const k = parseXpm(XPM, 'file');
  assert.equal(k.name, 'Boom Bap Kit');
  assert.deepEqual(k.pads.map((p) => p.slot), [0, 4, 16]);
  const [kick, snare, hat] = k.pads;
  assert.deepEqual(kick.sample, { kind: 'path', path: 'BB Kick.wav' });
  assert.equal(kick.tuneSemis, -2);
  assert.equal(kick.gainDb, 0);
  assert.ok(Math.abs(snare.gainDb! - -6.02) < 0.05, `snare ${snare.gainDb}`);
  assert.ok(Math.abs(snare.pan! - 0.5) < 1e-9);
  assert.equal(hat.choke, 2);
  assert.ok(k.notes.some((n) => /Velocity layers/.test(n)));
});

// ── Ableton ──────────────────────────────────────────────────────────────────

const ADG = `<?xml version="1.0" encoding="UTF-8"?>
<Ableton MajorVersion="5"><GroupDevicePreset><Device><DrumGroupDevice><BranchPresets>
 <DrumBranchPreset Id="0"><Name Value="Kick"/>
  <DevicePresets><AbletonDevicePreset><Device><OriginalSimpler><Player><MultiSampleMap><SampleParts><MultiSamplePart>
   <SampleRef><FileRef><RelativePathType Value="3"/><RelativePath Value="Samples/Imported/Kick 01.wav"/><Path Value="C:/Users/someone/Music/Kits/Samples/Imported/Kick 01.wav"/></FileRef></SampleRef>
  </MultiSamplePart></SampleParts></MultiSampleMap></Player>
  <TransposeKey><Manual Value="3"/></TransposeKey><TransposeFine><Manual Value="50"/></TransposeFine></OriginalSimpler></Device></AbletonDevicePreset></DevicePresets>
  <ZoneSettings><ReceivingNote Value="92"/><SendingNote Value="60"/><ChokeGroup Value="0"/></ZoneSettings></DrumBranchPreset>
 <DrumBranchPreset Id="1"><Name Value=""/>
  <DevicePresets><AbletonDevicePreset><Device><OriginalSimpler>
   <SampleRef><FileRef><RelativePath><RelativePathElement Dir="Samples"/><RelativePathElement Dir="Hats"/></RelativePath><Name Value="Hat Open.aif"/></FileRef></SampleRef>
  </OriginalSimpler></Device></AbletonDevicePreset></DevicePresets>
  <ZoneSettings><ReceivingNote Value="82"/><ChokeGroup Value="1"/></ZoneSettings></DrumBranchPreset>
</BranchPresets></DrumGroupDevice></Device></GroupDevicePreset></Ableton>`;

test('Ableton .adg (gzip): receiving note → pad, absolute + legacy relative paths, choke', async () => {
  const k = await parseKitBytes('ableton', gzipSync(Buffer.from(ADG)), '808 Rack.adg');
  assert.equal(k.name, '808 Rack');
  assert.equal(k.pads.length, 2);
  assert.equal(k.pads[0].slot, 0);                                         // 128−92 = 36 = C1 = pad 1
  assert.equal((k.pads[0].sample as { path: string }).path, 'C:/Users/someone/Music/Kits/Samples/Imported/Kick 01.wav');
  assert.equal(k.pads[0].tuneSemis, 3.5);
  assert.equal(k.pads[1].slot, 10);                                        // 128−82 = 46
  assert.equal((k.pads[1].sample as { path: string }).path, 'Samples/Hats/Hat Open.aif');
  assert.equal(k.pads[1].name, 'Hat Open');
  assert.equal(k.pads[1].choke, 1);
  assert.equal(parseAdg(ADG, 'x').pads.length, 2);
});

// ── Studio One Impact ────────────────────────────────────────────────────────

const IMPACT = `<?xml version="1.0" encoding="UTF-8"?>
<AudioEffectPreset cid="{3713E26C-2FCA-4024-9F25-17E9D2BE2B9B}" version="2"><Attributes x:id="ComponentData">
<Attributes x:id="programData" name="Trap Kit"><List x:id="layers">
 <Layer name="Kick" variation="2" enabled="1"><Attributes x:id="attributes" triggerKey1="36" chokeGroup="-1"/>
  <List x:id="zones"><Zone><Attributes x:id="sample" url="file:///C:/Users/Public/Documents/Kits/Kick%20Hard.wav"/></Zone></List>
  <Attributes x:id="wave" transpose="-1" tune="25"/></Layer>
 <Layer name="" variation="2" enabled="1"><Attributes x:id="attributes" triggerKey1="37" chokeGroup="-1"/></Layer>
 <Layer name="CH" variation="2" enabled="1"><Attributes x:id="attributes" triggerKey1="44" chokeGroup="0"/>
  <List x:id="zones"><Zone><Attributes x:id="sample" url="Hats/CH 1.wav"/></Zone></List></Layer>
</List></Attributes></Attributes></AudioEffectPreset>`;

test('Studio One Impact .preset (zip): trigger keys, sample URLs, tune, choke', async () => {
  const meta = `<?xml version="1.0"?><MetaInformation><Attribute id="Document:Title" value="Trap Kit"/></MetaInformation>`;
  const zip = makeZip({ 'metainfo.xml': enc(meta), 'data.fxpreset': enc(IMPACT) });
  const k = await parseImpact(zip, 'file');
  assert.equal(k.name, 'Trap Kit');
  assert.deepEqual(k.pads.map((p) => [p.slot, p.name]), [[0, 'Kick'], [8, 'CH']]);
  assert.equal((k.pads[0].sample as { path: string }).path, 'C:/Users/Public/Documents/Kits/Kick Hard.wav');
  assert.equal(k.pads[0].tuneSemis, -0.75);
  assert.equal(k.pads[0].choke, 0);
  assert.equal(k.pads[1].choke, 1);
  assert.equal(parseImpactXml(IMPACT, 'x').pads.length, 2);
});

const S1_DEFAULT = 'C:/Program Files/PreSonus/Studio One 6/Presets/PreSonus/Impact/default.preset';
test('Studio One Impact: the real installed default kit parses (empty pads)', { skip: !existsSync(S1_DEFAULT) }, async () => {
  const k = await parseImpact(new Uint8Array(readFileSync(S1_DEFAULT)), 'default');
  assert.equal(k.format, 'impact');
  assert.equal(k.pads.length, 0);
  assert.ok(k.notes.some((n) => /no samples/i.test(n)));
});

// ── Bitwig ───────────────────────────────────────────────────────────────────

const bwStr = (s: string) => { const b = enc(s); const h = new Uint8Array(5); h[0] = 0x08; new DataView(h.buffer).setUint32(1, b.length); return cat(h, b); };

test('Bitwig .bwpreset: typed length-prefixed strings in pad order', () => {
  const file = cat(enc('BtWg000300020'), junk(40), bwStr('device_name'), bwStr('Drum Machine'), junk(30, 3),
    bwStr('C:\\Users\\me\\Samples\\808 Kick.wav'), junk(25, 9), bwStr('Samples/Snare Crack.flac'), junk(10), bwStr('C:\\Users\\me\\Samples\\808 Kick.wav'));
  const k = parseBitwig(file, 'Kit');
  assert.deepEqual(k.pads.map((p) => [p.slot, p.name]), [[0, '808 Kick'], [1, 'Snare Crack']]);
});

const BW_DIR = 'C:/Program Files/Bitwig Studio';
const bwDrumDefault = (() => {
  if (!existsSync(BW_DIR)) return null;
  for (const v of readdirSync(BW_DIR)) {
    const f = `${BW_DIR}/${v}/Library/device-settings/8ea97e45-0255-40fd-bc7e-94419741e9d1/Default.bwpreset`;
    if (existsSync(f)) return f;
  }
  return null;
})();
test('Bitwig: the real installed Drum Machine default parses', { skip: !bwDrumDefault }, () => {
  const k = parseBitwig(new Uint8Array(readFileSync(bwDrumDefault!)), 'Default');
  assert.equal(k.format, 'bitwig');
  assert.ok(!k.notes.some((n) => /Not a Bitwig/.test(n)));
});

// ── NI binaries ──────────────────────────────────────────────────────────────

test('Maschine .mxgrp: UTF-16LE sample paths in file order, deduped', async () => {
  const file = cat(junk(64), u16le('Kick Certified 1'), new Uint8Array(4),
    u16le('C:\\Users\\Public\\Documents\\Native Instruments\\Certified Gold\\Samples\\Drums\\Kick\\Kick Certified 1.wav'), junk(33),
    u16le('Samples/Drums/Snare/Snare Gold 3.wav'), new Uint8Array(2), junk(17, 4),
    u16le('C:\\Users\\Public\\Documents\\Native Instruments\\Certified Gold\\Samples\\Drums\\Kick\\Kick Certified 1.wav'));
  const k = await parseNiBinary('maschine-group', file, 'Certified Gold Kit');
  assert.deepEqual(k.pads.map((p) => p.name), ['Kick Certified 1', 'Snare Gold 3']);
  assert.equal(k.pads[1].slot, 1);
});

test('NI binary: zlib-packed section is inflated and scanned', async () => {
  const inner = cat(junk(20), u16le('Samples/Drums/Clap/Clap Bright.wav'), junk(9));
  const file = cat(enc('hsin'), junk(50), deflateSync(inner), junk(12));
  const k = await parseNiBinary('battery', file, 'Kit');
  assert.deepEqual(k.pads.map((p) => p.name), ['Clap Bright']);
});

test('scanAudioStrings ignores non-audio strings', () => {
  assert.deepEqual(scanAudioStrings(cat(u16le('Massive.nksf'), new Uint8Array(2), u16le('Readme.txt'))), []);
});

// ── SFZ / Hydrogen / Decent ──────────────────────────────────────────────────

test('SFZ: default_path, note names, defines, off_by chokes, sample paths with spaces', () => {
  const k = parseSfz(`// kit
#define $HAT 42
<control> default_path=Samples\\
<group> group=1 off_by=2
<region> sample=Kick Deep.wav key=c2 volume=-3
<group> group=2
<region> sample=Hat Open.wav key=46 pan=50
<region> sample=Hat Closed.wav key=$HAT
<region> sample=Kick Deep soft.wav key=36 lovel=1 hivel=60
`, 'Kit');
  assert.equal(sfzNote('c4'), 60); assert.equal(sfzNote('c2'), 36); assert.equal(sfzNote('C#2'), 37); assert.equal(sfzNote('db2'), 37); assert.equal(sfzNote('60'), 60);
  assert.deepEqual(k.pads.map((p) => [p.slot, p.name]), [[0, 'Kick Deep'], [6, 'Hat Closed'], [10, 'Hat Open']]);
  assert.equal((k.pads[0].sample as { path: string }).path, 'Samples/Kick Deep.wav');
  assert.equal(k.pads[0].gainDb, -3);
  assert.equal(k.pads[2].pan, 0.5);
  assert.ok(k.pads[0].choke! > 0 && k.pads[0].choke === k.pads[1].choke);
  assert.ok(k.notes.some((n) => /first region/.test(n)));
});

const H2 = `<?xml version="1.0"?><drumkit_info><name>GMRockKit</name><instrumentList>
 <instrument><id>0</id><name>Kick</name><volume>1</volume><pan_L>1</pan_L><pan_R>1</pan_R><muteGroup>-1</muteGroup><layer><filename>Kick-Softest.wav</filename></layer></instrument>
 <instrument><id>1</id><name>Hat Closed</name><volume>0.5</volume><pan_L>0.5</pan_L><pan_R>1</pan_R><muteGroup>1</muteGroup><instrumentComponent><layer><filename>HatClosed.flac</filename></layer></instrumentComponent></instrument>
</instrumentList></drumkit_info>`;

test('Hydrogen: drumkit.xml + .h2drumkit tar.gz with embedded samples', async () => {
  const plain = await parseKitBytes('hydrogen', enc(H2), 'drumkit.xml');
  assert.equal(plain.name, 'GMRockKit');
  assert.deepEqual(plain.pads.map((p) => p.name), ['Kick', 'Hat Closed']);
  assert.ok(Math.abs(plain.pads[1].gainDb! - -6.02) < 0.05);
  assert.equal(plain.pads[1].pan, 0.5);
  assert.equal(plain.pads[1].choke, 1);
  const tgz = gzipSync(Buffer.from(makeTar({ 'GMRockKit/drumkit.xml': enc(H2), 'GMRockKit/Kick-Softest.wav': enc('RIFFkick'), 'GMRockKit/HatClosed.flac': enc('fLaC') })));
  const packed = await parseKitBytes('hydrogen', tgz, 'GMRockKit.h2drumkit');
  assert.equal(packed.pads[0].sample?.kind, 'bytes');
  assert.equal(packed.pads[1].sample?.kind === 'bytes' && packed.pads[1].sample.ext, 'flac');
  assert.equal(tarEntries(makeTar({ a: enc('x') }))[0].name, 'a');
});

test('Decent Sampler: groups inherit, dB volume, notes → pads', () => {
  const k = parseDspreset(`<DecentSampler><groups>
    <group name="Kick" volume="-2dB"><sample path="Samples/kick.wav" rootNote="36" loNote="36" hiNote="36"/></group>
    <group name="Snare"><sample path="Samples/snare.wav" rootNote="38" loNote="38" hiNote="38" tuning="1"/><sample path="Samples/snare2.wav" loNote="38"/></group>
  </groups></DecentSampler>`, 'Kit');
  assert.deepEqual(k.pads.map((p) => [p.slot, p.name, p.gainDb]), [[0, 'Kick', -2], [2, 'Snare', 0]]);
  assert.equal(k.pads[1].tuneSemis, 1);
});

// ── SoundFont ────────────────────────────────────────────────────────────────

function makeSf2(): Uint8Array {
  const chunk = (id: string, data: Uint8Array) => { const h = new Uint8Array(8); h.set(enc(id)); new DataView(h.buffer).setUint32(4, data.length, true); return cat(h, data, new Uint8Array(data.length % 2)); };
  const list = (type: string, ...subs: Uint8Array[]) => chunk('LIST', cat(enc(type), ...subs));
  const name20 = (s: string) => { const b = new Uint8Array(20); b.set(enc(s).subarray(0, 19)); return b; };
  // Two samples: 100 + 50 frames of 16-bit PCM (+ 46 zero guard frames each, per spec).
  const smpl = new Uint8Array((100 + 46 + 50 + 46) * 2);
  const phdr = (n: string, preset: number, bank: number, bag: number) => { const b = new Uint8Array(38); b.set(name20(n)); const v = new DataView(b.buffer); v.setUint16(20, preset, true); v.setUint16(22, bank, true); v.setUint16(24, bag, true); return b; };
  const bag = (gen: number) => { const b = new Uint8Array(4); new DataView(b.buffer).setUint16(0, gen, true); return b; };
  const gen = (op: number, amt: number, range?: [number, number]) => { const b = new Uint8Array(4); const v = new DataView(b.buffer); v.setUint16(0, op, true); if (range) { b[2] = range[0]; b[3] = range[1]; } else v.setInt16(2, amt, true); return b; };
  const instRec = (n: string, bagIdx: number) => { const b = new Uint8Array(22); b.set(name20(n)); new DataView(b.buffer).setUint16(20, bagIdx, true); return b; };
  const shdrRec = (n: string, start: number, end: number, rate: number, pitch: number) => { const b = new Uint8Array(46); b.set(name20(n)); const v = new DataView(b.buffer); v.setUint32(20, start, true); v.setUint32(24, end, true); v.setUint32(36, rate, true); v.setUint8(40, pitch); return b; };
  const pdta = list('pdta',
    chunk('phdr', cat(phdr('Piano', 0, 0, 0), phdr('Standard Drums', 0, 128, 1), phdr('EOP', 0, 0, 2))),
    chunk('pbag', cat(bag(0), bag(1), bag(2))),
    chunk('pmod', new Uint8Array(10)),
    chunk('pgen', cat(gen(41, 0), gen(41, 0), gen(0, 0))),
    chunk('inst', cat(instRec('Drums', 0), instRec('EOI', 2))),
    chunk('ibag', cat(bag(0), bag(3), bag(6))),
    chunk('imod', new Uint8Array(10)),
    chunk('igen', cat(gen(43, 0, [36, 36]), gen(57, 1), gen(53, 0), gen(43, 0, [42, 42]), gen(48, 60), gen(53, 1), gen(0, 0))),
    chunk('shdr', cat(shdrRec('Kick', 0, 100, 44100, 60), shdrRec('Hat', 146, 196, 22050, 60), shdrRec('EOS', 0, 0, 0, 0))),
  );
  const body = cat(enc('sfbk'), list('INFO', chunk('INAM', enc('Test Kit\0'))), list('sdta', chunk('smpl', smpl)), pdta);
  return chunk('RIFF', body);
}

test('SoundFont: percussion bank preferred, samples cut to WAV, exclusive class → choke', () => {
  const k = parseSf2(makeSf2(), 'file');
  assert.equal(k.name, 'Test Kit');
  assert.ok(k.notes[0].includes('Standard Drums'));
  assert.deepEqual(k.pads.map((p) => [p.slot, p.name]), [[0, 'Kick'], [6, 'Hat']]);
  const wav = k.pads[0].sample as { kind: 'bytes'; bytes: Uint8Array };
  assert.equal(new TextDecoder().decode(wav.bytes.subarray(0, 4)), 'RIFF');
  assert.equal(new DataView(wav.bytes.buffer, wav.bytes.byteOffset).getUint32(40, true), 200); // 100 frames × 2 bytes
  assert.equal(new DataView((k.pads[1].sample as { bytes: Uint8Array }).bytes.buffer).getUint32(24, true), 22050);
  assert.equal(k.pads[0].choke, 1);
  assert.equal(k.pads[1].gainDb, -6);
});

// ── Zip / AIFF ───────────────────────────────────────────────────────────────

test('zip reader over a Blob', async () => {
  const z = makeZip({ 'a/b.txt': enc('hello'), 'c.wav': enc('RIFF....') });
  const blob = new Blob([z]);
  const es = await zipEntries(blob);
  assert.deepEqual(es.map((e) => e.name), ['a/b.txt', 'c.wav']);
  assert.equal(new TextDecoder().decode(await zipRead(blob, es[0])), 'hello');
});

test('AIFF → WAV: big-endian 16-bit PCM flips to little-endian', () => {
  const comm = new Uint8Array(18); const cv = new DataView(comm.buffer);
  cv.setUint16(0, 1); cv.setUint32(2, 2); cv.setUint16(6, 16);
  comm.set([0x40, 0x0e, 0xac, 0x44, 0, 0, 0, 0, 0, 0], 8); // 44100 as 80-bit extended
  const ssnd = cat(new Uint8Array(8), Uint8Array.from([0x12, 0x34, 0xab, 0xcd]));
  const ck = (id: string, d: Uint8Array) => { const h = new Uint8Array(8); h.set(enc(id)); new DataView(h.buffer).setUint32(4, d.length); return cat(h, d); };
  const body = cat(enc('AIFF'), ck('COMM', comm), ck('SSND', ssnd));
  const form = cat(enc('FORM'), (() => { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, body.length); return b; })(), body);
  const wav = aiffToWav(form);
  const v = new DataView(wav.buffer);
  assert.equal(new TextDecoder().decode(wav.subarray(0, 4)), 'RIFF');
  assert.equal(v.getUint32(24, true), 44100);
  assert.deepEqual([...wav.subarray(44)], [0x34, 0x12, 0xcd, 0xab]);
});

// ── Classification / folder kits ─────────────────────────────────────────────

test('classify + Maschine layout of a loose folder', () => {
  assert.equal(classifySample('Drums/Kick/Zap.wav'), 'kick');
  assert.equal(classifySample('OH 01.wav'), 'hat-open');
  assert.equal(classifySample('Closed Hat 2.wav'), 'hat-closed');
  assert.equal(classifySample('Splice/808 Glide.wav'), 'bass');
  assert.equal(classifySample('Loops/Drum Loop 90 BPM.wav'), 'loop');
  const files = ['Kit/Snare 1.wav', 'Kit/Kick 1.wav', 'Kit/Closed Hat.wav', 'Kit/Open Hat.wav', 'Kit/Clap.wav', 'Kit/Mystery.wav'];
  assert.ok(looksLikeKit(files));
  assert.ok(!looksLikeKit(['Kicks/Kick 1.wav', 'Kicks/Kick 2.wav', 'Kicks/Kick 3.wav']));
  const laid = layoutFolderKit(files.map((path) => ({ path })));
  const at = (slot: number) => laid.find((l) => l.slot === slot)?.file.path;
  assert.equal(at(0), 'Kit/Kick 1.wav'); assert.equal(at(4), 'Kit/Snare 1.wav'); assert.equal(at(5), 'Kit/Clap.wav');
  assert.equal(at(8), 'Kit/Closed Hat.wav'); assert.equal(at(9), 'Kit/Open Hat.wav');
  const spec = parseFolderKit('Kit', files);
  assert.equal(spec.pads.find((p) => p.slot === 8)?.choke, 1);
});

// ── Resolution ───────────────────────────────────────────────────────────────

const idx: KitLibraryIndex = {
  roots: ['Native Instruments', 'MPC'], scannedAt: 0, skipped: 0, kits: [],
  samples: [
    { root: 0, path: 'Certified Gold/Samples/Drums/Kick/Kick Certified 1.wav', name: 'Kick Certified 1', category: 'kick', product: 'Certified Gold' },
    { root: 0, path: 'Other Pack/Samples/Drums/Kick/Kick Certified 1.wav', name: 'Kick Certified 1', category: 'kick', product: 'Other Pack' },
    { root: 1, path: 'Boom Bap/BB Kick.WAV', name: 'BB Kick', category: 'kick', product: 'Boom Bap' },
    { root: 1, path: 'Boom Bap/Programs/../BB Snare.wav', name: 'BB Snare', category: 'snare', product: 'Boom Bap' },
  ],
};

test('sample resolution: relative to kit, path tail across machines, bare names', () => {
  const look = buildLookup(idx);
  const mx: LibraryKit = { id: 'k', root: 0, path: 'Certified Gold/Groups/Kit.mxgrp', name: 'Kit', format: 'maschine-group', product: 'Certified Gold' };
  const r1 = resolveSamplePath(look, mx, 'C:\\Users\\Someone\\Documents\\Native Instruments\\Certified Gold\\Samples\\Drums\\Kick\\Kick Certified 1.wav');
  assert.equal(r1?.product, 'Certified Gold');
  const r2 = resolveSamplePath(look, mx, '../Samples/Drums/Kick/Kick Certified 1.wav');
  assert.equal(r2?.path, 'Certified Gold/Samples/Drums/Kick/Kick Certified 1.wav');
  const mpc: LibraryKit = { id: 'm', root: 1, path: 'Boom Bap/Boom Bap Kit.xpm', name: 'K', format: 'mpc', product: 'Boom Bap' };
  assert.equal(resolveSamplePath(look, mpc, 'BB Kick.wav')?.path, 'Boom Bap/BB Kick.WAV');  // case-insensitive
  assert.equal(resolveSamplePath(look, mpc, 'BB Kick')?.path, 'Boom Bap/BB Kick.WAV');      // MPC: no extension
  assert.equal(resolveSamplePath(look, mpc, 'Nope.wav'), null);
  assert.deepEqual(pathSegments('file:///C:/a/./b/../c.wav'), ['a', 'c.wav']);
});

// ── Applying to a Group ──────────────────────────────────────────────────────

test('applyKitToGroup: replaces the Group, spills past 16 into new Groups, names them', () => {
  const doc = newGrooveDoc('u');
  const kit = parseXpm(XPM, 'x');
  const ref = (name: string, durationSec = 1.5): SampleRef => ({ key: `k/${name}`, name, durationSec });
  const refs = new Map<number, SampleRef>([[0, ref('BB Kick')], [16, ref('BB Hat Closed', 0.2)]]);
  const res = applyKitToGroup(doc, 0, kit, refs);
  assert.deepEqual(res.banks, [0, 1]);
  assert.equal(res.filled, 2);
  assert.deepEqual(res.missing, ['BB Snare']);
  assert.equal(doc.kit.length, 32);
  assert.equal(doc.kit[0].source, 'sample');
  assert.equal(doc.kit[0].pitchSemis, -2);
  assert.equal(doc.kit[0].env.holdMs, 1500);                       // whole one-shot plays
  assert.equal(doc.kit[4].empty, true); assert.equal(doc.kit[4].name, 'BB Snare'); // the gap stays legible
  assert.equal(doc.kit[1].empty, true);                            // old starter-kit pad replaced
  assert.equal(doc.kit[16].choke, 2);
  assert.equal(doc.groupMeta?.[0].name, 'Boom Bap Kit 1');
  assert.equal(doc.groupMeta?.[1].source?.format, 'MPC');
});

test('user kits: snapshot a Group and load it into another', () => {
  const doc = newGrooveDoc('u');
  doc.kit[0].name = 'My Kick'; doc.kit[0].pitchSemis = 3;
  const kit = snapshotGroup(doc, 0, 'Mine');
  applyUserKit(doc, 1, kit);
  assert.equal(doc.kit.length, 32);
  assert.equal(doc.kit[16].name, 'My Kick');
  assert.equal(doc.kit[16].pitchSemis, 3);
  assert.notEqual(doc.kit[16].id, doc.kit[0].id);
  assert.equal(doc.groupMeta?.[1].name, 'Mine');
});

// ── Pad modes ────────────────────────────────────────────────────────────────


test('pad modes: keyboard chromatic / scale-locked, diatonic chords, labels', () => {
  const cMaj = { tonic: 0, scale: 'major' };
  assert.deepEqual(scaleSteps(cMaj), [0, 2, 4, 5, 7, 9, 11]);
  assert.equal(keySemi(5, { key: cMaj, scaleLock: false, octave: 0, baseNote: null }), 5);
  assert.equal(keySemi(7, { key: cMaj, scaleLock: true, octave: 0, baseNote: null }), 12);
  assert.equal(keySemi(0, { key: cMaj, scaleLock: true, octave: -1, baseNote: null }), -12);
  // Instrument pad on D4 (62) in C major: degree 0 lands on C (−2).
  assert.equal(tonicOffset(cMaj, 62), -2);
  assert.deepEqual(chordSemis(0, { key: cMaj, kind: 'triad', octave: 0, baseNote: null }), [0, 4, 7]);
  assert.deepEqual(chordSemis(1, { key: cMaj, kind: 'seventh', octave: 0, baseNote: null }), [2, 5, 9, 12]);
  assert.equal(chordLabel(0, { key: cMaj, kind: 'triad' }), 'I');
  assert.equal(chordLabel(1, { key: cMaj, kind: 'triad' }), 'ii');
  assert.equal(chordLabel(6, { key: cMaj, kind: 'triad' }), 'vii°');
  assert.equal(chordLabel(4, { key: cMaj, kind: 'seventh' }), 'V7');
});

test('recording a pitched pad hit writes pitch-roll notes (chords stack)', () => {
  const doc = newGrooveDoc('u');
  const pid = doc.patterns[0].id;
  recordPadHit(doc, { padIdx: 2, vel: 100, beat: 1, mode: 'pattern', semi: 0 }, [pid], true);
  recordPadHit(doc, { padIdx: 2, vel: 90, beat: 1.01, mode: 'pattern', semi: 4 }, [pid], true);
  recordPadHit(doc, { padIdx: 2, vel: 70, beat: 1, mode: 'pattern', semi: 0 }, [pid], true);
  const notes = doc.patterns[0].melo?.[2]?.[4];
  assert.deepEqual(notes, [{ semi: 0, v: 70, len: 1 }, { semi: 4, v: 90, len: 1 }]);
  assert.equal(doc.patterns[0].steps[2]?.[4], undefined); // not a drum hit
});
