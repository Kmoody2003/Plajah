/**
 * services/anima/classicCharacters.ts
 *
 * Plajah Anima — Classic Public Domain Cartoon Rigs & Authentic Walk Cycles
 *
 * Fully rigged vector templates with historic animation timing, authentic 1920s/1930s
 * model sheets, rubber-hose mechanics, and signature walk cycles:
 *
 * 1. 🚢 Steamboat Willie / Classic 1928 Pilot (Public Domain as of Jan 1, 2024)
 *    - Authentic Ub Iwerks 1928 model sheet:
 *      Heart-shaped white face mask, black oval eyes, protruding snout with nostrils,
 *      puckered whistling mouth pulsing on 2s with musical notes, pilot captain hat,
 *      pear-shaped torso, white button shorts with 2 prominent front oval buttons,
 *      rubber-hose noodle arms with 4-fingered white gloves and 3 black darts,
 *      rubber-hose legs with authentic heel-and-toe roll, oversized rounded clown shoes,
 *      and turning 8-spoke wooden steamboat wheel.
 *
 * 2. 🐱 Felix the Cat (1919, Otto Messmer & Pat Sullivan)
 *    - Authentic Otto Messmer 1919 model:
 *      Total black ink silhouette, sharp triangular cat ears with white inner ear patches,
 *      large white oval eye plates with black pie pupils that dart around, white muzzle pad
 *      with black whiskers and triangle nose, contemplative smirk/frown, arms clasped behind
 *      back in signature 30-degree contemplative pacing walk, expressive morphing question-mark (?)
 *      and exclamation (!) tail.
 *
 * 3. 💃 Fleischer Jazz Flapper (1930, Grim Natwick / Max & Dave Fleischer)
 *    - Authentic 1930 Talkartoon flapper model:
 *      Round baby doll head, forehead and cheek kiss curls / spit curls, swinging gold hoop earrings,
 *      huge doe eyes with 3 curved lashes, delicate button nose, red Cupid's bow pouty lips,
 *      sweetheart neckline strapless cocktail dress, lace thigh garter with red rose,
 *      slender legs with black high-heeled kitten pumps, 2-beat syncopated jazz shimmy on 2s,
 *      and inkwell line boil aesthetics.
 *
 * 4. 🐰 Oswald the Lucky Rabbit (1927, Walt Disney & Ub Iwerks)
 *    - Authentic 1927 Oswald model:
 *      Extraordinarily long flexible black rubber ears with secondary overlap drag and curved tips,
 *      round black skull with white muzzle plate and shiny button nose, high-waisted button trousers,
 *      long floppy rabbit feet, high-springing rabbit stride, and cotton-ball tail puff.
 *
 * 5. ⚓ Sailor Swagger (1930s Fleischer Public Domain Era)
 *    - Authentic 1930s sailor archetype:
 *      Tilted white sailor cap, corncob pipe puffing smoke rings, squinted eye with scowl,
 *      bulging Popeye forearms with anchor tattoos, wide rolling sea-legs swagger stride.
 */

import type { AnimaBone, Keyframe } from './types';

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
  // 1. STEAMBOAT WILLIE (1928) — AUTHENTIC UB IWERKS MODEL
  // ─────────────────────────────────────────────────────────────────────────
  steamboat_willie: {
    id: 'steamboat_willie',
    name: 'Steamboat Pilot (1928)',
    creator: 'Walt Disney & Ub Iwerks',
    year: 1928,
    cadence: 2, // on 2s
    aesthetic: 'rubber_hose_bw',
    description: 'Authentic 1928 model sheet: Pilot cap, widow-peak face mask, whistling snout, button shorts, 4-finger glove darts, big clown shoes, and turning helm wheel.',
    rig: {
      bones: [
        { id: 'sw_root', name: 'Root Pelvis', parentId: null, length: 0, baseAngle: 0, pivot: [0, 0, 0] },
        { id: 'sw_spine', name: 'Spine & Pear Torso', parentId: 'sw_root', length: 50, baseAngle: -90, pivot: [0, -25, 0] },
        { id: 'sw_head', name: 'Skull & Mask', parentId: 'sw_spine', length: 42, baseAngle: 0, pivot: [0, -75, 0] },
        { id: 'sw_ears', name: 'Circular Ears', parentId: 'sw_head', length: 30, baseAngle: 0, pivot: [0, -110, 0] },
        { id: 'sw_arm_l', name: 'Left Arm & Glove', parentId: 'sw_spine', length: 48, baseAngle: 65, pivot: [-20, -60, 0] },
        { id: 'sw_arm_r', name: 'Right Arm (Wheel Hand)', parentId: 'sw_spine', length: 48, baseAngle: -45, pivot: [20, -60, 0] },
        { id: 'sw_leg_l', name: 'Left Rubber Hose Leg', parentId: 'sw_root', length: 45, baseAngle: 90, pivot: [-16, 0, 0] },
        { id: 'sw_leg_r', name: 'Right Rubber Hose Leg', parentId: 'sw_root', length: 45, baseAngle: 90, pivot: [16, 0, 0] },
        { id: 'sw_leg_l_foot', name: 'Left Clown Shoe (Heel/Toe)', parentId: 'sw_leg_l', length: 24, baseAngle: 0, pivot: [-16, 45, 0] },
        { id: 'sw_leg_r_foot', name: 'Right Clown Shoe (Heel/Toe)', parentId: 'sw_leg_r', length: 24, baseAngle: 0, pivot: [16, 45, 0] },
        { id: 'sw_helm_wheel', name: 'Steamboat 8-Spoke Wheel', parentId: 'sw_root', length: 48, baseAngle: 0, pivot: [45, -10, 0] },
      ],
      walkCycle: {
        'root.y': [
          { id: 'sw_y1', t: 0, v: 0, ease: 'smooth' },
          { id: 'sw_y2', t: 0.25, v: -18, ease: 'smooth' }, // bounce apex on 2-beat
          { id: 'sw_y3', t: 0.5, v: 0, ease: 'smooth' },
          { id: 'sw_y4', t: 0.75, v: -18, ease: 'smooth' },
          { id: 'sw_y5', t: 1.0, v: 0, ease: 'smooth' },
        ],
        'leg_l.rot': [
          { id: 'sw_ll1', t: 0, v: -32, ease: 'smooth' },
          { id: 'sw_ll2', t: 0.5, v: 32, ease: 'smooth' },
          { id: 'sw_ll3', t: 1.0, v: -32, ease: 'smooth' },
        ],
        'leg_r.rot': [
          { id: 'sw_lr1', t: 0, v: 32, ease: 'smooth' },
          { id: 'sw_lr2', t: 0.5, v: -32, ease: 'smooth' },
          { id: 'sw_lr3', t: 1.0, v: 32, ease: 'smooth' },
        ],
        'bone.leg_l_foot.rot': [
          { id: 'sw_lf1', t: 0, v: -20, ease: 'smooth' },
          { id: 'sw_lf2', t: 0.25, v: 15, ease: 'smooth' },
          { id: 'sw_lf3', t: 0.5, v: 25, ease: 'smooth' },
          { id: 'sw_lf4', t: 1.0, v: -20, ease: 'smooth' },
        ],
        'bone.helm_wheel.rot': [
          { id: 'sw_hw1', t: 0, v: 0, ease: 'linear' },
          { id: 'sw_hw2', t: 1.0, v: 360, ease: 'linear' },
        ],
      },
      drawRoutine: (ctx, t, frame, scale = 1.0) => {
        ctx.save();
        ctx.scale(scale, scale);

        const walk = t * Math.PI * 2 * 0.85;
        const bounce = Math.abs(Math.sin(walk)) * 14;
        const lean = Math.sin(walk) * 3;
        const legSwing = Math.sin(walk) * 28;

        ctx.translate(0, -bounce);
        ctx.rotate((lean * Math.PI) / 180);

        // 1. Drop shadow on steamboat deck
        ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
        ctx.beginPath();
        ctx.ellipse(0, 68 + bounce * 0.3, 55, 12, 0, 0, Math.PI * 2);
        ctx.fill();

        // 2. Wooden Steamboat Wheel (in background/foreground)
        ctx.save();
        ctx.translate(45, -10);
        const wheelRot = t * 1.5;
        ctx.rotate(wheelRot);
        ctx.strokeStyle = '#2b2319';
        ctx.fillStyle = '#4a3c2c';
        ctx.lineWidth = 5;

        // Rim
        ctx.beginPath();
        ctx.arc(0, 0, 48, 0, Math.PI * 2);
        ctx.stroke();

        // Hub
        ctx.beginPath();
        ctx.arc(0, 0, 12, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // 8 Wooden Spokes with Handles
        for (let i = 0; i < 8; i++) {
          const ang = (i * Math.PI) / 4;
          const cos = Math.cos(ang);
          const sin = Math.sin(ang);
          ctx.beginPath();
          ctx.moveTo(cos * 10, sin * 10);
          ctx.lineTo(cos * 62, sin * 62);
          ctx.stroke();
          // handle knob
          ctx.beginPath();
          ctx.arc(cos * 62, sin * 62, 4, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();

        // 3. Pear-shaped black torso
        ctx.fillStyle = '#100e15';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.ellipse(0, 0, 22, 34, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // 4. White Button Shorts (high-waisted 1928 cut)
        ctx.fillStyle = '#FDFDFF';
        ctx.beginPath();
        ctx.roundRect(-22, -8, 44, 38, 12);
        ctx.fill();
        ctx.stroke();

        // Two iconic large oval buttons in front
        ctx.fillStyle = '#100e15';
        ctx.beginPath();
        ctx.ellipse(-9, 8, 4.5, 7.5, 0, 0, Math.PI * 2);
        ctx.ellipse(9, 8, 4.5, 7.5, 0, 0, Math.PI * 2);
        ctx.fill();

        // Shorts leg openings / cuffs
        ctx.fillStyle = '#FDFDFF';
        ctx.beginPath();
        ctx.ellipse(-14, 28, 11, 6, 0, 0, Math.PI * 2);
        ctx.ellipse(14, 28, 11, 6, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // 5. Rubber-Hose Legs
        ctx.lineWidth = 8;
        ctx.strokeStyle = '#100e15';
        ctx.lineCap = 'round';

        // Left Leg (heel strike)
        const footL_x = -16 + legSwing;
        const footL_y = 65;
        ctx.beginPath();
        ctx.moveTo(-14, 30);
        ctx.quadraticCurveTo(-22 + legSwing * 0.4, 48, footL_x, footL_y);
        ctx.stroke();

        // Right Leg (push off)
        const footR_x = 16 - legSwing;
        const footR_y = 65;
        ctx.beginPath();
        ctx.moveTo(14, 30);
        ctx.quadraticCurveTo(22 - legSwing * 0.4, 48, footR_x, footR_y);
        ctx.stroke();

        // Big Classic Cartoon Clown Shoes (Yellow/Cream with thick rubber soles)
        const drawShoe = (x: number, y: number, swing: number) => {
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate((swing * 0.015 * Math.PI));
          ctx.fillStyle = '#FFFFFF';
          ctx.strokeStyle = '#000000';
          ctx.lineWidth = 3;

          // Bulbous toe & arched heel
          ctx.beginPath();
          ctx.moveTo(-16, -6);
          ctx.bezierCurveTo(-22, -6, -26, 4, -18, 10);
          ctx.lineTo(24, 10);
          ctx.bezierCurveTo(34, 10, 36, -2, 26, -6);
          ctx.bezierCurveTo(14, -10, 0, -4, -16, -6);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();

          // Heel notch
          ctx.fillStyle = '#100e15';
          ctx.fillRect(-18, 6, 12, 4);
          ctx.restore();
        };

        drawShoe(footL_x, footL_y, legSwing);
        drawShoe(footR_x, footR_y, -legSwing);

        // 6. Rubber-Hose Arms & 4-Finger Gloves with 3 Black Darts
        // Left Arm (on hip)
        ctx.lineWidth = 7;
        ctx.strokeStyle = '#100e15';
        ctx.beginPath();
        ctx.moveTo(-18, -12);
        ctx.quadraticCurveTo(-38, -2, -22, 14);
        ctx.stroke();

        // Left Glove on Hip
        ctx.save();
        ctx.translate(-24, 12);
        ctx.fillStyle = '#FDFDFF';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2.5;
        // Glove cuff
        ctx.beginPath();
        ctx.ellipse(0, -6, 9, 5, 0.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        // Glove palm
        ctx.beginPath();
        ctx.arc(0, 0, 9, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        // 3 Black Back-Darts
        ctx.strokeStyle = '#100e15';
        ctx.lineWidth = 1.8;
        for (let d = -1; d <= 1; d++) {
          ctx.beginPath();
          ctx.moveTo(d * 4, -4);
          ctx.lineTo(d * 5, 3);
          ctx.stroke();
        }
        ctx.restore();

        // Right Arm (steering wheel)
        ctx.lineWidth = 7;
        ctx.strokeStyle = '#100e15';
        ctx.beginPath();
        ctx.moveTo(18, -12);
        ctx.quadraticCurveTo(34, -26, 42, -14);
        ctx.stroke();

        // Right Glove gripping wheel spoke
        ctx.save();
        ctx.translate(42, -14);
        ctx.fillStyle = '#FDFDFF';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.ellipse(0, -5, 8, 5, -0.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(0, 0, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        // Darts
        ctx.strokeStyle = '#100e15';
        ctx.lineWidth = 1.8;
        for (let d = -1; d <= 1; d++) {
          ctx.beginPath();
          ctx.moveTo(d * 3.5, -4);
          ctx.lineTo(d * 4, 2);
          ctx.stroke();
        }
        ctx.restore();

        // 7. Head, Face Mask, Snout & Pilot Cap
        ctx.save();
        ctx.translate(0, -48);

        // Circular Black Ears (anchored wide on skull)
        ctx.fillStyle = '#100e15';
        ctx.beginPath();
        ctx.arc(-34, -42, 22, 0, Math.PI * 2);
        ctx.arc(34, -42, 22, 0, Math.PI * 2);
        ctx.fill();

        // Skull Sphere
        ctx.beginPath();
        ctx.arc(0, -18, 34, 0, Math.PI * 2);
        ctx.fill();

        // White Face Mask (Iconic 1928 Heart-Arch Shape)
        ctx.fillStyle = '#FDFDFF';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        // Left eye arch
        ctx.moveTo(0, -6);
        ctx.bezierCurveTo(-14, -6, -26, -16, -28, -28);
        ctx.bezierCurveTo(-30, -42, -16, -46, -4, -36);
        ctx.lineTo(0, -32);
        // Right eye arch
        ctx.lineTo(4, -36);
        ctx.bezierCurveTo(16, -46, 30, -42, 28, -28);
        ctx.bezierCurveTo(26, -16, 14, -6, 0, -6);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Solid Black Oval Eyes (1928 Authentic Model Sheet)
        ctx.fillStyle = '#100e15';
        ctx.beginPath();
        ctx.ellipse(-10, -30, 4.5, 9.5, -0.05, 0, Math.PI * 2);
        ctx.ellipse(10, -30, 4.5, 9.5, 0.05, 0, Math.PI * 2);
        ctx.fill();

        // White glint dots
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(-11, -33, 1.8, 0, Math.PI * 2);
        ctx.arc(9, -33, 1.8, 0, Math.PI * 2);
        ctx.fill();

        // Protruding White Snout with Black Teardrop Nose Ball
        ctx.fillStyle = '#FDFDFF';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(-16, -18);
        ctx.quadraticCurveTo(0, -28, 22, -14);
        ctx.quadraticCurveTo(16, 2, -12, -4);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Black Nose Ball at Snout Tip
        ctx.fillStyle = '#100e15';
        ctx.beginPath();
        ctx.ellipse(23, -13, 6, 4.5, 0.2, 0, Math.PI * 2);
        ctx.fill();

        // Nose highlight
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(22, -15, 1.5, 0, Math.PI * 2);
        ctx.fill();

        // Puckered Whistling Mouth (Pulses rhythmically on 2-beat)
        const whistlePulse = 1.0 + Math.sin(walk * 2) * 0.2;
        ctx.fillStyle = '#100e15';
        ctx.beginPath();
        ctx.ellipse(14 * whistlePulse, -4, 7, 5, 0.1, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Pink Tongue inside mouth
        ctx.fillStyle = '#e8607a';
        ctx.beginPath();
        ctx.arc(15 * whistlePulse, -2, 3.5, 0, Math.PI);
        ctx.fill();

        // Cheek Smile Crease
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(-8, -12, 6, 0.8, Math.PI * 1.4);
        ctx.stroke();

        // Pilot Steamboat Captain Hat
        ctx.save();
        ctx.translate(0, -42);
        ctx.rotate(-0.08);

        // Dark Hat Brim
        ctx.fillStyle = '#100e15';
        ctx.beginPath();
        ctx.ellipse(0, 0, 32, 9, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // White Pleated Captain Crown
        ctx.fillStyle = '#FDFDFF';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(-22, -2);
        ctx.lineTo(-24, -24);
        ctx.quadraticCurveTo(0, -32, 24, -24);
        ctx.lineTo(22, -2);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Black hatband & Gold anchor button
        ctx.fillStyle = '#100e15';
        ctx.fillRect(-22, -6, 44, 5);

        ctx.fillStyle = '#FFD700';
        ctx.beginPath();
        ctx.arc(0, -4, 3.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();

        // 8. Billowing Musical Whistle Notes & Steam (on 2s)
        if (Math.sin(walk) > 0.1) {
          ctx.save();
          ctx.font = 'bold 22px sans-serif';
          ctx.fillStyle = '#100e15';
          const noteY = -28 - (t * 40) % 35;
          const noteX = 36 + Math.sin(t * 8) * 8;
          ctx.fillText('♪', noteX, noteY);
          if (Math.sin(walk) > 0.6) {
            ctx.font = 'bold 18px sans-serif';
            ctx.fillText('♫', noteX + 18, noteY - 14);
          }
          ctx.restore();
        }

        ctx.restore();
        ctx.restore();
      },
    },
  },

  // ───────────────────────────────────────────────────────────────────────────
  // 2. FELIX THE CAT (1919) — AUTHENTIC OTTO MESSMER MODEL
  // ─────────────────────────────────────────────────────────────────────────
  felix_the_cat: {
    id: 'felix_the_cat',
    name: 'Felix the Pacing Cat (1919)',
    creator: 'Otto Messmer & Pat Sullivan',
    year: 1919,
    cadence: 2,
    aesthetic: 'rubber_hose_bw',
    description: 'Authentic 1919 Otto Messmer silhouette: Triangular ears with white insets, pacing hunch, hands behind back, and morphing question-mark tail.',
    rig: {
      bones: [
        { id: 'f_root', name: 'Root Pelvis', parentId: null, length: 0, baseAngle: 0, pivot: [0, 0, 0] },
        { id: 'f_spine', name: 'Hunched Spine', parentId: 'f_root', length: 50, baseAngle: -75, pivot: [0, -20, 0] },
        { id: 'f_head', name: 'Head & Ears', parentId: 'f_spine', length: 40, baseAngle: 0, pivot: [12, -60, 0] },
        { id: 'f_tail', name: 'Question Mark Tail', parentId: 'f_root', length: 60, baseAngle: 160, pivot: [-18, -10, 0] },
        { id: 'f_tail_tip', name: 'Question Mark Dot/Tip', parentId: 'f_tail', length: 20, baseAngle: 90, pivot: [-30, -50, 0] },
        { id: 'f_leg_l', name: 'Pacing Left Leg', parentId: 'f_root', length: 40, baseAngle: 90, pivot: [-10, 0, 0] },
        { id: 'f_leg_r', name: 'Pacing Right Leg', parentId: 'f_root', length: 40, baseAngle: 90, pivot: [10, 0, 0] },
      ],
      walkCycle: {
        'root.x': [
          { id: 'fx1', t: 0, v: -45, ease: 'smooth' },
          { id: 'fx2', t: 1.0, v: 45, ease: 'smooth' },
        ],
        'bone.tail_tip.rot': [
          { id: 'ftt1', t: 0, v: 15, ease: 'smooth' },
          { id: 'ftt2', t: 0.5, v: -25, ease: 'smooth' },
          { id: 'ftt3', t: 1.0, v: 15, ease: 'smooth' },
        ],
        'transform.rotationZ': [
          { id: 'frz1', t: 0, v: 30, ease: 'smooth' }, // signature 30-degree pacing torso tilt
          { id: 'frz2', t: 0.5, v: 28, ease: 'smooth' },
          { id: 'frz3', t: 1.0, v: 30, ease: 'smooth' },
        ],
      },
      drawRoutine: (ctx, t, frame, scale = 1.0) => {
        ctx.save();
        ctx.scale(scale, scale);

        const walk = t * Math.PI * 2 * 0.8;
        const pace = Math.sin(walk);
        const yBob = Math.abs(Math.sin(walk)) * 7;
        const legSwing = Math.sin(walk) * 22;

        ctx.translate(pace * 28, -yBob);

        // 1. Ground shadow
        ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
        ctx.beginPath();
        ctx.ellipse(0, 48 + yBob * 0.3, 50, 10, 0, 0, Math.PI * 2);
        ctx.fill();

        // 2. The Famous Otto Messmer Question-Mark Tail
        ctx.save();
        ctx.translate(-22, -14);
        ctx.strokeStyle = '#0d0d12';
        ctx.lineWidth = 6;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        // Animate between question mark (?) and walking curl
        const tailFlick = Math.sin(walk * 1.5) * 8;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.bezierCurveTo(-25, -12, -45, -35 + tailFlick, -30, -58);
        ctx.bezierCurveTo(-15, -75, -5, -62, -18, -50);
        ctx.stroke();

        // Tail tip question mark dot (when inquisitive)
        if (Math.sin(t * 2) > 0.4) {
          ctx.fillStyle = '#0d0d12';
          ctx.beginPath();
          ctx.arc(-18, -38, 4, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();

        // 3. Hunched Torso (Iconic 30-degree philosophical forward lean)
        ctx.save();
        ctx.rotate(-0.25);
        ctx.fillStyle = '#0d0d12';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.ellipse(4, -18, 19, 32, 0.1, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Hands Clasped Behind Back (Otto Messmer's trademark pose)
        ctx.fillStyle = '#0d0d12';
        ctx.beginPath();
        // Arms looping back
        ctx.ellipse(-14, -12, 10, 8, -0.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        // Clenched paw digits
        ctx.strokeStyle = '#222';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(-18, -12, 6, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();

        // 4. Pacing Digitigrade Cat Legs & Paws
        ctx.lineWidth = 7;
        ctx.strokeStyle = '#0d0d12';
        ctx.lineCap = 'round';

        // Left Leg
        const pL_x = -10 + legSwing;
        ctx.beginPath();
        ctx.moveTo(-8, 12);
        ctx.lineTo(-12 + legSwing * 0.4, 30);
        ctx.lineTo(pL_x, 46);
        ctx.stroke();

        // Left Oval Paw
        ctx.fillStyle = '#0d0d12';
        ctx.beginPath();
        ctx.ellipse(pL_x + 4, 46, 10, 5, 0, 0, Math.PI * 2);
        ctx.fill();

        // Right Leg
        const pR_x = 10 - legSwing;
        ctx.beginPath();
        ctx.moveTo(8, 12);
        ctx.lineTo(12 - legSwing * 0.4, 30);
        ctx.lineTo(pR_x, 46);
        ctx.stroke();

        // Right Oval Paw
        ctx.beginPath();
        ctx.ellipse(pR_x + 4, 46, 10, 5, 0, 0, Math.PI * 2);
        ctx.fill();

        // 5. Felix Head, Pointed Triangular Ears & Expressive Eyes
        ctx.save();
        ctx.translate(12, -54);

        // Skull
        ctx.fillStyle = '#0d0d12';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.ellipse(0, 0, 28, 26, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Sharp Triangular Cat Ears with White Inner Ear Insets
        // Left Ear
        ctx.fillStyle = '#0d0d12';
        ctx.beginPath();
        ctx.moveTo(-22, -12);
        ctx.lineTo(-28, -42);
        ctx.lineTo(-4, -24);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // White inner ear triangle
        ctx.fillStyle = '#FDFDFF';
        ctx.beginPath();
        ctx.moveTo(-20, -16);
        ctx.lineTo(-25, -36);
        ctx.lineTo(-8, -24);
        ctx.closePath();
        ctx.fill();

        // Right Ear
        ctx.fillStyle = '#0d0d12';
        ctx.beginPath();
        ctx.moveTo(6, -24);
        ctx.lineTo(26, -42);
        ctx.lineTo(24, -12);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // White inner ear triangle
        ctx.fillStyle = '#FDFDFF';
        ctx.beginPath();
        ctx.moveTo(10, -24);
        ctx.lineTo(22, -36);
        ctx.lineTo(21, -16);
        ctx.closePath();
        ctx.fill();

        // White Muzzle & Whisker Pad
        ctx.fillStyle = '#FDFDFF';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(4, 8, 16, 11, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Black Triangle Nose
        ctx.fillStyle = '#0d0d12';
        ctx.beginPath();
        ctx.moveTo(4, 2);
        ctx.lineTo(1, 6);
        ctx.lineTo(7, 6);
        ctx.closePath();
        ctx.fill();

        // Whiskers (3 on each side)
        ctx.strokeStyle = '#0d0d12';
        ctx.lineWidth = 2;
        // Left whiskers
        ctx.beginPath();
        ctx.moveTo(-8, 5); ctx.lineTo(-28, 2);
        ctx.moveTo(-8, 8); ctx.lineTo(-30, 8);
        ctx.moveTo(-8, 11); ctx.lineTo(-26, 14);
        // Right whiskers
        ctx.moveTo(16, 5); ctx.lineTo(34, 2);
        ctx.moveTo(16, 8); ctx.lineTo(36, 8);
        ctx.moveTo(16, 11); ctx.lineTo(32, 14);
        ctx.stroke();

        // Contemplative Smirk Curve
        ctx.beginPath();
        ctx.arc(4, 6, 8, 0.2, Math.PI * 0.85);
        ctx.stroke();

        // Huge White Eye Discs (Trademark Otto Messmer)
        ctx.fillStyle = '#FDFDFF';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(-8, -8, 9, 14, -0.05, 0, Math.PI * 2);
        ctx.ellipse(12, -8, 9, 14, 0.05, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Pie-Cut Pupil Slits (Glancing downward in contemplation)
        const eyeLook = Math.sin(t * 2) * 3;
        ctx.fillStyle = '#0d0d12';
        ctx.beginPath();
        ctx.ellipse(-7 + eyeLook, -7, 4.5, 8.5, 0, 0, Math.PI * 2);
        ctx.ellipse(13 + eyeLook, -7, 4.5, 8.5, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
        ctx.restore();
      },
    },
  },

  // ───────────────────────────────────────────────────────────────────────────
  // 3. FLEISCHER JAZZ FLAPPER (1930) — AUTHENTIC GRIM NATWICK TALKARTOON MODEL
  // ─────────────────────────────────────────────────────────────────────────
  fleischer_flapper: {
    id: 'fleischer_flapper',
    name: 'Fleischer Jazz Flapper (1930)',
    creator: 'Fleischer Studios (Grim Natwick / Max Fleischer)',
    year: 1930,
    cadence: 2,
    aesthetic: 'fleischer_jazz',
    description: 'Authentic 1930 Talkartoon: Spit curls, swinging gold hoops, doe eyes with lashes, sweetheart cocktail dress, thigh garter, and syncopated jazz shimmy.',
    rig: {
      bones: [
        { id: 'fl_root', name: 'Root Pelvis', parentId: null, length: 0, baseAngle: 0, pivot: [0, 0, 0] },
        { id: 'fl_spine', name: 'Torso & Dress', parentId: 'fl_root', length: 48, baseAngle: -90, pivot: [0, -22, 0] },
        { id: 'fl_head', name: 'Baby Doll Head', parentId: 'fl_spine', length: 45, baseAngle: 0, pivot: [0, -75, 0] },
        { id: 'fl_earring_l', name: 'Left Gold Hoop Earring', parentId: 'fl_head', length: 18, baseAngle: 90, pivot: [-24, -60, 0] },
        { id: 'fl_earring_r', name: 'Right Gold Hoop Earring', parentId: 'fl_head', length: 18, baseAngle: 90, pivot: [24, -60, 0] },
        { id: 'fl_garter', name: 'Lace Thigh Garter with Rose', parentId: 'fl_root', length: 12, baseAngle: 0, pivot: [-9, 22, 0] },
        { id: 'fl_leg_l', name: 'Left Slender Leg & Pump', parentId: 'fl_root', length: 45, baseAngle: 90, pivot: [-8, 12, 0] },
        { id: 'fl_leg_r', name: 'Right Slender Leg & Pump', parentId: 'fl_root', length: 45, baseAngle: 90, pivot: [8, 12, 0] },
      ],
      walkCycle: {
        'bone.garter.y': [
          { id: 'fgy1', t: 0, v: 0, ease: 'smooth' },
          { id: 'fgy2', t: 0.25, v: -4, ease: 'smooth' },
          { id: 'fgy3', t: 0.5, v: 0, ease: 'smooth' },
          { id: 'fgy4', t: 0.75, v: -4, ease: 'smooth' },
          { id: 'fgy5', t: 1.0, v: 0, ease: 'smooth' },
        ],
        'bone.earring_l.rot': [
          { id: 'fer1', t: 0, v: -15, ease: 'smooth' },
          { id: 'fer2', t: 0.5, v: 15, ease: 'smooth' },
          { id: 'fer3', t: 1.0, v: -15, ease: 'smooth' },
        ],
        'hip.sway': [
          { id: 'fhs1', t: 0, v: -14, ease: 'smooth' },
          { id: 'fhs2', t: 0.5, v: 14, ease: 'smooth' },
          { id: 'fhs3', t: 1.0, v: -14, ease: 'smooth' },
        ],
      },
      drawRoutine: (ctx, t, frame, scale = 1.0) => {
        ctx.save();
        ctx.scale(scale, scale);

        // 2-beat syncopated jazz shimmy
        const jazzBeat = Math.sin(t * Math.PI * 4);
        const hipSway = Math.sin(t * Math.PI * 2) * 14;
        const lineBoil = (frame % 2 === 0 ? 0.8 : -0.8);

        ctx.translate(0, -Math.abs(jazzBeat) * 10);

        // 1. Drop shadow
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.beginPath();
        ctx.ellipse(0, 52, 45, 9, 0, 0, Math.PI * 2);
        ctx.fill();

        // 2. Strapless Sweetheart Cocktail Dress
        ctx.save();
        ctx.translate(hipSway * 0.4, 0);

        // Porcelain Shoulders & Cleavage
        ctx.fillStyle = '#FFF8F4';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(-18, -26);
        ctx.quadraticCurveTo(0, -18, 18, -26);
        ctx.lineTo(14, -12);
        ctx.lineTo(-14, -12);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Pearl Necklace
        ctx.fillStyle = '#FFFFFF';
        for (let p = -5; p <= 5; p++) {
          ctx.beginPath();
          ctx.arc(p * 3.5, -24 + Math.abs(p) * 1.2, 2.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }

        // Red/Black Sweetheart Bodice
        ctx.fillStyle = '#181520';
        ctx.beginPath();
        ctx.moveTo(-16, -18);
        ctx.quadraticCurveTo(-8, -24, 0, -16);
        ctx.quadraticCurveTo(8, -24, 16, -18);
        ctx.lineTo(20 + hipSway * 0.6, 10);
        ctx.lineTo(-20 + hipSway * 0.6, 10);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Ruffled Hemline
        ctx.fillStyle = '#D40055';
        ctx.beginPath();
        ctx.ellipse(hipSway * 0.6, 10, 20, 6, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();

        // 3. Slender Flapper Legs & Black Kitten Pumps
        const legSwing = Math.sin(t * Math.PI * 2) * 18;
        ctx.lineWidth = 4.5;
        ctx.strokeStyle = '#FFF8F4';
        ctx.lineCap = 'round';

        // Left Leg with Lace Garter on Thigh
        ctx.beginPath();
        ctx.moveTo(-8, 12);
        ctx.lineTo(-10 + legSwing, 46);
        ctx.stroke();

        // White Lace Garter with Red Rose on left thigh
        ctx.save();
        ctx.translate(-9 + legSwing * 0.3, 22);
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(-7, -2, 14, 4);
        ctx.fillStyle = '#D40055';
        ctx.beginPath();
        ctx.arc(0, 0, 3.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // Left Kitten Heel
        ctx.fillStyle = '#100e15';
        ctx.beginPath();
        ctx.ellipse(-10 + legSwing + 2, 48, 8, 4.5, -0.1, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Right Leg
        ctx.beginPath();
        ctx.moveTo(8, 12);
        ctx.lineTo(10 - legSwing, 46);
        ctx.stroke();

        // Right Kitten Heel
        ctx.fillStyle = '#100e15';
        ctx.beginPath();
        ctx.ellipse(10 - legSwing + 2, 48, 8, 4.5, 0.1, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // 4. Arms with Gold Bangle Bracelets (1930s shimmy pose)
        const armSway = Math.sin(t * Math.PI * 4) * 8;
        ctx.lineWidth = 4;
        ctx.strokeStyle = '#FFF8F4';
        // Left arm
        ctx.beginPath();
        ctx.moveTo(-16, -20);
        ctx.quadraticCurveTo(-28 + armSway, -8, -20, 4);
        ctx.stroke();
        // Right arm
        ctx.beginPath();
        ctx.moveTo(16, -20);
        ctx.quadraticCurveTo(28 - armSway, -8, 20, 4);
        ctx.stroke();

        // Gold Bangle Bracelets
        ctx.strokeStyle = '#FFD700';
        ctx.lineWidth = 3;
        ctx.strokeRect(-22, -1, 5, 3);
        ctx.strokeRect(18, -1, 5, 3);

        // 5. Giant Baby-Doll Head, Spit Curls & Doe Eyes
        ctx.save();
        ctx.translate(0, -60);
        const headTilt = Math.sin(t * Math.PI * 2) * 5;
        ctx.rotate((headTilt * Math.PI) / 180);

        // Swinging Gold Hoop Earrings
        const hoopSway = Math.sin(t * Math.PI * 4) * 6;
        ctx.strokeStyle = '#FFD700';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(-26 + hoopSway, 4, 11, 0, Math.PI * 2);
        ctx.arc(26 + hoopSway, 4, 11, 0, Math.PI * 2);
        ctx.stroke();

        // Glossy Black Flapper Bob Hair (Curled helmet)
        ctx.fillStyle = '#100e15';
        ctx.beginPath();
        ctx.arc(0, -8, 32, 0, Math.PI * 2);
        ctx.fill();

        // Side hair poufs
        ctx.beginPath();
        ctx.arc(-24, -2, 16, 0, Math.PI * 2);
        ctx.arc(24, -2, 16, 0, Math.PI * 2);
        ctx.fill();

        // Porcelain Baby Doll Face Oval
        ctx.fillStyle = '#FFF8F4';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.ellipse(0, 0, 24, 22, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Iconic Coiled Spit Curls / Kiss Curls on forehead & cheeks
        ctx.fillStyle = '#100e15';
        // Forehead center curl
        ctx.beginPath();
        ctx.arc(0, -18 + lineBoil * 0.5, 4.5, 0, Math.PI * 2);
        ctx.fill();
        // Left temple curl
        ctx.beginPath();
        ctx.arc(-14, -14, 4.5, 0, Math.PI * 2);
        ctx.fill();
        // Right temple curl
        ctx.beginPath();
        ctx.arc(14, -14, 4.5, 0, Math.PI * 2);
        ctx.fill();
        // Cheek spit curls
        ctx.beginPath();
        ctx.arc(-20, 6, 3.5, 0, Math.PI * 2);
        ctx.arc(20, 6, 3.5, 0, Math.PI * 2);
        ctx.fill();

        // High Arched Thin Eyebrows
        ctx.strokeStyle = '#100e15';
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.arc(-10, -12, 8, 1.1 * Math.PI, 1.8 * Math.PI);
        ctx.arc(10, -12, 8, 1.2 * Math.PI, 1.9 * Math.PI);
        ctx.stroke();

        // Giant Doe Eyes with 3 Curved Eyelashes per eye
        ctx.fillStyle = '#FFFFFF';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(-9, -2, 8, 11, -0.05, 0, Math.PI * 2);
        ctx.ellipse(9, -2, 8, 11, 0.05, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // 3 Black Eyelashes on each eye
        ctx.lineWidth = 2;
        ctx.beginPath();
        // Left lashes
        ctx.moveTo(-16, -8); ctx.lineTo(-22, -14);
        ctx.moveTo(-12, -12); ctx.lineTo(-16, -18);
        ctx.moveTo(-8, -13); ctx.lineTo(-9, -20);
        // Right lashes
        ctx.moveTo(8, -13); ctx.lineTo(9, -20);
        ctx.moveTo(12, -12); ctx.lineTo(16, -18);
        ctx.moveTo(16, -8); ctx.lineTo(22, -14);
        ctx.stroke();

        // Dark Iris with White Sparkle
        ctx.fillStyle = '#1b1828';
        ctx.beginPath();
        ctx.arc(-8, -1, 5, 0, Math.PI * 2);
        ctx.arc(10, -1, 5, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(-10, -3, 2, 0, Math.PI * 2);
        ctx.arc(8, -3, 2, 0, Math.PI * 2);
        ctx.fill();

        // Cute Button Nose
        ctx.fillStyle = '#e0a89d';
        ctx.beginPath();
        ctx.arc(0, 5, 2.5, 0, Math.PI * 2);
        ctx.fill();

        // Rosebud Cupid's Bow Red Lips
        ctx.fillStyle = '#D40055';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(-2.5, 12, 3, Math.PI, 0);
        ctx.arc(2.5, 12, 3, Math.PI, 0);
        ctx.lineTo(0, 17);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Cheek Rouge Blushes
        ctx.fillStyle = 'rgba(212, 0, 85, 0.25)';
        ctx.beginPath();
        ctx.ellipse(-14, 6, 5, 3, 0, 0, Math.PI * 2);
        ctx.ellipse(14, 6, 5, 3, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
        ctx.restore();
      },
    },
  },

  // ───────────────────────────────────────────────────────────────────────────
  // 4. OSWALD THE LUCKY RABBIT (1927) — AUTHENTIC DISNEY & IWERKS MODEL
  // ─────────────────────────────────────────────────────────────────────────
  oswald_rabbit: {
    id: 'oswald_rabbit',
    name: 'Oswald the Lucky Rabbit (1927)',
    creator: 'Walt Disney & Ub Iwerks',
    year: 1927,
    cadence: 2,
    aesthetic: 'rubber_hose_bw',
    description: 'Authentic 1927 model sheet: Extraordinarily long floppy rubber ears with secondary overlap drag, white muzzle plate, button trousers, floppy feet, and high spring stride.',
    rig: {
      bones: [
        { id: 'os_root', name: 'Root Pelvis', parentId: null, length: 0, baseAngle: 0, pivot: [0, 0, 0] },
        { id: 'os_spine', name: 'Spine', parentId: 'os_root', length: 45, baseAngle: -90, pivot: [0, -20, 0] },
        { id: 'os_head', name: 'Round Skull', parentId: 'os_spine', length: 36, baseAngle: 0, pivot: [0, -65, 0] },
        { id: 'os_ear_l', name: 'Long Floppy Left Ear Base', parentId: 'os_head', length: 40, baseAngle: -80, pivot: [-12, -90, 0] },
        { id: 'os_ear_l_mid', name: 'Left Ear Overlap Drag Tip', parentId: 'os_ear_l', length: 35, baseAngle: -20, pivot: [-16, -130, 0] },
        { id: 'os_ear_r', name: 'Long Floppy Right Ear Base', parentId: 'os_head', length: 40, baseAngle: -100, pivot: [12, -90, 0] },
        { id: 'os_ear_r_mid', name: 'Right Ear Overlap Drag Tip', parentId: 'os_ear_r', length: 35, baseAngle: 20, pivot: [16, -130, 0] },
        { id: 'os_leg_l', name: 'Springy Left Rabbit Leg', parentId: 'os_root', length: 44, baseAngle: 90, pivot: [-14, 0, 0] },
        { id: 'os_leg_r', name: 'Springy Right Rabbit Leg', parentId: 'os_root', length: 44, baseAngle: 90, pivot: [14, 0, 0] },
      ],
      walkCycle: {
        'bone.ear_l_mid.rot': [
          { id: 'oel1', t: 0, v: -26, ease: 'smooth' },
          { id: 'oel2', t: 0.5, v: 26, ease: 'smooth' },
          { id: 'oel3', t: 1.0, v: -26, ease: 'smooth' },
        ],
        'root.y': [
          { id: 'oy1', t: 0, v: 0, ease: 'smooth' },
          { id: 'oy2', t: 0.25, v: -18, ease: 'smooth' },
          { id: 'oy3', t: 0.5, v: 0, ease: 'smooth' },
          { id: 'oy4', t: 0.75, v: -18, ease: 'smooth' },
          { id: 'oy5', t: 1.0, v: 0, ease: 'smooth' },
        ],
      },
      drawRoutine: (ctx, t, frame, scale = 1.0) => {
        ctx.save();
        ctx.scale(scale, scale);

        const walk = t * Math.PI * 2 * 0.9;
        const spring = Math.abs(Math.sin(walk)) * 18;
        const earLag = Math.sin(walk - 0.45) * 26; // Secondary overlap follow-through
        const legSwing = Math.sin(walk) * 32;

        ctx.translate(0, -spring);

        // 1. Ground shadow
        ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
        ctx.beginPath();
        ctx.ellipse(0, 56 + spring * 0.35, 52, 11, 0, 0, Math.PI * 2);
        ctx.fill();

        // 2. Cotton-ball white rabbit tail
        ctx.save();
        ctx.translate(-22, 6);
        ctx.fillStyle = '#FDFDFF';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(0, 0, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();

        // 3. Torso & High-Waisted Button Trousers
        ctx.fillStyle = '#100e15';
        ctx.beginPath();
        ctx.ellipse(0, -10, 18, 28, 0, 0, Math.PI * 2);
        ctx.fill();

        // Blue / Dark Button Shorts
        ctx.fillStyle = '#2b3f72';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.roundRect(-18, -4, 36, 28, 8);
        ctx.fill();
        ctx.stroke();

        // Two white button circles
        ctx.fillStyle = '#FDFDFF';
        ctx.beginPath();
        ctx.arc(-8, 8, 4, 0, Math.PI * 2);
        ctx.arc(8, 8, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // 4. Springy Rabbit Legs & Long Floppy Cartoon Feet
        ctx.lineWidth = 7;
        ctx.strokeStyle = '#100e15';
        ctx.lineCap = 'round';

        // Left Leg
        const ftL_x = -14 + legSwing;
        ctx.beginPath();
        ctx.moveTo(-10, 20);
        ctx.lineTo(-14 + legSwing * 0.3, 38);
        ctx.lineTo(ftL_x, 54);
        ctx.stroke();

        // Long Left Rabbit Foot
        ctx.fillStyle = '#100e15';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.ellipse(ftL_x + 8, 54, 18, 6, legSwing * 0.012, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Right Leg
        const ftR_x = 14 - legSwing;
        ctx.beginPath();
        ctx.moveTo(10, 20);
        ctx.lineTo(14 - legSwing * 0.3, 38);
        ctx.lineTo(ftR_x, 54);
        ctx.stroke();

        // Long Right Rabbit Foot
        ctx.beginPath();
        ctx.ellipse(ftR_x + 8, 54, 18, 6, -legSwing * 0.012, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // 5. Rubber-Hose Arms (Pumping merrily)
        const armSwing = Math.sin(walk) * 22;
        ctx.lineWidth = 6;
        ctx.strokeStyle = '#100e15';
        // Left arm
        ctx.beginPath();
        ctx.moveTo(-14, -16);
        ctx.quadraticCurveTo(-26, -4, -18 - armSwing, 8);
        ctx.stroke();
        // Left paw
        ctx.fillStyle = '#100e15';
        ctx.beginPath();
        ctx.arc(-18 - armSwing, 8, 6, 0, Math.PI * 2);
        ctx.fill();

        // Right arm
        ctx.beginPath();
        ctx.moveTo(14, -16);
        ctx.quadraticCurveTo(26, -4, 18 + armSwing, 8);
        ctx.stroke();
        // Right paw
        ctx.beginPath();
        ctx.arc(18 + armSwing, 8, 6, 0, Math.PI * 2);
        ctx.fill();

        // 6. Oswald Head & Extraordinarily Long Floppy Rubber Ears
        ctx.save();
        ctx.translate(0, -48);

        // THE FAMOUS OSWALD EARS (Almost body-length with secondary inertia)
        ctx.fillStyle = '#100e15';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2.5;

        // Left Ear (curving backwards on lag)
        ctx.beginPath();
        ctx.moveTo(-12, -26);
        ctx.bezierCurveTo(-28 + earLag, -60, -38 + earLag * 1.3, -110, -18 + earLag * 1.5, -125);
        ctx.bezierCurveTo(-4 + earLag * 1.4, -115, -12 + earLag * 0.8, -60, -4, -28);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Right Ear (curving backwards on lag)
        ctx.beginPath();
        ctx.moveTo(4, -28);
        ctx.bezierCurveTo(12 + earLag * 0.8, -60, 4 + earLag * 1.4, -115, 18 + earLag * 1.5, -125);
        ctx.bezierCurveTo(38 + earLag * 1.3, -110, 28 + earLag, -60, 12, -26);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Spherical Black Skull
        ctx.fillStyle = '#100e15';
        ctx.beginPath();
        ctx.arc(0, -14, 28, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // White Muzzle Plate
        ctx.fillStyle = '#FDFDFF';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(0, -6, 19, 14, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Black Oval Button Nose
        ctx.fillStyle = '#100e15';
        ctx.beginPath();
        ctx.ellipse(0, -12, 5, 3.5, 0, 0, Math.PI * 2);
        ctx.fill();

        // Grinning Mouth
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, -8, 11, 0.2, Math.PI * 0.8);
        ctx.stroke();

        // Large 1927 White Eye Plates & Pupil Beads
        ctx.fillStyle = '#FDFDFF';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(-8, -24, 7, 12, -0.05, 0, Math.PI * 2);
        ctx.ellipse(8, -24, 7, 12, 0.05, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Black Pupil Beads
        ctx.fillStyle = '#100e15';
        ctx.beginPath();
        ctx.ellipse(-7, -24, 3.5, 6, 0, 0, Math.PI * 2);
        ctx.ellipse(9, -24, 3.5, 6, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
        ctx.restore();
      },
    },
  },

  // ───────────────────────────────────────────────────────────────────────────
  // 5. SAILOR SWAGGER (1930s FLEISCHER / SEGAR ERA)
  // ─────────────────────────────────────────────────────────────────────────
  sailor_swagger: {
    id: 'sailor_swagger',
    name: 'Sailor Swagger (1930s)',
    creator: 'Fleischer Era Archetype',
    year: 1933,
    cadence: 2,
    aesthetic: 'fleischer_jazz',
    description: 'Bulging forearms with blue anchor tattoos, corncob pipe puffing smoke, squint eye, and rolling sea-legs strut.',
    rig: {
      bones: [
        { id: 'sailor_root', name: 'Root Pelvis', parentId: null, length: 0, baseAngle: 0, pivot: [0, 0, 0] },
        { id: 'sailor_spine', name: 'Heavy Chest & Shirt', parentId: 'sailor_root', length: 50, baseAngle: -90, pivot: [0, -20, 0] },
        { id: 'sailor_head', name: 'Chin & Sailor Cap', parentId: 'sailor_spine', length: 42, baseAngle: 0, pivot: [0, -60, 0] },
        { id: 'sailor_arm_l_upper', name: 'Left Upper Arm', parentId: 'sailor_spine', length: 30, baseAngle: 60, pivot: [-24, -20, 0] },
        { id: 'sailor_arm_l_lower', name: 'Left Bulging Tattoo Forearm', parentId: 'sailor_arm_l_upper', length: 36, baseAngle: 30, pivot: [-32, -8, 0] },
        { id: 'sailor_arm_r_upper', name: 'Right Upper Arm', parentId: 'sailor_spine', length: 30, baseAngle: -60, pivot: [24, -20, 0] },
        { id: 'sailor_arm_r_lower', name: 'Right Bulging Tattoo Forearm', parentId: 'sailor_arm_r_upper', length: 36, baseAngle: -30, pivot: [32, -8, 0] },
        { id: 'sailor_leg_l', name: 'Left Bell-Bottom Leg & Boot', parentId: 'sailor_root', length: 48, baseAngle: 90, pivot: [-16, 12, 0] },
        { id: 'sailor_leg_r', name: 'Right Bell-Bottom Leg & Boot', parentId: 'sailor_root', length: 48, baseAngle: 90, pivot: [16, 12, 0] },
      ],
      walkCycle: {
        'bone.arm_l_lower.rot': [
          { id: 'sal1', t: 0, v: -28, ease: 'smooth' },
          { id: 'sal2', t: 0.5, v: 28, ease: 'smooth' },
          { id: 'sal3', t: 1.0, v: -28, ease: 'smooth' },
        ],
        'bone.arm_r_lower.rot': [
          { id: 'sar1', t: 0, v: 28, ease: 'smooth' },
          { id: 'sar2', t: 0.5, v: -28, ease: 'smooth' },
          { id: 'sar3', t: 1.0, v: 28, ease: 'smooth' },
        ],
        'transform.x': [
          { id: 'stx1', t: 0, v: -16, ease: 'smooth' },
          { id: 'stx2', t: 0.5, v: 16, ease: 'smooth' },
          { id: 'stx3', t: 1.0, v: -16, ease: 'smooth' },
        ],
        'transform.y': [
          { id: 'sty1', t: 0, v: 0, ease: 'smooth' },
          { id: 'sty2', t: 0.25, v: -10, ease: 'smooth' },
          { id: 'sty3', t: 0.5, v: 0, ease: 'smooth' },
          { id: 'sty4', t: 0.75, v: -10, ease: 'smooth' },
          { id: 'sty5', t: 1.0, v: 0, ease: 'smooth' },
        ],
      },
      drawRoutine: (ctx, t, frame, scale = 1.0) => {
        ctx.save();
        ctx.scale(scale, scale);

        const walk = t * Math.PI * 2 * 0.8;
        const sway = Math.sin(walk) * 16;
        const roll = Math.abs(Math.sin(walk)) * 10;

        ctx.translate(sway, -roll);

        // 1. Drop shadow
        ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
        ctx.beginPath();
        ctx.ellipse(0, 56, 52, 11, 0, 0, Math.PI * 2);
        ctx.fill();

        // 2. Heavy Blue Sailor Trousers
        ctx.fillStyle = '#1C2951';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.roundRect(-22, 6, 44, 36, 6);
        ctx.fill();
        ctx.stroke();

        // Big Brown Sailor Boots
        const legSwing = Math.sin(walk) * 24;
        ctx.fillStyle = '#6E4522';
        ctx.beginPath();
        ctx.ellipse(-16 + legSwing, 52, 16, 8, 0, 0, Math.PI * 2);
        ctx.ellipse(16 - legSwing, 52, 16, 8, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // 3. Black Sailor Shirt & Red Kerchief
        ctx.fillStyle = '#100e15';
        ctx.beginPath();
        ctx.roundRect(-24, -28, 48, 38, 8);
        ctx.fill();
        ctx.stroke();

        // Red neckerchief
        ctx.fillStyle = '#D40055';
        ctx.beginPath();
        ctx.moveTo(-16, -26);
        ctx.lineTo(0, -12);
        ctx.lineTo(16, -26);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // 4. Giant Bulging Muscular Forearms with Anchor Tattoos
        const armPumping = Math.sin(walk) * 28;
        ctx.fillStyle = '#f5cbb0';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2.5;

        // Left Giant Forearm
        ctx.save();
        ctx.translate(-32, -8);
        ctx.rotate((armPumping * Math.PI) / 180);
        ctx.beginPath();
        ctx.ellipse(0, 0, 16, 22, -0.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Blue Anchor Tattoo
        ctx.strokeStyle = '#1C2951';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(0, -8); ctx.lineTo(0, 8);
        ctx.arc(0, 4, 6, 0.2, Math.PI * 0.8);
        ctx.moveTo(-4, -4); ctx.lineTo(4, -4);
        ctx.stroke();

        // Clenched Fist
        ctx.fillStyle = '#f5cbb0';
        ctx.strokeStyle = '#000000';
        ctx.beginPath();
        ctx.arc(0, 20, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();

        // Right Giant Forearm
        ctx.save();
        ctx.translate(32, -8);
        ctx.rotate((-armPumping * Math.PI) / 180);
        ctx.beginPath();
        ctx.ellipse(0, 0, 16, 22, 0.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Blue Anchor Tattoo
        ctx.strokeStyle = '#1C2951';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(0, -8); ctx.lineTo(0, 8);
        ctx.arc(0, 4, 6, 0.2, Math.PI * 0.8);
        ctx.moveTo(-4, -4); ctx.lineTo(4, -4);
        ctx.stroke();

        // Clenched Fist
        ctx.fillStyle = '#f5cbb0';
        ctx.strokeStyle = '#000000';
        ctx.beginPath();
        ctx.arc(0, 20, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();

        // 5. Gruff Sailor Head, Corncob Pipe & Cap
        ctx.save();
        ctx.translate(0, -56);

        // Huge Jutting Chin
        ctx.fillStyle = '#f5cbb0';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.ellipse(4, 8, 20, 16, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Cranium
        ctx.beginPath();
        ctx.arc(0, -8, 22, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Squint Eye (Left) & Wide Eye (Right)
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(-16, -10); ctx.lineTo(-4, -10); // One eye squeezed permanently shut in sailor squint
        ctx.stroke();

        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.ellipse(10, -10, 7, 9, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#100e15';
        ctx.beginPath();
        ctx.arc(10, -10, 3.5, 0, Math.PI * 2);
        ctx.fill();

        // Corncob Pipe puffing smoke rings
        ctx.save();
        ctx.translate(-14, 4);
        ctx.fillStyle = '#a66b38';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(-18, -12);
        ctx.stroke();
        // Pipe bowl
        ctx.fillRect(-22, -22, 10, 14);
        ctx.strokeRect(-22, -22, 10, 14);
        ctx.fillStyle = '#FF8C00';
        ctx.fillRect(-22, -23, 10, 3); // burning ember

        // Smoke rings
        const puff = (t * 3) % 2;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(-24 - puff * 16, -26 - puff * 24, 4 + puff * 8, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();

        // White Sailor Cap
        ctx.save();
        ctx.translate(0, -26);
        ctx.rotate(-0.1);
        ctx.fillStyle = '#FFFFFF';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.ellipse(0, 0, 24, 7, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.roundRect(-18, -14, 36, 14, 4);
        ctx.fill();
        ctx.stroke();
        ctx.restore();

        ctx.restore();
        ctx.restore();
      },
    },
  },
};

export function getClassicCharacter(id: string): ClassicCharacterTemplate | undefined {
  return CLASSIC_CHARACTERS[id];
}

export function listClassicCharacters(): ClassicCharacterTemplate[] {
  return Object.values(CLASSIC_CHARACTERS);
}

export function instantiateClassicCharacterLayer(id: string, layerId = `layer_${id}`): any {
  const char = CLASSIC_CHARACTERS[id];
  if (!char) throw new Error(`Classic character ${id} not found`);

  const channels: Record<string, any> = {};
  for (const [path, kfs] of Object.entries(char.rig.walkCycle)) {
    channels[path] = {
      id: `ch_${path.replace(/[^a-zA-Z0-9]/g, '_')}`,
      name: path,
      path,
      defaultValue: kfs[0]?.v ?? 0,
      keyframes: kfs,
    };
  }

  return {
    id: layerId,
    name: char.name,
    type: 'bone',
    visible: true,
    locked: false,
    opacity: 1,
    parentId: null,
    transform: { x: 400, y: 360, z: 0, rotationX: 0, rotationY: 0, rotationZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 },
    bones: char.rig.bones,
    channels,
  };
}
