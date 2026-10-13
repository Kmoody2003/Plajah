/**
 * services/comic/comicMangaTemplateLibrary.ts — Master Comic, Manga & Storybook Template & Asset Library
 * 
 * Provides an expansive library of:
 * 1. Panel Layout Templates (School picture books, 4-koma, classic superhero grids,
 *    dynamic shonen diagonal slices, shojo emotional shatters, webtoons, cinematic letterbox).
 * 2. Speech & Thought Bubble Library (14+ procedural vector styles with customizable Bezier tails).
 * 3. Action Words & Sound Effects (SFX / Onomatopoeia) (Western comics & Japanese Manga sound effects
 *    with 3D extrusions, glowing highlights, and kinetic animations).
 * 4. Drawing & Inking Presets (Autodesk Sketchbook & Clip Studio Paint level brushes: G-pen, Maru-pen,
 *    2B pencil, Copic marker, watercolor wash, airbrush, streamline stabilizer, and perspective guides).
 */

import { BalloonType, ScreentonePattern } from './comicMangaPageEngine';

// ─────────────────────────────────────────────────────────────────────────────
// 1. PANEL LAYOUT ARCHETYPES
// ─────────────────────────────────────────────────────────────────────────────

export type LayoutCategory = 'SCHOOL_STORYBOOK' | 'WEBTOON_MOBILE' | 'CLASSIC_COMIC' | 'MANGA_ACTION' | 'CINEMATIC';

export interface PanelGeometryBox {
  id: string;
  panelIndex: number;
  xPct: number;      // 0..100
  yPct: number;      // 0..100
  widthPct: number;  // 0..100
  heightPct: number; // 0..100
  clipPolygon?: string; // Optional CSS/SVG polygon e.g. "polygon(0 0, 100% 8%, 100% 100%, 0 92%)"
  isHeroBreakout?: boolean; // If true, subject can visually pop over the panel borders
}

export interface PanelLayoutTemplate {
  id: string;
  name: string;
  category: LayoutCategory;
  description: string;
  juniorFriendly: boolean;
  proRecommended: boolean;
  defaultPanels: number;
  readingDirection: 'ltr' | 'rtl';
  aspectRatio: string; // e.g. "3:4" (Comic/A4), "9:16" (Webtoon/Phone), "16:9" (Landscape Storybook)
  createBoxes: (gutterPct: number) => PanelGeometryBox[];
  suggestedPacing: string;
}

export const PANEL_LAYOUT_TEMPLATES: Record<string, PanelLayoutTemplate> = {
  // ── SCHOOL & FIRST-TIMER STORYBOOKS ───────────────────────────────────────
  picture_book_top_bottom: {
    id: 'picture_book_top_bottom',
    name: 'My First Storybook (Picture + Story)',
    category: 'SCHOOL_STORYBOOK',
    description: 'One large top illustration with generous bottom space for big story text. Perfect for school children and early readers.',
    juniorFriendly: true,
    proRecommended: false,
    defaultPanels: 1,
    readingDirection: 'ltr',
    aspectRatio: '3:4',
    suggestedPacing: 'Slow, contemplative reading with rich illustrations.',
    createBoxes: (g) => [
      {
        id: 'box_0',
        panelIndex: 0,
        xPct: g,
        yPct: g,
        widthPct: 100 - g * 2,
        heightPct: 68,
      },
    ],
  },

  bedtime_split_2: {
    id: 'bedtime_split_2',
    name: 'Bedtime Tale (2-Panel Stack)',
    category: 'SCHOOL_STORYBOOK',
    description: 'Two cozy horizontal panels. Ideal for a "Before & After" or two gentle story beats on one page.',
    juniorFriendly: true,
    proRecommended: false,
    defaultPanels: 2,
    readingDirection: 'ltr',
    aspectRatio: '3:4',
    suggestedPacing: 'Gentle, episodic storybook rhythm.',
    createBoxes: (g) => {
      const h = (100 - g * 3) / 2;
      return [
        { id: 'box_0', panelIndex: 0, xPct: g, yPct: g, widthPct: 100 - g * 2, heightPct: h },
        { id: 'box_1', panelIndex: 1, xPct: g, yPct: g + h + g, widthPct: 100 - g * 2, heightPct: h },
      ];
    },
  },

  sunday_funnies_3: {
    id: 'sunday_funnies_3',
    name: 'Sunday Funnies (3-Panel Gag Strip)',
    category: 'SCHOOL_STORYBOOK',
    description: 'Setup, Escalation, Punchline! The timeless comic strip format for humor, gags, and quick tales.',
    juniorFriendly: true,
    proRecommended: true,
    defaultPanels: 3,
    readingDirection: 'ltr',
    aspectRatio: '4:3',
    suggestedPacing: 'Fast, comedic timing with punchline payoff.',
    createBoxes: (g) => {
      const w = (100 - g * 4) / 3;
      return [0, 1, 2].map((idx) => ({
        id: `box_${idx}`,
        panelIndex: idx,
        xPct: g + idx * (w + g),
        yPct: g,
        widthPct: w,
        heightPct: 100 - g * 2,
      }));
    },
  },

  storybook_grid_4: {
    id: 'storybook_grid_4',
    name: 'Storybook Square (4-Panel Grid)',
    category: 'SCHOOL_STORYBOOK',
    description: 'Four equal square panels. Clear, inviting, and easy for kids to follow from left to right, top to bottom.',
    juniorFriendly: true,
    proRecommended: false,
    defaultPanels: 4,
    readingDirection: 'ltr',
    aspectRatio: '1:1',
    suggestedPacing: 'Balanced four-beat progression.',
    createBoxes: (g) => {
      const s = (100 - g * 3) / 2;
      return [
        { id: 'box_0', panelIndex: 0, xPct: g, yPct: g, widthPct: s, heightPct: s },
        { id: 'box_1', panelIndex: 1, xPct: g + s + g, yPct: g, widthPct: s, heightPct: s },
        { id: 'box_2', panelIndex: 2, xPct: g, yPct: g + s + g, widthPct: s, heightPct: s },
        { id: 'box_3', panelIndex: 3, xPct: g + s + g, yPct: g + s + g, widthPct: s, heightPct: s },
      ];
    },
  },

  four_koma_vertical: {
    id: 'four_koma_vertical',
    name: 'Yonkoma (4-Koma Manga Strip)',
    category: 'MANGA_ACTION',
    description: 'Traditional 4-panel vertical manga strip: Ki-shō-ten-ketsu (Introduction, Development, Twist, Conclusion).',
    juniorFriendly: true,
    proRecommended: true,
    defaultPanels: 4,
    readingDirection: 'rtl',
    aspectRatio: '1:3',
    suggestedPacing: 'Classic Japanese 4-act progression.',
    createBoxes: (g) => {
      const h = (100 - g * 5) / 4;
      const w = 100 - g * 2;
      return [0, 1, 2, 3].map((idx) => ({
        id: `box_${idx}`,
        panelIndex: idx,
        xPct: g,
        yPct: g + idx * (h + g),
        widthPct: w,
        heightPct: h,
      }));
    },
  },

  // ── WEBTOON & MOBILE ──────────────────────────────────────────────────────
  webtoon_scroll_4: {
    id: 'webtoon_scroll_4',
    name: 'Webtoon Vertical Stream (4 Beats)',
    category: 'WEBTOON_MOBILE',
    description: 'Optimized for mobile scrolling with generous vertical white gutters between story reveals.',
    juniorFriendly: true,
    proRecommended: true,
    defaultPanels: 4,
    readingDirection: 'ltr',
    aspectRatio: '9:16',
    suggestedPacing: 'Swipe-to-reveal mobile momentum.',
    createBoxes: (g) => {
      const gutterTop = 4;
      const h = (100 - gutterTop * 5) / 4;
      return [0, 1, 2, 3].map((idx) => ({
        id: `box_${idx}`,
        panelIndex: idx,
        xPct: 6,
        yPct: gutterTop + idx * (h + gutterTop),
        widthPct: 88,
        heightPct: h,
      }));
    },
  },

  webtoon_dramatic_climax: {
    id: 'webtoon_dramatic_climax',
    name: 'Webtoon Dramatic Climax (Tall Hero Cut)',
    category: 'WEBTOON_MOBILE',
    description: 'Two establishing panels followed by a massive vertical portrait drop that extends down the viewport.',
    juniorFriendly: false,
    proRecommended: true,
    defaultPanels: 3,
    readingDirection: 'ltr',
    aspectRatio: '9:16',
    suggestedPacing: 'Suspense building into breathtaking vertical character reveal.',
    createBoxes: (g) => [
      { id: 'box_0', panelIndex: 0, xPct: 6, yPct: 4, widthPct: 88, heightPct: 20 },
      { id: 'box_1', panelIndex: 1, xPct: 6, yPct: 26, widthPct: 88, heightPct: 20 },
      { id: 'box_2', panelIndex: 2, xPct: 6, yPct: 48, widthPct: 88, heightPct: 48, isHeroBreakout: true },
    ],
  },

  // ── CLASSIC COMIC & GRAPHIC NOVEL ─────────────────────────────────────────
  grid_6_classic: {
    id: 'grid_6_classic',
    name: 'Classic 6-Panel (2x3 American Comic)',
    category: 'CLASSIC_COMIC',
    description: 'Traditional American comic 6-panel uniform grid. High readability, balanced pacing, and iconic storytelling.',
    juniorFriendly: true,
    proRecommended: true,
    defaultPanels: 6,
    readingDirection: 'ltr',
    aspectRatio: '3:4',
    suggestedPacing: 'Steady, highly rhythmic narrative flow.',
    createBoxes: (g) => {
      const w = (100 - g * 3) / 2;
      const h = (100 - g * 4) / 3;
      const boxes: PanelGeometryBox[] = [];
      let idx = 0;
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 2; c++) {
          boxes.push({
            id: `box_${idx}`,
            panelIndex: idx,
            xPct: g + c * (w + g),
            yPct: g + r * (h + g),
            widthPct: w,
            heightPct: h,
          });
          idx++;
        }
      }
      return boxes;
    },
  },

  grid_9_watchman: {
    id: 'grid_9_watchman',
    name: 'Master 9-Panel Grid (3x3 Prestige)',
    category: 'CLASSIC_COMIC',
    description: 'The monumental 9-panel architectural grid made famous by Dave Gibbons & Alan Moore. Ultimate spatial precision.',
    juniorFriendly: false,
    proRecommended: true,
    defaultPanels: 9,
    readingDirection: 'ltr',
    aspectRatio: '3:4',
    suggestedPacing: 'Rigorous psychological cadence, cross-cutting scenes, and subtle acting micro-beats.',
    createBoxes: (g) => {
      const w = (100 - g * 4) / 3;
      const h = (100 - g * 4) / 3;
      const boxes: PanelGeometryBox[] = [];
      let idx = 0;
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
          boxes.push({
            id: `box_${idx}`,
            panelIndex: idx,
            xPct: g + c * (w + g),
            yPct: g + r * (h + g),
            widthPct: w,
            heightPct: h,
          });
          idx++;
        }
      }
      return boxes;
    },
  },

  heroic_splash_insets: {
    id: 'heroic_splash_insets',
    name: 'Monumental Splash + 2 Floating Insets',
    category: 'CLASSIC_COMIC',
    description: 'Full-bleed monumental splash artwork with two floating character/dialogue detail boxes.',
    juniorFriendly: true,
    proRecommended: true,
    defaultPanels: 3,
    readingDirection: 'ltr',
    aspectRatio: '3:4',
    suggestedPacing: 'Showstopping hero reveal, entrance, or cosmic battle tableau.',
    createBoxes: (g) => [
      { id: 'box_0', panelIndex: 0, xPct: g, yPct: g, widthPct: 100 - g * 2, heightPct: 100 - g * 2 },
      { id: 'box_1', panelIndex: 1, xPct: 62, yPct: 12, widthPct: 32, heightPct: 22, isHeroBreakout: true },
      { id: 'box_2', panelIndex: 2, xPct: 6, yPct: 70, widthPct: 34, heightPct: 22, isHeroBreakout: true },
    ],
  },

  panoramic_double_spread: {
    id: 'panoramic_double_spread',
    name: 'Double-Page Panoramic Spread',
    category: 'CLASSIC_COMIC',
    description: 'An expansive horizontal panorama spanning across two book pages with subtle side tier insets.',
    juniorFriendly: false,
    proRecommended: true,
    defaultPanels: 4,
    readingDirection: 'ltr',
    aspectRatio: '16:9',
    suggestedPacing: 'Epic scale, landscape reveals, and large military or city battlefronts.',
    createBoxes: (g) => [
      { id: 'box_0', panelIndex: 0, xPct: g, yPct: g, widthPct: 100 - g * 2, heightPct: 66 },
      { id: 'box_1', panelIndex: 1, xPct: g, yPct: g + 66 + g, widthPct: 31, heightPct: 29 },
      { id: 'box_2', panelIndex: 2, xPct: g + 31 + g, yPct: g + 66 + g, widthPct: 31, heightPct: 29 },
      { id: 'box_3', panelIndex: 3, xPct: g + 62 + g * 2, yPct: g + 66 + g, widthPct: 31, heightPct: 29 },
    ],
  },

  asymmetric_stagger_5: {
    id: 'asymmetric_stagger_5',
    name: 'Conversational Stagger (5 Panels)',
    category: 'CLASSIC_COMIC',
    description: 'Asymmetric heights and widths designed to emphasize speaker priority and conversational pauses.',
    juniorFriendly: true,
    proRecommended: true,
    defaultPanels: 5,
    readingDirection: 'ltr',
    aspectRatio: '3:4',
    suggestedPacing: 'Dialogue-rich, dramatic character confrontations.',
    createBoxes: (g) => [
      { id: 'box_0', panelIndex: 0, xPct: g, yPct: g, widthPct: 60, heightPct: 38 },
      { id: 'box_1', panelIndex: 1, xPct: g + 60 + g, yPct: g, widthPct: 100 - (g * 3 + 60), heightPct: 38 },
      { id: 'box_2', panelIndex: 2, xPct: g, yPct: g + 38 + g, widthPct: 100 - g * 2, heightPct: 26 },
      { id: 'box_3', panelIndex: 3, xPct: g, yPct: g + 38 + g + 26 + g, widthPct: 45, heightPct: 30 },
      { id: 'box_4', panelIndex: 4, xPct: g + 45 + g, yPct: g + 38 + g + 26 + g, widthPct: 100 - (g * 3 + 45), heightPct: 30 },
    ],
  },

  // ── MANGA & ACTION ────────────────────────────────────────────────────────
  shonen_dynamic_5: {
    id: 'shonen_dynamic_5',
    name: 'Shonen Kinetic (5-Panel Action)',
    category: 'MANGA_ACTION',
    description: 'High-octane Japanese manga layout. Large angled top hero panel, mid reaction split, and climax SFX impact.',
    juniorFriendly: true,
    proRecommended: true,
    defaultPanels: 5,
    readingDirection: 'rtl',
    aspectRatio: '3:4',
    suggestedPacing: 'Intense physical momentum, speed lines, and explosive impact frames.',
    createBoxes: (g) => [
      { id: 'box_0', panelIndex: 0, xPct: g, yPct: g, widthPct: 100 - g * 2, heightPct: 36 },
      { id: 'box_1', panelIndex: 1, xPct: g, yPct: g + 36 + g, widthPct: (100 - g * 3) * 0.45, heightPct: 28 },
      { id: 'box_2', panelIndex: 2, xPct: g + (100 - g * 3) * 0.45 + g, yPct: g + 36 + g, widthPct: (100 - g * 3) * 0.55, heightPct: 28 },
      { id: 'box_3', panelIndex: 3, xPct: g, yPct: g + 36 + g + 28 + g, widthPct: (100 - g * 3) * 0.5, heightPct: 28 },
      { id: 'box_4', panelIndex: 4, xPct: g + (100 - g * 3) * 0.5 + g, yPct: g + 36 + g + 28 + g, widthPct: (100 - g * 3) * 0.5, heightPct: 28 },
    ],
  },

  manga_slanted_slash_6: {
    id: 'manga_slanted_slash_6',
    name: 'Diagonal Slash Slices (6 Panels)',
    category: 'MANGA_ACTION',
    description: 'Dynamic diagonal gutters cutting across panels like sword strikes. Conveys speed, chaos, and crisis.',
    juniorFriendly: false,
    proRecommended: true,
    defaultPanels: 6,
    readingDirection: 'rtl',
    aspectRatio: '3:4',
    suggestedPacing: 'Frantic swordplay, high-speed chases, and sudden psychological shocks.',
    createBoxes: (g) => [
      {
        id: 'box_0',
        panelIndex: 0,
        xPct: g,
        yPct: g,
        widthPct: 100 - g * 2,
        heightPct: 28,
        clipPolygon: 'polygon(0% 0%, 100% 0%, 100% 88%, 0% 100%)',
      },
      {
        id: 'box_1',
        panelIndex: 1,
        xPct: g,
        yPct: 29,
        widthPct: 48,
        heightPct: 34,
        clipPolygon: 'polygon(0% 10%, 100% 0%, 100% 100%, 0% 90%)',
      },
      {
        id: 'box_2',
        panelIndex: 2,
        xPct: 50,
        yPct: 26,
        widthPct: 48,
        heightPct: 37,
        clipPolygon: 'polygon(0% 0%, 100% 8%, 100% 92%, 0% 100%)',
      },
      {
        id: 'box_3',
        panelIndex: 3,
        xPct: g,
        yPct: 64,
        widthPct: 31,
        heightPct: 34,
        clipPolygon: 'polygon(0% 0%, 100% 10%, 100% 100%, 0% 100%)',
      },
      {
        id: 'box_4',
        panelIndex: 4,
        xPct: 34,
        yPct: 66,
        widthPct: 31,
        heightPct: 32,
      },
      {
        id: 'box_5',
        panelIndex: 5,
        xPct: 67,
        yPct: 64,
        widthPct: 31,
        heightPct: 34,
        clipPolygon: 'polygon(0% 8%, 100% 0%, 100% 100%, 0% 100%)',
      },
    ],
  },

  shojo_emotional_shatter: {
    id: 'shojo_emotional_shatter',
    name: 'Shojo Emotional Shatter (Floating Frames)',
    category: 'MANGA_ACTION',
    description: 'Overlapping, borderless bleeding panels and delicate floating fragments for poetic emotional crises.',
    juniorFriendly: true,
    proRecommended: true,
    defaultPanels: 4,
    readingDirection: 'rtl',
    aspectRatio: '3:4',
    suggestedPacing: 'Lyrical emotional introspection, heartbeats, and symbolic memory fragments.',
    createBoxes: (g) => [
      { id: 'box_0', panelIndex: 0, xPct: 6, yPct: 4, widthPct: 56, heightPct: 42, isHeroBreakout: true },
      { id: 'box_1', panelIndex: 1, xPct: 48, yPct: 16, widthPct: 46, heightPct: 36, isHeroBreakout: true },
      { id: 'box_2', panelIndex: 2, xPct: 8, yPct: 50, widthPct: 84, heightPct: 22 },
      { id: 'box_3', panelIndex: 3, xPct: 18, yPct: 74, widthPct: 68, heightPct: 22, isHeroBreakout: true },
    ],
  },

  seinen_perspective_blast: {
    id: 'seinen_perspective_blast',
    name: '3-Point Perspective Epic Blast',
    category: 'MANGA_ACTION',
    description: 'A forced perspective layout where panel borders radiate from a vanishing point center.',
    juniorFriendly: false,
    proRecommended: true,
    defaultPanels: 4,
    readingDirection: 'rtl',
    aspectRatio: '3:4',
    suggestedPacing: 'Explosive cataclysms, orbital laser strikes, and shockwave epicenters.',
    createBoxes: (g) => [
      { id: 'box_0', panelIndex: 0, xPct: g, yPct: g, widthPct: 100 - g * 2, heightPct: 24 },
      { id: 'box_1', panelIndex: 1, xPct: g, yPct: g + 24 + g, widthPct: 38, heightPct: 42 },
      { id: 'box_2', panelIndex: 2, xPct: g + 38 + g, yPct: g + 24 + g, widthPct: 100 - (g * 3 + 38), heightPct: 42 },
      { id: 'box_3', panelIndex: 3, xPct: g, yPct: g + 24 + g + 42 + g, widthPct: 100 - g * 2, heightPct: 28, isHeroBreakout: true },
    ],
  },

  // ── CINEMATIC LETTERBOX ───────────────────────────────────────────────────
  cinematic_letterbox_3: {
    id: 'cinematic_letterbox_3',
    name: 'Cinematic Anamorphic (3-Tier 2.39:1)',
    category: 'CINEMATIC',
    description: 'Three ultra-widescreen 2.39:1 letterbox frames stacked vertically. Ideal for filmic storytelling.',
    juniorFriendly: true,
    proRecommended: true,
    defaultPanels: 3,
    readingDirection: 'ltr',
    aspectRatio: '3:4',
    suggestedPacing: 'Prestige cinematic drama, establishing vistas, and reverse-shot editing.',
    createBoxes: (g) => {
      const h = (100 - g * 4) / 3;
      return [0, 1, 2].map((idx) => ({
        id: `box_${idx}`,
        panelIndex: idx,
        xPct: g,
        yPct: g + idx * (h + g),
        widthPct: 100 - g * 2,
        heightPct: h,
      }));
    },
  },
};

export const LAYOUT_TEMPLATE_LIST = Object.values(PANEL_LAYOUT_TEMPLATES);

// ─────────────────────────────────────────────────────────────────────────────
// 2. SPEECH & THOUGHT BUBBLE ASSET LIBRARY (14 Procedural Vector Styles)
// ─────────────────────────────────────────────────────────────────────────────

export interface BubblePresetStyle {
  id: string;
  name: string;
  type: BalloonType;
  description: string;
  category: 'SPEECH' | 'THOUGHT' | 'EMOTION' | 'NARRATION' | 'TECH_HUD' | 'KIDS';
  strokeWidth: number;
  strokeColor: string;
  fillColor: string;
  fontFamily: string;
  fontSize: number;
  textColor: string;
  tailPhysics: 'smooth_curve' | 'cloud_circles' | 'straight_spike' | 'dashed_line' | 'none';
  svgGenerator: (w: number, h: number, tailDir: string) => string;
}

export const SPEECH_BUBBLE_PRESETS: Record<string, BubblePresetStyle> = {
  standard_oval: {
    id: 'standard_oval',
    name: 'Classic Oval Speech',
    type: 'speech',
    description: 'The golden standard comic balloon. Smooth, friendly, and universally legible.',
    category: 'SPEECH',
    strokeWidth: 2.5,
    strokeColor: '#000000',
    fillColor: '#ffffff',
    fontFamily: '"Comic Sans MS", "Bangers", system-ui, sans-serif',
    fontSize: 14,
    textColor: '#000000',
    tailPhysics: 'smooth_curve',
    svgGenerator: (w, h, tailDir) => {
      const rx = w / 2;
      const ry = h / 2;
      return `<ellipse cx="${rx}" cy="${ry}" rx="${rx - 2}" ry="${ry - 2}" fill="#ffffff" stroke="#000000" stroke-width="2.5" />`;
    },
  },

  thought_cloud: {
    id: 'thought_cloud',
    name: 'Dreamy Thought Cloud',
    type: 'thought',
    description: 'Puffy cloud contours with trailing circular bubbles leading to the thinker.',
    category: 'THOUGHT',
    strokeWidth: 2,
    strokeColor: '#000000',
    fillColor: '#ffffff',
    fontFamily: '"Comic Sans MS", system-ui, sans-serif',
    fontSize: 13,
    textColor: '#1e293b',
    tailPhysics: 'cloud_circles',
    svgGenerator: (w, h) => {
      return `<path d="M 20 20 Q ${w * 0.25} 5 ${w * 0.5} 15 Q ${w * 0.75} 5 ${w - 20} 20 Q ${w - 5} ${h * 0.5} ${w - 20} ${h - 20} Q ${w * 0.5} ${h - 5} 20 ${h - 20} Q 5 ${h * 0.5} 20 20 Z" fill="#ffffff" stroke="#000000" stroke-width="2.2" stroke-linecap="round" />`;
    },
  },

  shout_burst: {
    id: 'shout_burst',
    name: 'Explosive Scream / Shout',
    type: 'shout',
    description: 'Sharp, jagged kinetic spikes radiating outward for shouts, screams, and alarms.',
    category: 'EMOTION',
    strokeWidth: 3,
    strokeColor: '#dc2626',
    fillColor: '#fef2f2',
    fontFamily: 'Impact, "Bangers", system-ui, sans-serif',
    fontSize: 16,
    textColor: '#991b1b',
    tailPhysics: 'straight_spike',
    svgGenerator: (w, h) => {
      const pts = [
        `0,${h * 0.5}`,
        `${w * 0.15},${h * 0.2}`,
        `${w * 0.25},0`,
        `${w * 0.45},${h * 0.15}`,
        `${w * 0.65},0`,
        `${w * 0.8},${h * 0.2}`,
        `${w},${h * 0.1}`,
        `${w * 0.9},${h * 0.5}`,
        `${w},${h * 0.85}`,
        `${w * 0.75},${h * 0.8}`,
        `${w * 0.55},${h}`,
        `${w * 0.35},${h * 0.85}`,
        `${w * 0.15},${h}`,
        `${w * 0.1},${h * 0.7}`,
      ].join(' ');
      return `<polygon points="${pts}" fill="#fef2f2" stroke="#dc2626" stroke-width="3" stroke-linejoin="miter" />`;
    },
  },

  whisper_dashed: {
    id: 'whisper_dashed',
    name: 'Secret Whisper (Dashed)',
    type: 'whisper',
    description: 'Dotted and dashed outline indicating hushed tones, secrets, or faint murmurs.',
    category: 'SPEECH',
    strokeWidth: 2,
    strokeColor: '#64748b',
    fillColor: '#ffffff',
    fontFamily: 'system-ui, sans-serif',
    fontSize: 13,
    textColor: '#475569',
    tailPhysics: 'dashed_line',
    svgGenerator: (w, h) => {
      return `<rect x="2" y="2" width="${w - 4}" height="${h - 4}" rx="${h * 0.45}" fill="#ffffff" stroke="#64748b" stroke-width="2" stroke-dasharray="6 4" />`;
    },
  },

  narration_parchment: {
    id: 'narration_parchment',
    name: 'Narrator Caption Box',
    type: 'narration_box',
    description: 'Crisp rectangular box with parchment ivory fill for time, setting, and narrator prose.',
    category: 'NARRATION',
    strokeWidth: 2,
    strokeColor: '#000000',
    fillColor: '#fef9c3',
    fontFamily: '"Georgia", serif',
    fontSize: 13,
    textColor: '#1c1917',
    tailPhysics: 'none',
    svgGenerator: (w, h) => {
      return `<rect x="2" y="2" width="${w - 4}" height="${h - 4}" rx="2" fill="#fef9c3" stroke="#000000" stroke-width="2" />`;
    },
  },

  cyber_hexagonal: {
    id: 'cyber_hexagonal',
    name: 'Cybernetic Radio / Comms HUD',
    type: 'speech',
    description: 'Chamfered corners and neon cyan glow for radio comms, AI avatars, and robots.',
    category: 'TECH_HUD',
    strokeWidth: 2,
    strokeColor: '#00f2fe',
    fillColor: '#091e2b',
    fontFamily: '"Courier New", monospace',
    fontSize: 13,
    textColor: '#38bdf8',
    tailPhysics: 'straight_spike',
    svgGenerator: (w, h) => {
      const c = 12;
      const pts = `${c},0 ${w - c},0 ${w},${c} ${w},${h - c} ${w - c},${h} ${c},${h} 0,${h - c} 0,${c}`;
      return `<polygon points="${pts}" fill="#091e2b" stroke="#00f2fe" stroke-width="2" filter="url(#sfx-glow)" />`;
    },
  },

  monster_drip: {
    id: 'monster_drip',
    name: 'Gothic Monster / Slime Drip',
    type: 'shout',
    description: 'Viscous dripping ooze contour for alien creatures, demons, and spooky villains.',
    category: 'EMOTION',
    strokeWidth: 2.5,
    strokeColor: '#15803d',
    fillColor: '#f0fdf4',
    fontFamily: '"Creepster", "Impact", sans-serif',
    fontSize: 15,
    textColor: '#166534',
    tailPhysics: 'smooth_curve',
    svgGenerator: (w, h) => {
      return `<path d="M 10 15 Q ${w * 0.5} 0 ${w - 10} 15 Q ${w} ${h * 0.5} ${w - 10} ${h - 20} Q ${w * 0.75} ${h + 10} ${w * 0.6} ${h - 10} Q ${w * 0.4} ${h + 15} ${w * 0.25} ${h - 10} Q 0 ${h * 0.5} 10 15 Z" fill="#f0fdf4" stroke="#15803d" stroke-width="2.5" />`;
    },
  },

  telepathic_aura: {
    id: 'telepathic_aura',
    name: 'Telepathic Radiant Aura',
    type: 'thought',
    description: 'Shimmering wavy double outline for telepathic speech, cosmic entities, and spirits.',
    category: 'THOUGHT',
    strokeWidth: 1.8,
    strokeColor: '#a855f7',
    fillColor: '#faf5ff',
    fontFamily: 'system-ui, sans-serif',
    fontSize: 13,
    textColor: '#6b21a8',
    tailPhysics: 'none',
    svgGenerator: (w, h) => {
      return `<rect x="4" y="4" width="${w - 8}" height="${h - 8}" rx="${h * 0.4}" fill="#faf5ff" stroke="#a855f7" stroke-width="2" />
              <rect x="8" y="8" width="${w - 16}" height="${h - 16}" rx="${h * 0.35}" fill="none" stroke="#d8b4fe" stroke-width="1.2" stroke-dasharray="4 3" />`;
    },
  },

  children_scribble: {
    id: 'children_scribble',
    name: 'Playful Crayon Scribble',
    type: 'speech',
    description: 'Charming wobbly hand-drawn contour that feels like a child drew it with crayon.',
    category: 'KIDS',
    strokeWidth: 3,
    strokeColor: '#ea580c',
    fillColor: '#fff7ed',
    fontFamily: '"Comic Sans MS", "Chalkboard", cursive',
    fontSize: 14,
    textColor: '#c2410c',
    tailPhysics: 'smooth_curve',
    svgGenerator: (w, h) => {
      return `<path d="M 12 14 C ${w * 0.3} 6, ${w * 0.7} 12, ${w - 14} 8 C ${w + 4} ${h * 0.4}, ${w - 4} ${h * 0.8}, ${w - 12} ${h - 8} C ${w * 0.6} ${h + 6}, ${w * 0.3} ${h - 4}, 10 ${h - 10} C -2 ${h * 0.6}, 4 ${h * 0.2}, 12 14 Z" fill="#fff7ed" stroke="#ea580c" stroke-width="3" stroke-linecap="round" />`;
    },
  },

  storybook_ribbon: {
    id: 'storybook_ribbon',
    name: 'Whimsical Story Banner Ribbon',
    type: 'narration_box',
    description: 'Curled banner ribbon with swallowtail ends for chapter titles and fairy tale narration.',
    category: 'KIDS',
    strokeWidth: 2,
    strokeColor: '#b45309',
    fillColor: '#fef3c7',
    fontFamily: '"Georgia", cursive, serif',
    fontSize: 14,
    textColor: '#78350f',
    tailPhysics: 'none',
    svgGenerator: (w, h) => {
      return `<path d="M 15 8 L ${w - 15} 8 L ${w} ${h * 0.5} L ${w - 15} ${h - 8} L 15 ${h - 8} L 0 ${h * 0.5} Z" fill="#fef3c7" stroke="#b45309" stroke-width="2.2" stroke-linejoin="round" />`;
    },
  },

  shojo_blossom: {
    id: 'shojo_blossom',
    name: 'Shojo Romantic Blossom',
    type: 'speech',
    description: 'Soft pink tint with graceful organic curves for emotional confessions and poetic lines.',
    category: 'EMOTION',
    strokeWidth: 1.8,
    strokeColor: '#f43f5e',
    fillColor: '#fff1f2',
    fontFamily: '"Palatino", serif',
    fontSize: 13,
    textColor: '#9f1239',
    tailPhysics: 'smooth_curve',
    svgGenerator: (w, h) => {
      return `<rect x="3" y="3" width="${w - 6}" height="${h - 6}" rx="${h * 0.45}" fill="#fff1f2" stroke="#f43f5e" stroke-width="1.8" />
              <circle cx="12" cy="12" r="3" fill="#fda4af" opacity="0.6"/>
              <circle cx="${w - 12}" cy="${h - 12}" r="3" fill="#fda4af" opacity="0.6"/>`;
    },
  },

  radio_electric: {
    id: 'radio_electric',
    name: 'Electric Zig-Zag / Loudspeaker',
    type: 'speech',
    description: 'High-frequency electric lightning spikes for television, phone calls, and PA speakers.',
    category: 'TECH_HUD',
    strokeWidth: 2.2,
    strokeColor: '#eab308',
    fillColor: '#fefce8',
    fontFamily: '"Impact", monospace',
    fontSize: 13,
    textColor: '#854d0e',
    tailPhysics: 'straight_spike',
    svgGenerator: (w, h) => {
      return `<rect x="3" y="3" width="${w - 6}" height="${h - 6}" rx="6" fill="#fefce8" stroke="#eab308" stroke-width="2.2" />`;
    },
  },

  high_tension_needle: {
    id: 'high_tension_needle',
    name: 'Seinen High-Tension Needle',
    type: 'speech',
    description: 'Elongated vertical oval with an ultra-sharp needle tail aimed at the speaker.',
    category: 'SPEECH',
    strokeWidth: 2.5,
    strokeColor: '#000000',
    fillColor: '#ffffff',
    fontFamily: 'system-ui, sans-serif',
    fontSize: 13,
    textColor: '#000000',
    tailPhysics: 'straight_spike',
    svgGenerator: (w, h) => {
      return `<ellipse cx="${w / 2}" cy="${h / 2}" rx="${w / 2 - 2}" ry="${h / 2 - 2}" fill="#ffffff" stroke="#000000" stroke-width="2.5" />`;
    },
  },

  internal_monologue_dark: {
    id: 'internal_monologue_dark',
    name: 'Noir Internal Monologue (Dark)',
    type: 'narration_box',
    description: 'Deep smoked black rectangular caption box with stark white typography.',
    category: 'NARRATION',
    strokeWidth: 1.5,
    strokeColor: '#475569',
    fillColor: '#090a0f',
    fontFamily: '"Courier New", monospace',
    fontSize: 13,
    textColor: '#f8fafc',
    tailPhysics: 'none',
    svgGenerator: (w, h) => {
      return `<rect x="2" y="2" width="${w - 4}" height="${h - 4}" fill="#090a0f" stroke="#475569" stroke-width="1.5" />`;
    },
  },
};

export const SPEECH_BUBBLE_LIST = Object.values(SPEECH_BUBBLE_PRESETS);

// ─────────────────────────────────────────────────────────────────────────────
// 3. ACTION WORDS & SOUND EFFECTS (SFX / ONOMATOPOEIA) LIBRARY
// ─────────────────────────────────────────────────────────────────────────────

export interface SfxWordPreset {
  id: string;
  word: string;
  meaning: string;
  tradition: 'WESTERN' | 'MANGA_JAPANESE' | 'UNIVERSAL';
  japaneseKanji?: string;
  category: 'IMPACT' | 'ENERGY_MAGIC' | 'AMBIENT_QUIET' | 'MOVEMENT' | 'VOCAL';
  defaultColor: string;
  strokeColor: string;
  extrusionColor: string;
  extrusionDepth: number; // 3D depth in px
  defaultScale: number;
  rotationDeg: number;
  animation: 'shake' | 'pulse' | 'glitch' | 'float' | 'speedline';
}

export const SFX_PRESETS: SfxWordPreset[] = [
  // ── WESTERN COMIC SOUND EFFECTS ──
  {
    id: 'boom',
    word: 'BOOM!',
    meaning: 'Massive explosion or cannon shot',
    tradition: 'WESTERN',
    category: 'IMPACT',
    defaultColor: '#f59e0b',
    strokeColor: '#000000',
    extrusionColor: '#b91c1c',
    extrusionDepth: 6,
    defaultScale: 1.5,
    rotationDeg: -8,
    animation: 'shake',
  },
  {
    id: 'pow',
    word: 'POW!',
    meaning: 'Dynamic superhero punch or blunt blow',
    tradition: 'WESTERN',
    category: 'IMPACT',
    defaultColor: '#ef4444',
    strokeColor: '#ffffff',
    extrusionColor: '#1e1b4b',
    extrusionDepth: 5,
    defaultScale: 1.4,
    rotationDeg: 12,
    animation: 'shake',
  },
  {
    id: 'wham',
    word: 'WHAM!',
    meaning: 'Heavy wall collision or vehicle slam',
    tradition: 'WESTERN',
    category: 'IMPACT',
    defaultColor: '#ec4899',
    strokeColor: '#000000',
    extrusionColor: '#831843',
    extrusionDepth: 6,
    defaultScale: 1.4,
    rotationDeg: -5,
    animation: 'shake',
  },
  {
    id: 'zap',
    word: 'ZAP!',
    meaning: 'Electric shockwave, laser beam, or plasma burst',
    tradition: 'WESTERN',
    category: 'ENERGY_MAGIC',
    defaultColor: '#06b6d4',
    strokeColor: '#ffffff',
    extrusionColor: '#0e7490',
    extrusionDepth: 5,
    defaultScale: 1.3,
    rotationDeg: 15,
    animation: 'glitch',
  },
  {
    id: 'whoosh',
    word: 'WHOOSH!',
    meaning: 'High-speed flight, cape sweep, or wind gust',
    tradition: 'WESTERN',
    category: 'MOVEMENT',
    defaultColor: '#38bdf8',
    strokeColor: '#0f172a',
    extrusionColor: '#0284c7',
    extrusionDepth: 4,
    defaultScale: 1.2,
    rotationDeg: -12,
    animation: 'speedline',
  },
  {
    id: 'thud',
    word: 'THUD!',
    meaning: 'Heavy object dropping to the floor',
    tradition: 'WESTERN',
    category: 'IMPACT',
    defaultColor: '#78716c',
    strokeColor: '#0c0a09',
    extrusionColor: '#292524',
    extrusionDepth: 4,
    defaultScale: 1.1,
    rotationDeg: 4,
    animation: 'pulse',
  },
  {
    id: 'crackle',
    word: 'CRACKLE!',
    meaning: 'Energy sparks, fire flames, or static electricity',
    tradition: 'WESTERN',
    category: 'ENERGY_MAGIC',
    defaultColor: '#facc15',
    strokeColor: '#ea580c',
    extrusionColor: '#7c2d12',
    extrusionDepth: 4,
    defaultScale: 1.2,
    rotationDeg: -6,
    animation: 'glitch',
  },
  {
    id: 'snap',
    word: 'SNAP!',
    meaning: 'Twig breaking, finger snap, or bone fracture',
    tradition: 'WESTERN',
    category: 'IMPACT',
    defaultColor: '#ffffff',
    strokeColor: '#dc2626',
    extrusionColor: '#991b1b',
    extrusionDepth: 3,
    defaultScale: 1.1,
    rotationDeg: 8,
    animation: 'pulse',
  },

  // ── MANGA & JAPANESE ONOMATOPOEIA ──
  {
    id: 'dokaaan',
    word: 'DOKAAAAN!',
    meaning: 'Cataclysmic manga explosion (ドカーン)',
    tradition: 'MANGA_JAPANESE',
    japaneseKanji: 'ドカーン',
    category: 'IMPACT',
    defaultColor: '#f97316',
    strokeColor: '#000000',
    extrusionColor: '#7c2d12',
    extrusionDepth: 7,
    defaultScale: 1.6,
    rotationDeg: -10,
    animation: 'shake',
  },
  {
    id: 'gogogo',
    word: 'GO-GO-GO...',
    meaning: 'Ominous, menacing presence or earthquake rumble (ゴゴゴ)',
    tradition: 'MANGA_JAPANESE',
    japaneseKanji: 'ゴゴゴ',
    category: 'AMBIENT_QUIET',
    defaultColor: '#a855f7',
    strokeColor: '#3b0764',
    extrusionColor: '#1e1b4b',
    extrusionDepth: 4,
    defaultScale: 1.3,
    rotationDeg: 0,
    animation: 'pulse',
  },
  {
    id: 'don',
    word: 'DON!!',
    meaning: 'Sudden dramatic realization or dramatic entrance (ドン)',
    tradition: 'MANGA_JAPANESE',
    japaneseKanji: 'ドン',
    category: 'IMPACT',
    defaultColor: '#dc2626',
    strokeColor: '#000000',
    extrusionColor: '#450a0a',
    extrusionDepth: 6,
    defaultScale: 1.5,
    rotationDeg: 0,
    animation: 'shake',
  },
  {
    id: 'shing',
    word: 'SHING!',
    meaning: 'Katana blade unsheathing or eyes gleaming (キラーン)',
    tradition: 'MANGA_JAPANESE',
    japaneseKanji: 'キラーン',
    category: 'ENERGY_MAGIC',
    defaultColor: '#e0e7ff',
    strokeColor: '#3730a3',
    extrusionColor: '#1e1b4b',
    extrusionDepth: 4,
    defaultScale: 1.2,
    rotationDeg: 14,
    animation: 'glitch',
  },
  {
    id: 'za',
    word: 'ZA!',
    meaning: 'Sudden swift footstep, teleport, or dash (ザッ)',
    tradition: 'MANGA_JAPANESE',
    japaneseKanji: 'ザッ',
    category: 'MOVEMENT',
    defaultColor: '#ffffff',
    strokeColor: '#000000',
    extrusionColor: '#52525b',
    extrusionDepth: 3,
    defaultScale: 1.1,
    rotationDeg: -16,
    animation: 'speedline',
  },
  {
    id: 'doki_doki',
    word: 'DOKI DOKI',
    meaning: 'Heart thumping with excitement or love (ドキドキ)',
    tradition: 'MANGA_JAPANESE',
    japaneseKanji: 'ドキドキ',
    category: 'AMBIENT_QUIET',
    defaultColor: '#fb7185',
    strokeColor: '#be123c',
    extrusionColor: '#4c0519',
    extrusionDepth: 3,
    defaultScale: 1.1,
    rotationDeg: 6,
    animation: 'float',
  },
  {
    id: 'gyaaa',
    word: 'GYAAA!',
    meaning: 'Agonized scream or panic shriek (ギャー)',
    tradition: 'MANGA_JAPANESE',
    japaneseKanji: 'ギャー',
    category: 'VOCAL',
    defaultColor: '#fbbf24',
    strokeColor: '#b91c1c',
    extrusionColor: '#450a0a',
    extrusionDepth: 5,
    defaultScale: 1.4,
    rotationDeg: -12,
    animation: 'shake',
  },
  {
    id: 'bachi_bachi',
    word: 'BACHI-BACHI!',
    meaning: 'Electric arcs crackling between foes (バチバチ)',
    tradition: 'MANGA_JAPANESE',
    japaneseKanji: 'バチバチ',
    category: 'ENERGY_MAGIC',
    defaultColor: '#38bdf8',
    strokeColor: '#0369a1',
    extrusionColor: '#082f49',
    extrusionDepth: 4,
    defaultScale: 1.2,
    rotationDeg: 10,
    animation: 'glitch',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// 4. AUTODESK SKETCHBOOK & CLIP STUDIO DRAWING PRESETS & GUIDES
// ─────────────────────────────────────────────────────────────────────────────

export interface SketchbookBrushPreset {
  id: string;
  name: string;
  category: 'PENCIL' | 'PEN' | 'MARKER' | 'PAINT' | 'AIRBRUSH' | 'ERASER' | 'EFFECT';
  description: string;
  baseWidth: number;
  minWidthRatio: number; // Pressure sensitivity response
  opacity: number;
  blendMode: 'source-over' | 'multiply' | 'screen' | 'overlay';
  smoothingFactor: number; // 0..1 (Streamline EMA)
  roundCap: boolean;
  texturePattern?: string; // e.g. "graphite_tooth", "watercolor_bleed"
}

export const SKETCHBOOK_BRUSH_PRESETS: Record<string, SketchbookBrushPreset> = {
  g_pen: {
    id: 'g_pen',
    name: 'Manga G-Pen (High Dynamic)',
    category: 'PEN',
    description: 'The definitive manga inking nib. Extreme pressure sensitivity for bold outlines and razor-thin tapers.',
    baseWidth: 4,
    minWidthRatio: 0.15,
    opacity: 1.0,
    blendMode: 'source-over',
    smoothingFactor: 0.72,
    roundCap: true,
  },

  maru_pen: {
    id: 'maru_pen',
    name: 'Maru Mapping Pen (Ultra-Fine)',
    category: 'PEN',
    description: 'Delicate round nib for micro-details, hair strands, mechanical crosshatching, and eyes.',
    baseWidth: 2,
    minWidthRatio: 0.3,
    opacity: 1.0,
    blendMode: 'source-over',
    smoothingFactor: 0.8,
    roundCap: true,
  },

  kabura_pen: {
    id: 'kabura_pen',
    name: 'Kabura Spoon Pen (Smooth & Uniform)',
    category: 'PEN',
    description: 'Spoon nib with steady, uniform ink delivery. For clean outlines with minimal line weight fluctuation.',
    baseWidth: 3.5,
    minWidthRatio: 0.5,
    opacity: 1.0,
    blendMode: 'source-over',
    smoothingFactor: 0.65,
    roundCap: true,
  },

  sketching_pencil_2b: {
    id: 'sketching_pencil_2b',
    name: '2B Graphite Sketching Pencil',
    category: 'PENCIL',
    description: 'Autodesk Sketchbook style responsive graphite pencil with paper tooth grain for underdrawings.',
    baseWidth: 2.8,
    minWidthRatio: 0.4,
    opacity: 0.75,
    blendMode: 'multiply',
    smoothingFactor: 0.4,
    roundCap: true,
    texturePattern: 'graphite_tooth',
  },

  copic_marker: {
    id: 'copic_marker',
    name: 'Copic Alcohol Chisel Marker',
    category: 'MARKER',
    description: 'Translucent buildable alcohol ink with soft overlap multiplication. Perfect for shadows and character flats.',
    baseWidth: 16,
    minWidthRatio: 0.7,
    opacity: 0.45,
    blendMode: 'multiply',
    smoothingFactor: 0.5,
    roundCap: false,
  },

  watercolor_wash: {
    id: 'watercolor_wash',
    name: 'Wet Watercolor Wash',
    category: 'PAINT',
    description: 'Soft, flowing watercolor wash with gentle edge pooling. Ideal for children’s storybooks and Ghibli skies.',
    baseWidth: 28,
    minWidthRatio: 0.5,
    opacity: 0.35,
    blendMode: 'multiply',
    smoothingFactor: 0.6,
    roundCap: true,
    texturePattern: 'watercolor_bleed',
  },

  soft_airbrush: {
    id: 'soft_airbrush',
    name: 'Soft Volumetric Airbrush',
    category: 'AIRBRUSH',
    description: 'Feathered Gaussian gradient spray for glowing eyes, volumetric rim lights, and soft blush.',
    baseWidth: 36,
    minWidthRatio: 0.3,
    opacity: 0.25,
    blendMode: 'source-over',
    smoothingFactor: 0.75,
    roundCap: true,
  },

  technical_fineliner: {
    id: 'technical_fineliner',
    name: '0.3mm Architectural Fineliner',
    category: 'PEN',
    description: 'Zero pressure variance. Pure mathematical precision for perspective grids, robots, and panel borders.',
    baseWidth: 1.8,
    minWidthRatio: 1.0,
    opacity: 1.0,
    blendMode: 'source-over',
    smoothingFactor: 0.85,
    roundCap: true,
  },

  kneaded_eraser: {
    id: 'kneaded_eraser',
    name: 'Kneaded Soft Eraser',
    category: 'ERASER',
    description: 'Lightens drawing layers softly without destroying underlying lines. Great for highlights.',
    baseWidth: 22,
    minWidthRatio: 0.5,
    opacity: 0.4,
    blendMode: 'source-over',
    smoothingFactor: 0.5,
    roundCap: true,
  },

  razor_hard_eraser: {
    id: 'razor_hard_eraser',
    name: 'Razor Sharp Hard Eraser',
    category: 'ERASER',
    description: '100% clean erase cuts for trimming line overlaps and creating sharp white cuts in black ink.',
    baseWidth: 10,
    minWidthRatio: 0.2,
    opacity: 1.0,
    blendMode: 'source-over',
    smoothingFactor: 0.6,
    roundCap: true,
  },
};

export const SKETCHBOOK_BRUSH_LIST = Object.values(SKETCHBOOK_BRUSH_PRESETS);

// ─────────────────────────────────────────────────────────────────────────────
// 5. DRAWING ASSIST & PERSPECTIVE GUIDES
// ─────────────────────────────────────────────────────────────────────────────

export type PerspectiveGuideMode = 'OFF' | '1_POINT' | '2_POINT' | '3_POINT' | 'ISOMETRIC' | 'SYMMETRY_VERTICAL';

export interface PerspectiveGuideConfig {
  mode: PerspectiveGuideMode;
  horizonY: number; // 0..100
  vanishingPoints: Array<{ x: number; y: number }>;
  gridDensity: number; // number of radiating lines
  snapStrength: number; // 0..1 (0 = freehand, 1 = strict magnetic snap)
}

export const DEFAULT_PERSPECTIVE_GUIDES: Record<PerspectiveGuideMode, PerspectiveGuideConfig> = {
  OFF: {
    mode: 'OFF',
    horizonY: 50,
    vanishingPoints: [],
    gridDensity: 0,
    snapStrength: 0,
  },
  '1_POINT': {
    mode: '1_POINT',
    horizonY: 50,
    vanishingPoints: [{ x: 50, y: 50 }],
    gridDensity: 16,
    snapStrength: 0.7,
  },
  '2_POINT': {
    mode: '2_POINT',
    horizonY: 45,
    vanishingPoints: [{ x: -20, y: 45 }, { x: 120, y: 45 }],
    gridDensity: 24,
    snapStrength: 0.75,
  },
  '3_POINT': {
    mode: '3_POINT',
    horizonY: 35,
    vanishingPoints: [{ x: -10, y: 35 }, { x: 110, y: 35 }, { x: 50, y: 140 }],
    gridDensity: 32,
    snapStrength: 0.8,
  },
  ISOMETRIC: {
    mode: 'ISOMETRIC',
    horizonY: 50,
    vanishingPoints: [],
    gridDensity: 20,
    snapStrength: 0.8,
  },
  SYMMETRY_VERTICAL: {
    mode: 'SYMMETRY_VERTICAL',
    horizonY: 50,
    vanishingPoints: [{ x: 50, y: 50 }],
    gridDensity: 1,
    snapStrength: 1.0,
  },
};
