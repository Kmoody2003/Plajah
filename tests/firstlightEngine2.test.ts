import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { SOL_TEAMS, SOL_TEAM_LIST, cloneTeam, resolveMatchupKits } from '../components/sports/firstlight/game/leagueData';
import { motionStudioClipToThree, pickArchetypeForRole } from '../components/sports/firstlight/game/RiggedPlayerLoader';
import type { MotionClip } from '../services/mocap/types';
import { getGameplayTuning } from '../components/sports/firstlight/game/SkillConfig';
import {
  OFFENSIVE_PLAYBOOK,
  DEFENSIVE_PLAYBOOK,
  buildOffenseRosterForPlay,
  buildDefenseRosterForPlay,
  recommendCoachPlay,
  recommendDefensePlay,
} from '../components/sports/firstlight/game/playbook';
import {
  applyArcadeEvent,
  createInitialArcadeState,
  formatDownLabel,
  formatGameClock,
  formatYardSpot,
} from '../components/sports/firstlight/game/GameRules';
import { evaluateFieldGoal, resolveCatch } from '../components/sports/firstlight/game/PassRules';
import { FIELD } from '../components/sports/firstlight/game/constants';
import { DriveState } from '../components/sports/firstlight/types';

test('SOL Gridiron League has 8 distinct Elohim SOL timeline teams with contrasting kits', () => {
  assert.equal(SOL_TEAM_LIST.length, 8);
  const ids = new Set(SOL_TEAM_LIST.map((t) => t.id));
  const abbrs = new Set(SOL_TEAM_LIST.map((t) => t.abbr));
  assert.equal(ids.size, 8);
  assert.equal(abbrs.size, 8);

  const home = cloneTeam('AURORA');
  const away = cloneTeam('IRONPORT');
  const { homeKit, awayKit } = resolveMatchupKits(home, away);
  assert.equal(homeKit.primaryColor, SOL_TEAMS.AURORA.primaryColor);
  assert.notEqual(awayKit.primaryColor.toLowerCase(), homeKit.primaryColor.toLowerCase());
});

test('SkillConfig scales difficulty monotonically from ROOKIE to LEGEND and boosts ARCADE', () => {
  const rookie = getGameplayTuning('ROOKIE', 'SIMULATION');
  const pro = getGameplayTuning('PRO', 'SIMULATION');
  const allPro = getGameplayTuning('ALL_PRO', 'SIMULATION');
  const legend = getGameplayTuning('LEGEND', 'SIMULATION');

  assert.ok(rookie.pocketTime > pro.pocketTime && pro.pocketTime > allPro.pocketTime && allPro.pocketTime > legend.pocketTime);
  assert.ok(rookie.catchRadius > pro.catchRadius && pro.catchRadius > allPro.catchRadius && allPro.catchRadius > legend.catchRadius);
  assert.ok(rookie.interceptRadius < pro.interceptRadius && pro.interceptRadius < allPro.interceptRadius && allPro.interceptRadius < legend.interceptRadius);
  assert.ok(rookie.passRushShedScale < legend.passRushShedScale);
  assert.equal(rookie.autoCoachTips, true);
  assert.equal(legend.autoCoachTips, false);

  const arcadePro = getGameplayTuning('PRO', 'ARCADE');
  assert.ok(arcadePro.speedMultiplier > pro.speedMultiplier);
  assert.ok(arcadePro.catchRadius > pro.catchRadius);
  assert.ok(arcadePro.tackleBreakBase > pro.tackleBreakBase);
});

test('Every offensive and defensive play spawns full 11-man formations cleanly', () => {
  const offTeam = cloneTeam('AURORA');
  const defTeam = cloneTeam('CURRENT');

  for (const play of OFFENSIVE_PLAYBOOK) {
    const { players } = buildOffenseRosterForPlay(play.id, -25, offTeam, 1.0);
    assert.equal(players.length, 10, `Offense ${play.id} should spawn 10 active units (QB/K + 5 OL + 4 skill)`);
    assert.equal(players.filter((p) => p.role === 'OL').length, 5);

    for (const defPlay of DEFENSIVE_PLAYBOOK) {
      const defenders = buildDefenseRosterForPlay(defPlay.id, -25, players, defTeam, 1.0);
      assert.equal(defenders.length, 11, `Defense ${defPlay.id} vs ${play.id} should spawn 11 defenders`);
    }
  }
});

test('Coach recommendations handle 4th-down field goals, punts, and goal-line situations', () => {
  const baseDrive: DriveState = {
    down: 4,
    yardsToGo: 7,
    ballYardLine: 72,
    quarter: 2,
    gameClockSeconds: 90,
    playClock: 25,
    offenseTeam: cloneTeam('AURORA'),
    defenseTeam: cloneTeam('IRONPORT'),
    possession: 'USER',
    driveStartYardLine: 25,
    playsRun: 6,
  };

  assert.equal(recommendCoachPlay(baseDrive), 'ST_FIELD_GOAL');
  assert.equal(recommendCoachPlay({ ...baseDrive, ballYardLine: 35 }), 'ST_PUNT');
  assert.equal(recommendDefensePlay({ ...baseDrive, down: 1, yardsToGo: 2, ballYardLine: 96 }), 'DEF_GOAL_LINE');
});

test('Arcade Fever Jam heat state progresses from normal -> Heating Up -> ON FIRE! and cools down', () => {
  let state = createInitialArcadeState();
  assert.equal(state.heatLevel, 0);

  let step = applyArcadeEvent(state, 'COMPLETION');
  state = step.next;
  assert.equal(state.heatLevel, 0);
  assert.equal(step.ignitedFire, false);

  step = applyArcadeEvent(state, 'FIRST_DOWN');
  state = step.next;
  assert.equal(state.heatLevel, 1);
  assert.equal(state.calloutText, "HE'S HEATING UP!");

  step = applyArcadeEvent(state, 'BIG_PLAY');
  state = step.next;
  assert.equal(state.heatLevel, 2);
  assert.equal(step.ignitedFire, true);
  assert.equal(state.calloutText, "HE'S ON FIRE!!");
  assert.ok(state.stylePoints > 0);
  assert.ok(state.fireTimeRemaining > 0);

  step = applyArcadeEvent(state, 'COOL_DOWN');
  assert.equal(step.next.heatLevel, 0);
  assert.equal(step.next.streakCount, 0);
  assert.equal(step.next.comboMultiplier, 1);
});

test('GameRules formatters produce broadcast-accurate clock, down, and yard spot labels', () => {
  assert.equal(formatGameClock(125), '2:05');
  assert.equal(formatGameClock(0), '0:00');
  assert.equal(formatDownLabel(1, 10, 25), '1ST & 10');
  assert.equal(formatDownLabel(3, 5, 95), '3RD & GOAL');
  assert.equal(formatYardSpot(50, 'AUR', 'IRN'), '50 YD LINE');
  assert.equal(formatYardSpot(25, 'AUR', 'IRN'), 'AUR 25');
  assert.equal(formatYardSpot(78, 'AUR', 'IRN'), 'IRN 22');
});

test('evaluateFieldGoal classifies GOOD, DOINK_MISS, WIDE_LEFT, WIDE_RIGHT, and SHORT', () => {
  assert.equal(evaluateFieldGoal({ x: 0, y: 6.5 }), 'GOOD');
  assert.equal(evaluateFieldGoal({ x: 2.8, y: 3.4 }), 'GOOD');
  assert.equal(evaluateFieldGoal({ x: 3.1, y: 5.0 }), 'DOINK_MISS');
  assert.equal(evaluateFieldGoal({ x: -3.2, y: 4.5 }), 'DOINK_MISS');
  assert.equal(evaluateFieldGoal({ x: -5.0, y: 5.5 }), 'WIDE_LEFT');
  assert.equal(evaluateFieldGoal({ x: 4.8, y: 5.5 }), 'WIDE_RIGHT');
  assert.equal(evaluateFieldGoal({ x: 0.2, y: 2.5 }), 'SHORT');
});

test('resolveCatch respects skill catchRadius and Arcade ON FIRE bonus while preserving defaults', () => {
  const ball = { x: 0, y: 1.6, z: 10 };
  const wr = { x: 1.9, z: 10 };
  const def = [{ x: 4, z: 10 }];

  // Default 1.65 radius -> incomplete
  assert.equal(resolveCatch(ball, wr, def, FIELD.WIDTH), 'INCOMPLETE');
  // Rookie wide catchRadius -> complete
  assert.equal(resolveCatch(ball, wr, def, FIELD.WIDTH, { catchRadius: 2.25 }), 'COMPLETE');
  // Arcade ON FIRE widens reach -> complete
  assert.equal(resolveCatch(ball, wr, def, FIELD.WIDTH, { catchRadius: 1.65, isArcadeFire: true }), 'COMPLETE');
});

test('Plajah Character Forge rigged football GLBs exist with valid glTF headers and contract skeleton', () => {
  const dir = path.resolve('public/firstlight/assets/characters');
  for (const arch of ['qb', 'skill', 'power', 'lineman']) {
    const file = path.join(dir, `${arch}.glb`);
    assert.ok(fs.existsSync(file), `Missing Character Forge rigged GLB: ${file}`);
    const buf = fs.readFileSync(file);
    assert.equal(buf.readUInt32LE(0), 0x46546c67, `${arch}.glb should start with glTF magic`);
    const jsonLen = buf.readUInt32LE(12);
    const gltfJson = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'));
    const nodeNames = new Set((gltfJson.nodes as { name?: string }[]).map((n) => n.name));
    for (const joint of ['Hips', 'Spine', 'Spine2', 'Neck', 'Head', 'LeftArm', 'RightHand', 'LeftUpLeg', 'RightFoot', 'socket_hand_R']) {
      assert.ok(nodeNames.has(joint), `${arch}.glb missing contract joint/socket: ${joint}`);
    }
    const matNames = new Set((gltfJson.materials as { name?: string }[]).map((m) => m.name));
    for (const mat of ['skin', 'jersey', 'pants', 'helmetShell', 'facemask', 'cleats']) {
      assert.ok(matNames.has(mat), `${arch}.glb missing semantic material: ${mat}`);
    }
  }

  assert.equal(pickArchetypeForRole('QB'), 'qb');
  assert.equal(pickArchetypeForRole('OL'), 'lineman');
  assert.equal(pickArchetypeForRole('DL'), 'lineman');
  assert.equal(pickArchetypeForRole('LB'), 'power');
  assert.equal(pickArchetypeForRole('TE'), 'power');
  assert.equal(pickArchetypeForRole('WR'), 'skill');
  assert.equal(pickArchetypeForRole('CB'), 'skill');
});

test('motionStudioClipToThree converts Plajah Motion Studio MotionClip v1 to Three.js AnimationClip', () => {
  const sampleClip: MotionClip = {
    format: 'plajah.motion',
    version: 1,
    id: 'test-run',
    name: 'TestSprint',
    createdAt: Date.now(),
    fps: 30,
    frames: 3,
    skeleton: {
      id: 'plajah.biped.v1',
      joints: [
        { name: 'Hips', parent: -1, offset: [0, 0.98, 0] },
        { name: 'Spine2', parent: 0, offset: [0, 0.32, 0] },
      ],
    },
    rot: [
      0, 0, 0, 1, 0, 0, 0, 1,
      0.1, 0, 0, 0.995, 0, 0.1, 0, 0.995,
      0, 0, 0, 1, 0, 0, 0, 1,
    ],
    root: [0, 0.98, 0, 0, 1.02, 0.3, 0, 0.99, 0.6],
    contacts: { l: [1, 0, 1], r: [0, 1, 0] },
    quality: { occlusion: 0, jitter: 0.2, skate: 0.1, grade: 'good', notes: [] },
    source: { kind: 'upload', label: 'test.mp4', model: 'full', width: 1280, height: 720, durationSec: 0.1 },
    rights: { performer: 'self' },
    moves: [],
  };

  const threeClip = motionStudioClipToThree(sampleClip, 'RUNNING');
  assert.equal(threeClip.name, 'RUNNING');
  assert.equal(threeClip.tracks.length, 3); // Hips.quaternion, Spine2.quaternion, Hips.position
  assert.equal(threeClip.tracks[0].name, 'Hips.quaternion');
  assert.equal(threeClip.tracks[1].name, 'Spine2.quaternion');
  assert.equal(threeClip.tracks[2].name, 'Hips.position');
});
