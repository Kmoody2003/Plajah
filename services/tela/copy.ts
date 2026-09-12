// copy — placeholder text that reads like a real publication.
//
// Templates should never say "lorem ipsum" or "Replace this copy". A reader
// judging a template judges its voice too, so each voice here has headlines,
// decks, body paragraphs, captions, pull quotes and bylines that could ship.
export type Voice = 'editorial' | 'culture' | 'science' | 'travel' | 'music' | 'fashion' | 'community' | 'faith' | 'business' | 'kids' | 'photo' | 'comic' | 'food' | 'event' | 'education' | 'personal';

interface VoicePack { headlines: string[]; decks: string[]; body: string[]; captions: string[]; quotes: string[]; bylines: string[]; kickers: string[] }

const PACK: Record<Voice, VoicePack> = {
  editorial: {
    headlines: ['The slow return of the long sentence', 'What the archive forgot to keep', 'A city learns to read itself again', 'Notes toward a quieter internet'],
    decks: ['Attention is not a resource. It is a relationship, and it can be repaired.', 'Three librarians, one flooded basement, and the question of what counts as memory.', 'An essay on margins, in praise of the unfinished.'],
    body: [
      'There is a moment, early in any long piece of writing, when the sentence stops obeying and starts arguing back. Most writers describe it as a loss of control. The ones who keep going describe it as the first honest thing on the page.',
      'The building had been a bank, then a furniture warehouse, then nothing at all for eleven years. When the reading room opened, the first person through the door asked whether the ceiling was original. It was. Everything else was borrowed.',
      'We tend to imagine that clarity arrives by subtraction. Cut the adjective, drop the clause, trust the noun. But some ideas are only clear at length, the way a coastline is only legible from a certain height.',
    ],
    captions: ['The reading room at dusk, before the lamps came on.', 'A marginal note, c. 1911, in an unknown hand.', 'Proof sheets from the second edition.'],
    quotes: ['“Nobody wants to be understood quickly. They want to be understood well.”', '“A margin is a promise that the page is not finished with you.”'],
    bylines: ['By Imani Okafor', 'Words by Teodor Lindqvist', 'By Marisol Vega · Photographs by Ren Ishikawa'],
    kickers: ['Essay', 'Long read', 'Letter from the editor', 'Field notes'],
  },
  culture: {
    headlines: ['The theatre that refused to close', 'Every record store is a rumour', 'On seeing a painting twice', 'Small stages, enormous nights'],
    decks: ['A season of new work built by people who were told there was no audience.', 'How a neighbourhood kept its bookshop open with soup, gossip, and a spreadsheet.'],
    body: [
      'The show begins before the lights go down. It begins in the queue, where two strangers discover they saw the same production in 2014 and disagree about the ending. It begins with the smell of the carpet. By the time the curtain rises, the audience has already rehearsed.',
      'Critics like to say a film has a texture, as if you could run a hand across it. What they mean is that every choice — the grain, the pauses, the colour of a coat — agrees with every other choice, and the agreement is felt before it is understood.',
    ],
    captions: ['Opening night, second balcony.', 'The gallery’s east wall between exhibitions.', 'A dress rehearsal, photographed from the wings.'],
    quotes: ['“We didn’t save the theatre. The theatre saved the street.”', '“Every review is a letter to someone who wasn’t there.”'],
    bylines: ['By Adaeze Nwosu', 'Review by Callum Reyes', 'Interview by Hana Petrova'],
    kickers: ['Review', 'In conversation', 'Season preview', 'Dispatch'],
  },
  science: {
    headlines: ['The glacier that keeps a diary', 'What a single neuron remembers', 'Counting the birds we cannot see', 'Ten kilometres beneath the question'],
    decks: ['Ice cores read like tree rings, if trees could also record the wind.', 'A new imaging method turns a fruit fly’s brain into a map that updates itself.'],
    body: [
      'The instrument is small enough to carry in one hand and patient enough to wait a decade. Bolted to a granite outcrop above the ice, it measures displacement in millimetres and sends the result home twice a day. Over eleven winters it has recorded a slow, unmistakable exhale.',
      'Every measurement carries two numbers: the value and the doubt. Good science reports both. The doubt is not an apology. It is the precise shape of what we do not yet know, and it shrinks only when someone is honest about its size.',
    ],
    captions: ['Sensor array, north face, elevation 3,140 m.', 'Fig. 2 — displacement over eleven winters (mm).', 'Sample 41 under polarised light.'],
    quotes: ['“The data does not speak. We ask it questions, and we should say so.”'],
    bylines: ['By Dr. Lena Haugen', 'Reporting by Samir Batra', 'Illustrations by Ola Ade'],
    kickers: ['Field report', 'Method', 'Explainer', 'Findings'],
  },
  travel: {
    headlines: ['The road that ends at a ferry', 'Nine hours in a town with one café', 'Following the salt', 'A coast measured in lighthouses'],
    decks: ['Notes from the last village before the fjord turns north.', 'How to travel slowly on purpose, and what you notice when you do.'],
    body: [
      'The bus stops where the asphalt does, and from there it is a footpath, a gate, a field, and finally the water. Nobody hurries here because there is nothing to hurry toward. The ferry comes when the ferry comes. In the meantime there is coffee, and the light doing something extraordinary to the cliffs.',
      'You learn a place by its repetitions: the bell at noon, the bread at four, the old man who waves from the same bench every evening. After a week the repetitions become yours, and the town, without asking, has made you part of its pattern.',
    ],
    captions: ['The 06:40 ferry, seen from the harbour wall.', 'Salt pans at low tide.', 'The café, before the second pot of coffee.'],
    quotes: ['“Arrive late. Leave later. That is the whole method.”'],
    bylines: ['Words and photographs by Nadia Farouk', 'By Jonas Ekblad'],
    kickers: ['Journey', 'Field notes', 'Slow travel', 'Where to stay'],
  },
  music: {
    headlines: ['Frequency', 'The bass that shook the basement', 'A scene is just a room that says yes', 'Liner notes for a record that doesn’t exist yet'],
    decks: ['Twelve producers, one borrowed synthesizer, and a sound nobody can name.', 'Inside the club night that turned a parking garage into a cathedral.'],
    body: [
      'The kick drum arrives before you do. You feel it in the stairwell, in your ribs, in the plastic cup in your hand. By the time you reach the floor the whole room has agreed on a tempo without anyone saying a word, and that agreement is the closest thing to a congregation most of us will ever join.',
      'A good mix hides its work. The hours spent carving the low end so the vocal has somewhere to stand — none of that is audible. What is audible is the feeling that everything is in its place, and that the place was inevitable.',
    ],
    captions: ['Soundcheck, 7:12 pm.', 'The modular rig, mid-patch.', 'Crowd, 1:40 am, from the booth.'],
    quotes: ['“We don’t play songs. We build rooms and let people live in them for six minutes.”'],
    bylines: ['By DJ Marrow', 'Interview by Priya Raman', 'Photographs by Kofi Mensah'],
    kickers: ['Cover story', 'Studio visit', 'Track by track', 'Scene report'],
  },
  fashion: {
    headlines: ['Atelier Quarterly', 'The line that holds', 'Undressing the seam', 'A suit made of weather'],
    decks: ['A conversation about restraint with a designer who cuts everything twice.', 'The season’s quietest collection was also its most radical.'],
    body: [
      'The garment is simple in the way a bridge is simple. Every decision has been made to disappear. Ask her about the shoulder and she will talk for twenty minutes about the shoulder; look at the shoulder and you will see nothing at all, which was the point.',
      'Fashion writing loves the word “effortless” and rarely earns it. What looks effortless is usually the fourth toile, the third fabric, and a fitting that ran past midnight.',
    ],
    captions: ['Look 14, wool crepe and horn.', 'The studio wall, week nine.', 'Backstage, one minute to first exit.'],
    quotes: ['“I am not interested in clothes that photograph well. I am interested in clothes that age well.”'],
    bylines: ['By Céleste Marchand', 'Photographs by Ayo Bello'],
    kickers: ['Portfolio', 'Interview', 'Process', 'Collection'],
  },
  community: {
    headlines: ['Community Current', 'The garden is open again', 'What we decided at the meeting', 'Thursday nights, all summer long'],
    decks: ['Your monthly notes from the block, the hall, and the corner you didn’t know had a name.', 'A few things worth knowing, a few dates worth keeping, and one very good soup recipe.'],
    body: [
      'The bench by the mural has been fixed. The person who fixed it would prefer not to be named, but would like everyone to know that the screws are stainless this time. Meanwhile the little library has run out of mysteries and is, apparently, overflowing with poetry. Trade accordingly.',
      'Forty-one people came to the planning meeting, which is thirty more than last year. We talked about the crossing, the lights, and whether the festival should have two stages or one very good one. We chose one. Details inside.',
    ],
    captions: ['The mural bench, newly stainless.', 'Little library, poetry section (all of it).', 'Planning meeting, back row.'],
    quotes: ['“A neighbourhood is just people who have decided to notice each other.”'],
    bylines: ['Compiled by the newsletter crew', 'Edited by Rosa Delgado'],
    kickers: ['Notices', 'Dates', 'From the hall', 'Neighbours'],
  },
  faith: {
    headlines: ['Gathered', 'A season of small lights', 'The table is long enough', 'Notes for a quieter week'],
    decks: ['Reflections, service, and the ordinary rhythm of a community that shows up.', 'This month: the food pantry expands, the choir returns, and a note on rest.'],
    body: [
      'We talk about hope as if it were a feeling, but most weeks it looks like a rota: who brings the bread, who unlocks the hall, who sits with the person nobody else has sat with. Hope, it turns out, is mostly logistics done with love.',
      'The candles are lit one at a time, and for a moment the room is only as bright as the newest flame. Then the next is lit, and the next, and the darkness gives up without a fight.',
    ],
    captions: ['Evening service, third Sunday.', 'The pantry shelves, restocked.', 'Choir rehearsal, back in the loft.'],
    quotes: ['“Come as you are. Leave a little lighter.”'],
    bylines: ['From the pastoral team', 'By Rev. Anna Okoye'],
    kickers: ['Reflection', 'Service', 'Calendar', 'Thanks'],
  },
  business: {
    headlines: ['Field Report', 'What changed this quarter', 'Signal over noise', 'The plan, in one page'],
    decks: ['A confident briefing: what we saw, what it means, what we do next.', 'Three shifts in the market and the one we are betting on.'],
    body: [
      'Demand did not fall; it moved. Customers who used to buy in March bought in May, and bought differently — smaller orders, more often, with a strong preference for anything that shipped in under three days. The chart on the next page shows the shape of that migration.',
      'The recommendation is deliberately narrow. Do one thing well for two quarters, measure it honestly, and resist the temptation to add a second thing before the first is boring.',
    ],
    captions: ['Fig. 1 — order frequency by month.', 'Fig. 2 — fulfilment time vs. repeat rate.', 'Team offsite, day two.'],
    quotes: ['“A strategy you cannot explain on a napkin is a wish.”'],
    bylines: ['Prepared by the strategy group', 'By Daniel Achebe, COO'],
    kickers: ['Summary', 'Signals', 'Analysis', 'Next steps'],
  },
  kids: {
    headlines: ['The Lantern Forest', 'Little Orbit', 'Below the Blue', 'The Moon’s Pocket', 'My Block Sings'],
    decks: ['A story for reading aloud, slowly, with the lights low.', 'For anyone who has ever wondered what the owls talk about.'],
    body: [
      'Deep in the forest, where the moss grew thick as blankets, there lived a very small fox who was afraid of the dark. Every night she counted the lanterns the fireflies made, and every night she fell asleep before she reached ten.',
      'The rocket was not big. It was, in fact, about the size of a teapot. But it had a window, and a seat, and a very brave mouse who had packed three sandwiches for the journey.',
      'Down, down, past the place where the sunlight gives up, the water turns the colour of a whisper. That is where Ondine lives, and she has been waiting for you.',
    ],
    captions: ['Turn the page slowly.', 'Can you find the smallest lantern?', 'Shhh. The moon is listening.'],
    quotes: ['“Ten,” she whispered. And the forest glowed.'],
    bylines: ['Written by Sam Achterberg · Pictures by Lou Kimura', 'By Nia Beaumont'],
    kickers: ['Once upon a time', 'Chapter one', 'The end (for now)'],
  },
  photo: {
    headlines: ['Family Archive', 'Road & Horizon', 'Quiet Frames', 'Vows & Light', 'The Year We Made'],
    decks: ['Photographs from a year that went too fast, arranged so we can slow it down.', 'A sequence, not a pile: every picture chosen because of the one before it.'],
    body: [
      'We did not take these photographs to remember. We took them because the light was good, or someone laughed, or the dog finally sat still. Remembering came later, and it came with the pictures, not the other way round.',
      'The best portraits are patient. The subject forgets the camera; the photographer forgets the clock; and for a fraction of a second, both are simply looking.',
    ],
    captions: ['Kitchen, early. Someone has already made coffee.', 'Mile 412. Nothing for hours, and then this.', 'Portrait, natural light, no direction given.', 'The first dance, from the back of the room.'],
    quotes: ['“Every album is an argument about what mattered.”'],
    bylines: ['Photographs by the family', 'Edited by Marguerite Ellis'],
    kickers: ['Plate I', 'Sequence', 'Portfolio', 'Spring'],
  },
  comic: {
    headlines: ['Velocity', 'Midnight Casefiles', 'Bright Side', 'Rising Impact', 'Petals & Promises', 'Afterimage', 'Infinite Scroll'],
    decks: ['Issue #01 · The gathering storm', 'A new case. A city that never explains itself.'],
    body: ['The city didn’t sleep. It just closed its eyes and pretended.', 'You can’t outrun a promise. Believe me, I’ve tried.', 'Wait… did you hear that?', 'This is where it gets complicated.'],
    captions: ['MEANWHILE, ACROSS TOWN…', 'THREE HOURS EARLIER.', 'Later that night.'],
    quotes: ['KRAK!', 'WHOOM', 'ザッ', 'ドン', 'tk… tk… tk…'],
    bylines: ['Story · Mia Torres  Art · Kenji Oda  Letters · Bea Oyelaran', 'By the Panel Stories collective'],
    kickers: ['Chapter 01', 'Prologue', 'Episode 12'],
  },
  food: {
    headlines: ['Bistro Fold', 'Tasting Notes', 'Night Market', 'Modern Café', 'Kids Lunch'],
    decks: ['Small plates, long evenings.', 'Seasonal, mostly local, always shared.'],
    body: ['Roasted beetroot, whipped goat curd, hazelnut, dill oil', 'Hand-cut pappardelle, slow lamb ragù, pecorino', 'Charred hispi cabbage, miso butter, sesame', 'Brown butter madeleines, lemon curd', 'Cold brew tonic · house lemonade · yuzu soda'],
    captions: ['Ask about today’s special.', 'All dishes can be made vegetarian on request.', 'Service is included. Tips go to the kitchen.'],
    quotes: ['“Cook like someone you love is hungry.”'],
    bylines: ['Chef Iris Nakamura', 'Kitchen team'],
    kickers: ['Starters', 'Mains', 'Sweet', 'Drinks', 'For the little ones'],
  },
  event: {
    headlines: ['Midnight Premiere', 'Exhibition Opening', 'Book Launch', 'Neighborhood Festival', 'Youth Workshop', 'Event Countdown'],
    decks: ['One night only. Doors at eight.', 'Bring someone who has never been.'],
    body: ['An evening of new short films, followed by a conversation with the directors and a very late dinner.', 'Live painting, three stages, forty stalls, and the best lemonade on the east side.'],
    captions: ['Free entry · all ages · fully accessible', 'RSVP by Friday · limited seating', 'Rain or shine'],
    quotes: ['“Be there when the lights go down.”'],
    bylines: ['Presented by Plajah Live', 'Hosted by the Riverside Collective'],
    kickers: ['Saturday 14 June', 'Opening night', 'Save the date'],
  },
  education: {
    headlines: ['School Chronicle', 'Lesson Plan', 'Learning Card', 'Classroom Canvas'],
    decks: ['What we learned this month, who made us proud, and what comes next.', 'Objectives, sequence, assessment — one page, no jargon.'],
    body: ['By the end of this lesson, learners will be able to explain why the moon appears to change shape, using a model they built themselves.', 'Materials: a lamp, a ball, a dark room, curiosity.', 'Year 5 spent the week measuring the playground in footsteps, then in metres, then in arguments about which was more accurate.'],
    captions: ['Opening · exploration · practice · reflection', 'Student work, Year 5, on display in the hall.'],
    quotes: ['“Understanding is visible when a student can teach it back.”'],
    bylines: ['Ms. Adebayo, Year 5', 'The teaching team'],
    kickers: ['Objectives', 'Materials', 'Sequence', 'Assessment'],
  },
  personal: {
    headlines: ['Creator Notes', 'Studio Proposal', 'Creative Résumé', 'Press Kit', 'Quiet Report'],
    decks: ['What I made this month, what broke, and what I’m making next.', 'Designer · educator · occasional printmaker · Detroit'],
    body: ['I spent most of March making one poster and unmaking it four times. The fifth version is the first one, with the type two points smaller. This is how it usually goes.', 'Selected work: identity for a community radio station; a wayfinding system for a library that had never had one; a book of other people’s marginalia.'],
    captions: ['Studio, north light, March.', 'Version five (which is version one).'],
    quotes: ['“Make the thing, then make it quieter.”'],
    bylines: ['— Kenne', 'From the studio'],
    kickers: ['Profile', 'Selected work', 'Experience', 'Contact'],
  },
};

const pick = <T,>(arr: T[], i = 0) => arr[((i % arr.length) + arr.length) % arr.length];
export const copy = {
  headline: (v: Voice, i = 0) => pick(PACK[v].headlines, i),
  deck: (v: Voice, i = 0) => pick(PACK[v].decks, i),
  body: (v: Voice, i = 0) => pick(PACK[v].body, i),
  /** Several paragraphs joined by blank lines. */
  paragraphs: (v: Voice, n = 2, start = 0) => Array.from({ length: n }, (_, k) => pick(PACK[v].body, start + k)).join('\n\n'),
  caption: (v: Voice, i = 0) => pick(PACK[v].captions, i),
  quote: (v: Voice, i = 0) => pick(PACK[v].quotes, i),
  byline: (v: Voice, i = 0) => pick(PACK[v].bylines, i),
  kicker: (v: Voice, i = 0) => pick(PACK[v].kickers, i),
  pack: (v: Voice) => PACK[v],
};
