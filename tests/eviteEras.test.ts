// Design eras evites — one procedural invitation per Tela design-history era (services/evite/eraEvites.ts).
// Run: npx tsx --test tests/eviteEras.test.ts
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { ERA_DESIGNS } from '../services/tela/designs/eras';
import { ERA_EVITE_IDS, ERA_EVITE_EXCLUDED, isEraId, eraIdOf, eraPlateId } from '../services/evite/eraIds';
import { ERA_EVITES, eraEvite, eraPlateSvg, eraDepthSvg, eraLayers, eraMotion, eraVoice, PLATE_W, PLATE_H } from '../services/evite/eraEvites';
import { ERA_PLATES } from '../services/evite/eraPlates';
import { cleanLook } from '../services/evite/eviteCore';
import { registerEviteRoutes } from '../services/evite/eviteServer';

const colours = (svg: string) => [...svg.matchAll(/(?:fill|stroke|stop-color|flood-color)="([^"]+)"/g)].map(m => m[1]);

describe('the collection', () => {
  test('every era with a Tela designer ships an evite, or is excluded with a reason', () => {
    for (const eraId of Object.keys(ERA_DESIGNS)) {
      const shipped = isEraId(`era/${eraId}`), excluded = !!ERA_EVITE_EXCLUDED[eraId];
      assert.ok(shipped !== excluded, `${eraId}: must be exactly one of shipped / excluded`);
      if (excluded) assert.ok(ERA_EVITE_EXCLUDED[eraId].length > 30, `${eraId}: exclusion needs a real reason`);
    }
    assert.deepEqual([...ERA_EVITE_IDS].sort(), Object.keys(ERA_PLATES).sort(), 'eraIds.ts and eraPlates.ts list the same eras');
    assert.equal(ERA_EVITES.length, ERA_EVITE_IDS.length);
    assert.ok(ERA_EVITES.length >= 40, `expected ~45 eras, got ${ERA_EVITES.length}`);
  });

  test('ids: "era/<eraId>", nothing else', () => {
    assert.equal(isEraId('era/art-deco'), true);
    assert.equal(eraIdOf('era/bauhaus'), 'bauhaus');
    assert.equal(eraPlateId('memphis'), 'era/memphis');
    for (const bad of ['art-deco', 'era/', 'era/nope', 'era/indigenous-contemporary', 'kids_boy/dino', 'theme:abc', null, undefined, 42, 'era/art-deco/x']) assert.equal(isEraId(bad), false, String(bad));
  });

  test('each era declares one cantus firmus, a single foil colour and a lesson', () => {
    for (const e of ERA_EVITES) {
      const cf = e.cantusFirmus;
      assert.ok(['golden', 'module', 'diagonal', 'dots', 'planes', 'radial', 'canon', 'axis'].includes(cf.kind), e.eraId);
      assert.ok(cf.kind === 'planes' ? (cf.ratios || []).length >= 2 && Math.abs(cf.ratios!.reduce((a, b) => a + b, 0) - 1) < 1e-6 : Number.isFinite(cf.value) && cf.value > 0, `${e.eraId}: law value`);
      assert.ok(cf.label && cf.governs, e.eraId);
      assert.match(e.foil, /^#[0-9A-Fa-f]{6}$/, e.eraId);
      assert.ok(e.lesson.length > 20, e.eraId);
      assert.equal(eraEvite(e.id)?.eraId, e.eraId);
    }
  });
});

describe('plates', () => {
  test('every plate is text-free, has a valid 2:3 viewBox and no external references', () => {
    for (const e of ERA_EVITES) {
      const svg = eraPlateSvg(e.id);
      assert.match(svg, new RegExp(`^<svg [^>]*viewBox="0 0 ${PLATE_W} ${PLATE_H}"`), e.eraId);
      assert.ok(Math.abs(PLATE_W / PLATE_H - 2 / 3) < .01);
      assert.ok(!/<text|<tspan|<image|<foreignObject|href=/i.test(svg), `${e.eraId}: plate must not carry text or external refs`);
      assert.ok(!/NaN|undefined|Infinity/.test(svg), `${e.eraId}: bad numbers`);
      assert.ok(svg.length < 1_500_000, `${e.eraId}: plate SVG too heavy (${svg.length})`);
      for (const l of eraLayers(e.id)) for (const o of l.objects) assert.ok(['RECT', 'ELLIPSE', 'LINE', 'PATH'].includes(o.kind), `${e.eraId}: ${o.kind}`);
    }
  });

  test('deterministic: the same era draws the same SVG twice, with unique ids', () => {
    for (const e of ERA_EVITES) {
      assert.equal(eraPlateSvg(e.id), eraPlateSvg(e.id), e.eraId);
      assert.equal(JSON.stringify(eraLayers(e.id, { fresh: true })), JSON.stringify(eraLayers(e.id)), `${e.eraId}: a fresh build differs from the cached one`);
      assert.equal(eraDepthSvg(e.id), eraDepthSvg(e.id), e.eraId);
      const ids = [...eraPlateSvg(e.id).matchAll(/ id="([^"]+)"/g)].map(m => m[1]);
      assert.equal(new Set(ids).size, ids.length, `${e.eraId}: duplicate ids`);
    }
  });

  test('the design law is off by default and drawn only when asked', () => {
    for (const e of ERA_EVITES) {
      assert.ok(!eraPlateSvg(e.id).includes('data-law'), e.eraId);
      const law = eraPlateSvg(e.id, { showLaw: true });
      assert.ok(law.includes('data-law="1"') && law.length > eraPlateSvg(e.id).length, e.eraId);
      assert.ok(!/<text/.test(law));
    }
  });

  test('depth maps are grayscale only, layer depth → luminance, with the far ground darkest', () => {
    for (const e of ERA_EVITES) {
      const svg = eraDepthSvg(e.id);
      assert.match(svg, /viewBox="0 0 816 1224"/);
      for (const c of colours(svg)) {
        if (c === 'none' || c.startsWith('url(')) continue;
        const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(c);
        assert.ok(m && m[1] === m[2] && m[2] === m[3], `${e.eraId}: non-gray ${c}`);
      }
      const layers = eraLayers(e.id);
      assert.ok(layers.length >= 3, `${e.eraId}: needs planes to parallax`);
      const minDepth = Math.min(...layers.map(l => l.depth));
      assert.equal(layers[0].depth, minDepth, `${e.eraId}: the ground is the farthest plane`);
      assert.ok(Math.max(...layers.map(l => l.depth)) - minDepth >= .4, `${e.eraId}: depth range too flat`);
    }
  });

  test('the lower ~40% stays calm for the live text (little structure starts below the calm line)', () => {
    for (const e of ERA_EVITES) {
      const objs = eraLayers(e.id).slice(1).flatMap(l => l.objects).filter(o => o.opacity > .3);
      const starting = objs.filter(o => o.kind !== 'LINE' && o.y > PLATE_H * .66 && o.w * o.h > 2500);
      assert.ok(starting.length <= 12, `${e.eraId}: ${starting.length} large shapes start inside the text area`);
    }
  });
});

describe('living card wiring', () => {
  test('motion: the quiet era preset, one foil per era, nothing loops after the reveal', () => {
    for (const e of ERA_EVITES) {
      const r = eraMotion(e.id);
      assert.equal(r.foil.color, e.foil);
      assert.equal(r.breathe, 0); assert.equal(r.sweep.strength, 0); assert.equal(r.twinkle, 0); assert.equal(r.flicker, 0);
      assert.equal(r.emitter, undefined);
      assert.ok(r.revealMs <= 2200);
      assert.ok(eraVoice(e.id).display.length > 3);
    }
  });

  test('relief-print eras (Constructivism, Ukiyo-e, Harlem Renaissance) get the letterpress entrance', () => {
    for (const id of ['constructivist', 'ukiyoe', 'harlem']) assert.equal(eraEvite(id)?.relief, true, id);
    assert.equal(eraEvite('vaporwave')?.relief, false);
  });

  test('look.showLaw survives cleanLook, and stays absent when never set', () => {
    assert.equal(cleanLook({ showLaw: true }).showLaw, true);
    assert.equal(cleanLook({}, { motion: true, sound: false, showLaw: true }).showLaw, true);
    assert.equal(cleanLook({ showLaw: false }, { motion: true, sound: false, showLaw: true }).showLaw, false);
    assert.equal('showLaw' in cleanLook({ motion: true }), false);
  });
});

function harness() {
  const db = new Map<string, Record<string, any>>();
  const routes: Record<string, any> = {};
  const reg = (m: string) => (path: string, ...h: any[]) => { routes[`${m} ${path}`] = h[h.length - 1]; };
  const deps = {
    app: { get: reg('GET'), post: reg('POST') }, express: { json: () => (_q: any, _s: any, n: any) => n() },
    rateLimit: () => (_q: any, _s: any, n: any) => n(), authMiddleware: (_q: any, _s: any, n: any) => n(),
    firestoreRead: async (c: string, id: string) => db.get(`${c}/${id}`) || null,
    firestoreWrite: async (c: string, id: string, data: any) => { db.set(`${c}/${id}`, { ...(db.get(`${c}/${id}`) || {}), ...data }); },
    firestoreCreateOnce: async (c: string, id: string, data: any) => { if (db.has(`${c}/${id}`)) return 'exists' as const; db.set(`${c}/${id}`, data); return 'created' as const; },
    firestoreDeleteDoc: async (c: string, id: string) => { db.delete(`${c}/${id}`); },
    fsQueryDocs: async (c: string, f: any[]) => [...db.entries()].filter(([k, v]) => k.startsWith(c + '/') && f.every(x => v[x.field] === x.value)).map(([k, v]) => ({ id: k.split('/')[1], data: v })),
    getStripe: () => ({}), trustedRequestOrigin: () => 'https://plajah.com',
    readIndexHtml: async () => '<html><head><title>Plajah</title><meta property="og:image" content="x"></head><body></body></html>',
    resolveArt: async () => { throw new Error('era ids must never reach the creator-theme resolver'); },
  };
  registerEviteRoutes(deps as any);
  const call = async (key: string, req: any) => {
    let status = 200, body: any;
    const res: any = { status(c: number) { status = c; return this; }, json(b: any) { body = b; return this; }, send(b: any) { body = b; return this; }, set() { return this; }, type() { return this; } };
    await routes[key]({ params: {}, query: {}, body: {}, headers: {}, ...req }, res, () => {});
    return { status, body };
  };
  return { db, call };
}

describe('server', () => {
  const base = { fields: { headline: 'A Bauhaus Evening', hostName: 'Dana', startsAt: Date.UTC(2026, 10, 14, 19), venueName: 'The Studio' }, status: 'live' };

  test('save accepts era ids (and still refuses unknown ones); look.showLaw is stored', async () => {
    const h = harness();
    const ok = await h.call('POST /api/evite/save', { uid: 'host1', body: { ...base, templateId: 'era/bauhaus', look: { motion: true, sound: false, showLaw: true } } });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.equal(ok.body.invite.templateId, 'era/bauhaus');
    assert.equal(ok.body.invite.look.showLaw, true);
    assert.equal((await h.call('POST /api/evite/save', { uid: 'host1', body: { ...base, templateId: 'era/not-an-era' } })).status, 400);
    assert.equal((await h.call('POST /api/evite/save', { uid: 'host1', body: { ...base, templateId: 'era/indigenous-contemporary' } })).status, 400);
  });

  test('guest view of an era invite carries no creator-theme art; the link preview falls back to the default card', async () => {
    const h = harness();
    const { body } = await h.call('POST /api/evite/save', { uid: 'host1', body: { ...base, templateId: 'era/art-deco' } });
    const id = body.invite.id;
    const pub = await h.call('GET /api/evite/:id/public', { params: { id } });
    assert.equal(pub.status, 200);
    assert.equal(pub.body.invite.templateId, 'era/art-deco');
    assert.equal(pub.body.invite.art, undefined);
    assert.equal(pub.body.invite.look.showLaw, undefined);
    const page = await h.call('GET /i/:id', { params: { id } });
    // Each era has a pre-rendered 1200×630 preview on the plate bucket (scripts/evite/ogImages.mjs).
    assert.match(String(page.body), /og:image" content="https:\/\/[^"]+\/evites\/v1\/og\/era\/art-deco\.jpg"/);
    assert.match(String(page.body), /og:image:width" content="1200"/);
  });
});
