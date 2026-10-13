// data/showcase/comics/singularityGods.ts
// Master Showcase Book: SINGULARITY GODS: THE OMEGA FORGE
// COMPLETE UNABRIDGED 16-PAGE SEQUENTIAL ART SCRIPT

import { ShowcaseComicBook } from '../comicTypes';

export const singularityGods: ShowcaseComicBook = {
  "id": "singularity-gods",
  "templateId": "comic-silver-architect",
  "title": "SINGULARITY GODS: THE OMEGA FORGE",
  "subtitle": "The Dimensional Anvil and the Last Titan of Vega",
  "genre": "silver-architect",
  "councilLenses": {
    "leadArtist": "Jack Kirby & Jim Steranko (Monumental Foreshortening, Kirby Krackle & 3D Layered Scale)",
    "leadWriter": "Jonathan Hickman & Stan Lee (Mythic Cosmic Cadence & Grand Metaphysical Stakes)",
    "storyIntelligence": "Plajah Silver-Architect Engine (Offset 3D Drop Shadows, Primary Color Vibrance, Dimensional SFX Extrusions)"
  },
  "targetAudience": "young-adult-13+",
  "pageCount": 16,
  "logline": "When the dying star of Vega collapses into an artificial singularity controlled by the Entropic Demiurge, the last Sentinel of the Prime Forge must wield the hammer of collapsed neutronium to forge a new celestial law before reality dissolves.",
  "blurb": "Before there was matter, there was the Forge. For ten billion years, the Sentinels shaped the gravitational corridors of galaxies. Now, only Orion Thorne remains. At the edge of the Omega Void, the Entropic Demiurge has unleashed the Anti-Concept: a living cosmic frequency that unmakes physical constants. With his celestial armor bleeding incandescent solar plasma, Thorne descends into the heart of the dying singularity to strike the final blow.",
  "theme": "The triumph of indomitable will and creative purpose against cosmic nihilism and entropy.",
  "visualGrammar": {
    "gutterWidth": "18px",
    "gutterColor": "#0b081d",
    "pageTexture": "kirby-krackle-cosmic-dots",
    "primaryPalette": [
      "#1e1b4b",
      "#f59e0b",
      "#ef4444",
      "#06b6d4",
      "#ffffff"
    ],
    "typography": {
      "bodyFont": "system-ui, -apple-system, sans-serif",
      "captionFont": "Arial Black, Impact, sans-serif",
      "sfxFont": "Impact, Arial Black, sans-serif"
    },
    "inkingStyle": "Monolithic bold outlines, extreme dynamic foreshortening breaking panel gutters, dense cosmic Kirby Krackle particle fields, vibrant primary yellow/cyan/red block highlights."
  },
  "characters": [
    {
      "id": "orion-thorne",
      "name": "Orion Thorne (The Last Sentinel)",
      "role": "protagonist",
      "archetype": "The Cosmic Titan",
      "personality": [
        "noble",
        "indomitable",
        "monumental",
        "philosophical",
        "heroic"
      ],
      "lockedVisualLook": "Towering celestial titan clad in gold-and-vermilion segmental armor, chestplate adorned with a glowing sun-sigil, wielding the massive two-handed neutronium warhammer \"World-Breaker\".",
      "palette": [
        "#f59e0b",
        "#dc2626",
        "#ffffff",
        "#1e1b4b"
      ],
      "voiceSignature": "Booming, grandiloquent mythic cadence reminiscent of Silver Age cosmic champions.",
      "arc": "Carries the burden of his fallen Pantheon; realizes the Forge does not preserve the past, but demands sacrificing himself to seed future galaxies."
    },
    {
      "id": "entropic-demiurge",
      "name": "The Entropic Demiurge (Null-Zeno)",
      "role": "antagonist",
      "archetype": "The Living Void",
      "personality": [
        "inexorable",
        "colossal",
        "cold",
        "devouring"
      ],
      "lockedVisualLook": "A planet-sized humanoid shadow crowned with black event horizons, hands manifesting as swirling whirlpools of disintegrated stars and purple anti-matter.",
      "palette": [
        "#000000",
        "#7c3aed",
        "#3b82f6",
        "#ffffff"
      ],
      "voiceSignature": "A cosmic sub-bass vibration that resonates directly in the reader’s skull.",
      "arc": "Seeks to return the universe to uniform cold thermodynamic equilibrium."
    }
  ],
  "pages": [
    {
      "pageNumber": 1,
      "title": "The Collapsing Quasar",
      "act": "Act I: The Singularity Threshold",
      "sequenceBeat": "Monumental Heroic Splash / Cosmic Scale",
      "layoutGrammar": "Monumental Heroic Splash + 3D Primary Action Blocks",
      "panels": [
        {
          "panelNumber": 1,
          "geometry": "open-bleed",
          "flex": 12,
          "cameraAngle": "low-angle-heroic",
          "eyeVector": "Top Caption -> Center Raised Hammer -> Bottom Kirby Krackle Void",
          "artBrief": "Orion Thorne standing atop a fractured cosmic altar floating before a gargantuan violet black hole, his neutronium hammer raised to the cosmos, surrounded by explosive yellow Kirby Krackle energy dots.",
          "generationPrompt": "Low angle epic heroic cosmic comic book splash page, Jack Kirby art style, colossal god warrior in golden armor holding massive hammer aloft, vibrant Kirby Krackle energy spheres radiating from weapon, cosmic purple galaxy vortex background, bold 1970s comic inking --ar 16:9",
          "captions": [
            {
              "text": "THE OMEGA ANVIL // BEYOND THE SHORES OF VEGA\nTen billion suns were struck upon this stone. And here, upon the rim of nothingness, the hammer shall fall once more!",
              "kind": "voiceover",
              "position": {
                "top": "18px",
                "left": "18px",
                "maxWidth": "65%"
              }
            }
          ],
          "balloons": [
            {
              "speaker": "ORION THORNE",
              "text": "HEAR ME, EMPTY VOID! WHILE ONE SPARK DRAWS BREATH IN THE CRUCIBLE, CREATION SHALL NOT YIELD!",
              "style": "shout",
              "position": {
                "bottom": "24px",
                "right": "30px",
                "maxWidth": "75%"
              }
            }
          ],
          "sfx": [
            {
              "word": "KRRRA-KTOOOOM!",
              "style": "kirby-crackle",
              "animation": "shake",
              "position": {
                "left": "40px",
                "top": "120px",
                "fontSize": "56px"
              }
            }
          ]
        }
      ]
    },
    {
      "pageNumber": 2,
      "title": "The Demiurge Unfurls",
      "act": "Act I: The Singularity Threshold",
      "sequenceBeat": "Antagonist Scale Reveal / Cosmic Collision",
      "layoutGrammar": "Dual Split Horizontal Clash + Foreground Breakout",
      "panels": [
        {
          "panelNumber": 1,
          "geometry": "widescreen-letterbox",
          "flex": 6,
          "cameraAngle": "extreme-wide",
          "eyeVector": "Top Null Crown -> Center Devoured Star -> Bottom Reach",
          "artBrief": "The Entropic Demiurge reaches a black claw across three solar systems, crushing a crimson giant star like an ember between its fingers.",
          "generationPrompt": "Cosmic space opera wide panel, colossal shadow entity crowned with black hole halo crushing a sun with its hand, solar flare ejection, Steranko dynamic comic layout --ar 21:9",
          "captions": [
            {
              "text": "The Demiurge does not conquer. It simply cancels.",
              "kind": "voiceover",
              "position": {
                "top": "14px",
                "left": "16px",
                "maxWidth": "50%"
              }
            }
          ],
          "balloons": [
            {
              "speaker": "NULL-ZENO",
              "text": "YOUR LIGHT IS A FLEETING PARASITE UPON ETERNAL SILENCE, SENTINEL.",
              "style": "jagged-monster",
              "position": {
                "bottom": "16px",
                "right": "20px",
                "maxWidth": "70%"
              }
            }
          ],
          "sfx": [
            {
              "word": "CRUUUSSHHH!",
              "style": "red-impact",
              "animation": "shake",
              "position": {
                "top": "20px",
                "right": "40px"
              }
            }
          ]
        },
        {
          "panelNumber": 2,
          "geometry": "standard-rect",
          "flex": 6,
          "cameraAngle": "low-angle-heroic",
          "eyeVector": "Bottom Thorne Vault -> Top Strike Vector",
          "artBrief": "Thorne vaults into the vacuum, blazing trails of golden cosmic fire from his heels, striking the Demiurge’s palm with a thunderous kinetic impact.",
          "generationPrompt": "Dynamic heroic leap comic panel, golden armored cosmic hero striking giant shadow hand with glowing warhammer, massive energy burst, Kirby Krackle explosion --ar 16:9",
          "captions": [],
          "balloons": [
            {
              "speaker": "ORION THORNE",
              "text": "THEN WITNESS THE WILL OF THE FORGE!",
              "style": "shout",
              "position": {
                "bottom": "18px",
                "left": "24px"
              }
            }
          ],
          "sfx": [
            {
              "word": "THOOOOOOM!",
              "style": "orange-kinetic",
              "animation": "pulse",
              "position": {
                "left": "30px",
                "top": "30px",
                "fontSize": "60px"
              }
            }
          ]
        }
      ]
    },
    {
      "pageNumber": 3,
      "title": "The Shattered Constellations",
      "act": "Act I: The Singularity Threshold",
      "sequenceBeat": "Dimensional War / Reality Bending",
      "layoutGrammar": "3-Panel Dynamic Cascade",
      "panels": [
        {
          "panelNumber": 1,
          "geometry": "slanted-slash-left",
          "flex": 4,
          "cameraAngle": "close-up",
          "eyeVector": "Hammer Face Striking Quark Bed -> Sparks",
          "artBrief": "Extreme close up of the neutronium hammer striking a bed of primordial quarks, releasing blinding prismatic beams of geometric light.",
          "generationPrompt": "Extreme close up cosmic hammer impact, prismatic laser beams bursting from cracked stone anvil, Jack Kirby dots, vibrant primary colors --ar 1:1",
          "captions": [],
          "balloons": [],
          "sfx": [
            {
              "word": "ZRAAAK!",
              "style": "cyan-electric",
              "animation": "shake",
              "position": {
                "top": "14px",
                "left": "14px"
              }
            }
          ]
        },
        {
          "panelNumber": 2,
          "geometry": "standard-rect",
          "flex": 8,
          "cameraAngle": "wide",
          "eyeVector": "Thorne Stance -> Surrounding Supernova Shockwave",
          "artBrief": "Thorne standing at the eye of a newborn supernova, swinging his weapon in monumental 360-degree arcs to weave magnetic containment rings around the singularity.",
          "generationPrompt": "Heroic god warrior weaving magnetic rings around purple singularity, solar plasma arcing around muscular golden armor, classic 1970s Marvel cosmic scale --ar 16:9",
          "captions": [
            {
              "text": "THE SEVENTH LAW OF GRAVITY\nForged not from equations, but from the refusal to be unmade.",
              "kind": "voiceover",
              "position": {
                "top": "16px",
                "left": "16px"
              }
            }
          ],
          "balloons": [
            {
              "speaker": "THORNE",
              "text": "BIND THE VOID! LET THERE BE WEIGHT! LET THERE BE TIME!",
              "style": "shout",
              "position": {
                "bottom": "20px",
                "right": "24px"
              }
            }
          ],
          "sfx": [
            {
              "word": "KLA-THOOOOM!",
              "style": "orange-kinetic",
              "animation": "shake",
              "position": {
                "top": "24px",
                "right": "30px",
                "fontSize": "52px"
              }
            }
          ]
        }
      ]
    },
    {
      "pageNumber": 4,
      "title": "The Seven Celestial Trials",
      "act": "Act II: The Crucible of Vega",
      "sequenceBeat": "Reality Distortion & Cosmic Trials",
      "layoutGrammar": "3-Panel Asymmetric Cube Cascade",
      "panels": [
        {
          "panelNumber": 1,
          "geometry": "standard-rect",
          "flex": 6,
          "cameraAngle": "wide",
          "eyeVector": "Center Thorne -> Surrounding Prismatic Cubes",
          "artBrief": "Dimensional space fractures into glowing hyper-cubes; constellations twist like kaleidoscopic glass shards around Thorne as reality stutters.",
          "generationPrompt": "Cosmic Kirby Steranko psychedelic comic page, cosmic hero trapped in kaleidoscope of cubic dimensional mirrors, surreal geometry, Kirby dots --ar 16:9",
          "captions": [
            {
              "text": "Trial of Geometry: The Demiurge unmakes Euclidean dimensions.",
              "kind": "voiceover",
              "position": {
                "top": "12px",
                "left": "12px"
              }
            }
          ],
          "balloons": [
            {
              "speaker": "ORION THORNE",
              "text": "GEOMETRY IS BUT THE ANVIL’S SHADOW! I AM THE HAMMER!",
              "style": "shout",
              "position": {
                "bottom": "12px",
                "right": "16px"
              }
            }
          ],
          "sfx": [
            {
              "word": "SHRRR-ZZT!",
              "style": "cyan-electric",
              "animation": "glitch",
              "position": {
                "top": "20px",
                "right": "20px"
              }
            }
          ]
        },
        {
          "panelNumber": 2,
          "geometry": "slanted-slash-right",
          "flex": 6,
          "cameraAngle": "close-up",
          "eyeVector": "Thorne Eyes -> Molten Gold Corona",
          "artBrief": "Tight close up on Thorne’s eyes blazing with pure thermonuclear white-gold fury, cracking the dimensional glass with sheer willpower.",
          "generationPrompt": "Close up comic art heroic warrior eyes burning with cosmic gold fire, Kirby Krackle radiating from brow, intense Silver Age defiance --ar 16:9",
          "captions": [],
          "balloons": [],
          "sfx": [
            {
              "word": "KRAAA-KTOOM!",
              "style": "kirby-crackle",
              "animation": "pulse",
              "position": {
                "bottom": "16px",
                "left": "16px"
              }
            }
          ]
        }
      ]
    },
    {
      "pageNumber": 5,
      "title": "The Anti-Concept Swarm",
      "act": "Act II: The Crucible of Vega",
      "sequenceBeat": "Entropy Swarm Assault",
      "layoutGrammar": "Widescreen Void Inversion",
      "panels": [
        {
          "panelNumber": 1,
          "geometry": "widescreen-letterbox",
          "flex": 12,
          "cameraAngle": "extreme-wide",
          "eyeVector": "Left Swarm Wave -> Center Thorne Shield -> Right Void Chasm",
          "artBrief": "Trillions of anti-concept void locusts made of black inverted light storm toward Thorne, eating away at the planetary debris around him.",
          "generationPrompt": "Extreme wide cosmic comic battle, colossal swarm of black void locusts devouring stars, lone golden warrior holding blazing plasma shield --ar 21:9",
          "captions": [
            {
              "text": "They do not eat flesh. They consume the very concept of existence.",
              "kind": "voiceover",
              "position": {
                "top": "14px",
                "left": "16px"
              }
            }
          ],
          "balloons": [
            {
              "speaker": "NULL-ZENO",
              "text": "FORGET YOUR SUNS, WANDERER. EMBRACE UNCREATION.",
              "style": "jagged-monster",
              "position": {
                "bottom": "14px",
                "right": "24px"
              }
            }
          ],
          "sfx": [
            {
              "word": "HISSSSS-SKRRRRR!",
              "style": "red-impact",
              "animation": "shake",
              "position": {
                "top": "24px",
                "right": "40px"
              }
            }
          ]
        }
      ]
    },
    {
      "pageNumber": 6,
      "title": "The Anvil of Pulsars",
      "act": "Act II: The Crucible of Vega",
      "sequenceBeat": "Cosmic Weapon Forging",
      "layoutGrammar": "Dual Split Action Tier",
      "panels": [
        {
          "panelNumber": 1,
          "geometry": "standard-rect",
          "flex": 6,
          "cameraAngle": "medium",
          "eyeVector": "Pulsar Beams -> Thorne Warhammer",
          "artBrief": "Thorne grabs the relativistic jets of twin binary pulsars with his bare hands, channeling their gamma radiation directly into the World-Breaker warhammer.",
          "generationPrompt": "Heroic cosmic titan channeling binary pulsar laser beams into warhammer, muscular golden armor glowing white hot, Kirby dots exploding --ar 16:9",
          "captions": [],
          "balloons": [
            {
              "speaker": "ORION THORNE",
              "text": "I TEMPER THIS STEEL WITH THE PULSE OF DYING STARS!",
              "style": "shout",
              "position": {
                "bottom": "16px",
                "left": "16px"
              }
            }
          ],
          "sfx": [
            {
              "word": "BZZZZZT-ROOOAR!",
              "style": "cyan-electric",
              "animation": "pulse",
              "position": {
                "top": "16px",
                "right": "20px"
              }
            }
          ]
        },
        {
          "panelNumber": 2,
          "geometry": "standard-rect",
          "flex": 6,
          "cameraAngle": "close-up",
          "eyeVector": "Hammer Head -> Glowing Quantum Runes",
          "artBrief": "The warhammer head turns incandescent crimson, inscribed with ancient cosmic equations of atomic fusion and celestial renewal.",
          "generationPrompt": "Close up cosmic warhammer glowing with molten celestial runes, sparks and Kirby Krackle floating in zero gravity --ar 16:9",
          "captions": [
            {
              "text": "The weight of a hundred white dwarfs condensed into an edge three atoms wide.",
              "kind": "voiceover",
              "position": {
                "top": "14px",
                "left": "14px"
              }
            }
          ],
          "balloons": [],
          "sfx": [
            {
              "word": "VHRRRRRR!",
              "style": "orange-kinetic",
              "animation": "float",
              "position": {
                "bottom": "14px",
                "right": "14px"
              }
            }
          ]
        }
      ]
    },
    {
      "pageNumber": 7,
      "title": "Clashing Across Light-Years",
      "act": "Act II: The Crucible of Vega",
      "sequenceBeat": "The Monumental Clash",
      "layoutGrammar": "Full Page Dynamic Diagonal Collision",
      "panels": [
        {
          "panelNumber": 1,
          "geometry": "open-bleed",
          "flex": 12,
          "cameraAngle": "extreme-wide",
          "eyeVector": "Top Right Demiurge Fist -> Bottom Left Thorne Strike -> Center Kinetic Detonation",
          "artBrief": "Thorne leaps across ten astronomical units in a single heartbeat, smashing the World-Breaker against Null-Zeno’s black-hole chestplate in a cataclysm of light.",
          "generationPrompt": "Epic cosmic battle collision, golden god warrior striking colossal shadow deity with warhammer, shockwave shattering asteroid rings, vibrant yellow Kirby dots --ar 21:9",
          "captions": [
            {
              "text": "THE CONCUSSION ECHOES ACROSS THREE CENTURIES OF LIGHT.\nPlanets shiver in their orbits. The black hole itself rings like a struck iron bell.",
              "kind": "voiceover",
              "position": {
                "top": "24px",
                "left": "24px",
                "maxWidth": "60%"
              }
            }
          ],
          "balloons": [],
          "sfx": [
            {
              "word": "KRA-KTOOOOOOOOOOM!",
              "style": "kirby-crackle",
              "animation": "shake",
              "position": {
                "left": "35%",
                "top": "45%",
                "fontSize": "64px"
              }
            }
          ]
        }
      ]
    },
    {
      "pageNumber": 8,
      "title": "The Fallen Pantheon’s Echo",
      "act": "Act II: The Crucible of Vega",
      "sequenceBeat": "Spiritual Cosmic Communion",
      "layoutGrammar": "Tri-Panel Mystical Tier",
      "panels": [
        {
          "panelNumber": 1,
          "geometry": "standard-rect",
          "flex": 4,
          "cameraAngle": "close-up",
          "eyeVector": "Thorne Bleeding Plasma -> Ghostly Faces",
          "artBrief": "Thorne’s golden armor cracked open, bleeding incandescent golden plasma. Around him float the spectral, monumental faces of the ancient Sentinels of Vega.",
          "generationPrompt": "Wounded cosmic god warrior surrounded by giant transparent spectral faces of ancient cosmic titans, starry background, Kirby style --ar 1:1",
          "captions": [],
          "balloons": [
            {
              "speaker": "SENTINELS OF VEGA",
              "text": "ORION. THE FORGE NEVER SAVES. THE FORGE TRANSFORMS.",
              "style": "whisper",
              "position": {
                "bottom": "12px",
                "left": "12px"
              }
            }
          ]
        },
        {
          "panelNumber": 2,
          "geometry": "standard-rect",
          "flex": 8,
          "cameraAngle": "medium",
          "eyeVector": "Thorne Realization -> Glowing Core",
          "artBrief": "Thorne places his hand upon his own chest, realizing his living soul is the final ignition fuel needed to reforge the cosmic laws.",
          "generationPrompt": "Heroic cosmic titan realizing his destiny, glowing golden spark inside transparent chestplate, calm transcendent determination --ar 16:9",
          "captions": [
            {
              "text": "To defeat entropy, one cannot merely strike. One must become the fuel.",
              "kind": "voiceover",
              "position": {
                "top": "14px",
                "left": "14px"
              }
            }
          ],
          "balloons": [
            {
              "speaker": "ORION THORNE",
              "text": "THEN LET MY BLOOD IGNITE THE DARK.",
              "style": "standard",
              "position": {
                "bottom": "16px",
                "right": "16px"
              }
            }
          ]
        }
      ]
    },
    {
      "pageNumber": 9,
      "title": "The Neutronium Ingot",
      "act": "Act III: The New Cosmos",
      "sequenceBeat": "The Final Strike Preparation",
      "layoutGrammar": "Dual Split Horizontal Power Tier",
      "panels": [
        {
          "panelNumber": 1,
          "geometry": "widescreen-letterbox",
          "flex": 6,
          "cameraAngle": "wide",
          "eyeVector": "Left Thorne Golden Aura -> Right Collapsing Singularity",
          "artBrief": "Thorne dives headfirst toward the singularity event horizon, enveloped in a radiant golden nova aura that pushes back the darkness.",
          "generationPrompt": "Golden cosmic warrior diving headfirst into purple black hole vortex, trail of incandescent solar fire, Kirby Krackle particles --ar 21:9",
          "captions": [
            {
              "text": "ALTITUDE ZERO // SCHWARZSCHILD RADIUS\nSpace and time trade places.",
              "kind": "voiceover",
              "position": {
                "top": "14px",
                "left": "16px"
              }
            }
          ],
          "balloons": []
        },
        {
          "panelNumber": 2,
          "geometry": "standard-rect",
          "flex": 6,
          "cameraAngle": "close-up",
          "eyeVector": "Hammer Striking Ingot -> Energy Spiral",
          "artBrief": "The warhammer strikes the neutronium core of the singularity. Reality folds into a blinding golden spiral.",
          "generationPrompt": "Cosmic warhammer striking the glowing core of a black hole, spiral energy burst, vivid cyan and vermilion Kirby dots --ar 16:9",
          "captions": [],
          "balloons": [
            {
              "speaker": "ORION THORNE",
              "text": "IGNITE!",
              "style": "shout",
              "position": {
                "bottom": "14px",
                "right": "14px"
              }
            }
          ],
          "sfx": [
            {
              "word": "BOOOOM-SHRAAAK!",
              "style": "orange-kinetic",
              "animation": "shake",
              "position": {
                "top": "16px",
                "left": "20px"
              }
            }
          ]
        }
      ]
    },
    {
      "pageNumber": 10,
      "title": "Event Horizon Threshold",
      "act": "Act III: The New Cosmos",
      "sequenceBeat": "Inside the Singularity",
      "layoutGrammar": "Full Vertical Monolith Splash",
      "panels": [
        {
          "panelNumber": 1,
          "geometry": "vertical-monolith",
          "flex": 12,
          "cameraAngle": "worm-eye",
          "eyeVector": "Bottom Thorne Ascent -> Infinite Timelines Above",
          "artBrief": "Inside the event horizon: infinite timelines visible as parallel ribbons of starlight stretching into infinity. Thorne stands as the central pillar holding reality together.",
          "generationPrompt": "Surreal cosmic comic art inside a black hole, infinite parallel ribbons of galaxies stretching vertically, glowing golden titan at the center --ar 9:16",
          "captions": [
            {
              "text": "Here, past and future are physical paths. And the Sentinel stands at the crossroads.",
              "kind": "voiceover",
              "position": {
                "top": "20px",
                "left": "20px",
                "maxWidth": "70%"
              }
            }
          ],
          "balloons": [
            {
              "speaker": "NULL-ZENO",
              "text": "IMPOSSIBLE! MORTAL WILL CANNOT SUSTAIN INFINITY!",
              "style": "jagged-monster",
              "position": {
                "bottom": "24px",
                "right": "20px"
              }
            }
          ],
          "sfx": [
            {
              "word": "ZRRRR-KLA-TOOOOM!",
              "style": "cyan-electric",
              "animation": "pulse",
              "position": {
                "left": "30px",
                "top": "180px"
              }
            }
          ]
        }
      ]
    },
    {
      "pageNumber": 11,
      "title": "Striking the Seventh Law",
      "act": "Act III: The New Cosmos",
      "sequenceBeat": "The Climax / The Final Blow",
      "layoutGrammar": "Monumental 2-Tier Kinetic Climax",
      "panels": [
        {
          "panelNumber": 1,
          "geometry": "standard-rect",
          "flex": 6,
          "cameraAngle": "low-angle-heroic",
          "eyeVector": "Thorne Hammer Descending -> Null-Zeno Crown",
          "artBrief": "Thorne brings the World-Breaker down with the combined mass of ten billion galaxies, shattering the Demiurge’s event-horizon crown into blinding crystal shards.",
          "generationPrompt": "Dynamic heroic comic panel, god warrior shattering giant shadow demon crown with hammer, blinding light explosion, classic 1970s Marvel cosmic art --ar 16:9",
          "captions": [],
          "balloons": [
            {
              "speaker": "ORION THORNE",
              "text": "CREATION REFUSES TO DIE!",
              "style": "shout",
              "position": {
                "top": "16px",
                "left": "16px"
              }
            }
          ],
          "sfx": [
            {
              "word": "THUUUUUN-DAAAAR!",
              "style": "orange-kinetic",
              "animation": "shake",
              "position": {
                "bottom": "16px",
                "right": "20px",
                "fontSize": "58px"
              }
            }
          ]
        },
        {
          "panelNumber": 2,
          "geometry": "widescreen-letterbox",
          "flex": 6,
          "cameraAngle": "extreme-wide",
          "eyeVector": "Center Shattered Demiurge -> Dissolving Darkness",
          "artBrief": "Null-Zeno disintegrates into harmless purple cosmic dust, screaming a silent frequency of disbelief as the void is flooded with golden fire.",
          "generationPrompt": "Colossal shadow monster dissolving into violet dust and golden cosmic rays, Steranko dynamic comic layout --ar 21:9",
          "captions": [
            {
              "text": "The Living Void shatters. The cold equilibrium is broken forever.",
              "kind": "voiceover",
              "position": {
                "bottom": "16px",
                "left": "16px"
              }
            }
          ],
          "balloons": [],
          "sfx": [
            {
              "word": "SKRRRR-BOOOOOM!",
              "style": "red-impact",
              "animation": "pulse",
              "position": {
                "top": "14px",
                "right": "30px"
              }
            }
          ]
        }
      ]
    },
    {
      "pageNumber": 12,
      "title": "The Anti-Matter Backlash",
      "act": "Act III: The New Cosmos",
      "sequenceBeat": "The Cost of Victory",
      "layoutGrammar": "3-Panel Disintegration Cascade",
      "panels": [
        {
          "panelNumber": 1,
          "geometry": "standard-rect",
          "flex": 4,
          "cameraAngle": "close-up",
          "eyeVector": "Thorne Gauntlet Dissolving -> Starlight",
          "artBrief": "Extreme close up of Thorne’s golden gauntlet dissolving into pure incandescent white photons, floating upward into space.",
          "generationPrompt": "Close up comic art golden armor turning into floating particles of star light, Kirby dots, poignant heroic sacrifice --ar 1:1",
          "captions": [],
          "balloons": []
        },
        {
          "panelNumber": 2,
          "geometry": "standard-rect",
          "flex": 4,
          "cameraAngle": "medium",
          "eyeVector": "Thorne Peaceful Smile -> Incandescent Armor",
          "artBrief": "Thorne’s face is serene, bathed in warm golden light, without fear or regret as his physical form gently gives way to stellar ignition.",
          "generationPrompt": "Heroic cosmic warrior smiling peacefully as his body turns into a sun, warm golden light, Silver Age comic art --ar 1:1",
          "captions": [
            {
              "text": "No sorrow in the heart of the Sentinel. Only fulfillment.",
              "kind": "voiceover",
              "position": {
                "top": "12px",
                "left": "12px"
              }
            }
          ],
          "balloons": [
            {
              "speaker": "ORION THORNE",
              "text": "Let there be light.",
              "style": "whisper",
              "position": {
                "bottom": "12px",
                "right": "12px"
              }
            }
          ]
        },
        {
          "panelNumber": 3,
          "geometry": "standard-rect",
          "flex": 4,
          "cameraAngle": "wide",
          "eyeVector": "World-Breaker Hammer -> Cosmic Altar",
          "artBrief": "The neutronium warhammer World-Breaker embeds itself into the heart of the reformed cosmic altar, burning with an eternal golden flame.",
          "generationPrompt": "Epic warhammer embedded in stone altar floating in space, surrounded by newborn nebula, comic book art --ar 1:1",
          "captions": [
            {
              "text": "The World-Breaker rests. Its work is done.",
              "kind": "voiceover",
              "position": {
                "bottom": "12px",
                "left": "12px"
              }
            }
          ],
          "balloons": []
        }
      ]
    },
    {
      "pageNumber": 13,
      "title": "The Singularity Reverses",
      "act": "Act III: The New Cosmos",
      "sequenceBeat": "White Hole Genesis",
      "layoutGrammar": "Full Page Dynamic Radiation Splash",
      "panels": [
        {
          "panelNumber": 1,
          "geometry": "open-bleed",
          "flex": 12,
          "cameraAngle": "extreme-wide",
          "eyeVector": "Center Blinding White Flash -> Expanding Golden Waves",
          "artBrief": "The purple black hole inverts into a radiant white hole, erupting with trillions of tons of newborn hydrogen and helium across the sector.",
          "generationPrompt": "Cosmic white hole explosion, blinding golden and cyan nebula shockwaves, thousands of Jack Kirby Krackle spheres expanding outwards --ar 21:9",
          "captions": [
            {
              "text": "THE REVERSE SINGULARITY\nWhere gravity once crushed all light, now infinite warmth pours into the vacuum.",
              "kind": "voiceover",
              "position": {
                "top": "24px",
                "left": "24px",
                "maxWidth": "60%"
              }
            }
          ],
          "balloons": [],
          "sfx": [
            {
              "word": "FHHHHRRRR-SHAAAAA!",
              "style": "orange-kinetic",
              "animation": "float",
              "position": {
                "right": "40px",
                "bottom": "40px",
                "fontSize": "54px"
              }
            }
          ]
        }
      ]
    },
    {
      "pageNumber": 14,
      "title": "Celestial Genesis",
      "act": "Act III: The New Cosmos",
      "sequenceBeat": "The Birth of Solar Systems",
      "layoutGrammar": "Dual Split Balance Spread",
      "panels": [
        {
          "panelNumber": 1,
          "geometry": "widescreen-letterbox",
          "flex": 6,
          "cameraAngle": "wide",
          "eyeVector": "Left Newborn Sun -> Right Accretion Discs",
          "artBrief": "A majestic golden hyper-giant sun burns at the center of the former void. Around it, planetary accretion discs spin in perfect harmonic resonance.",
          "generationPrompt": "Majestic newborn golden sun surrounded by swirling planet forming discs, Jack Kirby style cosmic dust clouds, vibrant primary colors --ar 21:9",
          "captions": [
            {
              "text": "The Seventh Law takes hold: Matter gathers. Worlds are born.",
              "kind": "voiceover",
              "position": {
                "top": "16px",
                "left": "16px"
              }
            }
          ],
          "balloons": []
        },
        {
          "panelNumber": 2,
          "geometry": "standard-rect",
          "flex": 6,
          "cameraAngle": "extreme-wide",
          "eyeVector": "Spreading Light Waves -> Distant Galaxies",
          "artBrief": "Waves of golden light reach distant dead solar systems, relighting frozen moons and kindling warm oceans on barren worlds.",
          "generationPrompt": "Waves of golden cosmic light waking up barren planets, blue oceans forming on alien worlds, cosmic comic art --ar 16:9",
          "captions": [
            {
              "text": "Ten billion years of warmth guaranteed to generations that will never know his name.",
              "kind": "voiceover",
              "position": {
                "bottom": "16px",
                "right": "16px"
              }
            }
          ],
          "balloons": []
        }
      ]
    },
    {
      "pageNumber": 15,
      "title": "The Constellation of Thorne",
      "act": "Act III: The New Cosmos",
      "sequenceBeat": "The Mythic Legacy",
      "layoutGrammar": "Monumental Starlit Splash",
      "panels": [
        {
          "panelNumber": 1,
          "geometry": "open-bleed",
          "flex": 12,
          "cameraAngle": "extreme-wide",
          "eyeVector": "Starlight Nodes -> Silhouette of Thorne in the Stars",
          "artBrief": "The newly formed star cluster forms the colossal outline of Orion Thorne holding his warhammer across the night sky of a thousand worlds.",
          "generationPrompt": "Deep space cosmic comic art, magnificent constellation forming the shape of a golden warrior with raised hammer, surrounded by spiral galaxies --ar 21:9",
          "captions": [
            {
              "text": "THE CONSTELLATION OF THE FORGE\nVisible from every quadrant of the revived universe. A guardian inscribed in the geometry of light.",
              "kind": "voiceover",
              "position": {
                "top": "24px",
                "left": "24px",
                "maxWidth": "65%"
              }
            }
          ],
          "balloons": []
        }
      ]
    },
    {
      "pageNumber": 16,
      "title": "The Infinite Galaxies",
      "act": "Act III: The New Cosmos",
      "sequenceBeat": "Masterpiece Final Cosmic Spread",
      "layoutGrammar": "Full Page Cosmic Genesis Splash",
      "panels": [
        {
          "panelNumber": 1,
          "geometry": "open-bleed",
          "flex": 12,
          "cameraAngle": "extreme-wide",
          "eyeVector": "Center Golden Star Birth -> Infinite Expanding Galaxies",
          "artBrief": "Orion Thorne dissolves into a blinding golden hyper-giant star at the center of the void. Billions of new planetary spirals ignite across the dark, crowned with vibrant Kirby Krackle halos.",
          "generationPrompt": "Breathtaking cosmic rebirth splash page, golden warrior dissolving into incandescent newborn sun, spiral galaxies blooming across deep purple cosmos, Jack Kirby Krackle constellations, transcendent mythic ending --ar 21:9",
          "captions": [
            {
              "text": "THE FORGE NEVER COOLS.\nWhere the Sentinel fell, ten thousand galaxies learned to burn.\n\nEND OF SINGULARITY GODS: THE OMEGA FORGE.",
              "kind": "voiceover",
              "position": {
                "bottom": "28px",
                "left": "28px",
                "maxWidth": "75%"
              }
            }
          ],
          "balloons": []
        }
      ]
    }
  ],
  "remixIdeas": [
    "Transpose to Norse Ragnarok in deep interstellar space aboard a Dyson Yggdrasil.",
    "Replace Thorne with a mortal physicist who accidentally inherits the Sentinel celestial frequency.",
    "Convert the setting into microscopic quantum atomic realms (Microverse scale)."
  ],
  "councilDirectorNotes": "Silver Age dynamic architecture requires monumental confidence. Foreshortened fists and weapons must threaten to smash through the monitor screen into the reader’s room."
};
