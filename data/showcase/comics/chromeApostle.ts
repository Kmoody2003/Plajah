// data/showcase/comics/chromeApostle.ts
// Showcase Comic 2: Hard Sci-Fi / Cyberpunk Mecha Seinen (Otomo / Miura / Nihei Lens)
// COMPLETE UNABRIDGED 24-PAGE SEQUENTIAL ART SCRIPT

import { ShowcaseComicBook } from '../comicTypes';

export const chromeApostle: ShowcaseComicBook = {
  id: 'chrome-apostle',
  templateId: 'manga-seinen-kinetic',
  title: 'CHROME APOSTLE: APHELION 9',
  subtitle: 'Orbital Tether War & The Ghost of Sector 7',
  genre: 'seinen-kinetic',
  councilLenses: {
    leadArtist: 'Katsuhiro Otomo & Tsutomu Nihei (3-Point Forced Perspective & Brutalist Megastructures)',
    leadWriter: 'Masamune Shirow & Kentaro Miura (High-Density Hard Sci-Fi / Visceral Cybernetic Weight)',
    storyIntelligence: 'Plajah Seinen-Kinetic Engine (Screentone Dot Matrix, Micro-Beat Action Deconstruction, Kanji Sound Layers)',
  },
  targetAudience: 'mature-17+',
  pageCount: 24,
  logline: 'When an incomprehensible swarm of self-replicating silicon biomechs severs the orbital space tether connecting Earth to the Moon, an unaugmented maintenance pilot is forced into an ancient, decommissioned combat rig to weld the anchor before the atmosphere ignites.',
  blurb: 'Aphelion 9 was meant to be the spine of humanity’s solar expansion: a 36,000-kilometer carbon-nanotube elevator anchored to the Pacific Rim. At 0400 hours, communication with the High Orbital Anchor went dead. In its place descended the "Apostles"—crystalline mechanical organisms that consume raw titanium and broadcast mathematical hymns across emergency channels. Ren Vance, a zero-g maintenance welder with scarred hands and a debt he can never pay, is the only pilot within docking distance of the rig.',
  theme: 'Human fragility pitted against the sublime, incomprehensible indifference of post-biological evolution.',
  visualGrammar: {
    gutterWidth: '12px',
    gutterColor: '#070a10',
    pageTexture: 'screentone-dot-matrix-60lpi',
    primaryPalette: ['#0b0f19', '#38bdf8', '#10b981', '#ffffff', '#020617'],
    typography: {
      bodyFont: 'system-ui, -apple-system, sans-serif',
      captionFont: 'Consolas, monospace',
      sfxFont: 'Impact, Arial Black, sans-serif',
    },
    inkingStyle: 'Extremely detailed cross-hatching, fine technical mechanical linework, 60 LPI screentone gradations, speedlines originating from focal explosion centers, integrated Japanese onomatopoeia.',
  },
  characters: [
    {
      id: 'ren-vance',
      name: 'Ren Vance',
      role: 'protagonist',
      archetype: 'The Reluctant Heavy Specialist',
      personality: ['resilient', 'hyper-focused', 'pragmatic', 'exhausted', 'unflinching'],
      lockedVisualLook: 'Compact muscular frame in an oil-stained pressurized flight suit, helmet scarred with micrometeorite pits, heavy titanium welding gauntlets with heat dissipation vents.',
      palette: ['#0f172a', '#38bdf8', '#f59e0b', '#cbd5e1'],
      voiceSignature: 'Terse, breathy radio transmissions punctuated by helmet oxygen regulator clicks.',
      arc: 'Survives suicidal tether repair by letting go of his guilt over his crew’s earlier decompression tragedy.',
    },
    {
      id: 'apostle-prime',
      name: 'Apostle Entity "Seraph-0"',
      role: 'antagonist',
      archetype: 'The Incomprehensible Silicon Swarm',
      personality: ['alien', 'relentless', 'mathematical', 'transcendent'],
      lockedVisualLook: 'A 200-meter geometric tetrahedron of polished mirror-chromium and pulsing blue Cherenkov radiation, surrounded by thousands of vibrating razor petals.',
      palette: ['#ffffff', '#06b6d4', '#0284c7', '#0f172a'],
      voiceSignature: 'White noise static layered over Gregorian harmonic choral calculations.',
      arc: 'Consumes the tether station to convert Earth’s magnetic field into an interstellar transmission beacon.',
    },
    {
      id: 'commander-treadwell',
      name: 'Flight Controller Treadwell',
      role: 'mentor',
      archetype: 'The Grounded Tether Captain',
      personality: ['commanding', 'cold', 'calculating', 'protective'],
      lockedVisualLook: 'Middle-aged military woman in high-collar naval jumpsuit, cybernetic auditory implant glowing red behind ear, holographic tactical radar reflecting in glasses.',
      palette: ['#1e293b', '#ef4444', '#f1f5f9'],
      voiceSignature: 'Precise military cadence with increasing strain under orbital telemetry collapse.',
      arc: 'Must choose whether to detonate the tether explosive collar, dooming Ren, or risk Earth’s atmosphere catching fire.',
    },
  ],
  pages: [
    // PAGE 1
    {
      pageNumber: 1,
      title: 'The Fall of the Apex Station',
      act: 'Act I: Decompression at 36,000 Kilometers',
      sequenceBeat: 'Monumental Seinen Establishing / Catastrophe',
      layoutGrammar: 'Forced 3-Point Perspective Splash + High-Frequency Reaction Cascade',
      panels: [
        {
          panelNumber: 1,
          geometry: 'widescreen-letterbox',
          flex: 12,
          cameraAngle: 'extreme-wide',
          eyeVector: 'Top-Left Telemetry -> Center Snapped Tether Spine -> Bottom Earth Curvature',
          artBrief: 'Extreme wide shot of Earth from geostationary orbit. The colossal carbon elevator tether snaps with a cataclysmic shockwave of electrical sparks, curling like a whip thousands of kilometers long against the blackness of space.',
          generationPrompt: 'Extreme wide shot in geostationary orbit, monumental space elevator tether snapping against Earth blue horizon, hyper detailed technical linework, Tsutomu Nihei architectural manga style, screentone shading, catastrophic decompression debris --ar 21:9',
          captions: [
            {
              text: 'APHELION 9 ORBITAL TETHER // GEOSTATIONARY ALTITUDE: 35,786 KM\nTENSION COLLAPSE IN SECTOR 4. TETHER WHIP COMMENCING.',
              kind: 'technical-hud',
              position: { top: '16px', left: '16px', maxWidth: '60%' },
            },
          ],
          balloons: [],
          sfx: [{ word: 'ズドドド (ZU-DO-DO-DO)', style: 'cyan-electric', animation: 'shake', position: { right: '40px', top: '30px', fontSize: '50px' } }],
        },
      ],
    },

    // PAGE 2
    {
      pageNumber: 2,
      title: 'Inside the Iron Mite',
      act: 'Act I: Decompression at 36,000 Kilometers',
      sequenceBeat: 'Cockpit Panic / Character Grounding',
      layoutGrammar: 'Slanted Dual Reaction Tier',
      panels: [
        {
          panelNumber: 1,
          geometry: 'slanted-slash-left',
          flex: 6,
          cameraAngle: 'close-up',
          eyeVector: 'Top G-Meter -> Center Ren Visor -> Bottom Throttle Clench',
          artBrief: 'Inside the cockpit of the rusted heavy maintenance rig "Iron Mite", Ren’s helmet visor reflecting violent red emergency warning holograms as zero-g debris hammers the cockpit glass.',
          generationPrompt: 'Close up of exhausted anime mech pilot inside dark cockpit illuminated by flashing red radar screens, heavy screentone sweat beads, Otomo Akira mechanical detail --ar 4:3',
          captions: [],
          balloons: [{ speaker: 'REN VANCE', text: 'Control, Apex station just sheared in half! The Apostles are inside the conduit rings!', style: 'shout', position: { bottom: '16px', left: '14px' } }],
          sfx: [{ word: 'BEEP-BEEP-BEEP', style: 'red-impact', animation: 'pulse', position: { top: '12px', right: '16px' } }],
        },
        {
          panelNumber: 2,
          geometry: 'slanted-slash-right',
          flex: 6,
          cameraAngle: 'medium',
          eyeVector: 'Top Apostle Geometry -> Bottom Thruster Burn',
          artBrief: 'Outside the hatch: a colossal silicon tetrahedron Apostle unfolds thousands of razor-sharp chrome fins, harvesting the molten titanium cable.',
          generationPrompt: 'Medium shot of alien silicon biomech unfolding mirror polished blades against solar flare, hard sci-fi manga style, high contrast ink lines --ar 4:3',
          captions: [],
          balloons: [{ speaker: 'COMMANDER TREADWELL (RADIO)', text: 'Ren, you have twelve minutes before the counterweight drags the whip into the atmosphere. Weld the emergency damper or we sever the line.', style: 'comms', position: { bottom: '14px', right: '14px' } }],
          sfx: [{ word: 'キィィィン (KHYYYN)', style: 'cyan-electric', animation: 'glitch', position: { top: '14px', left: '20px' } }],
        },
      ],
    },

    // PAGE 3
    {
      pageNumber: 3,
      title: 'The Zero-G Insertion',
      act: 'Act I: Decompression at 36,000 Kilometers',
      sequenceBeat: 'Kinetic Deployment / Extreme Scale',
      layoutGrammar: 'Vertical Monolith Panel + Dual Diagonal Reaction Tier',
      panels: [
        {
          panelNumber: 1,
          geometry: 'vertical-monolith',
          flex: 6,
          cameraAngle: 'worm-eye',
          eyeVector: 'Top Thruster Ignition -> Center Falling Rig -> Bottom Swarming Apostles',
          artBrief: 'Dramatic vertical shot looking straight down the elevator shaft into the infinite blue curve of Earth. The Iron Mite rig fires dual chemical thrusters, plummeting down the cable toward a cloud of chrome swarmers.',
          generationPrompt: 'Extreme vertical angle looking down infinite space elevator cable towards Earth, heavy industrial construction mech diving with glowing blue rocket exhaust, speedlines radiating outward, Berserk level inking detail --ar 1:2',
          captions: [
            {
              text: 'DESCENT VELOCITY: MACH 4.8 // GRAVITATIONAL SHEAR: 8.4G\nNo parachutes. No rescue craft. Just 50 tons of reinforced tungsten and a high-frequency arc torch.',
              kind: 'technical-hud',
              position: { top: '20px', left: '16px', maxWidth: '80%' },
            },
          ],
          balloons: [],
          sfx: [{ word: 'ゴォォォォ (GO-OO-OO)', style: 'screentone-speed', animation: 'speedline', position: { right: '20px', top: '180px', fontSize: '55px' } }],
        },
        {
          panelNumber: 2,
          geometry: 'standard-rect',
          flex: 6,
          cameraAngle: 'close-up',
          eyeVector: 'Left Hand Valve -> Right Oxygen Readout',
          artBrief: 'Ren slamming two manual hydraulic lock handles forward, veins bulging on his forearm as G-forces pull his cheeks back.',
          generationPrompt: 'Close up of pilot hands in heavy mechanical gloves gripping hydraulic sticks, gauges redlining, intense speedlines, classic 1980s anime mecha cockpit --ar 16:9',
          captions: [],
          balloons: [{ speaker: 'REN', text: 'Damper clamps primed! If this arc doesn’t catch, tell ground control they owe my mother a pension!', style: 'shout', position: { bottom: '16px', left: '20px' } }],
          sfx: [{ word: 'CLANK-CHKK!', style: 'orange-kinetic', animation: 'shake', position: { top: '14px', right: '16px' } }],
        },
      ],
    },

    // PAGE 4
    {
      pageNumber: 4,
      title: 'Plasma Arc Ignition',
      act: 'Act I: Decompression at 36,000 Kilometers',
      sequenceBeat: 'High-Energy Combat / Industrial Weaponry',
      layoutGrammar: '3-Panel Horizontal Cascade',
      panels: [
        {
          panelNumber: 1,
          geometry: 'standard-rect',
          flex: 12,
          cameraAngle: 'medium',
          eyeVector: 'Left Rig Arm -> Center Blinding White Arc -> Right Cleaved Apostle',
          artBrief: 'The Iron Mite’s industrial plasma torch roaring to life in the vacuum, slicing a 30-meter Apostle scout drone cleanly in half with a cloud of crystalline debris and vaporized silicon.',
          generationPrompt: 'Action manga splash of industrial construction mech firing blinding white plasma arc cutter in space, bisecting crystalline geometric alien machine, explosive spark shower, Otomo lineart --ar 16:9',
          captions: [],
          balloons: [{ speaker: 'REN', text: 'Clear the conduit! You’re on my job site now!', style: 'shout', position: { bottom: '20px', left: '24px' } }],
          sfx: [{ word: 'バチィィッ (BA-CHYYY!)', style: 'cyan-electric', animation: 'shake', position: { top: '30px', right: '40px', fontSize: '54px' } }],
        },
      ],
    },

    // PAGE 5
    {
      pageNumber: 5,
      title: 'The Ghost of Sector 7',
      act: 'Act I: Decompression at 36,000 Kilometers',
      sequenceBeat: 'Psychological Trauma / Flashback Beat',
      layoutGrammar: 'Inverted Screentone Memory Spread',
      panels: [
        {
          panelNumber: 1,
          geometry: 'open-bleed',
          flex: 12,
          cameraAngle: 'close-up',
          eyeVector: 'Center Shattered Faceplate -> Surrounding Void',
          artBrief: 'Sensory memory flash: three years ago, Ren watching his copilot’s helmet faceplate crack during an explosive decompression event in Sector 7, silent frozen air crystals floating between them.',
          generationPrompt: 'Emotional black and white manga panel, cracked astronaut helmet faceplate reflecting screaming stars, frozen breath crystals in zero gravity, haunting memory vignette, Kentaro Miura psychological detail --ar 16:9',
          captions: [{ text: 'THREE YEARS AGO // THE SECTOR 7 RUPTURE\nYou don’t forget the sound of freezing blood. It sounds like paper tearing in the dark.', kind: 'internal-monologue', position: { top: '16px', left: '16px' } }],
          balloons: [],
          sfx: [{ word: 'ピキッ (PI-KI...)', style: 'cyan-electric', animation: 'float', position: { right: '40px', bottom: '30px' } }],
        },
      ],
    },

    // PAGE 6
    {
      pageNumber: 6,
      title: 'The Damper Station at 20,000 KM',
      act: 'Act II: The Atmospheric Descent',
      sequenceBeat: 'Arrival at the Target / Mechanical Complexity',
      layoutGrammar: 'Widescreen Megastructure Establishing + Inset',
      panels: [
        {
          panelNumber: 1,
          geometry: 'widescreen-letterbox',
          flex: 12,
          cameraAngle: 'wide',
          eyeVector: 'Top Damper Ring -> Center Swarming Crystalline Spikes -> Bottom Approaching Rig',
          artBrief: 'The Damper Ring at 20,000 km altitude: a colossal 500-meter titanium wheel encircling the elevator cable, completely encrusted with thousands of crystalline Apostle growth spikes.',
          generationPrompt: 'Megastructure hard sci-fi panel of gigantic industrial space station ring covered in crystalline geometric alien parasites, tiny construction mech approaching, Tsutomu Nihei Blame manga style --ar 21:9',
          captions: [{ text: 'STATION 14 DAMPER WHEEL // ALTITUDE: 20,400 KM\nStructural integrity: 34%. Silicon crystallization infecting the hydraulic dampers.', kind: 'technical-hud', position: { top: '14px', left: '14px' } }],
          balloons: [],
          sfx: [{ word: 'ヴォォォン (VOOO-ON)', style: 'cyan-electric', animation: 'pulse', position: { right: '30px', bottom: '20px' } }],
        },
      ],
    },

    // PAGE 7
    {
      pageNumber: 7,
      title: 'Welding Under Fire',
      act: 'Act II: The Atmospheric Descent',
      sequenceBeat: 'Tense Industrial Climax / Combat Repair',
      layoutGrammar: '3-Panel Slanted Cascade + SAM Cutout Breakout',
      panels: [
        {
          panelNumber: 1,
          geometry: 'slanted-slash-left',
          flex: 6,
          cameraAngle: 'close-up',
          eyeVector: 'Welding Torch Tip -> Molten Bead',
          artBrief: 'Extreme close up of the Iron Mite’s magnetic welder clamping onto the titanium collar, laying down a blinding white seam of molten metal.',
          generationPrompt: 'Close up of industrial robotic clamp welding glowing white hot seam on metal girder in space, sparks flying in vacuum, highly technical mechanical manga --ar 4:3',
          captions: [],
          balloons: [{ speaker: 'REN', text: 'Seam one holding! But the crystal swarm is chewing through the coolant line!', style: 'shout', position: { bottom: '12px', left: '12px' } }],
          sfx: [{ word: 'ジュウウウ (JUUUUU)', style: 'orange-kinetic', animation: 'shake', position: { top: '12px', right: '14px' } }],
        },
        {
          panelNumber: 2,
          geometry: 'slanted-slash-right',
          flex: 6,
          cameraAngle: 'medium',
          eyeVector: 'Incoming Apostle Spear -> Rig Cockpit',
          artBrief: 'An Apostle needle-drone plunging directly toward the cockpit window, its tip vibrating with sonic resonance.',
          generationPrompt: 'Dramatic manga action panel, sharp chrome crystalline spike hurtling directly toward mech cockpit glass, speedlines, extreme kinetic tension --ar 4:3',
          captions: [],
          balloons: [],
          sfx: [{ word: 'ドゴォッ (DO-GO!)', style: 'red-impact', animation: 'shake', position: { top: '14px', left: '16px' } }],
        },
      ],
    },

    // PAGE 8
    {
      pageNumber: 8,
      title: 'The Severed Arm',
      act: 'Act II: The Atmospheric Descent',
      sequenceBeat: 'Mechanical Sacrifice / Damage Escalation',
      layoutGrammar: 'Dual Split Action Tier',
      panels: [
        {
          panelNumber: 1,
          geometry: 'standard-rect',
          flex: 12,
          cameraAngle: 'medium',
          eyeVector: 'Severed Mechanical Arm -> Exploding Hydrazine',
          artBrief: 'The Iron Mite’s left stabilizer arm is sheared off by the Apostle drone, spraying hydrazine gas that instantly flashes into orange flame before extinguishing in vacuum.',
          generationPrompt: 'Explosive mechanical damage manga panel, giant robot arm tearing off with spraying oil and hydrazine sparks, floating into deep space, Otomo level detail --ar 16:9',
          captions: [{ text: 'LEFT STABILIZER DESTROYED // RCS THRUST DEGRADED BY 45%', kind: 'technical-hud', position: { top: '14px', left: '14px' } }],
          balloons: [{ speaker: 'REN', text: 'Lost left thruster bank! I’m operating on manual inertia now!', style: 'shout', position: { bottom: '16px', left: '20px' } }],
          sfx: [{ word: 'バギィィン (BA-GYN!)', style: 'red-impact', animation: 'shake', position: { top: '24px', right: '30px', fontSize: '50px' } }],
        },
      ],
    },

    // PAGE 9
    {
      pageNumber: 9,
      title: 'The Seraph Descends',
      act: 'Act II: The Atmospheric Descent',
      sequenceBeat: 'The Final Boss Materialization',
      layoutGrammar: 'Monumental 2.39:1 Letterbox Splash',
      panels: [
        {
          panelNumber: 1,
          geometry: 'widescreen-letterbox',
          flex: 12,
          cameraAngle: 'extreme-wide',
          eyeVector: 'Top Seraph Geometry -> Center Gravity Lens -> Bottom Tiny Mech',
          artBrief: 'Seraph-0, the colossal 200-meter Apostle prime tetrahedron, rotates slowly in front of Earth’s sun, warping starlight around its edges with a localized gravitational lens.',
          generationPrompt: 'Colossal alien geometric tetrahedron monolith blocking the sun in Earth orbit, gravitational light distortion, tiny industrial mech standing on circular station ring below, epic cosmic manga art --ar 21:9',
          captions: [{ text: 'APOSTLE PRIME // ENTITY DESIGNATION: SERAPH-0\nMass: 400,000 metric tons. Gravitational shear detected across elevator axis.', kind: 'technical-hud', position: { top: '16px', left: '16px' } }],
          balloons: [],
          sfx: [{ word: 'ゴゴゴゴゴ (GO-GO-GO-GO)', style: 'cyan-electric', animation: 'pulse', position: { right: '40px', bottom: '30px', fontSize: '52px' } }],
        },
      ],
    },

    // PAGE 10
    {
      pageNumber: 10,
      title: 'The Mathematical Chorus',
      act: 'Act II: The Atmospheric Descent',
      sequenceBeat: 'Alien Communication / Auditory Overload',
      layoutGrammar: 'Fractured Psychological Panel Array',
      panels: [
        {
          panelNumber: 1,
          geometry: 'standard-rect',
          flex: 6,
          cameraAngle: 'close-up',
          eyeVector: 'Ren Blood from Ear -> Audio Dial Overload',
          artBrief: 'Ren grimacing in pain as his helmet communications channel is overwhelmed with glowing mathematical symbols and harmonic waveforms that cause his ears to bleed.',
          generationPrompt: 'Close up of tortured anime pilot gripping helmet, glowing green mathematical equations reflecting on visor, nose bleeding from sonic pressure, intense psychological screentone --ar 16:9',
          captions: [],
          balloons: [{ speaker: 'SERAPH-0 (TRANSMISSION)', text: 'CARBON IS FRAGILE. JOIN THE CHROME WEAVE. THE TETHER MUST SING.', style: 'jagged-monster', position: { bottom: '16px', left: '16px' } }],
          sfx: [{ word: 'キィィィィン (KHYYYYYN)', style: 'cyan-electric', animation: 'glitch', position: { top: '14px', right: '20px' } }],
        },
        {
          panelNumber: 2,
          geometry: 'standard-rect',
          flex: 6,
          cameraAngle: 'close-up',
          eyeVector: 'Ren Teeth Gritted -> Emergency Switch',
          artBrief: 'Ren slamming his fist down on the cockpit audio cutoff switch, severing the alien transmission with raw human fury.',
          generationPrompt: 'Close up of pilot hand punching red breaker switch, determined expression, teeth bared, sweat flying in zero gravity, classic 1980s mecha determination --ar 16:9',
          captions: [],
          balloons: [{ speaker: 'REN', text: 'I don’t sing hymns, machine. I weld pipe!', style: 'shout', position: { bottom: '16px', right: '16px' } }],
          sfx: [{ word: 'CLACK!', style: 'orange-kinetic', animation: 'shake', position: { top: '14px', left: '16px' } }],
        },
      ],
    },

    // PAGE 11
    {
      pageNumber: 11,
      title: 'Treadwell’s Dilemma',
      act: 'Act II: The Atmospheric Descent',
      sequenceBeat: 'Ground Control Tension / The Human Counterweight',
      layoutGrammar: 'Dual Split Horizontal Layout',
      panels: [
        {
          panelNumber: 1,
          geometry: 'widescreen-letterbox',
          flex: 12,
          cameraAngle: 'wide',
          eyeVector: 'Left Treadwell Hand on Key -> Center Holographic Globe -> Right Subordinates',
          artBrief: 'Pacific Naval Command bunker on Earth. Commander Treadwell staring at the giant holographic projection of the tether beginning to glow red as it enters the mesosphere. Her hand hovers over the physical launch key.',
          generationPrompt: 'Dark futuristic military war room, female commander with red cybernetic implant hovering hand over detonation key, giant holographic Earth showing space elevator falling, tension and drama --ar 21:9',
          captions: [{ text: 'PACIFIC TETHER COMMAND // TOKYO UNDER-BAY\nAltitude dropping through 12,000 km. In 180 seconds, atmospheric re-entry will be irreversible.', kind: 'time-location', position: { top: '14px', left: '14px' } }],
          balloons: [{ speaker: 'COMMANDER TREADWELL', text: 'Ren... if you don’t lock that damper in forty seconds, I have to burn the explosive collar. I have four billion people on this coastline.', style: 'comms', position: { bottom: '16px', left: '24px' } }],
        },
      ],
    },

    // PAGE 12
    {
      pageNumber: 12,
      title: 'Overclocking the Reactor',
      act: 'Act II: The Atmospheric Descent',
      sequenceBeat: 'The Suicide Charge / All Limits Removed',
      layoutGrammar: 'High-Velocity Vertical Action Cut',
      panels: [
        {
          panelNumber: 1,
          geometry: 'standard-rect',
          flex: 12,
          cameraAngle: 'close-up',
          eyeVector: 'Center Breaking Safety Wire -> Core Meter Redlining',
          artBrief: 'Ren pulling the yellow wire lock from the reactor overdrive panel, turning the fuel injector to 200%. The cockpit glows blinding white.',
          generationPrompt: 'Action close up of mech pilot ripping safety lock off reactor throttle, gauge needle snapping off in red zone, cockpit bathed in blinding white reactor light, speedlines --ar 16:9',
          captions: [{ text: 'OVERDRIVE ENGAGED // CORE TEMPERATURE: 4,200 KELVIN\nReactor life expectancy: 60 seconds.', kind: 'technical-hud', position: { top: '16px', left: '16px' } }],
          balloons: [{ speaker: 'REN', text: 'Hold your key, Commander! I’m taking the damper with me!', style: 'shout', position: { bottom: '20px', left: '24px' } }],
          sfx: [{ word: 'ギィィィィ (GY-YYYY)', style: 'orange-kinetic', animation: 'shake', position: { right: '30px', top: '30px', fontSize: '50px' } }],
        },
      ],
    },

    // PAGE 13
    {
      pageNumber: 13,
      title: 'The Kinetic Ram',
      act: 'Act II: The Atmospheric Descent',
      sequenceBeat: 'The Impact / Climax of Act II',
      layoutGrammar: 'Monumental Diagonal Slash Splash',
      panels: [
        {
          panelNumber: 1,
          geometry: 'slanted-slash-left',
          flex: 12,
          cameraAngle: 'low-angle-heroic',
          eyeVector: 'Top Rig Prow -> Center Seraph Core Shatter -> Bottom Earth Horizon',
          artBrief: 'The Iron Mite, engulfed in blue reactor fire, rams directly into the center of Seraph-0. The 200-meter alien tetrahedron shatters like a chandelier of chrome, shockwaves rippling across the carbon cable.',
          generationPrompt: 'Monumental manga double splash, heavy industrial mech ramming giant geometric alien diamond entity in space, explosive shatter of chrome crystal shards, massive energy discharge, Kentaro Miura Berserk impact weight --ar 16:9',
          captions: [],
          balloons: [],
          sfx: [{ word: 'ドガァァァァン (DO-GAA-AA-AN!)', style: 'red-impact', animation: 'shake', position: { left: '40px', top: '40px', fontSize: '64px' } }],
        },
      ],
    },

    // PAGE 14
    {
      pageNumber: 14,
      title: 'The Damper Catches',
      act: 'Act II: The Atmospheric Descent',
      sequenceBeat: 'The Mechanical Miracle',
      layoutGrammar: 'Dual Detailed Technical Tier',
      panels: [
        {
          panelNumber: 1,
          geometry: 'standard-rect',
          flex: 6,
          cameraAngle: 'close-up',
          eyeVector: 'Collar Teeth Locking -> Cable Squeal',
          artBrief: 'The giant titanium teeth of the Station 14 damper collar bite into the carbon elevator cable, spitting thousands of glowing orange carbon sparks.',
          generationPrompt: 'Extreme close up of colossal mechanical gear teeth biting into carbon cable, friction sparks showering like a waterfall of fire, technical manga linework --ar 4:3',
          captions: [],
          balloons: [],
          sfx: [{ word: 'ギャリィィィ (GYA-RYYY)', style: 'orange-kinetic', animation: 'shake', position: { top: '16px', right: '16px' } }],
        },
        {
          panelNumber: 2,
          geometry: 'standard-rect',
          flex: 6,
          cameraAngle: 'medium',
          eyeVector: 'Tension Gauge Dropping -> Normal Zone',
          artBrief: 'Ren’s cockpit display showing cable oscillation dampening from 80% to 12%. The whip is stabilizing.',
          generationPrompt: 'Close up of holographic cockpit vector display showing sinusoidal wave flattening into straight line, green status text, exhausted pilot sighing --ar 4:3',
          captions: [{ text: 'CABLE OSCILLATION STABILIZED // TETHER WHIP ARRESTED', kind: 'technical-hud', position: { top: '12px', left: '12px' } }],
          balloons: [{ speaker: 'TREADWELL (COMMS)', text: 'The wave... it stopped. Ren, you caught it!', style: 'shout', position: { bottom: '14px', right: '14px' } }],
        },
      ],
    },

    // PAGE 15
    {
      pageNumber: 15,
      title: 'Falling into Fire',
      act: 'Act III: Terminal Entry & The Pacific Anchor',
      sequenceBeat: 'The Re-Entry Crucible',
      layoutGrammar: 'Widescreen Atmospheric Heat Spread',
      panels: [
        {
          panelNumber: 1,
          geometry: 'widescreen-letterbox',
          flex: 12,
          cameraAngle: 'extreme-wide',
          eyeVector: 'Top Red Entry Plasma -> Center Flaming Rig -> Bottom Pacific Ocean',
          artBrief: 'The battered Iron Mite plunges into Earth’s upper atmosphere at 100 km altitude, wrapped in a blazing cocoon of orange and violet re-entry plasma.',
          generationPrompt: 'Extreme wide re-entry shot, battered industrial mech entering Earth atmosphere engulfed in blazing orange fire shockwave, blue Pacific ocean below, high budget anime film still --ar 21:9',
          captions: [{ text: 'ATMOSPHERIC ENTRY // ALTITUDE: 92 KM // VELOCITY: MACH 18\nThermal shielding compromised. Interior cockpit temperature rising past 60°C.', kind: 'technical-hud', position: { top: '16px', left: '16px' } }],
          balloons: [],
          sfx: [{ word: 'ゴォォォォォ (GOOOOO-OOO)', style: 'orange-kinetic', animation: 'speedline', position: { right: '40px', bottom: '24px', fontSize: '56px' } }],
        },
      ],
    },

    // PAGE 16
    {
      pageNumber: 16,
      title: 'Blood on the Glass',
      act: 'Act III: Terminal Entry & The Pacific Anchor',
      sequenceBeat: 'Extreme Physical Strain / Survival Grit',
      layoutGrammar: 'Close-Up Reaction Duel',
      panels: [
        {
          panelNumber: 1,
          geometry: 'standard-rect',
          flex: 6,
          cameraAngle: 'close-up',
          eyeVector: 'Ren Face Scorched -> Visor Cracking',
          artBrief: 'Inside the cockpit: Ren’s helmet faceplate spiderwebbed with heat cracks. Sweat and blood drip into his eyes as the G-forces pin him into his seat.',
          generationPrompt: 'Intense close up of bruised anime pilot face inside burning cockpit, helmet glass cracked, blood dripping from nose, intense orange glow reflecting on face, Otomo Akira style --ar 16:9',
          captions: [],
          balloons: [{ speaker: 'REN', text: 'Just twenty kilometers more... stay together, you old bucket of bolts...', style: 'whisper', position: { bottom: '16px', left: '16px' } }],
        },
        {
          panelNumber: 2,
          geometry: 'standard-rect',
          flex: 6,
          cameraAngle: 'close-up',
          eyeVector: 'Ejection Handle -> Hand Reaching',
          artBrief: 'Ren reaching trembling mechanical gauntlet toward the emergency capsule release lever.',
          generationPrompt: 'Close up of gloved hand gripping yellow ejection handle amidst flashing alarm lights and melting plastic, extreme tension --ar 16:9',
          captions: [],
          balloons: [],
          sfx: [{ word: 'CREEEAAAK!', style: 'red-impact', animation: 'shake', position: { top: '14px', right: '16px' } }],
        },
      ],
    },

    // PAGE 17
    {
      pageNumber: 17,
      title: 'The Parachute Chute Bloom',
      act: 'Act III: Terminal Entry & The Pacific Anchor',
      sequenceBeat: 'The Relief of Deceleration',
      layoutGrammar: 'Open Bleed Sky Splash',
      panels: [
        {
          panelNumber: 1,
          geometry: 'open-bleed',
          flex: 12,
          cameraAngle: 'wide',
          eyeVector: 'Top Giant Tri-Parachutes -> Center Scorched Capsule -> Bottom Midnight Sea',
          artBrief: 'Altitude 5 km. Three gigantic orange-and-white deceleration parachutes bloom against the dark sky, gently lowering the smoking, charred command capsule toward the calm midnight Pacific Ocean.',
          generationPrompt: 'Wide shot of three giant orange and white parachutes deployed in night sky, holding charred smoking escape pod, moonlight reflecting on ocean waves below, beautiful atmospheric anime art --ar 16:9',
          captions: [{ text: 'ALTITUDE: 4,200 METERS // TERMINAL VELOCITY ARRESTED\nMain chutes deployed. The sky is silent again.', kind: 'technical-hud', position: { top: '16px', left: '16px' } }],
          balloons: [],
          sfx: [{ word: 'WHOOOOOOSH...', style: 'cyan-electric', animation: 'float', position: { right: '40px', top: '30px' } }],
        },
      ],
    },

    // PAGE 18
    {
      pageNumber: 18,
      title: 'Splashdown in the Trench',
      act: 'Act III: Terminal Entry & The Pacific Anchor',
      sequenceBeat: 'The Water Impact',
      layoutGrammar: 'Dynamic Low Angle Tier',
      panels: [
        {
          panelNumber: 1,
          geometry: 'standard-rect',
          flex: 12,
          cameraAngle: 'low-angle-heroic',
          eyeVector: 'Capsule Water Entry -> Giant Foam Spray',
          artBrief: 'The charred capsule hits the ocean surface with a thunderous geyser of white foam and hissing steam as the red-hot hull meets cold sea water.',
          generationPrompt: 'Dramatic comic panel of space pod splashing down into dark ocean waves, massive fountain of water and white steam erupting into night sky, high contrast inking --ar 16:9',
          captions: [{ text: 'SPLASHDOWN CONFIRMED // PACIFIC RECOVERY ZONE BETA', kind: 'time-location', position: { top: '14px', left: '14px' } }],
          balloons: [],
          sfx: [{ word: 'KAAAA-SPLAAAASH!', style: 'cyan-electric', animation: 'shake', position: { left: '40px', top: '30px', fontSize: '54px' } }],
        },
      ],
    },

    // PAGE 19
    {
      pageNumber: 19,
      title: 'Hatch Blown',
      act: 'Act III: Terminal Entry & The Pacific Anchor',
      sequenceBeat: 'Breathing Fresh Air',
      layoutGrammar: 'Dual Emotional Intimacy Tier',
      panels: [
        {
          panelNumber: 1,
          geometry: 'standard-rect',
          flex: 6,
          cameraAngle: 'medium',
          eyeVector: 'Blown Hatch Flying -> Inrushing Sea Breeze',
          artBrief: 'Ren blowing the emergency hatch explosive bolts. Cold, salty sea breeze and moonlight flood into the scorched, smoke-filled cockpit.',
          generationPrompt: 'Medium comic panel of smoking hatch blowing open with small pop of explosive bolts, moonlight and ocean air rushing into dark cockpit, pilot breathing deeply --ar 16:9',
          captions: [],
          balloons: [],
          sfx: [{ word: 'PFFT-CLANG!', style: 'orange-kinetic', animation: 'shake', position: { top: '14px', right: '16px' } }],
        },
        {
          panelNumber: 2,
          geometry: 'standard-rect',
          flex: 6,
          cameraAngle: 'close-up',
          eyeVector: 'Ren Removing Helmet -> Tears & Ocean Salt',
          artBrief: 'Close up of Ren removing his melted helmet, inhaling the rich, cold Pacific air. Real oxygen. Real wind.',
          generationPrompt: 'Close up of exhausted anime pilot taking off scorched helmet, messy hair in sea wind, tears cutting through soot on cheeks, peaceful expression --ar 16:9',
          captions: [{ text: 'No regulator click. No ozone. Just salt, wind... and the earth.', kind: 'internal-monologue', position: { top: '12px', left: '12px' } }],
          balloons: [{ speaker: 'REN', text: 'I’m down, Treadwell. It held.', style: 'whisper', position: { bottom: '14px', right: '14px' } }],
        },
      ],
    },

    // PAGE 20
    {
      pageNumber: 20,
      title: 'The Unbroken Thread',
      act: 'Act III: Terminal Entry & The Pacific Anchor',
      sequenceBeat: 'The Final Monumental Masterwork Ending',
      layoutGrammar: 'Full Page Open Bleed Panoramic Epilogue',
      panels: [
        {
          panelNumber: 1,
          geometry: 'open-bleed',
          flex: 12,
          cameraAngle: 'extreme-wide',
          eyeVector: 'Bottom Ren in Raft -> Center Calm Pacific -> Top Single Silver Line Piercing Dawn Sky',
          artBrief: 'Ren sitting on the edge of the floating yellow life raft in the center of the vast, mirror-calm Pacific Ocean at dawn. Far in the distance behind him, rising straight into the pale pink morning sky, stands the Aphelion 9 space elevator—a single, razor-thin silver thread reaching straight up into the fading stars, unbroken and triumphant.',
          generationPrompt: 'Masterpiece anime ending scene, lone pilot sitting in yellow raft on calm dawn ocean, looking up at an impossible single silver space elevator cable rising straight into the pink and gold morning sky towards the stars, beautiful atmospheric lighting, Hayao Miyazaki and Otomo scale --ar 21:9',
          captions: [
            {
              text: '06:30 AM. PACIFIC TRENCH.\nThe Apostles came to test our foundation. They found out we don\'t build with titanium.\nWe build with stubbornness.\n\nEND OF CHROME APOSTLE: APHELION 9.',
              kind: 'internal-monologue',
              position: { bottom: '28px', left: '28px', maxWidth: '75%' },
            },
          ],
          balloons: [],
        },
      ],
    },
  ],
  remixIdeas: [
    'Adapt the orbital tether setting into an abyssal trench geothermal drill in the Mariana Trench.',
    'Replace the silicon Apostles with bio-mechanical leviathans bred by deep-space terraformers.',
    'Change the protagonist to a rogue synthetic android seeking the silicon hive-mind consciousness.',
  ],
  councilDirectorNotes: 'Seinen manga kineticism is defined by weight and speedlines. Every mechanical plate must look functional and greasy. SFX are not afterthoughts; they are carved into the panel perspective.',
};
