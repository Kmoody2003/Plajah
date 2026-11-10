# Machine Soul: Detroit Techno Exhibition

An interactive history exhibition: how Detroit techno began, the godfathers who made it, the Detroit–Berlin connection, a tribute to Juan Atkins, and three 90-second social spots pre-visualized in 16:9 and 9:16.

- **Open it in the app:** AppView `TECHNO_EXHIBIT` (command nav → Entertainment → Machine Soul), or from anywhere:
  `window.dispatchEvent(new CustomEvent('plajah:openTechnoExhibit', { detail: { room: 'tx-atkins' } }))`
- **Lab (no app around it):** launch config `techno-exhibit-lab` → http://127.0.0.1:3237/?room=tx-atkins
- **Type-check:** `npx tsc -p tsconfig.techno-exhibit.json`

## Rooms

| # | Room | What's in it |
|---|---|---|
| 01 | Entrance | Stencil title on brick behind hazard tape |
| 02 | Timeline | 7 eras, 1967 to today. The spray-painted spine draws itself as you scroll, the year counter rolls to the era you're in, events slam in as wheat-pasted bills. Filter: Detroit / Berlin / the bridge |
| 03 | Pioneers | Poster wall in four waves (roots, first wave, second wave, the Berlin side). Tap a poster for the story, labels and records |
| 04 | The Bridge | Detroit → Berlin arc across a xeroxed Atlantic with 8 stops (1988 compilation → Borderland 2013), plus "Two broken cities" pairs |
| 05 | The Originator | Juan Atkins tribute: rotating alias ring, 7 chapters, a crate of 15 sleeves, and **Machine Funk**, a 16-step sequencer where every sound is synthesized in the browser |
| 06 | Edit bay | The 90 s spots as animatics: 16:9 + 9:16 side by side, burned-in captions, 9:16 UI safe zones, scratch bed + scratch VO, scrub, copy script |
| 07 | Archive | Documentaries/interviews and sources |

## Files

- `data/technoExhibit/history.ts`: tracks (with YouTube ids), eras/events, pioneers, sources
- `data/technoExhibit/atkins.ts`: tribute chapters, aliases, sleeves, dedication
- `data/technoExhibit/spots.ts`: the three spot scripts (shot list = previz input)
- `components/exhibits/technoHistory/`: `TechnoExhibit` (shell + nav), `gritKit` (concrete/brick/xerox/halftone/wheat-paste/tape CSS, Reveal), `ListeningBooth` (YouTube dock), `TimelineRoom`, `PioneersRoom`, `BerlinRoom`, `AtkinsTribute`, `SpotPreviz`, `machineFunk` (Web Audio drum machine + bass)

## Sharing to the feed

- "Share this room" in the nav posts whichever room you are in; "Share the tribute" posts the Juan Atkins room. Both go through `shareTechnoExhibit(roomId)` in `TechnoShare.tsx`, which calls `backendService.createPost` with a hook line, hashtags (#MachineSoul #DetroitTechno, plus #JuanAtkins for the tribute) and `assetEmbed: { type: 'TECHNO_EXHIBIT', roomId }`.
- `PostCard` shows that embed as `TechnoExhibitEmbed`, a hazard-tape poster card. Tapping "Step inside" fires `plajah:openTechnoExhibit` and opens the exhibit at the shared room.
- When you're signed out, the button says "Sign in to share". The lab fakes the post (`?view=embed` shows the cards).

## Music and rights

- **In the exhibit:** recordings play only as YouTube embeds (`youtube-nocookie.com`, loaded on tap). We don't host or clip any audio. All 29 video ids were checked against YouTube oEmbed on 2026-11-09; most are official label or "Topic" uploads. Fan uploads: Techno Music, Nude Photo, Universal Techno. A track without an id opens a YouTube search instead of guessing.
- **In the spots:** shareable video can't use those recordings. Each spot runs on an original bed made in Chora; the previz uses the exhibit's own synth as a stand-in. Archival photos and footage are marked "license or illustrate" in each shot.
- **Facts:** kept to the documented record (Sicko, Denk & von Thülen, Reynolds, *High Tech Soul*, *Universal Techno*). Where accounts differ, the text says so.

## Open items

- Real portraits: commission illustrations or license photos (the previz uses silhouettes; the exhibit uses typographic posters).
- Final spot production: record VO, make the beds in Chora, and render through the promo-spots pipeline (renderFrame-style capture: `window.__txPreviz.seek(t)` steps the previz deterministically).

## The 90-second spots

### Machine Soul: Detroit → Berlin (90 s, 128 BPM, 137 VO words)

*How a broken Motor City built techno, and how a broken Berlin turned it up.*

**Bed (original, made in Chora):** Original electro bed in Chora: 808-style kit, vocoder pad, square-wave bass. Bar 1 is full volume (no filtered intro). Drop out to a single kick at 0:56 for the Wall, slam back at 1:04 with a 909-style kit for Berlin.

| Time | On screen | VO | Visual | 16:9 | 9:16 | Sound |
|---|---|---|---|---|---|---|
| 0:00–0:04 | **DETROIT. 1981.** | Detroit. Nineteen eighty-one. | Black frame, xerox noise. Stencil type sprays on letter by letter on the first kick. | Type centred, 60% width. | Type stacked DETROIT / 1981, fills top two thirds. | Kick + vocoder "Detroit" chop on beat 1. |
| 0:04–0:12 | **THE LINE GOES QUIET**<br>Population: 1.85M (1950) → 1.2M (1980) | The assembly lines are going quiet. Robots took the jobs. Motown already left for L.A. | Archival auto-plant footage (license: Detroit Public Library / Reuther Library), halftone-processed, sparks overlaid. Population counter ticks down. | Footage full-frame, counter lower-left. | Footage cropped to a single welder, counter top. | Bed + metal hits on the snare. |
| 0:12–0:20 | **THE ELECTRIFYING MOJO**<br>Kraftwerk ▸ Parliament ▸ Prince | But at midnight, one DJ, the Electrifying Mojo, plays Kraftwerk next to Parliament. And the kids are listening. | Radio dial sweeps; needle lands; band names flicker past like station IDs. | Dial across the frame. | Dial vertical, names scroll up. | Tuning-static riser into bar 5. |
| 0:20–0:30 | **CYBOTRON**<br>Juan Atkins + Rick Davis · 1981 | In a community college, Juan Atkins and Rick Davis build Cybotron: funk, made by machines. | Two wheat-pasted posters slap onto a brick wall. "Alleys of Your Mind" sleeve slides in. (Photos: license, or commission illustrated portraits.) | Posters left/right, sleeve centre. | Posters stacked, sleeve bottom. | Vocoder phrase from the bed (original, not Cybotron). |
| 0:30–0:40 | **THE BELLEVILLE THREE**<br>Metroplex · Transmat · KMS | Atkins teaches two friends from Belleville: Derrick May and Kevin Saunderson. Three friends. Three labels. | Three posters drop in on beats 1, 2, 3; label names stencilled under each. | Three across. | Three stacked, each a third of the height. | Three snare hits land with the posters. |
| 0:40–0:48 | **TECHNO**<br>UK compilation · 1988 | In 1988, a British compilation puts a name on the sound. Techno. | The word slams onto the wall in spray, drips run. | Word fills 80% width. | Word rotated 90° up the frame. | Big crash, everything stops for half a beat on "Techno." |
| 0:48–0:56 | **UNDERGROUND RESISTANCE**<br>Banks · Mills · Hood | A second wave pulls on masks. Underground Resistance. No faces. No compromise. | Black sleeves with catalog numbers slide past fast; masked silhouettes. | Sleeves conveyor left→right. | Sleeves fall top→bottom. | Bed gets harder, distorted bass. |
| 0:56–1:04 | **9 NOV 1989**<br>Berlin | Then, four thousand miles away, the Berlin Wall falls. | A concrete wall cracks down the middle; daylight through the gap. (Archive: licensed Wall-fall footage.) | Crack vertical centre. | Crack vertical centre, date top. | Music drops to one kick and crowd noise. |
| 1:04–1:14 | **TRESOR**<br>Tresor 001: X-101 (Detroit) | East Berlin is full of empty buildings. A bank vault becomes a club called Tresor. Its first record? Detroit. | Steel vault door swings open onto strobes. Tresor 001 sleeve. | Door fills frame, swings toward camera. | Door cropped to the wheel, opens into strobe. | Slam back in with a 909-style kit. |
| 1:14–1:22 | **DETROIT ⟷ BERLIN** | Two broken cities. One sound. Detroit built the machine. Berlin turned it up. | Spray-painted line arcs from Detroit to Berlin over a xeroxed map. | Map with Atlantic in centre. | Map rotated: Detroit bottom, Berlin top. | Full bed, riser. |
| 1:22–1:30 | **MACHINE SOUL**<br>The exhibition · on Plajah | Machine Soul. Step inside, on Plajah. | Title in the Plajah gradient over the brick wall; CTA; ~2 s quiet end card. | Title centre, CTA under. | Title top half, CTA lower third, safe of the UI chrome. | Last bar, then ring-out and 2 s quiet. |

### The Belleville Three (90 s, 126 BPM, 132 VO words)

*Three friends from a small town outside Detroit, and the labels that built techno.*

**Bed (original, made in Chora):** Original bed in Chora: strings-and-piano riff over a 909-style groove (in the spirit of the era, no interpolation of any real record). Each pioneer gets a change in the bed: electro for Atkins, strings for May, deep bass for Saunderson.

| Time | On screen | VO | Visual | 16:9 | 9:16 | Sound |
|---|---|---|---|---|---|---|
| 0:00–0:05 | **BELLEVILLE, MI**<br>pop. small. dreams: not. | Thirty miles from Detroit, in a small town called Belleville… | Road sign stencilled over a farm road. | Sign right third. | Sign centre. | Bed in full from frame 1. |
| 0:05–0:12 | **THREE KIDS** | …three kids became friends over records, drum machines and the Electrifying Mojo. | Three blank posters, first names sprayed on. | Three across. | Stacked. | Three hits. |
| 0:12–0:30 | **JUAN ATKINS**<br>The Originator · Cybotron · Model 500 · Metroplex | Juan Atkins was the oldest, and he went first. Cybotron in 1981. Then alone, as Model 500, on his own label, Metroplex. He called it techno. | Atkins poster fills the wall; Metroplex 001 sleeve; the word TECHNO tagged beside him. | Poster left, sleeve right. | Poster top, sleeve bottom. | Bed shifts to electro. |
| 0:30–0:48 | **DERRICK MAY**<br>The Innovator · Rhythim Is Rhythim · Transmat | Derrick May learned the machines from Juan. Then he made "Strings of Life", a record with no kick drum in its opening, that broke Detroit wide open in Europe. | May poster; Transmat sleeve; strings drawn as scratched lines. | Poster right, sleeve left. | Poster top. | Bed shifts to strings + piano. |
| 0:48–1:06 | **KEVIN SAUNDERSON**<br>The Elevator · Inner City · Reese · KMS | Kevin Saunderson took it to the charts with Inner City, and as Reese wrote a bassline drum and bass still runs on. | Saunderson poster; KMS sleeve; a chart graph sprayed climbing. | Poster left. | Poster top. | Bed shifts to deep detuned bass. |
| 1:06–1:16 | **GEORGE CLINTON + KRAFTWERK**<br>"…stuck in an elevator…" Derrick May on techno | May once described techno as George Clinton and Kraftwerk, stuck in an elevator together. | Typewritten quote on tape strips across the wall. | Quote across centre. | Quote wrapped in four lines. | Bed strips to drums. |
| 1:16–1:24 | **METROPLEX · TRANSMAT · KMS** | Three labels. One city. A sound the whole world still dances to. | The three label logos-as-stencils stamp in. | Three across. | Stacked. | Everything back in. |
| 1:24–1:30 | **THE BELLEVILLE THREE**<br>Machine Soul · on Plajah | Meet them in Machine Soul, on Plajah. | Plajah gradient title, CTA, ~2 s quiet. | Centre. | Title top, CTA lower third. | Ring-out + 2 s quiet. |

### The Originator: A Tribute to Juan Atkins (90 s, 130 BPM, 153 VO words)

*Before it had a name, Juan Atkins was already making it.*

**Bed (original, made in Chora):** Original bed in Chora at 130 BPM: an electro pattern built in the exhibit's own "Machine Funk" sequencer (808-style kit, square bass, vocoder pad). The sequencer grid itself is the visual motif.

| Time | On screen | VO | Visual | 16:9 | 9:16 | Sound |
|---|---|---|---|---|---|---|
| 0:00–0:06 | **BEFORE IT HAD A NAME** | Before it had a name… | A 16-step grid lights up step by step in time with the bed. | Grid across the frame. | Grid as 4×4 square. | Bed starts on the grid's first step. |
| 0:06–0:14 | **JUAN ATKINS**<br>b. 1962 · Detroit | …Juan Atkins was already making it. Detroit-born, Belleville-raised, with a synthesizer and a science-fiction imagination. | Wheat-paste portrait (commissioned illustration or licensed photo). | Portrait right, name left. | Portrait fills, name over shoulder. | Vocoder pad swells. |
| 0:14–0:24 | **CYBOTRON**<br>Alleys of Your Mind · Cosmic Cars · Clear | With Cybotron he made "Alleys of Your Mind", "Cosmic Cars", and "Clear", records that hip-hop has rebuilt ever since. | The three sleeves (as typographic stand-ins) slide in. | Three across. | Cascade. | Bed adds square bass. |
| 0:24–0:34 | **TECHNO**<br>from Toffler's "techno rebels" | He read about the "techno rebels" of a coming information age, and took the word to the dance floor. | TECHNO slams onto the wall; book-page texture behind. | Full width. | Vertical. | Crash. |
| 0:34–0:44 | **METROPLEX 001**<br>Model 500 · No UFO's · 1985 | In 1985 he started his own label, Metroplex, and released "No UFO's" as Model 500. Faster. Colder. Brand new. | Metroplex 001 catalog number stamped big. | Centre. | Centre. | Bed speeds feel: hats double. |
| 0:44–0:54 | **HE TAUGHT THEM** | He showed his younger friends Derrick May and Kevin Saunderson how the machines worked. Then the world caught on. | Two posters plus a third that is a mirror: the viewer. | Three across. | Stacked. | Three hits. |
| 0:54–1:06 | **DETROIT ⟷ BERLIN**<br>3MB feat. Juan Atkins · Tresor · 1992 | When Berlin opened its vaults, Atkins was there, recording with Moritz von Oswald in 1992, and again as Borderland twenty years later. | Spray line Detroit→Berlin, two dates on it: 1992, 2013. | Map. | Map rotated. | 909 swaps in for the Berlin half. |
| 1:06–1:18 | **THE ORIGINATOR**<br>Cybotron · Model 500 · Infiniti · Metroplex | Forty-five years of records, and still pointed at the future. They call him the Originator, because before him, there wasn't a name for this. | Every alias sprayed in a ring around the portrait. | Ring around centre. | Ring around centre. | Full bed, last build. |
| 1:18–1:24 | **THANK YOU, JUAN** | Thank you, Juan. | Grid freezes on a pattern that spells J-A in lit steps. | Grid. | Grid. | Bed cuts to vocoder pad alone. |
| 1:24–1:30 | **THE ORIGINATOR**<br>A tribute in Machine Soul · on Plajah | Visit the tribute, in Machine Soul on Plajah. | Plajah gradient title, CTA, ~2 s quiet. | Centre. | Title top, CTA lower third. | Ring-out + 2 s quiet. |

