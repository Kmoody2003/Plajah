// colorScriptSources — assembles a film's colour script from what Plajah already knows about it, before
// the film plays:
//
//   1. Story intelligence (StoryReport — hand-authored for the classics in data/halloweenStoryIntel.ts, or
//      the story worker's analysis): scene and shot timecodes become the script's shots; each shot's
//      character becomes `who`; time of day and interior/exterior set the light (a night exterior's sky is
//      deep navy, dusk warm, a night interior is lamplit tungsten); dialogue and scene/shot descriptions go
//      through the subtitle colour reader (colorScriptBuilder.ts) for costume and set colours.
//   2. The cast as they really looked: Wikidata's hair-colour (P1884) and eye-colour (P1340) statements for
//      each actor, found from their Wikipedia page. Public data, cached per browser, no account or model.
//   3. The stock: pre-1927 silent pictures were shot on red-blind orthochromatic film.
//
// Everything degrades: a film with no report still gets its stock; an actor Wikidata knows nothing about
// keeps the shader's own complexion/hair logic.
import type { ColorScript, ColorShot, CastMember, HC } from './colorScript';
import { scriptFromDialogue, hexToHC, type Cue } from './colorScriptBuilder';
import type { StoryReport } from '../storyIntelService';

export interface FilmRef { id: string; title?: string; year?: number | string; report?: StoryReport | null }

const SKY_BY_TIME: [RegExp, HC][] = [
  [/night|midnight|evening/i, hexToHC('1d2a4a')],         // moonlit / blue-hour navy
  [/dusk|sunset|twilight/i, hexToHC('a8a0b8')],           // overhead stays blue-violet; the warmth is low in the sky
  [/dawn|sunrise|morning/i, hexToHC('b4b4c4')],
];
const TUNGSTEN: HC = hexToHC('e0a55a');

// Wikidata labels for hair / eye colour → a representative colour
const HAIR_LABEL_HEX: [RegExp, string][] = [
  [/platinum/, 'ddd3bd'], [/strawberry/, 'c58a5e'], [/blond/, 'c7a669'], [/auburn/, '7a3524'], [/red|ginger/, '8f3f22'],
  [/dark brown/, '3d2a1e'], [/light brown/, '8a6a48'], [/brown|brunette|chestnut/, '553a26'], [/black/, '1f1a17'],
  [/grey|gray|silver/, '8a8782'], [/white/, 'd9d6cf'],
];
const EYE_LABEL_HEX: [RegExp, string][] = [
  [/blue/, '5a82b0'], [/green/, '5f8a5a'], [/hazel/, '8a6a3a'], [/grey|gray/, '8a9098'], [/brown|dark/, '4a2e1e'], [/black/, '221814'],
];
const pick = (label: string | undefined, table: [RegExp, string][]): HC | undefined => {
  if (!label) return undefined;
  const hit = table.find(([re]) => re.test(label.toLowerCase()));
  return hit ? hexToHC(hit[1]) : undefined;
};

const CACHE_KEY = 'plajah.colorize.castLook.v1';
function readCache(): Record<string, { hair?: string; eyes?: string }> { try { return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}'); } catch { return {}; } }
function writeCache(c: Record<string, { hair?: string; eyes?: string }>) { try { localStorage.setItem(CACHE_KEY, JSON.stringify(c)); } catch { /* */ } }

/** Hair / eye colour labels for actors, by English Wikipedia page title, from Wikidata (batched, cached). */
export async function wikidataLooks(slugs: string[]): Promise<Record<string, { hair?: string; eyes?: string }>> {
  const cache = readCache();
  const title = (s: string) => { try { return decodeURIComponent(s).replace(/_/g, ' '); } catch { return s.replace(/_/g, ' '); } };
  const want = [...new Set(slugs.filter(s => s && !(s in cache)))];
  for (let i = 0; i < want.length; i += 40) {
    const batch = want.slice(i, i + 40);
    try {
      const q = new URLSearchParams({ action: 'wbgetentities', sites: 'enwiki', titles: batch.map(title).join('|'), props: 'claims|sitelinks', sitefilter: 'enwiki', format: 'json', origin: '*' });
      const ents = Object.values((await (await fetch(`https://www.wikidata.org/w/api.php?${q}`)).json())?.entities || {}) as any[];
      const qid = (c: any) => c?.mainsnak?.datavalue?.value?.id as string | undefined;
      const per: Record<string, { hair?: string; eyes?: string }> = {};
      const ids = new Set<string>();
      for (const e of ents) {
        const t = e?.sitelinks?.enwiki?.title as string | undefined; if (!t) continue;
        const hair = qid(e.claims?.P1884?.[0]), eyes = qid(e.claims?.P1340?.[0]);
        per[t] = { hair, eyes };
        if (hair) ids.add(hair); if (eyes) ids.add(eyes);
      }
      const labels: Record<string, string> = {};
      if (ids.size) {
        const lq = new URLSearchParams({ action: 'wbgetentities', ids: [...ids].join('|'), props: 'labels', languages: 'en', format: 'json', origin: '*' });
        for (const [id, e] of Object.entries((await (await fetch(`https://www.wikidata.org/w/api.php?${lq}`)).json())?.entities || {}) as [string, any][]) labels[id] = e?.labels?.en?.value;
      }
      for (const s of batch) {
        const key = title(s);
        const hit = per[key] || Object.entries(per).find(([k]) => k.toLowerCase() === key.toLowerCase())?.[1];
        cache[s] = { hair: hit?.hair ? labels[hit.hair] : undefined, eyes: hit?.eyes ? labels[hit.eyes] : undefined };
      }
    } catch { /* offline or rate-limited: leave uncached, try again next time */ }
  }
  writeCache(cache);
  return cache;
}

/** Story report → shots (scene shots when broken down, else whole scenes) with light, people and text cues. */
function fromReport(report: StoryReport): { shots: ColorShot[]; cues: Cue[] } {
  const shots: ColorShot[] = [], cues: Cue[] = [];
  const names = new Map(report.characters.map(c => [c.refId, c.name]));
  const loc = new Map(report.locations.map(l => [l.refId, l]));
  for (const sc of [...report.scenes].sort((a, b) => a.startSec - b.startSec)) {
    const where = sc.locationRefId ? loc.get(sc.locationRefId) : undefined;
    const exterior = /\bEXT\b/i.test(sc.slugline) || /exterior|outdoor|street|forest|road|field|cemetery|garden/i.test(where?.kind || '');
    const time = `${sc.timeOfDay || ''} ${sc.slugline}`;
    const sky = SKY_BY_TIME.find(([re]) => re.test(time))?.[1];
    const night = /night|evening|midnight/i.test(time);
    const materials: ColorShot['materials'] = {};
    if (exterior && sky) materials.sky = sky;
    if (!exterior && night) materials.light = TUNGSTEN;
    const parts = sc.shots?.length ? sc.shots : [{ startSec: sc.startSec, endSec: sc.endSec, character: undefined, action: '', dialogue: undefined } as any];
    const solo = sc.characterRefIds.length === 1 ? names.get(sc.characterRefIds[0]) : undefined;
    for (const sh of parts) {
      const who = sh.character || solo;
      shots.push({
        t0: sh.startSec, t1: Math.max(sh.endSec, sh.startSec + 0.04),
        materials: Object.keys(materials).length ? { ...materials } : undefined,
        people: who ? [{ who }] : undefined,
        evidence: [`story: scene ${sc.index} "${sc.slugline}"${sc.timeOfDay ? ` (${sc.timeOfDay})` : ''}`],
      });
      if (sh.action) cues.push({ t0: sh.startSec, t1: sh.startSec + 2, text: sh.action });
      for (const d of sh.dialogue || []) cues.push({ t0: d.tSec, t1: d.tSec + 3, text: d.text });
    }
    cues.push({ t0: sc.startSec, t1: sc.startSec + 2, text: `${sc.summary} ${where?.description || ''}` });
  }
  return { shots, cues };
}

const built = new Map<string, Promise<ColorScript>>();

/** The colour script for a film: story report + dialogue colours + cast looks + stock. Cached per film. */
export function buildColorScriptForFilm(film: FilmRef): Promise<ColorScript> {
  const key = film.id;
  const have = built.get(key); if (have) return have;
  const job = (async (): Promise<ColorScript> => {
    const year = Number(String(film.year ?? '').slice(0, 4)) || undefined;
    let report = film.report ?? null;
    let castRefs: { characterName: string; actorWikiSlug?: string; actorName?: string }[] = [];
    try {
      const { getHalloweenStoryIntelBundle } = await import('../../data/halloweenStoryIntel');
      const b = getHalloweenStoryIntelBundle(film.id) || (film.title ? getHalloweenStoryIntelBundle(film.title) : null);
      if (b) { report = report || b.report; castRefs = b.charactersWithActors || []; }
    } catch { /* bundle unavailable */ }
    const base: ColorScript = {
      filmId: film.id, title: film.title, year,
      stock: year && year < 1927 ? 'orthochromatic' : 'panchromatic',
      version: 1,
    };
    let script = base;
    if (report) {
      const { shots, cues } = fromReport(report);
      // story shots first (light, who), dialogue colours layered over them
      script = scriptFromDialogue({ ...base, shots }, cues, shots.map(s => ({ t0: s.t0, t1: s.t1 })));
    }
    // the actors as they were
    const slugs = castRefs.map(c => c.actorWikiSlug).filter(Boolean) as string[];
    if (slugs.length) {
      const looks = await wikidataLooks(slugs);
      const cast: CastMember[] = [];
      for (const c of castRefs) {
        const l = c.actorWikiSlug ? looks[c.actorWikiSlug] : undefined;
        const hair = pick(l?.hair, HAIR_LABEL_HEX), eyes = pick(l?.eyes, EYE_LABEL_HEX);
        if (hair || eyes) cast.push({ name: c.characterName, hair, eyes, source: `Wikidata (${c.actorName || c.actorWikiSlug}): ${[l?.hair, l?.eyes].filter(Boolean).join(', ')}` });
      }
      if (cast.length) script = { ...script, cast };
    }
    return script;
  })();
  built.set(key, job);
  job.catch(() => built.delete(key));
  return job;
}
