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

const L01 = 'music-theory-early.l01';
const L02 = 'music-theory-early.l02';
const L03 = 'music-theory-early.l03';
const L04 = 'music-theory-early.l04';
const L05 = 'music-theory-early.l05';
const L06 = 'music-theory-early.l06';
const L07 = 'music-theory-early.l07';
const L08 = 'music-theory-early.l08';
const L09 = 'music-theory-early.l09';
const L10 = 'music-theory-early.l10';
const L11 = 'music-theory-early.l11';
const L12 = 'music-theory-early.l12';
const L13 = 'music-theory-early.l13';
const L14 = 'music-theory-early.l14';
const L15 = 'music-theory-early.l15';
const L16 = 'music-theory-early.l16';

export const COURSE_MODULE: CourseModule = {
  curriculum: {
    id: 'music-theory-early',
    label: 'Music Foundations (PreK-2)',
    blurb: 'Feel the beat, sing, clap, listen and play. Young learners explore high and low, loud and soft, fast and slow, simple rhythms, instruments, do-re-mi and the people who wrote famous music.',
    accent: '#FFD24A',
    framework: 'ncas',
    tracks: [
      {
        id: 'music-theory-early.t1',
        title: 'Feel the Music',
        blurb: 'The beat, and the four big ways music can change: high and low, loud and soft, fast and slow.',
        level: 'FOUNDATION',
        lessons: [
          {
            id: L01,
            title: 'Find the Steady Beat',
            blurb: 'Music has a beat that goes on and on, like a heartbeat, and you can move with it.',
            minutes: 5,
            body: `Put your hand on your chest. Can you feel your heart going thump, thump, thump? It goes along at a steady pace. Music has something just like that. It is called the steady beat.

The beat is the pulse of a song. It does not change when the words or the tune change. It keeps going, tick, tick, tick, like a clock.

Here is how to find it. Play a song you know. Now pat your knees to the music. Pat, pat, pat, pat. If your pats fit the song and stay even, you have found the beat! You can also march, nod your head, tap your toes or sway.

Try this game. Walk around the room while the music plays. Take one step on each beat. When the music stops, freeze like a statue. Start again when it plays.

Some people find the beat fast and some find it slow. That is fine. The important part is keeping it steady, so every pat comes at an even time. Being able to feel the beat is the first big skill in music.`,
          },
          {
            id: L02,
            title: 'High Sounds and Low Sounds',
            blurb: 'Sounds can be high like a bird or low like a bear, and we call this pitch.',
            minutes: 5,
            body: `Some sounds are high. A tiny bird chirps up high. A whistle is high. Some sounds are low. A big bear growls down low. A foghorn is low. In music, how high or low a sound is has a special name. It is called pitch.

You can make high and low sounds with your own voice. Try saying "wheee" like a tiny mouse. That is high. Now say "whoooo" like a deep, slow giant. That is low.

You can see pitch on a piano too. Play the keys on the left side. They sound low. Play the keys on the right side. They sound high. A long ladder helps you think about it. Low sounds are at the bottom of the ladder. High sounds are at the top.

Here is a game. Listen with your eyes closed. When your teacher plays a high sound, reach up high. When it is a low sound, crouch down low. Can you tell them apart?

Songs are made when we mix high and low sounds together.`,
          },
          {
            id: L03,
            title: 'Loud and Soft',
            blurb: 'Music can be big and loud or small and quiet, and both are useful.',
            minutes: 5,
            body: `Music can be loud. Music can be soft. How loud or soft music is has a name. We call it volume, or dynamics.

Think of a lion roaring. That is a loud sound. Now think of a kitten purring. That is a soft sound. In music there are two Italian words for these. Forte (say FOR-tay) means loud. Piano (say pee-AH-no) means soft. The piano instrument got its name from this word, because it can play both soft and loud.

Try it with a clap. Clap loudly, with big arms. Now clap softly, with just two fingers on your palm. Which one was forte? Which one was piano?

Try singing a song twice. First sing it very softly, like you are telling a secret. Then sing it loud and strong, but never yell or hurt your voice.

Why does it matter? Music tells a story. A soft part can feel sleepy or quiet. A loud part can feel big and exciting. Great music uses both. A good listener hears when the music gets louder or softer.`,
          },
          {
            id: L04,
            title: 'Fast and Slow',
            blurb: 'The speed of the beat is called tempo, and it changes how music feels.',
            minutes: 5,
            body: `Some music goes fast. Some music goes slow. The speed of the beat is called tempo.

Think about animals. A turtle moves slowly. A rabbit hops fast. Pretend your pat on your knees is a turtle. Pat slowly, pat, pat, pat. Now be a rabbit. Pat quickly, pat pat pat pat! You have just changed the tempo.

Tempo changes how a song feels. A slow song can feel calm, like a lullaby that helps you sleep. A fast song can feel busy and happy, like a song for a parade.

Here is a game called Speed Up, Slow Down. The leader plays a drum. Everyone walks to the beat. When the drum goes faster, you walk faster. When it goes slower, you walk slower. Listen closely so you can keep up with the leader.

Remember, when the tempo changes, the beat is still steady. It is just steady at a new speed. Fast does not mean messy. Even fast music keeps an even beat. Listen to a few songs and decide if each one is fast or slow.`,
          },
        ],
      },
      {
        id: 'music-theory-early.t2',
        title: 'Rhythm and Voice',
        blurb: 'Long and short sounds, using your singing voice, echoing, and the first rhythm words.',
        level: 'FOUNDATION',
        lessons: [
          {
            id: L05,
            title: 'Long Sounds and Short Sounds',
            blurb: 'Some notes last a long time and some are over quickly. This is called duration.',
            minutes: 5,
            body: `Some sounds are short. A clap is over very quickly. Some sounds are long. When you hold the word "mooooo", it goes on and on. How long a sound lasts is called its duration.

Try it with your voice. Say "pop!" That is short. Now say "ooooooo" and hold it as long as you can. That is long.

Instruments can play long and short sounds too. If you tap a triangle, it rings for a while. That is a long sound. If you tap a wood block, you hear a quick click. That is a short sound.

Rhythm is made when you mix long and short sounds over a steady beat. Here is a rhythm to try: clap short, short, long. Clap, clap, claaaaap. Now try long, short, short. Can you keep the beat with your feet while your hands play the rhythm?

Here is a good listening game. Your teacher plays a sound. You hold up a short finger for a short sound or stretch your arms wide for a long sound. Rhythm is just long and short sounds, all lined up in time.`,
          },
          {
            id: L06,
            title: 'Your Singing Voice',
            blurb: 'Your voice is an instrument you carry everywhere, and singing is different from talking or shouting.',
            minutes: 5,
            body: `You have a built-in instrument. It is your voice! You can speak with it, whisper with it, and sing with it.

Speaking and singing are different. When you speak, your voice slides around. When you sing, you hold each sound on a steady pitch, high or low. Try it. Say "hello" the way you talk. Now sing "hello" and keep it on one note, like a long hum.

Here are some tips for a happy singing voice. Stand or sit up tall. Take a big, calm breath, like smelling a flower. Open your mouth gently, not too wide. Sing with a light, easy sound. Shouting can hurt your throat, so do not push too hard.

A good game is Voice Detective. Make four voices: a whisper voice, a talking voice, a calling voice, and a singing voice. Which one is the singing voice? It is the one that holds notes like a tune.

Everyone has a singing voice. Some voices are high and some are low. Voices change as we grow, so sing often. Practice makes your voice stronger and more steady.`,
          },
          {
            id: L07,
            title: 'Echo and Call-and-Response',
            blurb: 'One person sings or plays, and others answer. It is a musical conversation.',
            minutes: 5,
            body: `Have you ever shouted in a big empty hall and heard your voice come back? That is an echo. In music, we can play echo too.

In an echo game, the leader sings or claps a short pattern. Then everyone copies it exactly the same. If the leader claps clap, clap, clap-clap, you clap clap, clap, clap-clap right back. Listening carefully is the secret. You must hear the pattern first, then copy it.

Call-and-response is a close cousin. The leader sings a call. The group sings a response. The response can be the same as the call, as in an echo, or it can be a new answer, like a friendly reply. Many songs from many places around the world are sung in this way, with one voice and then a group.

Try this. Your teacher sings three notes. You sing three notes back. Try it with soft voices, then loud voices. Try it with claps, then stomps.

When we answer one another in music, we are not just copying. We are listening, and listening is what makes a group sound like a team.`,
          },
          {
            id: L08,
            title: 'Rhythm Words: Ta, Ti-ti and Rest',
            blurb: 'Rhythm words like ta and ti-ti help us say, clap and read rhythms.',
            minutes: 6,
            body: `Rhythms can be hard to explain, so teachers give them silly sounding names. These are rhythm words, and they help us say what we clap.

Ta is one sound on one beat. Say it with your beat: ta, ta, ta, ta. Pat your knee for each one. Ta is the easy, steady sound.

Ti-ti is two sounds in the space of one beat. Think of a beat as a tiny box. Ta fills the box with one sound. Ti-ti squeezes two quick, even sounds into the same box. So ti-ti is faster than ta, even though the beat stays the same.

A rest is a beat with no sound. You stay quiet, but you still feel the beat in your head. Many teachers have you hold up a finger or make a "shh" while the rest goes by.

Try saying: ta, ta, ti-ti, ta. Clap it. Now try: ta, rest, ta, ta. Keep your feet marching on the beat the whole time.

Rhythm words are like building blocks. With only ta, ti-ti and rest, you can make many rhythms.`,
          },
        ],
      },
      {
        id: 'music-theory-early.t3',
        title: 'Instruments and Listening',
        blurb: 'The families of classroom instruments, and careful listening to well-known pieces from long ago.',
        level: 'FOUNDATION',
        lessons: [
          {
            id: L09,
            title: 'Instrument Families',
            blurb: 'Instruments can be sorted by how they make their sound: shake, hit, blow and pluck or bow.',
            minutes: 6,
            body: `Instruments come in families. We sort them by how they make a sound.

Percussion instruments are hit, shaken or scraped. Drums, rhythm sticks, shakers, triangles and tambourines are in this family. Many classroom instruments are percussion.

Some percussion instruments play tunes too. A xylophone has bars you hit with mallets, and each bar has its own pitch. A glockenspiel is a small, bright, high one.

Woodwinds are blown. You send air across or into them, and the sound comes out. A recorder and a flute are woodwinds. A clarinet is one too.

Brass instruments are blown too, but the player buzzes their lips into a metal mouthpiece. A trumpet and a tuba are brass.

String instruments make sound from strings. You might pluck them, or move a bow across them. A violin and a guitar are string instruments.

Here is a sorting game. Say the name of an instrument. Then act out how you play it: shake, hit, blow or pluck. When you listen to music, try to hear which family each sound belongs to. Each one has its own special color of sound.`,
          },
          {
            id: L10,
            title: 'Listening to Twinkle, Twinkle',
            blurb: 'A song you know has a long history and its tune was used by a famous composer.',
            minutes: 6,
            body: `You probably know the tune of Twinkle, Twinkle, Little Star. It is also the tune of the Alphabet Song and Baa, Baa, Black Sheep. One tune, many songs!

The tune is old. It comes from a French song called Ah! vous dirai-je, maman, which was already well known in France in the 1700s. The tune is in the public domain, which means that everyone is free to sing, play and share it.

Mozart, a famous composer, wrote a set of piano pieces based on this tune. They are called variations. A variation takes a tune and changes it. In one variation the notes might go faster. In another they might be softer. But the tune is still hiding inside.

Here is a listening game. Sing the tune first. Then listen to a recording of the piano variations. Can you hear the tune hiding? Pat the steady beat while you listen. Raise your hand each time you hear the tune you know.

Notice how the music can be fast or slow, loud or soft, high or low, but the song is still the same song underneath.`,
          },
          {
            id: L11,
            title: 'Ode to Joy and Morning',
            blurb: 'Two famous melodies, one by Beethoven and one by Grieg, are easy to follow by ear.',
            minutes: 6,
            body: `Let us listen to two famous tunes.

The first is Ode to Joy. It was written by Ludwig van Beethoven, and it comes from the last part of his Ninth Symphony. A symphony is a long piece for a big group of players called an orchestra. The Ode to Joy tune is easy to follow. It mostly moves by steps, going up and down like walking on stairs, so it is easy to sing along. Try humming it while you pat the steady beat.

The second is called Morning. It was written by Edvard Grieg, a composer from Norway, as part of the music for a play called Peer Gynt. Morning has a calm, gentle sound, like the sun coming up. It is a flute that plays the tune at the very start.

When you listen, ask yourself questions. Is it fast or slow? Is it loud or soft? Does the tune go high or low? What do you imagine? Many people picture a sunrise when they hear Morning.

Both pieces are very old, and anyone may play and share them.`,
          },
          {
            id: L12,
            title: 'Animals and Stories in Music',
            blurb: 'Music can paint pictures and tell stories, like Carnival of the Animals and Peter and the Wolf.',
            minutes: 6,
            body: `Music can tell a story without any words. Composers use sounds to paint pictures in your mind.

Camille Saint-Saens, a French composer, wrote a piece called The Carnival of the Animals. It has short parts, and each one is about a different animal. There is a lion, an elephant, and a swan, and a part about an aquarium full of fish. The elephant part is played low, because elephants are big. The swan part is gentle and smooth. Listen and ask: how does the music sound like that animal?

Sergei Prokofiev wrote Peter and the Wolf. It is a story told with an orchestra and a narrator. Each character has its own instrument. The bird is played by a flute. The duck is played by an oboe. The cat is played by a clarinet. The wolf is played by French horns.

This is a great idea. When you hear a sound, you know who is on stage.

Try your own: Which instrument or voice would you pick for a mouse? A bear? Why?`,
          },
        ],
      },
      {
        id: 'music-theory-early.t4',
        title: 'Notes, Making and People',
        blurb: 'Do-re-mi, short note patterns, making up a song, and the people behind the music.',
        level: 'INTERMEDIATE',
        lessons: [
          {
            id: L13,
            title: 'Do, Re, Mi: Singing Note Names',
            blurb: 'Solfege gives each step of a scale its own singing name.',
            minutes: 6,
            body: `Did you ever sing do-re-mi? Those are note names for singing. They are called solfege (say SOL-fezh). Each name goes with one step of a scale, which is a ladder of notes going up.

The names, from low to high, are: do, re, mi, fa, sol, la, ti, and then do again at the top. Sing them going up like climbing stairs. Then sing them going down like walking back.

The first do and the last do are the same note name, but the last one is higher. Singing them is like stepping onto the top of the ladder.

Many teachers use hand signs, with a different hand shape for each name. Some teachers put the hand low for do and higher for each step up. Your hand shows the pitch going up the ladder.

Try this: sing do, then re, then mi. Make your voice go up one step at a time. Now sing mi, re, do and come back down.

Solfege helps you hear and sing tunes, even before you can read any notes on paper.`,
          },
          {
            id: L14,
            title: 'Reading Three-Note Patterns',
            blurb: 'With just do, re and mi you can read and sing short patterns that go up, down or stay still.',
            minutes: 6,
            body: `With only three notes, do, re and mi, you can make lots of little tunes.

Imagine three steps on a small staircase. Do is the bottom step. Re is the middle step. Mi is the top step. A pattern shows you which step to stand on, one after another.

Try singing do, re, mi. Your voice goes up. Now try mi, re, do. Your voice goes down. What about mi, mi, mi? Your voice stays on one step. Each is a different pattern.

You can show a pattern with your hand. Hold your hand low for do, in the middle for re, and high for mi. Or you can draw a path of three dots that go up, down, or flat. These dot pictures help you see the pattern before you sing it.

Here is a game. Your teacher shows three dots in a pattern. You sing the notes. Then you make up your own pattern and show it to a friend.

Try mixing in rhythm words, too. Sing do, re, mi in ta, ta, ti-ti. Reading a pattern is just following the path.`,
          },
          {
            id: L15,
            title: 'Make Up Your Own Song',
            blurb: 'Anyone can compose by choosing a beat, some notes and some words.',
            minutes: 6,
            body: `Did you know that you can be a composer? A composer is a person who makes up music. You can do that right now.

Here is a simple way to start.
1. First, pick a steady beat. Pat your knees slowly.
2. Second, pick a few words. They can be about anything, like your pet, your lunch or the rain.
3. Third, pick some notes. Try do, re and mi, or just use your voice and find a tune that feels right.

Now put them together. Say your words on the beat. Then change some of them to higher or lower notes. Sing it again. Does it sound right? If not, change one thing. Composers change things all the time. That is part of the job.

You can also use instruments. Try a drum for the beat and a xylophone for the tune. Choose loud or soft, fast or slow, to match the feeling of your song.

When you are happy with it, sing it for a friend. If you want to remember it, ask a grown-up to help you record it or draw pictures to show the tune. Your song belongs to you.`,
          },
          {
            id: L16,
            title: 'Composers Are People Too',
            blurb: 'The people who wrote famous music were once children who learned and practiced, just like you.',
            minutes: 6,
            body: `Composers are people who write music. Every composer you hear about was once a child.

Wolfgang Amadeus Mozart was born in 1756 in Salzburg, which is in Austria today. He began music very young and wrote music when he was still a child. As a child he also traveled to play for audiences in different cities in Europe. When he grew up, he kept writing music, including piano pieces, songs and symphonies.

Ludwig van Beethoven was a composer from Germany. He wrote the Ode to Joy tune. When he got older he lost his hearing, and he still kept on writing music. That shows how much he cared about it.

Edvard Grieg came from Norway, and he wrote the music for Peer Gynt. Camille Saint-Saens came from France, and he wrote The Carnival of the Animals. Sergei Prokofiev wrote Peter and the Wolf.

Composers had to learn, practice and try again, just as you do. Their music is still played all around the world today.

Think about it: What could you make if you kept practicing?`,
          },
        ],
      },
    ],
  },
  bank: {
    curriculumId: 'music-theory-early',
    questions: [
      // L01 steady beat
      tf(L01, 1, 1, 'The steady beat in music is like a heartbeat that keeps going at an even pace.', 0, 'Think of thump, thump, thump.', 'The beat is the steady pulse of the music, and it keeps an even pace like a heartbeat.'),
      mc(L01, 2, 1, 'Which of these is a good way to show the steady beat?', ['Patting your knees evenly to the music', 'Clapping a new speed every time', 'Sitting very still and not moving', 'Making a loud noise with no pattern'], 'Pick the one that stays even.', 'Patting evenly in time with the music shows the steady beat.'),
      tf(L01, 3, 1, 'The beat changes every time the words of the song change.', 1, 'Does a clock change its tick when you talk?', 'The beat keeps going steadily even when the words or the tune change.'),
      mc(L01, 4, 2, 'In the freeze game, what do you do when the music stops?', ['Freeze like a statue', 'Run faster', 'Sing louder', 'Sit under the table'], 'Think of a statue.', 'In the game you walk on the beat and freeze when the music stops.'),
      mc(L01, 5, 2, 'Which of these can you use to show the steady beat?', ['All of them: feet, hands or head', 'Only your feet', 'Only your hands', 'Only your head'], 'Think about how many ways you can move.', 'You can show the beat by marching, patting, nodding or tapping, so every one of these works.'),

      // L02 high/low
      tf(L02, 1, 1, 'How high or low a sound is, is called its pitch.', 0, 'The word starts with p.', 'Pitch is the word for how high or low a sound is.'),
      mc(L02, 2, 1, 'Which animal sound would most likely be HIGH?', ['A tiny bird chirping', 'A big bear growling', 'A foghorn', 'A deep drum'], 'Think small and light.', 'A tiny bird chirps high, while a bear growl and a foghorn are low.'),
      mc(L02, 3, 1, 'On a piano, the keys on the right side sound...', ['Higher', 'Lower', 'Quieter', 'Slower'], 'Think of a ladder going up.', 'Keys farther to the right on a piano play higher pitches.'),
      tf(L02, 4, 2, 'A giant growling is a low sound.', 0, 'Giants are big and deep.', 'Big, deep growls are low sounds.'),
      mc(L02, 5, 2, 'When you imagine a ladder of sounds, where are the low sounds?', ['At the bottom', 'At the top', 'In the middle only', 'Nowhere'], 'Low means down.', 'Low sounds are at the bottom of the ladder and high sounds are at the top.'),

      // L03 loud/soft
      mc(L03, 1, 1, 'What does the word forte mean in music?', ['Loud', 'Soft', 'Fast', 'Slow'], 'Think of a lion.', 'Forte means loud.'),
      mc(L03, 2, 1, 'What does the word piano mean when it is used for dynamics?', ['Soft', 'Loud', 'High', 'Short'], 'Think of a kitten purring.', 'Piano means soft.'),
      tf(L03, 3, 1, 'A kitten purring is a soft sound.', 0, 'Is a kitten quiet or noisy?', 'A purr is a soft, quiet sound.'),
      tf(L03, 4, 2, 'When we sing loud, we should yell as hard as we can.', 1, 'Be kind to your throat.', 'We can sing loud and strong without yelling, which can hurt your voice.'),
      mc(L03, 5, 2, 'Why do composers use both loud and soft parts?', ['To help the music tell a story and show feelings', 'Because soft parts are mistakes', 'Because only loud music counts', 'To make players tired'], 'Think about the feeling.', 'Soft and loud parts make music feel different, so it can show many feelings.'),

      // L04 fast/slow
      mc(L04, 1, 1, 'The speed of the beat is called...', ['Tempo', 'Pitch', 'Volume', 'Echo'], 'It sounds like temp-oh.', 'Tempo is the word for how fast or slow the beat is.'),
      tf(L04, 2, 1, 'A turtle is a good example of a slow tempo.', 0, 'Turtles take their time.', 'A turtle moves slowly, so it matches a slow tempo.'),
      mc(L04, 3, 1, 'Which kind of song might help someone fall asleep?', ['A slow, calm lullaby', 'A fast parade song', 'A very loud drum solo', 'A fast hopping song'], 'Think of bedtime.', 'Slow, calm music like a lullaby can help people relax and sleep.'),
      tf(L04, 4, 2, 'When the tempo gets faster, the beat stops being steady.', 1, 'Fast can still be even.', 'The beat can still be steady at a faster speed; it is just steady at a new tempo.'),
      mc(L04, 5, 2, 'In the game Speed Up, Slow Down, you should...', ['Listen to the drum and change your walking speed with it', 'Always walk at the same speed', 'Ignore the leader', 'Walk only when the drum stops'], 'Listening is the key.', 'You follow the leader by listening and matching your steps to the drum speed.'),

      // L05 long/short
      mc(L05, 1, 1, 'How long a sound lasts is called its...', ['Duration', 'Pitch', 'Volume', 'Tempo'], 'Think of how long.', 'Duration means how long a sound lasts.'),
      tf(L05, 2, 1, 'A wood block click is a short sound.', 0, 'It is over very quickly.', 'A tap on a wood block makes a quick, short sound.'),
      mc(L05, 3, 1, 'Which sound is the longest?', ['Holding "oooooo" with your voice', 'Saying "pop"', 'A single clap', 'A quick finger snap'], 'Which one goes on and on?', 'A held voice sound can go on for a long time, while the others end quickly.'),
      tf(L05, 4, 2, 'Rhythm is made by mixing long and short sounds over a steady beat.', 0, 'Rhythm uses time.', 'Rhythm is a pattern of long and short sounds placed over the steady beat.'),
      mc(L05, 5, 2, 'A triangle that rings for a while is an example of a...', ['Long sound', 'Short sound', 'Silent sound', 'Low sound only'], 'Does it stop right away?', 'A ringing triangle keeps sounding for a while, so it makes a long sound.'),

      // L06 singing voice
      tf(L06, 1, 1, 'Your voice is an instrument that you carry with you.', 0, 'Nobody has to buy it.', 'Your voice makes music, so it is an instrument you always have.'),
      mc(L06, 2, 1, 'When we sing, we hold each sound on a steady...', ['Pitch', 'Hat', 'Door', 'Floor'], 'High or low sound.', 'Singing holds each sound on a steady pitch, which is different from talking.'),
      mc(L06, 3, 2, 'Which is a good tip for a happy singing voice?', ['Sit or stand up tall and breathe calmly', 'Shout as hard as you can', 'Squeeze your throat tight', 'Hold your breath the whole song'], 'Be gentle with yourself.', 'Good posture and a calm breath help the voice sing in an easy, healthy way.'),
      tf(L06, 4, 2, 'Shouting is the best way to sing.', 1, 'Think about your throat.', 'Shouting can hurt the throat; a light, easy sound is better for singing.'),
      mc(L06, 5, 3, 'In the game Voice Detective, which voice holds notes like a tune?', ['The singing voice', 'The whisper voice', 'The talking voice', 'The calling voice'], 'It starts with s.', 'The singing voice holds notes at steady pitches, like a tune.'),

      // L07 echo
      mc(L07, 1, 1, 'In an echo game, what do you do after the leader sings or claps?', ['Copy it exactly', 'Do something totally different', 'Stay silent forever', 'Run away'], 'An echo is the same.', 'In an echo you copy what the leader did.'),
      tf(L07, 2, 1, 'You need to listen carefully to play an echo game well.', 0, 'You must hear it first.', 'You must hear the pattern first in order to copy it.'),
      mc(L07, 3, 2, 'What is call-and-response?', ['One person leads and others answer', 'Everyone plays at once with no listening', 'A song with no singing', 'A very loud drum'], 'It is like a conversation.', 'In call-and-response a leader makes the call and a group gives the response.'),
      tf(L07, 4, 2, 'In call-and-response, the answer can be a new reply, not just a copy.', 0, 'Think of a friendly reply.', 'The response can be an exact echo or a different answer to the call.'),
      mc(L07, 5, 2, 'What makes a group sound like a team in music?', ['Listening to each other', 'Everyone playing as loud as possible', 'Ignoring the leader', 'Each person playing a different song'], 'Think about ears.', 'Careful listening helps people play and sing together.'),

      // L08 ta ti-ti rest
      mc(L08, 1, 1, 'Ta is one sound on how many beats?', ['One beat', 'Two beats', 'No beats', 'Four beats'], 'It is the easy, steady one.', 'Ta is a single sound on one beat.'),
      mc(L08, 2, 1, 'Ti-ti is how many quick, even sounds in one beat?', ['Two', 'One', 'Three', 'None'], 'Count the ti words.', 'Ti-ti fits two even sounds into one beat.'),
      tf(L08, 3, 1, 'A rest is a beat with no sound.', 0, 'You stay quiet.', 'A rest is a beat of silence, though you still feel the beat in your head.'),
      tf(L08, 4, 2, 'During a rest, you should stop feeling the steady beat.', 1, 'The beat never stops.', 'The beat goes on during a rest; only the sound is missing.'),
      mc(L08, 5, 3, 'Which is faster, ta or ti-ti, when the beat stays the same?', ['Ti-ti, because it fits two sounds in one beat', 'Ta, because it is shorter', 'They are exactly the same', 'Neither, because both are silent'], 'Squeeze two sounds in the box.', 'Ti-ti puts two sounds in the space where ta has one, so its sounds are quicker.'),

      // L09 instrument families
      mc(L09, 1, 1, 'Which instrument family includes drums, shakers and triangles?', ['Percussion', 'Brass', 'Strings', 'Woodwinds'], 'You hit, shake or scrape them.', 'Percussion instruments are hit, shaken or scraped.'),
      mc(L09, 2, 1, 'A trumpet belongs to which family?', ['Brass', 'Strings', 'Percussion', 'Woodwinds'], 'The player buzzes lips into metal.', 'The trumpet is a brass instrument.'),
      tf(L09, 3, 1, 'A violin is a string instrument.', 0, 'It has strings and a bow.', 'The violin makes its sound with strings, so it is in the string family.'),
      mc(L09, 4, 2, 'Which is a woodwind?', ['Recorder', 'Tuba', 'Tambourine', 'Guitar'], 'You blow air into or across it.', 'The recorder is blown, and it is a woodwind.'),
      tf(L09, 5, 2, 'A xylophone is a percussion instrument that can play different pitches.', 0, 'You hit the bars with mallets.', 'The xylophone is hit with mallets and each bar has its own pitch.'),

      // L10 Twinkle
      tf(L10, 1, 1, 'The tune of Twinkle, Twinkle, Little Star is also used for the Alphabet Song.', 0, 'One tune, many songs.', 'The same tune is used for Twinkle, Twinkle and the Alphabet Song.'),
      mc(L10, 2, 2, 'The Twinkle tune comes from an old song from which country?', ['France', 'Brazil', 'Japan', 'Australia'], 'It starts with Ah! vous dirai-je.', 'The tune comes from the French song Ah! vous dirai-je, maman.'),
      mc(L10, 3, 2, 'What is a variation in music?', ['A tune changed in new ways', 'A song with no notes', 'A very loud sound', 'A new instrument'], 'It starts from a tune you know.', 'A variation takes a tune and changes it, such as making it faster or softer.'),
      tf(L10, 4, 2, 'Mozart wrote piano variations on the Twinkle tune.', 0, 'A famous composer used it.', 'Mozart wrote a set of piano variations on this tune.'),
      mc(L10, 5, 3, 'What does it mean for a tune to be in the public domain?', ['Everyone is free to sing and share it', 'Only one person can use it', 'It can never be played', 'It must be paid for each time'], 'It belongs to everybody.', 'A public domain tune is free for everyone to use.'),

      // L11 Ode to Joy, Morning
      mc(L11, 1, 1, 'Who wrote the Ode to Joy tune used in his Ninth Symphony?', ['Beethoven', 'Grieg', 'Prokofiev', 'Saint-Saens'], 'He later lost his hearing.', 'Ludwig van Beethoven wrote the Ode to Joy tune in his Ninth Symphony.'),
      tf(L11, 2, 1, 'The Ode to Joy tune mostly moves by steps, like walking on stairs.', 0, 'That makes it easy to sing.', 'The melody moves mostly by steps, which makes it easy to sing along.'),
      mc(L11, 3, 2, 'Morning was written for a play called...', ['Peer Gynt', 'Peter and the Wolf', 'Twinkle', 'The Carnival'], 'It has the name of a man.', 'Grieg wrote Morning as part of his music for the play Peer Gynt.'),
      mc(L11, 4, 2, 'Which country was Edvard Grieg from?', ['Norway', 'France', 'Russia', 'Italy'], 'It is in the cold north of Europe.', 'Edvard Grieg was a Norwegian composer.'),
      tf(L11, 5, 3, 'A symphony is a long piece played by an orchestra.', 0, 'It is for a big group of players.', 'A symphony is a long piece for orchestra.'),

      // L12 animals and stories
      mc(L12, 1, 1, 'Which piece has parts about a lion, an elephant and a swan?', ['The Carnival of the Animals', 'Ode to Joy', 'Twinkle, Twinkle', 'Morning'], 'It is about animals.', 'Saint-Saens wrote The Carnival of the Animals, which includes those animals.'),
      mc(L12, 2, 1, 'In Peter and the Wolf, which instrument plays the bird?', ['Flute', 'Oboe', 'Clarinet', 'French horns'], 'It is a high woodwind.', 'In Peter and the Wolf the bird is played by a flute.'),
      tf(L12, 3, 2, 'In Peter and the Wolf, the duck is played by an oboe.', 0, 'Each character has an instrument.', 'The duck is played by the oboe.'),
      mc(L12, 4, 2, 'In Peter and the Wolf, which instruments play the wolf?', ['French horns', 'Flute', 'Clarinet', 'Triangle'], 'They are brass instruments.', 'The wolf is played by French horns.'),
      tf(L12, 5, 3, 'Composer Prokofiev wrote Peter and the Wolf.', 0, 'The first name is Sergei.', 'Sergei Prokofiev composed Peter and the Wolf.'),

      // L13 do re mi
      mc(L13, 1, 1, 'What are do, re, mi called?', ['Solfege', 'Rhythm words', 'Instruments', 'Rests'], 'It sounds like SOL-fezh.', 'Singing note names such as do, re and mi are called solfege.'),
      mc(L13, 2, 1, 'What comes right after re when you sing up the scale?', ['Mi', 'Do', 'La', 'Ti'], 'Do, re, ...', 'The order going up begins do, re, mi.'),
      tf(L13, 3, 1, 'In solfege, do is at the bottom and the last do at the top is higher.', 0, 'The ladder goes up.', 'The scale starts on do and ends on a higher do.'),
      mc(L13, 4, 2, 'Which is the correct order of solfege going up?', ['Do, re, mi, fa, sol, la, ti, do', 'Do, mi, re, sol, fa, ti, la, do', 'Re, do, mi, fa, la, sol, do, ti', 'Mi, re, do, fa, sol, la, ti, do'], 'Think of the song.', 'The scale goes do, re, mi, fa, sol, la, ti, do.'),
      tf(L13, 5, 2, 'You must read written notes before you can sing solfege.', 1, 'Singing comes first.', 'Solfege helps you hear and sing tunes even before you read notes on paper.'),

      // L14 3-note patterns
      mc(L14, 1, 1, 'If you sing do, re, mi, which way does your voice go?', ['Up', 'Down', 'It stays still', 'It goes quiet'], 'Climb the stairs.', 'Do, re, mi goes up from low to high.'),
      mc(L14, 2, 1, 'If you sing mi, re, do, which way does your voice go?', ['Down', 'Up', 'It stays still', 'It gets faster'], 'Walk back down the stairs.', 'Mi, re, do goes down.'),
      tf(L14, 3, 1, 'Mi, mi, mi stays on the same note.', 0, 'The same word three times.', 'Singing mi three times keeps the voice on one pitch.'),
      mc(L14, 4, 2, 'On the three-step staircase, which note is the top step?', ['Mi', 'Do', 'Re', 'Rest'], 'Do, re, ...', 'Do is the bottom, re the middle and mi the top step.'),
      tf(L14, 5, 2, 'You can show a note pattern with your hand moving low, middle and high.', 0, 'Your hand can be a ladder.', 'Hand height can show do (low), re (middle) and mi (high).'),

      // L15 making a song
      mc(L15, 1, 1, 'A person who makes up music is called a...', ['Composer', 'Painter', 'Baker', 'Driver'], 'It starts with comp.', 'A composer is someone who makes up music.'),
      mc(L15, 2, 1, 'What is a good first step when you make up a song?', ['Pick a steady beat', 'Wait for a grown-up to do it', 'Make it as loud as possible', 'Skip the words and notes'], 'Start with the pulse.', 'The lesson starts with a steady beat, then words and notes.'),
      tf(L15, 3, 1, 'Composers often change things in their songs until they sound right.', 0, 'Trying again is normal.', 'Changing and trying again is a regular part of making music.'),
      tf(L15, 4, 2, 'You must use an instrument to make up a song.', 1, 'You have a voice.', 'You can make up a song using only your voice.'),
      mc(L15, 5, 2, 'Which of these can your song be about?', ['Anything you like', 'Only the moon', 'Only animals', 'Only school'], 'It is your song.', 'A song can be about anything, such as a pet, lunch or rain.'),

      // L16 composers as people
      mc(L16, 1, 1, 'Which composer wrote music as a child and was born in Salzburg?', ['Mozart', 'Prokofiev', 'Grieg', 'Saint-Saens'], 'His first name is Wolfgang.', 'Wolfgang Amadeus Mozart was born in Salzburg and began music very young.'),
      tf(L16, 2, 1, 'Every composer was once a child.', 0, 'Everyone starts young.', 'Every person, including famous composers, was once a child.'),
      mc(L16, 3, 2, 'Beethoven lost his ability to do what as he got older?', ['Hear', 'See', 'Walk', 'Speak'], 'It is hard for a musician.', 'Beethoven lost his hearing as he got older, yet he kept writing music.'),
      mc(L16, 4, 2, 'Which country was Camille Saint-Saens from?', ['France', 'Norway', 'Austria', 'Germany'], 'He wrote The Carnival of the Animals.', 'Saint-Saens was a French composer.'),
      tf(L16, 5, 3, 'Composers learned, practiced and tried again, just like students.', 0, 'Nobody is perfect on day one.', 'Learning music takes practice for everyone, including composers.'),
    ],
  },
};
