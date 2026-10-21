/**
 * services/anima/plajahMascots.ts
 *
 * Official Plajah Kith Mascot Kaijus — Fully Articulated Vector Rigs & Animation Cycles
 *
 * Implements the authentic Kith Style Bible and character sheets for Plajah's two canonical mascots:
 *
 * 1. 📷 REELLO (aka LUMI) — The Vision & Film Mascot
 *    - Domain: Reello / Film / Moving Image / Visual FX / Vision
 *    - Palette: Navy speckled body (#2B3A5E, #1F2B52), vibrant orange bandit eye patches (#F2621C),
 *      white pale face mask (#FDFDFF), orange/peach belly (#F07432, #F6B07A) with white flame mark (#FFFFFF),
 *      navy horn spikes (#18263F), magenta/orange 10-lobe radiating serrated frill fan (#F7873A -> #BE2A7A),
 *      and vintage rangefinder camera on a strap.
 *    - Expression: Cat-dome head, slanted black brow wedges, grumpy default face, glowing amber/orange eyes.
 *    - Motion: "The Director's Walk" on 2s with camera sway and frill spring dynamics.
 *
 * 2. 🎵 CHORA (aka LORIK) — The Sonic & Music Mascot
 *    - Domain: Chora / Melos / Audio / Harmonics / Sacred Sound
 *    - Palette: Lavender/purple speckled body (#7A66BC, #2F3C72), purple bandit eye patches (#7A63BF),
 *      white pale face mask (#FDFDFF), segmented magenta belly (#C2257C) with golden music notes mark (#F39A45),
 *      navy cat-ear horns (#1C2D4E) with magenta crest spike (#D1287F), orange/magenta frill fan (#F7873A -> #C2287C),
 *      and black "LORIK" music book.
 *    - Expression: Cat-dome head, slanted black brow wedges, focused gaze, dark purple slit-pupil eyes.
 *    - Motion: "The Harmonic Strut" on 2s with music book bob and frill spring resonance.
 */

import type { AnimaBone } from './types';

let relloSvgImg: any = null;
let choraSvgImg: any = null;

export function getRelloSvgImage(): any {
  if (typeof Image === 'undefined') return null;
  if (!relloSvgImg) {
    relloSvgImg = new Image();
    relloSvgImg.src = '/kith-party/characters/rello.svg';
  }
  return relloSvgImg;
}

export function getChoraSvgImage(): any {
  if (typeof Image === 'undefined') return null;
  if (!choraSvgImg) {
    choraSvgImg = new Image();
    choraSvgImg.src = '/kith-party/characters/chora.svg';
  }
  return choraSvgImg;
}

export interface PlajahMascotRig {
  id: 'rello' | 'chora';
  name: string;
  alias: string;
  title: string;
  species: 'Kith Kaiju';
  domain: 'Film & Vision' | 'Music & Sound';
  primaryColor: string;
  accentColor: string;
  bellyColor: string;
  glowColor: string;
  prop: 'camera' | 'book';
  svgPath: string;
  svgViewBox: string;
  bones: AnimaBone[];
  drawRoutine: (ctx: CanvasRenderingContext2D, t: number, frame: number, scale?: number) => void;
}

export const PLAJAH_MASCOTS: Record<'rello' | 'chora', PlajahMascotRig> = {
  // ───────────────────────────────────────────────────────────────────────────
  // 1. REELLO (LUMI) — THE VISION & FILM KAIJU
  // ─────────────────────────────────────────────────────────────────────────
  rello: {
    id: 'rello',
    name: 'Reello',
    alias: 'Lumi',
    title: 'The Vision & Film Kaiju',
    species: 'Kith Kaiju',
    domain: 'Film & Vision',
    primaryColor: '#2B3A5E',
    accentColor: '#F2621C',
    bellyColor: '#F07432',
    glowColor: '#FF8A2A',
    prop: 'camera',
    svgPath: '/kith-party/characters/rello.svg',
    svgViewBox: '-40 -64 480 510',
    bones: [
      { id: 'rel_root', name: 'Root Pelvis', parentId: null, length: 0, baseAngle: 0, pivot: [0, 0, 0] },
      { id: 'rel_body', name: 'Torso & Belly', parentId: 'rel_root', length: 50, baseAngle: -90, pivot: [0, -30, 0] },
      { id: 'rel_neck', name: 'Neck Pivot', parentId: 'rel_body', length: 30, baseAngle: -90, pivot: [0, -112, 0] },
      { id: 'rel_head', name: 'Cat-Dome Head', parentId: 'rel_neck', length: 45, baseAngle: 0, pivot: [0, -175, 0] },
      { id: 'rel_frill', name: 'Serrated Frill Fan', parentId: 'rel_head', length: 50, baseAngle: 0, pivot: [0, -180, 0] },
      { id: 'rel_horns', name: 'Navy Horn Spikes', parentId: 'rel_head', length: 35, baseAngle: -90, pivot: [0, -238, 0] },
      { id: 'rel_arm_l', name: 'Left Arm & Paw', parentId: 'rel_body', length: 48, baseAngle: 75, pivot: [-40, -103, 0] },
      { id: 'rel_arm_r', name: 'Right Arm & Camera', parentId: 'rel_body', length: 48, baseAngle: 75, pivot: [40, -103, 0] },
      { id: 'rel_leg_l', name: 'Left Leg & Claws', parentId: 'rel_root', length: 35, baseAngle: 90, pivot: [-24, -32, 0] },
      { id: 'rel_leg_r', name: 'Right Leg & Claws', parentId: 'rel_root', length: 35, baseAngle: 90, pivot: [24, -32, 0] },
      { id: 'rel_tail', name: 'Spiked Dorsal Tail', parentId: 'rel_root', length: 65, baseAngle: 155, pivot: [-22, -22, 0] },
    ],
    drawRoutine: (ctx, t, frame, scale = 1.0) => {
      ctx.save();
      ctx.scale(scale, scale);

      // Kith Character Space: Feet at (0, 0), Top of Horns at ~-268
      const walk = t * Math.PI * 2 * 0.8;
      const bob = Math.abs(Math.sin(walk)) * 8;
      const lean = Math.sin(walk) * 3;
      const legStride = Math.sin(walk) * 16;
      const tailSway = Math.sin(walk - 0.5) * 14;
      const blink = Math.sin(t * 3) > 0.92;

      ctx.translate(0, -bob);
      ctx.rotate((lean * Math.PI) / 180);

      // 1. Ground Drop Shadow
      ctx.save();
      ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
      ctx.beginPath();
      ctx.ellipse(0, 4 + bob * 0.4, 75, 12, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      const img = getRelloSvgImage();
      if (img && img.complete && img.naturalWidth > 0) {
        // Render the exact canonical SVG artwork from public/kith-party/characters/rello.svg
        // The SVG viewBox is [-40, -64, 480, 510], with feet anchored at (200, 420)
        ctx.drawImage(img, -200, -420, 400, 425);

        // Camera Flash on beat
        if (Math.sin(t * Math.PI * 4) > 0.85) {
          ctx.save();
          ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
          ctx.beginPath();
          ctx.arc(75, -180, 22, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }

        ctx.restore();
        return;
      }

      // 2. Tail with Dorsal Spikes (Trailing behind left)
      ctx.save();
      ctx.translate(-22, -22);
      ctx.rotate(((tailSway - 15) * Math.PI) / 180);

      // Main tail body
      ctx.fillStyle = '#2B3A5E';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.bezierCurveTo(-25, -2, -45, 12, -60, 26);
      ctx.bezierCurveTo(-45, 20, -25, 12, 0, 8);
      ctx.closePath();
      ctx.fill();

      // Tail spikes
      ctx.fillStyle = '#F07432';
      ctx.beginPath();
      ctx.moveTo(-25, 0); ctx.lineTo(-32, -10); ctx.lineTo(-35, 3); ctx.closePath();
      ctx.moveTo(-42, 10); ctx.lineTo(-50, 2); ctx.lineTo(-48, 16); ctx.closePath();
      ctx.fill();
      ctx.restore();

      // 3. Serrated Frill Fan (radiating crown behind head)
      ctx.save();
      ctx.translate(0, -175);
      const fanSway = Math.sin(walk * 1.5) * 2;
      ctx.rotate((fanSway * Math.PI) / 180);

      // Draw symmetrical frill lobes (orange on upper sides, magenta below)
      const frillAngles = [-114, -70, -26, 26, 70, 114];
      for (const ang of frillAngles) {
        ctx.save();
        ctx.rotate((ang * Math.PI) / 180);
        const isUpper = Math.abs(ang) < 80;
        const grad = ctx.createLinearGradient(0, 10, 0, -82);
        if (isUpper) {
          grad.addColorStop(0, '#C24A1C');
          grad.addColorStop(0.5, '#F7873A');
          grad.addColorStop(1, '#F9A45E');
        } else {
          grad.addColorStop(0, '#6E0D4D');
          grad.addColorStop(0.5, '#BE2A7A');
          grad.addColorStop(1, '#E4509F');
        }
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(-32, 10);
        ctx.lineTo(-4, -78);
        ctx.quadraticCurveTo(0, -84, 4, -78);
        ctx.lineTo(32, 10);
        ctx.closePath();
        ctx.fill();

        // Shading facet
        ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
        ctx.beginPath();
        ctx.moveTo(4, -78);
        ctx.lineTo(32, 10);
        ctx.lineTo(2, 10);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
      ctx.restore();

      // 4. Chunky Pear-Shaped Body (Navy speckled)
      ctx.save();
      const bodyGrad = ctx.createLinearGradient(0, -120, 0, -20);
      bodyGrad.addColorStop(0, '#1F2B52');
      bodyGrad.addColorStop(0.6, '#2B3A5E');
      bodyGrad.addColorStop(1, '#26324F');
      ctx.fillStyle = bodyGrad;
      ctx.beginPath();
      ctx.ellipse(0, -68, 48, 54, 0, 0, Math.PI * 2);
      ctx.fill();

      // Body volume shading
      const bodyVol = ctx.createRadialGradient(-16, -85, 8, 0, -68, 54);
      bodyVol.addColorStop(0, 'rgba(255, 255, 255, 0.16)');
      bodyVol.addColorStop(0.6, 'rgba(0, 0, 0, 0)');
      bodyVol.addColorStop(1, 'rgba(10, 5, 25, 0.35)');
      ctx.fillStyle = bodyVol;
      ctx.beginPath();
      ctx.ellipse(0, -68, 48, 54, 0, 0, Math.PI * 2);
      ctx.fill();

      // 5. Belly Plate (Warm Orange with White Flame Emblem)
      const bellyGrad = ctx.createRadialGradient(0, -60, 4, 0, -60, 36);
      bellyGrad.addColorStop(0, '#F6B07A');
      bellyGrad.addColorStop(1, '#F07432');
      ctx.fillStyle = bellyGrad;
      ctx.beginPath();
      ctx.ellipse(0, -62, 28, 38, 0, 0, Math.PI * 2);
      ctx.fill();

      // White Flame Emblem on Belly
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.moveTo(0, -38);
      ctx.bezierCurveTo(-10, -38, -15, -46, -13, -56);
      ctx.bezierCurveTo(-12, -62, -7, -66, -6, -74);
      ctx.bezierCurveTo(-2, -69, -1, -64, -3, -59);
      ctx.bezierCurveTo(0, -66, 4, -72, 3, -80);
      ctx.bezierCurveTo(9, -73, 12, -65, 10, -58);
      ctx.bezierCurveTo(15, -51, 10, -38, 0, -38);
      ctx.closePath();
      ctx.fill();

      // Flame core accent
      ctx.fillStyle = '#F59A3A';
      ctx.beginPath();
      ctx.ellipse(0, -48, 5, 8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // 6. Chubby Legs & Paws with White Claws
      ctx.save();
      // Left Leg
      ctx.fillStyle = '#2B3A5E';
      ctx.beginPath();
      ctx.roundRect(-36 + legStride * 0.5, -34, 24, 34, 10);
      ctx.fill();
      // Left Toe Claws
      ctx.fillStyle = '#FFF3E8';
      ctx.beginPath();
      ctx.arc(-32 + legStride * 0.5, 0, 4, 0, Math.PI * 2);
      ctx.arc(-24 + legStride * 0.5, 0, 4, 0, Math.PI * 2);
      ctx.arc(-16 + legStride * 0.5, 0, 4, 0, Math.PI * 2);
      ctx.fill();

      // Right Leg
      ctx.fillStyle = '#2B3A5E';
      ctx.beginPath();
      ctx.roundRect(12 - legStride * 0.5, -34, 24, 34, 10);
      ctx.fill();
      // Right Toe Claws
      ctx.fillStyle = '#FFF3E8';
      ctx.beginPath();
      ctx.arc(16 - legStride * 0.5, 0, 4, 0, Math.PI * 2);
      ctx.arc(24 - legStride * 0.5, 0, 4, 0, Math.PI * 2);
      ctx.arc(32 - legStride * 0.5, 0, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // 7. Cat-Dome Head, Face Mask, Eyes & Horns
      ctx.save();
      ctx.translate(0, -175);
      const headNod = Math.sin(walk) * 2;
      ctx.rotate((headNod * Math.PI) / 180);

      // Navy Horn Spikes (Left & Right)
      ctx.fillStyle = '#18263F';
      // Left Horn
      ctx.beginPath();
      ctx.moveTo(-44, -30);
      ctx.bezierCurveTo(-54, -58, -48, -78, -36, -92);
      ctx.bezierCurveTo(-26, -80, -18, -58, -14, -38);
      ctx.closePath();
      ctx.fill();
      // Right Horn
      ctx.beginPath();
      ctx.moveTo(44, -30);
      ctx.bezierCurveTo(54, -58, 48, -78, 36, -92);
      ctx.bezierCurveTo(26, -80, 18, -58, 14, -38);
      ctx.closePath();
      ctx.fill();

      // Central Crest Spike
      ctx.fillStyle = '#CC2A80';
      ctx.beginPath();
      ctx.moveTo(-10, -56);
      ctx.quadraticCurveTo(-6, -85, 0, -98);
      ctx.quadraticCurveTo(6, -85, 10, -56);
      ctx.closePath();
      ctx.fill();

      // Head Hood (Dark Navy Dome)
      const hoodGrad = ctx.createLinearGradient(0, -70, 0, 20);
      hoodGrad.addColorStop(0, '#1F2B52');
      hoodGrad.addColorStop(0.5, '#3B4277');
      hoodGrad.addColorStop(1, '#2B3A5E');
      ctx.fillStyle = hoodGrad;
      ctx.beginPath();
      ctx.ellipse(0, -10, 64, 56, 0, 0, Math.PI * 2);
      ctx.fill();

      // Forehead Shards / Scales
      ctx.fillStyle = '#16233F';
      for (const [sx, sy] of [[-14, -42], [14, -42], [-28, -32], [28, -32]]) {
        ctx.beginPath();
        ctx.ellipse(sx, sy, 4, 7, (sx > 0 ? 25 : -25) * Math.PI / 180, 0, Math.PI * 2);
        ctx.fill();
      }

      // White Face Mask Opening
      ctx.fillStyle = '#FDFDFF';
      ctx.beginPath();
      ctx.ellipse(0, 4, 54, 42, 0, 0, Math.PI * 2);
      ctx.fill();

      // Forehead Dark V-Point dropping between eyes
      ctx.fillStyle = '#1F2B52';
      ctx.beginPath();
      ctx.moveTo(-14, -28);
      ctx.lineTo(14, -28);
      ctx.lineTo(0, -10);
      ctx.closePath();
      ctx.fill();

      // Reello's Signature Vibrant Orange Bandit Eye Patches!
      ctx.fillStyle = '#F2621C';
      // Left eye patch
      ctx.beginPath();
      ctx.ellipse(-26, 2, 22, 17, -0.15, 0, Math.PI * 2);
      ctx.fill();
      // Right eye patch
      ctx.beginPath();
      ctx.ellipse(26, 2, 22, 17, 0.15, 0, Math.PI * 2);
      ctx.fill();

      // Cheek Blush
      ctx.fillStyle = 'rgba(245, 154, 166, 0.7)';
      ctx.beginPath();
      ctx.ellipse(-38, 16, 9, 5, 0, 0, Math.PI * 2);
      ctx.ellipse(38, 16, 9, 5, 0, 0, Math.PI * 2);
      ctx.fill();

      // Slanted Black Brow Wedges (Signature grumpy/determined expression)
      ctx.fillStyle = '#0B0A10';
      ctx.beginPath();
      ctx.moveTo(-45, -8); ctx.lineTo(-8, 4); ctx.lineTo(-10, 10); ctx.lineTo(-44, -2); ctx.closePath();
      ctx.moveTo(45, -8); ctx.lineTo(8, 4); ctx.lineTo(10, 10); ctx.lineTo(44, -2); ctx.closePath();
      ctx.fill();

      // Glowing Amber/Orange Eyes
      if (!blink) {
        ctx.fillStyle = '#FF4A12';
        ctx.beginPath();
        ctx.ellipse(-24, 4, 10, 14, -0.05, 0, Math.PI * 2);
        ctx.ellipse(24, 4, 10, 14, 0.05, 0, Math.PI * 2);
        ctx.fill();

        // Amber Inner Eye Gradient
        ctx.fillStyle = '#FF8A2E';
        ctx.beginPath();
        ctx.ellipse(-24, 5, 7, 10, 0, 0, Math.PI * 2);
        ctx.ellipse(24, 5, 7, 10, 0, 0, Math.PI * 2);
        ctx.fill();

        // Dark Slit Pupil
        ctx.fillStyle = '#1A0602';
        ctx.beginPath();
        ctx.ellipse(-24, 5, 3, 9, 0, 0, Math.PI * 2);
        ctx.ellipse(24, 5, 3, 9, 0, 0, Math.PI * 2);
        ctx.fill();

        // Catchlight sparkle
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(-26, 1, 2.5, 0, Math.PI * 2);
        ctx.arc(22, 1, 2.5, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // Closed blink slit
        ctx.strokeStyle = '#0B0A10';
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        ctx.moveTo(-34, 6); ctx.quadraticCurveTo(-24, 12, -14, 6);
        ctx.moveTo(14, 6); ctx.quadraticCurveTo(24, 12, 34, 6);
        ctx.stroke();
      }

      // Small Triangle Nose & Grumpy Mouth
      ctx.fillStyle = '#0B0A10';
      ctx.beginPath();
      ctx.moveTo(-2.5, 14); ctx.lineTo(2.5, 14); ctx.lineTo(0, 17); ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = '#0B0A10';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(0, 26, 8, 1.1 * Math.PI, 1.9 * Math.PI); // grumpy downturn
      ctx.stroke();
      ctx.restore();

      // 8. Chubby Arms & Rangefinder Camera Prop
      ctx.save();
      // Left Arm (hanging at side)
      ctx.fillStyle = '#2B3A5E';
      ctx.beginPath();
      ctx.roundRect(-46, -100, 16, 42, 8);
      ctx.fill();
      // Left Paw
      ctx.fillStyle = '#F27E3F';
      ctx.beginPath();
      ctx.arc(-38, -58, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#FFF3E8';
      ctx.fillRect(-42, -52, 3, 4);
      ctx.fillRect(-38, -52, 3, 4);
      ctx.fillRect(-34, -52, 3, 4);

      // Right Arm (holding vintage camera)
      ctx.fillStyle = '#2B3A5E';
      ctx.beginPath();
      ctx.roundRect(30, -100, 16, 38, 8);
      ctx.fill();

      // Camera Strap around neck
      ctx.strokeStyle = '#F2621C';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-20, -110);
      ctx.quadraticCurveTo(0, -60, 36, -70);
      ctx.stroke();

      // Vintage Rangefinder Camera
      ctx.save();
      ctx.translate(34, -72);
      ctx.rotate(-0.1);
      ctx.fillStyle = '#1A1822';
      ctx.strokeStyle = '#D4D0E0';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(-14, -10, 28, 20, 3);
      ctx.fill();
      ctx.stroke();

      // Metal top plate
      ctx.fillStyle = '#D4D0E0';
      ctx.fillRect(-14, -10, 28, 5);

      // Lens barrel
      ctx.fillStyle = '#0B0A10';
      ctx.beginPath();
      ctx.arc(0, 2, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#F2621C';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Glass lens reflection
      ctx.fillStyle = '#00DAF3';
      ctx.beginPath();
      ctx.arc(-2, 0, 2, 0, Math.PI * 2);
      ctx.fill();

      // Camera Flash Burst on beat!
      if (Math.sin(t * Math.PI * 4) > 0.85) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
        ctx.beginPath();
        ctx.arc(10, -12, 12, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      // Right Paw holding camera
      ctx.fillStyle = '#F27E3F';
      ctx.beginPath();
      ctx.arc(38, -65, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      ctx.restore();
    },
  },

  // ───────────────────────────────────────────────────────────────────────────
  // 2. CHORA (LORIK) — THE SONIC & MUSIC KAIJU
  // ─────────────────────────────────────────────────────────────────────────
  chora: {
    id: 'chora',
    name: 'Chora',
    alias: 'Lorik',
    title: 'The Sonic & Music Kaiju',
    species: 'Kith Kaiju',
    domain: 'Music & Sound',
    primaryColor: '#7A66BC',
    accentColor: '#C2257C',
    bellyColor: '#C2257C',
    glowColor: '#B04BFF',
    prop: 'book',
    svgPath: '/kith-party/characters/chora.svg',
    svgViewBox: '-40 -64 480 510',
    bones: [
      { id: 'cho_root', name: 'Root Pelvis', parentId: null, length: 0, baseAngle: 0, pivot: [0, 0, 0] },
      { id: 'cho_body', name: 'Torso & Belly', parentId: 'cho_root', length: 50, baseAngle: -90, pivot: [0, -30, 0] },
      { id: 'cho_neck', name: 'Neck Pivot', parentId: 'cho_body', length: 30, baseAngle: -90, pivot: [0, -112, 0] },
      { id: 'cho_head', name: 'Cat-Dome Head', parentId: 'cho_neck', length: 45, baseAngle: 0, pivot: [0, -175, 0] },
      { id: 'cho_frill', name: 'Serrated Frill Fan', parentId: 'cho_head', length: 50, baseAngle: 0, pivot: [0, -180, 0] },
      { id: 'cho_horns', name: 'Navy Horn Spikes & Crest', parentId: 'cho_head', length: 35, baseAngle: -90, pivot: [0, -238, 0] },
      { id: 'cho_arm_l', name: 'Left Arm & Mic', parentId: 'cho_body', length: 48, baseAngle: 75, pivot: [-40, -103, 0] },
      { id: 'cho_arm_r', name: 'Right Arm & Book', parentId: 'cho_body', length: 48, baseAngle: 75, pivot: [40, -103, 0] },
      { id: 'cho_leg_l', name: 'Left Leg & Claws', parentId: 'cho_root', length: 35, baseAngle: 90, pivot: [-24, -32, 0] },
      { id: 'cho_leg_r', name: 'Right Leg & Claws', parentId: 'cho_root', length: 35, baseAngle: 90, pivot: [24, -32, 0] },
      { id: 'cho_tail', name: 'Spiked Dorsal Tail', parentId: 'cho_root', length: 65, baseAngle: 155, pivot: [-22, -22, 0] },
    ],
    drawRoutine: (ctx, t, frame, scale = 1.0) => {
      ctx.save();
      ctx.scale(scale, scale);

      // Kith Character Space: Feet at (0, 0), Top of Crest at ~-268
      const walk = t * Math.PI * 2 * 0.85;
      const bob = Math.abs(Math.sin(walk)) * 7;
      const lean = Math.sin(walk) * 2.5;
      const legStride = Math.sin(walk) * 15;
      const tailSway = Math.sin(walk - 0.4) * 16;
      const blink = Math.sin(t * 3.2 + 1) > 0.92;

      ctx.translate(0, -bob);
      ctx.rotate((lean * Math.PI) / 180);

      // 1. Ground Drop Shadow
      ctx.save();
      ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
      ctx.beginPath();
      ctx.ellipse(0, 4 + bob * 0.4, 75, 12, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      const img = getChoraSvgImage();
      if (img && img.complete && img.naturalWidth > 0) {
        // Render the exact canonical SVG artwork from public/kith-party/characters/chora.svg
        // The SVG viewBox is [-40, -64, 480, 510], with feet anchored at (200, 420)
        ctx.drawImage(img, -200, -420, 400, 425);

        // Floating musical notes from book
        if (Math.sin(t * Math.PI * 3) > 0.4) {
          ctx.save();
          ctx.fillStyle = '#00DAF3';
          ctx.font = 'bold 22px sans-serif';
          ctx.fillText('♫', 50, -210);
          ctx.fillStyle = '#B04BFF';
          ctx.fillText('♪', 85, -250);
          ctx.restore();
        }

        ctx.restore();
        return;
      }

      // 2. Tail with Dorsal Spikes (Trailing behind left)
      ctx.save();
      ctx.translate(-22, -22);
      ctx.rotate(((tailSway - 15) * Math.PI) / 180);

      // Purple Tail Body
      ctx.fillStyle = '#7A66BC';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.bezierCurveTo(-25, -2, -45, 12, -60, 26);
      ctx.bezierCurveTo(-45, 20, -25, 12, 0, 8);
      ctx.closePath();
      ctx.fill();

      // Tail spikes (Magenta)
      ctx.fillStyle = '#C21A83';
      ctx.beginPath();
      ctx.moveTo(-25, 0); ctx.lineTo(-32, -10); ctx.lineTo(-35, 3); ctx.closePath();
      ctx.moveTo(-42, 10); ctx.lineTo(-50, 2); ctx.lineTo(-48, 16); ctx.closePath();
      ctx.fill();
      ctx.restore();

      // 3. Serrated Frill Fan (radiating crown behind head)
      ctx.save();
      ctx.translate(0, -175);
      const fanSway = Math.cos(walk * 1.5) * 2;
      ctx.rotate((fanSway * Math.PI) / 180);

      // Symmetrical frill lobes
      const frillAngles = [-114, -70, -26, 26, 70, 114];
      for (const ang of frillAngles) {
        ctx.save();
        ctx.rotate((ang * Math.PI) / 180);
        const isUpper = Math.abs(ang) < 80;
        const grad = ctx.createLinearGradient(0, 10, 0, -82);
        if (isUpper) {
          grad.addColorStop(0, '#C24A1C');
          grad.addColorStop(0.5, '#F7873A');
          grad.addColorStop(1, '#F9A45E');
        } else {
          grad.addColorStop(0, '#6E0D4D');
          grad.addColorStop(0.5, '#C2287C');
          grad.addColorStop(1, '#E4509F');
        }
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(-32, 10);
        ctx.lineTo(-4, -78);
        ctx.quadraticCurveTo(0, -84, 4, -78);
        ctx.lineTo(32, 10);
        ctx.closePath();
        ctx.fill();

        // Shading facet
        ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
        ctx.beginPath();
        ctx.moveTo(4, -78);
        ctx.lineTo(32, 10);
        ctx.lineTo(2, 10);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
      ctx.restore();

      // 4. Chunky Pear-Shaped Body (Purple speckled)
      ctx.save();
      const bodyGrad = ctx.createLinearGradient(0, -120, 0, -20);
      bodyGrad.addColorStop(0, '#5847A4');
      bodyGrad.addColorStop(0.6, '#7A66BC');
      bodyGrad.addColorStop(1, '#6650AE');
      ctx.fillStyle = bodyGrad;
      ctx.beginPath();
      ctx.ellipse(0, -68, 48, 54, 0, 0, Math.PI * 2);
      ctx.fill();

      // Body volume shading
      const bodyVol = ctx.createRadialGradient(-16, -85, 8, 0, -68, 54);
      bodyVol.addColorStop(0, 'rgba(255, 255, 255, 0.16)');
      bodyVol.addColorStop(0.6, 'rgba(0, 0, 0, 0)');
      bodyVol.addColorStop(1, 'rgba(10, 5, 25, 0.35)');
      ctx.fillStyle = bodyVol;
      ctx.beginPath();
      ctx.ellipse(0, -68, 48, 54, 0, 0, Math.PI * 2);
      ctx.fill();

      // 5. Segmented Magenta Belly Plate with Gold Notes
      ctx.fillStyle = '#C2257C';
      ctx.beginPath();
      ctx.ellipse(0, -62, 28, 38, 0, 0, Math.PI * 2);
      ctx.fill();

      // Segmented horizontal ridge lines
      ctx.strokeStyle = '#9C1C63';
      ctx.lineWidth = 2;
      for (let y = -86; y <= -38; y += 8) {
        const w = 18 - Math.abs(y + 62) * 0.3;
        ctx.beginPath();
        ctx.moveTo(-w, y);
        ctx.quadraticCurveTo(0, y + 2, w, y);
        ctx.stroke();
      }

      // Golden Beamed Eighth Notes Emblem (♫)
      ctx.fillStyle = '#F39A45';
      ctx.beginPath();
      // Note head 1
      ctx.ellipse(-8, -60, 5, 4, -0.3, 0, Math.PI * 2);
      // Note head 2
      ctx.ellipse(8, -65, 5, 4, -0.3, 0, Math.PI * 2);
      ctx.fill();

      // Beamed stems
      ctx.strokeStyle = '#F8B860';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(-5, -62); ctx.lineTo(-5, -76); ctx.lineTo(11, -81); ctx.lineTo(11, -67);
      ctx.stroke();
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.moveTo(-5, -75); ctx.lineTo(11, -80);
      ctx.stroke();
      ctx.restore();

      // 6. Chubby Legs & Paws with White Claws
      ctx.save();
      // Left Leg
      ctx.fillStyle = '#6650AE';
      ctx.beginPath();
      ctx.roundRect(-36 + legStride * 0.5, -34, 24, 34, 10);
      ctx.fill();
      // Left Toe Claws
      ctx.fillStyle = '#F4F1F7';
      ctx.beginPath();
      ctx.arc(-32 + legStride * 0.5, 0, 4, 0, Math.PI * 2);
      ctx.arc(-24 + legStride * 0.5, 0, 4, 0, Math.PI * 2);
      ctx.arc(-16 + legStride * 0.5, 0, 4, 0, Math.PI * 2);
      ctx.fill();

      // Right Leg
      ctx.fillStyle = '#6650AE';
      ctx.beginPath();
      ctx.roundRect(12 - legStride * 0.5, -34, 24, 34, 10);
      ctx.fill();
      // Right Toe Claws
      ctx.fillStyle = '#F4F1F7';
      ctx.beginPath();
      ctx.arc(16 - legStride * 0.5, 0, 4, 0, Math.PI * 2);
      ctx.arc(24 - legStride * 0.5, 0, 4, 0, Math.PI * 2);
      ctx.arc(32 - legStride * 0.5, 0, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // 7. Cat-Dome Head, Face Mask, Eyes & Horns
      ctx.save();
      ctx.translate(0, -175);
      const headNod = Math.sin(walk) * 2;
      ctx.rotate((headNod * Math.PI) / 180);

      // Navy Horn Spikes (Left & Right)
      ctx.fillStyle = '#1C2D4E';
      // Left Horn
      ctx.beginPath();
      ctx.moveTo(-44, -30);
      ctx.bezierCurveTo(-54, -58, -48, -78, -36, -92);
      ctx.bezierCurveTo(-26, -80, -18, -58, -14, -38);
      ctx.closePath();
      ctx.fill();
      // Right Horn
      ctx.beginPath();
      ctx.moveTo(44, -30);
      ctx.bezierCurveTo(54, -58, 48, -78, 36, -92);
      ctx.bezierCurveTo(26, -80, 18, -58, 14, -38);
      ctx.closePath();
      ctx.fill();

      // Central Tall Magenta Crest Spike
      ctx.fillStyle = '#D1287F';
      ctx.beginPath();
      ctx.moveTo(-10, -56);
      ctx.quadraticCurveTo(-6, -88, 0, -104);
      ctx.quadraticCurveTo(6, -88, 10, -56);
      ctx.closePath();
      ctx.fill();

      // Head Hood (Lavender/Purple Dome)
      const hoodGrad = ctx.createLinearGradient(0, -70, 0, 20);
      hoodGrad.addColorStop(0, '#2F3C72');
      hoodGrad.addColorStop(0.5, '#7A63BF');
      hoodGrad.addColorStop(1, '#5847A4');
      ctx.fillStyle = hoodGrad;
      ctx.beginPath();
      ctx.ellipse(0, -10, 64, 56, 0, 0, Math.PI * 2);
      ctx.fill();

      // Forehead Shards / Scales
      ctx.fillStyle = '#1F2F55';
      for (const [sx, sy] of [[-14, -42], [14, -42], [-28, -32], [28, -32]]) {
        ctx.beginPath();
        ctx.ellipse(sx, sy, 4, 7, (sx > 0 ? 25 : -25) * Math.PI / 180, 0, Math.PI * 2);
        ctx.fill();
      }

      // White Face Mask Opening
      ctx.fillStyle = '#FDFDFF';
      ctx.beginPath();
      ctx.ellipse(0, 4, 54, 42, 0, 0, Math.PI * 2);
      ctx.fill();

      // Forehead Dark V-Point dropping between eyes
      ctx.fillStyle = '#2F3C72';
      ctx.beginPath();
      ctx.moveTo(-14, -28);
      ctx.lineTo(14, -28);
      ctx.lineTo(0, -10);
      ctx.closePath();
      ctx.fill();

      // Chora's Signature Deep Purple/Lavender Bandit Eye Patches!
      ctx.fillStyle = '#7A66BF';
      // Left eye patch
      ctx.beginPath();
      ctx.ellipse(-26, 2, 22, 17, -0.15, 0, Math.PI * 2);
      ctx.fill();
      // Right eye patch
      ctx.beginPath();
      ctx.ellipse(26, 2, 22, 17, 0.15, 0, Math.PI * 2);
      ctx.fill();

      // Cheek Blush (Soft Lilac Pink)
      ctx.fillStyle = 'rgba(242, 163, 181, 0.7)';
      ctx.beginPath();
      ctx.ellipse(-38, 16, 9, 5, 0, 0, Math.PI * 2);
      ctx.ellipse(38, 16, 9, 5, 0, 0, Math.PI * 2);
      ctx.fill();

      // Slanted Black Brow Wedges
      ctx.fillStyle = '#0E0B18';
      ctx.beginPath();
      ctx.moveTo(-45, -8); ctx.lineTo(-8, 4); ctx.lineTo(-10, 10); ctx.lineTo(-44, -2); ctx.closePath();
      ctx.moveTo(45, -8); ctx.lineTo(8, 4); ctx.lineTo(10, 10); ctx.lineTo(44, -2); ctx.closePath();
      ctx.fill();

      // Dark Purple Expressive Eyes
      if (!blink) {
        ctx.fillStyle = '#5B48A6';
        ctx.beginPath();
        ctx.ellipse(-24, 4, 10, 14, -0.05, 0, Math.PI * 2);
        ctx.ellipse(24, 4, 10, 14, 0.05, 0, Math.PI * 2);
        ctx.fill();

        // Lavender Inner Iris
        ctx.fillStyle = '#9C8AD6';
        ctx.beginPath();
        ctx.ellipse(-24, 5, 7, 10, 0, 0, Math.PI * 2);
        ctx.ellipse(24, 5, 7, 10, 0, 0, Math.PI * 2);
        ctx.fill();

        // Dark Pupil
        ctx.fillStyle = '#0E0B18';
        ctx.beginPath();
        ctx.ellipse(-24, 5, 3, 9, 0, 0, Math.PI * 2);
        ctx.ellipse(24, 5, 3, 9, 0, 0, Math.PI * 2);
        ctx.fill();

        // Catchlight sparkle
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(-26, 1, 2.5, 0, Math.PI * 2);
        ctx.arc(22, 1, 2.5, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // Closed blink
        ctx.strokeStyle = '#0E0B18';
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        ctx.moveTo(-34, 6); ctx.quadraticCurveTo(-24, 12, -14, 6);
        ctx.moveTo(14, 6); ctx.quadraticCurveTo(24, 12, 34, 6);
        ctx.stroke();
      }

      // Small Triangle Nose & Grumpy Mouth
      ctx.fillStyle = '#0E0B18';
      ctx.beginPath();
      ctx.moveTo(-2.5, 14); ctx.lineTo(2.5, 14); ctx.lineTo(0, 17); ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = '#0E0B18';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(0, 26, 8, 1.1 * Math.PI, 1.9 * Math.PI);
      ctx.stroke();
      ctx.restore();

      // 8. Chubby Arms & Black "LORIK" Music Book Prop
      ctx.save();
      // Left Arm
      ctx.fillStyle = '#7A66BC';
      ctx.beginPath();
      ctx.roundRect(-46, -100, 16, 42, 8);
      ctx.fill();
      // Left Magenta Paw
      ctx.fillStyle = '#C93590';
      ctx.beginPath();
      ctx.arc(-38, -58, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#F4F1FA';
      ctx.fillRect(-42, -52, 3, 4);
      ctx.fillRect(-38, -52, 3, 4);
      ctx.fillRect(-34, -52, 3, 4);

      // Right Arm holding "LORIK" Music Book
      ctx.fillStyle = '#7A66BC';
      ctx.beginPath();
      ctx.roundRect(28, -98, 16, 36, 8);
      ctx.fill();

      // Black Music Book
      ctx.save();
      ctx.translate(32, -66);
      ctx.rotate(0.15);
      ctx.fillStyle = '#13111A';
      ctx.strokeStyle = '#C93590';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(-16, -14, 30, 24, 3);
      ctx.fill();
      ctx.stroke();

      // Book spine & gold title
      ctx.fillStyle = '#C93590';
      ctx.fillRect(-16, -14, 5, 24);
      ctx.fillStyle = '#F39A45';
      ctx.font = 'bold 7px sans-serif';
      ctx.fillText('LORIK', -7, 0);

      // Floating musical notes from book
      if (Math.sin(t * Math.PI * 3) > 0.4) {
        ctx.fillStyle = '#B04BFF';
        ctx.font = 'bold 16px sans-serif';
        ctx.fillText('♪', 14, -18);
      }
      ctx.restore();

      // Right Magenta Paw
      ctx.fillStyle = '#C93590';
      ctx.beginPath();
      ctx.arc(36, -60, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      ctx.restore();
    },
  },
};
