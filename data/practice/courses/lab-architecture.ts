import type { CourseModule } from '../courseModule';
import type { Question } from '../types';

const CID = 'lab-architecture';
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
    label: 'Architecture',
    blurb: 'Read the built world: from the pyramids of Egypt to parametric curves, learn how styles, structures and architects shaped the way we build.',
    accent: '#B08968',
    framework: 'c3',
    tracks: [
      {
        id: `${CID}.t1`,
        title: 'Ancient & Classical Foundations',
        blurb: 'Mass, columns and the first great structural ideas of Egypt, Greece and Rome.',
        level: 'FOUNDATION',
        lessons: [
          {
            id: lid(1),
            title: 'Egypt: Stone, Mass and Imhotep',
            blurb: 'How Egyptian builders turned dressed stone into monuments meant to last forever.',
            minutes: 6,
            body: `Ancient Egyptian architecture (c. 3000-300 BC) grew along the Nile and expressed permanence and the divine order of the pharaonic state. Its builders worked in precisely dressed stone blocks, a technique called ashlar masonry, and relied on post-and-lintel construction: vertical supports carrying horizontal beams.

The first architect we know by name is Imhotep, who served in the Old Kingdom around 2650-2600 BC. He is credited with the Step Pyramid of Djoser at Saqqara, which stacked flat-topped mastaba tombs into a rising stepped mass and used stone engaged columns, a bold early move into permanent stone.

When you look at Egyptian buildings, watch for the signature features. Walls are battered, meaning they slope inward as they rise, which gives a feeling of stability. Temples such as Karnak use hypostyle halls, crowded forests of columns holding up a flat stone roof. Gateways are monumental pylons. Pyramids, like the Great Pyramid of Giza, show how much organised labour and large-scale surveying the culture could command.

Because stone beams can only span short distances, Egyptian interiors are dense with supports. The architecture is about mass and ritual procession rather than open space.`,
          },
          {
            id: lid(2),
            title: 'Greece: Orders and the Parthenon',
            blurb: 'The column-and-lintel temple canon and the optical refinements of the Parthenon.',
            minutes: 7,
            body: `Classical Greek architecture (c. 900-100 BC) defined Western ideas of proportion for two thousand years. Its core is the temple: a ring of columns (a peristyle) carrying an entablature and a triangular pediment, all built in marble post-and-lintel.

Greek builders codified three orders. The Doric is sturdy and plain, the Ionic is slimmer with scroll-shaped volutes, and the Corinthian is the most ornate, topped with acanthus leaves. Proportions were modular: the dimensions of one part determined the next.

The Parthenon in Athens is the high point. It was designed by the architects Ictinus and Callicrates in the 5th century BC. Ictinus also designed the Temple of Apollo Epicurius at Bassae, and Callicrates built the Temple of Athena Nike on the Acropolis. The Parthenon uses optical corrections: columns swell slightly (entasis) and the base curves upward in the middle, so that the building looks perfectly straight to the human eye instead of sagging.

Look for the peristyle, the orders, the pediment and these subtle refinements. Greek temples were designed to be viewed from outside, as sculpture in the landscape, not entered as large interior halls.`,
          },
          {
            id: lid(3),
            title: 'Rome: Arch, Concrete and Vitruvius',
            blurb: 'How concrete, the arch and the dome let Rome span huge interiors.',
            minutes: 7,
            body: `Roman architecture (c. 300 BC-400 AD) took Greek forms and added engineering. The true semicircular arch, the barrel and groin vault, the dome and above all Roman concrete (opus caementicium) let builders cover enormous interior spaces and carry water across valleys. Landmarks include the Pantheon, the Colosseum, basilicas and aqueducts such as the Pont du Gard.

Two figures show the empire's range. Vitruvius (c. 80-15 BC) wrote De architectura, the Ten Books on Architecture. It declared that good building must have firmitas, utilitas and venustas: strength, usefulness and beauty. Apollodorus of Damascus (c. 50-130 AD) was Emperor Trajan's master builder, responsible for Trajan's Forum and Column, the Baths of Trajan and a long timber-arch bridge over the Danube.

Look for repeated arches in stacked arcades, thick concrete vaults and domes, and the practical urban infrastructure of roads, baths and bridges. Where Greece perfected the exterior of the temple, Rome engineered the interior: the large, enclosed, light-filled hall.`,
          },
        ],
      },
      {
        id: `${CID}.t2`,
        title: 'Medieval to Baroque',
        blurb: 'Domes, pointed arches and the humanist rebirth of classical order.',
        level: 'INTERMEDIATE',
        lessons: [
          {
            id: lid(4),
            title: 'Byzantine: Domes on Pendentives',
            blurb: 'How Hagia Sophia floated a great dome over a square plan.',
            minutes: 6,
            body: `Byzantine architecture (c. 330-1450 AD) developed in the Eastern Mediterranean, centred on Constantinople. Its great invention is the pendentive: a curved triangular piece of masonry that lets a round dome rest on a square plan by carrying the load down to four corner piers.

The masterpiece is the Hagia Sophia, designed by Anthemius of Tralles (c. 474-c. 558 AD), a mathematician as well as an architect, together with Isidore of Miletus. Anthemius applied geometry to raise a vast central dome supported by semi-domes and heavy buttressing, so the interior opens into one continuous, glowing space.

Typical Byzantine hallmarks are the central plan, massive brick masonry and interiors covered in gold mosaics. Because the heavy structure is brick, the exterior can look plain, while the inside glitters; windows ring the base of the dome so that it seems to float.

When you meet a dome that sits on a square base through curved triangular corners, you are looking at a pendentive and a Byzantine idea that later shaped churches and mosques across Europe and Asia.`,
          },
          {
            id: lid(5),
            title: 'Romanesque to Gothic',
            blurb: 'From fortress-like walls to soaring stone and glass.',
            minutes: 7,
            body: `Romanesque architecture (c. 1000-1150 AD) is the heavy style of western Europe: rounded arches, thick walls with small windows, sturdy piers and barrel or groin vaults. The weight of the roof was carried by the walls themselves, so openings had to stay small.

Around 1140 the Gothic (c. 1140-1500) transformed this. Its three key devices are the pointed arch, the ribbed vault and the flying buttress. The ribs gather the roof's weight into narrow lines, and the flying buttresses, arches outside the wall, push back against the outward thrust. Freed from carrying load, walls dissolve into stained-glass windows and the building rises to great height. Chartres Cathedral and Notre-Dame de Paris are classic examples; Durham Cathedral shows the Romanesque mass that came before.

We know how masons thought thanks to Villard de Honnecourt, a 13th-century master mason whose portfolio of sketches records Gothic geometry, rib-vault layouts and mechanical devices.

To tell the two apart, look at the arch: rounded and heavy means Romanesque; pointed, with visible ribs and exterior buttresses and large glass, means Gothic.`,
          },
          {
            id: lid(6),
            title: 'Renaissance: Dome, Treatise, Villa',
            blurb: 'Brunelleschi, Alberti and Palladio revive classical order.',
            minutes: 8,
            body: `The Renaissance (c. 1400-1600) began in Italy as a humanist rebirth of Greek and Roman architecture: revived classical orders, symmetry, harmonic proportion and central-plan churches.

Filippo Brunelleschi (1377-1446) built the dome of Florence Cathedral, a herringbone brick dome constructed without wooden centering, supported by machines he designed for hoisting. He is also linked with the discovery of linear perspective, and designed the Ospedale degli Innocenti and the Basilica of San Lorenzo.

Leon Battista Alberti (1404-1472) was the humanist theorist who wrote De re aedificatoria, and applied triumphal-arch ideas to facades such as Santa Maria Novella and Sant'Andrea in Mantua. Andrea Palladio (1508-1580) designed symmetrical villas with temple-front porticoes, including the Villa Rotonda, and published I quattro libri dell'architettura, which spread his rules across Europe.

Notice how the Renaissance made architecture a learned discipline: buildings are planned from ratios, and treatises carried the ideas to later generations. Look for calm symmetry, columns and pediments, and domes sitting on clear geometric plans.`,
          },
          {
            id: lid(7),
            title: 'Baroque, Wren and Neoclassicism',
            blurb: 'Drama and curves, then a sober return to classical purity.',
            minutes: 7,
            body: `Baroque architecture (c. 1600-1750) turned the classical vocabulary into theatre: dynamic curved forms, dramatic contrasts of light and shadow, rich ornament and grand staircases and ceilings that seem to open to the sky. It served the church and monarchy, as in the Palace of Versailles with its grand axial planning.

In England, Sir Christopher Wren (1632-1723) was both a scientist and an architect. After the Great Fire of London he led rebuilding, and his masterpiece is St Paul's Cathedral, whose dome has a triple-shell structure: an inner dome, a hidden brick cone and an outer lead-covered shell. He also designed the Royal Naval College at Greenwich and the Sheldonian Theatre in Oxford.

Neoclassicism (c. 1750-1850) reacted against Baroque excess with a restrained classical vocabulary of porticoes, domes and symmetry. The Panthéon in Paris and the US Capitol show this civic monumentality in the age of the Enlightenment.

Quick test: swirling curves and drama suggest Baroque; calm columns, flat pediments and clarity suggest Neoclassical.`,
          },
        ],
      },
      {
        id: `${CID}.t3`,
        title: 'Industry and the Modern Movement',
        blurb: 'Iron, steel and concrete change what buildings can be.',
        level: 'INTERMEDIATE',
        lessons: [
          {
            id: lid(8),
            title: 'Iron, Steel and the Skyscraper',
            blurb: 'The Industrial Revolution makes tall, open buildings possible.',
            minutes: 6,
            body: `Between about 1850 and 1900, factories mass-produced cast iron, wrought iron and plate glass, and architects used them to build things earlier eras could not. The Crystal Palace was a vast exhibition hall of iron and glass; the Eiffel Tower showed iron's reach; the Bibliothèque Sainte-Geneviève used slender iron supports in a library.

The key ingredients of the tall building were the steel frame, the safety elevator and early reinforced concrete. Chicago became the testing ground. The Home Insurance Building there is often named among the first skyscrapers, because its loads were carried by a metal frame, not thick masonry walls.

Louis Sullivan (1856-1924), a leader of the Chicago School, gave the new building type an artistic language. His slogan, form follows function, argued that a building's outer expression should reflect its purpose. His Wainwright Building, Guaranty Building and Carson, Pirie, Scott Store show a tripartite composition (base, shaft, crown) with organic ornament.

What to look for: large windows, vertical emphasis, a visible grid that shows the frame beneath, and ornament that grows like plants.`,
          },
          {
            id: lid(9),
            title: 'Art Nouveau and Gaudi',
            blurb: 'Whiplash curves and nature-inspired structure in Barcelona.',
            minutes: 6,
            body: `Art Nouveau (c. 1890-1910) was a European style of sinuous, organic curves, plant-derived ornament and iron and glass. Its ideal was total design: building, furniture and fittings treated as one flowing work of art, a Gesamtkunstwerk.

Its most original architect was Antoni Gaudi (1852-1926), working in Catalan Modernisme in Barcelona. His works include the Sagrada Familia, Casa Batllo, Park Guell and Casa Mila (La Pedrera). Gaudi drew geometry from nature: he used ruled-surface forms and, for structure, catenary or hanging-chain models, in which weighted strings hung upside down produce the ideal shape for arches, since a chain in tension forms a curve that becomes pure compression when flipped.

He also covered surfaces in trencadis, a mosaic made from broken ceramic pieces. The result looks like a living organism, with no straight line repeated mechanically.

Look for: whiplash lines, bone-like columns, mosaic surfaces, balconies like seaweed, and an overall feeling that the building has grown instead of being assembled.`,
          },
          {
            id: lid(10),
            title: 'Bauhaus and the International Style',
            blurb: 'Gropius and Mies strip away ornament for glass, steel and clarity.',
            minutes: 7,
            body: `The Bauhaus (c. 1919-1933) was a German school founded by Walter Gropius (1883-1969) that fused art, craft and industrial technology into a functionalist design language: geometric form, industrial materials and rational modularity. Gropius designed the Fagus Factory and the Bauhaus building at Dessau, both showing a glass curtain wall, an outer skin of glass hung on a structural frame, free of load-bearing duty.

Modernism, or the International Style (c. 1920-1970), spread these ideas worldwide: open plans, glass skins and the rejection of ornament.

Ludwig Mies van der Rohe (1886-1969) turned them into minimalism. His phrase less is more became famous, and he is also associated with the saying that God is in the details. His Barcelona Pavilion, Farnsworth House, Seagram Building and Crown Hall at IIT show steel-and-glass boxes with universal, flexible space and clear structural expression.

Spot the style by looking for flat roofs, a regular grid of glass and steel, almost no decoration, and spaces that flow instead of being divided into small rooms.`,
          },
          {
            id: lid(11),
            title: 'Le Corbusier and Wright',
            blurb: 'Two modernist masters with opposite attitudes to machine and landscape.',
            minutes: 8,
            body: `Le Corbusier (1887-1965), Swiss-French architect and theorist, called a house a machine for living in. His Five Points of Architecture are pilotis (columns lifting the building off the ground), the free plan, the free facade, ribbon windows and the roof garden. Villa Savoye is the clearest demonstration. He also devised the Modulor proportion system, and designed the Unite d'Habitation in Marseille, Notre-Dame du Haut at Ronchamp and the Chandigarh Capitol. His raw concrete is called beton brut.

Frank Lloyd Wright (1867-1959) took a different route: organic architecture, where the building grows from its site. His Prairie houses, such as Robie House, stress horizontal lines and open flowing interiors. Fallingwater uses cantilevered reinforced-concrete terraces projecting over a waterfall, and the Guggenheim Museum in New York spirals around a central rotunda. Taliesin was his own home and school.

Compare them: Le Corbusier often lifts a pure box above the landscape, using reinforced concrete as a frame; Wright anchors horizontal forms to the ground and stone chimneys, using concrete to let spaces reach into nature.`,
          },
        ],
      },
      {
        id: `${CID}.t4`,
        title: 'Late Modern to Contemporary',
        blurb: 'Raw concrete, irony, fragmentation, code and the structural basics behind it all.',
        level: 'ADVANCED',
        lessons: [
          {
            id: lid(12),
            title: 'Brutalism and Louis Kahn',
            blurb: 'Raw concrete, monumental forms and architecture built around light.',
            minutes: 7,
            body: `Brutalism (c. 1950-1980) is architecture of raw, board-marked concrete, called beton brut after Le Corbusier's usage, in massive sculptural forms that wear their structure openly. It was often used for monumental civic buildings, such as housing blocks, universities and government centres.

Louis Kahn (1901-1974), an American working in the Late Modern period, is often admired for giving heavy materials a spiritual quality. His main buildings include the Salk Institute, the Kimbell Art Museum with its cycloid concrete shell vaults, the National Assembly Building of Bangladesh and the Yale Center for British Art.

One of Kahn's central ideas was served and servant spaces. Rooms for people (served spaces) are clearly separated from the stairs, ducts and utility rooms that support them (servant spaces), so the plan is legible. He was also devoted to monumental daylighting, shaping apertures to bring natural light into the heart of a room.

Look for: exposed concrete with the grain of the formwork, deep openings, massive geometric volumes and a structure you can read from the outside.`,
          },
          {
            id: lid(13),
            title: 'Postmodern, Deconstructivist, Parametric',
            blurb: 'From irony and ornament to fragmentation and algorithmic curves.',
            minutes: 8,
            body: `Postmodern architecture (c. 1970-1990) revolted against modernist austerity. It restored ornament, colour, symbolism and historical quotation, often with irony, in the spirit of Robert Venturi's call for complexity and contradiction.

Deconstructivism (c. 1980 onward) went further, using fragmented, non-rectilinear forms and distorted geometry that seem unstable. Frank Gehry (born 1929) is a leading figure. His Guggenheim Museum Bilbao, Walt Disney Concert Hall and the Dancing House in Prague wrap tilted, colliding forms in titanium or steel, and his office used CATIA software, borrowed from aerospace, to model and build them.

Parametric or contemporary design (c. 2000 onward) uses algorithms to generate continuous fluid surfaces optimised for performance and built with digital fabrication. Zaha Hadid (1950-2016), the Iraqi-British architect often called the queen of the curve, is a key name: the Heydar Aliyev Center, MAXXI in Rome and the London Aquatics Centre sweep like landscapes.

To tell them apart, ask how the form was made: quoting history (postmodern), colliding fragments (deconstructivist) or flowing from a computed system (parametric).`,
          },
          {
            id: lid(14),
            title: 'How Structures Carry Load',
            blurb: 'The basic equations of beams, supports and cantilevers.',
            minutes: 9,
            body: `Every building, from a Greek temple to a Zaha Hadid curve, must obey statics. A structure is in equilibrium when the sum of forces in each direction is zero and the sum of moments about any point is zero. Those two rules let engineers solve for the reactions at supports.

For a simply supported beam of span L carrying a uniformly distributed load w, each support carries half the total load: R = wL/2. The maximum bending moment occurs at midspan and equals wL squared over 8. With a single point load P at the centre, the maximum moment is PL/4.

A cantilever is fixed at one end and free at the other, like Wright's terraces at Fallingwater. With a point load P on its tip, the maximum moment is PL, found at the fixed support, which is why cantilevers need strong anchorage.

Bending stress follows the flexure formula: stress = Mc/I, which equals M/S, where I is the second moment of area and S the section modulus. Deflection grows quickly with span: for a uniform load it depends on L to the fourth power. Doubling a span makes the moment four times larger and the deflection sixteen times larger.`,
          },
        ],
      },
    ],
  },
  bank: {
    curriculumId: CID,
    questions: [
      // L1 Egypt
      mc(1, 1, 1, `Who is the first architect known by name?`, [`Ictinus of Athens`, `Vitruvius Pollio`, `Imhotep`, `Callicrates of Athens`], 2, `He worked in Old Kingdom Egypt.`, `Imhotep, active around 2650-2600 BC, is the first architect known by name.`),
      mc(1, 2, 1, `Which building is associated with Imhotep?`, [`Step Pyramid of Djoser at Saqqara`, `The Parthenon on the Athenian Acropolis`, `Hagia Sophia`, `Pantheon in Rome`], 0, `Think of a pyramid built in tiers.`, `Imhotep is credited with the Step Pyramid of Djoser at Saqqara.`),
      mc(1, 3, 2, `A temple has a hall packed with columns beneath a flat stone roof and a gateway with sloping walls. Which style is this?`, [`Romanesque`, `Ancient Egyptian`, `Gothic`, `Byzantine`], 1, `Hypostyle halls and battered walls are clues.`, `Hypostyle halls, pylons and battered walls are hallmarks of ancient Egyptian architecture.`),
      mc(1, 4, 3, `Why are Egyptian hypostyle halls filled with so many closely spaced columns?`, [`Arches were forbidden by religion`, `Columns were cheaper than walls`, `Stone beams span only short distances, so many supports were needed`, `They were needed to carry the heavy stained-glass windows of the walls`], 2, `Think about what a long stone beam can carry.`, `Post-and-lintel stone construction only spans short gaps, so roofs needed dense rows of supports.`),
      // L2 Greece
      mc(2, 1, 1, `Which architects designed the Parthenon?`, [`Imhotep and Vitruvius`, `Ictinus and Callicrates`, `Brunelleschi and Alberti`, `Wren and Palladio`], 1, `Both were active in 5th-century BC Athens.`, `The Parthenon was designed by Ictinus with Callicrates.`),
      mc(2, 2, 1, `Which of these is a Greek architectural order?`, [`Ribbed`, `Tripartite`, `Doric`, `Pendentive`], 2, `The three orders are Doric, Ionic and Corinthian.`, `Doric, Ionic and Corinthian are the Greek orders.`),
      mc(2, 3, 2, `A column swells slightly in the middle so it looks straight from a distance. What is this refinement called?`, [`Pilotis`, `Trencadis`, `Corbelling`, `Entasis`], 3, `It is an optical correction.`, `Entasis is the slight swelling of a column, one of the optical corrections of the Parthenon.`),
      tf(2, 4, 3, `The curvature and entasis of the Parthenon were meant to make it appear straight and stable to the eye.`, 0, `Ask what purpose an optical correction serves.`, `Greek builders deliberately bent lines slightly so the temple looks perfectly straight, correcting how the eye perceives long horizontals.`),
      // L3 Rome
      mc(3, 1, 1, `What are Vitruvius's three qualities of good architecture?`, [`Mass, light, ornament`, `Strength, utility, beauty`, `Height, span, symmetry`, `Order, rhythm, colour`], 1, `Firmitas, utilitas, venustas.`, `Vitruvius named firmitas (strength), utilitas (usefulness) and venustas (beauty).`),
      mc(3, 2, 1, `Who was Trajan's master builder, responsible for Trajan's Forum and the Danube bridge?`, [`Anthemius of Tralles`, `Imhotep, the Old Kingdom vizier and architect`, `Villard de Honnecourt`, `Apollodorus of Damascus`], 3, `He was Greek-Syrian and worked in Imperial Rome.`, `Apollodorus of Damascus (c. 50-130 AD) built Trajan's Forum and Column and the Danube bridge.`),
      mc(3, 3, 2, `You see a tall aqueduct made of stacked semicircular arches crossing a valley. Which civilisation built it?`, [`Old Kingdom Egypt`, `Classical Greece`, `Rome`, `Byzantium`], 2, `The Pont du Gard is an example.`, `Stacked arches carrying water, as in the Pont du Gard, are Roman engineering.`),
      mc(3, 4, 3, `Why could Roman buildings have much larger interior spaces than Greek temples?`, [`Greek marble was too soft to be used for roofs over any wide interior`, `Concrete, arches, vaults and domes could span wide openings`, `Rome banned columns`, `Greek temples had no roofs`], 1, `Compare post-and-lintel with vaulting.`, `Roman concrete, vaults and domes covered wide areas that post-and-lintel construction could not.`),
      // L4 Byzantine
      mc(4, 1, 1, `Which structural device lets a round dome sit on a square plan?`, [`Flying buttress`, `Pendentive`, `Pilotis columns`, `Entasis swelling`], 1, `It is a curved triangular piece in the corners.`, `Pendentives carry a dome's load down to the four corners of a square base.`),
      mc(4, 2, 1, `Who designed the Hagia Sophia, together with Isidore of Miletus?`, [`Ictinus`, `Vitruvius`, `Brunelleschi`, `Anthemius of Tralles`], 3, `He was a Byzantine Greek mathematician.`, `Anthemius of Tralles, geometer and architect, designed the Hagia Sophia with Isidore of Miletus.`),
      mc(4, 3, 2, `A church has a central plan, brick masonry, gold mosaics and a dome ringed by windows. Which style?`, [`Gothic`, `Baroque`, `Byzantine`, `Art Nouveau`], 2, `Look at the interior treatment.`, `Central plan, pendentive domes and gold mosaics are Byzantine hallmarks.`),
      mc(4, 4, 3, `What makes the Hagia Sophia's interior feel like one continuous floating space?`, [`A dense forest of thick columns filling the nave and carrying a flat timber roof overhead`, `A great dome supported by semi-domes and buttressing, with windows at its base`, `Stained-glass walls and flying buttresses`, `A flat timber roof`], 1, `Think about how the loads are stepped down.`, `Semi-domes and buttressing carry the central dome, and a ring of windows at its base makes it seem to hover.`),
      // L5 Romanesque/Gothic
      mc(5, 1, 1, `Which three devices define Gothic structure?`, [`Pilotis, ribbon windows, roof gardens`, `Pointed arch, ribbed vault, flying buttress`, `Entasis, peristyle, pediment, frieze and metope`, `Pendentive, mosaic, central plan`], 1, `They redirect loads outward and down.`, `The pointed arch, ribbed vault and flying buttress are the key Gothic devices.`),
      mc(5, 2, 1, `Which feature is typical of Romanesque architecture?`, [`Pointed arches with large stained glass walls`, `Glass curtain walls hung on a slender steel frame skeleton`, `Catenary arches`, `Rounded arches and thick walls with small windows`], 3, `Think heavy and fortress-like.`, `Romanesque buildings use rounded arches and thick walls with small openings.`),
      mc(5, 3, 2, `A cathedral has a pointed arch, visible exterior buttress arches and huge windows. Which style is it?`, [`Romanesque`, `Gothic`, `Neoclassical`, `Brutalist`], 1, `Look for walls dissolving into glass.`, `Pointed arches, flying buttresses and large glazed areas identify Gothic.`),
      mc(5, 4, 3, `Why could Gothic walls hold much larger windows than Romanesque walls?`, [`Gothic masons used steel`, `Glass was lighter than stone`, `Gothic buildings were much smaller, so thinner walls could stand without any buttressing`, `Buttresses and rib vaults carried the roof's thrust, so walls no longer bore the load`], 3, `Where does the load go once ribs and buttresses take it?`, `Ribbed vaults and flying buttresses channel the loads, freeing the walls to become glass.`),
      // L6 Renaissance
      mc(6, 1, 1, `Which architect built the dome of Florence Cathedral?`, [`Andrea Palladio`, `Leon Battista Alberti`, `Brunelleschi`, `Christopher Wren`], 2, `He lived 1377-1446.`, `Filippo Brunelleschi built the herringbone brick dome of Florence Cathedral.`),
      mc(6, 2, 1, `Which treatise did Andrea Palladio publish?`, [`De re aedificatoria, Alberti's ten books`, `De architectura`, `I quattro libri dell'architettura`, `Vers une architecture`], 2, `Its title means the Four Books.`, `Palladio wrote I quattro libri dell'architettura; Alberti wrote De re aedificatoria and Vitruvius De architectura.`),
      mc(6, 3, 2, `A symmetrical villa with a temple-front portico and a central domed room on a hill. Whose style is this?`, [`Gaudi`, `Palladio`, `Gehry`, `Sullivan`], 1, `Think of the Villa Rotonda.`, `Symmetrical plans with temple-front porticoes are Palladio's signature.`),
      tf(6, 4, 3, `Brunelleschi's dome was built without wooden centering, using a herringbone brick pattern.`, 0, `Consider why this was an engineering breakthrough.`, `The herringbone pattern let the brick courses support themselves as the dome rose, avoiding a massive timber framework.`),
      // L7 Baroque
      mc(7, 1, 1, `Which architect rebuilt St Paul's Cathedral after the Great Fire of London?`, [`Inigo Jones`, `Christopher Wren`, `Andrea Palladio`, `Norman Foster`], 1, `He was also a scientist.`, `Sir Christopher Wren designed St Paul's Cathedral, famous for its triple-shell dome.`),
      mc(7, 2, 1, `Which is a hallmark of Baroque architecture?`, [`Raw concrete`, `Smooth glass curtain walls hung from a tall steel structural frame`, `Dynamic curved forms and dramatic light and shadow`, `Rejection of all ornament`], 2, `Think theatre.`, `Baroque used curves, rich ornament and dramatic lighting.`),
      mc(7, 3, 2, `A civic building has a calm portico, a dome, strict symmetry and restrained classical detail, built around 1800. Which style?`, [`Baroque revival`, `Art Nouveau`, `Postmodern`, `Neoclassical`], 3, `Notice the restraint.`, `Restrained classical vocabulary with porticoes and domes is Neoclassical (c. 1750-1850).`),
      mc(7, 4, 3, `How does Neoclassicism differ from Baroque?`, [`It uses steel frames`, `It rejects symmetry entirely in favour of swirling curves and a theatrical play of light`, `It uses sober, restrained classical forms instead of theatrical curves and ornament`, `It was built only in Asia`], 2, `One is drama, the other is order.`, `Neoclassicism reacted against Baroque excess with simpler, restrained Greek and Roman forms.`),
      // L8 Industrial
      mc(8, 1, 1, `Who coined form follows function and designed the Wainwright Building?`, [`Le Corbusier`, `Frank Gehry`, `Louis Sullivan`, `Louis Kahn`], 2, `A Chicago School architect.`, `Louis Sullivan (1856-1924) is linked with form follows function and the Wainwright Building.`),
      mc(8, 2, 1, `Which technologies made the first skyscrapers possible?`, [`Marble columns and pendentives`, `Steel frame, safety elevator and reinforced concrete`, `Flying buttresses`, `Timber trusses`], 1, `Think structure and vertical transport.`, `The steel frame, safety elevator and early reinforced concrete set the stage for the skyscraper.`),
      mc(8, 3, 2, `A huge exhibition hall built of iron and glass in 1851 is an example of which building?`, [`Guggenheim`, `Villa Savoye`, `Crystal Palace`, `Pantheon`], 2, `It was an industrial-era showcase.`, `The Crystal Palace is a landmark of iron-and-glass construction.`),
      mc(8, 4, 3, `Why does a steel-frame building let facades have large windows compared with a masonry building?`, [`Steel is a transparent material that lets daylight pass through walls`, `Elevators carry the wall weight`, `Ornament holds the roof`, `The frame carries the loads, so walls need not be thick`], 3, `Where does the weight go?`, `With a frame carrying the loads, exterior walls become light skins that can be mostly glass.`),
      // L9 Art Nouveau
      mc(9, 1, 1, `Which architect designed the Sagrada Familia?`, [`Zaha Hadid`, `Frank Gehry`, `Louis Kahn`, `Antoni Gaudi`], 3, `He worked in Barcelona.`, `Antoni Gaudi (1852-1926) designed the Sagrada Familia, Casa Batllo, Park Guell and Casa Mila.`),
      mc(9, 2, 1, `What is trencadis?`, [`A decorative kind of pointed arch used in cathedrals`, `A mosaic made from broken ceramic pieces`, `A concrete finish`, `A steel truss`], 1, `Gaudi used it on Park Guell.`, `Trencadis is mosaic made from broken tile pieces, used on Gaudi's surfaces.`),
      mc(9, 3, 2, `A balcony looks like seaweed, with whiplash curves and a nature-inspired pattern in iron. Which style?`, [`Brutalist concrete`, `Neoclassical`, `Art Nouveau`, `International Style`], 2, `Look at the organic linework.`, `Whiplash curves, nature-derived ornament and iron are Art Nouveau traits.`),
      mc(9, 4, 3, `Why did Gaudi use hanging-chain (catenary) models?`, [`To make decorative patterns for the broken-ceramic mosaics that cover the facades and roof terraces`, `To choose colours`, `To measure the sun`, `A chain hangs in pure tension, so inverting its shape gives an arch in pure compression`], 3, `Flip the hanging shape upside down.`, `Inverting a hanging chain's form gives an ideal arch shape that carries load in compression.`),
      // L10 Bauhaus
      mc(10, 1, 1, `Who founded the Bauhaus?`, [`Louis Kahn`, `Walter Gropius`, `Le Corbusier`, `Adolf Loos`], 1, `He also designed the Fagus Factory.`, `Walter Gropius founded the Bauhaus (c. 1919-1933) in Germany.`),
      mc(10, 2, 1, `Which phrase is associated with Mies van der Rohe?`, [`A machine for living in`, `Form follows function`, `Less is more`, `Firmitas, utilitas, venustas`], 2, `It praises minimalism.`, `Mies is known for less is more; Le Corbusier for a machine for living in; Sullivan for form follows function.`),
      mc(10, 3, 2, `A flat-roofed pavilion of steel and glass with open flowing space and no ornament. Which architect fits best?`, [`Gaudi`, `Mies van der Rohe`, `Wren`, `Palladio`], 1, `Think Barcelona Pavilion.`, `Steel-and-glass minimalism with universal open space is Mies's hallmark.`),
      mc(10, 4, 3, `What is a glass curtain wall?`, [`A thick load-bearing masonry wall`, `A wall of stained glass in a cathedral`, `A sloping glass roof carried over an atrium or arcade space`, `A non-structural glass skin hung on a frame`], 3, `It does not carry the building's weight.`, `A curtain wall is an outer skin supported by the frame, not a load-bearing wall.`),
      // L11 Corbusier/Wright
      mc(11, 1, 1, `Which is one of Le Corbusier's Five Points of Architecture?`, [`Flying buttresses`, `Entasis columns`, `Pilotis`, `Pendentives`], 2, `Columns that lift a building.`, `The five points are pilotis, free plan, free facade, ribbon window and roof garden.`),
      mc(11, 2, 1, `Which house by Frank Lloyd Wright has cantilevered concrete terraces over a waterfall?`, [`Villa Savoye, Poissy`, `Fallingwater`, `Farnsworth House`, `Gropius House`], 1, `Its name hints at the water.`, `Wright's Fallingwater uses cantilevered reinforced-concrete terraces over a waterfall.`),
      mc(11, 3, 2, `A white box lifted on columns with ribbon windows and a roof garden. Whose house is it?`, [`Wright's Robie House`, `Gaudi's Casa Batllo`, `Kahn's Salk Institute in La Jolla`, `Le Corbusier's Villa Savoye`], 3, `Count the Five Points.`, `Villa Savoye is the classic expression of the Five Points.`),
      mc(11, 4, 3, `How does Wright's approach to site differ from Le Corbusier's?`, [`Wright's organic buildings grow from and anchor to the landscape, while Corbusier often lifts a pure object above it`, `Wright rejected concrete, Corbusier loved timber`, `Wright built only skyscrapers`, `They used identical methods`], 0, `Think organic versus machine.`, `Wright integrates building and site; Le Corbusier often presents a pure object raised on pilotis.`),
      // L12 Brutalism/Kahn
      mc(12, 1, 1, `What does the term beton brut mean?`, [`Glass curtain wall`, `Open floor plan`, `Raw concrete`, `Steel frame grid`], 2, `It is French and describes the material.`, `Beton brut is raw, unfinished concrete, the signature material of Brutalism.`),
      mc(12, 2, 1, `Which building is by Louis Kahn?`, [`Fallingwater`, `Pantheon`, `Villa Savoye`, `Salk Institute`], 3, `It is in La Jolla.`, `The Salk Institute is by Kahn, as are the Kimbell Art Museum and the Bangladesh National Assembly.`),
      mc(12, 3, 2, `A plan separates calm rooms for people from stair towers and utility shafts. Which Kahn idea is this?`, [`Free facade with ribbon windows`, `Served and servant spaces`, `Parametric design`, `Entasis`], 1, `Think of who is served.`, `Kahn separated served spaces (rooms) from servant spaces (stairs, ducts).`),
      mc(12, 4, 3, `What distinguishes Brutalism's expressive approach from the International Style's?`, [`Brutalism favours delicate stained glass and ornament, while the International Style builds heavy sculptural raw concrete`, `The International Style used raw concrete exclusively`, `Brutalism flaunts massive raw concrete and structure, while International Style prefers light glass skins`, `They are the same`], 2, `Heavy versus light.`, `Brutalism is heavy and sculptural; the International Style favours lightweight glass and steel.`),
      // L13 Postmodern etc
      mc(13, 1, 1, `Which building is by Frank Gehry?`, [`Heydar Aliyev Center`, `Guggenheim Museum Bilbao`, `Barcelona Pavilion`, `Salk Institute`], 1, `It is clad in titanium.`, `Gehry designed the Guggenheim Museum Bilbao and Walt Disney Concert Hall.`),
      mc(13, 2, 1, `Zaha Hadid is associated with which approach?`, [`Neoclassicism`, `Romanesque revival with thick walls and heavy round arches`, `Beaux-Arts`, `Parametric and deconstructivist design`], 3, `She is called the queen of the curve.`, `Hadid (1950-2016) is linked with deconstructivism and parametricism.`),
      mc(13, 3, 2, `A building quotes historical columns in bright colours with a wink of irony. Which style?`, [`Brutalist concrete`, `Bauhaus functionalism`, `Postmodern`, `Byzantine domed`], 2, `It reacts against austerity.`, `Historical quotation, colour and irony are postmodern.`),
      mc(13, 4, 3, `What most separates parametric design from earlier styles?`, [`It avoids curves and relies on repeated rectangular modules throughout`, `It generates form through algorithms and digital fabrication`, `It uses only stone`, `It copies Greek orders`], 1, `Ask how the form is produced.`, `Parametric design is driven by parameters and computation, then built with CNC or robotic fabrication.`),
      // L14 Structures
      mc(14, 1, 1, `A simply supported beam carries a uniform load w over span L. What is each support reaction?`, [`wL`, `wL/2`, `wL/4`, `wL/8`], 1, `The two supports share the total equally.`, `Each end carries half the total load wL, so R = wL/2.`),
      mc(14, 2, 1, `A cantilever has a tip point load P and length L. What is its maximum moment?`, [`PL/4`, `PL/2`, `PL`, `PL/8`], 2, `It occurs at the fixed support.`, `Maximum moment is PL, at the fixed end.`),
      mc(14, 3, 2, `A simply supported beam spans 4 m with a uniform load of 8 kN/m. What is the maximum moment (wL squared over 8)?`, [`8 kN·m`, `16 kN·m`, `32 kN·m`, `64 kN·m`], 1, `8 times 16 divided by 8.`, `M = 8 x 4 x 4 / 8 = 16 kN·m.`),
      mc(14, 4, 3, `If the span of a uniformly loaded simply supported beam doubles, what happens to the maximum moment?`, [`It doubles`, `It triples`, `It quadruples`, `It is unchanged`], 2, `The span is squared in the formula.`, `Because M = wL squared over 8, doubling L multiplies the moment by four.`),
    ],
  },
};
