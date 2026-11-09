// Compile a DiscProject into disc navigation: movie objects, index, playlists and the
// IG button programs for every menu. Graphics are rasterised separately (menuRaster in the UI).
//
// Register map:  GPR0 = chapter mark to start at (menus set it, title objects consume it)
//                GPR1 = audio stream word, GPR2 = subtitle stream word, GPR3 = scratch
import type { IndexIn, MovieObjectIn, PlaylistIn, StreamsIn } from './bdmv';
import * as H from './hdmv';
import type { Insn } from './hdmv';
import { autoNav, type DiscMenu, type DiscProject, type DiscTitle, type MenuAction } from './project';

export const MENU_PL_BASE = 900;
export interface CompiledButton { id: number; ref: string; nav: { up?: number; down?: number; left?: number; right?: number }; commands: Insn[]; autoAction: boolean }
export interface CompiledMenu { menuId: string; playlistId: number; objectId: number; popup: boolean; defaultButton: number; buttons: CompiledButton[] }
export interface CompiledPlaylist { id: number; kind: 'TITLE' | 'MENU' | 'INTRO'; refId: string; pl: PlaylistIn }
export interface Compiled {
  index: IndexIn; objects: { name: string; obj: MovieObjectIn }[]; playlists: CompiledPlaylist[]; menus: CompiledMenu[];
  titleObject: Record<string, number>; menuObject: Record<string, number>; warnings: string[];
}

export function streamsFor(p: DiscProject, t?: DiscTitle, igLangs: string[] = []): StreamsIn {
  return {
    video: { codec: p.video.codec, h: p.video.h, scan: p.video.scan, fps: p.video.fps, dynamic: p.video.dynamic },
    audio: (t?.audio || []).map(a => ({ codec: a.codec, channels: a.channels, lang: a.lang })),
    pg: (t?.subtitles || []).map(s => ({ lang: s.lang })),
    ig: igLangs.map(lang => ({ lang })),
  };
}

export function compile(p: DiscProject): Compiled {
  const warnings: string[] = [];
  const objects: { name: string; obj: MovieObjectIn }[] = [];
  const add = (name: string, obj: MovieObjectIn) => { objects.push({ name, obj }); return objects.length - 1; };

  // Reserve object ids up front so commands can reference each other.
  const titleObject: Record<string, number> = {};
  const menuObject: Record<string, number> = {};
  add('FirstPlay', { commands: [] });
  p.menus.forEach(m => { menuObject[m.id] = add(`Menu: ${m.name}`, { commands: [] }); });
  p.titles.forEach(t => { titleObject[t.id] = add(`Title: ${t.name}`, { commands: [], resume: t.kind === 'FEATURE' || t.kind === 'EPISODE' }); });
  const playAll: Record<string, number> = {};

  const playlists: CompiledPlaylist[] = [];
  const titlePl: Record<string, number> = {};
  const popup = p.popupMenuId ? p.menus.find(m => m.id === p.popupMenuId) : undefined;
  p.titles.forEach((t, i) => {
    const id = i + 1;
    titlePl[t.id] = id;
    const igOnTitle = popup && (t.kind === 'FEATURE' || t.kind === 'EPISODE') ? ['eng'] : [];
    playlists.push({ id, kind: t.kind === 'INTRO' ? 'INTRO' : 'TITLE', refId: t.id, pl: {
      format: p.format, noMenuCall: !!t.noSkip,
      items: [{ clip: String(id).padStart(5, '0'), inSec: 0, outSec: t.source.durationSec, streams: streamsFor(p, t, igOnTitle) }],
      marks: (t.chapters.length ? t.chapters : [{ timeSec: 0 }]).map(c => ({ item: 0, sec: c.timeSec })),
    } });
  });
  p.menus.filter(m => m.id !== p.popupMenuId).forEach((m, j) => {
    const id = MENU_PL_BASE + j;
    const loop = m.background.kind === 'video' || m.background.kind === 'title' ? (m.background.loopSec || 30) : 1;
    playlists.push({ id, kind: 'MENU', refId: m.id, pl: {
      format: p.format,
      items: [{ clip: String(id).padStart(5, '0'), inSec: 0, outSec: loop, still: loop <= 1 ? 'infinite' : 'none', streams: { ...streamsFor(p), audio: m.audio ? [{ codec: 'ac3', channels: 2, lang: 'eng' }] : [], ig: [{ lang: 'eng' }] } }],
      marks: [{ item: 0, sec: 0 }],
    } });
  });
  const menuPl = (m: DiscMenu) => playlists.find(x => x.kind === 'MENU' && x.refId === m.id)?.id;

  const topObj = p.topMenuId != null ? menuObject[p.topMenuId] : undefined;
  const firstTitle = p.titles.find(t => t.kind === 'FEATURE') || p.titles.find(t => t.kind === 'EPISODE') || p.titles[0];
  const backToMenu = (): Insn[] => (topObj != null ? [H.jumpObject(topObj)] : [H.brk()]);

  // Button action → commands.
  const actionCmds = (a: MenuAction, inPopup: boolean): Insn[] => {
    switch (a.kind) {
      case 'PLAY_TITLE': {
        const t = p.titles.find(x => x.id === a.titleId);
        if (!t) { warnings.push(`A button plays a title that no longer exists.`); return []; }
        const mark = a.chapterId ? Math.max(0, t.chapters.findIndex(c => c.id === a.chapterId)) : 0;
        if (inPopup) return [H.linkMark(mark), H.popupOff()];
        return [H.move(0, mark), H.jumpObject(titleObject[t.id])];
      }
      case 'PLAY_ALL': {
        const key = a.titleIds.join(',');
        if (playAll[key] == null) {
          const cmds: Insn[] = [H.move(0, 0)];
          for (const id of a.titleIds) if (titlePl[id]) cmds.push(H.setStreamReg(3), H.playPL(titlePl[id]));
          playAll[key] = add('Play All', { commands: [H.move(3, 0), H.or(3, 1), H.or(3, 2), ...cmds.slice(0), ...backToMenu()] });
        }
        return [H.jumpObject(playAll[key])];
      }
      case 'GO_MENU': {
        const o = menuObject[a.menuId];
        if (o == null) { warnings.push('A button opens a menu that no longer exists.'); return []; }
        return [H.jumpObject(o)];
      }
      case 'SET_AUDIO': return [H.move(1, H.streamWord({ audio: a.trackIndex + 1 }))];
      case 'SET_SUBTITLE': return [H.move(2, a.trackIndex === 'off' ? H.streamWord({ pg: 1, pgOn: false }) : H.streamWord({ pg: a.trackIndex + 1, pgOn: true }))];
      case 'RESUME': return [H.resume()];
      case 'CLOSE_POPUP': return [H.popupOff()];
      default: return [];
    }
  };

  const compiledMenus: CompiledMenu[] = p.menus.map(m => {
    const isPopup = m.id === p.popupMenuId;
    const btns = autoNav(m.buttons);
    const num = new Map(btns.map((b, i) => [b.id, i + 1]));
    const buttons = btns.map(b => ({
      id: num.get(b.id)!, ref: b.id, autoAction: !!b.autoAction,
      nav: { up: num.get(b.nav.up || ''), down: num.get(b.nav.down || ''), left: num.get(b.nav.left || ''), right: num.get(b.nav.right || '') },
      commands: actionCmds(b.action, isPopup),
    }));
    if (!buttons.length) warnings.push(`Menu "${m.name}" has no buttons.`);
    const pl = menuPl(m);
    if (!isPopup && pl != null) {
      // Menu object: play the menu clip; loop forever (the IG takes over input).
      objects[menuObject[m.id]].obj = { menuCallMask: true, titleSearchMask: false, commands: [H.playPL(pl), H.goTo(0)] };
    }
    return { menuId: m.id, playlistId: pl ?? -1, objectId: menuObject[m.id], popup: isPopup, defaultButton: num.get(m.defaultButton || '') || 1, buttons };
  });

  // Title objects: apply chosen streams, play from GPR0's chapter, then the end action.
  p.titles.forEach((t, i) => {
    const next = p.titles[i + 1];
    const end: Insn[] = t.endAction === 'NEXT' && next ? [H.move(0, 0), H.jumpObject(titleObject[next.id])]
      : t.endAction === 'STOP' ? [H.brk()] : backToMenu();
    objects[titleObject[t.id]].obj.commands = [H.move(3, 0), H.or(3, 1), H.or(3, 2), H.setStreamReg(3), H.playPLMarkReg(titlePl[t.id], 0), H.move(0, 0), ...end];
  });

  // First play: init registers, intros, then menu or feature.
  const fp: Insn[] = [H.move(0, 0), H.move(1, H.streamWord({ audio: 1 })), H.move(2, H.streamWord({ pg: 1, pgOn: false }))];
  for (const id of p.firstPlay.introTitleIds) if (titlePl[id]) fp.push(H.playPL(titlePl[id]));
  if (p.firstPlay.then === 'TOP_MENU' && topObj != null) fp.push(H.jumpObject(topObj));
  else if (firstTitle) fp.push(H.jumpObject(titleObject[firstTitle.id]));
  else warnings.push('Nothing to play: add a title.');
  objects[0].obj = { commands: fp };
  if (p.firstPlay.then === 'TOP_MENU' && topObj == null) warnings.push('First play goes to the top menu, but no top menu is set.');

  const index: IndexIn = {
    format: p.format, video: { h: p.video.h, scan: p.video.scan, fps: p.video.fps },
    firstPlay: { kind: 'HDMV', movie: true, objectId: 0 },
    topMenu: { kind: 'HDMV', movie: false, objectId: topObj ?? 0 },
    titles: p.titles.filter(t => t.kind !== 'INTRO').map(t => ({ kind: 'HDMV' as const, movie: true, objectId: titleObject[t.id] })),
  };
  return { index, objects, playlists, menus: compiledMenus, titleObject, menuObject, warnings };
}
