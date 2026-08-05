// kidsLibrary.ts — a starter Lorea children's library + learn-to-read content, all in the
// PUBLIC DOMAIN (Aesop's fables, classic folk tales, traditional nursery rhymes, the Dolch
// sight-word list). Bundled so Kids Mode has real, safe reading content with zero network /
// licensing risk. Expandable from open sources: Project Gutenberg, Standard Ebooks, Global
// Digital Library, StoryWeaver (CC-BY), Unite for Literacy.

export type ReadingLevel = 'BEGINNER' | 'EARLY' | 'INDEPENDENT';

export interface KidsBook {
  id: string;
  title: string;
  author: string;          // "Aesop", "Traditional", …
  level: ReadingLevel;
  emoji: string;           // cover icon
  accent: string;
  pages: string[];         // one short passage per page
  moral?: string;
}

export const READING_LEVELS: { id: ReadingLevel; label: string; sub: string }[] = [
  { id: 'BEGINNER', label: 'Just Starting', sub: 'Rhymes & a few words a page' },
  { id: 'EARLY', label: 'Early Reader', sub: 'Short stories' },
  { id: 'INDEPENDENT', label: 'On My Own', sub: 'Longer tales' },
];

export const KIDS_BOOKS: KidsBook[] = [
  {
    id: 'rhymes', title: 'Nursery Rhymes', author: 'Traditional', level: 'BEGINNER', emoji: '🎵', accent: '#e23b6d',
    pages: [
      'Twinkle, twinkle, little star,\nHow I wonder what you are!\nUp above the world so high,\nLike a diamond in the sky.',
      'Humpty Dumpty sat on a wall,\nHumpty Dumpty had a great fall.\nAll the king\'s horses and all the king\'s men\nCouldn\'t put Humpty together again.',
      'Hey, diddle, diddle,\nThe cat and the fiddle,\nThe cow jumped over the moon.\nThe little dog laughed to see such sport,\nAnd the dish ran away with the spoon.',
      'Baa, baa, black sheep,\nHave you any wool?\nYes sir, yes sir,\nThree bags full.',
    ],
  },
  {
    id: 'crow_pitcher', title: 'The Crow and the Pitcher', author: 'Aesop', level: 'BEGINNER', emoji: '🐦', accent: '#36c5f0',
    pages: [
      'A thirsty crow found a pitcher with a little water at the bottom.',
      'He could not reach the water. His beak was too short.',
      'So the clever crow dropped in pebbles, one by one.',
      'The water rose higher and higher — until the crow could drink. Hooray!',
    ],
    moral: 'Little by little does the trick.',
  },
  {
    id: 'tortoise_hare', title: 'The Tortoise and the Hare', author: 'Aesop', level: 'EARLY', emoji: '🐢', accent: '#2bd67a',
    pages: [
      'The Hare laughed at the slow Tortoise. "You are SO slow!" he said.',
      '"Let\'s race," said the Tortoise. The Hare laughed. "Easy!"',
      'The Hare ran far ahead. Then he lay down for a nap. "I have plenty of time."',
      'The Tortoise kept going — slow and steady — step by step by step.',
      'The Hare woke up and ran fast. But it was too late! The Tortoise had won.',
    ],
    moral: 'Slow and steady wins the race.',
  },
  {
    id: 'lion_mouse', title: 'The Lion and the Mouse', author: 'Aesop', level: 'EARLY', emoji: '🦁', accent: '#f5c542',
    pages: [
      'A tiny Mouse ran across a sleeping Lion. The Lion woke up and caught him!',
      '"Please let me go," squeaked the Mouse. "One day I may help you." The Lion laughed, but let him go.',
      'Later, the Lion was caught in a hunter\'s net. He roared and roared.',
      'The little Mouse heard him. He gnawed the ropes until the Lion was free.',
      '"You see?" said the Mouse. "Even a little friend can help a lot."',
    ],
    moral: 'No act of kindness is ever wasted.',
  },
  {
    id: 'ant_grasshopper', title: 'The Ant and the Grasshopper', author: 'Aesop', level: 'EARLY', emoji: '🐜', accent: '#FF8C00',
    pages: [
      'All summer the Grasshopper sang and played. The Ant worked hard, storing food.',
      '"Come and play!" said the Grasshopper. "Winter is coming," said the Ant, and kept working.',
      'When the cold winter came, the Grasshopper had nothing to eat.',
      'The Ant was warm and had plenty of food. The Grasshopper learned to plan ahead.',
    ],
    moral: 'There is a time for work and a time for play.',
  },
  {
    id: 'three_pigs', title: 'The Three Little Pigs', author: 'Traditional', level: 'INDEPENDENT', emoji: '🐷', accent: '#e23b6d',
    pages: [
      'Once there were three little pigs who set out to build their houses.',
      'The first little pig built his house of straw — quick and easy.',
      'The second little pig built his house of sticks — a little stronger.',
      'The third little pig worked hard and built his house of bricks.',
      'Along came a hungry wolf. "Little pig, let me in!" "Not by the hair of my chinny-chin-chin!"',
      'The wolf blew down the straw house. He blew down the stick house. The pigs ran to the brick house.',
      'The wolf huffed and puffed, but he could NOT blow the brick house down. The three pigs were safe!',
    ],
    moral: 'Hard work builds strong things.',
  },
  {
    id: 'boy_wolf', title: 'The Boy Who Cried Wolf', author: 'Aesop', level: 'INDEPENDENT', emoji: '🐺', accent: '#7a2bd6',
    pages: [
      'A shepherd boy watched the sheep on the hill. It was a little bit boring.',
      'For fun, he shouted, "Wolf! Wolf!" The villagers ran up the hill to help.',
      'But there was no wolf. The boy laughed. He did it again the next day. They came again — and were cross.',
      'Then a REAL wolf came! "Wolf! Wolf!" cried the boy. But this time, nobody came.',
      'The boy learned that nobody believes a person who tells lies — even when they tell the truth.',
    ],
    moral: 'Liars are not believed, even when they speak the truth.',
  },
];

// ── Learn to read ───────────────────────────────────────────────────────────

export interface PhonicsLetter { letter: string; sound: string; word: string; emoji: string; }

export const PHONICS: PhonicsLetter[] = [
  { letter: 'A', sound: 'ah', word: 'apple', emoji: '🍎' }, { letter: 'B', sound: 'buh', word: 'ball', emoji: '⚽' },
  { letter: 'C', sound: 'kuh', word: 'cat', emoji: '🐱' }, { letter: 'D', sound: 'duh', word: 'dog', emoji: '🐶' },
  { letter: 'E', sound: 'eh', word: 'egg', emoji: '🥚' }, { letter: 'F', sound: 'fuh', word: 'fish', emoji: '🐟' },
  { letter: 'G', sound: 'guh', word: 'goat', emoji: '🐐' }, { letter: 'H', sound: 'huh', word: 'hat', emoji: '🎩' },
  { letter: 'I', sound: 'ih', word: 'igloo', emoji: '🧊' }, { letter: 'J', sound: 'juh', word: 'jam', emoji: '🍓' },
  { letter: 'K', sound: 'kuh', word: 'kite', emoji: '🪁' }, { letter: 'L', sound: 'luh', word: 'lion', emoji: '🦁' },
  { letter: 'M', sound: 'muh', word: 'moon', emoji: '🌙' }, { letter: 'N', sound: 'nuh', word: 'nest', emoji: '🪺' },
  { letter: 'O', sound: 'oh', word: 'octopus', emoji: '🐙' }, { letter: 'P', sound: 'puh', word: 'pig', emoji: '🐷' },
  { letter: 'Q', sound: 'kwuh', word: 'queen', emoji: '👑' }, { letter: 'R', sound: 'ruh', word: 'rain', emoji: '🌧️' },
  { letter: 'S', sound: 'sss', word: 'sun', emoji: '☀️' }, { letter: 'T', sound: 'tuh', word: 'tree', emoji: '🌳' },
  { letter: 'U', sound: 'uh', word: 'umbrella', emoji: '☂️' }, { letter: 'V', sound: 'vuh', word: 'van', emoji: '🚐' },
  { letter: 'W', sound: 'wuh', word: 'water', emoji: '💧' }, { letter: 'X', sound: 'ks', word: 'fox', emoji: '🦊' },
  { letter: 'Y', sound: 'yuh', word: 'yo-yo', emoji: '🪀' }, { letter: 'Z', sound: 'zzz', word: 'zebra', emoji: '🦓' },
];

// Dolch sight words (public domain) — pre-primer + primer, the highest-frequency words.
export const SIGHT_WORDS: string[] = [
  'a', 'and', 'away', 'big', 'blue', 'can', 'come', 'down', 'find', 'for', 'funny', 'go', 'help', 'here',
  'I', 'in', 'is', 'it', 'jump', 'little', 'look', 'make', 'me', 'my', 'not', 'one', 'play', 'red', 'run',
  'said', 'see', 'the', 'three', 'to', 'two', 'up', 'we', 'where', 'yellow', 'you',
  'all', 'am', 'are', 'at', 'ate', 'be', 'black', 'brown', 'but', 'came', 'did', 'do', 'eat', 'four', 'get',
  'good', 'have', 'he', 'into', 'like', 'must', 'new', 'no', 'now', 'on', 'our', 'out', 'please', 'pretty',
  'ran', 'ride', 'saw', 'say', 'she', 'so', 'soon', 'that', 'they', 'this', 'too', 'under', 'want', 'was', 'well', 'went', 'what', 'white', 'who', 'will', 'with', 'yes',
];

// Open libraries to expand from (CC-BY / public domain).
export const OPEN_BOOK_SOURCES = [
  { name: 'Global Digital Library', url: 'https://digitallibrary.io', note: 'CC, thousands of kids books in many languages' },
  { name: 'StoryWeaver (Pratham)', url: 'https://storyweaver.org.in', note: 'CC-BY, leveled storybooks' },
  { name: 'Unite for Literacy', url: 'https://www.uniteforliteracy.com', note: 'Free narrated picture books' },
  { name: 'Project Gutenberg', url: 'https://www.gutenberg.org', note: 'Public-domain classics (Beatrix Potter, Andersen…)' },
  { name: 'Standard Ebooks', url: 'https://standardebooks.org', note: 'Polished public-domain editions' },
];

export const getKidsBook = (id: string) => KIDS_BOOKS.find(b => b.id === id);
