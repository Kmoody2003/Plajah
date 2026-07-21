/**
 * Plajah Heritage Archive — The Living Combat Atlas
 * Volume I: African Martial Arts
 *
 * A digital-museum dataset for the Academia (Labs) Combat Atlas studio.
 * Every accession carries curated scholarship PLUS a rights-cleared media
 * layer: Wikimedia Commons / Met CC0 / public-domain images each with a
 * license + attribution record, and verified YouTube documentary ids.
 *
 * Legal posture:
 *  - Images: only CC BY / CC BY-SA / CC0 / Public Domain, attributed inline.
 *  - Beni Hasan plate volumes (1893–1900) are public domain, hosted by the
 *    Internet Archive — linked as open archives, not re-hosted.
 *  - Citation-only shelf (Desch-Obi, Green, EJMAS) is cited & summarized,
 *    never ingested.
 */

import type { MuseumFigure, MuseumHallDef } from '../components/MuseumHall';

// ── Types ─────────────────────────────────────────────────────────────────────

export type CombatForm = 'Striking' | 'Grappling' | 'Weapon' | 'Hybrid / Acrobatic';

/** Museum wings — one volume per continent-scale tradition family. */
export type WingId = 'africa' | 'asia' | 'europe' | 'americas' | 'oceania';
export interface WingDef { id: WingId; volume: string; name: string; blurb: string }
export const ATLAS_WINGS: WingDef[] = [
  { id: 'africa',   volume: 'Vol. I',   name: 'African Martial Arts',            blurb: 'The body as the archive — twelve living arts and the diaspora arc.' },
  { id: 'asia',     volume: 'Vol. II',  name: 'Asian Martial Arts',              blurb: 'Temple, dojo, ring and steppe — the systematized combat canons.' },
  { id: 'europe',   volume: 'Vol. III', name: 'European Historical Arts',        blurb: 'The fight-book continent — manuscripts, prize rings and revivals.' },
  { id: 'americas', volume: 'Vol. IV',  name: 'Arts of the Americas & Diaspora', blurb: 'What crossed the water and what was always here.' },
  { id: 'oceania',  volume: 'Vol. V',   name: 'Oceanic & Pacific Arts',          blurb: 'Warrior knowledge of the island world — much of it kept sacred.' },
];

/** Regions are wing-scoped display strings; filter chips derive from the data. */
export type CombatRegion = string;

/** A rights-cleared archival image. Everything needed to display AND attribute. */
export interface ArchiveImage {
  url: string;            // direct image URL (upload.wikimedia.org / Met CC0 / IA)
  pageUrl?: string;       // source page (Commons file page, Met object page…)
  license: string;        // 'CC BY-SA 4.0', 'CC0', 'Public domain', …
  attribution: string;    // photographer / museum credit
  caption?: string;
}

export interface ArchiveVideo {
  youtubeId?: string;     // verified via oEmbed at curation time
  title: string;
  channel?: string;
  query?: string;         // fallback YouTube search when no/stale id
}

export interface CombatMaster { name: string; note: string; wikiSlug?: string }

export interface CombatArt {
  id: string;
  wing: WingId;
  code: string;                  // accession code, e.g. 'AMA-001'
  name: string;
  alt: string;                   // alternate names
  country: string;
  region: CombatRegion;
  people: string;
  form: CombatForm;
  era: string;
  glyph: GlyphKind;
  pose?: PoseKind;               // kinetic pictogram (ActionFigure)
  wikiSlug?: string;             // live Wikipedia enrichment (fetchWiki)
  lede: string;
  history: string;
  technique: string;
  ritual: string;
  masters: CombatMaster[];
  diaspora: string;
  sources: string[];             // curated citations (display-only)
  images: ArchiveImage[];        // rights-cleared media layer
  videos: ArchiveVideo[];
  links: { label: string; url: string }[];
}

export type GlyphKind =
  | 'spearFist' | 'invertKick' | 'crossSticks' | 'grapplRing'
  | 'twinStick' | 'throwArc' | 'openHand' | 'ashTake';

/** Kinetic Figure System — pictogram pose drawn from the art's real mechanics. */
export type PoseKind =
  | 'spearLunge' | 'inverted' | 'twinSticks' | 'throwLift' | 'lowShot'
  | 'overheadPole' | 'crossPunch' | 'collarClinch' | 'tahtibDance';

// ── Palette (kept from the original Atlas design language) ────────────────────

export const ATLAS_ACCENT = '#D9A441';    // harvest ochre — primary accent
export const ATLAS_ACCENT_2 = '#C24D2C';  // laterite red earth

export const FORM_COLORS: Record<CombatForm, string> = {
  Striking: '#C24D2C',
  Grappling: '#D9A441',
  Weapon: '#8FA08A',
  'Hybrid / Acrobatic': '#5B6EA8',
};

export const COMBAT_FORMS: CombatForm[] = ['Striking', 'Grappling', 'Weapon', 'Hybrid / Acrobatic'];

// ── The Collection — Volume I accessions ─────────────────────────────────────

export const COMBAT_ARTS: CombatArt[] = [
  {
    id: 'tahtib',
    wing: 'africa',
    code: 'AMA-001',
    name: 'Tahtib',
    alt: 'Egyptian stick fencing · Fann an-Nazaha wal-Tahtib',
    country: 'Egypt',
    region: 'North Africa',
    people: 'Upper Egyptian communities',
    form: 'Weapon',
    era: 'c. 2000 BCE — present',
    glyph: 'crossSticks',
    pose: 'tahtibDance',
    wikiSlug: 'Tahtib',
    lede: 'The oldest continuously visible martial art on Earth — stick dueling painted onto tomb walls four thousand years ago and still danced at Upper Egyptian weddings today.',
    history:
      'Stick combat appears in ancient Egyptian art across millennia — most famously in carved match scenes at Medinet Habu (c. 1180 BCE) showing bouts with referees and spectators, and in the vast combat murals of the Beni Hasan tombs. The modern folk art of Tahtib descends from this lineage, surviving in Upper Egypt as both a competitive game and a musical performance form inseparable from village celebration.',
    technique:
      'Two practitioners wield long cane or bamboo staves (roughly four feet), exchanging strikes, parries, and evasive footwork. Targeting favors clean, controlled contact; the exchange follows musical rhythm, blurring the line between duel and dance. Ceremonial tahtib emphasizes flow and display; combative lines preserve the strike-and-block vocabulary.',
    ritual:
      'Performed to the mizmar and drum at weddings, festivals, and harvest gatherings. The stick itself (asa) carries associations of honor and manhood. Tahtib functions as living folklore — a village’s shared choreography of pride — and was inscribed on UNESCO’s Intangible Cultural Heritage list in 2016.',
    masters: [
      { name: 'Folk lineages', note: 'No single founder — transmitted through village and family lines, with regional styles across Upper Egypt.' },
    ],
    diaspora: 'The Nile Valley stick tradition sits at the ancient root of Africa’s three great stick-combat families, alongside Nguni stick fighting (south) and Donga (east). See the Plate Room for the tomb-wall record.',
    sources: [
      'Medinet Habu reliefs, c. 1180 BCE (stick-fencing matches with guards and referees)',
      'Beni Hasan tomb murals, c. 2000 BCE (combat sequences)',
      'Newberry, Beni Hasan I–IV (EEF, 1893–1900) — public-domain plates in Plajah holdings',
      'UNESCO Intangible Cultural Heritage inscription (2016)',
    ],
    images: [
      { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f5/Tahtib%2C_Mawlid_Al-Ashi%2C_Luxor_01.jpg/1280px-Tahtib%2C_Mawlid_Al-Ashi%2C_Luxor_01.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:Tahtib,_Mawlid_Al-Ashi,_Luxor_01.jpg', license: 'Public domain', attribution: 'ولاء, via Wikimedia Commons', caption: 'Tahtib stick fencing at the Mawlid Al-Ashi festival, Luxor — a living Upper Egyptian folk tradition' },
      { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/21/Tahtib_in_Asyut.jpg/1280px-Tahtib_in_Asyut.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:Tahtib_in_Asyut.jpg', license: 'CC BY-SA 4.0', attribution: 'Ahmed Emad Hamdy, via Wikimedia Commons', caption: 'Tahtib practitioners in Asyut, Upper Egypt — the martial art that evolved into a festive stick dance' },
      { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1f/Beni_Hassan._Tombe_van_Baqet_III_Muurschildering_Worstel-_en_strijdsc%C3%A8nes%2C_GDE002322.jpg/1280px-Beni_Hassan._Tombe_van_Baqet_III_Muurschildering_Worstel-_en_strijdsc%C3%A8nes%2C_GDE002322.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:Beni_Hassan._Tombe_van_Baqet_III_Muurschildering_Worstel-_en_strijdsc%C3%A8nes,_GDE002322.jpg', license: 'Public domain', attribution: 'Wikimedia Commons', caption: 'Wrestling and combat murals in the tomb of Baqet III at Beni Hasan (Middle Kingdom, c. 2000 BCE)' },
      { url: 'https://upload.wikimedia.org/wikipedia/commons/0/09/Beni_Hassan_tomb_15_wrestling_detail.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:Beni_Hassan_tomb_15_wrestling_detail.jpg', license: 'Public domain', attribution: 'Wikimedia Commons', caption: 'Detail of the wrestling sequence from Beni Hasan Tomb 15 — among the oldest depictions of systematic grappling' },
      { url: 'https://upload.wikimedia.org/wikipedia/commons/4/46/Madint_Habu_Tahtib_drawing.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:Madint_Habu_Tahtib_drawing.jpg', license: 'Public domain', attribution: 'Wikimedia Commons', caption: 'Drawing of the Medinet Habu temple relief showing ancient Egyptian stick fencing (era of Ramesses III)' },
      { url: 'https://images.metmuseum.org/CRDImages/eg/original/185245.jpg', pageUrl: 'https://www.metmuseum.org/art/collection/search/545883', license: 'CC0', attribution: 'The Metropolitan Museum of Art, New York', caption: 'Statuette of wrestlers, Egyptian limestone, ca. 1981–1550 BCE' },
    ],
    videos: [
      { youtubeId: '9EGPrnJ623s', title: 'Tahteeb, stick game — Egypt', channel: 'UNESCO' },
      { youtubeId: 'EHGBm66scHc', title: 'ICH: What is it? Tahteeb, a stick game — Egypt', channel: 'Association Nationale Cultures du Monde' },
    ],
    links: [{ label: 'UNESCO ICH — Tahteeb, stick game (inscribed 2016)', url: 'https://ich.unesco.org/en/RL/tahteeb-stick-game-01189' }],
  },
  {
    id: 'dambe',
    wing: 'africa',
    code: 'AMA-002',
    name: 'Dambe',
    alt: 'Hausa boxing · Kokawa’s striking sibling',
    country: 'Nigeria · Niger · Chad',
    region: 'West Africa',
    people: 'Hausa (butcher & fishing guilds)',
    form: 'Striking',
    era: 'centuries-old — professionalizing now',
    glyph: 'spearFist',
    pose: 'spearLunge',
    wikiSlug: 'Dambe',
    lede: 'One fist bound in cord becomes the spear; the free hand becomes the shield. Harvest-festival prizefighting descended from preparation for war.',
    history:
      'Dambe grew up among Hausa butcher and fishing castes, whose clans traveled between farm villages at harvest time, issuing open challenges as festival entertainment. Its vocabulary still alludes to warfare — the tradition was also a way men readied themselves for battle. In the internet era, Dambe promotions have carried the sport to a global audience.',
    technique:
      'The dominant hand — the ‘spear’ — is wrapped in cloth (kara) bound with knotted cord (zare) and is the primary weapon; the lead hand ranges and defends. Kicks and head strikes are part of the arsenal. Bouts run up to three rounds; a round ends when a hand, knee, or body touches the ground — poetically called ‘killing’ the opponent.',
    ritual:
      'Matches unfold on open sand to drumming, chanting, and praise-calling. Fighters wear protective amulets; victories historically brought cattle, money, gifts — and social standing. The bout is a festival institution as much as a sport.',
    masters: [
      { name: 'Shago', note: 'Widely cited as the most celebrated Dambe fighter of all time; a northern Nigerian athletic hero.' },
      { name: 'Ado Dan Kware · Ali Zuma · Balbalin Bala’i', note: 'Storied champions of the classical era.' },
      { name: 'Yakubu ‘Da Godo’ · Hassan ‘Rubber’', note: 'Modern stars carrying the art into its televised era.' },
    ],
    diaspora: 'Desch-Obi and others place Hausa boxing within the wider Atlantic story of African pugilism that shadows the rise of bare-knuckle boxing culture.',
    sources: [
      'Al Jazeera field reporting on Dambe’s modern resurgence',
      'Journal of Alternative Perspectives (EJMAS) — Green, on Hausa boxing',
      'Guardian Nigeria — origins along the trans-Saharan trade routes',
    ],
    images: [
      { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d5/Dambe_match2_-_Deidei_2010.jpg/1280px-Dambe_match2_-_Deidei_2010.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:Dambe_match2_-_Deidei_2010.jpg', license: 'CC BY 2.0', attribution: 'Jeremy Weate, via Wikimedia Commons', caption: 'Dambe fighters stare each other down before a match at Deidei, near Abuja (2010)' },
      { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/96/A_national_sport-Dambe_-_Deidei_2010.jpg/1280px-A_national_sport-Dambe_-_Deidei_2010.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:A_national_sport-Dambe_-_Deidei_2010.jpg', license: 'CC BY 2.0', attribution: 'Jeremy Weate, via Wikimedia Commons', caption: 'A Dambe bout in progress — the sport has spread far beyond Hausaland' },
      { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e9/Glove_wrapping-Dambe_Deidei_2010.jpg/1280px-Glove_wrapping-Dambe_Deidei_2010.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:Glove_wrapping-Dambe_Deidei_2010.jpg', license: 'CC BY 2.0', attribution: 'Jeremy Weate, via Wikimedia Commons', caption: 'Wrapping the ‘spear’ — cloth kara bound with knotted cord before a tournament' },
      { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/69/Iron_fist_-_Dambe_Deidei_2010.jpg/1280px-Iron_fist_-_Dambe_Deidei_2010.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:Iron_fist_-_Dambe_Deidei_2010.jpg', license: 'CC BY 2.0', attribution: 'Jeremy Weate, via Wikimedia Commons', caption: 'Close-up of the wrapped striking fist used in Dambe' },
      { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/60/Dambe_poses_-_Deidei_2010.jpg/1280px-Dambe_poses_-_Deidei_2010.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:Dambe_poses_-_Deidei_2010.jpg', license: 'CC BY 2.0', attribution: 'Jeremy Weate, via Wikimedia Commons', caption: 'Static, dance-like poses during a Dambe match' },
    ],
    videos: [
      { youtubeId: 'NlYWYOhg2lY', title: 'Dambe boxing: Nigeria’s brutal martial art', channel: 'BBC News Africa' },
      { youtubeId: '35NzG0k9PdU', title: 'Inside the Brutal World of Nigerian Boxing', channel: 'VICE News' },
      { youtubeId: '-spQwHOP0nI', title: 'Inside Africa’s fighting culture: Boxing, MMA & Dambe Warriors', channel: 'DW The 77 Percent' },
    ],
    links: [{ label: 'Al Jazeera — How an ancient form of Nigerian boxing swept the internet', url: 'https://www.aljazeera.com/features/2018/6/18/dambe-how-an-ancient-form-of-nigerian-boxing-swept-the-internet' }],
  },
  {
    id: 'laamb',
    wing: 'africa',
    code: 'AMA-003',
    name: 'Laamb',
    alt: 'Lutte Sénégalaise · lutte avec frappe',
    country: 'Senegal',
    region: 'West Africa',
    people: 'Serer & Wolof',
    form: 'Grappling',
    era: 'pre-colonial — national sport today',
    glyph: 'throwArc',
    pose: 'throwLift',
    wikiSlug: 'Senegalese_wrestling',
    lede: 'Senegal’s national spectacle: wrestling born of Serer harvest rites, now filling a 20,000-seat arena where mysticism and athletics share the ring.',
    history:
      'Rooted in the wrestling traditions of the Serer people of west-central Senegal, laamb marked harvest’s end and measured the strength of villages, later spreading through Wolof communities. Under colonial and post-colonial urbanization it professionalized into today’s stadium sport — anchored since 2018 by the Arène Nationale at Pikine — where champions rival footballers in fame and top purses reach life-changing sums.',
    technique:
      'Victory comes by grounding the opponent — head, back, or both hands and knees to the earth. The professional ‘avec frappe’ code also permits bare-fist punches, making laamb a rare wrestling form with live striking. Training blends grueling conditioning with dance rehearsal and rhythmic coordination.',
    ritual:
      'No African combat art stages ritual more completely: marabout blessings, gris-gris amulets, protective baths and potions, the bàkk praise-dance, griots drumming fighters into the arena. Wrestlers embody the Serer ideal of njom — composed, stoic bravery.',
    masters: [
      { name: 'Mohamed Ndao ‘Tyson’', note: 'The modern icon whose explosive rise made laamb a national obsession and international story.', wikiSlug: 'Mohamed_Ndao' },
      { name: 'CNG (Comité National de Gestion de la Lutte)', note: 'Governing body of the professional sport.' },
    ],
    diaspora: 'The flagship of the wider Lutte Traditionnelle family practiced across Senegal, Niger, Burkina Faso, Mali, and beyond.',
    sources: [
      'History of Laamb (ResearchGate) — Serer origins to professional era',
      'World Press Photo essays — Rouvre (2009), Bobst (2016) on ritual preparation',
      'Al Jazeera ‘Wrestling in Dakar’ documentary',
    ],
    images: [
      { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8d/Lutte_s%C3%A9n%C3%A9galaise_Bercy_2013_-_Mame_Balla-Pape_Mor_L%C3%B4_-_32.jpg/1280px-Lutte_s%C3%A9n%C3%A9galaise_Bercy_2013_-_Mame_Balla-Pape_Mor_L%C3%B4_-_32.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:Lutte_s%C3%A9n%C3%A9galaise_Bercy_2013_-_Mame_Balla-Pape_Mor_L%C3%B4_-_32.jpg', license: 'CC BY-SA 3.0', attribution: 'Pierre-Yves Beaudouin, via Wikimedia Commons', caption: 'Mame Balla vs Pape Mor Lô — World African Wrestling tour, Paris Bercy (2013)' },
      { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/06/SenegaleseWrestling.JPG/1280px-SenegaleseWrestling.JPG', pageUrl: 'https://commons.wikimedia.org/wiki/File:SenegaleseWrestling.JPG', license: 'CC BY 3.0', attribution: 'KaBa, via Wikimedia Commons', caption: 'Laamb at the Demba Diop stadium in Dakar' },
      { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d1/Lutte_traditionnelle_s%C3%A9n%C3%A9galaise_%C3%A0_Toubab_Dialaw_08.jpg/1280px-Lutte_traditionnelle_s%C3%A9n%C3%A9galaise_%C3%A0_Toubab_Dialaw_08.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:Lutte_traditionnelle_s%C3%A9n%C3%A9galaise_%C3%A0_Toubab_Dialaw_08.jpg', license: 'CC0', attribution: 'Kabkia, via Wikimedia Commons', caption: 'Traditional Senegalese wrestling at Toubab Dialaw' },
      { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e5/Lutte_Senegalaise.jpg/1280px-Lutte_Senegalaise.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:Lutte_Senegalaise.jpg', license: 'CC BY-SA 4.0', attribution: 'Officier 23, via Wikimedia Commons', caption: 'A laamb wrestling session in rural Senegal' },
      { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6b/Ousmane_Dia.jpg/1280px-Ousmane_Dia.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:Ousmane_Dia.jpg', license: 'CC BY-SA 4.0', attribution: 'Kimport, via Wikimedia Commons', caption: 'Ousmane Dia — the champion known as ‘Bombardier’' },
    ],
    videos: [
      { youtubeId: '86ldeKPpcdw', title: 'Senegal: Wrestling with Reality | Al Jazeera World', channel: 'Al Jazeera English' },
      { youtubeId: 'oO6TtWvBxWc', title: '‘Wrestling is in our blood’ | Senegalese Laamb Wrestling', channel: 'United World Wrestling' },
      { youtubeId: '2QtfxYOkXIA', title: 'Senegalese Laamb Wrestling & The World is Sinking', channel: 'VICE News' },
    ],
    links: [{ label: 'Wikipedia — Senegalese wrestling (laamb)', url: 'https://en.wikipedia.org/wiki/Senegalese_wrestling' }],
  },
  {
    id: 'nuba',
    wing: 'africa',
    code: 'AMA-004',
    name: 'Nuba Wrestling',
    alt: 'Al-Siraa’ — ‘the struggle’',
    country: 'Sudan',
    region: 'East Africa',
    people: 'Nuba peoples (50+ groups, Nuba Mountains)',
    form: 'Grappling',
    era: 'linked to Kush, c. 200 BCE — present',
    glyph: 'ashTake',
    pose: 'lowShot',
    wikiSlug: 'Nuba_fighting',
    lede: 'Ash-covered grapplers of the Nuba Mountains, carrying an identity through displacement — wrestling as the living archive of a people.',
    history:
      'Traced by tradition to the great Kingdom of Kush, wrestling has been the defining cultural practice of the Nuba peoples for centuries. Through war and displacement — including the campaigns that scattered hundreds of thousands from the Nuba Mountains — weekly matches in Khartoum’s outskirts and in refugee camps became the thread binding a dispersed people to home.',
    technique:
      'Pure takedown grappling: no strikes, no pins, no submissions. The match is won the instant an opponent is brought to the ground. Traditionally fought skin-to-skin with bodies spread in white ash and sand; styles range from explosive and chaotic to slow and rhythmic depending on the club and community.',
    ritual:
      'Bound to the harvest calendar (roughly November–March), fertility rites, and ancestral honor. Boys begin learning around age seven, traditionally taught by maternal uncles; champions carry elevated status for life. The ash is both practical grip and sacred marking.',
    masters: [
      { name: 'Communal lineages', note: 'Village and clan transmission; each modern club maintains its own stylistic identity.' },
    ],
    diaspora: 'National Geographic and others have documented wrestling’s survival in South Sudanese refugee camps — cultural continuity under extreme pressure.',
    sources: [
      'National Geographic — wrestling in the Yida refugee camp',
      'Middle East Monitor — identity-shaping ritual among Sudan’s Nuba',
      'Sudanow — heritage lineage to the Kingdom of Kush',
    ],
    images: [
      { url: 'https://upload.wikimedia.org/wikipedia/commons/4/45/Nuba_wrestling_in_Bahri%2C_Sudan.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:Nuba_wrestling_in_Bahri,_Sudan.jpg', license: 'CC BY 2.0', attribution: 'Joseph Bautista, via Wikimedia Commons', caption: 'Nuba wrestling match in Bahri, Sudan' },
      { url: 'https://upload.wikimedia.org/wikipedia/commons/1/14/Nuba_wrestling_in_Al_Haj_Yousef%2C_Sudan.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:Nuba_wrestling_in_Al_Haj_Yousef,_Sudan.jpg', license: 'CC BY 2.0', attribution: 'Joseph Bautista, via Wikimedia Commons', caption: 'Wrestlers grapple at the Al Haj Yousef arena on the outskirts of Khartoum' },
      { url: 'https://upload.wikimedia.org/wikipedia/commons/1/10/A_nuba_wrestler_in_Al_Haj_Yousef%2C_Sudan.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:A_nuba_wrestler_in_Al_Haj_Yousef,_Sudan.jpg', license: 'CC BY 2.0', attribution: 'Joseph Bautista, via Wikimedia Commons', caption: 'Portrait of a Nuba wrestler, Al Haj Yousef, Sudan' },
      { url: 'https://upload.wikimedia.org/wikipedia/commons/b/bb/Spectators_of_Nuba_wrestling_in_Bahri%2C_Sudan.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:Spectators_of_Nuba_wrestling_in_Bahri,_Sudan.jpg', license: 'CC BY 2.0', attribution: 'Joseph Bautista, via Wikimedia Commons', caption: 'Crowd of spectators at a Nuba wrestling tournament in Bahri, Sudan' },
    ],
    videos: [
      { youtubeId: 'Od8WRzvPuu8', title: 'Wrestling: Japanese diplomat loses final Sudan bout', channel: 'AFP News Agency' },
      { youtubeId: 'x32JJhRgS4c', title: 'Nubian Wrestling in Sudan with Hector', channel: 'TG4' },
    ],
    links: [{ label: 'Wikipedia — Nuba wrestling', url: 'https://en.wikipedia.org/wiki/Nuba_wrestling' }],
  },
  {
    id: 'nguni',
    wing: 'africa',
    code: 'AMA-005',
    name: 'Nguni Stick Fighting',
    alt: 'donga · dlala ’nduku · intonga',
    country: 'South Africa',
    region: 'Southern Africa',
    people: 'Zulu, Xhosa & Nguni peoples',
    form: 'Weapon',
    era: 'c. 1670 — formalized under Shaka',
    glyph: 'twinStick',
    pose: 'twinSticks',
    wikiSlug: 'Nguni_stick-fighting',
    lede: 'Two sticks and a shield: the herd-boy’s game that Shaka forged into warrior training — and that Nelson Mandela practiced in his youth.',
    history:
      'Born among Nguni herd boys sparring while tending cattle, stick fighting was formalized as martial training during the rise of the Zulu kingdom — oral histories point to Amalandela (c. 1670) and to systematization under Shaka and his successor Dingane. Today it survives as sport, ceremony, and heritage, including modern programs using it to redirect youth away from gang violence.',
    technique:
      'The fighter carries the induku (striking stick) and the longer ubhoko (defensive staff), often with a small cowhide ihawu shield bound to the defending arm. Bouts — refereed by an induna, or war captain — score clean strikes to body, head, and limbs, and can stretch for hours until a decisive blow, first blood, or exhaustion.',
    ritual:
      'A rite of passage: at sixteen a Zulu boy traditionally cut his own stick from the forest with his father. Matches convene at weddings, where warriors of the bride’s and groom’s households ‘get to know each other’ through combat. The strongest earns the title Inkunzi — the Bull.',
    masters: [
      { name: 'Shaka Zulu', note: 'Systematized stick combat within Zulu military training.', wikiSlug: 'Shaka' },
      { name: 'Nelson Mandela', note: 'Practiced stick fighting in his rural Xhosa youth — its most famous modern practitioner.', wikiSlug: 'Nelson_Mandela' },
    ],
    diaspora: 'Desch-Obi links southern African stick arts to Atlantic-world stick traditions like Trinidadian kalinda; the family resemblance to Tahtib and Donga frames Africa’s stick-combat continuum.',
    sources: [
      'Coetzee, ‘Zulu Stick Fighting: A Socio-Historical Overview’ (InYo Journal)',
      'South African History Online — Nguni stick fighting',
      'Face2Face Africa — anti-gang youth programs',
    ],
    images: [
      { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0b/Lesedi_Cultural_Village%2C_Hartbeespoort%2C_North_West%2C_South_Africa_%2820517297875%29.jpg/1280px-Lesedi_Cultural_Village%2C_Hartbeespoort%2C_North_West%2C_South_Africa_%2820517297875%29.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:Lesedi_Cultural_Village,_Hartbeespoort,_North_West,_South_Africa_(20517297875).jpg', license: 'CC BY 2.0', attribution: 'South African Tourism, via Wikimedia Commons', caption: 'Nguni stick fighters spar with sticks and shields at Lesedi Cultural Village' },
      { url: 'https://upload.wikimedia.org/wikipedia/commons/5/57/Zoulous_%28Shakaland%29.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:Zoulous_(Shakaland).jpg', license: 'CC BY 1.0', attribution: 'FC Georgio, via Wikimedia Commons', caption: 'Zulu men with fighting sticks and izihlangu cowhide shields at Shakaland, KwaZulu-Natal' },
      { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ae/Zulu_warrior.jpg/1280px-Zulu_warrior.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:Zulu_warrior.jpg', license: 'Public domain', attribution: 'Cornelius H. Patton, via Wikimedia Commons', caption: 'Historic photograph of a Zulu warrior in full regalia with spear and fighting stick' },
      { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/fa/Knobkerrie-001.jpg/1280px-Knobkerrie-001.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:Knobkerrie-001.jpg', license: 'CC BY-SA 3.0', attribution: 'NJR ZA, via Wikimedia Commons', caption: 'A knobkerrie (iwisa) — the traditional Nguni club carried alongside fighting sticks' },
    ],
    videos: [
      { youtubeId: 'sH5bkHqjXhk', title: 'Fighting Sticks — Zulu stick fighting documentary (SABC, 1983)', channel: 'Martial Arts with Colman' },
      { youtubeId: 'CgHzSXfVS9M', title: 'Modern Day Zulu Warriors: Stick-Fighting Masters', channel: 'Wonder' },
    ],
    links: [{ label: 'Wikipedia — Nguni stick-fighting', url: 'https://en.wikipedia.org/wiki/Nguni_stick-fighting' }],
  },
  {
    id: 'engolo',
    wing: 'africa',
    code: 'AMA-006',
    name: 'Engolo → Capoeira',
    alt: 'N’golo, the ‘zebra dance’ → jogo de angola',
    country: 'Angola → Brazil',
    region: 'Central Africa · Diaspora',
    people: 'Nkhumbi/Bantu, Cunene River → Afro-Brazilians',
    form: 'Hybrid / Acrobatic',
    era: 'pre-10th century — global today',
    glyph: 'invertKick',
    pose: 'inverted',
    wikiSlug: 'Engolo',
    lede: 'The inverted art: kicks thrown from handstands to draw power from the ancestral world — carried across the Middle Passage to become capoeira.',
    history:
      'Along Angola’s Cunene River, pastoral communities developed engolo — a circle game of inverted kicks, sweeps, and evasions, tied to a Kongo-influenced cosmology in which the ancestral realm mirrors ours upside down. Enslaved Central Africans, including Mbundu people of the Kingdom of Ndongo, carried the art to Brazil, where it evolved into capoeira. The lineage was reconnected publicly in the 1950s when Angolan artist Albano Neves e Sousa recognized engolo in the capoeira of Bahia; scholarship by T.J. Desch-Obi and others has since mapped the technical continuity in detail.',
    technique:
      'Engolo’s core vocabulary — crescent kicks, push kicks, sweeps, cartwheels, handstand kicks, deceptive evasion instead of blocking — passes almost intact into capoeira, including signatures like the meia lua de compasso, rasteira, and scorpion kick. In the 20th century capoeira split into Capoeira Angola (traditional, ritual-forward) and Capoeira Regional (Mestre Bimba’s codified fighting reform).',
    ritual:
      'Played in a circle to music, song, and handclaps — in Angola linked to the efiko initiation celebrations; in Brazil the roda, berimbau, and ladainha carry the ceremony. Under slavery and later criminalization, the game’s disguise-as-dance was survival itself. The capoeira circle was inscribed by UNESCO as Intangible Cultural Heritage in 2014.',
    masters: [
      { name: 'Mestre Pastinha', note: 'Codified and championed Capoeira Angola, guarding the art’s African identity.', wikiSlug: 'Mestre_Pastinha' },
      { name: 'Mestre Bimba', note: 'Created Capoeira Regional in the 1930s, winning capoeira legal legitimacy in Brazil.', wikiSlug: 'Mestre_Bimba' },
      { name: 'Albano Neves e Sousa', note: 'The painter whose Angolan fieldwork reconnected capoeira to engolo.' },
    ],
    diaspora: 'The clearest documented origin→diaspora arc in world martial arts: Cunene → Ndongo → Bahia → the world. Sister arts include danmyé (Martinique), mani (Cuba), and ‘knocking and kicking’ (US South).',
    sources: [
      'Desch-Obi, Fighting for Honor (USC Press, 2008)',
      'Martial Arts Studies — ‘Engolo and Capoeira’ (Cardiff UP)',
      'Neves e Sousa drawings; capoeirahistory.com',
    ],
    images: [
      { url: 'https://upload.wikimedia.org/wikipedia/commons/9/92/Jogar_capo%C3%ABra_ou_danse_de_la_guerre.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:Jogar_capo%C3%ABra_ou_danse_de_la_guerre.jpg', license: 'Public domain', attribution: 'Johann Moritz Rugendas, via Wikimedia Commons', caption: '‘Jogar Capoëra ou danse de la guerre’ (c. 1835) — the most famous early depiction of capoeira in Brazil' },
      { url: 'https://upload.wikimedia.org/wikipedia/commons/6/66/Engolo-Angola.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:Engolo-Angola.jpg', license: 'CC BY-SA 4.0', attribution: 'Matthias Röhrig Assunção, via Wikimedia Commons', caption: 'Men playing engolo in Angola — the left player throws a high crescent kick' },
      { url: 'https://upload.wikimedia.org/wikipedia/commons/9/97/Engolo-rasteira.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:Engolo-rasteira.jpg', license: 'CC BY-SA 4.0', attribution: 'Matthias Röhrig Assunção, via Wikimedia Commons', caption: 'Angelino Tchimbundo demonstrates an engolo sweep on Mestre Cobra Mansa, Angola, 2011' },
      { url: 'https://upload.wikimedia.org/wikipedia/commons/9/9e/Mestre_Pastinha_bw.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:Mestre_Pastinha_bw.jpg', license: 'Public domain', attribution: 'Wikimedia Commons', caption: 'Mestre Pastinha — the great guardian of Capoeira Angola in Salvador, Bahia' },
      { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/cc/Roda_de_Capoeira_dos_Mestres_veteranos.jpg/1280px-Roda_de_Capoeira_dos_Mestres_veteranos.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:Roda_de_Capoeira_dos_Mestres_veteranos.jpg', license: 'CC BY-SA 2.0', attribution: 'Turismo Bahia (Rita Barreto / Setur), via Wikimedia Commons', caption: 'Roda de capoeira of veteran mestres, Bahia, 2012' },
      { url: 'https://upload.wikimedia.org/wikipedia/commons/9/97/Capoeira-three-berimbau-one-pandeiro.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:Capoeira-three-berimbau-one-pandeiro.jpg', license: 'CC BY-SA 3.0', attribution: 'Sam Fentress, via Wikimedia Commons', caption: 'Three berimbaus and a pandeiro lead the rhythm of a capoeira roda' },
    ],
    videos: [
      { youtubeId: 'HE9Ps1_13Sg', title: 'The story of Capoeira: From Angola to Brazil', channel: 'BBC News Africa' },
      { youtubeId: 'e2BNDDMA7Pk', title: 'Body Games: Capoeira and Ancestry — engolo & capoeira’s Angolan roots', channel: 'Capoeirahistory' },
      { youtubeId: 'Vhgot9H7vZw', title: 'Capoeira circle — official UNESCO inscription film (2014)', channel: 'UNESCO' },
    ],
    links: [{ label: 'UNESCO ICH — Capoeira circle (inscribed 2014)', url: 'https://ich.unesco.org/en/RL/capoeira-circle-00892' }],
  },
  {
    id: 'istunka',
    wing: 'africa',
    code: 'AMA-007',
    name: 'Istunka',
    alt: 'isgaraac · Somali stick tournament',
    country: 'Somalia',
    region: 'East Africa',
    people: 'Afgooye communities, Shabelle Valley',
    form: 'Weapon',
    era: 'Ajuran era (13th–17th c.) — annual today',
    glyph: 'crossSticks',
    pose: 'twinSticks',
    wikiSlug: 'Istunka',
    lede: 'A river divides the town; once a year its two banks meet in ritual battle — a New Year tournament first staged by medieval sultans.',
    history:
      'Developed during the Ajuran Sultanate and centralized in the 19th century under the Geledi Sultanate’s Sultan Ahmed Yusuf, Istunka is fought each Somali New Year at Afgooye. Originally waged in full war gear with axes, swords, and daggers, the tournament long ago traded blades for heavy sticks — with each side backed by its own assembly of poets, singers, and dance troupes.',
    technique:
      'Team-against-team mock combat between the river’s east and west banks. Fighters carry two large sticks for offense and defense, plus a cloth or blanket in the lead hand for distraction. Points reward clean strikes to head, body, arms, and shoulders — speed and timing over brute force.',
    ritual:
      'Bound to Dabshid, the New Year fire festival: three days of shirib song, marches to the Sultan’s home, bonfire leaping, and — by tradition — the belief that failing to stage the tournament invites drought and misfortune. It ends with the two sides embracing at the elders’ word.',
    masters: [
      { name: 'Sultanate institution', note: 'Institutionalized by the Geledi state as a civic tournament rather than founded by an individual.' },
    ],
    diaspora: 'One of the three great stick-combat poles of the continent, with Tahtib to the north and Nguni fighting to the south.',
    sources: [
      'Istunka Festival ethnography (Heegan, 1984; academia.edu)',
      'Traditional-sports documentation of rules and format',
    ],
    images: [
      { url: 'https://upload.wikimedia.org/wikipedia/commons/b/b1/Istunka_Afgoye.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:Istunka_Afgoye.jpg', license: 'CC BY-SA 4.0', attribution: 'E. H. M. Clifford, via Wikimedia Commons', caption: 'Historical photograph of Somalis engaging in Istunka mock combat at Afgooye' },
    ],
    videos: [
      { youtubeId: 'q6huI8cHm60', title: 'Istunka Afgooye — Somali stick fighting', channel: 'KOMBATPedia' },
    ],
    links: [{ label: 'Wikipedia — Istunka (the Afgooye New-Year tournament)', url: 'https://en.wikipedia.org/wiki/Istunka' }],
  },
  {
    id: 'donga',
    wing: 'africa',
    code: 'AMA-008',
    name: 'Donga',
    alt: 'sagenai · zagne — Suri stick dueling',
    country: 'Ethiopia',
    region: 'East Africa',
    people: 'Suri (Surma) & Mursi, Omo Valley',
    form: 'Weapon',
    era: 'living tradition, post-harvest seasons',
    glyph: 'crossSticks',
    pose: 'overheadPole',
    wikiSlug: 'Donga_stick_fighting',
    lede: 'Called the fiercest contest on the continent: hardwood poles, painted bodies, and courtship by courage in the Omo Valley.',
    history:
      'Among the Suri and their cultural kin the Mursi, stick dueling is the central public institution of young manhood — held after the harvest (roughly August–December) whenever elders announce it, drawing whole villages and sometimes hundreds of fighters to a clearing.',
    technique:
      'One-on-one dueling with long hardwood donga poles through knockout rounds (zagne) until two finalists remain. Striking a downed man is strictly forbidden; referees enforce the code. Fighters purge the day before with dokai — a bark-and-water preparation — and fast until the match.',
    ritual:
      'As much courtship as combat: fighters paint their bodies with white clay, don headdresses, and arrive dancing, carrying their strongest man — displaying courage, endurance, and beauty before the watching women. The duels also channel inter-village tension into a rule-bound arena.',
    masters: [
      { name: 'Elder-governed tradition', note: 'Announced, supervised, and adjudicated by community elders; no individual founder.' },
    ],
    diaspora: 'The eastern pole of Africa’s stick-combat continuum; frequently compared with Nguni fighting for its rite-of-passage role.',
    sources: [
      'Ethnographic accounts of Suri sagenai (Abbink et al.)',
      'Field photography — Lafforgue; Omo Valley documentation',
    ],
    images: [
      { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d9/Stick_Fighting_Wounds%2C_Suri_Tribe_%2810326088433%29.jpg/1280px-Stick_Fighting_Wounds%2C_Suri_Tribe_%2810326088433%29.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:Stick_Fighting_Wounds,_Suri_Tribe_(10326088433).jpg', license: 'CC BY-SA 2.0', attribution: 'Rod Waddington, via Wikimedia Commons', caption: 'Scars from donga stick fighting worn as marks of honour — Suri tribe, Omo Valley' },
      { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/16/Suri_Warrior%2C_Ethiopia_%2810813154806%29.jpg/1280px-Suri_Warrior%2C_Ethiopia_%2810813154806%29.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:Suri_Warrior,_Ethiopia_(10813154806).jpg', license: 'CC BY-SA 2.0', attribution: 'Rod Waddington, via Wikimedia Commons', caption: 'Suri warrior, Omo Valley — young men build status through donga dueling' },
      { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ac/Suri_Tribe%2C_Kibbish%2C_Ethiopia_%289704780443%29.jpg/1280px-Suri_Tribe%2C_Kibbish%2C_Ethiopia_%289704780443%29.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:Suri_Tribe,_Kibbish,_Ethiopia_(9704780443).jpg', license: 'CC BY-SA 2.0', attribution: 'Rod Waddington, via Wikimedia Commons', caption: 'Suri community at Kibbish, in the Ethiopian homeland of donga stick dueling' },
    ],
    videos: [
      { youtubeId: 'AIdlz55Aaho', title: 'Stick Fighting Festival | Tribe', channel: 'BBC Studios' },
      { youtubeId: 'AosQi3MUv9Q', title: 'Bruce Parry Experiences the Stick Fighting Festival | Tribe', channel: 'BBC Studios' },
    ],
    links: [{ label: 'Wikipedia — Suri people: stick fighting (sagine/donga)', url: 'https://en.wikipedia.org/wiki/Suri_people' }],
  },
  {
    id: 'musangwe',
    wing: 'africa',
    code: 'AMA-009',
    name: 'Musangwe',
    alt: 'Venda bare-knuckle boxing',
    country: 'South Africa',
    region: 'Southern Africa',
    people: 'Venda, Limpopo Province',
    form: 'Striking',
    era: 'c. 1829 — every Christmas season since',
    glyph: 'openHand',
    pose: 'crossPunch',
    wikiSlug: 'Musangwe',
    lede: 'Born from herd boys mimicking their fighting bulls: a fist-forged rite of passage where no money changes hands — only respect.',
    history:
      'Tradition dates Musangwe to around 1829 at the Tshifudi grounds: cattle-herding boys watched their bulls clash, and the sparring spilled into the boys themselves. Every Christmas season since, Venda men and boys have gathered in Limpopo’s summer heat to test themselves — a custom its custodians are now fighting to preserve and fund.',
    technique:
      'Bare fists, no protection, no time limit. Punches, headbutts, knees, and clinch work are legal; striking a downed opponent is not — the bout pauses until he rises. Raising both hands ends the fight in surrender. The word musangwe itself carries the sense of ‘to test.’',
    ritual:
      'A rite of passage beginning as young as nine, meant to forge bravery, discipline, and identity — explicitly framed by the community as an alternative to crime and a school of self-mastery. Victory pays nothing; the reward is standing.',
    masters: [
      { name: 'Frans Malala', note: 'The tradition’s most legendary fighter — remembered for one-punch finishing power.' },
      { name: 'Tshilidzi ‘Poison’ Ndevana', note: 'Former champion, schoolteacher, and the tradition’s modern custodian and committee president.' },
    ],
    diaspora: 'Documented by National Geographic and international photojournalists as one of Africa’s great living fist traditions.',
    sources: [
      'National Geographic — ‘Boys Box Their Way to Manhood’',
      'Brent Stirton photo essays; Anadolu Agency reporting',
    ],
    images: [
      { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e4/Venda_dancers%2C_Mashovhela_Bush_Lodge%2C_Louis_Trichardt%2C_Limpopo%2C_South_Africa_%2810185242894%29.jpg/1280px-Venda_dancers%2C_Mashovhela_Bush_Lodge%2C_Louis_Trichardt%2C_Limpopo%2C_South_Africa_%2810185242894%29.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:Venda_dancers,_Mashovhela_Bush_Lodge,_Louis_Trichardt,_Limpopo,_South_Africa_(10185242894).jpg', license: 'CC BY 2.0', attribution: 'South African Tourism, via Wikimedia Commons', caption: 'Venda dancers in Limpopo — cultural context for the community that practises musangwe' },
      { url: 'https://upload.wikimedia.org/wikipedia/commons/8/8c/The_Venda_people%27s_Mbilwe_village_on_a_rising_slope_as_photographed_in_1920s.png', pageUrl: 'https://commons.wikimedia.org/wiki/File:The_Venda_people%27s_Mbilwe_village_on_a_rising_slope_as_photographed_in_1920s.png', license: 'Public domain', attribution: 'Alfred Martin Duggan-Cronin, via Wikimedia Commons', caption: 'The Venda people’s Mbilwe village in the 1920s — the Limpopo homeland of musangwe' },
    ],
    videos: [
      { youtubeId: 'mhIYBNaaQFw', title: 'Musangwe Fight Club: A Vicious Tradition', channel: 'The New York Times' },
      { youtubeId: '3NM-Q6JxdsA', title: 'South African tribe fights to keep custom alive', channel: 'Al Jazeera English' },
      { youtubeId: 'TUDgVSe0Xtk', title: 'Venda traditional fist-fighting competition', channel: 'SABC News' },
    ],
    links: [{ label: 'National Geographic — Boys Box Their Way to Manhood', url: 'https://www.nationalgeographic.com/photography/article/venda-boxing-musangwe-south-africa' }],
  },
  {
    id: 'evala',
    wing: 'africa',
    code: 'AMA-010',
    name: 'Evala',
    alt: 'Kabiye initiation wrestling',
    country: 'Togo',
    region: 'West Africa',
    people: 'Kabiye, Kara region',
    form: 'Grappling',
    era: 'ancestral — every July',
    glyph: 'grapplRing',
    pose: 'collarClinch',
    wikiSlug: 'Evala',
    lede: 'A week of mountain trials, then the wrestling that makes ‘new men’ — no Kabiye boy fully belongs until he has fought his evala.',
    history:
      'The central male initiation of the Kabiye people of northern Togo, held each July around Kara. Oral tradition says evala descends from an older baton-dueling sport — until two fighters dropped their sticks and grappled, and the art became wrestling. Now practiced across a dozen-plus districts, it draws spectators from across the country.',
    technique:
      'Wrestling to put an opponent’s back, shoulders, or waist to the ground, arbitrated by elders. The bouts cap a week of trials: isolation from family, dawn mountain climbs (three peaks), fasting, abstinence, and symbolic tests of endurance.',
    ritual:
      'Kabiye efalu means ‘new men.’ Initiates pass through the rite repeatedly across several years, beginning in their mid-teens; a man who shirks it faces social exclusion. Sacrifices and prayers to ancestors and local deities frame every stage — the wrestling is the visible summit of a deeper spiritual passage.',
    masters: [
      { name: 'Council of elders', note: 'The wise men of each district manage, referee, and sanctify the tournaments.' },
    ],
    diaspora: 'A signature example of African wrestling as initiation technology — combat as the doorway to adulthood.',
    sources: [
      'bird story agency & field reporting from Kara (2025)',
      'Traditional-sports and cultural-heritage documentation of the rite',
    ],
    images: [
      { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/88/Evala_2023_lutte_pr%C3%A9liminaires_3.jpg/1280px-Evala_2023_lutte_pr%C3%A9liminaires_3.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:Evala_2023_lutte_pr%C3%A9liminaires_3.jpg', license: 'CC BY-SA 4.0', attribution: 'Hermannkass, via Wikimedia Commons', caption: 'Preliminary Evala bouts at La Feing, Kara region (2023)' },
      { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/32/Evala_2023_finale_de_lassa.jpg/1280px-Evala_2023_finale_de_lassa.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:Evala_2023_finale_de_lassa.jpg', license: 'CC BY-SA 4.0', attribution: 'Hermannkass, via Wikimedia Commons', caption: 'Final of the Evala wrestling contests at Lassa (2023)' },
      { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/19/Evala_2023_Lama_5.jpg/1280px-Evala_2023_Lama_5.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:Evala_2023_Lama_5.jpg', license: 'CC BY-SA 4.0', attribution: 'Hermannkass, via Wikimedia Commons', caption: 'Evala quarter-final at Lama-Feing, Kara (2023)' },
      { url: 'https://upload.wikimedia.org/wikipedia/commons/f/f7/Lutte_traditionnelle_d%C3%A9nomm%C3%A9e_Evala_en_pays_Kaby%C3%A8_au_Togo.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:Lutte_traditionnelle_d%C3%A9nomm%C3%A9e_Evala_en_pays_Kaby%C3%A8_au_Togo.jpg', license: 'CC BY-SA 4.0', attribution: 'Charles Dark, via Wikimedia Commons', caption: 'Evala traditional wrestling in Kabiye country, northern Togo' },
    ],
    videos: [
      { youtubeId: '-oHZWYPrMWc', title: 'Togo: rite de passage', channel: 'TV5MONDE Info' },
      { youtubeId: 'lUBe2ozpW5Y', title: 'Togo: les luttes traditionnelles Évala', channel: 'New World TV' },
    ],
    links: [{ label: 'Africanews — Evala, wrestling as a rite of passage in Togo', url: 'https://www.africanews.com/2024/07/17/evala-wrestling-as-a-rite-of-passage-in-togo/' }],
  },
  {
    id: 'moraingy',
    wing: 'africa',
    code: 'AMA-011',
    name: 'Moraingy',
    alt: 'morengy · moringue · mrengé',
    country: 'Madagascar → Indian Ocean islands',
    region: 'Indian Ocean Africa',
    people: 'Sakalava; now island-wide',
    form: 'Striking',
    era: '17th century — seeking recognition today',
    glyph: 'openHand',
    pose: 'crossPunch',
    wikiSlug: 'Moraingy',
    lede: 'Bare-fisted fighting judged by the crowd itself, fought to trance-inducing drums — Madagascar’s warrior art now spread across the Indian Ocean.',
    history:
      'Emerging by the 17th century on Madagascar’s west coast among the Sakalava, moraingy served as training for royal warriors and as festival contest. It traveled with migration and the slave trade to Réunion (as moringue), the Comoros (mrengé), Mayotte, and beyond — and is today the subject of a national push for formal recognition.',
    technique:
      'Bare-fisted punches and kicks in short, explosive rounds called karapaka. Hair-pulling, scratching, and strikes to forbidden targets are banned; nearly everything else is permitted. There is no clock and often no declared winner — the crowd’s clamor decides when a fight is finished.',
    ritual:
      'Embodies fihavanana — Malagasy solidarity. Fighters (fagnorolahy, and now women, fagnorovavy) enter to repetitive, trance-driving rhythms; matches anchor festivals and public holidays, and champions carry village prestige.',
    masters: [
      { name: 'Regional training camps', note: 'Northern centers (e.g., around Antsiranana) drive the modern competitive scene and recognition campaign.' },
    ],
    diaspora: 'Its island-hopping spread mirrors the Atlantic diaspora arts — a second, Indian-Ocean corridor of African martial migration.',
    sources: [
      'AFP reporting on the recognition campaign (2025)',
      'Fuma & Dreinaza, Le moring, art guerrier (Réunion scholarship)',
    ],
    images: [
      { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6e/Moraingy_fighting_Madagascar_sport.jpg/1280px-Moraingy_fighting_Madagascar_sport.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:Moraingy_fighting_Madagascar_sport.jpg', license: 'CC BY-SA 2.0', attribution: 'Hery Zo Rakotondramanana, via Wikimedia Commons', caption: 'Moraingy bout in progress — Madagascar’s traditional bare-fist fighting sport' },
      { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0e/Moraingy%2C_even_ladies_go_for_a_fight.jpg/1280px-Moraingy%2C_even_ladies_go_for_a_fight.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:Moraingy,_even_ladies_go_for_a_fight.jpg', license: 'CC BY-SA 2.0', attribution: 'Hery Zo Rakotondramanana, via Wikimedia Commons', caption: 'Women fighting in a moraingy battle — fagnorovavy now share the ring' },
      { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/02/Moringue_in_R%C3%A9union.jpg/1280px-Moringue_in_R%C3%A9union.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:Moringue_in_R%C3%A9union.jpg', license: 'CC0', attribution: 'ironaxia, via Wikimedia Commons', caption: 'Moringue — the Réunion Island descendant carried across the ocean by Malagasy communities' },
      { url: 'https://upload.wikimedia.org/wikipedia/commons/8/88/Moring4.JPG', pageUrl: 'https://commons.wikimedia.org/wiki/File:Moring4.JPG', license: 'CC BY 3.0', attribution: 'ReporterIndpdt, via Wikimedia Commons', caption: 'Moring demonstration on the beach at Saint-Pierre, Réunion' },
    ],
    videos: [
      { youtubeId: '9xYuvg1UsZA', title: 'Madagascar’s ancient martial art Moraingy goes national', channel: 'DRM News' },
      { youtubeId: 'UsAhrsgUsOU', title: 'From Tradition to Trend: The Rise of Moraingy in Madagascar', channel: 'Sports Insider by DRM' },
    ],
    links: [{ label: 'AFP/SCMP — Madagascar’s moraingy seeks recognition', url: 'https://www.scmp.com/lifestyle/entertainment/article/3305482/martial-art-youve-probably-never-heard-madagascars-moraingy-seeks-recognition' }],
  },
  {
    id: 'gidigbo',
    wing: 'africa',
    code: 'AMA-012',
    name: 'Gidigbo',
    alt: 'ijakadi · Yoruba wrestling & warrior arts',
    country: 'Nigeria',
    region: 'West Africa',
    people: 'Yoruba, southwestern Nigeria',
    form: 'Grappling',
    era: 'ancestral — feeding modern champions',
    glyph: 'grapplRing',
    pose: 'collarClinch',
    wikiSlug: 'Yoruba_traditional_wrestling',
    lede: 'Wrestling staged in honor of Ogun, god of iron — the umbrella of Yoruba fighting knowledge, from the circle throw to the hunter’s secret arts.',
    history:
      'Gidigbo names both the Yoruba wrestling game and, more broadly, the umbrella of Yoruba martial knowledge — grappling foremost, with striking and machete sub-disciplines recorded by practitioners and researchers. Matches have long been staged at festivals and social functions, and the tradition sits within Nigeria’s larger wrestling triangle beside Hausa kokawa and Igbo mgba.',
    technique:
      'A win requires bringing an opponent’s back, shoulders, or waist to the ground. The art prizes balance, timing, and fine control; striking is barred in the wrestling form and undisciplined aggression is frowned on. Elders or designated referees settle all disputes.',
    ritual:
      'Matches are traditionally held in honor of Ogun, the orisha of iron and war, in a drawn circle. Within Ifa spiritual tradition, the art links aki (bravery) to akin (the brave man) — combat as character formation. Modern Yoruba wrestlers have carried these foundations to national and Commonwealth competition.',
    masters: [
      { name: 'Elders & Ifa lineages', note: 'Community and priestly transmission; hunters (ode) historically kept deeper combat knowledge (awo).' },
    ],
    diaspora: 'Yoruba religious culture is itself a diaspora superhighway — the ritual frame around gidigbo traveled with Ifa, Santería, and Candomblé across the Atlantic.',
    sources: [
      'Practitioner ethnography (Yoruba martial arts field accounts)',
      'Nigerian wrestling documentation — NWF-era crossover athletes',
    ],
    images: [
      { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5f/Winner_in_a_wrestling_bout.jpg/1280px-Winner_in_a_wrestling_bout.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:Winner_in_a_wrestling_bout.jpg', license: 'CC BY-SA 4.0', attribution: 'Nellydieli, via Wikimedia Commons', caption: 'Related tradition: winner of an Ikwerre wrestling match, Rivers State — Nigeria’s wider wrestling family' },
      { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/61/Wrestlers_locked_in_action.jpg/1280px-Wrestlers_locked_in_action.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:Wrestlers_locked_in_action.jpg', license: 'CC BY-SA 4.0', attribution: 'Nellydieli, via Wikimedia Commons', caption: 'Related tradition: wrestlers locked in an Egelege match under a referee’s eye, Port Harcourt' },
      { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/61/Musicians_of_the_traditional_%C6%98auraye_wrestling_3.jpg/1280px-Musicians_of_the_traditional_%C6%98auraye_wrestling_3.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:Musicians_of_the_traditional_%C6%98auraye_wrestling_3.jpg', license: 'CC BY-SA 4.0', attribution: 'M Bash Ne, via Wikimedia Commons', caption: 'Musicians of traditional Dauraye wrestling — drumming is integral to Nigerian wrestling, as in gidigbo' },
      { url: 'https://upload.wikimedia.org/wikipedia/commons/d/db/A_sculptural_representation_of_traditional_wrestlers.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:A_sculptural_representation_of_traditional_wrestlers.jpg', license: 'CC BY-SA 4.0', attribution: 'Harriwillz, via Wikimedia Commons', caption: 'A sculptural monument to traditional Nigerian wrestlers' },
    ],
    videos: [
      { youtubeId: 'CaKB32K6oWI', title: 'GÍDÍGBÒ: A brief lesson on the traditional Yorùbá martial art', channel: 'Bàjúláyé' },
      { youtubeId: 'WZx9bXHZpy4', title: 'African martial arts: Ijakadi/Gidigbo of the Yoruba', channel: 'Mukhanda International' },
    ],
    links: [{ label: 'UNESCO ICM martial-arts library — Gidigbo', url: 'https://www.unescoicm.org/eng/library/global_martialarts.php?ptype=view&idx=7181&page=1&code=global_martialarts_eng' }],
  },
  {
    id: 'luttetraditionnelle',
    wing: 'africa',
    code: 'AMA-013',
    name: 'Lutte Traditionnelle',
    alt: 'Kokowa · lutte africaine — the West African wrestling family',
    country: 'Niger · Burkina Faso · Mali · Guinea · Benin · The Gambia',
    region: 'West Africa',
    people: 'Hausa, Zarma-Songhai, Fulani, Kanuri, Mandinka, Mossi, Bariba and other Sahelian peoples',
    form: 'Grappling',
    era: 'precolonial villages — national championships from 1975',
    glyph: 'throwArc',
    pose: 'throwLift',
    wikiSlug: 'Lutte_Traditionnelle',
    lede: 'From Niamey to Bamako the dust of the post-harvest village square has been rebuilt as a national arena, where the man who puts his rival’s back into the sand is crowned king.',
    history:
      'Across the Sahel and savanna belt, wrestling after the harvest was a village institution long before colonial borders. Twentieth-century states then codified it. Niger institutionalised the Sabre National in 1975 under Seyni Kountché’s government, which wanted a prestige sport that was demonstrably Nigerien rather than imported; the championship has since rotated annually among the eight regional capitals. Comparable federations and national championships followed in Burkina Faso, Mali, Guinea, Benin and The Gambia, and a coordinating body now runs a continental African championship linking them.',
    technique:
      'Bouts are fought upright inside a sand circle roughly six metres across, in weight categories and usually over three short rounds. There is no striking in the regional format — the Senegalese variant that permits punching is treated as a separate discipline. Victory comes from putting the opponent down (back, both knees, or hands to the sand) or forcing him out of the ring. Wrestlers work from collar-and-arm ties into leg hooks, hip throws and sweeps, and matches are often decided in a few explosive seconds after long, patient circling.',
    ritual:
      'The season follows the harvest, and the arena keeps the village frame. Drummers and praise-singers announce each wrestler by name and lineage while he dances the ring. Marabouts and charm-makers attend, and amulets, ritual washing and protective preparations are openly part of the spectacle rather than hidden from it. In Niger the Sabre National is a state occasion: the champion receives a sabre, takes the title ‘king of the arena’, and the tournament is deliberately staged as a rite of national cohesion.',
    masters: [
      { name: 'Issaka Issaka', note: 'Wrestler from Gaya, Dosso region, Niger — record six Sabre National titles between 2015 and 2023; widely called the roi des arènes.' },
      { name: 'Abba Ibrahim', note: 'Niamey wrestler who won the 45th Sabre National at Dosso in 2024, denying Issaka Issaka a seventh title.' },
      { name: 'The Sabre National (Niger)', note: 'Institutional lineage rather than an individual: established 1975, the codified core of the regional family and the model other national federations followed.' },
    ],
    diaspora: 'The family travels abroad mainly through its Senegalese branch, whose Laamb promotions have filled venues in Paris and New York. Nigerien and Malian communities in France and Côte d’Ivoire stage smaller bouts at community festivals, and the continental African championship gives federation wrestlers a formal circuit — though documented diaspora practice outside the Senegalese scene remains thin.',
    sources: [
      'AFP / France 24 — ‘Niger celebrates unity in the wrestling arena’ (Jan 2024), on the 44th Sabre National at Agadez',
      'Agence Nigérienne de Presse — Sabre National palmarès, incl. ‘Kokowa Tahoua 2025’ (46th edition)',
      'Survey of the West African folk-wrestling family and its national variants (Laamb, Kokawa, Evala)',
    ],
    images: [
      { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/63/La_lutte_traditionnelle_au_Niger_07.jpg/1280px-La_lutte_traditionnelle_au_Niger_07.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:La_lutte_traditionnelle_au_Niger_07.jpg', license: 'CC BY-SA 4.0', attribution: 'Doultraf, via Wikimedia Commons', caption: 'Traditional wrestling in Niger, documented for Wiki Loves Africa' },
      { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/56/La_lutte_traditionnelle_au_Niger_12.jpg/1280px-La_lutte_traditionnelle_au_Niger_12.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:La_lutte_traditionnelle_au_Niger_12.jpg', license: 'CC BY-SA 4.0', attribution: 'Doultraf, via Wikimedia Commons', caption: 'Wrestlers engaged in a bout, Niger' },
      { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a3/La_lutte_traditionnelle_au_Niger_18.jpg/1280px-La_lutte_traditionnelle_au_Niger_18.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:La_lutte_traditionnelle_au_Niger_18.jpg', license: 'CC BY-SA 4.0', attribution: 'Doultraf, via Wikimedia Commons', caption: 'The wrestling ground and its crowd, Niger' },
      { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7b/La_lutte_traditionnelle_au_Niger_09.jpg/1280px-La_lutte_traditionnelle_au_Niger_09.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:La_lutte_traditionnelle_au_Niger_09.jpg', license: 'CC BY-SA 4.0', attribution: 'Doultraf, via Wikimedia Commons', caption: 'Grappling in the sand ring, Niger' },
      { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d9/La_lutte_traditionnelle_au_Niger_17.jpg/1280px-La_lutte_traditionnelle_au_Niger_17.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:La_lutte_traditionnelle_au_Niger_17.jpg', license: 'CC BY-SA 4.0', attribution: 'Doultraf, via Wikimedia Commons', caption: 'Wrestlers and attendants at a lutte traditionnelle gathering, Niger' },
    ],
    videos: [
      { youtubeId: 'lg2ItXYbY8c', title: '46th edition of the Sabre National — Tahoua 2025', channel: 'RTN — Radio Télévision du Niger' },
      { youtubeId: '86ldeKPpcdw', title: 'Wrestling with Reality (the Senegalese Laamb branch)', channel: 'Al Jazeera English' },
    ],
    links: [{ label: 'France 24 / AFP — Niger celebrates unity in the wrestling arena', url: 'https://www.france24.com/en/live-news/20240102-niger-celebrates-unity-in-the-wrestling-arena' }],
  },
  {
    id: 'kokawa',
    wing: 'africa',
    code: 'AMA-014',
    name: 'Kokawa',
    alt: 'Kokowa · Hausa traditional wrestling',
    country: 'Nigeria · Niger',
    region: 'West Africa',
    people: 'Hausa (and, in Niger’s codified arena, Zarma-Songhai and others)',
    form: 'Grappling',
    era: 'precolonial Hausaland — standardised mid-20th century',
    glyph: 'grapplRing',
    pose: 'collarClinch',
    lede: 'The grappling half of the Hausa fighting inheritance — where Dambe kept the fists, Kokawa kept the sand, the drums and the throw.',
    history:
      'Kokawa is the wrestling of Hausaland, practised across the Hausa-speaking belt of northern Nigeria and southern Niger. In its village form it belonged to the post-harvest season, when reputed wrestlers travelled between settlements with musicians, praise-singers and marabouts in tow, fighting for honour and gifts. Under twentieth-century codification the Hausa combat inheritance split in two: the striking component was hived off into a separate boxing event, Dambe, while Kokawa was standardised to the wider West African wrestling format of rings, weight classes and timed rounds. In Niger it became the national sport, contested annually for the Sabre National.',
    technique:
      'Wrestling is from a standing position and there is no striking. Competitors work inside a sand circle about six metres across whose boundary they must not cross, in weight categories usually spanning roughly 40 to 100 kilograms, over about three short rounds. Grips are taken on the arms, neck and waist wrapper; the object is a decisive throw or takedown that puts the opponent’s back, knees or hands into the sand. Strong controlling holds, hip and shoulder throws and leg trips predominate, and bouts are won on a single clean fall.',
    ritual:
      'The whole community turns out, and the frame is as ceremonial as it is athletic. Drummers and praise-singers work the ring, calling wrestlers by name and lineage and lifting the crowd between falls; victory is answered with song. Marabouts and charm-makers attend, and protective amulets are accepted apparatus rather than something concealed. Bouts are traditionally staged after the harvest, and in Hausa practice a young man’s standing in the ring has long carried directly into his marriage prospects.',
    masters: [
      { name: 'The Sabre National (Niger)', note: 'Institutional home of codified Kokawa since 1975; recent editions are billed in Hausa as Kokowa (e.g. ‘Kokowa Tahoua 2025’).' },
      { name: 'Issaka Issaka', note: 'Nigerien wrestler from the Dosso region; record six national titles between 2015 and 2023 — the most decorated figure of the codified arena.' },
    ],
    diaspora: 'Kokawa travels with Hausa migration across the Sahel — communities in Ghana, Chad, Cameroon and Sudan maintain informal wrestling alongside Dambe. Visibility outside Africa is minimal and rides largely on Dambe’s internet-driven exposure rather than on Kokawa’s own account; no overseas federation or ranking is documented.',
    sources: [
      'Traditional Sports — ‘Kokowa or Kokawa (Niger)’: the six-metre ring, weight categories and post-harvest frame',
      'Agence Nigérienne de Presse & Le Sahel — Sabre National coverage, incl. the 46th edition billed as Kokowa',
      'Survey material recording that the striking component was separated off into Dambe',
    ],
    images: [
      { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/21/The_%C6%98auraye_are_wrestling.jpg/1280px-The_%C6%98auraye_are_wrestling.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:The_%C6%98auraye_are_wrestling.jpg', license: 'CC BY-SA 4.0', attribution: 'M Bash Ne, via Wikimedia Commons', caption: 'Traditional wrestling in a Hausa community, northern Nigeria' },
      { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/bc/The_%C6%98auraye_are_wrestling_3.jpg/1280px-The_%C6%98auraye_are_wrestling_3.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:The_%C6%98auraye_are_wrestling_3.jpg', license: 'CC BY-SA 4.0', attribution: 'M Bash Ne, via Wikimedia Commons', caption: 'Wrestlers locked up in a standing grip, Hausa community' },
      { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/12/The_%C6%98auraye_are_wrestling_5.jpg/1280px-The_%C6%98auraye_are_wrestling_5.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:The_%C6%98auraye_are_wrestling_5.jpg', license: 'CC BY-SA 4.0', attribution: 'M Bash Ne, via Wikimedia Commons', caption: 'A bout in progress before a village crowd, northern Nigeria' },
      { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/be/Musicians_of_the_traditional_%C6%98auraye_wrestling_2.jpg/1280px-Musicians_of_the_traditional_%C6%98auraye_wrestling_2.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:Musicians_of_the_traditional_%C6%98auraye_wrestling_2.jpg', license: 'CC BY-SA 4.0', attribution: 'M Bash Ne, via Wikimedia Commons', caption: 'Drummers and praise-musicians — the musical frame is inseparable from the contest' },
    ],
    videos: [
      { youtubeId: 'M6ACMKPAn_4', title: 'From Dambe to Kokawa — traditional boxing and wrestling, Abuja', channel: 'Dambe Unlimited' },
      { youtubeId: 'lg2ItXYbY8c', title: '46th edition of the Sabre National — Tahoua 2025', channel: 'RTN — Radio Télévision du Niger' },
    ],
    links: [{ label: 'Traditional Sports — Kokowa / Kokawa', url: 'https://www.traditionalsports.org/traditional-sports/africa/kokowa-or-kokawa-nigeria.html' }],
  },
  {
    id: 'mgba',
    wing: 'africa',
    code: 'AMA-015',
    name: 'Mgba',
    alt: 'Ịgba mgba · Igbo traditional wrestling',
    country: 'Nigeria',
    region: 'West Africa',
    people: 'Igbo, southeastern Nigeria',
    form: 'Grappling',
    era: 'precolonial Igboland — festival revival since the 2000s',
    glyph: 'grapplRing',
    pose: 'throwLift',
    lede: 'In the sand ring of the village square, to the cry of the oja flute, a young man’s entire standing in Igboland could turn on whether his back ever touched the ground.',
    history:
      'Mgba is the wrestling of the Igbo of southeastern Nigeria, organised around the village square and the age-grade system rather than around professional fighters. Boys wrestled within their age set; men wrestled for their village against neighbouring villages, and a champion carried his community’s name. Simon Ottenberg’s fieldwork at Afikpo in the mid-twentieth century documented wrestling age grades — the Mkpufu Mgba among them — as a formal stage of Igbo boyhood. Colonial disruption, mission pressure and the Nigerian Civil War thinned the practice; since the 2000s, cultural festivals in Enugu, Ebonyi, Anambra and Imo have deliberately revived it.',
    technique:
      'Mgba is jacketless grappling from standing, contested on prepared sand that cushions the fall. A wrestler loses the moment his back touches the ground, so bouts are short, explosive and usually decided on a single throw. Wrestlers take grips at the wrist, arm and waist and hunt for hip throws, body lifts, ankle picks and trips. There is no striking and no ground fighting — once the fall is scored, the bout ends. Competitors train for months ahead of the wrestling season.',
    ritual:
      'Mgba is festival business. In much of Igboland it sits inside the New Yam Festival (Iri ji), the thanksgiving that opens the harvest, though some communities — Abam among them — hold a separate wrestling festival, Omume Mgba. The chief and his titled men are seated at the arena while the rest of the village rings the square. An oja flute player and drummers drive the bouts, praise-singers name the wrestlers, and winners take cash and goods and, historically, standing as suitors and as representatives of their age grade.',
    masters: [
      { name: 'The Afikpo wrestling age grades (Mkpufu Mgba)', note: 'A lineage rather than an individual: documented by anthropologist Simon Ottenberg, whose Afikpo fieldwork and Smithsonian photographic record show mgba as a formal stage of Igbo boyhood organised by age grade, not a professional fighting school.' },
      { name: 'Chinua Achebe', note: 'Not a wrestler — the novelist whose Things Fall Apart (1958) opens with Okonkwo throwing Amalinze the Cat, by far the most widely read account of what mgba meant socially. Amalinze is a fictional character, not a historical champion.', wikiSlug: 'Chinua_Achebe' },
    ],
    diaspora: 'Igbo cultural unions abroad have carried mgba overseas as festival demonstration rather than competition, staged at Igbo convention events in the United States. Practice is symbolic and intermittent, embedded in cultural-day programming; no diaspora federation or competitive circuit is documented.',
    sources: [
      'Simon Ottenberg, Boyhood Rituals in an African Society (Univ. of Washington Press, 1989) — Afikpo Igbo ethnography incl. wrestling age grades',
      'Simon Ottenberg photographic collection, Smithsonian Learning Lab — the Mkpufu Mgba wrestling age grade, Amaseri',
      'Chinua Achebe, Things Fall Apart (Heinemann, 1958), ch. 1',
    ],
    images: [
      { url: 'https://upload.wikimedia.org/wikipedia/commons/d/db/A_sculptural_representation_of_traditional_wrestlers.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:A_sculptural_representation_of_traditional_wrestlers.jpg', license: 'CC BY-SA 4.0', attribution: 'Harriwillz, via Wikimedia Commons', caption: 'Public sculpture of traditional wrestlers — mgba commemorated as civic heritage in Igboland' },
      { url: 'https://upload.wikimedia.org/wikipedia/commons/7/7d/Sculptural_representation_of_traditional_wrestlers.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:Sculptural_representation_of_traditional_wrestlers.jpg', license: 'CC BY-SA 4.0', attribution: 'Harriwillz, via Wikimedia Commons', caption: 'A second view of the wrestlers monument' },
      { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3d/Traditional_wrestling_bout_of_Ibeno_people.jpg/1280px-Traditional_wrestling_bout_of_Ibeno_people.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:Traditional_wrestling_bout_of_Ibeno_people.jpg', license: 'CC BY-SA 4.0', attribution: 'Utibe Noah Silas, via Wikimedia Commons', caption: 'Related tradition: a wrestling bout among the Ibeno of the Niger Delta — neighbouring rather than strictly Igbo' },
      { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2c/Yam_Eating_Festival_in_an_Igbo_Community%2C_Nigeria.jpg/1280px-Yam_Eating_Festival_in_an_Igbo_Community%2C_Nigeria.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:Yam_Eating_Festival_in_an_Igbo_Community,_Nigeria.jpg', license: 'CC BY-SA 4.0', attribution: 'Frankincense Diala, via Wikimedia Commons', caption: 'New Yam Festival (Iri ji) — the harvest thanksgiving inside which mgba bouts are staged' },
      { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/61/The_Igbo_New_Yam_Festival_on_Saturday_August_30th._%282812002125%29.jpg/1280px-The_Igbo_New_Yam_Festival_on_Saturday_August_30th._%282812002125%29.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:The_Igbo_New_Yam_Festival_on_Saturday_August_30th._(2812002125).jpg', license: 'CC BY-SA 2.0', attribution: 'William Murphy, via Wikimedia Commons', caption: 'Igbo New Yam Festival — the ceremonial frame that carries the wrestling season' },
    ],
    videos: [
      { youtubeId: '4ZeCc8EuRY0', title: 'Igba Mgba: Reviving An Age-Old Igbo Sport', channel: 'NZUKO' },
      { youtubeId: 'PSpTgNMmTAk', title: 'Traditional wrestling contest (Mgba) in Afikpo, Ebonyi State', channel: 'UGWUMBA TV' },
      { youtubeId: 'QZtKHDBHb64', title: 'Ịgba Mgba in the USA — traditional Igbo wrestling', channel: 'Amarachi Attamah' },
    ],
    links: [{ label: 'Smithsonian Learning Lab — Ottenberg: the Mkpufu Mgba wrestling age grade', url: 'https://learninglab.si.edu/resources/view/2167' }],
  },
  {
    id: 'taskiwin',
    wing: 'africa',
    code: 'AMA-016',
    name: 'Taskiwin',
    alt: 'Taskiwine · Tiskiwin — martial dance of the western High Atlas',
    country: 'Morocco',
    region: 'North Africa',
    people: 'Amazigh (Berber) communities of the western High Atlas',
    form: 'Hybrid / Acrobatic',
    era: 'origins undated — UNESCO urgent-safeguarding list, 2017',
    glyph: 'invertKick',
    pose: 'tahtibDance',
    wikiSlug: 'Taskiwin',
    lede: 'A row of Amazigh men drives a shuddering tremor through their shoulders while a decorated powder horn swings at the hip — a war dance outliving the war, and now nearly outliving its dancers.',
    history:
      'Taskiwin belongs to the Amazigh villages of the western High Atlas in central Morocco, and is treated by scholars as a subgenre of ahwash, the collective song-and-dance form of the region. Men performed it as a display of martial readiness and as celebration after battle, each dancer carrying the tiskt — a richly decorated powder horn hung with small bells. The horn survives as ornament long after the muzzle-loading firearms of its era became obsolete. Morocco submitted the practice to UNESCO, which inscribed it in 2017 — on the List in Need of Urgent Safeguarding, not the Representative List.',
    technique:
      'This is a martial dance, not a codified fighting system: no ranked curriculum, no named combat techniques and no syllabus of application are recorded for it. What it preserves is bearing rather than method — combat knowledge surviving as choreography. Dancers form a line and drive the movement through the shoulders (UNESCO describes it plainly as the art of shaking one’s shoulders) over stamping footwork, the tiskt held at the hip or brandished. The pulse comes from agwal clay drums, tallunt frame drums and the tal’wwatt flute.',
    ritual:
      'Performance belongs to collective village occasions — moussems, weddings, seasonal festivals — where taskiwin is danced by men within the wider ahwash gathering. UNESCO records its social function directly: it fosters cohesion and harmony and serves as a key means of socialising the young. There is no formal initiation; a dancer joins a village troupe and learns informally by watching. The tiskt is craft as much as costume, and the artisans who carve, dye and bell the horns are declining alongside the dancers themselves.',
    masters: [
      { name: 'Village troupes of Chichaoua province', note: 'The practice survives through named local troupes rather than individual masters — the Tiwouna Ida ou Mahmoud group among them, documented performing at douar Arhalen in 2021.' },
      { name: 'Local safeguarding associations', note: 'UNESCO’s inscription credits associations formed from the 1990s onward with organising festivals and transmission. No founding master or continuous named lineage is recorded.' },
    ],
    diaspora: 'Taskiwin has no diaspora practice — it has barely left its home valleys. It sits instead within a wider Moroccan family of martial performance: Tbourida, the equestrian charge in which troops of 15–25 riders simulate a cavalry salvo (UNESCO Representative List, 2021), and Reggada, an Amazigh war dance of the northeast performed with the moukahla rifle. Both are considerably healthier than taskiwin.',
    sources: [
      'UNESCO ICH — ‘Taskiwin, martial dance of the western High Atlas’, Urgent Safeguarding List, element 01256 (2017)',
      'UNESCO ICH — ‘Tbourida’, Representative List, element 01483 (2021)',
      'Ethnographic literature in English is thin; the UNESCO nomination file is the principal authority',
    ],
    images: [
      { url: 'https://upload.wikimedia.org/wikipedia/commons/6/62/%D8%AA%D8%A7%D8%B3%D9%83%D9%8A%D9%88%D9%8A%D9%86_-_-_%D8%A7%D9%84%D8%B1%D9%82%D8%B5%D8%A9_%D8%A7%D9%84%D8%A7%D8%AD%D8%AA%D9%81%D8%A7%D9%84%D9%8A%D8%A9_%D9%84%D8%A3%D9%85%D8%A7%D8%B2%D9%8A%D8%BA_%D8%A7%D9%84%D8%A3%D8%B7%D9%84%D8%B3_%D8%A7%D9%84%D9%83%D8%A8%D9%8A%D8%B1_%D8%A7%D9%84%D8%BA%D8%B1%D8%A8%D9%8A_%D9%84%D9%84%D9%85%D8%BA%D8%B1%D8%A8.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:%D8%AA%D8%A7%D8%B3%D9%83%D9%8A%D9%88%D9%8A%D9%86_-_-_%D8%A7%D9%84%D8%B1%D9%82%D8%B5%D8%A9_%D8%A7%D9%84%D8%A7%D8%AD%D8%AA%D9%81%D8%A7%D9%84%D9%8A%D8%A9_%D9%84%D8%A3%D9%85%D8%A7%D8%B2%D9%8A%D8%BA_%D8%A7%D9%84%D8%A3%D8%B7%D9%84%D8%B3_%D8%A7%D9%84%D9%83%D8%A8%D9%8A%D8%B1_%D8%A7%D9%84%D8%BA%D8%B1%D8%A8%D9%8A_%D9%84%D9%84%D9%85%D8%BA%D8%B1%D8%A8.jpg', license: 'CC BY-SA 4.0', attribution: 'EL-MASOUDYMOHAMED, via Wikimedia Commons', caption: 'The Tiwouna Ida ou Mahmoud taskiwin troupe at douar Arhalen, Chichaoua province, 2021' },
      { url: 'https://upload.wikimedia.org/wikipedia/commons/4/46/%D8%AA%D8%A7%D8%B3%D9%83%D9%8A%D9%88%D9%8A%D9%86%D8%8C_%D8%A7%D9%84%D8%B1%D9%82%D8%B5%D8%A9_%D8%A7%D9%84%D8%A7%D8%AD%D8%AA%D9%81%D8%A7%D9%84%D9%8A%D8%A9_%D9%84%D8%A3%D9%85%D8%A7%D8%B2%D9%8A%D8%BA_%D8%A7%D9%84%D8%A3%D8%B7%D9%84%D8%B3_%D8%A7%D9%84%D9%83%D8%A8%D9%8A%D8%B1_%D8%A7%D9%84%D8%BA%D8%B1%D8%A8%D9%8A_%D9%84%D9%84%D9%85%D8%BA%D8%B1%D8%A8_%282%29.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:%D8%AA%D8%A7%D8%B3%D9%83%D9%8A%D9%88%D9%8A%D9%86%D8%8C_%D8%A7%D9%84%D8%B1%D9%82%D8%B5%D8%A9_%D8%A7%D9%84%D8%A7%D8%AD%D8%AA%D9%81%D8%A7%D9%84%D9%8A%D8%A9_%D9%84%D8%A3%D9%85%D8%A7%D8%B2%D9%8A%D8%BA_%D8%A7%D9%84%D8%A3%D8%B7%D9%84%D8%B3_%D8%A7%D9%84%D9%83%D8%A8%D9%8A%D8%B1_%D8%A7%D9%84%D8%BA%D8%B1%D8%A8%D9%8A_%D9%84%D9%84%D9%85%D8%BA%D8%B1%D8%A8_(2).jpg', license: 'CC BY-SA 4.0', attribution: 'EL-MASOUDYMOHAMED, via Wikimedia Commons', caption: 'Taskiwin dancers of the western High Atlas, Chichaoua province' },
      { url: 'https://upload.wikimedia.org/wikipedia/commons/e/ed/%D8%AA%D8%A7%D8%B3%D9%83%D9%8A%D9%88%D9%8A%D9%86%D8%8C_%D8%A7%D9%84%D8%B1%D9%82%D8%B5%D8%A9_%D8%A7%D9%84%D8%A7%D8%AD%D8%AA%D9%81%D8%A7%D9%84%D9%8A%D8%A9_%D9%84%D8%A3%D9%85%D8%A7%D8%B2%D9%8A%D8%BA_%D8%A7%D9%84%D8%A3%D8%B7%D9%84%D8%B3_%D8%A7%D9%84%D9%83%D8%A8%D9%8A%D8%B1_%D8%A7%D9%84%D8%BA%D8%B1%D8%A8%D9%8A_%D9%84%D9%84%D9%85%D8%BA%D8%B1%D8%A8_%283%29.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:%D8%AA%D8%A7%D8%B3%D9%83%D9%8A%D9%88%D9%8A%D9%86%D8%8C_%D8%A7%D9%84%D8%B1%D9%82%D8%B5%D8%A9_%D8%A7%D9%84%D8%A7%D8%AD%D8%AA%D9%81%D8%A7%D9%84%D9%8A%D8%A9_%D9%84%D8%A3%D9%85%D8%A7%D8%B2%D9%8A%D8%BA_%D8%A7%D9%84%D8%A3%D8%B7%D9%84%D8%B3_%D8%A7%D9%84%D9%83%D8%A8%D9%8A%D8%B1_%D8%A7%D9%84%D8%BA%D8%B1%D8%A8%D9%8A_%D9%84%D9%84%D9%85%D8%BA%D8%B1%D8%A8_(3).jpg', license: 'CC BY-SA 4.0', attribution: 'EL-MASOUDYMOHAMED, via Wikimedia Commons', caption: 'Village performance of taskiwin — the martial dance UNESCO lists as in need of urgent safeguarding' },
      { url: 'https://upload.wikimedia.org/wikipedia/commons/4/45/COLLECTIE_TROPENMUSEUM_Dansgroep_uit_het_Atlasgebergte_TMnr_10028647.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:COLLECTIE_TROPENMUSEUM_Dansgroep_uit_het_Atlasgebergte_TMnr_10028647.jpg', license: 'CC BY-SA 3.0', attribution: 'Nationaal Museum van Wereldculturen (Tropenmuseum)', caption: 'Period context: a dance group from the Atlas Mountains. The museum catalogues this generically — it does NOT identify the genre as taskiwin' },
      { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c7/Tbourida_heritage_01.jpg/1280px-Tbourida_heritage_01.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:Tbourida_heritage_01.jpg', license: 'CC BY 4.0', attribution: 'Elhassanbrahki, via Wikimedia Commons', caption: 'Tbourida, Morocco’s equestrian martial performance (UNESCO 2021) — taskiwin’s healthier sibling' },
    ],
    videos: [
      { youtubeId: 'jH2ahNFcAjY', title: 'Taskiwin, martial dance of the western High Atlas — official UNESCO film', channel: 'UNESCO' },
      { youtubeId: 'jOzHIR51xpg', title: 'Taskiwin at World Folklore Days, Marrakech', channel: 'Marrakech Folklore Days' },
    ],
    links: [{ label: 'UNESCO ICH — Taskiwin (Urgent Safeguarding List, 2017)', url: 'https://ich.unesco.org/en/USL/taskiwin-martial-dance-of-the-western-high-atlas-01256' }],
  },
  {
    id: 'semerungu',
    wing: 'africa',
    code: 'AMA-017',
    name: 'Seme & Rungu',
    alt: 'Simi · ol alem · njora (sword) and the rungu (club)',
    country: 'Kenya',
    region: 'East Africa',
    people: 'Maasai and Kikuyu',
    form: 'Weapon',
    era: 'pre-colonial — museum-documented from the late 19th century',
    glyph: 'twinStick',
    pose: 'twinSticks',
    lede: 'A leaf-bladed sword in a scabbard dyed blood-red, and a knobbed club that says, without a word, that the man carrying it has been made a warrior.',
    history:
      'The Maasai are Nilotic pastoralists of the Kenya–Tanzania Rift Valley; the Kikuyu are Bantu agriculturalists of the central highlands. Both carried the leaf-bladed short sword the Maasai call ol alem or seme and the Kikuyu call njora, and alongside it the rungu, a knobbed hardwood club. The weapons moved with the herder, the raider and the hunter. Collectors carried examples into European museums, where the record is unusually legible: the British Museum holds a traditionally forged Kenyan blade of the early twentieth century beside a later Tanzanian one cut from an imported Martindale bush knife — trade steel absorbed into an old form.',
    technique:
      'This is a documented weapon and warrior-grade tradition, not a codified school: no named curriculum, no ranked grades and no recorded lineage of technique exist for either weapon, and none should be inferred. What survives is the tool and the role that carried it. The seme is a short leaf-shaped blade with a relatively rounded point, broad at the belly, made for cutting, worn at the waist in a wooden scabbard sheathed in rawhide and dyed red. The rungu is 45–50 cm of hardwood — a slim shaft under a heavy knob — swung or thrown.',
    ritual:
      'Weapon and status are inseparable. Maasai men pass through the male age-set rites UNESCO inscribed in 2018: Enkipaata inducting boys, Eunoto shaving the morans toward adulthood, Olng’esherr ending moranhood and opening eldership. It is as ilmurran — warrior-grade — that a man bears these arms, together with the long spear and the hide shield painted in red, white and black. The rungu is regalia as much as weapon: a special one is held by the designated speaker at community gatherings.',
    masters: [
      { name: 'The Maasai age-set system (ilmurran)', note: 'The transmitting institution is the age-set itself, not a school: knowledge passes between successive cohorts of morans and elders through the Enkipaata / Eunoto / Olng’esherr cycle, inscribed by UNESCO in 2018.' },
      { name: 'National Museums of Kenya', note: 'Custodian institution for Kenyan arms and Maasai material culture; its exhibits document moran regalia, spears, shields and weaponry.' },
      { name: 'British Museum, Africa collections', note: 'Holds documented ol alem / seme examples complete with sheath and belt, spanning an early-20th-century forged Kenyan blade and a later Kisongo Maasai blade made from imported steel.' },
    ],
    diaspora: 'There is no martial-arts diaspora here — no schools abroad, no competitive circuit, no exported curriculum. The weapons travel instead as objects and as emblem: through museum collections across Europe and North America, through the tourist trade in beaded souvenir clubs, and through Kenyan national iconography. The rungu has had a genuine sporting afterlife at home, where rungu-throwing is a contested event at the Maasai Olympics.',
    sources: [
      'UNESCO ICH — ‘Enkipaata, Eunoto and Olng’esherr: three male rites of passage of the Maasai community’, element 01390 (2018)',
      'British Museum, Africa collections — ol alem with sheath and belt (Kenya, early 20th c.; Tanzania, late 20th c.)',
      'National Museums of Kenya — ‘Warriors of the Maasai’ and Kenyan weaponry exhibits',
    ],
    images: [
      { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2d/Ol_Alem%2C_Maasai_sword%2C_BM.jpg/1280px-Ol_Alem%2C_Maasai_sword%2C_BM.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:Ol_Alem,_Maasai_sword,_BM.jpg', license: 'CC BY-SA 4.0', attribution: 'Avron, via Wikimedia Commons', caption: 'Ol alem: sword, sheath and belt (British Museum). Right, a traditionally forged Kenyan blade, early 20th c.; left, a Kisongo Maasai blade cut from a European bush knife' },
      { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5a/The_Morans.jpg/1280px-The_Morans.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:The_Morans.jpg', license: 'CC BY-SA 4.0', attribution: 'Wanjaudan, via Wikimedia Commons', caption: 'Morans carrying rungu and spear while herding — the weapons in their everyday working context' },
      { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/50/Rungu_throwing.jpg/1280px-Rungu_throwing.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:Rungu_throwing.jpg', license: 'CC BY-SA 4.0', attribution: 'Kengee8, via Wikimedia Commons', caption: 'Rungu-throwing at the Maasai Olympics — the club’s living sporting afterlife' },
      { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/76/Maasai_spears_and_shields%2C_Kenya_%282260004459%29.jpg/1280px-Maasai_spears_and_shields%2C_Kenya_%282260004459%29.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:Maasai_spears_and_shields,_Kenya_(2260004459).jpg', license: 'CC BY-SA 2.0', attribution: 'John Atherton, via Wikimedia Commons', caption: 'Moran dancing with spears and painted hide shields, Kenya, 1979' },
      { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c0/Maasai_Moran.jpg/1280px-Maasai_Moran.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:Maasai_Moran.jpg', license: 'CC BY-SA 4.0', attribution: 'NiaNuru, via Wikimedia Commons', caption: 'A Maasai moran — warrior-grade status within the age-set system' },
    ],
    videos: [
      { youtubeId: 'ZOnB24xI7cM', title: 'Enkipaata, Eunoto and Olng’esherr — the Maasai male rites of passage (UNESCO film)', channel: 'UNESCO' },
      { youtubeId: 'vwLQy1hv1cw', title: 'Hundreds of Maasai warriors come of age during the Eunoto ceremony', channel: 'AFP News Agency' },
      { youtubeId: 'Cd-Mt_2QJA0', title: 'Kenya: la cérémonie d’Eunoto, rite de passage des jeunes Maasaï', channel: 'africanews' },
    ],
    links: [{ label: 'National Museums of Kenya — Warriors of the Maasai', url: 'https://artsandculture.google.com/story/warriors-of-the-maasai-national-museums-of-kenya/VAXROaOyMUDY4A?hl=en' }],
  },

  // ═══ VOL. V — OCEANIC & PACIFIC ARTS ═══════════════════════════════════════
  {
    id: 'lua',
    wing: 'oceania',
    code: 'OCE-001',
    name: 'Lua (Kapu Kuʻialua)',
    alt: 'Kuʻialua — ‘two hits’; the Hawaiian art of bone-breaking',
    country: 'Hawaiʻi (USA)',
    region: 'Polynesia',
    people: 'Kānaka Maoli (Native Hawaiians)',
    form: 'Hybrid / Acrobatic',
    era: 'precontact — revived 1970s–1990s',
    glyph: 'openHand',
    pose: 'crossPunch',
    wikiSlug: 'Kapu_Kuialua',
    lede: 'Under the kapu system, Hawaiʻi’s ʻōlohe lua mastered both the breaking of bones and the healing arts to mend them.',
    history:
      'Lua, formally Kapu Kuʻialua, was the restricted combat system of precontact Hawaiʻi, transmitted in pā lua (training schools) chiefly to warriors, guards and retainers of the aliʻi; commoners received only basic instruction in wartime. With Christianization and the dismantling of the kapu order in the nineteenth century, open practice collapsed and the art survived quietly in family lines. In 1991 four men who had studied lua in the 1970s — Jerry Walker, Mitchell Eli, Moses Kalauokalani and Richard Paglinawan — began teaching publicly, supported by the Bishop Museum and Native Hawaiian cultural programmes, seeding today’s revival hālau.',
    technique:
      'Lua pairs percussive strikes with bone-breaking, joint dislocation, pressure-point manipulation and throws, trained through named ʻai (techniques) and low, mobile stances. It is inseparable from its armory: the leiomano shark-tooth weapon, daggers, tripping cords and clubs, extending in tradition to battlefield strategy and ocean fighting. Because dislocating arts imply relocating ones, ʻōlohe were also expected to know lomilomi and bone-setting — destruction and repair taught as one curriculum.',
    ritual:
      'Lua was kapu — sacred and restricted. Entry to a pā lua came with obligations of secrecy and conduct, and training was framed by prayers, chants and formal challenges to the art’s patron deities. Practitioners describe close kinship between lua movement and haʻa/hula traditions, and revival schools continue to open and close training with protocol. Some knowledge remains deliberately untaught in public settings — a restriction the archive records rather than probes.',
    masters: [
      { name: 'Richard Paglinawan', note: 'ʻŌlohe of the 1991 Pā Kuʻialua revival; lead author of Lua: Art of the Hawaiian Warrior (Bishop Museum Press).' },
      { name: 'Jerry Walker · Mitchell Eli · Moses Kalauokalani', note: 'With Paglinawan, the four ʻōlohe who reopened public lua instruction in 1991.' },
      { name: 'Solomon Kaihewalu', note: 'ʻŌlohe who taught a family-lineage lua from the 1960s onward on the US mainland; his hālau continues in California.' },
    ],
    diaspora: 'Lua now travels with the Hawaiian diaspora: the Kaihewalu family hālau has taught for decades in southern California, university programmes have hosted its instructors, and revival-line workshops appear across the continental US and the Pacific alongside hula and voyaging culture.',
    sources: [
      'Paglinawan, Eli, Kalauokalani & Walker, Lua: Art of the Hawaiian Warrior (Bishop Museum Press, 2006)',
      'KHON2 — Aloha Authentic Ep. 212, ‘Hawaiian Martial Arts’ (2022)',
      'Kuʻialuaopuna hālau documentation',
    ],
    images: [
      { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/83/Leiomano.jpg/1280px-Leiomano.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:Leiomano.jpg', license: 'CC BY-SA 3.0', attribution: 'Jen, via Wikimedia Commons', caption: 'Leiomano: wood set with great white shark teeth — the signature lua weapon' },
      { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7a/Leiomano_Oc%2CHAW.188.jpg/1280px-Leiomano_Oc%2CHAW.188.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:Leiomano_Oc,HAW.188.jpg', license: 'CC BY-SA 4.0', attribution: 'The Trustees of the British Museum', caption: 'Hawaiian leiomano with twenty-four shark teeth pegged into a grooved wooden blade (British Museum)' },
      { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ad/Hawaiian_weaponry%2C_Pasifika_Festival._%28PASF-D-2015-203%29.jpg/1280px-Hawaiian_weaponry%2C_Pasifika_Festival._%28PASF-D-2015-203%29.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:Hawaiian_weaponry,_Pasifika_Festival._(PASF-D-2015-203).jpg', license: 'CC BY 4.0', attribution: 'Adana Dobranis, via Wikimedia Commons', caption: 'Carved wooden and shark-tooth Hawaiian weaponry, Pasifika Festival, Auckland (2015)' },
    ],
    videos: [
      { youtubeId: 'RJ_hR7BUGwo', title: 'Hawaiian Martial Arts | Aloha Authentic Episode 212', channel: 'KHON2 News' },
      { youtubeId: 'rxYwBXAj7P8', title: 'Michelle Manu & the Hawaiian Combat Art, the Kaihewalu Lua', channel: 'UCLA Martial Arts' },
    ],
    links: [{ label: 'Kuʻialuaopuna — living lua hālau, Puna, Hawaiʻi', url: 'https://www.kuialuaopuna.com/hale' }],
  },
  {
    id: 'maurakau',
    wing: 'oceania',
    code: 'OCE-002',
    name: 'Mau Rākau',
    alt: 'Te mau rākau — ‘to bear a weapon’; taiaha fighting arts',
    country: 'Aotearoa New Zealand',
    region: 'Polynesia',
    people: 'Māori (iwi-based lineages; notably Te Arawa’s Mokoia wānanga)',
    form: 'Weapon',
    era: 'classical Māori warfare — wānanga revival from the 1980s',
    glyph: 'twinStick',
    pose: 'overheadPole',
    wikiSlug: 'Mau_rākau',
    lede: 'On Mokoia Island, in the middle of Lake Rotorua, the taiaha never stopped speaking.',
    history:
      'Mau rākau names the Māori discipline of traditional weaponry — above all the taiaha, the carved long staff with striking blade and thrusting tongue, alongside patu, tewhatewha and pouwhenua. In classical times toa (warriors) trained in whare tū taua under tohunga of the fighting arts, with knowledge held closely within iwi. The musket wars and colonization broke open transmission, but the forms endured in ceremony and in a few teaching lines. From the early 1980s Mita Mohi’s taiaha wānanga on Mokoia Island rebuilt mass transmission, training many thousands of young men before his death in 2016.',
    technique:
      'The taiaha is worked from a side-on guard through strikes with the rau (blade), thrusts with the arero (tongue), parries, feints and footwork drilled in set sequences; students progress through graded stances before sparring. Reading an opponent’s shoulders and eyes is taught as explicitly as the strikes. Warriors classically paired a long weapon with a short patu tucked in the belt, and mau rākau today is trained both as combat discipline and as the movement grammar behind ceremonial challenge.',
    ritual:
      'The taiaha itself is taonga — many are named heirlooms, ornamented with kākā feathers and dog hair, and handled under tapu. Training on Mokoia was framed by karakia and tikanga, and aspects of weapon knowledge remain restricted to appropriate contexts. Mau rākau is most visible in the wero, the quivering armed challenge laid before manuhiri during pōwhiri; its postures thread through kapa haka. The wānanga model ties the art to whakapapa: students learn whose hands the forms passed through.',
    masters: [
      { name: 'Mita Mohi', note: 'Patriarch of the Mokoia Island taiaha wānanga (est. early 1980s), credited with training over 20,000 by his death in 2016.', wikiSlug: 'Mita_Mohi' },
    ],
    diaspora: 'Mau rākau moves wherever Māori communities gather: kura kaupapa and mainstream schools across Aotearoa host wānanga, Australian-based Māori clubs teach taiaha alongside kapa haka, and international festival and museum programmes present the art as living practice rather than artifact.',
    sources: [
      'Te Ara — The Encyclopedia of New Zealand, ‘Mau rākau: Māori use of weaponry’',
      'Waka Huia (TVNZ) — ‘Mita Mohi, patriarch of the Mokoia Island weaponry school’ (2015)',
    ],
    images: [
      { url: 'https://upload.wikimedia.org/wikipedia/commons/4/46/TaiahaPosition4.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:TaiahaPosition4.jpg', license: 'Public domain', attribution: 'Wikimedia Commons (19th-century photograph)', caption: 'Two Māori men demonstrating a taiaha fighting position, nineteenth century' },
      { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/fd/Waitangi_Day_2019_%C5%8Cnuku_Marae_07.jpg/1280px-Waitangi_Day_2019_%C5%8Cnuku_Marae_07.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:Waitangi_Day_2019_%C5%8Cnuku_Marae_07.jpg', license: 'CC BY 4.0', attribution: 'Office of the Governor-General of New Zealand', caption: 'A warrior with taiaha delivers the wero (challenge) at Ōnuku Marae, Waitangi Day 2019' },
      { url: 'https://upload.wikimedia.org/wikipedia/commons/0/07/Long_staff_%28taiaha%29%2C_Maori_people%2C_Honolulu_Museum_of_Art%2C_207.1.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:Long_staff_(taiaha),_Maori_people,_Honolulu_Museum_of_Art,_207.1.jpg', license: 'CC0', attribution: 'Hiart, via Wikimedia Commons', caption: 'Carved taiaha with pāua-shell inlay (Honolulu Museum of Art)' },
      { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/fd/Mau_Rakau_at_Whenua_Iti_Outdoors.jpg/1280px-Mau_Rakau_at_Whenua_Iti_Outdoors.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:Mau_Rakau_at_Whenua_Iti_Outdoors.jpg', license: 'CC BY-SA 4.0', attribution: 'WhenuaItiOutdoors, via Wikimedia Commons', caption: 'Mau rākau practice at a contemporary outdoor-education programme' },
    ],
    videos: [
      { youtubeId: 'oFNyN0LWlZc', title: 'Waka Huia — Mita Mohi, patriarch of the Mokoia Island weaponry school', channel: 'wakahuiatvnz' },
      { youtubeId: 'n_0JDoSPuI0', title: 'Māori TV brothers teach taiaha', channel: 'gisborneherald' },
    ],
    links: [{ label: 'Te Ara Encyclopedia of NZ — Mau rākau', url: 'https://teara.govt.nz/en/mau-rakau-maori-use-of-weaponry' }],
  },
  {
    id: 'coreeda',
    wing: 'oceania',
    code: 'OCE-003',
    name: 'Coreeda',
    alt: 'Aboriginal Australian wrestling · ‘kangaroo spirit’ (Ngiyampaa)',
    country: 'Australia',
    region: 'Australia',
    people: 'Aboriginal Australians (revival rooted in Ngiyampaa country, Cobar NSW)',
    form: 'Grappling',
    era: 'pre-colonial — codified sport from 1998',
    glyph: 'grapplRing',
    pose: 'collarClinch',
    lede: 'A wrestling art that begins as a dance — the red kangaroo’s stance reborn inside a painted sun circle.',
    history:
      'Wrestling traditions were widespread in pre-colonial Aboriginal Australia, recorded by colonial observers into the 1870s before frontier violence and dispossession shattered their transmission. Coreeda — the name means ‘kangaroo spirit’ in the Ngiyampaa language of the Cobar region — is the modern revival: the Coreeda Association, founded in 1998, rebuilt a codified team sport from oral tradition, including a Cobar origin story linked to the red kangaroo. It began with Koori youth programmes in western Sydney and has since travelled to remote communities such as Mornington Island, where NITV documented it in 2014.',
    technique:
      'A coreeda contest joins a three-part dance segment, drawing on kangaroo movement, with a four-round wrestling element fought inside the ‘sun’, a painted circle. The attacker has twenty seconds to push, throw or roll the defender out of the circle; the defender wins the exchange by holding ground, then roles reverse. Scoring rewards balance, control and clean throws over injury, making the sport safe for schools while keeping the combative core of the older traditions.',
    ritual:
      'The dance component is not warm-up but frame: bouts open with choreographed movement carrying the kangaroo-dreaming narrative that the revival attaches to the Cobar country of the Ngiyampaa. Because the sport reconstructs ceremony broken by colonization, its custodians present the dreaming stories on community terms; the archive notes that some originating knowledge was lost or remains restricted to its communities, and coreeda’s ritual layer is best read as respectful revival rather than unbroken transmission.',
    masters: [
      { name: 'Bill Griffiths', note: 'Cobar-region storyteller whose account of traditional wrestling, heard from his grandfather, seeded the revival.' },
      { name: 'Shane Parker', note: 'Coreeda practitioner from childhood who wrestled Greco-Roman for Australia at the 2010 Delhi Commonwealth Games.' },
    ],
    diaspora: 'Coreeda’s spread is internal rather than overseas: from western Sydney youth programmes to Mornington Island in the Gulf of Carpentaria, carried by broadcasters like NITV and by the Coreeda Association’s affiliation with the World Martial Arts Union.',
    sources: [
      'Creative Spirits — ‘Coreeda: Aboriginal wrestling’',
      'SBS/NITV — ‘Ancient martial art taught in remote Indigenous communities’',
      'NITV News — Coreeda wrestling on Mornington Island (2014)',
    ],
    images: [
      { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f4/Two_of_the_Natives_of_New_Holland%2C_Advancing_to_Combat.jpg/1280px-Two_of_the_Natives_of_New_Holland%2C_Advancing_to_Combat.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:Two_of_the_Natives_of_New_Holland,_Advancing_to_Combat.jpg', license: 'Public domain', attribution: 'Sydney Parkinson (1770s), via Wikimedia Commons', caption: '‘Two of the Natives of New Holland, Advancing to Combat’ — among the earliest European depictions of Aboriginal combat' },
      { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ad/SLNSW_799111_1_Death_or_Glory_Aboriginal_figures_fighting.jpg/1280px-SLNSW_799111_1_Death_or_Glory_Aboriginal_figures_fighting.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:SLNSW_799111_1_Death_or_Glory_Aboriginal_figures_fighting.jpg', license: 'Public domain', attribution: 'Tommy McRae / Mickey of Ulladulla (19th c.), State Library of NSW', caption: '‘Death or Glory’ — Aboriginal figures fighting, drawn by 19th-century Aboriginal artists' },
    ],
    videos: [
      { youtubeId: 'ejOOj4bOqJ0', title: 'NITV — Coreeda wrestling', channel: 'NITV' },
    ],
    links: [{ label: 'SBS NITV — Ancient martial art taught in remote Indigenous communities', url: 'https://www.sbs.com.au/nitv/article/ancient-martial-art-taught-in-remote-indigenous-communities/qg6c29is1' }],
  },
  {
    id: 'veitiqa',
    wing: 'oceania',
    code: 'OCE-004',
    name: 'Veitiqa & I Wau',
    alt: 'The Pacific armory: i wau war clubs (totokia, culacula, ula) & the veitiqa spear game',
    country: 'Fiji',
    region: 'Melanesia',
    people: 'iTaukei (Indigenous Fijians), incl. the hereditary bati warrior lineages',
    form: 'Weapon',
    era: '18th–19th c. climax of club warfare',
    glyph: 'crossSticks',
    pose: 'overheadPole',
    lede: 'In old Fiji the club was biography: a warrior’s rank, his kills and his god could all be read in carved hardwood.',
    history:
      'Fijian warfare of the eighteenth and nineteenth centuries was a club culture of extraordinary refinement: the beaked totokia ‘pecked’ the skull, the paddle-shaped culacula doubled as a priest’s shield-club, and the small ula was thrown with sniper accuracy. Spear skill was honed through veitiqa, the ritual dart-casting game. Chiefs such as Seru Epenisa Cakobau rose through this warfare before conversion to Christianity in 1854. Fergus Clunie’s Fiji Museum bulletin (1977) remains the standard study; the fighting systems survive today mainly through meke and museum collections.',
    technique:
      'Each club dictated its own method: the totokia’s kinetic energy concentrated in a single beak-point for helmet-crack precision; long two-handed clubs worked with parries and feints in open duels; the ula was carried in the girdle in pairs and thrown at close range. Spearmen trained through veitiqa, hurling a reed dart to skip and fly for distance. Craft was inseparable from function — clubs of dense nokonoko ironwood were shaped for years, sometimes inlaid with whale ivory.',
    ritual:
      'Clubs were consecrated objects: killing weapons acquired mana and could be dedicated in the bure kalou (spirit house), and club presentation accompanied chiefly ceremony alongside tabua and yaqona. The bati, hereditary warriors, held their standing by lineage obligation. Today the men’s club dance — meke i wau — keeps the weapon’s choreography alive in ceremony; the pre-Christian rites tied to these weapons ended in the nineteenth century and are documented mainly through museum and missionary records.',
    masters: [
      { name: 'Seru Epenisa Cakobau', note: 'Bau warlord and later King of Fiji (1817–1883) — the most documented figure of the club-warfare era.', wikiSlug: 'Seru_Epenisa_Cakobau' },
      { name: 'The bati lineages', note: 'Hereditary warrior clans of the Fijian vanua system; a social lineage rather than a named-master succession.' },
    ],
    diaspora: 'Fiji’s armory is itself a diaspora: totokia, culacula and ula now anchor Pacific galleries at the Met, British Museum, Te Papa and the National Museum of Scotland, while meke i wau performances travel with Fijian communities across the Pacific rim.',
    sources: [
      'Fergus Clunie, Fijian Weapons & Warfare (Bulletin of the Fiji Museum No. 2, 1977)',
      'Te Papa Tongarewa — ‘Fijian War Clubs’, Tales from Te Papa ep. 9',
      'The Met — Cali (club), Fijian, 19th c. (Rockefeller Collection)',
    ],
    images: [
      { url: 'https://images.metmuseum.org/CRDImages/ao/original/DP-23855-001.jpg', pageUrl: 'https://www.metmuseum.org/art/collection/search/313077', license: 'CC0', attribution: 'The Metropolitan Museum of Art (Rockefeller Memorial Collection)', caption: 'Cali (club), Fijian, mid-to-late 19th century — the anchor accession for the Pacific armory' },
      { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7d/Totokia_club-ETHOC_041765-IMG_2248-gradient.jpg/1280px-Totokia_club-ETHOC_041765-IMG_2248-gradient.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:Totokia_club-ETHOC_041765-IMG_2248-gradient.jpg', license: 'CC BY-SA 3.0 fr', attribution: 'Rama, Musée d’ethnographie de Genève', caption: 'Totokia, the beaked ‘pineapple club’ built to concentrate a blow into a single killing point' },
      { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0d/Fijian_club%2C_tokokia%2C_from_Fiji%2C_19th_century_CE._National_Museum_of_Scotland%2C_Edinburgh%2C_Scotland%2C_UK.jpg/1280px-Fijian_club%2C_tokokia%2C_from_Fiji%2C_19th_century_CE._National_Museum_of_Scotland%2C_Edinburgh%2C_Scotland%2C_UK.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:Fijian_club,_tokokia,_from_Fiji,_19th_century_CE._National_Museum_of_Scotland,_Edinburgh,_Scotland,_UK.jpg', license: 'CC BY-SA 4.0', attribution: 'Osama Shukir Muhammed Amin, via Wikimedia Commons', caption: 'Totokia war club, 19th century (National Museum of Scotland)' },
      { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/46/Fijian_warrior.jpg/1280px-Fijian_warrior.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:Fijian_warrior.jpg', license: 'Public domain', attribution: 'Wikimedia Commons (19th-century photograph)', caption: 'A Fijian warrior with club, photographed in the nineteenth century' },
    ],
    videos: [
      { youtubeId: 'p-nUnOmtlPs', title: 'Fijian War Clubs — Tales from Te Papa ep. 9', channel: 'Te Papa Tongarewa' },
    ],
    links: [{ label: 'The Met — Cali (club), Fijian, 19th century (Open Access)', url: 'https://www.metmuseum.org/art/collection/search/313077' }],
  },

  // ═══ VOL. III — EUROPEAN HISTORICAL ARTS ═══════════════════════════════════
  {
    id: 'pankration',
    wing: 'europe',
    code: 'EUR-001',
    name: 'Pankration',
    alt: 'Pammachon — ‘all power’',
    country: 'Greece',
    region: 'Ancient Mediterranean',
    people: 'Ancient Greeks',
    form: 'Hybrid / Acrobatic',
    era: '648 BCE — 4th century CE',
    glyph: 'grapplRing',
    pose: 'collarClinch',
    wikiSlug: 'Pankration',
    lede: 'In the sanded pit at Olympia, two oiled athletes struck, strangled and twisted until one raised a finger in submission — or, like Arrhichion, died at the moment of victory.',
    history:
      'Pankration — ‘all power’ — entered the Olympic programme in 648 BCE as the Games’ most demanding event, fusing boxing and wrestling into near-total combat in which only biting and eye-gouging were barred at Olympia. Its champions became legends: Arrhichion of Phigalia died winning his third Olympic crown in 564 BCE, his opponent conceding as he expired; Theagenes of Thasos amassed victories across the Panhellenic circuit. Celebrated on Panathenaic prize amphorae and praised by Philostratus as the finest of contests, pankration endured through the Roman era until the ancient games ended in the fourth century CE.',
    technique:
      'Pankratiasts fought both upright (ano pankration) and on the ground (kato pankration). Standing, they used bare-fisted blows and full-force kicks — vase painters recorded the gastrizein stomach kick — before closing to throws. On the ground the contest became one of joint locks, strangleholds and pinning pressure, with no rounds and no time limit. Victory came by knockout or by submission, signalled with a single raised finger; judges enforced the two prohibitions with rods.',
    ritual:
      'Pankration lived inside Greek athletic religion. Athletes trained in the palaistra under professional trainers, competed nude, oiled and dusted, and fought before judges at festivals honouring the gods — Olympia for Zeus, the Panathenaia for Athena, where victors carried home amphorae of sacred olive oil bearing painted pankration scenes. Olympic victors received the olive wreath and lifelong civic honour; the event’s iconography on prize vases remains our principal technical record.',
    masters: [
      { name: 'Arrhichion of Phigalia', note: 'Three-time Olympic pankration victor; died winning his final in 564 BCE as his opponent submitted, and was crowned in death.', wikiSlug: 'Arrhichion' },
      { name: 'Theagenes of Thasos', note: 'Fifth-century BCE boxer and pankratiast credited by ancient sources with over a thousand prizes.', wikiSlug: 'Theagenes_of_Thasos' },
    ],
    diaspora: 'Pankration spread with Greek athletics across the Mediterranean and remained a marquee event for a millennium. Today it is frequently cited as the ancient ancestor of mixed martial arts, and a regulated amateur revival is contested internationally under United World Wrestling.',
    sources: [
      'Pausanias, Description of Greece 8.40.1–2 (on Arrhichion)',
      'Philostratus, Gymnasticus (c. 230 CE)',
      'Panathenaic prize amphora, attr. Kleophrades Painter, c. 500 BCE (The Met)',
    ],
    images: [
      { url: 'https://upload.wikimedia.org/wikipedia/commons/6/62/Pankration_Black_Terracotta_Panathenaic_prize_amphora_Attributed_to_the_Kleophrades_Painter.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:Pankration_Black_Terracotta_Panathenaic_prize_amphora_Attributed_to_the_Kleophrades_Painter.jpg', license: 'CC0', attribution: 'The Metropolitan Museum of Art', caption: 'Pankration scene on a Panathenaic prize amphora attributed to the Kleophrades Painter, c. 500 BCE' },
      { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7b/Pankration_Met_16.71.jpg/1280px-Pankration_Met_16.71.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:Pankration_Met_16.71.jpg', license: 'CC BY 2.5', attribution: 'via Wikimedia Commons', caption: 'Pankratiasts under an umpire’s gaze; a kick is caught mid-flight (Met 16.71)' },
      { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/cf/Pankration_panathenaic_amphora_BM_VaseB610.jpg/1280px-Pankration_panathenaic_amphora_BM_VaseB610.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:Pankration_panathenaic_amphora_BM_VaseB610.jpg', license: 'CC BY 2.5', attribution: 'via Wikimedia Commons', caption: 'Pankration on a Panathenaic amphora (British Museum Vase B610)' },
      { url: 'https://upload.wikimedia.org/wikipedia/commons/0/0a/Pankratiasts_competing_on_a_Panathenaic_amphora.png', pageUrl: 'https://commons.wikimedia.org/wiki/File:Pankratiasts_competing_on_a_Panathenaic_amphora.png', license: 'CC0', attribution: 'Rijksmuseum', caption: 'Pankratiasts competing, Panathenaic amphora' },
    ],
    videos: [
      { youtubeId: 'yQtTMwDPkqU', title: 'Setting the record straight on ancient Greek pankration', channel: 'AMO Pankration' },
      { youtubeId: 'Ct8xS-EaQjo', title: 'Pankration: Ancient Greek Wrestling', channel: 'Daily History' },
    ],
    links: [{ label: 'The Met — Athletics in Ancient Greece', url: 'https://www.metmuseum.org/essays/athletics-in-ancient-greece' }],
  },
  {
    id: 'armizare',
    wing: 'europe',
    code: 'EUR-002',
    name: 'Armizare',
    alt: 'L’arte dell’armizare — Fiore dei Liberi’s art of arms',
    country: 'Italy',
    region: 'Southern Europe',
    people: 'Italians of the Friulian and northern courtly world',
    form: 'Weapon',
    era: 'c. 1380s–1420s',
    glyph: 'crossSticks',
    pose: 'twinSticks',
    wikiSlug: 'Fiore_dei_Liberi',
    lede: 'In the gold-leafed pages of the Fior di Battaglia, a crowned master teaches wrestling, dagger, sword and lance as one seamless art of the duel.',
    history:
      'Armizare is the complete fighting art of Fiore dei Liberi, a Friulian master who claimed fifty years of study and who prepared students for at least five judicial duels. Around 1404 he composed the Fior di Battaglia (‘Flower of Battle’) for Niccolò III d’Este, Marquis of Ferrara. Four manuscript copies survive, including the lavishly illustrated Getty Ms. Ludwig XV 13 and the Pisani Dossi codex of 1409. His system, echoed in Filippo Vadi’s later treatise, is the earliest substantially preserved Italian martial art.',
    technique:
      'Fiore builds everything from abrazare, wrestling: grips, breaks and throws flow into dagger defence, then to sword in one and two hands, poleaxe, spear, and mounted combat, in and out of armour. Fencing is organised around poste (guards), the plays of zogho largo (wide) and zogho stretto (close), and constant seizure of the opponent’s blade and limbs. His pedagogy is visual — masters wear crowns, scholars garters — so each illustrated play states a problem and its remedy.',
    ritual:
      'Armizare belongs to the fight-book culture of the late medieval courts: a presentation manuscript was itself a princely gift, and Fiore’s prologue names the champions he trained for judicial duels fought in the lists before lords. His segno diagram assigns the fighter four virtues carried by animals — the lynx’s prudence, tiger’s celerity, lion’s audacity, elephant’s fortitude. Six centuries on, the manuscripts anchor the international HEMA revival, with schools worldwide reconstructing the plays folio by folio.',
    masters: [
      { name: 'Fiore dei Liberi', note: 'Friulian master-at-arms (c. 1350–c. 1410s); author of the Fior di Battaglia, the foundational Italian fight-book.', wikiSlug: 'Fiore_dei_Liberi' },
      { name: 'Filippo Vadi', note: 'Pisan master whose De Arte Gladiatoria Dimicandi (c. 1482–87) transmits and adapts Fiore’s tradition.', wikiSlug: 'Filippo_Vadi' },
    ],
    diaspora: 'Fiore’s manuscripts scattered into the d’Este library, Parisian and private collections, and ultimately the Getty Museum. Rediscovered in the modern era, they became a cornerstone of the worldwide historical European martial arts movement, with armizare schools active across Europe, the Americas and Australia.',
    sources: [
      'Fiore dei Liberi, Fior di Battaglia — Getty Ms. Ludwig XV 13 (c. 1404)',
      'Fiore dei Liberi, Flos Duellatorum — Pisani Dossi MS (1409)',
      'Fiore dei Liberi, Florius de Arte Luctandi — BnF Ms. Latin 11269',
    ],
    images: [
      { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/Getty_Ms._Ludwig_XV_13_08r_-_Fiore_dei_Liberi_-_Unarmed_Combat_-_Google_Art_Project.jpg/1280px-Getty_Ms._Ludwig_XV_13_08r_-_Fiore_dei_Liberi_-_Unarmed_Combat_-_Google_Art_Project.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:Getty_Ms._Ludwig_XV_13_08r_-_Fiore_dei_Liberi_-_Unarmed_Combat_-_Google_Art_Project.jpg', license: 'Public domain', attribution: 'Fiore dei Liberi, Getty Ms. Ludwig XV 13', caption: 'Abrazare — the unarmed combat plays, fol. 8r' },
      { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/83/Getty_Ms._Ludwig_XV_13_01r_-_Fiore_dei_Liberi_-_Decorated_Text_Page_-_Google_Art_Project.jpg/1280px-Getty_Ms._Ludwig_XV_13_01r_-_Fiore_dei_Liberi_-_Decorated_Text_Page_-_Google_Art_Project.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:Getty_Ms._Ludwig_XV_13_01r_-_Fiore_dei_Liberi_-_Decorated_Text_Page_-_Google_Art_Project.jpg', license: 'Public domain', attribution: 'Fiore dei Liberi, Getty Ms. Ludwig XV 13', caption: 'Opening decorated text page of the Fior di Battaglia, fol. 1r' },
      { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/27/Getty_Ms._Ludwig_XV_13_37v_-_Fiore_dei_Liberi_-_Combat_with_Implements_-_Google_Art_Project.jpg/1280px-Getty_Ms._Ludwig_XV_13_37v_-_Fiore_dei_Liberi_-_Combat_with_Implements_-_Google_Art_Project.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:Getty_Ms._Ludwig_XV_13_37v_-_Fiore_dei_Liberi_-_Combat_with_Implements_-_Google_Art_Project.jpg', license: 'Public domain', attribution: 'Fiore dei Liberi, Getty Ms. Ludwig XV 13', caption: 'Armoured combat with weapons, fol. 37v' },
      { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/27/Getty_Ms._Ludwig_XV_13_47r_-_Fiore_dei_Liberi_-_Two_Horses_-_Google_Art_Project.jpg/1280px-Getty_Ms._Ludwig_XV_13_47r_-_Fiore_dei_Liberi_-_Two_Horses_-_Google_Art_Project.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:Getty_Ms._Ludwig_XV_13_47r_-_Fiore_dei_Liberi_-_Two_Horses_-_Google_Art_Project.jpg', license: 'Public domain', attribution: 'Fiore dei Liberi, Getty Ms. Ludwig XV 13', caption: 'Mounted combat plays, fol. 47r' },
      { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/ea/Pisani_Dossi_Ms._16r.jpg/1280px-Pisani_Dossi_Ms._16r.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:Pisani_Dossi_Ms._16r.jpg', license: 'Public domain', attribution: 'Fiore dei Liberi, Pisani Dossi MS', caption: 'Folio 16r of the Pisani Dossi manuscript (Flos Duellatorum, 1409)' },
    ],
    videos: [
      { youtubeId: '4GoQlvc_H3s', title: 'Fior di Battaglia — medieval longsword techniques', channel: 'Akademia Szermierzy' },
      { youtubeId: 'u_GV6Sotj9Q', title: 'The Longsword Techniques of Fiore dei Liberi: stretto plays', channel: 'swordschool' },
    ],
    links: [{ label: 'Wiktenauer — Fiore de’i Liberi', url: 'https://wiktenauer.com/wiki/Fiore_de%27i_Liberi' }],
  },
  {
    id: 'kunstdesfechtens',
    wing: 'europe',
    code: 'EUR-003',
    name: 'Kunst des Fechtens',
    alt: 'German school of fencing — the Liechtenauer tradition',
    country: 'Germany',
    region: 'Western Europe',
    people: 'Germans of the Holy Roman Empire',
    form: 'Weapon',
    era: 'c. 1320s–1600s',
    glyph: 'crossSticks',
    pose: 'overheadPole',
    wikiSlug: 'German_school_of_fencing',
    lede: 'From a priest teaching sword-and-buckler in Europe’s oldest fight-book to Liechtenauer’s cryptic verses, the German ‘Art of Fighting’ turned swordplay into scholarship.',
    history:
      'The German tradition opens with Royal Armouries MS I.33 (c. 1320s), Europe’s oldest surviving fencing manual, in which a priest instructs a scholar — and finally a woman, Walpurgis — in sword and buckler. In the later fourteenth century the grand master Johannes Liechtenauer distilled longsword fencing into a mnemonic verse Zettel, deliberately obscure to outsiders. Generations of glossators — Sigmund Ringeck, Peter von Danzig, Hans Talhoffer’s illustrated books — expounded it, while urban fencing guilds flourished. Joachim Meyer’s printed treatise (1570) carried the art into the print age before the rapier eclipsed it.',
    technique:
      'Liechtenauer’s longsword art is built on the initiative pair Vor and Nach, judging pressure at the bind (fühlen), and winding the blade (winden) to keep the point threatening. Fencers move between four principal guards — vom Tag, Ochs, Pflug, Alber — and attack with five ‘master-cuts’ that break them. The wider Kunst des Fechtens embraced messer, dagger, staff, wrestling (ringen), armoured harnischfechten with half-swording, and mounted fencing.',
    ritual:
      'This is the fight-book tradition par excellence: dozens of Fechtbücher survive, from Talhoffer’s judicial-duel tableaux to guild manuals. Imperial fencing guilds — the Marxbrüder, chartered 1487, and rival Federfechter — governed who might teach, and staged public Fechtschulen where prizes were won with blunted swords. Since the 1990s the tradition has been the backbone of the HEMA revival, its manuscripts digitised on Wiktenauer.',
    masters: [
      { name: 'Johannes Liechtenauer', note: 'Fourteenth-century grand master whose verse Zettel became the core curriculum of German fencing.', wikiSlug: 'Johannes_Liechtenauer' },
      { name: 'Sigmund Ringeck', note: 'Fifteenth-century master whose gloss unlocked Liechtenauer’s cryptic verses.', wikiSlug: 'Sigmund_Ringeck' },
      { name: 'Joachim Meyer', note: 'Strasbourg cutler-master; his 1570 printed treatise is the tradition’s great Renaissance summation.', wikiSlug: 'Joachim_Meyer' },
    ],
    diaspora: 'The Liechtenauer corpus spread across the Empire and into printed books read throughout Europe. After centuries of dormancy its manuscripts fuelled the modern HEMA movement: longsword tournaments, university clubs and translation projects now span every continent.',
    sources: [
      'Royal Armouries MS I.33 (Walpurgis Fechtbuch, c. 1320s)',
      'Nuremberg Hausbuch, GNM Hs. 3227a (c. 1400)',
      'Joachim Meyer, Gründtliche Beschreibung der Kunst des Fechtens (1570)',
    ],
    images: [
      { url: 'https://upload.wikimedia.org/wikipedia/commons/2/25/Ms_I33_fol_04v.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:Ms_I33_fol_04v.jpg', license: 'Public domain', attribution: 'Royal Armouries MS I.33', caption: 'Priest and scholar with sword and buckler, MS I.33 fol. 4v' },
      { url: 'https://upload.wikimedia.org/wikipedia/commons/c/cc/Ms_I33_fol_08r.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:Ms_I33_fol_08r.jpg', license: 'Public domain', attribution: 'Royal Armouries MS I.33', caption: 'Sword-and-buckler plays, MS I.33 fol. 8r' },
      { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/ec/De_Fechtbuch_Talhoffer_005.jpg/1280px-De_Fechtbuch_Talhoffer_005.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:De_Fechtbuch_Talhoffer_005.jpg', license: 'Public domain', attribution: 'Hans Talhoffer, Fechtbuch', caption: 'Longsword plate from Hans Talhoffer’s fight-book' },
      { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/84/De_Fechtbuch_Talhoffer_073.jpg/1280px-De_Fechtbuch_Talhoffer_073.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:De_Fechtbuch_Talhoffer_073.jpg', license: 'Public domain', attribution: 'Hans Talhoffer, Fechtbuch', caption: 'Combat plate from Talhoffer’s Fechtbuch' },
    ],
    videos: [
      { youtubeId: 'MSXBx7UX45U', title: 'Unlocking I.33 — The Tactics in Medieval Sword and Buckler', channel: 'Federico Malagutti HEMA' },
      { youtubeId: 'dbXhHJEI5Hc', title: 'I.33 Sword & Buckler: Durchtreten / Tread-Through', channel: 'Schildwache Potsdam' },
    ],
    links: [{ label: 'Wiktenauer — Johannes Liechtenauer', url: 'https://wiktenauer.com/wiki/Johannes_Liechtenauer' }],
  },
  {
    id: 'destreza',
    wing: 'europe',
    code: 'EUR-004',
    name: 'Destreza',
    alt: 'La Verdadera Destreza — ‘The True Skill’',
    country: 'Spain',
    region: 'Southern Europe',
    people: 'Spaniards of the Habsburg Golden Age',
    form: 'Weapon',
    era: '1569 — 18th century',
    glyph: 'crossSticks',
    pose: 'spearLunge',
    wikiSlug: 'Destreza',
    lede: 'Spanish swordsmen walked a geometer’s circle, rapier held at the right angle, turning the duel into applied Euclid.',
    history:
      'La Verdadera Destreza was founded by Jerónimo Sánchez de Carranza, whose De la Filosofía de las Armas (written 1569, published 1582) rejected the rough esgrima vulgar in favour of a science of fencing grounded in geometry, natural philosophy and Christian ethics. His successor Luis Pacheco de Narváez systematised the doctrine in Libro de las grandezas de la espada (1600) and rose to fencing master at the Madrid court. Destreza dominated the Spanish world through the seventeenth and eighteenth centuries, and Girard Thibault’s monumental Académie de l’Espée (1628) carried its circle north.',
    technique:
      'The diestro stands profiled behind a rapier held at the ‘right angle’, arm extended, and moves along the imagined circle between the fencers by compás — circular and transversal steps that gain the profile while denying the line. The atajo subjects the opponent’s blade; classifications of natural and violent movement predict what can follow. Thrusts dominate, but cuts remain, and the off-hand, dagger or cloak assists. Distance — the medio de proporción — is managed with mathematical care.',
    ritual:
      'Destreza was as much a literary culture as a fighting one: treatises argued from Euclid and Aristotle, masters waged printed polemics, and examinations licensed teachers of arms. The rapier itself, the espada ropera, was worn as costume, making the art a discipline of honour for gentlemen navigating the duel. Thibault’s engraved circles turned doctrine into baroque spectacle. Modern HEMA groups, notably in Spain, have revived the system from these texts.',
    masters: [
      { name: 'Jerónimo Sánchez de Carranza', note: 'Sevillian knight and author of De la Filosofía de las Armas (1582); ‘father’ of the True Skill.', wikiSlug: 'Jerónimo_Sánchez_de_Carranza' },
      { name: 'Luis Pacheco de Narváez', note: 'Carranza’s systematiser and fencing master to Philip IV.', wikiSlug: 'Luis_Pacheco_de_Narváez' },
      { name: 'Girard Thibault', note: 'Antwerp master whose Académie de l’Espée (1628) exported the Spanish circle in lavish engravings.' },
    ],
    diaspora: 'Destreza travelled with the Spanish empire to Italy, Flanders, the Americas and the Philippines, and its geometric method influenced fencing theory across Europe. After fading before the French smallsword school, it was revived from its treatises by modern historical fencing associations.',
    sources: [
      'Jerónimo Sánchez de Carranza, De la Filosofía de las Armas (1582)',
      'Luis Pacheco de Narváez, Libro de las grandezas de la espada (1600)',
      'Girard Thibault, Académie de l’Espée (1628)',
    ],
    images: [
      { url: 'https://upload.wikimedia.org/wikipedia/commons/2/25/Gerard_Thibault_Mysterious_Circle.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:Gerard_Thibault_Mysterious_Circle.jpg', license: 'Public domain', attribution: 'Girard Thibault, Académie de l’Espée', caption: 'Thibault’s ‘mysterious circle’, the geometric heart of destreza-derived fencing' },
      { url: 'https://upload.wikimedia.org/wikipedia/commons/c/cc/Girard_Thibault_-_Academie_de_l-Espee_1628_Met._museum.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:Girard_Thibault_-_Academie_de_l-Espee_1628_Met._museum.jpg', license: 'Public domain', attribution: 'Girard Thibault (1628), Met Museum copy', caption: 'Engraving from the Académie de l’Espée (1628)' },
      { url: 'https://upload.wikimedia.org/wikipedia/commons/1/1c/Luis_Pacheco_de_Narvaez.JPG', pageUrl: 'https://commons.wikimedia.org/wiki/File:Luis_Pacheco_de_Narvaez.JPG', license: 'Public domain', attribution: 'Wikimedia Commons', caption: 'Luis Pacheco de Narváez, systematiser of la Verdadera Destreza' },
      { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f6/Antiguos_tratados_de_esgrima_%28siglo_XVII%29.jpg/1280px-Antiguos_tratados_de_esgrima_%28siglo_XVII%29.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:Antiguos_tratados_de_esgrima_(siglo_XVII).jpg', license: 'Public domain', attribution: 'Pacheco de Narváez; Cristóbal de Cala', caption: 'Plates from 17th-century Spanish fencing treatises' },
    ],
    videos: [
      { youtubeId: 'NTxm74bIlJU', title: 'La Verdadera Destreza: fencing on the circle with rapier and dagger', channel: 'Martinez Academy' },
      { youtubeId: 'm7w0d3bNI28', title: 'The first stage of Verdadera Destreza — Ton Puey', channel: 'Schildwache Potsdam' },
    ],
    links: [{ label: 'Wiktenauer — Verdadera Destreza', url: 'https://www.wiktenauer.com/wiki/Verdadera_Destreza' }],
  },
  {
    id: 'glima',
    wing: 'europe',
    code: 'EUR-005',
    name: 'Glima',
    alt: 'Glíma — Iceland’s national wrestling',
    country: 'Iceland',
    region: 'Northern Europe',
    people: 'Icelanders, heirs of Norse settlers',
    form: 'Grappling',
    era: 'Viking Age — present',
    glyph: 'grapplRing',
    pose: 'collarClinch',
    wikiSlug: 'Glíma',
    lede: 'Iceland’s national sport is a courteous Viking inheritance: two wrestlers grip each other’s belts, step in a shared rhythm, and try to dance one another off their feet.',
    history:
      'Glima came to Iceland with Norse settlers and surfaces in the medieval sagas — Grettis saga among them — as fang, the wrestling of farmers, sailors and heroes. Preserved through centuries of rural life, it was formalised around the trouser- and belt-grip (brókartök), and in 1906 became Iceland’s national sport with the founding of the Íslandsglíman championship for the Grettir’s Belt, still contested today. Jóhannes Jósefsson demonstrated glima at the 1908 London Olympics and later showcased it across America.',
    technique:
      'Wrestlers take a fixed grip on each other’s harness — one hand at the hip, the other at the thigh — stand upright, and circle clockwise in the stepping rhythm called stígandi. From this shared motion come the brögð, the named tricks: hip throws, inside and outside leg hooks, the cross-buttock and heel-trips, executed with timing and leverage rather than strength. A fall is scored when an opponent touches the ground between elbow and knee.',
    ritual:
      'Glima is wrapped in a code of drengskapur — sportsmanlike honour — with upright posture, the pre-bout handshake and a ban on brute-force stalling all enforced. The Íslandsglíman crowns the ‘Glima King’ with the Grettir’s Belt, Iceland’s oldest sporting trophy. School and festival glima kept the art alive through the twentieth century, and the looser lausatök style has been revived abroad as ‘combat glima’.',
    masters: [
      { name: 'Jóhannes Jósefsson', note: 'Icelandic glima champion who demonstrated the art at the 1908 Olympics and toured internationally.', wikiSlug: 'Johannes_Josefsson' },
      { name: 'Pétur Eyþórsson', note: 'Modern multiple Icelandic glima champion and Grettir’s Belt holder.', wikiSlug: 'Pétur_Eyþórsson' },
    ],
    diaspora: 'Icelandic emigrants and touring champions carried glima to North America’s stages and gymnasiums in the early twentieth century. Today clubs in Scandinavia, Europe and North America practise both the traditional belt style and revived lausatök forms.',
    sources: [
      'Grettis saga (13th century) — saga accounts of Icelandic wrestling',
      'Jóhannes Jósefsson, Icelandic Wrestling (1908)',
      'Glímusamband Íslands — Íslandsglíman records (est. 1906)',
    ],
    images: [
      { url: 'https://upload.wikimedia.org/wikipedia/commons/6/69/Glima_Wrestling.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:Glima_Wrestling.jpg', license: 'CC BY 3.0', attribution: 'Eythorsson, via Wikimedia Commons', caption: 'Glima wrestlers in the fixed belt-and-thigh grip' },
      { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/18/Reykjavik_IJslands_worstelen_%28Glima%29_leden_van_het_glimateam_van_de_Menntaskol%2C_Bestanddeelnr_190-0262.jpg/1280px-Reykjavik_IJslands_worstelen_%28Glima%29_leden_van_het_glimateam_van_de_Menntaskol%2C_Bestanddeelnr_190-0262.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:Reykjavik_IJslands_worstelen_(Glima)_leden_van_het_glimateam_van_de_Menntaskol,_Bestanddeelnr_190-0262.jpg', license: 'CC0', attribution: 'Willem van de Poll (1934), Nationaal Archief', caption: 'Reykjavík school glima team, 1934' },
      { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/94/Reykjavik._IJslands_worstelen_%28Glima%29._Twee_leden_van_het_glimateam_van_de_Mennt%2C_Bestanddeelnr_190-0273.jpg/1280px-Reykjavik._IJslands_worstelen_%28Glima%29._Twee_leden_van_het_glimateam_van_de_Mennt%2C_Bestanddeelnr_190-0273.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:Reykjavik._IJslands_worstelen_(Glima)._Twee_leden_van_het_glimateam_van_de_Mennt,_Bestanddeelnr_190-0273.jpg', license: 'CC0', attribution: 'Willem van de Poll (1934), Nationaal Archief', caption: 'Two glima wrestlers mid-throw, Reykjavík 1934' },
    ],
    videos: [
      { youtubeId: 'REf65UaTOxY', title: 'Glima | Icelandic Wrestling', channel: 'Trans World Sport' },
      { youtubeId: 'G4i5-siRedk', title: 'Glíma: Icelandic Grappling', channel: 'Jackson Crawford' },
    ],
    links: [{ label: 'Glímusamband Íslands (Icelandic Glima Association)', url: 'https://glima.is/' }],
  },
  {
    id: 'savate',
    wing: 'europe',
    code: 'EUR-006',
    name: 'Savate',
    alt: 'Boxe française · la boxe française savate',
    country: 'France',
    region: 'Western Europe',
    people: 'French — Parisian street fighters, Marseille sailors, then salle gentlemen',
    form: 'Striking',
    era: 'early 19th century — present',
    glyph: 'openHand',
    pose: 'crossPunch',
    wikiSlug: 'Savate',
    lede: 'Born of Parisian street kicks and Marseille sailors’ chausson, savate was tamed into an elegant science of the booted foot and gloved fist.',
    history:
      'Savate — ‘old shoe’ — began as the street kicking of early nineteenth-century Paris and the shipboard chausson of Marseille sailors. Michel Casseux, opening a salle in 1825, first codified the rough art; his pupil Charles Lecour, after sparring English boxers around 1830, married French kicks to English punches and created la boxe française. The Charlemont family’s academies refined it into a gentleman’s science, and it appeared as a demonstration sport at the 1924 Paris Olympics. Devastated by the loss of masters in the World Wars, savate was rebuilt after 1945 under a national federation.',
    technique:
      'Savate strikes with the shoe: the whipping fouetté, the piston-like chassé, the low coup de pied bas and the spinning revers, delivered to precise targets at three heights, are combined with the four punches of English boxing. The style prizes line, distance and elegance — kicks are thrown from the edge of range with the body profiled, and combinations chain fist to foot. Practice divides into assaut, where touch and control score, and combat, the full-contact form.',
    ritual:
      'Savate carries its salle culture proudly: practitioners are tireurs, ranked not by belts but by coloured glove grades culminating in the silver glove. Its sibling art, canne de combat, preserves the walking-stick fencing of the same Parisian schools. The 1924 Olympic demonstration remains a badge of honour, and the federation now stages world championships in both assaut and combat.',
    masters: [
      { name: 'Michel Casseux', note: '‘Pisseux’ (1794–1869), opened the first salle in 1825 and gave street savate its first code.', wikiSlug: 'Michel_Casseux' },
      { name: 'Charles Lecour', note: 'Fused savate’s kicks with English boxing’s punches c. 1830s, creating la boxe française.', wikiSlug: 'Charles_Lecour' },
      { name: 'Joseph Charlemont', note: 'Author of La Boxe française (1877); his academy defined the classical style.', wikiSlug: 'Joseph_Charlemont' },
    ],
    diaspora: 'Savate spread through francophone Europe and, via international federations, to clubs on every continent; its kicking science influenced kickboxing pioneers and modern MMA strikers. Canne de combat travels with it as France’s stick-fighting heritage.',
    sources: [
      'Joseph Charlemont, La Boxe française, traité théorique et pratique (1877)',
      'Théophile Gautier — essays on savate and chausson (mid-19th century)',
      'Fédération Française de Savate — federation records',
    ],
    images: [
      { url: 'https://upload.wikimedia.org/wikipedia/commons/6/68/Savate-technics.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:Savate-technics.jpg', license: 'Public domain', attribution: 'Leclerc Ainé', caption: 'Historical technical plate of savate techniques' },
      { url: 'https://upload.wikimedia.org/wikipedia/commons/9/9d/Bleu_a_la_savate.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:Bleu_a_la_savate.jpg', license: 'Public domain', attribution: 'Wikimedia Commons', caption: 'Nineteenth-century print of a savate kick' },
      { url: 'https://upload.wikimedia.org/wikipedia/commons/0/01/Savate_%28colorized%29.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:Savate_(colorized).jpg', license: 'Public domain', attribution: 'Wikimedia Commons', caption: 'Colourised 19th-century illustration of savate practice' },
      { url: 'https://upload.wikimedia.org/wikipedia/commons/3/3e/Savate_chass%C3%A9_1.JPG', pageUrl: 'https://commons.wikimedia.org/wiki/File:Savate_chass%C3%A9_1.JPG', license: 'CC BY-SA 3.0', attribution: 'Claude Buret, via Wikimedia Commons', caption: 'A chassé thrown in modern savate competition' },
    ],
    videos: [
      { youtubeId: 'YUb9KlBjWJM', title: 'Ever heard of savate? We took a swing at the French combat sport', channel: 'CBC News' },
      { youtubeId: 'XH0JHS1lVIo', title: 'From Street Thugs to Gentlemen: The Story of Savate', channel: 'Augustus Roe' },
    ],
    links: [{ label: 'Fédération Française de Savate Boxe Française', url: 'https://www.ffsavate.com/' }],
  },
  {
    id: 'pugilism',
    wing: 'europe',
    code: 'EUR-007',
    name: 'Pugilism',
    alt: 'English bare-knuckle prizefighting',
    country: 'England',
    region: 'Western Europe',
    people: 'English — from fairground bruisers to the aristocratic ‘Fancy’',
    form: 'Striking',
    era: '1719–1867 (bare-knuckle era)',
    glyph: 'openHand',
    pose: 'crossPunch',
    wikiSlug: 'Bare-knuckle_boxing',
    lede: 'On turf squares roped before roaring crowds, England’s bare-knuckle champions turned fistfighting into the first modern prize sport.',
    history:
      'James Figg, England’s first recognised champion, opened his London amphitheatre in 1719 and fought all comers with fist, cudgel and backsword. After an opponent died of his injuries, champion Jack Broughton published boxing’s first rules in 1743 — the round-ending knockdown, the thirty-second count, no hitting a downed man — and invented ‘mufflers’, ancestor of the glove. Daniel Mendoza’s scientific defence in the 1780s–90s transformed technique; the London Prize Ring rules (1838) refined the code; and the Queensberry rules of 1867 brought gloves and timed rounds, closing the bare-knuckle era.',
    technique:
      'The bare-knuckle pugilist stood more upright than a modern boxer, weight back, fists held low and vertical to spare fragile hands, favouring straight lefts, body ‘milling’ and the chopping blow. Under prize-ring rules wrestling was part of the game: the cross-buttock throw and holds above the waist could end a round as surely as a knockdown. Rounds lasted until a man fell; craft lay in sparring, distance and ‘bottom’ — the endurance to come up to scratch again.',
    ritual:
      'Prizefighting built its own world: the roped square on turf, seconds and bottle-holders in the corners, stakes and side-bets, and the aristocratic followers known as the Fancy, chronicled in Pierce Egan’s Boxiana. Fights were illegal yet patronised by peers and immortalised in prints like those of the Cribb–Molineaux battles. The tradition’s memory shapes boxing lore, and regulated bare-knuckle promotions have revived the form today.',
    masters: [
      { name: 'James Figg', note: 'First champion of England (from 1719); master of fist, cudgel and sword at his London amphitheatre.', wikiSlug: 'James_Figg' },
      { name: 'Jack Broughton', note: 'Champion and rule-giver (1743); his code and ‘mufflers’ civilised the prize ring.', wikiSlug: 'Jack_Broughton' },
      { name: 'Daniel Mendoza', note: 'Champion 1792–95; his scientific, defensive style revolutionised boxing technique.', wikiSlug: 'Daniel_Mendoza' },
    ],
    diaspora: 'English pugilism crossed the Atlantic with emigrant fighters and the prize-ring code, seeding American boxing and its first great champions. The Queensberry reform it provoked became the global sport of boxing, while the bare-knuckle inheritance survives in regulated modern leagues and in boxing’s ritual vocabulary — ‘up to scratch’, ‘throwing in the towel’.',
    sources: [
      'Broughton’s Rules (London, 1743)',
      'Pierce Egan, Boxiana; or, Sketches of Ancient and Modern Pugilism (1812–29)',
      'Marquess of Queensberry Rules (1867)',
    ],
    images: [
      { url: 'https://upload.wikimedia.org/wikipedia/commons/6/65/Cribb_vs_Molineaux_1811.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:Cribb_vs_Molineaux_1811.jpg', license: 'Public domain', attribution: 'George Cruikshank', caption: 'Tom Cribb versus Tom Molineaux, 1811' },
      { url: 'https://upload.wikimedia.org/wikipedia/commons/c/cd/James_Figg.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:James_Figg.jpg', license: 'Public domain', attribution: 'John Faber Jr, after John Ellys', caption: 'James Figg, England’s first boxing champion' },
      { url: 'https://upload.wikimedia.org/wikipedia/commons/4/48/Daniel_Mendoza.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:Daniel_Mendoza.jpg', license: 'Public domain', attribution: 'Henry Kingsbury, 1789', caption: 'Daniel Mendoza in sparring attitude, 1789 engraving' },
      { url: 'https://upload.wikimedia.org/wikipedia/commons/1/10/The_Battle_Between_Crib_and_Molineaux%2C_September_28%2C_1811_MET_DP877152.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:The_Battle_Between_Crib_and_Molineaux,_September_28,_1811_MET_DP877152.jpg', license: 'CC0', attribution: 'George Cruikshank / The Metropolitan Museum of Art', caption: 'The Battle Between Crib and Molineaux, 28 September 1811' },
    ],
    videos: [
      { youtubeId: 'wcF6Fw-rIDs', title: 'Pugilism Profiles: James Figg', channel: 'Toe The Line BKB' },
    ],
    links: [{ label: 'Britannica — Boxing: the bare-knuckle era', url: 'https://www.britannica.com/sports/boxing/The-bare-knuckle-era' }],
  },
  {
    id: 'catchwrestling',
    wing: 'europe',
    code: 'EUR-008',
    name: 'Catch Wrestling',
    alt: 'Catch-as-catch-can — the Lancashire style',
    country: 'England',
    region: 'Western Europe',
    people: 'Lancashire colliers and mill workers',
    form: 'Grappling',
    era: 'mid-19th century — present',
    glyph: 'ashTake',
    pose: 'lowShot',
    wikiSlug: 'Catch_wrestling',
    lede: 'From Lancashire pit villages came a wrestling style where any hold was fair and a ‘hooker’ could end a match with a single cranked joint.',
    history:
      'Catch-as-catch-can grew in the mining and mill towns of nineteenth-century Lancashire, where colliers wrestled for side-stakes under rules allowing grips on any part of the body and victory by pin or submission. Fairground athletic booths, where wrestlers met all comers, hardened the craft and bred the feared ‘hookers’. The style crossed the Atlantic — Frank Gotch’s 1908 defeat of Georg Hackenschmidt made it America’s biggest sport — while in Wigan, Billy Riley’s Snake Pit gym (founded 1948) forged champions like Billy Robinson and Karl Gotch, who carried catch to Japan.',
    technique:
      'Catch wrestling is won two ways — pin the shoulders or force a concession — so control and pain travel together. Its hallmark is relentless top pressure: rides, cross-faces and wrist control wear an opponent down while the hooker hunts the double wristlock, toeholds, cradles and neck cranks. Takedowns come from any grip ‘as catch can’. Conditioning is doctrine; the Lancashire tradition prized brutal fitness and chain wrestling that flows from hold to hold without pause.',
    ritual:
      'Catch’s culture is the challenge culture: fairground booths where locals bet they could survive ten minutes, miners’ matches wagered on pay-day, and the apprenticeship of the gym — most famously Riley’s bare brick shed at Aspull, nicknamed the Snake Pit, where sessions were themselves initiations. Its championships blurred into early professional wrestling, which descends from it. The modern revival runs camps and tournaments at the rebuilt Snake Pit in Wigan.',
    masters: [
      { name: 'Billy Riley', note: 'Wigan master and founder of the Snake Pit (1948), the crucible of Lancashire catch.', wikiSlug: 'Billy_Riley' },
      { name: 'Frank Gotch', note: 'American world champion whose 1908 win over Hackenschmidt crowned catch’s golden age.', wikiSlug: 'Frank_Gotch' },
      { name: 'Karl Gotch', note: 'Snake Pit-trained ‘God of Wrestling’ who transplanted catch to Japan and trained its strong-style founders.', wikiSlug: 'Karl_Gotch' },
    ],
    diaspora: 'Catch seeded American collegiate and professional wrestling, and via Karl Gotch and Billy Robinson shaped Japanese strong style, shoot wrestling and ultimately mixed martial arts, where its leglocks and neck cranks resurfaced. Wigan’s Snake Pit remains the style’s pilgrimage site.',
    sources: [
      'Mark S. Hewitt, Catch Wrestling (2005)',
      'Snake Pit Wigan club history (Aspull Olympic Wrestling Club, est. 1948)',
    ],
    images: [
      { url: 'https://upload.wikimedia.org/wikipedia/commons/7/7f/Frank_Gotch_vs_Georg_Hackenschmidt_1908.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:Frank_Gotch_vs_Georg_Hackenschmidt_1908.jpg', license: 'Public domain', attribution: 'Wikimedia Commons (1908 photograph)', caption: 'Frank Gotch versus Georg Hackenschmidt, Chicago 1908' },
      { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/58/Edwin_Bibby%2C_Catch_as_Catch_Can-_Wrestler%2C_from_World%27s_Champions%2C_Second_Series_%28N43%29_for_Allen_%26_Ginter_Cigarettes_MET_DP839307.jpg/1280px-Edwin_Bibby%2C_Catch_as_Catch_Can-_Wrestler%2C_from_World%27s_Champions%2C_Second_Series_%28N43%29_for_Allen_%26_Ginter_Cigarettes_MET_DP839307.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:Edwin_Bibby,_Catch_as_Catch_Can-_Wrestler,_from_World%27s_Champions,_Second_Series_(N43)_for_Allen_%26_Ginter_Cigarettes_MET_DP839307.jpg', license: 'CC0', attribution: 'Allen & Ginter / The Metropolitan Museum of Art', caption: 'Edwin Bibby, Lancashire-born catch-as-catch-can champion, 1888 trade card' },
      { url: 'https://upload.wikimedia.org/wikipedia/commons/3/39/Billy_Meeske_demonstrating_toehold%2C_1924.png', pageUrl: 'https://commons.wikimedia.org/wiki/File:Billy_Meeske_demonstrating_toehold,_1924.png', license: 'Public domain', attribution: 'The Daily Telegraph, 1924', caption: 'The toehold — a signature catch wrestling submission, demonstrated 1924' },
    ],
    videos: [
      { youtubeId: '-LjrjnPLV1o', title: 'The Wigan Snake Pit', channel: 'Figure Four Films' },
    ],
    links: [{ label: 'Snake Pit Wigan — history', url: 'https://www.snakepitwigan.com/history/' }],
  },
  {
    id: 'bataireacht',
    wing: 'europe',
    code: 'EUR-009',
    name: 'Bataireacht',
    alt: 'Irish stick fighting — shillelagh fighting, troid de bata',
    country: 'Ireland',
    region: 'Western Europe',
    people: 'Irish — rural faction fighters and their diaspora',
    form: 'Weapon',
    era: '17th–19th century — modern revival',
    glyph: 'twinStick',
    pose: 'twinSticks',
    wikiSlug: 'Shillelagh',
    lede: 'With a knob-headed blackthorn in hand, Irish faction fighters turned fair days into pitched battles — and left behind a subtle stick art.',
    history:
      'Bataireacht is the Irish art of fighting with the bata or shillelagh, the cured blackthorn or oak stick that doubled as a gentleman’s cane and a peasant’s sword. It reached its notorious peak in the faction fights of the eighteenth and nineteenth centuries, when rival bands — Caravats and Shanavests among them — met by the hundreds at fairs such as Donnybrook. Suppressed by clergy, courts and post-Famine social change, the art faded in Ireland but survived in emigrant families, most famously the Doyle family of Newfoundland, and is now revived by dedicated schools.',
    technique:
      'The classic grip takes the stick a third of the way up, the lower portion shielding the forearm and elbow — a guard unlike sabre or cane systems. From a high hanging guard the fighter throws whipping knuckle-led strikes, thrusts with the butt, and tight parries, the free hand checking, seizing or striking. Doyle-style bata adds a two-handed, boxing-influenced method. Footwork favours short shifts and angling; wrestling closes and trips finish what the stick begins.',
    ritual:
      'Faction fighting had its own liturgy: the challenge of ‘wheeling’ — parading the stick while shouting one’s party cry — opened battles at fairs, and sticks themselves were crafted objects, blackthorn cut in winter and cured until they gleamed. Nineteenth-century manuals like Donald Walker’s Defensive Exercises recorded Irish cudgel methods for polite readers. The art’s memory endured in song and the diaspora’s family transmissions, and today’s revival teaches it as living intangible heritage.',
    masters: [
      { name: 'Glen Doyle', note: 'Newfoundland inheritor of the Doyle family’s two-handed bataireacht, publicly teaching a documented family lineage.' },
      { name: 'John W. Hurley', note: 'Historian of the shillelagh whose research underpins the modern revival.' },
      { name: 'Maxime Chouinard', note: 'Máistir pionsa of Antrim Bata, leading the international revival of the County Antrim style.' },
    ],
    diaspora: 'Emigration carried stick traditions to Newfoundland, the United States and Britain, where family styles like Doyle bata survived the art’s decline at home. Since the 2000s revival schools and study groups across North America, Europe and Ireland have returned bataireacht to active practice.',
    sources: [
      'John W. Hurley, Shillelagh: The Irish Fighting Stick (2007)',
      'Donald Walker, Defensive Exercises (1840)',
      'Allanson-Winn & Phillipps-Wolley, Broad-Sword and Single-Stick (1890)',
    ],
    images: [
      { url: 'https://upload.wikimedia.org/wikipedia/commons/7/78/Erskine_Nicol_%281825-1904%29_-_Donnybrook_Fair_-_N04652_-_National_Gallery.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:Erskine_Nicol_(1825-1904)_-_Donnybrook_Fair_-_N04652_-_National_Gallery.jpg', license: 'Public domain', attribution: 'Erskine Nicol, National Gallery', caption: 'Erskine Nicol, Donnybrook Fair — the fair ground synonymous with faction fighting' },
      { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6a/Erskine_nicol%2C_fiera_di_donnybrook%2C_1859%2C_04_lite.jpg/1280px-Erskine_nicol%2C_fiera_di_donnybrook%2C_1859%2C_04_lite.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:Erskine_nicol,_fiera_di_donnybrook,_1859,_04_lite.jpg', license: 'CC BY 3.0', attribution: 'Erskine Nicol (1859), photo Sailko', caption: 'Detail of a quarrel breaking out, Nicol’s Donnybrook Fair (1859)' },
      { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8c/Shillelaghs_in_various_stages_of_completion.jpg/1280px-Shillelaghs_in_various_stages_of_completion.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:Shillelaghs_in_various_stages_of_completion.jpg', license: 'CC0', attribution: 'DickClarkMises, via Wikimedia Commons', caption: 'Shillelaghs in various stages of completion — the stick-maker’s craft' },
      { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2c/Shillelagh_02.jpg/1280px-Shillelagh_02.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:Shillelagh_02.jpg', license: 'CC BY-SA 4.0', attribution: 'Schurdl, via Wikimedia Commons', caption: 'A finished knob-headed shillelagh' },
    ],
    videos: [
      { youtubeId: 'fcH0ww_Jbfg', title: 'Doyle Shillelagh — Irish stick fighting (bataireacht)', channel: 'Harmony Fist' },
      { youtubeId: 'gUlw4zDdGto', title: 'The Lost Art of Irish Stick Fighting: Secrets of the Shillelagh', channel: 'Bertie Brosnan' },
    ],
    links: [{ label: 'Irish Stick Fighting / Antrim Bata', url: 'https://irishstick.wordpress.com/' }],
  },

  // ═══ VOL. IV — ARTS OF THE AMERICAS & DIASPORA ═════════════════════════════
  {
    id: 'capoeira',
    wing: 'americas',
    code: 'AMS-001',
    name: 'Capoeira',
    alt: 'Jogo de capoeira · capoeiragem',
    country: 'Brazil',
    region: 'South America',
    people: 'Afro-Brazilian communities, historically enslaved Central Africans and their descendants',
    form: 'Hybrid / Acrobatic',
    era: '18th century — present · UNESCO 2014',
    glyph: 'invertKick',
    pose: 'inverted',
    wikiSlug: 'Capoeira',
    lede: 'Inside a ring of song and berimbau twang, two players trade cartwheels, feints and sweeping kicks in a game that once had to disguise itself to survive.',
    history:
      'In Brazil, capoeira grew among enslaved Africans and their free descendants — its engolo taproot is treated in Volume I. Nineteenth-century Rio knew it through street maltas; painters Rugendas and Earle recorded it in the 1820s. After abolition, the 1890 Penal Code criminalized capoeiragem outright, driving it underground for four decades. In 1930s Bahia, Mestre Bimba forged the codified Regional style and opened an authorized academy, while Mestre Pastinha institutionalized Capoeira Angola as guardian of tradition. Brazil declared the roda national heritage in 2008; UNESCO inscribed the capoeira circle in 2014.',
    technique:
      'Everything rides on the ginga, a rocking base step that keeps the player perpetually in motion. From it flow crescent and spinning kicks (meia-lua, armada), rasteira sweeps, headbutts, and escapes — esquivas, rolês, aú cartwheels — that trade blocking for evasion. Play is dialogic: the aim is to ask questions the partner cannot answer, prizing malícia (cunning) over impact. The berimbau’s toque sets the game — low, coiled and slow for Angola; faster and more upright in Regional.',
    ritual:
      'Capoeira happens inside the roda, a human circle closed by the bateria: berimbaus of three sizes, pandeiro, atabaque and agogô. In Angola rodas a solo ladainha litany opens play before call-and-response corridos; players crouch at the foot of the berimbau and enter only on its signal. Songs comment on the game in real time, and the drum-bow can call players back, slow a heated game, or bless it. Regional lineages add batizado ceremonies where students receive apelidos — capoeira nicknames.',
    masters: [
      { name: 'Mestre Bimba', note: 'Bahian mestre who created Capoeira Regional and in the 1930s won legal standing for the first capoeira academy.', wikiSlug: 'Manuel_dos_Reis_Machado' },
      { name: 'Mestre Pastinha', note: 'Philosopher-guardian of Capoeira Angola, whose Salvador academy anchored the traditionalist lineage from 1941.', wikiSlug: 'Vicente_Ferreira_Pastinha' },
    ],
    diaspora: 'Capoeira is now practiced in well over 150 countries, carried abroad from the 1970s by Brazilian mestres. Academies from Tokyo to Lagos teach Angola, Regional and Contemporânea lineages, and the roda functions worldwide as a portable piece of Afro-Brazilian identity — a spread UNESCO’s 2014 inscription explicitly recognizes. Its African origin is Volume I’s Engolo accession.',
    sources: [
      'M. R. Assunção, Capoeira: The History of an Afro-Brazilian Martial Art (Routledge, 2005)',
      'Desch-Obi, Fighting for Honor (USC Press, 2008)',
      'UNESCO ICH nomination file 00892 — Capoeira circle (2014)',
    ],
    images: [
      { url: 'https://upload.wikimedia.org/wikipedia/commons/5/51/CapoeiraEarle_02.JPG', pageUrl: 'https://commons.wikimedia.org/wiki/File:CapoeiraEarle_02.JPG', license: 'Public domain', attribution: 'Augustus Earle', caption: 'Augustus Earle’s painting of capoeira play in Rio during the era when the game was illegal' },
      { url: 'https://upload.wikimedia.org/wikipedia/commons/c/c6/Capoeira_in_Bahia_1835.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:Capoeira_in_Bahia_1835.jpg', license: 'Public domain', attribution: 'Johann Moritz Rugendas', caption: 'San Salvador (Bahia), engraved by Rugendas for Voyage Pittoresque dans le Brésil' },
      { url: 'https://upload.wikimedia.org/wikipedia/commons/5/57/Roda_de_Capoeira_Angola.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:Roda_de_Capoeira_Angola.jpg', license: 'CC BY-SA 4.0', attribution: 'Ayres Alves de Lima Sales, via Wikimedia Commons', caption: 'A modern roda of Capoeira Angola — inscribed by UNESCO in 2014' },
      { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/cf/Roda_de_Capoeira_tradicional_do_Engenho_da_Rainha_5.jpg/1280px-Roda_de_Capoeira_tradicional_do_Engenho_da_Rainha_5.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:Roda_de_Capoeira_tradicional_do_Engenho_da_Rainha_5.jpg', license: 'CC BY-SA 4.0', attribution: 'Estela Neto, via Wikimedia Commons', caption: 'Traditional community roda at Engenho da Rainha, Rio de Janeiro' },
    ],
    videos: [
      { youtubeId: 'Vhgot9H7vZw', title: 'Capoeira circle — official UNESCO inscription film', channel: 'UNESCO' },
      { youtubeId: 'HE9Ps1_13Sg', title: 'The story of Capoeira: From Angola to Brazil', channel: 'BBC News Africa' },
    ],
    links: [{ label: 'UNESCO ICH — Capoeira circle', url: 'https://ich.unesco.org/en/RL/capoeira-circle-00892' }],
  },
  {
    id: 'grima',
    wing: 'americas',
    code: 'AMS-002',
    name: 'Grima',
    alt: 'Esgrima de machete y bordón',
    country: 'Colombia',
    region: 'South America',
    people: 'Afro-Colombian communities of the Cauca valley (Puerto Tejada, Caloto)',
    form: 'Weapon',
    era: 'colonial era — present',
    glyph: 'crossSticks',
    pose: 'twinSticks',
    wikiSlug: 'Colombian_grima',
    lede: 'In the sugarcane towns of the Cauca valley, elderly maestros still cross machetes in a fencing art whose secrets were handwritten into books meant to be burned.',
    history:
      'Grima — a contraction of Spanish esgrima, fencing — was forged by enslaved Africans and their descendants in Colombia’s Cauca valley, fusing African fighting traditions with European swordplay around the cane-cutter’s machete. Cauca macheteros fought in the wars of independence and the nineteenth-century civil wars; the grima experts of Caloto Viejo formed the feared macheteros de la muerte, and Afro-Colombian veterans leveraged this military service in the struggles that ended slavery in the 1850s. Its techniques are recorded in cartillas, handwritten illustrated manuals passed from master to disciple — and burned at an heirless master’s death.',
    technique:
      'The classic armament pairs a machete in the strong hand with a bordón — a defensive staff or stick — in the other; advanced players train manca drills with two blades at once. Instruction proceeds through named guards and counters — academy photographs document paradas such as la tremenda and la carga — and through distinct juegos, regional styles with names like relancino and remonte. The pedagogy prizes malicia: deception, reading the opponent, and reserving one’s best movements.',
    ritual:
      'Grima’s ceremonial frame is the cartilla and the academy rather than a drum circle. The manuals interleave fencing lessons with prayers, oraciones and cultural memory, making transmission itself a rite: a disciple inherits a book as much as a repertoire. Exhibition bouts at local fiestas in Puerto Tejada and Caloto display controlled near-miss bladework before the community, and the master–disciple bond carries the obligations once attached to battlefield brotherhood.',
    masters: [
      { name: 'Héctor Elías Sandoval', note: 'Maestro of the Academia de Esgrima de Machete y Bordón of Puerto Tejada, documented demonstrating the paradas la tremenda and la carga.' },
      { name: 'Luis Vidal', note: 'Puerto Tejada academy maestro, photographed in paired demonstration with Sandoval.' },
      { name: 'Miguel Lourido', note: 'Maestro of the Puerto Tejada academy, featured in reporting on the art’s heritage campaign.' },
    ],
    diaspora: 'Grima has traveled mainly through Afro-Colombian migration to Cali and Bogotá, while international attention has come from historical-fencing researchers and from the British Library’s digitization of the cartillas, which put this once-secret manuscript tradition before a global audience for the first time.',
    sources: [
      'British Library EAP650 — ‘Grima in Caloto Viejo: archiving Afro-Colombian history’',
      'Global Voices — ‘The last masters of Afro-Colombian machete fencing’ (2025)',
      'Desch-Obi, Fighting for Honor (USC Press, 2008)',
    ],
    images: [
      { url: 'https://upload.wikimedia.org/wikipedia/commons/d/db/Maestros_Esgrima_de_Machete.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:Maestros_Esgrima_de_Machete.jpg', license: 'CC BY-SA 4.0', attribution: 'German Yesid, via Wikimedia Commons', caption: 'Maestros of the machete-fencing academy of Puerto Tejada, Cauca' },
      { url: 'https://upload.wikimedia.org/wikipedia/commons/3/30/Parada_la_Tremenda_y_Parada_la_Carga-_Esgrima_de_Machete.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:Parada_la_Tremenda_y_Parada_la_Carga-_Esgrima_de_Machete.jpg', license: 'CC BY-SA 4.0', attribution: 'German Yesid, via Wikimedia Commons', caption: 'Maestros Sandoval and Vidal demonstrating the paradas la tremenda and la carga' },
      { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/62/Practicando_manca_con_dos_armas_Esgrima_de_machete_Remonte_Relancino_1.jpg/1280px-Practicando_manca_con_dos_armas_Esgrima_de_machete_Remonte_Relancino_1.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:Practicando_manca_con_dos_armas_Esgrima_de_machete_Remonte_Relancino_1.jpg', license: 'CC BY-SA 4.0', attribution: 'German Yesid, via Wikimedia Commons', caption: 'Manca practice with two weapons — styles remonte and relancino' },
      { url: 'https://upload.wikimedia.org/wikipedia/commons/9/94/Luis_Vidal_y_Hector_Elias_Sandoval-_Esgrima_de_Machete.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:Luis_Vidal_y_Hector_Elias_Sandoval-_Esgrima_de_Machete.jpg', license: 'CC BY-SA 4.0', attribution: 'German Yesid, via Wikimedia Commons', caption: 'Luis Vidal and Héctor Elías Sandoval crossing machetes, Puerto Tejada' },
    ],
    videos: [
      { youtubeId: '-C6RddMpa28', title: 'En la Academia de Esgrima de machete y bordón en Puerto Tejada — Ep. 1', channel: 'Kipucamayoc' },
      { youtubeId: '6WKcGqKnY0k', title: 'En la Academia de Esgrima de machete en Puerto Tejada — Ep. 2', channel: 'Kipucamayoc' },
    ],
    links: [{ label: 'British Library EAP650 — Grima in Caloto Viejo', url: 'https://eap.bl.uk/project/EAP650' }],
  },
  {
    id: 'danmye',
    wing: 'americas',
    code: 'AMS-003',
    name: 'Danmyé',
    alt: 'Ladja · ag’ya',
    country: 'Martinique (France)',
    region: 'Caribbean',
    people: 'Afro-Martinican communities',
    form: 'Hybrid / Acrobatic',
    era: 'plantation era — present',
    glyph: 'invertKick',
    pose: 'inverted',
    wikiSlug: 'Danmyé',
    lede: 'To the straddled bèlè drum and a lead singer’s cry, two Martinican fighters circle, drop low, and strike in a combat dance the drum itself can start or stop.',
    history:
      'Danmyé — also called ladja or ag’ya — is Martinique’s drum-circle combat art, rooted in fighting and dance practices carried by enslaved Africans and reshaped on the plantations. Colonial and church authorities discouraged it, and it survived at wakes, markets and cockpit gatherings. The 1930s brought its first outside documentation, when anthropologist-choreographer Katherine Dunham filmed island fighting-dance traditions and staged them in her 1938 ballet L’Ag’Ya. After decades of decline, bèlè and danmyé associations have driven a revival since the 1980s.',
    technique:
      'Fighters enter the circle one at a time, dancing before engaging. The vocabulary mixes kicks and sweeps with punches, headbutts, evasions and seizing techniques that end in takedowns — a range that has earned comparison with Brazilian capoeira and other Caribbean circle arts. Play alternates between upright sparring and a low, coiled game close to the ground. Crucially, timing belongs to the drum: attacks are launched on rhythmic cues.',
    ritual:
      'Danmyé lives inside the swaré bèlè, Martinique’s traditional night gathering of drum, dance and song: bouts customarily open the evening before the bèlè dancing carries on toward dawn. The orchestra centers on the bèlè drum, played by two people — the drummer astride the barrel while a second musician beats ti bwa sticks on its body — with call-and-response singing in Creole. The drum sanctions the encounter, heats it, and can close it.',
    masters: [
      { name: 'Katherine Dunham', note: 'American anthropologist-choreographer whose 1930s Martinique fieldwork and ballet L’Ag’Ya produced the first substantial outside documentation of ladja.', wikiSlug: 'Katherine_Dunham' },
    ],
    diaspora: 'Danmyé’s reach abroad flows through the Martinican diaspora in metropolitan France, where bèlè and danmyé associations teach the art, and through Dunham’s L’Ag’Ya, which carried its imagery into American concert dance. Scholars now cite it alongside capoeira and kalinda as a key Caribbean survival.',
    sources: [
      'Desch-Obi, Fighting for Honor (USC Press, 2008)',
      'Ministère de la Culture (France) — inventaire du PCI des Outre-mer',
      'Katherine Dunham, L’Ag’Ya (1938) — Martinique fieldwork',
    ],
    images: [
      { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c9/Danmy%C3%A9_Art_Martial_Martinique_%281%29.jpg/1280px-Danmy%C3%A9_Art_Martial_Martinique_%281%29.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:Danmy%C3%A9_Art_Martial_Martinique_(1).jpg', license: 'CC BY-SA 4.0', attribution: 'Dalia Del Arte, via Wikimedia Commons', caption: 'Danmyé practitioners in Martinique' },
      { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/16/Danmy%C3%A9_Art_Martial_Martinique_%283%29.jpg/1280px-Danmy%C3%A9_Art_Martial_Martinique_%283%29.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:Danmy%C3%A9_Art_Martial_Martinique_(3).jpg', license: 'CC BY-SA 4.0', attribution: 'Dalia Del Arte, via Wikimedia Commons', caption: 'A danmyé exchange — the Martinican art often compared to capoeira' },
      { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f3/Danmy%C3%A9_Art_Martial_Martinique_%284%29.jpg/1280px-Danmy%C3%A9_Art_Martial_Martinique_%284%29.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:Danmy%C3%A9_Art_Martial_Martinique_(4).jpg', license: 'CC BY-SA 4.0', attribution: 'Dalia Del Arte, via Wikimedia Commons', caption: 'Danmyé in motion, Martinique' },
    ],
    videos: [
      { youtubeId: '-t6iWWjwL28', title: 'Danmyé, l’art martial créole — Fort-de-France', channel: 'Aj Cadasse' },
      { youtubeId: 'l_ZtYULTvKg', title: 'Danmyé ladja, un art martial transmis par les esclaves africains de Martinique', channel: 'Djd Danmyé Janbé Dlo' },
    ],
    links: [{ label: 'Ministère de la Culture — PCI des Outre-mer', url: 'https://www.culture.gouv.fr/thematiques/patrimoine-culturel-immateriel/pour-les-acteurs-de-la-sauvegarde/le-patrimoine-culturel-immateriel-en-outre-mer/les-territoires-ultramarins-et-leur-patrimoine-culturel-immateriel' }],
  },
  {
    id: 'mani',
    wing: 'americas',
    code: 'AMS-004',
    name: 'Maní',
    alt: 'Juego de maní · baile de maní · bambosa',
    country: 'Cuba',
    region: 'Caribbean',
    people: 'Afro-Cuban plantation communities; practitioners called maniseros',
    form: 'Striking',
    era: '19th-century plantations — folkloric survival today',
    glyph: 'openHand',
    pose: 'crossPunch',
    wikiSlug: 'Juego_de_maní',
    lede: 'In the cane-plantation circle, a manisero danced through a ring of opponents whose fists — and sometimes short sticks — could fly at him on any drumbeat.',
    history:
      'Juego de maní, the ‘peanut game’, also called baile de maní or bambosa, took shape among enslaved Africans on Cuba’s nineteenth-century sugar plantations as a combat game danced to drums. Renowned maniseros traveled between plantations to test one another before betting crowds. The art declined after abolition and survived the twentieth century chiefly as memory, until experienced maniseros adapted it for the stage with the Conjunto Folklórico Nacional de Cuba in the 1960s. Ethnographers stress that only a few elders still understand its fighting core — the combat art behind the choreography.',
    technique:
      'Maní is centrally a striking game: a player moving through the ring absorbs, slips or answers blows — accounts describe punches, low kicks, foot sweeps and elbow strikes — delivered in synchrony with the drums. Evasive, dance-like footwork is the first defense; toughness the second. Some versions arm players with short sticks about forty centimeters long, linking maní to the wider Caribbean stick-play family. Deception and musical timing, not raw force, marked the celebrated manisero.',
    ritual:
      'The game unfolded inside a singing, wagering circle on the plantation, framed by a drum battery and call-and-response songs that praised champions and taunted challengers. Cuban ethnography records that maní gatherings carried strong ritual protections and prestige economies among enslaved communities. In its modern folkloric form the frame survives on stage: drummers, chorus and circle recreate the plantation gathering.',
    masters: [
      { name: 'Juan de Dios', note: 'Havana folklore master shown teaching maní’s drumming, movement and stick work in the Capoeirahistory research film.' },
    ],
    diaspora: 'Maní travels today through Cuban folkloric companies on tour, Cuban dance teachers abroad, and the scholarly network around Atlantic combat games, which has filmed surviving masters and placed maní beside capoeira, danmyé and kalinda in the family of circle arts created under slavery.',
    sources: [
      'Fernando Ortiz, Los bailes y el teatro de los negros en el folklore de Cuba (1951)',
      'Desch-Obi, Fighting for Honor (USC Press, 2008)',
      'capoeirahistory.com — ‘El juego de maní’ (Univ. of Essex research project)',
    ],
    images: [
      { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8b/West_Indian_Slaves_Stick_Fight.jpg/1280px-West_Indian_Slaves_Stick_Fight.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:West_Indian_Slaves_Stick_Fight.jpg', license: 'CC BY-SA 4.0', attribution: 'After Agostino Brunias, via Wikimedia Commons', caption: 'Brunias’s 18th-century Caribbean cudgelling scene — the combat-game family to which maní belongs; no period images of Cuban maní survive' },
    ],
    videos: [
      { youtubeId: 'T2mZgJMqfRc', title: 'El Juego de Maní — the Game of War', channel: 'Capoeirahistory' },
    ],
    links: [{ label: 'Capoeirahistory — El juego de maní', url: 'https://capoeirahistory.com/el-juego-de-mani/' }],
  },
  {
    id: 'kalinda',
    wing: 'americas',
    code: 'AMS-005',
    name: 'Kalinda',
    alt: 'Calinda · bois · Trinidadian stick fighting',
    country: 'Trinidad and Tobago',
    region: 'Caribbean',
    people: 'Afro-Trinidadian communities, with roots across the French Caribbean',
    form: 'Weapon',
    era: '18th century — present · canboulay era 1830s–1880s',
    glyph: 'crossSticks',
    pose: 'tahtibDance',
    wikiSlug: 'Calinda',
    lede: 'In the gayelle, to drum and chantwell’s war song, two bois men dance a jig around each other until one stick finds a head.',
    history:
      'Kalinda arose in the 1700s among enslaved Africans in the French Caribbean and became Trinidad’s signature stick-fighting art. After emancipation it marched at the head of canboulay, the torchlit carnival procession of stickbands and chantwells whose confrontation with the police exploded in the Canboulay Riots of 1881; colonial ordinances then curtailed drumming and stick-play in 1884. The tradition never died: its call-and-response war songs fed directly into calypso, gayelle bouts continue each carnival season, and revival efforts such as the Bois Academy now teach kalinda as national martial heritage.',
    technique:
      'The bois is a hardwood stick — classically cured poui, about four feet long and an inch thick. A fighter enters the gayelle dancing the kalinda jig, body bent forward, feet cutting rapid side-to-side steps, stick arm raised. Play alternates mock flourishes (‘carray’) with sudden full-force blows aimed above the shoulders; blocks are taken on the stick and the bout is traditionally decided when a strike draws blood from the head. Rhythm is tactical: the drums drive tempo, and a fighter times attacks to the lavway’s surges.',
    ritual:
      'Kalinda is inseparable from its music. Drummers ring the gayelle; a chantwell hurls out boasting, mocking war chants and the chorus answers with the lavway, charging fighters with what practitioners describe as spiritual heat. A fighter traditionally throws his stick into the ring as challenge, answered when a rival jumps in waving his own. The whole complex was the engine of canboulay, and its suppression is commemorated in Trinidad’s annual Canboulay Riots re-enactment.',
    masters: [
      { name: 'Rondel Benjamin', note: 'Co-founder of the Bois Academy of Trinidad and Tobago; central figure of the documentary No Bois Man No Fraid.' },
      { name: 'Keegan Taylor', note: 'Trinidadian martial artist who apprenticed to veteran bois men, profiled alongside Benjamin.' },
    ],
    diaspora: 'Calinda traveled wherever the French Caribbean did: colonial Louisiana’s Congo Square dances, big-drum traditions of the southern Antilles, and cousin stick arts across the islands. Today it moves with Trinidad’s carnival diaspora — Brooklyn, Toronto, Notting Hill — and survives inside calypso, the music it helped create.',
    sources: [
      'Errol Hill, The Trinidad Carnival (1972)',
      'Desch-Obi, Fighting for Honor (USC Press, 2008)',
      'NALIS — Carnival and Emancipation content guides',
    ],
    images: [
      { url: 'https://upload.wikimedia.org/wikipedia/commons/0/0e/1930s_Trinidad_Stick_Fighting.png', pageUrl: 'https://commons.wikimedia.org/wiki/File:1930s_Trinidad_Stick_Fighting.png', license: 'Public domain', attribution: 'Wikimedia Commons', caption: 'Stick fighters in 1930s Trinidad' },
      { url: 'https://upload.wikimedia.org/wikipedia/commons/0/07/Stick_Licking1.png', pageUrl: 'https://commons.wikimedia.org/wiki/File:Stick_Licking1.png', license: 'Public domain', attribution: 'After Agostino Brunias (1779)', caption: 'Caribbean stick fighting engraved after Brunias, 1779 — the milieu from which kalinda emerged' },
      { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ad/Calinda-Dumoulin-IMG_5527.JPG/1280px-Calinda-Dumoulin-IMG_5527.JPG', pageUrl: 'https://commons.wikimedia.org/wiki/File:Calinda-Dumoulin-IMG_5527.JPG', license: 'Public domain', attribution: 'François Aimé Louis Dumoulin', caption: 'The calinda sketched by Dumoulin in the late 18th-century Caribbean' },
    ],
    videos: [
      { youtubeId: 'KLFdLG4XTjg', title: 'Kalinda — Trinidad and Tobago stick fighting', channel: 'Black Global Village' },
      { youtubeId: 'XM0OBUOG4Ko', title: 'A bout of kalinda featuring female stickfighters', channel: 'Red Drum Drumming' },
    ],
    links: [{ label: 'NALIS — Trinidad & Tobago Carnival content guide', url: 'https://www.nalis.gov.tt/resources/tt-content-guide/carnival/' }],
  },
  {
    id: 'fiftytwoblocks',
    wing: 'americas',
    code: 'AMS-006',
    name: '52 Blocks',
    alt: 'Jailhouse Rock · 52 Hand Blocks',
    country: 'United States',
    region: 'North America',
    people: 'African-American communities, associated especially with New York City',
    form: 'Striking',
    era: 'first print references 1960s–70s; oral tradition claims older roots',
    glyph: 'openHand',
    pose: 'crossPunch',
    wikiSlug: 'Jailhouse_rock_(fighting_style)',
    lede: 'Elbows shielding, fists rolling in tight arcs, the 52 Blocks player fights as if the walls of a cell were always at his back.',
    history:
      '52 Blocks is the best-known name within ‘jailhouse rock’, a cluster of African-American fighting methods first noted in print in the 1960s and 70s and long transmitted orally in urban neighborhoods and prisons. Journalist Douglas Century’s Street Kingdom (1999) gave the first direct journalistic account, describing hand-to-hand combat developed in the New York State penal system. Practitioner-researchers such as Daniel Marks trace its blocks and rolls to older Black Southern traditions like ‘Knocking and Kicking’, framing it as a diasporic survival. Its deep history remains genuinely contested — the style’s secretive culture left little hard evidence.',
    technique:
      'The system’s signature is defense: a tight, layered guard of forearms and elbows — the ‘blocks’ — behind which the fighter rolls, shields, and answers with short hooking and chopping punches. Footwork stays compact, built for confined spaces; stances are narrow, angling the body rather than retreating. Practitioners emphasize rhythm, deception and improvisation, qualities shared with boxing but tuned to ambush range.',
    ritual:
      'There is no drum circle here, but there is a rhythmic frame: practitioners and chroniclers alike tie 52 Blocks to the competitive performance culture of Black New York — the dozens, the cypher, hip-hop — where skill is displayed, challenged and ranked in a ring of onlookers. In prison yards, the testing of hands served as initiation and reputation-making. Modern teachers have added formal ceremony through named curricula and documentation projects that treat the art as heritage to be preserved.',
    masters: [
      { name: 'Daniel Marks', note: 'Practitioner-researcher who documents the tradition and links it to older African-American arts.' },
      { name: 'Lyte Burly', note: 'New York trainer who brought 52 Blocks into public gyms and media, teaching an openly codified version.' },
      { name: 'Dennis Newsome', note: 'Jailhouse rock stylist who choreographed the style for the film Lethal Weapon (1987).' },
    ],
    diaspora: 'Born of an internal diaspora, 52 Blocks spread through the prison network, migration between cities, and hip-hop culture, which carried its imagery into lyrics, film and fight choreography. It is now taught openly in New York gyms and studied as African-American intangible heritage.',
    sources: [
      'Douglas Century, Street Kingdom (1999)',
      'VICE — ‘The Legend of the 52 Blocks’',
    ],
    images: [],
    videos: [{ title: '52 Blocks — documentary coverage', query: '52 blocks hand blocks documentary' }],
    links: [{ label: 'VICE — The Legend of the 52 Blocks', url: 'https://www.vice.com/en/article/the-legend-of-the-52-blocks/' }],
  },
  {
    id: 'hukahuka',
    wing: 'americas',
    code: 'AMS-007',
    name: 'Huka-huka',
    alt: 'Luta huka-huka — Xingu ritual wrestling',
    country: 'Brazil',
    region: 'South America',
    people: 'Upper Xingu peoples (Kamayurá, Yawalapiti, Kalapalo and others), Mato Grosso',
    form: 'Grappling',
    era: 'pre-contact origin — present',
    glyph: 'grapplRing',
    pose: 'lowShot',
    wikiSlug: 'Huka-huka',
    lede: 'Painted for the ancestors, two wrestlers drop to their knees, circle to the chant that gives the fight its name, and explode into a clinch that may last only seconds.',
    history:
      'Huka-huka is the ritual wrestling of the Upper Xingu culture area in Mato Grosso, Brazil, an indigenous tradition that long predates contact. Its onomatopoeic name echoes the guttural call wrestlers voice as they circle. The fights are inseparable from the Kuarup, the great mortuary festival honoring illustrious dead, and became nationally visible after the Villas Bôas brothers’ campaigns led to the Xingu Indigenous Park’s creation in 1961. Champion wrestlers carry lasting prestige — the late paramount chief Aritana Yawalapiti first became famous as a wrestler.',
    technique:
      'Bouts begin low: wrestlers crouch or kneel, circling clockwise while calling ‘hu-ka, hu-ka’, then clash hands and clinch. Victory comes from lifting or throwing the opponent, or by seizing the leg and touching the back of the thigh or knee to the ground — no striking, no submissions. Matches are explosive and short, often decided in seconds, demanding grip strength, balance and timing. Champions from each village meet first, followed by long sequences of individual matches, including bouts between women wrestlers.',
    ritual:
      'Huka-huka’s frame is the Kuarup itself. Villages fell and paint tree trunks — one for each honored dead — stand them in the plaza, and mourn through a night of weeping, song and flute music. Wrestlers prepare with body paint, urucum red and charcoal patterns invoking powerful beings, and legs strapped for the clinch. On the final morning the mourning breaks: host and guest villages send their champions into the arena, and the wrestling publicly closes the period of grief, releasing the dead and reaffirming alliances.',
    masters: [
      { name: 'Aritana Yawalapiti', note: 'Paramount chief of the Yawalapiti and celebrated huka-huka wrestler in his youth; a defining Upper Xingu leader until his death in 2020.', wikiSlug: 'Aritana_Yawalapiti' },
    ],
    diaspora: 'Huka-huka is territorial rather than diasporic, but it travels through representation: Kuarup broadcasts on Brazilian television, indigenous delegations demonstrating at intercultural games, and the ceremony’s role as a national symbol of indigenous Brazil have made the Xingu clinch recognizable far beyond Mato Grosso.',
    sources: [
      'TV Brasil, Expedições — ‘Kuarup Parte II: A cerimônia’',
      'Orlando & Cláudio Villas Bôas, Xingu: The Indians, Their Myths (1970)',
    ],
    images: [
      { url: 'https://upload.wikimedia.org/wikipedia/commons/6/66/Huka_huka_fight_Kuarup_ceremony.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:Huka_huka_fight_Kuarup_ceremony.jpg', license: 'CC BY 2.5', attribution: 'Noel Villas Bôas, via Wikimedia Commons', caption: 'A huka-huka fight during the Kuarup ceremony, Upper Xingu' },
      { url: 'https://upload.wikimedia.org/wikipedia/commons/0/07/Kuarup_ceremony_in_Xingu_Indigenous_Park.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:Kuarup_ceremony_in_Xingu_Indigenous_Park.jpg', license: 'CC BY 2.5', attribution: 'Noel Villas Bôas, via Wikimedia Commons', caption: 'Participants lined up for the Kuarup in the Xingu Indigenous Park' },
      { url: 'https://upload.wikimedia.org/wikipedia/commons/4/4d/Festa_do_Kuarup_dan%C3%A7a_em_frente_dos_troncos.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:Festa_do_Kuarup_dan%C3%A7a_em_frente_dos_troncos.jpg', license: 'CC BY 3.0 BR', attribution: 'Marcello Casal Jr. / Agência Brasil', caption: 'Dancing before the kuarup trunks at a Kamayurá village festival, Alto Xingu' },
      { url: 'https://upload.wikimedia.org/wikipedia/commons/8/8a/Festa_do_Kuarup_pintura_dos_troncos_que_representam_os_mortos.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:Festa_do_Kuarup_pintura_dos_troncos_que_representam_os_mortos.jpg', license: 'CC BY 3.0 BR', attribution: 'Marcello Casal Jr. / Agência Brasil', caption: 'Painting the trunks that embody the honored dead, Festa do Kuarup' },
    ],
    videos: [
      { youtubeId: '6JA0__jLKEc', title: 'Traditional fight of the Xingu (huka-huka)', channel: 'PretoKaio' },
      { youtubeId: 'bvB1aMkTtxo', title: 'Kuarup in the Xingu Indigenous Park, Central Brazil', channel: 'Brazil & Beyond' },
    ],
    links: [{ label: 'TV Brasil — Expedições: Kuarup, A cerimônia', url: 'https://tvbrasil.ebc.com.br/expedicoes/episodio/kuarup-parte-ii-a-cerimonia' }],
  },
  {
    id: 'okichitaw',
    wing: 'americas',
    code: 'AMS-008',
    name: 'Okichitaw',
    alt: 'Plains Cree / Métis combat arts system',
    country: 'Canada',
    region: 'North America',
    people: 'Plains Cree and Métis; systematized in Toronto and Winnipeg',
    form: 'Weapon',
    era: 'Plains warrior roots — systematized from the 1990s',
    glyph: 'twinStick',
    pose: 'overheadPole',
    lede: 'From the arc of the gunstock war club and the tomahawk’s chop, a Métis martial artist rebuilt a Plains Cree fighting system his uncles first showed him as a boy.',
    history:
      'Okichitaw is a modern combat system built on the fighting techniques of the Plains Cree, founded by Métis martial artist George J. Lépine. Lépine learned traditional techniques from his uncles growing up in Manitoba, then spent decades in judo, taekwondo and hapkido before organizing the Plains material into a teachable curriculum, based at the Native Canadian Centre of Toronto with the support of elders including Vern Harper. As a deliberate act of cultural revitalization, its historical layer rests on oral transmission and reconstruction — a fact Lépine addresses openly.',
    technique:
      'The system radiates from Plains weapons: the gunstock war club, tomahawk, knife and lance. Empty-hand strikes deliberately mirror weapon mechanics — chopping, hooking and thrusting along the same angles — so that armed and unarmed movement form one vocabulary. Engagements favor explosive entries, off-balancing throws and ground control, with scenario-based training rather than one-on-one dueling assumptions.',
    ritual:
      'Okichitaw embeds combat in Cree ceremony and warrior-society values — its name derives from the Plains Cree term for the worthy young men who protected the camp. Training proceeds under indigenous protocols: elder oversight, eagle-feather and regalia presentations at gradings, and teaching organized around Cree concepts rather than Asian belt terminology. Public demonstrations serve explicitly as cultural education, asserting that North America’s first peoples possessed their own martial sciences.',
    masters: [
      { name: 'George J. Lépine', note: 'Métis founder and okimakahn (head instructor) of Okichitaw, based at the Native Canadian Centre of Toronto.' },
      { name: 'Vern Harper', note: 'Cree elder and medicine man (1936–2018) who supported Okichitaw’s establishment in Toronto.', wikiSlug: 'Vern_Harper' },
    ],
    diaspora: 'Okichitaw has moved outward through workshops in Winnipeg’s North End, international seminars and martial-arts media coverage, and interest from indigenous communities seeking culturally grounded self-defense — a small but growing footprint for Canada’s indigenous martial art.',
    sources: [
      'CBC News — ‘Toronto instructor fighting to save Indigenous martial art’ (2018)',
      'CBC News — North End community workshop coverage (2019)',
      'okichitaw.com — official overview',
    ],
    images: [
      { url: 'https://upload.wikimedia.org/wikipedia/commons/a/a4/OCTVernGeorger.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:OCTVernGeorger.jpg', license: 'Public domain', attribution: 'Flmgnra, via Wikimedia Commons', caption: 'George Lépine (standing) with gunstock war club and Cree elder Vern Harper (seated) with eagle feather' },
      { url: 'https://upload.wikimedia.org/wikipedia/commons/d/d5/OKICHITAW0112_010.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:OKICHITAW0112_010.jpg', license: 'Public domain', attribution: 'Flmgnra, via Wikimedia Commons', caption: 'Okimakahn Lépine demonstrating an Okichitaw technique' },
    ],
    videos: [
      { youtubeId: 'V9zruNelwQs', title: 'Okichitaw Fighting Tomahawk — George Lépine', channel: 'Budo International' },
      { youtubeId: 'pFpnGlydn7A', title: 'George J. Lépine — Okichitaw', channel: 'KOMBATPedia' },
    ],
    links: [{ label: 'Okichitaw — official site', url: 'https://www.okichitaw.com/' }],
  },

  // ═══ VOL. II — ASIAN MARTIAL ARTS ══════════════════════════════════════════
  {
    id: 'kalaripayattu',
    wing: 'asia',
    code: 'ASI-001',
    name: 'Kalaripayattu',
    alt: 'Kalari · kalarippayattu',
    country: 'India',
    region: 'South Asia',
    people: 'Malayali communities of Kerala; hereditary gurukkal lineages',
    form: 'Hybrid / Acrobatic',
    era: 'codified 11th–12th c. CE — revived 1920s',
    glyph: 'invertKick',
    pose: 'inverted',
    wikiSlug: 'Kalaripayattu',
    lede: 'In the red-earth training pits of Kerala, fighters oiled and blessed since childhood leap, roll and flow through one of the world’s oldest continuously practised martial traditions.',
    history:
      'Kalaripayattu took shape in Kerala’s medieval martial culture, with tradition linking its codification to the centuries of conflict between the Chera and Chola powers around the 11th–12th centuries CE. Training took place in the kalari, a sunken earthen arena that doubled as school and shrine, and sustained the region’s warrior retinues and duelling customs. British colonial authorities restricted arms-bearing and the art declined in the 19th century, surviving in rural pockets. A revival led in the 1920s by teachers such as Kottakkal Kanaran Gurukkal and C. V. Narayanan Nair re-established the kalari as a living institution.',
    technique:
      'Training progresses through meippayattu (body-conditioning sequences), animal-inspired postures (vadivu) and prescribed footwork before students touch weapons. Wooden arms — the long staff and the curved otta — precede metal: sword and shield, spear, dagger and the urumi, a flexible whip-sword unique to the region. Advanced study includes marma, knowledge of the body’s vital points, paired with uzhichil oil massage and a therapeutic tradition allied to Ayurveda.',
    ritual:
      'The kalari is consecrated ground: practitioners enter right foot first, touch the earth and the feet of the guru, and salute the poothara, a seven-tiered platform housing the guardian deities of the art. Lamps burn before presiding goddesses, and training seasons follow the monsoon calendar with courses of medicinal oil massage. Kalaripayattu’s movement vocabulary feeds Kerala’s ritual performing arts, including Theyyam and Kathakali.',
    masters: [
      { name: 'Kottakkal Kanaran Gurukkal', note: 'Master teacher whose early 20th-century instruction anchored the modern revival of the art.' },
      { name: 'C. V. Narayanan Nair', note: 'Revivalist who, from the 1920s, re-popularised kalaripayattu through public demonstration and teaching.' },
      { name: 'Meenakshi Amma', note: 'Gurukkal of Kadathanad Kalari Sangham; awarded the Padma Shri in 2017 for a lifetime of practice and teaching.', wikiSlug: 'Meenakshi_Amma_Gurukkal' },
    ],
    diaspora: 'Kalaripayattu now travels with Kerala’s global diaspora and through contemporary performance: theatre and dance companies in Europe and North America adopt its training methods, and kalari schools operate from Paris to Singapore, while tourism and film have made the urumi an emblem of Kerala worldwide.',
    sources: [
      'Phillip B. Zarrilli, When the Body Becomes All Eyes (OUP, 1998)',
      'Kerala Tourism — Kalaripayattu portal',
      'Sangeet Natak Akademi — National ICH Inventory of India',
    ],
    images: [
      { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/fe/Kalaripayattu_mock_combat_in_rural_Kerala.jpg/1280px-Kalaripayattu_mock_combat_in_rural_Kerala.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:Kalaripayattu_mock_combat_in_rural_Kerala.jpg', license: 'CC0', attribution: 'Ginu Plathottam, via Wikimedia Commons', caption: 'Two swordsmen in open-air mock combat in rural Kerala' },
      { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/dd/Kalaripayattu_warriors.jpg/1280px-Kalaripayattu_warriors.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:Kalaripayattu_warriors.jpg', license: 'CC BY-SA 4.0', attribution: 'KaustubhShrm, via Wikimedia Commons', caption: 'Kalaripayattu practitioners demonstrating the art’s weapon repertoire' },
      { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/10/Kalaripayattu_DSC_1141.jpg/1280px-Kalaripayattu_DSC_1141.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:Kalaripayattu_DSC_1141.jpg', license: 'CC BY-SA 4.0', attribution: 'Rajib.hyderabad, via Wikimedia Commons', caption: 'A kalaripayattu practitioner performing at Munnar, Kerala' },
      { url: 'https://upload.wikimedia.org/wikipedia/commons/6/63/Kalaripayattu_weapons.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:Kalaripayattu_weapons.jpg', license: 'Public domain', attribution: 'Vastu, via Wikimedia Commons', caption: 'Traditional kalaripayattu weapons, from wooden training arms to the flexible urumi' },
    ],
    videos: [
      { youtubeId: 'AqJuyzcZsN8', title: 'India’s 3,000-year-old martial art still practiced today', channel: 'BBC Global' },
      { youtubeId: 'jGRpDKvQ99w', title: 'India’s ancient martial art feared by the British Raj', channel: 'BBC Global' },
      { youtubeId: 'MtHlbj_pwo0', title: 'History of Kalaripayattu | Kerala Tourism', channel: 'Kerala Tourism' },
    ],
    links: [{ label: 'Kerala Tourism — Kalaripayattu', url: 'https://www.keralatourism.org/kalaripayattu/' }],
  },
  {
    id: 'shaolin',
    wing: 'asia',
    code: 'ASI-002',
    name: 'Shaolin Kung Fu',
    alt: 'Shaolin quan · a tradition of Chinese quanfa',
    country: 'China',
    region: 'East Asia',
    people: 'Chan Buddhist monastic community of Shaolin Monastery, Mount Song, Henan',
    form: 'Hybrid / Acrobatic',
    era: 'monastery founded 495 CE — martial fame from the 7th c.',
    glyph: 'openHand',
    pose: 'crossPunch',
    wikiSlug: 'Shaolin_kung_fu',
    lede: 'Beneath Mount Song, warrior-monks have trained body and mind for over a millennium, making a Buddhist monastery the most storied name in Chinese martial arts.',
    history:
      'Shaolin Monastery was founded in 495 CE under the Northern Wei dynasty. A stele of 728 records its monks aiding the Tang prince Li Shimin in 621, the earliest firm evidence of the temple’s martial reputation. In the Ming dynasty Shaolin staff fighting won empire-wide renown — monks fought coastal pirates, and Cheng Zongyou’s 1610s manual codified the staff method — before fist arts rose to prominence in the Qing. The temple was burned in 1928, and its modern revival, boosted by the 1982 film Shaolin Temple, restored the monastery as a global centre of practice. The popular attribution of the arts to Bodhidharma is a later legend.',
    technique:
      'The staff (gun) is the tradition’s historic signature, joined by broadsword, spear and an extensive armoury. Empty-hand training centres on taolu — routines such as xiaohong quan and dahong quan — built from low stances, explosive short-range power and straight-line footwork, with animal imagery threading many sets. Rigorous conditioning, from stance training to the famed ‘72 arts’, hardens the body, while partner drills and modern sanda develop applied fighting skill.',
    ritual:
      'Shaolin practice is framed by Chan (Zen) Buddhism: the saying ‘Chan and martial arts are one’ (chan wu he yi) casts training as moving meditation, bounded by monastic discipline and precepts against aggression. Novices honour lineage through master-disciple ritual, and demonstrations open and close with monastic salutes. The monastery stands within the ‘Historic Monuments of Dengfeng’ ensemble inscribed on the UNESCO World Heritage List in 2010.',
    masters: [
      { name: 'Bodhidharma (Damo)', note: 'Legendary Indian monk credited in later tradition with founding Shaolin’s exercises — a foundational legend, not documented history.', wikiSlug: 'Bodhidharma' },
      { name: 'Cheng Zongyou', note: 'Ming-dynasty lay disciple whose Exposition of the Original Shaolin Staff Method (c. 1610s) is a key early documentation of the art.' },
    ],
    diaspora: 'Shaolin’s name carried Chinese martial arts to the world: emigrant masters, touring monk troupes and cinema spread its imagery from Hong Kong to Hollywood, and affiliated cultural centres now operate across Europe, the Americas and Africa.',
    sources: [
      'Meir Shahar, The Shaolin Monastery (Univ. of Hawai‘i Press, 2008)',
      'Peter Lorge, Chinese Martial Arts (Cambridge UP, 2012)',
      'UNESCO World Heritage — Historic Monuments of Dengfeng',
    ],
    images: [
      { url: 'https://upload.wikimedia.org/wikipedia/commons/6/6f/A_monk_practicing_kung_fu_in_the_bamboo_forest_inside_the_Shaolin_Temple.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:A_monk_practicing_kung_fu_in_the_bamboo_forest_inside_the_Shaolin_Temple.jpg', license: 'CC BY-SA 3.0', attribution: 'Justin Guariglia, via Wikimedia Commons', caption: 'A monk practises kung fu in the bamboo forest inside Shaolin Temple' },
      { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3f/20241103_Shaolin_Martial_Art_Performance_05.jpg/1280px-20241103_Shaolin_Martial_Art_Performance_05.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:20241103_Shaolin_Martial_Art_Performance_05.jpg', license: 'CC BY-SA 4.0', attribution: 'Windmemories, via Wikimedia Commons', caption: 'Shaolin martial art performance at the monastery, 2024' },
      { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6c/20241103_Shaolin_Martial_Art_Performance_01.jpg/1280px-20241103_Shaolin_Martial_Art_Performance_01.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:20241103_Shaolin_Martial_Art_Performance_01.jpg', license: 'CC BY-SA 4.0', attribution: 'Windmemories, via Wikimedia Commons', caption: 'Weapons demonstration during a Shaolin performance' },
      { url: 'https://upload.wikimedia.org/wikipedia/commons/d/d5/Shaolin_Temple_Finger_Punching_Tree.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:Shaolin_Temple_Finger_Punching_Tree.jpg', license: 'Public domain', attribution: 'ST4991, via Wikimedia Commons', caption: 'A tree at Shaolin Temple pitted by generations of monks’ finger-strike conditioning' },
    ],
    videos: [
      { youtubeId: 'YDR31_nh70Q', title: 'The Kung Fu Shaolin: Episode 1', channel: 'CGTN' },
      { youtubeId: 'J60g0pMtcwY', title: 'Growing Up As A Shaolin Monk | Inside China', channel: 'TRACKS Travel Documentaries' },
    ],
    links: [{ label: 'UNESCO World Heritage — Historic Monuments of Dengfeng', url: 'https://whc.unesco.org/en/list/1305/' }],
  },
  {
    id: 'taijiquan',
    wing: 'asia',
    code: 'ASI-003',
    name: 'Taijiquan',
    alt: 'Tai chi · t’ai-chi ch’üan',
    country: 'China',
    region: 'East Asia',
    people: 'Originating with the Chen clan of Chenjiagou, Henan; now worldwide',
    form: 'Hybrid / Acrobatic',
    era: '17th-c. Chen Village origins — UNESCO 2020',
    glyph: 'grapplRing',
    wikiSlug: 'Tai_chi',
    lede: 'Moving as slowly as drifting cloud yet built for combat, taijiquan turns the yielding logic of yin and yang into a martial art practised by millions at dawn in parks across the planet.',
    history:
      'Taijiquan is traditionally traced to Chen Wangting, a 17th-century garrison officer of Chenjiagou village in Henan, whose family art blended combat technique with Daoist breath cultivation. In the 19th century Yang Luchan learned the Chen art and taught in Beijing, founding the Yang style; the Wu/Hao, Wu and Sun family styles followed. In 1956 China published the simplified 24-posture form that carried the practice to the masses, and in December 2020 UNESCO inscribed taijiquan on the Representative List of the Intangible Cultural Heritage of Humanity.',
    technique:
      'Practice centres on slow, continuous solo routines (taolu) that train alignment, whole-body coordination and ‘silk-reeling’ spiral movement. Push hands (tuishou) partner work teaches listening to and neutralising force — yielding before redirecting, in keeping with the taiji principle of overcoming hardness with softness. Chen-style practice retains explosive energy release (fajin), low frames and weapons including straight sword, sabre and spear. It is also the museum’s open-data star: the UMONS-TAICHI capture set makes it the best kinetically documented traditional art on Earth.',
    ritual:
      'Taijiquan embodies Daoist cosmology: its name invokes the ‘supreme ultimate’ from which yin and yang arise, and classic texts frame practice as harmonising body, breath and mind. Family lineages preserve discipleship ceremonies and honour founding ancestors at Chenjiagou, while daily group practice in parks has itself become a shared civic ritual of health. UNESCO’s 2020 inscription recognises the tradition’s role in community wellbeing.',
    masters: [
      { name: 'Chen Wangting', note: 'Seventeenth-century Chenjiagou militia officer traditionally credited as the originator of taijiquan.', wikiSlug: 'Chen_Wangting' },
      { name: 'Yang Chengfu', note: 'Standardised the expansive, smooth Yang-style form (1883–1936) that became the world’s most practised version.', wikiSlug: 'Yang_Chengfu' },
      { name: 'Wu Jianquan', note: 'Founder of the Wu style (1870–1942), renowned for its compact frame and soft neutralising skill.', wikiSlug: 'Wu_Jianquan' },
    ],
    diaspora: 'Carried abroad by emigrant teachers from the mid-20th century, taijiquan is now practised on every continent — in parks, hospitals, universities and sport wushu competition. Clinical research communities study it for balance and healthy ageing.',
    sources: [
      'Douglas Wile, Lost T’ai-chi Classics from the Late Ch’ing Dynasty (SUNY Press, 1996)',
      'UNESCO ICH nomination file 01606 — Taijiquan (2020)',
      'UMONS-TAICHI dataset (Data in Brief, 2018)',
    ],
    images: [
      { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/ce/20091004_tai_chi_Hong_Kong_Kowloon_6895.jpg/1280px-20091004_tai_chi_Hong_Kong_Kowloon_6895.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:20091004_tai_chi_Hong_Kong_Kowloon_6895.jpg', license: 'CC BY-SA 4.0', attribution: 'Jakub Hałun, via Wikimedia Commons', caption: 'Tai chi demonstration at Kung Fu Corner, Kowloon Park, Hong Kong' },
      { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2a/Tai_Chi_Chuan_In_The_Park.jpg/1280px-Tai_Chi_Chuan_In_The_Park.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:Tai_Chi_Chuan_In_The_Park.jpg', license: 'CC BY-SA 4.0', attribution: 'Seattletaijiquan, via Wikimedia Commons', caption: 'Group practice in a Shanghai park — the everyday civic ritual of taijiquan' },
      { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/11/Peking%2C_Tai_Chi_i_morgontimmarna.jpg/1280px-Peking%2C_Tai_Chi_i_morgontimmarna.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:Peking,_Tai_Chi_i_morgontimmarna.jpg', license: 'CC BY 4.0', attribution: 'Lars Mongs, Arxfoto', caption: 'Morning tai chi in Beijing, August 1988' },
      { url: 'https://upload.wikimedia.org/wikipedia/commons/b/b2/Tai_Chi_Young_and_Old.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:Tai_Chi_Young_and_Old.jpg', license: 'CC BY 2.0', attribution: 'Peter Harrison, via Wikimedia Commons', caption: 'An elderly man and a child perform tai chi together — transmission across generations' },
    ],
    videos: [
      { youtubeId: 'fozrIyhZlh0', title: 'Taijiquan — official UNESCO inscription film', channel: 'UNESCO' },
      { youtubeId: 'dJsaK7KbC20', title: 'China ‘proud’ as Tai Chi enters UNESCO heritage list', channel: 'AFP News Agency' },
    ],
    links: [{ label: 'UNESCO ICH — Taijiquan (2020)', url: 'https://ich.unesco.org/en/RL/taijiquan-01606' }],
  },
  {
    id: 'judo',
    wing: 'asia',
    code: 'ASI-004',
    name: 'Judo',
    alt: 'Kōdōkan jūdō — ‘the gentle way’',
    country: 'Japan',
    region: 'East Asia',
    people: 'Founded within Meiji-era Japanese educational reform; now a worldwide Olympic community',
    form: 'Grappling',
    era: 'founded 1882 — Olympic since 1964',
    glyph: 'throwArc',
    pose: 'throwLift',
    wikiSlug: 'Judo',
    lede: 'From a small temple hall in Tokyo, an educator distilled the samurai’s jujutsu into a modern path of maximum efficiency — and built the first Asian martial art to conquer the Olympic Games.',
    history:
      'In 1882 the educator Kano Jigoro, trained in Tenjin Shin’yō-ryū and Kitō-ryū jujutsu, opened the Kodokan at Eishō-ji temple in Tokyo, reforming older combat systems into a safe, principled discipline for modern education. His maxims — seiryoku zen’yō (maximum efficient use of energy) and jita kyōei (mutual welfare and benefit) — framed judo as character training as much as combat. Adopted by Japanese schools and police, judo spread abroad through Kodokan emissaries; men’s judo entered the Olympics at Tokyo 1964, and women’s judo became a full Olympic event in 1992.',
    technique:
      'Judo’s core is the throw: te-waza (hand), koshi-waza (hip) and ashi-waza (foot) techniques, all premised on kuzushi — breaking the opponent’s balance before applying leverage. On the ground, katame-waza encompasses pins, strangles and elbow locks. Training alternates randori, free practice against resisting partners, with kata, prearranged forms preserving principles. The ranked belt system Kano devised became the template for martial arts worldwide.',
    ritual:
      'Judo retains a strict etiquette of respect: bowing on entering the dojo, to partners before and after practice, and in competition — courtesy framed by Kano as inseparable from the art’s educational purpose. The Kodokan in Tokyo functions as the tradition’s mother house, preserving kata through formal demonstration ceremonies such as the New Year Kagami Biraki. Kano’s ethic of mutual welfare, and his role as the first Asian member of the IOC, tie judo’s ceremony to a universalist ideal.',
    masters: [
      { name: 'Kano Jigoro', note: 'Founder of judo (1860–1938), educator and first Asian member of the International Olympic Committee.', wikiSlug: 'Kanō_Jigorō' },
      { name: 'Kyuzo Mifune', note: 'Legendary 10th-dan Kodokan technician (1883–1965), celebrated as the art’s greatest stylist after Kano.', wikiSlug: 'Kyuzo_Mifune' },
      { name: 'Keiko Fukuda', note: 'Highest-ranked woman in judo history (1913–2013), pioneer of women’s judo.', wikiSlug: 'Keiko_Fukuda' },
    ],
    diaspora: 'Judo was the first Japanese martial art to become fully global: Kodokan teachers seeded clubs from Brazil (where it shaped Brazilian jiu-jitsu) to Europe, and today the International Judo Federation counts member federations across some 200 nations.',
    sources: [
      'Kano Jigoro, Kodokan Judo (Kodansha International)',
      'Kodokan Judo Institute, Tokyo',
      'International Judo Federation records',
    ],
    images: [
      { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f5/Judo_throw.jpg/1280px-Judo_throw.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:Judo_throw.jpg', license: 'CC BY-SA 3.0', attribution: 'Schnuffel2002, via Wikimedia Commons', caption: 'A judo throw executed in competition' },
      { url: 'https://upload.wikimedia.org/wikipedia/commons/5/52/White_Throws_Blue_for_Ippon.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:White_Throws_Blue_for_Ippon.jpg', license: 'CC BY 2.0', attribution: 'Kurt Nordstrom, via Wikimedia Commons', caption: 'A tournament throw scoring ippon — judo’s decisive full point' },
      { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8b/Kodokan_Main_Entrance.jpg/1280px-Kodokan_Main_Entrance.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:Kodokan_Main_Entrance.jpg', license: 'CC BY-SA 2.5', attribution: 'Henrik Probell, via Wikimedia Commons', caption: 'Main entrance of the Kodokan Institute, Tokyo — judo’s mother house since 1882' },
    ],
    videos: [
      { youtubeId: 'bkhBZzE2HpM', title: 'Nage-no-Kata (English version)', channel: 'KODOKAN' },
      { youtubeId: 'gReruJD5dpg', title: '7 Things About… Olympic Judo', channel: 'Olympic Games' },
    ],
    links: [{ label: 'Kodokan Judo Institute', url: 'https://kodokanjudoinstitute.org/' }],
  },
  {
    id: 'karate',
    wing: 'asia',
    code: 'ASI-005',
    name: 'Karate',
    alt: 'Karate-dō · Okinawan te, tōde',
    country: 'Japan (Okinawa)',
    region: 'East Asia',
    people: 'Ryukyuan (Okinawan) practitioners, later adopted throughout Japan and worldwide',
    form: 'Striking',
    era: '19th-c. Okinawa — Tokyo 1922 — Olympic 2020',
    glyph: 'openHand',
    pose: 'crossPunch',
    wikiSlug: 'Karate',
    lede: 'Forged quietly in the Ryukyu Kingdom where Okinawan hands met Chinese boxing, karate crossed to Tokyo in a single generation and became the world’s best-known word for martial arts.',
    history:
      'Karate grew from Okinawan te (‘hand’) blended with Chinese quanfa carried across the East China Sea, maturing in the 19th century as the regional streams of Shuri-te, Naha-te and Tomari-te. Anko Itosu brought the art into Okinawan schools around 1901, simplifying kata for physical education. His student Gichin Funakoshi demonstrated in Tokyo in 1922 and stayed, while Chojun Miyagi (Goju-ryu) and others systematised rival styles; in the 1930s the art’s name was rewritten from ‘Chinese hand’ to ‘empty hand’. Spread worldwide after the Second World War, karate debuted as an Olympic sport at Tokyo 2020.',
    technique:
      'Training rests on three pillars: kihon (fundamentals of punching, striking, kicking and blocking from strong stances), kata (solo forms encoding a style’s curriculum, unlocked through bunkai analysis) and kumite (sparring, from prearranged exchanges to free fighting). Okinawan tradition adds hojo undo conditioning with tools like the makiwara striking post. Styles range from Shotokan’s long, dynamic lines to Goju-ryu’s close-range blend of hard and soft.',
    ritual:
      'Karate’s dojo culture is a ritual of restraint: training opens and closes with seated bows, and Funakoshi’s teaching that ‘karate begins and ends with courtesy’ — with its corollary that there is no first attack in karate — remains the moral frame. Dojo kun (training precepts) are recited in many schools, belt gradings mark passage, and Okinawan lineages venerate ancestor masters at commemorations, with the Okinawa Karate Kaikan sustaining the art’s birthplace tradition.',
    masters: [
      { name: 'Anko Itosu', note: 'Architect of karate’s modern pedagogy (1831–1915), who brought the art into Okinawan schools.', wikiSlug: 'Ankō_Itosu' },
      { name: 'Gichin Funakoshi', note: 'Father of Japanese karate (1868–1957), founder of Shotokan.', wikiSlug: 'Gichin_Funakoshi' },
      { name: 'Chojun Miyagi', note: 'Founder of Goju-ryu (1888–1953), who systematised Naha-te’s blend of hard and soft methods.', wikiSlug: 'Chōjun_Miyagi' },
    ],
    diaspora: 'Postwar servicemen who trained in Japan and Okinawa, together with touring Japanese instructors, carried karate to the Americas and Europe in the 1950s–60s, and it now claims tens of millions of practitioners under the World Karate Federation’s roughly 200 national bodies.',
    sources: [
      'Gichin Funakoshi, Karate-Do: My Way of Life (Kodansha, 1975)',
      'Okinawa Karate Kaikan',
      'World Karate Federation records',
    ],
    images: [
      { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/36/K1PL_Berlin_2018-09-16_Female_Kata_108.jpg/1280px-K1PL_Berlin_2018-09-16_Female_Kata_108.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:K1PL_Berlin_2018-09-16_Female_Kata_108.jpg', license: 'CC BY-SA 4.0', attribution: 'Martin Rulsch, via Wikimedia Commons', caption: 'Kiyou Shimizu performs kata at the Karate1 Premier League, Berlin 2018' },
      { url: 'https://upload.wikimedia.org/wikipedia/commons/3/3b/Gichin_Funakoshi_-_Heian_Nidan_%284%29.png', pageUrl: 'https://commons.wikimedia.org/wiki/File:Gichin_Funakoshi_-_Heian_Nidan_(4).png', license: 'Public domain', attribution: 'Gichin Funakoshi', caption: 'Gichin Funakoshi demonstrating a movement of the kata Heian Nidan' },
      { url: 'https://upload.wikimedia.org/wikipedia/commons/d/da/EVD-kata-021.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:EVD-kata-021.jpg', license: 'CC BY-SA 2.5', attribution: 'Evdcoldeportes, via Wikimedia Commons', caption: 'A karateka in mid-kata — the solo form at the heart of karate pedagogy' },
    ],
    videos: [
      { youtubeId: 'bhDsSGFkFss', title: 'Karate at Olympic Games Tokyo 2020: Kumite', channel: 'World Karate Federation' },
      { youtubeId: '23ARJNmZ00w', title: 'The Real Origin of Karate', channel: 'Jesse Enkamp' },
    ],
    links: [{ label: 'World Karate Federation', url: 'https://www.wkf.net/' }],
  },
  {
    id: 'sumo',
    wing: 'asia',
    code: 'ASI-006',
    name: 'Sumo',
    alt: 'Ōzumō (grand sumo)',
    country: 'Japan',
    region: 'East Asia',
    people: 'Japanese professional sumo world (ōzumō) rooted in Shinto rite',
    form: 'Grappling',
    era: 'ancient ritual roots — Edo-period professional tournaments',
    glyph: 'grapplRing',
    pose: 'collarClinch',
    wikiSlug: 'Sumo',
    lede: 'Half sacred rite, half explosive collision of giants, sumo compresses centuries of Shinto ceremony into bouts that can end in seconds on a ring of consecrated clay.',
    history:
      'Sumo appears in Japan’s oldest chronicles — the Nihon shoki records a legendary bout between Nomi no Sukune and Taima no Kehaya — and matured through Heian court festivals and warrior patronage. Its professional form emerged from Edo-period kanjin-zumo, fundraising tournaments whose ranking sheets (banzuke) and stable system survive today. The modern Japan Sumo Association era brought six annual grand tournaments (from 1958), broadcast nationwide, and an internationalised top division crowned by Mongolian-born yokozuna such as Hakuho, holder of a record 45 championships.',
    technique:
      'Bouts begin with the tachiai, a synchronized explosive charge; victory comes by forcing the opponent out of the 4.55-metre dohyo or making any part of his body beyond the soles touch the ground. The Sumo Association recognises 82 winning techniques (kimarite), broadly split between pushing-thrusting (oshi/tsuki) attacks and belt-gripping (yotsu) throws using the mawashi. There are no weight classes: stable life, chanko cuisine and daily keiko build mass, power and technique together.',
    ritual:
      'Sumo remains framed as Shinto rite: the dohyo is consecrated with salt, sake and buried offerings, wrestlers purify the ring with thrown salt and stamp evil from the ground with shiko, and power-water (chikara-mizu) is offered between bouts. The referee (gyoji) dresses as a Shinto priest, and grand champions perform the yokozuna dohyo-iri ring-entering ceremony wearing the braided shimenawa rope of a sacred site — ceremony inseparable from sport.',
    masters: [
      { name: 'Raiden Tameemon', note: 'Edo-period great (1767–1825) with the highest winning percentage in sumo history.', wikiSlug: 'Raiden_Tameemon' },
      { name: 'Taiho Koki', note: 'Postwar icon (1940–2013) who won 32 top-division championships.', wikiSlug: 'Taihō_Kōki' },
      { name: 'Hakuho Sho', note: 'Mongolian-born yokozuna, winner of a record 45 championships — emblem of sumo’s international era.', wikiSlug: 'Hakuhō_Shō' },
    ],
    diaspora: 'Grand sumo’s stables have drawn wrestlers from Mongolia, Hawai‘i, Georgia and beyond, while overseas tours carry the ceremony abroad. Amateur sumo is contested internationally, and English broadcasts have built a devoted global audience for the six annual basho.',
    sources: [
      'Japan Sumo Association (Nihon Sumo Kyokai)',
      'P. L. Cuyler, Sumo: From Rite to Sport (Weatherhill, 1979)',
    ],
    images: [
      { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b8/Sumo_wrestlers_2010-01-14.jpg/1280px-Sumo_wrestlers_2010-01-14.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:Sumo_wrestlers_2010-01-14.jpg', license: 'Public domain', attribution: 'davidgsteadman, via Wikimedia Commons', caption: 'Wrestlers face off at the January 2010 Hatsu Basho' },
      { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/81/Sumo_Wrestling_-_Tokyo.jpg/1280px-Sumo_Wrestling_-_Tokyo.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:Sumo_Wrestling_-_Tokyo.jpg', license: 'CC BY-SA 4.0', attribution: 'ElHeineken, via Wikimedia Commons', caption: 'A bout in the Ryogoku Kokugikan, Tokyo — sumo’s principal arena' },
      { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/28/Sumo_-Tokyo_2010_09_23_a.jpg/1280px-Sumo_-Tokyo_2010_09_23_a.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:Sumo_-Tokyo_2010_09_23_a.jpg', license: 'CC BY 2.0', attribution: 'Gusjer, via Wikimedia Commons', caption: 'A wrestler takes chikara-mizu, the purifying ‘power-water’, before his bout' },
      { url: 'https://upload.wikimedia.org/wikipedia/commons/a/ac/Asashoryu_fight_Jan08.JPG', pageUrl: 'https://commons.wikimedia.org/wiki/File:Asashoryu_fight_Jan08.JPG', license: 'CC BY 3.0', attribution: 'Eckhard Pecher, via Wikimedia Commons', caption: 'Yokozuna Asashoryu grapples Kotoshogiku at the January 2008 tournament' },
    ],
    videos: [
      { youtubeId: 'Cj_QyxPZE8M', title: 'Sumo Wrestling 101', channel: 'National Geographic' },
      { youtubeId: 'I1bKrrdBGTM', title: 'The 10,000-Calorie Diet: What Sumo Wrestlers Eat', channel: 'VICE Asia' },
    ],
    links: [{ label: 'Japan Sumo Association (English)', url: 'https://www.sumo.or.jp/En/' }],
  },
  {
    id: 'kendo',
    wing: 'asia',
    code: 'ASI-007',
    name: 'Kendo',
    alt: '‘The way of the sword’ — descended from kenjutsu',
    country: 'Japan',
    region: 'East Asia',
    people: 'Heirs of samurai-era sword schools; organised under the All Japan Kendo Federation',
    form: 'Weapon',
    era: 'medieval kenjutsu — modern kendo from 1952',
    glyph: 'crossSticks',
    pose: 'overheadPole',
    wikiSlug: 'Kendo',
    lede: 'Behind the mask and armour, kendo preserves the samurai’s swordsmanship as a thunderous modern discipline where a single perfect cut — spirit, sword and body as one — decides everything.',
    history:
      'Kendo descends from the kenjutsu schools of Japan’s warrior class. In the 18th century, innovators of the Jikishinkage and Itto lineages introduced the bamboo shinai and protective armour, allowing full-contact practice without maiming. After the Meiji Restoration ended the samurai order, swordsmanship survived through police training and the Dai Nippon Butoku Kai (founded 1895). Banned by occupation authorities after 1945, the art returned as modern kendo with the founding of the All Japan Kendo Federation in 1952, and world championships have been held since 1970.',
    technique:
      'Kendoka strike four targets — men (head), kote (wrist), do (trunk) and tsuki (throat thrust) — with the shinai, gripped for cutting rather than hitting. A valid point demands ki-ken-tai-itchi: spirit (expressed in the kiai shout), sword and body arriving as one, followed by zanshin, continued alertness. Training builds from suburi cutting drills and gliding suriashi footwork through kirikaeshi and jigeiko free sparring, while Nihon Kendo Kata with wooden swords preserves classical combative principles.',
    ritual:
      'Practice is bracketed by strict reiho: standing and seated bows to the dojo, teachers and partners, and moments of mokuso (seated meditation) that open and close training. The All Japan Kendo Federation defines kendo’s purpose as ‘discipline of the human character through the application of the principles of the katana’ — the sword as a vehicle for formation rather than violence.',
    masters: [
      { name: 'Miyamoto Musashi', note: 'Legendary duellist and author of The Book of Five Rings (c. 1584–1645), touchstone of Japanese swordsmanship.', wikiSlug: 'Miyamoto_Musashi' },
      { name: 'Yamaoka Tesshu', note: 'Swordsman, Zen practitioner and calligrapher (1836–1888) whose Muto-ryu unified sword and spiritual training.', wikiSlug: 'Yamaoka_Tesshū' },
      { name: 'Naito Takaharu', note: 'Butokukai master teacher (1862–1929) whose instruction shaped modern kendo’s pedagogy.', wikiSlug: 'Naitō_Takaharu' },
    ],
    diaspora: 'Kendo followed Japanese emigrants to the Americas before the Second World War and spread widely after 1952; the International Kendo Federation now spans some 60 national federations, with especially deep roots in Korea, Brazil and North America.',
    sources: [
      'Alexander C. Bennett, Kendo: Culture of the Sword (UC Press, 2015)',
      'All Japan Kendo Federation — ‘The Concept of Kendo’',
    ],
    images: [
      { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5f/Japanese-Kendo-1873-by-Shinichi-Suzuki.png/1280px-Japanese-Kendo-1873-by-Shinichi-Suzuki.png', pageUrl: 'https://commons.wikimedia.org/wiki/File:Japanese-Kendo-1873-by-Shinichi-Suzuki.png', license: 'Public domain', attribution: 'Shinichi Suzuki (1873)', caption: 'Kendo fencing photographed in 1873, early in the Meiji era' },
      { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c3/Kendo_EM_2005_-_kote.jpg/1280px-Kendo_EM_2005_-_kote.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:Kendo_EM_2005_-_kote.jpg', license: 'CC BY-SA 2.0', attribution: 'Harald Hofer, via Wikimedia Commons', caption: 'A kote (wrist) strike at the 2005 European Kendo Championships' },
      { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b1/Kendo_Men_Strike.jpg/1280px-Kendo_Men_Strike.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:Kendo_Men_Strike.jpg', license: 'CC BY 4.0', attribution: 'Huntsmanleader, via Wikimedia Commons', caption: 'The men strike to the head — kendo’s signature cut' },
    ],
    videos: [
      { youtubeId: 'qYfR983_KwU', title: '73rd All Japan Kendo Championship — Final', channel: 'All Japan Kendo Federation' },
      { youtubeId: 'VKfjf-DOGZk', title: 'How This Ancient Martial Art Helps Japanese Police Fight Crime', channel: 'Great Big Story' },
    ],
    links: [{ label: 'All Japan Kendo Federation (English)', url: 'https://www.kendo.or.jp/en/' }],
  },
  {
    id: 'muaythai',
    wing: 'asia',
    code: 'ASI-008',
    name: 'Muay Thai',
    alt: 'Thai boxing — descended from muay boran',
    country: 'Thailand',
    region: 'Southeast Asia',
    people: 'Thai communities, from provincial festival rings to Bangkok’s great stadiums',
    form: 'Striking',
    era: 'Ayutthaya-era roots — modern ring rules from the 1920s',
    glyph: 'spearFist',
    pose: 'crossPunch',
    wikiSlug: 'Muay_Thai',
    lede: 'To the wail of the sarama oboe, fighters crowned with the mongkhon dance homage to their teachers before unleashing the art of eight limbs — fists, elbows, knees and shins.',
    history:
      'Muay Thai descends from muay boran, the bare-fisted boxing of Siam’s soldiers and festival grounds, patronised by the courts of Ayutthaya. Its most cherished story — the captive boxer Nai Khanomtom defeating Burmese champions in 1774 — is national legend rather than verifiable record. In the 1920s the art modernised: roped rings, gloves, weight classes and timed rounds replaced hemp-bound fists, and permanent Bangkok venues followed with Rajadamnern Stadium (1945) and Lumpinee Stadium (1956). The International Federation of Muaythai Associations gained full IOC recognition in 2021.',
    technique:
      'Called the ‘art of eight limbs’, muay thai weaponises fists, elbows, knees and shins. Fighters condition their shins to deliver and absorb sweeping roundhouse kicks, snap the teep (push kick) to manage distance, and close into the clinch, where knees and turning throws decide exchanges. Elbows cut at close range; sweeps punish imbalance. Scoring rewards balance, composure and clean, damaging technique across five rounds.',
    ritual:
      'Every traditional bout opens with the wai khru ram muay, a kneeling, danced homage to teachers and lineage performed to live sarama music of oboe, drums and cymbals. Fighters enter wearing the mongkhon headband and pra jiad armbands, often blessed by monks or teachers, and gyms function as surrogate families under the khru (teacher). These ceremonies remain compulsory in Thai stadium rules.',
    masters: [
      { name: 'Nai Khanomtom', note: 'Legendary 18th-century boxer said to have defeated Burmese champions in captivity in 1774 — celebrated as the ‘father of muay thai’; legend, not documented history.' },
      { name: 'Apidej Sit-Hirun', note: '1960s great renowned for his kicking power, honoured as ‘Fighter of the Century’.', wikiSlug: 'Apidej_Sit-Hirun' },
      { name: 'Samart Payakaroon', note: 'Four-division Lumpinee champion and world boxing titleholder, widely cited as the finest technician in modern muay thai.', wikiSlug: 'Samart_Payakaroon' },
    ],
    diaspora: 'Muay thai gyms now operate on every continent, feeding fighters into global promotions and shaping modern kickboxing and mixed martial arts, where its clinch and low-kick game are foundational. Thailand draws thousands of foreign students to train annually.',
    sources: [
      'Peter Vail, ‘Muay Thai: Inventing Tradition for a National Symbol’ (Sojourn 29/3, 2014)',
      'International Federation of Muaythai Associations',
    ],
    images: [
      { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/fa/Muay_Thai_match_in_Siam_1865_John_Thomson.jpg/1280px-Muay_Thai_match_in_Siam_1865_John_Thomson.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:Muay_Thai_match_in_Siam_1865_John_Thomson.jpg', license: 'Public domain', attribution: 'John Thomson (1865)', caption: 'A muay thai match in Siam, photographed by John Thomson in 1865' },
      { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/89/Muay_Thai_Ao_Nang_6.jpg/1280px-Muay_Thai_Ao_Nang_6.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:Muay_Thai_Ao_Nang_6.jpg', license: 'CC BY-SA 3.0', attribution: 'kallerna, via Wikimedia Commons', caption: 'A bout at the Ao Nang stadium, Krabi, Thailand' },
      { url: 'https://upload.wikimedia.org/wikipedia/commons/b/b2/Muay_Thai_high_kick.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:Muay_Thai_high_kick.jpg', license: 'CC BY 2.0', attribution: 'Eric Langley, via Wikimedia Commons', caption: 'A high kick met by a shin block — the conditioned-shin duel at the heart of muay thai' },
      { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f8/Muay_Thai_at_Sanphet_Maha_Prasat_Throne_Hall_in_Ayutthaya_1907.jpg/1280px-Muay_Thai_at_Sanphet_Maha_Prasat_Throne_Hall_in_Ayutthaya_1907.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:Muay_Thai_at_Sanphet_Maha_Prasat_Throne_Hall_in_Ayutthaya_1907.jpg', license: 'Public domain', attribution: 'Wikimedia Commons (1907 photograph)', caption: 'Boxers before the Sanphet Maha Prasat Throne Hall, Ayutthaya, 1907' },
    ],
    videos: [
      { youtubeId: '0TCCZGR0O5Y', title: 'Muay Thai’s fight for international success and Olympic status', channel: 'CNA' },
      { youtubeId: '2yComaFNzzA', title: 'Muay Thai — The Spirit of Ram Muay', channel: 'OK Media Productions' },
    ],
    links: [{ label: 'International Federation of Muaythai Associations', url: 'https://ifmamuaythai.org/' }],
  },
  {
    id: 'silat',
    wing: 'asia',
    code: 'ASI-009',
    name: 'Pencak Silat',
    alt: 'Silat · silek · penca · seni silat',
    country: 'Indonesia · Malaysia · Brunei · Singapore',
    region: 'Southeast Asia',
    people: 'Malay-world communities across the Nusantara archipelago',
    form: 'Hybrid / Acrobatic',
    era: 'centuries-old — UNESCO 2019',
    glyph: 'invertKick',
    pose: 'lowShot',
    wikiSlug: 'Pencak_silat',
    lede: 'Flowing between dance, devotion and deadly efficiency, silat is the thousand-schooled fighting art of the Malay archipelago, performed at weddings and inscribed by UNESCO as heritage of humanity.',
    history:
      'Silat evolved across the Malay archipelago as a constellation of regional schools (aliran) — Minangkabau silek, Sundanese penca, Javanese and Malay styles — transmitted in villages, courts and Islamic boarding schools, with origin stories reaching back to the maritime kingdoms of Srivijaya and Majapahit. Fighting brotherhoods fed anticolonial resistance, and after independence the art was organised nationally: Indonesia’s IPSI federation formed in 1948, the international body PERSILAT in 1980. In December 2019 UNESCO inscribed both Indonesia’s ‘Traditions of Pencak Silat’ and Malaysia’s ‘Silat’.',
    technique:
      'Silat builds from low, mobile stances (kuda-kuda) and prescribed stepping patterns (langkah) into jurus — short forms chaining strikes, sweeps, locks and takedowns. Styles range from the evasive ground-hugging game of Minangkabau silek harimau to upright Malay court styles, and most integrate weapons: the kris dagger, golok chopper, sickle, staff and rope. Performance silat, accompanied by kendang drumming, shares its vocabulary with combat training.',
    ritual:
      'Silat is enfolded in ceremony: students are received by the guru or pendekar through initiation customs, salute sequences open every practice, and performances animate weddings, harvest festivals and royal occasions across the archipelago. Many schools carry a spiritual dimension — Islamic devotion, local adat custom or inner-power practice — framing the art as education in character. Both 2019 UNESCO inscriptions recognise silat as a way of life binding music, dress, custom and ethics to self-defence.',
    masters: [
      { name: 'O’ong Maryono', note: 'Indonesian champion and scholar (1953–2013) whose Pencak Silat in the Indonesian Archipelago is the standard study of the art.' },
      { name: 'Donn F. Draeger', note: 'Pioneering Western documenter whose 1972 fieldwork first surveyed Indonesia’s fighting arts for international readers.', wikiSlug: 'Donn_F._Draeger' },
      { name: 'Yayan Ruhian', note: 'Pencak silat master and fight choreographer who carried the art to global cinema in The Raid films.', wikiSlug: 'Yayan_Ruhian' },
    ],
    diaspora: 'Silat travelled with Malay-world migration to the Netherlands, and onward to Europe and the Americas, where hundreds of schools now teach. Southeast Asian Games competition, PERSILAT’s world championships and the art’s starring role in Indonesian action cinema have made silat one of the region’s most visible cultural exports.',
    sources: [
      'O’ong Maryono, Pencak Silat in the Indonesian Archipelago (2002)',
      'Donn F. Draeger, Weapons and Fighting Arts of Indonesia (Tuttle, 1972)',
      'UNESCO ICH files 01391 (Indonesia) & 01504 (Malaysia)',
    ],
    images: [
      { url: 'https://upload.wikimedia.org/wikipedia/commons/5/57/Pencak_Silat_Betawi_2.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:Pencak_Silat_Betawi_2.jpg', license: 'CC BY-SA 4.0', attribution: 'Gunawan Kartapranata, via Wikimedia Commons', caption: 'Betawi-style silat performed at a Jakarta wedding: disarming an opponent’s golok blade' },
      { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/79/Persaudaraan_Setia_Hati_Terate_-_Tendangan_terbang.jpg/1280px-Persaudaraan_Setia_Hati_Terate_-_Tendangan_terbang.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:Persaudaraan_Setia_Hati_Terate_-_Tendangan_terbang.jpg', license: 'CC0', attribution: 'Agus Triyanto, via Wikimedia Commons', caption: 'A flying kick at Candi Barong, Yogyakarta' },
      { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/84/PENCAK_SILAT_-_Indonesian_martial_art.jpg/1280px-PENCAK_SILAT_-_Indonesian_martial_art.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:PENCAK_SILAT_-_Indonesian_martial_art.jpg', license: 'CC BY-SA 4.0', attribution: 'Haryadi Andradjati, via Wikimedia Commons', caption: 'Pencak silat practitioners in traditional dress' },
      { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/82/Pertandingan_loncat_api_indah_di_ujian_pencak_silat.jpg/1280px-Pertandingan_loncat_api_indah_di_ujian_pencak_silat.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:Pertandingan_loncat_api_indah_di_ujian_pencak_silat.jpg', license: 'CC BY-SA 4.0', attribution: 'Ganjarmustika1904, via Wikimedia Commons', caption: 'A silat student leaps through a hoop of fire at an embassy demonstration' },
    ],
    videos: [
      { youtubeId: 'fCPwVb1PHt8', title: 'Traditions of Pencak Silat — official UNESCO film', channel: 'UNESCO' },
      { youtubeId: 'eIkI1vUEtxo', title: 'Pencak silat gets UNESCO heritage status', channel: 'AFP News Agency' },
    ],
    links: [{ label: 'UNESCO ICH — Traditions of Pencak Silat (2019)', url: 'https://ich.unesco.org/en/RL/traditions-of-pencak-silat-01391' }],
  },
  {
    id: 'eskrima',
    wing: 'asia',
    code: 'ASI-010',
    name: 'Eskrima',
    alt: 'Arnis · kali · Filipino Martial Arts',
    country: 'Philippines',
    region: 'Southeast Asia',
    people: 'Filipino communities; celebrated club lineages in Cebu and the Visayas',
    form: 'Weapon',
    era: 'pre-colonial roots — national martial art by law (2009)',
    glyph: 'twinStick',
    pose: 'twinSticks',
    wikiSlug: 'Arnis',
    lede: 'The Philippines teaches the weapon first: in eskrima the rattan stick blurs into angles, disarms and blade logic — a fighting inheritance signed into law as the national martial art.',
    history:
      'Eskrima grew from indigenous Filipino blade and stick fighting reshaped during three centuries of Spanish rule, absorbing fencing terms — eskrima from esgrima, arnis from arnés — while keeping its native logic. Cebu became the crucible of the modern art: the Doce Pares club formed in 1932, and Venancio ‘Anciong’ Bacon’s Balintawak school followed in the 1950s. Postwar migration carried the art abroad, where masters such as Angel Cabales, Remy Presas and Dan Inosanto built international followings. In 2009 Republic Act 9850 declared arnis the national martial art and sport of the Philippines.',
    technique:
      'Uniquely, eskrima begins with the weapon: the rattan baston teaches angles of attack, numbered strike patterns and live-hand coordination that later translate to knife, espada y daga (sword and dagger) and empty hands. Double-stick sinawali weaving builds ambidexterity and flow; disarms, locks and limb destructions exploit the defanging-the-snake principle of striking the weapon hand. The sport form is contested with padded sticks and armour.',
    ritual:
      'Eskrima’s ceremony is the ceremony of lineage: respect to the master and the club, oaths and initiation customs that vary system to system, and public demonstration at fiestas and national games. A folk-spiritual layer — protective amulets (anting-anting) and whispered orasyon prayers — historically accompanied Visayan fighters. Since Republic Act 9850, arnis opens the Palarong Pambansa national school games — a civic rite for a once-clandestine art.',
    masters: [
      { name: 'Venancio ‘Anciong’ Bacon', note: 'Cebuano master (1912–1981) who founded the close-quarters Balintawak system in post-war Cebu.' },
      { name: 'Remy Presas', note: 'Founder of Modern Arnis (1936–2001), who systematised the art for mass teaching and spread it across North America.', wikiSlug: 'Remy_Presas' },
      { name: 'Dan Inosanto', note: 'Filipino-American master and Bruce Lee’s training partner — the art’s most influential ambassador worldwide.', wikiSlug: 'Dan_Inosanto' },
    ],
    diaspora: 'Filipino migration seeded eskrima worldwide — Stockton, California’s manong generation produced the first US academies — and Hollywood fight choreography quietly runs on FMA. The art is now taught to military and police units internationally.',
    sources: [
      'Mark V. Wiley, Filipino Martial Culture (Tuttle, 1997)',
      'Republic Act No. 9850 (Philippines, 2009)',
      'Macachor & Nepangue, Cebuano Eskrima: Beyond the Myth (2007)',
    ],
    images: [
      { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/bc/Eskrima_Kombat.jpg/1280px-Eskrima_Kombat.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:Eskrima_Kombat.jpg', license: 'CC BY-SA 4.0', attribution: 'Leticia Barletta, via Wikimedia Commons', caption: 'Competitors clash in an eskrima tournament bout' },
      { url: 'https://upload.wikimedia.org/wikipedia/commons/3/3d/Eskrima.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:Eskrima.jpg', license: 'CC BY 3.0', attribution: 'Mr.Colling, via Wikimedia Commons', caption: 'Stick sparring — the most visible face of Filipino martial arts' },
      { url: 'https://upload.wikimedia.org/wikipedia/commons/b/be/Eskrima-training-weapons.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:Eskrima-training-weapons.jpg', license: 'Public domain', attribution: 'Wikimedia Commons', caption: 'Training weapons of eskrima: rattan sticks and practice blades' },
    ],
    videos: [
      { youtubeId: 'mP2__QQRNHY', title: 'Arnis demonstrations at the 2023 Palarong Pambansa', channel: 'Rappler' },
      { youtubeId: 'VZKQloCKhao', title: 'Arnis | Local Legends', channel: 'ABS-CBN News' },
    ],
    links: [{ label: 'Republic Act No. 9850 — Arnis as the National Martial Art', url: 'https://lawphil.net/statutes/repacts/ra2009/ra_9850_2009.html' }],
  },
  {
    id: 'taekkyeon',
    wing: 'asia',
    code: 'ASI-011',
    name: 'Taekkyeon',
    alt: 'Taekgyeon · taekkyon',
    country: 'South Korea',
    region: 'East Asia',
    people: 'Korean folk communities; historically late-Joseon Seoul, today centred on Chungju',
    form: 'Hybrid / Acrobatic',
    era: 'Joseon folk sport — first martial art on UNESCO’s list (2011)',
    glyph: 'invertKick',
    wikiSlug: 'Taekkyon',
    lede: 'Swaying to an internal rhythm like a dance, taekkyeon players trip, push and arc graceful kicks in Korea’s folk fighting game — the first martial art ever inscribed by UNESCO.',
    history:
      'Taekkyeon flourished as a folk contest of late Joseon Korea — genre paintings such as the 1846 Daekwaedo show players squaring off beside ssireum wrestlers — fought between village and neighbourhood teams at festivals like Dano. Suppressed and nearly extinguished during the Japanese occupation, it survived through a single master, Song Deok-gi, whose knowledge Shin Han-seung documented and organised into a modern curriculum. South Korea designated taekkyeon Important Intangible Cultural Property No. 76 in 1983, and in 2011 it became the first martial art inscribed on UNESCO’s Representative List.',
    technique:
      'Taekkyeon moves on pumbalbgi, a springy triangular stepping rhythm, with the whole body swaying (neulcheo) to disguise intent. Players win by felling the opponent — through foot sweeps, leg trips and pushing throws — or by touching the head with a kick; hands push and unbalance rather than strike with the fist. Its arcing, relaxed kicks and flowing takedowns give the art a dance-like character that distinguishes it sharply from taekwondo, whose kicking identity it is often cited as prefiguring, though the lineage is debated.',
    ritual:
      'Taekkyeon’s frame is festive and communal: matches traditionally accompanied seasonal holidays, wagered between villages, opening with courtesies and ending without lasting injury by design. Modern transmission preserves this ethos — the Chungju-based associations stage the Taekkyeon Battle series and community gyeollyeon team contests. UNESCO’s 2011 inscription highlighted the art’s accessibility and its seamless blend of play, performance and self-defence.',
    masters: [
      { name: 'Song Deok-gi', note: 'The last master of Joseon-era taekkyeon (1893–1987), sole living link through which the art survived the occupation.', wikiSlug: 'Song_Deok-gi' },
      { name: 'Shin Han-seung', note: 'Reviver (1928–1987) who systematised Song Deok-gi’s art and secured its 1983 cultural-property designation.' },
      { name: 'Choi Hong-hi', note: 'Taekwondo’s principal founder (1918–2002), who studied taekkyeon in his youth — the most cited bridge between the two arts.', wikiSlug: 'Choi_Hong-hi' },
    ],
    diaspora: 'Taekkyeon’s global footprint is young but growing: Korean cultural centres and touring demonstration teams present it abroad, and clubs have appeared in Europe and the Americas. Its greatest export remains indirect — the kicking culture that taekwondo carried to every continent.',
    sources: [
      'UNESCO ICH file 00452 — Taekkyeon (2011)',
      'Cultural Heritage Administration of the Republic of Korea',
    ],
    images: [
      { url: 'https://upload.wikimedia.org/wikipedia/commons/a/a7/Dae-Kwae-Do.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:Dae-Kwae-Do.jpg', license: 'Public domain', attribution: 'Hyesan Yu Suk (1846)', caption: 'Detail from the 1846 painting Daekwaedo, showing what is believed to be a taekkyeon match' },
      { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/09/Taekkyon_Competition.jpg/1280px-Taekkyon_Competition.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:Taekkyon_Competition.jpg', license: 'CC BY-SA 4.0', attribution: 'Hk8995, via Wikimedia Commons', caption: 'A modern taekkyeon competition bout' },
      { url: 'https://upload.wikimedia.org/wikipedia/commons/b/b4/Taekkyeon-nalchigi.JPG', pageUrl: 'https://commons.wikimedia.org/wiki/File:Taekkyeon-nalchigi.JPG', license: 'CC BY-SA 3.0', attribution: 'Metal693, via Wikimedia Commons', caption: 'A nalchigi kick demonstrated at the Insadong Taekkyeon Battle, Seoul' },
      { url: 'https://upload.wikimedia.org/wikipedia/commons/1/18/Korean_martial_art-Taekkyeon-02.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:Korean_martial_art-Taekkyeon-02.jpg', license: 'CC BY 2.0', attribution: 'ilovebdt, via Wikimedia Commons', caption: 'Taekkyeon demonstrated at the Hi! Seoul Festival, 2007' },
    ],
    videos: [
      { youtubeId: 'Ga1Im-3ZtH8', title: 'Taekkyeon, a traditional Korean martial art — official UNESCO film', channel: 'UNESCO' },
      { youtubeId: 'aT6u8EQ9SZI', title: 'K-Culture Elite: Taekkyeon (택견)', channel: 'Arirang TV' },
    ],
    links: [{ label: 'UNESCO ICH — Taekkyeon (2011)', url: 'https://ich.unesco.org/en/RL/taekkyeon-a-traditional-korean-martial-art-00452' }],
  },
  {
    id: 'bokh',
    wing: 'asia',
    code: 'ASI-012',
    name: 'Bökh',
    alt: 'Mongol bökh · Mongolian wrestling',
    country: 'Mongolia',
    region: 'Central Asia',
    people: 'Mongolian herding communities across the steppe; centrepiece of Naadam',
    form: 'Grappling',
    era: 'ancient steppe tradition — National Naadam since 1921',
    glyph: 'grapplRing',
    pose: 'collarClinch',
    wikiSlug: 'Mongolian_wrestling',
    lede: 'Under the open sky of Naadam, wrestlers in open-chested jackets flare their arms in the eagle dance before locking grips in a contest as old as the steppe itself.',
    history:
      'Wrestling has been the steppe’s premier test of manhood since antiquity — bronze plaques of grappling men survive from the Xiongnu era — and served as military training under the Mongol Empire, when khans staged bouts to honour champions. Through the Qing period monasteries and princes patronised tournaments, and after the 1921 revolution the National Naadam fixed bökh at the heart of Mongolia’s annual ‘three manly games’ alongside horse racing and archery. UNESCO inscribed Naadam on the Representative List in 2010.',
    technique:
      'Bökh is decided the moment any part of the body above the knee — back, elbow, head — touches the ground; there is no ring boundary, traditionally no time limit, and no weight classes, so giants meet technicians in open draws. Wrestlers grip the zodog jacket and shuudag briefs to work trips, lifts, hip throws and leg attacks. Standing skill is everything: there is no ground fighting. At Naadam, victories accumulate into cherished ranks — falcon, elephant, lion and, for repeat champions, avarga, the titan.',
    ritual:
      'Every bout is wrapped in ceremony: wrestlers perform devekh, the soaring eagle dance, around their zasuul — attendant-heralds who sing praises of their wrestler’s deeds — and salute the state banner before and after competing. The open-chested zodog is explained by a beloved legend of a disguised woman who once won the tournament. Hats, sashes and title epithets carry an etiquette of honour, all embedded in the UNESCO-inscribed Naadam festival.',
    masters: [
      { name: 'Jigjidiin Mönkhbat', note: 'Avarga (titan) of Mongolian wrestling and 1968 Olympic silver medallist; father of sumo great Hakuho.', wikiSlug: 'Jigjidiin_Mönkhbat' },
      { name: 'Badmaanyambuugiin Bat-Erdene', note: 'Record eleven-time National Naadam champion, honoured as one of the greatest bökh wrestlers of the modern era.', wikiSlug: 'Badmaanyambuugiin_Bat-Erdene' },
    ],
    diaspora: 'Bökh’s grappling pedigree powers Mongolia’s outsized success abroad: Mongolian-born yokozuna have dominated Japanese sumo, and the country punches far above its weight in Olympic judo and freestyle wrestling. Diaspora Naadam festivals from Ulaanbaatar to Chicago carry the eagle dance worldwide.',
    sources: [
      'UNESCO ICH file 00395 — Naadam, Mongolian traditional festival (2010)',
      'Timothy May, Culture and Customs of Mongolia (Greenwood, 2009)',
    ],
    images: [
      { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5b/Wrestling_in_Mongolia.jpg/1280px-Wrestling_in_Mongolia.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:Wrestling_in_Mongolia.jpg', license: 'CC0', attribution: 'Bernard Gagnon, via Wikimedia Commons', caption: 'Wrestlers grapple in the Orkhon Valley, Mongolia' },
      { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/ee/Mongolian_Naadam_Wrestlers_-_2010.jpg/1280px-Mongolian_Naadam_Wrestlers_-_2010.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:Mongolian_Naadam_Wrestlers_-_2010.jpg', license: 'CC BY-SA 4.0', attribution: 'FischerFotos, via Wikimedia Commons', caption: 'A Naadam festival bout in Mandalgovi — one of Mongolia’s ‘three manly arts’' },
      { url: 'https://upload.wikimedia.org/wikipedia/commons/e/ec/Mongolian_wrestling_Bukh_during_the_Naadam.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:Mongolian_wrestling_Bukh_during_the_Naadam.jpg', license: 'CC BY-SA 3.0', attribution: 'Orgio89, via Wikimedia Commons', caption: 'Wrestlers in zodog and shuudag pose before their Naadam match' },
      { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/85/Mongolian_Wrestling.jpg/1280px-Mongolian_Wrestling.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:Mongolian_Wrestling.jpg', license: 'Public domain', attribution: 'David Lienemann (US government work)', caption: 'A bökh demonstration outside Ulaanbaatar, 2011' },
    ],
    videos: [
      { youtubeId: 'RI67liJxJtQ', title: 'Naadam, Mongolian traditional festival — official UNESCO film', channel: 'UNESCO' },
      { youtubeId: 'Qfp1pmvFidw', title: 'Mongolian Wrestling in BÖKH', channel: 'NOWNESS' },
    ],
    links: [{ label: 'UNESCO ICH — Naadam (2010)', url: 'https://ich.unesco.org/en/RL/naadam-mongolian-traditional-festival-00395' }],
  },
];

// ── Masters & Keepers — MuseumHall figures (wiki-enriched portraits) ─────────

export const COMBAT_FIGURE_HALLS: MuseumHallDef[] = [
  { id: 'founders', label: 'Founders & Codifiers', blurb: 'The masters who turned living combat into systems, schools and books.' },
  { id: 'diaspora', label: 'The Diaspora Line', blurb: 'The masters who carried African combat across the Atlantic — and reconnected it.' },
  { id: 'champions', label: 'Champions & Icons', blurb: 'The fighters who made living traditions into national spectacles.' },
  { id: 'keepers', label: 'Keepers & Scholars', blurb: 'The custodians, rulers and researchers who preserved the record.' },
];

export const COMBAT_FIGURES: MuseumFigure[] = [
  {
    id: 'mestre-bimba', name: 'Mestre Bimba', wikiSlug: 'Mestre_Bimba', hall: 'diaspora',
    role: 'Capoeira Regional founder', era: '1900–1974', nationality: 'Brazilian',
    tagline: 'Won capoeira its legal legitimacy',
    works: ['Capoeira Regional (1930s)', 'First formal capoeira academy'],
    techniques: ['Sequências de ensino', 'Codified fighting reform of the Angolan game'],
  },
  {
    id: 'mestre-pastinha', name: 'Mestre Pastinha', wikiSlug: 'Mestre_Pastinha', hall: 'diaspora',
    role: 'Capoeira Angola guardian', era: '1889–1981', nationality: 'Brazilian',
    tagline: 'Guarded the art’s African identity',
    works: ['Centro Esportivo de Capoeira Angola (1941)'],
    techniques: ['Ritual-forward Capoeira Angola', 'Philosophy of malícia'],
  },
  {
    id: 'shaka', name: 'Shaka Zulu', wikiSlug: 'Shaka', hall: 'keepers',
    role: 'Zulu king & military reformer', era: 'c. 1787–1828', nationality: 'Zulu Kingdom',
    tagline: 'Forged stick fighting into warrior training',
    techniques: ['Systematized Nguni stick combat in military drill'],
  },
  {
    id: 'mandela', name: 'Nelson Mandela', wikiSlug: 'Nelson_Mandela', hall: 'champions',
    role: 'Statesman · stick-fighting practitioner', era: '1918–2013', nationality: 'South African',
    tagline: 'Stick fighting’s most famous modern practitioner',
    techniques: ['Practiced Xhosa stick fighting in his rural youth'],
  },
  {
    id: 'mohamed-ndao', name: 'Mohamed Ndao ‘Tyson’', wikiSlug: 'Mohamed_Ndao', hall: 'champions',
    role: 'Laamb champion', era: 'b. 1973', nationality: 'Senegalese',
    tagline: 'Made laamb a national obsession',
    techniques: ['Lutte avec frappe', 'The bàkk praise-dance as spectacle'],
  },
  {
    id: 'desch-obi', name: 'T.J. Desch-Obi', wikiSlug: 'Fighting_for_Honor', hall: 'keepers',
    role: 'Historian of African martial arts', era: 'contemporary', nationality: 'American',
    tagline: 'The field’s anchor scholar',
    works: ['Fighting for Honor: The History of African Martial Art in the Atlantic World (2008)'],
  },
  {
    id: 'kano', name: 'Kano Jigoro', wikiSlug: 'Kanō_Jigorō', hall: 'founders',
    role: 'Founder of judo', era: '1860–1938', nationality: 'Japanese',
    tagline: 'The template for every modern belted art',
    works: ['The Kodokan (1882)', 'Kodokan Judo'],
    techniques: ['Seiryoku zen’yō — maximum efficient use of energy', 'The ranked belt system'],
  },
  {
    id: 'funakoshi', name: 'Gichin Funakoshi', wikiSlug: 'Gichin_Funakoshi', hall: 'founders',
    role: 'Father of Japanese karate', era: '1868–1957', nationality: 'Okinawan/Japanese',
    tagline: '‘Karate begins and ends with courtesy’',
    works: ['Shotokan', 'Karate-Do: My Way of Life'],
  },
  {
    id: 'fiore', name: 'Fiore dei Liberi', wikiSlug: 'Fiore_dei_Liberi', hall: 'founders',
    role: 'Master-at-arms · fight-book author', era: 'c. 1350–c. 1410s', nationality: 'Friulian (Italian)',
    tagline: 'Author of the Flower of Battle',
    works: ['Fior di Battaglia (c. 1404, Getty Ms. Ludwig XV 13)'],
    techniques: ['Armizare: wrestling, dagger, sword, poleaxe and mounted combat as one art'],
  },
  {
    id: 'musashi', name: 'Miyamoto Musashi', wikiSlug: 'Miyamoto_Musashi', hall: 'champions',
    role: 'Duellist · strategist', era: 'c. 1584–1645', nationality: 'Japanese',
    tagline: 'Touchstone of Japanese swordsmanship',
    works: ['The Book of Five Rings'],
  },
  {
    id: 'mendoza', name: 'Daniel Mendoza', wikiSlug: 'Daniel_Mendoza', hall: 'champions',
    role: 'Bare-knuckle champion of England', era: '1764–1836', nationality: 'English',
    tagline: 'The scientific defence that revolutionised boxing',
  },
  {
    id: 'dunham', name: 'Katherine Dunham', wikiSlug: 'Katherine_Dunham', hall: 'keepers',
    role: 'Anthropologist · choreographer', era: '1909–2006', nationality: 'American',
    tagline: 'First documenter of Martinique’s ladja',
    works: ['L’Ag’Ya (1938)'],
  },
  {
    id: 'mita-mohi', name: 'Mita Mohi', wikiSlug: 'Mita_Mohi', hall: 'keepers',
    role: 'Taiaha master · Mokoia wānanga patriarch', era: '1937–2016', nationality: 'Māori (Te Arawa)',
    tagline: 'Trained over 20,000 in mau rākau',
  },
  {
    id: 'song-deok-gi', name: 'Song Deok-gi', wikiSlug: 'Song_Deok-gi', hall: 'keepers',
    role: 'Last master of Joseon taekkyeon', era: '1893–1987', nationality: 'Korean',
    tagline: 'The single living link an art survived through',
  },
];

// ── Timeline — four thousand years ───────────────────────────────────────────

export interface AtlasTimelineEntry { era: string; label: string; note: string }
export const COMBAT_TIMELINE: AtlasTimelineEntry[] = [
  { era: 'c. 2000 BCE', label: 'Beni Hasan murals', note: 'Hundreds of sequential wrestling figures painted in Middle Kingdom Egypt — the oldest combat ‘manual’ known.' },
  { era: 'c. 1180 BCE', label: 'Medinet Habu reliefs', note: 'Refereed stick-fencing matches carved under Ramesses III.' },
  { era: '648 BCE', label: 'Pankration at Olympia', note: 'Greece admits the all-in fight to the Olympic Games — antiquity’s most prestigious combat crown.' },
  { era: 'c. 200 BCE', label: 'Kingdom of Kush', note: 'Nuba tradition traces its wrestling heritage to Kushite antiquity.' },
  { era: 'c. 495 CE', label: 'Shaolin founded', note: 'The Henan monastery that would bind Chan Buddhism to the martial canon of quanfa.' },
  { era: 'pre-900s CE', label: 'Engolo on the Cunene', note: 'Inverted-kick circle game develops among Angolan pastoralists.' },
  { era: 'c. 1300', label: 'MS I.33', note: 'Europe’s oldest surviving fight book — a priest teaching sword-and-buckler, frame by frame. Fiore’s Fior di Battaglia follows c. 1404.' },
  { era: '1200s–1600s', label: 'Ajuran-era Istunka', note: 'Somali river-bank tournament takes shape; Sahelian empires drill spear, sword & shield.' },
  { era: '1500s–1800s', label: 'The Middle Passage', note: 'Engolo, wrestling, and stick arts cross the Atlantic — becoming capoeira, mani, danmyé, kalinda, knocking-and-kicking.' },
  { era: '1670s–1820s', label: 'Nguni formalization', note: 'From Amalandela to Shaka: stick fighting becomes Zulu military training. Musangwe begins at Tshifudi (c. 1829).' },
  { era: '1743', label: 'Broughton’s rules', note: 'London’s prize ring writes boxing’s first code — the paper trail of modern combat sport begins.' },
  { era: '1800s', label: 'Cartillas de malicia', note: 'Afro-Colombian grima masters write the diaspora’s own fight books.' },
  { era: '1882', label: 'The Kodokan', note: 'Kano Jigoro distills jujutsu into judo — the template for every modern belted art that follows.' },
  { era: '1920s–1950s', label: 'Codification era', note: 'Funakoshi carries karate to Tokyo; Bimba’s Capoeira Regional wins legality; Pastinha guards Angola; Neves e Sousa reconnects capoeira to engolo.' },
  { era: '2008', label: 'Fighting for Honor', note: 'Desch-Obi publishes the benchmark academic synthesis.' },
  { era: '2011–2019', label: 'UNESCO recognition wave', note: 'Taekkyeon (2011), the capoeira circle (2014), Egyptian tahtib (2016) and pencak silat (2019) join the Intangible Cultural Heritage lists.' },
  { era: '2018–today', label: 'The stadium & the stream', note: 'Laamb’s Arène Nationale opens; Dambe goes viral; moraingy campaigns for recognition — the living arts professionalize.' },
];

// ── The documentary record ───────────────────────────────────────────────────

export interface ScholarshipCard { tag: string; title: string; body: string; url?: string }
export const COMBAT_SCHOLARSHIP: ScholarshipCard[] = [
  {
    tag: 'THE BENCHMARK TEXT',
    title: 'Fighting for Honor — T.J. Desch-Obi',
    body: 'University of South Carolina Press, 2008. The definitive academic history of African martial arts in the Atlantic world: 376 pages and 45 illustrations tracing engolo to capoeira, African stick arts to kalinda and the Haitian Revolution, and combat to the politics of honor. Desch-Obi (PhD, UCLA; CUNY) is the field’s anchor scholar.',
    url: 'https://uscpress.com/Fighting-for-Honor',
  },
  {
    tag: 'THE OLDEST FIGHT MANUAL ON EARTH',
    title: 'The Beni Hasan Tombs — Egypt, c. 2000 BCE',
    body: 'The tomb of Baqet III (Tomb 15) holds hundreds of painted wrestlers in sequential holds and counters; the neighboring tomb of Khety (Tomb 17) shows 122 wrestling pairs in five registers, no two alike — frame-by-frame combat instruction painted four millennia ago. Medinet Habu (c. 1180 BCE) adds refereed stick-fencing matches in carved relief.',
    url: 'https://archive.org/details/beni-hasan-v.-2',
  },
  {
    tag: 'DIASPORA FIGHT BOOKS',
    title: 'Grima & the Cartillas de Malicia — Colombia, 1800s',
    body: 'In Colombia’s Cauca region, Afro-Colombians forged grima — machete-and-stick fencing born under slavery — into more than thirty styles, each recorded in handwritten manuals called cartillas de malicia. Living masters in towns like Puerto Tejada still teach from them; the British Library’s Endangered Archives Programme races to digitize the rest.',
  },
  {
    tag: 'THE RECORD CORRECTED',
    title: 'Two Arts That Do Not Exist',
    body: 'Curating this volume meant rejecting as well as collecting. Two names that circulate widely in online “African martial arts” lists — Maratabeen (Morocco) and Kayti (Kenya) — survive no scrutiny: every occurrence traces to a single recycled list descending from a 2004 forum post, with no Arabic, French, Kenyan, scholarly or institutional source behind either. The Kayti entry discredits itself, calling Filipino kali “Islamic” and claiming Kenyan ancestry for all Chinese swordplay. Neither is accessioned here. Morocco is represented instead by its genuine, UNESCO-inscribed martial traditions, and Kenya by the documented Maasai and Kikuyu weapon complex under the real names seme and rungu.',
  },
  {
    tag: 'A METHOD TO BORROW',
    title: 'Motion-Capture Heritage Archiving',
    body: 'The Hong Kong Martial Arts Living Archive (CityU HK · EPFL · International Guoshu Association) has motion-captured 130+ sequences across 19 Southern Chinese kung fu styles — the world’s largest kinetic archive of intangible heritage. It documents Chinese arts, not African ones — but its method (mocap, annotation, public exhibition) is the blueprint this museum aims to bring to Africa’s living combat traditions.',
  },
];

// ── Plajah's own holdings — accessioned, self-hosted, rights-recorded ────────
//
// Uploaded to Firebase Storage under /archive and indexed in the Firestore
// `archiveAssets` collection (94 records, each carrying its rights block).
// These URLs use the firebasestorage endpoint, which honours storage.rules
// (public read); the raw storage.googleapis.com host is IAM-gated and 403s.

const HOLDINGS_BASE =
  'https://firebasestorage.googleapis.com/v0/b/gen-lang-client-0665118474.firebasestorage.app/o/archive%2F';
export const holdingUrl = (p: string) => `${HOLDINGS_BASE}${encodeURIComponent(p)}?alt=media`;

export interface Holding { label: string; note: string; path: string; access: string }
export const PLAJAH_HOLDINGS: Holding[] = [
  {
    label: 'Beni Hasan, Part II (1893) — PDF',
    note: 'THE priority volume: the Baqet III (BH15) and Khety (BH17) wrestling plates. Served from Plajah’s own storage.',
    path: 'beni-hasan/beni-hasan-v.-2/Beni Hasan v.2.pdf',
    access: 'Public domain',
  },
  {
    label: 'Beni Hasan, Part I (1893) — PDF',
    note: 'Tombs of Amenemhat and Khnumhotep II — the Middle Kingdom context volume.',
    path: 'beni-hasan/beni-hasan-v.-1/Beni Hasan v.1.pdf',
    access: 'Public domain',
  },
  {
    label: 'Beni Hasan, Part III (1896) — PDF',
    note: 'Griffith’s hieroglyphic and detail studies from the site.',
    path: 'beni-hasan/beni-hasan-v.-3/Beni Hasan v.3.pdf',
    access: 'Public domain',
  },
  {
    label: 'Beni Hasan, Part IV (1900) — PDF',
    note: 'Colour facsimiles, including plates by a young Howard Carter before Tutankhamun.',
    path: 'beni-hasan/beni-hasan-v.-4/Beni Hasan v.4.pdf',
    access: 'Public domain',
  },
];

/** Counts shown in the Record tab — kept in sync with the import script. */
export const HOLDINGS_STATS = { assets: 94, metObjects: 86, volumes: 4, sizeLabel: '302 MB' };

// ── The Plate Room — real plates, derived from Plajah's own holdings ─────────
//
// Page images extracted from the JP2 bundle of Beni Hasan II (Newberry, 1893)
// in `acquisitions/holdings`, identified plate-by-plate by inspection, then
// re-hosted under /archive/beni-hasan/plates. `registers` are native-resolution
// slices of each wrestling band — read them left-to-right like the wall itself.

export interface PlateRegister { file: string; label: string }
export interface ArchivePlate {
  id: string;
  tomb: string;
  plate: string;          // e.g. 'Plate V'
  wall: string;
  title: string;
  blurb: string;
  file: string;           // full-plate image
  wrestling: boolean;
  registers: PlateRegister[];
}

const PLATES_BASE = 'beni-hasan/plates/';
export const plateUrl = (file: string) => holdingUrl(`${PLATES_BASE}${file}`);

export const ARCHIVE_PLATES: ArchivePlate[] = [
  {
    id: 'bh2-t15-pl5',
    tomb: 'Tomb 15 — Baqet III',
    plate: 'Plate V',
    wall: 'Main chamber, east wall',
    title: 'The Wrestling Wall of Baqet III',
    blurb: 'The most celebrated combat image of the ancient world: roughly two hundred wrestling pairs across six registers, each pair a distinct hold, entry or counter — the two fighters drawn in contrasting shades so every grip reads clearly. The lowest register carries a siege of a fortress.',
    file: 'bh2-t15-pl5.jpg',
    wrestling: true,
    registers: [1, 2, 3, 4, 5, 6].map(r => ({ file: `bh2-t15-pl5-reg${r}.jpg`, label: `Register ${r}` })),
  },
  {
    id: 'bh2-t17-pl15',
    tomb: 'Tomb 17 — Khety',
    plate: 'Plate XV',
    wall: 'East wall',
    title: 'The Wrestling Wall of Khety',
    blurb: 'Khety’s east wall answers Baqet III with its own sequence of wrestling pairs across five registers, no two alike, closing with an assault on a fortress at the base of the wall.',
    file: 'bh2-t17-pl15.jpg',
    wrestling: true,
    registers: [1, 2, 3, 4, 5].map(r => ({ file: `bh2-t17-pl15-reg${r}.jpg`, label: `Register ${r}` })),
  },
  {
    id: 'bh2-t17-pl13',
    tomb: 'Tomb 17 — Khety',
    plate: 'Plate XIII',
    wall: 'North wall (west half)',
    title: 'Games, Trades and the Hunt',
    blurb: 'The everyday register: herding, craft, the chase and children’s games — the civil life the wrestling wall sat beside.',
    file: 'bh2-t17-pl13.jpg',
    wrestling: false,
    registers: [],
  },
  {
    id: 'bh2-t17-pl14',
    tomb: 'Tomb 17 — Khety',
    plate: 'Plate XIV',
    wall: 'North wall (eastern half)',
    title: 'Khety and His Household',
    blurb: 'The tomb owner at monumental scale with his wife, offering-bearers and livestock — the ceremonial frame around the combat scenes.',
    file: 'bh2-t17-pl14.jpg',
    wrestling: false,
    registers: [],
  },
  {
    id: 'bh2-t15-pl7',
    tomb: 'Tomb 15 — Baqet III',
    plate: 'Plate VII',
    wall: 'Main chamber, south wall (western end)',
    title: 'The South Wall of Baqet III',
    blurb: 'Baqet III bearing his staff, with registers of agriculture, cattle and craft — the same hand that drew the wrestlers, at rest.',
    file: 'bh2-t15-pl7.jpg',
    wrestling: false,
    registers: [],
  },
];

// ── Open archives — where the primary record lives (all free) ────────────────

export interface OpenArchive { name: string; org: string; url: string; access: string; desc: string }
export const COMBAT_ARCHIVES: OpenArchive[] = [
  {
    name: 'Beni Hasan, Part II (1893)', org: 'Egypt Exploration Fund · Internet Archive',
    url: 'https://archive.org/details/beni-hasan-v.-2', access: 'Public domain',
    desc: 'THE priority volume — the tombs of Baqet III (BH15) and Khety (BH17) with the sequential wrestling-scene plates: the museum’s Egypt-wing fight manual.',
  },
  {
    name: 'Beni Hasan, Part I (1893)', org: 'Egypt Exploration Fund · Internet Archive',
    url: 'https://archive.org/details/beni-hasan-v.-1', access: 'Public domain',
    desc: 'Tombs of Amenemhat and Khnumhotep II — context volume for the Middle Kingdom tomb corpus.',
  },
  {
    name: 'Beni Hasan, Parts III–IV (1896/1900)', org: 'Egypt Exploration Fund · Internet Archive',
    url: 'https://archive.org/details/beni-hasan-v.-4', access: 'Public domain',
    desc: 'Hieroglyphic studies and color facsimiles — including plates by a young Howard Carter, before Tutankhamun fame.',
  },
  {
    name: 'Met Open Access API', org: 'The Metropolitan Museum of Art',
    url: 'https://metmuseum.github.io/', access: 'CC0',
    desc: '406,000+ CC0 artifact images — shields, staff weapons, Egyptian reliefs, African arms — queryable live; every object flagged isPublicDomain is free for any use.',
  },
  {
    name: 'Wikimedia Commons', org: 'Wikimedia Foundation',
    url: 'https://commons.wikimedia.org/', access: 'CC / PD',
    desc: 'The largest free-license photo record of the living arts — laamb arenas, dambe bouts, capoeira rodas, stick-fight festivals — each file carrying its own license.',
  },
  {
    name: 'UNESCO Intangible Cultural Heritage', org: 'UNESCO',
    url: 'https://ich.unesco.org/', access: 'Open',
    desc: 'Official inscriptions for Egyptian tahtib (2016) and the capoeira circle (2014) — dossiers, photos and documentation for the recognized arts.',
  },
  {
    name: 'Endangered Archives Programme', org: 'British Library',
    url: 'https://eap.bl.uk/', access: 'Open',
    desc: 'Digitization race for at-risk records — including the Afro-Colombian grima manuscripts (cartillas de malicia) of the diaspora fight-book tradition.',
  },
  {
    name: 'Wiktenauer', org: 'HEMA Alliance',
    url: 'https://wiktenauer.com/', access: 'PD / CC',
    desc: 'The world’s largest library of historical European fight books — Liechtenauer, Fiore, Meyer and hundreds more, with scans and translations.',
  },
  {
    name: 'Fior di Battaglia (Getty)', org: 'J. Paul Getty Museum',
    url: 'https://www.getty.edu/art/collection/object/103RXT', access: 'Open',
    desc: 'Fiore dei Liberi’s c. 1404 masterwork, Ms. Ludwig XV 13 — the illuminated cornerstone of the Italian school, digitized in full.',
  },
  {
    name: 'CMU Graphics Lab Motion Capture', org: 'Carnegie Mellon University',
    url: 'http://mocap.cs.cmu.edu/', access: 'Free',
    desc: 'The Motion Lab’s production-legal shelf: ~2,500 captured motions across 140+ subjects — including kicks, punches and stances — free for any use.',
  },
  {
    name: 'UMONS-TAICHI', org: 'University of Mons · numediart',
    url: 'https://github.com/numediart/UMONS-TAICHI', access: 'CC BY-NC-SA',
    desc: '2,200 Taijiquan gesture captures (68 markers @ 179 Hz) across 13 technique classes and expert-scored skill levels — the open-data star of the kinetic archive. Non-commercial; research and reference use.',
  },
];

// ── Citation-only shelf (never ingested — cite & summarize) ──────────────────

export const CITATION_ONLY_SHELF = [
  { title: 'Desch-Obi, Fighting for Honor (USC Press, 2008)', use: 'cite & summarize' },
  { title: 'Green, Martial Arts of the World: An Encyclopedia (ABC-CLIO)', use: 'cite & summarize' },
  { title: 'EJMAS Kronos chronology (Svinth)', use: 'research map only' },
] as const;

// ── The full museum — wing helper ────────────────────────────────────────────

export const artsInWing = (wing: WingId) => COMBAT_ARTS.filter(a => a.wing === wing);
