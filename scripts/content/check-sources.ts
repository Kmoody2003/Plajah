/**
 * Fetch every URL cited in verifier verdicts and record whether it resolves. merge-verdicts only counts
 * a source if it is live here, so an invented link cannot earn "sourced" status. A live URL shows the page
 * exists; it does not prove the page supports the claim, so "sourced" is still a floor, not an expert sign-off.
 *   npx tsx scripts/content/check-sources.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { OUT } from './lib';

const vdir = path.join(OUT, 'verdicts'); const file = path.join(OUT, 'source-check.json');
const cache: Record<string, { ok: boolean; status: number; at: number }> = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
const urls = new Set<string>();
for (const f of fs.existsSync(vdir) ? fs.readdirSync(vdir).filter(n => n.endsWith('.json')) : []) {
  const v = JSON.parse(fs.readFileSync(path.join(vdir, f), 'utf8'));
  for (const x of [...(v.questions || []), ...(v.claims || [])]) for (const u of x.sources || []) if (/^https?:\/\//i.test(u)) urls.add(u.trim());
}
const todo = [...urls].filter(u => !cache[u] || (!cache[u].ok && Date.now() - cache[u].at > 3600_000));
console.log(`${urls.size} distinct URLs, ${todo.length} to check`);
const last: Record<string, number> = {};
const check = async (u: string) => {
  const host = new URL(u).host; const wait = (last[host] || 0) + 700 - Date.now(); if (wait > 0) await new Promise(r => setTimeout(r, wait)); last[host] = Date.now();
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 20000);
  try {
    const r = await fetch(u, { redirect: 'follow', signal: ctl.signal, headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PlajahAcademiaSourceCheck/1.0)', Accept: 'text/html,application/pdf,*/*' } });
    // 403/429 from big publishers usually means bot-blocking, not a dead page; count only clean 2xx as live.
    cache[u] = { ok: r.status >= 200 && r.status < 300, status: r.status, at: Date.now() };
  } catch { cache[u] = { ok: false, status: 0, at: Date.now() }; } finally { clearTimeout(t); }
};
const queue = [...todo]; const workers = Array.from({ length: 6 }, async () => { for (let u = queue.shift(); u; u = queue.shift()) await check(u); });
await Promise.all(workers);
fs.writeFileSync(file, JSON.stringify(cache, null, 1));
const all = [...urls].map(u => cache[u]).filter(Boolean);
console.log(`live ${all.filter(x => x.ok).length}, dead/blocked ${all.filter(x => !x.ok).length}`);
