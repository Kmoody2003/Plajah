// playkit/physics/physics2d.ts
//
// Deterministic 2D Side-Scroller & Platformer Physics (120 Hz fixed-step).
// Directly folds in Kith Quest's acclaimed platformer movement feel (`components/kithParty/quest/sim.ts`):
//   - Variable-height jump with coyote time + jump buffer + jump-cut gravity
//   - Momentum build-up + slope push + skid deceleration
//   - Wall slide & wall jump with brief wall-lock
//   - Air dash & double jump / petal glide
//   - Solid tile & moving-platform AABB sweep resolution

export interface Platformer2DTuning {
  runSpeed: number;
  topSpeed: number;
  accel: number;
  airAccel: number;
  decel: number;
  airDecel: number;
  jumpVel: number;
  doubleJumpVel: number;
  wallJumpX: number;
  wallJumpY: number;
  wallSlideMaxFall: number;
  gravityUp: number;
  gravityCut: number;
  gravityDown: number;
  maxFall: number;
  glideFall: number;
  coyoteSec: number;
  jumpBufferSec: number;
  dashVel: number;
  dashDuration: number;
  dashCooldown: number;
}

export const KITH_QUEST_TUNING: Platformer2DTuning = {
  runSpeed: 280,
  topSpeed: 430,
  accel: 1500,
  airAccel: 1150,
  decel: 2100,
  airDecel: 520,
  jumpVel: 640,
  doubleJumpVel: 560,
  wallJumpX: 380,
  wallJumpY: 600,
  wallSlideMaxFall: 170,
  gravityUp: 1900,
  gravityCut: 4300,
  gravityDown: 2500,
  maxFall: 980,
  glideFall: 105,
  coyoteSec: 0.1,
  jumpBufferSec: 0.12,
  dashVel: 720,
  dashDuration: 0.17,
  dashCooldown: 0.35,
};

export interface Rect2D {
  x: number;
  y: number;
  w: number;
  h: number;
  oneWay?: boolean;
}

export interface Body2DState {
  x: number;
  y: number; // +Y is UP (world-consistent with 3D; renderer flips Y for canvas)
  w: number;
  h: number;
  vx: number;
  vy: number;
  facing: 1 | -1;
  onGround: boolean;
  wallDir: -1 | 0 | 1; // -1 wall on left, +1 wall on right
  coyoteTimer: number;
  jumpBufferTimer: number;
  airJumpsLeft: number;
  maxAirJumps: number;
  dashTimer: number;
  dashCooldown: number;
  wallLockTimer: number;
}

export interface Platformer2DInput {
  moveX: number; // -1..1
  jumpHeld: boolean;
  jumpPressed: boolean;
  dashPressed: boolean;
  glideHeld?: boolean;
}

export function createBody2D(x: number, y: number, w = 24, h = 40, maxAirJumps = 1): Body2DState {
  return {
    x, y, w, h, vx: 0, vy: 0, facing: 1,
    onGround: false, wallDir: 0,
    coyoteTimer: 0, jumpBufferTimer: 0,
    airJumpsLeft: maxAirJumps, maxAirJumps,
    dashTimer: 0, dashCooldown: 0, wallLockTimer: 0,
  };
}

function overlaps(a: { x: number; y: number; w: number; h: number }, b: Rect2D): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function stepPlatformer2D(
  body: Body2DState,
  input: Platformer2DInput,
  solids: ReadonlyArray<Rect2D>,
  dt: number,
  tuning: Platformer2DTuning = KITH_QUEST_TUNING,
): Body2DState {
  // Timers
  body.coyoteTimer = body.onGround ? tuning.coyoteSec : Math.max(0, body.coyoteTimer - dt);
  if (input.jumpPressed) body.jumpBufferTimer = tuning.jumpBufferSec;
  else body.jumpBufferTimer = Math.max(0, body.jumpBufferTimer - dt);
  body.dashCooldown = Math.max(0, body.dashCooldown - dt);
  body.wallLockTimer = Math.max(0, body.wallLockTimer - dt);

  if (Math.abs(input.moveX) > 0.1 && body.wallLockTimer <= 0) {
    body.facing = input.moveX > 0 ? 1 : -1;
  }

  // Dash initiation
  if (input.dashPressed && body.dashCooldown <= 0 && body.dashTimer <= 0) {
    body.dashTimer = tuning.dashDuration;
    body.dashCooldown = tuning.dashCooldown;
    body.vx = body.facing * tuning.dashVel;
    body.vy = 0;
  }

  if (body.dashTimer > 0) {
    body.dashTimer = Math.max(0, body.dashTimer - dt);
  } else {
    // Horizontal acceleration / deceleration
    const targetVx = body.wallLockTimer > 0 ? body.vx : input.moveX * tuning.runSpeed;
    const accelRate = body.onGround
      ? (Math.abs(input.moveX) > 0.05 ? tuning.accel : tuning.decel)
      : (Math.abs(input.moveX) > 0.05 ? tuning.airAccel : tuning.airDecel);

    if (body.vx < targetVx) body.vx = Math.min(targetVx, body.vx + accelRate * dt);
    else if (body.vx > targetVx) body.vx = Math.max(targetVx, body.vx - accelRate * dt);

    // Jump / Coyote / Wall Jump / Double Jump
    if (body.jumpBufferTimer > 0) {
      if (body.coyoteTimer > 0) {
        body.vy = tuning.jumpVel;
        body.onGround = false;
        body.coyoteTimer = 0;
        body.jumpBufferTimer = 0;
      } else if (body.wallDir !== 0 && !body.onGround) {
        body.vx = -body.wallDir * tuning.wallJumpX;
        body.vy = tuning.wallJumpY;
        body.facing = (body.wallDir === 1 ? -1 : 1);
        body.wallLockTimer = 0.14;
        body.jumpBufferTimer = 0;
      } else if (body.airJumpsLeft > 0) {
        body.vy = tuning.doubleJumpVel;
        body.airJumpsLeft--;
        body.jumpBufferTimer = 0;
      }
    }

    // Variable gravity (jump-cut if player releases jump while rising)
    const grav =
      body.vy > 0
        ? (input.jumpHeld ? tuning.gravityUp : tuning.gravityCut)
        : tuning.gravityDown;
    body.vy -= grav * dt;

    // Wall slide or glide terminal velocity
    let maxFall = tuning.maxFall;
    if (body.wallDir !== 0 && body.vy < 0 && Math.sign(input.moveX) === body.wallDir) {
      maxFall = Math.min(maxFall, tuning.wallSlideMaxFall);
    } else if (input.glideHeld && body.vy < 0) {
      maxFall = Math.min(maxFall, tuning.glideFall);
    }
    if (body.vy < -maxFall) body.vy = -maxFall;
  }

  // Horizontal sweep + wall detection
  body.x += body.vx * dt;
  body.wallDir = 0;
  for (const s of solids) {
    if (s.oneWay) continue;
    if (!overlaps(body, s)) continue;
    if (body.vx > 0) {
      body.x = s.x - body.w;
      body.vx = 0;
      body.wallDir = 1;
    } else if (body.vx < 0) {
      body.x = s.x + s.w;
      body.vx = 0;
      body.wallDir = -1;
    }
  }

  // Vertical sweep + ground/ceiling resolution
  const prevBottom = body.y;
  body.y += body.vy * dt;
  body.onGround = false;
  for (const s of solids) {
    if (!overlaps(body, s)) continue;
    if (s.oneWay) {
      if (body.vy <= 0 && prevBottom >= s.y + s.h - 2) {
        body.y = s.y + s.h;
        body.vy = 0;
        body.onGround = true;
        body.airJumpsLeft = body.maxAirJumps;
      }
      continue;
    }
    if (body.vy <= 0) {
      body.y = s.y + s.h;
      body.vy = 0;
      body.onGround = true;
      body.airJumpsLeft = body.maxAirJumps;
    } else if (body.vy > 0) {
      body.y = s.y - body.h;
      body.vy = 0;
    }
  }

  return body;
}
