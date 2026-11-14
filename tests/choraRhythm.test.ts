import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { CHORA_RHYTHM_SONGS, buildChoraRhythmChart, type ChoraDifficulty } from '../components/kithParty/choraRhythm';
import { courseLength } from '../components/kithParty/course3d';
import { createState, emptyInput, step } from '../components/kithParty/engine';
import { createTennisState, emptyTennisInput, stepTennis } from '../components/kithParty/tennis';

test('all 10 Chora Rhythm songs resolve valid GrooveDoc charts and existing MP3 audio files', () => {
  assert.equal(CHORA_RHYTHM_SONGS.length, 10);
  const diffs: ChoraDifficulty[] = ['chill', 'groove', 'encore'];

  for (const song of CHORA_RHYTHM_SONGS) {
    const mp3Path = path.join(process.cwd(), 'public', song.audioUrl.replace(/^\//, ''));
    assert.ok(fs.existsSync(mp3Path), `missing audio file for ${song.id}: ${mp3Path}`);

    const counts: Record<ChoraDifficulty, number> = { chill: 0, groove: 0, encore: 0 };
    for (const d of diffs) {
      const chart = buildChoraRhythmChart(song.id, d);
      assert.ok(chart.notes.length >= 16, `${song.id} (${d}) should have at least 16 notes, got ${chart.notes.length}`);
      let prevTime = -Infinity;
      for (const n of chart.notes) {
        assert.ok(n.lane >= 0 && n.lane <= 3, `invalid lane ${n.lane}`);
        assert.ok(n.time >= prevTime, `unsorted notes in ${song.id} (${d})`);
        assert.ok(n.time > 0 && n.time < song.durationSec, `note time out of bounds in ${song.id}`);
        prevTime = n.time;
      }
      counts[d] = chart.notes.length;
    }

    assert.ok(
      counts.encore >= counts.groove && counts.groove >= counts.chill,
      `${song.id} difficulty note counts should satisfy encore(${counts.encore}) >= groove(${counts.groove}) >= chill(${counts.chill})`
    );
  }
});

test('createState("rhythm", ...) wires Chora song metadata, lead-in, and chart into Beat Garden', () => {
  const s = createState('rhythm', ['rello', 'chora'], 421, 'crestfall-gardens', {
    songId: 'eraclash-japan',
    difficulty: 'encore',
  });
  assert.equal(s.rhythmSongId, 'eraclash-japan');
  assert.equal(s.rhythmSongTitle, 'Kyoto Dusk');
  assert.equal(s.rhythmAudioUrl, '/games/era-clash/audio/music-japan.mp3');
  assert.equal(s.rhythmBpm, 124);
  assert.equal(s.rhythmLeadIn, 0.15);
  assert.equal(s.rhythmDifficulty, 'encore');
  assert.ok(s.notes.length >= 30);
});

test('kart drafting directly behind an opponent builds slipTime and triggers SLIPSTREAM! boost', () => {
  const s = createState('circuit', ['rello'], 421, 'crestfall-gardens');
  s.time = 2.0;
  s.phase = 'playing';
  const hero = s.players[0];
  const rival = s.players[1];
  const gapT = 10 / courseLength('crestfall-gardens');
  for (let idx = 2; idx < s.players.length; idx++) s.players[idx].progress = 0.5;
  hero.mps = 42;
  rival.mps = 42;
  hero.cooldown = 0;
  hero.boost = 0;
  hero.lane = 0;
  hero.heading = 0;
  rival.lane = 0;
  hero.progress = 0.005;
  rival.progress = hero.progress + gapT;

  let boosted = false;
  let maxSlip = 0;
  for (let i = 0; i < 240; i++) {
    rival.lane = hero.lane;
    rival.progress = hero.progress + gapT;
    rival.mps = hero.mps;
    hero.boost = boosted ? hero.boost : 0;
    const steer = Math.max(-0.4, Math.min(0.4, -hero.lane * 0.03));
    step(s, [{ ...emptyInput(), y: -1, x: steer }], 1 / 120);
    maxSlip = Math.max(maxSlip, hero.slipTime || 0);
    if (hero.feedback === 'SLIPSTREAM!') {
      boosted = true;
      break;
    }
  }
  assert.ok(maxSlip > 0.5, `expected slipTime > 0.5 while drafting, got ${maxSlip}`);
  assert.ok(boosted, 'drafting behind a rival should award a SLIPSTREAM! boost');
  assert.ok(hero.boost > 0.5);
});

test('tennis Sweet-Spot timing awards perfects, meter charge, and escalates speed with rally count', () => {
  const measureHit = (rallyStart: number) => {
    const s = createTennisState(['rello']);
    s.phase = 'rally';
    s.match.rally = rallyStart;
    const p = s.players[0];
    p.x = 0;
    p.z = 8.5;
    s.ball.inPlay = true;
    s.ball.lastTeam = 1;
    s.ball.x = p.x + 0.8;
    s.ball.y = 1.05;
    s.ball.z = p.z - 1.3;
    s.ball.vx = 0;
    s.ball.vy = 0;
    s.ball.vz = 6;
    for (let f = 0; f < 30; f++) {
      stepTennis(s, [{ ...emptyTennisInput(), topspin: f < 26 }], 1 / 120);
      if (s.ball.lastTeam === 0) break;
    }
    return {
      perfects: p.stats2.perfects,
      meter: p.meter,
      feedback: p.feedback,
      sweetEvent: s.events.some((e) => e.type === 'perfect' && e.data === 'sweetspot'),
      speed: Math.hypot(s.ball.vx, s.ball.vy, s.ball.vz),
    };
  };

  const early = measureHit(2);
  const late = measureHit(10);
  assert.equal(early.perfects, 1);
  assert.ok(early.sweetEvent, 'expected sweetspot event on centered timing');
  assert.ok(early.meter > 0.1);
  assert.equal(late.feedback, 'SWEET SPOT ×11!');
  assert.ok(late.speed > early.speed, `expected rally 10 return (${late.speed.toFixed(2)}) faster than rally 2 (${early.speed.toFixed(2)})`);
});
