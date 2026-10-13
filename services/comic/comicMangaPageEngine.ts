// services/comic/comicMangaPageEngine.ts — Comic & Manga Page Builder Layout Engine.
// Multi-panel grid compositor that binds Character Bible face embeddings directly into
// sequential SVG panels with procedural speech balloons and screentone shaders.
// 100% Native Plajah Platform: zero external cloud dependencies.

import {
  CharacterSheet,
  listSavedCharacters,
} from '../story/characterBible';
import {
  compileComicPanelTask,
  PlajahNativeTask,
} from '../localAi/plajahPipelineEngine';
import { plajahAudioCore, FabulaDialogueTake } from '../voice/plajahAudioCore';

export type PageLayoutId =
  | 'grid_6_classic'
  | 'dynamic_manga_5'
  | 'yonkoma_4'
  | 'splash_heroic'
  | 'widescreen_cinematic_3';

export type ScreentonePattern =
  | 'dots_fine'
  | 'dots_coarse'
  | 'speed_lines'
  | 'radial_burst'
  | 'crosshatch'
  | 'none';

export type BalloonType =
  | 'speech'
  | 'thought'
  | 'shout'
  | 'whisper'
  | 'narration_box'
  | 'sfx';

export interface PanelGeometryBox {
  id: string;
  panelIndex: number;
  xPct: number;      // 0..100
  yPct: number;      // 0..100
  widthPct: number;  // 0..100
  heightPct: number; // 0..100
  clipPolygon?: string; // Optional CSS/SVG polygon for dynamic slanted cuts e.g. "polygon(0 0, 100% 10%, 100% 100%, 0 90%)"
}

export interface ComicVectorBalloon {
  id: string;
  type: BalloonType;
  text: string;
  speakerCharacterId?: string;
  speakerName?: string;
  xPct: number; // 0..100 relative to panel
  yPct: number; // 0..100 relative to panel
  widthPx?: number;
  tailDirection?: 'bottom_left' | 'bottom_right' | 'top_left' | 'top_right' | 'none';
  sfxColor?: string;
  sfxScale?: number;
  audioTake?: FabulaDialogueTake;
}

export interface ComicEnginePanel {
  id: string;
  panelIndex: number;
  box: PanelGeometryBox;
  cameraShot: 'establishing' | 'full_shot' | 'medium' | 'close_up' | 'extreme_close_up' | 'low_angle_hero';
  characterId?: string;
  actionPrompt: string;
  environmentPrompt?: string;
  renderedImageUrl?: string;
  screentone: {
    enabled: boolean;
    pattern: ScreentonePattern;
    opacity: number; // 0..1
  };
  balloons: ComicVectorBalloon[];
}

export interface ComicMangaPage {
  id: string;
  title: string;
  pageNumber: number;
  layoutId: PageLayoutId;
  readingDirection: 'ltr' | 'rtl'; // ltr: Western Comic, rtl: Japanese Manga
  dimensions: { width: number; height: number }; // Default: 1200 x 1600 (A4 / Comic standard)
  gutterPx: number;
  gutterColor: string;
  panels: ComicEnginePanel[];
  stylePreset: 'manga' | 'graphic_novel_noir' | 'american_superhero' | 'storybook_watercolor';
  createdAt: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// PRESET LAYOUT GENERATOR
// ─────────────────────────────────────────────────────────────────────────────

export const LAYOUT_PRESETS: Record<PageLayoutId, {
  name: string;
  description: string;
  defaultPanels: number;
  createBoxes: (gutterPct: number) => PanelGeometryBox[];
}> = {
  grid_6_classic: {
    name: 'Classic 6-Panel (2x3)',
    description: 'Traditional American comic 6-panel uniform grid. High readability and measured pacing.',
    defaultPanels: 6,
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

  dynamic_manga_5: {
    name: 'Shonen Dynamic 5-Panel',
    description: 'Kinetic Japanese action layout. Large angled top hero panel, mid split, and high-impact climax panels.',
    defaultPanels: 5,
    createBoxes: (g) => [
      // Panel 0: Large Top Action Banner
      {
        id: 'box_0',
        panelIndex: 0,
        xPct: g,
        yPct: g,
        widthPct: 100 - g * 2,
        heightPct: 36,
      },
      // Panel 1: Middle Left Cut
      {
        id: 'box_1',
        panelIndex: 1,
        xPct: g,
        yPct: g + 36 + g,
        widthPct: (100 - g * 3) * 0.45,
        heightPct: 28,
      },
      // Panel 2: Middle Right Hero Reaction
      {
        id: 'box_2',
        panelIndex: 2,
        xPct: g + (100 - g * 3) * 0.45 + g,
        yPct: g + 36 + g,
        widthPct: (100 - g * 3) * 0.55,
        heightPct: 28,
      },
      // Panel 3: Bottom Left Tension
      {
        id: 'box_3',
        panelIndex: 3,
        xPct: g,
        yPct: g + 36 + g + 28 + g,
        widthPct: (100 - g * 3) * 0.5,
        heightPct: 100 - (g + 36 + g + 28 + g + g),
      },
      // Panel 4: Bottom Right Climax SFX
      {
        id: 'box_4',
        panelIndex: 4,
        xPct: g + (100 - g * 3) * 0.5 + g,
        yPct: g + 36 + g + 28 + g,
        widthPct: (100 - g * 3) * 0.5,
        heightPct: 100 - (g + 36 + g + 28 + g + g),
      },
    ],
  },

  yonkoma_4: {
    name: 'Yonkoma (4-Koma Vertical)',
    description: 'Traditional 4-panel vertical manga strip: Ki-shō-ten-ketsu (Introduction, Development, Twist, Conclusion).',
    defaultPanels: 4,
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

  splash_heroic: {
    name: 'Heroic Splash Page + Insets',
    description: 'Full-bleed monumental splash background with 2 floating narrative dialogue insets.',
    defaultPanels: 3,
    createBoxes: (g) => [
      // Main Splash Panel
      {
        id: 'box_0',
        panelIndex: 0,
        xPct: g,
        yPct: g,
        widthPct: 100 - g * 2,
        heightPct: 100 - g * 2,
      },
      // Floating Inset Panel A (Top Right)
      {
        id: 'box_1',
        panelIndex: 1,
        xPct: 60,
        yPct: 12,
        widthPct: 34,
        heightPct: 22,
      },
      // Floating Inset Panel B (Bottom Left)
      {
        id: 'box_2',
        panelIndex: 2,
        xPct: 6,
        yPct: 68,
        widthPct: 36,
        heightPct: 24,
      },
    ],
  },

  widescreen_cinematic_3: {
    name: 'Widescreen Cinematic (3-Tier)',
    description: 'Three 2.39:1 letterbox cinematic frames stacked vertically. Ideal for filmic storytelling and graphic novels.',
    defaultPanels: 3,
    createBoxes: (g) => {
      const h = (100 - g * 4) / 3;
      const w = 100 - g * 2;
      return [0, 1, 2].map((idx) => ({
        id: `box_${idx}`,
        panelIndex: idx,
        xPct: g,
        yPct: g + idx * (h + g),
        widthPct: w,
        heightPct: h,
      }));
    },
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// PAGE BUILDER & FACTORY
// ─────────────────────────────────────────────────────────────────────────────

export class ComicMangaPageEngine {
  private static instance: ComicMangaPageEngine | null = null;

  static getInstance(): ComicMangaPageEngine {
    if (!this.instance) {
      this.instance = new ComicMangaPageEngine();
    }
    return this.instance;
  }

  /**
   * Creates a fresh Comic or Manga Page initialized with layout geometry.
   */
  createPage(options: {
    title?: string;
    layoutId?: PageLayoutId;
    readingDirection?: 'ltr' | 'rtl';
    stylePreset?: ComicMangaPage['stylePreset'];
    primaryCharacterId?: string;
  }): ComicMangaPage {
    const layoutId = options.layoutId || 'dynamic_manga_5';
    const stylePreset = options.stylePreset || (layoutId === 'dynamic_manga_5' || layoutId === 'yonkoma_4' ? 'manga' : 'graphic_novel_noir');
    const readingDirection = options.readingDirection || (stylePreset === 'manga' ? 'rtl' : 'ltr');
    const gutterPx = 12;
    const gutterPct = 1.2;

    const preset = LAYOUT_PRESETS[layoutId];
    const boxes = preset.createBoxes(gutterPct);

    // Default panels populated from boxes
    const panels: ComicEnginePanel[] = boxes.map((box, idx) => {
      const shots: ComicEnginePanel['cameraShot'][] = ['establishing', 'medium', 'close_up', 'extreme_close_up', 'low_angle_hero'];
      const shot = shots[idx % shots.length];

      return {
        id: `panel_${Date.now()}_${idx}`,
        panelIndex: idx,
        box,
        cameraShot: shot,
        characterId: options.primaryCharacterId,
        actionPrompt: idx === 0
          ? 'Surveying the vast neon city skyline from the rain-drenched rooftop'
          : idx === 1
          ? 'Reaching inside leather duster to withdraw a glowing holographic cipher'
          : 'Eyes narrowing with cold determination as sparks crackle from cybernetic eye',
        screentone: {
          enabled: stylePreset === 'manga',
          pattern: idx === 0 ? 'dots_fine' : idx === boxes.length - 1 ? 'speed_lines' : 'dots_coarse',
          opacity: 0.25,
        },
        balloons: idx === 0 ? [
          {
            id: `b_init_${idx}`,
            type: 'narration_box',
            text: '23:41. LOWER OBERON SECTOR.',
            xPct: 10,
            yPct: 10,
          },
        ] : idx === 1 ? [
          {
            id: `b_init_${idx}`,
            type: 'thought',
            text: 'They changed the orbital encryption keys...',
            xPct: 20,
            yPct: 15,
            tailDirection: 'bottom_left',
          },
        ] : [
          {
            id: `b_init_${idx}`,
            type: 'sfx',
            text: 'CRACKLE!',
            xPct: 65,
            yPct: 20,
            sfxColor: '#00DAF3',
            sfxScale: 1.2,
          },
        ],
      };
    });

    return {
      id: `comic_page_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      title: options.title || 'Chapter 1: The Signal',
      pageNumber: 1,
      layoutId,
      readingDirection,
      dimensions: { width: 1200, height: 1600 },
      gutterPx,
      gutterColor: stylePreset === 'manga' ? '#ffffff' : '#0a0b0e',
      panels,
      stylePreset,
      createdAt: Date.now(),
    };
  }

  /**
   * Compiles PlajahNativeTask generation tasks for every panel in the page,
   * preserving the Character Bible likeness anchor across sequential panels.
   */
  compilePageTasks(page: ComicMangaPage, character?: CharacterSheet): PlajahNativeTask[] {
    const tasks: PlajahNativeTask[] = [];

    // Map style presets to LoRA & Model
    let loraId: string | undefined;
    let modelId = 'animagine_xl';
    let lightingCue = 'vibrant comic inks';

    if (page.stylePreset === 'manga') {
      loraId = 'flux_lora_manga_screentone';
      modelId = 'flux2_klein_4b';
      lightingCue = 'authentic high contrast manga inking with screentone textures';
    } else if (page.stylePreset === 'storybook_watercolor') {
      loraId = 'flux_lora_storybook_cartoon';
      modelId = 'flux2_klein_4b';
      lightingCue = 'whimsical watercolor wash and delicate storybook ink lines';
    } else if (page.stylePreset === 'graphic_novel_noir') {
      loraId = 'flux_lora_cinematic_35mm';
      modelId = 'flux2_klein_4b';
      lightingCue = 'bold graphic novel chiaroscuro, heavy black shadows, sharp rim light';
    }

    const charPrompt = character ? `${character.name}: ${character.visualAnchor}` : 'A determined protagonist';
    const faceRef = character?.turnaroundUrls.closeUp;

    for (const panel of page.panels) {
      const task = compileComicPanelTask({
        characterPrompt: charPrompt,
        faceEmbeddingRef: faceRef,
        sceneActionPrompt: panel.actionPrompt,
        cameraShot: panel.cameraShot,
        moodLighting: lightingCue,
        aspect: panel.box.widthPct > panel.box.heightPct * 1.3 ? '16:9' : '1:1',
        modelId,
        loraId,
      });

      tasks.push(task);
    }

    return tasks;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PROCEDURAL SVG SCREENTONE DEFINITIONS
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Generates procedural SVG `<defs>` containing manga halftone dots, speed lines,
   * radial burst focus patterns, and balloon dropshadow filters.
   */
  generateSvgDefs(): string {
    return `
    <defs>
      <!-- Drop Shadow Filter for Speech Balloons -->
      <filter id="balloon-shadow" x="-10%" y="-10%" width="130%" height="130%">
        <feDropShadow dx="2" dy="3" stdDeviation="2" flood-color="#000000" flood-opacity="0.35"/>
      </filter>

      <!-- Glow for SFX Onomatopoeia -->
      <filter id="sfx-glow" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="3" result="blur"/>
        <feComposite in="SourceGraphic" in2="blur" operator="over"/>
      </filter>

      <!-- 1. Fine Halftone Screentone (Dots Fine) -->
      <pattern id="screentone-dots-fine" width="8" height="8" patternUnits="userSpaceOnUse">
        <circle cx="4" cy="4" r="1.5" fill="#000000"/>
      </pattern>

      <!-- 2. Coarse Halftone Screentone (Dots Coarse) -->
      <pattern id="screentone-dots-coarse" width="16" height="16" patternUnits="userSpaceOnUse">
        <circle cx="8" cy="8" r="3.8" fill="#000000"/>
      </pattern>

      <!-- 3. Manga Speed Lines Pattern (Dynamic Horizontal / Angled Streaks) -->
      <pattern id="screentone-speed-lines" width="40" height="20" patternUnits="userSpaceOnUse" patternTransform="rotate(-15)">
        <line x1="0" y1="5" x2="35" y2="5" stroke="#000000" stroke-width="2" stroke-dasharray="12 4 4 4"/>
        <line x1="10" y1="15" x2="40" y2="15" stroke="#000000" stroke-width="1.5" stroke-dasharray="8 6"/>
      </pattern>

      <!-- 4. Crosshatch Shader Pattern -->
      <pattern id="screentone-crosshatch" width="10" height="10" patternUnits="userSpaceOnUse">
        <line x1="0" y1="0" x2="10" y2="10" stroke="#000000" stroke-width="1"/>
        <line x1="10" y1="0" x2="0" y2="10" stroke="#000000" stroke-width="0.8"/>
      </pattern>

      <!-- 5. Radial Burst Shader Gradient -->
      <radialGradient id="screentone-radial-burst" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="#ffffff" stop-opacity="0"/>
        <stop offset="60%" stop-color="#000000" stop-opacity="0.15"/>
        <stop offset="100%" stop-color="#000000" stop-opacity="0.6"/>
      </radialGradient>
    </defs>
    `.trim();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SVG SPEECH BALLOON GENERATOR
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Computes an SVG vector representation for a speech balloon or sound effect.
   */
  renderBalloonSvg(balloon: ComicVectorBalloon, panelPixelW: number, panelPixelH: number): string {
    const x = (balloon.xPct / 100) * panelPixelW;
    const y = (balloon.yPct / 100) * panelPixelH;
    const width = balloon.widthPx || Math.max(120, Math.min(260, balloon.text.length * 8.5 + 40));
    const height = Math.max(46, Math.ceil(balloon.text.length / 22) * 22 + 24);

    // 1. SOUND EFFECT (SFX / Onomatopoeia)
    if (balloon.type === 'sfx') {
      const color = balloon.sfxColor || '#FF8C00';
      const scale = balloon.sfxScale || 1.0;
      const fontSize = Math.round(28 * scale);

      return `
      <g transform="translate(${x}, ${y}) rotate(-8)">
        <text x="0" y="0"
          font-family="Impact, sans-serif"
          font-size="${fontSize}px"
          font-weight="900"
          font-style="italic"
          text-anchor="middle"
          stroke="#000000"
          stroke-width="5"
          fill="${color}"
          filter="url(#sfx-glow)"
          letter-spacing="2px">
          ${escapeXml(balloon.text)}
        </text>
        <text x="0" y="0"
          font-family="Impact, sans-serif"
          font-size="${fontSize}px"
          font-weight="900"
          font-style="italic"
          text-anchor="middle"
          fill="#ffffff"
          opacity="0.9"
          letter-spacing="2px">
          ${escapeXml(balloon.text)}
        </text>
      </g>
      `.trim();
    }

    // 2. NARRATION BOX (Sleek rectangular caption)
    if (balloon.type === 'narration_box') {
      return `
      <g transform="translate(${x}, ${y})" filter="url(#balloon-shadow)">
        <rect x="0" y="0" width="${width}" height="${height}" rx="2"
          fill="#000000" stroke="#FF8C00" stroke-width="2"/>
        <text x="${width / 2}" y="${height / 2 + 5}"
          font-family="'Courier New', monospace"
          font-size="12px"
          font-weight="bold"
          fill="#FF8C00"
          text-anchor="middle"
          letter-spacing="1px">
          ${escapeXml(balloon.text)}
        </text>
      </g>
      `.trim();
    }

    // 3. JAGGED SHOUT BALLOON (Action starburst)
    if (balloon.type === 'shout') {
      const points = computeStarburstPoints(width, height);
      return `
      <g transform="translate(${x}, ${y})" filter="url(#balloon-shadow)">
        <polygon points="${points}" fill="#ffffff" stroke="#e11d48" stroke-width="2.5" stroke-linejoin="miter"/>
        <text x="${width / 2}" y="${height / 2 + 5}"
          font-family="'Arial Black', Impact, sans-serif"
          font-size="13px"
          font-weight="bold"
          fill="#e11d48"
          text-anchor="middle">
          ${escapeXml(balloon.text)}
        </text>
      </g>
      `.trim();
    }

    // 4. THOUGHT CLOUD BALLOON
    if (balloon.type === 'thought') {
      return `
      <g transform="translate(${x}, ${y})" filter="url(#balloon-shadow)">
        <!-- Cloud outline -->
        <rect x="0" y="0" width="${width}" height="${height}" rx="18" ry="18"
          fill="#ffffff" stroke="#475569" stroke-width="1.8"/>
        <!-- Trailing thought circles -->
        <circle cx="${width * 0.2}" cy="${height + 8}" r="5" fill="#ffffff" stroke="#475569" stroke-width="1.5"/>
        <circle cx="${width * 0.14}" cy="${height + 18}" r="3" fill="#ffffff" stroke="#475569" stroke-width="1.5"/>
        <text x="${width / 2}" y="${height / 2 + 5}"
          font-family="system-ui, sans-serif"
          font-size="12px"
          font-style="italic"
          fill="#1e293b"
          text-anchor="middle">
          ${escapeXml(balloon.text)}
        </text>
      </g>
      `.trim();
    }

    // 5. STANDARD SPEECH BALLOON (Smooth pill with tail)
    const isWhisper = balloon.type === 'whisper';
    const tailDirection = balloon.tailDirection || 'bottom_left';
    const tailPath = computeTailPath(width, height, tailDirection);

    return `
    <g transform="translate(${x}, ${y})" filter="url(#balloon-shadow)">
      <!-- Main Bubble Body -->
      <rect x="0" y="0" width="${width}" height="${height}" rx="14" ry="14"
        fill="#ffffff"
        stroke="#0f172a"
        stroke-width="2"
        ${isWhisper ? 'stroke-dasharray="4 3"' : ''}/>
      <!-- Directional Tail -->
      <path d="${tailPath}" fill="#ffffff" stroke="#0f172a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      <!-- Tail seam cover -->
      <rect x="${width * 0.15}" y="${height - 2}" width="20" height="4" fill="#ffffff"/>
      <!-- Dialogue Text -->
      <text x="${width / 2}" y="${height / 2 + 4}"
        font-family="'Comic Neue', system-ui, sans-serif"
        font-size="12.5px"
        font-weight="600"
        fill="#0f172a"
        text-anchor="middle">
        ${escapeXml(balloon.text)}
      </text>
    </g>
    `.trim();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // FULL PAGE SVG RENDERER & COMPOSITOR
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Renders the complete Comic or Manga page into a standalone, printable SVG document.
   */
  renderPageToSvg(page: ComicMangaPage): string {
    const { width, height } = page.dimensions;
    const defs = this.generateSvgDefs();

    let panelsSvg = '';

    for (const panel of page.panels) {
      const pxX = (panel.box.xPct / 100) * width;
      const pxY = (panel.box.yPct / 100) * height;
      const pxW = (panel.box.widthPct / 100) * width;
      const pxH = (panel.box.heightPct / 100) * height;

      const clipId = `clip_${panel.id}`;

      // Panel background artwork image or placeholder fill
      const artElement = panel.renderedImageUrl
        ? `<image href="${panel.renderedImageUrl}" x="0" y="0" width="${pxW}" height="${pxH}" preserveAspectRatio="xMidYMid slice"/>`
        : `
          <rect width="${pxW}" height="${pxH}" fill="#16181d"/>
          <text x="${pxW / 2}" y="${pxH / 2 - 10}" fill="#475569" font-size="13px" font-family="monospace" text-anchor="middle">
            PANEL ${panel.panelIndex + 1} · ${panel.cameraShot.toUpperCase()}
          </text>
          <text x="${pxW / 2}" y="${pxH / 2 + 14}" fill="#64748b" font-size="11px" font-style="italic" text-anchor="middle" opacity="0.75">
            "${escapeXml(panel.actionPrompt.slice(0, 42))}..."
          </text>
        `;

      // Screentone overlay
      let screentoneOverlay = '';
      if (panel.screentone.enabled && panel.screentone.pattern !== 'none') {
        const patternId = `screentone-${panel.screentone.pattern.replace('_', '-')}`;
        screentoneOverlay = `
          <rect width="${pxW}" height="${pxH}"
            fill="url(#${patternId})"
            opacity="${panel.screentone.opacity}"
            style="mix-blend-mode: multiply; pointer-events: none;"/>
        `;
      }

      // Speech balloons
      const balloonsSvg = panel.balloons
        .map((b) => this.renderBalloonSvg(b, pxW, pxH))
        .join('\n');

      panelsSvg += `
      <!-- PANEL ${panel.panelIndex + 1} -->
      <g transform="translate(${pxX}, ${pxY})">
        <defs>
          <clipPath id="${clipId}">
            <rect width="${pxW}" height="${pxH}" rx="2"/>
          </clipPath>
        </defs>

        <!-- Artwork Layer (Clipped to Panel Boundary) -->
        <g clip-path="url(#${clipId})">
          ${artElement}
          ${screentoneOverlay}
        </g>

        <!-- Heavy Ink Comic Panel Frame Border -->
        <rect width="${pxW}" height="${pxH}" rx="2"
          fill="none"
          stroke="#000000"
          stroke-width="3"
          stroke-linejoin="miter"/>

        <!-- Vector Speech Balloons & SFX Layer -->
        ${balloonsSvg}
      </g>
      `;
    }

    return `
<svg xmlns="http://www.w3.org/2000/svg"
  viewBox="0 0 ${width} ${height}"
  width="${width}"
  height="${height}"
  style="background-color: ${page.gutterColor}; font-family: system-ui, sans-serif;">
  ${defs}

  <!-- Page Background Gutter -->
  <rect width="${width}" height="${height}" fill="${page.gutterColor}"/>

  <!-- Comic Panels Grid -->
  ${panelsSvg}
</svg>
    `.trim();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // AUDIO MULTI-VOICE CASTING FOR SPEECH BALLOONS
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Synthesizes audio for all dialogue bubbles across the comic page,
   * binding each character's voice and emotion tags into sequential takes.
   */
  async synthesizePageDialogueAudio(
    page: ComicMangaPage,
    speakerName = 'Aria'
  ): Promise<{ balloonId: string; take: FabulaDialogueTake }[]> {
    const results: { balloonId: string; take: FabulaDialogueTake }[] = [];

    for (const panel of page.panels) {
      for (const balloon of panel.balloons) {
        if (balloon.type === 'sfx' || !balloon.text.trim()) continue;

        const emotion = balloon.type === 'thought' ? 'whisper' : balloon.type === 'shout' ? 'urgent' : 'neutral';
        const speaker = balloon.speakerName || speakerName;

        try {
          const take = await plajahAudioCore.synthesizeFabulaDialogue({
            text: balloon.text,
            speakerName: speaker,
            emotion,
            takeIndex: 1,
            engine: 'kokoro',
          });
          balloon.audioTake = take;
          results.push({ balloonId: balloon.id, take });
        } catch (e) {
          console.warn('[ComicMangaPageEngine] Audio synthesis skipped for balloon:', balloon.id, e);
        }
      }
    }

    return results;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPER FUNCTIONS
// ─────────────────────────────────────────────────────────────────────────────

function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function computeTailPath(w: number, h: number, direction: string): string {
  if (direction === 'bottom_right') {
    return `M ${w * 0.75} ${h} L ${w * 0.88} ${h + 16} L ${w * 0.85} ${h}`;
  }
  if (direction === 'top_left') {
    return `M ${w * 0.25} 0 L ${w * 0.12} -16 L ${w * 0.15} 0`;
  }
  if (direction === 'top_right') {
    return `M ${w * 0.75} 0 L ${w * 0.88} -16 L ${w * 0.85} 0`;
  }
  // Default: bottom_left
  return `M ${w * 0.25} ${h} L ${w * 0.12} ${h + 16} L ${w * 0.15} ${h}`;
}

function computeStarburstPoints(w: number, h: number): string {
  const cx = w / 2;
  const cy = h / 2;
  const rx = w / 2;
  const ry = h / 2;
  const numPoints = 16;
  const points: string[] = [];

  for (let i = 0; i < numPoints; i++) {
    const angle = (i * 2 * Math.PI) / numPoints;
    const rScale = i % 2 === 0 ? 1.05 : 0.82;
    const x = cx + Math.cos(angle) * rx * rScale;
    const y = cy + Math.sin(angle) * ry * rScale;
    points.push(`${Math.round(x)},${Math.round(y)}`);
  }

  return points.join(' ');
}

export const comicMangaPageEngine = ComicMangaPageEngine.getInstance();
