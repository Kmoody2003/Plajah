import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import { AppView } from '../types';
import { COUNCIL_LIST } from './council/councilDirectors';
import { WORSHIP_COUNCIL_BUILDS } from './ambo/worshipVisualizers/councilBuilds';
import { COMPOSER_PERSONAS } from './living/composer/composerCouncil';

export type PlajahGradientPreset =
  | 'warm'
  | 'brand'
  | 'ember'
  | 'spatial'
  | 'ethereal'
  | 'sanctuary_gold'
  | 'cathedral_night';

export type PlajahVisualizerPreset =
  | 'NONE'
  | 'calm-01-gethsemane-olive-dusk'
  | 'calm-02-galilee-dawn-waters'
  | 'calm-03-cathedral-clerestory'
  | 'calm-04-candlelit-vigil'
  | 'calm-05-mountain-morning-mist'
  | 'NEBULA_AURORA';

export interface HeroArtSlotConfig {
  slotId: string;
  label: string;
  backgroundUrl: string;
  mediaType: 'image' | 'video' | 'plate';
  gradientPreset: PlajahGradientPreset;
  overlayOpacity: number; // 0 to 90
  visualizerPreset: PlajahVisualizerPreset;
  objectPosition?: string;
  councilBuildId?: string;
}

export interface EditableCarouselItem {
  id: string;
  title: string;
  subtitle: string;
  tag: string;
  coverUrl: string;
  accentColor: string;
  ctaLabel?: string;
  targetView?: AppView | string;
  linkedTool?: 'LIVING_BOOK' | 'AMBO_STAGE' | 'TELA_DESIGN' | 'CURATED_PLAYLIST' | 'PIXELS_ART' | 'COMIC_PANEL';
  metaBadge?: string;
}

export interface EditableCarouselShelf {
  shelfId: string;
  eyebrow: string;
  title: string;
  subtitle: string;
  handwrittenNote?: string;
  items: EditableCarouselItem[];
}

export type PlajahSectionTemplateType =
  | 'SANCTUARY_HERO_STAGE'
  | 'CURATED_CAROUSEL_SHELF'
  | 'BENTO_PILLAR_GRID'
  | 'LIVING_BOOK_SPOTLIGHT'
  | 'AMBO_VISUALIZER_STAGE'
  | 'EDITORIAL_CALLOUT_BANNER';

export interface CustomPageSection {
  id: string;
  template: PlajahSectionTemplateType;
  eyebrow: string;
  title: string;
  subtitle: string;
  handwrittenCallout?: string;
  ctaPrimaryLabel: string;
  ctaPrimaryTarget?: AppView | string;
  ctaSecondaryLabel?: string;
  ctaSecondaryTarget?: AppView | string;
  backgroundUrl?: string;
  gradientPreset: PlajahGradientPreset;
  visualizerPreset: PlajahVisualizerPreset;
  councilDirectorId?: string;
  councilNote?: string;
  cards: {
    id: string;
    badge: string;
    title: string;
    body: string;
    imageUrl?: string;
    accentColor: string;
    linkedTool?: string;
  }[];
}

export interface PageVisualConfig {
  viewId: string;
  updatedAt: number;
  updatedBy?: string;
  /** Key-value map of inline text overrides (slot key -> edited text) */
  textOverrides: Record<string, string>;
  /** Key-value map of hero/section background art configs */
  heroArt: Record<string, HeroArtSlotConfig>;
  /** Key-value map of editable carousels/shelves */
  carousels: Record<string, EditableCarouselShelf>;
  /** Admin-added pre-wired sections adhering to the Plajah Design Language */
  customSections: CustomPageSection[];
}

export const PLAJAH_GRADIENT_CSS: Record<PlajahGradientPreset, { label: string; css: string; accent: string }> = {
  warm: {
    label: 'Plajah Warm (--pj-grad-warm)',
    css: 'linear-gradient(135deg, #6B0099 0%, #D40055 55%, #FF8C00 100%)',
    accent: '#FF8C00',
  },
  brand: {
    label: 'Plajah Brand (--pj-grad-brand)',
    css: 'linear-gradient(135deg, #6B0099 0%, #D40055 100%)',
    accent: '#D40055',
  },
  ember: {
    label: 'Plajah Ember (--pj-grad-ember)',
    css: 'linear-gradient(135deg, #D40055 0%, #FF8C00 100%)',
    accent: '#FF8C00',
  },
  spatial: {
    label: 'Plajah Spatial (--pj-grad-spatial)',
    css: 'linear-gradient(135deg, #6B0099 0%, #00DAF3 100%)',
    accent: '#00DAF3',
  },
  ethereal: {
    label: 'Plajah Ethereal (--pj-grad-ethereal)',
    css: 'linear-gradient(135deg, #D0BCFF 0%, #6B0099 100%)',
    accent: '#D0BCFF',
  },
  sanctuary_gold: {
    label: 'Sanctuary Candle & Gold',
    css: 'linear-gradient(135deg, #1B120C 0%, #6B0099 48%, #D49B42 100%)',
    accent: '#D49B42',
  },
  cathedral_night: {
    label: 'Cathedral Clerestory Night',
    css: 'linear-gradient(135deg, #0A0E17 0%, #1E293B 55%, #6B0099 100%)',
    accent: '#D0BCFF',
  },
};

export const PRESET_HERO_PLATES: { id: string; label: string; category: string; url: string }[] = [
  {
    id: 'plate_gethsemane',
    label: 'Gethsemane Olive Dusk (Sanctuary Plate)',
    category: 'Stage Sanctuary Plates',
    url: '/sanctuary-plates/calm-olive-gethsemane.jpg',
  },
  {
    id: 'plate_galilee',
    label: 'Galilee Dawn Waters (Sanctuary Plate)',
    category: 'Stage Sanctuary Plates',
    url: '/sanctuary-plates/calm-galilee-dawn.jpg',
  },
  {
    id: 'plate_bokeh',
    label: 'Candlelit Bokeh Vigil (Sanctuary Plate)',
    category: 'Stage Sanctuary Plates',
    url: '/sanctuary-plates/calm-contemporary-bokeh-leaks.jpg',
  },
  {
    id: 'plate_prism',
    label: 'Cathedral Prism Light Leak',
    category: 'Stage Sanctuary Plates',
    url: '/sanctuary-plates/optical-light-leak-prism-overlay.jpg',
  },
  {
    id: 'unsplash_cathedral',
    label: 'Sunlit Sanctuary Architecture',
    category: 'Editorial Photography',
    url: 'https://images.unsplash.com/photo-1519817650390-64a93db51149?auto=format&fit=crop&w=1800&q=85',
  },
  {
    id: 'unsplash_choir',
    label: 'Warm Stage & Gathering Hall',
    category: 'Editorial Photography',
    url: 'https://images.unsplash.com/photo-1507692049790-de58290a4334?auto=format&fit=crop&w=1800&q=85',
  },
  {
    id: 'unsplash_study',
    label: 'Illuminated Manuscript & Study',
    category: 'Editorial Photography',
    url: 'https://images.unsplash.com/photo-1457369804613-52c61a468e7d?auto=format&fit=crop&w=1800&q=85',
  },
  {
    id: 'unsplash_nebula',
    label: 'Cosmic Violet & Gold Horizon',
    category: 'Plajah Brand Abstract',
    url: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?auto=format&fit=crop&w=1800&q=85',
  },
];

const STORAGE_PREFIX = 'plajah_visual_config_v2_';
const EDIT_MODE_STORAGE_KEY = 'plajah_admin_wysiwyg_edit_mode';

const configListeners = new Map<string, Set<(cfg: PageVisualConfig) => void>>();
const editModeListeners = new Set<(enabled: boolean) => void>();

export function isGlobalEditModeEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get('edit') === '1' || params.get('edit') === 'true') return true;
    return localStorage.getItem(EDIT_MODE_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function setGlobalEditModeEnabled(enabled: boolean) {
  try {
    localStorage.setItem(EDIT_MODE_STORAGE_KEY, String(enabled));
  } catch {
    // ignore
  }
  editModeListeners.forEach(cb => cb(enabled));
}

export function subscribeGlobalEditMode(cb: (enabled: boolean) => void): () => void {
  editModeListeners.add(cb);
  return () => {
    editModeListeners.delete(cb);
  };
}

export function getEmptyPageVisualConfig(viewId: string): PageVisualConfig {
  return {
    viewId,
    updatedAt: Date.now(),
    textOverrides: {},
    heroArt: {},
    carousels: {},
    customSections: [],
  };
}

export function loadPageVisualConfigSync(viewId: string): PageVisualConfig {
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${viewId}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        ...getEmptyPageVisualConfig(viewId),
        ...parsed,
      };
    }
  } catch {
    // ignore
  }
  return getEmptyPageVisualConfig(viewId);
}

export async function fetchPageVisualConfig(viewId: string): Promise<PageVisualConfig> {
  const local = loadPageVisualConfigSync(viewId);
  try {
    const ref = doc(db, 'site_visual_configs', viewId);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const remote = snap.data() as PageVisualConfig;
      if ((remote.updatedAt || 0) >= (local.updatedAt || 0)) {
        const merged: PageVisualConfig = {
          ...getEmptyPageVisualConfig(viewId),
          ...remote,
        };
        localStorage.setItem(`${STORAGE_PREFIX}${viewId}`, JSON.stringify(merged));
        return merged;
      }
    }
  } catch {
    // offline or permission fallback
  }
  return local;
}

export async function savePageVisualConfig(config: PageVisualConfig): Promise<void> {
  const next: PageVisualConfig = {
    ...config,
    updatedAt: Date.now(),
  };
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${config.viewId}`, JSON.stringify(next));
  } catch {
    // ignore
  }

  const set = configListeners.get(config.viewId);
  if (set) {
    set.forEach(cb => cb(next));
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('plajah-visual-config-updated', { detail: next }));
  }

  try {
    const ref = doc(db, 'site_visual_configs', config.viewId);
    await setDoc(ref, next, { merge: true });
  } catch {
    // fallback already saved in localStorage
  }
}

export function subscribePageVisualConfig(
  viewId: string,
  cb: (cfg: PageVisualConfig) => void
): () => void {
  if (!configListeners.has(viewId)) {
    configListeners.set(viewId, new Set());
  }
  const set = configListeners.get(viewId)!;
  set.add(cb);

  // Immediately emit sync state, then fetch remote
  cb(loadPageVisualConfigSync(viewId));
  fetchPageVisualConfig(viewId).then(remote => cb(remote));

  return () => {
    set.delete(cb);
  };
}

export function updateInlineTextSlot(viewId: string, slotKey: string, nextValue: string) {
  const current = loadPageVisualConfigSync(viewId);
  const next: PageVisualConfig = {
    ...current,
    textOverrides: {
      ...current.textOverrides,
      [slotKey]: nextValue,
    },
  };
  savePageVisualConfig(next);
}

export function updateHeroArtSlot(viewId: string, slotId: string, patch: Partial<HeroArtSlotConfig>) {
  const current = loadPageVisualConfigSync(viewId);
  const existing: HeroArtSlotConfig = current.heroArt[slotId] || {
    slotId,
    label: slotId,
    backgroundUrl: PRESET_HERO_PLATES[0].url,
    mediaType: 'image',
    gradientPreset: 'warm',
    overlayOpacity: 45,
    visualizerPreset: 'calm-01-gethsemane-olive-dusk',
  };
  const next: PageVisualConfig = {
    ...current,
    heroArt: {
      ...current.heroArt,
      [slotId]: {
        ...existing,
        ...patch,
      },
    },
  };
  savePageVisualConfig(next);
}

// ── Pre-Wired Section Templates in the Plajah Design Language ────────────────

export function createPrewiredSection(
  template: PlajahSectionTemplateType,
  councilDirectorId = 'BAROQUE'
): CustomPageSection {
  const id = `sec_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const director = COUNCIL_LIST.find(d => d.id === councilDirectorId) || COUNCIL_LIST[0];

  switch (template) {
    case 'SANCTUARY_HERO_STAGE':
      return {
        id,
        template,
        eyebrow: 'SANCTUARY STAGE · LIVE GATHERING',
        title: 'Where Sacred Architecture Meets Living Breath.',
        subtitle:
          'Pre-wired with Stage Council optical passes, Outfit display hierarchy, and L3 glass elevation. Click any copy or artwork to customize directly.',
        handwrittenCallout: 'light before content — every word arrives on measure',
        ctaPrimaryLabel: 'Enter the Sanctuary',
        ctaPrimaryTarget: AppView.PLAJAH_ELEVATE,
        ctaSecondaryLabel: 'Open Living Books',
        ctaSecondaryTarget: AppView.BOOKS,
        backgroundUrl: PRESET_HERO_PLATES[0].url,
        gradientPreset: 'warm',
        visualizerPreset: 'calm-01-gethsemane-olive-dusk',
        councilDirectorId: director.id,
        councilNote: `${director.epithet}: "${director.questions[0]}"`,
        cards: [],
      };

    case 'CURATED_CAROUSEL_SHELF':
      return {
        id,
        template,
        eyebrow: 'CURATED SANCTUARY SHELF',
        title: 'Featured Living Sanctuaries & Guilds',
        subtitle: 'Horizontal snap carousel pre-wired to Lorea Living Books, Chora Music, and Plajah Stage.',
        handwrittenCallout: 'curated by the sanctuary council',
        ctaPrimaryLabel: 'Explore All Sanctuaries',
        ctaPrimaryTarget: AppView.PLAJAH_ELEVATE,
        backgroundUrl: PRESET_HERO_PLATES[1].url,
        gradientPreset: 'brand',
        visualizerPreset: 'NONE',
        councilDirectorId: director.id,
        councilNote: `${director.epithet}: "${director.questions[1] || director.questions[0]}"`,
        cards: [
          {
            id: `${id}_c1`,
            badge: 'LIVING BOOK · LOREA',
            title: 'Psalms of Ascent: Illuminated Edition',
            body: 'Interactive annotated scripture with Melos Composer Council gentle accompaniment.',
            imageUrl: PRESET_HERO_PLATES[6].url,
            accentColor: '#D0BCFF',
            linkedTool: 'LIVING_BOOK',
          },
          {
            id: `${id}_c2`,
            badge: 'AMBO STAGE · VISUALIZER',
            title: 'Stone, Bough, and Governed Light',
            body: 'Built by the Classical Mind & Radical Minimalist for Good Friday & Dusk Vigils.',
            imageUrl: PRESET_HERO_PLATES[0].url,
            accentColor: '#FF8C00',
            linkedTool: 'AMBO_STAGE',
          },
          {
            id: `${id}_c3`,
            badge: 'CHORA · WORSHIP STEMS',
            title: 'Galilee Dawn Choir & Strings',
            body: 'Multi-track sanctuary audio stems reactive to Stage lyric progression.',
            imageUrl: PRESET_HERO_PLATES[1].url,
            accentColor: '#00DAF3',
            linkedTool: 'CURATED_PLAYLIST',
          },
        ],
      };

    case 'LIVING_BOOK_SPOTLIGHT':
      return {
        id,
        template,
        eyebrow: 'LOREA LIVING BOOK · INTERACTIVE EDITION',
        title: 'Author & Publish Living Books Directly Into Your Sanctuary',
        subtitle:
          'Every page carries adaptive Melos scores, margin study fellowships, and tactile page-turn physics governed by the Composer Council.',
        handwrittenCallout: 'scored by the Children’s-Song & Film Scorer seats',
        ctaPrimaryLabel: 'Launch Book Authoring Studio',
        ctaPrimaryTarget: AppView.BOOKS,
        ctaSecondaryLabel: 'Open Tela Publication Designer',
        ctaSecondaryTarget: AppView.TELA_STUDIO,
        backgroundUrl: PRESET_HERO_PLATES[6].url,
        gradientPreset: 'ethereal',
        visualizerPreset: 'calm-02-galilee-dawn-waters',
        councilDirectorId: director.id,
        councilNote: `${COMPOSER_PERSONAS.SCORER.name}: "${COMPOSER_PERSONAS.SCORER.lens}"`,
        cards: [
          {
            id: `${id}_b1`,
            badge: 'CHAPTER I · CANTUS FIRMUS',
            title: 'The Architecture of Stillness',
            body: 'Read with live fellowship margin notes and synchronized vocal-ducked ambient stems.',
            imageUrl: PRESET_HERO_PLATES[4].url,
            accentColor: '#D0BCFF',
            linkedTool: 'LIVING_BOOK',
          },
          {
            id: `${id}_b2`,
            badge: 'GRAPHIC NOVEL SAFE-ZONES',
            title: 'Illustrated Parables (5-Rule Lettering Guard)',
            body: 'Enforces zero face occlusion and negative-space gutter docking automatically.',
            imageUrl: PRESET_HERO_PLATES[7].url,
            accentColor: '#D40055',
            linkedTool: 'COMIC_PANEL',
          },
        ],
      };

    case 'AMBO_VISUALIZER_STAGE': {
      const build = WORSHIP_COUNCIL_BUILDS['calm-04-candlelit-vigil'];
      return {
        id,
        template,
        eyebrow: `AMBO COUNCIL BUILD #${build.number} · ${build.director.toUpperCase()}`,
        title: build.title,
        subtitle: build.idea,
        handwrittenCallout: `counterpoint by ${build.counterpoint} · edited by ${build.editor}`,
        ctaPrimaryLabel: 'Launch Fullscreen Visualizer',
        ctaPrimaryTarget: AppView.PLAJAH_ELEVATE,
        ctaSecondaryLabel: 'Customize in Plajah Pixels',
        ctaSecondaryTarget: AppView.PLAJAH_PIXELS,
        backgroundUrl: PRESET_HERO_PLATES[2].url,
        gradientPreset: 'sanctuary_gold',
        visualizerPreset: 'calm-04-candlelit-vigil',
        councilDirectorId: 'BAROQUE',
        councilNote: build.quotes[0]?.line || build.direction.slice(0, 180),
        cards: [
          {
            id: `${id}_v1`,
            badge: 'GEOMETRY & PLANES',
            title: 'Golden Section 3-Register Elevation',
            body: build.geometry.slice(0, 160) + '…',
            accentColor: '#FF8C00',
            linkedTool: 'AMBO_STAGE',
          },
          {
            id: `${id}_v2`,
            badge: 'TYPOGRAPHY & LYRIC BAND',
            title: '40m Sanctuary Projection Hierarchy',
            body: build.typography.slice(0, 160) + '…',
            accentColor: '#D0BCFF',
            linkedTool: 'AMBO_STAGE',
          },
        ],
      };
    }

    case 'BENTO_PILLAR_GRID':
      return {
        id,
        template,
        eyebrow: 'PLAJAH DESIGN LANGUAGE · BENTO ARCHITECTURE',
        title: 'Built on Glass Elevation, Specular Hairlines & Living Color',
        subtitle:
          'Every card adheres automatically to --pj-radius-lg (24px), Outfit display headers, and Plajah purple-magenta-orange warmth.',
        handwrittenCallout: 'zero code required — edit any pillar inline',
        ctaPrimaryLabel: 'Explore All Pillars',
        ctaPrimaryTarget: AppView.PLAJAH_ELEVATE,
        backgroundUrl: PRESET_HERO_PLATES[5].url,
        gradientPreset: 'spatial',
        visualizerPreset: 'NONE',
        councilDirectorId: director.id,
        councilNote: `${director.epithet}: "${director.voice}"`,
        cards: [
          {
            id: `${id}_p1`,
            badge: '01 · SANCTUARY',
            title: 'Sacred Broadcast & Stage',
            body: 'Zero-latency lyric projection, scripture lower-thirds, and congregation watch parties.',
            accentColor: '#FF8C00',
          },
          {
            id: `${id}_p2`,
            badge: '02 · FELLOWSHIP',
            title: 'Small Groups & Prayer Circles',
            body: 'Private moderated rooms with live audio, shared scripture reading, and care chains.',
            accentColor: '#D40055',
          },
          {
            id: `${id}_p3`,
            badge: '03 · STEWARDSHIP',
            title: 'Transparent Giving & Alms Ledger',
            body: 'Instant tithe, mission fund goals, and community patronage with zero platform friction.',
            accentColor: '#00DAF3',
          },
        ],
      };

    case 'EDITORIAL_CALLOUT_BANNER':
    default:
      return {
        id,
        template: 'EDITORIAL_CALLOUT_BANNER',
        eyebrow: 'COUNCIL EDITORIAL BRIEF',
        title: 'Every Tradition Has a Home on the Stage.',
        subtitle:
          'From historic cathedrals and gospel tabernacles to house fellowships and contemplative study circles.',
        handwrittenCallout: 'welcome home to the living sanctuary',
        ctaPrimaryLabel: 'Claim Your Sanctuary',
        ctaPrimaryTarget: AppView.PLAJAH_ELEVATE,
        ctaSecondaryLabel: 'Open Admin Studio',
        ctaSecondaryTarget: AppView.ADMIN,
        backgroundUrl: PRESET_HERO_PLATES[4].url,
        gradientPreset: 'ember',
        visualizerPreset: 'NONE',
        councilDirectorId: director.id,
        councilNote: `${director.epithet}: "${director.questions[0]}"`,
        cards: [],
      };
  }
}

// ── Platform Councils Deliberation Helper for Admins ─────────────────────────

export interface AdminCouncilDeliberation {
  councilId: string;
  councilName: string;
  leadDirector: string;
  counterpointDirector: string;
  editorDirector: string;
  headlineSuggestion: string;
  subtitleSuggestion: string;
  handwrittenSuggestion: string;
  gradientSuggestion: PlajahGradientPreset;
  visualizerSuggestion: PlajahVisualizerPreset;
  critique: string;
  ruleChecklist: string[];
}

export function runAdminCouncilDeliberation(
  councilId: 'ART_DIRECTORS' | 'AMBO_WORSHIP' | 'LIVING_BOOK_COMPOSER' | 'COMIC_SAFE_ZONE' | 'LECTIO_EDITORIAL',
  currentHeadline: string
): AdminCouncilDeliberation {
  switch (councilId) {
    case 'AMBO_WORSHIP': {
      const builds = Object.values(WORSHIP_COUNCIL_BUILDS);
      const pick = builds[Math.floor(Math.random() * Math.min(5, builds.length))] || builds[0];
      return {
        councilId,
        councilName: 'Stage Sanctuary Visualizer Council',
        leadDirector: pick.director,
        counterpointDirector: pick.counterpoint,
        editorDirector: pick.editor,
        headlineSuggestion: pick.title,
        subtitleSuggestion: pick.idea,
        handwrittenSuggestion: `cantus firmus · ${pick.director.toLowerCase()}`,
        gradientSuggestion: 'sanctuary_gold',
        visualizerSuggestion: (pick.id as PlajahVisualizerPreset) || 'calm-01-gethsemane-olive-dusk',
        critique: pick.direction.slice(0, 280) + '…',
        ruleChecklist: [
          'Single declared polar light-source governs all shadow offsets and bokeh seeds',
          'Text-safe dimming band holds 4.5:1 AA contrast for 40m congregation reading',
          'Harmonic swell modulates concept plate blend smoothly without strobing',
        ],
      };
    }

    case 'LIVING_BOOK_COMPOSER': {
      const scorer = COMPOSER_PERSONAS.SCORER;
      const song = COMPOSER_PERSONAS.CHILDRENS_SONG;
      const wellbeing = COMPOSER_PERSONAS.WELLBEING;
      return {
        councilId,
        councilName: 'Living Book & Melos Composer Council',
        leadDirector: scorer.name,
        counterpointDirector: song.name,
        editorDirector: wellbeing.name,
        headlineSuggestion: 'Stories That Breathe With the Turn of Every Page.',
        subtitleSuggestion:
          'Scored with Melos harmonic progressions that yield under narration, swell on the emotional peak, and rest in articulate silence.',
        handwrittenSuggestion: 'where music joins, thins, and leaves room for the word',
        gradientSuggestion: 'ethereal',
        visualizerSuggestion: 'calm-02-galilee-dawn-waters',
        critique: `${scorer.lens} Counterbalanced by ${song.name}: "${song.protects}"`,
        ruleChecklist: [
          'Narration auto-ducking preserves vocal intelligibility on read-aloud pages',
          'Age-banded velocity, tempo, and density caps audited per cue',
          'Silent pages placed intentionally before emotional climax pages',
        ],
      };
    }

    case 'COMIC_SAFE_ZONE':
      return {
        councilId,
        councilName: 'Comic & Graphic Novel Lettering Council',
        leadDirector: 'The Classical Mind (Layout)',
        counterpointDirector: 'The Baroque Dramatist (Staging)',
        editorDirector: 'The Radical Minimalist (Gutter Guard)',
        headlineSuggestion: 'Visual Parables & Sequential Art With Sacred Framing.',
        subtitleSuggestion:
          'Every panel honors the 5 Non-Negotiable Lettering Safe-Zone Rules: zero face occlusion, open action corridors, and perimeter negative-space docking.',
        handwrittenSuggestion: 'never cover the eyes or the gesture — let the art speak',
        gradientSuggestion: 'brand',
        visualizerSuggestion: 'NONE',
        critique:
          'Audited against comic-balloon-placement rules: speech balloons and captions dock strictly to top/bottom gutter rails or perimeter negative space.',
        ruleChecklist: [
          'RULE 1: No Face Occlusion (x: 26%–74%, y: 12%–56% protected)',
          'RULE 2: No Key-Action Corridor Occlusion (x: 22%–78%, y: 18%–78% clear)',
          'RULE 3 & 4: Negative-Space & Close-Up Chin/Gutter Rail Docking (y >= 72% or y <= 4%)',
          'RULE 5: Directional Tail Vectoring bridges negative space to speaker',
        ],
      };

    case 'LECTIO_EDITORIAL':
      return {
        councilId,
        councilName: 'Verse & World-Eclectic Sanctuary Council',
        leadDirector: COUNCIL_LIST[3].epithet, // World-Eclectic Traveller
        counterpointDirector: COUNCIL_LIST[0].epithet, // Classical Mind
        editorDirector: COUNCIL_LIST[5].epithet, // Radical Minimalist
        headlineSuggestion: 'Many Traditions. One Reverent Table of Fellowship.',
        subtitleSuggestion:
          'Honoring Christian Churches, Gospel Tabernacles, Synagogues, Masjids, Dharma Sanghas, and Philosophic Study Circles with authentic provenance.',
        handwrittenSuggestion: 'every house of prayer welcomed in its own voice',
        gradientSuggestion: 'warm',
        visualizerSuggestion: 'calm-03-cathedral-clerestory',
        critique: `${COUNCIL_LIST[3].voice} Question: "${COUNCIL_LIST[3].questions[0]}"`,
        ruleChecklist: [
          'Honors specific liturgical terminology for each sanctuary door',
          'Pairs Outfit display headlines with warm editorial body measure (60–72ch)',
          'Maintains Plajah Glass L2/L3 hierarchy with zero ad-tech clutter',
        ],
      };

    case 'ART_DIRECTORS':
    default: {
      const lead = COUNCIL_LIST[4]; // Baroque Dramatist
      const counter = COUNCIL_LIST[2]; // Futurist
      const editor = COUNCIL_LIST[5]; // Radical Minimalist
      return {
        councilId: 'ART_DIRECTORS',
        councilName: 'Aria Council of 6 Art Directors',
        leadDirector: lead.epithet,
        counterpointDirector: counter.epithet,
        editorDirector: editor.epithet,
        headlineSuggestion: currentHeadline
          ? `${currentHeadline.replace(/\.$/, '')} — Illuminated.`
          : 'Step Into the Living Sanctuary.',
        subtitleSuggestion:
          'Designed in the Plajah Design Language: deep obsidian-plum canvas, warm magenta-to-amber stage light, and tactile glass surfaces.',
        handwrittenSuggestion: 'where light and fellowship gather together',
        gradientSuggestion: 'warm',
        visualizerSuggestion: 'calm-04-candlelit-vigil',
        critique: `${lead.epithet}: "${lead.questions[0]}" | ${editor.epithet}: "${editor.questions[0]}"`,
        ruleChecklist: [
          'Enforces Plajah brand gradient (--pj-grad-warm) on primary stage CTAs',
          'Uses Outfit 800–900 display weight with tight -0.03em tracking',
          'Applies 1px rgba(255,255,255,0.08) specular border across all bento cards',
        ],
      };
    }
  }
}
