// The nine disc-template concepts. Each one is a different STRUCTURE — navigation model, selection
// mark, scene layout, pop-up shape, light and motion — not a palette on a shared layout. The crews
// that direct them are cast from these asks (scripts/council/castDiscTemplateCrews.ts).
import type { DiscFormat } from '../spec';

export interface DiscConcept {
  id: string; name: string; blurb: string; formats: DiscFormat[];
  /** The structural idea, in one line. */
  concept: string;
  animationAsk: string; graphicAsk: string;
  /** Lighting director's plan (CINEMATIC seat). */
  lighting: string;
  /** Hand-pinned leads (castCrew `pinned`): animation lead + graphic designer. */
  pins: { anim: string; graphic: string };
  firstPlay: 'TOP_MENU' | 'PLAY_FEATURE'; popup: boolean;
}

export const DISC_CONCEPTS: DiscConcept[] = [
  { id: 'feature', pins: { anim: 'GOLDEN_AGE', graphic: 'MODERNIST_TITLE' }, name: 'Proscenium', formats: ['BD', 'UHD'], firstPlay: 'TOP_MENU', popup: true,
    blurb: 'Art Council lead: Classical. An architectural left bay, a gold rule that moves with the remote, a dado band for the pop-up.',
    concept: 'Navigation as architecture: a vertical bay on the left third, the film breathing in the open right two-thirds.',
    animationAsk: 'restrained classical title sequence, linear architectural transitions, measured timing, prestige drama',
    graphicAsk: 'modernist film title design, serif typography, rules and proportion, prestige cinema',
    lighting: 'Single motivated top-light from upper right, deep slate falloff into a 35% vignette; the gold bar is the only warm source.' },
  { id: 'collector4k', pins: { anim: 'ABSTRACT_LOOP', graphic: 'CHROME_80S' }, name: 'Light Slit', formats: ['UHD', 'BD'], firstPlay: 'TOP_MENU', popup: true,
    blurb: 'A black monolith with one vertical slit of HDR light; menu items hang off the slit and light up as the beam crosses them.',
    concept: 'Navigation as light: one vertical slit of light carries every item; the selected item is where the beam spills out.',
    animationAsk: 'light as material, slow luminous reveals, volumetric beams, minimal sculptural motion, luxury',
    graphicAsk: 'chrome broadcast ident, luxury minimal sculptural type, metallic sheen',
    lighting: 'Pure black ground; a narrow 1000-nit vertical slit with soft bloom; selection spills a horizontal beam; slow 12 s breathing of the slit.' },
  { id: 'boxset', pins: { anim: 'MINIATURE', graphic: 'EXPLAINER' }, name: 'Shelf', formats: ['BD', 'UHD'], firstPlay: 'TOP_MENU', popup: true,
    blurb: 'Episodes as spines on a shelf: the selected spine slides out to show its cover. Play All is the bookend.',
    concept: 'Navigation as objects: a horizontal row of upright spines; selection pulls a spine forward and reveals its face.',
    animationAsk: 'tactile objects, cozy tabletop miniature, satisfying physical slide-out, warm returning comfort',
    graphicAsk: 'explainer systematist, clear numbering and grids, friendly bold sans, series branding',
    lighting: 'Warm practical lamp from the left, soft shelf shadow under each spine; selected spine catches a rim light.' },
  { id: 'concert', pins: { anim: 'VISUAL_MUSIC', graphic: 'PSYCHEDELIC' }, name: 'Stage Rig', formats: ['BD', 'UHD'], firstPlay: 'TOP_MENU', popup: true,
    blurb: 'A taped paper setlist on the stage floor under a lighting truss; the follow-spot finds the song you select.',
    concept: 'Navigation as a stage: items are lines on a taped setlist set at an angle; a follow-spot cone lands on the selection.',
    animationAsk: 'live concert energy, stage lighting cues, beat-synced flicker, raw gig poster urgency',
    graphicAsk: 'collage zine gig poster, gaffer tape, xerox, hand-cut type',
    lighting: 'Truss of PAR cans across the top throwing coloured beams; haze; a hard white follow-spot on the selection; beams sweep on a slow chase.' },
  { id: 'arthouse', pins: { anim: 'INK_WASH', graphic: 'CONSTRUCTIVIST' }, name: 'Programme', formats: ['BD', 'UHD'], firstPlay: 'TOP_MENU', popup: false,
    blurb: 'A printed programme note: one paragraph about the film with the menu items set inline as roman numerals, circled in pencil.',
    concept: 'Navigation as reading: items live inside a paragraph of text; selection is a hand-drawn pencil circle.',
    animationAsk: 'quiet structural film, gallery stillness, hand-drawn pencil gestures, literary pacing',
    graphicAsk: 'Swiss typographic page, editorial serif, margins and footnotes, restraint',
    lighting: 'Flat daylight on paper, a faint window-light gradient from the left; no drama — the paper is lit like a book on a table.' },
  { id: 'screener', pins: { anim: 'UI_MOTION', graphic: 'DATA_STORY' }, name: 'Slate', formats: ['BD', 'UHD'], firstPlay: 'PLAY_FEATURE', popup: true,
    blurb: 'A production slate: technical table of the film (runtime, ratio, audio, contact) with the menu as table rows. FYC.',
    concept: 'Navigation as data: a technical table; each menu item is a row; selection inverts the row like a terminal.',
    animationAsk: 'interface motion, clean data transitions, instant feedback, professional tooling',
    graphicAsk: 'data storyteller, monospace tables, technical documentation, Swiss grid',
    lighting: 'No theatrical light: an even neutral grey field, ruled lines, a single status LED dot that pulses.' },
  { id: 'documentary', pins: { anim: 'STRUCTURAL', graphic: 'COLLAGE' }, name: 'Archive', formats: ['BD', 'UHD'], firstPlay: 'TOP_MENU', popup: true,
    blurb: 'An archive drawer: manila folder tabs across the top are the menu; index cards, typewriter labels and redaction bars.',
    concept: 'Navigation as filing: menu items are folder tabs along the top edge; the selected tab rises and its folder opens.',
    animationAsk: 'archival paper, stop-motion cutout documents, investigative evidence board',
    graphicAsk: 'collage of documents, typewriter labels, redaction, file folders',
    lighting: 'Desk lamp pool from the top-left, paper warmth, a hard shadow under each tab; dust in the lamp beam.' },
  { id: 'family', pins: { anim: 'RUBBER_HOSE', graphic: 'BOLD_FLAT' }, name: 'Storybook Hills', formats: ['BD', 'UHD'], firstPlay: 'TOP_MENU', popup: true,
    blurb: 'Round, chunky buttons sitting on rolling hills like little houses; the selected one hops and glows. Built for small hands.',
    concept: 'Navigation as a landscape: big pill buttons sit on rolling hill crests; selection lifts the button with a sun-glow ring.',
    animationAsk: 'squash and stretch, bouncy cartoon timing, joyful hops, kids animation',
    graphicAsk: 'mid-century modern cartoon backgrounds, flat friendly shapes, rounded type',
    lighting: 'Bright warm sun high left, soft cel shadows under each button; clouds drift across slowly.' },
  { id: 'genre', pins: { anim: 'SILHOUETTE', graphic: 'ART_DECO' }, name: 'Midnight', formats: ['BD', 'UHD'], firstPlay: 'TOP_MENU', popup: true,
    blurb: 'Tarot cards fanned by candlelight: each menu item is a card; the chosen card rises into the flame light.',
    concept: 'Navigation as a fan of cards: items are tarot cards fanned in an arc; selection lifts and tilts a card into the candle glow.',
    animationAsk: 'silhouette cutout horror, candle flicker, dread, occult ritual, analogue grain',
    graphicAsk: 'psychedelic occult poster, ornate frames, blackletter, boutique horror label',
    lighting: 'One candle low centre: warm 2000 K pool with irregular flicker, everything else falls to ink; a cold blue rim from behind.' },
];

export const conceptById = (id: string) => DISC_CONCEPTS.find(c => c.id === id);
