import type { ContentToken, ContentTokenType } from './types';

// ── Pattern library ───────────────────────────────────────────────────────────

const PATTERNS: Array<{ type: ContentTokenType; re: RegExp }> = [
  // LaTeX block: $$...$$
  { type: 'LATEX_BLOCK',   re: /\$\$([\s\S]+?)\$\$/g },
  // LaTeX inline: $...$  (not $$)
  { type: 'LATEX_INLINE',  re: /(?<!\$)\$(?!\$)((?:[^$\\]|\\[\s\S])+?)\$(?!\$)/g },
  // arXiv ID: arxiv:YYYY.NNNNN or arXiv:YYYY.NNNNN
  { type: 'ARXIV_ID',      re: /\barxiv:\s*(\d{4}\.\d{4,}(?:v\d+)?)\b/gi },
  // DOI: 10.XXXX/anything
  { type: 'DOI',           re: /\b(10\.\d{4,}\/\S+[^\s.,;:!?)])/g },
  // GPS: "lat,lng" or "(lat, lng)" variations
  { type: 'GPS_COORD',     re: /\b(-?\d{1,2}\.\d{3,})[,\s]+(-?\d{1,3}\.\d{3,})\b/g },
  // SMILES: crude detection — multi-character organic chemistry strings
  { type: 'SMILES',        re: /\b([CNOPSFIBrClc][a-z]?(?:\d|[+\-=#@/\\()\[\]]){4,}[A-Za-z\d+\-=#@/\\()\[\]]*)\b/g },
];

// ── Tokenizer ─────────────────────────────────────────────────────────────────

export function tokenizeContent(text: string): ContentToken[] {
  const tokens: ContentToken[] = [];
  const seen = new Set<number>();

  for (const { type, re } of PATTERNS) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const start = m.index;
      const end   = m.index + m[0].length;
      // Skip overlaps
      if ([...Array(end - start)].some((_, i) => seen.has(start + i))) continue;
      tokens.push({ type, raw: m[0], start, end });
      for (let i = start; i < end; i++) seen.add(i);
    }
  }

  // Fill remaining text as PLAIN_TEXT
  tokens.sort((a, b) => a.start - b.start);
  const filled: ContentToken[] = [];
  let cursor = 0;
  for (const tok of tokens) {
    if (tok.start > cursor) {
      filled.push({ type: 'PLAIN_TEXT', raw: text.slice(cursor, tok.start), start: cursor, end: tok.start });
    }
    filled.push(tok);
    cursor = tok.end;
  }
  if (cursor < text.length) {
    filled.push({ type: 'PLAIN_TEXT', raw: text.slice(cursor), start: cursor, end: text.length });
  }

  return filled;
}

// ── Quick detectors (for enricher hints) ─────────────────────────────────────

export function extractDOI(text: string): string | null {
  const m = text.match(/\b(10\.\d{4,}\/\S+[^\s.,;:!?)])/);
  return m?.[1] ?? null;
}

export function extractArXivId(text: string): string | null {
  const m = text.match(/\barxiv:\s*(\d{4}\.\d{4,}(?:v\d+)?)\b/i);
  return m?.[1] ?? null;
}

export function extractGPS(text: string): { lat: number; lng: number } | null {
  const m = text.match(/\b(-?\d{1,2}\.\d{3,})[,\s]+(-?\d{1,3}\.\d{3,})\b/);
  if (!m) return null;
  return { lat: parseFloat(m[1]), lng: parseFloat(m[2]) };
}

export function extractSMILES(text: string): string | null {
  const m = text.match(/\b([CNOPSFIBrClc][a-z]?(?:\d|[+\-=#@/\\()\[\]]){4,}[A-Za-z\d+\-=#@/\\()\[\]]*)\b/);
  return m?.[1] ?? null;
}

export function hasMathContent(text: string): boolean {
  return /\$(?!\$).+?\$/s.test(text) || /\$\$.+?\$\$/s.test(text);
}

/** Extract a PDB ID written as "PDB: 1ABC" or "pdb 2HHB" etc. */
export function extractPDBId(text: string): string | null {
  const m = text.match(/\bpdb[:\s]+([1-9][A-Za-z0-9]{3})\b/i);
  return m?.[1]?.toUpperCase() ?? null;
}

// ── Discipline auto-detection from keywords ───────────────────────────────────

const DISCIPLINE_KEYWORDS: Record<string, string[]> = {
  PHYSICS: ['quantum', 'photon', 'entanglement', 'superconductor', 'fermion', 'boson', 'relativity', 'hadron', 'quark', 'spin'],
  CHEMISTRY: ['molecule', 'compound', 'synthesis', 'reagent', 'catalyst', 'polymer', 'pH', 'oxidation', 'reduction', 'smiles', 'mol/', 'molar'],
  BIOLOGY: ['gene', 'protein', 'cell', 'dna', 'rna', 'organism', 'evolution', 'species', 'genome', 'enzyme', 'membrane'],
  COMPUTER_SCIENCE: ['algorithm', 'neural', 'model', 'dataset', 'inference', 'latency', 'token', 'llm', 'training', 'accuracy'],
  ENGINEERING: ['stress', 'strain', 'load', 'material', 'failure', 'efficiency', 'thermal', 'circuit', 'fabrication'],
  MATHEMATICS: ['proof', 'theorem', 'conjecture', 'manifold', 'topology', 'differential', 'eigenvalue', 'matrix', 'integral'],
  NEUROSCIENCE: ['neuron', 'synapse', 'cortex', 'fmri', 'eeg', 'dopamine', 'serotonin', 'cognition', 'plasticity'],
  EARTH_SCIENCE: ['seismic', 'tectonic', 'fault', 'stratigraphy', 'lithosphere', 'erosion', 'mineral', 'magma', 'glacier'],
  ASTRONOMY: ['galaxy', 'stellar', 'nebula', 'exoplanet', 'redshift', 'spectroscopy', 'telescope', 'pulsar', 'black hole'],
  ENVIRONMENT: ['climate', 'co2', 'carbon', 'emission', 'ecosystem', 'biodiversity', 'species loss', 'deforestation'],
  MEDICINE: ['clinical', 'trial', 'patient', 'symptom', 'diagnosis', 'treatment', 'dosage', 'rct', 'placebo', 'biomarker'],
};

export function detectDisciplinesFromText(text: string): string[] {
  const lower = text.toLowerCase();
  return Object.entries(DISCIPLINE_KEYWORDS)
    .filter(([, keywords]) => keywords.some(kw => lower.includes(kw)))
    .map(([discipline]) => discipline)
    .slice(0, 3);
}
