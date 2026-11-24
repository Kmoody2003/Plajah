// playkit/modes/mode2d.ts
//
// Unified 2D Game Mode Runtime for Kith Quest, Evite Play Gates, 2D Creator Games,
// and 2D HUD / Overlay Layers on top of 3D/Parlor games.
// Incorporates Plajah Motion Council juice rules (`services/evite/playGames.ts`):
//   - Spring(320, 28) tactile physics
//   - Hit anticipation squish + impact flash + shard bursts
//   - First-class reduced-motion opacity twin
//   - Minimum 44px touch target audit helper

export interface SpringState {
  value: number;
  velocity: number;
  target: number;
}

export const MOTION_COUNCIL_SPRING = { stiffness: 320, damping: 28 } as const;
export const MIN_TOUCH_TARGET_PX = 44;

export function stepSpring(s: SpringState, dt: number, stiffness = MOTION_COUNCIL_SPRING.stiffness, damping = MOTION_COUNCIL_SPRING.damping): SpringState {
  const force = (s.target - s.value) * stiffness - s.velocity * damping;
  s.velocity += force * dt;
  s.value += s.velocity * dt;
  return s;
}

export interface SpriteNode2D {
  id: string;
  layer: number;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  opacity: number;
  spriteId: string;
  tint?: string;
  flipX?: boolean;
  visible: boolean;
  tags?: string[];
}

export interface Particle2D {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
  shape: 'angular' | 'star' | 'heart' | 'arc' | 'rect' | 'blob';
}

export interface Camera2D {
  x: number;
  y: number;
  zoom: number;
  shakeTimer: number;
  shakeMagnitude: number;
  bounds?: { minX: number; maxX: number; minY: number; maxY: number };
}

export class Scene2D {
  readonly nodes = new Map<string, SpriteNode2D>();
  readonly particles: Particle2D[] = [];
  readonly camera: Camera2D = { x: 0, y: 0, zoom: 1, shakeTimer: 0, shakeMagnitude: 0 };
  reducedMotion = false;

  addSprite(spec: Omit<SpriteNode2D, 'rotation' | 'scaleX' | 'scaleY' | 'opacity' | 'visible'> & Partial<SpriteNode2D>): SpriteNode2D {
    const node: SpriteNode2D = {
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      opacity: 1,
      visible: true,
      ...spec,
    };
    this.nodes.set(node.id, node);
    return node;
  }

  removeSprite(id: string): boolean {
    return this.nodes.delete(id);
  }

  /** Return visible sprites sorted by layer ascending (stable painter's order). */
  sortedRenderList(): SpriteNode2D[] {
    return [...this.nodes.values()]
      .filter((n) => n.visible && n.opacity > 0.001)
      .sort((a, b) => a.layer - b.layer);
  }

  /** Smooth camera follow with optional bounds clamp and screen shake. */
  followCamera(targetX: number, targetY: number, dt: number, stiffness = 9): void {
    const alpha = Math.min(1, stiffness * dt);
    this.camera.x += (targetX - this.camera.x) * alpha;
    this.camera.y += (targetY - this.camera.y) * alpha;
    if (this.camera.bounds) {
      this.camera.x = Math.max(this.camera.bounds.minX, Math.min(this.camera.bounds.maxX, this.camera.x));
      this.camera.y = Math.max(this.camera.bounds.minY, Math.min(this.camera.bounds.maxY, this.camera.y));
    }
    if (this.camera.shakeTimer > 0) {
      this.camera.shakeTimer = Math.max(0, this.camera.shakeTimer - dt);
    }
  }

  triggerShake(magnitude: number, durationSec: number): void {
    if (this.reducedMotion) return;
    this.camera.shakeMagnitude = Math.max(this.camera.shakeMagnitude, magnitude);
    this.camera.shakeTimer = Math.max(this.camera.shakeTimer, durationSec);
  }

  /** Motion-Council hit burst (6 shards by default; skipped cleanly under reduced motion). */
  emitBurst(x: number, y: number, color: string, count = 6, shape: Particle2D['shape'] = 'star'): void {
    if (this.reducedMotion) return;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      const spd = 90 + (i % 3) * 40;
      this.particles.push({
        x, y,
        vx: Math.cos(a) * spd,
        vy: Math.sin(a) * spd,
        life: 0.45,
        maxLife: 0.45,
        color,
        size: 6,
        shape,
      });
    }
  }

  stepParticles(dt: number, gravity = -320): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      p.vy += gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
  }

  /** Point hit-test in world space enforcing a minimum 44px touch-friendly hit radius. */
  hitTest(worldX: number, worldY: number, minTapPx = MIN_TOUCH_TARGET_PX): SpriteNode2D | null {
    const list = this.sortedRenderList().reverse();
    for (const n of list) {
      const effW = Math.max(n.w, minTapPx);
      const effH = Math.max(n.h, minTapPx);
      if (
        worldX >= n.x - effW * 0.5 && worldX <= n.x + effW * 0.5 &&
        worldY >= n.y - effH * 0.5 && worldY <= n.y + effH * 0.5
      ) {
        return n;
      }
    }
    return null;
  }
}
