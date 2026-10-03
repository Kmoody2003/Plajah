import type { CourseModule } from '../courseModule';
import type { Question } from '../types';

// Correct choice is written FIRST; the helper rotates choices so the answer lands on a spread-out index.
const mc = (l: string, n: number, level: 1 | 2 | 3, prompt: string, choices: string[], hint: string, explanation: string): Question => {
  const target = (parseInt(l.slice(l.lastIndexOf('.l') + 2), 10) * 3 + n * 5) % 4;
  const rotated = choices.map((_, i) => choices[(i - target + 4) % 4]);
  return { id: `${l}.q${n}`, lessonId: l, kind: 'mcq', prompt, choices: rotated, answer: target, hint, explanation, level };
};
// tf: answer 0 = true, 1 = false
const tf = (l: string, n: number, level: 1 | 2 | 3, prompt: string, answer: number, hint: string, explanation: string): Question =>
  ({ id: `${l}.q${n}`, lessonId: l, kind: 'tf', prompt, answer, hint, explanation, level });

const lid = (n: number) => `history-asia.l${String(n).padStart(2, '0')}`;
interface Les { n: number; title: string; blurb: string; minutes: number; body: string }
const lessons: Les[] = [];
const Q: Question[] = [];
const add = (n: number, title: string, blurb: string, minutes: number, body: string, qs: Question[]) => {
  lessons.push({ n, title, blurb, minutes, body });
  Q.push(...qs);
};

// ---------------------------------------------------------------- L01
{
  const L = lid(1);
  add(1, `Asia: Land, Water and How We Know Its Past`, `Asia's geography shaped where people farmed, traded and built states, and our knowledge of its past comes from many kinds of evidence.`, 6,
`Asia is the largest continent, stretching from the Arctic coast of Siberia to the tropical islands of Indonesia, and from the Mediterranean shores of Turkey to the Pacific coast of Japan. This course covers East Asia, South Asia, Southeast Asia and Central Asia; the Middle East has its own course. About half of the world's people live in Asia today, and for much of history some of the largest cities, most productive farms and biggest empires were here.

Geography helps explain the story. The Himalaya and the high Tibetan Plateau separate South Asia from the rest of the continent. Great rivers, including the Indus, Ganges, Yellow River and Yangtze, deposit rich soil and made large farming societies possible. Seasonal winds called monsoons bring heavy rain to South and Southeast Asia, shaping when crops are planted. Deserts and grasslands in Central Asia supported herding peoples on horseback and, along their edges, trading towns.

A worked example shows how environment shapes life. In early China, the drier north along the Yellow River was farmed mainly with millet, while the wetter south along the Yangtze was suited to rice. Rice fields need much careful labor and water control, and that supports dense villages. Differences like these are one reason Asian societies developed in such varied ways.

How do we know about the past? Historians combine written sources, such as inscriptions, chronicles and travelers' accounts, with archaeology, art and scientific methods. Some ancient writing, like the script of the Indus cities, has never been deciphered. The word "Asia" itself came from outside: ancient Greek writers used it, and the peoples living there used many other names for their own lands. Keep that in mind: Asia is not one culture but many, and this course tries to tell their stories on their own terms.`,
  [
    mc(L,1,1,`Which pair of rivers helped create large farming societies in early China?`,[`The Yellow River and the Yangtze`,`The Indus River and the Ganges River`,`The Mekong and the Irrawaddy rivers`,`The Volga and the Danube rivers`],`Both flow through what is now China.`,`The Yellow River and Yangtze deposited fertile soil and supported dense farming populations in China.`),
    tf(L,2,1,`Monsoon winds bring heavy seasonal rain to much of South and Southeast Asia.`,0,`Think about what monsoons are known for.`,`Monsoons are seasonal wind patterns that bring the main rains to South and Southeast Asia and shape the farming calendar.`),
    mc(L,3,2,`In early China, why did the north and south often farm different crops?`,[`The north was drier and suited to millet, while the wetter south suited rice`,`Northern law forbade rice, while southern law forbade millet farming`,`Only the south had rivers large enough to water any kind of crop`,`Millet cannot be grown near rivers, so northern farmers avoided the Yellow River`],`Think about rainfall and water.`,`Climate differed between north and south, so millet was common in the drier north and rice in the wetter south.`),
    tf(L,4,2,`The script used in the Indus cities has been fully deciphered by scholars.`,1,`Recall what the lesson said about some ancient writing.`,`The Indus script remains undeciphered, so scholars rely heavily on archaeology to understand those cities.`),
    mc(L,5,3,`Which statement best describes how historians reconstruct Asia's past?`,[`They combine written records with archaeology, art and scientific methods`,`They rely on one official national chronicle for each country and treat it as final`,`They use only oral memory from living people and ignore all written texts`,`They use only the writings of outside travelers, since local sources are always biased`],`One kind of evidence is rarely enough.`,`Different kinds of evidence check and fill in for each other, which matters most where writing is missing or undeciphered.`),
  ]);
}

// ---------------------------------------------------------------- L02
{
  const L = lid(2);
  add(2, `The Indus Valley Civilization`, `Around 2600 to 1900 BCE, planned cities with drains and standard weights flourished in the Indus basin, and their end remains debated.`, 7,
`Between roughly 2600 and 1900 BCE, one of the world's earliest urban societies flourished in the valley of the Indus River and neighboring regions of what is now Pakistan and northwest India. It is called the Indus Valley or Harappan civilization, after Harappa, one of its largest cities. Another major city was Mohenjo-daro. Archaeologists began excavating these sites in the 1920s, and hundreds of settlements are now known.

The cities were remarkably organized. Streets were laid out in grids, houses were built of standardized baked bricks, and many homes had access to drains that carried wastewater into covered channels along the streets. Mohenjo-daro contains a large brick structure usually called the Great Bath, though its exact purpose is a matter of interpretation. Weights made in regular proportions suggest a shared system of measurement used in trade.

People of the Indus cities traded widely. Seals carved with animals and signs have turned up in Mesopotamia, which shows contact across the Arabian Sea and overland. Goods likely included beads, cotton, copper and shells. The seals carry a script that no one has deciphered, so we do not know the language or what the writing said.

A worked example of how scholars reason: no clear royal palaces or grand royal tombs have been identified, unlike in contemporary Egypt or Mesopotamia. Some scholars infer a different style of authority, but others caution that we cannot be sure without readable texts.

Around 1900 BCE the cities declined, and many were abandoned. Scholars debate why. Changes in rivers and monsoon rainfall, shifting trade and other factors have all been proposed. The old idea of a sudden invasion destroying the cities is no longer widely supported by the evidence.`,
  [
    mc(L,1,1,`Which of these was a major city of the Indus Valley civilization?`,[`Mohenjo-daro`,`Constantinople`,`Persepolis`,`Anuradhapura`],`It is one of two cities named in the lesson.`,`Harappa and Mohenjo-daro were two of the largest Indus cities.`),
    tf(L,2,1,`Many Indus homes had drains connected to covered channels along the streets.`,0,`The cities were known for urban planning.`,`Archaeology shows covered drainage systems in many Indus cities.`),
    mc(L,3,2,`What do Indus seals found in Mesopotamia suggest?`,[`Long-distance trade or contact between the regions`,`Indus cities were ruled from Mesopotamia`,`Indus and Mesopotamian merchants shared a single written language`,`The Indus script was deciphered using bilingual Mesopotamian texts`],`Consider why an object would travel far from where it was made.`,`Seals of Indus type found far away suggest trade and contact across long distances.`),
    tf(L,4,2,`Scholars agree that a single invasion destroyed the Indus cities.`,1,`The lesson says the old idea is no longer widely supported.`,`Most scholars now favor gradual or multiple causes such as changing rivers and rainfall, not a single invasion.`),
    mc(L,5,3,`Why is it hard to say how Indus society was governed?`,[`The script is undeciphered and no clear royal palaces or tombs have been identified`,`Every Indus city has been excavated and all of its written records fully translated`,`Excavations show that the Indus cities had no trade, no planning and no government`,`Indus kings are known from long royal inscriptions, but these have not been published`],`Think about what evidence is missing.`,`Without readable texts or obvious palaces and royal tombs, the question of authority rests on interpretation.`),
  ]);
}

// ---------------------------------------------------------------- L03
{
  const L = lid(3);
  add(3, `Early China: Shang and Zhou`, `The Shang left oracle-bone writing and bronzes; the Zhou introduced the Mandate of Heaven and an age of philosophy.`, 7,
`The oldest Chinese writing we can read comes from the Shang dynasty, which ruled parts of the Yellow River region from about 1600 to 1046 BCE (the early dates are approximate). Shang kings consulted ancestors and spirits by heating animal bones and turtle shells until they cracked, then reading the cracks. The questions, such as whether a harvest would be good or a campaign would succeed, were carved into the surface. These oracle bones are the earliest large body of Chinese writing, and the characters are clearly ancestors of those used today. The Shang were also skilled in bronze casting, producing ritual vessels of great complexity.

Around 1046 BCE the Zhou people defeated the Shang. To justify taking power, they developed the idea of the Mandate of Heaven: Heaven grants the right to rule to a just ruler, and may withdraw it from one who governs badly. This idea shaped Chinese political thinking for some three thousand years, because a dynasty's fall could be explained as the loss of the mandate.

The Zhou are divided into Western Zhou and, after 771 BCE, Eastern Zhou, when central authority weakened and regional states grew powerful. The later centuries are called the Spring and Autumn period and the Warring States period, an age of constant war. Yet it was also an age of ideas. Confucius, who lived about 551 to 479 BCE, taught that a good society rests on moral example, family duty and ritual. Other thinkers offered rival answers, including those later grouped as Daoism and Legalism.

Worked example: an oracle bone asking about rain shows how rulers tied politics, religion and farming together, and why writing mattered to government.`,
  [
    mc(L,1,1,`What are oracle bones?`,[`Animal bones and shells inscribed with questions to ancestors and spirits`,`Bones of famous Chinese emperors preserved in ancestral temples as relics`,`Bone tools used to plow fields and harvest millet in the Yellow River region`,`Carved game pieces used in a board game played at the Shang court`],`They were used for divination.`,`Shang kings had questions carved on bones and shells that were heated and cracked, and these inscriptions are the earliest large body of readable Chinese writing.`),
    tf(L,2,1,`The Mandate of Heaven held that a ruler could lose the right to rule by governing badly.`,0,`Heaven's approval was conditional.`,`The Zhou idea tied legitimacy to just rule, which let later writers explain a dynasty's fall as loss of the mandate.`),
    mc(L,3,2,`Which dynasty developed the Mandate of Heaven to justify its rule?`,[`Zhou`,`Shang`,`Qin`,`Tang`],`It overthrew the Shang.`,`The Zhou used the Mandate of Heaven to justify defeating the Shang.`),
    tf(L,4,2,`The Warring States period was peaceful but produced no new philosophies.`,1,`Recall both the wars and the ideas of this age.`,`It was a time of constant war, yet also of intense debate among thinkers such as Confucius and later schools.`),
    mc(L,5,3,`Why were the Zhou rulers' claims about Heaven politically useful?`,[`They gave a moral justification for replacing the Shang and a standard for judging later rulers`,`They proved that Heaven never withdrew its support from a dynasty once the mandate was granted`,`They ended all regional states and placed every region under direct Zhou rule from the capital`,`They made the Shang writing system unreadable so that Zhou scribes could replace it entirely`],`Think about conquest needing an explanation.`,`The mandate justified conquest and also offered an explanation for later dynastic change.`),
  ]);
}

// ---------------------------------------------------------------- L04
{
  const L = lid(4);
  add(4, `Qin, Han and the Silk Road`, `The Qin unified China in 221 BCE, the Han made empire last, and trade routes linked East Asia with lands far to the west.`, 8,
`In 221 BCE the state of Qin, after conquering its rivals, unified China under a ruler who took the title Qin Shi Huang, "First Emperor." He standardized writing, weights, measures and coinage, and governed through officials appointed by the center rather than hereditary lords. His government followed Legalism, which stressed strict laws and harsh punishments. Forced labor built roads and fortifications, and his tomb near Xi'an held thousands of life-size clay soldiers, the Terracotta Army. The Qin dynasty collapsed in 206 BCE, only a few years after his death in 210 BCE, amid rebellion and resentment.

The Han dynasty followed, founded in 202 BCE by Liu Bang, a commoner who rose through the rebellions. It lasted, with a brief interruption from 9 to 23 CE, until 220 CE. The Han kept the Qin system of officials but ruled less harshly, and Confucian ideas became important in training officials. Han China expanded and grew wealthy, with advances in iron tools, silk, and astronomy and record-keeping.

Han emperor Wu sent an envoy, Zhang Qian, to seek allies in the west around 138 BCE. His journeys opened knowledge of Central Asia, and trade grew along overland routes that later were called the Silk Road, a name coined by a German geographer in the nineteenth century. Silk, spices, horses, metals and ideas, including Buddhism, traveled in stages through many hands. No one trader walked the whole way. Paper, traditionally credited to Cai Lun in 105 CE, spread later, though earlier paper has been found by archaeologists.

Worked example: a Chinese silk reaching a market in Central Asia passed through several middlemen, each raising the price.`,
  [
    mc(L,1,1,`What did Qin Shi Huang do after unifying China in 221 BCE?`,[`Standardized writing, weights, measures and coinage`,`Divided China back into hereditary kingdoms ruled by his relatives`,`Ended all taxes across the empire`,`Moved the capital to Japan and opened trade with Rome`],`Unification needed shared standards.`,`The Qin standardized key systems to bind the newly unified state.`),
    tf(L,2,1,`The Silk Road was a single road traveled from end to end by one merchant.`,1,`Recall how goods moved.`,`Goods usually passed through many middlemen over a network of routes.`),
    mc(L,3,2,`Which dynasty followed the Qin and lasted until 220 CE?`,[`Han`,`Zhou`,`Shang`,`Song`],`It was founded by Liu Bang.`,`The Han dynasty began in 202 BCE and ended in 220 CE, with a short interruption.`),
    tf(L,4,2,`Legalism stressed strict laws and harsh punishments.`,0,`This was the Qin government's guiding school.`,`Legalism, the Qin philosophy of government, relied on strict laws and punishments.`),
    mc(L,5,3,`Why do scholars say paper's origin should be described carefully?`,[`Tradition credits Cai Lun in 105 CE, but earlier paper has been found by archaeologists`,`Paper was first invented in Rome, and Cai Lun only introduced it to China later`,`No paper has ever been found from the Han period, so its date remains unknown`,`Cai Lun lived in the Tang dynasty, so the 105 CE date is only a printing error`],`Tradition and archaeology do not match exactly.`,`Archaeology found older paper than Cai Lun's date, so tradition's credit to him is better treated as improvement or promotion of an existing technology.`),
  ]);
}

// ---------------------------------------------------------------- L05
{
  const L = lid(5);
  add(5, `The Maurya Empire and Ashoka`, `The Mauryas united much of the subcontinent, and Ashoka left carved edicts that are among our best primary sources.`, 7,
`Around 320 BCE, Chandragupta Maurya took power in northern India and built the first empire to unite most of the subcontinent. His capital was Pataliputra, near the modern city of Patna. Greek-speaking envoys such as Megasthenes visited the court, and fragments of Megasthenes's account survive only through quotation by later writers. A manual of statecraft called the Arthashastra is traditionally attributed to Kautilya, an adviser to Chandragupta, but scholars debate its date and authorship and think it may have been compiled over time.

The empire's best-known ruler was Chandragupta's grandson Ashoka, who reigned from about 268 to 232 BCE. In his own inscriptions he describes a bloody war against the kingdom of Kalinga, on the east coast, in which many people were killed or deported. He says he felt deep remorse and turned toward what he called dhamma, a moral policy of non-violence, tolerance, respect for elders and care for the people. He supported Buddhism, but his edicts also call for respect toward other traditions.

Ashoka's edicts are carved on rocks and polished stone pillars across a huge area, in local languages and scripts. They are valuable because they are primary sources: the ruler's own public words, not a later story about him. A worked example is how historians use them. When an edict mentions Greek kings by name, it helps date events across regions. But a ruler's inscriptions are also propaganda, so historians read them with care and compare them with other evidence.

After Ashoka the empire weakened, and the last Maurya ruler was overthrown around 185 BCE. The pillar capital topped by four lions, from Sarnath, later became India's national emblem.`,
  [
    mc(L,1,1,`What was the capital of the Maurya Empire?`,[`Pataliputra`,`Mohenjo-daro`,`Thessaloniki`,`Chang'an`],`It was near the modern city of Patna.`,`Pataliputra was the Maurya capital.`),
    tf(L,2,1,`Ashoka's edicts were carved on rocks and pillars for the public to see.`,0,`Think about where the lesson says they are found.`,`The edicts were inscribed on rock surfaces and stone pillars across the empire.`),
    mc(L,3,2,`According to Ashoka's own inscriptions, which event led him toward dhamma?`,[`The war against Kalinga`,`The founding of Pataliputra`,`The death of Chandragupta`,`A visit to Greece`],`He expressed remorse about a war.`,`His inscriptions describe remorse after the bloody conquest of Kalinga.`),
    tf(L,4,2,`Scholars all agree on exactly who wrote the Arthashastra and when.`,1,`The lesson says its authorship is debated.`,`Its authorship and date are debated, and it may have been compiled over time.`),
    mc(L,5,3,`Why should a historian read Ashoka's edicts with some caution?`,[`They are public statements by the ruler and so may present him favorably`,`They were written centuries later by monks who never saw him`,`They are all in a lost language no scholar can read`,`They describe only the deeds of Greek kings, not those of Ashoka himself`],`Who produced the edicts, and why?`,`A ruler's own inscriptions are valuable primary sources but also served to shape his public image.`),
  ]);
}

// ---------------------------------------------------------------- L06
{
  const L = lid(6);
  add(6, `The Gupta Age and Classical India`, `Under the Guptas, roughly 320 to 550 CE, India saw advances in mathematics, astronomy, literature and learning.`, 7,
`After the Maurya Empire, the subcontinent was divided into many kingdoms for centuries. In about 320 CE a ruler named Chandragupta I began the rise of the Gupta dynasty in northern India, and his successors expanded its power. The Gupta period, roughly 320 to 550 CE, is often called a classical age, though historians remind us that "golden age" is a label added later, and that other regions of India were also creative in this period.

The period was rich in learning. The astronomer and mathematician Aryabhata, who wrote in 499 CE, explained the apparent motion of the stars by the rotation of the Earth and worked with calculation methods. The decimal place-value system, using nine digits and a zero, took shape in India, though scholars debate exactly when and where each part developed. Through later translators it spread west and became the numerals we use today. Sanskrit literature flourished; the poet and dramatist Kalidasa is usually linked with this era, though his exact dates are uncertain. The monastic university at Nalanda, in Bihar, grew into a major center for Buddhist and other study.

A worked example of our sources: a Chinese Buddhist monk named Faxian traveled through India around 400 CE and left an account of what he saw. Foreign visitors like him give outside perspectives, but they describe only what they saw and understood.

The Gupta state weakened in the later fifth century, affected by internal division and pressure from Central Asian groups often called the Hunas. By the middle of the sixth century the empire had broken up.`,
  [
    mc(L,1,1,`Which numeral system with a zero took shape in India?`,[`The decimal place-value system`,`The Roman numeral system of letters`,`Tally marks on wood`,`Cuneiform wedge numbers pressed in clay`],`It became the numerals used widely today.`,`The decimal place-value system with zero developed in India and spread through later translators.`),
    tf(L,2,1,`Nalanda was a major center of learning in the Gupta era.`,0,`It was a monastic university in Bihar.`,`Nalanda grew into a famous center of Buddhist and other learning.`),
    mc(L,3,2,`Why do historians treat the phrase "golden age" with care?`,[`It is a label added later and may overlook other regions and problems`,`It was the term Gupta emperors used for their own rule in nearly every inscription`,`It shows there was no science in Gupta times`,`It describes a long time in which there were no wars, famines or hardships anywhere`],`Think about who coined the label and when.`,`The term is a later judgement, and other regions and eras were also creative.`),
    tf(L,4,2,`Faxian was a Chinese monk who left an account of travel in India around 400 CE.`,0,`He is a foreign visitor named in the lesson.`,`Faxian's account is an important outside source for India in this period.`),
    mc(L,5,3,`How should a historian use Faxian's account?`,[`As useful evidence of what a visitor saw and understood, checked against other sources`,`As a complete and impartial record of everything that took place in Gupta India`,`As proof that Gupta kings took orders from the Chinese emperor who sent him`,`As worthless evidence, because foreign visitors never record anything accurately`],`Every source has a point of view.`,`Visitor accounts are valuable but limited, and should be compared with inscriptions, art and other texts.`),
  ]);
}

// ---------------------------------------------------------------- L07
{
  const L = lid(7);
  add(7, `Buddhism and Hinduism Across Asia`, `Both traditions began in South Asia and shaped cultures far away as monks, merchants and rulers carried their ideas along trade routes.`, 8,
`Buddhism began in northeastern India with Siddhartha Gautama, called the Buddha, "the awakened one." Buddhist tradition places his life around the fifth century BCE, though scholars debate the exact dates. Buddhist teaching, in outline, holds that life involves suffering, that suffering arises from craving, and that it can end by following a path of ethical living and meditation. Monks and nuns formed communities that could travel, and merchants and rulers often supported them.

Buddhism spread by several routes. After Ashoka's patronage, Buddhist teaching reached Sri Lanka, and from there the Theravada tradition shaped much of Southeast Asia. Another branch, Mahayana, moved along the Silk Road through Central Asia into China, probably by the first century CE, and later to Korea and Japan. Chinese pilgrims such as Xuanzang, in the seventh century, traveled to India for texts and returned with hundreds of manuscripts to translate.

Hinduism is not a single organized religion with one founder; it is a name for many related traditions with shared texts such as the Vedas, many deities and diverse practices. In the first millennium CE, South Asian traders, priests and courts carried Sanskrit learning and Hindu worship to Southeast Asia. Rulers there adopted Indian titles and temple forms, adapting them to local belief rather than copying them.

A worked example: Angkor Wat in Cambodia was built in the twelfth century as a Hindu temple to Vishnu and later became a Buddhist site. Borobudur in Java is a large Buddhist monument from around the ninth century. Both show Indian religion transformed by local builders and patrons.`,
  [
    mc(L,1,1,`Where did Buddhism begin?`,[`Northeastern India`,`The Mongolian steppe`,`The Japanese islands`,`Western Europe`],`The Buddha lived in South Asia.`,`Buddhism began with Siddhartha Gautama in northeastern India.`),
    tf(L,2,1,`Hinduism has a single founder and one centralized organization.`,1,`The lesson describes it as many related traditions.`,`Hinduism is a name for diverse traditions without one founder or one governing body.`),
    mc(L,3,2,`Which route carried Mahayana Buddhism into China?`,[`The Silk Road through Central Asia`,`A sea voyage across the Pacific from Peru`,`Atlantic routes from Europe`,`An overland route from the Americas via Panama`],`Think about overland trade.`,`Mahayana Buddhism moved along Silk Road routes through Central Asia into China.`),
    tf(L,4,2,`Angkor Wat was originally built as a Hindu temple.`,0,`It was dedicated to Vishnu.`,`It was built in the twelfth century as a Hindu temple to Vishnu and later became a Buddhist site.`),
    mc(L,5,3,`What does Southeast Asia's adoption of Indian religion and Sanskrit titles show?`,[`Local rulers selectively adapted Indian ideas to their own purposes`,`India conquered Southeast Asia by force and installed Indian governors in every case`,`Southeast Asians had no culture of their own and copied Indian life completely`,`Indian religion spread only by armies`],`Consider who chose to adopt what.`,`Evidence suggests local elites invited and adapted Indian culture, not simply that it was imposed.`),
  ]);
}

// ---------------------------------------------------------------- L08
{
  const L = lid(8);
  add(8, `Tang and Song China`, `The Tang built a cosmopolitan empire; the Song, though smaller, saw a burst of invention, trade and urban life.`, 8,
`The Tang dynasty ruled from 618 to 907 CE. Its capital, Chang'an, was among the largest cities in the world, home to merchants and envoys from across Asia. Tang emperors drew on the examination system to recruit officials and supported poetry, painting and Buddhist art. Wu Zetian ruled from 690 to 705 CE and is the only woman to rule China as emperor in her own right, which later male historians often judged harshly. The empire was weakened by the An Lushan Rebellion, which began in 755 and lasted for years, and it ended in 907.

After decades of division, the Song dynasty was established in 960. In 1127 the Jurchen conquered the north, including the capital Kaifeng, and the dynasty continued in the south at Hangzhou as the Southern Song. The Song were militarily weaker than the Tang but economically vibrant. Rice farming improved, cities grew, and a money economy developed, including paper money issued in Sichuan.

Song technology and learning advanced. Woodblock printing spread books widely, and a commoner named Bi Sheng is credited around the 1040s with inventing movable type from clay. Gunpowder weapons appeared in warfare, and the magnetic compass came into use for navigation. The civil service examinations, which tested knowledge of classic texts, drew many more candidates, producing a class of scholar-officials, though success still favored families with the means to educate their sons.

Worked example: a family in Song Hangzhou might pay for a son's education in the hope that an examination success would bring status, showing how ideas about merit and wealth interacted.`,
  [
    mc(L,1,1,`Which dynasty had its capital at Chang'an?`,[`Tang`,`Song`,`Ming`,`Qing`],`It ruled from 618 to 907.`,`Chang'an was the Tang capital and a major cosmopolitan city.`),
    tf(L,2,1,`Wu Zetian is the only woman to have ruled China as emperor in her own right.`,0,`She ruled in the Tang era.`,`Wu Zetian ruled from 690 to 705 CE and is the only woman to hold the title in her own right.`),
    mc(L,3,2,`What happened to the Song dynasty in 1127?`,[`The Jurchen conquered the north and the dynasty continued in the south`,`It conquered Japan and moved its capital there after the Jurchen victory`,`The capital moved back to Chang'an and the Tang dynasty was restored`,`The Han dynasty replaced it and reunited the whole country under one ruler`],`This created the Southern Song.`,`After the Jurchen took the northern capital Kaifeng, the Song continued from Hangzhou.`),
    tf(L,4,2,`Song China made use of paper money.`,0,`Think of Sichuan.`,`Paper money was issued in Song China, in the Sichuan region.`),
    mc(L,5,3,`Why is it incomplete to say the examination system was simply open to all talent?`,[`Success still favored families who could afford a son's education`,`Examinations tested only cooking and craft skills, not literature or the classics`,`Women alone were allowed to sit the exams, so men were excluded`,`There were no examinations at all under the Song, only hereditary posts`],`Think about who could afford to prepare.`,`Although the system rewarded learning, it favored those with resources, so merit and wealth were entangled.`),
  ]);
}

// ---------------------------------------------------------------- L09
{
  const L = lid(9);
  add(9, `The Mongol Empire`, `From 1206 the Mongols built the largest connected land empire in history, with devastating conquests and a brief age of linked trade.`, 8,
`In 1206 a council of Mongol leaders proclaimed Temujin as Chinggis Khan, "universal ruler" of the tribes of the steppe. Mongol armies combined horsemanship, discipline and flexible tactics. Over the next decades they conquered an enormous territory: northern China, Central Asia, Persia, and parts of Russia. Chinggis Khan died in 1227, and his sons and grandsons continued the conquests, reaching as far as Eastern Europe.

The conquests were brutal. Cities that resisted were often destroyed and their people killed on a large scale, and the death toll in places like Central Asia and Persia was very high, though sources differ about exact numbers. Sources written by the conquered, such as Persian chroniclers, convey this suffering, while Mongol-sponsored writers stressed order and law.

The empire later divided into regions ruled by different branches of the family, called khanates. In China, Chinggis's grandson Kublai Khan was proclaimed khan in 1260, took the Chinese dynastic name Yuan in 1271, and completed the conquest of the Southern Song in 1279. Mongol invasions of Japan in 1274 and 1281 failed.

With vast lands under related rulers, travel and trade grew safer along the Silk Road, a time sometimes called the Pax Mongolica. A relay system of riders and stations, the yam, carried messages and officials. Envoys, merchants and missionaries traveled widely; the Venetian Marco Polo's account of his travels is debated for accuracy. Historians still debate the Mongol impact, including whether the movement of people helped spread plague later. The Yuan dynasty ended in 1368 when Chinese rebels expelled the Mongols from China.`,
  [
    mc(L,1,1,`Who was proclaimed Chinggis Khan in 1206?`,[`Temujin`,`Kublai Khan`,`Hulagu`,`Ogedei Khan`],`He founded the empire.`,`Temujin was proclaimed Chinggis Khan by a council of Mongol leaders in 1206.`),
    tf(L,2,1,`The Mongol conquest of the Southern Song was completed in 1279 under Kublai Khan.`,0,`He founded the Yuan dynasty.`,`Kublai Khan completed the conquest of the Southern Song in 1279.`),
    mc(L,3,2,`What was the yam?`,[`A relay system of riders and stations for messages and officials`,`A style of Mongol felt tent used by the khan to hold court on campaign`,`A Chinese civil service examination taken in the capital each year`,`A tax paid by temples to the Mongol court in silver or grain`],`It supported communication across the empire.`,`The yam moved messages and officials quickly across Mongol lands.`),
    tf(L,4,2,`The Mongol invasions of Japan in 1274 and 1281 succeeded.`,1,`Recall the outcome.`,`Both invasions of Japan failed.`),
    mc(L,5,3,`Why should historians read Mongol-era sources carefully?`,[`Conquered peoples and Mongol-sponsored writers described the same events very differently`,`All sources agree exactly about every battle, massacre and policy of the Mongols`,`Only Mongol sources exist, so nothing can be checked against any other account`,`The surviving sources were all written in the twentieth century by modern scholars`],`Whose point of view does each source reflect?`,`Accounts by the conquered emphasize suffering, while Mongol-sponsored texts stress order, so both need critical reading.`),
  ]);
}

// ---------------------------------------------------------------- L10
{
  const L = lid(10);
  add(10, `Ming China`, `From 1368 to 1644 the Ming restored Chinese rule, rebuilt the Great Wall, and launched, then ended, great sea voyages.`, 7,
`After rebels drove out the Mongols, a leader of peasant origin, Zhu Yuanzhang, founded the Ming dynasty in 1368 and ruled as the Hongwu emperor. The Ming restored Chinese-run government and the civil service examinations, and strengthened imperial power. In the early 1400s the Yongle emperor moved the main capital from Nanjing to Beijing, where the Forbidden City palace complex was completed around 1420.

Yongle also sponsored the treasure voyages of the admiral Zheng He, a Muslim court official. Between 1405 and 1433 seven large expeditions sailed to Southeast Asia, India, Arabia and East Africa with large ships and thousands of crew. They sought to display Ming prestige and to receive tribute and diplomatic recognition, not to found colonies. After the voyages ended, the court did not continue such expeditions. Historians debate the reasons, including cost and competing priorities such as defense on the northern frontier.

The Ming worked to keep out steppe raiders, and much of the brick-and-stone Great Wall that tourists visit today was built or rebuilt in this period. Meanwhile, trade grew. Silver, mined in Japan and the Americas, flowed into China in exchange for silk and porcelain, and the economy became more commercial. The silver supply, though, also made the economy depend on events overseas.

Worked example: a famine, heavy taxes and unpaid soldiers in the early 1600s fueled rebellions. In 1644 rebels led by Li Zicheng captured Beijing, and the last Ming emperor died by suicide. The Manchu then entered Beijing and began the Qing dynasty.`,
  [
    mc(L,1,1,`Who founded the Ming dynasty in 1368?`,[`Zhu Yuanzhang`,`Kublai Khan`,`Qin Shi Huang`,`Li Zicheng`],`He is known as the Hongwu emperor.`,`Zhu Yuanzhang, of peasant origin, founded the Ming.`),
    tf(L,2,1,`Zheng He's voyages were intended mainly to found colonies.`,1,`Think about display and diplomacy.`,`They aimed to show Ming prestige and gain tribute and recognition, not to found colonies.`),
    mc(L,3,2,`Which Ming emperor moved the main capital to Beijing?`,[`Yongle`,`Hongwu`,`Wu Zetian`,`Qianlong`],`He also sponsored the treasure voyages.`,`The Yongle emperor moved the capital to Beijing and sponsored Zheng He.`),
    tf(L,4,2,`Historians agree on a single reason the treasure voyages ended.`,1,`The lesson uses the word debate.`,`Reasons such as cost and frontier defense are debated, with no single agreed explanation.`),
    mc(L,5,3,`How did silver shape the Ming economy?`,[`Silver flowed in from Japan and the Americas, commercialising the economy but tying it to overseas events`,`Silver was banned from all trade, so the economy ran on barter and grain payments with no link to the world`,`China exported all of its silver abroad for free, which left the economy with almost no money of its own`,`Silver replaced the civil service examinations as the way officials were chosen for office in every province`],`Trade brought benefit and dependence.`,`Silver imports supported commercial growth but made China vulnerable to shifts in supply.`),
  ]);
}

// ---------------------------------------------------------------- L11
{
  const L = lid(11);
  add(11, `Qing China`, `Manchu rulers governed China from 1644 to 1912, expanding the empire to its greatest size and managing foreign trade tightly.`, 8,
`The Qing dynasty was founded by the Manchus, a people from northeast Asia who had organized themselves under leaders such as Nurhaci and who took Beijing in 1644 after the Ming fell. It took decades to complete the conquest. The Qing ordered Han Chinese men to wear their hair in the Manchu style, the queue, as a sign of submission, which many resisted strongly. At the same time the Qing kept the examination system and Confucian forms of government, and relied on Han officials.

Three long reigns shaped the dynasty's height: the Kangxi emperor (1661 to 1722), Yongzheng, and Qianlong (1735 to 1796). In this period the Qing expanded into Mongolia, Tibet and Xinjiang, doubling the empire's size to roughly what the modern Chinese state claims. The Qing ruled different peoples in different ways, using Manchu, Mongol, Tibetan and Chinese languages, and presenting the emperor in different roles for each.

The population grew sharply, aided by new crops from the Americas, such as sweet potatoes and maize. Trade with Europe was channeled from the late 1750s through the port of Guangzhou under rules known as the Canton System. In 1793 a British mission led by Lord Macartney asked for wider trade and diplomatic representation and was politely turned down.

Worked example: the Canton System limited foreign merchants to certain ports and licensed Chinese traders. Europeans saw it as a barrier, while the Qing saw it as a way to control commerce and security. These competing views set the stage for conflict in the nineteenth century.`,
  [
    mc(L,1,1,`Which people founded the Qing dynasty?`,[`The Manchus`,`The Jin`,`The Han`,`The Khmer`],`They came from northeast Asia.`,`The Manchus founded the Qing after taking Beijing in 1644.`),
    tf(L,2,1,`The Qing ended the examination system when they took power.`,1,`They kept much Chinese government.`,`The Qing kept the examination system and Confucian forms of government.`),
    mc(L,3,2,`What was the Canton System?`,[`Rules from the late 1750s channeling foreign trade through Guangzhou`,`A school curriculum of classical texts`,`A canal project that linked the Yangtze to the capital through new waterways`,`A military draft that required every Han family to supply a soldier to the banners`],`It controlled where foreigners traded.`,`It restricted foreign trade to Guangzhou under Qing supervision.`),
    tf(L,4,2,`Under the Qing, the empire expanded into Mongolia, Tibet and Xinjiang.`,0,`The empire reached its greatest size.`,`Expansion into these regions roughly doubled the empire's size.`),
    mc(L,5,3,`Why did the Canton System cause friction with Britain?`,[`Britain saw limits on trade as a barrier, while the Qing saw control as a security measure`,`China wanted no trade at all with any foreign country and closed every port to merchants`,`Britain refused to buy any Chinese goods, so no trade took place on either side`,`The system was invented by Britain to force Qing officials to open Chinese ports`],`Each side read the same rules differently.`,`The same restrictions meant different things to each side, which fed later conflict.`),
  ]);
}

// ---------------------------------------------------------------- L12
{
  const L = lid(12);
  add(12, `Mughal India`, `From 1526 the Mughals ruled much of South Asia, blending Persian, Central Asian and Indian traditions in a wealthy but contested empire.`, 8,
`In 1526 Babur, a ruler descended from Central Asian dynasties, defeated the sultan of Delhi, Ibrahim Lodi, at the Battle of Panipat and began the Mughal empire. His grandson Akbar, who reigned from 1556 to 1605, expanded and organized it. Akbar built a system of ranked officials who were paid and given duties by the state, and he pursued a policy of tolerance often called sulh-i kul, "peace with all." He abolished a special tax on non-Muslims, the jizya, in 1564 and welcomed scholars of different faiths to debate at his court.

The Mughals were great patrons of art and architecture. The Persian language was used at court, and painting blended Persian and Indian styles. Shah Jahan, who ruled from 1628 to 1658, commissioned the Taj Mahal, built from around 1632 to 1653 as a tomb for his wife Mumtaz Mahal. The empire was also enormously rich, drawing wealth from agriculture, cotton textiles and trade.

Aurangzeb, who reigned from 1658 to 1707, extended the empire to its greatest size. He reimposed the jizya in 1679, and his policies and long wars in the south are judged very differently by historians, some stressing religious intolerance and others stressing political and fiscal reasons.

After his death, regional rulers grew stronger. In 1739 the Persian ruler Nader Shah sacked Delhi, and Mughal power faded as European companies and regional states competed. The last emperor, Bahadur Shah II, was exiled by the British after the uprising of 1857.

Worked example: Akbar's rank system tied soldiers' pay to the state rather than to local lords, strengthening central control.`,
  [
    mc(L,1,1,`Who founded the Mughal empire in 1526?`,[`Babur`,`Akbar`,`Aurangzeb`,`Ashoka`],`He won the Battle of Panipat.`,`Babur defeated Ibrahim Lodi at Panipat and founded the Mughal empire.`),
    tf(L,2,1,`The Taj Mahal was built as a tomb for Mumtaz Mahal.`,0,`It was commissioned by Shah Jahan.`,`Shah Jahan had it built, from around 1632 to 1653, as a tomb for his wife.`),
    mc(L,3,2,`What did Akbar's sulh-i kul policy promote?`,[`Tolerance among religions`,`Banning Persian`,`One state religion`,`The end of taxes`],`Its name means peace with all.`,`The policy of sulh-i kul promoted tolerance among different faiths.`),
    tf(L,4,2,`Historians agree on a single explanation of Aurangzeb's policies.`,1,`Recall the debate.`,`Some stress religious intolerance, others political and fiscal reasons.`),
    mc(L,5,3,`Which event in 1739 showed Mughal weakness?`,[`Nader Shah's sack of Delhi`,`The Taj Mahal opening`,`Akbar's coronation`,`The Battle of Panipat`],`A Persian ruler attacked the capital.`,`Nader Shah's sack of Delhi in 1739 showed the empire's declining power.`),
  ]);
}

// ---------------------------------------------------------------- L13
{
  const L = lid(13);
  add(13, `Heian Japan`, `From 794 to 1185 the court at Kyoto produced a refined literary culture, including the world-famous Tale of Genji.`, 7,
`Japan's early states borrowed heavily from Tang China, including writing, Buddhism and models of government. In 794 Emperor Kanmu moved the capital to Heian-kyo, today's Kyoto, beginning the Heian period, which lasted until about 1185. The city stayed the imperial capital for over a thousand years.

In practice, real power often lay with aristocratic families rather than the emperor. The Fujiwara family dominated the court by marrying daughters into the imperial line and serving as regents, officials who governed on behalf of young or ceremonial emperors. Court life was governed by rank, etiquette and taste, and a small elite lived in Kyoto, while most people farmed in the provinces.

Heian culture produced remarkable literature. Japanese scribes developed kana, syllabic scripts that let people write the Japanese language directly rather than using only Chinese characters. Many leading authors were women of the court. Murasaki Shikibu wrote The Tale of Genji in the early eleventh century, a long story of court life that is often called the world's first novel, though scholars debate how best to define the term. Sei Shonagon wrote The Pillow Book, a collection of observations and lists. Both texts offer a rare view of an aristocratic woman's world.

Worked example: because these writings describe the life of the court, they tell us little about the many farmers and provincial warriors. A historian therefore must ask who is missing from a source. Over time, provincial warrior families grew powerful, and conflict among them ended the Heian period and led to the rise of the samurai government at Kamakura.`,
  [
    mc(L,1,1,`What was the capital of Japan in the Heian period?`,[`Heian-kyo (Kyoto)`,`Edo (modern Tokyo)`,`Nara, the older capital`,`Osaka, the port city`],`The period is named for it.`,`Emperor Kanmu moved the capital to Heian-kyo, now Kyoto, in 794.`),
    tf(L,2,1,`The Fujiwara family held power partly by serving as regents.`,0,`They also married into the imperial family.`,`The Fujiwara dominated the court through marriage ties and regencies.`),
    mc(L,3,2,`What was kana?`,[`Syllabic scripts that let Japanese be written directly`,`A style of curved sword carried by Heian court warriors on horseback`,`A Buddhist temple complex built on a mountain near the capital`,`A court rank given to nobles who passed the palace examinations`],`It helped literature in the Japanese language.`,`Kana scripts allowed writing in Japanese without relying only on Chinese characters.`),
    tf(L,4,2,`The Tale of Genji was written by Murasaki Shikibu in the early eleventh century.`,0,`The author was a court woman.`,`It is traditionally and widely attributed to her and dated to the early eleventh century.`),
    mc(L,5,3,`Why do Heian court writings give an incomplete picture of Japanese society?`,[`They mostly describe the aristocratic elite, not farmers and provincial warriors`,`They were written in a secret code that modern scholars have never managed to read`,`They describe only warfare, battles and sieges between provincial warrior bands`,`They were composed several centuries later by writers working under the Tokugawa`],`Ask who is missing from the sources.`,`Surviving literary texts reflect the court's elite, so other groups must be studied through other evidence.`),
  ]);
}

// ---------------------------------------------------------------- L14
{
  const L = lid(14);
  add(14, `Kamakura, the Samurai and the Warring Age`, `From 1185 warrior government, headed by shoguns, replaced court rule, and the country later fell into a century of civil war.`, 8,
`In the twelfth century the Taira and Minamoto warrior clans fought a series of wars, ending in 1185 with a Minamoto victory. Minamoto no Yoritomo then set up his government at Kamakura, far from Kyoto, and in 1192 received the title of shogun, a military commander. The emperor remained in Kyoto as a figure of prestige, but real political power lay with the shogun and his warrior vassals, the samurai. This arrangement, in which a shogun governed under the nominal authority of the emperor, lasted in various forms until 1868.

Samurai were bound to their lords by loyalty in exchange for land or rewards, and a code of conduct often called bushido later became prominent. Historians note that much of the romantic idea of bushido developed in later centuries, so claims about earlier samurai ideals deserve caution.

Kamakura government faced the Mongol invasions of 1274 and 1281. Japanese defenders and storms helped repel the fleets, and later tradition spoke of a "divine wind," kamikaze. But the war was costly, and since it brought no conquered land to hand out as rewards, many warriors felt unpaid, which weakened the shogunate. In 1333 it fell, and the Ashikaga family set up a new shogunate in Kyoto in 1336.

Central control weakened further. From the late fifteenth century, the Sengoku or "warring states" period saw regional lords called daimyo fight for land. In the later sixteenth century, Oda Nobunaga, Toyotomi Hideyoshi and Tokugawa Ieyasu in turn worked to reunify Japan. Worked example: Hideyoshi's survey of land and his sword hunt of 1588 sharpened the divide between warriors and farmers.`,
  [
    mc(L,1,1,`What title did Minamoto no Yoritomo receive in 1192?`,[`Shogun`,`Emperor`,`Daimyo`,`Regent`],`It means military commander.`,`Yoritomo was named shogun in 1192 and governed from Kamakura.`),
    tf(L,2,1,`In the shogunate system the emperor remained in Kyoto while the shogun held real power.`,0,`Think about who actually governed.`,`The emperor stayed as a figure of prestige while shoguns held political and military power.`),
    mc(L,3,2,`Why did the Mongol invasions weaken the Kamakura shogunate?`,[`Defense was costly and there was no conquered land to reward warriors`,`The Mongols conquered Kamakura and replaced the shogun with a Mongol governor`,`The emperor took control of the shogunate and dissolved all samurai households`,`Samurai were banned from owning land, so the warriors lost their loyalty`],`Consider rewards for loyal warriors.`,`Warriors who had fought in the defense received little reward, which damaged loyalty to the shogunate.`),
    tf(L,4,2,`The idea of bushido as a fixed ancient code is partly a later development.`,0,`Recall the caution about this term.`,`Much of the romantic bushido ideal developed in later centuries, so it should not be projected backward uncritically.`),
    mc(L,5,3,`What was the Sengoku period?`,[`A long age of warfare among regional lords called daimyo`,`A long era of unbroken peace and central rule under the Kamakura shoguns`,`The age when the Tale of Genji was written at the Heian court`,`The reign of the Meiji emperor, who restored direct imperial rule in 1868`],`The name means warring states.`,`From the late fifteenth century, daimyo fought for territory until reunification in the later sixteenth century.`),
  ]);
}

// ---------------------------------------------------------------- L15
{
  const L = lid(15);
  add(15, `Tokugawa Japan`, `For over two centuries after 1603, the Tokugawa shoguns kept peace and tight control while cities and popular culture flourished.`, 8,
`Tokugawa Ieyasu won the decisive Battle of Sekigahara in 1600 and was named shogun in 1603, establishing a government at Edo, now Tokyo. The Tokugawa shogunate lasted until 1868, a period of internal peace of more than two centuries. To keep control, the shogunate required daimyo to spend alternate years in Edo and to leave their families there, a system called sankin-kotai. This was costly for the lords and kept them from building armies, while roads, inns and trade grew to serve their travel.

Society was officially ranked in four groups: samurai, farmers, artisans and merchants. In practice, merchants became wealthy even though ranked low, and many peacetime samurai worked as administrators and were often short of money.

Foreign contact was restricted, a policy often called sakoku, "closed country," though scholars note that Japan was not wholly closed. Christianity was banned after fierce persecution, and trade with Europeans was limited to the Dutch at Nagasaki. Trade with China continued at Nagasaki, with Korea through the Tsushima domain, and with the Ryukyu Kingdom and the Ainu of the north through other channels.

Cities grew, and Edo became one of the world's largest. Townspeople enjoyed kabuki theatre, puppet plays, popular fiction, and ukiyo-e woodblock prints, which show the "floating world" of entertainment.

Worked example: sankin-kotai drained daimyo wealth into travel and Edo households, which strengthened the shogunate while stimulating the economy. In 1853 US Commodore Matthew Perry arrived with warships demanding open ports, and the shogunate's inability to resist the pressure contributed to its collapse in 1867 to 1868.`,
  [
    mc(L,1,1,`Where was the Tokugawa government based?`,[`Edo`,`Kyoto`,`Kamakura`,`Nagasaki`],`Today it is called Tokyo.`,`The Tokugawa shoguns governed from Edo, now Tokyo.`),
    tf(L,2,1,`Under sankin-kotai, daimyo had to spend alternating periods in Edo.`,0,`This helped the shogunate control the lords.`,`The system required alternate-year residence and family hostages in Edo.`),
    mc(L,3,2,`Which statement best describes sakoku?`,[`Foreign contact was restricted but not entirely cut off`,`Japan had no contact with any foreigner and no knowledge of the outside world`,`Japan opened all of its ports to European merchants and missionaries`,`Japan traded only with the United States through a single port`],`Recall Nagasaki, Tsushima and the Ryukyu Kingdom.`,`Japan limited foreign trade but kept channels with the Dutch, Chinese, Koreans, Ryukyu and Ainu.`),
    tf(L,4,2,`Merchants were officially ranked at the top of Tokugawa society.`,1,`They were officially ranked last of the four groups.`,`Merchants ranked lowest officially, though many became wealthy.`),
    mc(L,5,3,`What arrived in 1853 that pressured Japan to open its ports?`,[`US warships under Commodore Perry`,`A Mongol fleet sent from Yuan China`,`Portuguese missionaries arriving at Nagasaki`,`A Russian army marching across Manchuria`],`The visitor was American.`,`Perry's ships demanded open ports and exposed the shogunate's weakness.`),
  ]);
}

// ---------------------------------------------------------------- L16
{
  const L = lid(16);
  add(16, `Korea Through the Joseon Dynasty`, `From the Three Kingdoms to Joseon, Korea built a distinct state, a scholarly bureaucracy and its own alphabet.`, 8,
`Early Korea was divided among three kingdoms: Goguryeo in the north, Baekje in the southwest, and Silla in the southeast. They fought each other and borrowed from China, including Buddhism and writing. In 668, Silla, allied with Tang China, defeated Goguryeo, and went on to control most of the peninsula, ending the Three Kingdoms period.

Silla was succeeded by the Goryeo dynasty, founded in 918 and lasting until 1392. The word Korea comes from the name Goryeo. Goryeo was a Buddhist state famed for celadon pottery, and for printing; a Buddhist text called the Jikji, printed in 1377 with movable metal type, is the oldest surviving book printed this way. Goryeo was invaded by the Mongols in the thirteenth century and became a subordinate ally.

In 1392 General Yi Seonggye founded the Joseon dynasty, which lasted until 1910. Joseon adopted Neo-Confucianism as its guiding ideology and relied on civil examinations to select scholar-officials. Society was hierarchical, led by an elite called yangban, and it also included commoners and a class of enslaved people.

King Sejong, who reigned from 1418 to 1450, supported science and scholarship, and his scholars created the Korean alphabet, hangul, announced in 1446. It was designed to be easy to learn, so more people could read and write.

Worked example: from 1592 to 1598 Japan under Toyotomi Hideyoshi invaded Korea in the Imjin War. Korea, with help from Ming China and naval victories by Admiral Yi Sun-sin, withstood the invasions, though with heavy losses. Later Joseon pursued a policy of limited foreign contact, until pressure from Japan and the Western powers in the nineteenth century.`,
  [
    mc(L,1,1,`Which Korean kingdom, allied with Tang China, unified most of the peninsula in 668?`,[`Silla`,`Goguryeo`,`Baekje`,`Joseon`],`It was in the southeast.`,`Silla allied with the Tang to defeat Goguryeo and control most of the peninsula.`),
    tf(L,2,1,`The name Korea comes from Goryeo.`,0,`Goryeo ruled from 918.`,`The word Korea derives from the name of the Goryeo dynasty.`),
    mc(L,3,2,`What is hangul?`,[`The Korean alphabet announced in 1446`,`A civil service examination used by Joseon officials`,`A kind of glazed celadon pottery made at Goryeo kilns`,`A title given by the Mongols to Korean royal princes`],`King Sejong's scholars created it.`,`Hangul was created under King Sejong and designed to be easy to learn.`),
    tf(L,4,2,`The Jikji, printed in 1377, is the oldest surviving book printed with movable metal type.`,0,`It is a Goryeo Buddhist text.`,`The Jikji is the oldest surviving book known to be printed this way.`),
    mc(L,5,3,`What happened during the Imjin War of 1592 to 1598?`,[`Japan invaded Korea and was resisted with Ming help and naval victories`,`Korea invaded Japan and was driven back by Japanese naval and land forces`,`The Mongols invaded Joseon and were stopped at the Yalu River by Korean armies`,`The Tang conquered Silla and made the peninsula part of Chinese territory`],`Think about Hideyoshi.`,`Hideyoshi's invasions were resisted by Korean forces, Admiral Yi Sun-sin's navy and Ming China.`),
  ]);
}

// ---------------------------------------------------------------- L17
{
  const L = lid(17);
  add(17, `Khmer and Srivijaya: Water, Temples and Sea Trade`, `Two early Southeast Asian powers built wealth from rice-and-water engineering and from control of sea routes.`, 7,
`The Khmer Empire flourished in what is now Cambodia from about the ninth to the early fifteenth century. It is traditionally dated from Jayavarman II, who proclaimed himself ruler around 802. Its heart was Angkor, a vast landscape of temples, canals and reservoirs called barays. The Khmer used this water engineering to store monsoon rain and support rice farming, though scholars debate how central it was to Angkor's economy and its eventual decline.

Angkor Wat was built in the early twelfth century under Suryavarman II as a Hindu temple to Vishnu, and is among the largest religious monuments in the world. In the late twelfth century Jayavarman VII, a Buddhist king, built the Bayon temple with its many large carved faces, and a network of hospitals and rest houses. Angkor ceased to be the main capital in the fifteenth century, and the causes are debated, including war with neighboring Ayutthaya, climate shifts and changing trade.

Srivijaya was a different kind of power. Based on Sumatra, around Palembang, it flourished from roughly the seventh to the thirteenth century as a maritime network rather than a land empire. It controlled the straits through which ships passed between India and China, and drew wealth from trade and fees. It was also a center of Buddhist learning; the Chinese pilgrim Yijing stayed there in the late seventh century to study and copy texts.

Worked example: Srivijaya shows that power could rest on controlling a sea route, which leaves fewer monuments than a temple city, and so is harder for historians to trace.`,
  [
    mc(L,1,1,`What were the barays at Angkor?`,[`Large reservoirs`,`Royal tombs`,`Warships`,`Temples only`],`They related to water.`,`Barays were large reservoirs used to store water.`),
    tf(L,2,1,`Angkor Wat was built as a Hindu temple dedicated to Vishnu.`,0,`It dates from the twelfth century.`,`It was built under Suryavarman II as a temple to Vishnu.`),
    mc(L,3,2,`What was the main basis of Srivijaya's power?`,[`Control of sea trade routes through the straits`,`A huge land army that conquered the mainland of Southeast Asia`,`Silver mines in Japan that financed its fleet and its temples`,`The overland Silk Road across the Central Asian deserts`],`Think about ships moving between India and China.`,`It was a maritime network that profited from shipping and trade.`),
    tf(L,4,2,`Scholars agree on a single cause for Angkor's decline.`,1,`The lesson lists several debated causes.`,`War, climate and changing trade are among causes debated, with no single agreed answer.`),
    mc(L,5,3,`Why is Srivijaya harder for historians to trace than Angkor?`,[`Sea-based power left fewer large monuments`,`It never existed, and the stories are later legends`,`Angkor's kings burned its records after conquering it`,`It was built in the nineteenth century by colonial engineers`],`Compare what each power left behind.`,`A maritime network leaves less monumental evidence than a temple city does.`),
  ]);
}

// ---------------------------------------------------------------- L18
{
  const L = lid(18);
  add(18, `Vietnam, Siam and Majapahit`, `Three more Southeast Asian states show different paths: Vietnam's long struggle against Chinese rule, Siam's survival and Majapahit's island trade.`, 8,
`Vietnam was under Chinese rule for about a thousand years, from 111 BCE until the tenth century. During this time it adopted many Chinese institutions, yet people kept their own language and identity, and rebelled repeatedly. The Trung sisters led an uprising in 40 CE and are remembered as heroines. In 938 Ngo Quyen defeated a Chinese fleet at the Bach Dang River, which is generally seen as the start of lasting independence. Later dynasties repelled Mongol invasions in the thirteenth century.

Siam, the old name of Thailand, emerged from Tai-speaking peoples who moved south. The kingdom of Sukhothai arose in the thirteenth century, and Ayutthaya, founded in 1351, became a rich trading capital. Ayutthaya was destroyed by Burmese forces in 1767. Within a few years the general Taksin restored a Siamese state, and from 1782 the Chakri dynasty ruled from Bangkok. Siam later avoided being colonized by a Western power, through diplomacy and reform, though it lost territory.

Majapahit was a Hindu-Buddhist kingdom on the island of Java, founded around 1293. Its height came in the fourteenth century under King Hayam Wuruk and his minister Gajah Mada. A poem called the Nagarakretagama, completed in 1365, describes the court and lists regions tied to it. Historians debate how far Majapahit's real control stretched, since it may have been more a web of tributary relations than a tight empire. It declined around the end of the fifteenth century.

Worked example: reading a court poem like the Nagarakretagama requires asking whether its list of places shows real rule or the court's own claims.`,
  [
    mc(L,1,1,`How long was Vietnam under Chinese rule before the tenth century?`,[`About a thousand years`,`About ten years`,`About fifty years`,`It was never under Chinese rule`],`Counting from 111 BCE.`,`Chinese rule lasted roughly a thousand years until the tenth century.`),
    tf(L,2,1,`Ayutthaya was founded in 1351 and became a major trading capital.`,0,`It was the capital of Siam for centuries.`,`Ayutthaya, founded in 1351, grew into a rich trading capital until 1767.`),
    mc(L,3,2,`What battle in 938 is seen as the start of lasting Vietnamese independence?`,[`Bach Dang River`,`Plassey in Bengal`,`Sekigahara in Japan`,`Panipat in northern India`],`Ngo Quyen won it.`,`Ngo Quyen's victory at the Bach Dang River in 938 is generally seen as the turning point.`),
    tf(L,4,2,`Majapahit was a Hindu-Buddhist kingdom based on Java.`,0,`Think of Hayam Wuruk.`,`Majapahit was centered in eastern Java and combined Hindu and Buddhist traditions.`),
    mc(L,5,3,`Why should the Nagarakretagama's list of regions be used carefully?`,[`It may show the court's claims rather than real control`,`It was written by a foreign enemy hoping to belittle the kingdom`,`It lists no places at all, only the names of kings and priests`,`It was composed in the twentieth century by modern scholars`],`A court wrote about its own power.`,`A court poem may exaggerate the reach of its ruler, so its claims need checking against other evidence.`),
  ]);
}

// ---------------------------------------------------------------- L19
{
  const L = lid(19);
  add(19, `European Trade and Colonialism in Asia`, `From 1498 European sea powers entered Asian trade, first as traders, and later as rulers of large territories.`, 8,
`In 1498 the Portuguese navigator Vasco da Gama reached Calicut on India's southwest coast after sailing around Africa. Europeans had long wanted Asian spices, textiles and porcelain, and this sea route allowed them to buy directly. The Portuguese seized Goa in 1510 and Malacca in 1511, building a chain of fortified ports rather than large territories. The Spanish, arriving from the Americas, founded Manila in 1565, which linked Asia to Mexico by the annual galleon trade carrying Asian goods and American silver.

In the early seventeenth century the English and Dutch founded joint-stock trading companies: the English East India Company in 1600 and the Dutch United East India Company, the VOC, in 1602. The VOC built its base at Batavia, now Jakarta, in 1619 and fought to control the spice trade in what is now Indonesia, at a heavy cost to local people. For a long time Europeans were one group of traders among many and relied on local rulers' permission.

Power shifted unevenly. In India, after the British East India Company's victory at Plassey in 1757, it began to collect revenue and rule large regions, a change from trader to ruler. Elsewhere, colonial rule grew in the nineteenth century: the Dutch consolidated control in Indonesia, the British in Burma and Malaya, and the French in Indochina. Siam avoided colonization, in part by serving as a buffer between British and French areas.

Worked example: a Southeast Asian ruler in the 1600s could play Portuguese, Dutch and English agents against one another, but by the 1800s superior steamships, weapons and financial power made that harder.

Colonial rule brought new ports and railways, but also forced labor, heavy taxes and resistance movements.`,
  [
    mc(L,1,1,`Who reached Calicut in 1498 by sailing around Africa?`,[`Vasco da Gama`,`Marco Polo`,`Zheng He`,`Matthew Perry`],`He was Portuguese.`,`Da Gama reached Calicut in 1498.`),
    tf(L,2,1,`Early European powers in Asia often built fortified ports rather than ruling large territories.`,0,`Think of Goa and Malacca.`,`The Portuguese relied on fortified ports and trade networks.`),
    mc(L,3,2,`What was the VOC?`,[`The Dutch United East India Company`,`A Japanese clan that governed Nagasaki harbor`,`A Mughal cavalry army raised in Bengal`,`A Chinese board that ran the civil exams`],`It was founded in 1602.`,`The VOC was a Dutch trading company that built a base at Batavia.`),
    tf(L,4,2,`Siam became a European colony in the nineteenth century.`,1,`Recall the buffer idea.`,`Siam avoided colonization, though it lost some territory.`),
    mc(L,5,3,`What change followed the East India Company's victory at Plassey in 1757?`,[`The Company began collecting revenue and ruling large regions`,`The Company left India after the defeat and handed power back to the Mughals`,`India became independent immediately after the battle`,`The Company was dissolved and its officials returned to Britain`],`It shifted from trading to governing.`,`After Plassey, the Company moved from being mainly a trader to ruling territory.`),
  ]);
}

// ---------------------------------------------------------------- L20
{
  const L = lid(20);
  add(20, `The Opium Wars`, `Disputes over trade and the opium drug trade led Britain to war with Qing China, and to treaties China saw as unequal.`, 8,
`By the early nineteenth century British demand for Chinese tea was large, but China wanted little that Britain made, so silver flowed to China. British merchants found a product Chinese buyers would take: opium, grown in British-ruled India and smuggled into China. By the 1830s addiction was widespread and the silver drain worried Qing officials. Opium was banned in China, but the trade continued.

In 1839 the emperor sent the official Lin Zexu to Guangzhou, where he confiscated and destroyed thousands of chests of opium held by foreign merchants. Britain, using this action as grounds, sent a naval force, and the First Opium War (1839 to 1842) followed. Britain's steam-powered warships and modern weapons defeated Qing forces. In the Treaty of Nanjing in 1842, China ceded Hong Kong Island, opened five ports to trade, and paid an indemnity. Later treaties added extraterritoriality, which meant foreigners were tried by their own consuls, and other privileges. Chinese people later called these "unequal treaties."

A Second Opium War, also called the Arrow War, was fought from 1856 to 1860 by Britain and France. It ended with more ports opened and foreign legations allowed in Beijing, and in 1860 British and French forces burned the Summer Palace outside Beijing.

Historians note two views. British officials at the time argued they were defending free trade and access, while Chinese officials stressed the harm of the drug trade and the violation of sovereignty. Worked example: the destruction of opium chests shows a government trying to enforce its own law, which Britain treated as an insult.`,
  [
    mc(L,1,1,`What did British merchants smuggle into China from India?`,[`Opium`,`Porcelain`,`Silk fabrics`,`Tea leaves`],`It caused widespread addiction.`,`Opium from British-ruled India was smuggled into China.`),
    tf(L,2,1,`Lin Zexu destroyed opium held by foreign merchants at Guangzhou in 1839.`,0,`He was a Qing official.`,`Lin Zexu confiscated and destroyed a large quantity of opium.`),
    mc(L,3,2,`Which territory did China cede to Britain in the Treaty of Nanjing?`,[`Hong Kong Island`,`Taiwan and Penghu`,`Beijing and Tianjin`,`Southern Tibet`],`It remained British for over a century.`,`The 1842 treaty ceded Hong Kong Island and opened five ports.`),
    tf(L,4,2,`Extraterritoriality meant foreigners in China were tried by their own consuls.`,0,`It was one of the privileges granted.`,`Extraterritoriality placed foreigners outside Chinese courts.`),
    mc(L,5,3,`Why did Chinese people call the treaties "unequal"?`,[`They were forced on China after military defeat and gave foreigners special privileges`,`They gave China all the special privileges, while foreigners had to obey Chinese law`,`They were signed freely by two equal partners after fair talks`,`They banned all trade with Britain and closed every Chinese port to foreigners`],`Think about how the terms were obtained.`,`The terms were imposed after war and gave one side privileges not given in return.`),
  ]);
}

// ---------------------------------------------------------------- L21
{
  const L = lid(21);
  add(21, `The Taiping Rebellion and the Fall of the Qing`, `A huge civil war and mounting foreign pressure weakened the Qing, which fell in 1912.`, 8,
`In the mid-nineteenth century the Qing faced economic hardship, floods and defeat by foreign powers. In this setting Hong Xiuquan, a man who had repeatedly failed the civil service examinations, claimed to have visions and came to believe he was the younger brother of Jesus. He formed a movement that, in 1851, proclaimed the Taiping Heavenly Kingdom. His followers, drawing on Christian teachings as Hong understood them, attacked Qing rule, opium and some social customs, and called for shared land and greater roles for women. In 1853 they captured Nanjing and made it their capital.

The Taiping Rebellion was among the deadliest wars in history. It lasted until 1864, when Qing forces, aided by regional armies led by officials such as Zeng Guofan, retook Nanjing. Estimates of the dead run from around twenty million and upward, which is uncertain because records are poor. Many were civilians, killed by fighting, massacres and famine.

The Qing survived but were weakened. Officials launched reforms called self-strengthening, seeking Western technology for arms, ships and factories. Japan's defeat of China in the Sino-Japanese War of 1894 to 1895 showed the limits of this effort. In 1899 to 1901 the Boxer movement attacked foreigners and Christians and was crushed by a foreign alliance.

Reformers and revolutionaries, including Sun Yat-sen, urged deeper change. In October 1911 an uprising at Wuchang began a revolution, and in February 1912 the last emperor, the child Puyi, abdicated, ending the imperial system after more than two thousand years.

Worked example: Zeng Guofan's regional army shows how the Qing relied on local forces, which also shifted power away from the center.`,
  [
    mc(L,1,1,`Who led the Taiping Rebellion?`,[`Hong Xiuquan`,`Zeng Guofan`,`Lin Zexu, the commissioner`,`Sun Yat-sen, later president`],`He believed he was the younger brother of Jesus.`,`Hong Xiuquan founded the Taiping Heavenly Kingdom.`),
    tf(L,2,1,`The Taiping captured Nanjing in 1853 and made it their capital.`,0,`It was in central China.`,`They took Nanjing in 1853 and ruled from there until 1864.`),
    mc(L,3,2,`Which official led a regional army that helped defeat the Taiping?`,[`Zeng Guofan`,`Nurhaci, the Jurchen chief`,`Yi Sun-sin, the admiral`,`Kangxi, the emperor`],`He was loyal to the Qing.`,`Zeng Guofan led regional armies that helped retake Nanjing.`),
    tf(L,4,2,`Estimates of Taiping deaths are precise and agreed on.`,1,`The lesson says records are poor.`,`Records are poor, so estimates vary widely, from around twenty million upward.`),
    mc(L,5,3,`What ended in February 1912?`,[`The imperial system, when Puyi abdicated`,`The Taiping rebellion, after the fall of Nanjing`,`The First Opium War, with the Treaty of Nanjing`,`The Mongol Yuan dynasty, after the Red Turbans`],`The revolution began at Wuchang in 1911.`,`Puyi's abdication ended over two thousand years of imperial rule.`),
  ]);
}

// ---------------------------------------------------------------- L22
{
  const L = lid(22);
  add(22, `Meiji Japan`, `After 1868 Japan rapidly rebuilt its state, economy and army, and became an imperial power.`, 8,
`In 1853 and 1854 Commodore Perry's ships forced Japan to sign the Treaty of Kanagawa, opening ports to American ships. Further unequal treaties followed, with Western powers. Many samurai and lords, angry at the shogunate's weakness, joined forces to overthrow it. In 1868 they restored direct rule in the name of the young Emperor Meiji, an event called the Meiji Restoration.

The new government moved fast. In 1871 it abolished the old domains and replaced them with prefectures. It ended the samurai's special status and, in 1873, introduced a conscript army of commoners. It built railways, telegraphs, schools and factories, sent missions abroad, such as the Iwakura Mission of 1871 to 1873, and hired foreign advisors. Many people suffered in the process, and there were rebellions, including the Satsuma Rebellion of 1877 by former samurai.

In 1889 Japan adopted the Meiji Constitution, which created an elected lower house, the Diet, but left great authority with the emperor and the military. Japan revised the unequal treaties by the early twentieth century. It won the Sino-Japanese War of 1894 to 1895, gaining Taiwan, and the Russo-Japanese War of 1904 to 1905. In 1910 it annexed Korea, which it ruled until 1945. Korean and other subject peoples experienced this as harsh colonial rule.

Worked example: the abolition of samurai privileges shows a government reshaping society from above, benefiting some and harming others. Japan's path, from threatened country to empire, is often cited as an example of fast modernization, but it also set the stage for aggression.`,
  [
    mc(L,1,1,`What was the Meiji Restoration of 1868?`,[`The return of direct rule in the emperor's name and the end of the shogunate`,`A Mongol invasion that ended the shogunate and put a khan in Edo`,`A trade treaty with Britain that opened Japanese ports to foreign merchants`,`The founding of Edo as a new capital by the first Tokugawa shogun`],`The shogunate ended.`,`In 1868 the shogunate was overthrown and government restored in the Meiji emperor's name.`),
    tf(L,2,1,`The Meiji government introduced conscription of commoners in 1873.`,0,`It ended the samurai monopoly on arms.`,`A conscript army replaced the old samurai class as the basis of the military.`),
    mc(L,3,2,`What did Japan gain from the Sino-Japanese War of 1894 to 1895?`,[`Taiwan`,`Hong Kong`,`Manchuria permanently`,`Vietnam`],`An island off China's coast.`,`Japan gained Taiwan.`),
    tf(L,4,2,`The Meiji Constitution of 1889 gave all power to an elected Diet and none to the emperor.`,1,`The emperor and military kept great authority.`,`It created an elected lower house but left great authority with the emperor and military.`),
    mc(L,5,3,`How is Meiji modernization best described?`,[`Rapid change that benefited some groups and harmed others, and led toward imperial expansion`,`A smooth change that cost no one anything and left every group better off in every way`,`A policy of staying closed to the world and rejecting all foreign technology for decades`,`A return to rule by samurai lords and the old domain system of the Tokugawa`],`Consider winners and losers.`,`Modernization strengthened the state but caused hardship, and Japan's empire harmed subject peoples such as Koreans.`),
  ]);
}

// ---------------------------------------------------------------- L23
{
  const L = lid(23);
  add(23, `The British Raj`, `After 1858 the British Crown ruled India directly, with railways and institutions alongside economic strain and growing nationalism.`, 8,
`For about a century the British East India Company expanded its control over India, using trade, alliances and war. In 1857 a mutiny by Indian soldiers in the Company's army, beginning at Meerut, grew into a wider uprising across northern India. British sources long called it the Sepoy Mutiny, while many Indians call it a first war of independence; historians describe it as a complex revolt with military, political and social causes. It was suppressed with great violence on both sides.

In 1858 the British Parliament ended Company rule and the Crown took direct control, beginning what is called the British Raj. In 1876 Queen Victoria was given the title Empress of India. A colonial administration, including the Indian Civil Service, governed a vast and diverse land, together with hundreds of princely states ruled by Indian princes under British oversight.

The Raj left mixed legacies. Railways, telegraphs, ports, English-language education and a legal system were built, but largely to serve imperial and commercial interests. Historians debate the economic effects. Many argue that policies drained wealth and hurt traditional industries like handloom textiles, while others emphasize that the picture is more complicated. Severe famines occurred, and critics argue that colonial policies made them worse.

Indian political life also grew. The Indian National Congress was founded in 1885, at first seeking reform within the system. The Muslim League formed in 1906. British partition of Bengal in 1905 sparked wide protests.

Worked example: a railway line built to carry cotton to a port shows both a real technological change and the purpose behind it. Over time demands moved from reform toward self-government.`,
  [
    mc(L,1,1,`What happened in 1858?`,[`The Crown took direct control of India from the East India Company`,`India became independent of Britain after the failed uprising of 1857`,`The Mughal empire was founded after Babur defeated the Lodi sultan`,`The Taj Mahal was completed under Shah Jahan beside the Yamuna`],`The Company's rule ended.`,`After the 1857 uprising Parliament ended Company rule, beginning the Raj.`),
    tf(L,2,1,`The Indian National Congress was founded in 1885.`,0,`It started as a reform-seeking body.`,`Congress was founded in 1885 and later became the leading nationalist party.`),
    mc(L,3,2,`Why do historians describe the 1857 uprising with different names?`,[`Different groups interpret its causes and meaning differently`,`It took place across several different centuries in several countries`,`No one remembers it, so no name has ever been agreed`,`It was fought in Japan and Korea, so names differ by language`],`Names reflect viewpoints.`,`British sources called it a mutiny, while many Indians call it a first war of independence.`),
    tf(L,4,2,`Historians agree that British rule affected the Indian economy in exactly one way.`,1,`The lesson says effects are debated.`,`Economic effects are debated, with arguments about drain of wealth, trade, and industry.`),
    mc(L,5,3,`What does the example of the railway show?`,[`A real technological change that was also built to serve imperial and commercial interests`,`A system built only to help Indian farmers move crops to market at fair prices`,`That the British built no infrastructure at all in India during their rule`,`That railways did not exist in India until after independence in 1947`],`Consider who the railways were built for.`,`Infrastructure had real benefits but its design reflected colonial priorities.`),
  ]);
}

// ---------------------------------------------------------------- L24
{
  const L = lid(24);
  add(24, `Independence and Partition of India`, `India and Pakistan became independent in August 1947 amid a partition that uprooted millions and caused great violence.`, 8,
`After the First World War, Indian nationalism became a mass movement. Mohandas Gandhi, returning from South Africa, led campaigns of nonviolent resistance, or satyagraha, including the non-cooperation movement from 1920 and the Salt March of 1930, a march to the sea to make salt in defiance of the government monopoly. In 1942, with Britain at war, Congress called for the British to Quit India, and its leaders were jailed.

At the same time, a deep disagreement grew over how a free India would be organized. The Muslim League, led by Muhammad Ali Jinnah, argued that Muslims needed protection as a minority and, by 1940, called for separate Muslim-majority states. Congress, with leaders such as Jawaharlal Nehru, favored a single secular India. Violence between communities broke out in 1946, notably in Calcutta.

Exhausted by war, Britain decided to leave. In June 1947 the last viceroy, Lord Mountbatten, announced a plan to divide British India into two countries. India and Pakistan became independent on 15 and 14 August 1947 respectively. The new borders, drawn in haste by a commission under Cyril Radcliffe, split the provinces of Punjab and Bengal.

The result was one of the largest forced migrations in history. Estimates say that between ten and fifteen million people crossed the new borders, and that deaths ranged from several hundred thousand to about two million, though no one knows exactly. In 1948 Gandhi was assassinated by a Hindu nationalist who opposed his conciliatory stance. Worked example: families in Punjab left homes of generations, showing how a political line could uproot ordinary lives.`,
  [
    mc(L,1,1,`What did Gandhi's Salt March of 1930 protest?`,[`The government monopoly on salt`,`A heavy tax on all imported tea`,`The partition of Bengal in 1905`,`The outbreak of war in Europe`],`It was a march to the sea.`,`The march challenged the British salt monopoly through nonviolent action.`),
    tf(L,2,1,`India and Pakistan became independent in August 1947.`,0,`The date was 14 and 15 August.`,`Pakistan became independent on 14 August and India on 15 August 1947.`),
    mc(L,3,2,`Who led the Muslim League in the 1940s?`,[`Muhammad Ali Jinnah`,`Vallabhbhai Patel`,`Lord Louis Mountbatten`,`Sir Cyril Radcliffe`],`He is associated with the demand for Pakistan.`,`Jinnah led the League in demanding separate Muslim-majority states.`),
    tf(L,4,2,`Exact numbers of Partition deaths are known with certainty.`,1,`The lesson gives a range.`,`Estimates range from several hundred thousand to about two million.`),
    mc(L,5,3,`Why was the Radcliffe boundary so painful for ordinary people?`,[`It split provinces like Punjab and Bengal and left millions on the wrong side of the line`,`It left every border unchanged, so no families were affected by the new line`,`It was drawn after years of careful consultation with villagers on both sides`,`It created no refugees, because people were never asked to move at all`],`Consider how it was drawn.`,`Borders drawn quickly through mixed communities caused mass migration and violence.`),
  ]);
}

// ---------------------------------------------------------------- L25
{
  const L = lid(25);
  add(25, `Imperial Japan and the War in Asia`, `From 1931 to 1945 Japan's expansion brought war, occupation and atrocities across Asia, ending after atomic bombings and surrender.`, 8,
`In the 1930s Japan, hit by the Great Depression and influenced by militarist officers, turned toward expansion. In September 1931 army officers staged an explosion on a railway near Mukden and used it as a pretext to seize Manchuria; in 1932 Japan set up a puppet state, Manchukuo. In July 1937 fighting near Beijing grew into a full-scale war with China. In December 1937 Japanese forces took Nanjing and killed large numbers of civilians and prisoners and committed widespread rape. Estimates of the dead vary widely, and the number remains debated, while the events themselves are firmly documented.

Japan joined Germany and Italy in 1940 and, on 7 December 1941, attacked Pearl Harbor and, at nearly the same time, British, Dutch and American territories in Southeast Asia. Within months Japan occupied the Philippines, Malaya, Singapore, the Dutch East Indies and Burma. Japanese leaders spoke of a "Greater East Asia Co-Prosperity Sphere," but in practice the occupation was often harsh. Millions of civilians suffered from forced labor, requisition of food and violence. Women from Korea, China and other lands were forced into military brothels, the so-called comfort women. Allied prisoners were mistreated, notably on the Burma railway.

Some Asians initially welcomed Japan's challenge to European colonial rule, but many came to resent it, and resistance movements grew.

Allied forces gradually pushed Japan back. In August 1945 the United States dropped atomic bombs on Hiroshima, on the 6th, and Nagasaki, on the 9th, and the Soviet Union declared war on Japan. On 15 August Emperor Hirohito announced surrender, signed formally on 2 September.

Worked example: memory of this war remains contested in the region today, which shows why different countries' school histories can differ.`,
  [
    mc(L,1,1,`What did Japan set up in Manchuria in 1932?`,[`A puppet state called Manchukuo`,`A democratic republic with elected leaders`,`A British colony run from Hong Kong`,`A Chinese capital moved to Harbin`],`The state was controlled by Japan.`,`Japan created Manchukuo as a puppet state after seizing Manchuria.`),
    tf(L,2,1,`Atomic bombs were dropped on Hiroshima and Nagasaki in August 1945.`,0,`The war ended soon after.`,`Hiroshima was bombed on 6 August and Nagasaki on 9 August 1945.`),
    mc(L,3,2,`Which statement about the Nanjing atrocities is accurate?`,[`The events are firmly documented, though the number of dead is debated`,`Almost nothing is known about them, since no records or witnesses survive`,`They happened in 1950, during the Korean War, not in the 1930s`,`They were committed by Mongol armies during the thirteenth century`],`Distinguish events from numbers.`,`Historians agree the massacre occurred, while estimates of the death toll vary.`),
    tf(L,4,2,`Japan's occupation of Southeast Asia was uniformly welcomed.`,1,`Many people came to resent it.`,`Some initially welcomed Japan's challenge to colonial rule, but the occupation was often harsh and resented.`),
    mc(L,5,3,`Why do different countries' school histories of the war sometimes differ?`,[`Memory and responsibility remain contested, with different national experiences`,`Because the war never happened, and each country invents its own story`,`Because all countries teach exactly the same account`,`Because historians are forbidden everywhere from studying the war at all`],`Think of memory and politics.`,`Differences in national experience and politics keep the memory of the war contested.`),
  ]);
}

// ---------------------------------------------------------------- L26
{
  const L = lid(26);
  add(26, `Revolution and the People's Republic of China`, `From the 1911 revolution through civil war to the PRC in 1949, and its turbulent early decades.`, 8,
`After the Qing fell in 1912, China became a republic, but central authority was weak. Regional military leaders, known as warlords, dominated much of the country. In 1919 students protested against the peace terms after the First World War, which gave German holdings in Shandong to Japan, and the May Fourth Movement stirred new debate about modernizing Chinese society. In 1921 the Chinese Communist Party was founded. The Nationalist Party, the Kuomintang, led after 1925 by Chiang Kai-shek, reunified much of the country in the late 1920s, then turned against the communists.

Communists retreated on the Long March of 1934 to 1935, during which Mao Zedong emerged as their leader. The two sides fought Japan, mostly in separate ways, after 1937, then resumed civil war. In 1949 the communists won, Chiang's government withdrew to Taiwan, and on 1 October 1949 Mao proclaimed the People's Republic of China.

The early PRC redistributed land and brought national unity, but also used violent campaigns against those labeled enemies. The Great Leap Forward of 1958 to 1962 aimed to speed industrialization and collectivize farming, but it led to a catastrophic famine. Estimates of deaths vary widely, from around fifteen million to over forty million, and scholars debate the figures. In 1966 Mao launched the Cultural Revolution, which lasted until his death in 1976 and brought persecution, destruction of cultural property, and social upheaval.

In 1978 Deng Xiaoping began economic reforms that opened China to markets and foreign trade.

Worked example: the same event, such as the Great Leap Forward, is described differently by official histories and independent scholars, so historians weigh sources carefully.`,
  [
    mc(L,1,1,`When was the People's Republic of China proclaimed?`,[`1 October 1949`,`1 January 1912`,`15 August 1945`,`4 June 1989`],`Mao proclaimed it after the civil war.`,`Mao proclaimed the PRC on 1 October 1949.`),
    tf(L,2,1,`Chiang Kai-shek's government withdrew to Taiwan after the communist victory.`,0,`It lost the civil war.`,`Chiang's Nationalist government moved to Taiwan in 1949.`),
    mc(L,3,2,`What was the Long March?`,[`A retreat by communist forces in 1934 to 1935`,`A march by Qing soldiers to Beijing in 1900`,`A Mongol conquest of the Jin dynasty in 1215`,`A trade route used to carry tea to Tibet`],`Mao emerged as leader during it.`,`The Long March was a communist retreat during which Mao rose to leadership.`),
    tf(L,4,2,`Scholars agree on the exact number of deaths in the Great Leap Forward famine.`,1,`Estimates range widely.`,`Estimates range from around fifteen million to over forty million.`),
    mc(L,5,3,`What did Deng Xiaoping begin in 1978?`,[`Economic reforms opening China to markets and foreign trade`,`The Cultural Revolution, a mass political movement from 1966`,`The Long March, a retreat of communist forces in the 1930s`,`The Great Leap Forward, a rapid industrial campaign of the late 1950s`],`He followed Mao.`,`Deng's reforms started China's market-oriented growth.`),
  ]);
}

// ---------------------------------------------------------------- L27
{
  const L = lid(27);
  add(27, `The Korean War`, `A Cold War conflict from 1950 to 1953 that left Korea divided and is formally unresolved.`, 7,
`Korea was ruled by Japan from 1910 to 1945. When Japan surrendered, the Soviet Union and the United States agreed to occupy the peninsula temporarily, divided near the 38th parallel. Efforts to hold united elections failed as the Cold War deepened. In 1948 two governments formed: the Republic of Korea in the south, and the Democratic People's Republic of Korea in the north under Kim Il Sung. Each claimed to be the rightful government of all Korea.

On 25 June 1950 North Korean forces invaded the south, and Seoul fell quickly. The United Nations Security Council called for help for the south, and a US-led coalition under General Douglas MacArthur joined. By September the defenders held only a small area around Pusan, but the landing at Incheon turned the war. UN forces advanced north toward the Chinese border. In October 1950 China entered the war, and pushed them back. After more than a year of mobile fighting, the front settled near the 38th parallel.

An armistice was signed on 27 July 1953, but it was not a peace treaty, so the two Koreas remain technically at war. A heavily guarded Demilitarized Zone divides the peninsula. Casualty estimates vary, but the total deaths, military and civilian, were in the millions, and many families were separated.

Worked example: because the war began as a civil conflict between two Korean governments, and then drew in great powers, historians describe it as both a civil war and an international one.`,
  [
    mc(L,1,1,`Near which line was Korea divided after 1945?`,[`The 38th parallel`,`The 17th parallel`,`The Great Wall`,`The Yalu River`],`It is a line of latitude.`,`Korea was divided near the 38th parallel by Soviet and US occupation zones.`),
    tf(L,2,1,`The Korean War ended with a formal peace treaty in 1953.`,1,`It was an armistice.`,`An armistice was signed on 27 July 1953, but no peace treaty has been concluded.`),
    mc(L,3,2,`What happened in October 1950?`,[`China entered the war and pushed UN forces back`,`The war ended with an armistice signed at Panmunjom`,`Japan invaded Korea again and occupied Seoul`,`The USSR attacked Seoul and captured the whole peninsula`],`UN forces had advanced north.`,`China entered the war and forced UN forces to retreat.`),
    tf(L,4,2,`North Korean forces invaded the south on 25 June 1950.`,0,`That is the date the war began.`,`The war began with the North Korean invasion on 25 June 1950.`),
    mc(L,5,3,`Why do historians call the Korean War both a civil war and an international war?`,[`It began between two Korean governments and then drew in foreign powers`,`It was fought only by foreign armies, with no Korean forces involved`,`It involved no Koreans, being a fight between great powers`,`It happened in the nineteenth century between Japan and Qing China`],`Consider who fought first and who joined.`,`It began as a conflict between rival Korean governments and then involved the US, UN allies, China and the USSR.`),
  ]);
}

// ---------------------------------------------------------------- L28
{
  const L = lid(28);
  add(28, `The Vietnam Wars`, `Vietnam's long struggle for independence and unity, against France and then the United States, ended in 1975.`, 8,
`France had ruled Vietnam as part of French Indochina since the nineteenth century. On 2 September 1945, after Japan's surrender, Ho Chi Minh, a nationalist and communist leader, declared Vietnamese independence. France tried to regain control, and the First Indochina War (1946 to 1954) followed. It ended with the Vietnamese victory at Dien Bien Phu in May 1954. At Geneva that year, the country was temporarily divided at the 17th parallel, with a communist government in the north and a US-supported government in the south; elections to unify the country were planned but never held.

The United States, seeing the conflict through the lens of the Cold War, increased support to the south. After the Gulf of Tonkin incident in August 1964, Congress passed a resolution authorizing greater force, and US combat troops arrived in 1965. The conflict, called the Vietnam War in the West and the American War in Vietnam, included guerrilla war by the National Liberation Front, heavy bombing, and the use of defoliants such as Agent Orange. Civilians suffered enormously.

In the 1968 Tet Offensive, communist forces attacked cities across the south; though militarily costly for them, it shook US public confidence. Opposition to the war grew in the United States. The Paris Peace Accords of January 1973 led to the withdrawal of US forces, and on 30 April 1975 Saigon fell. Vietnam was formally reunified in 1976. Casualty estimates vary, but millions died, and the war spread into Laos and Cambodia.

Worked example: Tet shows that a battle's military and political results can differ.`,
  [
    mc(L,1,1,`Who declared Vietnamese independence on 2 September 1945?`,[`Ho Chi Minh`,`Ngo Quyen`,`Sun Yat-sen`,`Kim Il Sung`],`He led the nationalist movement.`,`Ho Chi Minh declared independence in Hanoi.`),
    tf(L,2,1,`The French were defeated at Dien Bien Phu in 1954.`,0,`This ended the First Indochina War.`,`The Vietnamese victory at Dien Bien Phu led to the Geneva settlement.`),
    mc(L,3,2,`What did the Geneva settlement of 1954 do?`,[`Divided Vietnam temporarily at the 17th parallel`,`Gave Vietnam to Japan as a reward for its wartime support`,`Created a single united Vietnam at once under one government`,`Ended the Cold War by an agreement between the superpowers`],`The division was meant to be temporary.`,`Vietnam was divided at the 17th parallel pending elections that were never held.`),
    tf(L,4,2,`The Tet Offensive of 1968 was a clear military victory for the communist forces.`,1,`Recall its costs and its political effect.`,`It was militarily costly for them but politically shook US confidence.`),
    mc(L,5,3,`When did Saigon fall?`,[`30 April 1975`,`2 September 1945`,`15 August 1945`,`27 July 1953`],`It ended the war.`,`Saigon fell on 30 April 1975, and the country was reunified the following year.`),
  ]);
}

// ---------------------------------------------------------------- L29
{
  const L = lid(29);
  add(29, `Decolonisation in South and Southeast Asia`, `Between 1946 and the 1960s, most of Asia's colonies became independent, by negotiation in some places and by war in others.`, 8,
`The Second World War shook European empires. Japan's conquests had shown that colonial powers could be defeated, and Europe was weakened. Nationalist movements, already strong, demanded independence, and the paths differed.

The Philippines, a US territory, became independent on 4 July 1946 after a promised transition. Britain granted independence to India and Pakistan in 1947, to Burma and Ceylon, now Sri Lanka, in 1948, and to Malaya in 1957. In Malaya, a communist insurgency known as the Malayan Emergency (1948 to 1960) was fought while the British prepared a handover to a government that included Malay, Chinese and Indian leaders.

In Indonesia, nationalist leaders Sukarno and Mohammad Hatta declared independence on 17 August 1945. The Netherlands tried to restore control in a war that ran to 1949, when it recognized Indonesian sovereignty after international pressure. In Indochina, France fought and lost the war in Vietnam, and left Cambodia and Laos earlier, with Cambodia independent in 1953.

In 1955 leaders of 29 Asian and African countries met in Bandung, Indonesia, to promote cooperation and to oppose colonialism. Many new states later joined the Non-Aligned Movement, trying to avoid being drawn into the Cold War.

Worked example: compare the Philippines and Indonesia. One followed a negotiated timeline with the former ruler, and the other fought a war after a declaration, showing why the manner of independence shaped later politics.

Independence did not end all problems: new states faced poverty, borders drawn by colonial rulers, and ethnic and political tensions.`,
  [
    mc(L,1,1,`Which country declared independence on 17 August 1945 and fought the Dutch until 1949?`,[`Indonesia`,`Malaya`,`Burma`,`The Philippines`],`Sukarno and Hatta led it.`,`Indonesia declared independence in 1945, and the Dutch recognised it in 1949.`),
    tf(L,2,1,`The Bandung Conference of 1955 brought together Asian and African countries.`,0,`It was held in Indonesia.`,`Leaders of 29 countries met to promote cooperation and oppose colonialism.`),
    mc(L,3,2,`What was the Malayan Emergency?`,[`A communist insurgency fought from 1948 to 1960 in British Malaya`,`A Japanese invasion of Malaya in December 1941`,`A famine in the Malay peninsula after repeated crop failures`,`A trade treaty that opened Malayan ports to British ships`],`It happened as Britain prepared to leave.`,`It was an insurgency fought while Britain prepared Malaya for independence.`),
    tf(L,4,2,`All Asian colonies became independent in the same way.`,1,`Think of the Philippines versus Indonesia.`,`Some were handed over by negotiation and others won independence through war.`),
    mc(L,5,3,`Why did the Second World War help decolonisation?`,[`Japan's conquests showed colonial powers could be defeated and Europe was weakened`,`The colonial powers emerged from the war richer and stronger than before it began`,`Nationalism disappeared across Asia once the fighting stopped`,`The war was fought only in Europe and never reached Asian colonies`],`Consider the effect on European prestige.`,`Wartime defeats and exhaustion weakened colonial authority, and nationalists pressed their claims.`),
  ]);
}

// ---------------------------------------------------------------- L30
{
  const L = lid(30);
  add(30, `The Rise of Asian Economies`, `From Japan's postwar recovery to the Tigers and China, East Asia grew fast, with state guidance and exports as common themes.`, 8,
`After 1945 Japan was occupied by the Allies, mainly the United States, until 1952. It adopted a new constitution in 1947, which renounced war as a means of settling disputes, and rebuilt its economy with close cooperation between government ministries and firms, high saving and an emphasis on exports. By the 1960s and 1970s Japan had become the second largest economy in the world, a position it held for decades.

Other economies followed. South Korea, Taiwan, Hong Kong and Singapore, often called the Four Tigers or Dragons, grew very fast from the 1960s. Their paths differed, but common features included investment in education, export-oriented manufacturing, high savings, and in several cases strong government guidance. Economists debate how far state direction or open markets deserve the credit, and note that some of these governments were authoritarian at the time. South Korea and Taiwan later moved toward democracy in the 1980s and 1990s.

China began to open after 1978. Under Deng Xiaoping, farming was decollectivized, and special economic zones, such as Shenzhen from 1980, welcomed foreign investment. China became a manufacturing center and, in 2010, passed Japan as the world's second largest economy. Hundreds of millions of people moved out of extreme poverty, though inequality and environmental damage rose.

India moved away from heavy state control after a crisis in 1991, liberalizing trade and industry; growth accelerated afterward. In 1997 a financial crisis hit Thailand, Indonesia and South Korea, showing the risks of rapid growth with weak financial oversight.

Worked example: Shenzhen went from a small town to a large city in a few decades, an illustration of how policy and location can drive growth. Figures vary by source.`,
  [
    mc(L,1,1,`Which group of economies is often called the Four Tigers?`,[`South Korea, Taiwan, Hong Kong and Singapore`,`India, Pakistan, Bangladesh and Sri Lanka`,`Vietnam, Laos, Cambodia and Myanmar`,`Thailand, Malaysia and Indonesia`],`They grew fast from the 1960s.`,`The Four Tigers are South Korea, Taiwan, Hong Kong and Singapore.`),
    tf(L,2,1,`Shenzhen was one of China's special economic zones begun around 1980.`,0,`It welcomed foreign investment.`,`Shenzhen became a leading special economic zone after 1980.`),
    mc(L,3,2,`What happened to the Thai, Indonesian and South Korean economies in 1997?`,[`They were hit by a financial crisis`,`They became colonies of European states again`,`They merged into one regional currency union`,`They withdrew entirely from the global economy`],`Rapid growth brought risks.`,`The 1997 Asian financial crisis exposed weaknesses in financial oversight.`),
    tf(L,4,2,`Economists agree that state guidance alone explains the Tigers' growth.`,1,`The lesson says economists debate it.`,`Economists debate the relative roles of state direction and open markets.`),
    mc(L,5,3,`Which statement fairly balances China's growth since 1978?`,[`Hundreds of millions escaped extreme poverty, while inequality and pollution also rose`,`It brought benefits to everyone and no costs, since poverty and pollution both fell`,`It brought only costs, as incomes fell and pollution and inequality both rose`,`It had no effect on poverty, because the number of poor people stayed the same`],`A fair account includes both.`,`The reforms lifted many from poverty but also created new inequalities and environmental problems.`),
  ]);
}

// ---------------------------------------------------------------- L31
{
  const L = lid(31);
  add(31, `Contemporary Asia: Opportunities and Tensions`, `Asia today combines economic weight, political diversity and unresolved disputes, and its history shapes present debates.`, 8,
`Asia is home to well over half of humanity, and its economic weight keeps growing. China and India are the two most populous countries. Japan, South Korea and Singapore are among the wealthiest, while other countries face deep poverty. This diversity makes generalizations about "Asia" risky, so this lesson describes broad patterns rather than a final verdict.

Political systems vary widely. India is often called the largest democracy in the world by population. Japan, South Korea, Taiwan and Indonesia have also had democratic systems, though Indonesia's dates from the end of the Suharto era in 1998. China is governed by the Communist Party. North Korea is a closed one-party state. In 1989 a student-led protest movement in Beijing was ended by military force around 4 June, and discussion of the event is restricted in China. Hong Kong, a British colony until 1997, returned to Chinese sovereignty under a "one country, two systems" arrangement, whose practical meaning has been debated and has changed since.

Regional cooperation grew with the Association of Southeast Asian Nations, ASEAN, founded in 1967 by five countries and now larger. Yet old disputes continue, including the status of Taiwan, claims in the South China Sea, border tensions between India and its neighbors, and the division of Korea.

Asia also faces shared challenges: aging populations in some countries and youthful populations in others, climate risks such as rising seas and extreme monsoons, and the need to manage rapid urban growth.

Worked example: to understand a news story about the South China Sea, one must know the history of colonial maps, wartime occupation and modern claims. Because events change quickly, treat current details as things to check.`,
  [
    mc(L,1,1,`Which two countries have the largest populations in Asia?`,[`China and India`,`Japan and Korea`,`Vietnam and Thailand`,`Mongolia and Nepal`],`Both are enormous.`,`China and India are the two most populous countries.`),
    tf(L,2,1,`ASEAN was founded in 1967.`,0,`It is a Southeast Asian group.`,`ASEAN was founded in 1967 by five countries and has since grown.`),
    mc(L,3,2,`What arrangement was used when Hong Kong returned to China in 1997?`,[`One country, two systems`,`One party, one system rule`,`Continued colonial rule`,`Full independence for Hong Kong`],`It promised a separate system.`,`Hong Kong returned under the "one country, two systems" framework, whose meaning has been debated.`),
    tf(L,4,2,`Asian countries all share the same political system.`,1,`The lesson stresses diversity.`,`Political systems range from democracies to one-party states.`),
    mc(L,5,3,`Why does the lesson advise checking current details?`,[`Events change quickly, so recent facts may be out of date`,`Because history never changes, so current details are unnecessary to check`,`Because Asia has no news, so older facts are always safe to use`,`Because all facts about the region are kept secret from the public`],`Think about how fast news moves.`,`Contemporary facts shift, so historians and readers must verify recent information.`),
  ]);
}

// ---------------------------------------------------------------- L32
{
  const L = lid(32);
  add(32, `Reading Asian History: Sources, Debates and Perspectives`, `Thinking like a historian means asking whose voice a source carries, how labels shape stories, and how interpretations change.`, 8,
`By now you have met many sources: oracle bones, Ashoka's edicts, court novels, Mongol chronicles, treaties, and modern memoirs. Each was made by someone with a purpose. A skilled reader asks who created a source, for whom, when, and what is missing. Ashoka's pillars speak for a ruler; The Tale of Genji speaks of the court; treaty texts in English and Chinese may carry different meanings. Primary sources come from the time studied, while secondary sources, such as textbooks, interpret them.

Labels matter. "The Silk Road" is a nineteenth-century name for a network of many routes. "Golden age" and "decline" are judgements. "Mutiny" or "war of independence" tells you the speaker's stance on the 1857 uprising. When a word seems neutral, ask who first used it.

Edward Said's 1978 book Orientalism argued that European scholars and writers often portrayed the East as exotic, timeless and inferior, which served colonial power. His argument has been influential and also criticized and refined by other scholars, and it reminds readers to ask how outsiders' images shape what is known. At the same time, national histories written within Asia can have their own aims, such as building pride or unity, and may leave out minorities or painful episodes.

Historians also revisit old questions. Why did Zheng He's voyages end? Was the Mughal decline due mainly to internal or external causes? How should the Raj's economic legacy be measured? Reasonable scholars give different answers based on how they weigh evidence.

Worked example: compare a British account of the Opium Wars with a Chinese one. Neither is simply false, but each selects facts and frames causes. Comparing them gets you closer to a fuller picture than relying on either alone.`,
  [
    mc(L,1,1,`What is a primary source?`,[`A source from the time being studied`,`A modern textbook summarizing the era`,`Any website that mentions the event`,`A summary written centuries afterward`],`It is close to the events.`,`Primary sources, such as inscriptions, letters and treaties, come from the period studied.`),
    tf(L,2,1,`"The Silk Road" is a nineteenth-century name for a network of many routes.`,0,`Recall who coined it.`,`The label was coined in the nineteenth century and covers a web of routes, not a single road.`),
    mc(L,3,2,`What did Edward Said argue in Orientalism (1978)?`,[`European portrayals of the East were often shaped by, and served, colonial power`,`The East had no real history before European explorers described it`,`Asian scholars had written all of the histories the world reads today`,`Maps are never useful for understanding the history of any region`],`He examined outsiders' images of the East.`,`Said argued that Western images of the East often reflected and supported colonial power; his argument has been debated and refined since.`),
    tf(L,4,2,`National histories written inside a country are always completely neutral.`,1,`Every history has aims.`,`Such histories can serve goals like pride or unity and may omit painful or minority perspectives.`),
    mc(L,5,3,`What is a good method for studying a disputed event such as the Opium Wars?`,[`Compare accounts from different sides and note what each selects and how it frames causes`,`Believe only the first account you find, since it is likely to be most accurate`,`Ignore all accounts, since every historical source is biased in some way`,`Trust only the winner's version, since winners keep the most reliable records`],`More perspectives help.`,`Comparing sources from several viewpoints gives a fuller and more reliable picture.`),
  ]);
}

// ---------------------------------------------------------------- assemble
const trk = (n: number, title: string, blurb: string, level: 'FOUNDATION' | 'INTERMEDIATE' | 'ADVANCED', from: number, to: number) => ({
  id: `history-asia.t${n}`,
  title,
  blurb,
  level,
  lessons: lessons.filter(x => x.n >= from && x.n <= to).map(x => ({ id: lid(x.n), title: x.title, blurb: x.blurb, minutes: x.minutes, body: x.body })),
});

export const COURSE_MODULE: CourseModule = {
  curriculum: {
    id: 'history-asia',
    label: 'History of Asia',
    blurb: `From the Indus cities and early China to the Mongols, great empires, colonialism, independence and today's Asia: East, South, Southeast and Central Asia, told through sources and debates.`,
    accent: '#E23B6D',
    framework: 'ncas',
    tracks: [
      trk(1, `First Civilizations and Early Empires`, `Geography, the Indus cities, early China and the Silk Road.`, 'FOUNDATION', 1, 4),
      trk(2, `India, Religion and Tang-Song China`, `Mauryan and Gupta India, the spread of Buddhism and Hinduism, and China's Tang and Song.`, 'FOUNDATION', 5, 8),
      trk(3, `Mongols, Ming, Qing and Mughals`, `Great early modern empires of Central, East and South Asia.`, 'INTERMEDIATE', 9, 12),
      trk(4, `Japan, Korea and Southeast Asia`, `Samurai Japan, Joseon Korea and the kingdoms of Southeast Asia.`, 'INTERMEDIATE', 13, 18),
      trk(5, `Trade, Empire and Reform`, `European arrival, the Opium Wars, the Taiping, the Meiji transformation and the Raj.`, 'INTERMEDIATE', 19, 23),
      trk(6, `War, Revolution and Independence`, `Partition, the war in Asia, the PRC, Korea, Vietnam and decolonisation.`, 'ADVANCED', 24, 29),
      trk(7, `Modern Asia and Historical Thinking`, `Economic rise, contemporary tensions and how to read Asian history critically.`, 'ADVANCED', 30, 32),
    ],
  },
  bank: {
    curriculumId: 'history-asia',
    questions: Q,
  },
};
