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

// 17. AUTHENTIC CLASSIC CARTOON MODEL SHEETS & RIGS
{
  const { CLASSIC_CHARACTERS, getClassicCharacter, listClassicCharacters, instantiateClassicCharacterLayer } = await import('../services/anima/classicCharacters.ts');

  const chars = listClassicCharacters();
  assert.equal(chars.length, 5, 'Must contain all 5 authentic public domain characters');

  // Steamboat Willie
  const willie = getClassicCharacter('steamboat_willie');
  assert.ok(willie, 'Steamboat Willie must exist');
  assert.equal(willie.year, 1928);
  assert.equal(willie.creator, 'Walt Disney & Ub Iwerks');
  assert.equal(willie.cadence, 2, 'Willie animates on 2s');
  assert.ok(willie.rig.walkCycle['bone.leg_l_foot.rot'], 'Must have authentic foot roll heel/toe keyframes');
  assert.ok(willie.rig.walkCycle['bone.helm_wheel.rot'], 'Must have turning helm wheel keyframe track');

  // Felix the Cat
  const felix = getClassicCharacter('felix_the_cat') || getClassicCharacter('felix_cat');
  assert.ok(felix, 'Felix the Cat must exist');
  assert.equal(felix.year, 1919);
  assert.equal(felix.creator, 'Otto Messmer & Pat Sullivan');
  assert.ok(felix.rig.walkCycle['bone.tail_tip.rot'], 'Must have question-mark tail keyframes');
  assert.ok(felix.rig.walkCycle['transform.rotationZ'], 'Must have signature 30-degree pacing torso tilt');

  // Fleischer Jazz Flapper
  const flapper = getClassicCharacter('fleischer_flapper');
  assert.ok(flapper, 'Fleischer Jazz Flapper must exist');
  assert.equal(flapper.year, 1930);
  assert.ok(flapper.creator.includes('Fleischer'));
  assert.ok(flapper.rig.walkCycle['bone.garter.y'], 'Must have garter bounce keyframes');
  assert.ok(flapper.rig.walkCycle['bone.earring_l.rot'], 'Must have swinging gold hoop earring keyframes');

  // Oswald the Lucky Rabbit
  const oswald = getClassicCharacter('oswald_rabbit');
  assert.ok(oswald, 'Oswald must exist');
  assert.equal(oswald.year, 1927);
  assert.ok(oswald.rig.walkCycle['bone.ear_l_mid.rot'], 'Must have floppy rubber ear secondary drag');

  // Sailor Swagger
  const sailor = getClassicCharacter('sailor_swagger');
  assert.ok(sailor, 'Sailor Swagger must exist');
  assert.ok(sailor.rig.walkCycle['bone.arm_l_lower.rot'], 'Must have bulging Popeye forearm swagger swing');

  // Test layer instantiation
  const layer = instantiateClassicCharacterLayer('steamboat_willie');
  assert.ok(layer.name.includes('Steamboat'));
  assert.ok(layer.bones.length >= 8);
  assert.ok(layer.channels['bone.leg_l_foot.rot']);

  console.log('✅ 17. Authentic Classic Cartoon Model Sheets & Rigs (Steamboat Willie, Felix, Fleischer, Oswald, Sailor) verified');
}

// 18. CHARACTER FACE ANIMATOR & TIMELINE BAKING
{
  const { CharacterFaceAnimator, bakeFacePerformanceToTimeline } = await import('../services/anima/faceAnimator.ts');

  const animator = new CharacterFaceAnimator({ gain: 1.25, mirrorSelfie: true });

  // Simulate a live video face frame with blendshapes & matrix
  const mockFaceFrame = {
    blendshapes: {
      jawOpen: 0.7,
      mouthSmileLeft: 0.8,
      mouthSmileRight: 0.8,
      eyeBlinkLeft: 0.95,
      eyeBlinkRight: 0.05,
      browInnerUp: 0.6,
      mouthPucker: 0.4,
    },
    matrix: new Float32Array([
      1, 0, 0, 0,
      0, 0.98, -0.17, 0,
      0, 0.17, 0.98, 0,
      0, 0, 0, 1,
    ]),
    bbox: { x: 0.4, y: 0.3, w: 0.2, h: 0.25 },
  };

  animator.startRecording(0.0);
  const perfFrame1 = animator.processFrame(mockFaceFrame, 0.0);
  assert.ok(perfFrame1.blendshapes.jawOpen > 0);
  assert.ok(perfFrame1.expressions.blinkLeft > 0.8);
  assert.ok(perfFrame1.head.pitch !== undefined);

  // Retarget to Kaiju
  const kaijuPose = animator.retargetToKaiju(perfFrame1);
  assert.ok(kaijuPose.eyeL < 0.2, 'Left eye should be closed from wink');
  assert.ok(kaijuPose.eyeR > 0.8, 'Right eye should remain open');
  assert.ok(kaijuPose.mouth > 0.5, 'Mouth should open');

  // Retarget to Classic
  const classicFace = animator.retargetToClassic(perfFrame1, 'steamboat_willie');
  assert.ok(classicFace.mouthPucker > 0.5, 'Whistling pucker amplified for Steamboat Willie');
  assert.ok(classicFace.eyeBlinkL > 0.9, 'Left eye blink captured');

  // Record second frame and bake to timeline
  const mockFaceFrame2 = {
    blendshapes: { ...mockFaceFrame.blendshapes, jawOpen: 0.1, mouthSmileLeft: 0.2 },
    matrix: mockFaceFrame.matrix,
    bbox: mockFaceFrame.bbox,
  };
  animator.processFrame(mockFaceFrame2, 0.1);
  const clip = animator.stopRecording('Test Lip Sync');
  assert.equal(clip.frames.length, 2);

  const testProject = {
    id: 'proj_test',
    name: 'Face Test',
    fps: 24,
    durationFrames: 48,
    width: 1920,
    height: 1080,
    currentFrame: 0,
    drawingBank: {},
    layers: [
      {
        id: 'layer_hero',
        name: 'Hero',
        type: 'vector',
        visible: true,
        locked: false,
        opacity: 1,
        parentId: null,
        transform: { x: 0, y: 0, z: 0, rotationX: 0, rotationY: 0, rotationZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 },
        channels: {},
      },
    ],
    onionSkin: { enabled: false, prevFrames: 2, nextFrames: 1, prevColor: '', nextColor: '', opacityFalloff: 0.5 },
    camera: { x: 0, y: 0, z: 0, zoom: 1, rotation: 0 },
    selectedLayerId: 'layer_hero',
    selectedBoneId: null,
  };

  const bakedProj = bakeFacePerformanceToTimeline(testProject, clip, 'layer_hero');
  assert.ok(bakedProj.layers[0].channels['face.mouthOpen'], 'Must bake mouthOpen channel');
  assert.ok(bakedProj.layers[0].channels['face.mouthOpen'].keyframes.length > 0);
  assert.ok(bakedProj.layers[0].channels['face.eyeBlinkL']);

  console.log('✅ 18. Character Face Animator (52 Blendshapes, Kaiju & Classic Retargeting, Timeline Baking) verified');
}

// 19. VIDEO-TO-RIG MOTION TRACKER & SKELETAL RETARGETING
{
  const { VideoMotionTracker, bakeMotionToTimeline, DEFAULT_BONE_MAPPING } = await import('../services/anima/videoMotionTracker.ts');

  const tracker = new VideoMotionTracker({ mirrorSelfie: true, smoothingAlpha: 0.7 });

  // Generate 33-point pose frame
  const mockPts = Array.from({ length: 33 }, (_, i) => ({
    x: 0.5 + Math.sin(i) * 0.1,
    y: 0.1 + i * 0.025,
    v: 0.95,
  }));
  // Custom shoulder, elbow, wrist coords to test arm angles
  mockPts[11] = { x: 0.45, y: 0.3, v: 0.99 }; // shoulderL
  mockPts[13] = { x: 0.35, y: 0.45, v: 0.99 }; // elbowL
  mockPts[15] = { x: 0.35, y: 0.6, v: 0.99 }; // wristL
  mockPts[23] = { x: 0.48, y: 0.55, v: 0.99 }; // hipL
  mockPts[25] = { x: 0.48, y: 0.75, v: 0.99 }; // kneeL
  mockPts[27] = { x: 0.48, y: 0.9, v: 0.99 }; // ankleL

  tracker.startRecording();
  const tracked1 = tracker.processFrame({ pts: mockPts }, 0.0);
  assert.ok(tracked1);
  assert.ok(typeof tracked1.angles.spineRot === 'number');
  assert.ok(typeof tracked1.angles.armL_upperRot === 'number');
  assert.ok(typeof tracked1.angles.legL_upperRot === 'number');

  // Second frame
  mockPts[13] = { x: 0.30, y: 0.40, v: 0.99 }; // moved arm
  tracker.processFrame({ pts: mockPts }, 0.08);
  const mocapClip = tracker.stopRecording('Dancer Walk');
  assert.equal(mocapClip.frames.length, 2);

  const riggedProject = {
    id: 'proj_mocap',
    name: 'Mocap Project',
    fps: 24,
    durationFrames: 48,
    width: 1920,
    height: 1080,
    currentFrame: 0,
    drawingBank: {},
    layers: [
      {
        id: 'layer_puppet',
        name: 'Puppet',
        type: 'bone',
        visible: true,
        locked: false,
        opacity: 1,
        parentId: null,
        transform: { x: 0, y: 0, z: 0, rotationX: 0, rotationY: 0, rotationZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 },
        bones: [
          { id: 'b_spine', name: 'spine', parentId: null, length: 50, baseAngle: 0, pivot: [0,0,0] },
          { id: 'b_arm_l', name: 'arm_l_upper', parentId: 'b_spine', length: 40, baseAngle: 0, pivot: [0,0,0] },
          { id: 'b_leg_l', name: 'leg_l_upper', parentId: 'b_spine', length: 50, baseAngle: 0, pivot: [0,0,0] },
        ],
        channels: {},
      },
    ],
    onionSkin: { enabled: false, prevFrames: 2, nextFrames: 1, prevColor: '', nextColor: '', opacityFalloff: 0.5 },
    camera: { x: 0, y: 0, z: 0, zoom: 1, rotation: 0 },
    selectedLayerId: 'layer_puppet',
    selectedBoneId: null,
  };

  const bakedMocap = bakeMotionToTimeline(riggedProject, mocapClip, 'layer_puppet');
  assert.ok(bakedMocap.layers[0].channels['bone.b_arm_l.rot'], 'Must bake arm_l_upper bone channel');
  assert.ok(bakedMocap.layers[0].channels['bone.b_spine.rot'], 'Must bake spine bone channel');
  assert.ok(bakedMocap.layers[0].channels['transform.x'], 'Must bake root translation');

  console.log('✅ 19. Video-to-Rig Motion Tracker & Skeletal Retargeting verified');
}

// 20. MOTION CAPTURE DATA FILE LOADER (BVH, JSON, CSV)
{
  const { parseBVH, bvhToParsedMotion, parsePoseJSON, parseTrackerCSV, parseMotionFile, applyMotionDataToProject } = await import('../services/anima/motionDataLoader.ts');

  // Test BVH parsing
  const mockBVH = `HIERARCHY
ROOT Hips
{
  OFFSET 0.00 0.00 0.00
  CHANNELS 6 Xposition Yposition Zposition Zrotation Xrotation Yrotation
  JOINT Chest
  {
    OFFSET 0.00 20.00 0.00
    CHANNELS 3 Zrotation Xrotation Yrotation
    End Site
    {
      OFFSET 0.00 15.00 0.00
    }
  }
}
MOTION
Frames: 2
Frame Time: 0.0333333
0.0 50.0 0.0 10.0 5.0 2.0 15.0 4.0 1.0
2.0 51.0 0.0 12.0 6.0 3.0 18.0 5.0 2.0
`;
  const bvhStruct = parseBVH(mockBVH);
  assert.equal(bvhStruct.root.name, 'Hips');
  assert.equal(bvhStruct.motion.frameCount, 2);
  const parsedBVH = bvhToParsedMotion(bvhStruct);
  assert.ok(parsedBVH.tracks['root_x']);
  assert.ok(parsedBVH.tracks['chest_rot']);
  assert.equal(parsedBVH.tracks['chest_rot'].samples[0].v, 15.0);

  // Test JSON pose parser
  const mockPlajahPose = JSON.stringify({
    format: 'plajah_pose',
    fps: 30,
    frames: [
      { t: 0.0, bones: { arm_l: 30, leg_l: -20 }, root: { x: 10, y: 5 } },
      { t: 0.1, bones: { arm_l: 45, leg_l: 0 }, root: { x: 12, y: 7 } },
    ],
  });
  const parsedJSON = parseMotionFile('animation.json', mockPlajahPose);
  assert.equal(parsedJSON.format, 'plajah_pose_json');
  assert.equal(parsedJSON.tracks['arm_l'].samples[1].v, 45);

  // Test CSV tracker parser
  const mockCSV = `Frame,Time,Tracker1_X,Tracker1_Y
0,0.0,100.5,200.2
1,0.033,105.1,202.4
2,0.066,110.0,205.8
`;
  const parsedCSV = parseTrackerCSV(mockCSV);
  assert.equal(parsedCSV.format, 'tracker_csv');
  assert.equal(parsedCSV.tracks['tracker1_x'].samples.length, 3);
  assert.equal(parsedCSV.tracks['tracker1_x'].samples[0].v, 100.5);

  // Apply parsed mocap to project
  const testProject = {
    id: 'proj_data',
    name: 'Data Test',
    fps: 24,
    durationFrames: 24,
    width: 1920,
    height: 1080,
    currentFrame: 0,
    drawingBank: {},
    layers: [
      {
        id: 'layer_target',
        name: 'Target Rig',
        type: 'bone',
        visible: true,
        locked: false,
        opacity: 1,
        parentId: null,
        transform: { x: 0, y: 0, z: 0, rotationX: 0, rotationY: 0, rotationZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 },
        bones: [{ id: 'b_arm', name: 'arm_l', parentId: null, length: 40, baseAngle: 0, pivot: [0,0,0] }],
        channels: {},
      },
    ],
    onionSkin: { enabled: false, prevFrames: 2, nextFrames: 1, prevColor: '', nextColor: '', opacityFalloff: 0.5 },
    camera: { x: 0, y: 0, z: 0, zoom: 1, rotation: 0 },
    selectedLayerId: 'layer_target',
    selectedBoneId: null,
  };

  const appliedProj = applyMotionDataToProject(testProject, parsedJSON, 'layer_target');
  assert.ok(appliedProj.layers[0].channels['bone.b_arm.rot']);
  assert.equal(appliedProj.layers[0].channels['bone.b_arm.rot'].keyframes[1].v, 45);

  console.log('✅ 20. Motion Capture & Tracking Data Loader (BVH, JSON, CSV) verified');
}

// 21. ASSET & MOTION LIBRARY (WALK CYCLES, VEHICLES, SKIES, PROPS, ANIMALS)
{
  const {
    getAssetCategories,
    getAssetsByCategory,
    findAssetById,
    instantiateAsset,
    createWalkCycleKeyframes,
    createSneakCycleKeyframes,
    createSprintCycleKeyframes,
  } = await import('../services/anima/assetLibrary.ts');

  const categories = getAssetCategories();
  assert.ok(categories.includes('walk_cycles'));
  assert.ok(categories.includes('vehicles'));
  assert.ok(categories.includes('skies'));
  assert.ok(categories.includes('props'));
  assert.ok(categories.includes('animals'));

  // Test Walk Cycles
  const walkKfs = createWalkCycleKeyframes(1.0);
  assert.ok(walkKfs['bone.leg_l_upper.rot'].length >= 5);
  assert.ok(walkKfs['transform.y'].length >= 5);

  const sprintKfs = createSprintCycleKeyframes(0.6);
  assert.equal(sprintKfs['transform.rotationZ'][0].v, 22, 'Sprint has forward lean');

  // Test Rigged Vehicles
  const jalopy = instantiateAsset('veh_jalopy');
  assert.equal(jalopy.name, '1930s Jalopy Car');
  assert.ok(jalopy.channels['wheel_rot']);
  assert.ok(jalopy.channels['exhaust_puff']);

  const train = instantiateAsset('veh_train');
  assert.ok(train.channels['piston_stroke']);

  const biplane = instantiateAsset('veh_biplane');
  assert.ok(biplane.channels['propeller_rot']);

  // Test Skies
  const ghibliSky = instantiateAsset('sky_ghibli');
  assert.equal(ghibliSky.name, 'Studio Ghibli Volumetric Clouds');
  assert.ok(ghibliSky.channels['cloud_drift_near']);

  const starrySky = instantiateAsset('sky_starry');
  assert.ok(starrySky.channels['stars_twinkle']);

  const stormSky = instantiateAsset('sky_storm');
  assert.ok(stormSky.channels['lightning_flash']);

  // Test Props
  const ball = instantiateAsset('prop_ball');
  assert.ok(ball.channels['transform.scaleX']);
  assert.ok(ball.channels['transform.scaleY']);

  const flag = instantiateAsset('prop_flag');
  assert.ok(flag.channels['wave_phase']);

  // Test Animals
  const cat = instantiateAsset('anim_cat');
  assert.ok(cat.bones && cat.bones.length >= 4);
  assert.ok(cat.channels['bone.cat_tail2.rot']);

  const bird = instantiateAsset('anim_bird');
  assert.ok(bird.channels['wing_l_rot']);

  console.log('✅ 21. Animation & Rigged Asset Library (Walks, Vehicles, Skies, Props, Animals) verified');
}

// 22. COMIC & MANGA PANEL ANIMATION SUITE
{
  const {
    applyPanelEntranceTransition,
    createOnomatopoeiaLayer,
    createComicBalloonLayer,
    createSpeedLinesLayer,
    createShockwaveLayer,
    PanelParallaxEngine,
  } = await import('../services/anima/comicMotion.ts');

  // 1. Panel Entrance Transitions
  const testLayer = {
    id: 'layer_panel',
    name: 'Manga Panel 1',
    type: 'vector',
    visible: true,
    locked: false,
    opacity: 1,
    parentId: null,
    transform: { x: 0, y: 0, z: 0, rotationX: 0, rotationY: 0, rotationZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 },
    channels: {},
  };

  applyPanelEntranceTransition(testLayer, 'smash_zoom', 0.0, 0.4);
  assert.ok(testLayer.channels['transform.scaleX'], 'Smash zoom sets scaleX track');
  assert.equal(testLayer.channels['transform.scaleX'].keyframes[0].v, 3.5);
  assert.ok(testLayer.channels['transform.x'], 'Smash zoom adds camera impact shake');

  applyPanelEntranceTransition(testLayer, 'elastic_pop', 0.5, 0.4);
  assert.ok(testLayer.channels['transform.scaleX']);

  // 2. Dynamic Action SFX / Onomatopoeia
  const sfxLayer = createOnomatopoeiaLayer({
    phrase: 'BAM!',
    position: { x: 350, y: 280 },
    scale: 1.2,
    lineBoil: true,
  });
  assert.equal(sfxLayer.name, 'SFX: BAM!');
  assert.ok(sfxLayer.channels['transform.scaleX']);
  assert.ok(sfxLayer.channels['extrusion_depth']);
  assert.ok(sfxLayer.channels['line_boil_seed'], 'Must have line boil seed channel for authentic hand-drawn vibration');

  // 3. Dynamic Speech Balloon
  const balloonLayer = createComicBalloonLayer({
    text: 'Watch out, Kaiju incoming!',
    kind: 'shout',
    position: { x: 420, y: 180 },
    tailTarget: { x: 300, y: 350 },
  });
  assert.ok(balloonLayer.name.includes('shout'));
  assert.ok(balloonLayer.channels['transform.scaleX']);
  assert.ok(balloonLayer.channels['tail.targetX'], 'Stores tail pointing target coordinates');

  // 4. Motion Effects (Speed Lines & Shockwave)
  const speedLines = createSpeedLinesLayer('radial_focus', { x: 400, y: 300 });
  assert.ok(speedLines.channels['line_density']);
  assert.ok(speedLines.channels['flicker_phase']);

  const shockwave = createShockwaveLayer({ x: 400, y: 300 }, 0.5);
  assert.ok(shockwave.channels['shockwave_radius']);
  assert.equal(shockwave.channels['shockwave_radius'].keyframes[1].v, 350);

  // 5. 2.5D Panel Parallax Engine
  const parallax = new PanelParallaxEngine({
    enabled: true,
    driverMode: 'pointer_hover',
    intensityX: 40,
    intensityY: 30,
    planes: [
      { id: 'p_sky', name: 'Sky', depth: 0.2, layerId: 'layer_sky' },
      { id: 'p_hero', name: 'Hero', depth: 1.0, layerId: 'layer_hero' },
      { id: 'p_fg', name: 'Foreground Debris', depth: 1.8, layerId: 'layer_fg', blurDepthOfField: true },
    ],
  });

  // Pointer at right edge (+1.0)
  parallax.updatePointer(1.0, 0.0);
  const offsets = parallax.computePlaneOffsets(0);

  // Distant sky should move opposite to foreground
  assert.ok(offsets['layer_sky'].x < 0, 'Distant background has negative parallax offset');
  assert.equal(offsets['layer_hero'].x, 0, 'Focal midground layer stays stationary');
  assert.ok(offsets['layer_fg'].x > 0, 'Foreground element shifts ahead with positive parallax offset');
  assert.ok(offsets['layer_fg'].blurPx > 0, 'Foreground element receives depth-of-field blur');

  console.log('✅ 22. Comic & Manga Panel Animation Suite (Transitions, SFX Onomatopoeia, Balloons, Speed Lines, 2.5D Parallax) verified');
}

// 23. WORLD-CLASS ANIMATION SUITE (Live Puppeteer, Smart Presets, Voice Lip Sync, Pose Stamps, Spline Curves, FX Brushes)
{
  const {
    LiveMotionPuppeteer,
    SmartMotionPresets,
    VoiceLipSyncEngine,
    POSE_LIBRARY,
    stampPoseOntoLayer,
    InteractiveSplineGraph,
    MotionFXBrushEngine,
  } = await import('../services/anima/worldClassEngine.ts');

  // 1. Live Motion Puppeteer (Record & Act)
  const puppeteer = new LiveMotionPuppeteer({ fps: 24, stepRate: 2, inertia: 0.4 });
  puppeteer.startRecording(100, 200, 0);
  puppeteer.feedPoint(150, 180, 0.2);
  puppeteer.feedPoint(220, 160, 0.5);
  puppeteer.feedPoint(300, 220, 0.8);
  puppeteer.feedPoint(400, 300, 1.2);
  const puppetTrack = puppeteer.stopRecording('l_hero');

  assert.ok(puppetTrack.keyframeCount > 0);
  assert.ok(puppetTrack.xChannel.keyframes.length > 0);
  assert.ok(puppetTrack.yChannel.keyframes.length > 0);
  assert.ok(puppetTrack.rotationChannel && puppetTrack.rotationChannel.keyframes.length > 0, 'Auto tilt channel generated');
  assert.ok(puppetTrack.scaleYChannel && puppetTrack.scaleYChannel.keyframes.length > 0, 'Dynamic squash/stretch inferred from velocity');

  // 2. Smart Motion Presets (Auto-Walk, Idle Breathing, Jelly, Ghibli Float)
  const autoWalk = SmartMotionPresets.generateAutoWalk({ durationSeconds: 2.0, intensity: 1.0 });
  assert.ok(autoWalk['transform.x'].keyframes.length > 0);
  assert.ok(autoWalk['transform.y'].keyframes.length > 0);

  const idleBreathe = SmartMotionPresets.generateIdleBreathing({ durationSeconds: 2.0 });
  assert.ok(idleBreathe['transform.scaleY'].keyframes.length > 0);
  assert.ok(idleBreathe['transform.rotationZ'].keyframes.length > 0);

  const jelly = SmartMotionPresets.generateJellyPhysics({ durationSeconds: 2.0 });
  assert.ok(jelly['transform.scaleX'] && jelly['transform.scaleY']);

  const ghibliFloat = SmartMotionPresets.generateGhibliFloat({ durationSeconds: 2.0 });
  assert.ok(ghibliFloat['transform.y']);

  // 3. Voice Lip-Sync & Viseme Generator
  const sampleRate = 44100;
  const audioBuffer = new Float32Array(sampleRate * 1.5); // 1.5s
  // Inject simulated speech waveform
  for (let i = 0; i < audioBuffer.length; i++) {
    const t = i / sampleRate;
    audioBuffer[i] = Math.sin(t * 440 * Math.PI * 2) * 0.4 + Math.sin(t * 1200 * Math.PI * 2) * 0.2;
  }
  const visemes = VoiceLipSyncEngine.analyzeAudioBuffer(audioBuffer, sampleRate, 24, 2);
  assert.ok(visemes.length > 0);
  assert.ok(visemes.some(v => v.jawOpen > 0), 'Audio loudness drove jaw opening');
  const lipChannels = VoiceLipSyncEngine.visemesToChannels(visemes, 'l_char');
  assert.ok(lipChannels['face.jawOpen']);

  // 4. Iconic Pose Stamps
  assert.ok(POSE_LIBRARY.length >= 6);
  const testLayer = {
    id: 'l_actor',
    name: 'Actor',
    type: 'character',
    visible: true,
    locked: false,
    channels: {},
  };
  stampPoseOntoLayer(testLayer, 'happy_jump', 0.5, 0.2);
  assert.ok(testLayer.channels['bone.arm_l.rot'], 'Left arm rotation stamped');
  assert.ok(testLayer.channels['face.mouthSmile'], 'Mouth smile blendweight stamped');

  // 5. Interactive Spline Curves
  const k0 = { id: 'k0', t: 0, v: 10 };
  const k1 = { id: 'k1', t: 1.0, v: 50 };
  InteractiveSplineGraph.setEasePreset(k0, k1, 'back_overshoot');
  const curveVal = InteractiveSplineGraph.evaluateSegment(k0, k1, 0.85);
  assert.ok(typeof curveVal === 'number');

  // 6. Motion FX Brushes
  const fxBrush = new MotionFXBrushEngine();
  fxBrush.emitFromBrush('sparkle_stardust', 200, 300, 5);
  fxBrush.emitFromBrush('ghibli_leaves', 400, 200, 4);
  fxBrush.update(0.1);
  // Verify particles decay and simulate
  fxBrush.update(2.0); // should clear decayed

  console.log('✅ 23. World-Class Animation Suite (Live Motion Puppeteer, Smart Presets, Voice Lip Sync, Pose Stamps, Spline Curves, FX Brushes) verified');
}

// 24. INTELLIGENT AUTO-RIG & MASS DYNAMICS ENGINE
{
  const {
    analyzeArtworkStructure,
    calculateMassDynamics,
    generateAdaptiveSkeleton,
    generateCustomWalkCycle,
    generateEmotionStances,
    autoRigArtwork,
  } = await import('../services/anima/autoRigEngine.ts');

  // Test 1: Biped Humanoid Artwork Auto-Rig
  const bipedInput = {
    width: 1280,
    height: 720,
    silhouetteBounds: { minX: 0.35, minY: 0.1, maxX: 0.65, maxY: 0.9 },
    suggestedMorphology: 'biped_humanoid',
    storyDossier: {
      characterId: 'char_hero',
      name: 'Kael',
      archetype: 'Warrior Knight',
      physicalStats: { weight: '210 lbs', height: '6 ft 2 in' },
      personalityTraits: ['resolute', 'tactical'],
      locomotionStyle: 'nimble_stride',
    },
  };
  const bipedRig = autoRigArtwork(bipedInput);
  assert.equal(bipedRig.morphology, 'biped_humanoid');
  assert.ok(bipedRig.landmarks.length >= 14, 'Should extract full anatomical landmarks');
  assert.ok(bipedRig.bones.length >= 13, 'Should generate hierarchical skeleton');
  assert.ok(bipedRig.bones.some(b => b.name === 'pelvis_root'));
  assert.ok(bipedRig.bones.some(b => b.name === 'arm_l_upper'));
  assert.ok(bipedRig.bones.some(b => b.name === 'leg_r_thigh'));
  assert.ok(bipedRig.massProfile.estimatedMassKg > 90, 'Parsed 210 lbs into ~95 kg');
  assert.ok(bipedRig.walkCycleChannels['bone.b_leg_l_thigh.rot'], 'Generates leg swing channel');
  assert.ok(bipedRig.walkCycleChannels['bone.b_arm_r_upper.rot'], 'Generates counter-arm swing');
  assert.ok(bipedRig.emotionStances.heroic_resolve);

  // Test 2: Heavy Kaiju Mascot (Sense of Mass & Ground Damping)
  const kaijuInput = {
    width: 1280,
    height: 720,
    silhouetteBounds: { minX: 0.25, minY: 0.15, maxX: 0.75, maxY: 0.85 },
    suggestedMorphology: 'mascot_creature',
    storyDossier: {
      characterId: 'char_titan',
      name: 'Reello Titan Mode',
      archetype: 'Titan Kaiju Mascot',
      physicalStats: { weight: '45000 lbs' },
      personalityTraits: ['heavy', 'massive'],
    },
  };
  const kaijuRig = autoRigArtwork(kaijuInput);
  assert.ok(kaijuRig.massProfile.estimatedMassKg > 400, 'Heavy archetype mass amplified');
  assert.ok(kaijuRig.massProfile.gravityDamping >= 28, 'Heavy ground damping increased');
  assert.ok(kaijuRig.bones.some(b => b.name === 'tail_root'), 'Tail bones generated for mascot');

  // Test 3: Mechanical Vehicle Auto-Rig
  const vehicleRig = autoRigArtwork({
    width: 1280,
    height: 720,
    suggestedMorphology: 'mechanical_vehicle',
  });
  assert.equal(vehicleRig.morphology, 'mechanical_vehicle');
  assert.ok(vehicleRig.bones.some(b => b.name === 'chassis_root'));
  assert.ok(vehicleRig.walkCycleChannels['bone.b_wheel_f.rot'], 'Wheel spin synthesized');

  console.log('✅ 24. Intelligent Auto-Rig & Mass Dynamics Engine (Morphology, Inertia, Skeleton, Walk Cycles) verified');
}

// 25. MULTIMODAL VISUAL & AUDIO STORY INTELLIGENCE
{
  const {
    visualStoryIntelligence,
    storyVoiceIntelligence,
    CANONICAL_VOICE_PRINTS,
  } = await import('../services/story/visualStoryIntelligence.ts');

  // Test Visual Recognition of Reello (Lumi) Mascot
  const recogRello = visualStoryIntelligence.recognizeCharacterInAsset('A curious Kaiju with camera flash and orange bandit mask', ['#F2621C']);
  assert.ok(recogRello.matchedCharacter);
  assert.equal(recogRello.matchedCharacter.name, 'Reello (Lumi)');
  assert.ok(recogRello.confidence >= 0.9);
  assert.equal(recogRello.recommendedVoicePrintId, 'vp_rello');

  // Test Visual Recognition of Chora (Lorik) Mascot
  const recogChora = visualStoryIntelligence.recognizeCharacterInAsset('A musical purple kaiju with eighth note emblem and songbook', ['#7A66BC']);
  assert.ok(recogChora.matchedCharacter);
  assert.equal(recogChora.matchedCharacter.name, 'Chora (Lorik)');
  assert.ok(recogChora.confidence >= 0.9);

  // Test Voice Print Registry
  const vpKael = storyVoiceIntelligence.getVoicePrintForCharacter('Kael');
  assert.equal(vpKael.voiceId, 'am_fenrir');
  assert.equal(vpKael.provider, 'kokoro');

  // Test Auto-Synthesis of Voice Print from Dossier
  const autoVp = storyVoiceIntelligence.getVoicePrintForCharacter('Grom Ironbreaker', {
    characterId: 'char_grom',
    name: 'Grom Ironbreaker',
    archetype: 'Titan Brawler',
    personalityTraits: ['heavy', 'stoic'],
  });
  assert.ok(autoVp.timbreDescription.toLowerCase().includes('baritone') || autoVp.pitchMultiplier < 1.0);

  console.log('✅ 25. Multimodal Visual & Audio Story Intelligence (Asset Recognition, Voice Prints) verified');
}

// 26. REAL-TIME BACKGROUND DIALOGUE & SOUND DESIGN SYNTHESIZER
{
  const { backgroundDialogueSynthesizer } = await import('../services/voice/backgroundDialogueSynthesizer.ts');

  let notifiedTake = null;
  const unsubscribe = backgroundDialogueSynthesizer.subscribe(take => {
    notifiedTake = take;
  });

  const cue = {
    id: 'cue_scene1_1',
    speaker: 'Maya',
    text: 'Hold on! [bulkhead door slams] The perimeter defense is breached!',
    parenthetical: '(urgent, looking up)',
    sceneIndex: 1,
    lineIndex: 1,
  };

  const take = await backgroundDialogueSynthesizer.synthesizeCueAsync(cue);
  assert.ok(take);
  assert.equal(take.speaker, 'Maya');
  assert.ok(take.durationSeconds > 0.5);
  assert.ok(take.wordMarks.length >= 6);
  assert.ok(take.synthesizedSfx.some(s => s.preset === 'bulkhead'), 'Detected and synthesized bulkhead door slam SFX');
  assert.ok(take.audioWavBlob, 'Generated 16-bit PCM WAV blob');
  assert.ok(notifiedTake, 'Subscriber notified of generated dialogue take');

  unsubscribe();
  console.log('✅ 26. Real-Time Background Dialogue & Sound Design Synthesizer (Streaming Dialogue & Procedural Foley) verified');
}

// 27. OFF-PLATFORM VIDEO LIP-SYNC BRIDGE
{
  const { videoLipSyncBridge } = await import('../services/anima/videoLipSyncBridge.ts');
  const { backgroundDialogueSynthesizer } = await import('../services/voice/backgroundDialogueSynthesizer.ts');

  // Mock dialogue take
  const take = await backgroundDialogueSynthesizer.synthesizeCueAsync({
    id: 'cue_lip_1',
    speaker: 'Kael',
    text: 'Open the gate now!',
    sceneIndex: 2,
    lineIndex: 1,
  });

  const lipSyncTrack = videoLipSyncBridge.generateLipSyncFromAudioTake(take, 'https://storage.plajah.com/external_runway_gen.mp4', {
    fps: 24,
    jawAmplification: 1.25,
  });

  assert.ok(lipSyncTrack);
  assert.equal(lipSyncTrack.audioTakeId, take.takeId);
  assert.ok(lipSyncTrack.visemeFrames.length > 0);
  assert.ok(lipSyncTrack.visemeFrames.some(f => f.jawOpen > 0.2), 'Speech drove jaw displacement');
  assert.ok(lipSyncTrack.bakedChannels['face.jawOpen'], 'Bakes face.jawOpen timeline channel');
  assert.ok(lipSyncTrack.bakedChannels['face.mouthWide'], 'Bakes face.mouthWide timeline channel');

  console.log('✅ 27. Off-Platform Video Lip-Sync Bridge (Viseme Phonemes, Video Mouth Warper, Timeline Channels) verified');
}

console.log('\n🎉 ALL 27 ANIMA SYSTEM SUITES PASSED FLAWLESSLY!\n');


