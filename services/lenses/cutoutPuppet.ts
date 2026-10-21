// cutoutPuppet — the South Park lens's actual character: a jointed construction-paper puppet that
// REPLACES the person (the shader has already painted the person out of the world with the clean
// plate). Built the way cut-out animation is built — separate flat pieces (legs, body, arms, mitten
// hands, a big round head, hair cap, two touching oval eyes, a flap mouth), each with a thick ink edge
// and a small cardboard drop shadow, hinged at the joints:
//
//   head    ← face tracker: position, size, roll, gaze, blink, mouth open
//   body    ← shoulder line roll (pose tracker) — the torso tilts as a single stiff piece
//   arms    ← shoulder→wrist direction (pose), stubby fixed-length pieces; they hang when unseen
//
// Colours are cut from the person: skin at the nose, hair above the forehead, shirt from the chest,
// trousers from the hips — snapped to bold flat paper tones. The 12 fps hold in the engine supplies
// the pose-to-pose step; nothing here interpolates between holds.

export interface PuppetPose {
  /** canvas px; v = visibility */
  shoulderL?: { x: number; y: number; v: number }; shoulderR?: { x: number; y: number; v: number };
  wristL?: { x: number; y: number; v: number }; wristR?: { x: number; y: number; v: number };
  elbowL?: { x: number; y: number; v: number }; elbowR?: { x: number; y: number; v: number };
}
export interface PuppetFace {
  x: number; y: number; r: number;        // head centre + radius (canvas px)
  roll: number;                           // radians
  eyes: { x: number; y: number; gx: number; gy: number; open: number }[];   // canvas px + gaze (eye-widths)
  mouthOpen: number;                      // inner-lip gap / width
}
export interface PuppetColours { skin: string; hair: string; shirt: string; pants: string; glove: string }

const INK = '#0b0a0a';
type RGB = [number, number, number];

/** Push a sampled colour toward a bold, flat construction-paper tone. */
export function paperTone(c: RGB, minL = 0.18): RGB {
  let [r, g, b] = c.map(v => v / 255) as RGB;
  const l = 0.299 * r + 0.587 * g + 0.114 * b;
  const sat = 1.35;
  r = l + (r - l) * sat; g = l + (g - l) * sat; b = l + (b - l) * sat;
  const lift = l < minL ? (minL - l) : 0;
  const q = (v: number) => Math.round(Math.max(0, Math.min(1, v + lift)) * 12) / 12;   // a few paper stocks per hue
  return [q(r) * 255, q(g) * 255, q(b) * 255];
}
export const css = (c: RGB) => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
const shade = (c: string, k: number) => {
  const m = /rgb\((\d+),(\d+),(\d+)\)/.exec(c);
  return m ? `rgb(${(+m[1] * k) | 0},${(+m[2] * k) | 0},${(+m[3] * k) | 0})` : c;
};

function piece(c: CanvasRenderingContext2D, path: () => void, fill: string, ink: number) {
  // cardboard shadow, then the paper, then its cut edge
  c.save();
  c.shadowColor = 'rgba(0,0,0,0.28)'; c.shadowOffsetX = ink * 0.9; c.shadowOffsetY = ink * 1.3; c.shadowBlur = 0;
  c.fillStyle = fill; c.beginPath(); path(); c.fill();
  c.restore();
  c.lineWidth = ink; c.strokeStyle = INK; c.lineJoin = 'round';
  c.beginPath(); path(); c.stroke();
}

function limb(c: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, w: number, fill: string, ink: number) {
  c.save();
  c.lineCap = 'round';
  c.strokeStyle = 'rgba(0,0,0,0.28)'; c.lineWidth = w + ink * 2;
  c.beginPath(); c.moveTo(x0 + ink, y0 + ink * 1.3); c.lineTo(x1 + ink, y1 + ink * 1.3); c.stroke();
  c.strokeStyle = INK; c.lineWidth = w + ink * 2;
  c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
  c.strokeStyle = fill; c.lineWidth = w;
  c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
  c.restore();
}

export function drawPuppet(c: CanvasRenderingContext2D, f: PuppetFace, pose: PuppetPose | null, col: PuppetColours, alpha: number) {
  const R = f.r, D = R * 2;
  const ink = Math.max(2, R * 0.045);
  c.save();
  c.globalAlpha = alpha;

  // ── body: hangs under the head, tilted with the shoulders (bounded — paper is stiff) ──
  let bodyRoll = f.roll * 0.4;
  if (pose?.shoulderL && pose.shoulderR && pose.shoulderL.v > 0.5 && pose.shoulderR.v > 0.5) {
    const a = Math.atan2(pose.shoulderL.y - pose.shoulderR.y, pose.shoulderL.x - pose.shoulderR.x);
    const n = Math.atan2(Math.sin(a), Math.cos(a));
    bodyRoll = Math.max(-0.3, Math.min(0.3, Math.abs(n) > Math.PI / 2 ? n - Math.sign(n) * Math.PI : n));
  }
  const neckX = f.x - Math.sin(f.roll) * R * 0.78, neckY = f.y + Math.cos(f.roll) * R * 0.78;
  const bw = D * 0.92, bh = D * 0.6, legH = D * 0.16;
  c.save();
  c.translate(neckX, neckY); c.rotate(bodyRoll);
  // legs + shoes (behind the body)
  for (const s of [-1, 1]) {
    piece(c, () => { c.rect(s * bw * 0.2 - bw * 0.14, bh * 0.9, bw * 0.28, legH); }, col.pants, ink);
    piece(c, () => { c.ellipse(s * bw * 0.24, bh * 0.9 + legH, bw * 0.2, D * 0.06, 0, 0, Math.PI * 2); }, '#111111', ink);
  }
  // torso: a rounded bell, wider at the hem
  piece(c, () => {
    c.moveTo(-bw * 0.36, 0);
    c.quadraticCurveTo(-bw * 0.5, bh * 0.45, -bw * 0.5, bh * 0.95);
    c.lineTo(bw * 0.5, bh * 0.95);
    c.quadraticCurveTo(bw * 0.5, bh * 0.45, bw * 0.36, 0);
    c.closePath();
  }, col.shirt, ink);
  // a seam down the front + a hem band: the two marks every paper shirt gets
  c.strokeStyle = shade(col.shirt, 0.55); c.lineWidth = ink * 0.8;
  c.beginPath(); c.moveTo(0, bh * 0.12); c.lineTo(0, bh * 0.93); c.stroke();
  c.restore();

  // ── arms: stubby pieces hinged at the shoulder, aimed at the real wrist ──
  const cosB = Math.cos(bodyRoll), sinB = Math.sin(bodyRoll);
  const toWorld = (lx: number, ly: number) => ({ x: neckX + lx * cosB - ly * sinB, y: neckY + lx * sinB + ly * cosB });
  const armLen = D * 0.4, armW = D * 0.13;
  for (const s of [-1, 1]) {
    const sh = toWorld(s * bw * 0.4, bh * 0.22);
    // subject's left shoulder is on the viewer's right in a selfie-mirrored frame — pick the wrist on the same side
    const wr = s < 0 ? (pose?.wristR && pose.wristR.x < neckX ? pose.wristR : pose?.wristL && pose.wristL.x < neckX ? pose.wristL : null)
                     : (pose?.wristL && pose.wristL.x >= neckX ? pose.wristL : pose?.wristR && pose.wristR.x >= neckX ? pose.wristR : null);
    let ang = Math.PI / 2 + s * -0.35 + bodyRoll;                   // hanging
    if (wr && wr.v > 0.45) ang = Math.atan2(wr.y - sh.y, wr.x - sh.x);
    const hx = sh.x + Math.cos(ang) * armLen, hy = sh.y + Math.sin(ang) * armLen;
    limb(c, sh.x, sh.y, hx, hy, armW, col.shirt, ink);
    piece(c, () => { c.arc(hx, hy, D * 0.075, 0, Math.PI * 2); }, col.glove, ink);
  }

  // ── head ──
  c.save();
  c.translate(f.x, f.y); c.rotate(f.roll);
  const rx = R * 1.04, ry = R * 0.94;
  piece(c, () => { c.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2); }, col.skin, ink);
  // hair cap: the top of the head cut from hair-coloured paper, a wavy fringe for its bottom edge
  piece(c, () => {
    c.ellipse(0, -ry * 0.02, rx * 1.02, ry * 0.98, 0, Math.PI * 1.08, Math.PI * 1.92);
    const n = 6;
    for (let i = 0; i <= n; i++) {
      const t = i / n, x = rx * 0.86 - t * rx * 1.72;
      const y = -ry * 0.38 + Math.sin(t * Math.PI * n) * ry * 0.04 - Math.sin(t * Math.PI) * ry * 0.1;
      c.lineTo(x, y);
    }
    c.closePath();
  }, col.hair, ink);
  c.restore();

  // eyes: two big ovals that touch in the middle, tilted outward, tiny pupils on the real gaze
  const ex = R * 0.27, ey = R * 0.33;
  for (let i = 0; i < 2; i++) {
    const s = i === 0 ? -1 : 1;
    const e = f.eyes[i] || f.eyes[0];
    const lx = s * R * 0.26, ly = -R * 0.02;
    const x = f.x + lx * Math.cos(f.roll) - ly * Math.sin(f.roll), y = f.y + lx * Math.sin(f.roll) + ly * Math.cos(f.roll);
    c.save(); c.translate(x, y); c.rotate(f.roll + s * 0.22);
    piece(c, () => { c.ellipse(0, 0, ex, ey, 0, 0, Math.PI * 2); }, '#ffffff', ink * 0.9);
    if (e && e.open < 0.12) {                                       // blink: a lid line
      c.strokeStyle = INK; c.lineWidth = ink; c.beginPath(); c.moveTo(-ex * 0.8, 0); c.lineTo(ex * 0.8, 0); c.stroke();
    } else {
      const g = (v: number) => Math.max(-0.5, Math.min(0.5, v * 3));
      c.fillStyle = INK; c.beginPath(); c.arc(-s * ex * 0.18 + g(e?.gx ?? 0) * ex, g(e?.gy ?? 0) * ey, Math.max(1.5, R * 0.055), 0, Math.PI * 2); c.fill();
    }
    c.restore();
  }

  // mouth: a flat-topped flap that opens with the real mouth
  c.save();
  c.translate(f.x, f.y); c.rotate(f.roll);
  const mw = R * 0.5, my = R * 0.5;
  c.fillStyle = INK; c.strokeStyle = INK;
  if (f.mouthOpen < 0.07) {
    c.lineWidth = Math.max(2, ink * 1.1); c.lineCap = 'round';
    c.beginPath(); c.moveTo(-mw / 2, my); c.quadraticCurveTo(0, my + mw * 0.14, mw / 2, my); c.stroke();
  } else {
    const h = Math.min(mw * 0.9, f.mouthOpen * mw * 1.8);
    c.beginPath(); c.moveTo(-mw / 2, my); c.lineTo(mw / 2, my); c.ellipse(0, my, mw / 2, h, 0, 0, Math.PI); c.closePath(); c.fill();
    if (h > mw * 0.4) {
      c.save(); c.clip();
      c.fillStyle = '#d9526b'; c.beginPath(); c.ellipse(0, my + h * 0.95, mw * 0.28, h * 0.38, 0, 0, Math.PI * 2); c.fill();
      c.restore();
    }
  }
  c.restore();
  c.restore();
}
