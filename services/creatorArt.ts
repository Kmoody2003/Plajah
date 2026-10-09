/**
 * creatorArt — generated chalkboard imagery for creator courses.
 *
 * Everything here is an inline SVG (returned as a data URI), so it needs no hosting, never breaks,
 * stays crisp at any size, and survives in share cards. The look is a classroom chalkboard: chalk
 * line-drawings with a slightly rough edge (an feDisplacementMap filter), dust smudges and a thin
 * chalk frame. Two ways to use it:
 *   - `chalkOverlay(kind)`  transparent doodles for layering FAINTLY over a gradient (course covers)
 *   - `chalkBoard(kind)`    a full slate board with the doodles at readable strength (heroes, empty states)
 *
 * `kind` is a course category (Music, Art, ...), a template id (masterclass, workshop, ...) or a
 * builder step (idea, outline, page, format, launch). Unknown kinds fall back to a generic scene.
 * Pure functions, no DOM: unit-tested in tests/creatorArt.test.ts.
 */

const ST = 'fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"';
const TXT = 'font-family="Segoe Print,Bradley Hand,Chalkboard SE,Comic Sans MS,cursive" fill="#fff"';

const note = (x: number, y: number, s = 1) =>
  `<g class="bob"><g transform="translate(${x} ${y}) scale(${s})"><ellipse cx="0" cy="0" rx="13" ry="9" transform="rotate(-20)"/><path d="M11 -4 V-58 q16 4 18 22"/></g></g>`;
const star = (x: number, y: number, r = 14) =>
  `<g class="tw"><path d="M${x} ${y - r} L${x + r * 0.3} ${y - r * 0.3} L${x + r} ${y} L${x + r * 0.3} ${y + r * 0.3} L${x} ${y + r} L${x - r * 0.3} ${y + r * 0.3} L${x - r} ${y} L${x - r * 0.3} ${y - r * 0.3} Z"/></g>`;

/** Wrap shapes in a motion hook. Only animated art ships the CSS for these classes, so static art is untouched. */
const g = (cls: string, inner: string, delay = 0) => `<g class="${cls}"${delay ? ` style="animation-delay:${delay}s"` : ''}>${inner}</g>`;
const halo = (x: number, y: number, r: number) => g('glow', `<circle cx="${x}" cy="${y}" r="${r}" fill="url(#dg)" stroke="none"/>`);

// Doodle scenes in an 800x450 box. Composition keeps the lower-left quiet (course covers put the title there).
// Each subject has its OWN motion: see the .class rules in MOTION_CSS.
const SCENES: Record<string, string> = {
  Music: `<g ${ST}>
    ${g('sway', `<path d="M430 70 q40 -14 80 0 t80 0 t80 0 t80 0"/><path d="M430 92 q40 -14 80 0 t80 0 t80 0 t80 0"/><path d="M430 114 q40 -14 80 0 t80 0 t80 0 t80 0"/><path d="M430 136 q40 -14 80 0 t80 0 t80 0 t80 0"/>`)}
    ${note(500, 118, 1)}${note(590, 100, 1)}${note(690, 126, 1)}
    ${g('wv', `<path d="M470 300 l12 -40 l12 70 l12 -90 l12 110 l12 -80 l12 50 l12 -30 l12 20 l12 -50 l12 60 l12 -26 l12 14"/>`)}
    ${g('wv slow', `<path d="M660 230 q30 -44 60 0 q30 44 60 0"/>`)}
  </g><text x="440" y="400" font-size="34" ${TXT}>1 · 2 · 3 · 4</text>`,
  Art: `<g ${ST}>
    <path d="M520 110 q-70 20 -60 90 q10 70 90 60 q40 -6 30 -34 q-10 -26 24 -26 q60 4 70 -40 q10 -64 -90 -70 q-40 -2 -64 20 Z"/>
    ${g('dot', `<circle cx="520" cy="150" r="8"/>`, 0)}${g('dot', `<circle cx="560" cy="130" r="8"/>`, 0.4)}${g('dot', `<circle cx="600" cy="150" r="8"/>`, 0.8)}${g('dot', `<circle cx="500" cy="196" r="8"/>`, 1.2)}
    ${g('sway', `<path d="M640 300 q60 -80 120 -30"/><path d="M650 340 q50 -50 100 -16"/>`)}
    <rect x="470" y="300" width="120" height="86" rx="4"/><path d="M482 372 l30 -34 l24 24 l22 -22 l24 32"/>
  </g>`,
  Film: `<g ${ST}>
    <rect x="460" y="120" width="190" height="130" rx="6"/>
    ${g('clap', `<path d="M460 120 l30 -44 h190 l-30 44"/><path d="M500 76 l-24 44 M550 76 l-24 44 M600 76 l-24 44 M650 76 l-24 44"/>`)}
    ${g('pop', `<path d="M520 190 l50 -30 v60 Z"/>`)}
    ${g('slide', `<rect x="470" y="320" width="270" height="70" rx="4"/><path d="M500 320 v70 M560 320 v70 M620 320 v70 M680 320 v70"/>`)}
    ${g('spin', `<circle cx="730" cy="140" r="26"/><path d="M730 114 v52 M704 140 h52"/><circle cx="730" cy="140" r="6"/>`)}
  </g>`,
  Writing: `<g ${ST}>
    ${g('tilt', `<path d="M470 330 l180 -190 l40 40 l-180 190 l-54 14 Z"/><path d="M650 140 l30 -30 l40 40 l-30 30"/><path d="M470 330 l16 -4 l-12 -14"/>`)}
    <path d="M440 90 h180 M440 120 h130 M440 150 h160"/>
    ${g('pop', `<path d="M700 300 q-30 0 -30 30 q30 0 30 -30 Z M750 300 q-30 0 -30 30 q30 0 30 -30 Z"/>`)}
  </g>`,
  Technology: `<g ${ST}>
    ${g('sway', `<path d="M500 130 l-56 60 l56 60"/><path d="M620 130 l56 60 l-56 60"/><path d="M586 116 l-34 148"/>`)}
    <path d="M470 330 h120 v40 h110"/><path d="M470 370 h50"/>${g('pulse', `<circle cx="590" cy="330" r="8"/>`)}${g('pulse', `<circle cx="700" cy="370" r="8"/>`, 0.6)}<rect x="720" y="340" width="40" height="60" rx="4"/>
    <rect x="660" y="70" width="110" height="70" rx="6"/><path d="M676 100 l16 12 l-16 12"/>${g('blink', `<path d="M706 126 h28"/>`)}
  </g>`,
  Business: `<g ${ST}>
    <path d="M450 380 H760"/>
    ${g('grow', `<rect x="480" y="300" width="44" height="80"/>`, 0)}${g('grow', `<rect x="550" y="250" width="44" height="130"/>`, 0.25)}${g('grow', `<rect x="620" y="200" width="44" height="180"/>`, 0.5)}${g('grow', `<rect x="690" y="140" width="44" height="240"/>`, 0.75)}
    <path d="M470 270 q90 -10 140 -80 t150 -90"/><path d="M730 92 l30 -4 l-6 30"/>
    ${g('pop', `<circle cx="480" cy="130" r="38"/><path d="M480 108 v44 M468 122 q12 -12 24 0 q-12 12 -24 12 q12 10 24 0"/>`)}
  </g>`,
  Science: `<g ${ST}>
    <path d="M520 90 h64 M540 90 v80 l-60 110 q-10 30 20 30 h124 q30 0 20 -30 l-60 -110 v-80"/><path d="M500 260 q40 -20 80 0 t80 0"/>
    ${g('bub', `<circle cx="560" cy="300" r="6"/>`, 0)}${g('bub', `<circle cx="600" cy="285" r="5"/>`, 1)}${g('bub', `<circle cx="535" cy="278" r="4"/>`, 2)}
    ${g('orb', `<ellipse cx="700" cy="150" rx="64" ry="24"/><ellipse cx="700" cy="150" rx="64" ry="24" transform="rotate(60 700 150)"/><ellipse cx="700" cy="150" rx="64" ry="24" transform="rotate(120 700 150)"/>`)}<circle cx="700" cy="150" r="8"/>
  </g><text x="640" y="380" font-size="30" ${TXT}>E = mc²</text>`,
  Health: `<g ${ST}>
    ${g('beat', `<path d="M560 300 q-110 -70 -90 -140 q20 -60 90 -10 q70 -50 90 10 q20 70 -90 140 Z"/>`)}
    <path d="M440 380 h60 l20 -40 l30 70 l26 -90 l24 60 h110"/>
    ${g('sway', `<path d="M700 110 q50 -20 70 30 q-50 30 -70 -30 Z M700 110 q20 40 40 60"/>`)}
  </g>`,
  Language: `<g ${ST}>
    ${g('pop', `<path d="M460 100 h170 q20 0 20 20 v60 q0 20 -20 20 h-100 l-40 30 v-30 h-30 q-20 0 -20 -20 v-60 q0 -20 20 -20 Z"/>`)}
    ${g('pop', `<path d="M690 200 h60 q20 0 20 20 v50 q0 20 -20 20 h-20 v28 l-34 -28 h-6 q-20 0 -20 -20 v-50 q0 -20 20 -20 Z"/>`, 1.6)}
  </g><text x="480" y="168" font-size="40" ${TXT}>Hola · Bonjour</text><text x="700" y="252" font-size="34" ${TXT}>你好</text><text x="470" y="360" font-size="64" ${TXT}>Aa Bb</text>`,
  Other: `<g ${ST}>
    ${halo(600, 190, 120)}<path d="M580 330 v-50 q-60 -30 -50 -90 q10 -60 70 -60 t70 60 q10 60 -50 90 v50 Z"/><path d="M560 350 h80 M570 376 h60"/>
    ${star(480, 110)}${star(700, 90, 10)}${star(740, 300, 16)}${star(470, 280, 10)}
    <path d="M660 200 q30 -10 40 20"/>
  </g>`,
  // template scenes
  masterclass: `<g ${ST}>${g('bob', `<path d="M400 150 l160 -64 l160 64 l-160 64 Z"/><path d="M470 184 v66 q90 44 180 0 v-66"/>`)}${g('swing', `<path d="M720 150 v90 M720 240 l-12 20 h24 Z"/>`)}${star(470, 90, 12)}${star(660, 70, 10)}</g>`,
  workshop: `<g ${ST}><rect x="440" y="90" width="260" height="230" rx="10"/><path d="M440 140 h260 M500 70 v34 M640 70 v34"/><path d="M470 180 h70 M470 220 h110 M470 260 h90"/>${g('pop', `<path d="M640 190 l16 18 l34 -40"/>`)}${g('tilt', `<path d="M730 300 l40 -40 l16 16 l-40 40 Z"/>`)}</g>`,
  challenge: `<g ${ST}>${g('flick', `<path d="M560 60 l-80 150 h70 l-30 170 l130 -200 h-76 l56 -120 Z"/>`)}${star(700, 120, 14)}${star(440, 300, 10)}</g><text x="610" y="370" font-size="36" ${TXT}>7 days</text>`,
  'live-series': `<g ${ST}><circle cx="580" cy="200" r="34"/>${g('arc', `<path d="M522 140 q-58 60 0 120 M638 140 q58 60 0 120"/>`)}${g('arc', `<path d="M494 112 q-92 88 0 176 M666 112 q92 88 0 176"/>`, 0.6)}<path d="M570 240 l-40 150 M590 240 l40 150"/>${g('pulse', `<circle cx="580" cy="200" r="8"/>`)}</g>`,
  mini: `<g ${ST}><circle cx="580" cy="220" r="110"/>${g('hand', `<path d="M580 220 v-70"/>`)}${g('hand slowh', `<path d="M580 220 l50 30"/>`)}<path d="M520 70 l-30 -30 M640 70 l30 -30"/></g><text x="470" y="400" font-size="30" ${TXT}>quick start</text>`,
  blank: `<g ${ST}>${g('tilt', `<path d="M470 340 l210 -220 l50 50 l-210 220 l-62 16 Z"/><path d="M680 120 l34 -34 l50 50 l-34 34"/>`)}<path d="M450 400 h200"/></g>`,
  // builder steps
  idea: `<g ${ST}>${halo(600, 190, 130)}<path d="M580 330 v-50 q-60 -30 -50 -90 q10 -60 70 -60 t70 60 q10 60 -50 90 v50 Z"/><path d="M560 350 h80"/>${g('arc', `<path d="M470 120 l-30 -20 M690 100 l30 -26 M740 180 l36 -6"/>`)}</g>`,
  outline: `<g ${ST}><path d="M470 100 h40 M540 100 h200 M470 170 h40 M540 170 h160 M470 240 h40 M540 240 h220 M470 310 h40 M540 310 h130"/>${g('pop', `<circle cx="490" cy="100" r="6"/>`, 0)}${g('pop', `<circle cx="490" cy="170" r="6"/>`, 0.5)}${g('pop', `<circle cx="490" cy="240" r="6"/>`, 1)}${g('pop', `<circle cx="490" cy="310" r="6"/>`, 1.5)}</g>`,
  page: `<g ${ST}><rect x="470" y="70" width="270" height="330" rx="10"/><rect x="490" y="90" width="230" height="120" rx="6"/><path d="M490 240 h160 M490 274 h200 M490 308 h120"/>${g('tilt', `<path d="M740 300 l40 -40 l16 16 l-40 40 Z"/>`)}</g>`,
  format: `<g ${ST}><circle cx="540" cy="200" r="90"/>${g('hand', `<path d="M540 200 v-60"/>`)}${g('hand slowh', `<path d="M540 200 l40 24"/>`)}${g('swing', `<path d="M670 120 h100 l30 30 l-60 60 l-70 -70 Z"/><circle cx="740" cy="136" r="6"/>`)}</g>`,
  launch: `<g ${ST}>${g('bob', `<path d="M600 60 q90 40 70 170 l-60 56 l-60 -56 q-20 -130 50 -170 Z"/><circle cx="600" cy="160" r="22"/><path d="M550 250 l-46 36 l24 -64 M650 250 l46 36 l-24 -64"/>`)}${g('flame', `<path d="M580 300 q20 60 20 90 q0 -30 20 -90"/>`)}${star(470, 120, 12)}${star(740, 110, 10)}</g>`,
};

/** Re-colour the chalk. Scenes draw in white; a tinted ink keeps drawings distinct from white text on top. */
const inked = (svg: string, ink?: string): string => (!ink || ink === '#fff' ? svg : svg.split('#fff').join(ink));

/** Fallback scene when the kind is unknown. */
const GENERIC = SCENES.Other;

/**
 * Make a scene animate: every stroke gets `pathLength="1"` + a staggered "draw itself" delay, and text
 * fades in as if written last. Pure string work, so it is testable and needs no JS in the image.
 */
const animate = (inner: string): string => {
  let i = 0;
  return inner
    .replace(/<(path|circle|ellipse|rect)(\s)/g, (_m, tag, sp) => `<${tag} class="s" pathLength="1" style="animation-delay:${(0.12 + i++ * 0.11).toFixed(2)}s"${sp}`)
    .replace(/<text(\s)/g, (_m, sp) => `<text class="t" style="animation-delay:${(0.4 + i * 0.05).toFixed(2)}s"${sp}`);
};

/** Motion CSS embedded in the SVG itself (CSS animation runs inside an <img>; no script needed). */
const MOTION_BASE = `@keyframes draw{from{stroke-dashoffset:1}to{stroke-dashoffset:0}}@keyframes fade{from{opacity:0}to{opacity:1}}@keyframes fl{from{transform:translateY(0)}to{transform:translateY(-6px)}}@keyframes tw{0%,100%{opacity:.3}50%{opacity:1}}@keyframes bob{from{transform:translateY(0)}to{transform:translateY(-7px)}}@keyframes dr{from{transform:translateX(-22px)}to{transform:translateX(22px)}}.s{stroke-dasharray:1;stroke-dashoffset:1;animation:draw 1.1s ease-out forwards}.t{opacity:0;animation:fade .9s ease forwards}.fl{animation:fl 6s ease-in-out infinite alternate}.tw{animation:tw 2.8s ease-in-out infinite}.tw:nth-of-type(2n){animation-duration:3.6s;animation-delay:.7s}.bob{animation:bob 3.4s ease-in-out infinite alternate}.dr{animation:dr 14s ease-in-out infinite alternate}.sway{animation:sway 5s ease-in-out infinite alternate}@keyframes sway{from{transform:translateX(-7px)}to{transform:translateX(7px)}}.wv{transform-box:fill-box;transform-origin:center;animation:wv 1.5s ease-in-out infinite alternate}.wv.slow{animation-duration:2.6s}@keyframes wv{from{transform:scaleY(.5)}to{transform:scaleY(1.2)}}.dot{transform-box:fill-box;transform-origin:center;animation:dotp 2.4s ease-in-out infinite}@keyframes dotp{0%,100%{transform:scale(1)}50%{transform:scale(1.7)}}.clap{transform-origin:460px 120px;animation:clap 3.6s ease-in-out infinite}@keyframes clap{0%,55%,100%{transform:rotate(0)}65%{transform:rotate(-16deg)}75%{transform:rotate(0)}}.pop{transform-box:fill-box;transform-origin:center;animation:pop 3s ease-in-out infinite}@keyframes pop{0%,100%{transform:scale(.92)}50%{transform:scale(1.06)}}.slide{animation:slide 4s ease-in-out infinite alternate}@keyframes slide{from{transform:translateX(0)}to{transform:translateX(-34px)}}.spin{transform-box:fill-box;transform-origin:center;animation:spin 5s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}.tilt{transform-box:fill-box;transform-origin:15% 90%;animation:tilt 2.2s ease-in-out infinite alternate}@keyframes tilt{from{transform:rotate(-3deg)}to{transform:rotate(3deg)}}.pulse{transform-box:fill-box;transform-origin:center;animation:pulse 1.8s ease-in-out infinite}@keyframes pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.8)}}.blink{animation:blink 1s steps(1) infinite}@keyframes blink{50%{opacity:0}}.grow{transform-box:fill-box;transform-origin:50% 100%;animation:grow 4.5s ease-in-out infinite}@keyframes grow{0%{transform:scaleY(.12)}35%,80%{transform:scaleY(1)}100%{transform:scaleY(.12)}}.bub{animation:bub 3.4s ease-in infinite}@keyframes bub{0%{opacity:0;transform:translateY(8px)}20%{opacity:.9}100%{opacity:0;transform:translateY(-62px)}}.orb{transform-origin:700px 150px;animation:spin 16s linear infinite}.beat{transform-box:fill-box;transform-origin:center;animation:beat 1.3s ease-in-out infinite}@keyframes beat{0%,100%{transform:scale(1)}15%{transform:scale(1.09)}30%{transform:scale(.98)}45%{transform:scale(1.06)}}.glow{animation:glow 3s ease-in-out infinite alternate}@keyframes glow{from{opacity:.15}to{opacity:.5}}.swing{transform-box:fill-box;transform-origin:50% 0;animation:swing 2.4s ease-in-out infinite alternate}@keyframes swing{from{transform:rotate(-7deg)}to{transform:rotate(7deg)}}.flick{animation:flick 2.6s steps(1) infinite}@keyframes flick{0%,100%{opacity:1}6%{opacity:.35}10%{opacity:1}52%{opacity:1}55%{opacity:.4}58%{opacity:1}}.arc{animation:arc 2.4s ease-out infinite}@keyframes arc{0%{opacity:.1}40%{opacity:1}100%{opacity:.1}}.hand{transform-box:fill-box;transform-origin:50% 100%;animation:spin 8s linear infinite}.hand.slowh{transform-origin:0 0;animation-duration:60s}.flame{transform-box:fill-box;transform-origin:50% 0;animation:flame .35s ease-in-out infinite alternate}@keyframes flame{from{transform:scaleY(.8)}to{transform:scaleY(1.25)}}`;
const MOTION_CALM = `@media (prefers-reduced-motion:reduce){.s{animation:none;stroke-dashoffset:0}.t{animation:none;opacity:1}.fl,.tw,.bob,.dr,.sway,.wv,.dot,.clap,.pop,.slide,.spin,.tilt,.pulse,.blink,.grow,.bub,.orb,.beat,.glow,.swing,.flick,.arc,.hand,.flame{animation:none}}`;

/**
 * Motion CSS for one image. With `respectDevice` it ships the reduce-motion media rule, so the OS setting wins
 * (mode `auto`). Without it (mode `on`) the person has overridden that for this app, so the art always moves.
 */
const motionCss = (respectDevice: boolean): string => `<style>${MOTION_BASE}${respectDevice ? MOTION_CALM : ''}</style>`;


const sceneFor = (kind?: string) => SCENES[kind || ''] || SCENES[(kind || '').replace(/^./, c => c.toUpperCase())] || GENERIC;

const defs = `<defs><filter id="ch" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="2" seed="7" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="2.6"/></filter><radialGradient id="dg"><stop offset="0" stop-color="#fff" stop-opacity="1"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>`;

/** Dust smudges + the thin chalk frame, shared by both forms. */
const smudges = `<g fill="url(#dg)"><ellipse cx="180" cy="120" rx="190" ry="64" opacity=".09"/><ellipse cx="560" cy="360" rx="230" ry="58" opacity=".08"/><ellipse cx="700" cy="60" rx="140" ry="46" opacity=".07"/></g>`;
const frame = `<rect x="14" y="14" width="772" height="422" rx="10" fill="none" stroke="#fff" stroke-width="2" opacity=".35" filter="url(#ch)"/>`;

export type ArtMotion = 'auto' | 'on' | 'off';
let mode: ArtMotion = 'auto';
/** Set by services/motionPref when the person changes the in-app Motion switch. */
export function setArtMotion(m: ArtMotion): void { mode = m; cache.clear(); }
export const getArtMotion = (): ArtMotion => mode;
/** 'off' beats any request to animate; everything else leaves the caller's request alone. */
const wantAnimated = (requested: boolean): boolean => (mode === 'off' ? false : requested);

const cache = new Map<string, string>();
const memo = (key: string, build: () => string): string => {
  const k = `${mode}|${key}`;
  let v = cache.get(k);
  if (v === undefined) { v = build(); if (cache.size > 200) cache.clear(); cache.set(k, v); }
  return v;
};

const uri = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

/**
 * Transparent chalk doodles, meant to sit FAINTLY over a gradient. `opacity` ~0.16-0.24 reads as a
 * texture that is there if you look, and never fights the title.
 */
export function chalkOverlayInner(kind?: string, opacity = 0.2, animatedRequested = false, ink?: string): string {
  const animated = wantAnimated(animatedRequested);
  const drawn = inked(sceneFor(kind), ink);
  const scene = animated ? `<g class="fl">${animate(drawn)}</g>` : drawn;
  const dust = animated ? `<g class="dr">${smudges}</g>` : smudges;
  return `${defs}${animated ? motionCss(mode !== 'on') : ''}<g opacity="${opacity}"${animated ? '' : ' filter="url(#ch)"'}>${scene}</g><g opacity="${Math.min(1, opacity * 0.9)}">${dust}${frame}</g>`;
}

/** A full slate chalkboard with the doodles at readable strength. */
export function chalkBoard(kind?: string, opts: { tint?: string; strength?: number; animated?: boolean; ink?: string } = {}): string {
  return memo(`board|${kind}|${opts.tint}|${opts.strength}|${opts.animated}|${opts.ink}`, () => buildBoard(kind, opts));
}

function buildBoard(kind: string | undefined, opts: { tint?: string; strength?: number; animated?: boolean; ink?: string }): string {
  const tint = opts.tint || '#1f3b36';
  const strength = opts.strength ?? 0.78;
  const on = wantAnimated(opts.animated ?? true);
  const drawn = inked(sceneFor(kind), opts.ink);
  const scene = on ? `<g class="fl">${animate(drawn)}</g>` : drawn;
  const dust = on ? `<g class="dr">${smudges}</g>` : smudges;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 450" preserveAspectRatio="xMidYMid slice">${defs}${on ? motionCss(mode !== 'on') : ''}<linearGradient id="bd" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${tint}"/><stop offset="1" stop-color="#0f1c1a"/></linearGradient><rect width="800" height="450" fill="url(#bd)"/>${dust}<g opacity="${strength}"${on ? '' : ' filter="url(#ch)"'}>${scene}</g>${frame}</svg>`;
  return uri(svg);
}

/** Transparent overlay as its own image (for a CSS background layer on top of a gradient). */
export function chalkOverlay(kind?: string, opacity = 0.2, animated = true, ink?: string): string {
  return memo(`overlay|${kind}|${opacity}|${animated}|${ink}`, () => uri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 450" preserveAspectRatio="xMidYMid slice">${chalkOverlayInner(kind, opacity, animated, ink)}</svg>`));
}

export const CHALK_KINDS = Object.keys(SCENES);
