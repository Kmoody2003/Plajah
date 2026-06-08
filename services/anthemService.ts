// Anthem Service — fetches national anthem audio from Wikimedia Commons
// Audio files are public domain or freely licensed (CC-BY-SA or PD).
// Lyrics are NOT embedded — we link to Wikisource (public domain texts) instead.

export interface AnthemData {
  teamId: string;
  anthemTitle: string;
  audioUrl: string | null;
  wikiUrl: string;
  wikisourceUrl: string | null;
  thumbnailUrl: string | null;
  extract: string | null;
}

// Wikipedia article titles for each nation's national anthem
// Used to query the Wikipedia REST API for audio file discovery
const ANTHEM_ARTICLES: Record<string, { article: string; wikisource?: string }> = {
  // Group A
  mex: { article: 'Mexican_national_anthem',          wikisource: 'Himno_Nacional_Mexicano' },
  ger: { article: 'Deutschlandlied',                   wikisource: 'Deutschlandlied' },
  sen: { article: 'National_anthem_of_Senegal' },
  ecu: { article: 'National_anthem_of_Ecuador' },
  // Group B
  usa: { article: 'The_Star-Spangled_Banner',          wikisource: 'The_Star-Spangled_Banner' },
  fra: { article: 'La_Marseillaise',                   wikisource: 'La_Marseillaise' },
  rsa: { article: 'National_anthem_of_South_Africa' },
  ury: { article: 'National_anthem_of_Uruguay' },
  // Group C
  can: { article: 'O_Canada',                          wikisource: 'O_Canada' },
  esp: { article: 'Marcha_Real' },
  nga: { article: 'Arise,_O_Compatriots' },
  kor: { article: 'Aegukga' },
  // Group D
  arg: { article: 'Argentine_National_Anthem',         wikisource: 'Himno_Nacional_Argentino' },
  eng: { article: 'God_Save_the_King',                 wikisource: 'God_Save_the_King' },
  civ: { article: "L'Abidjanaise" },
  jpn: { article: 'Kimigayo',                          wikisource: 'Kimigayo' },
  // Group E
  bra: { article: 'Brazilian_national_anthem',         wikisource: 'Hino_Nacional_Brasileiro' },
  ned: { article: 'Het_Wilhelmus',                     wikisource: 'Het_Wilhelmus' },
  cmr: { article: 'National_anthem_of_Cameroon' },
  aus: { article: 'Advance_Australia_Fair',            wikisource: 'Advance_Australia_Fair' },
  // Group F
  col: { article: 'National_anthem_of_Colombia' },
  por: { article: 'A_Portuguesa',                      wikisource: 'A_Portuguesa' },
  cod: { article: 'Debout_Congolais' },
  irn: { article: 'National_anthem_of_Iran' },
  // Group G
  crc: { article: 'National_anthem_of_Costa_Rica' },
  cro: { article: 'Lijepa_naša_domovino' },
  alg: { article: 'Kassaman' },
  ksa: { article: 'Aash_Al_Maleek' },
  // Group H
  pan: { article: 'Hymn_of_Panama' },
  bel: { article: "La_Brabançonne" },
  egy: { article: 'Bilady,_Bilady,_Bilady' },
  jor: { article: 'National_anthem_of_Jordan' },
  // Group I
  jam: { article: 'Jamaica,_Land_We_Love' },
  sui: { article: 'Swiss_Psalm' },
  mar: { article: 'Cherifian_Anthem' },
  irq: { article: 'Mawtini' },
  // Group J
  ven: { article: 'Gloria_al_bravo_pueblo' },
  tur: { article: 'İstiklâl_Marşı' },
  pol: { article: 'Mazurek_Dąbrowskiego',             wikisource: 'Mazurek_Dąbrowskiego' },
  uzb: { article: 'National_anthem_of_Uzbekistan' },
  // Group K
  chl: { article: 'National_anthem_of_Chile' },
  aut: { article: 'Land_der_Berge,_Land_am_Strome' },
  srb: { article: 'Bože_pravde' },
  nzl: { article: 'God_Defend_New_Zealand' },
  // Group L
  idn: { article: 'Indonesia_Raya' },
  rou: { article: 'Deșteaptă-te,_române!' },
  sco: { article: 'Flower_of_Scotland' },
  den: { article: 'Der_er_et_yndigt_land' },
};

const _cache = new Map<string, AnthemData | null>();

// ── Wikipedia REST API helpers ─────────────────────────────────────────────────

async function fetchWikiSummary(article: string): Promise<{ extract: string | null; thumbnail: string | null }> {
  try {
    const res = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(article)}`,
      { headers: { 'Api-User-Agent': 'Plajah/1.0 (plajah.com)' } }
    );
    if (!res.ok) return { extract: null, thumbnail: null };
    const data = await res.json();
    return {
      extract: data.extract ?? null,
      thumbnail: data.thumbnail?.source ?? null,
    };
  } catch {
    return { extract: null, thumbnail: null };
  }
}

async function fetchWikiMediaList(article: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/media-list/${encodeURIComponent(article)}`,
      { headers: { 'Api-User-Agent': 'Plajah/1.0 (plajah.com)' } }
    );
    if (!res.ok) return null;
    const data = await res.json();

    const items: any[] = data.items ?? [];

    // Prefer .oga / .ogg audio files
    for (const item of items) {
      if (item.type === 'audio') {
        const src = item.original?.source ?? item.srcset?.[0]?.src ?? null;
        if (src) return src;
      }
      // Some articles embed audio as "file" type with audio MIME
      if (item.type === 'file') {
        const src = item.original?.source ?? null;
        if (src && /\.(ogg|oga|mp3|wav|flac)$/i.test(src)) return src;
      }
    }

    return null;
  } catch {
    return null;
  }
}

// ── Public API ─────────────────────────────────────────────────────────────────

export async function fetchAnthemData(teamId: string): Promise<AnthemData | null> {
  if (_cache.has(teamId)) return _cache.get(teamId) ?? null;

  const info = ANTHEM_ARTICLES[teamId];
  if (!info) {
    _cache.set(teamId, null);
    return null;
  }

  const [{ extract, thumbnail }, audioUrl] = await Promise.all([
    fetchWikiSummary(info.article),
    fetchWikiMediaList(info.article),
  ]);

  const result: AnthemData = {
    teamId,
    anthemTitle: info.article.replace(/_/g, ' '),
    audioUrl,
    wikiUrl: `https://en.wikipedia.org/wiki/${info.article}`,
    wikisourceUrl: info.wikisource
      ? `https://en.wikisource.org/wiki/${info.wikisource}`
      : null,
    thumbnailUrl: thumbnail,
    extract,
  };

  _cache.set(teamId, result);
  return result;
}

export function clearAnthemCache() {
  _cache.clear();
}
