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

const L01 = 'graphic-design.l01';
const L02 = 'graphic-design.l02';
const L03 = 'graphic-design.l03';
const L04 = 'graphic-design.l04';
const L05 = 'graphic-design.l05';
const L06 = 'graphic-design.l06';
const L07 = 'graphic-design.l07';
const L08 = 'graphic-design.l08';
const L09 = 'graphic-design.l09';
const L10 = 'graphic-design.l10';
const L11 = 'graphic-design.l11';
const L12 = 'graphic-design.l12';
const L13 = 'graphic-design.l13';
const L14 = 'graphic-design.l14';
const L15 = 'graphic-design.l15';
const L16 = 'graphic-design.l16';
const L17 = 'graphic-design.l17';
const L18 = 'graphic-design.l18';
const L19 = 'graphic-design.l19';
const L20 = 'graphic-design.l20';
const L21 = 'graphic-design.l21';
const L22 = 'graphic-design.l22';
const L23 = 'graphic-design.l23';
const L24 = 'graphic-design.l24';

export const COURSE_MODULE: CourseModule = {
  curriculum: {
    id: 'graphic-design',
    label: 'Graphic Design',
    blurb: 'Learn how designers make visual communication work: principles, type, layout, color, imagery, identity, print and screen, plus critique, process, ethics and building a career.',
    accent: '#7A2BD6',
    framework: 'ncas',
    tracks: [
      {
        id: 'graphic-design.t1',
        title: 'Seeing Like a Designer',
        blurb: 'What design is for, and the four core principles that make a page easy to understand.',
        level: 'FOUNDATION',
        lessons: [
          {
            id: L01,
            title: 'What Design Is For',
            blurb: 'Graphic design is visual communication with a purpose, an audience and a message.',
            minutes: 6,
            body: `Look at a stop sign. It has no clever artwork, yet it works: red, bold, eight-sided, with one word. A driver understands it in a fraction of a second. That is graphic design at its most basic. It is the planning and arranging of text and images so that a specific audience understands a specific message and, often, does something about it.

Design is different from decoration. Decoration makes something look nice. Design makes something work. A concert poster has to tell you who is playing, where and when, and make you want to go. A medicine label has to make the dose impossible to misread. A website menu has to help you find what you came for. In each case the designer asks three questions before touching a tool: who is this for, what must they understand or do, and where will they meet it?

Graphic design is also not the same as fine art. A painter may follow a private vision. A designer usually works for a client and an audience, within a brief, a budget and a deadline, and success is measured by whether the message gets through. That does not make design unimaginative. Constraints are what make clever solutions necessary.

Designers work in many forms: logos, posters, books, packaging, signs, websites and apps. The tools change, from pencils and printing presses to software, but the job stays the same. Every choice of size, color, shape and space either helps the viewer or gets in the way. The rest of this course is about making those choices on purpose.`,
          },
          {
            id: L02,
            title: 'Hierarchy: What Should the Eye See First?',
            blurb: 'Hierarchy ranks information so viewers know where to start and where to go next.',
            minutes: 6,
            body: `Imagine a flyer for a school bake sale where the date, the place, the title, the price list and a joke are all printed in the same size and weight. Nothing is wrong with any single line, yet the reader does not know where to begin. The flyer has no hierarchy.

Visual hierarchy is the ordering of elements by importance so the eye moves through them in a deliberate sequence. Designers build it with a handful of tools. Size is the strongest: larger things are noticed first. Weight, meaning thick or thin strokes, does similar work. Color and contrast pull attention, since a bright shape on a quiet background stands out. Position matters too; in languages read left to right and top to bottom, people usually begin near the top left. Space can isolate an element and give it importance.

A useful habit is the squint test. Step back or blur your eyes until the details disappear. What remains visible is what the design is really emphasizing. If the joke is the most visible thing on the bake-sale flyer, the hierarchy is wrong.

Worked example: for the flyer, a designer might make "Bake Sale" the largest, boldest element (level one), set the date and place in a medium size (level two), and leave the price list and small print in the smallest size (level three). Three levels are often enough. If everything is emphasized, nothing is. Good hierarchy is mostly the discipline of deciding what matters least.`,
          },
          {
            id: L03,
            title: 'Contrast and Repetition',
            blurb: 'Contrast makes differences obvious; repetition makes a design feel unified.',
            minutes: 6,
            body: `Two principles pull in opposite directions and work best together. Contrast says: if two things are different, make them clearly different. Repetition says: if two things are the same kind of thing, treat them the same way.

Contrast can be created through size, weight, color, shape, texture or style. Dark text on a light background is contrast in value, and it is what makes text readable. A heavy headline over light body text is contrast in weight. The key word is clearly. A headline set in 18 points above body text in 16 points is a timid difference that looks like a mistake. Either make the headline decisively larger or make them the same.

Repetition ties a piece together. When every section heading shares one font, size and color, readers learn the pattern and relax; they can recognize a heading without reading it. Repeating a color, a line style, a corner shape or a layout across the pages of a brochure or the screens of an app creates a sense of one coherent thing. Designers write these repeated choices into a style guide, and software supports them with styles and templates.

Worked example: a school newsletter uses a purple bar at the top of every page, headings always in bold sans serif, and captions always in small italics. That is repetition. The one story that matters most this month has a full-width photo and a headline twice the usual size. That is contrast, and it works because everything around it is consistent. Break a pattern only when you want attention.`,
          },
          {
            id: L04,
            title: 'Alignment and Proximity',
            blurb: 'Align elements to invisible lines and group related items close together.',
            minutes: 6,
            body: `Two more principles do quiet but powerful work. Alignment means lining elements up along shared edges or centers, such as a common left edge. Proximity means placing related items near one another and separating unrelated ones.

Consider a business card where the name sits left, the phone number floats centered, and the email hugs the right edge. Each item may look fine alone, but together they feel random. Aligning everything to one left edge creates an invisible line the eye follows, and the card suddenly feels organized. Weak alignment, such as items that are almost lined up, is worse than obvious misalignment because it looks like an error. Designers choose a small number of alignments and stick to them. Left-aligned text, with a ragged right edge, is the usual choice for reading because every line starts in the same place.

Proximity applies a principle from Gestalt psychology, a school of thought about how people perceive wholes: things close together are seen as a group. On the business card, the name and job title should sit close together, then a clear gap, then the contact details. Space does the grouping, so no boxes or lines are needed.

A common mistake is spacing everything evenly, which makes the page look like a list of unrelated parts. The fix is to vary the gaps on purpose: small gaps inside groups, larger gaps between groups. A viewer should be able to see the structure of the page from its spacing alone.`,
          },
        ],
      },
      {
        id: 'graphic-design.t2',
        title: 'Typography',
        blurb: 'The anatomy, families and settings of type, and how to pair and space it for readers.',
        level: 'FOUNDATION',
        lessons: [
          {
            id: L05,
            title: 'The Anatomy of Letters',
            blurb: 'Know the parts of a letter, and the difference between a typeface and a font.',
            minutes: 6,
            body: `Most of what we read is type, so a designer needs the vocabulary for it. Start with a distinction that people often blur. A typeface is a design for a whole set of characters, such as Garamond or Helvetica. A font is one specific version of it, such as Helvetica Bold at a given size. In digital use the words are often swapped, but the difference helps: a typeface is the family, a font is one member.

Now the parts of a letter. The baseline is the invisible line the letters sit on. The x-height is the height of a lowercase x, the body of most lowercase letters. The cap height is the height of capital letters. An ascender is the part of a letter that rises above the x-height, as in b, d and h; a descender drops below the baseline, as in g, p and y. A counter is the enclosed or partly enclosed space inside a letter, like the hole in an o. A serif is a small finishing stroke at the end of a main stroke, and a typeface without them is called sans serif.

Why does this matter? Because anatomy explains how typefaces differ in practice. Two fonts set at the same point size can look quite different in size if one has a taller x-height, since the lowercase letters take up most of a line of text. A large x-height with open counters generally stays legible at small sizes, which is why it is favored for screens.

Type size is measured in points. In digital design, one point is usually 1/72 of an inch, and 12 points make a pica, a unit used in print layout.`,
          },
          {
            id: L06,
            title: 'Type Classification',
            blurb: 'Serif, sans serif, slab, script, blackletter and monospace families each carry different character.',
            minutes: 7,
            body: `Thousands of typefaces exist, so designers group them into broad families. Knowing the families helps you choose by purpose rather than by guesswork.

Serif typefaces have small finishing strokes and have long been used for book text. Within that group, old style faces, such as Garamond, show gentle contrast between thick and thin strokes and a diagonal stress. Transitional faces, such as Baskerville, increase the contrast. Didone or modern faces, such as Bodoni, push the contrast to extremes, with hairline serifs and very thick vertical strokes, which can look elegant at large sizes but fragile in small text.

Slab serifs have thick, block-like serifs and a sturdy look. Sans serif faces drop the serifs. Grotesque and neo-grotesque sans serifs, of which Helvetica is the best-known example, have a neutral, even look. Humanist sans serifs, such as Gill Sans, draw on the proportions of calligraphy and feel warmer.

Beyond these, script typefaces imitate handwriting, and they are hard to read in long passages or in all capitals. Blackletter, the dense angular style used in medieval Europe, today signals tradition or, in some contexts, rock and tattoo culture. Display typefaces are designed for headlines only and tend to fall apart at body size. Monospace faces give every character the same width, which suits code and typewriter looks.

Worked example: for an invitation to a wedding, a designer may choose a refined serif for the names and a simple sans serif for the details. The choice is about tone: a classification is really a set of associations.`,
          },
          {
            id: L07,
            title: 'Pairing Typefaces',
            blurb: 'Combine fonts through clear contrast, shared structure and restraint.',
            minutes: 6,
            body: `Two typefaces together can be an elegant team or a quarrel. The most reliable advice is also the simplest: use few typefaces, and make the relationship between them obvious.

The first strategy is contrast. Pair a serif headline with a sans serif body, or the reverse. Because the two styles are visibly different, the viewer reads the difference as intentional. The danger zone is two typefaces that are similar but not identical, say two different geometric sans serifs. The difference looks like an accident.

The second strategy is to use one family with many weights and styles. Many typefaces come in a superfamily with light, regular, bold and italic versions, and sometimes both serif and sans serif forms built to match. Hierarchy can then come from size, weight and style alone, which guarantees harmony.

A third idea is to look for shared structure. Fonts with a similar x-height, similar proportions or similar stroke contrast sit together comfortably even when their classifications differ.

A practical rule of thumb is to limit a project to two typefaces, or three at the very most, and to give each a specific job: one for headings, one for text, perhaps a third for captions or accents. Decorative display faces work in small doses.

Worked example: a museum leaflet sets headings in a bold slab serif and everything else in a quiet humanist sans serif. Only two typefaces appear across twelve pages. The design feels consistent because every typographic choice repeats.`,
          },
          {
            id: L08,
            title: 'Leading, Kerning, Tracking and Measure',
            blurb: 'Spacing decisions inside and between lines decide whether text is pleasant to read.',
            minutes: 7,
            body: `Choosing a good typeface is only half of typography. The other half is spacing, and four terms cover it.

Leading, pronounced like the metal lead, is the vertical distance from one baseline to the next. Too tight and the descenders of one line collide with the ascenders of the next; too loose and the eye struggles to find the next line. For body text a common starting point is about 120 percent of the type size, so 10-point type might get 12-point leading, then adjusted by eye. Faces with large x-heights or long lines usually need more.

Kerning is the adjustment of space between a specific pair of letters, such as A and V, whose shapes leave an awkward gap. Good fonts include built-in kerning, and designers fine-tune it mainly in large type like logos and headlines. Tracking, also called letter-spacing, adjusts space across a whole word or block. Slightly open tracking suits small capital letters and tiny text; tightening it too far makes letters touch.

Measure is the length of a line of text. Long lines tire readers because it is hard to find the start of the next one; very short lines break rhythm. A commonly cited comfortable range for body text is roughly 45 to 75 characters per line, though this depends on size and context.

Worked example: a paragraph that spans a full page width at 100 characters per line looks heavy. Putting it into a column about 60 characters wide, with leading adjusted to match, makes the same words much easier to read.`,
          },
          {
            id: L09,
            title: 'Typographic Hierarchy and Text Settings',
            blurb: 'Build a type system with defined styles, alignment choices and clean paragraphs.',
            minutes: 7,
            body: `Lesson two covered hierarchy in general. Typography is where designers most often apply it. A type system defines a limited set of styles, each with a job: for instance a title, a heading, a subheading, body text, a caption and a footnote. Each style fixes typeface, size, weight, color and spacing. Software supports this with paragraph styles, and web design with style sheets, so every change is made once and updates everywhere. This is repetition in practice.

Differences between levels should be clear. A scale where each size is a consistent multiple of the last gives a sense of order. Weight, italic, capitals and color provide additional levels, but combining several at once, such as bold, italic, underlined and capital letters, is clutter. Pick one or two signals per level.

Alignment of paragraphs also matters. Flush left, ragged right text is the most common choice for reading. Justified text, where both edges are straight, looks tidy in newspapers and books, but poor spacing can leave uneven gaps and rivers of white space unless there is enough line length and hyphenation. Centered text suits short, formal lines such as invitations and fails in long paragraphs.

Pay attention to detail. Use proper quotation marks and apostrophes instead of straight marks typed from a keyboard, use real dashes, and avoid widows and orphans, meaning stray lines or single words left alone at the end or start of a column or page. Avoid underlining for emphasis, which on screens signals a link.

Worked example: a report uses six defined styles, and when the client asks for a different heading color, the designer changes one style and every heading updates.`,
          },
        ],
      },
      {
        id: 'graphic-design.t3',
        title: 'Space, Grids, Color and Imagery',
        blurb: 'Composition tools: whitespace, balance, grids, color systems, images and accessibility.',
        level: 'INTERMEDIATE',
        lessons: [
          {
            id: L10,
            title: 'Whitespace and Balance',
            blurb: 'Empty space is an active ingredient, and balance is felt weight distributed across a layout.',
            minutes: 6,
            body: `Beginners often treat empty space as wasted space and fill every corner. Experienced designers treat it as a material. Whitespace, also called negative space, is any area without content, and it need not be white. It gives elements room to breathe, groups and separates content, and directs attention. A single object surrounded by generous space looks important, while the same object crowded among others looks ordinary. Luxury brands often use abundant space for this reason.

There are two kinds worth distinguishing. Macro whitespace is the large-scale space around the major parts of a layout, such as margins and gaps between sections. Micro whitespace is the small space inside things, such as leading and the gaps between letters or between a button and its label. Both affect readability and tone.

Balance is the sense that a composition is visually stable. Every element has visual weight, determined by size, darkness, color intensity and complexity. In symmetrical balance, similar weight is mirrored on either side of an axis, which feels formal and calm. In asymmetrical balance, unlike elements balance each other, as a small, dark shape can balance a large, pale area. Asymmetry feels more dynamic and is common in modern layouts.

Worked example: a poster has a large photo on the left and a block of text on the right. If the photo is heavy and dark, the designer might enlarge the text slightly, or leave extra empty space beside it, so the right side carries enough weight. If the layout feels like it is tipping over, balance is off.`,
          },
          {
            id: L11,
            title: 'Grids and Layout Structure',
            blurb: 'A grid is an underlying framework of columns, margins and modules that keeps layouts consistent.',
            minutes: 7,
            body: `Behind most well-organized pages is a grid: an invisible framework used to place elements. A grid does not limit creativity so much as remove small decisions, so attention can go to the big ones.

The main parts are simple. Margins are the spaces between the content and the edge of the page. Columns are vertical divisions that hold text and images. Gutters are the gaps between columns. Modules are blocks formed where rows and columns intersect, and a grid built this way is called a modular grid. A baseline grid is a series of evenly spaced horizontal lines that text sits on, so lines of text in neighboring columns line up across the page.

Different jobs call for different grids. A novel needs a single text block with wide margins. A magazine might use a flexible multi-column grid, so a story can span two, three or four columns. A website uses a responsive grid that rearranges columns as the screen narrows.

Grids create alignment and repetition automatically. Elements that snap to the same lines look related, and readers sense the order even if they could not explain it. Good designers also know when to break the grid. A picture that spills across several columns or off the page edge gets attention precisely because the rest of the layout is regular.

Worked example: a designer sets up a twelve-column grid for a magazine spread. Because twelve divides evenly into twos, threes, fours and sixes, the same grid supports layouts with two, three or four columns.`,
          },
          {
            id: L12,
            title: 'Color in Design',
            blurb: 'Color carries mood and meaning, works in systems of relationships, and behaves differently on screens and on paper.',
            minutes: 7,
            body: `Color is among the fastest ways to set a mood and organize a design, and it also confuses beginners. A few ideas help. Designers describe color by hue (the basic color name), saturation (how intense or muted it is) and value or lightness (how light or dark it is). Value is especially important because contrast between light and dark is what makes content legible, regardless of hue.

Color relationships are often described using the color wheel. Complementary colors sit opposite each other, such as blue and orange, and look vivid together. Analogous colors sit next to each other and feel harmonious. Monochromatic schemes use one hue in varied values. These are starting points, not laws.

A practical palette usually has a dominant color, one or two supporting colors, and a neutral. A common guide is to let one color lead and use the accent sparingly so it stands out for things that matter, such as buttons or warnings.

Meaning is partly cultural. Red may suggest danger, passion or celebration depending on context and place, and white signifies purity in some cultures and mourning in others. Designers research their audience rather than assume.

Screens and print produce color differently. Screens mix light using red, green and blue (RGB), an additive process. Print generally mixes cyan, magenta, yellow and black inks (CMYK), a subtractive process. Because the ranges differ, some vivid screen colors cannot be matched exactly in print. A full study of color theory belongs to a separate course.`,
          },
          {
            id: L13,
            title: 'Working with Imagery',
            blurb: 'Choose, crop and treat images so they support the message, and respect resolution and rights.',
            minutes: 7,
            body: `Images do heavy lifting in design, from photographs and illustrations to icons and charts. The first question is whether an image earns its place. A good one communicates something words cannot, adds emotion or shows the product honestly. A decorative filler image that could belong to any page usually adds noise.

Choosing images means checking subject, mood, style and consistency. A set of images should feel like they belong together, with similar lighting, color treatment and viewpoint. Mixing a glossy studio photo with a flat cartoon on one page looks like two different brands.

Cropping is a design tool. Cropping tightly on a face makes it intimate, while a wide crop shows context. Crop to remove distractions and to put the subject where the layout needs it. Never stretch an image out of its proportions; scale it evenly. Text placed over an image needs enough contrast, which can be created by choosing a quiet area of the picture, adding a soft overlay or placing the text on a solid panel.

Technical quality matters. An image enlarged beyond its pixel dimensions looks blurry or blocky. Check that the resolution suits the final use, as covered in the production lessons.

Rights matter too. Finding a picture online does not mean you may use it. Photographs and illustrations are normally protected by copyright, so designers use images they made, commissioned, or licensed, or those in the public domain or under open licenses, and follow the terms. People shown in images may also require permission for certain uses.`,
          },
          {
            id: L14,
            title: 'Accessible Design',
            blurb: 'Designing so that people with different abilities can read, see and operate your work.',
            minutes: 7,
            body: `Accessible design means making work usable by as many people as possible, including those with low vision, color blindness, hearing loss, motor limitations or cognitive differences. It also helps everyone in difficult conditions, such as glare on a phone in sunlight. Treating accessibility as a late checklist is a mistake; it is easier and better to build it in from the start.

Contrast is the most basic item. The Web Content Accessibility Guidelines (WCAG), an international standard, define contrast ratios between text and background. At level AA, normal text should reach at least 4.5 to 1, and large text at least 3 to 1. Free tools compute these ratios. Pale grey text on white often fails.

Never rely on color alone to convey meaning. A notable minority of people, mostly men, have some form of color vision deficiency, and a chart that says "red means bad, green means good" with no other clue can mislead them. Add labels, patterns, icons or position.

Type size and spacing matter. Tiny, light, tightly spaced text is hard for many readers. Avoid long passages in all capitals or in decorative fonts. Make interactive elements, such as buttons, large enough to click or tap, and give them visible focus states for keyboard users.

On the web, images that carry meaning need text alternatives for screen readers, and headings should be real headings so users can navigate by structure. Video benefits from captions.

Worked example: a designer swaps a pastel yellow button with white text, which fails the contrast test, for a deep golden button with dark text, and adds an icon so that the meaning does not depend on hue.`,
          },
        ],
      },
      {
        id: 'graphic-design.t4',
        title: 'Design in Practice: Formats and Identities',
        blurb: 'Applying the principles to logos, posters, books, packaging and screens.',
        level: 'INTERMEDIATE',
        lessons: [
          {
            id: L15,
            title: 'Logos and Identity Systems',
            blurb: 'A logo is one part of a larger identity system that makes a brand recognizable.',
            minutes: 8,
            body: `A logo is a mark that identifies an organization. It is not the brand itself. A brand is the whole set of impressions people hold about a company, and a logo is a signature that helps them recognize it.

Logos come in several types, and the terms are useful. A wordmark is the name set in distinctive lettering. A lettermark uses initials. A symbol or pictorial mark is a graphic icon. A combination mark pairs a symbol with a name. The famous Nike Swoosh, designed by Carolyn Davidson in the early 1970s, is an example of an abstract symbol that works without words once it is familiar.

Strong logos tend to share traits. They are simple, so they are remembered. They are distinctive, so they are not confused with competitors. They are appropriate to the organization's character and audience. And they are versatile: a good logo works small on a phone screen, large on a building, in one color, on light or dark backgrounds. Designers test logos at tiny sizes and in black and white, because color and detail can vanish.

An identity system extends the logo into a toolkit: color palette, typefaces, spacing rules, image style, patterns, icon style and the way all these combine. A brand guidelines document records the rules, including clear space around the logo, minimum size and misuse examples such as stretching or recoloring it.

Worked example: for a new neighborhood bakery, a designer sketches dozens of ideas on paper before refining a few. The final identity is a simple wheat-stalk symbol, a warm color pair and one friendly serif typeface, applied consistently to bags, signs and the website.`,
          },
          {
            id: L16,
            title: 'Posters and Single-Page Communication',
            blurb: 'A poster must be understood at a glance, from a distance, among competing messages.',
            minutes: 7,
            body: `A poster competes for attention in a busy street or hallway, and it usually gets only a glance. That makes it a perfect exercise in the core principles. The design has to work quickly.

Start by identifying the single most important message. A poster that says six things says nothing. Decide what the viewer must take away in a few seconds, such as the event name, and make that the dominant element. Secondary information, usually date, time and place, forms a clear second level, and details such as ticket information form a quiet third level. The squint test works well here.

Use a strong focal point. This can be a bold image, a striking piece of type or a simple shape. Contrast of scale, such as one huge element against small ones, grabs attention. Keep type large enough to read from the expected distance. Limit the number of typefaces and colors, because simplicity is what makes a poster readable from across a room.

Think about the viewer's path. People tend to move from the dominant element to the next strongest, so arrange the elements in the order you want them read. Make sure that the call to action, such as a web address or ticket instructions, is findable.

Consider format and context. A poster for a street may need to be visible from several meters away, while one for a classroom wall is seen up close. A designer also plans how it prints and how it will look on a phone when it is shared online.

The poster has a long history as a design form, and the early twentieth century produced many influential examples, but the lesson here is practical: one idea, one hierarchy, one clear action.`,
          },
          {
            id: L17,
            title: 'Editorial and Book Design',
            blurb: 'Long-form design serves sustained reading through consistent structure, margins and navigation.',
            minutes: 7,
            body: `Editorial design covers magazines, newspapers, reports and books. Where a poster is read in seconds, these are read over minutes or hours, so comfort and navigation come first.

The basic unit is the page, but printed pages are usually seen as spreads, two facing pages. A designer plans the spread as a whole. Margins have names: the inner margin by the binding is the gutter or inside margin, and it often needs extra room so text is not lost in the fold. Traditional book designers often make the outer and bottom margins larger than the inner and top ones, which frames the text block pleasantly, though there is no single required proportion.

A reader navigates with running heads (a line at the top of each page with the book or chapter title), folios (page numbers), chapter openers, subheadings and a table of contents. Consistency here is what makes the design feel professional, and it is achieved through a master page and defined paragraph styles.

Body text for long reading is usually set in a readable serif or a clean sans serif at a comfortable size, with generous leading and a sensible measure, as discussed earlier. Magazines add variety through feature layouts, pull quotes and large images, but they still follow an underlying grid.

Printed books are made from sheets folded into groups of pages, commonly called signatures, which is why page counts are planned in multiples. Digital publications such as e-books use reflowable text, which adjusts to the reader's screen and settings, so the designer controls structure and styles more than exact page layouts.

Worked example: a designer setting a novel chooses one serif face, defines styles for chapter titles and paragraphs, adds running heads, and checks that no chapter ends with a single stranded line.`,
          },
          {
            id: L18,
            title: 'Packaging Design',
            blurb: 'Packaging is a three-dimensional design problem that must protect, inform and sell.',
            minutes: 7,
            body: `Packaging has several jobs at once. It protects the product, it carries required information, it communicates the brand, and on a store shelf it competes with neighbors for a shopper's attention. Because it is three-dimensional, the designer must think about how the design wraps around corners, folds and curves.

Packaging begins with structure. A dieline is a flat template that shows the cuts, folds and glue areas of a box or label, drawn to exact measurements. Designers place artwork on top of the dieline, keeping important text away from folds and cut edges. They often make a physical mockup to check how the design reads once folded.

Materials and printing methods affect the result. Paperboard, corrugated cardboard, plastic, glass and metal take ink differently. Finishes such as varnish, foil or embossing add texture but cost more. A designer chats with the printer early.

Information has a hierarchy. On a typical food package, the brand and product name come first, then a key benefit or flavor, then the details. Required content such as ingredients, nutrition facts, weight and warnings is governed by rules that vary by product type and country, so designers work from the client's or regulator's specifications rather than guessing.

Consider the shelf. A product seen from a distance, next to a dozen others, needs a clear color block or shape. A variant system, such as using a different color for each flavor while keeping the layout identical, uses repetition and contrast together.

Sustainability is increasingly part of the brief, including minimizing material, using recyclable or reused components and avoiding oversized boxes.`,
          },
          {
            id: L19,
            title: 'Web and Interface Design Basics',
            blurb: 'Screen design adds interaction, responsiveness and users with tasks to complete.',
            minutes: 8,
            body: `On screens, people do not only look; they act. Designers of websites and apps, often called user interface (UI) designers, apply all the earlier principles and add new concerns: interaction, feedback and many screen sizes.

Responsive design means a layout adapts to the device. A page may show three columns on a wide monitor, then reflow into one on a phone. Designers often start with the small screen, then expand, since it forces focus on essential content. Images and text must scale gracefully, and controls must be large enough for fingers.

Hierarchy and consistency become interface conventions. Buttons look like buttons; links look like links; the main action stands out and secondary actions are quieter. Reusing the same components, such as the same button style everywhere, makes an interface learnable. Many teams keep a design system, a shared library of components, colors and type styles, which is repetition at scale.

Good interfaces give feedback. When a user taps a button, something should visibly change, such as a pressed state or a confirmation message, so they know it worked. Forms should label fields clearly and explain errors in plain words.

User experience (UX) design is the wider discipline of how a product works for its users, including research, flows and testing. UI design is the visual layer within it. Watching a few real people try to complete a task is one of the most valuable things a designer can do, because it reveals problems no one on the team could see.

Navigation should be predictable. Keep the primary choices few and clearly labeled, and let users always know where they are.

Accessibility, covered earlier, applies fully here: contrast, text size, keyboard use and screen reader support.`,
          },
        ],
      },
      {
        id: 'graphic-design.t5',
        title: 'Production: Files, Color and Print',
        blurb: 'Technical knowledge that keeps a design from failing between screen and finished product.',
        level: 'ADVANCED',
        lessons: [
          {
            id: L20,
            title: 'Vector and Raster Graphics',
            blurb: 'Vector graphics are made of math and scale freely; raster graphics are grids of pixels tied to resolution.',
            minutes: 7,
            body: `Digital images come in two fundamental kinds, and choosing the wrong one is a classic source of problems.

Raster images, also called bitmaps, are grids of tiny colored squares called pixels. Photographs are raster. A raster image has a fixed number of pixels, so if you enlarge it past its original size the software must invent pixels, and the result looks soft or blocky. Common raster file formats include JPEG, which uses lossy compression suited to photographs, PNG, which uses lossless compression and supports transparency, and TIFF, often used in print workflows. Editing programs such as Photoshop work mainly with raster images.

Vector graphics are defined by mathematical descriptions of points, lines and curves, along with fills and strokes. Because they are formulas rather than pixels, they can be scaled to any size, from a favicon to a billboard, without losing sharpness. Logos, icons and illustrations with clean shapes are usually vector. Common formats include SVG, widely used on the web, and PDF and EPS in print workflows, while programs such as Illustrator and Inkscape work mainly with vectors.

Each has limits. Vectors are not well suited to the continuous tones of photographs. Rasters cannot scale up cleanly.

Worked example: a designer builds a company logo as vector artwork. That one file produces a tiny website icon, a printed business card and a large vehicle wrap, all crisp. The same designer saves a photo for the website as a compressed JPEG at a size matching how large it will appear, so the page loads quickly.

Keep an original, editable master file, and export copies in the formats needed rather than repeatedly re-saving a lossy file.`,
          },
          {
            id: L21,
            title: 'Print Production: Color, Resolution and Bleed',
            blurb: 'Prepare files so the printed result matches intent: CMYK, adequate resolution, bleed and safe margins.',
            minutes: 8,
            body: `A design that looks perfect on a screen can fail at the printer if the file is not prepared properly. Production knowledge prevents expensive reprints. Always ask your printer for their specifications, since requirements vary, but several concepts are nearly universal.

Color mode. Most commercial printing uses CMYK inks. Files built in RGB may shift in color when converted, and very bright screen colors may look duller. Designers set up print documents in CMYK from the start and judge color with proofs, since monitors differ. Spot colors, such as Pantone inks, are special premixed inks used when exact color matching is important, like brand colors.

Resolution. Resolution for print is measured in pixels per inch (ppi) of the image at its printed size. A typical target for photographs is about 300 ppi, though large-format items viewed from far away, such as banners, can use less. An image that is 3 inches wide at 300 ppi cannot simply be stretched to 12 inches without losing quality.

Bleed and margins. Printing and cutting are not perfectly exact, so a design with color or images reaching the edge extends past the trim line by a small amount called bleed, often around 1/8 inch (about 3 millimeters) in the United States, though printers set their own. Important text and logos stay inside a safe margin away from the trim, so a slightly shifted cut does not clip them. Crop marks show where to trim.

Black text. Small black text is usually set as 100 percent black only, rather than a mix of all four inks, which can show misregistration.

Fonts and files. Embed or outline fonts and include linked images, or export to a print-ready PDF, as the printer requests.`,
          },
        ],
      },
      {
        id: 'graphic-design.t6',
        title: 'History, Critique, Process and Profession',
        blurb: 'A key tradition, how to give and use critique, how projects run, ethical limits and a design career.',
        level: 'ADVANCED',
        lessons: [
          {
            id: L22,
            title: 'The Swiss Style and Modernist Ideas',
            blurb: 'Mid-century Swiss designers made grids, sans serif type and objectivity a lasting model for clear communication.',
            minutes: 7,
            body: `Design history is a course of its own, but one tradition shapes so much of what you have learned that it deserves a lesson: the Swiss Style, also called the International Typographic Style. It emerged in Switzerland, centered on Zurich and Basel, with roots in the 1930s and 1940s, and it flourished in the years after the Second World War through the 1950s and 1960s. It built on earlier modernist thinking, including ideas associated with the Bauhaus, the German design school of the 1920s, which is covered in the separate design movements course.

Its characteristics are easy to recognize. Designers used mathematical grids to organize pages. They favored sans serif type, flush-left ragged-right text and a clear typographic hierarchy. They preferred photography to illustration and wanted layouts to feel objective and orderly, with generous whitespace and asymmetric balance. The belief behind this was that design could be a neutral, universal means of communication, serving information rather than the designer's ego.

Well-known figures include Josef Müller-Brockmann, known for his rigorous grid-based posters and his writing on grid systems, and educators such as Armin Hofmann and Emil Ruder at the Basel school. Typefaces of the period include Helvetica, released in 1957 and designed by Max Miedinger with Eduard Hoffmann, and Univers by Adrian Frutiger, also from 1957.

The influence is huge: grids, hierarchy and clean sans serif type are the basis of much corporate identity, signage and interface design. There are also critiques. Later designers argued that strict neutrality can feel cold, that the idea of a universal style reflects particular cultural assumptions, and that expressive, playful approaches communicate things grids cannot.

Worked example: a transit map or airport sign system that uses a grid, one sans serif family and strict hierarchy is working in this tradition.`,
          },
          {
            id: L23,
            title: 'Critique and the Design Process',
            blurb: 'From brief to delivery, designers work in stages and improve through structured feedback.',
            minutes: 8,
            body: `Professional design is a process, not a single flash of inspiration. Though names and steps vary between teams, a typical sequence runs as follows.

First comes the brief: a statement of the project's goals, audience, deliverables, constraints, budget and schedule. A vague brief is the largest source of trouble, so designers ask questions until it is clear what success looks like. Next is research: learning about the audience, the competition and the context. Then ideation, generating many options through sketches and quick thumbnails, since the first idea is rarely the best. The best directions are developed into concepts and presented to the client or team. After feedback, the chosen concept is refined, and details such as spacing, type and color are polished. Finally come production and delivery: preparing final files, checking proofs, handing over assets and documenting how they should be used. Projects often loop back to earlier stages.

Critique is the practice of examining work against goals. Effective critique talks about the work, not the person, and ties comments to the brief. "I don't like it" is not useful. "The date is hard to find, and the audience needs it first" is. Designers practice describing what they see, relating it to purpose, and suggesting what to try next. Receiving critique requires separating your ego from the work and asking clarifying questions rather than defending.

Working with clients means explaining your reasoning in terms of their goals, setting the number of revision rounds in advance, and getting approval in writing at key stages.

Worked example: a designer presents three logo directions with a sentence on why each fits the brief, gathers feedback, develops one, and delivers a final package with files and guidelines.`,
          },
          {
            id: L24,
            title: 'Ethics and Professional Practice',
            blurb: 'Designers shape what people see and believe, so honesty, rights and fair practice matter.',
            minutes: 8,
            body: `Because design persuades and informs, it carries responsibilities. Ethical questions in design are real, and reasonable people sometimes disagree about them.

Honesty. Design should not mislead. Charts with truncated or distorted axes can exaggerate differences, and packaging can imply a product is healthier or larger than it is. Interface tricks sometimes called dark patterns, such as hiding the cancel button or pre-ticking a costly option, work against users' interests. Designers can refuse or question such requests.

Representation. Images and symbols can reinforce stereotypes or exclude groups. Using cultural motifs, sacred symbols or traditional patterns as mere decoration without understanding or permission can cause offense, so research and consultation help. Inclusive design asks who might be left out.

Rights. Designers use fonts, images, software and others' work under licenses, and respecting the terms is both legal and professional. Fonts in particular are licensed software, often with separate terms for web, apps and print. Copying another designer's logo or layout closely is plagiarism and may be infringement. Contracts should state who owns the final work and when the rights transfer, typically on payment, and the details vary by agreement and law.

Fair practice. Some designers argue against speculative work, meaning unpaid pitches, because it undervalues the profession, while others accept it in limited situations. Pricing, whether by project, hour or value, should cover your time and risk.

Environmental and social impact also count, including material waste and the attention-grabbing design of apps.

Building a career. A portfolio should show a small number of strong projects, each explained: the problem, your role, your process and the result. Quality beats quantity. Keep learning, seek mentors and feedback, and keep your work and rights organized.`,
          },
        ],
      },
    ],
  },
  bank: {
    curriculumId: 'graphic-design',
    questions: [
      tf(L01, 1, 1, `Graphic design is mainly about making things look decorative, whether or not the message gets through.`, 1, `Think about the stop sign.`, `Design is about making a message work for an audience; decoration alone does not do that.`),
      mc(L01, 2, 1, `Which question should a designer ask before opening any software?`, [`Who is this for and what must they understand or do?`, `Which trendy filter or effect will get the most attention online?`, `How many different colors can I fit into the layout?`, `Which font is the cheapest one available for the project?`], `Start with purpose.`, `Audience and message come before any tool or style choice.`),
      mc(L01, 3, 1, `How does a designer's job usually differ from a painter's private vision?`, [`A designer typically works within a brief and is judged on whether the message gets through`, `A designer follows a private artistic vision and is judged mainly on personal self-expression`, `A designer works without constraints and is judged on how many techniques appear in the piece`, `A designer avoids images entirely and is judged on how much text fits on the page`], `Think about clients and briefs.`, `Design usually serves a client and audience, and success is measured by communication.`),
      tf(L01, 4, 2, `Constraints such as budget and deadline can push designers toward clever solutions.`, 0, `Consider whether limits are only a problem.`, `Constraints make inventive solutions necessary and are a normal part of design.`),
      mc(L01, 5, 2, `A medicine label must make the dose hard to misread. This shows that design is mainly about what?`, [`Making information work for people`, `Showing off personal skill`, `Using as many different fonts as possible`, `Avoiding text so the page stays simple`], `What does the label need to achieve?`, `The label's design succeeds by communicating clearly, not by decoration.`),

      mc(L02, 1, 1, `What does visual hierarchy do?`, [`Orders elements by importance so the eye follows a sequence`, `Makes every element equally prominent so that nothing gets overlooked`, `Removes all text from a page so that only images remain to be seen`, `Chooses the printing method and paper stock for the final piece`], `Think about where to begin reading.`, `Hierarchy ranks information so viewers know where to start and what comes next.`),
      tf(L02, 2, 1, `Making everything bold and large is a reliable way to build hierarchy.`, 1, `If everything stands out, what stands out?`, `Emphasizing everything removes the differences hierarchy depends on.`),
      mc(L02, 3, 2, `In the squint test, what is the designer looking for?`, [`Which elements remain visible once details blur`, `Whether the colors match the brand palette exactly`, `How many different fonts were used on the page`, `Whether the exported file is large enough to print`], `Blur reduces fine detail.`, `What remains visible when blurred is what the design truly emphasizes.`),
      mc(L02, 4, 2, `Which is typically the strongest tool for building hierarchy?`, [`Size`, `File name`, `Paper brand`, `Document length`], `Think about what you notice first from afar.`, `Larger elements are noticed first, making size the strongest cue.`),
      tf(L02, 5, 3, `Three levels of hierarchy, such as title, details and small print, are often enough for a simple flyer.`, 0, `Simple pieces rarely need many levels.`, `A few clear levels usually organize a simple piece well.`),

      mc(L03, 1, 1, `If two elements are different, what does the contrast principle advise?`, [`Make them clearly different`, `Make them a bit different`, `Make them identical`, `Hide one of them`], `Timid differences look accidental.`, `Contrast works when differences are decisive.`),
      tf(L03, 2, 1, `Repetition means consistently treating similar elements in the same way.`, 0, `Think about headings across pages.`, `Repeating fonts, colors and styles unifies a design.`),
      mc(L03, 3, 2, `A headline set at 18 points above 16-point text is an example of what?`, [`A timid contrast that looks like a mistake`, `Strong contrast that clearly separates the levels`, `Effective repetition of one consistent style`, `A grid that aligns the elements evenly`], `Compare the sizes.`, `The size difference is too small to read as intentional.`),
      mc(L03, 4, 2, `Why does a style guide help a design?`, [`It records repeated choices so they stay consistent`, `It removes the need to choose any colors at all`, `It raises image resolution when printed`, `It replaces the brief with a summary`], `Think about repetition.`, `Style guides capture repeated decisions that keep a piece unified.`),
      tf(L03, 5, 3, `Breaking an established pattern is a way to draw attention to one element.`, 0, `The newsletter example.`, `A pattern broken against consistent surroundings stands out.`),

      mc(L04, 1, 1, `What does proximity mean in design?`, [`Placing related items close together`, `Making every item the same color`, `Centering every item on the page`, `Using only one font throughout`], `Think about grouping.`, `Nearness signals that items belong together.`),
      tf(L04, 2, 1, `Almost-aligned elements look more intentional than clearly misaligned ones.`, 1, `Does near enough look deliberate?`, `Near-alignment looks like an error, so choose clear alignments.`),
      mc(L04, 3, 2, `Why is flush-left, ragged-right text common for reading?`, [`Every line starts in the same place`, `It always uses less ink`, `It is required by most printing standards`, `It makes the letters appear larger on the page`], `Think about finding the next line.`, `A consistent left edge helps the eye return to each line start.`),
      mc(L04, 4, 2, `On a business card, how can spacing alone group the name with the job title?`, [`Place them close together with a larger gap before other details`, `Space every item evenly so that no single line is favored over another`, `Put them in opposite corners so each stands out separately`, `Use a different font for each word to mark the difference`], `Use gaps deliberately.`, `Small gaps inside groups and larger gaps between groups reveal structure.`),
      tf(L04, 5, 3, `Spacing everything evenly makes the page structure clearer.`, 1, `What does uniform spacing hide?`, `Even spacing fails to show which items are related.`),

      mc(L05, 1, 1, `What is the difference between a typeface and a font?`, [`A typeface is the design family; a font is one specific version of it`, `They mean exactly the same thing`, `A font is the whole design family; a typeface is one specific size of it`, `A typeface applies only to printed work, while a font applies only to screen use`], `One is the family.`, `Helvetica is a typeface; Helvetica Bold at a size is a font.`),
      mc(L05, 2, 1, `What is the baseline?`, [`The line letters sit on`, `The top edge of the capital letters`, `The space inside an o`, `The overall width of a single letter`], `Think of a line on lined paper.`, `The baseline is the imaginary line on which most letters rest.`),
      tf(L05, 3, 1, `A descender is the part of a letter that drops below the baseline, as in g or y.`, 0, `Think of the tails.`, `Descenders extend below the baseline.`),
      mc(L05, 4, 2, `What is a counter?`, [`The enclosed or partly enclosed space within a letter`, `A small finishing stroke on a capital letter`, `The gap between two consecutive lines of text`, `The thickest stroke in any letterform`], `Look inside an o.`, `Counters are the open spaces inside letterforms.`),
      mc(L05, 5, 3, `Two fonts at the same point size can look different in size because of what?`, [`Differences in x-height`, `Differences in the font file name`, `Differences in the color of the paper used`, `Differences in how many pages the document has`], `Most lowercase letters are the body height.`, `A larger x-height makes lowercase text appear bigger at the same point size.`),

      mc(L06, 1, 1, `Which typeface group has no small finishing strokes?`, [`Sans serif`, `Old style serif`, `Slab serif`, `Didone`], `The name tells you.`, `Sans serif means without serifs.`),
      tf(L06, 2, 1, `Script typefaces are usually a good choice for long passages of body text.`, 1, `Think about reading comfort.`, `Script faces are hard to read in long text.`),
      mc(L06, 3, 2, `Which description fits Didone or modern serifs such as Bodoni?`, [`Extreme contrast between thick and thin strokes`, `Every character is set at exactly the same width`, `Handwriting-like strokes that connect from letter to letter`, `Dense angular letterforms from medieval writing`], `Think hairlines.`, `Didones have hairline serifs and heavy verticals.`),
      mc(L06, 4, 2, `Which type group gives every character the same width?`, [`Monospace`, `Humanist sans`, `Transitional`, `Blackletter`], `Think of code and typewriters.`, `Monospace faces are fixed-width.`),
      tf(L06, 5, 3, `Choosing a typeface class mainly sets a tone through its associations.`, 0, `Consider wedding invitations versus code.`, `Classifications carry associations that shape the tone of a design.`),

      mc(L07, 1, 1, `Which pairing reads as clearly intentional?`, [`A serif headline with a sans serif body`, `Two matching sans serif faces`, `Five display faces in one layout`, `Two similar script faces`], `Make the difference obvious.`, `Clear contrast between styles reads as deliberate.`),
      tf(L07, 2, 1, `Using a single family in several weights can guarantee harmony.`, 0, `The weights are designed to match.`, `One family's weights and styles are built to work together.`),
      mc(L07, 3, 2, `Why is pairing two similar-but-different typefaces risky?`, [`The difference looks like an accident`, `It always prints incorrectly on commercial presses`, `It is banned by font copyright law`, `It makes the text invisible on screens`], `Is it clearly different?`, `Near-matches look like mistakes rather than choices.`),
      mc(L07, 4, 2, `A sensible limit for most projects is how many typefaces?`, [`Two, or at most three`, `Ten`, `One per paragraph`, `As many as the software offers`], `Restraint helps.`, `Few typefaces with clear jobs create consistency.`),
      tf(L07, 5, 3, `Similar x-heights and proportions can help fonts from different classes sit together comfortably.`, 0, `Shared structure.`, `Shared structure makes pairings look cohesive.`),

      mc(L08, 1, 1, `What is leading?`, [`The vertical distance from one baseline to the next`, `The space between one pair of letters`, `The length of a line of text in characters`, `The thickness or weight of the type strokes`], `It involves lines of text.`, `Leading is the baseline-to-baseline spacing.`),
      mc(L08, 2, 1, `Kerning adjusts space where?`, [`Between a specific pair of letters`, `Between paragraphs on a page`, `Between adjacent columns of text`, `Between the pages of a book`], `Think A and V.`, `Kerning fine-tunes the gap between particular letter pairs.`),
      tf(L08, 3, 2, `A very long line length makes it harder to find the start of the next line.`, 0, `Imagine reading across a wide page.`, `Overly long measures tire readers and cause lost places.`),
      mc(L08, 4, 2, `A commonly cited comfortable measure for body text is about how many characters per line?`, [`45 to 75`, `5 to 10`, `150 to 200`, `300 to 400`], `Not too short, not too long.`, `Roughly 45 to 75 characters is a widely cited range, depending on context.`),
      mc(L08, 5, 3, `What does tracking change?`, [`Space across a whole word or block of text`, `Only the space in one letter pair`, `The color of the text across a block`, `The page margins around the text block`], `It affects a group of letters.`, `Tracking, or letter-spacing, adjusts spacing across multiple letters.`),

      mc(L09, 1, 1, `What is a type system?`, [`A limited set of defined text styles, each with a job`, `A single typeface used for all text`, `A printer setting for rendering type`, `A site for downloading new fonts`], `Think title, heading, body.`, `A type system defines styles for specific roles.`),
      tf(L09, 2, 1, `Defining paragraph styles lets you change a heading's look everywhere at once.`, 0, `One change updates all.`, `Styles centralize formatting so changes propagate.`),
      mc(L09, 3, 2, `Which text alignment is usually unsuitable for long paragraphs?`, [`Centered`, `Flush left`, `Justified with adequate line length`, `Ragged right`], `It makes line starts uneven.`, `Centered text suits short formal lines but is tiring in long passages.`),
      mc(L09, 4, 2, `What is a widow or orphan in typesetting?`, [`A stray line or word left alone at the start or end of a column or page`, `A missing letter that was accidentally dropped while setting text`, `A very large decorative initial that sits at the start of a chapter or section`, `A second font that was mixed accidentally into a block of otherwise uniform text`], `It is about isolated lines.`, `These are awkwardly stranded lines.`),
      tf(L09, 5, 3, `Combining bold, italic, underline and capitals on one heading is the recommended way to show emphasis.`, 1, `Choose one or two signals.`, `Stacking many signals creates clutter.`),

      mc(L10, 1, 1, `What is whitespace in design?`, [`Any area without content`, `Only white areas`, `A printing flaw`, `A kind of font style`], `It need not be white.`, `Whitespace, or negative space, is empty area that gives content room.`),
      tf(L10, 2, 1, `Whitespace is wasted space that should be filled.`, 1, `Consider luxury brands.`, `Space is an active tool for grouping, focus and tone.`),
      mc(L10, 3, 2, `Which describes asymmetrical balance?`, [`Unlike elements balance each other, such as a small dark shape against a large pale area`, `Identical elements are mirrored on both sides of a central axis to give a formal, calm feel`, `Every element is placed in the center so all visual weight sits along the middle line`, `Only one element appears on the page so there is nothing left that needs balancing`], `Weight need not be equal in size.`, `Visual weight can be balanced by different kinds of elements.`),
      mc(L10, 4, 2, `Which is an example of micro whitespace?`, [`Leading between lines of text`, `The margin around the whole page`, `The large gap between two major sections`, `A blank page between chapters`], `Think small scale.`, `Micro whitespace is the small space inside and between small elements.`),
      tf(L10, 5, 3, `Symmetrical balance typically feels more formal and calm.`, 0, `Mirrored layouts.`, `Mirroring weight around an axis gives stability and formality.`),

      mc(L11, 1, 1, `What is a gutter in a column grid?`, [`The gap between columns`, `The outer page margin`, `A column that holds only images`, `A single line of text on the baseline`], `It separates neighbors.`, `Gutters are the spaces between columns.`),
      tf(L11, 2, 1, `A grid helps elements look related and creates alignment automatically.`, 0, `Elements snap to the same lines.`, `Shared lines produce alignment and repetition.`),
      mc(L11, 3, 2, `What does a baseline grid do?`, [`Lets lines of text in neighboring columns line up`, `Sets the color mode used for the printed page`, `Defines how far the artwork extends beyond the trim line`, `Chooses which typefaces pair with each other best`], `It is made of horizontal lines.`, `Text sits on evenly spaced baselines across columns.`),
      mc(L11, 4, 2, `Why is a twelve-column grid popular?`, [`Twelve divides evenly into twos, threes, fours and sixes`, `It is legally required for all published layouts`, `It uses less ink than grids with fewer columns on the page`, `It forces every layout into a single column of text, which simplifies design`], `Think about divisors.`, `Its many divisors support flexible column combinations.`),
      tf(L11, 5, 3, `Breaking the grid on purpose can attract attention because the rest of the layout is regular.`, 0, `Contrast needs a pattern.`, `Deviation stands out against consistency.`),

      mc(L12, 1, 1, `Which property of color most affects legibility?`, [`Value, meaning lightness or darkness`, `The hue name, meaning whether it is red, blue or green`, `The file extension of the saved artwork`, `The brand that produced the paint`], `Light against dark.`, `Contrast in value is what makes content readable.`),
      mc(L12, 2, 1, `Complementary colors are located where on the color wheel?`, [`Opposite each other`, `Next to each other on the wheel`, `At the very same point`, `They do not appear on the wheel at all`], `Think of blue and orange.`, `Complements sit opposite and look vivid together.`),
      tf(L12, 3, 2, `The meaning of a color is identical in every culture.`, 1, `Consider white and mourning.`, `Color meanings vary with culture and context.`),
      mc(L12, 4, 2, `Screens typically form color using which model?`, [`RGB, an additive process`, `CMYK, a print model`, `Pantone only`, `Black and white only`], `Screens emit light.`, `Screens mix red, green and blue light.`),
      mc(L12, 5, 3, `Why might a vivid screen color look duller in print?`, [`CMYK inks cannot reproduce some colors RGB screens can`, `Paper is always gray, so every printed color shifts toward it`, `Printers dislike bright colors and mute them on purpose`, `Printing ignores color information stored in the file`], `The ranges differ.`, `Print and screen have different color ranges.`),

      mc(L13, 1, 1, `What should happen to an image that is resized?`, [`It should be scaled evenly, not stretched out of proportion`, `It should be stretched to fill the layout space`, `It should be flipped so the subject faces the text`, `It should be darkened so the text above it stands out`], `Keep proportions.`, `Distorting proportions looks wrong; scale uniformly.`),
      tf(L13, 2, 1, `If a photo can be found online, you may use it freely in your design.`, 1, `Think about copyright.`, `Images are usually protected, so you need a license, permission or public-domain status.`),
      mc(L13, 3, 2, `Which helps text remain readable over a busy photo?`, [`A soft overlay or a solid panel behind the text`, `Using a smaller, lighter font`, `Using lower contrast to blend the text`, `Stretching the photo wider`], `Increase contrast.`, `Overlays and panels create the needed contrast.`),
      mc(L13, 4, 2, `What is a good test of whether an image earns its place?`, [`Does it communicate something words cannot or add real emotion?`, `Is it free to download and popular on the stock site?`, `Is it large enough to fill the page from edge to edge?`, `Is it colorful enough to catch the eye of a passerby?`], `Purpose over decoration.`, `Useful images add meaning, not mere filler.`),
      tf(L13, 5, 3, `A set of images should share similar lighting, color treatment and viewpoint to feel cohesive.`, 0, `Consistency.`, `Consistent treatment makes images feel like they belong together.`),

      mc(L14, 1, 1, `Under WCAG level AA, what minimum contrast ratio applies to normal-size text?`, [`4.5 to 1`, `1.5 to 1`, `2 to 1`, `20 to 1`], `It is a modest ratio but above 3.`, `WCAG AA requires at least 4.5 to 1 for normal text.`),
      tf(L14, 2, 1, `A chart should rely on color alone to separate good from bad.`, 1, `Consider color vision deficiency.`, `Color alone excludes some viewers; add labels, icons or patterns.`),
      mc(L14, 3, 2, `Which helps users who navigate with a keyboard?`, [`Visible focus states on interactive elements`, `Removing every link so there is nothing to select`, `Using lighter text on a pale background`, `Hiding buttons until the mouse moves over them`], `They need to see where they are.`, `Focus indicators show the active element.`),
      mc(L14, 4, 2, `Why do meaningful images need text alternatives on the web?`, [`Screen readers can then convey them to users`, `They load faster than images without any text`, `They print better on commercial presses`, `They need less color information to display`], `Think who cannot see the image.`, `Alt text lets assistive technology describe images.`),
      tf(L14, 5, 3, `Accessible design benefits many people beyond those with permanent disabilities.`, 0, `Think of glare on a phone.`, `Clear contrast and sizing help everyone in difficult conditions.`),

      mc(L15, 1, 1, `Which describes a wordmark?`, [`The organization's name set in distinctive lettering`, `A graphic icon that stands alone without any lettering at all`, `A set of initials arranged in a compact monogram`, `A color palette chosen to represent the organization`], `It is made of letters.`, `Wordmarks present the name as the logo.`),
      tf(L15, 2, 1, `A logo and a brand are the same thing.`, 1, `A brand is bigger.`, `A brand is the full set of impressions; the logo is one identifying mark.`),
      mc(L15, 3, 2, `Why do designers test logos small and in black and white?`, [`To confirm they stay recognizable when color and detail are lost`, `Because color is banned from brand logos in most fields`, `To save paper by shrinking the proofs before printing`, `Because every logo must eventually be shown in gray`], `Versatility.`, `A strong logo works across sizes and in one color.`),
      mc(L15, 4, 2, `What does a brand guidelines document usually specify?`, [`Clear space, minimum size, colors, fonts and misuse examples`, `Only the logo price and the date it was approved`, `The printer address and press schedule for brochures`, `Employee salaries, hiring plans and budgets`], `Rules for consistency.`, `Guidelines record how the identity should be applied.`),
      mc(L15, 5, 3, `Which is an identity system?`, [`A toolkit of logo, color, type, imagery and rules applied consistently`, `One finished logo file saved in several formats and sent to the client`, `A single poster designed for one campaign and one audience`, `A font download packaged with a few weights and styles`], `It is broader than a logo.`, `An identity system extends the logo into a coordinated toolkit.`),

      mc(L16, 1, 1, `What should a designer decide first for a poster?`, [`The single most important message`, `The paper brand and finish to order`, `How many fonts the poster will use`, `Which border style frames the whole piece`], `One idea.`, `A poster that says everything says nothing, so choose a dominant message.`),
      tf(L16, 2, 1, `A poster usually gets only a glance from viewers.`, 0, `Think of a busy street.`, `Posters must work quickly at a distance.`),
      mc(L16, 3, 2, `Which helps a poster grab attention?`, [`A strong focal point with contrast of scale`, `Elements all sized the same for fairness`, `Tiny type packed into the corners`, `Many different colors competing at once`], `One thing dominates.`, `A bold focal element creates fast attention.`),
      mc(L16, 4, 2, `Why plan the viewer's path?`, [`People move from the dominant element to the next strongest`, `Viewers read a poster in a random order, so layout cannot guide them anywhere`, `Reading paths are legally required on posters displayed in public places`, `More text on the poster gives viewers extra steps to follow along`], `Eye movement follows emphasis.`, `Ordering elements guides reading.`),
      tf(L16, 5, 3, `A poster also needs a findable call to action, such as a web address.`, 0, `What should viewers do next?`, `Without a clear next step, interest may be wasted.`),

      mc(L17, 1, 1, `What is a folio?`, [`A page number`, `A chapter title`, `A paragraph style`, `A cover`], `Think of numbering.`, `Folios are page numbers.`),
      mc(L17, 2, 1, `What is a running head?`, [`A line at the top of each page carrying the book or chapter title`, `The large title printed on the front cover of the book, set in display type`, `A large decorative drop cap that opens each chapter`, `The glued edge where the folded sheets are held together at the spine`], `It repeats on pages.`, `Running heads help readers navigate.`),
      tf(L17, 3, 2, `Printed books are made from sheets folded into signatures, so page counts are planned in multiples.`, 0, `Think about folding.`, `Folded sheets produce groups of pages.`),
      mc(L17, 4, 2, `Why does the inner margin often need extra room?`, [`Text can be lost in the binding fold`, `Readers dislike narrow margins in books`, `Printers require extra inner margins by law`, `It saves ink across a whole print run`], `Look at the center of a spread.`, `Extra gutter space keeps text readable near the binding.`),
      tf(L17, 5, 3, `In e-books with reflowable text, the designer controls exact page layout as in print.`, 1, `Text adjusts to the reader's screen.`, `Reflowable text puts structure and styles in focus, not fixed pages.`),

      mc(L18, 1, 1, `What is a dieline?`, [`A flat template showing a package's cuts, folds and glue areas`, `A thin line of small text printed along the bottom edge of a label or box`, `A special ink used for printing metallic finishes on boxes and cartons`, `A style of typeface designed for small ingredient and nutrition text`], `Think of an unfolded box.`, `Dielines guide artwork placement on packaging.`),
      tf(L18, 2, 1, `Packaging has to protect the product, inform and sell all at once.`, 0, `Several jobs.`, `Packaging serves multiple functions at the same time.`),
      mc(L18, 3, 2, `Why keep important text away from folds and cut edges?`, [`Folds and cutting can distort or clip it`, `Folds are purely decorative and need space around them`, `Printers charge extra for every line of text near edges`, `Text near edges always prints much brighter`], `Think about physical construction.`, `Text near folds or cuts risks being damaged or hidden.`),
      mc(L18, 4, 2, `Using one color per flavor with an identical layout is an example of what?`, [`Repetition and contrast together`, `Ignoring hierarchy to keep every flavor equal`, `A random design with no connection between flavors`, `A dieline that shows how each flavor box folds`], `Same structure, different color.`, `Shared layout repeats while color differentiates.`),
      tf(L18, 5, 3, `Required packaging information is usually set by rules that vary by product and country.`, 0, `Do not guess.`, `Designers follow specifications rather than assuming.`),

      mc(L19, 1, 1, `What does responsive design mean?`, [`A layout adapts to different screen sizes`, `A website that answers visitor email messages automatically`, `A page that can be printed quickly on any printer`, `A logo that animates when the page first loads`], `Think phone versus monitor.`, `Responsive layouts reflow for different devices.`),
      tf(L19, 2, 1, `Interface components like buttons should look consistent throughout a product.`, 0, `Learnability.`, `Consistency makes interfaces predictable.`),
      mc(L19, 3, 2, `What is a design system?`, [`A shared library of components, colors and type styles`, `A printing press setup used for large print runs of posters`, `A single poster template reused across several campaigns`, `A client contract that sets the scope and fee for a project`], `Repetition at scale.`, `Design systems standardize reusable parts.`),
      mc(L19, 4, 2, `Why give users feedback after they tap a button?`, [`So they know the action worked`, `To slow them down before the next step`, `To add decoration to the screen`, `To hide any errors from the user`], `Think of a confirmation message.`, `Visible feedback confirms that an action registered.`),
      tf(L19, 5, 3, `UI design is the visual layer within the wider discipline of UX design.`, 0, `One contains the other.`, `UX covers how a product works for users; UI is its visual layer.`),

      mc(L20, 1, 1, `Which graphics are made of mathematical descriptions of lines and curves?`, [`Vector`, `Raster`, `Bitmap`, `Compressed JPEG`], `They scale freely.`, `Vector graphics use formulas, not pixels.`),
      tf(L20, 2, 1, `Enlarging a raster image beyond its original pixel size makes it look soft or blocky.`, 0, `Software must invent pixels.`, `Raster images are tied to a fixed number of pixels.`),
      mc(L20, 3, 2, `Which file type is a good fit for a photograph on a web page?`, [`JPEG`, `SVG`, `A dieline`, `A swatch`], `Lossy compression suits continuous tones.`, `JPEG compresses photographs efficiently.`),
      mc(L20, 4, 2, `Which format supports lossless compression and transparency?`, [`PNG`, `JPEG`, `EPS only`, `MP3`], `Consider logos on transparent backgrounds.`, `PNG is lossless and supports transparency.`),
      tf(L20, 5, 3, `A logo built as vector artwork can be used from a tiny icon to a billboard without losing sharpness.`, 0, `Scaling.`, `Vector shapes are resolution independent.`),

      mc(L21, 1, 1, `What is bleed?`, [`Artwork extending past the trim line so edges print cleanly`, `Ink that smears when the sheet is still wet`, `A margin inside the page that keeps text from the edge`, `A color mode that stores more ink values in each file`], `Cutting is not exact.`, `Bleed prevents white slivers if the cut shifts.`),
      mc(L21, 2, 1, `Which color mode do most commercial print jobs use?`, [`CMYK`, `RGB`, `Grayscale only`, `Hex`], `Think of inks.`, `Commercial printing generally uses cyan, magenta, yellow and black.`),
      tf(L21, 3, 2, `A typical target resolution for photos in print is about 300 ppi at the printed size.`, 0, `Common figure.`, `300 ppi is a typical target, though printers' specifications vary.`),
      mc(L21, 4, 2, `Why keep important text inside a safe margin?`, [`A slightly shifted cut will not clip it`, `Margins are decorative and only for appearance`, `It makes the text print darker on paper`, `It reduces the file size sent to the printer`], `Trimming is imprecise.`, `Safe margins protect content from trimming variation.`),
      tf(L21, 5, 3, `You should always ask the printer for their specifications because requirements vary.`, 0, `Do not assume.`, `Printers set their own bleed, color and file requirements.`),

      mc(L22, 1, 1, `In which country did the Swiss Style develop?`, [`Switzerland`, `The Netherlands`, `Great Britain`, `Czechoslovakia`], `The name tells you.`, `It emerged in Switzerland, centered on Zurich and Basel.`),
      tf(L22, 2, 1, `Swiss Style designers favored mathematical grids and sans serif type.`, 0, `Order and clarity.`, `Grids and sans serif typography are hallmarks of the style.`),
      mc(L22, 3, 2, `Which designer is known for grid-based posters and writing on grid systems?`, [`Josef Müller-Brockmann`, `Carolyn Davidson, creator of the Nike Swoosh`, `Max Miedinger, designer of the Helvetica typeface`, `Adrian Frutiger, designer of the Univers typeface`], `Think of the Zurich poster designer.`, `Müller-Brockmann is closely associated with grid systems.`),
      mc(L22, 4, 2, `What belief underlay the Swiss Style?`, [`Design could be a neutral, universal means of communication`, `Design should be a purely personal form of artistic self-expression`, `Design should avoid grids and keep every layout loose and improvised`, `Design should rely on script type to feel warm and human to readers`], `Objectivity.`, `Practitioners aimed for objective, orderly information design.`),
      tf(L22, 5, 3, `Later critics argued that strict neutrality can feel cold and reflect particular cultural assumptions.`, 0, `Debates exist.`, `Critiques of universalism and coldness are part of the discussion.`),

      mc(L23, 1, 1, `What is a design brief?`, [`A statement of goals, audience, deliverables, constraints, budget and schedule`, `The finished logo and files that the designer hands over to the client at the end of the project`, `A list of the fonts and colors that the studio prefers to use on every single job`, `A printing proof that the client signs to approve color before the press run`], `It starts the project.`, `The brief defines what success looks like.`),
      mc(L23, 2, 1, `Which is a more useful critique comment?`, [`The date is hard to find, and the audience needs it first`, `I just do not like it, and it does not feel right to me at all`, `It is ugly, so I think we should start the work over again`, `Make it pop more, and add some more energy to the whole thing`], `Tie it to purpose.`, `Useful critique refers to goals and specifics.`),
      tf(L23, 3, 2, `Designers usually try only one idea because the first is best.`, 1, `Ideation means many options.`, `Generating many options usually produces better results.`),
      mc(L23, 4, 2, `Why agree on the number of revision rounds in advance?`, [`It sets expectations and limits endless changes`, `It makes the design finish faster`, `It removes the need for a brief at the start`, `It is a printing rule for presses`], `Think about scope.`, `Defined rounds keep the project manageable.`),
      tf(L23, 5, 3, `Projects can loop back to earlier stages as feedback arrives.`, 0, `Process is not strictly linear.`, `Iteration is a normal part of design.`),

      mc(L24, 1, 1, `Which is an example of a dark pattern?`, [`Hiding a cancel button to discourage canceling`, `Labeling a button clearly so users know the result`, `Using readable type at a comfortable size`, `Adding alt text to images that carry meaning`], `It works against users.`, `Dark patterns steer users against their interests.`),
      tf(L24, 2, 1, `A chart with a misleading axis can exaggerate differences.`, 0, `Honesty.`, `Distorted axes can mislead viewers.`),
      mc(L24, 3, 2, `Fonts are best understood as what?`, [`Licensed software with terms that may differ for web, app and print`, `Free for any use because they are only collections of letter shapes`, `Always in the public domain once a designer has installed them on a computer`, `Part of the monitor hardware and therefore never subject to separate terms`], `Check the license.`, `Font licenses vary, so use them according to their terms.`),
      mc(L24, 4, 2, `What should a portfolio show?`, [`A few strong projects with the problem, your role, process and result`, `Every file you have ever made, arranged in order from oldest to newest`, `Only finished logos presented with no explanation of the process behind them`, `Only photos of your desk, your tools and your studio workspace setup`], `Quality over quantity.`, `Explained, selective work is more convincing.`),
      tf(L24, 5, 3, `Designers agree universally that unpaid speculative pitches are acceptable.`, 1, `The lesson mentions disagreement.`, `Some argue against spec work, while others accept it in limited cases.`),
    ],
  },
};
