// ─── Chora Music Intelligence — client surface ───────────────────────────────
// After a creator publishes music, the API listens to every song (measured audio + synced
// lyrics + a listening model grounded on both) and writes a per-song breakdown and an album
// read — see routes/musicIntel.ts. This file kicks that off, drives it while the uploader's
// tab is open, and reads the result. Everything is non-throwing: analysis is a bonus layer
// and must never break publishing or the album page.

import { auth } from './firebase';
import type { MusicIntelBundle, TrackIntelCorrections } from './musicIntel/types';

export type { MusicIntelBundle, TrackIntel, AlbumIntel, HostCard, HostCardKind, MusicIntelJob, FilmContext } from './musicIntel/types';

const base = () => `${(import.meta as any).env?.VITE_APP_URL ?? window.location.origin}/api/music-intel`;

async function authHeaders(): Promise<Record<string, string>> {
  const token = await auth.currentUser?.getIdToken().catch(() => null);
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

async function post(path: string, body: object): Promise<any> {
  try {
    const res = await fetch(`${base()}${path}`, { method: 'POST', headers: await authHeaders(), body: JSON.stringify(body) });
    return await res.json().catch(() => ({}));
  } catch { return {}; }
}

/**
 * Run Music Intelligence for an album the caller owns, in the background. Each request is a
 * budgeted slice on the server; this keeps asking while songs remain (the server resumes from
 * the last finished song, so a closed tab just leaves the rest to the album page / cron).
 */
export async function driveMusicIntel(albumId: string, opts: { force?: boolean } = {}): Promise<void> {
  if (!auth.currentUser || !albumId) return;
  let force = !!opts.force;
  for (let slice = 0; slice < 40; slice++) {
    const out = await post('/analyze', { albumId, ...(force ? { force: true } : {}) });
    force = false;
    if (out?.status === 'BUSY') { await new Promise(r => setTimeout(r, 30_000)); continue; }
    if (!(out?.remaining > 0)) return;
  }
}

/** Resume a job nobody is driving (the album page calls this when the bundle says `stalled`). */
export function continueMusicIntel(albumId: string): Promise<any> {
  return post('/continue', { albumId });
}

/** A film just published: let the creator's soundtracks pick up its Story Intelligence. */
export function linkFilmToSoundtracks(filmAlbumId: string): Promise<any> {
  return post('/link-film', { filmAlbumId });
}

export async function fetchMusicIntel(albumId: string): Promise<(MusicIntelBundle & { stalled?: boolean }) | null> {
  try {
    const res = await fetch(`${base()}/${encodeURIComponent(albumId)}`, { headers: await authHeaders() });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

/** Save the creator's corrections to one song's read. They overlay the analysis on every read. */
export async function saveMusicIntelCorrections(albumId: string, trackId: string, corrections: TrackIntelCorrections): Promise<boolean> {
  try {
    const res = await fetch(`${base()}/corrections`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
      body: JSON.stringify({ albumId, trackId, corrections }),
    });
    return res.ok;
  } catch { return false; }
}

/** Lead sheet: key, tempo, meter and the chord chart as MusicXML (chord symbols over slashes). */
export function leadSheetMusicXML(t: { title: string; composition: { key: string; tempoBpm: number; timeSignature: string; chordChart: { section: string; chords: string[] }[] } }, artist: string): string {
  const esc = (s: string) => s.replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]!));
  const [beats, beatType] = (t.composition.timeSignature.match(/^(\d+)\/(\d+)$/)?.slice(1).map(Number) || [4, 4]) as number[];
  const FIFTHS: Record<string, number> = { C: 0, G: 1, D: 2, A: 3, E: 4, B: 5, 'F#': 6, 'C#': 7, F: -1, Bb: -2, Eb: -3, Ab: -4, Db: -5, Gb: -6 };
  const km = t.composition.key.match(/^([A-G][#b]?)\s*(major|minor)?/i);
  const tonic = km?.[1] || 'C', minor = /minor/i.test(t.composition.key);
  const rel: Record<string, string> = { A: 'C', E: 'G', B: 'D', 'F#': 'A', 'C#': 'E', 'G#': 'B', D: 'F', G: 'Bb', C: 'Eb', F: 'Ab', Bb: 'Db', Eb: 'Gb' };
  const fifths = FIFTHS[minor ? rel[tonic] ?? 'C' : tonic] ?? 0;
  const harmony = (sym: string) => {
    const m = sym.match(/^([A-G])([#b]?)(.*?)(?:\/([A-G][#b]?))?$/);
    if (!m) return '';
    const [, step, acc, q, over] = m;
    const bass = over ? `<bass><bass-step>${over[0]}</bass-step>${over[1] ? `<bass-alter>${over[1] === '#' ? 1 : -1}</bass-alter>` : ''}</bass>` : '';
    const kind = /^m(?!aj)/.test(q) ? (/7/.test(q) ? 'minor-seventh' : 'minor') : /maj7/.test(q) ? 'major-seventh' : /7/.test(q) ? 'dominant' : /dim/.test(q) ? 'diminished' : /sus4|sus/.test(q) ? 'suspended-fourth' : 'major';
    return `<harmony><root><root-step>${step}</root-step>${acc ? `<root-alter>${acc === '#' ? 1 : -1}</root-alter>` : ''}</root><kind text="${esc(q)}">${kind}</kind>${bass}</harmony>`;
  };
  let n = 0;
  const measures = t.composition.chordChart.flatMap(sec => sec.chords.map((c, i) => {
    n++;
    const attrs = n === 1 ? `<attributes><divisions>1</divisions><key><fifths>${fifths}</fifths><mode>${minor ? 'minor' : 'major'}</mode></key><time><beats>${beats}</beats><beat-type>${beatType}</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes><direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>${Math.round(t.composition.tempoBpm) || 100}</per-minute></metronome></direction-type></direction>` : '';
    const rehearsal = i === 0 ? `<direction placement="above"><direction-type><rehearsal>${esc(sec.section)}</rehearsal></direction-type></direction>` : '';
    const slashes = Array.from({ length: beats }, () => `<note><pitch><step>B</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type><notehead>slash</notehead></note>`).join('');
    return `<measure number="${n}">${attrs}${rehearsal}${harmony(c)}${slashes}</measure>`;
  }));
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="3.1"><work><work-title>${esc(t.title)} — lead sheet</work-title></work><identification><creator type="composer">${esc(artist)}</creator></identification>
<part-list><score-part id="P1"><part-name>Lead sheet</part-name></score-part></part-list><part id="P1">${measures.join('')}</part></score-partwise>`;
}
