import type { CourseModule } from '../courseModule';
import type { Question } from '../types';

const CID = 'art-masters';
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
    label: 'Art Masters',
    blurb: 'Art history through its masters: painters, sculptors, photographers and architects, and the movements they defined from the Renaissance to today.',
    accent: '#e23b6d',
    framework: 'c3',
    tracks: [
      {
        id: `${CID}.t1`,
        title: 'Renaissance and Baroque Light',
        blurb: 'From the High Renaissance to the Dutch Golden Age: how painters learned to model form with light and shadow.',
        level: 'FOUNDATION',
        lessons: [
          {
            id: lid(1),
            title: 'Leonardo da Vinci',
            blurb: 'The archetype of the Renaissance mind, who blended art and science.',
            minutes: 6,
            body: `Leonardo da Vinci (1452-1519) was an Italian painter of the High Renaissance and is often called the archetype of the Renaissance mind. His curiosity ran from painting to anatomy, engineering and nature, and each field fed the others.

His best-known works include the Mona Lisa, The Last Supper, the drawing Vitruvian Man and the portrait Lady with an Ermine. In each, the figure feels alive rather than flat.

Three techniques are worth learning to spot. Sfumato is the smoke-soft blending of tones, with no hard outline, so that edges melt into shadow; look at the corners of the Mona Lisa's mouth and eyes. Anatomical dissection informed his understanding of muscle, bone and gesture, making his bodies convincing. Aerial perspective uses haze and cooler, paler colours in the distance to suggest depth in a landscape.

When you view a Leonardo, notice how little is outlined and how much is modelled by gentle gradations of light. Ask what the sitter might be thinking: the psychology of the face is as important as its likeness. His notebooks and drawings show that he treated painting as a form of research.`,
          },
          {
            id: lid(2),
            title: 'Michelangelo and Raphael',
            blurb: 'Force and grace: two High Renaissance ideals side by side.',
            minutes: 7,
            body: `Michelangelo (1475-1564) and Raphael (1483-1520) were contemporaries who shaped the High Renaissance in Italy in contrasting ways.

Michelangelo was a painter and sculptor. Legend says he saw the angel in the marble and carved until he set it free. His monumental frescoes cover the Sistine Chapel ceiling, including The Creation of Adam, and he later painted The Last Judgment. His style is marked by terribilita, a sense of awe and force in the figure, and by heroic anatomy: muscular bodies that seem to carry great spiritual weight.

Raphael is remembered for grace, clarity and perfect balance. His works include The School of Athens, the Sistine Madonna and The Transfiguration. He used harmonious composition, idealised beauty and a mastery of perspective in fresco, arranging dozens of figures in a calm, open architectural space.

To compare them, ask what each wants you to feel. Michelangelo's twisting, powerful figures create tension and awe; Raphael's balanced groups create harmony and calm. Both men worked in fresco, painting into wet plaster on walls and ceilings, which required careful planning because corrections were difficult.`,
          },
          {
            id: lid(3),
            title: 'Caravaggio and Tenebrism',
            blurb: 'Violent light, deep darkness and sacred scenes set in the street.',
            minutes: 6,
            body: `Caravaggio (1571-1610) was an Italian painter of the Baroque who dragged the sacred into the street and lit it like theatre. Instead of idealised saints, he painted ordinary people, often from life, with dirty feet and worn clothes. That radical realism shocked and thrilled his audience.

His signature technique is tenebrism: violent light against deep dark. A single beam cuts through a shadowy room and picks out a face, a hand or a gesture, creating a moment of drama like a stage spotlight. This is more extreme than chiaroscuro, the general play of light and dark, because the shadows are enormous and almost black.

Key works include The Calling of St Matthew, Judith Beheading Holofernes and Bacchus. In The Calling of St Matthew, light enters from the side and falls on the tax collector, marking the instant of his call.

When you see a dark background, sharp spotlighting and figures who seem to burst out of the picture, think of Caravaggio. His influence on later painters across Europe, including Rembrandt's use of light, was enormous.`,
          },
          {
            id: lid(4),
            title: 'Rembrandt and Vermeer',
            blurb: 'Two Dutch Golden Age masters of light, one dramatic and one quiet.',
            minutes: 7,
            body: `The Dutch Golden Age produced two very different masters of light. Rembrandt (1606-1669) is the poet of light and shadow, and of the human face. His works include The Night Watch, The Anatomy Lesson of Dr. Tulp and a lifelong series of self-portraits. He used chiaroscuro, dramatic contrast between light and dark, and impasto, thick sculptural paint that catches real light on the surface. His portraits are psychological: they show age, doubt and compassion.

Johannes Vermeer (1632-1675) painted quiet rooms lit by a window. His works include Girl with a Pearl Earring, The Milkmaid and View of Delft. He is known for luminous natural light and pointille highlights, tiny dots of bright paint that sparkle on surfaces. Some scholars think he may have used a camera obscura, an optical device, though this remains a question.

Compare them. Rembrandt builds emotion through warm, golden pools of light surrounded by darkness and loose, thick paint. Vermeer builds calm through cool, even daylight and precise, smooth surfaces. Both turned everyday life and ordinary people into subjects worthy of serious art.`,
          },
        ],
      },
      {
        id: `${CID}.t2`,
        title: 'Light, Feeling and a New Vision',
        blurb: 'Romantic nightmares, Japanese woodblocks, Impressionist light and Post-Impressionist structure.',
        level: 'INTERMEDIATE',
        lessons: [
          {
            id: lid(5),
            title: 'Goya: From Court to Nightmare',
            blurb: 'A Spanish court painter becomes the prophet of the modern nightmare.',
            minutes: 6,
            body: `Francisco Goya (1746-1828) was a Spanish painter in the Romantic era who began as a court painter and became a prophet of the modern nightmare. His long life spanned war, revolution and political upheaval, and his art grew darker and more personal.

His famous works include The Third of May 1808, which shows an execution by firing squad during the Napoleonic occupation, with a lantern lighting the victim in a white shirt. Saturn Devouring His Son and the group known as the Black Paintings show his fears and inner torment, painted in a rough, direct style.

Goya's techniques include expressive, loose brushwork that suggests rather than describes, and aquatint etching, a printmaking method that produces soft tonal areas, ideal for dark, atmospheric prints. His interest in psychological darkness opened the way for later expressive art.

When you look at his work, ask where the viewer is standing: in The Third of May, we face the soldiers' backs and the victim's terror, and there is no glory in the scene. Goya turned history painting into a protest against cruelty, which is why he is often seen as a bridge to modern art.`,
          },
          {
            id: lid(6),
            title: 'Hokusai and the Floating World',
            blurb: 'Japanese woodblock prints and the wave that traveled the globe.',
            minutes: 6,
            body: `Katsushika Hokusai (1760-1849) was a Japanese painter and printmaker of the Edo period. He called himself the old man mad about drawing, and he kept learning and changing his style well into old age.

He worked in ukiyo-e, the woodblock printing tradition of the floating world, where an artist's drawing is cut into wooden blocks and printed in colour in many copies. His most famous works are The Great Wave off Kanagawa and the series Thirty-six Views of Mount Fuji. Mount Fuji appears in each, sometimes huge and sometimes tiny in the distance, while ordinary people work, travel and struggle in the foreground.

Hokusai is known for dynamic composition, with a strong diagonal and curling shapes that give a sense of motion, and for Prussian-blue landscapes. Prussian blue was an imported synthetic pigment that gave deep, stable blues.

In The Great Wave, notice how the wave towers over the boats and Fuji sits small and calm in the background. The contrast of human fragility and natural power is a central theme. Hokusai's prints later inspired European artists, helping to shape ideas about flat colour and bold cropping in modern art.`,
          },
          {
            id: lid(7),
            title: 'Monet and Impressionism',
            blurb: 'Painting the light itself, from sunrise harbours to water lilies.',
            minutes: 7,
            body: `Claude Monet (1840-1926) was a French painter of Impressionism who painted the light, and the thing beneath it dissolved. The movement takes its name from his work Impression, Sunrise.

Three ideas define his method.
- First, broken colour: instead of blending pigments, he placed separate touches of colour side by side so that the eye mixes them.
- Second, plein-air painting: working outdoors, in front of the subject, to capture a passing moment.
- Third, series: painting the same subject again and again under different conditions to study changing light.

The best-known series are Haystacks, the Rouen Cathedral paintings and the late Water Lilies.

When you study a Monet, step back and forth. Close up, you see patches and dashes of paint; from a distance, they resolve into water, haze or stone. Edges are soft and shadows are coloured instead of grey or black.

Impressionism changed what painting was for. Rather than telling a story or showing an ideal, the artist recorded how things appear to the eye at a specific time of day, which opened the door to many modern movements.`,
          },
          {
            id: lid(8),
            title: 'Van Gogh and Cezanne',
            blurb: 'Two Post-Impressionists: feeling made visible and structure made solid.',
            minutes: 7,
            body: `Post-Impressionism describes artists who built on Impressionism but wanted more feeling or more structure.

Vincent van Gogh (1853-1890), Dutch, made feeling visible in each burning stroke. His works include The Starry Night, Sunflowers, The Bedroom and Wheatfield with Crows. His techniques were expressive impasto, thick paint applied so that brushstrokes stand out, complementary colour tension such as blue against orange, and rhythmic, directional brushwork that makes skies and fields seem to move.

Paul Cezanne (1839-1906), French, sought structure. In The Card Players, the Mont Sainte-Victoire series and The Basket of Apples, he used constructive brushstrokes, built form from patches of colour, and reduced nature to the cylinder, the sphere and the cone. He also used shifting perspective, showing objects from slightly different viewpoints in a single image. Picasso and Matisse are said to have called him the father of us all.

Compare them: Van Gogh pushes colour and line to express emotion; Cezanne analyses how forms sit in space. Together they pointed toward Expressionism and Cubism, the next steps in modern art.`,
          },
        ],
      },
      {
        id: `${CID}.t3`,
        title: 'Modern Painting',
        blurb: 'Cubism, Fauvism, Surrealism and the American avant-garde.',
        level: 'INTERMEDIATE',
        lessons: [
          {
            id: lid(9),
            title: 'Picasso and Matisse',
            blurb: 'Cubist form versus Fauvist colour at the birth of modernism.',
            minutes: 7,
            body: `Pablo Picasso (1881-1973), Spanish, and Henri Matisse (1869-1954), French, are the two giants of early twentieth-century modernism.

Picasso shattered the single viewpoint. He was a co-founder of Cubism, in which an object is shown from several angles at once, and he used collage, gluing real materials into the picture. His works include Les Demoiselles d'Avignon, Guernica and The Weeping Woman. His career was restless: he reinvented his style across many periods.

Matisse treated colour as pure, singing feeling. He led Fauvism, which uses wild, non-natural colour, for example a green stripe down a face. He painted flattened, decorative space in works like The Dance and The Red Studio. In his late years, he worked in papiers decoupes, paper cut-outs, producing the book Jazz.

To tell them apart, look at the main problem each solves. Picasso breaks form apart and reassembles it; Matisse simplifies shape and lets colour carry the emotion. They were friendly rivals who each admired the other, and both drew inspiration from Cezanne, whom they regarded as a founder of their art.`,
          },
          {
            id: lid(10),
            title: 'Surrealism: Dali and Kahlo',
            blurb: 'Dreams, myths and the unconscious made visible.',
            minutes: 7,
            body: `Surrealism explored the unconscious, dreams and the irrational. Two artists linked with it are very different.

Salvador Dali (1904-1989), Spanish, was the showman of the unconscious. His works include The Persistence of Memory, with its melting watches, and The Metamorphosis of Narcissus. He painted hyper-real dream imagery with a technique close to academic realism, so that impossible things look convincing. He called his approach the paranoiac-critical method and often used double images, in which one shape can be read as two different things.

Frida Kahlo (1907-1954), Mexican, painted her own reality of pain, identity and myth. Her works include The Two Fridas, Self-Portrait with Thorn Necklace and The Broken Column. She used symbolic self-portraiture, drew on Mexican folk traditions such as retablo painting, and told her autobiography without flinching.

To compare: Dali invented dream worlds to astonish the viewer; Kahlo used symbols from her life to speak about experience. When looking at either, ask what is real, what is imagined and what the objects stand for. In Kahlo's work, nearly every plant, animal and wound has a meaning.`,
          },
          {
            id: lid(11),
            title: 'American Modernists to Basquiat',
            blurb: 'Magnified flowers, drips, colour fields and street-born neo-expressionism.',
            minutes: 8,
            body: `American art in the twentieth century moved from precise modernism to big gestures and then to street energy.

Georgia O'Keeffe (1887-1986) is called the mother of American modernism. Works such as Jimson Weed, Black Iris and Ram's Head, White Hollyhock show magnified natural forms, precise and sensuous abstraction, and the light of New Mexico.

Abstract Expressionism followed. Jackson Pollock (1912-1956) took the canvas off the easel and onto the floor, using drip or action painting, an all-over composition and gesture as the subject, as in No. 5, 1948, Autumn Rhythm and Blue Poles. Mark Rothko (1903-1970) made colour fields: luminous floating rectangles of thin, layered washes, as in No. 61 (Rust and Blue) and the Seagram Murals, which ask the viewer to stand still and feel.

Jean-Michel Basquiat (1960-1988) moved from subway walls, where he wrote as SAMO, to museums. His neo-expressionist works, such as Untitled (Skull) and Dustheads, collide text and image with urgency.

Compare the energy: Pollock's is physical and gestural, Rothko's is quiet and meditative, and Basquiat's is coded, raw and electric.`,
          },
        ],
      },
      {
        id: `${CID}.t4`,
        title: 'Beyond the Canvas',
        blurb: 'Sculpture, photography and architecture as fine art.',
        level: 'ADVANCED',
        lessons: [
          {
            id: lid(12),
            title: 'Sculptors: Rodin to Bourgeois',
            blurb: 'Four sculptors who redefined form, surface and space.',
            minutes: 7,
            body: `Sculpture changed dramatically across the late nineteenth and twentieth centuries.

Auguste Rodin (1840-1917), French, is the father of modern sculpture. The Thinker, The Kiss, The Gates of Hell and The Burghers of Calais show expressive, unfinished (non finito) surfaces, emotional realism and the fragment as a complete work.

Constantin Brancusi (1876-1957), Romanian, carved toward the essence. Bird in Space, The Kiss and Endless Column show radical abstraction, direct carving and polished, reflective bronze.

Henry Moore (1898-1986), British, made the void as expressive as the mass. His Reclining Figure series and Large Two Forms use the pierced form, with holes through the body, biomorphic abstraction and monumental public bronze.

Louise Bourgeois (1911-2010), French-American, turned memory, the body and the mother into steel and thread. Maman, the giant spider, Cells and Femme Maison show psychologically charged installation, diverse materials and autobiographical symbolism.

To analyse them, ask what each removes. Rodin leaves roughness in the surface, Brancusi removes detail until only the essence remains, Moore opens the figure with space, and Bourgeois transforms memory into an environment you can enter.`,
          },
          {
            id: lid(13),
            title: 'Photographers as Artists',
            blurb: 'How the camera became an instrument of art and conscience.',
            minutes: 8,
            body: `Photography is light written directly, and its masters turned it into an art with a point of view.

Ansel Adams (1902-1984) made the American wilderness monumental, with Moonrise, Hernandez and Clearing Winter Storm. He developed the Zone System with Fred Archer and used large-format cameras and rich tonal printing.

Dorothea Lange (1895-1965) gave the Great Depression a human face, most famously in Migrant Mother, using empathetic portraiture and field captions as testimony.

Henri Cartier-Bresson (1908-2004), French, sought the decisive moment, the instant when form and meaning align. He used a Leica 35mm camera and co-founded Magnum Photos.

Vivian Maier (1926-2009) was a nanny who photographed the streets of Chicago and New York with a Rolleiflex, and was discovered only after her death.

Gordon Parks (1912-2006) used the photo-essay in Life magazine to document race and poverty, and also worked as a filmmaker.

Compare their aims: Adams revered nature, Lange and Parks documented social conditions, Cartier-Bresson caught fleeting geometry, and Maier quietly recorded city life. Ask what each chooses to include, and whom the photograph is for.`,
          },
          {
            id: lid(14),
            title: 'Architects as Artists',
            blurb: 'Space as sculpture and structure as statement.',
            minutes: 7,
            body: `Some architects are treated as artists because their buildings work as sculpture and as ideas.

Antoni Gaudi (1852-1926) built as nature builds, in curves and colour. The Sagrada Familia, Casa Batllo, Park Guell and Casa Mila use catenary hanging-chain models, trencadis mosaic and biomimetic organic form.

Frank Lloyd Wright (1867-1959) wedded architecture to its landscape. Fallingwater, the Guggenheim Museum, Robie House and Taliesin show organic architecture, Prairie-style horizontality and open flowing interiors.

Le Corbusier (1887-1965) declared a house a machine for living in. Villa Savoye, Notre-Dame du Haut and the Unite d'Habitation use the Five Points of Architecture, pilotis, free plan and the Modulor proportional system.

Ludwig Mies van der Rohe (1886-1969) said less is more. The Barcelona Pavilion, Farnsworth House and Seagram Building show steel-and-glass minimalism and flexible space, with God in the details.

Zaha Hadid (1950-2016) bent the straight line until buildings seemed to move. The Heydar Aliyev Center, MAXXI Museum and London Aquatics Centre use parametric design, and she was the first woman to win the Pritzker Prize.

Compare the arc: from organic curves through machine-age order to computed fluid form.`,
          },
        ],
      },
    ],
  },
  bank: {
    curriculumId: CID,
    questions: [
      // L1 Leonardo
      mc(1, 1, 1, `Which technique uses smoke-soft transitions with no visible outline?`, [`Tenebrism in the Baroque manner`, `Sfumato`, `Impasto layering`, `Collage assembly`], 1, `Think of the Mona Lisa's softly blended edges.`, `Sfumato is the soft, smoky blending that Leonardo used to avoid hard lines.`),
      mc(1, 2, 1, `Which of these works is by Leonardo da Vinci?`, [`The Night Watch of 1642`, `The Last Supper`, `The Third of May 1808`, `Starry Night over the Rhone`], 1, `It is a mural of a famous dinner.`, `Leonardo painted The Last Supper, along with the Mona Lisa and Lady with an Ermine.`),
      mc(1, 3, 2, `A landscape's distant mountains are paler and bluer than the foreground. Which Leonardo technique is this?`, [`Aerial perspective`, `Pointille`, `Fauvism`, `Action painting with poured paint`], 0, `It uses atmosphere to suggest depth.`, `Aerial perspective uses haze and cooler tones to show distance.`),
      mc(1, 4, 3, `How did dissecting bodies help Leonardo as a painter?`, [`It let him paint faster`, `It gave him an understanding of muscle and gesture that made figures convincing`, `It taught him to mix pigments`, `It was required for fresco`], 1, `Think about what is under the skin.`, `Knowing anatomy made his figures' structure and movement more believable.`),
      // L2 Michelangelo / Raphael
      mc(2, 1, 1, `Which painting is on the Sistine Chapel ceiling?`, [`The School of Athens`, `The Creation of Adam`, `The Transfiguration of Christ`, `Sistine Madonna`], 1, `It is by Michelangelo.`, `The Creation of Adam is part of Michelangelo's Sistine ceiling.`),
      mc(2, 2, 1, `Which artist painted The School of Athens?`, [`Michelangelo`, `Leonardo`, `Raphael`, `Caravaggio`], 2, `Known for grace and balance.`, `Raphael painted The School of Athens in fresco.`),
      mc(2, 3, 2, `A fresco shows muscular twisting figures that radiate awe and force. Which quality is this?`, [`Sfumato`, `Terribilita`, `Pointille`, `Plein-air painting`], 1, `It's an Italian word suggesting awe.`, `Terribilita describes the awe and force in Michelangelo's figures.`),
      mc(2, 4, 3, `Which comparison of Michelangelo and Raphael is most accurate?`, [`Michelangelo stresses tension and heroic anatomy; Raphael stresses harmony and idealised beauty`, `Michelangelo painted only landscapes; Raphael only portraits`, `Both worked only in oil on small panels`, `Raphael was the sculptor and Michelangelo the architect only`], 0, `Think about the mood each creates.`, `Michelangelo conveys force while Raphael conveys calm balance, though both were High Renaissance masters.`),
      // L3 Caravaggio
      mc(3, 1, 1, `What is tenebrism?`, [`Violent light against deep dark`, `Painting with tiny dots of pure colour`, `Flat decorative colour in gold tones`, `Drip painting`], 0, `The word relates to shadows.`, `Tenebrism is dramatic contrast of strong light with deep darkness, Caravaggio's signature.`),
      mc(3, 2, 1, `Which painting is by Caravaggio?`, [`Water Lilies`, `The Calling of St Matthew`, `The Dance`, `Blue Poles by Jackson Pollock`], 1, `A tax collector is called by Christ.`, `The Calling of St Matthew is a Caravaggio, as are Judith Beheading Holofernes and Bacchus.`),
      mc(3, 3, 2, `A painting shows a dark room, a beam of light and a figure with dirty feet in a sacred scene. Whose style is this?`, [`Raphael`, `Johannes Vermeer`, `Matisse`, `Caravaggio`], 3, `Think of radical realism.`, `Strong spotlighting plus a gritty realistic treatment of sacred subjects marks Caravaggio.`),
      mc(3, 4, 3, `How does tenebrism differ from general chiaroscuro?`, [`It is much more extreme, with huge, near-black shadows`, `It uses a soft, even glow with almost no contrast between areas`, `It uses only primary colours`, `It is only for sculpture`], 0, `Consider how much of the picture is dark.`, `Chiaroscuro is any light-dark modelling; tenebrism pushes the contrast to a theatrical extreme.`),
      // L4 Dutch
      mc(4, 1, 1, `Who painted Girl with a Pearl Earring?`, [`Rembrandt`, `Johannes Vermeer`, `Francisco Goya`, `Caravaggio`], 1, `He painted quiet rooms with window light.`, `Johannes Vermeer painted Girl with a Pearl Earring and The Milkmaid.`),
      mc(4, 2, 1, `Which technique means thick, sculptural paint?`, [`Sfumato blending`, `Aquatint`, `Impasto`, `Collage pasting`], 2, `Rembrandt used it.`, `Impasto is thickly applied paint that stands out from the canvas.`),
      mc(4, 3, 2, `A portrait emerges from a dark background with warm light and thick, loose paint, showing deep psychological insight. Which artist?`, [`Rembrandt`, `Vermeer`, `Claude Monet`, `Rothko`], 0, `Think of The Night Watch.`, `Rembrandt used chiaroscuro and impasto for psychological portraiture.`),
      tf(4, 4, 3, `Vermeer is known for dramatic chiaroscuro and thick impasto, while Rembrandt is known for cool, even light and pointille highlights.`, 1, `Check which artist matches which technique.`, `It is the reverse: Rembrandt used chiaroscuro and impasto; Vermeer is known for luminous natural light and pointille highlights.`),
      // L5 Goya
      mc(5, 1, 1, `Which painting by Goya shows an execution during the Napoleonic occupation?`, [`Saturn Devouring His Son`, `The Third of May 1808`, `The Night Watch`, `Guernica`], 1, `The date is in the title.`, `The Third of May 1808 shows the executions; Saturn Devouring His Son belongs to the Black Paintings.`),
      mc(5, 2, 1, `Which printmaking technique did Goya use for soft tonal areas?`, [`Woodblock`, `Aquatint etching`, `Lithograph`, `Silkscreen printing`], 1, `It is an etching method.`, `Goya used aquatint etching, which produces soft tones.`),
      mc(5, 3, 2, `A painting with loose, expressive brushwork shows a nightmarish scene of a figure devouring his child. Which work?`, [`Saturn Devouring His Son`, `The Great Wave off Kanagawa`, `The Dance`, `Sunflowers`], 0, `It's among the Black Paintings.`, `Saturn Devouring His Son is one of Goya's Black Paintings.`),
      mc(5, 4, 3, `Why is Goya often seen as a bridge to modern art?`, [`He painted only flowers`, `He used photography`, `He introduced Cubism`, `He turned subjects of history and fear into personal, psychological expression`], 3, `Think about emotion and protest.`, `His expressive handling and psychological darkness anticipated later modern art.`),
      // L6 Hokusai
      mc(6, 1, 1, `Which print is by Hokusai?`, [`The Great Wave off Kanagawa`, `Moonrise, Hernandez`, `The Persistence of Memory`, `Bird in Space, a bronze sculpture`], 0, `A towering wave dwarfs boats.`, `Hokusai made The Great Wave off Kanagawa as part of Thirty-six Views of Mount Fuji.`),
      mc(6, 2, 1, `What printing tradition did Hokusai work in?`, [`Daguerreotype`, `Etching`, `Ukiyo-e woodblock printing`, `Offset lithography on newsprint`], 2, `It means pictures of the floating world.`, `Hokusai worked in ukiyo-e woodblock printing in Edo-period Japan.`),
      mc(6, 3, 2, `A print shows a giant curling wave in deep blue with a small distant mountain. Which pigment gave the characteristic blue?`, [`Prussian blue`, `Vermilion`, `Natural ultramarine`, `Gold leaf`], 0, `It is a modern synthetic blue.`, `Prussian-blue landscapes are a mark of Hokusai's prints.`),
      mc(6, 4, 3, `What contrast does The Great Wave emphasise?`, [`Day and night`, `The fragility of people against the power of nature`, `Summer and winter`, `City and country`], 1, `Compare the wave, the boats and Mount Fuji.`, `The towering wave over small boats, with calm Fuji beyond, contrasts human fragility with natural force.`),
      // L7 Monet
      mc(7, 1, 1, `Which Monet painting gave Impressionism its name?`, [`Impression, Sunrise`, `Haystacks`, `Water Lilies at Giverny`, `Rouen Cathedral`], 0, `It's a harbour at dawn.`, `Impression, Sunrise gave the movement its name.`),
      mc(7, 2, 1, `What does plein-air painting mean?`, [`Painting from memory`, `Painting outdoors in front of the subject`, `Painting with air-brushes`, `Painting on glass`], 1, `Think of where the artist stands.`, `Plein-air painting is done outdoors to capture changing light.`),
      mc(7, 3, 2, `An artist paints the same cathedral at dawn, noon and dusk to show how light changes. What is this approach?`, [`A cut paper collage`, `Cubist fragmentation`, `A series study`, `Tenebrist spotlighting`], 2, `Monet did this with haystacks too.`, `Monet's series, such as Haystacks and Rouen Cathedral, study changing light on one subject.`),
      mc(7, 4, 3, `Why do Monet's paintings seem to dissolve up close and cohere from a distance?`, [`He used photographs`, `He placed separate touches of broken colour so the eye blends them`, `He painted very small canvases`, `He used only black and white`], 1, `Think of colours placed side by side.`, `Broken colour uses distinct strokes that blend optically when viewed from afar.`),
      // L8 Van Gogh / Cezanne
      mc(8, 1, 1, `Which artist painted The Starry Night?`, [`Paul Cezanne of Aix`, `Vincent van Gogh`, `Claude Monet of Giverny`, `Henri Matisse, the Fauve leader`], 1, `He was Dutch.`, `Vincent van Gogh painted The Starry Night, Sunflowers and The Bedroom.`),
      mc(8, 2, 1, `Cezanne reduced nature to which basic shapes?`, [`Cylinder, sphere and cone`, `Triangle only`, `Spirals and interlocking curves`, `Grids of dots`], 0, `Three solid forms.`, `Cezanne described nature in terms of the cylinder, sphere and cone.`),
      mc(8, 3, 2, `A painting of an apple still life shows the table tilted from slightly different viewpoints and built from patches of colour. Who is it?`, [`Van Gogh`, `Dali`, `Cezanne`, `Pollock`], 2, `Think of The Basket of Apples.`, `Constructive strokes and shifting perspective are Cezanne's hallmarks.`),
      mc(8, 4, 3, `How do Van Gogh and Cezanne differ in aim?`, [`Van Gogh used colour and line for emotion; Cezanne analysed form and structure`, `Van Gogh painted only portraits; Cezanne only skies`, `Both avoided colour`, `Cezanne was a sculptor; Van Gogh a photographer`], 0, `Feeling versus structure.`, `Van Gogh emphasised expressive feeling, whereas Cezanne built solid structure, pointing toward Expressionism and Cubism.`),
      // L9 Picasso / Matisse
      mc(9, 1, 1, `Which movement did Picasso co-found?`, [`Cubism`, `Fauvism`, `Impressionism`, `Pop art`], 0, `Objects are shown from several angles.`, `Picasso co-founded Cubism.`),
      mc(9, 2, 1, `Which technique is Matisse known for in his late years?`, [`Drip painting`, `Papiers decoupes (paper cut-outs)`, `Etching`, `Photomontage from magazine photographs`], 1, `He cut shapes from painted paper.`, `Matisse made paper cut-outs, such as those in Jazz.`),
      mc(9, 3, 2, `A portrait with a green stripe down the face and flat, wild colour. Which movement?`, [`Cubism, the geometric style`, `Surrealism`, `Fauvism`, `Social realism`], 2, `The name means wild beasts.`, `Fauvism uses wild, non-natural colour; Matisse was its leader.`),
      mc(9, 4, 3, `Which comparison is correct?`, [`Picasso fragments form and viewpoint, while Matisse simplifies shape and lets colour carry feeling`, `Matisse painted Guernica, Picasso The Dance`, `Both were Impressionists`, `Picasso used only colour fields`], 0, `Think of Guernica and The Dance.`, `Picasso broke form apart; Matisse emphasised colour and flat, decorative space.`),
      // L10 Surrealism
      mc(10, 1, 1, `Which painting contains melting watches?`, [`The Two Fridas`, `The Persistence of Memory`, `The Disasters of War series`, `Guernica`], 1, `By Salvador Dali.`, `The Persistence of Memory is by Dali.`),
      mc(10, 2, 1, `Frida Kahlo drew on which Mexican folk tradition?`, [`Retablo painting`, `Ukiyo-e woodblock prints`, `Fresco secco`, `Cubism`], 0, `Small devotional paintings.`, `Kahlo drew on retablo traditions along with symbolic self-portraiture.`),
      mc(10, 3, 2, `An image that can be read as two different things at once is called what, in Dali's practice?`, [`A photographic collage`, `A paper cut-out`, `A double image`, `A three-panel triptych`], 2, `Dali used them often.`, `Double images were one of his dream-imagery techniques.`),
      tf(10, 4, 3, `Kahlo's paintings mostly invent dream worlds unrelated to her own life.`, 1, `Recall what her subject was.`, `Kahlo painted her own reality, using symbols from her life, pain and identity.`),
      // L11 American
      mc(11, 1, 1, `Which artist is known for drip or action painting?`, [`Jackson Pollock`, `Mark Rothko`, `Georgia O'Keeffe`, `Jean-Michel Basquiat`], 0, `He worked on canvases laid on the floor.`, `Jackson Pollock used drip and action painting, as in Autumn Rhythm.`),
      mc(11, 2, 1, `Which artist is known for luminous floating rectangles of colour?`, [`Jackson Pollock`, `Basquiat`, `Mark Rothko`, `O'Keeffe`], 2, `Think colour fields.`, `Mark Rothko painted layered washes of floating rectangles.`),
      mc(11, 3, 2, `A huge close-up of a flower that becomes almost abstract, in the light of New Mexico. Which artist?`, [`Georgia O'Keeffe`, `Mark Rothko of New York`, `Jackson Pollock of Long Island`, `Pablo Picasso of Spain`], 0, `Think Black Iris.`, `O'Keeffe magnified natural forms into precise, sensuous abstraction.`),
      mc(11, 4, 3, `Which pair correctly contrasts the energy of two artists?`, [`Pollock's is physical and gestural; Rothko's is quiet and meditative`, `Pollock's is meditative; Rothko's is gestural`, `Both are photorealistic`, `Rothko used graffiti only`], 0, `Think movement versus stillness.`, `Pollock emphasised gesture, whereas Rothko's colour fields invite stillness.`),
      // L12 Sculptors
      mc(12, 1, 1, `Which sculptor is called the father of modern sculpture?`, [`Henry Moore`, `Constantin Brancusi`, `Auguste Rodin`, `Louise Bourgeois`], 2, `He made The Thinker.`, `Auguste Rodin is known as the father of modern sculpture.`),
      mc(12, 2, 1, `Which work is by Louise Bourgeois?`, [`Bird in Space`, `Maman`, `The Kiss by Rodin`, `Large Two Forms`], 1, `A giant spider.`, `Bourgeois made Maman, the giant spider.`),
      mc(12, 3, 2, `A large bronze reclining figure with holes through the body. Which sculptor?`, [`Henry Moore`, `Brancusi`, `Auguste Rodin`, `Bourgeois`], 0, `He used the pierced form.`, `Henry Moore is known for pierced forms in his Reclining Figure series.`),
      mc(12, 4, 3, `Which description best captures Brancusi's goal?`, [`Capturing a fleeting moment`, `Rough, unfinished surfaces`, `Distilling a subject to its pure, essential form`, `Building large installations from fabric`], 2, `Think of Bird in Space.`, `Brancusi pursued radical abstraction and polished essence rather than detail.`),
      // L13 Photographers
      mc(13, 1, 1, `Who photographed Migrant Mother?`, [`Dorothea Lange`, `Ansel Adams`, `Vivian Maier`, `Annie Leibovitz`], 0, `She documented the Great Depression.`, `Dorothea Lange made Migrant Mother as part of her documentary work.`),
      mc(13, 2, 1, `Which phrase is associated with Henri Cartier-Bresson?`, [`The Zone System`, `The decisive moment`, `Social documentary`, `Pointille`], 1, `It's about timing.`, `Cartier-Bresson sought the decisive moment, where form and meaning align.`),
      mc(13, 3, 2, `A photographer worked as a nanny and shot thousands of street photos with a Rolleiflex, discovered after her death. Who?`, [`Gordon Parks`, `Steve McCurry`, `Ansel Adams`, `Vivian Maier`], 3, `Chicago and New York streets.`, `Vivian Maier's lifelong archive was discovered only after her death.`),
      mc(13, 4, 3, `Which pairing best matches photographer and aim?`, [`Adams: making wilderness monumental; Parks: documenting race and poverty`, `Adams: Great Depression portraits; Lange: wilderness`, `Maier: celebrity portraits for magazines; Leibovitz: hidden street work found after her death`, `Cartier-Bresson: studio still lifes`], 0, `Think subject matter.`, `Adams photographed landscapes in large format, while Parks used the photo-essay on social issues.`),
      // L14 Architects
      mc(14, 1, 1, `Which architect said less is more?`, [`Gaudi`, `Frank Lloyd Wright`, `Mies van der Rohe`, `Hadid`], 2, `He designed the Seagram Building.`, `Mies van der Rohe is associated with less is more.`),
      mc(14, 2, 1, `Who was the first woman to win the Pritzker Prize?`, [`Zaha Hadid`, `Louise Bourgeois`, `Georgia O'Keeffe`, `Frida Kahlo`], 0, `She designed the Heydar Aliyev Center.`, `Zaha Hadid was the first woman to win the Pritzker Prize.`),
      mc(14, 3, 2, `A house cantilevered over a waterfall with open flowing interiors. Which architect?`, [`Le Corbusier`, `Mies`, `Antoni Gaudi of Barcelona`, `Frank Lloyd Wright`], 3, `Fallingwater.`, `Frank Lloyd Wright designed Fallingwater.`),
      mc(14, 4, 3, `What do Gaudi's catenary models and Le Corbusier's Modulor have in common?`, [`Both were photographic processes developed in the nineteenth century for recording buildings`, `Both were methods to determine form through a system, one structural, one proportional`, `Both were paint pigments`, `Both were mosaic styles`], 1, `Each is a system behind the design.`, `Gaudi used hanging-chain models to find structural form, and Le Corbusier used the Modulor as a proportional system.`),
    ],
  },
};
