// ─────────────────────────────────────────────────────────────────────────────
// data/filmSchoolCurriculum.ts — Taleo Film School as a real school (Blueprint 2B).
//
// A `Curriculum` for the shared school chassis (services/schoolChassis.ts), rendered
// by <SchoolView>. Eight tracks, Foundations → Acting & the Craft.
//
// Every `watchAlong` film is PUBLIC DOMAIN in the United States and every archive.org
// identifier below was verified to resolve. Silent-era timestamps are approximate by
// nature — surviving prints run at different frame rates and carry different scores —
// so those lessons say so in the note rather than pretending to frame accuracy.
//
// Every `videoId` was verified live via the YouTube oEmbed API and is credited by its
// actual title/channel, not a guess.
// ─────────────────────────────────────────────────────────────────────────────

import type { Curriculum } from '../services/schoolChassis';

const ia = (id: string) => `https://archive.org/details/${id}`;

// Public-domain watch-along library (all verified).
const PD = {
  trainRobbery:  { title: 'The Great Train Robbery (1903, Edwin S. Porter)',        url: ia('TheGreatTrainRobbery1903') },
  moon:          { title: 'Le Voyage dans la Lune (1902, Georges Méliès)',          url: ia('le-voyage-dans-la-lune-1902-georges-melies') },
  caligari:      { title: 'The Cabinet of Dr. Caligari (1920, Robert Wiene)',       url: ia('silent-the-cabinet-of-dr-caligari') },
  nosferatu:     { title: 'Nosferatu (1922, F. W. Murnau)',                         url: ia('nosferatu-1922_202504') },
  sherlockJr:    { title: 'Sherlock Jr. (1924, Buster Keaton)',                     url: ia('sherlock.-jr.-1924.1080p') },
  phantom:       { title: 'The Phantom of the Opera (1925, Rupert Julian)',         url: ia('PhantomOfTheOpera1925HD') },
  potemkin:      { title: 'Battleship Potemkin (1925, Sergei Eisenstein)',          url: ia('BattleshipPotemkin') },
  general:       { title: 'The General (1926, Buster Keaton & Clyde Bruckman)',     url: ia('TheGeneral1926') },
  movieCamera:   { title: 'Man with a Movie Camera (1929, Dziga Vertov)',           url: ia('man-with-a-movie-camera-1929-by-dziga-vertov') },
  hisGirlFriday: { title: 'His Girl Friday (1940, Howard Hawks)',                   url: ia('HisGirlFriday') },
  scarletStreet: { title: 'Scarlet Street (1945, Fritz Lang)',                      url: ia('ScarletStreet') },
  stranger:      { title: 'The Stranger (1946, Orson Welles)',                      url: ia('the-stranger-1946_202404') },
  planNine:      { title: 'Plan 9 from Outer Space (1959, Ed Wood)',                url: ia('turner_video_99368') },
  carnival:      { title: 'Carnival of Souls (1962, Herk Harvey)',                  url: ia('carnival_of_souls_202110') },
  charade:       { title: 'Charade (1963, Stanley Donen)',                          url: ia('charade-1963-cary-grant-audrey-hepburn-walter-matthau-1080p-reup') },
  livingDead:    { title: 'Night of the Living Dead (1968, George A. Romero)',      url: ia('night-of-the-living-dead-1968-by-george-a.-romero') },
};

const SILENT_NOTE = 'Timings are approximate: surviving prints of this film run at different frame rates and lengths. Scrub to the described action rather than trusting the clock.';

export const FILM_SCHOOL: Curriculum = {
  id: 'film-school',
  label: 'Taleo Film School',
  blurb:
    'A complete film education — from the first principles of the shot to the technique lineages of screen acting. ' +
    'Every lesson pairs teaching with a watch-along from the public-domain canon and ends with something you actually make in Fabula. ' +
    'Completions write to your portable Academic Passport.',
  accent: '#FFB68D',
  framework: 'NCAS_MEDIA',  // seeded in data/educationStandards.ts; FILM.* ids crosswalk to NCAS MA:* anchors
  tracks: [
    // ── FOUNDATIONS ──────────────────────────────────────────────────────────
    {
      id: 'foundations',
      title: 'Foundations',
      blurb: 'The irreducible grammar: the shot, the cut, the frame, the sound. Everything else is built on these eight lessons.',
      level: 'FOUNDATION',
      lessons: [
        {
          id: 'fs-found-1',
          title: 'What Cinema Actually Is',
          blurb: 'Photography plus time — and the two inventions that turned a novelty into a language.',
          minutes: 18,
          standardIds: ['FILM.FOUND.1'],
          body: `Cinema is photography with duration attached. That sounds trivial until you notice what it buys you: the ability to control not just what an audience sees, but for exactly how long they see it, and what they see immediately before and after. No other art form has that combination. A painting cannot dictate the order in which you look at it. A novel cannot control your reading speed. A play cannot cut to a close-up of a hand.

For roughly its first decade, film did not know this. Early actualities — the Lumières' workers leaving a factory, a train arriving at La Ciotat — were single unbroken shots from a locked-off camera at theatrical distance. The camera stood where a good seat in a theatre would be, and it stayed there. The medium was recording, not composing.

Two inventions changed that. Georges Méliès, a stage magician, discovered the substitution splice — stop the camera, change the scene, restart — and realised film could show things that had never happened. Edwin S. Porter, in The Great Train Robbery (1903), cut between two lines of action happening in different places at the same time, and the audience followed without being told how. That second discovery is the more radical one: it proves the audience will assemble a coherent world out of fragments, if the fragments are chosen well. Every technique in the rest of this school is a refinement of that fact.

So the working definition for this curriculum is: a film is a sequence of chosen fragments, ordered in time, that an audience assembles into an experience. Your job as a filmmaker is choosing and ordering. Your job as a student, starting now, is learning to see the choices instead of only the story.`,
          watchAlong: {
            ...PD.trainRobbery,
            start: '00:00',
            end: '11:00',
            note: 'The whole film runs about eleven minutes. Watch it twice. The first time, just watch. The second time, count the shots and note every moment the location changes — you are watching an audience be taught to read cinema in real time.',
          },
          resources: [
            { label: 'Le Voyage dans la Lune (1902) — Méliès, the other founding text', url: PD.moon.url },
          ],
          assignment: {
            prompt: 'Shoot and assemble a 60-second "actuality" — one location, no dialogue, no story. Then recut the same footage into a 60-second scene that implies a story purely through the order of shots. Same material, two films. Publish both.',
            tool: 'FABULA',
            postTag: 'filmschool',
          },
        },
        {
          id: 'fs-found-2',
          title: 'The Shot: Size, Angle, and What They Mean',
          blurb: 'Every shot size is an argument about how close the audience should stand.',
          minutes: 22,
          videoId: 'AyML8xuKfoc',
          standardIds: ['FILM.FOUND.2'],
          body: `Shot size is the single most consequential decision available to a director, and it is almost never discussed as a decision — it is usually described as coverage. That framing is backwards. Coverage is the safety net. The shot size is the sentence.

The vocabulary is small. An extreme wide shot places a figure inside a landscape and makes the landscape the subject: the character is contingent, dwarfed, passing through. A wide (or full) shot shows a whole body in a whole space, which is where physical comedy and dance live because you cannot fake a body in a full shot. A medium shot — waist up — is the conversational default, close enough for expression, wide enough for gesture. A close-up isolates a face and makes interiority the subject; it is the only shot that has no theatrical equivalent, and it is why cinema can do psychology in a way the stage cannot. An extreme close-up abstracts a detail into a symbol.

Angle modifies all of this. A low angle puts the audience beneath the subject and reads as power or threat, not because of any innate meaning but because we learned it as children looking up at adults. A high angle reads as vulnerability. Eye level reads as neutral, which is itself a choice — the choice not to editorialise.

The discipline to build is this: for every shot you plan, be able to answer "why this size?" in one sentence that is about the audience's feeling, not about logistics. "Because we need to see the room" is a logistics answer. "Because she should feel watched" is a directing answer. If you can only produce the first kind of answer, you are covering a scene, not directing one.`,
          watchAlong: {
            ...PD.caligari,
            start: '00:00',
            end: '20:00',
            note: `${SILENT_NOTE} German Expressionism painted the shadows onto the set because it could not yet light them. Watch how the angles of the constructed world do the work that camera angle would do a decade later.`,
          },
          assignment: {
            prompt: 'Take one 30-second action — someone reads a letter and reacts. Shoot it three times: entirely in wide, entirely in medium, entirely in close-up. Cut all three into one video, back to back, with no other changes. The difference you feel is the shot size doing its job.',
            tool: 'FABULA',
            postTag: 'filmschool',
          },
        },
        {
          id: 'fs-found-3',
          title: 'The Cut: Why the Audience Doesn\'t Notice',
          blurb: 'Continuity is not realism. It is a set of conventions the audience agreed to a century ago.',
          minutes: 20,
          videoId: '3Q3eITC01Fg',
          standardIds: ['FILM.FOUND.3'],
          body: `Between any two shots there is a violent discontinuity: space jumps, time jumps, the point of view is instantly relocated. In life this would be alarming. In cinema it is invisible. That invisibility is not natural — it is engineered, and the engineering has a name: continuity editing.

The rules are few and they exist to keep the audience oriented. The 180-degree rule says that once you establish an imaginary line between two characters, all cameras stay on one side of it, so a character looking screen-right in one shot still looks screen-right in the next; cross the line and the two people appear to be looking the same way, and the geography collapses. Matching action — cutting mid-movement so the movement completes in the next shot — hides the join inside the motion. Eyeline match makes shot B feel like what the character in shot A was looking at, even when the two shots were filmed a week apart in different countries. That last one is the load-bearing illusion of the entire industry.

Then there is the 30-degree rule: if you cut between two shots of the same subject from angles less than about thirty degrees apart, the cut reads as a jump, a glitch. Go wider than that and it reads as a new view.

Understand these as conventions and not laws, because the moment you know them you can break them on purpose. Godard's jump cuts in Breathless are not incompetence; they are a refusal of the smoothing contract. But you have to have the contract before you can refuse it.`,
          watchAlong: {
            ...PD.hisGirlFriday,
            start: '00:00',
            end: '15:00',
            note: 'Hawks cuts a rapid-fire overlapping-dialogue scene without ever disorienting you. Track the eyelines: every cut hands you the next person to look at before you thought to ask.',
          },
          assignment: {
            prompt: 'Shoot a two-person conversation and deliberately cross the line halfway through. Watch it back and feel the disorientation. Then re-shoot or re-cut it correctly. Publish the broken version and the fixed version together with a one-paragraph note on what changed for you as a viewer.',
            tool: 'FABULA',
            postTag: 'filmschool',
          },
        },
        {
          id: 'fs-found-4',
          title: 'Mise-en-Scène: Everything Inside the Frame',
          blurb: 'Design, staging, costume, light and blocking are one composite argument.',
          minutes: 20,
          standardIds: ['FILM.FOUND.4'],
          body: `Mise-en-scène — literally "putting into the scene" — is the total content of the frame: the set, the props, the costume, the light, the placement and movement of bodies within the space. It is the part of filmmaking inherited directly from theatre, and it is the part most beginners neglect because it feels like production design's job rather than the director's.

It is the director's job. Consider how much of a character's exposition can be handled without a single line: what is on their walls, whether their coat fits, whether they stand at the centre of a room or at its edge, whether the camera has to find them or they are handed to us. Every one of those is a choice you make or fail to make. Failing to make it does not produce neutrality; it produces someone else's choice, usually the location's.

Blocking is where mise-en-scène becomes dynamic. Where a character stands relative to another character is a statement of the power in the room, and moving them mid-scene is how you show that power shifting without commenting on it. The classic move — a character who has been seated stands and crosses to the window as the conversation turns — is not a stage direction for its own sake. It is a change in the geometry that the audience reads as a change in the balance.

The Expressionists took this to its limit: in Caligari the sets themselves are psychologically distorted, painted with shadows that no lamp could cast. It looks stylised because it is, but the underlying principle is the ordinary one. The frame is never neutral. Decide what it is saying.`,
          watchAlong: {
            ...PD.nosferatu,
            start: '00:00',
            end: '25:00',
            note: `${SILENT_NOTE} Murnau shot on real locations, not Expressionist sets — and still produced dread. Watch the doorways, the arches, and the negative space around Orlok. The architecture is the performance.`,
          },
          assignment: {
            prompt: 'Film one static wide shot of a room that tells you who lives there, with no person in it and no dialogue. You get 20 seconds and one camera position. Every piece of information must come from what is in the frame and how it is lit.',
            tool: 'FABULA',
            postTag: 'filmschool',
          },
        },
        {
          id: 'fs-found-5',
          title: 'Sound Is Half the Picture',
          blurb: 'The soundtrack is the fastest emotional instrument you have, and the one nobody notices you playing.',
          minutes: 18,
          videoId: 'mXtnHHJFREM',
          standardIds: ['FILM.FOUND.5'],
          body: `An audience will forgive a soft image. It will not forgive bad sound. This is the first practical thing to learn, and it stays true at every budget: viewers read poor picture as a style and poor audio as incompetence. If you have one day and one improvement to make, make it the sound.

Conceptually, a soundtrack has four layers. Dialogue carries the literal information. Ambience — room tone, the city outside, the wind — establishes place and continuity, and is what makes a cut between two takes feel like one continuous space. Effects, including foley, are the physical world made audible, and they are almost always constructed rather than recorded live; the punch you hear was never thrown. Score is the layer that speaks directly to the audience without pretending to belong to the world.

The most useful distinction is diegetic versus non-diegetic: sound that exists inside the story's world versus sound only the audience hears. A radio playing in the car is diegetic. The strings underneath it are not. Moving a sound across that boundary — starting a piece as score and revealing it to be a record playing in the next room — is one of the oldest and most reliable tricks in the medium, because it retroactively changes the audience's relationship to what they have been hearing.

The silent era is the proof of sound's power by its absence. Silent films were never silent; they were scored live, and the same film with a different accompanist was a different film. That is worth sitting with. The images did not change and the experience did.`,
          watchAlong: {
            ...PD.carnival,
            start: '00:00',
            end: '20:00',
            note: 'Made for almost nothing, and its entire atmosphere is carried by a church organ score and a strange, thin sound mix. Notice how much of the unease is arriving through your ears.',
          },
          assignment: {
            prompt: 'Take any 90 seconds of footage you have already shot and build two completely different soundtracks for it — one that makes it feel safe, one that makes it feel wrong. Change no picture. Publish both cuts side by side.',
            tool: 'FABULA',
            postTag: 'filmschool',
          },
        },
        {
          id: 'fs-found-6',
          title: 'Movement: Camera, Subject, and the Frame as a Field',
          blurb: 'Kurosawa staged movement in three planes at once. Start by seeing which plane is moving.',
          minutes: 20,
          videoId: 'doaQC-S8de8',
          standardIds: ['FILM.FOUND.6'],
          body: `There are only two things that can move: the subject, and the camera. Almost everything expressive about a shot with motion in it comes from the relationship between those two.

When the subject moves and the camera holds, the frame becomes a field the subject travels across, and the audience's attention is free to notice the space. This is the physical comedy setup — you cannot cut inside a Keaton gag without destroying the proof that the stunt was real, so the camera holds and the world does the work. When the camera moves and the subject holds, the audience is being led: a push in says pay attention to this, a pull out says there is more here than you knew. When both move together the camera becomes a companion, which is why a tracking shot alongside a walking character feels intimate in a way that a static wide of the same walk never does.

Kurosawa's contribution — the reason he is the canonical study for movement — was staging action in depth so that foreground, middle and background all move on different vectors and different rhythms, turning a flat rectangle into a field with weather in it. He shot with long lenses and multiple cameras to catch it, which compresses the planes and makes the layered motion legible rather than chaotic.

The trap to avoid is movement as decoration. A camera move that does not change what the audience knows or feels is a camera move that costs money and time and buys nothing. Before you plan a move, finish this sentence: "the camera moves here because the audience needs to ______."`,
          watchAlong: {
            ...PD.general,
            start: '00:00',
            end: '20:00',
            note: `${SILENT_NOTE} Keaton's camera almost never cuts inside a gag, because the gag's credibility depends on the unbroken frame. Watch what he gains by refusing to cut.`,
          },
          assignment: {
            prompt: 'Shoot the same 20-second action four ways: static camera / static subject, static camera / moving subject, moving camera / static subject, both moving. Cut them together. Write one line under each about what the audience gets from that combination.',
            tool: 'FABULA',
            postTag: 'filmschool',
          },
        },
        {
          id: 'fs-found-7',
          title: 'Genre and the Contract with the Audience',
          blurb: 'Genre is not a shelf label. It is a set of promises, and the interesting work is in which one you break.',
          minutes: 16,
          standardIds: ['FILM.FOUND.7'],
          body: `A genre is an agreement. When the audience recognises the genre — from the poster, the first minute, the score — they immediately load a set of expectations about what kind of events can happen, what tone is permissible, roughly how it will end, and what emotional posture to adopt. This happens before any conscious thought, and it is doing enormous work for you.

That work is worth taking seriously rather than resenting. Genre expectations are pre-installed comprehension: you do not have to explain to a horror audience that the basement is dangerous. The craft question is not whether to use genre but which promises you intend to keep and which single promise you intend to break. Breaking all of them produces incoherence. Breaking none produces the thing the audience has already seen. Breaking one — usually one — is what people mean when they call a film fresh.

Screwball comedy is a good place to study the contract because its rules are so tight. The couple must be evenly matched. The dialogue must be faster than plausible. The obstacle must be self-inflicted. His Girl Friday obeys all of it and breaks one rule — it lets the newspaper plot carry real stakes, including a man's life, underneath the banter — and the friction between the two registers is where the film gets its charge.

When you are working, name your genre out loud and write down its five promises. Then decide, deliberately, which one you are breaking. If you cannot name it, your film does not have a position; it has a mood.`,
          watchAlong: {
            ...PD.hisGirlFriday,
            start: '15:00',
            end: '45:00',
            note: 'Time the overlaps. Hawks had actors start speaking before the previous line ended — a violation of the recording conventions of the time — because the genre promise was speed.',
          },
          assignment: {
            prompt: 'Write and shoot a 90-second scene that obeys every convention of a genre except one, and make the broken one load-bearing. In the description, state the genre, list the five promises, and say which you broke.',
            tool: 'FABULA',
            postTag: 'filmschool',
          },
        },
        {
          id: 'fs-found-8',
          title: 'How to Watch a Film Like a Filmmaker',
          blurb: 'The single most valuable habit in this school, and it costs nothing.',
          minutes: 15,
          videoId: 'KjY9kf7TuUU',
          standardIds: ['FILM.FOUND.8'],
          body: `There is a difference between watching a film and reading one, and the whole of your development depends on learning to do the second without losing the ability to do the first.

The practical method is the two-pass watch. On the first pass you watch normally and let it work on you, because if you never let a film work on you, you will lose your instinct for whether things are working at all. Then you note, in one sentence, what you felt and where. On the second pass you go to those exact moments and ask what produced the feeling: shot size, cut point, sound, performance, staging, colour, or the thing that happened forty minutes earlier that set it up. Nine times out of ten the cause is not where the feeling is.

Detail-driven directors are the best training ground for this, because they build feeling out of things that are technically minor — a hand on a bannister, a sound heard through a wall, an object held a beat too long. The reason these read as poetry rather than clutter is selection: the detail is chosen because it is the only piece of the moment the character themselves would have registered. That is the underlying principle. A detail is not decoration; it is a claim about someone's attention.

Keep a running log. Film, moment, feeling, cause. Fifty entries in, you will start predicting your own reactions before they arrive, and that is the point at which you can direct one on purpose.`,
          watchAlong: {
            ...PD.stranger,
            start: '00:00',
            end: '30:00',
            note: 'Welles builds tension with almost no budget and a lot of ceiling. Do the two-pass on the first thirty minutes and log five entries.',
          },
          assignment: {
            prompt: 'Do the two-pass watch on any film and publish a 2-minute video essay on a single moment: state the feeling, then show and explain the cause. Screen-record or re-stage the moment if you cannot clip it.',
            tool: 'FABULA',
            postTag: 'filmschool',
          },
        },
      ],
    },

    // ── SCREENWRITING ────────────────────────────────────────────────────────
    {
      id: 'screenwriting',
      title: 'Screenwriting',
      blurb: 'Premise, structure, scene, dialogue, character and the rewrite — the discipline of putting a film on paper before it costs anything.',
      level: 'FOUNDATION',
      lessons: [
        {
          id: 'fs-write-1',
          title: 'Premise, Logline, and the Idea That Can Carry Ninety Minutes',
          blurb: 'Most scripts fail here, before a word of dialogue is written.',
          minutes: 18,
          standardIds: ['FILM.WRITE.1'],
          body: `A premise is not a subject. "A film about grief" is a subject; it has no engine. A premise is a specific person, in a specific situation, with a specific pressure, whose attempt to resolve it will generate scenes. The test is whether you can immediately imagine three scenes you have not seen before. If you cannot, you have a theme and no story.

The logline is the compression test. One sentence: when [inciting event] happens, a [flawed protagonist] must [pursue a difficult goal] or else [stakes]. It sounds mechanical because it is, deliberately — the mechanism exposes whether the parts exist. If you cannot name the protagonist's flaw, you have not decided who this is about. If the stakes clause is vague ("or everything changes"), you have not decided what it costs to fail. A logline that survives this is not a marketing artefact; it is a structural diagnosis you can run in thirty seconds, before you have spent six months on pages.

Two properties separate an idea that can carry ninety minutes from one that runs out at twenty. The first is escalation: the situation must be able to get worse in kind, not just in degree. Louder is not worse. Worse is when the protagonist's own solution creates the next problem. The second is a question the audience wants answered that is not the plot question. "Will he get the money" fills an hour. "Will he stop being the kind of man who needs it" fills a film.

Write ten loglines before you write one script. Nine of them will die, correctly, in one sentence rather than in one hundred and ten pages.`,
          resources: [
            { label: 'Script Vault — read complete produced screenplays', url: 'https://www.imsdb.com/' },
          ],
          assignment: {
            prompt: 'Write ten loglines using the full formula. Pick the one that generates the most scenes you have not seen, shoot its opening image as a 30-second silent film, and publish the logline alongside it.',
            tool: 'FABULA',
            postTag: 'filmschool',
          },
        },
        {
          id: 'fs-write-2',
          title: 'Three-Act Structure and What It Is Actually Describing',
          blurb: 'Not a formula imposed on stories — a description of how attention behaves over two hours.',
          minutes: 22,
          videoId: 'tvqjp1CxxD8',
          standardIds: ['FILM.WRITE.2'],
          body: `Three-act structure gets attacked as a formula, and the attack misses what it is. It is not a rule anyone invented; it is a retroactive description of the shape stories tend to take when they hold an audience for two hours. Knowing it does not make your film generic. Not knowing it makes your second act collapse.

Act One, roughly the first quarter, establishes the ordinary world and the protagonist's flaw, then breaks it. The break — the first plot point — is the moment the protagonist cannot go back, and it should be genuinely irreversible. If your protagonist could reasonably go home and resume their life, your first act has not ended, however many pages have passed.

Act Two is the middle half, and it is where scripts die. The reason is that Act Two has no natural momentum of its own: it has to be driven by escalation, and escalation has to be structural, not just louder. The midpoint is the load-bearing beat — a false victory or false defeat that flips the terms of the pursuit, usually by revealing that the protagonist has been solving the wrong problem. Without a real midpoint you have a first half of Act Two and then a repeat of it. The end of Act Two is the low point: the strategy that got them this far is exhausted, and it is exhausted because it was built on the flaw.

Act Three is the final quarter. The protagonist confronts the same problem with a changed relationship to it. The climax must answer the dramatic question, and the resolution must be brief — the audience's attention drops off a cliff once the question is answered, and every additional minute is spent from a shrinking account.`,
          watchAlong: {
            ...PD.hisGirlFriday,
            start: '00:00',
            end: '92:00',
            note: 'Map the whole film against the four beats — first plot point, midpoint, low point, climax. It is a fast comedy and the skeleton is completely visible once you look for it.',
          },
          assignment: {
            prompt: 'Take a film you love and write its four structural beats with timecodes. Then write the same four beats for your own short. Shoot the first plot point as a 60-second scene and publish it with both beat sheets in the description.',
            tool: 'FABULA',
            postTag: 'filmschool',
          },
        },
        {
          id: 'fs-write-3',
          title: 'Format: The Page as a Production Document',
          blurb: 'Screenplay format is not etiquette. It is a shared interface with two hundred people.',
          minutes: 16,
          videoId: '_2uZ7IabVOM',
          standardIds: ['FILM.WRITE.3'],
          body: `Screenplay format looks arbitrary until you understand who reads it. A script is not literature delivered to a reader; it is a technical document delivered to a first AD who will break it into a schedule, a line producer who will cost it, a production designer who will build from it, and forty other people who each need to extract a different thing from the same pages. The format exists so that all of them can.

The slugline — INT./EXT., LOCATION, TIME — is the unit the schedule is built from. Every distinct slugline is potentially a distinct setup, and a script full of casual location changes is a script full of expensive days. Writing INT. CAR - NIGHT costs nothing on the page and a great deal on the day.

Action lines are present tense, active, and describe only what the camera can record. "She realises he has been lying" is unfilmable and therefore a note to nobody. "She stops buttering the toast" is filmable and communicates the same thing. This constraint is the single most useful discipline in screenwriting, because it forces you to externalise interiority, which is the whole problem of the medium.

Dialogue is set in a narrow column, which is why one page runs roughly one minute — the format is calibrated so that page count is a time estimate. That calibration only holds if you respect the format. And use parentheticals sparingly: a parenthetical instructs an actor how to read a line, which is both the director's job and the actor's, and a script littered with them reads as a writer who does not trust the line.

The unglamorous truth is that clean format is a competence signal. A reader with sixty scripts to get through will use anything to reduce the pile.`,
          resources: [
            { label: 'IMSDb — produced screenplays to read for format', url: 'https://www.imsdb.com/' },
          ],
          assignment: {
            prompt: 'Write three properly formatted pages containing no unfilmable description at all — nothing about what anyone thinks, knows, realises or remembers. Then shoot page one and publish it.',
            tool: 'FABULA',
            postTag: 'filmschool',
          },
        },
        {
          id: 'fs-write-4',
          title: 'The Scene: Conflict, Turn, and Getting Out Early',
          blurb: 'A scene where nothing changes is a scene that will be cut in post. Cut it now instead.',
          minutes: 20,
          videoId: 'ba-CB6wVuvQ',
          standardIds: ['FILM.WRITE.4'],
          body: `A scene is a unit of change. Something is true at the top and a different thing is true at the bottom, and the difference is what the scene is for. The most reliable diagnostic in screenwriting is to write the top-state and bottom-state of every scene on an index card. Any card where the two match is a scene that does not exist yet, no matter how good the dialogue is.

Change comes from opposed intentions. Two characters want different outcomes from the same conversation, and they use tactics against each other until one of them wins, loses, or is forced to change approach. The moment the tactic changes is a beat. The moment the state changes is the turn. A well-built scene usually has several beats and one turn.

Enter late and leave early. The audience does not need the greeting or the goodbye; they will fill both in without noticing. Start the scene at the last possible moment before the conflict is live and cut out of it on the turn — ideally one line before the turn is fully articulated, so the audience completes it. Scenes that overstay do not merely waste time; they release the tension you spent the scene building.

Obsession scenes are the extreme case worth studying, because their conflict is often internal and the writer has to externalise it into something two people can fight about. The pressure comes from the antagonist making a demand that is simultaneously monstrous and, on the film's own terms, correct. That is a much harder scene to write than a scene where the antagonist is simply wrong, and it is why those films stay in the argument for years.`,
          watchAlong: {
            ...PD.scarletStreet,
            start: '00:00',
            end: '30:00',
            note: 'Lang writes scenes where the power shifts inside a single exchange. Mark the turn in each of the first six scenes — the exact line after which the state is different.',
          },
          assignment: {
            prompt: 'Write and shoot a 2-minute scene with two people, one location, opposed objectives, and a turn you can point to. Publish it with the top-state and bottom-state written in the description.',
            tool: 'FABULA',
            postTag: 'filmschool',
          },
        },
        {
          id: 'fs-write-5',
          title: 'Dialogue and Subtext',
          blurb: 'People almost never say what they want. Write what they say instead.',
          minutes: 20,
          videoId: 't82JiuEGJVA',
          standardIds: ['FILM.WRITE.5'],
          body: `Bad screen dialogue has a signature: everyone is articulate about their own feelings, everyone answers the question they were asked, and everyone speaks in the same rhythm. Real speech does none of these. People evade, deflect, over-explain the irrelevant thing, and answer a question with a question. Subtext is not a literary flourish; it is the ordinary condition of human conversation, and dialogue that lacks it reads as false long before an audience can say why.

The mechanical route to subtext is to write the confrontation twice. First write the version where both characters say exactly what they mean — this is the scene's spine and it is unusable. Then rewrite it as a conversation about something else entirely, where the real subject is only ever adjacent. The first version tells you what the scene is about. The second version is the scene.

The other essential test is character-specificity: cover the character names and read the dialogue. If you cannot tell who is speaking, you have written one voice with several names. Voice comes from vocabulary, sentence length, what a character notices, and above all what they refuse to talk about.

Then there is rhythm. Dialogue is heard, not read, and the best screen dialogue is written for the ear — repetition, interruption, and the deliberate withholding of the expected word. Some writers build long, rhetorical, musical speeches; others build clipped exchanges where the meaning is entirely in the gaps. Both work. What does not work is dialogue with no rhythmic intention at all, which is what you get when you write only for information.`,
          watchAlong: {
            ...PD.charade,
            start: '00:00',
            end: '30:00',
            note: 'Every exchange between Grant and Hepburn is a flirtation conducted entirely as a discussion of something else. Nobody states an intention. Everybody transmits one.',
          },
          assignment: {
            prompt: 'Write a breakup scene in which the word "leave" and the word "love" never appear and the couple discuss only a household object. Shoot it. Publish with your "on the nose" first draft in the description so the class can see both.',
            tool: 'FABULA',
            postTag: 'filmschool',
          },
        },
        {
          id: 'fs-write-6',
          title: 'Character: Want, Need, Wound, and the Lie',
          blurb: 'The gap between what a character is chasing and what would actually help them is the story.',
          minutes: 20,
          videoId: 'bgLSgFDMF1k',
          standardIds: ['FILM.WRITE.6'],
          body: `A protagonist has two objectives and only knows about one. The want is external, conscious, and pursued — the money, the title, the person, the revenge. The need is internal, usually unconscious, and is the change that would actually resolve their life. Plot is generated by the want. Meaning is generated by the need. A film that has only a want is an exercise; a film that has only a need is a mood piece.

Underneath the need sits the wound and the lie. Something happened, and from it the character extracted a false general rule about how the world works — that people leave, that weakness is fatal, that they are not the kind of person who gets this. The lie is load-bearing: it explains the behaviour that makes them difficult, and it explains why the sensible solution is unavailable to them. Without a lie, a competent protagonist would resolve most films by the twenty-minute mark, and audiences feel that even when they cannot articulate it.

The climax is where want and need collide. The strongest ending puts the protagonist in a position where they can have the want only by keeping the lie, and can have the need only by giving the want up. Whether they choose correctly is the film's argument. A protagonist who gets everything without a cost has not been tested; a protagonist who loses everything without a change has been punished, not developed.

Supporting characters are most useful when built as arguments about the same question. The mentor is who the protagonist could become, the antagonist is who they will become if the lie holds, and the ally has already solved this. Cast the theme, not just the plot.`,
          watchAlong: {
            ...PD.scarletStreet,
            start: '30:00',
            end: '102:00',
            note: 'A protagonist whose lie about himself is never dislodged, and who is destroyed by it. Watch the second half as a case study in the un-healed wound.',
          },
          assignment: {
            prompt: 'Write a one-page character document for your protagonist: want, need, wound, lie, and the single moment where the lie will be tested. Shoot the wound as a 45-second wordless flashback and publish it with the document.',
            tool: 'FABULA',
            postTag: 'filmschool',
          },
        },
        {
          id: 'fs-write-7',
          title: 'The Rewrite',
          blurb: 'The first draft exists to be diagnosed, not defended.',
          minutes: 18,
          standardIds: ['FILM.WRITE.7'],
          body: `Writing is rewriting, which is such a common saying that it has stopped meaning anything. Here is the operational version: a rewrite is not a polish pass. It is a sequence of specific passes, each of which looks at one thing across the whole script and ignores everything else.

A structural pass, done on index cards or a wall, with one card per scene. You are looking for scenes with no state change, sequences where the same beat happens twice in different clothes, and a second act whose midpoint you cannot point to. This pass is brutal and usually removes 15% of the script.

A character pass, one character at a time, reading only their scenes in order. Does their behaviour follow a line? Do they have a voice? Does the supporting cast argue with the theme or just deliver plot? Characters who exist only to hand over information can usually be merged with someone who has a stake.

A dialogue pass, out loud, ideally with other people reading. Everything unspeakable, over-explained, or repeated is exposed within seconds when it is heard rather than read. This pass is also where you cut the first and last lines of most scenes.

A production pass, wearing the line producer's hat: how many locations, how many night exteriors, how many speaking roles, how many days at sea. Every one of these is a number, and the script that gets made is very often the one whose numbers are survivable.

Then get notes, and learn to read them properly. When someone says a scene is boring they are almost always right about the symptom and almost always wrong about the cause. Take the diagnosis, discard the prescription.`,
          assignment: {
            prompt: 'Run a full structural pass on your own short script using cards, photograph the wall, and shoot the one scene you cut and the one scene you added. Publish both with a note on what the pass revealed.',
            tool: 'FABULA',
            postTag: 'filmschool',
          },
        },
        {
          id: 'fs-write-8',
          title: 'Writing Comedy: Structure, Not Jokes',
          blurb: 'A gag is built like a scene — setup, escalation, and a turn you did not see coming.',
          minutes: 20,
          videoId: 'UWEjxkkB8Xs',
          standardIds: ['FILM.WRITE.8'],
          body: `Comedy is the most structural of all genres, which is the opposite of how it is usually taught. A joke has an architecture: an expectation is built, the audience commits to it, and the payoff arrives from an angle the expectation made invisible. The laugh is the sound of a model being corrected. If the setup is weak, there is nothing to correct and no laugh, however clever the punchline.

Visual comedy is the purest form of this because it removes language from the equation and leaves only cause and effect. Keaton's method was to construct a genuine physical logic, teach it to the audience early, and then let it operate correctly to an absurd conclusion. The audience laughs because the world was consistent — the gag is funny precisely because it is not a cheat. This is why the camera does not cut inside the gag: a cut introduces the possibility of a trick, and the trick is what would kill it.

The rule of three is the compressed version of the same architecture. Two instances establish a pattern, the third breaks it. Fewer than two and there is no pattern; more than three and the audience is ahead of you.

Escalation in comedy has to be structural, exactly as it is in drama: the character's solution creates the next, worse problem, and their commitment to the solution is the engine. The funniest sequences are the ones where a completely reasonable person makes a series of individually defensible decisions and arrives somewhere insane.

And comedy is a timing medium, which means it is finally an editing problem. A frame or two changes everything, and you cannot know where those frames are until you have an audience.`,
          watchAlong: {
            ...PD.sherlockJr,
            start: '00:00',
            end: '45:00',
            note: `${SILENT_NOTE} The projection-booth dream sequence is one of the most sophisticated pieces of formal comedy ever made — and it is a gag about film grammar itself.`,
          },
          assignment: {
            prompt: 'Build one wordless gag with a clear setup, an established rule, and a payoff that obeys the rule. Sixty seconds, no dialogue, minimum cuts inside the gag.',
            tool: 'FABULA',
            postTag: 'filmschool',
          },
        },
      ],
    },

    // ── DIRECTING ────────────────────────────────────────────────────────────
    {
      id: 'directing',
      title: 'Directing',
      blurb: 'Turning a script into a series of decisions: coverage, blocking, composition, performance, and knowing what the film is about.',
      level: 'INTERMEDIATE',
      lessons: [
        {
          id: 'fs-dir-1',
          title: 'The Director\'s Actual Job',
          blurb: 'Not "having a vision" — answering several hundred questions a day consistently.',
          minutes: 18,
          standardIds: ['FILM.DIR.1'],
          body: `The romantic account of directing is vision. The working account is arbitration. On any given day, a few hundred people will ask you questions — which shirt, how loud, from where, how fast, do we go again — and the film is the sum of your answers. The reason a "vision" matters is not that it inspires anyone; it is that it makes the answers consistent, which is the only way a film ends up feeling like one object rather than a compromise between departments.

So the first work is not shot lists. It is reduction. What is this film about, in one sentence, expressed as a claim rather than a subject? Not "it's about brothers" but "loyalty to family is a kind of cowardice." Once you have that sentence, most of the day's questions answer themselves, because you can ask whether an option supports the claim or dilutes it. Directors who cannot state the claim end up making every decision on its local merits, and the local merits always point toward the safe option.

The second is preparation as freedom. The point of a shot list is not to execute it; it is to have already thought about the scene so thoroughly that when the location floods, the lead is ill, or the actor finds something better than what you wrote, you can throw the plan away and still know what you are protecting. Under-prepared directors improvise from panic. Prepared directors improvise from priority.

The third is knowing what only you can do. Anyone can be told where to put the camera. Only the director can decide whether the take was true. Protect your attention for that.`,
          watchAlong: {
            ...PD.stranger,
            start: '00:00',
            end: '95:00',
            note: 'Welles directing under studio supervision with a modest budget — a good study in what a strong governing idea buys you when resources do not.',
          },
          assignment: {
            prompt: 'Write your film\'s claim in one sentence. Then list ten concrete decisions (a costume, a lens, a location, a cut) and justify each against the claim. Shoot the scene that most directly makes the claim.',
            tool: 'FABULA',
            postTag: 'filmschool',
          },
        },
        {
          id: 'fs-dir-2',
          title: 'Coverage, Blocking, and the Shot List',
          blurb: 'Design the scene, then decide how much of it you need on film.',
          minutes: 22,
          videoId: '5UE3jz_O_EM',
          standardIds: ['FILM.DIR.2'],
          body: `Coverage is the set of shots that lets a scene be cut. The traditional pattern — a master wide, then matching mediums, then singles — is a safety system: shoot enough angles and the scene can always be assembled. It is also an aesthetic default with a strong gravitational pull, and shooting it thoughtlessly is how films end up feeling like television.

The alternative is to start from blocking. Stage the scene with the actors before deciding anything about the camera, and watch where the power moves. Then design shots that capture the blocking's argument rather than merely recording its participants. If the scene is about one character gradually occupying the other's space, a symmetrical shot-reverse-shot pattern will flatten exactly the thing the scene is about.

Shot-reverse-shot is worth studying precisely because it is the default. It works by alternating over-the-shoulder singles on a consistent axis, and its power comes from the fact that it disappears — which means every departure from it is loud. Directors who hold the two-shot instead of cutting to singles are making a statement about the characters being unable to escape each other. Directors who break the symmetry — giving one character clean singles and the other only over-the-shoulders — are stacking the deck, and the audience feels it without knowing it.

Practically: block first, list second, and mark on the list which shots are the scene and which are insurance. When you lose time — and you will — you cut insurance. Directors who have not marked their list cut whatever is next, which is often the scene.`,
          watchAlong: {
            ...PD.hisGirlFriday,
            start: '45:00',
            end: '75:00',
            note: 'Hawks blocks large groups in depth in the newsroom and covers it economically. Count how few setups he actually uses for how much apparent chaos.',
          },
          assignment: {
            prompt: 'Block a three-person scene before choosing a single camera position, and photograph the blocking as an overhead diagram. Then shoot it in no more than five setups. Publish the diagram with the scene.',
            tool: 'FABULA',
            postTag: 'filmschool',
          },
        },
        {
          id: 'fs-dir-3',
          title: 'Composition and Perspective',
          blurb: 'Where you put the frame around the world is an argument about order.',
          minutes: 20,
          videoId: 'N2yqw7qGrgU',
          standardIds: ['FILM.DIR.3'],
          body: `Composition is the arrangement of the visual field inside a fixed rectangle, and the rectangle is doing a great deal of work before you place anything in it. The frame excludes. What is outside it is as much a choice as what is inside, and off-screen space — the thing we can hear but not see, the character we know is standing just past the edge — is one of the most efficient tension devices in the medium.

The classical tools are balance, leading lines, depth, and negative space. Balance is the distribution of visual weight; an unbalanced frame produces low-level unease, which is useful when you want it and corrosive when you do not. Leading lines route the eye, and the eye follows them whether or not you intended it. Depth — layering foreground, mid and background — converts a flat image into a space the audience believes they could walk into. Negative space around a figure reads as isolation, and tightening it reads as pressure.

One-point perspective is the extreme case worth studying: a rigorously symmetrical frame with a single vanishing point produces a very specific feeling of order imposed on a world, which is why it reads as institutional, inevitable, and slightly wrong. It is a compositional strategy that carries an argument — that the character is inside a system — and directors who use it heavily are usually making that argument for the whole film.

The discipline is to compose deliberately rather than acceptably. An acceptable frame is one where the subject is visible and nothing is distracting. A composed frame is one where the arrangement itself says something. The difference between them is most of the difference between competent and good.`,
          watchAlong: {
            ...PD.caligari,
            start: '20:00',
            end: '52:00',
            note: `${SILENT_NOTE} Every frame is composed as a graphic design. Extreme, but it makes composition impossible to overlook.`,
          },
          assignment: {
            prompt: 'Shoot ten still frames from your own short, each demonstrating one compositional idea (depth, negative space, symmetry, leading lines, imbalance). Publish as a sequence with one line each on the argument the frame makes.',
            tool: 'FABULA',
            postTag: 'filmschool',
          },
        },
        {
          id: 'fs-dir-4',
          title: 'Camera Movement as Meaning',
          blurb: 'Every move should change what the audience knows or feels. Otherwise hold.',
          minutes: 20,
          videoId: 'IiyBo-qLDeM',
          standardIds: ['FILM.DIR.4'],
          body: `Camera movement divides into moves that change the camera's position and moves that change only the lens. This distinction matters more than the vocabulary suggests. A dolly physically travels through space, so the relationship between foreground and background changes as it goes — parallax — and the audience reads the space as real and three-dimensional. A zoom changes magnification without travelling, so the planes stay locked together, and the effect is flatter, more artificial, more like an act of noticing than an act of moving. That is why a zoom often feels like an authorial comment and a dolly often feels like an emotional approach.

The basic moves: pan and tilt rotate on a fixed head, and are cheap and neutral. A dolly or tracking shot travels. A crane changes height and usually changes the audience's relationship to the whole scene, which is why cranes are so often used to open and close films — they convert a person into a world or a world into a person. A handheld camera introduces an operator's body into the image and therefore a witness. A Steadicam removes the body while keeping the travel, producing a gliding, slightly dreamlike observation that belongs to nobody.

The combination move worth knowing is the dolly zoom: track in while zooming out (or the reverse), so the subject stays the same size while the background expands or collapses. Because it changes perspective without changing scale, it produces a sensation with no real-world equivalent, which is why it reads as vertiginous or as a realisation.

The rule stays the same as in Foundations: finish the sentence "the camera moves here because the audience needs to ______." If you cannot, lock it off. Stillness is a choice too, and an underused one.`,
          assignment: {
            prompt: 'Shoot the same emotional beat four times — locked off, pan, push in on a dolly (or slider/phone gimbal), and handheld. Publish all four and argue in the description for which one is right and why.',
            tool: 'FABULA',
            postTag: 'filmschool',
          },
        },
        {
          id: 'fs-dir-5',
          title: 'Directing Actors',
          blurb: 'Give actions, not adjectives. Build the room where failure is safe.',
          minutes: 22,
          standardIds: ['FILM.DIR.5'],
          body: `The most common failure in directing actors is the result note: "be angrier," "make it sadder," "more energy." These describe the outcome you want and give the actor nothing to do, so the actor is left to manufacture the appearance of the emotion — which is precisely the thing that reads as bad acting. The fix is to give playable notes: an action, a piece of information, or a change in circumstance.

Actions are verbs directed at the other person. Instead of "be angrier," try "get him to apologise before he leaves the room." Instead of "sadder," try "make her stop looking at you." The actor now has something to do, and the emotion arrives as a by-product, which is the only way it ever arrives convincingly.

Information is the second lever: give the actor a fact their character knows that the audience does not. "You've already decided to leave tonight" will change a performance more than twenty adjectives. Circumstance is the third: change what the character is physically doing, what they want from the room, what happened ten minutes before the scene began.

The other half of the job is safety. An actor is being asked to be publicly bad on the way to being good, in front of sixty people who are being paid by the hour. If they believe failure is expensive, they will play safe and you will get competence, which is the enemy. Protect the set, keep the note private, never give a note through someone else, and never give a note in front of the crew that could embarrass. Then, when they find something better than what you wrote — and they will — take it. Recognising the right accident is a large part of the craft.`,
          watchAlong: {
            ...PD.charade,
            start: '30:00',
            end: '70:00',
            note: 'Two enormous stars playing an entire film in a very light register. Watch how much is carried by listening rather than by delivery.',
          },
          assignment: {
            prompt: 'Direct one actor through the same short monologue three times using only action verbs — never an emotion word. Publish all three takes and list the verbs you used for each.',
            tool: 'FABULA',
            postTag: 'filmschool',
          },
        },
        {
          id: 'fs-dir-6',
          title: 'Precision, Repetition, and Knowing When You Have It',
          blurb: 'Some directors shoot fifty takes. The reason is not perfectionism.',
          minutes: 18,
          videoId: 'QPAloq5MCUA',
          standardIds: ['FILM.DIR.6'],
          body: `There are two theories of the take. The first says the early takes contain the actor's freshest instinct and the job is to catch it before it becomes a performance of itself. The second says the early takes are the actor's ideas about the scene, and the real behaviour only emerges once those ideas are exhausted. Both are true of different actors and different scenes, and knowing which you are in is a director's judgement you build by watching.

Directors who shoot very high take counts are usually working from the second theory, and it is not arbitrary. The aim is to wear away the actor's self-consciousness and the decoration — the little gestures, emphases and pauses that are added to make the line "read" — until what is left is only the behaviour. It is expensive, and it requires an actor who trusts you, and it does not work at all if the notes are not changing between takes. Repetition without adjustment is just fatigue.

Precision extends past performance. It is the willingness to say that a frame is two inches off, that the extra in the background crossed a beat early, that the object should be on the other side of the table. These are the things audiences never consciously notice and always feel, because a frame in which one element is wrong is a frame the eye keeps returning to.

The counterweight is knowing when you have it. A director who cannot recognise the take will burn the day and demoralise the room. The practical test is whether you have stopped watching the technique and started believing the person. When that happens, print it and move.`,
          assignment: {
            prompt: 'Shoot one scene for at least fifteen takes, changing exactly one note per take and logging it. Publish take 2, take 8, and your chosen take, plus the log.',
            tool: 'FABULA',
            postTag: 'filmschool',
          },
        },
        {
          id: 'fs-dir-7',
          title: 'Directing Action and Physical Comedy',
          blurb: 'Geography, legibility, and the wide shot that proves it really happened.',
          minutes: 20,
          videoId: 'Z1PCtIaM_GQ',
          standardIds: ['FILM.DIR.7'],
          body: `Action is a comprehension problem before it is a spectacle problem. The audience must always know where everyone is, what they want, and what would count as winning. Sequences that read as "chaotic" in the bad sense have usually failed at that geography, and no amount of cutting speed fixes it — cutting speed is what caused it.

The principles are borrowed almost wholesale from physical comedy, which solved them first. Establish the space in a wide shot so the audience has a map. Keep screen direction consistent so pursuers stay on one side. Shoot wide enough and hold long enough that the audience can see the body doing the thing, because the shot is also the evidence — the moment you cut, you introduce doubt about whether it happened. Let the impact land in the frame rather than in the cut.

Comic and dramatic action differ mainly in rhythm and in who the audience is aligned with, not in construction. Both are built as escalating sequences of small units, each with a setup and a payoff, each raising the stakes over the last, and both die if the units are simply louder rather than worse.

The most common beginner error is coverage panic — shooting a fight from twelve angles and cutting every eight frames in the hope that energy will emerge from the assembly. Energy comes from clarity and from the performer's actual competence. Fewer, longer, wider shots demand more of your performers and give you far more. If you cannot get the performance, choreograph a simpler action rather than hiding a complex one in the edit.`,
          watchAlong: {
            ...PD.general,
            start: '20:00',
            end: '75:00',
            note: `${SILENT_NOTE} An entire feature-length chase with total geographic clarity, no dialogue and almost no cutting inside the stunts.`,
          },
          assignment: {
            prompt: 'Stage a 45-second chase or fight in no more than eight shots, with an establishing wide and consistent screen direction. No cut inside the biggest beat.',
            tool: 'FABULA',
            postTag: 'filmschool',
          },
        },
        {
          id: 'fs-dir-8',
          title: 'Tone: Holding One Note Across a Hundred Days',
          blurb: 'The hardest thing to sustain, and the first thing an audience notices when it slips.',
          minutes: 18,
          standardIds: ['FILM.DIR.8'],
          body: `Tone is the film's attitude toward its own material — how seriously it takes itself, how much distance it keeps, whether it invites you to laugh, and whether the laugh is with the characters or at them. It is established in the first three minutes and it is the thing an audience is least willing to forgive you for breaking.

It is also structurally difficult because a film is shot out of order over months by departments who each read the script differently. The composer's idea of "wry" is not the production designer's. The only defence is a shared reference vocabulary established before the shoot: a look book, a temp score, a small set of films that everyone watches, and — most usefully — a list of things this film is not. Negative definitions travel better than positive ones. "Not whimsical, ever" is an instruction a costume designer can act on.

Tonal range is different from tonal inconsistency. A film can move between comedy and horror, and many of the best do, but the moves have to be prepared and the underlying attitude has to hold. What breaks a film is not the change of register; it is the sense that the film did not know it was changing.

The practical test to run in the edit: watch any three-minute stretch with someone who has not read the script and ask them what kind of film this is. If different stretches produce different answers, you have a tone problem, and it will usually be fixed with music, pace and performance selection rather than with reshoots.`,
          watchAlong: {
            ...PD.livingDead,
            start: '00:00',
            end: '30:00',
            note: 'A film that establishes a bleak, documentary-flat tone in its first reel and never once wavers from it, on almost no money.',
          },
          assignment: {
            prompt: 'Write a one-page tone document for your film with five "this film is not ___" statements. Shoot a 60-second scene that could only belong to that tone, and publish both.',
            tool: 'FABULA',
            postTag: 'filmschool',
          },
        },
      ],
    },

    // ── CINEMATOGRAPHY ───────────────────────────────────────────────────────
    {
      id: 'cinematography',
      title: 'Cinematography',
      blurb: 'Exposure, lens, light, and colour — the craft of deciding what the camera actually records.',
      level: 'INTERMEDIATE',
      lessons: [
        {
          id: 'fs-cine-1',
          title: 'Exposure: Aperture, Shutter, ISO',
          blurb: 'Three controls, and each one has a side effect that is really an aesthetic decision.',
          minutes: 20,
          standardIds: ['FILM.CINE.1'],
          body: `Exposure is the amount of light reaching the sensor, and three controls govern it. What makes them interesting is that each has a side effect, and the side effects are the actual creative content.

Aperture — the f-stop — is the size of the lens opening. It controls how much light passes, and its side effect is depth of field. A wide aperture (a low number like f/1.8) admits a lot of light and renders a shallow slice of the world in focus, isolating a subject against a soft background. A narrow aperture (f/11, f/16) admits less and holds everything sharp from foreground to horizon, which is what deep-focus photography is built on. Shallow focus tells the audience what to look at. Deep focus lets them choose, and therefore lets you stage meaning in the background.

Shutter — expressed as an angle or a fraction — controls how long each frame is exposed, and its side effect is motion blur. The convention is the 180-degree shutter: a shutter speed of roughly double the frame rate, so at 24fps you sit near 1/48th. This produces the motion blur audiences have read as "cinematic" for a century. Halve it and motion becomes staccato and harsh, which is why battle sequences sometimes use it. Open it further and motion smears.

ISO is sensor sensitivity, and its side effect is noise. Modern cameras have dual native ISOs where noise performance is best; learning yours is worth more than any filter.

Because all three interact, exposure is always a negotiation. The professional habit is to decide the side effect first — I want this depth of field, I want this motion — and then solve the exposure with light and ND filtration rather than compromising the look to make the meter happy.`,
          assignment: {
            prompt: 'Shoot the same shot at f/1.8 and f/11, and at 1/48 and 1/500, matching exposure with light or ND. Publish the four clips labelled, and describe what each one does to the meaning of the shot.',
            tool: 'FABULA',
            postTag: 'filmschool',
          },
        },
        {
          id: 'fs-cine-2',
          title: 'Lenses: Focal Length and the Shape of a Face',
          blurb: 'The lens decides how far away the audience feels, independent of where the camera is.',
          minutes: 20,
          standardIds: ['FILM.CINE.2'],
          body: `Focal length is usually explained as magnification, which is the least interesting thing about it. The consequential effect is what it does to the relationship between planes and to the human face.

A wide lens (say 18–28mm on full frame) exaggerates depth. Objects near the camera become large and distant objects recede quickly, so space feels stretched and movement toward or away from the camera feels fast and dramatic. Put a face close to a wide lens and the nose enlarges and the ears fall away — the face is distorted, which reads as unsettling, comic, or aggressive. Wide lenses put the audience inside the space.

A long lens (85mm and up) compresses. Planes stack together, distant objects loom, and movement toward camera appears to make no progress — which is why the "running but getting nowhere" shot is always long. On a face, a long lens flattens features into something conventionally flattering and slightly remote. Long lenses put the audience at a distance, observing.

Around 40–50mm sits the approximate normal, which renders roughly the perspective relationship the eye expects and therefore reads as neutral.

The practical corollary is that framing and perspective are separable. A close-up can be shot wide from six inches away or long from twenty feet, and those are entirely different shots that occupy the same space on a shot list. Directors who do not know this end up with a lens choice made by whoever is holding the camera.

Then there is the lens's character: how it renders flare, bokeh, edge sharpness and contrast. Vintage glass is prized for imperfection, because perfect resolution is often less expressive than a controlled flaw.`,
          watchAlong: {
            ...PD.stranger,
            start: '30:00',
            end: '70:00',
            note: 'Welles built a career on wide lenses and deep focus. Watch how much of the drama is staged in depth rather than delivered by cutting.',
          },
          assignment: {
            prompt: 'Shoot the same close-up at your widest and longest focal lengths, moving the camera to keep the framing identical. Publish both — the framing matches and the two shots mean different things.',
            tool: 'FABULA',
            postTag: 'filmschool',
          },
        },
        {
          id: 'fs-cine-3',
          title: 'Lighting: Key, Fill, Back and the Ratio Between Them',
          blurb: 'The three-point setup is not a look. It is a chassis you deform on purpose.',
          minutes: 22,
          videoId: 'n1EKLvdUSac',
          standardIds: ['FILM.CINE.3'],
          body: `Three-point lighting is taught as a formula and is better understood as a chassis. The key light is the dominant source and establishes the direction the light is coming from; the fill light sits opposite and controls how deep the shadow side goes; the back or rim light separates the subject from the background by drawing a line of light along the edge.

The expressive control is the key-to-fill ratio. A low ratio — fill nearly as bright as key — produces flat, even, information-rich light with almost no shadow: high-key. It is the light of comedy, of sitcoms, of daytime, of openness, because nothing is concealed. A high ratio — little or no fill — produces deep black shadow across half the face: low-key. It is the light of noir and horror, because it literally withholds information, and an audience reads withheld information as threat.

Quality is the second variable. Hard light comes from a small source relative to the subject and produces sharp-edged shadows; soft light comes from a large source (a bounced or diffused one) and produces gradual shadow transitions. Sunlight is hard; an overcast sky is soft. Hard light is dramatic and unforgiving, soft light is naturalistic and flattering, and the size of the source relative to the subject is what determines it — not the wattage.

Direction is the third. Front light flattens, side light sculpts, back light silhouettes, and light from below inverts every expectation the human face has about where light comes from, which is why it reads as monstrous.

The habit to build is to find the motivating source first — where would light be coming from in this room? — and then shape the actual lighting to serve the story while remaining consistent with that source. Motivated does not mean realistic. It means legible.`,
          watchAlong: {
            ...PD.scarletStreet,
            start: '00:00',
            end: '40:00',
            note: 'Lang lighting noir: very high key-to-fill ratios, hard sources, and shadow used as an active compositional element rather than as an absence.',
          },
          assignment: {
            prompt: 'Light one face four ways with a single lamp plus a bounce card: high-key soft, low-key hard, side-lit, under-lit. Publish all four as a single clip and name the genre each one implies.',
            tool: 'FABULA',
            postTag: 'filmschool',
          },
        },
        {
          id: 'fs-cine-4',
          title: 'Available Light, Night, and Shooting With Nothing',
          blurb: 'Constraint-driven cinematography, which is the kind you will actually be doing.',
          minutes: 18,
          standardIds: ['FILM.CINE.4'],
          body: `Most films you make in the next five years will be lit with whatever is there plus one or two units. This is not a lesser discipline; it is where the most useful skills are built, because it forces you to see light rather than install it.

Start by learning to read a location. Where is the light coming from, how hard is it, what colour is it, and where does it fall off? A room with one large window is a soft key with a natural falloff — position the actor relative to that window and you have lit the scene. Move them two feet and the ratio changes completely. Negative fill — putting something black on the shadow side to absorb bounce — is free and is often more useful than adding a light, because it deepens contrast without adding a source.

Time of day is the largest lever you have and it costs nothing. The hour after sunrise and before sunset gives you soft, warm, low-angle light that makes almost anything look intentional. Overcast is a giant softbox. Midday sun is the enemy, and the fix is to move into open shade and use the sky as your source.

Night is the genuine problem, because sensors need light and night is defined by its absence. The professional answer is that screen night is not darkness — it is high-contrast light with visible sources and deep, clean shadows. Find practicals you can put in frame (lamps, signs, phone screens, car headlights), expose for the faces, let the surroundings fall away, and accept that motivated pools of light read as night far better than an evenly dim image does.

Above all, protect your exposure. Underexposed digital shadows are noise, and noise cannot be graded out.`,
          watchAlong: {
            ...PD.livingDead,
            start: '30:00',
            end: '96:00',
            note: 'Black-and-white, practically no budget, largely one house at night. A masterclass in contrast doing the work that money would otherwise do.',
          },
          assignment: {
            prompt: 'Shoot a two-minute night exterior or interior using only practical sources that appear in frame. No film lights. Publish it with a lighting diagram of where each practical sat.',
            tool: 'FABULA',
            postTag: 'filmschool',
          },
        },
        {
          id: 'fs-cine-5',
          title: 'Colour: Temperature, Palette, and Grading',
          blurb: 'Colour is the fastest emotional channel in the image and the easiest to use badly.',
          minutes: 20,
          videoId: 'lINVnA3rVIE',
          standardIds: ['FILM.CINE.5'],
          body: `Colour operates on an audience faster than composition and almost as fast as sound, and it works whether or not anyone is paying attention. Three things are worth separating: temperature, palette, and grade.

Temperature is the physical colour of light, measured in kelvin. Tungsten sits around 3200K and reads warm; daylight sits near 5600K and reads cool; overcast and shade are cooler still. Your camera's white balance decides which source is rendered as neutral, and everything else shifts relative to that. This is a creative decision disguised as a technical one: balancing for tungsten and letting the window go blue is how you get the classic warm interior against a cold outside, and it is a choice, not a correction.

Palette is the set of colours you allow into the frame across the whole film — a production design and costume decision made long before the camera arrives. Restriction is what makes a palette read. A film in which every colour appears has no palette; a film restricted to earth tones and one saturated accent has a language, and the accent means something whenever it appears. This is the mechanism behind every famous single-colour intervention in a monochrome film.

Grade is what happens in post, and it is powerful enough that it tempts people to defer decisions to it. Resist that. Grading can shift, contrast, and unify, but it cannot invent information the sensor never captured, and a film "fixed" in the grade usually looks it. Shoot the image you want, then grade to unify and to push.

The warm-skin-against-cool-background convention is worth knowing as the default it has become, and worth departing from for exactly that reason.`,
          assignment: {
            prompt: 'Choose a three-colour palette and shoot a 60-second scene where every element on screen obeys it, then grade it two ways — warm and cool. Publish both and state which serves the scene.',
            tool: 'FABULA',
            postTag: 'filmschool',
          },
        },
        {
          id: 'fs-cine-6',
          title: 'Camera Support and Operating',
          blurb: 'The physical instrument: sticks, dolly, gimbal, shoulder — and what each one says.',
          minutes: 16,
          standardIds: ['FILM.CINE.6'],
          body: `How the camera is held is not a logistics detail; it is a voice. Each support system produces a different relationship between the audience and the image, and audiences read them fluently even though almost nobody could name them.

A tripod removes the operator entirely. The frame becomes an objective window, and because nothing wobbles, every movement inside the frame is legible. Locked-off shots are the most underrated tool available to a low-budget filmmaker: they cost nothing, they look composed, and they force you to solve the scene through staging.

A dolly or slider adds travel with no human signature, which reads as fate, or as the film itself taking an interest. A crane or jib adds vertical change and therefore scale.

Shoulder-mounted or handheld reintroduces a body. There is someone there, breathing, reacting, sometimes late to a movement. This reads as immediacy and witness, and it is why documentary and vérité drama use it. The failure mode is meaningless shake: handheld that is not motivated by anyone's attention just looks unstable, and modern audiences read that as amateur rather than urgent.

A gimbal or Steadicam gives travel without a body — smooth, floating, unattributable movement. It is spectacular and slightly unreal, and it belongs to nobody, which is exactly the problem when a scene needs a point of view.

The operating skill itself is undertaught: holding a frame while a subject moves, leading rather than chasing, keeping headroom and lead room consistent, and starting and stopping a move so that the beginning and end are both usable in an edit. That last point is practical — an editor cannot use a move whose start is soft and whose stop drifts.`,
          watchAlong: {
            ...PD.movieCamera,
            start: '00:00',
            end: '68:00',
            note: `${SILENT_NOTE} Vertov's film is about the camera as a physical instrument in the world, and it deploys nearly every support technique available in 1929.`,
          },
          assignment: {
            prompt: 'Shoot the same walk-and-talk on a tripod, handheld, and gimbal/slider. Publish all three back to back and describe the point of view each implies.',
            tool: 'FABULA',
            postTag: 'filmschool',
          },
        },
        {
          id: 'fs-cine-7',
          title: 'The Director–DP Partnership',
          blurb: 'The look book, the shot list, and dividing responsibility so nobody is guessing.',
          minutes: 16,
          standardIds: ['FILM.CINE.7'],
          body: `The relationship between a director and a cinematographer is the most consequential creative partnership on a film, and the most commonly mishandled by beginners — usually by the director either abdicating the image entirely or micromanaging it into an executed shot list with no contribution.

The productive division is roughly: the director owns what the scene is about and where the audience's attention should be; the DP owns how the image achieves that. A director who says "this shot should feel like she's being observed" has given a brief. A director who says "put a 35 on the B camera at eye level with a half-CTB on the key" has hired an operator, not a cinematographer, and has thrown away the value of the other person's twenty years.

The tools that make this work are shared references established early. A look book — images, film stills, paintings, photographs — is not decoration; it is the vocabulary you will both use for three months, and building it together means "we said no to this kind of image" is a sentence with meaning. Watching two or three films together and discussing them specifically is worth more than a dozen abstract conversations about mood.

On the day, the useful protocol is that the director blocks with the actors first, the DP watches, and then the two of them design the coverage from what the blocking revealed. This order matters enormously: designing the shots first and then forcing the actors into them is how films end up feeling posed.

Finally, agree explicitly on who talks to whom. The DP runs the camera and lighting departments; a director who gives notes directly to the gaffer will get a fast result today and an incoherent image by week three.`,
          assignment: {
            prompt: 'Build a 12-image look book for your next project with a written rule for each image ("light is always motivated by a practical", "no handheld indoors"). Shoot one scene that obeys every rule, and publish the look book with it.',
            tool: 'FABULA',
            postTag: 'filmschool',
          },
        },
      ],
    },

    // ── EDITING ──────────────────────────────────────────────────────────────
    {
      id: 'editing',
      title: 'Editing',
      blurb: 'Where the film is actually written: the cut point, rhythm, montage, and the long haul from assembly to lock.',
      level: 'INTERMEDIATE',
      lessons: [
        {
          id: 'fs-edit-1',
          title: 'What an Editor Is Deciding',
          blurb: 'Not "which take" — where the audience should be looking and when.',
          minutes: 18,
          videoId: '3Q3eITC01Fg',
          standardIds: ['FILM.EDIT.1'],
          body: `An editor makes three decisions on every cut: what shot comes next, when to leave the current one, and how long to stay. Everything else — pace, tension, comedy, clarity, coherence — is downstream of those three.

The useful reframe is that a cut is a redirection of attention. The audience is looking somewhere; the cut moves them. A good cut arrives at the moment the audience has finished with the current image and is beginning to want the next one, which means the editor is tracking the viewer's curiosity rather than the script's information. Cut early and the audience feels yanked; cut late and they get ahead of you, and once an audience is ahead of you they start noticing the film instead of watching it.

The second reframe is that editing is where performance is finally constructed. A performance on screen is not what an actor did; it is a selection from what an actor did, assembled across takes, with reactions borrowed from other moments and pauses lengthened or removed. An editor can make a performance more decisive, more hesitant, more sympathetic or more cold without a single new frame being shot, simply by choosing where to cut in and out of a face.

The third is that the edit is the final rewrite, and it is honest in a way the script never was. Everything that does not work is now visible. Scenes that read beautifully turn out to be redundant; a sequence you fought for turns out to be answering a question nobody asked. The discipline is to edit the film you have rather than defending the film you intended, and that requires being able to watch your own material as though you did not make it — which is why editors are so valuable and why directors should not cut alone.`,
          assignment: {
            prompt: 'Take a two-minute scene you shot and cut it twice: once for maximum clarity, once for maximum tension. Same footage. Publish both and describe what moved.',
            tool: 'FABULA',
            postTag: 'filmschool',
          },
        },
        {
          id: 'fs-edit-2',
          title: 'The Rule of Six: What a Cut Owes',
          blurb: 'Walter Murch\'s priority list — and why emotion outranks continuity by a distance.',
          minutes: 20,
          videoId: 'PKYeClvvlTw',
          standardIds: ['FILM.EDIT.2'],
          body: `Walter Murch proposed that a cut serves six things, and — crucially — that they are ranked. The ranking is the useful part, because in practice a cut can rarely satisfy all six and the editor must know what to sacrifice.

First, emotion: does the cut preserve what the audience should be feeling? Murch weighted this at roughly half of the total, above everything else combined. Second, story: does the cut advance what the audience needs to understand? Third, rhythm: is it at the right moment, does it feel right in the body? Fourth, eye-trace: does it respect where the audience's eyes are on screen — cutting to a shot where the point of interest is in a wildly different part of the frame forces a physical search and registers as a jolt. Fifth, two-dimensional plane of the screen: screen direction and the 180-degree line. Sixth, three-dimensional continuity: whether the physical space and action genuinely match.

The radical claim is that the last two — the ones beginners obsess over and the ones film school rules are mostly about — are the least important. A cut that breaks continuity but holds the emotion will play. A cut that is technically immaculate but kills the feeling will not, and no audience will be able to tell you why the scene went dead.

This is liberating and dangerous in equal measure. It is not licence to be sloppy; continuity errors do cost you, and they accumulate. But it settles the argument you will have on nearly every difficult scene, where the only take with the right performance does not match. Take the performance. Fix what you can, hide what you cannot, and trust that the audience is watching the person, not the prop.`,
          assignment: {
            prompt: 'Find a moment in your footage where the best performance take does not match. Cut it both ways — matched-but-flat and unmatched-but-alive — and publish both. Ask viewers which they noticed.',
            tool: 'FABULA',
            postTag: 'filmschool',
          },
        },
        {
          id: 'fs-edit-3',
          title: 'Montage: Meaning Made by Collision',
          blurb: 'Eisenstein\'s claim was that the cut itself generates ideas the shots do not contain.',
          minutes: 22,
          standardIds: ['FILM.EDIT.3'],
          body: `Continuity editing hides the cut. Montage, in the Soviet sense, does the opposite: it puts two shots together specifically so that their collision produces a third thing that exists in neither.

The famous demonstration is the Kuleshov effect. The same neutral close-up of a face, intercut with a bowl of soup, a body in a coffin, and a child, was reported by audiences as expressing hunger, grief and affection. The face never changed. The meaning was manufactured entirely by juxtaposition, in the viewer's head. This is the single most important experimental result in the history of the medium, because it establishes that the audience is not receiving meaning but constructing it — and therefore that the editor's real material is the audience's inference.

Eisenstein built a whole theory on this, arguing for cutting by conflict: conflicting graphics, conflicting directions of movement, conflicting rhythms, conflicting scales. He wanted the cut to be a shock that forces the viewer into an intellectual act rather than a smooth flow that lets them sit back. The Odessa Steps sequence in Battleship Potemkin is the canonical demonstration — it expands time far beyond real duration, cuts on graphic opposition, and constructs a political argument out of fragments.

The everyday inheritance of this is enormous and mostly unacknowledged: every training sequence, every "meanwhile" cut that implies causation, every cut from a decision to its consequence is using juxtaposition to make a claim. When you cut from a character saying "trust me" to a locked door, you have said something neither shot says.

Use it deliberately. The cut is an editorial voice, and it is speaking whether or not you meant it to.`,
          watchAlong: {
            ...PD.potemkin,
            start: '48:00',
            end: '55:00',
            note: `${SILENT_NOTE} The Odessa Steps sequence sits roughly two-thirds through the film — scrub to the massacre on the staircase. Time the real-world event: it could not last as long as the sequence does. That expansion is the point.`,
          },
          assignment: {
            prompt: 'Run your own Kuleshov test. Shoot one neutral close-up and cut it against three different second shots. Publish all three pairs and ask your audience what the person is feeling in each.',
            tool: 'FABULA',
            postTag: 'filmschool',
          },
        },
        {
          id: 'fs-edit-4',
          title: 'Rhythm, Pace, and Time',
          blurb: 'Screen time is elastic. Editing is the instrument that stretches it.',
          minutes: 20,
          videoId: 'oz49vQwSoTE',
          standardIds: ['FILM.EDIT.4'],
          body: `Pace is not speed. A fast-cut sequence can feel interminable and a five-minute unbroken take can feel like thirty seconds. What audiences experience as pace is the rate at which they are receiving new information, not the rate at which shots change. This is the most common misdiagnosis in the edit: a scene feels slow, so it gets cut faster, and it feels slower, because the problem was that nothing was being revealed.

Screen time is fully elastic in both directions. You can compress — a journey of six hours in four shots — or expand, holding a two-second action across a dozen cuts so that it takes twenty seconds and becomes unbearable. Expansion is the more striking tool and the more delicate: it works only when the audience already cares about the outcome, which is why it belongs to climaxes.

Match cuts and graphic matches let you move across time and space without disorientation by handing the eye a continuity of shape or motion — a spinning wheel to a spinning fan, a thrown object to a rising bird. These are among the few places where the cut is meant to be felt as elegance rather than hidden.

Transitions across time also carry tonal information. A hard cut is neutral and modern. A dissolve traditionally implies elapsed time and a softer, more subjective relationship between the two moments. A fade to black is a full stop and should be used as rarely as a full stop in the middle of a paragraph.

The practical test for rhythm is physical: watch the cut and notice where your body relaxes. Wherever you stop leaning in, something is wrong at or slightly before that point — usually earlier than where the boredom registers.`,
          assignment: {
            prompt: 'Cut the same 45 seconds of action twice: once in real time, once expanded to twice the length using overlapping angles. Publish both and note which is more tense and why.',
            tool: 'FABULA',
            postTag: 'filmschool',
          },
        },
        {
          id: 'fs-edit-5',
          title: 'Comedy Editing: Timing Is the Whole Craft',
          blurb: 'Two frames is the difference between a laugh and a silence.',
          minutes: 18,
          videoId: '3FOzD4Sfgag',
          standardIds: ['FILM.EDIT.5'],
          body: `Comedy is the most unforgiving editing discipline because the result is binary and immediate: the audience laughs or does not. There is no partial credit and no way to argue with the outcome.

The core mechanism is expectation and violation, and the editor controls the timing of both. The setup needs enough room for the audience to form the expectation — cut the setup too tight and there is nothing to violate. The payoff usually wants to arrive a beat earlier than feels comfortable, because the surprise is the joke and any delay lets the audience get there first. And after the payoff you must leave room for the laugh, or the next line is lost underneath it — which is why comedies are often re-cut after test screenings with actual audiences, since you cannot know how long the laugh runs until you have heard it.

Cutting is also a joke-delivery device in its own right. A hard cut to an unexpected image is a punchline with no dialogue. A cut away from a reaction just before it completes is funnier than holding on it. The smash cut — abrupt, jarring, mid-action — exists almost entirely for comic effect. Editing that is itself visibly kinetic and precise, where sound effects, whip pans and match cuts arrive on the beat, turns the cutting rhythm into part of the comedy rather than the delivery system for it.

Practically: cut comedy with people in the room, and do not trust your own laughter after the fifth pass — you have lost the ability to be surprised by your own material, which is exactly the faculty being measured.`,
          watchAlong: {
            ...PD.sherlockJr,
            start: '20:00',
            end: '45:00',
            note: `${SILENT_NOTE} Keaton's timing is built in-camera rather than in the cut, which makes it the cleanest possible study of what timing actually is.`,
          },
          assignment: {
            prompt: 'Cut the same gag three times with the payoff arriving 6 frames early, on time, and 6 frames late. Publish all three and let the class vote.',
            tool: 'FABULA',
            postTag: 'filmschool',
          },
        },
        {
          id: 'fs-edit-6',
          title: 'From Assembly to Picture Lock',
          blurb: 'The unglamorous process that turns four hours of material into ninety minutes.',
          minutes: 18,
          standardIds: ['FILM.EDIT.6'],
          body: `The edit has stages, and knowing which one you are in prevents an enormous amount of wasted work.

The assembly is every scene, in script order, cut roughly, with nothing removed. It is always too long and always disheartening, and that is normal. Its only purpose is to let you see the whole shape at once.

The rough cut is the first pass at making it a film: scenes tightened, obviously redundant material dropped, the structure interrogated. This is where the biggest gains are, and they are almost always subtractive. The most common single fix in the history of editing is removing the first scene, because films tend to begin one scene before they need to.

The fine cut is frame-level work: performance selection, rhythm, exact cut points, and the long process of watching the same material until you can no longer see it — which is why you bring in fresh viewers.

Picture lock means the cut is frozen so that the departments downstream can work. Sound design, ADR, music, VFX and grading all build on specific frame counts, and changing the picture after lock means paying for that work twice. This deadline is a production reality rather than a claim of perfection.

Two habits make the whole process survivable. First, keep a change log and keep old versions — you will need to go back, and you will not remember why you did something three weeks ago. Second, screen for people who have not read the script, and do not explain anything beforehand. Their confusion is data. When four people are confused at the same point, the scene is broken, regardless of whether it is clear to you.`,
          assignment: {
            prompt: 'Screen a rough cut for three people who have not read your script. Do not explain anything. Write down every point where someone was confused or bored, then publish a revised cut addressing the top three.',
            tool: 'FABULA',
            postTag: 'filmschool',
          },
        },
        {
          id: 'fs-edit-7',
          title: 'Editing for Subjectivity',
          blurb: 'Putting the audience inside someone\'s head using nothing but order and duration.',
          minutes: 18,
          videoId: 'KjY9kf7TuUU',
          standardIds: ['FILM.EDIT.7'],
          body: `The camera is objective by default: it records a space from outside. Subjectivity — the sense that we are experiencing a scene as a particular character does — is constructed almost entirely in the edit, and the mechanisms are surprisingly few.

The first is the point-of-view chain: a shot of a character looking, a shot of what they see, a shot of them reacting. This three-part structure is so deeply learned that the audience will attribute the middle shot to the character even when it is impossible. Extend and vary it and you have the basic instrument of identification.

The second is selective attention through details. If you cut to a hand, a dripping tap, a loose thread, you are not merely showing an object — you are claiming that this is what the character noticed, and therefore telling the audience something about their state. A character who notices the wrong things is anxious. A character who notices nothing is numb. This is why detail-driven filmmakers feel poetic: they are editing perception rather than events.

The third is duration. Holding a shot past its informational usefulness puts the audience into the character's experience of time — waiting is boring for the character, and the only honest way to convey boredom or dread is to make the audience feel a measure of it. This is a knife-edge, and the amount you can hold depends entirely on how much the audience already cares.

The fourth is sound perspective, which belongs to the edit as much as the mix: muffling the world, isolating a heartbeat, or dropping to silence relocates the audience inside a body more effectively than any image.`,
          watchAlong: {
            ...PD.carnival,
            start: '20:00',
            end: '78:00',
            note: 'A film built entirely on subjective dislocation — sound drops out, the world stops registering the protagonist. Watch how cheaply and effectively it is achieved.',
          },
          assignment: {
            prompt: 'Cut a 90-second scene from one character\'s subjective experience using POV chains, chosen details and at least one held shot. Then cut the same footage objectively. Publish both.',
            tool: 'FABULA',
            postTag: 'filmschool',
          },
        },
      ],
    },

    // ── SOUND ────────────────────────────────────────────────────────────────
    {
      id: 'sound',
      title: 'Sound',
      blurb: 'Production sound, dialogue, design, score and the mix — the half of cinema nobody sees.',
      level: 'INTERMEDIATE',
      lessons: [
        {
          id: 'fs-sound-1',
          title: 'The Four Elements of a Soundtrack',
          blurb: 'Dialogue, ambience, effects, music — and the diegetic line running through all of them.',
          minutes: 18,
          videoId: '2vlwm4VyyTc',
          standardIds: ['FILM.SND.1'],
          body: `A finished soundtrack is four layers braided together, and each has a different job.

Dialogue carries literal information and is the layer the audience consciously tracks. It is also the layer with the least tolerance for imperfection: an audience will accept a stylised image and reject unintelligible speech within seconds.

Ambience — room tone, traffic, wind, the hum of a building — establishes place and, more importantly, provides continuity. Without a continuous ambient bed, every cut between takes produces a small audible discontinuity that the audience registers as wrongness even when they cannot name it. Ambience is the glue that makes fragments feel like one continuous space.

Effects, including foley, are the physical world made audible: footsteps, cloth, doors, impacts. Almost none of this is the sound that was recorded on the day. It is performed later to picture, because real recorded life sounds thin and unfocused, and because constructed sound lets you decide what matters. If the character should notice their own footsteps, you make them loud.

Music is the layer that speaks directly to the audience.

Cutting across all four is the diegetic line: is this sound inside the story's world or only in the audience's ears? A song on a car radio is diegetic; the strings underneath it are not. This boundary is a creative instrument. Crossing it — revealing that what you took for score is a record playing in the next room, or letting a diegetic song swell impossibly into full orchestration — retroactively changes the audience's relationship to the whole scene, and it is one of the most reliable effects in the medium.`,
          assignment: {
            prompt: 'Build a 60-second soundscape for a location using all four layers, then remove one layer at a time and publish the five versions. The one that collapses hardest tells you what that layer was doing.',
            tool: 'FABULA',
            postTag: 'filmschool',
          },
        },
        {
          id: 'fs-sound-2',
          title: 'Production Sound: Get It Right on the Day',
          blurb: 'Microphone placement is 90% of audio quality, and it costs nothing.',
          minutes: 20,
          videoId: 'mXtnHHJFREM',
          standardIds: ['FILM.SND.2'],
          body: `Almost every audio problem people try to solve in post is a placement problem that could have been solved for free on the day. The single most important variable is distance: the inverse square law means that halving the distance between microphone and mouth roughly quadruples the direct sound relative to the room. A cheap microphone close beats an expensive microphone far, every time.

The two standard approaches are the boom and the lavalier. A boom — a shotgun or hypercardioid mic on a pole, aimed at the mouth from just outside frame, usually from above — gives the most natural, full sound and the best rejection of off-axis noise, and it requires an operator who can follow movement without dipping into frame. A lav is hidden on the body, gives consistent level regardless of movement, and sounds more closed-in and prone to clothing rustle. Professional practice is to record both, because they fail in different ways.

Record room tone. Thirty to sixty seconds of the empty location, every location, every time. Your editor needs it to bridge cuts, and it takes one minute to get and is impossible to fabricate afterwards.

Monitor on headphones, always. You cannot hear the fridge, the distant motorway, the fluorescent buzz or the aeroplane until you are listening through the mic, and by the time you hear it in the edit the location is gone. Kill the fridge, turn off the air conditioning, and wait out the plane.

Watch levels for headroom. Digital clipping is unrecoverable — the information is simply not there — so aim your peaks well below the ceiling and accept a slightly quieter recording, which is trivially fixed later.`,
          assignment: {
            prompt: 'Record the same line four ways: phone at 2m, phone at 20cm, boomed from above, lav on the chest. Publish the comparison. Then record and label 60 seconds of room tone for a location you use often.',
            tool: 'FABULA',
            postTag: 'filmschool',
          },
        },
        {
          id: 'fs-sound-3',
          title: 'Dialogue Editing and ADR',
          blurb: 'Making assembled speech sound like one person spoke it once, in one room.',
          minutes: 18,
          standardIds: ['FILM.SND.3'],
          body: `Dialogue editing is the invisible craft of making a performance assembled from a dozen takes across several days sound like continuous speech in a single space. It is unglamorous, it is where most of the perceived "professionalism" of a soundtrack comes from, and it is largely a matter of patience.

The work has three parts. First, selection and joining: choosing the best reading of each line, often word by word, and splicing them so the joins fall in natural breaths and consonants rather than mid-vowel. Second, smoothing: filling gaps with matching room tone so the background never drops out, and using short cross-fades at every join so no edit produces a click or a sudden change in the noise floor. Third, matching: using EQ and level to make takes recorded at different distances or on different days sit together.

ADR — automated dialogue replacement — is re-recording a line in a studio to picture, and it is used when the location sound is unusable, when a line changes in the edit, or when a performance needs adjusting. It is difficult for actors because they must recreate a physical state months later while matching their own lip movements, and it usually sounds like it: too clean, too close, disconnected from the space. The fix is to add the room back — reverb matched to the location, plus the original ambience underneath — and to record ADR with the actor standing or moving as they were on the day.

The related tool is the split-track discipline: keep each character on their own track through the edit. It costs nothing and makes every subsequent process, from noise reduction to the final mix, dramatically faster.`,
          assignment: {
            prompt: 'Take a scene and build a clean dialogue edit: separate tracks per character, room tone filling every gap, cross-fades at every join. Publish a before/after with the raw edit and the smoothed one.',
            tool: 'FABULA',
            postTag: 'filmschool',
          },
        },
        {
          id: 'fs-sound-4',
          title: 'Sound Design: Building a World That Was Never Recorded',
          blurb: 'Almost nothing you hear in a film is the sound of the thing you are watching.',
          minutes: 20,
          standardIds: ['FILM.SND.4'],
          body: `Sound design is the construction of everything that is not dialogue or score, and the foundational insight is that realism is not the goal. Real recorded sound is thin, cluttered and undifferentiated. Designed sound is selected, exaggerated and layered so that the audience hears what matters and feels what is intended.

Layering is the basic technique. A single convincing impact is usually three or four sounds stacked: a low thud for weight, a mid crack for the material, a high transient for the initiation, and often something organic underneath that has nothing to do with the object at all. Famous creature and machine sounds are almost always animal recordings pitched, stretched and layered, because organic material carries emotional information that synthesis does not.

Foley — performing footsteps, cloth movement and prop handling in sync with picture — exists because these sounds must be under the control of the mix. If footsteps come from the production track you cannot make them quieter when the dialogue needs room, or louder when the character should feel exposed.

The most powerful tool in the whole discipline is subtraction. Silence, or near-silence, has more impact than any effect, because it breaks a continuous expectation. Dropping the entire ambient bed for two seconds before an event will do more than any added sound. Similarly, low-frequency content that sits below conscious hearing creates unease that audiences cannot locate and therefore cannot dismiss.

And sound can carry information the image does not have: what is happening off-screen, what a character is remembering, what they fear is behind the door. Off-screen sound is the cheapest and most effective horror device ever devised, because the audience's imagination outbuilds any budget.`,
          watchAlong: {
            ...PD.phantom,
            start: '00:00',
            end: '30:00',
            note: `${SILENT_NOTE} A silent film whose most famous sequences are about sound — an organ, a voice, a theatre. Score it yourself and see how completely the accompaniment determines the film.`,
          },
          assignment: {
            prompt: 'Take 60 seconds of footage and remove all original audio. Rebuild it entirely from designed sound — layered effects, foley you perform yourself, and at least one deliberate silence. Publish with the original for comparison.',
            tool: 'FABULA',
            postTag: 'filmschool',
          },
        },
        {
          id: 'fs-sound-5',
          title: 'Score: What Music Is Allowed to Say',
          blurb: 'The temp track problem, the theme, and the danger of music that only reports the emotion.',
          minutes: 20,
          videoId: '7vfqkvwW2fs',
          standardIds: ['FILM.SND.5'],
          body: `Score is the layer that speaks to the audience without pretending to belong to the world, which makes it the most direct emotional instrument available and the easiest to abuse.

The most useful principle is that music should add a dimension rather than duplicate one. If a scene is sad and the music is sad, the music has told the audience nothing they did not have, and its only effect is to make the sadness feel manufactured. The interesting choices are counterpoint — cheerful music over violence, restrained music over grief — or music that reveals a character's interior state that their behaviour is concealing.

Thematic writing is the other classical tool: a melodic identity attached to a character, idea or relationship, which can then be varied, fragmented, harmonised differently, or played in a mode that reveals how the film's attitude has changed. A theme that returns transformed at the climax does narrative work no dialogue could do. Its absence is the most common criticism of contemporary scoring — a great deal of modern film music is textural and atmospheric rather than memorable, which supports scenes while contributing nothing structural.

The practical hazard is the temp track. During the edit, existing music is dropped in to test scenes, and over months everyone falls in love with it. The composer is then asked to write something that is like the temp but legally distinct, which is a bad brief and produces derivative work. Bring your composer in early, before the temp has hardened into an expectation.

Finally: know where music should not be. Silence around a score's entrance is what gives the entrance force. A film scored wall to wall has no dynamics left to spend.`,
          assignment: {
            prompt: 'Score the same 60-second scene three ways — with music that matches the emotion, music that contradicts it, and no music at all. Publish all three and argue for one.',
            tool: 'FABULA',
            postTag: 'filmschool',
          },
        },
        {
          id: 'fs-sound-6',
          title: 'The Mix',
          blurb: 'Where every layer is balanced, and where a film either becomes intelligible or does not.',
          minutes: 18,
          standardIds: ['FILM.SND.6'],
          body: `The mix is the final assembly of every audio element into a single balanced soundtrack, and it is the last chance to shape the audience's experience. Its governing constraint is that human hearing is not a mixing desk: an audience cannot attend to four things at once, and the mix decides which one they attend to.

That decision-making is the whole craft. At any given moment, one layer is the subject and everything else is support. When dialogue matters, effects and music duck beneath it — literally, by automation. When a moment is physical rather than verbal, effects come forward. When the film wants to comment, score takes the top. Mixes that fail are usually mixes where everything is equally present, and the result is fatigue and unintelligibility even at high volume.

Frequency management is the technical half. Dialogue occupies a mid-range band, and anything else with strong energy in that band competes with it. Carving space by EQ — reducing music and effects where dialogue lives — buys intelligibility without lowering anything to the point of inaudibility.

Dynamics are the aesthetic half. A mix needs quiet passages to make loud ones land, and the temptation to keep everything loud destroys the range you need for a climax. Reference against films you admire at matched loudness, not by ear at different volumes.

Finally, deliverables. A film is heard on cinema systems, on televisions, on laptops and on phones, and a mix that works in one may be unintelligible in another. Check your mix on the worst speaker you can find, in mono. If the dialogue survives a phone speaker in a noisy room, it will survive anything.`,
          assignment: {
            prompt: 'Mix one scene properly: duck music and effects under dialogue, EQ to carve mid-range space, and build one genuinely quiet passage before a loud one. Check it on a phone speaker and publish the final.',
            tool: 'FABULA',
            postTag: 'filmschool',
          },
        },
      ],
    },

    // ── PRODUCING ────────────────────────────────────────────────────────────
    {
      id: 'producing',
      title: 'Producing',
      blurb: 'Development, money, schedule, legal clearance and distribution — how a film actually gets made and seen.',
      level: 'ADVANCED',
      lessons: [
        {
          id: 'fs-prod-1',
          title: 'What a Producer Does',
          blurb: 'The only role that is present from the first idea to the last payment.',
          minutes: 20,
          videoId: 'puF9CkvmJt0',
          standardIds: ['FILM.PROD.1'],
          body: `A producer is the only person attached to a film for its entire life. The director joins for prep and leaves after the grade; the crew join for the shoot; the producer is there from the option on the underlying rights to the final distribution payment, sometimes a decade later.

The role has four phases. In development the producer finds or commissions the material, secures the rights, attaches a director and cast, and assembles the financing — the longest and least visible phase, and the one where most projects die. In pre-production they build the budget and schedule, hire heads of department, and lock locations and contracts. In production they protect the schedule and the money while shielding the director from as much of it as possible. In post they manage the finish, the delivery requirements, and the sale.

The credit itself has become confusing because it is used as currency. In broad practice, the producer is the person who actually runs the film day to day; an executive producer typically brought money, rights or talent but is not running it; a line producer manages the budget and physical production on the ground; a co-producer is somewhere between, often heading a partner entity. Titles vary and are negotiated, which is worth knowing before you read a credit block as an org chart.

The underlying skill is judgement about people and about risk. A producer decides which director can actually deliver this script for this money, which schedule is optimistic and which is fantasy, and which problem this week is worth spending money on. Most of that judgement is only acquired by doing it, which is why the recommended entry route is producing your own shorts badly until you stop.`,
          assignment: {
            prompt: 'Take a 5-page script and produce a real one-page package: locations, cast size, shooting days, top five risks, and a bottom-line cost. Shoot the single most expensive shot in it and publish both.',
            tool: 'FABULA',
            postTag: 'filmschool',
          },
        },
        {
          id: 'fs-prod-2',
          title: 'Development and Rights',
          blurb: 'Options, chains of title, and why you cannot film the book you love.',
          minutes: 18,
          standardIds: ['FILM.PROD.2'],
          body: `Development is where a film exists only as paper and intention, and its central concern is rights. You cannot make a film from material you do not control, and "I'll deal with it later" is how projects become unreleasable after they are shot.

An option is the standard instrument: you pay a rights holder a relatively small sum for the exclusive right to buy the full rights within a fixed window, typically twelve to eighteen months, often renewable. The option lets you attach talent and raise money without paying the full purchase price up front. The purchase price is negotiated at the same time as the option, so that if the film happens the terms are already set.

The chain of title is the documented, unbroken line of ownership from the original author through to you. Financiers, insurers and distributors will all demand it, and a gap anywhere — an uncredited co-writer, an unsigned early draft, a collaborator who was never paid — can stop a finished film from being released. Get every contributor to sign, at every stage, including the friend who wrote a scene in week one.

Underlying rights are separate from the screenplay itself. Adapting a novel requires rights from the publisher or author; a film about a real person may require life rights, depending on jurisdiction and how the person is portrayed; a documentary using archive requires licences for each piece of footage and each piece of music.

Public domain is the exception, and it is a real strategic tool. Works whose copyright has lapsed can be adapted freely — which is precisely why so much of the canon is repeatedly remade. Every watch-along film in this school is public domain, which is why we can point you at it.`,
          watchAlong: {
            ...PD.nosferatu,
            start: '00:00',
            end: '94:00',
            note: 'The instructive case: Nosferatu was an unauthorised adaptation of Dracula. Stoker\'s estate sued, won, and the court ordered every print destroyed. The film survives only because copies had already escaped. This is a rights lesson, not a triumph.',
          },
          assignment: {
            prompt: 'Pick a public-domain story and write a one-page adaptation pitch, including your evidence that it is genuinely in the public domain in your country. Shoot its opening scene.',
            tool: 'FABULA',
            postTag: 'filmschool',
          },
        },
        {
          id: 'fs-prod-3',
          title: 'Budget and Schedule',
          blurb: 'Every creative decision on the page becomes a number and a day.',
          minutes: 22,
          standardIds: ['FILM.PROD.3'],
          body: `A budget is a translation of a screenplay into money, and a schedule is a translation of it into days. The two are the same document viewed from different angles, and the exercise of building them is the most useful thing a young filmmaker can do, because it makes visible what things actually cost.

The process begins with a script breakdown: going through the script scene by scene and tagging every element — cast, extras, locations, props, wardrobe, vehicles, animals, stunts, effects. Each tag has a cost and a scheduling consequence. The breakdown then drives the schedule, which is built not in script order but by grouping: all scenes at one location shot together, all scenes with an expensive actor grouped into their available days, night scenes clustered so the crew is not flipping between day and night.

Budgets are conventionally divided above the line — the creative deals: writer, director, producers, principal cast — and below the line, which is everything else: crew, equipment, locations, post, insurance. Beginners underestimate below the line consistently, and they underestimate post most of all.

Contingency is not optional. Something between five and ten percent, untouched until it is genuinely needed. A production without contingency does not avoid problems; it just pays for them by cutting shooting days, which is the most expensive way to save money.

The most valuable habit is knowing your cost per day and therefore per hour. Once you know that a lost hour costs a specific number, decisions about whether to move on or go again become concrete rather than emotional — and you will discover that the things that cost the most days are usually company moves and night exteriors, both of which are decided by choices made on the page for free.`,
          assignment: {
            prompt: 'Break down a 10-page script by hand: tag every element, group scenes into a shooting order, and produce a day-by-day schedule. Publish the schedule and shoot the day you think is riskiest.',
            tool: 'FABULA',
            postTag: 'filmschool',
          },
        },
        {
          id: 'fs-prod-4',
          title: 'Locations and the Geography Lie',
          blurb: 'Films are almost never shot where they are set, and the seam is where the craft is.',
          minutes: 18,
          videoId: 'ojm74VGsZBU',
          standardIds: ['FILM.PROD.4'],
          body: `Location is simultaneously one of the largest creative levers and one of the largest cost drivers, and the tension between those two facts shapes an enormous amount of what films look like.

The economic reality is that production incentives — tax credits, rebates and subsidies — move films to places that are not the places they depict. Cities become other cities. A film set in New York is shot in Toronto, Vancouver, Atlanta or Budapest because doing so returns a meaningful percentage of the spend. This is not a marginal effect; it determines where entire industries exist.

The craft consequence is the geography lie: making one place read as another through selective framing, dressing, signage, weather and, increasingly, digital extension. Done well it is invisible. Done badly it produces the uncanny sense of a place that does not cohere — mismatched architecture, wrong light, wrong trees, wrong road markings. Audiences who know the real city always notice, and audiences who do not still feel it as a vague thinness.

The interesting critical point is what is lost: a city that is always standing in for somewhere else never develops its own screen identity, and its specific texture — the thing that makes a place worth photographing — is systematically suppressed.

Practically, at any budget: scout in person, at the time of day you will shoot, and photograph it. Check the sun's path, the noise floor, the power, the parking, and who has authority to give permission. Get the permit. And treat a location as a character to be cast rather than a container to be filled — a genuinely specific place will do more for your film than a generic one plus a week of dressing.`,
          assignment: {
            prompt: 'Shoot a 60-second scene in one location, then re-shoot it in a second location made to read as the first through framing and dressing. Publish both and ask whether the trick holds.',
            tool: 'FABULA',
            postTag: 'filmschool',
          },
        },
        {
          id: 'fs-prod-5',
          title: 'Clearance, Copyright and the Public Domain',
          blurb: 'The legal layer that decides whether a finished film can legally be shown.',
          minutes: 20,
          standardIds: ['FILM.PROD.5'],
          body: `Clearance is the process of securing the legal right to everything visible and audible in your film, and it is the most common way that finished independent films become unreleasable.

The list is longer than beginners expect. Music requires two separate licences: the composition (publishing) and the specific recording (master). Both, always, even for a few seconds, even if it is playing in the background of a shot in a café. Artwork on walls, distinctive architecture in some jurisdictions, branded products, television or film playing on a screen in shot, and recognisable third-party footage all need clearance or removal. Every performer needs a signed release. Every person recognisably visible in a documentary needs one. Locations need permission from someone with the authority to give it.

Fair use and fair dealing exist but are far narrower than internet folklore suggests. They are defences rather than permissions, they are decided case by case, and distributors and insurers are generally unwilling to accept the risk. Errors and omissions insurance — required by essentially every distributor — will not be issued without a clearance report.

Public domain is the clean route, and it is worth understanding precisely because it is genuinely free. Works enter the public domain when copyright expires, and in some cases when it was forfeited. The most famous forfeiture in film history is Night of the Living Dead: the distributor changed the title on the prints and, under the law of the time, omitted the copyright notice, which placed the film immediately into the public domain. It became one of the most-viewed and most-copied films ever made, and its makers earned almost nothing from it. Every watch-along in this school is public domain, which is why we can legally send you straight to it.`,
          watchAlong: {
            ...PD.livingDead,
            start: '00:00',
            end: '96:00',
            note: 'You are watching this legally and freely because of a missing copyright notice in 1968. Watch the opening titles, then read about the notice omission — it is the single best clearance lesson in cinema.',
          },
          resources: [
            { label: 'Internet Archive — feature films in the public domain', url: 'https://archive.org/details/feature_films' },
          ],
          assignment: {
            prompt: 'Take one scene you have shot and produce a full clearance list: every piece of music, artwork, brand, screen, and person. Then re-shoot it fully cleared, using only public-domain or self-created material.',
            tool: 'FABULA',
            postTag: 'filmschool',
          },
        },
        {
          id: 'fs-prod-6',
          title: 'Post Pipeline and Delivery',
          blurb: 'Codecs, conform, and the deliverables list that no one warns you about.',
          minutes: 18,
          standardIds: ['FILM.PROD.6'],
          body: `Post-production is a pipeline, and the reason it is worth understanding as a producer is that mistakes made in week one of the shoot become expensive in month four of post.

It begins with data management on set: every card is backed up to at least two locations before it is wiped, verified by checksum, with a documented naming convention. This job is boring, it is usually given to the least experienced person, and it is the only step where a mistake is unrecoverable.

Then offline editing, usually on lightweight proxy files so the edit runs fast on ordinary hardware. When the picture is locked, the conform brings the original camera files back in at full quality against the locked timeline, which is why the edit must carry accurate metadata throughout.

From lock, three streams run in parallel and all depend on the picture not changing: sound (dialogue edit, design, foley, ADR, score, mix), picture finishing (VFX, then colour grade), and titles. Changing a single frame after lock forces work in all three streams to be redone.

Delivery is the part nobody warns you about. A distributor or platform will send a deliverables list that can run to dozens of items: a specific master format, separate audio stems, a textless version, closed captions and subtitles in specified formats, a music cue sheet, the chain of title, the clearance report, E&O insurance, key art, and metadata. Missing deliverables delay or block release, and they cost real money to produce after the fact.

Budget for it. The single most common independent-film failure is running out of money at ninety-five percent complete, with no funds left to finish the sound, the grade, or the deliverables — which means the film effectively does not exist.`,
          assignment: {
            prompt: 'Take one finished short and produce a complete delivery package: master file, separate audio stems, a textless version, an SRT subtitle file, a music cue sheet, and key art. Publish the short and list what the package taught you.',
            tool: 'FABULA',
            postTag: 'filmschool',
          },
        },
        {
          id: 'fs-prod-7',
          title: 'Distribution, Festivals and Finding an Audience',
          blurb: 'Making the film is half the job. Nobody tells you the other half.',
          minutes: 20,
          standardIds: ['FILM.PROD.7'],
          body: `A finished film that nobody sees is an unfinished project, and distribution is a discipline with its own strategy, deadlines and mistakes.

The traditional route for independent work runs through festivals. The point is not the screening; it is the market and the press. Festivals are tiered, most of the top tier require a genuine premiere, and premiere status is spendable exactly once — which means the sequencing of your submissions is a real strategic decision. Putting the film online before its festival run ends most of that route permanently. Submission fees add up quickly, so choose a small number of well-matched festivals rather than carpet-bombing.

If a sale happens, the deal will be about rights split by territory, by media window, and by duration. An all-rights worldwide deal in perpetuity is simple and usually the worst outcome for a filmmaker. Understand what is being taken and for how long, and pay attention to the recoupment structure — many independent films are technically profitable and pay their makers nothing because the expenses recouped ahead of them are uncapped.

Self-distribution is a legitimate strategy rather than a consolation prize, and it is what most work will actually do. It puts the burden of finding an audience on you, permanently, which is why the audience should be built during production rather than after it. A director with a following at the point of release has leverage that the film's quality alone does not confer.

The uncomfortable practical conclusion: start telling people what you are making while you are making it. Publish process, publish exercises, publish the failures. That is the same reason every lesson in this school ends with something you publish rather than something you file away.`,
          watchAlong: {
            ...PD.planNine,
            start: '00:00',
            end: '79:00',
            note: 'Legendary as the worst film ever made, and it is still being watched seventy years later while thousands of competent films are not. Distribution, notoriety and audience are not the same axis as quality — a genuinely useful and slightly bleak lesson.',
          },
          assignment: {
            prompt: 'Write a one-page distribution plan for a short you have made: three target festivals with deadlines and why each fits, your premiere strategy, and your self-distribution plan. Publish the plan alongside the film.',
            tool: 'FABULA',
            postTag: 'filmschool',
          },
        },
      ],
    },

    // ── ACTING & THE CRAFT ───────────────────────────────────────────────────
    {
      id: 'acting',
      title: 'Acting & the Craft',
      blurb: 'The technique lineages — Stanislavski, Strasberg, Adler, Meisner, Practical Aesthetics — plus scene study, screen technique, audition craft, and the body as instrument.',
      level: 'INTERMEDIATE',
      lessons: [
        {
          id: 'fs-act-1',
          title: 'Stanislavski: The Root of Everything',
          blurb: 'The system that replaced demonstration with truthful behaviour.',
          minutes: 22,
          videoId: 'bUP3HV-MQXE',
          standardIds: ['FILM.ACT.1'],
          body: `Before Konstantin Stanislavski, Western acting was largely a repertoire of codified external signs: a gesture for grief, a posture for nobility, a vocal attack for rage. An actor demonstrated an emotion to an audience. Stanislavski, working at the Moscow Art Theatre from the 1890s, asked a different question — not how do I show this feeling, but what would make it actually happen — and the answer became the foundation of modern acting.

His central terms are still the working vocabulary. Given circumstances: everything true of the character's situation — who, where, when, what has just happened, what is at stake. The "magic if": not "I am this person" but "if I were in these circumstances, what would I do?", which keeps the actor's own truthful impulses in play rather than asking them to become someone else. Objective: what the character wants in this scene, stated as something they could actually pursue. Super-objective: what they want across the whole play, which gives the individual objectives a spine. Units and actions: dividing the scene into segments and naming the specific thing being done in each.

Crucially, Stanislavski's system changed over his lifetime. His early work leaned on emotional recall — drawing on the actor's own remembered feelings — and he progressively moved away from it toward what became the Method of Physical Actions: the idea that if you execute the character's physical actions truthfully under the given circumstances, the inner life follows. Late Stanislavski trusted the body to lead the psychology.

This matters because the American schools that followed each seized on a different part of the system, at different stages of its development, and then argued for eighty years. Every technique in the next four lessons is a descendant of this one.`,
          watchAlong: {
            ...PD.stranger,
            start: '00:00',
            end: '40:00',
            note: 'Watch Edward G. Robinson: an actor of the pre-Method generation working with total behavioural specificity. Technique lineages describe how actors get there, not whether they get there.',
          },
          assignment: {
            prompt: 'Take a one-page scene. Write out the given circumstances, the objective, the super-objective, and break it into units with one action verb each. Then perform it to camera and publish the scene with your written breakdown.',
            tool: 'FABULA',
            postTag: 'filmschool',
          },
        },
        {
          id: 'fs-act-2',
          title: 'The Method, Adler, and the American Split',
          blurb: 'One system, three teachers, and the argument that shaped screen acting.',
          minutes: 22,
          standardIds: ['FILM.ACT.2'],
          body: `Stanislavski's ideas reached America through the Group Theatre in the 1930s, and almost immediately fractured into competing schools that all claimed his authority.

Lee Strasberg, later at the Actors Studio, built on the early Stanislavski. His Method centres affective memory: the actor recalls a real emotional experience from their own life in sensory detail in order to generate a genuine emotional state in the scene. Its strength is the raw authenticity of what it can produce; its risks are well documented — it can be psychologically punishing, it can make the actor's own history rather than the character's the subject, and it can leave a performer emotionally full but unable to play the scene's action.

Stella Adler, who had studied directly with Stanislavski in Paris in 1934 and learned that he had moved away from affective memory, rejected Strasberg's emphasis outright. Her position was that the actor's material is the imagination and the given circumstances, not their own trauma. Research the world, build the circumstances in vivid specificity, and the imagination will supply the feeling. "Your talent is in your imagination; the rest is lice" is the blunt version. Adler's approach tends to produce actors with enormous scale and a strong sense of the play's world.

Sanford Meisner, the third of the Group Theatre teachers, went somewhere else entirely, which the next lesson covers.

The reason this eighty-year argument is worth knowing is not partisanship. It is that these are three different answers to one real problem — how do you generate true feeling on demand, repeatedly, on cue — and different actors, and different roles, are served by different answers. Working professionals borrow across all three. Treat them as a toolkit, not a religion.`,
          assignment: {
            prompt: 'Perform the same 60-second monologue twice: once prepared with an affective-memory approach, once prepared purely by building the given circumstances imaginatively. Publish both and describe which felt more usable and repeatable for you.',
            tool: 'FABULA',
            postTag: 'filmschool',
          },
        },
        {
          id: 'fs-act-3',
          title: 'Meisner: Get Out of Your Own Head',
          blurb: '"Living truthfully under imaginary circumstances" — and the repetition exercise that builds it.',
          minutes: 22,
          videoId: 'uiog_iUBg6E',
          standardIds: ['FILM.ACT.3'],
          body: `Sanford Meisner's definition of acting is the most quoted in the field: "living truthfully under imaginary circumstances." The training built to produce it is unusually concrete.

It begins with the repetition exercise. Two actors face each other, and one makes a simple observation about the other — "you're wearing a blue shirt" — which the second repeats back, and they continue repeating, with the phrasing shifting only as their genuine impressions of each other shift. It sounds absurd, and for the first several sessions it is excruciating. What it does is systematically strip away the actor's attention to their own performance. You cannot plan a repetition. You can only notice what the other person is actually doing right now and respond to it. Meisner's summary — the foundation of acting is "the reality of doing" — is the point: do the thing, do not indicate the thing.

From repetition the training builds outward: independent activities (a difficult physical task under time pressure, so that the actor is genuinely occupied while the scene happens around them), then emotional preparation, then given circumstances, then text. Text arrives last, deliberately, because Meisner's argument is that the words are the least important thing in the scene.

The practical consequence for screen work is enormous. The camera photographs attention. An actor whose attention is on their own performance looks like an actor; an actor whose attention is genuinely on their scene partner looks like a person. Almost every note a director gives about a performance being "in their head" or "pushing" is describing misplaced attention, and repetition is the most direct known cure.

The discipline to take from Meisner even if you never train in it: listen as though you do not know what they are about to say.`,
          watchAlong: {
            ...PD.charade,
            start: '00:00',
            end: '113:00',
            note: 'A full film of two actors listening. Watch Hepburn\'s eyes between her own lines — she is receiving, continuously, and that is where the scene lives.',
          },
          assignment: {
            prompt: 'Film five minutes of the repetition exercise with a partner, unedited, one shot. Then perform a written scene immediately afterward. Publish both — the class should be able to see the difference in your attention.',
            tool: 'FABULA',
            postTag: 'filmschool',
          },
        },
        {
          id: 'fs-act-4',
          title: 'Practical Aesthetics: Play the Action',
          blurb: 'The anti-mystical school — analyse the scene, choose an action, do it, stop worrying about feeling.',
          minutes: 20,
          standardIds: ['FILM.ACT.4'],
          body: `Practical Aesthetics, developed by David Mamet and William H. Macy out of the Meisner tradition, is the most deliberately unromantic approach in the field. Its founding irritation is with actors who spend the rehearsal period excavating their feelings, and its claim is that feeling is not the actor's job at all.

The analysis is four questions, asked of every scene. What is the character literally doing? What do they want from the other person? What is the essential action — the underlying human transaction, stated as something you could genuinely try to do to another person, phrased so you personally would want to do it? And what is that like to me — the "as if", a situation from your own life with the same essential dynamic, used not to generate emotion but to make the action personally meaningful.

The essential action is the centre of the technique, and it is deliberately phrased in ordinary language: "to get someone to admit they were wrong", "to make a friend see they are about to ruin their life", "to get someone to leave me alone". It must be something a person could actually attempt, and it must be something you could commit to without pretending to feel anything.

Then you go and do it. Emotion, in this account, is a by-product that the audience will supply and the actor should ignore. Mamet's position — that the actor should simply say the words and pursue the action, and that "there is no such thing as character, only lines on a page" — is intentionally provocative and functions as a corrective.

Its virtue is repeatability under pressure. An actor with a clear action can do take forty at three in the morning. An actor waiting to feel something cannot, and screen work is made of take forty at three in the morning.`,
          assignment: {
            prompt: 'Take any scene and write the four Practical Aesthetics questions out in full, ending with an essential action phrased in plain language. Perform it three times with three different essential actions and publish all three.',
            tool: 'FABULA',
            postTag: 'filmschool',
          },
        },
        {
          id: 'fs-act-5',
          title: 'Scene Study: Objectives, Obstacles, Beats and Tactics',
          blurb: 'The practical craft all the lineages agree on.',
          minutes: 22,
          standardIds: ['FILM.ACT.5'],
          body: `Whatever the school, working actors do roughly the same thing to a scene, and it is worth separating this shared practice from the arguments about how to generate feeling.

Start with the objective: what does my character want from the other person in this scene, expressed as something they can win or lose in the next three minutes? Not "to be respected" — too abstract to play — but "to get him to say he needs me". The objective must live in the other person, because that is what keeps the actor's attention where it belongs.

Then the obstacle: what is preventing it? Without an obstacle there is no scene, only an exchange of information. The obstacle can be the other character's opposing want, a circumstance, or something internal — but it must be as strong as the objective or the scene resolves in one line.

Then tactics: the specific things the character does to overcome the obstacle. Tactics are active verbs directed at another person — to charm, to shame, to warn, to bargain, to threaten, to seduce, to belittle. When a tactic fails and the character switches to another, that is a beat change, and beat changes are the internal architecture of the scene. Mark them in the margin. A three-page scene might have six.

The universal rule underneath: play the action, not the emotion. An actor who decides "this scene is sad" and plays sadness has skipped the causal chain and gone straight to the symptom, which is what audiences recognise as bad acting. An actor who pursues an objective against a real obstacle and fails will be sad, visibly and involuntarily, and the audience will believe it.

And listen. Everything above is planning, and all of it must be abandoned the moment the other actor does something you did not expect.`,
          watchAlong: {
            ...PD.scarletStreet,
            start: '20:00',
            end: '60:00',
            note: 'Take one three-minute scene and mark the beats: every point where a character\'s tactic changes. Then name the verb for each.',
          },
          assignment: {
            prompt: 'Take a two-page scene, mark every beat change in the margin, and write the tactic verb for each. Perform it to camera and publish the scene together with a photo of your marked-up pages.',
            tool: 'FABULA',
            postTag: 'filmschool',
          },
        },
        {
          id: 'fs-act-6',
          title: 'Acting for the Camera',
          blurb: 'The lens is closer than any audience has ever been, and it photographs thought.',
          minutes: 20,
          standardIds: ['FILM.ACT.6'],
          body: `Screen acting is not stage acting made smaller, though that is the usual first correction. It is a different relationship with the audience, and several things change.

Scale is the obvious one. A theatre performance projects to the back row; the camera in a close-up is eighteen inches from the face and records involuntary micro-behaviour the actor is not aware of. This is why the camera is often said to photograph thought: an actor who is genuinely thinking the character's thought will read, and an actor who is performing the appearance of thinking will not. The most useful adjustment is not "do less" but "do it for real and let the lens find it".

Continuity is the strange one. Scenes are shot out of order, in fragments, across weeks, from multiple angles, and the actor must be able to reproduce a physical performance — where the cup was, which hand, when they turned — while keeping the emotional life alive. This is a technical skill with no theatrical equivalent, and it is why film actors are so specific about props.

Repetition is the difficult one. The same moment must be delivered on take one and take thirty-five with equal life, often against a piece of tape rather than an actor. Techniques that produce feeling reliably rather than beautifully win here, which is why action-based approaches dominate screen work.

And there is the technical layer: hitting marks without looking down, staying within a shallow focus plane, knowing which camera is on you, keeping the eyeline consistent when the other actor has gone home, and adjusting energy for the shot size. Everything you do must stay identical across coverage or it cannot be cut together.

The bargain is that the camera rewards restraint and truth more generously than any stage. It also exposes falseness more mercilessly.`,
          watchAlong: {
            ...PD.hisGirlFriday,
            start: '00:00',
            end: '92:00',
            note: 'Overlapping dialogue at enormous speed, and every actor still lands their beats. Study the precision — this is technical acting of a very high order disguised as naturalism.',
          },
          assignment: {
            prompt: 'Perform the same 45-second moment in a wide shot and then in a tight close-up, matching your physical action exactly between the two so they could be cut together. Publish both plus the cut.',
            tool: 'FABULA',
            postTag: 'filmschool',
          },
        },
        {
          id: 'fs-act-7',
          title: 'Audition and Self-Tape Craft',
          blurb: 'A separate skill from acting, with its own rules — and most of them are technical.',
          minutes: 20,
          videoId: 'ehtrHV8ZhDc',
          standardIds: ['FILM.ACT.7'],
          body: `The audition is a distinct discipline. You are performing a scene with no rehearsal, no director, no set, and usually a reader delivering the other lines flatly from off-camera. All of the scene's life has to come from you, and the room is deciding fast.

Make a strong, specific choice immediately. Casting directors form an impression within the first few seconds, and the most common failure is not a wrong choice but no choice — a safe, general, unobjectionable read that gives the room nothing to respond to. A bold choice that is wrong for the part is still far better than a vague one, because it demonstrates that you make choices, and that is what is actually being assessed.

Own your mistakes. Do not apologise, do not stop, do not ask to start again unless invited. Staying in it through a stumble is itself information about how you behave on a set.

For self-tapes — now the default — the technical baseline is not optional. Frame a clean mid-shot or chest-up against a plain, uncluttered, mid-tone background. Light your face evenly from the front, with your eyes catching light. Get your audio close; a phone across the room is disqualifying. Put your reader just beside the lens so your eyeline is slightly off-camera, never directly down the barrel unless asked. Slate briefly and warmly. Send the format and file naming exactly as requested, because a file that will not open is a file that does not get watched.

Then detach. You will be cut for your height, your resemblance to someone already cast, or a decision made before you were seen. Your job is to give a clear, alive read and let it go — which is only sustainable if you measure yourself on the read rather than the result.`,
          assignment: {
            prompt: 'Record a proper self-tape of a one-minute scene: clean background, front light, close audio, reader beside the lens, brief slate. Then record the same scene with a deliberately different strong choice. Publish both.',
            tool: 'FABULA',
            postTag: 'filmschool',
          },
        },
        {
          id: 'fs-act-8',
          title: 'Voice and Movement: The Body as Instrument',
          blurb: 'Linklater, Laban, Alexander and Chekhov — the physical training the screen still requires.',
          minutes: 22,
          videoId: 'xaKih48VjyI',
          standardIds: ['FILM.ACT.8'],
          body: `Everything an actor does arrives through a body, and the body has habits. Voice and movement training is the process of removing the habits that are yours so that the character's can be present instead.

Voice work begins with breath. Support from the diaphragm rather than the throat gives an actor volume without strain, sustained lines without collapse, and — most importantly for screen — the ability to stay relaxed and truthful while under pressure, because tension in the throat is the first thing that makes a performance sound false. Kristin Linklater's work, set out in Freeing the Natural Voice, frames the goal not as building a beautiful voice but as removing the physical and psychological tensions that block the voice a person already has. Cicely Berry's work at the Royal Shakespeare Company approached the same territory through text: how sound, rhythm and the physical act of speaking carry meaning.

Movement gives the body a vocabulary. Rudolf Laban's effort system analyses movement along weight, space, time and flow, producing a practical way to answer "how does this person move?" — heavy and direct, or light and indirect. It converts a vague characterisation into something an actor can physically do. The Alexander Technique works in the opposite direction, undoing habitual misuse and unnecessary tension so the body returns to efficient, unforced coordination. Michael Chekhov's Psychological Gesture goes further still: distil the character's inner drive into a single large physical shape, rehearse it fully, then internalise it so it informs everything without ever being visible.

The screen payoff is that physical transformation reads faster than dialogue. Posture, rhythm, centre of gravity and how much space someone takes up tell an audience who a person is before they speak — and the most memorable screen characters are almost always physically specific first.`,
          watchAlong: {
            ...PD.nosferatu,
            start: '00:00',
            end: '94:00',
            note: `${SILENT_NOTE} Max Schreck builds an entire character with no voice at all — purely through silhouette, rhythm, and the way he occupies a doorway. Physical characterisation with nothing else available.`,
          },
          assignment: {
            prompt: 'Build a character physically before you speak a word: choose a Laban quality (light/heavy, direct/indirect), a centre of gravity, and a rhythm. Film 60 seconds of that person doing an ordinary task in silence, then film them speaking one line.',
            tool: 'FABULA',
            postTag: 'filmschool',
          },
        },
      ],
    },
  ],
};

export default FILM_SCHOOL;
