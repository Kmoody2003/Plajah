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

const L01 = 'lighting-design.l01';
const L02 = 'lighting-design.l02';
const L03 = 'lighting-design.l03';
const L04 = 'lighting-design.l04';
const L05 = 'lighting-design.l05';
const L06 = 'lighting-design.l06';
const L07 = 'lighting-design.l07';
const L08 = 'lighting-design.l08';
const L09 = 'lighting-design.l09';
const L10 = 'lighting-design.l10';
const L11 = 'lighting-design.l11';
const L12 = 'lighting-design.l12';
const L13 = 'lighting-design.l13';
const L14 = 'lighting-design.l14';
const L15 = 'lighting-design.l15';
const L16 = 'lighting-design.l16';
const L17 = 'lighting-design.l17';
const L18 = 'lighting-design.l18';
const L19 = 'lighting-design.l19';
const L20 = 'lighting-design.l20';

export const COURSE_MODULE: CourseModule = {
  curriculum: {
    id: 'lighting-design',
    label: 'Lighting Design',
    blurb: 'How light behaves, how to shape it with instruments, gels and control, and how designers use it for photo, film, stage, live events and architecture.',
    accent: '#FFB000',
    framework: 'ncas',
    tracks: [
      {
        id: 'lighting-design.t1',
        title: 'How Light Behaves',
        blurb: 'The physics of light, and the four qualities every lighting choice comes down to: distance, softness, direction and colour.',
        level: 'FOUNDATION',
        lessons: [
          {
            id: L01,
            title: 'The Physics of Light and the Inverse Square Law',
            blurb: 'Light travels in straight lines and spreads out, so doubling the distance from a lamp cuts the light on a surface to a quarter.',
            minutes: 6,
            body: `Light is a form of electromagnetic radiation, the same family as radio waves and X-rays. Our eyes respond to only a narrow band of it, with wavelengths of roughly 380 to 750 nanometres. In everyday lighting work, light can be treated as travelling in straight lines from its source until it meets something. At a surface it can be reflected, absorbed or transmitted, and often all three at once. A white wall reflects most of the light that lands on it, a black cloth absorbs most, and a window transmits most.

Brightness on a surface is called illuminance. It is measured in lux (lumens per square metre) or in foot-candles, the older unit still common in the United States. A lighting designer mostly cares about how illuminance changes as a lamp moves.

Here is the key rule. Light spreads outward from a small source, so the same amount of light covers a larger and larger area as it travels. The area grows with the square of the distance, so the illuminance falls with the square of the distance. This is the inverse square law. It holds closely for a small source in open space.

Worked example: a small lamp lights a table at 1 metre and gives 400 lux. At 2 metres the light covers four times the area, so the table receives about 100 lux. At 4 metres it receives about 25 lux. Moving the lamp closer has the opposite, dramatic effect.

Photographers count brightness in stops, where one stop is a doubling or halving of light. Doubling the distance costs two stops.`,
          },
          {
            id: L02,
            title: 'Quality of Light: Hard and Soft',
            blurb: 'Whether shadows have crisp or gentle edges depends on how large the light source looks from the subject.',
            minutes: 6,
            body: `Lighting people talk about the quality of light, meaning how its shadows look. Hard light makes dark shadows with sharp edges. Soft light makes shadows with gradual, feathered edges, and often barely visible ones. Neither is better. Hard light shows texture and drama; soft light is gentle and forgiving on skin.

What decides the quality is the apparent size of the source as seen from the subject. A small source, such as a bare bulb or a small spotlight, lights each point on the subject from nearly the same direction, so shadow edges are crisp. A large source, such as a big window or a softbox, lights each point from many directions at once. The edge of a shadow is then partly lit and partly dark, which looks soft.

The word that matters is apparent. The sun is enormously large, but it appears as a small disc in the sky, so on a clear day it casts hard shadows. On an overcast day, the clouds scatter the sunlight and the whole sky acts as one huge source, which is why shadows nearly disappear.

Two practical levers follow. Moving a source closer to the subject makes it appear larger, so it gets softer. Placing diffusion material, such as a white sheet or a frosted panel, in front of a small lamp makes a bigger glowing surface, which also softens it.

Worked example: a portrait with a small lamp three metres away shows a sharp nose shadow. Replacing it with a softbox half a metre away turns that shadow into a soft gradient.`,
          },
          {
            id: L03,
            title: 'Direction: Where the Light Comes From',
            blurb: 'The angle of a light relative to the subject and camera decides which forms and textures are revealed or hidden.',
            minutes: 6,
            body: `Direction is where the light comes from relative to the subject and to the camera. Because shadows fall away from the source, direction controls what the viewer sees: the shape of a face, the roughness of a wall, the depth in a scene.

Front light comes from near the camera. It fills in shadows that the camera can see, so a face looks even and flat, with little sense of depth. Side light comes from ninety degrees to the camera axis. It lights one half and leaves the other dark, and it rakes across surfaces, revealing texture such as skin pores, fabric weave or brick. Top light comes from overhead and shadows the eye sockets and under the nose and chin. Back light comes from behind the subject toward the camera and traces an outline of bright edge, helping to separate the subject from the background. Under light, from below, is rare in nature, and because we are used to being lit from above it can look eerie, which is why it appears in horror stories.

A common starting point for a person is a key light about 45 degrees to one side and somewhat above eye level. This produces a small triangle of light on the cheek on the shadow side, a look often called Rembrandt lighting after the painter's portraits.

Worked example: photograph a stone wall with the light head-on and it looks flat. Move the same lamp to the side, close to the wall, and every bump casts a shadow, and the surface comes alive.`,
          },
          {
            id: L04,
            title: 'Colour Temperature (Kelvin) and CRI',
            blurb: 'Kelvin describes how warm or cool a white light looks, and CRI describes how faithfully it shows colours.',
            minutes: 7,
            body: `Not all white light is the same white. Candle flames and old incandescent bulbs look orange-ish, while an overcast sky looks bluish. Lighting people describe this with colour temperature, measured in kelvins (K). The scale is based on the colour of an idealised glowing object heated to that temperature. The surprise for beginners is that lower numbers look warmer and higher numbers look cooler, which is the reverse of how we use hot and cold.

Typical reference values:
- household warm bulbs are about 2700 K
- film and studio tungsten lamps are usually rated at 3200 K
- daylight-balanced film and photographic lights are rated around 5600 K
- a hazy or shaded sky can be 7000 K or more.

Real daylight changes through the day and with the weather, so these are conventions, not constants.

A camera or the human brain adapts to one white. If two different colour temperatures appear in the same scene, the mismatch shows. Set a camera to daylight, and tungsten lamps in the same frame glow orange. Designers either match sources to one value or mix them on purpose, for example a warm lamp against cool window light.

A second measure is the colour rendering index, or CRI. It is a scale up to 100 that compares how naturally a light shows a set of test colours against a reference source. A low-CRI light can make skin and clothing look dull or oddly tinted even if its Kelvin value looks right. For skin tones and products, higher CRI is generally better.`,
          },
        ],
      },
      {
        id: 'lighting-design.t2',
        title: 'Instruments, Control and Filters',
        blurb: 'The tools that make and shape light: lamps and fixtures, the controls that change them, and the gels and diffusion that colour and soften them.',
        level: 'FOUNDATION',
        lessons: [
          {
            id: L05,
            title: 'Fresnel and Ellipsoidal Instruments',
            blurb: 'The Fresnel gives a soft-edged adjustable wash, while the ellipsoidal gives a sharp, shapeable beam.',
            minutes: 7,
            body: `Two classic fixtures appear in nearly every theatre, film set and studio. They are named for how they are built, and the build decides how the light behaves.

The Fresnel has a lens made of concentric stepped rings instead of a thick curve. That design is named for Augustin-Jean Fresnel, the French physicist who developed it in the 1820s for lighthouses. Inside the housing, the lamp and a curved reflector slide together as one unit toward or away from the lens. Moving them close to the lens gives a wide, flooded beam; moving them back gives a narrower, brighter spot. The beam has a soft edge that blends easily with neighbouring lights, and metal flaps called barn doors can be added to trim it. Fresnels are common for washes of light and for key and fill on film sets.

The ellipsoidal reflector spotlight, often called a profile or by the brand name Leko, uses an elliptical reflector that gathers light and focuses it through a gate, where adjustable metal shutters cut the beam to a sharp shape, then through lenses in a barrel. Slide a metal or glass pattern called a gobo into the gate and the fixture projects that pattern, such as window panes or leaves. Focusing the lens can sharpen or soften the edge.

Worked example: to light a stage floor with a crisp square pool of light, use an ellipsoidal and shutter it. To wash an actor with a gentle blend of light, use a Fresnel.`,
          },
          {
            id: L06,
            title: 'LEDs, Softboxes and Practicals',
            blurb: 'LED fixtures, softboxes and practical lamps each solve different problems of efficiency, softness and realism.',
            minutes: 7,
            body: `Modern lighting uses many more fixture types than the two classics. Three are worth knowing early.

LED fixtures make light with light-emitting diodes. Compared with tungsten lamps, they typically produce much more light for the electricity they draw, run cooler, and can often change colour at the touch of a control. Many can mix red, green and blue, or additional colours, to create nearly any hue and a range of white. They are not all equal, though. Cheaper units may have a lower CRI, a green or magenta tint, or flicker on camera when they are dimmed. Checking the specifications and doing a test shot are good habits.

A softbox is a fabric-sided enclosure that fits around a lamp, with a white diffusion panel across the front. The glowing panel becomes the source, so a small lamp is turned into a larger, softer one. Photographers use softboxes for portraits and products, and they can often be fitted with an internal grid that limits spill.

A practical is a working light that appears in the shot, such as a table lamp, a street light or a neon sign. Practicals add realism because the audience sees where the light comes from. But a household bulb is usually too dim to expose a scene properly, so crews often fit a stronger bulb or add a hidden light that matches the practical's position and colour.

Worked example: a bedroom scene lit by a bedside lamp might use a small hidden LED near the lamp to supply the glow the viewer expects.`,
          },
          {
            id: L07,
            title: 'Control Basics: Dimmers and DMX',
            blurb: 'Dimmers change how bright a light is, and DMX is the digital language that lets a console control many fixtures at once.',
            minutes: 7,
            body: `A single switch gives you only on or off. Lighting design needs gradual change, so fixtures are controlled through dimmers. A dimmer adjusts the power delivered to a lamp, making it brighter or dimmer. A tungsten lamp also becomes warmer in colour as it dims, which is natural and often welcome. Many LED fixtures have built-in dimming electronics instead, and these generally keep their colour as they dim.

To control dozens of fixtures from one place, designers use a lighting console and a data signal. The most widely used standard is DMX512, developed in the 1980s. A single DMX line, called a universe, carries 512 channels. Each channel holds a number from 0 to 255 that the receiving device reads as an instruction. For a simple dimmer, 0 means off and 255 means full. A moving light or colour-mixing LED needs several channels for each fixture: one for brightness, others for colour, position, gobo and so on.

The console is where lighting states are built and stored. Each stored state is a cue, and the console can fade between them over a chosen time. This is how a theatre show can repeat the same lighting changes at every performance. Large systems may use more than one universe, and the same ideas carry over to networked versions of the signal.

Worked example: a small show has twelve dimmers, each on one channel. The operator sets channels 1 to 6 to full and 7 to 12 to half, stores that as cue 1, and the console recreates it exactly each night.`,
          },
          {
            id: L08,
            title: 'Working with Gels and Diffusion',
            blurb: 'Gels change the colour of light and diffusion softens it, but both absorb some of the light.',
            minutes: 7,
            body: `Filters let you reshape the light from any fixture. Two families do most of the work: gels and diffusion.

A gel is a thin sheet of coloured, heat-resistant polymer placed in front of a lamp. Colour-effect gels create colours such as deep blue or amber for mood. Colour-correction gels shift the colour temperature of a source. Colour temperature orange, or CTO, warms a daylight-balanced light so it matches tungsten lamps. Colour temperature blue, or CTB, does the opposite. Colour-correction gels are sold in strengths, such as full, half and quarter. A third type, neutral density or ND, reduces brightness without changing colour.

Every gel works by absorbing the wavelengths it does not pass, so it always costs light. A deep saturated colour absorbs a lot, while a pale tint absorbs little. The absorbed energy turns into heat, which is why you should use gels made for the fixture's heat and keep them clear of hot lamps unless they are rated for it.

Diffusion materials, such as frosted sheets and fabrics, scatter the light. Because the diffusing sheet becomes a larger glowing surface, the light becomes softer, as you saw in the lesson on quality. Diffusion also lowers brightness. Heavier diffusion softens more and absorbs more.

Worked example: a window lets in cool daylight while the room has tungsten lamps. Covering the window with CTO makes both sources look the same colour, so the camera needs only one white setting.`,
          },
        ],
      },
      {
        id: 'lighting-design.t3',
        title: 'Lighting for Photo and Film',
        blurb: 'From the classic three-point setup to ratios, motivated lighting, portraits and product work.',
        level: 'INTERMEDIATE',
        lessons: [
          {
            id: L09,
            title: 'Three-Point Lighting',
            blurb: 'A key, a fill and a back light give a subject shape, detail and separation from the background.',
            minutes: 7,
            body: `Three-point lighting is the standard starting recipe for lighting a person on camera. It uses three roles, not necessarily three identical lamps.

The key light is the main source. It establishes the direction of the light and most of the exposure. It is usually placed to one side of the camera and above eye level, often around 45 degrees to the camera-subject line. Because it comes from the side, it models the face with light and shadow.

The fill light is placed on the opposite side, usually near the camera. Its job is to lift the shadows the key creates so detail is not lost. It is generally softer and dimmer than the key. The brighter the fill is relative to the key, the lower the contrast. Turn it off and the shadow side becomes dark; set it close to the key's level and the picture looks flat.

The back light, also called a hair light or rim light, sits behind the subject, usually above and pointing toward the camera. It draws a thin bright edge around the head and shoulders. That edge separates the subject from the background and adds a sense of depth.

Worked example: for an interview, set the key to the left of the camera, a soft fill to the right at lower power, and a small lamp behind and above, aimed at the shoulders. Then adjust the fill until the shadows on the face show detail but still keep some shape.

Three-point is a foundation. Real scenes often need more or fewer lights.`,
          },
          {
            id: L10,
            title: 'Beyond Three-Point: Ratios, Negative Fill and Key Styles',
            blurb: 'Contrast is set by the ratio between lit and shadowed sides, and extra tools refine it.',
            minutes: 8,
            body: `Once a basic setup works, designers control contrast with a lighting ratio, which compares the light on the brightest side of a subject to the light on the shadow side. Conventions for writing it vary, so always check which one is meant. A common reading is that a ratio of 2:1 means the lit side receives twice the light of the shadow side, one stop of difference, and 4:1 means two stops. A larger ratio looks more dramatic.

Raising contrast does not always mean more lights. Negative fill does it by subtraction: a large black flag or fabric is placed beside the subject on the shadow side, so it absorbs light that would otherwise bounce back from walls and fill the shadow. The shadow side then goes deeper without any change to the key.

Extra lights each have a job. A background light brightens or shapes the backdrop so the subject does not vanish into it. A kicker is a back-side light that catches the cheek or shoulder. An eye light adds a small sparkle to the eyes.

Designers also speak of key styles. High-key lighting is bright, with low ratios and few deep shadows, and it feels open and cheerful, common in comedies and commercials. Low-key lighting has a high ratio and large dark areas, and it is used to feel tense, serious or mysterious.

Worked example: a crime-drama interview needs more shadow. Rather than dimming the fill, you place a black flag to the fill side of the subject and the ratio rises.`,
          },
          {
            id: L11,
            title: 'Motivated Lighting',
            blurb: 'Motivated lighting makes the light in a scene appear to come from a believable source in that world.',
            minutes: 7,
            body: `Motivated lighting means that the light in a scene seems to come from something the audience can believe in: a window, a lamp, a fire, a screen, the sun. The word motivation here is borrowed from acting. A light has a reason to be there.

The motivating source does not need to be visible. A character may sit in a dim room, lit softly from the left with a cool glow. The audience assumes a window just out of frame. What matters is that the direction, quality and colour of the light agree with the source we believe in. A hard, warm beam falling diagonally suggests low sunshine; a soft, blue-white glow from below suggests a screen.

Crews usually do not use the real source to light the scene, because a lamp or a window is rarely strong or controllable enough. Instead they place stronger fixtures outside the window or beside the practical, aimed to match its direction. A big light outside a window can imitate sun and be adjusted when clouds move.

Motivated does not mean plain or documentary. A designer can stylise the motivation, pushing colours to a more vivid blue or amber. The test is consistency, not realism. Lighting that has no apparent source, such as a hard light from below in a sunny kitchen, can feel odd, unless oddness is the goal.

Worked example: a scene has a character reading at a desk with a lamp. The key is a soft light placed just above the lamp's position and gelled warm, so it matches the lamp's glow.`,
          },
          {
            id: L12,
            title: 'Studio Portraits',
            blurb: 'Portrait lighting patterns such as loop, Rembrandt, butterfly and clamshell sculpt a face in predictable ways.',
            minutes: 8,
            body: `Portrait photographers use a handful of named patterns, each defined by where the key sits and where the shadows fall.

Loop lighting places the key slightly above eye level and about 30 to 45 degrees off to one side, creating a small shadow of the nose that loops toward the cheek without touching it. Rembrandt lighting moves the key a little further around and higher, so the shadow of the nose and cheek joins, leaving a small triangle of light on the shadow-side cheek. Butterfly lighting, or Paramount, places the key high and straight in front, above the lens axis, giving a butterfly-shaped shadow under the nose. Clamshell uses a key above and a reflector or low fill below, framing the face like the two halves of a shell. It gives smooth, even light often used for beauty work.

Subject orientation matters as well. In short lighting, the key lights the side of the face turned away from the camera, which tends to slim the face. In broad lighting, the key lights the side turned toward the camera.

A large soft source close to the subject, such as a softbox, gives smooth skin transitions. A small hard source emphasises skin texture. Catchlights, the small bright reflections of the source in the eyes, add life; their shape shows the source's shape.

Worked example: to flatter a round face, turn the face slightly from the camera, use short lighting with a softbox close to the key position, and add a low reflector for gentle fill.`,
          },
          {
            id: L13,
            title: 'Lighting Products',
            blurb: 'Product photography is largely about controlling reflections, so the angle and size of the light matter more than its power.',
            minutes: 7,
            body: `With a person, you light the skin. With a product, you often light the reflections. Shiny objects, such as glass, metal, and glossy plastic, mirror their surroundings, so the viewer sees reflected light sources more than the object's own surface. The basic rule is the law of reflection: light bounces off a smooth surface at the same angle at which it arrived, measured from the surface's perpendicular. If the reflected path goes into the lens, you see the source.

For a glossy item, the solution is usually a large, soft source. Its reflection becomes a smooth gradient of brightness along the surface, which describes the shape. A small source would create a hard, distracting hot spot. Designers also use black cards to define edges: a dark reflection along the side of a bottle makes the outline look crisp. White cards add soft highlights, and the angle of the item can be changed to move a reflection out of the camera's view.

For matte or textured products such as fabric, wood or food, the aim is different. Light from the side or just behind, or in a raking direction, brings out texture. A light tent, a translucent cube around the product, wraps it in diffused light and helps with small shiny items.

Worked example: photographing a steel water bottle, you place a large softbox to one side and a black card on the other. The bottle shows one long bright band and one dark edge. It looks rounded and clean, without a mirror image of the studio.`,
          },
        ],
      },
      {
        id: 'lighting-design.t4',
        title: 'Safety and History',
        blurb: 'How to work safely with electricity, heat and heights, and how lighting grew from flames to electronics.',
        level: 'INTERMEDIATE',
        lessons: [
          {
            id: L14,
            title: 'Safety: Electrical, Heat and Rigging at Overview',
            blurb: 'Most lighting accidents come from overloaded circuits, hot lamps and unsecured equipment.',
            minutes: 7,
            body: `Lighting equipment uses real power, creates real heat and is often hung overhead, so safety is part of the craft. This lesson is an overview. Real jobs require training, supervision and the rules of the venue and the local authorities.

Electrical safety starts with arithmetic. Power in watts equals volts times amps. In North America, a lamp of 1200 watts on a 120-volt supply draws about 10 amps. A typical household circuit is often rated for 15 amps, and designers generally avoid loading a circuit near its limit. Always add up the load before plugging in, use cables that are in good condition and rated for the job, and keep connections out of water. Outdoors or in damp locations, use equipment suited to those conditions, such as outlets with ground-fault protection.

Heat is the next hazard. Tungsten and halogen lamps get very hot. Keep them away from fabric, paper and people, and allow fixtures to cool before handling or storing them. Never touch a halogen bulb with bare fingers, since skin oils can cause it to fail. Use heat-resistant gloves when adjusting hot fixtures.

Rigging means hanging or supporting equipment. Stands should be on stable ground and weighted with sandbags. Hung fixtures need clamps in good condition and a secondary safety cable. Never exceed the rated load of a stand, a clamp or a structure. Working at height requires training and fall protection.

Flashing or strobing effects can affect people with photosensitive conditions, so audiences are normally warned.`,
          },
          {
            id: L15,
            title: 'A Short History: From Flame to LED',
            blurb: 'Stage and screen lighting moved from candles and gas to limelight, arc and incandescent lamps, and then to modern electronics.',
            minutes: 7,
            body: `Before electricity, performances relied on candles and oil lamps. Early theatres were lit with them, and light was mostly general: you lit the whole room and the stage together. Flame brings real dangers, and theatre fires were an ongoing problem.

In the early nineteenth century, gas lighting arrived in theatres. A central gas table could raise and lower the flames, which gave stage lighting its first practical way to dim. Gas was brighter than candles, but it still produced heat and fire risk, and it used up air in the building.

Another device was limelight, often credited to Thomas Drummond in the 1820s. A flame fed with oxygen and hydrogen heated a block of lime until it glowed intensely white. The beam could be focused and followed a performer, which is why the phrase in the limelight survives. Limelight was used in theatres from around the 1830s.

Electric arc lamps and then incandescent bulbs, developed around 1879 by inventors including Thomas Edison and Joseph Swan, changed everything. The Savoy Theatre in London is widely cited as one of the first theatres lit entirely by electricity, in 1881. Electricity could be switched and dimmed from a distance and was far safer than open flame.

In the early twentieth century, designers such as Adolphe Appia and Edward Gordon Craig argued that light should shape the stage as an expressive element. Later decades brought tungsten-halogen lamps, computerised control and, in this century, LEDs.

Worked example: a gas table to a modern console is the same idea, central control of many lights, made precise.`,
          },
        ],
      },
      {
        id: 'lighting-design.t5',
        title: 'Stage, Live Events, Architecture and Storytelling',
        blurb: 'How designers work for theatre, concerts and buildings, and how light carries mood and meaning.',
        level: 'ADVANCED',
        lessons: [
          {
            id: L16,
            title: 'The Theatre Lighting Design Process',
            blurb: 'A theatre designer moves from script analysis to a light plot, then to cues built in rehearsal.',
            minutes: 8,
            body: `A theatre lighting design is built step by step, and the early steps happen long before any lamp is turned on.

It starts with script analysis. The designer reads the play for its time of day, places, mood and emotional shape, noting when the story shifts. Next come conversations with the director and the other designers for set, costume and sound, so the light supports one shared concept. Research and sketches help, such as paintings, photographs or colour palettes.

Next comes the light plot, a scaled drawing of the theatre showing where each instrument will hang, what type it is, and where it points. It is accompanied by paperwork: an instrument schedule that lists each fixture with its channel, dimmer, colour and purpose, and sometimes a magic sheet, a simple diagram for the console operator. The plot has to fit the venue's equipment and budget.

A common approach for lighting actors is to divide the stage into acting areas and light each from two directions, often about 45 degrees to either side, so faces stay modelled and visible. This approach is commonly associated with Stanley McCandless's 1932 book on stage lighting.

After the crew hangs and focuses the instruments, the designer writes cues. A cue is a stored lighting state and the instruction to change to it, with fade times. Technical rehearsals, including a cue-to-cue that jumps through the show's lighting changes, let the designer refine timing with the actors and stage manager.

Worked example: a scene set at dusk becomes three cues, warm daylight, a slow fade to amber, then a cool blue night state.`,
          },
          {
            id: L17,
            title: 'Concerts and Live Events',
            blurb: 'Concert lighting combines moving lights, haze, colour palettes and programmed cues to support the music while keeping performers visible.',
            minutes: 7,
            body: `Concerts and live events differ from theatre in scale and rhythm. The lighting often supports music, and the audience expects energy, movement and spectacle. The designer still has to keep the performer visible.

Moving lights, also called automated or intelligent fixtures, can be controlled remotely to change position, colour, brightness, beam size and projected patterns. A few fixtures can create many looks, and one rig can serve several songs. They hang from trusses, which are lightweight structural frames, and are driven by a console over DMX or networked data.

Beams only show in the air if something is there to scatter the light. Haze, a fine mist from a machine, makes beams visible as lines and shafts. Designers balance it, because too much washes out the picture and may bother some audience members or affect cameras.

Most designers use a limited palette for each song or section, with one or two main colours and a contrast colour, rather than every colour at once. Strong back light and side light create the silhouettes and halos typical of concerts, but face light is needed so that the audience, and any video cameras, can see the performer. Follow spots, operated by people, track a performer and give a bright, clear face.

Cues are often programmed to match the tempo and structure of the music, and sometimes triggered by timecode, a running clock, so that repeat performances match. A busker's one-lamp setup and a stadium rig use the same ideas.

Worked example: for a ballad, the designer drops to a warm single colour, keeps a soft face light, and brings in slow haze-lit beams from behind on the chorus.`,
          },
          {
            id: L18,
            title: 'Architectural Lighting Basics',
            blurb: 'Architectural lighting layers ambient, task and accent light to make spaces usable and pleasant.',
            minutes: 7,
            body: `Architectural lighting is designed for spaces people live and work in, so the aim is comfort and function as well as beauty. Designers commonly think in three layers.

Ambient light is the general illumination that makes a space safe and navigable. Task light is stronger and focused where an activity needs it, such as a reading lamp, a kitchen counter or a drafting desk. Accent light draws attention to features such as a painting, a plant or a textured wall. Good spaces usually combine all three, rather than relying on a single ceiling fixture.

Technique matters too. Grazing, placing a fixture very close to a surface and aiming along it, reveals texture, such as brick or stone. Wall washing lights a wall evenly from top to bottom. Indirect light bounces off a ceiling or wall to create a soft glow with fewer harsh shadows.

Designers pay close attention to glare, the discomfort caused by a bright source in the field of view, and to the colour of the light. Warm white around 2700 K is typical for living rooms and restaurants, while cooler whites, about 3500 to 5000 K, are typical for offices and workplaces. Recommended light levels, measured in lux, vary by task and standard, so designers consult the relevant guidance. Lighting controls such as dimmers and presets let a room shift between uses.

Worked example: in a home study, a soft ceiling glow provides ambient light, a desk lamp provides task light and a small spotlight on a bookshelf adds accent.`,
          },
          {
            id: L19,
            title: 'Mood and Storytelling with Light',
            blurb: 'Contrast, colour, softness and change over time turn lighting into a way of telling the story.',
            minutes: 8,
            body: `Everything covered so far becomes storytelling when you choose it for a reason. Each quality of light, whether contrast, softness, direction, colour or movement, can signal something to an audience.

Contrast is the strongest mood tool. High-key, bright and low-contrast lighting tends to feel open and safe. Low-key, with deep shadows, tends to feel tense, intimate or secretive. A tradition in painting called chiaroscuro, the strong contrast of light and dark seen in the work of Caravaggio and Rembrandt, deeply influenced later photography and film.

Softness carries emotion too. Soft light tends to suggest gentleness, memory or calm, and hard light often suggests tension, harshness or clarity. Direction does as well: light from below can make a figure threatening, and light from behind can make a figure mysterious or heroic.

Colour is powerful, but its meanings are conventions, not laws. In many Western stories, warm amber suggests comfort or sunset and cool blue suggests night, distance or sadness. Other cultures link colours to different ideas, so a designer thinks about the audience. Using warm and cool light together in one frame can show conflict or two worlds.

Light can also change over time. A slow fade from bright to dim can show a day passing, a mood sinking or an idea fading. A sudden snap does the opposite.

Worked example: in a scene where a character receives bad news, the lighting might start soft and warm, then cool and lose its fill as the news lands, pushing the room into shadow.`,
          },
          {
            id: L20,
            title: 'Putting It Together: Designing from a Brief',
            blurb: 'A repeatable method turns a story goal into a lighting plan, with a check on power, safety and the final result.',
            minutes: 8,
            body: `A professional lighting plan follows a sequence, whether the job is a film scene, a portrait or a stage. Following it keeps technical choices tied to the purpose.

1. First, define the story. What should the viewer feel, and what must be seen?
2. Second, decide the motivation: where would the light believably come from?
3. Third, choose the quality and direction of the key light. Large and soft for tenderness, small and hard for drama.
4. Fourth, set the ratio by balancing fill, bounce or negative fill.
5. Fifth, add separation, such as a back light or a lit background.
6. Sixth, choose colour and colour temperature, with gels or LED settings, and make sure the sources agree or contrast on purpose.

Then comes the practical check. Add up the electrical load against the circuits you have. Think about heat, cable paths and how every stand or hanging fixture is secured. Check that the equipment you chose can be controlled the way the plan needs, with dimmers or a console. Finally, test: look through the camera or from the audience position, or at a monitor, since the eye adjusts and can be fooled. Adjust the lights, not just the camera settings.

Worked example: the brief is a quiet morning in a kitchen. Motivation is a large window. A soft source outside, gelled slightly warm, is the key; a white card provides gentle fill for low contrast; a small back light separates the subject from the cabinets. Power is totalled, stands are weighted, and the result is checked on camera.`,
          },
        ],
      },
    ],
  },
  bank: {
    curriculumId: 'lighting-design',
    questions: [
      // L01
      tf(L01, 1, 1, 'If a small lamp is moved twice as far from a wall, the light reaching the wall becomes about one quarter as strong.', 0, 'The same light spreads over a larger area.', 'Light spreads over an area that grows with the square of the distance, so doubling the distance gives roughly a quarter of the illuminance.'),
      mc(L01, 2, 1, 'A small lamp gives 400 lux on a table at 1 metre. About how much does it give at 2 metres?', ['100 lux', '200 lux', '50 lux', '300 lux'], 'Doubling the distance quadruples the area covered.', 'At twice the distance the light covers four times the area, so 400 divided by 4 is about 100 lux.'),
      mc(L01, 3, 1, 'When light strikes a matte black cloth, what mostly happens to it?', ['It is absorbed', 'It is reflected', 'It is transmitted', 'It is refracted into colours'], 'Think about why black fabric looks dark.', 'A matte black surface absorbs most of the light that lands on it and reflects very little.'),
      mc(L01, 4, 2, 'A photographer moves a small lamp from 4 metres to 2 metres away from the subject. By how much does the light on the subject change?', ['It becomes four times brighter, or two stops', 'It becomes twice as bright, which is a gain of one stop', 'It becomes sixteen times brighter, which is four stops', 'It stays about the same, because distance does not matter'], 'Halving the distance does the reverse of doubling it.', 'Halving the distance gives four times the illuminance, and each doubling is one stop, so that is two stops.'),
      tf(L01, 5, 2, 'The inverse square law says that doubling the distance to a small source cuts the light on a surface in half.', 1, 'Check whether the drop is linear or squared.', 'Doubling the distance cuts the light to one quarter, not one half, because the falloff follows the square of the distance.'),
      // L02
      mc(L02, 1, 1, 'Which of these gives the softest light?', ['A heavily overcast sky', 'Clear midday sun', 'A bare bulb across the room', 'A small spotlight far away'], 'Which source acts like one very large glowing panel?', 'Clouds scatter the sunlight so the whole sky acts as a very large source, which makes shadows soft.'),
      tf(L02, 2, 1, 'Moving a softbox closer to a subject makes the light on the subject softer.', 0, 'Closer sources look bigger from the subject.', 'A closer source has a larger apparent size from the subject, so shadow edges become softer.'),
      mc(L02, 3, 2, 'What mainly decides whether a shadow edge looks crisp or feathered?', ['How large the source appears from the subject', 'How much the lamp and its stand cost to buy new', 'How many watts the lamp uses', 'What colour the lamp is'], 'The key word is apparent size.', 'A small apparent source gives crisp edges and a large apparent source gives gradual ones.'),
      mc(L02, 4, 2, 'Why does placing a sheet of diffusion in front of a small lamp soften its light?', ['The glowing sheet becomes a larger source', 'The sheet makes the light travel faster', 'The sheet changes the lamp to a cooler colour', 'The sheet removes all the shadows by blocking light'], 'Think about what the subject now sees in place of the small bulb.', 'The diffusion material scatters the light and becomes a larger glowing surface, which is a larger apparent source.'),
      tf(L02, 5, 3, 'Because the sun is enormously large, it always gives soft light on a clear day.', 1, 'Consider how big the sun looks in the sky.', 'The sun appears as a small disc from Earth, so on a clear day it casts hard shadows.'),
      // L03
      mc(L03, 1, 1, 'Which light direction is best at revealing the texture of a brick wall?', ['From the side, close to the wall', 'From the front, near the camera', 'From directly behind the camera', 'From far away and head-on'], 'Think about which direction makes each bump cast a shadow.', 'Side light rakes across the surface, so every raised detail casts a shadow and texture appears.'),
      tf(L03, 2, 1, 'Light coming from near the camera tends to make a face look flatter.', 0, 'Shadows hide behind the subject from this angle.', 'Front light fills the shadows the camera can see, which reduces the sense of depth.'),
      mc(L03, 3, 2, 'Why does light from below a face, like a flashlight under the chin, often look eerie?', ['We are used to being lit from above', 'It is always the brightest direction', 'It is the hardest direction for cameras to record', 'It makes the eyes look too small'], 'Think about where most natural light comes from.', 'Sun and ceiling lights come from above, so light from below looks unnatural and is often used to unsettle.'),
      mc(L03, 4, 2, 'What does a light placed behind the subject and aimed toward the camera most often add?', ['A bright edge that separates the subject from the background', 'Even, flat lighting that spreads across the whole of the face and shoulders', 'Fill light in the shadows', 'A warmer skin tone'], 'Think about the outline of hair and shoulders.', 'Back light traces a thin bright edge, which helps the subject stand out from what is behind it.'),
      mc(L03, 5, 3, 'Which feature identifies Rembrandt lighting on a portrait?', ['A small triangle of light on the cheek on the shadow side', 'A shadow under the nose shaped like a butterfly, from a high front light', 'No shadows at all on the face', 'Only the outline of the head lit'], 'It is named for the way the shadow and cheek meet.', 'Rembrandt lighting comes from a key to the side and above, leaving a small lit triangle on the shadowed cheek.'),
      // L04
      mc(L04, 1, 1, 'Which colour temperature looks the warmest, most orange?', ['2700 K', '3200 K', '5600 K', '7000 K'], 'Lower numbers look warmer.', 'On the Kelvin scale, lower values look warmer and higher values look cooler and bluer.'),
      tf(L04, 2, 1, 'A higher Kelvin value means the light looks warmer and more orange.', 1, 'The scale runs opposite to hot and cold in everyday speech.', 'Higher Kelvin values look cooler and bluer; lower values look warmer.'),
      mc(L04, 3, 2, 'Studio tungsten lights are typically rated at about which colour temperature?', ['3200 K', '5600 K', '9000 K', '1000 K'], 'It is a warm value, but not as warm as a household bulb.', 'Film and studio tungsten lamps are typically rated at 3200 K, while daylight-balanced sources are around 5600 K.'),
      mc(L04, 4, 2, 'What does the colour rendering index, CRI, tell you about a light?', ['How faithfully it shows colours compared with a reference', 'How warm or cool the colour of the light appears to the eye', 'How much electricity the lamp draws from the wall when lit', 'How far the beam of the lamp can reach down a very long room'], 'It is about colour accuracy, not colour warmth.', 'CRI is a scale up to 100 comparing how naturally a source renders a set of test colours.'),
      mc(L04, 5, 3, 'A camera is set for daylight and a tungsten lamp appears in the frame. How does the lamp look?', ['Orange', 'Blue', 'Perfectly white', 'Green'], 'Tungsten is much warmer than the white the camera expects.', 'Relative to a daylight setting, 3200 K tungsten reads as noticeably orange.'),
      // L05
      mc(L05, 1, 1, 'Which instrument has a lens built from concentric stepped rings?', ['The Fresnel', 'The ellipsoidal', 'The softbox', 'The practical lamp'], 'It is named for a French physicist.', 'The Fresnel lens uses stepped rings, a design named for Augustin-Jean Fresnel.'),
      tf(L05, 2, 1, 'An ellipsoidal spotlight can project a pattern, called a gobo, by placing it in the gate.', 0, 'Think about what sits at the focal point of the beam.', 'A gobo slides into the gate of an ellipsoidal and the lens focuses its pattern onto a surface.'),
      mc(L05, 3, 2, 'A designer needs a crisp-edged square pool of light on a stage floor. Which tool is the best choice?', ['An ellipsoidal with its shutters', 'A Fresnel with barn doors', 'A bare practical bulb', 'A softbox'], 'Which fixture has shutters in a gate?', 'Shutters in the gate of an ellipsoidal cut the beam to a sharp shape that the lens focuses.'),
      mc(L05, 4, 2, 'How is a Fresnel adjusted from a wide flood to a narrow spot?', ['By sliding the lamp and reflector toward or away from the lens', 'By changing the colour of the lamp with a gel in front of the lens', 'By adding a gobo', 'By turning the shutters'], 'The lens itself stays put.', 'Moving the lamp and reflector unit relative to the lens changes the beam angle.'),
      tf(L05, 5, 3, 'The beam of a Fresnel has a soft edge that blends easily with neighbouring lights.', 0, 'Think about why it works well for washes.', 'The Fresnel beam edge is soft, which is why it is popular for blending washes of light.'),
      // L06
      mc(L06, 1, 1, 'What does a softbox do to a small lamp inside it?', ['Turns it into a larger, softer source', 'Makes it hotter and harder', 'Changes it to 5600 K', 'Lets it project patterns'], 'Look at the white panel on the front.', 'The diffusion panel becomes the apparent source, so the light is larger and softer.'),
      tf(L06, 2, 1, 'A practical is a working lamp that is visible in the shot.', 0, 'The name suggests it actually does something.', 'Practicals, such as table lamps or neon signs, are working lights that appear in the frame.'),
      mc(L06, 3, 2, 'Compared with tungsten lamps, what do LED fixtures typically offer?', ['More light for the electricity they use and less heat', 'Always a higher CRI than any tungsten lamp could achieve', 'A fixed colour that cannot be changed by any control or gel', 'No need for any testing of colour before you shoot with them'], 'Think about energy and heat.', 'LED fixtures typically produce more light per watt and run cooler than tungsten lamps.'),
      mc(L06, 4, 2, 'Why is it wise to check an LED fixture specification and test it before filming skin tones?', ['Some LEDs have lower CRI or a colour tint', 'LEDs can never be dimmed', 'LEDs always flicker', 'LEDs cannot be gelled'], 'Quality varies between products.', 'Cheaper LEDs may render colours poorly or have a tint, so testing prevents surprises on skin.'),
      mc(L06, 5, 3, 'Why might a crew add a hidden light near a bedside lamp that appears in the shot?', ['The lamp alone is usually too dim to expose the scene', 'To make the lamp itself look cooler and more like daylight', 'Because practicals can never be seen clearly by any camera', 'To replace the practical lamp with a window in the frame'], 'A household bulb is not very strong.', 'A hidden light matching the practical gives enough exposure while the audience still sees a believable source.'),
      // L07
      mc(L07, 1, 1, 'What does a dimmer do?', ['Adjusts the power to a lamp to change its brightness', 'Converts a tungsten lamp into a colour-changing LED fixture', 'Moves the lamp along a rail to a new position in the room', 'Makes the light harder by narrowing the size of the source'], 'It deals with gradual change instead of on and off.', 'A dimmer changes the power delivered to a lamp so that it can be brighter or dimmer.'),
      tf(L07, 2, 1, 'A single DMX512 line, called a universe, carries 512 channels of control data.', 0, 'The number is in the name.', 'DMX512 refers to the 512 channels in one universe.'),
      mc(L07, 3, 2, 'On a simple dimmer channel, what does a DMX value of 255 usually mean?', ['Full brightness', 'Off', 'Half brightness', 'An error'], 'Channel values run from 0 to 255.', 'Values run from 0 to 255, with 0 off and 255 full for a simple dimmer.'),
      mc(L07, 4, 2, 'Which job does a lighting console do?', ['Builds, stores and plays back lighting states called cues', 'Produces the light itself from a bank of lamps built into it', 'Cools the lamps with fans when they run for many hours at a time', 'Measures colour temperature and brightness at the subject position'], 'Think about what an operator uses to repeat the show every night.', 'The console builds and stores states and sends data so the show can be repeated exactly.'),
      tf(L07, 5, 3, 'A tungsten lamp becomes warmer in colour as it is dimmed.', 0, 'It looks more orange at low levels.', 'Dimming lowers the filament temperature, which shifts the colour toward warmer orange.'),
      // L08
      mc(L08, 1, 1, 'What is a CTO gel typically used for?', ['Warming daylight-balanced light to match tungsten', 'Cooling tungsten light so that it matches the daylight outside', 'Making a light harder and more directional on the subject', 'Projecting sharp patterns of shadow onto a wall or backdrop'], 'The letters stand for colour temperature orange.', 'CTO warms daylight-balanced light so it matches tungsten sources.'),
      tf(L08, 2, 1, 'A gel adds extra light to the fixture it is placed on.', 1, 'Think about what a filter does to the wavelengths it does not pass.', 'Gels work by absorbing, so they always cost some light.'),
      mc(L08, 3, 2, 'Why does a deep saturated gel usually reduce brightness more than a pale one?', ['It absorbs more of the light', 'It reflects light to the camera', 'It makes the lamp cooler', 'It changes the voltage'], 'Which one blocks more wavelengths?', 'A saturated colour passes fewer wavelengths and absorbs more of the light.'),
      mc(L08, 4, 2, 'What is a neutral density gel used for?', ['Reducing brightness without changing colour', 'Warming the light', 'Softening shadows', 'Making the beam narrower so it spills less onto the wall'], 'The word neutral is the clue.', 'ND filters reduce intensity evenly without a colour shift.'),
      mc(L08, 5, 3, 'You want to soften harsh light from a small lamp without changing its colour. What is the best addition?', ['Diffusion in front of the lamp', 'A deep red gel', 'A gobo', 'A narrower shutter'], 'Which filter enlarges the apparent source?', 'Diffusion scatters light and creates a larger glowing surface, which softens it.'),
      // L09
      mc(L09, 1, 1, 'In three-point lighting, which light is the main source?', ['The key light', 'The fill light', 'The back light', 'The background light'], 'It sets direction and most of the exposure.', 'The key is the main light and establishes direction and exposure.'),
      tf(L09, 2, 1, 'The fill light is generally softer and dimmer than the key.', 0, 'It only lifts the shadows.', 'The fill lifts shadows and is usually softer and dimmer than the key.'),
      mc(L09, 3, 2, 'What is the main purpose of the back light?', ['To separate the subject from the background', 'To light the whole face evenly from beside the lens', 'To warm the skin', 'To replace the key'], 'Think of a bright edge around the head.', 'The back light draws a bright edge that separates the subject and adds depth.'),
      mc(L09, 4, 2, 'How can you deepen shadows in a three-point setup?', ['Lower the fill light level', 'Raise the fill to match the key', 'Move the back light to the front', 'Add more diffusion to the key'], 'Think about which light fills the shadows.', 'A dimmer fill leaves shadows darker and raises contrast.'),
      mc(L09, 5, 3, 'If the fill light is turned off and nothing else changes, what is the result?', ['Higher contrast and darker shadows', 'A flatter picture', 'A warmer picture', 'A softer key'], 'Fill is what lifts the shadows.', 'Without fill, the shadow side loses its light and contrast rises.'),
      // L10
      mc(L10, 1, 1, 'What does negative fill do?', ['Deepens shadows by absorbing light on the shadow side', 'Adds extra light to the shadow side to open up the face', 'Makes the key softer by enlarging the source on the subject', 'Changes the colour of the key light to a much cooler tone'], 'It works by subtraction.', 'A black flag absorbs bounced light that would otherwise fill the shadow.'),
      tf(L10, 2, 1, 'A 4:1 lighting ratio is more contrasty than a 2:1 ratio.', 0, 'A bigger ratio means a bigger difference.', 'A higher ratio means a larger difference between the lit and shadow sides.'),
      mc(L10, 3, 2, 'In the common convention, a 4:1 ratio corresponds to how many stops of difference?', ['Two stops', 'One stop', 'Four stops', 'Three stops'], 'Each doubling is one stop.', 'Four to one is two doublings, so two stops.'),
      mc(L10, 4, 2, 'Which description fits high-key lighting?', ['Bright with low contrast and few deep shadows', 'Dark with large shadows and a lot of contrast on the face', 'Lit only from behind with nothing on the front of the face', 'Lit only with the practical lamps that are visible on screen'], 'It feels open and cheerful.', 'High-key lighting has low ratios and bright, open tones.'),
      mc(L10, 5, 3, 'What is the job of a background light?', ['To shape or brighten the backdrop so the subject does not vanish into it', 'To act as the key', 'To produce a catchlight that sparkles in the eyes of the person in front of the lens', 'To remove all shadows'], 'It lights the area behind the subject.', 'A background light controls how the backdrop looks and helps separation.'),
      // L11
      mc(L11, 1, 1, 'What does motivated lighting mean?', ['The light appears to come from a believable source in the scene', 'The light must always be warm', 'All lights used must be clearly visible in the frame at all times', 'The light has no shadows'], 'A light has a reason to be there.', 'Motivated light agrees in direction, quality and colour with a source we believe in.'),
      tf(L11, 2, 1, 'A motivating source must always be visible in the frame.', 1, 'Think about a window just off screen.', 'The source can be implied and off-screen as long as the light looks consistent with it.'),
      mc(L11, 3, 2, 'Why do crews often place a stronger light outside a window instead of relying on real daylight?', ['It is more controllable and can match the direction of the sun', 'Daylight can never be recorded properly by a camera at any time of day', 'Windows block all light', 'It keeps the lamp cool'], 'Real light changes and may not be strong enough.', 'A fixture outside the window gives constant, adjustable light aimed to match the motivation.'),
      mc(L11, 4, 2, 'Which is the best example of lighting without an apparent motivation?', ['A hard light from below on a person in a sunny kitchen', 'A warm glow around a person sitting close to a table lamp', 'Cool blue light coming from a computer screen in the dark', 'Golden light streaming through a window as the sun sets'], 'Look for the one with no source that fits.', 'Hard light from below in a sunny kitchen has no source that explains it.'),
      tf(L11, 5, 3, 'Motivated lighting must look plain and cannot be stylised.', 1, 'The test is consistency.', 'Designers can push colour and contrast as long as the light stays consistent with its source.'),
      // L12
      mc(L12, 1, 1, 'What is a catchlight?', ['A small reflection of the light source in the eyes', 'A light that catches the background', 'The shadow under the nose that points down toward the mouth', 'A type of gel'], 'Look at the eyes in a portrait.', 'Catchlights are reflections of the source in the eyes, and they add life.'),
      tf(L12, 2, 1, 'In butterfly lighting the key sits high and in front, above the lens axis.', 0, 'The nose shadow gives it its name.', 'A high frontal key leaves a butterfly-shaped shadow under the nose.'),
      mc(L12, 3, 2, 'What setup defines clamshell lighting?', ['A key above and a reflector or fill below', 'A key at the side and nothing else', 'Only back light', 'Two lights behind the subject'], 'Picture the two halves of a shell.', 'Clamshell frames the face with light from above and below for smooth even light.'),
      mc(L12, 4, 2, 'In short lighting, which side of the face does the key light?', ['The side turned away from the camera', 'The side turned toward the camera', 'Both sides equally', 'Only the forehead'], 'Short lighting tends to slim the face.', 'In short lighting the lit side is the one turned away from the camera.'),
      mc(L12, 5, 3, 'Which source gives smooth skin transitions in a portrait?', ['A large soft source close to the subject', 'A small hard source far away', 'A bare bulb', 'A source behind the subject only'], 'Recall the lesson on softness.', 'A large close source is soft and gives gentle gradations on skin.'),
      // L13
      mc(L13, 1, 1, 'Which rule explains why you see a lamp reflected in a glossy product?', ['Light bounces off a smooth surface at the same angle it arrived', 'Light always bends toward the camera', 'Light slows down on shiny surfaces', 'Light reflects only from dark and rough surfaces found in the scene'], 'It is called the law of reflection.', 'For a smooth surface, the angle of reflection equals the angle of incidence.'),
      tf(L13, 2, 1, 'A large soft source can make a smooth gradient highlight on a glossy product.', 0, 'The reflection takes the size of the source.', 'A large source reflects as a broad smooth band, which describes the shape well.'),
      mc(L13, 3, 2, 'What does a light tent do for small shiny products?', ['Wraps them in diffused light to reduce harsh reflections', 'Makes the light harder and more directional on the product', 'Projects a pattern', 'Blocks all light'], 'Think of a translucent cube.', 'The translucent tent diffuses the light around the product.'),
      mc(L13, 4, 2, 'How do you bring out the texture of a matte fabric product?', ['Light from the side or at a raking angle', 'Light directly from the camera position', 'A very large source behind the camera', 'No light at all'], 'Recall the lesson on direction.', 'Raking light makes small surface details cast shadows.'),
      mc(L13, 5, 3, 'What can you do if a lamp reflection in a glossy item runs straight into the lens?', ['Change the angle of the item or source so the reflection leaves the lens view', 'Move the camera closer without changing anything', 'Increase the lamp power so that the whole reflection becomes much brighter than before', 'Add a deeper gel'], 'Use the law of reflection.', 'Changing the angle redirects the reflected light away from the lens.'),
      // L14
      mc(L14, 1, 1, 'What is a risk of overloading a circuit?', ['Overheating or tripping the breaker', 'Making lamps cooler', 'Changing the colour of light', 'Improving brightness safely'], 'Think about too much current.', 'An overloaded circuit can overheat, which is why designers add up loads first.'),
      tf(L14, 2, 1, 'It is fine to handle a halogen bulb with bare fingers.', 1, 'Skin oils and heat are both an issue.', 'Skin oils can cause a halogen bulb to fail, and the bulb is very hot in use.'),
      mc(L14, 3, 2, 'A 1200 watt lamp runs on 120 volts. About how many amps does it draw?', ['10 amps', '1 amp', '100 amps', '0.1 amp'], 'Watts equal volts times amps.', 'Amps equal watts divided by volts, so 1200 divided by 120 is 10 amps.'),
      mc(L14, 4, 2, 'Why is a secondary safety cable used on a hung fixture?', ['To catch the fixture if the clamp fails', 'To power the fixture', 'To cool the fixture', 'To change its colour'], 'Think about a backup.', 'A safety cable is a backup that stops the fixture falling if the main support fails.'),
      mc(L14, 5, 3, 'What are sandbags used for on a light stand?', ['Stabilising it so it does not tip', 'Warming the lamp', 'Diffusing the light', 'Measuring the load'], 'They are heavy.', 'Weighting the base keeps the stand stable.'),
      // L15
      mc(L15, 1, 1, 'How was limelight produced?', ['By heating a block of lime with an oxygen and hydrogen flame', 'By an electric arc', 'By passing current through a thin tungsten filament inside a glass bulb', 'By an LED'], 'It has lime in its name.', 'A flame fed with oxygen and hydrogen heated lime until it glowed brightly.'),
      tf(L15, 2, 1, 'Gas lighting was used in theatres before electric lighting.', 0, 'Think of the order of the nineteenth century.', 'Gas arrived in the early nineteenth century and electric lighting came later.'),
      mc(L15, 3, 2, 'What was a major hazard of gas and limelight in theatres?', ['Fire', 'Flicker on camera', 'Radio interference', 'Poor colour rendering of LEDs'], 'Open flames were used.', 'Open flames made theatre fires an ongoing problem.'),
      mc(L15, 4, 2, 'Which came first in theatres?', ['Gas lighting, then incandescent electric lighting', 'LED lighting first, and then gas lighting after that', 'Incandescent electric lighting first, and then candles later', 'Moving lights first, and then gas lighting after that'], 'Think of the long sequence from flame to LED.', 'Gas came before incandescent electric lighting, which came before LEDs.'),
      mc(L15, 5, 3, 'What did designers such as Adolphe Appia argue about light on stage?', ['That light should shape the stage as an expressive element', 'That light should stay general and flat so the actors stand out', 'That light should be avoided', 'That light should be only candles'], 'They saw light as more than visibility.', 'Appia and Craig argued that light is an active, expressive part of stage design.'),
      // L16
      mc(L16, 1, 1, 'What is the first step of a theatre lighting design?', ['Analysing the script', 'Hanging the instruments', 'Writing cues', 'Buying gels'], 'It comes long before any lamp is on.', 'Designers begin by reading the script for time, place and mood.'),
      tf(L16, 2, 1, 'A light plot is a scaled drawing showing where each instrument hangs and where it points.', 0, 'It is a drawing of the rig.', 'The plot shows the position, type and aim of each fixture.'),
      mc(L16, 3, 2, 'What is a cue?', ['A stored lighting state and the instruction to change to it', 'A type of gel', 'A kind of lens', 'A rating printed on the dimmer pack showing its maximum load'], 'Think of what the console plays back.', 'A cue is a stored state with fade times that the operator triggers.'),
      mc(L16, 4, 2, 'What is the purpose of a cue-to-cue rehearsal?', ['To work through the lighting changes without playing every scene', 'To hang the lights', 'To teach the actors their lines before the first full performance', 'To test the audience'], 'It jumps through the show.', 'A cue-to-cue lets the team refine the timing of lighting changes efficiently.'),
      mc(L16, 5, 3, 'Why are acting areas often lit from two directions about 45 degrees to each side?', ['To keep faces modelled and visible', 'To save power', 'To make light harder', 'To hide the actors'], 'Think of keeping a face visible from all stage positions.', 'Two angled sources model the face and keep it visible, an approach linked to McCandless.'),
      // L17
      mc(L17, 1, 1, 'Why is haze used at concerts?', ['It scatters light so beams become visible', 'It cools the fixtures', 'It changes colour temperature', 'It dims the lights'], 'Beams do not show in clear air.', 'Particles in the air scatter light so beams look like shafts.'),
      tf(L17, 2, 1, 'A follow spot is operated by a person who tracks a performer.', 0, 'The name says it follows.', 'A follow spot is hand-operated and tracks the performer.'),
      mc(L17, 3, 2, 'What can a moving light do remotely?', ['Change position, colour and beam', 'Only turn on and off', 'Only change brightness', 'Nothing without a person present'], 'It is also called automated.', 'Moving lights can be controlled for pan, tilt, colour, gobo and other attributes.'),
      mc(L17, 4, 2, 'Why might cues be triggered by timecode?', ['So lighting stays in sync with the music on every performance', 'To save power', 'To keep haze visible', 'To avoid needing a lighting console at any point during the show'], 'Timecode is a running clock.', 'Timecode makes sure cues land at the same musical moment each night.'),
      mc(L17, 5, 3, 'Why does even a moody concert design still need face light?', ['So the audience and cameras can see the performer', 'To cool the stage down when the performers get too hot', 'To reduce haze so that the beams are harder to see', 'To keep the trusses visible to everyone in the audience area'], 'Back light alone gives silhouettes.', 'Without front or face light, performers appear only as silhouettes.'),
      // L18
      mc(L18, 1, 1, 'Which three layers do architectural designers commonly use?', ['Ambient, task and accent', 'Key, fill and back', 'Soft, hard and neutral', 'Warm, cool and neutral'], 'They concern general, working and highlight light.', 'Ambient, task and accent layers work together in most spaces.'),
      tf(L18, 2, 1, 'Grazing light close to a textured wall emphasises the texture.', 0, 'It rakes along the surface.', 'A fixture aimed along the surface makes every bump cast a shadow.'),
      mc(L18, 3, 2, 'Which layer is a reading lamp?', ['Task light', 'Ambient light', 'Accent light', 'Back light'], 'It serves a particular activity.', 'A reading lamp provides stronger light for a specific activity.'),
      mc(L18, 4, 2, 'What is glare?', ['Discomfort from a bright source in the field of view', 'A warm colour tint that spreads across every surface in the room', 'A soft shadow edge produced by a very large source nearby', 'A gobo pattern projected from an ellipsoidal onto the wall'], 'It is a comfort problem.', 'Glare is the discomfort and reduced visibility caused by an overly bright source in view.'),
      mc(L18, 5, 3, 'Which colour temperature is typical for a cosy living room?', ['About 2700 K', 'About 6500 K', 'About 9000 K', 'About 12000 K'], 'Homes usually have warm light.', 'Warm white around 2700 K is typical for living rooms and restaurants.'),
      // L19
      mc(L19, 1, 1, 'Which lighting style tends to feel tense or secretive?', ['Low-key with deep shadows', 'High-key and bright', 'Flat even front light', 'A bright white room'], 'Think of dark areas.', 'Low-key lighting has high contrast and large dark areas, which suits tension.'),
      tf(L19, 2, 1, 'The emotional meanings of colours are the same in every culture.', 1, 'They are conventions.', 'Colour associations vary between cultures, so designers consider the audience.'),
      mc(L19, 3, 2, 'What can a slow fade from bright to dim show?', ['The passing of time or a mood sinking', 'A change in lens', 'A power problem', 'A change of key'], 'Light can change over time.', 'Changes over time can signal a day passing or an emotional shift.'),
      mc(L19, 4, 2, 'What is chiaroscuro?', ['Strong contrast of light and dark, as in the work of Caravaggio and Rembrandt', 'A kind of gel', 'A theatre lamp', 'A shade of orange that was popular with painters of landscapes in the nineteenth century'], 'It comes from painting.', 'Chiaroscuro is the strong use of light against dark, seen in painting and later in film.'),
      mc(L19, 5, 3, 'Which choice would most likely suggest gentleness or calm?', ['Soft, low-contrast light', 'Hard light from below', 'Deep shadows with a strong ratio', 'Flashing light'], 'Recall what softness tends to signal.', 'Soft, low-contrast light tends to suggest calm, memory and gentleness.'),
      // L20
      mc(L20, 1, 1, 'What is the first step in the design method?', ['Define the story and what the viewer should feel', 'Buy the most powerful equipment the budget allows', 'Set every dimmer to its final level on the console', 'Pick a favourite gel colour and build the rest around it'], 'Purpose comes first.', 'Technical choices should serve the story, so it is defined first.'),
      tf(L20, 2, 1, 'You should add up the electrical load against the circuits before you wire the lights.', 0, 'Recall the safety lesson.', 'Checking the load before wiring helps avoid overloads.'),
      mc(L20, 3, 2, 'Which setup best suits a quiet morning in a kitchen?', ['A large soft window-like key with gentle fill', 'A small hard light placed low and pointing up from below', 'A strobe effect flashing at a fast and steady rate', 'Only a single back light with no key and no fill at all'], 'Think soft, low contrast.', 'A large soft key with gentle fill gives a calm, low-contrast look.'),
      mc(L20, 4, 2, 'After setting the key, what is the sensible next step?', ['Set the ratio with fill or negative fill', 'Remove the key', 'Turn off all of the other lights in the room and the set', 'Change the camera lens'], 'Check the shadows.', 'The ratio comes next, controlled with fill, bounce or negative fill.'),
      mc(L20, 5, 3, 'Why test by looking at the camera or monitor?', ['The eye adjusts and can be fooled', 'Cameras never need adjustment', 'Monitors change the lights', 'It saves power'], 'The eye adapts.', 'The camera sees what the eye adapts to, so a test view catches issues.'),
    ],
  },
};
