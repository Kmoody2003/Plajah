// amboSlideTemplates.test.ts — every Ambo slide template × theme × aspect
// produces a sane, legible, in-frame design.
//
// Run (tsx is not installed here):
//   node node_modules/esbuild/bin/esbuild tests/amboSlideTemplates.test.ts --bundle --platform=node --format=esm --outfile=<tmp>/slideTemplates.test.mjs
//   node --test <tmp>/slideTemplates.test.mjs
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { SLIDE_TEMPLATES, SLIDE_THEMES, buildSlideObjects, defaultFields } from '../services/ambo/slideTemplates/registry';
import { lay, maxLineWidth, objBox } from '../services/ambo/slideTemplates/layout';
import { luminance } from '../services/tela/templateKit';

const ASPECTS: Array<[string, number, number]> = [
  ['9:16', 1080, 1920], ['phone', 1170, 2532], ['4:5', 1080, 1350], ['3:4', 1536, 2048],
  ['4:3', 1440, 1080], ['5:4', 1350, 1080], ['16:9', 1920, 1080], ['16:10', 1920, 1200], ['4K', 3840, 2160],
  ['21:9', 2560, 1080], ['2.39:1', 2580, 1080], ['3:1', 3240, 1080], ['32:9', 3840, 1080], ['5:1', 5400, 1080],
  ['small 16:9', 640, 360],
];

const contrast = (a: string, b: string) => { const la = luminance(a), lb = luminance(b); return (Math.max(la, lb) + .05) / (Math.min(la, lb) + .05); };

describe('Ambo slide templates', () => {
  test('catalogue: 16 templates, ≥6 themes, every theme credited to an Art Council director', () => {
    assert.ok(SLIDE_TEMPLATES.length >= 16);
    assert.ok(SLIDE_THEMES.length >= 6);
    const directors = new Set(SLIDE_THEMES.map(t => t.director));
    for (const d of ['the Classical Mind', 'the Rebellious Hand', 'the Futurist', 'the World-Eclectic Traveler', 'the Baroque Dramatist', 'the Radical Minimalist']) assert.ok(directors.has(d), d);
    assert.equal(new Set(SLIDE_TEMPLATES.map(t => t.id)).size, SLIDE_TEMPLATES.length);
    for (const t of SLIDE_TEMPLATES) assert.ok(t.fields.length > 0 && t.fields.every(f => f.key && f.label), t.id);
  });

  test('theme ink contrast ≥ 4.5 and muted ≥ 3 on the ground', () => {
    for (const th of SLIDE_THEMES) {
      assert.ok(contrast(th.c.ink, th.c.ground) >= 4.5, `${th.id} ink`);
      assert.ok(contrast(th.c.muted, th.c.ground) >= 3, `${th.id} muted`);
      assert.ok(contrast(th.c.accent, th.c.ground) >= 3, `${th.id} accent`);
      if (!th.c.panel.startsWith('rgba')) assert.ok(contrast(th.c.panelInk, th.c.panel) >= 4.5, `${th.id} panel ink`);
    }
  });

  const problems: string[] = [];
  let builds = 0;
  for (const t of SLIDE_TEMPLATES) for (const th of SLIDE_THEMES) for (const [name, W, H] of ASPECTS) {
    builds++;
    const tag = `${t.id} × ${th.id} × ${name}`;
    const objs = buildSlideObjects(t.id, th.id, defaultFields(t), W, H);
    if (!objs || !objs.length) { problems.push(`${tag}: no objects`); continue; }
    if (objs[0].templateRole !== 'GROUND') problems.push(`${tag}: first object is not the ground`);
    if (objs.length > 260) problems.push(`${tag}: ${objs.length} objects`);
    const L = lay(W, H);
    const sx = W * .05, sy = H * .05; // title-safe (5 %) — designers use a deeper margin
    const texts = objs.filter(o => o.kind === 'TEXT');
    for (const o of objs) {
      const b = objBox(o);
      if (![b.x, b.y, b.w, b.h].every(Number.isFinite)) { problems.push(`${tag}: non-finite ${o.objectLabel}`); continue; }
      if (b.right < 0 || b.bottom < 0 || b.x > W || b.y > H) problems.push(`${tag}: ${o.objectLabel} entirely off-frame`);
    }
    for (const o of texts) {
      if (!(o.text || '').trim()) continue;
      const lbl = o.objectLabel || 'text';
      const tol = 1;
      if (o.x < sx - tol || o.y < sy - tol || o.x + o.w > W - sx + tol || o.y + o.h > H - sy + tol) problems.push(`${tag}: "${lbl}" outside title-safe (${Math.round(o.x)},${Math.round(o.y)} ${Math.round(o.w)}×${Math.round(o.h)})`);
      if (o.wrap !== false || o.templateRole !== 'ORNAMENT') {
        const mw = maxLineWidth(o);
        const slack = o.textAlign === 'center' ? o.w * .02 + 2 : 2;
        if (mw > o.w + slack && lbl !== 'Quotation mark') problems.push(`${tag}: "${lbl}" line ${Math.round(mw)} wider than box ${Math.round(o.w)}`);
      }
      const minSize = L.u * .9; // relative: projected type scales with the output
      if ((o.fontSize || 0) < minSize && lbl !== 'Image slot hint') problems.push(`${tag}: "${lbl}" ${o.fontSize?.toFixed(1)}px too small`);
    }
    // Words sitting on an opaque panel must contrast with the panel, not the page.
    const panels = objs.filter(o => o.kind === 'RECT' && o.objectLabel === 'Panel' && /^#[0-9a-f]{6}$/i.test(o.fill));
    for (const p of panels) for (const o of texts) {
      const cx = o.x + o.w / 2, cy = o.y + o.h / 2;
      if (cx > p.x && cx < p.x + p.w && cy > p.y && cy < p.y + p.h && /^#[0-9a-f]{6}$/i.test(o.fill) && o.templateRole !== 'ORNAMENT' && contrast(o.fill, p.fill) < 3)
        problems.push(`${tag}: "${o.objectLabel}" low contrast on panel`);
    }
    // Readable text must not collide with other readable text.
    const readable = texts.filter(o => o.templateRole !== 'ORNAMENT' && o.objectLabel !== 'Image slot hint' && (o.text || '').trim());
    for (let i = 0; i < readable.length; i++) for (let j = i + 1; j < readable.length; j++) {
      const a = readable[i], b = readable[j];
      const aw = Math.min(a.w, maxLineWidth(a)), bw = Math.min(b.w, maxLineWidth(b));
      const ax = a.textAlign === 'center' ? a.x + (a.w - aw) / 2 : a.textAlign === 'right' ? a.x + a.w - aw : a.x;
      const bx = b.textAlign === 'center' ? b.x + (b.w - bw) / 2 : b.textAlign === 'right' ? b.x + b.w - bw : b.x;
      const ox = Math.min(ax + aw, bx + bw) - Math.max(ax, bx), oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      if (ox > 2 && oy > 2) problems.push(`${tag}: "${a.objectLabel}" overlaps "${b.objectLabel}"`);
    }
  }
  test(`every template × theme × aspect lays out cleanly (${SLIDE_TEMPLATES.length * SLIDE_THEMES.length * ASPECTS.length} builds)`, () => {
    assert.ok(builds > 0);
    assert.deepEqual(problems.slice(0, 60), [], `${problems.length} problems`);
  });

  test('unknown template / bad size returns null instead of throwing', () => {
    assert.equal(buildSlideObjects('nope', 'sanctuary', {}, 1920, 1080), null);
    assert.equal(buildSlideObjects('welcome', 'sanctuary', {}, 0, 1080), null);
  });

  test('long copy still fits (stress fields)', () => {
    const long = 'The grace of our Lord Jesus Christ, and the love of God, and the fellowship of the Holy Spirit be with you all, now and evermore';
    const issues: string[] = [];
    for (const t of SLIDE_TEMPLATES) for (const [name, W, H] of [ASPECTS[0], ASPECTS[6], ASPECTS[12]]) {
      const fields = Object.fromEntries(t.fields.map(f => [f.key, f.key.toLowerCase().includes('url') ? '' : f.multiline ? long : f.default + ' extended edition']));
      const objs = buildSlideObjects(t.id, 'youth', fields, W, H) || [];
      for (const o of objs) if (o.kind === 'TEXT' && (o.y + o.h > H || o.x + o.w > W + 1 || o.x < -1 || o.y < -1)) issues.push(`${t.id} ${name}: ${o.objectLabel}`);
    }
    assert.deepEqual(issues, []);
  });
});
