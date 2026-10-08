import { EDU_FACTOIDS, type EduFactoid } from '../../data/eduFactoids';
import { MUSIC_FIGURES, FILM_FIGURES, type HistoryFigure } from '../historyData';
import type { ThesaCard } from './types';

/**
 * Adapters that lift existing platform content into Thesa cards WITHOUT rewriting it. The originals stay
 * the source of truth; ids are derived from the original ids so a stash entry always points at the same
 * thing across releases (never reuse or renumber a prefix).
 *
 *   thesa:edu:<factoid id>      ← data/eduFactoids.ts
 *   thesa:hist:<figure id>      ← services/historyData.ts (bio hook)
 *   thesa:histq:<figure id>     ← services/historyData.ts (quote)
 */

/** "Taleo · Film History" → "taleo". */
const serviceOf = (label: string) => (label.split('·')[0] || label).trim().toLowerCase().replace(/[^a-z]+/g, '') || 'plajah';

export function cardFromFactoid(f: EduFactoid): ThesaCard {
  return {
    id: `thesa:edu:${f.id}`, family: 'IDEA', kind: 'FACT', topic: f.subject.toLowerCase(),
    source: { service: serviceOf(f.source), refId: f.id, label: f.source },
    payload: { text: f.text, emoji: f.emoji },
    wellness: false,
    // These already ship in the education rail, which kids' accounts see.
    kidsSafe: true,
    status: 'LIVE',
  };
}

/** First sentence of a bio, as the card's one-idea hook. */
const firstSentence = (s: string) => {
  const m = s.trim().match(/^.+?[.!?](?=\s|$)/);
  const out = (m ? m[0] : s).trim();
  return out.length > 300 ? `${out.slice(0, 297).trimEnd()}…` : out;
};

const FIGURE_META = {
  MUSIC: { service: 'chora', label: 'Chora · Music History', view: 'CHORA_HISTORY', topic: 'music' },
  FILM_TV: { service: 'taleo', label: 'Taleo · Film History', view: 'TALEO_HISTORY', topic: 'film' },
} as const;

export function cardsFromFigure(f: HistoryFigure): ThesaCard[] {
  const m = FIGURE_META[f.category];
  const base = {
    family: 'IDEA' as const, topic: m.topic,
    source: { service: m.service, refId: f.id, label: m.label },
    deeper: { view: m.view },
    wellness: false,
    // Biographies are not reviewed for under-13 audiences yet; kids-mode excludes them until they are.
    kidsSafe: false,
    status: 'LIVE' as const,
  };
  const out: ThesaCard[] = [
    { ...base, id: `thesa:hist:${f.id}`, kind: 'FACT', payload: { headline: f.name, text: firstSentence(f.bio) } },
  ];
  if (f.quote && f.quote.trim().length >= 3 && f.quote.length <= 320) {
    out.push({ ...base, id: `thesa:histq:${f.id}`, kind: 'PRINCIPLE', payload: { text: f.quote.trim(), attribution: f.name } });
  }
  return out;
}

export const cardsFromEduFactoids = (): ThesaCard[] => EDU_FACTOIDS.map(cardFromFactoid);
export const cardsFromHistoryFigures = (): ThesaCard[] => [...MUSIC_FIGURES, ...FILM_FIGURES].flatMap(cardsFromFigure);
