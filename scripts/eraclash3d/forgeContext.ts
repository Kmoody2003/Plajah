/**
 * forgeContext.ts — the Forge's context stage: who this character is, before anything is built.
 *
 *   FORGE_SPEC=… npx tsx scripts/eraclash3d/forgeContext.ts [--offline]
 *
 * 1. Recognise. The evidence is what the Forge already holds: the kit's pieces, the flat-lay's item ids, the spec's
 *    words (and an optional "context" block in forge.json to confirm or override). Scored against the Heritage Codex
 *    (services/argilla/heritage/codex.ts), that gives an archetype (a warrior) and a tradition (Sengoku Japan), each
 *    with its confidence and the cues that decided it.
 * 2. Resolve. The tradition names the arms that belong; each the character shows (or whose companion it implies)
 *    is read from the codex: dimensions, construction, fittings, materials, how it is carried, how it behaves.
 * 3. Measure. Where the flat-lay shows an arm, its proportions (hilt to blade, scabbard to blade), its colours (wrap,
 *    ray skin, fittings, lacquer) and its features (a bo-hi groove, an irregular hamon) are read from the picture, then
 *    held inside the codex's historical range; anything the art asks for outside the record is reported, not obeyed.
 * 4. Anchor. Plajah's museum layer (services/museum: the Met, Cleveland, the Art Institute, Japan Search, …) is searched
 *    for period objects, and their recorded materials tallied; the Combat Atlas gives the fighting arts that teach how
 *    these people moved.
 *
 * Writes the spec folder's context.json, which build (body bounds, bearing, the arms and how they are worn),
 * fit-body (bounds) and the report read.
 */
import fs from 'node:fs';
import { PNG } from 'pngjs';
import { ARCHETYPES, TRADITIONS, ARMS_BY_ID, ARMS_ALIASES, recognise, type Range } from '../../services/argilla/heritage/codex';
import { kitPieces } from '../../services/argilla/creature/wardrobe';
import { COMBAT_ARTS } from '../../data/combatAtlasData';
import { spec, dataFile } from './forgeSpec';

const OFFLINE = process.argv.includes('--offline');
const FILE = dataFile('context.json');
const prev = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, 'utf8')) : null;
const hints = (spec as unknown as { context?: { archetype?: string; tradition?: string; words?: string[]; worn?: string[] } }).context ?? {};
const log = (s: string) => console.log(`[context] ${s}`);

// ---- 1. Recognise ----------------------------------------------------------------------------------------------------
const pieces = kitPieces(spec.kit);
const intake = fs.existsSync(dataFile('intake.json')) ? JSON.parse(fs.readFileSync(dataFile('intake.json'), 'utf8')) : {};
const flatIds: string[] = (intake.flatLay ?? []).map((p: { id: string }) => p.id);
const words = [
  ...(typeof spec.kit === 'string' ? [spec.kit] : spec.kit.preset ? [spec.kit.preset] : []),
  ...pieces, ...flatIds, ...flatIds.flatMap((id) => id.split('_')),
  ...`${spec.name} ${spec.note ?? ''}`.toLowerCase().split(/[^a-z-]+/),
  ...(hints.words ?? []),
].filter(Boolean);
const archetypes = recognise(ARCHETYPES, words);
const traditions = recognise(TRADITIONS, words);
const pick = <T extends { id: string }>(ranked: { id: string; confidence: number; matched: string[] }[], forced: string | undefined, all: T[]) => {
  const r = forced ? { id: forced, confidence: 1, matched: ['spec context'] } : ranked[0];
  return { item: all.find((x) => x.id === r.id)!, confidence: r.confidence, matched: r.matched, runnerUp: ranked[1] && { id: ranked[1].id, confidence: ranked[1].confidence } };
};
const arch = pick(archetypes, hints.archetype, ARCHETYPES);
const trad = pick(traditions, hints.tradition, TRADITIONS);
log(`archetype ${arch.item.id} (${Math.round(arch.confidence * 100)}%: ${arch.matched.join(', ')})`);
log(`tradition ${trad.item.id}, ${trad.item.culture}, ${trad.item.era} ${trad.item.years.join('–')} (${Math.round(trad.confidence * 100)}%: ${trad.matched.join(', ')})`);

// ---- 2. Resolve the arms -----------------------------------------------------------------------------------------------
// shown: in the kit (worn in the turnaround) or in the flat-lay (owned); companions the tradition implies
const wornIds = new Set((hints.worn ?? pieces).map((p) => ARMS_ALIASES[p]).filter(Boolean));
const ownedIds = new Set(flatIds.map((p) => ARMS_ALIASES[p]).filter(Boolean));
const armsIds = new Set([...wornIds, ...ownedIds]);
const companions: { adds: string; with: string; note: string; present: boolean }[] = [];
for (const c of trad.item.companions) if (armsIds.has(c.with)) {
  companions.push({ ...c, present: armsIds.has(c.adds) || c.adds === 'sageo' });
  if (ARMS_BY_ID[c.adds]) armsIds.add(c.adds);
}

// ---- 3. Measure from the flat-lay ------------------------------------------------------------------------------------
type RGB = [number, number, number];
const flat = spec.art.flatLay && fs.existsSync(spec.art.flatLay) ? PNG.sync.read(fs.readFileSync(spec.art.flatLay)) : null;
const boxOf = (id: string): [number, number, number, number] | undefined => (intake.flatLay ?? []).find((p: { id: string }) => p.id === id)?.box;
const px = (x: number, y: number): RGB => { const i = (y * flat!.width + x) * 4; return [flat!.data[i], flat!.data[i + 1], flat!.data[i + 2]]; };
const lum = (c: RGB) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
const toLin = (c: number) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const median = (cs: RGB[]): RGB | undefined => {
  if (cs.length < 30) return undefined;
  const m = (k: number) => cs.map((c) => c[k]).sort((a, b) => a - b)[cs.length >> 1];
  return [toLin(m(0)), toLin(m(1)), toLin(m(2))].map((v) => +v.toFixed(4)) as RGB;
};

interface Measured { tsukaRatio?: number; sayaRatio?: number; sheathed?: boolean; colours: Record<string, RGB>; features: Record<string, boolean | string>; notes: string[] }
/** Read a laid-out sword: hilt on the left, blade to the right (forgeKitPaint's "blade" layout). */
function measureSword(bladeId: string, sayaId: string | undefined): Measured {
  const out: Measured = { colours: {}, features: {}, notes: [] };
  const box = boxOf(bladeId);
  if (!flat || !box) { out.notes.push(`no flat-lay picture of the ${bladeId}: the codex's typical proportions`); return out; }
  // the background is the corners' colour; the sword is what differs from it
  const [x0, y0, x1, y1] = box;
  const bg = median([px(x0, y0), px(x1 - 1, y0), px(x0, y1 - 1), px(x1 - 1, y1 - 1), ...Array.from({ length: 40 }, (_, k) => px(x0 + k, y0))].map((c) => c)) ?? [0.8, 0.8, 0.8];
  const bgS = bg.map((v) => 255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055));
  const isObj = (c: RGB) => Math.hypot(c[0] - bgS[0], c[1] - bgS[1], c[2] - bgS[2]) > 38;
  const colTop: number[] = [], colBot: number[] = [];
  for (let x = x0; x < x1; x++) {
    // the longest run of the object down the column (a neighbour's edge creeping into the box is not it)
    let t = -1, b = -1, rs = -1, gap = 0;
    for (let y = y0; y <= y1; y++) {
      const on = y < y1 && isObj(px(x, y));
      if (on) { if (rs < 0) rs = y; gap = 0; continue; }
      if (rs >= 0 && ++gap > 3) { const re = y - gap; if (re - rs > b - t) { t = rs; b = re; } rs = -1; gap = 0; }
    }
    if (rs >= 0 && y1 - rs > b - t) { t = rs; b = y1 - 1; }
    colTop.push(t); colBot.push(b);
  }
  const xs = colTop.map((t, i) => (t >= 0 ? i : -1)).filter((i) => i >= 0);
  if (xs.length < 50) { out.notes.push(`${bladeId}: could not find the sword in its flat-lay box`); return out; }
  const left = xs[0], right = xs[xs.length - 1];
  // laid out sheathed (dark lacquer where a bare blade shows steel)? then the sageo's knot stands taller than the guard,
  // so the guard is looked for nearer the hilt
  // (urushi over the scabbard is tinted, here blue-black, where steel is neutral grey: the mean blue-over-red of the
  // dark pixels tells them apart; a drop shadow is light, so it does not count)
  let tint = 0, nt = 0;
  for (let i = left + Math.round((right - left) * 0.6); i < right - 5; i += 3) if (colTop[i] >= 0)
    for (let y = colTop[i]; y <= colBot[i]; y++) { const c = px(x0 + i, y); if (lum(c) < 120) { tint += c[2] - c[0]; nt++; } }
  out.sheathed = nt > 40 && tint / nt > 10;
  // the tsuba: the tallest column in the hilt half (the hilt's 40% when sheathed)
  let tsubaX = left, tall = 0;
  for (let i = left; i < left + (right - left) * (out.sheathed ? 0.4 : 0.5); i++) { const h = colBot[i] - colTop[i]; if (colTop[i] >= 0 && h > tall) { tall = h; tsubaX = i; } }
  const tsukaPx = tsubaX - left, bladePx = right - tsubaX;
  out.tsukaRatio = +(tsukaPx / bladePx).toFixed(3);
  // colours along the hilt's core rows: dark = the wrap, light = ray skin in the diamonds, gold = fittings
  const ito: RGB[] = [], same: RGB[] = [], gold: RGB[] = [], steel: RGB[] = [];
  for (let i = left + 4; i < tsubaX - 4; i++) {
    const t = colTop[i], b = colBot[i]; if (t < 0) continue;
    const mid = (t + b) / 2, half = (b - t) * 0.3;
    for (let y = Math.round(mid - half); y <= mid + half; y++) {
      const c = px(x0 + i, y);
      if (!isObj(c) && lum(c) < 200) continue;
      const sat = Math.max(...c) - Math.min(...c);
      if (c[0] > c[2] + 40 && c[1] > c[2] + 15 && lum(c) > 70) gold.push(c);
      else if (lum(c) < 70) ito.push(c);
      else if (lum(c) > 150 && sat < 70) same.push(c);
    }
  }
  if (out.sheathed) { out.notes.push(`${bladeId} is laid out sheathed: its hilt measured against the scabbard; the blade's features are not seen`); set2(); return out; }
  function set2() { if (median(ito)) out.colours.ito = median(ito)!; if (median(same)) out.colours.same = median(same)!; if (median(gold)) out.colours.fittings = median(gold)!; }
  for (let i = tsubaX + Math.round(bladePx * 0.2); i < tsubaX + bladePx * 0.7; i++) {
    const t = colTop[i], b = colBot[i]; if (t < 0) continue;
    for (let y = t + 1; y < b; y++) steel.push(px(x0 + i, y));
  }
  const set = (k: string, c: RGB | undefined) => { if (c) out.colours[k] = c; };
  set('ito', median(ito)); set('same', median(same)); set('fittings', median(gold)); set('steel', median(steel));
  // features along the blade: a bo-hi is a thin dark line holding its place near the back in most columns; the hamon's
  // line (bright edge band against the darker ji) is irregular (midare) when its position wanders
  let hiCols = 0, cols = 0; const hamonPos: number[] = [];
  for (let i = tsubaX + Math.round(bladePx * 0.12); i < tsubaX + bladePx * 0.62; i++) {
    const t = colTop[i], b = colBot[i]; if (t < 0 || b - t < 8) continue;
    cols++;
    const prof: number[] = []; for (let y = t; y <= b; y++) prof.push(lum(px(x0 + i, y)));
    const n = prof.length;
    // hi: a local minimum in the back half, darker than both neighbours two pixels away by 22+
    for (let k = 2; k < n * 0.55; k++) if (prof[k] + 22 < prof[k - 2] && prof[k] + 22 < prof[Math.min(n - 1, k + 2)]) { hiCols++; break; }
    // hamon: the steepest rise in the edge half (ji darker above, ha brighter below)
    let best = 0, at = 0; for (let k = Math.floor(n * 0.4); k < n - 2; k++) { const d = prof[k + 2] - prof[k]; if (d > best) { best = d; at = k / n; } }
    if (best > 18) hamonPos.push(at);
  }
  if (cols) {
    out.features.bohi = hiCols / cols > 0.5;
    if (hamonPos.length > cols * 0.4) {
      const m = hamonPos.reduce((a, b) => a + b, 0) / hamonPos.length;
      const sd = Math.sqrt(hamonPos.reduce((a, b) => a + (b - m) ** 2, 0) / hamonPos.length);
      out.features.hamon = sd > 0.045 ? 'midare' : sd > 0.02 ? 'notare' : 'suguha';
      out.features.hamonDepth = String(+(1 - m).toFixed(3));
    }
  }
  // the scabbard, laid out beside it: its length against the blade's
  const sb = sayaId ? boxOf(sayaId) : undefined;
  if (sb) {
    const [sx0, sy0, sx1, sy1] = sb;
    let l = -1, r = -1; const lac: RGB[] = [];
    for (let x = sx0; x < sx1; x++) {
      let any = false;
      for (let y = sy0; y < sy1; y += 2) { const c = px(x, y); if (isObj(c)) { any = true; if (lum(c) < 60) lac.push(c); } }
      if (any) { if (l < 0) l = x; r = x; }
    }
    if (l >= 0) out.sayaRatio = +((r - l) / bladePx).toFixed(3);
    set('saya', median(lac));
  }
  return out;
}

const clampTo = (v: number, r: Range, what: string, notes: string[]) => {
  if (v < r[0] || v > r[2]) { notes.push(`${what} ${v.toFixed(3)} m from the art is outside the record (${r[0]}–${r[2]} m): held at ${Math.min(r[2], Math.max(r[0], v)).toFixed(3)}`); return Math.min(r[2], Math.max(r[0], v)); }
  return v;
};

const arms = [...armsIds].map((id) => {
  const a = ARMS_BY_ID[id];
  if (!a) return { id, missing: true, note: `${id} belongs to ${trad.item.id} but the codex has no entry for it yet` };
  const flatKey = flatIds.find((f) => ARMS_ALIASES[f] === id && !/saya/.test(f));
  const sayaKey = flatIds.find((f) => ARMS_ALIASES[f] === id && /saya/.test(f));
  const m = flatKey ? measureSword(flatKey, sayaKey) : { colours: {}, features: {}, notes: [`no flat-lay of the ${id}`] } as Measured;
  const typ = (k: string) => a.dims[k][1];
  const dims: Record<string, number> = Object.fromEntries(Object.keys(a.dims).map((k) => [k, typ(k)]));
  // the blade's length is the record's typical one (a flat-lay has no scale); the rest follow the art's proportions
  // (sheathed, the hilt was measured against the scabbard, which is the blade and the habaki's seat)
  if (m.tsukaRatio) dims.tsuka = +clampTo((m.sheathed ? dims.saya : dims.nagasa) * m.tsukaRatio, a.dims.tsuka, `${id} tsuka`, m.notes).toFixed(3);
  if (m.sayaRatio) dims.saya = +clampTo(dims.nagasa * m.sayaRatio + 0.03, a.dims.saya, `${id} saya`, m.notes).toFixed(3);
  // physics before pictures: the blade has to fit its scabbard, the habaki seated in the koiguchi
  const fitIn = +(dims.nagasa + 0.035).toFixed(3);
  if (dims.saya < fitIn) { m.notes.push(`${id} saya ${dims.saya} m cannot hold a ${dims.nagasa} m blade: lengthened to ${fitIn} m`); dims.saya = fitIn; }
  const role = wornIds.has(id) ? 'worn' : ownedIds.has(id) ? 'kit' : 'implied';
  return {
    id, label: a.label, role, period: a.period, builder: a.builder,
    why: role === 'worn' ? 'the turnaround wears it' : role === 'kit' ? 'the flat-lay has it; the turnaround does not wear it' : `a companion of the ${companions.find((c) => c.adds === id)?.with}`,
    dims, measured: { tsukaRatio: m.tsukaRatio, sayaRatio: m.sayaRatio }, colours: m.colours,
    features: { bohi: false, hamon: 'notare', ...m.features }, notes: m.notes,
    construction: a.construction, fittings: a.fittings, materials: a.materials, carry: a.carry, behaviour: a.behaviour, sources: a.sources,
  };
});
for (const a of arms) log(`arm ${a.id}: ${'missing' in a ? a.note : `${a.role} (${a.why}); ${JSON.stringify(a.dims)} ${JSON.stringify(a.features)}${a.notes.length ? ` — ${a.notes.join('; ')}` : ''}`}`);

// ---- 4. Anchor: museum objects and the Combat Atlas ------------------------------------------------------------------
const MATERIAL_WORDS = ['steel', 'iron', 'copper', 'gold', 'silver', 'shakudo', 'shibuichi', 'brass', 'bronze', 'lacquer', 'wood', 'silk', 'ray skin', 'same', 'shagreen', 'horn', 'leather', 'cotton', 'hemp', 'bamboo', 'paper', 'rawhide'];
async function museum() {
  if (OFFLINE) return prev?.museum ?? { objects: [], materials: {}, note: 'offline' };
  const { searchMuseums, SOURCE_LABEL } = await import('../../services/museum');
  const objects: Record<string, unknown>[] = []; const seen = new Set<string>();
  for (const q of trad.item.museum) {
    try {
      const rs = await searchMuseums(q, { limit: 6, signal: AbortSignal.timeout(20000) });
      for (const r of rs) {
        if (seen.has(r.id)) continue; seen.add(r.id);
        objects.push({ q, title: r.title, date: r.date, culture: r.culture, medium: r.medium, museum: SOURCE_LABEL[r.source] ?? r.source, url: r.sourceUrl, image: r.thumbUrl || r.imageUrl });
      }
      log(`museum · ${q}: ${rs.length}`);
    } catch (e) { log(`museum · ${q}: failed (${(e as Error).message})`); }
  }
  if (!objects.length && prev?.museum?.objects?.length) return { ...prev.museum, note: 'search failed; kept the last results' };
  const materials: Record<string, number> = {};
  for (const o of objects) { const md = String(o.medium ?? '').toLowerCase(); for (const w of MATERIAL_WORDS) if (md.includes(w)) materials[w] = (materials[w] ?? 0) + 1; }
  return { searched: new Date().toISOString().slice(0, 10), objects, materials: Object.fromEntries(Object.entries(materials).sort((a, b) => b[1] - a[1])) };
}
const atlas = trad.item.atlas.map((id) => COMBAT_ARTS.find((c) => c.id === id)).filter(Boolean).map((c) => ({
  id: c!.id, code: c!.code, name: c!.name, era: c!.era, form: c!.form, lede: c!.lede, technique: c!.technique.split(/(?<=\.)\s/)[0],
}));

const mus = await museum();
const ctx = {
  note: 'Written by forge context (forgeContext.ts) from the Heritage Codex, the flat-lay, Plajah\'s museum layer and the Combat Atlas. Confirm or override with a "context" block in forge.json.',
  recognised: {
    archetype: { id: arch.item.id, label: arch.item.label, confidence: arch.confidence, cues: arch.matched, runnerUp: arch.runnerUp },
    tradition: { id: trad.item.id, culture: trad.item.culture, era: trad.item.era, years: trad.item.years, confidence: trad.confidence, cues: trad.matched, runnerUp: trad.runnerUp },
  },
  body: { bounds: arch.item.body, why: `${arch.item.label}: the anatomy's sliders are searched inside these` },
  bearing: arch.item.bearing,
  studies: arch.item.studies,
  arms, companions, wear: trad.item.wear,
  museum: mus,
  atlas,
  sources: [...trad.item.sources],
};
fs.writeFileSync(FILE, JSON.stringify(ctx, null, 2));
log(`museum: ${mus.objects?.length ?? 0} objects; materials ${JSON.stringify(mus.materials ?? {})}`);
log(`atlas: ${atlas.map((a) => a.name).join(', ')}`);
log(`wrote ${FILE}`);
