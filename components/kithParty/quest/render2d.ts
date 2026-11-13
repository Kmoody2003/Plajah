/**
 * Kith Quest — Canvas 2D renderer. Painterly parallax per biome, lazily-baked terrain chunks
 * (pixels over draw calls: static ground is painted once per 16×16-tile chunk), additive glow pass,
 * particles driven by sim events. Reads QuestState only; never mutates it.
 */
import {T, TILE, type Biome} from './level';
import {MOVE, isEnemy, playerLashBox, type QuestState, type Ent, type Shot} from './sim';
import {characterById, portrait} from '../catalog';

const CHUNK = 16;
const VIEW_W = 960;

interface Palette {
 sky: [string, string, string]; far: string; mid: string; near: string; fog: string;
 earthTop: string; earth: string; earthDeep: string; rim: string; lip: string; lipHi: string; blade: string;
 ledge: string; ledgeHi: string; accent: string; light: string; ambient: 'fireflies' | 'mist' | 'embers';
}
const PAL: Record<Biome, Palette> = {
 moss: {
  sky: ['#0d2340', '#2a4f6e', '#e9a77a'], far: '#33577a', mid: '#1d3a52', near: '#0d1f2e', fog: 'rgba(160,220,230,.10)',
  earthTop: '#5b3d52', earth: '#3a2740', earthDeep: '#1b1424', rim: '#140e1c', lip: '#3fae7a', lipHi: '#a8f0a0', blade: '#62d38e',
  ledge: '#6d4a3a', ledgeHi: '#c99a6a', accent: '#8ff7d0', light: '#fff1c4', ambient: 'fireflies',
 },
 falls: {
  sky: ['#5fb6d8', '#a9def0', '#fbe1c0'], far: '#8bb7cf', mid: '#5f8fae', near: '#2c5068', fog: 'rgba(255,255,255,.16)',
  earthTop: '#6c7f96', earth: '#4b5c74', earthDeep: '#26324a', rim: '#1d2638', lip: '#59c3a0', lipHi: '#c9f7d8', blade: '#7fe0b2',
  ledge: '#7b6a5a', ledgeHi: '#e4caa2', accent: '#d8fbff', light: '#ffffff', ambient: 'mist',
 },
 keep: {
  sky: ['#0b0820', '#2b1846', '#7a3a5e'], far: '#3a2752', mid: '#22183a', near: '#110b1f', fog: 'rgba(255,170,120,.07)',
  earthTop: '#5a4a6a', earth: '#3b3049', earthDeep: '#1b1526', rim: '#0e0a16', lip: '#8b7aa0', lipHi: '#d8c8ee', blade: '#7d6c92',
  ledge: '#5c4436', ledgeHi: '#b48a62', accent: '#ffb46b', light: '#ffd28a', ambient: 'embers',
 },
};

/* --------------------------- small helpers ---------------------------- */
const hash = (a: number, b: number, c = 0) => { let h = (a * 374761393 + b * 668265263 + c * 2147483647) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
function mulberry(seed: number) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (v: number, a: number, b: number) => v < a ? a : v > b ? b : v;
function mix(c1: string, c2: string, t: number) {
 const p = (c: string) => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
 const a = p(c1), b = p(c2);
 return `rgb(${a.map((v, i) => Math.round(lerp(v, b[i], t))).join(',')})`;
}
function glowSprite(color: string, size = 128) {
 const c = document.createElement('canvas'); c.width = c.height = size;
 const g = c.getContext('2d')!, gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
 gr.addColorStop(0, color); gr.addColorStop(.25, color + 'aa'); gr.addColorStop(1, color + '00');
 g.fillStyle = gr; g.fillRect(0, 0, size, size);
 return c;
}

interface Particle { x: number; y: number; vx: number; vy: number; life: number; max: number; size: number; color: string; kind: 'dot' | 'ring' | 'leaf' | 'star' | 'text' | 'shard' | 'streak'; rot: number; g: number; text?: string; add?: boolean; }

export interface QuestRenderer { render(s: QuestState, dt: number): void; resize(): void; dispose(): void; shake(n: number): void; }

export function createQuestRenderer(canvas: HTMLCanvasElement, s0: QuestState): QuestRenderer {
 const ctx = canvas.getContext('2d', { alpha: false })!;
 const level = s0.level, pal = PAL[level.biome];
 const char = characterById(s0.player.character);
 const traits = s0.player.traits;
 const sprite = new Image(); sprite.decoding = 'async'; sprite.src = portrait(char);
 let spriteReady = false; sprite.onload = () => { spriteReady = true; };
 const glow = { warm: glowSprite('#ffd28a'), cool: glowSprite('#9ff7e8'), kith: glowSprite(traits.glow), red: glowSprite('#ff5a6e'), white: glowSprite('#ffffff'), violet: glowSprite('#c79bff') };
 let scale = 1, vw = VIEW_W, vh = 540, dpr = 1;
 const cam = { x: s0.player.x - 300, y: s0.player.y - 300, look: 0, shake: 0, sx: 0, sy: 0 };
 const particles: Particle[] = [];
 const trail: { x: number; y: number; a: number; f: number; rot: number }[] = [];
 let lastSeq = 0, time = 0;
 const chunks = new Map<string, HTMLCanvasElement>();
 let chunkScale = 1;

 /* ----------------------------- layers ------------------------------ */
 const LW = 1600, LH = 700;
 const layers = buildLayers(level.biome, pal, LW, LH);

 function resize() {
  const r = canvas.getBoundingClientRect();
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.max(320, Math.round(r.width * dpr)), h = Math.max(200, Math.round(r.height * dpr));
  // cap internal resolution (canon: iGPU baseline) — 1600 px wide is plenty for 2D
  const coarse = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
  const cap = Math.min(1, (coarse ? 1280 : 1600) / w);
  canvas.width = Math.round(w * cap); canvas.height = Math.round(h * cap);
  // keep ~540 world px of height visible; wide phones show up to 960 px across, tall screens at least 480
  vw = Math.max(480, Math.min(VIEW_W, canvas.width / canvas.height * 540));
  scale = canvas.width / vw; vh = canvas.height / scale;
  const cs = Math.min(1.75, Math.max(1, Math.round(scale * 4) / 4));
  if (cs !== chunkScale) { chunkScale = cs; chunks.clear(); }
 }
 resize();

 /* --------------------------- terrain bake -------------------------- */
 function tile(s: QuestState, c: number, r: number) { if (c < 0 || c >= level.w) return T.SOLID; if (r < 0) return T.EMPTY; if (r >= level.h) return T.SOLID; return s.tiles[r * level.w + c]; }
 const baseTile = (c: number, r: number) => { if (c < 0 || c >= level.w) return T.SOLID; if (r < 0) return T.EMPTY; if (r >= level.h) return T.SOLID; return level.tiles[r * level.w + c]; };
 const isGround = (v: number) => v === T.SOLID;
 const openAbove = (v: number) => v === T.EMPTY || v === T.ONEWAY || v === T.SPIKES || v === T.BRICK || v === T.BOX || v === T.CRUMBLE;
 function surfaceDepth(c: number, r: number) { let d = 0; while (d < 8 && isGround(baseTile(c, r - d - 1))) d++; return d; }

 function bakeChunk(cx: number, cy: number) {
  const key = cx + ',' + cy;
  let cv = chunks.get(key);
  if (cv) return cv;
  if (chunks.size > 40) { const first = chunks.keys().next().value!; chunks.delete(first); }
  cv = document.createElement('canvas');
  const px = CHUNK * TILE * chunkScale; cv.width = cv.height = Math.ceil(px);
  const g = cv.getContext('2d')!;
  g.scale(chunkScale, chunkScale);
  g.translate(-cx * CHUNK * TILE, -cy * CHUNK * TILE);
  const c0 = cx * CHUNK - 1, c1 = cx * CHUNK + CHUNK, r0 = cy * CHUNK - 1, r1 = cy * CHUNK + CHUNK;
  // pass 1: ground fill
  for (let c = c0; c <= c1; c++) for (let r = r0; r <= r1; r++) {
   const v = baseTile(c, r), x = c * TILE, y = r * TILE;
   if (isGround(v)) {
    const d = surfaceDepth(c, r);
    const shade = (k: number) => k <= 3 ? mix(pal.earthTop, pal.earth, clamp(k / 3, 0, 1)) : mix(pal.earth, pal.earthDeep, clamp((k - 3) / 5, 0, 1));
    const gr = g.createLinearGradient(0, y, 0, y + TILE); gr.addColorStop(0, shade(d)); gr.addColorStop(1, shade(d + 1));
    g.fillStyle = gr;
    g.fillRect(x - .5, y - .5, TILE + 1, TILE + 1);
    if (level.biome === 'keep') {
     g.strokeStyle = 'rgba(0,0,0,.28)'; g.lineWidth = 1.5;
     const off = (r % 2) * 16;
     g.beginPath(); g.moveTo(x, y + .75); g.lineTo(x + TILE, y + .75); g.moveTo(x + off + .5, y); g.lineTo(x + off + .5, y + TILE); g.moveTo(x + off + 16.5, y + 16); g.lineTo(x + off + 16.5, y + TILE); g.moveTo(x, y + 16.5); g.lineTo(x + TILE, y + 16.5); g.stroke();
     g.fillStyle = 'rgba(255,255,255,.035)'; g.fillRect(x + 2, y + 2, 12, 5);
    } else {
     const n = 2 + Math.floor(hash(c, r) * 3);
     for (let i = 0; i < n; i++) {
      const hx = hash(c, r, i + 1), hy = hash(r, c, i + 7), hs = hash(c + i, r - i);
      g.fillStyle = `rgba(${level.biome === 'moss' ? '255,220,255' : '220,240,255'},${.03 + hs * .05})`;
      g.beginPath(); g.ellipse(x + hx * TILE, y + hy * TILE, 3 + hs * 6, 2 + hs * 4, hs * 3, 0, Math.PI * 2); g.fill();
     }
     if (d > 1 && hash(c * 3, r) > .86) { g.fillStyle = 'rgba(0,0,0,.18)'; g.beginPath(); g.ellipse(x + 16, y + 16, 9, 6, hash(c, r) * 3, 0, Math.PI * 2); g.fill(); g.fillStyle = 'rgba(255,255,255,.06)'; g.beginPath(); g.ellipse(x + 14, y + 13, 6, 3, 0, 0, Math.PI * 2); g.fill(); }
    }
   } else if (v === T.SLOPE_UP || v === T.SLOPE_DOWN) {
    g.fillStyle = pal.earthTop;
    g.beginPath();
    if (v === T.SLOPE_UP) { g.moveTo(x - .5, y + TILE + .5); g.lineTo(x + TILE + .5, y - .5); g.lineTo(x + TILE + .5, y + TILE + .5); }
    else { g.moveTo(x - .5, y - .5); g.lineTo(x + TILE + .5, y + TILE + .5); g.lineTo(x - .5, y + TILE + .5); }
    g.closePath(); g.fill();
   }
  }
  // pass 2: rims on exposed sides
  for (let c = c0; c <= c1; c++) for (let r = r0; r <= r1; r++) {
   const v = baseTile(c, r); if (!isGround(v)) continue;
   const x = c * TILE, y = r * TILE;
   g.fillStyle = pal.rim;
   if (openAbove(baseTile(c - 1, r)) && baseTile(c - 1, r) !== T.SLOPE_DOWN) { g.fillRect(x, y, 5, TILE); g.fillStyle = 'rgba(255,255,255,.07)'; g.fillRect(x + 5, y, 2, TILE); g.fillStyle = pal.rim; }
   if (openAbove(baseTile(c + 1, r)) && baseTile(c + 1, r) !== T.SLOPE_UP) { g.fillRect(x + TILE - 5, y, 5, TILE); }
   if (openAbove(baseTile(c, r + 1)) && r + 1 < level.h) { g.fillRect(x, y + TILE - 6, TILE, 6); }
  }
  // pass 3: grass / moss / cap stones on top surfaces and slopes
  for (let c = c0; c <= c1; c++) for (let r = r0; r <= r1; r++) {
   const v = baseTile(c, r), x = c * TILE, y = r * TILE;
   const above = baseTile(c, r - 1);
   if (isGround(v) && openAbove(above)) lip(g, x, y, x + TILE, y, c, r);
   if (v === T.SLOPE_UP) lip(g, x, y + TILE, x + TILE, y, c, r);
   if (v === T.SLOPE_DOWN) lip(g, x, y, x + TILE, y + TILE, c, r);
   if (v === T.ONEWAY) ledge(g, x, y, c, r);
   if (v === T.SPIKES) spikes(g, x, y, c);
  }
  // pass 4: decorations on the surface
  for (let c = c0; c <= c1; c++) for (let r = r0; r <= r1; r++) {
   const v = baseTile(c, r); if (!isGround(v) || !openAbove(baseTile(c, r - 1)) || baseTile(c, r - 1) !== T.EMPTY) continue;
   deco(g, c * TILE, r * TILE, c, r);
  }
  chunks.set(key, cv);
  return cv;
 }

 function lip(g: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, c: number, r: number) {
  const len = Math.hypot(x1 - x0, y1 - y0), nx = (y0 - y1) / len, ny = (x1 - x0) / len; // normal pointing down-ish
  const steps = 6, thick = level.biome === 'keep' ? 7 : 9;
  g.fillStyle = pal.lip;
  g.beginPath();
  g.moveTo(x0 - 1, y0 - 2);
  for (let i = 0; i <= steps; i++) { const t = i / steps, bump = Math.sin((c * 7 + r * 3 + i) * 1.7) * 1.8; g.lineTo(lerp(x0, x1, t), lerp(y0, y1, t) - 2 + bump * .4); }
  for (let i = steps; i >= 0; i--) { const t = i / steps, sag = thick + Math.sin((c * 5 + i * 2.3)) * 3 + (level.biome === 'keep' ? 0 : hash(c, i) * 3); g.lineTo(lerp(x0, x1, t) + nx * sag, lerp(y0, y1, t) + ny * sag); }
  g.closePath(); g.fill();
  g.strokeStyle = pal.lipHi; g.lineWidth = 2; g.globalAlpha = .7;
  g.beginPath(); g.moveTo(x0, y0 - 1.5); g.lineTo(x1, y1 - 1.5); g.stroke(); g.globalAlpha = 1;
  if (level.biome !== 'keep') {
   g.strokeStyle = pal.blade; g.lineWidth = 1.6; g.lineCap = 'round';
   for (let i = 0; i < 5; i++) {
    const t = hash(c, r, i), bx = lerp(x0, x1, t), by = lerp(y0, y1, t) - 1, h = 4 + hash(r, c, i) * 8, lean = (hash(i, c) - .5) * 6;
    g.beginPath(); g.moveTo(bx, by); g.quadraticCurveTo(bx + lean * .3, by - h * .6, bx + lean, by - h); g.stroke();
   }
   // moss drips down exposed faces
   if (hash(c, r, 99) > .6) { g.fillStyle = pal.lip; const dx = x0 + hash(c, r, 5) * 24 + 4, dh = 6 + hash(r, c, 3) * 14; g.beginPath(); g.ellipse(dx, lerp(y0, y1, .5) + thick + dh * .4, 2.2, dh * .5, 0, 0, Math.PI * 2); g.fill(); }
  } else {
   g.fillStyle = 'rgba(0,0,0,.25)'; for (let i = 0; i < 2; i++) g.fillRect(lerp(x0, x1, i * .5) + 15, lerp(y0, y1, i * .5) - 1, 1.5, thick);
  }
 }
 function ledge(g: CanvasRenderingContext2D, x: number, y: number, c: number, r: number) {
  if (level.biome === 'keep') {
   g.fillStyle = pal.earthTop; g.fillRect(x, y, TILE, 10); g.fillStyle = pal.lipHi; g.globalAlpha = .5; g.fillRect(x, y, TILE, 2); g.globalAlpha = 1;
   g.fillStyle = pal.rim; g.fillRect(x, y + 10, TILE, 3);
   if (baseTile(c - 1, r) !== T.ONEWAY || c % 3 === 0) { g.fillStyle = pal.earth; g.beginPath(); g.moveTo(x + 4, y + 12); g.lineTo(x + 16, y + 26); g.lineTo(x + 20, y + 12); g.fill(); }
   return;
  }
  g.fillStyle = pal.ledge; g.beginPath(); g.roundRect(x - .5, y, TILE + 1, 11, 3); g.fill();
  g.fillStyle = pal.ledgeHi; g.fillRect(x, y + 1, TILE, 2);
  g.strokeStyle = 'rgba(0,0,0,.3)'; g.lineWidth = 1; g.beginPath(); g.moveTo(x + 16, y + 3); g.lineTo(x + 16, y + 10); g.stroke();
  const left = baseTile(c - 1, r) !== T.ONEWAY, right = baseTile(c + 1, r) !== T.ONEWAY;
  g.fillStyle = pal.lip;
  if (left || right || hash(c, r) > .5) { g.beginPath(); g.ellipse(x + 16, y + 1, 14, 3.5, 0, 0, Math.PI * 2); g.fill(); }
  g.strokeStyle = pal.blade; g.lineWidth = 1.4;
  if (hash(c, r, 3) > .4) { g.beginPath(); g.moveTo(x + 8, y + 11); g.quadraticCurveTo(x + 6, y + 20, x + 10, y + 26 + hash(c, r) * 8); g.stroke(); }
 }
 function spikes(g: CanvasRenderingContext2D, x: number, y: number, c: number) {
  g.fillStyle = level.biome === 'keep' ? '#9aa0b8' : '#3a1f3a';
  for (let i = 0; i < 4; i++) {
   const bx = x + i * 8, h = 14 + hash(c, i) * 8;
   g.beginPath(); g.moveTo(bx, y + TILE); g.lineTo(bx + 4, y + TILE - h); g.lineTo(bx + 8, y + TILE); g.fill();
  }
  g.fillStyle = level.biome === 'keep' ? '#e8ecff' : '#d0507a';
  for (let i = 0; i < 4; i++) { const bx = x + i * 8, h = 14 + hash(c, i) * 8; g.beginPath(); g.arc(bx + 4, y + TILE - h + 2, 1.5, 0, Math.PI * 2); g.fill(); }
 }
 function deco(g: CanvasRenderingContext2D, x: number, y: number, c: number, r: number) {
  const h = hash(c, r, 42);
  if (level.biome === 'moss') {
   if (h > .82) { // glowing mushrooms
    for (let i = 0; i < 2; i++) {
     const mx = x + 8 + i * 12 + hash(c, i) * 4, mh = 7 + hash(r, i) * 9;
     g.fillStyle = '#e8d8c8'; g.fillRect(mx - 1.2, y - mh, 2.4, mh);
     g.fillStyle = i ? '#8ff7d0' : '#7fc8ff'; g.beginPath(); g.ellipse(mx, y - mh, 5 + i, 3.4, 0, Math.PI, 0); g.fill();
     g.fillStyle = 'rgba(255,255,255,.7)'; g.beginPath(); g.arc(mx - 1.5, y - mh - 1.6, .9, 0, Math.PI * 2); g.fill();
    }
   } else if (h > .66) { // fern
    g.strokeStyle = '#2f8f68'; g.lineWidth = 1.5;
    for (let k = 0; k < 3; k++) { const a = -Math.PI / 2 + (k - 1) * .6; g.beginPath(); g.moveTo(x + 16, y); g.quadraticCurveTo(x + 16 + Math.cos(a) * 10, y + Math.sin(a) * 18, x + 16 + Math.cos(a) * 18, y + Math.sin(a) * 14); g.stroke(); }
   } else if (h > .58) { g.fillStyle = '#4b3b5a'; g.beginPath(); g.ellipse(x + 16, y - 3, 9, 5, 0, Math.PI, 0); g.fill(); g.fillStyle = '#62d38e'; g.beginPath(); g.ellipse(x + 15, y - 6, 6, 2, 0, Math.PI, 0); g.fill(); }
  } else if (level.biome === 'falls') {
   if (h > .8) { g.fillStyle = '#f7d6e0'; for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(x + 6 + i * 9, y - 4 - hash(c, i) * 6, 2.4, 0, Math.PI * 2); g.fill(); } g.fillStyle = '#ffe48a'; for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(x + 6 + i * 9, y - 4 - hash(c, i) * 6, 1, 0, Math.PI * 2); g.fill(); } }
   else if (h > .66) { g.fillStyle = '#8b9cb3'; g.beginPath(); g.ellipse(x + 16, y - 4, 10, 6, 0, Math.PI, 0); g.fill(); g.fillStyle = '#59c3a0'; g.beginPath(); g.ellipse(x + 13, y - 8, 6, 2, 0, Math.PI, 0); g.fill(); }
  } else {
   if (h > .84) { g.fillStyle = '#2a2236'; g.fillRect(x + 6, y - 14, 4, 14); g.fillRect(x + 4, y - 15, 8, 3); }
   else if (h > .74) { g.fillStyle = 'rgba(0,0,0,.35)'; g.beginPath(); g.ellipse(x + 16, y - 2, 10, 3, 0, 0, Math.PI * 2); g.fill(); g.fillStyle = '#c9c0d8'; g.beginPath(); g.arc(x + 14, y - 5, 4, 0, Math.PI * 2); g.fill(); g.fillStyle = '#1a1424'; g.fillRect(x + 12, y - 6, 1.5, 1.5); g.fillRect(x + 15, y - 6, 1.5, 1.5); }
  }
 }

 /* ------------------------------ events ------------------------------ */
 function burst(x: number, y: number, n: number, color: string, speed = 220, kind: Particle['kind'] = 'dot', size = 3, g = 600, add = true) {
  for (let i = 0; i < n; i++) {
   const a = Math.random() * Math.PI * 2, v = speed * (.3 + Math.random() * .7);
   particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - speed * .3, life: .5 + Math.random() * .5, max: 1, size: size * (.6 + Math.random() * .8), color, kind, rot: Math.random() * 6, g, add });
  }
 }
 function text(x: number, y: number, t: string, color = '#fff') { particles.push({ x, y, vx: 0, vy: -60, life: 1, max: 1, size: 14, color, kind: 'text', rot: 0, g: 0, text: t }); }
 function ring(x: number, y: number, color: string, size = 30, life = .35) { particles.push({ x, y, vx: 0, vy: 0, life, max: life, size, color, kind: 'ring', rot: 0, g: 0, add: true }); }
 function dust(x: number, y: number, n = 6, dir = 0) { for (let i = 0; i < n; i++) particles.push({ x: x + (Math.random() - .5) * 16, y, vx: (Math.random() - .5) * 120 + dir * 80, vy: -Math.random() * 80, life: .4 + Math.random() * .3, max: .7, size: 4 + Math.random() * 5, color: level.biome === 'falls' ? 'rgba(255,255,255,.55)' : 'rgba(220,200,230,.4)', kind: 'dot', rot: 0, g: -40, add: false }); }

 function consume(s: QuestState) {
  for (const e of s.events) {
   if (e.seq <= lastSeq) continue;
   lastSeq = e.seq;
   switch (e.type) {
    case 'jump': dust(e.x, e.y, 5); break;
    case 'djump': ring(e.x, e.y, traits.glow, 26, .3); burst(e.x, e.y, 10, traits.glow, 160, 'star', 3, 200); break;
    case 'walljump': burst(e.x, e.y, 8, '#ffffff', 140, 'dot', 2.5); break;
    case 'land': dust(e.x, e.y, 6); break;
    case 'dash': ring(e.x, e.y, '#ffffff', 34, .25); cam.shake = Math.max(cam.shake, 3); break;
    case 'skid': if (Math.random() < .3) dust(e.x, e.y, 1, -s.player.facing); break;
    case 'roll': case 'spinRelease': burst(e.x, e.y - 8, 10, traits.color, 180, 'streak', 3, 0); cam.shake = Math.max(cam.shake, e.type === 'spinRelease' ? 6 : 2); break;
    case 'rev': ring(e.x, e.y - 12, traits.glow, 18 + Number(e.data) * 10, .25); dust(e.x, e.y, 3, -s.player.facing); break;
    case 'mote': burst(e.x, e.y, 6, '#bff8ff', 110, 'star', 2.5, 0); break;
    case 'seed': burst(e.x, e.y, 30, '#ffe46b', 260, 'star', 4, 100); ring(e.x, e.y, '#ffe46b', 60, .6); text(e.x, e.y - 20, 'STAR SEED!', '#ffe46b'); break;
    case 'petal': burst(e.x, e.y, 12, '#ff8fc4', 140, 'leaf', 4, 100); text(e.x, e.y - 16, '+1 PETAL', '#ffc0dc'); break;
    case 'spark': burst(e.x, e.y, 10, '#ffd28a', 140, 'star', 3, 100); text(e.x, e.y - 16, '+3 SPARKS', '#ffd28a'); break;
    case 'box': burst(e.x, e.y, 8, '#ffe8a8', 160, 'star', 3); ring(e.x, e.y, '#ffe8a8', 26, .25); break;
    case 'brick': for (let i = 0; i < 8; i++) particles.push({ x: e.x + (Math.random() - .5) * 20, y: e.y + (Math.random() - .5) * 20, vx: (Math.random() - .5) * 360, vy: -200 - Math.random() * 300, life: 1, max: 1, size: 6 + Math.random() * 5, color: level.biome === 'keep' ? '#6b5a80' : '#8a5a4a', kind: 'shard', rot: Math.random() * 6, g: 1500 }); cam.shake = Math.max(cam.shake, 3); break;
    case 'lantern': burst(e.x, e.y, 16, '#ffb46b', 200, 'dot', 3, 400); ring(e.x, e.y, '#ffb46b', 30); break;
    case 'pop': burst(e.x, e.y, 14, '#ffffff', 220, 'star', 3.5, 300); ring(e.x, e.y, '#ffffff', 34); cam.shake = Math.max(cam.shake, 4); break;
    case 'hit': burst(e.x, e.y, 6, '#ffffff', 160, 'dot', 2.5); break;
    case 'stomp': ring(e.x, e.y, '#ffffff', 28, .25); text(e.x, e.y - 24, 'BOP!', '#fff6c8'); break;
    case 'hurt': burst(e.x, e.y, 12, '#ff5a6e', 220, 'dot', 3); cam.shake = Math.max(cam.shake, 8); break;
    case 'die': burst(e.x, e.y, 30, traits.glow, 300, 'star', 4, 300); cam.shake = 12; break;
    case 'fall': cam.shake = Math.max(cam.shake, 6); break;
    case 'respawn': ring(e.x, e.y - 20, traits.glow, 60, .6); burst(e.x, e.y - 20, 16, traits.glow, 160, 'star', 3, 0); break;
    case 'checkpoint': ring(e.x, e.y, '#8ff7d0', 70, .7); burst(e.x, e.y, 24, '#8ff7d0', 220, 'star', 3, 120); text(e.x, e.y - 30, 'CHECKPOINT', '#8ff7d0'); break;
    case 'spring': ring(e.x, e.y, '#ffffff', 30, .3); dust(e.x, e.y, 6); break;
    case 'boost': burst(e.x, e.y, 12, '#9ff7ff', 260, 'streak', 3, 0); cam.shake = Math.max(cam.shake, 3); break;
    case 'lash': break;
    case 'parry': ring(e.x, e.y, '#ffffff', 26, .25); text(e.x, e.y - 18, 'PARRY!', '#ffffff'); break;
    case 'sub': burst(e.x, e.y, 6, traits.glow, 120, 'star', 2.5, 0); break;
    case 'shotHit': burst(e.x, e.y, 10, traits.glow, 180, 'dot', 2.5, 300); break;
    case 'spore': ring(e.x, e.y, '#d7ff7a', 16, .25); break;
    case 'bashAim': ring(e.x, e.y, '#ffffff', 70, .4); break;
    case 'bash': ring(e.x, e.y, '#ffe46b', 80, .45); burst(e.x, e.y, 20, '#ffe46b', 320, 'streak', 3, 0); cam.shake = Math.max(cam.shake, 7); break;
    case 'crumble': dust(e.x, e.y, 4); break;
    case 'crumbleFall': for (let i = 0; i < 5; i++) particles.push({ x: e.x + (Math.random() - .5) * 24, y: e.y, vx: (Math.random() - .5) * 80, vy: Math.random() * 80, life: 1, max: 1, size: 5 + Math.random() * 4, color: pal.earthTop, kind: 'shard', rot: Math.random() * 6, g: 1400 }); break;
    case 'oneup': text(e.x, e.y - 20, '1-UP!', '#9dff9d'); break;
    case 'clear': ring(e.x, e.y, '#ffe46b', 120, 1); burst(e.x, e.y, 60, '#ffe46b', 420, 'star', 4, 200); break;
    case 'bossIntro': cam.shake = 10; break;
    case 'bossHit': burst(e.x, e.y, 14, '#ffb46b', 260, 'star', 4, 200); cam.shake = Math.max(cam.shake, 5); if (e.data === 'reflect') text(e.x, e.y - 50, 'REFLECTED!', '#ffe46b'); break;
    case 'bossPhase': ring(e.x, e.y, '#ff5a6e', 140, .8); cam.shake = 14; break;
    case 'bossSlam': cam.shake = 16; dust(e.x - 40, e.y, 10, -1); dust(e.x + 40, e.y, 10, 1); break;
    case 'bossVolley': ring(e.x, e.y, '#c79bff', 40, .3); break;
    case 'bossDown': cam.shake = 20; break;
    case 'bossDead': burst(e.x, e.y, 80, '#ffd28a', 500, 'star', 5, 100); ring(e.x, e.y, '#ffffff', 220, 1.2); cam.shake = 24; break;
   }
  }
 }

 /* ------------------------------ camera ------------------------------ */
 function updateCamera(s: QuestState, dt: number) {
  const p = s.player;
  const lookT = clamp(p.vx * .42, -190, 190);
  cam.look = lerp(cam.look, lookT, 1 - Math.exp(-dt * 2.2));
  let tx = p.x + p.w / 2 - vw / 2 + cam.look;
  const feet = p.y + p.h;
  let ty = cam.y;
  const anchor = vh * .62;
  if (p.onGround || p.wallSliding || feet - cam.y > vh * .78 || feet - cam.y < vh * .25 || p.dead > 0) ty = feet - anchor;
  if (s.arenaLocked && level.arena) {
   const ax0 = level.arena.c0 * TILE - 40, ax1 = (level.arena.c1 + 1) * TILE + 40;
   tx = clamp(ax0 + (ax1 - ax0) / 2 - vw / 2 + (p.x - (ax0 + ax1) / 2) * .25, ax0, Math.max(ax0, ax1 - vw));
  }
  tx = clamp(tx, 0, level.w * TILE - vw);
  ty = clamp(ty, 0, Math.max(0, level.h * TILE - vh));
  const kx = 1 - Math.exp(-dt * 9), ky = 1 - Math.exp(-dt * (Math.abs(p.vy) > 700 ? 12 : 5));
  cam.x = lerp(cam.x, tx, kx); cam.y = lerp(cam.y, ty, ky);
  cam.shake = Math.max(0, cam.shake - dt * 40);
  cam.sx = (Math.random() - .5) * cam.shake; cam.sy = (Math.random() - .5) * cam.shake;
 }

 /* ------------------------------ drawing ----------------------------- */
 function drawSky(s: QuestState) {
  const W = canvas.width, H = canvas.height;
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, pal.sky[0]); g.addColorStop(.6, pal.sky[1]); g.addColorStop(1, pal.sky[2]);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  // celestial body
  const mx = W * .72 - cam.x * .02 * scale, my = H * (level.biome === 'falls' ? .2 : .22) - cam.y * .02 * scale, mr = (level.biome === 'falls' ? 60 : 46) * scale;
  ctx.globalCompositeOperation = 'lighter';
  ctx.drawImage(level.biome === 'keep' ? glow.violet : glow.warm, mx - mr * 4, my - mr * 4, mr * 8, mr * 8);
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = level.biome === 'keep' ? '#f4e9ff' : level.biome === 'falls' ? '#fff8e6' : '#ffe9c4';
  ctx.beginPath(); ctx.arc(mx, my, mr, 0, Math.PI * 2); ctx.fill();
  if (level.biome === 'keep') { ctx.fillStyle = pal.sky[1]; ctx.beginPath(); ctx.arc(mx + mr * .45, my - mr * .2, mr * .9, 0, Math.PI * 2); ctx.fill(); }
  // parallax layers
  const layerFactors = [.12, .28, .5];
  layers.forEach((L, i) => {
   const f = layerFactors[i];
   const h = H * (1.05 + i * .06), w = LW * (h / LH);
   const ox = -((cam.x * f * scale) % w) - (cam.x * f * scale < 0 ? w : 0);
   const oy = H - h + (Math.max(0, (level.h * TILE - vh) - cam.y)) * f * .35 * scale + i * 10 * scale;
   for (let x = ox; x < W; x += w) ctx.drawImage(L, x, oy, w + 1, h);
   if (i === 0 || i === 1) { const fy = oy + h * .45, fg = ctx.createLinearGradient(0, fy, 0, fy + h * .3); fg.addColorStop(0, 'rgba(0,0,0,0)'); fg.addColorStop(1, pal.fog); ctx.fillStyle = fg; ctx.fillRect(0, fy, W, H - fy); }
  });
  // animated waterfalls / god rays
  if (level.biome === 'falls') {
   for (let i = 0; i < 4; i++) {
    const w = (40 + i * 14) * scale, x = ((i * 520 + 200 - cam.x * .5) * scale) % (W + 600) - 100;
    const grd = ctx.createLinearGradient(x, 0, x + w, 0); grd.addColorStop(0, 'rgba(255,255,255,0)'); grd.addColorStop(.5, 'rgba(235,250,255,.45)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grd; ctx.fillRect(x, H * .18, w, H);
    ctx.fillStyle = 'rgba(255,255,255,.35)';
    for (let k = 0; k < 8; k++) { const yy = ((time * 260 + k * 97 + i * 40) % (H * .9)) + H * .18; ctx.fillRect(x + w * (.3 + .4 * hash(k, i)), yy, 2 * scale, 22 * scale); }
   }
  }
  ctx.globalCompositeOperation = 'lighter';
  const rays = level.biome === 'keep' ? 2 : 4;
  for (let i = 0; i < rays; i++) {
   const x = ((i * 420 + 140 - cam.x * .3) * scale) % (W + 500) - 200;
   ctx.save(); ctx.translate(x, -20); ctx.rotate(.38);
   const gr = ctx.createLinearGradient(0, 0, 0, H * 1.2);
   gr.addColorStop(0, level.biome === 'keep' ? 'rgba(255,180,120,.08)' : 'rgba(255,240,200,.13)'); gr.addColorStop(1, 'rgba(255,240,200,0)');
   ctx.fillStyle = gr; ctx.fillRect(0, 0, (60 + i * 30) * scale * (.7 + .3 * Math.sin(time * .5 + i)), H * 1.2);
   ctx.restore();
  }
  ctx.globalCompositeOperation = 'source-over';
 }

 function worldToScreen() { ctx.setTransform(scale, 0, 0, scale, -Math.round((cam.x + cam.sx) * scale), -Math.round((cam.y + cam.sy) * scale)); }

 function drawTerrain(s: QuestState) {
  const cx0 = Math.floor(cam.x / (CHUNK * TILE)), cx1 = Math.floor((cam.x + vw) / (CHUNK * TILE));
  const cy0 = Math.floor(cam.y / (CHUNK * TILE)), cy1 = Math.floor((cam.y + vh) / (CHUNK * TILE));
  for (let cx = cx0; cx <= cx1; cx++) for (let cy = cy0; cy <= cy1; cy++) {
   if (cx < 0 || cy < 0 || cx * CHUNK >= level.w || cy * CHUNK >= level.h) continue;
   ctx.drawImage(bakeChunk(cx, cy), cx * CHUNK * TILE - .5, cy * CHUNK * TILE - .5, CHUNK * TILE + 1, CHUNK * TILE + 1);
  }
  // dynamic tiles
  const c0 = Math.floor(cam.x / TILE) - 1, c1 = Math.ceil((cam.x + vw) / TILE) + 1, r0 = Math.floor(cam.y / TILE) - 1, r1 = Math.ceil((cam.y + vh) / TILE) + 1;
  for (let c = c0; c <= c1; c++) for (let r = r0; r <= r1; r++) {
   const v = tile(s, c, r), x = c * TILE, y = r * TILE;
   if (v === T.BRICK) brick(x, y, c, r);
   else if (v === T.BOX) box(x, y, false);
   else if (v === T.USED) box(x, y, true);
   else if (v === T.CRUMBLE) {
    const t = s.crumble.get(r * level.w + c);
    const shake = t !== undefined && t > 0 ? (Math.random() - .5) * 3 : 0;
    ctx.fillStyle = pal.ledge; ctx.beginPath(); ctx.roundRect(x + 1 + shake, y, TILE - 2, 14, 4); ctx.fill();
    ctx.fillStyle = pal.ledgeHi; ctx.fillRect(x + 3 + shake, y + 2, TILE - 6, 2);
    ctx.strokeStyle = 'rgba(0,0,0,.4)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(x + 10 + shake, y + 2); ctx.lineTo(x + 14 + shake, y + 8); ctx.lineTo(x + 11 + shake, y + 13); ctx.moveTo(x + 22 + shake, y + 1); ctx.lineTo(x + 19 + shake, y + 9); ctx.stroke();
   }
  }
 }
 function brick(x: number, y: number, c: number, r: number) {
  const base = level.biome === 'keep' ? '#6b5a80' : level.biome === 'falls' ? '#8d7a6a' : '#8a5a4a';
  ctx.fillStyle = base; ctx.fillRect(x, y, TILE, TILE);
  ctx.fillStyle = 'rgba(255,255,255,.14)'; ctx.fillRect(x, y, TILE, 3);
  ctx.strokeStyle = 'rgba(0,0,0,.4)'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(x, y + 16); ctx.lineTo(x + TILE, y + 16); ctx.moveTo(x + 16, y); ctx.lineTo(x + 16, y + 16); ctx.moveTo(x + 6, y + 16); ctx.lineTo(x + 6, y + 32); ctx.moveTo(x + 26, y + 16); ctx.lineTo(x + 26, y + 32); ctx.stroke();
  ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.strokeRect(x + .75, y + .75, TILE - 1.5, TILE - 1.5);
  if (hash(c, r) > .5) { ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.moveTo(x + 20, y + 4); ctx.lineTo(x + 24, y + 10); ctx.stroke(); }
 }
 function box(x: number, y: number, used: boolean) {
  const pulse = used ? 0 : .5 + .5 * Math.sin(time * 4 + x * .01);
  ctx.save(); ctx.translate(x + 16, y + 16);
  ctx.fillStyle = used ? '#5e5468' : '#f3b84a';
  ctx.beginPath(); ctx.roundRect(-15, -15, 30, 30, 6); ctx.fill();
  ctx.fillStyle = used ? '#4a4254' : '#d48a2c'; ctx.beginPath(); ctx.roundRect(-15, 4, 30, 11, [0, 0, 6, 6]); ctx.fill();
  ctx.strokeStyle = used ? '#2e2838' : '#7a4a1a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.roundRect(-15, -15, 30, 30, 6); ctx.stroke();
  if (!used) {
   // bloom glyph — four petals
   ctx.fillStyle = `rgba(255,255,240,${.75 + pulse * .25})`;
   for (let i = 0; i < 4; i++) { ctx.rotate(Math.PI / 2); ctx.beginPath(); ctx.ellipse(0, -6, 3.2, 5.5, 0, 0, Math.PI * 2); ctx.fill(); }
   ctx.fillStyle = '#ff8fc4'; ctx.beginPath(); ctx.arc(0, 0, 3, 0, Math.PI * 2); ctx.fill();
  } else { ctx.fillStyle = '#6e6478'; for (const [a, b] of [[-9, -9], [9, -9], [-9, 9], [9, 9]]) { ctx.beginPath(); ctx.arc(a, b, 2, 0, Math.PI * 2); ctx.fill(); } }
  ctx.restore();
 }

 function drawEnt(s: QuestState, e: Ent) {
  const cx = e.x + e.w / 2, by = e.y + e.h, t = time + e.id * .37;
  ctx.save();
  if (e.hurt > 0 && Math.floor(e.hurt * 30) % 2 === 0) ctx.globalAlpha = .45;
  switch (e.kind) {
   case 'mote': {
    const y = e.y + e.h / 2 + Math.sin(t * 3) * 3;
    ctx.translate(cx, y); ctx.rotate(Math.sin(t * 2) * .3);
    ctx.fillStyle = '#bff8ff'; ctx.beginPath(); ctx.moveTo(0, -8); ctx.quadraticCurveTo(6, 0, 0, 8); ctx.quadraticCurveTo(-6, 0, 0, -8); ctx.fill();
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.ellipse(-1.5, -2, 1.6, 3, 0, 0, Math.PI * 2); ctx.fill();
    break;
   }
   case 'seed': {
    const y = e.y + e.h / 2 + Math.sin(t * 2) * 4;
    ctx.translate(cx, y); ctx.rotate(t);
    ctx.fillStyle = '#ffe46b';
    ctx.beginPath(); for (let i = 0; i < 10; i++) { const a = i * Math.PI / 5, r = i % 2 ? 6 : 14; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); } ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#fff8d0'; ctx.beginPath(); ctx.arc(0, 0, 4, 0, Math.PI * 2); ctx.fill();
    break;
   }
   case 'petal': {
    ctx.translate(cx, e.y + e.h / 2 + Math.sin(t * 3) * 3);
    for (let i = 0; i < 5; i++) { ctx.rotate(Math.PI * 2 / 5); ctx.fillStyle = i % 2 ? '#ff8fc4' : '#ffb2d6'; ctx.beginPath(); ctx.ellipse(0, -6, 4, 7, 0, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = '#ffe46b'; ctx.beginPath(); ctx.arc(0, 0, 3, 0, Math.PI * 2); ctx.fill();
    break;
   }
   case 'spark': {
    ctx.translate(cx, e.y + e.h / 2 + Math.sin(t * 4) * 3); ctx.rotate(t * 2);
    ctx.fillStyle = '#ffd28a'; ctx.beginPath(); for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, r = i % 2 ? 3 : 9; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); } ctx.closePath(); ctx.fill();
    break;
   }
   case 'checkpoint': {
    const lit = e.state === 'lit';
    ctx.fillStyle = '#3a2d40'; ctx.fillRect(cx - 3, e.y + 14, 6, e.h - 14);
    ctx.fillStyle = '#5a4860'; ctx.fillRect(cx - 8, by - 6, 16, 6);
    ctx.strokeStyle = '#5a4860'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(cx, e.y + 14, 10, Math.PI, 0); ctx.stroke();
    ctx.fillStyle = lit ? '#8ff7d0' : '#2c3a44'; ctx.beginPath(); ctx.ellipse(cx, e.y + 18 + (lit ? Math.sin(t * 3) * 2 : 0), 7, 9, 0, 0, Math.PI * 2); ctx.fill();
    if (lit) { ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.ellipse(cx - 2, e.y + 15, 2, 3, 0, 0, Math.PI * 2); ctx.fill(); }
    break;
   }
   case 'goal': {
    // Lantern Gate: twin pillars with a floating flame
    ctx.fillStyle = '#4a3a5a'; ctx.fillRect(e.x - 4, e.y + 10, 12, e.h - 10); ctx.fillRect(e.x + e.w - 8, e.y + 10, 12, e.h - 10);
    ctx.strokeStyle = '#6a5a80'; ctx.lineWidth = 8; ctx.beginPath(); ctx.arc(cx, e.y + 24, e.w / 2 + 2, Math.PI, 0); ctx.stroke();
    const gr = ctx.createLinearGradient(0, e.y, 0, by); gr.addColorStop(0, 'rgba(255,230,140,.0)'); gr.addColorStop(1, 'rgba(255,230,140,.35)');
    ctx.fillStyle = gr; ctx.fillRect(e.x + 8, e.y + 20, e.w - 16, e.h - 20);
    ctx.translate(cx, e.y + 40 + Math.sin(t * 2) * 5);
    ctx.fillStyle = '#ffb46b'; ctx.beginPath(); ctx.moveTo(0, -18); ctx.quadraticCurveTo(12, 0, 0, 12); ctx.quadraticCurveTo(-12, 0, 0, -18); ctx.fill();
    ctx.fillStyle = '#fff4c4'; ctx.beginPath(); ctx.moveTo(0, -8); ctx.quadraticCurveTo(6, 2, 0, 8); ctx.quadraticCurveTo(-6, 2, 0, -8); ctx.fill();
    break;
   }
   case 'spring': {
    const k = e.stateT > 0 ? -6 : 0;
    ctx.fillStyle = '#3a2d40'; ctx.fillRect(e.x + 2, by - 6, e.w - 4, 6);
    ctx.strokeStyle = '#c0c8d8'; ctx.lineWidth = 2.5; ctx.beginPath();
    for (let i = 0; i <= 4; i++) { const yy = by - 6 - i * (6 + k * .3 + (e.stateT > 0 ? 3 : 0)) * .5; ctx.lineTo(cx + (i % 2 ? 8 : -8), yy); } ctx.stroke();
    ctx.fillStyle = '#ff6b8a'; ctx.beginPath(); ctx.roundRect(e.x, by - 16 - (e.stateT > 0 ? 8 : 0), e.w, 7, 3); ctx.fill();
    ctx.fillStyle = '#ffd0dc'; ctx.fillRect(e.x + 4, by - 15 - (e.stateT > 0 ? 8 : 0), e.w - 8, 2);
    break;
   }
   case 'boostR': case 'boostL': {
    const d = e.kind === 'boostR' ? 1 : -1;
    ctx.fillStyle = '#20384a'; ctx.beginPath(); ctx.roundRect(e.x, by - 8, e.w, 8, 3); ctx.fill();
    for (let i = 0; i < 3; i++) {
     const ph = ((time * 3 + i / 3) % 1);
     ctx.fillStyle = `rgba(159,247,255,${1 - ph})`;
     const ax = cx + d * (ph * 24 - 12) - d * 6;
     ctx.beginPath(); ctx.moveTo(ax + d * 8, by - 4); ctx.lineTo(ax, by - 8); ctx.lineTo(ax + d * 3, by - 4); ctx.lineTo(ax, by); ctx.closePath(); ctx.fill();
    }
    break;
   }
   case 'sign': {
    ctx.fillStyle = '#6d4a3a'; ctx.fillRect(cx - 2, by - 22, 4, 22);
    ctx.fillStyle = '#c99a6a'; ctx.beginPath(); ctx.roundRect(cx - 14, by - 34, 28, 18, 3); ctx.fill();
    ctx.fillStyle = '#4a2f24'; ctx.font = 'bold 13px system-ui'; ctx.textAlign = 'center'; ctx.fillText('?', cx, by - 20);
    if (s.sign === e.data && s.signT > 0) { ctx.fillStyle = '#fff6c8'; ctx.globalAlpha = .6 + .4 * Math.sin(time * 6); ctx.fillText('!', cx, by - 40); }
    break;
   }
   case 'lantern': {
    const sw = Math.sin(t * 2) * .12;
    ctx.translate(cx, e.y); ctx.rotate(sw);
    ctx.strokeStyle = '#2a2236'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(0, -12); ctx.lineTo(0, 2); ctx.stroke();
    ctx.fillStyle = '#3a2d40'; ctx.fillRect(-7, 2, 14, 4); ctx.fillRect(-6, e.h - 4, 12, 4);
    ctx.fillStyle = e.data === 1 ? '#ff8fc4' : '#ffb46b'; ctx.globalAlpha *= .9; ctx.beginPath(); ctx.roundRect(-6, 6, 12, e.h - 10, 3); ctx.fill();
    ctx.fillStyle = '#fff4c4'; ctx.beginPath(); ctx.ellipse(0, e.h / 2 + Math.sin(t * 9) * 1.2, 2.4, 4.5, 0, 0, Math.PI * 2); ctx.fill();
    break;
   }
   case 'bashNode': {
    const cy = e.y + e.h / 2;
    ctx.translate(cx, cy + Math.sin(t * 2) * 4);
    ctx.strokeStyle = '#ffe46b'; ctx.lineWidth = 2; ctx.globalAlpha = .6 + .3 * Math.sin(t * 4);
    ctx.beginPath(); ctx.arc(0, 0, 18 + Math.sin(t * 4) * 2, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1;
    ctx.rotate(t);
    ctx.fillStyle = '#ffd25a'; ctx.beginPath(); for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; ctx.lineTo(Math.cos(a) * 11, Math.sin(a) * 11); } ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#fffbe0'; ctx.beginPath(); ctx.arc(0, 0, 5, 0, Math.PI * 2); ctx.fill();
    break;
   }
   case 'platH': case 'platV': {
    ctx.fillStyle = pal.ledge; ctx.beginPath(); ctx.roundRect(e.x, e.y, e.w, e.h, 6); ctx.fill();
    ctx.fillStyle = pal.ledgeHi; ctx.fillRect(e.x + 4, e.y + 2, e.w - 8, 3);
    ctx.fillStyle = pal.lip; ctx.beginPath(); ctx.ellipse(cx, e.y + 1, e.w / 2 - 4, 4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#8ff7d0'; ctx.globalAlpha = .8; ctx.beginPath(); ctx.arc(cx, e.y + e.h - 3, 4, 0, Math.PI * 2); ctx.fill();
    break;
   }
   case 'walker': { // Thistlebug
    ctx.translate(cx, by); ctx.scale(-e.dir || 1, 1);
    const step = Math.sin(t * 14);
    ctx.strokeStyle = '#2a1830'; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
    for (let i = 0; i < 3; i++) { const lx = -8 + i * 8, sw = (i % 2 ? step : -step) * 3; ctx.beginPath(); ctx.moveTo(lx, -8); ctx.lineTo(lx + sw, -1); ctx.stroke(); }
    ctx.fillStyle = '#7a4a9a'; ctx.beginPath(); ctx.ellipse(0, -13, 15, 11, 0, Math.PI, 0); ctx.lineTo(15, -8); ctx.lineTo(-15, -8); ctx.fill();
    ctx.fillStyle = '#b07ad0'; ctx.beginPath(); ctx.ellipse(-3, -17, 8, 4, -.2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#d070c0'; for (let i = 0; i < 5; i++) { const a = Math.PI + .3 + i * .6; ctx.beginPath(); ctx.moveTo(Math.cos(a) * 12, -13 + Math.sin(a) * 9); ctx.lineTo(Math.cos(a) * 19, -13 + Math.sin(a) * 15); ctx.lineTo(Math.cos(a + .25) * 12, -13 + Math.sin(a + .25) * 9); ctx.fill(); }
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(-10, -12, 3.6, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#1a1020'; ctx.beginPath(); ctx.arc(-11, -12, 1.8, 0, Math.PI * 2); ctx.fill();
    break;
   }
   case 'hopper': { // Puffhop
    const sq = e.onGround ? 1 + Math.max(0, .25 - e.stateT) * .8 : .85;
    ctx.translate(cx, by); ctx.scale(sq, 1 / sq);
    ctx.fillStyle = '#e8f0ff'; ctx.beginPath(); ctx.arc(0, -14, 14, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 1.2;
    for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2 + t * .4; ctx.beginPath(); ctx.moveTo(Math.cos(a) * 12, -14 + Math.sin(a) * 12); ctx.lineTo(Math.cos(a) * 18, -14 + Math.sin(a) * 18); ctx.stroke(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(Math.cos(a) * 18, -14 + Math.sin(a) * 18, 1.6, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = '#5a4a7a'; ctx.beginPath(); ctx.arc(-5 * e.dir * -1, -16, 2.6, 0, Math.PI * 2); ctx.arc(4 * e.dir * -1 + 0, -16, 2.6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ff9ab8'; ctx.beginPath(); ctx.ellipse(-8, -10, 3, 1.6, 0, 0, Math.PI * 2); ctx.ellipse(8, -10, 3, 1.6, 0, 0, Math.PI * 2); ctx.fill();
    break;
   }
   case 'flyer': { // Duskwing
    const cy = e.y + e.h / 2, flap = Math.sin(t * (e.state === 'swoop' ? 26 : 14));
    ctx.translate(cx, cy); ctx.scale(e.dir || 1, 1);
    ctx.fillStyle = '#3b2a5a';
    for (const sd of [-1, 1]) { ctx.beginPath(); ctx.moveTo(0, -2); ctx.quadraticCurveTo(sd * 14, -14 - flap * 10, sd * 24, -4 - flap * 8); ctx.quadraticCurveTo(sd * 16, 2, sd * 20, 6 + flap * 3); ctx.quadraticCurveTo(sd * 8, 2, 0, 4); ctx.fill(); }
    ctx.fillStyle = '#56407e'; ctx.beginPath(); ctx.ellipse(0, 0, 8, 10, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffd25a'; ctx.beginPath(); ctx.arc(3, -2, 2.6, 0, Math.PI * 2); ctx.arc(-3, -2, 2.6, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#56407e'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(-3, -9); ctx.quadraticCurveTo(-8, -18, -4, -20); ctx.moveTo(3, -9); ctx.quadraticCurveTo(8, -18, 4, -20); ctx.stroke();
    break;
   }
   case 'turret': { // Spore pod
    const charge = clamp(e.stateT / 2.3, 0, 1);
    ctx.translate(cx, by);
    ctx.fillStyle = '#2f6a4a'; ctx.beginPath(); ctx.moveTo(-14, 0); ctx.quadraticCurveTo(-18, -14, -6, -22); ctx.lineTo(6, -22); ctx.quadraticCurveTo(18, -14, 14, 0); ctx.fill();
    ctx.fillStyle = '#4c9a5e'; ctx.beginPath(); ctx.ellipse(0, -22, 13 + charge * 2, 11 + charge * 2, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = `rgb(${Math.round(160 + charge * 80)},${Math.round(230 - charge * 40)},90)`; ctx.beginPath(); ctx.ellipse(e.dir * 4, -24, 6, 5 + charge * 2, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#d7ff7a'; for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(-10 + i * 7, -14, 1.6, 0, Math.PI * 2); ctx.fill(); }
    break;
   }
   case 'thornback': {
    ctx.translate(cx, by); ctx.scale(-e.dir || 1, 1);
    const step = Math.sin(t * 9);
    ctx.fillStyle = '#2a1820'; for (let i = 0; i < 2; i++) { ctx.beginPath(); ctx.ellipse(-10 + i * 18, -3, 5, 3 + (i ? step : -step), 0, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = '#5a2a38'; ctx.beginPath(); ctx.ellipse(0, -14, 20, 13, 0, Math.PI, 0); ctx.lineTo(20, -6); ctx.lineTo(-20, -6); ctx.fill();
    ctx.fillStyle = '#ff5a6e';
    for (let i = 0; i < 7; i++) { const a = Math.PI + .2 + i * .45; ctx.beginPath(); ctx.moveTo(Math.cos(a - .15) * 17, -12 + Math.sin(a - .15) * 11); ctx.lineTo(Math.cos(a) * 28, -12 + Math.sin(a) * 22); ctx.lineTo(Math.cos(a + .15) * 17, -12 + Math.sin(a + .15) * 11); ctx.fill(); }
    ctx.fillStyle = '#8a4a50'; ctx.beginPath(); ctx.ellipse(-18, -9, 7, 6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffd25a'; ctx.beginPath(); ctx.arc(-20, -10, 2.2, 0, Math.PI * 2); ctx.fill();
    break;
   }
  }
  ctx.restore();
 }

 function drawBoss(s: QuestState) {
  const B = s.boss; if (!B || B.state === 'dead') return;
  const cx = B.x + B.w / 2, cy = B.y + B.h / 2, t = time;
  ctx.save();
  if (B.state === 'dormant') ctx.globalAlpha = .55;
  if (B.hurt > 0 && Math.floor(B.hurt * 30) % 2 === 0) ctx.filter = 'brightness(2.2)';
  if (B.state === 'dying') { ctx.globalAlpha = Math.max(0, 1 - B.stateT / 2.6); ctx.translate((Math.random() - .5) * 8, (Math.random() - .5) * 8); }
  // tattered cloak
  ctx.fillStyle = '#1a1028';
  ctx.beginPath(); ctx.moveTo(cx - 38, cy - 30);
  for (let i = 0; i <= 8; i++) { const x = cx - 46 + i * 11.5, y = B.y + B.h + Math.sin(t * 4 + i) * 6 + (i % 2) * 10; ctx.lineTo(x, y); }
  ctx.lineTo(cx + 38, cy - 30); ctx.closePath(); ctx.fill();
  // armour shell
  ctx.fillStyle = '#4a3a62'; ctx.beginPath(); ctx.roundRect(cx - 34, cy - 40, 68, 66, 18); ctx.fill();
  ctx.fillStyle = '#6a5a88'; ctx.beginPath(); ctx.roundRect(cx - 34, cy - 40, 68, 14, [18, 18, 4, 4]); ctx.fill();
  // lantern heart cage
  ctx.strokeStyle = '#2a2040'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.ellipse(cx, cy - 6, 15, 19, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx, cy - 25); ctx.lineTo(cx, cy + 13); ctx.moveTo(cx - 15, cy - 6); ctx.lineTo(cx + 15, cy - 6); ctx.stroke();
  const tell = (B.state === 'swoop' && B.stateT < .7) || B.state === 'rise';
  ctx.fillStyle = tell ? '#ff5a6e' : B.phase === 2 ? '#ff8a5a' : '#ffd28a';
  ctx.beginPath(); ctx.ellipse(cx, cy - 6, 8 + Math.sin(t * 6) * 1.5, 11, 0, 0, Math.PI * 2); ctx.fill();
  // hood + eyes
  ctx.fillStyle = '#2a1f3a'; ctx.beginPath(); ctx.moveTo(cx - 26, cy - 40); ctx.quadraticCurveTo(cx, cy - 86, cx + 26, cy - 40); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#0c0814'; ctx.beginPath(); ctx.ellipse(cx, cy - 50, 15, 11, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = tell ? '#ff5a6e' : '#c79bff'; ctx.beginPath(); ctx.ellipse(cx - 6 + B.dir * 2, cy - 51, 3, 2, 0, 0, Math.PI * 2); ctx.ellipse(cx + 6 + B.dir * 2, cy - 51, 3, 2, 0, 0, Math.PI * 2); ctx.fill();
  // floating gauntlets
  for (const sd of [-1, 1]) {
   const hx = cx + sd * (52 + Math.sin(t * 2 + sd) * 6), hy = cy + Math.cos(t * 2.2 + sd) * 10 + (B.state === 'volley' ? -16 : 0);
   ctx.fillStyle = '#5a4a78'; ctx.beginPath(); ctx.roundRect(hx - 11, hy - 12, 22, 24, 7); ctx.fill();
   ctx.fillStyle = '#7a6a98'; ctx.fillRect(hx - 11, hy - 12, 22, 5);
   ctx.fillStyle = '#ffd28a'; ctx.beginPath(); ctx.arc(hx, hy + 3, 3, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
  // slam telegraph
  if (B.state === 'rise') { const floor = (B.y + B.h) + 0; ctx.fillStyle = `rgba(255,90,110,${.2 + .2 * Math.sin(t * 20)})`; ctx.beginPath(); ctx.ellipse(cx, (s.level.arena ? floorY(s) : floor) - 2, 50, 8, 0, 0, Math.PI * 2); ctx.fill(); }
 }
 function floorY(s: QuestState) { const A = s.level.arena!; for (let r = 0; r < level.h; r++) { const v = s.tiles[r * level.w + A.c0 + 2]; if (v === T.SOLID) return r * TILE; } return level.h * TILE; }

 function drawShot(sh: Shot) {
  ctx.save(); ctx.translate(sh.x, sh.y);
  const t = time * 10 + sh.id;
  if (sh.kind === 'spore') { ctx.fillStyle = sh.friendly ? '#ffe46b' : '#d7ff7a'; ctx.beginPath(); ctx.arc(0, 0, sh.r, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = sh.friendly ? '#fff' : '#5a8a2a'; for (let i = 0; i < 5; i++) { const a = t * .3 + i * 1.256; ctx.beginPath(); ctx.arc(Math.cos(a) * sh.r * .55, Math.sin(a) * sh.r * .55, 1.8, 0, Math.PI * 2); ctx.fill(); } }
  else if (sh.kind === 'warden') { ctx.fillStyle = sh.friendly ? '#ffe46b' : '#c79bff'; ctx.beginPath(); ctx.arc(0, 0, sh.r, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, 0, sh.r * .45, 0, Math.PI * 2); ctx.fill(); }
  else if (sh.kind === 'shock') { ctx.fillStyle = '#c79bff'; ctx.beginPath(); ctx.moveTo(-sh.r, 12); for (let i = 0; i <= 6; i++) ctx.lineTo(-sh.r + i * sh.r / 3, 12 - (i % 2 ? 26 + Math.sin(t + i) * 5 : 6)); ctx.lineTo(sh.r, 12); ctx.fill(); }
  else if (sh.kind === 'arc') { ctx.rotate(t * .5); ctx.fillStyle = traits.color; ctx.beginPath(); ctx.moveTo(0, -sh.r - 3); ctx.quadraticCurveTo(sh.r, 0, 0, sh.r); ctx.quadraticCurveTo(-sh.r, 0, 0, -sh.r - 3); ctx.fill(); ctx.fillStyle = '#fff4c4'; ctx.beginPath(); ctx.arc(0, 1, sh.r * .4, 0, Math.PI * 2); ctx.fill(); }
  else if (sh.kind === 'bolt') { ctx.strokeStyle = traits.color; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(-Math.sign(sh.vx) * 22, 0); for (let i = 1; i <= 4; i++) ctx.lineTo(-Math.sign(sh.vx) * (22 - i * 6), (i % 2 ? -5 : 5) * Math.sin(t + i)); ctx.stroke(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, 0, 4, 0, Math.PI * 2); ctx.fill(); }
  else if (sh.kind === 'ring') { ctx.rotate(t); ctx.strokeStyle = traits.color; ctx.lineWidth = 3.5; ctx.beginPath(); ctx.arc(0, 0, sh.r, 0, Math.PI * 1.6); ctx.stroke(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(0, 0, sh.r - 5, .5, Math.PI * 1.3); ctx.stroke(); }
  else if (sh.kind === 'wave') { ctx.fillStyle = traits.color; ctx.beginPath(); ctx.moveTo(-16, 10); ctx.quadraticCurveTo(-6, -18 + Math.sin(t) * 3, Math.sign(sh.vx) * 14, -6); ctx.quadraticCurveTo(4, 2, 16, 10); ctx.fill(); ctx.fillStyle = '#fff'; ctx.globalAlpha = .7; ctx.beginPath(); ctx.arc(Math.sign(sh.vx) * 8, -8, 3, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();
 }

 function drawPlayer(s: QuestState, dt: number) {
  const p = s.player;
  const cx = p.x + p.w / 2, feet = p.y + p.h;
  // afterimage trail
  const fast = p.dashT > 0 || Math.abs(p.vx) > 400 || p.rolling || p.bash;
  if (fast && p.dead <= 0) trail.push({ x: cx, y: feet, a: .55, f: p.facing, rot: p.rolling ? time * 26 * p.facing : 0 });
  for (const tr of trail) tr.a -= dt * 2.6;
  while (trail.length && trail[0].a <= 0) trail.shift();
  if (trail.length > 14) trail.splice(0, trail.length - 14);
  const H = 66, W = H * 300 / 360;
  const drawBody = (x: number, y: number, sx: number, sy: number, rot: number, alpha: number, tint?: string) => {
   if (!spriteReady) { ctx.save(); ctx.globalAlpha = alpha; ctx.fillStyle = char.color; ctx.beginPath(); ctx.ellipse(x, y - H * .4, W * .35, H * .4, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore(); return; }
   ctx.save(); ctx.globalAlpha = alpha; ctx.translate(x, y - (p.rolling ? 16 : 0)); ctx.rotate(rot);
   ctx.scale(sx, sy);
   if (tint) ctx.filter = tint;
   ctx.drawImage(sprite, -W / 2, p.rolling ? -H / 2 : -H + 2, W, H);
   ctx.restore();
  };
  for (let i = 0; i < trail.length; i += 2) { const tr = trail[i]; ctx.save(); ctx.globalCompositeOperation = 'lighter'; drawBody(tr.x, tr.y, tr.f * (p.rolling ? .62 : 1), p.rolling ? .62 : 1, tr.rot, tr.a * .4); ctx.restore(); }
  if (p.dead > 0) { drawBody(cx, feet, p.facing, 1, time * 10, clamp(p.dead, 0, 1)); return; }
  if (p.invuln > 0 && Math.floor(p.invuln * 18) % 2 === 0) return;
  // pose
  let sx = p.facing as number, sy = 1, rot = 0, bob = 0;
  const speed = Math.abs(p.vx);
  switch (p.anim) {
   case 'run': case 'sprint': bob = Math.abs(Math.sin(p.animT * (p.anim === 'sprint' ? 22 : 16))) * -4; rot = p.facing * clamp(speed / 2200, 0, .2); sy = 1 + Math.sin(p.animT * 32) * .03; break;
   case 'jump': sy = 1 + clamp(-p.vy / 3200, 0, .16); sx *= 1 - clamp(-p.vy / 5000, 0, .1); rot = p.facing * .06; break;
   case 'fall': sy = 1 + clamp(p.vy / 5000, 0, .08); rot = -p.facing * .05; break;
   case 'crouch': case 'rev': sy = .78; sx *= 1.12; break;
   case 'wall': rot = -p.wallDir * .14; break;
   case 'glide': rot = Math.sin(time * 4) * .08; bob = Math.sin(time * 6) * 1.5; break;
   case 'dash': sx *= 1.25; sy = .82; rot = p.facing * .18; break;
   case 'hurt': rot = -p.facing * .3; break;
   case 'bash': sy = .9; sx *= 1.08; break;
   case 'idle': sy = 1 + Math.sin(time * 3) * .025; break;
  }
  if (p.land > 0) { const k = p.land / .14; sy *= 1 - .2 * k; sx *= 1 + .18 * k; }
  if (p.rolling) {
   const r = 18;
   ctx.save(); ctx.translate(cx, feet - r);
   ctx.fillStyle = char.color; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
   ctx.rotate(time * 24 * p.facing);
   ctx.strokeStyle = char.accent; ctx.lineWidth = 3;
   for (let i = 0; i < 3; i++) { ctx.rotate(Math.PI * 2 / 3); ctx.beginPath(); ctx.arc(0, 0, r - 4, 0, 1.4); ctx.stroke(); }
   ctx.strokeStyle = char.fin; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, r - 10, 0, Math.PI * 1.2); ctx.stroke();
   ctx.restore();
   ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = traits.glow; ctx.globalAlpha = .5; ctx.lineWidth = 2.5;
   for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(cx - p.facing * (8 + i * 6), feet - r, r + 2 + i * 3, Math.PI * (p.facing > 0 ? .6 : -.4), Math.PI * (p.facing > 0 ? 1.4 : .4)); ctx.stroke(); }
   ctx.restore();
  } else {
   // glide canopy (a glowing leaf parasol)
   if (p.anim === 'glide') {
    ctx.save(); ctx.translate(cx, feet - H - 6 + bob); ctx.rotate(Math.sin(time * 4) * .12);
    ctx.fillStyle = traits.color; ctx.globalAlpha = .9;
    ctx.beginPath(); ctx.moveTo(-30, 6); ctx.quadraticCurveTo(0, -22, 30, 6); ctx.quadraticCurveTo(15, 0, 0, 8); ctx.quadraticCurveTo(-15, 0, -30, 6); ctx.fill();
    ctx.strokeStyle = traits.glow; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(0, 8); ctx.lineTo(0, -10); ctx.moveTo(0, -2); ctx.lineTo(-14, -2); ctx.moveTo(0, -2); ctx.lineTo(14, -2); ctx.stroke();
    ctx.restore();
   }
   // shadow
   const gy = feet;
   ctx.fillStyle = 'rgba(0,0,0,.22)'; if (p.onGround) { ctx.beginPath(); ctx.ellipse(cx, gy, 16 * Math.abs(sx), 4, 0, 0, Math.PI * 2); ctx.fill(); }
   drawBody(cx, feet + bob, sx, sy, rot, 1);
   if (p.hurtT > 0) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; drawBody(cx, feet + bob, sx, sy, rot, p.hurtT * 2); ctx.restore(); }
   // wall slide sparks
   if (p.anim === 'wall' && Math.random() < .4) particles.push({ x: cx + p.wallDir * 12, y: p.y + p.h * .3, vx: -p.wallDir * 30, vy: 40, life: .3, max: .3, size: 2, color: '#ffffff', kind: 'dot', rot: 0, g: 200, add: true });
   // spin charge glow
   if (p.spin > 0) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = traits.glow; ctx.lineWidth = 3; ctx.globalAlpha = .7; ctx.beginPath(); ctx.arc(cx, feet - 20, 20 + p.spin * 6, time * 20, time * 20 + 4); ctx.stroke(); ctx.restore(); }
  }
  // lash
  if (p.attackT > 0) {
   const k = 1 - p.attackT / MOVE.LASH_T, box = playerLashBox(s);
   ctx.save(); ctx.globalCompositeOperation = 'lighter';
   ctx.strokeStyle = traits.glow; ctx.lineCap = 'round';
   const ox = cx, oy = p.y + p.h * .38;
   const tipX = p.attackAim === 0 ? ox + p.facing * (MOVE.LASH_REACH + 6) * Math.min(1, k * 2.5) : ox + p.facing * 8;
   const tipY = p.attackAim === -1 ? box.y : p.attackAim === 1 ? box.y + box.h : oy;
   const sweep = Math.sin(k * Math.PI) * 26 * (p.attackAim === 0 ? -1 : p.facing);
   for (let pass = 0; pass < 2; pass++) {
    ctx.lineWidth = pass ? 2.5 : 8; ctx.globalAlpha = (pass ? 1 : .35) * (1 - k * .6);
    ctx.strokeStyle = pass ? '#ffffff' : traits.glow;
    ctx.beginPath(); ctx.moveTo(ox, oy);
    if (p.attackAim === 0) ctx.quadraticCurveTo(ox + p.facing * 30, oy + sweep, tipX, tipY);
    else ctx.quadraticCurveTo(ox + sweep, (oy + tipY) / 2, tipX, tipY + (p.attackAim === -1 ? 0 : 0) * (1 - k));
    ctx.stroke();
   }
   ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(tipX, tipY, 4, 0, Math.PI * 2); ctx.fill();
   ctx.restore();
  }
  // bash aim
  if (p.bash) {
   const tgt = p.bash.kind === 'shot' ? s.shots.find(x => x.id === p.bash!.target) : s.ents.find(x => x.id === p.bash!.target);
   const tx = tgt ? ('w' in tgt ? tgt.x + tgt.w / 2 : tgt.x) : cx, ty = tgt ? ('h' in tgt ? tgt.y + tgt.h / 2 : tgt.y) : feet - 30;
   ctx.save(); ctx.globalCompositeOperation = 'lighter';
   ctx.strokeStyle = '#ffe46b'; ctx.lineWidth = 3; ctx.globalAlpha = .8;
   ctx.beginPath(); ctx.arc(tx, ty, 34 + Math.sin(time * 20) * 3, 0, Math.PI * 2); ctx.stroke();
   const ax = p.bash.ax || 0, ay = p.bash.ay || -1, n = Math.hypot(ax, ay) || 1;
   ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(cx, feet - 30); ctx.lineTo(cx + ax / n * 80, feet - 30 + ay / n * 80); ctx.stroke();
   ctx.beginPath(); const hx = cx + ax / n * 90, hy = feet - 30 + ay / n * 90, a = Math.atan2(ay, ax);
   ctx.moveTo(hx, hy); ctx.lineTo(hx - Math.cos(a - .5) * 18, hy - Math.sin(a - .5) * 18); ctx.moveTo(hx, hy); ctx.lineTo(hx - Math.cos(a + .5) * 18, hy - Math.sin(a + .5) * 18); ctx.stroke();
   ctx.restore();
  }
 }

 function drawGlow(s: QuestState) {
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  const g = (img: HTMLCanvasElement, x: number, y: number, r: number, a: number) => { ctx.globalAlpha = a; ctx.drawImage(img, x - r, y - r, r * 2, r * 2); };
  const vx0 = cam.x - 100, vx1 = cam.x + vw + 100;
  for (const e of s.ents) {
   if (!e.alive || e.x < vx0 || e.x > vx1) continue;
   const cx = e.x + e.w / 2, cy = e.y + e.h / 2;
   if (e.kind === 'mote') g(glow.cool, cx, cy, 22, .55);
   else if (e.kind === 'seed') g(glow.warm, cx, cy, 56, .8);
   else if (e.kind === 'lantern') g(glow.warm, cx, cy, 70, .55 + .1 * Math.sin(time * 9 + e.id));
   else if (e.kind === 'checkpoint') g(e.state === 'lit' ? glow.cool : glow.white, cx, e.y + 18, e.state === 'lit' ? 90 : 26, e.state === 'lit' ? .7 : .15);
   else if (e.kind === 'goal') g(glow.warm, cx, e.y + 40, 160, .75);
   else if (e.kind === 'bashNode') g(glow.warm, cx, cy, 70, .65);
   else if (e.kind === 'turret') g(glow.cool, cx, e.y + 8, 30, .3);
   else if (e.kind === 'flyer') g(glow.warm, cx, cy, 20, .4);
   else if (e.kind === 'petal' || e.kind === 'spark') g(glow.warm, cx, cy, 34, .5);
   else if (e.kind === 'platH' || e.kind === 'platV') g(glow.cool, cx, e.y + e.h, 26, .5);
  }
  for (const sh of s.shots) g(sh.friendly ? glow.kith : sh.kind === 'spore' ? glow.cool : glow.violet, sh.x, sh.y, sh.r * 4, .8);
  const p = s.player;
  g(glow.kith, p.x + p.w / 2, p.y + p.h / 2, p.topSpeed || p.dashT > 0 ? 120 : 90, level.biome === 'falls' ? .25 : .5);
  if (s.boss && s.boss.state !== 'dead' && s.boss.state !== 'dormant') g(s.boss.phase === 2 ? glow.red : glow.warm, s.boss.x + s.boss.w / 2, s.boss.y + s.boss.h / 2 - 6, 130, .7);
  ctx.restore();
 }

 function drawParticles(dt: number) {
  for (let i = particles.length - 1; i >= 0; i--) {
   const q = particles[i];
   q.life -= dt; if (q.life <= 0) { particles.splice(i, 1); continue; }
   q.vy += q.g * dt; q.x += q.vx * dt; q.y += q.vy * dt; q.rot += dt * 6;
   if (q.kind === 'streak') { q.vx *= .9; q.vy *= .9; }
  }
  if (particles.length > 600) particles.splice(0, particles.length - 600);
  for (const q of particles) {
   const a = clamp(q.life / q.max, 0, 1);
   ctx.save();
   ctx.globalAlpha = a; if (q.add) ctx.globalCompositeOperation = 'lighter';
   ctx.fillStyle = q.color; ctx.strokeStyle = q.color;
   switch (q.kind) {
    case 'dot': ctx.beginPath(); ctx.arc(q.x, q.y, q.size * (q.add ? a : 1), 0, Math.PI * 2); ctx.fill(); break;
    case 'star': ctx.translate(q.x, q.y); ctx.rotate(q.rot); ctx.beginPath(); for (let k = 0; k < 8; k++) { const r = k % 2 ? q.size * .4 : q.size; ctx.lineTo(Math.cos(k * Math.PI / 4) * r, Math.sin(k * Math.PI / 4) * r); } ctx.closePath(); ctx.fill(); break;
    case 'leaf': ctx.translate(q.x, q.y); ctx.rotate(q.rot); ctx.beginPath(); ctx.ellipse(0, 0, q.size, q.size * .5, 0, 0, Math.PI * 2); ctx.fill(); break;
    case 'shard': ctx.translate(q.x, q.y); ctx.rotate(q.rot); ctx.fillRect(-q.size / 2, -q.size / 2, q.size, q.size * .7); break;
    case 'ring': ctx.lineWidth = 3 * a; ctx.beginPath(); ctx.arc(q.x, q.y, q.size * (1.2 - a * .9), 0, Math.PI * 2); ctx.stroke(); break;
    case 'streak': ctx.lineWidth = q.size * .6; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(q.x, q.y); ctx.lineTo(q.x - q.vx * .06, q.y - q.vy * .06); ctx.stroke(); break;
    case 'text': ctx.font = `900 ${q.size}px "Fredoka", "Baloo 2", system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(20,10,30,.8)'; ctx.strokeText(q.text!, q.x, q.y); ctx.fillText(q.text!, q.x, q.y); break;
   }
   ctx.restore();
  }
 }

 // ambient motes in screen space (fireflies / mist / embers)
 const ambient = Array.from({ length: 40 }, (_, i) => ({ x: Math.random(), y: Math.random(), z: .3 + Math.random() * .9, ph: Math.random() * 6, i }));
 function drawAmbient() {
  const W = canvas.width, H = canvas.height;
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (const a of ambient) {
   let x = (a.x * W - cam.x * a.z * scale * .6) % W; if (x < 0) x += W;
   let y = (a.y * H - cam.y * a.z * scale * .3 + (pal.ambient === 'embers' ? -time * 30 * a.z * scale : pal.ambient === 'mist' ? time * 8 * scale : 0)) % H; if (y < 0) y += H;
   const tw = .5 + .5 * Math.sin(time * 2 + a.ph);
   const r = (pal.ambient === 'mist' ? 26 : 10) * a.z * scale;
   ctx.globalAlpha = (pal.ambient === 'mist' ? .08 : .55) * tw;
   ctx.drawImage(pal.ambient === 'embers' ? glow.warm : pal.ambient === 'mist' ? glow.white : glow.cool, x + Math.sin(time + a.ph) * 10 * scale - r, y - r, r * 2, r * 2);
  }
  ctx.restore();
 }
 // foreground silhouettes (parallax > 1) for depth
 const fg = buildForeground(level.biome, pal);
 function drawForeground() {
  const W = canvas.width, H = canvas.height, f = 1.4;
  const h = H * .5, w = fg.width * (h / fg.height), gap = Math.max(W * 1.6, w * 3);
  const ox = -((cam.x * f * scale) % gap);
  ctx.save(); ctx.globalAlpha = .85;
  for (let x = ox - gap; x < W + w; x += gap) ctx.drawImage(fg, x, H - h * .92, w, h);
  ctx.restore();
 }
 function vignette() {
  const W = canvas.width, H = canvas.height;
  const g = ctx.createRadialGradient(W / 2, H * .55, H * .35, W / 2, H * .55, H * .95);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, level.biome === 'falls' ? 'rgba(10,30,50,.35)' : 'rgba(5,0,15,.55)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
 }

 return {
  resize,
  shake(n: number) { cam.shake = Math.max(cam.shake, n); },
  render(s: QuestState, dt: number) {
   time += dt;
   consume(s);
   updateCamera(s, dt);
   ctx.setTransform(1, 0, 0, 1, 0, 0);
   drawSky(s);
   worldToScreen();
   // back-layer ents (platforms, signs, checkpoints, goal) then terrain, then actors
   for (const e of s.ents) if (e.alive && (e.kind === 'goal' || e.kind === 'checkpoint' || e.kind === 'sign' || e.kind === 'lantern') && e.x > cam.x - 120 && e.x < cam.x + vw + 120) drawEnt(s, e);
   drawTerrain(s);
   for (const e of s.ents) if (e.alive && !(e.kind === 'goal' || e.kind === 'checkpoint' || e.kind === 'sign' || e.kind === 'lantern') && e.x > cam.x - 120 && e.x < cam.x + vw + 120) drawEnt(s, e);
   drawBoss(s);
   for (const sh of s.shots) drawShot(sh);
   drawPlayer(s, dt);
   drawParticles(dt);
   drawGlow(s);
   ctx.setTransform(1, 0, 0, 1, 0, 0);
   drawAmbient();
   drawForeground();
   vignette();
   // shared flash for big moments
   if (s.boss && s.boss.state === 'dying') { ctx.fillStyle = `rgba(255,240,210,${Math.max(0, .5 - s.boss.stateT * .2) * (Math.random() > .5 ? 1 : .4)})`; ctx.fillRect(0, 0, canvas.width, canvas.height); }
  },
  dispose() { chunks.clear(); particles.length = 0; },
 };
}

/* ------------------------- procedural layers ------------------------- */
function buildLayers(biome: Biome, pal: Palette, W: number, H: number): HTMLCanvasElement[] {
 const rnd = mulberry(biome === 'moss' ? 11 : biome === 'falls' ? 23 : 37);
 const mk = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; };
 const out: HTMLCanvasElement[] = [];
 // far
 {
  const c = mk(), g = c.getContext('2d')!;
  g.fillStyle = pal.far;
  if (biome === 'keep') {
   g.beginPath(); g.moveTo(0, H);
   for (let x = 0; x <= W; x += 40) g.lineTo(x, H * .62 + Math.sin(x * .01) * 30 + Math.sin(x * .031) * 14);
   g.lineTo(W, H); g.fill();
   for (const tx of [180, 620, 1100, 1420]) { const tw = 60 + rnd() * 50, th = 260 + rnd() * 160; g.fillRect(tx, H - th - 120, tw, th + 120); g.beginPath(); g.moveTo(tx - 10, H - th - 120); g.lineTo(tx + tw / 2, H - th - 220 - rnd() * 60); g.lineTo(tx + tw + 10, H - th - 120); g.fill();
    g.fillStyle = '#ffd28a'; for (let k = 0; k < 4; k++) if (rnd() > .3) g.fillRect(tx + tw * (.3 + rnd() * .4), H - th - 80 + k * 50, 6, 10); g.fillStyle = pal.far; }
  } else {
   g.beginPath(); g.moveTo(0, H);
   const peaks = biome === 'falls' ? 9 : 6;
   for (let i = 0; i <= peaks; i++) {
    const x = i / peaks * W, top = biome === 'falls' ? H * (.18 + rnd() * .3) : H * (.35 + rnd() * .2);
    if (biome === 'falls') { g.lineTo(x - 40, H * .7); g.lineTo(x - 22, top + 30); g.lineTo(x - 8, top); g.lineTo(x + 10, top + 24); g.lineTo(x + 30, H * .7); }
    else g.quadraticCurveTo(x - W / peaks / 2, top, x, H * (.5 + rnd() * .15));
   }
   g.lineTo(W, H); g.closePath(); g.fill();
  }
  out.push(c);
 }
 // mid
 {
  const c = mk(), g = c.getContext('2d')!;
  g.fillStyle = pal.mid;
  if (biome === 'moss') {
   for (let i = 0; i < 9; i++) {
    const x = i / 9 * W + rnd() * 80, w = 40 + rnd() * 40;
    g.beginPath(); g.moveTo(x - w * .7, H); g.quadraticCurveTo(x - w * .4, H * .5, x - w * .25, 0); g.lineTo(x + w * .25, 0); g.quadraticCurveTo(x + w * .4, H * .5, x + w * .7, H); g.fill();
    // branches + canopy blobs
    for (let k = 0; k < 4; k++) { const by = H * (.1 + k * .14), d = k % 2 ? 1 : -1; g.beginPath(); g.moveTo(x, by + 20); g.quadraticCurveTo(x + d * 60, by, x + d * 110, by - 20); g.lineTo(x + d * 110, by - 10); g.quadraticCurveTo(x + d * 50, by + 14, x, by + 34); g.fill(); }
    g.globalAlpha = .9; for (let k = 0; k < 6; k++) { g.beginPath(); g.arc(x + (rnd() - .5) * 220, rnd() * H * .3, 50 + rnd() * 60, 0, Math.PI * 2); g.fill(); } g.globalAlpha = 1;
    // hanging glow vines
    g.strokeStyle = 'rgba(143,247,208,.35)'; g.lineWidth = 2; for (let k = 0; k < 3; k++) { const vx = x + (rnd() - .5) * 140; g.beginPath(); g.moveTo(vx, H * .15); g.quadraticCurveTo(vx + 10, H * .35, vx - 4, H * (.4 + rnd() * .2)); g.stroke(); }
   }
   g.fillRect(0, H * .86, W, H * .14);
  } else if (biome === 'falls') {
   for (let i = 0; i < 7; i++) { const x = i / 7 * W + rnd() * 100, w = 50 + rnd() * 70, top = H * (.2 + rnd() * .35); g.beginPath(); g.moveTo(x - w, H); g.lineTo(x - w * .5, top + 40); g.lineTo(x - w * .2, top); g.lineTo(x + w * .3, top + 20); g.lineTo(x + w * .6, top + 70); g.lineTo(x + w, H); g.fill();
    g.fillStyle = '#5fbf98'; g.beginPath(); g.ellipse(x, top + 6, w * .5, 12, 0, Math.PI, 0); g.fill(); g.fillStyle = pal.mid; }
   g.fillRect(0, H * .8, W, H * .2);
  } else {
   for (let i = 0; i < 6; i++) { const x = i / 6 * W + 40; g.fillRect(x, H * .3, 36, H * .7); g.fillRect(x + 160, H * .3, 36, H * .7); g.beginPath(); g.moveTo(x, H * .32); g.quadraticCurveTo(x + 98, H * .05, x + 196, H * .32); g.lineTo(x + 176, H * .32); g.quadraticCurveTo(x + 98, H * .14, x + 36, H * .32); g.fill(); }
   g.fillRect(0, H * .82, W, H * .18);
   g.fillStyle = 'rgba(255,180,110,.25)'; for (let i = 0; i < 6; i++) { g.beginPath(); g.arc(i / 6 * W + 138, H * .55, 4, 0, Math.PI * 2); g.fill(); }
  }
  out.push(c);
 }
 // near
 {
  const c = mk(), g = c.getContext('2d')!;
  g.fillStyle = pal.near;
  g.beginPath(); g.moveTo(0, H);
  for (let x = 0; x <= W; x += 20) g.lineTo(x, H * .8 + Math.sin(x * .013) * 22 + Math.sin(x * .041) * 10);
  g.lineTo(W, H); g.fill();
  if (biome !== 'keep') {
   for (let i = 0; i < 14; i++) { const x = rnd() * W, h = 60 + rnd() * 120; g.beginPath(); g.moveTo(x - 8, H); g.quadraticCurveTo(x - 30, H - h * .6, x - 4, H - h); g.quadraticCurveTo(x + 20, H - h * .5, x + 8, H); g.fill(); }
  } else {
   for (let i = 0; i < 10; i++) { const x = rnd() * W; g.fillRect(x, H * .7, 10, H * .3); g.beginPath(); g.moveTo(x - 6, H * .7); g.lineTo(x + 5, H * .64); g.lineTo(x + 16, H * .7); g.fill(); }
  }
  out.push(c);
 }
 return out;
}

function buildForeground(biome: Biome, pal: Palette) {
 const c = document.createElement('canvas'); c.width = 600; c.height = 500;
 const g = c.getContext('2d')!, rnd = mulberry(99);
 g.fillStyle = biome === 'falls' ? 'rgba(20,50,60,.85)' : 'rgba(6,4,12,.92)';
 if (biome === 'keep') {
  g.fillRect(40, 0, 46, 500); g.fillRect(20, 0, 86, 30); g.beginPath(); g.moveTo(86, 30); g.quadraticCurveTo(220, 40, 300, 0); g.lineTo(86, 0); g.fill();
  g.strokeStyle = 'rgba(6,4,12,.9)'; g.lineWidth = 3; g.beginPath(); g.moveTo(180, 0); g.lineTo(180, 120); g.stroke(); g.beginPath(); g.arc(180, 130, 10, 0, Math.PI * 2); g.stroke();
 } else {
  for (let i = 0; i < 7; i++) { const x = 20 + rnd() * 160, h = 180 + rnd() * 220; g.beginPath(); g.moveTo(x - 14, 500); g.quadraticCurveTo(x - 50, 500 - h * .6, x - 10 + rnd() * 20, 500 - h); g.quadraticCurveTo(x + 40, 500 - h * .5, x + 14, 500); g.fill(); }
  g.beginPath(); g.ellipse(100, 500, 140, 60, 0, Math.PI, 0); g.fill();
 }
 return c;
}
