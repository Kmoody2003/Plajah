// Sacred Library — the multi-faith model.
//
// The Sacred Library is a learning experience for the world's faiths. Every faith
// is presented as a "wing" built from the SAME ten galleries (the template below),
// so a new tradition is DATA, not new UI. Christianity is the reference build — its
// wing renders the existing BibleExperience (Lectio + all its content), so nothing
// there is lost. Other faiths reuse the ten galleries and are free to DEVIATE where
// the tradition is genuinely unlike the others (a non-theistic faith has teachings,
// not a creed; schools, not denominations).

export interface FaithGallery {
  /** 01–10, matches the template order. */
  no: string;
  title: string;
  /** Uppercase kicker, e.g. "Sacred Texts". */
  kicker: string;
  /** A single emoji used as the gallery glyph. */
  icon: string;
  blurb: string;
  /** Chips of concrete contents. */
  items: string[];
  /** True when this gallery bends the template for this faith. */
  deviates?: boolean;
  /** Optional action label, e.g. "Open in the Sutra Reader". */
  cta?: string;
  /** When true, this gallery opens the wing's reader (Lectio or the Sutra Reader). */
  opensReader?: boolean;
}

export interface FaithDeviation {
  /** The template shape, e.g. "Beliefs & creeds". */
  from: string;
  /** How this faith realises it, e.g. "Teachings (Dharma) — non-theistic". */
  to: string;
}

/** A fully data-driven faith wing (everything except Christianity, which is BibleExperience). */
export interface FaithWingData {
  id: string;
  name: string;
  /** Faith symbol emoji. */
  symbol: string;
  tagline: string;
  /** Primary + secondary accent, layered over Plajah's dark ground. */
  accent: string;
  accent2: string;
  /** Uppercase line above the poster title. */
  posterEyebrow: string;
  /** Which deep reader this wing opens from its Sacred Texts gallery. */
  reader: 'bible' | 'sutra';
  facts: { label: string; value: string }[];
  deviations: FaithDeviation[];
  galleries: FaithGallery[];
}

/** Selector-card metadata for a faith in the hub. */
export interface FaithMeta {
  id: string;
  name: string;
  symbol: string;
  blurb: string;
  accent: string;
  status: 'model' | 'live' | 'research';
  /** 'bible' → renders BibleExperience; 'data' → renders FaithWing from FAITH_WINGS; null → not built. */
  wing: 'bible' | 'data' | null;
}

/** The ten galleries every faith wing is built from. Christianity sets the model. */
export const FAITH_TEMPLATE: { no: string; title: string; blurb: string }[] = [
  { no: '01', title: 'Sacred Texts', blurb: 'The canon + a deep reader for studying it.' },
  { no: '02', title: 'The Story', blurb: 'Origins to present, on a timeline.' },
  { no: '03', title: 'Key Figures', blurb: 'Founders, teachers, reformers, saints.' },
  { no: '04', title: 'Beliefs & Teachings', blurb: 'The core convictions and their logic.' },
  { no: '05', title: 'Practices', blurb: 'Worship, prayer, meditation, rites.' },
  { no: '06', title: 'Branches', blurb: 'The families within the tradition.' },
  { no: '07', title: 'Places & Art', blurb: 'Architecture, iconography, craft.' },
  { no: '08', title: 'Calendar', blurb: 'Feasts, holy days, the sacred year.' },
  { no: '09', title: 'Ethics & Living', blurb: 'How the faith shapes a life.' },
  { no: '10', title: 'Study Tools & Glossary', blurb: 'Readers, languages, key terms.' },
];

export const CHRISTIANITY_META: FaithMeta = {
  id: 'christianity',
  name: 'Christianity',
  symbol: '✝',
  blurb: 'The reference build. Everything in the Sacred Library today lives here — read and studied in Lectio.',
  accent: '#E3C57E',
  status: 'model',
  wing: 'data',
};

export const CHRISTIANITY: FaithWingData = {
  id: 'christianity',
  name: 'Christianity',
  symbol: '✝',
  tagline: '"In the beginning was the Word." A faith of covenant, cross, and resurrection.',
  accent: '#E3C57E',
  accent2: '#3E63B6',
  posterEyebrow: 'The reference build',
  reader: 'bible',
  facts: [
    { label: 'Origin', value: '1st c. Judea' },
    { label: 'Scripture', value: 'The Bible, 66+ books' },
    { label: 'Adherents', value: '~2.4 billion' },
    { label: 'Symbol', value: 'The cross' },
  ],
  deviations: [],
  galleries: [
    {
      no: '01', kicker: 'Sacred Texts', title: 'The Bible — read & studied in Lectio', icon: '📖',
      blurb: 'The whole canon opens in Lectio, our Logos-class study Bible: reverse interlinear, commentaries, word studies, cross-references and your own notes. This is where the Sacred Library’s depth lives.',
      items: ['Old & New Testament', 'Reverse interlinear', 'Commentaries', 'Word study', 'Reading plans'],
      cta: 'Open in Lectio', opensReader: true,
    },
    { no: '02', kicker: 'The Story', title: 'Two thousand years', icon: '🕰',
      blurb: 'From the early church through councils, schisms, and reform to the global church.',
      items: ['Apostolic age', 'Nicaea 325', '1054 · 1517'] },
    { no: '03', kicker: 'Key Figures', title: 'Witnesses', icon: '👤',
      blurb: 'Jesus and the apostles, the church fathers, saints, and reformers.',
      items: ['Paul', 'Augustine', 'Aquinas', 'Luther'] },
    { no: '04', kicker: 'Beliefs', title: 'The creeds', icon: '✝',
      blurb: 'Trinity, incarnation, atonement, resurrection — the convictions of the Nicene Creed.',
      items: ['One God, three persons', 'Grace', 'Resurrection'] },
    { no: '05', kicker: 'Practices', title: 'Worship & sacrament', icon: '🙏',
      blurb: 'Prayer, baptism, communion, and the gathered liturgy of the church.',
      items: ['Baptism', 'Eucharist', 'Prayer'] },
    { no: '06', kicker: 'Branches', title: 'One faith, many families', icon: '🌿',
      blurb: 'Catholic, Orthodox, and the Protestant traditions and their distinctives.',
      items: ['Catholic', 'Orthodox', 'Protestant'] },
    { no: '07', kicker: 'Places & Art', title: 'Cathedral & icon', icon: '⛪',
      blurb: 'Basilicas and chapels, illuminated manuscripts, iconography and sacred music.',
      items: ['Architecture', 'Icons', 'Hymnody'] },
    { no: '08', kicker: 'Calendar', title: 'The liturgical year', icon: '📅',
      blurb: 'Advent to Pentecost — the seasons that retell the story annually.',
      items: ['Advent', 'Easter', 'Pentecost'] },
    { no: '09', kicker: 'Ethics & Living', title: 'Love God & neighbour', icon: '⚖',
      blurb: 'The Sermon on the Mount, the fruits of the Spirit, and works of mercy.',
      items: ['Beatitudes', 'Ten Commandments'] },
    { no: '10', kicker: 'Study Tools', title: 'Go deeper', icon: '🔎',
      blurb: 'Greek & Hebrew, concordances, a glossary of terms — powered by Lectio.',
      items: ['Koine Greek', 'Biblical Hebrew', 'Glossary'] },
  ],
};

export const BUDDHISM: FaithWingData = {
  id: 'buddhism',
  name: 'Buddhism',
  symbol: '☸',
  tagline: '"All that we are is the result of what we have thought." A path of awakening — no creator, but a way out of suffering.',
  accent: '#E8912D',
  accent2: '#9A3B2C',
  posterEyebrow: 'Modeled on Christianity · free to deviate',
  reader: 'sutra',
  facts: [
    { label: 'Origin', value: '~5th c. BCE, India' },
    { label: 'Texts', value: 'Tripiṭaka + sutras' },
    { label: 'Adherents', value: '~500 million' },
    { label: 'Symbol', value: 'The Dharma wheel' },
  ],
  deviations: [
    { from: 'Beliefs & creeds', to: 'Teachings (Dharma) — non-theistic; no creator God' },
    { from: 'Denominations', to: 'Vehicles & schools (Theravāda · Mahāyāna · Vajrayāna)' },
    { from: 'Worship of a deity', to: 'Meditation & cultivation of mind (not petition to a god)' },
    { from: 'A single closed canon', to: 'Multiple canons (Pāli, Chinese, Tibetan) + oral tradition' },
  ],
  galleries: [
    {
      no: '01', kicker: 'Sacred Texts', title: 'The Tripiṭaka & sutras', icon: '📜',
      blurb: 'The same deep reader that powers Lectio, tuned for Buddhist canons: the Pāli "three baskets," Mahāyāna sutras, and Tibetan collections — with Pāli/Sanskrit glosses and parallel translations.',
      items: ['Pāli Canon', 'Dhammapada', 'Heart & Lotus Sutra', 'Pāli · Sanskrit gloss'],
      cta: 'Open in the Sutra Reader', opensReader: true,
    },
    { no: '02', kicker: 'The Story', title: 'From the Bodhi tree', icon: '🕰',
      blurb: "Siddhartha's awakening, Ashoka's spread, and the journey across Asia and beyond.",
      items: ['Enlightenment', 'Ashoka', 'Silk Road'] },
    { no: '03', kicker: 'Key Figures', title: 'The awakened & their heirs', icon: '👤',
      blurb: 'The Buddha and disciples, great commentators, and living teachers.',
      items: ['The Buddha', 'Ānanda', 'Nāgārjuna', 'Dalai Lama'] },
    { no: '04', kicker: 'Teachings', title: 'The Dharma', icon: '☸', deviates: true,
      blurb: 'Four Noble Truths, the Eightfold Path, the three marks, dependent origination — not a creed but a diagnosis and a way.',
      items: ['Four Noble Truths', 'Eightfold Path', 'Karma · Rebirth', 'Nirvāṇa'] },
    { no: '05', kicker: 'Practices', title: 'Cultivating the mind', icon: '🧘',
      blurb: 'Meditation, chanting, the precepts, and pilgrimage — training rather than petition.',
      items: ['Samatha · Vipassanā', 'Zazen', 'Five Precepts'] },
    { no: '06', kicker: 'Vehicles', title: 'Schools, not sects', icon: '🌿', deviates: true,
      blurb: 'Three great vehicles and their lineages — Theravāda, Mahāyāna, Vajrayāna, Zen, Pure Land.',
      items: ['Theravāda', 'Mahāyāna', 'Vajrayāna'] },
    { no: '07', kicker: 'Places & Art', title: 'Stupa & mandala', icon: '🛕',
      blurb: 'Temples and stupas, Bodh Gaya, mandalas, thangka painting, and the Buddha-rūpa.',
      items: ['Stupa', 'Mandala', 'Thangka'] },
    { no: '08', kicker: 'Calendar', title: 'Days of observance', icon: '📅',
      blurb: "Vesak marks the Buddha's birth, awakening, and passing; Uposatha days for renewal.",
      items: ['Vesak', 'Uposatha', 'Losar'] },
    { no: '09', kicker: 'Ethics & Living', title: 'Compassion & the middle way', icon: '⚖',
      blurb: "The precepts, loving-kindness (mettā), and the bodhisattva's vow to free all beings.",
      items: ['Ahiṃsā', 'Mettā · Karuṇā', 'Middle Way'] },
    { no: '10', kicker: 'Study Tools', title: 'Read the source', icon: '🔎',
      blurb: 'Pāli and Sanskrit tools, cross-canon lookup, and a glossary of terms.',
      items: ['Pāli', 'Sanskrit', 'Glossary'] },
  ],
};

/** Data-driven wings, keyed by id. Each wing's Sacred Texts gallery opens its reader
 *  (Christianity → Lectio/BibleExperience, Buddhism → the Sutra Reader). */
export const FAITH_WINGS: Record<string, FaithWingData> = {
  christianity: CHRISTIANITY,
  buddhism: BUDDHISM,
};

/** The faith selector, in display order. */
export const FAITHS: FaithMeta[] = [
  CHRISTIANITY_META,
  { id: 'buddhism', name: 'Buddhism', symbol: '☸', accent: '#E8912D', status: 'live', wing: 'data',
    blurb: 'Modeled on Christianity, free to deviate — a path of awakening with no creator God.' },
  { id: 'islam', name: 'Islam', symbol: '☪', accent: '#2FA36B', status: 'research', wing: null,
    blurb: 'In research — Qur’an, Sunnah, the Five Pillars, and the schools.' },
  { id: 'judaism', name: 'Judaism', symbol: '✡', accent: '#5B8DEF', status: 'research', wing: null,
    blurb: 'In research — Tanakh & Talmud, covenant, and the festival year.' },
  { id: 'hinduism', name: 'Hinduism', symbol: '🕉', accent: '#E0613C', status: 'research', wing: null,
    blurb: 'In research — Vedas & epics, dharma, and many paths.' },
  { id: 'sikhism', name: 'Sikhism', symbol: '☬', accent: '#E8A13B', status: 'research', wing: null,
    blurb: 'In research — Guru Granth Sahib, the ten Gurus, and seva.' },
];
