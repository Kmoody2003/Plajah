// eviteTemplateCollection — the 144 Plajah evite designs, as Tela documents.
//
//   12 kids · boys   12 kids · girls   24 adult parties   12 anniversary   12 gatherings   36 weddings
//
// Each row below is one design: a motif (illustration), a layout, an entrance, a palette, a type pairing and an
// optional interaction (scratch-and-reveal, or a 15-second game for kids). The art is built from Tela vector
// objects (services/tela/templateKit), so every invitation opens as an editable Tela document, and its motion is
// carried by `fx-` tags that the guest player and Tela's own tracks both read.
//
// Honest note on scale: 144 designs are authored as data on a shared motif/layout system rather than 144 one-off
// illustrations. Motifs are reused with different palettes, layouts, type and motion, and the weddings share a
// botanical/architectural family with per-design variation. The Art Council notes on each row say what each
// design is for and what was cut.
import type { TelaDoc, TelaVectorObject } from '../../types';
import {
  EVITE_CATEGORIES, type EviteCategory, type EviteEntrance, type EviteInteraction, type EviteLayout, type EvitePalette, type EviteTemplateMeta, type EviteFields,
} from '../evite/eviteTypes';
import { Kit, W, H, layoutGround, layoutText, motionTracks, hashStr, EYEBROW, type CopyIn, type TypeSet, type Motif } from './evite/eviteBuild';
import { FUN_MOTIFS } from './evite/motifsFun';
import { ELEGANT_MOTIFS, ADULT_MOTIFS } from './evite/motifsElegant';
import type { FontKey } from './telaFonts';

const MOTIFS: Record<string, Motif> = { ...FUN_MOTIFS, ...ADULT_MOTIFS, ...ELEGANT_MOTIFS };

type Pal = [string, string, string, string, string, string];
type Fonts = [FontKey, FontKey, FontKey?];
/** [id, name, tagline, headline, motif, layout, entrance, palette, fonts, interaction, display style flags] */
type Row = [string, string, string, string, string, EviteLayout, EviteEntrance, Pal, Fonts, string, string?, string?];

const L = { ht: 'hero-top', hb: 'hero-bottom', fr: 'framed', ar: 'arch', po: 'poster', ca: 'card' } as const;

// ─── Kids · Boys ─────────────────────────────────────────────────────────────
const BOYS: Row[] = [
  ['dino', 'Dino Dig', 'Roar! A prehistoric party', "{name} is turning 6!", 'dino', L.ht, 'pop', ['#c9f2d9', '#8fdcb0', '#10331f', '#ff7a3d', '#2fbf71', '#ffd23f'], ['bangers', 'nunito'], 'g:hunt:3:Find the 3 hidden dino eggs', 'caps'],
  ['rocket', 'Blast Off', 'Three, two, one, party', "{name}'s Space Party", 'rocket', L.ca, 'rise', ['#1d2a5c', '#0c1233', '#ffffff', '#ff5a5f', '#7a8cff', '#ffd23f'], ['righteous', 'nunito'], 'g:catch:8:Catch 8 shooting stars', 'caps'],
  ['truck', 'Big Rig Bash', 'Dig in. Dump out. Celebrate', "Dig In with {name}", 'truck', L.hb, 'drift', ['#ffe08a', '#ffc94a', '#2a1a05', '#e8531e', '#3b3b4f', '#fff3c4'], ['archivoBlack', 'nunito'], 's:Scratch to uncover the dig site', 'caps'],
  ['soccer', 'Goal!', 'Bring your cleats', "{name}'s Soccer Party", 'soccer', L.po, 'pop', ['#2fa65a', '#1c7a40', '#ffffff', '#ffd23f', '#ffffff', '#ffd23f'], ['bebas', 'nunito'], 'g:catch:6:Score 6 goals (tap the ball)', 'caps'],
  ['pirate', 'Pirate Cove', 'X marks the party', "Ahoy! {name} is 5", 'pirate', L.fr, 'unfold', ['#fdf0cf', '#f1d9a0', '#2b1a0c', '#c8452c', '#2b6f9e', '#e8a91e'], ['pirata', 'nunito'], 'g:hunt:3:Find the 3 treasure coins'],
  ['hero', 'Super Hero HQ', 'Capes required', "{name} Saves the Day", 'hero', L.ht, 'pop', ['#16264a', '#0b1530', '#ffffff', '#e5322d', '#ffcf1f', '#ffcf1f'], ['bangers', 'nunito'], 'g:pop:8:Pop 8 villain bubbles', 'caps'],
  ['robot', 'Robo Bash', 'Beep boop. Cake time', "{name}'s Robot Party", 'robot', L.ar, 'curtain', ['#d8f1ff', '#a9dcf7', '#0b2740', '#ff6a3d', '#2f7bdc', '#ffd23f'], ['orbitron', 'nunito'], 'g:memory:6:Match the 6 robot parts', 'caps'],
  ['shark', 'Shark Splash', 'Doo doo doo, pool party', "Splash into {name}'s Party", 'shark', L.hb, 'drift', ['#1f8fc7', '#0b5f94', '#ffffff', '#ffd23f', '#5aa7d6', '#bff0ff'], ['fredoka', 'nunito'], 'g:pop:8:Pop 8 bubbles'],
  ['jungle', 'Wild Safari', 'Roar, swing, snack', "{name}'s Wild Safari", 'jungle', L.ht, 'rise', ['#f9efc2', '#e8d98a', '#123824', '#e6862a', '#2f9e57', '#ffd23f'], ['bungee', 'nunito'], 'g:hunt:3:Spot 3 hidden animals', 'caps'],
  ['knight', 'Castle Quest', 'Brave knights wanted', "{name}'s Knight Quest", 'knight', L.fr, 'unfold', ['#2a1f4d', '#150f2b', '#fff6e0', '#d94a3d', '#6b5bd6', '#f2c14e'], ['medievalSharp', 'nunito'], 's:Scratch the royal seal'],
  ['racecar', 'Pit Stop', 'Start your engines', "Start Your Engines, {name}!", 'racecar', L.po, 'drift', ['#e5322d', '#a81f1c', '#ffffff', '#ffd23f', '#1a1a2e', '#ffd23f'], ['bungee', 'nunito'], 'g:catch:8:Collect 8 checkered flags', 'caps'],
  ['ninja', 'Ninja Academy', 'Train hard. Party harder', "{name}'s Ninja Academy", 'ninja', L.ca, 'iris', ['#2b2f4a', '#14172b', '#ffffff', '#e5322d', '#7bd1c6', '#f2c14e'], ['permanentMarker', 'nunito'], 'g:catch:6:Catch 6 shuriken'],
];
// ─── Kids · Girls ────────────────────────────────────────────────────────────
const GIRLS: Row[] = [
  ['unicorn', 'Magic Mane', 'Sparkles and rainbows', "{name}'s Magical Birthday", 'unicorn', L.ht, 'pop', ['#ffe3f4', '#e8d1ff', '#4b2a7a', '#ff5fa2', '#9b7bff', '#ffd23f'], ['pacifico', 'nunito'], 's:Scratch to reveal the magic'],
  ['princess', 'Royal Ball', 'A castle for a princess', "{name} Turns 7", 'princess', L.ar, 'curtain', ['#ffd9ec', '#f6b8d9', '#5a1d4a', '#e0398a', '#9b7bff', '#ffd23f'], ['lobster', 'nunito'], 'g:memory:6:Match the 6 royal jewels'],
  ['mermaid', 'Under the Sea', 'Shells, waves and wishes', "{name}'s Mermaid Party", 'mermaid', L.hb, 'drift', ['#bff3ee', '#6fd5d0', '#0d4a58', '#ff7ab6', '#7a6ae6', '#ffe08a'], ['pacifico', 'nunito'], 'g:pop:8:Pop 8 bubbles'],
  ['fairy', 'Fairy Garden', 'Tiny wings, big fun', "{name}'s Fairy Garden", 'fairy', L.fr, 'unfold', ['#2a2457', '#17123a', '#fdf4ff', '#ff8ac7', '#6fd6a5', '#ffe08a'], ['dancing', 'nunito'], 'g:hunt:3:Find 3 hidden fairies'],
  ['butterfly', 'Butterfly Bloom', 'Flutter on over', "{name} is Turning 8", 'butterfly', L.ht, 'rise', ['#fff0d9', '#ffd8b0', '#4a1f4f', '#e8509a', '#7a6ae6', '#ffcf5c'], ['shrikhand', 'nunito'], 'g:catch:6:Catch 6 butterflies'],
  ['ballet', 'Ballerina', 'Twirl into the spotlight', "{name}'s Ballet Party", 'ballet', L.ca, 'curtain', ['#ffe6ee', '#ffc9dc', '#5a1d3a', '#f06292', '#b39ddb', '#ffe08a'], ['italiana', 'nunito'], 's:Scratch to open the curtain'],
  ['bakery', 'Sweet Shop', 'Cupcakes and giggles', "{name}'s Cupcake Party", 'bakery', L.ar, 'pop', ['#fff1d6', '#ffd8e0', '#5a2431', '#ff5a8a', '#ffb74d', '#ffffff'], ['pacifico', 'nunito'], 'g:candles:4:Light all 4 candles'],
  ['rainbow', 'Rainbow Day', 'Happy colors everywhere', "{name}'s Rainbow Party", 'rainbow', L.ht, 'rise', ['#e3f6ff', '#c8e9ff', '#2b3a67', '#ff5a76', '#4cc3ff', '#ffd23f'], ['fredoka', 'nunito'], 'g:pop:8:Pop 8 rainbow bubbles'],
  ['kitty', 'Kitty Cat Club', 'Purr-fect party', "{name}'s Kitty Party", 'kitty', L.fr, 'pop', ['#ffe8f1', '#ffcfe0', '#4a1b33', '#ff6fa6', '#ffb74d', '#ffffff'], ['baloo', 'nunito'], 'g:memory:6:Match the 6 kitties'],
  ['art', 'Little Artist', 'Paint, splash, create', "{name}'s Art Party", 'art', L.hb, 'iris', ['#fff7e0', '#ffe6a8', '#2b2147', '#ff5a76', '#4cc3ff', '#ffd23f'], ['permanentMarker', 'nunito'], 's:Scratch to paint the invite'],
  ['carousel', 'Carousel Dreams', 'Round and round we go', "{name}'s Carnival", 'carousel', L.ca, 'unfold', ['#2d1b4e', '#190d33', '#fff4e6', '#ff6fa6', '#4cd1c0', '#ffd23f'], ['limelight', 'nunito'], 'g:catch:8:Catch 8 carnival stars', 'caps'],
  ['popstar', 'Pop Star', 'Lights, mic, party', "{name}'s Pop Star Party", 'popstar', L.po, 'iris', ['#b22a8f', '#5a1d8a', '#ffffff', '#ffd23f', '#35e0e8', '#ffd23f'], ['bungee', 'nunito'], 's:Scratch to light the stage', 'caps'],
];
// ─── Adult parties ───────────────────────────────────────────────────────────
const ADULT: Row[] = [
  ['cocktail', 'Cocktail Hour', 'Dress up. Drink up', "{name}'s Birthday Cocktails", 'cocktail', L.ca, 'rise', ['#1b1130', '#0d0819', '#fbeee0', '#ff5d8f', '#f2b84b', '#f2b84b'], ['playfair', 'dmSans']],
  ['wine', 'Wine & Dine', 'An evening of tastings', "An Evening of Wine", 'wine', L.fr, 'unfold', ['#3a0f1e', '#1f0710', '#f6e7d2', '#c24a64', '#d9a441', '#d9a441'], ['cormorant', 'dmSans'], '', 'italic'],
  ['skyline', 'Rooftop', 'Above the city lights', "Rooftop for {name}", 'skyline', L.hb, 'rise', ['#1c2a4a', '#0b1226', '#fff1da', '#ff8a5c', '#6f8bd6', '#ffd58a'], ['syne', 'dmSans'], '', 'caps'],
  ['m30', 'Dirty Thirty', 'Another decade, same energy', "{name} is 30", 'm30', L.ht, 'pop', ['#ffd23f', '#ffb21f', '#1b1130', '#ff3d7f', '#6b2fd6', '#ffffff'], ['bebas', 'dmSans'], '', 'caps'],
  ['m40', 'Forty & Fabulous', 'Life begins. Again', "{name} is Forty!", 'm40', L.ca, 'unfold', ['#14343b', '#0a1d22', '#fbeed5', '#e8b04b', '#3fb8a6', '#e8b04b'], ['playfair', 'dmSans'], 's:Scratch to reveal the big number'],
  ['m50', 'Fifty & Flawless', 'A golden milestone', "{name} Turns 50", 'm50', L.fr, 'curtain', ['#1a1a1a', '#0a0a0a', '#f7ecd0', '#d9a441', '#f3d98b', '#f3d98b'], ['bodoni', 'dmSans'], 's:Scratch the gold'],
  ['casino', 'Casino Night', 'Place your bets', "Casino Night with {name}", 'casino', L.po, 'pop', ['#0d4a34', '#07281c', '#fff6df', '#d4264e', '#f2c14e', '#f2c14e'], ['limelight', 'dmSans'], '', 'caps'],
  ['disco', 'Night Fever', 'Dance until dawn', "Night Fever", 'disco', L.po, 'iris', ['#3a0a66', '#12031f', '#ffffff', '#ff8c00', '#d40055', '#ffd58a'], ['monoton', 'dmSans'], '', 'caps'],
  ['tiki', 'Tiki Night', 'Island time, mai tais', "Aloha, {name}!", 'tiki', L.ht, 'drift', ['#ffe3b3', '#ffc277', '#3a1a0a', '#e8453c', '#1fa38a', '#ffd23f'], ['lobster', 'dmSans']],
  ['bbq', 'Backyard BBQ', 'Smoke, sauce, summer', "{name}'s BBQ", 'bbq', L.hb, 'rise', ['#f7e2c0', '#eab984', '#2b1608', '#d6402a', '#3b3b4f', '#ffb21f'], ['bungee', 'dmSans'], '', 'caps'],
  ['masquerade', 'Masquerade', 'Mystery in velvet', "Behind the Mask", 'masquerade', L.fr, 'curtain', ['#2a0f3d', '#12051f', '#f4e3c3', '#c9a24b', '#a62b6b', '#e8c46c'], ['cinzel', 'dmSans'], '', 'caps'],
  ['dicegame', 'Game Night', 'Roll for snacks', "Game Night at {name}'s", 'dicegame', L.ht, 'pop', ['#e8f1ff', '#c9defb', '#14233f', '#e8453c', '#2f7bdc', '#ffcf3d'], ['fredoka', 'dmSans']],
  ['karaoke', 'Karaoke Night', 'Sing like nobody is listening', "Karaoke with {name}", 'popstar', L.ca, 'iris', ['#14102e', '#0a0818', '#ffffff', '#ff4fa3', '#35e0e8', '#ffd23f'], ['audiowide', 'dmSans'], '', 'caps'],
  ['brunch', 'Bubbly Brunch', 'Mimosas at noon', "Brunch for {name}", 'brunch', L.ar, 'rise', ['#fff1e0', '#ffd9b3', '#5a2a1a', '#ff8a5c', '#f2b84b', '#ffd58a'], ['fraunces', 'dmSans'], '', 'italic'],
  ['bonfire', 'Bonfire Night', 'S\'mores under the stars', "Bonfire at {name}'s", 'bonfire', L.hb, 'rise', ['#1a1630', '#0b0a18', '#ffeccd', '#ff7a2e', '#ffb21f', '#ffd58a'], ['bungee', 'dmSans']],
  ['speakeasy', 'Speakeasy', 'Knock twice', "The Secret Soirée", 'speakeasy', L.fr, 'unfold', ['#14100d', '#050403', '#f3e3c1', '#c9a24b', '#8a2f2f', '#e8c46c'], ['poiret', 'dmSans'], '', 'caps'],
  ['sunset', 'Sunset Session', 'Golden hour, good people', "Sunset with {name}", 'sunset', L.po, 'drift', ['#ff9a5c', '#d6407a', '#ffffff', '#ffd58a', '#6b2fd6', '#ffd58a'], ['playfair', 'dmSans'], '', 'italic'],
  ['blacktie', 'Black Tie', 'An evening of elegance', "A Black Tie Evening", 'blacktie', L.fr, 'curtain', ['#0f0f14', '#050507', '#f5ead0', '#cfae5c', '#8a8a99', '#e8c46c'], ['italiana', 'dmSans'], '', 'caps'],
  ['retire', 'Fair Winds', 'Retirement, finally', "Cheers to {name}", 'retire', L.ht, 'drift', ['#e8f3ff', '#bfdcf5', '#10304f', '#ff8a5c', '#1d6fa8', '#ffd58a'], ['fraunces', 'dmSans'], '', 'italic'],
  ['champagne', 'Last Fling', 'Bubbles before the bells', "{name}'s Last Fling", 'champagne', L.ca, 'pop', ['#fff0f6', '#ffd6e6', '#4a1230', '#ff5fa2', '#e8c46c', '#e8c46c'], ['greatVibes', 'dmSans']],
  ['neon80s', 'Totally 80s', 'Neon, big hair, bigger fun', "{name}'s 80s Bash", 'neon80s', L.po, 'iris', ['#1a0b3d', '#0a0420', '#ffffff', '#ff3d9a', '#35e0e8', '#ffd23f'], ['monoton', 'dmSans'], '', 'caps'],
  ['memphis90s', 'Throwback 90s', 'Pager optional', "{name}'s 90s Party", 'memphis90s', L.ht, 'pop', ['#fff6c9', '#ffe56b', '#1b1130', '#ff3d7f', '#35c4e0', '#6b2fd6'], ['rubikMono', 'dmSans'], '', 'caps'],
  ['whiskey', 'Whiskey Social', 'Neat, rocks, or a story', "{name}'s Tasting Night", 'whiskey', L.ar, 'unfold', ['#2a1608', '#120a04', '#f6e3c2', '#d98a2b', '#8a4a1f', '#e8b04b'], ['bodoni', 'dmSans'], '', 'italic'],
  ['dinner', 'Dinner Party', 'Candles, wine, conversation', "Dinner at {name}'s", 'dinner', L.hb, 'unfold', ['#f6ead8', '#e5cfae', '#3a2214', '#b4472f', '#7a8a4f', '#d9a441'], ['cormorant', 'dmSans'], '', 'italic'],
];
// ─── Anniversary ─────────────────────────────────────────────────────────────
const ANNIV: Row[] = [
  ['rings', 'Still Us', 'Interlocked, always', "{name}'s Anniversary", 'rings', L.ca, 'unfold', ['#f7ede0', '#ecd7be', '#4a2a2f', '#b86d72', '#c9a24b', '#c9a24b'], ['cormorant', 'dmSans'], '', 'italic'],
  ['hearts', 'Heart Strings', 'A love that keeps growing', "Years of Love", 'hearts', L.ht, 'rise', ['#ffe3e8', '#ffc1cf', '#5a1b2e', '#e0386a', '#f2a1b6', '#ffffff'], ['playfair', 'dmSans'], '', 'italic'],
  ['laurel25', 'Silver Years', 'Twenty-five and thriving', "25 Years Together", 'laurel25', L.fr, 'curtain', ['#eef0f5', '#cfd4e0', '#232a3d', '#8a94ad', '#c9a24b', '#ffffff'], ['bodoni', 'dmSans']],
  ['roses', 'A Dozen Roses', 'Every year, a new bloom', "Our Anniversary", 'roses', L.ar, 'rise', ['#3b0f1f', '#1f0710', '#fbe9e0', '#d4264e', '#e8a3b0', '#e8c46c'], ['fraunces', 'dmSans'], '', 'italic'],
  ['toast', 'Raise a Glass', 'To us', "A Toast to {name}", 'toast', L.hb, 'pop', ['#1a1630', '#0b0a18', '#fbeed5', '#e8b04b', '#d4264e', '#f3d98b'], ['playfair', 'dmSans'], '', 'italic'],
  ['moonlit', 'Moonlit Vows', 'Under the same sky', "Renewing Our Vows", 'moonlit', L.ca, 'drift', ['#1c2447', '#0c1129', '#f4ecd8', '#c9a24b', '#8da2d9', '#f3e2a8'], ['cormorant', 'dmSans'], '', 'italic'],
  ['threads', 'Golden Thread', 'Woven together', "Fifty Golden Years", 'threads', L.fr, 'unfold', ['#fbf3dc', '#f0dfa8', '#4a3410', '#c9962b', '#8a5a1f', '#e8c46c'], ['playfair', 'dmSans']],
  ['arcs', 'Two Arcs', 'Two lives, one line', "{name}'s Anniversary", 'arcs', L.ar, 'iris', ['#e9efe6', '#cdd9c5', '#2a3a2e', '#7a9570', '#d9a38a', '#c9a24b'], ['instrumentSerif', 'dmSans'], '', 'italic'],
  ['keyhole', 'The Key', 'You unlocked my heart', "Ten Years of Us", 'keyhole', L.ca, 'curtain', ['#2d1b2e', '#160c17', '#f7e6d6', '#d98a8a', '#c9a24b', '#f3d98b'], ['yeseva', 'dmSans']],
  ['treerings', 'Growing Together', 'Rings of time', "Thirty Years Strong", 'treerings', L.ht, 'rise', ['#f1e6d3', '#dcc6a0', '#3a2514', '#a8693a', '#6f8a4f', '#c9a24b'], ['fraunces', 'dmSans'], '', 'italic'],
  ['pairstars', 'Our Constellation', 'Written in the stars', "Our Night Sky", 'pairstars', L.hb, 'drift', ['#141c3d', '#080c22', '#f4ecd8', '#f3d98b', '#a99ae8', '#f3d98b'], ['cinzel', 'dmSans'], '', 'caps'],
  ['lace', 'Ivory & Lace', 'Delicate and enduring', "Forty Years", 'lace', L.fr, 'unfold', ['#faf4ea', '#eadfca', '#43352a', '#b8a07a', '#d6c7a6', '#c9a24b'], ['greatVibes', 'dmSans']],
];
// ─── Gatherings ──────────────────────────────────────────────────────────────
const GENERAL: Row[] = [
  ['balloons', 'Balloon Burst', 'Any reason is a good reason', "You're Invited!", 'balloons', L.ht, 'rise', ['#fff1c9', '#ffd98a', '#2b1a4a', '#ff4f7a', '#2f7bdc', '#ffb21f'], ['fredoka', 'nunito'], 'g:pop:8:Pop 8 balloons to open'],
  ['potluck', 'Potluck Table', 'Bring a dish, bring a friend', "Potluck at {name}'s", 'potluck', L.hb, 'drift', ['#fbe8cf', '#f2c89a', '#3a1c0b', '#d6552a', '#7a8a4f', '#ffb21f'], ['fraunces', 'nunito'], '', 'italic'],
  ['stringlights', 'String Lights', 'An evening outside', "Evening at {name}'s", 'stringlights', L.ca, 'rise', ['#1d1b3a', '#0d0c20', '#fff3dc', '#ff7a5c', '#ffd23f', '#ffd58a'], ['caveat', 'nunito']],
  ['confetti', 'Confetti', 'Let us celebrate something', "Come Celebrate!", 'confettiBurst', L.po, 'pop', ['#6b2fd6', '#3a1a8a', '#ffffff', '#ff4f7a', '#ffd23f', '#35e0e8'], ['bungee', 'nunito'], 's:Scratch to reveal the party', 'caps'],
  ['opendoor', 'Open House', 'Come on in', "Open House at {name}'s", 'door', L.ar, 'unfold', ['#f3e4d0', '#e0c6a4', '#3a2214', '#d1553a', '#7a8a4f', '#ffd58a'], ['fraunces', 'nunito']],
  ['fireworks', 'Fireworks', 'Light up the night', "Light Up the Night", 'fireworks', L.hb, 'iris', ['#10163a', '#05071c', '#ffffff', '#ff4f7a', '#35e0e8', '#ffd23f'], ['bungee', 'nunito'], '', 'caps'],
  ['bunting', 'Bunting Bash', 'Flags up, party on', "Party at {name}'s", 'bunting', L.ht, 'drift', ['#e6f7ff', '#c4e8fb', '#14335a', '#ff4f7a', '#2f7bdc', '#ffcf3d'], ['baloo', 'nunito']],
  ['picnic', 'Picnic', 'Blankets, baskets, sunshine', "Picnic in the Park", 'picnic', L.ar, 'rise', ['#e9f8dc', '#cdeaa8', '#1f4a2a', '#e8453c', '#ffcf3d', '#ffffff'], ['caveat', 'nunito']],
  ['boardgames', 'Game Day', 'Snacks, dice, rivalry', "Game Day", 'board', L.fr, 'pop', ['#fff4d6', '#ffe08a', '#241a4a', '#e8453c', '#2f7bdc', '#ffcf3d'], ['bungee', 'nunito'], '', 'caps'],
  ['sparkler', 'Sparkler Send-off', 'A bright goodbye', "A Bright Send-off", 'sparkler', L.ca, 'iris', ['#1b1430', '#0b0818', '#fff3dc', '#ffb21f', '#ff4f7a', '#ffd58a'], ['dancing', 'nunito']],
  ['snow', 'Winter Gathering', 'Cocoa and cozy', "Winter Gathering", 'snow', L.ht, 'drift', ['#dff0ff', '#b9d9f2', '#143050', '#e8453c', '#2f8f5c', '#ffd23f'], ['fraunces', 'nunito'], '', 'italic'],
  ['sunflower', 'Sunflower Social', 'Good people, warm days', "Summer at {name}'s", 'sunflower', L.po, 'rise', ['#ffeaa3', '#ffd04a', '#3a2a05', '#3f9a5f', '#e8453c', '#ffffff'], ['shrikhand', 'nunito']],
];
// ─── Weddings ────────────────────────────────────────────────────────────────
const WEDDING: Row[] = [
  ['floral-arch', 'Garden Arch', 'Vows beneath the blooms', "{name}", 'florarch', L.ar, 'unfold', ['#faf5ee', '#efe3d3', '#3a3a2e', '#b87a86', '#7f9a78', '#c9a24b'], ['cormorant', 'dmSans', 'greatVibes'], '', 'italic'],
  ['olive', 'Olive Branch', 'Peace, love and an olive grove', "{name}", 'olive', L.fr, 'drift', ['#f6f3e6', '#e4ddc2', '#33402a', '#7a8a4f', '#b9a56a', '#b9a56a'], ['cormorant', 'dmSans', 'greatVibes'], '', 'italic'],
  ['monogram', 'Gilded Initials', 'Two names, one crest', "{name}", 'monogram', L.ca, 'curtain', ['#14110d', '#080706', '#f3e6c8', '#d9b160', '#b8913f', '#f3d98b'], ['playfair', 'dmSans', 'greatVibes'], '', 'italic'],
  ['pearls', 'Pearl Strand', 'Quiet luxury', "{name}", 'pearls', L.ar, 'iris', ['#f7f3f2', '#e8dedd', '#3d3335', '#b8a3a6', '#d9c7b8', '#ffffff'], ['bodoni', 'dmSans', 'greatVibes']],
  ['peony', 'Peony Season', 'Blush and cream', "{name}", 'peony', L.ht, 'rise', ['#fff3f1', '#f9d9d6', '#4a2a30', '#e58aa0', '#8fa882', '#c9a24b'], ['cormorant', 'dmSans', 'greatVibes'], '', 'italic'],
  ['eucalyptus', 'Eucalyptus', 'Sage and silver', "{name}", 'eucalyptus', L.fr, 'drift', ['#f1f4ee', '#d9e2d3', '#2f3f35', '#7c9a86', '#a8b9ab', '#c9a24b'], ['playfair', 'dmSans', 'greatVibes']],
  ['blossom', 'Cherry Blossom', 'Spring in full bloom', "{name}", 'blossom', L.ht, 'drift', ['#fff2f5', '#ffd9e3', '#4a2a36', '#ee8fae', '#8a6a4f', '#ffffff'], ['cormorant', 'dmSans', 'greatVibes'], '', 'italic'],
  ['deco', 'Art Deco', 'The Great Gala', "{name}", 'decoFan', L.fr, 'curtain', ['#0d1b2a', '#050b12', '#f3e6c8', '#d9b160', '#3a5a7a', '#f3d98b'], ['limelight', 'dmSans', 'greatVibes'], '', 'caps'],
  ['marble', 'White Marble', 'Veined and timeless', "{name}", 'marble', L.ca, 'unfold', ['#f6f6f7', '#e3e4e8', '#2a2a33', '#9aa0ad', '#d9b160', '#d9b160'], ['bodoni', 'dmSans', 'greatVibes']],
  ['moonphase', 'Moon Phases', 'Written in the moon', "{name}", 'moonphase', L.hb, 'drift', ['#171b3a', '#090b20', '#f4ecd8', '#d9b160', '#8da2d9', '#f3e2a8'], ['cinzel', 'dmSans', 'greatVibes'], '', 'caps'],
  ['celestial', 'Celestial', 'Under a thousand stars', "{name}", 'celestial', L.ar, 'iris', ['#10163a', '#05071c', '#f4ecd8', '#d9b160', '#a99ae8', '#f3e2a8'], ['cormorant', 'dmSans', 'greatVibes'], '', 'italic'],
  ['waxseal', 'Wax Seal', 'Sealed with a promise', "{name}", 'waxseal', L.ca, 'unfold', ['#efe4d0', '#d9c6a4', '#3a2a1c', '#9a2f3a', '#b8913f', '#d9b160'], ['cormorant', 'dmSans', 'greatVibes'], '', 'italic'],
  ['lace-wed', 'Chantilly Lace', 'Heirloom details', "{name}", 'lace', L.fr, 'unfold', ['#fbf6ee', '#eee1cc', '#463a30', '#b8a07a', '#d6c7a6', '#c9a24b'], ['greatVibes', 'dmSans', 'greatVibes']],
  ['greenhouse', 'Glasshouse', 'Wed among the plants', "{name}", 'greenhouse', L.ar, 'rise', ['#e8f0e6', '#c9dcc6', '#26402f', '#5f8f6a', '#b9a56a', '#ffffff'], ['playfair', 'dmSans', 'greatVibes']],
  ['vineyard', 'Vineyard', 'Harvest and happily ever after', "{name}", 'vineyard', L.hb, 'drift', ['#f3e8d6', '#dcc7a0', '#3a2410', '#7a3a4f', '#7a8a4f', '#c9a24b'], ['cormorant', 'dmSans', 'greatVibes'], '', 'italic'],
  ['cypress', 'Tuscan Cypress', 'A villa in the hills', "{name}", 'cypress', L.ht, 'rise', ['#f6ead3', '#e6cfa3', '#3a2a14', '#6f7f3f', '#c4733a', '#c9a24b'], ['playfair', 'dmSans', 'greatVibes']],
  ['villa', 'Italian Villa', 'Arches and amber light', "{name}", 'villa', L.ar, 'curtain', ['#f4e5cf', '#e3c29a', '#3a2214', '#c4733a', '#7a8a4f', '#c9a24b'], ['cormorant', 'dmSans', 'greatVibes'], '', 'italic'],
  ['coastal', 'Coastal', 'Salt air and sea glass', "{name}", 'coastal', L.hb, 'drift', ['#eaf5f7', '#c6e3ea', '#173a4a', '#3f8fa8', '#d9c7a0', '#ffffff'], ['cormorant', 'dmSans', 'greatVibes'], '', 'italic'],
  ['ink', 'Ink Wash', 'Mountains in mist', "{name}", 'inkmountain', L.ca, 'iris', ['#f4f1ea', '#e0dacb', '#22252b', '#7a7f8a', '#b3402f', '#b3402f'], ['shippori', 'dmSans', 'greatVibes']],
  ['desert', 'Desert Bloom', 'Boho arches and golden sand', "{name}", 'desert', L.ar, 'rise', ['#f7e6d3', '#ecc6a4', '#4a2a1a', '#c4733a', '#d9a38a', '#c9a24b'], ['fraunces', 'dmSans', 'greatVibes'], '', 'italic'],
  ['pampas', 'Pampas', 'Soft grasses, easy elegance', "{name}", 'pampas', L.ht, 'drift', ['#f7efe3', '#e8d8c0', '#4a3a2a', '#c9a98a', '#a8836a', '#c9a24b'], ['cormorant', 'dmSans', 'greatVibes'], '', 'italic'],
  ['magnolia', 'Magnolia', 'Southern grace', "{name}", 'magnolia', L.fr, 'unfold', ['#fbf6ef', '#efe3d3', '#33402a', '#e8d3c4', '#5f7f4f', '#c9a24b'], ['playfair', 'dmSans', 'greatVibes']],
  ['orchid', 'Orchid', 'Rare and radiant', "{name}", 'orchid', L.ar, 'rise', ['#f5eef8', '#e2d1ea', '#3a2347', '#a85ac4', '#8fa882', '#c9a24b'], ['bodoni', 'dmSans', 'greatVibes'], '', 'italic'],
  ['ribbon', 'Silk Ribbon', 'Tied with care', "{name}", 'ribbon', L.ca, 'drift', ['#f9efef', '#efd6d6', '#4a2a30', '#c97a86', '#d9b160', '#ffffff'], ['cormorant', 'dmSans', 'greatVibes'], '', 'italic'],
  ['candles', 'Candlelit', 'An evening by candlelight', "{name}", 'candelabra', L.hb, 'rise', ['#1a1410', '#0a0706', '#f3e6c8', '#d9b160', '#8a3a3a', '#ffcf7a'], ['cormorant', 'dmSans', 'greatVibes'], '', 'italic'],
  ['cathedral', 'Cathedral', 'Stained light, solemn joy', "{name}", 'cathedral', L.ar, 'curtain', ['#1c1a33', '#0b0a1a', '#f3e6c8', '#d9b160', '#7a6ae6', '#f3d98b'], ['cinzel', 'dmSans', 'greatVibes'], '', 'caps'],
  ['goldbotanical', 'Gold Foil Botanical', 'Foil-pressed florals', "{name}", 'goldbot', L.ht, 'rise', ['#fbf8f2', '#efe6d6', '#33302a', '#c9a24b', '#e8c46c', '#f3d98b'], ['playfair', 'dmSans', 'greatVibes'], '', 'italic'],
  ['wreath', 'Floral Wreath', 'Round and wild', "{name}", 'wreath', L.ca, 'unfold', ['#f6f1e9', '#e6dccb', '#34402f', '#c98a8a', '#7f9a78', '#c9a24b'], ['cormorant', 'dmSans', 'greatVibes'], '', 'italic'],
  ['sprigs', 'Simple Sprigs', 'Small leaves, big love', "{name}", 'sprigs', L.fr, 'drift', ['#fdfbf6', '#f0eadd', '#2f3a2c', '#8a9a72', '#c9a24b', '#c9a24b'], ['instrumentSerif', 'dmSans', 'greatVibes'], '', 'italic'],
  ['lavender', 'Lavender Field', 'Provence in purple', "{name}", 'lavender', L.hb, 'drift', ['#f3eef9', '#ddd1ee', '#352a4a', '#8a6ac4', '#9aae7a', '#c9a24b'], ['cormorant', 'dmSans', 'greatVibes'], '', 'italic'],
  ['geometric', 'Rose Gold Geometry', 'Modern and warm', "{name}", 'geometric', L.ca, 'iris', ['#fbf1ee', '#f0d3cc', '#3d2a2c', '#c98a7a', '#b76e79', '#e8b4a8'], ['josefin', 'dmSans', 'greatVibes'], '', 'caps'],
  ['emerald', 'Emerald Deco', 'Jewel tones and brass', "{name}", 'emeraldDeco', L.fr, 'curtain', ['#0c3a30', '#05211b', '#f3e6c8', '#d9b160', '#2fa58a', '#f3d98b'], ['limelight', 'dmSans', 'greatVibes'], '', 'caps'],
  ['sapphire', 'Sapphire Night', 'Deep blue and silver stars', "{name}", 'sapphire', L.ar, 'iris', ['#0e1f4d', '#050c26', '#eef0f8', '#c0c8dc', '#3f6fd6', '#e8ecf8'], ['cormorant', 'dmSans', 'greatVibes'], '', 'italic'],
  ['terracotta', 'Terracotta Arches', 'Warm clay and sun', "{name}", 'terraArches', L.ht, 'rise', ['#f6e4d6', '#e7bfa2', '#4a2316', '#c4623a', '#e8a37a', '#c9a24b'], ['fraunces', 'dmSans', 'greatVibes'], '', 'italic'],
  ['winter', 'Winter Pine', 'A snowy ceremony', "{name}", 'winterpine', L.ca, 'drift', ['#eef3f7', '#d3dee8', '#1f3345', '#4f7a63', '#a9b8c6', '#c9a24b'], ['cormorant', 'dmSans', 'greatVibes'], '', 'italic'],
  ['doves', 'Doves', 'Two doves, one promise', "{name}", 'doves', L.hb, 'drift', ['#f8f7f5', '#e6e2dc', '#33323a', '#a9a4b0', '#d9b160', '#ffffff'], ['cormorant', 'dmSans', 'greatVibes'], '', 'italic'],
];

const GROUPS: Array<[EviteCategory, Row[], string]> = [
  ['kids_boy', BOYS, 'boy'], ['kids_girl', GIRLS, 'girl'], ['adult', ADULT, 'adult'], ['anniversary', ANNIV, 'anniv'], ['general', GENERAL, 'gather'], ['wedding', WEDDING, 'wed'],
];

const COUNCIL = [
  ['Playful illustrator', 'Motion director', 'Kept the character big and readable at thumb size; cut a second prop so the date stays legible'],
  ['Editorial typographer', 'Colour theorist', 'Held the headline to two lines; restrained the accent to one place'],
  ['Ornament specialist', 'Minimalist', 'Let the ornament frame the names instead of competing with them'],
  ['Motion director', 'Typographer', 'Ambient motion stays under 12px and stops for reduced-motion guests'],
  ['Colour theorist', 'Illustrator', 'Pulled the palette to five colours so photos can sit inside the card'],
];

function parseInteraction(code: string | undefined): EviteInteraction {
  if (!code) return { kind: 'none' };
  const [t, ...rest] = code.split(':');
  if (t === 's') return { kind: 'scratch', prompt: rest.join(':') || 'Scratch to reveal' };
  if (t === 'g') { const [game, goal, ...pr] = rest; return { kind: 'game', game: game as any, goal: Number(goal) || 6, prompt: pr.join(':') || 'Play to open' }; }
  return { kind: 'none' };
}

export const EVITE_TEMPLATES: EviteTemplateMeta[] = GROUPS.flatMap(([category, rows, key]) => rows.map((r, i): EviteTemplateMeta => {
  const [id, name, tagline, headline, motif, layout, entrance, p, , inter, flag] = r;
  const c = COUNCIL[(i + key.length) % COUNCIL.length];
  return {
    id: `${key}-${id}`, category, name, tagline, headline, motif, layout, entrance,
    palette: { bg: p[0], bg2: p[1], ink: p[2], accent: p[3], accent2: p[4], glow: p[5] },
    interaction: parseInteraction(inter),
    tags: [category, motif, layout, entrance, ...(inter ? [inter.startsWith('s') ? 'scratch' : 'game'] : []), ...(flag ? [flag] : [])],
    council: { lead: c[0], counterpoint: c[1], editor: c[2] },
  };
}));
const FONT_BY_ID = new Map<string, { fonts: Fonts; flag?: string }>(GROUPS.flatMap(([, rows, key]) => rows.map(r => [`${key}-${r[0]}`, { fonts: r[8], flag: r[10] }] as [string, { fonts: Fonts; flag?: string }])));

export const templateById = (id: string): EviteTemplateMeta | undefined => EVITE_TEMPLATES.find(t => t.id === id);
export const templatesIn = (cat: EviteCategory) => EVITE_TEMPLATES.filter(t => t.category === cat);
export const categoryCounts = () => Object.fromEntries(EVITE_CATEGORIES.map(c => [c.id, templatesIn(c.id).length])) as Record<EviteCategory, number>;
export const typeSetFor = (id: string): TypeSet => {
  const f = FONT_BY_ID.get(id); const [display, body, script] = f?.fonts || ['playfair', 'dmSans'];
  const flag = f?.flag; const wedding = !!script;
  return { display: wedding ? 'cormorant' : display, body, script: wedding ? script : undefined, displayCaps: flag === 'caps', displayItalic: flag === 'italic', displayWeight: flag === 'caps' ? 700 : wedding ? 500 : 800 };
};

// ─── Build ───────────────────────────────────────────────────────────────────

const fmtDate = (ms: number, tz: string) => { try { return new Date(ms).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: tz }); } catch { return new Date(ms).toDateString(); } };
const fmtTime = (ms: number, tz: string, end?: number) => { try { const f = (n: number) => new Date(n).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: tz }); return end ? `${f(ms)} to ${f(end)}` : f(ms); } catch { return ''; } };

/** Fill a template's default headline with real event data. */
export function fillCopy(t: EviteTemplateMeta, f: EviteFields, opts: { reveal?: boolean } = {}): CopyIn {
  const name = f.honoree || 'Alex';
  const headline = (f.headline || t.headline).replace(/\{name\}/g, name);
  const wedding = t.category === 'wedding';
  return {
    eyebrow: EYEBROW[t.category],
    headline: wedding && !f.headline ? name : headline,
    subline: f.subline || (wedding ? 'invite you to celebrate their marriage' : t.tagline),
    dateLine: fmtDate(f.startsAt, f.timezone),
    timeLine: fmtTime(f.startsAt, f.timezone, f.endsAt),
    venueLine: [f.venueName, opts.reveal === false ? '' : ''].filter(Boolean).join(' · '),
    hostLine: f.hostName ? (wedding ? `With love, ${f.hostName}` : `Hosted by ${f.hostName}`) : '',
    footer: 'RSVP below · No account needed',
    message: f.message || undefined,
  };
}

export const SAMPLE_FIELDS: EviteFields = { headline: '', subline: '', honoree: 'Max', hostName: 'Dana', startsAt: Date.UTC(2026, 9, 24, 18, 0), timezone: 'America/New_York', venueName: 'The Garden Room', address: '', message: '' };

/** The vector objects for one design with real copy applied. Deterministic. */
export function buildEviteObjects(templateId: string, fields: EviteFields = SAMPLE_FIELDS, accent?: string): TelaVectorObject[] {
  const t = templateById(templateId);
  if (!t) throw new Error(`Unknown evite template: ${templateId}`);
  const pal: EvitePalette = accent ? { ...t.palette, accent } : t.palette;
  const k = new Kit(pal, hashStr(t.id), 'art');
  const placed = layoutGround(k, t.layout, pal);
  const motif = MOTIFS[t.motif] || MOTIFS.fallback;
  motif(k, placed.art, pal);
  layoutText(k, placed, fillCopy(t, fields), pal, typeSetFor(t.id), t.layout);
  return k.objects;
}

/** Open any evite design as an editable Tela document (motion preserved as Tela tracks). */
export function buildEviteDocument(templateId: string, ownerId: string, fields: EviteFields = SAMPLE_FIELDS): TelaDoc {
  const t = templateById(templateId); if (!t) throw new Error(`Unknown evite template: ${templateId}`);
  const objects = buildEviteObjects(templateId, fields), deviceId = `${t.id}-vector`, now = Date.now();
  return {
    id: `${t.id}-${now.toString(36)}`, ownerId, title: `${t.name} · invitation`, createdAt: now, updatedAt: now,
    templatePreset: { schemaVersion: 1, templateId: t.id, status: 'available', motion: { duration: 8000, tracks: motionTracks(objects) } },
    frames: [{ id: `${t.id}-frame`, kind: 'BOARD', preset: 'FREE', x: 0, y: 0, w: W, h: H, deviceIds: [deviceId], label: t.name }],
    devices: { [deviceId]: { id: deviceId, type: 'VECTOR', name: t.name, width: W, height: H, objects } },
    bindings: [],
  } as TelaDoc;
}
export { W as EVITE_W, H as EVITE_H };
