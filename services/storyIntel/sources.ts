// Every kind of thing Story Intelligence has read, as one shape the Tela workspace lists:
//   video — a Reello upload (reelloIntel/{videoId})
//   film  — a movie or series read by the film pipeline (taleoAnalysis/{albumId}, report in Storage)
//   album — music read by Chora's music intelligence (musicIntel/{albumId})
// Pure: the API (routes/storyIntelSources.ts) loads the docs and calls these.

import type { ReelloIntelJob, WorldFiling } from '../reello/intel/types';
import { findingsFromJob, type Finding } from './findings';

export type SourceKind = 'video' | 'film' | 'album';
export const SOURCE_KINDS: SourceKind[] = ['video', 'film', 'album'];

export interface IntelSourceView {
  kind: SourceKind;
  id: string;
  title: string;
  status: 'READY' | 'WORKING' | 'FAILED' | 'SKIPPED';
  stage?: string;
  pct?: number;
  error?: string;
  thumbUrl?: string;
  /** Mux playback id for the Desk player (videos and films). */
  playbackId?: string;
  durationSec?: number;
  findings: Finding[];
  filing: Record<string, WorldFiling>;
  /** A video read before people/places existed: offer "Read again". */
  oldReading?: boolean;
  /** video only: the upload's Story Intelligence options, kept on a re-read. */
  videoOptions?: unknown;
  updatedAt: number;
}

const WORKING_VIDEO = new Set(['WAITING_MEDIA', 'QUEUED', 'WATCHING', 'DRAFTING']);
const slug = (s: string) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'item';
const yearOf = (v: unknown, fallback: number) => {
  const n = typeof v === 'number' ? (v > 3000 ? new Date(v).getFullYear() : v) : typeof v === 'string' ? parseInt(v.slice(0, 4), 10) : NaN;
  return Number.isInteger(n) && n > 1000 && n < 3000 ? n : fallback;
};

// ── Videos ────────────────────────────────────────────────────────────────────

export function videoSource(job: ReelloIntelJob, video?: Record<string, any> | null): IntelSourceView {
  const r = job.report;
  return {
    kind: 'video', id: job.videoId, title: job.videoTitle || video?.title || 'Untitled video',
    status: job.status === 'READY' ? 'READY' : WORKING_VIDEO.has(job.status) ? 'WORKING' : job.status === 'SKIPPED' ? 'SKIPPED' : 'FAILED',
    stage: job.progress?.stage, pct: job.progress?.pct, error: job.error,
    thumbUrl: r?.stills?.[0]?.url || video?.thumbnailUrl || undefined,
    playbackId: video?.muxPlaybackId || undefined,
    durationSec: Number(video?.timebase?.durationSec || video?.duration || 0) || undefined,
    findings: job.status === 'READY' ? findingsFromJob(job) : [],
    filing: job.worldFiling || {},
    oldReading: !!r && !r.people && !r.lore,
    videoOptions: job.options,
    updatedAt: job.updatedAt || 0,
  };
}

// ── Films ─────────────────────────────────────────────────────────────────────

const TIER_WORD: Record<string, string> = { MAIN: 'Main character', SUPPORTING: 'Supporting', MINOR: 'Minor' };

/** Stills under taleoAnalysis/{owner}/{album}/stills/* are publicly readable (storage.rules). */
export const filmStillUrl = (bucket: string, ownerId: string, albumId: string, path: string) => {
  if (!path) return undefined;
  if (/^https?:\/\//i.test(path)) return path;
  const full = path.startsWith('taleoAnalysis/') ? path : `taleoAnalysis/${ownerId}/${albumId}/${path.replace(/^\/+/, '')}`;
  if (!/\/stills\//.test(full)) return undefined;
  return `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(full)}?alt=media`;
};

export function filmFindings(report: any, ctx: { albumId: string; ownerId: string; title: string; year: number; bucket: string }): Finding[] {
  if (!report) return [];
  const out: Finding[] = [];
  const stills: any[] = Array.isArray(report.stills) ? report.stills : [];
  const stillById = new Map(stills.map(s => [String(s.id), s]));
  const still = (ids?: unknown[], tSec?: number) => {
    const s = (Array.isArray(ids) ? ids.map(i => stillById.get(String(i))).find(Boolean) : null)
      || (tSec != null ? stills.reduce((best: any, x: any) => (!best || Math.abs(x.tSec - tSec) < Math.abs(best.tSec - tSec) ? x : best), null) : null);
    return s ? filmStillUrl(ctx.bucket, ctx.ownerId, ctx.albumId, String(s.path || '')) : undefined;
  };
  const scenes: any[] = Array.isArray(report.scenes) ? report.scenes : [];
  const sceneTitle = (id: string) => scenes.find(s => s.id === id)?.title || scenes.find(s => s.id === id)?.slugline || '';

  const chars: any[] = (Array.isArray(report.characters) ? report.characters : []).filter((c: any) => c?.name);
  const charKey = new Map<string, string>();
  for (const c of chars) {
    const key = `person:c-${slug(c.refId || c.name)}`;
    charKey.set(String(c.refId), key);
    const apps: any[] = Array.isArray(c.appearances) ? c.appearances : [];
    out.push({
      key, kind: 'character', title: String(c.name).slice(0, 120),
      summary: String(c.description || c.arc || `${TIER_WORD[c.tier] || 'Character'} in ${ctx.title}`).slice(0, 1200),
      why: [TIER_WORD[c.tier] || 'Character', c.screenTimeSec ? `On screen ${Math.round(c.screenTimeSec / 60)} min.` : '', c.dialogueLines ? `${c.dialogueLines} lines.` : ''].filter(Boolean).join('. ').replace('..', '.'),
      moments: apps.slice(0, 12).map(a => ({ tSec: Number(a.tSec) || 0, text: sceneTitle(a.sceneId) || undefined })).sort((a, b) => a.tSec - b.tSec),
      stillUrl: (typeof c.imageUrl === 'string' && /^https?:/.test(c.imageUrl) ? c.imageUrl : undefined) || still(c.stillIds, c.bestFrameSec),
      confidence: (Number(c.confidence) || 0) >= 0.7 && c.tier !== 'MINOR' ? 'high' : 'medium',
      role: TIER_WORD[c.tier] || 'Character',
    });
  }

  const sceneStart = (ids: unknown) => (Array.isArray(ids) ? ids : []).map(id => scenes.find(s => s.id === id)?.startSec).filter((t): t is number => typeof t === 'number');
  for (const l of Array.isArray(report.locations) ? report.locations : []) {
    if (!l?.name) continue;
    out.push({
      key: `lore:loc-${slug(l.refId || l.name)}`, kind: 'lore', title: String(l.name).slice(0, 120),
      summary: String(l.description || `A place in ${ctx.title}`).slice(0, 1200),
      why: `A place in the film${Array.isArray(l.sceneIds) && l.sceneIds.length ? `, in ${l.sceneIds.length} scenes` : ''}.`,
      moments: sceneStart(l.sceneIds).slice(0, 8).map(tSec => ({ tSec })), stillUrl: still(l.stillIds, l.bestFrameSec),
      confidence: (Number(l.confidence) || 0) >= 0.6 ? 'high' : 'medium', loreType: 'LOCATION',
    });
  }
  for (const m of Array.isArray(report.macguffins) ? report.macguffins : []) {
    if (!m?.name) continue;
    out.push({
      key: `lore:mg-${slug(m.refId || m.name)}`, kind: 'lore', title: String(m.name).slice(0, 120),
      summary: String(m.description || '').slice(0, 1200) || `${m.narrativeRole === 'MOTIF' ? 'A motif' : 'A key object'} in ${ctx.title}`,
      why: m.narrativeRole === 'MACGUFFIN' ? 'The object the story turns on.' : m.narrativeRole === 'MOTIF' ? 'A motif that keeps coming back.' : 'A key prop.',
      moments: sceneStart(m.sceneIds).slice(0, 8).map(tSec => ({ tSec })), stillUrl: still(m.stillIds, m.bestFrameSec),
      confidence: 'high', loreType: 'ITEM',
    });
  }
  for (const t of (Array.isArray(report.themes) ? report.themes : []).slice(0, 8)) {
    out.push({ key: `lore:t-${slug(String(t))}`, kind: 'lore', title: String(t).slice(0, 100), summary: `A theme of ${ctx.title}`, why: 'A theme of the film.', moments: [], confidence: 'medium', loreType: 'BACKSTORY' });
  }

  for (const a of Array.isArray(report.structure?.acts) ? report.structure.acts : []) {
    const t = Number(a.startSec) || 0;
    out.push({
      key: `chapter:${Math.round(t)}`, kind: 'timeline', title: `Act ${a.number}${a.title ? `: ${a.title}` : ''}`.slice(0, 160),
      summary: String(a.summary || a.turningPoint || '').slice(0, 1200) || 'An act of the film.',
      why: a.turningPoint ? `Turns on: ${String(a.turningPoint).slice(0, 160)}` : `Act ${a.number} of the film.`,
      moments: [{ tSec: t }], stillUrl: still(undefined, t + 5), confidence: 'medium', year: ctx.year,
    });
  }

  // Who shares scenes: the film report has no stated relationships, so co-presence is the signal.
  const named = chars.filter(c => c.tier !== 'MINOR');
  const pairs: Array<{ a: any; b: any; n: number; first: number }> = [];
  for (let i = 0; i < named.length; i++) for (let j = i + 1; j < named.length; j++) {
    const shared = scenes.filter(s => Array.isArray(s.characterRefIds) && s.characterRefIds.includes(named[i].refId) && s.characterRefIds.includes(named[j].refId));
    if (shared.length >= 2) pairs.push({ a: named[i], b: named[j], n: shared.length, first: Math.min(...shared.map(s => Number(s.startSec) || 0)) });
  }
  for (const p of pairs.sort((x, y) => y.n - x.n).slice(0, 15)) {
    const ka = charKey.get(String(p.a.refId))!, kb = charKey.get(String(p.b.refId))!;
    out.push({
      key: `rel:with~${ka.slice(9, 52)}~${kb.slice(9, 52)}`, kind: 'relation', title: `${p.a.name} and ${p.b.name}`,
      summary: 'Appear together', why: `They share ${p.n} scenes.`, moments: [{ tSec: p.first }],
      confidence: p.n >= 5 ? 'high' : 'medium', ends: [ka, kb], relationshipType: 'APPEARS_WITH',
    });
  }

  out.push({
    key: 'asset:film', kind: 'asset', title: ctx.title, summary: 'The film', why: 'Add the film to the World so it shows with the World\'s content.',
    moments: [], confidence: 'high', assetId: ctx.albumId, assetCollection: 'albums', stillUrl: still(undefined, 60),
  });
  return out;
}

// ── Albums ────────────────────────────────────────────────────────────────────

export function albumFindings(album: Record<string, any>, job: Record<string, any>, ctx: { albumId: string }): Finding[] {
  const title = String(album.title || 'Untitled album');
  const out: Finding[] = [];
  const intel = job?.album || {};
  if (album.artist) out.push({
    key: `person:a-${slug(album.artist)}`, kind: 'character', title: String(album.artist).slice(0, 120),
    summary: String(intel.sonicSignature || intel.overview || `The artist behind ${title}`).slice(0, 1200),
    why: 'The album\'s artist. Add them if they belong in this World (a persona, a band, a storyteller).',
    moments: [], stillUrl: album.coverImage || undefined, confidence: 'medium', role: 'Artist',
  });
  for (const t of (Array.isArray(intel.throughlines) ? intel.throughlines : []).slice(0, 8)) {
    const text = String(t);
    out.push({
      key: `lore:th-${slug(text)}`, kind: 'lore', title: text.length > 80 ? `${text.slice(0, 77)}…` : text, summary: text.slice(0, 1200),
      why: 'A thread that runs through the album.', moments: [], confidence: 'medium', loreType: 'BACKSTORY',
    });
  }
  const year = yearOf(album.releaseDate ?? album.releaseYear ?? album.createdAt, new Date().getFullYear());
  out.push({
    key: 'date:release', kind: 'timeline', title: `${title} is released`, summary: String(intel.overview || '').slice(0, 1200) || `${title} by ${album.artist || 'the artist'}.`,
    why: `Released in ${year}.`, moments: [], confidence: 'high', year, stillUrl: album.coverImage || undefined,
  });
  if (job?.film?.status === 'LINKED' && job.film.filmTitle) {
    out.push({
      key: 'lore:soundtrack', kind: 'lore', title: `The music of ${job.film.filmTitle}`.slice(0, 120),
      summary: String(job.film.connection || `${title} is the soundtrack to ${job.film.filmTitle}.`).slice(0, 1200),
      why: 'This album scores a film you\'ve published.', moments: [], confidence: 'high', loreType: 'BACKSTORY',
    });
  }
  out.push({
    key: 'asset:album', kind: 'asset', title, summary: 'The album', why: 'Add the album to the World so it shows with the World\'s content.',
    moments: [], confidence: 'high', assetId: ctx.albumId, assetCollection: 'albums', stillUrl: album.coverImage || undefined,
  });
  return out;
}

export const workingFilm = new Set(['WAITING_MEDIA', 'QUEUED', 'SAMPLING', 'PERCEIVING', 'REASONING', 'ASSEMBLING']);
export const workingAlbum = new Set(['QUEUED', 'LISTENING', 'SYNTHESIZING']);
