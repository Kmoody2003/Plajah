// photoArtCurriculum — Part 3B of the Experience Expansion: the Art & Photography School.
//
// Authored against the shared school chassis (`services/schoolChassis.ts`) and rendered by
// `components/school/SchoolView.tsx`, exactly like Film School and Chora's music history.
// Twelve tracks in two groups:
//
//   Photography — exposure → composition → light → colour → genres → editing → business
//   Art         — elements & principles → drawing → colour theory → history survey → criticism
//
// Every lesson carries real teaching text, an assignment (photography assignments open the
// photo editor and publish under #photoschool; art assignments are studio/reading work under
// #artschool) and free, permanent resources — open-access museum collections (The Met,
// Rijksmuseum, Art Institute of Chicago, Cleveland, NGA, Smithsonian) and Khan Academy /
// Smarthistory art history.
//
// standardIds use National Core Arts Standards anchor codes (VA:Cr / VA:Pr / VA:Re / VA:Cn),
// so completions roll up into the portable Academic Passport alongside everything else.
//
// A note on video: rather than hard-code YouTube ids that rot into broken players, lessons use
// `watchAlong` with a durable search or institution URL. Add `videoId` per lesson as the team
// curates and verifies specific films.

import type { Curriculum } from '../services/schoolChassis';

const MET = 'https://www.metmuseum.org/art/collection';
const MET_TOAH = 'https://www.metmuseum.org/toah/';
const RIJKS = 'https://www.rijksmuseum.nl/en/rijksstudio';
const ARTIC = 'https://www.artic.edu/collection';
const CLEVELAND = 'https://www.clevelandart.org/art/collection/search';
const NGA = 'https://www.nga.gov/';
const KHAN_AH = 'https://www.khanacademy.org/humanities/art-history';
const SMARTHISTORY = 'https://smarthistory.org/';
const TATE_TERMS = 'https://www.tate.org.uk/art/art-terms';
const CIC = 'https://www.cambridgeincolour.com/tutorials.htm';

/** Photography assignment defaults — open the photo editor, publish to the student wall. */
const photoTask = (prompt: string) => ({ prompt, tool: 'PHOTO' as const, postTag: 'photoschool' });
/** Art theory/looking assignment — no tool required. */
const lookTask = (prompt: string) => ({ prompt, tool: 'NONE' as const, postTag: 'artschool' });
/** Art writing assignment — drafted in Lorea. */
const writeTask = (prompt: string) => ({ prompt, tool: 'LOREA' as const, postTag: 'artschool' });

export const PHOTO_ART_SCHOOL: Curriculum = {
  id: 'photo-art-school',
  label: 'Art & Photography School',
  blurb:
    'A complete education in the visual arts — from the exposure triangle to the Renaissance. ' +
    'Twelve tracks, taught with the world’s open-access museum collections as the textbook, ' +
    'and a camera in your hand from the first lesson.',
  accent: '#C9A55C',
  framework: 'NCAS-VISUAL-ARTS',
  tracks: [
    // ══════════════════════════════════════════════════════════════════════════
    // PHOTOGRAPHY
    // ══════════════════════════════════════════════════════════════════════════
    {
      id: 'photo-exposure',
      title: 'Photography I · The Exposure Triangle',
      blurb: 'How a camera actually records light — and how to take the controls off automatic for good.',
      level: 'FOUNDATION',
      lessons: [
        {
          id: 'px-1', title: 'What a photograph is', minutes: 12,
          blurb: 'Light, a sensitive surface, and a decision about time.',
          body:
`A photograph is a measurement of light over a period of time. Everything else — lenses, sensors, film, phones — is engineering around that single fact. When you press the shutter you are opening a hole for a duration and letting a scene deposit itself onto a surface.

Three controls govern how much light lands: the size of the hole (aperture), how long it stays open (shutter speed), and how strongly the recording surface reacts (ISO). They are not independent settings on a menu. They are three ways of arriving at the same quantity of light, and each one costs you something different in the picture.

That trade is the entire craft. Aperture buys you depth of field. Shutter speed buys you motion. ISO buys you cleanliness. You will spend your career deciding which of the three you are willing to spend.

Before touching a dial, learn to see the exposure as a target rather than a setting. A "correct" exposure is not a number the camera knows — it is the brightness that serves the picture you intend. The camera's meter is a suggestion made by a machine that cannot see your subject.`,
          watchAlong: { title: 'Cambridge in Colour — Camera Exposure', url: CIC, note: 'Read the "Camera Exposure" and "Digital Camera Sensors" tutorials before the next lesson.' },
          assignment: photoTask('Shoot the same subject three times: once as the camera meters it, once one stop brighter, once one stop darker. Post all three and say which is correct and why. There is more than one right answer.'),
          resources: [
            { label: 'Cambridge in Colour — free photography tutorials', url: CIC },
            { label: 'The Met — Photography collection', url: 'https://www.metmuseum.org/art/collection/search?department=19' },
          ],
          standardIds: ['VA:Cr2.1'],
        },
        {
          id: 'px-2', title: 'Aperture and depth of field', minutes: 16,
          blurb: 'The f-number, why it runs backwards, and what a wide lens really does to space.',
          body:
`Aperture is the adjustable hole inside the lens, described as an f-number: f/1.4, f/2.8, f/8, f/16. The number is a ratio — focal length divided by the diameter of the opening — which is why it runs backwards. f/1.4 is a huge hole; f/16 is a pinhole.

Each full stop halves or doubles the light. The standard series is f/1.4, f/2, f/2.8, f/4, f/5.6, f/8, f/11, f/16. Memorise it. Those are not arbitrary numbers: each step multiplies by roughly the square root of two, because area scales with the square of diameter.

The side effect is depth of field — the band of distance that appears acceptably sharp. Wide open, that band can be millimetres deep; a portrait at f/1.4 puts an eyelash in focus and dissolves the ear. Stopped down to f/11, a landscape holds from the foreground rock to the mountain.

Depth of field is not a quality setting, it is a sentence structure. Shallow depth says "this, and nothing else matters." Deep depth says "all of this at once, and the relationships between them." Photographers who shoot everything wide open are making the same sentence over and over.

Lenses are also sharpest a couple of stops from wide open — typically f/4 to f/8 — and lose sharpness again at the smallest apertures because of diffraction. Wide open for effect, mid-range for information.`,
          assignment: photoTask('Photograph one crowded scene twice from the same position: once at your widest aperture, once at f/11 or narrower. The subject should change meaning between the two frames. Post both and name the change.'),
          resources: [
            { label: 'Cambridge in Colour — Depth of Field', url: 'https://www.cambridgeincolour.com/tutorials/depth-of-field.htm' },
            { label: 'Lensrentals Blog — optics, tested honestly', url: 'https://www.lensrentals.com/blog/' },
          ],
          standardIds: ['VA:Cr2.1'],
        },
        {
          id: 'px-3', title: 'Shutter speed and the shape of time', minutes: 14,
          blurb: 'Freezing, blurring, panning, and the reciprocal rule for hand-holding.',
          body:
`Shutter speed is the duration of the exposure — 1/2000s, 1/60s, 30s. It is the only camera control that has no equivalent in human vision. Your eye has no shutter. Every photograph that freezes a splash or smears a waterfall is showing you something nobody has ever seen directly.

Fast speeds freeze. 1/1000s stops a sprinter, 1/4000s stops a hummingbird's wing. Slow speeds accumulate: a two-second exposure turns a river into silk and a crowd into ghosts, because only the stationary parts of the scene deposit consistently.

Two separate blurs exist and beginners confuse them. Subject blur comes from the subject moving during the exposure — sometimes exactly what you want. Camera shake comes from you moving, and is never what you want. The old reciprocal rule: hand-hold no slower than one over the focal length. A 50mm lens wants 1/50s or faster; a 200mm wants 1/200s. Stabilisation buys you two to four stops beyond that, but it stabilises your hands, not your subject.

Panning is the deliberate combination: follow a moving subject with the camera at around 1/30s so the subject stays sharp and the world streaks behind it. It fails often. Shoot twenty frames to keep one.`,
          assignment: photoTask('Make two photographs of moving water, traffic or a crowd — one frozen faster than 1/500s, one longer than one second. Post the pair with the shutter speeds in the caption.'),
          resources: [{ label: 'Cambridge in Colour — Shutter speed', url: CIC }],
          standardIds: ['VA:Cr2.1'],
        },
        {
          id: 'px-4', title: 'ISO, noise, and the signal you are actually recording', minutes: 13,
          blurb: 'Sensitivity is amplification. Understand what you amplify.',
          body:
`ISO describes how strongly the signal off the sensor is amplified before it becomes an image. Raising ISO does not collect more light — it turns up the volume on the light you collected, and the noise comes up with it.

Noise appears as luminance grain and, worse, as chroma blotches in the shadows. Modern full-frame sensors are clean to ISO 6400 and usable far beyond; small phone sensors get ugly early because each photosite is tiny and gathers fewer photons.

The rule that matters: expose for the shadows you intend to keep. Noise lives in the underexposed parts of the frame, so a brighter capture pulled down in editing is almost always cleaner than a dark capture pushed up. This is "expose to the right" — bias the histogram toward the highlights, stopping short of clipping them, then bring it back later.

And a professional's ordering: ISO is the last dial you touch, but never the one you refuse to touch. A sharp noisy photograph beats a clean blurred one every single time. Grain is a texture; motion blur from timidity is a mistake.`,
          assignment: photoTask('Shoot the same dim interior at your base ISO with a tripod or brace, and hand-held at high ISO. Compare shadow detail at 100%. Post the crop that surprised you.'),
          resources: [{ label: 'Cambridge in Colour — Image noise', url: CIC }],
          standardIds: ['VA:Cr2.1'],
        },
        {
          id: 'px-5', title: 'Metering, the histogram, and dynamic range', minutes: 15,
          blurb: 'Why your camera meters snow as grey, and how to read the only honest display you have.',
          body:
`A reflective meter assumes the world averages to middle grey — about 18% reflectance. Point it at snow and it renders the snow grey by underexposing; point it at a black cat and it renders the cat grey by overexposing. Exposure compensation exists to overrule this: +1 to +2 for snow and white walls, −1 for a dark subject filling the frame.

Metering modes change what the camera averages. Evaluative/matrix reads the whole scene with scene-recognition weighting — good general default. Centre-weighted favours the middle. Spot reads roughly 2–5% of the frame, which is the only mode that lets you meter a specific thing: a face in stage light, for example.

The histogram is the truth. Your rear screen brightness lies, especially outdoors. The histogram plots tones from black on the left to white on the right; pixels stacked against either wall are clipped and gone. Blown highlights are unrecoverable — there is no data. Crushed shadows can often be lifted, at the cost of noise.

Dynamic range is the distance between the darkest and brightest tone a sensor can hold in one frame — roughly 12–15 stops on a good modern camera, against maybe 20+ in a bright scene. When the scene exceeds the sensor, you must choose what to sacrifice, or bracket and blend. Deciding what to sacrifice is an authorship decision, not a technical failure.`,
          assignment: photoTask('Photograph a high-contrast scene — a bright window from a dark room. Make one frame exposed for the window, one for the room. Post both and argue for which one is the photograph.'),
          resources: [
            { label: 'Cambridge in Colour — Histograms', url: 'https://www.cambridgeincolour.com/tutorials/histograms1.htm' },
          ],
          standardIds: ['VA:Cr2.1', 'VA:Re8.1'],
        },
        {
          id: 'px-6', title: 'Focal length is a statement about distance', minutes: 15,
          blurb: 'Wide, normal, long — and the compression myth, corrected.',
          body:
`Focal length determines angle of view. On full-frame: 14–24mm is ultra-wide, 35mm is reportage-normal, 50mm approximates the perspective of attention, 85–135mm is classic portraiture, 200mm+ isolates.

The persistent myth is that long lenses "compress" and wide lenses "distort". They do not. Perspective — the relative size of near and far objects — is determined entirely by where you stand. A 200mm shot and a 24mm shot from the same spot, cropped to match, show identical perspective. What actually happens is that lenses change where you stand. A wide lens makes you step close, which exaggerates near-to-far size differences; a long lens makes you step back, which flattens them.

This matters because it makes focal length an emotional choice. Wide means "I was inside this" — the photographer is implicated, the space wraps around the viewer. Long means "I observed this" — the photographer is distant, discreet, sometimes voyeuristic. Robert Capa's line, "if your pictures aren't good enough, you aren't close enough," is a statement about intimacy, not resolution.

Crop sensors multiply the effective angle: a 35mm lens on APS-C frames like a 52mm. The lens has not changed; the sensor is looking at a smaller part of its image circle.`,
          assignment: photoTask('Photograph one person at 24mm from arm’s length, and at 85mm or longer from across the room, framing the head the same size in both. Post the pair. The relationship between you and the subject will be visibly different.'),
          resources: [{ label: 'Cambridge in Colour — Lenses & focal length', url: CIC }],
          standardIds: ['VA:Cr2.1'],
        },
        {
          id: 'px-7', title: 'Focus, and what to do when the camera is wrong', minutes: 12,
          blurb: 'Single vs continuous, back-button focus, hyperfocal distance, and manual override.',
          body:
`Autofocus modes: single (AF-S/One Shot) locks and holds — for stationary subjects. Continuous (AF-C/AI Servo) tracks — for anything moving. Modern eye-detection AF is genuinely transformative for portraiture and wildlife, and you should use it.

Back-button focus separates focusing from the shutter release: assign AF to a rear button and the shutter only fires. Now you focus when you choose, recompose freely, and never refocus by accident at the moment of release. It takes a week to internalise and you will not go back.

For landscapes, hyperfocal distance is the focus point that maximises apparent sharpness from half that distance to infinity. Practically: at f/8–f/11 on a wide lens, focus roughly a third into the scene rather than on the horizon, and everything resolves.

Manual focus still wins in three situations: low contrast (fog, night, blank walls), shooting through obstructions (fences, glass, foliage — AF grabs the fence), and macro, where depth of field is so thin you focus by rocking your body millimetres forward and back. Use magnified live view and focus peaking.`,
          assignment: photoTask('Photograph something through a fence, a window, or foliage so that the obstruction is soft and the subject beyond it is sharp. Autofocus will fight you — switch to manual.'),
          resources: [{ label: 'Cambridge in Colour — Hyperfocal distance', url: CIC }],
          standardIds: ['VA:Cr2.1'],
        },
        {
          id: 'px-8', title: 'RAW, colour, and the file as a negative', minutes: 14,
          blurb: 'Why RAW is not a "better JPEG", plus white balance and the case for shooting flat.',
          body:
`A JPEG is a finished print: the camera has already applied white balance, contrast, saturation, sharpening and 8-bit compression, and thrown the rest away. A RAW file is the negative — 12 or 14 bits per channel of unprocessed sensor data, with white balance stored as a note rather than baked in.

The practical difference is latitude. A RAW file typically holds one to two stops of recoverable highlight and several stops of liftable shadow that the JPEG has discarded. It also lets you change white balance after the fact with no penalty, which JPEG cannot do cleanly.

White balance tells the file what counts as neutral. Daylight is around 5500K, tungsten around 3000K (warm/orange), overcast and shade are cooler and want warming. Auto white balance is good and getting better, but it will "correct" a sunset into blandness because it cannot tell the difference between a colour cast and the point of the picture. Lock it for a series so your frames match.

Shoot RAW when the picture matters, RAW+JPEG when you must deliver instantly, and understand that shooting RAW is a promise to do the editing. An unprocessed RAW is meant to look flat and dull — that is headroom, not a fault.`,
          assignment: photoTask('Shoot one scene in RAW at sunset. Produce two edits from the identical file: one with a neutral white balance, one that keeps the warmth. Post both from a single capture.'),
          resources: [
            { label: 'Cambridge in Colour — White balance', url: CIC },
            { label: 'The Met — Photographs department', url: 'https://www.metmuseum.org/about-the-met/collection-areas/photographs' },
          ],
          standardIds: ['VA:Cr2.1', 'VA:Cr3.1'],
        },
      ],
    },
    {
      id: 'photo-composition',
      title: 'Photography II · Composition',
      blurb: 'Where to put things, and the far harder question of what to leave out.',
      level: 'FOUNDATION',
      lessons: [
        {
          id: 'pc-1', title: 'The frame is the first decision', minutes: 12,
          blurb: 'Photography is subtractive. Everything begins with the edges.',
          body:
`Painters begin with an empty surface and add. Photographers begin with an infinite, chaotic world and cut a rectangle out of it. Composition in photography is therefore fundamentally subtractive: the question is never "what shall I include" but "what can I get rid of."

The edges are the most under-used tool in the medium. Before releasing the shutter, run your eye around the four borders of the viewfinder. Amputated limbs at the edge, a bright corner pulling the eye out of frame, a pole growing out of a head, a stray hand — these are what separate an amateur frame from a professional one, and they are all fixed by moving two feet.

Aspect ratio is authorship. 3:2 is the 35mm inheritance and reads as reportage. 4:3 is calmer and more classical. 1:1 removes any argument about direction and forces the eye to the centre — which is why it suits portraits and still life. 16:9 is cinematic and horizontal in its sympathies. Choose it before you shoot, not after.

Fill the frame. A photograph of a thing at 30% of the frame is usually a photograph of the background.`,
          assignment: photoTask('Make five photographs where the only change between frames is how much of the world you excluded — same subject, progressively tighter. Post the sequence.'),
          resources: [{ label: 'Tate — Art terms glossary', url: TATE_TERMS }],
          standardIds: ['VA:Cr2.1', 'VA:Re7.2'],
        },
        {
          id: 'pc-2', title: 'Thirds, the golden ratio, and when to break them', minutes: 13,
          blurb: 'Useful defaults, not laws — and the centred frame’s underrated power.',
          body:
`The rule of thirds divides the frame with two horizontal and two vertical lines and suggests placing subjects and horizons near them. It works because it prevents the two blandest options — dead centre and dead edge — and gives a subject somewhere to look or move into.

The golden ratio (roughly 1:1.618) and its phi grid are a tighter version of the same idea, with a longer art-historical pedigree and a great deal of retroactive mythologising. Do not believe claims that the Parthenon and the Mona Lisa were consciously built on it. Treat it as one pleasing subdivision among several.

Now the more useful half of the lesson: centre things deliberately. Symmetry is powerful — it reads as formal, confrontational, monumental, still. A dead-centred portrait stares back at the viewer. A centred one-point-perspective corridor pulls you bodily into the frame. Wes Anderson has built an entire visual signature out of the "wrong" choice.

The real principle underneath both is balance: a frame has visual weight, and the eye notices when it is all pooled in one corner. Thirds is one way to balance. Symmetry is another. A small bright subject against a large dark field is a third. Learn to feel the weight rather than memorise the grid.`,
          assignment: photoTask('Photograph the same subject twice — once on a third, once dead centre. Post both and defend the centred one.'),
          resources: [{ label: 'Art Institute of Chicago — collection', url: ARTIC }],
          standardIds: ['VA:Cr2.1'],
        },
        {
          id: 'pc-3', title: 'Leading lines, shape, and visual rhythm', minutes: 13,
          blurb: 'Directing a viewer’s eye on a path you chose.',
          body:
`A viewer's eye does not land on a photograph randomly. It enters — usually bottom-left in left-to-right reading cultures — and travels along whatever the picture offers: lines, edges, contrast boundaries, gazes. Composition is the design of that journey.

Leading lines are the bluntest instrument: roads, rivers, fences, shadows, railings, converging architecture. They work when they lead somewhere. A road leading to nothing is just a road.

Shape organises at a higher level. The S-curve gives a leisurely path through a landscape. The triangle is the most stable arrangement of three subjects and underpins most classical group portraits — count how many Renaissance Madonnas resolve into a triangle. Diagonals create energy and instability; horizontals rest; verticals assert.

Rhythm is repetition with variation: a row of arches, a line of commuters, windows on a facade. Pure repetition becomes pattern, which is decorative and static. Repetition with one interruption becomes a story — and the interruption becomes the subject. That single broken element is one of the most reliable photographs in existence.`,
          assignment: photoTask('Find a repeating pattern and wait for one element to break it. Post the frame with and without the interruption if you can get both.'),
          resources: [{ label: 'Rijksmuseum — Rijksstudio (open access)', url: RIJKS }],
          standardIds: ['VA:Cr2.1', 'VA:Re7.2'],
        },
        {
          id: 'pc-4', title: 'Layering, depth, and the decisive moment', minutes: 16,
          blurb: 'Building a photograph in three dimensions — the hardest skill in street work.',
          body:
`A flat photograph has one thing at one distance. A layered photograph has a foreground, a middle ground and a background that each carry information and relate to each other. This is the skill that separates competent street photography from great street photography, and it is largely a matter of patience.

The method: find a background worth having — a wall, a light, a gesture, a shape. Frame it. Then wait for the foreground to arrive. Alex Webb builds frames with four or five simultaneous layers; each was found separately and then converged in one instant.

Framing devices — doorways, arches, mirrors, windows, branches — create depth by placing something explicitly nearer than the subject, and they concentrate attention by walling off the periphery.

Henri Cartier-Bresson's "decisive moment" is widely misquoted as "the peak of the action." What he actually described was the instant when the form and the content align — when the geometry of the frame and the meaning of the event become right simultaneously. That is why it is hard: you are not waiting for something to happen, you are waiting for something to happen in the correct place.`,
          watchAlong: { title: 'Magnum Photos — contact sheets and essays', url: 'https://www.magnumphotos.com/', note: 'Study contact sheets: the frames before and after the famous one show you the waiting.' },
          assignment: photoTask('Choose a background and stand there for thirty minutes. Photograph only when someone enters it correctly. Post your best frame and the number of frames it took.'),
          resources: [
            { label: 'Magnum Photos', url: 'https://www.magnumphotos.com/' },
            { label: 'International Center of Photography', url: 'https://www.icp.org/' },
          ],
          standardIds: ['VA:Cr2.1', 'VA:Cr3.1'],
        },
        {
          id: 'pc-5', title: 'Negative space and simplification', minutes: 11,
          blurb: 'Emptiness as an active element.',
          body:
`Negative space is the emptiness around a subject, and it is not leftover — it is a material. A small figure in a vast field of snow, fog, sky or wall reads as solitude, scale, or insignificance. The same figure filling the frame reads as presence. The subject did not change; the space did.

Emptiness also gives the eye somewhere to rest. A frame packed edge to edge with information exhausts a viewer, which is occasionally the intent and usually an accident.

Simplification is the discipline that makes negative space available. Move until the background is one thing: one wall, one sky, one shadow. Change your height — crouching puts a subject against sky, climbing puts it against ground. Open the aperture to dissolve clutter. Wait for the background to clear.

Minimalism is a strong style but a narrow one; the reason to learn it early is that it teaches you to notice clutter, and once you notice clutter you cannot unsee it in any genre.`,
          assignment: photoTask('Make a photograph that is at least 70% empty and still unmistakably about its subject. Post it with the amount of time you spent waiting for the background to clear.'),
          resources: [{ label: 'Cleveland Museum of Art — open access', url: CLEVELAND }],
          standardIds: ['VA:Cr2.1'],
        },
        {
          id: 'pc-6', title: 'Point of view and the height of the camera', minutes: 12,
          blurb: 'The most powerful under-used variable: where your body is.',
          body:
`Most photographs on earth are taken from the standing eye level of an adult holding a phone. That is a viewpoint, and using it by default is a choice you did not make.

Lower the camera and the subject gains stature — you are looking up at it, the background becomes sky, the ground rushes toward the lens. Children and animals photographed from adult height look like specimens; photographed at their own eye level they look like people. Raise the camera and the subject flattens into the ground plane, becoming a pattern, a map, a diagram of relationships.

Distance and angle are the other two axes. Face-on is confrontational and formal. Three-quarter is conversational. From behind creates identification — the viewer looks with the subject rather than at them, which is why the figure-seen-from-behind is a staple from Caspar David Friedrich onward.

The exercise that fixes this permanently: photograph one subject from six positions — lying on the ground, crouched, standing, above, behind, and from one side. One of the six will be better than the one you would have taken.`,
          assignment: photoTask('Photograph one ordinary object — a chair, a bicycle, a mug — from six distinct heights and angles. Post the grid and mark the winner.'),
          resources: [{ label: 'National Gallery of Art (US) — collection', url: NGA }],
          standardIds: ['VA:Cr2.1'],
        },
        {
          id: 'pc-7', title: 'The series: composing across frames', minutes: 14,
          blurb: 'Sequencing, pacing, and why photographers are judged on bodies of work.',
          body:
`Nobody builds a reputation on a single frame. Photographers are read through series — the picture story, the essay, the book, the portfolio — and sequencing is a compositional skill operating at a larger scale.

A working series needs variety of scale: an establishing wide, mid-shots that carry the information, details that carry texture, and portraits that carry the human stake. A set of twenty frames all shot at the same distance is monotonous no matter how good each frame is.

It also needs rhythm. Two loud frames adjacent will fight; separate them with a quiet one. A vertical after four horizontals resets attention. Repeated colours or shapes across a spread create rhyme.

And it needs an argument. What is this set actually claiming? Documentary essays traditionally follow: establish the place, introduce the people, show what they do, show the tension, resolve or refuse to resolve. That is not a formula so much as a checklist for whether you have shot enough.

Edit ruthlessly. Twelve strong frames beat forty adequate ones, and a weak frame in a sequence drags down the frames beside it.`,
          assignment: photoTask('Shoot and sequence a twelve-frame series on one subject over one week — with a wide, mids, details and at least one portrait. Post the sequence in order, as a set, not as favourites.'),
          resources: [
            { label: 'Library of Congress — FSA/OWI documentary archive', url: 'https://www.loc.gov/pictures/collection/fsa/' },
            { label: 'Smithsonian Open Access', url: 'https://www.si.edu/openaccess' },
          ],
          standardIds: ['VA:Pr4.1', 'VA:Cr3.1'],
        },
      ],
    },
    {
      id: 'photo-light',
      title: 'Photography III · Light',
      blurb: 'The actual subject of every photograph. Learn to see it before you learn to make it.',
      level: 'INTERMEDIATE',
      lessons: [
        {
          id: 'pl-1', title: 'The four properties of light', minutes: 14,
          blurb: 'Quality, direction, intensity, colour — the vocabulary everything else depends on.',
          body:
`Every lighting situation on earth, natural or built, can be described with four properties.

Quality is hard or soft, and it is determined by the size of the source relative to the subject. A small source — bare sun, bare flash, a candle — throws hard-edged, black-edged shadows. A large source — an overcast sky, a window, a big diffuser — wraps and throws soft gradual shadows. This is the single most important fact in lighting: to soften light, make the source bigger or bring it closer. Nothing else works.

Direction determines where shadows fall and therefore what shape the subject appears to have. Front light flattens. Side light sculpts. Back light silhouettes and separates. Top light hollows the eyes. Bottom light is the horror-film convention because it inverts the lifelong assumption that light falls from above.

Intensity is how much, and matters relative to everything else in frame — a candle is intense in a dark room and invisible at noon.

Colour is temperature and cast: warm tungsten and low sun, cool shade and overcast, and the green of fluorescent tubes. Mixed sources are the hardest problem in colour photography and often the most interesting one.`,
          assignment: photoTask('Photograph one face in four lighting directions — front, side, back, top — without moving the subject. Post the set and name the emotional difference each direction produced.'),
          resources: [{ label: 'Cambridge in Colour — natural light', url: CIC }],
          standardIds: ['VA:Cr2.1'],
        },
        {
          id: 'pl-2', title: 'Reading natural light across the day', minutes: 14,
          blurb: 'Golden hour, blue hour, hard noon, overcast — and how to use each honestly.',
          body:
`Golden hour, the hour after sunrise and before sunset, gives low warm light that skims across texture, throws long shadows and flatters skin. It is beloved because it is easy. Its risk is sentimentality: golden light makes almost anything look pleasant, which is not the same as making it good.

Blue hour, the twenty to forty minutes after sunset, balances the fading sky against artificial lights so both are exposed correctly at once. It is the correct time for cityscapes and architecture, and it is short — scout first, shoot fast.

Hard midday sun is the light beginners are told to avoid, and avoiding it costs you a great deal. It produces deep graphic shadows, high contrast, and blazing colour — it is the light of Alex Webb, of noon in Mexico and Istanbul. Use it for shape and shadow rather than for faces, or put your subject in open shade and use the sunlit street behind them as a background.

Overcast is a giant softbox: even, gentle, no shadow problems, excellent for portraits and forests. Its cost is flatness and a blank white sky — so exclude the sky, or accept it as pure negative space.

Weather is opportunity. Rain saturates colour and adds reflection. Fog compresses tonal range and separates layers by distance. Snow raises the meter problem from lesson px-5. Photographers who only shoot in nice weather see a fraction of the available pictures.`,
          assignment: photoTask('Photograph the same location four times in one day — dawn, noon, golden hour, blue hour. Post all four. Same place, four different subjects.'),
          resources: [{ label: 'The Met — Photographs collection', url: 'https://www.metmuseum.org/art/collection/search?department=19' }],
          standardIds: ['VA:Cr2.1', 'VA:Re7.2'],
        },
        {
          id: 'pl-3', title: 'Window light and the one-light portrait', minutes: 15,
          blurb: 'The oldest studio in the world, and how the painters used it first.',
          body:
`Before electric light there was a north-facing window, and it produced most of the greatest portraiture in Western art. Vermeer's entire body of work is essentially the same setup: a large soft source at the left, a subject turned into it, and an interior falling gently into shadow.

Working method. Place the subject beside the window rather than facing it — side light, not front light. The closer they stand to the glass, the softer and more rapidly falling-off the light (the inverse square law: brightness falls with the square of distance, so at one metre from a window the shadow side is dramatically darker than at four metres).

Control the contrast with a reflector on the shadow side. A white foam board, a bedsheet, a wall, a piece of paper — anything that bounces light back. Move it in for gentle, pull it away for dramatic. That single variable is the difference between a beauty portrait and a chiaroscuro one.

Turn the subject's face relative to the window to make the classic patterns: Rembrandt lighting (a small triangle of light on the shadow-side cheek), loop lighting (a small nose shadow curving down), split lighting (half lit, half dark), and butterfly (source high and frontal, a small shadow directly under the nose).

Learn these on a window before you ever rent a strobe. Everything a studio does is an attempt to reproduce a good window on demand.`,
          watchAlong: { title: 'Vermeer at the Rijksmuseum', url: RIJKS, note: 'Look at The Milkmaid at full resolution and locate the window, the fall-off, and the bounce.' },
          assignment: photoTask('Make a Rembrandt-lit portrait with a window and one piece of white card. Post it beside the Vermeer or Rembrandt you used as reference.'),
          resources: [
            { label: 'Rijksmuseum — Rijksstudio', url: RIJKS },
            { label: 'The Met — Rembrandt', url: 'https://www.metmuseum.org/art/collection/search?q=Rembrandt' },
          ],
          standardIds: ['VA:Cr2.1', 'VA:Cn11.1'],
        },
        {
          id: 'pl-4', title: 'Flash: from on-camera to off', minutes: 16,
          blurb: 'Bounce, fill, high-speed sync, and getting the light off the hot shoe.',
          body:
`Direct on-camera flash is disliked for a good reason: the source is tiny and sits on the lens axis, so it is hard and frontal — flat faces, black shadows on the wall behind, red eye. It is the one lighting setup that is almost always worse than the available light.

Bounce fixes it instantly. Aim the flash head at a white ceiling or a side wall and the entire ceiling becomes the source. You have just converted a matchbox into a softbox for free. Bounce off coloured surfaces and everything goes that colour; bounce off a wall to the side and you get directional soft light indistinguishable from a window.

Fill flash outdoors is the most professional use of a small flash: expose for a bright background, then add just enough flash to lift the subject's face. Dial the flash to −1 to −2 stops of compensation. Done correctly nobody can tell there was a flash — which is the point.

Two exposures in one. Flash duration is extremely short, so shutter speed controls the ambient light and aperture/flash power controls the flash. Drag the shutter to let a room's atmosphere register behind a flash-lit subject. High-speed sync lets you exceed the camera's sync speed (typically 1/200s) so you can use wide apertures in daylight, at a large cost in power.

Getting the flash off camera — a cheap trigger and a light stand — is the single biggest quality jump available in photography for under a hundred pounds.`,
          assignment: photoTask('Shoot a portrait outdoors at sunset with the sun behind the subject, using fill flash so both the sky and the face are correctly exposed. Post it with a no-flash version.'),
          resources: [{ label: 'Cambridge in Colour — using flash', url: CIC }],
          standardIds: ['VA:Cr2.1'],
        },
        {
          id: 'pl-5', title: 'Modifiers and shaping', minutes: 14,
          blurb: 'Softboxes, umbrellas, grids, flags, gels — and the physics behind each.',
          body:
`Every modifier does one of two jobs: make the source bigger (softer) or make it smaller and more controlled (harder, more directional).

Softboxes enclose a light and diffuse it through a fabric front. Big and close is soft; small and far is hard. Octaboxes give round catchlights in the eye, which reads as natural. Strip boxes give long thin highlights, ideal for edge-lighting a body.

Umbrellas are cheaper and spill light everywhere — good in a large room, terrible in a small one where the spill bounces off every wall and kills your contrast. Shoot-through umbrellas are softer, reflective ones more efficient.

Grids and snoots restrict the spread so light lands only where you point it — the tool for putting a pool of light on a face and letting the room go black. Barn doors and flags do the same job by subtraction, blocking light rather than shaping it. Subtractive lighting — using black card to take light away — is the underrated half of the discipline, and is how you get deep shaped shadows on a face.

Gels change colour: CTO to warm a flash to tungsten, CTB to cool it to daylight, and saturated party colours for effect. Gel your flash to match the ambient source and mixed lighting stops being a problem and becomes a look.

Ratios describe the relationship between key and fill. 1:1 is flat and commercial; 4:1 or 8:1 is dramatic and cinematic. Set the key first, alone, and only then decide how much fill the picture deserves.`,
          assignment: photoTask('Light one subject with a single source and shape it using only black card to subtract light. Post the setup shot and the result.'),
          resources: [{ label: 'Getty Museum — collection', url: 'https://www.getty.edu/art/collection/' }],
          standardIds: ['VA:Cr2.1'],
        },
        {
          id: 'pl-6', title: 'Chiaroscuro: what painters knew first', minutes: 15,
          blurb: 'Caravaggio, Rembrandt, and translating four centuries of light into a camera.',
          body:
`Chiaroscuro — Italian for light-dark — is the modelling of form through strong contrast. Tenebrism, its most extreme form, drops everything but the essential into near-blackness. Caravaggio industrialised it around 1600: a single hard source entering from high left, subjects emerging from darkness, no landscape, no sky, no relief.

The photographic translation is exact. Caravaggio's light is a small hard source, high and to one side, with no fill. Put a bare bulb or a gridded flash high left of your subject in a dark room, add nothing else, expose for the highlights and let the shadows go to black. You now have The Calling of Saint Matthew.

Rembrandt's light is softer and warmer — a larger source, some bounce, shadow that retains information. His portraits keep a small triangle of light on the far cheek, which is why the pattern carries his name. He also understood that the eye reads the lit part as the subject regardless of composition: a face at the edge of a dark canvas still dominates it.

The Dutch interior painters — Vermeer, de Hooch — used the opposite: a large window, gentle fall-off, luminous shadow. Study all three and you have a lighting curriculum with a four-hundred-year test record.

The transferable insight is that shadow is information. Beginners light to eliminate shadow; the masters lit to place it.`,
          watchAlong: { title: 'Smarthistory — Caravaggio', url: SMARTHISTORY, note: 'Search Caravaggio and watch the Calling of Saint Matthew analysis; note where they say the light comes from.' },
          assignment: photoTask('Recreate a specific Caravaggio or Rembrandt lighting setup with one hard source and no fill. Post your photograph next to the painting you copied.'),
          resources: [
            { label: 'Smarthistory — free art history', url: SMARTHISTORY },
            { label: 'Khan Academy — art history', url: KHAN_AH },
            { label: 'The Met — Caravaggio and his followers', url: MET },
          ],
          standardIds: ['VA:Cn11.1', 'VA:Re7.2'],
        },
        {
          id: 'pl-7', title: 'Available darkness: night and low light', minutes: 13,
          blurb: 'Working when there is not enough light, and deciding you do not need more.',
          body:
`Low light is not a problem to be solved so much as a subject with its own rules. Cities at night are lit by pools — shop windows, streetlights, headlights, screens — each a hard small source with brutal fall-off. Photographing there means waiting for people to walk into a pool rather than lighting them.

Technically: open the aperture, drop the shutter as far as your hands allow, and raise ISO without apology (px-4). Brace against walls, use the timer on a wall or bollard for long exposures, and shoot bursts — one of five hand-held frames at 1/15s will be sharp.

Autofocus struggles in darkness because it needs contrast. Focus on an edge where a light meets a dark, or switch to manual and pre-focus at a set distance, then wait for the subject to reach that distance. Zone focusing at f/8 with a wide lens is how a great deal of night street photography is actually made.

Embrace the deficiencies. Noise reads as grain, grain reads as film, and film reads as authenticity. Motion blur at night can be beautiful. Black is not a failure of exposure — it is the majority of the frame and it can carry a picture entirely.`,
          assignment: photoTask('Photograph one hour after dark, hand-held only, no flash. Post three frames. At least one should use motion blur deliberately.'),
          resources: [{ label: 'Cambridge in Colour — low light', url: CIC }],
          standardIds: ['VA:Cr2.1'],
        },
      ],
    },
    {
      id: 'photo-colour',
      title: 'Photography IV · Colour',
      blurb: 'Colour as a compositional force, not a setting — and the discipline of black and white.',
      level: 'INTERMEDIATE',
      lessons: [
        {
          id: 'pk-1', title: 'Colour as structure', minutes: 13,
          blurb: 'Hue, saturation, luminance — and why colour photography took so long to be taken seriously.',
          body:
`Colour has three dimensions. Hue is the position on the wheel — red, cyan, violet. Saturation is intensity, from grey to fully pure. Luminance is brightness. Almost every colour problem you will have is a saturation or luminance problem misdiagnosed as a hue problem.

Colour photography was dismissed as vulgar and commercial well into the 1970s; serious work was monochrome. William Eggleston's 1976 MoMA exhibition — dye-transfer prints of a tricycle, a red ceiling, a freezer — was reviewed as the worst show of the year and is now understood as the moment colour became a subject rather than a description.

The lesson from Eggleston and from Saul Leiter and Fred Herzog is that colour must do compositional work. Ask what the colour is doing in the frame. If the answer is "it is the colour things happen to be," you have taken a colour photograph by default. If the answer is "the red coat is the only warm object in a cold frame and it is where I want the eye," colour is now structure.

Practical consequence: one dominant colour plus one accent beats five competing colours nearly always. Look for scenes that are already limited — fog, snow, night, monochrome architecture — and let one thing be coloured.`,
          assignment: photoTask('Make a photograph where a single small area of saturated colour is the entire subject of an otherwise muted frame. Post it and say what you had to exclude.'),
          resources: [
            { label: 'MoMA — collection', url: 'https://www.moma.org/collection/' },
            { label: 'Art Institute of Chicago — photography', url: ARTIC },
          ],
          standardIds: ['VA:Cr2.1', 'VA:Re7.2'],
        },
        {
          id: 'pk-2', title: 'Harmony: complements, analogues, triads', minutes: 13,
          blurb: 'The colour wheel as a scouting tool.',
          body:
`Complementary pairs sit opposite on the wheel — blue/orange, red/green, yellow/violet — and produce maximum contrast and vibration. Blue and orange dominate commercial photography and cinema because human skin is orange-ish and shadow and sky are blue-ish, so the world hands it to you for free at dusk.

Analogous schemes use neighbours on the wheel — yellow, orange, red — and read as harmonious, calm, unified. Autumn woods, a sunset, a rusted industrial site. They are easy to like and easy to make boring; they need contrast from luminance instead of hue.

Triadic schemes take three evenly spaced hues, which is vivid, balanced and hard to find outdoors. Look for it in markets, sports, signage and playgrounds.

Monochromatic — one hue at varied saturation and luminance — is the most sophisticated and the most controllable. Fog, blue hour, a single-coloured wall.

Use this as a scouting tool rather than an editing tool. Walk a street specifically hunting for a blue wall to put an orange subject against, and you will find one within an hour. Trying to invent harmony in post is usually visible and usually bad.`,
          assignment: photoTask('Scout for and photograph a genuine complementary pair in the world — an orange subject against a blue field or the reverse. No colour grading allowed.'),
          resources: [{ label: 'Adobe Color — interactive colour wheel', url: 'https://color.adobe.com/create/color-wheel' }],
          standardIds: ['VA:Cr2.1'],
        },
        {
          id: 'pk-3', title: 'Colour temperature and mixed light', minutes: 12,
          blurb: 'The hardest technical problem in colour, and how to make it the point.',
          body:
`Kelvin describes the colour of a light source: candle ~1800K, tungsten ~3000K, sunrise ~3500K, midday ~5500K, overcast ~6500K, deep shade ~8000K. Counterintuitively, higher Kelvin is bluer, because it describes the temperature of the emitting black body, not the feeling.

White balance corrects for a source by pushing the opposite direction. Set the camera to tungsten in daylight and everything goes blue; set it to shade under a tungsten bulb and everything goes deep orange. Deliberately wrong white balance is a legitimate creative tool — most "cinematic night" looks are a tungsten balance applied to a blue-lit scene.

Mixed lighting is where it gets hard. A room lit by a window and a table lamp has two colour temperatures at once, and no single white balance can correct both. Your options: kill one source, gel one source to match the other, correct for the important one and let the other go warm or cool as a feature, or convert to black and white.

Fluorescent and cheap LED sources add a green spike that is not a temperature problem at all — it needs a magenta tint correction on a separate axis. That is why some interiors look sickly no matter how you set Kelvin.

The creative reading: a warm interior seen from a cold street is a picture about belonging and exclusion. Colour temperature is emotional before it is technical.`,
          assignment: photoTask('Photograph an interior at blue hour from outside, so warm indoor light and cool exterior light are both in frame. Post the frame and the white balance you chose.'),
          resources: [{ label: 'Cambridge in Colour — white balance', url: CIC }],
          standardIds: ['VA:Cr2.1'],
        },
        {
          id: 'pk-4', title: 'Seeing in black and white', minutes: 14,
          blurb: 'Monochrome is not colour removed — it is a different medium.',
          body:
`In black and white, hue disappears and only luminance survives. That means a red apple on green grass — visually loud in colour — can convert to two nearly identical greys and vanish. Photographers who "convert to black and white if the colour didn't work" produce mud, because they photographed hue contrast and then deleted it.

Monochrome runs on four things: tonal contrast, texture, shape and line. Learn to look at a scene and mentally ask which parts will be light and which dark. Side light and hard light become far more valuable, because they create tonal separation where colour used to. Fog, rain, smoke, strong architecture and weathered skin all photograph better in monochrome than in colour.

Channel mixing in conversion is the digital equivalent of the coloured filters film photographers screwed on the lens. A red filter darkens blue sky dramatically and lightens skin — the classic landscape look, and the reason Ansel Adams's skies are almost black. A yellow filter is a gentler version. A green filter lightens foliage.

Decide before you shoot. Set the camera's monochrome preview while capturing RAW, so you see the world in grey through the viewfinder but retain full colour data in the file. That single habit changes what you notice on the street.`,
          assignment: photoTask('Spend one shoot in monochrome preview mode. Post three black-and-white frames that would be weaker in colour, and say why.'),
          resources: [
            { label: 'The Met — Photographs', url: 'https://www.metmuseum.org/art/collection/search?department=19' },
            { label: 'Library of Congress — FSA archive', url: 'https://www.loc.gov/pictures/collection/fsa/' },
          ],
          standardIds: ['VA:Cr2.1', 'VA:Re8.1'],
        },
        {
          id: 'pk-5', title: 'Colour meaning is cultural', minutes: 11,
          blurb: 'What colours mean, where, and the danger of assuming.',
          body:
`Colour carries association, but association is local. White is mourning across much of East and South Asia and celebration in Western weddings. Red is danger and stop in one context, luck and prosperity in another, revolution in a third. Green means nature, permission and Islam depending on where you are standing.

Within a culture, association is reliable enough to use. Warm hues advance toward the viewer and read as intimate, urgent, alive; cool hues recede and read as distant, calm, clinical, lonely. Desaturation reads as memory, age, austerity or documentary sobriety. High saturation reads as pop, advertising, energy, artifice.

The cinematic conventions are worth knowing because your audience has absorbed them: teal-and-orange for contemporary action, bleached and desaturated for war and grit, warm gold for nostalgia and childhood, sickly green for institutions and menace.

The professional caution: if you are photographing a culture that is not yours, do not assume your colour associations transfer, and do not grade someone else's home into a look. Ask. Documentary ethics start with details this small.`,
          assignment: lookTask('Find three photographs of the same subject with markedly different colour treatments. Write 200 words on how the grading changes the claim each image makes about the subject.'),
          resources: [{ label: 'Smithsonian Open Access', url: 'https://www.si.edu/openaccess' }],
          standardIds: ['VA:Re7.1', 'VA:Cn11.1'],
        },
        {
          id: 'pk-6', title: 'Building a consistent palette', minutes: 13,
          blurb: 'How a body of work comes to look like one photographer made it.',
          body:
`A recognisable photographer has a palette. It is rarely a filter — it is an accumulation of consistent decisions: what light they shoot in, which locations they choose, how they treat skin, where they put their black point.

Start from constraints rather than presets. Choose two or three hues you will allow into your work for a project and scout accordingly. Choose a time of day and stick to it. Choose a contrast level — do your blacks crush to pure black, or lift into a soft matte? — and apply it to everything.

Skin tone is the axis you cannot fudge, because viewers detect wrong skin instantly and cannot always say why. Grade the environment freely; protect skin. And understand that "correct" skin tone is not one number — a grading approach calibrated only on light skin will render deeper skin tones muddy or grey. Check the full range of subjects you photograph, adjust luminance separately from hue, and never let a global preset decide a person's complexion.

Consistency is what turns twenty good photographs into a portfolio. Build one recipe in the photo editor, apply it across a set, and then look at the set as a grid rather than as individual frames — that grid is what a client, a curator or a viewer actually sees.`,
          assignment: photoTask('Take a set of eight photographs and grade them all with one consistent recipe. Post the grid. The set should look like one body of work, not eight photographs.'),
          resources: [{ label: 'Art Institute of Chicago — collection', url: ARTIC }],
          standardIds: ['VA:Cr3.1', 'VA:Pr4.1'],
        },
      ],
    },
    {
      id: 'photo-genres',
      title: 'Photography V · Portrait, Street, Landscape, Documentary',
      blurb: 'The four great traditions — each with its own craft, and its own ethics.',
      level: 'INTERMEDIATE',
      lessons: [
        {
          id: 'pg-1', title: 'Portraiture: direction and trust', minutes: 16,
          blurb: 'The technical part is easy. Getting a real face is the job.',
          body:
`A portrait is a collaboration under mild duress. Almost everyone dislikes being photographed, and the expression you get in the first five minutes is a defence. The craft is in getting past it.

Method matters more than gear. Talk before you lift the camera. Tell people what you are doing and why. Give direction rather than asking for a pose — "look out of the window", "think about the day you got the job", "walk toward me and stop when I say" — because tasks produce natural bodies and instructions like "relax" produce rigid ones. Photograph continuously through the awkward part; the frame you want usually arrives just after they think you have stopped.

Technically: 85–135mm on full frame, wide-ish aperture for separation, light from the side (pl-3), focus on the near eye — always the near eye. Catchlights make eyes alive; without them the subject looks dead. Watch the hands, which are the second most expressive thing in the frame and the thing subjects have no idea what to do with. Give them something to hold or something to do.

Environmental portraits place a person in the space that explains them — a workshop, a kitchen, a field — and typically want a wider lens and more depth of field. Studio portraits strip context away to force attention onto the face. Both are legitimate; they are different claims.

Consent is not a formality. Show people the back of the camera. Tell them where the picture will go.`,
          assignment: photoTask('Photograph someone you know for at least thirty minutes. Post the frame from the last five minutes, not the first five.'),
          resources: [
            { label: 'National Portrait Gallery (Smithsonian)', url: 'https://npg.si.edu/' },
            { label: 'The Met — portraits across the collection', url: MET },
          ],
          standardIds: ['VA:Cr2.1', 'VA:Pr4.1'],
        },
        {
          id: 'pg-2', title: 'Street photography: nerve and geometry', minutes: 15,
          blurb: 'Working in public — technique, courage and law.',
          body:
`Street photography is the discipline of finding order in uncontrolled public life. It rewards two things that rarely coexist: geometric discipline and social nerve.

Technique. Use a wide-to-normal lens (28–50mm) and get close; long lenses produce photographs that look surveilled rather than lived. Zone focus — set f/8, prefocus at two or three metres, and shoot without waiting for autofocus. Set a shutter speed of at least 1/250s and let ISO float. Work the scene: ten or twenty frames of a promising situation, not one.

Approach. Most photographers overestimate how much people care. Move at a normal pace, do not skulk, and if someone notices, smile and say what you are doing. Ask permission when the picture allows it and shoot first when it does not — but be prepared to explain yourself, delete on genuine request, and never argue with someone who is distressed.

Law and ethics are different things. In most public spaces in the US, UK and much of Europe, photographing people in public is legal without consent; publishing commercially usually is not. Laws differ sharply in France, Hungary, South Korea and elsewhere — check where you are. Beyond the law: do not photograph people at their most vulnerable to make yourself look sensitive. Homelessness, addiction and grief are not free subject matter, and the test is whether you would show the person the photograph.

Read the greats for structure, not for imitation: Cartier-Bresson for geometry, Winogrand for volume and tilt, Maier for intimacy, Webb for layering, Parr for irony.`,
          assignment: photoTask('Shoot one hour of street with zone focusing at f/8, no autofocus. Post the three best frames and note how many you took.'),
          resources: [
            { label: 'Magnum Photos', url: 'https://www.magnumphotos.com/' },
            { label: 'Reporters Committee — photographers’ rights', url: 'https://www.rcfp.org/' },
          ],
          standardIds: ['VA:Cr2.1', 'VA:Re7.1'],
        },
        {
          id: 'pg-3', title: 'Landscape: light, patience, and place', minutes: 15,
          blurb: 'Why most landscape photographs fail, and the fix is almost never the camera.',
          body:
`Most landscape photographs fail for one reason: there is no foreground. A distant mountain across an empty field is a record of a view, not a photograph. Great landscapes are built in depth — a rock, a stream, a flower, a fence in the near ground; the middle ground carrying the story; the far ground giving scale.

Then: light and time. The same valley is unphotographable at noon and extraordinary twenty minutes after sunrise. Landscape photography is therefore mostly logistics — scouting in bad light, checking sun position and tide, being in place before dawn, and returning to the same spot repeatedly across seasons. Ansel Adams's practice was rigorous planning, not luck.

Technique. Tripod, base ISO, f/8–f/11 (px-2), focus a third in or at hyperfocal (px-7). A polarising filter cuts reflections off water and foliage and deepens sky — the one filter that cannot be replicated in software. Neutral density filters allow long exposures for smooth water and moving cloud. Graduated ND or exposure bracketing handles the sky-to-land dynamic range gap.

The critical question. Landscape is the genre most prone to producing beautiful pictures with nothing to say — the same three locations shot by ten thousand people with the same drone. Ask what your relationship to the place is. Photographers like Sugimoto, Salgado and Misrach make landscape that carries argument: about time, about labour, about damage.`,
          assignment: photoTask('Photograph a landscape with a deliberate foreground element within two metres of the camera. Post it beside a version without the foreground.'),
          resources: [
            { label: 'National Gallery of Art — collection', url: NGA },
            { label: 'Cleveland Museum of Art — open access', url: CLEVELAND },
          ],
          standardIds: ['VA:Cr2.1', 'VA:Cn10.1'],
        },
        {
          id: 'pg-4', title: 'Documentary and photojournalism', minutes: 17,
          blurb: 'Photographing what is true — the craft, the constraints, and the responsibility.',
          body:
`Documentary photography makes a claim about the world, and that claim is why the ethics are stricter than anywhere else in the medium.

The craft is the picture story. Shoot for a sequence rather than a hero frame (pc-7): establishing, mid, detail, portrait, closing. Cover the same event at several distances. Return — the second and third visit produce the pictures the first cannot, because by then you are not an event.

The constraints are real and non-negotiable in news contexts. You may adjust global tone, contrast, colour balance and crop. You may not add or remove content, composite, or alter the meaning of a frame. You may not stage or direct a news scene. You may not misrepresent when or where something happened. Captions are part of the work and must be accurate — most ethical failures in photojournalism are caption failures.

The responsibility is harder than the rules. You will be in situations where the presence of a camera changes what happens, where people cannot meaningfully consent, and where the picture that would move an audience is also the picture that would humiliate a person. Working documentarians answer this by staying long enough to have a relationship, by returning the work to the community, and by being clear about who benefits.

Study the FSA archive — Dorothea Lange, Walker Evans, Gordon Parks — which is free, enormous, and simultaneously the finest documentary corpus in existence and a case study in government-funded persuasion. Both facts are true, and holding them at once is the skill this lesson is teaching.`,
          watchAlong: { title: 'Library of Congress — FSA/OWI collection', url: 'https://www.loc.gov/pictures/collection/fsa/', note: 'Look up Lange’s Migrant Mother contact sequence and count the frames before the famous one.' },
          assignment: photoTask('Document one small true thing over a week — a shop, a route, a routine. Post six frames with accurate factual captions. No staging.'),
          resources: [
            { label: 'Library of Congress — FSA/OWI archive', url: 'https://www.loc.gov/pictures/collection/fsa/' },
            { label: 'International Center of Photography', url: 'https://www.icp.org/' },
            { label: 'Reporters Committee for Freedom of the Press', url: 'https://www.rcfp.org/' },
          ],
          standardIds: ['VA:Cn10.1', 'VA:Re7.1'],
        },
        {
          id: 'pg-5', title: 'Still life and product', minutes: 13,
          blurb: 'Total control — the genre where you have no excuses.',
          body:
`Still life is the only photographic genre in which everything in the frame is your decision. Nothing moves, nothing objects, nothing leaves. That is liberating and merciless: every weakness is authorship, not circumstance.

Lighting is the whole craft. One large soft source at 45 degrees plus a bounce is the safe default. Back-lighting through a diffuser makes glass and liquid glow and separates transparent objects from the background — the standard approach for bottles. Hard raking light across a surface reveals texture: bread, stone, fabric, skin.

Surfaces determine difficulty. Matte objects are easy. Glossy objects reflect the entire room, so you light the reflection rather than the object — a large white card becomes the highlight you see. Metal and glass are exercises in controlling what is reflected, which is why professional product sets are surrounded by white and black flags.

Commercial requirements are specific: clean or pure-white backgrounds, consistent angles across a range, sharpness front to back (which often needs focus stacking at macro distances), and colour accuracy so the product arrives looking like the picture. This is the most reliably paid photography there is, and it is learnable at a kitchen table with a window, a sheet of paper and a mirror.

The art-historical parallel is worth taking seriously: Dutch still life, vanitas, Chardin, Cotán. Those painters solved these lighting problems and their solutions are free to study.`,
          assignment: photoTask('Photograph one glass object so it is clearly transparent and cleanly separated from the background, using back-lighting through a diffuser. A window and a sheet of paper is enough.'),
          resources: [
            { label: 'Rijksmuseum — Dutch still life', url: RIJKS },
            { label: 'The Met — still life', url: MET },
          ],
          standardIds: ['VA:Cr2.1', 'VA:Cn11.1'],
        },
        {
          id: 'pg-6', title: 'Architecture and the built environment', minutes: 13,
          blurb: 'Verticals, scale, and photographing buildings as ideas.',
          body:
`Point a wide lens up at a building and the verticals converge — the building appears to fall backwards. This keystoning is the defining technical problem of architectural photography. The historical solution is a tilt-shift lens, which shifts the image circle upward so the sensor stays parallel to the facade. The practical solution is to shoot from further back at a greater height, or to correct in software, which costs resolution at the edges.

Keep the camera level. A spirit level or the electronic horizon is not optional here; a half-degree of tilt is visible on a straight facade and nowhere else.

Composition splits into two approaches. The document approach shows the building whole, straight on, in even light, without distortion — the architect's record. The interpretive approach uses fragments, shadows, reflections, and people to say something about how the building is used and how it feels. Both are legitimate; confusing them produces vague photographs.

Light and time matter as much as in landscape. A facade is transformed by raking sun; a glass tower is a mirror at noon and a lantern at blue hour. Interiors usually need bracketing because window brightness overwhelms room brightness (px-5).

Include people when the subject is architecture-as-life, exclude them when the subject is architecture-as-form. Modern architectural photography — Hélène Binet, Iwan Baan — is split precisely along that line.`,
          assignment: photoTask('Photograph one building twice: a straight-on corrected document, and an interpretive fragment. Post both and say which one you would defend in a portfolio.'),
          resources: [{ label: 'Getty Museum — architecture and photography', url: 'https://www.getty.edu/art/collection/' }],
          standardIds: ['VA:Cr2.1'],
        },
        {
          id: 'pg-7', title: 'Events, weddings and working under pressure', minutes: 14,
          blurb: 'The genre that pays for the others — and cannot be reshot.',
          body:
`Event photography is defined by one constraint: it happens once. Every other skill is subordinated to reliability.

Preparation is the job. Scout the venue and find the light before the day. Build a shot list with the client — the specific family groupings, the specific moments they care about, the people who must not be missed. Bring two bodies, spare batteries, spare cards, and a flash you can bounce (pl-4). Cards fail; shoot to dual slots if your camera has them and back up twice before you sleep.

During the event, work in a rhythm: wide establishing frames, mid-range action, tight detail and reaction. Reactions are frequently better than the event — photograph the audience during the speech, the mother during the vows. Anticipate rather than react; be standing where the moment will happen thirty seconds before it does.

Technically: shutter speed high enough to freeze gesture (1/250s), aperture wide enough to work in dim rooms but not so wide that group shots lose a face to focus, ISO wherever it needs to be. Bounce flash off ceilings in receptions. Never use direct on-camera flash at the front of a ceremony.

Professionally: contracts, deposits, delivery timelines, and a written policy for what happens if you are ill. This is a service business with a creative component, and clients judge you on communication at least as much as on pictures.`,
          assignment: photoTask('Cover a small real event — a dinner, a rehearsal, a game — and deliver a tight edit of fifteen frames within 48 hours. The deadline is the exercise.'),
          resources: [{ label: 'ASMP — professional practice resources', url: 'https://www.asmp.org/' }],
          standardIds: ['VA:Pr4.1', 'VA:Pr6.1'],
        },
        {
          id: 'pg-8', title: 'Finding your own subject', minutes: 12,
          blurb: 'The transition from doing exercises to making work.',
          body:
`At some point technical competence stops being the limiting factor and the question becomes: what are you photographing, and why you?

Genres are training wheels. Nobody's serious body of work is "street photography" — it is a specific enquiry that happens to be conducted in the street. Find the enquiry. The usual routes: photograph what you have access to that others do not, photograph what you cannot stop thinking about, or photograph something small and specific for long enough that it becomes large.

Constraint generates originality far more reliably than freedom. One lens, one location, one subject, one year. The photographers whose names you know almost all worked under a self-imposed restriction, and the restriction is what made the work coherent.

Practical method: choose a project you can shoot weekly for six months. Write one paragraph stating what it is about — if you cannot, it is a subject and not yet a project. Shoot, then edit into a sequence every month and notice what the sequence is actually saying, which is often not what you intended. Follow the accident.

And expect the first version to be derivative. Everyone's early work looks like the work they admire. It stops when you have shot enough frames that your own preferences become louder than your influences.`,
          assignment: writeTask('Write a one-paragraph project statement for a six-month photographic project you could actually shoot weekly, then post the first three frames under #photoschool.'),
          resources: [
            { label: 'Magnum Photos — photographer portfolios', url: 'https://www.magnumphotos.com/' },
            { label: 'Artsy — contemporary photography', url: 'https://www.artsy.net/' },
          ],
          standardIds: ['VA:Cr1.1', 'VA:Cr1.2'],
        },
      ],
    },
    {
      id: 'photo-editing',
      title: 'Photography VI · Editing & the Digital Darkroom',
      blurb: 'Developing the negative — a craft with a hundred-year lineage, not a set of filters.',
      level: 'INTERMEDIATE',
      lessons: [
        {
          id: 'pe-1', title: 'Editing means two different things', minutes: 11,
          blurb: 'Selection and processing — and selection is the more important one.',
          body:
`In photography, "editing" historically meant choosing which frames to use. Processing meant adjusting them. The digital era collapsed the words, and photographers got worse at the first meaning as a result.

Selection is where quality is decided. From a shoot of four hundred frames, the difference between a portfolio and a snapshot dump is which twelve you show. Ruthlessness is the skill: if you are unsure about a frame, it is out. A viewer judges you by your weakest published picture, not your strongest.

Method for selection. First pass: reject anything technically broken — missed focus, blown highlights, closed eyes — quickly and without thinking. Second pass: flag anything with a spark. Then leave it for a week, because you cannot see your own work the day you shot it; your memory of the moment is still contaminating your judgment. Third pass: compare near-duplicates side by side and kill all but one. Fourth: sequence what remains (pc-7) and cut anything that does not earn its place in the sequence.

Only then process. Processing a hundred frames you will not use is how photographers spend a weekend and produce nothing.`,
          assignment: photoTask('Take your last big shoot and cut it to twelve frames. Post the twelve. Cutting is the assignment.'),
          resources: [{ label: 'Cambridge in Colour — post-processing', url: CIC }],
          standardIds: ['VA:Re9.1', 'VA:Pr4.1'],
        },
        {
          id: 'pe-2', title: 'The global edit: tone before anything else', minutes: 14,
          blurb: 'Black point, white point, exposure, contrast — in that order.',
          body:
`Every good edit follows roughly the same order, and the order matters because each step changes what the next one should be.

First, set the ends. Find the black point — the darkest tone that should be pure black — and the white point. A photograph with no true black usually looks foggy and weak; a photograph with clipped blacks loses shadow information. Use the histogram (px-5), not the screen.

Second, set overall exposure so the subject sits where you want it. Third, recover highlights and lift shadows — this is where RAW earns its file size — but do not lift shadows so far that the picture goes flat and noisy. Modern editing's most common failure is the over-lifted shadow: a picture with no dark areas at all reads as artificial and lifeless.

Fourth, contrast and the tone curve. The curve is the most powerful control in the toolkit: a gentle S adds contrast in the midtones while protecting the ends; lifting the bottom-left point creates the matte, faded film look; dropping it deepens the blacks. Learn the curve and you can stop using contrast sliders.

Fifth, white balance and colour (pk-3). Sixth, and only sixth, local adjustments.

Restraint is the mark of experience. A strong edit is usually a small edit applied precisely.`,
          assignment: photoTask('Edit one RAW file using only black point, white point and a tone curve — no other sliders. Post the before and after.'),
          resources: [{ label: 'Cambridge in Colour — levels and curves', url: CIC }],
          standardIds: ['VA:Cr3.1'],
        },
        {
          id: 'pe-3', title: 'Local adjustments and dodging & burning', minutes: 15,
          blurb: 'The darkroom technique that survived digitisation intact.',
          body:
`Dodging (lightening) and burning (darkening) selected areas is the oldest editing technique in photography, and it remains the most important. In the wet darkroom it was done by waving cardboard under the enlarger. W. Eugene Smith would spend days on a single print. Ansel Adams's famous prints are heavily dodged and burned, and he was explicit that the negative was the score and the print was the performance.

What it is for: directing the eye. Viewers look at the brightest, highest-contrast, sharpest area of a frame. If that area is not your subject, you have a problem that no amount of global adjustment fixes. Burn down bright corners and distracting background patches; dodge the subject's face slightly; add a subtle vignette to close the edges.

Technique: work with very low opacity brushes and build up in passes. If you can see where the adjustment stops, it is too strong. Match the feathering to the softness of the underlying edge.

Contemporary tools give you masks: luminance masks select by brightness, colour masks by hue, and subject/sky detection by recognition. These are conveniences over the same idea — select an area, treat it differently.

The ethical line from pg-4 holds: dodging and burning are traditional and accepted in news photography; adding, removing or compositing content is not.`,
          assignment: photoTask('Take one flat photograph and improve it using only local dodging, burning and a vignette — no global changes. Post before and after.'),
          resources: [{ label: 'National Gallery of Art — photographs', url: NGA }],
          standardIds: ['VA:Cr3.1'],
        },
        {
          id: 'pe-4', title: 'Colour grading with intent', minutes: 14,
          blurb: 'HSL, split toning, and calibrating rather than filtering.',
          body:
`Colour grading is targeted colour adjustment, and the professional version happens on three axes: hue, saturation and luminance, per colour band.

The most valuable move most photographers never make is adjusting luminance per hue. Darkening blues deepens a sky without touching anything else. Lifting the luminance of oranges brightens skin. Desaturating and darkening greens turns garish summer foliage into something filmic. These are the adjustments that separate a graded photograph from a saturated one.

Split toning (or colour grading wheels) tints shadows and highlights differently — cool shadows with warm highlights is the near-universal cinematic default, because it exaggerates the natural blue-shadow/warm-sun relationship. Keep it subtle; the effect works best when the viewer cannot name it.

Skin is the constraint (pk-6). Protect the orange-red band, check faces at 100%, and verify that a grade you built on one complexion does not render another one grey or waxy. This is a technical failure, not a style.

Presets are a starting point and a trap. Use them to see an idea quickly, then rebuild the parts you liked manually. A preset is calibrated to someone else's light and someone else's camera.`,
          assignment: photoTask('Grade one photograph using only the HSL luminance sliders — no saturation, no curves. Post before and after and list which hues you moved.'),
          resources: [{ label: 'Adobe Color', url: 'https://color.adobe.com/create/color-wheel' }],
          standardIds: ['VA:Cr3.1'],
        },
        {
          id: 'pe-5', title: 'Sharpening, noise and output', minutes: 12,
          blurb: 'The last mile — and why it depends entirely on where the picture is going.',
          body:
`Sharpening does not add detail; it increases local contrast at edges so detail reads more clearly. Overdone, it produces halos — bright outlines along contrast boundaries — and crunchy noise. The classic controls are amount, radius (how wide the effect spreads; small for fine detail), detail, and masking (which restricts sharpening to edges and leaves smooth areas like sky and skin alone). Masking is the control most people ignore and should use most.

Noise reduction is the opposite trade: it smooths and therefore removes real detail with the noise. Reduce colour noise aggressively — chroma blotches have no aesthetic value — and luminance noise sparingly, because luminance grain reads as texture and film. AI denoisers are genuinely good now, and are best applied to the RAW before other processing.

Order matters: denoise first, sharpen last, and sharpen for output at the size the picture will actually be seen. A file sharpened for a two-metre print looks brittle on a phone; a file sharpened for Instagram looks soft in print.

Output: sRGB for web (anything else will look desaturated in browsers that ignore profiles), Adobe RGB or ProPhoto for print workflows, and soft-proof against the paper profile before printing. Export at the platform's actual display dimensions so the platform's own compression has less to do.`,
          assignment: photoTask('Export one photograph twice — once sharpened for a phone screen, once for a large print — and post the 100% crops side by side.'),
          resources: [{ label: 'Cambridge in Colour — sharpening', url: CIC }],
          standardIds: ['VA:Cr3.1', 'VA:Pr5.1'],
        },
        {
          id: 'pe-6', title: 'Non-destructive workflow and asset management', minutes: 12,
          blurb: 'Keeping your negatives — the boring lesson that saves careers.',
          body:
`Non-destructive editing means the original file is never altered; adjustments are stored as instructions and applied on export. This is how RAW processors work by default, and it means every edit is reversible forever and you can re-export at any size or in any style years later.

Recipes and presets are those instruction sets, saved and reapplied. Building a recipe once and syncing it across a set is what makes a body of work look consistent (pk-6) and turns a four-hour edit into a twenty-minute one.

Asset management is the unglamorous half. A working structure: one catalogue, folders by year and shoot, a consistent naming scheme, keywords for people, places and projects, and star or colour flags for the selection passes in pe-1. Do it at import; nobody has ever gone back and keyworded an archive retroactively.

Backup is 3-2-1: three copies, on two different media, one off-site. Photographers lose entire archives to a single failed drive with dispiriting regularity, and cloud sync is not backup — it faithfully replicates your deletions.

Metadata carries your authorship. Embed copyright and contact information in IPTC fields at import so it travels with the file. It will not stop theft, but it is what you produce when you need to prove the file is yours.`,
          assignment: photoTask('Build one reusable edit recipe, apply it to a set of six photographs, and export the set. Post the grid and describe your backup plan in the caption.'),
          resources: [{ label: 'ASMP — business and workflow resources', url: 'https://www.asmp.org/' }],
          standardIds: ['VA:Pr5.1', 'VA:Pr6.1'],
        },
        {
          id: 'pe-7', title: 'How far is too far?', minutes: 13,
          blurb: 'Manipulation, AI, and disclosure — drawing your own line and stating it.',
          body:
`Photography has never been unmediated. Framing excludes, lenses distort, film stocks interpret, and darkroom printers have manipulated tone since the 1850s. The question is not whether a photograph is constructed but what it claims about the world.

That gives a usable test: is the alteration consistent with what the image claims? A fashion image claims artifice, and compositing is inherent to it. A photojournalistic image claims that this happened, and any addition or removal breaks the claim. A fine art image claims only itself. Genre sets the standard, and problems arise when work made under one set of rules is presented under another.

Generative AI has sharpened this considerably. Generative fill, sky replacement and AI upscaling all invent content that was never in front of the lens. Used in a commercial composite, that is ordinary craft. Presented as documentation, it is fabrication — and it is now trivially easy, which is precisely why disclosure matters more than it used to.

The workable professional position: know which claim your image is making, apply the strictest standard the context might be read under, disclose composites and generative work when the viewer would care, and never let a client's assumption about your process go uncorrected.

Write your own policy down. Photographers who have thought about this in advance do not get caught out by a deadline.`,
          assignment: writeTask('Write your personal manipulation policy — what you will and will not do, by genre — in 300 words. Post it under #photoschool.'),
          resources: [
            { label: 'Reporters Committee for Freedom of the Press', url: 'https://www.rcfp.org/' },
            { label: 'International Center of Photography', url: 'https://www.icp.org/' },
          ],
          standardIds: ['VA:Re9.1', 'VA:Cn10.1'],
        },
      ],
    },
    {
      id: 'photo-business',
      title: 'Photography VII · The Business of Photography',
      blurb: 'Rights, pricing, contracts and clients — the part that decides whether you keep doing this.',
      level: 'ADVANCED',
      lessons: [
        {
          id: 'pb-1', title: 'You own the copyright. Act like it.', minutes: 14,
          blurb: 'Copyright, licensing, releases, and the difference between selling a file and selling a right.',
          body:
`In most jurisdictions, copyright in a photograph arises automatically the moment it is created, and it belongs to the photographer — not to the subject, not to the client, and not to the person who paid for the shoot. The two big exceptions are genuine work-for-hire employment and contracts where you signed the copyright away, usually without reading.

What clients actually need is a licence: permission to use the image in specified ways, for a specified time, in a specified territory and medium. That is what you sell. "Buyout" and "all rights" requests should carry a much higher price, because you are selling the asset rather than renting it.

Registration matters where it exists. In the US, registering with the Copyright Office before infringement (or within three months of publication) unlocks statutory damages and attorney's fees — without it, enforcement is often economically pointless. Other countries differ; the underlying protection does not require registration but enforcement is easier with a record.

Model releases are separate from copyright: they are the subject's permission for their likeness to be used, and they are generally required for commercial and advertising use, generally not for editorial, news or fine art. Property releases apply similarly to recognisable private property and some artworks.

Practical habit: put copyright in your metadata at import (pe-6), keep releases with the shoot, and never hand over an unlicensed high-resolution file.`,
          assignment: writeTask('Draft a one-page licence for a hypothetical client: usage, term, territory, media, exclusivity and fee. Post it under #photoschool.'),
          resources: [
            { label: 'US Copyright Office', url: 'https://www.copyright.gov/' },
            { label: 'ASMP — copyright and licensing', url: 'https://www.asmp.org/' },
          ],
          standardIds: ['VA:Pr6.1', 'VA:Cn10.1'],
        },
        {
          id: 'pb-2', title: 'Pricing: cost of doing business', minutes: 15,
          blurb: 'Why your day rate is not your salary divided by working days.',
          body:
`The mistake that ends most photography businesses is pricing against what other photographers charge instead of against what it costs to operate.

Do the arithmetic once. Add annual overhead — gear depreciation and replacement, insurance, software subscriptions, storage and backup, website, marketing, accountancy, travel, studio or space, pension, tax reserve. Add the salary you actually need to live. Now divide by billable days, and be honest: a full-time photographer bills perhaps 80 to 120 days a year, because the rest goes to editing, admin, marketing, quoting and unpaid pitching. That figure — often two to three times what people guess — is the floor of a viable day rate.

Then price the job, not the day. Commercial fees have two components: the creative fee (your time and expertise) and the licence fee (what the usage is worth to the client). A national campaign and a small local business use identical labour and are not worth the same, because the value delivered differs by an order of magnitude. Ask what the usage is before quoting.

Expenses — assistants, rentals, travel, permits, models, catering, post-production — are billed on top, often with a mark-up for coordination. Never absorb expenses into a creative fee.

Deposits protect you: 50% up front is standard for weddings and commercial work, and it is what turns a booking into a commitment. Late fees, kill fees and overtime rates belong in the contract, not in a difficult phone call later.`,
          assignment: writeTask('Calculate your real cost of doing business and derive your minimum viable day rate. Post the method (not necessarily the number) under #photoschool.'),
          resources: [{ label: 'ASMP — business resources', url: 'https://www.asmp.org/' }],
          standardIds: ['VA:Pr6.1'],
        },
        {
          id: 'pb-3', title: 'Contracts and the awkward conversations', minutes: 13,
          blurb: 'Everything that goes wrong was in a clause you did not write.',
          body:
`A contract is not an expression of distrust; it is the document that lets you and a client disagree about something without the relationship collapsing.

The clauses that actually save you: scope (exactly what is delivered — how many images, what edit level, what deadline), licence (pb-1), fee and payment schedule with a deposit, expenses, cancellation and rescheduling terms, a kill fee if the client cancels late, revision limits, credit and portfolio-use rights, liability caps, and a force majeure clause covering illness and disaster.

Delivery terms prevent the most common dispute. State the number of images, the format, the resolution and the delivery date. State that RAW files are not delivered — they are your negatives, and handing them over gives away both your process and your quality control. If a client insists, it is a separate, expensive licence.

Payment discipline: invoice immediately, state terms (net 14 or net 30), state late-payment interest, and chase on day one of lateness rather than day thirty. Photographers routinely finance their clients' cash flow by accident.

And the conversation everyone dreads: "we can't pay but it's great exposure." A polite, standard answer prepared in advance — that you are booked for paid work but can suggest a reduced-scope paid option — resolves it faster than improvising. Free work for causes you actually choose is fine. Free work you were talked into is not.`,
          assignment: writeTask('Write your standard cancellation and kill-fee clause, plus your prepared response to an unpaid-exposure request. Post both under #photoschool.'),
          resources: [{ label: 'ASMP — contracts and paperwork', url: 'https://www.asmp.org/' }],
          standardIds: ['VA:Pr6.1'],
        },
        {
          id: 'pb-4', title: 'The portfolio and getting hired', minutes: 14,
          blurb: 'You are hired for what you show, so only show what you want to be hired for.',
          body:
`The iron rule: clients hire you to do again what they have already seen you do. If your portfolio contains weddings, landscapes and product shots, you will be hired for none of them convincingly. Show one thing, or split into distinct portfolios with distinct audiences.

Size and quality. Fifteen to twenty-five images, all excellent. Every image below your best drags the average, and clients judge on the average. Lead with the strongest frame and close with the second strongest. If in doubt, cut.

The portfolio should also show the work you want, not only the work you have had. Nobody can hire you for a job you have never demonstrated, so produce personal work that looks exactly like the commissions you are chasing. Self-directed projects are the primary marketing tool in commercial photography, not a hobby.

Getting seen: a fast, simple website that loads on a phone and puts images first; a clear statement of what you do and where; contact details on every page; and direct outreach to specific named commissioners rather than broadcast. Personal recommendation and repeat clients dominate this industry — which means how you behave on a job is marketing.

Rates of response are low and that is normal. Follow up once, keep a list, show up consistently over years. The photographers who succeed are frequently not the best ones; they are the ones who were still visible in year five.`,
          assignment: photoTask('Cut your portfolio to twenty images in a single genre and post the sequence. Every frame must be one you want to be hired to repeat.'),
          resources: [
            { label: 'ASMP — professional practice', url: 'https://www.asmp.org/' },
            { label: 'Artsy — how work is presented and sold', url: 'https://www.artsy.net/' },
          ],
          standardIds: ['VA:Pr4.1', 'VA:Pr6.1'],
        },
        {
          id: 'pb-5', title: 'Revenue models beyond the commission', minutes: 13,
          blurb: 'Prints, stock, editorial, teaching, licensing and patronage.',
          body:
`Full-time photographers almost never earn from one source. The stable ones run three or four.

Commissioned work — commercial, editorial, weddings, events, portraits — is the highest rate per day and the least predictable. Editorial pays poorly and buys credibility and access; commercial pays well and buys nothing else.

Print sales convert work you already own into revenue. Limited editions with genuine, documented edition sizes support higher prices; open editions sell more units at lower prices. Both need honest fulfilment, good paper, and a signed certificate of authenticity for editions. Galleries take 40–50% and provide access and legitimacy in return.

Stock and licensing generate small, recurring amounts from a large archive. Microstock rates have collapsed and are largely not worth a professional's time; specialist and rights-managed archives still pay when you own imagery nobody else has.

Teaching, workshops, writing and speaking convert expertise into income and are counter-cyclical — they hold up when commissions dry up. Ongoing patronage and membership models turn an audience into a floor under your income, which is the single biggest structural change in this profession in twenty years.

The strategic point: build assets, not just invoices. A commission pays once. An archive, an audience and a reputation pay repeatedly.`,
          assignment: writeTask('Design a three-stream revenue plan for your own practice, with a realistic annual figure for each. Post it under #photoschool.'),
          resources: [{ label: 'ASMP', url: 'https://www.asmp.org/' }],
          standardIds: ['VA:Pr6.1', 'VA:Cn10.1'],
        },
        {
          id: 'pb-6', title: 'Working with clients, subjects and crews', minutes: 12,
          blurb: 'Professionalism is a craft skill and it is why people book you twice.',
          body:
`Photographic ability gets you the first job. Behaviour gets you the second, and repeat clients are the whole business.

Before: confirm in writing, arrive early, know the names of everyone you will work with, and bring redundancy for every critical piece of equipment. Ask about access, permissions and anything you might be asked not to photograph.

During: be the calmest person present. Clients and subjects take their emotional cue from the photographer, and a visibly stressed photographer makes bad pictures because everyone tightens up. Explain what you are doing. Show the back of the camera when it helps. Manage time visibly so the client knows you are on schedule.

Working with crews — assistants, stylists, hair and make-up, producers — means giving clear direction and clear credit. Pay your assistants promptly and properly; the assistant on your set this year is the photographer recommending you in five.

After: deliver early if you can, deliver exactly what was agreed, and never surprise a client with an invoice item that was not quoted. Follow up a few weeks later. Send the credits and the tear sheets to everyone who worked on it.

And a note on the thing nobody puts in a business course: photograph people the way you would want a stranger to photograph your family. It is a better long-term business strategy than any pricing model.`,
          assignment: photoTask('Run one real shoot end to end with a written brief, a confirmed schedule and a delivery deadline. Post the delivered set and note what you would change in your process.'),
          resources: [{ label: 'ASMP — working practice', url: 'https://www.asmp.org/' }],
          standardIds: ['VA:Pr6.1', 'VA:Pr4.1'],
        },
      ],
    },

    // ══════════════════════════════════════════════════════════════════════════
    // ART
    // ══════════════════════════════════════════════════════════════════════════
    {
      id: 'art-elements',
      title: 'Art I · Elements & Principles',
      blurb: 'The grammar of every visual work ever made — the vocabulary the rest of the school assumes.',
      level: 'FOUNDATION',
      lessons: [
        {
          id: 'ae-1', title: 'Line', minutes: 12,
          blurb: 'The most economical mark, and the one that carries the most personality.',
          body:
`Line is a moving point — the record of a gesture. It is the first mark humans made and the most immediately expressive element, because a line preserves the speed, pressure and confidence of the hand that made it.

Types do different work. Contour line describes an edge and defines shape. Gesture line captures movement and weight rather than outline. Hatching and cross-hatching build tone out of accumulated line. Implied line — a row of objects, a gaze, an alignment — directs the eye without being drawn at all, and is the reason a figure looking off-frame pulls your attention out of the picture.

Quality is the interesting part. A thick heavy line reads as weight and certainty; a thin broken line as fragility and hesitation. A varied line — thick where a form turns toward you or catches shadow, thin where it recedes into light — describes three-dimensional form with nothing but a single stroke. Ingres and Hokusai are worth studying purely for line weight.

Direction carries feeling: horizontals rest, verticals assert and aspire, diagonals destabilise and energise, curves relax and organic curves suggest life.

Line is also where individuality is least concealable. Two artists drawing the same contour produce recognisably different lines, which is why connoisseurs attribute drawings by handwriting.`,
          assignment: lookTask('Find three drawings in the Met or Rijksmuseum collections with visibly different line quality. Write 150 words describing what each artist’s line tells you about how they worked.'),
          resources: [
            { label: 'The Met — Drawings and Prints', url: 'https://www.metmuseum.org/art/collection/search?department=9' },
            { label: 'Tate — art terms', url: TATE_TERMS },
          ],
          standardIds: ['VA:Re7.2', 'VA:Cr2.1'],
        },
        {
          id: 'ae-2', title: 'Shape, form and space', minutes: 13,
          blurb: 'Two dimensions pretending to be three, and the emptiness between.',
          body:
`Shape is a two-dimensional enclosed area. Form is the three-dimensional equivalent, or the illusion of it on a flat surface. Geometric shapes — circle, square, triangle — read as constructed, rational, human-made. Organic shapes read as natural, alive, irregular.

Positive shape is the object; negative shape is the space around and between. Trained artists draw the negative shapes as often as the positive ones, because the eye is far less prejudiced about an abstract gap than about a "hand", which it thinks it already knows how to draw.

Form on a flat surface is created by value (ae-3), by overlap, and by perspective. The classic teaching sequence turns four primitives — sphere, cube, cylinder, cone — into everything else, because every complex form reduces to combinations of those.

Space is the hardest of the three. Devices that create depth: overlapping (the oldest and most reliable), relative size, placement in the picture plane (higher usually means further away), atmospheric perspective (distant things pale, cool and lose contrast — a fact of physics that Leonardo described precisely), and linear perspective (ad-4).

Compare a Byzantine icon with a Renaissance altarpiece and you see two entirely different theories of space — flat gold eternity against measurable receding room. Neither is a failure; they are different claims about what a picture is for.`,
          assignment: lookTask('Compare a Byzantine icon and a High Renaissance painting from any open-access collection. Write 200 words on how each constructs space and what that says about its purpose.'),
          resources: [
            { label: 'The Met — Heilbrunn Timeline of Art History', url: MET_TOAH },
            { label: 'Khan Academy — art history', url: KHAN_AH },
          ],
          standardIds: ['VA:Re7.2', 'VA:Cn11.1'],
        },
        {
          id: 'ae-3', title: 'Value: the element that does the work', minutes: 13,
          blurb: 'Light and dark carries form, mood and legibility — and outranks colour.',
          body:
`Value is relative lightness or darkness. It is the element that creates the illusion of form, and it matters more than colour: a painting with correct values and wrong colour still reads; a painting with beautiful colour and collapsed values turns to mud. Squint at any strong picture and it resolves into a small number of clear value masses.

The standard exercise is a nine- or ten-step value scale from white to black. Most beginners use only the middle four steps, which is why beginner work looks weak and grey. Commit to your darkest darks and your lightest lights.

Value structure is compositional. Notan — a Japanese concept — reduces an image to two values, black and white, and tests whether the underlying design works at all. Most great compositions have a simple, readable two-value skeleton beneath the detail.

Chiaroscuro (pl-6) is value used to model form; tenebrism is value used to eliminate everything but the essential. Sfumato is Leonardo's smoke-like blending of value with no perceptible edges, which is why the Mona Lisa's expression appears to shift — the transitions at the corners of the mouth are unresolved.

For photographers, this is the same lesson as pk-4: value is what survives when hue is removed, and value is what a viewer reads first.`,
          assignment: lookTask('Take any masterwork from an open-access collection, reduce it to two values in your head or on paper, and write 150 words on whether the composition survives. Post your notan sketch if you make one.'),
          resources: [
            { label: 'National Gallery of Art', url: NGA },
            { label: 'Smarthistory', url: SMARTHISTORY },
          ],
          standardIds: ['VA:Re7.2', 'VA:Cr2.1'],
        },
        {
          id: 'ae-4', title: 'Texture and surface', minutes: 11,
          blurb: 'Actual and implied — and why the paint itself is part of the subject.',
          body:
`Texture is surface quality. Implied texture is the illusion of it — the depicted sheen of satin in a Dutch portrait, the fur in a Dürer hare, the flesh in a Titian. Actual texture is the physical surface of the work itself: impasto ridges, canvas weave, the grain of a woodblock, the tooth of paper.

Actual texture is where reproductions fail. Van Gogh's paint is applied in ropes you can see the direction of; a Rembrandt late portrait has passages built up so thickly they cast their own shadows under gallery lighting, while the darks are thin and transparent. Photographs of these paintings flatten all of it, which is the argument for standing in front of the real object at least once.

Handling — the visible evidence of how paint was applied — is also how art historians attribute works and how movements distinguish themselves. Smooth invisible blending was the academic ideal for centuries; the Impressionists' broken, visible touch was a deliberate rejection of it, and a claim that the act of painting was itself part of the subject.

Frottage, collage, mixed media and assemblage bring literal foreign texture into the work. Once Picasso and Braque glued oilcloth to a canvas in 1912, the surface stopped being a window and became an object.`,
          assignment: lookTask('Find a Van Gogh and a Vermeer in an open-access collection and zoom to maximum resolution. Write 150 words on what the brushwork itself tells you about each painter’s intent.'),
          resources: [
            { label: 'Rijksmuseum — Rijksstudio (high-res zoom)', url: RIJKS },
            { label: 'Art Institute of Chicago', url: ARTIC },
          ],
          standardIds: ['VA:Re7.2', 'VA:Re8.1'],
        },
        {
          id: 'ae-5', title: 'Balance, emphasis and hierarchy', minutes: 13,
          blurb: 'Distributing visual weight, and deciding what the viewer sees first.',
          body:
`Every element in a composition has visual weight: large is heavier than small, dark heavier than light, saturated heavier than muted, complex heavier than simple, and — importantly — a face or a figure outweighs almost anything, because human attention is not neutral.

Symmetrical balance distributes weight evenly around an axis. It reads as formal, stable, sacred, institutional — which is why altarpieces, government buildings and religious icons use it. Asymmetrical balance offsets a large quiet mass against a small loud one, which is more dynamic and more common in modern work. Radial balance organises around a centre.

Emphasis is the deliberate creation of a focal point, and it is achieved by contrast: the lightest area in a dark field, the one saturated colour, the point where lines converge, the only face turned toward the viewer, the sharpest edge. Look at any Baroque religious painting and count how many devices converge on a single figure — usually four or five simultaneously.

Hierarchy extends emphasis: primary focus, secondary interest, supporting detail. A composition with three competing focal points has none. A composition with one and nothing else is a poster.

For photographers this is pe-3 restated. For designers it is the same principle again. This is the most transferable lesson in the track.`,
          assignment: lookTask('Choose one Baroque painting and list every device the artist used to force your eye to the main figure. Aim for at least four. Write 200 words.'),
          resources: [
            { label: 'Smarthistory — Baroque', url: SMARTHISTORY },
            { label: 'The Met Collection', url: MET },
          ],
          standardIds: ['VA:Re7.2', 'VA:Re8.1'],
        },
        {
          id: 'ae-6', title: 'Rhythm, repetition, pattern and movement', minutes: 12,
          blurb: 'How a still image is made to move.',
          body:
`Repetition of an element creates pattern; pattern with variation creates rhythm; rhythm creates the sensation of movement in an object that does not move.

Rhythms have character. Regular rhythm — evenly spaced identical elements — is calm, ordered, sometimes monotonous: a colonnade, a grid, a Warhol repetition. Alternating rhythm introduces a second element and reads as measured. Progressive rhythm changes an element gradually and creates directional movement, like a spiral shell or a receding arcade. Random rhythm is energetic and natural.

Movement is also created by implied direction: diagonals, gestures, gazes, and the arrangement of figures along a path. Baroque compositions are built on sweeping diagonals precisely to make the eye travel rapidly; Renaissance compositions use stable triangles precisely to stop it.

The eye also travels along value and colour rhymes. If there are three patches of red in a painting, your eye will visit all three in sequence whether the artist intended it or not — so competent artists intend it, and place their accents where they want the tour to go.

Modern and abstract work makes rhythm the entire subject: Mondrian's grids, Bridget Riley's Op Art, Kandinsky's compositions explicitly analogised to music.`,
          assignment: lookTask('Find one artwork whose subject is essentially rhythm — Op Art, Islamic geometric pattern, Mondrian, a textile. Write 150 words on how repetition and variation are balanced.'),
          resources: [
            { label: 'The Met — Islamic Art', url: 'https://www.metmuseum.org/art/collection/search?department=14' },
            { label: 'MoMA — collection', url: 'https://www.moma.org/collection/' },
          ],
          standardIds: ['VA:Re7.2'],
        },
        {
          id: 'ae-7', title: 'Scale, proportion and the human body', minutes: 12,
          blurb: 'Size relationships, canons, and deliberate distortion.',
          body:
`Proportion is the relationship of parts to each other and to the whole. Scale is size relative to a norm — usually the human body, which is the measure we cannot switch off.

Canons of proportion have been codified repeatedly: the Egyptian grid system that held for three thousand years, the Greek contrapposto ideal of roughly seven to eight heads tall, Vitruvius's architectural proportions, Leonardo's Vitruvian Man, Le Corbusier's Modulor. Each claims a mathematical harmony and each is also a cultural statement about what a body should be.

Hierarchical proportion sizes figures by importance rather than by optics — the pharaoh larger than his servants, Christ larger than the donors. It looks "wrong" only if you assume the goal was optical realism, which it was not.

Deliberate distortion is expressive. El Greco's elongated figures strain upward toward the divine. Mannerist figures are impossibly long and serpentine. Giacometti's attenuated sculptures embody isolation. Modigliani's necks. Distortion is not failed accuracy; it is accuracy applied to feeling.

Scale in the encounter matters too: Rothko insisted his large canvases be viewed close so they fill the field of vision, and a monumental sculpture in a plaza means something a maquette on a shelf cannot.`,
          assignment: lookTask('Compare an Egyptian relief, a Greek sculpture and an El Greco. Write 200 words on what each proportional system tells you about what that culture valued.'),
          resources: [
            { label: 'The Met — Heilbrunn Timeline', url: MET_TOAH },
            { label: 'Khan Academy — art history', url: KHAN_AH },
          ],
          standardIds: ['VA:Re7.2', 'VA:Cn11.1'],
        },
        {
          id: 'ae-8', title: 'Unity, variety and knowing when to stop', minutes: 12,
          blurb: 'The principle that governs all the others.',
          body:
`Unity is the sense that a work is one thing rather than an assembly of parts. Variety is the interest that stops unity becoming monotony. Every other principle in this track is ultimately in service of holding those two in tension.

Unity is achieved by shared elements: a limited palette, a repeated shape family, a consistent handling of paint, a single light source, a common edge treatment. Proximity groups things; alignment relates them; continuation carries the eye from one to the next; closure lets a viewer complete a shape you only implied. These are Gestalt principles, and they describe how perception assembles a scene whether the artist knows the terminology or not.

Variety comes from contrast in any dimension — value, hue, scale, texture, direction. The classic failure modes are a work so unified it is inert, and a work so varied it disintegrates.

Knowing when to stop is a real skill and rarely taught. Overworking is the most common way an artwork is destroyed: the freshness of a decisive mark cannot be recovered once it has been softened four times. Photographers over-edit, painters over-blend, designers over-decorate. The professional habit is to leave it, look at it a day later, and make one more considered change instead of twenty anxious ones.

The finished work is the one where nothing can be removed without loss.`,
          assignment: writeTask('Take one of your own works — a photograph, a drawing, anything — and write 250 words analysing it strictly with this track’s vocabulary: line, shape, value, texture, balance, emphasis, rhythm, proportion, unity. Post it under #artschool.'),
          resources: [
            { label: 'Tate — art terms', url: TATE_TERMS },
            { label: 'Smarthistory', url: SMARTHISTORY },
          ],
          standardIds: ['VA:Re8.1', 'VA:Cr1.2'],
        },
      ],
    },
    {
      id: 'art-drawing',
      title: 'Art II · Drawing Foundations',
      blurb: 'The skill everything else is built on. Drawing is learned seeing, and seeing is trainable.',
      level: 'FOUNDATION',
      lessons: [
        {
          id: 'ad-1', title: 'Drawing is seeing', minutes: 12,
          blurb: 'The real obstacle is not your hand — it is the symbol your brain substitutes for the object.',
          body:
`Almost everyone who says they cannot draw has a perception problem, not a motor problem. Asked to draw a hand, the brain supplies a stored symbol — a palm with five sausages — instead of reporting the specific shape in front of you. Your hand can trace any shape your eye genuinely reports; the difficulty is getting the eye to report rather than to name.

The classical countermeasures all work by defeating naming. Blind contour drawing — following an edge with your eye while drawing without looking at the paper — produces distorted results and dramatically improves observation, because the symbol system cannot keep up. Upside-down copying makes a familiar image unrecognisable, so you draw the shapes actually present. Drawing the negative space (ae-2) means drawing gaps your brain has no symbol for.

Measurement is the other half. Hold a pencil at arm's length, lock your elbow, and compare: how many head-heights is the figure? Is that shoulder above or below the chin? Sight angles against true vertical and horizontal. Comparative measurement is a mechanical, teachable procedure, and it is what makes proportions correct.

Draw daily and badly. Volume beats quality early: fifty quick bad drawings teach more than one laboured good one, because the corrections accumulate.`,
          assignment: lookTask('Do one blind contour drawing of your own hand, then one upside-down copy of a drawing from the Met collection. Photograph both and post them under #artschool. They should look wrong — that is the point.'),
          resources: [
            { label: 'Drawabox — free structured drawing course', url: 'https://drawabox.com/' },
            { label: 'The Met — Drawings and Prints', url: 'https://www.metmuseum.org/art/collection/search?department=9' },
          ],
          standardIds: ['VA:Cr2.1', 'VA:Cr1.2'],
        },
        {
          id: 'ad-2', title: 'Line, gesture and construction', minutes: 13,
          blurb: 'Fast lines for life, slow lines for structure.',
          body:
`Gesture drawing captures the action, weight and rhythm of a subject in thirty seconds to two minutes. It is not an outline; it is the line of energy through the pose — the curve of the spine, the tilt of the shoulders against the hips, where the weight falls. Gesture keeps drawings alive. A figure drawn correctly but without gesture looks like a mannequin, and mannequin-stiffness is the most common fault in technically competent beginner work.

Construction is the opposite process: building a subject from simple volumes before refining. Reduce everything to boxes, spheres and cylinders in perspective, get those in the right place and the right size, then wrap the surface detail over them. This is why life drawing courses spend so long on the four primitives.

Combine them in order. Gesture first, in a few seconds, to place the energy and the proportions. Construction second, to give the gesture volume and correct structure. Contour and detail last, and only where they earn attention.

Line weight and confidence: draw from the shoulder for long lines and from the wrist only for small detail. Commit to a single decisive stroke rather than sketching the same line eight times — the hairy multi-line habit is hesitation made visible, and it is a habit rather than a limitation.`,
          assignment: lookTask('Do twenty 60-second gesture drawings from life or from photographs in one sitting. Post the sheet under #artschool.'),
          resources: [
            { label: 'Drawabox', url: 'https://drawabox.com/' },
            { label: 'Ctrl+Paint — free drawing and painting library', url: 'https://www.ctrlpaint.com/' },
          ],
          standardIds: ['VA:Cr2.1'],
        },
        {
          id: 'ad-3', title: 'Value, shading and rendering form', minutes: 14,
          blurb: 'Turning outlines into objects with light.',
          body:
`Shading is the application of value (ae-3) to describe form under light. The standard anatomy of a lit sphere, which generalises to everything: highlight (specular reflection of the source), light (the plane facing the source), halftone (the plane turning away), the terminator or core shadow (the darkest band, where the form turns fully away — and crucially it is darker than the cast shadow's interior), reflected light (bounce from surrounding surfaces filling the shadow side), and cast shadow (the shape the object throws, darkest and hardest nearest the object).

Two errors dominate beginner shading. The first is outlining then filling — real form has no outline, only edges where value changes. The second is making reflected light too bright, which flattens the form and breaks the illusion; reflected light must always stay darker than the lightest halftone.

Edges carry as much information as values. A hard edge reads as a sharp turn or a near object; a soft edge as a gradual turn, a distant object, or something out of focus. Controlling edges is what separates rendering from colouring in.

Techniques: hatching and cross-hatching build value with line and keep the drawing alive; blending is smooth and can go dead if overused; stippling is slow and luminous. Choose based on the surface you are describing.

Draw the same sphere, cube, cylinder and cone under one raking light until it is automatic. Every complex object is those four wearing a disguise.`,
          assignment: lookTask('Draw a sphere, cube, cylinder and cone from life under a single strong lamp, rendering all six parts of the light anatomy. Post the sheet under #artschool.'),
          resources: [
            { label: 'Ctrl+Paint — free lessons', url: 'https://www.ctrlpaint.com/' },
            { label: 'National Gallery of Art — drawings', url: NGA },
          ],
          standardIds: ['VA:Cr2.1'],
        },
        {
          id: 'ad-4', title: 'Perspective', minutes: 15,
          blurb: 'One-, two- and three-point — plus the fact that it is a convention, not the truth.',
          body:
`Linear perspective is a system for projecting three-dimensional space onto a flat surface, formalised by Brunelleschi around 1415 and codified by Alberti in 1435. Its machinery: a horizon line at the viewer's eye level, vanishing points on that horizon, and orthogonals — parallel lines in the world that converge to a vanishing point in the picture.

One-point perspective has a single vanishing point and applies when one face of your subject is parallel to the picture plane — a corridor, a road receding, a room seen straight on. Two-point has two vanishing points and applies when you see a corner — the standard for buildings viewed at an angle. Three-point adds a vertical vanishing point above or below, and describes what happens when you look up at a tower or down from one; this is the same phenomenon as the keystoning in pg-6.

Two rules solve most problems. First: the horizon line is always at your eye level, so everything at your eye level meets it — which is why a crowd of similar-height people all have their heads near the horizon regardless of distance. Second: to divide a receding plane evenly (fence posts, floor tiles, windows), use diagonals through the rectangle, because equal intervals in the world are unequal in the picture.

Atmospheric perspective (ae-2) is the other half and is often more convincing than the geometry.

And the caveat worth keeping: linear perspective is a Renaissance European convention describing a one-eyed, motionless viewer. Chinese handscrolls, Persian miniatures, Egyptian relief and Cubism all reject it deliberately and coherently. Learn it as a tool, not as reality.`,
          assignment: lookTask('Draw one interior in accurate two-point perspective from observation, then find one artwork from a non-Western tradition that organises space differently and write 150 words on its system.'),
          resources: [
            { label: 'Smarthistory — linear perspective', url: SMARTHISTORY },
            { label: 'Khan Academy — Renaissance art', url: KHAN_AH },
          ],
          standardIds: ['VA:Cr2.1', 'VA:Cn11.1'],
        },
        {
          id: 'ad-5', title: 'The figure and anatomy', minutes: 15,
          blurb: 'Enough anatomy to draw a body that stands up.',
          body:
`Figure drawing is the traditional core of art training because the human figure is the most complex, most familiar and least forgiving subject: viewers detect an error in a shoulder instantly and cannot say why.

Proportion first. The classical canon is roughly seven and a half to eight heads tall, with the halfway point at the pubic bone — not the waist, which is where most beginners put it. Elbows land near the navel, fingertips near mid-thigh, knees halfway between hip and floor. Real people vary; the canon is a reference to deviate from knowingly.

Structure next. The body is two large masses — ribcage and pelvis — connected by the flexible spine, with limbs attached. Almost all gesture comes from the relationship between those two boxes: their tilt, their twist, their separation. Contrapposto, the Greek discovery that revolutionised sculpture, is exactly this — weight on one leg, hips tilting one way, shoulders counter-tilting, spine curving between them. Once you can draw the ribcage and pelvis correctly in space, the rest becomes manageable.

Then anatomy in service of surface. You do not need every muscle; you need the ones that show — deltoid, pectoral, latissimus, the abdominal sheet, the sartorius line across the thigh, the calf's asymmetry, and the landmarks that are bone near the skin: clavicle, sternum, iliac crest, patella, ankle, wrist. Bony landmarks are reliable because they do not change with pose or build.

Life drawing from a real model beats photographs, because a photograph has already flattened the form and made the decision you are supposed to be making.`,
          assignment: lookTask('Draw five figures focusing only on the ribcage-pelvis relationship — boxes and spine, no detail. Then study three classical sculptures in an open-access collection for contrapposto. Post the sheet under #artschool.'),
          resources: [
            { label: 'The Met — Greek and Roman Art', url: 'https://www.metmuseum.org/art/collection/search?department=13' },
            { label: 'Drawabox', url: 'https://drawabox.com/' },
          ],
          standardIds: ['VA:Cr2.1', 'VA:Cn11.1'],
        },
        {
          id: 'ad-6', title: 'Composition on the page', minutes: 12,
          blurb: 'Thumbnails, cropping, and designing before committing.',
          body:
`Everything in the composition track for photographers (pc-1 to pc-7) applies to drawing, with one enormous difference: you are not subtracting from the world, you are adding to an empty page. Nothing arrives by accident, which means nothing is excused by accident either.

Thumbnails are the professional habit. Before starting a finished drawing, make six to ten postage-stamp sketches, each a different arrangement, taking under a minute each. At that size you can only record the big value masses and the main shapes — which is precisely what determines whether the composition works. Choosing between ten thumbnails takes ten minutes; discovering a composition failure four hours into a rendering costs you the drawing.

Format is a decision, not a default. Portrait orientation emphasises height and the figure; landscape emphasises breadth and context; square is static and formal. Choose before the first mark.

Design the value pattern (the notan in ae-3) at thumbnail stage. Where is your darkest dark and lightest light going to be, and is that where you want the eye? Establish the focal point deliberately (ae-5).

And leave the edges alone. Beginners drift the drawing toward the middle of the page and leave an even margin of nothing, which reads as timid. Let the subject touch or cross the edges when the design calls for it.`,
          assignment: lookTask('Make ten one-minute thumbnails for a single subject, choose one, and take it to a finished drawing. Post the thumbnail sheet alongside the finished piece under #artschool.'),
          resources: [{ label: 'Ctrl+Paint', url: 'https://www.ctrlpaint.com/' }],
          standardIds: ['VA:Cr2.1', 'VA:Cr2.2'],
        },
        {
          id: 'ad-7', title: 'Materials, and building a practice', minutes: 12,
          blurb: 'Graphite to charcoal to digital — and the habit that matters more than any of them.',
          body:
`Materials have personalities. Graphite is precise, controllable, reversible and slightly grey even at its darkest; H grades are hard and light, B grades soft and dark. Charcoal is rich, deep black, fast and messy — the best material for learning big value masses because it is too crude to fiddle with. Conté and pastel add colour and are opaque. Ink is unforgiving and therefore excellent for building decisiveness. Digital is infinitely reversible, which is its great strength and its great danger: undo makes it easy to avoid ever committing.

Paper matters more than beginners expect. Toothy paper grabs charcoal and pastel; smooth paper suits ink and fine graphite. Toned paper — mid-grey or tan — lets you work both up into white and down into black from an established middle, which teaches value relationships faster than white paper does.

Now the part that actually determines outcomes. Drawing improves through consistent volume over years, not through better tools or a breakthrough insight. A pocket sketchbook used daily for fifteen minutes beats a weekly two-hour session, because frequency builds the perceptual habit.

Draw from life whenever possible, copy masters deliberately (a training method for every artist before the twentieth century), keep everything including the failures so you can see the trajectory, and accept that a large fraction of your drawings will be bad. That is not a phase to get through; it is the process itself.`,
          assignment: lookTask('Start a daily sketchbook: seven consecutive days, at least fifteen minutes each, drawn from life. Post a photo of the seven pages under #artschool.'),
          resources: [
            { label: 'The Met — Drawings and Prints', url: 'https://www.metmuseum.org/art/collection/search?department=9' },
            { label: 'Drawabox', url: 'https://drawabox.com/' },
          ],
          standardIds: ['VA:Cr1.2', 'VA:Cr2.1'],
        },
      ],
    },
    {
      id: 'art-colour',
      title: 'Art III · Colour Theory',
      blurb: 'How colour actually behaves — in pigment, in light, and in the eye.',
      level: 'INTERMEDIATE',
      lessons: [
        {
          id: 'ac-1', title: 'The wheel, and why there are two of them', minutes: 13,
          blurb: 'Additive versus subtractive — the source of most colour confusion.',
          body:
`There are two colour systems and mixing them up causes most colour confusion.

Additive colour is light. Primaries are red, green and blue; adding all three gives white. This is your screen, your camera sensor and stage lighting. Secondaries are cyan, magenta and yellow.

Subtractive colour is pigment. Each pigment absorbs some wavelengths and reflects the rest, so adding pigments removes light and mixing everything gives a muddy near-black. Printing uses cyan, magenta and yellow (plus black) as primaries, which is the accurate subtractive set.

The red-yellow-blue wheel taught in schools is a historical artefact — a workable approximation from before we understood the physics. It is why mixing "blue and yellow" gives a dull green while cyan and yellow give a vivid one. Painters still use RYB successfully because paint is not ideal pigment and experience compensates, but knowing it is an approximation explains a lot of failed mixes.

Vocabulary: hue is the colour family; value is lightness (ae-3); saturation or chroma is purity, from grey to full intensity. A tint is a hue plus white, a shade is a hue plus black, a tone is a hue plus grey. Most colours in a good painting are tones — full-saturation colour used everywhere is exhausting, and it makes your actual accents impossible.`,
          assignment: lookTask('Mix or sample a nine-step scale from one pure hue to grey. Write 150 words on where the useful colours were — they will not be at the saturated end.'),
          resources: [
            { label: 'Handprint — comprehensive colour theory', url: 'https://www.handprint.com/HP/WCL/wcolor.html' },
            { label: 'Adobe Color', url: 'https://color.adobe.com/create/color-wheel' },
          ],
          standardIds: ['VA:Cr2.1'],
        },
        {
          id: 'ac-2', title: 'Harmony schemes', minutes: 12,
          blurb: 'Complementary, analogous, triadic, split-complementary — and how to weight them.',
          body:
`Harmony schemes are recipes for choosing hues that work together, and they are the same ones photographers scout for in pk-2.

Complementary pairs sit opposite: maximum contrast, maximum vibration, and — usefully — mixing complements is how you neutralise a colour without adding grey. A touch of orange kills the intensity of blue and produces a living grey rather than a dead one. Painters mix their darks and neutrals from complements for exactly this reason.

Analogous schemes take neighbours: unified, calm, and dependent on value contrast for structure. Split-complementary takes a hue and the two colours adjacent to its complement — nearly the punch of a complementary scheme with less tension, and the most reliable scheme for a beginner. Triadic and tetradic use three or four evenly spaced hues and demand disciplined weighting.

Weighting is the part usually left out. A scheme is not equal parts. The reliable proportion is dominant, subordinate, accent — roughly 60/30/10. Two colours at equal area and equal saturation fight for attention and neither wins. The small accent is what makes the whole thing sing, and it works only because it is small.

Temperature is the other axis: warm colours advance, cool recede. A warm figure against a cool ground separates without any change in value.`,
          assignment: lookTask('Analyse one painting from an open-access collection and identify its scheme and its roughly 60/30/10 weighting. Write 200 words with the artist and title.'),
          resources: [
            { label: 'Rijksmuseum — Rijksstudio', url: RIJKS },
            { label: 'Adobe Color', url: 'https://color.adobe.com/create/color-wheel' },
          ],
          standardIds: ['VA:Re7.2', 'VA:Cr2.1'],
        },
        {
          id: 'ac-3', title: 'Simultaneous contrast and the unreliable eye', minutes: 13,
          blurb: 'Colour is relational — Chevreul, Albers, and why you cannot judge a colour alone.',
          body:
`No colour has a fixed appearance. Every colour is altered by what surrounds it — this is simultaneous contrast, described systematically by Michel Eugène Chevreul in 1839 after dyers complained that his black yarns looked wrong next to blue ones. The yarns were fine; the perception was not.

A grey square on a dark ground looks lighter than the identical grey on a light ground. A neutral grey surrounded by red takes on a greenish cast, because the eye induces the complement. A colour surrounded by its complement appears more saturated; surrounded by a similar hue it appears duller.

Josef Albers built an entire pedagogy on this in Interaction of Color (1963), whose central demonstration is that one colour can be made to look like two, and two different colours can be made to look identical. His conclusion is the practical one: never choose a colour in isolation. Judge it in place, against its actual neighbours, at its actual size.

Related effects: after-images (stare at red, look away, see cyan), which is why surgical scrubs are green; the Bezold effect, where changing one colour in a pattern alters the appearance of all of them; and optical mixing, where small dots of pure colour blend in the eye rather than on the surface — the operating principle of Pointillism, of halftone printing, and of every screen you own.

The working consequence for both painters and photographers: colour decisions made on a swatch, a slider or an isolated crop will be wrong in context.`,
          assignment: lookTask('Place the same mid-grey against a light ground and a dark ground, then against red and against green. Photograph the result and write 150 words on what you saw versus what you knew was true.'),
          resources: [
            { label: 'Handprint — colour vision', url: 'https://www.handprint.com/HP/WCL/wcolor.html' },
            { label: 'MoMA — collection', url: 'https://www.moma.org/collection/' },
          ],
          standardIds: ['VA:Re7.1', 'VA:Cr2.1'],
        },
        {
          id: 'ac-4', title: 'Pigments, history and the economics of colour', minutes: 13,
          blurb: 'Where colours came from, what they cost, and how that shaped what was painted.',
          body:
`Colour history is material history, and it constrained art far more than most viewers realise.

Ultramarine was ground from lapis lazuli mined in Afghanistan and was more expensive than gold. That is why the Virgin's robe is blue: contracts specified how much ultramarine a patron was paying for, and the blue is a display of expenditure as much as of iconography. When synthetic ultramarine arrived in 1826, the meaning of blue changed permanently.

Other pigments carried real costs and real dangers. Tyrian purple required thousands of molluscs per garment and was legally restricted to emperors. Lead white was the only good opaque white for centuries and was poisonous. Vermilion came from mercury sulphide. Mummy brown was made, appallingly, from actual mummies. Indian yellow, Naples yellow, orpiment — all toxic, fugitive, or both.

The nineteenth century transformed everything. Synthetic pigments — cobalt, cadmium, viridian, mauveine — made bright colour cheap and permanent, and the collapsible metal paint tube (patented 1841) made paint portable. Impressionism is not merely an idea; it is technologically dependent on those two inventions. Renoir said flatly that without the tube of paint there would have been no Impressionism.

Permanence still matters. Fugitive pigments fade — many nineteenth-century reds have shifted, and some of what you see in a museum is not what was painted. Van Gogh's sunflowers are browning as chrome yellow degrades.`,
          assignment: lookTask('Pick one pigment — ultramarine, vermilion, lead white, chrome yellow — and trace its use across three works in open-access collections. Write 250 words on how its cost or availability shaped what artists made.'),
          resources: [
            { label: 'The Met — Heilbrunn Timeline of Art History', url: MET_TOAH },
            { label: 'Smarthistory', url: SMARTHISTORY },
          ],
          standardIds: ['VA:Cn11.1', 'VA:Re7.1'],
        },
        {
          id: 'ac-5', title: 'Colour in practice: limited palettes', minutes: 12,
          blurb: 'Why fewer colours produce better paintings.',
          body:
`Beginners buy forty tubes and produce muddy, incoherent work. Professionals typically use six to twelve, and the restriction is the reason their colour hangs together.

A limited palette guarantees harmony automatically, because every mixture on the canvas shares parent pigments. The classic examples: the Zorn palette (yellow ochre, ivory black, vermilion, white) which renders convincing flesh and full-looking colour from four tubes — note that its "blue" is the black, which reads cool against warm; and the split-primary palette (a warm and cool version of each primary plus white), which mixes almost any hue cleanly.

Mud has a specific cause: mixing three or more pigments, especially across the wheel, drags everything toward neutral. Mix with two pigments plus white wherever possible. And neutralise with a complement (ac-2) rather than with black, which deadens.

Save your saturation. If everything is at full chroma there is no accent left, and the picture is loud but flat. Keep most of the canvas in tones and let one small area reach full intensity — the same 60/30/10 logic as ac-2, applied to saturation rather than area.

Set your value structure first (ae-3) and let colour follow. A painting with correct values and a limited palette will read; a painting with beautiful colour and broken values will not. This is also the single most useful transfer into photographic grading (pe-4).`,
          assignment: lookTask('Make one small painting or digital study using only four colours — a Zorn palette if you can. Post it under #artschool with the palette listed.'),
          resources: [
            { label: 'Handprint — palette design', url: 'https://www.handprint.com/HP/WCL/wcolor.html' },
            { label: 'Ctrl+Paint', url: 'https://www.ctrlpaint.com/' },
          ],
          standardIds: ['VA:Cr2.1', 'VA:Cr3.1'],
        },
        {
          id: 'ac-6', title: 'Colour as meaning', minutes: 12,
          blurb: 'Symbolism, culture, and the artists for whom colour was the entire subject.',
          body:
`Colour carries meaning, but meaning is assigned rather than inherent, and it is local (pk-5). Blue in medieval Europe signified the Virgin and heaven, partly through cost (ac-4); in Chinese tradition, white signifies mourning; red signifies luck and celebration across much of Asia and danger or revolution elsewhere. Reading a colour without its cultural frame produces confident nonsense.

Within Western art history, several artists made colour itself the content. The Fauves — Matisse, Derain — used colour untethered from description around 1905, and were named "wild beasts" for it. Kandinsky argued that colours correspond to sounds and spiritual states and pushed toward abstraction on that basis. Rothko's late canvases are enormous fields of layered colour intended to produce an emotional, near-religious response at close range; he was explicit that his subject was tragedy and ecstasy, not decoration. Yves Klein patented a blue.

Josef Albers, from the other direction, taught that colour's meaning is relational and unstable (ac-3) — which is a philosophical claim as much as an optical one.

For your own work, the useful question is the one from pk-1: what is this colour doing? Describing, structuring, or signifying? Colour that does none of the three is decoration, and decoration is fine as long as you know that is what you chose.`,
          assignment: writeTask('Choose one artwork where colour carries the meaning rather than describing the subject. Write 300 words on how, and what would be lost in monochrome. Post under #artschool.'),
          resources: [
            { label: 'MoMA — collection', url: 'https://www.moma.org/collection/' },
            { label: 'Tate — art terms', url: TATE_TERMS },
            { label: 'Khan Academy — modernism', url: KHAN_AH },
          ],
          standardIds: ['VA:Re7.1', 'VA:Re8.1'],
        },
      ],
    },
    {
      id: 'art-history',
      title: 'Art IV · Art History, Era by Era',
      blurb: 'A survey from the cave wall to now, taught with the world’s open collections as the textbook.',
      level: 'INTERMEDIATE',
      lessons: [
        {
          id: 'ah-1', title: 'Prehistory and the ancient world', minutes: 16,
          blurb: 'Lascaux to Egypt to Mesopotamia — art before art was a category.',
          body:
`The oldest known figurative paintings are around 40,000 years old — animals in Sulawesi and El Castillo, then the extraordinary bulls and horses of Lascaux and Chauvet. They are not decorative. They are deep inside caves, often in places difficult to reach and impossible to casually view, which suggests ritual rather than display. Whatever they were for, they demonstrate that representational skill is not a modern acquisition: the Chauvet horses show observed anatomy and overlapping forms drawn with total confidence.

Mesopotamia gives us the first art of the state. The Standard of Ur, Assyrian palace reliefs and the Code of Hammurabi stele exist to record, legitimise and intimidate. Writing and image appear together, and hierarchical proportion (ae-7) does the political work.

Egypt sustained a coherent visual system for roughly three thousand years — longer than the entire span from Rome to now. Its conventions are deliberate, not naive: the composite view of the body (head in profile, eye and shoulders frontal, legs in profile) shows each part from its most identifiable angle, because these images were functional equipment for the afterlife rather than optical records. A proportional grid standardised figures across generations of workshops. When Akhenaten briefly overturned the style at Amarna, it was a religious revolution expressed as an artistic one.

The lesson to carry forward: "realism" is one option among many, and cultures that did not pursue it were pursuing something else on purpose.`,
          watchAlong: { title: 'Smarthistory — Ancient Mediterranean', url: SMARTHISTORY, note: 'Work through the prehistoric and Egyptian sections; they are short, free and written by art historians.' },
          assignment: lookTask('Find one Egyptian object in the Met’s collection and write 200 words explaining its conventions as deliberate choices rather than as limitations.'),
          resources: [
            { label: 'The Met — Egyptian Art', url: 'https://www.metmuseum.org/art/collection/search?department=10' },
            { label: 'Heilbrunn Timeline of Art History', url: MET_TOAH },
            { label: 'Smarthistory', url: SMARTHISTORY },
          ],
          standardIds: ['VA:Cn11.1', 'VA:Re7.1'],
        },
        {
          id: 'ah-2', title: 'Greece and Rome', minutes: 16,
          blurb: 'The invention of the idealised body, and the Roman invention of the portrait.',
          body:
`Greek art moves through three phases in about three centuries, and the movement is visible in the bodies. Archaic kouroi (c. 600 BCE) stand rigid, frontal, symmetrical, with the famous fixed smile — Egyptian influence is unmistakable. Then, within a couple of generations, the Classical breakthrough: contrapposto (ad-5), first seen in works like the Kritios Boy, where weight shifts to one leg and the whole body responds. A statue stops being a symbol of a man and becomes a body capable of movement. The Hellenistic phase pushes into drama, extreme emotion and virtuoso complexity — the Laocoön, the Pergamon altar, the Winged Victory.

Greek sculpture pursued the ideal: mathematically proportioned, youthful, generalised. Polykleitos wrote a treatise on the canon. And it was painted — the white marble aesthetic that Europe later built a racial mythology on is an accident of lost pigment.

Rome borrowed Greek forms wholesale and added two things of its own. First, verism: republican portrait busts that record wrinkles, baldness and jowls with unflattering precision, because in Rome age signalled authority. Second, engineering as art — the arch, the vault, concrete, and therefore the Pantheon's dome and the Colosseum, buildings that organise vast public space in ways Greek post-and-lintel construction never could.

Roman wall painting at Pompeii shows sophisticated illusionism, atmospheric perspective and trompe-l'oeil space — techniques that would be lost and then rediscovered thirteen centuries later.`,
          assignment: lookTask('Compare an Archaic kouros, a Classical statue and a Roman republican portrait bust from open-access collections. Write 250 words tracing what changes and what each culture wanted a human image to do.'),
          resources: [
            { label: 'The Met — Greek and Roman Art', url: 'https://www.metmuseum.org/art/collection/search?department=13' },
            { label: 'Khan Academy — Ancient Mediterranean', url: KHAN_AH },
          ],
          standardIds: ['VA:Cn11.1', 'VA:Re7.2'],
        },
        {
          id: 'ah-3', title: 'Medieval, Byzantine and the wider world', minutes: 16,
          blurb: 'Gold, hierarchy, illumination — and the parallel traditions Western surveys skip.',
          body:
`Byzantine art rejected Greco-Roman illusionism deliberately. Its icons are flat, frontal, gold-grounded and hierarchical, because their purpose is not to depict a person in a room but to open a window onto the eternal. Gold ground is not a background; it is the absence of earthly space. This tradition runs continuously for a thousand years and survives in Orthodox practice today.

Western medieval art covers a great deal of ground: Insular manuscripts like the Book of Kells with their dizzying interlace, Carolingian and Ottonian revivals, then Romanesque — thick walls, round arches, compressed and expressive figures — and finally Gothic, where the pointed arch, rib vault and flying buttress let walls dissolve into stained glass. Chartres and Sainte-Chapelle are arguments in coloured light.

The illuminated manuscript is the era's great luxury object, and its makers included named women artists and vast anonymous workshops. Gold leaf, lapis, and months of labour per volume.

Meanwhile, and this is where standard surveys fail: Tang and Song China produced landscape painting of extraordinary sophistication with a completely different theory of space and a tradition of scholar-painters. Islamic art developed geometric and vegetal abstraction and calligraphy to a level unmatched anywhere, alongside Persian miniature painting. West African bronze casting at Ife and Benin achieved naturalistic portraiture of stunning technical quality. Mesoamerican, Indian, Japanese and Korean traditions each ran their own long arcs.

Treat "art history" as plural from here on. The European narrative is one thread.`,
          assignment: lookTask('Choose one non-European tradition from this period — Song landscape, Persian miniature, Benin bronze, Islamic geometry — and write 250 words on its aims, comparing it to a European work of the same century.'),
          resources: [
            { label: 'The Met — Asian Art', url: 'https://www.metmuseum.org/art/collection/search?department=6' },
            { label: 'The Met — Islamic Art', url: 'https://www.metmuseum.org/art/collection/search?department=14' },
            { label: 'The Met — Arts of Africa, Oceania, and the Americas', url: MET },
            { label: 'Heilbrunn Timeline', url: MET_TOAH },
          ],
          standardIds: ['VA:Cn11.1', 'VA:Re7.1'],
        },
        {
          id: 'ah-4', title: 'The Renaissance', minutes: 18,
          blurb: 'Perspective, anatomy, humanism — and the Northern alternative in oil.',
          body:
`The Italian Renaissance is conventionally dated from Brunelleschi's perspective demonstration around 1415 and Alberti's treatise of 1435. The intellectual shift is humanism: renewed attention to classical antiquity, to the individual, to nature observed and measured. The technical shifts are linear perspective (ad-4), anatomical study from dissection, and — in Italy — fresco and tempera giving way slowly to oil.

Early Renaissance: Masaccio's Brancacci Chapel frescoes place solid, weighty figures in coherent perspectival space and change what painting can be. Donatello reinvents free-standing sculpture. Botticelli produces mythologies of extraordinary linear grace.

High Renaissance is brief — roughly 1490 to 1520 — and dominated by three figures. Leonardo brings sfumato (ae-3), scientific observation and psychological subtlety. Michelangelo brings anatomical mastery and terribilità, in the David and the Sistine ceiling. Raphael brings synthesis and clarity; The School of Athens is a demonstration of everything the period had learned about space, group composition and gesture.

The North took a different route. Netherlandish painters — van Eyck, van der Weyden, Bosch, later Bruegel — developed oil paint's transparency into a jewel-like precision of surface and detail, with symbolic density rather than idealisation, and used empirical observation rather than mathematical construction to organise space. Van Eyck's Arnolfini Portrait renders a convex mirror, a dog's fur and a brass chandelier with equal patience.

Then Venice — Titian, Tintoretto, Veronese — where colour and loosening brushwork take priority over Florentine line, setting up an argument (disegno versus colorito) that runs for four hundred years.`,
          watchAlong: { title: 'Khan Academy / Smarthistory — Renaissance', url: KHAN_AH, note: 'The Renaissance unit is the strongest free survey available; work through Florence, Rome and the North.' },
          assignment: lookTask('Compare one Florentine and one Netherlandish painting of the same decade. Write 300 words on how each constructs space, surface and meaning.'),
          resources: [
            { label: 'Khan Academy — Renaissance art', url: KHAN_AH },
            { label: 'Rijksmuseum — Rijksstudio', url: RIJKS },
            { label: 'National Gallery, London', url: 'https://www.nationalgallery.org.uk/paintings' },
            { label: 'Web Gallery of Art', url: 'https://www.wga.hu/' },
          ],
          standardIds: ['VA:Cn11.1', 'VA:Re7.2'],
        },
        {
          id: 'ah-5', title: 'Baroque and the Dutch Golden Age', minutes: 17,
          blurb: 'Drama, darkness and the invention of the middle-class picture.',
          body:
`Baroque art (roughly 1600–1750) is theatrical. Where the High Renaissance is balanced and static, the Baroque is diagonal, dynamic, emotionally direct and designed to overwhelm. In Catholic Europe this is explicitly Counter-Reformation strategy: after the Council of Trent, art was to move the faithful, and it did so through immediacy and spectacle.

Caravaggio is the pivot. Tenebrism (pl-6), models drawn from the street, saints with dirty feet, moments caught at their most physical. His followers spread across Europe within two decades. Bernini does the equivalent in sculpture and architecture — the Ecstasy of Saint Teresa is staged like theatre, with a hidden window as a spotlight. Rubens fills enormous canvases with swirling flesh and movement. Velázquez, at the Spanish court, paints Las Meninas, a picture about looking, painting and power that has never been exhausted by commentary.

The Protestant Dutch Republic went the other way entirely. No church commissions, no monarchy, but a wealthy merchant class buying pictures for their houses — which produced a genuine art market and, with it, specialised genres: landscape, seascape, still life, genre scenes of daily life, group portraits of civic guilds. Vermeer's small domestic interiors, Rembrandt's late self-portraits and unmatched psychological depth, Hals's alarmingly alive brushwork, Ruisdael's skies.

Still life carried coded meaning — vanitas: skulls, guttering candles, wilting flowers, all reminders of mortality within displays of wealth. The paintings hold both the pleasure and the warning at once, which is exactly the period's temperament.`,
          assignment: lookTask('Study a Dutch vanitas still life at high resolution in Rijksstudio and identify five symbolic objects and what they mean. Write 250 words.'),
          resources: [
            { label: 'Rijksmuseum — Rijksstudio', url: RIJKS },
            { label: 'Smarthistory — Baroque', url: SMARTHISTORY },
            { label: 'National Gallery of Art', url: NGA },
          ],
          standardIds: ['VA:Re7.2', 'VA:Cn11.1'],
        },
        {
          id: 'ah-6', title: 'Neoclassicism, Romanticism and Realism', minutes: 16,
          blurb: 'Reason, feeling, and then the decision to paint ordinary life at heroic scale.',
          body:
`Rococo — light, ornamental, aristocratic, erotic — gave way in the later eighteenth century to Neoclassicism, driven by Enlightenment values and by the excavation of Pompeii. David's Oath of the Horatii is severe, linear, morally didactic and politically charged; David went on to become the propagandist of the Revolution and then of Napoleon. Ingres carried the linear tradition into the nineteenth century.

Romanticism answered with feeling, the sublime, the irrational and the individual. Géricault's Raft of the Medusa turns a contemporary scandal into a monumental history painting. Delacroix uses colour and turbulence against Ingres's line. Goya's Third of May 1808 and his Black Paintings confront atrocity without consolation. Friedrich's solitary figures face vast landscapes; Turner dissolves ships and storms into light so thoroughly that he is retroactively claimed by almost every later movement.

Realism, from around 1848, was a political position as much as a style. Courbet painted stone breakers and a peasant funeral at the scale previously reserved for kings and saints, and was attacked for it. Millet painted agricultural labour. Daumier caricatured power. The claim was simple and radical: ordinary contemporary life is a legitimate subject, and the artist need not idealise it.

Photography arrives in this exact period — Daguerre in 1839 — and its effect on painting was immediate. Once a machine could record appearance cheaply, the question of what painting was uniquely for became urgent, and the answer to that question is essentially the whole of modern art.`,
          assignment: lookTask('Compare David’s Neoclassicism with Delacroix’s Romanticism using works in any open collection. Write 250 words on how line and colour carry opposing worldviews.'),
          resources: [
            { label: 'Khan Academy — 18th and 19th century art', url: KHAN_AH },
            { label: 'The Met Collection', url: MET },
            { label: 'Art Institute of Chicago', url: ARTIC },
          ],
          standardIds: ['VA:Cn11.1', 'VA:Re7.1'],
        },
        {
          id: 'ah-7', title: 'Impressionism and Post-Impressionism', minutes: 17,
          blurb: 'Painting light, then painting past it.',
          body:
`The Impressionists — Monet, Renoir, Pissarro, Degas, Morisot, Cassatt, Sisley — held their first independent exhibition in 1874 after repeated rejection by the official Salon. The name came from a hostile review of Monet's Impression, Sunrise.

Their programme: paint the sensation of a moment rather than a constructed studio scene. That meant working outdoors, quickly, in visible broken brushstrokes, with bright unmixed colour laid side by side to mix optically (ac-3), coloured rather than grey shadows, and contemporary subjects — railway stations, boulevards, cafés, boating parties. It was technologically enabled by paint tubes and synthetic pigments (ac-4) and conceptually enabled by photography's arrival and by Japanese prints, whose flat colour, cropped compositions and asymmetry hit Paris in the 1860s and rearranged European composition permanently.

Post-Impressionism is not a movement but a set of individual escapes from Impressionism's limits. Cézanne sought "to make of Impressionism something solid and durable like the art of the museums," building form from planes of colour — and in doing so laid the foundation for Cubism. Van Gogh used colour and impasto for emotional force. Gauguin flattened space and used non-naturalistic colour, while participating in the colonial romanticism of his era, which the work should be read alongside. Seurat systematised optical mixing into Pointillism. Toulouse-Lautrec turned the poster into art.

By 1900 the assumption that painting describes appearance is finished, and everything after follows from that.`,
          assignment: lookTask('Find an Impressionist and a Post-Impressionist painting of a similar subject in the Art Institute of Chicago collection. Write 250 words on what the second one is doing that the first is not.'),
          resources: [
            { label: 'Art Institute of Chicago — Impressionism', url: ARTIC },
            { label: 'Khan Academy — Impressionism', url: KHAN_AH },
            { label: 'The Met Collection', url: MET },
          ],
          standardIds: ['VA:Re7.2', 'VA:Cn11.1'],
        },
        {
          id: 'ah-8', title: 'Modernism: 1900 to 1945', minutes: 18,
          blurb: 'Cubism, abstraction, Dada, Surrealism — the fastest forty years in art history.',
          body:
`Fauvism (1905) freed colour from description. Expressionism, in Germany, used distortion and harsh colour for psychological and political force — Die Brücke, Der Blaue Reiter, and later the savage post-war work of Dix and Grosz.

Cubism (from 1907) is the hinge. Picasso and Braque dismantled single-viewpoint perspective, showing objects from multiple angles simultaneously and flattening space into shifting planes. Analytic Cubism fragments to near-illegibility; Synthetic Cubism reassembles with collage, introducing real-world material onto the canvas (ae-4) and ending the picture-as-window for good.

Then the accelerations. Futurism glorifies speed and machines. Constructivism and Suprematism, in revolutionary Russia, pursue pure geometric abstraction with a social purpose — Malevich's Black Square as a zero point. De Stijl and Mondrian reduce to primary colours and right angles. Kandinsky argues for spiritual abstraction.

Dada, born of the First World War's carnage, attacks the category of art itself: chance, absurdity, and Duchamp's readymades, which relocate art from craft to concept and are still the argument underlying most contemporary practice. Surrealism follows, mining Freud and the unconscious — Dalí, Ernst, Magritte, and Kahlo, who resisted the label while making the era's most unflinching self-examination.

The Bauhaus (1919–1933) fuses art, craft and industrial design, exports modernist design worldwide, and is closed by the Nazis. The Nazi "Degenerate Art" exhibition of 1937 makes explicit that these formal arguments were never only formal. The war scatters European artists to America, and the centre of gravity moves to New York.`,
          assignment: lookTask('Choose one Cubist work and one Dada or Surrealist work from MoMA’s collection. Write 300 words on what each claims art is for.'),
          resources: [
            { label: 'MoMA — collection', url: 'https://www.moma.org/collection/' },
            { label: 'Tate — modernism', url: TATE_TERMS },
            { label: 'Khan Academy — modernism', url: KHAN_AH },
          ],
          standardIds: ['VA:Cn11.1', 'VA:Re8.1'],
        },
        {
          id: 'ah-9', title: 'Post-war to postmodern', minutes: 17,
          blurb: 'Abstract Expressionism, Pop, Minimalism, Conceptualism — and the collapse of a single story.',
          body:
`Abstract Expressionism made New York the centre. Pollock's drip paintings turned the act of painting into the subject and the canvas into an arena. Rothko's colour fields aimed at tragedy and transcendence (ac-6). De Kooning kept the figure in violent play. Krasner and Frankenthaler were central and long under-credited. The critical apparatus around it — Greenberg's formalism, insisting painting pursue flatness and medium purity — became as influential as the paintings.

Pop, from the late 1950s, punctured that seriousness with commercial imagery: Warhol's repetition and deliberate blankness, Lichtenstein's benday dots, Hamilton and Blake in Britain. The high/low boundary stops being defensible.

Minimalism strips to industrial materials, repeated units and literal objecthood — Judd, Andre, Martin. Conceptual art follows the logic to its end: if the idea is the art, the object is optional. Sol LeWitt's wall drawings are instructions. Performance, Fluxus, Land Art, Arte Povera, video — the medium itself becomes a choice rather than a given.

From the 1970s the single narrative breaks apart, and that is the actual content of postmodernism: pluralism, appropriation, irony, institutional critique, and a sustained challenge to whose art history had been written. Feminist artists — the Guerrilla Girls counting how many women were in the Met's modern galleries versus how many nudes were female — civil rights, postcolonial and queer practices force the canon open.

Contemporary art today has no dominant style, operates globally, and includes digital, installation, social practice and AI-generated work. The techniques in this school remain the vocabulary. What changed is who gets to use it and what it is allowed to be about.`,
          assignment: writeTask('Pick one contemporary artist working now and write 300 words placing them in relation to at least two movements from this track. Post under #artschool.'),
          resources: [
            { label: 'MoMA — collection', url: 'https://www.moma.org/collection/' },
            { label: 'Tate — art terms and movements', url: TATE_TERMS },
            { label: 'Artsy — contemporary art', url: 'https://www.artsy.net/' },
          ],
          standardIds: ['VA:Cn11.1', 'VA:Re9.1'],
        },
        {
          id: 'ah-10', title: 'Photography’s own history', minutes: 16,
          blurb: 'From the daguerreotype to the phone — the medium this school teaches, historicised.',
          body:
`1839: Daguerre announces the daguerreotype and Talbot the negative-positive calotype process. The daguerreotype gives a unique, exquisitely detailed object; Talbot's negative gives reproducibility, and reproducibility is what makes photography a mass medium.

The nineteenth century argues about whether photography is art at all. Pictorialism answers yes by imitating painting — soft focus, allegory, hand-worked prints. Then the counter-argument: Straight photography, led by Stieglitz's later work, Strand, Weston and the f/64 group, insists the medium's value lies in precisely what only it can do — sharp, unmanipulated, full-tonal description. Ansel Adams's Zone System (px-5, pe-3) systematises exposure and printing into a repeatable craft.

Documentary emerges with a social purpose: Riis and Hine photographing tenements and child labour to force legislation; the FSA in the 1930s (pg-4). The 35mm Leica arrives in the 1920s and makes candid street work possible — Cartier-Bresson, and later the postwar Magnum generation.

Then reflexive turns. Robert Frank's The Americans (1958) is loose, grainy, alienated and initially hated; it changes what a photobook can be. Szarkowski at MoMA elevates Arbus, Winogrand and Friedlander. Colour becomes serious with Eggleston in 1976 (pk-1). The Düsseldorf School — the Bechers and their students Gursky, Struth, Ruff — brings deadpan typology and enormous scale into the gallery.

Digital arrives commercially in the 1990s and camera phones in the 2000s, and photography becomes the most-practised medium in human history — trillions of images a year. That does not devalue the craft; it makes intention the scarce commodity, which is the argument of this entire school.`,
          assignment: lookTask('Choose one photograph from each of three eras — a 19th-century process, a mid-century documentary frame, and a contemporary work — from any open collection. Write 300 words on how the claim of each changes.'),
          resources: [
            { label: 'The Met — Photographs collection', url: 'https://www.metmuseum.org/art/collection/search?department=19' },
            { label: 'International Center of Photography', url: 'https://www.icp.org/' },
            { label: 'Library of Congress — FSA/OWI', url: 'https://www.loc.gov/pictures/collection/fsa/' },
            { label: 'Getty Museum — photographs', url: 'https://www.getty.edu/art/collection/' },
          ],
          standardIds: ['VA:Cn11.1', 'VA:Re7.1'],
        },
      ],
    },
    {
      id: 'art-criticism',
      title: 'Art V · Criticism & Reading a Painting',
      blurb: 'How to look slowly, describe precisely, and say something defensible.',
      level: 'ADVANCED',
      lessons: [
        {
          id: 'ak-1', title: 'Slow looking', minutes: 12,
          blurb: 'The average museum visitor looks at a painting for seventeen seconds. Try ten minutes.',
          body:
`Studies of museum behaviour repeatedly find that visitors spend something on the order of fifteen to thirty seconds in front of a work — usually including the time spent reading the label. Almost nothing can be seen in that time. The single highest-leverage skill in this entire track is simply staying longer.

The exercise: choose one work and look at it for ten minutes without reading the label and without reaching for your phone. The first two minutes are uncomfortable and you will feel you have already seen it. Around minute three you start noticing what you missed: a second light source, a hand doing something odd, a figure at the back looking out, a pentimento where the artist changed their mind, the actual direction of the brushstrokes. By minute eight you are having thoughts rather than reactions.

Structure helps. Move systematically: the whole, then the four quadrants, then the edges, then the darkest area, then the lightest, then the faces, then the hands, then the background, then back to the whole. Ask what you would not have predicted.

Then read the label — after, not before. Labels are useful and they also shortcut you into someone else's reading before you have had your own. The order matters.

Do this in a physical museum when you can and in a high-resolution open-access viewer when you cannot. Rijksstudio, the Met and the Art Institute all serve images at resolutions that show brushwork and craquelure.`,
          assignment: lookTask('Spend ten uninterrupted minutes with one artwork — physically or at full zoom in an open collection — before reading anything about it. Write 250 words of pure observation, no interpretation. Post under #artschool.'),
          resources: [
            { label: 'Rijksmuseum — Rijksstudio', url: RIJKS },
            { label: 'Art Institute of Chicago', url: ARTIC },
            { label: 'Cleveland Museum of Art', url: CLEVELAND },
          ],
          standardIds: ['VA:Re7.1', 'VA:Re8.1'],
        },
        {
          id: 'ak-2', title: 'Formal analysis', minutes: 14,
          blurb: 'Describing what is there, in the vocabulary of Art I, before saying what it means.',
          body:
`Formal analysis is the disciplined description of a work's visual properties: composition, line, shape, value, colour, texture, space, scale and handling — the entire vocabulary of the Elements & Principles track. It comes first because interpretation without description is just projection.

A working procedure. State the subject and format plainly. Describe the composition: where is the focal point, how is the eye directed, is it symmetrical or asymmetrical, what is the underlying geometric structure? Describe the light: where does it come from, is it hard or soft, what is in shadow and why does that matter? Describe the palette: what scheme, what weighting, where is the saturation concentrated? Describe the handling: visible brushwork or invisible, thick or thin, fast or laboured? Describe the scale, and what the scale does to a viewer standing in front of it.

Precision is everything. "The colours are nice" is worthless. "The palette is restricted to earth tones except for a single vermilion sleeve at the exact centre, which is also the lightest value in the picture" tells a reader what the artist did and lets you argue about why.

The test of a good formal analysis is that a person who has never seen the work could sketch a rough version from your description. Very few first attempts pass that test.

This is also the skill that transfers back into making. Photographers who can analyse a Caravaggio can light one.`,
          assignment: writeTask('Write a 400-word formal analysis of one painting, using only description. No history, no biography, no interpretation. Post under #artschool.'),
          resources: [
            { label: 'Smarthistory — how to do visual analysis', url: SMARTHISTORY },
            { label: 'Tate — art terms', url: TATE_TERMS },
          ],
          standardIds: ['VA:Re7.2', 'VA:Re8.1'],
        },
        {
          id: 'ak-3', title: 'Iconography and context', minutes: 14,
          blurb: 'What the symbols meant to the people who first saw them.',
          body:
`Iconography is the study of subject matter and symbols. Erwin Panofsky gave the standard three-level model, and it is genuinely useful.

Level one, pre-iconographic description: what you literally see. A woman in blue holding an infant, a lily in a vase, a kneeling winged figure.

Level two, iconographical analysis: what those things conventionally signify in their culture. The blue robe, the lily as purity, the winged figure as Gabriel, therefore an Annunciation. This requires knowledge — knowledge that the original audience had automatically and that we have to acquire. A seventeenth-century Dutch viewer read a vanitas still life (ah-5) instantly; we need a key.

Level three, iconological interpretation: what the work reveals about the culture and moment that produced it. Why does this Annunciation take place in a contemporary Flemish bourgeois interior rather than in Nazareth? What does that say about who commissioned it and how they understood the sacred?

Context is the material half of this. Who paid for it and what did the contract specify? Where was it installed — an altar, a bedroom, a guildhall — and who was allowed to see it? What did it cost, in pigment (ac-4) and labour? Was the artist a workshop head with twenty assistants or a lone Romantic figure, and what did "artist" even mean in that century?

Beware two failures: assuming the symbols mean what they would mean to you today, and assuming that finding a symbol is the same as understanding a picture.`,
          assignment: writeTask('Take one pre-1700 painting and work through all three Panofsky levels. Write 400 words. Post under #artschool.'),
          resources: [
            { label: 'Smarthistory', url: SMARTHISTORY },
            { label: 'The Met — Heilbrunn Timeline', url: MET_TOAH },
            { label: 'National Gallery, London', url: 'https://www.nationalgallery.org.uk/paintings' },
          ],
          standardIds: ['VA:Re7.1', 'VA:Cn11.1'],
        },
        {
          id: 'ak-4', title: 'Critical frameworks', minutes: 14,
          blurb: 'Formalist, biographical, Marxist, feminist, postcolonial, psychoanalytic — lenses, not verdicts.',
          body:
`A single artwork supports many readings, and the different schools of criticism are best understood as lenses that bring different things into focus.

Formalism attends only to the visual properties and treats context as irrelevant — Greenberg's version dominated mid-century American criticism. It is excellent discipline and blind to everything social.

Biographical reading explains the work through the artist's life. It is intuitive, popular, and the source of an enormous amount of bad art writing, because it collapses a made object into a symptom. Van Gogh's paintings are not adequately explained by his illness.

Marxist and social-historical criticism asks about patronage, labour, class, and who the work served. It is unmatched at explaining why certain subjects appear when they do — why Dutch merchants bought still lifes, why the Revolution needed David.

Feminist criticism asks who is looking and who is being looked at. Laura Mulvey's account of the male gaze in cinema, John Berger's argument in Ways of Seeing that in the European nude "men act and women appear," and Linda Nochlin's essay "Why Have There Been No Great Women Artists?" — which answers by examining institutional exclusion rather than talent — are foundational.

Postcolonial criticism asks how works construct the exotic other, how museums acquired what they hold, and whose account of art history became the default. Psychoanalytic criticism reads for the unconscious, which is illuminating on Surrealism and overreaching almost everywhere else.

Use several. A reading that only one lens supports is usually thin; a work that rewards several is usually why it survived.`,
          assignment: writeTask('Read one artwork through two different critical lenses and show where they conflict. 400 words. Post under #artschool.'),
          resources: [
            { label: 'Tate — art terms and theory', url: TATE_TERMS },
            { label: 'Smarthistory — approaches to art history', url: SMARTHISTORY },
            { label: 'Khan Academy — art history', url: KHAN_AH },
          ],
          standardIds: ['VA:Re9.1', 'VA:Cn11.1'],
        },
        {
          id: 'ak-5', title: 'Judgment: is it any good?', minutes: 13,
          blurb: 'Making an evaluative claim you can actually defend.',
          body:
`Description and interpretation are the easy parts. Judgment — saying a work is good or bad and why — is where most people either refuse to commit or commit without argument.

The standard structure, from Edmund Feldman, is four steps: describe (ak-2), analyse the formal relationships, interpret the meaning (ak-3), and only then judge. The discipline is that the judgment must follow from the first three. "I don't like it" is a report on you. "This fails because the composition establishes three competing focal points and the narrative therefore has no centre" is a claim about the work that someone can dispute.

Criteria vary by what the work is trying to do, so state the criteria you are using. Technical skill is one, and it is not sufficient — a great deal of highly skilled work is inert. Originality is one, and it is overrated in isolation; almost everything is a variation. Coherence between intent and result is usually the strongest criterion available: did this work do what it set out to do, and was that worth doing?

Two failure modes to avoid. The first is the appeal to difficulty ("my child could do that") which mistakes labour for value and ignores that the idea may be the work (ah-9). The second is the appeal to reputation — deferring to the canon because it is the canon. The canon is a set of past judgments made by particular people with particular interests, and it is revisable. Nochlin's question in ak-4 is exactly that revision in action.

Separate taste from judgment. You are allowed to dislike work you judge to be excellent, and to enjoy work you judge to be weak. Saying so honestly is more useful than pretending otherwise.`,
          assignment: writeTask('Write a 500-word review of one artwork using all four Feldman steps, ending in an explicit evaluative claim with stated criteria. Post under #artschool.'),
          resources: [
            { label: 'Smarthistory', url: SMARTHISTORY },
            { label: 'Artsy — criticism and market', url: 'https://www.artsy.net/' },
          ],
          standardIds: ['VA:Re9.1', 'VA:Re8.1'],
        },
        {
          id: 'ak-6', title: 'Writing and speaking about art', minutes: 13,
          blurb: 'Artist statements, wall text, critique — and giving feedback that helps.',
          body:
`Most writing about art is bad in a specific way: it uses abstraction to avoid commitment. "The work interrogates notions of space and identity" survives because it cannot be disproved, which is exactly what is wrong with it. Good art writing is concrete, names what is physically present, and makes claims that could be wrong.

An artist statement should say what you make, how you make it and what you are after, in plain language, in about 150 to 300 words. Write it for an intelligent person who is not in the art world. If you would be embarrassed to read it aloud to a friend, rewrite it.

Wall text and captions have a different job: give the viewer what they cannot see for themselves — date, material, context, one fact that changes the looking — and then get out of the way.

Critique is a skill, and it is the one this school ends on because it is the one that improves other people. The functional structure: describe what you actually see before evaluating anything; identify what is working and be specific about why, because vague praise is useless; identify the single biggest opportunity rather than listing fifteen small ones; and address the work's own goals, not the work you would have made. Say "the eye goes to the bright corner instead of the face" rather than "the composition is off."

Receiving critique: do not explain or defend during the feedback. If a viewer misread the work, that is information — you cannot stand next to it forever explaining. Take notes, thank people, and decide later what to act on. Not all feedback is right, and you do not have to sort that out in the room.`,
          assignment: writeTask('Write your own 250-word artist statement in plain language, then give a structured critique on someone else’s posted work under #photoschool or #artschool using the four-step method.'),
          resources: [
            { label: 'Tate — art terms', url: TATE_TERMS },
            { label: 'Smarthistory', url: SMARTHISTORY },
            { label: 'MoMA — collection and interpretation', url: 'https://www.moma.org/collection/' },
          ],
          standardIds: ['VA:Re9.1', 'VA:Pr4.1', 'VA:Cr3.1'],
        },
      ],
    },
  ],
};

export default PHOTO_ART_SCHOOL;
