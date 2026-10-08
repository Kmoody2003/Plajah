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

const L01 = 'film-directing.l01';
const L02 = 'film-directing.l02';
const L03 = 'film-directing.l03';
const L04 = 'film-directing.l04';
const L05 = 'film-directing.l05';
const L06 = 'film-directing.l06';
const L07 = 'film-directing.l07';
const L08 = 'film-directing.l08';
const L09 = 'film-directing.l09';
const L10 = 'film-directing.l10';
const L11 = 'film-directing.l11';
const L12 = 'film-directing.l12';
const L13 = 'film-directing.l13';
const L14 = 'film-directing.l14';
const L15 = 'film-directing.l15';
const L16 = 'film-directing.l16';
const L17 = 'film-directing.l17';
const L18 = 'film-directing.l18';
const L19 = 'film-directing.l19';
const L20 = 'film-directing.l20';
const L21 = 'film-directing.l21';
const L22 = 'film-directing.l22';
const L23 = 'film-directing.l23';
const L24 = 'film-directing.l24';

export const COURSE_MODULE: CourseModule = {
  curriculum: {
    id: 'film-directing',
    label: 'Film Directing',
    blurb: 'What a director actually does: reading a script, shaping a vision, working with actors and the camera, planning shots, leading a set, and carrying a film through post and out into the world.',
    accent: '#E23B6D',
    framework: 'ncas',
    tracks: [
      {
        id: 'film-directing.t1',
        title: 'The Director and the Script',
        blurb: 'What the job is, how a film moves from idea to screen, and how directors read a script and decide what a film is about.',
        level: 'FOUNDATION',
        lessons: [
          {
            id: L01,
            title: 'What a Director Does',
            blurb: 'A director is the person responsible for turning a script into a coherent film by making and guiding creative decisions.',
            minutes: 6,
            body: `When you watch a film, hundreds of people may have worked on it: actors, camera operators, designers, editors, composers, sound recordists. Someone has to make sure all of that effort points the same way. That person is usually the director.

A director is responsible for the creative interpretation of the story. That means deciding how the script will look, sound and feel, and guiding the people who make it happen. In practice the job has a few main parts. The director works with actors on their performances. The director decides, together with the cinematographer, where the camera goes and what it sees. The director works with the production designer, costume designer, editor, composer and sound team so their contributions fit one overall approach. And the director answers a constant stream of questions on set: Should the character sit or stand? Is this take good enough? Do we need another angle?

It helps to say what a director is not. A producer usually handles money, schedules, hiring and business decisions; the two roles overlap on some films but are different jobs. A director does not operate every camera, build every set or write every line, although some directors also write or edit.

A director also does not have unlimited control. Budgets, schedules, studios, financiers and collaborators all shape the result, and who has the final say over the finished cut varies from film to film and is usually set by contract.

Example: on a short film about two siblings clearing out a parent's house, the director decides the mood (quiet, restrained), works with the actors on their unspoken tension, and chooses with the cinematographer to shoot mostly in steady, simple frames.`,
          },
          {
            id: L02,
            title: 'The Life of a Film: From Idea to Screen',
            blurb: 'Films move through development, pre-production, production and post-production, and the director has a different job in each.',
            minutes: 6,
            body: `A film does not begin when the cameras roll. Most productions are described in four broad stages, and a director works differently in each.

Development is when the idea becomes a script that people believe in. A story is chosen or written, rights are secured if it is based on existing material, and funding is sought. A director may be attached early, or may join later.

Pre-production is the planning stage. The director reads and re-reads the script, meets the key crew, helps cast actors, looks at locations, and prepares shot lists and often storyboards. The aim is to solve as many problems as possible while mistakes are still cheap. Planning is usually the most useful time a director has, because every hour on set is expensive.

Production is the shoot itself, the period when the footage is recorded. Days are long and packed. The director works with the first assistant director, who runs the schedule on set, and keeps the performances and images on track.

Post-production is everything after shooting: editing the footage into a story, adding visual effects, composing and recording music, mixing sound, correcting colour, and finishing the film for delivery. In post, the director often discovers what the film truly is, because the shape of the story can change in the edit.

Stages overlap in practice. Some editing begins while shooting continues, and some films need extra shooting called pickups later on.

Example: a director who spends pre-production walking the locations with the cinematographer may spot that a planned scene at noon will have harsh light, and move it to evening before the shoot day is wasted.`,
          },
          {
            id: L03,
            title: 'Reading a Script Like a Director',
            blurb: 'Directors read for story, character wants, scene structure and what is left unsaid.',
            minutes: 7,
            body: `A script is not a finished film. It is a plan written in words, and a director's first job is to read it closely enough to see the film inside it.

Start with the story: who wants what, what stands in the way, and what changes by the end. Many scripts follow some version of a three-act shape, a setup, a confrontation and a resolution. This is one useful model, not a law, and plenty of good films ignore it.

Then read scene by scene. A common method is to ask, for each scene, what does each character want right now, what is stopping them, and how are things different at the end? A scene where nothing changes is a warning sign. Directors often break scenes into beats, small units where the dynamic shifts, such as one person gaining the upper hand or a secret slipping out.

Read for subtext, meaning that lies beneath the words. When two characters argue about who left the dishes, the real argument may be about respect. Dialogue rarely says everything, and actors and the camera can carry the rest.

Finally, ask what the film is about beneath the plot. Plot is what happens. Theme is what the events add up to: perhaps that loyalty has a cost, or that growing up means letting go. Knowing the theme gives you a test for every later decision, from casting to the colour of a wall.

Example: in a scene where a daughter helps her father pack for a care home, the script may only say they talk about the weather. A director reads that the real beat is her fear of losing him, and plans quiet pauses and small physical business, such as folding a shirt too carefully.`,
          },
          {
            id: L04,
            title: 'Vision and Tone',
            blurb: 'A director turns an interpretation of the script into a consistent look, sound and feeling that the whole team can follow.',
            minutes: 7,
            body: `A director's vision is a clear answer to the question: what should this film feel like, and why? Tone is the overall mood or attitude of a film, such as tense, tender, playful, bleak or wry. Two films can share a plot and feel entirely different because their tone differs.

Vision matters because filmmaking is collaborative. If the cinematographer imagines a warm, soft film and the production designer imagines a cold, hard one, the images will fight. A director who can explain the film in a few clear ideas lets everyone make smaller decisions that fit.

Directors build and share a vision in several ways. Many write a short statement of intent describing the story's heart and the approach to it. They gather references: paintings, photographs and sequences from other films, used to talk about light, colour and framing. They talk through a few guiding words, for instance 'intimate, patient, uneasy.' A good reference helps people see what you mean, but a reference is for discussion, not for copying.

Tone has to stay consistent, though it can shift deliberately. A comedy that suddenly turns serious can work if the film prepares the audience for it, and feel jarring if it does not.

A strong vision is also specific. 'Cool' or 'emotional' says little. 'The house should feel too large for the family, so we will often frame them small in wide, still shots' tells the team what to do.

Example: a director making a ghost story decides the fear should come from stillness, not shocks. That choice shapes everything, from slow camera moves to sparse sound and long pauses before something small changes in the frame.`,
          },
        ],
      },
      {
        id: 'film-directing.t2',
        title: 'Working with Actors',
        blurb: 'Casting, rehearsal, blocking and giving direction: the practical craft of getting a performance.',
        level: 'FOUNDATION',
        lessons: [
          {
            id: L05,
            title: 'Casting',
            blurb: 'Casting is the process of choosing actors, and it shapes the film as much as any later decision.',
            minutes: 6,
            body: `Choosing who plays a role is one of a director's most important decisions. A well-cast actor brings believability and ideas the script alone cannot supply; a poor fit is very hard to fix later.

Casting usually starts with the character. What does this person need to be? The director considers age, physical presence, voice, and above all the emotional truth the actor can bring. Appearance matters, but ability to play the life of the character matters more.

Most productions work with a casting director, a specialist who knows actors, suggests candidates, and organises auditions. Actors may read scenes from the script, sometimes in front of the director, and sometimes by recording themselves. Directors often hold callbacks, second meetings where the best candidates read again, try different directions, or perform together.

Chemistry reads, where possible actors are paired, help test whether two people work together on screen. Casting is also where a director sees how an actor takes direction. An actor who can change a performance quickly when asked is valuable.

Casting involves other considerations: availability, budget, how a name might help a film get funded, and representation. Who is cast, and who is not, has real effects on what stories audiences see, and many in the industry argue that casting should be open to a wide range of people. Practices continue to change.

Example: for a quiet drama about two old friends, a director may care less about famous names than about whether the two actors seem to share a decades-long history, and may test that by having them improvise a simple memory together.`,
          },
          {
            id: L06,
            title: 'Rehearsal and the Table Read',
            blurb: 'Rehearsal lets the director and actors explore the script together before the pressure of the camera.',
            minutes: 6,
            body: `Rehearsal is time for director and actors to explore the script away from the cost and pressure of filming. How much rehearsal happens varies widely. Some productions have weeks, some have almost none.

A common first step is the table read, where the cast sits together and reads the whole script aloud. It lets everyone hear the story as a whole, shows where dialogue sounds unnatural, and helps the team gauge length and tone. Writers and directors often adjust lines afterward.

Rehearsal itself can take several forms. Actors may talk through their characters' histories and wants. They may run scenes on a rehearsal floor or in the real location, so the director sees where people naturally move. Some directors use improvisation, where actors act out moments not in the script, such as an earlier meeting between two characters, to build a shared past. Others keep rehearsal light for fear of making a performance stale before the camera arrives.

There is a real debate here. Heavy rehearsal can build trust and detail and save time on the shoot. Light rehearsal can keep performances fresh and spontaneous. Good directors choose according to the film, the actors and the schedule, and do not treat either approach as always right.

Whatever the method, rehearsal is also where trust is built. An actor who feels safe will take bigger risks.

Example: a director rehearsing a dinner-table scene runs it three times in the actual dining room, notices the actors keep drifting toward the window, and uses that movement in the blocking instead of fighting it.`,
          },
          {
            id: L07,
            title: 'Blocking: Placing People in Space',
            blurb: 'Blocking is the planned movement of actors in relation to each other and the camera.',
            minutes: 6,
            body: `Blocking means deciding where actors stand and move during a scene, and how that relates to the camera. The word comes from theatre, where it describes plotting an actor's positions on stage.

Blocking tells the story physically. Who moves toward whom? Who stays still? Who sits while another stands? When a character crosses the room to stand by a door, we read that they want to leave, even if they say nothing. Distance and height suggest power, closeness or tension.

Blocking has to work for the camera, not only for the room. The director and cinematographer need to know where the actors will be so the shot can be framed and lit. A common approach is to rehearse the scene with the actors first, letting them move naturally, then decide on camera positions. Another is to plan the camera first and fit the movement into it. Many directors do a mix. A key step is the stagger-through or blocking rehearsal, where the crew watches the scene before lighting begins.

Practical markers help. Actors often hit marks, small pieces of tape on the floor showing where to stop so they stay in focus and in the frame. Good actors learn to hit marks without looking down.

Blocking should be motivated, meaning each move has a reason rooted in the character's wants. A character who paces without reason only distracts.

Example: in a scene where a boss fires an employee, the director has the boss stay seated behind a large desk while the employee remains standing. Then, at the moment of anger, the employee moves around the desk, closing the distance. The shift in space tells us the power has changed.`,
          },
          {
            id: L08,
            title: 'Giving Direction',
            blurb: 'Good direction gives actors something specific and playable instead of a result to imitate.',
            minutes: 7,
            body: `Giving direction is the art of telling an actor what you need in a way they can use. The central lesson most acting teachers share is that actors can act on actions, not on results.

A result direction says what the audience should see: 'be sadder,' 'look angrier.' An actor cannot play 'sad' directly; trying to show an emotion often looks forced. An action direction gives the actor something to do: 'try to get her to stop talking,' 'hide how much this hurts,' 'convince him you're fine.' Actions are usually phrased as active verbs, and they lead to behaviour that looks real. Many modern acting approaches descend from the work of the Russian theatre practitioner Konstantin Stanislavski, who stressed what a character wants and tries to do.

Other habits help. Speak privately to the actor instead of correcting them in front of the crew. Be brief; after each take, give one clear adjustment rather than a list. Talk about the character's situation, not about the actor's technique. Praise what works so the actor knows what to keep. And listen: actors often know their character well and may offer an idea better than yours.

Directors also have to adapt to different actors. One may want detailed discussion, another very little. Learning to read what each person needs is part of the craft.

Example: an actor playing a father keeps delivering 'I'm proud of you' with obvious warmth. The director says, 'This time, you're afraid that if you say it, he'll leave.' The line now carries tension, and the same words feel richer.`,
          },
          {
            id: L09,
            title: 'Performance for the Camera',
            blurb: 'Screen acting is scaled to the lens, and the director watches for continuity and energy across many takes.',
            minutes: 6,
            body: `Acting for a camera differs from acting on stage. A stage actor must reach the back row; a screen actor can be filmed from inches away, where a tiny movement of the eyes is visible. A director's job includes helping actors find the right scale for each shot. A wide shot can handle bigger physical action, while a close-up often asks for very little.

Films are shot out of order and in pieces, so continuity of performance matters. If an actor holds a glass in the right hand in the wide shot, they should do the same in the close-up, and the emotional level should match as well. A scene may be shot from several angles on different days, and the editor must be able to join them. The script supervisor keeps notes on such details, including dialogue and prop positions.

Directors also manage energy across takes. Repeating a scene many times can wear down spontaneity. Some performances grow stronger with takes; others peak early. A director watches for this and decides when to move on or try something different.

Because the camera is the audience, directors often watch on a monitor, sometimes placed away from the set, to see what the lens sees. They also protect actors in vulnerable scenes by limiting who is in the room and by agreeing in advance on what will be shown.

Example: after a tearful close-up, the director notices the actress has been crying on every take and is starting to look tired. The director takes a short break, then asks her to try holding the tears back, which gives the editor a quieter option.`,
          },
        ],
      },
      {
        id: 'film-directing.t3',
        title: 'The Language of the Camera',
        blurb: 'Shot sizes, angles, movement, lenses, coverage and the 180-degree rule.',
        level: 'INTERMEDIATE',
        lessons: [
          {
            id: L10,
            title: 'Shot Sizes and Camera Angles',
            blurb: 'How much of a subject we see, and from where, shapes meaning and emotion.',
            minutes: 7,
            body: `Shot size describes how much of a subject appears in the frame, usually measured against the human body. The standard vocabulary is flexible, but commonly includes a wide shot (the whole person and plenty of surroundings), a full shot (head to toe), a medium shot (roughly waist up), a close-up (the face), and an extreme close-up (a detail such as the eyes or a hand).

Each size does a job. Wide shots establish where we are and show people in their environment, which can also make them look small or isolated. Medium shots suit conversation and action. Close-ups bring us into a character's feelings and reveal reactions. Extreme close-ups focus attention on a crucial detail. Directors often move between sizes to control how near the audience feels to the story.

Camera angle is where the camera sits in relation to the subject. An eye-level angle feels neutral. A high angle looks down on a subject and can make it seem smaller or weaker; a low angle looks up and can make a subject seem imposing. A Dutch angle tilts the horizon and is often used to suggest unease.

These effects are tendencies, not rules. A low angle on a character can feel heroic in one film and comic in another, depending on context. Meaning comes from how a shot works with the story, not from the angle alone.

Example: to show a nervous student entering a large lecture hall, a director starts with a wide, slightly high shot where she looks tiny among the seats, then cuts to a close-up of her face as she scans for a place to sit. The size change moves us from the room to her.`,
          },
          {
            id: L11,
            title: 'Camera Movement',
            blurb: 'Pans, tilts, dollies, tracking and handheld shots each carry a different feeling and need a reason.',
            minutes: 7,
            body: `A camera can stay still or move, and both choices say something. The basic movements are worth learning by name.

A pan turns the camera left or right from a fixed position, like turning your head. A tilt moves it up or down. A dolly moves the entire camera on wheels or tracks, forward, back or sideways, and a tracking shot follows a subject as it moves. A crane or jib lifts the camera up or down through space. Handheld shooting, with the operator carrying the camera, gives a loose, sometimes urgent feeling. A Steadicam, a stabilising rig worn by the operator, makes smooth moves while walking. A zoom changes the focal length of the lens to make the subject appear nearer or farther without the camera itself moving, which looks different from a dolly move.

Each movement tends to carry a feeling. Slow push-ins can build tension or draw us toward a character. Handheld can feel immediate or documentary-like. Smooth tracking can feel graceful or controlled. A locked-off, still camera can feel calm, formal or trapped.

A move should be motivated, which means it has a reason in the story: following a character, revealing information, or shifting our emotional distance. Movement for its own sake can feel like showing off.

One famous technique is the dolly zoom, where the camera moves one way while the lens zooms the other, making the background seem to stretch or squeeze. It is closely associated with Alfred Hitchcock's film Vertigo (1958).

Example: in a scene where a mother realises her child has gone missing in a market, the director uses a slow handheld push in on her face while the background crowd blurs, so the camera's unrest mirrors her panic.`,
          },
          {
            id: L12,
            title: 'Lenses: An Overview',
            blurb: 'The focal length of a lens changes how wide the view is, how depth looks, and how the audience feels.',
            minutes: 7,
            body: `A lens decides how much of the world fits in the frame and how that world looks. The key idea is focal length, usually measured in millimetres. A shorter focal length gives a wider view; a longer one gives a narrower, more magnified view.

Cinematographers often group lenses loosely. Wide-angle lenses, with short focal lengths, show a lot of the scene and make space feel deep and expansive. Because they exaggerate depth, objects close to the lens can look stretched or distorted. A normal lens gives a view that feels fairly natural to many viewers. Telephoto lenses, with long focal lengths, bring distant things closer and seem to compress space, making background objects look nearer to the subject. Exact millimetre ranges depend on the size of the camera sensor or film frame, so they are guides, not fixed rules.

A second idea is depth of field, how much of the image is in focus. A shallow depth of field keeps one plane sharp and blurs the rest, which isolates a subject and guides attention. A deep depth of field keeps near and far things in focus, letting the audience look around the frame. Depth of field depends on several things, including aperture, focal length and distance.

Prime lenses have one fixed focal length; zoom lenses cover a range. Many cinematographers like primes for their image quality, though zooms are quicker to use.

Directors usually do not choose exact lenses alone. They describe the feeling they want, and the cinematographer proposes lenses to achieve it.

Example: to make two characters on a long road feel trapped together, a director might ask for a telephoto lens so the distant buildings seem to press in behind them.`,
          },
          {
            id: L13,
            title: 'Coverage and the Master Shot',
            blurb: 'Coverage means shooting a scene from enough angles that the editor has choices.',
            minutes: 7,
            body: `Coverage is the footage shot of a scene from different angles and sizes so that the editor has options when assembling it. A scene may be covered fully or only with the shots the director needs.

A traditional approach starts with a master shot, a wider view that captures the entire scene from beginning to end, often with all the characters in frame. After the master, the crew shoots closer angles, such as medium shots and close-ups of each actor, plus any cutaways to details like a clock or a letter. In a conversation, shooting one actor's lines and then the other's from over-the-shoulder positions produces the shot and reverse shot pattern, where the edit alternates between speakers.

Coverage is a trade-off. Lots of coverage gives an editor flexibility and a safety net if a performance works better in one angle than another. It also takes time, and time is money. Some directors cover thoroughly; others shoot only what they plan to use, which is sometimes called cutting in camera. Both approaches have costs. A director who plans too little coverage risks being unable to fix problems in the edit, while a director who covers everything may have less time for each setup.

Good coverage is designed, not random. Directors decide in advance what the scene needs: where the audience should look, whose face matters at each moment, and what information must be seen.

A cutaway, such as a shot of a hand trembling, can also help an editor trim or join takes.

Example: for a dinner scene with four people, the director shoots a master of the whole table, then a single on each speaker, then a quick insert of the father's hand tapping the table, which the editor later uses to show growing irritation.`,
          },
          {
            id: L14,
            title: 'The 180-Degree Rule',
            blurb: 'Keeping the camera on one side of an imaginary line helps audiences understand screen direction and space.',
            minutes: 7,
            body: `When two characters talk, the audience quickly builds a mental map: one person is on the left of the screen, looking right, and the other is on the right, looking left. The 180-degree rule helps protect that map.

Imagine a line, the axis of action, running between the two characters. If the camera stays on one side of the line for all the shots, the characters keep the same left and right positions on screen, and the audience stays oriented. If the camera crosses to the other side, they appear to swap positions, which can feel confusing. The name comes from the half circle of 180 degrees the camera can use on its chosen side.

The same logic applies to movement. If a car travels left to right in one shot, it should usually travel left to right in the next. Reversing the direction can make viewers think it has turned around.

A related guideline, often called the 30-degree rule, suggests that two consecutive shots of the same subject should differ in angle by at least about 30 degrees, or the cut can look like a jump.

These are guidelines, not laws. Directors can cross the line smoothly in several ways: by showing the camera move across it within a shot, by cutting to a neutral shot placed on the line, or when a character moves and the axis shifts. Some filmmakers break the rule on purpose to create disorientation. The Japanese director Yasujiro Ozu is often discussed for his unconventional handling of eyelines and screen space.

Example: in a two-person argument across a kitchen table, the director chooses the camera side first and keeps all setups there, so the audience always knows who is on the left and who is on the right.`,
          },
        ],
      },
      {
        id: 'film-directing.t4',
        title: 'Planning, Image and Sound',
        blurb: 'Shot lists, storyboards, mise-en-scene, editing awareness and the use of sound and music.',
        level: 'INTERMEDIATE',
        lessons: [
          {
            id: L15,
            title: 'Shot Lists and Storyboards',
            blurb: 'Shot lists and storyboards turn the script into a concrete plan for the day.',
            minutes: 7,
            body: `Because shoot days are short and expensive, directors plan the coverage in writing and often in pictures.

A shot list is an ordered list of the shots needed for each scene. Each entry commonly notes the shot number, size, angle or movement, lens ideas if known, the characters involved, and a short description. The shot list helps the first assistant director estimate time and the crew prepare equipment. It is a plan, and may change on the day if the situation demands.

A storyboard is a sequence of drawings, like a comic strip, showing how shots will look. Storyboards are especially useful for action, stunts, visual effects and complex camera moves, where many departments must agree on exactly what will be filmed. Not every director storyboards; some use rough sketches, photographs of locations taken on a phone, or simple diagrams. An overhead floor plan, showing the room, the actors and the camera positions from above, is another standard tool.

A further step is the animatic, a rough moving version of a storyboard with timing, sometimes with sound, so that pacing can be judged before filming.

Planning styles vary. Alfred Hitchcock is widely known for meticulous advance planning of his films. Other directors prefer to arrive on the day and respond to the actors and the space. Neither style guarantees a good result, but planning reduces risk when many people and a lot of equipment are involved.

Example: for a chase through a market, the director draws twelve boxes showing the runner, the pursuer and a collapsing fruit stand. The stunt coordinator uses the drawings to plan the stunt safely, and the camera team knows where to place cameras.`,
          },
          {
            id: L16,
            title: 'Mise-en-Scene and Visual Language',
            blurb: 'Everything placed in front of the camera, from light to costume to composition, carries meaning.',
            minutes: 7,
            body: `Mise-en-scene is a French term meaning 'placing on stage.' In film it refers to everything arranged in front of the camera: set design, props, costume, makeup, lighting, the position and movement of actors, and the composition of the frame. Directors use it, together with the camera and editing, to build a visual language that tells the story beyond dialogue.

Composition is how elements are arranged inside the frame. Directors think about where the eye will land first. Familiar tools include the rule of thirds, which divides the frame into a three by three grid and places key elements along the lines; leading lines that guide the eye; and framing within the frame, such as showing a character through a doorway. Symmetry can suggest order or confinement, while empty space around a figure can suggest loneliness.

Colour carries mood. A restrained palette can create unity, while a single bright colour in a muted world draws attention. The meaning of a colour depends on the story and the culture, so directors build their own consistent scheme and avoid assuming a colour has one fixed meaning.

Lighting shapes feeling too. Soft, even light tends to feel gentle, while high contrast, with strong shadows, tends to feel dramatic or tense. Costume and props quietly describe character: a worn-out coat or a spotless desk can tell us about a person before they speak.

Good visual language is consistent. Once a film establishes that closed doors mean secrets, the audience begins to read them that way.

Example: in a film about a family hiding a debt, the director has the production designer use cluttered rooms and dim lamps at home, then bright, empty offices in scenes outside, so the house itself feels like a place of pressure.`,
          },
          {
            id: L17,
            title: 'Editing Awareness: Continuity and Montage',
            blurb: 'Directors shoot with the edit in mind, and cutting itself creates meaning.',
            minutes: 7,
            body: `Editing is the selecting and joining of shots, and a director who does not think about the edit while shooting can leave the editor with problems. This lesson covers two broad approaches.

Continuity editing aims to make cuts feel smooth so that the audience follows the story without noticing the joins. It relies on consistency: the same actor holds the same prop in the same hand, light and costume match, and action carries across a cut. A match on action cuts from one angle to another in the middle of a movement, such as a hand opening a door, so the motion hides the join. An eyeline match shows a character looking at something and then cuts to what they see. Keeping to the 180-degree rule also supports continuity.

Montage is a different idea, in which the meaning comes from the collision or sequence of shots. Soviet filmmakers of the 1920s, among them Sergei Eisenstein, explored montage theory, and Eisenstein's Battleship Potemkin (1925) is a famous example studied in film courses. Details of early Soviet experiments are debated, but the principle is well established: placing two shots together creates an idea that neither shot has alone.

A match cut links two shots through a similar shape or movement. A jump cut deliberately skips time within a single angle and calls attention to itself.

Editors also care about rhythm, the pace of cuts. Short shots speed things up; long takes slow things down and invite the audience to observe.

Example: a director films a character writing a letter, then shoots a close-up of the pen at a matching angle so the editor can cut on the moment the hand pauses, creating a smooth join and a small emotional beat.`,
          },
          {
            id: L18,
            title: 'Sound and Music',
            blurb: 'Dialogue, effects, ambience and music shape what the audience feels, often without being noticed.',
            minutes: 7,
            body: `Sound is half of the experience of a film, yet beginners often treat it as an afterthought. Directors think of sound in several layers.

Dialogue is recorded on set by the production sound team, who use microphones on a boom pole or hidden on the actors. Directors listen for clean dialogue, because noisy takes may need to be re-recorded later in a process called automated dialogue replacement, or ADR. Sound effects add specific sounds such as footsteps or doors, and many of these are created after the shoot, sometimes by Foley artists who perform them in a studio while watching the picture. Ambience, the background sound of a place, tells us where we are. Recording room tone, a minute of silence in each location, gives editors something to fill gaps.

Music can be diegetic, meaning it comes from within the story world, like a radio a character turns on. Non-diegetic music, such as an orchestral score, is heard only by the audience. A composer writes the score, often working closely with the director and the editor. Directors may also use existing songs, which need licensing.

Music can underline emotion, create contrast, or be absent. Silence can be powerful, and some directors deliberately hold back on music so that key moments stand out. A common beginner mistake is to use music to tell the audience how to feel when the scene already does so.

Sound can also lead the picture. Hearing a noise before seeing its source builds suspense.

Example: in a scene where a girl waits for news in a hospital corridor, the director removes the score entirely and lets the faint hum of the lights and distant footsteps fill the space, making the waiting feel long.`,
          },
        ],
      },
      {
        id: 'film-directing.t5',
        title: 'Crew, Set and Forms',
        blurb: 'Collaborating with key departments, running a shooting day, keeping people safe, and how directing changes across kinds of film.',
        level: 'INTERMEDIATE',
        lessons: [
          {
            id: L19,
            title: 'Working with the Key Collaborators',
            blurb: 'The director works most closely with the cinematographer, production designer and editor, and each relationship has its own rhythm.',
            minutes: 7,
            body: `No director makes a film alone. Three of the closest collaborators are the director of photography, the production designer and the editor.

The director of photography, also called the cinematographer or DP, is responsible for the image: lighting, camera choices and the look of the film. The director describes the story and feeling, and the DP proposes ways to achieve them through lenses, light and camera movement. On most sets the DP leads the camera and lighting crews, while the director focuses on performance and overall intent, though how responsibilities divide differs from person to person.

The production designer leads the art department and creates the physical world, including sets, locations and props. They work with the costume designer and the DP so that colour, texture and light work together. A director shares references and talks about the characters, then reviews drawings, models and photographs before anything is built.

The editor assembles the footage. Many productions have an editor cutting during the shoot, so the director sees whether scenes work while there is still time to fix them. Later the director and editor work closely in a cutting room. A good editor brings fresh eyes, because they see only what is on the screen, not what was intended.

Good collaboration needs clarity and trust. Directors do best when they explain goals instead of dictating every detail, listen to specialists, and decide firmly when there is disagreement. Credit and respect matter too: a crew that feels valued tends to work better.

Example: a director tells the DP that a hospital scene should feel 'cold but not sterile.' The DP suggests soft, slightly green-tinted fluorescent light, and the production designer adds warm, worn wooden furniture, so the room feels human.`,
          },
          {
            id: L20,
            title: 'Scheduling, the Shooting Day and Set Safety',
            blurb: 'A director leads a set by managing time, communicating clearly, and treating safety as non-negotiable.',
            minutes: 8,
            body: `A shooting day is a puzzle with limited time. The schedule is usually built by the producer and first assistant director (first AD) from a breakdown of the script. Scenes are often shot out of story order to group them by location, cast availability and equipment. The first AD runs the set day to day, keeping time, calling for quiet and moving the crew, so the director can focus on creative decisions. Each evening the production issues a call sheet listing the next day's scenes, locations, cast and crew call times.

Days are long, and how many script pages get shot varies widely: a complex action scene may fill a whole day, while a dialogue scene may take far less.

Leadership on set matters. A director sets the tone: calm, clear and respectful leadership helps people do their best work. They know which shots are essential if time runs short. They communicate decisions through the first AD and the department heads so that instructions reach the right people.

Safety is the director's responsibility alongside the whole production. Stunts, vehicles, heights, water, fire, special effects and weapons need qualified specialists and agreed procedures. Props that look like weapons should be handled by trained professionals under strict rules. Intimate scenes should be planned in advance, with clear consent and, increasingly, an intimacy coordinator. No shot is worth a person's safety, and anyone should be able to raise a concern.

Example: when a scene calls for a car to skid on wet pavement, the director meets the stunt coordinator and the first AD beforehand, walks through the plan with the cast and crew, and only then shoots, with safety staff in position.`,
          },
          {
            id: L21,
            title: 'Documentary, Animation, Shorts and Features',
            blurb: 'The director\'s job changes in shape across different kinds of film, though the core questions stay the same.',
            minutes: 7,
            body: `Directing is not one fixed activity. The core questions, what is the story and how should it be told, apply everywhere, but the practice changes by form.

In documentary, the subject is real people and events. Some documentaries use observational methods, where the filmmaker watches events unfold without staging them; others use interviews, archive material, narration or reconstructions. Documentary directors face ethical questions about consent, fairness and representation, and much of the story is found and shaped in the edit. The early documentary Nanook of the North (1922) by Robert Flaherty is often discussed because parts of it were staged, which shows how long the line between recording and constructing has been debated.

In animation, nothing exists until it is made, so planning is intense. Directors rely on storyboards and animatics, and the work is divided among many artists over a long time. Voice recording is often done early in the process, and a director guides the voice performances while shaping the animation.

A short film runs far less time than a feature, and is often a calling card for new directors, a festival piece or an experimental form. Shorts have small budgets and crews, so directors may take on several roles. A feature film, usually understood as around 40 minutes or more under many industry definitions (some unions and countries set the line higher), needs larger teams, longer schedules and more sustained storytelling.

Across all forms, the director guards the idea of the film, and works within the constraints of the form.

Example: a director making a ten-minute short about a lost key chooses a single location and two actors, because the small scale lets the story stay focused and keeps the shoot to two days.`,
          },
        ],
      },
      {
        id: 'film-directing.t6',
        title: 'Styles, Post and Careers',
        blurb: 'How well-known directors have approached the work, how notes and post-production shape a film, and how directors find audiences and careers.',
        level: 'ADVANCED',
        lessons: [
          {
            id: L22,
            title: 'Directing Approaches: Hitchcock to DuVernay',
            blurb: 'Directors have worked in very different ways; looking at a few well-documented approaches shows that there is no single method.',
            minutes: 8,
            body: `There is no single correct way to direct. The directors below are discussed here only for approaches that are widely documented, and film scholars debate how to interpret them.

Alfred Hitchcock (1899-1980) is known for careful planning and for building suspense through camera and editing choices; Rear Window (1954) keeps us largely in one apartment, seeing through the eyes of its protagonist. Akira Kurosawa (1910-1998) directed Rashomon (1950) and Seven Samurai (1954), and is often described as using several cameras to film action, and as using weather and movement expressively; he also frequently edited his own films. Yasujiro Ozu (1903-1963), director of Tokyo Story (1953), is known for a quiet style of low, mostly static camera positions and domestic stories.

Stanley Kubrick (1928-1999) was known for exacting control and extensive preparation; his film Barry Lyndon (1975) is famous for scenes lit largely by candlelight, using very fast lenses. Agnes Varda (1928-2019), associated with the French New Wave, moved between fiction and documentary, in films such as Cleo from 5 to 7 (1962) and The Gleaners and I (2000). Spike Lee made Do the Right Thing (1989) and is known for engaging with race and community in New York; a camera move often associated with him is a shot sometimes described as a double dolly. Ava DuVernay directed Selma (2014), the documentary 13th (2016) and the series When They See Us (2019), and has also worked on distribution to support films by Black filmmakers and other underrepresented groups.

What these directors share is a recognisable viewpoint backed by craft; their methods differ because methods follow temperament and story.

Example of use: a student making a quiet family drama might study Ozu's patient framing, while another making a thriller might study Hitchcock's planning, then adapt rather than copy.`,
          },
          {
            id: L23,
            title: 'Notes, Post-Production and Final Cut',
            blurb: 'After the shoot the director shapes the film through cuts, feedback and finishing, and the final say is often limited.',
            minutes: 7,
            body: `Post-production is where a film is built a second time. The editor assembles a first cut, often called an assembly, which is usually long and rough. The director then works with the editor over many passes, trimming, reordering, and sometimes reconsidering scenes. A well-known idea is that a film is written three times: on the page, on set and in the edit.

Directors receive notes, which are comments from others about the cut. Producers, studios, financiers, test audiences and trusted friends may all give them. Test screenings show a film to a sample audience whose reactions are recorded. Notes can be vague, so directors learn to look for the problem behind a suggestion: if someone says 'cut the middle,' the real issue might be pacing, confusion or a scene that repeats information. A good response is to listen without defensiveness, then decide what to change and what to protect.

At some point the cut is locked, called picture lock, so that other departments can finish. Sound editors and mixers build the final sound, a composer completes the score, visual effects are delivered, and a colourist adjusts colour and contrast in the grade. The finished film is then prepared for delivery in the formats a distributor needs.

The question of who has final cut, the last word on the finished film, is set by contract. Directors sometimes have it, but on many films the studio or producer does. Versions called a director's cut can differ from the release version.

Example: after a test screening, viewers say a character feels 'unlikeable.' The director and editor discover that a single early scene shows her being cruel with no context, so they move a scene of her vulnerability earlier, and the reaction softens.`,
          },
          {
            id: L24,
            title: 'Festivals, Distribution and a Career in Directing',
            blurb: 'Finished films find audiences through festivals, distributors and platforms, and directing careers are built step by step.',
            minutes: 7,
            body: `A finished film still needs viewers. Many independent films begin their journey at film festivals, events where films are screened for audiences, critics, programmers and buyers. Well-known festivals include Sundance, Cannes, Venice, Berlin, Toronto and South by Southwest, along with many regional and specialised festivals. Festivals usually have submission fees, entry rules and sometimes premiere requirements, such as being first shown there, so a filmmaker should check each carefully.

Beyond festivals, distribution is how a film reaches the public: theatrical release, streaming services, television, home video, or direct release by the filmmaker. A sales agent or distributor may acquire rights in exchange for a share of income. Terms vary a great deal, and filmmakers should read contracts carefully and seek advice from an entertainment lawyer.

Careers rarely begin with a large feature. A common route is to make shorts, build a reel of work, direct small projects such as music videos or commercials, and find collaborators who will grow together. Others begin in another job, such as editing, camera work or assistant directing, and move up. Some directors learn through film school, others through hands-on experience. No one route is required.

Skills beyond filmmaking matter too: communication, pitching, taking feedback, managing people, and persistence. Directors also face uncertainty, because work can be irregular and many projects never get made. Unions and guilds, such as the Directors Guild of America in the United States, set standards for professional directors in some markets.

The most useful habit is to finish things. Each completed film teaches more than an unfinished plan.

Example: a student finishes a six-minute short, submits it to a handful of carefully chosen festivals, and uses the response, plus the lessons from the edit, to plan a slightly more ambitious next film.`,
          },
        ],
      },
    ],
  },
  bank: {
    curriculumId: 'film-directing',
    questions: [
      // L01
      tf(L01, 1, 1, "A director is mainly responsible for the creative interpretation of the script and for guiding the people who bring it to the screen.", 0, "Think about the one person who keeps everyone's work pointed the same way.", "The director interprets the story and guides actors and departments so their work fits together."),
      mc(L01, 2, 1, "Which task usually belongs to a producer rather than to the director?", ["Handling money, hiring and business decisions", "Guiding an actor through a scene", "Deciding with the cinematographer where the camera goes", "Choosing the mood of the film"], "One of these is about budgets and logistics.", "Producers typically manage finance, schedules and hiring, while directors lead the creative side."),
      tf(L01, 3, 1, "A director always has complete control over the finished film.", 1, "Consider budgets, financiers and contracts.", "Budgets, studios, financiers and contracts limit a director's control, and final say varies from film to film."),
      mc(L01, 4, 2, "A director asks the cinematographer for quiet, simple, steady frames because the story is restrained. Which part of the job is this?", ["Deciding what the film should look and feel like", "Operating the lights and running the cameras personally", "Arranging the shooting schedule and call times for the crew", "Recording and mixing the dialogue on location"], "It is about interpretation, not operating equipment.", "Choosing the look and feel with the cinematographer is part of the director's creative interpretation."),
      mc(L01, 5, 3, "Two films on the same set of events end up feeling very different. What most likely explains this?", ["Different directorial choices about tone and how to tell the story", "The scripts were far longer or shorter than each other", "The films were shot on different brands of camera", "One of the films was made without any actors"], "What does a director decide beyond the plot?", "Interpretation, tone and the choices made with collaborators can make the same material feel different."),
      // L02
      mc(L02, 1, 1, "In which stage does the director often discover what the film really is, because the story can be reshaped?", ["Post-production", "Development stage", "Casting stage only", "Distribution stage"], "It happens after the footage is recorded.", "In the edit the footage is assembled and the shape of the story can change."),
      tf(L02, 2, 1, "Pre-production is the stage where planning happens, such as casting, location visits and shot lists.", 0, "It comes before the cameras roll.", "Pre-production is the planning stage, when problems are cheapest to solve."),
      mc(L02, 3, 2, "Who runs the schedule on set day to day, so the director can focus on creative decisions?", ["The first assistant director", "The composer who wrote the music", "The picture editor in the edit suite", "The foreign sales agent at the festival"], "This person calls for quiet and keeps time.", "The first assistant director manages the set schedule and crew movement."),
      mc(L02, 4, 2, "Why is planning in pre-production said to be so valuable?", ["Mistakes are cheaper to fix before expensive shooting days", "Planning removes the need to hire actors for the shoot", "Cameras only work if every shot is fully planned", "The editor will not need any footage to cut later"], "Think about the cost of a shoot day.", "Every hour on set is expensive, so solving problems earlier saves money and time."),
      tf(L02, 5, 3, "Because the stages overlap, some films need extra shooting, called pickups, after principal photography has ended.", 0, "Do the stages always happen in a strict sequence?", "Stages overlap in practice, and extra shoots called pickups sometimes happen later."),
      // L03
      mc(L03, 1, 1, "What is the difference between plot and theme?", ["Plot is what happens; theme is what the events add up to", "Plot is the music and sound; theme is the lighting and colour", "Plot is the title of the film; theme is the cast list", "There is no real difference between plot and theme at all"], "One is about events, the other about meaning.", "Plot is the sequence of events, while theme is the underlying idea they suggest."),
      tf(L03, 2, 1, "Subtext means the meaning that lies beneath the words characters actually say.", 0, "Think of an argument about dishes that is really about something else.", "Subtext is the unspoken meaning beneath the dialogue."),
      mc(L03, 3, 2, "A director reading a scene asks what each character wants, what stops them, and how things are different at the end. What is this method for?", ["Checking that the scene has a change and understanding its beats", "Choosing which lens and camera body to use for the day on set", "Working out the budget and the shooting schedule for the whole scene in advance", "Selecting and licensing the music for the final cut"], "It tests whether anything happens in a scene.", "A scene where nothing changes is a warning sign, and the questions reveal beats and change."),
      tf(L03, 4, 2, "The three-act structure is an unbreakable law that every good film must follow.", 1, "The lesson calls it a useful model.", "It is one useful model; many good films do not follow it."),
      mc(L03, 5, 3, "A script says two characters only talk about the weather, but the real beat is her fear of losing her father. What should the director plan for?", ["Pauses and small physical business that carry the unspoken feeling", "Cutting the scene because it has no real event in it", "Making the dialogue louder so the weather talk is noticed", "Adding narration that explains her fear to the audience"], "Dialogue is not the only way to show feeling.", "Subtext can be carried by performance, pauses and physical action."),
      // L04
      mc(L04, 1, 1, "What is tone?", ["The overall mood or attitude of a film", "The volume and loudness of the recorded dialogue", "The total running length of the finished film", "The number of crew members employed on the shoot"], "Think tense, tender or playful.", "Tone is the general mood or attitude, such as tense, tender or wry."),
      tf(L04, 2, 1, "A reference image or film clip is meant to be discussed with the team, not copied exactly.", 0, "References help people see what you mean.", "Directors use references to talk about light, colour and framing, not to copy."),
      mc(L04, 3, 2, "Which statement of vision is the most useful to a crew?", ["The house should feel too large for the family, so we often frame them small in wide, still shots", "Make it cool and stylish, like the most popular films that audiences love and remember for years afterwards", "Make it emotional, so that the audience feels something strongly all the way through", "Make it good, with every department doing its best work to a high standard"], "Look for a statement that tells people what to do.", "A specific idea guides concrete decisions; vague words say little."),
      tf(L04, 4, 2, "A comedy can turn serious without feeling jarring if the film prepares the audience for the shift.", 0, "Consider whether tone may ever change on purpose.", "Tone can shift deliberately, provided the film prepares the audience."),
      mc(L04, 5, 3, "A director wants a ghost story where fear comes from stillness. Which pair of choices fits that vision?", ["Slow camera moves and sparse sound", "Frequent loud shocks and rapid cutting", "Constant handheld movement and loud music", "Bright comedic lighting and fast dialogue"], "Match choices to the stated idea of stillness.", "Slow moves and sparse sound support fear that grows from stillness."),
      // L05
      tf(L05, 1, 1, "Casting is mostly about finding actors who can bring the emotional truth of the character, not only the right appearance.", 0, "Ability to play the life of the character matters.", "Appearance counts, but the emotional truth an actor brings matters more."),
      mc(L05, 2, 1, "What is a callback?", ["A second meeting where the best candidates read again", "A recording session for finished dialogue", "A final payment made to the crew after wrap", "A published review written by critics"], "It follows the first audition.", "Callbacks let the director see the strongest candidates again, often trying different directions."),
      mc(L05, 3, 2, "What does a chemistry read help a director test?", ["Whether two actors work well together on screen", "Whether an actor can also operate a camera well", "Whether a location is available on the shooting dates", "Whether the script is too long for the shoot schedule"], "Think about two actors at once.", "A chemistry read pairs possible actors to see their connection."),
      tf(L05, 4, 2, "How an actor responds to direction in an audition can be useful information for a director.", 0, "A director will work with this person on many takes.", "An actor who adjusts quickly to direction is valuable on set."),
      mc(L05, 5, 3, "Besides performance, which of these can legitimately affect casting decisions?", ["Availability and budget", "The actor's favourite colour", "The length of the actor's name", "The weather on audition day"], "Think of practical constraints.", "Availability, budget and funding considerations are real practical factors in casting."),
      // L06
      mc(L06, 1, 1, "What is a table read?", ["The cast reading the whole script aloud together", "A meeting with the crew to plan the catering", "A test of camera lenses around a table", "Editing the first assembly of a film at a table"], "It involves hearing the script rather than filming it.", "A table read lets everyone hear the story as a whole and notice weak dialogue."),
      tf(L06, 2, 1, "Rehearsal is time for exploring the script before the cost and pressure of filming.", 0, "Compare it with a shoot day.", "Rehearsal lets director and actors explore away from the camera."),
      mc(L06, 3, 2, "Which is a reason some directors prefer light rehearsal?", ["It can keep performances fresh and spontaneous", "It makes dialogue louder and clearer on the recording", "Cameras cannot record scenes that were rehearsed before", "It always saves money in the production budget"], "Think of a performance becoming stale.", "Too much rehearsal may dull spontaneity, though heavy rehearsal also has benefits."),
      tf(L06, 4, 2, "The lesson presents heavy rehearsal as always better than light rehearsal.", 1, "It describes this as a real debate.", "Good directors choose according to the film, the actors and the schedule."),
      mc(L06, 5, 3, "In rehearsal the actors keep drifting toward the window. What is a sensible director response?", ["Consider using that movement in the blocking", "Tell them firmly to stop moving around entirely", "Cancel the scene until they stay in one place", "Close the curtains and carry on ignoring the habit"], "Natural impulses can be useful information.", "Watching where actors naturally move can shape blocking that feels real."),
      // L07
      mc(L07, 1, 1, "What is blocking?", ["Planning where actors stand and move in relation to each other and the camera", "Hiding the camera behind furniture so the actors forget it is there", "Cutting a long scene into shorter pieces in the edit", "Checking sound levels on set before each take"], "The word comes from theatre.", "Blocking is the planned positions and movements of actors."),
      tf(L07, 2, 1, "Blocking can tell the story physically, such as showing who has power through who stands and who sits.", 0, "Distance and height carry meaning.", "Position and movement suggest power, closeness or tension."),
      mc(L07, 3, 2, "What is a mark in film work?", ["A piece of tape on the floor showing where an actor should stop", "A note written in the margin of the script by the director for the actors", "A grade given to a take by the editor after the shoot", "A camera setting that fixes the exposure for the scene"], "It helps keep actors in focus and in frame.", "Marks help actors stop in the right spot for focus, light and framing."),
      mc(L07, 4, 2, "What does it mean for blocking to be motivated?", ["Each move has a reason rooted in the character's wants", "The actors are paid extra for the harder movement", "The crew has formally approved every move in advance", "The move is as large and dramatic as it can be"], "Think of why a character would cross the room.", "Motivated moves come from what the character wants, not from random movement."),
      tf(L07, 5, 3, "Blocking only has to work for the room, and the camera position does not matter.", 1, "The camera is the audience.", "Blocking must also work for the camera so the shot can be framed and lit."),
      // L08
      mc(L08, 1, 1, "Which instruction is an action direction rather than a result direction?", ["Try to get her to stop talking", "Look sadder in this moment, please", "Be angrier when you say it", "Seem more nervous before the door opens"], "Which one gives the actor something to do?", "Action directions give a doable aim; result directions ask for an outcome to display."),
      tf(L08, 2, 1, "Many modern acting approaches descend from the work of Konstantin Stanislavski, who stressed what a character wants and tries to do.", 0, "Recall the Russian theatre practitioner.", "Stanislavski's emphasis on wants and actions influenced many later approaches."),
      mc(L08, 3, 2, "After a take, which approach to giving feedback does the lesson suggest?", ["Speak privately and give one clear adjustment", "Read out a long list of notes to everyone", "Correct the actor loudly in front of the crew", "Say nothing and shoot again"], "Think about brevity and privacy.", "Private, brief and specific notes are easier for an actor to use."),
      tf(L08, 4, 2, "An actor can usually play a feeling such as sad directly, which is why result directions work best.", 1, "Consider trying to show an emotion on command.", "Trying to show an emotion often looks forced; actions lead to more natural behaviour."),
      mc(L08, 5, 3, "An actor keeps delivering a line with obvious warmth. Which direction would most likely change it in a useful way?", ["You are afraid that if you say it, he will leave", "Say it better and with more conviction this time", "Say it louder so the whole room can hear it", "Say it with more feeling and emotion"], "Pick the one that gives the character a situation and motive.", "A specific, playable motive changes the performance more than a general request."),
      // L09
      mc(L09, 1, 1, "Why might a close-up call for a smaller performance than a wide shot?", ["The camera is near enough to see tiny movements", "Close-ups have no sound recorded with them", "Actors are paid less for close-up work", "Wide shots hide the actor completely from view"], "Think about how near the lens is.", "A close camera catches small expressions, so less physical energy is needed."),
      tf(L09, 2, 1, "A script supervisor keeps notes on details such as dialogue and prop positions for continuity.", 0, "Scenes are shot in pieces and out of order.", "The script supervisor tracks continuity so shots can be joined."),
      mc(L09, 3, 2, "An actor holds a glass in the right hand in the wide shot. What should happen in the close-up?", ["The glass should be in the right hand too", "The glass should switch to the left hand now", "The glass should be taken out of the shot entirely", "It does not matter because viewers will not notice"], "The editor must be able to join the shots.", "Matching actions across angles allows the editor to cut smoothly."),
      tf(L09, 4, 2, "Repeating a scene many times can wear down spontaneity, so a director watches for the point where performance stops improving.", 0, "Consider energy across takes.", "Some performances peak early, and directors decide when to move on or try something new."),
      mc(L09, 5, 3, "A director sees an actress crying on every take and starting to look tired. What helpful step is described?", ["Take a short break, then try holding the tears back for a quieter option", "Ask for twenty more identical takes until she finally looks fresh again, however tired she is", "Skip the scene entirely and move on to the next one in the schedule", "Replace the actress with someone who cries less easily"], "Offer variation and care for the actor.", "A break and a different approach gives the editor options and protects the actor."),
      // L10
      mc(L10, 1, 1, "Which shot size typically shows a person from about the waist up?", ["Medium shot", "Extreme close-up", "Wide shot", "Full shot"], "Between a full shot and a close-up.", "A medium shot is roughly waist up."),
      tf(L10, 2, 1, "A low-angle shot looks up at a subject and can make it seem imposing.", 0, "Where is the camera relative to the subject?", "Low angles tend to make subjects look powerful, though context matters."),
      mc(L10, 3, 2, "What is a Dutch angle?", ["A camera tilted so the horizon is slanted", "A very high shot looking straight down on the subject", "A shot framed through a doorway or window", "A shot that uses a zoom to move closer"], "It is often used to suggest unease.", "A Dutch angle tilts the horizon, often to create uneasy feelings."),
      tf(L10, 4, 2, "A low angle always makes a character look heroic, whatever the film.", 1, "Meaning comes from context.", "The lesson says these effects are tendencies; a low angle can feel comic or heroic depending on context."),
      mc(L10, 5, 3, "A director cuts from a wide, slightly high shot of a nervous student to a close-up of her face. What does the change of shot size do?", ["Moves the audience from the room to her feelings", "Hides the character from the audience for a moment", "Changes the time of day in the story world", "Tells the audience that the film is now over"], "Consider what each size is good at showing.", "Wide shots show surroundings and close-ups bring us into feelings."),
      // L11
      mc(L11, 1, 1, "Which movement turns the camera left or right from a fixed position?", ["Pan", "Tilt", "Dolly", "Crane"], "Think of turning your head.", "A pan swings the camera horizontally without moving its position."),
      mc(L11, 2, 2, "What is the main difference between a dolly move and a zoom?", ["A dolly moves the camera itself, while a zoom changes the lens focal length", "A dolly is always held by hand and never uses tracks or wheels", "A zoom physically moves the camera along a set of tracks", "There is no difference between a dolly and a zoom"], "One changes position; the other changes the lens.", "Zooming alters focal length, whereas a dolly physically moves the camera."),
      tf(L11, 3, 2, "A camera move should have a reason in the story, such as following a character or revealing information.", 0, "The lesson uses the word motivated.", "Motivated movement serves the story; movement for its own sake can feel like showing off."),
      mc(L11, 4, 3, "The dolly zoom is closely associated with which film?", ["Vertigo (1958)", "Rashomon (1950)", "Tokyo Story (1953)", "Selma (2014)"], "Think of a famous 1950s thriller about heights and obsession.", "The dolly zoom is closely associated with Hitchcock's Vertigo."),
      tf(L11, 5, 1, "A Steadicam is a stabilising rig worn by the operator that allows smooth moves while walking.", 0, "It is not a tripod.", "Steadicam steadies the camera so a walking operator can produce smooth shots."),
      // L12
      mc(L12, 1, 1, "What does a shorter focal length generally give?", ["A wider view", "A narrower view", "A louder sound", "A longer film"], "Think of wide-angle lenses.", "Shorter focal lengths show more of the scene."),
      tf(L12, 2, 1, "Telephoto lenses tend to compress space, making background objects look nearer to the subject.", 0, "Long lenses magnify distant things.", "Long focal lengths seem to flatten depth."),
      mc(L12, 3, 2, "What is depth of field?", ["How much of the image is in focus", "How loud the music is in the mix", "How long a single shot lasts on screen", "How far the camera travels along its track"], "It concerns sharpness.", "Shallow depth of field keeps only part of the image sharp, while deep depth of field keeps most of it sharp."),
      mc(L12, 4, 2, "Why might a director choose shallow depth of field for a close-up?", ["It isolates the subject and guides attention", "It makes the sound clearer for the whole audience", "It makes the background more detailed and sharp", "It reduces the need for actors in the final scene"], "Consider blurred backgrounds.", "A shallow depth of field blurs distractions and directs attention to the subject."),
      tf(L12, 5, 3, "The exact millimetre ranges for wide, normal and telephoto lenses depend on the size of the camera sensor or film frame.", 0, "The lesson calls ranges guides, not fixed rules.", "Because sensor size changes the field of view, millimetre ranges are only guides."),
      // L13
      mc(L13, 1, 1, "What is a master shot?", ["A wider view capturing the whole scene from start to end", "A close-up of a hand holding an important prop", "A shot taken by the editor in post", "A shot of the clapperboard at the start"], "It is usually the widest.", "A master covers the scene's action, often with all the characters in frame."),
      tf(L13, 2, 1, "Coverage means shooting a scene from different angles and sizes so the editor has options.", 0, "It is about giving the editor choices.", "Coverage gives flexibility when assembling the scene."),
      mc(L13, 3, 2, "What is a cutaway?", ["A shot of a detail or element away from the main action", "A shot that removes one character from the scene", "A deleted scene cut from the final film", "A change of location between two scenes"], "Think of an insert of a clock or a letter.", "A cutaway shows something else and can help an editor trim or join takes."),
      mc(L13, 4, 2, "What is a trade-off of heavy coverage?", ["It takes time, and time is money", "It makes the actors forget their lines", "It prevents the editor from cutting freely", "It removes the need for a master shot"], "Consider the shoot schedule.", "Heavy coverage gives flexibility but uses limited shooting time."),
      tf(L13, 5, 3, "Good coverage is designed in advance around what the scene needs the audience to see.", 0, "The lesson says it is not random.", "Directors decide where the audience should look and what must be seen."),
      // L14
      mc(L14, 1, 1, "What does the 180-degree rule help protect?", ["The audience's sense of who is where on screen", "The sound quality of the recorded dialogue and the effects", "The physical safety of the actors on set", "The final running length of the film"], "It concerns left and right positions.", "Keeping the camera on one side of the axis preserves screen positions."),
      tf(L14, 2, 1, "The axis of action is an imaginary line between two characters.", 0, "The rule is built around this line.", "The axis runs between the characters, and the camera stays on one side."),
      mc(L14, 3, 2, "A car moves left to right in one shot. What does the rule suggest for the next shot of the car?", ["It should usually move left to right as well", "It should move right to left instead, to keep the shots varied", "It should be stationary in the frame for the whole shot", "It should leave the frame upward"], "Screen direction should stay consistent.", "Reversing direction can make viewers think the car turned around."),
      mc(L14, 4, 2, "Which approach can help a director smoothly cross the line?", ["Moving the camera across it within a shot", "Cutting between angles at random", "Removing all sound from the cut", "Swapping the actors costumes between shots"], "The lesson lists several ways.", "Showing the camera move across the line, or using a neutral shot, helps avoid confusion."),
      tf(L14, 5, 3, "Filmmakers are never permitted to break the 180-degree rule.", 1, "The lesson calls these guidelines.", "Some filmmakers break it on purpose for disorientation or other effects."),
      // L15
      mc(L15, 1, 1, "What is a shot list?", ["An ordered list of shots needed for each scene", "A list of the actors and their agents for each scene", "The finished edit of the film laid out in order", "A list of the festival entries planned for the year"], "It helps the first AD estimate time.", "A shot list sets out the shots planned for each scene."),
      tf(L15, 2, 1, "A storyboard is a sequence of drawings showing how shots will look.", 0, "Think of a comic strip.", "Storyboards depict planned shots, especially for complex sequences."),
      mc(L15, 3, 2, "Which type of scene benefits most from detailed storyboards?", ["Action, stunts and complex camera moves", "A single person sitting still in a room", "A scene with no camera movement at all", "A radio interview recorded in a booth"], "Many departments must agree on exactly what is filmed.", "Storyboards help coordinate many departments on complex sequences."),
      mc(L15, 4, 2, "What is an animatic?", ["A rough moving version of a storyboard with timing", "A kind of lens used for very wide shots indoors and in small rooms", "A type of microphone used on the boom pole to catch quiet dialogue", "A casting list of actors for a single role"], "It adds time to the drawings.", "An animatic lets pacing be judged before filming."),
      tf(L15, 5, 3, "Every successful director must storyboard every shot.", 1, "Planning styles vary.", "Some directors plan meticulously and others respond to the day, and neither guarantees success."),
      // L16
      mc(L16, 1, 1, "What does mise-en-scene refer to?", ["Everything arranged in front of the camera", "The rhythm and pace of the editing", "The musical score and its themes", "The plan for distributing the finished film"], "It is a French term meaning placing on stage.", "It includes sets, props, costume, lighting, actor positions and composition."),
      tf(L16, 2, 1, "The rule of thirds places key elements along the lines of a three by three grid dividing the frame.", 0, "It is a composition tool.", "The rule of thirds is a familiar composition tool."),
      mc(L16, 3, 2, "Why do directors build their own colour scheme instead of assuming a colour has one fixed meaning?", ["Colour meaning depends on the story and culture", "Colour has no effect on how an audience feels", "Cameras cannot record colour accurately", "Colour is chosen by the audience in the cinema"], "Meanings shift with context.", "A consistent scheme within the film matters more than assumed universal meanings."),
      tf(L16, 4, 2, "High-contrast lighting with strong shadows tends to feel dramatic or tense.", 0, "Compare it with soft, even light.", "Contrast strongly shapes mood."),
      mc(L16, 5, 3, "A film shows cluttered, dim rooms at home and bright, empty offices elsewhere to show family pressure. What does this illustrate?", ["Using mise-en-scene as visual language", "Continuity editing across a scene change", "ADR, the replacing of dialogue later in post", "Coverage, shooting a scene from many angles"], "It is about design and lighting meaning something.", "Set design and lighting can express a story's pressures without dialogue."),
      // L17
      mc(L17, 1, 1, "What is a match on action?", ["A cut made in the middle of a movement to hide the join", "A cut between two songs on the soundtrack", "A cut to black at the end of a scene", "A cut that visibly skips ahead in time"], "Think of a hand opening a door.", "Cutting during a movement makes the join feel smooth."),
      tf(L17, 2, 1, "Continuity editing aims to make cuts smooth so the audience follows the story without noticing the joins.", 0, "It relies on consistency.", "Consistent props, light and action support smooth cutting."),
      mc(L17, 3, 2, "What is the core idea of montage theory as discussed in the lesson?", ["Placing shots together creates meaning neither has alone", "Every shot in a film must be held for a long time", "Sound should never be combined with pictures", "Actors should be kept out of the frame entirely"], "Soviet filmmakers explored this.", "Eisenstein and others explored how shot order creates ideas."),
      tf(L17, 4, 2, "A jump cut deliberately skips time within a single angle and calls attention to itself.", 0, "It is the opposite of an invisible cut.", "Jump cuts break smooth continuity on purpose."),
      mc(L17, 5, 3, "Which film is given in the lesson as a famous montage example studied in film courses?", ["Battleship Potemkin (1925)", "Do the Right Thing (1989) by Spike Lee", "Battle of Algiers (1966)", "Barry Lyndon (1975)"], "Think of a silent-era Soviet film.", "Battleship Potemkin is a widely studied example of montage."),
      // L18
      mc(L18, 1, 1, "What is diegetic music?", ["Music that comes from within the story world", "Music only the audience hears, not the characters", "Music added to the film long after its release", "Silence used in place of any soundtrack at all"], "A radio a character turns on is one example.", "Diegetic sound is heard by the characters in the story."),
      tf(L18, 2, 1, "ADR means re-recording dialogue after the shoot when production sound is not usable.", 0, "Noisy takes may need replacing.", "Automated dialogue replacement is used to re-record lines."),
      mc(L18, 3, 2, "What are Foley artists known for?", ["Performing sound effects in a studio while watching the picture", "Operating the boom pole above the actors during a take, then mixing the dialogue", "Composing the score for the finished film", "Writing the screenplay for the director"], "They perform sounds such as footsteps.", "Foley artists create many specific sounds after the shoot."),
      mc(L18, 4, 2, "What is room tone and why is it recorded?", ["A minute of silence in a location, used to fill gaps", "A song written about the room for the credits", "The echo that remains after a line of dialogue", "A type of lens used for small interiors"], "Editors need background sound for gaps.", "Room tone gives editors consistent ambience to smooth edits."),
      tf(L18, 5, 3, "A common beginner mistake is to use music to tell the audience how to feel when the scene already does so.", 0, "Think about over-explaining emotion.", "Music can underline emotion, but overuse can duplicate what the scene already shows."),
      // L19
      mc(L19, 1, 1, "Who is primarily responsible for the image, including lighting and camera choices?", ["The director of photography", "The composer, who writes the score", "The first assistant director", "The foreign sales agent"], "It is also called the cinematographer.", "The DP leads the lighting and camera crews to create the look."),
      tf(L19, 2, 1, "The production designer leads the art department and creates the physical world of the film.", 0, "Sets, locations and props.", "Production designers shape sets, locations and props, working with costume and DP."),
      mc(L19, 3, 2, "Why does an editor often cut during the shoot?", ["So the director can see whether scenes work while there is still time to fix them", "So the studio can avoid hiring actors for reshoots later on", "Because the editing of a film must finish before shooting even starts", "So the editor can replace the director in post"], "Think about what can still be re-shot.", "Early cutting reveals problems while the production is still shooting."),
      tf(L19, 4, 2, "Good collaboration generally means explaining goals and trusting specialists instead of dictating every detail.", 0, "Directors still decide firmly when needed.", "Clarity and trust help departments do their best work."),
      mc(L19, 5, 3, "A director says a hospital scene should be cold but not sterile. How is this best handled?", ["The DP and designer propose light and furniture that balance cold and human", "The director rewrites the script so the hospital scene disappears completely", "The editor simply adds cold music over the whole scene and leaves the rest alone", "The scene is cut because the mood cannot be achieved"], "Departments translate a feeling into choices.", "Light and set choices combine to realise the described feeling."),
      // L20
      mc(L20, 1, 1, "What is a call sheet?", ["A document listing the next day's scenes, locations and call times", "A contract signed between the director and the studio before the shoot", "A list of festival entries and their deadlines", "A storyboard showing every shot planned for the day"], "It is issued each evening.", "Call sheets tell the cast and crew where and when to be."),
      tf(L20, 2, 1, "Scenes are often shot out of story order to group them by location, cast and equipment.", 0, "Efficiency drives the schedule.", "Shooting out of order saves time and money."),
      mc(L20, 3, 2, "Which statement best reflects the lesson on safety?", ["No shot is worth a person's safety, and anyone can raise a concern", "Safety is the job of the stunt team and nobody else on the crew", "Safety matters only on large productions with big budgets and a dedicated stunt unit", "A director should never discuss safety with the cast"], "It is shared across the production.", "Safety is a shared responsibility with qualified specialists and procedures."),
      tf(L20, 4, 2, "Props that look like weapons should be handled by trained professionals under strict rules.", 0, "Consider the risks.", "Weapons and weapon-like props call for specialists and agreed procedures."),
      mc(L20, 5, 3, "Before shooting a car skid on wet pavement, what should the director do?", ["Meet the stunt coordinator and first AD, plan it, and walk through it with cast and crew", "Shoot it immediately while the weather and light are right, then review the safety afterwards with the crew", "Let the actors drive the car without any planning or rehearsal, so it looks natural", "Cut the scene without telling the crew or the cast, to avoid any argument over it"], "Preparation is key.", "Stunts require planning and briefing before cameras roll."),
      // L21
      mc(L21, 1, 1, "Which kind of film has a subject that is real people and events?", ["Documentary", "Animation", "Music video only", "Trailer"], "It is the form that records reality.", "Documentaries deal with real subjects, though they are still shaped by choices."),
      tf(L21, 2, 1, "Documentary directors face ethical questions about consent, fairness and representation.", 0, "Real people appear on screen.", "These questions are central in documentary work."),
      mc(L21, 3, 2, "Why is Nanook of the North (1922) often discussed in documentary courses?", ["Parts of it were staged, showing how long the line between recording and constructing has been debated", "It was the first feature film ever made with synchronised sound", "It was an animated film using hand-drawn figures", "It was banned on release for being too short to screen"], "It concerns how real a documentary is.", "It illustrates the long debate on staging in documentary."),
      tf(L21, 4, 2, "In animation, planning is intense because nothing exists until it is made.", 0, "Storyboards and animatics are central.", "Animation needs thorough planning since each frame is created."),
      mc(L21, 5, 3, "Why might a director choose one location and two actors for a ten-minute short?", ["Small scale keeps the story focused and the shoot short", "Shorts must have only two actors according to festival law", "It turns the film into a feature by running time", "It avoids needing a script because everything is improvised"], "Think about budget and crew.", "Shorts often have small budgets, so tightly scoped stories work well."),
      // L22
      mc(L22, 1, 1, "Which film by Alfred Hitchcock keeps us largely in one apartment?", ["Rear Window (1954)", "Vertigo (1958)", "Selma (2014)", "Tokyo Story (1953)"], "Think of a thriller about watching from a window.", "Rear Window is set largely in one apartment."),
      tf(L22, 2, 1, "Akira Kurosawa directed Rashomon (1950) and Seven Samurai (1954).", 0, "Both are well-known Japanese films.", "These two films are among Kurosawa's best-known works."),
      mc(L22, 3, 2, "Yasujiro Ozu is known for which style?", ["Low, mostly static camera positions and domestic stories", "Frantic handheld action filmed in busy city streets", "Constant crane moves above sweeping landscapes and cities", "Only documentary work shot in real locations"], "Think of Tokyo Story.", "Ozu's quiet style used low, mostly still camera positions."),
      mc(L22, 4, 2, "Barry Lyndon (1975) is famous for scenes lit largely by what?", ["Candlelight", "Neon signs", "Lightning", "Sunlight only"], "Think of an eighteenth-century period drama.", "Barry Lyndon is known for candlelit scenes shot with very fast lenses."),
      tf(L22, 5, 3, "The lesson says all these directors worked in exactly the same way.", 1, "The point is variety of method.", "Methods follow temperament and the story, and differ widely."),
      // L23
      mc(L23, 1, 1, "What is picture lock?", ["The point where the cut is final so other departments can finish", "A camera setting that fixes the focus and exposure for a single shot", "A security system that protects the footage on set", "A type of lens used for night photography"], "Sound and effects work depends on it.", "After picture lock, sound, music, effects and colour are finalised."),
      tf(L23, 2, 1, "Who has final cut is set by contract and often is not the director.", 0, "Consider studios and producers.", "Final cut varies; many films give it to a studio or producer."),
      mc(L23, 3, 2, "What should a director do with notes like cut the middle?", ["Look for the problem behind the suggestion", "Always cut the middle whenever a note says so", "Ignore all notes and trust only your own first view", "Ask the audience members to leave the screening"], "Vague notes often point to a deeper issue.", "The real issue may be pacing, confusion or repetition."),
      tf(L23, 4, 2, "A test screening shows a film to a sample audience whose reactions are recorded.", 0, "It is used to gather feedback.", "Test screenings give directors and studios audience response."),
      mc(L23, 5, 3, "After a test screening, a character feels unlikeable because of one cruel scene. Which fix is described?", ["Move a scene of her vulnerability earlier", "Remove the character from the film completely", "Reshoot the whole film with a different actress", "Add a title card that explains who she is"], "Context can change how a scene lands.", "Re-ordering scenes can change how audiences read a character."),
      // L24
      mc(L24, 1, 1, "What is a film festival?", ["An event where films are screened for audiences, critics and buyers", "A type of camera used on small independent shoots and student films", "A class taught at a film school", "A meeting of a film union"], "Think Sundance or Cannes.", "Festivals showcase films and can lead to distribution deals."),
      tf(L24, 2, 1, "Festivals may have submission fees and premiere requirements, so filmmakers should check the rules.", 0, "Rules differ between festivals.", "Each festival sets its own fees and premiere requirements."),
      mc(L24, 3, 2, "Which is a common early route to a directing career?", ["Making shorts and building a reel", "Waiting for a studio executive to call", "Skipping practice and aiming straight for features", "Only ever directing full-length features"], "Start small and finish things.", "Shorts and small projects build experience and a body of work."),
      tf(L24, 4, 2, "The lesson says there is only one required route into directing, which is film school.", 1, "It names several paths.", "Some learn through film school, others by experience or by moving up from other jobs."),
      mc(L24, 5, 3, "Before signing a distribution deal, what should a filmmaker do?", ["Read the contract carefully and seek advice from an entertainment lawyer", "Sign it immediately before the offer is withdrawn", "Ignore the terms and focus on the premiere party", "Wait until the film is forgotten before replying"], "Terms vary a great deal.", "Distribution terms vary, so careful review and advice are sensible."),
    ],
  },
};
