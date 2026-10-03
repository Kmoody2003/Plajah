// Generates the per-experience launcher icons (Chora, Reello, Taleo, Fabula, Pixels,
// Chora Studio, Academia) for BOTH native shells from one source of truth:
//
//   Android  → res/mipmap-*/ic_launch_<slug>.png (+ _round, legacy 48dp) and
//              res/mipmap-*/ic_launch_<slug>_foreground.png (adaptive 108dp foreground)
//   Windows  → windows-native/Plajah.WinUI/Assets/Experiences/<Slug>.Square{150x150,44x44}Logo.png
//
// Style matches the main Plajah icon: near-black tile, soft brand glow, a gradient-stroked
// glyph (the same lucide icon the app's nav uses for that experience), plus a small Plajah
// chevron in the corner so the set reads as one family in a launcher/app folder.
//
//   node scripts/generate-experience-icons.mjs
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as Lucide from 'lucide-react';
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// Keep slugs in sync with src/lib/launchTarget.ts and the Android/Windows manifests.
export const EXPERIENCES = [
  { slug: 'chora',        name: 'Chora',        icon: 'Music2',         from: '#8B2BE2', to: '#00DAF3' },
  { slug: 'reello',       name: 'Reello',       icon: 'Video',          from: '#D40055', to: '#FF8C00' },
  { slug: 'taleo',        name: 'Taleo',        icon: 'Film',           from: '#FF8C00', to: '#FFD166' },
  { slug: 'fabula',       name: 'Fabula',       icon: 'Clapperboard',   from: '#22D3EE', to: '#7C3AED' },
  { slug: 'pixels',       name: 'Pixels',       icon: 'Aperture',       from: '#00F5A0', to: '#00B4F5' },
  { slug: 'chora_studio', name: 'ChoraStudio',  icon: 'AudioWaveform',  from: '#6B0099', to: '#D40055' },
  { slug: 'academia',     name: 'Academia',     icon: 'GraduationCap',  from: '#3B82F6', to: '#A78BFA' },
];

function glyphInner(iconName) {
  const Icon = Lucide[iconName];
  if (!Icon) throw new Error(`lucide-react has no icon "${iconName}"`);
  const svg = renderToStaticMarkup(createElement(Icon, { size: 24 }));
  return svg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '');
}

// Plajah chevron (the main app mark), on a 24-unit grid.
const CHEVRON = '<path d="M7 5 L17 12 L7 19"/>';

/**
 * @param exp     experience entry
 * @param opts.bg       paint the dark tile (false → transparent, for adaptive foregrounds)
 * @param opts.round    circular tile instead of rounded square
 * @param opts.scale    glyph size as a fraction of the canvas
 */
function iconSvg(exp, { bg = true, round = false, scale = 0.56, badge = true } = {}) {
  const S = 512;
  const g = S * scale;               // glyph box
  const gx = (S - g) / 2, gy = (S - g) / 2;
  const k = g / 24;
  const badgeBox = S * 0.17;
  const bx = S * 0.70, by = S * 0.70;
  const tile = round
    ? `<circle cx="256" cy="256" r="256" fill="url(#tile)"/>`
    : `<rect width="512" height="512" rx="${bg ? 112 : 0}" fill="url(#tile)"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">
  <defs>
    <radialGradient id="tile" cx="50%" cy="45%" r="75%">
      <stop offset="0" stop-color="#1A1024"/><stop offset="1" stop-color="#07060B"/>
    </radialGradient>
    <radialGradient id="glow" cx="50%" cy="50%" r="50%">
      <stop offset="0" stop-color="${exp.to}" stop-opacity="0.42"/>
      <stop offset="1" stop-color="${exp.from}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="ink" gradientUnits="userSpaceOnUse" x1="2" y1="2" x2="22" y2="22">
      <stop offset="0" stop-color="${exp.from}"/><stop offset="1" stop-color="${exp.to}"/>
    </linearGradient>
    <linearGradient id="brand" gradientUnits="userSpaceOnUse" x1="5" y1="5" x2="19" y2="19">
      <stop offset="0" stop-color="#6B0099"/><stop offset=".55" stop-color="#D40055"/><stop offset="1" stop-color="#FF8C00"/>
    </linearGradient>
  </defs>
  ${bg ? tile : ''}
  <circle cx="256" cy="256" r="${g * 0.95}" fill="url(#glow)"/>
  <g transform="translate(${gx} ${gy}) scale(${k})" fill="none" stroke="url(#ink)" stroke-width="2.1"
     stroke-linecap="round" stroke-linejoin="round">${glyphInner(exp.icon)}</g>
  ${badge ? `<g transform="translate(${bx} ${by}) scale(${badgeBox / 24})" fill="none" stroke="url(#brand)"
     stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round">${CHEVRON}</g>` : ''}
</svg>`;
}

async function png(svg, size, out) {
  mkdirSync(dirname(out), { recursive: true });
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(out);
}

const ANDROID_RES = join(root, 'android/app/src/main/res');
const DENSITIES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
const WIN_ASSETS = join(root, 'windows-native/Plajah.WinUI/Assets/Experiences');

for (const exp of EXPERIENCES) {
  for (const [d, m] of Object.entries(DENSITIES)) {
    const dir = join(ANDROID_RES, `mipmap-${d}`);
    // Legacy (pre-API-26) square + round launcher icons, 48dp.
    await png(iconSvg(exp), 48 * m, join(dir, `ic_launch_${exp.slug}.png`));
    await png(iconSvg(exp, { round: true }), 48 * m, join(dir, `ic_launch_${exp.slug}_round.png`));
    // Adaptive foreground, 108dp with the glyph inside the 66dp safe zone (≈0.40 of the canvas).
    await png(iconSvg(exp, { bg: false, scale: 0.40 }), 108 * m, join(dir, `ic_launch_${exp.slug}_foreground.png`));
  }
  // Windows tiles. 150x150 = Start tile; 44x44 = taskbar / Start list / Alt-Tab (no badge — too small).
  await png(iconSvg(exp, { bg: false, scale: 0.56 }), 300, join(WIN_ASSETS, `${exp.name}.Square150x150Logo.png`));
  await png(iconSvg(exp, { bg: false, scale: 0.86, badge: false }), 88, join(WIN_ASSETS, `${exp.name}.Square44x44Logo.png`));
  // Preview sheet input
  await png(iconSvg(exp), 256, join(root, 'scratch/experience-icons', `${exp.slug}.png`));
  console.log('✓', exp.slug);
}
