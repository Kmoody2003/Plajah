import type { CourseModule } from '../courseModule';
import type { Question } from '../types';

// Write the correct choice FIRST; the helper rotates the choices (keeping their cyclic order) so the
// correct answer lands on a spread-out index.
const mc = (l: string, n: number, level: 1 | 2 | 3, prompt: string, choices: string[], hint: string, explanation: string): Question => {
  const target = (parseInt(l.slice(l.lastIndexOf('.l') + 2), 10) * 3 + n * 5) % 4;
  const shift = target; // correct choice starts at index 0
  const rotated = choices.map((_, i) => choices[(i - shift + 4) % 4]);
  return { id: `${l}.q${n}`, lessonId: l, kind: 'mcq', prompt, choices: rotated, answer: target, hint, explanation, level };
};
const tf = (l: string, n: number, level: 1 | 2 | 3, prompt: string, answer: number, hint: string, explanation: string): Question =>
  ({ id: `${l}.q${n}`, lessonId: l, kind: 'tf', prompt, answer, hint, explanation, level });

const L = (n: number) => `history-arab-world.l${String(n).padStart(2, '0')}`;
const L01 = L(1), L02 = L(2), L03 = L(3), L04 = L(4), L05 = L(5), L06 = L(6), L07 = L(7), L08 = L(8), L09 = L(9), L10 = L(10);
const L11 = L(11), L12 = L(12), L13 = L(13), L14 = L(14), L15 = L(15), L16 = L(16), L17 = L(17), L18 = L(18), L19 = L(19), L20 = L(20);
const L21 = L(21), L22 = L(22), L23 = L(23), L24 = L(24), L25 = L(25), L26 = L(26), L27 = L(27), L28 = L(28);

export const COURSE_MODULE: CourseModule = {
  curriculum: {
    id: 'history-arab-world',
    label: 'History of the Arab World and the Middle East',
    blurb: 'From the first cities of Mesopotamia and the rise of Islam to the Golden Age, the Crusades, the Ottomans, the modern states and today, told with attention to sources, several perspectives and contested questions.',
    accent: '#C9871F',
    framework: 'ncas',
    tracks: [
      {
        id: 'history-arab-world.t1',
        title: 'Foundations: Land, Peoples and the Rise of Islam',
        blurb: 'The words and the map, the ancient world that came first, pre-Islamic Arabia, and the beginnings of Islam.',
        level: 'FOUNDATION',
        lessons: [
          {
            id: L01,
            title: 'Words and Maps: Arab, Muslim, Middle East',
            blurb: 'Arab, Muslim and Middle Eastern are three different ideas, and mixing them up is the most common mistake in this subject.',
            minutes: 6,
            body: `Before the history, the vocabulary. "Middle East" is a modern geographic label that came into wide use in Europe and the United States around the early twentieth century. It has no fixed borders, but it usually includes Egypt, the Levant (Syria, Lebanon, Jordan, Israel and Palestine), Iraq, the Arabian Peninsula, Turkey and Iran. Some people also include North Africa, which is why you will sometimes see "MENA," short for Middle East and North Africa.

"Arab" mainly describes language and culture. An Arab is a person who speaks Arabic as a first language and identifies with Arab heritage and history. The Arab League, founded in 1945, today has 22 member states, stretching from Morocco on the Atlantic to Iraq and Oman in the east.

"Muslim" describes religion: a follower of Islam. These groups overlap but are not the same. Many Arabs are Christians, Druze or Jews, and some belong to other communities. Most of the world's Muslims are not Arabs: Indonesia, Pakistan and Bangladesh are home to far more Muslims than any Arab country. Iranians speak Persian, Turks speak Turkish, Kurds speak Kurdish, and Amazigh (Berber) people of North Africa speak Amazigh languages. All of these peoples are part of Middle Eastern history.

Worked example: Iran and Iraq are neighbours with similar-sounding names. Iraq is an Arab-majority country with a large Kurdish minority; Iran is a mostly Persian-speaking country with Azeri, Kurdish, Arab and other minorities. Keeping language, religion and nation distinct will make everything that follows clearer.`,
          },
          {
            id: L02,
            title: 'Ancient Roots: Mesopotamia, Egypt and the Levant',
            blurb: 'The region invented cities, writing and law codes thousands of years before Islam, and later societies built on that inheritance.',
            minutes: 7,
            body: `Long before Arabic existed as a written language, the region held some of the first cities and states anywhere. Mesopotamia, Greek for "between the rivers," is the land between the Tigris and Euphrates in present-day Iraq. Farming supported by river water and irrigation produced city-states such as Uruk in the Sumerian world. Cuneiform writing, pressed into clay with a reed stylus, appeared around 3200 BCE, first for accounting and later for stories, letters and laws.

Later powers ruled the same land: Akkad, Babylon and Assyria. Around 1750 BCE the Babylonian king Hammurabi was credited with a famous law code, which set out penalties and rules of commerce. In 539 BCE the Persian king Cyrus took Babylon, bringing the region into the Persian Empire.

In Egypt, the Nile floods made farming reliable. Tradition dates the unification of the kingdom to around 3100 BCE. Hieroglyphic writing, pyramids and temples followed over the next millennia.

The Levant, the eastern Mediterranean coast, was a crossroads. Phoenician cities such as Tyre and Sidon traded by sea, and their alphabet is an ancestor of the Greek, Latin and later alphabets. Hebrew kingdoms and the writings preserved in the Hebrew Bible came from this land too.

After Alexander the Great's campaigns in the 330s BCE, Greek culture spread, and later Rome and the Persian Sasanian dynasty ruled the region. Worked example: when Muslim armies arrived in the 600s CE, they governed populations long used to taxes, bureaucracy and written records, and they often kept local officials and methods in place.`,
          },
          {
            id: L03,
            title: 'Pre-Islamic Arabia',
            blurb: 'Arabia before Islam combined nomads, oasis towns, long-distance trade, rich oral poetry and several religions.',
            minutes: 7,
            body: `The Arabian Peninsula is mostly desert and steppe, with oases, mountains in the south and west, and coasts on the Red Sea, the Gulf and the Indian Ocean. Many Arabs were Bedouin, herders who moved with camels and flocks and organised themselves in tribes and clans. Others lived in oasis towns and farmed dates and grain.

Trade linked the peninsula to the wider world. In the south, kingdoms such as Saba (Sheba) and later Himyar grew rich on frankincense and myrrh. The Nabataeans, an Arab people, built Petra in what is now Jordan and flourished roughly from the first century BCE until Rome annexed their kingdom in 106 CE. On the edges of the peninsula, two great empires, Byzantium and Sasanian Persia, sometimes backed Arab allied states, such as the Ghassanids and Lakhmids.

Mecca, in the western Hijaz, was a trading town and home to the Kaaba sanctuary. It was dominated by the tribe of Quraysh. Pilgrims and merchants gathered around it.

Religion was varied. Many Arabs honoured tribal deities and sacred places; there were also Jewish and Christian communities and some individuals seeking a single God.

Poetry was central. Poets recited from memory, praising tribal honour, generosity, love and the desert journey. Much of it was written down only generations later, so historians treat later collections with care.

Worked example: because Quraysh controlled caravan trade between south Arabia and Syria, a Meccan merchant could be wealthy and well connected, which matters for understanding the world the early Muslim community emerged from.`,
          },
          {
            id: L04,
            title: 'The Rise of Islam',
            blurb: 'Islam began in Mecca in the early seventh century; this lesson describes it as Muslims understand it and as historians use sources.',
            minutes: 8,
            body: `Islam is the religion of Muslims, who believe in one God and in Muhammad as the final prophet. According to traditional Muslim accounts, Muhammad was born in Mecca around 570 CE. Around 610 CE, Muslims believe, he began to receive revelations through the angel Jibril (Gabriel). These revelations, recited aloud and later collected, form the Quran, which Muslims regard as the word of God.

Muhammad's message called people to worship one God, to give to the poor and to act justly. Some in Mecca accepted it; some leading Meccans opposed it, partly for religious reasons and partly because they feared for Mecca's shrine and trade. In 622 CE Muhammad and his followers migrated to the oasis town of Yathrib, which became known as Medina. This migration, the Hijra, marks the start of the Islamic calendar.

In Medina the community grew and organised itself; conflicts with Meccan forces followed, and around 630 CE Muhammad returned to Mecca. He died in 632 CE.

Muslims practise five central duties called the Five Pillars: the declaration of faith (shahada), prayer, almsgiving (zakat), fasting in the month of Ramadan, and pilgrimage to Mecca (hajj) for those able to go.

Sources matter. The Quran is the central text. Hadith, reports of the Prophet's words and actions, and biographies called sira were written down generations later. Believers and academic historians approach their reliability differently, and this course describes events as traditionally reported, while naming where scholars debate the details.`,
          },
        ],
      },
      {
        id: 'history-arab-world.t2',
        title: 'The Caliphates',
        blurb: 'Succession after Muhammad, the first great expansion, the Sunni-Shia divide, and the Umayyad and Abbasid dynasties.',
        level: 'FOUNDATION',
        lessons: [
          {
            id: L05,
            title: 'The Rashidun Caliphs and the Great Expansion',
            blurb: 'In a few decades after 632, Arab armies and administrators created a state stretching from Egypt to Persia.',
            minutes: 8,
            body: `When Muhammad died in 632, the community had to decide who would lead it. The leader was called the caliph, from the Arabic for "successor." The first four, Abu Bakr (632-634), Umar (634-644), Uthman (644-656) and Ali (656-661), are called the Rashidun, "rightly guided," by Sunni Muslims.

Within about two decades, armies from Arabia took Syria and Palestine from the Byzantine Empire, Egypt, and the lands of the Sasanian Persian Empire. The Battle of Yarmuk, around 636, was decisive in Syria, and the Sasanian state had collapsed by around the 650s. Historians point to several reasons: Byzantium and Persia had exhausted each other in a long war, the Arab armies were mobile and well led, and many local people had grievances over taxes or religious policy.

The conquered peoples were mostly not forced to convert. Christians, Jews and later Zoroastrians were generally allowed to practise their religion in return for paying a tax and accepting Muslim rule. This status is called dhimma. Conversion to Islam happened gradually over centuries, and Arabic spread slowly as well.

New garrison cities such as Basra, Kufa and Fustat (near modern Cairo) were founded, and they became centres of administration.

Worked example: a Coptic Christian official in Egypt would often have kept his post under the new rulers, writing in Greek or Coptic at first, with Arabic taking over later.

The period ended in strife: Uthman was assassinated in 656, and the community entered a civil war.`,
          },
          {
            id: L06,
            title: 'Sunni, Shia and the First Civil War',
            blurb: 'A dispute about who should lead the community after Muhammad grew into two major branches of Islam.',
            minutes: 8,
            body: `The question of leadership after Muhammad produced the main division in Islam. Some Muslims held that the community should choose the most suitable leader, and accepted the first caliphs. Over time these became known as Sunnis, from "the way of the Prophet and the community." Others held that leadership belonged to Muhammad's family, especially his cousin and son-in-law Ali. They were the "party of Ali," the Shia.

After Uthman's assassination in 656, Ali became caliph, but Mu'awiya, governor of Syria and a relative of Uthman, challenged him. The two sides fought at Siffin in 657. This period is called the first fitna, meaning "trial" or civil strife. Ali was assassinated in 661, and Mu'awiya became ruler.

In 680, at Karbala in Iraq, forces of the Umayyad governor of Iraq, acting for the caliph Yazid, killed Ali's son Husayn, a grandson of Muhammad, and many of his family. Shia Muslims commemorate this on Ashura, a day of mourning, and it is central to Shia identity and devotion.

Over later centuries, different beliefs and legal traditions developed. Sunnis, a large majority of Muslims worldwide, follow four main law schools: Hanafi, Maliki, Shafii and Hanbali. Shia communities include Twelver Shia (the majority in Iran and Iraq), Ismailis and Zaydis.

Worked example: Shia and Sunni Muslims share the Quran, the Five Pillars and Muhammad as prophet. Their disagreements concern leadership, authority and some practices. History often shows coexistence as well as conflict.`,
          },
          {
            id: L07,
            title: 'The Umayyads and the Arabisation of Empire',
            blurb: 'From Damascus, the Umayyads ruled a vast empire and made Arabic the language of government.',
            minutes: 7,
            body: `Mu'awiya founded the Umayyad dynasty in 661, with its capital at Damascus. Its caliphs ruled until 750, the first hereditary dynasty of caliphs. Their empire eventually extended from Spain in the west across North Africa and the Middle East to Central Asia and the Indus valley in the east.

Under Abd al-Malik (ruled 685-705) the state took on a more Arabic and Islamic character. Arabic replaced Greek and Persian as the administrative language, and a new coinage carried Arabic inscriptions rather than images. The Dome of the Rock in Jerusalem, completed in 691-692, is the oldest surviving major Islamic monument. His successor al-Walid I is associated with the Great Mosque of Damascus. In 711 an army crossed from North Africa into Iberia, beginning the story of al-Andalus.

Tension grew over fairness. Non-Arab converts, called mawali, often found they paid taxes or held lower status than Arab Muslims, even though Islam taught that believers were equal. Many people also saw the Umayyads as worldly rulers rather than pious ones, and Shia opposition continued.

In 750 a revolution that began in Khurasan, in the east, and drew on discontent among both Arabs and non-Arabs, brought down the Umayyads. Most of the family was killed. One prince, Abd al-Rahman, escaped and eventually founded an Umayyad state in Cordoba in 756.

Worked example: the shift from Greek to Arabic in record keeping shows how a conquering minority built a shared language of state.`,
          },
          {
            id: L08,
            title: 'The Abbasids and the City of Baghdad',
            blurb: 'The Abbasid caliphs moved the centre of the Islamic world east to a new capital on the Tigris.',
            minutes: 7,
            body: `The Abbasids, who claimed descent from Muhammad's uncle al-Abbas, took power in 750. In 762 the caliph al-Mansur founded a new capital, Baghdad, on the Tigris river. Its early design was a great circle, called the Round City. Baghdad's position on rivers and trade routes made it a hub, and it became one of the largest cities in the world at that time.

The Abbasid state differed from the Umayyad one. It leaned more on Persian administrators and soldiers from the east, and it presented the caliph as a religious as well as political leader. Viziers, ministers who ran the bureaucracy, grew powerful. One famous family of viziers, the Barmakids, served the caliph Harun al-Rashid (ruled 786-809), who later became a figure in popular storytelling.

Paper manufacturing spread through the Abbasid world in the eighth and ninth centuries, making books, records and letters cheaper to produce. Trade networks reached from China and India to Africa and Europe.

Central control weakened after the ninth century. Regional dynasties gained effective autonomy, and in 945 the Buyids, a Shia family from Iran, took control of Baghdad while the Abbasid caliph remained as a symbolic leader. The caliphate itself lasted until the Mongols in 1258.

Worked example: a ninth-century merchant in Baghdad could travel on a river boat, change coins at a money-changer, and buy paper for a business letter, showing how the city tied together a commercial world.`,
          },
        ],
      },
      {
        id: 'history-arab-world.t3',
        title: 'The Golden Age: Ideas, Arts and Rival Courts',
        blurb: 'Translation, science, medicine, philosophy, literature, the arts, the Fatimids and Muslim Spain.',
        level: 'INTERMEDIATE',
        lessons: [
          {
            id: L09,
            title: 'The Translation Movement and the House of Wisdom',
            blurb: 'Abbasid patrons paid scholars to translate Greek, Persian and Indian works into Arabic, creating a shared scientific language.',
            minutes: 7,
            body: `From the eighth to the tenth centuries, Baghdad was the centre of a large translation movement. Abbasid caliphs, officials and wealthy families paid scholars to translate works from Greek, Syriac, Persian and Sanskrit into Arabic. Surviving Greek texts by Aristotle, Euclid, Ptolemy and the physician Galen were among those translated, as were Indian works on astronomy and mathematics.

The best-known institution linked with this effort is the Bayt al-Hikma, the "House of Wisdom," associated with the caliph al-Mamun, who ruled 813-833. Historians debate what it actually was. Some picture a great academy; others think it began as a caliphal library and workshop for translation, and that later writers made it grander in memory. What is clear is that the caliphs sponsored scholarship on a large scale.

Many translators were not Muslims. Hunayn ibn Ishaq, a Christian who worked in Baghdad in the ninth century, was famous for translating Greek medical and philosophical works, often through Syriac. Persian, Jewish and Muslim scholars also took part. The practice of paying for careful, accurate translations mattered, as did the availability of paper.

The translated works were not merely preserved; scholars criticised, corrected and extended them. Later, many of these Arabic texts were translated into Latin in Europe, especially from the twelfth century.

Worked example: Ptolemy's astronomy book, known in Arabic as the Almagest, was translated into Arabic, studied by astronomers, and eventually returned to Europe in Latin translations from Arabic.`,
          },
          {
            id: L10,
            title: 'Mathematics, Astronomy and Optics',
            blurb: 'Scholars of the Islamic world advanced algebra, observational astronomy and the study of light.',
            minutes: 8,
            body: `Mathematics and astronomy flourished in the Abbasid world. Muhammad ibn Musa al-Khwarizmi, who worked in Baghdad in the early ninth century, wrote a book on solving equations whose title included the word al-jabr, "restoration," which gives us the word algebra. Another of his works explained the Hindu-Arabic numerals, the place-value system with zero that we use today. When it was later translated into Latin, his name was rendered in forms that gave us the word algorithm.

Astronomers built observatories and refined instruments such as the astrolabe, which could tell time, find direction and measure the height of stars. They checked and corrected Greek tables with new observations. In the thirteenth century, scholars at the Maragha observatory in Iran, including Nasir al-Din al-Tusi, developed new mathematical models for planetary motion.

Ibn al-Haytham, who lived roughly from 965 to 1040 and worked in Cairo, wrote the Book of Optics. He argued that we see because light travels from objects into the eye, and he placed great weight on testing ideas with experiments, such as using a dark chamber to study how light passes through a small opening.

Worked example: Why does a navigator or a mosque planner need astronomy? To find the direction of Mecca, called the qibla, and the times of prayer, Muslim scholars used mathematics and astronomy, which gave practical reasons to improve both fields.

Not every scholar was Arab; many were Persian, Turkic or Central Asian, but they wrote mostly in Arabic.`,
          },
          {
            id: L11,
            title: 'Medicine and Philosophy',
            blurb: 'Physicians, hospitals and philosophers built on Greek ideas and debated how reason relates to faith.',
            minutes: 8,
            body: `Medicine drew on Greek writers such as Galen and Hippocrates, on Indian and Persian traditions, and on new observation. The Islamic world developed hospitals, called bimaristans, in cities such as Baghdad and Cairo. They treated patients, trained students and kept records.

Al-Razi (Rhazes, around 865-925) wrote a famous work distinguishing smallpox from measles and kept careful clinical notes. Ibn Sina (Avicenna, about 980-1037), a Persian polymath writing in Arabic, composed the Canon of Medicine, an encyclopedia that was translated into Latin and used as a textbook in European universities for several centuries.

Philosophers read Plato, Aristotle and later Greek commentators. Al-Kindi, in the ninth century, is often called the first major philosopher writing in Arabic. Al-Farabi (died around 950) wrote on logic and political thought. Ibn Sina wrote on being, the soul and knowledge.

There was strong debate over the relationship between reason and revelation. Al-Ghazali (1058-1111), a jurist and theologian, criticised some philosophical positions in his book The Incoherence of the Philosophers. In al-Andalus, Ibn Rushd (Averroes, 1126-1198), a judge and physician from Cordoba, defended philosophy and wrote detailed commentaries on Aristotle that later influenced Latin scholars.

Worked example: a physician reading Ibn Sina would find symptoms, remedies and case reasoning organised in a systematic way, but Ibn Sina still relied partly on ancient theories of bodily humours, which we now know to be wrong.

Disagreement among these thinkers is part of the story, not a failure of it.`,
          },
          {
            id: L12,
            title: 'Poetry, Prose and the Thousand and One Nights',
            blurb: 'Arabic literature moved from desert odes to court poets, essayists, storytellers and satirists.',
            minutes: 7,
            body: `Poetry was the most admired literary form in pre-Islamic Arabia and remained so. The qasida, a long ode with a set structure, often began with memories of a lost love and a deserted camp before moving to praise, boast or reflection. Poets in Abbasid cities experimented with new forms. Abu Nuwas (around 756-814), a poet at the Baghdad court, wrote witty verses about wine, love and city life. Al-Mutanabbi (915-965), a poet who wrote praise for rulers, is still often considered one of the greatest in Arabic.

Prose also flourished. Al-Jahiz (died 868 or 869) wrote lively essays on animals, misers, eloquence and human behaviour. The maqamat, rhymed prose tales about a clever trickster, were developed by al-Hamadhani in the late tenth century and later imitated by al-Hariri. Al-Maarri (973-1057), a blind Syrian poet, wrote doubtful and questioning verse.

Grammar mattered because of the Quran. Early scholars such as Sibawayh in the eighth century wrote systematic accounts of Arabic grammar, which helped standardise the classical language.

The One Thousand and One Nights, known in English as the Arabian Nights, is a collection of tales framed by Shahrazad telling stories to survive. It was gathered over centuries from Indian, Persian and Arabic sources; a ninth-century fragment is the earliest surviving manuscript trace. Many famous tales, such as Aladdin, were added to the European versions later, notably through Antoine Galland's French translation in the early 1700s.

Worked example: reading al-Jahiz, one finds humour and scientific curiosity in the same essay.`,
          },
          {
            id: L13,
            title: 'Calligraphy, Architecture and Music',
            blurb: 'Without sacred images, Islamic art developed script, geometry and ornament as its great languages.',
            minutes: 8,
            body: `Because many Muslim scholars discouraged images of living beings in religious settings, mosques and Quran manuscripts developed other artistic languages. The first is calligraphy, the art of beautiful writing. Early Quran copies were written in angular scripts such as Kufic. Later, scholars including Ibn Muqla (died 940) helped codify proportioned scripts, and styles such as naskh and thuluth became widespread.

The second is geometric and plant-based ornament. Interlacing stars and polygons, vines called arabesques, and honeycomb-like vaulting called muqarnas decorate walls, ceilings and domes. These patterns drew on mathematics and craft traditions.

Architecture gave this art a stage. The Great Mosque of Samarra in Iraq had a famous spiral minaret in the ninth century. The Great Mosque of Cordoba, begun in the eighth century, is known for its forest of double arches. Al-Azhar in Cairo was founded in 970-972 and became a major centre of learning. The Alhambra palace in Granada, mainly built under the Nasrid dynasty in the thirteenth and fourteenth centuries, shows highly elaborate plasterwork and water gardens.

Figurative painting did exist in secular books. In 1237 the artist al-Wasiti illustrated an edition of al-Hariri's maqamat, showing scenes of everyday life.

Music thrived at courts and in cities. The oud, a pear-shaped lute, is an ancestor of the European lute, and its name is the source of the word lute. Al-Farabi wrote a major book on music theory. Melodic systems called maqamat organise Arabic music.

Worked example: a Quran verse in calligraphy on a wall turns the written word into decoration.`,
          },
          {
            id: L14,
            title: 'The Fatimids and Cairo',
            blurb: 'A Shia caliphate challenged the Abbasids from Egypt and founded the city of Cairo.',
            minutes: 7,
            body: `The Fatimids were an Ismaili Shia dynasty who claimed descent from Muhammad's daughter Fatima and Ali. They established a state in Tunisia in 909 and claimed the title of caliph, directly challenging the Abbasids in Baghdad. In 969 their armies conquered Egypt, and they founded a new city next to the old garrison town of Fustat. They called it al-Qahira, "the victorious," which became Cairo.

Al-Azhar, founded in 970-972, began as a Fatimid mosque and became a famous centre of learning. In the tenth century there were thus three rival rulers claiming the title of caliph: the Abbasids in Baghdad, the Fatimids in Cairo and the Umayyads in Cordoba.

Fatimid Egypt had a large Sunni majority, plus Christians and Jews, so the rulers often relied on practical tolerance and capable officials of different faiths. The documents of Jewish merchants preserved in the Cairo Geniza reveal a thriving trade network across the Mediterranean and Indian Ocean. Policies varied by ruler. Al-Hakim (ruled 996-1021) is remembered for harsh measures against Christians and Jews, including ordering the destruction of the Church of the Holy Sepulchre in Jerusalem in 1009. The Druze religion arose out of Ismaili circles in his time.

The Fatimid state weakened in the twelfth century, and in 1171 Saladin ended it and returned Egypt to Sunni rule.

Worked example: a trader writing from Fustat to a partner in Tunisia about a cargo of flax is a reminder that ordinary commerce, not only courts and wars, shaped daily life.`,
          },
          {
            id: L15,
            title: 'Al-Andalus: Muslim Spain',
            blurb: 'For centuries much of Iberia was ruled by Muslim dynasties, with a culture shared, and sometimes contested, by Muslims, Christians and Jews.',
            minutes: 8,
            body: `In 711 a Muslim army led by Tariq ibn Ziyad crossed from North Africa into the Iberian Peninsula and quickly overthrew the Visigothic kingdom. The territory became known as al-Andalus. After the Abbasid revolution, the Umayyad prince Abd al-Rahman I established an independent state at Cordoba in 756. In 929 Abd al-Rahman III declared himself caliph, and Cordoba became one of Europe's largest and most learned cities, with libraries, a great mosque and the palace-city of Madinat al-Zahra.

Muslims, Christians and Jews lived under Muslim rulers. The word convivencia, "living together," is often used for this, but historians debate it: there were long periods of cooperation and cultural exchange, and also tension, taxation and episodes of violence. Jewish scholars such as Hasdai ibn Shaprut served at court, and Maimonides was born in Cordoba in 1138. Ibn Rushd, the philosopher, lived in the twelfth century.

The caliphate broke into small kingdoms, the taifas, around 1031. Christian kingdoms to the north advanced; Toledo fell in 1085. Muslim dynasties from North Africa, the Almoravids and later the Almohads, intervened. By the thirteenth century only the Nasrid kingdom of Granada remained, and it fell in 1492 to the monarchs of Castile and Aragon. That same year Jews were ordered to convert or leave, and Muslims faced forced conversion, culminating in expulsion in the early 1600s.

Worked example: agricultural historians debate how many crops and irrigation methods were truly new to Iberia, but the evidence shows a flourishing farming economy.`,
          },
        ],
      },
      {
        id: 'history-arab-world.t4',
        title: 'Crusades, Mongols, Mamluks and Ottomans',
        blurb: 'Invasion and reshaping from several directions, and the rise of the Ottoman and Safavid empires.',
        level: 'INTERMEDIATE',
        lessons: [
          {
            id: L16,
            title: 'The Crusades from Several Sides',
            blurb: 'Western European armies campaigned in the eastern Mediterranean for two centuries, and different peoples remember it differently.',
            minutes: 8,
            body: `In 1095 Pope Urban II called at Clermont for an expedition to help the Byzantine emperor and to take Jerusalem. The First Crusade captured Jerusalem in 1099, and contemporary accounts report that many of the city's Muslim and Jewish inhabitants were killed. The Crusaders set up states along the coast, including the Kingdom of Jerusalem, Antioch, Edessa and Tripoli.

The Muslim world at this time was divided between the Sunni Seljuk Turks, the Shia Fatimids and many local rulers, which helped the invaders. Over decades, leaders such as Zengi, who retook Edessa in 1144, and later Saladin worked to unite Syria and Egypt. Saladin, a Kurdish commander, ended the Fatimid caliphate in 1171 and defeated the Crusader army at Hattin in 1187, then recovered Jerusalem. The Third Crusade, with Richard I of England, did not retake it, and a treaty in 1192 left the coast to the Crusaders and allowed Christian pilgrims access. The last major Crusader stronghold, Acre, fell to the Mamluks in 1291.

It was not a simple contest of two blocs. Alliances crossed religious lines, Eastern Christians suffered under both sides, and in 1204 the Fourth Crusade sacked the Christian city of Constantinople.

Arabic writers called the Europeans "Franks." Usama ibn Munqidh, a Syrian noble, wrote a memoir describing both friendships and misunderstandings with them. In the Arab world the Crusades were long remembered as a distant episode, and attention increased in the modern era, partly under colonial pressure.

Worked example: compare a European chronicle, an Arabic chronicle and a Byzantine account of the same siege, and note who each blames.`,
          },
          {
            id: L17,
            title: 'The Mongol Invasions',
            blurb: 'The Mongol conquests destroyed cities and ended the Abbasid caliphate, reshaping the region.',
            minutes: 7,
            body: `In the early thirteenth century the Mongol Empire, founded by Genghis Khan, expanded across Asia. Its armies destroyed cities in Central Asia and Iran, using terror and siege warfare. Contemporary writers describe massive killing and destruction in places such as Nishapur and Merv; modern historians agree the damage was severe but debate the numbers, which medieval sources often exaggerate.

In 1258 the Mongol army led by Hulagu, grandson of Genghis Khan, captured Baghdad after a siege. The Abbasid caliph al-Mustasim was killed. The city was sacked, and many people were killed; accounts also describe the destruction of libraries and books. The date is often used as the symbolic end of the Abbasid caliphate in Baghdad. Scholars still debate how permanent the damage to Iraq's farmland and irrigation was.

The Mongols advanced into Syria, but in 1260 at Ain Jalut in Palestine a Mamluk army from Egypt defeated a Mongol force. This stopped their westward expansion for the time being. Hulagu's descendants ruled Iran and Iraq as the Ilkhanate. Around 1295 the ruler Ghazan converted to Islam, and the dynasty then took on local traditions and patronised scholarship, including the observatory at Maragha.

Around 1400 to 1401 the Central Asian conqueror Timur sacked Damascus and Baghdad as well.

Worked example: a historian comparing a Persian court chronicle to an Arabic chronicle must ask whether each author was writing for a Mongol patron or for the victims.`,
          },
          {
            id: L18,
            title: 'The Mamluks of Egypt and Syria',
            blurb: 'A state ruled by purchased soldiers saved Egypt from the Mongols and made Cairo a centre of the Muslim world.',
            minutes: 7,
            body: `The word mamluk means "owned" in Arabic. Mamluks were young men, mostly of Turkic or later Circassian origin, bought as slaves, converted to Islam, trained as soldiers and eventually freed. Muslim rulers had used such soldiers for centuries. In Egypt the Ayyubid dynasty, founded by Saladin, depended heavily on them, and in 1250 the Mamluks seized power themselves.

The Mamluk sultanate ruled Egypt and Syria from 1250 until 1517. Its leaders often came to power by military ability rather than by inheritance. Baybars (ruled 1260-1277), a Mamluk commander at Ain Jalut, became sultan, campaigned against both Mongols and Crusaders, and offered refuge in Cairo to an Abbasid relative, who was given the title of caliph though with little real power. In 1291 the Mamluks captured Acre, ending the Crusader presence.

Cairo became a great city of mosques, madrasas (schools), hospitals and markets. The Black Death struck in 1347-1349 and killed a very large share of the population in Egypt and Syria, with long-term economic effects.

Ibn Khaldun (1332-1406), born in Tunis, spent his later years in Cairo, serving as a judge. In his Muqaddimah he analysed the rise and fall of dynasties, using the concept of asabiyya, group solidarity, to explain why new rulers conquer and later decline.

In 1516-1517 the Ottoman sultan Selim I defeated the Mamluks and took Syria and Egypt.

Worked example: a Mamluk emir who started life as a purchased boy illustrates how a state could build loyalty through training and household ties.`,
          },
          {
            id: L19,
            title: 'The Rise of the Ottoman Empire',
            blurb: 'A small Anatolian principality grew into an empire that ruled most of the Arab world for four centuries.',
            minutes: 7,
            body: `The Ottomans began around 1300 as a small Turkish principality in northwestern Anatolia, led by a figure traditionally called Osman. They captured Bursa in 1326 and expanded into the Balkans. In 1402 Timur defeated Sultan Bayezid I at Ankara, and the state nearly collapsed, but it recovered.

In 1453 Sultan Mehmed II conquered Constantinople, ending the Byzantine Empire, and made it the Ottoman capital, later called Istanbul. The Ottomans turned east and south in the early sixteenth century. After defeating the Safavids at Chaldiran in 1514, Selim I defeated the Mamluks in 1516-1517 and took Syria, Egypt and the holy cities of Mecca and Medina. Under his son Suleiman (ruled 1520-1566), the empire took Baghdad in 1534, and besieged Vienna in 1529. By the late sixteenth century, the Ottomans ruled most Arab lands, from Algeria and Egypt to Syria, Iraq and the Red Sea coast, though Morocco stayed independent and much of the Arabian interior remained under local rulers.

Ottoman sultans also claimed the leadership of the Sunni Muslim world and the title of caliph in later centuries.

For Arabs, Ottoman rule was long and varied. Arab provinces were governed with many local variations, and Arabic remained the language of religion, scholarship and daily life, while Ottoman Turkish was the language of the court.

Worked example: a Damascus merchant in 1600 paid taxes to an Ottoman governor, used Ottoman coins and could join the pilgrim caravan to Mecca under Ottoman protection.`,
          },
          {
            id: L20,
            title: 'How the Ottomans Governed',
            blurb: 'The empire combined a ruling dynasty, a slave-trained elite, religious communities and, later, reform.',
            minutes: 8,
            body: `The Ottoman sultan sat at the head of a state that blended Islamic law with the ruler's own regulations, called kanun. Governors, often called pashas, ran provinces and collected taxes. In practice, distant Arab provinces had considerable local autonomy. Egypt, Mount Lebanon and the Hijaz, for example, had their own local elites and arrangements.

Part of the elite was recruited through the devshirme, a system by which some Christian boys from the Balkans were taken, converted, educated and trained for service, with some becoming officials and Janissary soldiers. It gave talented boys a path to power, but it also meant taking children from their families, and it was a source of suffering.

Non-Muslim communities, such as Orthodox Christians, Armenians and Jews, generally ran their own religious affairs and courts for family law under their own leaders; this arrangement is often called the millet system, though historians debate how formal it was in the early centuries. Non-Muslims paid a special tax and had a legally unequal status, yet many gained wealth in trade.

Coffee, which came from Yemen to the wider region in the fifteenth and sixteenth centuries, led to coffeehouses where people discussed news and poetry.

In the nineteenth century, pressure from Europe led to reform programs called the Tanzimat (1839-1876), which aimed to modernise the army, law and taxation and to give subjects equal citizenship. A constitution was adopted in 1876, and the Young Turks revolution of 1908 restored one after a period of suspension.

Worked example: a Jewish merchant in Aleppo and a Muslim judge there lived under the same sultan but with different legal statuses.`,
          },
          {
            id: L21,
            title: 'The Safavids and the Shia Turn of Iran',
            blurb: 'A dynasty founded in 1501 made Twelver Shia Islam the state religion of Iran and rivalled the Ottomans.',
            minutes: 6,
            body: `Persian-speaking Iran is not an Arab country, but its history is bound to the Arab world, and one dynasty transformed it: the Safavids. Shah Ismail, who came from a Sufi order based in Ardabil, took Tabriz in 1501 and proclaimed himself shah. He declared Twelver Shia Islam the official religion. Before that, most Iranians were Sunni. The change was gradual, supported by importing scholars, including some from Shia communities in Arab lands such as Jabal Amil, in present-day Lebanon, and by building religious institutions.

The Safavids were rivals of the Sunni Ottomans. In 1514 at the Battle of Chaldiran, Ottoman gunpowder weapons defeated the Safavid cavalry. The two empires fought over Iraq and the Caucasus for more than a century, and Baghdad changed hands several times; the Treaty of Zuhab in 1639 settled a border that is roughly close to the later Iran-Iraq border. The cities of Najaf and Karbala in Iraq, which hold Shia shrines, became major pilgrimage places.

Shah Abbas I (ruled 1588-1629) moved the capital to Isfahan and left magnificent buildings. The Safavid state fell in 1722 after an Afghan invasion.

The Safavid period explains why today Iran has a Shia majority and why Shia-Sunni identity has played a role in politics, though many conflicts have also been driven by borders, power and resources rather than doctrine alone.

Worked example: tracing the shrine cities of Najaf and Karbala shows how an Iranian state shaped Arab Iraq.`,
          },
        ],
      },
      {
        id: 'history-arab-world.t5',
        title: 'The Modern Middle East',
        blurb: 'European imperialism, the Arab Revolt and the mandates, new states, Palestine and Israel, Suez, oil, revolution, war and the Arab Spring.',
        level: 'ADVANCED',
        lessons: [
          {
            id: L22,
            title: 'European Imperialism in the Region',
            blurb: 'From 1798 onward, European powers invaded, occupied or dominated Arab lands for strategic and economic reasons.',
            minutes: 8,
            body: `By the late eighteenth century the Ottoman Empire was weaker relative to rising European powers. In 1798 Napoleon Bonaparte invaded Egypt, and although the French left within a few years, the invasion exposed Ottoman and Egyptian weakness. Muhammad Ali, an Ottoman officer who became governor of Egypt, ruled from 1805 to 1848 and built a modern army, new schools and state-run industry, making Egypt a regional power.

France invaded Algeria in 1830 and fought for decades to control it; the Algerian leader Abd al-Qadir led a long resistance. Eventually, Algeria was treated as part of France and settled by many Europeans. Britain took Aden in 1839 to protect its route to India and signed treaties with Gulf rulers. France made Tunisia a protectorate in 1881, and Italy invaded Libya in 1911. Morocco became a French and Spanish protectorate in 1912.

The Suez Canal, opened in 1869 under French direction, cut the sea journey between Europe and Asia, and many Egyptian workers laboured on it. Egypt's rulers borrowed heavily from European lenders, and after a financial crisis Britain occupied Egypt in 1882, claiming a temporary stay that lasted decades. In Sudan, Muhammad Ahmad, who claimed to be the Mahdi, led a revolt against Egyptian-British rule in the 1880s.

Motives included trade routes, markets, raw materials, rivalry among European states and, for some, a belief in a "civilising mission." Local people experienced loss of control, new taxes and legal systems, but also new schools, presses and ideas.

Worked example: tracing the Suez Canal shows how one engineering project led to debt and occupation.`,
          },
          {
            id: L23,
            title: 'World War I, the Arab Revolt and the Mandates',
            blurb: 'Wartime promises to different parties conflicted, and the postwar settlement drew the borders still debated today.',
            minutes: 8,
            body: `The Ottoman Empire entered the First World War in late 1914 on the side of Germany and Austria-Hungary. Britain and France looked for ways to defeat it, and made agreements that did not all fit together.

In correspondence in 1915-1916 between Sharif Husayn of Mecca and the British official Sir Henry McMahon, Britain appeared to support Arab independence in much of the Arab lands in return for an Arab revolt, though the wording about the boundaries was vague and later interpreted differently. In 1916 Britain and France made the secret Sykes-Picot agreement dividing much of the region into spheres of influence. In 1917 the Balfour Declaration stated that Britain favoured a "national home for the Jewish people" in Palestine, while also saying that the rights of existing non-Jewish communities should not be harmed.

The Arab Revolt began in June 1916 under Husayn and his sons, Faisal and Abdullah. Arab forces, aided by British officers including T. E. Lawrence, captured Aqaba in 1917 and entered Damascus in October 1918.

Faisal briefly ruled a kingdom in Syria, but at Maysalun in July 1920 French forces defeated his army. At San Remo in 1920 the Allies assigned mandates, as supervised by the League of Nations: Syria and Lebanon to France, and Iraq and Palestine, which included Transjordan, to Britain. Many Arabs saw this as colonial rule under another name. A large revolt broke out in Iraq in 1920.

Worked example: three documents from 1916-1917 each promised something different to a different party, which helps explain long-lasting mistrust.`,
          },
          {
            id: L24,
            title: 'Nationalism and the Making of Modern States',
            blurb: 'Mandate borders became states, while Arab nationalism and local loyalties competed.',
            minutes: 8,
            body: `The Nahda, the "awakening," was a cultural revival in the nineteenth and early twentieth centuries, in which writers, translators and journalists in Cairo, Beirut and elsewhere revived classical Arabic and discussed modern ideas. Out of it grew Arab nationalism, the idea that Arabs formed one nation, alongside separate national loyalties to Egypt, Syria, Iraq and others.

After the First World War, states took shape. Egypt gained nominal independence in 1922, and a treaty in 1936 loosened British control. Britain installed Faisal as king of Iraq in 1921, and Iraq became formally independent in 1932. Britain also created the emirate of Transjordan under Abdullah. In Arabia, Abd al-Aziz Ibn Saud conquered the Hijaz and unified the territory, which was named the Kingdom of Saudi Arabia in 1932. Lebanon declared independence in 1943 with a power-sharing arrangement among its religious communities, and French troops left Syria in 1946. Algerians fought a bitter war of independence from 1954 to 1962.

The Arab League formed in 1945. The Baath party, advocating Arab unity and socialism, was founded in the 1940s. Egypt and Syria merged into the United Arab Republic in 1958, but it collapsed in 1961, showing how hard unity was.

Turkey, meanwhile, abolished the Ottoman sultanate in 1922 and became a republic in 1923 under Mustafa Kemal Ataturk.

Worked example: an Iraqi in the 1930s might feel Iraqi, Arab, Kurdish, Sunni or Shia at the same time, and states and parties asked them to prioritise differently.`,
          },
          {
            id: L25,
            title: 'Palestine and Israel: A Contested History',
            blurb: 'Two national movements claimed the same land; this lesson sets out agreed facts and names the disputed interpretations.',
            minutes: 8,
            body: `This is among the most contested subjects in the world, so this lesson separates widely agreed facts from interpretations.

In the late nineteenth century, Zionism arose among European Jews, many facing persecution, as a movement for a Jewish national home in the historic homeland. The First Zionist Congress met in 1897. At that time most people living in Palestine were Arab, Muslim and Christian, and Palestinian national identity grew in the early twentieth century. Under the British mandate, Jewish immigration increased, especially after the rise of Nazism, and tension and violence between communities grew, including an Arab revolt in 1936-1939. After the Holocaust, many Jewish survivors sought refuge.

In November 1947 the United Nations General Assembly voted for a plan to partition Palestine into a Jewish state and an Arab state. Jewish leaders accepted it; Palestinian Arab leaders and Arab states rejected it. Fighting began, and Israel declared independence on 14 May 1948. Neighbouring Arab states sent forces. By the 1949 armistice Israel held more territory than the plan had given it. Roughly 700,000 Palestinians fled or were expelled; Palestinians call this the Nakba, "catastrophe." In the following years hundreds of thousands of Jews left or were driven from Arab countries, and many settled in Israel.

In the 1967 war Israel took the West Bank, East Jerusalem, Gaza, Sinai and the Golan Heights. Egypt and Israel made peace in 1979, and the Oslo Accords of 1993 began a negotiation process. Issues still disputed include borders, Jerusalem, refugees, settlements and security.

Israelis tend to emphasise survival and self-determination after persecution; Palestinians tend to emphasise dispossession and occupation. Historians disagree about why people fled in 1948.

Worked example: compare how a Palestinian and an Israeli textbook describe 1948.`,
          },
          {
            id: L26,
            title: 'Suez and the Politics of Oil',
            blurb: 'The 1956 Suez Crisis ended old imperial pretensions, and oil wealth reshaped the Gulf and global politics.',
            minutes: 8,
            body: `In July 1952 a group of army officers overthrew King Farouk in Egypt, and Gamal Abdel Nasser soon became its leading figure. In July 1956 he nationalised the Suez Canal Company, which had been controlled by British and French shareholders. In late October, Israel invaded Sinai, and Britain and France, who had arranged this plan with Israel in secret, sent forces to seize the canal. The United States and the Soviet Union both opposed the action, and under United Nations and financial pressure the invaders withdrew. Militarily the allies had succeeded, but politically Nasser emerged as a hero across the Arab world, while Britain and France lost status.

Oil changed the region differently. Oil was found in Persia in 1908, Iraq in 1927 and Saudi Arabia in 1938. Western companies held long concessions. In 1960 five oil-producing countries formed OPEC to coordinate policy. During the 1973 war, Arab producers imposed an oil embargo on countries seen as supporting Israel, and prices rose sharply, which caused economic shocks around the world.

Over the 1960s and 1970s many governments took control of their oil industries. Revenue paid for roads, schools and modern cities in the Gulf, and attracted millions of foreign workers. Economists note that dependence on one resource can weaken other industries and give governments an independence from taxpayers.

Worked example: a family in a small Gulf fishing town in 1950 and its descendants in 2000 lived in very different economies, thanks to oil income and state spending.`,
          },
          {
            id: L27,
            title: 'Revolution and War: Iran, Iraq and Lebanon',
            blurb: 'From 1975 to the 2010s, civil wars, invasions and an Iranian revolution transformed the region.',
            minutes: 8,
            body: `In Iran, mass protests in 1978-1979 overthrew Shah Mohammad Reza Pahlavi, and Ayatollah Ruhollah Khomeini led the creation of an Islamic Republic. Iran is Persian-majority, not Arab, but the revolution affected Arab politics.

In 1980 Iraq, under Saddam Hussein, invaded Iran, beginning an eight-year war. It killed very large numbers of people on both sides, with estimates reaching into the hundreds of thousands, and Iraq used chemical weapons. In August 1990 Iraq invaded Kuwait. A US-led coalition of many countries, with UN backing, expelled Iraqi forces in early 1991, and sanctions followed. In 2003 a US-led coalition invaded Iraq and removed Saddam Hussein, citing weapons of mass destruction that investigators did not find. The aftermath brought insurgency, sectarian violence and a long political rebuilding. In 2014 the group calling itself the Islamic State seized parts of Iraq and Syria and declared a caliphate; it lost most of its territory by 2017-2019.

Lebanon fought a civil war from 1975 to 1990 among groups divided by religion and politics and involving Palestinian militias, Syria and Israel. Israel invaded in 1982, and the Shia organisation Hezbollah emerged in that period. The Taif Agreement of 1989 helped end the war by adjusting the power-sharing system.

Worked example: tracing Iraq from 1980 to 2003 shows how consecutive wars compounded each other, since a country at war with Iran in the 1980s later faced sanctions and then invasion.

Each of these events has contested causes; historians weigh internal factors and foreign interventions differently.`,
          },
          {
            id: L28,
            title: 'The Arab Spring and Today',
            blurb: 'The uprisings that began in 2010 brought hope, change, war and disappointment, and the region faces continuing challenges.',
            minutes: 8,
            body: `In December 2010 a Tunisian street vendor, Mohamed Bouazizi, set himself on fire in protest at harassment and poverty. Protests spread, and in January 2011 President Ben Ali fled. Demonstrations in Egypt's Tahrir Square led to Hosni Mubarak resigning in February 2011. Protest movements arose in Libya, Yemen, Bahrain, Syria and elsewhere. They are called the Arab Spring.

Outcomes differed sharply. In Libya, an uprising and a NATO air campaign ended Muammar Gaddafi's rule in 2011, followed by years of rival governments. In Egypt, the Muslim Brotherhood's Mohamed Morsi won the 2012 presidential election and was removed by the military under Abdel Fattah el-Sisi in 2013. Tunisia made the most progress toward democracy, though with later setbacks. In Syria, protests in 2011 met violent repression and became a civil war with millions of refugees and internally displaced people, foreign involvement and enormous loss of life. Yemen also fell into a civil war and humanitarian crisis. In December 2024 the Assad government in Syria fell.

Today the region faces shared challenges: a large young population and high youth unemployment, water scarcity and climate pressure, the need to diversify oil-dependent economies, conflicts and refugees, disputes over rights and political participation, and rivalries among regional powers. There are also developments such as growing education, a vibrant media and cultural scene, and economic change in the Gulf.

Worked example: compare Tunisia and Syria, both starting with peaceful protests, to see how institutions, armies and outside powers shape outcomes.

History is still being written, so judge current claims by sources, not slogans.`,
          },
        ],
      },
    ],
  },
  bank: {
    curriculumId: 'history-arab-world',
    questions: [
      // L01
      mc(L01, 1, 1, 'Which term mainly describes a person who speaks Arabic as a first language and identifies with Arab heritage?', ['Arab', 'Muslim', 'Persian', 'Middle Easterner'], 'Think language and culture, not religion.', 'Arab is mainly a linguistic and cultural description.'),
      tf(L01, 2, 1, 'All Arabs are Muslims.', 1, 'Consider Arab Christians and Druze.', 'Many Arabs belong to Christian, Druze, Jewish and other communities.'),
      mc(L01, 3, 1, 'Which is true about the world\'s Muslim population?', ['Most Muslims live outside the Arab world', 'Nearly all Muslims are Arabs', 'Most Muslims live in Morocco', 'Muslims live only in Arabia and the Middle East'], 'Think of Indonesia, Pakistan and Bangladesh.', 'Countries such as Indonesia, Pakistan and Bangladesh have more Muslims than any Arab country.'),
      mc(L01, 4, 2, 'Which language is mainly spoken in Iran?', ['Persian', 'Arabic', 'Turkish', 'Kurdish'], 'It is a different language from the one spoken in Iraq.', 'Iran is mostly Persian-speaking, though it has many minority languages.'),
      tf(L01, 5, 2, 'The term Middle East is a modern geographic label that has no single fixed definition.', 0, 'Think about who invented the term and when.', 'The label arose in the early twentieth century and is used with varying boundaries.'),
      // L02
      mc(L02, 1, 1, 'What does the word Mesopotamia mean in Greek?', ['Between the rivers', 'Land of the pharaohs', 'City of kings', 'Sea of reeds'], 'Think of the Tigris and Euphrates.', 'It means the land between the Tigris and Euphrates rivers.'),
      tf(L02, 2, 1, 'Cuneiform was a writing system made by pressing a reed stylus into clay.', 0, 'The name describes wedge-shaped marks.', 'Cuneiform marks were pressed into clay tablets and used for accounts, letters and laws.'),
      mc(L02, 3, 2, 'Which people developed an alphabet that is an ancestor of the Greek and Latin alphabets?', ['The Phoenicians', 'The Sumerians of Mesopotamia', 'The Nabataeans', 'The Mamluks'], 'They traded by sea from Tyre and Sidon.', 'The Phoenician alphabet influenced Greek and, through it, Latin.'),
      mc(L02, 4, 2, 'Which ruler took Babylon in 539 BCE, bringing it into the Persian Empire?', ['Cyrus', 'Hammurabi', 'Alexander', 'Saladin'], 'He was a Persian king.', 'Cyrus of Persia took Babylon in 539 BCE.'),
      tf(L02, 5, 3, 'When Muslim armies arrived in the 600s CE they were entering lands with no earlier tradition of states or record keeping.', 1, 'Recall the long history of taxes and bureaucracy.', 'The region had ancient traditions of states, taxation and writing, which later rulers often built on.'),
      // L03
      mc(L03, 1, 1, 'What were the Bedouin?', ['Herding peoples who moved with camels and flocks', 'Rulers of Mecca', 'Persian soldiers', 'Roman governors'], 'Think of desert life.', 'Bedouin were nomadic or semi-nomadic herders organised in tribes and clans.'),
      mc(L03, 2, 2, 'Which Arab people built the rock city of Petra?', ['The Nabataeans', 'The Quraysh', 'The Ghassanids', 'The Abbasids'], 'Their kingdom was annexed by Rome in 106 CE.', 'Petra was the Nabataean capital in present-day Jordan.'),
      tf(L03, 3, 1, 'Mecca was home to the Kaaba sanctuary and was dominated by the tribe of Quraysh before Islam.', 0, 'Recall the trading town of the Hijaz.', 'Quraysh controlled Mecca and its sanctuary.'),
      mc(L03, 4, 2, 'Why do historians treat collections of pre-Islamic poetry with care?', ['Much was written down only generations later', 'Poets never wrote about real life', 'It was composed in Latin by Roman travellers in Arabia', 'It has no surviving copies'], 'Think about oral recitation.', 'Because poems were recited from memory first, later collections may have been changed.'),
      tf(L03, 5, 3, 'Pre-Islamic Arabia had only one religion.', 1, 'Think of the different communities named in the lesson.', 'Arabia had tribal religions, Jewish and Christian communities and some individual seekers of a single God.'),
      // L04
      mc(L04, 1, 1, 'What does the Hijra of 622 CE refer to?', ['Muhammad and his followers moving from Mecca to Medina', 'The first Hajj', 'The conquest of Egypt', 'The founding of Baghdad'], 'It marks year one of a calendar.', 'The migration to Medina begins the Islamic calendar.'),
      tf(L04, 2, 1, 'Muslims regard the Quran as the word of God.', 0, 'Consider how Muslims understand the revelations.', 'The Quran is understood by Muslims as divine revelation.'),
      mc(L04, 3, 1, 'Which is NOT one of the Five Pillars of Islam?', ['Holding an annual coronation', 'Fasting in Ramadan', 'Almsgiving', 'The declaration of faith'], 'Look for the item that is not a duty at all.', 'The pillars are the declaration of faith, prayer, almsgiving, fasting and pilgrimage.'),
      mc(L04, 4, 2, 'Hadith are best described as which kind of source?', ['Reports of the Prophet\'s words and actions', 'Greek philosophical texts translated in Baghdad', 'Roman tax records', 'Poems of the Abbasid court'], 'They were collected after his lifetime.', 'Hadith are reports written down generations after Muhammad.'),
      tf(L04, 5, 3, 'The lesson says that believers and academic historians approach early sources in exactly the same way.', 1, 'The lesson mentions two approaches.', 'They often approach reliability differently, so early events are described as traditionally reported.'),
      // L05
      mc(L05, 1, 1, 'Who was the first caliph after Muhammad\'s death in 632?', ['Abu Bakr', 'Ali', 'Mu\'awiya', 'Harun al-Rashid'], 'He was followed by Umar.', 'Abu Bakr was the first of the Rashidun caliphs.'),
      tf(L05, 2, 1, 'The word caliph comes from the Arabic for successor.', 0, 'Think of who succeeded Muhammad.', 'Caliph means successor or deputy.'),
      mc(L05, 3, 2, 'Which factor helped the early expansion, according to historians?', ['Byzantium and Persia had been exhausted by a long war', 'The use of gunpowder cannons and muskets by Arab armies', 'Control of the Suez Canal', 'A large European alliance'], 'Think about the two empires.', 'Two exhausted empires were easier to defeat.'),
      mc(L05, 4, 2, 'What status allowed Christians and Jews to practise their religion under Muslim rule in return for a tax?', ['Dhimma', 'Hijra', 'Qibla', 'Mawali'], 'It means a protected status.', 'Dhimma gave protected non-Muslims religious freedom with a tax.'),
      tf(L05, 5, 3, 'Most conquered people were forced to convert to Islam immediately.', 1, 'Consider the lesson on gradual conversion.', 'Conversion and Arabisation happened gradually over centuries.'),
      // L06
      mc(L06, 1, 1, 'What does Shia mean in origin?', ['Party of Ali', 'People of the book', 'Followers of Abbas', 'Rightly guided'], 'It refers to Muhammad\'s cousin and son-in-law.', 'Shia comes from shiat Ali, the party of Ali.'),
      mc(L06, 2, 2, 'Where was Husayn killed in 680?', ['Karbala', 'The plain of Siffin', 'The Yarmuk river valley', 'The city of Medina'], 'It is in Iraq and has a major Shia shrine.', 'Husayn was killed at Karbala, commemorated on Ashura.'),
      tf(L06, 3, 1, 'Sunni and Shia Muslims both accept the Quran and the Five Pillars.', 0, 'Their differences concern leadership and authority.', 'The two branches share core beliefs and practices.'),
      mc(L06, 4, 2, 'Which of these is a Sunni law school?', ['Hanafi', 'Ismaili', 'Zaydi', 'Twelver'], 'Three of these are Shia groups.', 'Hanafi is one of four Sunni schools, with Maliki, Shafii and Hanbali.'),
      tf(L06, 5, 3, 'After Ali was assassinated in 661, Muawiya became ruler.', 0, 'Recall how the first fitna ended.', 'The death of Ali in 661 left Muawiya in power, founding the Umayyad dynasty.'),
      // L07
      mc(L07, 1, 1, 'Which city was the capital of the Umayyads?', ['Damascus', 'Baghdad on the Tigris', 'Cairo beside the Nile', 'Samarra on the Tigris'], 'It is in Syria.', 'The Umayyad capital was Damascus.'),
      mc(L07, 2, 2, 'What happened under Abd al-Malik?', ['Arabic became the language of administration', 'Baghdad was founded', 'Granada fell', 'The Ottomans arrived'], 'Think of language and coinage.', 'Arabic replaced Greek and Persian in administration and appeared on coins.'),
      tf(L07, 3, 1, 'The Dome of the Rock in Jerusalem was completed in 691-692.', 0, 'It is the oldest surviving major Islamic monument.', 'It dates from Abd al-Malik\'s reign.'),
      mc(L07, 4, 2, 'What were mawali?', ['Non-Arab converts to Islam', 'Abbasid viziers and court secretaries', 'Christian merchants', 'Crusader knights'], 'They often faced lower status.', 'Mawali were non-Arab converts, who often felt unequal.'),
      tf(L07, 5, 3, 'An Umayyad prince escaped the 750 revolution and founded a state at Cordoba.', 0, 'His name was Abd al-Rahman.', 'He founded the Umayyad state in al-Andalus in 756.'),
      // L08
      mc(L08, 1, 1, 'Who founded Baghdad in 762?', ['Al-Mansur', 'Saladin', 'Mehmed II', 'Husayn'], 'He was an early Abbasid caliph.', 'Al-Mansur founded the city on the Tigris.'),
      tf(L08, 2, 1, 'The Round City was the early design of Baghdad.', 0, 'Think of its circular plan.', 'The early city was laid out as a circle.'),
      mc(L08, 3, 2, 'What group took control of Baghdad in 945 while the caliph remained as a symbolic leader?', ['The Buyids', 'The Mongols', 'The Fatimids', 'The Mamluks'], 'They were a Shia family from Iran.', 'The Buyids held real power over the Abbasid caliph.'),
      mc(L08, 4, 2, 'Which development lowered the cost of books and records in the Abbasid world?', ['The spread of paper making', 'The printing press with movable type', 'The telegraph', 'Steam ships'], 'Think of the material that replaced parchment.', 'Paper manufacturing spread in the eighth and ninth centuries.'),
      tf(L08, 5, 3, 'The Abbasid caliphate ended in Baghdad because of the Ottomans.', 1, 'Think of 1258.', 'The Mongols ended it in 1258.'),
      // L09
      mc(L09, 1, 1, 'What was the Abbasid translation movement mainly about?', ['Translating Greek, Persian and Indian works into Arabic', 'Translating the Quran into Greek', 'Writing new laws', 'Copying Chinese silk patterns'], 'It involved paid scholars in Baghdad.', 'Scholars translated works from several languages into Arabic.'),
      tf(L09, 2, 2, 'Historians agree on exactly what the House of Wisdom was.', 1, 'The lesson says they debate this.', 'Some see an academy and others a library or workshop.'),
      mc(L09, 3, 2, 'Who was Hunayn ibn Ishaq?', ['A Christian translator of Greek medical works', 'A Mongol general', 'An Ottoman sultan', 'A Fatimid vizier'], 'He worked in ninth-century Baghdad.', 'He was a Christian scholar famous for translations.'),
      mc(L09, 4, 2, 'Which caliph is associated with the House of Wisdom?', ['Al-Mamun', 'Al-Hakim', 'Abd al-Malik', 'Selim I'], 'He ruled from 813 to 833.', 'The institution is linked with al-Mamun.'),
      tf(L09, 5, 3, 'Scholars only preserved translated works and never extended them.', 1, 'The lesson says they criticised and corrected them.', 'Scholars criticised, corrected and extended the works.'),
      // L10
      mc(L10, 1, 1, 'Which scholar\'s book title gave us the word algebra?', ['Al-Khwarizmi', 'Ibn Sina of Bukhara', 'Nasir al-Din al-Tusi', 'Al-Jahiz of Basra'], 'One of his book titles contained the word al-jabr.', 'The word al-jabr in his book title gave us algebra.'),
      tf(L10, 2, 1, 'The astrolabe could be used to tell time and measure the height of stars.', 0, 'It was a common astronomical instrument.', 'The astrolabe served several practical functions.'),
      mc(L10, 3, 2, 'What did Ibn al-Haytham emphasise in his Book of Optics?', ['Testing ideas with experiments', 'Spells and charms for healing the sick', 'Colonial maps', 'Poetry meter'], 'Think of his dark chamber.', 'He stressed experimental testing of ideas on light.'),
      mc(L10, 4, 2, 'What is the qibla?', ['The direction of Mecca for prayer', 'A kind of silver coin used in markets', 'A desert wind', 'A mosque dome'], 'Mathematics helped find it.', 'The qibla is the direction Muslims face when praying.'),
      tf(L10, 5, 3, 'All the scholars discussed in this lesson were Arabs by descent.', 1, 'Some were Persian, Turkic or Central Asian.', 'Many wrote in Arabic but were from other backgrounds.'),
      // L11
      mc(L11, 1, 1, 'What were bimaristans?', ['Hospitals', 'Observatories', 'Caravan inns', 'Printing shops'], 'They treated patients and trained students.', 'Bimaristans were hospitals in cities such as Baghdad and Cairo.'),
      mc(L11, 2, 2, 'Which work by Ibn Sina was used as a textbook in European universities?', ['The Canon of Medicine', 'The Muqaddimah', 'The Almagest', 'The Book of Optics'], 'It was an encyclopedia of medicine.', 'The Canon of Medicine was translated into Latin.'),
      tf(L11, 3, 2, 'Al-Razi distinguished smallpox from measles.', 0, 'He kept careful clinical notes.', 'Al-Razi wrote a famous work on the two diseases.'),
      mc(L11, 4, 3, 'Which thinker wrote The Incoherence of the Philosophers?', ['Al-Ghazali', 'Ibn Rushd of Cordoba', 'Al-Kindi of Baghdad', 'Al-Farabi the logician'], 'Ibn Rushd later replied to it.', 'Al-Ghazali criticised some philosophical positions.'),
      tf(L11, 5, 3, 'Ibn Rushd wrote commentaries on Aristotle and lived in al-Andalus.', 0, 'He was a judge from Cordoba.', 'His commentaries later influenced Latin scholars.'),
      // L12
      mc(L12, 1, 1, 'What is a qasida?', ['A long classical ode', 'A prose tale about a trickster', 'A kind of lute', 'A school'], 'It is a poetic form.', 'The qasida was a long ode with a set structure.'),
      mc(L12, 2, 2, 'Who wrote lively essays on animals, misers and eloquence?', ['Al-Jahiz', 'Al-Mutanabbi', 'Sibawayh', 'Galland'], 'He died in 868 or 869.', 'Al-Jahiz was a major prose writer.'),
      tf(L12, 3, 1, 'The Thousand and One Nights was gathered over centuries from Indian, Persian and Arabic sources.', 0, 'It was not written by a single person.', 'The collection grew over time.'),
      mc(L12, 4, 2, 'Why was grammar important in early Islamic society?', ['It helped protect and standardise the language of the Quran', 'It was needed for printing', 'It was banned', 'It replaced poetry'], 'Think of the Quran.', 'Scholars such as Sibawayh systematised Arabic grammar.'),
      tf(L12, 5, 3, 'Antoine Galland\'s French translation in the early 1700s helped bring the Nights to Europe.', 0, 'Aladdin was added through it.', 'Galland\'s translation added tales and popularised the work.'),
      // L13
      mc(L13, 1, 1, 'Which art became central in Quran manuscripts and mosques?', ['Calligraphy', 'Oil portraits', 'Film', 'Sculpture of rulers'], 'It is the art of beautiful writing.', 'Calligraphy and geometric ornament developed as major arts.'),
      tf(L13, 2, 1, 'The oud is an ancestor of the European lute.', 0, 'The word lute comes from its name.', 'The English lute derives from al-ud.'),
      mc(L13, 3, 2, 'What are muqarnas?', ['Honeycomb-like vaulting', 'Spiral minarets of Samarra', 'Types of poetry', 'Trade contracts'], 'They are architectural decoration.', 'Muqarnas are stacked niches used in vaults and domes.'),
      mc(L13, 4, 2, 'Which palace in Granada is known for elaborate plasterwork and water gardens?', ['The Alhambra', 'Madinat al-Zahra', 'Topkapi', 'Samarra'], 'It was built mainly under the Nasrids.', 'The Alhambra is the Nasrid palace-city.'),
      tf(L13, 5, 3, 'There was no figurative painting at all in any Islamic-world book.', 1, 'Recall the 1237 manuscript of al-Hariri.', 'Illustrated secular books existed, such as al-Wasiti\'s maqamat.'),
      // L14
      mc(L14, 1, 1, 'Which city did the Fatimids found next to Fustat?', ['Cairo', 'Baghdad', 'Damascus', 'Cordoba'], 'Its name means the victorious.', 'Al-Qahira became Cairo.'),
      tf(L14, 2, 1, 'The Fatimids were an Ismaili Shia dynasty.', 0, 'They claimed descent from Fatima and Ali.', 'The Fatimids were Ismailis who claimed the caliphate.'),
      mc(L14, 3, 2, 'Who ended the Fatimid caliphate in 1171?', ['Saladin', 'Baybars', 'Hulagu', 'Selim I'], 'He later fought the Crusaders.', 'Saladin returned Egypt to Sunni rule.'),
      mc(L14, 4, 2, 'What did the tenth century see in the Muslim world?', ['Three rival rulers claiming the title of caliph', 'A single caliph ruling all Muslim lands from Baghdad', 'No caliphs at all', 'Only Ottoman sultans'], 'Think Baghdad, Cairo and Cordoba.', 'Abbasids, Fatimids and Umayyads each claimed the title.'),
      tf(L14, 5, 3, 'The Cairo Geniza documents reveal a thriving Mediterranean trade network.', 0, 'They were the papers of Jewish merchants.', 'They show commerce across the Mediterranean and Indian Ocean.'),
      // L15
      mc(L15, 1, 1, 'Who led the Muslim army that crossed into Iberia in 711?', ['Tariq ibn Ziyad', 'Abd al-Rahman III', 'Ibn Rushd', 'Maimonides'], 'The place name Gibraltar comes from his name.', 'Tariq ibn Ziyad led the crossing.'),
      tf(L15, 2, 1, 'Abd al-Rahman III declared himself caliph at Cordoba in 929.', 0, 'This was a high point of Cordoba.', 'He declared the Cordoba caliphate in 929.'),
      mc(L15, 3, 2, 'Why do historians debate the word convivencia?', ['Coexistence involved cooperation and also tension', 'It was invented in Cordoba', 'It was the official name of the Umayyad court in Cordoba', 'No one lived together'], 'Think of both cooperation and conflict.', 'It captures cooperation but can understate conflict.'),
      mc(L15, 4, 2, 'Which kingdom was the last Muslim state in Iberia, falling in 1492?', ['Granada', 'Toledo', 'Seville', 'Aragon'], 'The Nasrids ruled it.', 'Granada fell to Castile and Aragon.'),
      tf(L15, 5, 3, 'The caliphate of Cordoba broke into small kingdoms called taifas around 1031.', 0, 'The term means party kingdoms.', 'The fragmentation was a key turning point.'),
      // L16
      mc(L16, 1, 1, 'Which pope called for the expedition that became the First Crusade?', ['Urban II', 'Gregory VII', 'Leo X', 'Innocent III'], 'He spoke at Clermont in 1095.', 'Pope Urban II launched the call in 1095.'),
      mc(L16, 2, 2, 'Which commander defeated the Crusaders at Hattin in 1187?', ['Saladin', 'Baybars', 'Zengi', 'Hulagu'], 'He was of Kurdish origin.', 'Saladin won at Hattin and then retook Jerusalem.'),
      tf(L16, 3, 2, 'The Fourth Crusade sacked the Christian city of Constantinople in 1204.', 0, 'Alliances did not follow neat religious lines.', 'The sack of Constantinople shows the complexity.'),
      tf(L16, 4, 1, 'Arabic writers called the Europeans Franks.', 0, 'The term came from a European people.', 'They used the term Franks, ifranj in Arabic.'),
      mc(L16, 5, 3, 'Which Mamluk victory in 1291 ended the Crusader presence on the mainland?', ['The capture of Acre', 'The capture of Granada', 'The battle of Yarmuk', 'The fall of Baghdad'], 'It was the last major stronghold.', 'The Mamluks took Acre in 1291.'),
      // L17
      mc(L17, 1, 1, 'Who led the Mongol army that took Baghdad in 1258?', ['Hulagu', 'Timur', 'Genghis Khan', 'Kitbuqa'], 'He was a grandson of Genghis Khan.', 'Hulagu captured the city.'),
      tf(L17, 2, 1, 'The Abbasid caliph al-Mustasim was killed when Baghdad fell.', 0, 'This event marks the end of the Abbasid caliphate in Baghdad.', 'He was killed in 1258.'),
      mc(L17, 3, 2, 'Where did a Mamluk army defeat a Mongol force in 1260?', ['Ain Jalut', 'Siffin', 'Hattin', 'Chaldiran'], 'It is in Palestine.', 'Ain Jalut halted Mongol advance westwards.'),
      mc(L17, 4, 2, 'Which Mongol ruler converted to Islam around 1295?', ['Ghazan', 'Hulagu', 'Kublai', 'Timur'], 'He ruled the Ilkhanate.', 'Ghazan\'s conversion shaped the Ilkhanate.'),
      tf(L17, 5, 3, 'Modern historians agree on the exact death tolls medieval sources gave.', 1, 'The lesson says they debate the numbers.', 'Medieval figures are often exaggerated.'),
      // L18
      mc(L18, 1, 1, 'What does the word mamluk mean?', ['Owned', 'Sultan', 'Merchant', 'Poet'], 'It describes purchased soldiers.', 'Mamluks were bought, trained and freed soldiers.'),
      mc(L18, 2, 2, 'Which Mamluk sultan campaigned against both Mongols and Crusaders and ruled 1260-1277?', ['Baybars', 'Saladin', 'Qalawun', 'Selim'], 'He fought at Ain Jalut.', 'Baybars was a major early sultan.'),
      tf(L18, 3, 1, 'The Mamluk sultanate ruled Egypt and Syria until the Ottoman conquest of 1516-1517.', 0, 'Selim I defeated them.', 'The Mamluks ruled from 1250 to 1517.'),
      mc(L18, 4, 3, 'What concept did Ibn Khaldun use to explain the rise and fall of dynasties?', ['Asabiyya, group solidarity', 'Dhimma', 'Tanzimat', 'Devshirme'], 'It concerns group feeling.', 'Asabiyya is central to the Muqaddimah.'),
      tf(L18, 5, 2, 'The Black Death struck Egypt and Syria in 1347-1349 with serious economic effects.', 0, 'It affected much of the world.', 'It killed a large share of the population.'),
      // L19
      mc(L19, 1, 1, 'Which city did Mehmed II conquer in 1453?', ['Constantinople', 'Cairo on the Nile', 'Baghdad on the Tigris', 'Damascus in Syria'], 'It ended the Byzantine Empire.', 'Constantinople became the Ottoman capital.'),
      mc(L19, 2, 2, 'Which sultan conquered Syria and Egypt in 1516-1517?', ['Selim I', 'Suleiman', 'Bayezid I', 'Osman'], 'He defeated the Mamluks.', 'Selim I took the Mamluk lands.'),
      tf(L19, 3, 1, 'Timur defeated Sultan Bayezid I at Ankara in 1402.', 0, 'The state nearly collapsed but recovered.', 'This was a major setback.'),
      tf(L19, 4, 2, 'Under Ottoman rule, Arabic was no longer used for religion and scholarship.', 1, 'Recall the language roles.', 'Arabic remained central to religion and scholarship.'),
      mc(L19, 5, 3, 'Which part of the Arab world stayed outside Ottoman rule?', ['Morocco', 'Egypt along the Nile', 'Syria and its coast', 'Iraq and Baghdad'], 'It lay in the far west.', 'Morocco remained independent.'),
      // L20
      mc(L20, 1, 1, 'What is the devshirme?', ['A system of taking Christian boys for state service', 'A tax on pilgrims', 'A mosque design', 'A kind of coffee'], 'It was a source of suffering for families.', 'Boys were taken, converted and trained.'),
      tf(L20, 2, 2, 'Distant Arab provinces had considerable local autonomy in practice.', 0, 'Think of Egypt and Mount Lebanon.', 'Local elites often retained power.'),
      mc(L20, 3, 2, 'What were the Tanzimat?', ['Nineteenth-century reforms aimed at modernising the empire', 'Crusader states', 'Abbasid taxes', 'Safavid armies'], 'They ran from 1839 to 1876.', 'The reforms aimed to modernise army, law and taxation.'),
      mc(L20, 4, 2, 'What did coffeehouses in Ottoman cities serve as?', ['Places to discuss news and poetry', 'Military barracks', 'Courts of law', 'Schools for the Janissaries'], 'Coffee came from Yemen.', 'They became social centres.'),
      tf(L20, 5, 3, 'Historians debate how formal the millet system was in the early centuries.', 0, 'The lesson says this is debated.', 'The term describes religious community self-rule.'),
      // L21
      mc(L21, 1, 1, 'Which religion did Shah Ismail make official in Iran after 1501?', ['Twelver Shia Islam', 'Sunni Islam', 'Zoroastrianism', 'Ismaili Islam'], 'It is the major branch in Iran today.', 'Twelver Shia Islam was declared the state religion.'),
      tf(L21, 2, 1, 'Iran is an Arab country.', 1, 'Recall the first lesson.', 'Iran is mostly Persian-speaking.'),
      mc(L21, 3, 2, 'Which battle in 1514 saw the Ottomans defeat the Safavids?', ['Chaldiran', 'Yarmuk in Syria', 'Hattin in Galilee', 'Maysalun near Damascus'], 'Gunpowder weapons were decisive.', 'Chaldiran was an Ottoman victory.'),
      mc(L21, 4, 2, 'Which Safavid ruler moved the capital to Isfahan?', ['Shah Abbas I', 'Shah Ismail the founder', 'Suleiman the Magnificent', 'Gamal Abdel Nasser'], 'He ruled from 1588 to 1629.', 'Shah Abbas I built magnificent Isfahan.'),
      tf(L21, 5, 3, 'The Treaty of Zuhab in 1639 settled a border roughly close to the later Iran-Iraq border.', 0, 'The empires had long fought over Iraq.', 'The treaty fixed a lasting frontier.'),
      // L22
      mc(L22, 1, 1, 'Which leader invaded Egypt in 1798?', ['Napoleon Bonaparte', 'Muhammad Ali of Egypt', 'Lord Cromer, British agent', 'Ibn Saud of Najd and Hijaz'], 'He was French.', 'The invasion exposed Ottoman weakness.'),
      mc(L22, 2, 2, 'Which Egyptian governor ruled from 1805 to 1848 and built a modern army?', ['Muhammad Ali', 'Gamal Abdel Nasser', 'King Farouk of Egypt', 'Abdullah of Jordan'], 'He was an Ottoman officer.', 'Muhammad Ali modernised Egypt.'),
      tf(L22, 3, 1, 'The Suez Canal opened in 1869.', 0, 'It cut the journey between Europe and Asia.', 'It was opened under French direction.'),
      mc(L22, 4, 2, 'In what year did Britain occupy Egypt?', ['1882', '1798', '1914', '1956'], 'It followed a financial crisis.', 'Britain occupied Egypt in 1882.'),
      tf(L22, 5, 3, 'Abd al-Qadir led a long resistance to the French in Algeria.', 0, 'France invaded in 1830.', 'He led a resistance for years.'),
      // L23
      mc(L23, 1, 1, 'Which secret 1916 agreement divided the region into spheres of influence?', ['Sykes-Picot', 'Balfour Declaration', 'The Oslo Accords', 'The Taif Agreement'], 'It was between Britain and France.', 'Sykes-Picot divided Arab lands.'),
      tf(L23, 2, 2, 'The Balfour Declaration of 1917 stated Britain favoured a national home for the Jewish people in Palestine.', 0, 'It also said rights of others should not be harmed.', 'It addressed Palestine with that qualification.'),
      mc(L23, 3, 1, 'Who led the Arab Revolt of 1916?', ['Sharif Husayn of Mecca and his sons', 'Ibn Saud', 'Nasser', 'Saladin'], 'Faisal and Abdullah were his sons.', 'Husayn and sons led it.'),
      mc(L23, 4, 2, 'Where did French forces defeat Faisal in 1920?', ['Maysalun', 'Aqaba', 'San Remo', 'Ain Jalut'], 'It ended his Syrian kingdom.', 'Maysalun ended the kingdom.'),
      tf(L23, 5, 3, 'The mandates were assigned by the League of Nations system, with Britain and France in charge.', 0, 'Many Arabs saw it as colonial rule.', 'Mandates gave Britain Iraq and Palestine and France Syria and Lebanon.'),
      // L24
      mc(L24, 1, 1, 'What was the Nahda?', ['A cultural revival in the nineteenth century', 'A Mongol army', 'A Fatimid mosque', 'A tax system'], 'It means awakening.', 'The Nahda revived classical Arabic and ideas.'),
      tf(L24, 2, 1, 'Saudi Arabia was named a kingdom in 1932.', 0, 'Ibn Saud unified the territory.', 'Abd al-Aziz Ibn Saud unified it.'),
      mc(L24, 3, 2, 'Which union of Egypt and Syria collapsed in 1961?', ['The United Arab Republic', 'The Arab League', 'OPEC', 'The Baath'], 'It lasted from 1958.', 'It showed unity was hard to maintain.'),
      mc(L24, 4, 2, 'Which country fought a war of independence from France from 1954 to 1962?', ['Algeria', 'Lebanon', 'Jordan', 'Iraq'], 'It had been invaded in 1830.', 'Algeria gained independence in 1962.'),
      tf(L24, 5, 3, 'Turkey became a republic in 1923 under Ataturk.', 0, 'The sultanate was abolished the year before.', 'The Ottoman sultanate was abolished in 1922 and the republic was proclaimed in 1923.'),
      // L25
      mc(L25, 1, 1, 'What did the 1947 UN partition plan propose?', ['A Jewish state and an Arab state in Palestine', 'A single Arab state', 'A single Jewish state', 'A British protectorate'], 'Jewish leaders accepted and Arab leaders rejected it.', 'Resolution 181 proposed partition.'),
      tf(L25, 2, 2, 'Palestinians call the events of 1948 the Nakba, or catastrophe.', 0, 'Roughly 700,000 fled or were expelled.', 'This is their term for it.'),
      mc(L25, 3, 2, 'Which territories did Israel take in 1967?', ['West Bank, Gaza, Sinai, East Jerusalem and the Golan Heights', 'Cyprus and Crete', 'Only the Sinai', 'Jordan and Syria in full'], 'The war lasted six days.', 'Israel took these areas in the Six-Day War.'),
      mc(L25, 4, 2, 'Which event made Egypt the first Arab state to make peace with Israel?', ['The 1979 treaty', 'The 1948 war with Israel', 'The Oslo Accords of 1993', 'The Suez Crisis of 1956'], 'It followed the 1973 war.', 'Egypt and Israel made peace in 1979.'),
      tf(L25, 5, 3, 'Historians fully agree on why people fled in 1948.', 1, 'The lesson says they disagree.', 'Interpretations differ.'),
      // L26
      mc(L26, 1, 1, 'What did Nasser do in July 1956?', ['Nationalised the Suez Canal Company', 'Resigned', 'Signed a treaty with Britain', 'Invaded Israel'], 'It led to the Suez Crisis.', 'The nationalisation triggered the crisis.'),
      tf(L26, 2, 2, 'Britain and France withdrew under US and Soviet pressure after the 1956 attack.', 0, 'They had acted in secret with Israel.', 'Political pressure forced them to withdraw.'),
      mc(L26, 3, 2, 'Which organisation did five oil-producing countries form in 1960?', ['OPEC', 'The Arab League', 'NATO', 'The UN'], 'It coordinates oil policy.', 'OPEC formed in 1960.'),
      mc(L26, 4, 2, 'What did Arab producers do in 1973?', ['Imposed an oil embargo', 'Joined NATO', 'Opened the canal', 'Built pipelines to Europe'], 'It caused prices to rise sharply.', 'The embargo led to an oil shock.'),
      tf(L26, 5, 3, 'Oil was found in Saudi Arabia in 1938.', 0, 'Western companies held concessions.', 'It was a major discovery.'),
      // L27
      mc(L27, 1, 1, 'Who led the creation of the Islamic Republic of Iran after 1979?', ['Ayatollah Khomeini', 'Saddam Hussein', 'Nasser', 'Shah Abbas'], 'The shah was overthrown.', 'Khomeini led the new republic.'),
      tf(L27, 2, 1, 'Iraq invaded Kuwait in August 1990.', 0, 'A coalition expelled Iraqi forces in 1991.', 'The invasion led to the Gulf War.'),
      mc(L27, 3, 2, 'Which war lasted from 1980 to 1988?', ['The Iran-Iraq War', 'The Lebanese civil war', 'The Gulf War', 'The Suez Crisis'], 'Saddam Hussein began it.', 'It was an eight-year war.'),
      mc(L27, 4, 2, 'Which agreement of 1989 helped end the Lebanese civil war?', ['The Taif Agreement', 'The Sykes-Picot Agreement', 'The Oslo Accords of 1993', 'The Camp David Accords'], 'It adjusted the power-sharing system.', 'Taif helped end the war.'),
      tf(L27, 5, 3, 'Investigators found the weapons of mass destruction cited for the 2003 invasion.', 1, 'The lesson says they did not.', 'They were not found.'),
      // L28
      mc(L28, 1, 1, 'In which country did the Arab Spring begin in December 2010?', ['Tunisia', 'Egypt and Tahrir Square', 'Syria and Damascus', 'Libya and Benghazi'], 'A street vendor protested.', 'Protests began in Tunisia.'),
      tf(L28, 2, 1, 'Hosni Mubarak resigned in February 2011.', 0, 'Protests filled Tahrir Square.', 'He stepped down after mass protests.'),
      mc(L28, 3, 2, 'Which country is described as making the most progress toward democracy?', ['Tunisia', 'Libya after Gaddafi', 'Yemen after Saleh', 'Syria after 2011'], 'Think of which transition made the most lasting progress.', 'Tunisia progressed most, with later setbacks.'),
      mc(L28, 4, 2, 'Which of these is named as a contemporary challenge?', ['Youth unemployment and water scarcity', 'The absence of any young people', 'Too many forests', 'A lack of oil everywhere'], 'Think of population and climate.', 'These are among challenges named in the lesson.'),
      tf(L28, 5, 3, 'The Arab Spring led to the same outcome in every country.', 1, 'Compare Tunisia and Syria.', 'Outcomes differed sharply.'),
    ],
  },
};
