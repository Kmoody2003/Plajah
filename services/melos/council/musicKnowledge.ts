// musicKnowledge — the grounded knowledge base behind the Music Council (and shared with the Meter
// Bridge "Studio School" + Mix Doctor). Real, typed facts — loudness targets, per-genre tonal/dynamics
// norms, and a technique library keyed to symptoms — so the council's advice cites numbers, not vibes.
// Pure data + query functions; no AI, no network.

export interface LoudnessTarget { platform: string; lufs: number; truePeakDb: number; note: string; group: 'streaming' | 'broadcast' | 'physical' | 'stage'; }

/** Delivery loudness targets (integrated LUFS / true-peak ceiling). */
export const LOUDNESS_TARGETS: LoudnessTarget[] = [
  { platform: 'Spotify', lufs: -14, truePeakDb: -1, note: 'Normalizes to −14; masters hotter than this are turned down.', group: 'streaming' },
  { platform: 'Apple Music', lufs: -16, truePeakDb: -1, note: 'Sound Check target −16; a touch quieter than Spotify.', group: 'streaming' },
  { platform: 'YouTube', lufs: -14, truePeakDb: -1, note: 'Normalizes around −14 LUFS.', group: 'streaming' },
  { platform: 'Tidal', lufs: -14, truePeakDb: -1, note: 'Streaming loudness −14.', group: 'streaming' },
  { platform: 'Amazon Music', lufs: -14, truePeakDb: -2, note: 'Around −14; keep −2 dBTP for lossy safety.', group: 'streaming' },
  { platform: 'Deezer', lufs: -15, truePeakDb: -1, note: 'Slightly quieter reference.', group: 'streaming' },
  { platform: 'SoundCloud', lufs: -14, truePeakDb: -1, note: 'Loudness normalization ~−14.', group: 'streaming' },
  { platform: 'Podcast', lufs: -16, truePeakDb: -1, note: 'Spoken word −16 mono / −19 varies; dialogue-forward.', group: 'streaming' },
  { platform: 'Broadcast R128', lufs: -23, truePeakDb: -1, note: 'EBU R128 / ATSC A/85 (−24) broadcast standard.', group: 'broadcast' },
  { platform: 'Netflix', lufs: -27, truePeakDb: -2, note: 'Dialogue-anchored −27 LKFS.', group: 'broadcast' },
  { platform: 'Cinema', lufs: -27, truePeakDb: -3, note: 'Theatrical reference, wide dynamics.', group: 'broadcast' },
  { platform: 'CD / physical', lufs: -9, truePeakDb: -0.3, note: 'No normalization — loudness is your call.', group: 'physical' },
  { platform: 'Club / DJ', lufs: -7, truePeakDb: -0.5, note: 'Loud, punchy, big low end; system does the rest.', group: 'stage' },
];

export function loudnessTarget(platform: string): LoudnessTarget | undefined {
  return LOUDNESS_TARGETS.find((t) => t.platform.toLowerCase() === platform.toLowerCase());
}

export interface GenreProfile {
  genre: string;
  lufs: [number, number];      // typical integrated LUFS range of released masters
  plr: [number, number];       // peak-to-loudness ratio (dynamics) range
  /** Relative tonal energy by band, 0..1 — a rough target balance to compare a mix against. */
  tone: { sub: number; low: number; lowMid: number; mid: number; highMid: number; high: number };
  feel: string;
}

/** Per-genre norms — a reference to compare the current mix against (not a rule). */
export const GENRE_PROFILES: GenreProfile[] = [
  { genre: 'edm', lufs: [-9, -6], plr: [6, 9], tone: { sub: 0.9, low: 0.85, lowMid: 0.55, mid: 0.6, highMid: 0.7, high: 0.8 }, feel: 'Big low end, bright top, controlled dynamics for the drop.' },
  { genre: 'hiphop', lufs: [-10, -7], plr: [7, 11], tone: { sub: 0.95, low: 0.8, lowMid: 0.5, mid: 0.55, highMid: 0.6, high: 0.7 }, feel: '808-forward low, vocal-forward mids, crisp but not harsh top.' },
  { genre: 'pop', lufs: [-11, -8], plr: [8, 12], tone: { sub: 0.6, low: 0.7, lowMid: 0.55, mid: 0.7, highMid: 0.75, high: 0.8 }, feel: 'Vocal is the star — clear mids, polished, present top.' },
  { genre: 'rock', lufs: [-11, -8], plr: [8, 13], tone: { sub: 0.4, low: 0.7, lowMid: 0.7, mid: 0.7, highMid: 0.65, high: 0.6 }, feel: 'Guitars in the low-mids, punchy drums, natural top.' },
  { genre: 'jazz', lufs: [-16, -12], plr: [12, 18], tone: { sub: 0.4, low: 0.6, lowMid: 0.6, mid: 0.65, highMid: 0.6, high: 0.55 }, feel: 'Wide dynamics, warm, natural — let it breathe.' },
  { genre: 'acoustic', lufs: [-15, -11], plr: [11, 16], tone: { sub: 0.35, low: 0.55, lowMid: 0.6, mid: 0.7, highMid: 0.65, high: 0.6 }, feel: 'Intimate, honest mids, gentle top, room to move.' },
  { genre: 'classical', lufs: [-20, -16], plr: [15, 25], tone: { sub: 0.5, low: 0.6, lowMid: 0.6, mid: 0.65, highMid: 0.6, high: 0.6 }, feel: 'Huge dynamic range — do not squeeze it.' },
];

export function genreProfile(genre: string): GenreProfile | undefined {
  return GENRE_PROFILES.find((g) => g.genre === genre.toLowerCase());
}

export interface Technique { symptom: string; move: string; where: string; school?: string; }

/** Technique library — a symptom → a concrete move, with the frequency/where. The Mix Doctor + Council
 *  both draw on this so a recommendation is actionable ("−2 dB around 300 Hz"), never vague. */
export const TECHNIQUES: Technique[] = [
  { symptom: 'muddy / boxy', move: 'Cut a dB or two of the build-up', where: '250–500 Hz', school: 'clarity-first' },
  { symptom: 'boomy / one-note bass', move: 'High-pass non-bass tracks; tighten the sub', where: 'HPF 30–40 Hz + control 60–120 Hz' },
  { symptom: 'harsh / fatiguing', move: 'Dip the harsh band, or de-ess the top', where: '2–4 kHz (harsh) · 6–9 kHz (sibilance)' },
  { symptom: 'dull / no air', move: 'Gentle high shelf for air', where: '10 kHz+ shelf' },
  { symptom: 'thin vocal', move: 'Small low-mid lift + presence', where: '200 Hz warmth · 3–5 kHz presence' },
  { symptom: 'narrow / mono', move: 'Widen sides / pan supporting parts; keep bass mono', where: 'M/S — sides up, low kept centered' },
  { symptom: 'loud but flat', move: 'Back off the limiter; parallel-compress the bus for punch', where: 'master bus · −2 dB less limiting' },
  { symptom: 'no punch / weak transients', move: 'Slower comp attack, add transient snap', where: 'drum bus attack 20–40 ms' },
  { symptom: 'clipping / over true-peak', move: 'Lower the ceiling; catch inter-sample peaks', where: 'true-peak limiter at −1 dBTP' },
  { symptom: 'over-compressed / pumping', move: 'Raise threshold, faster release, or less ratio', where: 'bus comp — 1–2 dB GR max' },
];

export function techniquesFor(query: string): Technique[] {
  const q = query.toLowerCase();
  return TECHNIQUES.filter((t) => t.symptom.includes(q) || t.move.toLowerCase().includes(q) || t.where.toLowerCase().includes(q));
}

/** A compact, model-ready grounding string: targets + the genre norm + technique cues. Fed to the
 *  Council's persona prompts so their advice is anchored to real numbers. */
export function knowledgeGrounding(genre?: string, platform?: string): string {
  const t = platform ? loudnessTarget(platform) : loudnessTarget('Spotify');
  const g = genre ? genreProfile(genre) : undefined;
  const parts: string[] = [];
  if (t) parts.push(`Delivery target (${t.platform}): ${t.lufs} LUFS integrated, true-peak ≤ ${t.truePeakDb} dBTP. ${t.note}`);
  if (g) parts.push(`Genre norm (${g.genre}): masters usually ${g.lufs[0]}…${g.lufs[1]} LUFS, PLR ${g.plr[0]}–${g.plr[1]}. ${g.feel}`);
  parts.push('Technique cues: ' + TECHNIQUES.map((x) => `${x.symptom} → ${x.move} (${x.where})`).join('; '));
  return parts.join('\n');
}
