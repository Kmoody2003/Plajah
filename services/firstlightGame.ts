/** Original, simplified passing-drive simulation. No licensed data or assets. */
export type Runner = { x: number; z: number };
export type Drive = {
  phase: 'ready' | 'live' | 'flight' | 'result' | 'over';
  spot: number; target: number; down: number; score: number; time: number;
  qb: Runner; receivers: Runner[]; defenders: Runner[];
  ball: { x: number; z: number; y: number }; flight?: { from: Runner; to: Runner; elapsed: number; receiver: number };
  message: string; resultSpot: number;
};
export function newDrive(): Drive {
  return setup({ spot: 20, target: 30, down: 1, score: 0 } as Drive);
}
function setup(s: Drive): Drive {
  return { ...s, phase: 'ready', time: 0, qb: { x: 0, z: s.spot - 4 },
    receivers: [-15, 0, 15].map(x => ({ x, z: s.spot })),
    defenders: [-12, 3, 13].map(x => ({ x, z: s.spot + 9 })),
    ball: { x: 0, z: s.spot - 4, y: 2 }, flight: undefined, resultSpot: s.spot,
    message: 'Snap, watch the routes, then pass to an open receiver.' };
}
export function snap(s: Drive) { if (s.phase === 'ready') { s.phase = 'live'; s.message = 'Find space between the cyan defenders. You have 7 seconds.'; } }
export function throwPass(s: Drive, receiver: number) {
  if (s.phase !== 'live' || receiver < 0 || receiver > 2) return;
  const r = s.receivers[receiver];
  s.flight = { from: { ...s.qb }, to: { x: r.x, z: Math.min(100, r.z + 4) }, elapsed: 0, receiver };
  s.phase = 'flight';
}
export function nextPlay(s: Drive): Drive {
  if (s.phase !== 'result') return s;
  if (s.resultSpot >= 100) return { ...s, phase: 'over', score: 6, message: 'Touchdown! Six points. Start another drive to practice a different read.' };
  if (s.resultSpot >= s.target) return setup({ ...s, spot: s.resultSpot, target: Math.min(100, s.resultSpot + 10), down: 1 });
  if (s.down === 4) return { ...s, phase: 'over', message: 'Turnover on downs. Four attempts to reach the line to gain. Try another drive!' };
  return setup({ ...s, spot: s.resultSpot, down: s.down + 1 });
}
export function stepDrive(s: Drive, dt: number, move: number) {
  dt = Math.max(0, Math.min(dt, 0.05));
  if (s.phase !== 'live' && s.phase !== 'flight') return;
  s.time += dt;
  if (s.phase === 'live') {
    s.qb.x = Math.max(-21, Math.min(21, s.qb.x + move * dt * 9));
    s.ball = { ...s.qb, y: 2 };
  }
  s.receivers.forEach((r, i) => {
    r.z = Math.min(100, r.z + dt * (i === 1 ? 5 : 6));
    if (s.time > 1.2) r.x = Math.max(-23, Math.min(23, r.x + dt * (i === 0 ? 3 : i === 2 ? -2 : 0)));
  });
  s.defenders.forEach((d, i) => {
    const r = s.receivers[i];
    const dx = r.x - d.x, dz = r.z - d.z, len = Math.hypot(dx, dz) || 1;
    const speed = i === 1 ? 3.8 : 4.4;
    d.x += dx / len * Math.min(len, speed * dt); d.z += dz / len * Math.min(len, speed * dt);
  });
  if (s.phase === 'flight' && s.flight) {
    const f = s.flight; f.elapsed += dt;
    const t = Math.min(1, f.elapsed / 0.8);
    s.ball = { x: f.from.x + (f.to.x - f.from.x) * t, z: f.from.z + (f.to.z - f.from.z) * t, y: 2 + Math.sin(t * Math.PI) * 8 };
    if (t === 1) {
      const covered = s.defenders.some(d => Math.hypot(d.x - f.to.x, d.z - f.to.z) < 3.2);
      s.resultSpot = covered ? s.spot : Math.min(100, Math.max(s.spot, Math.round(f.to.z)));
      s.phase = 'result';
      s.message = covered ? 'Pass broken up. The defender was close to the catch point. Look for more separation.' : s.resultSpot >= 100 ? 'Touchdown catch! Continue to finish the drive.' : `Caught for ${s.resultSpot - s.spot} yards! ${s.resultSpot >= s.target ? 'You reached the first-down line.' : 'You keep the gain; the next down starts here.'}`;
    }
  } else if (s.time >= 7) {
    s.phase = 'result'; s.resultSpot = Math.max(1, s.spot - 4);
    s.message = 'Pocket pressure: four-yard loss. Try releasing the pass earlier.';
  }
}
