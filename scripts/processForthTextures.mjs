/**
 * processForthTextures.mjs — Converts generated orthographic albedo textures into
 * 2048x2048 PNGs in public/games/forth-horizon/tex/, applies mathematical seamless
 * wrap-around blending for tileable textures, and derives _normal, _roughness, and _ao maps.
 */

import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const BRAIN_DIR = 'C:/Users/Kenne/.gemini/antigravity/brain/42e3bfd8-faf9-4bbd-85bf-ae0b60e1bbba';
const OUT_DIR = path.resolve(process.cwd(), 'public/games/forth-horizon/tex');
const SIZE = 2048;

const FILE_MAP = [
  // Shared building materials (24)
  ['tex_shared_01_red_brick_base_', 'tex-shared-01-red-brick_base.png', true],
  ['tex_shared_02_weathered_brick_base_', 'tex-shared-02-weathered-brick_base.png', true],
  ['tex_shared_03_orange_brick_base_', 'tex-shared-03-orange-brick_base.png', true],
  ['tex_shared_04_limestone_base_', 'tex-shared-04-limestone_base.png', true],
  ['tex_shared_05_white_marble_base_', 'tex-shared-05-white-marble_base.png', true],
  ['tex_shared_06_granite_base_', 'tex-shared-06-granite_base.png', true],
  ['tex_shared_07_glass_curtain_blue_base_', 'tex-shared-07-glass-curtain-blue_base.png', true],
  ['tex_shared_08_glass_curtain_cerulean_base_', 'tex-shared-08-glass-curtain-cerulean_base.png', true],
  ['tex_shared_09_glass_curtain_bronze_base_', 'tex-shared-09-glass-curtain-bronze_base.png', true],
  ['tex_shared_10_terracotta_base_', 'tex-shared-10-terracotta_base.png', true],
  ['tex_shared_11_glazed_tile_base_', 'tex-shared-11-glazed-tile_base.png', true],
  ['tex_shared_12_bronze_metal_base_', 'tex-shared-12-bronze-metal_base.png', true],
  ['tex_shared_13_copper_roof_base_v3_', 'tex-shared-13-copper-roof_base.png', true],
  ['tex_shared_14_steel_panel_base_', 'tex-shared-14-steel-panel_base.png', true],
  ['tex_shared_15_concrete_boardformed_base_', 'tex-shared-15-concrete-boardformed_base.png', true],
  ['tex_shared_16_concrete_weathered_base_', 'tex-shared-16-concrete-weathered_base.png', true],
  ['tex_shared_17_white_stucco_base_', 'tex-shared-17-white-stucco_base.png', true],
  ['tex_shared_18_timber_siding_base_', 'tex-shared-18-timber-siding_base.png', true],
  ['tex_shared_19_red_timber_base_', 'tex-shared-19-red-timber_base.png', true],
  ['tex_shared_20_white_clapboard_base_', 'tex-shared-20-white-clapboard_base.png', true],
  ['tex_shared_21_corrugated_steel_base_', 'tex-shared-21-corrugated-steel_base.png', true],
  ['tex_shared_22_asphalt_shingle_base_', 'tex-shared-22-asphalt-shingle_base.png', true],
  ['tex_shared_23_slate_roof_base_', 'tex-shared-23-slate-roof_base.png', true],
  ['tex_shared_24_stone_rubble_base_', 'tex-shared-24-stone-rubble_base.png', true],
  // Ground, road & track surfaces (14)
  ['ground_asphalt_dry_', 'ground_asphalt_dry.png', true],
  ['ground_asphalt_wet_', 'ground_asphalt_wet.png', true],
  ['ground_gravel_rally_', 'ground_gravel_rally.png', true],
  ['ground_dirt_track_', 'ground_dirt_track.png', true],
  ['ground_mud_', 'ground_mud.png', true],
  ['ground_grass_meadow_', 'ground_grass_meadow.png', true],
  ['ground_grass_dry_', 'ground_grass_dry.png', true],
  ['ground_forest_floor_', 'ground_forest_floor.png', true],
  ['ground_sand_', 'ground_sand.png', true],
  ['ground_concrete_sidewalk_', 'ground_concrete_sidewalk.png', true],
  ['ground_curb_granite_', 'ground_curb_granite.png', true],
  ['ground_paver_brick_', 'ground_paver_brick.png', true],
  ['ground_cobblestone_', 'ground_cobblestone.png', true],
  ['ground_rumble_strip_v3_', 'ground_rumble_strip.png', true],
  // Hero building facades (7, non-tileable)
  ['tex_hero_01_ironport_towers_base_', 'tex-hero-01-ironport-towers_base.png', false],
  ['tex_hero_03_founders_plaza_base_', 'tex-hero-03-founders-plaza_base.png', false],
  ['tex_hero_04_marina_clubhouse_base_', 'tex-hero-04-marina-clubhouse_base.png', false],
  ['tex_hero_05_riverfront_silos_base_', 'tex-hero-05-riverfront-silos_base.png', false],
  ['tex_hero_07_the_guardian_base_', 'tex-hero-07-the-guardian_base.png', false],
  ['tex_hero_08_penobscot_tower_base_', 'tex-hero-08-penobscot-tower_base.png', false],
  ['tex_hero_31_city_hall_base_', 'tex-hero-31-city-hall_base.png', false],
];

function makeSeamless(rgb, w, h, border = 128) {
  const out = Buffer.from(rgb);
  // Horizontal wrap blend (left <-> right)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < border; x++) {
      const t = 0.5 - 0.5 * Math.cos((Math.PI * x) / border); // 0 at edge -> 1 at inner border
      const oppX = w - border + x;
      const iL = (y * w + x) * 3;
      const iR = (y * w + oppX) * 3;
      const avg0 = (rgb[iL] + rgb[iR]) * 0.5;
      const avg1 = (rgb[iL + 1] + rgb[iR + 1]) * 0.5;
      const avg2 = (rgb[iL + 2] + rgb[iR + 2]) * 0.5;
      // Smoothly pull edge pixels toward shared seam midpoint
      const pull = 1 - t;
      out[iL] = Math.round(rgb[iL] * t + avg0 * pull);
      out[iL + 1] = Math.round(rgb[iL + 1] * t + avg1 * pull);
      out[iL + 2] = Math.round(rgb[iL + 2] * t + avg2 * pull);
      const tR = 0.5 - 0.5 * Math.cos((Math.PI * (border - 1 - x)) / border);
      const pullR = 1 - tR;
      out[iR] = Math.round(rgb[iR] * tR + avg0 * pullR);
      out[iR + 1] = Math.round(rgb[iR + 1] * tR + avg1 * pullR);
      out[iR + 2] = Math.round(rgb[iR + 2] * tR + avg2 * pullR);
    }
  }
  // Vertical wrap blend (top <-> bottom)
  const tmp = Buffer.from(out);
  for (let y = 0; y < border; y++) {
    const t = 0.5 - 0.5 * Math.cos((Math.PI * y) / border);
    const pull = 1 - t;
    const oppY = h - border + y;
    const tB = 0.5 - 0.5 * Math.cos((Math.PI * (border - 1 - y)) / border);
    const pullB = 1 - tB;
    for (let x = 0; x < w; x++) {
      const iT = (y * w + x) * 3;
      const iB = (oppY * w + x) * 3;
      const avg0 = (tmp[iT] + tmp[iB]) * 0.5;
      const avg1 = (tmp[iT + 1] + tmp[iB + 1]) * 0.5;
      const avg2 = (tmp[iT + 2] + tmp[iB + 2]) * 0.5;
      out[iT] = Math.round(tmp[iT] * t + avg0 * pull);
      out[iT + 1] = Math.round(tmp[iT + 1] * t + avg1 * pull);
      out[iT + 2] = Math.round(tmp[iT + 2] * t + avg2 * pull);
      out[iB] = Math.round(tmp[iB] * tB + avg0 * pullB);
      out[iB + 1] = Math.round(tmp[iB + 1] * tB + avg1 * pullB);
      out[iB + 2] = Math.round(tmp[iB + 2] * tB + avg2 * pullB);
    }
  }
  return out;
}

function buildPbrMaps(rgb, w, h) {
  const lum = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    lum[i] = (0.299 * rgb[i * 3] + 0.587 * rgb[i * 3 + 1] + 0.114 * rgb[i * 3 + 2]) / 255;
  }
  const normal = Buffer.alloc(w * h * 3);
  const rough = Buffer.alloc(w * h);
  const ao = Buffer.alloc(w * h);
  const strength = 2.6;

  for (let y = 0; y < h; y++) {
    const ym = (y - 1 + h) % h;
    const yp = (y + 1) % h;
    for (let x = 0; x < w; x++) {
      const xm = (x - 1 + w) % w;
      const xp = (x + 1) % w;
      const idx = y * w + x;
      const dx = (lum[y * w + xp] - lum[y * w + xm]) * strength;
      const dy = (lum[yp * w + x] - lum[ym * w + x]) * strength;
      const invLen = 1 / Math.hypot(dx, dy, 1);
      const nx = -dx * invLen;
      const ny = -dy * invLen;
      const nz = invLen;
      normal[idx * 3] = Math.round((nx * 0.5 + 0.5) * 255);
      normal[idx * 3 + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      normal[idx * 3 + 2] = Math.round((nz * 0.5 + 0.5) * 255);

      const c = lum[idx];
      const avg = (lum[y * w + xm] + lum[y * w + xp] + lum[ym * w + x] + lum[yp * w + x]) * 0.25;
      const cavity = Math.max(0, Math.min(1, 0.72 + (c - avg) * 1.8));
      ao[idx] = Math.round(cavity * 255);
      rough[idx] = Math.round(Math.max(0.25, Math.min(0.95, 0.85 - c * 0.35 + Math.abs(c - avg) * 0.8)) * 255);
    }
  }
  return { normal, rough, ao };
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const files = fs.readdirSync(BRAIN_DIR);
  let count = 0;

  for (const [prefix, outName, tileable] of FILE_MAP) {
    const match = files.find((f) => f.startsWith(prefix) && /\.(jpg|jpeg|png|webp)$/i.test(f));
    if (!match) {
      console.log(`[skip] Missing generated file for ${outName}`);
      continue;
    }
    const srcPath = path.join(BRAIN_DIR, match);
    const { data, info } = await sharp(srcPath)
      .resize(SIZE, SIZE, { fit: 'cover' })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const albedo = tileable ? makeSeamless(data, info.width, info.height, 96) : data;
    await sharp(albedo, { raw: { width: SIZE, height: SIZE, channels: 3 } })
      .png({ compressionLevel: 6 })
      .toFile(path.join(OUT_DIR, outName));

    const stem = outName.replace(/_base\.png$|\.png$/, '');
    const { normal, rough, ao } = buildPbrMaps(albedo, SIZE, SIZE);
    await Promise.all([
      sharp(normal, { raw: { width: SIZE, height: SIZE, channels: 3 } })
        .png({ compressionLevel: 6 })
        .toFile(path.join(OUT_DIR, `${stem}_normal.png`)),
      sharp(rough, { raw: { width: SIZE, height: SIZE, channels: 1 } })
        .png({ compressionLevel: 6 })
        .toFile(path.join(OUT_DIR, `${stem}_roughness.png`)),
      sharp(ao, { raw: { width: SIZE, height: SIZE, channels: 1 } })
        .png({ compressionLevel: 6 })
        .toFile(path.join(OUT_DIR, `${stem}_ao.png`)),
    ]);

    count++;
    console.log(`[tex] ${outName} + PBR maps (${SIZE}x${SIZE}, seamless=${tileable})`);
  }
  console.log(`Processed ${count} photoreal textures into ${OUT_DIR}`);
}

main();
