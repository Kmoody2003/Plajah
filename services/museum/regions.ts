/**
 * World-region lenses for the museum layer. A region narrows the collections that have
 * department/unit filters (Met, Cleveland, Smithsonian) and steers the free-text sources
 * (Commons, V&A, Wellcome, Europeana, DPLA, LoC) with region keywords.
 * Verified live: Met department ids, Cleveland department names, Smithsonian data_source names.
 */
export type MuseumRegion = 'asia' | 'middle-east' | 'africa' | 'latin-america' | 'indigenous-americas' | 'oceania';

export interface RegionDef {
  id: MuseumRegion;
  label: string;
  met?: number;                // Met department id
  cleveland?: string[];        // Cleveland Museum of Art department names
  smithsonian?: string[];      // Smithsonian data_source names
  keywords: string[];          // appended to free-text queries (one per search; rotate for breadth)
  /** Sources that make sense for this lens, in priority order. */
  sources: string[];
}

export const REGIONS: Record<MuseumRegion, RegionDef> = {
  asia: {
    id: 'asia', label: 'Asia (East, South & Southeast)', met: 6,
    cleveland: ['Chinese Art', 'Japanese Art', 'Korean Art', 'Indian and South East Asian Art'],
    smithsonian: ['National Museum of Asian Art'],
    keywords: ['Japan', 'China', 'India', 'Korea', 'Southeast Asia'],
    sources: ['met', 'cleveland', 'smithsonian', 'jps', 'npm', 'commons', 'wellcome', 'europeana', 'dpla', 'loc'],
  },
  'middle-east': {
    id: 'middle-east', label: 'Middle East & Islamic world', met: 14,
    cleveland: ['Islamic Art'],
    smithsonian: ['National Museum of Asian Art'],
    keywords: ['Islamic', 'Persian', 'Ottoman', 'Arabic', 'Mesopotamia'],
    sources: ['met', 'cleveland', 'smithsonian', 'commons', 'wellcome', 'europeana', 'loc'],
  },
  africa: {
    id: 'africa', label: 'Africa', met: 5,
    cleveland: ['African Art'],
    smithsonian: ['National Museum of African Art', 'Eliot Elisofon Photographic Archives, National Museum of African Art'],
    keywords: ['African', 'Nigeria', 'Ethiopia', 'Egypt', 'Mali'],
    sources: ['met', 'cleveland', 'smithsonian', 'commons', 'europeana', 'dpla', 'loc'],
  },
  'latin-america': {
    id: 'latin-america', label: 'Latin America & South America', met: 5,
    cleveland: ['Art of the Americas'],
    smithsonian: ['National Museum of the American Latino'],
    keywords: ['Peru', 'Mexico', 'Brazil', 'Andean', 'Latin American'],
    sources: ['met', 'cleveland', 'smithsonian', 'commons', 'europeana', 'dpla', 'loc'],
  },
  'indigenous-americas': {
    id: 'indigenous-americas', label: 'Indigenous Americas', met: 5,
    cleveland: ['Art of the Americas'],
    smithsonian: ['National Museum of the American Indian'],
    keywords: ['Native American', 'pre-Columbian', 'Maya', 'Inca', 'Navajo'],
    sources: ['met', 'cleveland', 'smithsonian', 'commons', 'dpla', 'loc'],
  },
  oceania: {
    id: 'oceania', label: 'Oceania & the Pacific', met: 5,
    smithsonian: ['National Museum of Natural History'],
    keywords: ['Oceania', 'Polynesia', 'Maori', 'Aboriginal', 'Pacific'],
    sources: ['met', 'smithsonian', 'commons', 'europeana', 'dpla'],
  },
};

/** Rotate through a region's keywords so repeated calls with the same query broaden. */
export const regionKeyword = (r: RegionDef, i = 0) => r.keywords[i % r.keywords.length];
