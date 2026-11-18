// Splits the 4-up PBR sheets (albedo / normal / roughness / AO) from the art folder into separate maps,
// and copies skies. Usage: node games/rift-realm/tools/prepAssets.mjs
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

const SRC = 'D:/plajah game assets deign from promtps/Shooter';
const OUT = 'public/games/rift-realm/assets/pbr';
const SIZE = 1024;
// panel boxes measured on the 1376x768 sheets: [left, top, width, height]
const PANELS = {
  albedo:    [58, 56, 600, 304],
  normal:    [718, 56, 600, 304],
  roughness: [58, 424, 600, 292],
  ao:        [718, 424, 600, 292],
};
const SHEETS_STD = {
  'marsh-water': 'Sunken Marshland Village Materials & HDRI/Swamp_water_texture_map_sheet_1e40687b.jpg',
  'marsh-wood': 'Sunken Marshland Village Materials & HDRI/Weathered_wood_plank_texture_map_c7b96ad0.jpg',
  'celestial-obsidian': 'Celestial Void Citadel Ruins Materials & HDRI/Obsidian_stone_texture_map_sheet_c43a7247.jpg',
  'glacial-ice': 'Glacial Citadel Complex Materials & HDRI/Blue_glacial_ice_texture_map_dfc75903.jpg',
  'volc-rock': 'Obsidian Volcanic Compound Materials & HDRI/Obsidian_volcanic_rock_texture_map_c3855ba0.jpg',
  'volc-ash': 'Obsidian Volcanic Compound Materials & HDRI/Volcanic_ash_soil_texture_map_b2352fa0.jpg',
  'volc-lava': 'Obsidian Volcanic Compound Materials & HDRI/Volcanic_lava_texture_map_sheet_3735b722.jpg',
};
fs.mkdirSync(OUT, { recursive: true });
for (const [name, rel] of Object.entries(SHEETS_STD)) {
  const file = path.join(SRC, rel);
  if (!fs.existsSync(file)) { console.warn('missing', file); continue; }
  const dir = path.join(OUT, name); fs.mkdirSync(dir, { recursive: true });
  const meta = await sharp(file).metadata();
  const sx = meta.width / 1376, sy = meta.height / 768;
  for (const [map, [l, t, w, h]] of Object.entries(PANELS)) {
    let img = sharp(file).extract({ left: Math.round(l * sx), top: Math.round(t * sy), width: Math.round(w * sx), height: Math.round(h * sy) }).resize(SIZE, SIZE, { fit: 'fill' });
    if (map === 'roughness' || map === 'ao') img = img.greyscale();
    await img.jpeg({ quality: 88 }).toFile(path.join(dir, `${map}.jpg`));
  }
  console.log('ok', name, meta.width + 'x' + meta.height);
}

// Sheets with their own layouts: boxes are [left, top, width, height] on a 688x384 reference tile (the sheet halved).
const D = 'Sunken Marshland Village Materials & HDRI/';
const SHEETS_CUSTOM = {
  'marsh-mud': { f: D + 'Marshland_mud_texture_map_sheet_0f565636.jpg', boxes: { albedo: [18, 29, 315, 145], normal: [355, 29, 314, 145], roughness: [18, 209, 315, 155] } },
  'glacial-ground': { f: 'Glacial Citadel Complex Materials & HDRI/Arctic_ground_texture_map_sheet_5a3e431f.jpg', boxes: { albedo: [28, 49, 296, 135], normal: [361, 49, 296, 135], roughness: [28, 214, 296, 135] } },
  'glacial-brick': { f: 'Glacial Citadel Complex Materials & HDRI/Stone_brick_ice_texture_map_7a1c88ce.jpg', boxes: { albedo: [20, 42, 315, 148], normal: [353, 42, 315, 148], roughness: [20, 212, 315, 155], ao: [353, 212, 315, 155] } },
  'celestial-marble': { f: 'Celestial Void Citadel Ruins Materials & HDRI/White_marble_texture_map_sheet_7ea396da.jpg', boxes: { albedo: [45, 32, 150, 146], normal: [268, 32, 150, 146], roughness: [492, 32, 150, 146], metallic: [45, 205, 150, 146], emissive: [268, 205, 150, 146] } },
  'volc-basalt': { f: 'Obsidian Volcanic Compound Materials & HDRI/Scorched_basalt_stone_wall_texture_4b691ef8.jpg', boxes: { albedo: [47, 23, 161, 159], normal: [264, 23, 160, 159], roughness: [480, 23, 160, 159], height: [47, 202, 161, 160], ao: [264, 202, 160, 160], emissive: [480, 202, 160, 160] }, recolorEmberToCyan: true },
};
for (const [name, c] of Object.entries(SHEETS_CUSTOM)) {
  const file = path.join(SRC, c.f);
  const dir = path.join(OUT, name); fs.mkdirSync(dir, { recursive: true });
  const meta = await sharp(file).metadata();
  const sx = meta.width / 688, sy = meta.height / 384;
  for (const [map, [l, t, w, h]] of Object.entries(c.boxes)) {
    const inset = 3;
    let img = sharp(file).extract({ left: Math.round((l + inset) * sx), top: Math.round((t + inset) * sy), width: Math.round((w - 2 * inset) * sx), height: Math.round((h - 2 * inset) * sy) }).resize(SIZE, SIZE, { fit: 'fill' });
    if (['roughness', 'ao', 'metallic', 'height', 'emissive'].includes(map) && map !== 'emissive') img = img.greyscale();
    let buf = await img.raw().toBuffer({ resolveWithObject: true });
    if (c.recolorEmberToCyan && map === 'albedo') {
      const d = buf.data, ch = buf.info.channels;
      for (let i = 0; i < d.length; i += ch) { if (d[i] - d[i + 2] > 55) { const r = d[i]; d[i] = d[i + 2]; d[i + 2] = r; } }
    }
    if (map === 'emissive' && c.recolorEmberToCyan) { // emissive becomes a mask; the game tints it
      const d = buf.data, ch = buf.info.channels;
      for (let i = 0; i < d.length; i += ch) { const m = Math.max(d[i], d[i + 1], d[i + 2]); d[i] = d[i + 1] = d[i + 2] = m; }
    }
    await sharp(buf.data, { raw: buf.info }).jpeg({ quality: 88 }).toFile(path.join(dir, `${map}.jpg`));
  }
  console.log('ok', name);
}

// contact sheet for a visual check
const names = [...Object.keys(SHEETS_STD), ...Object.keys(SHEETS_CUSTOM)].filter((n) => fs.existsSync(path.join(OUT, n, 'albedo.jpg')));
const T = 200, cols = 7;
const tiles = [];
for (let i = 0; i < names.length; i++) for (let k = 0; k < 4; k++) {
  const m = ['albedo', 'normal', 'roughness', 'emissive'][k];
  if (!fs.existsSync(path.join(OUT, names[i], m + '.jpg'))) continue;
  tiles.push({ input: await sharp(path.join(OUT, names[i], m + '.jpg')).resize(T / 2, T / 2).toBuffer(), left: (i % cols) * T + (k % 2) * T / 2, top: Math.floor(i / cols) * T + Math.floor(k / 2) * T / 2 });
}
await sharp({ create: { width: cols * T, height: Math.ceil(names.length / cols) * T, channels: 3, background: '#000' } }).composite(tiles).jpeg().toFile('games/rift-realm/tools/_contact.jpg');
