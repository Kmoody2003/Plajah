// motifsFun — illustrated motifs for kids, gatherings and adult parties.
// Flat, geometric, friendly: every character is a handful of Tela shapes so it stays editable in Tela and
// animates by tag (see eviteBuild). Drawn in a 400x400 design space centred in the art box.
import { Kit, type Box, type Motif, mixHex, alphaHex, curve, leafPts, starPts, ngon, grad, radial, poly } from './eviteBuild';
import type { EvitePalette } from '../../evite/eviteTypes';

interface D { k: Kit; p: EvitePalette; a: Box; x: (v: number) => number; y: (v: number) => number; s: (v: number) => number }
const mk = (k: Kit, a: Box, p: EvitePalette): D => { const sc = Math.min(a.w, a.h) / 400; return { k, p, a, x: v => a.cx + (v - 200) * sc, y: v => a.cy + (v - 200) * sc, s: v => v * sc }; };
const pts = (d: D, arr: number[]) => arr.map((v, i) => i % 2 ? d.y(v) : d.x(v));
const W_ = '#ffffff';

// ── shared bits ──
function cloud(d: D, cx: number, cy: number, sc = 1, c = W_, fx: 'drift' | undefined = 'drift') {
  const { k } = d; const r = 22 * sc;
  k.ellipse(d.x(cx - r * 1.9), d.y(cy - r * .2), d.s(r * 2.4), d.s(r * 1.5), c, { opacity: .92, fx });
  k.ellipse(d.x(cx - r * .9), d.y(cy - r * 1.0), d.s(r * 2.2), d.s(r * 2), c, { opacity: .92 });
  k.ellipse(d.x(cx + r * .1), d.y(cy - r * .35), d.s(r * 2.6), d.s(r * 1.6), c, { opacity: .92 });
}
function sparkles(d: D, n: number, color = W_, region?: Box) {
  const r = region || d.a;
  for (let i = 0; i < n; i++) { const x = r.x + d.k.rng.next() * r.w, y = r.y + d.k.rng.next() * r.h, s = d.s(4 + d.k.rng.next() * 8); d.k.star(x, y, s, color, { fx: 'twinkle', opacity: .55 + d.k.rng.next() * .4 }); }
}
function balloon(d: D, cx: number, cy: number, r: number, color: string, fx: 'float' | 'sway' = 'float') {
  const { k } = d; const rr = d.s(r);
  k.stroke(curve([d.x(cx), d.y(cy) + rr * 1.15, d.x(cx) - d.s(6), d.y(cy) + rr * 1.9, d.x(cx) + d.s(5), d.y(cy) + rr * 2.7]), alphaHex('#000000', .35), 1.4);
  k.poly([d.x(cx) - rr * .12, d.y(cy) + rr * 1.1, d.x(cx) + rr * .12, d.y(cy) + rr * 1.1, d.x(cx), d.y(cy) + rr * .95], mixHex(color, -.25));
  k.ellipse(d.x(cx) - rr * .86, d.y(cy) - rr, rr * 1.72, rr * 2.05, color, { fx });
  k.ellipse(d.x(cx) - rr * .5, d.y(cy) - rr * .7, rr * .28, rr * .5, W_, { opacity: .38, rotation: 20 });
}
function hills(d: D, c1: string, c2: string, y0 = 300) {
  const { k, a } = d;
  k.ellipse(a.x - d.s(80), d.y(y0 + 10), a.w * .8, d.s(300), c2);
  k.ellipse(a.x + a.w * .3, d.y(y0 + 30), a.w * .9, d.s(300), c1);
}
function eye(d: D, cx: number, cy: number, r = 9, ink = '#1b1226') { d.k.circle(d.x(cx), d.y(cy), d.s(r), ink); d.k.circle(d.x(cx) + d.s(r * .3), d.y(cy) - d.s(r * .3), d.s(r * .35), W_); }
function smile(d: D, cx: number, cy: number, w: number, color = '#1b1226', t = 5) { d.k.stroke(curve([d.x(cx - w), d.y(cy), d.x(cx), d.y(cy + w * .55), d.x(cx + w), d.y(cy)]), color, d.s(t)); }
function wheel(d: D, cx: number, cy: number, r: number, tire = '#1b1226', hub = '#d7d7e0') { d.k.circle(d.x(cx), d.y(cy), d.s(r), tire); const h = d.k.circle(d.x(cx), d.y(cy), d.s(r * .5), hub); for (let i = 0; i < 4; i++) d.k.line(d.x(cx), d.y(cy), d.x(cx) + d.s(r * .5) * Math.cos(i * Math.PI / 2), d.y(cy) + d.s(r * .5) * Math.sin(i * Math.PI / 2), tire, d.s(2.4), { fx: 'spin' }); void h; }
function sunRays(d: D, cx: number, cy: number, r: number, color: string) { const { k } = d; for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; k.line(d.x(cx) + d.s(r * 1.25) * Math.cos(a), d.y(cy) + d.s(r * 1.25) * Math.sin(a), d.x(cx) + d.s(r * 1.7) * Math.cos(a), d.y(cy) + d.s(r * 1.7) * Math.sin(a), color, d.s(5), { fx: 'pulse' }); } k.circle(d.x(cx), d.y(cy), d.s(r), color); }

// ═══ KIDS · BOYS ═══
const dino: Motif = (k, a, p) => {
  const d = mk(k, a, p); sunRays(d, 330, 70, 30, p.glow); cloud(d, 90, 80, 1);
  hills(d, mixHex(p.accent, -.15), mixHex(p.accent, -.35), 300);
  for (const [x, y] of [[40, 340], [350, 350]]) { k.ellipse(d.x(x), d.y(y), d.s(26), d.s(34), p.glow, { rotation: -10 }); k.poly(pts(d, [x + 4, y + 16, x + 12, y + 8, x + 20, y + 18, x + 22, y + 26, x + 6, y + 26]), mixHex(p.glow, -.2)); }
  k.poly(pts(d, [70, 270, 20, 300, 110, 290]), p.accent2, { fx: 'sway' });                            // tail
  k.ellipse(d.x(60), d.y(190), d.s(240), d.s(150), p.accent2);                                      // body
  k.ellipse(d.x(120), d.y(240), d.s(150), d.s(60), mixHex(p.glow, .5), { opacity: .9 });             // belly
  for (let i = 0; i < 5; i++) k.poly(pts(d, [100 + i * 34, 196 - i * 4, 118 + i * 34, 150 - i * 6 + (i % 2) * 8, 136 + i * 34, 196 - i * 4]), p.glow, { fx: 'bob' });   // plates
  k.rect(d.x(120), d.y(290), d.s(34), d.s(60), mixHex(p.accent2, -.2), { rx: d.s(12) });            // legs
  k.rect(d.x(220), d.y(290), d.s(34), d.s(60), mixHex(p.accent2, -.2), { rx: d.s(12) });
  k.ellipse(d.x(240), d.y(110), d.s(110), d.s(150), p.accent2, { rotation: 18 });                    // neck
  k.ellipse(d.x(238), d.y(70), d.s(130), d.s(90), p.accent2);                                        // head
  eye(d, 296, 92, 10); k.circle(d.x(345), d.y(96), d.s(4), mixHex(p.accent2, -.4)); smile(d, 318, 124, 26);
  sparkles(d, 5, W_, box4(a));
};
const box4 = (a: Box): Box => ({ ...a, h: a.h * .5 });

const rocket: Motif = (k, a, p) => {
  const d = mk(k, a, p); sparkles(d, 14);
  k.circle(d.x(80), d.y(90), d.s(34), p.accent, { fx: 'float' }); k.ellipse(d.x(30), d.y(82), d.s(100), d.s(16), 'none', { stroke: p.glow, strokeWidth: d.s(4), rotation: -18 });
  k.circle(d.x(330), d.y(300), d.s(26), p.accent2, { fx: 'float' }); k.circle(d.x(322), d.y(292), d.s(8), mixHex(p.accent2, -.25));
  k.poly(pts(d, [160, 330, 200, 420, 240, 330]), p.glow, { fx: 'flicker' }); k.poly(pts(d, [178, 330, 200, 392, 222, 330]), W_, { fx: 'flicker', opacity: .85 });
  k.poly(pts(d, [150, 300, 100, 340, 130, 240]), p.accent); k.poly(pts(d, [250, 300, 300, 340, 270, 240]), p.accent);
  k.ellipse(d.x(150), d.y(80), d.s(100), d.s(260), W_, { fx: 'bob' });
  k.poly(pts(d, [150, 140, 200, 30, 250, 140]), p.accent, { fx: 'bob' });
  k.circle(d.x(200), d.y(190), d.s(30), mixHex(p.accent2, -.2)); k.circle(d.x(200), d.y(190), d.s(22), mixHex(p.bg2, .25)); k.ellipse(d.x(190), d.y(178), d.s(10), d.s(14), W_, { opacity: .6, rotation: 30 });
  k.rect(d.x(150), d.y(250), d.s(100), d.s(14), p.accent);
};
const truck: Motif = (k, a, p) => {
  const d = mk(k, a, p); cloud(d, 90, 70); cloud(d, 300, 110, .8); k.rect(a.x, d.y(330), a.w, d.s(120), mixHex(p.ink, .15), { opacity: .9 });
  for (let i = 0; i < 6; i++) k.rect(d.x(10 + i * 70), d.y(372), d.s(36), d.s(5), W_, { opacity: .8 });
  k.poly(pts(d, [60, 190, 250, 190, 270, 270, 40, 270]), p.accent2);                                   // tipper bed
  for (const [x, y, r] of [[90, 176, 22], [140, 170, 26], [190, 174, 24], [230, 180, 18]]) k.circle(d.x(x), d.y(y), d.s(r), mixHex(p.ink, .35));
  k.rect(d.x(30), d.y(266), d.s(250), d.s(40), p.ink, { rx: d.s(8) });
  k.rect(d.x(280), d.y(190), d.s(96), d.s(116), p.accent, { rx: d.s(14) });                            // cab
  k.rect(d.x(296), d.y(206), d.s(60), d.s(46), mixHex(p.bg2, .55), { rx: d.s(8) }); k.rect(d.x(366), d.y(270), d.s(18), d.s(20), p.glow, { rx: d.s(6) });
  wheel(d, 90, 314, 34); wheel(d, 230, 314, 34); wheel(d, 330, 314, 30);
  for (let i = 0; i < 3; i++) k.circle(d.x(20 - i * 12), d.y(300 - i * 8), d.s(10 + i * 4), W_, { opacity: .4 - i * .1, fx: 'drift' });
};
const soccer: Motif = (k, a, p) => {
  const d = mk(k, a, p); hills(d, mixHex(p.accent, -.1), mixHex(p.accent, -.3), 290);
  for (let i = 0; i < 6; i++) k.line(d.x(40 + i * 12), d.y(120), d.x(40 + i * 12), d.y(290), W_, d.s(2), { opacity: .6 }); for (let i = 0; i < 8; i++) k.line(d.x(40), d.y(120 + i * 22), d.x(112), d.y(120 + i * 22), W_, d.s(2), { opacity: .6 });
  k.stroke(pts(d, [40, 290, 40, 120, 112, 120, 112, 290]), W_, d.s(6));
  k.stroke(curve(pts(d, [140, 330, 190, 210, 270, 150, 330, 120])), W_, d.s(4), { dash: [8, 8], opacity: .7 });
  k.circle(d.x(220), d.y(236), d.s(96), W_, { fx: 'bob' }); k.poly(pts(d, ngon(220, 236, 34, 5).map((v, i) => v)), p.ink);
  for (let i = 0; i < 5; i++) { const a2 = (-90 + i * 72) * Math.PI / 180; const px = 220 + 66 * Math.cos(a2), py = 236 + 66 * Math.sin(a2); k.poly(pts(d, ngon(px, py, 18, 5, -90 + i * 72 + 36)), p.ink); k.line(d.x(220 + 34 * Math.cos(a2)), d.y(236 + 34 * Math.sin(a2)), d.x(px), d.y(py), p.ink, d.s(3)); }
  k.star(d.x(320), d.y(70), d.s(24), p.glow, { fx: 'pulse', points: 5, inner: .5 }); sparkles(d, 6);
};
const pirate: Motif = (k, a, p) => {
  const d = mk(k, a, p); sunRays(d, 320, 80, 26, p.glow);
  k.stroke(pts(d, [200, 70, 200, 290]), mixHex(p.ink, .2), d.s(8));
  k.poly(pts(d, [206, 80, 330, 190, 206, 250]), W_, { fx: 'sway' }); k.poly(pts(d, [194, 100, 90, 190, 194, 250]), mixHex(W_, -.08), { fx: 'sway' });
  k.circle(d.x(268), d.y(176), d.s(14), p.ink); k.line(d.x(256), d.y(192), d.x(280), d.y(200), p.ink, d.s(3)); k.line(d.x(256), d.y(200), d.x(280), d.y(192), p.ink, d.s(3));
  k.poly(pts(d, [200, 70, 256, 84, 200, 98]), p.accent, { fx: 'wave' });
  k.poly(pts(d, [60, 270, 340, 270, 300, 340, 100, 340]), mixHex(p.accent2, -.35)); k.rect(d.x(60), d.y(262), d.s(280), d.s(12), p.accent2);
  for (let i = 0; i < 4; i++) k.circle(d.x(120 + i * 50), d.y(304), d.s(8), p.glow);
  for (let i = 0; i < 3; i++) k.stroke(curve(pts(d, [-10 + i * 0, 340 + i * 22, 70, 322 + i * 22, 140, 340 + i * 22, 210, 322 + i * 22, 280, 340 + i * 22, 350, 322 + i * 22, 410, 340 + i * 22])), alphaHex(W_, .7 - i * .15), d.s(5), { fx: 'wave' });
};
const hero: Motif = (k, a, p) => {
  const d = mk(k, a, p);
  k.poly(pts(d, [0, 330, 0, 250, 40, 250, 40, 200, 80, 200, 80, 260, 120, 260, 120, 170, 160, 170, 160, 330]), alphaHex(p.ink, .55)); k.poly(pts(d, [240, 330, 240, 220, 290, 220, 290, 160, 330, 160, 330, 240, 400, 240, 400, 330]), alphaHex(p.ink, .55));
  for (let i = 0; i < 7; i++) k.rect(d.x(250 + (i % 3) * 22), d.y(240 + Math.floor(i / 3) * 30), d.s(8), d.s(12), p.glow, { fx: 'twinkle' });
  for (let i = 0; i < 6; i++) k.line(d.x(20), d.y(120 + i * 22), d.x(120 - i * 6), d.y(120 + i * 22), W_, d.s(3), { opacity: .5, fx: 'drift' });
  k.poly(pts(d, [140, 150, 260, 150, 330, 330, 70, 330]), p.accent2, { fx: 'sway' });                    // cape
  k.poly(pts(d, starPts(200, 210, 110, 8, .55)), p.glow, { fx: 'pulse' });
  k.poly(pts(d, [120, 130, 280, 130, 280, 230, 200, 320, 120, 230]), p.accent);
  k.poly(pts(d, [140, 150, 260, 150, 260, 224, 200, 296, 140, 224]), mixHex(p.accent, -.18));
  k.poly(pts(d, [214, 160, 176, 226, 202, 226, 190, 280, 232, 210, 206, 210]), p.glow);
  k.poly(pts(d, [30, 60, 52, 20, 74, 60, 56, 60, 70, 110, 38, 62]), p.glow, { fx: 'flicker' });
};
const robot: Motif = (k, a, p) => {
  const d = mk(k, a, p);
  for (const [x, y, r] of [[60, 80, 26], [340, 300, 34]]) { k.circle(d.x(x), d.y(y), d.s(r), 'none', { stroke: p.glow, strokeWidth: d.s(8), fx: 'spin' }); k.circle(d.x(x), d.y(y), d.s(r * .35), p.glow); }
  k.stroke(pts(d, [200, 40, 200, 80]), p.ink, d.s(6)); k.circle(d.x(200), d.y(36), d.s(12), p.accent, { fx: 'pulse' });
  k.rect(d.x(110), d.y(80), d.s(180), d.s(140), p.accent2, { rx: d.s(34) }); k.rect(d.x(124), d.y(96), d.s(152), d.s(108), mixHex(p.bg2, -.1), { rx: d.s(24) });
  k.circle(d.x(166), d.y(138), d.s(20), p.glow, { fx: 'pulse' }); k.circle(d.x(234), d.y(138), d.s(20), p.glow, { fx: 'pulse' }); k.circle(d.x(166), d.y(138), d.s(8), p.ink); k.circle(d.x(234), d.y(138), d.s(8), p.ink);
  for (let i = 0; i < 5; i++) k.rect(d.x(160 + i * 16), d.y(176), d.s(10), d.s(14), W_, { rx: d.s(2) });
  k.rect(d.x(70), d.y(120), d.s(30), d.s(60), p.accent, { rx: d.s(12) }); k.rect(d.x(300), d.y(120), d.s(30), d.s(60), p.accent, { rx: d.s(12) });
  k.rect(d.x(130), d.y(226), d.s(140), d.s(120), p.accent, { rx: d.s(24) }); k.circle(d.x(200), d.y(284), d.s(26), p.glow); k.star(d.x(200), d.y(284), d.s(16), p.ink, { points: 5, inner: .5 });
  k.rect(d.x(60), d.y(240), d.s(70), d.s(24), p.accent2, { rx: d.s(12), rotation: -20, fx: 'sway' }); k.rect(d.x(270), d.y(240), d.s(70), d.s(24), p.accent2, { rx: d.s(12), rotation: 20, fx: 'sway' });
  k.rect(d.x(146), d.y(346), d.s(36), d.s(40), p.accent2, { rx: d.s(8) }); k.rect(d.x(218), d.y(346), d.s(36), d.s(40), p.accent2, { rx: d.s(8) });
};
const shark: Motif = (k, a, p) => {
  const d = mk(k, a, p);
  for (let i = 0; i < 9; i++) k.circle(d.x(40 + (i * 43) % 320), d.y(340 - ((i * 71) % 260)), d.s(5 + (i % 3) * 3), W_, { opacity: .5, fx: 'rise' });
  k.poly(pts(d, curve([40, 230, 70, 170, 160, 150, 260, 170, 340, 220, 380, 190, 370, 250, 380, 300, 340, 270, 260, 290, 160, 300, 80, 280])), p.accent2, { fx: 'bob' });
  k.poly(pts(d, curve([60, 250, 160, 290, 260, 280, 330, 250, 260, 262, 160, 270])), mixHex(W_, -.05), { opacity: .95 });
  k.poly(pts(d, [170, 154, 190, 80, 232, 164]), mixHex(p.accent2, -.2), { fx: 'sway' });
  k.poly(pts(d, [200, 270, 240, 336, 240, 280]), mixHex(p.accent2, -.2));
  eye(d, 98, 216, 8); for (let i = 0; i < 5; i++) k.poly(pts(d, [56 + i * 14, 246, 62 + i * 14, 260, 68 + i * 14, 246]), W_);
  for (let i = 0; i < 3; i++) k.stroke(curve(pts(d, [-10, 338 + i * 16, 70, 322 + i * 16, 140, 338 + i * 16, 210, 322 + i * 16, 280, 338 + i * 16, 350, 322 + i * 16, 410, 338 + i * 16])), alphaHex(W_, .55), d.s(4), { fx: 'wave' });
};
const jungle: Motif = (k, a, p) => {
  const d = mk(k, a, p); sunRays(d, 320, 70, 28, p.glow);
  const leaf = (bx: number, by: number, tx: number, ty: number, c: string, bulge: number) => { k.poly(pts(d, leafPts(bx, by, tx, ty, bulge)), c, { fx: 'sway' }); k.stroke(pts(d, [bx, by, tx, ty]), mixHex(c, -.3), d.s(3)); };
  leaf(60, 400, 40, 120, p.accent, 60); leaf(60, 400, 150, 150, mixHex(p.accent, -.2), 50); leaf(340, 400, 360, 130, p.accent, -60); leaf(340, 400, 250, 160, mixHex(p.accent, -.2), -50); leaf(200, 400, 200, 190, mixHex(p.accent, .12), 44);
  k.ellipse(d.x(150), d.y(220), d.s(100), d.s(120), p.accent2, { fx: 'bob' }); k.ellipse(d.x(166), d.y(250), d.s(70), d.s(80), mixHex(W_, -.05)); k.circle(d.x(186), d.y(206), d.s(44), p.accent2);
  eye(d, 196, 198, 8); k.poly(pts(d, [212, 200, 262, 214, 214, 232]), p.glow); k.poly(pts(d, [140, 336, 120, 376, 160, 340]), p.accent);
  k.stroke(pts(d, [150, 300, 150, 340]), p.ink, d.s(6));
};
const knight: Motif = (k, a, p) => {
  const d = mk(k, a, p); sparkles(d, 8); hills(d, mixHex(p.accent, -.2), mixHex(p.accent, -.4), 320);
  k.rect(d.x(100), d.y(150), d.s(200), d.s(180), mixHex(p.bg2, .5)); for (const x of [80, 280]) { k.rect(d.x(x), d.y(100), d.s(40), d.s(230), mixHex(p.bg2, .38)); k.poly(pts(d, [x - 6, 100, x + 20, 46, x + 46, 100]), p.accent, { }); for (let i = 0; i < 3; i++) k.rect(d.x(x + 2 + i * 14), d.y(88), d.s(10), d.s(14), mixHex(p.bg2, .38)); }
  k.stroke(pts(d, [200, 60, 200, 150]), p.ink, d.s(4)); k.poly(pts(d, [200, 62, 250, 78, 200, 94]), p.accent2, { fx: 'wave' });
  for (let i = 0; i < 5; i++) k.rect(d.x(104 + i * 40), d.y(138), d.s(26), d.s(16), mixHex(p.bg2, .5));
  k.rect(d.x(168), d.y(240), d.s(64), d.s(90), p.ink, { rx: d.s(32) });
  k.poly(pts(d, [20, 250, 80, 250, 80, 320, 50, 350, 20, 320]), p.accent2); k.poly(pts(d, [50, 262, 70, 290, 50, 330, 30, 290]), p.glow);
  k.line(d.x(350), d.y(240), d.x(350), d.y(350), W_, d.s(8)); k.rect(d.x(334), d.y(300), d.s(32), d.s(8), p.glow); k.rect(d.x(346), d.y(308), d.s(8), d.s(26), p.glow);
};
const racecar: Motif = (k, a, p) => {
  const d = mk(k, a, p); for (let i = 0; i < 6; i++) k.line(d.x(10), d.y(120 + i * 28), d.x(120 - (i % 2) * 40), d.y(120 + i * 28), W_, d.s(4), { opacity: .5, fx: 'drift' });
  for (let r = 0; r < 2; r++) for (let c = 0; c < 10; c++) k.rect(d.x(20 + c * 36), d.y(330 + r * 18), d.s(18), d.s(18), (c + r) % 2 ? p.ink : W_);
  k.poly(pts(d, [50, 280, 70, 220, 150, 200, 200, 150, 280, 150, 320, 210, 372, 230, 380, 280]), p.accent, { fx: 'bob' });
  k.poly(pts(d, [160, 210, 202, 168, 270, 168, 300, 210]), mixHex(p.bg2, .55)); k.rect(d.x(40), d.y(270), d.s(350), d.s(16), p.ink, { rx: d.s(8) });
  k.circle(d.x(230), d.y(236), d.s(26), W_); k.text(d.x(212), d.y(222), d.s(40), '7', { size: d.s(34), font: 'bangers', color: p.ink, align: 'center', wrap: false, label: 'Number' });
  k.rect(d.x(40), d.y(160), d.s(36), d.s(8), p.ink); k.rect(d.x(48), d.y(166), d.s(6), d.s(60), p.ink);
  wheel(d, 110, 292, 40); wheel(d, 316, 292, 40); k.poly(pts(d, [380, 270, 396, 262, 396, 280]), p.glow, { fx: 'flicker' });
};
const ninja: Motif = (k, a, p) => {
  const d = mk(k, a, p); k.circle(d.x(300), d.y(90), d.s(54), mixHex(p.glow, .2), { fx: 'pulse' });
  for (const x of [40, 90, 330, 366]) { k.rect(d.x(x), d.y(60), d.s(16), d.s(350), mixHex(p.accent, -.1)); for (const y of [140, 230, 320]) k.rect(d.x(x - 3), d.y(y), d.s(22), d.s(6), mixHex(p.accent, -.35)); }
  k.circle(d.x(200), d.y(210), d.s(96), p.ink); k.rect(d.x(120), d.y(180), d.s(160), d.s(54), mixHex(W_, -.05), { rx: d.s(26) });
  k.circle(d.x(166), d.y(206), d.s(11), p.ink); k.circle(d.x(234), d.y(206), d.s(11), p.ink); k.circle(d.x(170), d.y(202), d.s(4), W_); k.circle(d.x(238), d.y(202), d.s(4), W_);
  k.rect(d.x(104), d.y(150), d.s(192), d.s(20), p.accent); k.poly(pts(d, [290, 150, 340, 120, 322, 168]), p.accent, { fx: 'wave' }); k.poly(pts(d, [290, 160, 350, 170, 300, 182]), p.accent, { fx: 'wave' });
  k.poly(pts(d, starPts(70, 330, 34, 4, .35)), '#c9ccd6', { fx: 'spin' }); k.circle(d.x(70), d.y(330), d.s(6), p.ink); k.poly(pts(d, starPts(340, 330, 24, 4, .35)), '#c9ccd6', { fx: 'spin' });
};

// ═══ KIDS · GIRLS ═══
const unicorn: Motif = (k, a, p) => {
  const d = mk(k, a, p); const rb = [p.accent, p.glow, '#8de3b0', p.accent2, '#b794f6'];
  rb.forEach((c, i) => k.ellipse(d.x(20 + i * 14), d.y(120 + i * 14), d.s(360 - i * 28), d.s(320 - i * 28), 'none', { stroke: c, strokeWidth: d.s(12), opacity: .85 }));
  sparkles(d, 12, W_);
  k.poly(pts(d, curve([126, 130, 60, 190, 92, 260, 70, 330, 140, 300, 130, 230, 150, 180])), p.accent2, { fx: 'sway' });
  k.poly(pts(d, curve([140, 150, 90, 210, 150, 240, 120, 290])), p.accent, { fx: 'sway', opacity: .9 });
  k.poly(pts(d, [168, 120, 200, 18, 232, 120]), p.glow, { fx: 'pulse' }); for (let i = 0; i < 3; i++) k.line(d.x(176 + i * 4), d.y(100 - i * 26), d.x(226 - i * 4), d.y(86 - i * 26), mixHex(p.glow, -.25), d.s(3));
  k.poly(pts(d, [150, 130, 164, 80, 188, 128]), W_); k.poly(pts(d, [214, 128, 242, 80, 252, 134]), W_); k.poly(pts(d, [158, 126, 166, 98, 180, 126]), p.accent, { opacity: .7 });
  k.ellipse(d.x(140), d.y(110), d.s(140), d.s(190), W_, { fx: 'bob' }); k.ellipse(d.x(170), d.y(230), d.s(110), d.s(90), W_);
  eye(d, 196, 190, 11, p.ink); k.circle(d.x(176), d.y(236), d.s(8), p.accent, { opacity: .6 }); k.circle(d.x(232), d.y(236), d.s(8), p.accent, { opacity: .6 }); smile(d, 204, 252, 14, p.ink, 4);
  k.circle(d.x(176), d.y(226), d.s(14), p.accent, { opacity: .35 });
};
const princess: Motif = (k, a, p) => {
  const d = mk(k, a, p); sparkles(d, 14, W_); cloud(d, 70, 90, .9); cloud(d, 330, 130, .7);
  const tower = (x: number, y: number, w: number, h: number, c: number) => { k.rect(d.x(x), d.y(y), d.s(w), d.s(h), mixHex(p.bg2, .55)); k.poly(pts(d, [x - 8, y, x + w / 2, y - c, x + w + 8, y]), p.accent); k.ellipse(d.x(x + w / 2 - 10), d.y(y + 24), d.s(20), d.s(34), mixHex(p.accent2, -.1), { rx: 0 }); };
  tower(70, 190, 70, 170, 90); tower(260, 190, 70, 170, 90); k.rect(d.x(130), d.y(220), d.s(140), d.s(140), mixHex(p.bg2, .6)); tower(160, 120, 80, 100, 100);
  k.stroke(pts(d, [200, 20, 200, 6]), p.ink, d.s(3)); k.poly(pts(d, [200, 6, 238, 18, 200, 30]), p.glow, { fx: 'wave' });
  k.rect(d.x(168), d.y(280), d.s(64), d.s(80), mixHex(p.accent, -.25), { rx: d.s(32) }); k.rect(d.x(168), d.y(320), d.s(64), d.s(40), mixHex(p.accent, -.25));
  k.poly(pts(d, [150, 90, 170, 60, 200, 80, 230, 60, 250, 90]), p.glow, { fx: 'pulse' });
  hills(d, mixHex(p.accent2, .1), mixHex(p.accent2, -.1), 340);
};
const mermaid: Motif = (k, a, p) => {
  const d = mk(k, a, p);
  for (let i = 0; i < 10; i++) k.circle(d.x(50 + (i * 53) % 310), d.y(350 - (i * 67) % 290), d.s(5 + (i % 4) * 3), W_, { opacity: .5, fx: 'rise' });
  k.poly(pts(d, curve([150, 170, 190, 220, 170, 290, 130, 340, 190, 380, 120, 400])), p.accent, { fx: 'sway' });
  k.poly(pts(d, curve([150, 170, 230, 170, 250, 250, 210, 330, 150, 340, 140, 250])), p.accent2, { fx: 'sway' });
  for (let i = 0; i < 12; i++) k.circle(d.x(170 + (i % 3) * 22), d.y(200 + Math.floor(i / 3) * 34), d.s(11), W_, { opacity: .25 });
  k.poly(pts(d, curve([160, 340, 100, 330, 60, 380, 90, 400, 150, 380])), p.glow, { fx: 'sway' }); k.poly(pts(d, curve([200, 340, 260, 330, 300, 380, 270, 400, 210, 380])), p.glow, { fx: 'sway' });
  const sx = 300, sy = 130; for (let i = 0; i < 7; i++) k.ellipse(d.x(sx - 12 - i * 2), d.y(sy), d.s(24 + i * 3), d.s(80), i % 2 ? mixHex(p.glow, .1) : p.glow, { rotation: -60 + i * 20, opacity: .95 });
  k.circle(d.x(sx), d.y(sy + 56), d.s(10), W_); k.circle(d.x(sx), d.y(sy + 56), d.s(6), mixHex(p.accent, .4), { fx: 'pulse' });
  for (let i = 0; i < 3; i++) k.stroke(curve(pts(d, [-10, 360 + i * 16, 70, 344 + i * 16, 140, 360 + i * 16, 210, 344 + i * 16, 280, 360 + i * 16, 350, 344 + i * 16, 410, 360 + i * 16])), alphaHex(W_, .6), d.s(4), { fx: 'wave' });
};
const fairy: Motif = (k, a, p) => {
  const d = mk(k, a, p);
  for (let i = 0; i < 16; i++) k.circle(d.x(30 + (i * 79) % 340), d.y(30 + (i * 53) % 270), d.s(3 + (i % 3)), p.glow, { fx: 'twinkle' });
  hills(d, mixHex(p.accent2, -.1), mixHex(p.accent2, -.28), 320);
  const shroom = (x: number, y: number, r: number, c: string) => { k.rect(d.x(x - r * .22), d.y(y), d.s(r * .44), d.s(r * 1.1), mixHex(W_, -.1), { rx: d.s(8) }); k.ellipse(d.x(x - r), d.y(y - r * .8), d.s(r * 2), d.s(r * 1.6), c, { fx: 'bob' }); for (const [dx, dy, rr] of [[-.4, -.2, .2], [.3, -.4, .15], [.1, 0, .12]]) k.circle(d.x(x + r * dx), d.y(y - r * .2 + r * dy * 1), d.s(r * rr), W_, { opacity: .9 }); };
  shroom(120, 270, 80, p.accent); shroom(280, 300, 56, p.accent2); shroom(60, 330, 34, p.glow);
  for (const [x, y, c] of [[220, 330, p.glow], [340, 340, p.accent], [170, 350, p.accent2]] as const) { k.stroke(pts(d, [x, y + 40, x, y]), '#4a8f5c', d.s(4)); for (let i = 0; i < 5; i++) { const a2 = i * 1.256; k.circle(d.x(x + 11 * Math.cos(a2)), d.y(y + 11 * Math.sin(a2)), d.s(8), c); } k.circle(d.x(x), d.y(y), d.s(6), W_); }
  k.ellipse(d.x(250), d.y(90), d.s(34), d.s(70), alphaHex(W_, .7), { rotation: 30, fx: 'sway' }); k.ellipse(d.x(280), d.y(90), d.s(34), d.s(70), alphaHex(W_, .7), { rotation: -30, fx: 'sway' }); k.circle(d.x(268), d.y(108), d.s(14), p.accent2); k.circle(d.x(268), d.y(130), d.s(18), p.accent);
};
const butterfly: Motif = (k, a, p) => {
  const d = mk(k, a, p);
  for (const sgn of [-1, 1]) {
    const cx = (v: number) => d.x(200 + sgn * v);
    k.ellipse(sgn < 0 ? cx(150) : cx(0), d.y(70), d.s(150), d.s(150), p.accent, { rotation: sgn * 28, fx: 'sway' });
    k.ellipse(sgn < 0 ? cx(120) : cx(0), d.y(190), d.s(120), d.s(120), p.accent2, { rotation: -sgn * 24, fx: 'sway' });
    k.circle(cx(84), d.y(142), d.s(18), W_, { opacity: .8 }); k.circle(cx(70), d.y(234), d.s(12), W_, { opacity: .8 }); k.circle(cx(110), d.y(112), d.s(8), p.glow);
  }
  k.ellipse(d.x(190), d.y(110), d.s(20), d.s(170), p.ink, { }); k.circle(d.x(200), d.y(108), d.s(14), p.ink);
  k.stroke(curve(pts(d, [196, 100, 176, 50, 150, 36])), p.ink, d.s(3)); k.stroke(curve(pts(d, [204, 100, 224, 50, 250, 36])), p.ink, d.s(3));
  for (const [x, y, c] of [[60, 320, p.glow], [140, 350, p.accent], [260, 340, p.glow], [340, 320, p.accent2]] as const) { k.stroke(pts(d, [x, y + 60, x, y]), '#4a8f5c', d.s(4)); for (let i = 0; i < 5; i++) k.circle(d.x(x + 12 * Math.cos(i * 1.256)), d.y(y + 12 * Math.sin(i * 1.256)), d.s(9), c); k.circle(d.x(x), d.y(y), d.s(6), W_); }
  sparkles(d, 8, W_);
};
const ballet: Motif = (k, a, p) => {
  const d = mk(k, a, p);
  k.poly(pts(d, [0, 0, 120, 0, 60, 90, 80, 380, 0, 380]), p.accent, { fx: 'sway' }); k.poly(pts(d, [400, 0, 280, 0, 340, 90, 320, 380, 400, 380]), p.accent, { fx: 'sway' });
  k.poly(pts(d, [200, 0, 130, 380, 270, 380]), alphaHex(p.glow, .22), { fx: 'pulse' });
  for (let i = 0; i < 4; i++) k.ellipse(d.x(120 - i * 6), d.y(280 + i * 14), d.s(160 + i * 12), d.s(40), i % 2 ? p.accent2 : mixHex(p.accent2, .2), { opacity: .95 });
  k.ellipse(d.x(150), d.y(250), d.s(100), d.s(34), mixHex(W_, -.05));
  k.rect(d.x(186), d.y(120), d.s(28), d.s(132), mixHex('#f4c9a8', -.05), { rx: d.s(12) }); k.circle(d.x(200), d.y(100), d.s(26), '#f4c9a8'); k.circle(d.x(200), d.y(72), d.s(14), p.ink);
  k.line(d.x(188), d.y(140), d.x(130), d.y(80), '#f4c9a8', d.s(10), { fx: 'sway' }); k.line(d.x(212), d.y(140), d.x(270), d.y(80), '#f4c9a8', d.s(10), { fx: 'sway' });
  sparkles(d, 10, p.glow); k.rect(d.x(40), d.y(372), d.s(320), d.s(16), mixHex(p.ink, .2), { rx: d.s(4) });
};
const bakery: Motif = (k, a, p) => {
  const d = mk(k, a, p); sparkles(d, 6, W_);
  const mac = (x: number, y: number, c: string) => { k.ellipse(d.x(x), d.y(y), d.s(60), d.s(24), c); k.rect(d.x(x + 4), d.y(y + 18), d.s(52), d.s(8), W_, { rx: d.s(3) }); k.ellipse(d.x(x), d.y(y + 20), d.s(60), d.s(24), c); };
  mac(20, 320, p.accent); mac(320, 330, p.glow); mac(280, 300, p.accent2);
  k.poly(pts(d, [110, 220, 290, 220, 262, 360, 138, 360]), p.accent2); for (let i = 0; i < 6; i++) k.line(d.x(122 + i * 28), d.y(222), d.x(145 + i * 20), d.y(358), mixHex(p.accent2, -.2), d.s(4));
  k.ellipse(d.x(100), d.y(180), d.s(200), d.s(80), W_); k.ellipse(d.x(120), d.y(130), d.s(160), d.s(76), mixHex(p.accent, .35)); k.ellipse(d.x(150), d.y(86), d.s(100), d.s(66), p.accent, { fx: 'bob' });
  k.poly(pts(d, [186, 52, 200, 20, 214, 52]), p.accent);
  k.circle(d.x(200), d.y(36), d.s(18), '#d4264e', { fx: 'bob' }); k.stroke(curve(pts(d, [200, 30, 210, 6, 232, 0])), '#4a8f5c', d.s(3));
  const sprinkle = ['#ffd23f', '#6ee7b7', '#60a5fa', W_]; for (let i = 0; i < 14; i++) k.rect(d.x(112 + (i * 37) % 170), d.y(100 + (i * 29) % 80), d.s(10), d.s(4), sprinkle[i % 4], { rotation: (i * 47) % 180, rx: d.s(2) });
};
const rainbow: Motif = (k, a, p) => {
  const d = mk(k, a, p); const cols = ['#ff5a76', '#ff9f43', '#ffd23f', '#52d681', '#4cc3ff', '#9b7bff'];
  cols.forEach((c, i) => k.ellipse(d.x(30 + i * 16), d.y(60 + i * 16), d.s(340 - i * 32), d.s(380 - i * 32), 'none', { stroke: c, strokeWidth: d.s(17), opacity: .96 }));
  k.rect(a.x, d.y(260), a.w, d.s(200), p.bg, { opacity: 1 }); cloud(d, 70, 290, 1.5); cloud(d, 330, 290, 1.5);
  for (const [x, y, s] of [[200, 330, 16], [120, 350, 10], [280, 350, 10]] as const) k.circle(d.x(x), d.y(y), d.s(s), p.accent, { fx: 'bob' });
  sparkles(d, 10, p.glow);
};
const kitty: Motif = (k, a, p) => {
  const d = mk(k, a, p); for (let i = 0; i < 5; i++) k.circle(d.x(30 + i * 85), d.y(40 + (i % 2) * 40), d.s(10), p.accent, { opacity: .6, fx: 'float' });
  k.poly(pts(d, [96, 150, 110, 60, 180, 120]), W_); k.poly(pts(d, [304, 150, 290, 60, 220, 120]), W_); k.poly(pts(d, [112, 128, 118, 84, 152, 118]), p.accent, { opacity: .6 }); k.poly(pts(d, [288, 128, 282, 84, 248, 118]), p.accent, { opacity: .6 });
  k.ellipse(d.x(70), d.y(110), d.s(260), d.s(220), W_, { fx: 'bob' });
  eye(d, 150, 210, 12, p.ink); eye(d, 250, 210, 12, p.ink); k.ellipse(d.x(188), d.y(232), d.s(24), d.s(16), p.accent2); smile(d, 188, 252, 14, p.ink, 4);
  for (const sg of [-1, 1]) for (let i = 0; i < 3; i++) k.line(d.x(200 + sg * 52), d.y(238 + i * 10), d.x(200 + sg * (130 + i * 6)), d.y(222 + i * 20), p.ink, d.s(2.4));
  k.circle(d.x(124), d.y(244), d.s(14), p.accent, { opacity: .45 }); k.circle(d.x(276), d.y(244), d.s(14), p.accent, { opacity: .45 });
  k.poly(pts(d, [200, 130, 150, 100, 150, 150]), p.accent, { fx: 'pulse' }); k.poly(pts(d, [200, 130, 250, 100, 250, 150]), p.accent, { fx: 'pulse' }); k.circle(d.x(200), d.y(128), d.s(12), mixHex(p.accent, -.2));
  k.circle(d.x(330), d.y(340), d.s(40), p.accent2, { fx: 'bob' }); for (let i = 0; i < 3; i++) k.stroke(curve(pts(d, [296 + i * 8, 330 + i * 12, 330, 310 + i * 14, 364 - i * 6, 340 + i * 10])), mixHex(p.accent2, -.25), d.s(2.5));
};
const art: Motif = (k, a, p) => {
  const d = mk(k, a, p);
  for (const [x, y, r, c] of [[50, 90, 36, p.accent], [330, 70, 28, p.glow], [350, 330, 40, p.accent2], [60, 330, 30, p.glow]] as const) { k.circle(d.x(x), d.y(y), d.s(r), c, { opacity: .85, fx: 'pulse' }); for (let i = 0; i < 5; i++) k.circle(d.x(x + (r + 6) * Math.cos(i * 1.3)), d.y(y + (r + 6) * Math.sin(i * 1.3)), d.s(4), c, { opacity: .85 }); }
  k.poly(pts(d, curve([60, 200, 90, 130, 190, 110, 300, 140, 340, 220, 300, 300, 200, 320, 140, 290, 90, 270])), '#f3d9b1', { fx: 'bob' });
  k.circle(d.x(260), d.y(260), d.s(26), p.bg, { });
  [[110, 190, p.accent], [160, 150, p.glow], [230, 140, p.accent2], [290, 180, '#52d681'], [300, 240, '#4cc3ff']].forEach(([x, y, c]) => k.ellipse(d.x(x as number) - d.s(20), d.y(y as number) - d.s(16), d.s(40), d.s(32), c as string));
  k.rect(d.x(290), d.y(40), d.s(14), d.s(190), '#8a5a2b', { rotation: 24, rx: d.s(6), fx: 'sway' }); k.rect(d.x(310), d.y(16), d.s(14), d.s(40), '#c9ccd6', { rotation: 24, rx: d.s(6) }); k.poly(pts(d, [318, 10, 338, 0, 332, 22]), p.accent);
};
const carousel: Motif = (k, a, p) => {
  const d = mk(k, a, p); sparkles(d, 12, p.glow);
  k.poly(pts(d, [40, 130, 360, 130, 200, 20]), p.accent); for (let i = 0; i < 8; i++) k.circle(d.x(54 + i * 42), d.y(140), d.s(22), i % 2 ? W_ : p.accent2);
  for (let i = 0; i < 5; i++) k.rect(d.x(66 + i * 66), d.y(150), d.s(8), d.s(200), p.glow, { }); k.rect(d.x(34), d.y(346), d.s(332), d.s(28), p.accent2, { rx: d.s(10) });
  [[110, 270], [200, 230], [290, 270]].forEach(([x, y], i) => { k.ellipse(d.x(x - 34), d.y(y - 20), d.s(68), d.s(40), i % 2 ? W_ : mixHex(W_, -.06), { fx: 'bob' }); k.rect(d.x(x + 14), d.y(y - 50), d.s(18), d.s(40), W_, { rx: d.s(8), rotation: 20, fx: 'bob' }); k.circle(d.x(x + 32), d.y(y - 50), d.s(12), W_); k.rect(d.x(x - 26), d.y(y + 14), d.s(10), d.s(30), W_); k.rect(d.x(x + 12), d.y(y + 14), d.s(10), d.s(30), W_); k.poly(pts(d, [x - 34, y - 14, x - 54, y + 6, x - 34, y + 8]), p.accent); });
  k.circle(d.x(200), d.y(14), d.s(14), p.glow, { fx: 'pulse' });
};
const popstar: Motif = (k, a, p) => {
  const d = mk(k, a, p);
  for (let i = 0; i < 5; i++) k.poly(pts(d, [40 + i * 80, 0, 20 + i * 80, 350, 90 + i * 80, 350]), alphaHex(i % 2 ? p.glow : p.accent, .26), { fx: 'pulse' });
  k.rect(d.x(30), d.y(360), d.s(340), d.s(22), p.ink, { rx: d.s(6) });
  k.ellipse(d.x(150), d.y(70), d.s(100), d.s(100), '#e8e8f0'); for (let i = 1; i < 5; i++) k.line(d.x(150), d.y(70 + i * 20), d.x(250), d.y(70 + i * 20), '#a8a8bb', d.s(2));
  k.rect(d.x(188), d.y(160), d.s(26), d.s(150), p.accent2, { rx: d.s(12) }); k.rect(d.x(180), d.y(300), d.s(42), d.s(50), p.ink, { rx: d.s(8) }); k.rect(d.x(176), d.y(150), d.s(50), d.s(14), p.glow, { rx: d.s(6) });
  for (const [x, y, s] of [[60, 120, 22], [340, 150, 26], [320, 60, 16], [80, 250, 14]] as const) k.poly(pts(d, starPts(x, y, s, 5, .45)), p.glow, { fx: 'twinkle' });
  k.text(d.x(60), d.y(300), d.s(60), '♪', { size: d.s(52), font: 'inter', color: p.accent, wrap: false, fx: 'float', label: 'Note' }); k.text(d.x(290), d.y(250), d.s(60), '♫', { size: d.s(52), font: 'inter', color: p.glow, wrap: false, fx: 'float', label: 'Note' });
};

// ═══ GATHERINGS ═══
const balloons: Motif = (k, a, p) => { const d = mk(k, a, p); [[90, 150, 52, p.accent], [200, 110, 62, p.glow], [310, 160, 54, p.accent2], [150, 250, 40, mixHex(p.accent2, .2)], [260, 260, 42, mixHex(p.accent, .2)]].forEach(([x, y, r, c], i) => balloon(d, x as number, y as number, r as number, c as string, i % 2 ? 'sway' : 'float')); sparkles(d, 10, W_); };
const potluck: Motif = (k, a, p) => {
  const d = mk(k, a, p); k.rect(a.x, d.y(260), a.w, d.s(200), mixHex(p.accent, -.2)); for (let i = 0; i < 9; i++) k.rect(d.x(i * 46), d.y(260), d.s(23), d.s(200), alphaHex(W_, .12));
  [[110, 250, 66, p.accent2], [290, 250, 66, p.glow]].forEach(([x, y, r, c]) => { k.ellipse(d.x((x as number) - (r as number)), d.y(y as number) - d.s(20), d.s((r as number) * 2), d.s(40), W_); k.ellipse(d.x((x as number) - (r as number) + 8), d.y(y as number) - d.s(24), d.s((r as number) * 2 - 16), d.s(28), c as string); });
  k.rect(d.x(166), d.y(170), d.s(68), d.s(70), W_, { rx: d.s(10) }); k.ellipse(d.x(160), d.y(160), d.s(80), d.s(26), p.accent); for (let i = 0; i < 4; i++) k.circle(d.x(176 + i * 16), d.y(170), d.s(6), W_);
  for (let i = 0; i < 3; i++) k.stroke(curve(pts(d, [140 + i * 56, 140, 128 + i * 56, 110, 150 + i * 56, 80, 138 + i * 56, 50])), alphaHex(W_, .55), d.s(4), { fx: 'rise' });
  sparkles(d, 6, W_, box4(a));
};
const stringlights: Motif = (k, a, p) => {
  const d = mk(k, a, p); for (let r = 0; r < 3; r++) { const y0 = 60 + r * 100; const wire = curve(pts(d, [-10, y0, 100, y0 + 40, 200, y0 + 10, 300, y0 + 44, 410, y0])); k.stroke(wire, alphaHex(p.ink, .6), d.s(2)); for (let i = 1; i < 9; i++) { const px = wire[Math.floor(wire.length / 2 / 9 * i) * 2], py = wire[Math.floor(wire.length / 2 / 9 * i) * 2 + 1]; const c = [p.accent, p.glow, p.accent2][(i + r) % 3]; k.circle(px, py + d.s(14), d.s(30), alphaHex(c, .2), { fx: 'flicker' }); k.ellipse(px - d.s(7), py, d.s(14), d.s(20), c, { fx: 'flicker' }); } }
  k.circle(d.x(200), d.y(340), d.s(70), alphaHex(p.glow, .3), { fx: 'pulse' });
};
const confettiBurst: Motif = (k, a, p) => {
  const d = mk(k, a, p); const cols = [p.accent, p.glow, p.accent2, W_, mixHex(p.accent, .35)];
  k.poly(pts(d, starPts(200, 210, 130, 12, .55)), alphaHex(p.glow, .25), { fx: 'pulse' });
  for (let i = 0; i < 60; i++) { const ang = k.rng.range(0, Math.PI * 2), rr = k.rng.range(30, 190), x = 200 + rr * Math.cos(ang), y = 210 + rr * Math.sin(ang) * .95, c = cols[i % cols.length]; if (i % 3 === 0) k.circle(d.x(x), d.y(y), d.s(k.rng.range(4, 9)), c, { fx: 'float' }); else k.rect(d.x(x), d.y(y), d.s(k.rng.range(8, 16)), d.s(k.rng.range(4, 7)), c, { rotation: k.rng.range(0, 180), fx: i % 2 ? 'sway' : undefined, rx: d.s(1.5) }); }
  k.circle(d.x(200), d.y(210), d.s(40), p.accent);
};
const door: Motif = (k, a, p) => {
  const d = mk(k, a, p); k.poly(pts(d, [130, 60, 270, 60, 270, 360, 130, 360]), alphaHex(p.glow, .9), { fx: 'pulse' }); k.poly(pts(d, [90, 360, 310, 360, 250, 400, 140, 400]), alphaHex(p.glow, .35));
  k.rect(d.x(120), d.y(50), d.s(160), d.s(320), 'none', { stroke: mixHex(p.ink, .1), strokeWidth: d.s(12), rx: d.s(80) });
  k.poly(pts(d, [136, 60, 136, 360, 60, 392, 60, 86]), p.accent, { fx: 'sway' }); k.circle(d.x(108), d.y(226), d.s(7), p.glow);
  k.stroke(pts(d, [330, 400, 330, 300]), '#4a8f5c', d.s(5)); [[310, 300], [350, 310], [330, 270], [300, 340], [360, 350]].forEach(([x, y], i) => k.ellipse(d.x(x - 18), d.y(y - 8), d.s(36), d.s(16), i % 2 ? '#52d681' : '#3fae6a', { rotation: i % 2 ? 30 : -30, fx: 'sway' })); k.rect(d.x(306), d.y(380), d.s(50), d.s(36), p.accent2, { rx: d.s(6) });
  sparkles(d, 8, p.glow);
};
const fireworks: Motif = (k, a, p) => {
  const d = mk(k, a, p); const burst = (cx: number, cy: number, r: number, c: string) => { for (let i = 0; i < 16; i++) { const an = i * Math.PI / 8; k.line(d.x(cx) + d.s(r * .35) * Math.cos(an), d.y(cy) + d.s(r * .35) * Math.sin(an), d.x(cx) + d.s(r) * Math.cos(an), d.y(cy) + d.s(r) * Math.sin(an), c, d.s(4), { fx: 'pulse' }); k.circle(d.x(cx) + d.s(r * 1.08) * Math.cos(an), d.y(cy) + d.s(r * 1.08) * Math.sin(an), d.s(4), c, { fx: 'twinkle' }); } };
  burst(200, 130, 110, p.glow); burst(80, 240, 60, p.accent); burst(320, 250, 66, p.accent2);
  k.poly(pts(d, [0, 400, 0, 340, 40, 340, 40, 310, 90, 310, 90, 350, 150, 350, 150, 320, 220, 320, 220, 350, 300, 350, 300, 300, 340, 300, 340, 340, 400, 340, 400, 400]), alphaHex(p.ink, .75));
};
const bunting: Motif = (k, a, p) => {
  const d = mk(k, a, p); const cols = [p.accent, p.glow, p.accent2, W_]; for (let r = 0; r < 3; r++) { const y0 = 40 + r * 110; const line = curve(pts(d, [-10, y0, 100, y0 + 50, 200, y0 + 20, 300, y0 + 52, 410, y0])); k.stroke(line, p.ink, d.s(2), { opacity: .7 }); for (let i = 1; i < 11; i++) { const idx = Math.floor(line.length / 2 / 11 * i) * 2; const px = line[idx], py = line[idx + 1]; k.poly([px - d.s(16), py, px + d.s(16), py, px, py + d.s(44)], cols[(i + r) % 4], { fx: 'sway' }); } }
  sparkles(d, 8, p.glow);
};
const picnic: Motif = (k, a, p) => {
  const d = mk(k, a, p); hills(d, mixHex(p.accent2, -.05), mixHex(p.accent2, -.2), 250); k.poly(pts(d, [40, 330, 360, 330, 400, 410, 0, 410]), p.accent);
  for (let r = 0; r < 4; r++) for (let c = 0; c < 8; c++) if ((r + c) % 2 === 0) k.poly(pts(d, [40 - r * 10 + c * 40 * (1 + r * .12), 330 + r * 20, 80 - r * 10 + c * 40 * (1 + r * .12), 330 + r * 20, 70 - r * 12 + c * 40 * (1 + r * .12), 350 + r * 20, 30 - r * 12 + c * 40 * (1 + r * .12), 350 + r * 20]), W_, { opacity: .35 });
  k.poly(pts(d, [130, 250, 270, 250, 256, 330, 144, 330]), '#b57a43'); k.stroke(curve(pts(d, [150, 250, 170, 190, 230, 190, 250, 250])), '#8a5a2b', d.s(7)); k.rect(d.x(120), d.y(240), d.s(160), d.s(16), '#c98c4f', { rx: d.s(6) });
  for (const [x, y, c] of [[310, 340, p.glow], [350, 350, p.accent2], [80, 350, p.glow]] as const) { k.circle(d.x(x), d.y(y), d.s(22), c); k.stroke(pts(d, [x, y - 22, x + 6, y - 36]), '#4a8f5c', d.s(3)); }
  sunRays(d, 330, 70, 28, p.glow); cloud(d, 90, 80);
};
const board: Motif = (k, a, p) => {
  const d = mk(k, a, p); k.poly(pts(d, [40, 130, 330, 100, 370, 330, 70, 370]), p.accent2, { fx: 'bob' });
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) if ((r + c) % 2 === 0) k.poly(pts(d, [60 + c * 66 + r * 6, 140 + r * 56 - c * 6, 126 + c * 66 + r * 6, 134 + r * 56 - c * 6, 130 + c * 66 + r * 6, 190 + r * 56 - c * 6, 64 + c * 66 + r * 6, 196 + r * 56 - c * 6]), p.glow, { opacity: .85 });
  const die = (x: number, y: number, rot: number, dots: number[][]) => { k.rect(d.x(x), d.y(y), d.s(70), d.s(70), W_, { rx: d.s(14), rotation: rot, fx: 'float', shadow: { x: 0, y: 6, blur: 12, color: 'rgba(0,0,0,.3)' } }); dots.forEach(([dx, dy]) => k.circle(d.x(x + 35 + dx * 18), d.y(y + 35 + dy * 18) , d.s(6), p.ink)); };
  die(250, 250, 12, [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]]); die(110, 220, -14, [[-1, -1], [1, 1], [0, 0]]);
  for (const [x, y, c] of [[190, 170, p.accent], [220, 300, p.glow], [90, 300, p.accent]] as const) { k.ellipse(d.x(x - 14), d.y(y + 8), d.s(28), d.s(12), mixHex(c, -.3)); k.rect(d.x(x - 8), d.y(y - 22), d.s(16), d.s(34), c, { rx: d.s(6) }); k.circle(d.x(x), d.y(y - 28), d.s(13), c); }
};
const sparkler: Motif = (k, a, p) => {
  const d = mk(k, a, p); k.stroke(pts(d, [120, 380, 270, 130]), '#9ba0ad', d.s(5)); const cx = 270, cy = 130;
  for (let i = 0; i < 26; i++) { const an = i * Math.PI * 2 / 26 + .1, r1 = 10, r2 = 40 + (i % 4) * 26; k.line(d.x(cx) + d.s(r1) * Math.cos(an), d.y(cy) + d.s(r1) * Math.sin(an), d.x(cx) + d.s(r2) * Math.cos(an), d.y(cy) + d.s(r2) * Math.sin(an), i % 2 ? p.glow : W_, d.s(3), { fx: 'pulse' }); }
  k.circle(d.x(cx), d.y(cy), d.s(24), alphaHex(p.glow, .5), { fx: 'pulse' }); sparkles(d, 16, p.glow);
  for (let i = 0; i < 4; i++) k.circle(d.x(300 + i * 24), d.y(300 - i * 40), d.s(4), p.accent, { fx: 'rise' });
};
const snow: Motif = (k, a, p) => {
  const d = mk(k, a, p); hills(d, W_, mixHex(W_, -.08), 310);
  [[110, 300, 120], [290, 310, 90]].forEach(([x, y, h]) => { for (let i = 0; i < 3; i++) k.poly(pts(d, [x - 50 + i * 12, y - i * (h as number) * .3, x, y - (h as number) * .6 - i * (h as number) * .3, x + 50 - i * 12, y - i * (h as number) * .3]), i % 2 ? '#2f8f5c' : '#2a7a50'); k.rect(d.x(x - 6), d.y(y), d.s(12), d.s(26), '#6b4a2b'); k.star(d.x(x), d.y(y - (h as number) * 1.1), d.s(12), p.glow, { fx: 'pulse', points: 5, inner: .5 }); });
  for (let i = 0; i < 24; i++) k.circle(d.x(k.rng.range(0, 400)), d.y(k.rng.range(0, 330)), d.s(k.rng.range(2, 6)), W_, { opacity: .85, fx: 'drift' });
  for (const [x, y] of [[60, 80], [330, 60], [200, 40]]) { for (let i = 0; i < 3; i++) k.line(d.x(x) + d.s(20) * Math.cos(i * Math.PI / 3), d.y(y) + d.s(20) * Math.sin(i * Math.PI / 3), d.x(x) - d.s(20) * Math.cos(i * Math.PI / 3), d.y(y) - d.s(20) * Math.sin(i * Math.PI / 3), W_, d.s(3), { fx: 'spin' }); }
};
const sunflower: Motif = (k, a, p) => {
  const d = mk(k, a, p); k.stroke(pts(d, [200, 400, 200, 230]), '#3f9a5f', d.s(12)); k.ellipse(d.x(200), d.y(330), d.s(90), d.s(40), '#3f9a5f', { rotation: -30 }); k.ellipse(d.x(110), d.y(300), d.s(90), d.s(40), '#3f9a5f', { rotation: 30 });
  for (let i = 0; i < 20; i++) { const an = i * Math.PI / 10; k.ellipse(d.x(200 + 90 * Math.cos(an)) - d.s(22), d.y(190 + 90 * Math.sin(an)) - d.s(40), d.s(44), d.s(80), i % 2 ? '#ffd23f' : '#ffbf1f', { rotation: i * 18 + 90, fx: i === 0 ? 'spin' : undefined }); }
  k.circle(d.x(200), d.y(190), d.s(56), '#6b4a2b'); for (let i = 0; i < 24; i++) k.circle(d.x(200 + (i % 6 - 2.5) * 14), d.y(190 + (Math.floor(i / 6) - 1.5) * 14), d.s(3.4), '#3e2a17');
  k.circle(d.x(70), d.y(90), d.s(16), p.glow, { fx: 'float' }); k.circle(d.x(330), d.y(110), d.s(12), p.accent, { fx: 'float' });
};

export const FUN_MOTIFS: Record<string, Motif> = {
  dino, rocket, truck, soccer, pirate, hero, robot, shark, jungle, knight, racecar, ninja,
  unicorn, princess, mermaid, fairy, butterfly, ballet, bakery, rainbow, kitty, art, carousel, popstar,
  balloons, potluck, stringlights, confettiBurst, door, fireworks, bunting, picnic, board, sparkler, snow, sunflower,
};
export { mk as makeD, balloon, cloud, sparkles, sunRays, hills, wheel, eye, smile, pts };
export type { D };
void radial; void grad; void poly;
