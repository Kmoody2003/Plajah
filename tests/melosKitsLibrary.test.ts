// MEKA kit library end-to-end over a real folder: scan → index → open a kit → resolve and read
// each pad's sample, through a File System Access–shaped adapter over node:fs (the browser
// gives the same handle API). IndexedDB isn't present under tsx; the library treats its cache as
// best-effort, so the in-memory index is what's exercised here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync, statSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, basename } from 'node:path';
import { gzipSync } from 'node:zlib';
import { buildLookup, openKit, readKitSample, scanKitLibrary, type FsHandle } from '../services/melos/beats/kits/kitLibrary';
import { applyKitToGroup } from '../services/melos/beats/kits/applyKit';
import { newGrooveDoc, type SampleRef } from '../services/melos/beats/grooveDoc';

function dirHandle(path: string): FsHandle {
  return {
    name: basename(path), kind: 'directory',
    queryPermission: async () => 'granted',
    values: async function* () {
      for (const n of readdirSync(path)) yield statSync(join(path, n)).isDirectory() ? dirHandle(join(path, n)) : fileHandle(join(path, n));
    },
    getDirectoryHandle: async (n) => dirHandle(join(path, n)),
    getFileHandle: async (n) => fileHandle(join(path, n)),
  };
}
function fileHandle(path: string): FsHandle {
  return { name: basename(path), kind: 'file', getFile: async () => new File([readFileSync(path)], basename(path)) };
}
const wav = (tag: string) => Buffer.concat([Buffer.from('RIFF'), Buffer.from(tag)]);

test('library: scan a mixed folder, open each kit format, resolve its samples', async () => {
  const root = mkdtempSync(join(tmpdir(), 'meka-kits-'));
  try {
    // An MPC expansion: program + samples beside it.
    mkdirSync(join(root, 'Boom Bap Pack'));
    writeFileSync(join(root, 'Boom Bap Pack', 'BB Kick.wav'), wav('kick'));
    writeFileSync(join(root, 'Boom Bap Pack', 'BB Snare.wav'), wav('snare'));
    writeFileSync(join(root, 'Boom Bap Pack', 'Boom Bap.xpm'), `<?xml version="1.0"?><MPCVObject><Program type="Drum"><ProgramName>Boom Bap</ProgramName><Instruments>
      <Instrument number="37"><Layers><Layer number="1"><SampleName>BB Kick</SampleName></Layer></Layers></Instrument>
      <Instrument number="38"><Layers><Layer number="1"><SampleName>BB Snare</SampleName></Layer></Layers></Instrument>
      </Instruments><PadNoteMap><PadNote number="1"><Note>37</Note></PadNote><PadNote number="5"><Note>38</Note></PadNote></PadNoteMap></Program></MPCVObject>`);
    // An X11 pixmap with the same extension must not be listed.
    writeFileSync(join(root, 'Boom Bap Pack', 'icon.xpm'), '/* XPM */\nstatic char *icon[] = {"1 1 1 1"};');
    // An NI expansion layout: a Group whose paths were written on another machine.
    mkdirSync(join(root, 'Certified Gold', 'Groups'), { recursive: true });
    mkdirSync(join(root, 'Certified Gold', 'Samples', 'Drums', 'Kick'), { recursive: true });
    writeFileSync(join(root, 'Certified Gold', 'Samples', 'Drums', 'Kick', 'Kick Gold 1.wav'), wav('gold'));
    const u16 = (s: string) => Buffer.from(s, 'utf16le');
    writeFileSync(join(root, 'Certified Gold', 'Groups', 'Gold Kit.mxgrp'), Buffer.concat([Buffer.from([1, 2, 3, 0]),
      u16('D:\\NI Content\\Certified Gold\\Samples\\Drums\\Kick\\Kick Gold 1.wav'), Buffer.from([0, 0, 5, 0])]));
    // An Ableton Drum Rack pointing at a sample by relative path.
    mkdirSync(join(root, 'Live Racks', 'Samples'), { recursive: true });
    writeFileSync(join(root, 'Live Racks', 'Samples', 'Rack Clap.wav'), wav('clap'));
    writeFileSync(join(root, 'Live Racks', 'Clap Rack.adg'), gzipSync(Buffer.from(`<Ableton><DrumGroupDevice><BranchPresets><DrumBranchPreset><Name Value="Clap"/>
      <SampleRef><FileRef><RelativePath Value="Samples/Rack Clap.wav"/><Path Value=""/></FileRef></SampleRef>
      <ZoneSettings><ReceivingNote Value="91"/></ZoneSettings></DrumBranchPreset></BranchPresets></DrumGroupDevice></Ableton>`)));
    // A loose one-shot folder (a Splice-style kit).
    mkdirSync(join(root, 'Loose Kit'));
    for (const n of ['Kick Dusty.wav', 'Snare Crack.wav', 'Closed Hat.wav', 'Open Hat.wav']) writeFileSync(join(root, 'Loose Kit', n), wav(n));

    const handle = dirHandle(root);
    const index = await scanKitLibrary([handle]);
    const byName = Object.fromEntries(index.kits.map((k) => [k.name, k]));
    assert.deepEqual(Object.keys(byName).sort(), ['Boom Bap', 'Clap Rack', 'Gold Kit', 'Loose Kit']);
    assert.equal(byName['Boom Bap'].format, 'mpc');
    assert.equal(byName['Gold Kit'].format, 'maschine-group');
    assert.equal(byName['Gold Kit'].product, 'Certified Gold');
    assert.equal(byName['Loose Kit'].format, 'folder');
    assert.equal(index.samples.find((s) => s.name === 'Kick Gold 1')?.category, 'kick');

    const look = buildLookup(index);
    const loadAll = async (name: string) => {
      const kit = byName[name];
      const spec = (await openKit([handle], index, kit))!;
      const out: Record<number, string> = {};
      for (const p of spec.pads) {
        const got = p.sample && await readKitSample([handle], look, kit, p.sample);
        if (got) out[p.slot] = new TextDecoder().decode(new Uint8Array(await got.file.arrayBuffer())).slice(4);
      }
      return { spec, out };
    };
    assert.deepEqual((await loadAll('Boom Bap')).out, { 0: 'kick', 4: 'snare' });
    assert.deepEqual((await loadAll('Gold Kit')).out, { 0: 'gold' });              // other machine's D:\ path → this library
    assert.deepEqual((await loadAll('Clap Rack')).out, { 1: 'clap' });             // 128−91 = 37 → pad 2
    const loose = await loadAll('Loose Kit');
    assert.deepEqual(loose.out, { 0: 'Kick Dusty.wav', 4: 'Snare Crack.wav', 8: 'Closed Hat.wav', 9: 'Open Hat.wav' });

    // And onto a Group.
    const doc = newGrooveDoc('u');
    const refs = new Map<number, SampleRef>(Object.keys(loose.out).map((s) => [Number(s), { key: `k${s}`, name: s, durationSec: 0.5 }]));
    const res = applyKitToGroup(doc, 0, loose.spec, refs);
    assert.equal(res.filled, 4);
    assert.equal(doc.kit[9].choke, doc.kit[8].choke);
    assert.equal(doc.groupMeta?.[0].name, 'Loose Kit');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
