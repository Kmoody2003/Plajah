// DiscProject — the authored disc: titles, chapters, tracks, menus, navigation, destination.
import type { TelaVectorObject } from '../../types';
import type { AudioCodec, DestinationId, DiscFormat, Dynamic, VideoCodec } from './spec';
import { GRAPHICS_PLANE } from './spec';

export interface Chapter { id: string; name: string; timeSec: number; thumbSec?: number }

export interface AudioTrack {
  id: string; lang: string; label: string; codec: AudioCodec; channels: 2 | 6 | 8; kbps: number;
  /** Stream index in the source, or a separate file. */
  sourceIndex?: number; sourcePath?: string; commentary?: boolean;
}

export interface SubtitleTrack {
  id: string; lang: string; label: string; forced?: boolean; sdh?: boolean;
  /** SRT/WebVTT text, or the Plajah caption track id it was built from. */
  srt?: string; captionTrackId?: string;
}

export type TitleKind = 'FEATURE' | 'EPISODE' | 'EXTRA' | 'TRAILER' | 'INTRO';
export interface DiscTitle {
  id: string; name: string; kind: TitleKind;
  source: { assetId?: string; url?: string; path?: string; durationSec: number; w?: number; h?: number; fps?: number };
  chapters: Chapter[]; audio: AudioTrack[]; subtitles: SubtitleTrack[];
  /** Pinned video bitrate (kbps); otherwise the budget planner chooses. */
  videoKbps?: number;
  endAction: 'MENU' | 'NEXT' | 'STOP' | 'RETURN';
  /** UOP: block skipping (studio logos / ratings cards only). */
  noSkip?: boolean;
}

export type MenuAction =
  | { kind: 'PLAY_TITLE'; titleId: string; chapterId?: string }
  | { kind: 'PLAY_ALL'; titleIds: string[] }
  | { kind: 'GO_MENU'; menuId: string }
  | { kind: 'SET_AUDIO'; titleId: string; trackIndex: number }
  | { kind: 'SET_SUBTITLE'; titleId: string; trackIndex: number | 'off' }
  | { kind: 'RESUME' }
  | { kind: 'CLOSE_POPUP' }
  | { kind: 'NONE' };

export interface ButtonStyle {
  font: string; size: number; weight?: number;
  color: string; selColor: string; actColor: string;
  bg?: string; selBg?: string; actBg?: string; radius?: number;
  /** Selection mark: underline bar, glow, pill fill, arrow. */
  mark?: 'underline' | 'pill' | 'glow' | 'arrow' | 'none';
  align?: 'left' | 'center' | 'right';
}

export interface MenuButton {
  id: string; label: string; x: number; y: number; w: number; h: number;
  style: ButtonStyle;
  /** Neighbour button ids; missing = auto from geometry. */
  nav: { up?: string; down?: string; left?: string; right?: string };
  action: MenuAction;
  /** Fire on select (no OK press) — used for tabs/page flips. */
  autoAction?: boolean;
  /** Chapter-thumbnail button: shows a still from this title time. */
  thumb?: { titleId: string; timeSec: number };
  /** Tela vector art per state, in button-local coordinates (council templates). Overrides `style` drawing. */
  art?: { normal: TelaVectorObject[]; selected: TelaVectorObject[]; activated: TelaVectorObject[] };
}

export type MenuDecor =
  | { kind: 'text'; id: string; text: string; x: number; y: number; size: number; font: string; color: string; weight?: number; align?: 'left' | 'center' | 'right'; letterSpacing?: number }
  | { kind: 'rect'; id: string; x: number; y: number; w: number; h: number; fill: string; radius?: number; opacity?: number }
  | { kind: 'image'; id: string; x: number; y: number; w: number; h: number; src: string; opacity?: number };

export type MenuKind = 'TOP' | 'POPUP' | 'SCENES' | 'SETUP' | 'EXTRAS' | 'EPISODES';
export interface DiscMenu {
  id: string; name: string; kind: MenuKind;
  background: { kind: 'color' | 'image' | 'video' | 'title'; value: string; loopSec?: number; titleId?: string; fromSec?: number };
  /** Looping menu audio (path/url). */
  audio?: string;
  decor: MenuDecor[]; buttons: MenuButton[];
  defaultButton?: string;
  timeout?: { sec: number; action: MenuAction };
  /** Linked Tela design (Design in Tela round-trip). */
  telaDocId?: string;
  /** Static Tela art over the background (1920×1080 plane). When present it replaces `decor`. */
  art?: TelaVectorObject[];
  /** Ambient motion baked into the menu background clip (council templates). */
  motion?: { layers: { art: TelaVectorObject[]; w: number; h: number; from: [number, number]; to: [number, number]; periodSec: number; ease: 'sine' | 'linear'; opacity?: number; blend?: 'screen' | 'normal' }[]; flicker?: { amount: number; hz: number }; grain?: number; note?: string };
}

export interface DiscProject {
  id: string; name: string; ownerId?: string;
  format: DiscFormat; destination: DestinationId; mediumId: string;
  region: 'A' | 'B' | 'C' | 'ABC';
  video: { w: number; h: number; fps: number; scan: 'p' | 'i'; codec: VideoCodec; dynamic: Dynamic;
    hdr?: { maxCll: number; maxFall: number; masterDisplay: 'P3-D65-1000' | 'P3-D65-4000' | 'BT2020-1000' } };
  titles: DiscTitle[]; menus: DiscMenu[];
  firstPlay: { introTitleIds: string[]; then: 'TOP_MENU' | 'PLAY_FEATURE' };
  topMenuId?: string; popupMenuId?: string;
  packaging: { case: 'AMARAY' | 'ELITE' | 'STEELBOOK' | 'DIGIPAK' | 'SLEEVE'; slipcover?: boolean; labelDocId?: string; coverDocId?: string; upc?: string; catalog?: string };
  templateId?: string;
  createdAt: number; updatedAt: number;
}

let seq = 0;
export const uid = (p: string) => `${p}_${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 5)}`;

export function newProject(name: string, format: DiscFormat, opts: Partial<DiscProject> = {}): DiscProject {
  const now = Date.now();
  const uhd = format === 'UHD';
  return {
    id: uid('disc'), name, format,
    destination: 'burn-pod', mediumId: uhd ? 'bdr50' : 'bdr25', region: 'ABC',
    video: uhd
      ? { w: 3840, h: 2160, fps: 23.976, scan: 'p', codec: 'hevc', dynamic: 'HDR10', hdr: { maxCll: 1000, maxFall: 400, masterDisplay: 'P3-D65-1000' } }
      : { w: 1920, h: 1080, fps: 23.976, scan: 'p', codec: 'h264', dynamic: 'SDR709' },
    titles: [], menus: [],
    firstPlay: { introTitleIds: [], then: 'TOP_MENU' },
    packaging: { case: uhd ? 'AMARAY' : 'AMARAY' },
    createdAt: now, updatedAt: now,
    ...opts,
  };
}

export function newTitle(name: string, durationSec: number, kind: TitleKind = 'FEATURE'): DiscTitle {
  return {
    id: uid('title'), name, kind, source: { durationSec },
    chapters: [{ id: uid('ch'), name: 'Chapter 1', timeSec: 0 }],
    audio: [{ id: uid('aud'), lang: 'eng', label: 'English 5.1', codec: 'lpcm', channels: 6, kbps: 6912 }],
    subtitles: [], endAction: kind === 'EPISODE' ? 'NEXT' : 'MENU',
  };
}

/** Evenly spaced chapters (default every 10 minutes), keeping chapter 1 at 0. */
export function autoChapters(durationSec: number, everySec = 600): Chapter[] {
  const out: Chapter[] = [];
  for (let t = 0, i = 1; t < durationSec - 30; t += everySec, i++) out.push({ id: uid('ch'), name: `Chapter ${i}`, timeSec: t });
  return out.length ? out : [{ id: uid('ch'), name: 'Chapter 1', timeSec: 0 }];
}

/** Fill missing up/down/left/right neighbours from button geometry (nearest in each direction). */
export function autoNav(buttons: MenuButton[]): MenuButton[] {
  const c = (b: MenuButton) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });
  const pick = (b: MenuButton, dir: 'up' | 'down' | 'left' | 'right') => {
    const a = c(b);
    let best: MenuButton | undefined; let bestScore = Infinity;
    for (const o of buttons) {
      if (o.id === b.id) continue;
      const q = c(o); const dx = q.x - a.x; const dy = q.y - a.y;
      const along = dir === 'up' ? -dy : dir === 'down' ? dy : dir === 'left' ? -dx : dx;
      const across = dir === 'up' || dir === 'down' ? Math.abs(dx) : Math.abs(dy);
      if (along <= 4) continue;
      const score = along + across * 2.5;
      if (score < bestScore) { bestScore = score; best = o; }
    }
    return best?.id;
  };
  return buttons.map(b => ({ ...b, nav: {
    up: b.nav.up ?? pick(b, 'up'), down: b.nav.down ?? pick(b, 'down'),
    left: b.nav.left ?? pick(b, 'left'), right: b.nav.right ?? pick(b, 'right'),
  } }));
}

/** Title-safe area for the 1920×1080 graphics plane (90% action / 80% title). */
export const SAFE = {
  action: { x: GRAPHICS_PLANE.w * 0.05, y: GRAPHICS_PLANE.h * 0.05, w: GRAPHICS_PLANE.w * 0.9, h: GRAPHICS_PLANE.h * 0.9 },
  title: { x: GRAPHICS_PLANE.w * 0.1, y: GRAPHICS_PLANE.h * 0.1, w: GRAPHICS_PLANE.w * 0.8, h: GRAPHICS_PLANE.h * 0.8 },
};

export const totalRuntime = (p: DiscProject) => p.titles.reduce((s, t) => s + t.source.durationSec, 0);
export const titleById = (p: DiscProject, id?: string) => p.titles.find(t => t.id === id);
export const menuById = (p: DiscProject, id?: string) => p.menus.find(m => m.id === id);
