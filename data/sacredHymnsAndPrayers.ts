// data/sacredHymnsAndPrayers.ts
// Public-Domain Hymns, Worship Songs (with Historical Provenance & Accompaniment Scores)
// and Catholic & Orthodox Liturgical Prayers for Ambo, Lectio, and Lorea.

import type { Album, BookChapter } from '../types';
import { openAlbumInLorea } from '../services/loreaOpen';

export interface HymnAccompanimentScore {
  tuneName: string;
  meter: string;
  defaultKey: string;
  availableKeys: string[];
  timeSignature: string;
  tempoMarking: string;
  arrangement: 'SATB_HYMNAL' | 'ORGAN_CHORALE' | 'BYZANTINE_ISON' | 'GREGORIAN_CHANT' | 'STRING_QUARTET';
  /** Concise soprano/alto/tenor/bass harmonic lead and pedal notes for score display */
  sopranoNotes: Array<{ pitch: string; lyric: string; beat: number }>;
  chordProgression: string[];
}

export interface SacredHymnOrPrayer {
  id: string;
  kind: 'PUBLIC_DOMAIN_HYMN' | 'CATHOLIC_PRAYER' | 'ORTHODOX_PRAYER';
  title: string;
  originalTitle?: string;
  tradition: 'ECUMENICAL_HYMN' | 'CATHOLIC' | 'EASTERN_ORTHODOX' | 'CELTIC_MONASTIC' | 'PATRISTIC';
  author: string;
  year: string;
  composer?: string;
  scriptureRefs: string[];
  stanzas: string[];
  originalLanguage?: 'LATIN' | 'GREEK' | 'OLD_IRISH' | 'CHURCH_SLAVONIC' | 'SYRIAC';
  originalStanzas?: string[];
  historyTitle: string;
  historyEssay: string;
  liturgicalSeason?: string;
  score?: HymnAccompanimentScore;
}

export const PUBLIC_DOMAIN_HYMNS: SacredHymnOrPrayer[] = [
  {
    id: 'pd-hymn-be-thou-my-vision',
    kind: 'PUBLIC_DOMAIN_HYMN',
    title: 'Be Thou My Vision',
    originalTitle: 'Rop Tú Mo Baile',
    tradition: 'CELTIC_MONASTIC',
    author: 'Attributed to St. Dallán Forgaill · Trans. Mary E. Byrne (1905) & Eleanor Hull (1912)',
    year: '6th Century / 1905',
    composer: 'Traditional Irish Ballad (Tune: SLANE)',
    scriptureRefs: ['Psalm 73:25-26', 'Proverbs 3:5-6', 'Colossians 1:17-18', 'Ephesians 6:14'],
    originalLanguage: 'OLD_IRISH',
    originalStanzas: [
      'Rop tú mo baile, a Choimdiu cride,\nní ní nech aile acht Rí secht nime.',
      'Rop tú mo scrútan i l-ló ’s i n-aidche;\nrop tú ad-chëar im chotlud caemthe.',
    ],
    stanzas: [
      'Be Thou my Vision, O Lord of my heart;\nNaught be all else to me, save that Thou art—\nThou my best Thought, by day or by night,\nWaking or sleeping, Thy presence my light.',
      'Be Thou my Wisdom, and Thou my true Word;\nI ever with Thee and Thou with me, Lord;\nThou my great Father, I Thy true son;\nThou in me dwelling, and I with Thee one.',
      'Be Thou my battle Shield, Sword for the fight;\nBe Thou my Dignity, Thou my Delight;\nThou my soul’s Shelter, Thou my high Tower:\nRaise Thou me heavenward, O Power of my power.',
      'Riches I heed not, nor man’s empty praise,\nThou mine Inheritance, now and always:\nThou and Thou only, first in my heart,\nHigh King of Heaven, my Treasure Thou art.',
      'High King of Heaven, my victory won,\nMay I reach Heaven’s joys, O bright Heaven’s Sun!\nHeart of my own heart, whatever befall,\nStill be my Vision, O Ruler of all.',
    ],
    historyTitle: 'The Blind Poet-Saint of Early Ireland & The Paschal Fire on Slane Hill',
    historyEssay:
      'Attributed to Eochaid Mac Colla (St. Dallán Forgaill, c. 530–598), chief poet of Ireland who went blind from intensive study and composed the famous eulogy Amra Choluim Chille for St. Columba of Iona. Preserved in two 14th-century vellum manuscripts at the Royal Irish Academy in Dublin, the Old Irish lorica prayer was translated into literal English prose by scholar Mary Elizabeth Byrne in the journal Ériu (1905) and versified into ten-syllable meter by Eleanor Hull in 1912. In the 1919 Irish Church Hymnal, Leopold Dix paired the text with the traditional folk melody SLANE, named for Slane Hill in County Meath where St. Patrick defied Pagan King Loegaire by lighting the Easter Paschal candle on Holy Saturday night in 433 AD.',
    liturgicalSeason: 'Ordinary Time · Covenant & Consecration',
    score: {
      tuneName: 'SLANE',
      meter: '10.10.10.10',
      defaultKey: 'D Major',
      availableKeys: ['C Major', 'D Major', 'Eb Major', 'F Major', 'G Major'],
      timeSignature: '3/4',
      tempoMarking: 'Andante Sostenuto (♩ = 84)',
      arrangement: 'SATB_HYMNAL',
      sopranoNotes: [
        { pitch: 'D4', lyric: 'Be', beat: 1 },
        { pitch: 'D4', lyric: 'Thou', beat: 2 },
        { pitch: 'E4', lyric: 'my', beat: 3 },
        { pitch: 'D4', lyric: 'Vi-', beat: 4 },
        { pitch: 'B3', lyric: 'sion,', beat: 5 },
        { pitch: 'A3', lyric: 'O', beat: 6 },
        { pitch: 'A3', lyric: 'Lord', beat: 7 },
        { pitch: 'B3', lyric: 'of', beat: 8 },
        { pitch: 'D4', lyric: 'my', beat: 9 },
        { pitch: 'D4', lyric: 'heart;', beat: 10 },
      ],
      chordProgression: ['D', 'Bm7', 'Gmaj7', 'D/F#', 'Em7', 'A7sus4', 'D'],
    },
  },
  {
    id: 'pd-hymn-amazing-grace',
    kind: 'PUBLIC_DOMAIN_HYMN',
    title: 'Amazing Grace (Faith’s Review and Expectation)',
    tradition: 'ECUMENICAL_HYMN',
    author: 'John Newton (1725–1807)',
    year: '1773 / Published 1779',
    composer: 'William Walker’s Southern Harmony (1835 · Tune: NEW BRITAIN)',
    scriptureRefs: ['1 Chronicles 17:16-17', 'Ephesians 2:8-9', '2 Corinthians 5:17', 'Luke 15:24'],
    stanzas: [
      'Amazing grace! (how sweet the sound)\nThat saved a wretch like me!\nI once was lost, but now am found,\nWas blind, but now I see.',
      '’Twas grace that taught my heart to fear,\nAnd grace my fears relieved;\nHow precious did that grace appear\nThe hour I first believed!',
      'Through many dangers, toils, and snares,\nI have already come;\n’Tis grace hath brought me safe thus far,\nAnd grace will lead me home.',
      'The Lord has promised good to me,\nHis Word my hope secures;\nHe will my Shield and Portion be,\nAs long as life endures.',
      'Yea, when this flesh and heart shall fail,\nAnd mortal life shall cease,\nI shall possess, within the veil,\nA life of joy and peace.',
    ],
    historyTitle: 'From Atlantic Tempest to Olney Parish & Abolitionist Witness',
    historyEssay:
      'Composed in December 1772 by Rev. John Newton, curate of St. Peter and St. Paul Church in Olney, Buckinghamshire, as the homily hymn for New Year’s Day service on January 1, 1773, meditating on King David’s prayer in 1 Chronicles 17:16–17 ("Who am I, O Lord God, and what is mine house, that thou hast brought me hitherto?"). Newton had survived a violent North Atlantic storm off Donegal on March 21, 1748 aboard the merchant vessel Greyhound—a date he observed with fasting and prayer for the rest of his life—and later renounced the slave trade entirely, authoring Thoughts Upon the African Slave Trade (1788) alongside William Wilberforce. Published in Olney Hymns (1779) with William Cowper, the poem was wedded in 1835 by shape-note singing master William Walker to the pentatonic melody NEW BRITAIN in Southern Harmony.',
    liturgicalSeason: 'Lent · Repentance · Redemption',
    score: {
      tuneName: 'NEW BRITAIN',
      meter: 'C.M. (8.6.8.6)',
      defaultKey: 'G Major',
      availableKeys: ['E Major', 'F Major', 'G Major', 'Ab Major', 'A Major'],
      timeSignature: '3/4',
      tempoMarking: 'Adagio Espressivo (♩ = 72)',
      arrangement: 'SATB_HYMNAL',
      sopranoNotes: [
        { pitch: 'D4', lyric: 'A-', beat: 1 },
        { pitch: 'G4', lyric: 'ma-', beat: 2 },
        { pitch: 'B4', lyric: 'zing', beat: 3 },
        { pitch: 'G4', lyric: 'grace!', beat: 4 },
        { pitch: 'B4', lyric: 'how', beat: 5 },
        { pitch: 'A4', lyric: 'sweet', beat: 6 },
        { pitch: 'G4', lyric: 'the', beat: 7 },
        { pitch: 'E4', lyric: 'sound', beat: 8 },
        { pitch: 'D4', lyric: 'that', beat: 9 },
      ],
      chordProgression: ['G', 'G7/B', 'C', 'G/D', 'Em7', 'D7', 'G'],
    },
  },
  {
    id: 'pd-hymn-holy-holy-holy',
    kind: 'PUBLIC_DOMAIN_HYMN',
    title: 'Holy, Holy, Holy! Lord God Almighty',
    tradition: 'ECUMENICAL_HYMN',
    author: 'Bishop Reginald Heber (1783–1826)',
    year: '1826 / Tune 1861',
    composer: 'John Bacchus Dykes (Tune: NICAEA)',
    scriptureRefs: ['Revelation 4:8-11', 'Isaiah 6:1-3', 'Exodus 15:11'],
    stanzas: [
      'Holy, holy, holy! Lord God Almighty!\nEarly in the morning our song shall rise to Thee;\nHoly, holy, holy, merciful and mighty!\nGod in three Persons, blessed Trinity!',
      'Holy, holy, holy! all the saints adore Thee,\nCasting down their golden crowns around the glassy sea;\nCherubim and seraphim falling down before Thee,\nWhich wert, and art, and evermore shalt be.',
      'Holy, holy, holy! though the darkness hide Thee,\nThough the eye of sinful man Thy glory may not see;\nOnly Thou art holy; there is none beside Thee,\nPerfect in power, in love, and purity.',
      'Holy, holy, holy! Lord God Almighty!\nAll Thy works shall praise Thy Name, in earth, and sky, and sea;\nHoly, holy, holy; merciful and mighty!\nGod in three Persons, blessed Trinity!',
    ],
    historyTitle: 'Trinity Sunday at Hodnet & The Tune Named for Nicaea (325 AD)',
    historyEssay:
      'Written by Reginald Heber while serving as vicar of Hodnet in Shropshire, England, to be sung on Trinity Sunday between the Epistle reading (Revelation 4:1–11, where the four living creatures rest not day and night saying "Holy, holy, holy, Lord God Almighty") and the Gospel reading (John 3). Published posthumously in 1826 after Heber died in Tiruchirappalli while serving as Bishop of Calcutta. In 1861, Rev. John Bacchus Dykes—precentor of Durham Cathedral—composed the majestic tune NICAEA specifically for these words in Hymns Ancient and Modern, naming the melody after the First Ecumenical Council of Nicaea (325 AD), which defended the consubstantial Trinity.',
    liturgicalSeason: 'Trinity Sunday · Morning Lauds',
    score: {
      tuneName: 'NICAEA',
      meter: '11.12.12.10',
      defaultKey: 'D Major',
      availableKeys: ['C Major', 'D Major', 'Eb Major', 'E Major'],
      timeSignature: '4/4',
      tempoMarking: 'Maestoso (♩ = 92)',
      arrangement: 'ORGAN_CHORALE',
      sopranoNotes: [
        { pitch: 'D4', lyric: 'Ho-', beat: 1 },
        { pitch: 'D4', lyric: 'ly,', beat: 2 },
        { pitch: 'F#4', lyric: 'ho-', beat: 3 },
        { pitch: 'F#4', lyric: 'ly,', beat: 4 },
        { pitch: 'A4', lyric: 'ho-', beat: 5 },
        { pitch: 'A4', lyric: 'ly!', beat: 6 },
        { pitch: 'B4', lyric: 'Lord', beat: 7 },
        { pitch: 'B4', lyric: 'God', beat: 8 },
      ],
      chordProgression: ['D', 'Bm', 'F#m/A', 'G', 'Em7', 'A7', 'D'],
    },
  },
  {
    id: 'pd-hymn-it-is-well',
    kind: 'PUBLIC_DOMAIN_HYMN',
    title: 'It Is Well With My Soul',
    tradition: 'ECUMENICAL_HYMN',
    author: 'Horatio Gates Spafford (1828–1888)',
    year: '1873 / Published 1876',
    composer: 'Philip Paul Bliss (Tune: VILLE DU HAVRE)',
    scriptureRefs: ['2 Kings 4:26', 'Psalm 46:1-3', 'Colossians 2:14', '1 Thessalonians 4:16'],
    stanzas: [
      'When peace, like a river, attendeth my way,\nWhen sorrows like sea billows roll;\nWhatever my lot, Thou hast taught me to say,\nIt is well, it is well with my soul.',
      'Though Satan should buffet, though trials should come,\nLet this blest assurance control,\nThat Christ hath regarded my helpless estate,\nAnd hath shed His own blood for my soul.',
      'My sin—oh, the bliss of this glorious thought!—\nMy sin, not in part but the whole,\nIs nailed to the cross, and I bear it no more,\nPraise the Lord, praise the Lord, O my soul!',
      'And Lord, haste the day when the faith shall be sight,\nThe clouds be rolled back as a scroll;\nThe trump shall resound, and the Lord shall descend,\nEven so, it is well with my soul.',
    ],
    historyTitle: 'Written Over the Mid-Atlantic Coordinates of the SS Ville du Havre',
    historyEssay:
      'Following the Great Chicago Fire of 1871, Presbyterian elder Horatio Spafford sent his wife Anna and four daughters (Annie, Maggie, Bessie, and Tanetta) ahead to Europe on the French ocean liner SS Ville du Havre in November 1873. On November 22, 1873, the vessel was struck mid-Atlantic by the iron clipper Loch Earn and sank within twelve minutes; Anna survived, cabling from Cardiff, Wales: "Saved alone. What shall I do?" As Spafford sailed to join his grieving wife, the captain summoned him to the bridge when the ship passed over the exact coordinates where his four daughters had perished. That night in his cabin, echoing the Shunammite woman’s words in 2 Kings 4:26 ("It is well"), Spafford penned these stanzas. Philip Bliss composed the choral setting VILLE DU HAVRE—named for the stricken ship—in November 1876.',
    liturgicalSeason: 'Comfort · Bereavement · Christian Hope',
    score: {
      tuneName: 'VILLE DU HAVRE',
      meter: '11.8.11.9 with Refrain',
      defaultKey: 'C Major',
      availableKeys: ['Bb Major', 'C Major', 'Db Major', 'D Major'],
      timeSignature: '4/4',
      tempoMarking: 'Moderato Sostenuto (♩ = 80)',
      arrangement: 'SATB_HYMNAL',
      sopranoNotes: [
        { pitch: 'G4', lyric: 'When', beat: 1 },
        { pitch: 'G4', lyric: 'peace', beat: 2 },
        { pitch: 'F4', lyric: 'like', beat: 3 },
        { pitch: 'E4', lyric: 'a', beat: 4 },
        { pitch: 'E4', lyric: 'ri-', beat: 5 },
        { pitch: 'D4', lyric: 'ver', beat: 6 },
      ],
      chordProgression: ['C', 'G7/D', 'C/E', 'F', 'Dm7', 'G7', 'C'],
    },
  },
  {
    id: 'pd-hymn-all-creatures',
    kind: 'PUBLIC_DOMAIN_HYMN',
    title: 'All Creatures of Our God and King',
    originalTitle: 'Cantico di Frate Sole (Canticle of the Sun)',
    tradition: 'CATHOLIC',
    author: 'St. Francis of Assisi (1225) · Trans. William H. Draper (1899)',
    year: '1225 / Tune 1623',
    composer: 'Geistliche Kirchengesäng, Cologne (Tune: LASST UNS ERFREUEN)',
    scriptureRefs: ['Psalm 148:1-13', 'Daniel 3:57-88', 'Revelation 5:13'],
    stanzas: [
      'All creatures of our God and King,\nLift up your voice and with us sing,\nAlleluia! Alleluia!\nThou burning sun with golden beam,\nThou silver moon with softer gleam!\nO praise Him! O praise Him!\nAlleluia! Alleluia! Alleluia!',
      'Thou rushing wind that art so strong,\nYe clouds that sail in Heav’n along,\nO praise Him! Alleluia!\nThou rising morn, in praise rejoice,\nYe lights of evening, find a voice!\nO praise Him! O praise Him!\nAlleluia! Alleluia! Alleluia!',
      'Let all things their Creator bless,\nAnd worship Him in humbleness,\nO praise Him! Alleluia!\nPraise, praise the Father, praise the Son,\nAnd praise the Spirit, Three in One!\nO praise Him! O praise Him!\nAlleluia! Alleluia! Alleluia!',
    ],
    historyTitle: 'St. Francis of Assisi’s Umbrian Canticle & The 1623 Cologne Easter Chorale',
    historyEssay:
      'Dictated by St. Francis of Assisi in the Umbrian vernacular in Spring 1225 while lying nearly blind in a reed hut beside the Monastery of San Damiano, Cantico di Frate Sole is the earliest surviving work of literature in the Italian language. Paraphrased into English verse by Rev. William Henry Draper for a Whitsuntide children’s festival in Leeds around 1899, it was paired by Ralph Vaughan Williams in The English Hymnal (1906) with the jubilant 1623 Easter melody LASST UNS ERFREUEN from the Catholic hymnal Geistliche Kirchengesäng printed in Cologne.',
    liturgicalSeason: 'Eastertide · Creation Care · Feast of St. Francis',
    score: {
      tuneName: 'LASST UNS ERFREUEN',
      meter: '8.8.4.4.8.8 with Alleluias',
      defaultKey: 'D Major',
      availableKeys: ['C Major', 'D Major', 'Eb Major'],
      timeSignature: '3/2',
      tempoMarking: 'Con Spirito (𝅗𝅥 = 66)',
      arrangement: 'ORGAN_CHORALE',
      sopranoNotes: [
        { pitch: 'D4', lyric: 'All', beat: 1 },
        { pitch: 'E4', lyric: 'crea-', beat: 2 },
        { pitch: 'F#4', lyric: 'tures', beat: 3 },
        { pitch: 'G4', lyric: 'of', beat: 4 },
        { pitch: 'A4', lyric: 'our', beat: 5 },
        { pitch: 'F#4', lyric: 'God', beat: 6 },
      ],
      chordProgression: ['D', 'G/D', 'A7/D', 'D', 'Bm', 'Em7', 'A7', 'D'],
    },
  },
];

export const CATHOLIC_AND_ORTHODOX_PRAYERS: SacredHymnOrPrayer[] = [
  {
    id: 'prayer-catholic-anima-christi',
    kind: 'CATHOLIC_PRAYER',
    title: 'Anima Christi (Soul of Christ, Sanctify Me)',
    originalTitle: 'Anima Christi, sanctifica me',
    tradition: 'CATHOLIC',
    author: 'Early 14th-Century Eucharistic Devotion · Roman Missal & St. Ignatius of Loyola',
    year: 'c. 1330 AD',
    composer: 'Mode I Dorian Chant / Post-Communion Meditation',
    scriptureRefs: ['John 6:54-56', 'John 19:34', '1 Corinthians 10:16', 'Colossians 3:3'],
    originalLanguage: 'LATIN',
    originalStanzas: [
      'Anima Christi, sanctifica me.\nCorpus Christi, salva me.\nSanguis Christi, inebria me.\nAqua lateris Christi, lava me.',
      'Passio Christi, conforta me.\nO bone Iesu, exaudi me.\nIntra tua vulnera absconde me.\nNe permittas me separari a te.',
      'Ab hoste maligno defende me.\nIn hora mortis meae voca me.\nEt iube me venire ad te,\nUt cum Sanctis tuis laudem te\nin saecula saeculorum. Amen.',
    ],
    stanzas: [
      'Soul of Christ, sanctify me.\nBody of Christ, save me.\nBlood of Christ, inebriate me.\nWater from the side of Christ, wash me.',
      'Passion of Christ, strengthen me.\nO good Jesus, hear me.\nWithin Thy wounds hide me.\nSuffer me not to be separated from Thee.',
      'From the malignant enemy defend me.\nIn the hour of my death call me,\nAnd bid me come unto Thee,\nThat with Thy Saints I may praise Thee\nFor ever and ever. Amen.',
    ],
    historyTitle: 'From 14th-Century Avignon Books of Hours to St. Ignatius’s Spiritual Exercises',
    historyEssay:
      'Long attributed to Pope John XXII (who granted it an indulgence in 1330), the Anima Christi appears in early 14th-century Books of Hours at the British Library (Harley MS 2253) and is carved in 1364 Moorish plasterwork inside the Alcázar of Seville. St. Ignatius of Loyola placed it at the very threshold of his Spiritual Exercises (1548), referencing it three times as the crown of contemplative prayer after receiving the Holy Eucharist. Musical settings span Jean-Baptiste Lully, Samuel Webbe, and Marco Frisina.',
    liturgicalSeason: 'Holy Eucharist · Thanksgiving After Communion',
    score: {
      tuneName: 'ANIMA CHRISTI CHANT',
      meter: 'Irregular Litany',
      defaultKey: 'D Dorian',
      availableKeys: ['D Dorian', 'E Dorian', 'G Dorian'],
      timeSignature: 'Free Chant',
      tempoMarking: 'Contemplativo',
      arrangement: 'GREGORIAN_CHANT',
      sopranoNotes: [
        { pitch: 'D4', lyric: 'A-', beat: 1 },
        { pitch: 'F4', lyric: 'ni-', beat: 2 },
        { pitch: 'G4', lyric: 'ma', beat: 3 },
        { pitch: 'A4', lyric: 'Chris-', beat: 4 },
        { pitch: 'G4', lyric: 'ti,', beat: 5 },
      ],
      chordProgression: ['Dm', 'C', 'Bb', 'Gm', 'Asus4', 'Dm'],
    },
  },
  {
    id: 'prayer-catholic-salve-regina',
    kind: 'CATHOLIC_PRAYER',
    title: 'Salve Regina (Hail, Holy Queen)',
    originalTitle: 'Salve, Regina, Mater misericordiae',
    tradition: 'CATHOLIC',
    author: 'Hermann of Reichenau (1013–1054)',
    year: 'c. 1050 AD',
    composer: 'Solemn Monastic Tone (Abbey of Reichenau & Cluny)',
    scriptureRefs: ['Luke 1:28', 'Luke 1:42-48', 'John 19:26-27'],
    originalLanguage: 'LATIN',
    originalStanzas: [
      'Salve, Regina, Mater misericordiae,\nvita, dulcedo, et spes nostra, salve.\nAd te clamamus, exsules filii Hevae.\nAd te suspiramus, gementes et flentes\nin hac lacrimarum valle.',
      'Eia, ergo, advocata nostra, illos tuos\nmisericordes oculos ad nos converte;\net Iesum, benedictum fructum ventris tui,\nnobis post hoc exsilium ostende.\nO clemens, O pia, O dulcis Virgo Maria.',
    ],
    stanzas: [
      'Hail, holy Queen, Mother of mercy,\nour life, our sweetness, and our hope.\nTo thee do we cry, poor banished children of Eve;\nto thee do we send up our sighs,\nmourning and weeping in this valley of tears.',
      'Turn then, most gracious advocate,\nthine eyes of mercy toward us;\nand after this our exile, show unto us\nthe blessed fruit of thy womb, Jesus.\nO clement, O loving, O sweet Virgin Mary.',
    ],
    historyTitle: 'Composed by the Paralyzed Monk-Astronomer Hermannus Contractus at Reichenau',
    historyEssay:
      'Composed in the eleventh century by Blessed Hermann of Reichenau (Hermannus Contractus, 1013–1054)—a Benedictine monk on Lake Constance who, despite severe congenital paralysis and cleft palate, became one of medieval Europe’s foremost mathematicians, builders of astrolabes, and composers of sacred sequence chant. According to tradition, St. Bernard of Clairvaux was so moved upon hearing the antiphon echoing through Speyer Cathedral on Christmas Eve 1146 that he knelt thrice on the nave stones and added the closing invocation: "O clement, O loving, O sweet Virgin Mary."',
    liturgicalSeason: 'Night Prayer (Compline) · Trinity Sunday to Advent',
  },
  {
    id: 'prayer-orthodox-trisagion',
    kind: 'ORTHODOX_PRAYER',
    title: 'The Trisagion Prayers & O Heavenly King',
    originalTitle: 'Ἅγιος ὁ Θεός · Βασιλεῦ Οὐράνιε',
    tradition: 'EASTERN_ORTHODOX',
    author: 'Council of Chalcedon (451 AD) & Byzantine Horologion',
    year: '451 AD',
    composer: 'Byzantine Chant · Plagal Mode IV with Ison Drone',
    scriptureRefs: ['Isaiah 6:3', 'Revelation 4:8', 'John 14:16-17', 'Matthew 6:9-13'],
    originalLanguage: 'GREEK',
    originalStanzas: [
      'Βασιλεῦ οὐράνιε, Παράκλητε, τὸ Πνεῦμα τῆς ἀληθείας,\nὁ πανταχοῦ παρὼν καὶ τὰ πάντα πληρῶν,\nὁ θησαυρὸς τῶν ἀγαθῶν καὶ ζωῆς χορηγός,\nἐλθὲ καὶ σκήνωσον ἐν ἡμῖν…',
      'Ἅγιος ὁ Θεός, Ἅγιος Ἰσχυρός, Ἅγιος Ἀθάνατος, ἐλέησον ἡμᾶς. (ἐκ γ΄)\nΔόξα Πατρὶ καὶ Υἱῷ καὶ Ἁγίῳ Πνεύματι,\nκαὶ νῦν καὶ ἀεὶ καὶ εἰς τοὺς αἰῶνας τῶν αἰώνων. Ἀμήν.',
    ],
    stanzas: [
      'O Heavenly King, the Comforter, the Spirit of Truth,\nWho art everywhere present and fillest all things,\nTreasury of Blessings, and Giver of Life:\ncome and abide in us, and cleanse us from every impurity,\nand save our souls, O Good One.',
      'Holy God, Holy Mighty, Holy Immortal, have mercy on us. (Thrice)\nGlory to the Father, and to the Son, and to the Holy Spirit,\nnow and ever, and unto ages of ages. Amen.',
      'All-holy Trinity, have mercy on us. Lord, cleanse us from our sins.\nMaster, pardon our iniquities. Holy One, visit and heal our infirmities,\nfor Thy Name’s sake.',
    ],
    historyTitle: 'The Constantinopolitan Liturgical Threshold Since Patriarch Proclus (438 AD)',
    historyEssay:
      'Known in the Eastern Orthodox Horologion (Book of Hours) as the "Beginning Prayers," the Trisagion sequence opens almost every canonical service, morning rule, and domestic icon-corner devotion. Eastern church historians record that during violent earthquakes in Constantinople under Patriarch Proclus (434–446 AD), the people heard the angelic cry "Hagios ho Theos, Hagios Ischyros, Hagios Athanatos, eleison hemas" ("Holy God, Holy Mighty, Holy Immortal, have mercy on us"), which was solemnly chanted by the Fathers at the Fourth Ecumenical Council of Chalcedon in 451 AD.',
    liturgicalSeason: 'Daily Horologion · Opening of All Canonical Hours',
    score: {
      tuneName: 'BYZANTINE TRISAGION',
      meter: 'Byzantine Chant',
      defaultKey: 'G Mixolydian (Plagal IV)',
      availableKeys: ['F Mixolydian', 'G Mixolydian', 'A Mixolydian'],
      timeSignature: '4/4',
      tempoMarking: 'Solenne (♩ = 68)',
      arrangement: 'BYZANTINE_ISON',
      sopranoNotes: [
        { pitch: 'G4', lyric: 'Ha-', beat: 1 },
        { pitch: 'A4', lyric: 'gi-', beat: 2 },
        { pitch: 'B4', lyric: 'os', beat: 3 },
        { pitch: 'A4', lyric: 'ho', beat: 4 },
        { pitch: 'G4', lyric: 'The-', beat: 5 },
        { pitch: 'G4', lyric: 'os', beat: 6 },
      ],
      chordProgression: ['G5 (Ison)', 'Am/G', 'G5 (Ison)', 'F/G', 'G5'],
    },
  },
  {
    id: 'prayer-orthodox-phos-hilaron',
    kind: 'ORTHODOX_PRAYER',
    title: 'Phos Hilaron (O Gladsome Light)',
    originalTitle: 'Φῶς Ἱλαρόν',
    tradition: 'EASTERN_ORTHODOX',
    author: 'Pre-Nicene Christian Lamp-Lighting Hymn · Cited by St. Basil the Great (c. 375 AD)',
    year: '2nd Century AD',
    composer: 'Ancient Vespers Lampadarios Chant',
    scriptureRefs: ['John 1:4-9', 'John 8:12', 'Psalm 141:2'],
    originalLanguage: 'GREEK',
    originalStanzas: [
      'Φῶς ἱλαρὸν ἁγίας δόξης ἀθανάτου Πατρός,\nοὐρανίου, ἁγίου, μάκαρος, Ἰησοῦ Χριστέ,\nἐλθόντες ἐπὶ τὴν ἡλίου δύσιν, ἰδόντες φῶς ἑσπερινόν,\nὑμνοῦμεν Πατέρα, Υἱόν, καὶ ἅγιον Πνεῦμα, Θεόν.',
    ],
    stanzas: [
      'O Gladsome Light of the holy glory of the immortal Father,\nheavenly, holy, blessed Jesus Christ!\nNow that we have come to the setting of the sun\nand behold the light of evening,\nwe praise God: Father, Son, and Holy Spirit.',
      'For meet it is at all times to worship Thee with voices of praise,\nO Son of God and Giver of Life;\ntherefore all the world doth glorify Thee.',
    ],
    historyTitle: 'The Oldest Known Christian Hymn Outside the New Testament',
    historyEssay:
      'Phos Hilaron ("O Gladsome Light") is the oldest surviving liturgical Christian hymn not taken directly from Scripture. Already by 375 AD, St. Basil the Great wrote in De Spiritu Sancto (Chapter 29) that the hymn was of such venerable antiquity that no one knew its author, yet the people in every church sang it at the lighting of the evening lamps: "It seemed good to our fathers not to receive the gift of the evening light in silence, but to give thanks immediately upon its appearance."',
    liturgicalSeason: 'Great Vespers · Candlelight Evening Office',
  },
];

export const ALL_SACRED_HYMNS_AND_PRAYERS: SacredHymnOrPrayer[] = [
  ...PUBLIC_DOMAIN_HYMNS,
  ...CATHOLIC_AND_ORTHODOX_PRAYERS,
];

/**
 * Opens any Public-Domain Hymn or Catholic/Orthodox Prayer directly in Lorea's
 * Folio BookReader with Stanzas, Parallel Ancient/Modern Text, Historical
 * Provenance Essay, and Accompaniment Score Notes.
 */
export function openHymnOrPrayerInLorea(item: SacredHymnOrPrayer): void {
  const chapters: BookChapter[] = [
    {
      id: `${item.id}-stanzas`,
      title: `I · ${item.title}${item.originalTitle ? ` (${item.originalTitle})` : ''}`,
      content: [
        `${item.author} (${item.year})${item.composer ? ` · ${item.composer}` : ''}`,
        ...item.stanzas,
        ...(item.originalStanzas && item.originalStanzas.length > 0
          ? [
              '***',
              `Original ${item.originalLanguage ?? 'Liturgical'} Text:`,
              ...item.originalStanzas,
            ]
          : []),
      ].join('\n\n'),
    },
    {
      id: `${item.id}-history`,
      title: `II · History & Provenance — ${item.historyTitle}`,
      content: [
        item.historyEssay,
        `Scripture Cross-References: ${item.scriptureRefs.join(' · ')}`,
      ].join('\n\n'),
    },
  ];

  if (item.score) {
    chapters.push({
      id: `${item.id}-score`,
      title: `III · Accompaniment Score — ${item.score.tuneName} (${item.score.defaultKey})`,
      content: [
        `Tune: ${item.score.tuneName} · Meter: ${item.score.meter} · Time Signature: ${item.score.timeSignature} · Tempo: ${item.score.tempoMarking}`,
        `Available Transposition Keys: ${item.score.availableKeys.join(' · ')}`,
        `Harmonic Cadence Progression: ${item.score.chordProgression.join(' → ')}`,
        `Lead Voice Notes: ${item.score.sopranoNotes.map(n => `${n.lyric} (${n.pitch})`).join(' · ')}`,
      ].join('\n\n'),
    });
  }

  const album = {
    id: `lorea-sacred-${item.id}`,
    ownerId: 'plajah-sacred-archive',
    title: item.title,
    artist: item.author,
    coverImage: '',
    releaseYear: item.year,
    type: 'BOOK',
    genre: item.kind === 'PUBLIC_DOMAIN_HYMN' ? 'Sacred Hymnal' : 'Liturgical Prayer Treasury',
    description: item.historyEssay,
    tracks: [],
    bookChapters: chapters,
  } as unknown as Album;

  openAlbumInLorea(album);
}
