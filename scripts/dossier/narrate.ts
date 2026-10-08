/**
 * Voices the Dossier film narration with Gemini TTS and writes the timing file the film uses.
 *
 *   npx tsx scripts/dossier/narrate.ts [--film=douglass|ford|douglass-council|persia|partition] [--force] [--only=sceneId,sceneId]
 *
 * Output: public/dossier/douglass/film/voice/<sceneId>.m4a + public/dossier/douglass/film/narration.json
 *         (--film=ford, council style: public/dossier/ford/film/council/voice/<beatId>.m4a + narration.json keyed by beat id;
 *          the film re-times itself from those measured durations, nothing else to edit.)
 * Needs GEMINI_API_KEY (.env.local) and ffmpeg (FFMPEG_DIR or the default tools folder).
 *
 * Two voices: a narrator, and a separate reader for Douglass's own words (quote scenes), so a
 * student always hears the difference between the film describing him and him speaking.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { DOUGLASS_FILM_SCENES } from '../../data/dossier/douglassFilm';
import { FORD_COUNCIL_SHOTS } from '../../data/dossier/fordFilmCouncil';
import { DOUGLASS_COUNCIL_SHOTS } from '../../data/dossier/douglassFilmCouncil';
import { PERSIA_COUNCIL_SHOTS } from '../../data/dossier/persiaFilmCouncil';
import { PARTITION_COUNCIL_SHOTS } from '../../data/dossier/partitionFilmCouncil';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..');
const FILM = process.argv.find(a => a.startsWith('--film='))?.slice(7) ?? 'douglass';
/** Council-style films (one voiced line per beat): ford, douglass-council, persia, partition. `--film=douglass` is the earlier scene-keyed film; `--film=douglass-council` voices the council film. */
const COUNCIL_SHOTS: Record<string, { slug: string; shots: Array<{ beats?: Array<{ id: string; text: string }> }> }> = {
  ford: { slug: 'ford', shots: FORD_COUNCIL_SHOTS }, 'douglass-council': { slug: 'douglass', shots: DOUGLASS_COUNCIL_SHOTS },
  persia: { slug: 'persia', shots: PERSIA_COUNCIL_SHOTS }, partition: { slug: 'partition', shots: PARTITION_COUNCIL_SHOTS },
};
const COUNCIL = COUNCIL_SHOTS[FILM];
const OUT = COUNCIL ? path.join(ROOT, 'public', 'dossier', COUNCIL.slug, 'film', 'council') : path.join(ROOT, 'public', 'dossier', 'douglass', 'film');
const PUBLIC_VOICE = COUNCIL ? `/dossier/${COUNCIL.slug}/film/council/voice` : '/dossier/douglass/film/voice';
const VOICE_DIR = path.join(OUT, 'voice');
const FFDIR = process.env.FFMPEG_DIR || 'C:\\Users\\Kenne\\tools\\ffmpeg\\ffmpeg-9.0.2-essentials_build\\bin';
const FFMPEG = path.join(FFDIR, 'ffmpeg.exe'), FFPROBE = path.join(FFDIR, 'ffprobe.exe');

function env(name: string): string | undefined {
  if (process.env[name]) return process.env[name];
  for (const f of ['.env.local', '.env']) {
    const p = path.join(ROOT, f);
    if (!fs.existsSync(p)) continue;
    const m = fs.readFileSync(p, 'utf8').match(new RegExp(`^\\s*${name}\\s*=\\s*"?([^"\\r\\n]+)"?`, 'm'));
    if (m) return m[1].trim();
  }
}

const KEY = env('GEMINI_API_KEY');
if (!KEY) { console.error('GEMINI_API_KEY is not set (.env.local).'); process.exit(1); }

// One model for the whole film so the narrator's timbre never shifts mid-film (override: TTS_MODEL=...).
const MODELS = [process.env.TTS_MODEL ?? 'gemini-2.5-flash-preview-tts'];
const NARRATOR = { voice: 'Gacrux', style: 'You are the narrator of a high-end historical documentary for students. Read warmly and clearly, with measured pacing, gravity and quiet wonder; never theatrical. Read exactly this text:' };
const FORD_NARRATOR = { voice: 'Gacrux', style: 'You are the narrator of a sober, rigorous historical documentary for students. Read plainly and clearly at a steady documentary pace of about 150 words per minute, with dignity, without long pauses; no drama, no emphasis beyond the sense of the words, the same even tone for every line, including the hardest. Read exactly this text:' };
const ORATOR = { voice: 'Alnilam', style: 'Read these words of the nineteenth-century orator Frederick Douglass as they would be delivered from a lectern: resonant, deliberate, unhurried, with conviction and controlled anger. Read exactly this text:' };

const force = process.argv.includes('--force');
const only = process.argv.find(a => a.startsWith('--only='))?.slice(7).split(',');

function wav(pcm: Buffer, rate = 24000): Buffer {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8); h.write('fmt ', 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

async function speak(text: string, who: typeof NARRATOR): Promise<Buffer> {
  let last = '';
  for (const model of MODELS) {
    for (let attempt = 0; attempt < 10; attempt++) {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': KEY! },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `${who.style}\n\n${text}` }] }],
          generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: who.voice } } } },
        }),
      });
      let wait = 4000 * (attempt + 1);
      if (res.ok) {
        const j: any = await res.json();
        const data = j.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData)?.inlineData?.data;
        if (data) return Buffer.from(data, 'base64');
        last = `no audio in response from ${model}`;
      } else {
        const body = await res.text();
        last = `${model} ${res.status} ${body.slice(0, 300)}`;
        if (res.status === 404 || res.status === 400) break;   // try the next model
        if (res.status === 429) {
          // Per-minute quota: wait as long as the API asks (retryDelay "37s"), then retry.
          const secs = Number(/"retryDelay":\s*"(\d+(?:\.\d+)?)s"/.exec(body)?.[1] ?? 30);
          if (/PerDay/i.test(body) && attempt >= 2) break;   // daily cap: give up on this model
          wait = (secs + 3) * 1000;
          if (wait > 10 * 60 * 1000) throw new Error(`${model} quota exhausted (retry in ${Math.round(wait / 3600000)} h); the film stays silent on estimated timing until narration is produced`);
          console.log(`  ${model} rate-limited; waiting ${Math.round(wait / 1000)}s`);
        }
      }
      await new Promise(r => setTimeout(r, wait));
    }
  }
  throw new Error(last);
}

const duration = (f: string) => Number(execFileSync(FFPROBE, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', f]).toString().trim());

fs.mkdirSync(VOICE_DIR, { recursive: true });
const timingPath = path.join(OUT, 'narration.json');
const timings: Record<string, { audio: string; duration: number; voice: string }> = fs.existsSync(timingPath) ? JSON.parse(fs.readFileSync(timingPath, 'utf8')) : {};

type Item = { id: string; text: string; who: typeof NARRATOR };
const items: Item[] = COUNCIL
  ? COUNCIL.shots.flatMap(s => (s.beats ?? []).map(b => ({ id: b.id, text: b.text, who: FORD_NARRATOR })))
  : DOUGLASS_FILM_SCENES.filter(s => s.narration).map(s => ({ id: s.id, text: s.narration!.text, who: s.kind === 'quote' && s.narration!.text === s.text ? ORATOR : NARRATOR }));

for (const it of items) {
  if (only && !only.includes(it.id)) continue;
  const m4a = path.join(VOICE_DIR, `${it.id}.m4a`);
  if (!force && fs.existsSync(m4a) && timings[it.id]) { console.log(`${it.id}: cached`); continue; }
  const who = it.who;
  const pcm = await speak(it.text, who);
  const words = it.text.split(/\s+/).length;
  const tmp = path.join(VOICE_DIR, `${it.id}.wav`);
  fs.writeFileSync(tmp, wav(pcm));
  // Trim leading/trailing silence, gentle broadcast loudness, AAC.
  // Gemini reads this style slowly (about 110 words a minute); the council films are written for 140 to 150, so the council
  // narration is sped up with atempo (pitch preserved) when the raw read is slower than 135 wpm, capped at 1.3x.
  const raw = duration(tmp);
  const wpm = words / (raw / 60);
  const tempo = COUNCIL && wpm < 135 ? Math.min(1.3, 144 / wpm) : 1;
  execFileSync(FFMPEG, ['-y', '-v', 'error', '-i', tmp, '-af',
    `${tempo > 1 ? `atempo=${tempo.toFixed(3)},` : ''}silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.05,areverse,silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.1,areverse,loudnorm=I=-18:TP=-2:LRA=9`,
    '-ar', '48000', '-c:a', 'aac', '-b:a', '160k', m4a]);
  fs.unlinkSync(tmp);
  timings[it.id] = { audio: `${PUBLIC_VOICE}/${it.id}.m4a`, duration: Math.round(duration(m4a) * 100) / 100, voice: who.voice };
  fs.writeFileSync(timingPath, JSON.stringify(timings, null, 2));
  console.log(`${it.id}: ${timings[it.id].duration}s (${who.voice})`);
}
console.log(`wrote ${timingPath}`);
