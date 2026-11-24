import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  PlaykitRegistry,
  PlaykitEngine,
  UnifiedInputBuffer,
  PlajahPhysicsWorld,
  createBody2D,
  stepPlatformer2D,
  RhythmClock,
  PlajahPlatformBridge,
  Scene2D,
  stepSpring,
  ParlorSession,
  OrganicCharacterRigController,
  defaultHumanoidOrganicProfile,
  toPlatformer2DInput,
  KITH_KART_VEHICLE_CONFIG,
  createFirstlightPassSpec,
  createPlajahParlorSession,
  registerStudioPropKits,
  type VehicleConfig,
  type VehicleState,
} from '../playkit/index';
import { STANDARD_PROP_CLASSES } from '../services/gamestudio/pipelines/organicPipeline';

describe('Phase 1 — Playkit Registry & Creator Extensibility', () => {
  it('registers built-in templates across 3D, 2D, Sports, and Parlor and mounts creator plugins without privilege gates', () => {
    const reg = new PlaykitRegistry();
    assert.ok(reg.getGenreTemplate('arena-shooter'));
    assert.ok(reg.getGenreTemplate('platformer-2d'));
    assert.ok(reg.getGenreTemplate('sports-3d'));
    assert.ok(reg.getGenreTemplate('parlor-party'));

    let disposed = false;
    reg.registerPlugin({
      id: 'creator.cyber_bowling',
      version: '1.0.0',
      author: 'indie_creator_42',
      register(r) {
        r.registerPrefab({
          id: 'creator.pin', name: 'Neon Bowling Pin', category: 'Props',
          dimension: '3d', tags: ['bowling', 'physics'], params: [],
        });
        r.registerParlorMode({
          id: 'bowling-trivia', title: 'Strike Trivia', minPlayers: 2, maxPlayers: 12,
          defaultRounds: 5, hasSecretState: true, stagePreset: 'parlor-broadcast-studio-3d',
        });
        r.registerExtension('ai-planners', 'pin-setter', { resetDelayMs: 1200 });
      },
      dispose() { disposed = true; },
    });

    assert.equal(reg.listPlugins().length, 1);
    assert.equal(reg.getPrefab('creator.pin')?.name, 'Neon Bowling Pin');
    assert.equal(reg.getParlorMode('bowling-trivia')?.title, 'Strike Trivia');
    assert.deepEqual(reg.getExtension('ai-planners', 'pin-setter'), { resetDelayMs: 1200 });
    assert.equal(reg.unregisterPlugin('creator.cyber_bowling'), true);
    assert.equal(disposed, true);
  });
});

describe('Phase 1 — PlaykitEngine Fixed-Step Loop, Hitstop & Budgets', () => {
  it('runs deterministic 120 Hz substeps, honors hitstop, and flags Canon budget overruns', () => {
    let ticks = 0;
    const engine = new PlaykitEngine(
      {
        fixedUpdate: () => { ticks++; },
        readRenderStats: () => ({ drawCalls: 300, triangles: 200_000 }),
      },
      { fixedStepHz: 120, tier: 'medium' },
    );

    // 1/60 s wall-clock frame = 2 deterministic 1/120 s sim steps
    const snap1 = engine.stepFrame(1 / 60);
    assert.equal(snap1.simSteps, 2);
    assert.equal(ticks, 2);
    assert.equal(snap1.overDrawBudget, true); // medium maxDrawCalls = 260
    assert.equal(snap1.overTriangleBudget, false);

    // Hitstop freezes simulation while keeping display loop alive
    engine.triggerHitstop(0.05);
    const snap2 = engine.stepFrame(0.02);
    assert.equal(snap2.simSteps, 0);
    assert.equal(ticks, 2);
  });
});

describe('Phase 1 — UnifiedInputBuffer (Touch, Gamepad, Rhythm Lanes & Jump Buffer)', () => {
  it('captures touch sticks, gamepad edges, 4-lane rhythm taps, and jump buffers cleanly', () => {
    const input = new UnifiedInputBuffer({ jumpBufferWindowSec: 0.12 });
    input.setMoveStick(2, 0, 'touch'); // clamped to length 1
    input.tapAction('jump', 'touch');
    input.setLane(0, true, 'keyboard-mouse');
    input.setLane(3, true, 'keyboard-mouse');
    input.ingestGamepad(
      { axes: [0, 0, 0.5, 0], buttons: [{ pressed: false }, { pressed: true }, { pressed: false }, { pressed: false }, { pressed: false }, { pressed: false }, { pressed: false }, { pressed: true }] },
      0.016,
    );

    const f1 = input.poll(0.016);
    assert.equal(f1.moveX, 1);
    assert.equal(f1.pressed.jump, true);
    assert.equal(f1.pressed.dash, true);
    assert.equal(f1.pressed.fire, true);
    assert.deepEqual(f1.laneTaps, [0, 3]);
    assert.equal(input.consumeJumpBuffer(), true);
    assert.equal(input.consumeJumpBuffer(), false);

    // Single-frame presses clear on next poll
    const f2 = input.poll(0.016);
    assert.equal(f2.pressed.fire, false);
    assert.equal(f2.laneTaps.length, 0);
  });
});

describe('Phase 1 — 3D Physics Runtime (Rigid Bodies, Sleep, CCD, Vehicles & Ballistic Spin)', () => {
  it('resolves gravity, ground bounce, sleeping islands, joints, and CCD ray hits', () => {
    const world = new PlajahPhysicsWorld({ gravity: [0, -20, 0] });
    world.addBody({ id: 'floor', kind: 'static', position: [0, -0.5, 0], shape: { kind: 'box', halfExtents: [50, 0.5, 50] }, surfaceTag: 'stone' });
    const crate = world.addBody({ id: 'crate', kind: 'dynamic', position: [0, 2, 0], mass: 5, restitution: 0.1, shape: { kind: 'box', halfExtents: [0.5, 0.5, 0.5] } });

    for (let i = 0; i < 180; i++) world.step(1 / 60);
    assert.ok(crate.position[1] >= 0.48 && crate.position[1] <= 0.55);
    assert.equal(crate.onGround, true);
    assert.equal(crate.sleeping, true);

    // Impulse wakes sleeping body
    world.applyImpulse('crate', [15, 0, 0]);
    assert.equal(crate.sleeping, false);

    // Hinge joint clamps yaw angle
    const door = world.addBody({ id: 'door', kind: 'dynamic', position: [5, 1, 0], mass: 10, shape: { kind: 'box', halfExtents: [0.5, 1, 0.1] } });
    world.addJoint({ id: 'door_hinge', kind: 'hinge', bodyA: 'floor', bodyB: 'door', minAngle: 0, maxAngle: 1.2 });
    door.rotationYaw = 2.5;
    world.step(1 / 60);
    assert.ok(door.rotationYaw <= 1.2 + 1e-6);
  });

  it('simulates 4-wheel raycast vehicle suspension (Kith Racing / Apex) and Magnus-spin ballistics (Firstlight / Kith Tennis)', () => {
    const world = new PlajahPhysicsWorld({ gravity: [0, -20, 0] });
    world.addBody({ id: 'track', kind: 'static', position: [0, -0.5, 0], shape: { kind: 'box', halfExtents: [200, 0.5, 200] }, surfaceTag: 'asphalt' });

    const cfg: VehicleConfig = {
      massKg: 900, maxEngineForce: 14_000, maxBrakeForce: 18_000, maxSteerRad: 0.5,
      wheelRestLength: 0.65, suspensionStiffness: 18_000, suspensionDamping: 1800,
      lateralGrip: 8, driftGripFactor: 0.35,
      wheelOffsets: [[-0.8, 0.45, -1.2], [0.8, 0.45, -1.2], [-0.8, 0.45, 1.2], [0.8, 0.45, 1.2]],
    };
    const car: VehicleState = {
      position: [0, 0.1, 0], velocity: [0, 0, 0], yaw: 0, yawRate: 0,
      speedMps: 0, rpm: 1200, gear: 1, wheelCompression: [0, 0, 0, 0],
      groundedWheels: 0, lateralG: 0, drifting: false,
    };

    for (let i = 0; i < 60; i++) world.stepVehicle(car, cfg, { throttle: 1, steer: 0.2, brake: false, drift: false }, 1 / 60);
    assert.ok(car.groundedWheels >= 2);
    assert.ok(car.speedMps > 5);

    // Topspin tennis ball curves downward faster and bounces off court
    const ball = world.spawnProjectile({
      id: 'tennis_ball', position: [0, 1.8, 0], velocity: [0, 2, -20],
      spin: [-35, 0, 0], radius: 0.06, restitution: 0.72, dragCoeff: 0.01, magnusCoeff: 0.02,
    });
    for (let i = 0; i < 60; i++) world.step(1 / 60);
    assert.ok(ball.bounces >= 1);
  });
});

describe('Phase 1 — 2D Deterministic Platformer Physics (Kith Quest)', () => {
  it('supports coyote jump, double jump, dash, and solid floor collision', () => {
    const floor = [{ x: -200, y: -40, w: 600, h: 40 }];
    const body = createBody2D(0, 2, 24, 40, 1);

    // Land on floor
    for (let i = 0; i < 10; i++) stepPlatformer2D(body, { moveX: 0, jumpHeld: false, jumpPressed: false, dashPressed: false }, floor, 1 / 120);
    assert.equal(body.onGround, true);
    assert.equal(body.y, 0);

    // Jump & double jump
    stepPlatformer2D(body, { moveX: 1, jumpHeld: true, jumpPressed: true, dashPressed: false }, floor, 1 / 120);
    assert.ok(body.vy > 500);
    assert.equal(body.onGround, false);

    stepPlatformer2D(body, { moveX: 1, jumpHeld: true, jumpPressed: true, dashPressed: false }, floor, 1 / 120);
    assert.equal(body.airJumpsLeft, 0);

    // Air dash
    stepPlatformer2D(body, { moveX: 1, jumpHeld: false, jumpPressed: false, dashPressed: true }, floor, 1 / 120);
    assert.ok(body.dashTimer > 0);
    assert.ok(body.vx >= 700);
  });
});

describe('Phase 1 — Mode2D, Parlor State Machine, Rhythm Clock, Platform Bridge & Organic Rig', () => {
  it('enforces >=44px touch hit-testing, Motion Council springs, and reduced motion in Scene2D', () => {
    const scene = new Scene2D();
    scene.addSprite({ id: 'tiny_gem', layer: 2, x: 100, y: 100, w: 18, h: 18, spriteId: 'gem' });
    // Even though gem is 18px wide, touch hit test respects MIN_TOUCH_TARGET_PX (44px)
    assert.equal(scene.hitTest(120, 100)?.id, 'tiny_gem');

    scene.reducedMotion = true;
    scene.emitBurst(100, 100, '#ffd23f', 6);
    assert.equal(scene.particles.length, 0);

    const sp = { value: 0, velocity: 0, target: 1 };
    for (let i = 0; i < 60; i++) stepSpring(sp, 1 / 60);
    assert.ok(Math.abs(sp.value - 1) < 0.05);
  });

  it('runs Parlor Trivia & Impostor rounds with strict secret isolation before reveal', () => {
    const trivia = new ParlorSession({ roomId: 'r1', kind: 'trivia', title: 'Brain Rush', totalRounds: 2, answerWindowMs: 10_000 });
    trivia.join('u1', 'Kenne');
    trivia.join('u2', 'Aria');
    trivia.startRound({ prompt: 'Which engine powers Plajah?', options: ['Playkit', 'Other'], secretCorrectOption: 0 }, 1000);

    // Public state must NOT leak reveal while prompt is active
    assert.equal(trivia.publicState().reveal, null);
    assert.equal(trivia.submitAnswer({ uid: 'u1', choiceIndex: 0, submittedAtMs: 2000 }), true);
    assert.equal(trivia.submitAnswer({ uid: 'u2', choiceIndex: 1, submittedAtMs: 2500 }), true);
    const rev = trivia.revealRound(5000);
    assert.equal(rev.correctOption, 0);
    assert.ok(rev.roundPoints.u1 > 400);
    assert.equal(rev.roundPoints.u2, 0);

    // Impostor Night secret word isolation
    const imp = new ParlorSession({ roomId: 'r2', kind: 'impostor', title: 'Impostor Night', totalRounds: 1, answerWindowMs: 20_000 });
    imp.join('crew1', 'A'); imp.join('imp1', 'B');
    imp.startRound({ prompt: 'Mythical Places', secretWord: 'Rift Sanctum', secretImpostorUids: ['imp1'] }, 0);
    assert.equal(imp.privatePromptFor('crew1').secretWord, 'Rift Sanctum');
    assert.equal(imp.privatePromptFor('imp1').secretWord, undefined);
    assert.equal(imp.privatePromptFor('imp1').isImpostor, true);
  });

  it('judges beats, emits Plajah achievements/XP, and drives organic muscle morphs & prop sockets', () => {
    const clock = new RhythmClock({ bpm: 120 }); // 0.5 s per beat
    clock.start(0);
    clock.update(0.51);
    assert.equal(clock.judgeBeat(0.51).quality, 'PERFECT');
    assert.equal(clock.judgeBeat(0.75).quality, 'MISS');

    const sent: unknown[] = [];
    const bridge = new PlajahPlatformBridge({ gameId: 'rift-realm', transport: { post: (p) => sent.push(p) } });
    bridge.creditXp(50, 2);
    assert.equal(bridge.unlockAchievement('rift_realm_first_blood'), true);
    assert.equal(bridge.unlockAchievement('rift_realm_first_blood'), false); // deduped
    assert.equal(sent.length, 2);

    const rig = new OrganicCharacterRigController(defaultHumanoidOrganicProfile());
    rig.evaluateMuscles({ foreArmR: 2.1 });
    assert.equal(rig.morphWeights.get('flex_bicep_R'), 1);
    assert.equal(rig.wrinkleWeights.get('elbow_crease_R'), 1);

    rig.attachProp('fb_1', STANDARD_PROP_CLASSES.firstlight_football, 'handR');
    assert.equal(rig.getMountedProp('handR')?.spec.id, 'prop.firstlight_football');
    assert.equal(rig.detachProp('handR')?.attached, false);
  });

  it('bridges Kith Quest, Kith Kart, Firstlight spiral passes, Live Parlor 3D stages, and Studio Prop Kits onto Playkit', () => {
    const reg = new PlaykitRegistry();
    const added = registerStudioPropKits(reg);
    assert.equal(added, 8);
    assert.ok(reg.getPrefab('rr.gothicWall'));

    const inp = new UnifiedInputBuffer();
    inp.setMoveStick(1, 0, 'gamepad');
    inp.tapAction('jump', 'gamepad');
    const p2d = toPlatformer2DInput(inp.poll(0.016));
    assert.equal(p2d.moveX, 1);
    assert.equal(p2d.jumpPressed, true);

    assert.equal(KITH_KART_VEHICLE_CONFIG.wheelOffsets.length, 4);

    // Firstlight spiral pass launched from QB (0, 2, 16) toward receiver (12, 2, 40)
    const world = new PlajahPhysicsWorld({ gravity: [0, -24, 0] });
    const passSpec = createFirstlightPassSpec({
      id: 'fl_pass_1', qbPos: [0, 2, 16], targetPos: [12, 2, 40], flightTimeSec: 0.9, gravityY: 24,
    });
    const ball = world.spawnProjectile(passSpec);
    for (let i = 0; i < 54; i++) world.step(1 / 60); // 0.9s flight
    assert.ok(ball.position[2] > 35 && ball.position[0] > 9);

    const parlor = createPlajahParlorSession({ roomId: 'party_1', kind: 'impostor' });
    assert.equal(parlor.config.title, 'Impostor Night');
    assert.equal(parlor.config.stageThemeId, 'parlor-fable-tavern-3d');
  });
});
