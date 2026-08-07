// languageDecks.ts — Phase E: the Duolingo-style languages cartridge content.
// A1-level vocabulary decks across a few languages, grouped into themed lessons. Kept small,
// hand-checked, and parallel-structured so every language demos the same clean learning loop.
// CEFR levels tag each lesson so the same chassis scales PreK → higher-ed later.

export type CEFR = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';

export interface LangCard {
  id: string;
  term: string;          // the word in the target language
  translation: string;   // English
  emoji?: string;
  example?: string;          // a short sentence in the target language
  exampleEn?: string;        // its English translation
}

export interface LangLesson {
  id: string;
  title: string;
  cefr: CEFR;
  emoji: string;
  cards: LangCard[];
}

export interface Language {
  id: string;
  label: string;
  flag: string;
  /** BCP-47 voice tag for Web-Speech listen/repeat. */
  voice: string;
  blurb: string;
  lessons: LangLesson[];
}

// Shared lesson scaffolding so each language mirrors the same four A1 themes.
const GREETINGS = (cards: LangCard[]): LangLesson => ({ id: 'greetings', title: 'Greetings', cefr: 'A1', emoji: '👋', cards });
const NUMBERS   = (cards: LangCard[]): LangLesson => ({ id: 'numbers',   title: 'Numbers 1–10', cefr: 'A1', emoji: '🔢', cards });
const COLORS    = (cards: LangCard[]): LangLesson => ({ id: 'colors',    title: 'Colors', cefr: 'A1', emoji: '🎨', cards });
const FOOD      = (cards: LangCard[]): LangLesson => ({ id: 'food',      title: 'Food & Drink', cefr: 'A1', emoji: '🍎', cards });

export const LANGUAGES: Language[] = [
  {
    id: 'es', label: 'Spanish', flag: '🇪🇸', voice: 'es-ES',
    blurb: 'Spoken by ~500 million people across 20+ countries.',
    lessons: [
      GREETINGS([
        { id: 'hola', term: 'hola', translation: 'hello', emoji: '👋', example: '¡Hola! ¿Cómo estás?', exampleEn: 'Hi! How are you?' },
        { id: 'adios', term: 'adiós', translation: 'goodbye', emoji: '👋', example: 'Adiós, hasta mañana.', exampleEn: 'Goodbye, see you tomorrow.' },
        { id: 'gracias', term: 'gracias', translation: 'thank you', emoji: '🙏', example: 'Muchas gracias.', exampleEn: 'Thank you very much.' },
        { id: 'porfavor', term: 'por favor', translation: 'please', emoji: '🤲' },
        { id: 'si', term: 'sí', translation: 'yes', emoji: '✅' },
        { id: 'no', term: 'no', translation: 'no', emoji: '❌' },
        { id: 'buenosdias', term: 'buenos días', translation: 'good morning', emoji: '🌅' },
      ]),
      NUMBERS([
        { id: 'uno', term: 'uno', translation: 'one', emoji: '1️⃣' }, { id: 'dos', term: 'dos', translation: 'two', emoji: '2️⃣' },
        { id: 'tres', term: 'tres', translation: 'three', emoji: '3️⃣' }, { id: 'cuatro', term: 'cuatro', translation: 'four', emoji: '4️⃣' },
        { id: 'cinco', term: 'cinco', translation: 'five', emoji: '5️⃣' }, { id: 'seis', term: 'seis', translation: 'six', emoji: '6️⃣' },
        { id: 'siete', term: 'siete', translation: 'seven', emoji: '7️⃣' }, { id: 'ocho', term: 'ocho', translation: 'eight', emoji: '8️⃣' },
      ]),
      COLORS([
        { id: 'rojo', term: 'rojo', translation: 'red', emoji: '🔴' }, { id: 'azul', term: 'azul', translation: 'blue', emoji: '🔵' },
        { id: 'verde', term: 'verde', translation: 'green', emoji: '🟢' }, { id: 'amarillo', term: 'amarillo', translation: 'yellow', emoji: '🟡' },
        { id: 'negro', term: 'negro', translation: 'black', emoji: '⚫' }, { id: 'blanco', term: 'blanco', translation: 'white', emoji: '⚪' },
      ]),
      FOOD([
        { id: 'agua', term: 'agua', translation: 'water', emoji: '💧' }, { id: 'pan', term: 'pan', translation: 'bread', emoji: '🍞' },
        { id: 'manzana', term: 'manzana', translation: 'apple', emoji: '🍎' }, { id: 'leche', term: 'leche', translation: 'milk', emoji: '🥛' },
        { id: 'cafe', term: 'café', translation: 'coffee', emoji: '☕' }, { id: 'queso', term: 'queso', translation: 'cheese', emoji: '🧀' },
      ]),
    ],
  },
  {
    id: 'fr', label: 'French', flag: '🇫🇷', voice: 'fr-FR',
    blurb: 'An official language on five continents.',
    lessons: [
      GREETINGS([
        { id: 'bonjour', term: 'bonjour', translation: 'hello', emoji: '👋', example: 'Bonjour, ça va ?', exampleEn: 'Hello, how are you?' },
        { id: 'aurevoir', term: 'au revoir', translation: 'goodbye', emoji: '👋' },
        { id: 'merci', term: 'merci', translation: 'thank you', emoji: '🙏' },
        { id: 'silvousplait', term: "s'il vous plaît", translation: 'please', emoji: '🤲' },
        { id: 'oui', term: 'oui', translation: 'yes', emoji: '✅' }, { id: 'non', term: 'non', translation: 'no', emoji: '❌' },
        { id: 'bonsoir', term: 'bonsoir', translation: 'good evening', emoji: '🌆' },
      ]),
      NUMBERS([
        { id: 'un', term: 'un', translation: 'one', emoji: '1️⃣' }, { id: 'deux', term: 'deux', translation: 'two', emoji: '2️⃣' },
        { id: 'trois', term: 'trois', translation: 'three', emoji: '3️⃣' }, { id: 'quatre', term: 'quatre', translation: 'four', emoji: '4️⃣' },
        { id: 'cinq', term: 'cinq', translation: 'five', emoji: '5️⃣' }, { id: 'six', term: 'six', translation: 'six', emoji: '6️⃣' },
        { id: 'sept', term: 'sept', translation: 'seven', emoji: '7️⃣' }, { id: 'huit', term: 'huit', translation: 'eight', emoji: '8️⃣' },
      ]),
      COLORS([
        { id: 'rouge', term: 'rouge', translation: 'red', emoji: '🔴' }, { id: 'bleu', term: 'bleu', translation: 'blue', emoji: '🔵' },
        { id: 'vert', term: 'vert', translation: 'green', emoji: '🟢' }, { id: 'jaune', term: 'jaune', translation: 'yellow', emoji: '🟡' },
        { id: 'noir', term: 'noir', translation: 'black', emoji: '⚫' }, { id: 'blanc', term: 'blanc', translation: 'white', emoji: '⚪' },
      ]),
      FOOD([
        { id: 'eau', term: "l'eau", translation: 'water', emoji: '💧' }, { id: 'pain', term: 'le pain', translation: 'bread', emoji: '🍞' },
        { id: 'pomme', term: 'la pomme', translation: 'apple', emoji: '🍎' }, { id: 'lait', term: 'le lait', translation: 'milk', emoji: '🥛' },
        { id: 'cafe', term: 'le café', translation: 'coffee', emoji: '☕' }, { id: 'fromage', term: 'le fromage', translation: 'cheese', emoji: '🧀' },
      ]),
    ],
  },
  {
    id: 'zh', label: 'Mandarin', flag: '🇨🇳', voice: 'zh-CN',
    blurb: 'The most-spoken first language in the world.',
    lessons: [
      GREETINGS([
        { id: 'nihao', term: '你好', translation: 'hello', emoji: '👋', example: '你好！', exampleEn: 'Hello!' },
        { id: 'zaijian', term: '再见', translation: 'goodbye', emoji: '👋' },
        { id: 'xiexie', term: '谢谢', translation: 'thank you', emoji: '🙏' },
        { id: 'qing', term: '请', translation: 'please', emoji: '🤲' },
        { id: 'shi', term: '是', translation: 'yes / to be', emoji: '✅' }, { id: 'bu', term: '不', translation: 'no / not', emoji: '❌' },
      ]),
      NUMBERS([
        { id: 'yi', term: '一', translation: 'one', emoji: '1️⃣' }, { id: 'er', term: '二', translation: 'two', emoji: '2️⃣' },
        { id: 'san', term: '三', translation: 'three', emoji: '3️⃣' }, { id: 'si', term: '四', translation: 'four', emoji: '4️⃣' },
        { id: 'wu', term: '五', translation: 'five', emoji: '5️⃣' }, { id: 'liu', term: '六', translation: 'six', emoji: '6️⃣' },
        { id: 'qi', term: '七', translation: 'seven', emoji: '7️⃣' }, { id: 'ba', term: '八', translation: 'eight', emoji: '8️⃣' },
      ]),
      COLORS([
        { id: 'hong', term: '红色', translation: 'red', emoji: '🔴' }, { id: 'lan', term: '蓝色', translation: 'blue', emoji: '🔵' },
        { id: 'lv', term: '绿色', translation: 'green', emoji: '🟢' }, { id: 'huang', term: '黄色', translation: 'yellow', emoji: '🟡' },
        { id: 'hei', term: '黑色', translation: 'black', emoji: '⚫' }, { id: 'bai', term: '白色', translation: 'white', emoji: '⚪' },
      ]),
      FOOD([
        { id: 'shui', term: '水', translation: 'water', emoji: '💧' }, { id: 'mianbao', term: '面包', translation: 'bread', emoji: '🍞' },
        { id: 'pingguo', term: '苹果', translation: 'apple', emoji: '🍎' }, { id: 'niunai', term: '牛奶', translation: 'milk', emoji: '🥛' },
        { id: 'kafei', term: '咖啡', translation: 'coffee', emoji: '☕' }, { id: 'cha', term: '茶', translation: 'tea', emoji: '🍵' },
      ]),
    ],
  },
];

export const languageById = (id: string): Language | undefined => LANGUAGES.find(l => l.id === id);
export const cardKey = (langId: string, cardId: string) => `${langId}:${cardId}`;

/** Every card in a language, flattened (for building distractor pools + due counts). */
export const allCardsFor = (lang: Language): LangCard[] => lang.lessons.flatMap(l => l.cards);
