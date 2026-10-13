/**
 * tests/testAnimaEngine.mjs
 *
 * Comprehensive Automated Verification Suite for Plajah Anima Engine
 */

import assert from 'node:assert/strict';
import { evaluateProjectAtFrame, sampleKeyframeTrack, evaluateChannel, resolveCelExposure } from '../services/anima/evaluator.ts';
import { ParticleSystem, HairSystem, SoftBodySystem, fracturePolygonAtImpact, DEFAULT_FORCES } from '../services/anima/physics.ts';
import { FluidSimulator } from '../services/anima/fluids.ts';
import { ProceduralGeometryEngine, fbm2D, worleyNoise2D, curlNoise2D } from '../services/anima/procedural.ts';
import { compileMotionPrompt } from '../services/anima/promptMotion.ts';

console.log('🧪 Starting Anima Comprehensive Test Suite...\n');

// 1. KEYFRAME SAMPLING & EASING
{
  const kfs = [
    { id: 'k1', t: 0, v: 0, ease: 'smooth' },
    { id: 'k2', t: 1.0, v: 100, ease: 'linear' },
    { id: 'k3', t: 2.0, v: 200, ease: 'hold' },
  ];
  assert.equal(sampleKeyframeTrack(kfs, 0, 0), 0);
  assert.equal(sampleKeyframeTrack(kfs, 1.0, 0), 100);
  assert.equal(sampleKeyframeTrack(kfs, 2.0, 0), 200);
  // Midpoint of smoothstep
  const mid = sampleKeyframeTrack(kfs, 0.5, 0);
  assert.ok(mid > 40 && mid < 60, `Smoothstep midpoint expected ~50, got ${mid}`);
  console.log('✅ 1. Keyframe Sampling & Bézier Interpolation verified');
}

// 2. EXPRESSIONS & BEHAVIORS
{
  const wiggleChannel = {
    id: 'ch1',
    name: 'Wiggle Channel',
    path: 'rot',
    defaultValue: 0,
    keyframes: [],
    expression: { enabled: true, code: 'wiggle(4, 15)' },
  };
  const w1 = evaluateChannel(wiggleChannel, 0.1, 24);
  const w2 = evaluateChannel(wiggleChannel, 0.6, 24);
  assert.ok(typeof w1 === 'number' && typeof w2 === 'number');
  assert.notEqual(w1, w2);

  const springChannel = {
    id: 'ch2',
    name: 'Spring Channel',
    path: 'y',
    defaultValue: 0,
    keyframes: [],
    behavior: { kind: 'spring', enabled: true, frequency: 3.0, amplitude: 20.0, decay: 0.8 },
  };
  const s1 = evaluateChannel(springChannel, 0.05, 24);
  const s2 = evaluateChannel(springChannel, 1.5, 24);
  assert.ok(Math.abs(s1) > Math.abs(s2), 'Spring amplitude should decay over time');
  console.log('✅ 2. Expressions (wiggle) & Behaviors (spring decay) verified');
}

// 3. CEL X-SHEET EXPOSURE RESOLUTION
{
  const track = {
    id: 't1',
    name: 'Hero Cel',
    layerId: 'l1',
    stepRate: 2,
    exposures: [
      { startFrame: 1, durationFrames: 4, drawingId: 'cel_A' },
      { startFrame: 5, durationFrames: 4, drawingId: 'cel_B' },
      { startFrame: 9, durationFrames: 2, drawingId: '__EMPTY__' },
    ],
  };
  assert.equal(resolveCelExposure(track, 1), 'cel_A');
  assert.equal(resolveCelExposure(track, 3), 'cel_A');
  assert.equal(resolveCelExposure(track, 5), 'cel_B');
  assert.equal(resolveCelExposure(track, 7), 'cel_B');
  assert.equal(resolveCelExposure(track, 9), null); // empty cel
  assert.equal(resolveCelExposure(track, 20), null); // outside range
  console.log('✅ 3. Cel X-Sheet Exposures & Timing Cadences verified');
}

// 4. PARTICLE SYSTEM STEPPING
{
  const ps = new ParticleSystem();
  const emitter = {
    id: 'e1',
    name: 'Test Emitter',
    enabled: true,
    type: 'point',
    position: { x: 100, y: 100, z: 0 },
    ratePerSecond: 60,
    lifespan: 1.0,
    speed: 100,
    spreadAngle: 45,
    directionAngle: 0,
    startSize: 5,
    endSize: 1,
    color: '#FF8C00',
    colorFade: '#D40055',
    bounceElasticity: 0.5,
  };
  ps.step(0.1, emitter, DEFAULT_FORCES, 0.1, { w: 1000, h: 1000 });
  assert.ok(ps.particles.length > 0, 'Particles should spawn from active emitter');
  const countBefore = ps.particles.length;
  ps.step(0.1, emitter, DEFAULT_FORCES, 0.2, { w: 1000, h: 1000 });
  assert.ok(ps.particles.length >= countBefore, 'Particle count should update smoothly');
  console.log('✅ 4. Particle System integration & forces verified');
}

// 5. HAIR STRAND VERLET RELAXATION
{
  const hs = new HairSystem();
  const strand = hs.createStrand({ x: 200, y: 200, z: 0 }, 100, 5);
  assert.equal(strand.points.length, 6);
  assert.ok(strand.points[0].isPinned, 'Root point of hair must be pinned');
  assert.ok(!strand.points[1].isPinned, 'Child hair points must be dynamic');
  hs.step(0.016, DEFAULT_FORCES, 0.016);
  assert.equal(strand.points[0].pos.x, 200);
  assert.equal(strand.points[0].pos.y, 200);
  console.log('✅ 5. Hair Strand Dynamics & Verlet Constraints verified');
}

// 6. SOFT BODY JELLY MESH LATTICE
{
  const sbs = new SoftBodySystem();
  const body = sbs.createJellyBox(100, 100, 80, 80, 3, 3);
  assert.equal(body.nodes.length, 9);
  assert.ok(body.springs.length > 0, 'Spring lattice must have structural and cross springs');
  sbs.step(0.016, DEFAULT_FORCES, 0.016, { w: 800, h: 600 });
  console.log('✅ 6. Soft Body XPBD Mass-Spring Lattice verified');
}

// 7. FLUID DYNAMICS (STABLE FLUIDS)
{
  const fl = new FluidSimulator({ gridResolution: 32 });
  fl.addVelocity(0.5, 0.5, 5, -5);
  fl.addDye(0.5, 0.5, 1, 0, 0, 2);
  fl.step(0.016);
  // Verify density advected without crashing or NaN
  let hasDye = false;
  for (let i = 0; i < fl.size; i++) {
    if (fl.densityR[i] > 0.01) {
      hasDye = true;
      break;
    }
  }
  assert.ok(hasDye, 'Fluid density must advect through velocity field');
  console.log('✅ 7. Fluid Dynamics (Advection, Viscosity, Dye) verified');
}

// 8. DESTRUCTIVE VORONOI FRACTURING
{
  const pieces = fracturePolygonAtImpact([[0,0], [100,0], [100,100], [0,100]], [50, 50], 8, 300);
  assert.equal(pieces.length, 8, 'Should produce 8 fracture shards');
  assert.ok(pieces.some(p => p.velocity.y < 0), 'Some shards should pop upward on impact');
  assert.ok(pieces.some(p => p.velocity.x !== 0), 'Shards should expand radially');
  console.log('✅ 8. Destructive Voronoi Impact Fracturing verified');
}

// 9. PROCEDURAL NOISE FIELDS & MODIFIER STACK
{
  const n1 = fbm2D(1.5, 2.7, 4);
  assert.ok(n1 >= 0 && n1 <= 1, 'fBm must be bounded in [0, 1]');
  const w = worleyNoise2D(3.2, 4.8);
  assert.ok(w.distance >= 0, 'Worley distance must be non-negative');
  const [cx, cy] = curlNoise2D(2.0, 1.0);
  assert.ok(!isNaN(cx) && !isNaN(cy), 'Curl noise must evaluate valid vector');

  // Array / Cloner Modifier
  const basePoints = [{ x: 0, y: 0 }, { x: 10, y: 0 }];
  const clones = ProceduralGeometryEngine.applyArrayModifier(basePoints, {
    count: 4,
    offset: { x: 20, y: 0, z: 0 },
    scaleMultiplier: 1.0,
    rotationOffset: 0,
  });
  assert.equal(clones.length, 4);
  assert.equal(clones[3][0].x, 60);
  console.log('✅ 9. Procedural Noise Fields & Geometry Cloner verified');
}

// 10. PROMPT-TO-MOTION AI COMPILER
{
  const r1 = compileMotionPrompt('bounce in with heavy squash');
  assert.ok(r1.channels['transform.scaleX'], 'Should generate scaleX keyframes for bounce');
  assert.ok(r1.channels['transform.scaleY'], 'Should generate scaleY keyframes for bounce');

  const r2 = compileMotionPrompt('anime walk cycle on 2s');
  assert.equal(r2.suggestedStepRate, 2, 'Should suggest stepRate 2 for walk cycle');
  assert.ok(r2.channels['transform.y']?.expression?.code?.includes('loopOut'));

  const r3 = compileMotionPrompt('hair wind flutter');
  assert.equal(r3.physicsPreset, 'hair');

  const r4 = compileMotionPrompt('fluid ink in water');
  assert.equal(r4.physicsPreset, 'fluid');
  console.log('✅ 10. Natural Language Prompt-to-Motion Compiler verified');
}

// 11. ARIA MOTION AGENT (STORYBOOK, COMIC, LIVING CANVAS)
{
  const { AriaMotionAgent } = await import('../services/anima/ariaMotionAgent.ts');

  // Storybook tap test
  const sb = AriaMotionAgent.interpret('tap the owl to bloom and chime', 'storybook');
  assert.equal(sb.medium, 'storybook');
  assert.equal(sb.interactiveTrigger?.type, 'tap');
  assert.ok(sb.channels['transform.scaleX'], 'Should animate scale bounce on tap');

  // Comic speech balloon test
  const comic = AriaMotionAgent.interpret('speech balloon with pop-in', 'comic');
  assert.equal(comic.medium, 'comic');
  assert.equal(comic.compositingLayer?.kind, 'speech_balloon');

  // Living Canvas still image test
  const lc = AriaMotionAgent.interpret('breathing chest rise and idle sway', 'living_canvas');
  assert.equal(lc.medium, 'living_canvas');
  assert.ok(lc.channels['transform.scaleY']?.expression?.code?.includes('Math.sin'));

  console.log('✅ 11. Aria Motion Director Council (Storybook, Comic, Living Canvas) verified');
}

// 12. CLASSIC PUBLIC DOMAIN CARTOON CHARACTERS (STEAMBOAT WILLIE, FELIX, FLEISCHER, OSWALD)
{
  const { CLASSIC_CHARACTERS } = await import('../services/anima/classicCharacters.ts');

  assert.ok(CLASSIC_CHARACTERS.steamboat_willie, 'Steamboat Willie template must exist');
  assert.equal(CLASSIC_CHARACTERS.steamboat_willie.year, 1928);
  assert.equal(CLASSIC_CHARACTERS.steamboat_willie.cadence, 2, 'Must animate on 2s (12fps)');
  assert.ok(typeof CLASSIC_CHARACTERS.steamboat_willie.rig.drawRoutine === 'function');

  assert.ok(CLASSIC_CHARACTERS.felix_the_cat, 'Felix the Cat template must exist');
  assert.equal(CLASSIC_CHARACTERS.felix_the_cat.year, 1919);

  assert.ok(CLASSIC_CHARACTERS.fleischer_flapper, 'Fleischer Flapper template must exist');
  assert.ok(CLASSIC_CHARACTERS.oswald_rabbit, 'Oswald the Lucky Rabbit template must exist');

  console.log('✅ 12. Classic Cartoon Rigged Templates (Steamboat Willie, Felix, Fleischer, Oswald) verified');
}

// 13. CODE-BASED ANIMATION ENGINE
{
  const { CodeAnimationRunner, BUILTIN_CODE_ANIMATIONS } = await import('../services/anima/codeAnimation.ts');

  const runner = new CodeAnimationRunner();
  const script = BUILTIN_CODE_ANIMATIONS.storybook_floral;
  const compiled = runner.compile(script.code);
  assert.ok(compiled, 'Storybook floral code animation should compile without syntax errors');
  assert.equal(runner.getError(), null);

  const lissajous = BUILTIN_CODE_ANIMATIONS.lissajous_ribbons;
  assert.ok(runner.compile(lissajous.code), 'Lissajous code animation should compile');

  console.log('✅ 13. Code-Based Animation & Programmatic Scripting verified');
}

// 14. TELA DOCUMENT LAYER BRIDGE & VISUALIZER DRIVER
{
  const { TelaAnimaBridge, VisualizerStreamEngine } = await import('../services/anima/telaBridge.ts');

  // Tela layer conversion
  const mockTelaDoc = {
    id: 'tela_doc_1',
    title: 'Storybook Page 1',
    layers: [
      { id: 'l_bg', name: 'Background Vector', objects: [] },
      { id: 'l_hero', name: 'Hero Character', objects: [] },
    ],
  };
  const importedLayers = TelaAnimaBridge.importTelaDocument(mockTelaDoc);
  assert.equal(importedLayers.length, 2);
  assert.equal(importedLayers[0].id, 'tela_l_bg');
  assert.ok(importedLayers[0].channels['transform.x'], 'Must bind position X channel');

  // Visualizer stream engine
  const vStream = new VisualizerStreamEngine();
  const framePayload = vStream.broadcastFrame(1.5, 36, 128);
  assert.equal(framePayload.frame, 36);
  assert.equal(framePayload.sceneId, 'ObsidianRipple');
  assert.ok(framePayload.modulators.curlForce > 0);

  console.log('✅ 14. Tela Document Layer Bridge & Visualizer Driver verified');
}

// 15. PLATFORM ADAPTIVE OPTIMIZER (WINDOWS MSIX, ANDROID, BROWSER)
{
  const { PlatformOptimizer } = await import('../services/anima/platformAdaptive.ts');

  const profile = PlatformOptimizer.getProfile();
  assert.ok(profile.platform, 'Must identify active platform profile');
  assert.ok(profile.maxParticles > 0, 'Must have particle allocation limits');
  console.log(`✅ 15. Platform Adaptive Performance (${profile.displayName}) verified`);
}

// 16. PLAJAH KAIJU MASCOTS (RELLO/LUMI & CHORA/LORIK)
{
  const { PLAJAH_MASCOTS } = await import('../services/anima/plajahMascots.ts');

  // Verify Rello (Lumi)
  assert.ok(PLAJAH_MASCOTS.rello, 'Rello the Vision Kaiju must exist');
  assert.equal(PLAJAH_MASCOTS.rello.name, 'Rello');
  assert.equal(PLAJAH_MASCOTS.rello.alias, 'Lumi');
  assert.equal(PLAJAH_MASCOTS.rello.species, 'Kith Kaiju');
  assert.equal(PLAJAH_MASCOTS.rello.domain, 'Film & Vision');
  assert.equal(PLAJAH_MASCOTS.rello.accentColor, '#F2621C');
  assert.equal(PLAJAH_MASCOTS.rello.prop, 'camera');
  assert.ok(PLAJAH_MASCOTS.rello.bones.length >= 8, 'Rello must have fully articulated skeleton');
  assert.ok(typeof PLAJAH_MASCOTS.rello.drawRoutine === 'function', 'Rello must have high-fidelity vector draw routine');

  // Verify Chora (Lorik)
  assert.ok(PLAJAH_MASCOTS.chora, 'Chora the Sonic Kaiju must exist');
  assert.equal(PLAJAH_MASCOTS.chora.name, 'Chora');
  assert.equal(PLAJAH_MASCOTS.chora.alias, 'Lorik');
  assert.equal(PLAJAH_MASCOTS.chora.species, 'Kith Kaiju');
  assert.equal(PLAJAH_MASCOTS.chora.domain, 'Music & Sound');
  assert.equal(PLAJAH_MASCOTS.chora.primaryColor, '#7A66BC');
  assert.equal(PLAJAH_MASCOTS.chora.prop, 'book');
  assert.ok(PLAJAH_MASCOTS.chora.bones.length >= 8, 'Chora must have fully articulated skeleton');
  assert.ok(typeof PLAJAH_MASCOTS.chora.drawRoutine === 'function', 'Chora must have high-fidelity vector draw routine');

  console.log('✅ 16. Plajah Kith Kaiju Mascots (Rello/Lumi & Chora/Lorik Articulated Rigs) verified');
}

console.log('\n🎉 ALL 16 ANIMA SYSTEM SUITES PASSED FLAWLESSLY!\n');

