// composerLifespans — death years for the composers in data/repertoire.ts, so the rights
// engine (services/publicDomainRights) can say where each work is free, country by country.
// Most of the world counts a composition's copyright from the composer's death.
//
// 'Anonymous' is treated as a traditional work: there is no author to count from.

import { assessComposition, parseYear, type PDVerdict } from '../services/publicDomainRights';

export const COMPOSER_DIED: Record<string, number> = {
  'Hildegard von Bingen': 1179,
  'Guillaume de Machaut': 1377,
  'Josquin des Prez': 1521,
  'Giovanni Pierluigi da Palestrina': 1594,
  'William Byrd': 1623,
  'Johann Pachelbel': 1706,
  'Antonio Vivaldi': 1741,
  'Johann Sebastian Bach': 1750,
  'George Frideric Handel': 1759,
  'Wolfgang Amadeus Mozart': 1791,
  'Joseph Haydn': 1809,
  'Ludwig van Beethoven': 1827,
  'Franz Schubert': 1828,
  'Fanny Hensel': 1847,
  'Frédéric Chopin': 1849,
  'Robert Schumann': 1856,
  'Richard Wagner': 1883,
  'Pyotr Ilyich Tchaikovsky': 1893,
  'Clara Schumann': 1896,
  'Johannes Brahms': 1897,
  'Hugo Wolf': 1903,
  'Antonín Dvořák': 1904,
  'Gustav Mahler': 1911,
  'Scott Joplin': 1917,
  'Claude Debussy': 1918,
  'Lili Boulanger': 1918,
  'Erik Satie': 1925,
  'John Philip Sousa': 1932,
  'Gustav Holst': 1934,
  'Maurice Ravel': 1937,
  'Arnold Schoenberg': 1951,
};

/** The countries shown on a repertoire work. Mexico (life + 100) is the strictest common term. */
export const REPERTOIRE_JURISDICTIONS = ['US', 'EU', 'UK', 'CA', 'MX', 'JP'];

/**
 * Where is this repertoire work free? `year` is the work's own year string ("1909",
 * "c. 1150", "1914–16"). It is a composition year, and publication can come later, so it
 * is only used as the US publication year when it is safely old (1920 or earlier).
 */
export function repertoireRights(work: { composer: string; year?: string }): PDVerdict[] {
  const y = parseYear(work.year);
  return assessComposition(
    {
      traditional: work.composer === 'Anonymous',
      composerDeathYear: COMPOSER_DIED[work.composer],
      publishedYear: y !== undefined && y <= 1920 ? y : undefined,
    },
    REPERTOIRE_JURISDICTIONS,
  );
}
