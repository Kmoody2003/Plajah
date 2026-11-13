// Fabula Story Intelligence — performance, continuity, per-model compilation, coverage, character evidence.
//
// These cover the promises the layer makes to a filmmaker: that a shot keeps its direction when the
// model changes, that state established in one shot is still there in the next, that continuity is
// never dropped without saying so, and that the coverage map tells the truth about what's in the cut.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { connectorById, compileHandoff, compileShotPrompt, type ShotSpec, type CutClip } from '../services/fabula/genAgent';
import {
  resolveEmotion, parseArc, tensionAt, planScenePerformance, scoreBrief, voiceDelivery,
  buildSceneLedger, buildProductionLedger, characterStateClause,
  breakdownForScene, matchProductionScene, toContinuityCheck, planContinuityChecks, environmentStateClause,
  applyDirection, dialectFor, directScene,
  mapCoverage, planStoryboards, addPlaceholdersForMissing,
  gatherCharacterEvidence, planVoiceLock, planCharacterSheet, relationshipEvidence,
  relationshipsTask, normalizeRelationships, motivationsFrom, normalizeBinSuggestions, digestProduction,
} from '../services/fabula/story';

import { scoreFrames, continuityVerdict, CONTINUITY_W, CONTINUITY_H } from '../services/continuityCheck';

const conn = (id: string) => connectorById(id)!;

const MAYA_LOCK = 'MAYA, late 30s, cropped black hair, grey wool coat, a scar through the left eyebrow';
const ELI_LOCK = 'ELI, 60s, white beard, oil-stained canvas jacket, wire glasses';

const scene = () => ({
  id: 'sc1', slugline: 'INT. BOATHOUSE - NIGHT', mode: 'dialogue', script: 'Maya confronts Eli.',
  bible: {
    intent: 'Maya needs Eli to admit he sold the boat',
    subtext_read: 'she already knows; she wants him to say it',
    characters: [
      { id: 'c1', name: 'MAYA', visual_lock: MAYA_LOCK, voice_profile: 'low, dry', arc_in_scene: 'guarded → furious' },
      { id: 'c2', name: 'ELI', visual_lock: ELI_LOCK, voice_profile: 'gravel', arc_in_scene: 'defiant to ashamed' },
    ],
    environment_lock: 'a tin-roofed boathouse, tools on pegboard, one bare bulb',
    lighting_plan: 'single practical bulb, key from camera-left, cold moonlight through slats',
    palette: 'rust, slate, sodium yellow',
  },
  shots: [
    { id: 's1', slug: '1A', type: 'WIDE — MASTER', subject: 'MAYA enters, ELI at the bench', character: '', lines: '', camera: '24mm', still: 'Wide of the boathouse.', video: 'Slow push in.' },
    { id: 's2', slug: '1B', type: 'OTS MED — MAYA', subject: 'MAYA picks up the ledger from the bench', character: '', lines: 'MAYA picks up the ledger.', camera: '50mm', still: '', video: '' },
    { id: 's3', slug: '1C', type: 'CU — ELI', subject: 'ELI reacts', character: 'ELI', lines: 'I did what I had to.', camera: '85mm', still: 'Close on Eli.', video: 'He looks down.' },
    { id: 's4', slug: '1D', type: 'CU — MAYA', subject: 'MAYA', character: 'MAYA', lines: 'Say it.', camera: '85mm', still: 'Close on Maya.', video: 'She does not blink.' },
  ],
});

// ── performance ─────────────────────────────────────────────────────────────────

test('emotion words resolve to states an actor could play, and unknowns fall back to neutral', () => {
  assert.equal(resolveEmotion('guarded').name, 'guarded');
  assert.equal(resolveEmotion('barely contained fury').name, 'angry');
  assert.equal(resolveEmotion('xyzzy').name, 'neutral');
  assert.ok(resolveEmotion('grief').valence < resolveEmotion('joy').valence);
});

test('an arc phrase is read as a start and an end, in either notation', () => {
  assert.deepEqual([parseArc('guarded → furious').from.name, parseArc('guarded → furious').to.name], ['guarded', 'angry']);
  assert.deepEqual([parseArc('from defiant to ashamed').from.name, parseArc('from defiant to ashamed').to.name], ['defiant', 'ashamed']);
  const held = parseArc('calm');
  assert.equal(held.from.name, held.to.name);
});

test('tension builds toward the back of a scene, and a close-up sits above a wide at the same point', () => {
  assert.ok(tensionAt(0.8) > tensionAt(0.2));
  assert.ok(tensionAt(1) < tensionAt(0.8), 'the scene releases after its peak');
  assert.ok(tensionAt(0.5, 'CU — ELI') > tensionAt(0.5, 'WIDE — MASTER'));
});

test('each character in a shot gets direction that follows their own arc', () => {
  const plan = planScenePerformance(scene());
  assert.equal(plan.shots.length, 4);
  const master = plan.shots[0];
  assert.deepEqual(master.beats.map((b) => b.character).sort(), ['ELI', 'MAYA']);
  // Maya opens guarded and ends furious; Eli opens defiant and ends ashamed.
  assert.equal(master.beats.find((b) => b.character === 'MAYA')!.emotion.name, 'guarded');
  const last = plan.shots[3].beats.find((b) => b.character === 'MAYA')!;
  assert.equal(last.emotion.name, 'angry');
  assert.equal(last.role, 'speaking');
  assert.ok(last.emotion.intensity > master.beats[0].emotion.intensity, 'intensity should rise with the scene');
  assert.equal(plan.shots[2].beats[0].character, 'ELI');
});

test('inferred motivations replace the generic objective', () => {
  const plan = planScenePerformance(scene(), { MAYA: { want: 'make Eli confess', fear: 'that he did it for her' } });
  const b = plan.shots[3].beats[0];
  assert.equal(b.objective, 'make Eli confess');
  assert.match(b.subtext || '', /afraid of that he did it for her/);
});

test('voice and score are driven by the same state as the picture', () => {
  const plan = planScenePerformance(scene());
  const angry = plan.shots[3].beats[0];
  const v = voiceDelivery(angry);
  assert.ok(v.energy > 1 && v.rate > 1, 'anger should push energy and pace above the base voice');
  assert.ok(plan.shots[3].score.tempoBpm > plan.shots[0].score.tempoBpm, 'the score should tighten as the scene does');
  const brief = scoreBrief(plan);
  assert.ok(brief.length >= 1 && brief.length <= plan.shots.length);
  assert.equal(brief.reduce((n, s) => n + s.shotIds.length, 0), plan.shots.length, 'every shot belongs to exactly one cue');
});

// ── continuity ──────────────────────────────────────────────────────────────────

test('a prop picked up in one shot is still in hand in the shots that follow', () => {
  const ledger = buildSceneLedger(scene());
  const maya = (i: number) => ledger.shots[i].characters.find((c) => c.name === 'MAYA');
  assert.deepEqual(maya(1)!.props, [], 'the shot where she picks it up opens before she has it');
  assert.ok(ledger.shots[1].changes.some((c) => /MAYA takes ledger/.test(c)));
  assert.deepEqual(maya(3)!.props, ['ledger'], 'two shots later she must still be holding it');
  assert.match(characterStateClause(maya(3)!), /holding ledger/);
});

test('the 180° line holds: the first two characters keep opposite sides of frame', () => {
  const ledger = buildSceneLedger(scene());
  const first = ledger.shots[0].characters;
  assert.equal(first.find((c) => c.name === 'MAYA')!.side, 'frame-left');
  assert.equal(first.find((c) => c.name === 'ELI')!.side, 'frame-right');
  assert.equal(ledger.shots[3].characters[0].side, 'frame-left', 'her single is shot from the same side of the line');
  assert.equal(ledger.shots[0].environment.keySide, 'camera-left');
  assert.equal(ledger.shots[0].environment.timeOfDay, 'night');
});

test('dialogue is not mistaken for action', () => {
  const sc = scene();
  sc.shots[2].lines = 'Drop the ledger. You are bleeding.';
  const ledger = buildSceneLedger(sc);
  assert.deepEqual(ledger.out.characters.find((c) => c.name === 'ELI')!.marks, [], 'a line about bleeding is not a wound');
  assert.equal(ledger.issues.length, 0);
});

test('letting go of something never established is flagged, not silently accepted', () => {
  const sc = scene();
  sc.shots[1] = { ...sc.shots[1], subject: 'MAYA drops the knife', lines: '' };
  const ledger = buildSceneLedger(sc);
  assert.equal(ledger.issues.length, 1);
  assert.match(ledger.issues[0].message, /never shown holding/);
});

test('state carries into a scene that continues, and not into one that does not', () => {
  const a = scene();
  a.shots.push({ id: 's5', slug: '1E', type: 'MED', subject: 'ELI is bleeding from the lip', character: '', lines: '', camera: '', still: '', video: '' } as any);
  const cont = { ...scene(), id: 'sc2', slugline: 'EXT. DOCK - CONTINUOUS' };
  const later = { ...scene(), id: 'sc3', slugline: 'INT. KITCHEN - MORNING' };
  const [, l2, l3] = buildProductionLedger([a, cont, later]);
  assert.deepEqual(l2.shots[0].characters.find((c) => c.name === 'ELI')!.marks, ['blood']);
  assert.deepEqual(l2.shots[0].characters.find((c) => c.name === 'MAYA')!.props, ['ledger']);
  assert.deepEqual(l3.shots[0].characters.find((c) => c.name === 'ELI')!.marks, []);
});

// ── the Film Hub's continuity engine, reused ────────────────────────────────────

const BREAKDOWN = [
  { name: "Maya's grey coat", category: 'WARDROBE', continuityState: 'left sleeve torn since Sc 4', occurrences: [{ sceneId: 'ps7', sceneNum: '7' }] },
  { name: 'Split lip', category: 'MAKEUP_HAIR', notes: 'ELI — fresh, no swelling yet', occurrences: [{ sceneId: 'ps7', sceneNum: '7' }] },
  { name: 'Ledger', category: 'PROPS', continuityState: 'water-stained cover', occurrences: [{ sceneId: 'ps7', sceneNum: '7' }] },
  { name: 'Outboard motor on trestle', category: 'SET_DRESSING', occurrences: [{ sceneId: 'ps7', sceneNum: '7' }] },
  { name: 'Flare gun', category: 'PROPS', status: 'OMITTED', occurrences: [{ sceneId: 'ps7', sceneNum: '7' }] },
  { name: 'Radio', category: 'SOUND', occurrences: [{ sceneId: 'ps7', sceneNum: '7' }] },
  { name: 'Rowboat', category: 'VEHICLES', occurrences: [{ sceneId: 'ps9', sceneNum: '9' }] },
] as any[];
const PROD_SCENES = [
  { id: 'ps7', sceneNum: '7', intExt: 'INT', dayNight: 'NIGHT', set: 'BOATHOUSE', heading: 'INT. BOATHOUSE - NIGHT' },
  { id: 'ps9', sceneNum: '9', intExt: 'EXT', dayNight: 'DAY', set: 'DOCK' },
] as any[];

test('the hub breakdown seeds the ledger: the supervisor\'s continuity state is authoritative from shot one', () => {
  const items = breakdownForScene(BREAKDOWN, 'ps7');
  assert.deepEqual(items.map((i) => i.name), ["Maya's grey coat", 'Split lip', 'Ledger', 'Outboard motor on trestle'], 'omitted and non-continuity elements are skipped');
  const ledger = buildSceneLedger(scene(), { breakdown: items });
  const first = ledger.shots[0];
  assert.deepEqual(first.characters.find((c) => c.name === 'MAYA')!.wardrobe, ["wearing Maya's grey coat (left sleeve torn since Sc 4)"]);
  assert.deepEqual(first.characters.find((c) => c.name === 'ELI')!.marks, ['Split lip'], 'a makeup element is given to the character named in its notes');
  assert.deepEqual(first.environment.required, ['Ledger (water-stained cover)']);
  assert.deepEqual(first.environment.dressing, ['Outboard motor on trestle']);
  assert.match(environmentStateClause(first.environment), /in the scene: Ledger \(water-stained cover\)/);
  assert.equal(ledger.fromBreakdown.length, 4);
  // And it reaches the model, on every provider.
  const spec: ShotSpec = { prompt: 'Close on Maya.', refs: [], direction: { continuity: ledger.shots[3] } };
  for (const id of ['kling', 'runway', 'flux']) assert.match(compileHandoff(spec, conn(id)).prompt, /left sleeve torn since Sc 4/, id);
});

test('a ledger with no breakdown is unchanged — text inference still stands alone', () => {
  const ledger = buildSceneLedger(scene());
  assert.deepEqual(ledger.fromBreakdown, []);
  assert.deepEqual(ledger.shots[0].environment.required, []);
});

test('a SLATE scene finds its production scene by link, by the takes cut into it, then by heading', () => {
  assert.equal(matchProductionScene({ ...scene(), filmSceneId: 'ps9' }, PROD_SCENES)!.id, 'ps9');
  const byTakes = matchProductionScene({ ...scene(), slugline: 'SOMEWHERE ELSE' }, PROD_SCENES, {
    clips: [{ id: 'k', shotId: 's1', assetId: 'a1' }], pool: [{ id: 'a1', filmSceneId: 'ps9' }],
  });
  assert.equal(byTakes!.id, 'ps9');
  assert.equal(matchProductionScene(scene(), PROD_SCENES)!.id, 'ps7');
  assert.equal(matchProductionScene({ slugline: 'EXT. DOCK — DAY', shots: [] }, PROD_SCENES)!.id, 'ps9', 'falls back to set + time of day');
  assert.equal(matchProductionScene({ slugline: 'INT. KITCHEN - DAY', shots: [] }, PROD_SCENES), undefined);
});

// A textured frame. Inside `patch` the texture is inverted and amplified — different structure at the
// same average brightness — and optionally recoloured, so structure and light can be varied apart.
const frameOf = (rgb: [number, number, number], patch?: { x: number; y: number; w: number; h: number; rgb?: [number, number, number] }) => {
  const px = new Uint8ClampedArray(CONTINUITY_W * CONTINUITY_H * 4);
  for (let y = 0; y < CONTINUITY_H; y++) for (let x = 0; x < CONTINUITY_W; x++) {
    const i = (y * CONTINUITY_W + x) * 4;
    const inPatch = !!patch && x >= patch.x && x < patch.x + patch.w && y >= patch.y && y < patch.y + patch.h;
    const base = ((x * 7 + y * 13) % 23) - 11;
    const tex = inPatch ? -base * 3 : base;
    const [r, g, b] = (inPatch && patch!.rgb) || rgb;
    px[i] = r + tex; px[i + 1] = g + tex; px[i + 2] = b + tex; px[i + 3] = 255;
  }
  return px;
};

test('Continuity Eye scores identical frames as a match and flags a changed region', () => {
  const a = frameOf([120, 110, 100]);
  const same = scoreFrames(a, frameOf([120, 110, 100]));
  assert.equal(same.score, 100);
  assert.equal(continuityVerdict(same.score), 'Match');
  assert.equal(same.flags.length, 0);
  const moved = scoreFrames(a, frameOf([120, 110, 100], { x: 200, y: 40, w: 80, h: 80, rgb: [230, 230, 230] }));
  assert.ok(moved.propsScore < 100 && moved.flags.some((f) => f.kind === 'CHANGE' && /right/.test(f.label)), 'a prop-sized change should be boxed on the side it happened');
});

test('across two setups only the light is judged — a new angle is not a continuity break', () => {
  const wide = frameOf([120, 110, 100]);
  const close = frameOf([120, 110, 100], { x: 40, y: 20, w: 240, h: 140 });
  const cross = scoreFrames(wide, close, 'cross-setup');
  assert.equal(cross.flags.filter((f) => f.kind === 'CHANGE').length, 0);
  assert.equal(cross.score, cross.lightingScore);
  assert.ok(scoreFrames(wide, close).score < cross.score, 'the same pair judged as one setup would be marked down for the reframing');
  // But a real lighting jump across the cut is still caught.
  const cold = scoreFrames(wide, frameOf([60, 70, 110]), 'cross-setup');
  assert.equal(continuityVerdict(cold.score), 'Break');
  assert.ok(cold.flags.some((f) => f.kind === 'LIGHT' && /cooler/.test(f.label)));
});

test('a generated-shot check is logged as the same record the hub\'s Continuity tab writes', () => {
  const r = scoreFrames(frameOf([120, 110, 100]), frameOf([150, 120, 90]));
  const row = toContinuityCheck(r, { id: 'cc1', sceneId: 'ps7', sceneNum: '7', label: '1C → 1D · light across the cut', createdAt: 5 });
  assert.deepEqual(Object.keys(row).sort(), ['colorTempNote', 'createdAt', 'flagCount', 'id', 'label', 'lightingScore', 'lumaDelta', 'propsScore', 'sceneId', 'sceneNum', 'score']);
  assert.ok(!('note' in row), 'undefined fields must be stripped — Firestore rejects them');
  assert.equal(row.flagCount, r.flags.length);
});

test('the checks offered come from what is really in the cut, and boards are never a reference', () => {
  const sc = scene();
  const p = [
    { id: 'v1', type: 'video', name: '1A.mp4' }, { id: 'v2old', type: 'video', name: '1B take1.mp4' }, { id: 'v2', type: 'video', name: '1B take2.mp4' },
    { id: 'still2', type: 'image', name: '1B still.png', shotId: 's2' }, { id: 'board3', type: 'image', name: '1C board.png', shotId: 's3', board: true },
    { id: 'v3', type: 'video', name: '1C.mp4' },
  ];
  const c = [
    { id: 'a', trackId: 'v1', start: 0, duration: 4, srcIn: 1, kind: 'media', assetId: 'v1', shotId: 's1' },
    { id: 'b0', trackId: 'v1', start: 4, duration: 2, srcIn: 0, kind: 'media', assetId: 'v2old', shotId: 's2', disabled: true },
    { id: 'b', trackId: 'v1', start: 4, duration: 2, srcIn: 0, kind: 'media', assetId: 'v2', shotId: 's2' },
    { id: 'c', trackId: 'v1', start: 6, duration: 3, srcIn: 0, kind: 'media', assetId: 'v3', shotId: 's3' },
    { id: 'd', trackId: 'v1', start: 9, duration: 2, kind: 'script', shotId: 's4' },
  ];
  const plans = planContinuityChecks(sc, c, p);
  assert.deepEqual(plans.map((x) => `${x.slug}:${x.kind}:${x.scope}`), [
    '1B:take:same-setup', '1B:first-frame:same-setup', '1B:neighbour:cross-setup', '1C:neighbour:cross-setup',
  ]);
  const cut = plans.find((x) => x.slug === '1B' && x.kind === 'neighbour')!;
  assert.deepEqual([cut.ref.assetId, cut.ref.atSec, cut.cur.assetId, cut.cur.atSec], ['v1', 4.9, 'v2', 0.1], 'last frame of the outgoing shot against the first of the incoming');
});

// ── compiling for a model ───────────────────────────────────────────────────────

const directedSpec = (shotId: string, which: 'still' | 'video'): ShotSpec => {
  const sc = scene();
  const shot = sc.shots.find((s) => s.id === shotId)!;
  return { prompt: (shot as any)[which] || 'A shot.', refs: [], shotId, direction: directScene(sc).forShot(shotId) };
};

test('a spec with no direction compiles exactly as it did before', () => {
  const spec: ShotSpec = { prompt: 'A wide of the harbour.', refs: [] };
  assert.equal(applyDirection(spec.prompt, spec, conn('kling')).prompt, 'A wide of the harbour.');
  assert.equal(compileHandoff(spec, conn('kling')).prompt, 'A wide of the harbour.');
});

test('the same shot carries its continuity to every model, each in its own form', () => {
  const spec = directedSpec('s4', 'video');
  for (const id of ['kling', 'veo', 'runway', 'dreamina', 'local_wan']) {
    const out = compileHandoff(spec, conn(id)).prompt;
    assert.match(out, /holding ledger/, `${id} lost the prop`);
    assert.match(out, /camera-left/, `${id} lost the light direction`);
    assert.ok(out.length <= dialectFor(conn(id)).maxChars, `${id} went over its budget`);
  }
  const kling = compileHandoff(spec, conn('kling')).prompt;
  const runway = compileHandoff(spec, conn('runway')).prompt;
  assert.match(kling, /plays to /, 'a prose model gets the intention');
  assert.ok(runway.length < kling.length, 'a terse model gets less text for the same direction');
});

test('stills get a frozen moment, video gets a beat that moves', () => {
  const still = compileHandoff(directedSpec('s4', 'still'), conn('flux')).prompt;
  const video = compileHandoff(directedSpec('s4', 'video'), conn('kling')).prompt;
  assert.match(still, /Performance: MAYA: /);
  assert.doesNotMatch(still, /tempo/);
  assert.match(video, /tempo/);
});

test('only models that generate audio are handed the line', () => {
  const spec = directedSpec('s4', 'video');
  assert.match(compileHandoff(spec, conn('veo')).prompt, /MAYA says: "Say it\."/);
  const kling = compileHandoff(spec, conn('kling'));
  assert.doesNotMatch(kling.prompt, /says: "/);
  assert.ok(kling.notes.some((n) => /doesn't generate dialogue/.test(n)), 'the user must be told the voice is a post step');
});

test('with a first frame, the model is told to hold the frame rather than re-describe it', () => {
  const spec = { ...directedSpec('s4', 'video'), refs: [{ role: 'first_frame' as const, url: 'https://x/still.png', name: 'chosen still' }] };
  assert.match(compileHandoff(spec, conn('kling')).prompt, /exactly as in the first frame/);
  assert.doesNotMatch(compileHandoff(directedSpec('s4', 'video'), conn('kling')).prompt, /first frame/);
});

test('drift guards go to the negative field where there is one', () => {
  const spec = directedSpec('s1', 'video');
  const kling = compileShotPrompt(spec, conn('kling'));
  assert.match(kling.negative || '', /swapping sides of frame/);
  assert.equal(compileShotPrompt(spec, conn('runway')).negative, undefined, 'no negative field — nothing to send');
});

test('when direction does not fit a model, performance goes before continuity and the cut is reported', () => {
  const spec = { ...directedSpec('s4', 'video'), prompt: 'x'.repeat(700) };
  const out = applyDirection(spec.prompt, spec, conn('local_wan'));
  assert.deepEqual(out.trimmed, ['performance']);
  assert.match(out.prompt, /Continuity:/);
  assert.ok(out.notes.some((n) => /didn't fit/.test(n)));
});

// ── coverage ────────────────────────────────────────────────────────────────────

const acts = () => [{ id: 'a1', title: 'ACT I', scenes: [scene(), { id: 'sc2', title: 'The dock', script: 'They walk out.', shots: [] }, { id: 'sc3', title: 'TBD', script: '', shots: [] }] }];
const pool = [
  { id: 'vid1', type: 'video', name: 'master.mp4', duration: 8 },
  { id: 'img1', type: 'image', name: 'board_1B.png' },
  { id: 'alt1', type: 'video', name: 'eli_alt.mp4', shotId: 's3', duration: 4 },
  { id: 'broll', type: 'video', name: 'gulls.mp4', duration: 6 },
];
const cut = (): CutClip[] => [
  { id: 'k1', trackId: 'v1', start: 0, duration: 4, kind: 'media', assetId: 'vid1', shotId: 's1' },
  { id: 'k2', trackId: 'v1', start: 4, duration: 2, kind: 'media', assetId: 'img1', shotId: 's2' },
  { id: 'k3', trackId: 'v1', start: 6, duration: 3, kind: 'script', shotId: 's3' },
  { id: 'k4', trackId: 'v1', start: 9, duration: 5, kind: 'media', assetId: 'broll' },
  { id: 'k5', trackId: 'a1', start: 6, duration: 3, kind: 'voice', shotId: 's3' },
];

test('the coverage map tells shot, boarded, placeholder and missing apart', () => {
  const cov = mapCoverage(acts(), cut(), pool);
  assert.deepEqual(cov.scenes[0].shots.map((s) => s.status), ['shot', 'boarded', 'placeholder', 'missing']);
  assert.equal(cov.scenes[0].state, 'partial');
  assert.equal(cov.coveredRatio, 0.5);
  assert.deepEqual(cov.scenes[0].shots[2].unusedAssetIds, ['alt1'], 'a take in the bin for a shot with an empty slot should be surfaced');
  assert.deepEqual(cov.unscriptedClipIds, ['k4']);
  assert.deepEqual(cov.unbrokenSceneIds, ['sc2']);
  assert.deepEqual(cov.unwrittenSceneIds, ['sc3']);
});

test('a muted clip does not count as coverage', () => {
  const clips = cut().map((c) => (c.id === 'k1' ? { ...c, disabled: true } : c));
  assert.equal(mapCoverage(acts(), clips, pool).scenes[0].shots[0].status, 'missing');
});

test('every uncovered shot gets a board carrying the identity locks and the shot it belongs to', () => {
  const a = acts();
  const boards = planStoryboards(mapCoverage(a, cut(), pool), a, { aspect: '2.39:1', directionFor: (sc, sh) => directScene(sc).forShot(sh.id) });
  assert.deepEqual(boards.map((b) => b.slug), ['1C', '1D']);
  const b = boards[1];
  assert.equal(b.spec.shotId, 's4');
  assert.ok(b.spec.refs.some((r) => r.lock === MAYA_LOCK));
  const out = compileHandoff(b.spec, conn('flux')).prompt;
  assert.match(out, /storyboard frame/);
  assert.match(out, /holding ledger/, 'a board should show the same continuity the final shot will');
});

test('a shot with no SLATE prompt can still be boarded from its breakdown', () => {
  const a = acts();
  a[0].scenes[0].shots[3].still = '';
  const boards = planStoryboards(mapCoverage(a, cut(), pool), a);
  assert.match(boards[1].spec.prompt, /CU — MAYA/);
  assert.match(boards[1].spec.prompt, /tin-roofed boathouse/);
});

test('missing shots get slots at the end of the cut without moving anything already there', () => {
  const a = acts(), clips = cut();
  let n = 0;
  const out = addPlaceholdersForMissing(clips, mapCoverage(a, clips, pool), a, () => `new${++n}`, () => 2.5);
  assert.equal(out.added, 1);
  assert.deepEqual(out.clips.slice(0, clips.length), clips);
  const slot = out.clips[out.clips.length - 1];
  assert.deepEqual([slot.kind, slot.shotId, slot.start, slot.duration], ['script', 's4', 14, 2.5]);
  assert.equal(mapCoverage(a, out.clips, pool).scenes[0].shots[3].status, 'placeholder');
});

// ── characters ──────────────────────────────────────────────────────────────────

const prod = () => ({
  title: 'Low Tide',
  cast: [
    { id: 'c1', name: 'MAYA', looks: MAYA_LOCK, voice: 'low, dry', media: [{ assetId: 'ref1', locked: true }] },
    { id: 'c2', name: 'ELI', looks: '', voice: '', media: [] },
  ],
  mediaPool: [
    { id: 'ref1', type: 'image', name: 'maya_ref.png' },
    { id: 'eli_vid', type: 'video', name: 'eli_cu.mp4', duration: 12 },
    { id: 'maya_vid', type: 'video', name: 'take3.mp4', duration: 20, castId: 'c1' },
    { id: 'eli_vo', type: 'audio', name: 'ELI wild lines.wav', duration: 25 },
  ],
  acts: acts(),
});
const charCut: CutClip[] = [
  { id: 'q1', trackId: 'v1', start: 0, duration: 6, srcIn: 2, kind: 'media', assetId: 'eli_vid', shotId: 's3' },
  { id: 'q2', trackId: 'v1', start: 6, duration: 4, srcIn: 1, kind: 'media', assetId: 'maya_vid', shotId: 's4' },
];

test('character evidence is gathered from cast references, tagged bins and the cut', () => {
  const [maya, eli] = gatherCharacterEvidence(prod(), charCut);
  assert.deepEqual(maya.looks.map((l) => [l.assetId, l.source]), [['ref1', 'cast'], ['maya_vid', 'bin']]);
  assert.deepEqual(eli.looks.map((l) => [l.assetId, l.source, l.atSec]), [['eli_vid', 'timeline', 5]], 'a frame from the middle of the clip');
  assert.equal(eli.lineCount, 1);
  assert.deepEqual(eli.voice.map((v) => v.assetId).sort(), ['eli_vid', 'eli_vo']);
});

test('a voice lock is graded on how much clean speech there is, and is never usable without consent', () => {
  const [maya, eli] = gatherCharacterEvidence(prod(), charCut);
  const eliLock = planVoiceLock(eli);
  assert.equal(eliLock.readiness, 'ready');
  assert.equal(eliLock.totalSec, 31);
  assert.equal(eliLock.consent, false);
  assert.ok(eliLock.notes.some((n) => /isolate dialogue/.test(n)));
  const mayaLock = planVoiceLock(maya, prod().cast[0]);
  assert.equal(mayaLock.readiness, 'insufficient');
  assert.equal(mayaLock.profile, 'low, dry');
});

test('a character sheet plan uses the best references first and asks for the views that are missing', () => {
  const p = prod();
  const [maya, eli] = gatherCharacterEvidence(p, charCut);
  const sheet = planCharacterSheet(maya, { ...p.cast[0], sheet: { front: 'ref1' } });
  assert.equal(sheet.refs[0].assetId, 'ref1', 'a locked reference outranks a bin clip');
  assert.ok(!sheet.missing.includes('front'));
  assert.equal(sheet.requests.length, 5);
  assert.ok(sheet.requests.every((r) => r.spec.prompt.includes(MAYA_LOCK) && r.spec.refs[0].assetId === 'ref1'));
  assert.ok(planCharacterSheet(eli, p.cast[1]).notes.some((n) => /no written look/.test(n)));
});

test('relationship evidence counts shared scenes and exchanges, and feeds the model pass', () => {
  const p = prod();
  const edges = relationshipEvidence(p);
  assert.deepEqual([edges[0].a, edges[0].b, edges[0].sharedScenes, edges[0].exchanges], ['ELI', 'MAYA', 1, 1]);
  const task = relationshipsTask(p, edges, mapCoverage(p.acts, charCut, p.mediaPool));
  assert.match(task.user, /ELI \+ MAYA: 1 shared scene, 1 exchanges/);
  assert.match(digestProduction(p), /INT\. BOATHOUSE - NIGHT/);
});

test('model replies are normalised to cast names and feed straight into performance', () => {
  const r = normalizeRelationships({
    characters: [{ name: 'maya', want: 'the truth', fear: 'being lied to again' }, { want: 'no name' }],
    relationships: [{ a: 'Maya', b: 'eli', kind: 'daughter and father', dynamic: 'she holds the proof' }, { a: 'MAYA' }],
  }, ['MAYA', 'ELI']);
  assert.equal(r.characters.length, 1);
  assert.deepEqual([r.relationships[0].a, r.relationships[0].b], ['MAYA', 'ELI']);
  assert.equal(planScenePerformance(scene(), motivationsFrom(r)).shots[3].beats[0].objective, 'the truth');
});

test('bin suggestions pointing at assets that do not exist are dropped', () => {
  const bins = [{ assetId: 'alt1', name: 'eli_alt.mp4', inCut: false }];
  const out = normalizeBinSuggestions({ suggestions: [
    { kind: 'alternate_take', assetIds: ['alt1', 'made_up'], idea: 'Try the alt', why: 'quieter read' },
    { kind: 'insert', assetIds: ['nope'], idea: 'Use this', why: 'x' },
  ] }, bins);
  assert.equal(out.length, 1);
  assert.deepEqual(out[0].assetIds, ['alt1']);
});
