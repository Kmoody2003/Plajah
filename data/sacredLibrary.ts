// sacredLibrary — curated, real, free/open resources for the Lorea Sacred
// Library. A seed collection (verified public links) meant to grow into the
// most comprehensive free Christian-history nexus. Each section is data-driven
// so entries can be added without touching the UI.

export interface LibraryEntry {
  title: string;
  by?: string;          // author / source
  era?: string;         // century / date
  blurb: string;
  url: string;          // primary link (public resource)
  image?: string;       // optional cover/scan thumbnail
  tag?: string;         // small category chip
}

export interface LibrarySection {
  id: string;
  title: string;
  subtitle: string;
  icon: string;         // lucide icon name
  intro: string;
  entries: LibraryEntry[];
}

// ── Ancient hymns — parallel lyrics + recordings ─────────────────────────────
export interface Hymn {
  title: string;
  origin: string;
  century: string;
  lang: string;             // language label
  blurb: string;
  audioUrl?: string;        // a recording (archive.org / public)
  original: string[];       // original-language lines
  english: string[];        // english translation lines
}

export const HYMNS: Hymn[] = [
  {
    title: 'Phos Hilaron (Φῶς Ἱλαρόν)',
    origin: 'Greek · Eastern Church (the oldest Christian hymn still in use today)',
    century: 'c. 3rd–4th century',
    lang: 'Koine Greek',
    blurb: 'The "Hymn of the Lamplighting," sung at the lighting of the evening lamps — referenced by St. Basil the Great in the 4th century as already ancient.',
    audioUrl: 'https://archive.org/details/PhosHilaron',
    original: ['Φῶς ἱλαρὸν ἁγίας δόξης,', 'ἀθανάτου Πατρός,', 'οὐρανίου, ἁγίου, μάκαρος,', 'Ἰησοῦ Χριστέ,'],
    english: ['O gladsome Light of the holy glory', 'of the immortal Father,', 'heavenly, holy, blessed,', 'O Jesus Christ,'],
  },
  {
    title: 'Oxyrhynchus Hymn (P. Oxy. XV 1786)',
    origin: 'Greek · Egypt — the earliest Christian hymn surviving WITH its musical notation',
    century: 'c. late 3rd century',
    lang: 'Koine Greek',
    blurb: 'A papyrus fragment found at Oxyrhynchus, notated in ancient Greek vocal notation — the oldest known sheet music of the Church.',
    audioUrl: 'https://archive.org/details/OxyrhynchusHymn',
    original: ['…πρυτανήων σιγάτω,', 'μηδ’ ἄστρα φαεσφόρα λειπέσθων,', '…πᾶσαι Θεοῦ ἡμῶν, ἀμήν, ἀμήν.'],
    english: ['…let it be silent,', 'let the shining stars not lag behind,', '…all, of our God. Amen, amen.'],
  },
  {
    title: 'Te Deum Laudamus',
    origin: 'Latin · Western Church',
    century: 'c. 4th century',
    lang: 'Ecclesiastical Latin',
    blurb: 'The great hymn of praise traditionally ascribed to Ambrose and Augustine, sung at the Office of Readings and great thanksgivings.',
    audioUrl: 'https://archive.org/details/TeDeum',
    original: ['Te Deum laudámus:', 'te Dóminum confitémur.', 'Te ætérnum Patrem', 'omnis terra venerátur.'],
    english: ['We praise thee, O God:', 'we acknowledge thee to be the Lord.', 'All the earth doth worship thee:', 'the Father everlasting.'],
  },
  {
    title: 'Akathist to the Theotokos',
    origin: 'Greek · Byzantine — "Χαῖρε, Νύμφη ἀνύμφευτε"',
    century: 'c. 5th–6th century',
    lang: 'Koine Greek',
    blurb: 'The supreme Marian hymn of the Eastern Church, chanted standing ("a-kathistos" = not seated), woven from 24 stanzas matching the Greek alphabet.',
    audioUrl: 'https://archive.org/details/Akathist',
    original: ['Τῇ ὑπερμάχῳ στρατηγῷ τὰ νικητήρια,', 'ὡς λυτρωθεῖσα τῶν δεινῶν εὐχαριστήρια…'],
    english: ['To thee, the Champion Leader, we thy servants', 'dedicate a feast of victory and of thanksgiving…'],
  },
  {
    title: 'Pange Lingua Gloriosi',
    origin: 'Latin · Western — Venantius Fortunatus',
    century: 'c. 6th century',
    lang: 'Ecclesiastical Latin',
    blurb: 'A processional hymn of the Passion (later echoed by Aquinas), among the oldest continuously-sung Latin hymns of the Cross.',
    audioUrl: 'https://archive.org/details/PangeLingua',
    original: ['Pange, lingua, gloriósi', 'prœlium certáminis,', 'et super crucis tropǽo', 'dic triúmphum nóbilem…'],
    english: ['Sing, my tongue, the glorious battle,', 'sing the ending of the fray;', 'now above the Cross, the trophy,', 'sound the loud triumphant lay…'],
  },
];

// ── Primary texts — read the actual documents in-app ────────────────────────
export interface PrimaryText { title: string; era: string; type: string; source: string; body: string[]; }

export const PRIMARY_TEXTS: PrimaryText[] = [
  {
    title: 'The Apostles’ Creed', era: 'c. 2nd–4th century', type: 'Creed', source: 'Traditional Western text',
    body: [
      'I believe in God, the Father almighty, creator of heaven and earth.',
      'And in Jesus Christ, his only Son, our Lord, who was conceived by the Holy Spirit, born of the Virgin Mary, suffered under Pontius Pilate, was crucified, died and was buried; he descended to the dead. On the third day he rose again; he ascended into heaven, is seated at the right hand of the Father, and will come to judge the living and the dead.',
      'I believe in the Holy Spirit, the holy catholic Church, the communion of saints, the forgiveness of sins, the resurrection of the body, and the life everlasting. Amen.',
    ],
  },
  {
    title: 'The Nicene Creed', era: '325 / 381 AD', type: 'Creed', source: 'First Council of Nicaea & Constantinople',
    body: [
      'We believe in one God, the Father almighty, maker of heaven and earth, of all things visible and invisible.',
      'And in one Lord Jesus Christ, the only-begotten Son of God, begotten of the Father before all ages; Light of Light, true God of true God, begotten not made, of one essence with the Father, by whom all things were made; who for us men and for our salvation came down from heaven, and was incarnate by the Holy Spirit of the Virgin Mary, and was made man;',
      'and was crucified also for us under Pontius Pilate; he suffered and was buried; and the third day he rose again, according to the Scriptures; and ascended into heaven, and sits at the right hand of the Father; and he shall come again, with glory, to judge the living and the dead; whose kingdom shall have no end.',
      'And we believe in the Holy Spirit, the Lord and Giver of Life, who proceeds from the Father, who with the Father and the Son together is worshipped and glorified, who spoke by the prophets.',
      'And we believe in one holy catholic and apostolic Church. We acknowledge one baptism for the remission of sins; and we look for the resurrection of the dead, and the life of the world to come. Amen.',
    ],
  },
  {
    title: 'The Didache — The Two Ways', era: 'c. 1st century', type: 'Teaching', source: 'Teaching of the Twelve Apostles, ch. 1–2',
    body: [
      'There are two ways, one of life and one of death; and between the two ways there is a great difference.',
      'The way of life is this: First, you shall love God who made you; second, your neighbour as yourself; and whatever you would not have done to you, do not do to another.',
      'Bless those who curse you, and pray for your enemies, and fast for those who persecute you. For what credit is it if you love those who love you? Do not the heathen do the same? But love those who hate you, and you shall have no enemy.',
      'My child, flee from every evil and from everything like it. Be not angry, for anger leads to murder… but be meek, for the meek shall inherit the earth.',
    ],
  },
  {
    title: 'The Chalcedonian Definition', era: '451 AD', type: 'Definition', source: 'Council of Chalcedon',
    body: [
      'Following the holy Fathers, we all with one voice confess our Lord Jesus Christ to be one and the same Son, the same perfect in Godhead and the same perfect in manhood, truly God and truly man…',
      'to be acknowledged in two natures, without confusion, without change, without division, without separation; the distinction of natures being in no way annulled by the union, but rather the property of each nature being preserved, and concurring in one Person and one Subsistence,',
      'not parted or divided into two persons, but one and the same Son and only-begotten God the Word, the Lord Jesus Christ; as the prophets from the beginning declared concerning him, and the Lord Jesus Christ himself taught us, and the Creed of the holy Fathers has handed down to us.',
    ],
  },
];

// ── The eight sections of the library ────────────────────────────────────────
export const SACRED_SECTIONS: LibrarySection[] = [
  {
    id: 'manuscripts', title: 'Original Manuscripts', subtitle: 'The oldest copies, in their own hands',
    icon: 'ScrollText',
    intro: 'High-resolution digitizations of the earliest biblical manuscripts — read the actual leaves of the codices and papyri behind every translation.',
    entries: [
      { title: 'Codex Sinaiticus', era: 'c. 330–360 AD', by: 'British Library / Leipzig / Sinai / St Petersburg', blurb: 'The oldest complete New Testament — fully digitized, page by page, in Greek with transcription and translation.', url: 'https://www.codexsinaiticus.org/en/manuscript.aspx', tag: 'Greek' },
      { title: 'Codex Vaticanus (B)', era: 'c. 300–325 AD', by: 'Vatican Library (DigiVatLib)', blurb: 'One of the two oldest near-complete Bibles, imaged in the Vatican’s IIIF library.', url: 'https://digi.vatlib.it/view/MSS_Vat.gr.1209', tag: 'Greek' },
      { title: 'Dead Sea Scrolls — Great Isaiah Scroll', era: 'c. 125 BC', by: 'Israel Museum, Jerusalem', blurb: 'The complete Book of Isaiah a thousand years older than any prior Hebrew copy — zoomable column by column.', url: 'https://dss.collections.imj.org.il/isaiah', tag: 'Hebrew' },
      { title: 'Chester Beatty Biblical Papyri', era: 'c. 200 AD', by: 'Chester Beatty, Dublin', blurb: 'Among the earliest papyrus codices of the Gospels, Acts and Paul’s letters.', url: 'https://chesterbeatty.ie/', tag: 'Papyrus' },
      { title: 'Codex Alexandrinus (A)', era: 'c. 400–440 AD', by: 'British Library', blurb: 'A 5th-century Greek Bible including the Epistles of Clement.', url: 'https://www.bl.uk/manuscripts/FullDisplay.aspx?ref=Royal_MS_1_D_VIII', tag: 'Greek' },
    ],
  },
  {
    id: 'early-church', title: 'The Early Church', subtitle: 'The Fathers, in their own words',
    icon: 'Users',
    intro: 'The complete writings of the Apostolic and Church Fathers — the first generations who received the faith from the Apostles.',
    entries: [
      { title: 'The Apostolic Fathers', era: '1st–2nd c.', by: 'Clement, Ignatius, Polycarp, Didache', blurb: 'The earliest Christian writings outside the New Testament — letters from men who knew the Apostles.', url: 'https://www.ccel.org/ccel/lake/fathers', tag: 'CCEL' },
      { title: 'Ante-Nicene Fathers', era: 'to 325 AD', by: 'Roberts & Donaldson (full set)', blurb: 'Justin Martyr, Irenaeus, Tertullian, Origen, Cyprian and more — the full 10-volume corpus.', url: 'https://www.newadvent.org/fathers/', tag: 'New Advent' },
      { title: 'Nicene & Post-Nicene Fathers', era: '4th–5th c.', by: 'Athanasius, Basil, the Gregories, Chrysostom, Augustine', blurb: 'The great doctors of the golden age of patristics, fully searchable.', url: 'https://www.ccel.org/fathers.html', tag: 'CCEL' },
      { title: 'Eusebius — Church History', era: 'c. 324 AD', by: 'Eusebius of Caesarea', blurb: 'The first history of the Church, from the Apostles to Constantine — our primary source for the first three centuries.', url: 'https://www.newadvent.org/fathers/2501.htm', tag: 'History' },
    ],
  },
  {
    id: 'councils', title: 'The Councils', subtitle: 'Where the creeds were forged',
    icon: 'Landmark',
    intro: 'The acts, canons and creeds of the great councils that defined Christian doctrine — from Nicaea to the medieval and reforming councils.',
    entries: [
      { title: 'First Council of Nicaea (325)', era: '325 AD', blurb: 'Condemned Arianism and gave the Church the Nicene Creed and the date of Easter.', url: 'https://www.newadvent.org/cathen/11044a.htm', tag: 'Creed' },
      { title: 'First Council of Constantinople (381)', era: '381 AD', blurb: 'Completed the Nicene Creed and affirmed the divinity of the Holy Spirit.', url: 'https://www.newadvent.org/cathen/04308a.htm', tag: 'Creed' },
      { title: 'Council of Ephesus (431)', era: '431 AD', blurb: 'Affirmed Mary as Theotokos and condemned Nestorianism.', url: 'https://www.newadvent.org/cathen/05491a.htm', tag: 'Christology' },
      { title: 'Council of Chalcedon (451)', era: '451 AD', blurb: 'Defined the two natures of Christ in one person — the Chalcedonian Definition.', url: 'https://www.newadvent.org/cathen/03555a.htm', tag: 'Christology' },
      { title: 'All Twenty-One Ecumenical Councils', era: '325–1965', blurb: 'Full texts, canons and decrees of every council recognized in the West.', url: 'https://www.papalencyclicals.net/councils/', tag: 'Full texts' },
    ],
  },
  {
    id: 'archaeology', title: 'Biblical Archaeology', subtitle: 'Stones that speak',
    icon: 'Pickaxe',
    intro: 'Excavations, inscriptions and artifacts that illuminate the world of Scripture — and the scholarship surrounding them.',
    entries: [
      { title: 'Biblical Archaeology Society', blurb: 'Decades of articles, dig reports and the Biblical Archaeology Review archive.', url: 'https://www.biblicalarchaeology.org/', tag: 'Journal' },
      { title: 'ASOR — American Society of Overseas Research', blurb: 'Peer-reviewed Near Eastern archaeology and the ASOR blog.', url: 'https://www.asor.org/', tag: 'Scholarship' },
      { title: 'The Tel Dan Stele', era: '9th c. BC', blurb: 'The earliest extra-biblical reference to the "House of David."', url: 'https://www.britannica.com/topic/Tel-Dan-inscription', tag: 'Inscription' },
      { title: 'The Pilate Stone', era: '1st c. AD', blurb: 'A limestone block from Caesarea naming Pontius Pilate, prefect of Judea.', url: 'https://www.britannica.com/topic/Pilate-Stone', tag: 'Inscription' },
    ],
  },
  {
    id: 'apostles', title: 'Routes of the Apostles', subtitle: 'How the faith spread',
    icon: 'Map',
    intro: 'The missionary journeys of the Apostles and their successors — the roads, sea-lanes and cities by which Christianity reached the world.',
    entries: [
      { title: 'The Journeys of St. Paul', era: '46–62 AD', blurb: 'Three missionary journeys and the voyage to Rome — mapped across the Mediterranean.', url: 'https://www.biblestudy.org/maps/apostle-paul-first-missionary-journey-map.html', tag: 'Map' },
      { title: 'The Apostles & Their Missions', blurb: 'Traditional fields of the Twelve — Thomas to India, Andrew to Scythia, Mark to Egypt.', url: 'https://www.newadvent.org/cathen/01626c.htm', tag: 'Tradition' },
      { title: 'Spread of Christianity (Maps)', blurb: 'The expansion of the Church across the Roman world by the 4th century.', url: 'https://en.wikipedia.org/wiki/Early_centers_of_Christianity', tag: 'Atlas' },
    ],
  },
  {
    id: 'crusades', title: 'The Crusades', subtitle: 'Every side of the story',
    icon: 'Swords',
    intro: 'A balanced, multi-perspective exploration of the Crusades — Latin, Byzantine, and Islamic sources side by side.',
    entries: [
      { title: 'Internet Medieval Sourcebook — Crusades', blurb: 'Primary documents from all sides, hosted by Fordham University.', url: 'https://sourcebooks.fordham.edu/sbook1k.asp', tag: 'Sources' },
      { title: 'The Alexiad', by: 'Anna Komnene', era: '12th c.', blurb: 'The Byzantine princess’s firsthand account of the First Crusade.', url: 'https://sourcebooks.fordham.edu/basis/AnnaComnena-Alexiad00.asp', tag: 'Byzantine' },
      { title: 'Arab Historians of the Crusades', blurb: 'Ibn al-Athir, Usama ibn Munqidh and others — the view from the Muslim world.', url: 'https://en.wikipedia.org/wiki/Historiography_of_the_Crusades', tag: 'Islamic' },
    ],
  },
  {
    id: 'kingdoms', title: 'Kingdoms & Cultures', subtitle: 'The world behind the text',
    icon: 'Crown',
    intro: 'Deep dives into the empires and peoples woven through Scripture — Egypt, Assyria, Babylon, Persia, Greece and Rome.',
    entries: [
      { title: 'Ancient Egypt', blurb: 'The empire of the Exodus — pharaohs, the Nile, and Israel in Goshen.', url: 'https://www.worldhistory.org/egypt/', tag: 'Empire' },
      { title: 'Assyria & Babylon', blurb: 'The powers of the prophets — Nineveh, the Exile, Nebuchadnezzar.', url: 'https://www.worldhistory.org/assyria/', tag: 'Empire' },
      { title: 'The Persian Empire', blurb: 'Cyrus the liberator and the world of Esther, Ezra and Nehemiah.', url: 'https://www.worldhistory.org/persia/', tag: 'Empire' },
      { title: 'Rome in the New Testament', blurb: 'The empire of Caesar, the roads of Paul, and the world of the early Church.', url: 'https://www.worldhistory.org/Roman_Empire/', tag: 'Empire' },
    ],
  },
  {
    id: 'artifacts', title: 'Artifacts & Holy Things', subtitle: 'Drawings, diagrams & scholarship',
    icon: 'Gem',
    intro: 'The sacred objects of Scripture — the Ark, the Tabernacle, the Temple, the menorah — reconstructed and explained.',
    entries: [
      { title: 'The Ark of the Covenant', blurb: 'Construction, the mercy seat, and its journey through Israel’s history.', url: 'https://www.britannica.com/topic/Ark-of-the-Covenant', tag: 'Diagram' },
      { title: 'The Tabernacle', blurb: 'The portable sanctuary of the wilderness — courts, the Holy Place, the Most Holy Place.', url: 'https://www.bible-history.com/tabernacle/', tag: 'Reconstruction' },
      { title: 'Solomon’s Temple', blurb: 'The First Temple in Jerusalem — plan, pillars and furnishings.', url: 'https://www.worldhistory.org/Solomon%27s_Temple/', tag: 'Reconstruction' },
      { title: 'The Menorah', blurb: 'The seven-branched lampstand, depicted on the Arch of Titus.', url: 'https://www.britannica.com/topic/menorah', tag: 'Artifact' },
    ],
  },
];
