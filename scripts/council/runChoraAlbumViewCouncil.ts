// runChoraAlbumViewCouncil — take the Chora album view's "Cinema" direction (concept B: full-bleed visual viewer as the
// hero, cover medallion + display title + Play over it, tracklist with credits below, synced lyrics + social rail beside)
// to the Council of Art Directors for one FULL deliberation, so the variations we weigh come from the directors.
//
// Cloud Claude lane only (never the local GPU lane). File-backed store: directors' profiles are read from the
// docs/ambo/council/profiles mirror and the session lands in docs/chora/council — Firestore is not touched.
//
// Run: npx tsx scripts/council/runChoraAlbumViewCouncil.ts   (Gemini by default since 2026-10-25; COUNCIL_LANE=claude for Claude)
// Out: docs/chora/council/album-view-cinema.json
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createCouncil, type CouncilStore } from '../../services/council/councilRoutes';
import type { CouncilBrief } from '../../services/council/councilTypes';

for (const f of ['.env.local', '.env']) {
  if (!existsSync(f)) continue;
  for (const line of readFileSync(f, 'utf8').split(/\r?\n/)) { const m = /^([A-Z0-9_]+)=(.*)$/.exec(line); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, ''); }
}

const OUT = path.join('docs', 'chora', 'council');
const PROFILES = path.join('docs', 'ambo', 'council', 'profiles');
mkdirSync(OUT, { recursive: true });

const mem = new Map<string, Record<string, any>>();
const store: CouncilStore = {
  get: async (p) => {
    if (mem.has(p)) return mem.get(p)!;
    const d = /^council_directors\/([A-Z_]+)$/.exec(p);
    const f = d && path.join(PROFILES, `${d[1]}.json`);
    return f && existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null;
  },
  set: async (p, obj) => { mem.set(p, obj); return true; },
  list: async () => [],
};

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
async function claudeLane(system: string, user: string, maxTokens = 1200): Promise<string> {
  for (let attempt = 0; ; attempt++) {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY || '', 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: process.env.COUNCIL_CLAUDE_MODEL || 'claude-sonnet-4-6', max_tokens: Math.max(4096, maxTokens), temperature: 0.9, system, messages: [{ role: 'user', content: user }] }),
      signal: AbortSignal.timeout(150000),
    });
    const data: any = await r.json().catch(() => ({}));
    if (r.ok) return data?.content?.[0]?.text || '';
    console.log(`[lane] HTTP ${r.status} ${data?.error?.message || ''}`);
    if ((r.status === 429 || r.status === 529 || r.status >= 500) && attempt < 6) { await sleep(8000 * (attempt + 1)); continue; }
    throw new Error(data?.error?.message || `Claude ${r.status}`);
  }
}

async function geminiLane(system: string, user: string, maxTokens = 1200): Promise<string> {
  const { GoogleGenAI } = await import('@google/genai');
  const genai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY || '' });
  for (let attempt = 0; ; attempt++) {
    try {
      const r: any = await genai.models.generateContent({
        model: process.env.COUNCIL_GEMINI_MODEL || 'gemini-3.5-flash',
        contents: user,
        config: { systemInstruction: system, temperature: 0.9, maxOutputTokens: Math.max(4096, maxTokens * 4) },
      });
      return r?.text || '';
    } catch (e: any) {
      const msg = String(e?.message || e);
      if (!/429|RESOURCE_EXHAUSTED|503|UNAVAILABLE/.test(msg) || /PerDay/.test(msg) || attempt >= 6) throw e;
      await sleep(15000 * (attempt + 1));
    }
  }
}

const brief: CouncilBrief = {
  ask: 'Direct the premium desktop album view for Plajah Chora (the music service) in the "Cinema" direction, and give three distinct variations of it we can weigh.',
  surface: 'Chora album view (PlayerView), desktop 1440×960, dark ground #06040A',
  domain: 'music streaming — native Plajah albums and Audius albums open in the same view',
  audience: 'listeners who came to play a record, and the artists whose record it is',
  feeling: 'premium, impressive, gorgeous — a premiere, not a dashboard',
  constraints: [
    'Cinema layout: the visual viewer (Art / Visualizer / Video / Fullscreen) is a full-bleed hero across the top ~540px; the cover medallion, a very large display title, artist line and one dominant Play sit over its lower edge.',
    'Below the hero: the tracklist (number, title, credits, time) keeps today\'s behaviour — the playing row carries the purple→magenta gradient, NEXT tag on the queued row, durations in mono, expandable row drawer, bulk select.',
    'Beside the tracklist: synced lyrics, a social card (friends who played it, Listen together / listening party), and Breakdown · Live FX · Comments.',
    'Plajah design language only: purple #6B0099, magenta #D40055, orange #FF8C00 (action), cyan #00DAF3 (live/spatial), lilac #D0BCFF; Bricolage Grotesque display caps, Inter body, JetBrains Mono for time, Newsreader for editorial.',
    'Every existing feature stays reachable: playlist add, offline save, party, back the artist / buy, share & promote, Live FX presets, Pixels, Hide & Seek alternates, comments.',
    'Fewer competing gradients and tiny all-caps labels than today: one primary action, readable type.',
  ],
  references: ['Current Chora album view: command deck + DSP console stacked above the tracklist', 'Concept B "Cinema" mockup on the canvas'],
};

async function main() {
  const lane = process.env.COUNCIL_LANE === 'claude' ? claudeLane : geminiLane;
  const council = createCouncil({ authMiddleware: null, apiLimiter: null, firestoreAuthHeaders: async () => ({}), store, model: lane } as any);
  const t0 = Date.now();
  const d = await council.deliberate('chora-album-view', brief, { depth: 'FULL' });
  writeFileSync(path.join(OUT, 'album-view-cinema.json'), JSON.stringify(d, null, 2));
  console.log(`[council] ${d.status} in ${Math.round((Date.now() - t0) / 1000)}s · ${d.proposals.length} proposals · ${d.disputes.length} disputes · lead ${d.synthesis?.lead} / counterpoint ${d.synthesis?.counterpoint} / editor ${d.synthesis?.editor}${d.error ? ` · ${d.error}` : ''}`);
}
main().catch(e => { console.error(e); process.exit(1); });
