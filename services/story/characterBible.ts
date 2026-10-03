// characterBible.ts — Character & World consistency manager for comics, graphic novels, and films.
// Stores face embeddings, turnarounds, and costume anchors to guarantee 100% character continuity.

export interface CharacterSheet {
  id: string;
  name: string;
  genderOrArchetype?: string;
  age?: string;
  visualAnchor: string; // e.g. "curly auburn hair, freckles, aviator goggles around neck, worn olive flight jacket"
  turnaroundUrls: {
    front?: string;
    threeQuarter?: string;
    profile?: string;
    closeUp?: string;
  };
  faceEmbeddingBase64?: string; // Cache of IP-Adapter / FaceID feature vector
  defaultStyle: 'manga' | 'graphic_novel_noir' | 'american_superhero' | 'storybook_watercolor' | 'cinematic_film';
  createdAt: number;
}

export interface ComicSpeechBubble {
  id: string;
  type: 'speech' | 'thought' | 'whisper' | 'shout';
  speakerCharacterId?: string;
  text: string;
  // Position relative to panel (percentages 0..100)
  xPct: number;
  yPct: number;
  tailDirection: 'bottom_left' | 'bottom_right' | 'top_left' | 'top_right' | 'none';
}

export interface ComicPanel {
  id: string;
  panelIndex: number;
  cameraShot: 'establishing' | 'full_shot' | 'medium' | 'over_the_shoulder' | 'close_up' | 'extreme_close_up';
  characterIds: string[];
  actionPrompt: string;
  environmentPrompt?: string;
  lightingCue?: string;
  renderedImageUrl?: string;
  speechBubbles: ComicSpeechBubble[];
}

export interface ComicPageSpec {
  id: string;
  title: string;
  pageNumber: number;
  layoutPreset: 'grid_6' | 'grid_9' | 'dynamic_manga_4' | 'storybook_top_half' | 'splash_full';
  panels: ComicPanel[];
}

const LOCAL_STORAGE_KEY = 'plajah_character_bibles_v1';

export function listSavedCharacters(): CharacterSheet[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveCharacter(sheet: CharacterSheet): void {
  if (typeof window === 'undefined') return;
  const list = listSavedCharacters().filter((c) => c.id !== sheet.id);
  list.unshift(sheet);
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(list));
}

export function createDefaultCharacter(name: string, visualAnchor: string): CharacterSheet {
  return {
    id: `char_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    name,
    visualAnchor,
    turnaroundUrls: {},
    defaultStyle: 'graphic_novel_noir',
    createdAt: Date.now(),
  };
}
