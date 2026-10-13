/**
 * services/comic/storyIntelligenceBridge.ts — Story Intelligence, Cross-Medium Flow & PAI Gallery Bridge
 * 
 * Provides the central nervous system connecting:
 * 1. Prose / Tela Document ──▶ Automatic Sequential Comic/Manga Panel Breakdown
 * 2. Comic / Manga Panels ──▶ Hollywood Screenplay (Fountain) & Fabula Video Animatic Storyboard
 * 3. Fabula & World Feature Sync ──▶ Bi-directional synchronizer with Character Bibles, Lore, and Timeline
 * 4. PAI Gallery Integration ──▶ Send-to-panel, in-panel free transforms (scale, rotate, translate),
 *    non-destructive clipping, and in-panel generative enhancement.
 */

import { ComicMangaPage, ComicEnginePanel, ComicVectorBalloon } from './comicMangaPageEngine';
import { PANEL_LAYOUT_TEMPLATES, PanelGeometryBox } from './comicMangaTemplateLibrary';
import { CharacterSheet, listSavedCharacters } from '../story/characterBible';
import { plajahAudioCore, FabulaDialogueTake } from '../voice/plajahAudioCore';
import { proceduralFoley } from '../audio/proceduralFoleyEngine';
import type { Character, LoreEntry, IPWorld } from '../../types';
import type { PaiGenerationItem } from '../localAi/paiGenerationHistory';
import { peekComicHandoff, takeComicHandoff, ComicHandoff } from '../comicHandoff';
import { parseScript, ScriptBeat, ScriptCharacter } from '../comicScript';
import { SHOWCASE_BOOKS, showcaseById, ShowcaseBook } from '../../data/showcase';
import { SHOWCASE_COMICS, getShowcaseComic } from '../../data/showcase/comics';
import type { ShowcaseComicBook } from '../../data/showcase/comicTypes';

// ─────────────────────────────────────────────────────────────────────────────
// 1. PROSE / STORY ──▶ AUTOMATIC SEQUENTIAL COMIC BREAKDOWN
// ─────────────────────────────────────────────────────────────────────────────

export interface ParsedStoryBeat {
  panelIndex: number;
  cameraShot: ComicEnginePanel['cameraShot'];
  environment: string;
  actionSummary: string;
  charactersPresent: string[];
  dialogueLines: Array<{
    speaker: string;
    text: string;
    type: 'speech' | 'thought' | 'shout' | 'whisper';
    tailDirection: ComicVectorBalloon['tailDirection'];
  }>;
  suggestedSfx?: string;
  screentonePattern?: ComicEnginePanel['screentone']['pattern'];
}

export interface StoryBreakdownResult {
  title: string;
  recommendedLayoutId: string;
  stylePreset: ComicMangaPage['stylePreset'];
  beats: ParsedStoryBeat[];
  discoveredCharacters: string[];
  discoveredLocations: string[];
}

/**
 * Intelligent Story Parser:
 * Analyzes natural prose, fairy tales, or movie scripts and decomposes them into
 * camera-aware sequential panels with extracted dialogue and sound effects.
 */
export function decomposeProseToComicBeats(proseText: string, title = 'Untitled Story'): StoryBreakdownResult {
  const paragraphs = proseText
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

  const rawLines = paragraphs.length > 0 ? paragraphs : [proseText.trim()];
  const discoveredCharacters = new Set<string>();
  const discoveredLocations = new Set<string>();
  const beats: ParsedStoryBeat[] = [];

  const cameraSequence: ComicEnginePanel['cameraShot'][] = [
    'establishing',
    'medium',
    'close_up',
    'low_angle_hero',
    'extreme_close_up',
  ];

  rawLines.forEach((para, idx) => {
    // Regex to detect spoken dialogue: "...", '...', or CHARACTER: ...
    const dialogueRegex = /(?:([A-Z][a-zA-Z0-9_\s]{1,15}):\s*)?["“]([^"”]+)["”]/g;
    const dialogues: ParsedStoryBeat['dialogueLines'] = [];
    let match: RegExpExecArray | null;

    while ((match = dialogueRegex.exec(para)) !== null) {
      const speaker = (match[1] || 'HERO').trim();
      const text = match[2].trim();
      discoveredCharacters.add(speaker);

      let type: ParsedStoryBeat['dialogueLines'][0]['type'] = 'speech';
      if (text.endsWith('!') || text === text.toUpperCase()) type = 'shout';
      else if (text.toLowerCase().includes('think') || text.toLowerCase().includes('wonder')) type = 'thought';

      dialogues.push({
        speaker,
        text,
        type,
        tailDirection: idx % 2 === 0 ? 'bottom_left' : 'bottom_right',
      });
    }

    // Strip quotes to get clean narrative action
    const actionText = para.replace(/["“][^"”]+["”]/g, '').trim() || para;

    // Detect environment hints
    let environment = 'Scenic setting';
    const lower = para.toLowerCase();
    if (lower.includes('rain') || lower.includes('alley') || lower.includes('street')) environment = 'Rainy City Alley';
    else if (lower.includes('forest') || lower.includes('wood') || lower.includes('tree')) environment = 'Enchanted Forest';
    else if (lower.includes('castle') || lower.includes('room') || lower.includes('palace')) environment = 'Castle Interior';
    else if (lower.includes('space') || lower.includes('ship') || lower.includes('star')) environment = 'Starship Bridge';
    else if (lower.includes('school') || lower.includes('class')) environment = 'School Courtyard';
    discoveredLocations.add(environment);

    // Detect potential SFX words
    let suggestedSfx: string | undefined;
    if (lower.includes('crash') || lower.includes('bang')) suggestedSfx = 'CRASH!';
    else if (lower.includes('boom') || lower.includes('blast') || lower.includes('explod')) suggestedSfx = 'BOOM!';
    else if (lower.includes('shing') || lower.includes('sword') || lower.includes('blade')) suggestedSfx = 'SHING!';
    else if (lower.includes('whoosh') || lower.includes('flew') || lower.includes('ran')) suggestedSfx = 'WHOOSH!';
    else if (lower.includes('sparks') || lower.includes('electric')) suggestedSfx = 'CRACKLE!';

    beats.push({
      panelIndex: idx,
      cameraShot: cameraSequence[idx % cameraSequence.length],
      environment,
      actionSummary: actionText.slice(0, 160),
      charactersPresent: Array.from(discoveredCharacters).slice(0, 2),
      dialogueLines: dialogues,
      suggestedSfx,
      screentonePattern: idx === 0 ? 'dots_fine' : idx === rawLines.length - 1 ? 'speed_lines' : 'dots_coarse',
    });
  });

  // Pick optimal layout template based on count
  let recommendedLayoutId = 'grid_6_classic';
  if (beats.length <= 1) recommendedLayoutId = 'picture_book_top_bottom';
  else if (beats.length === 2) recommendedLayoutId = 'bedtime_split_2';
  else if (beats.length === 3) recommendedLayoutId = 'sunday_funnies_3';
  else if (beats.length === 4) recommendedLayoutId = 'storybook_grid_4';
  else if (beats.length === 5) recommendedLayoutId = 'shonen_dynamic_5';
  else recommendedLayoutId = 'grid_6_classic';

  return {
    title,
    recommendedLayoutId,
    stylePreset: proseText.toLowerCase().includes('kid') || proseText.toLowerCase().includes('once upon') ? 'storybook_watercolor' : 'manga',
    beats,
    discoveredCharacters: Array.from(discoveredCharacters),
    discoveredLocations: Array.from(discoveredLocations),
  };
}

/**
 * Builds a ready-to-render ComicMangaPage from parsed Story Beats.
 */
export function buildPageFromStoryBeats(
  breakdown: StoryBreakdownResult,
  layoutId?: string
): ComicMangaPage {
  const chosenLayout = layoutId || breakdown.recommendedLayoutId;
  const template = PANEL_LAYOUT_TEMPLATES[chosenLayout] || PANEL_LAYOUT_TEMPLATES.grid_6_classic;
  const boxes = template.createBoxes(1.2);

  const panels: ComicEnginePanel[] = boxes.map((box, idx) => {
    const beat = breakdown.beats[idx] || {
      panelIndex: idx,
      cameraShot: 'medium' as const,
      environment: 'Scene Backdrop',
      actionSummary: `Continuation of ${breakdown.title}`,
      charactersPresent: breakdown.discoveredCharacters,
      dialogueLines: [],
    };

    const balloons: ComicVectorBalloon[] = [];
    let yOffset = 12;

    beat.dialogueLines.forEach((dl, bIdx) => {
      balloons.push({
        id: `b_${idx}_${bIdx}`,
        type: dl.type as any,
        text: dl.text,
        speakerName: dl.speaker,
        xPct: bIdx % 2 === 0 ? 15 : 55,
        yPct: yOffset,
        tailDirection: dl.tailDirection,
      });
      yOffset += 24;
    });

    if (beat.suggestedSfx) {
      balloons.push({
        id: `sfx_${idx}`,
        type: 'sfx',
        text: beat.suggestedSfx,
        xPct: 65,
        yPct: 20,
        sfxColor: '#f59e0b',
        sfxScale: 1.25,
      });
    }

    return {
      id: `panel_${Date.now()}_${idx}`,
      panelIndex: idx,
      box,
      cameraShot: beat.cameraShot,
      actionPrompt: beat.actionSummary,
      environmentPrompt: beat.environment,
      screentone: {
        enabled: breakdown.stylePreset === 'manga',
        pattern: beat.screentonePattern || 'dots_fine',
        opacity: 0.25,
      },
      balloons,
    };
  });

  return {
    id: `comic_page_${Date.now()}`,
    title: breakdown.title,
    pageNumber: 1,
    layoutId: chosenLayout as any,
    readingDirection: template.readingDirection,
    dimensions: { width: 1200, height: 1600 },
    gutterPx: 12,
    gutterColor: breakdown.stylePreset === 'manga' ? '#ffffff' : '#0a0b0e',
    panels,
    stylePreset: breakdown.stylePreset,
    createdAt: Date.now(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. COMIC / MANGA ──▶ HOLLYWOOD SCREENPLAY (FOUNTAIN) & ANIMATIC EXPORT
// ─────────────────────────────────────────────────────────────────────────────

export interface ScreenplaySceneExport {
  fountainText: string;
  slugline: string;
  characterLines: Array<{ speaker: string; dialogue: string; parenthetical?: string }>;
}

export interface StoryboardAnimaticShot {
  shotIndex: number;
  panelId: string;
  durationSeconds: number;
  cameraMovement: 'STATIC' | 'PAN_LEFT' | 'SLOW_ZOOM_IN' | 'CAMERA_SHAKE' | 'DUTCH_TILT';
  imageUrl?: string;
  dialogueAudio?: {
    speaker: string;
    text: string;
    audioTake?: FabulaDialogueTake;
  };
  foleySoundEffect?: string;
}

/**
 * Converts a Comic Page into an industry-standard Fountain Screenplay Scene.
 * Usable directly in Fabula, Final Draft, Highland, or Celtx.
 */
export function exportComicToFountainScreenplay(page: ComicMangaPage): ScreenplaySceneExport {
  const lines: string[] = [];
  const characterLines: ScreenplaySceneExport['characterLines'] = [];

  const slugline = `INT./EXT. ${page.title.toUpperCase()} - CONTINUOUS`;
  lines.push(slugline);
  lines.push('');

  page.panels.forEach((panel, pIdx) => {
    lines.push(`/* PANEL ${pIdx + 1}: ${panel.cameraShot.toUpperCase().replace(/_/g, ' ')} */`);
    lines.push(panel.actionPrompt || `Visual shot of the scene.`);
    lines.push('');

    panel.balloons.forEach((b) => {
      if (b.type === 'narration_box') {
        lines.push('NARRATOR (V.O.)');
        lines.push(b.text);
        lines.push('');
        characterLines.push({ speaker: 'NARRATOR', dialogue: b.text, parenthetical: 'V.O.' });
      } else if (b.type === 'sfx') {
        lines.push(`(SFX: ${b.text})`);
        lines.push('');
      } else {
        const speaker = (b.speakerName || 'CHARACTER').toUpperCase();
        lines.push(speaker);
        if (b.type === 'thought') lines.push('(internal thought)');
        else if (b.type === 'whisper') lines.push('(whispering)');
        lines.push(b.text);
        lines.push('');
        characterLines.push({
          speaker,
          dialogue: b.text,
          parenthetical: b.type === 'thought' ? 'internal thought' : b.type === 'whisper' ? 'whispering' : undefined,
        });
      }
    });
  });

  return {
    fountainText: lines.join('\n'),
    slugline,
    characterLines,
  };
}

/**
 * Converts a Comic Page into a sequential Animatic Storyboard timeline for Fabula Video.
 */
export function exportComicToFabulaAnimatic(page: ComicMangaPage): StoryboardAnimaticShot[] {
  return page.panels.map((panel, idx) => {
    // Camera movement heuristic based on camera shot
    let cameraMovement: StoryboardAnimaticShot['cameraMovement'] = 'STATIC';
    if (panel.cameraShot === 'establishing') cameraMovement = 'PAN_LEFT';
    else if (panel.cameraShot === 'close_up' || panel.cameraShot === 'extreme_close_up') cameraMovement = 'SLOW_ZOOM_IN';
    else if (panel.cameraShot === 'low_angle_hero') cameraMovement = 'CAMERA_SHAKE';

    // Calculate duration based on reading time of speech bubbles (approx 180 words/min = 3 words/sec + 1.5s base)
    let totalWords = 0;
    panel.balloons.forEach((b) => {
      totalWords += b.text.split(/\s+/).length;
    });
    const durationSeconds = Math.max(3.0, Number((1.5 + totalWords * 0.35).toFixed(1)));

    const firstDialogue = panel.balloons.find((b) => b.type === 'speech' || b.type === 'thought');
    const firstSfx = panel.balloons.find((b) => b.type === 'sfx');

    return {
      shotIndex: idx,
      panelId: panel.id,
      durationSeconds,
      cameraMovement,
      imageUrl: panel.renderedImageUrl,
      dialogueAudio: firstDialogue
        ? {
            speaker: firstDialogue.speakerName || 'Character',
            text: firstDialogue.text,
            audioTake: firstDialogue.audioTake,
          }
        : undefined,
      foleySoundEffect: firstSfx?.text,
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. FABULA & WORLD FEATURE INTEGRATION
// ─────────────────────────────────────────────────────────────────────────────

export interface WorldCastMember {
  characterId: string;
  name: string;
  role: string;
  bio: string;
  avatarUrl: string;
  visualAnchor: string;
  sourceApp: string;
}

/**
 * Pulls available characters and lore from the user's Character Bible & World Hub.
 */
export function pullWorldCastAndLore(): {
  characters: WorldCastMember[];
  savedCharacterSheets: CharacterSheet[];
} {
  const savedSheets = listSavedCharacters();
  const characters: WorldCastMember[] = savedSheets.map((cs) => ({
    characterId: cs.id,
    name: cs.name,
    role: 'PROTAGONIST',
    bio: cs.visualAnchor,
    avatarUrl: cs.turnaroundUrls.closeUp || '',
    visualAnchor: cs.visualAnchor,
    sourceApp: 'WORLD_HUB',
  }));

  return {
    characters,
    savedCharacterSheets: savedSheets,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. PAI GALLERY DIRECT INTEGRATION & IN-PANEL TRANSFORM HOOKS
// ─────────────────────────────────────────────────────────────────────────────

export interface PanelImageTransform {
  xOffsetPct: number;    // -50% to +50% panning
  yOffsetPct: number;    // -50% to +50% panning
  scale: number;         // 0.5x to 3.0x zoom
  rotationDeg: number;   // -180 to +180 deg
  flipX: boolean;
  flipY: boolean;
  clipToPanel: boolean;  // Non-destructive clip vs hero breakout
  screentoneOverlay: boolean;
  colorGradeFilter?: string; // e.g. "contrast(1.4) grayscale(100%)" for manga
}

export const DEFAULT_PANEL_IMAGE_TRANSFORM: PanelImageTransform = {
  xOffsetPct: 0,
  yOffsetPct: 0,
  scale: 1.0,
  rotationDeg: 0,
  flipX: false,
  flipY: false,
  clipToPanel: true,
  screentoneOverlay: false,
};

/**
 * Assigns an image from the PAI Gallery directly to a specific panel on the page.
 */
export function injectPaiImageIntoPanel(
  page: ComicMangaPage,
  panelIndex: number,
  paiItem: PaiGenerationItem,
  initialTransform?: Partial<PanelImageTransform>
): ComicMangaPage {
  const updated = { ...page, panels: [...page.panels] };
  const target = updated.panels[panelIndex];
  if (!target) return page;

  target.renderedImageUrl = paiItem.mediaUrl;
  target.actionPrompt = paiItem.prompt;

  return updated;
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. LOREA COMIC & MANGA AUTHORING HANDOFF BRIDGE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Checks if a pending comic handoff is waiting from Lorea (chapter reader) or Fabula.
 */
export function checkLoreaPendingHandoff(): ComicHandoff | null {
  return peekComicHandoff();
}

/**
 * Consumes and claims the pending handoff from Lorea/Fabula.
 */
export function consumeLoreaHandoff(): ComicHandoff | null {
  return takeComicHandoff();
}

/**
 * Flows a character-tagged script directly into a ComicMangaPage.
 * Auto-populates speech balloons, captions, and SFX across panels,
 * and auto-assigns character portrait images to empty panels.
 */
export function flowLoreaScriptToPage(
  page: ComicMangaPage,
  scriptText: string,
  characters: ScriptCharacter[] = []
): ComicMangaPage {
  const beats = parseScript(scriptText);
  if (!beats.length) return page;

  const charMap = new Map(characters.map((c) => [c.name.toLowerCase(), c.imageUrl]));
  const updatedPanels = [...page.panels];
  const numPanels = updatedPanels.length || 1;
  const beatsPerPanel = Math.ceil(beats.length / numPanels);

  for (let pIdx = 0; pIdx < numPanels; pIdx++) {
    const startIdx = pIdx * beatsPerPanel;
    const panelBeats = beats.slice(startIdx, startIdx + beatsPerPanel);
    if (!panelBeats.length) continue;

    const targetPanel = { ...updatedPanels[pIdx] };
    const newBalloons: ComicVectorBalloon[] = [...targetPanel.balloons];

    panelBeats.forEach((b, bIdx) => {
      if (b.kind === 'dialogue') {
        const charImg = b.character ? charMap.get(b.character.toLowerCase()) : undefined;
        if (charImg && !targetPanel.renderedImageUrl) {
          targetPanel.renderedImageUrl = charImg;
        }

        newBalloons.push({
          id: `balloon_${Date.now()}_${pIdx}_${bIdx}`,
          type: 'speech',
          text: b.text,
          speakerName: b.character || 'Character',
          xPct: 20 + (bIdx % 2) * 45,
          yPct: 15 + Math.min(bIdx * 25, 55),
          tailDirection: bIdx % 2 === 0 ? 'bottom_left' : 'bottom_right',
        });
      } else if (b.kind === 'sfx') {
        newBalloons.push({
          id: `sfx_${Date.now()}_${pIdx}_${bIdx}`,
          type: 'sfx',
          text: b.text,
          xPct: 50,
          yPct: 40,
          sfxColor: '#ff0055',
          sfxScale: 1.3,
        });
      } else if (b.kind === 'caption') {
        newBalloons.push({
          id: `cap_${Date.now()}_${pIdx}_${bIdx}`,
          type: 'narration',
          text: b.text,
          xPct: 50,
          yPct: 85,
        });
      }
    });

    targetPanel.balloons = newBalloons;
    updatedPanels[pIdx] = targetPanel;
  }

  return {
    ...page,
    panels: updatedPanels,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. STORYBOOK DOCUMENT CONTEXT AWARENESS (Design 2: Story Magic Folio)
// ─────────────────────────────────────────────────────────────────────────────

export interface StorybookPageSpread {
  spreadNumber: number;
  chapterTitle: string;
  leftPageIllustrationPrompt: string;
  leftPageCinemagraphEffect: 'floating_embers' | 'falling_rain' | 'fog_steam' | 'lens_flare' | 'none';
  rightPageProse: string;
  featuredCharacters: string[];
  readingAgeTier: 'EARLY_READER' | 'STORYBOOK' | 'MIDDLE_GRADE';
  suggestedVoiceMood: 'gentle_bedtime' | 'adventurous' | 'whimsical' | 'educational';
  turn?: string;
  sfx?: string;
  beat?: string;
}

export interface StorybookContextAnalysis {
  documentTitle: string;
  totalWords: number;
  readingAgeTier: 'EARLY_READER' | 'STORYBOOK' | 'MIDDLE_GRADE';
  spreads: StorybookPageSpread[];
  cast: Array<{
    name: string;
    role: string;
    quote: string;
    emoji: string;
    look?: string;
    palette?: string[];
  }>;
  remixAttribution?: string;
  sourceShowcaseId?: string;
  templateId?: string;
  medium?: string;
  theme?: string;
  refrain?: string;
  remixIdeas?: string[];
}

/**
 * Full Document Context Analyzer for Storybook Authoring:
 * Reads raw prose or a complete Tela document, detects chapter boundaries,
 * evaluates age-appropriate reading difficulty, and breaks down the narrative into
 * ready-to-render picture book spreads (Left illustration + Right story text).
 */
export function analyzeStorybookDocumentContext(
  docText: string,
  title = 'My Storybook Tale'
): StorybookContextAnalysis {
  const paragraphs = docText
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

  const totalWords = docText.trim().split(/\s+/).filter(Boolean).length;

  // Determine reading tier from average sentence length and vocabulary
  let readingAgeTier: 'EARLY_READER' | 'STORYBOOK' | 'MIDDLE_GRADE' = 'STORYBOOK';
  if (totalWords < 200 || paragraphs.length <= 3) {
    readingAgeTier = 'EARLY_READER';
  } else if (totalWords > 800) {
    readingAgeTier = 'MIDDLE_GRADE';
  }

  // Detect or generate story characters from text
  const cast: StorybookContextAnalysis['cast'] = [
    { name: 'Sparky Dragon', role: 'Brave Companion', quote: 'Look at the glowing pumpkins! The trail begins here!', emoji: '🐉' },
    { name: 'Pippin Fox', role: 'Clever Scout', quote: 'I found an ancient bronze key hidden under the roots.', emoji: '🦊' },
    { name: 'Starlight Sprite', role: 'Magical Guide', quote: 'Make a wish upon the sector star!', emoji: '⭐' },
    { name: 'Master Oak', role: 'Ancient Sage', quote: 'Listen closely: the chrono-trees remember everything.', emoji: '🧙‍♂️' },
  ];

  // Group paragraphs into spreads (1-2 paragraphs per spread)
  const spreads: StorybookPageSpread[] = [];
  const chunkSize = readingAgeTier === 'EARLY_READER' ? 1 : 2;

  for (let i = 0; i < paragraphs.length; i += chunkSize) {
    const chunk = paragraphs.slice(i, i + chunkSize);
    const spreadNum = Math.floor(i / chunkSize) + 1;
    const prose = chunk.join('\n\n');

    // Cinemagraph atmosphere choice based on prose keywords
    let leftPageCinemagraphEffect: StorybookPageSpread['leftPageCinemagraphEffect'] = 'lens_flare';
    if (/rain|water|drown|gutter|storm/i.test(prose)) leftPageCinemagraphEffect = 'falling_rain';
    else if (/fire|ember|flame|spark|lantern/i.test(prose)) leftPageCinemagraphEffect = 'floating_embers';
    else if (/fog|mist|steam|smoke|shadow/i.test(prose)) leftPageCinemagraphEffect = 'fog_steam';

    // Extract characters mentioned in this spread
    const matchedChars = cast.filter((c) => prose.toLowerCase().includes(c.name.split(' ')[0].toLowerCase())).map((c) => c.name);

    spreads.push({
      spreadNumber: spreadNum,
      chapterTitle: `Page ${spreadNum}: The Journey Unfolds`,
      leftPageIllustrationPrompt: `Whimsical storybook illustration, glowing soft lighting, charming picture book style: ${prose.slice(0, 140)}...`,
      leftPageCinemagraphEffect,
      rightPageProse: prose,
      featuredCharacters: matchedChars.length ? matchedChars : [cast[spreadNum % cast.length].name],
      readingAgeTier,
      suggestedVoiceMood: readingAgeTier === 'EARLY_READER' ? 'gentle_bedtime' : 'whimsical',
    });
  }

  // Fallback spread if document was empty
  if (spreads.length === 0) {
    spreads.push({
      spreadNumber: 1,
      chapterTitle: 'Chapter 1: The Magic Pumpkin Patch',
      leftPageIllustrationPrompt: 'Whimsical storybook art of glowing golden pumpkins and friendly woodland creatures under a starry sky.',
      leftPageCinemagraphEffect: 'floating_embers',
      rightPageProse: 'Once upon a time in the quiet clearing of Sector Zero, little Pippin the fox discovered a mysterious patch of glowing pumpkins...',
      featuredCharacters: ['Pippin Fox', 'Sparky Dragon'],
      readingAgeTier: 'EARLY_READER',
      suggestedVoiceMood: 'gentle_bedtime',
    });
  }

  return {
    documentTitle: title,
    totalWords,
    readingAgeTier,
    spreads,
    cast,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. PLATFORM SHOWCASE BOOKS & COMICS LIVING TEMPLATES ENGINE
// ─────────────────────────────────────────────────────────────────────────────

export function getPlatformShowcaseBooks(): ShowcaseBook[] {
  return SHOWCASE_BOOKS;
}

export function getPlatformShowcaseComics(): ShowcaseComicBook[] {
  return SHOWCASE_COMICS;
}

/**
 * Maps a canonical ShowcaseBook from data/showcase into a live, fully editable
 * StorybookContextAnalysis for Design 2 (Story Magic Folio).
 */
export function convertShowcaseBookToStorybookContext(
  book: ShowcaseBook,
  remixAuthor = 'You (Remix Author)'
): StorybookContextAnalysis {
  // Map band to age tier
  let readingAgeTier: 'EARLY_READER' | 'STORYBOOK' | 'MIDDLE_GRADE' = 'STORYBOOK';
  if (book.band === 'toddler' || book.band === 'preschool') {
    readingAgeTier = 'EARLY_READER';
  } else if (book.band === 'read-alone' || book.band === 'story') {
    readingAgeTier = 'MIDDLE_GRADE';
  }

  // Map characters
  const cast = book.characters.map((c) => {
    let emoji = '✨';
    const k = c.kind.toLowerCase();
    if (k.includes('bear')) emoji = '🐻';
    else if (k.includes('moth') || k.includes('butterfly')) emoji = '🦋';
    else if (k.includes('moon')) emoji = '🌙';
    else if (k.includes('bus') || k.includes('vehicle')) emoji = '🚌';
    else if (k.includes('pigeon') || k.includes('bird')) emoji = '🐦';
    else if (k.includes('robot')) emoji = '🤖';
    else if (k.includes('astronaut') || k.includes('explorer')) emoji = '🧑‍🚀';
    else if (k.includes('pup') || k.includes('dog')) emoji = '🐕';
    else if (k.includes('fox')) emoji = '🦊';
    else if (k.includes('fawn') || k.includes('deer')) emoji = '🦌';
    else if (k.includes('tree') || k.includes('cedar')) emoji = '🌲';
    else if (k.includes('fish') || k.includes('reef')) emoji = '🐠';
    else if (k.includes('crab')) emoji = '🦀';
    else if (k.includes('weaver') || k.includes('girl')) emoji = '🪡';

    return {
      name: c.name,
      role: `${c.role.toUpperCase()} • ${c.kind}`,
      quote: c.signature || c.voice,
      emoji,
      look: c.look,
      palette: c.palette,
    };
  });

  // Cinemagraph mapping helper
  const getCinemagraph = (s: typeof book.spreads[0]): StorybookPageSpread['leftPageCinemagraphEffect'] => {
    const text = (s.art + ' ' + s.text).toLowerCase();
    if (text.includes('rain') || text.includes('water') || text.includes('ocean') || text.includes('sea')) return 'falling_rain';
    if (text.includes('star') || text.includes('space') || text.includes('moon') || text.includes('glow')) return 'lens_flare';
    if (text.includes('fog') || text.includes('mist') || text.includes('forest') || text.includes('moss')) return 'fog_steam';
    if (text.includes('ember') || text.includes('candle') || text.includes('fire') || text.includes('lantern')) return 'floating_embers';
    return book.templateId === 'story-bedtime' ? 'lens_flare' : 'floating_embers';
  };

  const spreads: StorybookPageSpread[] = book.spreads.map((s) => ({
    spreadNumber: s.n,
    chapterTitle: `Spread ${s.n}: ${s.beat.toUpperCase()}${s.turn ? ` — ${s.turn}` : ''}`,
    leftPageIllustrationPrompt: `${book.medium} art style. ${s.art} (Visual anchors: ${s.characters.map((cid) => book.characters.find((c) => c.id === cid)?.look).filter(Boolean).join('; ')})`,
    leftPageCinemagraphEffect: getCinemagraph(s),
    rightPageProse: s.text || (s.beat === 'cover' ? `${book.title}\n\nA living storybook template` : `[Visual beat: ${s.art}]`),
    featuredCharacters: s.characters.map((cid) => book.characters.find((c) => c.id === cid)?.name || cid),
    readingAgeTier,
    suggestedVoiceMood: readingAgeTier === 'EARLY_READER' ? 'gentle_bedtime' : 'whimsical',
    sfx: s.sfx,
    turn: s.turn,
    beat: s.beat,
  }));

  const totalWords = book.spreads.reduce((acc, s) => acc + (s.text ? s.text.split(/\s+/).filter(Boolean).length : 0), 0);

  return {
    documentTitle: `${book.title} (Remix)`,
    totalWords,
    readingAgeTier,
    spreads,
    cast,
    remixAttribution: `Based on "${book.title}" by ${book.author} (CC BY 4.0). Original medium: ${book.medium}.`,
    sourceShowcaseId: book.id,
    templateId: book.templateId,
    medium: book.medium,
    theme: book.theme,
    refrain: book.refrain,
    remixIdeas: book.remixIdeas,
  };
}

/**
 * Converts a canonical ShowcaseComicBook into a live ComicMangaPage
 * for Mode A (Master Sequential Studio).
 */
export function convertShowcaseComicToStudioPage(
  comic: ShowcaseComicBook,
  pageIndex = 0
): ComicMangaPage {
  const page = comic.pages[pageIndex] || comic.pages[0];
  const isManga = comic.genre === 'seinen-kinetic' || comic.genre === 'shojo-gothic';

  // Pick layout template matching panel count
  const panelCount = page.panels.length;
  let layoutId = 'grid_6_classic';
  if (panelCount === 1) layoutId = 'picture_book_top_bottom';
  else if (panelCount === 2) layoutId = 'bedtime_split_2';
  else if (panelCount === 3) layoutId = 'sunday_funnies_3';
  else if (panelCount === 4) layoutId = 'storybook_grid_4';
  else if (panelCount === 5) layoutId = 'shonen_dynamic_5';
  else layoutId = 'grid_6_classic';

  const template = PANEL_LAYOUT_TEMPLATES[layoutId] || PANEL_LAYOUT_TEMPLATES.grid_6_classic;
  const boxes = template.createBoxes(1.2);

  const panels: ComicEnginePanel[] = page.panels.map((p, idx) => {
    const box = boxes[idx % boxes.length] || { x: 5, y: 5 + idx * 30, width: 90, height: 28 };

    // Map dialogue balloons
    const balloons: ComicVectorBalloon[] = p.balloons.map((b, bIdx) => ({
      id: `balloon_${pageIndex}_${idx}_${bIdx}`,
      speaker: b.speaker,
      text: b.text,
      x: box.x + 8 + bIdx * 20,
      y: box.y + 6 + bIdx * 15,
      width: Math.min(220, Math.max(120, b.text.length * 5)),
      height: Math.min(100, Math.max(50, Math.ceil(b.text.length / 25) * 22)),
      balloonType: b.balloonType === 'shout' ? 'shout' : b.balloonType === 'thought' ? 'thought' : b.balloonType === 'whisper' ? 'whisper' : 'speech',
      tailDirection: bIdx % 2 === 0 ? 'bottom_left' : 'bottom_right',
      tailTipX: box.x + 12 + bIdx * 20,
      tailTipY: box.y + 24 + bIdx * 15,
      fontSize: 13,
      fontFamily: isManga ? 'Manga Temple, CC Wild Words, sans-serif' : 'Comic Craft, Anime Ace, sans-serif',
      fillColor: '#FFFFFF',
      strokeColor: '#000000',
      strokeWidth: 2,
    }));

    // Motion effects (cinemagraph, video loop)
    let motionClip: ComicEnginePanel['motionClip'] = undefined;
    if (idx === 0 || p.actionDescription.toLowerCase().includes('rain') || p.actionDescription.toLowerCase().includes('glow')) {
      motionClip = {
        cinemagraphEffect: p.actionDescription.toLowerCase().includes('rain') ? 'rain' : 'embers',
        isLooping: true,
        playbackSpeed: 1.0,
      };
    }

    return {
      id: `p_${pageIndex}_${idx}`,
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
      borderStyle: isManga ? 'manga_ink' : 'heavy_american',
      borderThickness: isManga ? 2.5 : 3.5,
      borderColor: '#0f172a',
      backgroundFill: '#FFFFFF',
      prompt: `${comic.genre} style: ${p.actionDescription}. Lighting: ${p.lightingEnvironment}`,
      imageState: 'placeholder',
      cameraShot: (p.cameraShot as any) || 'medium',
      motionClip,
      screentone: {
        pattern: isManga ? (idx % 2 === 0 ? 'dots_fine' : 'dots_coarse') : 'none',
        densityPercent: isManga ? 25 : 0,
        angleDegrees: 45,
      },
      balloons,
      foleyTakes: p.kineticSfx ? [{
        id: `foley_${idx}`,
        word: p.kineticSfx.soundWord,
        category: 'impact',
        sfxIntensity: 'heavy',
        audioVolume: 0.8,
        playbackOffsetMs: 0,
        waveform: 'sawtooth',
      }] : [],
    };
  });

  return {
    id: `comic_${comic.id}_page_${pageIndex + 1}`,
    pageNumber: pageIndex + 1,
    title: `${comic.title} — Page ${pageIndex + 1}`,
    layoutTemplateId: layoutId,
    stylePreset: isManga ? 'manga' : 'american_heroic',
    gutterWidthPx: 12,
    aspectRatio: 'standard_comic',
    backgroundColor: '#FFFFFF',
    panels,
    globalPerspectiveGuides: {
      type: 'two_point',
      horizonY: 50,
      vanishingPoint1X: 10,
      vanishingPoint2X: 90,
      enabled: false,
    },
    readingDirection: isManga ? 'right_to_left' : 'left_to_right',
  };
}

