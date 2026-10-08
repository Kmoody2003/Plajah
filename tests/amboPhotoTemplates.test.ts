// amboPhotoTemplates.test.ts — the Photo slide templates × every theme × every
// aspect lay out cleanly, take their photos from the fields, and hand every
// photo to a registered live drawer.
//
// Run (tsx is not installed here):
//   node node_modules/esbuild/bin/esbuild tests/amboPhotoTemplates.test.ts --bundle --platform=node --format=esm --outfile=<tmp>/photo.test.mjs
//   node --test <tmp>/photo.test.mjs
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { SLIDE_THEMES, buildSlideObjects, defaultFields, templateById } from '../services/ambo/slideTemplates/registry';
import { PHOTO_TEMPLATES } from '../services/ambo/slideTemplates/templatesPhoto';
import { resolvePhotoRef, sampleSvgUri, SAMPLE_COUNT } from '../services/ambo/slideTemplates/photoDrawers';
import { liveDrawer } from '../services/ambo/slideTemplates/live';
import { lay, maxLineWidth, objBox } from '../services/ambo/slideTemplates/layout';

const ASPECTS: Array<[string, number, number]> = [
  ['9:16', 1080, 1920], ['phone', 1170, 2532], ['4:5', 1080, 1350], ['3:4', 1536, 2048],
  ['4:3', 1440, 1080], ['5:4', 1350, 1080], ['16:9', 1920, 1080], ['16:10', 1920, 1200], ['4K', 3840, 2160],
  ['21:9', 2560, 1080], ['2.39:1', 2580, 1080], ['3:1', 3240, 1080], ['32:9', 3840, 1080], ['5:1', 5400, 1080],
  ['small 16:9', 640, 360],
];

describe('Ambo photo templates', () => {
  test('catalogue: ≥10 photo templates, registered, photo media, image fields', () => {
    assert.ok(PHOTO_TEMPLATES.length >= 10);
    for (const t of PHOTO_TEMPLATES) {
      assert.equal(t.category, 'Photo', t.id);
      assert.equal(t.media, 'photo', t.id);
      assert.ok(templateById(t.id) === t, `${t.id} registered`);
      assert.ok(t.fields.some(f => f.kind === 'image' || f.kind === 'images'), `${t.id} has an image field`);
    }
    for (const id of ['photo.well', 'photo.wall']) assert.ok(liveDrawer(id), id);
  });

  test('photo refs: samples, links, junk', () => {
    assert.equal(resolvePhotoRef('sample:3')?.sample, 3);
    assert.equal(resolvePhotoRef('sample:27')?.sample, 3);
    assert.equal(resolvePhotoRef('https://example.org/a.jpg')?.src, 'https://example.org/a.jpg');
    assert.equal(resolvePhotoRef('/media/a.png')?.src, '/media/a.png');
    for (const junk of ['', 'hello world', 'sample:3 extended edition', 'javascript:alert(1)', 'ftp://x']) assert.equal(resolvePhotoRef(junk), null, junk);
    for (let n = 1; n <= SAMPLE_COUNT; n++) {
      const uri = sampleSvgUri(n);
      assert.ok(uri.startsWith('data:image/svg+xml') && uri.length < 40000, `sample ${n} (${uri.length})`);
      assert.ok(decodeURIComponent(uri).includes('</svg>'));
    }
  });

  const problems: string[] = [];
  for (const t of PHOTO_TEMPLATES) for (const th of SLIDE_THEMES) for (const [name, W, H] of ASPECTS) {
    const tag = `${t.id} × ${th.id} × ${name}`;
    const objs = buildSlideObjects(t.id, th.id, defaultFields(t), W, H);
    if (!objs || !objs.length) { problems.push(`${tag}: no objects`); continue; }
    if (objs[0].templateRole !== 'GROUND') problems.push(`${tag}: first object is not the ground`);
    if (objs.length > 260) problems.push(`${tag}: ${objs.length} objects`);
    const L = lay(W, H), sx = W * .05, sy = H * .05;
    const lives = objs.filter(o => o.live);
    if (!lives.length) problems.push(`${tag}: no live photo objects`);
    for (const o of lives) if (!liveDrawer(o.live!.drawer)) problems.push(`${tag}: unregistered drawer ${o.live!.drawer}`);
    // Default fields carry sample photos: no empty wells.
    for (const o of lives) if (o.live!.drawer === 'photo.well' && !(o.live!.props as any).p) problems.push(`${tag}: empty well with default fields`);
    for (const o of objs) {
      const b = objBox(o);
      if (![b.x, b.y, b.w, b.h].every(Number.isFinite)) { problems.push(`${tag}: non-finite ${o.objectLabel}`); continue; }
      if (b.right < 0 || b.bottom < 0 || b.x > W || b.y > H) problems.push(`${tag}: ${o.objectLabel} entirely off-frame`);
      if (o.live && (b.w < L.u * 2 || b.h < L.u * 2)) problems.push(`${tag}: tiny photo ${Math.round(b.w)}×${Math.round(b.h)}`);
    }
    const texts = objs.filter(o => o.kind === 'TEXT' && (o.text || '').trim());
    for (const o of texts) {
      const lbl = o.objectLabel || 'text';
      if (o.x < sx - 1 || o.y < sy - 1 || o.x + o.w > W - sx + 1 || o.y + o.h > H - sy + 1) problems.push(`${tag}: "${lbl}" outside title-safe`);
      const mw = maxLineWidth(o), slack = o.textAlign === 'center' ? o.w * .02 + 2 : 2;
      if (mw > o.w + slack) problems.push(`${tag}: "${lbl}" line ${Math.round(mw)} wider than box ${Math.round(o.w)}`);
      if ((o.fontSize || 0) < L.u * .9) problems.push(`${tag}: "${lbl}" ${o.fontSize?.toFixed(1)}px too small`);
      if (o.amb) problems.push(`${tag}: "${lbl}" text moves`);
    }
    for (let i = 0; i < texts.length; i++) for (let j = i + 1; j < texts.length; j++) {
      const a = texts[i], b = texts[j];
      const aw = Math.min(a.w, maxLineWidth(a)), bw = Math.min(b.w, maxLineWidth(b));
      const ax = a.textAlign === 'center' ? a.x + (a.w - aw) / 2 : a.textAlign === 'right' ? a.x + a.w - aw : a.x;
      const bx = b.textAlign === 'center' ? b.x + (b.w - bw) / 2 : b.textAlign === 'right' ? b.x + b.w - bw : b.x;
      const ox = Math.min(ax + aw, bx + bw) - Math.max(ax, bx), oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      if (ox > 2 && oy > 2) problems.push(`${tag}: "${a.objectLabel}" overlaps "${b.objectLabel}"`);
    }
    // Words never sit on a photo (except the wall's plate, which is opaque).
    const wells = lives.filter(o => o.live!.drawer === 'photo.well');
    for (const o of texts) for (const w of wells) {
      const ox = Math.min(o.x + Math.min(o.w, maxLineWidth(o)), w.x + w.w) - Math.max(o.x, w.x), oy = Math.min(o.y + o.h, w.y + w.h) - Math.max(o.y, w.y);
      if (ox > 4 && oy > 4) { problems.push(`${tag}: "${o.objectLabel}" sits on a photo`); break; }
    }
  }
  test('every photo template × theme × aspect lays out cleanly', () => {
    assert.deepEqual(problems.slice(0, 60), [], `${problems.length} problems`);
  });

  test('long copy, empty photo lists and junk lines never throw or leave the frame', () => {
    const long = 'The grace of our Lord Jesus Christ, and the love of God, and the fellowship of the Holy Spirit be with you all, now and evermore';
    const issues: string[] = [];
    const variants: Array<(k: string, def: string, multi?: boolean) => string> = [
      (k, def, multi) => multi ? long : def + ' extended edition',
      (k, def) => /photo/i.test(k) ? '' : def,
      (k, def) => /photo/i.test(k) ? 'not a link\nsample:2\n\nhttps://example.org/a b.jpg' : def,
      (k, def) => /photo/i.test(k) ? Array.from({ length: 40 }, (_, i) => `sample:${i + 1}`).join('\n') : def,
    ];
    for (const th of SLIDE_THEMES) for (const t of PHOTO_TEMPLATES) for (const [name, W, H] of [ASPECTS[0], ASPECTS[4], ASPECTS[6], ASPECTS[12]]) for (const v of variants) {
      const fields = Object.fromEntries(t.fields.map(f => [f.key, v(f.key, f.default, f.multiline)]));
      const objs = buildSlideObjects(t.id, th.id, fields, W, H) || [];
      if (!objs.length) { issues.push(`${t.id} × ${th.id} ${name}: no objects`); continue; }
      if (objs.length > 260) issues.push(`${t.id} × ${th.id} ${name}: ${objs.length} objects`);
      for (const o of objs) if (o.kind === 'TEXT' && (o.y + o.h > H || o.x + o.w > W + 1 || o.x < -1 || o.y < -1)) issues.push(`${t.id} × ${th.id} ${name}: ${o.objectLabel}`);
    }
    assert.deepEqual(issues.slice(0, 40), [], `${issues.length} issues`);
  });
});
