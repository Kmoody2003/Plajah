/**
 * extractCarSfx.mjs — Extracts and categorizes real engine, exhaust backfire,
 * turbo/EV, tire screech, gravel, brake thermal hiss, and curb-strike thump
 * samples from the Apex Elohim motion-study .mp4 videos into public/games/apex/sfx/.
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const FFMPEG = 'C:\\Users\\Kenne\\AppData\\Local\\ms-playwright\\ffmpeg-1011\\ffmpeg-win64.exe';
const SRC_DIR = 'D:\\plajah game assets deign from promtps\\racer\\Nov 15 - 14_22';
const OUT_DIR = path.resolve(process.cwd(), 'public/games/apex/sfx');

const CLIPS = [
  { file: 'Muscle_car_suspension_study_9ac957de.mp4', out: 'v8_muscle_loop.mp3', start: 0.8, dur: 3.6, category: 'engine' },
  { file: 'Muscle_car_suspension_study_9ac957de.mp4', out: 'v8_backfire.mp3', start: 6.9, dur: 1.2, category: 'oneshot' },
  { file: 'Vehicle_suspension_movement_study_06ea8744.mp4', out: 'supercar_track_loop.mp3', start: 0.5, dur: 4.5, category: 'engine' },
  { file: 'Car_suspension_movement_study_video_cf917772.mp4', out: 'suspension_curb_thud.mp3', start: 1.0, dur: 1.4, category: 'oneshot' },
  { file: 'Car_suspension_movement_study_video_cf917772.mp4', out: 'tcr_touring_loop.mp3', start: 5.0, dur: 3.2, category: 'engine' },
  { file: 'Rally_hatchback_sliding_on_gravel_2e3c5558.mp4', out: 'rally_gravel_loop.mp3', start: 1.0, dur: 4.5, category: 'surface' },
  { file: 'Rally_hatchback_sliding_on_gravel_2e3c5558.mp4', out: 'rally_antilag_pop.mp3', start: 6.0, dur: 1.6, category: 'oneshot' },
  { file: 'Buggy_tackling_sandy_humps_ed650de7.mp4', out: 'buggy_v8_offroad_loop.mp3', start: 1.0, dur: 4.2, category: 'engine' },
  { file: 'Electric_sedan_negotiating_S-ben…_1e3a2a46.mp4', out: 'ev_motor_loop.mp3', start: 1.0, dur: 5.0, category: 'engine' },
  { file: 'Tire_smoke_swirling_horizontally_08e27b64.mp4', out: 'tire_screech_loop.mp3', start: 0.5, dur: 3.8, category: 'surface' },
  { file: 'Brake_rotor_heating_thermal_glow_4caa196f.mp4', out: 'brake_thermal_hiss.mp3', start: 1.0, dur: 3.5, category: 'surface' },
];

function main() {
  if (!fs.existsSync(FFMPEG)) {
    throw new Error(`ffmpeg not found at ${FFMPEG}`);
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const manifest = { engine: [], surface: [], oneshot: [] };

  for (const c of CLIPS) {
    const src = path.join(SRC_DIR, c.file);
    if (!fs.existsSync(src)) {
      console.log(`[skip] Missing video: ${c.file}`);
      continue;
    }
    const out = path.join(OUT_DIR, c.out);
    const fadeOutAt = Math.max(0.2, c.dur - 0.12);
    const af = `afade=t=in:st=0:d=0.08,afade=t=out:st=${fadeOutAt.toFixed(2)}:d=0.12,loudnorm=I=-16:TP=-1.5:LRA=11`;

    execFileSync(
      FFMPEG,
      [
        '-y',
        '-ss', String(c.start),
        '-t', String(c.dur),
        '-i', src,
        '-vn',
        '-ac', '1',
        '-ar', '44100',
        '-af', af,
        '-b:a', '128k',
        out,
      ],
      { stdio: 'pipe' }
    );
    const bytes = fs.statSync(out).size;
    manifest[c.category].push({ file: c.out, source: c.file, start: c.start, dur: c.dur, bytes });
    console.log(`[sfx] ${c.category.padEnd(7)} ${c.out} (${(bytes / 1024).toFixed(1)} KB)`);
  }

  fs.writeFileSync(path.join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(`Extracted ${manifest.engine.length + manifest.surface.length + manifest.oneshot.length} SFX clips to ${OUT_DIR}`);
}

main();
