// handwritingStories — the Story-Mode library for Penna. Short public-domain fables, adapted into
// very simple sentences a young writer can handwrite. Each page lists the words to write (lowercased,
// letters-only) and a `scene` id the reader draws and reveals as the words are written. All text is
// public domain (Aesop); the adaptations here are original simplifications, also free to use.
//
// Adding a story: keep pages to ~4–6 short words, prefer letters with stroke models
// (data/handwritingLetters.ts) — the reader falls back to a forgiving trace for any others.

import type { Story } from '../services/handwritingStoryEngine';

export const HANDWRITING_STORIES: Story[] = [
  {
    id: 'ant-and-grasshopper',
    title: 'The Ant and the Grasshopper',
    moral: 'There is a time to work and a time to play.',
    source: "Aesop's Fables",
    license: 'PD',
    accent: '#C9871F',
    pages: [
      { text: 'The ant works in the sun.',      words: ['the', 'ant', 'works', 'in', 'the', 'sun'], scene: 'ant-summer' },
      { text: 'The grasshopper sang all day.',   words: ['the', 'grasshopper', 'sang', 'all', 'day'], scene: 'grasshopper' },
      { text: 'Then the cold winter came.',      words: ['then', 'the', 'cold', 'winter', 'came'],   scene: 'winter' },
      { text: 'The ant had food to eat.',        words: ['the', 'ant', 'had', 'food', 'to', 'eat'],  scene: 'ant-cozy' },
    ],
  },
  {
    id: 'north-wind-and-sun',
    title: 'The North Wind and the Sun',
    moral: 'Gentleness wins where force fails.',
    source: "Aesop's Fables",
    license: 'PD',
    accent: '#36c5f0',
    pages: [
      { text: 'The wind and the sun had a test.', words: ['the', 'wind', 'and', 'the', 'sun', 'had', 'a', 'test'], scene: 'sun-wind' },
      { text: 'The wind blew hard and cold.',      words: ['the', 'wind', 'blew', 'hard', 'and', 'cold'],          scene: 'wind' },
      { text: 'The man held his coat tight.',      words: ['the', 'man', 'held', 'his', 'coat', 'tight'],          scene: 'traveler' },
      { text: 'The warm sun won the day.',         words: ['the', 'warm', 'sun', 'won', 'the', 'day'],             scene: 'sun' },
    ],
  },
];

export const storyById = (id: string): Story | undefined => HANDWRITING_STORIES.find(s => s.id === id);
