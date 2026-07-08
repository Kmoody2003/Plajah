// Generates the app-icon source images from the Plajah logo (the gradient play
// chevron from components/Logo.tsx) into assets/, for @capacitor/assets to fan
// out into every Android density + the adaptive icon.
import sharp from 'sharp';
import { mkdirSync } from 'fs';

mkdirSync('assets', { recursive: true });

const GRAD = `
  <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
    <stop offset="0%" stop-color="#6B0099"/>
    <stop offset="50%" stop-color="#D40055"/>
    <stop offset="100%" stop-color="#FF8C00"/>
  </linearGradient>`;

// The logo mark: viewBox 0 0 100 100, path M30 20 L70 50 L30 80, stroke 18.
// Centered on the 1024 canvas via translate(512,512)…translate(-50,-50).
const chevron = (scale, glow) => `
  <g transform="translate(512,512) scale(${scale}) translate(-50,-50)">
    <path d="M30 20 L70 50 L30 80" fill="none" stroke="url(#g)" stroke-width="18"
      stroke-linecap="round" stroke-linejoin="round"
      ${glow ? 'filter="url(#soft)"' : ''}/>
  </g>`;

const SOFT = `<filter id="soft" x="-40%" y="-40%" width="180%" height="180%">
  <feGaussianBlur stdDeviation="14" result="b"/>
  <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
</filter>`;

const bg = `
  <radialGradient id="bg" cx="50%" cy="42%" r="65%">
    <stop offset="0%" stop-color="#241033"/>
    <stop offset="60%" stop-color="#120A1C"/>
    <stop offset="100%" stop-color="#0B0B10"/>
  </radialGradient>`;

// Full/legacy icon: dark brand background + glowing chevron.
const iconOnly = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs>${GRAD}${SOFT}<radialGradient id="bg" cx="50%" cy="42%" r="65%">
    <stop offset="0%" stop-color="#241033"/><stop offset="60%" stop-color="#120A1C"/><stop offset="100%" stop-color="#0B0B10"/></radialGradient></defs>
  <rect width="1024" height="1024" fill="url(#bg)"/>
  ${chevron(6.4, true)}
</svg>`;

// Adaptive background: the dark brand radial (full bleed — safe under mask).
const iconBackground = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs><radialGradient id="bg" cx="50%" cy="42%" r="70%">
    <stop offset="0%" stop-color="#241033"/><stop offset="60%" stop-color="#120A1C"/><stop offset="100%" stop-color="#0B0B10"/></radialGradient></defs>
  <rect width="1024" height="1024" fill="url(#bg)"/>
</svg>`;

// Adaptive foreground: transparent + chevron kept inside the ~66% safe zone.
const iconForeground = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs>${GRAD}${SOFT}</defs>
  ${chevron(5.4, true)}
</svg>`;

const render = (svg, out) =>
  sharp(Buffer.from(svg)).resize(1024, 1024).png().toFile(`assets/${out}`).then(() => console.log('wrote assets/' + out));

await Promise.all([
  render(iconOnly, 'icon-only.png'),
  render(iconBackground, 'icon-background.png'),
  render(iconForeground, 'icon-foreground.png'),
]);
console.log('done');
