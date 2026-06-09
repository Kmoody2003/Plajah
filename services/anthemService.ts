// Anthem Service — uses locally bundled audio (public/audio/anthems/) and lyrics (data/anthemLyrics.ts)
// Audio sourced from nationalanthems.info (CC BY 4.0). Wikipedia API used for description only.

import { ANTHEM_LYRICS } from '../data/anthemLyrics';

export interface AnthemData {
  teamId: string;
  anthemTitle: string;
  audioUrl: string;
  wikiUrl: string;
  thumbnailUrl: string | null;
  extract: string | null;
  lyrics: string | null;
}

// Anthem metadata for all 48 FIFA World Cup 2026 nations
// article = Wikipedia article title (used for description + wiki link)
const ANTHEM_META: Record<string, { title: string; article: string }> = {
  alg: { title: 'Kassaman',                            article: 'Kassaman' },
  arg: { title: 'Himno Nacional Argentino',            article: 'Argentine_National_Anthem' },
  aus: { title: 'Advance Australia Fair',              article: 'Advance_Australia_Fair' },
  aut: { title: 'Land der Berge, Land am Strome',     article: 'Land_der_Berge,_Land_am_Strome' },
  bel: { title: 'La Brabançonne',                      article: 'La_Brabançonne' },
  bih: { title: 'Državna himna Bosne i Hercegovine',  article: 'Državna_himna_Bosne_i_Hercegovine' },
  bra: { title: 'Hino Nacional Brasileiro',           article: 'Brazilian_national_anthem' },
  can: { title: 'O Canada',                            article: 'O_Canada' },
  civ: { title: "L'Abidjanaise",                       article: "L'Abidjanaise" },
  cod: { title: 'Debout Congolais',                    article: 'Debout_Congolais' },
  col: { title: 'Himno Nacional de Colombia',         article: 'National_anthem_of_Colombia' },
  cpv: { title: 'Cântico da Liberdade',               article: 'Cântico_da_Liberdade' },
  cro: { title: 'Lijepa naša domovino',               article: 'Lijepa_naša_domovino' },
  cuw: { title: 'Himno di Kòrsou',                    article: 'National_anthem_of_Curaçao' },
  cze: { title: 'Kde domov můj?',                     article: 'Kde_domov_můj' },
  ecu: { title: 'Himno Nacional del Ecuador',         article: 'National_anthem_of_Ecuador' },
  egy: { title: 'Bilady, Bilady, Bilady',             article: 'Bilady,_Bilady,_Bilady' },
  eng: { title: 'God Save the King',                   article: 'God_Save_the_King' },
  esp: { title: 'Marcha Real',                         article: 'Marcha_Real' },
  fra: { title: 'La Marseillaise',                     article: 'La_Marseillaise' },
  ger: { title: 'Deutschlandlied',                     article: 'Deutschlandlied' },
  gha: { title: 'God Bless Our Homeland Ghana',       article: 'God_Bless_Our_Homeland_Ghana' },
  hai: { title: 'La Dessalinienne',                    article: 'La_Dessalinienne' },
  irn: { title: 'National Anthem of Iran',            article: 'National_anthem_of_Iran' },
  irq: { title: 'Mawtini',                             article: 'Mawtini' },
  jor: { title: 'National Anthem of Jordan',          article: 'National_anthem_of_Jordan' },
  jpn: { title: 'Kimigayo',                            article: 'Kimigayo' },
  kor: { title: 'Aegukga',                             article: 'Aegukga' },
  ksa: { title: 'Aash Al Maleek',                     article: 'Aash_Al_Maleek' },
  mar: { title: 'Hymne Chérifien',                    article: 'Cherifian_Anthem' },
  mex: { title: 'Himno Nacional Mexicano',            article: 'Mexican_national_anthem' },
  ned: { title: 'Het Wilhelmus',                       article: 'Het_Wilhelmus' },
  nor: { title: 'Ja, vi elsker dette landet',         article: 'Ja,_vi_elsker_dette_landet' },
  nzl: { title: 'God Defend New Zealand',             article: 'God_Defend_New_Zealand' },
  pan: { title: 'Himno Istmeño',                       article: 'Hymn_of_Panama' },
  par: { title: 'Paraguayos, República o Muerte',     article: 'National_anthem_of_Paraguay' },
  por: { title: 'A Portuguesa',                        article: 'A_Portuguesa' },
  qat: { title: 'Al-Salam Al-Amiri',                  article: 'As-Salam_al-Amiri' },
  rsa: { title: 'National Anthem of South Africa',   article: 'National_anthem_of_South_Africa' },
  sco: { title: 'Flower of Scotland',                 article: 'Flower_of_Scotland' },
  sen: { title: 'Pincez Tous vos Koras',             article: 'National_anthem_of_Senegal' },
  sui: { title: 'Swiss Psalm',                         article: 'Swiss_Psalm' },
  swe: { title: 'Du gamla, Du fria',                  article: 'Du_gamla,_Du_fria' },
  tun: { title: 'Humat Al Hima',                      article: 'Humat_Al_Hima' },
  tur: { title: 'İstiklâl Marşı',                     article: 'İstiklâl_Marşı' },
  ury: { title: 'Himno Nacional de Uruguay',          article: 'National_anthem_of_Uruguay' },
  usa: { title: 'The Star-Spangled Banner',           article: 'The_Star-Spangled_Banner' },
  uzb: { title: 'National Anthem of Uzbekistan',     article: 'National_anthem_of_Uzbekistan' },
};

const _cache = new Map<string, AnthemData | null>();

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

// ── Public API ─────────────────────────────────────────────────────────────────

export async function fetchAnthemData(teamId: string): Promise<AnthemData | null> {
  if (_cache.has(teamId)) return _cache.get(teamId) ?? null;

  const meta = ANTHEM_META[teamId];
  if (!meta) {
    _cache.set(teamId, null);
    return null;
  }

  const { extract, thumbnail } = await fetchWikiSummary(meta.article);

  const result: AnthemData = {
    teamId,
    anthemTitle: meta.title,
    audioUrl: `/audio/anthems/${teamId}.mp3`,
    wikiUrl: `https://en.wikipedia.org/wiki/${meta.article}`,
    thumbnailUrl: thumbnail,
    extract,
    lyrics: ANTHEM_LYRICS[teamId] ?? null,
  };

  _cache.set(teamId, result);
  return result;
}

export function clearAnthemCache() {
  _cache.clear();
}
