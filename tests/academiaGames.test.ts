import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildTileTray,
  ELEVATE_QUESTS,
  evaluateFluxStudio,
  evaluateReadingSelection,
  evaluateScienceBench,
  evaluateWaterwheel,
  FLUX_QUESTS,
  formatFraction,
  gcd,
  HISTORY_QUESTS,
  MATH_QUESTS,
  READING_QUESTS,
  SCIENCE_QUESTS,
  WORLD_CATALOG,
} from '../services/academiaGames/pedagogyEngine';
import {
  breathFrameAt,
  completeMaMoment,
  createPacingState,
  DUSK_BELL_MINUTES,
  isDuskBellDue,
  moodOptionFor,
  recordMastery,
  recordStruggle,
} from '../services/academiaGames/affectivePacing';
import {
  getFluxHint,
  getHistoryHint,
  getMathHint,
  getReadingHint,
  getScienceHint,
} from '../services/academiaGames/mentorGuild';
import {
  appendJournalEntry,
  compileKeepsakeBookHtml,
} from '../services/academiaGames/fieldJournal';
import {
  createLivingSceneRig,
  pokeLivingScene,
  stepLivingSceneRig,
  triggerLivingBurst,
} from '../services/academiaGames/livingAnimaBridge';
import { compileAnim, seedForObject } from '../services/living/runtime/anim';
import {
  getWorldMotionDirection,
  quantizeMotionTime,
} from '../services/academiaGames/motionDirector';
import {
  SPRITE_URLS,
  WORLD_SPRITE_MANIFEST,
} from '../services/academiaGames/plateAnimator';
import { isolateSpriteOnWhite } from '../services/academiaGames/spriteMatting';

test('World catalog registers all 6 handmade worlds with self-hosted plate paths', () => {
  assert.equal(WORLD_CATALOG.length, 6);
  for (const w of WORLD_CATALOG) {
    assert.ok(w.plateUrl.startsWith('/academia-games/plates/'), `Expected self-hosted plate URL for ${w.id}`);
    assert.ok(w.plajahEngines.length >= 3);
  }
});

test('Reading & Elevate quests share deterministic tray builder and forgiving evaluator', () => {
  for (const quest of [...READING_QUESTS, ...ELEVATE_QUESTS]) {
    const trayA = buildTileTray(quest);
    const trayB = buildTileTray(quest);
    assert.deepEqual(trayA, trayB, 'Tray shuffle must be deterministic');
    assert.equal(trayA.length, quest.tiles.length + quest.distractors.length);

    // Solve by picking the matching indices in order
    const used = new Set<number>();
    const indices = quest.tiles.map(t => {
      const i = trayA.findIndex((item, idx) => item === t && !used.has(idx));
      assert.ok(i >= 0, `Tile ${t} missing from tray for ${quest.id}`);
      used.add(i);
      return i;
    });
    const res = evaluateReadingSelection(quest, indices, trayA);
    assert.equal(res.exactMatch, true);
    assert.equal(res.progressRatio, 1);
  }
});

test('Math Waterwheel evaluates Singapore CPA balance, underflow, and overflow', () => {
  const q0 = MATH_QUESTS[0]; // 4/8 + B/8 + 2/8 = 8/8 -> B = 2
  const under = evaluateWaterwheel(q0, 4, 1);
  assert.equal(under.balanced, false);
  assert.equal(under.delta, -1);
  assert.ok(under.wheelRpm < 1);

  const exact = evaluateWaterwheel(q0, 4, 2);
  assert.equal(exact.balanced, true);
  assert.equal(exact.delta, 0);
  assert.equal(exact.wheelRpm, 1);

  const over = evaluateWaterwheel(q0, 4, 4);
  assert.equal(over.balanced, false);
  assert.equal(over.delta, 2);

  assert.equal(formatFraction(6, 8), '3/4');
  assert.equal(formatFraction(8, 8), '1');
});

test('Science Conservatory evaluates mycorrhizal symbiosis equilibrium across 3 variables', () => {
  const q = SCIENCE_QUESTS[0];
  const off = evaluateScienceBench(q, 20, 20, 95);
  assert.equal(off.equilibrium, false);
  assert.ok(off.mycorrhizalFluxPct < 70);

  const midLight = Math.round((q.targetLight[0] + q.targetLight[1]) / 2);
  const midMoisture = Math.round((q.targetMoisture[0] + q.targetMoisture[1]) / 2);
  const midVolt = Math.round((q.targetVoltage[0] + q.targetVoltage[1]) / 2);
  const eq = evaluateScienceBench(q, midLight, midMoisture, midVolt);
  assert.equal(eq.equilibrium, true);
  assert.equal(eq.mycorrhizalFluxPct, 100);
});

test('9-12 Flux Studio enforces number-theoretic topology invariants via gcd(p, q)', () => {
  assert.equal(gcd(4, 6), 2);
  assert.equal(gcd(5, 7), 1);

  const linkedQuest = FLUX_QUESTS[0]; // needs gcd = 2
  assert.equal(evaluateFluxStudio(linkedQuest, 3, 5).solved, false);
  assert.equal(evaluateFluxStudio(linkedQuest, 4, 6).solved, true);

  const highKnotQuest = FLUX_QUESTS[1]; // needs p>=5, q>=7, gcd=1
  assert.equal(evaluateFluxStudio(highKnotQuest, 6, 9).solved, false);
  assert.equal(evaluateFluxStudio(highKnotQuest, 5, 7).solved, true);
});

test('Ora affective pacing detects gentle frustration faster when learner checks in Stormy/Rainy', () => {
  let s = createPacingState(1000);
  assert.equal(moodOptionFor(1).atmosphere, 'rain');
  assert.equal(moodOptionFor(5).atmosphere, 'sunlit');

  // Stormy mood triggers Ma-Moment offer on 2 struggles instead of 3
  s = recordStruggle(s, 1, 2000);
  assert.equal(s.maMomentSuggested, false);
  s = recordStruggle(s, 1, 3000);
  assert.equal(s.maMomentSuggested, true);

  // Taking a Ma Moment resets streak and increments count
  s = completeMaMoment(s);
  assert.equal(s.maMomentSuggested, false);
  assert.equal(s.maMomentsTaken, 1);

  // Mastery resets struggle streak cleanly
  s = recordStruggle(s, 5, 4000);
  s = recordMastery(s);
  assert.equal(s.struggleStreak, 0);

  // Dusk Bell fires after age-calibrated focus arc
  assert.equal(isDuskBellDue(s, 'prek2', 1000 + (DUSK_BELL_MINUTES.prek2 - 1) * 60_000), false);
  assert.equal(isDuskBellDue(s, 'prek2', 1000 + DUSK_BELL_MINUTES.prek2 * 60_000), true);

  // Breathing curve stays smoothly bounded [0, 1] across 4-2-4 phases
  assert.equal(breathFrameAt(0).phase, 'inhale');
  assert.equal(breathFrameAt(4.5).phase, 'hold');
  assert.equal(breathFrameAt(7.5).phase, 'exhale');
  for (let sec = 0; sec <= 10; sec += 0.5) {
    const f = breathFrameAt(sec);
    assert.ok(f.expansion >= 0 && f.expansion <= 1);
  }
});

test('Education Council Mentor Guild resolves real council seats with deterministic provenance', () => {
  const r1 = getReadingHint(READING_QUESTS[0], 1);
  assert.equal(r1.seatName, 'Efua');
  assert.equal(r1.provenance, 'deterministic-council');

  const m1 = getMathHint(MATH_QUESTS[0], 4, 1, 1);
  assert.equal(m1.seatName, 'Wei Ling');

  const s1 = getScienceHint(SCIENCE_QUESTS[0], 30, 30, 80, 1);
  assert.equal(s1.seatName, 'Haruto');

  const f3 = getFluxHint(FLUX_QUESTS[0], 3, 5, 3);
  assert.equal(f3.seatName, 'Dr. Lindqvist');

  const h1 = getHistoryHint(HISTORY_QUESTS[0], 1);
  assert.equal(h1.seatName, 'Rafael');
});

test('Living Field Journal deduplicates quest entries and compiles escaped Lorea keepsake HTML', () => {
  let entries = appendJournalEntry([], {
    id: 'read-sun',
    createdAt: 1,
    world: 'reading',
    band: 'prek2',
    title: 'Lantern Word: SUN',
    summary: 'Warm sun over the brook.',
    artifactNote: 'S + U + N',
    standards: READING_QUESTS[0].standards,
    emblem: 'lantern',
  });
  entries = appendJournalEntry(entries, {
    id: 'read-sun',
    createdAt: 2,
    world: 'reading',
    band: 'prek2',
    title: 'Lantern Word: SUN (Updated)',
    summary: 'Warm sun over the brook.',
    artifactNote: 'S + U + N',
    standards: READING_QUESTS[0].standards,
    emblem: 'lantern',
  });
  assert.equal(entries.length, 1);
  const html = compileKeepsakeBookHtml('Maya <Test>', entries);
  assert.ok(html.includes('Maya &lt;Test&gt;'), 'Must escape HTML entities');
  assert.ok(html.includes('Lantern Word: SUN (Updated)'));
  assert.ok(html.includes('RF.K.2.D'));
});

test('Plajah Anima + Living animation bridge simulates Verlet hair, Stable Fluids, bursts, and reduced motion', () => {
  // Reading: Verlet willow vines move smoothly under wind force
  const readRig = createLivingSceneRig('reading');
  assert.ok(readRig.hair.strands.length >= 10);
  const tipBefore = { ...readRig.hair.strands[0].points.at(-1)!.pos };
  for (let i = 0; i < 12; i++) {
    stepLivingSceneRig(readRig, 0.016, i * 0.016, { atmosphere: 'sunlit', reducedMotion: false, intensity: 0.6 });
  }
  const tipAfter = readRig.hair.strands[0].points.at(-1)!.pos;
  assert.notEqual(tipAfter.x, tipBefore.x, 'Anima HairSystem tip should sway under wind');

  // Ora: Jos Stam Stable Fluids teacup steam advects dye cleanly & poke adds ripple + Living burst
  const oraRig = createLivingSceneRig('ora');
  assert.ok(oraRig.fluid !== null);
  stepLivingSceneRig(oraRig, 0.016, 0.2, { atmosphere: 'dusk', reducedMotion: false, intensity: 0.8 });
  pokeLivingScene(oraRig, 480, 320);
  assert.equal(oraRig.ripples.length, 1);
  assert.ok(oraRig.livingBurst.length > 0);

  // Math: Anima ParticleSystem emits waterwheel splashes + rotates wheel
  const mathRig = createLivingSceneRig('math');
  triggerLivingBurst(mathRig, 'bubbles', 640, 560, 12);
  for (let i = 0; i < 20; i++) {
    stepLivingSceneRig(mathRig, 0.016, i * 0.016, { atmosphere: 'sunlit', reducedMotion: false, intensity: 1, rpmOrVoltage: 1 });
  }
  assert.ok(mathRig.wheelAngle > 0);
  assert.ok(mathRig.animaParticles.particles.length > 0);

  // Living compileAnim honours reduced-motion twins deterministically
  const swayActive = compileAnim({ preset: 'sway', loop: 'infinite' }, { box: { x: 0, y: 0, w: 60, h: 60 }, pageW: 1280, pageH: 720, reduced: false, seed: seedForObject('slot-0') });
  const swayReduced = compileAnim({ preset: 'sway', loop: 'infinite' }, { box: { x: 0, y: 0, w: 60, h: 60 }, pageW: 1280, pageH: 720, reduced: true, seed: seedForObject('slot-0') });
  assert.equal(swayActive.skipped, undefined);
  assert.equal(swayReduced.skipped, 'reduced');
});

test('Plajah Motion Council casts Studio Roster crews and quantizes On-2s/On-3s timing cleanly', () => {
  const readDir = getWorldMotionDirection('reading');
  assert.ok(readDir.crew.some(m => m.id === 'PASTORAL'), 'Reading must cast The Pastoral Naturalist');
  assert.ok(readDir.crew.some(m => m.id === 'LIVE2D'), 'Reading must cast The Live2D Rigger');
  assert.ok(readDir.deliberation.proposals.length >= 2);

  const histDir = getWorldMotionDirection('history');
  assert.ok(histDir.crew.some(m => m.id === 'MINIATURE'), 'History must cast The Tabletop Miniaturist');

  // On 2s quantizes to 12 poses/second; on 1s stays continuous
  assert.equal(quantizeMotionTime(0.51, 1), 0.51);
  assert.equal(quantizeMotionTime(0.51, 2), 0.5);
  assert.equal(quantizeMotionTime(0.55, 2), 0.5);
  assert.equal(quantizeMotionTime(0.60, 2), 7 / 12);
});

test('Plajah alpha-matting sprite isolator separates white backdrop, punches holes, and keeps warm cream opaque', () => {
  // Build a 128x128 synthetic watercolor-ink ring on #FFFFFF with an enclosed pure-white center hole
  // AND a warm cream wool/fur patch shielded inside a dark sepia ink wall (matching real sprite scale)
  const W = 128;
  const H = 128;
  const rgba = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const idx = (y * W + x) * 4;
      const dx = x - 64;
      const dy = y - 64;
      const r = Math.hypot(dx, dy);
      if (r >= 18 && r <= 52) {
        // Dark sepia ink ring border with warm cream interior band well inside the outline
        const isCreamPatch = r >= 29 && r <= 41 && dx > 12;
        rgba[idx] = isCreamPatch ? 245 : 74;
        rgba[idx + 1] = isCreamPatch ? 236 : 52;
        rgba[idx + 2] = isCreamPatch ? 212 : 34;
        rgba[idx + 3] = 255;
      } else {
        // Pure neutral #FFFFFF exterior & enclosed center hole
        rgba[idx] = 255;
        rgba[idx + 1] = 255;
        rgba[idx + 2] = 255;
        rgba[idx + 3] = 255;
      }
    }
  }

  const res = isolateSpriteOnWhite(rgba, W, H, {
    punchInteriorWhiteHoles: true,
    minHoleArea: 40,
    squareCenter: true,
    paddingPx: 4,
  });

  assert.equal(res.width, res.height, 'squareCenter must produce wobble-free square sprite');
  assert.equal(res.metrics.interiorHolesPunched, 1, 'Center pure-white wheel/filigree hole must be punched');

  // Corner exterior must be fully transparent (alpha === 0)
  assert.equal(res.rgba[3], 0, 'Exterior corner pixel must be transparent');

  // Dead center inside the ring hole must be transparent (alpha === 0)
  const cx = Math.floor(res.width / 2);
  const cy = Math.floor(res.height / 2);
  assert.equal(res.rgba[(cy * res.width + cx) * 4 + 3], 0, 'Enclosed pure-white center hole must be transparent');

  // Warm cream patch shielded inside the sepia outline must stay solid opaque!
  const creamIdx = (cy * res.width + (cx + 35)) * 4;
  assert.ok(res.rgba[creamIdx + 3] >= 245, `Warm painted cream wool/fur inside sepia outline must remain opaque (got ${res.rgba[creamIdx + 3]})`);

  // Verify every layered sprite declared in WORLD_SPRITE_MANIFEST resolves to a valid self-hosted PNG path
  for (const [world, keys] of Object.entries(WORLD_SPRITE_MANIFEST)) {
    for (const k of keys) {
      assert.ok(SPRITE_URLS[k].startsWith('/academia-games/sprites/') && SPRITE_URLS[k].endsWith('.png'), `Bad sprite URL for ${world}:${k}`);
    }
  }
});
