// Pre-render the Session Band's fixed lines in their designed ElevenLabs voices (elevenVoices.json):
// every reaction line in each character sheet, with the blanks that have a known set of fillings
// filled in ({name}; {zone} — the four SOMA zones; {intro} — every SOMA drum's intro for Amara, the
// LYRA seat openers for the players who sit there). Lines that depend on live values ({bpm}, {count},
// {chord}, {fact}…) stay on the on-device voice. Each clip is recorded with word timings (captions and
// the avatar's mouth follow it) into public/band/voice/<id>/<key>.mp3 with a manifest.json.
// Already-rendered lines are skipped, so it's safe to re-run after editing a sheet.
//
//   npx tsx scripts/band/renderBandLines.ts --dry          # count lines and characters, render nothing
//   npx tsx scripts/band/renderBandLines.ts                # everyone
//   npx tsx scripts/band/renderBandLines.ts amara theo     # just these
//
// Key: ELEVENLABS_API_KEY (environment or .env.local). Never printed.

import fs from 'node:fs';
import path from 'node:path';
import { CHARACTER_SHEETS } from '../../services/melos/beats/band/character/sheets';
import { elevenVoiceFor } from '../../services/melos/beats/band/character/voiceDesign';
import { lineKey, type LineManifest } from '../../services/melos/beats/band/live/lineAudio';
import { fixedLines } from '../../services/melos/beats/band/live/fixedLines';

const ROOT = process.cwd();
const OUT = path.join(ROOT, 'public/band/voice');
const MODEL = 'eleven_multilingual_v2';
const FORMAT = 'mp3_44100_64';

function key(): string {
  if (process.env.ELEVENLABS_API_KEY) return process.env.ELEVENLABS_API_KEY;
  const env = path.join(ROOT, '.env.local');
  const m = fs.existsSync(env) ? fs.readFileSync(env, 'utf8').match(/^ELEVENLABS_API_KEY=(.*)$/m) : null;
  if (m) return m[1].trim().replace(/^"|"$/g, '');
  throw new Error('No ELEVENLABS_API_KEY in the environment or .env.local');
}

/** Word start times (ms) from ElevenLabs' character alignment, split the way captions split. */
function wordStarts(text: string, a: { characters: string[]; character_start_times_seconds: number[] } | undefined): number[] {
  const n = text.split(/\s+/).length;
  if (a?.characters?.length) {
    const starts: number[] = [];
    let prevSpace = true;
    a.characters.forEach((c, i) => { const sp = /\s/.test(c); if (!sp && prevSpace) starts.push(Math.round(a.character_start_times_seconds[i] * 1000)); prevSpace = sp; });
    if (starts.length === n) return starts;
  }
  return [];
}

async function tts(voiceId: string, text: string): Promise<{ audio: Buffer; words: number[]; durationMs: number }> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}/with-timestamps?output_format=${FORMAT}`, {
      method: 'POST',
      headers: { 'xi-api-key': key(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, model_id: MODEL, voice_settings: { stability: 0.5, similarity_boost: 0.8, style: 0.15, use_speaker_boost: true } }),
    });
    if (res.status === 429 || res.status >= 500) { await new Promise((r) => setTimeout(r, 2000 * (attempt + 1))); continue; }
    const j: any = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`TTS ${res.status}: ${JSON.stringify(j).slice(0, 200)}`);
    const ends: number[] = j.alignment?.character_end_times_seconds ?? [];
    return { audio: Buffer.from(j.audio_base64, 'base64'), words: wordStarts(text, j.alignment), durationMs: Math.round((ends[ends.length - 1] ?? 0) * 1000) };
  }
  throw new Error('TTS kept failing (rate limit or server)');
}

async function main() {
  const args = process.argv.slice(2);
  const dry = args.includes('--dry');
  const only = args.filter((a) => !a.startsWith('--'));
  let totalLines = 0, totalChars = 0, newChars = 0;
  for (const sheet of CHARACTER_SHEETS) {
    if (only.length && !only.includes(sheet.id)) continue;
    const voice = elevenVoiceFor(sheet.id);
    if (!voice) { console.log(`${sheet.id}: no designed voice — run designBandVoices first`); continue; }
    const dir = path.join(OUT, sheet.id);
    const manifestPath = path.join(dir, 'manifest.json');
    const manifest: LineManifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : { voiceId: voice.voiceId, lines: {} };
    if (manifest.voiceId !== voice.voiceId) { // voice changed (a new pick): drop the old clips, re-render
      for (const c of Object.values(manifest.lines)) { try { fs.unlinkSync(path.join(dir, c.file)); } catch { /* gone */ } }
      manifest.voiceId = voice.voiceId;
      manifest.lines = {};
    }
    const lines = fixedLines(sheet.id);
    const todo = lines.filter((t) => !manifest.lines[lineKey(voice.voiceId, t)]);
    totalLines += lines.length;
    totalChars += lines.reduce((a, t) => a + t.length, 0);
    newChars += todo.reduce((a, t) => a + t.length, 0);
    console.log(`${sheet.id}: ${lines.length} lines, ${todo.length} to render (${todo.reduce((a, t) => a + t.length, 0)} chars)`);
    if (dry || !todo.length) continue;
    fs.mkdirSync(dir, { recursive: true });
    for (const text of todo) {
      const k = lineKey(voice.voiceId, text);
      const r = await tts(voice.voiceId, text);
      fs.writeFileSync(path.join(dir, `${k}.mp3`), r.audio);
      manifest.lines[k] = { file: `${k}.mp3`, durationMs: r.durationMs, words: r.words };
      fs.writeFileSync(manifestPath, JSON.stringify(manifest) + '\n');
      await new Promise((res) => setTimeout(res, 350));
    }
    // Drop clips for lines the sheet no longer says.
    const keep = new Set(lines.map((t) => lineKey(voice.voiceId, t)));
    for (const k of Object.keys(manifest.lines)) if (!keep.has(k)) { try { fs.unlinkSync(path.join(dir, manifest.lines[k].file)); } catch { /* gone */ } delete manifest.lines[k]; }
    fs.writeFileSync(manifestPath, JSON.stringify(manifest) + '\n');
  }
  console.log(`total: ${totalLines} lines, ${totalChars} characters; ${newChars} characters to render${dry ? ' (dry run)' : ''}`);
}

main().catch((e) => { console.error(String(e.message || e)); process.exit(1); });
