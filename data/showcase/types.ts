// Showcase picture books: the STORY lives here as data, separate from the layout. A Tela children's-book template (services/tela/designs/publications/*)
// reads its book from this registry by template id, so a remixer can change the words, names and characters and the same designs carry the new story.
// Everything here is original to Plajah and released under a Creative Commons licence so anyone may remix it.

export type Beat =
  | 'cover' | 'hero' | 'vignette' | 'strip' | 'quiet' | 'reveal' | 'panorama' | 'activity' | 'closing' | 'back';

export interface ShowcaseCharacter {
  id: string;
  name: string;
  /** What it is: "small honey-brown bear". */
  kind: string;
  role: 'hero' | 'companion' | 'supporting' | 'chorus';
  /** 3 to 5 personality words; drives voice and expressions. */
  personality: string[];
  /** LOCKED visual descriptor: every illustration, template and generation must follow this exact wording (Character Bible rule: one likeness everywhere). */
  look: string;
  /** Palette (hex) the character is always drawn in. */
  palette: string[];
  /** How the character talks, in one line. */
  voice: string;
  /** A repeatable gesture, sound or catchphrase that makes the character recognisable. */
  signature: string;
  /** Where the character starts and where they end. */
  arc: string;
}

export interface ShowcaseSpread {
  /** 1-based reading order including cover (1) and back cover (last). */
  n: number;
  beat: Beat;
  /** The exact words on the page (blank for pure-art pages). Use \n for deliberate line breaks. */
  text: string;
  /** What the picture shows (for the illustrator/designer and for generation prompts). */
  art: string;
  /** Character ids that appear on this page. */
  characters: string[];
  /** What this page sets up for the page turn. */
  turn?: string;
  /** Optional sound word lettered into the art. */
  sfx?: string;
}

export interface ShowcaseBook {
  id: string;
  /** The Tela template this book is laid out with (services/telaPublicationTemplates.ts). */
  templateId: string;
  title: string;
  /** Short, shelf-friendly summary (also the back-cover blurb). */
  blurb: string;
  logline: string;
  ageMin: number;
  ageMax: number;
  /** Reading band for the metric checks. */
  band: 'toddler' | 'preschool' | 'early-picture' | 'picture' | 'read-alone' | 'story';
  medium: string;
  theme: string;
  /** The line that repeats; young listeners join in on it. */
  refrain?: string;
  author: string;
  /** Always disclose: these were written and structured with AI at Plajah's direction. */
  aiDisclosure: string;
  license: 'CC_BY';
  /** What a remixer is invited to change. */
  remixIdeas: string[];
  characters: ShowcaseCharacter[];
  spreads: ShowcaseSpread[];
  /** Questions a grown-up can ask while reading together. */
  discussion: string[];
  /** Hard words and what they mean, for the older books. */
  glossary?: Array<{ word: string; meaning: string }>;
}

export const SHOWCASE_AUTHOR = 'Plajah Story Studio';
export const SHOWCASE_AI_DISCLOSURE = 'Written and structured with AI (Claude, by Anthropic) at Plajah\'s direction. Illustrations are generated procedurally by Plajah\'s Tela design engine. No person\'s likeness or existing character is used.';
