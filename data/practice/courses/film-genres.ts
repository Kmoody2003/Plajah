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

const L01 = 'film-genres.l01';
const L02 = 'film-genres.l02';
const L03 = 'film-genres.l03';
const L04 = 'film-genres.l04';
const L05 = 'film-genres.l05';
const L06 = 'film-genres.l06';
const L07 = 'film-genres.l07';
const L08 = 'film-genres.l08';
const L09 = 'film-genres.l09';
const L10 = 'film-genres.l10';
const L11 = 'film-genres.l11';
const L12 = 'film-genres.l12';
const L13 = 'film-genres.l13';
const L14 = 'film-genres.l14';
const L15 = 'film-genres.l15';
const L16 = 'film-genres.l16';
const L17 = 'film-genres.l17';
const L18 = 'film-genres.l18';
const L19 = 'film-genres.l19';
const L20 = 'film-genres.l20';
const L21 = 'film-genres.l21';
const L22 = 'film-genres.l22';
const L23 = 'film-genres.l23';
const L24 = 'film-genres.l24';

export const COURSE_MODULE: CourseModule = {
  curriculum: {
    id: 'film-genres',
    label: 'Film Genres: Deep Dives',
    blurb: 'How genres work, where they came from and how they change, from Westerns and film noir to Nollywood, Bollywood and the streaming era. Each lesson covers conventions, key films and filmmakers, cultural context and how to watch.',
    accent: '#E23B6D',
    framework: 'ncas',
    tracks: [
      {
        id: 'film-genres.t1',
        title: 'Classic Genres: Frontier, Shadows, Scares and Song',
        blurb: 'Five genres every viewer meets early, and the habits that define each one.',
        level: 'FOUNDATION',
        lessons: [
          {
            id: L01,
            title: 'The Western: Frontier Myths',
            blurb: 'The Western turned the nineteenth-century American West into a stage for arguments about law, violence and civilization.',
            minutes: 7,
            body: `A genre is a family of films that share recognizable conventions: familiar settings, character types, story shapes and visual signs. Audiences use those habits to know what to expect, and filmmakers use them to deliver or to surprise. The Western is a good first example because its conventions are so easy to spot.

Westerns are set mostly in the American West in the decades after the Civil War. Typical ingredients are wide open landscapes, horses, guns, saloons, railroads, a lawman or a gunfighter, and a town that needs defending. Underneath sits a recurring tension between wilderness and civilization. The Great Train Robbery (1903) is often cited as an early narrative film with Western elements, and the form grew through the silent era and boomed in the 1930s to 1950s.

John Ford made Stagecoach (1939), which sends a group of very different strangers across dangerous territory and filmed in Monument Valley, a place that became a visual signature of the genre. Ford's The Searchers (1956) is admired for its obsessive hero. High Noon (1952) is often read as a comment on political pressure in its own time.

Westerns also carry a serious flaw: they often reduced Native Americans to stereotypes or villains and told history from the settlers' side. Later films questioned this. Sergio Leone's Italian-made Westerns, such as A Fistful of Dollars (1964), made the genre grittier, and Unforgiven (1992) examined the cost of violence.

How to watch: notice who is allowed to speak and whose land it is.`,
          },
          {
            id: L02,
            title: 'Film Noir: Shadows and Fatal Attractions',
            blurb: 'Film noir is a mood of dark lighting, moral compromise and doomed desire, shaped by crime fiction and postwar unease.',
            minutes: 7,
            body: `Film noir means "black film" in French. The term was applied by French critics after World War II, with Nino Frank using it in 1946 when he noticed how many dark American crime pictures had suddenly arrived in Paris. Notice something important: filmmakers at the time did not call their work noir. The label came later, which is why people still debate whether noir is a genre, a style, or a mood.

Its look and feel are easy to describe. Low-key lighting throws hard shadows, often striped by window blinds. The streets are wet and nighttime. A weary detective or an ordinary man in trouble narrates in voice-over, and the story is often told in flashback. The femme fatale, a seductive woman who leads the hero toward ruin, is a famous figure, though modern viewers also ask how fairly these women were written.

Roots include German Expressionism, whose directors and cameramen fled to Hollywood, and the hard-boiled fiction of writers such as Dashiell Hammett, Raymond Chandler and James M. Cain. Key titles include The Maltese Falcon (1941), Double Indemnity (1944, directed by Billy Wilder), Out of the Past (1947) and Touch of Evil (1958).

Consider Double Indemnity: an insurance salesman helps a client's wife plan a murder, and the narration shows from the start that it will go wrong. The Production Code, which required crime not to pay, shaped these endings. Later films such as Chinatown (1974) and Blade Runner (1982) are called neo-noir.

How to watch: follow the light, and ask who is telling the story.`,
          },
          {
            id: L03,
            title: 'Horror: Fear as Mirror',
            blurb: 'Horror delivers fear and dread, and often turns the anxieties of its era into monsters.',
            minutes: 7,
            body: `Horror aims to provoke fear, dread or disgust, and it does so with a surprising range of tools: suspense, shock, atmosphere and the grotesque. Many theorists argue that horror works like a mirror, reflecting what a society is anxious about at the time, though any single film can be read several ways.

Early landmarks include the German silent Nosferatu (1922, directed by F. W. Murnau) and the Universal monster cycle of the early 1930s: Dracula (1931, directed by Tod Browning) and Frankenstein (1931, directed by James Whale). Both drew on Gothic novels. In Britain, Hammer Films revived these stories in color, for example in Horror of Dracula (1958).

In 1960 Psycho broke conventions by killing its apparent heroine early. Then came a run of films that moved the threat into everyday life: Night of the Living Dead (1968, directed by George A. Romero), Rosemary's Baby (1968), The Exorcist (1973) and Halloween (1978, directed by John Carpenter). Night of the Living Dead was made independently and cheaply, and its ending is widely read as a bleak commentary on violence and race in America. Get Out (2017, directed by Jordan Peele) used horror to explore racism directly.

Subgenres include the slasher, body horror, folk horror and found footage, as in The Blair Witch Project (1999). The scholar Carol Clover introduced the term "final girl" in a 1987 article, and developed it in her 1992 book, for the last survivor of many slashers.

How to watch: ask what the monster stands for, and what the film wants you to fear.`,
          },
          {
            id: L04,
            title: 'Science Fiction: What If?',
            blurb: 'Science fiction explores imagined science and technology to ask questions about the present.',
            minutes: 7,
            body: `Science fiction asks "what if?" and then follows the answer. What if we could travel through space, build artificial people, or meet beings from another world? Rather than predicting the future, the best science fiction uses the imagined setting to examine real questions about power, technology and what it means to be human.

The genre is as old as cinema. Georges Méliès made A Trip to the Moon (1902) with painted sets and trick photography. Fritz Lang's Metropolis (1927) imagined a city divided between workers and owners. In the 1950s, Cold War fears of nuclear weapons and invasion fueled a wave of alien and monster pictures. The Day the Earth Stood Still (1951, directed by Robert Wise) was unusual because its alien visitor arrives to warn humanity against nuclear war.

The late 1960s and 1970s brought ambitious and popular work: 2001: A Space Odyssey (1968, directed by Stanley Kubrick), Planet of the Apes (1968), Star Wars (1977) and Alien (1979). Blade Runner (1982) asked whether manufactured beings deserve compassion. The Matrix (1999) and Arrival (2016) continued the tradition with ideas about reality and language.

Common conventions include futuristic technology, space travel, aliens, robots, time travel and dystopia, a society that has gone terribly wrong. Science fiction and fantasy are often shelved together, but the usual distinction is that science fiction presents its wonders as possible through science, while fantasy relies on magic.

How to watch: identify the one big change the film makes to our world, and look at who benefits from it.`,
          },
          {
            id: L05,
            title: 'The Musical: When Characters Sing',
            blurb: 'In musicals, song and dance carry emotion and story when speech is not enough.',
            minutes: 7,
            body: `A musical is a film in which characters break into song and dance as part of the story. The convention can seem strange at first, but it works by treating music as the language of feeling: when an emotion is too big for talk, the characters sing.

Sound film made the genre possible. The Jazz Singer (1927) is famous as the feature that brought synchronized song to audiences. The early 1930s saw backstage musicals such as 42nd Street (1933), with spectacular dance numbers staged by Busby Berkeley. At RKO, Fred Astaire and Ginger Rogers danced in films such as Top Hat (1935). The Wizard of Oz (1939) showed how song could move a fantasy forward.

MGM became the home of the classic era. Singin' in the Rain (1952), co-directed by Gene Kelly and Stanley Donen, is set during the awkward move from silent to sound film and is often named among the greatest musicals. On Broadway, Oklahoma! (1943) pioneered the integrated musical, where songs advance the plot instead of pausing it, and film followed with West Side Story (1961) and The Sound of Music (1965). Cabaret (1972) set songs inside a nightclub to comment on the rise of Nazism. After a quiet period, Chicago (2002) and La La Land (2016) renewed interest.

Musicals exist worldwide; Indian cinema, covered later in this course, is built around song.

How to watch: ask what each number does that dialogue could not, and whether the song moves the story or stops it.`,
          },
        ],
      },
      {
        id: 'film-genres.t2',
        title: 'Love, Loss, War and Crime',
        blurb: 'Genres built around romance, emotion, conflict and lawbreaking, and the social contexts that shaped them.',
        level: 'FOUNDATION',
        lessons: [
          {
            id: L06,
            title: 'Screwball and Romantic Comedy',
            blurb: 'Fast talk, mismatched couples and class jokes made screwball comedy a Depression-era favorite that shaped modern romantic comedy.',
            minutes: 7,
            body: `Screwball comedy flourished in Hollywood in the 1930s and early 1940s, during the Great Depression. Its hallmarks are rapid, overlapping dialogue, a battle of the sexes between two sharp-tongued leads, wealthy characters made ridiculous, and plots that spiral into chaos before the couple finally admits they belong together.

It Happened One Night (1934, directed by Frank Capra) is the model: a runaway heiress (Claudette Colbert) and an out-of-work reporter (Clark Gable) travel together and slowly fall in love. It won the top five Academy Awards. Bringing Up Baby (1938, directed by Howard Hawks) stars Katharine Hepburn and Cary Grant in a tale involving a pet leopard; it was not a hit at first but is now admired. Hawks's His Girl Friday (1940) is famed for dialogue so fast that characters constantly interrupt each other. The Philadelphia Story (1940, directed by George Cukor) and Preston Sturges's The Lady Eve (1941) are also standard examples.

Because the Production Code was enforced from 1934, filmmakers could not show much physical romance. Wit, innuendo and sparring stood in for desire, which many critics think made the romance sharper.

The tradition continues in later romantic comedies such as Annie Hall (1977, directed by Woody Allen), When Harry Met Sally (1989) and Crazy Rich Asians (2018). Conventions remain: a meet-cute, obstacles, a misunderstanding and a reunion. Note that classic examples mostly center on wealthy, white characters, and recent films have widened the lens.

How to watch: listen for who controls the talk.`,
          },
          {
            id: L07,
            title: 'Melodrama: Emotion Turned Up',
            blurb: 'Melodrama uses heightened emotion, music and style to dramatize love, family and social pressure.',
            minutes: 7,
            body: `Melodrama is sometimes used as an insult for overdone emotion, but film scholars treat it as a serious mode with a long history. The word comes from nineteenth-century stage shows that combined drama with music, and film inherited its focus on suffering, sacrifice, family and the pressure society puts on feelings.

In the 1930s to 1950s Hollywood made many "women's pictures," melodramas aimed at female audiences and centered on women's choices, such as Stella Dallas (1937), about a mother who sacrifices her place in her daughter's life. The style also tells the story: swelling music, vivid color and carefully arranged rooms make feelings visible.

The German-born director Douglas Sirk is the key name. In All That Heaven Allows (1955) a wealthy widow, played by Jane Wyman, falls in love with a younger gardener, played by Rock Hudson, and her friends and children disapprove. The film is about class, gossip and conformity, and Sirk uses mirrors, windows and color to show how trapped the heroine feels. Imitation of Life (1959) explores race and identity in America. Critics once dismissed such films, then reclaimed them in the 1970s.

Later filmmakers paid tribute: Rainer Werner Fassbinder's Ali: Fear Eats the Soul (1974) and Todd Haynes's Far from Heaven (2002). Melodrama thrives elsewhere too, in Mexican, Indian and Japanese cinema.

How to watch: when a scene feels exaggerated, ask what the exaggeration reveals about what the character is not allowed to say.`,
          },
          {
            id: L08,
            title: 'The War Film',
            blurb: 'War films range from recruitment-friendly adventure to harrowing anti-war statements, and the same film can be read both ways.',
            minutes: 7,
            body: `War films depict combat and its effects on soldiers and civilians. They are among the most politically charged genres, since a film about a war is always also a message about that war, its enemies and its costs.

Early landmarks came after World War I. All Quiet on the Western Front (1930, directed by Lewis Milestone), based on Erich Maria Remarque's novel about German schoolboys turned soldiers, showed war as waste. Jean Renoir's Grand Illusion (1937) focused on prisoners and the human ties that cross national lines. During World War II, many films also served as propaganda, including Frank Capra's Why We Fight documentary series, made for the U.S. military.

After the war the genre split. Paths of Glory (1957, directed by Stanley Kubrick) condemns military leaders who sacrifice their own men. The Vietnam War produced Apocalypse Now (1979), Platoon (1986) and Full Metal Jacket (1987), bitter and morally complex. Saving Private Ryan (1998) is known for a realistic landing sequence. Das Boot (1981) is a German submarine film, and Come and See (1985, directed by Elem Klimov) is a harrowing Soviet drama about the war's effect on a young boy.

A recurring debate asks whether any war film can truly be anti-war, since exciting action can make combat look thrilling. Looking at point of view helps: who is shown suffering, and who is only a target?

How to watch: ask whose war this is, who is missing from it, and whether the film wants you to feel pride, grief or both.`,
          },
          {
            id: L09,
            title: 'Crime and Gangster Films',
            blurb: 'Gangster films follow criminals on a rise-and-fall arc that doubles as a critique of the American dream.',
            minutes: 7,
            body: `Crime films cover a large territory: gangsters, heists, police stories and criminals on the run. They let audiences enjoy lawbreaking from a safe distance while asking what drives people to it.

The gangster film took shape in the early sound era, partly in response to real headlines about Prohibition-era organized crime. Little Caesar (1931), The Public Enemy (1931) and Scarface (1932, directed by Howard Hawks) set the template of the rise-and-fall: a poor, ambitious man climbs through violence, gains money and power, and then is destroyed. In Little Caesar, Edward G. Robinson plays a small-time hood who becomes a boss and then falls. The Production Code required the ending to punish crime, but the films also gave audiences a charismatic outsider, and critics read the genre as a dark parody of the American dream.

Later highlights include the heist film, in which a team plans and carries out a robbery. The Asphalt Jungle (1950) and Rififi (1955, directed by Jules Dassin) are classics. Bonnie and Clyde (1967) brought stylish violence to a new generation. The Godfather (1972) gave the genre epic scale, and Goodfellas (1990, directed by Martin Scorsese) offered a street-level view. Reservoir Dogs (1992) and Infernal Affairs (2002) added new twists, and City of God (2002) showed crime in a Brazilian slum.

How to watch: track how the film makes crime attractive, and whether it lets you see the victims.`,
          },
          {
            id: L10,
            title: 'The Thriller: Suspense Machines',
            blurb: 'Thrillers keep audiences tense by controlling what we know, and they borrow settings from politics, crime and psychology.',
            minutes: 7,
            body: `A thriller is built to create excitement, tension and anxiety. Unlike horror, which often pushes toward the supernatural or grotesque, the thriller usually stays in a recognizable world where ordinary people are put in danger.

Its key tool is suspense, which Alfred Hitchcock described as different from surprise. In surprise, a shock comes without warning. In suspense, the audience knows or fears something that the characters do not, and waiting becomes the pleasure. Rear Window (1954) shows how this works: a photographer with a broken leg is confined to his apartment and watches neighbors across the courtyard. We see only what he sees, so any mystery is bound to his limited view, and our unease grows with his.

Thrillers have many subtypes. Psychological thrillers dig into minds, as in Gaslight (1944). Political thrillers deal with conspiracies and state power: Z (1969, directed by Costa-Gavras) and All the President's Men (1976). The Conversation (1974, directed by Francis Ford Coppola) follows a surveillance expert who grows paranoid. The Silence of the Lambs (1991, directed by Jonathan Demme) and Se7en (1995) blend crime and horror. Parasite (2019) shows how thrillers can mix comedy and class commentary.

Fritz Lang's M (1931), an early sound thriller, followed a city's hunt for a child murderer.

How to watch: ask what information the film is withholding from you, and what it is giving you that the characters lack.`,
          },
        ],
      },
      {
        id: 'film-genres.t3',
        title: 'Worlds of Imagination, Laughter and Fact',
        blurb: 'Fantasy, animation, documentary and comedy, and the studio system that organized Hollywood genres.',
        level: 'INTERMEDIATE',
        lessons: [
          {
            id: L11,
            title: 'Fantasy and Adventure',
            blurb: 'Adventure and fantasy send heroes on quests through other worlds, and their old conventions invite new critique.',
            minutes: 7,
            body: `Adventure films follow heroes through danger toward a goal, usually with swordplay, chases or exploration. Fantasy adds an element of the impossible: magic, mythical creatures and invented worlds that follow their own rules. The two overlap constantly, and both rely on the quest, a journey in which a hero is tested and changes.

Early examples include Douglas Fairbanks in The Thief of Bagdad (1924), an acrobatic fantasy that used spectacular sets and effects. The Adventures of Robin Hood (1938), starring Errol Flynn and filmed in Technicolor, set the standard for swashbuckling. The Wizard of Oz (1939) mixed fantasy with musical. In the 1960s, Ray Harryhausen's stop-motion creatures brought myth alive in Jason and the Argonauts (1963).

Raiders of the Lost Ark (1981, directed by Steven Spielberg) deliberately recalled the cliffhanger serials of earlier decades. Peter Jackson's The Lord of the Rings trilogy (2001 to 2003) adapted J. R. R. Tolkien's novels using enormous sets and digital effects. Guillermo del Toro's Pan's Labyrinth (2006) set a fairy tale inside the aftermath of the Spanish Civil War, showing that fantasy can address history. The Princess Bride (1987) playfully mocked and loved the conventions at once.

Critics note that classic adventure often presented non-Western peoples as exotic backdrops and gave the hero an imperial point of view. Contemporary filmmakers revisit these habits.

How to watch: map the quest, then ask whose perspective the adventure takes for granted.`,
          },
          {
            id: L12,
            title: 'Animation: A Medium, Not Just a Genre',
            blurb: 'Animation is a technique that carries every genre, from fairy tale to political memoir.',
            minutes: 7,
            body: `Animation is often grouped with genres, but it is really a method of making films: creating the illusion of movement by photographing drawings, models or computer images one frame at a time. Within that method you can tell any kind of story, which is why the best animated work ranges from comedy to tragedy to documentary.

Winsor McCay's Gertie the Dinosaur (1914) showed an early drawn character with personality. Lotte Reiniger's The Adventures of Prince Achmed (1926) used cut-out silhouettes and is among the oldest surviving animated features. Snow White and the Seven Dwarfs (1937) was a landmark for Disney, the first full-length cel-animated feature produced in the United States. Warner Bros. shorts brought the Looney Tunes characters, fast and irreverent.

Computers changed everything with Toy Story (1995), made by Pixar, the first feature film to be entirely computer-animated. Stop-motion, which animates physical models, continues in Coraline (2009). Hayao Miyazaki's Spirited Away (2001), from Studio Ghibli, won the Academy Award for Best Animated Feature in 2003. Persepolis (2007) used simple black and white drawings to tell a memoir about Iran, and Spider-Man: Into the Spider-Verse (2018) mixed comic book looks with new techniques.

A common misunderstanding is that animation is only for children. Anime, Japan's animation tradition, regularly addresses adult themes; we return to it in the Japanese cinema lesson.

How to watch: ask what the film can do in animation that live action could not, and what choices of style say about its theme.`,
          },
          {
            id: L13,
            title: 'Documentary Modes',
            blurb: 'Documentaries claim to show reality, but every approach shapes what we see through choices of subject, structure and voice.',
            minutes: 8,
            body: `A documentary is a nonfiction film, but that definition hides a puzzle: every film is made through choices of what to film, what to cut and what to tell us. In the 1920s the Scottish filmmaker John Grierson used the word documentary and described it as the creative treatment of actuality, a phrase that stresses both reality and craft.

Nanook of the North (1922, directed by Robert Flaherty) followed an Inuit family and was a huge success, yet it is well known that Flaherty staged parts of it and asked participants to use older methods. Dziga Vertov's Man with a Movie Camera (1929) used rapid editing to celebrate city life and show the camera itself. Triumph of the Will (1935, directed by Leni Riefenstahl) is a documentary-style film made for the Nazi party, a powerful example of nonfiction as propaganda. Night and Fog (1956, directed by Alain Resnais) confronted the Nazi camps.

In the 1960s, lighter cameras produced direct cinema and cinéma vérité, observing life with little interference. The scholar Bill Nichols proposed describing documentaries in modes, commonly called poetic (mood and form), expository (a voice explains), observational (the camera watches), participatory (the filmmaker takes part), reflexive (the film shows how it is made) and performative. Errol Morris's The Thin Blue Line (1988) used reenactments to question a murder conviction, while Michael Moore's Bowling for Columbine (2002) is openly opinionated.

How to watch: ask who made this, what is outside the frame, and how the film earns your trust.`,
          },
          {
            id: L14,
            title: 'Silent Comedy: Bodies in Motion',
            blurb: 'Silent comedians built a universal language from timing, gags and physical daring.',
            minutes: 7,
            body: `Silent comedy needed no spoken language, so it traveled the world. Its basic unit is the gag: a clear setup and a surprising payoff, built from objects, timing and the human body. Early studios such as Mack Sennett's Keystone favored slapstick, with pratfalls, pies and chases, and three performers rose to be its great artists.

Charlie Chaplin debuted his Little Tramp character in 1914. With his bowler hat, cane and shabby dignity, the Tramp mixed comedy with pathos, a combination seen in The Kid (1921), The Gold Rush (1925), City Lights (1931) and Modern Times (1936), which also commented on machines and work. Chaplin also directed and wrote his films, an unusually broad creative control.

Buster Keaton became famous for his stone face and for dangerous, precisely designed stunts. Sherlock Jr. (1924) plays with the idea of stepping into a movie, and The General (1926) turns a Civil War train chase into a comic and technical triumph. Harold Lloyd, an everyman in round glasses, is remembered for Safety Last! (1923), where he hangs from a clock high above a city street.

Silent comedians also shaped later cinema: their influence is traced in action comedies and animated slapstick. Sound arrived in the late 1920s and changed the economics; some silent stars adapted and others did not.

How to watch: look for the setup before the joke, and notice how the whole body, camera position and set work together.`,
          },
          {
            id: L15,
            title: 'Hollywood Golden Age: Studios, Stars and Genre Factories',
            blurb: 'The studio system worked like a factory that made genre films, stars and a shared house style.',
            minutes: 8,
            body: `Genres in classic Hollywood were not just creative choices; they were products of an industrial system. From roughly the 1920s to the late 1940s, a few big studios controlled production, distribution and many theaters, an arrangement called vertical integration. The major studios were Paramount, Loew's/MGM, Warner Bros., 20th Century Fox and RKO, with Universal, Columbia and United Artists as smaller players.

Studios kept actors, directors and writers under long-term contracts and developed a house style. MGM was known for polished musicals, Warner Bros. for gritty gangster films and social dramas, and Universal for monsters. Genre helped studios plan: a proven formula with a familiar star reduced risk, and audiences could rely on a type of experience.

Casablanca (1942, directed by Michael Curtiz, from Warner Bros.) shows how well the system could work. It blends romance, war drama and intrigue, with a cast of contract players and technicians working within a polished house style, and it is still widely loved.

The Production Code, adopted in 1930 and enforced strongly from 1934 under Joseph Breen, governed what could appear on screen, pushing studios toward indirect and coded storytelling. In 1948, the Supreme Court decided United States v. Paramount Pictures, which led the studios to separate their theaters from production. Combined with the rise of television, the old system declined.

How to watch: look at a film's credits and ask how the studio's style and its stars shaped what you are seeing.`,
          },
        ],
      },
      {
        id: 'film-genres.t4',
        title: 'Cinemas Beyond Hollywood',
        blurb: 'Postwar movements and national film cultures that remade or ignored Hollywood genre rules.',
        level: 'INTERMEDIATE',
        lessons: [
          {
            id: L16,
            title: 'Neorealism and the New Wave: Breaking Genre Habits',
            blurb: 'Italian neorealism and the French New Wave rejected polished studio genre in favor of streets, ordinary people and playful homage.',
            minutes: 8,
            body: `This lesson looks at two postwar movements through one question: how did they treat genre? Their chronology is covered in the film-history course, so we focus on their stance toward the studio formulas of the Golden Age.

Italian neorealism emerged as Italy rebuilt after World War II. Roberto Rossellini's Rome, Open City (1945) and Vittorio De Sica's Bicycle Thieves (1948) shot in real locations, often used non-professional actors and followed ordinary people struggling with poverty and unemployment. Instead of glamorous stars and tidy plots, they offered open endings and moral questions. In effect they replaced the studio genre with a kind of everyday realism, and their influence spread worldwide.

The French New Wave of the late 1950s and 1960s came from young critics at the magazine Cahiers du Cinema who wrote that they loved American genre films but hated stiff, literary French cinema. Francois Truffaut's The 400 Blows (1959) was a personal story about a boy, while Jean-Luc Godard's Breathless (1960) borrowed the shape of an American gangster film and then broke it up with jump cuts and casual self-awareness. The critics promoted the idea of the director as an author, or auteur.

Notice the difference: neorealism mostly rejected genre for realism, while the New Wave embraced genre as material to remix. Both showed that genre rules could be bent, and later directors learned from each.

How to watch: look for what the film refuses to do that a studio picture would.`,
          },
          {
            id: L17,
            title: 'Japanese Cinema: Ozu, Kurosawa and Anime',
            blurb: 'Japan split its cinema into period and contemporary films, and its genres traveled globally through Kurosawa, kaiju and anime.',
            minutes: 8,
            body: `Japanese film has long distinguished between jidaigeki, period dramas often set in the age of the samurai, and gendaigeki, stories set in the present. This lesson looks at three tracks of the tradition.

Yasujiro Ozu worked mostly in the gendaigeki, with quiet family dramas such as Tokyo Story (1953), about aging parents visiting their grown children and finding them busy. His camera is often placed low and still, and he uses short shots of empty rooms or landscapes between scenes. The effect is calm, observant and deeply moving.

Akira Kurosawa excelled in the jidaigeki. Rashomon (1950) tells one event from several conflicting perspectives, and Seven Samurai (1954) follows hired warriors defending a village. The cross-pollination with the Western is a famous case of genre exchange: Seven Samurai inspired The Magnificent Seven (1960), and Yojimbo (1961) was reworked by Sergio Leone as A Fistful of Dollars (1964). Kenji Mizoguchi's Ugetsu (1953) is a haunting ghost story.

Godzilla (1954, directed by Ishiro Honda) launched the kaiju, or giant monster, genre, and is widely read as expressing anxiety about nuclear weapons. In animation, Osamu Tezuka's Astro Boy television series (1963) helped shape anime. Akira (1988, directed by Katsuhiro Otomo) and Studio Ghibli's films, founded in 1985, brought it global attention.

How to watch Ozu: slow down and look at how the arrangement of a room expresses relationships.`,
          },
          {
            id: L18,
            title: 'Indian Cinema: Bollywood and Parallel Cinema',
            blurb: 'India makes films in many languages; mainstream masala musicals and the parallel cinema movement offer very different pleasures.',
            minutes: 8,
            body: `India has one of the largest film industries in the world, producing films in many languages. The Hindi-language industry based in Mumbai (formerly Bombay) is called Bollywood, but it is only one part: there are also major industries in Tamil, Telugu, Malayalam, Bengali and other languages.

Dadasaheb Phalke's Raja Harishchandra (1913) is widely recognized as the first Indian feature, and Alam Ara (1931) as the first Indian sound film. Sound brought song, and song never left. Mainstream Hindi cinema typically uses the masala format, named for a spice mixture, combining romance, action, comedy, melodrama and music in a single long film, often with an interval. Songs are usually sung by playback singers, whose voices are dubbed over actors who mime. Examples include Awaara (1951, directed by Raj Kapoor), Mother India (1957, directed by Mehboob Khan), Sholay (1975), sometimes called a curry Western because it blends Western conventions with Indian masala, and Dilwale Dulhania Le Jayenge (1995).

Parallel cinema, from the 1950s onward, offered realistic and politically aware alternatives. Satyajit Ray's Pather Panchali (1955), a Bengali film, began the Apu trilogy. Ritwik Ghatak, Mrinal Sen and Shyam Benegal's Ankur (1974) are also associated with it. More recently, S. S. Rajamouli's RRR (2022), a Telugu film, found a worldwide audience.

How to watch: treat song sequences as storytelling and emotional moments, not interruptions.`,
          },
          {
            id: L19,
            title: 'Hong Kong Action: Swords, Fists and Guns',
            blurb: 'Hong Kong turned martial arts, swordplay and gunfights into a fast, physical and stylish cinema.',
            minutes: 8,
            body: `Hong Kong cinema developed a distinctive action tradition that shaped filmmaking worldwide. It grew from several streams, beginning with wuxia, stories of chivalrous swordfighters in a legendary China, and kung fu films, centered on martial arts.

The Shaw Brothers studio, led by Run Run Shaw, produced many period action films. King Hu's A Touch of Zen (1971) gave the wuxia genre an artistic ambition and was honored at Cannes. In the 1970s Bruce Lee became an international star with Fist of Fury (1972) and Enter the Dragon (1973), the latter a Hong Kong and American co-production. He brought attention to Chinese martial arts and made Asian heroes into global action leads.

Jackie Chan fused kung fu with comic stunts in Drunken Master (1978) and Police Story (1985), often performing dangerous feats himself; critics compare his work to silent comedians like Keaton. In the 1980s, John Woo and Tsui Hark helped create heroic bloodshed, in films such as A Better Tomorrow (1986) and The Killer (1989), featuring stylish gunfights and loyal, tragic gangsters. Hard Boiled (1992) followed.

These styles later spread. The action choreographer Yuen Woo-ping worked on The Matrix (1999), and Ang Lee's Crouching Tiger, Hidden Dragon (2000) revived wuxia for Western audiences. Infernal Affairs (2002) was remade by Martin Scorsese as The Departed (2006).

How to watch: study the choreography, and note how editing and movement tell character.`,
          },
        ],
      },
      {
        id: 'film-genres.t5',
        title: 'Global Industries and the Modern Marketplace',
        blurb: 'African and Latin American cinemas, then the economic forces that reshaped genre in recent decades.',
        level: 'ADVANCED',
        lessons: [
          {
            id: L20,
            title: 'Nollywood and African Cinema',
            blurb: 'African filmmaking includes both auteur cinema from Senegal and Mali and the high-volume video industry of Nigeria.',
            minutes: 8,
            body: `African cinema is not a single tradition. This lesson contrasts two very different models: an auteur cinema created under colonial and postcolonial conditions, and a high-volume popular industry driven by cheap technology.

Ousmane Sembene of Senegal is often called the father of African cinema. His Black Girl (1966) is often described as one of the first major feature films by a sub-Saharan African director, and Xala (1975) satirized the postcolonial elite. Djibril Diop Mambety's Touki Bouki (1973) was a bold, experimental Senegalese film, and Souleymane Cisse's Yeelen (1987), from Mali, drew on traditional belief. The festival FESPACO in Ouagadougou, Burkina Faso, which began in 1969, became a central showcase for African filmmaking.

Nollywood is the name given to Nigeria's film industry, centered on Lagos and also in several languages. Its modern boom is commonly traced to Living in Bondage (1992), produced by Kenneth Nnebue and sold on video. Rather than waiting for scarce cinemas, producers shot quickly on video and sold copies directly to viewers. The result is a very high output of films, covering melodrama, comedy, religion, crime and romance, though the origin of the name is debated.

More recently, filmmakers have moved to polished cinema releases and streaming, as with Lionheart (2018), directed by and starring Genevieve Nnaji, which Netflix acquired.

How to watch: consider how production conditions shape style, and whose stories are being told.`,
          },
          {
            id: L21,
            title: 'Latin American Cinema: Melodrama, Revolution and Realism',
            blurb: 'Latin American filmmakers moved between studio melodrama, political manifestos and contemporary social realism.',
            minutes: 8,
            body: `Latin American cinema covers many countries with different histories, but there are shared themes: inequality, politics, migration and identity. This lesson follows three broad phases.

In Mexico, the 1930s to 1950s are called a golden age, with a studio system producing ranchera comedies, melodramas and comedies starring figures like Cantinflas. Emilio Fernandez directed Maria Candelaria (1944), which won a major prize at Cannes in 1946. The Spanish exile Luis Bunuel worked in Mexico and made Los olvidados (1950), a stark portrait of poor children in Mexico City.

In the 1960s, political upheaval inspired new thinking. In Brazil, Cinema Novo directors, led by Glauber Rocha, wrote about an aesthetic of hunger, arguing that poverty could shape a powerful, raw style, and made Black God, White Devil (1964). In Argentina, Fernando Solanas and Octavio Getino made The Hour of the Furnaces (1968) and argued for a Third Cinema, outside both Hollywood and elite art cinema. In Cuba, after the revolution, a national film institute was created in 1959, and Tomas Gutierrez Alea directed Memories of Underdevelopment (1968).

Since the 1990s, a new wave reached international audiences: Central Station (1998), Amores perros (2000), Y tu mama tambien (2001), City of God (2002) and Roma (2018). Argentina's The Official Story (1985) won the Academy Award for foreign-language film.

How to watch: ask how each film connects personal drama with national history.`,
          },
          {
            id: L22,
            title: 'New Hollywood and the Blockbuster: Genre Remade',
            blurb: 'In the late 1960s and 1970s genres were revised for adult audiences, then the blockbuster turned genre into a franchise business.',
            minutes: 8,
            body: `Chronology and biography are covered in the film-history course, so here we ask what happened to genres. By the late 1960s the old studio system was weaker, the Production Code had given way to a ratings system in 1968, and a younger generation of directors had more freedom.

Their typical move was revision: keep a genre's shape but question its values. McCabe and Mrs. Miller (1971) and Little Big Man (1970) revised the Western. Chinatown (1974) revived noir with a bleak ending. Bonnie and Clyde (1967) and Taxi Driver (1976) reworked crime stories with violence and moral ambiguity. Easy Rider (1969) and The Graduate (1967) captured a restless youth culture, and the Vietnam War and Watergate shaped a mood of distrust.

Then came the blockbuster. Jaws (1975) opened in hundreds of theaters at once with heavy television advertising, and Star Wars (1977) followed with spectacular effects and a merchandising bonanza. Studios began to favor high-concept films, easily explained in a sentence and marketable around the world, and franchises with sequels and toys. The Marvel Cinematic Universe, which began with Iron Man (2008), took this approach to interconnected stories across many films.

Critics argue about the tradeoffs: blockbusters can be inventive and communal, but they also crowd out mid-budget dramas and make risk less attractive.

How to watch: ask whether a film is revising a genre or simply repeating its formula.`,
          },
          {
            id: L23,
            title: 'Independent Cinema: Defining the Outsider',
            blurb: 'Independent film is hard to define, since it can mean funding, distribution or attitude, and the category has been repeatedly absorbed by larger companies.',
            minutes: 8,
            body: `What does independent mean? It can describe who pays for a film, who distributes it, or the attitude and style of the work. The definitions overlap and are debated, which is why careful critics often say what they mean when using the term. Independent films are not a genre, but they often provide a place for genre experimentation.

Earlier models included John Cassavetes, whose Shadows (1959) was made outside the studios and used improvised acting. Roger Corman produced low-budget genre films that trained many later directors. Spike Lee's She's Gotta Have It (1986) was a notable low-budget success. The Sundance Institute, founded by Robert Redford, became associated with a festival that grew into the main U.S. showcase.

Steven Soderbergh's sex, lies, and videotape (1989) won the top prize at Cannes and helped launch a boom. Miramax marketed films like Pulp Fiction (1994, directed by Quentin Tarantino), which also won the Palme d'Or, and Kevin Smith's Clerks (1994), made very cheaply. The Blair Witch Project (1999) used a small budget and found footage style to become a phenomenon.

Success created a complication: major studios created their own specialty divisions, and the category blurred. The company A24, founded in 2012, built a brand around distinctive films. Moonlight (2016, directed by Barry Jenkins) won Best Picture, and Everything Everywhere All at Once (2022) won it for 2023.

How to watch: ask what limits shaped the film's choices, and whether those limits became strengths.`,
          },
          {
            id: L24,
            title: 'The Streaming Era: Genre in the Age of the Algorithm',
            blurb: 'Streaming changes how films are financed, discovered and categorized, raising new questions about theaters, taste and global audiences.',
            minutes: 8,
            body: `Streaming means films and series are delivered over the internet to a screen of the viewer's choosing. Netflix, which began renting DVDs by mail in 1998, started streaming in 2007 and released its first major original series, House of Cards, in 2013. Other studios and technology companies followed with their own services.

Several changes matter for genre. First, distribution: films can reach many countries at once, and subtitles and dubbing are part of the experience. Parasite (2019, directed by Bong Joon-ho) became the first non-English-language film to win Best Picture, and the South Korean series Squid Game (2021, created by Hwang Dong-hyuk) became a global hit on Netflix, showing how a local story with genre elements of survival and thriller can travel.

Second, discovery. Recommendation systems suggest titles based on viewing patterns, which can create very narrow categories, far more specific than traditional genre labels, and may favor familiar formulas. Third, form: the boundary between a film and a series has softened, with long, binge-friendly storytelling and shorter theatrical windows. The COVID-19 pandemic in 2020 accelerated the shift. Roma (2018, directed by Alfonso Cuaron), released by Netflix, prompted debate about whether a streamed film should compete for the same awards as theatrical releases.

Supporters point to wider access and money for varied voices. Critics worry about fewer theatrical experiences, data-driven decision-making and a loss of shared cultural moments.

How to watch: notice how a service recommends titles, and ask whether it widens your taste or narrows it.`,
          },
        ],
      },
    ],
  },
  bank: {
    curriculumId: 'film-genres',
    questions: [
      // L01
      tf(L01, 1, 1, 'A genre is a family of films that share recognizable conventions, such as settings, character types and story shapes.', 0, 'Think about why audiences know what to expect.', 'Shared conventions are exactly what let viewers recognize and anticipate a genre.'),
      mc(L01, 2, 1, 'Which setting is most typical of the Western?', ['The American West after the Civil War', 'A space station in the far future', 'A haunted house in modern Europe', 'A medieval castle'], 'Think of horses, saloons and railroads.', 'Westerns are set mostly in the American West in the decades after the Civil War.'),
      mc(L01, 3, 2, 'Which tension is described as running underneath many Westerns?', ['Wilderness versus civilization', 'Robots versus humans', 'Science versus magic', 'Silence versus sound'], 'It concerns the frontier and the towns being built on it.', 'The wilderness-versus-civilization tension recurs throughout the genre.'),
      mc(L01, 4, 2, 'Which film directed by John Ford used Monument Valley and sent strangers across dangerous territory?', ['Stagecoach (1939)', 'A Fistful of Dollars (1964)', 'Once Upon a Time in the West (1968)', 'The Great Train Robbery (1903)'], 'It has a vehicle in its title.', 'Ford directed Stagecoach in 1939 and helped make Monument Valley a signature of the genre.'),
      tf(L01, 5, 3, 'The lesson says classic Westerns usually told the story fairly from the Native American point of view.', 1, 'Consider the genre\'s flaw described in the lesson.', 'Classic Westerns often reduced Native Americans to stereotypes or villains and told history from the settlers\' side.'),
      // L02
      mc(L02, 1, 1, 'What does the French term film noir mean?', ['Black film', 'Night patrol', 'Shadow love', 'Hidden city'], 'Noir is the French word for a color.', 'Film noir literally means black film.'),
      tf(L02, 2, 2, 'Filmmakers of the 1940s generally called their own work film noir at the time.', 1, 'Who applied the label, and when?', 'French critics applied the label after the fact, which is why noir is still debated as a genre, style or mood.'),
      mc(L02, 3, 1, 'Which visual feature is typical of film noir?', ['Low-key lighting with hard shadows', 'Bright, even daylight', 'Animated backgrounds', 'Pastel color schemes'], 'Think of window blinds at night.', 'Noir uses low-key lighting that throws hard, striped shadows.'),
      mc(L02, 4, 2, 'Which two influences are named as roots of noir?', ['German Expressionism and hard-boiled fiction', 'Italian opera and silent slapstick', 'French New Wave and anime', 'Musicals and Westerns'], 'One is a film movement, the other a type of crime writing.', 'Noir drew on German Expressionist filmmakers who moved to Hollywood and on writers like Hammett, Chandler and Cain.'),
      mc(L02, 5, 3, 'In Double Indemnity, how does the narration affect the audience\'s experience?', ['It shows from the start that the plan will go wrong', 'It hides who the killer is until the final scene', 'It replaces all dialogue', 'It turns the story into a comedy'], 'Consider what narration reveals early.', 'The voice-over lets us know from the beginning that the scheme ends badly, building doom rather than a whodunit.'),
      // L03
      tf(L03, 1, 1, 'Horror aims to provoke fear, dread or disgust.', 0, 'This is the basic definition.', 'Provoking fear, dread or disgust is the core purpose of the genre.'),
      mc(L03, 2, 1, 'Which film is a German silent vampire classic directed by F. W. Murnau?', ['Nosferatu (1922)', 'Halloween (1978)', 'Get Out (2017)', 'The Exorcist (1973)'], 'It is the oldest title in the list.', 'Nosferatu was released in 1922 and directed by F. W. Murnau.'),
      mc(L03, 3, 2, 'What convention did Psycho (1960) break?', ['It killed its apparent heroine early in the film', 'It was filmed entirely in color on an expensive budget with major stars', 'It used no musical score at all, relying on silence', 'It featured a talking monster that narrated the plot'], 'Think about who the audience expects to survive.', 'Psycho shocked viewers by killing the apparent main character early.'),
      mc(L03, 4, 2, 'Which term did the scholar Carol Clover introduce for the last survivor of many slashers?', ['Final girl', 'Last stand', 'Lone hero', 'Scream queen'], 'It describes a person, not an action.', 'Clover introduced the term final girl in a 1987 article.'),
      tf(L03, 5, 3, 'The lesson says any single horror film can be read in only one way, as a mirror of one anxiety.', 1, 'Look at the careful wording of the first paragraph.', 'The lesson says many theorists see horror as a mirror, but a single film can be read several ways.'),
      // L04
      mc(L04, 1, 1, 'What question is the heart of science fiction?', ['What if?', 'Who did it?', 'Where is the treasure?', 'Who sings next?'], 'It asks us to imagine a change.', 'Science fiction asks "what if?" and follows the answer.'),
      mc(L04, 2, 1, 'Who made A Trip to the Moon (1902)?', ['Georges Melies', 'Fritz Lang', 'Robert Wise', 'Stanley Kubrick'], 'He was a French pioneer of trick photography.', 'Melies made the 1902 film using painted sets and trick photography.'),
      mc(L04, 3, 2, 'What was unusual about the alien visitor in The Day the Earth Stood Still (1951)?', ['He arrived to warn humanity against nuclear war', 'He arrived to conquer Earth and enslave its cities', 'He was a mindless robot sent only to destroy cities', 'He was a comic character in a slapstick science fiction parody'], 'Consider the Cold War context.', 'Unlike many 1950s invasion films, this alien delivers a warning about nuclear weapons.'),
      mc(L04, 4, 2, 'How does the lesson usually distinguish science fiction from fantasy?', ['Science fiction presents wonders as possible through science; fantasy relies on magic', 'Science fiction is always set in space; fantasy never is', 'Fantasy is always animated', 'There is no difference at all'], 'Think about how the wonders are explained.', 'The usual distinction is whether the wonder is explained by science or by magic.'),
      tf(L04, 5, 3, 'The lesson says the best science fiction only predicts future events accurately.', 1, 'What does the genre really examine?', 'It says science fiction uses imagined settings to examine real questions rather than simply predict.'),
      // L05
      mc(L05, 1, 1, 'Why do characters in musicals break into song, according to the lesson?', ['Music acts as the language of feeling when talk is not enough', 'It is required by law', 'Because there is no dialogue allowed', 'To fill empty screen time'], 'Think about big emotions.', 'The lesson says that when an emotion is too big for talk, characters sing.'),
      tf(L05, 2, 1, 'Sound film made the film musical possible.', 0, 'Consider when synchronized song arrived.', 'The Jazz Singer (1927) and the early sound era launched the genre.'),
      mc(L05, 3, 2, 'Which film, co-directed by Gene Kelly and Stanley Donen, is set during the move from silent to sound?', ['Singin\' in the Rain (1952)', 'West Side Story (1961)', 'Cabaret (1972)', 'Meet Me in St. Louis (1944)'], 'It has weather in its title.', 'Singin\' in the Rain is set during that transition and is often named among the greatest musicals.'),
      mc(L05, 4, 3, 'What is an integrated musical?', ['One where songs advance the plot instead of pausing it', 'One with no dancing', 'One performed only on a stage', 'One that uses only instrumental music'], 'The word integrated means joined together.', 'In an integrated musical, as pioneered by Oklahoma! on Broadway, songs drive the story.'),
      mc(L05, 5, 2, 'Who staged the spectacular dance numbers of 42nd Street (1933)?', ['Busby Berkeley', 'Fred Astaire', 'Douglas Sirk', 'Frank Capra'], 'He is associated with backstage musicals.', 'Busby Berkeley staged the dance numbers of early-1930s backstage musicals.'),
      // L06
      mc(L06, 1, 1, 'Which feature best describes screwball comedy dialogue?', ['Rapid and overlapping', 'Slow and silent', 'Sung in verse', 'Written entirely in captions'], 'Think of His Girl Friday.', 'Screwball is known for fast, overlapping talk.'),
      tf(L06, 2, 1, 'Screwball comedy flourished in the 1930s and early 1940s, during the Great Depression.', 0, 'Check the decade given in the lesson.', 'The genre peaked in the Depression era.'),
      mc(L06, 3, 2, 'Who starred in It Happened One Night (1934)?', ['Claudette Colbert and Clark Gable', 'Katharine Hepburn and Cary Grant', 'Fred Astaire and Ginger Rogers', 'Humphrey Bogart and Ingrid Bergman'], 'One star plays a runaway heiress.', 'Colbert and Gable starred; the Hepburn and Grant pairing is Bringing Up Baby.'),
      mc(L06, 4, 3, 'Why did the Production Code, enforced from 1934, matter to screwball comedy?', ['Filmmakers used wit and innuendo instead of showing much physical romance', 'It required every comedy to be filmed without sound, using only intertitles and music', 'It banned spoken dialogue from every romantic film released by the major Hollywood studios', 'It ended romantic stories in Hollywood entirely and moved all love plots to foreign cinema'], 'Consider what could not be shown.', 'With limited physical romance allowed, sparring talk and innuendo stood in for desire.'),
      mc(L06, 5, 2, 'Which of these is a typical convention of romantic comedy mentioned in the lesson?', ['A meet-cute', 'A cliffhanger serial', 'A giant monster', 'A voice-over detective'], 'It describes how the couple first encounters each other.', 'The meet-cute, obstacles, misunderstanding and reunion are common conventions.'),
      // L07
      mc(L07, 1, 1, 'Where does the word melodrama come from?', ['Nineteenth-century stage shows combining drama with music', 'Italian cooking', 'Silent comedy', 'Documentary film'], 'Think of melody plus drama.', 'It comes from stage shows that combined drama with music.'),
      tf(L07, 2, 2, 'Film scholars treat melodrama only as an insult for overdone emotion.', 1, 'The lesson says it is also a serious mode.', 'Scholars regard melodrama as a serious mode with a long history.'),
      mc(L07, 3, 2, 'Which director is the key name for Hollywood melodrama in the 1950s?', ['Douglas Sirk', 'Buster Keaton', 'Alfred Hitchcock', 'Robert Flaherty'], 'He directed All That Heaven Allows.', 'Sirk is the central figure, with films like All That Heaven Allows and Imitation of Life.'),
      mc(L07, 4, 3, 'What is All That Heaven Allows (1955) chiefly about?', ['Class, gossip and conformity around a widow\'s love for a younger gardener', 'A heist at a Las Vegas casino planned and carried out by a crew of old army friends', 'A giant monster that rises from the sea and flattens a crowded harbor city overnight', 'A courtroom murder trial in which a young lawyer defends a falsely accused neighbor'], 'Consider the widow and her disapproving friends.', 'The film explores class, gossip and conformity.'),
      mc(L07, 5, 2, 'Which later filmmaker paid tribute to Sirk with Far from Heaven (2002)?', ['Todd Haynes', 'Kevin Smith', 'Peter Jackson', 'John Woo'], 'The title echoes the earlier film.', 'Todd Haynes made Far from Heaven in the tradition of Sirk.'),
      // L08
      tf(L08, 1, 1, 'A film about a war is also a message about that war.', 0, 'The lesson calls the genre politically charged.', 'War films are political because they frame the war, its enemies and its costs.'),
      mc(L08, 2, 2, 'All Quiet on the Western Front (1930) is based on a novel by whom?', ['Erich Maria Remarque', 'Lewis Milestone', 'Jean Renoir', 'Stefan Zweig and Thomas Mann'], 'The director is a different person.', 'Remarque wrote the novel; Lewis Milestone directed the film.'),
      mc(L08, 3, 2, 'What did Frank Capra\'s Why We Fight series show about World War II film?', ['Many films served as propaganda', 'No films were made', 'Only comedies were shot', 'Films were banned in the U.S.'], 'It was made for the U.S. military.', 'It is an example of wartime propaganda.'),
      mc(L08, 4, 3, 'What is the film Paths of Glory (1957) known for condemning?', ['Military leaders who sacrifice their own men', 'Poor weather conditions that delay major battle plans', 'Peacetime politicians who ignore the national budget', 'Silent cinema and its reliance on exaggerated acting'], 'Think about the generals.', 'It condemns leaders who sacrifice their soldiers.'),
      mc(L08, 5, 2, 'Which argument does the lesson raise about anti-war films?', ['Exciting action can make combat look thrilling even in an anti-war film', 'They are always boring', 'They are never made', 'They always show victory'], 'Think about what action does to audiences.', 'The debate is whether thrilling combat undermines an anti-war message.'),
      // L09
      mc(L09, 1, 1, 'Which story shape defines the classic gangster film?', ['Rise and fall', 'Mystery of the missing heir', 'Journey home', 'Love triangle'], 'The hero climbs, then drops.', 'The rise-and-fall arc is the template.'),
      tf(L09, 2, 2, 'Little Caesar (1931) stars Edward G. Robinson as a hood who becomes a boss and then falls.', 0, 'Recall the worked example.', 'Robinson plays the rising and falling gangster.'),
      mc(L09, 3, 2, 'Why did the gangster film\'s endings usually punish crime in the 1930s?', ['The Production Code required it', 'Audiences hated criminals', 'Studios had no criminals to film', 'Directors ignored the ending'], 'Think about the censorship system.', 'The Code required crime not to pay.'),
      mc(L09, 4, 2, 'What is a heist film?', ['A film in which a team plans and carries out a robbery', 'A film about a rival gang that starts a long street war over territory', 'A film about a ghost that haunts a family in an old country house', 'A film about a sports team that overcomes a long losing streak to win'], 'Think of The Asphalt Jungle.', 'Heist films center on planning and carrying out a robbery.'),
      mc(L09, 5, 3, 'Which film was remade by Martin Scorsese as The Departed (2006)?', ['Infernal Affairs (2002)', 'Rififi (1955)', 'Scarface (1932)', 'City of God (2002)'], 'It comes from Hong Kong.', 'The Departed is a remake of Infernal Affairs.'),
      // L10
      mc(L10, 1, 1, 'How is a thriller different from horror, according to the lesson?', ['It usually stays in a recognizable world with ordinary people in danger', 'It has no tension and never places any character in real danger during the story', 'It is always supernatural and set entirely in a haunted house or ruined castle', 'It is always comic and built entirely around jokes rather than danger or fear'], 'Think about the setting.', 'Thrillers usually stay in a recognizable world.'),
      mc(L10, 2, 2, 'In Hitchcock\'s description, what is suspense?', ['The audience knows or fears something the characters do not', 'A sudden shock with no warning', 'A happy ending', 'A joke at the start'], 'Compare it with surprise.', 'Suspense depends on what the audience knows ahead of the characters.'),
      tf(L10, 3, 2, 'Rear Window (1954) limits us to what a confined photographer can see.', 0, 'Remember the broken leg.', 'The story is tied to his limited view, which raises unease.'),
      mc(L10, 4, 2, 'Which film is given as an example of a political thriller?', ['All the President\'s Men (1976)', 'Gaslight (1944)', 'Toy Story (1995)', 'The Jazz Singer (1927)'], 'It deals with state power.', 'All the President\'s Men is cited as a political thriller.'),
      mc(L10, 5, 3, 'What does Parasite (2019) show, according to the lesson?', ['Thrillers can mix comedy and class commentary', 'Thrillers cannot include any humor or social comment at all', 'Thrillers must be filmed entirely without spoken dialogue', 'Thrillers are always set on spaceships in the distant future'], 'Think of genre blending.', 'It illustrates blending thriller, comedy and social commentary.'),
      // L11
      mc(L11, 1, 1, 'What is a quest?', ['A journey in which a hero is tested and changes', 'A song in a musical', 'A documentary interview', 'A silent gag'], 'Think of heroes traveling toward a goal.', 'A quest is a journey of testing and change.'),
      mc(L11, 2, 2, 'The Adventures of Robin Hood (1938) set the standard for what?', ['Swashbuckling', 'Stop-motion monsters', 'Silent slapstick', 'Documentary reenactment'], 'Think of Errol Flynn and swords.', 'The Technicolor film set the swashbuckling standard.'),
      tf(L11, 3, 2, 'Raiders of the Lost Ark (1981) deliberately recalled earlier cliffhanger serials.', 0, 'Remember its worked example.', 'It was a deliberate homage.'),
      mc(L11, 4, 2, 'Who created the stop-motion creatures in Jason and the Argonauts (1963)?', ['Ray Harryhausen', 'Peter Jackson', 'Guillermo del Toro', 'Tsui Hark'], 'His name is linked to mythical creatures.', 'Harryhausen\'s stop-motion work brought myth alive.'),
      mc(L11, 5, 3, 'Which critique do critics make of classic adventure films?', ['They often presented non-Western peoples as exotic backdrops from an imperial viewpoint', 'They relied on too few locations, filming nearly every scene inside one cramped studio set', 'They contained too little action, with long talky scenes and slow plotting throughout most reels', 'They were always unpopular with audiences and earned very little money at the box office'], 'Think about who the hero is and who the backdrop is.', 'Critics note imperial perspectives and exoticism.'),
      // L12
      tf(L12, 1, 1, 'Animation is a method of making films, not a single genre.', 0, 'Think about technique versus story type.', 'Animation can carry any genre.'),
      mc(L12, 2, 2, 'Which film was the first feature entirely computer-animated?', ['Toy Story (1995)', 'Snow White and the Seven Dwarfs (1937)', 'Coraline (2009)', 'Persepolis (2007)'], 'It was made by Pixar.', 'Toy Story is named as the first fully computer-animated feature.'),
      mc(L12, 3, 2, 'What technique does Coraline (2009) use?', ['Stop-motion', 'Cut-out silhouettes', 'Rotoscoped live action only', 'Hand-drawn cels only'], 'It animates physical models.', 'Coraline continues the stop-motion tradition.'),
      mc(L12, 4, 3, 'What did Persepolis (2007) show about animation?', ['Simple black and white drawings can tell a memoir', 'Animation is only for children', 'Computers are required', 'Animation cannot be political'], 'It tells a story about Iran.', 'It used simple drawings for a memoir.'),
      mc(L12, 5, 2, 'Which studio made Spirited Away (2001)?', ['Studio Ghibli', 'Pixar', 'Keystone', 'Miramax'], 'Hayao Miyazaki worked there.', 'Spirited Away is a Studio Ghibli film.'),
      // L13
      mc(L13, 1, 1, 'Who used the word documentary and described it as the creative treatment of actuality?', ['John Grierson', 'Robert Flaherty', 'Dziga Vertov', 'Leni Riefenstahl'], 'He was a Scottish filmmaker in the 1920s.', 'Grierson described documentary as the creative treatment of actuality.'),
      tf(L13, 2, 2, 'Flaherty staged parts of Nanook of the North (1922).', 0, 'The lesson says it is well known.', 'Flaherty staged parts and asked participants to use older methods.'),
      mc(L13, 3, 2, 'Which mode in Bill Nichols\'s scheme has a voice explaining the subject?', ['Expository', 'Observational', 'Participatory', 'Reflexive'], 'The word suggests explaining.', 'The expository mode relies on explanation.'),
      mc(L13, 4, 3, 'What did Triumph of the Will (1935) illustrate?', ['Nonfiction film as propaganda', 'Early direct cinema with handheld sound cameras', 'A silent comedy shot on a studio backlot', 'Animation drawn by hand for children'], 'Consider who it was made for.', 'It was made for the Nazi party.'),
      mc(L13, 5, 2, 'What technique did The Thin Blue Line (1988) use to question a conviction?', ['Reenactments', 'Cartoon drawings', 'Musical numbers', 'Silent intertitles'], 'It dramatized events.', 'Errol Morris used reenactments.'),
      // L14
      mc(L14, 1, 1, 'What is a gag?', ['A clear setup with a surprising payoff', 'A spoken monologue', 'A color filter', 'A sound effect'], 'Think of how jokes are built.', 'A gag is a setup and a payoff.'),
      mc(L14, 2, 2, 'In which year did Chaplin debut his Little Tramp character?', ['1914', '1931', '1950', '1903'], 'It was early in the silent era.', 'The Tramp debuted in 1914.'),
      tf(L14, 3, 1, 'Buster Keaton was known for a stone face and precisely designed stunts.', 0, 'Remember the description.', 'That is the lesson\'s description.'),
      mc(L14, 4, 2, 'Which film features Harold Lloyd hanging from a clock?', ['Safety Last! (1923)', 'The Gold Rush (1925)', 'City Lights (1931)', 'The Kid (1921)'], 'The title hints at danger.', 'Safety Last! is the film.'),
      mc(L14, 5, 3, 'What did sound change for silent comedians?', ['The economics, so some adapted and others did not', 'Nothing at all, since silent comedians kept the same audiences and incomes', 'It made them far more popular with critics than they had ever been', 'It forced every one of them to retire within a single year of its arrival'], 'Consider the late 1920s.', 'The lesson says sound changed the economics.'),
      // L15
      mc(L15, 1, 1, 'What is vertical integration in the studio system?', ['Control of production, distribution and theaters', 'Making only tall films', 'Showing films upside down', 'Making only shorts'], 'It covers the whole chain.', 'The studios controlled production, distribution and many theaters.'),
      mc(L15, 2, 2, 'Which studio was known for gritty gangster films?', ['Warner Bros.', 'MGM', 'Universal', 'RKO'], 'It also made Casablanca.', 'Warner Bros. was known for gangster films and social dramas.'),
      tf(L15, 3, 2, 'Genre helped studios plan because a proven formula reduced risk.', 0, 'Think about why studios liked formulas.', 'Formula plus a familiar star reduced risk.'),
      mc(L15, 4, 3, 'What did United States v. Paramount Pictures (1948) lead to?', ['Studios separating theaters from production', 'The creation of the Production Code', 'The invention of sound', 'The end of cinema'], 'It concerned ownership.', 'It led studios to separate theaters from production.'),
      mc(L15, 5, 2, 'Who enforced the Production Code strongly from 1934?', ['Joseph Breen', 'Frank Capra', 'Billy Wilder', 'Michael Curtiz'], 'He administered the Code.', 'Breen was the administrator.'),
      // L16
      mc(L16, 1, 1, 'Where did Italian neorealist films often shoot?', ['Real locations', 'Orbiting space stations', 'Space stations', 'Animated backgrounds'], 'Think of Bicycle Thieves.', 'They used real locations.'),
      tf(L16, 2, 2, 'Neorealism mostly rejected genre in favor of everyday realism.', 0, 'Compare with the New Wave.', 'The lesson contrasts this with the New Wave.'),
      mc(L16, 3, 2, 'What was the magazine of the young French critics?', ['Cahiers du Cinema', 'Variety', 'Photoplay', 'Sight and Sound'], 'It was French.', 'The critics wrote for Cahiers du Cinema.'),
      mc(L16, 4, 3, 'How did Breathless (1960) treat genre?', ['It borrowed the shape of an American gangster film and broke it up with jump cuts', 'It rejected genre completely and followed a strict classical editing style from start to finish', 'It was a lavish studio musical built around large choreographed dance numbers and songs', 'It was a silent film that used only title cards and a live orchestra for its entire score'], 'The New Wave embraced genre.', 'Godard used and fragmented the gangster film.'),
      mc(L16, 5, 2, 'What idea did the critics promote?', ['The director as an author, or auteur', 'The producer as the author', 'The star as the author', 'The studio as the author'], 'The word is French.', 'They promoted the auteur idea.'),
      // L17
      mc(L17, 1, 1, 'What is a jidaigeki?', ['A period drama, often set in the age of the samurai', 'A contemporary family drama set in postwar Tokyo apartments', 'A giant monster film', 'A silent comedy'], 'The word contrasts with gendaigeki.', 'Jidaigeki are period dramas.'),
      mc(L17, 2, 2, 'Which film did Ozu direct?', ['Tokyo Story (1953)', 'Seven Samurai (1954)', 'Godzilla (1954)', 'Akira (1988)'], 'It concerns aging parents.', 'Ozu directed Tokyo Story.'),
      tf(L17, 3, 2, 'Yojimbo (1961) was reworked by Sergio Leone as A Fistful of Dollars (1964).', 0, 'This is an example of genre exchange.', 'Leone reworked it.'),
      mc(L17, 4, 2, 'Which film launched the kaiju genre?', ['Godzilla (1954)', 'Rashomon (1950)', 'Ugetsu (1953)', 'Spirited Away (2001)'], 'Giant monster.', 'Godzilla launched kaiju.'),
      mc(L17, 5, 3, 'How is Ozu\'s camera often placed?', ['Low and still', 'Constantly spinning', 'In the sky', 'Handheld and shaky'], 'Think of calm.', 'Ozu often placed the camera low and still.'),
      // L18
      mc(L18, 1, 1, 'What does the term Bollywood usually refer to?', ['The Hindi-language industry based in Mumbai', 'All films made anywhere in South Asia since the silent era', 'Only Tamil films', 'Only silent films'], 'It is one part of a larger picture.', 'Bollywood is the Hindi industry.'),
      mc(L18, 2, 2, 'What is masala in Hindi cinema?', ['A mix of romance, action, comedy, melodrama and music', 'A silent style that relies on intertitles and exaggerated stage acting', 'A documentary mode that uses an expository narrator and archive footage', 'A camera technique that tracks a moving actor with a long steady rig'], 'It is named for a spice mixture.', 'Masala combines many genres.'),
      tf(L18, 3, 2, 'Songs in Hindi films are usually sung by playback singers.', 0, 'Actors mime.', 'Playback singers are dubbed.'),
      mc(L18, 4, 3, 'Which film began the Apu trilogy?', ['Pather Panchali (1955)', 'Sholay (1975)', 'Awaara (1951)', 'Dilwale Dulhania Le Jayenge (1995)'], 'It is Bengali.', 'Satyajit Ray directed it.'),
      mc(L18, 5, 2, 'Why is Sholay called a curry Western?', ['It blends Western conventions with Indian masala', 'It was shot on location in Texas by an American crew', 'It was filmed in America', 'It has no songs'], 'Think of both traditions.', 'It blends the two traditions.'),
      // L19
      mc(L19, 1, 1, 'What is wuxia?', ['Stories of chivalrous swordfighters in a legendary China', 'Detective stories about police inspectors in a modern Chinese city', 'Silent comedies featuring slapstick chases in Shanghai studios', 'Medical dramas set in a busy hospital in modern Hong Kong'], 'Think of swords.', 'Wuxia concerns swordfighters.'),
      mc(L19, 2, 2, 'Which star appeared in Enter the Dragon (1973)?', ['Bruce Lee', 'Jackie Chan', 'John Woo', 'King Hu'], 'He became a global star.', 'Lee starred.'),
      tf(L19, 3, 2, 'Jackie Chan fused kung fu with comic stunts.', 0, 'Remember Drunken Master.', 'That is his signature.'),
      mc(L19, 4, 3, 'What is heroic bloodshed?', ['Stylish gunfights with loyal, tragic gangsters', 'Silent slapstick', 'Courtroom drama played out in one room over several days of testimony', 'Nature documentary'], 'John Woo.', 'It is associated with Woo and Tsui Hark.'),
      mc(L19, 5, 2, 'Who choreographed action for The Matrix (1999)?', ['Yuen Woo-ping', 'Corey Yuen Kwai', 'King Hu', 'Run Run Shaw'], 'He is a choreographer.', 'Yuen worked on The Matrix.'),
      // L20
      mc(L20, 1, 1, 'What does Nollywood refer to?', ['Nigeria\'s film industry', 'Ghana\'s theatres', 'Kenya\'s festivals', 'South Africa\'s apartheid-era studio system'], 'Think of Lagos.', 'Nollywood is Nigeria\'s industry.'),
      mc(L20, 2, 2, 'Which film is commonly traced as the start of the Nollywood boom?', ['Living in Bondage (1992)', 'Lionheart (2018)', 'Black Girl (1966)', 'The Wedding Party (2016)'], 'It was sold on video.', 'Living in Bondage is commonly cited.'),
      tf(L20, 3, 2, 'Ousmane Sembene is often called the father of African cinema.', 0, 'He is from Senegal.', 'He directed Black Girl in 1966 and is widely given this title, though it is a label rather than an official one.'),
      mc(L20, 4, 3, 'How did Nollywood producers sell films?', ['They shot quickly on video and sold copies directly', 'They waited for large cinemas to book each film for a long run', 'They sold each film only to national TV networks under exclusive deals', 'They shot only on expensive film stock and screened prints in cinemas'], 'Cinemas were scarce.', 'Direct video sales.'),
      mc(L20, 5, 2, 'What is FESPACO?', ['A film festival in Ouagadougou, Burkina Faso', 'A film studio in Lagos', 'A streaming service', 'A camera brand popular with Burkinabe documentary crews'], 'It began in 1969.', 'It is a central showcase.'),
      // L21
      mc(L21, 1, 1, 'Which decades are called Mexico\'s golden age in the lesson?', ['1930s to 1950s', '1990s to 2010s', '1900s', '1970s'], 'Studio system.', 'Those decades.'),
      mc(L21, 2, 2, 'Who led Brazil\'s Cinema Novo and wrote about an aesthetic of hunger?', ['Glauber Rocha', 'Luis Bunuel', 'Fernando Solanas', 'Alfonso Cuaron'], 'Black God, White Devil.', 'Glauber Rocha led the Brazilian Cinema Novo movement and wrote the 1965 manifesto An Aesthetic of Hunger.'),
      tf(L21, 3, 2, 'Third Cinema was argued to sit outside both Hollywood and elite art cinema.', 0, 'Solanas and Getino.', 'Fernando Solanas and Octavio Getino argued in their manifesto for filmmaking outside both Hollywood and elite art cinema.'),
      mc(L21, 4, 3, 'Which film was directed by Tomas Gutierrez Alea?', ['Memories of Underdevelopment (1968)', 'The Official Story (1985)', 'Roma (2018)', 'The Hour of the Furnaces, Part One (1968)'], 'Cuba.', 'Alea directed it.'),
      mc(L21, 5, 2, 'Which film won the Academy Award for foreign-language film for Argentina?', ['The Official Story (1985)', 'City of God (2002)', 'Amores perros (2000)', 'Pixote, the Law of the Weakest (1981)'], 'It is Argentine.', 'The Official Story.'),
      // L22
      mc(L22, 1, 1, 'What replaced the Production Code in 1968?', ['A ratings system', 'A federal ban on all black-and-white film', 'A silent era', 'A ticket tax'], 'Think of G, R.', 'The MPAA ratings system replaced the Production Code in 1968.'),
      mc(L22, 2, 2, 'What was the typical New Hollywood move toward genres?', ['Revision: keep the shape but question the values', 'Abandonment: reject every genre and invent wholly new story forms', 'Make only big-budget musicals set on theater stages', 'Make only silent films as a protest against sound technology'], 'Think of McCabe and Mrs. Miller.', 'New Hollywood filmmakers often revised existing genres, such as the Western and the crime film, rather than discarding them.'),
      tf(L22, 3, 2, 'Jaws (1975) opened in hundreds of theaters with heavy television advertising.', 0, 'The first summer blockbuster.', 'Jaws opened in 1975 on hundreds of screens with heavy television advertising, and is often cited as a model for the summer blockbuster.'),
      mc(L22, 4, 3, 'What is a high-concept film?', ['One easily explained in a sentence and marketable worldwide', 'One with a slow, complicated plot that takes a long time to explain', 'One shot in a single take', 'One that is silent'], 'Think of marketing.', 'That is the definition.'),
      mc(L22, 5, 2, 'Which film began the Marvel Cinematic Universe?', ['Iron Man (2008)', 'Star Wars (1977)', 'Jaws (1975)', 'Chinatown (1974)'], 'It is from 2008.', 'Iron Man (2008) began the Marvel Cinematic Universe.'),
      // L23
      mc(L23, 1, 1, 'Which of these can independent mean?', ['Who pays, who distributes, or the attitude of the work', 'Only silent films made before the arrival of synchronized sound', 'Only films shorter than an hour and shown in small clubs', 'Only documentaries funded by governments or universities'], 'The definitions overlap.', 'All three senses.'),
      mc(L23, 2, 2, 'Which film won the top prize at Cannes in 1989 and helped launch a boom?', ['sex, lies, and videotape', 'Pulp Fiction', 'Clerks', 'Henry: Portrait of a Serial Killer'], 'Soderbergh.', 'Soderbergh\'s film.'),
      tf(L23, 3, 2, 'Independent film is a genre.', 1, 'It is a category, not a genre.', 'The lesson says it is not a genre.'),
      mc(L23, 4, 3, 'Why did the independent category blur?', ['Major studios created their own specialty divisions', 'Independent films vanished once every festival was shut down', 'Cannes closed to American filmmakers for several decades', 'Sundance banned every film that had a studio distributor attached'], 'Success had a complication.', 'Specialty divisions.'),
      mc(L23, 5, 2, 'Which company was founded in 2012?', ['A24', 'Miramax', 'Paramount', 'Warner Bros.'], 'It built a brand.', 'A24 was founded in 2012 and became known for distributing independent films.'),
      // L24
      mc(L24, 1, 1, 'What does streaming mean?', ['Delivery over the internet to a screen of the viewer\'s choosing', 'Mail-order DVDs only', 'Only cinema', 'Only broadcast television carried over cable to a fixed home set'], 'Think of Netflix after 2007.', 'Internet delivery.'),
      mc(L24, 2, 2, 'Which film became the first non-English-language Best Picture winner?', ['Parasite (2019)', 'Roma (2018)', 'Moonlight (2016)', 'Squid Game (2021)'], 'Bong Joon-ho.', 'Parasite, directed by Bong Joon-ho, won Best Picture at the 2020 Academy Awards, the first non-English-language film to do so.'),
      tf(L24, 3, 2, 'Recommendation systems can create very narrow categories compared with traditional genre labels.', 0, 'Think of micro-categories.', 'Streaming recommendation systems can sort films into very narrow categories, far narrower than traditional genre labels.'),
      mc(L24, 4, 3, 'What did Roma (2018) prompt debate about?', ['Whether a streamed film should compete for the same awards as theatrical releases', 'Whether color film stock is still needed to win any major award in Hollywood or abroad', 'Whether sound recording is needed for a film to be eligible for any major festival prize', 'Whether feature films really need professional actors in order to win any major awards'], 'It was released by Netflix.', 'Roma, a Netflix release, prompted debate about whether streaming films should compete for major theatrical awards.'),
      mc(L24, 5, 2, 'Which series, created by Hwang Dong-hyuk, became a global hit?', ['Squid Game (2021)', 'House of Cards (2013)', 'Lionheart (2018)', 'Roma (2018)'], 'South Korean.', 'Squid Game, a 2021 series created by Hwang Dong-hyuk, became a global hit.'),
    ],
  },
};
