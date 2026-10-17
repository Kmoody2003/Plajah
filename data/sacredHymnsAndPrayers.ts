// data/sacredHymnsAndPrayers.ts
// Public-Domain Hymns, Gospel Songs, Worship Songs (with Historical Provenance & Accompaniment Scores),
// Catholic & Orthodox Liturgical Prayers, and Global Public-Domain Scores Bridge for Ambo, Lectio, Lorea, and Chora Studio.

import type { Album, BookChapter } from '../types';
import { openAlbumInLorea } from '../services/loreaOpen';
import type { Notation, NPitch, NElement, NMeasure, NStaff } from '../services/musicNotation';
import { REPERTOIRE, type RepertoireWork } from './repertoire';
import { REPERTOIRE_MEDIA, openScoreUrl, archiveItemUrl, type RepertoireMedia } from './repertoireScores';

export interface HymnAccompanimentScore {
  tuneName: string;
  meter: string;
  defaultKey: string;
  availableKeys: string[];
  timeSignature: string;
  tempoMarking: string;
  arrangement: 'SATB_HYMNAL' | 'ORGAN_CHORALE' | 'GOSPEL_PIANO_CHOIR' | 'BYZANTINE_ISON' | 'GREGORIAN_CHANT' | 'STRING_QUARTET';
  /** Concise soprano/alto/tenor/bass harmonic lead and pedal notes for score display */
  sopranoNotes: Array<{ pitch: string; lyric: string; beat: number }>;
  chordProgression: string[];
}

export interface SacredHymnOrPrayer {
  id: string;
  kind: 'PUBLIC_DOMAIN_HYMN' | 'PUBLIC_DOMAIN_GOSPEL' | 'CATHOLIC_PRAYER' | 'ORTHODOX_PRAYER';
  title: string;
  originalTitle?: string;
  tradition:
    | 'ECUMENICAL_HYMN'
    | 'GOSPEL_HYMNODY'
    | 'AFRICAN_AMERICAN_SPIRITUAL'
    | 'CATHOLIC'
    | 'EASTERN_ORTHODOX'
    | 'CELTIC_MONASTIC'
    | 'PATRISTIC';
  author: string;
  year: string;
  composer?: string;
  scriptureRefs: string[];
  stanzas: string[];
  refrain?: string;
  originalLanguage?: 'LATIN' | 'GREEK' | 'OLD_IRISH' | 'CHURCH_SLAVONIC' | 'SYRIAC' | 'GERMAN';
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
  {
    id: 'pd-hymn-great-is-thy-faithfulness',
    kind: 'PUBLIC_DOMAIN_HYMN',
    title: 'Great Is Thy Faithfulness',
    tradition: 'ECUMENICAL_HYMN',
    author: 'Thomas Obadiah Chisholm (1866–1960)',
    year: '1923 (Public Domain)',
    composer: 'William Marion Runyan (1870–1957 · Tune: FAITHFULNESS)',
    scriptureRefs: ['Lamentations 3:22-23', 'James 1:17', 'Malachi 3:6', 'Psalm 89:1-2'],
    refrain:
      'Great is Thy faithfulness! Great is Thy faithfulness!\nMorning by morning new mercies I see;\nAll I have needed Thy hand hath provided,\nGreat is Thy faithfulness, Lord, unto me!',
    stanzas: [
      'Great is Thy faithfulness, O God my Father,\nThere is no shadow of turning with Thee;\nThou changest not, Thy compassions, they fail not;\nAs Thou hast been Thou forever wilt be.',
      'Summer and winter, and springtime and harvest,\nSun, moon and stars in their courses above,\nJoin with all nature in manifold witness\nTo Thy great faithfulness, mercy and love.',
      'Pardon for sin and a peace that endureth,\nThine own dear presence to cheer and to guide;\nStrength for today and bright hope for tomorrow,\nBlessings all mine, with ten thousand beside!',
    ],
    historyTitle: 'Ordinary Morning Mercies in Vineland, New Jersey & Baldwin Baker University (1923)',
    historyEssay:
      'Unlike hymns born out of shipwrecks or cataclysms, Thomas Obadiah Chisholm wrote Great Is Thy Faithfulness in 1923 in Vineland, New Jersey as a quiet testimony to God’s daily, unfailing covenant faithfulness in ordinary life, meditating on Lamentations 3:22–23 ("His compassions fail not. They are new every morning"). He mailed the poem to his friend William Marion Runyan in Baldwin, Kansas, who prayed earnestly that the tune might match the majesty of the text and composed the harmonic setting FAITHFULNESS that same year.',
    liturgicalSeason: 'Morning Prayer · Covenant Faithfulness · Thanksgiving',
    score: {
      tuneName: 'FAITHFULNESS',
      meter: '11.10.11.10 with Refrain',
      defaultKey: 'D Major',
      availableKeys: ['C Major', 'D Major', 'Eb Major', 'E Major'],
      timeSignature: '3/4',
      tempoMarking: 'Moderato Maestoso (♩ = 88)',
      arrangement: 'SATB_HYMNAL',
      sopranoNotes: [
        { pitch: 'F#4', lyric: 'Great', beat: 1 },
        { pitch: 'F#4', lyric: 'is', beat: 2 },
        { pitch: 'F#4', lyric: 'Thy', beat: 3 },
        { pitch: 'G4', lyric: 'faith-', beat: 4 },
        { pitch: 'F#4', lyric: 'ful-', beat: 5 },
        { pitch: 'E4', lyric: 'ness,', beat: 6 },
        { pitch: 'A4', lyric: 'O', beat: 7 },
        { pitch: 'A4', lyric: 'God', beat: 8 },
        { pitch: 'G4', lyric: 'my', beat: 9 },
        { pitch: 'F#4', lyric: 'Fa-', beat: 10 },
        { pitch: 'E4', lyric: 'ther', beat: 11 },
      ],
      chordProgression: ['D', 'G6/D', 'A7/C#', 'D', 'B7', 'Em', 'E7', 'Asus4', 'A7', 'D'],
    },
  },
  {
    id: 'pd-hymn-joyful-joyful',
    kind: 'PUBLIC_DOMAIN_HYMN',
    title: 'Joyful, Joyful, We Adore Thee',
    tradition: 'ECUMENICAL_HYMN',
    author: 'Henry van Dyke (1852–1933)',
    year: '1907 / Tune 1824',
    composer: 'Ludwig van Beethoven, Symphony No. 9 (Arr. Edward Hodges, 1846 · Tune: HYMN TO JOY)',
    scriptureRefs: ['Psalm 19:1-6', '1 John 1:5', 'Isaiah 61:3', 'Philippians 4:4'],
    stanzas: [
      'Joyful, joyful, we adore Thee,\nGod of glory, Lord of love;\nHearts unfold like flow’rs before Thee,\nOp’ning to the sun above.\nMelt the clouds of sin and sadness;\nDrive the dark of doubt away;\nGiver of immortal gladness,\nFill us with the light of day!',
      'All Thy works with joy surround Thee,\nEarth and heav’n reflect Thy rays,\nStars and angels sing around Thee,\nCenter of unbroken praise.\nField and forest, vale and mountain,\nFlow’ry meadow, flashing sea,\nSinging bird and flowing fountain\nCall us to rejoice in Thee.',
      'Mortals, join the happy chorus,\nWhich the morning stars began;\nFather love is reigning o’er us,\nBrother love binds man to man.\nEver singing, march we onward,\nVictors in the midst of strife,\nJoyful music leads us Sunward\nIn the triumph song of life.',
    ],
    historyTitle: 'Written in the Berkshire Mountains for Beethoven’s Ninth Symphony Theme (1907)',
    historyEssay:
      'In 1907, Princeton literature professor and Presbyterian minister Henry van Dyke was serving as guest preacher at Williams College in Williamstown, Massachusetts. Inspired by the Berkshire Mountains at sunrise, he handed the manuscript to College President Harry Augustus Garfield at the breakfast table with the note: "Here is a hymn for you. Your mountains were my inspiration. It must be sung to the music of Beethoven’s Ode to Joy."',
    liturgicalSeason: 'Festival Worship · Processional · Creation Praise',
    score: {
      tuneName: 'HYMN TO JOY (ODE TO JOY)',
      meter: '8.7.8.7.D',
      defaultKey: 'G Major',
      availableKeys: ['F Major', 'G Major', 'A Major'],
      timeSignature: '4/4',
      tempoMarking: 'Allegro Maestoso (♩ = 108)',
      arrangement: 'ORGAN_CHORALE',
      sopranoNotes: [
        { pitch: 'B4', lyric: 'Joy-', beat: 1 },
        { pitch: 'B4', lyric: 'ful,', beat: 2 },
        { pitch: 'C5', lyric: 'joy-', beat: 3 },
        { pitch: 'D5', lyric: 'ful,', beat: 4 },
        { pitch: 'D5', lyric: 'we', beat: 5 },
        { pitch: 'C5', lyric: 'a-', beat: 6 },
        { pitch: 'B4', lyric: 'dore', beat: 7 },
        { pitch: 'A4', lyric: 'Thee,', beat: 8 },
        { pitch: 'G4', lyric: 'God', beat: 9 },
        { pitch: 'G4', lyric: 'of', beat: 10 },
        { pitch: 'A4', lyric: 'glo-', beat: 11 },
        { pitch: 'B4', lyric: 'ry,', beat: 12 },
      ],
      chordProgression: ['G', 'D7/F#', 'Em', 'D', 'G', 'C', 'G/D', 'D7', 'G'],
    },
  },
  {
    id: 'pd-hymn-mighty-fortress',
    kind: 'PUBLIC_DOMAIN_HYMN',
    title: 'A Mighty Fortress Is Our God',
    originalTitle: 'Ein feste Burg ist unser Gott',
    tradition: 'ECUMENICAL_HYMN',
    author: 'Martin Luther (1483–1546) · Trans. Frederick H. Hedge (1852)',
    year: '1529',
    composer: 'Martin Luther (Tune: EIN FESTE BURG)',
    scriptureRefs: ['Psalm 46:1-11', 'Ephesians 6:10-17', 'Revelation 12:9-11'],
    originalLanguage: 'GERMAN',
    originalStanzas: [
      'Ein feste Burg ist unser Gott,\nein gute Wehr und Waffen.\nEr hilft uns frei aus aller Not,\ndie uns jetzt hat betroffen.',
    ],
    stanzas: [
      'A mighty fortress is our God, a bulwark never failing;\nOur helper He, amid the flood of mortal ills prevailing:\nFor still our ancient foe doth seek to work us woe;\nHis craft and pow’r are great, and, armed with cruel hate,\nOn earth is not his equal.',
      'Did we in our own strength confide, our striving would be losing,\nWere not the right Man on our side, the Man of God’s own choosing:\nDost ask who that may be? Christ Jesus, it is He;\nLord Sabaoth, His Name, from age to age the same,\nAnd He must win the battle.',
      'And though this world, with devils filled, should threaten to undo us,\nWe will not fear, for God hath willed His truth to triumph through us:\nThe Prince of Darkness grim, we tremble not for him;\nHis rage we can endure, for lo, his doom is sure,\nOne little word shall fell him.',
      'That word above all earthly pow’rs, no thanks to them, abideth;\nThe Spirit and the gifts are ours through Him Who with us sideth:\nLet goods and kindred go, this mortal life also;\nThe body they may kill: God’s truth abideth still,\nHis kingdom is forever.',
    ],
    historyTitle: 'Martin Luther’s Metrical Paraphrase of Psalm 46 at Wittenberg (1529)',
    historyEssay:
      'Composed words and melody by Martin Luther between 1527 and 1529 as a bold congregational paraphrase of Psalm 46 ("God is our refuge and strength, a very present help in trouble"), Ein feste Burg ist unser Gott was later woven by Johann Sebastian Bach into his Cantata BWV 80 and by Felix Mendelssohn into the finale of his Reformation Symphony (Op. 107).',
    liturgicalSeason: 'Reformation · Spiritual Warfare · Psalm 46',
    score: {
      tuneName: 'EIN FESTE BURG',
      meter: '8.7.8.7.6.6.6.6.7',
      defaultKey: 'C Major',
      availableKeys: ['Bb Major', 'C Major', 'D Major'],
      timeSignature: '4/4',
      tempoMarking: 'Maestoso Energico (♩ = 90)',
      arrangement: 'ORGAN_CHORALE',
      sopranoNotes: [
        { pitch: 'C5', lyric: 'A', beat: 1 },
        { pitch: 'C5', lyric: 'migh-', beat: 2 },
        { pitch: 'C5', lyric: 'ty', beat: 3 },
        { pitch: 'G4', lyric: 'for-', beat: 4 },
        { pitch: 'A4', lyric: 'tress', beat: 5 },
        { pitch: 'B4', lyric: 'is', beat: 6 },
        { pitch: 'C5', lyric: 'our', beat: 7 },
        { pitch: 'A4', lyric: 'God,', beat: 8 },
      ],
      chordProgression: ['C', 'G/B', 'Am', 'Em', 'F', 'Dm7', 'G7', 'C'],
    },
  },
];

export const PUBLIC_DOMAIN_GOSPEL_SONGS: SacredHymnOrPrayer[] = [
  {
    id: 'pd-gospel-his-eye-is-on-the-sparrow',
    kind: 'PUBLIC_DOMAIN_GOSPEL',
    title: 'His Eye Is on the Sparrow',
    tradition: 'GOSPEL_HYMNODY',
    author: 'Civilla Durfee Martin (1866–1948)',
    year: '1905',
    composer: 'Charles Hutchinson Gabriel (1856–1932 · Tune: SPARROW)',
    scriptureRefs: ['Matthew 10:29-31', 'Luke 12:6-7', 'Psalm 55:22', '1 Peter 5:7'],
    refrain:
      'I sing because I’m happy,\nI sing because I’m free,\nFor His eye is on the sparrow,\nAnd I know He watches me.',
    stanzas: [
      'Why should I feel discouraged, why should the shadows come,\nWhy should my heart be lonely, and long for heav’n and home,\nWhen Jesus is my portion? My constant Friend is He:\nHis eye is on the sparrow, and I know He watches me;\nHis eye is on the sparrow, and I know He watches me.',
      '“Let not your heart be troubled,” His tender word I hear,\nAnd resting on His goodness, I lose my doubts and fears;\nThough by the path He leadeth, but one step I may see;\nHis eye is on the sparrow, and I know He watches me;\nHis eye is on the sparrow, and I know He watches me.',
      'Whenever I am tempted, whenever clouds arise,\nWhen songs give place to sighing, when hope within me dies,\nI draw the closer to Him, from care He sets me free;\nHis eye is on the sparrow, and I know He watches me;\nHis eye is on the sparrow, and I know He watches me.',
    ],
    historyTitle: 'The Bedridden Couple in Elmira, New York & A Classic of Gospel Choir Literature (1905)',
    historyEssay:
      'In Spring 1905 in Elmira, New York, poet Civilla Durfee Martin visited Mr. and Mrs. Doolittle—a couple who had been bedridden and wheelchair-bound for over twenty years yet radiated contagious joy. When Martin asked their secret, Mrs. Doolittle replied simply: "His eye is on the sparrow, and I know He watches me." Set to music by gospel composer Charles H. Gabriel and immortalized by Ethel Waters and Mahalia Jackson, it became a cornerstone of the Gospel and sanctuary choir repertoire.',
    liturgicalSeason: 'Providence · Assurance · Gospel Solo & Choir',
    score: {
      tuneName: 'SPARROW',
      meter: 'Irregular with Gospel Refrain',
      defaultKey: 'C Major',
      availableKeys: ['Bb Major', 'C Major', 'Db Major', 'Eb Major', 'F Major'],
      timeSignature: '6/8',
      tempoMarking: 'Andante Espressivo Gospel (♩. = 56)',
      arrangement: 'GOSPEL_PIANO_CHOIR',
      sopranoNotes: [
        { pitch: 'E4', lyric: 'I', beat: 1 },
        { pitch: 'G4', lyric: 'sing', beat: 2 },
        { pitch: 'A4', lyric: 'be-', beat: 3 },
        { pitch: 'G4', lyric: 'cause', beat: 4 },
        { pitch: 'C5', lyric: 'I’m', beat: 5 },
        { pitch: 'E5', lyric: 'hap-', beat: 6 },
        { pitch: 'D5', lyric: 'py,', beat: 7 },
        { pitch: 'C5', lyric: 'I', beat: 8 },
        { pitch: 'A4', lyric: 'sing', beat: 9 },
        { pitch: 'C5', lyric: 'be-', beat: 10 },
        { pitch: 'G4', lyric: 'cause', beat: 11 },
        { pitch: 'E4', lyric: 'I’m', beat: 12 },
        { pitch: 'G4', lyric: 'free', beat: 13 },
      ],
      chordProgression: ['C', 'Fmaj7/C', 'C', 'A7', 'Dm7', 'G7', 'C/E', 'F', 'C/G', 'G7', 'C'],
    },
  },
  {
    id: 'pd-gospel-blessed-assurance',
    kind: 'PUBLIC_DOMAIN_GOSPEL',
    title: 'Blessed Assurance, Jesus Is Mine',
    tradition: 'GOSPEL_HYMNODY',
    author: 'Fanny Jane Crosby (1820–1915)',
    year: '1873',
    composer: 'Phoebe Palmer Knapp (1839–1908 · Tune: ASSURANCE)',
    scriptureRefs: ['Hebrews 10:22', 'Romans 8:16-17', 'Ephesians 1:13-14', '1 John 5:13'],
    refrain:
      'This is my story, this is my song,\nPraising my Savior all the day long;\nThis is my story, this is my song,\nPraising my Savior all the day long.',
    stanzas: [
      'Blessed assurance, Jesus is mine!\nOh, what a foretaste of glory divine!\nHeir of salvation, purchase of God,\nBorn of His Spirit, washed in His blood.',
      'Perfect submission, perfect delight,\nVisions of rapture now burst on my sight;\nAngels, descending, bring from above\nEchoes of mercy, whispers of love.',
      'Perfect submission, all is at rest,\nI in my Savior am happy and blest,\nWatching and waiting, looking above,\nFilled with His goodness, lost in His love.',
    ],
    historyTitle: 'Phoebe Palmer Knapp’s Parlor Piano & Fanny Crosby’s Instant Response (1873)',
    historyEssay:
      'In 1873, composer Phoebe Palmer Knapp—daughter of holiness evangelist Phoebe Palmer and wife of Metropolitan Life Insurance founder Joseph Fairchild Knapp—played a new 9/8 melody for her blind friend Fanny J. Crosby in New York and asked, "Fanny, what does this tune say to you?" Without hesitation, Crosby clasped her hands and exclaimed, "Why, Phoebe, that says: Blessed assurance, Jesus is mine!" Within minutes she dictated all three stanzas and the refrain.',
    liturgicalSeason: 'Assurance of Salvation · Testimony · Altar Praise',
    score: {
      tuneName: 'ASSURANCE',
      meter: '9.10.9.9 with Refrain',
      defaultKey: 'D Major',
      availableKeys: ['C Major', 'Db Major', 'D Major', 'Eb Major'],
      timeSignature: '9/8',
      tempoMarking: 'Lilting Gospel Waltz (♩. = 62)',
      arrangement: 'GOSPEL_PIANO_CHOIR',
      sopranoNotes: [
        { pitch: 'F#4', lyric: 'Bles-', beat: 1 },
        { pitch: 'E4', lyric: 'sed', beat: 2 },
        { pitch: 'D4', lyric: 'as-', beat: 3 },
        { pitch: 'A4', lyric: 'sur-', beat: 4 },
        { pitch: 'A4', lyric: 'ance,', beat: 5 },
        { pitch: 'G4', lyric: 'Je-', beat: 6 },
        { pitch: 'A4', lyric: 'sus', beat: 7 },
        { pitch: 'B4', lyric: 'is', beat: 8 },
        { pitch: 'A4', lyric: 'mine!', beat: 9 },
      ],
      chordProgression: ['D', 'G/D', 'D', 'Bm7', 'E7', 'A7', 'D', 'G', 'D/A', 'A7', 'D'],
    },
  },
  {
    id: 'pd-gospel-pass-me-not',
    kind: 'PUBLIC_DOMAIN_GOSPEL',
    title: 'Pass Me Not, O Gentle Savior',
    tradition: 'GOSPEL_HYMNODY',
    author: 'Fanny Jane Crosby (1820–1915)',
    year: '1868',
    composer: 'William Howard Doane (1832–1915 · Tune: PASS ME NOT)',
    scriptureRefs: ['Mark 10:46-52', 'Luke 18:35-43', 'Psalm 51:1-2', 'Hebrews 4:16'],
    refrain:
      'Savior, Savior, hear my humble cry;\nWhile on others Thou art calling,\nDo not pass me by.',
    stanzas: [
      'Pass me not, O gentle Savior,\nHear my humble cry;\nWhile on others Thou art calling,\nDo not pass me by.',
      'Let me at a throne of mercy\nFind a sweet relief,\nKneeling there in deep contrition;\nHelp my unbelief.',
      'Trusting only in Thy merit,\nWould I seek Thy face;\nHeal my wounded, broken spirit,\nSave me by Thy grace.',
      'Thou the Spring of all my comfort,\nMore than life to me,\nWhom have I on earth beside Thee?\nWhom in Heav’n but Thee?',
    ],
    historyTitle: 'A Prisoner’s Cry at the Manhattan City Prison in Spring 1868',
    historyEssay:
      'After speaking and singing at a chapel service inside the Manhattan City Prison in Spring 1868, Fanny Crosby heard a prisoner cry out from his cell in tears, "Good Lord, do not pass me by!" That evening she wrote the poem echoing blind Bartimaeus on the road out of Jericho (Mark 10:47), and William Howard Doane composed its soulful, pleading refrain—making it Fanny Crosby’s first worldwide gospel hymn.',
    liturgicalSeason: 'Altar Call · Intercession · Healing Service',
    score: {
      tuneName: 'PASS ME NOT',
      meter: '8.5.8.5 with Refrain',
      defaultKey: 'Ab Major',
      availableKeys: ['F Major', 'G Major', 'Ab Major', 'Bb Major'],
      timeSignature: '4/4',
      tempoMarking: 'Adagio Devoto (♩ = 68)',
      arrangement: 'GOSPEL_PIANO_CHOIR',
      sopranoNotes: [
        { pitch: 'C5', lyric: 'Sa-', beat: 1 },
        { pitch: 'Bb4', lyric: 'vior,', beat: 2 },
        { pitch: 'Ab4', lyric: 'Sa-', beat: 3 },
        { pitch: 'F4', lyric: 'vior,', beat: 4 },
        { pitch: 'Eb4', lyric: 'hear', beat: 5 },
        { pitch: 'F4', lyric: 'my', beat: 6 },
        { pitch: 'Ab4', lyric: 'hum-', beat: 7 },
        { pitch: 'Bb4', lyric: 'ble', beat: 8 },
        { pitch: 'C5', lyric: 'cry;', beat: 9 },
      ],
      chordProgression: ['Ab', 'Db/Ab', 'Ab', 'Fm7', 'Bbm7', 'Eb7', 'Ab'],
    },
  },
  {
    id: 'pd-gospel-leaning-on-everlasting-arms',
    kind: 'PUBLIC_DOMAIN_GOSPEL',
    title: 'Leaning on the Everlasting Arms',
    tradition: 'GOSPEL_HYMNODY',
    author: 'Elisha Albright Hoffman (1839–1929)',
    year: '1887',
    composer: 'Anthony Johnson Showalter (1858–1924 · Tune: SHOWALTER)',
    scriptureRefs: ['Deuteronomy 33:27', 'Proverbs 3:5-6', '1 John 1:7'],
    refrain:
      'Leaning, leaning, safe and secure from all alarms;\nLeaning, leaning, leaning on the everlasting arms.',
    stanzas: [
      'What a fellowship, what a joy divine,\nLeaning on the everlasting arms;\nWhat a blessedness, what a peace is mine,\nLeaning on the everlasting arms.',
      'O how sweet to walk in this pilgrim way,\nLeaning on the everlasting arms;\nO how bright the path grows from day to day,\nLeaning on the everlasting arms.',
      'What have I to dread, what have I to fear,\nLeaning on the everlasting arms?\nI have blessed peace with my Lord so near,\nLeaning on the everlasting arms.',
    ],
    historyTitle: 'Born from Two Bereaved Letters in Hartselle, Alabama (1887)',
    historyEssay:
      'While conducting a singing school in Hartselle, Alabama in 1887, music publisher Anthony J. Showalter received letters on the same afternoon from two former pupils whose wives had both died suddenly. Writing back to console them with Deuteronomy 33:27 ("The eternal God is thy refuge, and underneath are the everlasting arms"), Showalter composed the call-and-response chorus first and asked Presbyterian pastor Elisha Hoffman in Ohio to supply the three verses.',
    liturgicalSeason: 'Fellowship · Congregational Call & Response · Comfort',
    score: {
      tuneName: 'SHOWALTER',
      meter: '10.9.10.9 with Refrain',
      defaultKey: 'A Major',
      availableKeys: ['G Major', 'Ab Major', 'A Major', 'Bb Major'],
      timeSignature: '4/4',
      tempoMarking: 'Joyful Gospel March (♩ = 100)',
      arrangement: 'GOSPEL_PIANO_CHOIR',
      sopranoNotes: [
        { pitch: 'C#5', lyric: 'What', beat: 1 },
        { pitch: 'B4', lyric: 'a', beat: 2 },
        { pitch: 'A4', lyric: 'fel-', beat: 3 },
        { pitch: 'B4', lyric: 'low-', beat: 4 },
        { pitch: 'C#5', lyric: 'ship,', beat: 5 },
        { pitch: 'D5', lyric: 'what', beat: 6 },
        { pitch: 'B4', lyric: 'a', beat: 7 },
        { pitch: 'F#4', lyric: 'joy', beat: 8 },
        { pitch: 'A4', lyric: 'di-', beat: 9 },
        { pitch: 'G#4', lyric: 'vine,', beat: 10 },
      ],
      chordProgression: ['A', 'D', 'A', 'E7', 'A', 'D', 'A/E', 'E7', 'A'],
    },
  },
  {
    id: 'pd-gospel-swing-low-sweet-chariot',
    kind: 'PUBLIC_DOMAIN_GOSPEL',
    title: 'Swing Low, Sweet Chariot',
    tradition: 'AFRICAN_AMERICAN_SPIRITUAL',
    author: 'Wallace Willis (Choctaw Freedmen Spiritual, c. 1862)',
    year: 'c. 1862 / Published 1872',
    composer: 'Arr. Fisk Jubilee Singers & Frederick J. Work (1872 / 1907)',
    scriptureRefs: ['2 Kings 2:11', 'Psalm 68:17', 'John 14:2-3', 'Hebrews 11:13-16'],
    refrain:
      'Swing low, sweet chariot,\nComing for to carry me home,\nSwing low, sweet chariot,\nComing for to carry me home.',
    stanzas: [
      'I looked over Jordan, and what did I see,\nComing for to carry me home?\nA band of angels coming after me,\nComing for to carry me home.',
      'If you get there before I do,\nComing for to carry me home,\nTell all my friends I’m coming too,\nComing for to carry me home.',
      'I’m sometimes up and sometimes down,\nComing for to carry me home,\nBut still my soul feels heavenly bound,\nComing for to carry me home.',
    ],
    historyTitle: 'Wallace Willis on the Red River & The Fisk Jubilee Singers’ World Tour (1871)',
    historyEssay:
      'Composed prior to 1862 by Wallace Willis, a Choctaw freedman in Indian Territory (near present-day Hugo, Oklahoma), inspired by the Red River and the prophet Elijah’s ascent to heaven by a chariot of fire in 2 Kings 2:11. Transcribed by minister Alexander Reid at the Old Spencer Academy and shared with the Fisk Jubilee Singers of Nashville, Tennessee, it became a treasured spiritual across the globe during their 1871–1873 tour of the United States and Europe.',
    liturgicalSeason: 'Homegoing · Hope · African American Spiritual Heritage',
    score: {
      tuneName: 'SWING LOW',
      meter: 'Call-and-Response Spiritual',
      defaultKey: 'F Major',
      availableKeys: ['Eb Major', 'F Major', 'G Major', 'Ab Major'],
      timeSignature: '4/4',
      tempoMarking: 'Soulful Andante (♩ = 72)',
      arrangement: 'SATB_HYMNAL',
      sopranoNotes: [
        { pitch: 'A4', lyric: 'Swing', beat: 1 },
        { pitch: 'F4', lyric: 'low,', beat: 2 },
        { pitch: 'A4', lyric: 'sweet', beat: 3 },
        { pitch: 'F4', lyric: 'cha-', beat: 4 },
        { pitch: 'F4', lyric: 'ri-', beat: 5 },
        { pitch: 'D4', lyric: 'ot,', beat: 6 },
        { pitch: 'C4', lyric: 'Co-', beat: 7 },
        { pitch: 'F4', lyric: 'ming', beat: 8 },
        { pitch: 'F4', lyric: 'for', beat: 9 },
        { pitch: 'F4', lyric: 'to', beat: 10 },
        { pitch: 'G4', lyric: 'car-', beat: 11 },
        { pitch: 'A4', lyric: 'ry', beat: 12 },
        { pitch: 'A4', lyric: 'me', beat: 13 },
        { pitch: 'G4', lyric: 'home,', beat: 14 },
      ],
      chordProgression: ['F', 'Bb/F', 'F', 'Dm7', 'Gm7', 'C7', 'F'],
    },
  },
  {
    id: 'pd-gospel-go-tell-it-on-the-mountain',
    kind: 'PUBLIC_DOMAIN_GOSPEL',
    title: 'Go Tell It on the Mountain',
    tradition: 'AFRICAN_AMERICAN_SPIRITUAL',
    author: 'African American Spiritual · Collected & Adapted by John Wesley Work Jr. (1871–1925)',
    year: 'c. 1865 / Published 1907',
    composer: 'Traditional Jubilee Spiritual (Arr. John W. Work Jr., 1907 · Tune: GO TELL IT)',
    scriptureRefs: ['Isaiah 40:9', 'Isaiah 52:7', 'Luke 2:8-20'],
    refrain:
      'Go, tell it on the mountain,\nOver the hills and everywhere;\nGo, tell it on the mountain,\nThat Jesus Christ is born!',
    stanzas: [
      'While shepherds kept their watching\nO’er silent flocks by night,\nBehold throughout the heavens\nThere shone a holy light.',
      'The shepherds feared and trembled\nWhen lo! above the earth\nRang out the angel chorus\nThat hailed our Savior’s birth.',
      'Down in a lowly manger\nThe humble Christ was born,\nAnd God sent us salvation\nThat blessed Christmas morn.',
    ],
    historyTitle: 'John Wesley Work Jr. & The Preservation of Jubilee Spirituals at Fisk University (1907)',
    historyEssay:
      'Sung by African American congregations since at least 1865, Go Tell It on the Mountain was collected, harmonized, and published in 1907 by Latin and history professor John Wesley Work Jr. at Fisk University in Folk Songs of the American Negro. Wedding the prophetic proclamation of Isaiah 40:9 ("Get thee up into the high mountain") with the Lucan Nativity narrative, it stands as one of the world’s beloved Advent, Christmas, and evangelistic gospel anthems.',
    liturgicalSeason: 'Advent · Nativity · Evangelism',
    score: {
      tuneName: 'GO TELL IT',
      meter: '7.6.7.6 with Refrain',
      defaultKey: 'F Major',
      availableKeys: ['Eb Major', 'F Major', 'G Major'],
      timeSignature: '4/4',
      tempoMarking: 'Giocoso Swing (♩ = 104)',
      arrangement: 'GOSPEL_PIANO_CHOIR',
      sopranoNotes: [
        { pitch: 'A4', lyric: 'Go,', beat: 1 },
        { pitch: 'A4', lyric: 'tell', beat: 2 },
        { pitch: 'G4', lyric: 'it', beat: 3 },
        { pitch: 'F4', lyric: 'on', beat: 4 },
        { pitch: 'D4', lyric: 'the', beat: 5 },
        { pitch: 'C4', lyric: 'moun-', beat: 6 },
        { pitch: 'F4', lyric: 'tain,', beat: 7 },
      ],
      chordProgression: ['F', 'C7', 'Dm7', 'G7', 'C7', 'F', 'Bb', 'F/C', 'C7', 'F'],
    },
  },
  {
    id: 'pd-gospel-stand-by-me',
    kind: 'PUBLIC_DOMAIN_GOSPEL',
    title: 'Stand by Me (When the Storms of Life Are Raging)',
    tradition: 'GOSPEL_HYMNODY',
    author: 'Rev. Charles Albert Tindley (1851–1933)',
    year: '1905',
    composer: 'Charles Albert Tindley (Arr. F. A. Clark, 1905 · Tune: STAND BY ME)',
    scriptureRefs: ['Psalm 46:1-3', 'Mark 4:37-39', '2 Timothy 4:17', '1 Corinthians 10:13'],
    stanzas: [
      'When the storms of life are raging, stand by me;\nWhen the storms of life are raging, stand by me;\nWhen the world is tossing me, like a ship upon the sea,\nThou Who rulest wind and water, stand by me.',
      'In the midst of tribulations, stand by me;\nIn the midst of tribulations, stand by me;\nWhen the hosts of hell assail, and my strength begins to fail,\nThou Who never lost a battle, stand by me.',
      'In the midst of faults and failures, stand by me;\nIn the midst of faults and failures, stand by me;\nWhen I’ve done the best I can, and my friends don’t understand,\nThou Who knowest all about me, stand by me.',
      'When I’m growing old and feeble, stand by me;\nWhen I’m growing old and feeble, stand by me;\nWhen my life becomes a burden, and I’m nearing chilly Jordan,\nO Thou Lily of the Valley, stand by me.',
    ],
    historyTitle: 'Rev. Charles Albert Tindley — Father of American Gospel Music in Philadelphia (1905)',
    historyEssay:
      'Born in Berlin, Maryland to an enslaved father and free mother, Charles Albert Tindley taught himself to read using scraps of newspaper and walked fourteen miles to church before becoming pastor of the 10,000-member East Calvary Methodist Episcopal Church (now Tindley Temple) in Philadelphia. Published in Soul Echoes No. 2 (1905), Stand by Me pioneered the pentatonic melody, space for vocal improvisation, and harmonic cadence that directly birthed 20th-century Gospel music (and later inspired Thomas A. Dorsey and Ben E. King).',
    liturgicalSeason: 'Prayer & Intercession · Perseverance · Gospel Devotional',
    score: {
      tuneName: 'STAND BY ME (TINDLEY)',
      meter: '10.10.14.10',
      defaultKey: 'F Major',
      availableKeys: ['Eb Major', 'F Major', 'G Major', 'Ab Major'],
      timeSignature: '3/4',
      tempoMarking: 'Grave & Soulful (♩ = 66)',
      arrangement: 'GOSPEL_PIANO_CHOIR',
      sopranoNotes: [
        { pitch: 'F4', lyric: 'When', beat: 1 },
        { pitch: 'G4', lyric: 'the', beat: 2 },
        { pitch: 'A4', lyric: 'storms', beat: 3 },
        { pitch: 'A4', lyric: 'of', beat: 4 },
        { pitch: 'C5', lyric: 'life', beat: 5 },
        { pitch: 'A4', lyric: 'are', beat: 6 },
        { pitch: 'G4', lyric: 'ra-', beat: 7 },
        { pitch: 'F4', lyric: 'ging,', beat: 8 },
        { pitch: 'G4', lyric: 'stand', beat: 9 },
        { pitch: 'F4', lyric: 'by', beat: 10 },
        { pitch: 'F4', lyric: 'me;', beat: 11 },
      ],
      chordProgression: ['F', 'Bb/F', 'F', 'Dm7', 'Gm7', 'C7', 'F', 'F7', 'Bb', 'Bdim7', 'F/C', 'C7', 'F'],
    },
  },
  {
    id: 'pd-gospel-nothing-but-the-blood',
    kind: 'PUBLIC_DOMAIN_GOSPEL',
    title: 'Nothing But the Blood of Jesus',
    tradition: 'GOSPEL_HYMNODY',
    author: 'Rev. Robert Lowry (1826–1899)',
    year: '1876',
    composer: 'Robert Lowry (Tune: PLAINFIELD)',
    scriptureRefs: ['Hebrews 9:22', '1 John 1:7', 'Ephesians 1:7', 'Revelation 1:5'],
    refrain:
      'Oh! precious is the flow\nThat makes me white as snow;\nNo other fount I know,\nNothing but the blood of Jesus.',
    stanzas: [
      'What can wash away my sin?\nNothing but the blood of Jesus;\nWhat can make me whole again?\nNothing but the blood of Jesus.',
      'For my pardon, this I see,\nNothing but the blood of Jesus;\nFor my cleansing this my plea,\nNothing but the blood of Jesus.',
      'Nothing can for sin atone,\nNothing but the blood of Jesus;\nNaught of good that I have done,\nNothing but the blood of Jesus.',
      'This is all my hope and peace,\nNothing but the blood of Jesus;\nThis is all my righteousness,\nNothing but the blood of Jesus.',
    ],
    historyTitle: 'Sung First at the Ocean Grove Camp Meeting in New Jersey (1876)',
    historyEssay:
      'Written and composed by Baptist minister and Bucknell University rhetoric professor Robert Lowry in Plainfield, New Jersey, and introduced at the Ocean Grove Camp Meeting in 1876. Its catechism-style call ("What can wash away my sin?") and congregation response ("Nothing but the blood of Jesus") made it an enduring favorite for Communion Sundays and Gospel praise sets.',
    liturgicalSeason: 'Holy Communion · Good Friday · Atonement',
    score: {
      tuneName: 'PLAINFIELD',
      meter: '7.8.7.8 with Refrain',
      defaultKey: 'G Major',
      availableKeys: ['F Major', 'G Major', 'Ab Major', 'A Major'],
      timeSignature: '4/4',
      tempoMarking: 'Moderato Marcato (♩ = 92)',
      arrangement: 'GOSPEL_PIANO_CHOIR',
      sopranoNotes: [
        { pitch: 'G4', lyric: 'What', beat: 1 },
        { pitch: 'G4', lyric: 'can', beat: 2 },
        { pitch: 'G4', lyric: 'wash', beat: 3 },
        { pitch: 'A4', lyric: 'a-', beat: 4 },
        { pitch: 'B4', lyric: 'way', beat: 5 },
        { pitch: 'A4', lyric: 'my', beat: 6 },
        { pitch: 'G4', lyric: 'sin?', beat: 7 },
      ],
      chordProgression: ['G', 'Em7', 'Am7', 'D7', 'G', 'C/G', 'G', 'D7', 'G'],
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
  ...PUBLIC_DOMAIN_GOSPEL_SONGS,
  ...CATHOLIC_AND_ORTHODOX_PRAYERS,
];

// ─── Pitch & Engraved SheetMusic Notation Builder ─────────────────────────────

const STEP_SEMITONE: Record<string, number> = {
  C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11,
};

const KEY_FIFTHS_MAP: Record<string, number> = {
  'C': 0, 'G': 1, 'D': 2, 'A': 3, 'E': 4, 'B': 5,
  'F': -1, 'Bb': -2, 'Eb': -3, 'Ab': -4, 'Db': -5,
};

function parsePitchString(pitchStr: string, semitoneOffset = 0): NPitch {
  const m = /^([A-G])(#|b)?(\d)$/.exec(pitchStr.trim());
  const baseStep = m ? m[1] : 'D';
  const acc = m?.[2] === '#' ? 1 : m?.[2] === 'b' ? -1 : 0;
  const oct = m ? parseInt(m[3], 10) : 4;
  const rawMidi = (oct + 1) * 12 + (STEP_SEMITONE[baseStep] ?? 2) + acc + semitoneOffset;
  const pc = ((rawMidi % 12) + 12) % 12;
  const octave = Math.floor(rawMidi / 12) - 1;
  const sharpTable: Record<number, [string, number]> = {
    0: ['C', 0], 1: ['C', 1], 2: ['D', 0], 3: ['D', 1], 4: ['E', 0], 5: ['F', 0],
    6: ['F', 1], 7: ['G', 0], 8: ['G', 1], 9: ['A', 0], 10: ['A', 1], 11: ['B', 0],
  };
  const [step, alter] = sharpTable[pc] ?? ['D', 0];
  return { midi: rawMidi, step, alter, octave };
}

function rootSemitoneFromKeyLabel(keyLabel: string): { tonic: string; fifths: number; semitone: number } {
  const clean = keyLabel.trim().split(/\s+/)[0] || 'D';
  const m = /^([A-G])(#|b)?/.exec(clean);
  const step = m ? m[1] : 'D';
  const acc = m?.[2] === '#' ? 1 : m?.[2] === 'b' ? -1 : 0;
  const rootName = `${step}${m?.[2] ?? ''}`;
  return {
    tonic: rootName,
    fifths: KEY_FIFTHS_MAP[rootName] ?? 0,
    semitone: (STEP_SEMITONE[step] ?? 2) + acc,
  };
}

/**
 * Builds a complete, multi-measure 2-staff `Notation` object (Treble Soprano/Alto +
 * Bass Tenor/Pedal Accompaniment) from any SacredHymnOrPrayer so `<SheetMusic notation={...} />`
 * renders real engraved sheet music (and `toMusicXML` exports a MuseScore/Finale `.musicxml` file).
 */
export function buildHymnSheetMusicNotation(
  item: SacredHymnOrPrayer,
  targetKeyLabel?: string
): Notation {
  const score = item.score;
  const defaultKeyStr = score?.defaultKey || 'D Major';
  const activeKeyStr = targetKeyLabel || defaultKeyStr;
  const origRoot = rootSemitoneFromKeyLabel(defaultKeyStr);
  const targetRoot = rootSemitoneFromKeyLabel(activeKeyStr);
  const semitoneShift = targetRoot.semitone - origRoot.semitone;

  const tsMatch = /^(\d+)\/(\d+)$/.exec(score?.timeSignature || '4/4');
  const beats = tsMatch ? parseInt(tsMatch[1], 10) : 4;
  const beatType = tsMatch ? parseInt(tsMatch[2], 10) : 4;
  const tempoMatch = /(\d{2,3})/.exec(score?.tempoMarking || '84');
  const tempo = tempoMatch ? parseInt(tempoMatch[1], 10) : 84;

  const rawNotes =
    score?.sopranoNotes && score.sopranoNotes.length > 0
      ? score.sopranoNotes
      : [
          { pitch: 'D4', lyric: item.title.split(' ')[0] || 'Praise', beat: 1 },
          { pitch: 'F#4', lyric: item.title.split(' ')[1] || 'the', beat: 2 },
          { pitch: 'A4', lyric: item.title.split(' ')[2] || 'Lord', beat: 3 },
          { pitch: 'G4', lyric: 'A-', beat: 4 },
          { pitch: 'F#4', lyric: 'men', beat: 5 },
        ];

  const notesPerMeasure = Math.max(2, Math.min(4, beats >= 6 ? 3 : beats));
  const trebleMeasures: NMeasure[] = [];
  const bassMeasures: NMeasure[] = [];

  for (let i = 0; i < rawNotes.length; i += notesPerMeasure) {
    const slice = rawNotes.slice(i, i + notesPerMeasure);
    const measureNum = trebleMeasures.length + 1;
    const tElements: NElement[] = [];
    const bElements: NElement[] = [];

    slice.forEach((n, idx) => {
      const sopPitch = parsePitchString(n.pitch, semitoneShift);
      // Add alto harmony a diatonic third below soprano
      const altoMidi = sopPitch.midi - 4;
      const altoPitch: NPitch = {
        midi: altoMidi,
        step: sopPitch.step,
        alter: sopPitch.alter,
        octave: Math.floor(altoMidi / 12) - 1,
      };
      tElements.push({
        rest: false,
        pitches: [altoPitch, sopPitch],
        divisions: 4,
        type: idx === slice.length - 1 && slice.length < notesPerMeasure ? 'half' : 'quarter',
        dots: 0,
        lyric: n.lyric,
      });

      // Bass / Tenor accompaniment on beat 1 and beat 3
      const bassMidi = sopPitch.midi - 12;
      const tenorMidi = sopPitch.midi - 7;
      bElements.push({
        rest: false,
        pitches: [
          {
            midi: bassMidi,
            step: sopPitch.step,
            alter: sopPitch.alter,
            octave: Math.max(2, sopPitch.octave - 1),
          },
          {
            midi: tenorMidi,
            step: sopPitch.step,
            alter: 0,
            octave: Math.max(3, sopPitch.octave - 1),
          },
        ],
        divisions: 4,
        type: idx === slice.length - 1 && slice.length < notesPerMeasure ? 'half' : 'quarter',
        dots: 0,
      });
    });

    trebleMeasures.push({ number: measureNum, elements: tElements });
    bassMeasures.push({ number: measureNum, elements: bElements });
  }

  const staves: NStaff[] = [
    {
      id: 'P1',
      name: 'Soprano / Alto',
      clef: 'treble',
      measures: trebleMeasures,
      groupId: 'hymn-grand',
      groupSymbol: 'brace',
      groupName: score?.tuneName || item.title,
    },
    {
      id: 'P2',
      name: 'Tenor / Bass Accompaniment',
      clef: 'bass',
      measures: bassMeasures,
      groupId: 'hymn-grand',
      groupSymbol: 'brace',
    },
  ];

  return {
    staves,
    key: targetRoot.tonic,
    mode: activeKeyStr.toLowerCase().includes('minor') || activeKeyStr.toLowerCase().includes('dorian') ? 'minor' : 'major',
    keyFifths: targetRoot.fifths,
    beats,
    beatType,
    divisions: 4,
    tempo,
  };
}

// ─── Global Public-Domain Scores & Music Notation Bridge ──────────────────────

export interface GlobalPlatformScoreEntry {
  id: string;
  title: string;
  composer: string;
  era: RepertoireWork['era'];
  year: string;
  region: string;
  instrumentation: string;
  key?: string;
  tempoMarking?: string;
  historicalContext: string;
  imslpUrl: string;
  /** Direct OpenScore CC0 zipped MusicXML URL for Verovio engraving when available */
  mxlUrl?: string;
  /** Direct Internet Archive item URL when available */
  archiveEmbedUrl?: string;
  performer?: string;
  recordingLicense?: string;
  repertoireItem: RepertoireWork;
  media?: RepertoireMedia;
}

const COMPOSER_REGION_MAP: Record<string, string> = {
  'Gregorian Chant': 'Western Monastic Europe (Rome / Metz / St. Gall)',
  'Hildegard von Bingen': 'Rhineland, Germany (Rupertsberg Abbey)',
  'Guillaume de Machaut': 'Reims, France',
  'Josquin des Prez': 'Franco-Flemish Low Countries & Italy',
  'Giovanni Pierluigi da Palestrina': 'Rome, Italy (Papal Basilica of St. Peter)',
  'Thomas Tallis': 'London, England (Chapel Royal)',
  'William Byrd': 'London & Lincoln, England',
  'Claudio Monteverdi': 'Cremona, Mantua & Venice, Italy',
  'Henry Purcell': 'Westminster, London, England',
  'Antonio Vivaldi': 'Venice, Italy (Ospedale della Pietà)',
  'Johann Sebastian Bach': 'Eisenach, Weimar & Leipzig, Germany (St. Thomas Church)',
  'George Frideric Handel': 'Halle, Germany & London, England',
  'Joseph Haydn': 'Rohrau, Eisenstadt & Vienna, Austria',
  'Wolfgang Amadeus Mozart': 'Salzburg & Vienna, Austria',
  'Ludwig van Beethoven': 'Bonn, Germany & Vienna, Austria',
  'Franz Schubert': 'Vienna, Austria',
  'Clara Schumann': 'Leipzig & Frankfurt, Germany',
  'Fanny Mendelssohn': 'Hamburg & Berlin, Germany',
  'Frédéric Chopin': 'Żelazowa Wola, Warsaw, Poland & Paris, France',
  'Johannes Brahms': 'Hamburg, Germany & Vienna, Austria',
  'Pyotr Ilyich Tchaikovsky': 'Votkinsk, Moscow & St. Petersburg, Russia',
  'Antonín Dvořák': 'Nelahozeves, Prague, Bohemia & New York',
  'Claude Debussy': 'Saint-Germain-en-Laye & Paris, France',
  'Maurice Ravel': 'Ciboure (Basque Country) & Paris, France',
  'Erik Satie': 'Honfleur & Paris, France',
  'Scott Joplin': 'Texarkana, Texas, Sedalia, Missouri & New York, USA',
};

/**
 * Unifies all 72 publicly available scores from `data/repertoire.ts` + `data/repertoireScores.ts`
 * (OpenScore CC0 `.mxl` MusicXML scores rendered by `<VerovioScore />`, IMSLP editions, and
 * Internet Archive recordings) so church music departments and Ambo lyric libraries can browse,
 * study, and open global scores in one place.
 */
export const GLOBAL_PLATFORM_SCORES: GlobalPlatformScoreEntry[] = REPERTOIRE.map(item => {
  const media = REPERTOIRE_MEDIA[item.id];
  const firstMovPath = media?.score?.movements?.[0]?.path;
  return {
    id: item.id,
    title: item.title,
    composer: item.composer,
    era: item.era,
    year: item.year || item.era,
    region: COMPOSER_REGION_MAP[item.composer] || 'Global Public-Domain Conservatory Archive',
    instrumentation: item.forces || 'Vocal / Instrumental Ensemble',
    historicalContext: item.note || `${item.title} by ${item.composer} (${item.era}).`,
    imslpUrl: item.imslpUrl,
    mxlUrl: firstMovPath ? openScoreUrl(firstMovPath) : undefined,
    archiveEmbedUrl: media?.audio?.itemId ? archiveItemUrl(media.audio.itemId) : undefined,
    performer: media?.audio?.performer,
    recordingLicense: media?.audio?.licence,
    repertoireItem: item,
    media,
  };
});

/**
 * Opens any Public-Domain Hymn, Gospel Song, or Catholic/Orthodox Prayer directly in Lorea's
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
        ...(item.refrain ? [`Refrain:\n${item.refrain}`] : []),
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
    genre:
      item.kind === 'PUBLIC_DOMAIN_HYMN'
        ? 'Sacred Hymnal'
        : item.kind === 'PUBLIC_DOMAIN_GOSPEL'
        ? 'Public-Domain Gospel & Spirituals'
        : 'Liturgical Prayer Treasury',
    description: item.historyEssay,
    tracks: [],
    bookChapters: chapters,
  } as unknown as Album;

  openAlbumInLorea(album);
}

