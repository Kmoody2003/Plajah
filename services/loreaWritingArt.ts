/**
 * loreaWritingArt — Art-Council engineered animated SVG scenes of Writing & Typing Loops
 * for the Lorea Literary Sanctuary & Living Books landing page.
 *
 * Inspired by `services/creatorArt.ts` (chalkboard line art + self-drawing stroke loops),
 * elevated with high theatrical drama over Plajah's signature color gradients
 * (#6B0099 Royal Purple -> #D40055 Magenta -> #FF8C00 Warm Amber).
 *
 * Features three synchronized infinite animation loops:
 *  1. CALLIGRAPHY WRITING LOOP: Ornate fountain pen & quill nibs gliding along sweeping bezier
 *     ink ribbons that continuously draw, glow, and loop (`stroke-dasharray` / `stroke-dashoffset`).
 *  2. TYPEWRITER KEYSTRIKE & CARRIAGE LOOP: Mechanical typewriter typebars striking the platen,
 *     a sliding paper carriage, rhythmic character-by-character typing lines, and a blinking amber caret.
 *  3. ILLUMINATED FOLIO & GLYPH CONSTELLATION: Perspective open book leaves with self-drawing
 *     drop-caps, margin rules, pilcrows (¶), section marks (§), and rising gold ink sparks.
 */

import { getArtMotion } from './creatorArt';

export type LoreaArtVariant = 'hero' | 'manuscript' | 'typewriter';

const uri = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

const MOTION_CSS = `
  @keyframes inkLoop {
    0% { stroke-dashoffset: 1; opacity: 0.05; }
    16% { opacity: 0.58; }
    55% { stroke-dashoffset: 0; opacity: 0.52; }
    80% { stroke-dashoffset: 0; opacity: 0.28; }
    96%, 100% { stroke-dashoffset: -1; opacity: 0.04; }
  }
  @keyframes scriptWrite {
    0%, 8% { stroke-dashoffset: 1; opacity: 0; }
    20% { opacity: 0.55; }
    60% { stroke-dashoffset: 0; opacity: 0.5; }
    82% { stroke-dashoffset: 0; opacity: 0.22; }
    96%, 100% { stroke-dashoffset: 0; opacity: 0; }
  }
  @keyframes penGlide {
    0% { transform: translate(0px, 0px) rotate(-18deg); opacity: 0.35; }
    20% { transform: translate(78px, -16px) rotate(-8deg); opacity: 0.65; }
    40% { transform: translate(164px, 8px) rotate(-22deg); opacity: 0.65; }
    60% { transform: translate(240px, -12px) rotate(-12deg); opacity: 0.55; }
    75% { transform: translate(248px, -10px) rotate(-6deg); opacity: 0.35; }
    92% { transform: translate(18px, 28px) rotate(-26deg); opacity: 0.2; }
    100% { transform: translate(0px, 0px) rotate(-18deg); opacity: 0.35; }
  }
  @keyframes quillSway {
    0%, 100% { transform: translate(0px, 0px) rotate(-6deg); opacity: 0.35; }
    35% { transform: translate(42px, -14px) rotate(5deg); opacity: 0.6; }
    70% { transform: translate(86px, 6px) rotate(-9deg); opacity: 0.45; }
  }
  @keyframes carriageSlide {
    0% { transform: translateX(0px); opacity: 0.38; }
    35% { opacity: 0.62; }
    72% { transform: translateX(-118px); opacity: 0.58; }
    78% { transform: translateX(-118px); opacity: 0.35; }
    86% { transform: translateX(6px); opacity: 0.25; }
    92%, 100% { transform: translateX(0px); opacity: 0.38; }
  }
  @keyframes typeLine1 {
    0%, 5% { stroke-dashoffset: 1; opacity: 0.08; }
    32%, 76% { stroke-dashoffset: 0; opacity: 0.58; }
    92%, 100% { stroke-dashoffset: 0; opacity: 0; }
  }
  @keyframes typeLine2 {
    0%, 30% { stroke-dashoffset: 1; opacity: 0; }
    36% { opacity: 0.55; }
    62%, 76% { stroke-dashoffset: 0; opacity: 0.55; }
    92%, 100% { stroke-dashoffset: 0; opacity: 0; }
  }
  @keyframes typeLine3 {
    0%, 58% { stroke-dashoffset: 1; opacity: 0; }
    64% { opacity: 0.55; }
    78% { stroke-dashoffset: 0; opacity: 0.52; }
    92%, 100% { stroke-dashoffset: 0; opacity: 0; }
  }
  @keyframes keyStrikeA {
    0%, 100% { transform: rotate(0deg); }
    15% { transform: rotate(-28deg); }
    30% { transform: rotate(0deg); }
    55% { transform: rotate(-26deg); }
    70% { transform: rotate(0deg); }
  }
  @keyframes keyStrikeB {
    0%, 100% { transform: rotate(0deg); }
    25% { transform: rotate(26deg); }
    40% { transform: rotate(0deg); }
    68% { transform: rotate(24deg); }
    82% { transform: rotate(0deg); }
  }
  @keyframes strikeSpark {
    0%, 70%, 100% { transform: scale(0.35); opacity: 0; }
    76% { transform: scale(1.25); opacity: 0.55; }
    88% { transform: scale(1.75); opacity: 0; }
  }
  @keyframes caretBlink {
    0%, 49% { opacity: 0.65; }
    50%, 100% { opacity: 0.08; }
  }
  @keyframes folioFloat {
    0%, 100% { transform: translateY(0px) rotate(0deg); opacity: 0.42; }
    50% { transform: translateY(-11px) rotate(1.2deg); opacity: 0.64; }
  }
  @keyframes emberRise {
    0% { transform: translateY(14px) scale(0.7); opacity: 0; }
    25% { opacity: 0.55; }
    85% { opacity: 0.3; }
    100% { transform: translateY(-78px) scale(1.15); opacity: 0; }
  }
  @keyframes auraPulse {
    0%, 100% { opacity: 0.2; transform: scale(0.96); }
    50% { opacity: 0.42; transform: scale(1.05); }
  }
  .ink-loop {
    stroke-dasharray: 1;
    stroke-dashoffset: 1;
    animation: inkLoop 7.5s cubic-bezier(0.4, 0, 0.2, 1) infinite;
  }
  .ink-loop.d1 { animation-delay: 0.8s; animation-duration: 8.2s; }
  .ink-loop.d2 { animation-delay: 1.9s; animation-duration: 9.0s; }
  .ink-loop.d3 { animation-delay: 3.1s; animation-duration: 7.8s; }
  .script-line {
    stroke-dasharray: 1;
    stroke-dashoffset: 1;
    animation: scriptWrite 6.8s ease-in-out infinite;
  }
  .script-line.s2 { animation-delay: 1.1s; }
  .script-line.s3 { animation-delay: 2.2s; }
  .script-line.s4 { animation-delay: 3.3s; }
  .pen-glide {
    transform-box: fill-box;
    transform-origin: 0% 100%;
    animation: penGlide 6.8s cubic-bezier(0.42, 0, 0.25, 1) infinite;
  }
  .quill-sway {
    transform-box: fill-box;
    transform-origin: 10% 90%;
    animation: quillSway 5.6s ease-in-out infinite;
  }
  .carriage {
    animation: carriageSlide 7.2s cubic-bezier(0.4, 0, 0.2, 1) infinite;
  }
  .t-line1 {
    stroke-dasharray: 1;
    stroke-dashoffset: 1;
    animation: typeLine1 7.2s steps(24, end) infinite;
  }
  .t-line2 {
    stroke-dasharray: 1;
    stroke-dashoffset: 1;
    animation: typeLine2 7.2s steps(22, end) infinite;
  }
  .t-line3 {
    stroke-dasharray: 1;
    stroke-dashoffset: 1;
    animation: typeLine3 7.2s steps(18, end) infinite;
  }
  .strike-a {
    transform-box: fill-box;
    transform-origin: 50% 100%;
    animation: keyStrikeA 0.65s ease-in-out infinite;
  }
  .strike-b {
    transform-box: fill-box;
    transform-origin: 50% 100%;
    animation: keyStrikeB 0.52s ease-in-out infinite;
  }
  .bell-spark {
    transform-box: fill-box;
    transform-origin: center;
    animation: strikeSpark 7.2s ease-out infinite;
  }
  .caret {
    animation: caretBlink 0.75s steps(1) infinite;
  }
  .folio-float {
    animation: folioFloat 6.4s ease-in-out infinite;
  }
  .folio-float.alt {
    animation-duration: 7.8s;
    animation-delay: 1.4s;
  }
  .ember {
    animation: emberRise 5.4s ease-in infinite;
  }
  .ember.e2 { animation-delay: 1.3s; animation-duration: 6.2s; }
  .ember.e3 { animation-delay: 2.7s; animation-duration: 4.9s; }
  .ember.e4 { animation-delay: 3.8s; animation-duration: 5.8s; }
  .aura {
    transform-box: fill-box;
    transform-origin: center;
    animation: auraPulse 5.5s ease-in-out infinite;
  }
  @media (prefers-reduced-motion: reduce) {
    .ink-loop, .script-line, .t-line1, .t-line2, .t-line3 {
      animation: none !important;
      stroke-dashoffset: 0 !important;
      opacity: 0.75 !important;
    }
    .pen-glide, .quill-sway, .carriage, .strike-a, .strike-b, .bell-spark, .caret, .folio-float, .ember, .aura {
      animation: none !important;
    }
  }
`;

/**
 * Generates the full-drama SVG markup for the Lorea Writing & Typing Loops backdrop.
 * Can be rendered inline or as a data-URI background image.
 */
export function buildLoreaWritingSvg(opts: {
  variant?: LoreaArtVariant;
  animated?: boolean;
  respectReduceMotion?: boolean;
} = {}): string {
  const motionMode = getArtMotion();
  const isAnimated = motionMode === 'off' ? false : (opts.animated ?? true);
  const css = isAnimated
    ? `<style>${
        motionMode === 'on'
          ? MOTION_CSS.replace(/@media \(prefers-reduced-motion: reduce\)[\s\S]*$/, '')
          : MOTION_CSS
      }</style>`
    : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1440 820" preserveAspectRatio="xMidYMid slice">
    <defs>
      <filter id="chalkRough" x="-5%" y="-5%" width="110%" height="110%">
        <feTurbulence type="fractalNoise" baseFrequency="0.7" numOctaves="2" seed="11" result="noise"/>
        <feDisplacementMap in="SourceGraphic" in2="noise" scale="1.9"/>
      </filter>
      <filter id="inkGlow" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="4.5" result="blur"/>
        <feMerge>
          <feMergeNode in="blur"/>
          <feMergeNode in="SourceGraphic"/>
        </feMerge>
      </filter>
      <linearGradient id="plajahInkGold" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="#FFE299"/>
        <stop offset="50%" stop-color="#FF9E2C"/>
        <stop offset="100%" stop-color="#FF5E97"/>
      </linearGradient>
      <linearGradient id="plajahRibbon" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#C882FF" stop-opacity="0.9"/>
        <stop offset="48%" stop-color="#FF4D8D" stop-opacity="0.95"/>
        <stop offset="100%" stop-color="#FFB347" stop-opacity="0.95"/>
      </linearGradient>
      <radialGradient id="plajahSpotGold" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="#FF9E2C" stop-opacity="0.45"/>
        <stop offset="55%" stop-color="#D40055" stop-opacity="0.18"/>
        <stop offset="100%" stop-color="#6B0099" stop-opacity="0"/>
      </radialGradient>
      <radialGradient id="plajahSpotMagenta" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="#FF4D8D" stop-opacity="0.42"/>
        <stop offset="60%" stop-color="#6B0099" stop-opacity="0.16"/>
        <stop offset="100%" stop-color="#1a0026" stop-opacity="0"/>
      </radialGradient>
    </defs>
    ${css}

    <!-- Theatrical Plajah Atmospheric Halos -->
    <g class="aura">
      <ellipse cx="1050" cy="240" rx="390" ry="240" fill="url(#plajahSpotGold)"/>
      <ellipse cx="340" cy="560" rx="420" ry="250" fill="url(#plajahSpotMagenta)"/>
    </g>

    <!-- Subtle Architectural Scriptorium Grid & Margin Rules -->
    <g stroke="#ffffff" stroke-opacity="0.06" stroke-width="1" fill="none">
      <line x1="96" y1="40" x2="96" y2="780" stroke-dasharray="6 10"/>
      <line x1="1344" y1="40" x2="1344" y2="780" stroke-dasharray="6 10"/>
      <path d="M 80 88 H 1360 M 80 736 H 1360"/>
      <rect x="64" y="56" width="1312" height="708" rx="26" stroke="#ffd98a" stroke-opacity="0.12" stroke-width="1.4"/>
    </g>

    <!-- ======================================================================= -->
    <!-- LOOP 1: GRAND CALLIGRAPHY INK RIBBONS & SELF-WRITING FOUNTAIN NIB       -->
    <!-- ======================================================================= -->
    <g fill="none" stroke-linecap="round" stroke-linejoin="round">
      <!-- Sweeping Grand Calligraphic Bezier Loops across the stage -->
      <path
        class="ink-loop"
        pathLength="1"
        d="M -40 610 C 180 430, 310 700, 560 510 C 790 330, 940 580, 1190 370 C 1310 265, 1395 310, 1490 220"
        stroke="url(#plajahRibbon)"
        stroke-width="3.6"
        filter="url(#inkGlow)"
      />
      <path
        class="ink-loop d1"
        pathLength="1"
        d="M -20 650 C 210 490, 360 725, 610 540 C 830 375, 980 615, 1230 410 C 1340 315, 1410 350, 1500 265"
        stroke="#ffd98a"
        stroke-opacity="0.55"
        stroke-width="1.8"
      />
      <path
        class="ink-loop d2"
        pathLength="1"
        d="M 620 120 C 760 40, 910 210, 1060 110 C 1210 15, 1310 165, 1460 85"
        stroke="url(#plajahInkGold)"
        stroke-width="2.6"
      />
    </g>

    <!-- Perspective Open Illuminated Manuscript Folio (Top-Right / Mid-Right) -->
    <g class="folio-float" transform="translate(760, 68)">
      <!-- Book shadow & binding -->
      <path d="M 30 220 Q 170 192 310 222 Q 450 192 590 220 L 610 242 Q 450 214 310 244 Q 170 214 10 242 Z" fill="#0d0016" opacity="0.22"/>
      <!-- Left & Right Parchment Leaves in chalk/gold line-art -->
      <path
        d="M 30 36 Q 170 10 310 42 L 310 224 Q 170 192 30 218 Z"
        fill="#1e0631"
        fill-opacity="0.22"
        stroke="#ffd98a"
        stroke-opacity="0.38"
        stroke-width="1.8"
      />
      <path
        d="M 310 42 Q 450 10 590 36 L 590 218 Q 450 192 310 224 Z"
        fill="#27083c"
        fill-opacity="0.22"
        stroke="#ffd98a"
        stroke-opacity="0.38"
        stroke-width="1.8"
      />
      <!-- Illuminated Drop Cap Frame on Left Page -->
      <rect x="58" y="56" width="54" height="58" rx="8" fill="#d40055" fill-opacity="0.14" stroke="#ffb347" stroke-opacity="0.45" stroke-width="1.6"/>
      <text x="72" y="98" font-family="Georgia, serif" font-size="40" font-weight="bold" fill="#ffd98a" fill-opacity="0.55">L</text>

      <!-- Self-writing manuscript lines on Left Page -->
      <g fill="none" stroke="#ffd98a" stroke-opacity="0.55" stroke-width="1.8" stroke-linecap="round">
        <path class="script-line" pathLength="1" d="M 126 66 q 32 -8 64 0 t 64 0 t 34 0"/>
        <path class="script-line s2" pathLength="1" d="M 126 88 q 28 -6 56 0 t 56 0 t 42 0"/>
        <path class="script-line s3" pathLength="1" d="M 126 110 q 30 -7 60 0 t 60 0"/>
        <path class="script-line s4" pathLength="1" d="M 58 138 q 36 -8 72 0 t 72 0 t 72 0"/>
        <path class="script-line s2" pathLength="1" d="M 58 162 q 34 -7 68 0 t 68 0 t 54 0"/>
        <path class="script-line s3" pathLength="1" d="M 58 184 q 30 -6 60 0 t 60 0"/>
      </g>

      <!-- Active Cursive Writing Lines on Right Page + Gliding Fountain Pen Nib -->
      <g fill="none" stroke="url(#plajahInkGold)" stroke-opacity="0.65" stroke-width="2" stroke-linecap="round">
        <path class="script-line" pathLength="1" d="M 338 72 c 22 -14, 44 12, 68 -4 c 24 -16, 48 12, 74 -2 c 22 -12, 46 8, 72 -4"/>
        <path class="script-line s2" pathLength="1" d="M 338 104 c 26 -12, 52 10, 78 -4 c 26 -14, 52 10, 82 -2 c 18 -8, 36 6, 52 -2"/>
        <path class="script-line s3" pathLength="1" d="M 338 136 c 24 -14, 48 12, 74 -2 c 26 -14, 52 12, 80 -4 c 16 -8, 30 4, 44 -2"/>
        <path class="script-line s4" pathLength="1" d="M 338 168 c 20 -10, 42 8, 66 -4 c 22 -12, 46 8, 70 -2"/>
      </g>

      <!-- Animated Fountain Pen Nib Actively Writing on the Right Page -->
      <g class="pen-glide" transform="translate(335, 162)">
        <!-- Fountain Pen Nib + Barrel -->
        <path
          d="M 0 0 L 18 -38 L 44 -22 L 8 4 Z"
          fill="#1a0026"
          fill-opacity="0.4"
          stroke="#ffd98a"
          stroke-opacity="0.65"
          stroke-width="2"
          stroke-linejoin="round"
        />
        <!-- Pen Barrel -->
        <path
          d="M 18 -38 L 88 -118 L 118 -96 L 44 -22 Z"
          fill="#d40055"
          fill-opacity="0.2"
          stroke="#ff9e2c"
          stroke-opacity="0.6"
          stroke-width="2"
          stroke-linejoin="round"
        />
        <!-- Nib slit & breather hole -->
        <line x1="2" y1="1" x2="21" y2="-21" stroke="#ffd98a" stroke-opacity="0.6" stroke-width="1.5"/>
        <circle cx="23" cy="-23" r="3" fill="#ffd98a" fill-opacity="0.65"/>
        <!-- Glowing ink drop at the tip -->
        <circle cx="0" cy="0" r="4" fill="#ffb347" fill-opacity="0.7" filter="url(#inkGlow)"/>
      </g>
    </g>

    <!-- ======================================================================= -->
    <!-- LOOP 2: MECHANICAL TYPEWRITER CARRIAGE, KEYSTRIKES & LIVE TYPING LINES  -->
    <!-- ======================================================================= -->
    <g transform="translate(78, 438)">
      <!-- Typewriter Base Chassis & Radial Basket -->
      <path
        d="M 40 210 L 72 136 H 388 L 420 210 C 426 226, 414 242, 396 242 H 64 C 46 242, 34 226, 40 210 Z"
        fill="#160224"
        fill-opacity="0.24"
        stroke="#ff9e2c"
        stroke-opacity="0.38"
        stroke-width="1.8"
      />
      <!-- Typebar Basket Arc -->
      <path
        d="M 124 142 Q 230 205 336 142"
        fill="none"
        stroke="#ff6fa8"
        stroke-opacity="0.35"
        stroke-width="1.6"
        stroke-dasharray="5 6"
      />

      <!-- Animated Striking Typebars Hammering Toward Platen Center (230, 126) -->
      <g stroke="#ffd98a" stroke-opacity="0.5" stroke-width="1.8" stroke-linecap="round">
        <g class="strike-a">
          <line x1="156" y1="172" x2="222" y2="128"/>
          <rect x="218" y="122" width="10" height="7" rx="2" fill="#ffb347" fill-opacity="0.55"/>
        </g>
        <g class="strike-b">
          <line x1="304" y1="172" x2="238" y2="128"/>
          <rect x="232" y="122" width="10" height="7" rx="2" fill="#ff6fa8" fill-opacity="0.55"/>
        </g>
        <line x1="182" y1="180" x2="224" y2="134" stroke-opacity="0.28"/>
        <line x1="278" y1="180" x2="236" y2="134" stroke-opacity="0.28"/>
        <line x1="230" y1="186" x2="230" y2="134" stroke-opacity="0.28"/>
      </g>

      <!-- Vintage Round Keycaps Row -->
      <g fill="#240538" fill-opacity="0.25" stroke="#ffd98a" stroke-width="1.4" stroke-opacity="0.42">
        <circle cx="96" cy="196" r="11"/><circle cx="132" cy="196" r="11"/><circle cx="168" cy="196" r="11"/>
        <circle cx="204" cy="196" r="11"/><circle cx="240" cy="196" r="11"/><circle cx="276" cy="196" r="11"/>
        <circle cx="312" cy="196" r="11"/><circle cx="348" cy="196" r="11"/>
        <circle cx="114" cy="220" r="11"/><circle cx="150" cy="220" r="11"/>
        <!-- Spacebar -->
        <rect x="176" y="213" width="108" height="14" rx="7" fill="#d40055" fill-opacity="0.18" stroke="#ff9e2c" stroke-opacity="0.45"/>
        <circle cx="310" cy="220" r="11"/><circle cx="346" cy="220" r="11"/>
      </g>

      <!-- Sliding Paper Carriage + Typed Manuscript Sheet -->
      <g class="carriage" transform="translate(60, 0)">
        <!-- Platen Roller -->
        <rect x="22" y="114" width="356" height="22" rx="11" fill="#2b0742" fill-opacity="0.28" stroke="#ffd98a" stroke-opacity="0.45" stroke-width="1.8"/>
        <!-- Carriage Return Lever -->
        <path d="M 22 120 L -18 96 L -4 84" fill="none" stroke="#ff9e2c" stroke-opacity="0.5" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
        <!-- Luminous Manuscript Sheet Rising from Platen -->
        <path
          d="M 56 116 L 68 -34 H 344 L 332 116 Z"
          fill="#1b042c"
          fill-opacity="0.24"
          stroke="#ffd98a"
          stroke-opacity="0.42"
          stroke-width="1.8"
        />
        <!-- Typed Header & Monospace Lines Revealing Step-by-Step -->
        <text x="86" y="-4" font-family="JetBrains Mono, monospace" font-size="11" font-weight="700" fill="#ff9e2c" fill-opacity="0.55" letter-spacing="3">
          MS. LOREA // ACT I
        </text>
        <g fill="none" stroke-linecap="butt">
          <!-- Line 1 (dashed to look like crisp typed characters) -->
          <path
            class="t-line1"
            pathLength="1"
            d="M 86 24 H 312"
            stroke="#ffd98a"
            stroke-width="4"
            stroke-dasharray="7 4 11 4 5 4 9 4 12 4 6 4 10 4 8 4 11 4"
          />
          <!-- Line 2 -->
          <path
            class="t-line2"
            pathLength="1"
            d="M 86 52 H 298"
            stroke="#ff85b3"
            stroke-width="4"
            stroke-dasharray="9 4 6 4 12 4 8 4 10 4 5 4 11 4 7 4"
          />
          <!-- Line 3 -->
          <path
            class="t-line3"
            pathLength="1"
            d="M 86 80 H 264"
            stroke="#ffd98a"
            stroke-width="4"
            stroke-dasharray="6 4 11 4 8 4 10 4 6 4 12 4 9 4"
          />
        </g>
        <!-- Blinking Typewriter Amber Caret -->
        <rect class="caret" x="270" y="71" width="3.5" height="15" fill="#ff9e2c" filter="url(#inkGlow)"/>

        <!-- Carriage Return Bell Ring Spark -->
        <g class="bell-spark" transform="translate(352, 88)">
          <circle cx="0" cy="0" r="14" fill="none" stroke="#ffd98a" stroke-width="2"/>
          <path d="M -22 0 H -10 M 10 0 H 22 M 0 -22 V -10 M 0 10 V 22" stroke="#ff9e2c" stroke-width="2" stroke-linecap="round"/>
        </g>
      </g>
    </g>

    <!-- ======================================================================= -->
    <!-- LOOP 3: FLOATING QUILL, TYPOGRAPHIC GLYPHS & RISING GOLD INK EMBERS      -->
    <!-- ======================================================================= -->
    <g class="quill-sway" transform="translate(1090, 520)" fill="none" stroke="#ffd98a" stroke-width="2.2" stroke-linecap="round">
      <!-- Feather Quill Plume -->
      <path
        d="M 0 140 C 38 92, 92 40, 176 -20 C 154 34, 118 78, 54 112 C 88 94, 128 64, 152 24 C 110 74, 58 112, 0 140 Z"
        fill="#d40055"
        fill-opacity="0.24"
      />
      <path d="M -18 158 L 176 -20" stroke="#ffb347" stroke-width="2.6"/>
      <circle cx="-18" cy="158" r="4" fill="#ffd98a" filter="url(#inkGlow)"/>
      <!-- Flowing signature loop under the quill -->
      <path
        class="ink-loop d3"
        pathLength="1"
        d="M -140 164 Q -70 120 -18 158 T 110 152 T 210 176"
        stroke="url(#plajahInkGold)"
        stroke-width="2.8"
      />
    </g>

    <!-- Drifting Literary & Typographic Symbols (Pilcrow ¶, Section §, Ligatures) -->
    <g font-family="Georgia, 'Times New Roman', serif" fill="#ffd98a" fill-opacity="0.24">
      <text class="folio-float" x="130" y="150" font-size="54">¶</text>
      <text class="folio-float alt" x="590" y="210" font-size="42" fill="#ff6fa8" fill-opacity="0.26">§</text>
      <text class="folio-float" x="1290" y="420" font-size="52">æ</text>
      <text class="folio-float alt" x="640" y="690" font-size="64" fill="#ffb347" fill-opacity="0.22">“ ”</text>
      <text class="folio-float" x="480" y="105" font-size="28" font-style="italic" letter-spacing="2">Ex Libris · Lorea</text>
    </g>

    <!-- Rising Golden & Magenta Ink Embers -->
    <g fill="#ffd98a">
      <circle class="ember" cx="260" cy="390" r="3.5"/>
      <circle class="ember e2" cx="540" cy="490" r="4.5" fill="#ff6fa8"/>
      <circle class="ember e3" cx="880" cy="340" r="3.5"/>
      <circle class="ember e4" cx="1140" cy="300" r="4" fill="#ffb347"/>
      <circle class="ember e2" cx="980" cy="620" r="3.2"/>
      <circle class="ember e3" cx="410" cy="260" r="3.8" fill="#ff6fa8"/>
    </g>
  </svg>`;
}

const cache = new Map<string, string>();

/**
 * Returns a memoized `data:image/svg+xml;charset=utf-8,...` URI for CSS `backgroundImage` usage,
 * matching the pattern in `services/creatorArt.ts`.
 */
export function loreaWritingBoard(opts: { variant?: LoreaArtVariant; animated?: boolean } = {}): string {
  const mode = getArtMotion();
  const key = `${mode}|${opts.variant || 'hero'}|${opts.animated ?? true}`;
  let v = cache.get(key);
  if (!v) {
    v = uri(buildLoreaWritingSvg(opts));
    if (cache.size > 32) cache.clear();
    cache.set(key, v);
  }
  return v;
}
