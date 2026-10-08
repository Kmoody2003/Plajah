import type { TraditionNote } from './traditionTypes';

/**
 * Christian tradition layer for the history, civics, philosophy, archaeology, arts and
 * sacred-music courses. Notes are additive and perspective-labelled; they never change the
 * facts of a lesson. Each note is attached only where the lesson genuinely touches the topic.
 */
export const TRADITION_NOTES_HISTORY: TraditionNote[] = [
  // ───────────────────────────── lab-history ─────────────────────────────
  {
    courseId: 'lab-history', lessonId: 'lab-history.l01', tradition: 'christian', kind: 'context',
    passages: ['Joshua 6:1-27'],
    connection: 'Jericho, named in this lesson as one of the earliest permanent settlements, is also the city whose fall is told in Joshua 6, which Christians read as part of the story of God bringing Israel into the land. Archaeologists place Jericho\'s earliest settlement far back in the Neolithic, long before the biblical period, and scholars still discuss how the excavated levels relate to the text.',
  },
  {
    courseId: 'lab-history', lessonId: 'lab-history.l02', tradition: 'christian', kind: 'context',
    passages: ['Exodus 21:1-23:19'],
    connection: 'Christians read the Book of the Covenant in Exodus as law given to Israel at Sinai. Scholars note that it shares forms and topics with older Near Eastern law collections such as Hammurabi\'s code, and Jewish and Christian readers have long seen in it a distinctive concern for the slave, the stranger and the poor.',
  },
  {
    courseId: 'lab-history', lessonId: 'lab-history.l03', tradition: 'christian', kind: 'context',
    passages: ['Genesis 41:37-57', 'Exodus 1:8-14'],
    connection: 'Christians read the stories of Joseph and of Israel\'s oppression as set in Egypt, the world of pharaohs, granaries and state building projects that this lesson describes. Historians and archaeologists discuss how the biblical accounts relate to the Egyptian record, and the tradition reads them first as a story of God\'s care and deliverance.',
  },
  {
    courseId: 'lab-history', lessonId: 'lab-history.l07', tradition: 'christian', kind: 'context',
    passages: ['Luke 2:1-7', 'Acts 22:25-29', 'Acts 25:10-12'],
    connection: 'The New Testament is set inside the Roman world this lesson describes: Luke places Jesus\' birth within an imperial census under Augustus, and Acts shows Paul using his Roman citizenship and appealing to Caesar. Christians have long noted how Roman roads, law and the common Greek and Latin languages helped the early Church spread.',
  },
  {
    courseId: 'lab-history', lessonId: 'lab-history.l08', tradition: 'christian', kind: 'church-history',
    passages: ['John 1:1-14', 'Philippians 2:5-11'],
    connection: 'The emperor Constantine, who made Constantinople his capital, convened the Council of Nicaea in 325, which produced the creed that Catholic, Orthodox and many Protestant Christians still recite. The Church read John 1 and Philippians 2 as the root of its confession that the Son is fully God; Orthodox tradition regards Constantinople as the centre of its Byzantine Christian world.',
  },
  {
    courseId: 'lab-history', lessonId: 'lab-history.l11', tradition: 'christian', kind: 'context',
    passages: ['Romans 1:16-17', 'Romans 3:21-28', 'James 2:14-26'],
    connection: 'The Reformers argued from Romans that sinners are justified by faith in Christ alone, and Luther\'s German Bible put that text in readers\' hands. Catholic tradition, affirmed at the Council of Trent, holds that justification is God\'s gift received in a faith that works through love, and often reads Romans alongside James 2; the two traditions have since reached some shared statements on justification while differences remain.',
  },
  {
    courseId: 'lab-history', lessonId: 'lab-history.l11', tradition: 'christian', kind: 'echo',
    passages: ['John 19:25-27', 'Luke 2:34-35'],
    connection: 'Michelangelo\'s Pieta, named in this lesson, shows Mary holding the body of the crucified Christ. In Catholic and Orthodox tradition it is a devotional image of her sorrow, linked to Simeon\'s words in Luke 2 and to her place at the cross in John 19, rather than a scene the Gospels narrate in detail.',
  },
  {
    courseId: 'lab-history', lessonId: 'lab-history.l13', tradition: 'christian', kind: 'context',
    passages: ['Exodus 21:16', 'Galatians 3:28', 'Philemon 1:15-16'],
    connection: 'Many abolitionists, among them Quakers and evangelicals such as William Wilberforce, argued from Scripture: that kidnapping and selling a person is condemned, and that in Christ there is no slave or free. Defenders of slavery also quoted the Bible, and Christians today widely regard that as a misreading of its direction toward human dignity.',
  },

  // ───────────────────────────── hq-quest ─────────────────────────────
  {
    courseId: 'hq-quest', lessonId: 'hq-quest.l03', tradition: 'christian', kind: 'church-history',
    passages: ['John 17:20-23', 'Ephesians 4:4-6'],
    connection: 'Luther\'s Ninety-five Theses of 1517 opened the Protestant Reformation, one of several divisions in Christian history alongside the Catholic and Orthodox separation of 1054. Christians of every tradition have prayed over Jesus\' prayer for unity in John 17, and Catholic, Orthodox and Protestant churches have all pursued dialogue over the last century.',
  },

  // ───────────────────────────── lab-archaeology ─────────────────────────────
  {
    courseId: 'lab-archaeology', lessonId: 'lab-archaeology.l05', tradition: 'christian', kind: 'context',
    passages: ['Joshua 6:1-27'],
    connection: 'Kathleen Kenyon\'s trenches at Jericho (Tell es-Sultan) were dug in a city that Christians know from Joshua 6. How her dating of the excavated walls and destruction layers relates to the traditional date of the biblical account has been discussed for decades, so the link between the site and the text is the tradition\'s reading, with scholars still debating details.',
  },
  {
    courseId: 'lab-archaeology', lessonId: 'lab-archaeology.l05', tradition: 'christian', kind: 'context',
    passages: ['2 Samuel 5:6-10'],
    connection: 'Kenyon also excavated in Jerusalem, on the south-eastern ridge traditionally called the City of David. Christians read 2 Samuel 5 as telling how David took the stronghold of Zion and made it his capital; scholars still discuss how the remains correspond to that account.',
  },
  {
    courseId: 'lab-archaeology', lessonId: 'lab-archaeology.l12', tradition: 'christian', kind: 'context',
    passages: ['2 Corinthians 11:32-33', 'Acts 28:13-14'],
    connection: 'Petra was the Nabataean capital, and Paul mentions the Nabataean king Aretas in connection with Damascus; most scholars identify him as Aretas IV. Acts also has Paul landing at Puteoli on the same Bay of Naples as Pompeii, so Christians read these sites as part of the Roman and Near Eastern world of the early Church.',
  },

  // ───────────────────────────── art-masters ─────────────────────────────
  {
    courseId: 'art-masters', lessonId: 'art-masters.l01', tradition: 'christian', kind: 'echo',
    passages: ['Matthew 26:20-25', 'John 13:21-30'],
    connection: 'Leonardo\'s Last Supper, painted for a Milan monastery refectory, depicts the moment Jesus says one of the twelve will betray him, and the apostles react in separate groups. Christians of all traditions know this meal as the origin of the Lord\'s Supper, Eucharist or Communion.',
  },
  {
    courseId: 'art-masters', lessonId: 'art-masters.l02', tradition: 'christian', kind: 'echo',
    passages: ['Genesis 1:26-27', 'Genesis 2:7', 'Genesis 6:9-9:17'],
    connection: 'The Sistine ceiling, which includes The Creation of Adam, paints scenes from Genesis, from creation and the fall through Noah and the flood. Christians read these as the opening of the story of salvation, and the image of God reaching toward Adam became one of the best-known pictures of Genesis 2.',
  },
  {
    courseId: 'art-masters', lessonId: 'art-masters.l02', tradition: 'christian', kind: 'echo',
    passages: ['Matthew 25:31-46'],
    connection: 'Michelangelo\'s Last Judgment, painted on the Sistine altar wall, shows Christ as judge, drawing on Gospel teaching about the final judgment such as Matthew 25. Christians read this as a call to mercy toward the hungry, the stranger and the imprisoned.',
  },
  {
    courseId: 'art-masters', lessonId: 'art-masters.l03', tradition: 'christian', kind: 'echo',
    passages: ['Matthew 9:9-13'],
    connection: 'Caravaggio\'s Calling of St Matthew shows the tax collector Levi being summoned by Jesus, with light falling across the room at the moment of the call. Christians read the scene as a picture of grace reaching someone others despised: "I desire mercy, not sacrifice."',
  },
  {
    courseId: 'art-masters', lessonId: 'art-masters.l04', tradition: 'christian', kind: 'echo',
    passages: ['Luke 15:11-32'],
    connection: 'Rembrandt\'s late Return of the Prodigal Son, one of his best-known works, depicts the father\'s embrace of the returning son in the parable. Christians across traditions read the story as an image of God\'s welcome, and Rembrandt\'s lifelong interest in biblical subjects shows in the compassion of his faces.',
  },
  {
    courseId: 'art-masters', lessonId: 'art-masters.l14', tradition: 'christian', kind: 'church-history',
    passages: ['Luke 2:1-20', 'John 19:16-30'],
    connection: 'Gaudi, a devout Catholic, devoted his late career to the Sagrada Familia in Barcelona, whose great facades are dedicated to the Nativity, the Passion and the Glory of Christ. Le Corbusier\'s Notre-Dame du Haut at Ronchamp, also named in this lesson, is a Catholic pilgrimage chapel dedicated to Mary.',
  },

  // ───────────────────────────── music-figures ─────────────────────────────
  {
    courseId: 'music-figures', lessonId: 'music-figures.l02', tradition: 'christian', kind: 'church-history',
    passages: ['Matthew 26:1-27:66'],
    connection: 'Bach, a Lutheran church musician in Leipzig, set the Passion narrative of Matthew 26-27 in the St Matthew Passion, weaving congregational chorales through the Gospel text; he also wrote the Mass in B minor and signed many scores with "Soli Deo Gloria". Lutherans see in this the Reformation conviction that music serves the proclamation of the Word, a conviction Catholic and Orthodox musicians would share in their own forms.',
  },
  {
    courseId: 'music-figures', lessonId: 'music-figures.l03', tradition: 'christian', kind: 'echo',
    passages: ['Isaiah 9:6', 'Isaiah 40:1-5', 'Job 19:25-26', '1 Corinthians 15:51-57', 'Revelation 19:6', 'Revelation 11:15'],
    connection: 'Handel\'s Messiah, first performed in Dublin in 1742, is an oratorio whose text was compiled by Charles Jennens almost entirely from Scripture, tracing prophecy, Christ\'s birth, passion and resurrection, and the final victory. Christians of many traditions hear the Hallelujah chorus as praise drawn from Revelation.',
  },
  {
    courseId: 'music-figures', lessonId: 'music-figures.l04', tradition: 'christian', kind: 'echo',
    passages: ['Genesis 1:1-31', 'Psalm 19:1-4'],
    connection: 'Haydn\'s oratorio The Creation (1798) sets a text based on the Genesis creation account, with Psalm 19 ("The heavens are telling") echoed in its choruses, and the libretto also draws on Milton. Christians hear it as praise of God the Creator in the words of Scripture.',
  },
  {
    courseId: 'music-figures', lessonId: 'music-figures.l04', tradition: 'christian', kind: 'church-history',
    passages: ['Zephaniah 1:14-16'],
    connection: 'Mozart\'s unfinished Requiem was written for the Catholic Mass for the dead, and its Dies irae sequence, traditionally attributed to the medieval Franciscan Thomas of Celano, echoes the prophet Zephaniah\'s "day of wrath". In Catholic tradition the Requiem is both a plea for the departed and a meditation on judgment and mercy.',
  },
  {
    courseId: 'music-figures', lessonId: 'music-figures.l07', tradition: 'christian', kind: 'echo',
    passages: ['Matthew 5:4', '1 Peter 1:24-25', '1 Corinthians 15:51-55', 'Revelation 14:13'],
    connection: 'Brahms\'s A German Requiem is unusual because he chose its texts himself from Luther\'s German Bible rather than the Latin Mass for the dead, and it comforts the living ("Blessed are they that mourn"). It stands in the Protestant tradition of congregational Scripture in the vernacular.',
  },
  {
    courseId: 'music-figures', lessonId: 'music-figures.l11', tradition: 'christian', kind: 'context',
    passages: ['Psalm 98:1-6', 'Psalm 150:1-6'],
    connection: 'Gospel music grew in Black churches whose worship drew on the Psalms\' call to sing a new song and to praise God with voice and instruments. Christians hear in call and response, shout and choir a living form of that biblical praise.',
  },

  // ───────────────────────────── civics-hall ─────────────────────────────
  {
    courseId: 'civics-hall', lessonId: 'civ-found-1', tradition: 'christian', kind: 'church-history',
    passages: ['Deuteronomy 17:18-20'],
    connection: 'Magna Carta\'s first clause guaranteed the freedom of the English Church, and Stephen Langton, Archbishop of Canterbury, helped broker the settlement before the Pope annulled it. Christians have often read Deuteronomy 17 as saying that even a king must live under God\'s law, an idea medieval and later Protestant writers used when arguing that rulers are bound by law.',
  },
  {
    courseId: 'civics-hall', lessonId: 'civ-found-2', tradition: 'christian', kind: 'context',
    passages: ['Romans 2:14-15'],
    connection: 'Christian thinkers from Augustine to Aquinas read Paul\'s words about the law "written on their hearts" as support for natural law, a moral order knowable by reason. Locke drew on this tradition through writers such as Richard Hooker, who himself leaned on Aquinas, while Christians have differed over how far reason alone can reach.',
  },
  {
    courseId: 'civics-hall', lessonId: 'civ-found-4', tradition: 'christian', kind: 'context',
    passages: ['Genesis 1:26-27'],
    connection: 'The Declaration says people are "endowed by their Creator" with unalienable rights. Christians have long grounded human equality and dignity in Genesis 1, where every person is made in the image of God, and Catholic and Protestant thinkers alike have appealed to it when defending rights.',
  },
  {
    courseId: 'civics-hall', lessonId: 'civ-struct-1', tradition: 'christian', kind: 'context',
    passages: ['Jeremiah 17:9', 'Romans 3:23'],
    connection: 'Madison\'s line "If men were angels" is often read alongside the Christian doctrine that human nature is fallen, which many founders encountered in their Protestant upbringing; Madison studied under the Presbyterian minister John Witherspoon. Historians weigh how much this shaped checks and balances against Enlightenment sources, so the link is an interpretation, not a settled fact.',
  },
  {
    courseId: 'civics-hall', lessonId: 'civ-rights-1', tradition: 'christian', kind: 'church-history',
    passages: ['Matthew 22:15-22', 'Acts 5:29'],
    connection: 'Many Christians have drawn on "Render to Caesar what is Caesar\'s and to God what is God\'s" when arguing for religious liberty and the free exercise clause. Figures such as the Baptist Roger Williams and the Quaker William Penn, and Catholic and Protestant communities in colonial America, pressed for freedom of conscience on these grounds.',
  },
  {
    courseId: 'civics-hall', lessonId: 'civ-action-1', tradition: 'christian', kind: 'context',
    passages: ['Psalm 137:1-6'],
    connection: 'In his 1852 oration Douglass quotes Psalm 137, the lament of exiles by the rivers of Babylon, to express the grief of the enslaved. His appeal draws on the Bible\'s language of exile and justice, which was widely shared in the Black church and abolitionist movement.',
  },
  {
    courseId: 'civics-hall', lessonId: 'civ-action-1', tradition: 'christian', kind: 'context',
    passages: ['Amos 5:21-24'],
    connection: 'The civil rights movement of the 1950s and 60s repeatedly used Amos 5:24, "let justice roll down like waters", most famously in Martin Luther King Jr.\'s speeches. Christians read the prophets as demanding that worship be joined to justice, which gave the movement\'s appeal to the nation\'s words a biblical register.',
  },

  // ───────────────────────────── philosophy-school ─────────────────────────────
  {
    courseId: 'philosophy-school', lessonId: 'ph-arg-2', tradition: 'christian', kind: 'church-history',
    passages: ['Acts 17:16-34'],
    connection: 'Acts shows Paul debating Stoic and Epicurean philosophers in Athens, the city that tried Socrates. The early Christian writer Justin Martyr later said that those who lived according to reason, such as Socrates, had in a sense lived according to the Logos, a view that shaped Christian engagement with Greek philosophy.',
  },
  {
    courseId: 'philosophy-school', lessonId: 'ph-eth-1', tradition: 'christian', kind: 'church-history',
    passages: ['1 Corinthians 13:13', 'Galatians 5:22-23'],
    connection: 'Aquinas joined Aristotle\'s virtue ethics to the Christian theological virtues of faith, hope and love, and this synthesis is central in Catholic moral theology. Orthodox writers speak of the virtues as growth in holiness, and Protestants often speak of the fruit of the Spirit, so each tradition places character formation within grace.',
  },
  {
    courseId: 'philosophy-school', lessonId: 'ph-hist-2', tradition: 'christian', kind: 'context',
    passages: ['Matthew 13:24-30'],
    connection: 'Christian advocates of toleration, from Roger Williams to Locke\'s Letter Concerning Toleration, argued that the parable of the wheat and the weeds teaches patience rather than coercion in matters of belief. Other Christians in the same period read the text differently, which is why the question of liberty was fiercely debated within the Church.',
  },

  // ───────────────────────────── chora-history ─────────────────────────────
  {
    courseId: 'chora-history', lessonId: 'harm-01', tradition: 'christian', kind: 'church-history',
    passages: ['Colossians 3:16', 'Ephesians 5:19'],
    connection: 'Plainchant is the sung prayer of the Western Church, in which monastic communities chanted the Psalms through the daily hours. Christians cite Paul\'s call to sing "psalms, hymns and spiritual songs"; Gregorian chant takes its name from Pope Gregory I by tradition, though modern scholars see it as a later Frankish and Roman synthesis, as this lesson notes.',
  },
  {
    courseId: 'chora-history', lessonId: 'harm-03', tradition: 'christian', kind: 'echo',
    passages: ['Psalm 42:1-2'],
    connection: 'Palestrina\'s Sicut cervus sets the opening of Psalm 42, "As the deer longs for streams of water", in the Latin of the Catholic liturgy. A traditional story says his polyphony persuaded the Council of Trent that sung words could remain clear, though historians regard that story as legend.',
    canonNote: 'Psalm 42 is Psalm 41 in the Latin Vulgate and Septuagint numbering that Catholic and Orthodox liturgy has traditionally used.',
  },
  {
    courseId: 'chora-history', lessonId: 'pop-01', tradition: 'christian', kind: 'context',
    passages: ['Exodus 3:7-10', 'Exodus 5:1'],
    connection: 'Spirituals such as "Go Down, Moses" retell Exodus, with enslaved Black Christians hearing in the Israelites\' deliverance a promise for themselves. The tradition reads this as Scripture sung as hope and quiet resistance, one of the roots of the blues and gospel.',
  },

  // ───────────────────────────── photo-art-school ─────────────────────────────
  {
    courseId: 'photo-art-school', lessonId: 'ah-3', tradition: 'christian', kind: 'church-history',
    passages: ['Colossians 1:15', 'John 1:14'],
    connection: 'Orthodox tradition understands the flat, gold-grounded icon as a window to the eternal, grounded in the Incarnation: God became visible in Christ. The Seventh Ecumenical Council (Nicaea, 787) affirmed the veneration of icons, which Catholics and Orthodox accept, while many Protestant churches hold different views on images.',
  },
  {
    courseId: 'photo-art-school', lessonId: 'ah-3', tradition: 'christian', kind: 'echo',
    passages: ['Matthew 1:18-25'],
    connection: 'The Book of Kells, an Insular manuscript made around the year 800 by monks, contains the four Gospels in Latin, and its Chi-Rho page opens the story of Christ\'s birth at Matthew 1:18. Medieval Christians treated such lavish illumination as an act of devotion to the Word.',
  },
  {
    courseId: 'photo-art-school', lessonId: 'ah-3', tradition: 'christian', kind: 'church-history',
    passages: ['John 8:12', 'Revelation 21:10-11'],
    connection: 'Gothic builders such as Abbot Suger of Saint-Denis, with Chartres and Sainte-Chapelle later, treated stained glass and soaring height as a way of drawing worshippers toward divine light. Christians connected this to Christ as "the light of the world" and to the radiant heavenly Jerusalem of Revelation.',
  },
  {
    courseId: 'photo-art-school', lessonId: 'ah-5', tradition: 'christian', kind: 'echo',
    passages: ['Ecclesiastes 1:2', 'Ecclesiastes 12:8'],
    connection: 'The word vanitas, used for Dutch skull-and-candle still lifes, comes from the Latin of Ecclesiastes, "vanity of vanities". Reformed Dutch viewers read such pictures as a reminder that earthly wealth and life pass away, which Christians of many traditions hold alongside the hope of resurrection.',
  },
  {
    courseId: 'photo-art-school', lessonId: 'ah-5', tradition: 'christian', kind: 'church-history',
    passages: ['Psalm 26:8'],
    connection: 'After the Council of Trent, the Catholic Church encouraged art that moved the faithful and taught through images, which shaped Baroque churches and altarpieces. Catholics have long tied this to the psalmist\'s love for "the beauty of your house", while the Protestant Dutch Republic took a different path, as the lesson notes.',
  },
  {
    courseId: 'photo-art-school', lessonId: 'ak-3', tradition: 'christian', kind: 'echo',
    passages: ['Luke 1:26-38'],
    connection: 'The lesson\'s example of a woman in blue, a lily and a kneeling winged figure is the Annunciation, the scene in Luke 1 where the angel Gabriel tells Mary she will bear the Son of God. Catholic and Orthodox Christians honour Mary in the scene, and all traditions read it as the beginning of the Incarnation.',
  },
  {
    courseId: 'photo-art-school', lessonId: 'pl-6', tradition: 'christian', kind: 'echo',
    passages: ['Matthew 9:9-13'],
    connection: 'Caravaggio\'s Calling of Saint Matthew, the lighting study this lesson asks photographers to recreate, shows Jesus calling the tax collector in a dark room cut by a shaft of light. Christians read that light as grace arriving at the moment of the call.',
  },
];
