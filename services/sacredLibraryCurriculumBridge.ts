// services/sacredLibraryCurriculumBridge.ts
// Bridges the Lorea Sacred Library (data/sacredLibrary.ts & data/sacredLibrary/historicalEvidence.ts)
// directly into Christian Education & Academia Interactive Tela Worksheets, Quizzes, and Tests.

import { SACRED_SECTIONS, PRIMARY_TEXTS, HYMNS } from '../data/sacredLibrary';
import { HISTORICAL_EVIDENCE } from '../data/sacredLibrary/historicalEvidence';

export interface SacredLibrarySupplement {
  id: string;
  title: string;
  category:
    | 'MANUSCRIPT'
    | 'EARLY_CHURCH'
    | 'COUNCIL_CREED'
    | 'ARCHAEOLOGY'
    | 'ARTIFACT'
    | 'HYMN'
    | 'HISTORICAL_EVIDENCE'
    | 'APOSTOLIC_MAP';
  categoryBadge: string;
  era: string;
  sourceAttribution: string;
  summary: string;
  primaryExcerpt?: string;
  connectionToLesson: string;
  reflectionQuestion?: string;
  url: string;
  scriptureRefs: string[];
}

/**
 * Matches supplemental primary texts, ancient manuscripts, patristic writings,
 * archaeological inscriptions, sacred artifacts, and ancient hymns from the Sacred Library
 * to a given curriculum lesson or worksheet.
 */
export function matchSacredLibrarySupplementsForLesson(params: {
  title: string;
  rawText?: string;
  scripturePassages?: string[];
}): SacredLibrarySupplement[] {
  const combined = `${params.title || ''}\n${params.rawText || ''}\n${(params.scripturePassages || []).join(' ')}`.toLowerCase();
  const supplements: SacredLibrarySupplement[] = [];
  const seenIds = new Set<string>();

  const pushUnique = (item: SacredLibrarySupplement) => {
    if (seenIds.has(item.id)) return;
    seenIds.add(item.id);
    supplements.push(item);
  };

  const sinaiticusEntry = SACRED_SECTIONS.find((s) => s.id === 'manuscripts')?.entries.find((e) =>
    e.title.includes('Sinaiticus')
  );
  const alexandrinusEntry = SACRED_SECTIONS.find((s) => s.id === 'manuscripts')?.entries.find((e) =>
    e.title.includes('Alexandrinus')
  );
  const chesterBeattyEntry = SACRED_SECTIONS.find((s) => s.id === 'manuscripts')?.entries.find((e) =>
    e.title.includes('Chester Beatty')
  );
  const apostolicFathersEntry = SACRED_SECTIONS.find((s) => s.id === 'early-church')?.entries.find((e) =>
    e.title.includes('Apostolic Fathers')
  );
  const eusebiusEntry = SACRED_SECTIONS.find((s) => s.id === 'early-church')?.entries.find((e) =>
    e.title.includes('Eusebius')
  );
  const ephesusCouncilEntry = SACRED_SECTIONS.find((s) => s.id === 'councils')?.entries.find((e) =>
    e.title.includes('Ephesus')
  );
  const menorahEntry = SACRED_SECTIONS.find((s) => s.id === 'artifacts')?.entries.find((e) =>
    e.title.includes('Menorah')
  );
  const arkEntry = SACRED_SECTIONS.find((s) => s.id === 'artifacts')?.entries.find((e) =>
    e.title.includes('Ark of the Covenant')
  );
  const tabernacleEntry = SACRED_SECTIONS.find((s) => s.id === 'artifacts')?.entries.find((e) =>
    e.title.includes('Tabernacle')
  );
  const romeEntry = SACRED_SECTIONS.find((s) => s.id === 'kingdoms')?.entries.find((e) =>
    e.title.includes('Rome in the New Testament')
  );
  const paulJourneysEntry = SACRED_SECTIONS.find((s) => s.id === 'apostles')?.entries.find((e) =>
    e.title.includes('Journeys of St. Paul')
  );
  const didacheText = PRIMARY_TEXTS.find((t) => t.title.includes('Didache'));
  const niceneText = PRIMARY_TEXTS.find((t) => t.title.includes('Nicene Creed'));
  const apostlesCreedText = PRIMARY_TEXTS.find((t) => t.title.includes('Apostles'));
  const phosHilaronHymn = HYMNS.find((h) => h.title.includes('Phos Hilaron'));

  // ── 1. Revelation 2:1-7 (Ephesus) ──────────────────────────────────────────
  if (combined.includes('ephesus') || /revelation\s*2\s*:\s*[1-7]/.test(combined)) {
    if (menorahEntry) {
      pushUnique({
        id: 'sacred_supp_menorah_ephesus',
        title: menorahEntry.title,
        category: 'ARTIFACT',
        categoryBadge: 'Sacred Artifact · Lampstands',
        era: '1st Century AD · Temple & Sanctuary Tradition',
        sourceAttribution: 'Lorea Sacred Library · Artifacts & Holy Things',
        summary: menorahEntry.blurb,
        connectionToLesson:
          'Illuminates Revelation 2:1 & 2:5 — Christ walks in the midst of the seven golden lampstands (λυχνίαι) and warns Ephesus to repent lest their lampstand be removed from its place.',
        reflectionQuestion:
          'How does the Temple lampstand imagery deepen our understanding of a congregation bearing Christ’s light in its city?',
        url: menorahEntry.url,
        scriptureRefs: ['Revelation 2:1', 'Revelation 2:5'],
      });
    }
    if (apostolicFathersEntry) {
      pushUnique({
        id: 'sacred_supp_ignatius_ephesus',
        title: 'St. Ignatius of Antioch — Epistle to the Ephesians (The Apostolic Fathers)',
        category: 'EARLY_CHURCH',
        categoryBadge: 'Patristic Primary Witness',
        era: 'c. 107–110 AD (Within ~15 years of Revelation)',
        sourceAttribution: apostolicFathersEntry.by || 'Clement, Ignatius, Polycarp, Didache',
        summary:
          'Written to the very same church at Ephesus shortly after the Apostle John’s Apocalypse, commending their orthodoxy and urging unity in love ("faith is the beginning, and love is the end").',
        primaryExcerpt:
          '"You are fellow-initiates with Paul, the sanctified, the martyred… Let us therefore do all things as though He were dwelling in us, that we may be His temples, and that He may be in us as our God." — Ignatius to the Ephesians',
        connectionToLesson:
          'Provides a firsthand 2nd-century window into the church at Ephesus and their struggle to pair doctrinal vigilance (Revelation 2:2) with fervent first love (Revelation 2:4).',
        reflectionQuestion:
          'Compare Christ’s commendation and correction in Revelation 2:2–4 with Ignatius’s letter to the Ephesians.',
        url: apostolicFathersEntry.url,
        scriptureRefs: ['Revelation 2:2', 'Revelation 2:4'],
      });
    }
    if (ephesusCouncilEntry) {
      pushUnique({
        id: 'sacred_supp_council_ephesus',
        title: ephesusCouncilEntry.title,
        category: 'COUNCIL_CREED',
        categoryBadge: 'Ecumenical Council History',
        era: ephesusCouncilEntry.era || '431 AD',
        sourceAttribution: 'Lorea Sacred Library · The Councils',
        summary: ephesusCouncilEntry.blurb,
        connectionToLesson:
          'Shows how Ephesus remained a pivotal center of Christian theology and Christological witness for centuries after John’s letter.',
        url: ephesusCouncilEntry.url,
        scriptureRefs: ['Revelation 2:1'],
      });
    }
  }

  // ── 2. Revelation 2:8-11 (Smyrna) ──────────────────────────────────────────
  if (combined.includes('smyrna') || /revelation\s*2\s*:\s*(8|9|10|11)/.test(combined)) {
    if (apostolicFathersEntry && eusebiusEntry) {
      pushUnique({
        id: 'sacred_supp_polycarp_smyrna',
        title: 'St. Polycarp of Smyrna & The Martyrdom of Polycarp (Apostolic Fathers / Eusebius)',
        category: 'EARLY_CHURCH',
        categoryBadge: 'Early Church Martyrdom Witness',
        era: 'c. 69–155 AD · Bishop of Smyrna & Disciple of John',
        sourceAttribution: 'The Apostolic Fathers & Eusebius, Church History IV.15',
        summary:
          'Polycarp was personally discipled by the Apostle John and served as Bishop of the church in Smyrna. When commanded in the Smyrna stadium to revile Christ, he gave his immortal witness.',
        primaryExcerpt:
          '"Eighty and six years have I served Him, and He never did me any injury: how then can I blaspheme my King and my Savior?" — St. Polycarp of Smyrna (Martyrdom of Polycarp 9)',
        connectionToLesson:
          'Directly embodies Christ’s call to the church at Smyrna in Revelation 2:10: "Be faithful unto death, and I will give you the crown of life."',
        reflectionQuestion:
          'How does Polycarp’s testimony in Smyrna reflect the promise of Revelation 2:10–11?',
        url: eusebiusEntry.url,
        scriptureRefs: ['Revelation 2:8', 'Revelation 2:10'],
      });
    }
    if (romeEntry) {
      pushUnique({
        id: 'sacred_supp_rome_smyrna',
        title: `${romeEntry.title} — Imperial Cult & Persecution in Asia Minor`,
        category: 'ARCHAEOLOGY',
        categoryBadge: 'Historical Context · Roman Asia',
        era: '1st Century AD · Domitianic Era',
        sourceAttribution: 'Lorea Sacred Library · Kingdoms & Cultures',
        summary:
          'Smyrna was the first city in Asia Minor to build a temple to Dea Roma (195 BC) and later to Emperor Tiberius, making refusal of emperor worship economically costly for Christians ("I know your tribulation and your poverty", Rev 2:9).',
        connectionToLesson:
          'Explains why Christians in Smyrna experienced economic boycott and poverty (πτωχεία) for refusing guild sacrifices to Caesar, yet were declared spiritually rich by Christ.',
        url: romeEntry.url,
        scriptureRefs: ['Revelation 2:9', 'Revelation 2:10'],
      });
    }
    if (phosHilaronHymn) {
      pushUnique({
        id: 'sacred_supp_phos_hilaron',
        title: phosHilaronHymn.title,
        category: 'HYMN',
        categoryBadge: 'Ancient Greek Hymn · c. 3rd Century',
        era: phosHilaronHymn.century,
        sourceAttribution: phosHilaronHymn.origin,
        summary: phosHilaronHymn.blurb,
        primaryExcerpt: `${phosHilaronHymn.original.join(' / ')}\n"${phosHilaronHymn.english.join(' ')}"`,
        connectionToLesson:
          'Sung by early Greek-speaking Christians in the Eastern Mediterranean as a hymn of hope and light during seasons of trial.',
        url: phosHilaronHymn.audioUrl || 'https://archive.org/details/PhosHilaron',
        scriptureRefs: ['Revelation 2:8', 'Revelation 2:10'],
      });
    }
  }

  // ── 3. Revelation 2:12-17 (Pergamum) ───────────────────────────────────────
  if (combined.includes('pergamum') || combined.includes('antipas') || /revelation\s*2\s*:\s*1[2-7]/.test(combined)) {
    if (arkEntry && tabernacleEntry) {
      pushUnique({
        id: 'sacred_supp_ark_hidden_manna',
        title: `${arkEntry.title} & The Golden Jar of Hidden Manna`,
        category: 'ARTIFACT',
        categoryBadge: 'Sacred Artifact · Hidden Manna',
        era: 'Exodus 16:32–34 · Hebrews 9:4 · Revelation 2:17',
        sourceAttribution: 'Lorea Sacred Library · Artifacts & Holy Things',
        summary:
          'Inside the Ark of the Covenant in the Most Holy Place rested the golden urn holding the manna preserved from the wilderness. Jewish tradition taught that the Messiah would restore the hidden manna.',
        connectionToLesson:
          'Illuminates Revelation 2:17 — believers in Pergamum who refuse food sacrificed to idols (2:14) are promised the true "hidden manna" of Christ’s own heavenly feast and a white stone of acquittal.',
        reflectionQuestion:
          'Why is the promise of "hidden manna" especially meaningful for Christians in Pergamum who abstained from pagan banquets (Revelation 2:14, 17)?',
        url: arkEntry.url,
        scriptureRefs: ['Revelation 2:14', 'Revelation 2:17'],
      });
    }
    if (didacheText) {
      pushUnique({
        id: 'sacred_supp_didache_pergamum',
        title: didacheText.title,
        category: 'EARLY_CHURCH',
        categoryBadge: '1st-Century Primary Text',
        era: didacheText.era,
        sourceAttribution: didacheText.source,
        summary:
          'The earliest surviving Christian catechism ("Teaching of the Twelve Apostles"), contrasting the Way of Life with idolatrous compromise and explicitly warning believers to keep away from meat offered to idols (Didache 6:3).',
        primaryExcerpt: didacheText.body.slice(0, 2).join(' '),
        connectionToLesson:
          'Parallels Christ’s warning in Revelation 2:14–15 against the teaching of Balaam and the Nicolaitans in Pergamum.',
        url: 'https://www.ccel.org/ccel/lake/fathers',
        scriptureRefs: ['Revelation 2:14', 'Revelation 2:15'],
      });
    }
  }

  // ── 4. Revelation 2:18-29 (Thyatira) ───────────────────────────────────────
  if (combined.includes('thyatira') || /revelation\s*2\s*:\s*(18|19|2[0-9])/.test(combined)) {
    if (paulJourneysEntry) {
      pushUnique({
        id: 'sacred_supp_thyatira_routes',
        title: `${paulJourneysEntry.title} — Lydia of Thyatira & the Trade Guilds of Asia`,
        category: 'APOSTOLIC_MAP',
        categoryBadge: 'Apostolic Routes & Trade Cities',
        era: 'c. 49–95 AD · Acts 16:14 & Revelation 2:18–29',
        sourceAttribution: 'Lorea Sacred Library · Routes of the Apostles',
        summary:
          'Thyatira was renowned for its bronze-working and purple-dye trade guilds (cf. Lydia of Thyatira, a seller of purple goods in Acts 16:14). Guild membership required attendance at pagan feasts.',
        connectionToLesson:
          'Explains why Christ addresses Thyatira with "feet like burnished bronze" (χαλκολιβάνῳ, Revelation 2:18) — speaking directly in the language of Thyatira’s bronze-smiths and trade guilds.',
        reflectionQuestion:
          'How does Thyatira’s background as a city of trade guilds illuminate the pressure Christians faced in Revelation 2:18–20?',
        url: paulJourneysEntry.url,
        scriptureRefs: ['Revelation 2:18', 'Revelation 2:19', 'Acts 16:14'],
      });
    }
    if (niceneText) {
      pushUnique({
        id: 'sacred_supp_nicene_son_of_god',
        title: `${niceneText.title} — "The Son of God" (Revelation 2:18)`,
        category: 'COUNCIL_CREED',
        categoryBadge: 'Creedal Christology',
        era: niceneText.era,
        sourceAttribution: niceneText.source,
        summary:
          'Revelation 2:18 is the only place in the entire Book of Revelation where the exact title "the Son of God" (ὁ Υἱὸς τοῦ Θεοῦ) appears, proclaiming Christ’s divine sonship over against imperial claims.',
        primaryExcerpt: niceneText.body[1],
        connectionToLesson:
          'Connects the Christological title in Revelation 2:18 ("the words of the Son of God, who has eyes like a flame of fire") and Psalm 2:7–9 (quoted in Revelation 2:26–27) to the Church’s historic confession.',
        url: 'https://www.newadvent.org/cathen/11044a.htm',
        scriptureRefs: ['Revelation 2:18', 'Revelation 2:26', 'Revelation 2:27'],
      });
    }
  }

  // ── 5. Manuscript Witnesses for Revelation / New Testament ─────────────────
  if (combined.includes('revelation') || combined.includes('romans') || combined.includes('john')) {
    if (sinaiticusEntry) {
      pushUnique({
        id: 'sacred_supp_codex_sinaiticus',
        title: `${sinaiticusEntry.title} (4th-Century Greek New Testament Manuscript)`,
        category: 'MANUSCRIPT',
        categoryBadge: 'Original Manuscript · GA 01',
        era: sinaiticusEntry.era || 'c. 330–360 AD',
        sourceAttribution: sinaiticusEntry.by || 'British Library / Codex Sinaiticus Project',
        summary: sinaiticusEntry.blurb,
        connectionToLesson:
          'Allows students to inspect the earliest surviving complete Greek uncial manuscript preserving the Book of Revelation and the New Testament epistles.',
        url: sinaiticusEntry.url,
        scriptureRefs: ['Revelation 2:1', 'Revelation 2:7', 'Romans 8:1'],
      });
    }
    if (chesterBeattyEntry && combined.includes('revelation')) {
      pushUnique({
        id: 'sacred_supp_p47_chester_beatty',
        title: `${chesterBeattyEntry.title} (Papyrus 47 — Earliest Revelation Papyrus)`,
        category: 'MANUSCRIPT',
        categoryBadge: '3rd-Century Papyrus',
        era: chesterBeattyEntry.era || 'c. 200–250 AD',
        sourceAttribution: chesterBeattyEntry.by || 'Chester Beatty Library, Dublin',
        summary:
          'Papyrus 47 (P47) in the Chester Beatty collection is one of the oldest surviving papyrus manuscripts of the Book of Revelation, written in Egypt during the 3rd century.',
        connectionToLesson:
          'Demonstrates the early textual transmission of the Apocalypse across the Mediterranean centuries before the great parchment codices.',
        url: chesterBeattyEntry.url,
        scriptureRefs: ['Revelation 2:1'],
      });
    }
    if (alexandrinusEntry && combined.includes('revelation')) {
      pushUnique({
        id: 'sacred_supp_codex_alexandrinus',
        title: `${alexandrinusEntry.title} — Prized Witness to the Book of Revelation`,
        category: 'MANUSCRIPT',
        categoryBadge: '5th-Century Uncial · GA 02',
        era: alexandrinusEntry.era || 'c. 400–440 AD',
        sourceAttribution: alexandrinusEntry.by || 'British Library',
        summary:
          'Codex Alexandrinus is universally regarded by textual scholars as one of the highest-fidelity ancient Greek witnesses specifically for the text of the Book of Revelation.',
        connectionToLesson:
          'Gives students and teachers a direct link to the 5th-century manuscript folio containing the Letters to the Seven Churches.',
        url: alexandrinusEntry.url,
        scriptureRefs: ['Revelation 2:1', 'Revelation 2:29'],
      });
    }
  }

  // ── 6. Check Historical Evidence Catalog (Mesha Stele, Cyrus Cylinder, Sinaiticus, etc.) ─
  for (const ev of HISTORICAL_EVIDENCE) {
    const matchesPassage = ev.passages.some((p) => combined.includes(p.toLowerCase()));
    if (matchesPassage) {
      pushUnique({
        id: `sacred_hist_${ev.id}`,
        title: `${ev.title} (${ev.catalogId})`,
        category: 'HISTORICAL_EVIDENCE',
        categoryBadge: `Museum Artifact · ${ev.era}`,
        era: ev.date.label,
        sourceAttribution: ev.sources[0]?.institution || ev.place,
        summary: `${ev.observation} ${ev.significance}`,
        primaryExcerpt: `Curator Note & Limits: ${ev.limits}`,
        connectionToLesson: `Linked directly to ${ev.passages.join(', ')} in the Lorea Sacred Library Historical Evidence catalog.`,
        reflectionQuestion: ev.questions[0],
        url: ev.sources[0]?.url || 'https://www.britishmuseum.org',
        scriptureRefs: ev.passages,
      });
    }
  }

  // ── 7. Fallback Christian Education Sacred Library Core Supplements ────────
  if (supplements.length === 0) {
    if (apostlesCreedText) {
      pushUnique({
        id: 'sacred_supp_apostles_creed',
        title: apostlesCreedText.title,
        category: 'COUNCIL_CREED',
        categoryBadge: 'Historic Rule of Faith',
        era: apostlesCreedText.era,
        sourceAttribution: apostlesCreedText.source,
        summary: 'Foundational baptismal confession of the early Church summarizing the biblical narrative of creation, redemption, and new creation.',
        primaryExcerpt: apostlesCreedText.body.join(' '),
        connectionToLesson: 'Anchors the lesson within the historic Trinitarian confession of the Church.',
        url: 'https://www.ccel.org/creeds/apostles.creed.html',
        scriptureRefs: ['Romans 8:11', 'Romans 8:34'],
      });
    }
    if (sinaiticusEntry) {
      pushUnique({
        id: 'sacred_supp_codex_sinaiticus_general',
        title: sinaiticusEntry.title,
        category: 'MANUSCRIPT',
        categoryBadge: 'Original Manuscript',
        era: sinaiticusEntry.era || 'c. 330–360 AD',
        sourceAttribution: sinaiticusEntry.by || 'British Library',
        summary: sinaiticusEntry.blurb,
        connectionToLesson: 'Explore the digitized 4th-century Greek manuscript leaves behind our English Bible translations.',
        url: sinaiticusEntry.url,
        scriptureRefs: [],
      });
    }
  }

  return supplements;
}
