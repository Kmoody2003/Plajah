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

const L01 = 'history-europe.l01';
const L02 = 'history-europe.l02';
const L03 = 'history-europe.l03';
const L04 = 'history-europe.l04';
const L05 = 'history-europe.l05';
const L06 = 'history-europe.l06';
const L07 = 'history-europe.l07';
const L08 = 'history-europe.l08';
const L09 = 'history-europe.l09';
const L10 = 'history-europe.l10';
const L11 = 'history-europe.l11';
const L12 = 'history-europe.l12';
const L13 = 'history-europe.l13';
const L14 = 'history-europe.l14';
const L15 = 'history-europe.l15';
const L16 = 'history-europe.l16';
const L17 = 'history-europe.l17';
const L18 = 'history-europe.l18';
const L19 = 'history-europe.l19';
const L20 = 'history-europe.l20';
const L21 = 'history-europe.l21';
const L22 = 'history-europe.l22';
const L23 = 'history-europe.l23';
const L24 = 'history-europe.l24';
const L25 = 'history-europe.l25';
const L26 = 'history-europe.l26';
const L27 = 'history-europe.l27';
const L28 = 'history-europe.l28';
const L29 = 'history-europe.l29';
const L30 = 'history-europe.l30';
const L31 = 'history-europe.l31';
const L32 = 'history-europe.l32';

export const COURSE_MODULE: CourseModule = {
  curriculum: {
    id: 'history-europe',
    label: 'History of Europe',
    blurb: 'From the Bronze Age Aegean to the present: Greece and Rome, the medieval world, the Renaissance and Reformation, revolutions and empires, two world wars, the Cold War and the European Union. Built for curious beginners and ready to go deeper.',
    accent: '#3B82F6',
    framework: 'ncas',
    tracks: [
      {
        id: 'history-europe.t1',
        title: 'The Ancient Foundations',
        blurb: 'The Bronze Age Aegean, the Greek city-states, and the rise and transformation of Rome.',
        level: 'FOUNDATION',
        lessons: [
          {
            id: L01,
            title: 'The Bronze Age Aegean',
            blurb: 'Minoans and Mycenaeans built the first palace societies in Europe, then the world around them collapsed.',
            minutes: 6,
            body: `Europe's first complex societies appeared around the Aegean Sea during the Bronze Age, when bronze tools and weapons were made from copper and tin. On the island of Crete, the Minoans built large palace centres, the best known at Knossos, from around 2000 BCE. Their art shows bull imagery, elaborate frescoes and busy seaborne trade. We call them "Minoans" after the legendary King Minos, a name given by modern scholars; we do not know what they called themselves. Their script, Linear A, has never been deciphered.

On the Greek mainland, the Mycenaeans, named after the fortified site of Mycenae, built stone citadels and rich tombs. Their palace administrations kept records on clay tablets in a script called Linear B. In 1952 Michael Ventris showed that Linear B writes an early form of Greek. This was a surprise, and it proved that Greek was already spoken and written in the second millennium BCE. The tablets turned out to be mostly accounts: lists of sheep, grain, textiles and workers, not poems or histories. They show a bureaucratic society run from palaces.

Around 1200 BCE, many palaces in the Aegean and the eastern Mediterranean were destroyed or abandoned, in what historians call the Late Bronze Age collapse. Proposed causes include earthquakes, drought, internal conflict, disrupted trade and invasions or migrations, and scholars debate how much weight each deserves. Afterwards, Greek writing disappeared for centuries until an alphabet, adapted from the Phoenician one, appeared around 800 BCE.

Homer's epics were composed long after the Mycenaean age, so they cannot be treated as direct records of it.`,
          },
          {
            id: L02,
            title: 'Greek City-States and the Classical Age',
            blurb: 'Athens, Sparta and the polis model produced democracy, philosophy and war, before Macedon took over.',
            minutes: 8,
            body: `Greek life centred on the polis, a city-state made up of an urban centre and the farmland around it. There were hundreds of them, each with its own laws, and they shared language, religion and festivals such as the Olympic Games. They were rivals as often as partners.

Athens developed a form of democracy. After reforms usually credited to Cleisthenes around 508 BCE, adult male citizens could speak and vote in the assembly, and many offices were filled by lot. But citizenship was narrow: women, enslaved people and foreign residents were excluded, and slavery was central to the economy. Sparta was very different. A small body of citizen-soldiers lived off the labour of the helots, a subjugated population who farmed the land, and Spartan boys received a harsh military training.

When the Persian Empire sent armies against Greece, many poleis united. The Greeks won at Marathon in 490 BCE and, after the famous stand at Thermopylae, at Salamis in 480 and Plataea in 479 BCE. Athens then led an alliance that turned into an Athenian empire. Resentment helped trigger the Peloponnesian War, which pitted Athens against Sparta and its allies from 431 to 404 BCE and ended in Athenian defeat. Classical Athens also saw drama, history writing and philosophy, including the trial and execution of Socrates in 399 BCE.

The weakened Greek states were then dominated by Philip II of Macedon, whose son Alexander conquered the Persian Empire, reached northwest India, and died in 323 BCE. His generals split his realm into Hellenistic kingdoms.`,
          },
          {
            id: L03,
            title: 'The Roman Republic',
            blurb: 'Rome grew from a city-state into a Mediterranean power while its political system strained under success.',
            minutes: 7,
            body: `According to Roman tradition, the Romans expelled their kings and founded the Republic in 509 BCE. The date is traditional rather than certain, but the Republic itself was real. It was run by magistrates elected each year, above all two consuls who shared power so that no one man ruled alone. The Senate, a council of former magistrates, advised and in practice guided policy. Citizens voted in assemblies, and tribunes of the plebs were created to defend ordinary citizens (the plebeians) against the aristocratic patricians after long struggles between the two groups.

Rome expanded by conquest and alliance across Italy, then overseas. Its great rival was Carthage, a trading power in North Africa. The Punic Wars lasted from 264 to 146 BCE. In the Second, Hannibal led an army across the Alps and crushed Rome at Cannae in 216 BCE, yet Rome refused to give in, and Scipio defeated him at Zama in 202 BCE. After the Third war, Rome destroyed Carthage in 146 BCE.

Success brought problems. Conquest produced huge numbers of enslaved people and great wealth for a few, while many small farmers lost their land. In 133 BCE the tribune Tiberius Gracchus proposed land reform and was killed in a riot; his brother Gaius met a similar end in 121 BCE. Ambitious generals, whose armies were loyal to them rather than the state, increasingly settled political disputes by force. The Republic's rules had been designed for a city, not an empire.`,
          },
          {
            id: L04,
            title: 'From Caesar to the Roman Empire',
            blurb: 'Civil war ended the Republic, and Augustus built a monarchy in republican clothing that governed much of Europe.',
            minutes: 8,
            body: `Julius Caesar, a general who conquered Gaul, crossed the Rubicon river with his army in 49 BCE, starting a civil war against rivals in the Senate. He won and became dictator, but on 15 March 44 BCE a group of senators assassinated him, claiming to defend the Republic. The result was not restoration but more war. His heir Octavian defeated Mark Antony and Cleopatra of Egypt at Actium in 31 BCE.

In 27 BCE the Senate gave Octavian the title Augustus. He kept republican offices and ceremony but held real power, especially control of the army. Historians call this system the principate, and they still debate whether Augustus restored the Republic or quietly ended it. Most conclude he created a monarchy while avoiding the word "king."

The following two centuries are often called the Pax Romana, the Roman peace, roughly 27 BCE to 180 CE. The label describes relative stability inside the empire, not peace for everyone: Rome conquered new lands, such as Britain from 43 CE, put down revolts, and relied on slavery. The empire reached its greatest size under Trajan around 117 CE. Roads, a common currency, Roman law and Latin and Greek as languages of administration linked a huge area. In 212 CE the emperor Caracalla extended citizenship to nearly all free inhabitants.

In the third century the empire suffered civil wars, invasions and economic strain. Its survival, in changed form, is the story of the next lessons.`,
          },
        ],
      },
      {
        id: 'history-europe.t2',
        title: 'Late Antiquity and the Early Middle Ages',
        blurb: 'How the Roman world changed: Byzantium in the east, new kingdoms in the west, Islamic Iberia and the Vikings.',
        level: 'FOUNDATION',
        lessons: [
          {
            id: L05,
            title: 'The Late Roman Empire and the End of the West',
            blurb: 'Reform, Christianity and migration reshaped the empire, and in 476 the last western emperor lost his throne.',
            minutes: 8,
            body: `By the late third century the empire was too large to run from one centre. Diocletian split its administration among several rulers, a system known as the tetrarchy. Constantine, who became sole emperor after civil wars, issued the Edict of Milan in 313 CE, which granted toleration to Christians, and he called the Council of Nicaea in 325 to settle a dispute about Christian belief. In 330 he dedicated a new eastern capital, Constantinople. In 380 the emperor Theodosius made Nicene Christianity the state religion.

Meanwhile groups from beyond the frontiers, including Goths, Franks and Vandals, moved into Roman territory, some as invaders and some as migrants or soldiers recruited by Rome. In 378 the Goths destroyed a Roman army at Adrianople. In 410 the Visigoth leader Alaric sacked the city of Rome, a shock to people across the empire. By the 400s Germanic kings ruled provinces such as Gaul, Spain and North Africa.

The usual date for the end of the western empire is 476, when the general Odoacer removed the boy emperor Romulus Augustulus. But most people at the time did not think the world had ended, and the eastern empire carried on for nearly a thousand years.

Why Rome fell is debated. The eighteenth-century historian Edward Gibbon stressed decline and loss of civic virtue. Many modern historians prefer to speak of a gradual transformation and stress military pressure, civil wars and economic problems.`,
          },
          {
            id: L06,
            title: 'Byzantium',
            blurb: 'The eastern Roman Empire survived until 1453, preserving Roman law, Greek learning and Orthodox Christianity.',
            minutes: 7,
            body: `The eastern half of the Roman Empire, ruled from Constantinople, lasted until 1453. Its people spoke mostly Greek and called themselves Romans. The word "Byzantine," from the old name of the city, Byzantion, was applied by later writers.

The emperor Justinian ruled from 527 to 565. He had the existing body of Roman law collected and organised in the Corpus Juris Civilis, a work that later shaped legal systems in much of Europe. He built the great church of Hagia Sophia, completed in 537. In 532 the Nika riots nearly toppled him, and in the 540s a deadly plague struck the empire. His armies reconquered parts of Italy and North Africa, but at great cost.

Byzantium faced enemies on every side: Persians, Arabs, Slavs, Bulgars and later Turks. Arab armies took Syria, Egypt and North Africa in the seventh century, shrinking the empire. Internal conflict also mattered. A dispute over religious images, called iconoclasm, divided the empire in the eighth and ninth centuries and ended in 843 with their restoration. In 1054, representatives of the pope and the patriarch of Constantinople excommunicated each other, a moment often called the Great Schism between Catholic and Orthodox churches, though the split developed over a longer period.

In 1204 the Fourth Crusade sacked Constantinople, and the empire never fully recovered. In 1453 the Ottoman sultan Mehmed II captured the city. Byzantine scholars and libraries helped preserve many Greek texts.`,
          },
          {
            id: L07,
            title: 'Early Medieval Kingdoms and Charlemagne',
            blurb: 'Germanic kingdoms, monasteries and the Franks built the political world of the early Middle Ages.',
            minutes: 7,
            body: `After the western empire's collapse, new kingdoms emerged: the Visigoths in Spain, the Ostrogoths and later Lombards in Italy, the Franks in Gaul, and Anglo-Saxon kingdoms in Britain. Rulers often depended on Roman officials, Roman law and, increasingly, the Christian Church. Clovis, king of the Franks, converted to Catholic Christianity around 500, an important step in linking the Franks and the church.

Monasteries mattered enormously. Monks copied manuscripts, ran schools and farms, and offered hospitality. The Rule written by Benedict in the sixth century became a model for monastic life across the west. Literacy was rare outside the clergy, and trade and towns were smaller than in Roman times, though not absent.

The Frankish kings rose to dominate western Europe. Charlemagne, king of the Franks from 768, conquered much of what is now France, Germany and northern Italy, including a brutal campaign against the Saxons. On Christmas Day 800, Pope Leo III crowned him emperor in Rome, a sign of the alliance between papacy and Frankish monarchy and an open challenge to the eastern emperor's claims. Charlemagne supported scholars and schools in what is sometimes called the Carolingian Renaissance, and sent royal agents to oversee local counts.

His empire did not last. After the reign of his son, Charlemagne's grandsons divided it in the Treaty of Verdun in 843. The western part became the core of France and the eastern part of Germany, while a middle strip was later contested.`,
          },
          {
            id: L08,
            title: 'Islamic Iberia',
            blurb: 'For centuries much of Spain and Portugal was ruled by Muslim dynasties, and its legacy is still debated.',
            minutes: 8,
            body: `In 711, an army led by Tariq ibn Ziyad crossed from North Africa into the Iberian Peninsula and defeated the Visigothic king Roderic. Within a few years most of the peninsula had come under Muslim rule, and the region became known as al-Andalus. The invading forces were largely Berber, led by Arab commanders.

In 756 Abd al-Rahman I, a survivor of the fallen Umayyad dynasty in Damascus, established an emirate centred on Córdoba. In 929 Abd al-Rahman III proclaimed himself caliph. Córdoba became one of the largest and most cultured cities in Europe, with libraries, scholars and a great mosque. The caliphate broke into rival small kingdoms, the taifas, in the early eleventh century.

Muslims, Christians and Jews lived under Muslim rule. Christians and Jews were "people of the book" who could practise their religion but paid a special tax and had lower legal status. Some historians have praised this era as convivencia, a period of coexistence, while others point out that it also included persecution, conflict and inequality. The truth varied by time and place. In the twelfth and thirteenth centuries, translators in Toledo rendered many Arabic and Greek works into Latin, passing on learning to the rest of Europe.

Christian kingdoms in the north gradually expanded south in what is called the Reconquista, a term that reflects the Christian viewpoint. Toledo fell to Castile in 1085. In 1492 Granada, the last Muslim state, fell. That same year Jews were ordered to convert or leave Spain, and Muslims faced forced conversion within a few years.`,
          },
          {
            id: L09,
            title: 'The Vikings',
            blurb: 'Scandinavian raiders, traders and settlers reshaped Britain, Ireland, France, Russia and the North Atlantic.',
            minutes: 7,
            body: `Between roughly 800 and 1050, seafarers from Scandinavia, whom we call Vikings, struck coasts and rivers across Europe. The raid on the monastery of Lindisfarne in northeast England in 793 is traditionally taken as the start, and it shocked contemporaries, who wrote about it with horror. Their ships were fast, shallow-drafted and able to navigate both open sea and rivers.

Vikings were raiders, but also traders, settlers and mercenaries. They captured and sold enslaved people. In England they conquered large areas, known as the Danelaw, until English kings reconquered them in the tenth century. In 1016 the Danish king Cnut became king of England. In northern France, a group led by Rollo was granted land around 911, and its descendants became the Normans. Swedish Vikings, called Rus, travelled down rivers through what is now Russia and Ukraine to trade, reaching Constantinople.

Norse settlers colonised Iceland from around 870 and held an assembly, the Althing, from around 930. Erik the Red founded a settlement in Greenland around 985. Archaeology at L'Anse aux Meadows in Newfoundland confirms that Norse people reached North America around the year 1000, centuries before Columbus.

Much of what we know about Viking religion and stories comes from sagas and poems written down in Iceland in the 1200s, long after the events. They are valuable but must be read with caution, and they were written by Christians looking back. Viking kingdoms in Scandinavia gradually became Christian and joined the wider European system of states.`,
          },
        ],
      },
      {
        id: 'history-europe.t3',
        title: 'The High and Late Middle Ages',
        blurb: 'Feudal society, the power of the Church, the Crusades, the Black Death and the rise of states.',
        level: 'INTERMEDIATE',
        lessons: [
          {
            id: L10,
            title: 'Feudalism, Lords and the Church',
            blurb: 'Medieval society ran on land, loyalty and labour, with the Church as a rival centre of power.',
            minutes: 8,
            body: `Most medieval Europeans were peasants. Many were serfs, tied to the land of a lord and obliged to give labour or a share of the harvest in return for protection and the use of land. The lord's estate, the manor, was the basic unit of rural life. Above the peasantry, a warrior class of nobles held land, called fiefs, from greater lords or kings in return for military service and loyalty. This web of mutual obligations is usually called feudalism.

Historians use the term with care. Some argue that the neat pyramid of king, lords and vassals is a later simplification, and that practices differed widely between regions and centuries. Treat "feudalism" as a convenient label rather than a single system.

The Church was the other great power. The pope led the western Church, bishops oversaw regions, and monasteries held land and learning. People paid tithes, a tenth of their produce, to support the clergy, and church courts handled marriage and many moral cases. Kings and popes quarrelled over who should appoint bishops, a conflict known as the Investiture Controversy. In 1077 Emperor Henry IV travelled to Canossa in Italy to seek the forgiveness of Pope Gregory VII after being excommunicated. The dispute was largely settled by the Concordat of Worms in 1122.

A concrete case of conquest shows how land and loyalty worked. After William of Normandy won the Battle of Hastings in 1066, he gave estates to his followers, and in 1086 his officials compiled the Domesday Book, a survey of landholding in England.`,
          },
          {
            id: L11,
            title: 'The Crusades',
            blurb: 'Western armies sought Jerusalem and other goals in campaigns that left lasting memories on every side.',
            minutes: 8,
            body: `In 1095, Pope Urban II preached at the Council of Clermont, urging western Christians to march east. The Byzantine emperor Alexios I had asked for military help against the Seljuk Turks, and Urban called for an armed pilgrimage to Jerusalem. Participants took vows and were promised spiritual rewards. Motives were mixed: religious devotion, hopes of land and wealth, and loyalty to lords all played a part.

The First Crusade captured Jerusalem in July 1099, and its conquerors massacred many of the city's Muslim and Jewish inhabitants. Crusaders founded states along the eastern Mediterranean coast, including the Kingdom of Jerusalem. In 1096, before the main armies even left Europe, crusading bands had attacked Jewish communities in the Rhineland.

The Muslim world was divided, and sources from the period, such as Arabic chronicles, describe the arrivals as "Franks." In 1187 Saladin, who had united Egypt and Syria, retook Jerusalem. The Third Crusade, led by Richard I of England and Philip II of France, failed to recapture it. In 1204 the Fourth Crusade turned on the Christian city of Constantinople and sacked it, deepening the split between eastern and western churches. In 1291 the last crusader stronghold on the mainland, Acre, fell.

Crusading did not end there. Popes also called campaigns against heretics in southern France and against pagans in the Baltic region. Historians debate how far the Crusades were driven by religion, economics or politics, and how modern groups use the memory of them. The word "crusade" still carries different meanings in different places.`,
          },
          {
            id: L12,
            title: 'The Black Death',
            blurb: 'A plague pandemic in the 1340s killed a huge share of Europeans and changed labour, religion and politics.',
            minutes: 7,
            body: `In October 1347, ships carrying plague arrived at the Sicilian port of Messina. Over the next four or five years the disease spread across Europe, along trade routes and rivers, in what is now called the Black Death. It was caused by the bacterium Yersinia pestis, normally carried by fleas on rodents; ancient DNA from victims' bodies has confirmed this. People at the time did not know the cause and blamed bad air, the stars, divine punishment or other people.

Mortality varied by place, but many historians estimate that Europe lost perhaps a third or more of its population. The exact numbers are uncertain because records are patchy. Some towns lost more, some villages were abandoned, and the plague returned in later waves for centuries.

Fear led to cruelty. Rumours that Jews had poisoned wells led to massacres in many places, for example in Strasbourg in 1349, even though Jewish communities were also dying of plague. Groups called flagellants processed through towns whipping themselves in penance.

The consequences were large. With fewer workers, labour became scarce and wages tended to rise, and some lords struggled to keep serfs tied to the land. In England, the government tried to freeze wages with the Statute of Labourers in 1351, and tension over taxes and conditions contributed to the Peasants' Revolt of 1381. Historians still debate how much of the late medieval transformation the plague caused and how much it only sped up.`,
          },
          {
            id: L13,
            title: 'Kings, Parliaments and the Hundred Years\' War',
            blurb: 'Late medieval rulers built stronger states, while subjects and elites bargained over taxes and rights.',
            minutes: 8,
            body: `In 1215, a group of rebellious English barons forced King John to seal Magna Carta at Runnymede. It was a practical peace deal about feudal grievances, but it set down an important idea: that the king was himself subject to law. Most of its clauses were later reissued, revised or dropped, and its reputation grew over later centuries.

Across Europe, rulers needed money for wars, and that meant bargaining with those who could pay. Representative bodies appeared: the English Parliament, the French Estates General, which first met in 1302, and assemblies in Spain and elsewhere. They were not democracies; they represented clergy, nobles and townspeople, not ordinary peasants. In the Holy Roman Empire, the Golden Bull of 1356 fixed that seven electors chose the emperor.

The Hundred Years' War, a series of conflicts from 1337 to 1453, was fought between the English and French crowns, with the English kings claiming the French throne. English armies won famous victories at Crécy in 1346 and Agincourt in 1415, helped by the longbow. Then the French rallied. Joan of Arc, a young peasant woman who said she heard divine voices, helped relieve Orléans in 1429. She was captured by allies of England, tried by a church court and burned in 1431. By 1453, England had lost nearly all its French possessions.

The war helped strengthen national kingdoms, standing armies and the use of gunpowder weapons. It also devastated large areas of France.`,
          },
        ],
      },
      {
        id: 'history-europe.t4',
        title: 'Renaissance, Reformation and the Wider World',
        blurb: 'New learning, divided Christianity, global empires and the birth of modern science and political thought.',
        level: 'INTERMEDIATE',
        lessons: [
          {
            id: L14,
            title: 'The Renaissance and the Printing Press',
            blurb: 'Italian humanists revived classical learning, and print spread ideas faster than ever before.',
            minutes: 8,
            body: `The Renaissance, meaning "rebirth," was a cultural movement that began in Italian city-states such as Florence in the fourteenth and fifteenth centuries. Wealthy merchants, bankers like the Medici family, and rulers paid artists and scholars. Humanists studied Latin and Greek texts, and emphasised education, rhetoric and human potential, though most were still devout Christians.

The visual arts changed. Painters developed linear perspective to create the illusion of depth, and sculptors studied the human body. Filippo Brunelleschi engineered the great dome of Florence Cathedral. Leonardo da Vinci, Michelangelo, whose statue of David was completed in 1504, and Raphael are among the best-known artists. The idea that this was a sudden break with a "dark" Middle Ages is a modern exaggeration; many ideas and techniques developed earlier. The nineteenth-century historian Jacob Burckhardt popularised the idea of a distinct Renaissance, and scholars still debate how sharply it differs from the period before.

Around 1450, in Mainz, Johannes Gutenberg developed a printing system using movable metal type, a printing press and oil-based ink in Europe. His Bible, printed around 1455, is the best-known early product. East Asia already had woodblock printing and early movable type, so Gutenberg's was a European invention rather than the first in the world. Still, printing spread quickly across European cities. Books became cheaper, texts could be copied without the variations of hand copying, and ideas travelled further.

Printing also served religion, propaganda and news, which set the stage for the Reformation.`,
          },
          {
            id: L15,
            title: 'The Protestant Reformation',
            blurb: 'A challenge to the papacy in 1517 split western Christianity and reshaped politics.',
            minutes: 8,
            body: `In 1517, Martin Luther, a German monk and professor at Wittenberg, circulated Ninety-Five Theses criticising the sale of indulgences, certificates that were said to reduce punishment for sins. A story says he nailed them to a church door on 31 October; historians debate whether he did, though the theses certainly circulated. Luther came to argue that people are saved by faith, not by works, and that the Bible, not the pope, was the final authority.

Printing carried his ideas across Germany and beyond. Summoned to the Diet of Worms in 1521, Luther refused to retract his teaching and was declared an outlaw by the emperor, but German princes protected him. He translated the New Testament into German in 1522. Other reformers followed: Huldrych Zwingli in Zurich, and John Calvin in Geneva, whose teaching shaped Reformed churches. In England, Henry VIII broke with Rome in the 1530s, partly because the pope would not annul his marriage; the Act of Supremacy in 1534 made him head of the English church.

Reformation ideas also had social effects. In 1524 and 1525 peasants rose in the German Peasants' War, using religious arguments for social grievances; Luther condemned the rebels and the revolt was crushed with great slaughter.

The Catholic Church responded with reform and renewal, the Counter-Reformation, including the Council of Trent from 1545 to 1563 and the Jesuit order, founded in 1540. In 1555 the Peace of Augsburg allowed German rulers to choose either Lutheranism or Catholicism for their territories.`,
          },
          {
            id: L16,
            title: 'The Wars of Religion',
            blurb: 'Religious division fed a century of conflict and gradually led to ideas of state sovereignty and toleration.',
            minutes: 8,
            body: `Religious difference mixed with dynastic ambition, and the results were deadly. In France, wars between Catholics and Protestants, called Huguenots, broke out in 1562 and lasted, with pauses, until 1598. On 24 August 1572, the St Bartholomew's Day massacre began in Paris, and thousands of Huguenots were killed across France in the following days. The conflict ended when Henry IV issued the Edict of Nantes in 1598, granting Huguenots limited rights. Louis XIV revoked it in 1685, and many Huguenots fled.

In the Netherlands, rebellion against Spanish rule began in the 1560s and eventually produced the independent Dutch Republic, in which Calvinism was favoured but religious diversity was more tolerated than in most places.

The worst conflict was the Thirty Years' War, from 1618 to 1648. It began when Protestant nobles in Bohemia threw royal officials from a window in Prague, but it grew into a general European war involving the Holy Roman Empire, Sweden, France, Spain and many German states. Armies lived off the land, and combined with famine and disease, this killed a very large share of the population in some German regions, though estimates vary widely.

The Peace of Westphalia in 1648 ended it. It confirmed the rulers' right to determine their territories' religion, adding Calvinism to the permitted faiths, and is often seen as an early step toward a system of sovereign states, though historians now question how much it created that system by itself. Meanwhile, England's civil wars from 1642 led to the execution of Charles I in 1649.`,
          },
          {
            id: L17,
            title: 'Exploration, Empire and the Atlantic World',
            blurb: 'European voyages linked the continents, with enormous gains for some and catastrophe for others.',
            minutes: 8,
            body: `In the fifteenth century, Portuguese sailors explored down the African coast, and in 1498 Vasco da Gama reached India by sea. Spain sponsored Christopher Columbus, who sailed west in 1492 and reached the Caribbean, believing he was near Asia. In 1494 the Treaty of Tordesillas divided newly claimed lands outside Europe between Spain and Portugal, ignoring the people who already lived there. A Spanish expedition begun by Ferdinand Magellan completed the first circumnavigation in 1522, though Magellan himself died in the Philippines in 1521.

In the Americas, Spanish forces led by Hernan Cortes allied with local peoples hostile to the Aztec rulers and took Tenochtitlan in 1521. Francisco Pizarro seized the Inca Empire in the 1530s. Epidemic diseases such as smallpox, to which Indigenous people had little immunity, killed huge numbers, and forced labour systems such as the encomienda added to the suffering. The Dominican friar Bartolome de las Casas wrote against the cruelty he saw.

The transfer of plants, animals and diseases between hemispheres is called the Columbian Exchange. Potatoes, maize and tomatoes spread to Europe; horses and wheat reached the Americas.

European powers also built a system of plantation slavery. Over several centuries, well over ten million Africans were forcibly shipped across the Atlantic, and many died on the voyage or in bondage. The profits shaped European ports, banks and industries. New joint-stock companies such as the Dutch East India Company, founded in 1602, pursued trade and colonies in Asia. Resistance, adaptation and survival of Indigenous and African peoples are as much a part of this story as European expansion.`,
          },
          {
            id: L18,
            title: 'The Scientific Revolution',
            blurb: 'Between roughly 1540 and 1700, new methods of observation and mathematics changed how Europeans explained nature.',
            minutes: 8,
            body: `In 1543 Nicolaus Copernicus published a book proposing that the Earth and other planets orbit the Sun, rather than the Sun and everything else circling the Earth. That same year, Andreas Vesalius published a detailed study of human anatomy based on dissection, correcting errors from ancient authorities. Johannes Kepler later showed that planets move in ellipses.

Galileo Galilei used a telescope from 1609 and 1610 to see mountains on the Moon and moons orbiting Jupiter, which supported Copernicus's view. He ran into trouble with the Catholic Church. In 1633 an Inquisition tribunal found him suspect of heresy and he spent the rest of his life under house arrest. The story is often told as science versus religion, but historians point out that personal rivalries, politics, and disputes about biblical interpretation also mattered, and many scientists were devout.

Francis Bacon argued for gathering evidence through experiment, while thinkers such as Rene Descartes stressed mathematics and reason. Scientific societies, such as the Royal Society of London, founded in 1660, helped share findings. In 1687 Isaac Newton published the Principia, which used a few mathematical laws of motion and universal gravitation to explain falling objects and planetary orbits together.

Scholars still debate whether this was truly a "revolution," since it unfolded over a century and drew on earlier work, including Greek and Islamic scholarship, such as optics by Ibn al-Haytham. Its greatest legacy was a method: test ideas against evidence, publish results and let others check them.`,
          },
          {
            id: L19,
            title: 'Absolutism and the Enlightenment',
            blurb: 'Kings claimed unlimited power while thinkers argued for reason, rights and limits on rulers.',
            minutes: 8,
            body: `Absolutism was the idea and practice of a monarch holding supreme power, not limited by parliaments or nobles. Louis XIV of France, who reigned from 1643 and ruled personally from 1661 until 1715, is its most famous example. He built the palace of Versailles, kept nobles close at court, and expanded the army and bureaucracy. In practice, even Louis depended on cooperation from local elites and was constrained by finances. In Russia, Peter the Great modernised the army and founded St Petersburg in 1703.

The Enlightenment was an eighteenth-century intellectual movement that urged people to use reason, question tradition and seek improvements in society. John Locke, writing around 1689, argued that governments rest on consent and that people have natural rights to life, liberty and property. Montesquieu, in The Spirit of the Laws in 1748, argued for dividing government power into separate branches. Voltaire attacked religious intolerance, Jean-Jacques Rousseau in 1762 wrote of the general will, and Denis Diderot edited the Encyclopedie, published between 1751 and 1772.

Some rulers, such as Frederick II of Prussia and Catherine II of Russia, adopted some Enlightenment reforms while keeping their power, so they are sometimes called enlightened absolutists.

Enlightenment ideas had limits. Many thinkers accepted slavery or held prejudiced views about race and sex, and others, such as Mary Wollstonecraft in 1792, argued that rights should extend to women. These tensions became central in the revolutions that followed.`,
          },
        ],
      },
      {
        id: 'history-europe.t5',
        title: 'Revolution, Industry, Nation and Empire',
        blurb: 'From the French Revolution to the Scramble for Africa: how modern politics, economies and empires took shape.',
        level: 'INTERMEDIATE',
        lessons: [
          {
            id: L20,
            title: 'The French Revolution and Napoleon',
            blurb: 'A fiscal crisis became a revolution that abolished the monarchy and then produced an emperor.',
            minutes: 9,
            body: `France in the 1780s was heavily in debt, partly from wars, and its society was divided into three estates: the clergy, the nobility and everyone else, the Third Estate, which paid most taxes. In 1789 Louis XVI called the Estates General to deal with the crisis. The Third Estate declared itself a National Assembly and, in the Tennis Court Oath of June 1789, swore not to disband until France had a constitution. On 14 July, crowds stormed the Bastille prison. In August the Assembly issued the Declaration of the Rights of Man and of the Citizen, proclaiming liberty and equality before the law, though women and enslaved people in French colonies were not given the same rights.

The revolution radicalised. The monarchy was abolished in 1792, and Louis XVI was executed in January 1793. Under the Committee of Public Safety, which included Maximilien Robespierre, the period of the Terror from 1793 to 1794 saw tens of thousands killed or dying in prison, and many thousands executed by guillotine, as the government fought foreign armies and internal revolt. Robespierre was himself executed in July 1794.

In the French colony of Saint-Domingue, enslaved people rose in 1791 and eventually created independent Haiti in 1804, the first state founded by a successful slave revolt.

In 1799 the general Napoleon Bonaparte seized power, and in 1804 crowned himself emperor. He reformed law in the Napoleonic Code, which protected property and equality before the law but restricted women's rights, and he conquered much of Europe. His disastrous invasion of Russia in 1812 and final defeat at Waterloo on 18 June 1815 ended his rule. The Congress of Vienna then sought to restore a stable balance among the powers.`,
          },
          {
            id: L21,
            title: 'The Industrial Revolution',
            blurb: 'Machines, coal and factories transformed work and cities, beginning in Britain and spreading outward.',
            minutes: 8,
            body: `From the later eighteenth century, Britain changed from a mainly agricultural economy to one built on manufacturing, a transformation called the Industrial Revolution. It began with textiles: spinning and weaving machines moved production from homes into factories. Cheap coal and improved steam engines, including those developed by James Watt in the 1770s, supplied power. Iron production grew, and canals and then railways moved goods. The Liverpool and Manchester Railway opened in 1830, following the Stockton and Darlington line of 1825.

Historians debate why Britain led. Explanations include abundant coal, a growing market at home and overseas, available capital, a commercial culture and the profits and raw materials of empire, including cotton grown by enslaved people in the Americas. No single cause is accepted by everyone.

Cities grew fast. Manchester expanded from a modest town into a major industrial centre. Workers, including children, faced long hours, danger and crowded, unsanitary housing. Reformers and workers pressed for change, and the Factory Act of 1833 limited children's hours in textile mills, though enforcement was weak at first. Whether average living standards rose quickly or only after decades is still argued by economic historians.

Industrialisation spread to Belgium, France, the German states and later to other places, and it also provoked new ideas such as socialism and trade unions. It gave Europe great economic and military power, and it also created new social divisions and environmental costs that we still live with.`,
          },
          {
            id: L22,
            title: 'Nationalism, Liberalism and 1848',
            blurb: 'New ideas about peoples and rights challenged the old monarchies, with mixed results.',
            minutes: 8,
            body: `Nationalism is the belief that people who share a language, history or culture should form their own political community, often their own state. Liberalism stressed individual rights, constitutions and free markets. After Napoleon's defeat, the leaders at the Congress of Vienna, notably the Austrian minister Metternich, tried to preserve the power of monarchs and a balance among the great powers. But new ideas kept spreading, especially among students, professionals and the growing middle class.

Pressure built. Greeks rebelled against Ottoman rule in 1821 and, with the help of the European powers, won independence in the following decade. In 1830 Belgium broke from the Netherlands and became an independent kingdom.

In 1848, a wave of revolutions swept across the continent, sometimes called the Springtime of the Peoples. In February, French protesters overthrew King Louis-Philippe and founded the Second Republic. Uprisings followed in the Habsburg lands, the German states and Italy. In Frankfurt, delegates met to draft a constitution for a united Germany. Earlier that year, in February 1848, Karl Marx and Friedrich Engels had published The Communist Manifesto, calling for workers to unite.

Within a year or two most of the revolutions had failed. The Habsburgs and Prussia crushed or outlasted their opponents, the Frankfurt Parliament collapsed, and in France Louis-Napoleon Bonaparte was elected president in December 1848 and later made himself emperor. Yet lasting changes remained, such as the end of serfdom in the Habsburg lands. The aspirations of 1848 did not disappear.`,
          },
          {
            id: L23,
            title: 'The Unification of Italy and Germany',
            blurb: 'In a decade, two fragmented regions became nation-states through diplomacy, war and popular movements.',
            minutes: 8,
            body: `In the mid-nineteenth century Italy was divided among several states, some ruled or influenced by Austria, and the German lands were a loose confederation of states. Nationalists wanted unity, but they differed on how to achieve it.

In Italy, the movement is called the Risorgimento. Count Camillo di Cavour, prime minister of the kingdom of Piedmont-Sardinia, used diplomacy and an alliance with France to push out Austria from much of the north. In 1860 the volunteer leader Giuseppe Garibaldi sailed with about a thousand men to Sicily and overthrew the Bourbon kingdom in the south. In 1861 the Kingdom of Italy was proclaimed under Victor Emmanuel II. Venice joined in 1866, and Rome in 1870, after French troops withdrew. Unity left deep regional differences, especially between north and south.

In Germany, Prussia took the lead. Otto von Bismarck, who became Prussia's minister-president in 1862, followed a policy often called Realpolitik, which means politics based on practical power rather than ideals. Prussia fought Denmark in 1864, defeated Austria in 1866 and excluded it from German affairs, and defeated France in the Franco-Prussian War of 1870 to 1871. On 18 January 1871 the German Empire was proclaimed in the Hall of Mirrors at Versailles, with the Prussian king Wilhelm I as emperor.

Historians discuss how much unification came from popular nationalism and how much from the decisions of statesmen and armies. Both mattered, and the new states also left out or marginalised minorities.`,
          },
          {
            id: L24,
            title: 'The New Imperialism',
            blurb: 'Between about 1870 and 1914, European states claimed most of Africa and expanded across Asia.',
            minutes: 9,
            body: `The decades before the First World War saw a rush to claim overseas territory, called the New Imperialism. Motives included markets and raw materials, naval and strategic bases, national prestige, missionary zeal and a belief in a European "civilising mission," often tied to racial theories that we now recognise as false and harmful. Technologies such as steamships, railways, quinine against malaria, and rapid-firing rifles made conquest easier.

Africa saw the most dramatic change. In 1870 Europeans controlled only a fraction of the continent, mostly near the coast. By 1914, they governed nearly all of it, with Ethiopia and Liberia the main exceptions. The Berlin Conference of 1884 and 1885 set diplomatic rules for claiming African territory among European powers, with no African representatives present. It did not itself divide Africa, but it helped formalise competition.

Colonial rule varied but often involved forced labour, heavy taxes and violence. King Leopold II of Belgium ran the Congo Free State as a personal possession, where a system of forced rubber collection led to massive suffering, killings and mutilations. Estimates of deaths run into the millions but are debated. International outrage led the Belgian state to take over the colony in 1908.

Africans and Asians resisted. Ethiopia defeated an Italian army at Adwa in 1896, ensuring its independence. In India, the rebellion of 1857 led the British Crown to take direct control from the East India Company in 1858. The effects of this period on borders, economies and identities are still debated, and its legacies shaped the later struggle for independence.`,
          },
        ],
      },
      {
        id: 'history-europe.t6',
        title: 'Total War, Revolution and Dictatorship',
        blurb: 'The First World War, the Russian revolutions, the rise of fascism, the Second World War and the Holocaust.',
        level: 'ADVANCED',
        lessons: [
          {
            id: L25,
            title: 'The First World War',
            blurb: 'A crisis in the Balkans in 1914 grew into a four-year industrial war that destroyed empires.',
            minutes: 9,
            body: `By 1914 Europe was divided into two alliance blocs, the Triple Entente of Britain, France and Russia and the Triple Alliance centred on Germany, Austria-Hungary and Italy. Naval and arms races, imperial rivalry and nationalism raised tensions. The immediate spark came on 28 June 1914, when Gavrilo Princip, a Bosnian Serb nationalist, shot Archduke Franz Ferdinand, heir to the Austro-Hungarian throne, in Sarajevo. Austria-Hungary, backed by Germany, issued an ultimatum to Serbia, and within weeks Russia, Germany, France and Britain were at war. Germany's invasion of neutral Belgium brought Britain in.

On the Western Front, armies dug trenches from the Channel to Switzerland and attacks achieved little at enormous cost, as at Verdun and the Somme in 1916. Other fronts stretched across eastern Europe, the Middle East and Africa. The war was fought with machine guns, heavy artillery, poison gas and, increasingly, aircraft and tanks. The United States entered in April 1917, and Russia left the war after revolution. An armistice took effect on 11 November 1918. Roughly nine to ten million soldiers died, along with millions of civilians.

In 1915 the Ottoman government deported and killed large numbers of Armenians, which most historians and many governments recognise as genocide; the modern Turkish state disputes this term. The Treaty of Versailles of 1919 required Germany to accept responsibility for the war in Article 231 and to pay reparations. Four empires, the German, Austro-Hungarian, Russian and Ottoman, ended. Historians still debate responsibility for the war, with some stressing Germany's decisions and others the shared failures of all the powers.`,
          },
          {
            id: L26,
            title: 'The Russian Revolutions and the Soviet Union',
            blurb: 'Two revolutions in 1917 toppled the tsar and brought the Bolsheviks to power.',
            minutes: 9,
            body: `Russia entered the First World War with a poor, mostly peasant population and an autocratic tsar, Nicholas II. Military defeats, shortages and strikes brought protests in Petrograd in February 1917 (March by the Western calendar, because Russia still used the older Julian calendar). Soldiers joined the protesters and the tsar abdicated. A Provisional Government took charge, but it shared power with the Petrograd Soviet, a council of workers and soldiers, and it continued the unpopular war.

In October 1917 (November in the Western calendar), the Bolsheviks, led by Vladimir Lenin, seized power in Petrograd. They promised peace, land and bread. In March 1918 they signed the Treaty of Brest-Litovsk with Germany, giving up large territories. A civil war followed from 1918 to 1921 between the Bolshevik Reds and a mixed group of opponents, the Whites, with foreign intervention. Both sides committed atrocities, and the Bolsheviks used a campaign of repression known as the Red Terror. Famine and disease killed millions. Historians debate why the Bolsheviks won, pointing to their organisation, control of central cities and railways, and divided opponents.

The Soviet Union was formed in December 1922. After Lenin died in 1924, Joseph Stalin gained control. In the 1930s he forced agriculture into collective farms, and a famine in 1932 and 1933 killed millions, including in Ukraine, where many historians and governments call it a genocide, the Holodomor, a classification that is debated. In 1937 and 1938 the Great Terror saw hundreds of thousands executed, and many more sent to labour camps called the Gulag.`,
          },
          {
            id: L27,
            title: 'Interwar Europe and the Rise of Fascism',
            blurb: 'Economic crisis and political anger allowed dictatorships to replace democracy in much of Europe.',
            minutes: 9,
            body: `After 1918, many new democracies appeared, but they were fragile. Germany's Weimar Republic was blamed by many for the defeat and the Treaty of Versailles, and it suffered hyperinflation in 1923, when money became almost worthless. Economic recovery in the later 1920s ended with the Great Depression, which followed the stock market crash of 1929 and brought mass unemployment.

Fascism was a new, extreme nationalist and authoritarian movement. Benito Mussolini, whose followers staged a March on Rome in October 1922, was appointed prime minister by the king and turned Italy into a one-party dictatorship. Fascist regimes glorified the nation and the leader, attacked communists, socialists and liberals, used violence and propaganda, and rejected democracy.

In Germany, Adolf Hitler's Nazi Party tried to seize power in the failed Beer Hall Putsch of 1923, then built a mass movement. By July 1932 it was the largest party in the Reichstag, with about 37 percent of the vote, but it never won a majority in a free election. On 30 January 1933 Hitler was appointed chancellor by President Hindenburg, partly because conservative politicians thought they could control him. Within months, after the Reichstag Fire and the Enabling Act, Germany became a dictatorship. In 1935 the Nuremberg Laws stripped Jews of citizenship and began defining them by ancestry.

Elsewhere, Francisco Franco won the Spanish Civil War of 1936 to 1939. Britain and France tried to avoid war by appeasement, as at the Munich Agreement of 1938, which let Germany take the Sudetenland from Czechoslovakia. In August 1939 Germany and the Soviet Union signed a non-aggression pact.`,
          },
          {
            id: L28,
            title: 'The Second World War and the Holocaust',
            blurb: 'The deadliest war in history included the systematic murder of Europe\'s Jews.',
            minutes: 10,
            body: `Germany invaded Poland on 1 September 1939, and Britain and France declared war two days later. The Soviet Union invaded eastern Poland on 17 September under a secret protocol of its pact with Germany. In 1940 Germany conquered Norway, Denmark, the Low Countries and France, and Britain survived the air campaign called the Battle of Britain. On 22 June 1941 Germany attacked the Soviet Union. After Japan attacked Pearl Harbor in December 1941, the United States joined the Allies. The Soviet victory at Stalingrad in early 1943, and the Allied landings in Normandy on 6 June 1944, helped turn the war. Germany surrendered in May 1945. Estimates of total deaths in the war range roughly from 70 to 85 million, most of them civilians.

The Holocaust was the systematic, state-organised murder of about six million Jews by Nazi Germany and its collaborators. It began with persecution in the 1930s. After the invasion of the Soviet Union, mobile units called Einsatzgruppen shot hundreds of thousands of Jews. In January 1942, officials met at Wannsee to coordinate the plan. Jews were then deported from across Europe to killing centres such as Auschwitz-Birkenau and Treblinka. The Nazis also murdered Roma and Sinti, people with disabilities, and many Soviet prisoners of war, and persecuted political opponents, Jehovah's Witnesses and gay men.

Some people resisted, hid or rescued Jews at great risk, and uprisings took place, such as in the Warsaw Ghetto in 1943. Many others took part or looked away. The Nuremberg trials of 1945 and 1946 prosecuted leading Nazis. Historians study how decisions were made and how far plans were set from the start, but the facts of the genocide are thoroughly documented.`,
          },
        ],
      },
      {
        id: 'history-europe.t7',
        title: 'Division, Decolonisation and Integration',
        blurb: 'The Cold War split, the end of European empires, the creation of the European Union, and the upheavals since 1989.',
        level: 'ADVANCED',
        lessons: [
          {
            id: L29,
            title: 'Cold War Europe',
            blurb: 'After 1945, Europe was divided between a Soviet-led East and a U.S.-aligned West.',
            minutes: 9,
            body: `The wartime alliance between the Soviet Union and the Western powers fell apart soon after 1945. Soviet forces occupied Eastern Europe, and communist governments, backed by Moscow, took power there between 1945 and 1948. In a 1946 speech in Fulton, Missouri, Winston Churchill said an "iron curtain" had descended across the continent. The United States responded with the Truman Doctrine of 1947, promising support to countries resisting communism, and the Marshall Plan of 1948, which provided billions of dollars to rebuild Western European economies. The Soviet Union rejected the plan for itself and its satellites.

Germany became the focus of the division. Berlin, deep inside the Soviet zone, was split into four sectors. In 1948 the Soviets blockaded the western sectors, and the Western allies supplied the city by air for almost a year. In 1949 two German states formed: the Federal Republic in the west and the German Democratic Republic in the east. NATO, a Western military alliance, was created in 1949, and the Warsaw Pact answered it in 1955.

Moscow crushed challenges within its bloc. Soviet tanks ended the Hungarian uprising of 1956, and Warsaw Pact forces invaded Czechoslovakia in 1968 to end the reforms of the Prague Spring. In 1961 East Germany built the Berlin Wall to stop its citizens fleeing west.

The superpowers never fought directly, but they backed rival sides in wars elsewhere and built vast nuclear arsenals. In the 1970s a period of reduced tension, called detente, led to the Helsinki Accords of 1975, which included commitments on human rights that dissidents in the East later invoked.`,
          },
          {
            id: L30,
            title: 'Decolonisation',
            blurb: 'After 1945, European empires in Asia, Africa and the Middle East ended, sometimes peacefully and often through violence.',
            minutes: 9,
            body: `The Second World War weakened Britain, France and the Netherlands economically and morally, while nationalist movements in their colonies grew stronger. Their leaders argued that the fight against fascism should apply to colonial rule too. The United States and the Soviet Union, both officially critical of old-style empires, also shaped the era.

In 1947 British India became independent as two states, India and Pakistan. The partition caused mass migration and communal violence; estimates of those killed vary widely, from hundreds of thousands to perhaps a million or more. The Dutch lost Indonesia in 1949 after a war of independence. In 1957, Ghana became the first sub-Saharan African colony to gain independence from Britain, and in 1960 seventeen African states became independent in a single year.

The process was often violent. France fought in Vietnam until 1954 and then in Algeria from 1954 to 1962, a brutal war marked by torture and attacks on civilians and ending in Algerian independence. In Kenya, Britain suppressed the Mau Mau rebellion in the 1950s and held many thousands in detention camps, where abuses occurred. In 1956 Britain and France, with Israel, attacked Egypt over the Suez Canal and withdrew under American and Soviet pressure, a sign of reduced European power. The Belgian Congo became independent in 1960 amid chaos. Portugal clung to its African colonies until a revolution at home in 1974 led to their independence.

Decolonisation brought migration to Europe from former colonies, and the memory of empire is still debated, from museums returning artefacts to how schools teach colonial history.`,
          },
          {
            id: L31,
            title: 'European Integration',
            blurb: 'Former enemies built shared institutions, step by step, from coal and steel to a single market and currency.',
            minutes: 9,
            body: `After two devastating wars, some leaders sought to bind France and Germany together so that another war would become unthinkable. On 9 May 1950, the French foreign minister Robert Schuman proposed pooling coal and steel production, the materials of war. In 1951 six countries, France, West Germany, Italy, Belgium, the Netherlands and Luxembourg, formed the European Coal and Steel Community. The Treaty of Rome in 1957 created the European Economic Community, a common market among the same six.

The community grew. Britain, Ireland and Denmark joined in 1973, followed by Greece in 1981 and Spain and Portugal in 1986. The Single European Act of 1986 aimed to complete a single market with free movement of goods, services, capital and people. The Maastricht Treaty, signed in 1992, created the European Union and set out the path to a common currency. Euro banknotes and coins entered circulation in 2002, though only some members adopted them.

Integration has always been contested. Supporters point to peace among members, trade and shared rules. Critics raise concerns about democratic accountability, national sovereignty and the pace of change. Some people, called federalists, want a stronger union, while others prefer cooperation between sovereign states. Referendums in several countries have rejected treaty changes at times.

The most dramatic reversal came when voters in the United Kingdom chose to leave the EU in a referendum in June 2016. The UK formally left on 31 January 2020. Historians and political scientists continue to debate the causes and consequences of that decision and of the larger project.`,
          },
          {
            id: L32,
            title: '1989 and After',
            blurb: 'The collapse of communism in Europe reshaped the continent and opened new conflicts and questions.',
            minutes: 10,
            body: `In 1985 Mikhail Gorbachev became leader of the Soviet Union and introduced reforms called glasnost (openness) and perestroika (restructuring). In Poland, the independent trade union Solidarity, born in 1980, forced talks with the government, which led to partly free elections in June 1989. Hungary began opening its border with Austria. On 9 November 1989 the Berlin Wall was opened, after weeks of protests in East Germany. Czechoslovakia's Velvet Revolution followed that month. In Romania, a violent uprising in December ended with the execution of the dictator Nicolae Ceausescu on 25 December. Germany was reunified on 3 October 1990, and the Soviet Union dissolved in December 1991.

The transition brought hope and hardship. Former communist states built new political systems, and many joined NATO and the European Union, with ten states joining the EU in 2004. Economic change also meant unemployment and inequality for many people, and the legacy of the old regimes, including secret police files, remained contested.

Yugoslavia broke apart in violent wars from 1991 to 2001. In Bosnia, from 1992 to 1995, ethnic cleansing and sieges killed many thousands. In July 1995, Bosnian Serb forces killed about 8,000 Bosniak men and boys at Srebrenica, an act that international courts have ruled to be genocide. The Dayton Agreement ended the Bosnian war in 1995.

Peace in Europe was not guaranteed. In February 2022 Russia launched a full-scale invasion of Ukraine, the largest war in Europe since 1945. Historians study 1989 as a moment of popular action and also of long-term causes, such as economic stagnation, and debate how much the West, Gorbachev or the peoples of Eastern Europe drove the changes.`,
          },
        ],
      },
    ],
  },
  bank: {
    curriculumId: 'history-europe',
    questions: [
      // L01
      tf(L01, 1, 1, "Linear B, the script of the Mycenaean palaces, turned out to record an early form of Greek.", 0, "Think about what Michael Ventris showed in 1952.", "Ventris demonstrated that Linear B writes Greek, proving the language was written in the second millennium BCE."),
      mc(L01, 2, 1, "Which Bronze Age civilisation is centred on palace sites such as Knossos on Crete?", ["The Minoans", "The Mycenaeans", "The Spartans", "The Etruscans"], "The name comes from a legendary king of Crete.", "Knossos was the best-known palace centre of the Minoans on Crete."),
      mc(L01, 3, 2, "What do most surviving Linear B tablets contain?", ["Administrative accounts such as inventories of goods and workers", "Epic poems about gods and heroes", "Histories of Mycenaean kings and of their long wars against Troy and Thebes", "Philosophical arguments"], "Think about what palace bureaucrats needed to record.", "The tablets are mostly records of goods, livestock and workers, showing palace-run economies."),
      mc(L01, 4, 2, "Why is it risky to treat Homer's epics as a direct record of Mycenaean society?", ["They were composed long after the Mycenaean age", "They were written in Linear B", "They were composed by Minoan scribes", "They contain no references to the Bronze Age at all"], "Consider the gap in time between the palaces and the poems.", "The epics took shape centuries after the Bronze Age collapse, so they blend memory, later customs and invention."),
      mc(L01, 5, 3, "Which statement best reflects the scholarly view of the Late Bronze Age collapse around 1200 BCE?", ["Several causes, such as drought, earthquakes, conflict and disrupted trade, are debated rather than one proven cause", "It was caused solely by a single invasion that is fully documented", "It had no effect on Aegean palaces", "It was caused mainly by the invention of iron weapons, which all historians agree on"], "The lesson says historians argue over how much weight each cause deserves.", "The evidence is patchy and scholars debate the mix of causes."),
      // L02
      tf(L02, 1, 1, "In classical Athens, women and enslaved people could vote in the assembly.", 1, "Who counted as a citizen?", "Citizenship was limited to adult men born to Athenian citizens; women, enslaved people and foreign residents were excluded."),
      mc(L02, 2, 1, "Who won the Peloponnesian War, fought from 431 to 404 BCE?", ["Sparta and its allies", "Athens and its Delian League allies", "Persia and its satrapies in Asia Minor", "Macedon under Philip and Alexander"], "Think about which city was defeated after a long conflict.", "Athens was defeated by Sparta and its allies in 404 BCE."),
      mc(L02, 3, 2, "What does the word polis refer to?", ["A city-state with its surrounding land", "A Persian province governed by a satrap on the king's behalf", "A type of Greek warship", "A council of Spartan kings"], "It is the basic unit of Greek political life.", "A polis was a city-state, and hundreds existed with their own laws."),
      mc(L02, 4, 2, "Which battle in 480 BCE helped the Greeks defeat the Persian fleet?", ["Salamis", "Marathon", "Cannae", "Actium"], "It was a naval victory, a decade after Marathon.", "The Greek fleet won at Salamis in 480 BCE, which was followed by victory at Plataea in 479 BCE."),
      tf(L02, 5, 3, "Alexander the Great's empire stayed unified under a single ruler for centuries after his death in 323 BCE.", 1, "Think about what his generals did.", "His generals divided the realm into separate Hellenistic kingdoms."),
      // L03
      tf(L03, 1, 1, "Roman consuls were elected for a single year, and two served at the same time.", 0, "The system was designed so that no one man ruled alone.", "Two consuls held office for one year, sharing power."),
      mc(L03, 2, 1, "Which general crossed the Alps with an army to attack Rome during the Second Punic War?", ["Hannibal", "Scipio", "Caesar", "Alexander"], "He came from Carthage.", "Hannibal of Carthage crossed the Alps and won at Cannae in 216 BCE."),
      mc(L03, 3, 2, "What was the main job of the tribunes of the plebs?", ["Protecting ordinary citizens from the actions of aristocratic magistrates", "Commanding the Roman fleet", "Choosing the consuls by lot", "Governing conquered provinces"], "The office arose from conflict between plebeians and patricians.", "Tribunes were created to defend plebeians against the power of aristocratic officials."),
      mc(L03, 4, 3, "Why did Roman success in conquest strain the Republic, according to the lesson?", ["Armies became loyal to ambitious generals, and wealth and land became concentrated", "Carthage conquered Italy and ended the Republic", "The Senate was abolished by the first consul", "Rome ran out of citizens"], "Think about whom soldiers were loyal to.", "Conquest enriched a few, displaced small farmers, and made generals more powerful than the institutions meant to control them."),
      tf(L03, 5, 2, "The date 509 BCE for the founding of the Republic is a traditional date, not a certain one.", 0, "The lesson says the date comes from Roman tradition.", "Roman accounts of the expulsion of the kings were written much later, so the exact date is traditional."),
      // L04
      tf(L04, 1, 1, "Julius Caesar was assassinated by a group of senators in 44 BCE.", 0, "It happened on the Ides of March.", "A group of senators killed Caesar on 15 March 44 BCE."),
      mc(L04, 2, 1, "Which title did the Senate give to Octavian in 27 BCE?", ["Augustus", "Dictator for life", "Consul of Gaul", "Tribune of the plebs"], "It became the name by which he is best known.", "Octavian received the title Augustus in 27 BCE, marking the start of the principate."),
      mc(L04, 3, 2, "What does the term Pax Romana describe?", ["A period of relative stability inside the empire, roughly 27 BCE to 180 CE", "A treaty that ended the Punic Wars", "A peace between Rome and Persia that lasted a thousand years", "A law that banned slavery"], "The lesson says it does not mean peace for everyone.", "The Pax Romana was a long period of relative internal stability, although Rome still conquered, fought and used slavery."),
      mc(L04, 4, 2, "What did the emperor Caracalla do in 212 CE?", ["Extended citizenship to nearly all free inhabitants of the empire", "Divided the empire into east and west", "Moved the capital to Constantinople", "Ended the use of Latin"], "It widened who counted as a Roman.", "Caracalla's edict gave citizenship to almost all free people in the empire."),
      mc(L04, 5, 3, "Which statement best captures the historical debate about Augustus?", ["Whether he restored the Republic or ended it while keeping its forms", "Whether he lived in Rome", "Whether he defeated Antony and Cleopatra", "Whether he was legally named as Julius Caesar's heir in the dictator's will"], "The question concerns what his system really was.", "He kept republican offices but held real power, so historians argue about how to describe the system."),
      // L05
      tf(L05, 1, 1, "The Edict of Milan in 313 CE granted toleration to Christians in the Roman Empire.", 0, "Think about Constantine's religious policy.", "The Edict of Milan ended official persecution and granted toleration to Christians."),
      mc(L05, 2, 1, "Which general removed the last western emperor, Romulus Augustulus, in 476?", ["Odoacer", "Alaric", "Constantine", "Attila"], "He is the one traditionally credited with ending the western empire.", "Odoacer deposed Romulus Augustulus in 476, the conventional end date of the western empire."),
      mc(L05, 3, 2, "Which city did Constantine dedicate as a new eastern capital in 330?", ["Constantinople", "Alexandria in Egypt", "Ravenna in northern Italy", "Athens in mainland Greece"], "It was named after him.", "Constantinople was dedicated in 330 and later became the capital of the eastern empire."),
      mc(L05, 4, 2, "What happened in 410?", ["The Visigoth leader Alaric sacked the city of Rome", "Constantine called the Council of Nicaea to settle the Arian dispute", "Odoacer took power in Italy", "The Goths won at Adrianople"], "It shocked people across the empire.", "Alaric's sack of Rome in 410 was a psychological blow to the Roman world."),
      mc(L05, 5, 3, "How do many modern historians prefer to describe the end of Roman rule in the west?", ["As a gradual transformation influenced by several pressures", "As a sudden collapse on a single day", "As the direct result of one decisive battle fought near Ravenna in 476", "As an event nobody at the time noticed or recorded"], "The lesson contrasts Gibbon's view with newer views.", "Many historians stress gradual change shaped by military pressure, civil wars and economic problems."),
      // L06
      tf(L06, 1, 1, "The people of the eastern Roman Empire usually called themselves Romans.", 0, "The word Byzantine came later.", "The term Byzantine was applied by later writers; the people considered themselves Romans."),
      mc(L06, 2, 1, "Which emperor oversaw the compilation of the Corpus Juris Civilis and the building of Hagia Sophia?", ["Justinian", "Constantine", "Augustus", "Charlemagne"], "He ruled from 527 to 565.", "Justinian had Roman law gathered and organised and built Hagia Sophia, completed in 537."),
      mc(L06, 3, 2, "What was the dispute known as iconoclasm about?", ["The use of religious images", "The date of Easter", "The succession to the throne", "The tax on grain"], "The word refers to breaking images.", "Iconoclasm was a conflict over religious images, ending with their restoration in 843."),
      mc(L06, 4, 2, "In which year did the Ottoman sultan Mehmed II capture Constantinople?", ["1453", "1204", "1054", "1492"], "It marks the end of the Byzantine Empire.", "The fall of Constantinople in 1453 ended the Byzantine Empire."),
      tf(L06, 5, 3, "The Fourth Crusade sacked the Christian city of Constantinople in 1204.", 0, "A crusade turned on a Christian capital.", "In 1204, Crusaders sacked Constantinople, which weakened the empire and deepened the split between eastern and western churches."),
      // L07
      tf(L07, 1, 1, "Charlemagne was crowned emperor by Pope Leo III on Christmas Day in the year 800.", 0, "It happened in Rome.", "Pope Leo III crowned Charlemagne in Rome on 25 December 800."),
      mc(L07, 2, 1, "Which group did Clovis lead?", ["The Franks", "The Vandals", "The Lombards", "The Visigoths"], "Their kingdom became the core of later France.", "Clovis was a Frankish king who converted to Catholic Christianity around 500."),
      mc(L07, 3, 2, "Why were monasteries important in the early Middle Ages?", ["They copied manuscripts, ran schools and farms, and kept literacy alive", "They collected taxes on behalf of the emperor in every western province", "They commanded the largest armies", "They elected kings"], "Think about who could read and write in this period.", "Monks preserved texts and learning when literacy was rare."),
      mc(L07, 4, 2, "What did the Treaty of Verdun in 843 do?", ["Divided Charlemagne's empire among his grandsons", "Ended the Hundred Years' War", "Created the Holy Roman Empire", "Split Christianity into eastern and western churches over papal authority"], "It concerned the empire after Charlemagne.", "The treaty divided the Carolingian empire into western, eastern and middle parts."),
      tf(L07, 5, 3, "Charlemagne's conquests were entirely peaceful.", 1, "Recall his campaign against the Saxons.", "His wars, including the campaign against the Saxons, were brutal."),
      // L08
      tf(L08, 1, 1, "The invading army that crossed into Iberia in 711 was led by Tariq ibn Ziyad.", 0, "Look at the start of the lesson.", "Tariq ibn Ziyad led the force that defeated the Visigothic king Roderic."),
      mc(L08, 2, 1, "Which city became the capital of the Umayyad emirate and later caliphate in Iberia?", ["Córdoba", "Toledo", "Granada", "Seville"], "It had a great mosque and large libraries.", "Abd al-Rahman I made Córdoba the centre of the Umayyad emirate in 756."),
      mc(L08, 3, 2, "What does convivencia refer to?", ["A period of coexistence among Muslims, Christians and Jews, a term historians debate", "A treaty ending the Reconquista", "A tax paid by Christians", "A type of Moorish architecture"], "The word means living together.", "Some historians use the term for coexistence, while others stress persecution and inequality."),
      mc(L08, 4, 2, "What happened in 1492 in Iberia?", ["Granada, the last Muslim state, fell", "Toledo fell to Castile", "The caliphate of Córdoba was founded", "Abd al-Rahman I arrived in Spain"], "It is also the year of Columbus's first voyage.", "Granada fell in 1492, ending Muslim political rule in the peninsula."),
      mc(L08, 5, 3, "Why is the word Reconquista described as reflecting a Christian viewpoint?", ["It frames the process as retaking land that was seen as rightfully Christian", "It was coined by Muslim chroniclers", "It describes only the fall of Granada", "It refers to the Spanish conquest of the Americas in the sixteenth century"], "Think about who named the process and why.", "The term presents the northern kingdoms' expansion as recovery of lost land, a perspective not shared by all."),
      // L09
      tf(L09, 1, 1, "Archaeology at L'Anse aux Meadows shows that Norse people reached North America around the year 1000.", 0, "It is in Newfoundland.", "L'Anse aux Meadows is a Norse site that confirms contact centuries before Columbus."),
      mc(L09, 2, 1, "Which monastery raid in 793 is traditionally taken as the start of the Viking Age?", ["Lindisfarne", "Iona, off the Scottish coast", "Canterbury in southern England", "Rome, the seat of the pope"], "It is on an island off northeast England.", "The raid on Lindisfarne shocked contemporaries."),
      mc(L09, 3, 2, "Who were the Normans?", ["Descendants of Vikings granted land in northern France", "Swedish traders in Russia", "Danish kings who ruled England in the early eleventh century", "Icelandic settlers"], "Their name comes from North-men.", "Rollo's group received land around 911 and their descendants became the Normans."),
      mc(L09, 4, 2, "Why should historians be cautious when using the Icelandic sagas as evidence?", ["They were written down long after the events, by Christians looking back", "They were written in Linear B", "They were forged by nationalist scholars in the nineteenth century to invent a past", "They only describe events in Greenland"], "Consider when they were written compared with the events.", "The sagas date mostly from the thirteenth century and reflect later perspectives."),
      mc(L09, 5, 3, "Which description of Vikings best matches the lesson?", ["Raiders, but also traders, settlers and mercenaries", "Purely peaceful merchants who never took part in raids on coasts", "Only farmers who never left Scandinavia", "Soldiers who served only the Byzantine emperor"], "The lesson says they did more than raid.", "Vikings raided and enslaved people but also traded, settled and fought as mercenaries."),
      // L10
      tf(L10, 1, 1, "Most medieval Europeans were peasants, many of them serfs.", 0, "Think about how most people made a living.", "The great majority worked the land, and many were serfs obliged to a lord."),
      mc(L10, 2, 1, "What was a fief?", ["Land held from a lord in return for service and loyalty", "A church tax of one tenth paid on crops and livestock to the parish", "A council of bishops", "A survey of English landholding"], "It was the basis of the lord and vassal bond.", "A fief was land granted by a superior in exchange for military service and loyalty."),
      mc(L10, 3, 2, "What was the Investiture Controversy about?", ["Whether kings or popes had the right to appoint bishops", "Who owned the Domesday Book", "How to tax peasants", "The correct date of Easter and how to calculate the church calendar"], "It involved Gregory VII and Henry IV.", "Rulers and popes quarrelled over the appointment of bishops, and the Concordat of Worms in 1122 largely settled it."),
      tf(L10, 4, 2, "Some historians argue that the neat pyramid of king, lords and vassals oversimplifies how medieval society worked.", 0, "The lesson says to treat the term with care.", "Practices varied widely, so feudalism is better seen as a convenient label than a single system."),
      mc(L10, 5, 3, "What was the Domesday Book, compiled in 1086?", ["A survey of landholding in England after the Norman conquest", "A code of Church law", "A list of Crusade participants", "A record of Viking raids"], "It followed the Battle of Hastings.", "William's officials surveyed England's land and its holders, showing how the Normans organised land and loyalty."),
      // L11
      tf(L11, 1, 1, "The First Crusade captured Jerusalem in 1099.", 0, "It was the main goal of the campaign.", "Crusaders took Jerusalem in July 1099 and massacred many of its inhabitants."),
      mc(L11, 2, 1, "Who preached at the Council of Clermont in 1095, calling for an armed pilgrimage?", ["Pope Urban II", "Saladin, the Ayyubid sultan", "Richard I of England", "Alexios I Komnenos of Byzantium"], "He was the head of the western Church.", "Pope Urban II launched the First Crusade after the Byzantine emperor asked for help."),
      mc(L11, 3, 2, "Which Muslim leader retook Jerusalem in 1187?", ["Saladin", "Mehmed II", "Tariq ibn Ziyad", "Abd al-Rahman III"], "He had united Egypt and Syria.", "Saladin recaptured Jerusalem in 1187."),
      mc(L11, 4, 2, "What was unusual about the Fourth Crusade?", ["It sacked the Christian city of Constantinople in 1204", "It captured Jerusalem peacefully through a treaty with the sultan", "It was led by the Byzantine emperor", "It never left Europe"], "Think about whose city was attacked.", "The Fourth Crusade turned on Constantinople, deepening divisions between eastern and western Christians."),
      mc(L11, 5, 3, "Which statement fits the lesson's description of crusader motives?", ["They were mixed, including religious devotion, hopes of land and wealth, and loyalty to lords", "They were purely economic", "They were purely religious, with no political aims", "They were decided entirely by the Byzantine emperor"], "The lesson says historians debate the mix.", "Historians continue to debate how far religion, economics and politics drove the crusades."),
      // L12
      tf(L12, 1, 1, "The Black Death is linked by ancient DNA evidence to the bacterium Yersinia pestis.", 0, "Scientists have studied victims' remains.", "Ancient DNA from victims confirmed the bacterium as the cause."),
      mc(L12, 2, 1, "Roughly how much of Europe's population do many historians think was lost?", ["Perhaps a third or more", "About one percent", "Almost everyone", "About a tenth"], "The lesson calls the figure uncertain because records are patchy.", "Mortality varied by place, but many estimates are around a third or more of the population."),
      mc(L12, 3, 2, "Why did wages tend to rise after the Black Death?", ["Labour became scarce because so many workers had died", "Kings paid higher taxes", "Serfdom was newly introduced and spread across all of western Europe", "Machines replaced farm work"], "Think of supply and demand for workers.", "With fewer workers, labour was in demand, and some lords struggled to keep serfs on the land."),
      mc(L12, 4, 2, "What false accusation led to massacres of Jewish communities in 1348 and 1349?", ["That they had poisoned wells", "That they had started a war", "That they had refused to pay taxes", "That they had spread printed books"], "It concerned water supplies.", "Rumours about well poisoning led to massacres, even though Jewish communities also suffered from plague."),
      tf(L12, 5, 3, "The Statute of Labourers of 1351 was an English attempt to hold wages down.", 0, "The government reacted to labour shortages.", "The statute tried to freeze wages, and tensions over such measures contributed to the Peasants' Revolt of 1381."),
      // L13
      tf(L13, 1, 1, "Magna Carta was sealed by King John in 1215.", 0, "It took place at Runnymede.", "A group of barons forced John to seal it in 1215."),
      mc(L13, 2, 1, "Which war lasted from 1337 to 1453 between the English and French crowns?", ["The Hundred Years' War", "The Thirty Years' War in Germany", "The Wars of the Roses in England", "The Punic Wars between Rome and Carthage"], "The name gives a clue about duration.", "The conflict, with pauses, lasted 116 years."),
      mc(L13, 3, 2, "What idea does Magna Carta set down that became important later?", ["That the king was himself subject to law", "That all men were equal", "That parliaments should be elected by all adults", "That serfdom should be abolished"], "It was a deal between the king and his barons.", "Although practical in aim, it expressed the idea that rulers must obey the law."),
      mc(L13, 4, 2, "What did Joan of Arc do in 1429?", ["Helped relieve the siege of Orléans", "Won the Battle of Agincourt for the English crown", "Signed Magna Carta", "Founded the Estates General"], "She was a young peasant woman.", "She helped relieve Orléans in 1429, and she was burned after a trial in 1431."),
      mc(L13, 5, 3, "How should the late medieval representative assemblies be described?", ["As bodies for clergy, nobles and townspeople, not democracies", "As bodies elected by all adult citizens, men and women alike", "As bodies that ruled in place of kings", "As purely ceremonial gatherings"], "Think about who was represented.", "They gave elites a voice in taxation but did not include ordinary peasants."),
      // L14
      tf(L14, 1, 1, "The Renaissance began in Italian city-states such as Florence.", 0, "Think of the Medici.", "The movement started in Italy in the fourteenth and fifteenth centuries."),
      mc(L14, 2, 1, "Who developed a European printing system using movable metal type around 1450 in Mainz?", ["Johannes Gutenberg", "Leonardo da Vinci", "Martin Luther", "Filippo Brunelleschi"], "His Bible dates from around 1455.", "Gutenberg is credited with developing the European system of movable metal type."),
      mc(L14, 3, 2, "What does the lesson say about printing in East Asia?", ["Woodblock printing and early movable type existed there already", "It was unknown before Gutenberg", "It was banned by the Church", "It relied on metal type only and never used woodblocks or clay type"], "Gutenberg's was a European invention, not the first anywhere.", "East Asia had woodblock printing and early movable type before Gutenberg."),
      mc(L14, 4, 2, "What is a humanist, in this lesson's sense?", ["A scholar who studied classical texts and stressed education and human potential", "A person who rejected Christianity", "A Florentine banker", "A painter who used only linear perspective"], "Most were still devout Christians.", "Humanists revived Latin and Greek learning while mostly remaining religious."),
      tf(L14, 5, 3, "Historians agree that the Renaissance was a sudden break with a uniformly dark Middle Ages.", 1, "The lesson calls this an exaggeration.", "Many ideas and techniques developed earlier, and scholars still debate how sharply the Renaissance differs from the period before."),
      // L15
      tf(L15, 1, 1, "Martin Luther's Ninety-Five Theses criticised the sale of indulgences.", 0, "Think about what started the Reformation in 1517.", "The theses attacked indulgences and circulated widely thanks to printing."),
      mc(L15, 2, 1, "Which English king broke with Rome in the 1530s and became head of the English church?", ["Henry VIII", "Charles I of the Stuart line", "Henry IV of the Lancastrian line", "King John of the Magna Carta era"], "The Act of Supremacy was passed in 1534.", "Henry VIII made himself head of the English church, partly because the pope would not annul his marriage."),
      mc(L15, 3, 2, "What did the Peace of Augsburg of 1555 allow?", ["German rulers to choose Lutheranism or Catholicism for their territories", "Every individual to choose their own religion without state interference", "Protestants to rule the Empire", "The pope to appoint German princes"], "It was a compromise within the Holy Roman Empire.", "It let rulers decide between the two faiths for their lands."),
      mc(L15, 4, 2, "How did printing affect the Reformation?", ["It carried reformers' ideas quickly across Germany and beyond", "It made Luther's ideas illegal everywhere", "It made the Bible harder to read", "It had no effect because most people in Germany could not afford books"], "Think about the speed of spreading ideas.", "Printed pamphlets and Bibles spread reform ideas widely."),
      tf(L15, 5, 3, "Historians are certain that Luther nailed the Ninety-Five Theses to a church door.", 1, "The lesson says whether he did is debated.", "The story is traditional, but historians debate it; what is certain is that the theses circulated."),
      // L16
      tf(L16, 1, 1, "The Edict of Nantes of 1598 gave Huguenots limited rights in France.", 0, "Henry IV issued it to end the French Wars of Religion.", "It granted limited toleration and was revoked by Louis XIV in 1685."),
      mc(L16, 2, 1, "Which event in 1618 began the Thirty Years' War?", ["Protestant nobles in Prague threw royal officials from a window", "The execution of Charles I", "The Peace of Augsburg", "The Spanish Armada"], "It took place in Bohemia.", "The Defenestration of Prague began a conflict that spread across Europe."),
      mc(L16, 3, 2, "Which treaty ended the Thirty Years' War in 1648?", ["The Peace of Westphalia", "The Treaty of Verdun among Charlemagne's heirs", "The Edict of Nantes granting toleration in France", "The Peace of Augsburg of the 1550s"], "It is named for a region in Germany.", "The Peace of Westphalia ended the war and added Calvinism to the permitted faiths."),
      mc(L16, 4, 2, "Which statement about the Peace of Westphalia is most accurate?", ["It is often seen as an early step toward a system of sovereign states, though historians question how much it created that system", "It abolished all religious conflict in Europe", "It made Catholicism the only legal faith", "It ended the Holy Roman Empire immediately"], "The lesson hedges how much it invented sovereignty.", "Historians now question the idea that Westphalia alone created the modern state system."),
      tf(L16, 5, 3, "The Dutch Republic that emerged from rebellion against Spain tolerated more religious diversity than most states of the time.", 0, "Calvinism was favoured, but other groups were present.", "Calvinism was favoured, yet the Republic was more tolerant than many contemporaries."),
      // L17
      tf(L17, 1, 1, "Vasco da Gama reached India by sea in 1498.", 0, "He sailed for Portugal.", "Da Gama's voyage opened a sea route from Europe to India."),
      mc(L17, 2, 1, "What was the Columbian Exchange?", ["The transfer of plants, animals and diseases between the hemispheres", "A treaty dividing the newly found world between Spain and Portugal in 1494", "A trading company in Asia", "A tax on Atlantic shipping"], "It involved potatoes, horses and more.", "Species and diseases crossed the Atlantic in both directions after 1492."),
      mc(L17, 3, 2, "What did the Treaty of Tordesillas of 1494 do?", ["Divided newly claimed lands outside Europe between Spain and Portugal", "Ended the Thirty Years' War", "Founded the Dutch East India Company", "Set rules for the Atlantic slave trade"], "It ignored the people who lived in those lands.", "Spain and Portugal divided claims without regard to local inhabitants."),
      mc(L17, 4, 2, "Which factor killed the largest number of Indigenous people in the Americas after contact?", ["Epidemic diseases such as smallpox", "Volcanic eruptions and earthquakes across the Andes", "Famine caused by the failure of the potato crop", "Naval battles between Spanish and Portuguese fleets"], "Indigenous people had little immunity to these illnesses.", "Epidemics, alongside forced labour and violence, devastated Indigenous populations."),
      mc(L17, 5, 3, "Which summary of the Atlantic slave trade best fits the lesson?", ["Well over ten million Africans were shipped across the Atlantic, and the profits shaped European ports and banks", "A few thousand Africans were shipped across the Atlantic", "It was run only by Spain", "It ended in the sixteenth century"], "The lesson gives a minimum scale.", "The trade lasted centuries, with huge human cost and large economic effects in Europe."),
      // L18
      tf(L18, 1, 1, "Copernicus proposed in 1543 that the Earth and other planets orbit the Sun.", 0, "It is called the heliocentric model.", "His book set out a Sun-centred model of the planets."),
      mc(L18, 2, 1, "Which scientist published the Principia in 1687 setting out laws of motion and universal gravitation?", ["Isaac Newton", "Galileo Galilei", "Johannes Kepler", "Francis Bacon"], "His name is attached to a unit of force.", "Newton's Principia explained falling objects and planetary orbits with mathematical laws."),
      mc(L18, 3, 2, "What did Galileo observe with his telescope that supported Copernicus's view?", ["Moons orbiting Jupiter", "Rings around the Earth", "A flat Moon", "The Sun orbiting the Earth"], "It showed that not everything orbits the Earth.", "Observing moons orbiting Jupiter showed that some bodies circle something other than the Earth."),
      mc(L18, 4, 2, "How do historians often qualify the story of Galileo and the Church?", ["Personal rivalries, politics and disputes about interpretation also mattered, so it was not simply science versus religion", "He was never tried", "The Church supported him fully", "He abandoned science after 1633"], "The lesson says many scientists were devout.", "Historians stress that the conflict was more complex than a simple science versus religion story."),
      tf(L18, 5, 3, "Historians all agree the Scientific Revolution was a sudden event with no earlier roots.", 1, "The lesson mentions Greek and Islamic scholarship.", "It unfolded over a century and drew on earlier work, so scholars debate the term revolution."),
      // L19
      tf(L19, 1, 1, "Louis XIV built the palace of Versailles.", 0, "He is the most famous absolutist monarch.", "Louis XIV built Versailles and kept nobles close at court."),
      mc(L19, 2, 1, "Which thinker argued in The Spirit of the Laws (1748) for dividing government power into separate branches?", ["Montesquieu", "John Locke, the English philosopher", "Jean-Jacques Rousseau of Geneva", "Voltaire, the French satirist and essayist"], "The title of the book is a clue.", "Montesquieu argued for separation of powers."),
      mc(L19, 3, 2, "Which city did Peter the Great found in 1703?", ["St Petersburg", "Moscow", "Kyiv", "Constantinople"], "It was a new Russian capital on the Baltic.", "Peter founded St Petersburg and modernised the Russian army."),
      mc(L19, 4, 2, "What is an enlightened absolutist?", ["A ruler who adopted some Enlightenment reforms while keeping supreme power", "A philosopher who rejected monarchy and wanted rule by elected assemblies only", "A parliament member", "A revolutionary leader"], "Frederick II and Catherine II are examples.", "Such rulers reformed some practices but kept their authority."),
      mc(L19, 5, 3, "Which statement best reflects the limits of the Enlightenment discussed in the lesson?", ["Many thinkers accepted slavery or prejudice, while others such as Mary Wollstonecraft argued for wider rights", "All Enlightenment thinkers supported equal rights for all", "The Enlightenment had no political influence", "It was only a movement of kings"], "The lesson says tensions became central in later revolutions.", "The ideas of universal rights clashed with continuing exclusions, which later movements challenged."),
      // L20
      tf(L20, 1, 1, "The Bastille was stormed on 14 July 1789.", 0, "It is a French national holiday.", "Crowds attacked the Bastille prison on 14 July 1789."),
      mc(L20, 2, 1, "Which general seized power in France in 1799 and crowned himself emperor in 1804?", ["Napoleon Bonaparte", "Maximilien Robespierre", "Louis XVI", "Lafayette"], "He was defeated at Waterloo in 1815.", "Napoleon took power in 1799 and became emperor in 1804."),
      mc(L20, 3, 2, "What was the Terror of 1793 to 1794?", ["A period of repression under the Committee of Public Safety with many executions", "A foreign invasion of France", "A series of peasant revolts against the Assembly", "A treaty with Britain"], "Robespierre was one of its leaders.", "The government killed or imprisoned many perceived enemies during war and internal revolt."),
      mc(L20, 4, 2, "What did the Declaration of the Rights of Man and of the Citizen proclaim?", ["Liberty and equality before the law", "The divine right of kings to rule without limits", "The abolition of all private property in France", "The end of the war with Austria and Prussia"], "It was issued in August 1789.", "It proclaimed liberty and legal equality, though women and enslaved colonial people were not given the same rights."),
      mc(L20, 5, 3, "What was historically significant about the revolution in Saint-Domingue that began in 1791?", ["It created Haiti, the first state founded by a successful slave revolt", "It restored French rule in the Caribbean after a brief and bloody planters' revolt", "It made Napoleon emperor", "It ended the Terror"], "Independence came in 1804.", "Enslaved people rose and created independent Haiti in 1804."),
      // L21
      tf(L21, 1, 1, "The Industrial Revolution began in Britain.", 0, "Think about steam engines and textile mills.", "Britain led industrialisation from the later eighteenth century."),
      mc(L21, 2, 1, "Which industry was among the first to move from homes to factories?", ["Textiles", "Shipbuilding", "Banking", "Printing"], "Think about spinning and weaving machines.", "Spinning and weaving machines moved production into factories."),
      mc(L21, 3, 2, "What did the Factory Act of 1833 do?", ["Limited children's working hours in textile mills", "Abolished child labour entirely", "Gave workers the vote", "Created the first railway"], "Enforcement was weak at first.", "It restricted children's hours in textile mills, but enforcement was weak initially."),
      mc(L21, 4, 2, "Which statement about why Britain led industrialisation fits the lesson?", ["Historians cite several factors, with no single cause accepted by everyone", "Everyone agrees it was due only to coal", "It happened by pure chance", "It was caused by the invention of the railway, which came before any factories"], "The lesson lists coal, markets, capital and empire.", "Explanations include coal, markets, capital, commercial culture and colonial resources."),
      tf(L21, 5, 3, "Economic historians have settled the question of how quickly living standards rose in early industrial Britain.", 1, "The lesson says it is still argued.", "Whether living standards rose quickly or only after decades is still debated."),
      // L22
      tf(L22, 1, 1, "Nationalism is the belief that people sharing language or culture should form their own political community.", 0, "Look at the first sentence of the lesson.", "That is the basic definition of nationalism used in the lesson."),
      mc(L22, 2, 1, "Which year is known for a wave of revolutions across Europe called the Springtime of the Peoples?", ["1848", "1789", "1815", "1871"], "It is also the year of The Communist Manifesto.", "Revolutions swept France, the Habsburg lands, the German states and Italy in 1848."),
      mc(L22, 3, 2, "What happened to most of the 1848 revolutions within a year or two?", ["They were suppressed or collapsed", "They created lasting republics everywhere", "They united all of Europe", "They were led by Metternich"], "The lesson calls them largely failed in the short term.", "Most were crushed or fizzled, though some lasting changes remained."),
      mc(L22, 4, 2, "Which lasting change in the Habsburg lands came out of 1848?", ["The end of serfdom", "Universal male suffrage", "A single constitution for the Empire", "The abolition of the monarchy"], "It affected peasants.", "Serfdom was ended in the Habsburg lands even though the revolutions failed."),
      mc(L22, 5, 3, "Which pairing of country and event in the lesson is correct?", ["Belgium became independent from the Netherlands in 1830", "Greece was united with Italy in 1830", "Germany became a single republic under a written constitution in 1830", "Hungary joined France in 1830"], "It was a revolution that created a new kingdom.", "In 1830 Belgium broke from the Netherlands and became independent."),
      // L23
      tf(L23, 1, 1, "The German Empire was proclaimed in 1871 at Versailles.", 0, "France had just been defeated.", "Wilhelm I was proclaimed emperor on 18 January 1871 in the Hall of Mirrors."),
      mc(L23, 2, 1, "Who led the volunteer expedition that overthrew the Bourbon kingdom in southern Italy in 1860?", ["Giuseppe Garibaldi", "Cavour", "Bismarck", "Victor Emmanuel II"], "He sailed to Sicily with about a thousand men.", "Garibaldi's volunteers helped bring the south into the new Italy."),
      mc(L23, 3, 2, "What does Realpolitik mean?", ["Politics based on practical power rather than ideals", "Politics based on religion", "The rule of kings by divine right, as defended by the clergy", "A policy of neutrality"], "Bismarck is associated with it.", "The term describes pragmatic politics focused on power."),
      mc(L23, 4, 2, "Which war excluded Austria from German affairs?", ["The Austro-Prussian War of 1866", "The Crimean War between Russia and Britain", "The Franco-Prussian War of 1870 to 1871", "The Thirty Years' War of the seventeenth century"], "It occurred before the war with France.", "Prussia defeated Austria in 1866."),
      mc(L23, 5, 3, "Which statement fits the lesson's account of the debate about unification?", ["Both popular nationalism and the decisions of statesmen and armies mattered", "Only nationalism mattered", "Only the decisions of Bismarck and the Prussian army mattered at all", "Neither mattered"], "The lesson says both factors played a role.", "Historians discuss how nationalism and state power combined, and note minorities were marginalised."),
      // L24
      tf(L24, 1, 1, "By 1914, European powers governed nearly all of Africa, with Ethiopia and Liberia the main exceptions.", 0, "Compare 1870 with 1914.", "Africa saw the most dramatic change, from limited control in 1870 to nearly complete control by 1914."),
      mc(L24, 2, 1, "Who ran the Congo Free State as a personal possession?", ["King Leopold II of Belgium", "Queen Victoria, empress of India", "Otto von Bismarck, chancellor of Germany", "Napoleon III, emperor of the French"], "He was the Belgian king.", "Leopold II controlled the Congo Free State until the Belgian state took it over in 1908."),
      mc(L24, 3, 2, "What did the Berlin Conference of 1884 and 1885 do?", ["Set diplomatic rules for claiming African territory among European powers", "Divided Africa into the borders used today", "Included African delegates who agreed to colonial rule", "Ended slavery in Africa"], "No Africans were present.", "It formalised competition, though it did not itself divide Africa."),
      mc(L24, 4, 2, "Which African state defeated an Italian army at Adwa in 1896?", ["Ethiopia", "Liberia, founded by freed American slaves", "Egypt, ruled from Cairo by the khedives", "Algeria, then ruled by the French"], "It kept its independence.", "Ethiopia's victory preserved its independence."),
      mc(L24, 5, 3, "What happened in 1858 after the rebellion of 1857 in India?", ["The British Crown took direct control from the East India Company", "India became independent", "The French took over Bengal and the surrounding provinces in the east of India", "Russia invaded"], "It shifted who ruled India.", "After the rebellion, the Crown replaced Company rule."),
      // L25
      tf(L25, 1, 1, "The assassination of Archduke Franz Ferdinand in Sarajevo took place on 28 June 1914.", 0, "It happened in the summer of 1914.", "Gavrilo Princip shot the heir to the Austro-Hungarian throne."),
      mc(L25, 2, 1, "When did the armistice that ended the fighting on the Western Front take effect?", ["11 November 1918", "28 June 1919", "1 September 1939", "9 November 1989"], "It is remembered each year on Armistice Day.", "The armistice took effect on 11 November 1918."),
      mc(L25, 3, 2, "What did Article 231 of the Treaty of Versailles require of Germany?", ["To accept responsibility for the war", "To surrender all land east of the Elbe river", "To join the Entente alliance with France and Britain", "To restore the Hohenzollern monarchy after 1919"], "It is often called the war guilt clause.", "Germany had to accept responsibility, which was used to justify reparations."),
      mc(L25, 4, 2, "Which four empires ended as a result of the war?", ["German, Austro-Hungarian, Russian and Ottoman", "British, French, Russian and Ottoman", "German, Spanish, Austro-Hungarian and Ottoman", "Austro-Hungarian, Belgian, Dutch and German"], "Think of the losers and of Russia.", "All four empires collapsed by the end of the war and its aftermath."),
      mc(L25, 5, 3, "How do historians view responsibility for the war?", ["They debate it, with some stressing Germany's decisions and others the shared failures of all the powers", "They agree it was caused solely by Serbia", "They agree it was caused solely by Britain", "They agree nobody was responsible"], "The lesson says the debate continues.", "Historians still debate how to apportion responsibility."),
      // L26
      tf(L26, 1, 1, "The Bolsheviks seized power in Petrograd in October 1917 under Vladimir Lenin.", 0, "It is dated by the Julian calendar.", "The Bolsheviks took power in the second revolution of 1917."),
      mc(L26, 2, 1, "What was the Petrograd Soviet?", ["A council of workers and soldiers that shared power with the Provisional Government", "A tsarist army unit", "A secret police force", "A Bolshevik newspaper"], "Soviet means council.", "It was a council that rivalled the Provisional Government's authority."),
      mc(L26, 3, 2, "Why do dates for the Russian revolutions differ between sources?", ["Russia still used the older Julian calendar", "Historians disagree about which year each revolution began", "The revolutions each lasted for several decades", "Many official dates were destroyed in the civil war"], "The calendars differed by about two weeks.", "February and October in the Julian calendar correspond to March and November in the Western calendar."),
      mc(L26, 4, 2, "What was the Gulag?", ["A system of labour camps in the Soviet Union", "A Soviet army corps sent to fight in Finland in 1940", "A Russian parliament created after the 1905 revolution", "A state trade union for Soviet factory workers"], "It was used in the Great Terror era.", "Many people were sent to labour camps called the Gulag."),
      tf(L26, 5, 3, "All historians and governments use exactly the same classification of the Ukrainian famine of 1932 and 1933.", 1, "The lesson says the genocide classification is debated.", "Many historians and governments call it a genocide, the Holodomor, but the classification is debated."),
      // L27
      tf(L27, 1, 1, "Hitler was appointed chancellor by President Hindenburg on 30 January 1933.", 0, "He was appointed rather than elected by a majority.", "The Nazi Party never won a majority in a free election but Hitler was appointed chancellor."),
      mc(L27, 2, 1, "What was the March on Rome of October 1922?", ["A show of force by Mussolini's followers, after which he became prime minister", "A communist revolution", "A royal coronation", "A war with Austria"], "The king then appointed Mussolini.", "Mussolini was appointed prime minister by the king and soon built a one-party dictatorship."),
      mc(L27, 3, 2, "Which economic event beginning in 1929 helped extremist parties gain support in Weimar Germany?", ["The Great Depression", "Hyperinflation of 1923", "The Marshall Plan", "The Treaty of Rome"], "It followed a stock market crash.", "Mass unemployment from the Depression helped extremist parties gain support."),
      mc(L27, 4, 2, "What were the Nuremberg Laws of 1935?", ["Laws stripping Jews of German citizenship and defining them by ancestry", "Laws abolishing the Reichstag", "The terms of the Munich Agreement", "Laws created at the postwar trials"], "They were passed under the Nazi regime.", "They began a legal definition of Jews by ancestry and removed citizenship."),
      mc(L27, 5, 3, "What was appeasement, as practised by Britain and France?", ["Trying to avoid war by granting concessions to Germany", "A military alliance with the Soviet Union against Germany", "A trade embargo imposed on Germany by the League of Nations", "A secret plan to invade Germany if it rearmed any further"], "The Munich Agreement is an example.", "Appeasement meant making concessions, such as allowing Germany to take the Sudetenland."),
      // L28
      tf(L28, 1, 1, "Germany invaded Poland on 1 September 1939.", 0, "Britain and France declared war two days later.", "The invasion began the Second World War in Europe."),
      mc(L28, 2, 1, "Roughly how many Jews were murdered in the Holocaust?", ["About six million", "About six hundred thousand", "About sixty thousand", "About sixty million"], "It is the figure used by historians for the whole genocide.", "Nazi Germany and its collaborators murdered about six million Jews."),
      mc(L28, 3, 2, "Which conference in January 1942 coordinated the plan for the murder of Europe's Jews?", ["The Wannsee Conference", "The Munich Conference", "The Yalta Conference", "The Berlin Conference"], "It was held near Berlin.", "Officials met at Wannsee to coordinate the plan."),
      mc(L28, 4, 2, "What happened on 6 June 1944?", ["Allied landings in Normandy", "Germany invaded the Soviet Union", "The attack on Pearl Harbor", "Germany surrendered"], "It is called D-Day.", "The Allied landings in Normandy helped turn the war."),
      mc(L28, 5, 3, "Which statement about the other victims of Nazi persecution is correct?", ["Roma and Sinti, people with disabilities and many Soviet prisoners of war were also murdered", "Only Jews were persecuted", "Only political opponents were persecuted", "No one else was persecuted"], "The lesson names several groups.", "The Nazis murdered or persecuted many other groups alongside the genocide of the Jews."),
      // L29
      tf(L29, 1, 1, "The Berlin Wall was built by East Germany in 1961.", 0, "It stopped citizens fleeing to the west.", "East Germany built the wall to stop emigration."),
      mc(L29, 2, 1, "Which plan of 1948 provided billions of dollars to rebuild Western European economies?", ["The Marshall Plan", "The Truman Doctrine", "The Schuman Plan", "The Helsinki Accords"], "It was named after a U.S. Secretary of State.", "The Marshall Plan supported recovery in Western Europe."),
      mc(L29, 3, 2, "What did NATO and the Warsaw Pact represent?", ["Rival military alliances, Western and Soviet-led", "Rival trade unions for Western and Eastern workers", "Rival economic communities, Western and Soviet-led", "Neutral groups that stayed out of the Cold War blocs"], "They were founded in 1949 and 1955.", "NATO formed in 1949 and the Warsaw Pact answered it in 1955."),
      mc(L29, 4, 2, "What happened to the Hungarian uprising of 1956?", ["Soviet tanks crushed it", "It succeeded in leaving the Warsaw Pact", "NATO sent troops to support it", "It led to German reunification"], "Moscow did not tolerate challenges to its bloc.", "The Soviet Union crushed the revolt."),
      mc(L29, 5, 3, "What did the Helsinki Accords of 1975 include that dissidents later invoked?", ["Commitments on human rights", "A complete ban on all nuclear weapons in Europe", "An agreement to tear down the Berlin Wall", "A plan for the reunification of Germany"], "They were part of detente.", "Dissidents in the East cited the human rights commitments."),
      // L30
      tf(L30, 1, 1, "India and Pakistan became independent in 1947.", 0, "It was the end of British rule in South Asia.", "Partition caused mass migration and communal violence."),
      mc(L30, 2, 1, "Which colony was the first sub-Saharan African colony to gain independence from Britain, in 1957?", ["Ghana", "Kenya", "Algeria", "Congo"], "It was named after an old African empire.", "Ghana's independence in 1957 inspired other African movements."),
      mc(L30, 3, 2, "What was the Suez Crisis of 1956?", ["Britain and France, with Israel, attacked Egypt and withdrew under American and Soviet pressure", "Egypt conquered Israel", "A Soviet invasion of Hungary", "A French defeat in Vietnam"], "It showed reduced European power.", "The failure signalled that Britain and France no longer acted as great powers."),
      mc(L30, 4, 2, "How did France's war in Algeria end?", ["With Algerian independence in 1962", "With Algeria joining France as a province", "With a Soviet victory", "With a treaty keeping French control"], "It lasted from 1954 to 1962.", "A brutal war ended in Algerian independence."),
      tf(L30, 5, 3, "Portuguese colonies in Africa gained independence after a revolution in Portugal in 1974.", 0, "The empire lasted longer than Britain's or France's.", "The 1974 revolution led to independence for Portugal's African colonies."),
      // L31
      tf(L31, 1, 1, "The Treaty of Rome of 1957 created the European Economic Community.", 0, "It was signed by six countries.", "It created a common market among France, West Germany, Italy, Belgium, the Netherlands and Luxembourg."),
      mc(L31, 2, 1, "Which treaty signed in 1992 created the European Union?", ["The Maastricht Treaty", "The Treaty of Rome", "The Treaty of Versailles", "The Single European Act"], "It is named after a Dutch city.", "Maastricht created the EU and set the path to a common currency."),
      mc(L31, 3, 2, "What did the Schuman proposal of 9 May 1950 suggest?", ["Pooling coal and steel production", "Creating a European army", "Replacing the pound with the franc", "Dividing Germany"], "These were materials of war.", "It aimed to make war between France and Germany unthinkable and led to the ECSC in 1951."),
      mc(L31, 4, 2, "In which year did the UK formally leave the EU?", ["2020", "2016", "2002", "1973"], "A referendum took place four years earlier.", "The UK left on 31 January 2020 after the June 2016 referendum."),
      mc(L31, 5, 3, "What is a federalist, as used in the lesson?", ["Someone who wants a stronger union", "Someone who wants to leave the EU", "Someone who favours cooperation only between sovereign states", "Someone who opposes free trade"], "It contrasts with preferring cooperation between states.", "Federalists want deeper integration, while others prefer intergovernmental cooperation."),
      // L32
      tf(L32, 1, 1, "The Berlin Wall was opened on 9 November 1989.", 0, "It followed weeks of protests in East Germany.", "The opening of the wall became a symbol of the end of the Cold War division."),
      mc(L32, 2, 1, "When was Germany reunified?", ["3 October 1990", "9 November 1989", "25 December 1989", "26 December 1991"], "It followed the fall of the Wall.", "Germany was reunified on 3 October 1990."),
      mc(L32, 3, 2, "What did the Soviet leader Mikhail Gorbachev's policy of glasnost mean?", ["Openness", "Restructuring", "Collectivisation", "Containment"], "Perestroika is the other term.", "Glasnost meant openness and perestroika meant restructuring."),
      mc(L32, 4, 2, "What happened at Srebrenica in July 1995?", ["About 8,000 Bosniak men and boys were killed, an act ruled to be genocide by international courts", "The Dayton Agreement was signed", "Yugoslavia was founded", "NATO bombed Serbia"], "It was part of the Bosnian war.", "Bosnian Serb forces killed about 8,000 people."),
      mc(L32, 5, 3, "Which statement best reflects the historians' debate over 1989 described in the lesson?", ["They debate how much the West, Gorbachev or the peoples of Eastern Europe drove the changes", "They agree it was caused only by the West", "They agree it was caused only by Gorbachev", "They agree it had no long-term causes"], "The lesson mentions economic stagnation and popular action.", "Historians weigh popular action, Gorbachev's reforms, Western pressure and long-term economic problems."),
    ],
  },
};
