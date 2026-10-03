import type { CourseModule } from '../courseModule';
import type { Question } from '../types';

const ID = 'art-movements-classical';

// Write the correct choice FIRST; the helper rotates the choices (keeping their cyclic order) so the
// correct answer lands on a spread-out index.
const mc = (l: string, n: number, level: 1 | 2 | 3, prompt: string, choices: string[], hint: string, explanation: string): Question => {
  const target = (parseInt(l.slice(l.lastIndexOf('.l') + 2), 10) * 3 + n * 5) % 4;
  const shift = target;
  const rotated = choices.map((_, i) => choices[(i - shift + 4) % 4]);
  return { id: `${l}.q${n}`, lessonId: l, kind: 'mcq', prompt, choices: rotated, answer: target, hint, explanation, level };
};
const tf = (l: string, n: number, level: 1 | 2 | 3, prompt: string, answer: number, hint: string, explanation: string): Question =>
  ({ id: `${l}.q${n}`, lessonId: l, kind: 'tf', prompt, answer, hint, explanation, level });

type QT =
  | ['tf', 1 | 2 | 3, string, number, string, string]
  | ['mc', 1 | 2 | 3, string, string[], string, string];
interface Les { t: string; b: string; m: number; body: string; q: QT[] }

const LESSONS: Les[] = [
  // ---------- Track 1: Ancient worlds ----------
  {
    t: 'Prehistoric Art: The First Images',
    b: 'Cave paintings, carved figures and hand stencils show that making images is among the oldest human activities.',
    m: 6,
    body: `Long before writing, people made images. The art of the Paleolithic ("Old Stone Age") survives mostly in caves and rock shelters and as small portable objects. Because there are no written records from its makers, everything we say about its meaning is an interpretation, and scholars openly disagree.

In southern France, the Chauvet cave contains charcoal and ochre drawings of lions, rhinoceroses, horses and bears, made more than 30,000 years ago. Lascaux, also in France, was found in 1940 and is famous for large painted bulls and horses. Altamira in Spain has painted bison on its ceiling. Cave art is known from many other parts of the world, including Indonesia, where dated paintings are tens of thousands of years old. Painters used natural pigments such as red and yellow ochre, charcoal and manganese, applied with fingers, brushes of fur or plant fibre, or blown through a tube. Hand stencils, made by blowing pigment around a hand held against the rock, appear in caves on several continents.

Portable art includes small carved figures. The Venus of Willendorf, a limestone figure found in Austria, is more than 25,000 years old. Its purpose is unknown.

Why were these images made? Proposed answers include ritual, storytelling, hunting magic or marking sacred places. Each theory has critics, and none explains every site. A good habit begins here: separate what we can observe (the animals, the pigments, the position in the cave) from what we guess (the reason).`,
    q: [
      ['tf', 1, 'Scholars agree on exactly why Paleolithic cave paintings were made.', 1, 'Think about what is missing from the evidence.', 'There are no written records from the makers, so several competing interpretations exist.'],
      ['mc', 1, 'Which of these was a natural pigment commonly used in cave painting?', ['Ochre', 'Oil paint from a tube', 'Acrylic', 'Synthetic dye'], 'Think of materials found in the ground or in fires.', 'Ochre (iron-rich earth) and charcoal were among the natural pigments used.'],
      ['mc', 2, 'The Chauvet cave, known for its drawings of lions, rhinoceroses and horses, is in which country?', ['France', 'Egypt', 'Greece', 'Japan'], 'It lies in the same country as Lascaux.', 'Chauvet is in southern France.'],
      ['tf', 2, 'A hand stencil is made by blowing pigment around a hand pressed against a surface.', 0, 'The hand acts like a mask.', 'Blowing pigment around the hand leaves a negative outline of it on the rock.'],
      ['mc', 3, 'Why should a student describe what is visible in a cave painting before guessing its purpose?', ['Because the visible evidence is certain while purposes are interpretations', 'Because purposes are always written on the wall', 'Because paintings never had purposes', 'Because all scholars agree about the purpose'], 'One is observation, the other is theory.', 'Separating observation from interpretation keeps claims honest when the makers left no records.'],
    ],
  },
  {
    t: 'Ancient Egypt: Art for Eternity',
    b: 'Egyptian art followed lasting conventions designed to serve religion, kingship and the afterlife.',
    m: 7,
    body: `Egyptian civilization along the Nile lasted for thousands of years, and its art is notable for how consistent it stayed. Most surviving works come from tombs and temples. They were not made mainly to be admired as we admire art in a museum, but to serve a purpose: honouring gods, glorifying the king (the pharaoh) and providing for the dead in the afterlife.

Painters and relief carvers followed conventions. In the typical standing figure, the head and legs are shown in profile while the eye and shoulders face the viewer, a combination that shows each part from its clearest angle. Important figures, such as the king, are drawn larger than servants, so size shows rank rather than distance. Artists worked from a grid of proportions to keep figures consistent. Hieroglyphic writing was part of the image, so text and picture work together.

Architecture shows the same ambition. The pyramids at Giza, built in the Old Kingdom around 2500 BCE, were royal tombs; the largest was built for King Khufu.

There was one famous disruption. Under King Akhenaten, around 1350 BCE, the Amarna style showed softer, more naturalistic bodies and scenes of family life. A painted limestone bust of Nefertiti, now in Berlin, comes from a sculptor's workshop of this period. Afterwards, tradition largely returned. In 1922 Howard Carter found the tomb of Tutankhamun, which gave the modern world an unusually complete view of royal burial goods.`,
    q: [
      ['tf', 1, 'Most surviving ancient Egyptian art comes from tombs and temples.', 0, 'Think about where objects were protected.', 'Funerary and religious settings produced and preserved most surviving works.'],
      ['mc', 1, 'In a typical Egyptian figure, which parts are shown from the front?', ['The eye and shoulders', 'Only the feet', 'Only the hands', 'The whole body from a three-quarter view'], 'The head is in profile.', 'The conventional view combines a profile head and legs with a frontal eye and shoulders.'],
      ['mc', 2, 'Why might a pharaoh be drawn much larger than the people around him?', ['Size showed rank and importance', 'Because he stood closer to the artist', 'Because the artist lacked skill', 'Because of a rule against drawing servants'], 'Think about what size communicates.', 'Hierarchical scale used size to show status, not distance.'],
      ['tf', 2, 'The Amarna period under Akhenaten is known for a more naturalistic style than earlier Egyptian art.', 0, 'It was a break from tradition.', 'Amarna art showed softer, more naturalistic forms before tradition largely returned.'],
      ['mc', 3, 'What does the lasting consistency of Egyptian conventions suggest about its art?', ['It served religious and royal purposes more than personal self-expression', 'It was made only for sale in markets', 'It was copied from Greek art', 'It had no connection to belief'], 'Think about purpose.', 'Art made for tombs, temples and kingship stayed close to approved patterns.'],
    ],
  },
  {
    t: 'Mesopotamia: Art Between the Rivers',
    b: 'Sumerian, Akkadian, Assyrian and Babylonian art blended record-keeping, religion and royal power.',
    m: 7,
    body: `Mesopotamia means "between the rivers", the Tigris and Euphrates in what is now mainly Iraq. Several peoples, including Sumerians, Akkadians, Babylonians and Assyrians, made art here over thousands of years. Because stone was scarce and clay was plentiful, much of their building was in mud brick, and writing was pressed into clay tablets in cuneiform script.

Small objects are a special strength. Cylinder seals were carved stone rollers that, rolled across wet clay, left a continuous picture that also worked as a signature for documents. The Standard of Ur, from a royal cemetery of the city of Ur (about 2600-2500 BCE), is a small box decorated with mosaic from shell, red limestone and lapis lazuli, showing scenes of war and a banquet in horizontal bands. Temples called ziggurats rose in stepped stages.

Later empires used art to proclaim power. Assyrian palaces, such as those at Nineveh in the seventh century BCE, were lined with carved stone reliefs of royal lion hunts and military campaigns, and guarded by colossal human-headed winged bulls or lions. The stele (upright slab) inscribed with the laws of the Babylonian king Hammurabi, around 1750 BCE, shows him before a seated god, linking authority to the divine. Under King Nebuchadnezzar II, Babylon's Ishtar Gate was faced with blue glazed brick and animal figures.

When you view this art, ask who ordered it, who it was meant to impress, and what the king wanted remembered.`,
    q: [
      ['tf', 1, 'Cuneiform writing was pressed into clay.', 0, 'Think about the plentiful local material.', 'Cuneiform signs were made by pressing a stylus into wet clay tablets.'],
      ['mc', 1, 'What is a cylinder seal?', ['A carved stone roller that leaves an image when rolled over clay', 'A type of painted vase', 'A stepped temple tower built from mud brick in successive stages upward', 'A wall of glazed brick'], 'Its name describes its shape.', 'Rolling it over wet clay produced a repeating picture, often used to mark documents.'],
      ['mc', 2, 'Which Mesopotamian object shows a king standing before a seated god above a law text?', ['The stele of Hammurabi', 'The Standard of Ur from the royal cemetery', 'The Ishtar Gate of Babylon', 'The Venus of Willendorf figurine'], 'It is named for a Babylonian king.', 'The Hammurabi stele pairs a relief image with an inscribed law code.'],
      ['tf', 2, 'Assyrian palace reliefs often showed royal hunts and military campaigns.', 0, 'The palaces were statements of power.', 'Reliefs of lion hunts and wars glorified the king.'],
      ['mc', 3, 'Which question best helps you understand a royal Assyrian relief?', ['Who ordered it, and what did the king want viewers to believe?', 'How many colours does it use?', 'Was it painted outdoors?', 'Which museum is nearest?'], 'Think about purpose and audience.', 'Royal reliefs were propaganda as well as decoration, so patron and message matter.'],
    ],
  },
  {
    t: 'Ancient Greece: Idealism and the Human Body',
    b: 'Greek artists developed naturalistic bodies, balanced proportion and architectural orders that shaped later Europe.',
    m: 8,
    body: `Greek art is usually divided into periods. The Geometric period (about 900-700 BCE) favoured patterned vases. In the Archaic period, stiff standing figures called kouroi (young men) and korai (young women) show Egyptian influence: rigid, frontal, one foot forward. In the Classical period (roughly 480-323 BCE), sculptors learned to show weight and movement. The pose called contrapposto has a figure shifting weight onto one leg so that hips and shoulders tilt, giving a relaxed, lifelike stance. The sculptor Polykleitos was known for a theory of ideal proportion, the "canon".

Greek artists often showed an idealised human, not an individual portrait. Much of what we see in museums is marble, but many statues were originally painted, and many marble figures survive only as later Roman copies of lost bronze originals.

The Parthenon, a temple of Athena on the Athenian Acropolis, was built between 447 and 432 BCE; the sculptor Pheidias is traditionally associated with its sculptural programme. Greek architecture is described by orders, the column styles: Doric (plain), Ionic (scrolled capitals) and Corinthian (leafy capitals). Vase painters moved from black-figure to red-figure technique in the late sixth century BCE, which allowed finer inner detail.

After Alexander the Great, the Hellenistic period (323-31 BCE) showed more emotion and drama, as in the Laocoon group and the Nike of Samothrace.`,
    q: [
      ['tf', 1, 'Many Greek marble statues were originally painted.', 0, 'The white look of museum marble can mislead.', 'Evidence shows that many Greek sculptures and buildings carried colour.'],
      ['mc', 1, 'What does contrapposto describe?', ['A pose with weight shifted onto one leg', 'A column style with scrolled capitals and fluting', 'A black-figure vase', 'A building plan'], 'Think about how a relaxed person stands.', 'Contrapposto gives a lifelike stance by tilting hips and shoulders.'],
      ['mc', 2, 'Which column order has scrolled capitals?', ['Ionic', 'Doric order', 'Corinthian', 'Tuscan order'], 'Look for the scrolls.', 'Ionic capitals have volutes, scroll shapes.'],
      ['tf', 2, 'The Parthenon was built in the Hellenistic period after Alexander the Great.', 1, 'Compare 447 BCE with 323 BCE.', 'The Parthenon dates to the Classical period, in the fifth century BCE.'],
      ['mc', 3, 'Why can museum Greek sculpture be misleading about the original?', ['Many pieces are Roman copies of lost bronzes, and the colour has worn away', 'Greek artists never used marble', 'All Greek statues were modern forgeries', 'Greek sculptors never made human figures'], 'Two things changed: who made the surviving piece and its surface.', 'Surviving marbles are often copies of lost bronzes and have lost their painted surfaces.'],
    ],
  },
  {
    t: 'Ancient Rome: Portraits, Concrete and Empire',
    b: 'Roman artists absorbed Greek models but excelled at portraiture, narrative relief and engineering.',
    m: 8,
    body: `Rome admired Greek art and copied it widely, which is one reason we know so many Greek compositions today. But Roman art also had its own priorities: portraiture, public storytelling and engineering.

Portrait sculpture in the Republic often showed older men with lined, unflattering faces, a style sometimes called veristic, probably valuing experience and seriousness. Emperors used images as political messages. The statue of Augustus from Prima Porta, from around the turn of the first century CE, shows him as a calm, idealised commander in a decorated breastplate, mixing a Greek-style ideal body with Roman symbols of victory.

Roman builders developed concrete, the arch, the vault and the dome. The Colosseum, an amphitheatre in Rome, opened in 80 CE. The Pantheon, rebuilt under Emperor Hadrian in the 120s CE, has a vast concrete dome with a central opening, the oculus. Trajan's Column, dedicated in 113 CE, wraps a continuous spiral relief around its shaft to record the emperor's campaigns in Dacia (in present-day Romania), turning history into a visual story.

Painting and mosaic survive best at Pompeii, preserved when Mount Vesuvius erupted in 79 CE. Wall paintings show landscapes, myths, still lifes and imagined architecture; mosaic floors used tiny cut stones called tesserae. The empire's art also reflected its power, including conquest and slavery, which an honest look should not forget.`,
    q: [
      ['tf', 1, 'Pompeii preserved many Roman paintings and mosaics because of a volcanic eruption.', 0, 'Think about Vesuvius.', 'The eruption of 79 CE buried the city and protected its wall paintings and mosaics.'],
      ['mc', 1, 'What are tesserae?', ['Small cut pieces used to make mosaics', 'Roman coins first minted under the Caesars', 'Types of column', 'Marble statues'], 'Mosaics are made of many small parts.', 'Tesserae are the tiny stones or glass pieces that form a mosaic.'],
      ['mc', 2, 'Which Roman innovation allowed the Pantheon\'s large dome?', ['Concrete', 'Stained glass', 'Flying buttresses', 'Steel beams'], 'Think about material.', 'Roman concrete let builders cast vaults and domes.'],
      ['tf', 2, 'Trajan\'s Column tells the story of a military campaign in a spiral relief.', 0, 'It records the Dacian wars.', 'The spiral relief records Trajan\'s campaigns in Dacia.'],
      ['mc', 3, 'Why would a Republic portrait show an older man with wrinkles?', ['It may have valued experience and seriousness over youthful beauty', 'The Romans could not carve young faces', 'It was a copy of Egyptian art', 'Wrinkles indicated a god'], 'Consider what qualities the portrait wanted to show.', 'Scholars often read veristic portraits as expressing gravity and civic experience.'],
    ],
  },
  // ---------- Track 2: Byzantine, Islamic, medieval Europe ----------
  {
    t: 'Byzantine Art: Gold, Icons and Heaven on Earth',
    b: 'The art of the eastern Roman Empire used gold mosaics and icons to suggest a spiritual world.',
    m: 7,
    body: `When Emperor Constantine dedicated the city of Constantinople in 330 CE, the eastern half of the Roman world gained a new capital. Historians call its later Greek-speaking Christian empire "Byzantine" (the name Byzantium comes from the city's earlier name). It lasted until Constantinople fell to the Ottomans in 1453.

Byzantine art aims less at realistic space than at a sense of the holy. Figures are frontal, solemn and elongated against shimmering gold backgrounds, which are not a landscape but a light that belongs to heaven. Mosaics of tiny glass and gold tesserae, set at slight angles, flicker with candlelight.

The great church of Hagia Sophia ("Holy Wisdom") in Constantinople was completed in 537 under Emperor Justinian, by the architects Anthemius of Tralles and Isidore of Miletus. Its huge central dome rests on pendentives, curved triangular supports that carry a round dome over a square space. In Ravenna, Italy, the church of San Vitale holds mosaics of Justinian and Empress Theodora with their court, made in the middle of the sixth century.

Icons, painted images of Christ, Mary and saints, were venerated in eastern Christianity. In the eighth and ninth centuries a conflict called iconoclasm ("image-breaking") divided the empire over whether such images were proper; images were restored in 843. The icon tradition continued afterwards in the Orthodox world, including Russia.`,
    q: [
      ['tf', 1, 'Byzantine mosaics often use gold backgrounds to suggest a heavenly space.', 0, 'The gold is not a landscape.', 'Gold grounds signal a sacred, timeless setting rather than natural space.'],
      ['mc', 1, 'Which church in Constantinople was completed in 537 under Justinian?', ['Hagia Sophia', 'The Parthenon', 'Notre-Dame', 'The Pantheon'], 'Its name means Holy Wisdom.', 'Hagia Sophia was completed in 537.'],
      ['mc', 2, 'What are pendentives?', ['Curved supports that let a dome sit on a square space', 'Gold backgrounds', 'Painted icons of saints made on wooden panels for private homes', 'Wall paintings'], 'They solve an engineering problem under a dome.', 'Pendentives transfer the dome\'s weight to the corners of a square base.'],
      ['tf', 2, 'Iconoclasm was a dispute over whether religious images should be used.', 0, 'The word means image-breaking.', 'Iconoclast controversies of the eighth and ninth centuries centred on religious images.'],
      ['mc', 3, 'Why are Byzantine figures often flat and frontal rather than shown in deep space?', ['The art aimed to express a spiritual reality rather than ordinary appearances', 'The artists did not know how to paint', 'They copied Egyptian wall paintings exactly', 'Oil paint was not yet invented, so shapes were simple'], 'Consider what the images were for.', 'The style supports devotion and the sense of a holy presence.'],
    ],
  },
  {
    t: 'Islamic Art: Calligraphy, Pattern and Architecture',
    b: 'Islamic art spans many regions and centuries, and is known for calligraphy, geometry and tilework.',
    m: 8,
    body: `"Islamic art" is a convenient label for art made in lands where Muslim cultures shaped society, from Spain to South Asia, across more than a thousand years. It is not one style; it includes works for mosques, palaces and homes, made by people of different regions and faiths.

Calligraphy is among its most honoured arts, because it presents the words of the Qur'an, the sacred book of Islam, in written form. Scripts developed for different uses: the angular Kufic, the flowing naskh, the grand thuluth often used in inscriptions on buildings, and nasta'liq, favoured for Persian poetry. Calligraphers are respected as artists, and writing is often built into architecture.

In religious settings, art generally avoids images of living beings, and uses geometric patterns, the interlacing plant forms called arabesque, and stalactite-like vaulting called muqarnas. Pattern is based on repeating, rotating and interlacing shapes, which many see as pointing to unity and infinity. Figural images do appear in secular and courtly contexts, such as Persian and Mughal book painting.

Landmarks include the Dome of the Rock in Jerusalem, completed around 691-692 CE under the Umayyad caliph Abd al-Malik, and the Alhambra in Granada, a palace complex mainly of the thirteenth and fourteenth centuries. The Taj Mahal in India was commissioned by the Mughal emperor Shah Jahan and built mainly in the 1630s and 1640s as a tomb. Tiles, carved stucco and light all play a role.`,
    q: [
      ['tf', 1, 'Calligraphy is highly honoured in Islamic art because it presents the words of the Qur\'an.', 0, 'Think about the role of text.', 'Writing sacred text beautifully is a central art.'],
      ['mc', 1, 'Which word names interlacing plant-based decoration?', ['Arabesque', 'Muqarnas vaulting', 'Fresco painting', 'Tessera pieces'], 'Not the stalactite vaulting.', 'Arabesque is rhythmic, interlacing vegetal ornament.'],
      ['mc', 2, 'Which is a calligraphic script?', ['Naskh', 'Contrapposto', 'Ukiyo-e', 'Sfumato'], 'It is a style of writing.', 'Naskh is a flowing script still widely used.'],
      ['tf', 2, 'Figural images never appear anywhere in Islamic art.', 1, 'Think about book painting.', 'Figural images appear in secular and courtly works such as Persian and Mughal manuscripts.'],
      ['mc', 3, 'Why is "Islamic art" a limited label?', ['It covers many regions, centuries and styles', 'It refers only to one century', 'It describes only buildings in Spain', 'It means only calligraphy'], 'Count the places and centuries named in the lesson.', 'The label covers a very wide range of cultures and periods.'],
    ],
  },
  {
    t: 'Romanesque: Stone, Pilgrims and Powerful Churches',
    b: 'Between about 1000 and 1150, western Europe built heavy round-arched churches filled with carved stories.',
    m: 7,
    body: `After the year 1000, western Europe saw growing populations, trade, and pilgrimage. Builders raised large stone churches in a style later called Romanesque ("Roman-like"), a nineteenth-century label chosen because of the round arches and vaults that echoed Roman building.

Look for thick walls, round arches, barrel vaults (a continuous half-cylinder ceiling), sturdy piers and small windows. The walls had to be heavy to hold the stone roof, so there was little room for light. Pilgrimage routes, such as those to Santiago de Compostela in Spain, encouraged churches with aisles that let crowds of visitors walk around the relics. Durham Cathedral in England and the cathedral group at Pisa in Italy are well-known examples.

Sculpture appears at doorways. The semicircular tympanum above a portal often shows the Last Judgment, such as at Autun in France, warning and instructing a largely non-reading public. Figures are stylised, expressive and sometimes elongated to fit the space.

Another famous work, the Bayeux Tapestry, is in fact an embroidery, made in the later eleventh century. It tells the story of the Norman conquest of England in 1066 in a long strip of linen with coloured wool thread, and it remains a precious source though it presents the Norman view.

Monasteries also kept the art of illuminated (hand-decorated) manuscripts alive. Romanesque forms prepared the way for Gothic, which reached for height and light.`,
    q: [
      ['tf', 1, 'Romanesque churches typically have thick walls and round arches.', 0, 'The name echoes Rome.', 'Round arches and heavy walls characterise the style.'],
      ['mc', 1, 'Why do Romanesque churches often have small windows?', ['The thick walls had to support heavy stone vaults', 'The builders disliked sunlight and avoided windows on purpose', 'Glass had not been invented', 'They were built underground'], 'Think about the roof.', 'Large openings would weaken walls carrying a heavy vault.'],
      ['mc', 2, 'The Bayeux Tapestry is actually which kind of work?', ['An embroidery', 'A hand-woven wool carpet', 'A painted wall fresco', 'A mosaic of tiny stones'], 'The name misleads.', 'It is embroidered with wool thread on linen.'],
      ['tf', 2, 'The tympanum is the carved area above a church doorway.', 0, 'It is semicircular.', 'The tympanum often held the Last Judgment or another teaching scene.'],
      ['mc', 3, 'Why might Romanesque doorway sculptures show the Last Judgment?', ['To teach and warn a congregation that mostly could not read', 'To advertise shops', 'To record legal contracts', 'To show the weather'], 'Think about the audience.', 'Images served as instruction for many who could not read.'],
    ],
  },
  {
    t: 'Gothic: Light, Height and the Cathedral',
    b: 'Gothic builders used pointed arches, ribbed vaults and flying buttresses to open walls to stained glass.',
    m: 8,
    body: `Gothic architecture began in France in the twelfth century. Its traditional starting point is the abbey church of Saint-Denis near Paris, where Abbot Suger rebuilt the choir, consecrated in 1144, with an emphasis on light. The word "Gothic" was a later insult: Renaissance writers used it for medieval work they considered barbaric, after the Goths.

Three structural ideas lie behind the style. The pointed arch carries weight more directly downward than a round arch and can span varied widths. The ribbed vault channels the roof's weight into slender ribs and piers. The flying buttress, an arched support outside the wall, takes the sideways push of the vault, so the wall itself can be filled with windows. The result is tall, airy interiors, such as Chartres Cathedral, largely rebuilt after a fire in 1194, and Notre-Dame in Paris, begun in 1163. Sainte-Chapelle in Paris, consecrated in 1248, is a jewel-like room of stained glass.

Stained glass tells Bible stories and saints' lives in coloured light, and many people saw it as a symbol of divine light. Sculpture at portals became more naturalistic over time. Painting and manuscripts later developed an elegant courtly style often called International Gothic.

Cathedrals took generations to complete and involved masons, glaziers, carpenters and patrons. Notre-Dame suffered a major fire in April 2019, and restoration relied on this same medieval structural knowledge.`,
    q: [
      ['tf', 1, 'Flying buttresses let Gothic walls be filled with large windows.', 0, 'They support from outside.', 'Buttresses take the vault\'s sideways thrust so walls need not be solid.'],
      ['mc', 1, 'Where did Gothic architecture begin?', ['France', 'Spain, near Santiago', 'Egypt, along the Nile', 'Russia, near Moscow'], 'Think of Saint-Denis.', 'The style is traditionally traced to the abbey church of Saint-Denis in France.'],
      ['mc', 2, 'Where did the word "Gothic" for this style come from?', ['Later critics used it as an insult, after the Goths', 'The builders chose it themselves', 'It was named after a German city where the first cathedral rose', 'It came from stained glass makers'], 'The name was not complimentary.', 'Renaissance writers applied it to medieval work they thought barbaric.'],
      ['tf', 2, 'The pointed arch is a feature of Romanesque rather than Gothic buildings.', 1, 'Romanesque uses round arches.', 'Pointed arches are a hallmark of Gothic building.'],
      ['mc', 3, 'Why is stained glass considered more than decoration in a Gothic cathedral?', ['It taught stories and symbolised divine light', 'It kept the building warm', 'It was cheaper than stone', 'It was only used in houses'], 'Consider both message and symbol.', 'Windows carried narrative and spiritual meaning.'],
    ],
  },
  // ---------- Track 3: Asia, Africa and the Americas ----------
  {
    t: 'Song Dynasty Landscape: Painting the Mountains and Water',
    b: 'Chinese landscape painting of the Song dynasty sought the order of nature, not a single view of a place.',
    m: 8,
    body: `The Song dynasty ruled China from 960 to 1279, and its landscape painting is among the most admired in the world. The Chinese word for landscape, shanshui, means "mountain-water".

Painters worked with ink and brush on silk or paper, usually in hanging scrolls or in long handscrolls unrolled section by section, so a viewer travels through the scene in time. They did not usually paint outdoors from one spot; they built an image from years of looking and from memory. The goal was less to copy a particular place than to capture its structure and spirit.

In Northern Song painting, towering mountains dominate. Fan Kuan's "Travelers among Mountains and Streams", from around 1000, shows a huge cliff over tiny travellers with pack animals, which places human life within a vast order. The painter Guo Xi, whose "Early Spring" is dated 1072, wrote about three kinds of distance: high distance, deep distance and level distance, which describe different ways the eye moves in a landscape.

After 1127, in the Southern Song, painters such as Ma Yuan and Xia Gui used more empty space and often placed the main subjects in a corner, so mist and blank silk become part of the picture. Educated amateurs, the scholar-artists, valued painting that showed personal character, and calligraphy and poetry belonged beside the image.`,
    q: [
      ['tf', 1, 'The Chinese word shanshui means "mountain-water" and refers to landscape.', 0, 'The lesson gives the translation.', 'Shanshui is the traditional term for landscape painting.'],
      ['mc', 1, 'How is a handscroll usually viewed?', ['Unrolled gradually, section by section', 'All at once on a wall', 'Only from far away', 'In a dark chamber lit only by a few candles'], 'It is long and narrow.', 'The viewer reveals the scene bit by bit, like a journey.'],
      ['mc', 2, 'What does Fan Kuan\'s "Travelers among Mountains and Streams" emphasise?', ['Huge mountains with tiny human travellers', 'A single formal portrait of an emperor on a throne', 'A city street', 'A still life of fruit'], 'Think about the scale of people.', 'The vast cliff and small travellers place people within nature.'],
      ['tf', 2, 'Southern Song painters such as Ma Yuan often used large areas of empty space.', 0, 'Mist can be an active part of the composition.', 'Empty silk suggested mist and distance.'],
      ['mc', 3, 'Why is a Song landscape not best described as a copy of one view?', ['It was built from observation and memory to show the structure and spirit of nature', 'Painters were forbidden to look at nature', 'It was made with a camera lens', 'It depicts only imaginary cities'], 'Think about how painters worked.', 'Artists synthesised experience rather than recording a single viewpoint.'],
    ],
  },
  {
    t: 'Ukiyo-e: Pictures of the Floating World',
    b: 'Japanese woodblock prints of the Edo period brought theatre, beauty and landscape to a wide public.',
    m: 7,
    body: `During the Edo period (1603-1868), peace and growing cities created a new urban public in Japan. Ukiyo-e, "pictures of the floating world", showed the fashionable pleasures of those cities: kabuki actors, celebrated beauties, scenes of travel, and later landscape and nature. The "floating world" was a phrase for transient, pleasure-seeking city life.

Prints were a team effort. A publisher commissioned the work, an artist drew the design, a carver cut it into woodblocks, and a printer pressed it onto paper using one block for each colour. The artist's name is famous, but carvers and printers were essential. Because many impressions could be printed, the pictures were affordable. From 1765 Suzuki Harunobu helped popularise full-colour prints. Kitagawa Utamaro became known for portraits of beauties, with the face and hair in close view.

Two artists define the landscape print. Katsushika Hokusai's "Thirty-Six Views of Mount Fuji", made in the early 1830s, includes "Under the Wave off Kanagawa", the famous curling wave. Utagawa Hiroshige's "Fifty-three Stations of the Tokaido", also from the 1830s, records a journey along the main road between Edo and Kyoto with weather and mood.

Look at flat areas of colour, strong outline, bold cropping, and the way lines guide the eye. A new imported blue pigment, often called Prussian blue, became popular in these years. These prints later reached Europe and had a wide effect.`,
    q: [
      ['tf', 1, 'A single ukiyo-e print was typically the work of one person only.', 1, 'Think of the publisher, artist, carver and printer.', 'Prints were produced by a team including publisher, artist, carver and printer.'],
      ['mc', 1, 'What does ukiyo-e mean?', ['Pictures of the floating world', 'Mountain-water painting of misty valleys', 'Pictures of the heavens', 'Scrolls of poetry'], 'The lesson translates it.', 'The phrase refers to the transient pleasures of city life.'],
      ['mc', 2, 'Which artist made "Thirty-Six Views of Mount Fuji"?', ['Katsushika Hokusai', 'Utagawa Hiroshige of Edo', 'Kitagawa Utamaro of Edo', 'Fan Kuan of Song China'], 'It includes the famous wave.', 'Hokusai made the series in the early 1830s.'],
      ['tf', 2, 'One woodblock was usually used for each colour in a multicolour print.', 0, 'Printing in layers.', 'Separate blocks were carved and printed for each colour.'],
      ['mc', 3, 'Why were prints more widely affordable than paintings?', ['Many impressions could be printed from the same blocks', 'They were made without paper', 'They were government-issued', 'They were drawn by apprentices only'], 'Think about reproduction.', 'The block process allowed many copies, lowering the cost of each.'],
    ],
  },
  {
    t: 'African Artistic Traditions: An Overview',
    b: 'Africa holds many distinct art histories, from Nok terracottas to Benin brasses, which one label cannot sum up.',
    m: 8,
    body: `Africa is a continent of many peoples and thousands of years of art history, so the phrase "African art" can hide more than it reveals. A careful study names specific places, cultures and periods, and asks what the works were for.

Some examples show the range. Nok terracotta heads and figures from central Nigeria are more than two thousand years old. In Ife, a Yoruba city, artists made lifelike heads in copper alloy between about the twelfth and fifteenth centuries. The Kingdom of Benin (in present-day Nigeria) produced cast brass plaques and heads that recorded court history from about the sixteenth century on. In 1897 a British military expedition looted thousands of these works, and today many are in museums abroad; whether and how to return them is an active debate about restitution. Great Zimbabwe, a large stone-walled city of the eleventh to fifteenth centuries, shows monumental building. The painted churches and rock-hewn churches of Ethiopia, such as those at Lalibela, belong to a long Christian tradition, and the rock art of the Tassili n'Ajjer in the Sahara is ancient. Textiles such as Asante kente cloth carry meanings through pattern and colour.

Many masks and figures were made to be used, not just viewed: in performance, ritual, or the marking of leadership. Removing them from their setting changes how they are understood. Early European and American collectors often did not record the artists' names; modern research increasingly restores them.`,
    q: [
      ['tf', 1, 'The phrase "African art" describes one single style.', 1, 'Count the cultures named in the lesson.', 'Africa has many cultures and periods, each with its own traditions.'],
      ['mc', 1, 'Which kingdom made cast brass plaques recording court history?', ['Benin', 'Imperial Rome', 'The Byzantine empire', 'Song China'], 'In present-day Nigeria.', 'Benin court artists cast brass plaques and heads.'],
      ['mc', 2, 'Why is it useful to know a mask\'s original use?', ['Many were made for performance or ritual, so context affects meaning', 'Masks cannot be seen without context', 'All masks are decorations only', 'Their use never changed over the centuries, so context adds nothing new'], 'Think of function, not looks.', 'Understanding the setting prevents mistaking a used object for pure display.'],
      ['tf', 2, 'Debates about returning looted works from the 1897 Benin expedition are called restitution debates.', 0, 'They concern returning items.', 'Restitution refers to returning cultural property to its places of origin.'],
      ['mc', 3, 'Which approach best avoids over-generalising?', ['Naming the specific culture, period and purpose of a work', 'Calling every object "tribal art"', 'Ignoring where objects came from', 'Assuming all works are ancient'], 'Specificity is the antidote to stereotype.', 'Precise attribution respects the diversity of traditions.'],
    ],
  },
  {
    t: 'Art of the Indigenous Americas: An Overview',
    b: 'From the Maya and Inca to Pueblo potters and Northwest Coast carvers, Indigenous art is both ancient and living.',
    m: 8,
    body: `Before European arrival, the Americas had many societies with their own art traditions, and Indigenous artists continue to work today. As with Africa, specific names matter more than a single label.

In Mesoamerica, the Olmec made colossal carved stone heads more than 2,500 years ago. The Maya built stepped pyramids and carved stone monuments with hieroglyphic texts and portraits of rulers, and painted ceramics and murals; the murals of Bonampak date from the late eighth century CE. The Mexica (Aztec) capital Tenochtitlan was built in the fourteenth and fifteenth centuries; its monumental stone carvings include the so-called Sun Stone, a calendar-related carving.

In the Andes, Inca builders fitted stone blocks closely without mortar, as at Sacsayhuaman and Machu Picchu, which date to the fifteenth century. The Inca recorded information with knotted cords called khipu. Earlier Andean peoples, such as the Paracas, created remarkably fine textiles.

In North America, Cahokia (in present-day Illinois) was a large Mississippian city with earthen mounds, flourishing about 1050-1350 CE. On the Northwest Coast, peoples such as the Haida, Tlingit and Kwakwaka'wakw carve cedar poles that display family histories and rights. Pueblo potters in the Southwest, among them Maria Martinez of San Ildefonso in the twentieth century, developed celebrated pottery traditions. Plains artists painted hides and, later, made "ledger art" on paper.

When viewing, ask which community made the work and for whom, and recall that many pieces are sacred or restricted.`,
    q: [
      ['tf', 1, 'Inca builders joined stone blocks tightly without mortar at sites such as Machu Picchu.', 0, 'Fitting stones.', 'Fine stone-cutting held walls together without mortar.'],
      ['mc', 1, 'What was a khipu?', ['A system of knotted cords used to record information', 'A carved cedar pole', 'A style of pottery', 'A kind of mound'], 'Cords and knots.', 'The Inca used khipu for record-keeping.'],
      ['mc', 2, 'Which peoples carve cedar poles that record family histories on the Northwest Coast?', ['Haida, Tlingit and Kwakwaka\'wakw, among others', 'Inca and Maya only', 'Sumerians and Akkadians', 'Vikings'], 'Look at the geography in the lesson.', 'Northwest Coast peoples carve such poles.'],
      ['tf', 2, 'Indigenous art traditions in the Americas ended after European arrival.', 1, 'Think of Maria Martinez or ledger art.', 'Many traditions continued and have been renewed, and Indigenous artists work today.'],
      ['mc', 3, 'Why should museum labels name a community, not just "Native American"?', ['Because meanings and uses differ among communities', 'Because all communities used one shared style and the same symbols', 'Because labels are decoration', 'Because it makes objects older'], 'Different cultures, different purposes.', 'Specific attribution reflects real cultural distinctions.'],
    ],
  },
  // ---------- Track 4: The Renaissance ----------
  {
    t: 'Early Renaissance: Florence and the Rebirth of Antiquity',
    b: 'In fifteenth-century Florence, artists combined study of the ancient world with new tools such as linear perspective.',
    m: 8,
    body: `"Renaissance" means rebirth: a revived interest in the art and thought of ancient Greece and Rome, strongest in Italy from the fourteenth to the sixteenth centuries. Humanism, a movement that studied classical texts and valued human potential, shaped it. Florence, a wealthy republic of banking and cloth, was its early centre, with patrons including powerful families such as the Medici, merchants and guilds.

The painter Giotto (around 1300) is often called a forerunner for giving figures weight and emotion, as in the Scrovegni (Arena) Chapel in Padua. In the fifteenth century, artists developed linear perspective, a mathematical system in which parallel lines meet at a vanishing point to create the illusion of depth on a flat surface. The architect Filippo Brunelleschi is traditionally credited with devising it, and Leon Battista Alberti wrote it down in his treatise On Painting (1435). Masaccio used it in the Holy Trinity fresco (about 1425-27), where a painted barrel-vaulted chapel seems to open into the wall. Brunelleschi's dome for Florence Cathedral was completed in 1436 without a full wooden frame, a feat of engineering.

Donatello's bronze David, made in the 1440s by most accounts (the date is debated), was the first free-standing nude statue since antiquity. Botticelli's Birth of Venus, around 1485, shows a classical myth in a graceful linear style.

The Renaissance was not a sudden break; medieval art and learning continued, and the idea of a "dark age" followed by a "rebirth" is itself an interpretation that historians question.`,
    q: [
      ['tf', 1, 'Renaissance means "rebirth".', 0, 'The word is French for something revived.', 'The name refers to the revival of classical antiquity.'],
      ['mc', 1, 'What does linear perspective do?', ['Creates the illusion of depth using lines that meet at a vanishing point', 'Adds gold to the background', 'Makes figures flat', 'Mixes pigments with oil'], 'Think of railway tracks.', 'It uses a mathematical system of converging lines for depth.'],
      ['mc', 2, 'Which Florentine architect is credited with the cathedral dome completed in 1436?', ['Brunelleschi', 'Giotto di Bondone', 'Abbot Suger of Saint-Denis', 'Emperor Hadrian of Rome'], 'He is also credited with perspective.', 'Brunelleschi designed the dome of Florence Cathedral.'],
      ['tf', 2, 'Historians treat the Renaissance as a sudden complete break from medieval culture.', 1, 'The lesson ends with a caution.', 'Medieval art and learning continued, and the "break" idea is questioned.'],
      ['mc', 3, 'What was Masaccio\'s Holy Trinity famous for?', ['Using perspective to make a painted chapel seem to open into the wall', 'Being a mosaic', 'Showing a wide landscape of snowy mountains and winding rivers beneath the sky', 'Being painted on canvas'], 'It is a fresco.', 'It is an early striking use of linear perspective.'],
    ],
  },
  {
    t: 'High Renaissance: Harmony, Balance and Grandeur',
    b: 'Around 1490 to 1527, Rome and Florence produced works of ideal balance and monumental scale.',
    m: 8,
    body: `The High Renaissance is usually dated from about 1490 to the Sack of Rome in 1527. Its centres were Florence, Milan and especially Rome, where popes such as Julius II hired artists to glorify the Church and the city.

Its look values harmony, order and balance. Compositions are often arranged in stable shapes such as a pyramid; figures are idealised yet convincing; space is clear and unified. Leonardo da Vinci's Last Supper (about 1495-98), painted on a wall of a monastery in Milan, places the apostles in groups of three on each side of a central Christ, with perspective lines leading to him. Leonardo also used sfumato, a soft blending of tones without hard outlines, in works such as the Mona Lisa (begun around 1503).

Raphael's School of Athens (1509-11), a fresco in the Vatican, shows ancient philosophers in a grand architectural space, uniting the thought of antiquity with Renaissance order. Michelangelo's marble David (1501-04) in Florence and his Sistine Chapel ceiling (1508-12), commissioned by Julius II, show muscular, powerful bodies.

Fresco means painting in water-based pigment on wet plaster, so the colour becomes part of the wall; artists worked in daily sections, because the plaster had to stay wet. It rewards planning.

Because this lesson is about style, individual biographies are left to other courses. Ask in front of a High Renaissance work: where is the centre? How is balance achieved?`,
    q: [
      ['tf', 1, 'In fresco, pigment is applied to wet plaster.', 0, 'The colour sinks into the wall.', 'True fresco uses wet plaster, so artists worked in sections.'],
      ['mc', 1, 'Which artist painted The School of Athens in the Vatican?', ['Raphael', 'Leonardo', 'Donatello', 'Botticelli'], 'Its figures include ancient philosophers.', 'Raphael painted it in 1509-11.'],
      ['mc', 2, 'What is sfumato?', ['A soft blending of tones without hard outlines', 'A column order', 'A method of woodblock printing', 'A type of vault'], 'Think smoke.', 'The word comes from the Italian for smoke.'],
      ['tf', 2, 'High Renaissance compositions often favour balanced, stable arrangements.', 0, 'Think of a pyramid.', 'Harmony and balance are central goals.'],
      ['mc', 3, 'Who commissioned Michelangelo to paint the Sistine ceiling?', ['Pope Julius II', 'King Louis XIV', 'Lorenzo de\' Medici', 'Emperor Hadrian'], 'A powerful Roman patron.', 'Julius II commissioned the ceiling, painted 1508-12.'],
    ],
  },
  {
    t: 'Venetian Renaissance: Colour, Oil and Canvas',
    b: 'Venice emphasised colour and atmosphere, and made oil painting on canvas a standard.',
    m: 7,
    body: `Venice was a maritime republic whose wealth came from trade with the eastern Mediterranean, and its painters developed a distinct approach in the sixteenth century. Where Florentine and Roman tradition stressed drawing (disegno), the Venetian emphasis was on colour and light (colorito).

Practical conditions mattered. Venice's damp air was a poor environment for fresco, which struggles in moisture. Painters turned to oil paint on canvas, a flexible, lightweight support that could be rolled and shipped. Oil dries slowly and can be applied in thin transparent layers called glazes, allowing deep colour, soft transitions and rich surfaces. Oil painting had been refined in Northern Europe earlier, with Jan van Eyck often named as a master of its use.

Giovanni Bellini, who ran a leading workshop, helped bring a warm, luminous light into Venetian painting. Giorgione created poetic landscapes, though few works are securely attributed to him. Titian, one of the longest-working painters of the period, produced altarpieces such as the Assumption of the Virgin (1516-18) in the Frari church in Venice, mythological scenes, and portraits for rulers across Europe. Tintoretto brought dynamic movement and dramatic light, and Veronese painted vast banquet scenes with bright colour.

Venetian painting shaped later artists, including Rubens and Velazquez. When you look, notice brushwork: visible strokes and layered colour are part of the expression, not a flaw.`,
    q: [
      ['tf', 1, 'Venetian painters often used oil paint on canvas.', 0, 'Humid Venice was hard for fresco.', 'Canvas and oil suited the damp climate.'],
      ['mc', 1, 'Which word describes the Venetian emphasis on colour?', ['Colorito', 'Disegno', 'Sfumato', 'Contrapposto'], 'The Italian word for colouring.', 'Colorito contrasts with the Florentine emphasis on disegno.'],
      ['mc', 2, 'What are glazes in oil painting?', ['Thin transparent layers of colour', 'Panels of gold leaf', 'Wet plaster layers', 'Wood carving tools'], 'They let light pass through to lower layers.', 'Glazes build depth and luminous colour.'],
      ['tf', 2, 'Titian painted the Assumption of the Virgin for a church in Venice.', 0, 'It hangs in the Frari.', 'It was painted 1516-18 for the Frari.'],
      ['mc', 3, 'Why was canvas practical for painters of Venice?', ['It was light, flexible, and suited to damp conditions', 'It never needed paint', 'It was invented by Titian during the 1520s in his Venice workshop', 'It was required by law'], 'Think about transport and damp air.', 'Canvas could be rolled and shipped and resisted damp better than fresco walls.'],
    ],
  },
  {
    t: 'Northern Renaissance: Oil, Detail and Print',
    b: 'In the Netherlands and Germany, artists prized minute detail, symbolism and the new power of the printed image.',
    m: 8,
    body: `Renaissance art in northern Europe developed alongside Italy's but followed its own path. Where Italian artists often stressed ideal proportion and mathematical perspective, Northern painters were famed for patient observation of surfaces: fabric, metal, skin, light on glass.

Oil painting made this possible. Jan van Eyck, working in Flanders, used layered oil glazes for jewel-like colour. His Ghent Altarpiece was completed in 1432, and his Arnolfini Portrait of 1434 contains a convex mirror reflecting the room. Rogier van der Weyden brought strong emotion to religious scenes. Hieronymus Bosch's Garden of Earthly Delights, painted about 1490-1510, is a crowded, enigmatic triptych that scholars still interpret in different ways. Pieter Bruegel the Elder painted peasant life and seasons, as in Hunters in the Snow (1565). Hans Holbein the Younger painted The Ambassadors (1533), which includes a distorted skull visible from the side, an example of anamorphosis.

Printing changed art too. After Johannes Gutenberg's press (around 1450), woodcuts and engravings spread images cheaply. Albrecht Durer of Nuremberg made prints famous across Europe.

The Protestant Reformation, which began in 1517, led some regions to reject religious images, which pushed artists towards portraits, landscapes and everyday scenes.

Look for objects that carry meaning, such as a lit candle or a dog. Some symbolic readings are debated, so treat claims with care.`,
    q: [
      ['tf', 1, 'Northern Renaissance painters were famous for detailed observation of textures.', 0, 'Think glazes and jewels.', 'Oil glazes allowed lifelike surface detail.'],
      ['mc', 1, 'Who painted the Ghent Altarpiece, completed in 1432?', ['Jan van Eyck', 'Raphael', 'Michelangelo', 'Hokusai'], 'A Flemish oil painter.', 'Van Eyck completed it in 1432.'],
      ['mc', 2, 'Which invention helped spread prints across Europe?', ['The printing press', 'The portable film camera', 'The steam-powered engine', 'Early photography plates'], 'Around 1450.', 'Printing from movable type made images and text cheaper.'],
      ['tf', 2, 'The Protestant Reformation began in 1517.', 0, 'The early sixteenth century.', 'It is traditionally dated from 1517.'],
      ['mc', 3, 'How could the Reformation affect artists in Protestant regions?', ['Fewer religious altarpieces were commissioned, so portraits and everyday scenes grew', 'Painting of every kind was banned across all of northern Europe for several long decades', 'Only mosaics were allowed', 'Artists moved to Egypt'], 'Think about what patrons still wanted.', 'Demand shifted away from church images in many places.'],
    ],
  },
  {
    t: 'Mannerism: Elegance, Strain and Artifice',
    b: 'After the High Renaissance, artists exaggerated grace and invented unsettling, sophisticated forms.',
    m: 7,
    body: `Mannerism, from the Italian maniera ("style" or "manner"), is the name given to much European art from about 1520 to 1600. Historians once used it as a put-down, as if its artists merely imitated the masters; many now treat it as a creative response to them.

Typical features are elongated figures, twisting poses, crowded or unstable compositions, and bright, sometimes acid colour. A favoured pose, the figura serpentinata, spirals the body upward like a flame. Artists play with difficulty on purpose, showing off their skill with bodies that could not easily exist in life.

Examples show the range. Pontormo's Deposition (about 1525-28) in Florence floats mourning figures in pale pink and blue with no clear ground. Parmigianino's Madonna with the Long Neck (about 1534-40) stretches the Virgin's neck and the Christ child's body for refined elegance. Bronzino painted cool, polished court portraits. In Mantua, Giulio Romano designed the Palazzo Te with deliberately odd architectural jokes. El Greco, trained in Crete and Venice and working in Spain, painted elongated, flame-like figures, as in the Burial of the Count of Orgaz (1586-88).

Context may have contributed: religious turmoil after 1517, and the shock of the Sack of Rome in 1527. But scholars debate whether Mannerism was a reaction against the High Renaissance or its continuation. When you look, ask whether the strangeness feels playful, anxious, or both.`,
    q: [
      ['tf', 1, 'The Italian word maniera means "style" or "manner".', 0, 'The name comes from it.', 'Mannerism takes its name from maniera.'],
      ['mc', 1, 'Which feature is typical of Mannerism?', ['Elongated, twisting figures', 'Strict symmetry and calm', 'Gold backgrounds only', 'Flat patterned surfaces with no figures'], 'Think of the Long Neck.', 'Exaggerated, elegant, twisting forms are common.'],
      ['mc', 2, 'Which artist painted the Madonna with the Long Neck?', ['Parmigianino', 'Leonardo da Vinci of Florence', 'Johannes Vermeer of Delft', 'Titian of Venice'], 'The name describes the long neck.', 'Parmigianino painted it about 1534-40.'],
      ['tf', 2, 'Scholars unanimously agree that Mannerism was only a reaction against the High Renaissance.', 1, 'Debate is mentioned in the lesson.', 'Some see a reaction, others a continuation.'],
      ['mc', 3, 'Why did earlier critics sometimes dismiss Mannerism?', ['They saw it as mere imitation or affectation of the masters', 'Because it had no colour', 'Because it was carved only as sculpture for small private chapels abroad', 'Because it was painted in caves'], 'It was a put-down.', 'The label long carried a negative judgment, now reassessed.'],
    ],
  },
  // ---------- Track 5: Baroque to Neoclassicism ----------
  {
    t: 'Baroque: Drama, Light and Emotion',
    b: 'In the seventeenth century, art for Church and court sought to move viewers with movement and strong light.',
    m: 8,
    body: `Baroque art flourished from about 1600 to the mid-eighteenth century. Its early home was Rome, where the Catholic Church, answering the Protestant Reformation in what is called the Counter-Reformation, wanted art that was clear, emotional and persuasive. The Council of Trent (1545-63) had said religious images should teach and inspire. Monarchs, such as France's Louis XIV, used the same theatrical grandeur to display power at palaces like Versailles.

Look for movement, diagonals, strong contrasts of light and dark, and an emphasis on emotion at a peak moment. Chiaroscuro means the contrast of light and shadow; a dramatic version, tenebrism, uses dark surroundings with a spotlight effect. Caravaggio's Calling of Saint Matthew (1599-1600) uses a beam of light and ordinary-looking figures to stage a sacred moment in a dim room. Artemisia Gentileschi painted Judith Slaying Holofernes (versions of about 1612-13 and about 1620) with unusual force. Gian Lorenzo Bernini's sculpture Ecstasy of Saint Teresa (1647-52) combines marble, architecture and hidden light. Peter Paul Rubens filled huge canvases with energy, and Diego Velazquez's Las Meninas (1656) plays with viewpoint and who is looking at whom.

Baroque was not one style across Europe; Dutch Baroque, for example, took a very different, quieter path, as the next lesson shows. Think of Baroque as an art of theatre: it wants you in the scene.`,
    q: [
      ['tf', 1, 'Baroque art often uses strong contrasts of light and dark.', 0, 'Chiaroscuro is a clue.', 'Dramatic light is central to the style.'],
      ['mc', 1, 'Which artist painted the Calling of Saint Matthew?', ['Caravaggio', 'Raphael', 'Botticelli', 'Giotto'], 'He used a spotlight effect.', 'Caravaggio painted it in 1599-1600.'],
      ['mc', 2, 'What was the Counter-Reformation?', ['The Catholic Church\'s response to the Protestant Reformation', 'A style of Chinese painting', 'A Roman building technique', 'A kind of mosaic'], 'It came after 1517.', 'Church leaders used persuasive art as part of their response.'],
      ['tf', 2, 'Bernini\'s Ecstasy of Saint Teresa is a painted fresco.', 1, 'It is marble.', 'It is a marble sculpture group set within an architectural setting.'],
      ['mc', 3, 'Why does Baroque art often show a peak moment of action or feeling?', ['It aimed to involve the viewer emotionally', 'It avoided people', 'It aimed to look flat and calm', 'It was intended to be unreadable to the common viewer'], 'Think of theatre.', 'Drama and emotional engagement served both church and court.'],
    ],
  },
  {
    t: 'The Dutch Golden Age: Painting for a Republic of Merchants',
    b: 'In the seventeenth-century Netherlands, art was made for a broad market of townspeople, not mainly for church or crown.',
    m: 8,
    body: `In the seventeenth century the Dutch Republic, newly independent from Spanish rule after the long Eighty Years' War (1568-1648), became rich through trade. Its dominant church was Calvinist Protestant and did not commission altarpieces. Patrons were wealthy townspeople, guilds and civic groups. Paintings were sold through dealers and markets, and many middle-class homes had pictures.

That market encouraged specialisation. Artists painted portraits, landscapes, seascapes, still lifes, scenes of daily life (genre painting) and church interiors. Rembrandt van Rijn's group portrait The Night Watch (1642) turned a militia company into a drama of light. Frans Hals painted lively, loosely brushed portraits. Johannes Vermeer painted quiet interior scenes with luminous light, as in Girl with a Pearl Earring (about 1665). Jacob van Ruisdael painted dramatic skies over flat land. Vanitas still lifes, with skulls, extinguished candles or wilting flowers, reminded viewers that earthly wealth and life pass.

Do not forget the source of wealth. The Dutch East India Company (VOC, founded 1602) and Dutch trading networks were tied to colonial rule and to the transatlantic slave trade, and some paintings reflect that world of goods and exploitation. Treat the "Golden Age" label as a Dutch national term that hides these costs.

When you look, ask: who bought it, and what did a buyer want to see? Everyday life became a worthy subject.`,
    q: [
      ['tf', 1, 'Dutch painters of this period sold to a broad market of townspeople.', 0, 'Few church commissions.', 'A market of burghers, guilds and dealers supported them.'],
      ['mc', 1, 'Which painting is by Rembrandt?', ['The Night Watch', 'The Calling of Saint Matthew', 'Las Meninas', 'The Swing'], 'A militia company.', 'The Night Watch is Rembrandt\'s 1642 group portrait.'],
      ['mc', 2, 'What is a vanitas still life?', ['A picture reminding viewers that life and wealth are brief', 'A map of the sea', 'A landscape of mountains', 'A religious altarpiece'], 'Skulls and wilting flowers.', 'Vanitas pictures use symbols of transience.'],
      ['tf', 2, 'The wealth behind Dutch art was unconnected to colonial trade.', 1, 'The VOC is mentioned.', 'Trade empires, including colonial exploitation and slavery, helped fund the economy.'],
      ['mc', 3, 'Why did Dutch artists specialise in genres such as landscape or still life?', ['A market of buyers wanted a variety of subjects for their homes', 'Because a king required it', 'Because they could not paint figures', 'Because religious subjects were forced upon them by the Calvinist church authorities'], 'Think about demand.', 'Market demand favoured specialised, saleable subjects.'],
    ],
  },
  {
    t: 'Rococo: Lightness, Play and Ornament',
    b: 'In the early to mid eighteenth century, French and German courts and salons preferred playful, pastel elegance.',
    m: 7,
    body: `Rococo, from the French rocaille (shell-like ornament), emerged in France in the early eighteenth century, after the death of Louis XIV in 1715. Where Baroque was grand and weighty, Rococo is light, graceful and intimate. It suited smaller, private rooms of the aristocracy and the new salons, where conversation and fashion mattered.

Characteristic features are pastel colours, curving asymmetrical ornament, gilded detail, playful themes of love and leisure, and soft brushwork. Antoine Watteau's Pilgrimage to the Isle of Cythera (1717) created the fete galante, a scene of elegant people at leisure in a dreamy landscape. Francois Boucher, a favourite of Madame de Pompadour, the mistress of Louis XV, painted mythological scenes full of pink flesh and clouds. Jean-Honore Fragonard's The Swing (about 1767) is a famous example of flirtatious fantasy. In Bavaria and Austria the style was carried into churches, such as the Wieskirche (1745-54), with bright stucco and painted ceilings.

Not all eighteenth-century art was Rococo. Jean-Simeon Chardin painted quiet still lifes and kitchen scenes, and William Hogarth in England made moralising satirical series, such as A Harlot's Progress (1732).

Critics, among them Denis Diderot, found Rococo frivolous and immoral, and the Enlightenment pushed taste toward seriousness. Its pleasures also rested on privilege in a society of deep inequality, a context worth remembering.`,
    q: [
      ['tf', 1, 'Rococo is generally lighter and more playful than Baroque.', 0, 'Pastel colours.', 'Rococo favoured intimacy and grace over grandeur.'],
      ['mc', 1, 'What is a fete galante?', ['An elegant outdoor gathering scene, popularised by Watteau', 'A stained glass window', 'A Roman portrait', 'A woodblock print'], 'Think of Cythera.', 'Watteau created the type of dreamy leisure scene.'],
      ['mc', 2, 'Who painted The Swing?', ['Fragonard', 'Rembrandt van Rijn', 'Jacques-Louis David', 'Gustave Courbet'], 'He worked about 1767.', 'Fragonard painted it.'],
      ['tf', 2, 'Diderot admired Rococo as the ideal of seriousness.', 1, 'He criticised it.', 'Critics such as Diderot found it frivolous.'],
      ['mc', 3, 'Why does the Rococo style fit private salons better than huge cathedrals?', ['Its delicate scale and ornament suit intimate rooms', 'It uses only monumental sculpture on a vast civic scale', 'It is always black and white', 'It requires stained glass'], 'Think scale.', 'Small, graceful decoration matched intimate interiors.'],
    ],
  },
  {
    t: 'Neoclassicism: Reason, Antiquity and Revolution',
    b: 'Late eighteenth-century artists turned to ancient Greece and Rome for clarity, order and civic virtue.',
    m: 8,
    body: `Neoclassicism ("new classical") arose in the later eighteenth century, in the age of the Enlightenment, which prized reason. It was fed by new knowledge of antiquity: excavations began at Herculaneum in 1738 and Pompeii in 1748, and the writer Johann Joachim Winckelmann praised Greek art for "noble simplicity and quiet grandeur". It was also a reaction against what many saw as the excess of Rococo.

The look is clear, linear and restrained: crisp contours, balanced compositions, smooth finish, and subjects drawn from ancient history and myth, often chosen to teach duty and sacrifice. Jacques-Louis David's Oath of the Horatii (1784) shows three brothers swearing to fight for Rome in a stark, stage-like space; it was read as an appeal to civic virtue before the French Revolution of 1789. His Death of Marat (1793) became an image of revolutionary martyrdom. David later served Napoleon. Jean-Auguste-Dominique Ingres carried a refined linear classicism into the nineteenth century. In sculpture Antonio Canova made polished marble figures, and in architecture the Pantheon in Paris and the Virginia State Capitol, designed with Thomas Jefferson's involvement, echo ancient temples.

Neoclassicism was flexible politically: republics used it to claim ancient liberty, and Napoleon's empire used it to claim Roman grandeur. When you look, ask what moral or political message the classical story is being used to send.`,
    q: [
      ['tf', 1, 'Neoclassicism took inspiration from ancient Greece and Rome.', 0, 'Neo means new.', 'It revived classical forms and subjects.'],
      ['mc', 1, 'Which painter made The Oath of the Horatii?', ['Jacques-Louis David', 'Antoine Watteau of Paris', 'J. M. W. Turner of London', 'Claude Monet of Giverny'], 'Painted in 1784.', 'David painted it.'],
      ['mc', 2, 'Which discoveries encouraged interest in antiquity in the eighteenth century?', ['Excavations at Herculaneum and Pompeii', 'The invention of the camera and early photography', 'The discovery of Lascaux', 'The opening of Japan'], 'Buried by Vesuvius.', 'Digs at the buried Roman towns began in 1738 and 1748.'],
      ['tf', 2, 'Neoclassicism was used only by revolutionaries and never by an emperor.', 1, 'Napoleon.', 'Napoleon\'s empire also used classical imagery.'],
      ['mc', 3, 'Why is the Oath of the Horatii often described as a moral statement?', ['It shows duty to the state placed above personal feeling', 'It shows a peaceful picnic', 'It focuses on pastel colours and playful scenes of leisure at court', 'It was painted outdoors'], 'The brothers swear an oath.', 'The scene praises civic duty and sacrifice.'],
    ],
  },
  // ---------- Track 6: The nineteenth century ----------
  {
    t: 'Romanticism: Feeling, Nature and the Sublime',
    b: 'From the late eighteenth to the mid nineteenth century, artists answered reason and industry with emotion and wild nature.',
    m: 8,
    body: `Romanticism was a broad cultural movement, in literature, music and painting, from about 1790 to the mid-1800s. It responded to the Enlightenment's stress on reason and to the early Industrial Revolution, by valuing emotion, imagination, individual genius and nature. It is not one style; a Romantic painter might be solemn, patriotic, violent or dreamy.

A central idea was the sublime: the mix of awe and fear felt before vast or overwhelming nature. Caspar David Friedrich's Wanderer above the Sea of Fog (about 1818) shows a lone figure seen from behind, gazing at mist-covered peaks, so the viewer shares the contemplation. J. M. W. Turner's The Fighting Temeraire (1839) turns the towing of an old warship by a steam tug into a glowing meditation on change. John Constable's The Hay Wain (1821) offers a loving view of the English countryside.

Romantic painters also took dramatic modern events as subjects. Theodore Gericault's Raft of the Medusa (1818-19) depicts survivors of a real French shipwreck of 1816, a scandal blamed on official incompetence. Eugene Delacroix's Liberty Leading the People (1830) commemorates the July Revolution with bold colour and movement. Francisco Goya's Third of May 1808, painted in 1814, shows the execution of Spanish civilians by French troops, and is a landmark of anti-war art, though Goya is often seen as standing between movements.

Romantic artists argued with Neoclassicism: colour and emotion against line and order. Nationalism and interest in folklore also grew in this era.`,
    q: [
      ['tf', 1, 'Romanticism valued emotion, imagination and nature.', 0, 'A reply to reason and industry.', 'Those values define the movement.'],
      ['mc', 1, 'What does "the sublime" mean in Romantic thought?', ['Awe mixed with fear before vast or powerful nature', 'A tidy classical order of balanced, restrained forms', 'A pastel party scene', 'A flat gold background'], 'Think of enormous mountains and storms.', 'The sublime is the thrilling terror of overwhelming nature.'],
      ['mc', 2, 'Which painting was based on a real 1816 shipwreck?', ['The Raft of the Medusa', 'The Hay Wain by Constable', 'The Swing, painted by Fragonard', 'The School of Athens fresco'], 'A French scandal.', 'Gericault depicted survivors of the Medusa wreck.'],
      ['tf', 2, 'Romanticism was a single uniform style.', 1, 'Compare Friedrich with Delacroix.', 'Artists used many different approaches under the same broad movement.'],
      ['mc', 3, 'How did Romantic painters differ from Neoclassical painters?', ['They stressed colour and emotion over restrained line and order', 'They avoided colour entirely and painted only in grey on dark panels', 'They only painted ancient myths', 'They refused to paint nature'], 'The two were rivals.', 'The contrast of emotion and order was a debate of the time.'],
    ],
  },
  {
    t: 'The Academy and the Salon: The Establishment',
    b: 'Official academies set the rules of training, exhibition and status that later movements challenged.',
    m: 7,
    body: `To understand why Realism and Impressionism seemed daring, you need the system they pushed against. In France, the Royal Academy of Painting and Sculpture was founded in 1648. It trained artists, set standards and organised exhibitions. In the nineteenth century its heir was the Ecole des Beaux-Arts and the annual Paris Salon, a huge juried exhibition. Acceptance meant sales, prizes and state commissions, and rejection could mean ruin. A student might also compete for the Prix de Rome, a scholarship to study in Italy.

The Academy ranked subjects in a hierarchy of genres. At the top stood history painting (biblical, mythological and historical scenes), then portraits, then genre scenes of daily life, landscape, and last still life. Training began with copying prints and plaster casts, then drawing from the live model, and ended with large compositions with a smooth, polished finish where brushwork was hidden.

Successful academic painters included William-Adolphe Bouguereau and Alexandre Cabanel, whose Birth of Venus (1863) was bought by Napoleon III. Their work can show real technical mastery. For much of the twentieth century critics dismissed it as slick and conservative; more recently historians have reassessed it and also noted how the system limited women, who were for a long time excluded from life classes and the Ecole.

In 1863 the Salon jury rejected so many works that the emperor allowed a Salon des Refuses ("Salon of the Rejected"). It was a turning point: the public could see the rejected works for itself.`,
    q: [
      ['tf', 1, 'In the Academy hierarchy, history painting ranked above still life.', 0, 'Look at the order in the lesson.', 'History painting was considered the highest genre, still life the lowest.'],
      ['mc', 1, 'What was the Salon?', ['A large official juried exhibition in Paris', 'A kind of woodblock print made in Edo for the public', 'A type of column', 'A Roman villa'], 'Jury acceptance mattered for careers.', 'The Salon was the key public art event and career gateway.'],
      ['mc', 2, 'What happened in 1863?', ['The Salon des Refuses displayed works the jury rejected', 'The Academy was founded by the king to train painters in Paris', 'The Prix de Rome ended', 'Impressionism ended'], 'The title means rejected.', 'The emperor allowed a separate exhibition for rejected works.'],
      ['tf', 2, 'Academic training began with large original compositions before any drawing practice.', 1, 'Think of plaster casts.', 'Students started by copying and drawing from casts and models.'],
      ['mc', 3, 'Why have historians reassessed academic art in recent decades?', ['They find real skill in it and study how the system worked, including its exclusions', 'They found that academic painters had never studied anatomy or drawn from live models at all', 'They decided all art before 1800 is forged', 'They found it contained no figures'], 'Neither all good nor all bad.', 'Recent scholarship is more balanced about both quality and institutional limits.'],
    ],
  },
  {
    t: 'Realism: The Ordinary Made Monumental',
    b: 'Mid-nineteenth-century painters depicted contemporary working life at a scale once reserved for history.',
    m: 8,
    body: `Realism emerged in France around the revolution of 1848. Its painters rejected idealised or historical subjects and chose to paint what they saw of their own time: labourers, peasants, ordinary towns. The movement was also political, because it gave dignity and visibility to people the Academy usually ignored.

Gustave Courbet was the movement's chief spokesman. His Stone Breakers (1849) shows two labourers working on a road, painted at near life size, a scale reserved for history painting. (The painting was destroyed in 1945 during the Second World War.) A Burial at Ornans (1849-50) gave a village funeral a vast canvas. When his works were refused at the 1855 Exposition Universelle in Paris, Courbet organised his own "Pavilion of Realism" nearby. Jean-Francois Millet's The Gleaners (1857) shows poor women gathering leftover grain after a harvest. Rosa Bonheur's The Horse Fair (1852-55) drew on close study of animals and was praised for its energy. Honore Daumier made sharp satirical lithographs of politics and city life.

Realism has links with novels by writers such as Gustave Flaubert and with the rise of photography, whose first processes were announced in 1839 and which changed ideas of what pictures were for.

Realism is not photographic copying; artists still chose, framed and sometimes criticised. Ask what is being shown and who is rarely shown.`,
    q: [
      ['tf', 1, 'Realist painters often chose everyday subjects such as workers and peasants.', 0, 'Not gods or kings.', 'Contemporary working life was a central subject.'],
      ['mc', 1, 'Who organised a "Pavilion of Realism" in 1855?', ['Gustave Courbet', 'Claude Monet', 'Jacques-Louis David', 'Antoine Watteau'], 'He was refused at the Exposition.', 'Courbet showed his works in his own pavilion.'],
      ['mc', 2, 'What was unusual about the scale of Courbet\'s Stone Breakers?', ['It showed ordinary labourers at near life size, like a history painting', 'It was tiny', 'It was a mosaic', 'It had no figures'], 'Think of the Academy\'s hierarchy.', 'Large scale was normally reserved for history subjects.'],
      ['tf', 2, 'Realism is simply the same as a photograph.', 1, 'Artists still choose and frame.', 'Realist works are selected and composed, and often carry social comment.'],
      ['mc', 3, 'Why was Realism seen as political?', ['It gave visibility to workers and the poor whom official art usually ignored', 'It praised monarchs', 'It avoided people entirely', 'It copied Greek temples closely and praised the monarchs who paid for the work'], 'Think about who was shown.', 'Choosing labourers as monumental subjects challenged hierarchies of status.'],
    ],
  },
  {
    t: 'The Pre-Raphaelites: Truth to Nature and Medieval Dreams',
    b: 'A group of young British painters in 1848 rejected academic convention for bright detail and literary subjects.',
    m: 7,
    body: `In 1848 in London, a small group of young artists founded the Pre-Raphaelite Brotherhood: Dante Gabriel Rossetti, John Everett Millais and William Holman Hunt, with four others. The name expresses their aim to return to the sincerity of art before Raphael, whom they felt the Royal Academy had turned into a formula. They called for "truth to nature".

They painted with intense colour, sharp detail and often on a bright white ground that made colours glow. Many works draw on the Bible, Shakespeare, Arthurian legend and poetry. Millais's Ophelia (1851-52) shows the drowning character from Hamlet floating in a stream painted in painstaking detail from a river bank in Surrey; the model, Elizabeth Siddal, reportedly lay in a bath for sessions, though accounts vary. Holman Hunt's The Light of the World (about 1851-53) shows Christ knocking at a door. Millais's Christ in the House of His Parents (1850) was attacked by critics, including Charles Dickens, for its unidealised realism.

The critic John Ruskin defended the group. Later figures such as Edward Burne-Jones carried the style toward symbolic, dreamlike art, and William Morris's Arts and Crafts movement shared its love of medieval craft.

The Brotherhood's own dynamic was limited: women appear mostly as models and muses, though artists such as Siddal and Evelyn De Morgan were also painters and poets. A modern viewer can both admire the craft and question its picture of women.`,
    q: [
      ['tf', 1, 'The Pre-Raphaelite Brotherhood was founded in London in 1848.', 0, 'Midcentury.', 'It formed in 1848.'],
      ['mc', 1, 'What did the Pre-Raphaelites call for?', ['Truth to nature', 'Faster brushwork', 'Gold backgrounds', 'Abstract shapes'], 'Closely observed detail.', 'They stressed careful observation and sincerity.'],
      ['mc', 2, 'Which painting shows Ophelia in a stream?', ['Millais\'s Ophelia', 'Hunt\'s The Light of the World', 'Courbet\'s Stone Breakers', 'Turner\'s Fighting Temeraire'], 'A character from Hamlet.', 'Millais painted it in 1851-52.'],
      ['tf', 2, 'The Pre-Raphaelites based their aims on the style of Raphael himself.', 1, 'The name says "pre".', 'They wanted to go back to art before Raphael\'s influence.'],
      ['mc', 3, 'Which critic defended the Pre-Raphaelites?', ['John Ruskin', 'Charles Dickens', 'Denis Diderot', 'Johann Winckelmann'], 'He also wrote on art and architecture.', 'Ruskin supported the group publicly.'],
    ],
  },
  {
    t: 'Impressionism: Light, Moment and Modern Life',
    b: 'In 1874, a group of Paris painters exhibited outside the Salon and changed how pictures capture the fleeting moment.',
    m: 8,
    body: `Impressionism began in France in the 1860s and 1870s. Its painters, including Claude Monet, Pierre-Auguste Renoir, Camille Pissarro, Alfred Sisley, Berthe Morisot, Edgar Degas, Mary Cassatt and Gustave Caillebotte, were frustrated by the Salon's tastes and organised their own exhibitions. The first, in 1874 in a photographer's studio in Paris, led the critic Louis Leroy to mock Monet's Impression, Sunrise (1872) and call the artists "Impressionists". The group adopted the name. They held eight exhibitions between 1874 and 1886.

What did they do differently? They painted modern life: boulevards, cafes, railway stations, boating parties, leisure and the changing city of Paris. Many worked en plein air (outdoors), helped by portable paint in metal tubes, which had been invented by 1841. They tried to capture changing light and atmosphere rather than a finished, idealised scene, using small visible strokes, broken colour placed side by side, and shadows tinted with colour rather than black. Compositions were often cropped like snapshots, perhaps influenced by photography and Japanese prints.

The group was not uniform. Degas worked mostly in the studio and drew dancers; Morisot and Cassatt, who had fewer opportunities for public life, often painted domestic and intimate scenes with great skill.

To look at an Impressionist painting, step back: the strokes blend into shimmering light. Then step close and see how a few touches build the effect.`,
    q: [
      ['tf', 1, 'The name "Impressionism" began as a mocking remark by a critic.', 0, 'Monet\'s Impression, Sunrise.', 'Louis Leroy used the word mockingly in 1874; the group adopted it.'],
      ['mc', 1, 'What does en plein air mean?', ['Painting outdoors', 'Painting in a cathedral', 'Painting in gold leaf', 'Painting on walls'], 'The French phrase means open air.', 'Many Impressionists painted directly outdoors.'],
      ['mc', 2, 'How many group exhibitions did the Impressionists hold between 1874 and 1886?', ['Eight', 'Two in total', 'Twenty', 'One in total'], 'Not many, not few.', 'There were eight exhibitions in those years.'],
      ['tf', 2, 'All Impressionists painted exclusively outdoors.', 1, 'Think of Degas.', 'Some, such as Degas, worked mostly in the studio.'],
      ['mc', 3, 'Which brush technique is typical of Impressionism?', ['Small visible strokes of broken colour side by side', 'Invisible, perfectly smooth finish', 'Gold leaf backgrounds', 'Hard outlines drawn in black ink around every figure and object'], 'Think of shimmering.', 'Visible strokes and juxtaposed colour suggest changing light.'],
    ],
  },
  {
    t: 'Japonisme: When Japanese Prints Reached Europe',
    b: 'After Japan reopened to trade, European artists borrowed bold composition and flat colour from prints and objects.',
    m: 7,
    body: `For over two centuries Japan limited trade with the outside world. After American ships under Commodore Matthew Perry arrived in 1853-54, and further treaties in 1858 opened ports, Japanese goods flowed to Europe and North America. Japan also took part in world's fairs, such as the Paris Exposition of 1867. The French critic Philippe Burty coined the term "Japonisme" in 1872 for the resulting craze for Japanese art and design.

Western artists collected Japanese woodblock prints (ukiyo-e), ceramics, textiles and fans. Prints by Hokusai and Hiroshige offered ideas that contrasted with the academic tradition: flat areas of colour, strong outlines, tilted viewpoints, bold cropping and asymmetrical compositions. You can see this in Monet's La Japonaise (1876), in James McNeill Whistler's Caprice in Purple and Gold: The Golden Screen (1864) and in Mary Cassatt's colour prints of the early 1890s, which she made after seeing a large Japanese print exhibition in Paris in 1890. Vincent van Gogh copied Hiroshige's prints in oils in 1887. Japonisme also influenced decorative design and Art Nouveau.

The exchange ran in both directions. Japan's Meiji government (from 1868) adopted Western technology and sometimes Western art training while promoting Japanese crafts abroad.

A critical eye is needed. Some works treat Japan as an exotic costume or fantasy, a habit related to what scholars call Orientalism. Compare what Europeans imagined with what Japanese artists actually made.`,
    q: [
      ['tf', 1, 'Philippe Burty coined the term "Japonisme" in 1872.', 0, 'A French critic.', 'The term named the European fashion for Japanese art.'],
      ['mc', 1, 'Which feature did European artists borrow from Japanese prints?', ['Flat colour, strong outlines and bold cropping', 'Gold mosaic backgrounds', 'Stained glass', 'Elaborate Baroque diagonals with strong theatrical lighting'], 'Think of ukiyo-e design.', 'These design ideas contrasted with academic habits.'],
      ['mc', 2, 'Which painter copied Hiroshige prints in oils in 1887?', ['Vincent van Gogh', 'Gustave Courbet of Ornans', 'Antonio Canova of Venice', 'J. M. W. Turner of London'], 'He was later a Post-Impressionist.', 'Van Gogh made oil copies of Hiroshige prints.'],
      ['tf', 2, 'The artistic exchange between Japan and the West was one-way only.', 1, 'Consider the Meiji government.', 'Japan also took up Western technology and ideas while sending its crafts abroad.'],
      ['mc', 3, 'Why should viewers be cautious about some Japonisme works?', ['They may show an imagined, exotic Japan rather than real Japanese life', 'They are exact copies of Japanese prints made by Japanese artists in Paris', 'They never use colour', 'They were made before 1800'], 'Think of Orientalism.', 'Some European images reflect stereotypes more than reality.'],
    ],
  },
];

const SPANS: Array<[number, number, string, string, 'FOUNDATION' | 'INTERMEDIATE' | 'ADVANCED', string]> = [
  [0, 5, 't1', 'Ancient Worlds: Prehistory to Rome', 'FOUNDATION', 'From the first cave images to Egypt, Mesopotamia, Greece and Rome, and how to read art that has no signatures.'],
  [5, 9, 't2', 'Byzantium, Islam and Medieval Europe', 'FOUNDATION', 'Gold mosaics, calligraphy and pattern, and the stone churches of Romanesque and Gothic Europe.'],
  [9, 13, 't3', 'Asian, African and Indigenous American Traditions', 'INTERMEDIATE', 'Song landscape, Japanese prints and overviews of African and Indigenous American arts, handled with care.'],
  [13, 18, 't4', 'The Renaissance', 'INTERMEDIATE', 'Florence, Rome and Venice, the Northern Renaissance and the strange elegance of Mannerism.'],
  [18, 22, 't5', 'Baroque to Neoclassicism', 'INTERMEDIATE', 'Drama, markets and courts, then a return to reason and the classical past.'],
  [22, 28, 't6', 'The Nineteenth Century: Romanticism to Japonisme', 'ADVANCED', 'The academy and those who challenged it: Romantics, Realists, Pre-Raphaelites and Impressionists.'],
];

const lid = (i: number) => `${ID}.l${String(i + 1).padStart(2, '0')}`;

const questions: Question[] = [];
LESSONS.forEach((les, i) => {
  const l = lid(i);
  les.q.forEach((q, j) => {
    questions.push(q[0] === 'tf' ? tf(l, j + 1, q[1], q[2], q[3], q[4], q[5]) : mc(l, j + 1, q[1], q[2], q[3], q[4], q[5]));
  });
});

export const COURSE_MODULE: CourseModule = {
  curriculum: {
    id: ID,
    label: 'Art Movements I: Ancient to Impressionism',
    blurb: 'A guided tour of art from the first cave images through Greece, Rome, Byzantium, Islamic art, the medieval cathedral, the Renaissance, the Baroque, and on to Realism and Impressionism. Learn what each movement looked like, why it happened, and how to look.',
    accent: '#C9871F',
    framework: 'ncas',
    tracks: SPANS.map(([a, b, tid, title, level, blurb]) => ({
      id: `${ID}.${tid}`,
      title,
      blurb,
      level,
      lessons: LESSONS.slice(a, b).map((les, k) => ({ id: lid(a + k), title: les.t, blurb: les.b, minutes: les.m, body: les.body })),
    })),
  },
  bank: { curriculumId: ID, questions },
};
