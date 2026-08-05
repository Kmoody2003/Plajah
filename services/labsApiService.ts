/**
 * Plajah Labs — Client-Side Science API Service
 *
 * All APIs here are publicly available and CORS-safe for browser fetch.
 * NASA requires a free API key (DEMO_KEY works for low volume).
 * Hugging Face, arXiv, USGS, PubMed, and CERN Open Data require no key.
 */

// ── Discipline → API routing map ─────────────────────────────────────────────

export type LabsDisciplineId =
  | 'astronomy' | 'physics' | 'chemistry' | 'biology' | 'cs'
  | 'engineering' | 'mathematics' | 'neuroscience' | 'earth'
  | 'data' | 'environment' | 'medicine' | 'networks'
  | 'archaeology' | 'linguistics' | 'history' | 'architecture' | 'combat';

export interface DisciplineConfig {
  arXivCategory: string;       // primary arXiv category code
  arXivQuery: string;          // default keyword search
  pubMedQuery?: string;        // PubMed search term
  hfTasks?: string[];          // Hugging Face task filters
  nasa?: boolean;              // include NASA APOD/NEO
  usgs?: boolean;              // include USGS live quake data
  cern?: boolean;              // include CERN Open Data
  openStaxSubject?: string;    // matching OpenStax subject
}

export const DISCIPLINE_CONFIG: Record<LabsDisciplineId, DisciplineConfig> = {
  astronomy:    { arXivCategory: 'astro-ph',    arXivQuery: 'astrophysics cosmology telescope',     nasa: true,  openStaxSubject: 'astronomy' },
  physics:      { arXivCategory: 'physics',     arXivQuery: 'quantum condensed matter particle',    cern: true,  openStaxSubject: 'physics' },
  chemistry:    { arXivCategory: 'chem-ph',     arXivQuery: 'molecular synthesis reaction',         pubMedQuery: 'chemistry biochemistry', openStaxSubject: 'chemistry' },
  biology:      { arXivCategory: 'q-bio',       arXivQuery: 'genomics cell ecology evolution',      pubMedQuery: 'biology genetics', openStaxSubject: 'biology' },
  cs:           { arXivCategory: 'cs.LG',       arXivQuery: 'machine learning neural network LLM',  hfTasks: ['text-generation', 'image-classification', 'object-detection', 'question-answering'], openStaxSubject: 'computer-science' },
  engineering:  { arXivCategory: 'eess.SY',     arXivQuery: 'systems control robotics signal',      openStaxSubject: 'engineering' },
  mathematics:  { arXivCategory: 'math',        arXivQuery: 'theorem algebra topology number',      openStaxSubject: 'mathematics' },
  neuroscience: { arXivCategory: 'q-bio.NC',    arXivQuery: 'brain cognition neuron fMRI',          pubMedQuery: 'neuroscience neural cognition' },
  earth:        { arXivCategory: 'physics.geo-ph', arXivQuery: 'geology seismic tectonic climate',  usgs: true,  openStaxSubject: 'earth-science' },
  data:         { arXivCategory: 'stat.ML',     arXivQuery: 'data science statistics inference',    hfTasks: ['text-classification', 'regression', 'tabular-classification'] },
  environment:  { arXivCategory: 'physics.ao-ph', arXivQuery: 'climate change atmosphere ocean',    pubMedQuery: 'environment climate ecology' },
  medicine:     { arXivCategory: 'q-bio.TO',    arXivQuery: 'clinical trial therapeutics drug',     pubMedQuery: 'medicine clinical treatment' },
  networks:     { arXivCategory: 'cs.NI',       arXivQuery: 'network protocol distributed system' },
  archaeology:  { arXivCategory: 'physics.hist-ph', arXivQuery: 'archaeology dating anthropology stratigraphy' },
  linguistics:  { arXivCategory: 'cs.CL',       arXivQuery: 'linguistics language morphology syntax', hfTasks: ['translation', 'text-classification', 'token-classification'] },
  history:      { arXivCategory: 'physics.hist-ph', arXivQuery: 'history civilization empire ancient society', openStaxSubject: 'history' },
  architecture: { arXivCategory: 'cs.CE',       arXivQuery: 'structural engineering building design seismic construction', usgs: true },
  combat:       { arXivCategory: 'physics.hist-ph', arXivQuery: 'martial arts history combat sport anthropology ritual' },
};

// ── Shared types ──────────────────────────────────────────────────────────────

export interface ArxivPaper {
  id: string;
  title: string;
  abstract: string;
  authors: string[];
  published: string;       // YYYY-MM-DD
  updated: string;
  link: string;            // abs URL
  pdfLink: string;
  categories: string[];
  source: 'arxiv';
}

export interface PubMedPaper {
  pmid: string;
  title: string;
  abstract?: string;
  authors: string[];
  journal: string;
  publishedDate: string;
  link: string;
  source: 'pubmed';
}

export interface HFModel {
  id: string;
  modelId: string;
  task?: string;
  downloads: number;
  likes: number;
  lastModified: string;
  tags: string[];
  link: string;
  source: 'huggingface';
}

export interface NASAApodEntry {
  date: string;
  title: string;
  explanation: string;
  url: string;
  hdurl?: string;
  media_type: 'image' | 'video';
  copyright?: string;
  source: 'nasa_apod';
}

export interface USGSQuake {
  magnitude: number;
  place: string;
  time: number;
  depth: number;
  url: string;
  source: 'usgs';
}

export interface CERNRecord {
  id: string;
  title: string;
  description?: string;
  type?: string;
  year?: number;
  link: string;
  source: 'cern';
}

export interface OpenStaxBook {
  id: string;
  title: string;
  subject: string;
  authors: string[];
  cover: string;
  link: string;
  studentsCount?: string;
  pdfLink?: string;
  epubUrl?: string;           // Direct EPUB download — preferred for native reader
  description?: string;
  source: 'openstax';
}

export interface PapersWithCodePaper {
  id: string;
  title: string;
  abstract?: string;
  authors: string[];
  published: string;
  arxivId?: string;
  link: string;
  stars?: number;
  source: 'paperswithcode';
}

export type SciencePaper = ArxivPaper | PubMedPaper | PapersWithCodePaper;

// ── arXiv ─────────────────────────────────────────────────────────────────────

function parseArxivAtom(xml: string): ArxivPaper[] {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, 'application/xml');
    return Array.from(doc.querySelectorAll('entry')).map(entry => {
      const rawId = entry.querySelector('id')?.textContent?.trim() ?? '';
      return {
        id: rawId.replace(/^https?:\/\/arxiv\.org\/abs\//i, ''),
        title: (entry.querySelector('title')?.textContent ?? '').trim().replace(/\s+/g, ' '),
        abstract: (entry.querySelector('summary')?.textContent ?? '').trim().replace(/\s+/g, ' '),
        authors: Array.from(entry.querySelectorAll('author name')).map(a => a.textContent?.trim() ?? ''),
        published: (entry.querySelector('published')?.textContent ?? '').slice(0, 10),
        updated: (entry.querySelector('updated')?.textContent ?? '').slice(0, 10),
        link: entry.querySelector('link[rel="alternate"]')?.getAttribute('href') ?? `https://arxiv.org/abs/${rawId}`,
        pdfLink: entry.querySelector('link[title="pdf"]')?.getAttribute('href') ?? '',
        categories: Array.from(entry.querySelectorAll('category')).map(c => c.getAttribute('term') ?? '').filter(Boolean),
        source: 'arxiv',
      };
    });
  } catch {
    return [];
  }
}

export async function searchArxiv(query: string, category: string, limit = 10): Promise<ArxivPaper[]> {
  try {
    const catFilter = category ? `+AND+cat:${encodeURIComponent(category)}*` : '';
    const url = `https://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(query)}${catFilter}&start=0&max_results=${limit}&sortBy=submittedDate&sortOrder=descending`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return [];
    const xml = await res.text();
    return parseArxivAtom(xml);
  } catch {
    return [];
  }
}

export async function fetchArxivLatest(category: string, limit = 8): Promise<ArxivPaper[]> {
  try {
    const url = `https://export.arxiv.org/api/query?search_query=cat:${encodeURIComponent(category)}*&start=0&max_results=${limit}&sortBy=submittedDate&sortOrder=descending`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return [];
    const xml = await res.text();
    return parseArxivAtom(xml);
  } catch {
    return [];
  }
}

// ── PubMed ────────────────────────────────────────────────────────────────────

const NCBI_BASE = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';
const NCBI_PARAMS = '&tool=plajah&email=labs%40plajah.com';

export async function searchPubMed(query: string, limit = 8): Promise<PubMedPaper[]> {
  try {
    // Step 1: search for IDs
    const searchUrl = `${NCBI_BASE}/esearch.fcgi?db=pubmed&term=${encodeURIComponent(query)}&retmax=${limit}&retmode=json&sort=pub+date${NCBI_PARAMS}`;
    const sRes = await fetch(searchUrl, { signal: AbortSignal.timeout(8000) });
    if (!sRes.ok) return [];
    const sData = await sRes.json();
    const ids: string[] = sData.esearchresult?.idlist ?? [];
    if (!ids.length) return [];

    // Step 2: fetch summaries
    const summaryUrl = `${NCBI_BASE}/esummary.fcgi?db=pubmed&id=${ids.join(',')}&retmode=json${NCBI_PARAMS}`;
    const dRes = await fetch(summaryUrl, { signal: AbortSignal.timeout(8000) });
    if (!dRes.ok) return [];
    const dData = await dRes.json();
    const result = dData.result ?? {};

    return ids.map(id => {
      const art = result[id];
      if (!art) return null;
      return {
        pmid: id,
        title: art.title ?? '',
        authors: (art.authors ?? []).map((a: any) => a.name ?? '').slice(0, 6),
        journal: art.fulljournalname ?? art.source ?? '',
        publishedDate: art.pubdate ?? '',
        link: `https://pubmed.ncbi.nlm.nih.gov/${id}/`,
        source: 'pubmed' as const,
      };
    }).filter(Boolean) as PubMedPaper[];
  } catch {
    return [];
  }
}

// ── NASA APOD ─────────────────────────────────────────────────────────────────

const NASA_KEY = (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_NASA_API_KEY) || 'DEMO_KEY';

export async function fetchNASAApod(count = 5): Promise<NASAApodEntry[]> {
  try {
    const url = `https://api.nasa.gov/planetary/apod?api_key=${NASA_KEY}&count=${count}&thumbs=true`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return [];
    const data = await res.json();
    return (Array.isArray(data) ? data : [data]).map((item: any) => ({
      ...item,
      source: 'nasa_apod' as const,
    }));
  } catch {
    return [];
  }
}

export async function fetchNASANEO(): Promise<{ count: number; closest?: { name: string; distanceKm: number; magnitude: number } } | null> {
  try {
    const today = new Date().toISOString().split('T')[0];
    const url = `https://api.nasa.gov/neo/rest/v1/feed?start_date=${today}&end_date=${today}&api_key=${NASA_KEY}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const data = await res.json();
    const neos: any[] = Object.values(data.near_earth_objects ?? {}).flat();
    const sorted = neos.sort((a, b) => parseFloat(a.close_approach_data?.[0]?.miss_distance?.kilometers ?? '0') - parseFloat(b.close_approach_data?.[0]?.miss_distance?.kilometers ?? '0'));
    const closest = sorted[0];
    return {
      count: neos.length,
      closest: closest ? {
        name: closest.name,
        distanceKm: Math.round(parseFloat(closest.close_approach_data?.[0]?.miss_distance?.kilometers ?? '0')),
        magnitude: closest.absolute_magnitude_h,
      } : undefined,
    };
  } catch {
    return null;
  }
}

// ── Hugging Face ──────────────────────────────────────────────────────────────

export async function fetchHFModels(task: string, limit = 8): Promise<HFModel[]> {
  try {
    const url = `https://huggingface.co/api/models?filter=${encodeURIComponent(task)}&sort=downloads&direction=-1&limit=${limit}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return [];
    const data: any[] = await res.json();
    return data.map(m => ({
      id: m._id ?? m.id,
      modelId: m.id,
      task: m.pipeline_tag ?? task,
      downloads: m.downloads ?? 0,
      likes: m.likes ?? 0,
      lastModified: m.lastModified ?? '',
      tags: m.tags ?? [],
      link: `https://huggingface.co/${m.id}`,
      source: 'huggingface' as const,
    }));
  } catch {
    return [];
  }
}

export async function fetchHFTrendingPapers(limit = 6): Promise<any[]> {
  try {
    const url = `https://huggingface.co/api/daily_papers?limit=${limit}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

// ── USGS Earthquakes ──────────────────────────────────────────────────────────

export async function fetchRecentEarthquakes(minMag = 3.5, limit = 10): Promise<USGSQuake[]> {
  try {
    const url = `https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&limit=${limit}&minmagnitude=${minMag}&orderby=time`;
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.features ?? []).map((f: any) => ({
      magnitude: f.properties.mag,
      place: f.properties.place ?? 'Unknown location',
      time: f.properties.time,
      depth: f.geometry.coordinates[2],
      url: f.properties.url ?? `https://earthquake.usgs.gov/earthquakes/eventpage/${f.id}`,
      source: 'usgs' as const,
    }));
  } catch {
    return [];
  }
}

// ── CERN Open Data ────────────────────────────────────────────────────────────

export async function fetchCERNRecords(query = 'collision', limit = 6): Promise<CERNRecord[]> {
  try {
    const url = `https://opendata.cern.ch/api/records/?q=${encodeURIComponent(query)}&size=${limit}&sort=mostrecent`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.hits?.hits ?? []).map((r: any) => ({
      id: r.id ?? r.metadata?.recid,
      title: r.metadata?.title ?? r.metadata?.titles?.[0]?.title ?? 'Untitled',
      description: r.metadata?.description ?? r.metadata?.abstract?.description,
      type: r.metadata?.type?.primary ?? r.metadata?.experiment,
      year: r.metadata?.date_created?.[0] ? parseInt(r.metadata.date_created[0]) : undefined,
      link: `https://opendata.cern.ch/record/${r.id ?? r.metadata?.recid}`,
      source: 'cern' as const,
    }));
  } catch {
    return [];
  }
}

// ── Papers With Code ──────────────────────────────────────────────────────────

export async function searchPapersWithCode(query: string, limit = 6): Promise<PapersWithCodePaper[]> {
  try {
    const url = `https://paperswithcode.com/api/v1/papers/?q=${encodeURIComponent(query)}&ordering=-published&items_per_page=${limit}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.results ?? []).map((p: any) => ({
      id: p.id,
      title: p.title,
      abstract: p.abstract,
      authors: p.authors ?? [],
      published: p.published ?? '',
      arxivId: p.arxiv_id,
      link: p.url_abs ?? p.url_pdf ?? `https://paperswithcode.com/paper/${p.id}`,
      stars: p.github_link ? undefined : undefined,
      source: 'paperswithcode' as const,
    }));
  } catch {
    return [];
  }
}

// ── OpenStax curated book list ────────────────────────────────────────────────

// All books are CC-BY licensed. EPUB/PDF URLs are publicly accessible from OpenStax's CDN.
export const OPENSTAX_BOOKS: OpenStaxBook[] = [
  {
    id: 'astronomy-2e', title: 'Astronomy 2e', subject: 'astronomy',
    authors: ['A. Fraknoi', 'D. Morrison', 'S. Wolff'],
    description: 'A comprehensive introduction to astronomy covering the solar system, stars, galaxies, and cosmology. Peer-reviewed and used by major universities worldwide.',
    cover: 'https://d3bxy9euw4e147.cloudfront.net/oscms-prodcms/media/documents/astronomy_2e_bookcover.webp',
    link: 'https://openstax.org/books/astronomy-2e/pages/1-introduction',
    pdfLink: 'https://assets.openstax.org/oscms-prodcms/media/documents/Astronomy2e-OP.pdf',
    epubUrl: 'https://assets.openstax.org/oscms-prodcms/media/documents/Astronomy2e.epub',
    studentsCount: '800K+', source: 'openstax',
  },
  {
    id: 'university-physics-v1', title: 'University Physics Vol. 1', subject: 'physics',
    authors: ['S. Ling', 'J. Sanny', 'B. Moebs'],
    description: 'Mechanics, waves, and thermodynamics at the university level. Calculus-based with real-world applications and worked examples throughout.',
    cover: 'https://d3bxy9euw4e147.cloudfront.net/oscms-prodcms/media/documents/UniversityPhysicsVol1-bookcover.webp',
    link: 'https://openstax.org/books/university-physics-volume-1/pages/1-introduction',
    pdfLink: 'https://assets.openstax.org/oscms-prodcms/media/documents/UniversityPhysicsVol1.pdf',
    epubUrl: 'https://assets.openstax.org/oscms-prodcms/media/documents/UniversityPhysicsVol1.epub',
    studentsCount: '1.2M+', source: 'openstax',
  },
  {
    id: 'university-physics-v2', title: 'University Physics Vol. 2', subject: 'physics',
    authors: ['S. Ling', 'J. Sanny', 'B. Moebs'],
    description: 'Electricity, magnetism, optics, and modern physics. Continues from Vol. 1 with the same rigorous, application-focused approach.',
    cover: 'https://d3bxy9euw4e147.cloudfront.net/oscms-prodcms/media/documents/UniversityPhysicsVol2-bookcover.webp',
    link: 'https://openstax.org/books/university-physics-volume-2/pages/1-introduction',
    pdfLink: 'https://assets.openstax.org/oscms-prodcms/media/documents/UniversityPhysicsVol2.pdf',
    epubUrl: 'https://assets.openstax.org/oscms-prodcms/media/documents/UniversityPhysicsVol2.epub',
    studentsCount: '900K+', source: 'openstax',
  },
  {
    id: 'chemistry-2e', title: 'Chemistry 2e', subject: 'chemistry',
    authors: ['P. Flowers', 'K. Theopold', 'R. Langley', 'W. Robinson'],
    description: 'General chemistry from atomic structure to thermodynamics, kinetics, and electrochemistry. Includes multimedia resources and chapter summaries.',
    cover: 'https://d3bxy9euw4e147.cloudfront.net/oscms-prodcms/media/documents/ChemistryOP.webp',
    link: 'https://openstax.org/books/chemistry-2e/pages/1-introduction',
    pdfLink: 'https://assets.openstax.org/oscms-prodcms/media/documents/Chemistry2e-OP.pdf',
    epubUrl: 'https://assets.openstax.org/oscms-prodcms/media/documents/Chemistry2e.epub',
    studentsCount: '2M+', source: 'openstax',
  },
  {
    id: 'biology-2e', title: 'Biology 2e', subject: 'biology',
    authors: ['M. Clark', 'M. Douglas', 'J. Choi'],
    description: 'From cell biology and genetics to ecology and evolution. Written for two-semester introductory biology courses with a focus on modern discoveries.',
    cover: 'https://d3bxy9euw4e147.cloudfront.net/oscms-prodcms/media/documents/Biology2e-OP.webp',
    link: 'https://openstax.org/books/biology-2e/pages/1-introduction',
    pdfLink: 'https://assets.openstax.org/oscms-prodcms/media/documents/Biology2e-OP.pdf',
    epubUrl: 'https://assets.openstax.org/oscms-prodcms/media/documents/Biology2e.epub',
    studentsCount: '3M+', source: 'openstax',
  },
  {
    id: 'microbiology', title: 'Microbiology', subject: 'biology',
    authors: ['N. Parker', 'M. Schneegurt', 'A. Tu', 'B. Forster', 'P. Lister'],
    description: 'Comprehensive coverage of microbes, microbial genetics, disease, and the immune system. Essential reading for medicine, nursing, and biology students.',
    cover: 'https://d3bxy9euw4e147.cloudfront.net/oscms-prodcms/media/documents/Microbiology-OP.webp',
    link: 'https://openstax.org/books/microbiology/pages/1-introduction',
    pdfLink: 'https://assets.openstax.org/oscms-prodcms/media/documents/Microbiology-OP.pdf',
    epubUrl: 'https://assets.openstax.org/oscms-prodcms/media/documents/Microbiology.epub',
    studentsCount: '1.4M+', source: 'openstax',
  },
  {
    id: 'world-history-v1', title: 'World History, Volume 1: to 1500', subject: 'history',
    authors: ['A. Kordas', 'R. Lynch', 'B. Nelson', 'J. Tatlock'],
    description: 'Global history from the earliest civilizations to 1500 — Mesopotamia, Egypt, classical Greece and Rome, the Islamic world, African empires, dynastic China, and the medieval world.',
    cover: 'https://assets.openstax.org/oscms-prodcms/media/documents/World_History_volume_1_WebCard.svg',
    link: 'https://openstax.org/books/world-history-volume-1/pages/1-introduction',
    pdfLink: 'https://assets.openstax.org/oscms-prodcms/media/documents/World_History_Volume_1-WEB.pdf',
    studentsCount: '300K+', source: 'openstax',
  },
  {
    id: 'world-history-v2', title: 'World History, Volume 2: from 1400', subject: 'history',
    authors: ['A. Kordas', 'R. Lynch', 'B. Nelson', 'J. Tatlock'],
    description: 'The age of exploration through the modern era — global exchange, revolutions, industrialization, imperialism, the world wars, decolonization, and the contemporary world.',
    cover: 'https://assets.openstax.org/oscms-prodcms/media/documents/World_History_volume_2_WebCard_uh6dUHf.svg',
    link: 'https://openstax.org/books/world-history-volume-2/pages/1-introduction',
    pdfLink: 'https://assets.openstax.org/oscms-prodcms/media/documents/World_History_Volume_2-WEB.pdf',
    studentsCount: '300K+', source: 'openstax',
  },
  {
    id: 'us-history', title: 'U.S. History', subject: 'history',
    authors: ['P. S. Corbett', 'V. Janssen', 'J. Lund'],
    description: 'American history from pre-Columbian societies through the twenty-first century, built around political, social, and cultural developments.',
    cover: 'https://assets.openstax.org/oscms-prodcms/media/documents/US_history.svg',
    link: 'https://openstax.org/books/us-history/pages/1-introduction',
    pdfLink: 'https://assets.openstax.org/oscms-prodcms/media/documents/US_History_-_WEB.pdf',
    studentsCount: '1M+', source: 'openstax',
  },
  {
    id: 'calculus-v1', title: 'Calculus Volume 1', subject: 'mathematics',
    authors: ['G. Strang', 'E. Herman'],
    description: 'Limits, derivatives, and integrals — the foundation of calculus. Emphasises conceptual understanding alongside rigorous computation.',
    cover: 'https://d3bxy9euw4e147.cloudfront.net/oscms-prodcms/media/documents/CalculusVol1-OP.webp',
    link: 'https://openstax.org/books/calculus-volume-1/pages/1-introduction',
    pdfLink: 'https://assets.openstax.org/oscms-prodcms/media/documents/CalculusVol1-OP.pdf',
    epubUrl: 'https://assets.openstax.org/oscms-prodcms/media/documents/CalculusVol1.epub',
    studentsCount: '900K+', source: 'openstax',
  },
  {
    id: 'calculus-v2', title: 'Calculus Volume 2', subject: 'mathematics',
    authors: ['G. Strang', 'E. Herman'],
    description: 'Integration techniques, sequences and series, vectors, and parametric equations. Continues seamlessly from Volume 1.',
    cover: 'https://d3bxy9euw4e147.cloudfront.net/oscms-prodcms/media/documents/CalculusVol2-OP.webp',
    link: 'https://openstax.org/books/calculus-volume-2/pages/1-introduction',
    pdfLink: 'https://assets.openstax.org/oscms-prodcms/media/documents/CalculusVol2-OP.pdf',
    epubUrl: 'https://assets.openstax.org/oscms-prodcms/media/documents/CalculusVol2.epub',
    studentsCount: '700K+', source: 'openstax',
  },
  {
    id: 'statistics', title: 'Introductory Statistics', subject: 'data',
    authors: ['B. Illowsky', 'S. Dean'],
    description: 'Descriptive statistics, probability, distributions, hypothesis testing, and regression. Algebra-based with real data sets from diverse fields.',
    cover: 'https://d3bxy9euw4e147.cloudfront.net/oscms-prodcms/media/documents/IntroductoryStatistics-OP.webp',
    link: 'https://openstax.org/books/introductory-statistics/pages/1-introduction',
    pdfLink: 'https://assets.openstax.org/oscms-prodcms/media/documents/IntroductoryStatistics-OP.pdf',
    epubUrl: 'https://assets.openstax.org/oscms-prodcms/media/documents/IntroductoryStatistics.epub',
    studentsCount: '2.1M+', source: 'openstax',
  },
  {
    id: 'anatomy', title: 'Anatomy & Physiology', subject: 'medicine',
    authors: ['J. Gordon Betts', 'P. DeSaix', 'J. Johnson', 'O. Johnson'],
    description: 'Structure and function of the human body — from cells and tissues through the major organ systems. Beautifully illustrated with clinical applications.',
    cover: 'https://d3bxy9euw4e147.cloudfront.net/oscms-prodcms/media/documents/APStaxcover.webp',
    link: 'https://openstax.org/books/anatomy-and-physiology/pages/1-introduction',
    pdfLink: 'https://assets.openstax.org/oscms-prodcms/media/documents/AnatomyandPhysiology-OP.pdf',
    epubUrl: 'https://assets.openstax.org/oscms-prodcms/media/documents/AnatomyandPhysiology.epub',
    studentsCount: '2.5M+', source: 'openstax',
  },
  {
    id: 'chemistry-atoms-first', title: 'Chemistry: Atoms First 2e', subject: 'chemistry',
    authors: ['P. Flowers', 'R. Langley', 'W. Robinson', 'K. Theopold'],
    description: 'A conceptual alternative to standard chemistry sequences, building from atomic theory to macroscopic properties.',
    cover: 'https://d3bxy9euw4e147.cloudfront.net/oscms-prodcms/media/documents/ChemistryAtomsFirstOP.webp',
    link: 'https://openstax.org/books/chemistry-atoms-first-2e/pages/1-introduction',
    pdfLink: 'https://assets.openstax.org/oscms-prodcms/media/documents/ChemistryAtomsFirst2e-OP.pdf',
    epubUrl: 'https://assets.openstax.org/oscms-prodcms/media/documents/ChemistryAtomsFirst2e.epub',
    studentsCount: '800K+', source: 'openstax',
  },
  {
    id: 'physics-hs', title: 'College Physics (Algebra-based)', subject: 'physics',
    authors: ['P. Urone', 'R. Hinrichs'],
    description: 'Algebra-based college physics covering mechanics, thermodynamics, electromagnetism, optics, and modern physics with practical applications.',
    cover: 'https://d3bxy9euw4e147.cloudfront.net/oscms-prodcms/media/documents/collegePhysics-OP.webp',
    link: 'https://openstax.org/books/college-physics-2e/pages/1-introduction',
    pdfLink: 'https://assets.openstax.org/oscms-prodcms/media/documents/CollegePhysics2e-OP.pdf',
    epubUrl: 'https://assets.openstax.org/oscms-prodcms/media/documents/CollegePhysics2e.epub',
    studentsCount: '3.5M+', source: 'openstax',
  },
  {
    id: 'prealgebra', title: 'Prealgebra 2e', subject: 'mathematics',
    authors: ['L. Marecek', 'M. Mathis'],
    description: 'Whole numbers, integers, fractions, decimals, and an introduction to algebra — the mathematical foundation for all science disciplines.',
    cover: 'https://d3bxy9euw4e147.cloudfront.net/oscms-prodcms/media/documents/Prealgebra2e-bookcover.webp',
    link: 'https://openstax.org/books/prealgebra-2e/pages/1-introduction',
    pdfLink: 'https://assets.openstax.org/oscms-prodcms/media/documents/Prealgebra2e-OP.pdf',
    epubUrl: 'https://assets.openstax.org/oscms-prodcms/media/documents/Prealgebra2e.epub',
    studentsCount: '1.8M+', source: 'openstax',
  },
  {
    id: 'psychology', title: 'Psychology 2e', subject: 'neuroscience',
    authors: ['R. Spielman', 'W. Jenkins', 'M. Lovett'],
    description: 'From biological bases of behavior and sensation to memory, motivation, social psychology, and clinical disorders.',
    cover: 'https://d3bxy9euw4e147.cloudfront.net/oscms-prodcms/media/documents/Psychology2e-bookcover.webp',
    link: 'https://openstax.org/books/psychology-2e/pages/1-introduction',
    pdfLink: 'https://assets.openstax.org/oscms-prodcms/media/documents/Psychology2e-OP.pdf',
    epubUrl: 'https://assets.openstax.org/oscms-prodcms/media/documents/Psychology2e.epub',
    studentsCount: '2.3M+', source: 'openstax',
  },
];

// ── OpenStax → Album converter (for native BookReader) ───────────────────────

import type { Album, BookChapter } from '../types';

/**
 * Converts an OpenStaxBook into a Plajah Album so it can be opened
 * directly in the native BookReader with full notes, bookmarks, and
 * text-to-speech support.
 *
 * Priority: EPUB (reflowable, full reader features) → PDF (visual fidelity)
 */
export function textbookToAlbum(book: OpenStaxBook): Album {
  const chapters: BookChapter[] = [];

  // Prefer EPUB — it reflowsand works with all BookReader features
  if (book.epubUrl) {
    chapters.push({
      id: `${book.id}-epub`,
      title: book.title,
      format: 'EPUB',
      url: book.epubUrl,
      description: 'Full book — EPUB format (reflowable, adjustable font)',
    });
  }

  // PDF as fallback / secondary option
  if (book.pdfLink) {
    chapters.push({
      id: `${book.id}-pdf`,
      title: `${book.title} (PDF)`,
      format: 'PDF',
      url: book.pdfLink,
      description: 'Full book — PDF format (print layout)',
    });
  }

  return {
    id: `openstax-${book.id}`,
    ownerId: 'openstax',
    type: 'BOOK',
    title: book.title,
    artist: book.authors.join(', '),
    artistBio: 'Published by OpenStax, Rice University. Peer-reviewed and freely available under a Creative Commons Attribution (CC BY) license.',
    coverImage: book.cover || 'https://openstax.org/apps/openstax-cms/static/images/og-logo.png',
    description: book.description ?? `An OpenStax open-access textbook. Free to read, download, and share under CC BY license. Used by ${book.studentsCount ?? 'millions of'} students worldwide.`,
    genre: 'Science Textbook',
    bookChapters: chapters,
    isPrivate: false,
    isDraft: false,
    isGlobalArchive: true,
    tags: ['open-access', 'textbook', 'openstax', 'CC-BY', book.subject],
    tracks: [],
    createdAt: Date.now(),
    isAdSupported: false,
  } as unknown as Album;
}

// ── Discipline master fetch ───────────────────────────────────────────────────

export interface DisciplineData {
  papers: SciencePaper[];
  apod?: NASAApodEntry[];
  neoCount?: number;
  quakes?: USGSQuake[];
  hfModels?: HFModel[];
  cernRecords?: CERNRecord[];
  textbooks: OpenStaxBook[];
  fetchedAt: number;
}

export async function fetchDisciplineData(disciplineId: LabsDisciplineId): Promise<DisciplineData> {
  const cfg = DISCIPLINE_CONFIG[disciplineId];

  const tasks: Promise<any>[] = [
    fetchArxivLatest(cfg.arXivCategory, 10),
  ];

  let pubMedPromise: Promise<PubMedPaper[]> | null = null;
  let apodPromise: Promise<NASAApodEntry[]> | null = null;
  let neoPromise: Promise<any> | null = null;
  let quakesPromise: Promise<USGSQuake[]> | null = null;
  let hfPromise: Promise<HFModel[]> | null = null;
  let cernPromise: Promise<CERNRecord[]> | null = null;

  if (cfg.pubMedQuery) {
    pubMedPromise = searchPubMed(cfg.pubMedQuery, 6);
    tasks.push(pubMedPromise);
  }
  if (cfg.nasa) {
    apodPromise = fetchNASAApod(5);
    neoPromise = fetchNASANEO();
    tasks.push(apodPromise, neoPromise);
  }
  if (cfg.usgs) {
    quakesPromise = fetchRecentEarthquakes(3.5, 10);
    tasks.push(quakesPromise);
  }
  if (cfg.hfTasks?.length) {
    hfPromise = fetchHFModels(cfg.hfTasks[0], 8);
    tasks.push(hfPromise);
  }
  if (cfg.cern) {
    cernPromise = fetchCERNRecords('collision', 6);
    tasks.push(cernPromise);
  }

  await Promise.allSettled(tasks);

  const arXivPapers = await fetchArxivLatest(cfg.arXivCategory, 10).catch(() => []);
  const pubMedPapers = pubMedPromise ? await pubMedPromise.catch(() => []) : [];
  const apod = apodPromise ? await apodPromise.catch(() => []) : undefined;
  const neoData = neoPromise ? await neoPromise.catch(() => null) : null;
  const quakes = quakesPromise ? await quakesPromise.catch(() => []) : undefined;
  const hfModels = hfPromise ? await hfPromise.catch(() => []) : undefined;
  const cernRecords = cernPromise ? await cernPromise.catch(() => []) : undefined;

  const textbooks = OPENSTAX_BOOKS.filter(b => b.subject === disciplineId || b.subject === cfg.openStaxSubject);

  return {
    papers: [...arXivPapers, ...pubMedPapers],
    apod,
    neoCount: neoData?.count,
    quakes,
    hfModels,
    cernRecords,
    textbooks,
    fetchedAt: Date.now(),
  };
}

// ── Aria AI summary helper ────────────────────────────────────────────────────

export async function museExplainPaper(title: string, abstract: string): Promise<string> {
  try {
    const res = await fetch('/api/muse/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        context: 'You are Aria, Plajah\'s science translator. Explain research to a curious non-specialist in 2-3 clear sentences. No jargon. No bullet points. Just warm, precise prose.',
        question: `Explain this research paper in plain language:\n\nTitle: ${title}\n\nAbstract: ${abstract?.slice(0, 600)}`,
        history: [],
      }),
    });
    const data = await res.json();
    return data.answer ?? '';
  } catch {
    return '';
  }
}
