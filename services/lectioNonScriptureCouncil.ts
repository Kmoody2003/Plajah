// services/lectioNonScriptureCouncil.ts
// 12 Art-Council Directed Visual & Architectural Treatments for Non-Scripture Religious Texts
// (Creeds, Patristic Homilies, Scholastic Summae, Desert Apophthegmata, Reformation Disputations,
// Ethiopian Ge'ez Anaphoras, Hesychast Philokalia, Ignatian Contemplations, Celtic Loricae,
// Marian Antiphons, Carmelite Mysticism, Syriac Madrasha, and Liturgical Rubrics)
// Part of the Lectio experience and directly viewable in Lorea.

import type { Album, BookChapter } from '../types';
import { openAlbumInLorea } from './loreaOpen';

export type ArtCouncilLens =
  | 'CLASSICAL'
  | 'REBEL'
  | 'FUTURIST'
  | 'WORLD_ECLECTIC'
  | 'BAROQUE'
  | 'RADICAL_MINIMAL';

export type CouncilPlateArchetype =
  | 'apse-arch'
  | 'glossa-nested'
  | 'desert-monolith'
  | 'woodcut-broadside'
  | 'axumite-brana-3col'
  | 'futurist-breath-hud'
  | 'tenebrist-diagonal'
  | 'kells-carpet-split'
  | 'gregorian-neume-ruled'
  | 'crystal-mandala-7'
  | 'syriac-antiphon'
  | 'westminster-altar-triptych';

export interface LectioCouncilPlate {
  id: string;
  plateNumber: string;
  title: string;
  subtitle: string;
  lens: ArtCouncilLens;
  lensLabel: string;
  layoutArchetype: CouncilPlateArchetype;
  layoutArchitectureName: string;
  genreLabel: string;
  documentTitle: string;
  documentAuthor: string;
  documentEra: string;
  primaryExcerpt: string;
  secondaryOrOriginalExcerpt?: string;
  marginalGlossLeft?: string;
  marginalGlossRight?: string;
  provenanceNote: string;
  scriptureEchoes: string[];
  accentColor: string;
  surfaceBg: string;
}

export const LECTIO_COUNCIL_PLATES: LectioCouncilPlate[] = [
  {
    id: 'plate-01-byzantine-chrysography',
    plateNumber: '01',
    title: 'Byzantine Chrysography & Imperial Porphyry',
    subtitle: 'Arch-Topped Basilica Apse Tympanum · IC XC NIKA Seal · Parallel Greek Uncials',
    lens: 'CLASSICAL',
    lensLabel: 'Classical Lens · Hagia Sophia & Ravenna Mosaics',
    layoutArchetype: 'apse-arch',
    layoutArchitectureName: 'Basilica Apse Arch & Parallel Greek Uncial Columns',
    genreLabel: 'Ecumenical Creeds & Conciliar Definitions',
    documentTitle: 'The Symbol of Chalcedon & Niceno-Constantinopolitan Creed',
    documentAuthor: 'Fathers of Nicaea (325) & Constantinople (381)',
    documentEra: '4th–5th Century · Imperial Constantinople',
    primaryExcerpt:
      'Light of Light, true God of true God, begotten, not made, consubstantial with the Father; through whom all things were made. Who for us men and for our salvation came down from heaven, and was incarnate by the Holy Spirit and the Virgin Mary, and became man.',
    secondaryOrOriginalExcerpt:
      'Φῶς ἐκ Φωτός, Θεὸν ἀληθινὸν ἐκ Θεοῦ ἀληθινοῦ, γεννηθέντα οὐ ποιηθέντα, ὁμοούσιον τῷ Πατρί· δι’ οὗ τὰ πάντα ἐγένετο.',
    provenanceNote:
      'Set on a Tyrian Porphyry apse dome with 24k burnished gold chrysography and a Byzantine Christogram medallion separating Greek uncials from English liturgical prose.',
    scriptureEchoes: ['John 1:1-14', 'Colossians 1:15-17', 'Hebrews 1:3'],
    accentColor: '#FFD97D',
    surfaceBg: '#2A0716',
  },
  {
    id: 'plate-02-scholastic-glossa-ordinaria',
    plateNumber: '02',
    title: 'Scholastic Glossa Ordinaria',
    subtitle: '4-Margin Nested Commentary Grid · Central Canonical Island Surrounded by Patristic Glosses',
    lens: 'CLASSICAL',
    lensLabel: 'Classical Lens · 13th-Century Paris & Oxford Folio',
    layoutArchetype: 'glossa-nested',
    layoutArchitectureName: 'Nested 3-Column Glossa Ordinaria Manuscript Grid',
    genreLabel: 'Scholastic Summae & Patristic Commentaries',
    documentTitle: 'Summa Theologiae · Prima Pars, Q. 2, Art. 3',
    documentAuthor: 'St. Thomas Aquinas, O.P. (1225–1274)',
    documentEra: '1265–1274 · University of Paris',
    primaryExcerpt:
      'Respondeo dicendum quod Deum esse quinque viis probari potest. Prima autem et manifestior via est, quae sumitur ex parte motus: omne autem quod movetur, ab alio movetur. Ergo necesse est devenire ad aliquod primum movens, quod a nullo movetur: et hoc omnes intelligunt Deum.',
    marginalGlossLeft:
      'Glossa I (Augustine, De Trin.): Motion here signifies every reduction from potency to act within finite being.',
    marginalGlossRight:
      'Glossa II (Boethius, Consol.): That which moves without being moved is the eternal fountain of form and order.',
    provenanceNote:
      'Modeled directly on 13th-century Parisian university manuscripts where the authoritative Quaestio sits as an island in the center while smaller patristic glosses wrap both outer margins.',
    scriptureEchoes: ['Exodus 3:14', 'Romans 1:20', 'Acts 17:28'],
    accentColor: '#9E1B1B',
    surfaceBg: '#F4ECD8',
  },
  {
    id: 'plate-03-apophatic-desert-monolith',
    plateNumber: '03',
    title: 'Apophatic Desert Monolith',
    subtitle: 'Zero-Radius Basalt Slab · 68% Negative Space · Bottom-Right Anchor',
    lens: 'RADICAL_MINIMAL',
    lensLabel: 'Radical Minimal Lens · Wadi El Natrun & Sinai Asceticism',
    layoutArchetype: 'desert-monolith',
    layoutArchitectureName: 'Extreme Negative-Space Basalt Monolith Slab',
    genreLabel: 'Apophthegmata Patrum (Sayings of the Desert Fathers)',
    documentTitle: 'Alphabetical Collection · Abba Moses & Abba Arsenius',
    documentAuthor: 'Desert Fathers & Mothers of Scetis (Nitria & Kellia)',
    documentEra: '4th Century · Egyptian Desert',
    primaryExcerpt:
      'A brother came to Scetis to visit Abba Moses and asked him for a word. The old man said to him: “Go, sit in your cell, and your cell will teach you everything.”',
    secondaryOrOriginalExcerpt: 'APOPHTHEGMA XVIII · WADI EL NATRUN',
    provenanceNote:
      'Zero border-radius, stark charcoal limestone void, and deliberate visual silence occupying two-thirds of the canvas before a single chiseled saying emerges at the bottom right.',
    scriptureEchoes: ['Psalm 46:10', '1 Kings 19:12', 'Lamentations 3:26'],
    accentColor: '#C8B898',
    surfaceBg: '#09090B',
  },
  {
    id: 'plate-04-wittenberg-woodcut-broadside',
    plateNumber: '04',
    title: 'Wittenberg Woodcut Broadside',
    subtitle: 'Rotated Pamphlet Sheet · Heavy Black Woodblock Rules · Stamped Thesis Numerals',
    lens: 'REBEL',
    lensLabel: 'Rebel Lens · 16th-Century Printing Press Manifesto',
    layoutArchetype: 'woodcut-broadside',
    layoutArchitectureName: 'Pamphlet Broadside with Stamped Woodblock Numerals',
    genreLabel: 'Reformation Confessions, Theses & Catechisms',
    documentTitle: 'The Heidelberg Disputation & Freedom of a Christian',
    documentAuthor: 'Martin Luther (1483–1546) · Printed by Melchior Lotter',
    documentEra: '1518 / 1520 · Wittenberg Press',
    primaryExcerpt:
      'A Christian is a perfectly free lord of all, subject to none. A Christian is a perfectly dutiful servant of all, subject to all. The love of God does not find, but creates, that which is pleasing to it.',
    secondaryOrOriginalExcerpt: 'THESIS XXVIII · AMOR DEI NON INVENIT SED CREAT SUUM DILIGIBILE',
    provenanceNote:
      'Set like an urgency-driven 1520 street pamphlet with thick 3px woodcut rules, vermilion printer stamps, and bold numbered theses.',
    scriptureEchoes: ['1 Corinthians 9:19', 'Galatians 5:1', 'Romans 1:17'],
    accentColor: '#B81D13',
    surfaceBg: '#EFE7D6',
  },
  {
    id: 'plate-05-axumite-geez-codex',
    plateNumber: '05',
    title: 'Axumite Ge’ez Illuminated Brana Codex',
    subtitle: 'Woven Harag Geometric Header · Traditional 3-Column Goat-Parchment Layout · Red Divine Names',
    lens: 'WORLD_ECLECTIC',
    lensLabel: 'World Eclectic Lens · Lalibela & Garima Gospels Tradition',
    layoutArchetype: 'axumite-brana-3col',
    layoutArchitectureName: '3-Column Ethiopian Brana Parchment with Harag Tapestry',
    genreLabel: 'Ethiopian Anaphoras & Early African Patristics',
    documentTitle: 'Anaphora of St. Dioscorus & Confessions of St. Augustine (Bk X)',
    documentAuthor: 'Ethiopian Orthodox Tewahedo Liturgy & St. Augustine of Hippo',
    documentEra: '4th–6th Century · Axum & Hippo Regius',
    primaryExcerpt:
      'From before the world and forever afterward, God is in His Trinity; God is in His Divinity; and God is in His Kingdom. Late have I loved Thee, O Beauty ever ancient, ever new!',
    secondaryOrOriginalExcerpt: 'ቅዱስ ፡ ቅዱስ ፡ ቅዱስ ፡ እግዚአብሔር ፡ ጸባዖት',
    provenanceNote:
      'Honors the Abba Garima Gospels—the world’s oldest surviving illustrated Christian manuscript—using a woven Harag header and three narrow columns stitched with leather thongs and rubricated Divine Names.',
    scriptureEchoes: ['Isaiah 6:3', 'Psalm 68:31', 'Revelation 4:8'],
    accentColor: '#C8281E',
    surfaceBg: '#F6EBC8',
  },
  {
    id: 'plate-06-hesychast-taboric-light',
    plateNumber: '06',
    title: 'Hesychast Uncreated Light (Taboric Ray)',
    subtitle: 'Bioluminescent Breath-Synchronized Cadence HUD · Inhale / Exhale Monastic Prayer Meter',
    lens: 'FUTURIST',
    lensLabel: 'Futurist Lens · Mount Athos Philokalia × Bioluminescent Optics',
    layoutArchetype: 'futurist-breath-hud',
    layoutArchitectureName: 'Breath-Cadence Telemetry HUD & Uncreated Light Halo',
    genreLabel: 'The Philokalia · Hesychast & Contemplative Texts',
    documentTitle: 'Triads in Defense of the Holy Hesychasts (I.3)',
    documentAuthor: 'St. Gregory Palamas (1296–1359) & St. Symeon the New Theologian',
    documentEra: '14th Century · Mount Athos',
    primaryExcerpt:
      'Lord Jesus Christ, Son of God, have mercy on me, a sinner. He who participates in the divine energy becomes himself, in a manner, light; he is united to the Light, and with the Light he beholds in full awareness all that remains hidden to those who have not this grace.',
    secondaryOrOriginalExcerpt: 'INHALE 4.0s (Κύριε Ἰησοῦ Χριστέ) · EXHALE 4.0s (ἐλέησόν με)',
    provenanceNote:
      'Splits the Jesus Prayer into its monastic breath-rhythm telemetry—inhale on the invocation, exhale on the petition—surrounded by an optical Taboric cyan-violet aura.',
    scriptureEchoes: ['Matthew 17:2', '1 Thessalonians 5:17', 'Luke 18:13'],
    accentColor: '#38BDF8',
    surfaceBg: '#050816',
  },
  {
    id: 'plate-07-baroque-chiaroscuro-reliquary',
    plateNumber: '07',
    title: 'Counter-Reformation Chiaroscuro Reliquary',
    subtitle: 'Diagonal Caravaggio Spotlight Beam · Dramatic Asymmetric Stage · Floating Gold Pull-Quote',
    lens: 'BAROQUE',
    lensLabel: 'Baroque Lens · Bernini Ecstasy & Caravaggio Tenebrism',
    layoutArchetype: 'tenebrist-diagonal',
    layoutArchitectureName: 'Asymmetric Tenebrist Spotlight Stage & Reliquary Pull-Quote',
    genreLabel: 'Ignatian Spiritual Exercises & Baroque Devotionals',
    documentTitle: 'The Spiritual Exercises · Principle & Foundation & Suscipe',
    documentAuthor: 'St. Ignatius of Loyola (1491–1556) & John Donne (1572–1631)',
    documentEra: '1548 / 1624 · Rome & St. Paul’s London',
    primaryExcerpt:
      'Take, Lord, and receive all my liberty, my memory, my understanding, and my entire will, all that I have and call my own. Whatever I have or hold, Thou hast given it to me; I restore it all to Thee and surrender it wholly to be governed by Thy will.',
    secondaryOrOriginalExcerpt: 'Give me only Thy love and Thy grace, and I am rich enough and ask for nothing more.',
    provenanceNote:
      'Cuts a diagonal shaft of candlelight across deep obsidian shadow, placing the Ignatian Suscipe in dramatic relief beside a gilded reliquary pull-quote.',
    scriptureEchoes: ['Romans 12:1', 'Philippians 3:8', '2 Corinthians 12:9'],
    accentColor: '#E5B84B',
    surfaceBg: '#0A0605',
  },
  {
    id: 'plate-08-insular-celtic-carpet-page',
    plateNumber: '08',
    title: 'Insular Celtic Knotwork Carpet Page',
    subtitle: 'Split Asymmetric Illuminated Initial Panel · Verdigris Interlace Sidebar + Vellum Canticle',
    lens: 'WORLD_ECLECTIC',
    lensLabel: 'World Eclectic Lens · Book of Kells & Lindisfarne Scriptorium',
    layoutArchetype: 'kells-carpet-split',
    layoutArchitectureName: 'Split Carpet-Page Ornament Sidebar + Vellum Lorica Column',
    genreLabel: 'Celtic Loricae (Breastplate Prayers) & Creation Canticles',
    documentTitle: 'St. Patrick’s Breastplate (Faeth Fiada) & Canticle of the Sun',
    documentAuthor: 'Attributed to St. Patrick (5th c.) & St. Francis of Assisi (1224)',
    documentEra: '5th–13th Century · Iona, Kells & Assisi',
    primaryExcerpt:
      'Christ with me, Christ before me, Christ behind me, Christ in me, Christ beneath me, Christ above me, Christ on my right, Christ on my left, Christ when I lie down, Christ when I sit down, Christ when I arise.',
    secondaryOrOriginalExcerpt: 'Atomriug indiu niurt רון · CANTICUM FRATRIS SOLIS',
    provenanceNote:
      'Divides the page into a malachite-and-amber Celtic knotwork carpet panel on the left and a warm monastic vellum breastplate column on the right.',
    scriptureEchoes: ['Ephesians 6:11-17', 'Psalm 148:1-5', 'Galatians 2:20'],
    accentColor: '#5EEAD4',
    surfaceBg: '#09221C',
  },
  {
    id: 'plate-09-marian-lapis-lazuli-antiphonary',
    plateNumber: '09',
    title: 'Marian Lapis Lazuli Antiphonary',
    subtitle: '4-Line Red Gregorian Chant Staff · Square Neume Notation · Star-Spangled Ultramarine Vault',
    lens: 'BAROQUE',
    lensLabel: 'Baroque & Gothic Lens · Sainte-Chapelle & Giotto Scrovegni Vault',
    layoutArchetype: 'gregorian-neume-ruled',
    layoutArchitectureName: 'Ruled 4-Line Gregorian Chant Staff & Ultramarine Antiphonary',
    genreLabel: 'Marian Antiphons, Litanies & Akathist Hymns',
    documentTitle: 'Salve Regina (Solemn Tone) & The Akathist Hymn',
    documentAuthor: 'Hermann of Reichenau (1013–1054) & St. Romanos the Melodist',
    documentEra: '6th–11th Century · Reichenau Abbey & Constantinople',
    primaryExcerpt:
      'Salve, Regina, Mater misericordiae, vita, dulcedo, et spes nostra, salve. Ad te clamamus exsules filii Hevae; ad te suspiramus, gementes et flentes in hac lacrimarum valle.',
    secondaryOrOriginalExcerpt: '℣. Ora pro nobis, sancta Dei Genetrix. · ℟. Ut digni efficiamur promissionibus Christi.',
    provenanceNote:
      'Renders an authentic 4-line red liturgical staff with square chant neumes above the Latin antiphon over crushed Afghan lapis lazuli pigment and silver constellations.',
    scriptureEchoes: ['Luke 1:28-55', 'Revelation 12:1', 'John 19:26-27'],
    accentColor: '#F3D078',
    surfaceBg: '#0A193B',
  },
  {
    id: 'plate-10-carmelite-interior-castle',
    plateNumber: '10',
    title: 'Carmelite Interior Castle (Las Moradas)',
    subtitle: 'Concentric 7-Mansion Crystal Mandala · Radial Center-Outward Contemplative Geometry',
    lens: 'FUTURIST',
    lensLabel: 'Futurist Lens · Ávila Mysticism × Crystalline Refraction',
    layoutArchetype: 'crystal-mandala-7',
    layoutArchitectureName: 'Concentric 7-Ring Crystalline Mandala Medallion',
    genreLabel: 'Carmelite Mystical Theology & Contemplative Ascent',
    documentTitle: 'The Interior Castle (Las Moradas) · First & Seventh Mansions',
    documentAuthor: 'St. Teresa of Ávila (1515–1582) & St. John of the Cross (1542–1591)',
    documentEra: '1577 · Discalced Carmelite Convent of Ávila',
    primaryExcerpt:
      'We may consider our soul to be like a castle made entirely out of a diamond or of very clear crystal, in which there are many rooms, just as in heaven there are many mansions. And in the center and middle of all these is the chief room where the much more secret things pass between God and the soul.',
    secondaryOrOriginalExcerpt: 'MORADA I → II → III → IV → V → VI → VII (UNIÓN MÍSTICA)',
    provenanceNote:
      'Constructs concentric translucent rings representing the Seven Mansions of the soul converging upon the radiant Bridal Chamber at the center.',
    scriptureEchoes: ['John 14:2', 'Song of Solomon 2:4', '2 Corinthians 3:18'],
    accentColor: '#F0ABFC',
    surfaceBg: '#160B28',
  },
  {
    id: 'plate-11-catacomb-terra-sigillata-scroll',
    plateNumber: '11',
    title: 'Catacomb Terra Sigillata & Syriac Scroll',
    subtitle: 'Alternating Left/Right Antiphonal Call-and-Response Versicles · Terracotta Clay Tablet',
    lens: 'REBEL',
    lensLabel: 'Rebel Lens · Underground Catacomb & Edessa Syriac Madrashe',
    layoutArchetype: 'syriac-antiphon',
    layoutArchitectureName: 'Staggered Antiphonal Choir Call-and-Response Versicle Tablet',
    genreLabel: 'Apostolic Fathers, Didache & Syriac Hymns of Paradise',
    documentTitle: 'The Didache (Ch. 9) & Hymns on Paradise',
    documentAuthor: 'Apostolic Fathers (1st c.), St. Ignatius of Antioch & St. Ephrem the Syrian',
    documentEra: '70–373 AD · Antioch, Rome Catacombs & Nisibis',
    primaryExcerpt:
      'Even as this broken bread was scattered over the hills, and was gathered together and became one, so let Thy Church be gathered together from the ends of the earth into Thy kingdom.',
    secondaryOrOriginalExcerpt:
      'CHOIR I (SYRIAC MADRASHA): Blessed is He who by His cross unlocked the gate of Paradise!\nCHOIR II (CONGREGATIONAL REFRAIN): For Thine is the glory and the power through Jesus Christ forever!',
    provenanceNote:
      'Models the underground house-church and Syriac women’s choirs established by St. Ephrem, alternating indented left/right call-and-response strophes on incised terracotta.',
    scriptureEchoes: ['1 Corinthians 10:17', 'Acts 2:42', 'Luke 23:43'],
    accentColor: '#FDBA74',
    surfaceBg: '#2B130E',
  },
  {
    id: 'plate-12-westminster-inscriptional-altar-card',
    plateNumber: '12',
    title: 'Westminster Inscriptional Altar Card',
    subtitle: 'Double-Fillet Brass Border · Red Liturgical Rubrics (℣ / ℟ / ✠) · Ceremonial Triptych',
    lens: 'RADICAL_MINIMAL',
    lensLabel: 'Radical Minimal Lens · Trajan Inscription & Cranmer Book of Common Prayer',
    layoutArchetype: 'westminster-altar-triptych',
    layoutArchitectureName: 'Double-Fillet Ceremonial Altar Card with Rubric Symbols',
    genreLabel: 'Collects, Sacramental Liturgies & Altar Cards',
    documentTitle: 'The Collect for Purity & Sursum Corda',
    documentAuthor: '10th-Century Sacramentary / Thomas Cranmer (1549 Book of Common Prayer)',
    documentEra: '10th Century / 1549 · Canterbury & Westminster',
    primaryExcerpt:
      'Almighty God, unto whom all hearts be open, all desires known, and from whom no secrets are hid: Cleanse the thoughts of our hearts by the inspiration of thy Holy Spirit, that we may perfectly love thee, and worthily magnify thy holy Name; through Christ our Lord. Amen.',
    secondaryOrOriginalExcerpt:
      '℣. Dominus vobiscum. · ℟. Et cum spiritu tuo. · ✠ Sursum corda. Habemus ad Dominum.',
    provenanceNote:
      'Framed in a double-fillet brass border on heavy ivory cotton rag paper with vermilion liturgical rubrics (℣, ℟, ✠) separating the celebrant’s posture from the spoken prayer.',
    scriptureEchoes: ['Psalm 51:10', 'Hebrews 4:12-13', 'Lamentations 3:41'],
    accentColor: '#B91C1C',
    surfaceBg: '#FAF7F0',
  },
];

const ACTIVE_PLATE_KEY = 'plajah_lectio_council_plate_v1';

export function getActiveLectioCouncilPlateId(): string {
  try {
    return localStorage.getItem(ACTIVE_PLATE_KEY) || LECTIO_COUNCIL_PLATES[0].id;
  } catch {
    return LECTIO_COUNCIL_PLATES[0].id;
  }
}

export function setActiveLectioCouncilPlateId(plateId: string): void {
  try {
    localStorage.setItem(ACTIVE_PLATE_KEY, plateId);
    window.dispatchEvent(new CustomEvent('plajah:lectio-council-plate-changed', { detail: { plateId } }));
  } catch {
    // ignore storage errors
  }
}

/**
 * Opens any of the 12 Art Council Sacred Text Plates directly in Lorea's BookReader
 * with the full document text, ancient/parallel text, marginal glosses, and Art Council notes.
 */
export function openCouncilPlateInLorea(plate: LectioCouncilPlate): void {
  const chapters: BookChapter[] = [
    {
      id: `${plate.id}-primary`,
      title: `Plate ${plate.plateNumber} · ${plate.documentTitle}`,
      content: [
        `${plate.documentAuthor} (${plate.documentEra})`,
        `Art Council Lens: ${plate.lensLabel} · Architecture: ${plate.layoutArchitectureName}`,
        plate.primaryExcerpt,
        ...(plate.secondaryOrOriginalExcerpt ? ['***', plate.secondaryOrOriginalExcerpt] : []),
        ...(plate.marginalGlossLeft ? [`[Left Margin Gloss] ${plate.marginalGlossLeft}`] : []),
        ...(plate.marginalGlossRight ? [`[Right Margin Gloss] ${plate.marginalGlossRight}`] : []),
      ].join('\n\n'),
    },
    {
      id: `${plate.id}-council-notes`,
      title: `Art Council Direction — ${plate.title}`,
      content: [
        plate.provenanceNote,
        `Genre & Corpus: ${plate.genreLabel}`,
        `Scripture Echoes: ${plate.scriptureEchoes.join(' · ')}`,
      ].join('\n\n'),
    },
  ];

  const album = {
    id: `lorea-council-${plate.id}`,
    ownerId: 'plajah-lectio-council',
    title: `${plate.documentTitle} (${plate.title})`,
    artist: plate.documentAuthor,
    coverImage: '',
    releaseYear: plate.documentEra,
    type: 'BOOK',
    genre: plate.genreLabel,
    description: plate.provenanceNote,
    tracks: [],
    bookChapters: chapters,
  } as unknown as Album;

  openAlbumInLorea(album);
}
