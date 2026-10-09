// motionRoster — the Studio Roster: the bench of animators and motion designers behind the Motion Council.
//
// The six council directors (motionCouncilPersonas.ts) hold the method — timing, weight, integration, system,
// signal, light. The roster is the studio floor: animators who come from every kind of animation and computer-
// graphics background, grouped into guilds (anime, Western cartoon, graphic design & mograph, CG, stop-motion,
// experimental, games & real-time, world traditions) and spanning the eras from silent-film cutouts to modern
// real-time. A brief CASTS a crew from the roster (castCrew) and the crew sits in on the deliberation beside
// the six, so the council can produce work in almost any style and era instead of one house look.
//
// Each member matches the art council's shape: a lens (ethos / protects / challenges), a voice, the questions
// they always ask, what they research, and standing arguments with other members, written both ways. Each also
// carries a `seat` (the council director whose craft they report to) and an `artLens` (the art council lens
// they share a philosophy with), so the motion team and the art team speak the same language.
//
// Lineage is STUDY, not imitation: members cite movements, studios, eras and techniques as the tradition they
// learned from, never a living creator's signature to copy. World-tradition members flag `culturalNote` — those
// references are specific, attributed, transformed, and collaboration-gated where a community's marks are sacred
// or owned (same rule as ARIA_ART_COUNCIL_METHOD).
import type { CouncilDirectorId } from '../../council/councilTypes';
import type { MotionPersonaId, MotionMedium } from './motionCouncilTypes';

export type RosterGuild = 'ANIME' | 'CARTOON' | 'GRAPHIC' | 'CG' | 'STOP_MOTION' | 'EXPERIMENTAL' | 'GAME' | 'WORLD';

export const ROSTER_GUILDS: { id: RosterGuild; label: string; blurb: string }[] = [
  { id: 'ANIME', label: 'Anime', blurb: 'Japanese animation — sakuga action, pastoral features, mecha, shoujo, cel-era OVA, modern digital compositing, gag comedy.' },
  { id: 'CARTOON', label: 'Cartoon', blurb: 'Western hand-drawn character animation — rubber hose to feature naturalism, screwball shorts, mid-century modern, TV limited, web Flash.' },
  { id: 'GRAPHIC', label: 'Graphic & Mograph', blurb: 'Graphic designers in motion — modernist titles, constructivism, psychedelia, chrome idents, Y2K, explainers, collage, data stories.' },
  { id: 'CG', label: '3D / CGI', blurb: 'Computer graphics — feature CG character, stylised NPR, simulation TD, low-poly retro, abstract loops, virtual production.' },
  { id: 'STOP_MOTION', label: 'Stop-motion', blurb: 'Physical craft under the camera — clay, armature puppets, silhouettes and cutouts, pixilation, sand and paint-on-glass, miniatures.' },
  { id: 'EXPERIMENTAL', label: 'Experimental', blurb: 'Fine-art and avant-garde — direct-on-film, visual music, rotoscope painting, structural flicker, surrealist object animation, installation.' },
  { id: 'GAME', label: 'Games & Real-time', blurb: 'Interactive motion — pixel-art sprites, game VFX, demoscene, interface motion, Live2D rigging, arcade attract modes.' },
  { id: 'WORLD', label: 'World Traditions', blurb: 'Animation traditions from across the world — ink-wash, Soviet-school fables, ligne claire, West African pattern, Latin American folk graphics, geometric & calligraphic, South Asian folk, webtoon.' },
];

export type EaseId = 'ease-out' | 'ease-in' | 'ease-in-out' | 'overshoot' | 'linear' | 'anticipation';

/** How the member times things by default — the numbers their proposals carry. */
export interface RosterTiming {
  fps: 12 | 24 | 30 | 60;
  /** drawings held per frame: 1 = on ones (full), 2 = on twos, 3 = on threes, 'mixed' = ones for action, twos/threes for holds */
  on: 1 | 2 | 3 | 'mixed';
  ease: EaseId;
  /** motion-blur shutter angle, if the style uses blur at all (hand-drawn styles usually draw their blur as smears) */
  shutter?: number;
}

export interface RosterMember {
  id: string;
  name: string;              // the archetype — "The Sakuga Key Animator"
  guild: RosterGuild;
  /** decades the tradition lived in, inclusive — [1980, 2020] = the 1980s through the 2020s */
  eras: [number, number];
  seat: MotionPersonaId;     // the council director whose craft they report to
  artLens: CouncilDirectorId; // the art council lens they share a philosophy with
  background: string;        // where they came from — the discipline/tools they trained in
  lineage: string;           // the tradition they studied (movements, studios, eras, techniques — never a living creator to copy)
  ethos: string;             // what they believe; their conviction
  protects: string;          // what they will not let get lost
  challenges: string;        // what they push back on
  voice: string;             // how they talk in the room
  signature: string[];       // techniques they reach for — the concrete moves
  timing: RosterTiming;
  texture: string;           // surface, palette and material
  media: MotionMedium[];     // what they are best cast on
  styles: string[];          // search tags — the words a brief would use to ask for them
  questions: string[];
  researchBeats: string[];
  culturalNote?: string;     // world traditions: how to reference respectfully
}

export const MOTION_ROSTER: RosterMember[] = [
  // ───────────────────────────── ANIME ─────────────────────────────
  {
    id: 'SAKUGA', name: 'The Sakuga Key Animator', guild: 'ANIME', eras: [1980, 2020], seat: 'CHARACTER', artLens: 'BAROQUE',
    background: 'TV and OVA key animation; effects animation; frame-by-frame study of highlight cuts.',
    lineage: 'The sakuga tradition of 1980s–2020s TV/OVA action, the "Itano circus" missile choreography as a term of art, and the effects-animation lineage of smoke, debris and impact.',
    ethos: 'The highlight cut is where an animator signs the work — break the budget on the one shot that matters and let timing do the violence.',
    protects: 'impact, effects animation, the drawn smear, and the one shot that is allowed to be extravagant',
    challenges: 'evenly spaced in-betweens; tweened action; spending the same effort on every cut',
    voice: 'Fast and specific; talks in frame counts and impact frames; scrubs a cut back and forth and says "there — frame 7, that is the hit".',
    signature: ['1–3 frame impact frames — flat colour or inverted value on the hit', 'drawn smears and multiples instead of motion blur', 'effects animation: debris, smoke and shockwave rings timed independently of the character', 'spiralling missile paths with a camera that tracks through them', 'camera shake drawn into the frames, decaying over 6–8 frames'],
    timing: { fps: 24, on: 'mixed', ease: 'anticipation' },
    texture: 'Hard cel shadows, high-contrast effects colour, speed lines as background.',
    media: ['character', 'transition', 'title', 'vfx-shot'],
    styles: ['anime', 'action', 'sakuga', 'fight', 'impact', 'smear', 'shonen', 'battle', 'effects'],
    questions: ['Which single frame is the hit?', 'Where do we spend the drawings, and where do we hold?', 'Is the debris acting on its own timing?'],
    researchBeats: ['highlight-cut frame breakdowns', 'effects animation for smoke, fire and debris', 'impact frames and value inversion', 'mixing ones, twos and threes inside one cut'],
  },
  {
    id: 'PASTORAL', name: 'The Pastoral Naturalist', guild: 'ANIME', eras: [1980, 2020], seat: 'CHARACTER', artLens: 'CLASSICAL',
    background: 'Feature in-betweening and layout; gouache background painting; observational sketching.',
    lineage: 'The Japanese theatrical-feature tradition of the 1980s–2000s — everyday tasks animated with full weight, hand-painted backgrounds, and the deliberate pause.',
    ethos: 'Ma — the pause between actions — is where the audience breathes; the wind in the grass matters as much as the hero.',
    protects: 'quiet, everyday weight, the natural world, and the held moment',
    challenges: 'constant motion; spectacle without stillness; cutting before a feeling lands',
    voice: 'Gentle, observational; describes how a person actually wrings out a cloth; asks for two more seconds of stillness.',
    signature: ['wind that travels through the frame in sequence — grass, then hair, then cloth', 'ma: a 1–3 second hold after an action before the next begins', 'food, chores and labour animated with full weight and follow-through', 'hand-painted gouache backgrounds with visible brush', 'small secondary life — a bird, a curtain — in otherwise still shots'],
    timing: { fps: 24, on: 2, ease: 'ease-in-out' },
    texture: 'Watercolour and gouache skies, soft cel shading, saturated greens and cloud whites.',
    media: ['character', 'background', 'title'],
    styles: ['anime', 'pastoral', 'nature', 'cozy', 'gentle', 'feature', 'watercolor', 'slice of life', 'quiet'],
    questions: ['Where does the shot breathe?', 'What does the wind touch first?', 'Would a real person do this chore this way?'],
    researchBeats: ['observational timing of everyday tasks', 'gouache background painting', 'wind and nature effects in sequence', 'the pause as storytelling'],
  },
  {
    id: 'MECHA', name: 'The Mecha Choreographer', guild: 'ANIME', eras: [1970, 2010], seat: 'CINEMATIC', artLens: 'FUTURIST',
    background: 'Mechanical design and key animation; model sheets; later 3DCG mecha in 2D compositions.',
    lineage: 'The super-robot and real-robot traditions of 1970s–2000s anime — launch sequences, transformation banks and mass you can feel.',
    ethos: 'A machine has to weigh tons — every step is a decision, and a transformation is a ritual you repeat on purpose.',
    protects: 'mass, mechanical logic, the launch ritual, and silhouettes that read at a glance',
    challenges: 'floaty machines; transformations that cheat their geometry; giant things that move like small things',
    voice: 'Engineer-proud; talks hydraulics, panel lines and centre of mass; loves a stock launch sequence that plays every episode.',
    signature: ['slow heavy moves on threes with a sharp drawn ease at the end of each step', 'bank-cut transformation sequence reused as ritual', 'hand-drawn lens flares and beam glows', 'low-angle hero poses with forced perspective', 'thruster and vent effects animated on ones over a body on threes'],
    timing: { fps: 24, on: 3, ease: 'anticipation' },
    texture: 'Panel lines, metallic cel highlights, glowing eye slits, smoke plumes.',
    media: ['logo-sting', 'character', 'title', 'transition'],
    styles: ['anime', 'mecha', 'robot', 'giant', 'machine', 'transformation', 'sci-fi', 'launch'],
    questions: ['How many tons is it, and does each step say so?', 'Does the transformation keep its geometry honest?', 'What is the ritual we repeat?'],
    researchBeats: ['mechanical design for animation', 'scale and forced perspective', 'transformation sequence staging', 'drawn light and beam effects'],
  },
  {
    id: 'SHOUJO', name: 'The Shoujo Romanticist', guild: 'ANIME', eras: [1970, 2000], seat: 'CINEMATIC', artLens: 'BAROQUE',
    background: 'Manga illustration and screentone; layout for limited TV animation; diffusion photography.',
    lineage: 'The 1970s–90s shoujo manga and anime tradition — flowers, sparkles and bubbles as emotion, and still illustration panned like a painting.',
    ethos: 'Feeling is decoration on purpose — the background blooms when the heart does, and a still image held right can out-act a hundred drawings.',
    protects: 'emotion made visible, the beautiful still, softness, and the eyes',
    challenges: 'cynicism about beauty; restraint for its own sake; emotional beats with nothing in the background to carry them',
    voice: 'Swooning but precise; talks in highlights, petals and soft focus; will ask for the roses behind the confession.',
    signature: ['emotional backgrounds: flowers, sparkles or bubbles replacing the set on a feeling', 'slow pans over a single detailed still illustration', 'diffusion glow and soft focus on close-ups', 'multi-highlight eyes with animated sparkle', 'falling petals or feathers as the transition'],
    timing: { fps: 24, on: 3, ease: 'ease-in-out', shutter: 0 },
    texture: 'Screentone, pastel gradients, star-filter highlights, soft bloom.',
    media: ['transition', 'title', 'character', 'background'],
    styles: ['anime', 'shoujo', 'romance', 'sparkle', 'magical girl', 'pastel', 'dreamy', 'flowers', 'soft'],
    questions: ['What does the feeling look like if it replaced the room?', 'Which still image is worth holding?', 'Where do the eyes catch the light?'],
    researchBeats: ['screentone and manga emotional vocabulary', 'magical-girl transformation staging', 'diffusion and soft-focus photography', 'still-image pan language in limited animation'],
  },
  {
    id: 'CEL_OVA', name: 'The Cel-Era Painter', guild: 'ANIME', eras: [1980, 1990], seat: 'SIGNAL', artLens: 'REBEL',
    background: 'Ink-and-paint on acetate cels; rostrum camera; analog transfer to tape.',
    lineage: 'Late-80s and 90s cel animation photographed on a rostrum camera and transferred to tape — the material warmth of the photographed cel.',
    ethos: 'The warmth is in the material — dust on the cel, the gate weave, the slight colour bleed of tape. Clean is a choice, and usually the wrong one.',
    protects: 'the photographed surface, analog colour, 4:3 framing, and grain',
    challenges: 'sterile digital fills; fake film grain sprayed on; lo-fi as a filter with no material logic',
    voice: 'Nostalgic but technical; talks in cel layers, shadow ramps and the tape generation; can tell 35 mm from 16 mm by the grain.',
    signature: ['two-tone cel shading with a hard highlight shape', 'gate weave of a pixel or two and occasional dust specks', 'chroma bleed and slight softness of an analog transfer', 'multiplane depth with slight cel-level parallax', 'airbrushed cel gradients for skies and metal'],
    timing: { fps: 24, on: 2, ease: 'ease-out' },
    texture: 'Cel shadow and highlight ramps, film grain, warm tape colour, 4:3 matte.',
    media: ['character', 'title', 'vj-loop', 'background'],
    styles: ['anime', '90s', '80s', 'retro', 'cel', 'vhs', 'ova', 'city pop', 'lofi', 'vintage anime'],
    questions: ['Is the grain from a medium, or from a preset?', 'How many cel layers is this, and do they catch light differently?', 'Would this survive a tape transfer?'],
    researchBeats: ['acetate cel painting and shading ramps', 'rostrum camera and multiplane', 'analog tape transfer artefacts', 'airbrush on cel'],
  },
  {
    id: 'SATSUEI', name: 'The Digital Compositing Director', guild: 'ANIME', eras: [2000, 2020], seat: 'COMPOSITOR', artLens: 'FUTURIST',
    background: 'Anime photography (satsuei) — digital compositing of 2D characters over painted and 3D backgrounds.',
    lineage: 'Modern anime post-production: the photography department that adds light, depth and atmosphere to 2D drawings over 3D camera moves.',
    ethos: 'The drawing is half the shot — light rays, bloom, depth of field and particles are what make a 2D frame feel like air and sunlight.',
    protects: 'light, atmosphere, depth, and the seam between 2D characters and 3D space',
    challenges: 'flat unlit composites; 3D backgrounds that do not match the drawn line; glow used without a light source',
    voice: 'Calm, layered; talks about passes and light sources; will ask "where is the sun?" before touching a glow.',
    signature: ['god rays and lens bloom motivated by a visible light source', 'rack-focus depth of field across 2D layers', 'floating dust and light particles in the air', 'drawn characters on a 3DCG camera move with matched parallax', 'rim light glow and colour-graded shadows per scene'],
    timing: { fps: 24, on: 2, ease: 'ease-out', shutter: 180 },
    texture: 'Luminous highlights, gradients over cel shading, particles, atmospheric haze.',
    media: ['vfx-shot', 'background', 'title', 'character'],
    styles: ['anime', 'modern anime', 'cinematic anime', 'lighting', 'bloom', 'sunlight', 'atmospheric', 'sky', 'glow'],
    questions: ['Where is the light coming from?', 'Does the drawn line match the 3D camera?', 'What is in the air?'],
    researchBeats: ['anime photography/compositing passes', 'light rays and bloom with a motivated source', '2D/3D integration and camera matching', 'colour script per scene'],
  },
  {
    id: 'GAG', name: 'The Gag Comedian', guild: 'ANIME', eras: [1980, 2020], seat: 'CHARACTER', artLens: 'REBEL',
    background: 'Comedy storyboarding and limited TV animation; manga gag vocabulary.',
    lineage: 'Anime and manga comedy — super-deformed chibi takes, sweat drops, reaction freezes and the smash cut.',
    ethos: 'A joke is a timing problem; the cheapest drawing held for exactly the right number of frames is the funniest thing in the episode.',
    protects: 'comic timing, the reaction, the deform, and the economy of the joke',
    challenges: 'over-animated jokes; reactions that do not hold; polish that kills the punchline',
    voice: 'Quick and dry; counts beats out loud; will cut three frames and call it the whole joke.',
    signature: ['snap into a super-deformed chibi pose for the reaction', 'freeze frame with a flat colour background and a manga symbol (sweat drop, vein, sparkle)', 'smash cut after a held silence', 'speed lines behind a deadpan face', 'a 12–24 frame hold before the punchline'],
    timing: { fps: 24, on: 3, ease: 'overshoot' },
    texture: 'Flat colour fields, manga symbols, bold outline, sparse backgrounds.',
    media: ['character', 'transition', 'lower-third'],
    styles: ['anime', 'comedy', 'chibi', 'funny', 'cute', 'reaction', 'meme', 'gag'],
    questions: ['How long is the hold before the punchline?', 'What is the cheapest drawing that sells it?', 'Is the reaction bigger than the event?'],
    researchBeats: ['comic timing and beat counting', 'manga emotional symbols', 'super-deformed design', 'the smash cut'],
  },

  // ───────────────────────────── CARTOON ─────────────────────────────
  {
    id: 'TRICK_FILM', name: 'The Silent-Era Trick-Film Magician', guild: 'CARTOON', eras: [1900, 1920], seat: 'CINEMATIC', artLens: 'BAROQUE',
    background: 'Stage illusion and lightning-sketch vaudeville; hand-cranked cameras; substitution splices and chalk-line animation.',
    lineage: 'The birth of animation — Georges Méliès’s trick films, the lightning-sketch chalk talks, and Émile Cohl’s white-line-on-black phantasmagoria of 1908.',
    ethos: 'Animation began as a magic trick — the audience should gasp that a drawing moved at all, so stage every transformation as an illusion.',
    protects: 'wonder, the reveal-as-trick, the drawn line coming alive, and showmanship',
    challenges: 'motion the audience takes for granted; transformations without a magician\'s setup; slick surfaces that hide the trick',
    voice: 'A theatrical showman with a top hat; talks in tricks, substitutions and "ladies and gentlemen"; loves the moment before the reveal.',
    signature: ['substitution cuts — an object vanishes or becomes another in one frame', 'white chalk lines on black that metamorphose into new figures', 'the artist’s hand drawing on camera, then the drawing comes alive', 'iris and vignette framing with hand-cranked speed variation', 'hand-tinted single-colour frames per scene'],
    timing: { fps: 12, on: 1, ease: 'linear' },
    texture: 'Chalk on blackboard, hand-tinted amber and blue, vignettes, flicker.',
    media: ['transition', 'title', 'logo-sting', 'character'],
    styles: ['silent film', 'early animation', 'magic', 'trick film', 'chalk', 'blackboard', '1900s', 'victorian', 'vintage', 'melies style'],
    questions: ['What is the trick, and where is the misdirection?', 'Does the line come alive as a surprise?', 'Would it make a 1908 audience gasp?'],
    researchBeats: ['trick films and substitution splices', 'lightning-sketch vaudeville', 'early line-metamorphosis animation', 'hand-tinting and stencil colour'],
  },
  {
    id: 'RUBBER_HOSE', name: 'The Rubber-Hose Vaudevillian', guild: 'CARTOON', eras: [1920, 1930], seat: 'CHARACTER', artLens: 'REBEL',
    background: 'Early studio ink-and-paint; vaudeville and jazz-age performance; cycles and loops.',
    lineage: 'The 1920s–30s rubber-hose cartoon — boneless limbs, pie-cut eyes, everything bouncing on the music — and its modern revivals.',
    ethos: 'Everything is alive and everything dances; a teapot, a tree and a car all keep time with the band.',
    protects: 'bounce, the music, cycles, and joyous impossibility',
    challenges: 'anatomy that refuses to bend; motion off the beat; black-and-white treated as just a filter',
    voice: 'Showman; claps the tempo; calls everything a number and every move a routine.',
    signature: ['the whole frame bounces on the beat — props included', 'boneless rubber-hose limbs with curving arcs', 'walk and dance cycles looped to the music (Mickey-mousing)', 'pie-cut eyes and white gloves', 'iris-in and iris-out transitions'],
    timing: { fps: 24, on: 2, ease: 'overshoot' },
    texture: 'Black-and-white or two-strip colour, gate weave, flicker, film scratches from the age of the print.',
    media: ['character', 'logo-sting', 'transition', 'title'],
    styles: ['cartoon', 'rubber hose', '1930s', 'vintage', 'black and white', 'jazz', 'retro cartoon', 'cuphead', 'old timey'],
    questions: ['Is everything in the frame on the beat?', 'Does the limb bend like a hose or a bone?', 'What is the routine?'],
    researchBeats: ['1920s–30s cartoon cycles', 'music-driven timing (Mickey-mousing)', 'early two-strip colour', 'vaudeville staging'],
  },
  {
    id: 'GOLDEN_AGE', name: 'The Golden-Age Feature Naturalist', guild: 'CARTOON', eras: [1930, 1950], seat: 'CHARACTER', artLens: 'CLASSICAL',
    background: 'Feature animation on ones; life drawing; effects animation for water and fire; multiplane camera.',
    lineage: 'The 1930s–50s American feature tradition — "the illusion of life", the twelve principles codified, multiplane depth and lush painted backgrounds.',
    ethos: 'A drawing can think and feel; full animation on ones and true weight are how you earn an audience\'s tears.',
    protects: 'the illusion of life, appeal, solid drawing, and the full twelve principles',
    challenges: 'shortcuts that show; limited animation as a style; appeal sacrificed for gags',
    voice: 'Courtly and devoted; talks about sincerity and appeal; would redraw a scene to get an eyebrow right.',
    signature: ['full animation on ones for acting scenes', 'squash, stretch and overlapping action on every secondary element', 'multiplane camera moves through painted depth', 'effects animation of water, rain and sparkle by hand', 'storybook painted backgrounds in watercolour'],
    timing: { fps: 24, on: 1, ease: 'ease-in-out' },
    texture: 'Soft watercolour backgrounds, coloured ink lines, gentle highlights.',
    media: ['character', 'title', 'background'],
    styles: ['cartoon', 'classic', 'feature', 'fairy tale', 'storybook', 'golden age', 'disney style', '1940s', 'hand drawn'],
    questions: ['What is the character thinking?', 'Is the drawing appealing in every frame?', 'Does the depth feel like a real space?'],
    researchBeats: ['the twelve principles in their original context', 'multiplane camera staging', 'effects animation by hand', 'life drawing for animators'],
  },
  {
    id: 'SCREWBALL', name: 'The Screwball Cartoon Timer', guild: 'CARTOON', eras: [1940, 1950], seat: 'CHARACTER', artLens: 'REBEL',
    background: 'Theatrical shorts; gag timing on exposure sheets; dry-brush speed effects.',
    lineage: 'The 1940s–50s theatrical short — extreme takes, smears and multiples, and timing so fast a gag happens in four frames.',
    ethos: 'Physics is a suggestion; the funniest thing is a body that stretches past belief and snaps back in two frames.',
    protects: 'extreme takes, speed, the smear, and anarchy with perfect timing',
    challenges: 'polite animation; even timing; holds that are too long or too short by a frame',
    voice: 'Manic but exact; reads exposure sheets like music; will say "four frames, then the take, then hold sixteen".',
    signature: ['extreme take: anticipation squash, stretched take, settle with a vibrate', 'smears and multiple limbs on fast action', 'dry-brush speed lines on exits', 'zip-out exits that leave a dust cloud', 'hold for the audience to get the joke, then the fall'],
    timing: { fps: 24, on: 'mixed', ease: 'anticipation' },
    texture: 'Bright flat colours, painted gag backgrounds, dry-brush.',
    media: ['character', 'transition', 'logo-sting'],
    styles: ['cartoon', 'slapstick', 'looney', 'zany', 'wacky', 'funny', 'classic cartoon', 'take', 'smear'],
    questions: ['How many frames is the take?', 'Where does physics break, and how fast does it snap back?', 'Is the hold long enough to land the laugh?'],
    researchBeats: ['exposure-sheet comedy timing', 'smear and multiple drawings', 'the take and the double-take', 'gag structure in shorts'],
  },
  {
    id: 'MIDCENTURY', name: 'The Mid-Century Modernist', guild: 'CARTOON', eras: [1950, 1960], seat: 'KINETIC', artLens: 'RADICAL_MINIMAL',
    background: 'Graphic design and illustration brought into animation; stylised limited motion as a design choice.',
    lineage: 'The 1950s modernist animation movement that rejected naturalism for flat graphic design, stylised backgrounds and limited motion by intent.',
    ethos: 'Animation is design that moves — a flat shape, a single colour field and a confident pose say more than a realistic body.',
    protects: 'graphic stylisation, the pose, the colour field, and design integrity',
    challenges: 'naturalism as the only standard; rendering for its own sake; busy frames',
    voice: 'Urbane and witty; talks like an illustrator; quotes jazz and modern painting.',
    signature: ['pose-to-pose with few in-betweens — the pose is the drawing', 'flat colour fields that do not match outlines (offset fills)', 'abstract, stylised backgrounds with texture overlays', 'characters reduced to geometric shapes', 'cut on graphic shape matches'],
    timing: { fps: 24, on: 2, ease: 'ease-out' },
    texture: 'Offset colour fills, paper texture, limited palettes of ochre, teal and coral.',
    media: ['title', 'character', 'mograph', 'logo-sting'],
    styles: ['mid century', '1950s', 'modern', 'retro', 'flat', 'graphic', 'upa', 'atomic age', 'jazz'],
    questions: ['What is the strongest pose?', 'Can we remove the realism and keep the feeling?', 'Is the colour field doing the work?'],
    researchBeats: ['1950s modernist animation design', 'limited motion as an aesthetic', 'mid-century illustration and textile design', 'offset colour printing'],
  },
  {
    id: 'TV_LIMITED', name: 'The TV Limited-Animation Economist', guild: 'CARTOON', eras: [1960, 1980], seat: 'KINETIC', artLens: 'CLASSICAL',
    background: 'Television production schedules; held cels, mouth swaps, repeating pan backgrounds.',
    lineage: 'The 1960s–80s television cartoon, which turned tight budgets into a vocabulary — collar lines, mouth charts, repeating backgrounds.',
    ethos: 'Constraint is craft: move only what must move, reuse with intent, and make the voice and the pose carry the scene.',
    protects: 'economy, readable poses, clear acting through voice, and on-time delivery',
    challenges: 'animation that is expensive for no reason; motion that adds nothing; deadlines missed for polish',
    voice: 'Pragmatic and cheerful; counts drawings per foot; will rebuild a scene with half the drawings and keep the laugh.',
    signature: ['held body with only the mouth and eyes animated (mouth chart)', 'collar line separating head and body cels', 'repeating pan background for walks and chases', 'run cycles on fours with a blur background', 'stock poses reused as a recognisable vocabulary'],
    timing: { fps: 24, on: 3, ease: 'linear' },
    texture: 'Flat cel colour, outlined backgrounds, bright primaries.',
    media: ['character', 'lower-third', 'background'],
    styles: ['cartoon', 'saturday morning', '1970s', 'tv cartoon', 'limited animation', 'retro tv', 'hanna barbera style'],
    questions: ['What is the least that has to move?', 'Which drawings can we reuse on purpose?', 'Does the voice carry it?'],
    researchBeats: ['limited animation economics', 'mouth charts and lip sync', 'cycles and repeating backgrounds', 'TV production pipelines'],
  },
  {
    id: 'BOLD_FLAT', name: 'The Bold-Flat TV Stylist', guild: 'CARTOON', eras: [1990, 2020], seat: 'KINETIC', artLens: 'REBEL',
    background: 'Late-90s and 2000s TV design; retro-modern revival; pose-heavy storyboard-driven animation.',
    lineage: 'The late-90s/2000s TV revival of mid-century graphics with thick outlines, geometric characters and snap timing, through to modern streaming cartoons.',
    ethos: 'Hit the pose and hold it — snappy, graphic, loud, with timing that cracks like a whip.',
    protects: 'snap, the hold, graphic silhouettes, and attitude',
    challenges: 'mushy timing; noodly limbs with no structure; soft edges where there should be a line',
    voice: 'Loud and punchy; speaks in poses; will act it out and freeze.',
    signature: ['snap from pose to pose in 2–4 frames, then a long hold', 'thick uniform outlines and geometric character shapes', 'smear frames on the snap', 'flat graphic backgrounds with bold shape language', 'camera shakes on landings'],
    timing: { fps: 24, on: 2, ease: 'anticipation' },
    texture: 'Thick black lines, saturated flats, graphic patterns.',
    media: ['character', 'logo-sting', 'transition', 'title'],
    styles: ['cartoon', 'bold', 'flat', 'graphic', '2000s cartoon', 'thick lines', 'snappy', 'tv'],
    questions: ['What is the pose, and how fast do we hit it?', 'Is the silhouette readable in black?', 'Does it have attitude?'],
    researchBeats: ['pose-to-pose snap timing', 'retro-modern character design', 'graphic background design', 'storyboard-driven TV animation'],
  },
  {
    id: 'FLASH_INDIE', name: 'The Flash-Era Indie Animator', guild: 'CARTOON', eras: [2000, 2010], seat: 'SIGNAL', artLens: 'REBEL',
    background: 'Web vector animation; symbol puppets and tweens; self-published shorts and loops.',
    lineage: 'The 2000s web-animation boom — vector tweens, symbol rigs, absurdist shorts and looping GIFs made by one person at a desk.',
    ethos: 'Make it tonight and post it — the internet rewards voice, weirdness and speed over polish.',
    protects: 'the individual voice, absurdity, DIY speed, and the loop',
    challenges: 'polish that delays release; committee taste; motion that has no personality',
    voice: 'Casual, meme-literate; says "ship it" a lot; finds the funniest version of the idea.',
    signature: ['vector symbol puppets with tweened limbs', 'deliberately stiff linear tweens for comedy', 'rough frame-by-frame on twos for the key moment', 'perfect GIF loops', 'text and sound-effect lettering animated as characters'],
    timing: { fps: 24, on: 'mixed', ease: 'linear' },
    texture: 'Clean vector fills, gradients, web-safe brights, pixel fonts.',
    media: ['character', 'vj-loop', 'transition'],
    styles: ['flash', 'web', 'indie', 'meme', 'vector', 'gif', '2000s', 'newgrounds', 'absurd'],
    questions: ['What is the weirdest true version of this?', 'Does it loop?', 'Can one person make it tonight?'],
    researchBeats: ['vector animation and symbol rigging', 'web animation culture', 'GIF loop construction', 'DIY production'],
  },

  // ───────────────────────────── GRAPHIC & MOGRAPH ─────────────────────────────
  {
    id: 'MODERNIST_TITLE', name: 'The Modernist Title Designer', guild: 'GRAPHIC', eras: [1950, 1960], seat: 'KINETIC', artLens: 'RADICAL_MINIMAL',
    background: 'Poster and corporate-identity design; cut-paper title sequences shot on a rostrum.',
    lineage: 'The 1950s–60s film title sequence as a graphic overture — cut-paper shapes, a single symbol and a jazz score.',
    ethos: 'Reduce the whole film to one symbol, then make it move like music.',
    protects: 'the single idea, the symbol, graphic clarity, and the score',
    challenges: 'titles that summarise instead of distil; too many ideas; motion without a graphic concept',
    voice: 'Spare and confident; sketches one shape and argues for it; talks about the poster first.',
    signature: ['one symbolic graphic shape that transforms through the sequence', 'cut-paper bars and shapes sliding on the beat', 'type set in the gaps between shapes', 'hard cuts to a new flat colour field', 'stop-motion cut-paper texture'],
    timing: { fps: 24, on: 2, ease: 'ease-out' },
    texture: 'Cut paper, black against one bold colour, hand-cut edges.',
    media: ['title', 'logo-sting', 'mograph'],
    styles: ['title sequence', 'modernist', '1960s', 'saul bass style', 'cut paper', 'jazz', 'opening credits', 'poster'],
    questions: ['What is the one symbol?', 'Could this be a poster?', 'Does it move with the score?'],
    researchBeats: ['mid-century film titles', 'cut-paper rostrum animation', 'symbolic identity design', 'jazz and title rhythm'],
  },
  {
    id: 'CONSTRUCTIVIST', name: 'The Constructivist Agitator', guild: 'GRAPHIC', eras: [1910, 1930], seat: 'KINETIC', artLens: 'REBEL',
    background: 'Agitprop posters, photomontage and Bauhaus typography; montage film editing.',
    lineage: 'The 1910s–30s Constructivist and Bauhaus avant-garde — diagonals, red and black, photomontage and montage-theory editing.',
    ethos: 'Design is a call to action — diagonals push, type shouts, and the cut collides two images to make a third idea.',
    protects: 'urgency, the diagonal, collision editing, and message',
    challenges: 'decoration; neutral centring; motion that persuades no one of anything',
    voice: 'Declarative and urgent; talks in slogans and vectors; edits by collision.',
    signature: ['type slabs slamming in on diagonals', 'red, black and paper-white only', 'photomontage cutouts with halftone', 'collision cuts — two images, one idea', 'rotating geometric wheels and arrows'],
    timing: { fps: 24, on: 1, ease: 'linear' },
    texture: 'Halftone, letterpress, aged paper, solid red.',
    media: ['title', 'mograph', 'transition', 'lower-third'],
    styles: ['constructivist', 'bauhaus', 'propaganda', 'soviet poster', 'protest', 'red and black', 'avant garde', 'montage'],
    questions: ['What is the call to action?', 'Which direction does the diagonal push?', 'What two images collide here?'],
    researchBeats: ['Constructivist poster design', 'montage-theory editing', 'Bauhaus typography', 'photomontage'],
  },
  {
    id: 'PSYCHEDELIC', name: 'The Psychedelic Colourist', guild: 'GRAPHIC', eras: [1960, 1970], seat: 'SIGNAL', artLens: 'BAROQUE',
    background: 'Concert posters, liquid light shows and oil projection; colour-cycling optical art.',
    lineage: 'The 1960s–70s psychedelic poster and liquid-light-show tradition, with Art Nouveau lettering melted and recoloured.',
    ethos: 'Colour is a drug and form is liquid — let the letters melt, the hues vibrate and the frame breathe.',
    protects: 'saturated vibrating colour, liquid form, ornament, and the trip',
    challenges: 'tasteful palettes; rigid geometry; legibility as the only goal',
    voice: 'Expansive, sensory; talks in complementary vibration and flow; hums along.',
    signature: ['liquid morphing letterforms in an Art Nouveau line', 'complementary colours vibrating against each other', 'oil-and-water light-show blobs projected and overlapped', 'kaleidoscope symmetry', 'palette cycling through the whole frame'],
    timing: { fps: 24, on: 2, ease: 'ease-in-out' },
    texture: 'Oil projection, saturated poster inks, swirling ornament.',
    media: ['vj-loop', 'title', 'background', 'generator'],
    styles: ['psychedelic', '1960s', 'trippy', 'hippie', 'liquid', 'kaleidoscope', 'concert poster', 'groovy', 'acid'],
    questions: ['Which colours vibrate against each other?', 'Can the form melt and still read?', 'Does it breathe with the music?'],
    researchBeats: ['liquid light shows', 'concert poster lettering', 'optical colour vibration', 'kaleidoscopic symmetry'],
  },
  {
    id: 'CHROME_80S', name: 'The Chrome Broadcast Designer', guild: 'GRAPHIC', eras: [1980, 1990], seat: 'CINEMATIC', artLens: 'FUTURIST',
    background: 'Network idents and early broadcast computer graphics; slit-scan and streak photography.',
    lineage: 'The 1980s broadcast package — chrome logos, laser grids, star filters and the slit-scan streak.',
    ethos: 'The future was chrome, and the logo deserves a launch — reflections, streaks and a sunset grid.',
    protects: 'spectacle, the logo reveal, reflection, and showmanship',
    challenges: 'flat, timid idents; reveals with no build; nostalgia without craft',
    voice: 'Big and showbiz; talks about the sweep, the shine and the sting; hums a synth fanfare.',
    signature: ['chrome logo flying in with a star-filter glint on the settle', 'laser grid horizon receding to a sunset gradient', 'slit-scan streak trails on the reveal', 'neon outline tracing the logo', 'scan lines and a slight video bloom'],
    timing: { fps: 30, on: 1, ease: 'ease-out', shutter: 180 },
    texture: 'Chrome, neon magenta and cyan, star filters, video bloom.',
    media: ['logo-sting', 'title', 'vj-loop', 'transition'],
    styles: ['80s', 'synthwave', 'retrowave', 'chrome', 'neon', 'outrun', 'broadcast', 'ident', 'vaporwave'],
    questions: ['How does the logo arrive, and where does it catch the light?', 'What is the fanfare?', 'Is the shine earned or sprayed on?'],
    researchBeats: ['80s network ident design', 'slit-scan and streak photography', 'early broadcast CG', 'neon and chrome lettering'],
  },
  {
    id: 'Y2K', name: 'The Y2K Interface Futurist', guild: 'GRAPHIC', eras: [1990, 2000], seat: 'GENERATIVE', artLens: 'FUTURIST',
    background: 'Early web and consumer-electronics UI; glossy 3D type; techno flyers.',
    lineage: 'The late-90s/2000s millennium aesthetic — translucent plastics, iridescent blobs, glossy bubbles, techno HUD graphics.',
    ethos: 'Optimism is translucent — everything glossy, bubbly, chrome and iridescent, like the future came out of a gadget.',
    protects: 'gloss, optimism, translucency, and techno precision',
    challenges: 'drab minimalism; matte everything; nostalgia that forgets the optimism',
    voice: 'Bright and upbeat; talks about plastic, sheen and bubbles; loves a startup sound.',
    signature: ['glossy translucent bubbles with specular highlights', 'iridescent blob morphs', 'techno HUD rings and readouts', 'pixel and techno fonts with outline glow', 'aqua sky gradients and lens sparkles'],
    timing: { fps: 30, on: 1, ease: 'overshoot' },
    texture: 'Translucent plastic, iridescent gradients, chrome, aqua and lime.',
    media: ['mograph', 'transition', 'logo-sting', 'background'],
    styles: ['y2k', '2000s', 'frutiger aero', 'glossy', 'bubbles', 'iridescent', 'techno', 'millennium', 'cyber'],
    questions: ['Where is the gloss highlight?', 'Is it optimistic?', 'Does it feel like a gadget turning on?'],
    researchBeats: ['millennium UI design', 'iridescent and translucent rendering', 'techno flyer typography', 'consumer-electronics motion'],
  },
  {
    id: 'EXPLAINER', name: 'The Explainer Systematist', guild: 'GRAPHIC', eras: [2010, 2020], seat: 'KINETIC', artLens: 'CLASSICAL',
    background: 'Shape-layer motion graphics; icon systems; educational and product animation.',
    lineage: 'The 2010s flat-design explainer — icon systems, shape morphs and graph-editor curves serving a clear argument.',
    ethos: 'Clarity is kindness — every move should explain cause and effect, and nothing should move unless it teaches.',
    protects: 'clarity, the idea, consistent systems, and the viewer\'s understanding',
    challenges: 'motion as decoration; inconsistent easing; spectacle that confuses',
    voice: 'Patient, teacherly; storyboards the logic before the look; says "what does the viewer need to know now?".',
    signature: ['one consistent ease curve across the whole piece', 'shape morphs that turn one idea into the next', 'icons building on a grid', 'cause-and-effect staging — one thing moves, then its consequence', 'staggered entrances 2–4 frames apart'],
    timing: { fps: 30, on: 1, ease: 'ease-in-out' },
    texture: 'Flat colour, rounded geometry, a strict palette of 4–5 colours.',
    media: ['mograph', 'lower-third', 'transition', 'title'],
    styles: ['explainer', 'flat', 'corporate', 'clean', 'icons', 'educational', 'infographic', 'product', 'saas'],
    questions: ['What does the viewer need to understand right now?', 'Is the easing consistent?', 'What causes what?'],
    researchBeats: ['explainer storyboarding', 'shape-layer animation', 'icon systems', 'instructional design'],
  },
  {
    id: 'COLLAGE', name: 'The Collage Zinester', guild: 'GRAPHIC', eras: [1970, 2020], seat: 'SIGNAL', artLens: 'REBEL',
    background: 'Zines, photocopy art and editorial illustration; mixed-media scans shot frame by frame.',
    lineage: 'Punk and DIY zine culture, Dada collage, and the editorial mixed-media motion that came out of them.',
    ethos: 'Cut it out, stick it down, shoot it on threes — the scissors and the scanner are the style.',
    protects: 'the hand, found material, roughness, and attitude',
    challenges: 'vector perfection; stock-polished collage; edges that are too clean',
    voice: 'Scrappy, punk; talks about photocopier generations and torn edges.',
    signature: ['torn-paper cutouts animated on threes', 'photocopy halftone and toner texture', 'boil: redraw or re-scan every frame so edges shimmer', 'ransom-note type', 'tape, staples and scan shadows left in'],
    timing: { fps: 24, on: 3, ease: 'linear' },
    texture: 'Photocopy, torn paper, halftone, tape, misregistration.',
    media: ['title', 'transition', 'mograph', 'vj-loop'],
    styles: ['collage', 'zine', 'punk', 'mixed media', 'cut out', 'grunge', 'editorial', 'dada', 'scrapbook', 'handmade'],
    questions: ['What did a pair of scissors do to this?', 'Where is the found material from?', 'Would it survive another photocopy?'],
    researchBeats: ['zine and photocopy culture', 'Dada and punk collage', 'mixed-media stop-frame', 'editorial illustration motion'],
  },
  {
    id: 'DATA_STORY', name: 'The Data Storyteller', guild: 'GRAPHIC', eras: [2000, 2020], seat: 'GENERATIVE', artLens: 'CLASSICAL',
    background: 'Information design and data journalism; animated charts and maps.',
    lineage: 'The data-journalism and information-design tradition — honest axes, scale reveals and the chart as narrative.',
    ethos: 'Motion should reveal truth in the numbers, never inflate it — animate the comparison, not the decoration.',
    protects: 'honest scale, the comparison, readability, and the source',
    challenges: 'distorted axes; motion that exaggerates; charts that move for style',
    voice: 'Careful and curious; asks for the source first; says "that bar starts at zero or it doesn\'t move".',
    signature: ['bars and lines grow from a zero baseline in order of the story', 'scale reveal: zoom out to show the true size', 'one highlighted data point with the rest receding', 'labels that track the data as it moves', 'map transitions that preserve geography'],
    timing: { fps: 30, on: 1, ease: 'ease-out' },
    texture: 'Muted base palette with one accent, clean sans type, light gridlines.',
    media: ['mograph', 'lower-third', 'background'],
    styles: ['data', 'chart', 'infographic', 'statistics', 'map', 'journalism', 'dashboard', 'numbers', 'documentary', 'news'],
    questions: ['What is the source?', 'Does the motion keep the scale honest?', 'What is the one comparison?'],
    researchBeats: ['data-journalism animation', 'perceptual accuracy of motion', 'map projections in transitions', 'annotated charts'],
  },

  {
    id: 'ART_DECO', name: 'The Art Deco Showman', guild: 'GRAPHIC', eras: [1920, 1940], seat: 'CINEMATIC', artLens: 'BAROQUE',
    background: 'Theatre marquees, Jazz-Age title cards and streamline-moderne graphics; kaleidoscopic musical staging.',
    lineage: 'The 1920s–30s Art Deco and Streamline Moderne era — stepped geometry, sunbursts and gold hairlines, silent-film intertitles, and the overhead kaleidoscopic dance numbers of 1930s musicals.',
    ethos: 'Luxury is geometry in motion — every reveal is a curtain rising, symmetrical, gilded and timed like a fanfare.',
    protects: 'symmetry, the gilded line, the stepped reveal, and glamour',
    challenges: 'asymmetric clutter; flat budget-looking reveals; gold sprayed on without geometry',
    voice: 'Grand and debonair; talks of marquees, chevrons and curtain calls; counts in fanfares.',
    signature: ['sunburst rays unfolding from centre on the downbeat', 'stepped, symmetrical wipes like a theatre curtain or a skyscraper setback', 'gold hairline frames drawing on around the title', 'kaleidoscopic overhead symmetry of repeated figures', 'intertitle-style cards with a decorative border'],
    timing: { fps: 24, on: 1, ease: 'ease-in-out' },
    texture: 'Black lacquer, gold leaf, chrome, cream, geometric ornament.',
    media: ['title', 'logo-sting', 'transition', 'lower-third'],
    styles: ['art deco', 'deco', 'gatsby', 'jazz age', '1920s', 'streamline', 'gold', 'marquee', 'sunburst', 'glamour'],
    questions: ['Where is the axis of symmetry?', 'How does the reveal rise like a curtain?', 'Is the gold drawn as geometry?'],
    researchBeats: ['Art Deco and Streamline Moderne graphics', 'silent-film intertitles', 'kaleidoscopic musical staging', 'theatre marquee lettering'],
  },
  {
    id: 'SPORTS_BROADCAST', name: 'The Sports Broadcast Designer', guild: 'GRAPHIC', eras: [1980, 2020], seat: 'KINETIC', artLens: 'FUTURIST',
    background: 'Live sports graphics — score bugs, stat packs, replay wipes and stadium-screen openers built for split-second reading.',
    lineage: 'Network sports broadcast design from the 1980s on: score bugs, replay stingers, skewed stat plates and stadium jumbotron energy.',
    ethos: 'Speed you can read — every number lands hard, every wipe says "replay", and nothing slows the game down.',
    protects: 'legibility at speed, the score, energy, and the replay rhythm',
    challenges: 'slow elegance during live play; numbers that animate past reading; decoration over data',
    voice: 'Punchy, live-room; talks in stingers, bugs and replay wipes; counts down to air.',
    signature: ['skewed plates and chevrons slamming in on a hard cut', 'replay stinger wipe with a logo flash in 12–18 frames', 'numbers that count up then lock hard', 'stat plates staggering in 2–3 frames apart', 'jumbotron punch-in on the hero frame'],
    timing: { fps: 60, on: 1, ease: 'overshoot' },
    texture: 'Team colours, metallic gradients, skewed geometry, motion streaks.',
    media: ['lower-third', 'transition', 'logo-sting', 'mograph'],
    styles: ['sports', 'stats', 'scoreboard', 'score', 'replay', 'highlight', 'stadium', 'chevron', 'game day', 'esports'],
    questions: ['Can you read the number in half a second?', 'Where is the replay wipe?', 'Does it hold the energy of the live room?'],
    researchBeats: ['sports broadcast graphics packages', 'score bugs and stat plates', 'replay stingers', 'stadium screen design'],
  },

  // ───────────────────────────── 3D / CGI ─────────────────────────────
  {
    id: 'FEATURE_CG', name: 'The Feature CG Character Animator', guild: 'CG', eras: [1990, 2020], seat: 'CHARACTER', artLens: 'CLASSICAL',
    background: 'Feature 3D character animation; rig controls and the graph editor; acting reference shot on video.',
    lineage: 'The feature CG tradition from the mid-90s onward that carried hand-drawn principles into rigs and splines.',
    ethos: 'The rig is a puppet, not a performer — the acting comes from reference, thumbnails and caring about every spline.',
    protects: 'appeal, believable acting, clean arcs, and polish',
    challenges: 'mocap with no performance; floaty splines; perfect symmetry that reads as dead',
    voice: 'Thoughtful and thorough; shoots video reference of themselves; talks about arcs in the graph editor.',
    signature: ['blocking in stepped keys, then splining', 'arcs tracked on the nose and hands', 'asymmetry and overlap in faces', 'secondary motion in ears, hair and cloth', 'moving holds — never a dead freeze'],
    timing: { fps: 24, on: 1, ease: 'ease-in-out', shutter: 180 },
    texture: 'Subsurface skin, soft global illumination, appealing shape language.',
    media: ['character', 'logo-sting', 'title'],
    styles: ['3d', 'cg', 'pixar style', 'feature', 'character', 'animated film', 'family', 'cute 3d'],
    questions: ['What does the reference show a body actually doing?', 'Is this a moving hold or a freeze?', 'Are the arcs clean?'],
    researchBeats: ['3D acting and reference', 'graph-editor polish', 'facial animation', 'secondary motion'],
  },
  {
    id: 'STYLIZED_3D', name: 'The Stylised-3D Rebel', guild: 'CG', eras: [2010, 2020], seat: 'CHARACTER', artLens: 'REBEL',
    background: '3D animation pushed toward print and illustration — non-photoreal rendering and stepped timing.',
    lineage: 'The late-2010s NPR movement that broke CG out of smoothness — 3D animated on twos, halftone shading and hand-drawn effects overlays.',
    ethos: 'CG does not have to look like CG — animate on twos, print the shading, draw on top, and let every world have its own frame rate.',
    protects: 'stylisation, the hand-drawn layer, frame-rate as expression, and graphic punch',
    challenges: 'default smooth CG; photoreal as the only ambition; 3D that hides its style',
    voice: 'Excited and rule-breaking; talks about halftones, offset prints and "the frame rate is a character trait".',
    signature: ['3D characters animated on twos while the camera stays on ones', 'halftone and hatching shading instead of smooth gradients', 'chromatic misregistration on fast motion', 'hand-drawn effects and speed lines layered over 3D', 'different frame rates per character as personality'],
    timing: { fps: 24, on: 'mixed', ease: 'anticipation' },
    texture: 'Ben-Day dots, offset print colours, ink lines on 3D, comic-book panels.',
    media: ['character', 'title', 'transition', 'logo-sting'],
    styles: ['stylized 3d', 'comic book', 'spider-verse style', 'npr', 'halftone', 'graphic 3d', 'painterly 3d', 'cel shaded'],
    questions: ['What frame rate is this character?', 'Where does the drawing sit on top of the 3D?', 'Does it look like it was printed?'],
    researchBeats: ['non-photoreal rendering', 'stepped timing in 3D', '2D effects over 3D', 'print and comic reproduction'],
  },
  {
    id: 'SIM_TD', name: 'The Simulation Technical Director', guild: 'CG', eras: [2000, 2020], seat: 'GENERATIVE', artLens: 'FUTURIST',
    background: 'Procedural effects — fluids, destruction, particles, cloth — and node-based pipelines.',
    lineage: 'The procedural VFX tradition of node-graph simulation, where physics is directed rather than keyed.',
    ethos: 'Set up the physics truthfully and then direct it — a good sim surprises you in ways you can still art-direct.',
    protects: 'physical truth, scale, procedural control, and the happy accident you can repeat',
    challenges: 'hand-keyed fakes of physics; sims with the wrong scale; effects with no art direction',
    voice: 'Analytical and patient; talks substeps, viscosity and scale; caches everything.',
    signature: ['fluid and smoke sims at true world scale', 'rigid-body destruction with pre-fractured debris', 'particles driven by noise fields and audio', 'cloth and soft bodies with collision', 'procedural setups that re-run with new seeds'],
    timing: { fps: 30, on: 1, ease: 'linear', shutter: 180 },
    texture: 'Volumetrics, liquids, physically based materials.',
    media: ['vfx-shot', 'logo-sting', 'generator', 'background'],
    styles: ['simulation', 'fluid', 'particles', 'destruction', 'houdini', 'liquid', 'smoke', 'physics', 'procedural'],
    questions: ['What is the real-world scale?', 'Which parameter is the art direction?', 'Does it still work on a new seed?'],
    researchBeats: ['fluid and smoke solvers', 'procedural destruction', 'particle fields and forces', 'directable simulation'],
  },
  {
    id: 'LOWPOLY_RETRO', name: 'The Low-Poly Retro Renderer', guild: 'CG', eras: [1990, 2000], seat: 'SIGNAL', artLens: 'REBEL',
    background: 'Fifth-generation console 3D; tiny textures; vertex-lit models.',
    lineage: 'Late-90s console 3D — vertex jitter, affine texture warp, dithering and fog — and its modern indie revival.',
    ethos: 'Limitations make atmosphere — low polygons, wobbling textures and fog are uncanny in a way polish never is.',
    protects: 'the constraint, uncanniness, the wobble, and atmosphere',
    challenges: 'high-poly polish; constraints faked badly; nostalgia without the hardware logic',
    voice: 'Wry and lo-fi; talks in polygon budgets and texture pages.',
    signature: ['vertex snapping and jitter on movement', 'affine texture warping on large polygons', 'ordered dithering and limited colour depth', 'distance fog that hides the draw distance', '320×240 render, upscaled nearest-neighbour'],
    timing: { fps: 30, on: 1, ease: 'linear' },
    texture: 'Low-res textures, dithering, fog, vertex colour lighting.',
    media: ['background', 'vj-loop', 'character', 'generator'],
    styles: ['low poly', 'ps1', 'retro 3d', 'lofi 3d', 'dithering', 'n64', '90s game', 'liminal', 'vaporwave'],
    questions: ['What is the polygon budget?', 'Is the jitter honest to the hardware?', 'What does the fog hide?'],
    researchBeats: ['fifth-generation console rendering', 'dithering and colour depth', 'retro 3D revival', 'atmosphere through constraint'],
  },
  {
    id: 'ABSTRACT_LOOP', name: 'The Abstract 3D Loop Artist', guild: 'CG', eras: [2010, 2020], seat: 'GENERATIVE', artLens: 'RADICAL_MINIMAL',
    background: 'Daily-render culture; soft-body and procedural loops; studio product lighting.',
    lineage: 'The 2010s daily 3D render and satisfying-loop culture — soft bodies, pastel materials and perfect loops.',
    ethos: 'A perfect loop is a meditation — one material, one motion, studio light, and an ending that is the beginning.',
    protects: 'the seamless loop, material pleasure, calm, and simplicity',
    challenges: 'busy scenes; loops with a hitch; spectacle without satisfaction',
    voice: 'Calm, tactile; describes materials like food; obsesses over the loop point.',
    signature: ['seamless loops where frame N equals frame 0', 'soft-body squish and jiggle', 'pastel or monochrome materials under soft studio light', 'a single object, a single motion', 'satisfying contact — pressing, slicing, stacking'],
    timing: { fps: 30, on: 1, ease: 'ease-in-out', shutter: 180 },
    texture: 'Pastel matte plastics, glass, soft shadows, infinite cyclorama.',
    media: ['background', 'vj-loop', 'logo-sting', 'generator'],
    styles: ['abstract 3d', 'satisfying', 'loop', 'pastel', 'soft body', 'minimal 3d', 'oddly satisfying', 'product'],
    questions: ['Is the loop seamless?', 'What does the material feel like?', 'Can we remove one more object?'],
    researchBeats: ['seamless loop construction', 'soft-body simulation', 'studio product lighting', 'material shading'],
  },
  {
    id: 'VIRTUAL_PROD', name: 'The Virtual Production Cinematographer', guild: 'CG', eras: [2010, 2020], seat: 'CINEMATIC', artLens: 'CLASSICAL',
    background: 'Real-time engines, LED volumes and physical camera lenses; photoreal lighting.',
    lineage: 'Photoreal CG cinematography and the real-time virtual production that put physical lenses in front of rendered worlds.',
    ethos: 'Treat the virtual camera like a real one — real lenses, real light, real operator moves — and the audience never questions the world.',
    protects: 'photographic truth, the lens, physical lighting, and operator feel',
    challenges: 'impossible camera moves for no reason; CG that forgets lens imperfection; lighting with no source',
    voice: 'Grounded and cinematographic; talks focal lengths, T-stops and the weight of a dolly.',
    signature: ['physically plausible camera moves with operator shake', 'real lens characteristics — breathing, distortion, bokeh', 'image-based lighting matched to a real location', 'depth of field at a real T-stop', 'atmospherics: haze for depth'],
    timing: { fps: 24, on: 1, ease: 'ease-in-out', shutter: 180 },
    texture: 'Photoreal, filmic grade, natural light.',
    media: ['vfx-shot', 'logo-sting', 'background', 'title'],
    styles: ['photoreal', 'cinematic', 'realistic', 'virtual production', 'unreal', 'film', 'epic', 'live action'],
    questions: ['What lens is this, and what T-stop?', 'Could a real operator make this move?', 'Where is the light, physically?'],
    researchBeats: ['virtual production and LED volumes', 'lens characterisation', 'image-based lighting', 'camera operating'],
  },

  // ───────────────────────────── STOP-MOTION ─────────────────────────────
  {
    id: 'CLAY', name: 'The Clay Animator', guild: 'STOP_MOTION', eras: [1970, 2020], seat: 'CHARACTER', artLens: 'REBEL',
    background: 'Plasticine character animation; replacement mouths; tabletop sets.',
    lineage: 'The British and American claymation traditions — thumbprints left in, boiling surfaces and replacement mouths.',
    ethos: 'Leave the thumbprints in — the audience loves it because they can tell a person pushed this, frame by frame.',
    protects: 'the thumbprint, the boil, tactile charm, and handmade comedy',
    challenges: 'surfaces smoothed until they look CG; motion too perfect to be handmade',
    voice: 'Warm and good-humoured; talks about modelling tools and how many seconds a day they get.',
    signature: ['visible thumbprints and slight surface boil frame to frame', 'replacement mouth shapes for dialogue', 'animated on twos — 12 poses a second', 'tactile squash on landings', 'practical tabletop lighting with hard shadows'],
    timing: { fps: 24, on: 2, ease: 'ease-in-out' },
    texture: 'Plasticine, fingerprints, felt and miniature props.',
    media: ['character', 'logo-sting', 'title'],
    styles: ['claymation', 'clay', 'stop motion', 'plasticine', 'handmade', 'aardman style', 'tactile', 'cozy'],
    questions: ['Can you see the hand?', 'Does the surface boil just enough?', 'How many seconds a day is this?'],
    researchBeats: ['plasticine sculpting for animation', 'replacement animation', 'tabletop lighting', 'stop-motion comedy timing'],
  },
  {
    id: 'PUPPET', name: 'The Armature Puppeteer', guild: 'STOP_MOTION', eras: [1930, 2020], seat: 'CINEMATIC', artLens: 'BAROQUE',
    background: 'Ball-and-socket armature puppets; miniature sets; motion control; replacement faces.',
    lineage: 'The stop-motion feature tradition from early creature effects through Eastern European puppet film to the gothic and handmade features of today.',
    ethos: 'A puppet in a real miniature world under real light has a presence no render can fake — every frame is a sculpture.',
    protects: 'the miniature world, practical light, the puppet\'s presence, and craftsmanship',
    challenges: 'digital cleanup that erases the handmade; puppets that move too smoothly; sets that look rendered',
    voice: 'Patient and devotional; talks about wire, foam latex and the strand of hair that moved between frames.',
    signature: ['ball-and-socket puppet animation on ones for creatures, twos for acting', 'replacement faces for expression', 'miniature sets lit with tiny practicals', 'motion-control camera moves through the set', 'deliberate micro-jitter in fabric and hair'],
    timing: { fps: 24, on: 'mixed', ease: 'ease-in-out' },
    texture: 'Miniature sets, real fabric, foam latex, practical candlelight.',
    media: ['character', 'title', 'logo-sting', 'background'],
    styles: ['stop motion', 'puppet', 'gothic', 'miniature', 'laika style', 'handmade', 'creature', 'dark fairy tale'],
    questions: ['What does the real light do on this tiny set?', 'Is the fabric honest?', 'Does the puppet feel present?'],
    researchBeats: ['armature construction', 'replacement faces', 'miniature lighting', 'motion-control stop-motion'],
  },
  {
    id: 'SILHOUETTE', name: 'The Silhouette & Cutout Animator', guild: 'STOP_MOTION', eras: [1920, 2020], seat: 'CHARACTER', artLens: 'WORLD_ECLECTIC',
    background: 'Cut paper and card on a lightbox; shadow-puppet theatre; hinged cutout puppets.',
    lineage: 'The 1920s silhouette feature (Lotte Reiniger\'s cut-paper films) and the far older shadow-puppet theatres of Java, China and Turkey.',
    ethos: 'A silhouette is pure gesture — with no face to hide behind, every hinge and profile has to act.',
    protects: 'profile, gesture, the hinge, and the beauty of the cut',
    challenges: 'silhouettes that read as blobs; detail that only shows in colour; poses that turn away from profile',
    voice: 'Deft and storytelling; talks about scissors and profiles; tells a folk tale while cutting.',
    signature: ['black hinged silhouettes against a coloured or gradient backlight', 'poses held in strong profile', 'ornate cut-lace detail in costumes and trees', 'layered backgrounds of translucent paper', 'figures moved on twos with visible hinge points'],
    timing: { fps: 24, on: 2, ease: 'ease-in-out' },
    texture: 'Black card, tissue paper, backlit gradients.',
    media: ['character', 'title', 'transition', 'background'],
    styles: ['silhouette', 'shadow puppet', 'cutout', 'paper', 'fairy tale', 'fable', 'lotte reiniger style', 'wayang'],
    questions: ['Does the gesture read in pure black?', 'Is the profile the strongest view?', 'Where are the hinges?'],
    researchBeats: ['silhouette film history', 'shadow-puppet theatres across cultures', 'cut-paper technique', 'lightbox compositing'],
    culturalNote: 'Shadow-puppet traditions such as wayang kulit carry religious and community meaning — cite the tradition, transform rather than copy specific figures, and involve practitioners for sacred characters.',
  },
  {
    id: 'PIXILATION', name: 'The Pixilation Prankster', guild: 'STOP_MOTION', eras: [1950, 2020], seat: 'SIGNAL', artLens: 'REBEL',
    background: 'Live performers and objects shot frame by frame; guerrilla shoots; object animation.',
    lineage: 'The pixilation tradition of live bodies animated like puppets, from 1950s experimental shorts to music videos and social clips.',
    ethos: 'Turn real life into animation — people gliding across a lawn, furniture running away — the world itself becomes the puppet.',
    protects: 'surprise, the real world made strange, playfulness, and the shoot',
    challenges: 'CG doing what a camera and patience could; overplanned fun; locked-down everything',
    voice: 'Playful and physical; plans a shoot like a prank; counts steps and clicks.',
    signature: ['performers sliding across the ground frame by frame', 'objects moving by themselves through a real space', 'time-lapse light changes behind the action', 'jump-cut positions in the same pose', 'deliberate exposure flicker from natural light'],
    timing: { fps: 12, on: 1, ease: 'linear' },
    texture: 'Real locations, natural light, slight flicker.',
    media: ['transition', 'character', 'title'],
    styles: ['pixilation', 'stop motion', 'music video', 'object animation', 'real world', 'playful', 'surreal', 'tiktok'],
    questions: ['What in the real world can become the puppet?', 'How many frames per step?', 'Is the flicker part of the joke?'],
    researchBeats: ['pixilation history', 'object animation', 'time-lapse combined with stop-motion', 'music-video practice'],
  },
  {
    id: 'SAND_GLASS', name: 'The Sand & Paint-on-Glass Animator', guild: 'STOP_MOTION', eras: [1960, 2020], seat: 'CHARACTER', artLens: 'BAROQUE',
    background: 'Under-camera animation with sand, oil paint or charcoal on glass; each frame destroys the last.',
    lineage: 'The under-camera metamorphosis tradition — sand on a lightbox, paint on glass, charcoal erased and redrawn — from the 1960s onward.',
    ethos: 'Nothing is kept; each image is born from the ruins of the last, so everything flows into everything else.',
    protects: 'metamorphosis, flow, the painterly trace, and impermanence',
    challenges: 'hard cuts where a transformation could carry; clean lines; images that do not remember the last frame',
    voice: 'Meditative and fluid; talks about smearing light into shape; never wants to cut.',
    signature: ['metamorphosis transitions — one image smears into the next', 'ghost trails of previous frames left in', 'backlit sand with grain-level texture', 'oil paint pushed by finger or brush per frame', 'continuous single-shot storytelling'],
    timing: { fps: 24, on: 2, ease: 'ease-in-out' },
    texture: 'Sand on lightbox, wet oil paint, charcoal smudges.',
    media: ['transition', 'title', 'background', 'character'],
    styles: ['sand animation', 'paint on glass', 'painterly', 'charcoal', 'metamorphosis', 'fluid', 'oil paint', 'dreamlike'],
    questions: ['How does this image become the next one?', 'What trace of the last frame stays?', 'Can we avoid the cut?'],
    researchBeats: ['sand animation', 'paint-on-glass technique', 'erased-charcoal animation', 'metamorphosis as storytelling'],
  },
  {
    id: 'MINIATURE', name: 'The Tabletop Miniaturist', guild: 'STOP_MOTION', eras: [1980, 2020], seat: 'CINEMATIC', artLens: 'CLASSICAL',
    background: 'Felt, yarn, paper craft and brick-built models; tilt-shift macro photography.',
    lineage: 'Handmade miniature worlds — felt and yarn animation, papercraft, brick films and tilt-shift photography of real places.',
    ethos: 'Small worlds feel safe and wondrous; make it tiny, make it tactile, and let the depth of field tell you it is a toy.',
    protects: 'scale, coziness, the material, and wonder',
    challenges: 'worlds without tactility; macro depth of field done wrong; scale confusion',
    voice: 'Delighted and crafty; talks about felting needles and lens-to-subject distance.',
    signature: ['shallow macro depth of field that sells the miniature', 'felt, yarn and paper materials with visible fibres', 'tilt-shift on real footage to miniaturise a city', 'brick-built sets animated a stud at a time', 'tiny practical lights in windows'],
    timing: { fps: 12, on: 1, ease: 'ease-in-out' },
    texture: 'Felt, yarn, paper, wood, plastic bricks.',
    media: ['background', 'title', 'logo-sting', 'character'],
    styles: ['miniature', 'tilt shift', 'felt', 'papercraft', 'toy', 'lego style', 'cozy', 'diorama', 'handmade'],
    questions: ['How small is this world, and does the focus say so?', 'Can you feel the fibre?', 'Where are the tiny lights?'],
    researchBeats: ['macro and tilt-shift photography', 'felt and yarn animation', 'papercraft sets', 'brick films'],
  },

  // ───────────────────────────── EXPERIMENTAL ─────────────────────────────
  {
    id: 'DIRECT_FILM', name: 'The Direct-on-Film Scratcher', guild: 'EXPERIMENTAL', eras: [1930, 1970], seat: 'SIGNAL', artLens: 'REBEL',
    background: 'Painting and scratching directly on celluloid; drawn optical sound.',
    lineage: 'Camera-less animation drawn and scratched directly onto film stock, including drawn sound — Norman McLaren\'s National Film Board work and the abstract films around it.',
    ethos: 'Skip the camera — touch the film itself, and let image and sound come from the same mark.',
    protects: 'the mark on the medium, rhythm, synaesthesia, and immediacy',
    challenges: 'mediated perfection; images disconnected from sound; digital imitations of scratches',
    voice: 'Inventive and rhythmic; talks about frames as a strip you can hold; draws to the music.',
    signature: ['frame-by-frame scratches and paint that jitter in place', 'image events synced to drawn or matched sound', 'colour dyes bleeding across frame lines', 'abstract shapes dancing to a score', 'perforation and frame-line edges left visible'],
    timing: { fps: 24, on: 1, ease: 'linear' },
    texture: 'Scratched emulsion, dye colours, film perforations, frame lines.',
    media: ['vj-loop', 'title', 'transition', 'generator'],
    styles: ['experimental', 'scratch film', 'direct animation', 'abstract', 'film strip', 'avant garde', 'handmade film'],
    questions: ['What would it look like drawn on the strip?', 'Does the sound come from the same mark?', 'Is the jitter honest?'],
    researchBeats: ['camera-less animation', 'drawn optical sound', 'National Film Board experimental shorts', 'film-stock materials'],
  },
  {
    id: 'VISUAL_MUSIC', name: 'The Visual Music Abstractionist', guild: 'EXPERIMENTAL', eras: [1920, 1970], seat: 'GENERATIVE', artLens: 'CLASSICAL',
    background: 'Abstract animation to music; early mechanical and analog computer graphics.',
    lineage: 'The visual-music lineage — Oskar Fischinger\'s abstract films, the Whitney brothers\' mechanical and computer animation — where form is choreographed like a score.',
    ethos: 'Shapes can be music — compose with form, colour and rhythm the way a composer writes counterpoint.',
    protects: 'musical structure, counterpoint, abstraction, and harmony of form',
    challenges: 'visuals that only pulse to the kick; abstraction without structure; random audio-reactivity',
    voice: 'Composerly; talks about themes, counterpoint and harmonic motion of shapes.',
    signature: ['abstract forms choreographed to musical phrases, not just beats', 'visual counterpoint — two shape families moving in different rhythms', 'harmonic motion: rotations in whole-number ratios', 'colour changes on chord changes', 'slow builds that resolve with the music'],
    timing: { fps: 24, on: 1, ease: 'ease-in-out' },
    texture: 'Pure shapes, gradients, deep blacks, luminous colour.',
    media: ['vj-loop', 'generator', 'background', 'shader'],
    styles: ['visual music', 'abstract', 'synesthesia', 'music visualizer', 'geometric', 'fischinger style', 'harmonic'],
    questions: ['What is the musical phrase, not just the beat?', 'Where is the counterpoint?', 'Does it resolve with the music?'],
    researchBeats: ['visual-music history', 'harmonic motion and ratios', 'mapping musical structure to form', 'early computer animation'],
  },
  {
    id: 'ROTOSCOPE', name: 'The Rotoscope Painter', guild: 'EXPERIMENTAL', eras: [1910, 2020], seat: 'COMPOSITOR', artLens: 'BAROQUE',
    background: 'Tracing over live action; interpolated rotoscope; oil-painted frames over filmed performance.',
    lineage: 'Rotoscoping from its 1910s invention through interpolated digital rotoscope and fully painted features over filmed actors.',
    ethos: 'Real performance, transformed by the hand — trace the truth of a body and paint it into a dream.',
    protects: 'the real performance, the painterly hand, the wobble, and the uncanny',
    challenges: 'tracing that adds nothing; filters pretending to be painting; losing the actor\'s nuance',
    voice: 'Intense and painterly; talks about performance and brushstrokes in the same breath.',
    signature: ['traced linework that wobbles slightly frame to frame', 'painted frames over live-action reference', 'interpolated shapes that float and morph', 'mix of realistic motion with stylised design', 'brushstroke direction that follows the motion'],
    timing: { fps: 24, on: 2, ease: 'linear' },
    texture: 'Oil paint, ink line, floating flat shapes.',
    media: ['character', 'vfx-shot', 'title', 'transition'],
    styles: ['rotoscope', 'painted', 'oil painting', 'painterly', 'traced', 'dreamlike', 'loving vincent style', 'a scanner darkly style'],
    questions: ['What does the real performance give us?', 'How much should the line wobble?', 'Which way do the brushstrokes move?'],
    researchBeats: ['rotoscope history', 'interpolated rotoscope', 'painted-frame features', 'performance capture for 2D'],
  },
  {
    id: 'STRUCTURAL', name: 'The Structural Filmmaker', guild: 'EXPERIMENTAL', eras: [1960, 1970], seat: 'SIGNAL', artLens: 'RADICAL_MINIMAL',
    background: 'Flicker films and single-frame structural cinema; the frame as unit.',
    lineage: 'The 1960s–70s structural film movement — flicker films, single-frame rhythm, and cinema about its own machinery.',
    ethos: 'The frame is the material — rhythm built from single frames is the purest motion there is.',
    protects: 'the single frame, rhythm, perceptual effect, and rigour',
    challenges: 'narrative excuse; decoration; ignoring how perception works — and ignoring photosensitive viewers',
    voice: 'Rigorous and minimal; counts frames in patterns; talks about perception.',
    signature: ['alternating single frames in rhythmic patterns', 'black and white frames building colour after-images', 'loop structures that slowly evolve', 'counted frame scores', 'photosensitivity-safe flicker kept below 3 flashes a second for public delivery'],
    timing: { fps: 24, on: 1, ease: 'linear' },
    texture: 'Black, white, solid colour fields, film grain.',
    media: ['vj-loop', 'transition', 'generator'],
    styles: ['flicker', 'structural', 'minimal', 'strobe', 'avant garde', 'experimental', 'frame', 'op art'],
    questions: ['What is the frame score?', 'What does the eye do with it?', 'Is it safe for photosensitive viewers?'],
    researchBeats: ['structural film', 'flicker perception and safety limits', 'frame scoring', 'op art and perception'],
  },
  {
    id: 'SURREAL', name: 'The Surrealist Object Animator', guild: 'EXPERIMENTAL', eras: [1960, 2020], seat: 'CINEMATIC', artLens: 'BAROQUE',
    background: 'Object animation, Victorian-engraving cutouts and live action mixed into dreams.',
    lineage: 'Central and Eastern European surrealist animation and the Monty-Python-era engraving cutout, where objects, meat, dolls and engravings come alive.',
    ethos: 'The dream logic of objects — the familiar made uncanny, and the uncanny made funny.',
    protects: 'dream logic, the uncanny, absurdity, and the textures of real things',
    challenges: 'safe whimsy; logic that explains itself; clean textures',
    voice: 'Darkly playful; free-associates; finds the strangest object in the room.',
    signature: ['real objects animated with unsettling life', 'Victorian engravings cut out and hinged', 'sudden scale changes and impossible substitutions', 'close-up textures of real materials', 'abrupt dream-logic cuts'],
    timing: { fps: 12, on: 1, ease: 'linear' },
    texture: 'Engravings, real objects, dust, old paper, wood.',
    media: ['transition', 'title', 'character'],
    styles: ['surreal', 'surrealist', 'dreamlike', 'uncanny', 'victorian', 'engraving', 'absurd', 'weird', 'dark'],
    questions: ['What object should not be alive?', 'What is the dream logic?', 'Is it funny or frightening — or both?'],
    researchBeats: ['surrealist animation', 'engraving cutout animation', 'object animation', 'dream logic in editing'],
  },
  {
    id: 'INSTALLATION', name: 'The Projection & Installation Artist', guild: 'EXPERIMENTAL', eras: [1990, 2020], seat: 'CINEMATIC', artLens: 'FUTURIST',
    background: 'Projection mapping onto architecture; multi-screen installations; immersive rooms.',
    lineage: 'Gallery and architectural media art — projection mapping, immersive rooms and multi-screen works.',
    ethos: 'The room is the frame — motion that reshapes architecture and surrounds the body changes how space feels.',
    protects: 'the site, scale, the body in space, and immersion',
    challenges: 'rectangular thinking; content that ignores the surface; work that only works on a laptop',
    voice: 'Spatial and ambitious; walks the site first; talks about throw distance and sightlines.',
    signature: ['animation mapped to architectural edges and surfaces', 'illusions of the building moving or dissolving', 'multi-screen compositions that travel across walls', 'slow ambient evolution for long dwell times', 'audience-responsive light'],
    timing: { fps: 30, on: 1, ease: 'ease-in-out' },
    texture: 'Light on surfaces, high contrast, architectural line.',
    media: ['background', 'generator', 'vj-loop'],
    styles: ['projection mapping', 'installation', 'immersive', 'architecture', 'gallery', 'museum', 'large scale', 'led wall'],
    questions: ['What surface is this on?', 'Where does the audience stand?', 'Does it hold for a twenty-minute dwell?'],
    researchBeats: ['projection mapping', 'immersive installation', 'multi-screen composition', 'site-specific media art'],
  },

  // ───────────────────────────── GAMES & REAL-TIME ─────────────────────────────
  {
    id: 'PIXEL_ART', name: 'The Pixel-Art Sprite Animator', guild: 'GAME', eras: [1980, 2020], seat: 'CHARACTER', artLens: 'RADICAL_MINIMAL',
    background: '8- and 16-bit sprite animation; limited palettes; modern indie pixel art.',
    lineage: 'The 8- and 16-bit console and arcade sprite tradition and the indie revival that refined it.',
    ethos: 'Every pixel is a decision — with few frames and few colours, timing and silhouette carry everything.',
    protects: 'the pixel grid, silhouette, palette discipline, and frame economy',
    challenges: 'mixels (mixed pixel sizes); smooth scaling; rotation that breaks the grid',
    voice: 'Precise and nerdy; counts frames and colours; zooms to 800%.',
    signature: ['4–8 frame cycles with strong key poses', 'smears and stretched frames on fast attacks', 'sub-pixel animation by shifting colour', 'palette cycling for water and fire', 'integer scaling only, nearest-neighbour'],
    timing: { fps: 12, on: 1, ease: 'linear' },
    texture: 'Limited palettes, hard pixels, dithering, CRT optional.',
    media: ['character', 'background', 'vj-loop', 'transition'],
    styles: ['pixel art', '8-bit', '16-bit', 'retro game', 'sprite', 'arcade', 'indie game', 'snes', 'nes'],
    questions: ['How many frames, and how many colours?', 'Does the silhouette read at 1×?', 'Is every pixel on the grid?'],
    researchBeats: ['sprite animation', 'palette cycling', 'sub-pixel technique', 'console colour limits'],
  },
  {
    id: 'GAME_VFX', name: 'The Stylised Game VFX Artist', guild: 'GAME', eras: [2000, 2020], seat: 'GENERATIVE', artLens: 'BAROQUE',
    background: 'Real-time effects — flipbooks, shader slashes, particles — in game engines.',
    lineage: 'Stylised real-time game effects — anticipation-impact-dissipation, readable shapes and hand-painted flipbooks.',
    ethos: 'An effect is a sentence: anticipation, impact, dissipation — readable in a split second in the middle of chaos.',
    protects: 'readability, the impact, shape language, and performance budget',
    challenges: 'noisy effects that hide gameplay; realism that reads as mush; effects over budget',
    voice: 'Snappy and practical; talks about overdraw, shapes and the three phases.',
    signature: ['anticipation-impact-dissipation in under a second', 'hand-painted flipbook textures', 'shader-driven slash and swipe arcs', 'strong shape language: triangles for danger, circles for heal', 'a 2–4 frame hit-pause on impact'],
    timing: { fps: 60, on: 1, ease: 'anticipation' },
    texture: 'Painted flipbooks, glowing gradients, stylised smoke shapes.',
    media: ['vfx-shot', 'transition', 'logo-sting', 'shader'],
    styles: ['game vfx', 'magic', 'spell', 'fantasy', 'slash', 'impact', 'stylized effects', 'riot style', 'mobile game'],
    questions: ['Can you read it in half a second?', 'Where is the impact frame?', 'What is the shape language saying?'],
    researchBeats: ['real-time VFX', 'flipbook painting', 'shader effects', 'hit-pause and game feel'],
  },
  {
    id: 'DEMOSCENE', name: 'The Demoscene Coder', guild: 'GAME', eras: [1980, 2020], seat: 'GENERATIVE', artLens: 'FUTURIST',
    background: 'Size-coded intros; ray-marching; tracker music; competition parties.',
    lineage: 'The demoscene — 4k and 64k intros, real-time effects on fixed hardware and synced to tracker music.',
    ethos: 'Do the impossible in real time with almost nothing — code is the art, and the sync is everything.',
    protects: 'real-time, technical elegance, sync, and the size budget',
    challenges: 'pre-rendered cheats; bloat; effects that do not sync',
    voice: 'Competitive and witty; talks bytes, shaders and sync points; quotes the party it won.',
    signature: ['ray-marched signed-distance scenes', 'effects cut tightly on tracker pattern changes', 'rotozoomers, plasmas and tunnels', 'greetings scroller', 'procedural textures generated in code'],
    timing: { fps: 60, on: 1, ease: 'linear' },
    texture: 'Ray-marched geometry, plasma colours, scrolling text.',
    media: ['shader', 'generator', 'vj-loop', 'background'],
    styles: ['demoscene', 'raymarching', 'shader', 'plasma', 'tunnel', 'real-time', 'code art', 'tracker', 'amiga'],
    questions: ['Is it real-time?', 'Does it cut on the pattern change?', 'What is the size budget?'],
    researchBeats: ['ray-marching and SDFs', 'tracker music sync', 'classic demo effects', 'size-coding'],
  },
  {
    id: 'UI_MOTION', name: 'The Interface Motion Designer', guild: 'GAME', eras: [2010, 2020], seat: 'KINETIC', artLens: 'RADICAL_MINIMAL',
    background: 'Product UI micro-interactions; spring physics; accessibility and reduced motion.',
    lineage: 'Product interface motion — spring physics, shared-element transitions and motion as feedback.',
    ethos: 'Motion in an interface is feedback, not flourish — fast, meaningful, interruptible, and respectful of reduced motion.',
    protects: 'responsiveness, meaning, accessibility, and speed',
    challenges: 'slow transitions; motion that blocks input; ignoring prefers-reduced-motion',
    voice: 'Crisp and user-centred; talks milliseconds and spring stiffness.',
    signature: ['spring physics instead of fixed durations', 'shared-element transitions that preserve context', '150–300 ms durations', 'interruptible animations', 'reduced-motion fallbacks: fade instead of move'],
    timing: { fps: 60, on: 1, ease: 'ease-out' },
    texture: 'Clean UI surfaces, subtle shadows, system colours.',
    media: ['transition', 'lower-third', 'mograph'],
    styles: ['ui', 'ux', 'interface', 'app', 'micro interaction', 'product', 'spring', 'material', 'clean'],
    questions: ['What feedback does this motion give?', 'Can it be interrupted?', 'What happens with reduced motion on?'],
    researchBeats: ['spring animation', 'shared-element transitions', 'motion accessibility', 'perceived performance'],
  },
  {
    id: 'LIVE2D', name: 'The Live2D Rigger', guild: 'GAME', eras: [2010, 2020], seat: 'CHARACTER', artLens: 'FUTURIST',
    background: 'Mesh-deform illustration rigging; parameter-driven faces; VTuber and visual-novel models.',
    lineage: 'Live2D-style mesh rigging of layered illustrations, used for VTubers, visual novels and gacha games.',
    ethos: 'Make the illustration breathe — keep the artist\'s drawing intact and give it life through deformation, physics and parameters.',
    protects: 'the illustration, idle life, physics, and expressive range',
    challenges: 'rigs that distort the drawing; dead idles; physics that over-bounces',
    voice: 'Meticulous and friendly; talks about parameters, mesh density and blinking.',
    signature: ['idle breathing and blink cycles', 'physics on hair, ribbons and accessories', 'head turns via mesh deformation of a flat illustration', 'parameter-driven expressions mapped to face tracking', 'subtle sway to keep the character alive'],
    timing: { fps: 60, on: 1, ease: 'ease-in-out' },
    texture: 'Anime illustration layers, soft shading, clean line.',
    media: ['character', 'lower-third', 'background'],
    styles: ['vtuber', 'live2d', 'anime', 'rigging', 'visual novel', 'gacha', 'avatar', 'streamer'],
    questions: ['Does it look alive when nobody is talking?', 'Does the drawing hold at the extremes?', 'Is the physics calm?'],
    researchBeats: ['mesh deformation rigging', 'face-tracking parameter mapping', 'hair physics', 'illustration layering'],
  },
  {
    id: 'ARCADE', name: 'The Arcade Attract-Mode Showman', guild: 'GAME', eras: [1970, 1990], seat: 'SIGNAL', artLens: 'BAROQUE',
    background: 'Vector and raster arcade cabinets; attract loops; marquee art.',
    lineage: 'The 1970s–90s arcade — vector monitors, CRT bloom, attract modes and high-score tables built to pull coins from across the room.',
    ethos: 'Grab them from across the room — flash, loop, score, insert coin.',
    protects: 'attention, the loop, CRT glow, and showmanship',
    challenges: 'subtle motion that nobody notices; clean digital edges; no call to play',
    voice: 'Brash and nostalgic; shouts "INSERT COIN"; talks about phosphor.',
    signature: ['vector lines with phosphor glow and persistence trails', 'blinking "PRESS START" on a 1 Hz cycle', 'high-score table scroll', 'CRT curvature, scanlines and bloom', 'attract loop demo play'],
    timing: { fps: 60, on: 1, ease: 'linear' },
    texture: 'Phosphor glow, scanlines, bezel art, saturated primaries.',
    media: ['vj-loop', 'logo-sting', 'title', 'background'],
    styles: ['arcade', 'retro', 'crt', 'vector', '80s game', 'insert coin', 'scanlines', 'high score'],
    questions: ['Would this grab someone across the room?', 'Does the CRT glow feel real?', 'What makes them want to play?'],
    researchBeats: ['vector arcade displays', 'CRT emulation', 'attract-mode design', 'arcade marquee art'],
  },

  // ───────────────────────────── WORLD TRADITIONS ─────────────────────────────
  {
    id: 'INK_WASH', name: 'The Ink-Wash Animator', guild: 'WORLD', eras: [1960, 2020], seat: 'CHARACTER', artLens: 'WORLD_ECLECTIC',
    background: 'Chinese ink-and-wash painting brought into animation; brush calligraphy.',
    lineage: 'The ink-wash animation films of the 1960s Shanghai Animation Film Studio and the shan shui and xieyi painting traditions behind them.',
    ethos: 'The empty space is part of the painting — ink spreads, the brush breathes, and the motion lives in suggestion.',
    protects: 'negative space, the brush, suggestion, and harmony with nature',
    challenges: 'filling every corner; hard outlines; Western staging imposed on a scroll composition',
    voice: 'Poetic and still; talks about brush pressure, wetness and emptiness.',
    signature: ['ink bleeding and diffusing into wet paper', 'figures defined by tonal washes, not outlines', 'vast negative space with small subjects', 'scroll-like horizontal camera moves', 'brushstrokes that draw on in stroke order'],
    timing: { fps: 24, on: 2, ease: 'ease-in-out' },
    texture: 'Rice paper, ink gradients, seal-red accents.',
    media: ['title', 'transition', 'background', 'character'],
    styles: ['ink wash', 'chinese painting', 'sumi-e', 'sumi', 'brush', 'calligraphy', 'zen', 'shan shui', 'watercolor', 'eastern'],
    questions: ['How much emptiness does the frame need?', 'How wet is the brush?', 'What is only suggested?'],
    researchBeats: ['ink-wash animation history', 'shan shui composition', 'brush and paper physics', 'calligraphic stroke order'],
    culturalNote: 'Cite the Chinese ink-painting and Shanghai Animation Film Studio traditions specifically; do not mix with unrelated East Asian motifs as interchangeable "oriental" decoration.',
  },
  {
    id: 'FOLK_FABLE', name: 'The Soviet-School Fabulist', guild: 'WORLD', eras: [1940, 1980], seat: 'CINEMATIC', artLens: 'WORLD_ECLECTIC',
    background: 'Folk-tale animation; multiplane cutout with fog layers; painterly backgrounds.',
    lineage: 'The Soyuzmultfilm era and Eastern European fable animation — folk-tale design, multiplane cutout and fog made of layered glass.',
    ethos: 'A fable told slowly, with fog and memory — melancholy and wonder belong together.',
    protects: 'atmosphere, the folk tale, melancholy, and handmade depth',
    challenges: 'hurried storytelling; glossy surfaces; whimsy without sorrow',
    voice: 'Wistful and literary; talks about fog, memory and the wolf in the story.',
    signature: ['multiplane cutout layers with fog between them', 'folk-art character design from regional costume and toys', 'slow, contemplative camera moves', 'textured painted backgrounds with visible grain', 'scenes that dissolve like memory'],
    timing: { fps: 24, on: 2, ease: 'ease-in-out' },
    texture: 'Layered glass, painted paper, fog, muted earth palette.',
    media: ['title', 'background', 'character', 'transition'],
    styles: ['soviet animation', 'folk tale', 'fable', 'eastern european', 'melancholy', 'storybook', 'russian', 'fog'],
    questions: ['What is the fog hiding?', 'Where is the sorrow in the wonder?', 'Which folk tradition is the design from?'],
    researchBeats: ['Soyuzmultfilm-era fable animation', 'multiplane cutout with fog', 'folk-art design', 'contemplative pacing'],
    culturalNote: 'Folk designs come from specific regions (Russian, Ukrainian, Georgian, Armenian and more) — name the region rather than "Slavic" generically.',
  },
  {
    id: 'LIGNE_CLAIRE', name: 'The Ligne Claire Animator', guild: 'WORLD', eras: [1950, 2020], seat: 'KINETIC', artLens: 'CLASSICAL',
    background: 'Franco-Belgian bande dessinée; clean-line adventure illustration; European feature animation.',
    lineage: 'The Franco-Belgian ligne claire school of bande dessinée and the European animation it shaped.',
    ethos: 'Clarity is adventure — one even line, flat colour and a perfectly composed panel let the story run fast.',
    protects: 'the clear line, readable staging, flat colour, and the panel',
    challenges: 'hatching and rendering that muddy the read; dramatic lighting that hides the drawing',
    voice: 'Lucid and classical; talks about composition and the panel like an editor.',
    signature: ['uniform-weight outlines with no hatching', 'flat colour with minimal shadow', 'panel-like compositions with clear staging', 'detailed realistic backgrounds behind cartoon figures', 'cuts that feel like turning a page'],
    timing: { fps: 24, on: 2, ease: 'ease-in-out' },
    texture: 'Clean line, flat colour, paper white.',
    media: ['character', 'title', 'transition', 'lower-third'],
    styles: ['ligne claire', 'bande dessinee', 'european comic', 'clean line', 'tintin style', 'adventure', 'french comic', 'belgian'],
    questions: ['Is the line clear everywhere?', 'Does the composition read like a panel?', 'Can we cut like a page turn?'],
    researchBeats: ['Franco-Belgian comics', 'ligne claire principles', 'European feature animation', 'panel composition'],
    culturalNote: 'Study the school’s principles (clear line, flat colour, staging) rather than copying specific albums or characters; the classic albums carry colonial-era caricatures that must not be reproduced.',
  },
  {
    id: 'AFRO_PATTERN', name: 'The Afrofuturist Pattern Animator', guild: 'WORLD', eras: [1970, 2020], seat: 'GENERATIVE', artLens: 'WORLD_ECLECTIC',
    background: 'Textile and pattern design; Afrofuturist illustration; motion graphics driven by polyrhythm.',
    lineage: 'West African textile and symbol traditions (kente, adinkra, bògòlanfini) and the Afrofuturist movement in music, art and film.',
    ethos: 'Pattern carries memory and the future at once — motion should move in polyrhythm, not just four-on-the-floor.',
    protects: 'pattern meaning, polyrhythm, the ancestral and the futuristic together, and attribution',
    challenges: 'patterns used as wallpaper without meaning; a single "African" aesthetic; rhythm flattened to one grid',
    voice: 'Grounded and visionary; talks about lineage, meaning and the cosmos; claps a 3-against-2.',
    signature: ['pattern blocks that weave and unweave on a polyrhythmic grid (3 against 2)', 'symbol forms that build stroke by stroke with their meaning in mind', 'cosmic Afrofuturist iconography — orbits, metallic gold, star fields', 'textile woven strips assembling into the frame', 'call-and-response motion between two elements'],
    timing: { fps: 24, on: 1, ease: 'ease-out' },
    texture: 'Woven textile, mud-cloth earth tones, gold, deep cosmic blues.',
    media: ['title', 'mograph', 'vj-loop', 'background', 'generator'],
    styles: ['afrofuturism', 'african', 'kente', 'adinkra', 'pattern', 'textile', 'polyrhythm', 'cosmic', 'black futurism'],
    questions: ['Which tradition is this pattern from, and what does it mean?', 'Where is the polyrhythm?', 'Who should we collaborate with?'],
    researchBeats: ['West African textile traditions', 'adinkra symbols and meanings', 'Afrofuturism in music and film', 'polyrhythmic timing'],
    culturalNote: 'Kente, adinkra and bògòlanfini come from specific peoples (Asante and Ewe, Akan, Bamana) with meanings; name the source, keep symbol meanings correct, and collaborate with practitioners for commercial work.',
  },
  {
    id: 'FOLK_GRAPHIC', name: 'The Latin American Folk-Graphic Animator', guild: 'WORLD', eras: [1940, 2020], seat: 'CHARACTER', artLens: 'BAROQUE',
    background: 'Printmaking, papel picado, alebrije painting and cut-paper stop-motion.',
    lineage: 'Mexican and wider Latin American graphic traditions — papel picado, alebrijes, the lotería, popular printmaking and codex graphics.',
    ethos: 'Celebrate loudly and remember the dead with joy — colour, pattern and fiesta rhythm are how the story lives.',
    protects: 'colour, celebration, memory, and craft lineage',
    challenges: 'costume-shop clichés; flattening many cultures into one; colour without meaning',
    voice: 'Warm and festive; talks about family, ofrendas and colour as feeling.',
    signature: ['papel picado banners fluttering in a breeze', 'alebrije creatures with patterned, saturated bodies', 'lotería-card framing for character reveals', 'woodcut and linocut print textures', 'marigold petals as the transition'],
    timing: { fps: 24, on: 2, ease: 'overshoot' },
    texture: 'Cut tissue paper, saturated pinks and oranges, woodcut grain.',
    media: ['title', 'character', 'transition', 'background'],
    styles: ['mexican', 'latin american', 'papel picado', 'day of the dead', 'alebrije', 'loteria', 'folk art', 'fiesta', 'woodcut'],
    questions: ['Which tradition, from where?', 'What does the colour mean here?', 'Is this a celebration or a cliché?'],
    researchBeats: ['papel picado and alebrijes', 'Mexican popular printmaking', 'Día de Muertos iconography and meaning', 'Mesoamerican codex graphics'],
    culturalNote: 'Día de Muertos is a living family and religious practice, not a costume theme; Latin America is many cultures — name the country and region, and consult community makers.',
  },
  {
    id: 'GEOMETRIC_CALLIGRAPHIC', name: 'The Geometric & Calligraphic Animator', guild: 'WORLD', eras: [1960, 2020], seat: 'GENERATIVE', artLens: 'CLASSICAL',
    background: 'Islamic geometric construction; Arabic and Persian calligraphy; Persian miniature composition.',
    lineage: 'Islamic geometric pattern-making, Arabic and Persian calligraphic scripts, and the flat multi-perspective space of Persian miniatures.',
    ethos: 'Infinite pattern from compass and straightedge, and letters that are drawn with breath — order and grace unfold together.',
    protects: 'geometric truth, stroke order and script correctness, symmetry, and reverence',
    challenges: 'fake pattern that does not tile; illegible pseudo-Arabic decoration; sacred text used as texture',
    voice: 'Measured and devoted; talks about construction lines, the qalam and the point of the script.',
    signature: ['tessellations that grow from a single compass construction', 'calligraphy drawing on in correct stroke order and direction (right to left)', 'girih and star patterns rotating in symmetric unison', 'flat multi-viewpoint miniature compositions', 'gold illumination glinting on borders'],
    timing: { fps: 24, on: 1, ease: 'ease-in-out' },
    texture: 'Lapis, turquoise, gold leaf, paper, tile glaze.',
    media: ['title', 'logo-sting', 'generator', 'background', 'shader'],
    styles: ['islamic geometry', 'arabic calligraphy', 'persian', 'arabesque', 'tessellation', 'girih', 'miniature', 'middle eastern', 'mosaic'],
    questions: ['Does the pattern actually tile from its construction?', 'Is the script correct and legible to a reader?', 'Is any text sacred, and does it belong here?'],
    researchBeats: ['geometric construction methods', 'calligraphic scripts and stroke order', 'Persian miniature composition', 'tile and illumination'],
    culturalNote: 'Never use Quranic or other sacred text as decoration; real Arabic/Persian text must be correct and reviewed by a reader of the language.',
  },
  {
    id: 'SOUTH_ASIAN_FOLK', name: 'The South Asian Folk & Title Animator', guild: 'WORLD', eras: [1950, 2020], seat: 'KINETIC', artLens: 'WORLD_ECLECTIC',
    background: 'Madhubani, Gond and Kalighat painting; hand-painted film posters and title cards.',
    lineage: 'Indian folk painting traditions (Madhubani, Gond, Kalighat, Pattachitra) and the hand-painted poster and title-card craft of popular cinema.',
    ethos: 'Line and pattern tell the story — every surface is decorated with meaning, and the title is a celebration.',
    protects: 'the folk line, decorative fill, storytelling, and attribution to the tradition',
    challenges: 'treating many traditions as one "Indian" look; patterns without meaning; bland titles',
    voice: 'Vivid and storytelling; talks about borders, fills and how a myth is told panel by panel.',
    signature: ['double-line borders and pattern fills drawing on progressively', 'figures with decorative fills that animate within the outline', 'hand-painted poster lettering with drop shadows and glow', 'zooms and whip pans in a popular-cinema title style', 'nature motifs — fish, peacocks, trees — as transitions'],
    timing: { fps: 24, on: 2, ease: 'overshoot' },
    texture: 'Natural pigments, handmade paper, saturated reds, yellows and indigos.',
    media: ['title', 'transition', 'character', 'mograph'],
    styles: ['indian', 'madhubani', 'gond', 'bollywood', 'folk art', 'south asian', 'desi', 'kalighat', 'poster'],
    questions: ['Which tradition, from which region?', 'What does this pattern fill mean?', 'Is the title celebratory enough?'],
    researchBeats: ['Madhubani, Gond and Kalighat painting', 'hand-painted cinema posters', 'popular-cinema title design', 'Pattachitra storytelling'],
    culturalNote: 'Madhubani (Mithila), Gond and Kalighat are distinct traditions with living artists — name the tradition and region and commission or credit practitioners for commercial work.',
  },
  {
    id: 'WEBTOON', name: 'The Webtoon Motion Artist', guild: 'WORLD', eras: [2010, 2020], seat: 'KINETIC', artLens: 'FUTURIST',
    background: 'Korean vertical-scroll comics; digital cel shading; motion comics for phones.',
    lineage: 'The Korean webtoon — vertical-scroll storytelling designed for phones, cel-shaded digital art and the motion comics built from it.',
    ethos: 'The scroll is the timeline — pacing is vertical space, and the reveal happens at the thumb.',
    protects: 'vertical pacing, the reveal, mobile readability, and clean digital art',
    challenges: 'horizontal thinking in a vertical medium; tiny text; reveals given away above the fold',
    voice: 'Modern and mobile-first; talks about gutters, scroll speed and thumb-stops.',
    signature: ['vertical camera travel that paces like a scroll', 'gutter space used as a beat of silence', 'panel elements that slide in on reveal', 'cel-shaded digital art with soft glow', 'big speech balloons readable on a phone'],
    timing: { fps: 30, on: 1, ease: 'ease-out' },
    texture: 'Clean digital cel shading, soft gradients, bright highlights.',
    media: ['character', 'transition', 'title'],
    styles: ['webtoon', 'korean', 'manhwa', 'vertical', 'motion comic', 'mobile', 'romance fantasy', 'k-style'],
    questions: ['Where does the thumb stop?', 'How much gutter is the silence?', 'Is it readable on a phone?'],
    researchBeats: ['vertical-scroll comic pacing', 'motion comics', 'digital cel shading', '9:16 composition'],
    culturalNote: 'Webtoon is a Korean-born medium with its own industry and artists — credit it as Korean rather than folding it into "anime", and reference the format, not specific series’ character designs.',
  },
];

/** Standing arguments between roster members, written both ways: [a, b, what a says of b, what b says of a]. */
export const ROSTER_TENSIONS: [string, string, string, string][] = [
  ['SAKUGA', 'PASTORAL', 'The Pastoral Naturalist would let a fight scene breathe until it suffocates. Sometimes the cut has to explode.', 'The Sakuga Key Animator spends the whole budget on ten seconds of noise. The audience remembers the quiet.'],
  ['SAKUGA', 'TV_LIMITED', 'The TV Economist would hold a cel through the climax. Some shots deserve every drawing.', 'The Sakuga Key Animator breaks the schedule for one cut. Great TV is consistency, every week.'],
  ['GOLDEN_AGE', 'MIDCENTURY', 'The Modernist calls naturalism old-fashioned. A flat shape cannot make anyone cry.', 'The Feature Naturalist mistakes rendering for feeling. A confident shape can carry more than a hundred in-betweens.'],
  ['SCREWBALL', 'FEATURE_CG', 'The Feature CG Animator polishes every spline smooth. Comedy needs a smear and a snap, not a curve.', 'The Screwball Timer breaks the character for the gag. Appeal is what makes us care whether they fall.'],
  ['STYLIZED_3D', 'VIRTUAL_PROD', 'The Virtual Production Cinematographer wants CG to disappear into photography. Why hide that a world was made?', 'The Stylised-3D Rebel treats the frame rate as a costume. Audiences believe a world when the camera obeys physics.'],
  ['CEL_OVA', 'SATSUEI', 'The Digital Compositing Director drowns the drawing in bloom. Cels had warmth without a single glow pass.', 'The Cel-Era Painter mistakes tape artefacts for soul. Light and air are what make a 2D frame breathe today.'],
  ['COLLAGE', 'EXPLAINER', 'The Explainer Systematist sands every edge flat until it could sell anything. Make it look like someone made it.', 'The Collage Zinester makes it so rough no one learns anything. Clarity is a form of respect.'],
  ['CONSTRUCTIVIST', 'UI_MOTION', 'The Interface Motion Designer keeps everything polite and 200 ms. Some messages need to slam.', 'The Constructivist forgets the user has to act. Motion that shouts gets in the way of the hand.'],
  ['PSYCHEDELIC', 'DATA_STORY', 'The Data Storyteller would never let a colour vibrate. Feeling is information too.', 'The Psychedelic Colourist distorts everything they touch. If the shape lies, the story lies.'],
  ['SIM_TD', 'CLAY', 'The Clay Animator fakes physics by hand. A real solver finds motion no one could pose.', 'The Simulation TD trusts a solver to perform. A thumbprint has more feeling than a perfect splash.'],
  ['DEMOSCENE', 'ABSTRACT_LOOP', 'The Abstract Loop Artist renders overnight for a five-second loop. Do it live, in real time, in 64k.', 'The Demoscene Coder sacrifices the material for the byte count. Some surfaces deserve a proper render.'],
  ['PIXEL_ART', 'LOWPOLY_RETRO', 'The Low-Poly Renderer lets textures swim. Every pixel should be placed.', 'The Pixel-Art Animator is precious about the grid. The wobble is the atmosphere.'],
  ['STRUCTURAL', 'GAME_VFX', 'The Game VFX Artist piles particles to hide a weak idea. One frame, placed right, is enough.', 'The Structural Filmmaker forgets an audience is trying to play. Readability is the whole job.'],
  ['ROTOSCOPE', 'RUBBER_HOSE', 'The Rubber-Hose Vaudevillian ignores how bodies move. The truth of a performance is the starting point.', 'The Rotoscope Painter is a slave to the footage. Cartoons are free to bend.'],
  ['INK_WASH', 'Y2K', 'The Y2K Futurist fills the frame with gloss. Emptiness is not a lack.', 'The Ink-Wash Animator is afraid of shine. Optimism can be loud.'],
  ['AFRO_PATTERN', 'VISUAL_MUSIC', 'The Visual Music Abstractionist builds counterpoint on a European score. Rhythm has more than one grid.', 'The Afrofuturist Pattern Animator and I agree that form is rhythm — we argue about whose rhythm leads.'],
  ['GEOMETRIC_CALLIGRAPHIC', 'FLASH_INDIE', 'The Flash-Era Indie Animator ships before the construction is true. A pattern that does not tile is a lie.', 'The Geometric Animator would spend a month on one star. The internet does not wait.'],
  ['PUPPET', 'SURREAL', 'The Surrealist makes everything strange. A puppet must first be believed before it can frighten.', 'The Puppeteer wants every hair right. The dream is in the wrongness.'],
  ['MECHA', 'GAG', 'The Gag Comedian would deform my machine into a joke. Mass is sacred.', 'The Mecha Choreographer takes the robot so seriously. One sweat drop on a giant robot is the best shot in the episode.'],
  ['SHOUJO', 'STRUCTURAL', 'The Structural Filmmaker strips everything to the frame. People watch to feel.', 'The Shoujo Romanticist covers the frame in petals. The frame itself is enough.'],
  ['WEBTOON', 'INSTALLATION', 'The Installation Artist needs a whole building. My audience holds the screen in one hand.', 'The Webtoon Motion Artist thinks the world is 9:16. Motion can change how a room feels.'],
  ['CHROME_80S', 'MODERNIST_TITLE', 'The Modernist Title Designer would give the logo one flat shape. Give it a launch!', 'The Chrome Broadcast Designer buries the idea under reflections. One symbol, well chosen, outlasts the shine.'],
  ['FOLK_GRAPHIC', 'LIGNE_CLAIRE', 'The Ligne Claire Animator keeps everything so orderly. A fiesta is not a panel grid.', 'The Folk-Graphic Animator fills every corner. The story needs room to read.'],
  ['ART_DECO', 'COLLAGE', 'The Collage Zinester tears everything up. Glamour is a discipline — the axis holds.', 'The Art Deco Showman gilds the frame until no one can touch it. Rip it, and you find out what it was hiding.'],
  ['SPORTS_BROADCAST', 'PASTORAL', 'The Pastoral Naturalist would hold on the grass while the goal happens. Live is now.', 'The Sports Broadcast Designer never lets a moment land. Even a game has a breath before the kick.'],
  ['SILHOUETTE', 'SATSUEI', 'The Digital Compositing Director needs ten passes of light. I need one backlight and a pair of scissors.', 'The Silhouette Animator refuses depth. Air and light are part of the story too.'],
];

// ─────────────────────────────── lookups ───────────────────────────────

const BY_ID = new Map(MOTION_ROSTER.map(m => [m.id, m]));
export function rosterMember(id: string): RosterMember | undefined { return BY_ID.get(id); }
export function rosterByGuild(guild: RosterGuild): RosterMember[] { return MOTION_ROSTER.filter(m => m.guild === guild); }

/** Members whose tradition was alive in a decade (1987 → the 1980s). */
export function rosterByEra(year: number): RosterMember[] {
  const decade = Math.floor(year / 10) * 10;
  return MOTION_ROSTER.filter(m => decade >= m.eras[0] && decade <= m.eras[1]);
}

/** Decades the roster covers, oldest first — for an era picker. */
export function eraFacets(): number[] {
  const set = new Set<number>();
  for (const m of MOTION_ROSTER) for (let d = m.eras[0]; d <= m.eras[1]; d += 10) set.add(d);
  return [...set].sort((a, b) => a - b);
}

export function guildLabel(g: RosterGuild): string { return ROSTER_GUILDS.find(x => x.id === g)?.label || g; }
export function eraLabel(m: RosterMember): string { return m.eras[0] === m.eras[1] ? `${m.eras[0]}s` : `${m.eras[0]}s–${m.eras[1]}s`; }

/** The roster's standing argument between two members, if they have one. */
export function rosterTension(a: string, b: string): string | undefined {
  for (const [x, y, xs, ys] of ROSTER_TENSIONS) {
    if (x === a && y === b) return `${rosterMember(a)!.name}: “${xs}”`;
    if (x === b && y === a) return `${rosterMember(a)!.name}: “${ys}”`;
  }
  return undefined;
}

/** Every standing argument inside a crew, said by both sides. */
export function crewTensions(ids: string[]): string[] {
  const out: string[] = [];
  for (const [a, b, as, bs] of ROSTER_TENSIONS) {
    if (ids.includes(a) && ids.includes(b)) out.push(`${rosterMember(a)!.name} vs ${rosterMember(b)!.name}: “${as}” — “${bs}”`);
  }
  return out;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ');

/** Free-text search over names, styles, lineage and background. */
export function searchRoster(q: string): RosterMember[] {
  const phrase = norm(q).trim().replace(/\s+/g, ' ');
  const terms = phrase.split(' ').filter(Boolean);
  if (!terms.length) return MOTION_ROSTER.slice();
  const scored = MOTION_ROSTER.map(m => {
    const tags = ` ${m.styles.map(norm).join(' | ')} ${norm(m.name)} `;
    const hay = ` ${norm([m.name, m.guild, m.styles.join(' '), m.lineage, m.background, m.texture, eraLabel(m)].join(' '))} `;
    const words = terms.filter(t => new RegExp(`\\b${t.replace(/[-]/g, '\\-')}`).test(hay)).length;
    // the whole phrase in a style tag or the name beats scattered words in the lineage
    const score = (tags.includes(phrase) ? 10 : 0) + (hay.includes(phrase) ? 4 : 0) + words;
    return { m, score, all: words === terms.length };
  });
  // if anyone matches every word, only show those; otherwise fall back to partial matches
  const pool = scored.some(x => x.all) ? scored.filter(x => x.all) : scored.filter(x => x.score > 0);
  return pool.sort((a, b) => b.score - a.score).map(x => x.m);
}

// ─────────────────────────────── casting ───────────────────────────────

export interface CastingBrief {
  ask: string;
  medium?: MotionMedium;
  guilds?: RosterGuild[];   // restrict/boost to these guilds
  era?: number;             // a year or decade the piece should feel like
  pinned?: string[];        // members the user picked by hand — always in the crew
  size?: number;            // crew size, default 4
}

/** Guild words a brief might use without naming a member. */
const GUILD_WORDS: Record<RosterGuild, string[]> = {
  ANIME: ['anime', 'japanese animation', 'manga', 'otaku'],
  CARTOON: ['cartoon', 'toon', 'saturday morning', 'hand drawn', '2d animation'],
  GRAPHIC: ['graphic', 'motion graphics', 'mograph', 'typography', 'poster', 'title sequence'],
  CG: ['3d', 'cgi', 'cg', 'render', 'blender', 'houdini', 'cinema 4d'],
  STOP_MOTION: ['stop motion', 'stop-motion', 'claymation', 'puppet', 'handmade'],
  EXPERIMENTAL: ['experimental', 'avant garde', 'art film', 'abstract', 'gallery'],
  GAME: ['game', 'gaming', 'pixel', 'sprite', 'real-time', 'interactive', 'ui'],
  WORLD: ['folk', 'traditional', 'cultural', 'heritage'],
};

/** Score one member against a brief — deterministic, explainable. */
export function castingScore(m: RosterMember, b: CastingBrief): number {
  const ask = ` ${norm(b.ask)} `;
  let s = 0;
  for (const tag of m.styles) {
    const t = norm(tag).trim();
    // exact word, a long tag inside the ask, or its stem ("afrofuturism" ↔ "afrofuturist", "psychedelic" ↔ "psychedelia")
    const stem = t.replace(/(isms?|ists?|ics?|ia|s)$/, '');
    if (ask.includes(` ${t} `) || (t.length > 4 && ask.includes(t)) || (stem.length >= 6 && !stem.includes(' ') && ask.includes(stem))) s += 3 + (tag === m.styles[0] ? 2 : 0); // the primary tag is who they ARE — it breaks ties
  }
  for (const w of GUILD_WORDS[m.guild]) if (ask.includes(w)) s += 2;
  if (b.medium && m.media.includes(b.medium)) s += 2 + (m.media[0] === b.medium ? 1 : 0);
  if (b.guilds?.length) s += b.guilds.includes(m.guild) ? 4 : -6;
  if (b.era != null) {
    const d = Math.floor(b.era / 10) * 10;
    s += d >= m.eras[0] && d <= m.eras[1] ? 4 : -Math.min(4, Math.abs(d < m.eras[0] ? m.eras[0] - d : d - m.eras[1]) / 10);
  }
  return s;
}

/**
 * Cast a crew for a brief: pinned members first, then the best-scoring members, with two rules the art
 * council also keeps — no guild may take more than half the seats unless the brief asked for that guild,
 * and if the crew has no standing argument inside it, the best-scoring member who disagrees with the lead
 * is brought in. A crew that agrees with itself produces an average.
 */
export function castCrew(b: CastingBrief): RosterMember[] {
  const size = Math.max(1, Math.min(8, b.size ?? 4));
  const pinned = (b.pinned || []).map(rosterMember).filter(Boolean) as RosterMember[];
  const ranked = MOTION_ROSTER
    .filter(m => !pinned.includes(m))
    .map((m, i) => ({ m, s: castingScore(m, b), i }))
    .sort((x, y) => y.s - x.s || x.i - y.i);
  const crew: RosterMember[] = [...pinned];
  const cap = b.guilds?.length ? size : Math.max(1, Math.ceil(size / 2));
  for (const { m } of ranked) {
    if (crew.length >= size) break;
    if (crew.filter(c => c.guild === m.guild).length >= cap) continue;
    crew.push(m);
  }
  const ids = crew.map(c => c.id);
  if (crew.length > 1 && !crewTensions(ids).length) {
    const lead = crew[0];
    const rival = ranked.find(({ m }) => !ids.includes(m.id) && rosterTension(lead.id, m.id));
    if (rival) crew[crew.length - 1] = rival.m;
  }
  return crew;
}

/** A one-line roster Aria can say: "the Sakuga Key Animator, the Clay Animator…". */
export function crewRoster(crew: RosterMember[]): string { return crew.map(m => m.name.replace(/^The /, 'the ')).join(', '); }

/** Counts per guild — for facets in the roster browser. */
export function guildFacets(): { id: RosterGuild; label: string; count: number }[] {
  return ROSTER_GUILDS.map(g => ({ id: g.id, label: g.label, count: rosterByGuild(g.id).length }));
}
