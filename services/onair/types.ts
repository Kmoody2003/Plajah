// Plajah On-Air staff — the persona sheet. One schema for both kinds of virtual talent:
//   • hosts:   radio hosts and DJs who run Plajah FM shows, talk between songs, take the station in
//              and out of breaks, read chat, and put live callers on air;
//   • artists: virtual recording artists who make their music with Chora's own tools and have their
//              own accounts people can follow.
//
// A sheet is pure data. The segment planner (segments.ts) and caller desk (callers.ts) read it, the
// prompt builder (prompt.ts) turns it into the live mind's brief, and accounts.ts turns it into the
// persona's platform account. Versioned so sheets can be stored, shared and validated, like the
// Session Band's `plajah.band.character/1`.
//
// Every persona is fictional and always labelled as virtual. None may claim to be human, to be a
// real person, or to have met or worked with a real artist.

export const PERSONA_SCHEMA = 'plajah.onair.persona/1' as const;

export type PersonaKind = 'host' | 'artist';

/** Day parts on Plajah FM (station local time). */
export type Daypart = 'morning' | 'midday' | 'afternoon' | 'evening' | 'late' | 'overnight' | 'weekend';

/** Voice is cast later. Until then a persona has a brief and speaks with the on-device fallback. */
export interface VoiceBrief {
  status: 'brief' | 'designed' | 'cast';
  /** Filled once a voice is designed (ElevenLabs id) — never invented here. */
  elevenVoiceId?: string;
  /** On-device fallback (Kokoro id) so captions-plus-voice works before casting. */
  kokoroFallback: string;
  ageRange: string;
  timbre: string;
  accent: string;
  pace: 'slow' | 'measured' | 'brisk' | 'fast';
  /** What a voice designer should aim for, in one paragraph. */
  castingNotes: string;
  /** Lines to audition the voice with. */
  auditionLines: string[];
}

export interface PersonaLook {
  /** Square portrait path (public/onair/<id>.webp) — placeholder until art is made. */
  portrait: string;
  /** Hex colours: [primary, secondary, accent]. */
  palette: [string, string, string];
  silhouette: string;
  wardrobe: string;
  signatureItems: string[];
  /** Where we see them — the booth, studio or stage they live in. */
  setting: string;
  /** Prompt-ready description for portrait/turnaround art. */
  artPrompt: string;
  /** Optional VRM body for a future embodied avatar. */
  vrm?: string;
}

export interface Personality {
  core: string[];
  /** How they sound on air or in posts, in one sentence. */
  onAirStyle: string;
  humor: number;      // 0..1
  warmth: number;     // 0..1
  energy: number;     // 0..1
  talkiness: number;  // 0..1 — how much they say between songs
  catchphrases: string[];
  quirks: string[];
  /** Things they never say or do, on top of the station-wide policy. */
  neverSays: string[];
}

export interface Backstory {
  /** One line for profile headers. */
  tagline: string;
  /** The fiction. Several short paragraphs. */
  story: string[];
  /** Where they're "from" in the fiction (fictional or general places only). */
  origin: string;
  /** Things the persona talks about from their own life — always fictional. */
  anecdotes: string[];
}

/** A Plajah FM show a host runs. */
export interface ShowSpec {
  name: string;
  daypart: Daypart;
  /** 24h local hours [start, end). End may be < start for shows past midnight. */
  hours: [number, number];
  days: ('mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun')[];
  genres: string[];
  /** 'host' talks between songs; 'dj' mixes songs together and talks less. */
  format: 'host' | 'dj';
  /** Recurring features the show runs (call-ins, trivia, countdowns…). */
  features: { id: string; name: string; how: string }[];
  /** Whether the show takes live callers. */
  takesCallers: boolean;
}

/** How a virtual artist makes music on Plajah. */
export interface ArtistSpec {
  genre: string;
  subgenres: string[];
  /** Chora engines they work in (ids as used in Chora: meka, aura, lyra, kera, soma, band, mastering…). */
  choraTools: string[];
  /** Sound in one sentence — the brief every session starts from. */
  soundBrief: string;
  influencesByStyle: string[];
  /** Release plan seeds — titles are working titles only. */
  eraPlan: { era: string; concept: string; workingTitles: string[] }[];
  /** How they show up live (Stage, listening parties, Reello). */
  liveShow: string;
  /** Singing / lead-voice plan — cast later with the speaking voice, never a clone of a real singer. */
  vocalPlan: string;
}

export interface PersonaAccountSpec {
  handle: string;
  displayName: string;
  bio: string;
  /** Always shown on the profile and on air. */
  disclosure: string;
  links: { label: string; target: string }[];
}

export interface PersonaSheet {
  schema: typeof PERSONA_SCHEMA;
  id: string;
  kind: PersonaKind;
  /** Name on air / on the cover. */
  stageName: string;
  /** In-fiction full name, if different. */
  fullName?: string;
  pronouns: string;
  /** In-fiction age, as text. */
  age: string;
  backstory: Backstory;
  look: PersonaLook;
  voice: VoiceBrief;
  personality: Personality;
  account: PersonaAccountSpec;
  show?: ShowSpec;
  artist?: ArtistSpec;
  /** Other personas this one has an in-fiction relationship with (ids + one line). */
  relationships: { with: string; how: string }[];
}

/** Light runtime check for sheets loaded from storage or the network. Returns the problems found. */
export function validatePersona(s: unknown): string[] {
  const out: string[] = [];
  const x = s as Partial<PersonaSheet>;
  if (!x || typeof x !== 'object') return ['not an object'];
  if (x.schema !== PERSONA_SCHEMA) out.push(`schema must be ${PERSONA_SCHEMA}`);
  for (const k of ['id', 'stageName', 'pronouns'] as const) if (typeof x[k] !== 'string' || !x[k]) out.push(`${k} missing`);
  if (x.kind !== 'host' && x.kind !== 'artist') out.push('kind must be host or artist');
  if (x.kind === 'host' && !x.show) out.push('host needs a show');
  if (x.kind === 'artist' && !x.artist) out.push('artist needs an artist spec');
  if (!x.look?.portrait) out.push('look.portrait missing');
  if (!x.look?.palette || x.look.palette.length !== 3 || x.look.palette.some((c) => !/^#[0-9a-f]{6}$/i.test(c))) out.push('look.palette needs 3 hex colours');
  if (!x.voice?.kokoroFallback) out.push('voice.kokoroFallback missing');
  if (x.voice?.status === 'brief' && x.voice.elevenVoiceId) out.push('voice in brief status must not carry a voice id');
  if (!x.account?.handle || !/^[a-z0-9_.]{3,30}$/.test(x.account.handle)) out.push('account.handle invalid');
  if (!x.account?.disclosure || !/virtual/i.test(x.account.disclosure)) out.push('account.disclosure must say the persona is virtual');
  if (x.show) {
    const [a, b] = x.show.hours;
    if (!(a >= 0 && a < 24 && b >= 0 && b <= 24 && a !== b)) out.push('show.hours invalid');
    if (!x.show.days.length) out.push('show.days empty');
  }
  return out;
}
