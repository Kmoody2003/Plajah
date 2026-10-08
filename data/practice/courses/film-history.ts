import type { CourseModule } from '../courseModule';
import type { Question } from '../types';

const mcq = (lessonId: string, n: number, level: 1 | 2 | 3, prompt: string, choices: string[], answer: number, hint: string, explanation: string): Question => ({
  id: `${lessonId}.q${n}`, lessonId, kind: 'mcq', prompt, choices, answer, hint, explanation, level,
});
const tf = (lessonId: string, n: number, level: 1 | 2 | 3, prompt: string, answer: 0 | 1, hint: string, explanation: string): Question => ({
  id: `${lessonId}.q${n}`, lessonId, kind: 'tf', prompt, answer, hint, explanation, level,
});

export const COURSE_MODULE: CourseModule = {
  curriculum: {
    id: 'film-history',
    label: 'Film History',
    blurb: 'A tour of cinema through its movements, directors and craftspeople: from German Expressionism to Dogme 95.',
    accent: '#e23b6d',
    framework: 'c3',
    tracks: [
      {
        id: 'film-history.t1',
        title: 'Shadows and Studios',
        blurb: 'How early cinema and classical Hollywood built the visual language everyone still uses.',
        level: 'FOUNDATION',
        lessons: [
          {
            id: 'film-history.l01',
            title: 'German Expressionism: Sets as Psychology',
            blurb: 'Weimar Germany turned painted shadows and crooked sets into a map of the mind.',
            minutes: 6,
            body: `Between 1919 and 1931, filmmakers in Weimar Germany developed a style now called German Expressionism. Instead of trying to look like ordinary life, these films made the screen itself express fear, madness and desire. Sets were painted with angular, impossible shapes. Light and shadow were pushed to extremes, a technique known as chiaroscuro. Design was deliberately non-naturalistic, so a crooked street could tell you that a character's mind was bent out of true.

The movement favoured psychological horror and unsettling fantasy. Its key films include The Cabinet of Dr. Caligari, Metropolis, Nosferatu and M. Each one treats environment as emotion: the world on screen is how the characters feel, not how the world looks.

Why it mattered is easy to see once you know where to look. The high-contrast shadows of Expressionism fed directly into American horror and, later, film noir. Many directors and designers left Germany for Hollywood, carrying their habits of lighting and set design with them. When you see a long shadow creeping up a staircase in a modern thriller, you are seeing an idea that was refined in Berlin studios a century ago.`,
          },
          {
            id: 'film-history.l02',
            title: 'Orson Welles and Citizen Kane',
            blurb: 'A 25-year-old reinvented film grammar on his very first picture.',
            minutes: 7,
            body: `Orson Welles (1915-1985) arrived in Hollywood as a young prodigy and made Citizen Kane, widely regarded as one of the most influential films ever produced. The museum's tagline for him is simple: the 25-year-old who reinvented film grammar on his first picture.

Three techniques define his approach.
- First, deep-focus photography, which keeps the foreground and background equally sharp so that the audience can read several layers of action in one shot.
- Second, low camera angles combined with sets that had visible ceilings, which made power feel physical and oppressive.
- Third, a non-linear, multi-narrator structure built around an unanswerable question: who was Kane, really, and what did his last word mean?

Welles also directed Touch of Evil, The Magnificent Ambersons and The Trial. His career shows a recurring pattern in film history: a formally daring artist clashing with a studio system that wanted predictability. Even so, his habit of letting the image carry meaning, rather than cutting constantly between close-ups, changed how directors thought about staging a scene. Later cinematographers such as James Wong Howe and Gordon Willis worked with similar ideas about depth and shadow.`,
          },
          {
            id: 'film-history.l03',
            title: 'Hitchcock: The Master of Suspense',
            blurb: 'Why a bomb the audience knows about is scarier than a bomb that surprises them.',
            minutes: 7,
            body: `Alfred Hitchcock (1899-1980) was British by birth and American by career, and he became the defining figure of Classical Hollywood suspense. His most celebrated works include Vertigo, Psycho, Rear Window, North by Northwest and The Birds.

His central idea was suspense over surprise. If the audience is given information the characters lack, they become anxious accomplices, desperate to shout a warning at the screen. A sudden shock lasts a second; knowing danger is coming can last a whole sequence.

Hitchcock also invented or perfected tools. The dolly zoom, often called the Vertigo shot, tracks the camera backwards while zooming in, warping space so that the background seems to stretch away from a frightened character. He also popularised the MacGuffin, a plot device whose only purpose is to set the story in motion; what matters is what people will do to obtain it, not what it is.

His musical partner was Bernard Herrmann, whose shrieking all-strings score for the Psycho shower scene became the sound of cinematic anxiety. Hitchcock's producer David O. Selznick had brought him to Hollywood, and the director repaid that bet by making fear a craft that other filmmakers still study.`,
          },
        ],
      },
      {
        id: 'film-history.t2',
        title: 'Waves Around the World',
        blurb: 'Three postwar movements that rebelled against Hollywood artifice and travelled the globe.',
        level: 'INTERMEDIATE',
        lessons: [
          {
            id: 'film-history.l04',
            title: 'Italian Neorealism',
            blurb: 'Real streets, real faces and real poverty in post-war Italy.',
            minutes: 6,
            body: `Italian Neorealism ran from 1943 to 1952 in post-war Italy. It was a revolt against the glossy artifice of studio filmmaking. With Italian film studios damaged and the country rebuilding, directors went into the streets.

The movement's hallmarks were clear: non-professional actors, shooting on location, natural light and a commitment to social realism. Instead of stars living glamorous lives, audiences saw ordinary people struggling with unemployment, housing and hunger. The faces were real because they often belonged to people who had no acting training.

Key films include Bicycle Thieves, Rome, Open City, La Terra Trema and Umberto D. In Bicycle Thieves, a father needs his bicycle to keep a job, and the whole story is a search through Rome that quietly reveals the cost of poverty.

Neorealism mattered because it proved that a film could be powerful without expensive sets, famous actors or polished lighting. Its low-budget, on-location approach later inspired the French New Wave, and young directors in many countries took from it the idea that a camera and a real place were enough to make serious cinema.`,
          },
          {
            id: 'film-history.l05',
            title: 'The Japanese Golden Age and Kurosawa',
            blurb: 'In the 1950s, Japan carried its cinema to the world stage.',
            minutes: 7,
            body: `The Japanese Golden Age lasted roughly from 1950 to 1960. Akira Kurosawa, Yasujiro Ozu and Kenji Mizoguchi carried Japanese cinema to international audiences. Its hallmarks included formal composition, humanist drama, period epics known as jidaigeki, and tatami-level framing, in which the camera sits low as if viewing a room from the floor.

Kurosawa (1910-1998) is often called the Emperor of Japanese cinema. His major works include Seven Samurai, Rashomon, Ran, Ikiru and Yojimbo. He taught the West how to see the epic. He used multiple cameras with long lenses to compress and flatten the action, and he treated weather, whether rain, wind or mud, as a force in the story.

Rashomon gave film language the Rashomon effect: the same event told through irreconcilable subjective accounts, so that the audience must decide whom to believe. Other key films of the era include Tokyo Story and Ugetsu.

The influence travelled widely. Western directors borrowed Kurosawa's samurai stories and his use of motion, and the idea that a story could refuse to deliver one objective truth became a staple of modern storytelling.`,
          },
          {
            id: 'film-history.l06',
            title: 'The French New Wave and Agnes Varda',
            blurb: 'Young critics grabbed cameras and tore up the rules of classical storytelling.',
            minutes: 7,
            body: `The French New Wave ran from 1958 to 1969. Its filmmakers were young critics who decided to stop writing about cinema and start making it. They grabbed cameras and tore up the rules of classical narrative.

The movement's hallmarks were jump cuts, location shooting, improvised dialogue and a self-aware, essayistic form. Key films include Breathless, The 400 Blows, Cleo from 5 to 7 and Jules and Jim.

Agnes Varda (1928-2019), nicknamed the grandmother of the New Wave, was a central figure. She invented the idea of cinecriture, or film-writing, in which documentary and fiction blend into a single voice. In Cleo from 5 to 7 she follows a woman across ninety minutes of real-time storytelling. Her later documentaries, such as The Gleaners and I and Faces Places, helped shape the personal essay film long before it became common.

Why it matters: the New Wave showed that cinema could be personal, cheap and formally inventive. Its jump cuts and playful self-awareness spread across the world, and the American directors of New Hollywood openly admitted its influence. Editor Dede Allen later brought some of that energy to Hollywood films.`,
          },
        ],
      },
      {
        id: 'film-history.t3',
        title: 'New Hollywood and the Blockbuster',
        blurb: 'The auteur era and the arrival of the summer event movie, from 1967 to the present.',
        level: 'INTERMEDIATE',
        lessons: [
          {
            id: 'film-history.l07',
            title: 'New Hollywood',
            blurb: 'A film-school generation seized the studios and made the director king.',
            minutes: 6,
            body: `New Hollywood describes the period from 1967 to 1980 in the United States. A generation of directors, many of them film-school trained and deeply influenced by European cinema, took creative control from the old studio system and made the director an author.

Its hallmarks were the director as author, morally ambiguous heroes, location realism and strong European influence. Gone were the clean-cut protagonists of earlier decades; characters were flawed, compromised and often unresolved. Key films include The Godfather, Taxi Driver, Chinatown and Apocalypse Now.

Behind the cameras was a remarkable set of collaborators. Cinematographer Gordon Willis shot The Godfather in deep shadow. Editor and sound designer Walter Murch built the sonic worlds of Apocalypse Now and The Conversation. Screenwriter Robert Towne wrote the revelatory structure of Chinatown. Editor Dede Allen brought the jolt of jump cuts to Bonnie and Clyde.

The era did not last, partly because the blockbuster, led by directors such as Steven Spielberg, proved more profitable than risky, personal films. But it permanently shifted the idea of who a film belongs to.`,
          },
          {
            id: 'film-history.l08',
            title: 'Coppola, Willis and The Godfather',
            blurb: 'How shadows, cross-cutting and sound turned a gangster film into American opera.',
            minutes: 7,
            body: `Francis Ford Coppola (born 1939) is one of the central New Hollywood auteurs. His works include The Godfather, The Godfather Part II, Apocalypse Now and The Conversation. The museum describes him as the director who turned the gangster film into American opera.

Three craft choices stand out. First, operatic cross-cutting: the famous baptism and murder montage places a sacred ritual beside violence, so that the editing itself states the moral theme. Second, the look created by cinematographer Gordon Willis (1931-2014), nicknamed the Prince of Darkness. Willis used radical underexposure and top-lighting that dropped actors' eyes into pools of shadow, conveying secrecy and moral decay with sepia warmth and hard contrast. Third, immersive, layered sound design that rendered subjective psychological states, a method developed in close partnership with Walter Murch.

Murch, born in 1943, is credited with popularising the term sound design and is known for the Rule of Six, which ranks emotion first, followed by story, rhythm and continuity. He also edited The Godfather Part II.

The result shows that the biggest prestige films of the 1970s were collective achievements: director, cinematographer, editor and sound artist all shaping one idea.`,
          },
          {
            id: 'film-history.l09',
            title: 'Scorsese and Schoonmaker',
            blurb: 'Rhythm, pop music and a fifty-year partnership between director and editor.',
            minutes: 7,
            body: `Martin Scorsese (born 1942) is a New Hollywood director who became the great chronicler of guilt, violence and American obsession. His major films include Taxi Driver, Raging Bull, Goodfellas, Casino and The Departed.

His techniques are easy to recognise. Kinetic tracking shots, such as the Copacabana Steadicam shot in Goodfellas, immerse us in a world rather than simply observing it. Needle-drop pop soundtracks, where existing songs are placed over a scene, create ironic counterpoint to violence. Voice-over and freeze-frame fracture time and let a character narrate his own moral reckoning.

A great deal of that style is built in the cutting room by Thelma Schoonmaker (born 1940), Scorsese's editor for half a century and winner of three Oscars. Her percussive, rhythm-driven editing gives violence its own music. She built the balletic, brutal fight choreography of Raging Bull in the cut and used freeze-frames and whip-cuts as narrative punctuation in Goodfellas.

The pair show that a director's signature is often a collaboration. The look of a Scorsese film comes from the camera and the music, but its pulse comes from the editor.`,
          },
          {
            id: 'film-history.l10',
            title: 'Spielberg, Williams and the Blockbuster',
            blurb: 'Suspense from what you do not see, and a symphonic score you can hum.',
            minutes: 7,
            body: `Steven Spielberg (born 1946) is described as the architect of the summer blockbuster and its most humane storyteller. His works include Jaws, E.T., Raiders of the Lost Ark, Jurassic Park and Schindler's List.

One of his signature ideas is withholding the monster. In Jaws, suspense builds from what the audience does not see, which echoes Hitchcock's belief that anticipation outweighs shock. Another is the so-called Spielberg face, a slow push-in on a character's awe or dread, so that we feel the wonder or fear through the actor's eyes. He also blocks long takes so that exposition plays as fluid, continuous action.

The sound of his films owes a great deal to composer John Williams (born 1932), who revived the symphonic film score. Williams writes unforgettable, hummable leitmotifs tied to character and theme, drawing on the late-Romantic tradition of Korngold and Steiner. The two-note Jaws motif shows how dread can be built from the simplest possible cell.

Producer Kathleen Kennedy, born in 1953, co-founded Amblin Entertainment with Spielberg and helped shape the blockbuster era. Together they turned spectacle into mainstream emotion.`,
          },
        ],
      },
      {
        id: 'film-history.t4',
        title: 'Contemporary Rules and Rule-Breakers',
        blurb: 'Hong Kong romanticism and a Danish vow to strip film back to basics.',
        level: 'ADVANCED',
        lessons: [
          {
            id: 'film-history.l11',
            title: 'Wong Kar-wai and Christopher Doyle',
            blurb: 'Smeared motion, saturated colour and the poetry of longing.',
            minutes: 6,
            body: `Wong Kar-wai, born in 1958, belongs to Hong Kong's Second Wave. The museum calls him the poet of longing, memory and the cities that keep lovers apart. His works include In the Mood for Love, Chungking Express, Happy Together and 2046.

His method is unusual for a major director. He often shoots with improvised, script-less working methods that build mood rather than plot. He uses step-printing, dropping frames so that motion smears into a dreamlike blur, which makes memory feel like something you can see. And he uses saturated, expressive colour as pure emotion.

Much of that visual world was made with cinematographer Christopher Doyle, an Australian born in 1952. Doyle favours a handheld, restless, almost intoxicated camera full of colour and motion. His work also relies on reflections, obstructions and saturated neon, so that the audience sees the characters through glass, doorways and crowds, as if they were being remembered rather than watched.

Together, Wong and Doyle show how a film's feeling can come from texture rather than story. Their influence spread across Asian and Western cinema, proving that romance could be told through light, colour and rhythm.`,
          },
          {
            id: 'film-history.l12',
            title: 'Dogme 95: A Vow of Chastity',
            blurb: 'Handheld cameras, natural light and no tricks: a manifesto for stripped-back storytelling.',
            minutes: 6,
            body: `Dogme 95 was a movement from Denmark that ran from 1995 to 2005. Its filmmakers signed a vow of chastity that banned many of the usual tools of filmmaking. The aim was to strip story down to its bare essentials and fight the dependence on expensive effects and polished style.

The movement's hallmarks were a handheld camera, on-location sound, no artificial lighting and no genre. If a scene needed to be lit, the filmmakers had to find a way to shoot with the light that was already there. Sound was recorded in the place where the action happened, rather than added later.

Key films include The Celebration, The Idiots and Italian for Beginners. The Celebration, a family drama in which a birthday gathering reveals painful secrets, became one of the best-known examples.

Dogme matters because it offered a radical contrast to the technological spectacle of the blockbuster era. It showed that constraints can sharpen creativity, and its handheld, naturalistic look influenced later low-budget and digital filmmaking. It also echoes earlier movements such as Neorealism and the New Wave, which also chose real places and simple means over the glossy studio approach.`,
          },
        ],
      },
    ],
  },
  bank: {
    curriculumId: 'film-history',
    questions: [
      // l01
      mcq('film-history.l01', 1, 1, 'In which country did German Expressionist cinema develop?', ['Republic-era France in the 1920s', 'Weimar Germany', 'Denmark under its Dogme collective', 'Fascist Italy under Mussolini'], 1, 'The name of the movement gives it away.', 'German Expressionism came out of Weimar Germany between 1919 and 1931.'),
      mcq('film-history.l01', 2, 1, 'Which of these is a key German Expressionist film?', ['Bicycle Thieves', 'Breathless (Godard, 1960)', 'The Celebration (Vinterberg, 1998)', 'The Cabinet of Dr. Caligari'], 3, 'Think of painted, angular sets and psychological horror.', 'The Cabinet of Dr. Caligari is a key Expressionist film, alongside Metropolis, Nosferatu and M.'),
      mcq('film-history.l01', 3, 2, 'A designer wants a street scene whose bent, painted walls show a character\'s unstable mind. Which movement\'s approach is this?', ['Italian Neorealism of the post-war years', 'Dogme 95 and its vow of chastity', 'German Expressionism', 'The French New Wave of the 1960s'], 2, 'Which movement used non-naturalistic design on purpose?', 'Expressionism used painted, angular, non-naturalistic sets to turn the screen into a map of the psyche.'),
      mcq('film-history.l01', 4, 3, 'How does Expressionism differ most from Neorealism in its treatment of settings?', ['Expressionism used distorted, designed sets; Neorealism used real locations', 'Expressionism used real locations; Neorealism used painted sets', 'Both relied on non-professional actors in real streets', 'Neither movement paid any attention to lighting, shadow or the look of its settings'], 0, 'Compare "painted" with "natural light and location shooting".', 'Expressionism built non-naturalistic sets and heavy shadow, while Neorealism went into real streets with natural light.'),
      // l02
      mcq('film-history.l02', 1, 1, 'Which technique keeps both foreground and background sharp in the same shot?', ['Deep-focus photography', 'Step-printing at reduced frame rates', 'The dolly zoom', 'The audio pre-lap'], 0, 'It relates to what part of the image is in focus.', 'Welles used deep-focus photography so that foreground and background are equally sharp.'),
      tf('film-history.l02', 2, 1, 'Orson Welles made Citizen Kane when he was about 25 years old.', 0, 'Check his tagline in the museum.', 'The museum describes him as the 25-year-old who reinvented film grammar on his first picture.'),
      mcq('film-history.l02', 3, 2, 'A director wants a scene where power feels physical and oppressive. Which Welles-style choices would help?', ['Handheld camera work with natural light and no ceilings at all', 'Low angles and sets with visible ceilings', 'Step-printed, blurred motion', 'Wide-angle distortion for paranoia'], 1, 'Think about camera height and what is above the actors.', 'Welles used low angles and ceilinged sets to make power physical and oppressive.'),
      mcq('film-history.l02', 4, 3, 'Why does a multi-narrator structure built around an unanswerable question suit a film about a powerful man?', ['It lets the director avoid using deep focus', 'It ensures the plot is chronological', 'It removes the need for a script', 'It lets the audience see that one person can never be fully known'], 3, 'Think about many people describing the same person.', 'Several narrators and a question without a final answer make Kane a portrait assembled from partial views, with no single truth.'),
      // l03
      mcq('film-history.l03', 1, 1, 'What is the "MacGuffin" in Hitchcock\'s films?', ['A type of camera lens', 'A recurring cameo by the director', 'A shower-scene music cue', 'A plot device whose only purpose is to set the story in motion'], 3, 'It matters to the characters more than to the audience.', 'The MacGuffin is a plot device that starts the story; what matters is what people do to obtain it.'),
      mcq('film-history.l03', 2, 1, 'Which film is linked to the dolly zoom, also called the "Vertigo shot"?', ['Psycho', 'Vertigo', 'The Birds', 'Rear Window'], 1, 'The effect is named for the film.', 'The dolly zoom is nicknamed the Vertigo shot because it is associated with that film.'),
      mcq('film-history.l03', 3, 2, 'A filmmaker lets the audience see a bomb under a table that the characters have not noticed. Which Hitchcock principle is at work?', ['Suspense over surprise', 'Cinécriture as a film-writing method', 'The Rashomon effect of rival accounts', 'Needle-drop counterpoint on the score'], 0, 'The audience knows more than the characters.', 'Hitchcock gave the audience information the characters lacked, creating suspense instead of a quick shock.'),
      mcq('film-history.l03', 4, 3, 'Compared with Spielberg\'s withholding of the shark in Jaws, Hitchcock\'s suspense is similar because both:', ['Show the threat in every shot', 'Avoid music entirely', 'Rely on what the audience anticipates rather than sees', 'Use only handheld cameras'], 2, 'Think about the effect of waiting.', 'Both directors build tension through anticipation: what is withheld or known but unseen is scarier than constant display.'),
      // l04
      mcq('film-history.l04', 1, 1, 'During which period did Italian Neorealism flourish?', ['1919-1931', '1958-1969', '1943-1952', '1995-2005'], 2, 'It followed the Second World War.', 'The museum dates Italian Neorealism to 1943-1952, in post-war Italy.'),
      mcq('film-history.l04', 2, 1, 'Which is a hallmark of Neorealism?', ['Non-professional actors', 'Painted, angular studio sets', 'Step-printing', 'Needle-drop pop songs'], 0, 'Think about who appears on screen.', 'Neorealism used non-professional actors, location shooting, natural light and social realism.'),
      tf('film-history.l04', 3, 2, 'A film shot on location in a poor neighbourhood with local people and natural light would fit Neorealist methods.', 0, 'Compare with the list of hallmarks.', 'Location shooting, non-professional actors and natural light are core Neorealist methods.'),
      mcq('film-history.l04', 4, 3, 'Why would Neorealism have influenced later movements such as the French New Wave?', ['It introduced the dolly zoom', 'It proved serious cinema could be made cheaply on real locations', 'It required symmetrical sets', 'It was funded by the major studios'], 1, 'Think about budget and place.', 'Neorealism showed that real places and ordinary people were enough, an idea the New Wave embraced with location shooting.'),
      // l05
      mcq('film-history.l05', 1, 1, 'Which of these is a Kurosawa film?', ['Chungking Express', 'Seven Samurai', 'Vertigo', 'Taxi Driver'], 1, 'A samurai epic.', 'Seven Samurai is among Kurosawa\'s best-known works, with Rashomon, Ran, Ikiru and Yojimbo.'),
      mcq('film-history.l05', 2, 1, 'What is the "Rashomon effect"?', ['A smeared motion technique', 'A shadow-heavy lighting style', 'A sound-mixing rule', 'The same event told through irreconcilable subjective accounts'], 3, 'It involves several people describing one event.', 'The Rashomon effect presents one event through accounts that cannot be reconciled.'),
      mcq('film-history.l05', 3, 2, 'A director films a battle in rain and mud with several cameras and long lenses to flatten the action. Whose style is this?', ['Wong Kar-wai of Hong Kong', 'Jane Campion of New Zealand', 'Akira Kurosawa', 'Stanley Kubrick'], 2, 'Weather was treated as a narrative force.', 'Kurosawa used multi-camera coverage with long lenses and treated rain, wind and mud as narrative forces.'),
      mcq('film-history.l05', 4, 3, 'Which pair names directors who, with Kurosawa, defined the Japanese Golden Age?', ['Ozu and Mizoguchi', 'Welles and Hitchcock', 'Varda and Truffaut', 'Coppola and Scorsese'], 0, 'Think of other Japanese masters.', 'The museum names Kurosawa, Ozu and Mizoguchi as carrying Japanese cinema to the world stage.'),
      // l06
      mcq('film-history.l06', 1, 1, 'What is "cinécriture", the term associated with Agnès Varda?', ['Film-writing that fuses documentary and fiction as one voice', 'A lighting trick', 'A rule for editing sound', 'A type of camera dolly'], 0, 'The word suggests writing with film.', 'Varda invented cinécriture, or film-writing, blending documentary and fiction.'),
      tf('film-history.l06', 2, 1, 'The French New Wave ran from 1958 to 1969.', 0, 'Check the movement list.', 'The museum dates the French New Wave to 1958-1969.'),
      mcq('film-history.l06', 3, 2, 'A young critic makes a film using jump cuts, improvised dialogue and location shooting. Which movement does this resemble?', ['German Expressionism', 'French New Wave', 'Dogme 95 only', 'Classical Hollywood'], 1, 'Critics turned filmmakers.', 'Jump cuts, location shooting and improvised dialogue are New Wave hallmarks.'),
      mcq('film-history.l06', 4, 3, 'Which Varda film is noted for following a woman across ninety minutes of real-time storytelling?', ['Vagabond', 'Faces Places', 'The Gleaners and I', 'Cléo from 5 to 7'], 3, 'The title mentions a time window.', 'Cléo from 5 to 7 tracks a woman across ninety unbroken minutes in real time.'),
      // l07
      mcq('film-history.l07', 1, 1, 'What years does the museum give for New Hollywood?', ['1919-1931', '1950-1960', '1995-2005', '1967-1980'], 3, 'It followed the Classical era.', 'New Hollywood is dated 1967-1980 in the United States.'),
      mcq('film-history.l07', 2, 1, 'Which is a hallmark of New Hollywood?', ['A vow of chastity', 'Morally ambiguous heroes', 'Painted sets', 'A rule against location shooting'], 1, 'Characters were not clean-cut.', 'Morally ambiguous heroes, the director as author and location realism define New Hollywood.'),
      mcq('film-history.l07', 3, 2, 'Which list contains only New Hollywood key films?', ['The Godfather, Taxi Driver, Chinatown', 'Nosferatu, Metropolis, M', 'Rashomon, Ugetsu, Tokyo Story', 'The Celebration, The Idiots'], 0, 'Look for 1970s American titles.', 'The Godfather, Taxi Driver, Chinatown and Apocalypse Now are the key films listed.'),
      mcq('film-history.l07', 4, 3, 'Why does the lesson say New Hollywood changed "who a film belongs to"?', ['Studios stopped releasing films', 'Actors began directing all films', 'Directors, not studios, came to be seen as authors', 'Films became silent again'], 2, 'Think of "auteur".', 'The movement made the director the author of the film, shifting credit away from the studio.'),
      // l08
      mcq('film-history.l08', 1, 1, 'Which cinematographer is nicknamed the "Prince of Darkness"?', ['Roger Deakins', 'Vittorio Storaro', 'Gordon Willis', 'Christopher Doyle'], 2, 'He shot The Godfather.', 'Gordon Willis earned the nickname for radical underexposure that dropped eyes into shadow.'),
      mcq('film-history.l08', 2, 1, 'Which editor is credited with the term and practice of "sound design"?', ['Walter Murch', 'Dede Allen of Bonnie and Clyde', 'Sally Menke of Pulp Fiction', 'Thelma Schoonmaker'], 0, 'He also coined the Rule of Six.', 'Walter Murch is associated with sound design as an authored soundscape.'),
      mcq('film-history.l08', 3, 2, 'In the Rule of Six, which element ranks FIRST?', ['Continuity', 'Rhythm', 'Story', 'Emotion'], 3, 'It is about how the audience feels.', 'Murch\'s Rule of Six puts emotion first, followed by story, rhythm and continuity.'),
      mcq('film-history.l08', 4, 3, 'What does the baptism and murder montage in The Godfather achieve through editing?', ['It removes all violence from the film by cutting away to the church choir', 'It states a moral theme by cutting a sacred ritual against killing', 'It shows the story in chronological order from the christening onward', 'It introduces the dolly zoom to underline the horror of the sequence'], 1, 'Think of the contrast between two events.', 'Operatic cross-cutting set a sacred ritual beside murder, letting the editing itself act as a moral thesis.'),
      // l09
      mcq('film-history.l09', 1, 1, 'Who is Martin Scorsese\'s long-time editor?', ['Walter Murch, of Apocalypse Now', 'Thelma Schoonmaker', 'Dede Allen', 'Sally Menke'], 1, 'She has won three Oscars.', 'Thelma Schoonmaker has edited Scorsese\'s films for half a century.'),
      mcq('film-history.l09', 2, 1, 'Which of these is a Scorsese film?', ['The Piano, by Jane Campion', 'Jaws, by Steven Spielberg', 'Rashomon, by Akira Kurosawa', 'Goodfellas'], 3, 'A gangster story with a famous Steadicam shot.', 'Goodfellas is listed among Scorsese\'s works, with Taxi Driver, Raging Bull, Casino and The Departed.'),
      mcq('film-history.l09', 3, 2, 'A director places a cheerful pop song over a brutal scene to create irony. Which Scorsese technique is this?', ['Step-printing across the whole scene', 'Axial cutting', 'Needle-drop counterpoint', 'Negative fill'], 2, 'The song comes from existing recordings.', 'Needle-drop pop soundtracks used as ironic counterpoint to violence are a Scorsese signature.'),
      mcq('film-history.l09', 4, 3, 'Why is the Scorsese-Schoonmaker partnership a good example of film as collaboration?', ['The look is the camera\'s and the pulse is the editor\'s', 'Schoonmaker directs while Scorsese cuts', 'Neither uses music', 'They only shoot documentaries'], 0, 'Who creates rhythm?', 'Scorsese supplies camera and music choices, while Schoonmaker\'s percussive cutting gives the films their rhythm.'),
      // l10
      mcq('film-history.l10', 1, 1, 'Which film shows the Spielberg approach of withholding the monster?', ['Jaws', 'Schindler\'s List', 'E.T.', 'Raiders of the Lost Ark'], 0, 'Think of a shark.', 'In Jaws, suspense builds from what the audience does not see.'),
      mcq('film-history.l10', 2, 1, 'Which composer revived the symphonic film score and wrote the two-note Jaws motif?', ['Hans Zimmer, of Inception', 'Ennio Morricone', 'John Williams', 'Bernard Herrmann'], 2, 'He also scored Star Wars.', 'John Williams revived the late-Romantic symphonic tradition and wrote the Jaws motif.'),
      mcq('film-history.l10', 3, 2, 'Which company did Kathleen Kennedy co-found with Spielberg?', ['Lucasfilm, the Star Wars company', 'Amblin Entertainment', 'Marvel Studios, the comics studio', 'Eon Productions, the Bond producers'], 1, 'It shaped the blockbuster era.', 'Kennedy co-founded Amblin Entertainment and helped shape the blockbuster era with Spielberg.'),
      mcq('film-history.l10', 4, 3, 'What do Hitchcock\'s suspense and Williams\'s two-note Jaws motif have in common?', ['They both rely on long passages of expository dialogue', 'They both use bright colour', 'They both avoid music', 'They both build dread from very little'], 3, 'Simple means, strong effect.', 'Both create dread from minimal means: information held back, or the simplest possible musical cell.'),
      // l11
      mcq('film-history.l11', 1, 1, 'What does step-printing do?', ['Adds colour to black-and-white film', 'Keeps everything in focus', 'Records sound on location', 'Drops frames to smear motion into dreamlike blur'], 3, 'It affects how motion looks.', 'Step-printing drops frames so that motion smears into a dreamlike blur.'),
      mcq('film-history.l11', 2, 1, 'Which cinematographer collaborated with Wong Kar-wai on In the Mood for Love and Chungking Express?', ['Gordon Willis', 'Christopher Doyle', 'Roger Deakins', 'Vittorio Storaro, of Apocalypse Now'], 1, 'Australian, born 1952.', 'Christopher Doyle shot In the Mood for Love, Chungking Express and Happy Together.'),
      tf('film-history.l11', 3, 2, 'Wong Kar-wai is associated with Hong Kong\'s Second Wave.', 0, 'Check the era listed for him.', 'The museum lists his era as the Hong Kong Second Wave.'),
      mcq('film-history.l11', 4, 3, 'How does Wong\'s improvised, script-less shooting shape the finished films?', ['It produces strict three-act structure', 'It rules out colour', 'It builds mood over plot', 'It requires deep focus'], 2, 'Think about atmosphere versus story.', 'Improvised shooting favours mood and feeling over conventional plot.'),
      // l12
      mcq('film-history.l12', 1, 1, 'Which country produced Dogme 95?', ['Italy, in the post-war years', 'Japan, in its Golden Age', 'Denmark', 'France, in the New Wave years'], 2, 'A Nordic country.', 'Dogme 95 originated in Denmark.'),
      mcq('film-history.l12', 2, 1, 'Which is a Dogme 95 hallmark?', ['No artificial lighting', 'Painted sets', 'Deep use of stylised blur', 'A symphonic score'], 0, 'The vow forbade polish.', 'Dogme required handheld camera, on-location sound, no artificial lighting and no genre.'),
      mcq('film-history.l12', 3, 2, 'A director wants to follow Dogme rules. Which choice is allowed?', ['Adding studio lights to a scene', 'Building a painted set for the interiors of the main apartment', 'Dubbing sound later in a studio', 'Shooting handheld with the available light'], 3, 'Natural and handheld.', 'Handheld camera and available light fit Dogme; artificial lighting and studio-added sound do not.'),
      mcq('film-history.l12', 4, 3, 'What earlier movements share the Dogme preference for simple means and real places?', ['German Expressionism and Classical Hollywood', 'Italian Neorealism and the French New Wave', 'New Hollywood and the blockbuster', 'The Hong Kong Second Wave only'], 1, 'Think of location shooting.', 'Neorealism and the New Wave also chose real places and modest means over studio gloss.'),
    ],
  },
};
