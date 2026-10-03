import type { CourseModule } from '../courseModule';
import type { Question } from '../types';

// [level, prompt, choices (null = true/false), answer, hint, explanation]
// Multiple-choice answers are authored in position 0 and rotated by the helper to spread positions.
type QSpec = [1 | 2 | 3, string, string[] | null, number, string, string];

const QS: Question[] = [];

const lesson = (id: string, title: string, blurb: string, minutes: number, body: string, specs: QSpec[]) => {
  specs.forEach(([level, prompt, choices, answer, hint, explanation], i) => {
    const qid = `${id}.q${i + 1}`;
    if (choices === null) {
      QS.push({ id: qid, lessonId: id, kind: 'tf', prompt, answer: answer as 0 | 1, hint, explanation, level });
    } else {
      const shift = (QS.length * 3 + 2) % choices.length;
      const rotated = choices.map((_, k) => choices[(k - shift + choices.length) % choices.length]);
      const newAnswer = (answer + shift) % choices.length;
      QS.push({ id: qid, lessonId: id, kind: 'mcq', prompt, choices: rotated, answer: newAnswer, hint, explanation, level });
    }
  });
  return { id, title, blurb, minutes, body };
};

const t1 = [
  lesson('comic-history.l01', 'Panels and Page Layout', 'The panel is the basic unit of a comic page, and layouts arrange panels into a rhythm.', 6,
`A panel is a single framed picture on a comic page, the basic unit of sequential art. A layout is the arrangement of panels on the page. The comic studio in Plajah describes layouts as lists of panel rectangles in page-percent space, each with an x position, a y position, a width and a height, so a page is just a set of boxes that add up to 100 percent.

The preset layouts show the common shapes. A splash is one panel filling the whole page. The 2 · Stacked layout puts two panels in rows, and 3 · Tiers gives three rows, called tiers. Grid layouts divide the page evenly: 4 · Grid is two columns by two rows, 6 · Grid is two by three, and 9 · Grid is three by three. The Classic layout has a wide top panel, two middle panels side by side and a wide bottom panel. Hero + Strip has one large panel above a strip of three.

Changing layout changes how the page feels. A tight grid gives a steady, even beat. A big panel gives importance and space. Creators choose how many panels to use and how big to make each one, so the layout itself becomes part of the storytelling.`,
  [
    [1, 'What is a panel in a comic?', ['A single framed picture on a page', 'A page number', 'The decorative border around a cover', 'A speech balloon'], 0, 'It is the basic unit of the page.', 'A panel is one framed image; a page is built from panels.'],
    [1, 'What does a splash layout contain?', ['One panel filling the whole page', 'Nine equal panels in three rows of three', 'Four tall panels standing side by side', 'A wide strip of three small panels'], 0, 'The name suggests one big image.', 'The Splash layout in the studio is a single panel at 100 percent width and height.'],
    [2, 'In the studio presets, how is the 6 · Grid arranged?', ['Two columns by three rows', 'Three columns by three rows', 'One column by six rows', 'Six columns by one row'], 0, 'Six equals 2 times 3.', '6 · Grid divides the page into two columns and three rows.'],
    [3, 'Why does choosing a layout affect storytelling?', ['Panel count and size change the rhythm and emphasis of a page', 'It changes the language of the text', 'It decides who owns the copyright to the finished page and its art', 'It controls the printing cost only'], 0, 'Think about a big panel versus many small ones.', 'A tight grid feels steady while a large panel gives weight, so layout shapes pacing and emphasis.'],
  ]),
  lesson('comic-history.l02', 'The Gutter and Panel Spacing', 'The space between panels is where the reader joins the pictures together.', 6,
`The gutter is the gap between panels. It may look like empty space, but it does real work: the reader's mind jumps across it to connect one picture to the next. Nothing is drawn there, yet that is where time passes and events are implied. A character raises a fist in one panel and a wall cracks in the next; the gutter carries the punch.

In Plajah's ComicPanelBuilder, the gutter is a setting you can adjust. The slider runs from 0 to 20, and a page's panelGutter defaults to 6. Each panel is drawn a little smaller than its slot, inset by half the gutter on each side, so wider gutters make the panels float further apart on the page. At 0 panels touch edge to edge.

Gutter size gives a creator a quiet control over tempo. Narrow gutters make panels feel close together in time, with fast action. Wide gutters slow the reader and give each image room. Some pages remove the gutters altogether, or let a picture break its frame, to create a sense of speed or of a world with no borders. The lesson is that blank space on a page is a storytelling tool, not leftover room.`,
  [
    [1, 'What is the gutter in a comic page?', ['The gap between panels', 'The border of the cover', 'A type of lettering', 'The title banner'], 0, 'It is the empty space around panels.', 'The gutter is the space separating panels, where the reader connects images.'],
    [1, 'In the ComicPanelBuilder, what is the default panelGutter value?', ['6', '0', '12', '20'], 0, 'It is a small number between the slider ends.', 'The builder uses page.panelGutter ?? 6 as the default.'],
    [2, 'What range does the gutter slider in the panel builder cover?', ['0 to 20', '1 to 100', '5 to 6', '10 to 50'], 0, 'The maximum is twenty.', 'The slider has min 0 and max 20.'],
    [3, 'What does a wide gutter usually do to the feel of a page?', ['Slows the reader and gives each image room', 'Makes the action feel faster and more urgent', 'Removes the need for any story in the panels', 'Changes the reading direction from left to right'], 0, 'Think space equals time.', 'More space between panels slows the tempo; narrow gutters feel quicker.'],
  ]),
  lesson('comic-history.l03', 'Speech Balloons, Captions and Sound Effects', 'The vocabulary of words on a comic page.', 7,
`Words in comics come in distinct types, each with its own look. The panel builder defines six bubble types. A speech balloon is white with dark text and carries ordinary dialogue. A thought balloon is rounder and softer, used for what a character thinks but does not say. A shout balloon is yellow with heavy, bold text and sharper corners for loud speech. A whisper balloon is pale grey with thin, light text for quiet speech.

The other two are not spoken. A caption, labelled narration in the data, is a dark box with white text, used for the narrator's voice, scene setting or the passage of time. An SFX, short for sound effect, is lettering drawn right into the picture, in bold red in the builder, with sample text like POW. Panels can also carry a separate caption bar at the top or bottom, and a sound-effect text style, with a larger manga style.

Balloon shape and lettering style tell the reader how something sounds without any audio. Balloons also guide the eye, because readers move from one to the next. A creator places them to follow the reading order, and keeps them out of the way of faces and key action in the art.`,
  [
    [1, 'Which balloon type is used for what a character thinks but does not say?', ['Thought balloon', 'Shout balloon with bold yellow fill', 'Caption box for the narrator', 'SFX lettering drawn into the art'], 0, 'It is rounder and softer.', 'A thought balloon shows unspoken thoughts.'],
    [1, 'What does SFX stand for in comics?', ['Sound effects', 'Special framing extras', 'Single frame exposure', 'Story format exchange'], 0, 'It is the lettering for noises like POW.', 'SFX means sound effects, drawn as lettering in the picture.'],
    [2, 'In the panel builder, which bubble type uses a dark box with white text for narrator voice?', ['Narration (caption)', 'Whisper', 'Shout', 'Thought'], 0, 'It is not spoken by a character.', 'The narration type is labelled Caption and appears as a dark box with white text.'],
    [3, 'Why do creators arrange balloons carefully on a page?', ['They guide the eye in reading order and should not cover key art', 'They determine which colour printing process and paper stock is used', 'They set the page count', 'They choose the publisher'], 0, 'Think about where readers look next.', 'Balloon placement leads the reader through the page and should avoid hiding faces or action.'],
  ]),
  lesson('comic-history.l04', 'Reading Direction: Left to Right and Right to Left', 'Why a manga page runs backwards compared with a Western comic.', 7,
`Western comics read left to right and top to bottom, like English text. Japanese manga traditionally reads right to left. A reader opens a manga from what Western readers would call the back, starts at the top right of the page, and moves left and down. Panels, balloons and even the page order follow that direction.

Plajah builds this into its tools. The ComicReader has a reading direction setting that can be ltr or rtl, with a button that toggles between them. In right-to-left mode, the arrow keys swap meaning: the left arrow moves forward and the right arrow moves back. In double-page spread mode, the pages are laid out in reverse, so the right page comes first. Tapping the left or right third of the screen also follows the direction.

The panel builder follows the same rule when ordering panels. For manga, it sorts panels so that the ones with larger x positions, further right, come first, and then goes top to bottom. For Western comics it sorts top to bottom and then left to right. When a layout is made for manga, it still sets panels in page-percent coordinates, but the order the reader meets them reverses. Good creators plan balloons and action to flow with the direction.`,
  [
    [1, 'In which direction do traditional manga pages read?', ['Right to left', 'Left to right', 'Bottom to top only', 'Diagonally from the centre'], 0, 'They open from the Western back cover.', 'Manga traditionally reads from right to left.'],
    [1, 'How do Western comics normally read?', ['Left to right, top to bottom', 'Right to left, top to bottom', 'Bottom to top', 'Randomly'], 0, 'Same as English text.', 'Western comics follow left-to-right, top-to-bottom order.'],
    [2, 'In the ComicReader in right-to-left mode, what does the left arrow key do?', ['Moves forward a page', 'Moves back to the previous page', 'Zooms in', 'Closes the reader'], 0, 'Directions are swapped.', 'In RTL mode the keys swap meaning, so left goes forward.'],
    [3, 'How does the panel builder order panels for manga?', ['Rightmost panels first, then top to bottom', 'Leftmost panels first', 'By panel colour', 'Alphabetically'], 0, 'It sorts by x, descending.', 'For manga it sorts so larger x comes first, then smaller y, matching right-to-left reading.'],
  ]),
  lesson('comic-history.l05', 'Pacing: Silence, Reveals and the Big Panel', 'How panel size and number control the speed of reading.', 7,
`Pacing in comics is the speed at which a reader moves through a story, and creators control it mostly with panels. More small panels in a row feel fast; a single large panel makes the reader pause. The layout presets in Plajah show this.

The Splash layout is one huge panel for a dramatic moment. Inset Reveal fills the page with one image and places two small insets over it, so the reader sees a large scene and then notices details. The Cinematic 5 layout runs a thin wide panel across the top like a film's establishing shot before dropping into smaller panels below. Manga · Silence gives nearly half the page to a wide opening panel, then uses smaller panels beneath for a quiet beat. Manga · Reaction uses a large panel and stacked smaller ones to show a character's response. Webtoon · Reveal separates three vertical strips with gaps, so that the last big strip lands after the reader scrolls past empty space.

The idea behind them is simple: space is time. Give an image room, and the reader stays with it. Cut to small panels and the story accelerates. Great pages mix both, building to a large panel for impact.`,
  [
    [1, 'What does a single large panel usually do to the reading pace?', ['Makes the reader pause', 'Makes the story feel faster', 'Removes the plot', 'Changes the direction'], 0, 'Think of a dramatic pause.', 'A big panel gives an image room and slows the reader down.'],
    [1, 'Which preset layout puts one image across the page with small insets on top?', ['Inset Reveal', 'Grid 9', 'Two Stacked', 'Webtoon 5'], 0, 'The name mentions revealing.', 'Inset Reveal places two small insets over a full-page panel.'],
    [2, 'Which layout category does Webtoon · Reveal belong to?', ['Webtoon', 'Comic', 'Manga', 'Magazine'], 0, 'It is a vertical scroll format.', 'The data lists Webtoon · Reveal in the webtoon category.'],
    [3, 'What principle sits behind pacing in panel layouts?', ['Space on the page works like time in the story', 'More words on the page always means a better story', 'Every single page needs nine panels to read well', 'Pages must always be perfectly symmetrical in layout'], 0, 'Room for an image equals duration.', 'Giving an image more room makes the reader linger; small panels speed up the narrative.'],
  ]),
];

const t2 = [
  lesson('comic-history.l06', 'The Strip and the Newsstand', 'Newspaper strips build a mass audience and Action Comics #1 launches the comic book.', 7,
`The museum's timeline for Western comics begins in the 1890s to 1930s with The Strip and the Newsstand. In these decades, newspaper strips built a mass audience. The museum names three examples: the Yellow Kid, Little Nemo and Krazy Kat. Because newspapers reached daily readers, strips taught a huge public to read pictures in sequence.

The era ends with a turning point in 1938, when Action Comics #1 introduced Superman and, in the museum's words, the comic book was born. This is a different format from the strip: a stapled magazine of stories rather than a few panels in a paper.

The museum also lets visitors read public-domain comics, preserved from the Internet Archive, and its collections include a shelf for Newspaper Strips alongside the Golden Age shelf. Two creators from this period appear among its legends. Hergé's The Adventures of Tintin began in 1929 and he is described as a master of the clear line style who defined European comics, called bande dessinee. Will Eisner, active from the 1930s, is credited with pioneering sequential-art storytelling.`,
  [
    [1, 'Which event does the museum say launched the comic book?', ['Action Comics #1 introducing Superman in 1938', 'The first collected Tintin album in European print', 'The founding of Weekly Shonen Jump in Japan in 1968', 'The publication of Watchmen as a twelve-issue series'], 0, 'It is a Superman milestone.', 'The museum timeline says Action Comics #1 in 1938 introduced Superman and the comic book was born.'],
    [1, 'Which of these is a newspaper strip named by the museum?', ['Krazy Kat', 'Watchmen', 'Astro Boy', 'Sandman'], 0, 'It is from the 1890s to 1930s era.', 'Yellow Kid, Little Nemo and Krazy Kat are named as early newspaper strips.'],
    [2, 'Which creator is described as master of the clear line style?', ['Herge', 'Stan Lee', 'Jack Kirby', 'Frank Miller'], 0, 'He created Tintin.', 'The museum credits Herge, the Tintin creator, with the clear line style.'],
    [3, 'Why did newspaper strips matter to the history of comics?', ['They reached daily readers and built a mass audience for sequential pictures', 'They replaced all novels', 'They were printed only for classroom use and were read mainly in schools by pupils', 'They were the first manga'], 0, 'Think about who bought newspapers.', 'Newspapers reached huge daily audiences, which created the mass readership for comics.'],
  ]),
  lesson('comic-history.l07', 'The Golden and Silver Ages', 'Superheroes explode, then Marvel redefines them as flawed humans.', 7,
`The museum divides superhero history into ages. The Golden Age runs from 1938 to 1956. Superheroes explode, with Superman, Batman, Wonder Woman and Captain America, as comics become a wartime and postwar staple for millions of readers.

The Silver Age runs from 1956 to 1970, and the museum calls it a science-fueled revival. Marvel's Stan Lee, Jack Kirby and Steve Ditko create flawed, human heroes, such as Spider-Man, the X-Men and the Fantastic Four, who redefine the genre. These heroes had everyday troubles as well as powers.

The museum's profiles of the creators explain why. Jack Kirby, an artist active from the 1940s to the 1980s, is called the King of Comics, and his dynamic, cosmic art built the Marvel Universe and the visual language of the superhero. His works include Fantastic Four, X-Men, Captain America and New Gods. Stan Lee, a writer active from the 1960s, co-created Marvel's pantheon with Spider-Man, X-Men, Hulk and Avengers, and gave superheroes real, relatable humanity, flawed people behind the masks. Together they show how a writer and an artist shape a character from two sides.`,
  [
    [1, 'Which era does the museum date from 1938 to 1956?', ['The Golden Age', 'The Silver Age', 'The Bronze Age', 'The Modern Age'], 0, 'It begins with Superman.', 'The Golden Age runs 1938 to 1956 in the museum timeline.'],
    [1, 'Who is called the King of Comics in the museum?', ['Jack Kirby', 'Go Nagai', 'Stan Lee', 'Herge'], 0, 'He drew Fantastic Four.', 'The museum calls Jack Kirby the King of Comics.'],
    [2, 'What is the Silver Age described as in the museum?', ['A science-fueled revival with flawed human heroes', 'A period with no superheroes', 'A time of only newspaper strips', 'The start of manga'], 0, 'Spider-Man and the X-Men belong here.', 'The museum describes it as a science-fueled revival led by Lee, Kirby and Ditko.'],
    [3, 'What did Stan Lee add to superheroes, per the museum?', ['Real relatable humanity: flawed people behind the masks', 'Only larger muscles', 'A new reading direction', 'A switch to full color printing on glossier, heavier paper'], 0, 'Think character, not powers.', 'The museum says Lee gave superheroes real, relatable humanity.'],
  ]),
  lesson('comic-history.l08', 'Bronze Age to Modern Age', 'Darker stories, then comics as literature.', 7,
`The Bronze Age runs from 1970 to 1985. The museum says stories grew darker and more socially aware, dealing with addiction, race and grief, while horror and sword-and-sorcery pushed the medium's boundaries.

The Modern Age begins in 1986 and runs to today. In the museum's words, Watchmen and The Dark Knight Returns legitimize comics as literature, and independent presses and the graphic-novel movement broaden who tells stories and how.

Several modern creators are profiled. Alan Moore, a writer from the 1980s, redefined comics as literature with dense, deconstructive masterworks such as Watchmen, V for Vendetta and From Hell. Frank Miller, a writer-artist, brought noir grit and cinematic edge in The Dark Knight Returns, Sin City and 300. Neil Gaiman wove myth, dream and literary fantasy into The Sandman, which the museum calls the first comic to win a literary award. Will Eisner, with A Contract with God, championed the term graphic novel as a serious literary form. Charles Schulz's Peanuts, running from 1950 to 2000, shows a daily strip becoming a half-century meditation on childhood and failure.`,
  [
    [1, 'Which two works does the museum say legitimized comics as literature in the Modern Age?', ['Watchmen and The Dark Knight Returns', 'Astro Boy and Akira from the Japanese manga boom', 'Tintin and Peanuts from the early strip era', 'Spider-Man and Hulk from the Silver Age'], 0, 'One is by Alan Moore.', 'The museum names Watchmen and The Dark Knight Returns.'],
    [1, 'Who wrote The Sandman?', ['Neil Gaiman', 'Alan Moore', 'Stan Lee', 'Jack Kirby'], 0, 'He wove myth and dream.', 'The Sandman is credited to Neil Gaiman in the museum.'],
    [2, 'What themes does the museum say grew in the Bronze Age?', ['Addiction, race and grief', 'Only space travel', 'Cooking competitions and school sports', 'Silent films'], 0, 'Stories became socially aware.', 'The museum says Bronze Age stories became darker and socially aware, dealing with addiction, race and grief.'],
    [3, 'Which comic is credited with a half-century run from 1950 to 2000?', ['Peanuts', 'Watchmen', 'Sin City', 'Akira'], 0, 'It is by Charles Schulz.', 'Peanuts by Charles Schulz ran from 1950 to 2000.'],
  ]),
  lesson('comic-history.l09', 'Graphic Novels and the Creators Who Built Them', 'Eisner, Moore, Miller and the idea of a comic as a book.', 6,
`A graphic novel is a long-form comic published as a book rather than as a monthly pamphlet. The museum credits Will Eisner, a writer-artist active from the 1930s to the 2000s, with pioneering sequential-art storytelling and championing the graphic novel as a serious literary form. His best known works in the data are The Spirit and A Contract with God.

Other creators in the museum's gallery show what the book form allowed. Alan Moore's Watchmen, V for Vendetta and From Hell are dense and deconstructive. Frank Miller's The Dark Knight Returns, Sin City and 300 are noir and cinematic. Neil Gaiman's The Sandman is a long saga. Hergé's Tintin albums define European comics, known as bande dessinee, and Charles Schulz's Peanuts shows the strip at its most personal.

The museum also includes a Global Library tab that searches Open Library for books worldwide, and the Lorea reader can open comics as graphic novels, in image pages or PDF format. Together these show how a form that started in newspapers and magazines grew into shelves of books, where a single creator can carry a long story from the first page to the last.`,
  [
    [1, 'Which creator is credited with championing the graphic novel as a serious literary form?', ['Will Eisner', 'Go Nagai', 'Stan Lee', 'Moto Hagio'], 0, 'He wrote A Contract with God.', 'The museum credits Will Eisner with championing the graphic novel.'],
    [1, 'What is a graphic novel?', ['A long-form comic published as a book', 'A short daily comic strip printed in newspapers', 'A movie poster', 'A type of speech balloon'], 0, 'Think book rather than pamphlet.', 'A graphic novel is a long comic story in book form.'],
    [2, 'Which pair of works is by Alan Moore?', ['Watchmen and V for Vendetta', 'Sin City and 300 by Frank Miller', 'Peanuts and Tintin from the strip era', 'Astro Boy and Black Jack by Tezuka'], 0, 'One features Guy Fawkes masks in the title lettering.', 'Moore wrote Watchmen, V for Vendetta and From Hell.'],
    [3, 'How does the museum describe the term bande dessinee?', ['European comics, defined by Herge\'s clear line', 'Japanese manga published in right-to-left magazines and volumes', 'American superhero comics', 'Korean webtoons'], 0, 'Think Tintin.', 'Herge is described as having defined European comics, called bande dessinee.'],
  ]),
];

const t3 = [
  lesson('comic-history.l10', 'Roots of Manga', 'From Hokusai to kamishibai: Japan\'s visual story tradition.', 6,
`The museum's manga timeline begins with a period labelled Edo to 1930s, titled Roots. It says that from Hokusai's sketch manga to early twentieth-century strips and kamishibai street theatre, Japan built a deep visual-story tradition. The word manga was already in use for sketches before it meant a story medium.

Kamishibai means paper theatre. A storyteller showed illustrated cards on a street stage and told the tale aloud, which trained audiences to follow a story told in pictures. These earlier forms prepared the ground for the modern medium.

The manga era list in the museum starts later, with Post-war Foundations from 1945. The museum notes Tezuka and the birth of story manga there. The roots period matters because it shows that manga was not a copy of Western comics. It grew from its own traditions of picture-telling that included woodblock sketches, magazine strips and street performance.

The museum also lets visitors explore a century of manga, manhwa and manhua through AniList data. Manhwa is the Korean term and manhua the Chinese term. They have their own histories but belong to the same wide family of illustrated storytelling in East Asia.`,
  [
    [1, 'Which artist\'s sketches does the museum cite as early manga?', ['Hokusai', 'Tezuka', 'Kirby', 'Schulz'], 0, 'Edo period woodblock artist.', 'The museum timeline mentions Hokusai\'s sketch manga.'],
    [1, 'What was kamishibai?', ['Street theatre using illustrated cards', 'A weekly manga magazine for boys and girls', 'A film studio that made early animation', 'A kind of speech balloon with soft edges'], 0, 'Its name means paper theatre.', 'The museum lists kamishibai street theatre among Japan\'s early visual story forms.'],
    [2, 'What is the museum\'s title for the earliest manga era in its timeline?', ['Roots', 'The Golden Age', 'The Shonen Boom', 'The Global Era'], 0, 'It covers Edo to the 1930s.', 'The first era is titled Roots, running from the Edo period to the 1930s.'],
    [3, 'Which term does the museum use alongside manga for Korean comics?', ['Manhwa', 'Manhua', 'Bande dessinee', 'Kamishibai'], 0, 'Manhua is the Chinese one.', 'The museum refers to manga, manhwa and manhua; manhwa is Korean.'],
  ]),
  lesson('comic-history.l11', 'Tezuka and the Birth of Story Manga', 'The God of Manga brings film language to the page.', 7,
`Osamu Tezuka is called the God of Manga in the museum. Active from 1946 to 1989, he is known for Astro Boy, Black Jack and Phoenix. The museum says he invented modern story manga and its cinematic panel language, and calls him the father of the industry.

The manga timeline describes the period 1945 to the 1960s as Story Manga is Born. Tezuka's cinematic New Treasure Island and Astro Boy established modern, novelistic manga: long-form, emotional and drawn like film. Instead of short gag strips, stories could unfold over many pages with close-ups, wide shots and changing angles, much like a movie camera.

That film-like approach is why panel layouts in the studio vary so widely. Layouts such as Manga · Action use diagonal panel shapes, called diag-right and diag-left, to add movement and energy. Panels in manga often run larger or smaller depending on the weight of a moment, and silent panels give pauses.

The Post-war Foundations era in the museum begins at 1945 and is described as Tezuka and the birth of story manga. He shows how one creator can change what a medium thinks it can do, by borrowing the language of another art form.`,
  [
    [1, 'Which creator is called the God of Manga?', ['Osamu Tezuka', 'Rumiko Takahashi', 'Eiichiro Oda', 'Go Nagai'], 0, 'He created Astro Boy.', 'The museum calls Osamu Tezuka the God of Manga.'],
    [1, 'Which of these is a Tezuka work in the museum?', ['Astro Boy', 'Naruto', 'Bleach', 'Akira'], 0, 'A robot boy.', 'Tezuka\'s works named include Astro Boy, Black Jack and Phoenix.'],
    [2, 'What did Tezuka bring to manga, according to the museum?', ['A cinematic panel language', 'A switch to vertical scroll', 'The invention of kamishibai', 'Right-to-left reading'], 0, 'Think film.', 'The museum says he invented modern story manga and its cinematic panel language.'],
    [3, 'Which panel shape feature in the studio adds dynamic angled cuts in manga layouts?', ['Diagonal panels (diag-left and diag-right)', 'Circular and star-shaped panels used on every page', 'Panels with no frame', 'Panels stacked in a single column only'], 0, 'The layout data supports a shape option.', 'The layout shape field supports rect, diag-left and diag-right for angled manga cuts.'],
  ]),
  lesson('comic-history.l12', 'Shonen, Shojo and the Magazine Boom', 'Weekly serials and the Year 24 Group shape the industry.', 7,
`The museum marks the period 1968 to the 1980s as the Shonen Boom. Weekly Shonen Jump launches, and serialized action, sports and adventure reach tens of millions of readers, setting the industry's engine running. Shonen means aimed at boys. Creators in this vein include Akira Toriyama, whose Dragon Ball and Dr. Slump made shonen a global phenomenon, and Go Nagai, active from 1967, who created the piloted-robot and dark-fantasy genres with Devilman, Mazinger Z and Cutie Honey.

In the 1970s the museum describes the Shojo Revolution. Shojo means aimed at girls. The Year 24 Group, with Moto Hagio, Takemiya and their peers, transformed girls' manga into psychologically rich, boundary-pushing literary work. Moto Hagio, active from 1969, is known for The Poe Clan and They Were Eleven. Rumiko Takahashi, active from 1978, wrote Ranma 1/2, Inuyasha and Urusei Yatsura and is called the queen of the romantic comedy.

The panel studio reflects these genres. Its manga layouts include Manga · Romance, with a large opening panel and two panels beneath, and Manga · Action, with angled panels for speed. Weekly deadlines favoured clear, readable pages that kept a reader coming back each week.`,
  [
    [1, 'Which magazine launch does the museum use to mark the Shonen Boom?', ['Weekly Shonen Jump', 'Action Comics', 'The Sandman', 'Peanuts'], 0, 'It begins in 1968.', 'The museum says Weekly Shonen Jump launches in the Shonen Boom period starting 1968.'],
    [1, 'Which creator is associated with Dragon Ball?', ['Akira Toriyama', 'Moto Hagio', 'Naoki Urasawa', 'Katsuhiro Otomo'], 0, 'He also made Dr. Slump.', 'Akira Toriyama created Dragon Ball and Dr. Slump.'],
    [2, 'What is the Year 24 Group credited with in the museum?', ['Transforming girls\' manga into psychologically rich literary work', 'Inventing the comic book', 'Creating kamishibai', 'Founding Marvel'], 0, 'Moto Hagio belongs to it.', 'The museum says the Year 24 Group transformed shojo manga into literary art.'],
    [3, 'Which statement about Rumiko Takahashi matches the museum?', ['She is called the queen of the romantic comedy', 'She created Astro Boy', 'She wrote Watchmen', 'She launched Weekly Shonen Jump'], 0, 'Ranma 1/2 and Inuyasha.', 'The museum calls her the queen of the romantic comedy and credits Ranma 1/2 and Inuyasha.'],
  ]),
];

const t4 = [
  lesson('comic-history.l13', 'The Global Era', 'Dragon Ball, Sailor Moon, One Piece, Naruto and digital publishing.', 7,
`The museum's final manga period is 1990s to Today, titled The Global Era. It says that Dragon Ball, Sailor Moon, One Piece and Naruto broke out worldwide, and that digital publishing and simultaneous translation made manga a global language. The manga eras shown in the museum's browser also include Golden 80s to 90s, from 1985, with global breakout classics, and Modern, from 2005, with digital and worldwide simulpub.

Several creators represent this reach. Eiichiro Oda, active from 1997, is the author of One Piece, called the best-selling manga of all time, a decades-long adventure of staggering scale. Katsuhiro Otomo's Akira brought cyberpunk manga, and anime, to the whole world through a hyper-detailed, kinetic vision. Naoki Urasawa, whose works include Monster, 20th Century Boys and Pluto, is called a master of the literary thriller in manga form.

The global spread changed reading habits too. Many international publishers keep manga in its original right-to-left order, so readers abroad learn the direction. Plajah's ComicReader supports this with an RTL toggle, so a manga and a Western comic can sit in the same reader.`,
  [
    [1, 'Which creator wrote One Piece?', ['Eiichiro Oda', 'Moto Hagio', 'Stan Lee', 'Go Nagai'], 0, 'Active from 1997.', 'One Piece is by Eiichiro Oda, per the museum.'],
    [1, 'What does the museum say made manga a global language?', ['Digital publishing and simultaneous translation', 'Newspaper strips only', 'Ending weekly serialisation so that each story was released as a single book', 'Banning translation'], 0, 'Think of how readers get chapters.', 'The Global Era entry credits digital publishing and simultaneous translation.'],
    [2, 'Which work brought cyberpunk manga and anime to the world?', ['Akira', 'Peanuts', 'Tintin', 'Black Jack'], 0, 'Katsuhiro Otomo.', 'The museum says Otomo\'s Akira brought cyberpunk manga and anime to the world.'],
    [3, 'Which of these is named as a title that broke out worldwide in the Global Era?', ['Sailor Moon', 'Little Nemo', 'Krazy Kat', 'Phoenix'], 0, 'It is in the same list as Dragon Ball and Naruto.', 'The museum lists Dragon Ball, Sailor Moon, One Piece and Naruto.'],
  ]),
  lesson('comic-history.l14', 'Webtoons: Comics for the Scroll', 'Vertical strips designed for phones.', 6,
`A webtoon is a comic designed to be read by scrolling vertically, usually on a phone, instead of turning pages. In Plajah's layout data, webtoon is its own category beside comic and manga. The presets are Webtoon · 4, which is four equal rows stacked from top to bottom, Webtoon · 5, which is five rows, and Webtoon · Reveal.

Each webtoon layout uses full-width panels. In the Reveal layout, three strips of different heights sit with deliberate gaps between them. Because the reader scrolls, the gap becomes a pause: they scroll through empty space, then the next image arrives. This makes use of the same gutter idea as in print, but gives it a longer, more controlled effect.

The museum's manga browser mentions manhwa and manhua, the Korean and Chinese cousins of manga. These forms share the East Asian tradition of illustrated storytelling, and the webtoon format is closely associated with that world's digital publishing.

Webtoon panels are not paired side by side, so reading direction is simple: top to bottom. That also makes them easy to adapt for different languages. The lesson is that every new screen shape invites new layouts, just as newspapers once did for strips.`,
  [
    [1, 'How is a webtoon normally read?', ['By scrolling vertically', 'By turning pages right to left', 'By unfolding a poster', 'By listening to audio'], 0, 'Think phone screens.', 'A webtoon is a vertical-scroll comic.'],
    [1, 'How many rows does the Webtoon · 5 layout have?', ['Five', 'Four', 'Nine', 'Two'], 0, 'The number is in the name.', 'Webtoon · 5 stacks five full-width rows.'],
    [2, 'In the Webtoon · Reveal layout, what do the gaps between strips create?', ['A pause as the reader scrolls before the next image', 'A change in reading direction from top to bottom to left to right', 'A second page', 'A sound effect'], 0, 'Think of scrolling through empty space.', 'The gaps act like long gutters, delaying the reveal of the next image.'],
    [3, 'Which statement about reading order in webtoon layouts is correct?', ['Panels are stacked in rows, so the order is simply top to bottom', 'They always read right to left, the same way traditional manga pages do', 'They read from bottom to top because readers scroll upward each time', 'They have no set reading order at all, so readers may start on any strip'], 0, 'No side-by-side panels.', 'Webtoon layouts stack panels vertically, so the reader moves from top to bottom.'],
  ]),
];

export const COURSE_MODULE: CourseModule = {
  curriculum: {
    id: 'comic-history',
    label: 'Comics and Manga: A History',
    blurb: 'How sequential art grew from newspaper strips to comic books, manga and webtoons, plus the craft of panels, balloons and pacing.',
    accent: '#FF6FA8',
    framework: 'ncas',
    tracks: [
      { id: 'comic-history.t1', title: 'The Craft of the Page', blurb: 'Panels, gutters, balloons, reading direction and pacing.', level: 'FOUNDATION', lessons: t1 },
      { id: 'comic-history.t2', title: 'A History of Western Comics', blurb: 'Strips, the Golden and Silver Ages and the rise of the graphic novel.', level: 'INTERMEDIATE', lessons: t2 },
      { id: 'comic-history.t3', title: 'A History of Manga', blurb: 'From Hokusai and kamishibai through Tezuka to the shonen and shojo booms.', level: 'INTERMEDIATE', lessons: t3 },
      { id: 'comic-history.t4', title: 'Comics Without Borders', blurb: 'The global era of manga and the vertical-scroll webtoon.', level: 'ADVANCED', lessons: t4 },
    ],
  },
  bank: { curriculumId: 'comic-history', questions: QS },
};
