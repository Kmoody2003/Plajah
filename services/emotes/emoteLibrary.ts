// emoteLibrary — the registry: every pack, lookup by id / code / legacy unicode, search.

import type { EmoteDef, EmotePack, EmotePackId } from './emoteTypes';
import { CORE_EMOTES } from './packs/corePack';
import { KAIJU_EMOTES } from './packs/kaijuPack';
import { COUNCIL_PACKS } from './packs/councilPacks';

export const EMOTE_PACKS: EmotePack[] = [
  { id: 'core' as const, name: 'Classics', blurb: 'The essentials, lit like a stage.', icon: 'core.lol', emotes: CORE_EMOTES },
  { id: 'kaiju' as const, name: 'Lorik & Lumi', blurb: 'The Plajah kaiju, live and animated. Send enough and they show up in person.', icon: KAIJU_EMOTES[0]?.id ?? 'core.heart', emotes: KAIJU_EMOTES },
  ...COUNCIL_PACKS,
].filter(p => p.emotes.length > 0);

// How each vector collection comes alive when shown big (services/emotes/emoteAnimators.ts).
const PACK_ANIM: Partial<Record<EmotePackId, EmoteDef['anim']>> = { neon: 'neon', gilded: 'sheen', riso: 'boil', spotlight: 'spot' };
// …and a few classics that are precious metal / stone.
const CORE_ANIM: Record<string, EmoteDef['anim']> = { 'core.crown': 'sheen', 'core.trophy': 'sheen', 'core.gem': 'sheen', 'core.star': 'sheen' };
for (const p of EMOTE_PACKS) for (const e of p.emotes) {
  if (e.art.kind !== 'svg' || e.anim !== undefined) continue;
  const a = CORE_ANIM[e.id] ?? PACK_ANIM[p.id];
  if (a) e.anim = a;
}

const byId = new Map<string, EmoteDef>();
const byCode = new Map<string, EmoteDef>();
const byUnicode = new Map<string, EmoteDef>();
for (const p of EMOTE_PACKS) for (const e of p.emotes) {
  byId.set(e.id, e);
  if (!byCode.has(e.code)) byCode.set(e.code, e);   // first pack wins a code clash (core first)
  if (e.unicode && !byUnicode.has(e.unicode)) byUnicode.set(e.unicode, e);
}

/** Channel emotes registered at runtime (a creator's uploads, loaded when you open their stream). */
const channel = new Map<string, EmoteDef>();
export function registerChannelEmotes(list: EmoteDef[]) {
  for (const e of list) { channel.set(e.id, e); byId.set(e.id, e); }
}

export const ALL_EMOTES = (): EmoteDef[] => [...byId.values()];
export const emoteById = (id: string | undefined | null) => (id ? byId.get(id) ?? null : null);
/** `:code:` lookup. Channel codes are `ownerprefix_code` and are found by full id via the map too. */
export function emoteByCode(code: string, channelEmotes?: EmoteDef[]): EmoteDef | null {
  const c = code.toLowerCase();
  return channelEmotes?.find(e => e.code === c) ?? byCode.get(c) ?? null;
}
export const emoteForUnicode = (u: string) => byUnicode.get(u) ?? null;
export const packById = (id: EmotePackId) => EMOTE_PACKS.find(p => p.id === id) ?? null;

/** Ranked search over code, name and tags. Prefix matches on the code rank highest. */
export function searchEmotes(q: string, pool: EmoteDef[] = ALL_EMOTES(), limit = 60): EmoteDef[] {
  const s = q.trim().toLowerCase().replace(/^:|:$/g, '');
  if (!s) return pool.slice(0, limit);
  const scored: [number, EmoteDef][] = [];
  for (const e of pool) {
    let sc = 0;
    if (e.code === s) sc = 100;
    else if (e.code.startsWith(s)) sc = 80 - e.code.length;
    else if (e.name.toLowerCase().startsWith(s)) sc = 60;
    else if (e.tags.some(t => t.startsWith(s))) sc = 40;
    else if (e.code.includes(s) || e.name.toLowerCase().includes(s)) sc = 20;
    if (sc) scored.push([sc + (e.pack === 'core' ? 2 : e.pack === 'kaiju' ? 1 : 0), e]);
  }
  return scored.sort((a, b) => b[0] - a[0]).slice(0, limit).map(x => x[1]);
}
