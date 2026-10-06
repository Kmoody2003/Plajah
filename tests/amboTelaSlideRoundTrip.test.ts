// Slide ⇄ Tela round trip: the slide editor must never lose a layer or a style.
import test from 'node:test';
import assert from 'node:assert/strict';
import type { Slide, SlideLayer } from '../services/ambo/showModel';
import {
  slideToTela, telaToSlide, sceneDevice, makeShapeObject, makeTextObject, makeImageObject, makeLayerObject, amboRecord, slidePlainText,
} from '../services/ambo/telaSlide';
import { FREEFORM_ID, FREEFORM_FIELD, decodeScene, encodeScene } from '../services/ambo/slideTemplates/freeform';
import { buildSlideObjects } from '../services/ambo/slideTemplates/registry';
import type { TelaDoc } from '../types';

const richSlide = (): Slide => ({
  id: 'sl_rich', label: 'Rich', group: 'Verse 1', groupColor: '#6B0099', notes: 'n', stageNotes: 'sn', advanceAfterSec: 9,
  onEnter: [{ kind: 'AUDIO_PLAY', src: 'a.mp3', volume: 0.5 }],
  layers: [
    { id: 'ly_bg', slot: 'background', telaDeviceId: 'dev_bg', content: { kind: 'VIDEO', src: 'v.mp4', loop: true, volume: 0, inSec: 1, outSec: 8 }, opacity: 0.8 },
    { id: 'ly_gen', slot: 'fill', content: { kind: 'GENERATOR', mode: 'STUDIO_AURORA', params: { speed: 2, tint: 'red' } } },
    { id: 'ly_img', slot: 'prop', content: { kind: 'IMAGE', src: 'logo.png', fit: 'contain' }, transform: { rect: { x: 0.8, y: 0.05, w: 0.15, h: 0.15 }, opacity: 0.9, rotation: 5 } },
    { id: 'ly_sh', slot: 'fill', content: { kind: 'SHADER', src: 'plasma', params: { a: 1 } }, enabled: false, visible: false },
    { id: 'ly_txt', slot: 'slide', name: 'Title', telaDeviceId: 'dev_txt', zIndex: 5, blendMode: 'screen',
      content: { kind: 'TEXT', blocks: [{ text: 'Amazing Grace', role: 'title' }, { text: 'how sweet the sound', role: 'body' }], style: { font: 'Inter', size: 80, color: '#ffeeaa', align: 'left', valign: 'top', lineHeight: 1.1, shadow: false, outline: 3, autoFit: false, maxLines: 4 } } },
    { id: 'ly_scr', slot: 'scripture', content: { kind: 'SCRIPTURE', refId: 'JHN.3.16', translation: 'KJV', lines: ['For God so loved'], reference: 'John 3:16', layoutId: 'classic', accent: '#0ff', bgOpacity: 0.4 } },
    { id: 'ly_lyr', slot: 'lyrics', content: { kind: 'LYRICS', lines: [{ time: 0, text: 'la' }, { time: 2, text: 'la la' }], styleId: 's1', title: 'T', clock: { anchorMs: 1, anchorPos: 0, rate: 1, playing: false } } },
    { id: 'ly_tpl', slot: 'overlay', content: { kind: 'TELA_TEMPLATE', templateId: 'welcome', fields: { title: 'Hi' }, theme: 'classic', bgBlend: 'multiply', bgOpacity: 0.5 } },
    { id: 'ly_aud', slot: 'audio', content: { kind: 'AUDIO', src: 'bed.mp3', volume: 0.3, loop: true, fadeInSec: 1, fadeOutSec: 2 } },
    { id: 'ly_tmr', slot: 'prop', content: { kind: 'TIMER', timerId: 't1', format: 'mm:ss' }, transform: { rect: { x: 0.1, y: 0.8, w: 0.3, h: 0.1 } }, locked: true },
    { id: 'ly_clk', slot: 'prop', content: { kind: 'CLOCK', format: 'HH:mm' } },
    { id: 'ly_lot', slot: 'prop', content: { kind: 'LOTTIE', src: 'a.json', speed: 2, loop: false }, transform: { rect: { x: 0.4, y: 0.4, w: 0.2, h: 0.2 } } },
    { id: 'ly_live', slot: 'fill', content: { kind: 'LIVE', inputId: 'cam1', label: 'Cam', fit: 'contain' } },
    { id: 'ly_web', slot: 'prop', content: { kind: 'WEB', url: 'https://example.org' }, meta: { x: 1 } },
    { id: 'ly_future', slot: 'prop', content: { kind: 'HOLOGRAM', depth: 3 } as any },
  ] as SlideLayer[],
});

test('a rich slide round-trips with deep equality', () => {
  const slide = richSlide();
  const doc = slideToTela(slide);
  const back = telaToSlide(doc, slide);
  assert.deepEqual(back, slide);
});

test('every layer gets a stable tela object id (telaDeviceId or layer id)', () => {
  const slide = richSlide();
  const doc = slideToTela(slide);
  const ids = sceneDevice(doc)!.objects.map(o => o.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.includes('dev_txt') && ids.includes('dev_bg') && ids.includes('ly_scr'));
  // opening twice gives the same ids
  assert.deepEqual(sceneDevice(slideToTela(slide))!.objects.map(o => o.id), ids);
});

test('an empty slide gives an empty scene and comes back empty', () => {
  const empty: Slide = { id: 'sl_e', label: 'Empty', layers: [] };
  const doc = slideToTela(empty);
  assert.equal(sceneDevice(doc)!.objects.length, 0);
  assert.deepEqual(telaToSlide(doc, empty), empty);
  assert.equal(slidePlainText(empty), '');
});

test('editing text only keeps the TEXT layer and its style', () => {
  const slide = richSlide();
  const doc = slideToTela(slide);
  const dev = sceneDevice(doc)!;
  dev.objects = dev.objects.map(o => o.id === 'dev_txt' ? { ...o, text: 'New first\nnew second' } : o);
  const back = telaToSlide(doc, slide);
  const t = back.layers.find(l => l.id === 'ly_txt')!;
  assert.equal(t.content.kind, 'TEXT');
  assert.deepEqual((t.content as any).blocks.map((b: any) => b.text), ['New first', 'new second']);
  assert.deepEqual((t.content as any).blocks.map((b: any) => b.role), ['title', 'body']);
  assert.deepEqual((t.content as any).style, (slide.layers[4].content as any).style);
  assert.equal(back.layers.length, slide.layers.length);
});

test('moving a layer object writes transform.rect; others untouched', () => {
  const slide = richSlide();
  const doc = slideToTela(slide);
  const dev = sceneDevice(doc)!;
  dev.objects = dev.objects.map(o => o.id === 'ly_lot' ? { ...o, x: 960, y: 540, rotation: 12, opacity: 0.5 } : o);
  const back = telaToSlide(doc, slide);
  const l = back.layers.find(x => x.id === 'ly_lot')!;
  assert.deepEqual(l.transform, { rect: { x: 0.5, y: 0.5, w: 0.2, h: 0.2 }, rotation: 12, opacity: 0.5 });
  for (const o of slide.layers) if (o.id !== 'ly_lot') assert.deepEqual(back.layers.find(x => x.id === o.id), o);
});

test('hiding / locking an object maps to enabled+visible / locked', () => {
  const slide = richSlide();
  const doc = slideToTela(slide);
  const dev = sceneDevice(doc)!;
  dev.objects = dev.objects.map(o => o.id === 'ly_scr' ? { ...o, hidden: true, locked: true } : o);
  const l = telaToSlide(doc, slide).layers.find(x => x.id === 'ly_scr')!;
  assert.equal(l.enabled, false); assert.equal(l.visible, false); assert.equal(l.locked, true);
});

test('native objects collapse into ONE freeform layer that renders the same objects', () => {
  const slide: Slide = { id: 'sl_n', label: 'N', layers: [{ id: 'bg', slot: 'background', content: { kind: 'GENERATOR', mode: 'X' } }] };
  const doc = slideToTela(slide);
  const dev = sceneDevice(doc)!;
  dev.objects = [...dev.objects, makeShapeObject('ellipse', { fill: '#f00' }), makeTextObject({ text: 'Hello', fontSize: 120 }), makeImageObject('p.png')];
  const back = telaToSlide(doc, slide);
  const ff = back.layers.filter(l => l.content.kind === 'TELA_TEMPLATE');
  assert.equal(ff.length, 1);
  assert.equal(back.layers[0].id, 'bg');                       // background untouched
  const c: any = ff[0].content;
  assert.equal(c.templateId, FREEFORM_ID);
  const scene = decodeScene(c.fields[FREEFORM_FIELD]);
  assert.deepEqual(scene.map(o => o.kind), ['ELLIPSE', 'TEXT', 'IMAGE']);
  assert.equal(slidePlainText(back), 'Hello');
  // the SAME build the outputs use turns it into drawable objects, scaled to the output
  const out = buildSlideObjects(FREEFORM_ID, undefined, c.fields, 1280, 720)!;
  assert.equal(out.length, 3);
  assert.ok(Math.abs(out[1].fontSize! - 120 * (1280 / 1920)) < 1e-6);
  // and a 21:9 output keeps the 16:9 artboard centred (uniform scale)
  const wide = buildSlideObjects(FREEFORM_ID, undefined, c.fields, 2560, 1080)!;
  assert.ok(wide[0].x > 0 && wide[0].w === scene[0].w * (1080 / 1080));
});

test('a freeform layer expands, survives untouched, and re-collapses losslessly', () => {
  const scene = [makeShapeObject('rect'), makeTextObject({ text: 'Hi', underline: true, strike: true, letterSpacing: .05, textTransform: 'uppercase' })];
  const slide: Slide = { id: 'sl_ff', layers: [{ id: 'ly_ff', slot: 'slide', name: 'Slide design', content: { kind: 'TELA_TEMPLATE', templateId: FREEFORM_ID, fields: { [FREEFORM_FIELD]: encodeScene(scene) } } }] };
  const doc = slideToTela(slide);
  assert.equal(sceneDevice(doc)!.objects.length, 2);
  assert.deepEqual(telaToSlide(doc, slide), slide);
  // edit one object: only that object changes in the scene
  sceneDevice(doc)!.objects[1] = { ...sceneDevice(doc)!.objects[1], x: 7 };
  const back = telaToSlide(doc, slide);
  const s2 = decodeScene((back.layers[0].content as any).fields[FREEFORM_FIELD]);
  assert.equal(s2[1].x, 7); assert.equal(s2[0].x, scene[0].x); assert.equal(s2[1].underline, true);
});

test('restyling a TEXT layer promotes it to the scene without losing words', () => {
  const slide = richSlide();
  const doc = slideToTela(slide);
  const dev = sceneDevice(doc)!;
  dev.objects = dev.objects.map(o => o.id === 'dev_txt' ? { ...o, fontWeight: 900, underline: true, x: 200 } : o);
  const back = telaToSlide(doc, slide);
  assert.equal(back.layers.find(l => l.id === 'ly_txt'), undefined);
  const ff = back.layers.find(l => l.content.kind === 'TELA_TEMPLATE' && (l.content as any).templateId === FREEFORM_ID)!;
  const scene = decodeScene((ff.content as any).fields[FREEFORM_FIELD]);
  assert.equal(scene[0].text, 'Amazing Grace\nhow sweet the sound');
  assert.equal(scene[0].underline, true);
  assert.equal(slidePlainText({ ...back, layers: [ff] }), 'Amazing Grace how sweet the sound');
  // every other layer still there, verbatim
  for (const l of slide.layers) if (l.id !== 'ly_txt') assert.deepEqual(back.layers.find(x => x.id === l.id), l);
});

test('new layer objects (video) get a telaDeviceId and land after existing layers', () => {
  const slide: Slide = { id: 'sl_v', layers: [] };
  const doc = slideToTela(slide);
  const v = makeLayerObject({ kind: 'VIDEO', src: 'x.mp4', loop: true }, 'fill', { x: 480, y: 270, w: 960, h: 540 });
  sceneDevice(doc)!.objects.push(v);
  const back = telaToSlide(doc, slide);
  assert.equal(back.layers.length, 1);
  assert.equal(back.layers[0].telaDeviceId, v.id);
  assert.deepEqual(back.layers[0].transform!.rect, { x: 0.25, y: 0.25, w: 0.5, h: 0.5 });
  assert.ok(amboRecord(v));
});

test('doc survives structuredClone-free JSON for undo snapshots (except LIVE streams)', () => {
  const doc: TelaDoc = slideToTela(richSlide());
  assert.ok(JSON.stringify(doc).length > 100);
});
