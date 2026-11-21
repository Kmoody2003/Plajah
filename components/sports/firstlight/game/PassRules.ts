export interface CatchRuleOptions {
  catchRadius?: number;
  interceptRadius?: number;
  isArcadeFire?: boolean;
}

export type FieldGoalResult = 'GOOD' | 'DOINK_MISS' | 'WIDE_LEFT' | 'WIDE_RIGHT' | 'SHORT';

/** Simplified grounded-player catch model; not a full foot-contact/officiating simulation. */
export function resolveCatch(
  ball: { x: number; y: number; z: number },
  receiver: { x: number; z: number },
  defenders: { x: number; z: number }[],
  width: number,
  options?: CatchRuleOptions
) {
  const inbounds = (p: { x: number; z: number }) =>
    Math.abs(p.x) <= width / 2 - 0.25 && p.z >= -59.75 && p.z <= 59.75;
  if (!inbounds(ball) || ball.y < 0.3 || ball.y > 3.1) return 'INCOMPLETE' as const;

  const isFire = Boolean(options?.isArcadeFire);
  const catchRadius = (options?.catchRadius ?? 1.65) + (isFire ? 0.32 : 0);
  const interceptRadius = Math.max(0.45, (options?.interceptRadius ?? 0.85) - (isFire ? 0.18 : 0));

  const receiverDistance = Math.hypot(ball.x - receiver.x, ball.z - receiver.z);
  const inboundsDefenders = defenders.filter(inbounds);
  const defenderDistance =
    inboundsDefenders.length > 0
      ? Math.min(...inboundsDefenders.map((d) => Math.hypot(ball.x - d.x, ball.z - d.z)))
      : Infinity;

  if (defenderDistance < interceptRadius && defenderDistance + 0.25 < receiverDistance) {
    return 'INTERCEPTION' as const;
  }
  if (!inbounds(receiver) || receiverDistance > catchRadius) return 'INCOMPLETE' as const;
  if (!isFire && defenderDistance < 0.7 && receiverDistance > 0.7) return 'INCOMPLETE' as const;
  return 'COMPLETE' as const;
}

/**
 * Evaluates a field goal or PAT as it crosses the goalpost plane (z = 60).
 * Standard pro uprights: crossbar at 10 ft (~3.33 yds), width 18.5 ft (~6.17 yds, half-width 3.085 yds).
 */
export function evaluateFieldGoal(ballAtPosts: { x: number; y: number }): FieldGoalResult {
  if (ballAtPosts.y < 3.15) return 'SHORT';
  const absX = Math.abs(ballAtPosts.x);
  if (absX <= 2.9) return 'GOOD';
  if (absX <= 3.35) return 'DOINK_MISS';
  return ballAtPosts.x < 0 ? 'WIDE_LEFT' : 'WIDE_RIGHT';
}
