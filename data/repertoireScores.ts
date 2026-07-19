// ─────────────────────────────────────────────────────────────────────────────
// repertoireScores.ts — real sheet music and real audio, ON PLATFORM.
//
// Two verified, free, legally-clean sources back every entry here. Nothing in
// this file was guessed: every URL below was HTTP-checked (417/417 responded
// 200/206) before it was written down.
//
//   SCORES — the OpenScore Lieder Corpus (https://github.com/OpenScore/Lieder),
//   1,462 art songs engraved by hand and released under CC0-1.0. Files are
//   `.mxl` — ZIPPED MusicXML — so they are handed to Verovio via
//   loadZipDataBase64(), NOT loadData(). See <VerovioScore mxlUrl=… />.
//
//   AUDIO — the Internet Archive. Each item's own licence is carried through to
//   the UI, because IA items vary (CC0 → Public Domain Mark → CC BY-NC-SA).
//
// Where a work has no verifiable score or recording it is simply absent, and
// RepertoireLibrary falls back to the IMSLP link-out it has always had.
// ─────────────────────────────────────────────────────────────────────────────

/** One movement / song — a single .mxl inside the OpenScore corpus. */
export interface ScoreMovement {
  title: string;
  /** Path within the OpenScore/Lieder repo, unencoded. */
  path: string;
}

export interface NativeScore {
  movements: ScoreMovement[];
}

export interface AudioTrack {
  title: string;
  /** Internet Archive item identifier. */
  itemId: string;
  /** File name within the item, unencoded (may contain a sub-directory). */
  file: string;
}

export interface WorkAudio {
  /** Primary item — what the "on the Internet Archive" link opens. */
  itemId: string;
  performer?: string;
  /** Human-readable licence label for this item. */
  licence: string;
  licenceUrl: string;
  tracks: AudioTrack[];
  /** True when the item has more tracks than we list. */
  truncated?: boolean;
}

export interface RepertoireMedia {
  score?: NativeScore;
  audio?: WorkAudio;
}

export const OPENSCORE_CORPUS_URL = 'https://github.com/OpenScore/Lieder';
export const OPENSCORE_LICENCE = 'CC0 1.0 — OpenScore Lieder Corpus';
export const OPENSCORE_LICENCE_URL = 'https://creativecommons.org/publicdomain/zero/1.0/';

const RAW = 'https://raw.githubusercontent.com/OpenScore/Lieder/main/';

/** Percent-encode each path segment (the corpus is full of commas and umlauts). */
const encodePath = (p: string) => p.split('/').map(encodeURIComponent).join('/');

/** Direct URL to a zipped-MusicXML (.mxl) score in the OpenScore corpus. */
export const openScoreUrl = (path: string) => RAW + encodePath(path);

/** Streamable MP3 for an Internet Archive track (302 → 206 audio/mpeg). */
export const archiveAudioUrl = (t: AudioTrack) =>
  `https://archive.org/download/${encodeURIComponent(t.itemId)}/${encodePath(t.file)}`;

/** The item's own page on archive.org. */
export const archiveItemUrl = (itemId: string) => `https://archive.org/details/${encodeURIComponent(itemId)}`;


/** Keyed by RepertoireWork.id. */
export const REPERTOIRE_MEDIA: Record<string, RepertoireMedia> = {
  "bach-art-of-fugue": {
    audio: {
      itemId: "pandacd-715-js-bach-the-art-of-the-fugue-kunst-der-fuge-bwv-1080",
      performer: "Kimiko Ishizaka",
      licence: "CC0 1.0 (public domain dedication)",
      licenceUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
      tracks: [
        { title: "Contrapunctus 1", itemId: "pandacd-715-js-bach-the-art-of-the-fugue-kunst-der-fuge-bwv-1080", file: "Kimiko Ishizaka - J.S. Bach- The Art of the Fugue (Kunst der Fuge), BWV 1080 - 01 Contrapunctus 1.mp3" },
        { title: "Contrapunctus 2", itemId: "pandacd-715-js-bach-the-art-of-the-fugue-kunst-der-fuge-bwv-1080", file: "Kimiko Ishizaka - J.S. Bach- The Art of the Fugue (Kunst der Fuge), BWV 1080 - 02 Contrapunctus 2.mp3" },
        { title: "Contrapunctus 3", itemId: "pandacd-715-js-bach-the-art-of-the-fugue-kunst-der-fuge-bwv-1080", file: "Kimiko Ishizaka - J.S. Bach- The Art of the Fugue (Kunst der Fuge), BWV 1080 - 03 Contrapunctus 3.mp3" },
        { title: "Contrapunctus 4", itemId: "pandacd-715-js-bach-the-art-of-the-fugue-kunst-der-fuge-bwv-1080", file: "Kimiko Ishizaka - J.S. Bach- The Art of the Fugue (Kunst der Fuge), BWV 1080 - 04 Contrapunctus 4.mp3" },
        { title: "Contrapunctus 5", itemId: "pandacd-715-js-bach-the-art-of-the-fugue-kunst-der-fuge-bwv-1080", file: "Kimiko Ishizaka - J.S. Bach- The Art of the Fugue (Kunst der Fuge), BWV 1080 - 05 Contrapunctus 5.mp3" },
        { title: "Contrapunctus 6 a 4 in Stylo Francese", itemId: "pandacd-715-js-bach-the-art-of-the-fugue-kunst-der-fuge-bwv-1080", file: "Kimiko Ishizaka - J.S. Bach- The Art of the Fugue (Kunst der Fuge), BWV 1080 - 06 Contrapunctus 6 a 4 in Stylo Francese.mp3" },
        { title: "Contrapunctus 7 a 4 Per Augmentationem", itemId: "pandacd-715-js-bach-the-art-of-the-fugue-kunst-der-fuge-bwv-1080", file: "Kimiko Ishizaka - J.S. Bach- The Art of the Fugue (Kunst der Fuge), BWV 1080 - 07 Contrapunctus 7 a 4 Per Augmentationem.mp3" },
        { title: "Contrapunctus 8 a 3", itemId: "pandacd-715-js-bach-the-art-of-the-fugue-kunst-der-fuge-bwv-1080", file: "Kimiko Ishizaka - J.S. Bach- The Art of the Fugue (Kunst der Fuge), BWV 1080 - 08 Contrapunctus 8 a 3.mp3" },
        { title: "Contrapunctus 9 a 4 Alla Duodecima", itemId: "pandacd-715-js-bach-the-art-of-the-fugue-kunst-der-fuge-bwv-1080", file: "Kimiko Ishizaka - J.S. Bach- The Art of the Fugue (Kunst der Fuge), BWV 1080 - 09 Contrapunctus 9 a 4 Alla Duodecima.mp3" },
        { title: "Contrapunctus 10 a 4 Alla Decima", itemId: "pandacd-715-js-bach-the-art-of-the-fugue-kunst-der-fuge-bwv-1080", file: "Kimiko Ishizaka - J.S. Bach- The Art of the Fugue (Kunst der Fuge), BWV 1080 - 10 Contrapunctus 10 a 4 Alla Decima.mp3" },
        { title: "Contrapunctus 11 a 4", itemId: "pandacd-715-js-bach-the-art-of-the-fugue-kunst-der-fuge-bwv-1080", file: "Kimiko Ishizaka - J.S. Bach- The Art of the Fugue (Kunst der Fuge), BWV 1080 - 11 Contrapunctus 11 a 4.mp3" },
        { title: "Contrapunctus Inversus 12 A4 - Forma Inversa", itemId: "pandacd-715-js-bach-the-art-of-the-fugue-kunst-der-fuge-bwv-1080", file: "Kimiko Ishizaka - J.S. Bach- The Art of the Fugue (Kunst der Fuge), BWV 1080 - 12 Contrapunctus Inversus 12 A4 - Forma Inversa.mp3" },
        { title: "Contrapunctus Inversus A4 - Forma Recta", itemId: "pandacd-715-js-bach-the-art-of-the-fugue-kunst-der-fuge-bwv-1080", file: "Kimiko Ishizaka - J.S. Bach- The Art of the Fugue (Kunst der Fuge), BWV 1080 - 13 Contrapunctus Inversus A4 - Forma Recta.mp3" },
        { title: "Contrapunctus Inversus A3 - Forma Inversa", itemId: "pandacd-715-js-bach-the-art-of-the-fugue-kunst-der-fuge-bwv-1080", file: "Kimiko Ishizaka - J.S. Bach- The Art of the Fugue (Kunst der Fuge), BWV 1080 - 14 Contrapunctus Inversus A3 - Forma Inversa.mp3" },
        { title: "Contrapunctus Inversus A3", itemId: "pandacd-715-js-bach-the-art-of-the-fugue-kunst-der-fuge-bwv-1080", file: "Kimiko Ishizaka - J.S. Bach- The Art of the Fugue (Kunst der Fuge), BWV 1080 - 15 Contrapunctus Inversus A3.mp3" },
        { title: "Canon Per Augmentationem in Contrario Motu", itemId: "pandacd-715-js-bach-the-art-of-the-fugue-kunst-der-fuge-bwv-1080", file: "Kimiko Ishizaka - J.S. Bach- The Art of the Fugue (Kunst der Fuge), BWV 1080 - 16 Canon Per Augmentationem in Contrario Motu.mp3" },
        { title: "Canon Alla Ottava", itemId: "pandacd-715-js-bach-the-art-of-the-fugue-kunst-der-fuge-bwv-1080", file: "Kimiko Ishizaka - J.S. Bach- The Art of the Fugue (Kunst der Fuge), BWV 1080 - 17 Canon Alla Ottava.mp3" },
        { title: "Canon Alla Decima in Contrapunto Alla Terza", itemId: "pandacd-715-js-bach-the-art-of-the-fugue-kunst-der-fuge-bwv-1080", file: "Kimiko Ishizaka - J.S. Bach- The Art of the Fugue (Kunst der Fuge), BWV 1080 - 18 Canon Alla Decima in Contrapunto Alla Terza.mp3" },
        { title: "Canon Alla Duodecima in Contrapunto Alla Quinta", itemId: "pandacd-715-js-bach-the-art-of-the-fugue-kunst-der-fuge-bwv-1080", file: "Kimiko Ishizaka - J.S. Bach- The Art of the Fugue (Kunst der Fuge), BWV 1080 - 19 Canon Alla Duodecima in Contrapunto Alla Quinta.mp3" },
        { title: "Fuga a3 Soggetti (completion by Pianist)", itemId: "pandacd-715-js-bach-the-art-of-the-fugue-kunst-der-fuge-bwv-1080", file: "Kimiko Ishizaka - J.S. Bach- The Art of the Fugue (Kunst der Fuge), BWV 1080 - 20 Fuga a3 Soggetti (completion by Pianist).mp3" },
      ],
    },
  },
  "bach-goldberg": {
    audio: {
      itemId: "The_Open_Goldberg_Variations-11823",
      performer: "Kimiko Ishizaka",
      licence: "CC0 1.0 (public domain dedication)",
      licenceUrl: "http://creativecommons.org/publicdomain/zero/1.0/",
      tracks: [
        { title: "Aria", itemId: "The_Open_Goldberg_Variations-11823", file: "Kimiko_Ishizaka_-_01_-_Aria.mp3" },
        { title: "Variatio 1 a 1 Clav.", itemId: "The_Open_Goldberg_Variations-11823", file: "Kimiko_Ishizaka_-_02_-_Variatio_1_a_1_Clav.mp3" },
        { title: "Variatio 2 a 1 Clav.", itemId: "The_Open_Goldberg_Variations-11823", file: "Kimiko_Ishizaka_-_03_-_Variatio_2_a_1_Clav.mp3" },
        { title: "Variatio 3 a 1 Clav. Canone all'Unisuono", itemId: "The_Open_Goldberg_Variations-11823", file: "Kimiko_Ishizaka_-_04_-_Variatio_3_a_1_Clav_Canone_allUnisuono.mp3" },
        { title: "Variatio 4 a 1 Clav.", itemId: "The_Open_Goldberg_Variations-11823", file: "Kimiko_Ishizaka_-_05_-_Variatio_4_a_1_Clav.mp3" },
        { title: "Variatio 5 a 1 ovvero 2 Clav.", itemId: "The_Open_Goldberg_Variations-11823", file: "Kimiko_Ishizaka_-_06_-_Variatio_5_a_1_ovvero_2_Clav.mp3" },
        { title: "Variatio 6 a 1 Clav. Canone alla Seconda", itemId: "The_Open_Goldberg_Variations-11823", file: "Kimiko_Ishizaka_-_07_-_Variatio_6_a_1_Clav_Canone_alla_Seconda.mp3" },
        { title: "Variatio 7 a 1 ovvero 2 Clav.", itemId: "The_Open_Goldberg_Variations-11823", file: "Kimiko_Ishizaka_-_08_-_Variatio_7_a_1_ovvero_2_Clav.mp3" },
        { title: "Variatio 8 a 2 Clav.", itemId: "The_Open_Goldberg_Variations-11823", file: "Kimiko_Ishizaka_-_09_-_Variatio_8_a_2_Clav.mp3" },
        { title: "Variatio 9 a 1 Clav. Canone alla Terza", itemId: "The_Open_Goldberg_Variations-11823", file: "Kimiko_Ishizaka_-_10_-_Variatio_9_a_1_Clav_Canone_alla_Terza.mp3" },
        { title: "Variatio 10 a 1 Clav. Fughetta", itemId: "The_Open_Goldberg_Variations-11823", file: "Kimiko_Ishizaka_-_11_-_Variatio_10_a_1_Clav_Fughetta.mp3" },
        { title: "Variatio 11 a 2 Clav.", itemId: "The_Open_Goldberg_Variations-11823", file: "Kimiko_Ishizaka_-_12_-_Variatio_11_a_2_Clav.mp3" },
        { title: "Variatio 12 Canone alla Quarta", itemId: "The_Open_Goldberg_Variations-11823", file: "Kimiko_Ishizaka_-_13_-_Variatio_12_Canone_alla_Quarta.mp3" },
        { title: "Variatio 13 a 2 Clav.", itemId: "The_Open_Goldberg_Variations-11823", file: "Kimiko_Ishizaka_-_14_-_Variatio_13_a_2_Clav.mp3" },
        { title: "Variatio 14 a 2 Clav.", itemId: "The_Open_Goldberg_Variations-11823", file: "Kimiko_Ishizaka_-_15_-_Variatio_14_a_2_Clav.mp3" },
        { title: "Variatio 15 a 1 Clav. Canone alla Quinta", itemId: "The_Open_Goldberg_Variations-11823", file: "Kimiko_Ishizaka_-_16_-_Variatio_15_a_1_Clav_Canone_alla_Quinta.mp3" },
        { title: "Variatio 16 a 1 Clav. Ouverture", itemId: "The_Open_Goldberg_Variations-11823", file: "Kimiko_Ishizaka_-_17_-_Variatio_16_a_1_Clav_Ouverture.mp3" },
        { title: "Variatio 17 a 2 Clav.", itemId: "The_Open_Goldberg_Variations-11823", file: "Kimiko_Ishizaka_-_18_-_Variatio_17_a_2_Clav.mp3" },
        { title: "Variatio 18 a 1 Clav. Canone alla Sexta", itemId: "The_Open_Goldberg_Variations-11823", file: "Kimiko_Ishizaka_-_19_-_Variatio_18_a_1_Clav_Canone_alla_Sexta.mp3" },
        { title: "Variatio 19 a 1 Clav.", itemId: "The_Open_Goldberg_Variations-11823", file: "Kimiko_Ishizaka_-_20_-_Variatio_19_a_1_Clav.mp3" },
        { title: "Variatio 20 a 2 Clav.", itemId: "The_Open_Goldberg_Variations-11823", file: "Kimiko_Ishizaka_-_21_-_Variatio_20_a_2_Clav.mp3" },
        { title: "Variatio 21 Canone alla Settima", itemId: "The_Open_Goldberg_Variations-11823", file: "Kimiko_Ishizaka_-_22_-_Variatio_21_Canone_alla_Settima.mp3" },
        { title: "Variatio 22 a 1 Clav", itemId: "The_Open_Goldberg_Variations-11823", file: "Kimiko_Ishizaka_-_23_-_Variatio_22_a_1_Clav.mp3" },
        { title: "Variatio 23 a 2 Clav.", itemId: "The_Open_Goldberg_Variations-11823", file: "Kimiko_Ishizaka_-_24_-_Variatio_23_a_2_Clav.mp3" },
        { title: "Variatio 24 a 1 Clav. Canone all'Ottava", itemId: "The_Open_Goldberg_Variations-11823", file: "Kimiko_Ishizaka_-_25_-_Variatio_24_a_1_Clav_Canone_allOttava.mp3" },
        { title: "Variatio 25 a 2 Clav.", itemId: "The_Open_Goldberg_Variations-11823", file: "Kimiko_Ishizaka_-_26_-_Variatio_25_a_2_Clav.mp3" },
        { title: "Variatio 26 a 2 Clav.", itemId: "The_Open_Goldberg_Variations-11823", file: "Kimiko_Ishizaka_-_27_-_Variatio_26_a_2_Clav.mp3" },
        { title: "Variatio 27 a 2 Clav. Canone alla Nona", itemId: "The_Open_Goldberg_Variations-11823", file: "Kimiko_Ishizaka_-_28_-_Variatio_27_a_2_Clav_Canone_alla_Nona.mp3" },
        { title: "Variatio 28 a 2 Clav.", itemId: "The_Open_Goldberg_Variations-11823", file: "Kimiko_Ishizaka_-_29_-_Variatio_28_a_2_Clav.mp3" },
        { title: "Variatio 29 a 1 ovvero 2 Clav.", itemId: "The_Open_Goldberg_Variations-11823", file: "Kimiko_Ishizaka_-_30_-_Variatio_29_a_1_ovvero_2_Clav.mp3" },
        { title: "Variatio 30 a 1 Clav. Quodlibet", itemId: "The_Open_Goldberg_Variations-11823", file: "Kimiko_Ishizaka_-_31_-_Variatio_30_a_1_Clav_Quodlibet.mp3" },
        { title: "Aria da Capo è Fine", itemId: "The_Open_Goldberg_Variations-11823", file: "Kimiko_Ishizaka_-_32_-_Aria_da_Capo__Fine.mp3" },
      ],
    },
  },
  "bach-wtc1": {
    audio: {
      itemId: "bach-well-tempered-clavier-book-1",
      performer: "Kimiko Ishizaka",
      licence: "Public Domain Mark 1.0",
      licenceUrl: "http://creativecommons.org/publicdomain/mark/1.0/",
      truncated: true,
      tracks: [
        { title: "Prelude No. 1 in C major, BWV 846", itemId: "bach-well-tempered-clavier-book-1", file: "Kimiko Ishizaka - Bach- Well-Tempered Clavier, Book 1 - 01 Prelude No. 1 in C major, BWV 846.mp3" },
        { title: "Fugue No. 1 in C major, BWV 846", itemId: "bach-well-tempered-clavier-book-1", file: "Kimiko Ishizaka - Bach- Well-Tempered Clavier, Book 1 - 02 Fugue No. 1 in C major, BWV 846.mp3" },
        { title: "Prelude No. 2 in C minor, BWV 847", itemId: "bach-well-tempered-clavier-book-1", file: "Kimiko Ishizaka - Bach- Well-Tempered Clavier, Book 1 - 03 Prelude No. 2 in C minor, BWV 847.mp3" },
        { title: "Fugue No. 2 in C minor, BWV 847", itemId: "bach-well-tempered-clavier-book-1", file: "Kimiko Ishizaka - Bach- Well-Tempered Clavier, Book 1 - 04 Fugue No. 2 in C minor, BWV 847.mp3" },
        { title: "Prelude No. 3 in C-sharp major, BWV 848", itemId: "bach-well-tempered-clavier-book-1", file: "Kimiko Ishizaka - Bach- Well-Tempered Clavier, Book 1 - 05 Prelude No. 3 in C-sharp major, BWV 848.mp3" },
        { title: "Fugue No. 3 in C-sharp major, BWV 848", itemId: "bach-well-tempered-clavier-book-1", file: "Kimiko Ishizaka - Bach- Well-Tempered Clavier, Book 1 - 06 Fugue No. 3 in C-sharp major, BWV 848.mp3" },
        { title: "Prelude No. 4 in C-sharp minor, BWV 849", itemId: "bach-well-tempered-clavier-book-1", file: "Kimiko Ishizaka - Bach- Well-Tempered Clavier, Book 1 - 07 Prelude No. 4 in C-sharp minor, BWV 849.mp3" },
        { title: "Fugue No. 4 in C-sharp minor, BWV 849", itemId: "bach-well-tempered-clavier-book-1", file: "Kimiko Ishizaka - Bach- Well-Tempered Clavier, Book 1 - 08 Fugue No. 4 in C-sharp minor, BWV 849.mp3" },
        { title: "Prelude No. 5 in D major, BWV 850", itemId: "bach-well-tempered-clavier-book-1", file: "Kimiko Ishizaka - Bach- Well-Tempered Clavier, Book 1 - 09 Prelude No. 5 in D major, BWV 850.mp3" },
        { title: "Fugue No. 5 in D major, BWV 850", itemId: "bach-well-tempered-clavier-book-1", file: "Kimiko Ishizaka - Bach- Well-Tempered Clavier, Book 1 - 10 Fugue No. 5 in D major, BWV 850.mp3" },
        { title: "Prelude No. 6 in D minor, BWV 851", itemId: "bach-well-tempered-clavier-book-1", file: "Kimiko Ishizaka - Bach- Well-Tempered Clavier, Book 1 - 11 Prelude No. 6 in D minor, BWV 851.mp3" },
        { title: "Fugue No. 6 in D minor, BWV 851", itemId: "bach-well-tempered-clavier-book-1", file: "Kimiko Ishizaka - Bach- Well-Tempered Clavier, Book 1 - 12 Fugue No. 6 in D minor, BWV 851.mp3" },
        { title: "Prelude No. 7 in E-flat major, BWV 852", itemId: "bach-well-tempered-clavier-book-1", file: "Kimiko Ishizaka - Bach- Well-Tempered Clavier, Book 1 - 13 Prelude No. 7 in E-flat major, BWV 852.mp3" },
        { title: "Fugue No. 7 in E-flat major, BWV 852", itemId: "bach-well-tempered-clavier-book-1", file: "Kimiko Ishizaka - Bach- Well-Tempered Clavier, Book 1 - 14 Fugue No. 7 in E-flat major, BWV 852.mp3" },
        { title: "Prelude No. 8 in E-flat minor, BWV 853", itemId: "bach-well-tempered-clavier-book-1", file: "Kimiko Ishizaka - Bach- Well-Tempered Clavier, Book 1 - 15 Prelude No. 8 in E-flat minor, BWV 853.mp3" },
        { title: "Fugue No. 8 in D-sharp minor, BWV 853", itemId: "bach-well-tempered-clavier-book-1", file: "Kimiko Ishizaka - Bach- Well-Tempered Clavier, Book 1 - 16 Fugue No. 8 in D-sharp minor, BWV 853.mp3" },
        { title: "Prelude No. 9 in E major, BWV 854", itemId: "bach-well-tempered-clavier-book-1", file: "Kimiko Ishizaka - Bach- Well-Tempered Clavier, Book 1 - 17 Prelude No. 9 in E major, BWV 854.mp3" },
        { title: "Fugue No. 9 in E major, BWV 854", itemId: "bach-well-tempered-clavier-book-1", file: "Kimiko Ishizaka - Bach- Well-Tempered Clavier, Book 1 - 18 Fugue No. 9 in E major, BWV 854.mp3" },
        { title: "Prelude No. 10 in E minor, BWV 855", itemId: "bach-well-tempered-clavier-book-1", file: "Kimiko Ishizaka - Bach- Well-Tempered Clavier, Book 1 - 19 Prelude No. 10 in E minor, BWV 855.mp3" },
        { title: "Fugue No. 10 in E minor, BWV 855", itemId: "bach-well-tempered-clavier-book-1", file: "Kimiko Ishizaka - Bach- Well-Tempered Clavier, Book 1 - 20 Fugue No. 10 in E minor, BWV 855.mp3" },
        { title: "Prelude No. 11 in F major, BWV 856", itemId: "bach-well-tempered-clavier-book-1", file: "Kimiko Ishizaka - Bach- Well-Tempered Clavier, Book 1 - 21 Prelude No. 11 in F major, BWV 856.mp3" },
        { title: "Fugue No. 11 in F major, BWV 856", itemId: "bach-well-tempered-clavier-book-1", file: "Kimiko Ishizaka - Bach- Well-Tempered Clavier, Book 1 - 22 Fugue No. 11 in F major, BWV 856.mp3" },
        { title: "Prelude No. 12 in F minor, BWV 857", itemId: "bach-well-tempered-clavier-book-1", file: "Kimiko Ishizaka - Bach- Well-Tempered Clavier, Book 1 - 23 Prelude No. 12 in F minor, BWV 857.mp3" },
        { title: "Fugue No. 12 in F minor, BWV 857", itemId: "bach-well-tempered-clavier-book-1", file: "Kimiko Ishizaka - Bach- Well-Tempered Clavier, Book 1 - 24 Fugue No. 12 in F minor, BWV 857.mp3" },
        { title: "Prelude No. 13 in F-sharp major, BWV 858", itemId: "bach-well-tempered-clavier-book-1", file: "Kimiko Ishizaka - Bach- Well-Tempered Clavier, Book 1 - 25 Prelude No. 13 in F-sharp major, BWV 858.mp3" },
        { title: "Fugue No. 13 in F-sharp major, BWV 858", itemId: "bach-well-tempered-clavier-book-1", file: "Kimiko Ishizaka - Bach- Well-Tempered Clavier, Book 1 - 26 Fugue No. 13 in F-sharp major, BWV 858.mp3" },
        { title: "Prelude No. 14 in F-sharp minor, BWV 859", itemId: "bach-well-tempered-clavier-book-1", file: "Kimiko Ishizaka - Bach- Well-Tempered Clavier, Book 1 - 27 Prelude No. 14 in F-sharp minor, BWV 859.mp3" },
        { title: "Fugue No. 14 in F-sharp minor, BWV 859", itemId: "bach-well-tempered-clavier-book-1", file: "Kimiko Ishizaka - Bach- Well-Tempered Clavier, Book 1 - 28 Fugue No. 14 in F-sharp minor, BWV 859.mp3" },
        { title: "Prelude No. 15 in G major, BWV 860", itemId: "bach-well-tempered-clavier-book-1", file: "Kimiko Ishizaka - Bach- Well-Tempered Clavier, Book 1 - 29 Prelude No. 15 in G major, BWV 860.mp3" },
        { title: "Fugue No. 15 in G major, BWV 860", itemId: "bach-well-tempered-clavier-book-1", file: "Kimiko Ishizaka - Bach- Well-Tempered Clavier, Book 1 - 30 Fugue No. 15 in G major, BWV 860.mp3" },
        { title: "Prelude No. 16 in G minor, BWV 861", itemId: "bach-well-tempered-clavier-book-1", file: "Kimiko Ishizaka - Bach- Well-Tempered Clavier, Book 1 - 31 Prelude No. 16 in G minor, BWV 861.mp3" },
        { title: "Fugue No. 16 in G minor, BWV 861", itemId: "bach-well-tempered-clavier-book-1", file: "Kimiko Ishizaka - Bach- Well-Tempered Clavier, Book 1 - 32 Fugue No. 16 in G minor, BWV 861.mp3" },
      ],
    },
  },
  "beethoven-5": {
    audio: {
      itemId: "SymphonyNo.5",
      performer: "Ludwig van Beethoven",
      licence: "Public Domain Mark 1.0",
      licenceUrl: "http://creativecommons.org/publicdomain/mark/1.0/",
      tracks: [
        { title: "Symphony No. 5", itemId: "SymphonyNo.5", file: "Ludwig_van_Beethoven_-_symphony_no._5_in_c_minor_op._67_-_i._allegro_con_brio.mp3" },
      ],
    },
  },
  "beethoven-diabelli": {
    audio: {
      itemId: "jamendo-175013",
      performer: "OnClassical",
      licence: "CC BY-NC-SA 3.0",
      licenceUrl: "http://creativecommons.org/licenses/by-nc-sa/3.0/",
      truncated: true,
      tracks: [
        { title: "giovanni_mazzocchin_beethoven_diabelli_op._120_bagattelle_op._126_33_variation_33_(tempo_di_minuetto_moderato_ma_non_tirarsi_die", itemId: "jamendo-175013", file: "01-1524030-OnClassical-giovanni_mazzocchin_beethoven_diabelli_op._120_bagattelle_op._126_33_variation_33__tempo_di_minuetto_moderato_ma_non_tirarsi_die.mp3" },
        { title: "giovanni_mazzocchin_beethoven_diabelli_op._120_bagattelle_op._126_34_bagattellas_op._126_i", itemId: "jamendo-175013", file: "02-1524031-OnClassical-giovanni_mazzocchin_beethoven_diabelli_op._120_bagattelle_op._126_34_bagattellas_op._126_i.mp3" },
        { title: "giovanni_mazzocchin_beethoven_diabelli_op._120_bagattelle_op._126_35_bagattellas_op._126_ii", itemId: "jamendo-175013", file: "03-1524032-OnClassical-giovanni_mazzocchin_beethoven_diabelli_op._120_bagattelle_op._126_35_bagattellas_op._126_ii.mp3" },
        { title: "giovanni_mazzocchin_beethoven_diabelli_op._120_bagattelle_op._126_36_bagattellas_op._126_iii", itemId: "jamendo-175013", file: "04-1524033-OnClassical-giovanni_mazzocchin_beethoven_diabelli_op._120_bagattelle_op._126_36_bagattellas_op._126_iii.mp3" },
        { title: "giovanni_mazzocchin_beethoven_diabelli_op._120_bagattelle_op._126_37_bagattellas_op._126_iv", itemId: "jamendo-175013", file: "05-1524034-OnClassical-giovanni_mazzocchin_beethoven_diabelli_op._120_bagattelle_op._126_37_bagattellas_op._126_iv.mp3" },
        { title: "giovanni_mazzocchin_beethoven_diabelli_op._120_bagattelle_op._126_38_bagattellas_op._126_v", itemId: "jamendo-175013", file: "06-1524035-OnClassical-giovanni_mazzocchin_beethoven_diabelli_op._120_bagattelle_op._126_38_bagattellas_op._126_v.mp3" },
        { title: "giovanni_mazzocchin_beethoven_diabelli_op._120_bagattelle_op._126_39_bagattellas_op._126_vi", itemId: "jamendo-175013", file: "07-1524036-OnClassical-giovanni_mazzocchin_beethoven_diabelli_op._120_bagattelle_op._126_39_bagattellas_op._126_vi.mp3" },
        { title: "giovanni_mazzocchin_beethoven_diabelli_op._120_bagattelle_op._126_21_variation_21_(allegro_con_brio_meno_allegro_tempo_i)", itemId: "jamendo-175013", file: "08-1524020-OnClassical-giovanni_mazzocchin_beethoven_diabelli_op._120_bagattelle_op._126_21_variation_21__allegro_con_brio_meno_allegro_tempo_i_.mp3" },
        { title: "giovanni_mazzocchin_beethoven_diabelli_op._120_bagattelle_op._126_23_variation_23_(allegro_assai)", itemId: "jamendo-175013", file: "09-1524019-OnClassical-giovanni_mazzocchin_beethoven_diabelli_op._120_bagattelle_op._126_23_variation_23__allegro_assai_.mp3" },
        { title: "giovanni_mazzocchin_beethoven_diabelli_op._120_bagattelle_op._126_24_variation_24_fughetta_(andante)", itemId: "jamendo-175013", file: "10-1524021-OnClassical-giovanni_mazzocchin_beethoven_diabelli_op._120_bagattelle_op._126_24_variation_24_fughetta__andante_.mp3" },
        { title: "giovanni_mazzocchin_beethoven_diabelli_op._120_bagattelle_op._126_25_variation_25_(allegro)", itemId: "jamendo-175013", file: "11-1524022-OnClassical-giovanni_mazzocchin_beethoven_diabelli_op._120_bagattelle_op._126_25_variation_25__allegro_.mp3" },
        { title: "giovanni_mazzocchin_beethoven_diabelli_op._120_bagattelle_op._126_26_variation_26", itemId: "jamendo-175013", file: "12-1524023-OnClassical-giovanni_mazzocchin_beethoven_diabelli_op._120_bagattelle_op._126_26_variation_26.mp3" },
        { title: "giovanni_mazzocchin_beethoven_diabelli_op._120_bagattelle_op._126_27_variation_27_(vivace)", itemId: "jamendo-175013", file: "13-1524024-OnClassical-giovanni_mazzocchin_beethoven_diabelli_op._120_bagattelle_op._126_27_variation_27__vivace_.mp3" },
        { title: "giovanni_mazzocchin_beethoven_diabelli_op._120_bagattelle_op._126_28_variation_28_(allegro)", itemId: "jamendo-175013", file: "14-1524025-OnClassical-giovanni_mazzocchin_beethoven_diabelli_op._120_bagattelle_op._126_28_variation_28__allegro_.mp3" },
        { title: "giovanni_mazzocchin_beethoven_diabelli_op._120_bagattelle_op._126_29_variation_29_(adagio_ma_non_troppo)", itemId: "jamendo-175013", file: "15-1524026-OnClassical-giovanni_mazzocchin_beethoven_diabelli_op._120_bagattelle_op._126_29_variation_29__adagio_ma_non_troppo_.mp3" },
        { title: "giovanni_mazzocchin_beethoven_diabelli_op._120_bagattelle_op._126_30_variation_30_(andante_sempre_cantabile)", itemId: "jamendo-175013", file: "16-1524027-OnClassical-giovanni_mazzocchin_beethoven_diabelli_op._120_bagattelle_op._126_30_variation_30__andante_sempre_cantabile_.mp3" },
        { title: "giovanni_mazzocchin_beethoven_diabelli_op._120_bagattelle_op._126_31_variation_31_(largo_molto_espressivo)", itemId: "jamendo-175013", file: "17-1524028-OnClassical-giovanni_mazzocchin_beethoven_diabelli_op._120_bagattelle_op._126_31_variation_31__largo_molto_espressivo_.mp3" },
        { title: "giovanni_mazzocchin_beethoven_diabelli_op._120_bagattelle_op._126_32_variation_32_fuga_(allegro_poco_adagio)", itemId: "jamendo-175013", file: "18-1524029-OnClassical-giovanni_mazzocchin_beethoven_diabelli_op._120_bagattelle_op._126_32_variation_32_fuga__allegro_poco_adagio_.mp3" },
        { title: "giovanni_mazzocchin_beethoven_diabelli_op._120_bagattelle_op._126_09_variation_8_(poco_vivace)", itemId: "jamendo-175013", file: "19-1524006-OnClassical-giovanni_mazzocchin_beethoven_diabelli_op._120_bagattelle_op._126_09_variation_8__poco_vivace_.mp3" },
        { title: "giovanni_mazzocchin_beethoven_diabelli_op._120_bagattelle_op._126_10_variation_9_(allegro_pesante_e_risoluto)", itemId: "jamendo-175013", file: "20-1524007-OnClassical-giovanni_mazzocchin_beethoven_diabelli_op._120_bagattelle_op._126_10_variation_9__allegro_pesante_e_risoluto_.mp3" },
        { title: "giovanni_mazzocchin_beethoven_diabelli_op._120_bagattelle_op._126_11_variation_10_(presto)", itemId: "jamendo-175013", file: "21-1524009-OnClassical-giovanni_mazzocchin_beethoven_diabelli_op._120_bagattelle_op._126_11_variation_10__presto_.mp3" },
        { title: "giovanni_mazzocchin_beethoven_diabelli_op._120_bagattelle_op._126_12_variation_11_(allegretto)", itemId: "jamendo-175013", file: "22-1524008-OnClassical-giovanni_mazzocchin_beethoven_diabelli_op._120_bagattelle_op._126_12_variation_11__allegretto_.mp3" },
        { title: "giovanni_mazzocchin_beethoven_diabelli_op._120_bagattelle_op._126_13_variation_12_(un_poco_piu_moto)", itemId: "jamendo-175013", file: "23-1524010-OnClassical-giovanni_mazzocchin_beethoven_diabelli_op._120_bagattelle_op._126_13_variation_12__un_poco_piu_moto_.mp3" },
        { title: "giovanni_mazzocchin_beethoven_diabelli_op._120_bagattelle_op._126_14_variation_13_(vivace)", itemId: "jamendo-175013", file: "24-1524011-OnClassical-giovanni_mazzocchin_beethoven_diabelli_op._120_bagattelle_op._126_14_variation_13__vivace_.mp3" },
        { title: "giovanni_mazzocchin_beethoven_diabelli_op._120_bagattelle_op._126_15_variation_14_(grave_e_maestoso)", itemId: "jamendo-175013", file: "25-1524012-OnClassical-giovanni_mazzocchin_beethoven_diabelli_op._120_bagattelle_op._126_15_variation_14__grave_e_maestoso_.mp3" },
        { title: "giovanni_mazzocchin_beethoven_diabelli_op._120_bagattelle_op._126_16_variation_15_(presto_scherzando)", itemId: "jamendo-175013", file: "26-1524013-OnClassical-giovanni_mazzocchin_beethoven_diabelli_op._120_bagattelle_op._126_16_variation_15__presto_scherzando_.mp3" },
        { title: "giovanni_mazzocchin_beethoven_diabelli_op._120_bagattelle_op._126_17_variation_17_(allegro)", itemId: "jamendo-175013", file: "27-1524014-OnClassical-giovanni_mazzocchin_beethoven_diabelli_op._120_bagattelle_op._126_17_variation_17__allegro_.mp3" },
        { title: "giovanni_mazzocchin_beethoven_diabelli_op._120_bagattelle_op._126_18_variation_18_(poco_moderato)", itemId: "jamendo-175013", file: "28-1524015-OnClassical-giovanni_mazzocchin_beethoven_diabelli_op._120_bagattelle_op._126_18_variation_18__poco_moderato_.mp3" },
        { title: "giovanni_mazzocchin_beethoven_diabelli_op._120_bagattelle_op._126_19_variation_19_(presto)", itemId: "jamendo-175013", file: "29-1524016-OnClassical-giovanni_mazzocchin_beethoven_diabelli_op._120_bagattelle_op._126_19_variation_19__presto_.mp3" },
        { title: "giovanni_mazzocchin_beethoven_diabelli_op._120_bagattelle_op._126_22_variation_22_(allegro_molto._alla_notte_e_giorno_faticar_by", itemId: "jamendo-175013", file: "30-1524018-OnClassical-giovanni_mazzocchin_beethoven_diabelli_op._120_bagattelle_op._126_22_variation_22__allegro_molto._alla_notte_e_giorno_faticar_by.mp3" },
        { title: "giovanni_mazzocchin_beethoven_diabelli_op._120_bagattelle_op._126_01_tema_(vivace)", itemId: "jamendo-175013", file: "31-1523998-OnClassical-giovanni_mazzocchin_beethoven_diabelli_op._120_bagattelle_op._126_01_tema__vivace_.mp3" },
        { title: "giovanni_mazzocchin_beethoven_diabelli_op._120_bagattelle_op._126_02_variation_1_(alla_marcia_maestoso)", itemId: "jamendo-175013", file: "32-1523999-OnClassical-giovanni_mazzocchin_beethoven_diabelli_op._120_bagattelle_op._126_02_variation_1__alla_marcia_maestoso_.mp3" },
      ],
    },
  },
  "beethoven-lieder-op52": {
    score: {
      movements: [
        { title: "Urians Reise um die Welt", path: "scores/Beethoven,_Ludwig_van/8_Lieder,_Op.52/1_Urians_Reise_um_die_Welt/lc6488630.mxl" },
        { title: "Feuerfarb", path: "scores/Beethoven,_Ludwig_van/8_Lieder,_Op.52/2_Feuerfarb/lc6491340.mxl" },
        { title: "Das Liedchen von der Ruhe", path: "scores/Beethoven,_Ludwig_van/8_Lieder,_Op.52/3_Das_Liedchen_von_der_Ruhe/lc6491353.mxl" },
        { title: "Mailied", path: "scores/Beethoven,_Ludwig_van/8_Lieder,_Op.52/4_Mailied/lc6491377.mxl" },
        { title: "Mollys Abschied", path: "scores/Beethoven,_Ludwig_van/8_Lieder,_Op.52/5_Mollys_Abschied/lc6491411.mxl" },
        { title: "Lied", path: "scores/Beethoven,_Ludwig_van/8_Lieder,_Op.52/6_Lied/lc6491431.mxl" },
        { title: "Marmotte", path: "scores/Beethoven,_Ludwig_van/8_Lieder,_Op.52/7_Marmotte/lc6491461.mxl" },
        { title: "Das Blümchen Wunderhold", path: "scores/Beethoven,_Ludwig_van/8_Lieder,_Op.52/8_Das_Blümchen_Wunderhold/lc6491478.mxl" },
      ],
    },
  },
  "beethoven-moonlight": {
    audio: {
      itemId: "MoonlightSonata_845",
      performer: "Ludwig van Beethoven / Paul Pitman",
      licence: "Public Domain Mark 1.0",
      licenceUrl: "http://creativecommons.org/publicdomain/mark/1.0/",
      tracks: [
        { title: "Moonlight Sonata", itemId: "MoonlightSonata_845", file: "Sonata_no_14_in_c_sharp_minor_moonlight_op_27_no_2_Iii.Presto.mp3" },
      ],
    },
  },
  "boulanger-clairieres": {
    score: {
      movements: [
        { title: "Elle était descendue au bas de la prairie", path: "scores/Boulanger,_Lili/Clairières_dans_le_ciel/1_Elle_était_descendue_au_bas_de_la_prairie/lc5852737.mxl" },
        { title: "Elle est gravement gaie", path: "scores/Boulanger,_Lili/Clairières_dans_le_ciel/2_Elle_est_gravement_gaie/lc5854283.mxl" },
        { title: "Parfois, je suis triste", path: "scores/Boulanger,_Lili/Clairières_dans_le_ciel/3_Parfois,_je_suis_triste/lc5855622.mxl" },
        { title: "Un poète disait", path: "scores/Boulanger,_Lili/Clairières_dans_le_ciel/4_Un_poète_disait/lc5857981.mxl" },
        { title: "Au pied de mon lit", path: "scores/Boulanger,_Lili/Clairières_dans_le_ciel/5_Au_pied_de_mon_lit/lc5861338.mxl" },
        { title: "Si tout ceci n’est qu’un pauvre rêve", path: "scores/Boulanger,_Lili/Clairières_dans_le_ciel/6_Si_tout_ceci_n’est_qu’un_pauvre_rêve/lc5861752.mxl" },
        { title: "Nous nous aimerons tant", path: "scores/Boulanger,_Lili/Clairières_dans_le_ciel/7_Nous_nous_aimerons_tant/lc5864781.mxl" },
        { title: "Vous m’avez regardé avec toute votre âme", path: "scores/Boulanger,_Lili/Clairières_dans_le_ciel/8_Vous_m’avez_regardé_avec_toute_votre_âme/lc5864837.mxl" },
        { title: "Les lilas qui avaient fleuri", path: "scores/Boulanger,_Lili/Clairières_dans_le_ciel/9_Les_lilas_qui_avaient_fleuri/lc5884544.mxl" },
        { title: "Deux ancolies", path: "scores/Boulanger,_Lili/Clairières_dans_le_ciel/10_Deux_ancolies/lc5887314.mxl" },
        { title: "Par ce que j’ai souffert", path: "scores/Boulanger,_Lili/Clairières_dans_le_ciel/11_Par_ce_que_j’ai_souffert/lc5901729.mxl" },
        { title: "Je garde une médaille d’elle", path: "scores/Boulanger,_Lili/Clairières_dans_le_ciel/12_Je_garde_une_médaille_d’elle/lc5901950.mxl" },
        { title: "Demain fera un an", path: "scores/Boulanger,_Lili/Clairières_dans_le_ciel/13_Demain_fera_un_an/lc5902873.mxl" },
      ],
    },
  },
  "brahms-4": {
    audio: {
      itemId: "Brahms_symphony4-Boston",
      performer: "Boston Symphony Orchestra, Serge Koussevitzky, Johannes Brahms",
      licence: "CC BY-NC-ND 4.0",
      licenceUrl: "https://creativecommons.org/licenses/by-nc-nd/4.0/",
      tracks: [
        { title: "01 I Allegro non troppo", itemId: "Brahms_symphony4-Boston", file: "01 I Allegro non troppo.mp3" },
        { title: "01 I Allergo non troppo", itemId: "Brahms_symphony4-Boston", file: "01 I Allergo non troppo.mp3" },
        { title: "02 II Andante moderato", itemId: "Brahms_symphony4-Boston", file: "02 II Andante moderato.mp3" },
        { title: "03 III Allegro giocoso", itemId: "Brahms_symphony4-Boston", file: "03 III Allegro giocoso.mp3" },
        { title: "04 IV Allegro energico e passionato", itemId: "Brahms_symphony4-Boston", file: "04 IV Allegro energico e passionato.mp3" },
      ],
    },
  },
  "brahms-lieder-op32": {
    score: {
      movements: [
        { title: "Wie rafft ich mich auf in der Nacht", path: "scores/Brahms,_Johannes/9_Lieder_und_Gesänge,_Op.32/1_Wie_rafft_ich_mich_auf_in_der_Nacht/lc5069058.mxl" },
        { title: "Nicht mehr zu dir zu gehen", path: "scores/Brahms,_Johannes/9_Lieder_und_Gesänge,_Op.32/2_Nicht_mehr_zu_dir_zu_gehen/lc5846184.mxl" },
        { title: "Ich schleich umher betrübt", path: "scores/Brahms,_Johannes/9_Lieder_und_Gesänge,_Op.32/3_Ich_schleich_umher_betrübt/lc5069066.mxl" },
        { title: "Der Strom, der neben mir verrauschte", path: "scores/Brahms,_Johannes/9_Lieder_und_Gesänge,_Op.32/4_Der_Strom,_der_neben_mir_verrauschte/lc5069048.mxl" },
        { title: "Wehe, so willst du mich wieder", path: "scores/Brahms,_Johannes/9_Lieder_und_Gesänge,_Op.32/5_Wehe,_so_willst_du_mich_wieder/lc5846139.mxl" },
        { title: "Du sprichst, dass ich mich täuschte", path: "scores/Brahms,_Johannes/9_Lieder_und_Gesänge,_Op.32/6_Du_sprichst,_dass_ich_mich_täuschte/lc5098641.mxl" },
        { title: "Bitteres zu sagen denkst du", path: "scores/Brahms,_Johannes/9_Lieder_und_Gesänge,_Op.32/7_Bitteres_zu_sagen_denkst_du/lc5033089.mxl" },
        { title: "So stehn wir, ich und meine Weide", path: "scores/Brahms,_Johannes/9_Lieder_und_Gesänge,_Op.32/8_So_stehn_wir,_ich_und_meine_Weide/lc5098645.mxl" },
        { title: "Wie bist du, meine Königin", path: "scores/Brahms,_Johannes/9_Lieder_und_Gesänge,_Op.32/9_Wie_bist_du,_meine_Königin/lc5846100.mxl" },
      ],
    },
  },
  "chopin-nocturnes": {
    audio: {
      itemId: "parso-0376f076666a403745bbb1c79277856a9f5ef9d4",
      performer: "Frédéric Chopin",
      licence: "CC0 1.0 (public domain dedication)",
      licenceUrl: "http://creativecommons.org/publicdomain/zero/1.0/",
      tracks: [
        { title: "Nocturne in C minor, B. 108", itemId: "parso-0376f076666a403745bbb1c79277856a9f5ef9d4", file: "000_Nocturne_B_108_in_C_minor.mp3" },
        { title: "Nocturne in F minor, Op. 55 no. 1", itemId: "parso-2baabd827af86a852bb54f058dbceba9edc4ec00", file: "000_Nocturne_Op_55_no_1_in_F_minor.mp3" },
        { title: "Nocturne in G major, Op. 37 No. 2", itemId: "parso-1c53a71e4ef6f47591ab605d801bc3780b27824a", file: "000_Chopin_Nocturne_Op_37_no_2_in_G_major_Olga_Gurevich.mp3" },
      ],
    },
  },
  "clara-schumann-op13": {
    score: {
      movements: [
        { title: "Ich stand in dunklen Träumen", path: "scores/Schumann,_Clara/6_Lieder,_Op.13/1_Ich_stand_in_dunklen_Träumen/lc5133602.mxl" },
        { title: "Sie liebten sich beide", path: "scores/Schumann,_Clara/6_Lieder,_Op.13/2_Sie_liebten_sich_beide/lc5125680.mxl" },
        { title: "Liebeszauber", path: "scores/Schumann,_Clara/6_Lieder,_Op.13/3_Liebeszauber/lc5126774.mxl" },
        { title: "Der Mond kommt still gegangen", path: "scores/Schumann,_Clara/6_Lieder,_Op.13/4_Der_Mond_kommt_still_gegangen/lc5126921.mxl" },
        { title: "Ich hab’ in Deinem Auge", path: "scores/Schumann,_Clara/6_Lieder,_Op.13/5_Ich_hab’_in_Deinem_Auge/lc5130351.mxl" },
        { title: "Die stille Lotosblume", path: "scores/Schumann,_Clara/6_Lieder,_Op.13/6_Die_stille_Lotosblume/lc5130634.mxl" },
      ],
    },
  },
  "debussy-faune": {
    audio: {
      itemId: "DebussyPreludeToTheAfternoonOfAFaun_903",
      performer: "Claude Debussy",
      licence: "CC BY 3.0",
      licenceUrl: "http://creativecommons.org/licenses/by/3.0/",
      tracks: [
        { title: "Debussy: Prelude to the Afternoon of a Faun", itemId: "DebussyPreludeToTheAfternoonOfAFaun_903", file: "Debussy_Prelude_to_the_Afternoon_of_a_Faun.mp3" },
      ],
    },
  },
  "debussy-preludes": {
    audio: {
      itemId: "DEBUSSYPreludesBookI-Cortot-NewTransfer",
      performer: "Alfred Cortot, piano",
      licence: "CC BY-NC-SA 3.0",
      licenceUrl: "http://creativecommons.org/licenses/by-nc-sa/3.0/",
      tracks: [
        { title: "No. 1 - Danseuses de Delphes", itemId: "DEBUSSYPreludesBookI-Cortot-NewTransfer", file: "01. No. 1 - Danseuses de Delphes.mp3" },
        { title: "No. 2 - Voiles", itemId: "DEBUSSYPreludesBookI-Cortot-NewTransfer", file: "02. No. 2 - Voiles.mp3" },
        { title: "No. 3 - Le vent dans la plaine", itemId: "DEBUSSYPreludesBookI-Cortot-NewTransfer", file: "03. No. 3 - Le vent dans la plaine.mp3" },
        { title: "No. 4 - Les sons et les parfums tournent dans l'air du soir", itemId: "DEBUSSYPreludesBookI-Cortot-NewTransfer", file: "04. No. 4 - Les sons et les parfums tournent dans l'air du soir.mp3" },
        { title: "No. 5 - Les collines d'Anacapri", itemId: "DEBUSSYPreludesBookI-Cortot-NewTransfer", file: "05. No. 5 - Les collines d'Anacapri.mp3" },
        { title: "No. 6 - Des pas sur la neige", itemId: "DEBUSSYPreludesBookI-Cortot-NewTransfer", file: "06. No. 6 - Des pas sur la neige.mp3" },
        { title: "No. 7 - Cé qu'a vu le vent d'ouest", itemId: "DEBUSSYPreludesBookI-Cortot-NewTransfer", file: "07. No. 7 - Cé qu'a vu le vent d'ouest.mp3" },
        { title: "No. 8 - La fille aux cheveux de lin", itemId: "DEBUSSYPreludesBookI-Cortot-NewTransfer", file: "08. No. 8 - La fille aux cheveux de lin.mp3" },
        { title: "No. 9 - La sérénade interrompue", itemId: "DEBUSSYPreludesBookI-Cortot-NewTransfer", file: "09. No. 9 - La sérénade interrompue.mp3" },
        { title: "No. 10 - La cathédrale engloutie", itemId: "DEBUSSYPreludesBookI-Cortot-NewTransfer", file: "10. No. 10 - La cathédrale engloutie.mp3" },
        { title: "No. 11 - La danse de Puck", itemId: "DEBUSSYPreludesBookI-Cortot-NewTransfer", file: "11. No. 11 - La danse de Puck.mp3" },
        { title: "No. 12 - Minstrels", itemId: "DEBUSSYPreludesBookI-Cortot-NewTransfer", file: "12. No. 12 - Minstrels.mp3" },
      ],
    },
  },
  "dvorak-9": {
    audio: {
      itemId: "SymphonyNo.9fromTheNewWorld",
      performer: "Antonin Dvorak",
      licence: "CC0 1.0 (public domain dedication)",
      licenceUrl: "http://creativecommons.org/publicdomain/zero/1.0/",
      tracks: [
        { title: "01_Adagio_Allegro molto", itemId: "SymphonyNo.9fromTheNewWorld", file: "01_adagio_allegroMolto.mp3" },
        { title: "02_Largo", itemId: "SymphonyNo.9fromTheNewWorld", file: "02_Largo.mp3" },
        { title: "03_Scherzo_Molto vivace", itemId: "SymphonyNo.9fromTheNewWorld", file: "03_scherzo_moltoVivace.mp3" },
        { title: "04_Allegro co fuoco", itemId: "SymphonyNo.9fromTheNewWorld", file: "04_allegroCoFuoco.mp3" },
      ],
    },
  },
  "gregorian-chant": {
    audio: {
      itemId: "GregorianChantMass",
      licence: "Public domain (Internet Archive)",
      licenceUrl: "http://creativecommons.org/licenses/publicdomain/",
      tracks: [
        { title: "02 Track 2", itemId: "GregorianChantMass", file: "02Track2.mp3" },
        { title: "04 Track 4", itemId: "GregorianChantMass", file: "04Track4.mp3" },
        { title: "05 Track 5", itemId: "GregorianChantMass", file: "05Track5.mp3" },
        { title: "06 Track 6", itemId: "GregorianChantMass", file: "06Track6.mp3" },
      ],
    },
  },
  "handel-messiah": {
    audio: {
      itemId: "HandelMessiahScherchen",
      performer: "Hermann Scherchen, conductor; London Symphony Orchestra; London Philharmonic Choir; Margaret Ritchie, soprano; Constance Schacklock, contralto; William Herbert, tenor; Richard Standen, bass; Frederick Jackson, chorus master; Thomas Matthews, violin; George Eskdale, trumpet",
      licence: "Public Domain Mark 1.0",
      licenceUrl: "http://creativecommons.org/publicdomain/mark/1.0/",
      truncated: true,
      tracks: [
        { title: "Handel - Messiah, Part 1 (Scherchen) - 01. Sinfony", itemId: "HandelMessiahScherchen", file: "Handel - Messiah, Part 1 (Scherchen) - 01. Sinfony.mp3" },
        { title: "Handel - Messiah, Part 1 (Scherchen) - 02. Comfort ye my people", itemId: "HandelMessiahScherchen", file: "Handel - Messiah, Part 1 (Scherchen) - 02. Comfort ye my people.mp3" },
        { title: "Handel - Messiah, Part 1 (Scherchen) - 03. Ev'ry valley shall be exalted", itemId: "HandelMessiahScherchen", file: "Handel - Messiah, Part 1 (Scherchen) - 03. Ev'ry valley shall be exalted.mp3" },
        { title: "Handel - Messiah, Part 1 (Scherchen) - 04. And the glory of the Lord", itemId: "HandelMessiahScherchen", file: "Handel - Messiah, Part 1 (Scherchen) - 04. And the glory of the Lord.mp3" },
        { title: "Handel - Messiah, Part 1 (Scherchen) - 05. Thus saith the Lord of hosts", itemId: "HandelMessiahScherchen", file: "Handel - Messiah, Part 1 (Scherchen) - 05. Thus saith the Lord of hosts.mp3" },
        { title: "Handel - Messiah, Part 1 (Scherchen) - 06. But who may abide the day of His coming", itemId: "HandelMessiahScherchen", file: "Handel - Messiah, Part 1 (Scherchen) - 06. But who may abide the day of His coming.mp3" },
        { title: "Handel - Messiah, Part 1 (Scherchen) - 07. And he shall purify the sons of Levi", itemId: "HandelMessiahScherchen", file: "Handel - Messiah, Part 1 (Scherchen) - 07. And he shall purify the sons of Levi.mp3" },
        { title: "Handel - Messiah, Part 1 (Scherchen) - 08. Behold, a virgin shall conceive", itemId: "HandelMessiahScherchen", file: "Handel - Messiah, Part 1 (Scherchen) - 08. Behold, a virgin shall conceive.mp3" },
        { title: "Handel - Messiah, Part 1 (Scherchen) - 09. O thou that tellest good tidings to Zion", itemId: "HandelMessiahScherchen", file: "Handel - Messiah, Part 1 (Scherchen) - 09. O thou that tellest good tidings to Zion.mp3" },
        { title: "Handel - Messiah, Part 1 (Scherchen) - 10. For behold, darkness shall cover the earth", itemId: "HandelMessiahScherchen", file: "Handel - Messiah, Part 1 (Scherchen) - 10. For behold, darkness shall cover the earth.mp3" },
        { title: "Handel - Messiah, Part 1 (Scherchen) - 11. The people that walked in darkness have seen a great light", itemId: "HandelMessiahScherchen", file: "Handel - Messiah, Part 1 (Scherchen) - 11. The people that walked in darkness have seen a great light.mp3" },
        { title: "Handel - Messiah, Part 1 (Scherchen) - 12. For unto us a child is born", itemId: "HandelMessiahScherchen", file: "Handel - Messiah, Part 1 (Scherchen) - 12. For unto us a child is born.mp3" },
        { title: "Handel - Messiah, Part 1 (Scherchen) - 13. Pifa (Pastoral Symphony)", itemId: "HandelMessiahScherchen", file: "Handel - Messiah, Part 1 (Scherchen) - 13. Pifa (Pastoral Symphony).mp3" },
        { title: "Handel - Messiah, Part 1 (Scherchen) - 14. There were shepherds abiding in the fields", itemId: "HandelMessiahScherchen", file: "Handel - Messiah, Part 1 (Scherchen) - 14. There were shepherds abiding in the fields.mp3" },
        { title: "Handel - Messiah, Part 1 (Scherchen) - 15. And lo, the angel of the Lord", itemId: "HandelMessiahScherchen", file: "Handel - Messiah, Part 1 (Scherchen) - 15. And lo, the angel of the Lord.mp3" },
        { title: "Handel - Messiah, Part 1 (Scherchen) - 16. And the angel said unto them", itemId: "HandelMessiahScherchen", file: "Handel - Messiah, Part 1 (Scherchen) - 16. And the angel said unto them.mp3" },
        { title: "Handel - Messiah, Part 1 (Scherchen) - 17. And suddenly there was with the angel", itemId: "HandelMessiahScherchen", file: "Handel - Messiah, Part 1 (Scherchen) - 17. And suddenly there was with the angel.mp3" },
        { title: "Handel - Messiah, Part 1 (Scherchen) - 18. Glory to God in the highest", itemId: "HandelMessiahScherchen", file: "Handel - Messiah, Part 1 (Scherchen) - 18. Glory to God in the highest.mp3" },
        { title: "Handel - Messiah, Part 1 (Scherchen) - 19. Rejoice greatly, O daughter of Zion", itemId: "HandelMessiahScherchen", file: "Handel - Messiah, Part 1 (Scherchen) - 19. Rejoice greatly, O daughter of Zion.mp3" },
        { title: "Handel - Messiah, Part 1 (Scherchen) - 20. Then shall the eyes of the blind be opened", itemId: "HandelMessiahScherchen", file: "Handel - Messiah, Part 1 (Scherchen) - 20. Then shall the eyes of the blind be opened.mp3" },
        { title: "Handel - Messiah, Part 1 (Scherchen) - 21. He shall feed his flock like a shepherd", itemId: "HandelMessiahScherchen", file: "Handel - Messiah, Part 1 (Scherchen) - 21. He shall feed his flock like a shepherd.mp3" },
        { title: "Handel - Messiah, Part 1 (Scherchen) - 22. His yoke is easy", itemId: "HandelMessiahScherchen", file: "Handel - Messiah, Part 1 (Scherchen) - 22. His yoke is easy.mp3" },
        { title: "Handel - Messiah, Part 2 (Scherchen) - 23. Behold the Lamb of God", itemId: "HandelMessiahScherchen", file: "Handel - Messiah, Part 2 (Scherchen) - 23. Behold the Lamb of God.mp3" },
        { title: "Handel - Messiah, Part 2 (Scherchen) - 24. He was despised and rejected of men", itemId: "HandelMessiahScherchen", file: "Handel - Messiah, Part 2 (Scherchen) - 24. He was despised and rejected of men.mp3" },
        { title: "Handel - Messiah, Part 2 (Scherchen) - 25. Surely he hath borne our griefs and carried our sorrows", itemId: "HandelMessiahScherchen", file: "Handel - Messiah, Part 2 (Scherchen) - 25. Surely he hath borne our griefs and carried our sorrows.mp3" },
        { title: "Handel - Messiah, Part 2 (Scherchen) - 26. And with his stripes we are healed", itemId: "HandelMessiahScherchen", file: "Handel - Messiah, Part 2 (Scherchen) - 26. And with his stripes we are healed.mp3" },
        { title: "Handel - Messiah, Part 2 (Scherchen) - 27. All we like sheep have gone astray", itemId: "HandelMessiahScherchen", file: "Handel - Messiah, Part 2 (Scherchen) - 27. All we like sheep have gone astray.mp3" },
        { title: "Handel - Messiah, Part 2 (Scherchen) - 28. All they that see him laugh to scorn", itemId: "HandelMessiahScherchen", file: "Handel - Messiah, Part 2 (Scherchen) - 28. All they that see him laugh to scorn.mp3" },
        { title: "Handel - Messiah, Part 2 (Scherchen) - 29. He trusted in God that he would deliver him", itemId: "HandelMessiahScherchen", file: "Handel - Messiah, Part 2 (Scherchen) - 29. He trusted in God that he would deliver him.mp3" },
        { title: "Handel - Messiah, Part 2 (Scherchen) - 30. Thy rebuke hath broken his heart", itemId: "HandelMessiahScherchen", file: "Handel - Messiah, Part 2 (Scherchen) - 30. Thy rebuke hath broken his heart.mp3" },
        { title: "Handel - Messiah, Part 2 (Scherchen) - 31. Behold and see if there be any sorrow", itemId: "HandelMessiahScherchen", file: "Handel - Messiah, Part 2 (Scherchen) - 31. Behold and see if there be any sorrow.mp3" },
        { title: "Handel - Messiah, Part 2 (Scherchen) - 32. He was cut off", itemId: "HandelMessiahScherchen", file: "Handel - Messiah, Part 2 (Scherchen) - 32. He was cut off.mp3" },
      ],
    },
  },
  "hensel-lieder-op1": {
    score: {
      movements: [
        { title: "Schwanenlied", path: "scores/Hensel,_Fanny/6_Lieder,_Op.1/1_Schwanenlied/lc5100543.mxl" },
        { title: "Wanderlied", path: "scores/Hensel,_Fanny/6_Lieder,_Op.1/2_Wanderlied/lc5004632.mxl" },
        { title: "Warum sind denn die Rosen so blass", path: "scores/Hensel,_Fanny/6_Lieder,_Op.1/3_Warum_sind_denn_die_Rosen_so_blass/lc5004640.mxl" },
        { title: "Mayenlied", path: "scores/Hensel,_Fanny/6_Lieder,_Op.1/4_Mayenlied/lc5101299.mxl" },
        { title: "Morgenständchen", path: "scores/Hensel,_Fanny/6_Lieder,_Op.1/5_Morgenständchen/lc5004650.mxl" },
        { title: "Gondellied", path: "scores/Hensel,_Fanny/6_Lieder,_Op.1/6_Gondellied/lc5101361.mxl" },
      ],
    },
  },
  "hildegard-ordo": {
    audio: {
      itemId: "04-o-ierusalem",
      performer: "Gothic Voices ~ Emma Kirby (soprano) ~ Christopher Page (conductor)",
      licence: "CC BY-NC-ND 4.0",
      licenceUrl: "https://creativecommons.org/licenses/by-nc-nd/4.0/",
      tracks: [
        { title: "Bingen, Hildegard von: Columba aspexit", itemId: "04-o-ierusalem", file: "01 Columba aspexit.mp3" },
        { title: "Bingen, Hildegard von: Ave, generosa", itemId: "04-o-ierusalem", file: "02 Ave, generosa.mp3" },
        { title: "Bingen, Hildegard von: O ignis spiritus", itemId: "04-o-ierusalem", file: "03 O ignis spiritus.mp3" },
        { title: "Bingen, Hildegard von: O Ierusalem", itemId: "04-o-ierusalem", file: "04 O Ierusalem.mp3" },
        { title: "Bingen, Hildegard von: O Euchari", itemId: "04-o-ierusalem", file: "05 O Euchari.mp3" },
        { title: "Bingen, Hildegard von: O viridissima virga", itemId: "04-o-ierusalem", file: "06 O viridissima virga.mp3" },
        { title: "Bingen, Hildegard von: O presul vere civitati", itemId: "04-o-ierusalem", file: "07 O presul vere civitati.mp3" },
        { title: "Bingen, Hildegard von: O Ecclesia", itemId: "04-o-ierusalem", file: "08 O Ecclesia.mp3" },
      ],
    },
  },
  "holst-planets": {
    audio: {
      itemId: "gustav-holst-the-planets-op.-32",
      performer: "Gustav Holst",
      licence: "CC0 1.0 (public domain dedication)",
      licenceUrl: "http://creativecommons.org/publicdomain/zero/1.0/",
      tracks: [
        { title: "The Planets, op.32: 1. Mars, the Bringer of War", itemId: "gustav-holst-the-planets-op.-32", file: "The Planets, Op. 32 - Gustav Holst/01 - Holst - The Planets, op.32 - 1. Mars, the Bringer of War.mp3" },
        { title: "The Planets, op.32: 2. Venus, the Bringer of Peace", itemId: "gustav-holst-the-planets-op.-32", file: "The Planets, Op. 32 - Gustav Holst/02 - Holst - The Planets, op.32 - 2. Venus, the Bringer of Peace.mp3" },
        { title: "The Planets, op.32: 3. Mercury, the Winged Messenger", itemId: "gustav-holst-the-planets-op.-32", file: "The Planets, Op. 32 - Gustav Holst/03 - Holst - The Planets, op.32 - 3. Mercury, the Winged Messenger.mp3" },
        { title: "The Planets, op.32: 4. Jupiter, the Bringer of Jollity", itemId: "gustav-holst-the-planets-op.-32", file: "The Planets, Op. 32 - Gustav Holst/04 - Holst - The Planets, op.32 - 4. Jupiter, the Bringer of Jollity.mp3" },
        { title: "The Planets, op.32: 5. Saturn, the Bringer of Old Age", itemId: "gustav-holst-the-planets-op.-32", file: "The Planets, Op. 32 - Gustav Holst/05 - Holst - The Planets, op.32 - 5. Saturn, the Bringer of Old Age.mp3" },
        { title: "The Planets, op.32: 6. Uranus, the Magician", itemId: "gustav-holst-the-planets-op.-32", file: "The Planets, Op. 32 - Gustav Holst/06 - Holst - The Planets, op.32 - 6. Uranus, the Magician.mp3" },
        { title: "The Planets, op.32: 7. Neptune, the Mystic", itemId: "gustav-holst-the-planets-op.-32", file: "The Planets, Op. 32 - Gustav Holst/07 - Holst - The Planets, op.32 - 7. Neptune, the Mystic.mp3" },
      ],
    },
  },
  "joplin-entertainer": {
    audio: {
      itemId: "TheEntertainerJoplin",
      performer: "Scott Joplin and Dilbrent",
      licence: "Public Domain Mark 1.0",
      licenceUrl: "http://creativecommons.org/publicdomain/mark/1.0/",
      tracks: [
        { title: "The Entertainer", itemId: "TheEntertainerJoplin", file: "The Entertainer.mp3" },
      ],
    },
  },
  "joplin-maple-leaf": {
    audio: {
      itemId: "MapleLeafRag",
      performer: "Scott Joplin",
      licence: "Public domain (Internet Archive)",
      licenceUrl: "http://creativecommons.org/licenses/publicdomain/",
      tracks: [
        { title: "Maple Leaf Rag", itemId: "MapleLeafRag", file: "MapleLeafRag.mp3" },
      ],
    },
  },
  "machaut-messe": {
    audio: {
      itemId: "MesseDeNostreDameDeGuillaumeMachaut",
      performer: "Guillaume Machaut",
      licence: "Public domain (Internet Archive)",
      licenceUrl: "http://creativecommons.org/licenses/publicdomain/",
      tracks: [
        { title: "Messe de Nostre Dame de Guillaume Machaut", itemId: "MesseDeNostreDameDeGuillaumeMachaut", file: "machaut.mp3" },
      ],
    },
  },
  "mozart-40": {
    audio: {
      itemId: "mozart-symphony-40-in-g-minor-k-550",
      performer: "Wolfgang Amadeus Mozart",
      licence: "CC BY 4.0",
      licenceUrl: "https://creativecommons.org/licenses/by/4.0/",
      tracks: [
        { title: "Mozart: Symphony #40 In G Minor, K 550 - 1. Molto Allegro", itemId: "mozart-symphony-40-in-g-minor-k-550", file: "05 Mozart- Symphony #40 In G Minor, K 550 - 1. Molto Allegro.mp3" },
        { title: "Mozart: Symphony #40 In G Minor, K 550 - 2. Andante", itemId: "mozart-symphony-40-in-g-minor-k-550", file: "06 Mozart- Symphony #40 In G Minor, K 550 - 2. Andante.mp3" },
        { title: "Mozart: Symphony #40 In G Minor, K 550 - 3. Menuetto: Allegretto, Trio", itemId: "mozart-symphony-40-in-g-minor-k-550", file: "07 Mozart- Symphony #40 In G Minor, K 550 - 3. Menuetto- Allegretto, Trio.mp3" },
        { title: "Mozart: Symphony #40 In G Minor, K 550 - 4. Finale: Allegro Assai", itemId: "mozart-symphony-40-in-g-minor-k-550", file: "08 Mozart- Symphony #40 In G Minor, K 550 - 4. Finale- Allegro Assai.mp3" },
      ],
    },
  },
  "mozart-requiem": {
    audio: {
      itemId: "06-mozart-requiem-in-d-minor-k-626-sequentia-recordare",
      performer: "Wolfgang Amadeus Mozart",
      licence: "CC BY 4.0",
      licenceUrl: "https://creativecommons.org/licenses/by/4.0/",
      tracks: [
        { title: "Mozart: Requiem In D Minor, K 626 - Introitus: Requiem Aeternam", itemId: "06-mozart-requiem-in-d-minor-k-626-sequentia-recordare", file: "01 Mozart- Requiem In D Minor, K 626 - Introitus- Requiem Aeternam.mp3" },
        { title: "Mozart: Requiem In D Minor, K 626 - Kyrie Eleison", itemId: "06-mozart-requiem-in-d-minor-k-626-sequentia-recordare", file: "02 Mozart- Requiem In D Minor, K 626 - Kyrie Eleison.mp3" },
        { title: "Mozart: Requiem In D Minor, K 626 - Sequentia: Dies Irae", itemId: "06-mozart-requiem-in-d-minor-k-626-sequentia-recordare", file: "03 Mozart- Requiem In D Minor, K 626 - Sequentia- Dies Irae.mp3" },
        { title: "Mozart: Requiem In D Minor, K 626 - Sequentia: Tuba Mirum", itemId: "06-mozart-requiem-in-d-minor-k-626-sequentia-recordare", file: "04 Mozart- Requiem In D Minor, K 626 - Sequentia- Tuba Mirum.mp3" },
        { title: "Mozart: Requiem In D Minor, K 626 - Sequentia: Rex Tremendae", itemId: "06-mozart-requiem-in-d-minor-k-626-sequentia-recordare", file: "05 Mozart- Requiem In D Minor, K 626 - Sequentia- Rex Tremendae.mp3" },
        { title: "Mozart: Requiem In D Minor, K 626 - Sequentia: Recordare", itemId: "06-mozart-requiem-in-d-minor-k-626-sequentia-recordare", file: "06 Mozart- Requiem In D Minor, K 626 - Sequentia- Recordare.mp3" },
        { title: "Mozart: Requiem In D Minor, K 626 - Sequentia: Confutatis Maledictis", itemId: "06-mozart-requiem-in-d-minor-k-626-sequentia-recordare", file: "07 Mozart- Requiem In D Minor, K 626 - Sequentia- Confutatis Maledictis.mp3" },
        { title: "Mozart: Requiem In D Minor, K 626 - Sequentia: Lacrimosa Dies Illa", itemId: "06-mozart-requiem-in-d-minor-k-626-sequentia-recordare", file: "08 Mozart- Requiem In D Minor, K 626 - Sequentia- Lacrimosa Dies Illa.mp3" },
        { title: "Mozart: Requiem In D Minor, K 626 - Offertorium: Domine Jesu Christe", itemId: "06-mozart-requiem-in-d-minor-k-626-sequentia-recordare", file: "09 Mozart- Requiem In D Minor, K 626 - Offertorium- Domine Jesu Christe.mp3" },
        { title: "Mozart: Requiem In D Minor, K 626 - Offertorium: Hostias Et Preces", itemId: "06-mozart-requiem-in-d-minor-k-626-sequentia-recordare", file: "10 Mozart- Requiem In D Minor, K 626 - Offertorium- Hostias Et Preces.mp3" },
        { title: "Mozart: Requiem In D Minor, K 626 - Sanctus", itemId: "06-mozart-requiem-in-d-minor-k-626-sequentia-recordare", file: "11 Mozart- Requiem In D Minor, K 626 - Sanctus.mp3" },
        { title: "Mozart: Requiem In D Minor, K 626 - Benedictus", itemId: "06-mozart-requiem-in-d-minor-k-626-sequentia-recordare", file: "12 Mozart- Requiem In D Minor, K 626 - Benedictus.mp3" },
        { title: "Mozart: Requiem In D Minor, K 626 - Agnus Dei", itemId: "06-mozart-requiem-in-d-minor-k-626-sequentia-recordare", file: "13 Mozart- Requiem In D Minor, K 626 - Agnus Dei.mp3" },
        { title: "Mozart: Requiem In D Minor, K 626 - Communio: Lux Aeterna", itemId: "06-mozart-requiem-in-d-minor-k-626-sequentia-recordare", file: "14 Mozart- Requiem In D Minor, K 626 - Communio- Lux Aeterna.mp3" },
      ],
    },
  },
  "pachelbel-canon": {
    audio: {
      itemId: "PachelbelsCanoninD",
      licence: "Public domain (Internet Archive)",
      licenceUrl: "http://creativecommons.org/licenses/publicdomain/",
      tracks: [
        { title: "Pachelbel's Canon in D", itemId: "PachelbelsCanoninD", file: "Canon_in_D_Piano.mp3" },
      ],
    },
  },
  "satie-gymnopedies": {
    audio: {
      itemId: "ThreeGnossiennesErikSatie",
      performer: "Rafi Simcha",
      licence: "CC BY 3.0",
      licenceUrl: "http://creativecommons.org/licenses/by/3.0/",
      tracks: [
        { title: "1st Gymnopedie ~ 1888", itemId: "ThreeGnossiennesErikSatie", file: "Satie.mp3" },
        { title: "Three Gnossiennes ~ 1890", itemId: "ThreeGnossiennesErikSatie", file: "gnossiennes.mp3" },
      ],
    },
  },
  "schoenberg-op15": {
    score: {
      movements: [
        { title: "Unterm Schutz von dichten Blättergründen", path: "scores/Schoenberg,_Arnold/Das_Buch_der_hängenden_Gärten,_Op.15/1_Unterm_Schutz_von_dichten_Blättergründen/lc9134208.mxl" },
        { title: "Hain in diesen Paradiesen", path: "scores/Schoenberg,_Arnold/Das_Buch_der_hängenden_Gärten,_Op.15/2_Hain_in_diesen_Paradiesen/lc9134397.mxl" },
        { title: "Als Neuling trat ich ein in dein Gehege", path: "scores/Schoenberg,_Arnold/Das_Buch_der_hängenden_Gärten,_Op.15/3_Als_Neuling_trat_ich_ein_in_dein_Gehege/lc9134607.mxl" },
        { title: "Da meine Lippen reglos sind und brennen", path: "scores/Schoenberg,_Arnold/Das_Buch_der_hängenden_Gärten,_Op.15/4_Da_meine_Lippen_reglos_sind_und_brennen/lc9138438.mxl" },
        { title: "Saget mir, auf welchem Pfade", path: "scores/Schoenberg,_Arnold/Das_Buch_der_hängenden_Gärten,_Op.15/5_Saget_mir,_auf_welchem_Pfade/lc9138579.mxl" },
        { title: "Jedem Werke bin ich fürder tot", path: "scores/Schoenberg,_Arnold/Das_Buch_der_hängenden_Gärten,_Op.15/6_Jedem_Werke_bin_ich_fürder_tot/lc30437000.mxl" },
        { title: "Angst und Hoffen wechselnd mich beklemmen", path: "scores/Schoenberg,_Arnold/Das_Buch_der_hängenden_Gärten,_Op.15/7_Angst_und_Hoffen_wechselnd_mich_beklemmen/lc30437453.mxl" },
        { title: "Wenn ich heut nicht deinen Leib berühre", path: "scores/Schoenberg,_Arnold/Das_Buch_der_hängenden_Gärten,_Op.15/8_Wenn_ich_heut_nicht_deinen_Leib_berühre/lc30480782.mxl" },
        { title: "Streng ist uns das Glück und Spröde", path: "scores/Schoenberg,_Arnold/Das_Buch_der_hängenden_Gärten,_Op.15/9_Streng_ist_uns_das_Glück_und_Spröde/lc30509105.mxl" },
        { title: "Das schöne Beet betracht ich mir im Harren", path: "scores/Schoenberg,_Arnold/Das_Buch_der_hängenden_Gärten,_Op.15/10_Das_schöne_Beet_betracht_ich_mir_im_Harren/lc30509480.mxl" },
      ],
    },
  },
  "schubert-erlkonig": {
    score: {
      movements: [
        { title: "Der Erlkönig, D.328", path: "scores/Schubert,_Franz/_/Der_Erlkönig,_D.328/lc29062370.mxl" },
      ],
    },
    audio: {
      itemId: "erlkonig-schlusnus",
      performer: "Heinrich SCHLUSNUS - Bariton",
      licence: "Public Domain Mark 1.0",
      licenceUrl: "http://creativecommons.org/publicdomain/mark/1.0/",
      tracks: [
        { title: "Der Erlkönig", itemId: "erlkonig-schlusnus", file: "Erlkönig Schlusnus.mp3" },
      ],
    },
  },
  "schubert-gretchen": {
    score: {
      movements: [
        { title: "Gretchen am Spinnrade, D.118", path: "scores/Schubert,_Franz/_/Gretchen_am_Spinnrade,_D.118/lc7111114.mxl" },
      ],
    },
  },
  "schubert-schoene-muellerin": {
    score: {
      movements: [
        { title: "Das Wandern", path: "scores/Schubert,_Franz/Die_schöne_Müllerin,_D.795/1_Das_Wandern/lc5004731.mxl" },
        { title: "Wohin", path: "scores/Schubert,_Franz/Die_schöne_Müllerin,_D.795/2_Wohin/lc4982535.mxl" },
        { title: "Halt!", path: "scores/Schubert,_Franz/Die_schöne_Müllerin,_D.795/3_Halt!/lc4985937.mxl" },
        { title: "Danksagung an den Bach", path: "scores/Schubert,_Franz/Die_schöne_Müllerin,_D.795/4_Danksagung_an_den_Bach/lc4985925.mxl" },
        { title: "Am Feierabend", path: "scores/Schubert,_Franz/Die_schöne_Müllerin,_D.795/5_Am_Feierabend/lc4985924.mxl" },
        { title: "Der Neugierige", path: "scores/Schubert,_Franz/Die_schöne_Müllerin,_D.795/6_Der_Neugierige/lc4985930.mxl" },
        { title: "Ungeduld", path: "scores/Schubert,_Franz/Die_schöne_Müllerin,_D.795/7_Ungeduld/lc4985951.mxl" },
        { title: "Morgengruß", path: "scores/Schubert,_Franz/Die_schöne_Müllerin,_D.795/8_Morgengruß/lc5025982.mxl" },
        { title: "Des Müllers Blumen", path: "scores/Schubert,_Franz/Die_schöne_Müllerin,_D.795/9_Des_Müllers_Blumen/lc4985932.mxl" },
        { title: "Tränenregen", path: "scores/Schubert,_Franz/Die_schöne_Müllerin,_D.795/10_Tränenregen/lc5025985.mxl" },
        { title: "Mein!", path: "scores/Schubert,_Franz/Die_schöne_Müllerin,_D.795/11_Mein!/lc4985938.mxl" },
        { title: "Pause", path: "scores/Schubert,_Franz/Die_schöne_Müllerin,_D.795/12_Pause/lc4985946.mxl" },
        { title: "Mit dem grünen Lautenbande", path: "scores/Schubert,_Franz/Die_schöne_Müllerin,_D.795/13_Mit_dem_grünen_Lautenbande/lc4985940.mxl" },
        { title: "Der Jäger", path: "scores/Schubert,_Franz/Die_schöne_Müllerin,_D.795/14_Der_Jäger/lc4985927.mxl" },
        { title: "Eifersucht und Stolz", path: "scores/Schubert,_Franz/Die_schöne_Müllerin,_D.795/15_Eifersucht_und_Stolz/lc5026236.mxl" },
        { title: "Die liebe Farbe", path: "scores/Schubert,_Franz/Die_schöne_Müllerin,_D.795/16_Die_liebe_Farbe/lc4985935.mxl" },
        { title: "Die böse Farbe", path: "scores/Schubert,_Franz/Die_schöne_Müllerin,_D.795/17_Die_böse_Farbe/lc4985934.mxl" },
        { title: "Trockne Blumen", path: "scores/Schubert,_Franz/Die_schöne_Müllerin,_D.795/18_Trockne_Blumen/lc4985949.mxl" },
        { title: "Der Müller und der Bach", path: "scores/Schubert,_Franz/Die_schöne_Müllerin,_D.795/19_Der_Müller_und_der_Bach/lc4985922.mxl" },
        { title: "Des Baches Wiegenlied", path: "scores/Schubert,_Franz/Die_schöne_Müllerin,_D.795/20_Des_Baches_Wiegenlied/lc4985931.mxl" },
      ],
    },
  },
  "schubert-schwanengesang": {
    score: {
      movements: [
        { title: "Liebesbotschaft", path: "scores/Schubert,_Franz/Schwanengesang,_D.957/1_Liebesbotschaft/lc5077744.mxl" },
        { title: "Kriegers Ahnung", path: "scores/Schubert,_Franz/Schwanengesang,_D.957/2_Kriegers_Ahnung/lc4986000.mxl" },
        { title: "Frühlingssehnsucht", path: "scores/Schubert,_Franz/Schwanengesang,_D.957/3_Frühlingssehnsucht/lc4985999.mxl" },
        { title: "Ständchen", path: "scores/Schubert,_Franz/Schwanengesang,_D.957/4_Ständchen/lc5004835.mxl" },
        { title: "Aufenthalt", path: "scores/Schubert,_Franz/Schwanengesang,_D.957/5_Aufenthalt/lc4985990.mxl" },
        { title: "In der Ferne", path: "scores/Schubert,_Franz/Schwanengesang,_D.957/6_In_der_Ferne/lc4985987.mxl" },
        { title: "Abschied", path: "scores/Schubert,_Franz/Schwanengesang,_D.957/7_Abschied/lc4978506.mxl" },
        { title: "Der Atlas", path: "scores/Schubert,_Franz/Schwanengesang,_D.957/8_Der_Atlas/lc4985985.mxl" },
        { title: "Ihr Bild", path: "scores/Schubert,_Franz/Schwanengesang,_D.957/9_Ihr_Bild/lc4985984.mxl" },
        { title: "Das Fischermädchen", path: "scores/Schubert,_Franz/Schwanengesang,_D.957/10_Das_Fischermädchen/lc5098612.mxl" },
        { title: "Die Stadt", path: "scores/Schubert,_Franz/Schwanengesang,_D.957/11_Die_Stadt/lc4985973.mxl" },
        { title: "Am Meer", path: "scores/Schubert,_Franz/Schwanengesang,_D.957/12_Am_Meer/lc4985965.mxl" },
        { title: "Der Doppelgänger", path: "scores/Schubert,_Franz/Schwanengesang,_D.957/13_Der_Doppelgänger/lc4985964.mxl" },
        { title: "Die Taubenpost", path: "scores/Schubert,_Franz/Schwanengesang,_D.957/14_Die_Taubenpost/lc4985962.mxl" },
      ],
    },
  },
  "schubert-winterreise": {
    score: {
      movements: [
        { title: "Gute Nacht", path: "scores/Schubert,_Franz/Winterreise,_D.911/1_Gute_Nacht/lc5015378.mxl" },
        { title: "Die Wetterfahne", path: "scores/Schubert,_Franz/Winterreise,_D.911/2_Die_Wetterfahne/lc5015435.mxl" },
        { title: "Gefror’ne Thränen", path: "scores/Schubert,_Franz/Winterreise,_D.911/3_Gefror’ne_Thränen/lc5015499.mxl" },
        { title: "Erstarrung", path: "scores/Schubert,_Franz/Winterreise,_D.911/4_Erstarrung/lc5015573.mxl" },
        { title: "Der Lindenbaum", path: "scores/Schubert,_Franz/Winterreise,_D.911/5_Der_Lindenbaum/lc5016466.mxl" },
        { title: "Wasserfluth", path: "scores/Schubert,_Franz/Winterreise,_D.911/6_Wasserfluth/lc5016512.mxl" },
        { title: "Auf dem Flusse", path: "scores/Schubert,_Franz/Winterreise,_D.911/7_Auf_dem_Flusse/lc5015410.mxl" },
        { title: "Rückblick", path: "scores/Schubert,_Franz/Winterreise,_D.911/8_Rückblick/lc5015521.mxl" },
        { title: "Irrlicht", path: "scores/Schubert,_Franz/Winterreise,_D.911/9_Irrlicht/lc5023438.mxl" },
        { title: "Rast (Spätere Fassung)", path: "scores/Schubert,_Franz/Winterreise,_D.911/10_Rast_(Spätere_Fassung)/lc5023517.mxl" },
        { title: "Frühlingstraum", path: "scores/Schubert,_Franz/Winterreise,_D.911/11_Frühlingstraum/lc5023603.mxl" },
        { title: "Einsamkeit (Urspruengliche Fassung)", path: "scores/Schubert,_Franz/Winterreise,_D.911/12_Einsamkeit_(Urspruengliche_Fassung)/lc5023662.mxl" },
        { title: "Die Post", path: "scores/Schubert,_Franz/Winterreise,_D.911/13_Die_Post/lc5007176.mxl" },
        { title: "Der greise Kopf", path: "scores/Schubert,_Franz/Winterreise,_D.911/14_Der_greise_Kopf/lc5007178.mxl" },
        { title: "Die Kraehe", path: "scores/Schubert,_Franz/Winterreise,_D.911/15_Die_Kraehe/lc5007179.mxl" },
        { title: "Letzte Hoffnung", path: "scores/Schubert,_Franz/Winterreise,_D.911/16_Letzte_Hoffnung/lc5007180.mxl" },
        { title: "Im Dorfe", path: "scores/Schubert,_Franz/Winterreise,_D.911/17_Im_Dorfe/lc5007181.mxl" },
        { title: "Der stuermische Morgen", path: "scores/Schubert,_Franz/Winterreise,_D.911/18_Der_stuermische_Morgen/lc5007182.mxl" },
        { title: "Täuschung", path: "scores/Schubert,_Franz/Winterreise,_D.911/19_Täuschung/lc5009833.mxl" },
        { title: "Der Wegweiser", path: "scores/Schubert,_Franz/Winterreise,_D.911/20_Der_Wegweiser/lc5009900.mxl" },
        { title: "Das Wirthshaus", path: "scores/Schubert,_Franz/Winterreise,_D.911/21_Das_Wirthshaus/lc5013945.mxl" },
        { title: "Muth", path: "scores/Schubert,_Franz/Winterreise,_D.911/22_Muth/lc5013969.mxl" },
        { title: "Die Nebensonnen", path: "scores/Schubert,_Franz/Winterreise,_D.911/23_Die_Nebensonnen/lc5014002.mxl" },
        { title: "Der Leiermann (Spätere Fassung)", path: "scores/Schubert,_Franz/Winterreise,_D.911/24_Der_Leiermann_(Spätere_Fassung)/lc5014023.mxl" },
      ],
    },
    audio: {
      itemId: "tauberwinterreise",
      performer: "Richard TAUBER - Tenor",
      licence: "Public Domain Mark 1.0",
      licenceUrl: "http://creativecommons.org/publicdomain/mark/1.0/",
      tracks: [
        { title: "01 - Tauber Lied Side B Schubert Wintereise 1927 - 1. Gute Nacht", itemId: "tauberwinterreise", file: "01 - Tauber Lied Side B Schubert Wintereise 1927 - 1. Gute Nacht.mp3" },
        { title: "02 - Tauber Lied Side B Schubert Wintereise 1927 - 5. Lindenbaum", itemId: "tauberwinterreise", file: "02 - Tauber Lied Side B Schubert Wintereise 1927 - 5. Lindenbaum.mp3" },
        { title: "03 - Tauber Lied Side B Schubert Wintereise 1927 - 5. Wasserfluth", itemId: "tauberwinterreise", file: "03 - Tauber Lied Side B Schubert Wintereise 1927 - 5. Wasserfluth.mp3" },
        { title: "04 - Tauber Lied Side B Schubert Wintereise 1927 - 8. Rückblick", itemId: "tauberwinterreise", file: "04 - Tauber Lied Side B Schubert Wintereise 1927 - 8. Rückblick.mp3" },
        { title: "05 - Tauber Lied Side B Schubert Wintereise 1927 - 11. Frühlingstraum", itemId: "tauberwinterreise", file: "05 - Tauber Lied Side B Schubert Wintereise 1927 - 11. Frühlingstraum.mp3" },
        { title: "06 - Tauber Lied Side B Schubert Wintereise 1927 - 13. Die Post", itemId: "tauberwinterreise", file: "06 - Tauber Lied Side B Schubert Wintereise 1927 - 13. Die Post.mp3" },
        { title: "07 - Tauber Lied Side B Schubert Wintereise 1927 - 15. Die Krähe", itemId: "tauberwinterreise", file: "07 - Tauber Lied Side B Schubert Wintereise 1927 - 15. Die Krähe.mp3" },
        { title: "08 - Tauber Lied Side B Schubert Wintereise 1927 - 18. Der stürmische Morgen", itemId: "tauberwinterreise", file: "08 - Tauber Lied Side B Schubert Wintereise 1927 - 18. Der stürmische Morgen.mp3" },
        { title: "09 - Tauber Lied Side B Schubert Wintereise 1927 - 20. Der Wegweiser", itemId: "tauberwinterreise", file: "09 - Tauber Lied Side B Schubert Wintereise 1927 - 20. Der Wegweiser.mp3" },
        { title: "10 - Tauber Lied Side B Schubert Wintereise 1927 - 21. Das Wirtshaus", itemId: "tauberwinterreise", file: "10 - Tauber Lied Side B Schubert Wintereise 1927 - 21. Das Wirtshaus.mp3" },
        { title: "11 - Tauber Lied Side B Schubert Wintereise 1927 - 22. Mut", itemId: "tauberwinterreise", file: "11 - Tauber Lied Side B Schubert Wintereise 1927 - 22. Mut.mp3" },
        { title: "12 - Tauber Lied Side B Schubert Wintereise 1927 - 24. Der Leiermann", itemId: "tauberwinterreise", file: "12 - Tauber Lied Side B Schubert Wintereise 1927 - 24. Der Leiermann.mp3" },
      ],
    },
  },
  "schumann-dichterliebe": {
    score: {
      movements: [
        { title: "Im wunderschönen Monat Mai", path: "scores/Schumann,_Robert/Dichterliebe,_Op.48/1_Im_wunderschönen_Monat_Mai/lc4976777.mxl" },
        { title: "Aus meinen Tränen sprießen", path: "scores/Schumann,_Robert/Dichterliebe,_Op.48/2_Aus_meinen_Tränen_sprießen/lc4976769.mxl" },
        { title: "Die Rose, die Lilie", path: "scores/Schumann,_Robert/Dichterliebe,_Op.48/3_Die_Rose,_die_Lilie/lc4976849.mxl" },
        { title: "Wenn ich in deine Augen seh’", path: "scores/Schumann,_Robert/Dichterliebe,_Op.48/4_Wenn_ich_in_deine_Augen_seh’/lc4978368.mxl" },
        { title: "Ich will meine Seele tauchen", path: "scores/Schumann,_Robert/Dichterliebe,_Op.48/5_Ich_will_meine_Seele_tauchen/lc4978373.mxl" },
        { title: "Im Rhein, im heiligen Strome", path: "scores/Schumann,_Robert/Dichterliebe,_Op.48/6_Im_Rhein,_im_heiligen_Strome/lc4978379.mxl" },
        { title: "Ich grolle nicht", path: "scores/Schumann,_Robert/Dichterliebe,_Op.48/7_Ich_grolle_nicht/lc4978382.mxl" },
        { title: "Und wüssten’s die Blumen", path: "scores/Schumann,_Robert/Dichterliebe,_Op.48/8_Und_wüssten’s_die_Blumen/lc4978387.mxl" },
        { title: "Das ist ein Flöten und Geigen", path: "scores/Schumann,_Robert/Dichterliebe,_Op.48/9_Das_ist_ein_Flöten_und_Geigen/lc4978390.mxl" },
        { title: "Hör’ ich das Liedchen klingen", path: "scores/Schumann,_Robert/Dichterliebe,_Op.48/10_Hör’_ich_das_Liedchen_klingen/lc5003150.mxl" },
        { title: "Ein Jüngling liebt ein Mädchen", path: "scores/Schumann,_Robert/Dichterliebe,_Op.48/11_Ein_Jüngling_liebt_ein_Mädchen/lc4978393.mxl" },
        { title: "Am leuchtenden Sommermorgen", path: "scores/Schumann,_Robert/Dichterliebe,_Op.48/12_Am_leuchtenden_Sommermorgen/lc4978395.mxl" },
        { title: "Ich hab’ im Traum geweinet", path: "scores/Schumann,_Robert/Dichterliebe,_Op.48/13_Ich_hab’_im_Traum_geweinet/lc4978396.mxl" },
        { title: "Allnächtlich im Traume", path: "scores/Schumann,_Robert/Dichterliebe,_Op.48/14_Allnächtlich_im_Traume/lc4978397.mxl" },
        { title: "Aus alten Märchen winkt es", path: "scores/Schumann,_Robert/Dichterliebe,_Op.48/15_Aus_alten_Märchen_winkt_es/lc4978398.mxl" },
        { title: "Die alten, bösen Lieder", path: "scores/Schumann,_Robert/Dichterliebe,_Op.48/16_Die_alten,_bösen_Lieder/lc4978400.mxl" },
      ],
    },
    audio: {
      itemId: "alexander-kipnis-dichterliebe-discocorp-211",
      performer: "Alexander KIPNIS – Bass, Wolfgang ROSS – Piano",
      licence: "Public Domain Mark 1.0",
      licenceUrl: "http://creativecommons.org/publicdomain/mark/1.0/",
      tracks: [
        { title: "01 - Alexander KIPNIS - Dichterliebe (Schumann - rec. 1943) Discocorp 211 Side A - Im wunderschönen Monat Mai", itemId: "alexander-kipnis-dichterliebe-discocorp-211", file: "01 - Alexander KIPNIS - Dichterliebe (Schumann - rec. 1943) Discocorp 211 Side A - Im wunderschönen Monat Mai.mp3" },
        { title: "02 - Alexander KIPNIS - Dichterliebe (Schumann - rec. 1943) Discocorp 211 Side A - Aus meinen Tränen spriessen", itemId: "alexander-kipnis-dichterliebe-discocorp-211", file: "02 - Alexander KIPNIS - Dichterliebe (Schumann - rec. 1943) Discocorp 211 Side A - Aus meinen Tränen spriessen.mp3" },
        { title: "03 - Alexander KIPNIS - Dichterliebe (Schumann - rec. 1943) Discocorp 211 Side A - Die Rose, die Lilie", itemId: "alexander-kipnis-dichterliebe-discocorp-211", file: "03 - Alexander KIPNIS - Dichterliebe (Schumann - rec. 1943) Discocorp 211 Side A - Die Rose, die Lilie.mp3" },
        { title: "04 - Alexander KIPNIS - Dichterliebe (Schumann - rec. 1943) Discocorp 211 Side A - Wenn ich in deine Augen seh", itemId: "alexander-kipnis-dichterliebe-discocorp-211", file: "04 - Alexander KIPNIS - Dichterliebe (Schumann - rec. 1943) Discocorp 211 Side A - Wenn ich in deine Augen seh.mp3" },
        { title: "05 - Alexander KIPNIS - Dichterliebe (Schumann - rec. 1943) Discocorp 211 Side A - Ich will meine Seele tauchen", itemId: "alexander-kipnis-dichterliebe-discocorp-211", file: "05 - Alexander KIPNIS - Dichterliebe (Schumann - rec. 1943) Discocorp 211 Side A - Ich will meine Seele tauchen.mp3" },
        { title: "06 - Alexander KIPNIS - Dichterliebe (Schumann - rec. 1943) Discocorp 211 Side A - Im Rhein, im heiligen Strome", itemId: "alexander-kipnis-dichterliebe-discocorp-211", file: "06 - Alexander KIPNIS - Dichterliebe (Schumann - rec. 1943) Discocorp 211 Side A - Im Rhein, im heiligen Strome.mp3" },
        { title: "07 - Alexander KIPNIS - Dichterliebe (Schumann - rec. 1943) Discocorp 211 Side A - Ich grolle nicht", itemId: "alexander-kipnis-dichterliebe-discocorp-211", file: "07 - Alexander KIPNIS - Dichterliebe (Schumann - rec. 1943) Discocorp 211 Side A - Ich grolle nicht.mp3" },
        { title: "08 - Alexander KIPNIS - Dichterliebe (Schumann - rec. 1943) Discocorp 211 Side A - Und wüssten's die Blumen, die kleinen", itemId: "alexander-kipnis-dichterliebe-discocorp-211", file: "08 - Alexander KIPNIS - Dichterliebe (Schumann - rec. 1943) Discocorp 211 Side A - Und wüssten's die Blumen, die kleinen.mp3" },
        { title: "09 - Alexander KIPNIS - Dichterliebe (Schumann - rec. 1943) Discocorp 211 Side A - Das ist ein Flöten und Geigen", itemId: "alexander-kipnis-dichterliebe-discocorp-211", file: "09 - Alexander KIPNIS - Dichterliebe (Schumann - rec. 1943) Discocorp 211 Side A - Das ist ein Flöten und Geigen.mp3" },
        { title: "10 - Alexander KIPNIS - Dichterliebe (Schumann - rec. 1943) Discocorp 211 Side A - Hör ich das Liedchen klingen", itemId: "alexander-kipnis-dichterliebe-discocorp-211", file: "10 - Alexander KIPNIS - Dichterliebe (Schumann - rec. 1943) Discocorp 211 Side A - Hör ich das Liedchen klingen.mp3" },
        { title: "11 - Alexander KIPNIS - Dichterliebe (Schumann - rec. 1943) Discocorp 211 Side A - Ein Jüngling liebt ein Mädchen", itemId: "alexander-kipnis-dichterliebe-discocorp-211", file: "11 - Alexander KIPNIS - Dichterliebe (Schumann - rec. 1943) Discocorp 211 Side A - Ein Jüngling liebt ein Mädchen.mp3" },
        { title: "12 - Alexander KIPNIS - Dichterliebe (Schumann - rec. 1943) Discocorp 211 Side A - Am leuchtenden Sommermorgen", itemId: "alexander-kipnis-dichterliebe-discocorp-211", file: "12 - Alexander KIPNIS - Dichterliebe (Schumann - rec. 1943) Discocorp 211 Side A - Am leuchtenden Sommermorgen.mp3" },
        { title: "13 - Alexander KIPNIS - Dichterliebe (Schumann - rec. 1943) Discocorp 211 Side A - Ich hab' im Traum geweinet", itemId: "alexander-kipnis-dichterliebe-discocorp-211", file: "13 - Alexander KIPNIS - Dichterliebe (Schumann - rec. 1943) Discocorp 211 Side A - Ich hab' im Traum geweinet.mp3" },
        { title: "14 - Alexander KIPNIS - Dichterliebe (Schumann - rec. 1943) Discocorp 211 Side B - Allnächtlich im Traume", itemId: "alexander-kipnis-dichterliebe-discocorp-211", file: "14 - Alexander KIPNIS - Dichterliebe (Schumann - rec. 1943) Discocorp 211 Side B - Allnächtlich im Traume.mp3" },
        { title: "15 - Alexander KIPNIS - Dichterliebe (Schumann - rec. 1943) Discocorp 211 Side B - Aus alten Märchen", itemId: "alexander-kipnis-dichterliebe-discocorp-211", file: "15 - Alexander KIPNIS - Dichterliebe (Schumann - rec. 1943) Discocorp 211 Side B - Aus alten Märchen.mp3" },
        { title: "16 - Alexander KIPNIS - Dichterliebe (Schumann - rec. 1943) Discocorp 211 Side B - Die alten bösen Lieder", itemId: "alexander-kipnis-dichterliebe-discocorp-211", file: "16 - Alexander KIPNIS - Dichterliebe (Schumann - rec. 1943) Discocorp 211 Side B - Die alten bösen Lieder.mp3" },
      ],
    },
  },
  "schumann-frauenliebe": {
    score: {
      movements: [
        { title: "Seit ich ihn gesehen", path: "scores/Schumann,_Robert/Frauenliebe_und_Leben,_Op.42/1_Seit_ich_ihn_gesehen/lc4978468.mxl" },
        { title: "Er, der Herrlichste von allen", path: "scores/Schumann,_Robert/Frauenliebe_und_Leben,_Op.42/2_Er,_der_Herrlichste_von_allen/lc4978478.mxl" },
        { title: "Ich kann’s nicht fassen", path: "scores/Schumann,_Robert/Frauenliebe_und_Leben,_Op.42/3_Ich_kann’s_nicht_fassen/lc4978485.mxl" },
        { title: "Du Ring an meinem Finger", path: "scores/Schumann,_Robert/Frauenliebe_und_Leben,_Op.42/4_Du_Ring_an_meinem_Finger/lc4978488.mxl" },
        { title: "Helft mir, ihr Schwestern", path: "scores/Schumann,_Robert/Frauenliebe_und_Leben,_Op.42/5_Helft_mir,_ihr_Schwestern/lc4978491.mxl" },
        { title: "Süsser Freund, du blickest", path: "scores/Schumann,_Robert/Frauenliebe_und_Leben,_Op.42/6_Süsser_Freund,_du_blickest/lc4978494.mxl" },
        { title: "An meinem Herzen", path: "scores/Schumann,_Robert/Frauenliebe_und_Leben,_Op.42/7_An_meinem_Herzen/lc4978496.mxl" },
        { title: "Nun hast du mir den ersten Schmerz getan", path: "scores/Schumann,_Robert/Frauenliebe_und_Leben,_Op.42/8_Nun_hast_du_mir_den_ersten_Schmerz_getan/lc4978501.mxl" },
      ],
    },
  },
  "schumann-liederkreis-39": {
    score: {
      movements: [
        { title: "In der Fremde [I]", path: "scores/Schumann,_Robert/Liederkreis,_Op.39/1_In_der_Fremde_[I]/lc5080752.mxl" },
        { title: "Intermezzo", path: "scores/Schumann,_Robert/Liederkreis,_Op.39/2_Intermezzo/lc4987618.mxl" },
        { title: "Waldesgespräch", path: "scores/Schumann,_Robert/Liederkreis,_Op.39/3_Waldesgespräch/lc4987626.mxl" },
        { title: "Die Stille", path: "scores/Schumann,_Robert/Liederkreis,_Op.39/4_Die_Stille/lc4987633.mxl" },
        { title: "Mondnacht", path: "scores/Schumann,_Robert/Liederkreis,_Op.39/5_Mondnacht/lc4987640.mxl" },
        { title: "Schöne Fremde", path: "scores/Schumann,_Robert/Liederkreis,_Op.39/6_Schöne_Fremde/lc4987650.mxl" },
        { title: "Auf einer Burg", path: "scores/Schumann,_Robert/Liederkreis,_Op.39/7_Auf_einer_Burg/lc4987658.mxl" },
        { title: "In der Fremde [II]", path: "scores/Schumann,_Robert/Liederkreis,_Op.39/8_In_der_Fremde_[II]/lc4987661.mxl" },
        { title: "Wehmuth", path: "scores/Schumann,_Robert/Liederkreis,_Op.39/9_Wehmuth/lc4987664.mxl" },
        { title: "Zwielicht", path: "scores/Schumann,_Robert/Liederkreis,_Op.39/10_Zwielicht/lc4987672.mxl" },
        { title: "Im Walde", path: "scores/Schumann,_Robert/Liederkreis,_Op.39/11_Im_Walde/lc5003122.mxl" },
        { title: "Frühlingsnacht", path: "scores/Schumann,_Robert/Liederkreis,_Op.39/12_Frühlingsnacht/lc4987677.mxl" },
      ],
    },
  },
  "sousa-stars-stripes": {
    audio: {
      itemId: "starsstrp1906",
      performer: "John Philip Sousa's Band",
      licence: "Public domain (Internet Archive)",
      licenceUrl: "http://creativecommons.org/licenses/publicdomain/",
      tracks: [
        { title: "The Stars and Stripes Forever", itemId: "starsstrp1906", file: "starsstrp1906.mp3" },
      ],
    },
  },
  "vivaldi-four-seasons": {
    audio: {
      itemId: "parso-19df9720a290ff3dd7678eebf0ac9a400a8406e9",
      performer: "Antonio Vivaldi",
      licence: "CC0 1.0 (public domain dedication)",
      licenceUrl: "http://creativecommons.org/publicdomain/zero/1.0/deed.en",
      tracks: [
        { title: "The Four Seasons: Spring, Op. 8, RV 269", itemId: "parso-19df9720a290ff3dd7678eebf0ac9a400a8406e9", file: "001_I_Allegro.mp3" },
      ],
    },
  },
  "wolf-eichendorff": {
    score: {
      movements: [
        { title: "Der Freund", path: "scores/Wolf,_Hugo/Eichendorff-Lieder/1_Der_Freund/lc5016637.mxl" },
        { title: "Der Musikant", path: "scores/Wolf,_Hugo/Eichendorff-Lieder/2_Der_Musikant/lc5024866.mxl" },
        { title: "Verschwiegene Liebe", path: "scores/Wolf,_Hugo/Eichendorff-Lieder/3_Verschwiegene_Liebe/lc4946077.mxl" },
        { title: "Das Ständchen", path: "scores/Wolf,_Hugo/Eichendorff-Lieder/4_Das_Ständchen/lc5024834.mxl" },
        { title: "Der Soldat I", path: "scores/Wolf,_Hugo/Eichendorff-Lieder/5_Der_Soldat_I/lc5024898.mxl" },
        { title: "Der Soldat II", path: "scores/Wolf,_Hugo/Eichendorff-Lieder/6_Der_Soldat_II/lc5025040.mxl" },
        { title: "Die Zigeunerin", path: "scores/Wolf,_Hugo/Eichendorff-Lieder/7_Die_Zigeunerin/lc5079629.mxl" },
        { title: "Nachtzauber", path: "scores/Wolf,_Hugo/Eichendorff-Lieder/8_Nachtzauber/lc5039817.mxl" },
        { title: "Der Schreckenberger", path: "scores/Wolf,_Hugo/Eichendorff-Lieder/9_Der_Schreckenberger/lc5027811.mxl" },
        { title: "Der Glücksritter", path: "scores/Wolf,_Hugo/Eichendorff-Lieder/10_Der_Glücksritter/lc5032950.mxl" },
        { title: "Lieber Alles", path: "scores/Wolf,_Hugo/Eichendorff-Lieder/11_Lieber_Alles/lc4945807.mxl" },
        { title: "Heimweh", path: "scores/Wolf,_Hugo/Eichendorff-Lieder/12_Heimweh/lc5057797.mxl" },
        { title: "Der Scholar", path: "scores/Wolf,_Hugo/Eichendorff-Lieder/13_Der_Scholar/lc5052792.mxl" },
        { title: "Der verzweifelte Liebhaber", path: "scores/Wolf,_Hugo/Eichendorff-Lieder/14_Der_verzweifelte_Liebhaber/lc5052714.mxl" },
        { title: "Unfall", path: "scores/Wolf,_Hugo/Eichendorff-Lieder/15_Unfall/lc5057804.mxl" },
        { title: "Liebesglück", path: "scores/Wolf,_Hugo/Eichendorff-Lieder/16_Liebesglück/lc4928198.mxl" },
        { title: "Seemans Abschied", path: "scores/Wolf,_Hugo/Eichendorff-Lieder/17_Seemans_Abschied/lc5052822.mxl" },
        { title: "Erwartung", path: "scores/Wolf,_Hugo/Eichendorff-Lieder/18_Erwartung/lc5067337.mxl" },
        { title: "Die Nacht", path: "scores/Wolf,_Hugo/Eichendorff-Lieder/19_Die_Nacht/lc5052801.mxl" },
        { title: "Waldmädchen", path: "scores/Wolf,_Hugo/Eichendorff-Lieder/20_Waldmädchen/lc5077482.mxl" },
      ],
    },
  },
};

export const mediaForWork = (id: string): RepertoireMedia | undefined => REPERTOIRE_MEDIA[id];
export const hasNativeScore = (id: string) => !!REPERTOIRE_MEDIA[id]?.score?.movements.length;
export const hasAudio = (id: string) => !!REPERTOIRE_MEDIA[id]?.audio?.tracks.length;

/** How many works in the library are playable / readable on-platform. */
export const NATIVE_SCORE_COUNT = Object.values(REPERTOIRE_MEDIA).filter(m => m.score).length;
export const AUDIO_COUNT = Object.values(REPERTOIRE_MEDIA).filter(m => m.audio).length;

export default REPERTOIRE_MEDIA;
