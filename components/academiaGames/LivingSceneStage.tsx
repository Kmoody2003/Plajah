/**
 * LivingSceneStage — Feature-grade handmade animation viewport powered by Plajah's own
 * Motion Council (PASTORAL / LIVE2D / SATSUEI / MINIATURE / INK_WASH), Anima Physics & Stable Fluids,
 * and Living particle bursts.
 *
 * Draws the 1376x768 hand-painted illustration directly onto Canvas2D so pixel-mesh wind waves,
 * horizontal water-refraction scanlines, swinging lantern/bell cutouts, rotating waterwheel/astrolabe
 * disks, and Live2D character breathing + blinks deform the ACTUAL painted art cleanly with zero
 * pasted-on vector look.
 */

import React, { useEffect, useRef } from 'react';
import {
  createLivingSceneRig,
  drawLivingBursts,
  pokeLivingScene,
  stepLivingSceneRig,
  triggerLivingBurst,
  type LivingSceneRig,
} from '../../services/academiaGames/livingAnimaBridge';
import {
  renderAnimatedHandmadePlate,
  SPRITE_URLS,
  WORLD_SPRITE_MANIFEST,
  type LanternSlotState,
  type SpriteKey,
} from '../../services/academiaGames/plateAnimator';
import { DEFAULT_DIRECTOR_SETTINGS, type DirectorSettings } from '../../services/academiaGames/motionDirector';
import { breathFrameAt } from '../../services/academiaGames/affectivePacing';
import { playWarmPluck } from '../../services/academiaGames/acousticAudio';
import type { BurstKind } from '../../services/living/contracts';
import type { AtmospherePreset, WorldId } from '../../services/academiaGames/contracts';

interface Props {
  world: WorldId | 'ora';
  plateUrl: string;
  plateAlt: string;
  atmosphere: AtmospherePreset;
  reducedMotion: boolean;
  soundOn: boolean;
  director?: DirectorSettings;
  intensity?: number;
  rpmOrVoltage?: number;
  bioFlux?: number;
  fluxP?: number;
  fluxQ?: number;
  lanternSlots?: ReadonlyArray<LanternSlotState>;
  celebrateSignal?: number;
  celebrateBurstKind?: BurstKind;
  onBreathPhase?: (phase: 'inhale' | 'hold' | 'exhale', label: string) => void;
  children?: React.ReactNode;
}

const IMAGE_CACHE = new Map<string, HTMLImageElement>();

function getCachedImage(url: string): HTMLImageElement {
  const hit = IMAGE_CACHE.get(url);
  if (hit) return hit;
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = url;
  IMAGE_CACHE.set(url, img);
  return img;
}

function getWorldSprites(world: WorldId | 'ora'): Partial<Record<SpriteKey, HTMLImageElement>> {
  const out: Partial<Record<SpriteKey, HTMLImageElement>> = {};
  for (const key of WORLD_SPRITE_MANIFEST[world]) {
    out[key] = getCachedImage(SPRITE_URLS[key]);
  }
  return out;
}

export const LivingSceneStage: React.FC<Props> = ({
  world,
  plateUrl,
  plateAlt,
  atmosphere,
  reducedMotion,
  soundOn,
  director = DEFAULT_DIRECTOR_SETTINGS,
  intensity = 0.25,
  rpmOrVoltage = 0.65,
  bioFlux = 0.65,
  fluxP = 3,
  fluxQ = 5,
  lanternSlots,
  celebrateSignal = 0,
  celebrateBurstKind,
  onBreathPhase,
  children,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const plateRef = useRef<HTMLImageElement | null>(null);
  const spritesRef = useRef<Partial<Record<SpriteKey, HTMLImageElement>>>({});
  const rigRef = useRef<LivingSceneRig | null>(null);
  const lastPhaseRef = useRef<string>('');
  const paramsRef = useRef({ atmosphere, reducedMotion, director, intensity, rpmOrVoltage, bioFlux, fluxP, fluxQ, soundOn, lanternSlots });
  paramsRef.current = { atmosphere, reducedMotion, director, intensity, rpmOrVoltage, bioFlux, fluxP, fluxQ, soundOn, lanternSlots };

  useEffect(() => {
    rigRef.current = createLivingSceneRig(world);
    spritesRef.current = getWorldSprites(world);
    lastPhaseRef.current = '';
  }, [world]);

  useEffect(() => {
    plateRef.current = getCachedImage(plateUrl);
  }, [plateUrl]);

  useEffect(() => {
    const rig = rigRef.current;
    if (!rig || celebrateSignal <= 0 || reducedMotion) return;
    const focal: Record<LivingSceneRig['world'], [number, number, BurstKind]> = {
      reading: [880, 245, 'fireflies'],
      math: [690, 610, 'bubbles'],
      science: [380, 440, 'sparkles'],
      studio: [460, 290, 'sparkles'],
      history: [580, 340, 'leaves'],
      elevate: [980, 270, 'petals'],
      ora: [520, 265, 'fireflies'],
    };
    const [fx, fy, fallbackKind] = focal[world];
    triggerLivingBurst(rig, celebrateBurstKind ?? fallbackKind, fx, fy, 26);
    triggerLivingBurst(rig, 'notes', fx, fy - 24, 8);
  }, [celebrateSignal, celebrateBurstKind, world, reducedMotion]);

  useEffect(() => {
    let raf = 0;
    let prevNow = performance.now();
    const startNow = prevNow;
    let camX = 0;
    let camY = 0;

    const rain = Array.from({ length: 48 }, (_, i) => ({
      x: (i * 79) % 1376,
      y: (i * 47) % 768,
      len: 15 + (i % 4) * 5,
    }));

    const frame = (now: number) => {
      const dtSec = Math.min(0.05, Math.max(0.004, (now - prevNow) / 1000));
      prevNow = now;
      const t = (now - startNow) / 1000;
      const rig = rigRef.current;
      const p = paramsRef.current;
      const plate = plateRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');

      if (rig && canvas && ctx) {
        stepLivingSceneRig(rig, dtSec, t, {
          atmosphere: p.atmosphere,
          reducedMotion: p.reducedMotion,
          intensity: p.intensity,
          rpmOrVoltage: p.rpmOrVoltage,
          bioFlux: p.bioFlux,
          fluxP: p.fluxP,
          fluxQ: p.fluxQ,
        });

        const W = canvas.width;
        const H = canvas.height;
        ctx.clearRect(0, 0, W, H);

        // Gentle unified living camera breathing + damped pointer depth-parallax across the whole painted stage
        if (!p.reducedMotion) {
          const targetX = rig.pointer.active ? ((rig.pointer.x / 1280) - 0.5) * -14 : Math.sin(t * 0.25) * 4.5;
          const targetY = rig.pointer.active ? ((rig.pointer.y / 720) - 0.5) * -9 : Math.cos(t * 0.20) * 3.0;
          camX += (targetX - camX) * Math.min(1, dtSec * 3.2);
          camY += (targetY - camY) * Math.min(1, dtSec * 3.2);
          const breathe = 1.024 + Math.sin(t * 0.42) * 0.004;
          canvas.style.transform = `translate3d(${camX.toFixed(2)}px, ${camY.toFixed(2)}px, 0) scale(${breathe.toFixed(4)})`;
        } else {
          canvas.style.transform = 'none';
        }

        // 1. ZERO-TEAR MULTI-LAYER ANIMATED SCENE (clean background plate + isolated RGBA sprites)
        if (plate && plate.complete && plate.naturalWidth > 0) {
          renderAnimatedHandmadePlate(ctx, plate, W, H, {
            world,
            timeSec: t,
            reducedMotion: p.reducedMotion,
            director: p.director,
            intensity: p.intensity,
            wheelAngle: rig.wheelAngle,
            needleAngle: rig.needleAngle,
            astrolabeAngle: rig.astrolabeAngle,
            rpmOrVoltage: p.rpmOrVoltage,
            bioFlux: p.bioFlux,
            pointerNorm: { x: rig.pointer.x / 1280, y: rig.pointer.y / 720, active: rig.pointer.active },
            lanternSlots: p.lanternSlots,
            sprites: spritesRef.current,
          });
        }

        // 2. WORLD-INTEGRATED ANIMA SIMULATIONS (matched to the clean plates!)
        if (world === 'studio') {
          // Museum-grade depth-sorted 3D spun-brass & oxidized-verdigris Flux sculpture floating inside the EMPTY glass dome!
          const cx = W * 0.334, cy = H * 0.345;
          const segCount = 360;
          const rotY = (p.reducedMotion ? 0.4 : t * 0.32) + ((rig.pointer.x / 1280) - 0.5) * 1.25;
          const rotX = 0.38 + ((rig.pointer.y / 720) - 0.5) * 0.85;

          const project = (a: number) => {
            const R = 1.60 + 0.62 * Math.cos(p.fluxQ * a + (p.reducedMotion ? 0 : t * 0.45));
            const x0 = R * Math.cos(p.fluxP * a);
            const y0 = R * Math.sin(p.fluxP * a);
            const z0 = 0.62 * Math.sin(p.fluxQ * a + (p.reducedMotion ? 0 : t * 0.45));
            const x1 = x0 * Math.cos(rotY) - z0 * Math.sin(rotY);
            const z1 = x0 * Math.sin(rotY) + z0 * Math.cos(rotY);
            const y2 = y0 * Math.cos(rotX) - z1 * Math.sin(rotX);
            const z2 = y0 * Math.sin(rotX) + z1 * Math.cos(rotX);
            const sc = 152 / (3.8 - z2 * 0.52);
            return { sx: cx + x1 * sc, sy: cy + y2 * sc, z: z2, a };
          };

          // Subtle warm ambient aura radiating inside the glass dome from the sculpture
          ctx.save();
          ctx.globalCompositeOperation = 'screen';
          const aura = ctx.createRadialGradient(cx, cy, 12, cx, cy, 150);
          aura.addColorStop(0, 'rgba(244, 198, 102, 0.16)');
          aura.addColorStop(0.6, 'rgba(72, 168, 156, 0.08)');
          aura.addColorStop(1, 'rgba(244, 198, 102, 0)');
          ctx.fillStyle = aura;
          ctx.beginPath();
          ctx.arc(cx, cy, 150, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();

          // Painter's-algorithm depth-sorted metallic spun-wire segments (real 3D metallic sheen & depth!)
          const pts = Array.from({ length: segCount + 1 }, (_, i) => project((i / segCount) * Math.PI * 2));
          const segs: Array<{ x0: number; y0: number; x1: number; y1: number; z: number; a: number }> = [];
          for (let i = 0; i < segCount; i++) {
            segs.push({
              x0: pts[i].sx,
              y0: pts[i].sy,
              x1: pts[i + 1].sx,
              y1: pts[i + 1].sy,
              z: (pts[i].z + pts[i + 1].z) * 0.5,
              a: pts[i].a,
            });
          }
          segs.sort((u, v) => u.z - v.z);

          ctx.save();
          ctx.lineCap = 'round';
          for (const s of segs) {
            const depthNorm = Math.max(0, Math.min(1, (s.z + 2.2) / 4.4));
            const widthPx = 2.4 + depthNorm * 5.2;
            const isGold = Math.sin(p.fluxQ * s.a + 0.4) >= -0.15;

            // Shadowed bronze/teal core thickness
            ctx.strokeStyle = isGold
              ? `rgba(${Math.round(135 + depthNorm * 92)}, ${Math.round(96 + depthNorm * 78)}, ${Math.round(38 + depthNorm * 38)}, ${(0.52 + depthNorm * 0.44).toFixed(3)})`
              : `rgba(${Math.round(36 + depthNorm * 42)}, ${Math.round(92 + depthNorm * 76)}, ${Math.round(88 + depthNorm * 66)}, ${(0.50 + depthNorm * 0.44).toFixed(3)})`;
            ctx.lineWidth = widthPx;
            ctx.beginPath();
            ctx.moveTo(s.x0, s.y0);
            ctx.lineTo(s.x1, s.y1);
            ctx.stroke();

            // Specular spun-gold / bright verdigris metallic filament ridge along the lit crest
            if (depthNorm > 0.32) {
              ctx.strokeStyle = isGold
                ? `rgba(255, 236, 174, ${((depthNorm - 0.25) * 0.92).toFixed(3)})`
                : `rgba(168, 238, 224, ${((depthNorm - 0.25) * 0.78).toFixed(3)})`;
              ctx.lineWidth = Math.max(1.0, widthPx * 0.30);
              ctx.beginPath();
              ctx.moveTo(s.x0 - 0.8, s.y0 - 0.8);
              ctx.lineTo(s.x1 - 0.8, s.y1 - 0.8);
              ctx.stroke();
            }
          }
          ctx.restore();

          // Re-composite delicate curved glass dome specular reflection IN FRONT of the live 3D sculpture!
          ctx.save();
          ctx.globalCompositeOperation = 'screen';
          ctx.strokeStyle = 'rgba(255, 250, 236, 0.24)';
          ctx.lineWidth = 7;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.arc(cx, cy + 10, 158, -Math.PI * 0.76, -Math.PI * 0.46);
          ctx.stroke();
          ctx.restore();

          // Anima vortex stardust orbiting delicately inside the glass dome
          for (const pt of rig.animaParticles.particles) {
            const fade = 1 - pt.age / pt.lifespan;
            ctx.fillStyle = `rgba(252, 224, 146, ${(fade * 0.72).toFixed(3)})`;
            ctx.beginPath();
            ctx.arc((pt.position.x / 1280) * W, (pt.position.y / 720) * H, pt.size * 0.75, 0, Math.PI * 2);
            ctx.fill();
          }
        } else if (world === 'math') {
          // Painterly water spray foam droplets bouncing off the rotating painted oak waterwheel
          for (const pt of rig.animaParticles.particles) {
            const fade = 1 - pt.age / pt.lifespan;
            const px = (pt.position.x / 1280) * W;
            const py = (pt.position.y / 720) * H;
            ctx.fillStyle = `rgba(244, 250, 252, ${(fade * 0.72).toFixed(3)})`;
            ctx.beginPath();
            ctx.arc(px, py, pt.size * 0.85, 0, Math.PI * 2);
            ctx.fill();
          }
        } else if (world === 'science' && !p.reducedMotion) {
          // Subtle rising bioluminescent root spores masked cleanly to the glass terrarium interior
          ctx.save();
          ctx.beginPath();
          ctx.roundRect(W * 0.19, H * 0.30, W * 0.19, H * 0.47, 10);
          ctx.clip();
          for (const c of rig.critters) {
            if (c.hue !== '#5EF2B8') continue;
            const pulse = 0.28 + 0.42 * Math.sin(t * 2.1 + c.phase);
            ctx.fillStyle = `rgba(98, 245, 188, ${pulse.toFixed(3)})`;
            ctx.beginPath();
            ctx.arc((c.x / 1280) * W, (c.y / 720) * H, c.size * 0.9, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.restore();
        } else if (world === 'ora') {
          // Delicate hand-painted watercolor teacup steam ribbons advected by Anima FluidSimulator velocity!
          if (rig.fluid && !p.reducedMotion) {
            const N = rig.fluid.N;
            ctx.save();
            ctx.lineCap = 'round';
            for (let strand = 0; strand < 3; strand++) {
              const baseX = W * (0.310 + strand * 0.011);
              const baseY = H * 0.676;
              ctx.beginPath();
              let sx = baseX, sy = baseY;
              ctx.moveTo(sx, sy);
              for (let step = 1; step <= 14; step++) {
                const u = step / 14;
                const fi = Math.max(1, Math.min(N, Math.floor((sx / W) * N)));
                const fj = Math.max(1, Math.min(N, Math.floor((sy / H) * N)));
                const fidx = fi + (N + 2) * fj;
                const fluidPushX = rig.fluid.u[fidx] * 28;
                sx += Math.sin(t * 1.4 + u * 4.2 + strand * 1.9) * (2.6 + u * 3.2) + fluidPushX;
                sy -= 10.5;
                ctx.lineTo(sx, sy);
              }
              const grad = ctx.createLinearGradient(baseX, baseY, baseX, baseY - 155);
              grad.addColorStop(0, 'rgba(252, 244, 228, 0.36)');
              grad.addColorStop(0.55, 'rgba(252, 244, 228, 0.22)');
              grad.addColorStop(1, 'rgba(252, 244, 228, 0)');
              ctx.strokeStyle = grad;
              ctx.lineWidth = 4.2 - strand * 0.7;
              ctx.stroke();
            }
            ctx.restore();
          }
          // Calm painted koi gliding strictly inside the misty pond basin (clipped clear of the cedar veranda!)
          ctx.save();
          ctx.beginPath();
          ctx.rect(W * 0.14, H * 0.44, W * 0.72, H * 0.20);
          ctx.clip();
          for (const k of rig.critters) {
            const kx = (k.x / 1280) * W, ky = (k.y / 720) * H;
            const ang = Math.atan2(k.vy, k.vx);
            ctx.save();
            ctx.translate(kx, ky);
            ctx.rotate(ang);
            ctx.globalAlpha = 0.56;
            ctx.fillStyle = k.hue;
            ctx.beginPath();
            ctx.ellipse(0, 0, k.size, k.size * 0.32, 0, 0, Math.PI * 2);
            ctx.fill();
            const wag = p.reducedMotion ? 0 : Math.sin(t * 5.2 + k.phase) * 3.8;
            ctx.beginPath();
            ctx.moveTo(-k.size * 0.85, 0);
            ctx.lineTo(-k.size * 1.5, -4.5 + wag);
            ctx.lineTo(-k.size * 1.5, 4.5 + wag);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
          }
          ctx.restore();
          // Serene 4-2-4 golden firefly breathing ring hovering right over the painted pond ring
          const bf = breathFrameAt(t);
          if (bf.phase !== lastPhaseRef.current) {
            lastPhaseRef.current = bf.phase;
            onBreathPhase?.(bf.phase, bf.label);
          }
          const cx = W * 0.38, cy = H * 0.335;
          const exp = p.reducedMotion ? 0.55 : bf.expansion;
          const radius = 42 + exp * 62;
          ctx.save();
          ctx.globalCompositeOperation = 'screen';
          const glow = ctx.createRadialGradient(cx, cy, 8, cx, cy, radius + 48);
          glow.addColorStop(0, 'rgba(255, 226, 144, 0.34)');
          glow.addColorStop(1, 'rgba(255, 226, 144, 0)');
          ctx.fillStyle = glow;
          ctx.beginPath();
          ctx.arc(cx, cy, radius + 48, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = 'rgba(252, 234, 178, 0.55)';
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.arc(cx, cy, radius, 0, Math.PI * 2);
          ctx.stroke();
          for (let i = 0; i < 14; i++) {
            const ang = (i / 14) * Math.PI * 2 + (p.reducedMotion ? 0 : t * 0.22);
            ctx.fillStyle = 'rgba(255, 238, 178, 0.9)';
            ctx.beginPath();
            ctx.arc(cx + Math.cos(ang) * radius, cy + Math.sin(ang) * radius, 3.0, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.restore();
        }

        // 3. ORA WEATHER ATMOSPHERE (painterly cozy rain streaks in ink-wash tone)
        if (p.atmosphere === 'rain' && world !== 'studio' && !p.reducedMotion) {
          ctx.strokeStyle = 'rgba(224, 234, 238, 0.26)';
          ctx.lineWidth = 1.2;
          for (const d of rain) {
            d.x = (d.x - 150 * dtSec + W) % W;
            d.y = (d.y + 440 * dtSec) % H;
            ctx.beginPath();
            ctx.moveTo(d.x, d.y);
            ctx.lineTo(d.x - 4.5, d.y + d.len);
            ctx.stroke();
          }
        }

        // 4. INTERACTIVE CLICK RIPPLES + PLAJAH LIVING BURSTS (scaled cleanly to 1376x768)
        ctx.save();
        ctx.scale(W / 1280, H / 720);
        for (const rp of rig.ripples) {
          ctx.strokeStyle = `${rp.color}${rp.a.toFixed(3)})`;
          ctx.lineWidth = 1.7;
          ctx.beginPath();
          ctx.ellipse(rp.x, rp.y, rp.r, rp.r * (world === 'ora' ? 0.36 : 0.65), 0, 0, Math.PI * 2);
          ctx.stroke();
        }
        drawLivingBursts(ctx, rig);
        ctx.restore();
      }

      raf = requestAnimationFrame(frame);
    };

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [world, onBreathPhase]);

  const toStageCoords = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * 1280,
      y: ((e.clientY - rect.top) / rect.height) * 720,
    };
  };

  const handlePointerMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rig = rigRef.current;
    if (!rig) return;
    const { x, y } = toStageCoords(e);
    rig.pointer.vx = x - rig.pointer.x;
    rig.pointer.vy = y - rig.pointer.y;
    rig.pointer.x = x;
    rig.pointer.y = y;
    rig.pointer.active = true;
  };

  const handlePointerLeave = () => {
    if (rigRef.current) rigRef.current.pointer.active = false;
  };

  const handleStageClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (target.closest('button, input, label, [role="dialog"]')) return;
    const rig = rigRef.current;
    if (!rig) return;
    const { x, y } = toStageCoords(e);
    pokeLivingScene(rig, x, y);
    playWarmPluck(261.63 + (x / 1280) * 185, paramsRef.current.soundOn, { duration: 1.0, volume: 0.055 });
  };

  return (
    <div
      onMouseMove={handlePointerMove}
      onMouseLeave={handlePointerLeave}
      onClick={handleStageClick}
      aria-label={plateAlt}
      className="relative w-full aspect-[16/9] overflow-hidden rounded-[14px] bg-[#181410] bg-cover bg-center shadow-xl cursor-pointer"
      style={{ backgroundImage: `url(${plateUrl})` }}
    >
      <canvas
        ref={canvasRef}
        width={1376}
        height={768}
        className="w-full h-full block object-cover will-change-transform"
      />
      {children}
    </div>
  );
};
