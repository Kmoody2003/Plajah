// Kit for council disc templates. A template is a Design: its own page builders (main, scenes,
// list, pop-up) that return Tela vector art + buttons whose three states are Tela art too, plus a
// motion recipe the lighting director and animation lead own. assemble() wires the pages into a
// DiscProject's menus with the same navigation contract every template shares.
import type { TelaVectorObject } from '../../../types';
import * as T from '../../tela/templateKit';
import { uid, type ButtonStyle, type DiscMenu, type DiscProject, type DiscTitle, type MenuAction, type MenuButton } from '../project';

export { T };
export const W = 1920, H = 1080;
export type O = TelaVectorObject;
export type State = 'normal' | 'selected' | 'activated';
export const STATES: State[] = ['normal', 'selected', 'activated'];

export interface Item { label: string; sub?: string; meta?: string; action: MenuAction; thumb?: { titleId: string; timeSec: number }; role?: 'primary' | 'item' | 'nav' | 'back'; index?: number }
export interface Page { art: O[]; buttons: MenuButton[]; defaultIndex?: number }
export interface Ctx { disc: DiscProject; title: string; main?: DiscTitle; tagline: string; uhd: boolean }

/** A moving Tela layer baked into the menu background clip (and animated live in the preview). */
export interface MotionLayer {
  art: O[]; w: number; h: number;
  from: [number, number]; to: [number, number];
  periodSec: number; ease: 'sine' | 'linear';
  opacity?: number; blend?: 'screen' | 'normal';
}
export interface MotionRecipe {
  layers: MotionLayer[];
  /** Brightness flicker (candle, film gate): amount 0–0.2, hz. */
  flicker?: { amount: number; hz: number };
  /** Film grain strength 0–30. */
  grain?: number;
  /** One-line note from the animation lead / lighting director. */
  note?: string;
}

export interface Design {
  id: string;
  background: (ctx: Ctx) => DiscMenu['background'];
  subBackground?: (ctx: Ctx) => DiscMenu['background'];
  main: (ctx: Ctx, items: Item[]) => Page;
  scenes: (ctx: Ctx, items: Item[], page: number, pages: number) => Page;
  list: (ctx: Ctx, heading: string, kind: 'SETUP' | 'EXTRAS' | 'EPISODES', items: Item[]) => Page;
  popup: (ctx: Ctx, items: Item[]) => Page;
  motion: (ctx: Ctx) => MotionRecipe;
  scenesPerPage?: number;
}

const BASE_STYLE: ButtonStyle = { font: 'Inter', size: 32, color: '#999999', selColor: '#ffffff', actColor: '#ffcc00', mark: 'none' };

/** A button whose three states are drawn by `draw(state)` in button-local coordinates. */
export function button(item: Item, x: number, y: number, w: number, h: number, draw: (s: State) => O[], nav: MenuButton['nav'] = {}): MenuButton {
  return {
    id: uid('btn'), label: item.label, x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h),
    style: { ...BASE_STYLE }, nav, action: item.action, thumb: item.thumb,
    art: { normal: draw('normal'), selected: draw('selected'), activated: draw('activated') },
  };
}

/** Text helper: font key, size, colour, with sane defaults for TV (no wrapping). */
export const txt = (x: number, y: number, w: number, s: string, size: number, font: string, color: string, o: Partial<T.TextOpts> = {}) =>
  T.text(x, y, w, s, { size, font, color, wrap: false, ...o });

type Stop = [string, number] | [string, number, number];
const stops = (s: Stop[]) => s.map(([color, offset, opacity]) => ({ color, offset, ...(opacity != null ? { opacity } : {}) }));
/** Linear gradient: stops are [colour, offset 0–1, opacity?]. */
export const linear = (angle: number, s: Stop[]) => ({ kind: 'LINEAR' as const, angle, stops: stops(s) });
/** Radial gradient centred in the object's box. */
export const radial = (s: Stop[]) => ({ kind: 'RADIAL' as const, stops: stops(s) });
/** A soft pool of light: an ellipse filled with a radial falloff. */
export const glow = (cx: number, cy: number, rx: number, ry: number, color: string, peak = 0.6, label = 'Light') =>
  T.ellipse(cx - rx, cy - ry, rx * 2, ry * 2, color, { gradient: radial([[color, 0, peak], [color, 0.55, peak * 0.35], [color, 1, 0]]), label });

export const hms = (s: number) => `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
export const mins = (s: number) => `${Math.round(s / 60)} min`;
export const roman = (n: number) => ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'][n - 1] || String(n);

export interface Built { menus: DiscMenu[]; topMenuId: string; popupMenuId?: string }

/** Wire a design's pages into menus with the shared navigation contract. */
export function assemble(p: DiscProject, d: Design, opts: { popup: boolean }): Built {
  const feature = p.titles.find(x => x.kind === 'FEATURE');
  const episodes = p.titles.filter(x => x.kind === 'EPISODE');
  const extras = p.titles.filter(x => x.kind === 'EXTRA' || x.kind === 'TRAILER');
  const main = feature || episodes[0] || p.titles[0];
  const ctx: Ctx = { disc: p, title: p.name, main, tagline: main ? `${main.chapters.length} chapters · ${mins(main.source.durationSec)}` : '', uhd: p.format === 'UHD' };
  const ids = { top: uid('menu'), setup: uid('menu'), extras: uid('menu'), episodes: uid('menu'), popup: uid('menu') };
  const per = d.scenesPerPage || 6;
  const chunks = main && main.chapters.length > 1 ? Array.from({ length: Math.ceil(main.chapters.length / per) }, (_, i) => main.chapters.slice(i * per, i * per + per)) : [];
  const sceneIds = chunks.map(() => uid('menu'));
  const hasSetup = !!main && (main.audio.length > 1 || main.subtitles.length > 0);
  const back: Item = { label: 'Back', action: { kind: 'GO_MENU', menuId: ids.top }, role: 'back' };

  const topItems: Item[] = [];
  if (episodes.length > 1) topItems.push({ label: 'Play All', action: { kind: 'PLAY_ALL', titleIds: episodes.map(e => e.id) }, role: 'primary' });
  else if (main) topItems.push({ label: 'Play', action: { kind: 'PLAY_TITLE', titleId: main.id }, role: 'primary' });
  if (episodes.length > 1) topItems.push({ label: 'Episodes', action: { kind: 'GO_MENU', menuId: ids.episodes } });
  if (sceneIds[0]) topItems.push({ label: d.id === 'concert' ? 'Setlist' : 'Scenes', action: { kind: 'GO_MENU', menuId: sceneIds[0] } });
  if (hasSetup) topItems.push({ label: 'Setup', action: { kind: 'GO_MENU', menuId: ids.setup } });
  if (extras.length) topItems.push({ label: 'Extras', action: { kind: 'GO_MENU', menuId: ids.extras } });

  const menus: DiscMenu[] = [];
  const mk = (id: string, name: string, kind: DiscMenu['kind'], page: Page, bg: DiscMenu['background'], motion?: MotionRecipe): DiscMenu => {
    const m: DiscMenu = { id, name, kind, background: bg, decor: [], art: page.art, buttons: page.buttons, defaultButton: page.buttons[page.defaultIndex ?? 0]?.id };
    if (motion) (m as any).motion = motion;
    menus.push(m); return m;
  };
  const subBg = d.subBackground ? d.subBackground(ctx) : d.background(ctx);
  mk(ids.top, 'Main Menu', 'TOP', d.main(ctx, topItems), d.background(ctx), d.motion(ctx));

  chunks.forEach((chunk, ci) => {
    const items: Item[] = chunk.map(c => ({ label: c.name, index: main!.chapters.indexOf(c) + 1, meta: hms(c.timeSec), action: { kind: 'PLAY_TITLE', titleId: main!.id, chapterId: c.id }, thumb: { titleId: main!.id, timeSec: c.thumbSec ?? c.timeSec + 5 } }));
    if (ci > 0) items.push({ label: 'Previous', action: { kind: 'GO_MENU', menuId: sceneIds[ci - 1] }, role: 'nav' });
    if (ci < chunks.length - 1) items.push({ label: 'Next', action: { kind: 'GO_MENU', menuId: sceneIds[ci + 1] }, role: 'nav' });
    items.push(back);
    mk(sceneIds[ci], chunks.length > 1 ? `Scenes ${ci + 1}` : 'Scenes', 'SCENES', d.scenes(ctx, items, ci, chunks.length), subBg);
  });
  if (episodes.length > 1) mk(ids.episodes, 'Episodes', 'EPISODES', d.list(ctx, 'Episodes', 'EPISODES', [
    ...episodes.map((e, i) => ({ label: e.name, index: i + 1, meta: mins(e.source.durationSec), action: { kind: 'PLAY_TITLE', titleId: e.id } as MenuAction })), back]), subBg);
  if (hasSetup && main) mk(ids.setup, 'Setup', 'SETUP', d.list(ctx, 'Setup', 'SETUP', [
    ...main.audio.map((a, i) => ({ label: a.label, sub: 'Audio', action: { kind: 'SET_AUDIO', titleId: main.id, trackIndex: i } as MenuAction })),
    { label: 'Off', sub: 'Subtitles', action: { kind: 'SET_SUBTITLE', titleId: main.id, trackIndex: 'off' } },
    ...main.subtitles.map((s, i) => ({ label: s.label, sub: 'Subtitles', action: { kind: 'SET_SUBTITLE', titleId: main.id, trackIndex: i } as MenuAction })), back]), subBg);
  if (extras.length) mk(ids.extras, 'Extras', 'EXTRAS', d.list(ctx, 'Special Features', 'EXTRAS', [
    ...extras.map((e, i) => ({ label: e.name, index: i + 1, meta: mins(e.source.durationSec), action: { kind: 'PLAY_TITLE', titleId: e.id } as MenuAction })), back]), subBg);
  let popupMenuId: string | undefined;
  if (opts.popup && main) {
    const items: Item[] = [
      { label: 'Resume', action: { kind: 'CLOSE_POPUP' }, role: 'primary' },
      ...main.chapters.slice(0, 8).map((c, i) => ({ label: c.name, index: i + 1, meta: hms(c.timeSec), action: { kind: 'PLAY_TITLE', titleId: main.id, chapterId: c.id } as MenuAction })),
      { label: 'Main Menu', action: { kind: 'GO_MENU', menuId: ids.top }, role: 'back' },
    ];
    mk(ids.popup, 'Pop-up', 'POPUP', d.popup(ctx, items), { kind: 'color', value: 'transparent' });
    popupMenuId = ids.popup;
  }
  return { menus, topMenuId: ids.top, popupMenuId };
}
