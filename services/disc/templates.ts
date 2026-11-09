// Ready-to-go disc templates. applyTemplate() rebuilds the menus around the project's current
// titles, so a filmmaker can swap looks at any time without losing their titles or tracks.
import { uid, type ButtonStyle, type DiscMenu, type DiscProject, type MenuAction, type MenuButton, type MenuDecor } from './project';
import type { DiscFormat } from './spec';

export interface Look {
  bg: string; panel: string; ink: string; dim: string; accent: string; font: string; display: string;
  mark: ButtonStyle['mark']; size: number; titleSize: number; weight: number; tracking: number;
}
export interface DiscTemplate {
  id: string; name: string; blurb: string; formats: DiscFormat[]; look: Look;
  layout: 'bottom-row' | 'left-stack' | 'center-stack' | 'grid' | 'minimal';
  firstPlay: 'TOP_MENU' | 'PLAY_FEATURE'; popup: boolean; watermark?: string;
}

/** The original six built-in looks (kept for discs authored before the council templates). */
export const CLASSIC_TEMPLATES: DiscTemplate[] = [
  { id: 'marquee', name: 'Marquee', blurb: 'Classic feature: title card, bottom button row, scenes, setup, extras, pop-up bar.', formats: ['BD', 'UHD'], layout: 'bottom-row', firstPlay: 'TOP_MENU', popup: true,
    look: { bg: '#0b0b10', panel: 'rgba(8,8,12,0.78)', ink: '#f4efe6', dim: '#9a948a', accent: '#e8b04a', font: 'Inter', display: 'Playfair Display', mark: 'underline', size: 40, titleSize: 120, weight: 600, tracking: 4 } },
  { id: 'monolith', name: 'Monolith 4K', blurb: 'Collector UHD look: left-aligned stack over a full-bleed motion still, HDR-safe whites.', formats: ['UHD', 'BD'], layout: 'left-stack', firstPlay: 'TOP_MENU', popup: true,
    look: { bg: '#050507', panel: 'rgba(0,0,0,0.6)', ink: '#e9e9ec', dim: '#7c7c86', accent: '#7fd4ff', font: 'Inter', display: 'Bebas Neue', mark: 'arrow', size: 44, titleSize: 150, weight: 500, tracking: 8 } },
  { id: 'boxset', name: 'Box Set', blurb: 'Series disc: episode grid with Play All, per-episode chapters, pop-up episode list.', formats: ['BD', 'UHD'], layout: 'grid', firstPlay: 'TOP_MENU', popup: true,
    look: { bg: '#101418', panel: 'rgba(20,26,32,0.85)', ink: '#ffffff', dim: '#8fa0b0', accent: '#4ade80', font: 'Inter', display: 'Inter', mark: 'pill', size: 34, titleSize: 96, weight: 700, tracking: 1 } },
  { id: 'encore', name: 'Encore', blurb: 'Concert film: setlist menu (each song a chapter), Play Concert, audio choice up front.', formats: ['BD', 'UHD'], layout: 'center-stack', firstPlay: 'TOP_MENU', popup: true,
    look: { bg: '#12051a', panel: 'rgba(30,8,40,0.8)', ink: '#fff4fb', dim: '#c79ad8', accent: '#ff4fa3', font: 'Inter', display: 'Anton', mark: 'glow', size: 38, titleSize: 130, weight: 700, tracking: 2 } },
  { id: 'short', name: 'Short Film', blurb: 'One film, a few extras. Clean and quiet.', formats: ['BD', 'UHD'], layout: 'center-stack', firstPlay: 'TOP_MENU', popup: false,
    look: { bg: '#f2efe8', panel: 'rgba(242,239,232,0.9)', ink: '#1c1b19', dim: '#77736b', accent: '#c2410c', font: 'Inter', display: 'Cormorant Garamond', mark: 'underline', size: 36, titleSize: 110, weight: 500, tracking: 3 } },
  { id: 'screener', name: 'Festival Screener', blurb: 'Plays the film straight away, minimal menu, "For your consideration" card.', formats: ['BD', 'UHD'], layout: 'minimal', firstPlay: 'PLAY_FEATURE', popup: true, watermark: 'FOR YOUR CONSIDERATION',
    look: { bg: '#000000', panel: 'rgba(0,0,0,0.8)', ink: '#ffffff', dim: '#8a8a8a', accent: '#ffffff', font: 'Inter', display: 'Inter', mark: 'underline', size: 34, titleSize: 80, weight: 600, tracking: 6 } },
];
export const classicTemplateById = (id: string) => CLASSIC_TEMPLATES.find(t => t.id === id);

const W = 1920, H = 1080;

function style(l: Look, extra: Partial<ButtonStyle> = {}): ButtonStyle {
  return { font: l.font, size: l.size, weight: l.weight, color: l.dim, selColor: l.ink, actColor: l.accent, mark: l.mark, align: 'left',
    ...(l.mark === 'pill' ? { selBg: l.accent, selColor: l.bg, radius: 999 } : {}), ...extra };
}
const btn = (label: string, x: number, y: number, w: number, h: number, action: MenuAction, s: ButtonStyle, extra: Partial<MenuButton> = {}): MenuButton =>
  ({ id: uid('btn'), label, x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h), style: s, nav: {}, action, ...extra });
const text = (t: string, x: number, y: number, size: number, font: string, color: string, extra: Partial<Extract<MenuDecor, { kind: 'text' }>> = {}): MenuDecor =>
  ({ kind: 'text', id: uid('txt'), text: t, x, y, size, font, color, ...extra });

/** Lay buttons along a row, a column, or a grid. */
function arrange(labels: { label: string; action: MenuAction }[], layout: DiscTemplate['layout'], l: Look): MenuButton[] {
  const h = Math.round(l.size * 1.6);
  if (layout === 'bottom-row' || layout === 'minimal') {
    const w = 300, gap = 24, total = labels.length * w + (labels.length - 1) * gap;
    return labels.map((b, i) => btn(b.label, (W - total) / 2 + i * (w + gap), H - 200, w, h, b.action, style(l, { align: 'center' })));
  }
  if (layout === 'left-stack') return labels.map((b, i) => btn(b.label, 160, 520 + i * (h + 14), 520, h, b.action, style(l)));
  if (layout === 'grid') {
    const cols = Math.min(3, labels.length), w = 480, gh = 150, gx = 36, gy = 30, x0 = (W - (cols * w + (cols - 1) * gx)) / 2;
    return labels.map((b, i) => btn(b.label, x0 + (i % cols) * (w + gx), 380 + Math.floor(i / cols) * (gh + gy), w, gh, b.action, style(l, { align: 'center', bg: l.panel, radius: 14 })));
  }
  return labels.map((b, i) => btn(b.label, (W - 520) / 2, 560 + i * (h + 12), 520, h, b.action, style(l, { align: 'center' })));
}

function menu(name: string, kind: DiscMenu['kind'], l: Look, decor: MenuDecor[], buttons: MenuButton[], bg: DiscMenu['background'] = { kind: 'color', value: l.bg }): DiscMenu {
  return { id: uid('menu'), name, kind, background: bg, decor, buttons, defaultButton: buttons[0]?.id };
}

export function applyClassicTemplate(p: DiscProject, templateId: string): DiscProject {
  const t = classicTemplateById(templateId);
  if (!t) throw new Error(`Unknown template ${templateId}`);
  const l = t.look;
  const feature = p.titles.find(x => x.kind === 'FEATURE');
  const episodes = p.titles.filter(x => x.kind === 'EPISODE');
  const extras = p.titles.filter(x => x.kind === 'EXTRA' || x.kind === 'TRAILER');
  const main = feature || episodes[0] || p.titles[0];
  const menus: DiscMenu[] = [];
  const titleText = (size = l.titleSize) => {
    const left = t.layout === 'left-stack';
    const y = t.layout === 'grid' ? 170 : left ? 300 : 300;
    return text(p.name.toUpperCase(), left ? 160 : W / 2, y, t.layout === 'grid' ? Math.min(size, 88) : size, l.display, l.ink, { align: left ? 'left' : 'center', weight: 700, letterSpacing: l.tracking });
  };
  const top = menu('Main Menu', 'TOP', l, [titleText()], [], main ? { kind: 'title', value: l.bg, titleId: main.id, fromSec: Math.min(600, main.source.durationSec * 0.3), loopSec: 30 } : { kind: 'color', value: l.bg });
  menus.push(top);

  // Scenes (chunks of 6 chapters per page, with prev/next).
  const scenesMenus: DiscMenu[] = [];
  if (main && main.chapters.length > 1) {
    const chunks: typeof main.chapters[] = [];
    for (let i = 0; i < main.chapters.length; i += 6) chunks.push(main.chapters.slice(i, i + 6));
    chunks.forEach((chunk, ci) => {
      const tw = 480, th = 270, gx = 40, gy = 70, x0 = (W - (3 * tw + 2 * gx)) / 2;
      const thumbs = chunk.map((c, i) => btn(`${main.chapters.indexOf(c) + 1}. ${c.name}`, x0 + (i % 3) * (tw + gx), 230 + Math.floor(i / 3) * (th + gy), tw, th,
        { kind: 'PLAY_TITLE', titleId: main.id, chapterId: c.id }, style(l, { align: 'center', size: 26, mark: 'glow' }), { thumb: { titleId: main.id, timeSec: c.thumbSec ?? c.timeSec + 5 } }));
      scenesMenus.push(menu(chunks.length > 1 ? `Scenes ${ci + 1}` : 'Scenes', 'SCENES', l, [text('SCENE SELECTION', W / 2, 150, 54, l.display, l.ink, { align: 'center', letterSpacing: l.tracking })], thumbs));
    });
  }
  // Setup (audio + subtitles) for the main title.
  let setup: DiscMenu | undefined;
  if (main && (main.audio.length > 1 || main.subtitles.length)) {
    const rows: { label: string; action: MenuAction }[] = [
      ...main.audio.map((a, i) => ({ label: `Audio: ${a.label}`, action: { kind: 'SET_AUDIO', titleId: main.id, trackIndex: i } as MenuAction })),
      { label: 'Subtitles: Off', action: { kind: 'SET_SUBTITLE', titleId: main.id, trackIndex: 'off' } },
      ...main.subtitles.map((s, i) => ({ label: `Subtitles: ${s.label}`, action: { kind: 'SET_SUBTITLE', titleId: main.id, trackIndex: i } as MenuAction })),
    ];
    setup = menu('Setup', 'SETUP', l, [text('SETUP', W / 2, 180, 64, l.display, l.ink, { align: 'center', letterSpacing: l.tracking })],
      rows.map((r, i) => btn(r.label, (W - 760) / 2, 290 + i * 70, 760, 58, r.action, style(l, { align: 'center', size: 32 }))));
  }
  // Extras list.
  let extrasMenu: DiscMenu | undefined;
  if (extras.length) extrasMenu = menu('Extras', 'EXTRAS', l, [text('SPECIAL FEATURES', W / 2, 180, 64, l.display, l.ink, { align: 'center', letterSpacing: l.tracking })],
    extras.map((e, i) => btn(e.name, (W - 900) / 2, 300 + i * 74, 900, 60, { kind: 'PLAY_TITLE', titleId: e.id }, style(l, { align: 'center', size: 34 }))));
  // Episodes grid (series).
  let episodesMenu: DiscMenu | undefined;
  if (episodes.length > 1) episodesMenu = menu('Episodes', 'EPISODES', l, [text('EPISODES', W / 2, 180, 64, l.display, l.ink, { align: 'center', letterSpacing: l.tracking })],
    arrange(episodes.map((e, i) => ({ label: `${i + 1}  ${e.name}`, action: { kind: 'PLAY_TITLE', titleId: e.id } })), 'grid', l));

  // Top-menu buttons.
  const items: { label: string; action: MenuAction }[] = [];
  if (episodes.length > 1) items.push({ label: 'Play All', action: { kind: 'PLAY_ALL', titleIds: episodes.map(e => e.id) } });
  else if (main) items.push({ label: t.id === 'encore' ? 'Play Concert' : 'Play', action: { kind: 'PLAY_TITLE', titleId: main.id } });
  if (episodesMenu) items.push({ label: 'Episodes', action: { kind: 'GO_MENU', menuId: episodesMenu.id } });
  if (scenesMenus[0]) items.push({ label: t.id === 'encore' ? 'Setlist' : 'Scenes', action: { kind: 'GO_MENU', menuId: scenesMenus[0].id } });
  if (setup) items.push({ label: 'Setup', action: { kind: 'GO_MENU', menuId: setup.id } });
  if (extrasMenu) items.push({ label: 'Extras', action: { kind: 'GO_MENU', menuId: extrasMenu.id } });
  top.buttons = arrange(items, t.layout, l);
  top.defaultButton = top.buttons[0]?.id;
  if (t.watermark) top.decor.push(text(t.watermark, W / 2, H - 80, 26, l.font, l.dim, { align: 'center', letterSpacing: 10 }));

  // Back buttons + page links on sub-menus.
  const back = (m: DiscMenu) => m.buttons.push(btn('Back', 120, H - 150, 220, 60, { kind: 'GO_MENU', menuId: top.id }, style(l, { size: 30 })));
  scenesMenus.forEach((m, i) => {
    if (i > 0) m.buttons.push(btn('◀ Previous', W - 560, H - 150, 220, 60, { kind: 'GO_MENU', menuId: scenesMenus[i - 1].id }, style(l, { size: 30, align: 'right' })));
    if (i < scenesMenus.length - 1) m.buttons.push(btn('Next ▶', W - 320, H - 150, 220, 60, { kind: 'GO_MENU', menuId: scenesMenus[i + 1].id }, style(l, { size: 30, align: 'right' })));
    back(m);
  });
  for (const m of [setup, extrasMenu, episodesMenu]) if (m) back(m);
  menus.push(...scenesMenus, ...[episodesMenu, setup, extrasMenu].filter((m): m is DiscMenu => !!m));

  // Pop-up bar over the film.
  let popupId: string | undefined;
  if (t.popup && main) {
    const bar: { label: string; action: MenuAction }[] = [
      { label: 'Resume', action: { kind: 'CLOSE_POPUP' } },
      ...main.chapters.slice(0, 8).map((c, i) => ({ label: `${i + 1}`, action: { kind: 'PLAY_TITLE', titleId: main.id, chapterId: c.id } as MenuAction })),
      { label: 'Main Menu', action: { kind: 'GO_MENU', menuId: top.id } },
    ];
    const bw = Math.min(180, (W - 300) / bar.length - 10);
    const pm = menu('Pop-up', 'POPUP', l, [{ kind: 'rect', id: uid('rect'), x: 0, y: H - 190, w: W, h: 150, fill: l.panel }],
      bar.map((b, i) => btn(b.label, 150 + i * (bw + 10), H - 160, bw, 80, b.action, style(l, { align: 'center', size: 28 }))), { kind: 'color', value: 'transparent' });
    menus.push(pm); popupId = pm.id;
  }

  return { ...p, menus, topMenuId: top.id, popupMenuId: popupId, firstPlay: { ...p.firstPlay, then: t.firstPlay }, templateId, updatedAt: Date.now() };
}

// ── Council templates (the registry the app uses) ───────────────────────────
import { DISC_CONCEPTS, conceptById } from './councilTemplates/concepts';
import { DESIGNS } from './councilTemplates';
import { assemble } from './councilTemplates/kit';

export interface TemplateInfo { id: string; name: string; blurb: string; formats: DiscFormat[]; concept: string }
export const TEMPLATES: TemplateInfo[] = DISC_CONCEPTS.map(c => ({ id: c.id, name: c.name, blurb: c.blurb, formats: c.formats, concept: c.concept }));
export const templateById = (id: string) => TEMPLATES.find(t => t.id === id);
/** Discs made with the original six looks open with their council successor. */
export const LEGACY_TEMPLATE: Record<string, string> = { marquee: 'feature', monolith: 'collector4k', boxset: 'boxset', encore: 'concert', short: 'arthouse', screener: 'screener' };

export function applyTemplate(p: DiscProject, templateId: string): DiscProject {
  const id = LEGACY_TEMPLATE[templateId] || templateId;
  const design = DESIGNS[id], concept = conceptById(id);
  if (!design || !concept) return applyClassicTemplate(p, CLASSIC_TEMPLATES.find(t => LEGACY_TEMPLATE[t.id] === id)?.id || 'marquee');
  const built = assemble(p, design, { popup: concept.popup });
  return { ...p, menus: built.menus, topMenuId: built.topMenuId, popupMenuId: built.popupMenuId, firstPlay: { ...p.firstPlay, then: concept.firstPlay }, templateId: id, updatedAt: Date.now() };
}
