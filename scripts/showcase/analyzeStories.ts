// analyzeStories: ask Pokee-Isaac (the reasoning lane Taleo Story Intelligence uses) to read each showcase book as a story editor would and
// report structure, character consistency, age fit, read-aloud rhythm and safety. Output: docs/showcase/analysis/<book-id>.json.
//
// Run:  npx tsx scripts/showcase/analyzeStories.ts [book-id ...]
// Needs POKEE_API_KEY (the CURRENT key lives in Google Secret Manager as plajah-api-pokee-api-key; .env.local may hold an older, rejected copy).
// Read it into the environment for one run without printing it:  export POKEE_API_KEY="$(gcloud secrets versions access latest --secret=plajah-api-pokee-api-key | tr -d CR-LF)"
// The script NEVER edits a book: it only reports; the author decides.
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { SHOWCASE_BOOKS } from '../../data/showcase';
import type { ShowcaseBook } from '../../data/showcase/types';
import { measure } from '../../services/showcase/storyMetrics';

for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) { const m = /^([A-Z0-9_]+)=(.*)$/.exec(line); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, ''); }

const SYSTEM = [
  'You are a children\'s-book story editor with deep craft in picture books, early readers and illustrated folktales.',
  'Read the book the way a child, a parent reading aloud, and an editor would. Judge it honestly; do not flatter. NEVER invent content that is not in the text.',
  'Return ONLY JSON with these keys:',
  '{ "structure": { "want": str, "obstacle": str, "turningPoint": str, "resolution": str, "arcStrength": "weak|ok|strong", "notes": str },',
  '  "characters": [ { "name": str, "consistent": bool, "issues": [str] } ],',
  '  "ageFit": { "targetAge": str, "fits": bool, "tooEasy": [str], "tooHard": [str] },',
  '  "readAloud": { "rhythm": "weak|ok|strong", "bestLine": str, "weakestLine": str, "refrainWorks": bool },',
  '  "pageTurns": [ { "spread": int, "worksAsTurn": bool, "note": str } ],',
  '  "safety": { "issues": [str], "notes": str },',
  '  "suggestions": [ { "spread": int, "kind": "cut|add|reword|reorder", "why": str } ] }',
].join('\n');

function manuscript(b: ShowcaseBook): string {
  const cast = b.characters.map(c => `- ${c.name} (${c.kind}; ${c.role}): ${c.personality.join(', ')}. Arc: ${c.arc}`).join('\n');
  const pages = b.spreads.map(s => `[Spread ${s.n} | ${s.beat}] ${s.text.replace(/\n/g, ' / ')}${s.turn ? `  (turn: ${s.turn})` : ''}`).join('\n');
  return `TITLE: ${b.title}\nAUDIENCE: ages ${b.ageMin}-${b.ageMax}\nTHEME: ${b.theme}\nREFRAIN: ${b.refrain ?? 'none'}\n\nCAST\n${cast}\n\nMANUSCRIPT\n${pages}`;
}

async function pokee(user: string): Promise<string> {
  const r = await fetch('https://api.pokee.ai/v1/chat/completions', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.POKEE_API_KEY}` },
    body: JSON.stringify({ model: 'pokee-isaac', max_tokens: 3000, temperature: 0.3, stream: false, messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: user }] }),
  });
  const data: any = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Pokee ${r.status}: ${data?.error?.message || 'request failed'}`);
  return data?.choices?.[0]?.message?.content || '';
}

async function main() {
  const want = new Set(process.argv.slice(2));
  const out = path.join('docs', 'showcase', 'analysis'); mkdirSync(out, { recursive: true });
  for (const b of SHOWCASE_BOOKS.filter(x => !want.size || want.has(x.id))) {
    try {
      // The model occasionally returns almost-JSON; ask again (up to 3 tries) before giving up on a book.
      let json: any = null, lastErr = '';
      for (let attempt = 0; attempt < 3 && !json; attempt++) {
        const raw = await pokee(manuscript(b));
        try { json = JSON.parse(raw.replace(/^```(?:json)?|```$/gim, '').trim()); } catch (e: any) { lastErr = String(e?.message || e); }
      }
      if (!json) throw new Error(`no valid JSON after 3 tries: ${lastErr}`);
      writeFileSync(path.join(out, `${b.id}.json`), JSON.stringify({ book: b.id, model: 'pokee-isaac', metrics: measure(b), report: json }, null, 2));
      console.log(`[${b.id}] ok: arc ${json?.structure?.arcStrength}, rhythm ${json?.readAloud?.rhythm}, ${json?.suggestions?.length ?? 0} suggestions`);
    } catch (e: any) {
      console.log(`[${b.id}] FAILED: ${e?.message || e}`);
      if (/401|Invalid API key/i.test(String(e?.message))) { console.log('POKEE_API_KEY is missing or rejected. Set a valid key in .env.local and re-run.'); break; }
    }
  }
}
main().catch(e => { console.error(e); process.exit(1); });
