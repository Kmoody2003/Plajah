/**
 * Taleo Story Intelligence — Phase 1 pipeline.
 *
 * Watches a published movie (Mux-hosted) and produces a StoryReport. Four stages, each
 * checkpointed to the job doc `taleoAnalysis/{albumId}`:
 *
 *   S1 SAMPLING    ffmpeg: 360p proxy ← Mux HLS, shot detection, 600s chunks, ≤48 stills
 *   S2 PERCEIVING  Gemini (raw REST, Files API): per-chunk beats/dialogue/people JSON
 *   S3 REASONING   Pokee (or Gemini fallback): whole-film synthesis → structure/characters/scenes
 *   S4 ASSEMBLING  stills→scenes mapping, report.json + transcript.json → Cloud Storage
 *
 * Statuses: QUEUED → SAMPLING → PERCEIVING → REASONING → ASSEMBLING → READY | PARTIAL | FAILED.
 *
 * Firestore doc discipline (see lib.ts): numbers are ALWAYS integers on the wire — money is
 * integer microdollars, times are integer seconds/ms, percentages whole numbers.
 */
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  firestorePatch, firestoreGet, storageUpload, runFfmpeg, runFfprobe, sleep,
} from './lib.ts';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface StoryJob {
  albumId: string;
  ownerId: string;
  muxPlaybackId: string;
  title: string;
  durationSec?: number;
  /** Creator-entered cast names, if the album carried any. Evidence for S3 naming only. */
  cast?: string[];
}

interface ChunkPerception {
  chunkIndex: number;
  offsetSec: number;
  beats: { tSec: number; action: string; setting: string }[];
  dialogue: { tSec: number; speaker: string; text: string }[];
  people: { label: string; descriptor: string; firstSeenTSec: number }[];
}

interface Usage {
  byLane: Record<string, { inTokens: number; outTokens: number; usdMicros: number; calls: number }>;
  totalUsdMicros: number;
}

// ── Pricing (documented approximations) ───────────────────────────────────────
//
// Gemini 3.6 Flash list pricing: $0.30/M input tokens (text + video frames), $1.00/M input
// tokens (audio), $2.50/M output. The usageMetadata promptTokenCount does not split
// audio-vs-video for us per call, so input is billed here at a BLENDED $0.45/M — a film chunk
// is mostly video-frame tokens with a minority audio share, and 0.30 + a ~20% audio share at
// 1.00 lands near 0.45. This is an ESTIMATE for the cost guard and the job doc, not invoicing.
// Pokee (pokee-isaac): $0.15/M in, $1.00/M out.
//
// Microdollars per TOKEN = dollars-per-million (1 token at $0.45/M costs 0.45 µ$).
const GEMINI_IN_MICROS_PER_TOKEN = 0.45;
const GEMINI_OUT_MICROS_PER_TOKEN = 2.5;
const POKEE_IN_MICROS_PER_TOKEN = 0.15;
const POKEE_OUT_MICROS_PER_TOKEN = 1.0;

const GEMINI_MODEL = 'gemini-3.6-flash';
const GEMINI_BASE = 'https://generativelanguage.googleapis.com';

const geminiKey = () => process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY || '';
const maxUsdMicros = () => Math.round(parseFloat(process.env.STORY_MAX_USD || '2') * 1_000_000);

// ── Job-doc helpers ───────────────────────────────────────────────────────────

const jobPath = (albumId: string) => `taleoAnalysis/${albumId}`;

async function patchJob(albumId: string, fields: Record<string, unknown>) {
  await firestorePatch(jobPath(albumId), { ...fields, updatedAt: Date.now() });
}

async function setProgress(albumId: string, status: string, stage: string, pct: number, note = '') {
  await patchJob(albumId, { status, progress: { stage, pct: Math.round(pct), note } });
}

function addUsage(usage: Usage, lane: string, inTokens: number, outTokens: number, inRate: number, outRate: number) {
  const cur = usage.byLane[lane] || { inTokens: 0, outTokens: 0, usdMicros: 0, calls: 0 };
  cur.inTokens += inTokens;
  cur.outTokens += outTokens;
  cur.usdMicros += Math.round(inTokens * inRate + outTokens * outRate);
  cur.calls += 1;
  usage.byLane[lane] = cur;
  usage.totalUsdMicros = Object.values(usage.byLane).reduce((s, l) => s + l.usdMicros, 0);
}

/** Usage in job-doc shape: integers only, plus a human-readable dollar string. */
function usageDoc(usage: Usage) {
  return {
    byLane: usage.byLane,
    totalUsdMicros: usage.totalUsdMicros,
    totalUsd: (usage.totalUsdMicros / 1_000_000).toFixed(4), // string — never a float field
  };
}

// ── S1: SAMPLING ──────────────────────────────────────────────────────────────

interface Sampled {
  proxyPath: string;
  durationSec: number;
  shots: number[]; // boundary timestamps (sec)
  sceneThreshold: number;
  chunks: { path: string; offsetSec: number; durationSec: number }[];
  stills: { index: number; tSec: number; storagePath: string }[];
}

function parseShowinfoTimes(stderr: string): number[] {
  const out: number[] = [];
  const re = /pts_time:([0-9]+(?:\.[0-9]+)?)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(stderr))) out.push(parseFloat(m[1]));
  return out.sort((a, b) => a - b);
}

async function detectShots(proxyPath: string, threshold: number, timeoutMs: number): Promise<number[]> {
  // Full stderr capture (8MB cap) — showinfo emits one line per detected boundary.
  const r = await runFfmpeg(
    ['-hide_banner', '-i', proxyPath, '-vf', `select='gt(scene,${threshold})',showinfo`, '-f', 'null', '-'],
    timeoutMs, 8 * 1024 * 1024,
  );
  if (!r.ok) throw new Error(`shot detection failed: ${r.err.slice(-500)}`);
  return parseShowinfoTimes(r.err);
}

async function stageSampling(job: StoryJob, tmp: string): Promise<Sampled> {
  const { albumId, ownerId, muxPlaybackId } = job;
  await setProgress(albumId, 'SAMPLING', 'proxy', 2, 'pulling proxy from Mux');

  // 360p mono proxy from the Mux HLS master. Everything downstream reads this file, so the
  // origin is touched exactly once.
  const proxyPath = path.join(tmp, 'proxy.mp4');
  const pull = await runFfmpeg([
    '-y', '-hide_banner', '-loglevel', 'error',
    '-i', `https://stream.mux.com/${muxPlaybackId}.m3u8`,
    '-vf', 'scale=-2:360',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '28',
    '-c:a', 'aac', '-b:a', '64k', '-ac', '1',
    proxyPath,
  ], 50 * 60 * 1000);
  if (!pull.ok) throw new Error(`proxy transcode failed: ${pull.err.slice(-500)}`);

  const probe = await runFfprobe(proxyPath);
  const durationSec = parseFloat(probe.json?.format?.duration || '0') || job.durationSec || 0;
  if (!durationSec) throw new Error('proxy has no readable duration');

  // Shot detection. A hyperactive cut rate (>2000 boundaries) re-runs once at a higher
  // threshold rather than flooding S3 with noise.
  await setProgress(albumId, 'SAMPLING', 'shots', 10, 'detecting shot boundaries');
  const shotTimeout = Math.max(10 * 60 * 1000, durationSec * 250);
  let sceneThreshold = 0.30;
  let shots = await detectShots(proxyPath, sceneThreshold, shotTimeout);
  if (shots.length > 2000) {
    sceneThreshold = 0.40;
    shots = await detectShots(proxyPath, sceneThreshold, shotTimeout);
  }

  // 600s chunks, stream-copied (keyframe-aligned, so per-chunk durations are probed rather
  // than assumed — offsets are the cumulative sum of REAL durations).
  await setProgress(albumId, 'SAMPLING', 'segment', 16, 'segmenting proxy');
  const seg = await runFfmpeg([
    '-y', '-hide_banner', '-loglevel', 'error', '-i', proxyPath,
    '-c', 'copy', '-f', 'segment', '-segment_time', '600', '-reset_timestamps', '1',
    path.join(tmp, 'chunk_%03d.mp4'),
  ], 15 * 60 * 1000);
  if (!seg.ok) throw new Error(`segmentation failed: ${seg.err.slice(-500)}`);

  const chunkFiles = (await fs.readdir(tmp)).filter(f => /^chunk_\d{3}\.mp4$/.test(f)).sort();
  if (!chunkFiles.length) throw new Error('segmentation produced no chunks');
  const chunks: Sampled['chunks'] = [];
  let offset = 0;
  for (const f of chunkFiles) {
    const p = path.join(tmp, f);
    const pr = await runFfprobe(p);
    const d = parseFloat(pr.json?.format?.duration || '0') || 600;
    chunks.push({ path: p, offsetSec: offset, durationSec: d });
    offset += d;
  }

  // Stills: up to 48 scene midpoints, chosen to cover the runtime evenly. Scene midpoints
  // come from consecutive boundaries (with 0 and EOF as implicit boundaries); if detection
  // found almost nothing, fall back to a plain even spread.
  await setProgress(albumId, 'SAMPLING', 'stills', 20, 'extracting stills');
  const bounds = [0, ...shots.filter(t => t > 0.5 && t < durationSec - 0.5), durationSec];
  let midpoints: number[] = [];
  for (let i = 0; i < bounds.length - 1; i++) {
    if (bounds[i + 1] - bounds[i] >= 1) midpoints.push((bounds[i] + bounds[i + 1]) / 2);
  }
  const want = Math.min(48, Math.max(8, Math.floor(durationSec / 60) + 1));
  let picks: number[];
  if (midpoints.length <= want) {
    picks = midpoints.length ? midpoints
      : Array.from({ length: want }, (_, i) => ((i + 0.5) * durationSec) / want);
  } else {
    picks = [];
    const used = new Set<number>();
    for (let i = 0; i < want; i++) {
      const target = ((i + 0.5) * durationSec) / want;
      let best = -1; let bestDist = Infinity;
      for (let j = 0; j < midpoints.length; j++) {
        if (used.has(j)) continue;
        const d = Math.abs(midpoints[j] - target);
        if (d < bestDist) { bestDist = d; best = j; }
      }
      if (best >= 0) { used.add(best); picks.push(midpoints[best]); }
    }
    picks.sort((a, b) => a - b);
  }

  const stills: Sampled['stills'] = [];
  for (let i = 0; i < picks.length; i++) {
    const t = Math.max(0, Math.min(durationSec - 0.5, picks[i]));
    const jpg = path.join(tmp, `still_${i}.jpg`);
    const r = await runFfmpeg([
      '-y', '-hide_banner', '-loglevel', 'error',
      '-ss', t.toFixed(2), '-i', proxyPath, '-frames:v', '1', '-q:v', '3', jpg,
    ], 60_000);
    if (!r.ok) continue; // one bad still is not worth failing the film
    const buf = await fs.readFile(jpg).catch(() => null);
    if (!buf || buf.length < 100) continue;
    const tSec = Math.round(t);
    const storagePath = `taleoAnalysis/${ownerId}/${albumId}/stills/${i}_${tSec}.jpg`;
    if (await storageUpload(storagePath, buf, 'image/jpeg')) {
      stills.push({ index: i, tSec, storagePath });
    }
  }

  await patchJob(albumId, {
    checkpoint: { stage: 'SAMPLING', chunkIndex: -1 },
    counts: { shots: shots.length, chunks: chunks.length, stills: stills.length },
  });
  return { proxyPath, durationSec, shots, sceneThreshold, chunks, stills };
}

// ── S2: PERCEIVING (Gemini raw REST + Files API) ──────────────────────────────

const PERCEIVE_PROMPT = `You are a meticulous film script supervisor logging ONE segment of a longer film. Watch and listen to this entire video clip and return STRICT JSON only, matching exactly:
{"beats":[{"tSec":number,"action":string,"setting":string}],"dialogue":[{"tSec":number,"speaker":string,"text":string}],"people":[{"label":string,"descriptor":string,"firstSeenTSec":number}]}

Rules:
- All timestamps are SECONDS RELATIVE TO THE START OF THIS CLIP (0 = clip start).
- "beats": every meaningful story action or visual event, in order, with a terse setting (e.g. "kitchen, night").
- "dialogue": every clearly audible spoken or sung line, verbatim where possible.
- "speaker": use consistent labels PERSON-A, PERSON-B, PERSON-C... — the SAME label for the same person throughout THIS clip. NEVER invent proper names; use a real name ONLY if it is spoken aloud or shown on screen (credits, captions), and even then keep the PERSON-x label and put the name in that person's descriptor.
- "people": one entry per distinct person seen, with a physical/wardrobe descriptor precise enough to re-identify them in other clips (e.g. "woman, 40s, red coat, grey braid").
- NEVER invent events, dialogue, or people that are not actually in the clip. If the clip has no dialogue, return an empty dialogue array.`;

/** Resumable upload to the Gemini Files API: start → upload+finalize → poll until ACTIVE. */
async function geminiUploadFile(buf: Buffer, displayName: string): Promise<{ name: string; uri: string }> {
  const key = geminiKey();
  const start = await fetch(`${GEMINI_BASE}/upload/v1beta/files?key=${key}`, {
    method: 'POST',
    headers: {
      'X-Goog-Upload-Protocol': 'resumable',
      'X-Goog-Upload-Command': 'start',
      'X-Goog-Upload-Header-Content-Length': String(buf.length),
      'X-Goog-Upload-Header-Content-Type': 'video/mp4',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ file: { display_name: displayName } }),
  });
  if (!start.ok) throw new Error(`files start HTTP ${start.status}: ${(await start.text()).slice(0, 200)}`);
  const uploadUrl = start.headers.get('x-goog-upload-url');
  if (!uploadUrl) throw new Error('files start returned no x-goog-upload-url');

  const up = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'Content-Length': String(buf.length),
      'X-Goog-Upload-Offset': '0',
      'X-Goog-Upload-Command': 'upload, finalize',
    },
    body: buf as any,
  });
  if (!up.ok) throw new Error(`files upload HTTP ${up.status}: ${(await up.text()).slice(0, 200)}`);
  const meta = (await up.json() as any).file;
  if (!meta?.name || !meta?.uri) throw new Error('files upload returned no file name/uri');

  // Poll until the service has processed the video (state ACTIVE). ~10 min ceiling.
  const deadline = Date.now() + 10 * 60 * 1000;
  let state = meta.state;
  while (state === 'PROCESSING' && Date.now() < deadline) {
    await sleep(4000);
    const poll = await fetch(`${GEMINI_BASE}/v1beta/${meta.name}?key=${key}`);
    if (!poll.ok) continue;
    state = ((await poll.json()) as any).state;
  }
  if (state !== 'ACTIVE') throw new Error(`gemini file never became ACTIVE (state=${state})`);
  return { name: meta.name, uri: meta.uri };
}

async function geminiDeleteFile(name: string) {
  try { await fetch(`${GEMINI_BASE}/v1beta/${name}?key=${geminiKey()}`, { method: 'DELETE' }); } catch { /* */ }
}

function extractJson(text: string): any {
  try { return JSON.parse(text); } catch { /* fall through */ }
  const a = text.indexOf('{'); const b = text.lastIndexOf('}');
  if (a >= 0 && b > a) { try { return JSON.parse(text.slice(a, b + 1)); } catch { /* */ } }
  throw new Error(`model returned non-JSON: ${text.slice(0, 200)}`);
}

/**
 * generateContent for one uploaded chunk. MEDIA_RESOLUTION_LOW keeps a 10-minute clip inside
 * a sane token budget; if the API version deployed rejects the field, retry once without it
 * (the caller notes the degradation on the job doc).
 */
async function geminiPerceiveChunk(fileUri: string, usage: Usage): Promise<{ parsed: any; mediaResolutionRejected: boolean }> {
  const key = geminiKey();
  const body = (withMediaRes: boolean) => JSON.stringify({
    contents: [{ parts: [
      { fileData: { fileUri, mimeType: 'video/mp4' } },
      { text: PERCEIVE_PROMPT },
    ] }],
    generationConfig: {
      responseMimeType: 'application/json',
      maxOutputTokens: 8192,
      thinkingConfig: { thinkingLevel: 'minimal' },
      ...(withMediaRes ? { mediaResolution: 'MEDIA_RESOLUTION_LOW' } : {}),
    },
  });

  let mediaResolutionRejected = false;
  let res = await fetch(`${GEMINI_BASE}/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body(true),
  });
  if (res.status === 400) {
    const errText = await res.text();
    if (/media_?resolution/i.test(errText)) {
      mediaResolutionRejected = true;
      res = await fetch(`${GEMINI_BASE}/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body(false),
      });
    } else {
      throw new Error(`generateContent HTTP 400: ${errText.slice(0, 300)}`);
    }
  }
  if (!res.ok) throw new Error(`generateContent HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json() as any;
  const um = data.usageMetadata || {};
  addUsage(usage, GEMINI_MODEL,
    Number(um.promptTokenCount) || 0, Number(um.candidatesTokenCount) || 0,
    GEMINI_IN_MICROS_PER_TOKEN, GEMINI_OUT_MICROS_PER_TOKEN);
  const text = (data.candidates?.[0]?.content?.parts || []).map((p: any) => p.text || '').join('');
  if (!text) throw new Error(`generateContent returned no text (finishReason=${data.candidates?.[0]?.finishReason})`);
  return { parsed: extractJson(text), mediaResolutionRejected };
}

async function stagePerceiving(
  job: StoryJob, sampled: Sampled, usage: Usage,
): Promise<{ perceptions: ChunkPerception[]; failedChunks: number[]; notes: string[] }> {
  const { albumId } = job;
  if (!geminiKey()) throw new Error('GEMINI_API_KEY / GOOGLE_AI_API_KEY not set');
  const perceptions: ChunkPerception[] = [];
  const failedChunks: number[] = [];
  const notes: string[] = [];
  let notedMediaRes = false;

  for (let i = 0; i < sampled.chunks.length; i++) {
    const chunk = sampled.chunks[i];
    const pct = 22 + Math.round((i / sampled.chunks.length) * 43); // 22 → 65
    await setProgress(albumId, 'PERCEIVING', 'perceive', pct, `chunk ${i + 1}/${sampled.chunks.length}`);

    let done = false;
    for (let attempt = 0; attempt < 3 && !done; attempt++) {
      let fileName = '';
      try {
        const buf = await fs.readFile(chunk.path);
        const file = await geminiUploadFile(buf, `${albumId}_chunk_${i}`);
        fileName = file.name;
        const { parsed, mediaResolutionRejected } = await geminiPerceiveChunk(file.uri, usage);
        if (mediaResolutionRejected && !notedMediaRes) {
          notedMediaRes = true;
          notes.push('mediaResolution rejected by API — chunks perceived at default resolution');
        }
        const off = chunk.offsetSec;
        perceptions.push({
          chunkIndex: i,
          offsetSec: Math.round(off),
          beats: (Array.isArray(parsed.beats) ? parsed.beats : []).map((b: any) => ({
            tSec: Math.round(off + (Number(b.tSec) || 0)),
            action: String(b.action || '').slice(0, 500),
            setting: String(b.setting || '').slice(0, 200),
          })),
          dialogue: (Array.isArray(parsed.dialogue) ? parsed.dialogue : []).map((d: any) => ({
            tSec: Math.round(off + (Number(d.tSec) || 0)),
            speaker: String(d.speaker || 'PERSON-?').slice(0, 60),
            text: String(d.text || '').slice(0, 1000),
          })),
          people: (Array.isArray(parsed.people) ? parsed.people : []).map((p: any) => ({
            label: String(p.label || 'PERSON-?').slice(0, 60),
            descriptor: String(p.descriptor || '').slice(0, 300),
            firstSeenTSec: Math.round(off + (Number(p.firstSeenTSec) || 0)),
          })),
        });
        done = true;
      } catch (e: any) {
        console.error(`[perceive] chunk ${i} attempt ${attempt + 1} failed:`, e?.message || e);
        if (attempt < 2) await sleep([2000, 8000, 20000][attempt]);
      } finally {
        if (fileName) await geminiDeleteFile(fileName);
      }
    }
    if (!done) failedChunks.push(i);

    await patchJob(albumId, { checkpoint: { stage: 'PERCEIVING', chunkIndex: i }, usage: usageDoc(usage) });

    if (usage.totalUsdMicros > maxUsdMicros()) {
      notes.push(`cost guard tripped during PERCEIVING at chunk ${i} — remaining chunks skipped`);
      for (let j = i + 1; j < sampled.chunks.length; j++) failedChunks.push(j);
      break;
    }
  }

  if (!perceptions.length) throw new Error('every chunk failed perception');
  return { perceptions, failedChunks, notes };
}

// ── S3: REASONING (Pokee direct; Gemini fallback) ─────────────────────────────

const REPORT_SCHEMA_TEXT = `{
  "logline": string,
  "synopsis": string,
  "themes": string[],
  "structure": { "acts": [{ "number": number, "title": string, "startSec": number, "endSec": number, "summary": string, "turningPoint": string }] },
  "characters": [{ "refId": string, "name": string, "aka": string[], "tier": "MAIN"|"SUPPORTING"|"MINOR", "description": string, "arc": string, "appearances": [{ "sceneId": string, "tSec": number }], "screenTimeSec": number, "dialogueLines": number, "confidence": number, "evidence": string[] }],
  "scenes": [{ "id": string, "index": number, "slugline": string, "title": string, "summary": string, "startSec": number, "endSec": number, "actNumber": number, "sequenceId": string, "locationRefId": string, "timeOfDay": string, "mood": string, "characterRefIds": string[], "stillIndexes": number[] }],
  "sequences": [{ "id": string, "title": string, "sceneIds": string[], "purpose": string }],
  "locations": [{ "refId": string, "name": string, "description": string, "kind": string, "sceneIds": string[], "confidence": number }],
  "macguffins": [{ "refId": string, "name": string, "description": string, "narrativeRole": "MACGUFFIN"|"KEY_PROP"|"MOTIF", "sceneIds": string[], "evidence": string[], "confidence": number }]
}`;

function reasoningInstructions(job: StoryJob): string {
  return `You are a senior story analyst. Below is a chunk-by-chunk perception log of the film "${job.title}" (beats, dialogue, people), produced by a script supervisor watching consecutive segments. All timestamps are ABSOLUTE seconds from the start of the film. Person labels are namespaced per chunk as "CH<n>:PERSON-X" — the SAME real person appears under DIFFERENT labels in different chunks.

Your tasks:
1. Resolve person identities ACROSS chunks using the descriptors and dialogue (e.g. CH1:PERSON-A and CH7:PERSON-C are the same character). Merge them into one character each.
2. Name characters ONLY from evidence: a name spoken in dialogue, shown in credits/captions, or in the creator-provided cast list below. When no name is evidenced, use a memorable descriptor name in caps (e.g. "THE KEEPER", "RED COAT WOMAN") — never invent a plausible-sounding proper name.
3. Tier each character MAIN / SUPPORTING / MINOR by narrative weight and screen presence.
4. Segment the film into scenes at location or time shifts. Each scene gets a slugline ("INT. KITCHEN - NIGHT" style), startSec, endSec, characters present, and a summary.
5. Group scenes into sequences, and sequences into exactly 3 acts.
6. Write a logline, a synopsis, and the major themes.
7. List distinct locations, and any macguffins / key props / recurring motifs (narrativeRole one of MACGUFFIN, KEY_PROP, MOTIF).
8. Every character, location, and macguffin carries "confidence" 0..1 and "evidence" — short strings quoting or citing the perception log (with timestamps).

NEVER invent events, characters, or dialogue not present in the log. Where the log is ambiguous, lower the confidence rather than guessing.

Return STRICT JSON only, exactly matching this schema:
${REPORT_SCHEMA_TEXT}`;
}

function buildCorpus(job: StoryJob, sampled: Sampled, perceptions: ChunkPerception[]): string {
  // Shot list summary: count + a decimated boundary list (S3 needs texture, not all 2000).
  const shots = sampled.shots;
  const step = Math.max(1, Math.ceil(shots.length / 200));
  const shotSummary = {
    totalShots: shots.length,
    sceneThreshold: sampled.sceneThreshold,
    boundariesSec: shots.filter((_, i) => i % step === 0).map(t => Math.round(t)),
  };
  const chunks = perceptions.map(p => ({
    chunk: p.chunkIndex,
    startSec: p.offsetSec,
    beats: p.beats,
    dialogue: p.dialogue.map(d => ({ ...d, speaker: `CH${p.chunkIndex}:${d.speaker}` })),
    people: p.people.map(pp => ({ ...pp, label: `CH${p.chunkIndex}:${pp.label}` })),
  }));
  return JSON.stringify({
    film: { title: job.title, durationSec: Math.round(sampled.durationSec) },
    creatorCastList: job.cast && job.cast.length ? job.cast : undefined,
    shotSummary,
    chunks,
  });
}

/** ~700k-token corpus ceiling (chars/4). Dialogue is the bulk; drop lines evenly to fit. */
function truncateCorpusIfNeeded(
  job: StoryJob, sampled: Sampled, perceptions: ChunkPerception[],
): { corpus: string; truncated: boolean } {
  let corpus = buildCorpus(job, sampled, perceptions);
  if (corpus.length / 4 <= 700_000) return { corpus, truncated: false };
  // Keep every k-th dialogue line, raising k until the estimate fits.
  for (const keepOneIn of [2, 3, 4, 6, 8]) {
    const slimmed = perceptions.map(p => ({
      ...p,
      dialogue: p.dialogue.filter((_, i) => i % keepOneIn === 0),
    }));
    corpus = buildCorpus(job, sampled, slimmed);
    if (corpus.length / 4 <= 700_000) return { corpus, truncated: true };
  }
  return { corpus, truncated: true }; // best effort — let the provider truncate the tail
}

async function pokeeReason(instructions: string, corpus: string, usage: Usage): Promise<any> {
  const res = await fetch('https://api.pokee.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.POKEE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'pokee-isaac',
      temperature: 0.2,
      max_tokens: 8192,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: instructions },
        { role: 'user', content: corpus },
      ],
    }),
  });
  if (!res.ok) throw new Error(`pokee HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json() as any;
  addUsage(usage, 'pokee-isaac',
    Number(data.usage?.prompt_tokens) || 0, Number(data.usage?.completion_tokens) || 0,
    POKEE_IN_MICROS_PER_TOKEN, POKEE_OUT_MICROS_PER_TOKEN);
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error('pokee returned no content');
  return extractJson(text);
}

async function geminiReason(instructions: string, corpus: string, usage: Usage): Promise<any> {
  const res = await fetch(`${GEMINI_BASE}/v1beta/models/${GEMINI_MODEL}:generateContent?key=${geminiKey()}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: `${instructions}\n\nPERCEPTION LOG:\n${corpus}` }] }],
      generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 8192 },
    }),
  });
  if (!res.ok) throw new Error(`gemini reasoning HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json() as any;
  const um = data.usageMetadata || {};
  addUsage(usage, GEMINI_MODEL,
    Number(um.promptTokenCount) || 0, Number(um.candidatesTokenCount) || 0,
    GEMINI_IN_MICROS_PER_TOKEN, GEMINI_OUT_MICROS_PER_TOKEN);
  const text = (data.candidates?.[0]?.content?.parts || []).map((p: any) => p.text || '').join('');
  if (!text) throw new Error('gemini reasoning returned no text');
  return extractJson(text);
}

async function stageReasoning(
  job: StoryJob, sampled: Sampled, perceptions: ChunkPerception[], usage: Usage, notes: string[],
): Promise<any> {
  const { albumId } = job;
  await setProgress(albumId, 'REASONING', 'reason', 70, 'synthesizing story');
  const { corpus, truncated } = truncateCorpusIfNeeded(job, sampled, perceptions);
  if (truncated) notes.push('perception corpus exceeded ~700k est. tokens — dialogue thinned evenly');
  const instructions = reasoningInstructions(job);

  let story: any;
  if (process.env.POKEE_API_KEY) {
    let lastErr: any;
    for (let attempt = 0; attempt < 3 && !story; attempt++) {
      try { story = await pokeeReason(instructions, corpus, usage); }
      catch (e: any) { lastErr = e; if (attempt < 2) await sleep([3000, 10000, 0][attempt]); }
    }
    if (!story) {
      notes.push(`pokee reasoning failed (${String(lastErr?.message || lastErr).slice(0, 120)}) — fell back to ${GEMINI_MODEL}`);
      story = await geminiReason(instructions, corpus, usage);
      await patchJob(albumId, { reasoningLane: GEMINI_MODEL });
    } else {
      await patchJob(albumId, { reasoningLane: 'pokee-isaac' });
    }
  } else {
    notes.push('POKEE_API_KEY unset — reasoning ran on ' + GEMINI_MODEL);
    story = await geminiReason(instructions, corpus, usage);
    await patchJob(albumId, { reasoningLane: GEMINI_MODEL });
  }

  await patchJob(albumId, { checkpoint: { stage: 'REASONING', chunkIndex: -1 }, usage: usageDoc(usage) });
  return story;
}

// ── S4: ASSEMBLING ────────────────────────────────────────────────────────────

async function stageAssembling(
  job: StoryJob, sampled: Sampled, perceptions: ChunkPerception[], story: any,
  usage: Usage, failedChunks: number[], notes: string[],
): Promise<void> {
  const { albumId, ownerId } = job;
  await setProgress(albumId, failedChunks.length ? 'ASSEMBLING' : 'ASSEMBLING', 'assemble', 90, 'writing report');

  const scenes: any[] = Array.isArray(story?.scenes) ? story.scenes : [];

  // Stills → scenes by timestamp (authoritative over whatever the model put in stillIndexes).
  const sceneIdFor = (tSec: number): string => {
    const hit = scenes.find(s => Number(s.startSec) <= tSec && tSec < Number(s.endSec));
    return hit ? String(hit.id) : '';
  };
  for (const s of scenes) s.stillIndexes = [];
  const stills = sampled.stills.map(st => {
    const sceneId = sceneIdFor(st.tSec);
    const scene = scenes.find(s => String(s.id) === sceneId);
    if (scene) scene.stillIndexes.push(st.index);
    return { id: `still_${st.index}`, tSec: st.tSec, sceneId, path: st.storagePath, kind: 'SCENE' as const };
  });

  // Transcript: every dialogue line, absolute time, chunk-namespaced speaker (raw perception —
  // character resolution lives in report.characters).
  const transcript = {
    version: 1,
    albumId,
    title: job.title,
    lines: perceptions.flatMap(p => p.dialogue.map(d => ({
      tSec: d.tSec, chunk: p.chunkIndex, speaker: `CH${p.chunkIndex}:${d.speaker}`, text: d.text,
    }))).sort((a, b) => a.tSec - b.tSec),
  };
  const basePath = `taleoAnalysis/${ownerId}/${albumId}`;
  const transcriptPath = `${basePath}/transcript.json`;

  const report = {
    version: 1,
    logline: String(story?.logline || ''),
    synopsis: String(story?.synopsis || ''),
    themes: Array.isArray(story?.themes) ? story.themes : [],
    structure: story?.structure || { acts: [] },
    characters: Array.isArray(story?.characters) ? story.characters : [],
    scenes,
    sequences: Array.isArray(story?.sequences) ? story.sequences : [],
    locations: Array.isArray(story?.locations) ? story.locations : [],
    macguffins: Array.isArray(story?.macguffins) ? story.macguffins : [],
    stills,
    transcriptPath,
  };
  const reportPath = `${basePath}/report.json`;

  const okReport = await storageUpload(reportPath, Buffer.from(JSON.stringify(report, null, 2)), 'application/json');
  const okTranscript = await storageUpload(transcriptPath, Buffer.from(JSON.stringify(transcript, null, 2)), 'application/json');
  if (!okReport) throw new Error('report.json upload failed');
  if (!okTranscript) notes.push('transcript.json upload failed');

  const costGuardTripped = usage.totalUsdMicros > maxUsdMicros();
  const partial = failedChunks.length > 0 || costGuardTripped;
  await patchJob(albumId, {
    status: partial ? 'PARTIAL' : 'READY',
    progress: { stage: 'done', pct: 100, note: partial ? 'completed with gaps' : 'complete' },
    coverage: {
      kind: partial ? 'PARTIAL' : 'FULL',
      chunksTotal: sampled.chunks.length,
      chunksFailed: failedChunks,
      costGuardTripped,
    },
    counts: {
      shots: sampled.shots.length,
      chunks: sampled.chunks.length,
      stills: stills.length,
      scenes: scenes.length,
      characters: report.characters.length,
      dialogueLines: transcript.lines.length,
    },
    reportPath,
    transcriptPath,
    usage: usageDoc(usage),
    notes,
    checkpoint: { stage: 'DONE', chunkIndex: -1 },
  });
}

// ── Orchestrator ──────────────────────────────────────────────────────────────

export async function runPipeline(job: StoryJob): Promise<void> {
  const { albumId } = job;
  const usage: Usage = { byLane: {}, totalUsdMicros: 0 };
  let tmp = '';
  try {
    // Checkpoint policy (Phase 1, deliberately simple): tmp artifacts do not survive a
    // restart, so a resumed job re-runs from S1 regardless of where it died — we only note
    // that a prior attempt existed.
    const existing = await firestoreGet(jobPath(albumId));
    if (existing?.checkpoint && existing.checkpoint.stage !== 'DONE') {
      await patchJob(albumId, { progress: { stage: 'restart', pct: 0, note: `restarting after interrupted ${existing.checkpoint.stage}` } });
    }

    await patchJob(albumId, {
      albumId, ownerId: job.ownerId, scope: 'MOVIE', pipelineVersion: 1,
      status: 'SAMPLING', progress: { stage: 'start', pct: 1, note: '' },
    });

    tmp = await fs.mkdtemp(path.join(os.tmpdir(), `story_${albumId}_`));
    const sampled = await stageSampling(job, tmp);

    await setProgress(albumId, 'PERCEIVING', 'perceive', 22, `0/${sampled.chunks.length} chunks`);
    const { perceptions, failedChunks, notes } = await stagePerceiving(job, sampled, usage);

    const story = await stageReasoning(job, sampled, perceptions, usage, notes);

    await stageAssembling(job, sampled, perceptions, story, usage, failedChunks, notes);
    console.log(`[pipeline] ${albumId} done — ${failedChunks.length ? 'PARTIAL' : 'READY'}, est $${(usage.totalUsdMicros / 1e6).toFixed(4)}`);
  } catch (e: any) {
    console.error(`[pipeline] ${albumId} FAILED:`, e?.message || e);
    await patchJob(albumId, {
      status: 'FAILED',
      error: String(e?.message || e).slice(0, 500),
      usage: usageDoc(usage),
    }).catch(() => {});
  } finally {
    if (tmp) await fs.rm(tmp, { recursive: true, force: true }).catch(() => {});
  }
}
