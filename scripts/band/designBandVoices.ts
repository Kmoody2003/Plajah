// Design the Session Band's voices with ElevenLabs Voice Design (text-to-voice): one voice per
// character from its brief (services/melos/beats/band/character/voiceDesign.ts). For each character
// it asks for previews, saves them to scratch/band-voices/<id>-<n>.mp3 so you can audition them, and
// saves one as a voice in the ElevenLabs account ("Plajah Band · <name>"). The voice ids land in
// services/melos/beats/band/character/elevenVoices.json.
//
//   npx tsx scripts/band/designBandVoices.ts                 # every character not designed yet
//   npx tsx scripts/band/designBandVoices.ts amara theo      # just these
//   npx tsx scripts/band/designBandVoices.ts amara --pick 2  # re-save amara from preview 2 (previews kept)
//   npx tsx scripts/band/designBandVoices.ts --force         # redo everyone
//
// Key: ELEVENLABS_API_KEY (environment or .env.local). Never printed.

import fs from 'node:fs';
import path from 'node:path';
import { VOICE_BRIEFS } from '../../services/melos/beats/band/character/voiceDesign';
import { playerById } from '../../services/melos/beats/band/roster';

const ROOT = process.cwd();
const OUT_JSON = path.join(ROOT, 'services/melos/beats/band/character/elevenVoices.json');
const PREVIEWS = path.join(ROOT, 'scratch/band-voices');
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

/** Previews from a description (newer /design endpoint, else the original create-previews). */
async function previews(description: string, text: string): Promise<{ id: string; audio: string }[]> {
  let j: any;
  try { j = await call('/text-to-voice/design', { voice_description: description, text, model_id: 'eleven_multilingual_ttv_v2' }); }
  catch (e: any) { if (e.status !== 404 && e.status !== 422 && e.status !== 405) throw e; j = await call('/text-to-voice/create-previews', { voice_description: description, text }); }
  return (j.previews ?? []).map((p: any) => ({ id: p.generated_voice_id, audio: p.audio_base_64 }));
}

async function saveVoice(name: string, description: string, generatedId: string): Promise<string> {
  let j: any;
  try { j = await call('/text-to-voice', { voice_name: name, voice_description: description, generated_voice_id: generatedId }); }
  catch (e: any) { if (e.status !== 404 && e.status !== 405) throw e; j = await call('/text-to-voice/create-voice-from-preview', { voice_name: name, voice_description: description, generated_voice_id: generatedId }); }
  return j.voice_id;
}

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const pickAt = args.indexOf('--pick');
  const pick = pickAt >= 0 ? Number(args[pickAt + 1]) : 0;
  const ids = args.filter((a, i) => !a.startsWith('--') && !(pickAt >= 0 && i === pickAt + 1));
  const done: Record<string, { voiceId: string; preview: number; name: string; designedAt: string }> = fs.existsSync(OUT_JSON) ? JSON.parse(fs.readFileSync(OUT_JSON, 'utf8')) : {};
  fs.mkdirSync(PREVIEWS, { recursive: true });

  for (const b of VOICE_BRIEFS) {
    if (ids.length && !ids.includes(b.id)) continue;
    if (done[b.id] && !force && !(ids.includes(b.id) && pickAt >= 0)) { console.log(`${b.id}: already designed (${done[b.id].name})`); continue; }
    const p = playerById(b.id);
    const name = `Plajah Band · ${p?.name ?? b.id}`;
    // Re-picking reuses the previews saved last time (their generated ids are kept beside them).
    const idsFile = path.join(PREVIEWS, `${b.id}.json`);
    let list: { id: string; audio?: string }[];
    if (pickAt >= 0 && fs.existsSync(idsFile)) list = JSON.parse(fs.readFileSync(idsFile, 'utf8'));
    else {
      list = await previews(b.prompt, b.preview);
      list.forEach((pv, n) => fs.writeFileSync(path.join(PREVIEWS, `${b.id}-${n}.mp3`), Buffer.from(pv.audio!, 'base64')));
      fs.writeFileSync(idsFile, JSON.stringify(list.map((pv) => ({ id: pv.id })), null, 1));
    }
    if (!list.length) { console.log(`${b.id}: no previews returned`); continue; }
    const chosen = Math.min(pick, list.length - 1);
    const voiceId = await saveVoice(name, b.prompt.slice(0, 1000), list[chosen].id);
    done[b.id] = { voiceId, preview: chosen, name, designedAt: new Date().toISOString() };
    fs.writeFileSync(OUT_JSON, JSON.stringify(done, null, 2) + '\n');
    console.log(`${b.id}: ${list.length} previews → saved preview ${chosen} as "${name}"`);
    await new Promise((r) => setTimeout(r, 1200));
  }
}

main().catch((e) => { console.error(String(e.message || e)); process.exit(1); });
