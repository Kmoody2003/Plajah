import type { CourseModule } from '../courseModule';
import type { Question } from '../types';

// Write the correct choice FIRST; the helper rotates the choices so the correct answer lands on a spread-out index.
const mc = (l: string, n: number, level: 1 | 2 | 3, prompt: string, choices: string[], hint: string, explanation: string): Question => {
  const target = (parseInt(l.slice(l.lastIndexOf('.l') + 2), 10) * 3 + n * 5) % 4;
  const shift = target;
  const rotated = choices.map((_, i) => choices[(i - shift + 4) % 4]);
  return { id: `${l}.q${n}`, lessonId: l, kind: 'mcq', prompt, choices: rotated, answer: target, hint, explanation, level };
};
const tf = (l: string, n: number, level: 1 | 2 | 3, prompt: string, answer: number, hint: string, explanation: string): Question =>
  ({ id: `${l}.q${n}`, lessonId: l, kind: 'tf', prompt, answer, hint, explanation, level });

const L01 = 'design-movements.l01';
const L02 = 'design-movements.l02';
const L03 = 'design-movements.l03';
const L04 = 'design-movements.l04';
const L05 = 'design-movements.l05';
const L06 = 'design-movements.l06';
const L07 = 'design-movements.l07';
const L08 = 'design-movements.l08';
const L09 = 'design-movements.l09';
const L10 = 'design-movements.l10';
const L11 = 'design-movements.l11';
const L12 = 'design-movements.l12';
const L13 = 'design-movements.l13';
const L14 = 'design-movements.l14';
const L15 = 'design-movements.l15';
const L16 = 'design-movements.l16';
const L17 = 'design-movements.l17';
const L18 = 'design-movements.l18';
const L19 = 'design-movements.l19';
const L20 = 'design-movements.l20';
const L21 = 'design-movements.l21';
const L22 = 'design-movements.l22';

export const COURSE_MODULE: CourseModule = {
  curriculum: {
    id: 'design-movements',
    label: 'Design Movements: Arts and Crafts to Postmodernism',
    blurb: 'A tour of the movements that shaped buildings, furniture, posters and everyday objects from the 1850s to today: what drove each one, what it looks like, who made its best-known work, and how to recognise it.',
    accent: '#FFD24A',
    framework: 'ncas',
    tracks: [
      {
        id: 'design-movements.t1',
        title: 'Machines, Crafts and Ornament',
        blurb: 'How the Industrial Revolution provoked a century of argument about making things, from Morris to the Werkbund.',
        level: 'FOUNDATION',
        lessons: [
          {
            id: L01,
            title: 'The Industrial Revolution and Its Critics',
            blurb: 'Factories made goods cheap and plentiful, and some thinkers feared that beauty and honest work were being lost.',
            minutes: 6,
            body: `Before the late 1700s, most chairs, cups and cloth were made by hand in small workshops. Then, starting in Britain, machines powered by water and steam began to make goods in factories. Prices fell and ordinary people could own more things. But the new methods raised a question that runs through this whole course: what happens to design when a machine can stamp out decoration as easily as a craftsperson once carved it?

Many Victorian products answered with heavy ornament. Machines could imitate carving, lace and metalwork cheaply, and manufacturers often piled on patterns from many past styles. The Great Exhibition of 1851, held in London in the Crystal Palace, a huge building of iron and glass designed by Joseph Paxton, showed the world's goods, including many such products. The building itself, quickly assembled from standard parts, impressed visitors as much as the objects inside.

Critics pushed back. The architect A. W. N. Pugin argued for medieval Gothic design as a moral and honest style. The writer John Ruskin, in The Stones of Venice (1851 to 1853), praised the visible, imperfect work of medieval stonecutters and condemned labour that treated people like machine parts. Owen Jones, in The Grammar of Ornament (1856), argued that decoration should respect the flat surface it covers rather than imitate nature realistically.

Not everyone blamed machines. The bentwood Thonet chair No. 14 (1859), made by steaming wood and bending it, was simple, cheap and sold in huge numbers. It suggests that industry and good design could coexist, an idea later movements would take up.`,
          },
          {
            id: L02,
            title: 'Arts and Crafts: William Morris and the Handmade Ideal',
            blurb: 'Morris and his followers argued that well-made, honest, useful objects could improve both work and daily life.',
            minutes: 7,
            body: `The Arts and Crafts movement began in Britain in the second half of the 1800s and spread to Europe and North America. Its central figure is William Morris (1834 to 1896), a designer, writer and socialist. Inspired by Ruskin, he believed that making things should be satisfying work, and that homes should be filled with objects that were useful and beautiful.

Morris built his ideas into his own life. His home, Red House (1859), was designed with the architect Philip Webb and built of red brick with plain, honest construction. In 1861 he co-founded the firm Morris, Marshall, Faulkner and Co. to make furniture, stained glass, wallpaper and textiles. His wallpapers and fabrics, with dense, flowing patterns of leaves, birds and flowers, remain famous. In 1891 he founded the Kelmscott Press to print beautiful books by hand-press methods.

The movement had a name by the 1880s: the Art Workers' Guild formed in 1884 and the Arts and Crafts Exhibition Society in 1887. Typical features are visible joinery, natural materials such as oak, hand-finished surfaces, and motifs from nature and medieval design.

Variants appeared elsewhere. In the United States, Gustav Stickley promoted sturdy Craftsman furniture, and the Greene brothers designed the Gamble House (1908 to 1909) in Pasadena, California, with exposed timber joinery. In Scotland, Charles Rennie Mackintosh designed the Glasgow School of Art, with its first phase from 1897 to 1899.

There was an irony, which Morris himself acknowledged: handwork was costly, so many of his products were bought by the wealthy rather than by the ordinary workers he hoped to serve.`,
          },
          {
            id: L03,
            title: 'Art Nouveau and Its Regional Variants',
            blurb: 'Art Nouveau turned to curving, plant-like lines and new materials, and it took different names in different countries.',
            minutes: 7,
            body: `Art Nouveau, French for "new art", flourished roughly from the 1890s to about 1910. It shared the Arts and Crafts wish to renew design, but it was happy to use modern industrial materials such as iron and glass. Its signature is the flowing, asymmetrical line, often called the whiplash curve, taken from stems, flowers and tendrils. The name came from the Paris shop of Siegfried Bing, which opened in 1895 as the Maison de l'Art Nouveau.

In Brussels, Victor Horta's Hôtel Tassel (1893) is often cited as one of the first Art Nouveau buildings, with an iron-and-glass interior of curling plant-like forms. In Paris, Hector Guimard designed entrances to the Metro, beginning around 1900, in cast iron and glass. In Nancy, Émile Gallé made glass inspired by nature. In Prague, Alphonse Mucha produced posters with elegant women framed by decorative curves.

The style travelled under other names. In Germany it was Jugendstil, from the Munich magazine Jugend (founded 1896). In Austria the related movement was the Secession. In Italy it was Stile Liberty, after the London shop Liberty and Co. In Catalonia it appeared as Modernisme, most memorably in Antoni Gaudí's Casa Batlló in Barcelona, remodelled between about 1904 and 1906. In the United States, Louis Comfort Tiffany was famed for his stained-glass lamps.

To recognise it: look for sinuous curves, plant and insect motifs, stylised lettering, and cast iron or glass shaped to flow like living tissue rather than sit in straight lines.`,
          },
          {
            id: L04,
            title: 'The Vienna Secession and the Wiener Werkstätte',
            blurb: 'Viennese artists broke with the establishment, then built a workshop that designed everything from buildings to teaspoons.',
            minutes: 7,
            body: `In 1897 a group of Viennese artists, with the painter Gustav Klimt as first president, broke away from the established artists' association and formed the Vienna Secession. Their exhibition building, designed by Joseph Maria Olbrich (1897 to 1898), carries the motto "To every age its art, to art its freedom". It is crowned by an openwork dome of gilded laurel leaves and features restrained white walls.

Within the Secession's circle, architect Josef Hoffmann and designer Koloman Moser founded the Wiener Werkstätte (Vienna Workshop) in 1903, with the industrialist Fritz Waerndorfer as financial backer. The workshop aimed to create a total work of art: furniture, silverware, jewellery, textiles, bookbinding and even clothes, all designed and handmade to a consistent standard. Their style tended to geometric order, especially squares and grids, with fine craftsmanship and costly materials.

Hoffmann's most celebrated building is the Palais Stoclet in Brussels (built about 1905 to 1911), a luxurious house where the Wiener Werkstätte designed or supplied much of the interior. Klimt designed a mosaic frieze for its dining room.

Not every Viennese agreed that decoration was the answer. The architect Adolf Loos, in an essay written in 1908 and first delivered as a lecture in 1910, titled Ornament and Crime, argued that applied ornament was wasteful and outdated for modern life. His Looshaus on Michaelerplatz (1909 to 1911) has a plain upper facade, which scandalised some Viennese. Meanwhile Otto Wagner's Postal Savings Bank (1904 to 1906) used aluminium bolts and glass in a modern way.

The Wiener Werkstätte struggled financially and closed in 1932.`,
          },
          {
            id: L05,
            title: 'The Deutscher Werkbund and Industrial Design',
            blurb: 'German designers, architects and manufacturers joined to bring good design into industry rather than rejecting the machine.',
            minutes: 7,
            body: `The Deutscher Werkbund (German Work Federation) was founded in Munich in 1907 by architects, designers, writers and manufacturers, among them Hermann Muthesius, Peter Behrens, Henry van de Velde and Richard Riemerschmid. Unlike Morris, they did not want to retreat from the machine. They wanted to raise the quality of mass-produced goods and to make German industry competitive through good design.

Peter Behrens became the first artistic consultant to the electrical company AEG in 1907. He designed its buildings, lamps, kettles, fans and graphics so that they looked like parts of one company. His AEG Turbine Factory in Berlin (1909) used steel and large glass areas and is a landmark of industrial architecture. This is an early example of what we now call corporate identity.

The Werkbund also showed what it believed. At its 1914 exhibition in Cologne, Walter Gropius and Adolf Meyer built a model factory with glazed stair towers. Gropius had already designed the Fagus Factory at Alfeld (1911, with Meyer), whose corner is mostly glass.

The group did not always agree. In 1914, Muthesius argued for standardised types as a route to quality and export strength, while van de Velde defended the artist's individual creativity. This argument between standardisation and personal expression reappears in later movements.

Many Bauhaus figures, including Gropius, came from the Werkbund world, and the Werkbund later sponsored the Weissenhof housing exhibition in Stuttgart in 1927.`,
          },
        ],
      },
      {
        id: 'design-movements.t2',
        title: 'The Bauhaus and the Avant-Garde',
        blurb: 'The school that tried to unite art, craft and technology, and the radical groups in the Netherlands and Russia that shared its era.',
        level: 'INTERMEDIATE',
        lessons: [
          {
            id: L06,
            title: 'The Bauhaus in Weimar, 1919 to 1925',
            blurb: 'Walter Gropius founded a school to unite fine art and craft, and its early years were experimental and expressive.',
            minutes: 7,
            body: `The Bauhaus was founded in April 1919 in Weimar, Germany, by the architect Walter Gropius. It merged two earlier schools: the Grand-Ducal Saxon Academy of Fine Arts and the School of Arts and Crafts. The name means roughly "building house". Gropius's founding manifesto called for artists and craftspeople to work together toward the building of the future, and its cover carried a woodcut of a cathedral by Lyonel Feininger.

Germany had just lost the First World War, and money and materials were scarce. The school was organised around workshops, such as weaving, metalwork, carpentry and printing, each taught by a craft master and an artist, called a form master. Every student began with the preliminary course (Vorkurs), which introduced materials, colour and form. Johannes Itten first ran it, bringing a spiritual and expressive approach. Later, Laszlo Moholy-Nagy and Josef Albers shaped it with more rigour.

The faculty included painters of great reputation: Feininger, Paul Klee (from 1921), Wassily Kandinsky (from 1922) and Oskar Schlemmer. Women were admitted, though many were steered towards weaving, where Gunta Stolzl later became an important figure.

In 1923, the school's public exhibition used the slogan "Art and Technology: a new unity", signalling a shift from craft expressionism toward design for industry. A well-known product of this phase is the lamp made by Wilhelm Wagenfeld and Carl Jakob Jucker around 1923 to 1924.

Local politics turned against the school. After right-wing parties gained power in Thuringia, funding was cut, and the Bauhaus left Weimar in 1925.`,
          },
          {
            id: L07,
            title: 'Dessau, Berlin and the Closing of the Bauhaus',
            blurb: 'The school reached its fame in Dessau, changed directors twice, and was forced out by Nazi pressure in 1933.',
            minutes: 7,
            body: `In 1925 the Bauhaus moved to Dessau, an industrial town whose council offered support. Gropius designed the new school building, which opened in December 1926. It combined workshops, classrooms and a studio wing in connected blocks, with a famous glass curtain wall on the workshop wing. He also designed the masters' houses nearby.

In Dessau the school's products became more industrial. Marcel Breuer designed tubular steel furniture, including the chair now known as the Wassily chair (about 1925 to 1926). Marianne Brandt designed metal teapots and lamps. Herbert Bayer designed typography and the school's printed material, using lowercase sans-serif letters.

Leadership changed. Gropius resigned in 1928. The Swiss architect Hannes Meyer directed the school from 1928 to 1930 with a strongly social, functional focus, and was dismissed in 1930 amid political tension. Ludwig Mies van der Rohe then took over. Under growing Nazi influence, the Dessau council closed the school in 1932.

Mies moved it to Berlin, renting a disused factory, but with little time left. In April 1933 police searched the building, and in July 1933, under pressure from the new Nazi government, the faculty voted to dissolve the school. The Bauhaus had lasted about fourteen years.

The Nazis saw its modernism and internationalism as hostile, and many staff and students later left Germany. Closure did not end the ideas; it scattered them.`,
          },
          {
            id: L08,
            title: 'Bauhaus Ideas, Teachers and Legacy',
            blurb: 'The Bauhaus taught design through materials and making, and its exiled teachers carried its methods around the world.',
            minutes: 8,
            body: `The Bauhaus did not have a single style, but certain ideas recur. Form should follow the needs of use and the nature of materials. Design education should begin with basic elements: line, shape, colour and texture. Art, craft and technology belong together, and design should serve ordinary life, not only the rich. The typical look, plain geometry, primary colours, lowercase sans-serif type, tubular steel, is a result of those ideas, though not all Bauhaus work looked that way.

Teachers mattered. Itten, Moholy-Nagy and Albers developed foundation teaching. Klee and Kandinsky taught form and colour theory, and Kandinsky published Point and Line to Plane in 1926. Schlemmer led the stage workshop, famous for the Triadic Ballet, which he created earlier.

After 1933 the story spread. Moholy-Nagy founded the New Bauhaus in Chicago in 1937, which became the Institute of Design. Albers taught at Black Mountain College in North Carolina and later at Yale. Gropius and Breuer taught at Harvard, and Mies became head of architecture at what is now the Illinois Institute of Technology. In Germany, the Ulm School of Design (founded in 1953) continued some of its approach.

Debate continues. Some historians stress how much the Bauhaus owed to earlier Werkbund and Arts and Crafts ideas, and note that many Bauhaus designs were expensive to produce, so the dream of cheap mass production was only partly achieved. Still, its teaching method remains the model for design foundation courses.`,
          },
          {
            id: L09,
            title: 'De Stijl and Constructivist Design',
            blurb: 'Dutch and Russian avant-garde groups reduced form to its basics, one seeking universal harmony and the other social purpose.',
            minutes: 8,
            body: `De Stijl ("The Style") began in the Netherlands in 1917, around the artist and writer Theo van Doesburg and his journal of the same name. Members included the painter Piet Mondrian, the architect J. J. P. Oud and the designer Gerrit Rietveld. Mondrian called his approach Neoplasticism. Its vocabulary is deliberately limited: straight horizontal and vertical lines, flat planes, the primary colours red, yellow and blue, plus black, white and grey.

Rietveld applied this to objects and buildings. His Red and Blue Chair, first designed around 1917 to 1918, is a construction of straight wooden lengths and flat planes, painted later in colour. His Schroder House in Utrecht (1924) has sliding walls and overlapping planes and is a celebrated example of the style in architecture. Van Doesburg and Mondrian eventually split in the 1920s over van Doesburg's use of diagonal lines.

Constructivism emerged in Russia after the 1917 revolution. Its artists, including Vladimir Tatlin, Alexander Rodchenko, El Lissitzky, Varvara Stepanova and Lyubov Popova, wanted art to serve society by building, designing posters, textiles and everyday objects. Tatlin's model for a Monument to the Third International (1919 to 1920) imagined a spiralling iron tower, never built. Lissitzky's poster Beat the Whites with the Red Wedge (1919 to 1920) uses bold geometric shapes as political message. Rodchenko's posters and photographs favoured diagonals and unusual angles.

Compare them: both used geometry, but De Stijl sought calm, universal balance, while Constructivism favoured dynamic diagonals and direct social or political use. Both influenced the Bauhaus and later graphic design.`,
          },
        ],
      },
      {
        id: 'design-movements.t3',
        title: 'Art Deco and Streamlining',
        blurb: 'Glamour, speed and luxury in the 1920s and 1930s, from a Paris exhibition to skyscrapers and ships.',
        level: 'INTERMEDIATE',
        lessons: [
          {
            id: L10,
            title: 'Art Deco: Paris 1925 and the Look of Luxury',
            blurb: 'The style took its name from a Paris exhibition and combined rich materials with geometric, modern forms.',
            minutes: 7,
            body: `Art Deco takes its name from the Exposition internationale des arts decoratifs et industriels modernes, held in Paris in 1925. Planned before the First World War and delayed by it, the exhibition required that exhibits be modern; copies of historical styles were not accepted. The shorthand "Art Deco" became common only later; the art historian Bevis Hillier's 1968 book Art Deco of the 20s and 30s helped popularise it.

The style is not a single doctrine. It blends influences: Cubism, Art Nouveau's love of decoration, the Ballets Russes's colour, ancient Egyptian and other non-European motifs, and the machine age. Typical features are geometry (zigzags, chevrons, stepped forms, sunbursts), symmetry, stylised flowers and animals, and a sense of luxury.

Materials were often rich: exotic woods, ivory (a practice now widely condemned), lacquer, shagreen, chrome, glass and, later, new plastics such as Bakelite. The cabinetmaker Emile-Jacques Ruhlmann produced exquisite furniture for wealthy clients. Rene Lalique made glass for perfume bottles, vases and car mascots. Sonia Delaunay designed bold geometric textiles and fashion. Jewellers such as Cartier produced geometric brooches and bracelets.

At the same exposition, the Soviet pavilion, designed by Konstantin Melnikov, and Le Corbusier's Pavillon de l'Esprit Nouveau offered quite different visions. Le Corbusier's pavilion was plain and unornamented, a sign that Deco's decorative richness had critics among modernists.

To recognise it: bold symmetry, geometric ornament, glossy or metallic finishes, and an air of elegance made for people who could afford craftsmanship.`,
          },
          {
            id: L11,
            title: 'Deco Skyscrapers, Cinemas, Liners and Global Variants',
            blurb: 'Art Deco was applied to towers, picture palaces and ships, and it adapted to local cultures worldwide.',
            minutes: 8,
            body: `In the 1920s and 1930s Art Deco moved from luxury showrooms into public life. In New York, the Chrysler Building (William Van Alen, completed 1930) is crowned with a stainless steel spire in a sunburst pattern, and carries car-themed ornaments. For a short time it was the tallest building in the world until the Empire State Building (1931) overtook it. Rockefeller Center and the interiors of Radio City Music Hall (1932, interior designed by Donald Deskey) are other major Deco works.

Cinemas, the new entertainment of the age, were often built as Deco "picture palaces", with glowing signs, vertical towers and ornate auditoriums. In Britain the Odeon chain used streamlined, tiled facades for many of its theatres.

Ocean liners were floating Deco showpieces. The French liner Normandie, which entered service in 1935, was famous for lavish interiors by leading French decorators.

The style also spread globally and mixed with local traditions. Miami Beach has a large district of 1930s Deco hotels with pastel colours and nautical details. After an earthquake in 1931, the New Zealand city of Napier was rebuilt largely in Deco style. Mumbai has a notable collection of Deco buildings along Marine Drive. In Shanghai, the Hungarian architect Laszlo Hudec designed the Park Hotel (1934). Asmara in Eritrea, Havana and many other cities also have Deco buildings.

Deco was not purely a celebration. Many of these buildings were built within colonial economies or amid the Great Depression, and the style's glamour sat alongside real hardship.`,
          },
          {
            id: L12,
            title: 'Streamline Moderne: Design for Speed',
            blurb: 'In the 1930s curved, smooth forms borrowed from aircraft and trains were applied to everything, including things that did not move.',
            minutes: 7,
            body: `As the 1930s deepened into the Great Depression, a smoother, simpler cousin of Art Deco arrived, often called Streamline Moderne. Its inspiration was the look of speed: the teardrop shape that reduces air resistance in aircraft, trains, ships and cars. Designers used rounded corners, long horizontal lines, porthole windows, and smooth surfaces in stucco, enamel and chrome.

The idea moved from real engineering into styling. The Douglas DC-3 airliner (first flown in 1935) was a practical streamlined aircraft. The Chrysler Airflow car (1934) was an early attempt to apply wind-tunnel thinking to a production car, though it did not sell well. Industrial designers such as Raymond Loewy and Norman Bel Geddes became famous; Loewy restyled locomotives and household products, and Bel Geddes's Futurama exhibit for General Motors at the 1939 New York World's Fair imagined a future of highways.

Critics noticed a puzzle: some streamlined objects, such as pencil sharpeners or staplers, were never going to move through the air. Streamlining there was a symbol of modernity and efficiency rather than a response to physics. Defenders replied that it also helped sales, which mattered during the Depression, and could suggest cleanliness and progress.

In architecture, the style shows in diners, department stores, bus stations and apartment buildings, with horizontal bands and curved corners.

To recognise it: look for rounded corners, horizontal speed lines, and a sense of movement in objects that are standing still.`,
          },
        ],
      },
      {
        id: 'design-movements.t4',
        title: 'Modernism at Mid-Century',
        blurb: 'The International Style, Swiss graphic design, American mid-century furniture and the Scandinavian approach to everyday life.',
        level: 'INTERMEDIATE',
        lessons: [
          {
            id: L13,
            title: 'The International Style',
            blurb: 'A 1932 New York exhibition gave a name to the glass-and-steel modern architecture that came to dominate world cities.',
            minutes: 8,
            body: `In 1932 the Museum of Modern Art in New York held the exhibition Modern Architecture: International Exhibition, organised by the historian Henry-Russell Hitchcock and the architect Philip Johnson, with museum director Alfred Barr. Their accompanying book gave the movement its name: The International Style. They identified principles: architecture as volume rather than mass, regularity rather than axial symmetry, and the avoidance of applied ornament.

The style grew from European modernists of the 1920s. Le Corbusier proposed five points of a new architecture in 1927: pilotis (columns lifting the building), a free plan, a free facade, ribbon windows and a roof garden. His Villa Savoye near Paris (1928 to 1931) shows all five. Mies van der Rohe's German Pavilion in Barcelona (1929) used flowing space, polished stone and glass; his later Seagram Building in New York (1958, with Philip Johnson) became the model for the corporate skyscraper. Lever House (1952), by Skidmore, Owings and Merrill, helped establish the glass curtain-wall tower in the United States.

Materials were steel frames, reinforced concrete, large sheets of glass and white walls. After the Second World War, businesses, governments and universities around the world adopted the look.

Critics grew. Jane Jacobs, in The Death and Life of Great American Cities (1961), argued that modernist planning damaged lively streets. Others felt the style was cold and ignored local climate and culture. The critic Charles Jencks famously claimed that modern architecture "died" with the demolition of the Pruitt-Igoe housing in St. Louis, which began in 1972, but this is his interpretation, not an agreed fact.`,
          },
          {
            id: L14,
            title: 'Swiss Style and International Typographic Design',
            blurb: 'Grids, sans-serif type and photography created a clear, objective approach to graphic design from the 1950s.',
            minutes: 7,
            body: `Swiss Style, also called the International Typographic Style, developed in Switzerland, especially in Zurich and Basel, from the 1940s and flourished in the 1950s and 1960s. Its goal was clear, objective communication that could cross language barriers, which suited multilingual Switzerland.

Its core features are the mathematical grid, which organises text and images on the page; sans-serif typefaces; text set flush left and ragged right; asymmetric layouts; plenty of white space; and the use of photographs rather than illustrations. The look reflects Bauhaus and De Stijl influences.

Key figures include Josef Muller-Brockmann, known for posters such as his 1955 poster for Zurich Tonhalle concerts and his book Grid Systems in Graphic Design (1981). In Basel, Armin Hofmann and Emil Ruder taught typography at the design school and shaped a generation. The journal Neue Grafik (1958 to 1965) spread the approach internationally.

Type matters to the movement. Helvetica, designed by Max Miedinger with Eduard Hoffmann at the Haas foundry in 1957 and originally called Neue Haas Grotesk, was renamed Helvetica in 1960. In the same year as the first release, Adrian Frutiger designed Univers. Both were meant to be neutral and clear.

Later, designers such as Wolfgang Weingart in Basel pushed the rules and began to loosen the grid, which fed into postmodern graphic design.

To recognise it: a strict grid, a sans-serif face, small neat captions, and a sense of calm order. Corporate logos and public signs worldwide still follow this approach.`,
          },
          {
            id: L15,
            title: 'American Mid-Century Modern',
            blurb: 'After the Second World War, new materials and a housing boom produced light, organic furniture and open houses.',
            minutes: 7,
            body: `Mid-century modern usually refers to design from about 1945 to the 1960s or early 1970s, mostly in the United States. The label itself became popular later; Cara Greenberg's 1984 book Mid-Century Modern: Furniture of the 1950s helped establish it.

Wartime technology fed the style. Charles and Ray Eames experimented with moulding plywood into curved shapes, first for leg splints for the U.S. Navy and then for chairs. Their moulded plywood chairs were produced from 1946, and the Eames Lounge Chair and Ottoman (1956, made for Herman Miller) became icons. Eero Saarinen designed the Womb chair (1948) and the Tulip chair (1956) for Knoll, aiming to remove the "slum of legs" beneath a table. Harry Bertoia made the Diamond chair (1952) from welded steel rod. George Nelson designed the Marshmallow sofa (1956), and Isamu Noguchi made his glass-topped coffee table in 1947.

Post-war Americans wanted homes. The magazine Arts and Architecture launched the Case Study House program in 1945, commissioning modern houses of glass, steel and wood; the Eames House (1949) is one. Richard Neutra's Kaufmann Desert House (1946) in Palm Springs shows the open indoor-outdoor ideal.

Typical features: organic curves, tapered legs, plywood, fibreglass, steel rod, bright accents, large windows and open plans. Modernism became a lifestyle, sold through department stores and magazines.`,
          },
          {
            id: L16,
            title: 'Scandinavian Design',
            blurb: 'Nordic designers combined craft, natural materials and democratic ideals into warm, practical modernism.',
            minutes: 7,
            body: `Scandinavian design refers to the modern design of Denmark, Sweden, Norway, Finland and Iceland, most celebrated from the 1930s to the 1960s. The Stockholm Exhibition of 1930, with architecture by Gunnar Asplund, introduced functionalism to the region. Unlike some continental modernism, the Nordic version often kept warmth: natural wood, soft shapes and attention to craft traditions. Many designers spoke of design as democratic, meant for ordinary homes.

In Finland, Alvar Aalto bent laminated wood for furniture such as the Paimio chair (1931 to 1932), and co-founded the firm Artek in 1935. His wavy Savoy vase dates from 1936. In Denmark, Hans Wegner designed chairs including the Round Chair (1949) and the Wishbone chair (1949), and Arne Jacobsen created the Ant (1952), Series 7 (1955) chairs, and the Egg and Swan chairs for the SAS Royal Hotel in Copenhagen (1958). Poul Henningsen designed the PH lamp to reduce glare. Finn Juhl and Borge Mogensen were other Danish leaders, working with a strong cabinetmaking tradition.

The touring exhibition Design in Scandinavia, shown in North America from 1954 to 1957, boosted the image of Nordic design abroad. Companies like Marimekko (founded 1951) in textiles and IKEA (founded 1943 by Ingvar Kamprad) brought the approach to a wide public, IKEA through flat-pack affordability.

To recognise it: pale or warm woods, gentle curves, clear craftsmanship, and uncluttered, usable objects.`,
          },
        ],
      },
      {
        id: 'design-movements.t5',
        title: 'Rebellions and Other Modernities',
        blurb: 'Concrete monuments, playful colour and the argument over what modernism left out, plus Japan\'s own path.',
        level: 'ADVANCED',
        lessons: [
          {
            id: L17,
            title: 'Brutalism',
            blurb: 'Raw concrete, bold masses and a belief in honest structure; loved, hated and now often protected.',
            minutes: 8,
            body: `Brutalism is an architectural approach of the 1950s to the 1970s. The name is not about brutality; it comes from the French beton brut, "raw concrete", a phrase associated with Le Corbusier's Unite d'Habitation in Marseille (1952), a large housing block whose concrete shows the marks of its wooden formwork. The British critic Reyner Banham discussed "The New Brutalism" in a 1955 essay, and wrote a book of that title in 1966. Alison and Peter Smithson's school at Hunstanton (1954) is often considered an early example, showing its structure and services honestly.

Typical features are heavy, sculptural concrete forms, board-marked or textured surfaces, repeated modular elements, and an emphasis on revealing how a building is made and how it works. Examples include the Barbican Estate in London (by Chamberlin, Powell and Bon, built from the 1960s, with its arts centre opening in 1982), the National Theatre in London (Denys Lasdun, opened 1976), Boston City Hall, Paul Rudolph's Art and Architecture Building at Yale (1963), and Marcel Breuer's Whitney Museum in New York (1966). Moshe Safdie's Habitat 67 in Montreal stacked concrete housing units, and Erno Goldfinger's Trellick Tower in London dates from 1972.

Many were built for universities, councils and governments, who valued economical, durable construction. Social-housing blocks sometimes suffered from poor maintenance and public stigma, and concrete can stain and crack, so many have been demolished.

Opinion has shifted. Admirers praise their ambition and civic purpose, and preservation campaigns now protect many. Critics still find them cold. Both views are part of the story.`,
          },
          {
            id: L18,
            title: 'Memphis and Postmodernism',
            blurb: 'Playful colour and historical reference challenged the idea that modern design should be plain.',
            minutes: 8,
            body: `By the 1960s, some designers felt modernism had become dogma. In architecture, Robert Venturi's book Complexity and Contradiction in Architecture (1966) answered Mies's motto "less is more" with "less is a bore". Learning from Las Vegas (1972), by Venturi, Denise Scott Brown and Steven Izenour, praised ordinary commercial signs. Charles Jencks's The Language of Post-Modern Architecture (1977) named and described the tendency.

Postmodern architecture used historical references, wit, colour and symbolic decoration. Charles Moore's Piazza d'Italia in New Orleans (1978) mixed classical columns with neon. Michael Graves's Portland Building (1982) used big painted shapes and keystones. Philip Johnson's AT&T Building in New York (completed 1984) has a broken-top pediment, a nod to classical furniture.

In design objects, the key group was Memphis. Ettore Sottsass gathered designers in Milan in December 1980, and the group launched in September 1981. The name is commonly said to come from a Bob Dylan song that was playing during that first meeting. Members included Michele De Lucchi, Matteo Thun, George Sowden, Nathalie du Pasquier and Martine Bedin. Memphis furniture, such as Sottsass's Carlton bookcase (1981), used bright, clashing colours, odd shapes, and cheap plastic laminate treated as a glamorous material. Michael Graves's 9093 kettle for Alessi (1985), with its little bird whistle, brought postmodern humour to the kitchen.

Critics called it superficial or kitsch; supporters said it restored meaning, humour and variety. To recognise it: bold colour, pattern, unlikely geometry, and jokes.`,
          },
          {
            id: L19,
            title: 'Japanese Design: Mingei and Metabolism',
            blurb: 'Japan developed a folk-craft philosophy and a futuristic architecture movement, each answering modernity in its own way.',
            minutes: 8,
            body: `Japanese design contributed its own responses to industrial modernity. Two contrasting examples are mingei and Metabolism.

Mingei means "folk craft" or "art of the people". In the mid-1920s the philosopher Yanagi Soetsu, with the potters Hamada Shoji and Kawai Kanjiro, coined the term to honour the plain, useful objects made by anonymous craftspeople: pottery, textiles, baskets and furniture. Yanagi argued such things have a beauty that comes from use and honest making. The Japan Folk Crafts Museum opened in Tokyo in 1936. Their ideas share ground with Arts and Crafts, and the British potter Bernard Leach, a friend of Yanagi and Hamada, helped carry mingei to the West. Yanagi's son, Sori Yanagi, was an industrial designer whose Butterfly stool (1954) joins two moulded plywood pieces with a metal rod.

Metabolism was an architecture and urban planning movement that emerged around the 1960 World Design Conference in Tokyo. Its members, including Kiyonori Kikutake, Kisho Kurokawa, Fumihiko Maki and the critic Noboru Kawazoe, proposed cities that could grow and change like living organisms, with replaceable capsules attached to permanent structural cores. Kenzo Tange, their teacher and a major figure himself, designed the Yoyogi National Gymnasium (1964). Kurokawa's Nakagin Capsule Tower in Tokyo (1972) put the idea into practice; it was dismantled in 2022.

Later, the retailer Muji, founded in 1980, applied plain, unbranded design to everyday goods.`,
          },
        ],
      },
      {
        id: 'design-movements.t6',
        title: 'Many Voices and Present Questions',
        blurb: 'Who was left out of the standard story, how design faces the climate crisis, and how to read all of it together.',
        level: 'ADVANCED',
        lessons: [
          {
            id: L20,
            title: 'Afrofuturism and Global Design Voices',
            blurb: 'Designers beyond Europe and North America have reshaped modernism with local materials, climates and imagined futures.',
            minutes: 8,
            body: `Histories of design written in the twentieth century centred Europe and the United States. Expanding the story shows how modernism was adapted, challenged and reinvented elsewhere.

Afrofuturism is a cultural and aesthetic approach that imagines Black futures through art, music, literature and design. The critic Mark Dery used the term in his 1993 essay "Black to the Future", though the practices it names are older: the musician Sun Ra and the novelist Octavia Butler are often associated with it. In design, its influence reached wide audiences with the film Black Panther (2018), whose fictional nation Wakanda mixed African textiles, patterns and imagined technology. Ruth E. Carter won the Academy Award for costume design for the film, and Hannah Beachler won for production design.

Elsewhere, designers have fused modernism with place. Luis Barragan in Mexico used thick walls and intense colour (he received the Pritzker Prize in 1980). Lina Bo Bardi, born in Italy and working in Brazil, designed the Sao Paulo Museum of Art (1968) and the SESC Pompeia leisure centre (completed in the 1980s). Geoffrey Bawa in Sri Lanka developed a tropical modernism blending buildings with gardens. Balkrishna Doshi in India received the Pritzker Prize in 2018. Diebedo Francis Kere, from Burkina Faso, built the Gando Primary School (2001) using local clay bricks and community labour, and received the Pritzker Prize in 2022.

The common thread is context: climate, materials and community shape what good design is.`,
          },
          {
            id: L21,
            title: 'Sustainable and Contemporary Design',
            blurb: 'Today designers weigh climate, waste and inclusion alongside beauty and function.',
            minutes: 8,
            body: `Concern for the environment has become a major design theme. The designer Victor Papanek's book Design for the Real World (1971) argued that designers had a responsibility for social and ecological consequences. Dieter Rams, head of design at Braun, listed ten principles of good design; one states that good design is environmentally friendly, and another asks for as little design as possible. His 606 Universal Shelving System for Vitsoe (1960) was meant to be adapted and kept for decades.

Sustainable design considers a product's whole life: materials, manufacture, use, repair and disposal. Ideas include the circular economy, where materials are reused rather than thrown away, and the "cradle to cradle" approach, named in a 2002 book by William McDonough and Michael Braungart, which proposes that materials should be designed as either biological or technical nutrients that can be safely recycled. Modular, repairable products, such as the Fairphone smartphone, aim to reduce waste.

In architecture, the Passivhaus standard, developed in Germany from the 1990s, reduces heating needs through insulation and airtightness. Engineered timber, such as cross-laminated timber, stores carbon and has enabled tall wooden buildings; the Mjostarnet tower in Norway (2019) was for a time the tallest timber building. Designers also think about embodied carbon, the emissions created in making a building.

Contemporary design also includes inclusive design, which seeks products usable by people with different abilities.

There are real debates: whether "green" claims are marketing, and whether the answer is better products or fewer ones.`,
          },
          {
            id: L22,
            title: 'Recognising Movements and Reading the Big Arguments',
            blurb: 'A field guide to the course: how to tell the movements apart and which questions keep returning.',
            minutes: 8,
            body: `You now have a map of roughly 150 years. Here is a field guide, followed by the arguments that connect the movements.

Recognition clues. Arts and Crafts: honest joinery, natural materials, flowing plant patterns. Art Nouveau: whiplash curves and organic cast iron. Secession and Wiener Werkstatte: refined squares and grids. Bauhaus: geometry, primary colours, tubular steel. De Stijl: red, yellow, blue and black lines on white. Constructivism: diagonals and bold red-and-black graphics. Art Deco: symmetrical zigzags, glamorous materials. Streamline Moderne: rounded corners, horizontal speed lines. International Style: glass boxes on steel frames. Swiss Style: grids and Helvetica-like type. Mid-century modern: moulded plywood and tapered legs. Scandinavian design: warm wood, gentle curves. Brutalism: raw concrete masses. Memphis: clashing colours and pattern.

The big arguments.
- First, machine versus hand: Morris distrusted the machine, the Werkbund and Bauhaus tried to guide it.
- Second, ornament versus plainness: Art Nouveau and Deco embraced decoration, Loos and the International Style rejected it, Postmodernism brought it back.
- Third, universal versus local: the International Style aimed to be worldwide, while Mingei, Scandinavian design and the global voices of lesson 20 argued for place.
- Fourth, who benefits: many movements spoke of design for everyone, yet their products were often expensive.

A useful exercise: pick an object in your room and ask three questions. What is it made of? What does its form say about the machine and ornament? Who was it designed for? Your answers will place it in this conversation.`,
          },
        ],
      },
    ],
  },
  bank: {
    curriculumId: 'design-movements',
    questions: [
      // L01
      tf(L01, 1, 1, 'The Crystal Palace of 1851 was built mostly from iron and glass.', 0, 'Think of the materials named in the lesson.', 'Joseph Paxton designed the Great Exhibition building as an iron and glass structure assembled from standard parts.'),
      mc(L01, 2, 1, 'What worry did many Victorian critics have about machine-made goods?', ['That cheap imitation ornament and treating workers like machine parts cost beauty and honest work', 'That machines were too slow to meet demand', 'That factory goods were always more expensive than handmade ones', 'That machines could only make plain objects'], 'Consider what machines could copy cheaply.', 'Critics such as Pugin and Ruskin objected to imitation decoration and to labour that treated people like machine parts.'),
      mc(L01, 3, 2, 'Which writer praised the visible, imperfect work of medieval craftspeople in The Stones of Venice?', ['John Ruskin', 'Owen Jones', 'Joseph Paxton', 'Michael Thonet'], 'He later inspired William Morris.', 'Ruskin admired medieval stonecutters and criticised dehumanising factory labour.'),
      tf(L01, 4, 2, 'The Thonet No. 14 chair is offered in the lesson as a sign that industry and good design could coexist.', 0, 'It was simple and sold in large numbers.', 'Its bent-wood construction was cheap and widely sold, suggesting well-designed mass production was possible.'),
      mc(L01, 5, 3, 'Owen Jones argued in The Grammar of Ornament that decoration should', ['respect the flat surface it covers rather than imitate nature realistically', 'copy nature as exactly as possible', 'be removed from all buildings', 'be made only by machines'], 'It concerns the relation between pattern and surface.', 'Jones argued for flat, stylised pattern suited to the surface it decorates.'),
      // L02
      mc(L02, 1, 1, 'Who was the central figure of the British Arts and Crafts movement?', ['William Morris', 'Walter Gropius', 'Victor Horta', 'Josef Hoffmann'], 'He founded the Kelmscott Press.', 'William Morris designed, wrote and campaigned for well-made, useful and beautiful things.'),
      tf(L02, 2, 1, 'Arts and Crafts designers favoured visible joinery and natural materials such as oak.', 0, 'Honesty of construction was a value.', 'Exposed construction and natural materials are typical features of the movement.'),
      mc(L02, 3, 2, 'What was the Kelmscott Press?', ['A press founded by Morris in 1891 to print beautiful books', 'A magazine for Art Nouveau', 'A Bauhaus workshop', 'A Viennese silverware firm'], 'It connects Morris to the book arts.', 'Morris founded the Kelmscott Press in 1891 to produce finely made books.'),
      mc(L02, 4, 2, 'Which American house, completed 1908 to 1909, is an example of Arts and Crafts design?', ['The Gamble House in Pasadena', 'The Chrysler Building', 'The Schroder House in Utrecht, Netherlands', 'The Seagram Building'], 'Think of the Greene brothers.', 'The Greene brothers designed the Gamble House with exposed timber joinery.'),
      tf(L02, 5, 3, 'Morris acknowledged that his handmade products were often bought by the wealthy rather than by ordinary workers.', 0, 'Handwork was expensive.', 'The irony that costly handwork served wealthy buyers is one of the movement\'s well-known tensions.'),
      // L03
      mc(L03, 1, 1, 'Which feature best identifies Art Nouveau?', ['Flowing, curving lines taken from plants', 'Strict red, yellow and blue grids', 'Raw unfinished concrete', 'Rounded, streamlined corners and glass blocks'], 'Think of stems and tendrils.', 'The whiplash curve inspired by plant forms is its signature.'),
      tf(L03, 2, 1, 'Art Nouveau architects used industrial materials such as iron and glass.', 0, 'Horta and Guimard are examples.', 'Unlike some Arts and Crafts designers, Art Nouveau embraced iron and glass.'),
      mc(L03, 3, 2, 'What was the German name for Art Nouveau?', ['Jugendstil', 'Modernisme in Barcelona', 'Stile Liberty', 'Deutscher Werkbund'], 'It comes from a Munich magazine.', 'Jugendstil took its name from the magazine Jugend, founded in 1896.'),
      mc(L03, 4, 2, 'Which designer created entrances to the Paris Metro in cast iron and glass?', ['Hector Guimard', 'Antoni Gaudi', 'Alphonse Mucha', 'Emile Galle'], 'He worked in Paris around 1900.', 'Hector Guimard designed the Metro entrances beginning around 1900.'),
      mc(L03, 5, 3, 'In Catalonia, Art Nouveau appeared under which name, seen in Gaudi\'s Casa Batlló?', ['Modernisme', 'Jugendstil in Germany', 'Secession in Vienna', 'Mingei in Japan'], 'The word resembles "modern".', 'The Catalan variant is called Modernisme.'),
      // L04
      mc(L04, 1, 1, 'Who was the first president of the Vienna Secession?', ['Gustav Klimt', 'Adolf Loos', 'Peter Behrens', 'Walter Gropius'], 'He was a painter.', 'Klimt led the group when it formed in 1897.'),
      tf(L04, 2, 1, 'The Wiener Werkstatte designed objects ranging from furniture to jewellery.', 0, 'It aimed at a total work of art.', 'The workshop made furniture, silver, jewellery, textiles and more.'),
      mc(L04, 3, 2, 'Which two people founded the Wiener Werkstatte in 1903?', ['Josef Hoffmann and Koloman Moser', 'Adolf Loos and Otto Wagner, both Viennese architects', 'Klimt and Olbrich', 'Mies and Gropius'], 'One was an architect, the other a designer and artist.', 'Hoffmann and Moser founded it, with financial backing from Fritz Waerndorfer.'),
      mc(L04, 4, 2, 'What position did Adolf Loos take in Ornament and Crime?', ['Applied ornament was wasteful and outdated for modern life', 'Ornament should cover every surface', 'Handcraft is the only honest way to make things', 'Only gold should be used on buildings'], 'The title is a clue.', 'Loos argued against applied ornament, an approach that influenced later modernism.'),
      tf(L04, 5, 3, 'The Palais Stoclet is in Vienna.', 1, 'Check the city in the lesson.', 'The Palais Stoclet is in Brussels, designed by Hoffmann.'),
      // L05
      mc(L05, 1, 1, 'How did the Deutscher Werkbund differ from Morris\'s approach?', ['It wanted to improve mass-produced goods rather than reject the machine', 'It banned the use of machinery', 'It only made handmade furniture', 'It focused on ancient styles'], 'Think about industry.', 'The Werkbund sought good design in industrial production.'),
      tf(L05, 2, 1, 'The Werkbund was founded in Munich in 1907.', 0, 'It is the same year Behrens joined AEG.', 'The group was founded in 1907 by architects, designers and manufacturers.'),
      mc(L05, 3, 2, 'Which designer became artistic consultant to AEG in 1907?', ['Peter Behrens', 'Hermann Muthesius', 'Henry van de Velde', 'Marcel Breuer'], 'He designed the Turbine Factory.', 'Behrens designed AEG\'s buildings, products and graphics in a unified identity.'),
      mc(L05, 4, 2, 'What was debated at the Werkbund in 1914?', ['Standardised types versus individual artistic creativity', 'Whether to use steel or iron', 'Whether to move to Weimar', 'Whether to ban colour'], 'Muthesius and van de Velde disagreed.', 'Muthesius favoured standardisation, while van de Velde defended artistic individuality.'),
      mc(L05, 5, 3, 'Which building by Gropius and Adolf Meyer, from 1911, features a largely glass corner?', ['The Fagus Factory', 'The Villa Savoye', 'The Palais Stoclet', 'The Gamble House'], 'It was a factory in Alfeld.', 'The Fagus Factory is an early modern landmark by Gropius and Meyer.'),
      // L06
      mc(L06, 1, 1, 'Who founded the Bauhaus in 1919?', ['Walter Gropius', 'Josef Albers, a Bauhaus master', 'Hannes Meyer, the Swiss architect', 'Peter Behrens of the AEG firm'], 'He was an architect and the first director.', 'Gropius founded the school in Weimar in April 1919.'),
      tf(L06, 2, 1, 'Every Bauhaus student began with the preliminary course (Vorkurs).', 0, 'It introduced materials, colour and form.', 'The Vorkurs was the foundation of Bauhaus teaching.'),
      mc(L06, 3, 2, 'Which teacher first ran the preliminary course?', ['Johannes Itten', 'Marcel Breuer', 'Herbert Bayer', 'Mies van der Rohe'], 'His approach was expressive and spiritual.', 'Itten ran it first; Moholy-Nagy and Albers later shaped it.'),
      mc(L06, 4, 3, 'What did the 1923 exhibition slogan signal?', ['A shift toward design for industry', 'A return to purely medieval craft work', 'The closure of the school', 'A move to Berlin'], 'Look at the words "Art and Technology".', 'The slogan indicated a move from craft expressionism toward industrial design.'),
      tf(L06, 5, 2, 'The Bauhaus left Weimar partly because regional politics cut its funding.', 0, 'Thuringia\'s government changed.', 'After right-wing parties gained power in Thuringia, funding was reduced and the school left in 1925.'),
      // L07
      tf(L07, 1, 1, 'Gropius designed the Bauhaus building in Dessau.', 0, 'It opened in December 1926.', 'Gropius designed the Dessau school and the masters\' houses.'),
      mc(L07, 2, 2, 'Who designed tubular steel furniture, including the chair now called the Wassily chair?', ['Marcel Breuer', 'Marianne Brandt', 'Herbert Bayer', 'Hannes Meyer'], 'He worked in the Dessau years.', 'Breuer designed the chair around 1925 to 1926.'),
      mc(L07, 3, 2, 'Who directed the Bauhaus from 1930 until its closure as a Berlin school?', ['Ludwig Mies van der Rohe', 'Hannes Meyer, a Swiss architect', 'Walter Gropius', 'Paul Klee'], 'He followed Hannes Meyer.', 'Mies took over in 1930 and moved the school to Berlin.'),
      mc(L07, 4, 3, 'In what year did the faculty vote to dissolve the Bauhaus under Nazi pressure?', ['1933', '1919', '1925', '1945'], 'It was after a police search in April.', 'The school dissolved itself in July 1933.'),
      tf(L07, 5, 3, 'The Bauhaus lasted about fourteen years.', 0, 'Count from 1919.', 'It ran from 1919 to 1933.'),
      // L08
      mc(L08, 1, 1, 'Which idea was central to Bauhaus teaching?', ['Starting design education with basic elements like line, shape and colour', 'Copying historical styles', 'Avoiding all use of colour', 'Making only luxury goods'], 'Think of the preliminary course.', 'Foundation teaching on basic elements remains the Bauhaus\'s most lasting method.'),
      mc(L08, 2, 2, 'Where did Moholy-Nagy found the New Bauhaus in 1937?', ['Chicago', 'Boston, Massachusetts', 'Weimar, Germany', 'Basel, Switzerland'], 'It later became the Institute of Design.', 'He founded it in Chicago, and it became the Institute of Design.'),
      tf(L08, 3, 2, 'After 1933, Bauhaus teachers took their ideas to schools in the United States.', 0, 'Albers, Gropius, Breuer and Mies all moved.', 'Exile spread Bauhaus methods through Chicago, Harvard, Yale and elsewhere.'),
      mc(L08, 4, 3, 'Which school, founded in 1953, continued some Bauhaus approaches in Germany?', ['The Ulm School of Design', 'The Black Mountain College', 'The Wiener Werkstatte', 'The Art Workers\' Guild'], 'It is a German design school.', 'The Ulm School of Design continued aspects of Bauhaus teaching.'),
      tf(L08, 5, 3, 'All Bauhaus products were cheap and widely mass-produced.', 1, 'Consider the debate in the lesson.', 'Many Bauhaus designs were costly to make, so the dream of cheap mass production was only partly met.'),
      // L09
      mc(L09, 1, 1, 'Which colours are central to De Stijl?', ['Red, yellow and blue with black, white and grey', 'Gold and silver only', 'Pastel pinks and greens', 'Earth browns and oranges'], 'They are the primary colours.', 'De Stijl used primary colours plus black, white and grey.'),
      mc(L09, 2, 1, 'Who designed the Red and Blue Chair?', ['Gerrit Rietveld', 'Theo van Doesburg', 'El Lissitzky', 'Piet Mondrian'], 'He also designed the Schroder House.', 'Rietveld designed the chair around 1917 to 1918.'),
      tf(L09, 3, 2, 'Constructivism emerged in Russia after the 1917 revolution.', 0, 'The movement wanted art to serve society.', 'Its artists designed posters, textiles and buildings for social use.'),
      mc(L09, 4, 2, 'What is Tatlin\'s Monument to the Third International?', ['A model for a spiralling iron tower that was never built', 'A completed concrete skyscraper', 'A Dutch house with sliding walls', 'A poster showing a red wedge'], 'It was a design for a tower.', 'Tatlin made a model in 1919 to 1920; the full tower was not built.'),
      mc(L09, 5, 3, 'How does the lesson contrast De Stijl and Constructivism?', ['De Stijl sought calm universal balance, Constructivism favoured dynamic diagonals and social use', 'De Stijl used diagonals, Constructivism used only horizontals', 'Both rejected geometry', 'Constructivism avoided politics, De Stijl embraced it'], 'Think of each group\'s goals.', 'De Stijl aimed at harmony; Constructivism used dynamic form for social and political purposes.'),
      // L10
      mc(L10, 1, 1, 'Where did the name Art Deco come from?', ['A 1925 exhibition in Paris of decorative and industrial arts', 'A Bauhaus workshop', 'A Viennese magazine', 'A New York museum show of 1932'], 'The exposition had a long French title.', 'The name was shortened later from the 1925 Paris Exposition internationale des arts decoratifs et industriels modernes.'),
      tf(L10, 2, 1, 'The 1925 exposition required exhibits to be modern rather than copies of historical styles.', 0, 'Historical copies were not welcome.', 'The rules demanded modern design.'),
      mc(L10, 3, 2, 'Which is a typical Art Deco motif?', ['Zigzags, chevrons and sunbursts', 'Whiplash curves of climbing vines and tendrils in iron', 'Raw concrete showing the marks of its timber formwork', 'Plain unornamented white walls with flat roofs'], 'Think geometric.', 'Geometric patterns and stepped forms are hallmarks of Deco.'),
      mc(L10, 4, 2, 'Who made luxurious glass for perfume bottles and vases?', ['Rene Lalique', 'Emile-Jacques Ruhlmann', 'Sonia Delaunay', 'Konstantin Melnikov'], 'He is known for glass.', 'Lalique produced glass perfume bottles, vases and car mascots.'),
      tf(L10, 5, 3, 'Le Corbusier\'s pavilion at the 1925 exposition was richly ornamented in the Deco manner.', 1, 'It represented a different modern vision.', 'The Pavillon de l\'Esprit Nouveau was plain and unornamented.'),
      // L11
      mc(L11, 1, 1, 'Which New York building completed in 1930 has a stainless steel sunburst spire?', ['The Chrysler Building', 'The Seagram Building in New York', 'Lever House', 'The Guggenheim'], 'Van Alen designed it.', 'The Chrysler Building, by William Van Alen, was completed in 1930.'),
      tf(L11, 2, 1, 'The Chrysler Building was the tallest building in the world for a short time.', 0, 'The Empire State Building soon overtook it.', 'It held the record briefly until the Empire State Building in 1931.'),
      mc(L11, 3, 2, 'Which New Zealand city was rebuilt largely in Art Deco after an earthquake in 1931?', ['Napier', 'Auckland', 'Wellington', 'Dunedin'], 'Its name starts with N.', 'Napier\'s rebuilding after the 1931 earthquake produced a Deco town centre.'),
      mc(L11, 4, 2, 'Which ocean liner entering service in 1935 was known for lavish interiors?', ['Normandie', 'The Titanic', 'Queen Anne', 'Hindenburg'], 'It was French.', 'The French liner Normandie was a Deco showpiece.'),
      mc(L11, 5, 3, 'Who designed the Park Hotel in Shanghai (1934)?', ['Laszlo Hudec', 'Donald Deskey', 'Hector Guimard', 'Gunnar Asplund'], 'A Hungarian architect.', 'Hudec designed the hotel, an example of Deco beyond Europe and America.'),
      // L12
      mc(L12, 1, 1, 'What shape inspired Streamline Moderne?', ['The teardrop shape that reduces air resistance', 'The cube', 'The Gothic arch', 'The spiral staircase'], 'Think of aircraft and trains.', 'Smooth curves borrowed from aerodynamic forms inspired the style.'),
      tf(L12, 2, 1, 'Streamlining was only applied to vehicles.', 1, 'Pencil sharpeners are mentioned.', 'Designers also streamlined stationary objects, which critics noted was symbolic.'),
      mc(L12, 3, 2, 'Which designer\'s Futurama exhibit appeared at the 1939 New York World\'s Fair?', ['Norman Bel Geddes', 'Raymond Loewy the designer', 'Charles Eames of California', 'Eero Saarinen, the architect'], 'It was for General Motors.', 'Bel Geddes designed Futurama, imagining a future of highways.'),
      tf(L12, 4, 2, 'The Douglas DC-3 is described as a practical streamlined aircraft.', 0, 'It first flew in 1935.', 'The DC-3 used real aerodynamic thinking.'),
      mc(L12, 5, 3, 'What criticism did some people make of streamlined staplers?', ['The shape symbolised speed but did not serve any real aerodynamic need', 'They were too heavy to lift', 'They could not be mass-produced', 'They used too much ornament'], 'They never move through air.', 'Streamlining of static objects was symbolic rather than functional.'),
      // L13
      mc(L13, 1, 1, 'Where was the 1932 exhibition that named the International Style held?', ['The Museum of Modern Art in New York', 'The Tate in London', 'The Bauhaus in Dessau', 'The Louvre in Paris'], 'It is a New York museum.', 'MoMA staged the show, organised by Hitchcock and Johnson.'),
      mc(L13, 2, 2, 'Which is one of Le Corbusier\'s five points of a new architecture?', ['Pilotis lifting the building on columns', 'Heavy applied ornament', 'Load-bearing brick facades', 'Pitched tile roofs'], 'It involves columns.', 'Pilotis were one of his five points of 1927.'),
      tf(L13, 3, 1, 'The Seagram Building in New York was designed with Mies van der Rohe\'s involvement.', 0, 'Philip Johnson also worked on it.', 'Mies designed it, with Philip Johnson, completed in 1958.'),
      mc(L13, 4, 2, 'Which principle did Hitchcock and Johnson list?', ['Avoidance of applied ornament', 'Heavy axial symmetry in every plan', 'Use of historical styles', 'Dense decoration'], 'The style was plain.', 'They stressed volume, regularity and absence of applied ornament.'),
      mc(L13, 5, 3, 'What did Jane Jacobs argue in 1961?', ['Modernist planning damaged lively city streets', 'Skyscrapers should be taller', 'Concrete is the best material for rebuilding cities', 'Cities should be built without streets'], 'Her book concerned American cities.', 'She argued that large-scale modernist planning harmed street life.'),
      // L14
      mc(L14, 1, 1, 'Which features are typical of Swiss Style?', ['A grid, sans-serif type and white space', 'Ornate serif lettering with decorative borders', 'Hand-drawn script', 'Dense decorative patterns'], 'Think order and clarity.', 'The grid, sans-serif type and white space define the look.'),
      tf(L14, 2, 1, 'Text in Swiss Style is often set flush left and ragged right.', 0, 'It is an asymmetric layout habit.', 'Flush-left, ragged-right text is characteristic.'),
      mc(L14, 3, 2, 'Who designed the typeface Helvetica, originally Neue Haas Grotesk?', ['Max Miedinger with Eduard Hoffmann', 'Adrian Frutiger alone', 'Herbert Bayer', 'Paul Renner'], 'It came from the Haas foundry in 1957.', 'Miedinger and Hoffmann created it in 1957; renamed Helvetica in 1960.'),
      mc(L14, 4, 2, 'Which designer wrote Grid Systems in Graphic Design?', ['Josef Muller-Brockmann', 'Armin Hofmann of the Basel school', 'Wolfgang Weingart, Basel teacher', 'Emil Ruder, typographer in Basel'], 'He also made the 1955 Tonhalle poster.', 'Muller-Brockmann wrote the book in 1981.'),
      mc(L14, 5, 3, 'Which designer in Basel began loosening the strict grid?', ['Wolfgang Weingart', 'Josef Muller-Brockmann', 'Eduard Hoffmann', 'Max Miedinger'], 'His work fed postmodern graphics.', 'Weingart pushed the rules and influenced postmodern graphic design.'),
      // L15
      mc(L15, 1, 1, 'Which material did Charles and Ray Eames mould into curved chairs?', ['Plywood', 'Raw concrete', 'Cast iron', 'Polished marble'], 'They first used it for leg splints.', 'Their moulded plywood experiments began with wartime splints.'),
      tf(L15, 2, 1, 'The Eames Lounge Chair and Ottoman was made for Herman Miller in 1956.', 0, 'It is an icon of the period.', 'The chair appeared in 1956.'),
      mc(L15, 3, 2, 'Which program commissioned modern houses starting in 1945?', ['Case Study House program', 'Design in Scandinavia', 'Werkbund Weissenhof housing estate', 'Metabolism'], 'A California magazine ran it.', 'Arts and Architecture magazine started it in 1945.'),
      mc(L15, 4, 2, 'Which designer made the Diamond chair from welded steel rod?', ['Harry Bertoia', 'Eero Saarinen', 'George Nelson', 'Isamu Noguchi'], 'It was made for Knoll in 1952.', 'Bertoia designed it in 1952.'),
      tf(L15, 5, 3, 'The label "mid-century modern" was popularized by a book published in 1984, decades after the style itself.', 0, 'The lesson mentions a 1984 book.', 'The label became popular later; a 1984 book helped establish it.'),
      // L16
      mc(L16, 1, 1, 'Which Finnish designer bent laminated wood for the Paimio chair?', ['Alvar Aalto', 'Arne Jacobsen', 'Hans Wegner', 'Poul Henningsen'], 'He co-founded Artek.', 'Aalto designed the Paimio chair in 1931 to 1932.'),
      mc(L16, 2, 2, 'Which Danish designer created the Egg and Swan chairs for the SAS Royal Hotel?', ['Arne Jacobsen', 'Finn Juhl', 'Borge Mogensen', 'Alvar Aalto'], 'He also made the Ant chair.', 'Jacobsen designed them for the hotel in 1958.'),
      tf(L16, 3, 1, 'Scandinavian design often kept warmth through natural wood and soft shapes.', 0, 'It differed from some colder modernism.', 'Natural woods and craft values define the style.'),
      mc(L16, 4, 2, 'Which touring exhibition boosted the Nordic design image in North America?', ['Design in Scandinavia', 'Memphis Milano', 'The New Brutalism', 'Learning from Las Vegas'], 'It toured from 1954 to 1957.', 'Design in Scandinavia travelled North America in those years.'),
      mc(L16, 5, 3, 'Which company was founded in 1943 by Ingvar Kamprad?', ['IKEA', 'Marimekko', 'Artek', 'Herman Miller'], 'It sells flat-pack furniture.', 'IKEA was founded in 1943.'),
      // L17
      mc(L17, 1, 1, 'What does the French phrase beton brut mean?', ['Raw concrete', 'Brutal building', 'Bold design', 'Bare steel'], 'It describes unfinished material.', 'Brutalism is named from "raw concrete", not from brutality.'),
      mc(L17, 2, 2, 'Which Le Corbusier building of 1952 is associated with the name?', ['Unite d\'Habitation in Marseille', 'Villa Savoye', 'The Barbican in the City of London', 'Habitat 67'], 'It is a housing block.', 'The Marseille block shows its formwork marks.'),
      tf(L17, 3, 1, 'Brutalist buildings often reveal how they are made and how they work.', 0, 'Honest structure is a theme.', 'Showing structure and materials is typical.'),
      mc(L17, 4, 2, 'Which London complex was designed by Chamberlin, Powell and Bon?', ['The Barbican Estate', 'Trellick Tower', 'The National Theatre', 'Hunstanton School'], 'It was completed in 1982.', 'The Barbican was built from the 1960s and completed in 1982.'),
      tf(L17, 5, 3, 'Public opinion about Brutalism has stayed unchanged since the 1960s.', 1, 'Preservation campaigns exist today.', 'Opinion has shifted, with many buildings now protected while others are still disliked.'),
      // L18
      mc(L18, 1, 1, 'Which phrase answered "less is more" in Venturi\'s 1966 book?', ['Less is a bore', 'More is better', 'Form follows function', 'Ornament is crime'], 'It is a rhyming retort.', 'Venturi wrote "less is a bore".'),
      mc(L18, 2, 2, 'Who led the Memphis group in Milan?', ['Ettore Sottsass', 'Michael Graves of Princeton', 'Philip Johnson of New York', 'Charles Moore of California'], 'He designed the Carlton bookcase.', 'Sottsass gathered the designers in December 1980.'),
      tf(L18, 3, 1, 'Memphis furniture often used bright, clashing colours.', 0, 'Think of the look.', 'Bold colour and pattern are signatures.'),
      mc(L18, 4, 2, 'Which postmodern building has a broken-top pediment?', ['The AT&T Building in New York', 'The Portland Building in Oregon', 'The Seagram Building', 'Unite d\'Habitation'], 'Johnson designed it.', 'AT&T, completed in 1984, has the broken pediment.'),
      mc(L18, 5, 3, 'Who designed the 9093 kettle with a bird whistle for Alessi?', ['Michael Graves', 'Ettore Sottsass', 'Robert Venturi', 'Dieter Rams'], 'It dates from 1985.', 'Graves designed the playful kettle.'),
      // L19
      mc(L19, 1, 1, 'What does mingei mean?', ['Folk craft', 'Capsule tower', 'Raw concrete', 'Empty space'], 'It concerns objects made by ordinary craftspeople.', 'Mingei refers to the art of the people.'),
      tf(L19, 2, 1, 'Yanagi Soetsu helped coin the term mingei in the mid-1920s.', 0, 'Hamada and Kawai worked with him.', 'He did so with Hamada Shoji and Kawai Kanjiro.'),
      mc(L19, 3, 2, 'What did Metabolist architects propose?', ['Cities that could grow and change like organisms', 'Fixed cities that never change', 'Cities without buildings', 'Only wooden villages'], 'The name suggests biology.', 'They proposed replaceable capsules attached to permanent cores.'),
      mc(L19, 4, 2, 'Which Metabolist building from 1972 put capsules into practice?', ['The Nakagin Capsule Tower', 'The Yoyogi Gymnasium in Tokyo', 'The Barbican', 'The Gando School'], 'Kurokawa designed it.', 'It was dismantled in 2022.'),
      mc(L19, 5, 3, 'Who designed the Butterfly stool in 1954?', ['Sori Yanagi', 'Kenzo Tange', 'Kisho Kurokawa', 'Bernard Leach'], 'He was the son of Yanagi Soetsu.', 'Sori Yanagi designed it from two plywood pieces.'),
      // L20
      mc(L20, 1, 1, 'Who coined the term Afrofuturism in a 1993 essay?', ['Mark Dery', 'Sun Ra, the jazz musician', 'Octavia Butler', 'Ruth Carter'], 'The essay was titled "Black to the Future".', 'Dery used the term, though the practice is older.'),
      tf(L20, 2, 1, 'Ruth E. Carter won an Academy Award for costume design for Black Panther.', 0, 'The film was released in 2018.', 'She won the award for costume design.'),
      mc(L20, 3, 2, 'Which architect built the Gando Primary School using local clay bricks?', ['Francis Kere', 'Luis Barragan', 'Geoffrey Bawa', 'Balkrishna Doshi'], 'He is from Burkina Faso.', 'Kere built it in 2001 and won the Pritzker Prize in 2022.'),
      mc(L20, 4, 2, 'Which designer is associated with tropical modernism in Sri Lanka?', ['Geoffrey Bawa', 'Lina Bo Bardi', 'Luis Barragan', 'Balkrishna Doshi'], 'He blended buildings with gardens.', 'Bawa developed tropical modernism.'),
      mc(L20, 5, 3, 'What common thread links the global designers in the lesson?', ['Climate, materials and community shape good design', 'All rejected modernism entirely', 'All used only concrete', 'All worked in Europe'], 'Think about context.', 'They adapted modernism to place.'),
      // L21
      mc(L21, 1, 1, 'Who wrote Design for the Real World in 1971?', ['Victor Papanek', 'Dieter Rams', 'Michael Braungart', 'Peter Behrens'], 'He argued designers had social and ecological responsibility.', 'Papanek raised those concerns.'),
      tf(L21, 2, 1, 'Sustainable design considers a product\'s whole life, including repair and disposal.', 0, 'Think beyond manufacture.', 'Life-cycle thinking is central.'),
      mc(L21, 3, 2, 'What does the circular economy aim to do?', ['Reuse materials rather than throw them away', 'Make products more disposable', 'Use only new materials', 'Ban recycling'], 'The name suggests a loop.', 'Materials stay in use.'),
      mc(L21, 4, 2, 'Which standard reduces heating needs through insulation and airtightness?', ['Passivhaus', 'The Mingei movement', 'Metabolism movement', 'Memphis style group'], 'It came from Germany.', 'Passivhaus began in the 1990s.'),
      tf(L21, 5, 3, 'Engineered timber such as cross-laminated timber can store carbon and allow tall wooden buildings.', 0, 'Mjostarnet is an example.', 'The Norwegian tower of 2019 was for a time the tallest timber building.'),
      // L22
      mc(L22, 1, 1, 'Which movement is recognised by red, yellow and blue lines on white?', ['De Stijl', 'Art Nouveau', 'Brutalism', 'Streamline Moderne'], 'Mondrian and Rietveld.', 'Primary colours with black and white are De Stijl\'s mark.'),
      mc(L22, 2, 1, 'Which movement is recognised by raw concrete masses?', ['Brutalism', 'Art Deco', 'Memphis', 'Scandinavian design'], 'Think beton brut.', 'Raw concrete is its trademark.'),
      tf(L22, 3, 2, 'Postmodernism brought decoration and historical reference back after the International Style.', 0, 'It answered "less is more".', 'Postmodern designers reintroduced ornament and wit.'),
      mc(L22, 4, 2, 'Which argument asks whether design should be worldwide or tied to place?', ['Universal versus local', 'Machine versus hand', 'Ornament versus plainness', 'Rich versus poor'], 'Think International Style versus Mingei.', 'It contrasts universal modernism with local approaches.'),
      mc(L22, 5, 3, 'Which clue best points to Art Deco?', ['Symmetrical zigzags in glamorous materials', 'Whiplash plant curves in iron', 'Grid with sans-serif type', 'Unfinished concrete'], 'Think of the Chrysler Building.', 'Symmetry, geometry and luxury are Deco hallmarks.'),
    ],
  },
};
