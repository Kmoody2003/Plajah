/**
 * services/anima/classicCharacters.ts
 *
 * Plajah Anima — Classic Public Domain Cartoon Rigs & Authentic Walk Cycles
 *
 * Fully rigged vector templates with historic animation timing, rubber-hose mechanics,
 * and signature walk cycles:
 *
 * 1. 🚢 Steamboat Willie / Classic 1928 Pilot (Public Domain as of Jan 1, 2024)
 *    - Rubber-hose noodle limbs, pie-eyes, button shorts, steamboat whistle bounce on 2s.
 * 2. 🐱 Felix the Cat (1919, Messmer & Sullivan)
 *    - Signature hands-behind-back contemplative pacing stride, question mark tail.
 * 3. 💃 Fleischer Jazz Flapper (Inspired by 1930s Fleischer Talkartoons)
 *    - Syncopated 2-beat jazz strut, shoulder shimmy, inkwell boiling lines.
 * 4. 🐰 Oswald the Lucky Rabbit (1927, Disney & Iwerks)
 *    - High-stepping springy stride, floppy ears with secondary overlap drag.
 * 5. ⚓ Sailor Swagger (1930s Fleischer Public Domain Era)
 *    - Heavy rolling sailor strut, corncob pipe puffing, bulging forearm pumping.
 * 6. 🦕 Gertie the Dinosaur (1914, Winsor McCay)
 *    - Historic pioneer keyframe weight, massive anatomical breathing and heavy lumber.
 */

import type { AnimaBone, AnimaLayer, Keyframe } from './types';

export interface ClassicCharacterTemplate {
  id: string;
  name: string;
  creator: string;
  year: number;
  cadence: 1 | 2 | 3; // Animation hold cadence (e.g. on 2s = 12fps)
  description: string;
  aesthetic: 'rubber_hose_bw' | 'fleischer_jazz' | 'silent_mccay';
  rig: {
    bones: AnimaBone[];
    walkCycle: Record<string, Keyframe<number>[]>;
    drawRoutine: (ctx: CanvasRenderingContext2D, t: number, frame: number, scale: number) => void;
  };
}

export const CLASSIC_CHARACTERS: Record<string, ClassicCharacterTemplate> = {
  // ───────────────────────────────────────────────────────────────────────────
  // 1. STEAMBOAT WILLIE (1928)
  // ─────────────────────────────────────────────────────────────────────────
  steamboat_willie: {
    id: 'steamboat_willie',
    name: 'Steamboat Pilot (1928)',
    creator: 'Walt Disney & Ub Iwerks',
    year: 1928,
    cadence: 2, // on 2s
    aesthetic: 'rubber_hose_bw',
    description: 'Iconic 1928 rubber-hose sailor with bouncy foot rolls, whistling snout, and rhythmic steam engine cadence.',
    rig: {
      bones: [
        { id: 'b_root', name: 'Root', parentId: null, length: 0, baseAngle: 0, pivot: [0, 0, 0] },
        { id: 'b_spine', name: 'Spine', parentId: 'b_root', length: 50, baseAngle: -90, pivot: [0, 0, 0] },
        { id: 'b_head', name: 'Head', parentId: 'b_spine', length: 40, baseAngle: 0, pivot: [0, -50, 0] },
        { id: 'b_leg_l', name: 'Leg L', parentId: 'b_root', length: 45, baseAngle: 90, pivot: [-15, 0, 0] },
        { id: 'b_leg_r', name: 'Leg R', parentId: 'b_root', length: 45, baseAngle: 90, pivot: [15, 0, 0] },
      ],
      walkCycle: {
        'root.y': [
          { id: 'sw_y1', t: 0, v: 0, ease: 'smooth' },
          { id: 'sw_y2', t: 0.25, v: -16, ease: 'smooth' }, // bounce apex
          { id: 'sw_y3', t: 0.5, v: 0, ease: 'smooth' },
          { id: 'sw_y4', t: 0.75, v: -16, ease: 'smooth' },
          { id: 'sw_y5', t: 1.0, v: 0, ease: 'smooth' },
        ],
        'leg_l.rot': [
          { id: 'sw_ll1', t: 0, v: -28, ease: 'smooth' },
          { id: 'sw_ll2', t: 0.5, v: 28, ease: 'smooth' },
          { id: 'sw_ll3', t: 1.0, v: -28, ease: 'smooth' },
        ],
        'leg_r.rot': [
          { id: 'sw_lr1', t: 0, v: 28, ease: 'smooth' },
          { id: 'sw_lr2', t: 0.5, v: -28, ease: 'smooth' },
          { id: 'sw_lr3', t: 1.0, v: 28, ease: 'smooth' },
        ],
      },
      drawRoutine: (ctx, t, frame, scale = 1.0) => {
        ctx.save();
        ctx.scale(scale, scale);

        // Rhythm bounce
        const bounce = Math.abs(Math.sin(t * Math.PI * 2)) * 14;
        const legSwing = Math.sin(t * Math.PI * 2) * 26;

        ctx.translate(0, -bounce);

        // Pilot Hat
        ctx.fillStyle = '#FFFFFF';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        ctx.ellipse(0, -95, 24, 8, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.beginPath();
        ctx.roundRect(-16, -115, 32, 22, 6);
        ctx.fill();
        ctx.stroke();

        // Round Ears
        ctx.fillStyle = '#000000';
        ctx.beginPath();
        ctx.arc(-32, -80, 18, 0, Math.PI * 2);
        ctx.arc(32, -80, 18, 0, Math.PI * 2);
        ctx.fill();

        // Head
        ctx.beginPath();
        ctx.arc(0, -60, 32, 0, Math.PI * 2);
        ctx.fill();

        // White Face Mask
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.ellipse(-10, -62, 14, 20, 0, 0, Math.PI * 2);
        ctx.ellipse(10, -62, 14, 20, 0, 0, Math.PI * 2);
        ctx.fill();

        // Classic Pie-Eyes
        ctx.fillStyle = '#000000';
        ctx.beginPath();
        ctx.arc(-8, -65, 5, 0, Math.PI * 2);
        ctx.arc(8, -65, 5, 0, Math.PI * 2);
        ctx.fill();

        // Whistling Snout (Puckered O-mouth)
        const whistlePulse = 1.0 + Math.sin(t * Math.PI * 4) * 0.15;
        ctx.beginPath();
        ctx.ellipse(18 * whistlePulse, -50, 8, 6, 0.2, 0, Math.PI * 2);
        ctx.fillStyle = '#FFFFFF';
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#000000';
        ctx.beginPath();
        ctx.arc(22 * whistlePulse, -52, 4, 0, Math.PI * 2);
        ctx.fill();

        // Musical Whistle Note
        if (Math.sin(t * Math.PI * 2) > 0.2) {
          ctx.font = 'bold 16px sans-serif';
          ctx.fillText('♪', 38, -65);
        }

        // Torso & Button Shorts
        ctx.fillStyle = '#000000';
        ctx.beginPath();
        ctx.roundRect(-14, -30, 28, 35, 10);
        ctx.fill();

        // White Shorts with two oval buttons
        ctx.fillStyle = '#FFFFFF';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.roundRect(-16, -15, 32, 22, 6);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#000000';
        ctx.beginPath();
        ctx.ellipse(-6, -6, 3, 5, 0, 0, Math.PI * 2);
        ctx.ellipse(6, -6, 3, 5, 0, 0, Math.PI * 2);
        ctx.fill();

        // Rubber-Hose Legs & Big Shoes
        ctx.lineWidth = 6;
        ctx.lineCap = 'round';

        // Left Leg
        ctx.beginPath();
        ctx.moveTo(-10, 5);
        ctx.quadraticCurveTo(-15 + legSwing * 0.5, 25, -10 + legSwing, 40);
        ctx.stroke();

        // Right Leg
        ctx.beginPath();
        ctx.moveTo(10, 5);
        ctx.quadraticCurveTo(15 - legSwing * 0.5, 25, 10 - legSwing, 40);
        ctx.stroke();

        // Big Classic Shoes
        ctx.fillStyle = '#FFFFFF';
        ctx.lineWidth = 3;

        ctx.beginPath();
        ctx.ellipse(-10 + legSwing, 42, 16, 9, legSwing * 0.015, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.beginPath();
        ctx.ellipse(10 - legSwing, 42, 16, 9, -legSwing * 0.015, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.restore();
      },
    },
  },

  // ───────────────────────────────────────────────────────────────────────────
  // 2. FELIX THE CAT (1919)
  // ─────────────────────────────────────────────────────────────────────────
  felix_the_cat: {
    id: 'felix_the_cat',
    name: 'Felix the Pacing Cat (1919)',
    creator: 'Otto Messmer & Pat Sullivan',
    year: 1919,
    cadence: 2,
    aesthetic: 'rubber_hose_bw',
    description: 'The silent film pioneer with hands clasped behind back, hunched contemplative pacing, and question-mark tail.',
    rig: {
      bones: [
        { id: 'f_root', name: 'Root', parentId: null, length: 0, baseAngle: 0, pivot: [0, 0, 0] },
        { id: 'f_spine', name: 'Spine', parentId: 'f_root', length: 45, baseAngle: -80, pivot: [0, 0, 0] },
      ],
      walkCycle: {
        'root.x': [
          { id: 'fx1', t: 0, v: -40, ease: 'smooth' },
          { id: 'fx2', t: 1.0, v: 40, ease: 'smooth' },
        ],
      },
      drawRoutine: (ctx, t, frame, scale = 1.0) => {
        ctx.save();
        ctx.scale(scale, scale);

        // Hunched pacing stride
        const pace = Math.sin(t * Math.PI * 2);
        const yBob = Math.abs(Math.sin(t * Math.PI * 2)) * 6;

        ctx.translate(pace * 20, -yBob);

        // Question-mark Tail
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 5;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(-18, -10);
        ctx.bezierCurveTo(-45, -20, -40 + Math.sin(t * 4) * 8, -65, -25, -60);
        ctx.stroke();

        // Hunched Torso
        ctx.fillStyle = '#000000';
        ctx.beginPath();
        ctx.ellipse(0, -25, 20, 26, 0.25, 0, Math.PI * 2);
        ctx.fill();

        // Hands clasped behind back
        ctx.beginPath();
        ctx.arc(-18, -20, 8, 0, Math.PI * 2);
        ctx.fill();

        // Head & Pointed Ears
        ctx.beginPath();
        ctx.arc(10, -60, 26, 0, Math.PI * 2);
        ctx.fill();

        // Pointed Ears
        ctx.beginPath();
        ctx.moveTo(0, -80);
        ctx.lineTo(-8, -104);
        ctx.lineTo(8, -84);
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(18, -82);
        ctx.lineTo(26, -106);
        ctx.lineTo(34, -78);
        ctx.fill();

        // White Muzzle & Triangular Cat Eyes
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.ellipse(20, -55, 14, 10, 0, 0, Math.PI * 2);
        ctx.fill();

        // Wide Grin
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(20, -56, 10, 0.2, Math.PI * 0.9);
        ctx.stroke();

        // White Large Cartoon Eyes
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.ellipse(10, -68, 6, 10, 0.1, 0, Math.PI * 2);
        ctx.ellipse(22, -68, 6, 10, 0.1, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#000000';
        ctx.beginPath();
        ctx.arc(12, -67, 3, 0, Math.PI * 2);
        ctx.arc(24, -67, 3, 0, Math.PI * 2);
        ctx.fill();

        // Pacing Legs
        ctx.lineWidth = 5;
        const leg1 = Math.sin(t * Math.PI * 2) * 20;
        ctx.beginPath();
        ctx.moveTo(-6, -5);
        ctx.lineTo(-6 + leg1, 28);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(8, -5);
        ctx.lineTo(8 - leg1, 28);
        ctx.stroke();

        // Paws
        ctx.beginPath();
        ctx.arc(-6 + leg1 + 4, 30, 7, 0, Math.PI * 2);
        ctx.arc(8 - leg1 + 4, 30, 7, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
      },
    },
  },

  // ───────────────────────────────────────────────────────────────────────────
  // 3. FLEISCHER JAZZ FLAPPER (1930)
  // ─────────────────────────────────────────────────────────────────────────
  fleischer_flapper: {
    id: 'fleischer_flapper',
    name: 'Fleischer Jazz Flapper (1930)',
    creator: 'Fleischer Studios (Max & Dave Fleischer)',
    year: 1930,
    cadence: 2,
    aesthetic: 'fleischer_jazz',
    description: 'Syncopated 2-beat jazz stride, bouncy curls, garter, and lively inkwell boiling linework.',
    rig: {
      bones: [
        { id: 'fl_root', name: 'Root', parentId: null, length: 0, baseAngle: 0, pivot: [0, 0, 0] },
      ],
      walkCycle: {},
      drawRoutine: (ctx, t, frame, scale = 1.0) => {
        ctx.save();
        ctx.scale(scale, scale);

        // Syncopated 2-beat jazz shimmy
        const beat = Math.sin(t * Math.PI * 4);
        const hipSway = Math.sin(t * Math.PI * 2) * 12;

        ctx.translate(0, -Math.abs(beat) * 10);

        // Large Curled Flapper Hair
        ctx.fillStyle = '#000000';
        ctx.beginPath();
        ctx.arc(0, -75, 34, 0, Math.PI * 2);
        ctx.fill();

        // Little curls on cheek
        for (let i = -2; i <= 2; i++) {
          ctx.beginPath();
          ctx.arc(i * 14, -100, 8, 0, Math.PI * 2);
          ctx.fill();
        }

        // Cute Face
        ctx.fillStyle = '#FFFFFF';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, -68, 24, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Big Doe Eyes with Eyelashes
        ctx.fillStyle = '#000000';
        ctx.beginPath();
        ctx.ellipse(-10, -70, 5, 8, 0, 0, Math.PI * 2);
        ctx.ellipse(10, -70, 5, 8, 0, 0, Math.PI * 2);
        ctx.fill();

        // Eyelashes
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-14, -78); ctx.lineTo(-18, -84);
        ctx.moveTo(14, -78); ctx.lineTo(18, -84);
        ctx.stroke();

        // Button Nose & Heart Lips
        ctx.fillStyle = '#D40055';
        ctx.beginPath();
        ctx.arc(0, -56, 4, 0, Math.PI * 2);
        ctx.fill();

        // Little Red Dress
        ctx.fillStyle = '#D40055';
        ctx.beginPath();
        ctx.moveTo(-16 + hipSway * 0.4, -40);
        ctx.lineTo(16 + hipSway * 0.4, -40);
        ctx.lineTo(24 + hipSway, 0);
        ctx.lineTo(-24 + hipSway, 0);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Garter on left thigh
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(-14, 12, 10, 4);

        // Legs
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(-10, 0);
        ctx.lineTo(-10 + Math.sin(t * Math.PI * 2) * 16, 36);
        ctx.moveTo(10, 0);
        ctx.lineTo(10 - Math.sin(t * Math.PI * 2) * 16, 36);
        ctx.stroke();

        ctx.restore();
      },
    },
  },

  // ───────────────────────────────────────────────────────────────────────────
  // 4. OSWALD THE LUCKY RABBIT (1927)
  // ─────────────────────────────────────────────────────────────────────────
  oswald_rabbit: {
    id: 'oswald_rabbit',
    name: 'Oswald the Lucky Rabbit (1927)',
    creator: 'Walt Disney & Ub Iwerks',
    year: 1927,
    cadence: 2,
    aesthetic: 'rubber_hose_bw',
    description: 'High-stepping springy stride, long floppy rubber ears with secondary overlap follow-through.',
    rig: {
      bones: [],
      walkCycle: {},
      drawRoutine: (ctx, t, frame, scale = 1.0) => {
        ctx.save();
        ctx.scale(scale, scale);

        const spring = Math.abs(Math.sin(t * Math.PI * 2)) * 18;
        const earLag = Math.sin(t * Math.PI * 2 - 0.4) * 20;

        ctx.translate(0, -spring);

        // Long Floppy Ears with Overlap Drag
        ctx.fillStyle = '#000000';
        ctx.beginPath();
        ctx.ellipse(-14 + earLag, -120, 9, 36, -0.2 + earLag * 0.01, 0, Math.PI * 2);
        ctx.ellipse(14 + earLag, -120, 9, 36, 0.2 + earLag * 0.01, 0, Math.PI * 2);
        ctx.fill();

        // Round Head
        ctx.beginPath();
        ctx.arc(0, -60, 28, 0, Math.PI * 2);
        ctx.fill();

        // White Muzzle
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.ellipse(0, -50, 16, 12, 0, 0, Math.PI * 2);
        ctx.fill();

        // Black Nose & Eyes
        ctx.fillStyle = '#000000';
        ctx.beginPath();
        ctx.arc(0, -54, 4, 0, Math.PI * 2);
        ctx.arc(-8, -64, 4, 0, Math.PI * 2);
        ctx.arc(8, -64, 4, 0, Math.PI * 2);
        ctx.fill();

        // Blue Shorts with suspender buttons
        ctx.fillStyle = '#00DAF3';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.roundRect(-15, -20, 30, 24, 6);
        ctx.fill();
        ctx.stroke();

        // High Springing Feet
        ctx.lineWidth = 5;
        const leg = Math.sin(t * Math.PI * 2) * 22;
        ctx.beginPath();
        ctx.moveTo(-8, 4);
        ctx.lineTo(-8 + leg, 35);
        ctx.moveTo(8, 4);
        ctx.lineTo(8 - leg, 35);
        ctx.stroke();

        ctx.fillStyle = '#000000';
        ctx.beginPath();
        ctx.ellipse(-8 + leg, 38, 14, 7, 0, 0, Math.PI * 2);
        ctx.ellipse(8 - leg, 38, 14, 7, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
      },
    },
  },
};
