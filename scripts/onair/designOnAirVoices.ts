// Design the Plajah FM staff's voices with ElevenLabs Voice Design, from each persona sheet's voice
// brief (services/onair/hosts.ts, artists.ts). Same flow as the Session Band (scripts/band):
//
//   npx tsx scripts/onair/designOnAirVoices.ts               # 3 previews for every persona without previews yet
//   npx tsx scripts/onair/designOnAirVoices.ts kit --new     # fresh previews for kit
//   npx tsx scripts/onair/designOnAirVoices.ts kit --pick 1  # save preview 1 as kit's voice ("Plajah FM · Kit Brennan")
//
// Previews go to scratch/onair-voices/<id>-<n>.mp3 (audition them in scripts/onair/voicePicker.ts).
// Picked voice ids land in services/onair/elevenVoices.json, which the server reads to voice lines.
// Key: ELEVENLABS_API_KEY (environment or .env.local). Never printed.

import fs from 'node:fs';
import path from 'node:path';
import { ALL_PERSONAS } from '../../services/onair/roster';
import type { PersonaSheet } from '../../services/onair/types';

const ROOT = process.cwd();
const OUT_JSON = path.join(ROOT, 'services/onair/elevenVoices.json');
const PREVIEWS = path.join(ROOT, 'scratch/onair-voices');
const API = 'https://api.elevenlabs.io/v1';

function key(): string {
  if (process.env.ELEVENLABS_API_KEY) return process.env.ELEVENLABS_API_KEY;
  const env = path.join(ROOT, '.env.local');
  if (fs.existsSync(env)) {
    const m = fs.readFileSync(env, 'utf8').match(/^ELEVENLABS_API_KEY=(.*)$/m);
    if (m) return m[1].trim().replace(/^"|"$/g, '');
  }
  throw new Error('No ELEVENLABS_API_KEY in the environment or .env.local');
}

async function call(pathname: string, body: unknown): Promise<any> {
  const res = await fetch(`${API}${pathname}`, { method: 'POST', headers: { 'xi-api-key': key(), 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const text = await res.text();
  if (!res.ok) throw Object.assign(new Error(`${pathname} → ${res.status}: ${text.slice(0, 300)}`), { status: res.status });
  return JSON.parse(text);
}

/** The Voice Design description (20–1000 chars) built from the persona's brief. */
export function voiceDescription(p: PersonaSheet): string {
  const who = /^she/i.test(p.pronouns) ? 'woman' : /^he/i.test(p.pronouns) ? 'man' : 'androgynous person';
  const role = p.kind === 'host' ? (p.show?.format === 'dj' ? 'overnight radio DJ' : 'radio host') : `${p.artist?.genre ?? ''} recording artist`;
  const v = p.voice;
  const d = `A ${who} in their ${v.ageRange}, a ${role}. Voice: ${v.timbre}. Accent: ${v.accent}. Pace: ${v.pace}. ${v.castingNotes} Studio-quality, close-mic broadcast recording, no background noise.`;
  return d.slice(0, 1000);
}

/** Preview text: the audition lines (ElevenLabs wants 100–1000 characters). */
export function previewText(p: PersonaSheet): string {
  let t = p.voice.auditionLines.join(' ');
  if (t.length < 100) t += ` This is ${p.stageName} on Plajah.`;
  return t.slice(0, 1000);
}

async function previews(p: PersonaSheet): Promise<{ id: string; audio: string }[]> {
  let j: any;
  try { j = await call('/text-to-voice/design', { voice_description: voiceDescription(p), text: previewText(p), model_id: 'eleven_multilingual_ttv_v2' }); }
  catch (e: any) { if (![404, 405, 422].includes(e.status)) throw e; j = await call('/text-to-voice/create-previews', { voice_description: voiceDescription(p), text: previewText(p) }); }
  return (j.previews ?? []).map((x: any) => ({ id: x.generated_voice_id, audio: x.audio_base_64 }));
}

async function saveVoice(name: string, description: string, generatedId: string): Promise<string> {
  let j: any;
  try { j = await call('/text-to-voice', { voice_name: name, voice_description: description, generated_voice_id: generatedId }); }
  catch (e: any) { if (![404, 405].includes(e.status)) throw e; j = await call('/text-to-voice/create-voice-from-preview', { voice_name: name, voice_description: description, generated_voice_id: generatedId }); }
  return j.voice_id;
}

async function main() {
  const args = process.argv.slice(2);
  const fresh = args.includes('--new');
  const pickAt = args.indexOf('--pick');
  const ids = args.filter((a, i) => !a.startsWith('--') && !(pickAt >= 0 && i === pickAt + 1));
  const done: Record<string, { voiceId: string; preview: number; name: string; designedAt: string }> = fs.existsSync(OUT_JSON) ? JSON.parse(fs.readFileSync(OUT_JSON, 'utf8')) : {};
  fs.mkdirSync(PREVIEWS, { recursive: true });

  for (const p of ALL_PERSONAS) {
    if (ids.length && !ids.includes(p.id)) continue;
    const idsFile = path.join(PREVIEWS, `${p.id}.json`);

    if (pickAt >= 0) {
      const n = Number(args[pickAt + 1]);
      if (!fs.existsSync(idsFile)) { console.log(`${p.id}: no previews yet — run without --pick first`); continue; }
      const list: { id: string }[] = JSON.parse(fs.readFileSync(idsFile, 'utf8'));
      if (!list[n]) { console.log(`${p.id}: no preview ${n}`); continue; }
      const name = `Plajah FM · ${p.stageName}`;
      const voiceId = await saveVoice(name, voiceDescription(p), list[n].id);
      done[p.id] = { voiceId, preview: n, name, designedAt: new Date().toISOString() };
      fs.writeFileSync(OUT_JSON, JSON.stringify(done, null, 2) + '\n');
      console.log(`${p.id}: saved preview ${n} as "${name}"`);
      continue;
    }

    if (fs.existsSync(idsFile) && !fresh) { console.log(`${p.id}: previews already made`); continue; }
    const list = await previews(p);
    list.forEach((pv, n) => fs.writeFileSync(path.join(PREVIEWS, `${p.id}-${n}.mp3`), Buffer.from(pv.audio, 'base64')));
    fs.writeFileSync(idsFile, JSON.stringify(list.map((pv) => ({ id: pv.id })), null, 1));
    console.log(`${p.id}: ${list.length} previews`);
    await new Promise((r) => setTimeout(r, 1200));
  }
}

if (process.argv[1] && /designOnAirVoices/.test(process.argv[1])) main().catch((e) => { console.error(String(e.message || e)); process.exit(1); });
