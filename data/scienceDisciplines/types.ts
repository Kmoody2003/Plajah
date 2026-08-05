// Shared contract for Plajah Academia / Labs science-discipline studios.
//
// One rich `ScienceDisciplineView` renders any discipline from a module conforming to
// `ScienceDisciplineData`. This mirrors the bespoke World History / Architecture studios but is
// data-driven so every science discipline gets the same depth: curated pioneers (live Wikipedia
// via MuseumHall), core concepts, an era timeline, laws/formulas rendered with KaTeX, optional
// interactive simulators, a tools & APIs directory, a free-textbook + arXiv library, and a
// tag-filtered social feed.

import type { MuseumFigure, MuseumHallDef } from '../../components/MuseumHall';

/** A piece of primary/historical evidence for a concept — an experiment, a document, a dataset. */
export interface Evidence {
  label: string;          // 'The Michelson–Morley experiment (1887)'
  detail?: string;        // one-line explanation of what it showed
  url?: string;           // link to the paper / archive / museum object
  kind?: 'experiment' | 'document' | 'dataset' | 'observation' | 'proof';
}

/** A core idea / principle in the discipline. Optional wikiSlug lights up a live thumbnail + bio. */
export interface Concept {
  id: string;
  name: string;
  blurb: string;
  wikiSlug?: string;
  tags?: string[];        // e.g. ['quantum', 'thermodynamics'] — also seeds interest chips
  // ── Deep-dive fields (all optional; the full-page view shows whatever is present) ──
  deepDive?: string;      // 2–4 sentence richer explanation for the detail page
  simulatorId?: string;   // an interactive experiment from the Simulators registry
  lawIds?: string[];      // ids of ScienceLaw entries in this discipline that formalise it
  videoIds?: string[];    // curated YouTube ids (from this discipline's `videos`) to feature
  evidence?: Evidence[];  // the experiments / documents / data that established it
}

/** A curated YouTube video for a discipline's Watch library. `id` embeds; `query` is the
 *  reliable fallback (opens a YouTube search) so a stale id never becomes a dead end. */
export interface CuratedVideo {
  id: string;             // YouTube video id
  title: string;
  channel: string;
  topic?: string;         // grouping label, e.g. 'Quantum', 'Foundations'
  blurb?: string;
  query?: string;         // fallback search string (title + channel); defaults to `${title} ${channel}`
}

/** A period in the discipline's development (parallels World History's HistoryEra). */
export interface DisciplineEra {
  id: string;
  title: string;
  span: string;           // 'c.1900–1930' or 'Antiquity'
  essay: string;
  developments: string[];
  turningPoints: string[];
}

/** A law / formula rendered with KaTeX (parallels architecture's ArchFormula). */
export interface ScienceLaw {
  id: string;
  category: string;                 // 'Mechanics', 'Thermodynamics', …
  name: string;
  latex: string;                    // KaTeX source, e.g. 'E = mc^2'
  variables: { sym: string; name: string; unit?: string }[];
  description: string;
  reference?: string;
}

/** A real, free tool / API / dataset the field uses. */
export interface ToolLink {
  name: string;
  org?: string;
  url: string;
  desc: string;
  kind?: 'software' | 'api' | 'dataset' | 'community';
  access?: 'Open' | 'Free' | 'Free API' | 'Free key' | 'Freemium';
}

export interface ScienceDisciplineData {
  id: string;                       // LabsDisciplineId, e.g. 'physics'
  label: string;                    // 'Physics'
  icon: string;                     // lucide icon name resolved in the view (e.g. 'Atom')
  accent: string;                   // primary theme colour (matches the Labs grid tile)
  accent2: string;                  // secondary glow colour
  tagline: string;                  // one line under the title
  heroBlurb: string;                // 1–2 sentence intro paragraph
  openStaxSubject?: string;         // matches services/labsApiService OpenStax subject, if any
  arXivCategory: string;            // primary arXiv category for the Library tab
  arXivQuery: string;               // default arXiv keyword search
  /** Ids into the shared simulator registry (components/labs/Simulators). Empty → no Simulate tab. */
  simulators?: string[];
  figureHalls: MuseumHallDef[];     // groupings for the Pioneers hall
  figures: MuseumFigure[];          // the pioneers themselves
  concepts: Concept[];
  eras: DisciplineEra[];
  laws: ScienceLaw[];
  tools: ToolLink[];
  videos?: CuratedVideo[];          // curated YouTube library for the Watch tab
}
