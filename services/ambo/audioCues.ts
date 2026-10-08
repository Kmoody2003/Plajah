// audioCues — operator cue notes on songs.
//
// A cue is the sticky note on a song: a colour that tints the whole row, a short
// label ("Walk-in", "Offering", "Altar call") and a free note ("fade at the
// bridge — pastor prays over it"). Cues belong to a song IN A PLAYLIST, because
// the same hymn is communion in one service and the offertory in another.
// A song can also carry a library cue (outside any playlist); a playlist cue
// overrides it. Songs in the live queue use the scope of the playlist they came
// from, so a note edited in the queue is the same note the playlist shows.
//
// "Organize by cue" orders a playlist by cue colour (palette order below), then
// label, keeping the existing order inside each group; uncued songs go last.

export interface CueNote {
  color: string;      // a CUE_COLORS id
  label?: string;
  note?: string;
}

export const CUE_COLORS = [
  { id: 'red',    name: 'Red',    hex: '#FF5A5F' },
  { id: 'orange', name: 'Orange', hex: '#FF8C00' },
  { id: 'yellow', name: 'Yellow', hex: '#F5C542' },
  { id: 'green',  name: 'Green',  hex: '#2BE0A8' },
  { id: 'cyan',   name: 'Cyan',   hex: '#00DAF3' },
  { id: 'blue',   name: 'Blue',   hex: '#4C8DFF' },
  { id: 'purple', name: 'Purple', hex: '#B07CFF' },
  { id: 'pink',   name: 'Pink',   hex: '#FF6FD8' },
  { id: 'gray',   name: 'Gray',   hex: '#9AA0AE' },
] as const;

/** Service-moment presets — one tap fills the label. */
export const CUE_LABEL_PRESETS = [
  'Walk-in', 'Pre-service', 'Opening', 'Worship', 'Offering',
  'Communion', 'Prayer', 'Altar call', 'Response', 'Dismissal', 'Postlude',
];

export function cueHex(color?: string): string | null {
  if (!color) return null;
  return CUE_COLORS.find(c => c.id === color)?.hex ?? (color.startsWith('#') ? color : null);
}

const KEY = 'ambo_audio_cues_v1';
type Store = Record<string, Record<string, CueNote>>; // scope -> trackId -> cue

let store: Store = (() => {
  try { const raw = localStorage.getItem(KEY); if (raw) return JSON.parse(raw); } catch { /* */ }
  return {};
})();
let version = 0;
const listeners = new Set<() => void>();

/** Scope for cues on a song outside any playlist; playlists override it. */
export const LIBRARY_SCOPE = 'library';

export function getCue(scope: string | undefined, trackId: string | undefined): CueNote | null {
  if (!trackId) return null;
  const s = scope || LIBRARY_SCOPE;
  return store[s]?.[trackId] ?? (s !== LIBRARY_SCOPE ? store[LIBRARY_SCOPE]?.[trackId] ?? null : null);
}

/** True when this scope has its own cue (not just the library fallback). */
export function hasOwnCue(scope: string | undefined, trackId: string): boolean {
  return !!store[scope || LIBRARY_SCOPE]?.[trackId];
}

export function setCue(scope: string | undefined, trackId: string, cue: CueNote | null): void {
  const s = scope || LIBRARY_SCOPE;
  const next = { ...(store[s] || {}) };
  if (cue && (cue.color || cue.label || cue.note)) next[trackId] = cue; else delete next[trackId];
  store = { ...store, [s]: next };
  try { localStorage.setItem(KEY, JSON.stringify(store)); } catch { /* */ }
  version++;
  for (const fn of listeners) { try { fn(); } catch { /* */ } }
}

export function subscribeCues(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
/** Changes whenever any cue changes — for useSyncExternalStore. */
export function cuesVersion(): number { return version; }

/** Order ids by cue (palette order, then label). Stable within a group. */
export function sortIdsByCue(scope: string | undefined, ids: string[]): string[] {
  const rank = (id: string) => {
    const c = getCue(scope, id);
    if (!c) return [CUE_COLORS.length + 1, ''] as const;
    const i = CUE_COLORS.findIndex(x => x.id === c.color);
    return [i < 0 ? CUE_COLORS.length : i, (c.label || '').toLowerCase()] as const;
  };
  return ids
    .map((id, i) => ({ id, i, r: rank(id) }))
    .sort((a, b) => a.r[0] - b.r[0] || a.r[1].localeCompare(b.r[1]) || a.i - b.i)
    .map(x => x.id);
}

/** Group ids into display sections, in cue order. */
export function groupIdsByCue(scope: string | undefined, ids: string[]): Array<{ key: string; title: string; hex: string | null; ids: string[] }> {
  const groups = new Map<string, { key: string; title: string; hex: string | null; ids: string[] }>();
  for (const id of sortIdsByCue(scope, ids)) {
    const c = getCue(scope, id);
    const colorName = c ? CUE_COLORS.find(x => x.id === c.color)?.name : undefined;
    const key = c ? `${c.color}|${(c.label || '').toLowerCase()}` : '__none';
    const title = c ? (c.label || colorName || 'Cue') : 'No cue';
    if (!groups.has(key)) groups.set(key, { key, title, hex: c ? cueHex(c.color) : null, ids: [] });
    groups.get(key)!.ids.push(id);
  }
  return [...groups.values()];
}
