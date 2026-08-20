// Sacred Library — Buddhist corpus for the Sutra Reader.
//
// Bundled, offline, and public-domain so the reader is genuinely usable with no
// external API or licence risk. The Dhammapada text is F. Max Müller's 1881
// translation (Sacred Books of the East, vol. X) — public domain. The Heart Sutra
// is a widely-reproduced public-domain English rendering. This is a real starting
// corpus; more suttas can be appended to SUTRAS or loaded from a source later.

export interface SutraVerse {
  /** Verse/section number as shown, e.g. "1" or "—". */
  n: string;
  text: string;
}

export interface SutraChapter {
  id: string;
  title: string;
  verses: SutraVerse[];
}

export interface SutraText {
  id: string;
  title: string;
  /** e.g. "Pāli Canon · Khuddaka Nikāya". */
  collection: string;
  tradition: string;
  /** Translator + edition (attribution matters even for public domain). */
  translation: string;
  blurb: string;
  chapters: SutraChapter[];
}

export interface GlossaryTerm {
  term: string;
  pali: string;
  gloss: string;
}

export const SUTRAS: SutraText[] = [
  {
    id: 'dhammapada',
    title: 'The Dhammapada',
    collection: 'Pāli Canon · Khuddaka Nikāya',
    tradition: 'Theravāda (shared across traditions)',
    translation: 'F. Max Müller, 1881 · Sacred Books of the East X · public domain',
    blurb: 'A collection of 423 verses in 26 chapters — the most widely read of all Buddhist scriptures, a distillation of the path in memorable couplets.',
    chapters: [
      {
        id: 'twin-verses',
        title: '1 · The Twin-Verses (Yamaka-vagga)',
        verses: [
          { n: '1', text: 'All that we are is the result of what we have thought: it is founded on our thoughts, it is made up of our thoughts. If a man speaks or acts with an evil thought, pain follows him, as the wheel follows the foot of the ox that draws the carriage.' },
          { n: '2', text: 'All that we are is the result of what we have thought: it is founded on our thoughts, it is made up of our thoughts. If a man speaks or acts with a pure thought, happiness follows him, like a shadow that never leaves him.' },
          { n: '3', text: '“He abused me, he beat me, he defeated me, he robbed me,” — in those who harbour such thoughts hatred will never cease.' },
          { n: '4', text: '“He abused me, he beat me, he defeated me, he robbed me,” — in those who do not harbour such thoughts hatred will cease.' },
          { n: '5', text: 'For hatred does not cease by hatred at any time: hatred ceases by love, this is an old rule.' },
          { n: '6', text: 'The world does not know that we must all come to an end here; — but those who know it, their quarrels cease at once.' },
          { n: '7', text: 'He who lives looking for pleasures only, his senses uncontrolled, immoderate in his food, idle, and weak, Māra (the tempter) will certainly overthrow him, as the wind throws down a weak tree.' },
          { n: '8', text: 'He who lives without looking for pleasures, his senses well controlled, moderate in his food, faithful and strong, him Māra will certainly not overthrow, any more than the wind throws down a rocky mountain.' },
          { n: '9', text: 'He who wishes to put on the yellow dress without having cleansed himself from sin, who disregards temperance and truth, is unworthy of the yellow dress.' },
          { n: '10', text: 'But he who has cleansed himself from sin, is well grounded in all virtues, and regards also temperance and truth, he is indeed worthy of the yellow dress.' },
          { n: '11', text: 'They who imagine truth in untruth, and see untruth in truth, never arrive at truth, but follow vain desires.' },
          { n: '12', text: 'They who know truth in truth, and untruth in untruth, arrive at truth, and follow true desires.' },
          { n: '13', text: 'As rain breaks through an ill-thatched house, passion will break through an unreflecting mind.' },
          { n: '14', text: 'As rain does not break through a well-thatched house, passion will not break through a well-reflecting mind.' },
          { n: '15', text: 'The evil-doer mourns in this world, and he mourns in the next; he mourns in both. He mourns and suffers when he sees the evil of his own work.' },
          { n: '16', text: 'The virtuous man delights in this world, and he delights in the next; he delights in both. He delights and rejoices, when he sees the purity of his own work.' },
          { n: '17', text: 'The evil-doer suffers in this world, and he suffers in the next; he suffers in both. He suffers when he thinks of the evil he has done; he suffers more when going on the evil path.' },
          { n: '18', text: 'The virtuous man is happy in this world, and he is happy in the next; he is happy in both. He is happy when he thinks of the good he has done; he is still more happy when going on the good path.' },
          { n: '19', text: 'The thoughtless man, even if he can recite a large portion of the law, but is not a doer of it, has no share in the priesthood, but is like a cowherd counting the cows of others.' },
          { n: '20', text: 'The follower of the law, even if he can recite only a small portion, but, having forsaken passion and hatred and foolishness, possesses true knowledge and serenity of mind, he, caring for nothing in this world or that to come, has indeed a share in the priesthood.' },
        ],
      },
      {
        id: 'the-awakened',
        title: '14 · The Buddha (Buddha-vagga)',
        verses: [
          { n: '183', text: 'Not to commit any sin, to do good, and to purify one’s mind, that is the teaching of (all) the Awakened.' },
          { n: '184', text: 'The Awakened call patience the highest penance, long-suffering the highest Nirvāṇa; for he is not an anchorite who strikes others, he is not an ascetic who insults others.' },
          { n: '185', text: 'Not to blame, not to strike, to live restrained under the law, to be moderate in eating, to sleep and sit alone, and to dwell on the highest thoughts, — this is the teaching of the Awakened.' },
        ],
      },
      {
        id: 'happiness',
        title: '15 · Happiness (Sukha-vagga)',
        verses: [
          { n: '197', text: 'Let us live happily then, not hating those who hate us! Among men who hate us let us dwell free from hatred!' },
          { n: '201', text: 'Victory breeds hatred, for the conquered is unhappy. He who has given up both victory and defeat, he, the contented, is happy.' },
          { n: '204', text: 'Health is the greatest of gifts, contentedness the best riches; trust is the best of relationships, Nirvāṇa the highest happiness.' },
        ],
      },
    ],
  },
  {
    id: 'heart-sutra',
    title: 'The Heart Sutra',
    collection: 'Prajñāpāramitā · Mahāyāna',
    tradition: 'Mahāyāna (Zen, Tibetan, Pure Land)',
    translation: 'Public-domain English rendering (Prajñāpāramitā-hṛdaya)',
    blurb: 'The shortest and most chanted of the Perfection-of-Wisdom sutras — the teaching of emptiness (śūnyatā) in a single page.',
    chapters: [
      {
        id: 'core',
        title: 'The Heart of Perfect Wisdom',
        verses: [
          { n: '—', text: 'Avalokiteśvara Bodhisattva, practising deep Prajñāpāramitā, clearly saw that all five aggregates are empty, and so was freed from all suffering and distress.' },
          { n: '—', text: 'Śāriputra, form is not different from emptiness; emptiness is not different from form. Form itself is emptiness; emptiness itself is form. The same is true of feelings, perceptions, mental formations, and consciousness.' },
          { n: '—', text: 'Śāriputra, all things are marked by emptiness: neither arising nor ceasing, neither defiled nor pure, neither increasing nor decreasing.' },
          { n: '—', text: 'Therefore in emptiness there is no form, no feeling, no perception, no mental formations, no consciousness; no eye, ear, nose, tongue, body, mind; no realm of sight, no realm of consciousness.' },
          { n: '—', text: 'There is no ignorance and no end of ignorance, no old-age-and-death and no end of them; no suffering, no origin, no cessation, no path; no knowledge and no attainment, for there is nothing to attain.' },
          { n: '—', text: 'The Bodhisattva, resting in Prajñāpāramitā, has no hindrance in the mind; without hindrance there is no fear, and, freed from all delusion, he dwells in Nirvāṇa.' },
          { n: '—', text: 'So proclaim the mantra of Prajñāpāramitā, the great mantra, the unequalled mantra, which removes all suffering and is true, not false — say it thus:' },
          { n: '—', text: 'Gate gate pāragate pārasaṃgate bodhi svāhā. (Gone, gone, gone beyond, gone altogether beyond — awakening, so be it.)' },
        ],
      },
    ],
  },
];

export const SUTRA_GLOSSARY: GlossaryTerm[] = [
  { term: 'Dukkha', pali: 'dukkha', gloss: 'Suffering, unsatisfactoriness — the first Noble Truth; the friction of a conditioned life.' },
  { term: 'Anicca', pali: 'anicca', gloss: 'Impermanence — all conditioned things arise and pass; one of the three marks of existence.' },
  { term: 'Anattā', pali: 'anattā', gloss: 'Not-self — the absence of a fixed, independent self behind experience.' },
  { term: 'Nirvāṇa', pali: 'nibbāna', gloss: 'The blowing-out of craving; freedom from the cycle of suffering and rebirth.' },
  { term: 'Karma', pali: 'kamma', gloss: 'Intentional action and its fruit — the moral logic of cause and effect.' },
  { term: 'Dharma', pali: 'dhamma', gloss: 'The teaching of the Buddha; also, the way things truly are.' },
  { term: 'Saṅgha', pali: 'saṅgha', gloss: 'The community of practitioners — the third of the Three Jewels.' },
  { term: 'Mettā', pali: 'mettā', gloss: 'Loving-kindness — the wish that all beings be well; a foundational meditation.' },
  { term: 'Śūnyatā', pali: 'suññatā', gloss: 'Emptiness — that things lack independent, inherent existence; central to the Heart Sutra.' },
  { term: 'Bodhi', pali: 'bodhi', gloss: 'Awakening, enlightenment — seeing reality as it is.' },
  { term: 'Saṃsāra', pali: 'saṃsāra', gloss: 'The round of birth, death, and rebirth driven by craving and ignorance.' },
];
