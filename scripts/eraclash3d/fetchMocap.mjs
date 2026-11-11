// Era Clash 3D: CMU motion capture for the fights, throws and parkour (free for any use, including commercial;
// credit "Data from mocap.cs.cmu.edu (funded by NSF EIA-0196217)"). FBX conversions from the gbionics/cmu-fbx
// dataset on Hugging Face (the same source as Ravencrest's captures). Kenne approved this download 2026-11-10.
//   node scripts/eraclash3d/fetchMocap.mjs
import fs from 'node:fs/promises';

const OUT = 'public/games/era-clash/3d/assets/mocap';
const BASE = 'https://huggingface.co/datasets/gbionics/cmu-fbx/resolve/main/';
export const TAKES = {
  // Haru's katana
  '02_07': 'swordplay', '02_08': 'swordplay', '02_09': 'swordplay',
  // karate (subject 135): kata, kicks, lunge punch, blocks
  '135_01': 'Bassai kata', '135_02': 'Empi kata', '135_03': 'Empi kata', '135_04': 'front kick', '135_05': 'gedan-barai (low block)',
  '135_06': 'Heian Shodan kata', '135_07': 'mawashi-geri (roundhouse)', '135_09': 'oi-zuki (lunge punch)', '135_10': 'shuto-uke (knife-hand block)', '135_11': 'yoko-geri (side kick)',
  // fists and combos
  '13_17': 'boxing', '13_18': 'boxing', '14_01': 'boxing', '14_02': 'boxing', '14_03': 'boxing',
  '141_14': 'punch and kick', '113_13': 'punch and kick', '111_19': 'punch kick', '02_05': 'punch/strike',
  // pottery and tables
  '111_17': 'pick up', '111_33': 'throwing', '113_24': 'throw', '143_20': 'catch and throw', '10_01': 'kick ball',
  // parkour
  '01_02': 'climb', '01_03': 'climb, hang, swing', '01_12': 'climb, pull up', '13_10': 'jump up to grab', '141_04': 'jump distances',
  '143_06': 'jumping heights', '141_07': 'walk up and over', '13_35': 'climb 3 steps',
  // rolls and recovery
  '111_21': 'roll over', '111_06': 'get up from floor',
  // already used by the cast (kept here so this folder is self-contained)
  '02_01': 'walk', '02_03': 'run/jog', '143_23': 'punching', '144_20': 'fighting', '144_21': 'fighting', '104_41': 'walk',
};

await fs.mkdir(OUT, { recursive: true });
let bytes = 0, ok = 0;
const failed = [];
for (const id of Object.keys(TAKES)) {
  const dst = `${OUT}/${id}.fbx`;
  try { await fs.access(dst); ok++; continue; } catch { /* fetch it */ }
  const r = await fetch(`${BASE}animations/${id}.fbx`, { headers: { 'User-Agent': 'plajah-eraclash3d-mocap' } });
  if (!r.ok) { failed.push(`${id} (${r.status})`); continue; }
  const b = Buffer.from(await r.arrayBuffer());
  await fs.writeFile(dst, b); bytes += b.length; ok++;
}
const lic = await fetch(`${BASE}README.md`).then((r) => r.text()).catch(() => '');
await fs.writeFile(`${OUT}/SOURCE-LICENSE.md`, lic);
await fs.writeFile(`${OUT}/CREDITS.md`, `# Motion capture\n\nData from mocap.cs.cmu.edu (funded by NSF EIA-0196217). FBX conversion: RancidMilk via cgspeed BVH, distributed as the gbionics/cmu-fbx dataset.\n\n${Object.entries(TAKES).map(([k, v]) => `- ${k}: ${v}`).join('\n')}\n`);
console.log(`${ok}/${Object.keys(TAKES).length} takes, ${(bytes / 1e6).toFixed(1)} MB fetched${failed.length ? `, failed: ${failed.join(', ')}` : ''}`);
