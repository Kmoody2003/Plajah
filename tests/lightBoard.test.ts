import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  addFixtures, applyEffects, applyMaster, applySubmaster, autoPatch, dipSwitches, displayAddress, emptyShow, findPatchProblems,
  hexToRgb, lerpLook, nextFreeAddress, overlay, parseCommand, renderUniverses, syncSmartFixtures, wash,
  type BoardShow, type Effect,
} from '../services/lighting/boardCore';
import { BUILTIN_PROFILES, parseChannelList, profilesFromOfl } from '../services/lighting/fixtureProfiles';
import { artnetPacket, enttecProFrame, openDmxFrame, sacnMulticast, sacnPacket } from '../services/lighting/dmxProtocol';

import { LOOK_CATEGORIES, LOOK_PRESETS, effectPreview, lookFromPreset, patternColor, posePanTilt } from '../services/lighting/looks';
import { HOLIDAY_RUNS, VENUES, estimateRun, placeRig, pointsAlong, runLength, venueById } from '../services/lighting/venues';
import { buildRelief, venueFromRoom } from '../services/lighting/roomCapture';
import { searchCatalog } from '../services/lighting/fixtureCatalog';
import { SMART_BRANDS, SMART_MODELS, searchSmartModels } from '../services/lighting/smartCatalog';
import { MAX_PREVIEW_FLASH_RATE, previewEnvelope, previewFrame, restingFrame } from '../services/lighting/lookPreview';
import catalog from '../data/lighting/fixtureCatalog.json';

const profile = (id: string) => BUILTIN_PROFILES.find((p) => p.id === id)!;
const ramp = () => Uint8Array.from({ length: 512 }, (_, i) => i & 0xff);

describe('auto patch', () => {
  test('addresses run on without gaps or overlaps', () => {
    const show = addFixtures(emptyShow(), profile('par-rgbw-4'), 3);
    assert.deepEqual(show.fixtures.map((f) => f.address), [1, 5, 9]);
    assert.deepEqual(show.fixtures.map((f) => f.fid), [1, 2, 3]);
    assert.equal(findPatchProblems(show).length, 0);
  });

  test('fills a hole before going further up', () => {
    const at = nextFreeAddress([{ universe: 1, start: 1, end: 4, id: 'a' }, { universe: 1, start: 9, end: 12, id: 'b' }], 4);
    assert.deepEqual(at, { universe: 1, address: 5 });
  });

  test('a fixture never straddles the end of a universe', () => {
    const show = addFixtures(emptyShow(), profile('spot-16'), 33);
    const last = show.fixtures[32];
    assert.equal(last.universe, 2);
    assert.equal(last.address, 1);
    assert.equal(show.fixtures[31].address, 497);
    assert.equal(findPatchProblems(show).length, 0);
  });

  test('re-addressing clears conflicts, groups types and leaves locked units alone', () => {
    let show: BoardShow = addFixtures(emptyShow(), profile('par-rgb-3'), 2);
    show = addFixtures(show, profile('spot-16'), 1);
    show = { ...show, fixtures: show.fixtures.map((f, i) => ({ ...f, address: 1, locked: i === 0 })) };
    assert.ok(findPatchProblems(show).some((p) => p.kind === 'overlap'));
    const fixed = autoPatch(show);
    assert.equal(findPatchProblems(fixed).length, 0);
    assert.equal(fixed.fixtures[0].address, 1, 'locked stays');
    assert.ok(fixed.fixtures[2].address! < fixed.fixtures[1].address!, 'movers sit ahead of pars');
  });

  test('reports a fixture running past 512', () => {
    const show = addFixtures(emptyShow(), profile('spot-16'), 1);
    show.fixtures[0].address = 505;
    assert.equal(findPatchProblems(show)[0].kind, 'overflow');
  });

  test('tells the operator what to set on the unit', () => {
    assert.deepEqual(dipSwitches(37).map(Number), [1, 0, 1, 0, 0, 1, 0, 0, 0]);
    assert.equal(displayAddress(7), 'd007');
  });
});

describe('rendering', () => {
  test('channels land at the patched address, in profile order', () => {
    const show = addFixtures(addFixtures(emptyShow(), profile('dimmer-1'), 1), profile('par-drgb-4'), 1);
    const [dim, par] = show.fixtures;
    const out = renderUniverses({ [dim.id]: { dimmer: 1 }, [par.id]: { dimmer: 0.5, red: 1, blue: 0.2 } }, show.fixtures, []);
    assert.deepEqual([...out.get(1)!.slice(0, 6)], [255, 128, 255, 0, 51, 0]);
  });

  test('pan and tilt carry 16 bits through coarse and fine', () => {
    const show = addFixtures(emptyShow(), profile('spot-16'), 1);
    const f = show.fixtures[0];
    const u = renderUniverses({ [f.id]: { pan: 0.25 } }, show.fixtures, []).get(1)!;
    assert.equal((u[0] << 8) | u[1], Math.round(0.25 * 65535));
    assert.equal(u[2], 128, 'tilt rests at centre');
  });

  test('a mover with nothing programmed keeps its shutter open but its dimmer shut', () => {
    const show = addFixtures(emptyShow(), profile('spot-16'), 1);
    const u = renderUniverses({}, show.fixtures, []).get(1)!;
    assert.equal(u[5], 0, 'dimmer');
    assert.equal(u[6], 255, 'shutter rest');
  });

  test('smart lights take no DMX space', () => {
    const show = syncSmartFixtures(emptyShow(), [{ id: 'hue:1', name: 'Lamp' }]);
    const f = show.fixtures[0];
    assert.equal(f.address, null);
    assert.equal(renderUniverses({ [f.id]: { dimmer: 1 } }, show.fixtures, []).size, 0);
  });

  test('every wash holds a mover steady and skips the fog machine', () => {
    const show = addFixtures(addFixtures(emptyShow(), profile('wash-15'), 1), profile('fog-2'), 1);
    const look = wash(show.fixtures, [], () => hexToRgb('#ff0000'));
    assert.equal(look[show.fixtures[0].id].red, 1);
    assert.equal(look[show.fixtures[1].id], undefined);
  });

  test('common white moves onto the white chip', () => {
    const show = addFixtures(emptyShow(), profile('par-rgbw-4'), 1);
    const level = wash(show.fixtures, [], () => hexToRgb('#ffffff'))[show.fixtures[0].id];
    assert.equal(level.white, 1);
    assert.equal(level.red, 0);
  });
});

describe('mixing', () => {
  const show = addFixtures(addFixtures(emptyShow(), profile('par-drgb-4'), 1), profile('par-rgb-3'), 1);
  const [withDim, without] = show.fixtures;

  test('crossfade passes through the midpoint and lands exactly', () => {
    const a = { x: { dimmer: 0 } }, b = { x: { dimmer: 1 } };
    assert.equal(lerpLook(a, b, 0.5).x.dimmer, 0.5);
    assert.equal(lerpLook(a, b, 1), b);
  });

  test('a submaster is highest-takes-precedence for light', () => {
    const out = applySubmaster({ x: { dimmer: 0.6 } }, { x: { dimmer: 1 } }, 0.5);
    assert.equal(out.x.dimmer, 0.6);
    assert.equal(applySubmaster({ x: { dimmer: 0.2 } }, { x: { dimmer: 1 } }, 0.5).x.dimmer, 0.5);
  });

  test('grand master scales dimmers, or colour where there is no dimmer', () => {
    const out = applyMaster({ [withDim.id]: { dimmer: 1, red: 1 }, [without.id]: { red: 1 } }, show.fixtures, [], 0.5, false);
    assert.equal(out[withDim.id].dimmer, 0.5);
    assert.equal(out[withDim.id].red, 1);
    assert.equal(out[without.id].red, 0.5);
  });

  test('blackout leaves positions alone', () => {
    const mover = addFixtures(emptyShow(), profile('spot-16'), 1);
    const id = mover.fixtures[0].id;
    const out = applyMaster({ [id]: { dimmer: 1, pan: 0.7 } }, mover.fixtures, [], 1, true);
    assert.equal(out[id].dimmer, 0);
    assert.equal(out[id].pan, 0.7);
  });

  test('the programmer wins', () => {
    assert.equal(overlay({ x: { dimmer: 1, red: 1 } }, { x: { dimmer: 0.1 } }).x.dimmer, 0.1);
  });

  test('an effect that is off changes nothing', () => {
    const effect: Effect = { id: 'e', kind: 'pulse', fixtureIds: [withDim.id], rate: 60, size: 1, spread: 1, on: false };
    const look = { [withDim.id]: { dimmer: 1 } };
    assert.equal(applyEffects(look, [effect], show.fixtures, [], 3.3), look);
  });

  test('a pulse stays within range', () => {
    const effect: Effect = { id: 'e', kind: 'pulse', fixtureIds: [withDim.id], rate: 60, size: 1, spread: 1, on: true };
    for (let t = 0; t < 2; t += 0.13) {
      const v = applyEffects({ [withDim.id]: { dimmer: 1 } }, [effect], show.fixtures, [], t)[withDim.id].dimmer!;
      assert.ok(v >= 0 && v <= 1);
    }
  });
});

describe('looks library', () => {
  const rig = addFixtures(addFixtures(emptyShow(), profile('spot-16'), 4), profile('par-rgbw-4'), 4);

  test('has a real shelf for every category with unique ids', () => {
    assert.equal(new Set(LOOK_PRESETS.map((p) => p.id)).size, LOOK_PRESETS.length);
    for (const c of LOOK_CATEGORIES) assert.ok(LOOK_PRESETS.filter((p) => p.category === c).length >= 6, c);
    assert.ok(LOOK_PRESETS.length >= 80);
  });

  test('every preset bakes against a mixed rig and stays in range', () => {
    for (const p of LOOK_PRESETS) {
      const { look, effects } = lookFromPreset(p, rig.fixtures, []);
      for (const f of rig.fixtures) {
        for (const v of Object.values(look[f.id])) assert.ok(v! >= 0 && v! <= 1, `${p.id} ${v}`);
      }
      const out = applyEffects(look, effects, rig.fixtures, [], 2.37);
      for (const f of rig.fixtures) for (const v of Object.values(out[f.id])) assert.ok(v! >= -1e-9 && v! <= 1 + 1e-9, `${p.id} effect ${v}`);
    }
  });

  test('an alternating palette alternates and a fan fans', () => {
    assert.deepEqual(patternColor('alternate', ['#ff0000', '#0000ff'], 1, 4), { r: 0, g: 0, b: 1 });
    const a = posePanTilt('fan', 0, 5).tilt, b = posePanTilt('fan', 4, 5).tilt;
    assert.ok(a < 0.5 && b > 0.5);
  });

  test('fog machines are left out of looks', () => {
    const withFog = addFixtures(emptyShow(), profile('fog-2'), 1);
    assert.deepEqual(lookFromPreset(LOOK_PRESETS[0], withFog.fixtures, []).look, {});
  });
});

describe('look thumbnails', () => {
  const byName = (name: string) => LOOK_PRESETS.find((p) => p.name === name)!;

  test('every preset draws a lit, in-range frame', () => {
    for (const p of LOOK_PRESETS) {
      const frame = restingFrame(p);
      assert.ok(frame.length > 0 && frame.some((f) => f.on > 0.01), p.id);
      for (const f of frame) {
        assert.ok(f.on >= 0 && f.on <= 1 && /^#[0-9a-f]{6}$/.test(f.css), p.id);
        assert.ok(Number.isFinite(f.x + f.y + f.z), p.id);
      }
    }
  });
  test('looks with effects keep moving while they hold', () => {
    for (const p of LOOK_PRESETS.filter((x) => x.effects.length)) {
      const frames = Array.from({ length: 16 }, (_, i) => JSON.stringify(previewFrame(p, i * 0.31)));
      assert.ok(new Set(frames).size > 2, p.id);
    }
  });
  test('a look fades up at its own speed, then repeats', () => {
    assert.equal(previewEnvelope(0, 2, 7.4), 0);
    assert.equal(previewEnvelope(1, 2, 7.4), 0.5);
    assert.equal(previewEnvelope(4, 2, 7.4), 1);
    assert.ok(previewEnvelope(7.3, 2, 7.4) < 0.5);
    assert.equal(previewEnvelope(8.4, 2, 7.4), 0.5);
  });
  test('thumbnails never flash above the limit, whatever the real look does', () => {
    const edm = byName('EDM Drop');
    assert.ok(edm.effects[0].rate > MAX_PREVIEW_FLASH_RATE);
    // Count on/off transitions on one fixture over 4 seconds while the look is held.
    const start = 40;
    let flips = 0, last: boolean | null = null;
    for (let t = 0; t < 4; t += 0.01) {
      const on = previewFrame(edm, start + t)[0].on > 0.5;
      if (last !== null && on !== last) flips++;
      last = on;
    }
    assert.ok(flips / 2 / 4 <= 3, `${flips / 2 / 4} flashes a second`);
  });
});

describe('smart catalog', () => {
  test('every brand has models, and every model a brand and real capabilities', () => {
    for (const b of SMART_BRANDS) assert.ok(SMART_MODELS.filter((m) => m.platform === b.platform).length >= 5, b.name);
    assert.equal(new Set(SMART_MODELS.map((m) => m.id)).size, SMART_MODELS.length);
    for (const m of SMART_MODELS) {
      assert.ok(SMART_BRANDS.some((b) => b.platform === m.platform), m.id);
      assert.ok(m.capabilities.length >= 1 && new Set(m.capabilities).size === m.capabilities.length, m.id);
    }
  });
  test('search covers brand, model and capability', () => {
    assert.ok(searchSmartModels('hue gradient', 'all').length >= 2);
    assert.ok(searchSmartModels('screen sync', 'govee').every((m) => m.platform === 'govee'));
    assert.equal(searchSmartModels('hue', 'razer').length, 0);
  });
});

describe('effect previews', () => {
  test('every effect kind moves in its tile', () => {
    for (const [kind, pose] of [['pulse', 'down'], ['chase', 'down'], ['rainbow', 'down'], ['circle', 'fan'], ['sweep', 'fan'], ['strobe', 'down'], ['twinkle', 'down'], ['fire', 'down'], ['colorwave', 'down']] as const) {
      const p = effectPreview(kind, ['#ff0000', '#0000ff'], pose);
      const frames = Array.from({ length: 12 }, (_, i) => JSON.stringify(previewFrame(p, i * 0.37)));
      assert.ok(new Set(frames).size > 2, kind);
    }
  });
});

describe('fixture catalog', () => {
  const fixtures = (catalog as any).fixtures;
  test('every fixture has at least one usable DMX mode that fits a universe', () => {
    assert.ok(fixtures.length >= 50);
    assert.equal(new Set(fixtures.map((f: any) => f.id)).size, fixtures.length);
    for (const f of fixtures) for (const p of f.profiles) assert.ok(p.channels.length >= 1 && p.channels.length <= 512, f.id);
  });
  test('real gear reads as what it is', () => {
    const aura = fixtures.find((f: any) => f.id === 'martin/mac-aura');
    assert.equal(aura.form, 'mover-wash');
    assert.equal(aura.spec.powerW, 260);
    assert.ok(aura.profiles[0].channels.some((c: any) => c.attr === 'pan'));
  });
  test('search matches all the words', () => {
    assert.equal(searchCatalog(fixtures, 'martin aura', 'all')[0].id, 'martin/mac-aura');
    assert.equal(searchCatalog(fixtures, 'martin aura', 'fog').length, 0);
  });
});

describe('venues', () => {
  const rigged = (v: any) => {
    let show = emptyShow();
    for (const r of v.rig) show = addFixtures(show, BUILTIN_PROFILES.find((p) => p.id === r.profileId)!, r.count, r.name);
    return show;
  };
  test('there is a venue at every size, and starter rigs use real profiles', () => {
    for (const id of ['home', 'club', 'theatre-small', 'hall', 'hall-large', 'arena', 'stadium', 'christmas']) assert.ok(venueById(id), id);
    for (const v of VENUES) for (const r of v.rig) assert.ok(BUILTIN_PROFILES.some((p) => p.id === r.profileId), r.profileId);
  });
  test('the whole starter rig gets hung, once each, inside the room', () => {
    for (const v of VENUES) {
      const show = rigged(v);
      const spots = placeRig(v, show.fixtures, []);
      assert.equal(spots.length, show.fixtures.length, v.id);
      assert.equal(new Set(spots.map((s) => s.fixtureId)).size, spots.length, v.id);
      for (const s of spots) assert.ok(s.y <= v.height + 0.01 && Math.abs(s.x) <= v.width, v.id);
    }
  });
  test('movers hang and bars sit on the deck', () => {
    const v = venueById('hall')!;
    const show = rigged(v);
    const spots = placeRig(v, show.fixtures, []);
    const mover = show.fixtures.find((f) => f.profileId === 'spot-16')!;
    const barF = show.fixtures.find((f) => f.profileId === 'bar-4cell')!;
    assert.equal(spots.find((s) => s.fixtureId === mover.id)!.mount, 'hang');
    assert.equal(spots.find((s) => s.fixtureId === mover.id)!.moves, true);
    assert.equal(spots.find((s) => s.fixtureId === barF.id)!.mount, 'floor');
  });
  test('Christmas estimates follow the run and the bulb', () => {
    const run = { path: [[0, 0, 0], [10, 0, 0]] as [number, number, number][], bulb: 'c9' as const };
    const e = estimateRun(run);
    assert.equal(e.bulbs, 33);
    assert.ok(Math.abs(e.watts - 16.5) < 1e-9);
    assert.ok(Math.abs(runLength(run.path) - 10) < 1e-9);
    assert.equal(pointsAlong(run.path, 11)[5][0], 5);
    for (const r of HOLIDAY_RUNS) assert.ok(estimateRun(r).bulbs > 0, r.id);
  });
});

describe('photo to room', () => {
  // A synthetic corridor: disparity falls towards the middle of the frame.
  const w = 64, h = 48;
  const depth = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    depth[y * w + x] = Math.round(40 + 200 * Math.max(Math.abs(x / w - 0.5), Math.abs(y / h - 0.5)) * 2);
  }
  const relief = buildRelief(depth, w, h, { ceilingM: 3, grid: 40 });

  test('the mesh is scaled to the ceiling height with the floor at zero', () => {
    assert.ok(relief.bounds.maxY > 2.9 && relief.bounds.maxY < 3.6, String(relief.bounds.maxY));
    assert.ok(relief.bounds.minY > -0.3);
  });
  test('it looks along -z, further away in the middle', () => {
    const k = (j: number, i: number) => (j * 41 + i) * 3 + 2;
    const cols = 40, rows = Math.round(40 / (w / h));
    const centre = relief.positions[(Math.floor(rows / 2) * (cols + 1) + Math.floor(cols / 2)) * 3 + 2];
    const corner = relief.positions[2];
    assert.ok(centre < corner, `${centre} ${corner}`);
    assert.ok(k(0, 0) >= 0);
  });
  test('a hard depth edge tears instead of stretching', () => {
    const edge = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) edge[y * w + x] = x < w / 2 ? 240 : 20;
    const torn = buildRelief(edge, w, h, { grid: 40 });
    const smooth = buildRelief(new Uint8Array(w * h).map((_, i) => 100 + (i % w)), w, h, { grid: 40 });
    assert.ok(torn.indices.length < smooth.indices.length);
  });
  test('a built room becomes a venue with somewhere to hang lights', () => {
    const v = venueFromRoom({ id: 'x', name: 'Den', ceilingM: 2.5 }, 6, 6);
    assert.equal(v.kind, 'photo');
    assert.ok(v.trusses.every((t) => t.y <= 2.5));
  });
});

describe('command line', () => {
  test('ranges, plus and levels', () => {
    assert.deepEqual(parseCommand('1 thru 3 + 7 at 50'), { kind: 'select', fids: [1, 2, 3, 7], level: 0.5 });
    assert.deepEqual(parseCommand('5 full'), { kind: 'select', fids: [5], level: 1 });
    assert.deepEqual(parseCommand('5 out'), { kind: 'select', fids: [5], level: 0 });
    assert.deepEqual(parseCommand('2>4@10'), { kind: 'select', fids: [2, 3, 4], level: 0.1 });
    assert.deepEqual(parseCommand('12'), { kind: 'select', fids: [12], level: undefined });
  });
  test('keywords', () => {
    assert.equal(parseCommand('clear').kind, 'clear');
    assert.equal(parseCommand('GO').kind, 'go');
    assert.deepEqual(parseCommand('record 12.5'), { kind: 'record', number: 12.5 });
  });
  test('rubbish is rejected rather than guessed at', () => {
    assert.equal(parseCommand('banana').kind, 'error');
    assert.equal(parseCommand('1 at 500').kind, 'error');
    assert.equal(parseCommand('').kind, 'error');
  });
});

describe('profiles', () => {
  test('every built-in profile fits a universe and has a unique id', () => {
    assert.equal(new Set(BUILTIN_PROFILES.map((p) => p.id)).size, BUILTIN_PROFILES.length);
    for (const p of BUILTIN_PROFILES) assert.ok(p.channels.length >= 1 && p.channels.length <= 512);
  });

  test('a typed channel list keeps its count even with unknown words', () => {
    const p = parseChannelList('Thing', 'dim, r, g, b, wobble')!;
    assert.deepEqual(p.channels.map((c) => c.attr), ['dimmer', 'red', 'green', 'blue', 'raw']);
    assert.equal(parseChannelList('x', '  '), null);
  });

  test('an Open Fixture Library file becomes one profile per mode', () => {
    const profiles = profilesFromOfl({
      name: 'Beam 7', manufacturerKey: 'acme', categories: ['Moving Head'],
      availableChannels: {
        Pan: { fineChannelAliases: ['Pan fine'], capability: { type: 'Pan', angleStart: '0deg', angleEnd: '540deg' } },
        Dimmer: { capability: { type: 'Intensity' } },
        Shutter: { capabilities: [{ dmxRange: [0, 9], type: 'ShutterStrobe', shutterEffect: 'Closed' }, { dmxRange: [10, 255], type: 'ShutterStrobe', shutterEffect: 'Open' }] },
        Red: { capability: { type: 'ColorIntensity', color: 'Red' } },
      },
      modes: [{ name: '5ch', channels: ['Pan', 'Pan fine', 'Dimmer', 'Shutter', 'Red'] }, { name: '2ch', channels: ['Dimmer', 'Red'] }],
    });
    assert.equal(profiles.length, 2);
    assert.deepEqual(profiles[0].channels.map((c) => c.attr), ['pan', 'panFine', 'dimmer', 'shutter', 'red']);
    assert.equal(profiles[0].category, 'spot');
    assert.ok(profiles[0].channels[3].rest! > 0.5, 'shutter rests open');
    assert.deepEqual(profilesFromOfl({ nope: 1 }), []);
  });
});

describe('wire formats', () => {
  test('ArtDmx header', () => {
    const p = artnetPacket(0x0123, 7, ramp());
    assert.equal(p.length, 530);
    assert.equal(String.fromCharCode(...p.slice(0, 7)), 'Art-Net');
    assert.equal(p[7], 0);
    assert.deepEqual([...p.slice(8, 12)], [0x00, 0x50, 0, 14]);
    assert.equal(p[12], 7);
    assert.deepEqual([p[14], p[15]], [0x23, 0x01]);
    assert.deepEqual([p[16], p[17]], [2, 0]);
    assert.equal(p[18 + 300], 300 & 0xff);
  });

  test('E1.31 layout', () => {
    const cid = Uint8Array.from({ length: 16 }, (_, i) => i + 1);
    const p = sacnPacket(258, 9, ramp(), cid, 'Board');
    const view = new DataView(p.buffer);
    assert.equal(p.length, 638);
    assert.equal(view.getUint16(0), 0x0010);
    assert.equal(String.fromCharCode(...p.slice(4, 13)), 'ASC-E1.17');
    assert.equal(view.getUint16(16), 0x7000 | 622);
    assert.equal(view.getUint32(18), 4);
    assert.deepEqual([...p.slice(22, 38)], [...cid]);
    assert.equal(view.getUint16(38), 0x7000 | 600);
    assert.equal(view.getUint32(40), 2);
    assert.equal(String.fromCharCode(...p.slice(44, 49)), 'Board');
    assert.equal(p[108], 100);
    assert.equal(p[111], 9);
    assert.equal(view.getUint16(113), 258);
    assert.equal(view.getUint16(115), 0x7000 | 523);
    assert.equal(p[117], 2);
    assert.equal(p[118], 0xa1);
    assert.equal(view.getUint16(123), 513);
    assert.equal(p[125], 0);
    assert.equal(p[126 + 300], 300 & 0xff);
    assert.equal(sacnMulticast(258), '239.255.1.2');
  });

  test('ENTTEC Pro frame', () => {
    const f = enttecProFrame(ramp());
    assert.deepEqual([...f.slice(0, 5)], [0x7e, 6, 0x01, 0x02, 0]);
    assert.equal(f[f.length - 1], 0xe7);
    assert.equal(f.length, 518);
    assert.equal(f[5 + 10], 10);
  });

  test('Open DMX frame leads with the start code', () => {
    const f = openDmxFrame(ramp());
    assert.equal(f.length, 513);
    assert.equal(f[0], 0);
    assert.equal(f[1 + 10], 10);
  });
});
