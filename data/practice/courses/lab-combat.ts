import type { CourseModule } from '../courseModule';
import type { Question } from '../types';

const CID = 'lab-combat';
const lid = (n: number) => `${CID}.l${String(n).padStart(2, '0')}`;

/** Multiple-choice question for lesson n (1-based), question number k. */
const mc = (n: number, k: number, level: 1 | 2 | 3, prompt: string, choices: string[], answer: number, hint: string, explanation: string): Question => {
  // Spread the correct answer evenly across positions 0-3 (deterministic swap).
  const target = (n * 3 + k) % 4;
  const c = choices.slice();
  [c[answer], c[target]] = [c[target], c[answer]];
  return { id: `${lid(n)}.q${k}`, lessonId: lid(n), kind: 'mcq', prompt, choices: c, answer: target, hint, explanation, level };
};
/** True/false question (answer 0 = True, 1 = False). */
const tf = (n: number, k: number, level: 1 | 2 | 3, prompt: string, answer: number, hint: string, explanation: string): Question => ({
  id: `${lid(n)}.q${k}`, lessonId: lid(n), kind: 'tf', prompt, answer, hint, explanation, level,
});

export const COURSE_MODULE: CourseModule = {
  curriculum: {
    id: CID,
    label: 'Combat Atlas: Martial Arts of the World',
    blurb: 'A museum-style tour of martial traditions: their history, culture, philosophy and etiquette, from Egyptian tomb walls to the modern dojo.',
    accent: '#C24D2C',
    framework: 'c3',
    tracks: [
      {
        id: `${CID}.t1`,
        title: 'African Roots and the Atlantic Crossing',
        blurb: 'Stick, wrestling and inverted-kick traditions of Africa, and how they travelled to the Americas.',
        level: 'FOUNDATION',
        lessons: [
          {
            id: lid(1),
            title: 'Tahtib: The Stick Dance of Egypt',
            blurb: 'Stick play painted on tomb walls and still danced at weddings today.',
            minutes: 6,
            body: `Tahtib is Egyptian stick fencing, often described as the oldest continuously visible martial art on Earth. Its roots reach back to ancient art: the Beni Hasan tomb murals (c. 2000 BCE) show hundreds of painted wrestlers in sequences, and the temple reliefs at Medinet Habu (c. 1180 BCE, the era of Ramesses III) show refereed stick-fencing matches with spectators.

Today tahtib survives in Upper Egypt as a folk art and a musical performance. Two practitioners use long cane or bamboo staves, roughly four feet, and exchange strikes, parries and evasive footwork. The emphasis is on clean, controlled contact, and the exchange follows musical rhythm, so the line between duel and dance blurs.

Culturally, tahtib belongs to weddings, festivals and harvest gatherings, performed to the mizmar (a reed instrument) and drum. The stick itself, called the asa, carries ideas of honour and manhood. Tahtib is living folklore: a village's shared choreography of pride. In 2016 it was inscribed on UNESCO's Intangible Cultural Heritage list.

When you study it, look at how respect and restraint are built in: bouts are public, rhythmic and bounded by tradition, which makes the art a celebration of community rather than simply a fight.`,
          },
          {
            id: lid(2),
            title: 'Nguni Stick Fighting',
            blurb: 'From herd-boys sparring in the fields to a Zulu rite of passage.',
            minutes: 6,
            body: `Nguni stick fighting comes from the Zulu, Xhosa and related Nguni peoples of South Africa. It began as a game among herd boys sparring while they tended cattle, and was formalised as martial training as the Zulu kingdom rose. Oral histories point to Amalandela around 1670 and to systematisation under Shaka and his successor Dingane.

Fighters traditionally carry the induku, a striking stick, and the longer ubhoko, a defensive staff, often with a small cowhide shield, the ihawu, bound to the defending arm. Bouts are refereed by an induna, a war captain, and points are scored for clean strikes to the body, head and limbs. A match may last for hours until a decisive blow, first blood or exhaustion.

The tradition is a rite of passage. At sixteen a Zulu boy traditionally cut his own stick from the forest with his father. Matches are held at weddings, where warriors of the bride's and groom's households get to know each other through combat, and the strongest earns the title Inkunzi, the Bull. Nelson Mandela practised stick fighting in his rural Xhosa youth.

Today it survives as sport, ceremony and heritage, and some programmes use it to steer young people away from gang violence.`,
          },
          {
            id: lid(3),
            title: 'Laamb: Wrestling of Senegal',
            blurb: 'Serer harvest rites that grew into a national stadium sport.',
            minutes: 7,
            body: `Laamb is the wrestling tradition of the Serer and Wolof peoples of Senegal. It began as a harvest-end rite among the Serer of west-central Senegal that measured the strength of villages. Under colonial and post-colonial urbanisation it professionalised, and since 2018 its flagship venue has been the Arene Nationale at Pikine, a 20,000-seat arena. Champions rival footballers in fame.

Victory comes by grounding the opponent, meaning head, back, or both hands and knees touching the earth. The professional avec frappe code also permits bare-fist punches, which makes laamb a rare wrestling form with live striking. Training combines hard conditioning with dance rehearsal and rhythmic coordination.

No African combat art stages ritual more completely. There are marabout blessings, gris-gris amulets, protective baths and potions, the bakk praise-dance and griots drumming fighters into the arena. Wrestlers embody the Serer ideal of njom, composed and stoic bravery. Mohamed Ndao, nicknamed Tyson, is the modern icon whose rise made laamb a national obsession.

Laamb is the flagship of the wider Lutte Traditionnelle family found across Senegal, Niger, Burkina Faso, Mali and beyond. Notice how it blends sport, spirituality and entertainment into one public event.`,
          },
          {
            id: lid(4),
            title: 'Engolo: The Inverted Art',
            blurb: 'A circle game on the Cunene River that crossed the Atlantic.',
            minutes: 7,
            body: `Engolo developed among pastoral communities, including the Nkhumbi, along Angola's Cunene River, before the 10th century. It is a circle game of inverted kicks, sweeps and evasions. It is linked to a Kongo-influenced cosmology in which the ancestral realm mirrors ours upside down, so kicks thrown from handstands are said to draw power from the ancestral world.

Its core vocabulary includes crescent kicks, push kicks, sweeps, cartwheels, handstand kicks and deceptive evasion instead of blocking. In Angola it is linked to the efiko initiation celebrations. It is played in a circle with music, song and handclaps.

Enslaved Central Africans, including Mbundu people of the Kingdom of Ndongo, carried this art to Brazil, where it became capoeira. The link was publicly reconnected in the 1950s when Angolan artist Albano Neves e Sousa recognised engolo in the capoeira of Bahia. Scholar T. J. Desch-Obi's work, including Fighting for Honor (2008), later mapped the technical continuity in detail.

Engolo is therefore one of the clearest documented origin-to-diaspora arcs in martial arts: the Cunene, then Ndongo, then Bahia, then the world. Look for the way a game disguised as dance can hold a whole culture's survival.`,
          },
          {
            id: lid(5),
            title: 'Capoeira: Roda, Music and Memory',
            blurb: 'How an Afro-Brazilian game survived criminalisation and went global.',
            minutes: 8,
            body: `Capoeira grew in Brazil among enslaved Africans and their free descendants. It was recorded in Rio in the 1820s by the painters Rugendas and Earle. After abolition the Penal Code of 1890 criminalised capoeiragem, driving it underground for about four decades.

Two Bahian masters shaped the modern art. In the 1930s Mestre Bimba created Capoeira Regional and opened an authorised academy, winning legal legitimacy. Mestre Pastinha institutionalised Capoeira Angola, the traditional, ritual-forward style, with his Salvador academy from 1941. Brazil declared the roda national heritage in 2008, and UNESCO inscribed the capoeira circle in 2014.

Everything starts with the ginga, a rocking base step that keeps the player in motion. Kicks, sweeps and escapes trade blocking for evasion, and play is a dialogue in which cunning (malicia) matters more than impact.

Capoeira happens in the roda, a human circle closed by the bateria: berimbaus, pandeiro, atabaque and agogo. The berimbau's rhythm sets the pace of the game, and songs comment on play, so the music is part of the safety and etiquette: it can slow a heated game or call players back. Capoeira is now practised in well over 150 countries.`,
          },
        ],
      },
      {
        id: `${CID}.t2`,
        title: 'Asian Traditions: Temple, Dojo and Ring',
        blurb: 'Monastery, kalari, dojo and stadium: the philosophies and ceremonies of major Asian arts.',
        level: 'INTERMEDIATE',
        lessons: [
          {
            id: lid(6),
            title: 'Shaolin: Chan and the Staff',
            blurb: 'A Buddhist monastery that became the symbol of Chinese martial arts.',
            minutes: 7,
            body: `Shaolin Monastery, on Mount Song in Henan, China, was founded in 495 CE under the Northern Wei dynasty. A stele of 728 records its monks helping the Tang prince Li Shimin in 621, the earliest firm evidence of the temple's martial reputation. In the Ming dynasty Shaolin staff fighting became famous across the empire; the lay disciple Cheng Zongyou documented the staff method in the 1610s. Fist arts rose to prominence in the Qing dynasty. The temple was burned in 1928, and a revival boosted by the 1982 film Shaolin Temple restored it as a global centre.

The popular story that the Indian monk Bodhidharma (Damo) founded Shaolin's exercises is a later legend, not documented history.

The staff (gun) is the historic signature weapon. Empty-hand training centres on taolu, routines built from low stances and short-range power, with animal imagery in many sets. Conditioning and partner drills develop applied skill.

Philosophically, practice is framed by Chan (Zen) Buddhism: the saying chan wu he yi, Chan and martial arts are one, casts training as moving meditation within monastic discipline and precepts against aggression. The monastery is part of the Historic Monuments of Dengfeng, inscribed on the UNESCO World Heritage List in 2010.`,
          },
          {
            id: lid(7),
            title: 'Kalaripayattu of Kerala',
            blurb: 'The earthen kalari, the guru and the oiled body.',
            minutes: 7,
            body: `Kalaripayattu is a martial tradition of Kerala, India, practised by Malayali communities and hereditary gurukkal lineages. Tradition links its codification to the medieval conflicts between the Chera and Chola powers around the 11th-12th centuries CE. British colonial authorities restricted arms-bearing and the art declined in the 19th century. A revival in the 1920s, led by teachers such as Kottakkal Kanaran Gurukkal and C. V. Narayanan Nair, re-established the kalari as a living institution. Meenakshi Amma, a gurukkal, received the Padma Shri in 2017.

Training happens in the kalari, a sunken earthen arena that is both school and shrine. Students begin with meippayattu body-conditioning sequences, animal-inspired postures (vadivu) and footwork before they touch weapons. Wooden weapons such as the long staff come before metal ones such as sword and shield and the urumi, a flexible whip-sword. Advanced study includes marma, knowledge of vital points, paired with uzhichil oil massage and a therapeutic tradition allied to Ayurveda.

Ritual matters. Practitioners enter right foot first, touch the earth and the guru's feet, and salute the poothara, a seven-tiered platform for the guardian deities. Its movement vocabulary also feeds Kerala's performing arts such as Theyyam and Kathakali.`,
          },
          {
            id: lid(8),
            title: 'Judo: The Gentle Way',
            blurb: 'Kano Jigoro reforms jujutsu into an educational discipline.',
            minutes: 7,
            body: `Judo was founded in 1882 by the educator Kano Jigoro, trained in Tenjin Shin'yo-ryu and Kito-ryu jujutsu. He opened the Kodokan at Eisho-ji temple in Tokyo, turning older combat systems into a safe, principled discipline for modern education. Judo entered the Olympics for men at Tokyo 1964, and women's judo became a full Olympic event in 1992.

Kano's two guiding maxims are seiryoku zen'yo, maximum efficient use of energy, and jita kyoei, mutual welfare and benefit. Character training was as important to him as combat skill.

The core of the art is the throw: hand techniques (te-waza), hip techniques (koshi-waza) and foot techniques (ashi-waza), all based on kuzushi, breaking the opponent's balance before applying leverage. On the ground, pins, strangles and elbow locks are part of katame-waza. Training alternates randori, free practice against resisting partners, with kata, prearranged forms that preserve principles. Kano also devised the ranked belt system that became a template for many other arts.

Etiquette is central: bowing on entering the dojo, to partners before and after practice, and in competition. Learning to fall safely and to train with care for a partner is part of judo's safety culture.`,
          },
          {
            id: lid(9),
            title: 'Karate: From Okinawa to the World',
            blurb: 'Okinawan hand, Chinese influence and the philosophy of courtesy.',
            minutes: 7,
            body: `Karate grew from Okinawan te, meaning hand, blended with Chinese quanfa carried across the East China Sea. It matured in the Ryukyu Kingdom in the 19th century as the regional streams of Shuri-te, Naha-te and Tomari-te. Anko Itosu brought the art into Okinawan schools around 1901, simplifying kata for physical education. His student Gichin Funakoshi demonstrated in Tokyo in 1922 and stayed; Chojun Miyagi founded Goju-ryu. In the 1930s the name was rewritten from Chinese hand to empty hand. Karate became an Olympic sport at Tokyo 2020.

Training rests on three pillars: kihon (fundamentals), kata (solo forms, unlocked through analysis called bunkai) and kumite (sparring). Okinawan tradition adds hojo undo conditioning with tools such as the makiwara striking post. Shotokan has long, dynamic lines, while Goju-ryu is a close-range blend of hard and soft.

The moral frame is restraint. Training opens and closes with seated bows, and Funakoshi taught that karate begins and ends with courtesy, with the corollary that there is no first attack in karate. Many schools recite the dojo kun, training precepts, and belt gradings mark progress.`,
          },
          {
            id: lid(10),
            title: 'Muay Thai: The Art of Eight Limbs',
            blurb: 'Ritual, music and the modernisation of Siamese boxing.',
            minutes: 7,
            body: `Muay Thai descends from muay boran, the bare-fisted boxing of Siam's soldiers and festival grounds, patronised by the court at Ayutthaya. The beloved story of Nai Khanomtom, a captive boxer who beat Burmese champions in 1774, is national legend rather than verifiable record. In the 1920s the art modernised: roped rings, gloves, weight classes and timed rounds replaced hemp-bound fists. Rajadamnern Stadium opened in 1945 and Lumpinee Stadium in 1956. The International Federation of Muaythai Associations gained full IOC recognition in 2021.

It is called the art of eight limbs because it uses fists, elbows, knees and shins. Fighters condition their shins for roundhouse kicks, use the teep (push kick) to manage distance and fight in the clinch, where knees and turning throws decide exchanges. Scoring rewards balance, composure and clean technique across five rounds.

Ritual is essential. Each traditional bout opens with the wai khru ram muay, a kneeling dance of homage to teachers and lineage, performed to live sarama music of oboe, drums and cymbals. Fighters wear the mongkhon headband and pra jiad armbands, often blessed by a teacher or monk. Gyms work like families under the khru, and these ceremonies remain compulsory in Thai stadium rules.`,
          },
        ],
      },
      {
        id: `${CID}.t3`,
        title: 'Ancient and European Traditions',
        blurb: 'Olympic pankration, Norse wrestling, Renaissance fight books and the prize ring.',
        level: 'INTERMEDIATE',
        lessons: [
          {
            id: lid(11),
            title: 'Pankration: All Power at Olympia',
            blurb: 'The most demanding event of the ancient Olympics.',
            minutes: 7,
            body: `Pankration means all power. It entered the Olympic programme in 648 BCE as the Games' most demanding event, fusing boxing and wrestling into near-total combat in which only biting and eye-gouging were barred at Olympia. Judges enforced the two prohibitions with rods. It endured through the Roman era until the ancient games ended in the fourth century CE.

Its heroes became legends. Arrhichion of Phigalia died while winning his third Olympic crown in 564 BCE, when his opponent conceded just as he expired. Theagenes of Thasos, a fifth-century BCE boxer and pankratiast, is credited by ancient sources with over a thousand prizes.

Pankratiasts fought both upright (ano pankration) and on the ground (kato pankration), with no rounds and no time limit. Victory came by knockout or by submission, signalled with a single raised finger. Our main technical record is the iconography on Panathenaic prize amphorae, painted vases given to victors, filled with sacred olive oil.

Pankration lived inside Greek athletic religion: athletes trained in the palaistra under professional trainers and competed at festivals for gods such as Zeus at Olympia and Athena at the Panathenaia. Today it is often cited as the ancient ancestor of mixed martial arts.`,
          },
          {
            id: lid(12),
            title: 'Glima: Wrestling of Iceland',
            blurb: 'A courteous Viking inheritance built around honour.',
            minutes: 6,
            body: `Glima is Iceland's national wrestling. It came with Norse settlers and appears in medieval sagas, among them Grettis saga, as fang, the wrestling of farmers, sailors and heroes. In 1906 it became Iceland's national sport with the founding of the Islandsglima championship for the Grettir's Belt, Iceland's oldest sporting trophy. Johannes Josefsson demonstrated glima at the 1908 London Olympics and later toured the United States.

Wrestlers take a fixed grip on each other's harness, one hand at the hip and the other at the thigh (brokartok, the trouser grip). They stand upright and circle clockwise in a stepping rhythm called stigandi. From this shared motion come the brogd, the named tricks: hip throws, leg hooks and heel-trips that rely on timing and leverage rather than strength. A fall is scored when an opponent touches the ground between elbow and knee.

Glima is wrapped in a code of drengskapur, sportsmanlike honour: upright posture, a handshake before the bout and a ban on brute-force stalling. The winner of the Islandsglima is crowned Glima King. A looser style, lausatok, has been revived abroad as combat glima.

Notice how etiquette and a shared rhythm make the contest a cooperative performance as much as a contest of strength.`,
          },
          {
            id: lid(13),
            title: 'Armizare: Fiore and the Fight Book',
            blurb: 'A medieval Italian master and his illustrated manual.',
            minutes: 7,
            body: `Armizare is the complete fighting art of Fiore dei Liberi, a Friulian master who claimed fifty years of study and who prepared students for at least five judicial duels. Around 1404 he composed the Fior di Battaglia, the Flower of Battle, for Niccolo III d'Este, Marquis of Ferrara. Four manuscript copies survive, including the lavishly illustrated Getty Ms. Ludwig XV 13 and the Pisani Dossi codex of 1409. Filippo Vadi's later treatise carried the tradition forward. It is the earliest substantially preserved Italian martial art.

Fiore builds everything from abrazare, wrestling, and flows from there to dagger, sword, poleaxe, spear and mounted combat, in and out of armour. Fencing is organised around poste (guards) and plays of wide and close play. His teaching is visual: masters wear crowns and students wear garters, so each illustrated play states a problem and its remedy.

His segno diagram assigns four virtues to animals: the lynx's prudence, the tiger's speed, the lion's audacity and the elephant's fortitude.

The manuscripts belong to late medieval court culture, where a presentation manuscript was itself a princely gift. Rediscovered in the modern era, they anchor the HEMA (historical European martial arts) revival, in which modern schools reconstruct the plays from the folios using protective equipment and careful safety rules.`,
          },
          {
            id: lid(14),
            title: 'Pugilism and the Prize Ring',
            blurb: 'The rules that turned English fistfighting into a modern sport.',
            minutes: 7,
            body: `Pugilism is English bare-knuckle boxing, 1719-1867. James Figg, England's first recognised champion, opened his London amphitheatre in 1719 and fought all comers with fist, cudgel and backsword. After an opponent died of injuries, champion Jack Broughton published boxing's first rules in 1743: a round ended with a knockdown, a thirty-second count applied and no one could hit a downed man. He also invented mufflers, an ancestor of the glove.

Daniel Mendoza, champion 1792-95, brought a scientific, defensive style that transformed technique. The London Prize Ring rules of 1838 refined the code, and the Queensberry rules of 1867 brought gloves and timed rounds, closing the bare-knuckle era.

Technically, the pugilist stood more upright than a modern boxer, fists low and vertical to spare fragile hands. Wrestling was part of the game, and a round lasted until a man fell, so endurance, or bottom, the ability to come up to scratch, mattered.

Prizefighting built its own culture: a roped square on turf, seconds, stakes and side-bets and the aristocratic followers called the Fancy, chronicled in Pierce Egan's Boxiana. The story shows how rules evolve from injury and public concern toward safety.`,
          },
        ],
      },
    ],
  },
  bank: {
    curriculumId: CID,
    questions: [
      // L1 Tahtib
      mc(1, 1, 1, `In what year was Egyptian tahtib inscribed on UNESCO's Intangible Cultural Heritage list?`, [`2011`, `2014`, `2016`, `2019`], 2, `It is in the lesson's final paragraph.`, `Tahtib was inscribed in 2016; taekkyeon followed in 2011, the capoeira circle in 2014, and pencak silat in 2019 for other arts.`),
      mc(1, 2, 1, `The Medinet Habu temple reliefs, showing refereed stick matches, date to about when?`, [`c. 1180 BCE`, `c. 2000 BCE`, `c. 648 BCE`, `c. 495 CE`], 0, `They were carved in the era of Ramesses III.`, `Medinet Habu dates to about 1180 BCE; the Beni Hasan tombs are earlier, around 2000 BCE.`),
      mc(1, 3, 2, `Two men with long bamboo staves trade controlled strikes to mizmar and drum at a village wedding in Upper Egypt. Which art is this?`, [`Dambe boxing`, `Nguni stick fighting`, `Tahtib`, `Kalaripayattu`], 2, `Think Egypt and music.`, `Stick play set to mizmar and drum at festivals and weddings is tahtib.`),
      mc(1, 4, 3, `Why do the Beni Hasan tomb murals matter to historians of martial arts?`, [`They show sequential pairs in holds and counters, like a very early instruction record`, `They prove that all martial arts began in Egypt`, `They show the invention of the sword`, `They record the rules of Olympic pankration`], 0, `Think about what a sequence of figures can teach.`, `The hundreds of painted wrestlers in sequences work like a frame-by-frame manual, though this does not prove a single origin for all arts.`),
      // L2 Nguni
      mc(2, 1, 1, `What is the induku?`, [`A cowhide shield bound to the arm`, `The striking stick`, `A war captain`, `A ceremonial beer`], 1, `It is one of the two sticks.`, `The induku is the striking stick; the ubhoko is the longer defensive staff, and the ihawu is the shield.`),
      mc(2, 2, 1, `Who refereed traditional Nguni stick bouts?`, [`The Inkunzi`, `A griot`, `A marabout`, `An induna, or war captain`], 3, `A military title.`, `Bouts were refereed by an induna.`),
      mc(2, 3, 2, `At a wedding, warriors from the bride's and groom's households spar with sticks and shields, and the strongest is called the Bull. Which tradition?`, [`Nguni stick fighting`, `Senegalese laamb wrestling`, `Capoeira`, `Glima`], 0, `The title is Inkunzi.`, `That wedding custom and the title Inkunzi belong to Nguni stick fighting.`),
      mc(2, 4, 3, `What does the practice of a boy cutting his own stick at sixteen suggest about the tradition?`, [`It was only a commercial sport`, `It was mainly a rite of passage tied to family and community`, `It was banned for boys`, `It had no social meaning`], 1, `Think about who goes with him to the forest.`, `Cutting one's own stick with a father marks passage into manhood, showing the art was social and ceremonial as well as martial.`),
      // L3 Laamb
      mc(3, 1, 1, `In which country is laamb the national spectacle?`, [`Northern Nigeria`, `Upper Egypt`, `Senegal`, `Southern Angola`], 2, `Serer and Wolof peoples.`, `Laamb is Senegal's wrestling tradition.`),
      mc(3, 2, 1, `What name is given to the 20,000-seat arena that anchors professional laamb since 2018?`, [`Arene Nationale`, `The Kodokan in Tokyo`, `Lumpinee`, `Rajadamnern`], 0, `It is in Pikine.`, `The Arene Nationale at Pikine opened in 2018.`),
      mc(3, 3, 2, `In the professional avec frappe code, what is unusual about laamb compared with most wrestling?`, [`It forbids touching the opponent`, `It uses weapons`, `It allows bare-fist punches`, `It is fought underwater`], 2, `The French phrase means with striking.`, `Avec frappe permits bare-fist punches, so live striking mixes with wrestling.`),
      mc(3, 4, 3, `What do marabout blessings, gris-gris and the bakk praise-dance show about laamb?`, [`That ritual and spirituality are built into the sport`, `That it has no rules`, `That it is only for tourists`, `That it was invented in the 21st century`], 0, `Think of how much of the event is ceremony.`, `Laamb stages ritual more completely than any other African combat art, blending spirituality with athletics.`),
      // L4 Engolo
      mc(4, 1, 1, `Along which river did engolo develop?`, [`Upper Nile`, `Niger Delta`, `Cunene`, `Zambezi basin`], 2, `It is in Angola.`, `Engolo comes from the Cunene River region of Angola.`),
      mc(4, 2, 1, `Which Angolan artist reconnected capoeira to engolo in the 1950s?`, [`Albano Neves e Sousa`, `Mestre Bimba`, `Mestre Pastinha`, `T. J. Desch-Obi, the scholar`], 0, `He was a painter who did fieldwork in Angola.`, `Albano Neves e Sousa recognised engolo in Bahia's capoeira.`),
      mc(4, 3, 2, `A circle game where players throw kicks from handstands and evade rather than block is closest to which art?`, [`Kodokan judo`, `Engolo`, `Egyptian tahtib`, `Japanese sumo`], 1, `The lesson called it the inverted art.`, `Handstand kicks and evasion are core engolo features.`),
      mc(4, 4, 3, `Why is the engolo-to-capoeira story considered unusually well documented?`, [`No scholars have studied it`, `It has a clear chain of place, people and technique from Cunene to Ndongo to Bahia`, `It was filmed in the 1500s`, `It is based on a single legend`], 1, `Think of the arc named in the lesson.`, `Technique continuity, historical movement of people and scholarship such as Desch-Obi's give a clear origin-to-diaspora arc.`),
      // L5 Capoeira
      mc(5, 1, 1, `Which year's Penal Code criminalised capoeiragem in Brazil?`, [`1890`, `1930`, `1941`, `2014`], 0, `It came shortly after abolition.`, `The 1890 Penal Code criminalised capoeira.`),
      mc(5, 2, 1, `Who created Capoeira Regional?`, [`Mestre Pastinha`, `Mestre Bimba`, `Kano Jigoro`, `Fiore dei Liberi`], 1, `He won legal standing for an academy in the 1930s.`, `Mestre Bimba created Capoeira Regional in 1930s Bahia.`),
      mc(5, 3, 2, `A player rocks in a constant base step to keep moving and set up kicks and escapes. What is the step called?`, [`Ginga`, `Roda circle`, `Ladainha chant`, `Mizmar pipe`], 0, `It is the rocking base step.`, `The ginga is the foundational rocking step of capoeira.`),
      mc(5, 4, 3, `Why is the music (berimbau and songs) part of capoeira's etiquette as well as its atmosphere?`, [`It only entertains tourists`, `It sets the pace, can slow a heated game, and signals when players enter or leave`, `It replaces all movement`, `It is required by Olympic rules`], 1, `Think about the berimbau's role.`, `The berimbau and songs govern the tempo and tone of play, which helps keep games controlled and respectful.`),
      // L6 Shaolin
      mc(6, 1, 1, `When was Shaolin Monastery founded?`, [`495 CE`, `728 CE (the stele)`, `about 1610 CE`, `1928 CE, burned`], 0, `Northern Wei dynasty.`, `Shaolin was founded in 495 CE; 728 is the date of the stele, and the temple was burned in 1928.`),
      mc(6, 2, 1, `Which weapon is Shaolin's historic signature?`, [`Whip-sword`, `The staff (gun)`, `Cowhide shield and club`, `Bamboo shinai`], 1, `Ming-era monks were famous for it.`, `Shaolin staff fighting won empire-wide renown in the Ming dynasty.`),
      mc(6, 3, 2, `Which statement about Bodhidharma is most accurate?`, [`Temple records prove he personally founded Shaolin kung fu in 495`, `He designed the shinai`, `The attribution is a later legend, not documented history`, `He wrote Exposition of the Original Shaolin Staff Method`], 2, `Look for the cautious wording.`, `Attribution of Shaolin's arts to Bodhidharma is a later legend; Cheng Zongyou wrote the staff manual.`),
      mc(6, 4, 3, `What does the saying chan wu he yi suggest about Shaolin training?`, [`Fighting must be the only goal`, `Training is moving meditation within Buddhist discipline`, `Weapons are forbidden`, `Chan means competition`], 1, `Chan means Zen.`, `Chan and martial arts are one frames practice as meditation bounded by monastic precepts.`),
      // L7 Kalari
      mc(7, 1, 1, `In which Indian state did kalaripayattu develop?`, [`Kerala`, `Northern Punjab`, `Eastern Assam`, `Western Gujarat`], 0, `Home of Theyyam and Kathakali.`, `Kalaripayattu is from Kerala.`),
      mc(7, 2, 1, `What is the kalari?`, [`A flexible whip-sword`, `A sunken earthen training arena that is also a shrine`, `A seven-tiered platform where the guardian deities are saluted`, `A massage oil`], 1, `It is both school and shrine.`, `The kalari is the sunken earthen arena used for training.`),
      mc(7, 3, 2, `A student enters a training hall right foot first, touches the earth and the guru's feet and salutes a seven-tiered platform. Which art?`, [`Muay Thai`, `Judo`, `Afro-Brazilian capoeira`, `Kalaripayattu`], 3, `The platform is the poothara.`, `This entrance ritual is kalaripayattu etiquette.`),
      mc(7, 4, 3, `Why do kalaripayattu students use wooden weapons before metal ones?`, [`Metal had not been invented`, `It builds skill and control progressively before more dangerous weapons are used`, `Wood is required by law`, `Metal is sacred`], 1, `Think about safe progression.`, `Training progresses from body conditioning and footwork to wooden arms and then metal, a gradual, safety-minded sequence.`),
      // L8 Judo
      mc(8, 1, 1, `Who founded judo?`, [`Funakoshi Gichin`, `Kano Jigoro`, `Miyamoto Musashi`, `Keiko Fukuda`], 1, `He opened the Kodokan in 1882.`, `Kano Jigoro founded judo and the Kodokan in 1882.`),
      mc(8, 2, 1, `What does seiryoku zen'yo mean?`, [`Mutual welfare and benefit for all training partners`, `Maximum efficient use of energy`, `No first attack`, `The way of the sword`], 1, `It is about efficiency.`, `Seiryoku zen'yo is maximum efficient use of energy; jita kyoei is mutual welfare and benefit.`),
      mc(8, 3, 2, `A judoka breaks a partner's balance before applying a throw using leverage. Which principle is this?`, [`Kuzushi`, `Kiai shout`, `Ginga step`, `Wai khru dance`], 0, `Balance-breaking.`, `Kuzushi is breaking the opponent's balance, the premise of judo throws.`),
      mc(8, 4, 3, `Why do judo dojos emphasise bowing and learning to fall?`, [`They are decoration only`, `They reflect Kano's educational aim of respect and safe training with partners`, `They are required for Olympic scoring only`, `They replace throws`], 1, `Think of mutual welfare.`, `Etiquette and safe practice express judo's ethic of mutual welfare and its origin as educational training.`),
      // L9 Karate
      mc(9, 1, 1, `Where did karate develop before spreading to Tokyo?`, [`Okinawa`, `Seoul in Korea`, `Bangkok in Siam`, `Beijing in China`], 0, `Ryukyu Kingdom.`, `Karate developed in Okinawa, drawing on local te and Chinese quanfa.`),
      mc(9, 2, 1, `Who demonstrated karate in Tokyo in 1922 and founded Shotokan?`, [`Chojun Miyagi of Goju-ryu`, `Anko Itosu`, `Kano Jigoro`, `Gichin Funakoshi`], 3, `He was Itosu's student.`, `Gichin Funakoshi demonstrated in Tokyo in 1922 and founded Shotokan.`),
      mc(9, 3, 2, `A student performs a solo set of prearranged movements and later studies the applications behind it. Which two terms fit?`, [`Kata and bunkai`, `Randori and kuzushi`, `Ginga and roda`, `Teep and clinch`], 0, `One is a form, the other its analysis.`, `Kata are solo forms and bunkai is the analysis of their applications.`),
      mc(9, 4, 3, `What does the idea that there is no first attack in karate show about its moral frame?`, [`That karate is purely competitive`, `That the art stresses restraint and courtesy`, `That it has no techniques`, `That sparring is forbidden`], 1, `Think of Funakoshi's teaching.`, `Funakoshi's teaching that karate begins and ends with courtesy frames technique within restraint.`),
      // L10 Muay Thai
      mc(10, 1, 1, `Why is muay thai called the art of eight limbs?`, [`It uses eight traditional weapons from the court`, `It uses fists, elbows, knees and shins`, `It has eight ranks`, `It has eight rounds`], 1, `Count the striking surfaces.`, `Eight limbs refers to two fists, two elbows, two knees and two shins.`),
      mc(10, 2, 1, `What is the wai khru ram muay?`, [`A kind of kick`, `A headband`, `A ritual dance of homage before a bout`, `A scoring rule rewarding balance and clean technique`], 2, `It is performed to oboe and drums.`, `The wai khru ram muay is the kneeling, danced homage to teachers.`),
      mc(10, 3, 2, `A fighter wears a blessed headband and armbands and performs a dance to oboe and drum music before the bout. Which art?`, [`Kalaripayattu`, `Muay Thai`, `Kodokan judo`, `Italian armizare`], 1, `Think mongkhon.`, `The mongkhon headband, pra jiad armbands and sarama music mark muay thai.`),
      mc(10, 4, 3, `Why does the lesson say the Nai Khanomtom story should be treated carefully?`, [`It is national legend rather than verifiable record`, `It is fully documented`, `It happened in the 1920s`, `It describes judo`], 0, `Look for the word legend.`, `Nai Khanomtom's 1774 victories are celebrated as legend, not documented history.`),
      // L11 Pankration
      mc(11, 1, 1, `When did pankration enter the Olympic Games?`, [`648 BCE`, `c. 564 BCE`, `c. 1180 BCE`, `c. 1882 CE`], 0, `It is in the timeline of ancient events.`, `Pankration joined the Olympic programme in 648 BCE.`),
      mc(11, 2, 1, `Which two actions were barred at Olympia?`, [`Kicks and throws`, `Biting and eye-gouging`, `Punching and strangling`, `Wrestling and pinning`], 1, `Two prohibitions enforced with rods.`, `Only biting and eye-gouging were banned.`),
      mc(11, 3, 2, `How did a pankratiast signal submission?`, [`Shouting a word`, `Dropping to the knees and bowing`, `Throwing a towel`, `Raising a single finger`], 3, `No voice was needed.`, `Submission was signalled with a single raised finger.`),
      mc(11, 4, 3, `Why are painted prize amphorae so important to historians of pankration?`, [`They are the main technical record that survives`, `They contain written rule books`, `They were made in modern times`, `They show only chess games`], 0, `Think about what evidence survives.`, `Vase iconography is the principal technical record of the fights.`),
      // L12 Glima
      mc(12, 1, 1, `Glima is the national sport of which country?`, [`Norway`, `Iceland`, `Finland`, `Denmark`], 1, `Grettir's Belt.`, `Glima is Iceland's national wrestling, with the Islandsglima for the Grettir's Belt.`),
      mc(12, 2, 1, `What are the named tricks in glima called?`, [`Kata forms`, `Brogd`, `Poste guards`, `Kimarite`], 1, `It's an Icelandic word.`, `The named tricks of glima are the brogd.`),
      mc(12, 3, 2, `Wrestlers grip each other's harness at hip and thigh and circle clockwise. Which art?`, [`Japanese sumo`, `Senegalese laamb`, `Glima`, `Bare-knuckle pugilism`], 2, `Look for brokartok.`, `The fixed harness grip and circling step (stigandi) are glima.`),
      mc(12, 4, 3, `What does the code of drengskapur add to glima?`, [`A ban on handshakes`, `Sportsmanlike honour, including upright posture and fair play`, `Permission to strike`, `A rule of silence`], 1, `It means honour.`, `Drengskapur is sportsmanlike honour, shaping etiquette and fair conduct.`),
      // L13 Armizare
      mc(13, 1, 1, `What is the name of Fiore dei Liberi's treatise?`, [`Fior di Battaglia`, `Boxiana`, `Book of Five Rings`, `Fighting for Honor`], 0, `Flower of Battle.`, `Fiore wrote the Fior di Battaglia around 1404.`),
      mc(13, 2, 1, `For whom did Fiore compose his Fior di Battaglia?`, [`Ramesses III`, `Shaka`, `Kano Jigoro, the founder of the Kodokan`, `Niccolo III d'Este, Marquis of Ferrara`], 3, `A ruler of Ferrara.`, `Fiore wrote it for Niccolo III d'Este.`),
      mc(13, 3, 2, `A fight book teaches wrestling first, then dagger, sword, poleaxe and spear. Which system?`, [`Armizare`, `Engolo`, `Japanese kendo`, `Tahtib`], 0, `The art starts from abrazare.`, `Armizare builds from abrazare (wrestling) to weapons.`),
      mc(13, 4, 3, `Why do modern HEMA groups wear protective gear while reconstructing plays from the manuscripts?`, [`The manuscripts require it`, `Because the plays were designed for armour only`, `They are reconstructing techniques from old texts and prioritise safety`, `Protective gear is illegal in Europe`], 2, `Think about what modern practitioners must manage.`, `Modern reconstruction is carried out with protective equipment and safety rules, even though the sources are historical.`),
      // L14 Pugilism
      mc(14, 1, 1, `Who published boxing's first rules in 1743?`, [`Daniel Mendoza`, `James Figg`, `Jack Broughton`, `Pierce Egan`], 2, `He also invented mufflers.`, `Jack Broughton published the first rules in 1743.`),
      mc(14, 2, 1, `Which rules of 1867 introduced gloves and timed rounds?`, [`London Prize Ring rules`, `Queensberry rules`, `Broughton's rules`, `Kodokan rules`], 1, `Named for a marquess.`, `The Queensberry rules of 1867 brought gloves and timed rounds.`),
      mc(14, 3, 2, `A fighter in the 1790s is celebrated for a scientific, defensive style that transformed technique. Who is he?`, [`James Figg`, `Daniel Mendoza`, `Jack Broughton`, `Shago`], 1, `Champion 1792-95.`, `Daniel Mendoza's scientific defence revolutionised boxing technique.`),
      tf(14, 4, 3, `Broughton's rules and mufflers show that boxing's rules developed partly in response to injury and danger.`, 0, `Recall what happened before his rules were written.`, `After an opponent died, Broughton wrote the first code and invented mufflers, an early step toward safer boxing.`),
    ],
  },
};
