// templatesLyrics — Lyric slides in the Ambo slide template library.
//
// Ten council-authored styles from LYRIC_STYLES (Sanctuary Lower Third, Karaoke Sweep,
// Word Stack, Wide Screen, Neon Signal, Lyric Sheet, Gilded, Riot Poster, Horizon,
// Confidence Monitor) exposed as first-class slide templates under the Worship / Lyrics category.
//
// Each template renders live via the 'lyrics.display' live drawer (calling renderLyricFrame)
// so that animations, kinetic sweeps, and theme styling render in real-time on both
// outputs and gallery thumbnails/previews.

import { rect, text } from '../../tela/templateKit';
import { box, fitText, Stack, bbox, type Box } from './layout';
import { typeset } from './themes';
import { prelude } from './parts';
import { registerLiveDrawer } from './live';
import {
  LYRIC_STYLES, lyricStyleById, renderLyricFrame, SAMPLE_LYRICS, type LyricLine, type LyricStyle,
} from '../lyricStyles';
import { getLyricClock, lyricsFor } from '../lyricFeed';
import { getCaption, getLyricCue } from '../liveCaptionStore';
import type { DesignCtx, FieldDef, SlideDesigner, SlideObj, SlideTemplateDef } from './types';

const F = (key: string, label: string, def: string, o: Partial<FieldDef> = {}): FieldDef => ({ key, label, default: def, ...o });

// Lyric templates carry NO song: title, artist, lyrics are left empty so the live lyrics (the track that is
// playing, or what is being sung/said) fill them. Type your own lines only to override.
const LYRIC_FIELDS = (styleId: string): FieldDef[] => [
  F('title', 'Song title', '', { hint: 'Optional — empty uses the playing track\'s title' }),
  F('artist', 'Artist / Author', '', { hint: 'Optional — empty uses the playing track\'s artist' }),
  F('kicker', 'Section', ''),
  F('lyrics', 'Lyrics (lines)', '', { multiline: true, hint: 'Leave empty: live lyrics follow the track / singer. Type lines here only to override.' }),
  F('nextLyrics', 'Next line preview', ''),
  F('info', 'Key / Licence', ''),
  F('liveSource', 'Audio / Clock source', 'auto', { kind: 'select', options: ['auto', 'bus', 'dj', 'live', 'manual'], hint: 'auto = follow audio playlist, DJ deck, or live transcription if playing, else slide copy' }),
];

/** Parse newline-delimited text into timed LyricLines. */
function parseLines(raw: string): LyricLine[] {
  const clean = (raw || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (!clean.length) return SAMPLE_LYRICS;
  return clean.map((text, i) => ({ time: i * 3.5, text }));
}

// ── Live Drawer for Lyrics Templates ──────────────────────────────────────────
registerLiveDrawer('lyrics.display', (ctx, o, env) => {
  const p = (o.live?.props || {}) as Record<string, any>;
  const styleId = String(p.styleId || 'karaoke');
  const style = lyricStyleById(styleId);

  // Check if an active music/live lyric clock should be followed
  const sourceMode = String(p.liveSource || 'auto');
  let activeClock = null;
  if (sourceMode === 'bus' || sourceMode === 'dj' || sourceMode === 'live') {
    activeClock = getLyricClock(sourceMode as any);
  } else if (sourceMode === 'auto') {
    for (const id of ['live', 'dj', 'bus'] as const) {
      const c = getLyricClock(id);
      if (c && c.isPlaying()) { activeClock = c; break; }
    }
  }

  let lines: LyricLine[] = [];
  let pos = 0;
  const meta: { title?: string; artist?: string; bpm?: number } = {
    title: p.title || undefined,
    artist: p.artist || undefined,
    bpm: 72,
  };

  if (activeClock && activeClock.isPlaying()) {
    const t = activeClock.track();
    if (t) {
      const liveLines = lyricsFor(t);
      if (liveLines.length) {
        lines = liveLines;
        pos = activeClock.getTime();
        meta.title = t.title || meta.title;
        meta.artist = t.artist || meta.artist;
      }
    }
  }

  // Output windows have no player clocks of their own — the studio mirrors the current lyric window to them.
  if (!lines.length) {
    const cue = getLyricCue(), age = Date.now() - cue.at;
    if (cue.lines.length && age < 1500) {
      lines = cue.lines.map((text, i) => ({ time: cue.times[i] ?? i * 3.5, text }));
      pos = cue.pos + (cue.playing ? (age / 1000) * (cue.rate || 1) : 0);
    }
  }
  // …then whatever is being said live.
  if (!lines.length) {
    const cap = getCaption();
    if (cap.lines.length && Date.now() - cap.at < 9000) {
      lines = cap.lines.map((text, i) => ({ time: i * 3.5, text }));
      pos = (lines.length - 1) * 3.5 + 0.6;
    }
  }
  if (!lines.length) {
    const own = String(p.lyrics || '').trim();
    if (own) {
      lines = parseLines(own);
      // In preview / gallery with no playback, gently advance position so words sweep & animate
      const totalSpan = Math.max(10, lines.length * 3.5);
      pos = env.t > 0 ? (env.t * 0.85) % totalSpan : 3.6;
    } else if (env.host) {
      return;                                              // on air with nothing to sing yet: show nothing
    } else {
      lines = SAMPLE_LYRICS;                               // gallery / editor preview only
      pos = env.t > 0 ? (env.t * 0.85) % Math.max(10, lines.length * 3.5) : 3.6;
    }
  }

  renderLyricFrame(ctx, style, lines, pos, env.W, env.H, meta);
});

// ── Designer ──────────────────────────────────────────────────────────────────
function designLyrics(d: DesignCtx, styleId: string): SlideObj[] {
  const { L, f, th, W, H } = d;
  const u = L.u, S = L.safe, ty = typeset(th), c = th.c;
  const out = prelude(d, false); // Ground first with templateRole: 'GROUND'

  // Live layer that runs the council-designed typography renderer
  const liveLayer = rect(0, 0, W, H, 'none', { label: `Lyric Look · ${styleId}`, role: 'BODY' }) as SlideObj;
  liveLayer.live = {
    drawer: 'lyrics.display',
    props: {
      styleId,
      title: f.title,
      artist: f.artist,
      kicker: f.kicker,
      lyrics: f.lyrics,
      nextLyrics: f.nextLyrics,
      info: f.info,
      liveSource: f.liveSource,
    },
  };
  out.push(liveLayer);

  // Baseline vector objects for non-live renderers, SVG export and test verification
  if (f.kicker) {
    out.push(fitText(S.x, S.y + u * 2, S.w, f.kicker, ty.label(u * 1.6, { color: c.accent }), u * 3, u * 1.1));
  }

  // Footer / CCLI info
  if (f.info) {
    out.push(fitText(S.x, S.bottom - u * 3.5, S.w, f.info, ty.label(u * 1.2, { color: c.muted }), u * 2.5, u * 0.9));
  }

  return out;
}

// ── Template Definitions ──────────────────────────────────────────────────────
export const LYRIC_TEMPLATES: SlideTemplateDef[] = [
  {
    id: 'lyrics-sanctuary',
    name: 'Lyrics · Sanctuary Lower Third',
    category: 'Lyrics',
    slot: 'slide',
    blurb: 'Set like a hymnal: a serif line on a thin rule, the next line waiting in small caps beneath.',
    fields: LYRIC_FIELDS('sanctuary'),
    design: d => designLyrics(d, 'sanctuary'),
  },
  {
    id: 'lyrics-karaoke',
    name: 'Lyrics · Karaoke Sweep',
    category: 'Lyrics',
    slot: 'slide',
    blurb: 'Centred worship lyrics with smooth word sweep tracking the singer.',
    fields: LYRIC_FIELDS('karaoke'),
    design: d => designLyrics(d, 'karaoke'),
  },
  {
    id: 'lyrics-stack',
    name: 'Lyrics · Word Stack',
    category: 'Lyrics',
    slot: 'slide',
    blurb: 'Dynamic kinetic word stack with current line highlighted.',
    fields: LYRIC_FIELDS('stack'),
    design: d => designLyrics(d, 'stack'),
  },
  {
    id: 'lyrics-widescreen',
    name: 'Lyrics · Wide Screen',
    category: 'Lyrics',
    slot: 'slide',
    blurb: 'Cinematic widescreen lyrics with subtle backdrop letterboxing.',
    fields: LYRIC_FIELDS('widescreen'),
    design: d => designLyrics(d, 'widescreen'),
  },
  {
    id: 'lyrics-neon',
    name: 'Lyrics · Neon Signal',
    category: 'Lyrics',
    slot: 'slide',
    blurb: 'Vibrant neon signal typography for modern high-energy praise.',
    fields: LYRIC_FIELDS('neon'),
    design: d => designLyrics(d, 'neon'),
  },
  {
    id: 'lyrics-sheet',
    name: 'Lyrics · Lyric Sheet',
    category: 'Lyrics',
    slot: 'slide',
    blurb: 'Clean minimalist editorial typography with maximum legibility.',
    fields: LYRIC_FIELDS('sheet'),
    design: d => designLyrics(d, 'sheet'),
  },
  {
    id: 'lyrics-gilded',
    name: 'Lyrics · Gilded',
    category: 'Lyrics',
    slot: 'slide',
    blurb: 'Baroque golden ornamented look for majestic anthems.',
    fields: LYRIC_FIELDS('gilded'),
    design: d => designLyrics(d, 'gilded'),
  },
  {
    id: 'lyrics-riot',
    name: 'Lyrics · Riot Poster',
    category: 'Lyrics',
    slot: 'slide',
    blurb: 'Expressive distressed poster typography for punchy praise.',
    fields: LYRIC_FIELDS('riot'),
    design: d => designLyrics(d, 'riot'),
  },
  {
    id: 'lyrics-horizon',
    name: 'Lyrics · Horizon',
    category: 'Lyrics',
    slot: 'slide',
    blurb: 'Futuristic horizon line with expansive modern type.',
    fields: LYRIC_FIELDS('horizon'),
    design: d => designLyrics(d, 'horizon'),
  },
  {
    id: 'lyrics-confidence',
    name: 'Lyrics · Confidence Monitor',
    category: 'Lyrics',
    slot: 'slide',
    blurb: 'Stage confidence monitor layout with current line, next line and progress.',
    fields: LYRIC_FIELDS('confidence'),
    design: d => designLyrics(d, 'confidence'),
  },
];
