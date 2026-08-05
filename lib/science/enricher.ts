import type { LiveDataSnapshot, LiveDataSource } from './types';

// ── All APIs used here are free and require no API key ────────────────────────

// ── NOAA Weather API ──────────────────────────────────────────────────────────

export async function fetchNOAAWeather(lat: number, lng: number): Promise<LiveDataSnapshot | null> {
  try {
    // Step 1: get grid point metadata
    const pointRes = await fetch(`https://api.weather.gov/points/${lat.toFixed(4)},${lng.toFixed(4)}`);
    if (!pointRes.ok) return null;
    const point = await pointRes.json();
    const forecastUrl: string = point.properties?.forecast;
    if (!forecastUrl) return null;

    // Step 2: get forecast
    const fRes = await fetch(forecastUrl);
    if (!fRes.ok) return null;
    const forecast = await fRes.json();
    const current = forecast.properties?.periods?.[0];
    if (!current) return null;

    return {
      source: 'NOAA_WEATHER',
      fetchedAt: Date.now(),
      data: {
        temperature: current.temperature,
        temperatureUnit: current.temperatureUnit,
        windSpeed: current.windSpeed,
        windDirection: current.windDirection,
        shortForecast: current.shortForecast,
        detailedForecast: current.detailedForecast,
        isDaytime: current.isDaytime,
      },
      summary: `${current.shortForecast}, ${current.temperature}°${current.temperatureUnit}, ${current.windSpeed} ${current.windDirection}`,
    };
  } catch {
    return null;
  }
}

// ── USGS Earthquake API ───────────────────────────────────────────────────────

export async function fetchNearbyEarthquakes(
  lat: number,
  lng: number,
  radiusKm = 500,
  minMagnitude = 2.5,
): Promise<LiveDataSnapshot | null> {
  try {
    const url = `https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson` +
      `&latitude=${lat}&longitude=${lng}&maxradius=${radiusKm / 111}` +
      `&minmagnitude=${minMagnitude}&limit=5&orderby=time`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const quakes = data.features?.map((f: any) => ({
      magnitude: f.properties.mag,
      place: f.properties.place,
      time: f.properties.time,
      depth: f.geometry.coordinates[2],
    })) ?? [];

    return {
      source: 'USGS_EARTHQUAKE',
      fetchedAt: Date.now(),
      data: { earthquakes: quakes, count: quakes.length, radiusKm, minMagnitude },
      summary: quakes.length
        ? `${quakes.length} quake(s) ≥M${minMagnitude} within ${radiusKm}km — largest: M${quakes[0]?.magnitude} at ${quakes[0]?.place}`
        : `No recent earthquakes ≥M${minMagnitude} within ${radiusKm}km`,
    };
  } catch {
    return null;
  }
}

// ── Open-Meteo (no key, unlimited free) ───────────────────────────────────────

export async function fetchOpenMeteo(lat: number, lng: number): Promise<LiveDataSnapshot | null> {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
      `&current=temperature_2m,relative_humidity_2m,wind_speed_10m,precipitation,weather_code` +
      `&temperature_unit=celsius`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const cur = data.current;

    return {
      source: 'OPEN_METEO',
      fetchedAt: Date.now(),
      data: {
        temperature_c: cur.temperature_2m,
        humidity_pct: cur.relative_humidity_2m,
        wind_kph: cur.wind_speed_10m,
        precipitation_mm: cur.precipitation,
        weather_code: cur.weather_code,
      },
      summary: `${cur.temperature_2m}°C, ${cur.relative_humidity_2m}% RH, wind ${cur.wind_speed_10m} km/h, precip ${cur.precipitation} mm`,
    };
  } catch {
    return null;
  }
}

// ── PubChem (compound lookup by name or SMILES) ───────────────────────────────

export async function fetchPubChem(query: string, type: 'name' | 'smiles' = 'name'): Promise<LiveDataSnapshot | null> {
  try {
    const encoded = encodeURIComponent(query);
    const namespace = type === 'smiles' ? 'smiles' : 'name';
    const url = `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/${namespace}/${encoded}/JSON`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const compound = data.PC_Compounds?.[0];
    if (!compound) return null;

    // Extract key properties
    const props: Record<string, any> = {};
    for (const p of (compound.props || [])) {
      const urn = p.urn;
      const key = `${urn.label || ''}${urn.name ? `_${urn.name}` : ''}`.replace(/\s/g, '_').toLowerCase();
      props[key] = p.value?.fval ?? p.value?.sval ?? p.value?.ival;
    }

    return {
      source: 'PUBCHEM',
      fetchedAt: Date.now(),
      data: { cid: compound.id?.id?.cid, properties: props },
      summary: `PubChem CID ${compound.id?.id?.cid} — MW: ${props['molecular_weight_'] ?? 'N/A'}, Formula: ${props['molecular_formula_'] ?? 'N/A'}`,
    };
  } catch {
    return null;
  }
}

// ── CrossRef DOI resolution ───────────────────────────────────────────────────

export async function fetchCrossRef(doi: string): Promise<LiveDataSnapshot | null> {
  try {
    const url = `https://api.crossref.org/works/${encodeURIComponent(doi)}`;
    const res = await fetch(url, { headers: { 'User-Agent': 'Plajah/1.0 (labs@plajah.com)' } });
    if (!res.ok) return null;
    const data = await res.json();
    const w = data.message;

    return {
      source: 'CROSSREF',
      fetchedAt: Date.now(),
      data: {
        title: w.title?.[0],
        authors: w.author?.map((a: any) => `${a.given} ${a.family}`),
        journal: w['container-title']?.[0],
        year: w.published?.['date-parts']?.[0]?.[0],
        doi: w.DOI,
        url: w.URL,
        citedBy: w['is-referenced-by-count'],
        type: w.type,
      },
      summary: `"${w.title?.[0]}" — ${w.author?.slice(0, 2).map((a: any) => `${a.family}`).join(', ')}${(w.author?.length ?? 0) > 2 ? ' et al.' : ''} (${w.published?.['date-parts']?.[0]?.[0]}), cited ${w['is-referenced-by-count']} times`,
    };
  } catch {
    return null;
  }
}

// ── arXiv paper lookup ────────────────────────────────────────────────────────

export async function fetchArXiv(arxivId: string): Promise<LiveDataSnapshot | null> {
  try {
    const clean = arxivId.replace(/^arxiv:/i, '');
    const url = `https://export.arxiv.org/api/query?id_list=${clean}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const text = await res.text();

    // Simple XML parsing
    const title   = text.match(/<title>([\s\S]*?)<\/title>/)?.[1]?.trim().replace(/\n/g, ' ') ?? '';
    const summary = text.match(/<summary>([\s\S]*?)<\/summary>/)?.[1]?.trim().replace(/\n/g, ' ') ?? '';
    const authors = [...text.matchAll(/<name>([\s\S]*?)<\/name>/g)].map(m => m[1].trim());
    const published = text.match(/<published>(.*?)<\/published>/)?.[1] ?? '';

    if (!title) return null;

    return {
      source: 'ARXIV',
      fetchedAt: Date.now(),
      data: { id: clean, title, abstract: summary, authors, published, url: `https://arxiv.org/abs/${clean}` },
      summary: `arXiv:${clean} — "${title.slice(0, 80)}${title.length > 80 ? '…' : ''}" — ${authors.slice(0, 3).join(', ')}${authors.length > 3 ? ' et al.' : ''}`,
    };
  } catch {
    return null;
  }
}

// ── NASA APIs (astronomy, physics) ───────────────────────────────────────────

const NASA_KEY = typeof process !== 'undefined' ? (process.env.NASA_API_KEY ?? 'DEMO_KEY') : 'DEMO_KEY';

export async function fetchNASAApod(): Promise<LiveDataSnapshot | null> {
  try {
    const res = await fetch(`https://api.nasa.gov/planetary/apod?api_key=${NASA_KEY}`);
    if (!res.ok) return null;
    const data = await res.json();
    return {
      source: 'NASA_APOD',
      fetchedAt: Date.now(),
      data: { title: data.title, date: data.date, explanation: data.explanation, url: data.url, hdurl: data.hdurl, mediaType: data.media_type, copyright: data.copyright },
      summary: `NASA APOD ${data.date}: "${data.title}"${data.copyright ? ` © ${data.copyright}` : ''}`,
    };
  } catch {
    return null;
  }
}

/** Near-Earth Objects — asteroids/comets passing close to Earth this week */
export async function fetchNASANeo(): Promise<LiveDataSnapshot | null> {
  try {
    const today = new Date().toISOString().split('T')[0];
    const url = `https://api.nasa.gov/neo/rest/v1/feed?start_date=${today}&end_date=${today}&api_key=${NASA_KEY}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const allNeos = Object.values(data.near_earth_objects as Record<string, any[]>).flat();
    const hazardous = allNeos.filter(n => n.is_potentially_hazardous_asteroid);
    const closest = allNeos
      .map(n => ({ ...n, dist: parseFloat(n.close_approach_data?.[0]?.miss_distance?.kilometers ?? '999999999') }))
      .sort((a, b) => a.dist - b.dist)
      .slice(0, 5);
    return {
      source: 'NASA_APOD',
      fetchedAt: Date.now(),
      data: {
        date: today,
        totalCount: data.element_count,
        hazardousCount: hazardous.length,
        closest: closest.map(n => ({
          name: n.name,
          diameterM: Math.round((n.estimated_diameter?.meters?.estimated_diameter_max ?? 0)),
          missDistanceKm: Math.round(n.dist),
          velocityKmh: Math.round(parseFloat(n.close_approach_data?.[0]?.relative_velocity?.kilometers_per_hour ?? '0')),
          isHazardous: n.is_potentially_hazardous_asteroid,
        })),
      },
      summary: `${data.element_count} NEOs tracked today — ${hazardous.length} potentially hazardous. Closest: ${closest[0]?.name} at ${Math.round(closest[0]?.dist ?? 0).toLocaleString()} km`,
    };
  } catch {
    return null;
  }
}

// ── GBIF — Global Biodiversity Information Facility (biology, ecology, environment) ──

export async function fetchGBIF(
  params: { lat?: number; lng?: number; speciesName?: string },
): Promise<LiveDataSnapshot | null> {
  try {
    if (params.speciesName) {
      const url = `https://api.gbif.org/v1/species/match?name=${encodeURIComponent(params.speciesName)}&verbose=false`;
      const res = await fetch(url);
      if (!res.ok) return null;
      const d = await res.json();
      if (!d.usageKey) return null;
      return {
        source: 'GBIF',
        fetchedAt: Date.now(),
        data: {
          usageKey: d.usageKey,
          scientificName: d.scientificName,
          canonicalName: d.canonicalName,
          kingdom: d.kingdom,
          phylum: d.phylum,
          class: d.class,
          order: d.order,
          family: d.family,
          genus: d.genus,
          confidence: d.confidence,
          matchType: d.matchType,
          status: d.status,
        },
        summary: `${d.canonicalName ?? d.scientificName} — ${d.kingdom} › ${d.family} (${d.confidence ?? '?'}% match, ${d.matchType})`,
      };
    }

    if (params.lat !== undefined && params.lng !== undefined) {
      const delta = 0.5;
      const url = `https://api.gbif.org/v1/occurrence/search?` +
        `decimalLatitude=${(params.lat - delta).toFixed(4)},${(params.lat + delta).toFixed(4)}` +
        `&decimalLongitude=${(params.lng - delta).toFixed(4)},${(params.lng + delta).toFixed(4)}` +
        `&hasCoordinate=true&hasGeospatialIssue=false&limit=6`;
      const res = await fetch(url);
      if (!res.ok) return null;
      const d = await res.json();
      const results: any[] = d.results ?? [];
      const species = [...new Set<string>(results.map((r: any) => r.species).filter(Boolean))];
      return {
        source: 'GBIF',
        fetchedAt: Date.now(),
        data: {
          totalCount: d.count,
          uniqueSpecies: species.slice(0, 6),
          results: results.slice(0, 5).map((r: any) => ({
            species: r.species,
            genus: r.genus,
            family: r.family,
            kingdom: r.kingdom,
            year: r.year,
          })),
        },
        summary: `${(d.count ?? 0).toLocaleString()} GBIF occurrences nearby — ${species.slice(0, 3).join(', ')}${species.length > 3 ? ` +${species.length - 3} more` : ''}`,
      };
    }

    return null;
  } catch {
    return null;
  }
}

// ── RCSB Protein Data Bank (biology, medicine, neuroscience) ──────────────────

export async function fetchRCSBPDB(pdbId: string): Promise<LiveDataSnapshot | null> {
  try {
    const id = pdbId.trim().toUpperCase();
    const res = await fetch(`https://data.rcsb.org/rest/v1/core/entry/${id}`);
    if (!res.ok) return null;
    const d = await res.json();
    const resolution = d.refine?.[0]?.ls_d_res_high ?? d.reflns?.[0]?.d_resolution_high;
    return {
      source: 'RCSB_PDB',
      fetchedAt: Date.now(),
      data: {
        pdbId: id,
        title: d.struct?.title,
        keywords: d.struct_keywords?.text,
        resolution,
        method: d.exptl?.[0]?.method,
        depositionDate: d.rcsb_accession_info?.deposit_date,
        releaseDate: d.rcsb_accession_info?.initial_release_date,
        chainCount: d.rcsb_entry_info?.deposited_polymer_entity_instance_count,
        atomCount: d.rcsb_entry_info?.deposited_atom_count,
        url: `https://www.rcsb.org/structure/${id}`,
      },
      summary: `PDB ${id}: "${(d.struct?.title ?? 'N/A').slice(0, 70)}" — ${d.exptl?.[0]?.method ?? 'N/A'}${resolution ? `, ${resolution}Å` : ''}`,
    };
  } catch {
    return null;
  }
}

// ── FEMA National Flood Hazard Layer (civil/mechanical engineering) ────────────

export async function fetchFEMAFlood(lat: number, lng: number): Promise<LiveDataSnapshot | null> {
  try {
    const url = 'https://hazards.fema.gov/gis/nfhl/rest/services/public/NFHL/MapServer/28/query' +
      `?geometry=${lng.toFixed(6)},${lat.toFixed(6)}` +
      `&geometryType=esriGeometryPoint&inSR=4326&spatialRel=esriSpatialRelIntersects` +
      `&outFields=FLD_ZONE,ZONE_SUBTY,SFHA_TF,STATIC_BFE,V_DATUM,STUDY_TYP` +
      `&returnGeometry=false&f=json`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const d = await res.json();
    const attr = d.features?.[0]?.attributes;
    if (!attr) {
      return {
        source: 'FEMA_FLOOD',
        fetchedAt: Date.now(),
        data: { lat, lng, mapped: false },
        summary: 'Location outside FEMA mapped flood area',
      };
    }
    const inSFHA = attr.SFHA_TF === 'T';
    return {
      source: 'FEMA_FLOOD',
      fetchedAt: Date.now(),
      data: {
        floodZone: attr.FLD_ZONE,
        zoneSubtype: attr.ZONE_SUBTY,
        inSFHA,
        baseFloodElevation: attr.STATIC_BFE !== -9999 ? attr.STATIC_BFE : null,
        verticalDatum: attr.V_DATUM,
        studyType: attr.STUDY_TYP,
      },
      summary: `FEMA Zone ${attr.FLD_ZONE}${attr.ZONE_SUBTY ? ` (${attr.ZONE_SUBTY})` : ''} — ${inSFHA ? '⚠ Special Flood Hazard Area' : 'Minimal flood hazard'}${attr.STATIC_BFE && attr.STATIC_BFE !== -9999 ? `, BFE: ${attr.STATIC_BFE}ft` : ''}`,
    };
  } catch {
    return null;
  }
}

// ── Macrostrat geological formations (earth science, geology, archaeology) ─────

export async function fetchMacrostrat(lat: number, lng: number): Promise<LiveDataSnapshot | null> {
  try {
    const url = `https://macrostrat.org/api/v2/geologic_units/map?lat=${lat}&lng=${lng}&response=long`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const d = await res.json();
    const unit = d.success?.data?.[0];
    if (!unit) return null;
    return {
      source: 'MACROSTRAT',
      fetchedAt: Date.now(),
      data: {
        formation: unit.name,
        age_top_ma: unit.t_age,
        age_bottom_ma: unit.b_age,
        period: unit.b_period,
        lithology: unit.lith?.map((l: any) => l.name) ?? [],
        environment: unit.environ?.[0]?.name,
        color: unit.color,
      },
      summary: `${unit.name ?? 'Unknown formation'} — ${unit.t_age}–${unit.b_age} Ma (${unit.b_period ?? 'unknown period'}), ${unit.lith?.map((l: any) => l.name).join(', ') ?? 'unknown lithology'}`,
    };
  } catch {
    return null;
  }
}

// ── USGS Volcano Alerts (earth science, geology) ──────────────────────────────

export async function fetchUSGSVolcanoes(): Promise<LiveDataSnapshot | null> {
  try {
    const res = await fetch('https://volcanoes.usgs.gov/vsc/api/volcanoApi/alerts');
    if (!res.ok) return null;
    const data: any[] = await res.json();
    const elevated = data
      .filter(v => v.alertLevel && !['GREEN', 'NORMAL'].includes((v.alertLevel as string).toUpperCase()))
      .slice(0, 6);
    return {
      source: 'USGS_VOLCANO',
      fetchedAt: Date.now(),
      data: {
        totalMonitored: data.length,
        elevatedCount: elevated.length,
        volcanoes: elevated.map(v => ({
          name: v.volcanoName,
          alertLevel: v.alertLevel,
          aviationColor: v.aviationColor,
          country: v.country,
          lat: v.latitude,
          lng: v.longitude,
        })),
      },
      summary: elevated.length
        ? `${elevated.length} volcano(es) at elevated alert — ${elevated.map(v => `${v.volcanoName} (${v.alertLevel})`).join(', ')}`
        : `All ${data.length} USGS-monitored volcanoes at normal/green status`,
    };
  } catch {
    return null;
  }
}

// ── OpenContext archaeological datasets (archaeology) ─────────────────────────

export async function fetchOpenContext(
  params: { lat?: number; lng?: number; query?: string },
): Promise<LiveDataSnapshot | null> {
  try {
    let url: string;
    if (params.lat !== undefined && params.lng !== undefined) {
      url = `https://opencontext.org/subjects-search/.json?` +
        `near-lat=${params.lat.toFixed(4)}&near-lon=${params.lng.toFixed(4)}&radius=100&rows=5`;
    } else if (params.query) {
      url = `https://opencontext.org/subjects-search/.json?q=${encodeURIComponent(params.query)}&rows=5`;
    } else {
      return null;
    }
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) return null;
    const d = await res.json();
    const total: number = d.totalResults ?? 0;
    const features: any[] = (d.features ?? []).slice(0, 5);
    return {
      source: 'OPEN_CONTEXT',
      fetchedAt: Date.now(),
      data: {
        totalResults: total,
        items: features.map(f => ({
          label: f.properties?.label,
          type: f.properties?.['item-type'],
          context: f.properties?.['context-label'],
          uri: f.id,
        })),
      },
      summary: total
        ? `${total} OpenContext archaeological records — ${features.slice(0, 3).map(f => f.properties?.label).filter(Boolean).join(', ')}`
        : 'No OpenContext records found for this query',
    };
  } catch {
    return null;
  }
}

// ── Wikidata entity search (architecture, history, all disciplines) ───────────
// Free, no key — covers buildings, people, events, places via linked open data

export async function fetchWikidata(query: string): Promise<LiveDataSnapshot | null> {
  try {
    // 1. Entity search
    const searchUrl = `https://www.wikidata.org/w/api.php?action=wbsearchentities` +
      `&search=${encodeURIComponent(query)}&language=en&type=item&format=json&limit=5&origin=*`;
    const sRes = await fetch(searchUrl, { headers: { 'User-Agent': 'Plajah/1.0 (labs@plajah.com)' } });
    if (!sRes.ok) return null;
    const sData = await sRes.json();
    const results: any[] = sData.search ?? [];
    if (results.length === 0) return null;

    const items = results.map(r => ({
      id: r.id,
      label: r.label,
      description: r.description,
      url: `https://www.wikidata.org/wiki/${r.id}`,
    }));

    const top = items[0];
    return {
      source: 'WIKIDATA',
      fetchedAt: Date.now(),
      data: { query, results: items },
      summary: `Wikidata: "${top.label}"${top.description ? ` — ${top.description}` : ''}`,
    };
  } catch {
    return null;
  }
}

// ── OpenStreetMap Overpass — named buildings near GPS (architecture) ───────────
// Free, no key — NSF/OSMF infrastructure

export async function fetchOSMBuildings(lat: number, lng: number): Promise<LiveDataSnapshot | null> {
  try {
    const q = `[out:json][timeout:15];(way["building"]["name"](around:800,${lat},${lng});relation["building"]["name"](around:800,${lat},${lng}););out tags 10;`;
    const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(q)}`;
    const res = await fetch(url, { headers: { 'User-Agent': 'Plajah/1.0 (labs@plajah.com)' } });
    if (!res.ok) return null;
    const data = await res.json();
    const elements: any[] = data.elements ?? [];
    if (elements.length === 0) return null;

    const buildings = elements.map(e => ({
      name: e.tags?.name,
      type: e.tags?.building,
      architect: e.tags?.architect,
      startDate: e.tags?.start_date,
      height: e.tags?.height,
      levels: e.tags?.['building:levels'],
      style: e.tags?.['building:architecture'] ?? e.tags?.architectural_style,
      heritage: e.tags?.heritage,
      amenity: e.tags?.amenity,
    })).filter(b => b.name);

    const names = buildings.slice(0, 3).map(b => b.name).join(', ');
    return {
      source: 'OSM_BUILDINGS',
      fetchedAt: Date.now(),
      data: { lat, lng, count: buildings.length, buildings: buildings.slice(0, 8) },
      summary: `${buildings.length} named buildings within 800m — ${names}${buildings.length > 3 ? ` +${buildings.length - 3} more` : ''}`,
    };
  } catch {
    return null;
  }
}

// ── Wikipedia REST API (history, architecture, general) ───────────────────────
// Free, no key

export async function fetchWikipedia(query: string): Promise<LiveDataSnapshot | null> {
  try {
    // Step 1: find the best matching article title
    const searchUrl = `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(query)}&limit=1&format=json&origin=*`;
    const sRes = await fetch(searchUrl, { headers: { 'User-Agent': 'Plajah/1.0 (labs@plajah.com)' } });
    if (!sRes.ok) return null;
    const sData: any[] = await sRes.json();
    const title: string | undefined = sData[1]?.[0];
    if (!title) return null;

    // Step 2: fetch article summary
    const summaryUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
    const dRes = await fetch(summaryUrl, { headers: { 'User-Agent': 'Plajah/1.0 (labs@plajah.com)' } });
    if (!dRes.ok) return null;
    const d = await dRes.json();

    return {
      source: 'WIKIPEDIA',
      fetchedAt: Date.now(),
      data: {
        title: d.title,
        description: d.description,
        extract: d.extract,
        thumbnail: d.thumbnail?.source,
        url: d.content_urls?.desktop?.page,
        coordinates: d.coordinates,
      },
      summary: `Wikipedia: "${d.title}"${d.description ? ` — ${d.description}` : ''} · ${d.extract?.slice(0, 120)}…`,
    };
  } catch {
    return null;
  }
}

// ── Library of Congress (history — records, photos, maps, newspapers) ─────────
// Free, no key

export async function fetchLibraryOfCongress(query: string): Promise<LiveDataSnapshot | null> {
  try {
    const url = `https://www.loc.gov/search/?q=${encodeURIComponent(query)}&fo=json&c=5&at=results`;
    const res = await fetch(url, { headers: { 'User-Agent': 'Plajah/1.0 (labs@plajah.com)' } });
    if (!res.ok) return null;
    const data = await res.json();
    const results: any[] = data.results ?? [];
    if (results.length === 0) return null;

    const items = results.slice(0, 5).map(r => ({
      title: Array.isArray(r.title) ? r.title[0] : r.title,
      date: r.date,
      description: Array.isArray(r.description) ? r.description[0] : r.description,
      format: r.original_format?.[0],
      url: r.url ? `https://www.loc.gov${r.url}` : undefined,
      thumbnail: r.image_url?.[0],
    }));

    const first = items[0];
    return {
      source: 'LOC',
      fetchedAt: Date.now(),
      data: { query, totalResults: data.pagination?.total ?? results.length, items },
      summary: `Library of Congress: "${first.title?.slice(0, 70)}"${first.date ? ` (${first.date})` : ''}${first.format ? ` — ${first.format}` : ''}`,
    };
  } catch {
    return null;
  }
}

// ── Getty Art & Architecture Thesaurus (architecture vocabulary) ───────────────
// Free, no key — NSF-funded Getty Research Institute SPARQL endpoint

export async function fetchGettyVocabulary(term: string): Promise<LiveDataSnapshot | null> {
  try {
    const sparql = `
      SELECT ?s ?prefLabel ?scopeNote WHERE {
        ?s a <http://www.w3.org/2004/02/skos/core#Concept> ;
           <http://www.w3.org/2004/02/skos/core#inScheme> <http://vocab.getty.edu/aat/> ;
           <http://www.w3.org/2004/02/skos/core#prefLabel> ?prefLabel .
        FILTER (LANG(?prefLabel) = "en")
        FILTER (CONTAINS(LCASE(STR(?prefLabel)), LCASE("${term.replace(/"/g, '')}")))
        OPTIONAL {
          ?s <http://www.w3.org/2004/02/skos/core#scopeNote> ?noteObj .
          ?noteObj <http://www.w3.org/1999/02/22-rdf-syntax-ns#value> ?scopeNote .
          FILTER (LANG(?scopeNote) = "en")
        }
      } LIMIT 5`;
    const url = `https://vocab.getty.edu/sparql.json?query=${encodeURIComponent(sparql)}`;
    const res = await fetch(url, { headers: { 'Accept': 'application/sparql-results+json', 'User-Agent': 'Plajah/1.0 (labs@plajah.com)' } });
    if (!res.ok) return null;
    const data = await res.json();
    const bindings: any[] = data.results?.bindings ?? [];
    if (bindings.length === 0) return null;

    const concepts = bindings.map(b => ({
      id: b.s?.value?.split('/').pop(),
      label: b.prefLabel?.value,
      scopeNote: b.scopeNote?.value,
      url: b.s?.value,
    }));

    const top = concepts[0];
    return {
      source: 'GETTY_AAT',
      fetchedAt: Date.now(),
      data: { term, concepts },
      summary: `Getty AAT: "${top.label}"${top.scopeNote ? ` — ${top.scopeNote.slice(0, 120)}` : ''}`,
    };
  } catch {
    return null;
  }
}

// ── Europeana — European cultural heritage (architecture + history) ────────────
// Requires free API key: apis.europeana.eu

const EUROPEANA_KEY = typeof process !== 'undefined' ? (process.env.EUROPEANA_API_KEY ?? '') : '';

export async function fetchEuropeana(query: string): Promise<LiveDataSnapshot | null> {
  if (!EUROPEANA_KEY) return null;
  try {
    const url = `https://api.europeana.eu/record/v2/search.json?wskey=${EUROPEANA_KEY}` +
      `&query=${encodeURIComponent(query)}&rows=5&profile=minimal`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const items: any[] = data.items ?? [];
    if (items.length === 0) return null;

    const results = items.map(i => ({
      title: Array.isArray(i.title) ? i.title[0] : i.title,
      creator: Array.isArray(i.dcCreator) ? i.dcCreator[0] : i.dcCreator,
      year: i.year?.[0],
      country: i.country?.[0],
      type: i.type,
      thumbnail: i.edmPreview?.[0],
      url: `https://www.europeana.eu/en/item${i.id}`,
    }));

    const first = results[0];
    return {
      source: 'EUROPEANA',
      fetchedAt: Date.now(),
      data: { query, totalResults: data.totalResults, results },
      summary: `Europeana: "${first.title?.slice(0, 70)}"${first.creator ? ` by ${first.creator}` : ''}${first.year ? ` (${first.year})` : ''}`,
    };
  } catch {
    return null;
  }
}

// ── DPLA — Digital Public Library of America (US history) ─────────────────────
// Requires free key: dp.la/info/developers/

const DPLA_KEY = typeof process !== 'undefined' ? (process.env.DPLA_API_KEY ?? '') : '';

export async function fetchDPLA(query: string): Promise<LiveDataSnapshot | null> {
  if (!DPLA_KEY) return null;
  try {
    const url = `https://api.dp.la/v2/items?q=${encodeURIComponent(query)}&page_size=5&api_key=${DPLA_KEY}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const docs: any[] = data.docs ?? [];
    if (docs.length === 0) return null;

    const results = docs.map(d => ({
      title: Array.isArray(d.sourceResource?.title) ? d.sourceResource.title[0] : d.sourceResource?.title,
      creator: d.sourceResource?.creator?.[0],
      date: d.sourceResource?.date?.displayDate,
      type: d.sourceResource?.type?.[0],
      subject: d.sourceResource?.subject?.map((s: any) => s.name).slice(0, 3).join(', '),
      provider: d.provider?.name,
      url: d.isShownAt,
      thumbnail: d.object,
    }));

    const first = results[0];
    return {
      source: 'DPLA',
      fetchedAt: Date.now(),
      data: { query, totalResults: data.count, results },
      summary: `DPLA: "${first.title?.slice(0, 70)}"${first.creator ? ` — ${first.creator}` : ''}${first.date ? ` (${first.date})` : ''}, via ${first.provider}`,
    };
  } catch {
    return null;
  }
}

// ── NOAA Climate Data Online (meteorology, ecology) ──────────────────────────
// Token required — set NOAA_TOKEN in .env.local

const NOAA_TOKEN = typeof process !== 'undefined' ? (process.env.NOAA_TOKEN ?? '') : '';
const NOAA_CDO_BASE = 'https://www.ncdc.noaa.gov/cdo-web/api/v2';

/**
 * Fetch recent daily climate data for the nearest NOAA station to a lat/lng.
 * Falls back to the global summary if no nearby station has recent data.
 */
export async function fetchNOAACDO(lat: number, lng: number): Promise<LiveDataSnapshot | null> {
  if (!NOAA_TOKEN) return null;
  try {
    const headers = { token: NOAA_TOKEN };

    // Step 1: find the nearest station with recent data
    const stationUrl = `${NOAA_CDO_BASE}/stations?` +
      `extent=${(lat - 1).toFixed(4)},${(lng - 1).toFixed(4)},${(lat + 1).toFixed(4)},${(lng + 1).toFixed(4)}` +
      `&datasetid=GHCND&limit=5&sortfield=datacoverage&sortorder=desc`;
    const sRes = await fetch(stationUrl, { headers });
    if (!sRes.ok) return null;
    const sData = await sRes.json();
    const station = sData.results?.[0];
    if (!station) return null;

    // Step 2: fetch the last 7 days of TMAX, TMIN, PRCP at that station
    const today = new Date();
    const endDate = today.toISOString().split('T')[0];
    const startDate = new Date(today.setDate(today.getDate() - 7)).toISOString().split('T')[0];
    const dataUrl = `${NOAA_CDO_BASE}/data?` +
      `datasetid=GHCND&stationid=${station.id}` +
      `&datatypeid=TMAX,TMIN,PRCP&startdate=${startDate}&enddate=${endDate}` +
      `&limit=21&units=metric`;
    const dRes = await fetch(dataUrl, { headers });
    if (!dRes.ok) return null;
    const dData = await dRes.json();
    const records: any[] = dData.results ?? [];

    // Group by date
    const byDate: Record<string, Record<string, number>> = {};
    for (const r of records) {
      const d = r.date.split('T')[0];
      if (!byDate[d]) byDate[d] = {};
      // GHCND values are in tenths of °C for temp, tenths of mm for precip
      byDate[d][r.datatype] = r.datatype === 'PRCP' ? r.value / 10 : r.value / 10;
    }
    const days = Object.entries(byDate)
      .sort(([a], [b]) => b.localeCompare(a))
      .slice(0, 7)
      .map(([date, vals]) => ({ date, tmax: vals.TMAX, tmin: vals.TMIN, precip_mm: vals.PRCP }));

    const latest = days[0];
    return {
      source: 'NOAA_CDO',
      fetchedAt: Date.now(),
      data: {
        station: { id: station.id, name: station.name, lat: station.latitude, lng: station.longitude },
        days,
      },
      summary: latest
        ? `NOAA ${station.name}: ${latest.date} — High ${latest.tmax ?? 'N/A'}°C / Low ${latest.tmin ?? 'N/A'}°C, Precip ${latest.precip_mm ?? 0}mm`
        : `NOAA station ${station.name} — no recent daily data`,
    };
  } catch {
    return null;
  }
}

// ── NCBI E-utilities (biology, medicine, neuroscience) ───────────────────────
// Key raises rate limit from 3 req/s to 10 req/s — always include it.

const NCBI_KEY = typeof process !== 'undefined' ? (process.env.NCBI_API_KEY ?? '') : '';
const NCBI_BASE = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';
const NCBI_PARAMS = NCBI_KEY ? `&api_key=${NCBI_KEY}` : '';

/** PubMed — search by keyword or fetch by PMID */
export async function fetchNCBIPubMed(
  query: string,
  mode: 'search' | 'pmid' = 'search',
): Promise<LiveDataSnapshot | null> {
  try {
    let pmids: string[];

    if (mode === 'pmid') {
      pmids = [query.trim()];
    } else {
      const searchUrl = `${NCBI_BASE}/esearch.fcgi?db=pubmed&term=${encodeURIComponent(query)}&retmax=5&retmode=json${NCBI_PARAMS}`;
      const sRes = await fetch(searchUrl);
      if (!sRes.ok) return null;
      const sData = await sRes.json();
      pmids = sData.esearchresult?.idlist ?? [];
      if (pmids.length === 0) return null;
    }

    const summaryUrl = `${NCBI_BASE}/esummary.fcgi?db=pubmed&id=${pmids.join(',')}&retmode=json${NCBI_PARAMS}`;
    const dRes = await fetch(summaryUrl);
    if (!dRes.ok) return null;
    const dData = await dRes.json();

    const articles = pmids.map(id => {
      const a = dData.result?.[id];
      if (!a) return null;
      return {
        pmid: id,
        title: a.title,
        authors: a.authors?.slice(0, 3).map((au: any) => au.name),
        journal: a.source,
        year: a.pubdate?.split(' ')[0],
        doi: a.elocationid?.replace('doi: ', ''),
        url: `https://pubmed.ncbi.nlm.nih.gov/${id}/`,
      };
    }).filter(Boolean);

    const first = articles[0];
    return {
      source: 'NCBI_PUBMED',
      fetchedAt: Date.now(),
      data: { articles, totalFound: pmids.length },
      summary: first
        ? `PubMed: "${(first as any).title?.slice(0, 70)}…" — ${(first as any).authors?.join(', ')} (${(first as any).year})`
        : `${pmids.length} PubMed results for "${query}"`,
    };
  } catch {
    return null;
  }
}

/** NCBI Gene — look up gene by symbol or ID (e.g. "BRCA1", "TP53") */
export async function fetchNCBIGene(geneQuery: string): Promise<LiveDataSnapshot | null> {
  try {
    const searchUrl = `${NCBI_BASE}/esearch.fcgi?db=gene&term=${encodeURIComponent(geneQuery + '[Gene Name] AND Homo sapiens[Organism]')}&retmax=3&retmode=json${NCBI_PARAMS}`;
    const sRes = await fetch(searchUrl);
    if (!sRes.ok) return null;
    const sData = await sRes.json();
    const ids: string[] = sData.esearchresult?.idlist ?? [];
    if (ids.length === 0) return null;

    const summaryUrl = `${NCBI_BASE}/esummary.fcgi?db=gene&id=${ids[0]}&retmode=json${NCBI_PARAMS}`;
    const dRes = await fetch(summaryUrl);
    if (!dRes.ok) return null;
    const dData = await dRes.json();
    const gene = dData.result?.[ids[0]];
    if (!gene) return null;

    return {
      source: 'NCBI_GENE',
      fetchedAt: Date.now(),
      data: {
        geneId: ids[0],
        name: gene.name,
        description: gene.description,
        organism: gene.organism?.scientificname,
        chromosome: gene.chromosome,
        maplocation: gene.maplocation,
        summary: gene.summary,
        url: `https://www.ncbi.nlm.nih.gov/gene/${ids[0]}`,
      },
      summary: `Gene ${gene.name} (${gene.organism?.scientificname ?? 'H. sapiens'}) — ${(gene.description ?? '').slice(0, 80)}${gene.chromosome ? `, Chr ${gene.chromosome}` : ''}`,
    };
  } catch {
    return null;
  }
}

/** NCBI Taxonomy — species classification tree by name */
export async function fetchNCBITaxonomy(speciesName: string): Promise<LiveDataSnapshot | null> {
  try {
    const searchUrl = `${NCBI_BASE}/esearch.fcgi?db=taxonomy&term=${encodeURIComponent(speciesName)}&retmax=1&retmode=json${NCBI_PARAMS}`;
    const sRes = await fetch(searchUrl);
    if (!sRes.ok) return null;
    const sData = await sRes.json();
    const taxId = sData.esearchresult?.idlist?.[0];
    if (!taxId) return null;

    const summaryUrl = `${NCBI_BASE}/esummary.fcgi?db=taxonomy&id=${taxId}&retmode=json${NCBI_PARAMS}`;
    const dRes = await fetch(summaryUrl);
    if (!dRes.ok) return null;
    const dData = await dRes.json();
    const taxon = dData.result?.[taxId];
    if (!taxon) return null;

    return {
      source: 'NCBI_TAXONOMY',
      fetchedAt: Date.now(),
      data: {
        taxId,
        scientificName: taxon.scientificname,
        commonName: taxon.commonname,
        rank: taxon.rank,
        division: taxon.division,
        lineage: taxon.lineage,
        url: `https://www.ncbi.nlm.nih.gov/Taxonomy/Browser/wwwtax.cgi?id=${taxId}`,
      },
      summary: `${taxon.scientificname}${taxon.commonname ? ` (${taxon.commonname})` : ''} — ${taxon.rank}, ${taxon.division}`,
    };
  } catch {
    return null;
  }
}

// ── Wolfram Alpha Short Answers API (mathematics, physics, chemistry) ─────────
// Server-side only — key must never be exposed client-side.

const WOLFRAM_ID = typeof process !== 'undefined' ? (process.env.WOLFRAM_APP_ID ?? '') : '';

export async function fetchWolfram(query: string): Promise<LiveDataSnapshot | null> {
  if (!WOLFRAM_ID) return null;
  try {
    // Short Answers API — returns a plain-text one-liner
    const url = `https://api.wolframalpha.com/v1/result?appid=${WOLFRAM_ID}&i=${encodeURIComponent(query)}&units=metric`;
    const res = await fetch(url);
    // 501 = Wolfram can't interpret the query — not an error worth surfacing
    if (res.status === 501 || !res.ok) return null;
    const answer = (await res.text()).trim();
    if (!answer || answer.toLowerCase().includes('wolfram alpha')) return null;

    return {
      source: 'WOLFRAM',
      fetchedAt: Date.now(),
      data: { query, answer },
      summary: `Wolfram: ${query} = ${answer}`,
    };
  } catch {
    return null;
  }
}

// ── Master enricher: decide which APIs to call based on post content ──────────

export async function enrichPost(
  content: string,
  extras?: {
    lat?: number; lng?: number;
    doi?: string; arxivId?: string;
    smiles?: string; chemName?: string;
    pdbId?: string;
    disciplines?: string[];
  },
): Promise<LiveDataSnapshot | null> {
  const disc = new Set((extras?.disciplines ?? []).map(d => d.toUpperCase()));

  // Explicit structured extras take priority
  if (extras?.doi)      return fetchCrossRef(extras.doi);
  if (extras?.arxivId)  return fetchArXiv(extras.arxivId);
  if (extras?.pdbId)    return fetchRCSBPDB(extras.pdbId);
  if (extras?.smiles)   return fetchPubChem(extras.smiles, 'smiles');
  if (extras?.chemName) return fetchPubChem(extras.chemName, 'name');

  const lat = extras?.lat;
  const lng = extras?.lng;

  if (lat !== undefined && lng !== undefined) {
    // Route by discipline — most specific first
    if (disc.has('ARCHAEOLOGY'))                                               return fetchOpenContext({ lat, lng });
    if (disc.has('ARCHITECTURE'))                                              return fetchOSMBuildings(lat, lng);
    if (disc.has('EARTH_SCIENCE') || disc.has('GEOLOGY'))                      return fetchMacrostrat(lat, lng);
    if (disc.has('ENGINEERING') || disc.has('CIVIL_ENGINEERING'))              return fetchFEMAFlood(lat, lng);
    if (disc.has('METEOROLOGY'))                                               return fetchNOAACDO(lat, lng);
    if (disc.has('BIOLOGY') || disc.has('ENVIRONMENT') || disc.has('ECOLOGY')) return fetchGBIF({ lat, lng });
    if (disc.has('HISTORY'))                                                   return fetchWikidata(content.slice(0, 120));
    // Default geo: weather + seismic in parallel
    const [weather, quakes] = await Promise.all([
      fetchOpenMeteo(lat, lng),
      fetchNearbyEarthquakes(lat, lng),
    ]);
    return weather ?? quakes;
  }

  // Auto-detect from content
  const doiMatch    = content.match(/\b(10\.\d{4,}\/\S+[^\s.,;:!?)])/);
  const arxivMatch  = content.match(/\barxiv:\s*(\d{4}\.\d{4,}(?:v\d+)?)\b/i);
  const pdbMatch    = content.match(/\bpdb[:\s]+([1-9][A-Za-z0-9]{3})\b/i);
  const smilesMatch = content.match(/\b([CNOPSFIBrClc][a-z]?(?:\d|[+\-=#@/\\()\[\]]){4,}[A-Za-z\d+\-=#@/\\()\[\]]*)\b/);

  if (doiMatch)    return fetchCrossRef(doiMatch[1]);
  if (arxivMatch)  return fetchArXiv(arxivMatch[1]);
  if (pdbMatch)    return fetchRCSBPDB(pdbMatch[1]);
  if (smilesMatch) return fetchPubChem(smilesMatch[1], 'smiles');

  // Discipline-based fallbacks for unstructured text posts
  if (disc.has('ASTRONOMY'))                                          return fetchNASAApod();
  if (disc.has('EARTH_SCIENCE') || disc.has('GEOLOGY'))              return fetchUSGSVolcanoes();
  if (disc.has('MATHEMATICS') || disc.has('PHYSICS'))                return fetchWolfram(content.slice(0, 200));
  if (disc.has('ARCHITECTURE'))                                       return fetchWikidata(content.slice(0, 120));
  if (disc.has('HISTORY'))                                            return fetchWikipedia(content.slice(0, 100));
  if (disc.has('BIOLOGY') || disc.has('MEDICINE') || disc.has('NEUROSCIENCE'))
    return fetchNCBIPubMed(content.slice(0, 100));

  return null;
}

/**
 * Returns ALL relevant snapshots for a post in parallel — richer than enrichPost
 * when a post touches multiple disciplines or has multiple detectable content types.
 */
export async function enrichPostAll(
  content: string,
  extras?: {
    lat?: number; lng?: number;
    doi?: string; arxivId?: string;
    smiles?: string; chemName?: string;
    pdbId?: string;
    disciplines?: string[];
  },
): Promise<LiveDataSnapshot[]> {
  const disc = new Set((extras?.disciplines ?? []).map(d => d.toUpperCase()));
  const tasks: Promise<LiveDataSnapshot | null>[] = [];

  const lat = extras?.lat;
  const lng = extras?.lng;

  if (extras?.doi)      tasks.push(fetchCrossRef(extras.doi));
  if (extras?.arxivId)  tasks.push(fetchArXiv(extras.arxivId));
  if (extras?.pdbId)    tasks.push(fetchRCSBPDB(extras.pdbId));
  if (extras?.smiles)   tasks.push(fetchPubChem(extras.smiles, 'smiles'));
  if (extras?.chemName) tasks.push(fetchPubChem(extras.chemName, 'name'));

  if (lat !== undefined && lng !== undefined) {
    tasks.push(fetchOpenMeteo(lat, lng));
    tasks.push(fetchNearbyEarthquakes(lat, lng));
    if (disc.has('METEOROLOGY'))
      tasks.push(fetchNOAACDO(lat, lng));
    if (disc.has('BIOLOGY') || disc.has('ENVIRONMENT') || disc.has('ECOLOGY'))
      tasks.push(fetchGBIF({ lat, lng }));
    if (disc.has('EARTH_SCIENCE') || disc.has('GEOLOGY') || disc.has('ARCHAEOLOGY'))
      tasks.push(fetchMacrostrat(lat, lng));
    if (disc.has('ENGINEERING') || disc.has('CIVIL_ENGINEERING'))
      tasks.push(fetchFEMAFlood(lat, lng));
    if (disc.has('ARCHAEOLOGY'))
      tasks.push(fetchOpenContext({ lat, lng }));
    if (disc.has('ARCHITECTURE'))
      tasks.push(fetchOSMBuildings(lat, lng));
    if (disc.has('HISTORY') || disc.has('ARCHITECTURE'))
      tasks.push(fetchWikidata(content.slice(0, 120)));
  }

  // Auto-detect from content (skip if already provided via extras)
  const doiMatch    = content.match(/\b(10\.\d{4,}\/\S+[^\s.,;:!?)])/);
  const arxivMatch  = content.match(/\barxiv:\s*(\d{4}\.\d{4,}(?:v\d+)?)\b/i);
  const pdbMatch    = content.match(/\bpdb[:\s]+([1-9][A-Za-z0-9]{3})\b/i);
  const smilesMatch = content.match(/\b([CNOPSFIBrClc][a-z]?(?:\d|[+\-=#@/\\()\[\]]){4,}[A-Za-z\d+\-=#@/\\()\[\]]*)\b/);

  if (doiMatch && !extras?.doi)       tasks.push(fetchCrossRef(doiMatch[1]));
  if (arxivMatch && !extras?.arxivId) tasks.push(fetchArXiv(arxivMatch[1]));
  if (pdbMatch && !extras?.pdbId)     tasks.push(fetchRCSBPDB(pdbMatch[1]));
  if (smilesMatch && !extras?.smiles) tasks.push(fetchPubChem(smilesMatch[1], 'smiles'));

  if (disc.has('ASTRONOMY'))                              tasks.push(fetchNASAApod());
  if (disc.has('EARTH_SCIENCE') || disc.has('GEOLOGY'))  tasks.push(fetchUSGSVolcanoes());
  if (disc.has('MATHEMATICS') || disc.has('PHYSICS'))    tasks.push(fetchWolfram(content.slice(0, 200)));
  if (disc.has('HISTORY'))                               tasks.push(fetchWikipedia(content.slice(0, 100)));
  if (disc.has('HISTORY'))                               tasks.push(fetchLibraryOfCongress(content.slice(0, 80)));
  if (disc.has('HISTORY') || disc.has('ARCHITECTURE'))   tasks.push(fetchEuropeana(content.slice(0, 80)));
  if (disc.has('HISTORY'))                               tasks.push(fetchDPLA(content.slice(0, 80)));
  if (disc.has('ARCHITECTURE'))                          tasks.push(fetchGettyVocabulary(content.slice(0, 60)));
  if (disc.has('BIOLOGY') || disc.has('MEDICINE') || disc.has('NEUROSCIENCE'))
    tasks.push(fetchNCBIPubMed(content.slice(0, 100)));

  if (tasks.length === 0) return [];
  const settled = await Promise.allSettled(tasks);
  return settled
    .filter((r): r is PromiseFulfilledResult<LiveDataSnapshot> => r.status === 'fulfilled' && r.value !== null)
    .map(r => r.value);
}
