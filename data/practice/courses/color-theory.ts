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

const L01 = 'color-theory.l01';
const L02 = 'color-theory.l02';
const L03 = 'color-theory.l03';
const L04 = 'color-theory.l04';
const L05 = 'color-theory.l05';
const L06 = 'color-theory.l06';
const L07 = 'color-theory.l07';
const L08 = 'color-theory.l08';
const L09 = 'color-theory.l09';
const L10 = 'color-theory.l10';
const L11 = 'color-theory.l11';
const L12 = 'color-theory.l12';
const L13 = 'color-theory.l13';
const L14 = 'color-theory.l14';
const L15 = 'color-theory.l15';
const L16 = 'color-theory.l16';
const L17 = 'color-theory.l17';
const L18 = 'color-theory.l18';
const L19 = 'color-theory.l19';
const L20 = 'color-theory.l20';

export const COURSE_MODULE: CourseModule = {
  curriculum: {
    id: 'color-theory',
    label: 'Color Theory',
    blurb: 'How light, pigment and the eye make color, how colors work together, and how artists, filmmakers, designers and lighting crews put that knowledge to use.',
    accent: '#E23B6D',
    framework: 'ncas',
    tracks: [
      {
        id: 'color-theory.t1',
        title: 'What Color Is',
        blurb: 'Light, the eye, mixing light versus mixing paint, and the three dimensions that describe any color.',
        level: 'FOUNDATION',
        lessons: [
          {
            id: L01,
            title: 'Light, Eyes and the Idea of Color',
            blurb: 'Color is not stored in objects; it comes from light, surfaces and the way your eyes and brain respond.',
            minutes: 6,
            body: `Hold a red apple in a sunny room and it looks red. Carry it into a room lit only by green light and it looks nearly black. The apple has not changed, so where did the red go? The answer is that color is not a single thing sitting inside an object. It is an experience produced by three partners working together: a light source, a surface, and a viewer.

In the 1600s Isaac Newton passed sunlight through a glass prism and showed that white light is a mixture that can be spread into a band of colors, which we call a spectrum. Visible light is a small slice of electromagnetic radiation, roughly from 400 to 700 nanometres in wavelength, with violet at the short end and red at the long end.

A surface does not make light; it sends some wavelengths back to you and absorbs others. The apple looks red in daylight because it reflects mostly long wavelengths and absorbs much of the rest. In pure green light there are few long wavelengths to reflect, so little light comes back.

The eye finishes the job. The retina holds rod cells, which work in dim light and do not distinguish colors, and cone cells, of which people with typical color vision have three kinds, most sensitive to longer, middle and shorter wavelengths. The brain compares their signals to produce the sensation of color. Because it is a comparison, the same surface can look different under different lighting and beside different neighbors, a theme this whole course returns to.`,
          },
          {
            id: L02,
            title: 'Mixing Light and Mixing Paint',
            blurb: 'Additive color adds light together; subtractive color removes light by absorbing it.',
            minutes: 7,
            body: `There are two very different ways to make a new color, and confusing them is the source of many classroom puzzles.

Additive mixing combines beams of light. A screen starts dark and adds light: red, green and blue lights are the additive primaries. Red and green light together look yellow, green and blue look cyan, red and blue look magenta, and all three at full strength look white. That is why phones, televisions and monitors are built from tiny red, green and blue elements.

Subtractive mixing happens with paint, ink and dye. Here you start with white paper that reflects nearly everything, and each layer of pigment absorbs, or subtracts, some wavelengths. The primaries for this model are cyan, magenta and yellow. Each one absorbs roughly one third of the spectrum: cyan absorbs mostly red, magenta absorbs mostly green, and yellow absorbs mostly blue. Overlap cyan and yellow and the result absorbs red and blue, leaving green. Mix all three and, in theory, almost nothing is reflected, giving a dark result.

In practice real inks are imperfect, so cyan, magenta and yellow together make a muddy dark brown rather than a true black. This is why printers add a separate black ink, which is the K in CMYK.

A worked example: shine a red spotlight and a green spotlight onto the same white wall and you see yellow. Mix red and green paint and you see a dull brown. Same words, opposite processes, because one adds light and the other takes it away.`,
          },
          {
            id: L03,
            title: 'Hue, Value and Saturation',
            blurb: 'Three properties describe any color: which color family, how light or dark, and how vivid.',
            minutes: 6,
            body: `Saying "blue" is not specific enough to match a color. Designers describe a color with three properties, and the same ideas appear in nearly every color system.

Hue is the family a color belongs to, such as red, yellow, green or blue. It is what people usually mean by "the color."

Value is how light or dark a color is, from near white to near black. It is separate from hue: a pale pink and a deep maroon are the same hue family at very different values. Value is the property that carries most of the structure of an image. A quick way to check it is to squint, or to convert a picture to grayscale; if two shapes turn into the same gray, they have similar values.

Saturation, also called chroma or intensity, is how vivid or pure a color is. A fire-engine red is highly saturated; the same red mixed toward gray becomes a muted, dusty tone. Adding a bit of the complementary color, or gray, lowers saturation.

Painters give names to common changes. A tint is a color with white added, a shade is a color with black added, and a tone is a color with gray added.

Software uses these ideas too. Systems called HSV and HSL describe colors with a hue angle plus saturation and lightness numbers, while the Munsell system, developed by the American artist Albert Munsell in the early 1900s, names them hue, value and chroma. Example: a navy jacket and a sky-blue shirt share a hue but differ in value.`,
          },
          {
            id: L04,
            title: 'Color Wheels: RYB, RGB and CMY',
            blurb: 'Different wheels organise hues around different primaries, and each serves a different purpose.',
            minutes: 7,
            body: `A color wheel bends the spectrum into a circle so that relationships between hues are visible at a glance. Newton arranged colors in a circle in his writing on optics, and many versions have followed. The wheel you see depends on which primaries it is built on.

The traditional painter's wheel uses red, yellow and blue as primaries, with orange, green and violet as secondaries. This RYB wheel is what most art classes teach, and its vocabulary is deeply embedded in painting, interior design and everyday talk. Its complementary pairs are red and green, blue and orange, and yellow and violet.

The RGB wheel is built on the additive primaries of light: red, green and blue, with cyan, magenta and yellow as the secondaries. Its opposite pairs are red and cyan, green and magenta, and blue and yellow. Digital color tools usually show a wheel like this.

The CMY wheel is the subtractive counterpart used in printing. Its primaries are cyan, magenta and yellow, and its secondaries are red, green and blue.

These wheels disagree on what the primaries are, so which is right? Each is a model, not a law of nature. The RYB wheel is a simplification: with real pigments, a magenta-leaning red and a cyan-leaning blue plus yellow can mix a wider range than traditional red, yellow and blue pigments can. That is one reason printing uses CMY rather than RYB. Pick the wheel that matches your medium, and be aware that the words "complement" and "primary" change meaning when the wheel changes.`,
          },
        ],
      },
      {
        id: 'color-theory.t2',
        title: 'Harmony, Temperature and Contrast',
        blurb: 'The classic schemes for combining hues, the warm and cool divide, and how neighbors change what we see.',
        level: 'FOUNDATION',
        lessons: [
          {
            id: L05,
            title: 'Complementary and Analogous Schemes',
            blurb: 'Opposites on the wheel create energy; neighbors on the wheel create calm.',
            minutes: 6,
            body: `A color scheme, sometimes called a harmony, is a recipe for choosing hues that work together. The two simplest recipes sit at opposite ends of the wheel.

A complementary scheme pairs two hues directly opposite each other, such as blue and orange on the traditional wheel. Side by side they intensify each other, because each is the strongest contrast the other can have in hue. That makes complementary pairs excellent for drawing attention. A single orange sign on a blue wall is hard to miss.

The risk is that equal amounts of two strongly saturated complements can feel harsh or seem to vibrate where they meet. A common remedy is to let one color dominate and use the other as an accent, or to lower the saturation of one of them. Mixing complementary paints in unequal amounts is also the standard way painters make a muted, natural-looking neutral without reaching for black.

An analogous scheme uses hues that sit next to each other, such as yellow, yellow-green and green. The result is cohesive and calm because the colors share a common ingredient. Nature offers many examples, like an autumn hillside of reds, oranges and yellows. The weakness is a lack of punch, so designers add variety through value and saturation, and sometimes a small complementary accent.

Worked example: a cafe interior of greens in several lights and darks feels restful. A single coral cushion, close to the complement of green, becomes the focal point without disturbing the mood.

Treat schemes as starting points, not rules. Plenty of successful work breaks them.`,
          },
          {
            id: L06,
            title: 'Triadic, Split-Complementary and Tetradic Schemes',
            blurb: 'More complex schemes spread several hues around the wheel while keeping a balance.',
            minutes: 6,
            body: `Once you move beyond two colors, the wheel offers several patterns.

A triadic scheme uses three hues spaced evenly, a third of the way around the wheel from each other. On the traditional wheel the clearest example is red, yellow and blue; the secondary triad is orange, green and violet. Triadic schemes are lively and varied, and they are easy to unbalance when all three are equally bright. The usual fix is to choose one dominant hue and let the other two play supporting roles.

A split-complementary scheme starts with one hue and then uses the two hues on either side of its complement instead of the complement itself. For blue, that means the yellow-orange and red-orange neighbors of orange. You keep much of the contrast of a complementary pair, but with less tension and more variety, so it is a popular choice for beginners.

A tetradic or rectangular scheme uses two complementary pairs, giving four hues. A square scheme spaces four hues evenly around the wheel. These offer many options and are difficult to balance, so one hue should lead and the others should be toned down or used sparingly.

Example: a poster built on a deep blue background with small touches of yellow-orange and red-orange uses a split-complementary scheme, giving a vivid focal point without the starkness of blue against a single orange.

Remember that a scheme describes hue only. Value and saturation decide whether the result is bold, quiet, or muddy.`,
          },
          {
            id: L07,
            title: 'Color Temperature: Warm and Cool',
            blurb: 'Colors are described as warm or cool, and the comparison is relative rather than absolute.',
            minutes: 6,
            body: `Reds, oranges and yellows are called warm; blues, blue-greens and violets are called cool. The names come from associations with fire and sunlight on one side and water, ice and shade on the other. Warm colors are often said to advance and cool ones to recede, which painters use to suggest depth, though the effect is a tendency, not a guarantee.

Temperature is relative. A red that leans toward orange feels warm, while a crimson that leans toward blue feels cooler, even though both are red. Greens and violets are the in-between colors, which can lean either way depending on what surrounds them. A single color can look warm beside one neighbor and cool beside another.

Painters often exploit this with light. Under warm sunlight, shadows tend to be cooler, so a scene may combine warm lights with cool shadows to look natural and lively.

Photographers and filmmakers use the word differently, which confuses people. They measure the color of a light source in kelvins, a scale based on the color a heated ideal object glows at that temperature. Lower numbers, such as a candle flame or a household tungsten bulb at roughly 3000 K, give orange-ish light that looks warm. Higher numbers, such as overcast daylight at 6500 K or above, give bluer light that looks cool. So in photography, a higher kelvin value means a cooler-looking light, the reverse of what the word "hot" might suggest.

Example: setting a camera for tungsten light in a room lit by daylight will make the picture look blue.`,
          },
          {
            id: L08,
            title: 'Simultaneous Contrast: How Neighbors Change Color',
            blurb: 'A color looks different depending on what surrounds it, and the effect can be demonstrated with a simple gray square.',
            minutes: 7,
            body: `Place a medium gray square on a white background and another identical gray square on a black background. The square on black looks lighter. Nothing about the squares differs; the surroundings change how we see them. This is simultaneous contrast: our perception of a color shifts toward the opposite of its surroundings.

The effect works on value, as in the gray squares, and on hue and saturation too. A gray patch surrounded by saturated red tends to take on a slight greenish tint, the complement of red. A mid-tone orange looks more vivid on a blue ground than on a brown one.

Simultaneous contrast is related to, but not the same as, afterimages. If you stare at a bright red shape for half a minute and then look at a white wall, you may see a pale blue-green ghost of the shape. That is a successive effect, often explained by fatigue in the cells that responded to red, and it happens over time rather than across space.

For makers, the lesson is that color cannot be judged in isolation. A paint chip chosen on a white shelf can look different on a wall of another color. A designer who needs a color to look the same in two places may have to change it slightly. A painter can make a gray look warm by surrounding it with a cool blue rather than mixing in orange.

Worked example: two identical beige buttons on a navy sweater and on a cream sweater will not look quite the same beige. Always check colors in context.`,
          },
        ],
      },
      {
        id: 'color-theory.t3',
        title: 'Theorists and Meaning',
        blurb: 'Chevreul, Itten and Albers, and what we can and cannot say about color psychology and cultural meaning.',
        level: 'INTERMEDIATE',
        lessons: [
          {
            id: L09,
            title: 'Chevreul and the Law of Contrast',
            blurb: 'A 19th-century French chemist gave simultaneous contrast a systematic description that influenced artists.',
            minutes: 7,
            body: `Michel Eugene Chevreul was a French chemist who, in the 1820s, became director of dyeing at the Gobelins tapestry works in Paris. Standard accounts say that he was asked to investigate complaints that certain dyes looked weak or dull in the finished tapestries. His conclusion was that part of the problem was not the dye at all but the way a color looks beside other colors.

In 1839 he published The Principles of Harmony and Contrast of Colours, which stated what he called the law of simultaneous contrast of colors. In his account, when two colors are seen side by side, each appears to shift away from the other, changing in both tone and hue. He also described how adjacent colors are best arranged: harmonies of contrast, such as complementary pairs, and harmonies of analogy, such as near neighbors.

Chevreul's work was practical, aimed at dyers, weavers and manufacturers, but it also reached artists. Writers on art have often linked his ideas to the Impressionists and to Georges Seurat, who in the 1880s used small dots of separate color placed side by side in works such as A Sunday Afternoon on the Island of La Grande Jatte. How directly each artist used Chevreul is a matter for art historians, and Seurat is generally thought to have read several color theorists.

Example: a weaver who places a gray thread between two reds learns that it can look greenish, so adjusting the thread may be needed to get the intended effect.`,
          },
          {
            id: L10,
            title: 'Itten and Albers: Teaching Color at the Bauhaus and Beyond',
            blurb: 'Two influential teachers showed that color is relative and can be studied by experiment.',
            minutes: 8,
            body: `Johannes Itten, a Swiss artist, taught the preliminary course at the Bauhaus school in Germany from 1919 until the early 1920s, and wrote about color for decades afterward. In The Art of Color he described seven contrasts that artists can use: contrast of hue, light-dark, cold-warm, complementary, simultaneous, saturation, and extension, meaning the relative amount of each color. Itten's system gives students a vocabulary and a set of exercises, though some later critics found his claims about the emotional character of colors more subjective than scientific.

Josef Albers, who studied and then taught at the Bauhaus before emigrating to the United States, took a different path. His book Interaction of Color, published by Yale University Press in 1963, is built around experiments done with cut pieces of colored paper rather than paint. Its central idea is that color is the most relative medium in art: we almost never see a color as it is, but always through its relationship to others.

His exercises are simple but surprising. Students arrange papers so that two different colors look the same, or so that one color looks like two. Albers asked students to observe and test, not just memorise rules.

The two approaches complement each other. Itten offers a framework of named contrasts for planning; Albers offers a method for discovering how colors behave in practice.

Example: placing a small square of one orange on a green ground and on a purple ground can show the same orange looking like two different oranges, which is the kind of discovery Albers wanted students to make for themselves.`,
          },
          {
            id: L11,
            title: 'Color Psychology and Cultural Meaning: What We Can and Cannot Claim',
            blurb: 'Colors carry associations, but they are mostly learned and context dependent, and popular claims are often overstated.',
            minutes: 8,
            body: `Articles about color psychology often claim that blue calms, red excites, or yellow cheers, as if each hue works like a drug. The research is more modest. Studies do find that color can influence mood, attention or judgment in some settings, but effects tend to be small, to depend on context, and to vary between people. Findings in this field have also proved hard to replicate. A careful reader treats strong claims, especially about sales or health, with suspicion.

Many associations are learned from culture, not built in. White is worn at weddings in many Western countries, while in several East Asian traditions white is associated with funerals and mourning, and in other places black is the color of mourning. Red can mean luck and celebration in China, danger or stop in road signs in many countries, and love in Valentine's cards. Even within one culture, meaning changes with context: a red cross, a red dress and a red ink correction all say different things.

Language provides another clue. In 1969 Brent Berlin and Paul Kay argued that languages tend to add basic color terms in a similar order, with systems ranging from two terms up to eleven. Their work has been debated and refined since, but it shows that how we divide the spectrum is partly cultural.

A useful rule for designers is to treat color meaning as local. Check the audience, the setting and the competing associations. Example: stock charts show gains in green and losses in red in the United States, but several East Asian markets traditionally reverse this.`,
          },
        ],
      },
      {
        id: 'color-theory.t4',
        title: 'Access, Reproduction and Materials',
        blurb: 'Contrast for readability, the gap between print and screen, color spaces and the history of pigments.',
        level: 'INTERMEDIATE',
        lessons: [
          {
            id: L12,
            title: 'Accessibility and Contrast Ratios',
            blurb: 'Readable color depends on lightness contrast, and the WCAG guidelines give widely used numeric targets.',
            minutes: 8,
            body: `Not everyone sees color the same way. Color vision deficiency, often called color blindness, affects roughly 8 percent of men of Northern European ancestry and a much smaller share of women, with rates varying by population. Many more people have low vision, glare on a screen, or an aging eye. Good color design therefore does not depend on hue alone.

The Web Content Accessibility Guidelines (WCAG), published by the World Wide Web Consortium, measure the contrast between a text color and its background as a ratio from 1:1, with no contrast, to 21:1, the contrast of black on white. The calculation compares the relative luminance of the two colors, which is a measure of lightness that accounts for how the eye weighs red, green and blue.

For WCAG 2.x at level AA, ordinary text should reach at least 4.5:1, large text at least 3:1, and user interface components and meaningful graphics at least 3:1. Level AAA asks for 7:1 for ordinary text. Large text is defined by size, about 18 point, or 14 point bold. A commonly cited example is that a mid-gray of about #767676 on white lands close to the 4.5:1 mark.

These numbers are helpful benchmarks, not a full guarantee of readability. Critics note that the formula can misjudge some color pairs, especially dark backgrounds, and newer methods are under discussion. Contrast is also not the only requirement: do not use color alone to convey information. Pair red and green status dots with labels, shapes or icons.

Example: a pale gray caption on a white page may look elegant, but if it falls below the ratio, many readers will struggle.`,
          },
          {
            id: L13,
            title: 'Print versus Screen: CMYK, RGB and Pantone',
            blurb: 'Screens emit light and printers absorb it, so the same file can look different on each.',
            minutes: 8,
            body: `A screen makes color by emitting red, green and blue light. A printed page makes color by reflecting ambient light through layers of ink. That difference explains why a bright image on a monitor often looks duller on paper.

Commercial printing usually uses four process inks: cyan, magenta, yellow and black, abbreviated CMYK. The K stands for key, the plate that carries the detail, and black is used because mixing the three colored inks alone gives a muddy result and costs more ink. Printers build color from tiny dots of these inks, called halftone dots, which the eye blends together.

The range of colors a device can reproduce is its gamut. The CMYK gamut cannot reach some of the most vivid blues, greens and oranges a screen can display, so those colors shift when converted. Designers soft-proof, meaning they preview the conversion on screen, and ask a printer for a physical proof when color accuracy matters.

Some jobs use spot colors instead: a single premixed ink applied on its own. The best known matching system is Pantone, whose numbered swatch books let a designer specify, for instance, a brand color and expect the same ink from different printers. Spot inks can reach colors process inks cannot, and give consistent brand matching, but they add cost per color.

Example: a company logo in electric blue looks brilliant on a phone but may print duller in CMYK. The designer might specify a Pantone spot ink for packaging, and a CMYK approximation for newspaper ads, accepting that the two will not be identical.`,
          },
          {
            id: L14,
            title: 'Color Spaces: sRGB, Display P3 and Beyond',
            blurb: 'A color space defines what the numbers in a file mean, and different spaces cover different ranges of color.',
            minutes: 8,
            body: `The numbers in a digital image, such as 255, 0, 0, do not mean anything exact until you know the color space they belong to. A color space defines the primaries, the white point and how the numbers map to light. The same triple of numbers can mean a slightly different red in different spaces.

sRGB is the default space for the web and for most ordinary displays. It was created in the 1990s as a common standard so that images would look reasonably similar across devices. Its gamut is modest, but its universality is its strength: if no other information is attached, software generally assumes sRGB.

Display P3 is a wider space, based on a set of primaries originally used in digital cinema. It covers a noticeably larger range of saturated reds and greens than sRGB, and many modern phones, laptops and monitors can show it. Web standards now allow designers to specify colors in P3, while older displays simply show the nearest color they can.

Video has its own standards. Rec. 709 is the standard for high-definition television, with a gamut close to sRGB, and Rec. 2020 is a far wider space for ultra high-definition and HDR video, which few displays fully cover.

A colour space with a very large range is not automatically better. Colors must be converted correctly between spaces, and an embedded profile tells software how to interpret the file. Without a profile, images may look washed out or oversaturated.

Example: a photo edited in Display P3 and shared without a profile may look flat on a device that assumes sRGB. Tag images with their color profiles.`,
          },
          {
            id: L15,
            title: 'A Short History of Pigments',
            blurb: 'Where colors came from shaped what artists could afford, and new chemistry opened the palette.',
            minutes: 8,
            body: `For most of history, color came from earth, plants, insects, minerals and shellfish, and the cost of a color shaped how it was used.

Egyptian blue, made by heating sand, copper and a flux, is one of the earliest known synthetic pigments, used in ancient Egypt for thousands of years. Tyrian purple, a dye extracted from sea snails of the Murex family, was associated with the Phoenician city of Tyre in the ancient Mediterranean and was very expensive because a great many snails were needed for a small amount of dye. Purple became linked with rank and wealth in several ancient societies.

Natural ultramarine was made from the semi-precious stone lapis lazuli, mined for centuries in what is now Afghanistan. Its name comes from Latin words meaning from beyond the sea, and it was among the costliest pigments in European painting. In the 1820s chemists in France and Germany produced an artificial version, making a brilliant blue far more affordable.

Prussian blue, discovered in Berlin in the early 1700s, was among the first modern synthetic pigments. In 1856 the young English chemist William Henry Perkin, trying to make a medicine, produced the first synthetic aniline dye, mauveine, which started the synthetic dye industry. Many 19th-century pigments, such as cadmium colors, also expanded painters' choices, and the collapsible metal paint tube, patented in the 1840s by the American portrait painter John Goffe Rand, made painting outdoors easier.

Some historic pigments, such as lead white, were toxic. Today, safety information matters as much as hue when choosing a pigment.`,
          },
        ],
      },
      {
        id: 'color-theory.t5',
        title: 'Color in Practice',
        blurb: 'How painters, colorists, interface designers and lighting crews apply the theory, and how to build a palette.',
        level: 'ADVANCED',
        lessons: [
          {
            id: L16,
            title: 'Color in Painting',
            blurb: 'Painters control color through limited palettes, value structure, temperature shifts and the optical effects of adjacent color.',
            minutes: 8,
            body: `Painters work with the subtractive world of pigment, and many of the ideas in this course began as studio practice.

One of the most important choices is value structure. A painting that reads well in grayscale usually holds together in color, because values carry the shapes. It is often noted that in Claude Monet's Impression, Sunrise of 1872 the orange sun and the blue-gray sky are close in value, which is why the sun seems to shimmer; in black and white it nearly disappears.

Another tool is the limited palette. The Zorn palette, associated with the Swedish painter Anders Zorn, uses just yellow ochre, vermilion, ivory black and white, yet can mix a surprising range of natural-looking colors, including cool grays. Limiting the paints encourages harmony, since every mix shares the same ingredients.

Temperature is used to suggest light and space. Warm lights are often paired with cooler shadows, and distant objects are painted lighter and bluer to suggest air between viewer and scene, a device sometimes called atmospheric perspective and discussed by Leonardo da Vinci.

Some painters leaned on pure effect. In the 1880s Seurat placed dots of unmixed color side by side, relying on the viewer's eye to blend them at a distance. Pablo Picasso's Blue Period, roughly 1901 to 1904, built mood by confining much of his work to blues and blue-greens.

Example: to paint a warm sunlit white wall, a painter might add a touch of yellow to the lit side and a touch of violet-blue to the shadow side, rather than just using lighter and darker gray.`,
          },
          {
            id: L17,
            title: 'Color in Film: Grading and the Look',
            blurb: 'Colorists adjust brightness and color after shooting to match shots, fix problems and shape mood.',
            minutes: 8,
            body: `A film is shot over weeks, in different places and lighting, yet it must look like one world. Color grading is the post-production process of adjusting an image's brightness, contrast and color to achieve this, and to create a deliberate look.

Grading usually begins with primary correction, which affects the whole frame. Common controls adjust shadows (lift), midtones (gamma) and highlights (gain), and the white balance. After that, secondary correction targets a specific color or area, such as making a sky richer or an actor's shirt less saturated. Colorists rely on scopes, graphs that show brightness and color information, because the eye is easily fooled by room lighting and fatigue.

Many cameras record a flat, wide-range image, often called log footage, that preserves detail but looks gray. A look-up table (LUT) is a stored set of color conversions that can bring such footage to a standard view or apply a stylistic look.

Early color film processes such as Technicolor, popular from the 1930s, had a distinct palette built in by the chemistry. Digital grading gave filmmakers fine control over every frame. The 2000 film O Brother, Where Art Thou? is often cited as the first major feature to be fully color-graded digitally.

A frequently discussed trend is the pairing of warm skin tones with teal backgrounds. It works because orange and teal sit near opposite sides of the wheel, so faces stand out, but critics say overuse makes films look alike.

Example: a colorist may cool a hospital corridor and keep skin warm, so the setting feels clinical while the person stays vivid.`,
          },
          {
            id: L18,
            title: 'Color in Graphic and Interface Design',
            blurb: 'Designers use color to create hierarchy, signal meaning and keep layouts consistent across screens.',
            minutes: 7,
            body: `In graphic and interface design, color does jobs beyond decoration. It directs attention, groups related things, and signals what can be clicked or what has gone wrong.

A common starting point is a hierarchy of roles. A brand color serves as the primary accent, used for the most important actions. Neutral colors, such as whites, grays and near-blacks, make up most of the surface and carry text. Functional colors communicate state: for example, green for success, amber for warnings and red for errors. The saying 60-30-10, meaning roughly sixty percent dominant color, thirty percent secondary and ten percent accent, is a rule of thumb for balance, not a law.

Teams store these choices as design tokens, named values such as color-primary, so that a change is made once and applies everywhere. This also makes themes, such as light and dark mode, easier to maintain. Dark mode is not simply an inverted version of light mode: saturated colors often look harsh on dark backgrounds, so designers tend to soften them and check contrast again.

Accessibility ties in closely. Text and controls should meet contrast guidelines, and state should never be shown by color alone. An error field might turn red but should also show an icon and a message.

Finally, test on real devices. Screens differ in brightness and color rendering, and brand colors may need small adjustments so they look consistent.

Example: a form's Submit button uses the brand color, secondary actions use outlined gray buttons, and an error message adds an icon alongside red text.`,
          },
          {
            id: L19,
            title: 'Color in Stage and Lighting Design',
            blurb: 'On stage, color is mixed from light, so additive rules apply, and costumes and sets react to the light that falls on them.',
            minutes: 7,
            body: `A lighting designer paints with light, so the rules of additive mixing apply. Overlapping beams of red, green and blue produce lighter colors, and all three together approach white.

Traditional theatre lights are white-ish lamps shining through colored filters called gels. A gel works subtractively: it absorbs the wavelengths it does not pass, so it can only remove light, never add it. That is why a deep blue gel makes a dim beam. Modern LED fixtures usually include red, green and blue emitters, often with extras such as white or amber, and mix color electronically.

What the audience sees depends on how the light meets the surface. A red dress under red light looks bright red; under blue light it looks very dark, because the dress reflects little blue. A white costume takes on whatever color is shining on it, which is why designers coordinate costume, scenery and lighting together and test them under working light.

Designers also use color temperature. Warm amber light can suggest a sunset or candlelight, while cool blue can suggest night, moonlight or a clinical space, though the meaning always depends on the story and the audience. Skin tones are often lit with a gentle warm or neutral front light so that faces stay readable while colored light shapes the mood.

Example: a night scene might use deep blue wash for the set with a narrow warm pool on an actor holding a lantern, so the actor stands out from the cool background.`,
          },
          {
            id: L20,
            title: 'Building a Palette',
            blurb: 'A palette is built by choosing a purpose, a dominant color, supports and accents, then testing in context.',
            minutes: 7,
            body: `A palette is a small, chosen set of colors that work together for a particular job. Building one is a process of narrowing, not inventing, and the steps are the same whether you are decorating, painting or designing an app.

1. First, define the purpose and mood. A children's reading app and a law firm's website need different palettes, even if both use blue.
2. Second, pick a dominant color, often a hue with a clear role such as the main background or brand color.
3. Third, choose supporting colors using one of the schemes from this course: analogous colors for harmony, a complementary or split-complementary accent for emphasis.
4. Fourth, include neutrals, because palettes of only vivid colors are tiring.

Value and saturation deserve special care. Offer a range of lights and darks within the set so that shapes and text can separate. Limit the number of highly saturated colors; an effective palette often has one or two bright voices and several quieter ones.

Many people begin from a source of inspiration, such as a photograph, a painting or a natural scene, and sample the colors from it. Software can extract swatches, but the human check matters: do the colors still work together in proportion?

Finally, test in context. View the palette at the real size, in real lighting and on several screens, and check contrast for text. Adjust, then write the final values down, with names, so others can use them consistently.

Example: for a bakery brand, you might choose a warm cream background, a deep brown for text, a muted tomato red for buttons, and a small leaf green for highlights.`,
          },
        ],
      },
    ],
  },
  bank: {
    curriculumId: 'color-theory',
    questions: [
      // L01
      tf(L01, 1, 1, 'The color you see depends on the light source, the surface and your eyes and brain, not on the object alone.', 0, 'Remember the apple under green light.', 'Color is an experience produced by light, surface and viewer working together.'),
      mc(L01, 2, 1, 'Roughly what range of wavelengths makes up visible light?', ['About 400 to 700 nanometres', 'About 4 to 7 nanometres', 'About 4000 to 7000 nanometres', 'About 40 to 70 nanometres'], 'It is a small slice of a much larger spectrum.', 'Visible light covers roughly 400 to 700 nanometres, from violet to red.'),
      mc(L01, 3, 2, 'A red apple looks almost black under pure green light. What is the best explanation?', ['It reflects mostly long wavelengths, and green light has few of them to reflect', 'The apple gives off its own dark light', 'Green light destroys the apple’s pigment', 'The eye cannot see green light'], 'Think about what the surface sends back.', 'A red surface reflects mainly long wavelengths, so under green light little light returns to the eye.'),
      mc(L01, 4, 2, 'Which cells in the retina work in dim light but do not distinguish colors?', ['Rods', 'Cones', 'Pupils', 'Lenses'], 'One of the two receptor types is for dim light.', 'Rods handle low light and do not tell colors apart; cones are responsible for color vision.'),
      tf(L01, 5, 3, 'Newton used a prism to show that white light can be separated into a spectrum of colors.', 0, 'Think about what a prism does to sunlight.', 'Newton’s prism experiments showed that white light is a mixture that can be spread into a spectrum.'),
      // L02
      mc(L02, 1, 1, 'Which set gives the additive primaries?', ['Red, green and blue', 'Red, yellow and blue', 'Cyan, magenta and yellow', 'Orange, green and violet'], 'Think of the lights inside a screen.', 'Screens add red, green and blue light.'),
      tf(L02, 2, 1, 'Mixing red light and green light together produces yellow light.', 0, 'This is additive mixing.', 'In additive mixing, red and green light together look yellow.'),
      mc(L02, 3, 2, 'Why do printers add a separate black ink to cyan, magenta and yellow?', ['Real inks overlap into a muddy dark brown rather than a true black', 'Cyan, magenta and yellow cannot make any dark color', 'Black ink is needed to make white', 'Printers cannot print yellow without black'], 'Think about imperfect inks.', 'Because real inks are imperfect, mixing all three gives a muddy dark brown, so black is added.'),
      mc(L02, 4, 2, 'In subtractive mixing, what does a layer of pigment do to the light?', ['It absorbs some wavelengths', 'It adds new light', 'It makes the light brighter', 'It converts light into sound'], 'The word subtractive is the clue.', 'Pigments absorb some wavelengths, leaving less light to reflect.'),
      mc(L02, 5, 3, 'A red spotlight and a green spotlight overlap on a white wall. What do you see where they overlap?', ['Yellow', 'Dull brown', 'Blue', 'Black'], 'The spotlights are light, not paint.', 'Overlapping red and green light adds up to yellow; paint would give a brown.'),
      // L03
      mc(L03, 1, 1, 'What does value describe?', ['How light or dark a color is', 'Which color family it belongs to', 'How expensive the paint is', 'How warm it looks'], 'Grayscale shows it.', 'Value is lightness or darkness, separate from hue.'),
      tf(L03, 2, 1, 'Saturation describes how vivid or pure a color is.', 0, 'Compare a bright red with a dusty red.', 'Saturation, or chroma, is vividness; low saturation is closer to gray.'),
      mc(L03, 3, 2, 'A painter adds white to a blue paint. What is the result called?', ['A tint', 'A shade', 'A tone', 'A hue'], 'There are three names: white, black, gray.', 'A tint is a color with white added.'),
      mc(L03, 4, 2, 'Two shapes look identical when a picture is converted to grayscale. What does that tell you?', ['They have similar values', 'They have the same hue', 'They have the same saturation', 'They are the same material'], 'Grayscale removes hue.', 'Grayscale keeps only lightness, so the shapes have similar value.'),
      mc(L03, 5, 3, 'Which trio names the properties in the Munsell system?', ['Hue, value and chroma', 'Red, green and blue', 'Tint, shade and tone', 'Warm, cool and neutral'], 'It was devised by an American artist in the early 1900s.', 'Munsell described colors with hue, value and chroma.'),
      // L04
      mc(L04, 1, 1, 'Which wheel uses red, yellow and blue as primaries?', ['The traditional painter’s RYB wheel', 'The RGB wheel', 'The CMY wheel', 'The grayscale wheel'], 'It is the one taught in many art classes.', 'The traditional painter’s wheel is built on red, yellow and blue.'),
      mc(L04, 2, 2, 'On the RGB wheel, which color is opposite red?', ['Cyan', 'Green', 'Yellow', 'Magenta'], 'Red light plus its opposite makes white.', 'On the RGB wheel the opposite of red is cyan.'),
      tf(L04, 3, 2, 'The RYB, RGB and CMY wheels agree on which colors are primaries.', 1, 'Compare the three sets of primaries.', 'Each wheel has different primaries, so complements and primaries depend on the wheel.'),
      mc(L04, 4, 3, 'Why does printing use cyan, magenta and yellow rather than red, yellow and blue?', ['Those inks can mix a wider range of colors', 'Cyan, magenta and yellow are the colors of light', 'Red, yellow and blue cannot be made into ink', 'The RYB wheel is based on additive mixing'], 'Think about how much each set can produce.', 'Cyan, magenta and yellow can mix a wider range than traditional red, yellow and blue pigments.'),
      tf(L04, 5, 3, 'A color wheel is a model, useful for a purpose, not a law of nature.', 0, 'Different wheels serve different media.', 'Each wheel is a simplified model chosen to suit a medium and a purpose.'),
      // L05
      mc(L05, 1, 1, 'Which pair is complementary on the traditional painter’s wheel?', ['Blue and orange', 'Blue and green', 'Red and orange', 'Yellow and green'], 'Complements sit directly opposite.', 'Blue and orange are opposite on the RYB wheel.'),
      mc(L05, 2, 1, 'What is an analogous scheme?', ['Hues that sit next to each other on the wheel', 'Hues directly opposite each other across the wheel', 'Three hues spaced evenly', 'Only black, white and gray'], 'Analogous means similar.', 'Analogous schemes use neighboring hues.'),
      tf(L05, 3, 2, 'Strong complementary colors used in equal amounts can look harsh or seem to vibrate.', 0, 'Think about equal bright amounts.', 'Equal amounts of saturated complements can feel harsh where they meet.'),
      mc(L05, 4, 2, 'A designer uses a calm green room with one coral cushion. What is the cushion’s role?', ['A near-complementary accent that draws attention', 'An analogous background color that blends with the green', 'A neutral', 'A shade of the green'], 'Coral sits near the opposite of green.', 'The coral is close to green’s complement and works as an accent.'),
      mc(L05, 5, 3, 'How do painters often make a muted natural neutral without black?', ['Mix complementary paints in unequal amounts', 'Add more of the same color', 'Use only analogous colors from one side of the wheel', 'Use a tint of any hue'], 'Think about opposite colors cancelling.', 'Mixing complements dulls them toward a neutral gray or brown.'),
      // L06
      mc(L06, 1, 1, 'How many hues are in a triadic scheme?', ['Three', 'Two', 'Four', 'Five'], 'Tri means three.', 'A triadic scheme uses three evenly spaced hues.'),
      mc(L06, 2, 2, 'A split-complementary scheme for blue uses blue plus which hues?', ['The two hues on either side of orange', 'Orange only', 'The two hues on either side of blue', 'Green and violet, the two neighbors of blue'], 'Split means the complement is divided.', 'It uses the two neighbors of the complement instead of the complement itself.'),
      tf(L06, 3, 2, 'A tetradic scheme uses two complementary pairs.', 0, 'Tetra means four.', 'A tetradic or rectangular scheme uses two complementary pairs, giving four hues.'),
      mc(L06, 4, 2, 'What is a common way to keep a triadic scheme from feeling unbalanced?', ['Let one hue dominate and use the others in support', 'Make all three equally bright and equally large', 'Remove two of the hues', 'Use only the darkest values'], 'Equality causes trouble.', 'One dominant hue with supporting hues gives balance.'),
      tf(L06, 5, 3, 'A color scheme tells you the exact value and saturation to use.', 1, 'Schemes describe only one property.', 'Schemes describe hue relationships; value and saturation are separate choices.'),
      // L07
      mc(L07, 1, 1, 'Which group is usually called warm?', ['Reds, oranges and yellows', 'Blues, violets and blue-greens', 'Blue-greens and blue-violets', 'Grays, whites and soft neutrals'], 'Think of fire and sunlight.', 'Reds, oranges and yellows are called warm.'),
      tf(L07, 2, 1, 'Whether a color seems warm or cool can depend on the colors beside it.', 0, 'Temperature is relative.', 'A single color can look warm beside one neighbor and cool beside another.'),
      mc(L07, 3, 2, 'In photography, which light is cooler-looking?', ['Light at a higher kelvin value', 'Light at a much lower kelvin value', 'Candlelight or firelight indoors', 'A tungsten bulb in a living room'], 'The kelvin scale runs opposite to common words.', 'Higher kelvin values give bluer, cooler-looking light.'),
      mc(L07, 4, 2, 'Why does a crimson red feel cooler than an orange-red?', ['It leans toward blue', 'It is brighter', 'It is darker', 'It is a primary color'], 'Think about which direction each leans.', 'Red leaning toward blue looks cooler than red leaning toward orange.'),
      mc(L07, 5, 3, 'A painter shows sunlight on a wall. Which combination is a common choice?', ['Warm lit areas with cooler shadows', 'Cool lit areas with warm shadows only', 'All areas the same temperature', 'Only gray'], 'Think about how sunlit scenes appear.', 'Warm lights paired with cooler shadows look natural and lively.'),
      // L08
      mc(L08, 1, 1, 'Two identical gray squares are placed on a white and on a black background. What happens?', ['The one on black looks lighter', 'The one on white looks lighter', 'They look exactly the same', 'Both look black'], 'Perception shifts away from the surroundings.', 'Simultaneous contrast makes the gray look lighter against black.'),
      tf(L08, 2, 1, 'Simultaneous contrast changes how a color looks without changing the color itself.', 0, 'The squares did not change.', 'Only the surroundings changed; the perception shifted.'),
      mc(L08, 3, 2, 'A gray patch surrounded by saturated red tends to look slightly what?', ['Greenish', 'Reddish', 'Yellowish', 'Unchanged'], 'Think of the complement of red.', 'The patch shifts toward the complement, a slight green or blue-green.'),
      mc(L08, 4, 3, 'Staring at a red shape and then seeing a pale blue-green ghost on a white wall is called what?', ['An afterimage, a successive effect', 'Simultaneous contrast across space', 'Additive mixing', 'Atmospheric perspective'], 'It happens over time.', 'An afterimage occurs over time, unlike simultaneous contrast which occurs across space.'),
      mc(L08, 5, 2, 'What practical lesson does simultaneous contrast give a designer?', ['Judge a color in context, not in isolation', 'Never use gray', 'Always use complements whenever two colors meet', 'Color is the same everywhere'], 'Neighbors matter.', 'Colors should be checked in the setting where they will be seen.'),
      // L09
      mc(L09, 1, 1, 'Who published The Principles of Harmony and Contrast of Colours in 1839?', ['Michel Eugene Chevreul', 'Isaac Newton, the physicist', 'Josef Albers, the Yale teacher', 'Johannes Itten, the Bauhaus teacher'], 'He was a French chemist at the Gobelins works.', 'Chevreul, a French chemist, published it in 1839.'),
      tf(L09, 2, 2, 'Chevreul’s law of simultaneous contrast says that colors seen side by side appear to shift away from each other.', 0, 'Think about neighbors influencing each other.', 'Adjacent colors appear to change in tone and hue relative to each other.'),
      mc(L09, 3, 2, 'According to standard accounts, what practical problem led Chevreul to study contrast?', ['Complaints that dyed tapestries looked dull', 'A shortage of blue pigment across all of France', 'A dispute with physicists about the speed of light', 'A theory about afterimages in nineteenth-century poetry'], 'He worked in a dye workshop.', 'He investigated complaints about the dyes at the Gobelins tapestry works.'),
      mc(L09, 4, 3, 'Which painter is often linked with Chevreul’s ideas through the use of small dots of separate color?', ['Georges Seurat', 'Rembrandt', 'Claude Lorrain', 'Francisco Goya'], 'La Grande Jatte.', 'Seurat’s dot technique is often connected to color theorists including Chevreul.'),
      tf(L09, 5, 3, 'Chevreul’s work was aimed only at fine artists and never at dyers or manufacturers.', 1, 'Remember his job.', 'His work was practical, aimed at dyers, weavers and manufacturers, as well as artists.'),
      // L10
      mc(L10, 1, 1, 'Which teacher wrote Interaction of Color, published in 1963?', ['Josef Albers', 'Johannes Itten', 'Michel Chevreul', 'Isaac Newton'], 'He used cut colored papers.', 'Albers wrote Interaction of Color, published by Yale University Press.'),
      tf(L10, 2, 1, 'Albers believed color is highly relative and is seen through its relationships to other colors.', 0, 'Remember the one-orange-looks-like-two idea.', 'Albers called color the most relative medium in art.'),
      mc(L10, 3, 2, 'Which of these is one of Itten’s seven contrasts?', ['Contrast of extension', 'Contrast of fabrics', 'Contrast of centuries', 'Contrast of sound'], 'One concerns the amount of each color.', 'Extension, meaning the relative amounts of colors, is among Itten’s seven contrasts.'),
      mc(L10, 4, 2, 'Where did Johannes Itten teach the preliminary course?', ['The Bauhaus', 'Yale University', 'The Gobelins works', 'The Louvre'], 'A German design school.', 'Itten taught the preliminary course at the Bauhaus from 1919.'),
      mc(L10, 5, 3, 'How do the two teaching approaches differ in emphasis?', ['Itten offers a framework of named contrasts; Albers emphasises experiments with paper', 'Itten used only photographs; Albers used only words', 'Both rejected experiments', 'Albers listed seven contrasts; Itten used no exercises'], 'One planned, one discovered.', 'Itten gave a vocabulary of contrasts; Albers taught through hands-on experiments.'),
      // L11
      tf(L11, 1, 1, 'Research on color psychology finds large, universal effects that are identical for everyone.', 1, 'Remember the hedge in the lesson.', 'Effects tend to be small, context dependent and variable between people.'),
      mc(L11, 2, 1, 'Which statement about color meanings is most accurate?', ['Many are learned from culture and vary by context', 'All are fixed by biology and identical in every culture', 'They never change', 'They are the same in every language'], 'White and mourning.', 'Many associations are cultural and depend on setting.'),
      mc(L11, 3, 2, 'In U.S. stock charts green usually shows gains. What does the lesson say about several East Asian markets?', ['They have traditionally reversed this, with red for gains', 'They never use color', 'They use green for gains too', 'They use only blue'], 'Meaning is local.', 'Some East Asian markets traditionally use red for rises and green for falls.'),
      mc(L11, 4, 2, 'What did Berlin and Kay argue in 1969?', ['Languages tend to add basic color terms in a similar order', 'All languages have exactly twelve color words', 'Color terms are random', 'Color words do not matter'], 'It concerns basic color terms.', 'They proposed a common pattern of basic color-term development, a view later debated.'),
      mc(L11, 5, 3, 'What is a sound approach for a designer to color meaning?', ['Check the audience, setting and competing associations', 'Assume that one color meaning works equally well everywhere', 'Always choose blue', 'Ignore culture'], 'Treat meaning as local.', 'Meaning varies, so the audience and context should be checked.'),
      // L12
      mc(L12, 1, 1, 'What is the maximum contrast ratio, black on white, in WCAG?', ['21:1', '10:1', '100:1', '4.5:1'], 'It is the top of the scale.', 'Contrast ratios run from 1:1 to 21:1.'),
      mc(L12, 2, 2, 'Under WCAG 2.x level AA, what ratio is generally expected for ordinary body text?', ['At least 4.5:1', 'At least 1.5:1', 'At least 12:1', 'At least 21:1'], 'It is lower than the AAA target of 7:1.', 'Level AA asks for 4.5:1 for ordinary text.'),
      tf(L12, 3, 2, 'Meeting a contrast ratio guarantees that text is readable for every person.', 1, 'Remember the limits of the formula.', 'The numbers are useful benchmarks, but they do not guarantee readability for all.'),
      mc(L12, 4, 2, 'Why should a red-green status indicator also use labels or icons?', ['Some people cannot tell red from green', 'Red and green are really the same hue to everyone', 'Icons are cheaper to produce than color', 'Screens cannot display the color green well'], 'Think about color vision deficiency.', 'Information should not depend on color alone.'),
      mc(L12, 5, 3, 'What does the WCAG contrast ratio compare?', ['The relative luminance of two colors', 'Their hue angles around the color wheel', 'Their names as listed in a color library', 'Their print costs per square metre of ink'], 'It is about lightness.', 'The ratio is calculated from relative luminance.'),
      // L13
      mc(L13, 1, 1, 'What does the K in CMYK stand for?', ['Key, the black plate', 'Kelvin, the temperature unit', 'Kilo, short for thousand', 'Knockout, a trapping effect'], 'It is the detail plate.', 'K stands for key, which is the black ink.'),
      tf(L13, 2, 1, 'A screen makes color by emitting light, while a printed page reflects ambient light through ink.', 0, 'One emits, one reflects.', 'Screens emit red, green and blue light; paper reflects light through inks.'),
      mc(L13, 3, 2, 'What is a gamut?', ['The range of colors a device can reproduce', 'A type of ink', 'A paper finish', 'A kind of brush'], 'Think of range.', 'Gamut is the range of colors a device or process can reproduce.'),
      mc(L13, 4, 2, 'What is a spot color?', ['A single premixed ink applied on its own', 'A color built from four overlapping halftone dots', 'A color that can be seen only on a screen display', 'A stain left on the paper by wet ink or water'], 'Pantone is an example.', 'A spot color is a premixed ink, such as those specified using Pantone.'),
      mc(L13, 5, 3, 'An electric-blue logo looks duller when converted to CMYK. What is the likeliest reason?', ['It lies outside the CMYK gamut', 'CMYK inks cannot print any blue at all', 'Screens always look duller than paper', 'Black ink is mixed into every blue tone'], 'The gamuts differ.', 'Some vivid screen colors are outside what CMYK inks can reproduce.'),
      // L14
      mc(L14, 1, 1, 'Which color space is the usual default for the web?', ['sRGB', 'Rec. 2020', 'CMYK', 'Munsell'], 'Software assumes it when no profile is attached.', 'sRGB is the common default for web and ordinary displays.'),
      tf(L14, 2, 2, 'Display P3 covers a wider range of saturated colors than sRGB.', 0, 'It is a wider space.', 'Display P3 has a noticeably larger gamut than sRGB.'),
      mc(L14, 3, 2, 'What does a color profile tell software?', ['How to interpret the numbers in an image', 'How much the file costs to store and send online', 'Which printer in the studio should be used', 'The name of the person who made the image'], 'Numbers need a meaning.', 'A profile defines what the color numbers mean.'),
      mc(L14, 4, 2, 'Which standard is used for high-definition television, with a gamut close to sRGB?', ['Rec. 709', 'Rec. 2020', 'Pantone', 'CMYK'], 'The wider one is for ultra high-definition and HDR.', 'Rec. 709 is the HDTV standard; Rec. 2020 is wider.'),
      mc(L14, 5, 3, 'A photo edited in Display P3 and shared without a profile may look flat on some devices. Why?', ['They may assume sRGB and misread the numbers', 'P3 images are always dark', 'Flat screens cannot show color', 'The photo lost its pixels'], 'Think about assumptions.', 'Without a profile, software may assume sRGB and interpret the numbers differently.'),
      // L15
      mc(L15, 1, 1, 'Natural ultramarine was made from which stone?', ['Lapis lazuli', 'White chalk from cliffs', 'Grey granite from mountains', 'Black volcanic obsidian'], 'It was mined in what is now Afghanistan.', 'Natural ultramarine came from lapis lazuli.'),
      tf(L15, 2, 1, 'Tyrian purple was a dye from sea snails and was very expensive.', 0, 'Think of Murex.', 'Many snails were needed for a small amount of dye, making it costly.'),
      mc(L15, 3, 2, 'Who produced the first synthetic aniline dye, mauveine, in 1856?', ['William Henry Perkin', 'Isaac Newton, the physicist', 'Josef Albers, the Yale teacher', 'John Goffe Rand, the portrait painter'], 'He was a young English chemist.', 'Perkin discovered mauveine while trying to make a medicine.'),
      mc(L15, 4, 2, 'Which pigment is among the earliest known synthetic pigments of the ancient world?', ['Egyptian blue', 'Mauveine', 'Prussian blue', 'Cadmium red'], 'It is ancient.', 'Egyptian blue, made by heating sand, copper and a flux, dates to ancient Egypt.'),
      mc(L15, 5, 3, 'What did John Goffe Rand’s collapsible metal tube make easier?', ['Painting outdoors', 'Printing newspapers', 'Dyeing silk', 'Making glass'], 'Think about carrying paint.', 'The paint tube made paint portable, helping painting outdoors.'),
      // L16
      mc(L16, 1, 1, 'What does a strong value structure help a painting do?', ['Read well even in grayscale', 'Use more paint', 'Avoid using color', 'Look identical to every other work'], 'Values carry shapes.', 'A good value structure holds the image together without color.'),
      mc(L16, 2, 2, 'Which paints make up the Zorn palette?', ['Yellow ochre, vermilion, ivory black and white', 'Blue, green and violet', 'Cyan, magenta and yellow', 'Only black and white'], 'Four colors.', 'The Zorn palette uses yellow ochre, vermilion, ivory black and white.'),
      tf(L16, 3, 2, 'Atmospheric perspective paints distant objects lighter and bluer to suggest air.', 0, 'Think of far mountains.', 'Distant objects are often painted lighter and bluer to suggest depth.'),
      mc(L16, 4, 2, 'What is often noted about the sun and sky in Monet’s Impression, Sunrise?', ['They are close in value', 'They are black and white', 'They use no orange', 'They use identical hues'], 'Check in grayscale.', 'The orange sun and blue-gray sky are close in value, so the sun nearly vanishes in black and white.'),
      mc(L16, 5, 3, 'Why does a limited palette tend to produce harmony?', ['Every mix shares the same ingredients', 'It removes all contrast from the picture', 'It forbids the use of white paint anywhere', 'It uses only complementary pairs of hues'], 'Same ingredients.', 'Mixes drawn from the same few paints tend to belong together.'),
      // L17
      mc(L17, 1, 1, 'What is color grading?', ['Adjusting brightness, contrast and color after shooting', 'Choosing actors', 'Writing the script', 'Recording sound'], 'It is post-production.', 'Grading shapes the image after it has been filmed.'),
      mc(L17, 2, 2, 'What do the lift, gamma and gain controls adjust?', ['Shadows, midtones and highlights', 'Camera lenses and focal length settings', 'Sound levels in the audio mix and mastering', 'Subtitle speed and screen position'], 'They split the tonal range.', 'They adjust the shadows, midtones and highlights.'),
      tf(L17, 3, 2, 'A LUT is a stored set of color conversions that can be applied to footage.', 0, 'Look-up table.', 'A LUT maps input colors to output colors and can apply a look.'),
      mc(L17, 4, 2, 'Why do colorists rely on scopes?', ['The eye is easily fooled by room lighting and fatigue', 'Scopes make finished films shorter by trimming dull scenes', 'Scopes record sound', 'Monitors cannot show images'], 'Perception is relative.', 'Scopes give objective measures of brightness and color.'),
      mc(L17, 5, 3, 'Why does pairing orange skin tones with teal backgrounds work?', ['The colors are near opposites, so faces stand out', 'They are analogous', 'Both are neutral', 'They have the same value'], 'Think about the wheel.', 'Orange and teal sit near opposite sides of the wheel, producing strong contrast.'),
      // L18
      mc(L18, 1, 1, 'In interface design, what is the main job of neutral colors?', ['Carry most surfaces and text', 'Show errors and success states', 'Replace the brand color entirely', 'Make pages load noticeably faster'], 'They cover most of the screen.', 'Neutrals make up most of the surface and carry text.'),
      tf(L18, 2, 2, 'The 60-30-10 idea is a rule of thumb, not a law.', 0, 'It is a guide for balance.', 'It suggests a balance of dominant, secondary and accent colors but is not binding.'),
      mc(L18, 3, 2, 'What are design tokens?', ['Named color values reused across a product', 'Coins that designers spend to buy fonts and icons', 'A type of printer', 'A security feature'], 'Names for values.', 'Tokens let a change be made once and apply everywhere.'),
      mc(L18, 4, 2, 'Why should an error field use an icon or message as well as red?', ['Color alone should not convey state', 'Red is not visible on screens', 'Icons are faster to load', 'Red is reserved for success'], 'Accessibility.', 'Information should not rely on color alone.'),
      mc(L18, 5, 3, 'What is a common adjustment when moving a design to dark mode?', ['Soften highly saturated colors and recheck contrast', 'Invert every color', 'Remove all text', 'Use only pure white'], 'Saturated colors can look harsh.', 'Dark mode is not a simple inversion; colors and contrast need rechecking.'),
      // L19
      mc(L19, 1, 1, 'What kind of mixing do overlapping colored stage lights use?', ['Additive', 'Subtractive', 'Neither', 'Print'], 'Lights add.', 'Stage lights add together as light.'),
      tf(L19, 2, 2, 'A colored gel can only remove light, never add it.', 0, 'Gels filter.', 'A gel absorbs wavelengths it does not pass, so it works subtractively.'),
      mc(L19, 3, 2, 'A red dress under blue light will look what?', ['Very dark', 'Bright red', 'Bright blue', 'White'], 'It reflects little blue.', 'A red surface reflects little blue light, so it looks dark.'),
      mc(L19, 4, 2, 'Why do designers test costumes and sets under working light?', ['Surfaces change appearance under colored light', 'Costumes are always the same color', 'Gels are expensive', 'It saves electricity'], 'Light meets surface.', 'What the audience sees depends on how light meets each surface.'),
      mc(L19, 5, 3, 'A night scene uses blue wash plus a warm pool on an actor with a lantern. What is the effect?', ['The actor stands out from the cool background', 'The actor disappears', 'Everything looks the same color', 'The set looks warm'], 'Warm against cool.', 'Warm light against a cool background makes the actor stand out.'),
      // L20
      mc(L20, 1, 1, 'What is a sensible first step in building a palette?', ['Define the purpose and mood', 'Pick the most saturated colors', 'Use every color', 'Choose a font'], 'Start with the job.', 'Purpose and mood come first.'),
      tf(L20, 2, 1, 'A palette of only vivid colors with no neutrals is often tiring to look at.', 0, 'Rest for the eye.', 'Neutrals give the eye rest and let bright colors stand out.'),
      mc(L20, 3, 2, 'Why include a range of lights and darks in a palette?', ['So shapes and text can separate', 'To make the palette look more random', 'To avoid having to choose any hues', 'To reduce how much ink is used per page'], 'Think about value.', 'A range of values lets elements separate and read clearly.'),
      mc(L20, 4, 2, 'What is a common source for palette inspiration?', ['A photograph or painting sampled for swatches', 'A random number', 'The dictionary', 'A map'], 'Look around.', 'Many people sample colors from a photo or artwork they like.'),
      mc(L20, 5, 3, 'What is the final step recommended after choosing colors?', ['Test in context and record named values', 'Print once and stop', 'Delete the neutrals', 'Change them daily'], 'Check real use.', 'Palettes should be tested in real conditions and documented.'),
    ],
  },
};
