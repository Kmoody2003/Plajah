export function movementVelocity(vx: number, vz: number, lateral: number, forward: number, speed: number, dt: number, traction = 1) {
  const length = Math.max(1, Math.hypot(lateral, forward));
  const x = lateral / length * speed, z = forward / length * speed;
  const braking = !lateral && !forward;
  const reversing = vx * x + vz * z < 0;
  const blend = 1 - Math.exp(-(braking ? 24 : reversing ? 20 : 14) * traction * dt);
  const nextX = vx + (x - vx) * blend, nextZ = vz + (z - vz) * blend;
  return { vx: Math.abs(nextX) < .01 ? 0 : nextX, vz: Math.abs(nextZ) < .01 ? 0 : nextZ };
}

export function movementHeading(current: number, vx: number, vz: number, dt: number) {
  if (Math.hypot(vx, vz) < .15) return current;
  const target = Math.atan2(vx, vz);
  const difference = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  return current + difference * (1 - Math.exp(-18 * dt));
}
