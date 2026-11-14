// ─────────────────────────────────────────────────────────────────────────────
// scoreCatalog — the free sheet-music catalogue behind Chora's Sheet Music tab.
//
// The catalogue itself (public/scores/catalog.json, ~3,300 scores) is built offline by
// scripts/scores/buildScoreCatalog.mjs from OpenScore (CC0 MusicXML) and the Mutopia
// Project (public domain / CC BY / CC BY-SA LilyPond engravings, PDF + MIDI). It records
// facts only: composer dates, the edition's licence, file URLs.
//
// Two rights questions, answered separately:
//   • the EDITION — this engraving. Every entry carries an open licence, or it was not
//     put in the catalogue.
//   • the COMPOSITION — the music itself. Asked of services/publicDomainRights at runtime
//     from the composer's death year, so the answer moves forward each 1 January.
// Mutopia also takes new works their living authors licence to it; those are free to
// use under the licence even though the composition is not public domain.
//
// Loaded lazily (2 MB) and cached for the session. Never throws.
// ─────────────────────────────────────────────────────────────────────────────

import {
  assessComposition, summarizeVerdicts, type PDVerdict,
} from './publicDomainRights';

export type ScoreSource = 'OPENSCORE_LIEDER' | 'OPENSCORE_QUARTETS' | 'MUTOPIA';
export type EditionKind = 'CC0' | 'PD' | 'CC-BY' | 'CC-BY-SA';

export interface ScoreEntry {
  id: string;
  source: ScoreSource;
  title: string;
  /** Song cycle or set, for OpenScore Lieder. */
  set?: string;
  composer: string;
  born?: number;
  died?: number;
  /** Where the death year came from when the source left it blank. */
  datesFrom?: 'wikidata';
  traditional?: boolean;
  forces?: string;
  style?: string;
  /** Mutopia's free-text date ("18th C.", "1850"). */
  dateText?: string;
  edition: { label: string; kind: EditionKind; url: string };
  /** Who engraved it — CC BY / BY-SA require this credit. */
  engraver?: string;
  /** Zipped MusicXML, rendered in-app by Verovio. */
  mxlUrl?: string;
  pdfUrl?: string;
  pdfZipUrl?: string;
  midiUrl?: string;
  lyUrl?: string;
  sourceUrl: string;
  /** File kinds copied to Plajah's own store (scripts/scores/mirrorScores.mts). */
  mirrored?: ScoreFileKind[];
}

export type ScoreFileKind = 'pdf' | 'pdfZip' | 'mxl' | 'midi';

export interface ScoreCatalog {
  builtAt: string;
  stats: { total: number; bySource: Record<ScoreSource, number>; traditional: number; noDeathYear: number };
  entries: ScoreEntry[];
  /** Firebase Storage bucket holding Plajah's copies (public read under scores/). Absent until the mirror has run. */
  mirror?: { bucket: string; at: string };
}

const KIND_EXT: Record<ScoreFileKind, string> = { pdf: '.pdf', pdfZip: '-parts.zip', mxl: '.mxl', midi: '.mid' };
const KIND_FIELD: Record<ScoreFileKind, 'pdfUrl' | 'pdfZipUrl' | 'mxlUrl' | 'midiUrl'> = {
  pdf: 'pdfUrl', pdfZip: 'pdfZipUrl', mxl: 'mxlUrl', midi: 'midiUrl',
};

/** Object-store key for one file of a score. Deterministic, so the catalogue never stores keys. */
export const mirrorKey = (e: Pick<ScoreEntry, 'id' | 'source'>, kind: ScoreFileKind): string =>
  `scores/v1/${e.source.toLowerCase()}/${e.id}${KIND_EXT[kind]}`;

/** Plajah's copy in Firebase Storage when there is one, otherwise the original source. */
export function scoreFileUrl(catalog: Pick<ScoreCatalog, 'mirror'> | null, e: ScoreEntry, kind: ScoreFileKind): string | undefined {
  const source = e[KIND_FIELD[kind]];
  if (!source) return undefined;
  if (catalog?.mirror && e.mirrored?.includes(kind)) {
    return `https://firebasestorage.googleapis.com/v0/b/${catalog.mirror.bucket}/o/${encodeURIComponent(mirrorKey(e, kind))}?alt=media`;
  }
  return source;
}

/** The original upstream URL, for a fallback when our copy can't be reached. */
export const scoreSourceFileUrl = (e: ScoreEntry, kind: ScoreFileKind) => e[KIND_FIELD[kind]];

export const SOURCE_LABEL: Record<ScoreSource, string> = {
  OPENSCORE_LIEDER: 'OpenScore Lieder',
  OPENSCORE_QUARTETS: 'OpenScore String Quartets',
  MUTOPIA: 'Mutopia Project',
};

export const SOURCE_HOME: Record<ScoreSource, string> = {
  OPENSCORE_LIEDER: 'https://github.com/OpenScore/Lieder',
  OPENSCORE_QUARTETS: 'https://github.com/OpenScore/StringQuartets',
  MUTOPIA: 'https://www.mutopiaproject.org',
};

let cached: Promise<ScoreCatalog | null> | null = null;

export function loadScoreCatalog(url = '/scores/catalog.json'): Promise<ScoreCatalog | null> {
  if (!cached) {
    cached = fetch(url)
      .then(r => (r.ok ? r.json() : null))
      .catch(() => null)
      .then(c => { if (!c) cached = null; return c; });
  }
  return cached;
}

// ── Rights ───────────────────────────────────────────────────────────────────

/** Countries shown on each score. Mexico's life + 100 is the strictest common term. */
export const SCORE_JURISDICTIONS = ['US', 'EU', 'UK', 'CA', 'MX', 'JP', 'IN', 'CN'];

export interface ScoreRights {
  /** The music itself, per country. */
  composition: PDVerdict[];
  compositionSummary: string;
  /** True when the music is public domain in the US, where Plajah serves from. */
  compositionFreeUS: boolean;
  /** One line for a card. */
  label: string;
  /** What the person may do with this file, in plain words. */
  use: string;
}

export function scoreRights(e: ScoreEntry, now: Date = new Date()): ScoreRights {
  const composition = assessComposition(
    { composerDeathYear: e.died, traditional: e.traditional },
    SCORE_JURISDICTIONS,
    now,
  );
  const compositionFreeUS = composition.find(v => v.jurisdiction === 'US')?.status === 'PUBLIC_DOMAIN';
  const credit = e.engraver ? ` Credit the engraver, ${e.engraver}, and ${SOURCE_LABEL[e.source]}.` : ` Credit ${SOURCE_LABEL[e.source]}.`;
  const use =
    e.edition.kind === 'CC0' || e.edition.kind === 'PD'
      ? 'This edition is public domain: print it, perform it, record it, arrange it, sell copies — no permission needed.'
      : e.edition.kind === 'CC-BY'
        ? `Free to print, perform, record and adapt, including commercially.${credit}`
        : `Free to print, perform, record and adapt, including commercially.${credit} Arrangements of this file must be shared under CC BY-SA too.`;
  // The US counts from publication, which the sources don't record, so a composer who died
  // after 1926 leaves the US question open. Say what we know rather than guess either way.
  const freeAbroad = composition.filter(v => v.jurisdiction !== 'US' && v.status === 'PUBLIC_DOMAIN').length;
  const label = compositionFreeUS
    ? `Public domain music · ${e.edition.label} edition`
    : e.died !== undefined
      ? `Music free in ${freeAbroad} of ${composition.length - 1} countries · ${e.edition.label} edition`
      : `${e.edition.label} edition · licensed through ${SOURCE_LABEL[e.source]}`;
  return { composition, compositionSummary: summarizeVerdicts(composition), compositionFreeUS, label, use };
}

// ── Browsing ─────────────────────────────────────────────────────────────────

/** Shelves are filters over the catalogue — styles merge Mutopia's spellings. */
export interface ScoreShelf {
  id: string;
  label: string;
  blurb: string;
  match: (e: ScoreEntry) => boolean;
}

const style = (e: ScoreEntry) => (e.style || '').toLowerCase();
const forces = (e: ScoreEntry) => (e.forces || '').toLowerCase();

export const SCORE_SHELVES: ScoreShelf[] = [
  { id: 'all', label: 'Everything', blurb: 'Every score in the catalogue.', match: () => true },
  { id: 'folk', label: 'Folk & Traditional', blurb: 'Folk songs, carols and traditional tunes, with no author to count from — the songs belong to everyone. The engraving is credited.', match: e => !!e.traditional || /folk|traditional/.test(style(e)) },
  { id: 'hymns', label: 'Hymns & Sacred', blurb: 'Hymn tunes, chorales and psalm settings, from the Genevan Psalter to the gospel songbook.', match: e => /hymn|gospel|sacred|chorale/.test(style(e)) },
  { id: 'lieder', label: 'Art Song', blurb: 'OpenScore\'s complete Lieder corpus — Schubert to Lili Boulanger, voice and piano.', match: e => e.source === 'OPENSCORE_LIEDER' || style(e) === 'song' },
  { id: 'quartets', label: 'String Quartets', blurb: 'Haydn to Bartók, every part engraved in full score.', match: e => e.source === 'OPENSCORE_QUARTETS' || /quartet/.test(forces(e)) },
  { id: 'renaissance', label: 'Renaissance', blurb: 'Lute songs, madrigals and dance music.', match: e => style(e) === 'renaissance' },
  { id: 'baroque', label: 'Baroque', blurb: 'Bach, Handel, Telemann, Vivaldi and the dance suite.', match: e => style(e) === 'baroque' },
  { id: 'classical', label: 'Classical', blurb: 'Mozart, Haydn, Beethoven and the guitar school of Sor and Giuliani.', match: e => /^classi/.test(style(e)) },
  { id: 'romantic', label: 'Romantic', blurb: 'Chopin, Schumann, Brahms, Tchaikovsky.', match: e => /^romanti/.test(style(e)) },
  { id: 'ragtime', label: 'Ragtime, Jazz & March', blurb: 'Joplin rags, Sousa marches, early jazz and dance tunes.', match: e => /jazz|march|popular|dance|rag/.test(style(e)) },
  { id: 'guitar', label: 'Guitar', blurb: 'The classical guitar repertoire: Sor, Giuliani, Carcassi, Aguado.', match: e => /guitar/.test(forces(e)) },
  { id: 'piano', label: 'Piano', blurb: 'Solo keyboard music of every period.', match: e => /^(piano|harpsichord|keyboard|clavichord)/.test(forces(e)) },
];

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function filterScores(entries: ScoreEntry[], shelfId: string, query: string): ScoreEntry[] {
  const shelf = SCORE_SHELVES.find(s => s.id === shelfId) ?? SCORE_SHELVES[0];
  const words = fold(query.trim()).split(/\s+/).filter(Boolean);
  return entries.filter(e => {
    if (!shelf.match(e)) return false;
    if (!words.length) return true;
    const hay = fold(`${e.title} ${e.set ?? ''} ${e.composer} ${e.forces ?? ''} ${e.style ?? ''}`);
    return words.every(w => hay.includes(w));
  });
}
