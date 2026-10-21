import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { prepareSpeechText } from '../../services/aria/ariaSpeech';

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, 'public', 'promo', 'chora');
const AUDIO_DIR = path.join(OUT_DIR, 'audio');
const FFMPEG = 'C:\\Users\\Kenne\\tools\\ffmpeg\\ffmpeg-9.0.2-essentials_build\\bin\\ffmpeg.exe';
const FFPROBE = 'C:\\Users\\Kenne\\tools\\ffmpeg\\ffmpeg-9.0.2-essentials_build\\bin\\ffprobe.exe';

function loadEnvLocal(): Record<string, string> {
  const envPath = path.join(ROOT, '.env.local');
  const out: Record<string, string> = {};
  if (!fs.existsSync(envPath)) return out;
  const raw = fs.readFileSync(envPath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

async function downloadFile(url: string, dest: string) {
  if (fs.existsSync(dest) && fs.statSync(dest).size > 1024) {
    console.log(`[skip] Already downloaded: ${path.basename(dest)} (${fs.statSync(dest).size} bytes)`);
    return;
  }
  console.log(`[download] Fetching ${path.basename(dest)}...`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} downloading ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(dest, buf);
  console.log(`[download] Saved ${path.basename(dest)} (${buf.length} bytes)`);
}

function probeDuration(filePath: string): number {
  const out = execFileSync(FFPROBE, [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    filePath,
  ], { encoding: 'utf8' }).trim();
  return parseFloat(out);
}

export interface VoSegmentSpec {
  id: string;
  filename: string;
  startSec: number;
  displayText: string;
  subtitleUpper: string;
  badge: string;
}

export const VO_SEGMENTS: VoSegmentSpec[] = [
  {
    id: 'vo_01_hook',
    filename: 'vo_01_hook.mp3',
    startSec: 0.35,
    displayText: 'Stop just streaming. Welcome to Plajah Chora — where sound becomes a living universe.',
    subtitleUpper: 'WELCOME TO PLAJAH CHORA · WHERE SOUND BECOMES A LIVING UNIVERSE',
    badge: '01 // THE SONIC SANCTUARY',
  },
  {
    id: 'vo_02_visualizer',
    filename: 'vo_02_visualizer.mp3',
    startSec: 5.10,
    displayText: 'Feel every beat across seven real-time visualizers, kinetic 3D lyrics, and the planetary Orrery stage.',
    subtitleUpper: '7 REAL-TIME VISUALIZERS · KINETIC 3D LYRICS · PLANETARY ORRERY STAGE',
    badge: '02 // AUDIO-REACTIVE FX STAGE',
  },
  {
    id: 'vo_03_audience',
    filename: 'vo_03_audience.mp3',
    startSec: 11.00,
    displayText: 'For audiences: bit-perfect 24-bit lossless audio, live synced Listening Parties, and the Cultural Vault.',
    subtitleUpper: '24-BIT / 192KHZ LOSSLESS FLAC · LIVE LISTENING PARTIES · CULTURAL VAULT',
    badge: '03 // AUDIENCE IMMERSION',
  },
  {
    id: 'vo_04_creators',
    filename: 'vo_04_creators.mp3',
    startSec: 16.90,
    displayText: 'For creators: mix live stems in Chora Studio, launch instant Promo Suites, and run tours and royalties in Artist Manager.',
    subtitleUpper: 'CHORA STUDIO AI STEM MIXER · AUTO-PROMO SUITE · ARTIST MANAGER OS',
    badge: '04 // CREATOR COMMAND CENTER',
  },
  {
    id: 'vo_05_cta',
    filename: 'vo_05_cta.mp3',
    startSec: 24.20,
    displayText: 'Own the stage. Command the frequency. Experience Plajah Chora today.',
    subtitleUpper: 'OWN THE STAGE · COMMAND THE FREQUENCY · EXPERIENCE PLAJAH CHORA',
    badge: '05 // ENTER CHORA NOW',
  },
];

async function generateAriaVo(
  apiKey: string,
  voiceId: string,
  modelId: string,
  seg: VoSegmentSpec
): Promise<{ id: string; filename: string; path: string; duration: number; startSec: number; displayText: string; spokenText: string }> {
  const dest = path.join(AUDIO_DIR, seg.filename);
  const spokenText = prepareSpeechText(seg.displayText);
  if (fs.existsSync(dest) && fs.statSync(dest).size > 2048) {
    const duration = probeDuration(dest);
    console.log(`[skip VO] ${seg.filename} already exists (${duration.toFixed(2)}s)`);
    return { id: seg.id, filename: seg.filename, path: dest, duration, startSec: seg.startSec, displayText: seg.displayText, spokenText };
  }

  console.log(`[Aria TTS] Generating ${seg.filename}: "${spokenText}"`);
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
      'Accept': 'audio/mpeg',
    },
    body: JSON.stringify({
      text: spokenText,
      model_id: modelId,
      voice_settings: {
        stability: 0.42,
        similarity_boost: 0.82,
        style: 0.35,
        use_speaker_boost: true,
        speed: 1.06,
      },
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`ElevenLabs error ${res.status}: ${errText}`);
  }

  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(dest, buf);
  const duration = probeDuration(dest);
  console.log(`[Aria TTS] Saved ${seg.filename} (${duration.toFixed(2)}s, ${buf.length} bytes)`);
  return { id: seg.id, filename: seg.filename, path: dest, duration, startSec: seg.startSec, displayText: seg.displayText, spokenText };
}

async function main() {
  fs.mkdirSync(AUDIO_DIR, { recursive: true });
  const env = loadEnvLocal();
  const apiKey = env.ELEVENLABS_API_KEY || process.env.ELEVENLABS_API_KEY || '';
  const voiceId = env.ELEVENLABS_ARIA_VOICE_ID || process.env.ELEVENLABS_ARIA_VOICE_ID || '';
  const modelId = env.ELEVENLABS_ARIA_MODEL || process.env.ELEVENLABS_ARIA_MODEL || 'eleven_multilingual_v2';

  if (!apiKey || !voiceId) {
    throw new Error('Missing ELEVENLABS_API_KEY or ELEVENLABS_ARIA_VOICE_ID in .env.local');
  }

  // 1. Download K-Moody Goliath EP cover art & tracks
  const coverWebp = path.join(OUT_DIR, 'goliath_cover.webp');
  const coverPng = path.join(OUT_DIR, 'goliath_cover.png');
  await downloadFile(
    'https://firebasestorage.googleapis.com/v0/b/gen-lang-client-0665118474.firebasestorage.app/o/albums%2Falbum_1777220736355_b8z8r%2Fcover_bf.webp?alt=media&token=865c808e-e6e7-4f89-b637-8d4f551f34de',
    coverWebp
  );
  if (!fs.existsSync(coverPng)) {
    execFileSync(FFMPEG, ['-y', '-i', coverWebp, coverPng]);
    console.log('[convert] Converted goliath_cover.webp -> goliath_cover.png');
  }

  // Download Track 1: GOLIATH LIONESS & Track 4: GOLIATH WAR HORNS
  const track1Mp3 = path.join(AUDIO_DIR, 'kmoody_goliath_lioness_full.mp3');
  await downloadFile(
    'https://firebasestorage.googleapis.com/v0/b/gen-lang-client-0665118474.firebasestorage.app/o/albums%2Falbum_1777220736355_b8z8r%2Ftracks%2F6qarqkzyv_01_-_K-Moody_-_GOLIATH_LIONESS_.mp3?alt=media&token=1e4b4324-390f-465b-b318-935e7345bf7a',
    track1Mp3
  );

  const track4Mp3 = path.join(AUDIO_DIR, 'kmoody_goliath_war_horns_full.mp3');
  await downloadFile(
    'https://firebasestorage.googleapis.com/v0/b/gen-lang-client-0665118474.firebasestorage.app/o/albums%2Falbum_1777220736355_b8z8r%2Ftracks%2Fyfd3ps80j_04_-_K-Moody_-_GOLIATH_WAR_HORNS.mp3?alt=media&token=31c94efe-74aa-4308-853b-cc70732c4748',
    track4Mp3
  );

  console.log(`Track 1 (GOLIATH LIONESS) duration: ${probeDuration(track1Mp3).toFixed(2)}s`);
  console.log(`Track 4 (GOLIATH WAR HORNS) duration: ${probeDuration(track4Mp3).toFixed(2)}s`);

  // 2. Generate Aria VO segments
  const voMeta = [];
  for (const seg of VO_SEGMENTS) {
    let modelToUse = modelId;
    try {
      const m = await generateAriaVo(apiKey, voiceId, modelToUse, seg);
      voMeta.push({ ...seg, ...m });
    } catch (e: any) {
      console.warn(`[Aria TTS] Primary model ${modelToUse} failed (${e.message}), retrying with eleven_turbo_v2_5...`);
      const m = await generateAriaVo(apiKey, voiceId, 'eleven_turbo_v2_5', seg);
      voMeta.push({ ...seg, ...m });
    }
  }

  // Adjust startSec automatically if any segment overlaps the next, keeping at least 0.35s gap
  let cursor = 0.35;
  for (let i = 0; i < voMeta.length; i++) {
    const item = voMeta[i];
    if (item.startSec < cursor) {
      item.startSec = Number(cursor.toFixed(2));
    }
    cursor = item.startSec + item.duration + 0.35;
    console.log(`[VO Timing] ${item.id}: ${item.startSec.toFixed(2)}s -> ${(item.startSec + item.duration).toFixed(2)}s (dur=${item.duration.toFixed(2)}s)`);
  }

  const manifestPath = path.join(OUT_DIR, 'vo_manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify({ voSegments: voMeta }, null, 2));
  console.log(`[manifest] Wrote ${manifestPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
