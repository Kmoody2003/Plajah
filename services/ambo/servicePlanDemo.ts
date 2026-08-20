// Demo service for the ProPresenter-style Ambo presenter (AmboProPresenter).
// Real showModel data — a Library of shows and an ordered Playlist — so the new
// presenter renders genuine slides/groups/arrangements, not placeholders. Swap for
// a persisted service plan later; the shapes are the canonical showModel ones.

import { newId, type Show, type Slide } from './showModel';

// Group colours (Plajah palette): cyan / gold / magenta / lilac / orange.
const GC = {
  intro: '#00DAF3',
  return: '#E3C57E',
  welcome: '#D40055',
  alive: '#A98BFF',
  response: '#FF8C00',
  verse: '#00DAF3',
  chorus: '#FF8C00',
  bridge: '#A98BFF',
};

/** A text slide carrying a group + colour stripe (ProPresenter grouping). */
function slide(text: string, label: string, group?: string, groupColor?: string, stageNotes?: string): Slide {
  return {
    id: newId('sl'),
    label,
    group,
    groupColor,
    stageNotes,
    layers: [{
      id: newId('ly'),
      slot: 'slide',
      content: { kind: 'TEXT', blocks: [{ text, role: 'body' }] },
    }],
  };
}

// ── The sermon: grouped like a ProPresenter presentation ──
const comingHome: Show = {
  id: newId('show'),
  title: 'Coming Home',
  kind: 'PRESENTATION',
  author: 'Pastor Dave Ellison',
  tags: ['sermon', 'luke 15'],
  slides: [
    slide('Coming Home', 'Title', 'Intro', GC.intro, 'Open cold — let the title sit before you speak.'),
    slide('Lost & Found', 'Lost & Found', 'Intro', GC.intro),
    slide('The Father Runs', 'The Father Runs', 'The Return', GC.return, 'Land the running father — scandalous for an elder to run. Pause after "compassion."'),
    slide('Compassion', 'Compassion', 'The Return', GC.return),
    slide('The Best Robe', 'The Best Robe', 'The Welcome', GC.welcome),
    slide('A Ring on His Hand', 'A Ring', 'The Welcome', GC.welcome),
    slide('Shoes on His Feet', 'Shoes', 'The Welcome', GC.welcome),
    slide('Kill the Fatted Calf', 'The Feast', 'The Welcome', GC.welcome),
    slide('Dead → Alive Again', 'Alive Again', 'Alive Again', GC.alive, 'Slow down. This is the hinge of the whole parable.'),
    slide('Lost, Now Found', 'Now Found', 'Alive Again', GC.alive),
    slide('Will You Come Home?', 'The Invitation', 'Response', GC.response, 'Band back up quietly under this. Give space.'),
    slide('Response', 'Response', 'Response', GC.response),
  ],
};

// ── A song: stored once, played by arrangement (V–C–V–C–B) ──
const gaylVerse = slide('You give life, You are love\nYou bring light to the darkness', 'Verse', 'Verse', GC.verse);
const gaylChorus = slide('Great are You, Lord', 'Chorus', 'Chorus', GC.chorus);
const gaylBridge = slide('All the earth will shout Your praise', 'Bridge', 'Bridge', GC.bridge);
const greatAreYouLord: Show = {
  id: newId('show'),
  title: 'Great Are You Lord',
  kind: 'SONG',
  author: 'All Sons & Daughters',
  ccliNumber: '6460220',
  copyright: '© 2012 Integrity Worship Music',
  slides: [gaylVerse, gaylChorus, gaylBridge],
  groups: [
    { name: 'Verse', slideIds: [gaylVerse.id], color: GC.verse },
    { name: 'Chorus', slideIds: [gaylChorus.id], color: GC.chorus },
    { name: 'Bridge', slideIds: [gaylBridge.id], color: GC.bridge },
  ],
  arrangement: ['Verse', 'Chorus', 'Verse', 'Chorus', 'Bridge', 'Chorus'],
};

const kingOfKings: Show = {
  id: newId('show'), title: 'King of Kings', kind: 'SONG', author: 'Hillsong Worship',
  slides: [slide('In the darkness we were waiting', 'Verse 1', 'Verse', GC.verse), slide('Praise the Father, praise the Son', 'Chorus', 'Chorus', GC.chorus)],
};

const scriptureReading: Show = {
  id: newId('show'), title: 'Scripture Reading — Luke 15', kind: 'SCRIPTURE',
  slides: [slide('Luke 15:11–24', 'Reading', 'Scripture', '#E3C57E')],
};

const announcements: Show = {
  id: newId('show'), title: 'Announcements', kind: 'ANNOUNCEMENT',
  slides: [slide('Welcome & Notices', 'Notices')],
};

const countdown: Show = {
  id: newId('show'), title: 'Pre-Service Countdown', kind: 'MEDIA',
  slides: [slide('Starting soon', 'Countdown')],
};

const response: Show = {
  id: newId('show'), title: 'O Come to the Altar', kind: 'SONG', author: 'Elevation Worship',
  slides: [slide('Are you hurting and broken within?', 'Verse', 'Verse', GC.verse), slide('O come to the altar', 'Chorus', 'Chorus', GC.chorus)],
};

/** The Library — every show available, ProPresenter-style. */
export const DEMO_LIBRARY: Show[] = [
  greatAreYouLord, kingOfKings, response, comingHome, scriptureReading, announcements, countdown,
];

export interface PlanItem {
  id: string;
  title: string;
  show: Show;
  plannedSec: number;
  /** The item currently on air. */
  live?: boolean;
}

/** The ordered service — the open playlist. */
export const DEMO_PLAYLIST: PlanItem[] = [
  { id: newId('pi'), title: 'Pre-Service Countdown', show: countdown, plannedSec: 300 },
  { id: newId('pi'), title: 'Welcome & Notices', show: announcements, plannedSec: 260 },
  { id: newId('pi'), title: 'Great Are You Lord', show: greatAreYouLord, plannedSec: 341 },
  { id: newId('pi'), title: 'King of Kings', show: kingOfKings, plannedSec: 372 },
  { id: newId('pi'), title: 'Scripture Reading — Luke 15', show: scriptureReading, plannedSec: 150 },
  { id: newId('pi'), title: 'Message — Coming Home', show: comingHome, plannedSec: 1680, live: true },
  { id: newId('pi'), title: 'Response — O Come to the Altar', show: response, plannedSec: 300 },
];

/** Pull the primary text off a slide for thumbnail/label rendering. */
export function slideText(s: Slide): string {
  for (const ly of s.layers) {
    if (ly.content.kind === 'TEXT') return ly.content.blocks.map(b => b.text).join(' ');
  }
  return s.label ?? '';
}
