// amboDataTemplates.test.ts — the Data (chart) slide templates: parser,
// formatting and scale maths; per-theme chart styles; every data template ×
// theme × aspect lays out to scale, in frame, with legible non-colliding
// labels; drawers run every frame of the animation without throwing.
//
// Run (tsx is not installed here):
//   node node_modules/esbuild/bin/esbuild tests/amboDataTemplates.test.ts --bundle --platform=node --format=esm --outfile=<tmp>/data.test.mjs
//   node --test <tmp>/data.test.mjs
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { parseData, parseNumber, numberIn, formatValue, formatDelta, niceScale, stepDecimals, parseMilestones, parseRatio, pick } from '../services/ambo/slideTemplates/dataParse';
import { DATA_TEMPLATES } from '../services/ambo/slideTemplates/templatesData';
import { chartStyle, contrast } from '../services/ambo/slideTemplates/chartStyle';
import { SLIDE_THEMES } from '../services/ambo/slideTemplates/themes';
import { lay, maxLineWidth, objBox } from '../services/ambo/slideTemplates/layout';
import { liveDrawer, type LiveEnv } from '../services/ambo/slideTemplates/live';
import { measureText } from '../services/tela/telaText';
import type { SlideObj, SlideTemplateDef } from '../services/ambo/slideTemplates/types';

const ASPECTS: Array<[string, number, number]> = [
  ['9:16', 1080, 1920], ['phone', 1170, 2532], ['4:5', 1080, 1350], ['4:3', 1440, 1080], ['16:9', 1920, 1080], ['16:10', 1920, 1200],
  ['4K', 3840, 2160], ['21:9', 2560, 1080], ['3:1', 3240, 1080], ['32:9', 3840, 1080], ['5:1', 5400, 1080], ['small 16:9', 640, 360],
];

function build(t: SlideTemplateDef, themeId: string, W: number, H: number, fields: Record<string, string> = {}): SlideObj[] {
  const th = SLIDE_THEMES.find(x => x.id === themeId)!;
  const f = { ...Object.fromEntries(t.fields.map(x => [x.key, x.default])), ...fields };
  return t.design({ W, H, L: lay(W, H), th, f, seed: 7 });
}

describe('dataParse', () => {
  test('numbers: commas, currency, percent, k/M, negatives, units', () => {
    assert.equal(parseNumber('1,240')!.value, 1240);
    assert.equal(parseNumber('$12,500')!.prefix, '$');
    assert.equal(parseNumber('$12,500')!.value, 12500);
    assert.equal(parseNumber('38%')!.percent, true);
    assert.equal(parseNumber('1.2k')!.value, 1200);
    assert.equal(parseNumber('$1.5M')!.value, 1.5e6);
    assert.equal(parseNumber('(200)')!.value, -200);
    assert.equal(parseNumber('−4.5')!.value, -4.5);
    assert.equal(parseNumber('3.25')!.decimals, 2);
    assert.equal(parseNumber('1,200 meals')!.suffix, ' meals');
    assert.equal(parseNumber('Kids'), null);
    assert.equal(parseNumber('12 Main St 4'), null);
    assert.equal(numberIn('250,000 extended edition'), 250000);
    assert.equal(numberIn('nothing'), null);
  });

  test('rows: separators, thousands, labels with commas, blank lines, header', () => {
    const ds = parseData('Month, This year, Last year\n\nJan, 1,240, 1,050\nFeb,1300,1100\n# comment\nYouth, Kids, 38\nMissions: $12,500\nRecovery — 44\nPrayer 16\n\t\nSpreadsheet\t2,000\t1,500');
    assert.deepEqual(ds.series, ['This year', 'Last year']);
    assert.deepEqual(ds.rows.map(r => r.label), ['Jan', 'Feb', 'Youth, Kids', 'Missions', 'Recovery', 'Prayer', 'Spreadsheet']);
    assert.deepEqual(ds.rows[0].values, [1240, 1050]);
    assert.deepEqual(ds.rows[1].values, [1300, 1100]);
    assert.deepEqual(ds.rows[2].values, [38]);
    assert.deepEqual(ds.rows[3].values, [12500]);
    assert.deepEqual(ds.rows[6].values, [2000, 1500]);
    assert.equal(ds.width, 2);
  });

  test('rows: a header of years becomes series names', () => {
    const ds = parseData(['Month, 2026, 2025', 'Jan, 1,840, 1,420', 'Feb, 1,910, 1,505'].join('\n'));
    assert.deepEqual(ds.series, ['2026', '2025']);
    assert.deepEqual(ds.rows.map(r => r.label), ['Jan', 'Feb']);
    assert.equal(parseData('Founded, 1998, 2001\nRenewed, 2014, 2020').rows.length, 2);
  });

  test('rows: unit inference, value-only lines, empty / junk degrade to no rows', () => {
    const pc = parseData('A, 20%\nB, 35%\nC, 45%');
    assert.equal(pc.suffix, '%');
    const cash = parseData('A, $1,000\nB, $2,500.50');
    assert.equal(cash.prefix, '$'); assert.equal(cash.decimals, 2);
    assert.equal(parseData('120\n140').rows[1].label, '#2');
    for (const junk of ['', '   \n\n', 'The grace of our Lord, and the love of God, and the fellowship']) assert.equal(parseData(junk).rows.length, 0);
    assert.equal(parseData(Array.from({ length: 40 }, (_, i) => `R${i}, ${i}`).join('\n')).rows.length, 24);
  });

  test('format + delta', () => {
    assert.equal(formatValue(1240), '1,240');
    assert.equal(formatValue(12500, { prefix: '$' }), '$12,500');
    assert.equal(formatValue(186400, { prefix: '$', compact: true }), '$186k');
    assert.equal(formatValue(2.5e6, { compact: true }), '2.5M');
    assert.equal(formatValue(38, { suffix: '%' }), '38%');
    assert.equal(formatValue(-4), '−4');
    assert.equal(formatValue(3.5, { decimals: 2 }), '3.50');
    assert.equal(formatDelta(48, 31, 'percent').text, '+55%');
    assert.equal(formatDelta(90, 100, 'percent').text, '−10%');
    assert.equal(formatDelta(126, 104, 'difference').text, '+22');
    assert.equal(formatDelta(5, 5, 'percent').dir, 0);
  });

  test('nice scales cover the data with round steps', () => {
    for (const [lo, hi] of [[0, 532], [0, 3150], [-40, 120], [0, 1], [0, 0], [0, 7.3], [0, 250000]]) {
      const s = niceScale(lo, hi, 5);
      assert.ok(s.lo <= Math.min(0, lo) && s.hi >= hi, `${lo}..${hi}`);
      assert.ok(s.ticks.length >= 2 && s.ticks.length <= 8, `${lo}..${hi}: ${s.ticks.length} ticks`);
      const m = s.step / Math.pow(10, Math.floor(Math.log10(s.step)));
      assert.ok([1, 2, 2.5, 5, 10].some(k => Math.abs(k - m) < 1e-9), `step ${s.step}`);
    }
    assert.equal(stepDecimals(2.5), 1); assert.equal(stepDecimals(100), 0);
  });

  test('milestones, ratios, select matching', () => {
    assert.deepEqual(parseMilestones('1998, Planted in a gym\n2006 — First building\nSpring 2024: New roof\nJust words'), [
      { when: '1998', what: 'Planted in a gym' }, { when: '2006', what: 'First building' }, { when: 'Spring 2024', what: 'New roof' }, { when: '', what: 'Just words' }]);
    assert.deepEqual(parseRatio('1 in 4'), { num: 1, den: 4, fraction: .25 });
    assert.equal(parseRatio('3 of 10')!.fraction, .3);
    assert.equal(parseRatio('38%')!.fraction, .38);
    assert.equal(parseRatio('3/4')!.den, 4);
    assert.equal(parseRatio('lots'), null);
    assert.equal(pick('Largest first extended edition', { desc: /large/, asc: /small/ }, 'asc'), 'desc');
    assert.equal(pick('', { desc: /large/, none: /none/ }, 'none'), 'none');
  });
});

describe('chart styles', () => {
  test('every theme gets a style whose marks read on its ground', () => {
    const flavors = new Set<string>();
    for (const th of SLIDE_THEMES) {
      const s = chartStyle(th);
      flavors.add(s.flavor);
      assert.ok(s.series.length >= 1, th.id);
      assert.ok(contrast(s.hi, th.c.ground) >= 1.9, `${th.id} highlight contrast`);
      for (const c of s.series) assert.ok(/^#[0-9a-f]{6}$/i.test(c), `${th.id} series colour ${c}`);
      assert.ok(contrast(s.valueInk, th.c.ground) >= 3, `${th.id} value ink`);
    }
    assert.ok(flavors.size >= 7, [...flavors].join(','));
    assert.equal(chartStyle(SLIDE_THEMES.find(t => t.id === 'swiss')!).mono, true);
    assert.ok(chartStyle(SLIDE_THEMES.find(t => t.id === 'night')!).glow > 0);
    assert.ok(chartStyle(SLIDE_THEMES.find(t => t.id === 'riso')!).misreg);
    assert.ok(chartStyle(SLIDE_THEMES.find(t => t.id === 'chalk')!).wobble > 0);
    assert.ok(chartStyle(SLIDE_THEMES.find(t => t.id === 'brutalist')!).slab);
  });
});

/** Rough box of a drawer text spec (estimate width in node). */
function specBox(sp: any, str: string) {
  const w = Math.min(sp.maxW, measureText(sp.font.upper ? str.toUpperCase() : str, { fontSize: sp.size, fontFamily: sp.font.family, fontWeight: sp.font.weight, letterSpacing: sp.font.track }));
  const x = sp.align === 'center' ? sp.x - w / 2 : sp.align === 'right' ? sp.x - w : sp.x;
  return { x, y: sp.y, w, h: sp.size };
}
function liveSpecs(o: SlideObj): Array<{ sp: any; v: number; dx?: number }> {
  const p: any = o.live?.props || {};
  const out: Array<{ sp: any; v: number }> = [];
  for (const b of p.bars || []) if (b.label) out.push({ sp: b.label, v: b.v });
  for (const s of p.series || []) for (const l of s.labels || []) out.push({ sp: l, v: l.v });
  if (p.total) out.push({ sp: p.total.spec, v: p.total.v });
  for (const it of p.items || []) out.push({ sp: it.spec, v: it.v });
  if (p.raised && !p.raised.ride) out.push({ sp: p.raised.spec, v: p.raised.v });
  for (const v of p.values || []) out.push({ sp: v.spec, v: v.v });
  return out;
}

describe('Data templates', () => {
  test('catalogue: ≥ 9 Data templates, all media data, data fields typed', () => {
    assert.ok(DATA_TEMPLATES.length >= 9);
    for (const t of DATA_TEMPLATES) {
      assert.equal(t.category, 'Data'); assert.equal(t.media, 'data');
      assert.ok(t.id.startsWith('data-'), t.id);
      for (const f of t.fields) if (f.kind === 'select') assert.ok(f.options?.includes(f.default), `${t.id}.${f.key} default in options`);
    }
    for (const id of ['data.bars', 'data.line', 'data.donut', 'data.kpis', 'data.goal', 'data.dumbbell', 'data.timeline', 'data.picto', 'data.stack']) assert.ok(liveDrawer(id), id);
  });

  const problems: string[] = [];
  for (const t of DATA_TEMPLATES) for (const th of SLIDE_THEMES) for (const [name, W, H] of ASPECTS) {
    const tag = `${t.id} × ${th.id} × ${name}`;
    let objs: SlideObj[];
    try { objs = build(t, th.id, W, H); } catch (e) { problems.push(`${tag}: threw ${(e as Error).message}`); continue; }
    if (objs[0]?.templateRole !== 'GROUND') problems.push(`${tag}: first object is not the ground`);
    if (objs.length > 260) problems.push(`${tag}: ${objs.length} objects`);
    const L = lay(W, H), sx = W * .05, sy = H * .05;
    const lives = objs.filter(o => o.live);
    if (!lives.length) problems.push(`${tag}: no live chart`);
    for (const o of objs) {
      const b = objBox(o);
      if (![b.x, b.y, b.w, b.h].every(Number.isFinite)) problems.push(`${tag}: non-finite ${o.objectLabel}`);
    }
    for (const o of lives) {
      const b = objBox(o);
      if (b.x < sx - 2 || b.y < sy - 2 || b.right > W - sx + 2 || b.bottom > H - sy + 2) problems.push(`${tag}: chart box ${o.objectLabel} leaves title-safe (${Math.round(b.x)},${Math.round(b.y)} ${Math.round(b.w)}×${Math.round(b.h)})`);
      for (const bar of ((o.live!.props as any).bars || [])) if (bar.x < sx - 2 || bar.x + bar.w > W - sx + 2 || bar.y < sy - 2 || bar.y + bar.h > H - sy + 2) { problems.push(`${tag}: bar off-frame`); break; }
    }
    const texts = objs.filter(o => o.kind === 'TEXT' && (o.text || '').trim() && o.templateRole !== 'ORNAMENT');
    for (const o of texts) {
      if (o.x < sx - 1 || o.y < sy - 1 || o.x + o.w > W - sx + 1 || o.y + o.h > H - sy + 1) problems.push(`${tag}: "${o.objectLabel}" outside title-safe`);
      if (maxLineWidth(o) > o.w + (o.textAlign === 'center' ? o.w * .02 + 2 : 2)) problems.push(`${tag}: "${o.objectLabel}" line wider than box`);
      if ((o.fontSize || 0) < L.u * .9) problems.push(`${tag}: "${o.objectLabel}" ${o.fontSize?.toFixed(1)}px too small`);
    }
    const tb = (o: SlideObj) => { const w = Math.min(o.w, maxLineWidth(o)); const x = o.textAlign === 'center' ? o.x + (o.w - w) / 2 : o.textAlign === 'right' ? o.x + o.w - w : o.x; return { x, y: o.y, w, h: o.h }; };
    const hit = (a: { x: number; y: number; w: number; h: number }, b: typeof a) => Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 2 && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 2;
    for (let i = 0; i < texts.length; i++) for (let j = i + 1; j < texts.length; j++) if (hit(tb(texts[i]), tb(texts[j]))) problems.push(`${tag}: "${texts[i].objectLabel}" overlaps "${texts[j].objectLabel}"`);
    // Drawn numbers: inside the frame, legible, clear of static words.
    const fmt = (o: SlideObj) => (o.live!.props as any).fmt || {};
    for (const o of lives) for (const { sp, v } of liveSpecs(o)) {
      const f = (o.live!.props as any).total?.fmt || (o.live!.props as any).raised?.fmt || fmt(o);
      const bb = specBox(sp, formatValue(v, f));
      if (bb.x < sx - 4 || bb.x + bb.w > W - sx + 4 || bb.y < sy - 4 || bb.y + bb.h > H - sy + 4) problems.push(`${tag}: drawn value ${formatValue(v, f)} off-frame`);
      if (sp.size < L.u * .9) problems.push(`${tag}: drawn value ${sp.size.toFixed(1)}px too small`);
      for (const t of texts) if (hit(bb, tb(t))) { problems.push(`${tag}: drawn value ${formatValue(v, f)} overlaps "${t.objectLabel}"`); break; }
    }
  }
  test('every data template × theme × aspect lays out cleanly', () => {
    if (process.env.DUMP) console.log(problems.join(String.fromCharCode(10)));
    assert.deepEqual(problems.slice(0, 40), [], `${problems.length} problems`);
  });

  test('empty, junk and huge data degrade to a designed placeholder', () => {
    const issues: string[] = [];
    for (const t of DATA_TEMPLATES) for (const [name, W, H] of [ASPECTS[0], ASPECTS[4], ASPECTS[9]]) for (const v of ['', 'just some words, no numbers', Array.from({ length: 30 }, (_, i) => `Category number ${i}, ${(i * 7919) % 1000}`).join('\n')]) {
      const fields: Record<string, string> = {};
      for (const f of t.fields) if (f.kind === 'data' || f.key === 'ratio' || f.key === 'raised' || f.key === 'goal') fields[f.key] = v;
      try {
        const objs = build(t, 'swiss', W, H, fields);
        if (!objs.some(o => o.live)) issues.push(`${t.id} ${name}: no chart`);
        for (const o of objs) if (o.kind === 'TEXT' && (o.y + o.h > H || o.x + o.w > W + 1 || o.x < -1 || o.y < -1)) issues.push(`${t.id} ${name}: ${o.objectLabel} off-frame`);
      } catch (e) { issues.push(`${t.id} ${name} "${v.slice(0, 12)}": threw ${(e as Error).message}`); }
    }
    assert.deepEqual(issues, []);
  });

  test('drawers run through entrance, hold and exit without throwing', () => {
    // A permissive fake 2D context: every method is a no-op, gradients/patterns are stubs.
    const noop = () => {};
    const grad = { addColorStop: noop };
    const ctx: any = new Proxy({ measureText: (s: string) => ({ width: s.length * 10 }), createLinearGradient: () => grad, createRadialGradient: () => grad, createPattern: () => null, letterSpacing: '0px' }, {
      get: (t, k) => (k in t ? (t as any)[k] : noop), set: (t, k, v) => { (t as any)[k] = v; return true; },
    });
    const errs: string[] = [];
    for (const t of DATA_TEMPLATES) for (const thId of ['sanctuary', 'swiss', 'memphis', 'riso', 'chalk', 'night', 'brutalist', 'glass']) {
      const th = SLIDE_THEMES.find(x => x.id === thId)!;
      const objs = build(t, thId, 1920, 1080);
      for (const o of objs.filter(o => o.live)) {
        const fn = liveDrawer(o.live!.drawer)!;
        for (const sec of [-1, 0, .2, .6, 1.2, 2, 3.5, 9]) for (const exitP of [0, .5]) {
          const env: LiveEnv = { t: sec + 5, th, W: 1920, H: 1080, alpha: 1, reduced: false, host: { id: 'x', audible: false, templateId: t.id, fields: {}, w: 1920, h: 1080, shownSec: sec, exitP, requestLive: noop } };
          try { fn(ctx, o, env); } catch (e) { errs.push(`${t.id}/${thId} @${sec}: ${(e as Error).message}`); }
        }
        // gallery path (no host): alpha ramps up then falls
        for (const [tt, a] of [[0, 0], [.1, .4], [.3, 1], [2, 1], [4, .5], [4.2, 0]]) {
          try { fn(ctx, o, { t: tt, th, W: 1920, H: 1080, alpha: a, reduced: false }); } catch (e) { errs.push(`${t.id}/${thId} gallery: ${(e as Error).message}`); }
        }
        try { fn(ctx, o, { t: 0, th, W: 1920, H: 1080, alpha: 1, reduced: true }); } catch (e) { errs.push(`${t.id} reduced: ${(e as Error).message}`); }
      }
    }
    assert.deepEqual(errs, []);
  });
});
