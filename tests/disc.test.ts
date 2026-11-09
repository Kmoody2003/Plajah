// Disc Authoring: binary formats round-trip through our own parsers, budget/validator law,
// templates compile to sound navigation.   npm run test:disc
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BitReader, BitWriter } from '../services/disc/bits';
import { rleDecode, rleEncode } from '../services/disc/rle';
import { quantize, rgbToYCrCb, yCrCbToRgb } from '../services/disc/palette';
import * as H from '../services/disc/hdmv';
import { buildSup, parseSup, parseSrt } from '../services/disc/pgs';
import { buildIg, parseIg, type Rgba } from '../services/disc/ig';
import { parseIndex, parseMovieObjects, parseMpls, writeIndex, writeMovieObjects, writeMpls } from '../services/disc/bdmv';
import { autoChapters, autoNav, newProject, newTitle, type DiscProject } from '../services/disc/project';
import { planBudget, suggestMedium } from '../services/disc/budget';
import { validate, summarize } from '../services/disc/validate';
import { applyTemplate, TEMPLATES } from '../services/disc/templates';
import { compile } from '../services/disc/navigation';
import { bdVideoArgs, planEncodes, uhdVideoArgs } from '../services/disc/encode';
import { buildPackage } from '../services/disc/build';
import { buildManifest } from '../services/disc/destination';

const solid = (w: number, h: number, rgba: [number, number, number, number]): Rgba => {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) d.set(rgba, i * 4);
  return { w, h, data: d };
};

function feature(fmt: 'BD' | 'UHD' = 'BD'): DiscProject {
  const p = newProject('Night Train', fmt);
  const f = newTitle('Night Train', 2 * 3600, 'FEATURE');
  f.chapters = autoChapters(f.source.durationSec, 600);
  f.subtitles = [{ id: 's1', lang: 'eng', label: 'English', srt: '1\n00:00:01,000 --> 00:00:03,000\nHello\n' }];
  f.audio.push({ id: 'a2', lang: 'eng', label: 'Commentary', codec: 'ac3', channels: 2, kbps: 192, commentary: true });
  const x = newTitle('Making Of', 1200, 'EXTRA');
  x.audio = [{ id: 'a3', lang: 'eng', label: 'Stereo', codec: 'ac3', channels: 2, kbps: 224 }];
  p.titles = [f, x];
  return p;
}

test('bit writer/reader handle odd widths and 33-bit values', () => {
  const b = new BitWriter().bits(5, 3).bits(1, 1).bits(0x1abcdef12, 33).u16(0xbeef).done();
  const r = new BitReader(b);
  assert.equal(r.bits(3), 5); assert.equal(r.bits(1), 1); assert.equal(r.bits(33), 0x1abcdef12); assert.equal(r.u16(), 0xbeef);
});

test('RLE round-trips runs, singles, long transparent and long coloured runs', () => {
  const w = 300, h = 3, px = new Uint8Array(w * h);
  px.fill(7, 0, 2); px.fill(9, 10, 80); px.fill(4, 300, 600); px[650] = 3;
  const back = rleDecode(rleEncode(px, w, h), w, h);
  assert.deepEqual(back, px);
});

test('palette: BT.709 studio range, transparent index 0, nearest mapping', () => {
  const white = rgbToYCrCb(255, 255, 255); assert.deepEqual(white, { y: 235, cr: 128, cb: 128 });
  const back = yCrCbToRgb(white.y, white.cr, white.cb); assert.ok(back.r > 250 && back.g > 250 && back.b > 250);
  const img = new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 0, 0, 0, 0, 255, 255, 255, 0, 0, 255]);
  const q = quantize(img, 2, 2);
  assert.equal(q.pixels[1], 0); assert.equal(q.palette[0].t, 0);
  assert.equal(q.pixels[0], q.pixels[3]); assert.notEqual(q.pixels[0], q.pixels[2]);
});

test('HDMV instructions encode/decode and disassemble', () => {
  for (const [i, s] of [[H.playPL(3), 'PlayPL 3'], [H.jumpObject(5), 'JumpObject 5'], [H.playPLMark(2, 4), 'PlayPLatMK 2 4'], [H.move(1, 0x80010000), 'Move GPR1, 2147549184'], [H.popupOff(), 'PopUpMenuOff'], [H.setButtonPage({ button: 2, page: 1 }), 'SetButtonPage button=2 page=1']] as const) {
    const d = H.decode(H.encode(i));
    assert.deepEqual(d, i); assert.equal(H.disasm(d), s);
  }
  assert.equal(H.disasm(H.setStream({ audio: 2, pg: 1, pgOn: true })), 'SetStream audio=2 pg=1 on');
  assert.equal(H.encode(H.playPL(1)).length, 12);
});

test('PGS: SUP display sets round-trip with bitmap, palette, forced flag', () => {
  const q = quantize(solid(40, 10, [255, 255, 255, 255]).data, 40, 10);
  const sup = buildSup([{ startSec: 1, endSec: 3, image: q, x: 100, y: 900, forced: true }], { w: 1920, h: 1080, fps: 23.976 });
  const sets = parseSup(sup);
  assert.equal(sets.length, 2);
  assert.equal(sets[0].ptsSec, 1); assert.deepEqual(sets[0].objects[0], { x: 100, y: 900, forced: true });
  assert.equal(sets[0].bitmap!.w, 40); assert.deepEqual(sets[0].bitmap!.pixels, q.pixels);
  assert.equal(sets[1].ptsSec, 3); assert.equal(sets[1].objects.length, 0);
  assert.deepEqual(parseSrt('1\n00:00:01,500 --> 00:00:02,000\n<i>Hi</i>\nthere\n'), [{ startSec: 1.5, endSec: 2, text: 'Hi\nthere' }]);
});

test('IG: pages, buttons, neighbours, commands and state bitmaps round-trip', () => {
  const art = (c: [number, number, number, number]) => ({ normal: solid(200, 60, [90, 90, 90, 255]), selected: solid(200, 60, c), activated: solid(200, 60, [255, 200, 0, 255]) });
  const { stream } = buildIg({ video: { w: 1920, h: 1080, fps: 23.976 }, popup: true, pages: [{ id: 0, defaultButton: 1, panel: { x: 0, y: 900, img: solid(1920, 150, [0, 0, 0, 180]) }, buttons: [
    { id: 1, x: 100, y: 920, ...art([255, 255, 255, 255]), nav: { right: 2 }, commands: [H.move(0, 0), H.jumpObject(2)] },
    { id: 2, x: 320, y: 920, ...art([200, 220, 255, 255]), nav: { left: 1 }, commands: [H.linkMark(3), H.popupOff()], autoAction: false },
  ] }] });
  const ig = parseIg(stream);
  assert.equal(ig.w, 1920); assert.equal(ig.popup, true); assert.equal(ig.pages.length, 1);
  const pg = ig.pages[0]; assert.equal(pg.defaultButton, 1);
  const btns = pg.bogs.flatMap(b => b.buttons).filter(b => b.id < 0x0f00);
  assert.equal(btns.length, 2);
  assert.deepEqual(btns[0].nav, { up: 1, down: 1, left: 1, right: 2 });
  assert.deepEqual(btns[1].commands.map(H.disasm), ['LinkMK 3', 'PopUpMenuOff']);
  assert.equal(ig.objects.size, 7); // panel + 2×3 states
  const sel = ig.objects.get(btns[0].objects.selected)!; assert.equal(sel.w, 200);
  const pal = ig.palettes.get(0)!; const entry = pal[sel.pixels[0]];
  assert.ok(entry.y > 230); // white selected state survives the palette
});

test('index.bdmv / MovieObject.bdmv / MPLS round-trip (BD 0200, UHD 0300)', () => {
  const idx = parseIndex(writeIndex({ format: 'UHD', video: { h: 2160, scan: 'p', fps: 23.976 }, firstPlay: { kind: 'HDMV', movie: true, objectId: 0 }, topMenu: { kind: 'HDMV', movie: false, objectId: 1 }, titles: [{ kind: 'HDMV', movie: true, objectId: 2 }] }));
  assert.equal(idx.magic, 'INDX'); assert.equal(idx.version, '0300'); assert.equal(idx.topMenu.objectId, 1); assert.equal(idx.topMenu.movie, false); assert.equal(idx.titles[0].objectId, 2);
  const mo = parseMovieObjects(writeMovieObjects('BD', [{ commands: [H.playPL(1), H.jumpObject(1)] }, { resume: true, commands: [] }]));
  assert.equal(mo.length, 2); assert.deepEqual(mo[0].commands.map(H.disasm), ['PlayPL 1', 'JumpObject 1']); assert.equal(mo[1].resume, true);
  const mpls = parseMpls(writeMpls({ format: 'BD', items: [{ clip: '00001', inSec: 0, outSec: 7200, streams: { video: { codec: 'h264', h: 1080, scan: 'p', fps: 23.976 }, audio: [{ codec: 'lpcm', channels: 6, lang: 'eng' }, { codec: 'ac3', channels: 2, lang: 'eng' }], pg: [{ lang: 'eng' }], ig: [{ lang: 'eng' }] } }], marks: [{ item: 0, sec: 0 }, { item: 0, sec: 600 }] }));
  assert.equal(mpls.magic, 'MPLS'); assert.equal(mpls.version, '0200'); assert.equal(mpls.items[0].clip, '00001'); assert.equal(mpls.items[0].outSec, 7200);
  assert.deepEqual(mpls.items[0].counts, { video: 1, audio: 2, pg: 1, ig: 1 });
  assert.deepEqual(mpls.marks.map(m => m.sec), [0, 600]);
});

test('budget: a 2 h feature fits a BD-25 at good quality; UHD needs a bigger disc', () => {
  const p = feature('BD');
  const b = planBudget(p);
  assert.ok(b.fits); assert.ok(b.fill > 0.8 && b.fill <= 1);
  const ft = b.titles[0]; assert.ok(ft.videoKbps > 15000 && ft.peakKbps <= 40000, `${ft.videoKbps}`);
  assert.ok(['good', 'excellent'].includes(ft.grade));
  assert.ok(b.titles[1].videoKbps < ft.videoKbps); // extras get less
  const u = feature('UHD');
  assert.equal(suggestMedium(u, ['bdr25', 'bdr50', 'bdrxl100']), 'bdr50');
});

test('validator: illegal modes, unreachable buttons, licensing, retail needs', () => {
  const p = applyTemplate(feature('BD'), 'marquee');
  assert.equal(summarize(validate(p)).errors, 0, JSON.stringify(validate(p).filter(i => i.severity === 'error')));
  const bad = { ...p, video: { ...p.video, fps: 59.94 } };
  assert.ok(validate(bad).some(i => i.severity === 'error' && /not a legal/.test(i.message)));
  const lonely = structuredClone(p);
  const top = lonely.menus.find(m => m.id === lonely.topMenuId)!;
  top.buttons.push({ ...top.buttons[0], id: 'island', label: 'Island', x: 1500, y: 100, nav: { up: 'island', down: 'island', left: 'island', right: 'island' } });
  for (const b of top.buttons) if (b.id !== 'island') b.nav = { up: b.id, down: b.id, left: b.id, right: b.id };
  assert.ok(validate(lonely).some(i => /can't be reached/.test(i.message)));
  const retail = { ...p, destination: 'press-retail' as const, mediumId: 'bd50' };
  const iss = validate(retail);
  assert.ok(iss.some(i => /AACS/.test(i.message))); assert.ok(iss.some(i => /UPC/.test(i.message)));
  const wrongDisc = { ...p, destination: 'press-retail' as const, mediumId: 'bdr25' };
  assert.ok(validate(wrongDisc).some(i => i.area === 'destination' && i.severity === 'error'));
  const dv = { ...applyTemplate(feature('UHD'), 'monolith'), video: { ...feature('UHD').video, dynamic: 'DOLBY_VISION' as const } };
  assert.ok(validate(dv).some(i => i.area === 'licensing' && /Dolby Vision/.test(i.message)));
});

test('every template compiles to complete navigation with reachable buttons', () => {
  for (const t of TEMPLATES) {
    for (const fmt of t.formats) {
      const base = feature(fmt);
      if (t.id === 'boxset') base.titles = [1, 2, 3].map(n => ({ ...newTitle(`Episode ${n}`, 1500, 'EPISODE') }));
      const p = applyTemplate(base, t.id);
      const errs = validate(p).filter(i => i.severity === 'error');
      assert.equal(errs.length, 0, `${t.id}/${fmt}: ${errs.map(e => e.message).join('; ')}`);
      const c = compile(p);
      assert.equal(c.warnings.length, 0, `${t.id}: ${c.warnings}`);
      const fp = c.objects[0].obj.commands.map(H.disasm);
      assert.ok(fp.some(s => s.startsWith('JumpObject')), `${t.id} first play: ${fp}`);
      for (const m of c.menus) for (const b of m.buttons) assert.ok(b.commands.length > 0, `${t.id} ${m.menuId} button ${b.ref} has no commands`);
    }
  }
});

test('navigation: chapter buttons set GPR0 and title objects play from it', () => {
  const p = applyTemplate(feature('BD'), 'marquee');
  const c = compile(p);
  const ft = p.titles[0];
  const titleObj = c.objects[c.titleObject[ft.id]].obj.commands.map(H.disasm);
  assert.ok(titleObj.includes('PlayPLatMK 1 GPR0') || titleObj.some(s => s.startsWith('PlayPLatMK 1')), titleObj.join(' | '));
  const scenes = c.menus.find(m => p.menus.find(x => x.id === m.menuId)?.kind === 'SCENES')!;
  const third = scenes.buttons[2].commands.map(H.disasm);
  assert.deepEqual(third, ['Move GPR0, 2', `JumpObject ${c.titleObject[ft.id]}`]);
  const popup = c.menus.find(m => m.popup)!;
  assert.ok(popup.buttons.some(b => b.commands.map(H.disasm).join() === 'LinkMK 1,PopUpMenuOff'));
});

test('autoNav links a row left/right and a column up/down', () => {
  const mk = (id: string, x: number, y: number) => ({ id, label: id, x, y, w: 100, h: 40, style: {} as any, nav: {}, action: { kind: 'NONE' as const } });
  const row = autoNav([mk('a', 0, 0), mk('b', 200, 0), mk('c', 400, 0)]);
  assert.equal(row[0].nav.right, 'b'); assert.equal(row[1].nav.left, 'a'); assert.equal(row[1].nav.right, 'c'); assert.equal(row[0].nav.up, undefined);
});

test('encode recipes: Blu-ray x264 and UHD x265 HDR10 flags', () => {
  const p = feature('BD'); const t = p.titles[0];
  const bd = bdVideoArgs(p, t, 25000, 'in.mov', 'out.h264', 2).join(' ');
  assert.match(bd, /bluray-compat=1/); assert.match(bd, /level=4\.1/); assert.match(bd, /-force_key_frames 0\.000,600\.000/);
  const u = feature('UHD'); const ux = uhdVideoArgs(u, u.titles[0], 60000, 'in.mov', 'out.hevc', 2).join(' ');
  assert.match(ux, /uhd-bd=1/); assert.match(ux, /transfer=smpte2084/); assert.match(ux, /master-display=G\(13250,34500\)/); assert.match(ux, /max-cll=1000,400/); assert.match(ux, /main10/);
  const jobs = planEncodes(p, () => 'src.mov', 'C:\\work');
  assert.equal(jobs.filter(j => j.kind === 'video').length, 4); assert.ok(jobs.some(j => j.args.includes('pcm_bluray')));
});

test('buildPackage writes BDMV navigation, backups, IG per menu, SUP, manifest', () => {
  const p = applyTemplate(feature('BD'), 'marquee');
  const px = solid(10, 10, [255, 255, 255, 255]);
  const pkg = buildPackage(p, {
    buttons: (_m, _b) => ({ normal: px, selected: px, activated: px }),
    panel: () => ({ x: 0, y: 890, img: solid(1920, 150, [0, 0, 0, 200]) }),
    cues: () => [{ startSec: 1, endSec: 3, image: quantize(px.data, 10, 10), x: 900, y: 950 }],
  }, { workDir: 'C:/disc', inputFor: () => 'src.mov' });
  const keys = [...pkg.files.keys()];
  for (const k of ['BDMV/index.bdmv', 'BDMV/MovieObject.bdmv', 'BDMV/PLAYLIST/00001.mpls', 'BDMV/BACKUP/index.bdmv', 'WORK/ig/popup.ig', 'WORK/BURN_JOB_SHEET.txt']) assert.ok(keys.includes(k), k);
  assert.ok(keys.some(k => /^WORK\/pgs\/00001_0_eng\.sup$/.test(k)));
  assert.equal(keys.filter(k => k.startsWith('WORK/ig/')).length, p.menus.length);
  assert.equal(pkg.ready, true);
  assert.equal(buildManifest({ ...p, destination: 'press-retail', mediumId: 'bd50' }).kind, 'press');
});
