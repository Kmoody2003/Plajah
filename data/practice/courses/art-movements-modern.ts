import type { CourseModule } from '../courseModule';
import type { Question } from '../types';
import type { Curriculum } from '../../../services/schoolChassis';

type Track = Curriculum['tracks'][number];

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

const L = (n: number) => `art-movements-modern.l${String(n).padStart(2, '0')}`;
const L01 = L(1), L02 = L(2), L03 = L(3), L04 = L(4), L05 = L(5), L06 = L(6), L07 = L(7);
const L08 = L(8), L09 = L(9), L10 = L(10), L11 = L(11), L12 = L(12), L13 = L(13), L14 = L(14);
const L15 = L(15), L16 = L(16), L17 = L(17), L18 = L(18), L19 = L(19), L20 = L(20), L21 = L(21);
const L22 = L(22), L23 = L(23), L24 = L(24), L25 = L(25), L26 = L(26), L27 = L(27), L28 = L(28);

const t1: Track = {
  id: 'art-movements-modern.t1',
  title: 'Breaking the Mold: 1880s to 1900s',
  blurb: 'Why art changed after Impressionism, and the painters who made colour, form and feeling their own subjects.',
  level: 'FOUNDATION',
  lessons: [
    {
      id: L01,
      title: 'Why Modern Art Broke the Rules',
      blurb: 'Photography, industry and new ideas pushed artists away from copying the visible world.',
      minutes: 6,
      body: `For several centuries, much European painting aimed to look like the world seen through a window: believable space, believable light, believable people. Academies trained artists in this skill, and annual exhibitions such as the Paris Salon decided who got attention and sales. In the nineteenth century, several changes began to loosen that system.

Photography, announced to the public in 1839, could record a face or a street faster than any painter. Many artists concluded that painting's value lay elsewhere: in colour, in touch, in emotion, in ideas. Cities and factories were transforming daily life. Newly published colour theories, travel, and the arrival in Europe of Japanese prints and objects from other cultures showed artists that there were other ways to arrange a picture. Painters also began to organize their own exhibitions, beginning with the Impressionists in Paris in 1874, instead of waiting for official approval.

The result was a series of groups and styles, often called movements or isms. Two cautions are useful. First, labels are usually applied by critics, often after the fact and sometimes as insults; Impressionism, Fauvism and Cubism all began that way. Second, movements overlap, and many artists belonged to none or changed direction.

A worked example: compare a portrait from 1850 with one from 1910. The earlier one may try to match the sitter's appearance closely. The later one may use flat colour or fractured shapes to express the artist's idea of the person. Neither is "wrong"; they answer different questions. This course follows those questions from the 1880s to today, and treats each movement as an argument, not just a style.`,
    },
    {
      id: L02,
      title: 'Post-Impressionism: Cézanne, Van Gogh, Gauguin and Seurat',
      blurb: 'Four painters who built on Impressionism and then went their separate ways.',
      minutes: 7,
      body: `The Impressionists captured fleeting light. In the 1880s and 1890s a younger generation wanted more: structure, symbolism, emotion or science. The English critic Roger Fry later gave them a name, "Post-Impressionism," for a 1910 exhibition in London. It is a convenient label for artists who do not share one style.

Paul Cézanne (1839 to 1906) worked mostly near Aix-en-Provence in southern France. He painted subjects such as Mont Sainte-Victoire repeatedly, building form from small, patient planes of colour rather than outlines. Later painters, especially the Cubists, learned from his way of treating a landscape as a structure of shapes.

Vincent van Gogh (1853 to 1890), a Dutch artist, used thick paint and strongly directional brushstrokes to carry emotion. He painted The Starry Night in 1889 while staying at an asylum in Saint-Rémy, in southern France. He sold very little during his short life.

Paul Gauguin (1848 to 1903) simplified forms into flat areas of colour and moved to Tahiti in 1891. His Tahitian work is now debated: critics point out that it presents a colonial, exoticizing view of Polynesian life, and that his relationships with very young girls there were exploitative.

Georges Seurat (1859 to 1891) approached painting almost like an experiment. In A Sunday on La Grande Jatte, made in the mid-1880s, he placed tiny dots of colour side by side so that the eye blends them from a distance, a method often called pointillism.

Together they show a pattern: each took one element of painting, whether structure, feeling, flatness or colour science, and made it the main subject.`,
    },
    {
      id: L03,
      title: 'Symbolism: Painting Ideas and Dreams',
      blurb: 'Symbolist artists chose mystery and inner life over direct description of the world.',
      minutes: 6,
      body: `Symbolism began as a literary movement in France. In 1886 the poet Jean Moréas published a manifesto in the newspaper Le Figaro, arguing that art should suggest ideas through images instead of describing things plainly. Visual artists across Europe took up similar aims in the following decades. Symbolist art favours dreams, myth, spirituality, fear, desire and death, often in a hushed or eerie mood.

Gustave Moreau (1826 to 1898) painted jewel-like scenes from the Bible and classical myth, packed with ornament and ambiguity. Odilon Redon (1840 to 1916) first became known for charcoal drawings and lithographs he called his "noirs," which include floating eyes and strange hybrid creatures, and later turned to luminous colour in pastel and oil. His images invite the viewer to complete the meaning.

The Norwegian artist Edvard Munch (1863 to 1944) used simplified, wavering lines and intense colour to express anxiety and grief. The Scream exists in several versions, including paintings, pastels and a lithograph, first made in 1893. It is often read as a picture of inner panic, not of a particular landscape event. Gustav Klimt (1862 to 1918), a founder of the Vienna Secession in 1897, combined flat gold ornament with sensuous figures in works such as The Kiss, painted around 1907 and 1908.

Symbolism matters because it sets a pattern for later movements: Expressionism and Surrealism both inherit its belief that a picture can show inner experience. A useful test when you meet a Symbolist work is to ask what feeling it produces before asking what it depicts.`,
    },
    {
      id: L04,
      title: 'Fauvism: Colour Unleashed',
      blurb: 'In 1905 a group of Paris painters used bold, unrealistic colour to build pictures.',
      minutes: 6,
      body: `In 1905 the Salon d'Automne in Paris hung together a room of paintings by Henri Matisse, André Derain and others that used startlingly bright colour. The critic Louis Vauxcelles reportedly described a conventional sculpture in the same room as being "among the wild beasts" (in French, les fauves). The name stuck, and these painters became known as the Fauves.

What made Fauvism new was that colour no longer had to match the thing it described. In Matisse's Woman with a Hat (1905), strokes of green, orange and purple appear on a face and a hat. The colours do not report what the sitter's skin looked like; they build the picture's structure and mood. Derain painted views of the Thames in London in 1906 using intense, simplified colour for water and buildings. Maurice de Vlaminck brought a rougher, more explosive energy.

The group was never organized, and as a recognizable movement it lasted only a few years, roughly to 1907 or 1908. Its members then moved in different directions. Matisse (1869 to 1954) went on to a long career built on simplified shape and harmonious colour, and in old age made large paper cut-outs by cutting painted sheets with scissors.

A useful exercise: pick any photograph and imagine repainting it with colours chosen for feeling instead of accuracy, such as a warm orange sky for calm. That is the Fauvist idea. Its influence on Expressionism, and on every later painter who treats colour as a subject in itself, is large.`,
    },
  ],
};

const t2: Track = {
  id: 'art-movements-modern.t2',
  title: 'Expression and Fracture: 1905 to 1915',
  blurb: 'German Expressionism, Cubism and Futurism: new ways to show feeling, space and speed.',
  level: 'FOUNDATION',
  lessons: [
    {
      id: L05,
      title: 'Die Brücke: Expressionism in Dresden',
      blurb: "Four architecture students founded a German artists' group in 1905 and made raw, urgent prints and paintings.",
      minutes: 7,
      body: `In 1905, in Dresden, Ernst Ludwig Kirchner, Erich Heckel, Karl Schmidt-Rottluff and Fritz Bleyl, then students of architecture, founded an artists' group they called Die Brücke, German for "The Bridge." They hoped to bridge the old art and a new generation. Other artists, including Max Pechstein, joined later.

Their style is part of what we call Expressionism: art that distorts shape and colour to communicate inner feeling. They used harsh colour, jagged outlines and flattened space. They loved woodcut printing, which gives a bold, rough look, and they were interested in medieval German woodcuts and in objects from Africa and Oceania that they could see in Dresden's ethnographic museum. As with other European modernists, historians note that this borrowing was selective and often ignored the makers and meanings of those objects.

After moving to Berlin around 1911, the group painted the city: Kirchner's Street, Berlin (1913) shows women in sharp, angular forms, crowded and nervous. The group broke up in 1913 after disagreements.

Expressionist artists suffered under the Nazi government. In 1937 the Nazis staged the exhibition "Degenerate Art" in Munich, mocking modern art, and seized thousands of works from German museums; many Expressionists were included. Kirchner, who had had a mental breakdown after serving in the First World War, died by suicide in 1938.

Look for three signs of the Brücke look: strong colour not copied from nature, rough or angular line, and a mood of tension.`,
    },
    {
      id: L06,
      title: 'Der Blaue Reiter: Colour, Spirit and Abstraction',
      blurb: 'In Munich, Kandinsky and Marc led an Expressionist circle drawn to music, spirit and abstraction.',
      minutes: 7,
      body: `Der Blaue Reiter ("The Blue Rider") was a loose circle of artists in Munich, formed in 1911 around Wassily Kandinsky (1866 to 1944) and Franz Marc (1880 to 1916). They published an almanac in 1912 mixing modern paintings with children's art, folk art and non-European works, to argue that art could express inner life across all cultures. Gabriele Münter, August Macke and Paul Klee were among the artists connected with the group.

Marc painted animals in bold, symbolic colour; in his view, blue suggested a spiritual or masculine quality, and animals offered a purer vision than humans. His Blue Horses was painted in 1911. Kandinsky wrote Concerning the Spiritual in Art, published around the end of 1911, which compared painting to music: colour and shape could move the viewer without depicting anything. Around 1910 to 1913 he painted works that are among the earliest abstract pictures shown to the public.

"First abstract artist" is contested. The Swedish artist Hilma af Klint (1862 to 1944) began painting abstract works around 1906 and reportedly asked that they not be shown publicly until long after her death. They reached a wide public only in recent decades. Historians now generally treat abstraction as emerging in several places, not from one genius.

The First World War ended the group. Macke was killed in 1914 and Marc at Verdun in 1916; Kandinsky, a Russian citizen, left Germany. Later he taught at the Bauhaus.

To understand Der Blaue Reiter, listen to a piece of music and then paint how it feels: that is their goal.`,
    },
    {
      id: L07,
      title: 'Cubism: Seeing From Many Sides',
      blurb: 'Picasso and Braque broke objects into shapes shown from several viewpoints at once.',
      minutes: 8,
      body: `Cubism was developed in Paris by Pablo Picasso (1881 to 1973) and Georges Braque (1882 to 1963), who worked closely from about 1908 until the First World War. The name came from a critic's remark, reportedly by Louis Vauxcelles, that Braque's paintings were full of little cubes.

The core idea: instead of showing an object from one fixed viewpoint, show several views together. A guitar's front, side and the space around it are broken into overlapping flat planes. Cézanne's treatment of form was an important influence. Picasso's Les Demoiselles d'Avignon (1907) is often seen as a turning point. Its angular figures and mask-like faces drew on Iberian sculpture and, according to many historians, on African and Oceanic objects, a use of other cultures' work that is also criticized as appropriation.

Art historians usually divide the movement into two phases. Analytic Cubism, to about 1912, is nearly monochrome, with browns and greys, and objects are so fragmented that they can be hard to identify. Synthetic Cubism, from about 1912, is brighter and simpler and uses collage. In Still Life with Chair Caning (1912), Picasso glued a piece of oilcloth printed with a chair-caning pattern onto the canvas: a real material stands in for a painted one.

Juan Gris and Fernand Léger took the language further, and Cubism influenced sculpture, design and architecture. Picasso's later Guernica (1937) uses a Cubist-influenced vocabulary to respond to the bombing of a Basque town during the Spanish Civil War.

To try it, draw a mug from above and from the side on one sheet, overlapping the two.`,
    },
    {
      id: L08,
      title: 'Futurism: Speed, Machines and Controversy',
      blurb: 'Italian Futurists celebrated modern speed; their politics are as important as their pictures.',
      minutes: 7,
      body: `On 20 February 1909 the Italian poet Filippo Tommaso Marinetti published "The Founding and Manifesto of Futurism" on the front page of the Paris newspaper Le Figaro, after an earlier printing in an Italian paper that month. It rejected museums and the past and praised speed, machines, youth and violence, including war. Painters and sculptors, among them Umberto Boccioni, Giacomo Balla, Carlo Carrà, Gino Severini and Luigi Russolo, soon joined.

Their aim was to show movement and energy. Balla's Dynamism of a Dog on a Leash (1912) repeats the legs and the leash many times in one image, like a multiple exposure, to suggest motion. Boccioni's bronze Unique Forms of Continuity in Space (1913) turns a striding figure into flowing, windswept forms. Futurist painters borrowed Cubist fragmentation but used it for dynamism instead of still lifes. The movement also produced performances, poetry, music, and architectural ideas.

Futurism has a troubling history. Marinetti glorified war and later supported Italy's Fascist movement and Mussolini. Boccioni died in 1916 after a fall from a horse during military training, one among many artists who died in the First World War. Historians still debate how to separate Futurism's artistic innovations from its politics. Many conclude that it cannot be fully separated: the same love of speed and force that inspired its pictures also supported its admiration for conflict.

A helpful question for any movement is "who benefited from its ideals?" Futurism's influence on later graphic design, advertising and kinetic art is large, but it should be taught with its ideology in view.`,
    },
  ],
};

const t3: Track = {
  id: 'art-movements-modern.t3',
  title: 'War, Dreams and Revolution: 1915 to 1930s',
  blurb: 'Dada, Surrealism, Suprematism, Constructivism and De Stijl: art as protest, the unconscious and utopian design.',
  level: 'INTERMEDIATE',
  lessons: [
    {
      id: L09,
      title: 'Dada: Art Against War and Reason',
      blurb: 'Dada began in neutral Zurich in 1916 as a protest against the First World War and the values that produced it.',
      minutes: 7,
      body: `In 1916, while the First World War raged across Europe, a group of writers and artists gathered in neutral Zurich, Switzerland. Hugo Ball, with Emmy Hennings, opened the Cabaret Voltaire, a nightclub that hosted noisy performances of poems, music and dance. Participants included Tristan Tzara, Hans Arp and Sophie Taeuber. They called their activity Dada. The word's origin is disputed, and the group itself seems to have enjoyed the confusion.

Dada was an anti-art movement. Its members believed that the reasoning, nationalism and "civilization" that led to the war's mass killing deserved mockery, not respect. They used chance, collage, nonsense and found objects. Dada groups soon formed in Berlin, Cologne, Hanover, New York and Paris. In Berlin, Hannah Höch and Raoul Hausmann made photomontages that cut up newspaper and magazine images to criticize politics and gender roles. Kurt Schwitters in Hanover made collages from rubbish, which he called Merz.

Marcel Duchamp (1887 to 1968), working in New York, developed the "readymade": an ordinary manufactured object chosen and presented as art. In 1917 he submitted a porcelain urinal, titled Fountain and signed "R. Mutt," to an exhibition of the Society of Independent Artists. It was not shown, and the original was lost; later replicas exist. Some historians have argued that the Baroness Elsa von Freytag-Loringhoven may have been involved, but Duchamp is the standard attribution.

Dada changed a basic question from "Is this well made?" to "What makes something art?" That question still drives much conceptual and contemporary art.`,
    },
    {
      id: L10,
      title: 'Surrealism: The Unconscious as Subject',
      blurb: 'Surrealists, led by André Breton, tried to bring dreams, chance and desire into art.',
      minutes: 8,
      body: `Surrealism grew from Dada in Paris. In 1924 the poet André Breton published the first Manifesto of Surrealism, defining it as a way of expressing thought free from reason's control. Breton was influenced by Sigmund Freud's ideas about dreams and the unconscious. The movement was a literary, political and artistic circle, and its members argued, joined and were expelled.

Artists used two broad strategies. One was automatism: making marks or writing without conscious control, hoping to reach hidden material. Max Ernst developed frottage, rubbing paper over textured surfaces to create images. The other was dream-like realism: precisely painted but impossible scenes. René Magritte's The Treachery of Images (1929) shows a pipe above the words "This is not a pipe," reminding viewers that a picture is not the thing itself. Salvador Dalí's The Persistence of Memory (1931) shows soft, melting watches in an empty landscape.

Women were often cast as muses by the male leaders, yet they were among the movement's strongest artists. Leonora Carrington, Remedios Varo, Dorothea Tanning and Meret Oppenheim, who made the fur-lined teacup Object in 1936, all produced important work. Breton admired the Mexican painter Frida Kahlo and called her art Surrealist; she is widely reported to have rejected that label, saying she painted her own reality.

Surrealism's influence reaches film, advertising and fashion. A good exercise is to write down a dream, pick one odd image from it, and draw it with care as if it were ordinary. That calm treatment of the strange is the Surrealist trick.`,
    },
    {
      id: L11,
      title: 'Suprematism and Constructivism: Art in the Russian Revolution',
      blurb: 'Russian avant-garde artists pursued pure abstraction and art built for a new society.',
      minutes: 8,
      body: `Before and after the Russian Revolution of 1917, Russian artists produced some of the most radical art in Europe. Kazimir Malevich (1879 to 1935) called his approach Suprematism, a language of pure geometric forms. His Black Square (1915) was shown at the exhibition "0.10" in Petrograd in December 1915, reportedly hung high in a corner of the room, the place where Russian homes traditionally put an icon. He meant it as a zero point from which art could begin again.

Constructivism took a different path. Its artists argued that art should be useful and built like engineering. Vladimir Tatlin's Monument to the Third International, a model made in 1919 and 1920, imagined a tilted spiral tower of iron and glass, planned to be taller than the Eiffel Tower. It was never built. Alexander Rodchenko worked in photography, posters and design, using steep angles and bold type. El Lissitzky's poster "Beat the Whites with the Red Wedge" (1919) used pure shapes as political propaganda in the civil war.

These artists were not simply decorating politics. Many believed that abstraction could help build a new society. In the 1930s the Soviet government under Stalin promoted Socialist Realism, a heroic, representational style, and suppressed the avant-garde. Malevich returned to figurative painting in his final years. Some of their ideas survived in graphic design and architecture worldwide.

When you look at a Constructivist poster, ask what it wants viewers to do. Its power lies in the combination of abstract form and direct instruction.`,
    },
    {
      id: L12,
      title: 'De Stijl: Order from Lines and Primary Colour',
      blurb: 'A Dutch group reduced art to straight lines, right angles and a few pure colours.',
      minutes: 7,
      body: `De Stijl, Dutch for "The Style," began in 1917 around the artist and writer Theo van Doesburg, with painters Piet Mondrian and Bart van der Leck, the architect J. J. P. Oud and the designer Gerrit Rietveld. They published a magazine of the same name. The Netherlands stayed neutral in the First World War, but the group shared a hope for harmony and order after a time of chaos.

Mondrian (1872 to 1944) called his theory neoplasticism. He limited painting to horizontal and vertical black lines, white and grey, and the primary colours red, yellow and blue, balanced in an asymmetrical arrangement. The aim was a universal visual language, not tied to any particular object or place. His Composition paintings of the 1920s show this: a few rectangles, no illusion of depth. Moving to Paris, then London in 1938 and New York in 1940, he later made Broadway Boogie Woogie (1942 to 1943), where small coloured squares suggest city rhythm and jazz.

De Stijl reached beyond painting. Rietveld's Red and Blue Chair, designed in the late 1910s, is built from straight wooden planes and uses the same colour principles. His Schröder House in Utrecht (1924) applied them to architecture, with sliding walls and flat colour planes, and is now a UNESCO World Heritage site.

The group split around 1925 when van Doesburg introduced diagonals, which Mondrian rejected as breaking the system. This shows how seriously they treated their rules.

Try a simple experiment: arrange three coloured paper rectangles and black strips on white so that no part feels heavier than another. That is De Stijl's problem of balance.`,
    },
  ],
};

const t4: Track = {
  id: 'art-movements-modern.t4',
  title: 'The Americas and Mid-century: 1920s to 1960s',
  blurb: 'The Harlem Renaissance, Mexican muralism, Abstract Expressionism and Pop Art.',
  level: 'INTERMEDIATE',
  lessons: [
    {
      id: L13,
      title: 'The Harlem Renaissance: Black Artists and a New Image',
      blurb: 'In the 1920s and 1930s, Black artists, writers and musicians in New York redefined Black identity.',
      minutes: 8,
      body: `After the First World War, hundreds of thousands of Black Americans left the rural South for northern cities in the Great Migration, seeking work and escaping legal segregation and violence. Harlem, a neighbourhood in New York City, became a centre of Black cultural life. The Harlem Renaissance, which flourished mainly in the 1920s and into the 1930s, brought together writers, musicians and visual artists.

The philosopher Alain Locke edited the 1925 anthology The New Negro, which argued that Black artists should draw on African heritage and Black American experience, and not imitate white models. Aaron Douglas (1899 to 1979) developed a style of flat, layered silhouettes and concentric circles, influenced by Egyptian art and Art Deco, in illustrations and murals such as the Aspects of Negro Life series (1934) in Harlem. The sculptor Augusta Savage (1892 to 1962) created portraits and a large plaster work for the 1939 World's Fair, "Lift Every Voice and Sing"; it was destroyed after the fair, as it could not be afforded to cast in bronze. She also taught and organized for other artists. James Van Der Zee photographed Harlem families and funerals with elegance, and Palmer Hayden and Archibald Motley painted Black life with humour and dignity.

Jacob Lawrence (1917 to 2000), a younger artist who studied in Harlem, completed his 60-panel Migration Series in 1940 and 1941, telling the story of the Great Migration in bold flat colour.

Debates continue about the movement, including how much patrons and white audiences shaped it. A useful lesson: representation is itself an artistic act, because who makes the image decides how a community is seen.`,
    },
    {
      id: L14,
      title: 'Mexican Muralism: Public Art for a New Nation',
      blurb: 'After the Mexican Revolution, painters covered public walls with histories meant for everyone.',
      minutes: 8,
      body: `The Mexican Revolution began in 1910 and left the country seeking a shared story. In the early 1920s the education minister José Vasconcelos commissioned artists to paint murals on government buildings. Many Mexicans could not read, so images on walls could reach everyone. Three artists became known as "los tres grandes": Diego Rivera (1886 to 1957), José Clemente Orozco (1883 to 1949) and David Alfaro Siqueiros (1896 to 1974).

Rivera painted a large history of Mexico on the stairway of the National Palace in Mexico City, with Indigenous peoples, colonial conquest and revolution in bright, simplified forms. Orozco's work is darker and more skeptical about politics and violence. Siqueiros experimented with industrial materials such as spray guns and paint made for cars, and was jailed for political activity.

Mexican muralism travelled north. In 1932 and 1933 Rivera painted the Detroit Industry murals at the Detroit Institute of Arts, with commissions funded by Edsel Ford, showing factory work in monumental scenes. In 1933 Rivera's mural for Rockefeller Center in New York included a portrait of Lenin; it was removed and destroyed in 1934 after the controversy. Siqueiros ran a workshop in New York in 1936, where the young Jackson Pollock worked. American public art programs of the 1930s also drew inspiration from the muralists.

Critics note a tension: the muralists often idealized Indigenous heritage for a state-sponsored story while many Indigenous people remained poor. Ask of any public mural who paid for it, who is shown, and who is missing.`,
    },
    {
      id: L15,
      title: 'Abstract Expressionism: Scale, Gesture and Colour in New York',
      blurb: 'After the Second World War, New York painters made huge abstract works from gesture and fields of colour.',
      minutes: 8,
      body: `By the late 1940s many artists had fled wartime Europe, and New York began to replace Paris as the centre of avant-garde painting. The loose group now called Abstract Expressionism includes painters of very different methods, linked by abstraction, large scale, and an emphasis on emotion and individual creative act.

One strand is gesture. Jackson Pollock (1912 to 1956) laid canvas on the floor and poured and dripped paint from above, beginning in 1947, as in Autumn Rhythm (1950). The critic Harold Rosenberg, in 1952, called such work "action painting," seeing the canvas as an arena for an event. Willem de Kooning's slashing brushwork appears in Woman I (1950 to 1952), which keeps a figure inside the abstraction. Lee Krasner, Pollock's wife and an important painter herself, worked in her own powerful abstract language.

A second strand is colour field. Mark Rothko (1903 to 1970) painted large canvases with soft rectangles of colour that hover and glow, hoping viewers would respond emotionally, up close. Barnett Newman divided fields with narrow vertical "zips." Helen Frankenthaler, in Mountains and Sea (1952), soaked thinned paint into unprimed canvas, an influential technique.

Cold War politics complicate the story. Historians have documented that the CIA secretly funded the Congress for Cultural Freedom, which supported exhibitions of American art abroad, as a contrast to Soviet-style realism. How much that shaped the movement is debated. The movement was also overwhelmingly promoted as male and white; later scholars have worked to restore women and artists of colour.

If you visit a Rothko, stand close and give it a few minutes; the experience is part of the work.`,
    },
    {
      id: L16,
      title: 'Pop Art: Consumer Culture as Subject',
      blurb: 'British and American artists used ads, comics and celebrity images, and left it open whether they praised or criticized.',
      minutes: 8,
      body: `In the 1950s, mass media and consumer goods were spreading fast, especially in the United States. Pop Art took that world as its subject. In Britain the Independent Group, including Richard Hamilton, discussed advertising and science fiction. Hamilton's 1956 collage "Just what is it that makes today's homes so different, so appealing?" is often called an early Pop work: a modern living room full of consumer products and magazine images.

In the United States, Jasper Johns and Robert Rauschenberg had already mixed everyday objects into painting. Andy Warhol (1928 to 1987) began as a commercial illustrator. In 1962 his Campbell's Soup Cans, 32 canvases, one for each flavour then sold, were shown at the Ferus Gallery in Los Angeles. That year he began silkscreening photographs onto canvas, repeating images of celebrities such as Marilyn Monroe, as in Marilyn Diptych (1962), made soon after her death. Roy Lichtenstein (1923 to 1997) enlarged comic-strip frames with Ben-Day dots and flat colour, in works such as Whaam! (1963); critics noted that he borrowed from the drawings of comic artists, who were rarely credited. Claes Oldenburg made giant soft sculptures of food and household objects.

Pop invites debate. Does repeating a soup can celebrate consumer culture, criticize it, or simply report it? Does a silkscreened celebrity face mourn or exploit? Warhol deliberately gave few explanations. Pop also blurred "high" and "low" art, and its mix of art, fame and business influenced later artists.

A good exercise: choose a product from your kitchen and ask what a repeated image of it says.`,
    },
  ],
};

const t5: Track = {
  id: 'art-movements-modern.t5',
  title: 'Ideas, Bodies and Land: 1960s and 1970s',
  blurb: 'Minimalism, Conceptual art, Op and Kinetic art, Land art, Performance and Feminist art: art questions its own materials, objects and audiences.',
  level: 'ADVANCED',
  lessons: [
    {
      id: L17,
      title: 'Minimalism: Objects Without Illusion',
      blurb: 'Minimalists made plain, industrial forms that ask viewers to notice the object and the room.',
      minutes: 8,
      body: `By the mid-1960s some New York artists reacted against the emotional gesture of Abstract Expressionism by making work that was plain, geometric and often industrially fabricated. They were later grouped as Minimalists, though many disliked the label. Donald Judd's 1965 essay "Specific Objects" argued for work that was neither painting nor sculpture in the traditional sense, but a real object occupying real space.

Judd (1928 to 1994) made stacks and rows of boxes in metal, repeated at equal intervals. Dan Flavin made works from commercially bought fluorescent light tubes, beginning in 1963; the light spills into the room and changes how the space feels. Carl Andre arranged identical bricks or metal plates on the floor; his Equivalent VIII, a rectangle of firebricks bought by the Tate Gallery, caused a press controversy in 1976 when newspapers mocked it as a "pile of bricks." Robert Morris and Sol LeWitt also worked in this territory, and Frank Stella's black striped paintings pursued flatness on canvas.

What do such works ask? The critic Michael Fried, in his 1967 essay "Art and Objecthood," attacked what he called their theatricality: the work seems to need the viewer's presence and movement. Minimalists welcomed that idea. A box has no hidden meaning to decode; your experience of walking around it is the point.

Judd later set up large permanent installations of his work in Marfa, Texas. Minimalism also had political and economic implications: industrial fabrication challenged the myth of the artist's hand.

To test it, walk around a simple object, a cube or a door, and notice how your view changes. That attention is the Minimalist subject.`,
    },
    {
      id: L18,
      title: 'Conceptual Art: When the Idea Is the Art',
      blurb: 'Conceptual artists treated the idea, instruction or language as the work, not a finished object.',
      minutes: 8,
      body: `In the later 1960s a number of artists began to argue that the main part of an artwork is the idea. Sol LeWitt, in his 1967 essay "Paragraphs on Conceptual Art," wrote that "the idea becomes a machine that makes the art." His own wall drawings are often executed by other people from written instructions: the same plan can be drawn in different places and by different hands, and it remains his work.

Joseph Kosuth's One and Three Chairs (1965) presents a real chair, a photograph of that chair and an enlarged dictionary definition of "chair." Which one is the artwork? The piece asks what it means to represent something, and whether looking is the same as understanding. Lawrence Weiner wrote short statements of materials and actions, and Yoko Ono's book Grapefruit (1964) offered instructions for imagined acts. The critics Lucy Lippard and John Chandler described the trend in a 1968 essay called "The Dematerialization of Art." Marcel Duchamp's readymades were an important precedent.

Conceptual art raises practical questions. If the work is an idea, what does a collector buy? Often a certificate or a set of instructions, and the right to realize the work. Who is the author when assistants carry it out? Is a photograph of the work the work? Museums and archives have had to develop new ways to preserve and exhibit such pieces.

Many viewers find this art frustrating because it can seem to have nothing to look at. A useful approach is to read the instruction and carry it out mentally. The viewer's thinking then completes the work.`,
    },
    {
      id: L19,
      title: 'Op Art and Kinetic Art: Vision and Motion',
      blurb: 'Op artists used patterns to trick perception; kinetic artists built work that moves.',
      minutes: 7,
      body: `Op Art, short for optical art, uses precise patterns and contrasts to make the eye perceive vibration, glowing or movement that is not physically there. The name appeared in the press in 1964, and the exhibition "The Responsive Eye," organized by William Seitz at the Museum of Modern Art in New York in 1965, brought it to wide attention. Victor Vasarely (1906 to 1997), a Hungarian-born artist working in France, used grids of shapes that appear to swell or dip. Bridget Riley (born 1931) in Britain painted waving black and white lines, as in Current (1964), that can make viewers feel slightly dizzy.

Why does this happen? Our visual system responds strongly to high contrast and repeated edges, and tiny eye movements make the pattern seem to shimmer. The artwork is partly completed inside the viewer's perception. Op Art was quickly adopted in fashion, advertising and graphic design, and some artists disliked how fast their ideas were turned into commercial patterns.

Kinetic art includes work that actually moves. Naum Gabo made a motorized vibrating rod in 1919 and 1920. Alexander Calder's mobiles, from the 1930s, balance in air and respond to drafts. Jean Tinguely built machines, and his Homage to New York (1960), a self-destroying construction, partly malfunctioned in the garden of the Museum of Modern Art. Later artists used light, magnets, motors and, eventually, computers.

Both approaches change the question from "what does this picture show?" to "what is happening to me as I look?" Try staring at a high-contrast pattern for half a minute and note what happens at its edges.`,
    },
    {
      id: L20,
      title: 'Land Art: Sculpture Beyond the Gallery',
      blurb: 'Artists in the late 1960s moved out of museums to shape deserts, lakes and fields.',
      minutes: 8,
      body: `By the late 1960s some artists wanted work that could not be bought and hung on a wall. They left the gallery for remote landscapes, mostly in the American West, and made earthworks. The works are huge, can take years to change, and are often visited by only a small number of people. Photographs and film extend their reach.

Robert Smithson (1938 to 1973) built Spiral Jetty in April 1970 on the Great Salt Lake in Utah: a coil of black basalt rock and earth, about 1,500 feet long, curling into reddish water. The lake level rose and fell over the following decades, sometimes hiding the jetty and sometimes exposing it, which Smithson would have recognized as part of the work's concern with change and decay. Michael Heizer's Double Negative (1969) is two huge cuts in a mesa edge in Nevada, a sculpture made by removing hundreds of thousands of tons of rock. Walter De Maria's The Lightning Field (1977) in New Mexico is a grid of 400 stainless steel poles that viewers visit overnight. Christo and Jeanne-Claude wrapped buildings and landscapes in fabric, including the Reichstag in Berlin in 1995, and funded their projects themselves.

Land art raises ethical questions. Many of these places are sacred or home to Indigenous communities, and the artists, mostly from outside, treated them as empty. Moving large amounts of earth also has environmental costs. Some recent artists, such as Andy Goldsworthy, work with natural materials that disappear on their own.

Ask of any such work: what happens when the work leaves the museum and its setting becomes part of it?`,
    },
    {
      id: L21,
      title: 'Performance Art: The Body as Medium',
      blurb: 'Artists made time, action and their own bodies into artworks.',
      minutes: 8,
      body: `Performance art uses the artist's body and actions, in a particular place and time, as the work. Its roots include Dada cabarets and Futurist events, but it expanded greatly in the 1950s and 1960s. In Japan the Gutai group, formed in 1954, made action-based work. Allan Kaprow, in 1959, staged "18 Happenings in 6 Parts" in New York, in which audiences moved between rooms for loosely scripted events, and popularized the word "Happening." Fluxus, an international network, produced simple instruction-based events.

Yoko Ono's Cut Piece (first performed in 1964 in Kyoto and repeated in New York in 1965) had her sit still while audience members cut pieces from her clothing, exposing questions of consent, gender and power. Joseph Beuys, in I Like America and America Likes Me (1974), spent several days in a New York gallery with a wild coyote. In Rhythm 0 (1974, Naples), Marina Abramović, by her account, stood passively for six hours with 72 objects on a table that audience members could use on her, and the experiment revealed how some visitors escalated their actions. Chris Burden's Shoot (1971) had a friend shoot him in the arm.

Such works pose practical questions. Performance is live and disappears, so documentation by photograph and film shapes how it is remembered, though the document is not the event. Risk raises ethical issues about artist safety and audience responsibility. Reperformance by museums, as with Abramović's own later work, asks whether a work can exist without its original moment.

A way into any performance piece is to ask what the audience is invited, or allowed, to do.`,
    },
    {
      id: L22,
      title: 'Feminist Art: Who Gets to Make and Be Seen',
      blurb: 'From the 1960s, feminist artists challenged art history and the art world, and widened its materials and subjects.',
      minutes: 8,
      body: `The women's movement of the 1960s and 1970s led many artists to ask why women were so rarely shown in museums and history books. In 1971 the art historian Linda Nochlin published the essay "Why Have There Been No Great Women Artists?" Her answer was that institutions, such as who could study from nude models or enter academies, not lack of talent, explained the gap.

Artists answered with new work. Judy Chicago's The Dinner Party (1974 to 1979) is a triangular table with 39 place settings honouring mythical and historical women, resting on a floor inscribed with 999 more names. It draws on crafts such as china painting and embroidery, long dismissed as "women's work," and was made with the help of many volunteers. It is now at the Brooklyn Museum. Critics have argued that its imagery treats women's identity as biological and that its history centres white women. Mierle Laderman Ukeles's 1969 "Manifesto for Maintenance Art!" proposed that the unpaid daily work of care and cleaning deserved attention as art. Carolee Schneemann and Ana Mendieta used their own bodies in performance and film; Faith Ringgold made story quilts about Black women's lives.

In 1985 an anonymous group, the Guerrilla Girls, began wearing gorilla masks and posting statistics on the poor representation of women and artists of colour in major museums. A well-known 1989 poster asked whether women had to be naked to get into the Metropolitan Museum, noting that few of the artists in its modern sections were women while most nudes were female.

Feminist art also changed which materials and subjects counted as serious. A good question to ask of any collection: who is represented, and who decided?`,
    },
  ],
};

const t6: Track = {
  id: 'art-movements-modern.t6',
  title: 'Postmodern to Present: 1970s to Today',
  blurb: 'Photorealism, Neo-Expressionism, postmodern appropriation, street art, digital art, global contemporary art and the art market.',
  level: 'ADVANCED',
  lessons: [
    {
      id: L23,
      title: 'Photorealism: Painting Like a Camera',
      blurb: 'Photorealists made paintings from photographs with extreme precision, and asked what is real in an image.',
      minutes: 7,
      body: `At the end of the 1960s and in the 1970s, as Minimalism and Conceptual art moved away from painting's old skills, a group of mostly American painters did the opposite. They worked from photographs and produced canvases so precise they can be mistaken for the photographs themselves. The dealer Louis K. Meisel helped popularize the name Photorealism.

The method usually began with a camera. Painters might project a slide onto canvas or transfer it by a grid, then reproduce every detail by hand, sometimes with an airbrush. Chuck Close (1940 to 2021) painted enormous faces from head-shot photographs, such as Big Self-Portrait (1967 to 1968), in which every pore and stray hair is as sharp as an identification photograph, though the painting is much larger than life. Richard Estes painted New York storefronts full of reflections in glass, a subject where the camera's flattening of space is itself the point. Ralph Goings painted diners and pickup trucks. Audrey Flack's Marilyn (Vanitas) (1977) combined tabletop objects, including fruit and cosmetics, in a sharply lit still life reminiscent of Dutch vanitas paintings about the passing of time.

Critics asked whether the movement merely copied a copy. Supporters answered that these paintings reveal how photographs flatten, edit and glamorize the world, and that the labour of painting changes our attention. The German painter Gerhard Richter, often discussed alongside the topic, took a different approach, blurring photographic images deliberately.

Ask of any photorealist painting: why spend months making by hand something a camera can produce in a second? The answer is often about looking, not just copying.`,
    },
    {
      id: L24,
      title: 'Neo-Expressionism and Postmodernism',
      blurb: 'In the late 1970s and 1980s, painting returned in loud form while other artists questioned originality itself.',
      minutes: 8,
      body: `Two overlapping trends marked the late 1970s and 1980s. The first, Neo-Expressionism, was a return to large, rough, emotional painting with recognizable figures, after years of Minimalist and Conceptual restraint. In Germany Georg Baselitz painted figures upside down, beginning in 1969, and Anselm Kiefer (born 1945) used straw, ash and lead to confront Germany's Nazi past. In the United States Julian Schnabel built paintings on broken plates, and Jean-Michel Basquiat (1960 to 1988), who began as a graffiti writer, combined words, crowns, masks and figures in dense, urgent canvases. In Italy the critic Achille Bonito Oliva promoted a related trend called the Transavanguardia. The 1980s art market boomed, and critics debated whether this painting's success was driven by sales.

The second trend, Postmodernism, is a wider attitude: scepticism toward claims of originality, progress and a single grand story of art. Many artists turned to appropriation, deliberately borrowing existing images. Cindy Sherman's Untitled Film Stills (1977 to 1980), about 70 black and white photographs in which she poses as imagined women from old movies, examines how female stereotypes are constructed. Sherrie Levine rephotographed photographs by Walker Evans in 1981 under the title After Walker Evans, questioning authorship. Barbara Kruger combined found photographs with bold text, and Jenny Holzer used short sentences called Truisms on signs and posters.

The term Postmodernism is slippery, and scholars disagree about its start and its definition. A practical way to use it: whenever an artwork quotes, remixes or comments on earlier images, ask what the borrowing says.`,
    },
    {
      id: L25,
      title: 'Street Art and Graffiti: Art Without Permission',
      blurb: 'Writing and painting on city walls grew from local tagging into a global art form, with unresolved arguments about legality.',
      minutes: 8,
      body: `Modern graffiti is usually traced to Philadelphia in the late 1960s, where a teenager who called himself Cornbread wrote his name around the city. In New York in 1971 the New York Times ran a story on "TAKI 183," a messenger who tagged his name widely, which encouraged many imitators. Through the 1970s, young writers, many from poor neighbourhoods, covered subway cars with elaborate colourful lettering, developing styles and rivalries. New York's transit authority spent years and heavy funds scrubbing trains, and by 1989 it had succeeded in removing painted trains from service.

Not all of this was seen as art. For city authorities it was vandalism, and in most places it remains illegal when done without permission. Many artists answered that walls in neglected neighbourhoods were also public space. In the early 1980s Keith Haring drew in chalk on unused black advertising panels in subway stations, and Jean-Michel Basquiat, with Al Diaz, wrote enigmatic SAMO messages on Manhattan walls in the late 1970s. Both soon entered galleries.

Later, stencil and poster artists spread the idea worldwide. Banksy, an anonymous artist from Bristol, England, became known for witty stencils. In 2018 his Girl with Balloon was sold at Sotheby's for about 1.04 million pounds and partly shredded itself by a hidden device in its frame as the sale was completed. Shepard Fairey's 2008 Hope poster of Barack Obama led to a legal dispute with the Associated Press over the source photograph, which was settled in 2011.

A useful question is who decides which writing on a wall is crime and which is culture, and whether permission changes what the work means.`,
    },
    {
      id: L26,
      title: 'Digital and New-Media Art',
      blurb: 'Artists have used video, computers, networks and now AI as tools and as subjects.',
      minutes: 8,
      body: `New-media art uses technologies that were not made for art: television, computers, the internet and software. Nam June Paik (1932 to 2006), a Korean-born artist often called a founder of video art, exhibited altered television sets in Wuppertal, Germany, in 1963 and later made works such as TV Buddha (1974), in which a statue watches its own image on a camera feed. In the 1960s early computer art appeared: Frieder Nake and Georg Nees in Germany and A. Michael Noll in the United States made drawings with plotters. Vera Molnár (1924 to 2023) began using a computer in 1968 to explore variations of geometric forms. Harold Cohen developed AARON, a program that made drawings, from the early 1970s. In 1979 the Ars Electronica festival began in Linz, Austria.

In the 1990s, net art used the web itself as a medium. The 2010s brought a new question about ownership. An NFT, or non-fungible token, is a blockchain record that points to a file. In March 2021 Christie's sold Everydays: The First 5000 Days, a collage by the digital artist Beeple (Mike Winkelmann), for about 69.3 million dollars. Prices of NFTs later fell sharply, and the value of the format remains disputed.

Generative artificial intelligence raises further debates. In 2018 Christie's sold the AI-made Portrait of Edmond de Belamy for 432,500 dollars. In 2022 an image made with the help of the program Midjourney won a digital-art category at the Colorado State Fair. Questions of authorship, the training of models on existing artists' work and copyright are being argued in courts and studios.

When you meet a new-media work, ask what the technology is doing: is it a tool, a subject, or both?`,
    },
    {
      id: L27,
      title: 'Contemporary Global Art',
      blurb: 'Since the 1980s the art world has widened beyond Europe and North America, and questioned who sets its terms.',
      minutes: 8,
      body: `For much of the twentieth century, the story of modern art was told as a story of Paris and New York. Since the 1980s artists, curators and scholars have challenged this. Large international exhibitions, called biennials, have multiplied: Venice has hosted one since 1895, São Paulo since 1951, Havana since 1984 and Gwangju in South Korea since 1995. Documenta, in Kassel, Germany, has been held roughly every five years since 1955. The 1989 Paris exhibition "Magiciens de la Terre," curated by Jean-Hubert Martin, showed artists from across the world together, but was criticized for how it framed non-Western artists. In 2002 the Nigerian-born curator Okwui Enwezor directed Documenta 11, the first non-European artistic director of that show.

Some examples: Ai Weiwei (born 1957) filled the Tate Modern's Turbine Hall in 2010 with about 100 million hand-painted porcelain sunflower seeds, made by artisans in Jingdezhen, to reflect on mass production and individual labour; he was detained by Chinese authorities in 2011. Yayoi Kusama (born 1929) makes polka-dot environments and Infinity Mirror Rooms. El Anatsui, born in Ghana and based in Nigeria, makes shimmering wall-hangings from flattened bottle caps and wire. Kara Walker uses cut-paper silhouettes to confront the history of slavery in the United States. Kehinde Wiley painted Barack Obama's official portrait, unveiled in 2018.

The term "global" is itself debated. It can describe real exchange, but it can also hide unequal power, since wealthy institutions still decide whose work travels. Ask who is organizing an international show and for whom.`,
    },
    {
      id: L28,
      title: 'Art and Markets: Who Decides What Is Worth What',
      blurb: 'Dealers, auctions, fairs and collectors shape what art is seen and valued.',
      minutes: 8,
      body: `Art is bought and sold in two linked markets. In the primary market, galleries sell new work directly from artists, usually sharing the price. In the secondary market, collectors resell work, often at auction houses such as Sotheby's, founded in 1744, and Christie's, founded in 1766. Dealers have shaped careers: Ambroise Vollard promoted Cézanne with an exhibition in 1895, and Daniel-Henry Kahnweiler supported Picasso and Braque. Today art fairs, such as Art Basel, first held in 1970, bring many galleries together for a few days.

What sets price? Several factors: the artist's reputation, scarcity, condition, size, exhibition history, critical attention and provenance, meaning the record of ownership. In November 2017 a painting sold at Christie's in New York as Salvator Mundi, attributed to Leonardo da Vinci, achieved 450.3 million dollars including fees, a record auction price for any artwork at the time. Some scholars dispute how much of the painting is by Leonardo, which illustrates how attribution can drive value.

The market raises ethical questions. Artists often earn little from resales; many countries have a resale royalty for artists, but the United States generally does not. Works looted during the Nazi era have prompted decades of claims, and in 1998 dozens of countries endorsed the Washington Principles on Nazi-confiscated art, a non-binding framework for fair solutions. Museums also face claims over objects taken during colonial rule. And because prices can be high and privately set, some critics worry about speculation and opaque deals.

A useful distinction: price tells you what someone paid, not whether the work is good. To read a headline price, ask who paid it, who gained, and what story the sale tells.`,
    },
  ],
};

const questions: Question[] = [
  // L01
  mc(L01, 1, 1, "Which invention, announced in 1839, led many artists to rethink what painting was for?", ["Photography", "The telephone", "The printing press", "Oil paint"], "It could record a face faster than any painter.", "Photography could record appearances quickly, pushing many painters toward colour, emotion and ideas."),
  tf(L01, 2, 1, "The labels for art movements, such as Fauvism, were always chosen by the artists themselves.", 1, "Think about where the name Fauves came from.", "Many movement names were given by critics, sometimes as insults."),
  mc(L01, 3, 2, "Why did the Impressionists organize their own exhibition in 1874?", ["They did not want to depend on the official Salon's approval", "The Salon had been closed by law after a government decree in 1873", "They wanted to sell photographs", "They were all students"], "Think about who controlled access to audiences.", "Independent shows let artists present work without waiting for official juries."),
  tf(L01, 4, 2, "A painting that uses flat colour instead of realistic shading is therefore a failed attempt at realism.", 1, "Consider what the artist might be asking instead.", "Modern artists often chose flat colour on purpose to pursue different questions."),
  mc(L01, 5, 3, "Which statement best describes how movements relate to individual artists?", ["Movements overlap, and many artists changed direction or belonged to none", "Every artist belongs to exactly one movement for the whole of his or her working life", "Movements never overlap in time", "Movements are named by museums before they begin"], "The lesson gave two cautions about labels.", "Labels are applied later and overlap, so artists often do not fit one box."),

  // L02
  mc(L02, 1, 1, "Which Post-Impressionist painted repeated views of Mont Sainte-Victoire?", ["Paul Cézanne", "Georges Seurat", "Vincent van Gogh", "Paul Gauguin"], "He lived near Aix-en-Provence.", "Cézanne painted the mountain many times, building form from patches of colour."),
  tf(L02, 2, 1, "Georges Seurat built images from small dots of colour that blend in the viewer's eye.", 0, "Think of pointillism.", "Seurat placed small dots side by side so that the eye mixes them from a distance."),
  mc(L02, 3, 2, "Why is Gauguin's Tahitian work debated today?", ["It presents a colonial, exoticizing view, and his relationships with young girls there were exploitative", "He never visited Tahiti", "He used only photographs", "He painted only in black and white"], "The debate is about perspective and conduct.", "Critics point to the colonial gaze of the work and to his exploitative relationships."),
  mc(L02, 4, 2, "Which statement best describes the Post-Impressionists as a group?", ["They shared no single style; each emphasized a different element of painting", "They all used pointillism, the technique of tiny dots of pure colour, throughout their careers", "They all lived in Tahiti", "They all signed one manifesto"], "The label came later, from a critic.", "Roger Fry's label covers painters with different aims, such as structure, feeling, flatness and colour science."),
  tf(L02, 5, 3, "Cézanne's way of building form from planes of colour influenced the Cubists.", 0, "Think about what Picasso and Braque learned from earlier painters.", "Cubists drew on Cézanne's treatment of a scene as a structure of shapes."),

  // L03
  mc(L03, 1, 1, "Symbolist art mainly favours which kind of subject?", ["Dreams, myth and inner feeling", "Exact copies of busy city streets", "Advertising slogans and posters", "Machines, factories and high speed"], "Think of mystery rather than description.", "Symbolists wanted to suggest ideas and emotions rather than describe things plainly."),
  tf(L03, 2, 1, "The Scream exists only as a single painting.", 1, "Munch returned to the image in several media.", "Munch made paintings, pastels and a lithograph of The Scream."),
  mc(L03, 3, 2, "Which artist is known for dark charcoal drawings he called his noirs?", ["Odilon Redon", "Gustav Klimt", "Gustave Moreau", "Edvard Munch"], "He later turned to luminous pastel and oil.", "Redon first became known for his noirs, then turned to rich colour."),
  mc(L03, 4, 2, "In 1886, Jean Moréas published a Symbolist manifesto where?", ["In the newspaper Le Figaro", "In a Dresden woodcut portfolio", "On posters on the walls of Petrograd", "In a Zurich cabaret programme"], "It began as a literary movement.", "Symbolism began in literature, with a manifesto in Le Figaro."),
  tf(L03, 5, 3, "Symbolism's belief that pictures can show inner experience was inherited by Expressionism and Surrealism.", 0, "Consider where later movements found their ideas.", "Both later movements continued the Symbolist focus on inner life."),

  // L04
  mc(L04, 1, 1, "Where were the Fauves first shown together in 1905?", ["The Salon d'Automne in Paris", "The Armory Show in New York City", "The Cabaret Voltaire in Zurich", "A Munich almanac published in 1912"], "It was a Paris exhibition held each year.", "The 1905 Salon d'Automne room gave the group its name."),
  tf(L04, 2, 1, "In Fauvism, colour did not have to match the real colour of the thing painted.", 0, "Remember the green and orange strokes on a face.", "Fauves used colour to build structure and mood, not to report appearance."),
  mc(L04, 3, 2, "Which painter led the Fauves and later made paper cut-outs?", ["Henri Matisse", "Pablo Picasso", "Franz Marc", "Piet Mondrian"], "He made Woman with a Hat in 1905.", "Matisse was the leading Fauve and made cut-outs late in life."),
  mc(L04, 4, 2, "Roughly how long did Fauvism last as a recognizable movement?", ["A few years, to about 1907 or 1908", "About fifty years, until the 1950s or so", "Only one week, during a single exhibition", "More than a century, into the 2000s"], "It was never a formal organization.", "The Fauves scattered after only a few years."),
  mc(L04, 5, 3, "What is the best summary of Fauvism's lasting influence?", ["It treated colour as a subject in itself", "It proved that linear perspective is required in all painting", "It banned bright colour", "It replaced painting with sculpture"], "Think about what Fauves freed colour to do.", "Later painters, including Expressionists, inherited the freedom to use colour expressively."),

  // L05
  mc(L05, 1, 1, "Die Brücke was founded in which city?", ["Dresden", "Paris, in Montmartre", "Zurich, at a cabaret", "Moscow, near Red Square"], "It was in Germany, in 1905.", "Four students founded the group in Dresden in 1905."),
  tf(L05, 2, 1, "The founders of Die Brücke were originally students of architecture.", 0, "Think about their training before art.", "The founding members were architecture students."),
  mc(L05, 3, 2, "Which medium did Die Brücke artists especially love for its rough, bold look?", ["Woodcut printing", "Marble carving", "Stained glass", "Oil pastel on silk"], "Think of medieval German prints.", "They revived woodcuts for their bold, jagged look."),
  mc(L05, 4, 2, "What was the 1937 exhibition \"Degenerate Art\"?", ["A Nazi show mocking modern art, which included many Expressionists", "A celebration of Expressionism organized by leading German state museums", "A Dada performance in Zurich", "An exhibition of Soviet posters"], "It was staged by a government, not the artists.", "The Nazi government seized modern works and displayed them to ridicule them."),
  tf(L05, 5, 3, "Historians note that Die Brücke's interest in African and Oceanic objects often ignored the makers and meanings of those objects.", 0, "Think about selective borrowing.", "The borrowing was selective and often disregarded context, a point scholars raise about many modernists."),

  // L06
  mc(L06, 1, 1, "Which two artists were central to Der Blaue Reiter in Munich?", ["Kandinsky and Marc", "Matisse and Derain", "Picasso and Braque", "Duchamp and Ball"], "One painted blue horses.", "Wassily Kandinsky and Franz Marc led the circle."),
  tf(L06, 2, 1, "Kandinsky compared painting to music in Concerning the Spiritual in Art.", 0, "Think of colour and shape moving viewers without depiction.", "He argued colour and form could move people the way music does."),
  mc(L06, 3, 2, "Why is the phrase \"first abstract artist\" contested?", ["Hilma af Klint was painting abstract works around 1906 too", "Abstract art did not exist until 1950", "Kandinsky never painted in an abstract style at any point in his life", "Marc invented it in 1916"], "Another artist began earlier, in Sweden.", "Af Klint's early abstract paintings show abstraction emerged in several places."),
  mc(L06, 4, 2, "What happened to the group during the First World War?", ["Macke and Marc were killed, and the group ended", "It moved to New York and held its next show there in 1915", "It merged with the Fauves", "It won a national prize"], "Think about the dates 1914 to 1916.", "Macke was killed in 1914 and Marc in 1916, and the circle broke up."),
  tf(L06, 5, 3, "The 1912 almanac mixed modern paintings with children's art, folk art and non-European works.", 0, "Consider the group's claim about inner life across cultures.", "The almanac argued for a shared expressive impulse across cultures and ages."),

  // L07
  mc(L07, 1, 1, "Who developed Cubism in Paris?", ["Pablo Picasso and Georges Braque", "Henri Matisse and André Derain", "Ernst Kirchner and Erich Heckel", "Kazimir Malevich and Vladimir Tatlin"], "They worked closely from about 1908.", "Picasso and Braque developed the style together."),
  tf(L07, 2, 1, "Cubism shows an object from several viewpoints at once.", 0, "Think about the mug drawn from above and the side.", "The core idea is combining multiple views in one image."),
  mc(L07, 3, 2, "What distinguishes Synthetic Cubism from Analytic Cubism?", ["It is brighter and simpler and uses collage", "It is nearly monochrome and very fragmented", "It uses only sculpture", "It was made before 1905"], "Think of the oilcloth in Still Life with Chair Caning.", "Synthetic Cubism, from about 1912, introduced collage and brighter colour."),
  mc(L07, 4, 2, "What did Picasso attach in Still Life with Chair Caning (1912)?", ["Oilcloth printed with a chair-caning pattern", "A real wooden chair", "A photograph of his studio and several of his friends", "A page of music"], "A printed material stood in for a painted one.", "The oilcloth is a real material used in place of painting the pattern."),
  tf(L07, 5, 3, "Les Demoiselles d'Avignon is criticized by some historians for its use of non-European art.", 0, "Consider the debate about appropriation.", "Its mask-like faces drew on Iberian and, per many historians, African and Oceanic objects, which raises appropriation questions."),

  // L08
  mc(L08, 1, 1, "In which newspaper was the Futurist Manifesto published in 1909?", ["Le Figaro", "The New York Times", "Pravda", "Der Spiegel"], "A Paris paper.", "Marinetti's manifesto appeared on the front page of Le Figaro on 20 February 1909."),
  tf(L08, 2, 1, "Futurists wanted to celebrate speed, machines and modern life.", 0, "Think of Balla's dog on a leash.", "They aimed to show movement and energy."),
  mc(L08, 3, 2, "How did Balla suggest motion in Dynamism of a Dog on a Leash?", ["By repeating the legs and leash many times", "By blurring the whole canvas with a thick layer of fog", "By painting one still pose", "By adding a clock"], "Compare it to a multiple exposure.", "Repeated forms show successive positions within a single image."),
  mc(L08, 4, 2, "Which statement about Futurism's politics is accurate?", ["Marinetti glorified war and later supported Italian Fascism", "The Futurists were pacifists", "Futurism opposed all machines and urged people to return to the countryside", "It was banned by Mussolini in 1909"], "Think about the troubling side of the movement.", "Marinetti praised war and later backed Mussolini's movement."),
  tf(L08, 5, 3, "Historians agree that Futurism's art can be fully separated from its politics.", 1, "The lesson says many conclude otherwise.", "Many historians argue the movement's aesthetics and ideology were closely linked, and the matter is debated."),

  // L09
  mc(L09, 1, 1, "Where did Dada begin in 1916?", ["Zurich", "Berlin", "Vienna", "Rome"], "A neutral country during the war.", "Hugo Ball opened the Cabaret Voltaire in Zurich."),
  tf(L09, 2, 1, "Dada was a protest against the First World War and the values that led to it.", 0, "Think of the anti-art stance.", "Dada artists mocked the reasoning and nationalism they blamed for the war."),
  mc(L09, 3, 2, "What is a readymade?", ["An ordinary manufactured object chosen and presented as art", "A painting made in one day", "A statue made from marble", "A drawing carefully traced from a photograph and signed by a pupil"], "Think of Duchamp's Fountain.", "Duchamp's readymades made the act of selection the art."),
  mc(L09, 4, 2, "Which artist made photomontages critiquing politics and gender roles?", ["Hannah Höch", "Salvador Dalí", "Georges Seurat", "Piet Mondrian"], "She worked in Berlin.", "Höch and Raoul Hausmann made Dada photomontages in Berlin."),
  mc(L09, 5, 3, "What basic question did Dada help shift art toward?", ["What makes something art?", "Which paint is cheapest?", "How can a canvas be larger?", "Who owns the Louvre?"], "It moved from craft to concept.", "Dada changed the question from whether a work was well made to what makes something art."),

  // L10
  mc(L10, 1, 1, "Who published the first Manifesto of Surrealism in 1924?", ["André Breton", "Marcel Duchamp", "Tristan Tzara", "Max Ernst"], "A poet in Paris.", "Breton published it in 1924."),
  tf(L10, 2, 1, "Surrealists were influenced by Sigmund Freud's ideas about dreams and the unconscious.", 0, "Think about the source of the movement's subjects.", "Breton and others drew on Freud's work."),
  mc(L10, 3, 2, "What is automatism in Surrealism?", ["Making marks or writing without conscious control", "Printing with a machine", "Painting slowly and carefully from a live model in a studio", "Copying a photograph"], "It aims to reach hidden material.", "Automatism tries to bypass reasoning to reach the unconscious."),
  mc(L10, 4, 2, "Which work shows a pipe with the words \"This is not a pipe\"?", ["The Treachery of Images by Magritte", "The Persistence of Memory by Salvador Dalí", "Object, the fur teacup by Meret Oppenheim", "Guernica, the wartime mural by Picasso"], "It reminds viewers a picture is not the thing itself.", "Magritte's 1929 painting plays on the gap between image and object."),
  tf(L10, 5, 3, "Women Surrealists such as Leonora Carrington and Remedios Varo were significant artists, even though male leaders often cast women as muses.", 0, "Consider the gap between role and achievement.", "Their work is now recognized as central to the movement."),

  // L11
  mc(L11, 1, 1, "Which artist made Black Square (1915)?", ["Kazimir Malevich", "Alexander Rodchenko", "Wassily Kandinsky", "Piet Mondrian"], "He called his approach Suprematism.", "Malevich made Black Square in 1915."),
  tf(L11, 2, 1, "Tatlin's Monument to the Third International was built at full scale.", 1, "Only a model was made.", "It remained a model and was never built."),
  mc(L11, 3, 2, "What did Constructivists believe art should be?", ["Useful and built like engineering", "A private emotional diary of the artist", "A faithful copy of the natural world", "Limited to galleries and private museums"], "They served a new society.", "Constructivists argued for art that served practical and social purposes."),
  mc(L11, 4, 2, "What happened to the Russian avant-garde under Stalin in the 1930s?", ["It was suppressed in favour of Socialist Realism", "It became the official style of the Soviet state in the 1930s", "It moved to Zurich", "It was funded by Dada"], "A heroic, representational style was promoted.", "Socialist Realism replaced avant-garde abstraction as the official style."),
  tf(L11, 5, 3, "Many Russian avant-garde artists believed abstraction could help build a new society.", 0, "Think about why they supported the revolution.", "They saw abstract form as part of a new social order, not mere decoration."),

  // L12
  mc(L12, 1, 1, "Which colours did Mondrian use besides black, white and grey?", ["Red, yellow and blue", "Green, orange and purple", "Pink and brown", "Gold and silver"], "The primary colours.", "Neoplasticism used primary colours with black lines and white."),
  tf(L12, 2, 1, "De Stijl began in 1917 in the Netherlands.", 0, "The name means The Style in Dutch.", "Theo van Doesburg and others began it in 1917."),
  mc(L12, 3, 2, "Which building applied De Stijl principles to architecture?", ["The Schröder House in Utrecht", "The Eiffel Tower in Paris, France", "The Reichstag in Berlin, Germany", "The Spiral Jetty by the Great Salt Lake"], "Gerrit Rietveld designed it in 1924.", "The Schröder House is a De Stijl landmark and a UNESCO site."),
  mc(L12, 4, 2, "Why did Mondrian and van Doesburg split around 1925?", ["Van Doesburg introduced diagonals, which Mondrian rejected", "They disagreed about whether photography should replace painting", "Mondrian moved to Mexico", "They stopped using colour"], "A matter of line direction.", "Diagonals broke Mondrian's system of horizontals and verticals."),
  tf(L12, 5, 3, "Broadway Boogie Woogie uses small coloured squares to suggest the rhythm of the city.", 0, "Think of jazz and Manhattan.", "Mondrian made it in New York in 1942 to 1943, adapting his grid to city rhythm."),
];

const questions2: Question[] = [
  // L13
  mc(L13, 1, 1, "What was the Great Migration?", ["The movement of Black Americans from the rural South to northern cities", "A trade route across the Atlantic that carried goods between Europe and Africa", "A European art tour", "A wave of artists to Mexico"], "It brought many people to Harlem.", "Hundreds of thousands left the South seeking work and safety, shaping Harlem's cultural life."),
  tf(L13, 2, 1, "Alain Locke edited the 1925 anthology The New Negro.", 0, "He was a philosopher.", "The anthology argued that Black artists should draw on their own heritage and experience."),
  mc(L13, 3, 2, "Which artist made the 60-panel Migration Series in 1940 and 1941?", ["Jacob Lawrence", "Aaron Douglas", "Augusta Savage", "Archibald Motley"], "A younger artist who studied in Harlem.", "Lawrence told the story of the Great Migration in bold flat colour."),
  mc(L13, 4, 2, "Which sculptor made \"Lift Every Voice and Sing\" for the 1939 World's Fair?", ["Augusta Savage", "Meret Oppenheim", "Judy Chicago", "Sophie Taeuber"], "She also taught and organized other artists.", "Savage's plaster work was destroyed after the fair because it could not be cast in bronze."),
  tf(L13, 5, 3, "Scholars continue to debate how much patrons and white audiences shaped the Harlem Renaissance.", 0, "Consider who funded and bought the work.", "The influence of patrons and audiences is a live debate about the movement."),

  // L14
  mc(L14, 1, 1, "Who commissioned many early Mexican murals from the early 1920s?", ["Education minister Jose Vasconcelos", "Edsel Ford, the Detroit car manufacturer", "Andy Warhol, working in New York in the 1960s", "Andre Breton, the Surrealist poet and critic"], "A government official aimed at reaching people who could not read.", "Vasconcelos commissioned murals so public images could reach everyone."),
  tf(L14, 2, 1, "Diego Rivera, Orozco and Siqueiros were known as los tres grandes.", 0, "Three big names.", "These three were the leading muralists."),
  mc(L14, 3, 2, "What happened to Rivera's Rockefeller Center mural?", ["It was destroyed in 1934 after controversy over a Lenin portrait", "It was carefully moved to the Detroit Institute of Arts for permanent display", "It was finished in 1920", "It was bought by Siqueiros"], "A political image caused a dispute.", "The mural was removed and destroyed in 1934."),
  mc(L14, 4, 2, "Which Mexican muralist ran a New York workshop in 1936 where Jackson Pollock worked?", ["David Alfaro Siqueiros", "Diego Rivera, from Guanajuato", "Jose Clemente Orozco, of Jalisco", "Frida Kahlo, from Coyoacan"], "He used spray guns and car paint.", "Siqueiros experimented with industrial materials in his workshop."),
  tf(L14, 5, 3, "Critics note a tension in muralism: it idealized Indigenous heritage for a state story while many Indigenous people stayed poor.", 0, "Think about who paid and who benefited.", "The gap between imagery and conditions is a common criticism."),

  // L15
  mc(L15, 1, 1, "Which painter began pouring and dripping paint onto canvases on the floor in 1947?", ["Jackson Pollock", "Mark Rothko", "Andy Warhol", "Willem de Kooning"], "He made Autumn Rhythm in 1950.", "Pollock's poured method became the best-known form of action painting."),
  tf(L15, 2, 1, "Mark Rothko is known for colour field painting with soft, glowing rectangles.", 0, "He wanted viewers to respond emotionally up close.", "Rothko's hovering rectangles are a major example of colour field painting."),
  mc(L15, 3, 2, "Who coined the term \"action painting\" in 1952?", ["Harold Rosenberg", "Clement Greenberg", "Linda Nochlin", "William Seitz"], "A critic who saw the canvas as an arena.", "Rosenberg's essay described the canvas as a place for an event."),
  mc(L15, 4, 2, "What did Helen Frankenthaler do in Mountains and Sea (1952)?", ["Soaked thinned paint into unprimed canvas", "Glued newspaper photographs onto wooden boards", "Painted with comic dots", "Made a mural on a wall"], "A technique that influenced colour field painters.", "The soak-stain technique was widely influential."),
  tf(L15, 5, 3, "Historians have documented that the CIA secretly funded the Congress for Cultural Freedom, though how far this shaped Abstract Expressionism is debated.", 0, "Both parts are historical points.", "The funding is documented; the degree of its influence on the art is argued."),

  // L16
  mc(L16, 1, 1, "Which artist showed 32 Campbell's Soup Cans canvases at the Ferus Gallery in 1962?", ["Andy Warhol", "Roy Lichtenstein", "Richard Hamilton", "Claes Oldenburg"], "He silkscreened celebrities too.", "Warhol's 32 canvases matched the flavours then sold."),
  tf(L16, 2, 1, "Roy Lichtenstein enlarged comic-strip frames using Ben-Day dots.", 0, "Think of Whaam!", "Ben-Day dots and flat colour imitate printed comics."),
  mc(L16, 3, 2, "Which group in Britain discussed advertising and science fiction, and included Richard Hamilton?", ["The Independent Group", "Der Blaue Reiter in Munich", "De Stijl in the Netherlands", "The Guerrilla Girls of New York"], "Its name suggests freedom from institutions.", "The Independent Group helped lay the ground for Pop in Britain."),
  mc(L16, 4, 2, "What question does Pop Art leave open?", ["Whether it celebrates, criticizes or simply reports consumer culture", "Whether paint is a material", "Whether Paris is in France", "Whether sculpture can stand up"], "Warhol gave few explanations.", "The ambiguity is part of Pop's interest and debate."),
  tf(L16, 5, 3, "Pop Art helped blur the line between \"high\" and \"low\" art.", 0, "Think of comics and soup cans in galleries.", "By using ads, comics and celebrity images, Pop challenged that boundary."),

  // L17
  mc(L17, 1, 1, "Who wrote the 1965 essay \"Specific Objects\"?", ["Donald Judd", "Michael Fried", "Dan Flavin", "Carl Andre"], "He made boxes in repeated rows.", "Judd argued for real objects occupying real space."),
  tf(L17, 2, 1, "Dan Flavin made works from commercially bought fluorescent light tubes.", 0, "The light fills the room.", "Flavin used standard fluorescent tubes, beginning in 1963."),
  mc(L17, 3, 2, "What did Michael Fried criticize in Minimalism in his 1967 essay?", ["Its theatricality, the way it depends on the viewer's presence", "Its use of too much colour", "Its small scale", "Its lack of any objects"], "He saw the work as needing an audience's movement.", "Fried called this theatricality; Minimalists welcomed the experience of the viewer."),
  mc(L17, 4, 2, "Why did Carl Andre's Equivalent VIII become controversial in 1976?", ["Newspapers mocked it as a pile of bricks after the Tate bought it", "It was stolen", "It was made of gold", "It was destroyed by fire"], "It was made from firebricks.", "The purchase triggered a press debate over what counts as art."),
  tf(L17, 5, 3, "Industrial fabrication in Minimalism challenged the idea that the artist's own hand is essential.", 0, "Think about who actually made the boxes.", "Fabricated work questioned the myth of the artist's touch."),

  // L18
  mc(L18, 1, 1, "What does Sol LeWitt say the idea becomes in conceptual art?", ["A machine that makes the art", "A museum where art is displayed", "A painting hung on a gallery wall", "A rumor passed between critics"], "It is in the 1967 essay quoted in the lesson.", "LeWitt wrote that the idea becomes a machine that makes the art."),
  tf(L18, 2, 1, "Kosuth's One and Three Chairs includes a real chair, a photograph and a dictionary definition.", 0, "Three versions of one thing.", "The work asks which version is the artwork and what representation means."),
  mc(L18, 3, 2, "What does a collector often buy when purchasing a conceptual work?", ["A certificate or instructions and the right to realize the work", "The sculpture's marble", "Nothing at all, ever", "A copyright in all art"], "The idea is the work.", "Often the purchase is documentation and permission to realize the piece."),
  mc(L18, 4, 2, "Which 1968 essay described the trend as dematerialization?", ["The Dematerialization of Art by Lippard and Chandler", "Art and Objecthood", "Specific Objects", "Why Have There Been No Great Women Artists?"], "The title uses a word meaning 'removing matter'.", "Lucy Lippard and John Chandler wrote the essay."),
  tf(L18, 5, 3, "Even when others carry out LeWitt's wall drawings from his instructions, the instructions are still counted as his work.", 0, "The plan remains his.", "The instructions are his work, even when assistants carry them out."),

  // L19
  mc(L19, 1, 1, "What does Op Art try to do?", ["Create the perception of vibration or movement with patterns", "Show realistic landscapes", "Make large murals about history", "Teach colour theory only to children"], "The movement is not physically there.", "Op artists use contrast and repeated patterns to create optical effects."),
  tf(L19, 2, 1, "Bridget Riley painted waving black and white lines in works such as Current.", 0, "A British artist.", "Current (1964) is a well-known Op work."),
  mc(L19, 3, 2, "Which 1965 MoMA exhibition brought Op Art to wide attention?", ["The Responsive Eye", "Degenerate Art", "Magiciens de la Terre", "The Dinner Party"], "Curated by William Seitz.", "The Responsive Eye was organized by William Seitz."),
  mc(L19, 4, 2, "Which artist's mobiles, begun in the 1930s, balance in the air and respond to drafts?", ["Alexander Calder", "Victor Vasarely of Pecs", "Jean Tinguely of Switzerland", "Naum Gabo, a Constructivist"], "A kinetic sculptor from America.", "Calder's mobiles are a classic form of kinetic art."),
  tf(L19, 5, 3, "Op Art changed the question from what a picture shows to what happens to the viewer while looking.", 0, "Consider the high-contrast pattern exercise.", "The artwork is partly completed inside the viewer's perception."),

  // L20
  mc(L20, 1, 1, "Where is Robert Smithson's Spiral Jetty?", ["The Great Salt Lake in Utah", "The River Thames in central London", "The outskirts of Mexico City", "The Sahara Desert in North Africa"], "A very salty lake in the American West.", "Smithson built it in April 1970."),
  tf(L20, 2, 1, "The Lightning Field by Walter De Maria is in New Mexico.", 0, "It involves 400 steel poles.", "It was completed in 1977 and is visited overnight."),
  mc(L20, 3, 2, "How was Michael Heizer's Double Negative made?", ["By removing hundreds of thousands of tons of rock from a mesa edge", "By stacking bricks on a floor", "By wrapping cliffs in fabric", "By hanging steel poles"], "The sculpture is an absence.", "It is two huge cuts in the edge of a mesa in Nevada."),
  mc(L20, 4, 2, "Which ethical question does land art raise?", ["Many sites are sacred or home to Indigenous communities and were treated as empty", "Whether paint is toxic", "Whether art needs a frame", "Whether museums can be cold"], "Think about who lived in those places.", "Artists from outside often treated inhabited or sacred places as blank."),
  tf(L20, 5, 3, "Christo and Jeanne-Claude funded their projects themselves.", 0, "The lesson mentions how they paid.", "They financed the projects through the sale of their own work rather than public funds."),

  // L21
  mc(L21, 1, 1, "Which artist coined the word Happening and staged \"18 Happenings in 6 Parts\" in 1959?", ["Allan Kaprow", "Joseph Beuys", "Yves Klein", "Marina Abramovic"], "He worked in New York.", "Kaprow's 1959 event gave the term wide use."),
  tf(L21, 2, 1, "In Cut Piece, audience members cut pieces from Yoko Ono's clothing.", 0, "She sat still.", "The piece raised questions of consent, gender and power."),
  mc(L21, 3, 2, "In Rhythm 0 (1974), what did Marina Abramovic provide, by her account?", ["72 objects the audience could use on her", "A script for actors", "A film screening", "A set of paintings"], "She stood passively.", "The performance showed how some audience members escalated their actions."),
  mc(L21, 4, 2, "Why does documentation matter in performance art?", ["Performance is live and disappears, so photos and film shape how it is remembered", "Performance is always recorded perfectly", "Documents are the same as the event", "Museums do not collect performance"], "The event itself is gone.", "The document is not the event, but it often is what survives."),
  tf(L21, 5, 3, "Reperformance raises the question of whether a work can exist without its original moment.", 0, "Think about museums restaging pieces.", "Museums and artists debate whether a restaged performance is the same work."),

  // L22
  mc(L22, 1, 1, "Who published \"Why Have There Been No Great Women Artists?\" in 1971?", ["Linda Nochlin", "Judy Chicago", "Lucy Lippard", "Faith Ringgold"], "An art historian.", "Nochlin argued that institutions, not lack of talent, explained the gap."),
  tf(L22, 2, 1, "The Dinner Party has 39 place settings.", 0, "Think of a triangular table.", "It honours 39 mythical and historical women, with 999 more names on the floor."),
  mc(L22, 3, 2, "Which group began wearing gorilla masks in 1985 to publicize poor representation in museums?", ["The Guerrilla Girls", "Fluxus", "The Independent Group", "Die Brucke"], "They stayed anonymous.", "They posted statistics on women and artists of colour in major museums."),
  mc(L22, 4, 2, "What did Mierle Laderman Ukeles propose in her 1969 manifesto?", ["That daily maintenance and care work deserved attention as art", "That painting should end", "That museums should be abolished", "That photographs be burned"], "Think of unpaid labour.", "She argued maintenance work deserved attention as art."),
  tf(L22, 5, 3, "Critics have argued that The Dinner Party treats women's identity as biological and centres white women.", 0, "Consider both the imagery and the list of names.", "These are criticisms often raised about the piece."),

  // L23
  mc(L23, 1, 1, "How did Photorealist painters usually begin?", ["From photographs", "From dreams", "From automatic drawing", "From stone carving"], "They used a camera.", "They projected or gridded photographs and painted them."),
  tf(L23, 2, 1, "Chuck Close painted enormous faces from head-shot photographs.", 0, "Big Self-Portrait.", "His portraits are far larger than life."),
  mc(L23, 3, 2, "What subject did Richard Estes paint in New York?", ["Storefronts full of reflections in glass", "Abstract drips", "Soup cans", "Land cuts"], "A subject where the camera flattens space.", "Estes made reflective city surfaces his specialty."),
  mc(L23, 4, 2, "What do supporters say Photorealism reveals?", ["How photographs flatten, edit and glamorize the world", "That cameras are unnecessary", "That paint is more expensive", "That realism has ended"], "They answer the charge of copying.", "The slow labour of painting changes our attention to the photographic image."),
  tf(L23, 5, 3, "Gerhard Richter's blurred photo paintings are a deliberate contrast to photorealist sharpness.", 0, "The lesson mentions him in passing.", "Richter blurred images on purpose, unlike the Photorealists' sharp surface."),

  // L24
  mc(L24, 1, 1, "What did Neo-Expressionism bring back?", ["Large, rough, emotional painting with figures", "Minimalist boxes", "Pure geometric abstraction", "Instructions as art"], "A reaction to restraint.", "It was a return to bold figurative painting."),
  tf(L24, 2, 1, "Jean-Michel Basquiat began as a graffiti writer.", 0, "He used the tag SAMO.", "He moved from street writing to dense gallery paintings."),
  mc(L24, 3, 2, "What is appropriation in postmodern art?", ["Deliberately borrowing existing images", "Painting only landscapes from direct observation", "Using only primary colours in every work", "Removing objects from exhibitions and storage"], "Think of Sherrie Levine.", "Artists reused images to question originality and authorship."),
  mc(L24, 4, 2, "What do Cindy Sherman's Untitled Film Stills explore?", ["How stereotypes of women are constructed", "The physics of light", "The history of Italy", "The price of paint"], "She poses as imagined movie women.", "The photographs show constructed female stereotypes from old films."),
  tf(L24, 5, 3, "Scholars agree on exactly when Postmodernism began.", 1, "The term is described as slippery.", "Scholars disagree about its start and its definition."),

  // L25
  mc(L25, 1, 1, "Which city is usually credited as the origin of modern graffiti in the late 1960s?", ["Philadelphia", "Berlin, beside the Wall", "Tokyo, in the Shibuya district", "Los Angeles, around Venice Beach"], "Cornbread wrote his name there.", "Philadelphia is where modern tagging is usually traced."),
  tf(L25, 2, 1, "Graffiti done without permission is illegal in most places.", 0, "Think about authorities calling it vandalism.", "Even when it is valued as art, unpermitted painting is usually a crime."),
  mc(L25, 3, 2, "What happened to Banksy's Girl with Balloon at Sotheby's in 2018?", ["It was partly shredded by a device in its frame after it sold", "It was stolen", "It was repainted white", "It was rejected for sale"], "The sale price was about 1.04 million pounds.", "The piece partly shredded as the sale was completed."),
  mc(L25, 4, 2, "Which artist drew in chalk on unused black ad panels in New York subway stations?", ["Keith Haring", "Banksy", "Shepard Fairey", "Cornbread"], "He soon entered galleries.", "Haring's subway drawings were done in the early 1980s."),
  tf(L25, 5, 3, "A key open question about street art is who decides what is a crime and what is culture.", 0, "Consider the final paragraph.", "Permission, ownership and context change how the same marks are judged."),

  // L26
  mc(L26, 1, 1, "Which Korean-born artist is often called a founder of video art?", ["Nam June Paik", "Beeple, the digital artist", "Harold Cohen, a British painter", "Vera Molnar, born in Budapest"], "He altered television sets.", "Paik exhibited altered TVs in 1963 and later made TV Buddha."),
  tf(L26, 2, 1, "An NFT is a blockchain record that points to a file.", 0, "It is not the file itself.", "That is how the lesson defines a non-fungible token."),
  mc(L26, 3, 2, "How much did Beeple's Everydays: The First 5000 Days sell for at Christie's in 2021?", ["About 69.3 million dollars", "About 69 thousand dollars at Christie's", "About 6.9 billion dollars at auction", "It failed to sell at the auction"], "A very large figure.", "The sale was about 69.3 million dollars."),
  mc(L26, 4, 2, "Which program did Harold Cohen develop to make drawings?", ["AARON", "Midjourney", "Merz", "Grapefruit"], "It began in the early 1970s.", "AARON was an early drawing program."),
  tf(L26, 5, 3, "Questions about authorship and training data in generative AI art are being argued in courts and studios.", 0, "These are open issues.", "Authorship and copyright for AI-made images remain contested."),

  // L27
  mc(L27, 1, 1, "What is a biennial?", ["A large international art exhibition held periodically", "A kind of paint", "A museum shop", "A sculpture technique"], "The word suggests every two years.", "Biennials such as Venice and Gwangju gather artists from many places."),
  tf(L27, 2, 1, "Okwui Enwezor directed Documenta 11 in 2002.", 0, "He was Nigerian-born.", "He was the first non-European artistic director of Documenta."),
  mc(L27, 3, 2, "What was Ai Weiwei's 2010 Turbine Hall work at Tate Modern?", ["About 100 million hand-painted porcelain sunflower seeds", "A giant mirror room", "A wall of bottle caps", "A silhouette mural"], "Made by artisans in Jingdezhen.", "The seeds reflected on mass production and individual labour."),
  mc(L27, 4, 2, "Which artist makes wall-hangings from flattened bottle caps and wire?", ["El Anatsui", "Kara Walker", "Yayoi Kusama", "Kehinde Wiley"], "Born in Ghana, based in Nigeria.", "El Anatsui's shimmering works use recycled bottle materials."),
  tf(L27, 5, 3, "The term global art can hide unequal power, because wealthy institutions still decide whose work travels.", 0, "Consider the last paragraph.", "The word can describe exchange but also mask who controls it."),

  // L28
  mc(L28, 1, 1, "Which market involves galleries selling new work directly from artists?", ["The primary market", "The secondary market", "The auction market only", "The resale royalty market"], "The first sale.", "The primary market is first sale, usually through galleries."),
  tf(L28, 2, 1, "Christie's was founded in 1766.", 0, "An old auction house.", "Christie's dates from 1766 and Sotheby's from 1744."),
  mc(L28, 3, 2, "What was notable about Salvator Mundi's sale in November 2017?", ["It reached 450.3 million dollars including fees, a record auction price at the time", "It sold for 5 dollars", "It was a Warhol", "It was bought by a museum for free"], "Its attribution is disputed by some scholars.", "The price was a record, while the attribution to Leonardo is debated."),
  mc(L28, 4, 2, "What are the Washington Principles of 1998?", ["A non-binding framework for fair solutions on Nazi-confiscated art", "A law banning auctions", "A price list for sculptures", "A copyright treaty"], "They concern looted art.", "Dozens of countries endorsed them as a non-binding framework."),
  tf(L28, 5, 3, "A high price proves that a work is good.", 1, "Price reports what someone paid.", "Price reflects many factors, such as reputation and scarcity, not quality alone."),
];

export const COURSE_MODULE: CourseModule = {
  curriculum: {
    id: 'art-movements-modern',
    label: 'Art Movements II: Post-Impressionism to Today',
    blurb: 'From Post-Impressionism and Cubism through Dada, Pop and Land art to street art, digital art and the global art market: what each movement argued, who made it, and how to look at it.',
    accent: '#D40055',
    framework: 'ncas',
    tracks: [t1, t2, t3, t4, t5, t6],
  },
  bank: {
    curriculumId: 'art-movements-modern',
    questions: [...questions, ...questions2],
  },
};
