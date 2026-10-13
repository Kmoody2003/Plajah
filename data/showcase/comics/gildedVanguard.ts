// data/showcase/comics/gildedVanguard.ts
// Master Showcase Book: THE GILDED VANGUARD: ECLIPSE OVER SOL
// COMPLETE UNABRIDGED 16-PAGE SEQUENTIAL ART SCRIPT

import { ShowcaseComicBook } from '../comicTypes';

export const gildedVanguard: ShowcaseComicBook = {
  "id": "gilded-vanguard",
  "templateId": "comic-modern-cinematic",
  "title": "THE GILDED VANGUARD: ECLIPSE OVER SOL",
  "subtitle": "A 2.39:1 Political Thriller on the Dyson Siphon",
  "genre": "modern-cinematic",
  "councilLenses": {
    "leadArtist": "Jim Lee & Fiona Staples (Anamorphic 2.39:1 Pacing & Expressive Modern Rendering)",
    "leadWriter": "Brian K. Vaughan & Greg Rucka (Staggered Conversational Naturalism & High-Stakes Espionage)",
    "storyIntelligence": "Plajah Modern-Cinematic Engine (Frosted Glass HUDs, Atmospheric Color Grading, Overlapping Cutouts)"
  },
  "targetAudience": "mature-17+",
  "pageCount": 16,
  "logline": "On the luxury diplomatic orbital ring siphoning plasma from the Sun, an exiled Martian envoy and an elite solar operative race to stop a coordinated assassination that will ignite a three-system war.",
  "blurb": "The Solar Conclave meets once every century aboard the Corona Sovereign—a golden ring habitat floating just outside the sun’s convective zone. Below them, magnetic flares twist into arcs millions of kilometers high. Inside the grand salons, oligarchs toast to artificial peace while their private security forces butcher each other in the maintenance corridors. Ambassador Lyra Sterling knows the peace treaty is a decoy. When her chief bodyguard is found dead inside an airlock with his neural implants stripped, she turns to the one man on the station who cannot be bought: disgraced solar interceptor pilot Kael Thorne.",
  "theme": "The moral decay of gilded empires and the high personal cost of truth in a hall of mirrors.",
  "visualGrammar": {
    "gutterWidth": "16px",
    "gutterColor": "#000000",
    "pageTexture": "none",
    "primaryPalette": [
      "#030712",
      "#38bdf8",
      "#f97316",
      "#e2e8f0",
      "#0f172a"
    ],
    "typography": {
      "bodyFont": "system-ui, -apple-system, sans-serif",
      "captionFont": "system-ui, sans-serif",
      "sfxFont": "Impact, sans-serif"
    },
    "inkingStyle": "Modern prestige widescreen: rich cinematic dynamic range, 2.39:1 letterbox proportions, lush digital painterly rim lighting, translucent glassmorphism dialogue balloons with cyan borders."
  },
  "characters": [
    {
      "id": "lyra-sterling",
      "name": "Ambassador Lyra Sterling",
      "role": "protagonist",
      "archetype": "The Diplomatic Strategist",
      "personality": [
        "brilliant",
        "poised",
        "ruthless",
        "vulnerable",
        "resolute"
      ],
      "lockedVisualLook": "Martian diplomatic gown made of liquid obsidian nanofiber that ripples with golden light, aristocratic posture, piercing green eyes, concealed micro-plasma pistol in wrist cuff.",
      "palette": [
        "#020617",
        "#f59e0b",
        "#10b981",
        "#ffffff"
      ],
      "voiceSignature": "Razor-sharp, cultured, articulate dialogue laced with quiet double meanings.",
      "arc": "Transitions from manipulating political factions to risking her life and status to expose the conspiracy."
    },
    {
      "id": "kael-thorne",
      "name": "Kael Thorne",
      "role": "deuteragonist",
      "archetype": "The Cynical Operator",
      "personality": [
        "instinctive",
        "sardonic",
        "protective",
        "hyper-competent"
      ],
      "lockedVisualLook": "Charcoal tactical flight jacket over thermal body armor, scruffy beard, mechanical left arm plated in matte carbon fiber, magnetic holster at hip.",
      "palette": [
        "#1e293b",
        "#38bdf8",
        "#64748b",
        "#000000"
      ],
      "voiceSignature": "Dry, under-the-breath commentary and pragmatic tactical observations.",
      "arc": "Finds a cause worth dying for after years of mercenary apathy."
    }
  ],
  "pages": [
    {
      "pageNumber": 1,
      "title": "The Corona Sovereign",
      "act": "Act I: The Golden Conclave",
      "sequenceBeat": "Prestige Anamorphic 2.39:1 Establishing",
      "layoutGrammar": "2.39:1 Letterbox Establishing + Translucent Cyan HUD",
      "panels": [
        {
          "panelNumber": 1,
          "geometry": "widescreen-letterbox",
          "flex": 12,
          "cameraAngle": "extreme-wide",
          "eyeVector": "Left Solar Flare Arc -> Center Golden Ring Station -> Right Approaching VIP Shuttle",
          "artBrief": "The Corona Sovereign: a colossal golden torus space station floating only 12 million kilometers from the roaring convective surface of the Sun. A titanic solar flare arcs millions of kilometers into space above the habitat.",
          "generationPrompt": "2.39:1 anamorphic cinematic comic panel by Jim Lee and Fiona Staples, colossal golden torus space station orbiting close to burning sun, titanic solar prominence flare, sleek luxury shuttle approaching, cinematic rim lighting --ar 21:9",
          "captions": [
            {
              "text": "CORONA SOVEREIGN // DIPLOMATIC ORBITAL TORUS // 0.08 AU FROM SOL\nHere, the rich siphon stellar plasma to power five star systems. And murder each other between courses.",
              "kind": "voiceover",
              "position": {
                "top": "16px",
                "left": "16px",
                "maxWidth": "65%"
              }
            }
          ],
          "balloons": []
        }
      ]
    },
    {
      "pageNumber": 2,
      "title": "The Diplomatic Ballroom",
      "act": "Act I: The Golden Conclave",
      "sequenceBeat": "Political High Society Intrigue",
      "layoutGrammar": "Dual Split Anamorphic Tier",
      "panels": [
        {
          "panelNumber": 1,
          "geometry": "widescreen-letterbox",
          "flex": 6,
          "cameraAngle": "medium",
          "eyeVector": "Lyra Gown -> Champagne Flute -> Oligarch Crowd",
          "artBrief": "Ambassador Lyra Sterling in her liquid obsidian gown sipping Martian reserve wine, piercing green eyes analyzing the delegates through translucent frosted HUD glasses.",
          "generationPrompt": "Prestige comic art, stunning aristocratic woman in rippling black liquid nanofiber gown holding champagne, futuristic luxury ballroom, Jim Lee style --ar 21:9",
          "captions": [],
          "balloons": [
            {
              "speaker": "AMBASSADOR LYRA",
              "text": "They smile like statesmen, Kael. But their security details are checking magazine feeds.",
              "style": "comms",
              "position": {
                "bottom": "16px",
                "left": "16px"
              }
            }
          ]
        },
        {
          "panelNumber": 2,
          "geometry": "widescreen-letterbox",
          "flex": 6,
          "cameraAngle": "close-up",
          "eyeVector": "Kael’s Polarized Lens -> Biometric Readouts",
          "artBrief": "Kael Thorne leaning against a marble pillar in a dark tactical flight jacket, his carbon-fiber mechanical arm hidden beneath his coat, scanning biometric heatmaps.",
          "generationPrompt": "Cinematic close up of rugged operative with carbon fiber cybernetic arm scanning luxury crowd through holographic glasses, blue HUD lines --ar 21:9",
          "captions": [],
          "balloons": [
            {
              "speaker": "KAEL THORNE",
              "text": "Two mercenary squads on the service level. They aren’t here to toast peace, Ambassador.",
              "style": "comms",
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
      "pageNumber": 3,
      "title": "The Airlock Corpse",
      "act": "Act I: The Golden Conclave",
      "sequenceBeat": "The Catalyst / Murder Discovered",
      "layoutGrammar": "3-Panel Forensic Investigation Tier",
      "panels": [
        {
          "panelNumber": 1,
          "geometry": "standard-rect",
          "flex": 4,
          "cameraAngle": "wide",
          "eyeVector": "Airlock Door Cracked -> Frozen Vapor -> Suspended Body",
          "artBrief": "Inside Service Bay 7. Lyra’s chief bodyguard floats in microgravity inside a frosted airlock, his cranial implants burned out with military thermite.",
          "generationPrompt": "Dramatic forensic comic panel, body floating in frosted zero-g airlock, smoke rising from burned neural implants, dark moody lighting --ar 1:1",
          "captions": [
            {
              "text": "Chief Sentinel Miller. Twenty years of service ended with a magnetic burn.",
              "kind": "voiceover",
              "position": {
                "top": "12px",
                "left": "12px"
              }
            }
          ],
          "balloons": []
        },
        {
          "panelNumber": 2,
          "geometry": "standard-rect",
          "flex": 4,
          "cameraAngle": "close-up",
          "eyeVector": "Kael’s Mechanical Fingers Extracting Memory Slug",
          "artBrief": "Kael’s matte black carbon fingers pry a glowing gold data crystal from the dead man’s lapel pocket.",
          "generationPrompt": "Extreme close up cybernetic carbon fiber hand extracting glowing golden microchip from formal collar, lens flare --ar 1:1",
          "captions": [],
          "balloons": [
            {
              "speaker": "KAEL THORNE",
              "text": "He didn’t die easy. But he kept the receipt.",
              "style": "standard",
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
          "cameraAngle": "close-up",
          "eyeVector": "Lyra’s Grim Expression -> Reflected Hologram",
          "artBrief": "Lyra stares at the decrypted hologram: a covert contract ordering the sabotage of the station’s solar magnetic shield to trigger a three-system war.",
          "generationPrompt": "Close up aristocratic woman grimly staring at blue tactical war plans projected from microchip, cinematic drama --ar 1:1",
          "captions": [],
          "balloons": [
            {
              "speaker": "AMBASSADOR LYRA",
              "text": "The Conclave isn’t a peace summit. It’s an execution.",
              "style": "whisper",
              "position": {
                "bottom": "12px",
                "left": "12px"
              }
            }
          ]
        }
      ]
    },
    {
      "pageNumber": 4,
      "title": "The Hydroponic Standoff",
      "act": "Act I: The Golden Conclave",
      "sequenceBeat": "The First Ambush",
      "layoutGrammar": "Slanted Action Breakout",
      "panels": [
        {
          "panelNumber": 1,
          "geometry": "slanted-slash-left",
          "flex": 6,
          "cameraAngle": "medium",
          "eyeVector": "Mercenaries Bursting from Glass Greenhouse -> Laser Beams",
          "artBrief": "Three corporate mercenaries in stealth armor burst through hydroponic glass panels, firing suppressed plasma carbines.",
          "generationPrompt": "Dynamic comic action, stealth soldiers shattering futuristic greenhouse glass, cyan laser tracers, Jim Lee action layout --ar 16:9",
          "captions": [],
          "balloons": [],
          "sfx": [
            {
              "word": "PHT-PHT-PHT!",
              "style": "cyan-electric",
              "animation": "shake",
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
          "cameraAngle": "low-angle-heroic",
          "eyeVector": "Kael Drawing Magnetic Sidearm -> Lyra Taking Cover",
          "artBrief": "Kael pushes Lyra behind a titanium planter, drawing a high-caliber magnetic accelerator pistol with his cybernetic arm.",
          "generationPrompt": "Heroic bodyguard firing heavy futuristic handgun, protecting elegant woman in gown behind cover, muzzle flash flare --ar 16:9",
          "captions": [],
          "balloons": [
            {
              "speaker": "KAEL THORNE",
              "text": "Down, Ambassador! Stay behind the carbon plating!",
              "style": "shout",
              "position": {
                "bottom": "16px",
                "left": "16px"
              }
            }
          ],
          "sfx": [
            {
              "word": "KLA-BOOOM!",
              "style": "red-impact",
              "animation": "pulse",
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
      "pageNumber": 5,
      "title": "Zero-G Maintenance Corridor",
      "act": "Act II: The Siphon Run",
      "sequenceBeat": "Micro-Gravity Tactical Evasion",
      "layoutGrammar": "Dual Split Widescreen Letterbox",
      "panels": [
        {
          "panelNumber": 1,
          "geometry": "widescreen-letterbox",
          "flex": 6,
          "cameraAngle": "wide",
          "eyeVector": "Kael and Lyra Floating Down Corridor -> Spent Shell Casings",
          "artBrief": "Zero-g pursuit down the magnetic maintenance spine. Floating spent brass casings and blood droplets shimmer in the amber emergency strobes.",
          "generationPrompt": "Zero gravity sci-fi corridor battle, operative and woman floating past pipes, floating brass bullet casings, cinematic lighting --ar 21:9",
          "captions": [
            {
              "text": "MAINTENANCE SECTOR 4 // GRAVITY OFF-LINE",
              "kind": "technical-hud",
              "position": {
                "top": "14px",
                "left": "14px"
              }
            }
          ],
          "balloons": []
        },
        {
          "panelNumber": 2,
          "geometry": "widescreen-letterbox",
          "flex": 6,
          "cameraAngle": "close-up",
          "eyeVector": "Lyra Wrist Plasma Pistol -> Mercenary Visor",
          "artBrief": "Lyra snaps her wrist forward, deploying a concealed micro-plasma pistol and neutralizing a pursuing mercenary with dead-eye precision.",
          "generationPrompt": "Close up elegant woman firing concealed wrist laser with icy precision, smoke curling from cuff, prestige graphic novel --ar 21:9",
          "captions": [],
          "balloons": [
            {
              "speaker": "AMBASSADOR LYRA",
              "text": "I was born on Mars, Thorne. We learn to shoot before we learn Latin.",
              "style": "standard",
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
      "pageNumber": 6,
      "title": "The Molten Siphon Conduit",
      "act": "Act II: The Siphon Run",
      "sequenceBeat": "Environmental Peril",
      "layoutGrammar": "Open Bleed High-Temperature Drama",
      "panels": [
        {
          "panelNumber": 1,
          "geometry": "open-bleed",
          "flex": 12,
          "cameraAngle": "extreme-wide",
          "eyeVector": "Colossal Magnetic Pipe -> Swirling White-Hot Solar Plasma -> Narrow Catwalk",
          "artBrief": "Kael and Lyra racing across a narrow gantry suspended over a 100-meter transparent conduit channeling incandescent solar plasma. Heat shimmer distorts the air.",
          "generationPrompt": "Dramatic wide cinematic comic panel, heroes running across narrow catwalk over roaring river of molten solar plasma inside space station, intense orange glow --ar 21:9",
          "captions": [
            {
              "text": "THE MAIN HARVEST CONDUIT // PLASMA TEMPERATURE: 1.8 MILLION KELVIN\nOne magnetic containment flicker and this entire ring vaporizes into gold dust.",
              "kind": "voiceover",
              "position": {
                "top": "20px",
                "left": "20px",
                "maxWidth": "60%"
              }
            }
          ],
          "balloons": [
            {
              "speaker": "KAEL THORNE",
              "text": "Catwalk’s giving way! Jump for the emergency airlock!",
              "style": "shout",
              "position": {
                "bottom": "24px",
                "right": "24px"
              }
            }
          ],
          "sfx": [
            {
              "word": "ROOOAAARRR!",
              "style": "orange-kinetic",
              "animation": "shake",
              "position": {
                "left": "30px",
                "top": "120px"
              }
            }
          ]
        }
      ]
    },
    {
      "pageNumber": 7,
      "title": "The Blast Door Sacrifice",
      "act": "Act II: The Siphon Run",
      "sequenceBeat": "Physical Strain & Cybernetic Limit",
      "layoutGrammar": "Dual Split High-Tension Tier",
      "panels": [
        {
          "panelNumber": 1,
          "geometry": "standard-rect",
          "flex": 6,
          "cameraAngle": "medium",
          "eyeVector": "Kael Holding Descending Titanium Door -> Hydraulic Smoke",
          "artBrief": "A massive three-ton hydraulic blast door slams downward. Kael wedges his matte black carbon-fiber arm underneath, gears screaming as he holds it open for Lyra.",
          "generationPrompt": "Heroic operative holding up crushing heavy blast door with cybernetic arm, sparks flying from mechanical joint, strain on face, Jim Lee style --ar 16:9",
          "captions": [],
          "balloons": [
            {
              "speaker": "KAEL THORNE",
              "text": "Slide under! I can only hold it for four seconds!",
              "style": "shout",
              "position": {
                "bottom": "16px",
                "left": "16px"
              }
            }
          ],
          "sfx": [
            {
              "word": "SKRRRR-CLANGGG!",
              "style": "red-impact",
              "animation": "shake",
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
          "eyeVector": "Lyra Pulling Kael Through -> Crushing Door Teeth",
          "artBrief": "Lyra dives through the gap and drags Kael clear just as the door shears through his cybernetic gauntlet casing with an explosive shower of sparks.",
          "generationPrompt": "Woman pulling wounded operative through closing blast door, sparks bursting, intense cinematic action --ar 16:9",
          "captions": [],
          "balloons": [
            {
              "speaker": "AMBASSADOR LYRA",
              "text": "Got you! Roll clear!",
              "style": "shout",
              "position": {
                "bottom": "16px",
                "right": "16px"
              }
            }
          ],
          "sfx": [
            {
              "word": "CRUUUSSHHH!",
              "style": "red-impact",
              "animation": "pulse",
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
      "pageNumber": 8,
      "title": "Thermal Conduit Ventilation",
      "act": "Act II: The Siphon Run",
      "sequenceBeat": "Quiet Stealth Transition",
      "layoutGrammar": "3-Panel Stealth Infiltration",
      "panels": [
        {
          "panelNumber": 1,
          "geometry": "standard-rect",
          "flex": 4,
          "cameraAngle": "close-up",
          "eyeVector": "Kael Hot-Wiring Vent Hatch",
          "artBrief": "Kael using exposed wiring from his stripped mechanical arm to short-circuit the ventilation grille lock.",
          "generationPrompt": "Close up operative using sparking cybernetic finger wires to hotwire vent lock, blue electric sparks --ar 1:1",
          "captions": [],
          "balloons": []
        },
        {
          "panelNumber": 2,
          "geometry": "standard-rect",
          "flex": 4,
          "cameraAngle": "medium",
          "eyeVector": "Lyra Crawling Through Narrow Vent -> Gown Torn",
          "artBrief": "Lyra crawling through the copper cooling ducts, her elegant gown torn at the hem, eyes focused with deadly composure.",
          "generationPrompt": "Elegant woman crawling through narrow high-tech ventilation shaft, determined expression, dramatic shadows --ar 1:1",
          "captions": [
            {
              "text": "No dignity in ventilation shafts. But vengeance doesn’t require velvet.",
              "kind": "voiceover",
              "position": {
                "bottom": "12px",
                "left": "12px"
              }
            }
          ],
          "balloons": []
        },
        {
          "panelNumber": 3,
          "geometry": "standard-rect",
          "flex": 4,
          "cameraAngle": "wide",
          "eyeVector": "Looking Down Through Grille -> Conclave Chamber Below",
          "artBrief": "Point of view looking down through the ceiling grille into the luxurious private Conclave chamber where the three planetary oligarchs sit plotting.",
          "generationPrompt": "Looking down through metal ceiling vent into grand round council chamber, oligarchs seated around holographic globe --ar 1:1",
          "captions": [],
          "balloons": [
            {
              "speaker": "KAEL THORNE",
              "text": "Right on schedule. Ready the broadcast relay.",
              "style": "whisper",
              "position": {
                "bottom": "12px",
                "right": "12px"
              }
            }
          ]
        }
      ]
    },
    {
      "pageNumber": 9,
      "title": "The Council Infiltration",
      "act": "Act III: Eclipse and Exposure",
      "sequenceBeat": "The Dramatic Entrance",
      "layoutGrammar": "Full Page Shatter Splash",
      "panels": [
        {
          "panelNumber": 1,
          "geometry": "open-bleed",
          "flex": 12,
          "cameraAngle": "low-angle-heroic",
          "eyeVector": "Ceiling Grille Blown -> Lyra and Kael Dropping In -> Stunned Oligarchs",
          "artBrief": "The ceiling grille blows open with explosive charges. Lyra and Kael drop into the center of the mahogany conference table, shattering crystal carafes under boot heels.",
          "generationPrompt": "Epic entrance comic splash, elegant woman and cybernetic bodyguard crashing through luxury ceiling onto boardroom table, shattered glass, Jim Lee art --ar 21:9",
          "captions": [],
          "balloons": [
            {
              "speaker": "AMBASSADOR LYRA",
              "text": "Gentlemen. Please, do not adjourn on our account.",
              "style": "shout",
              "position": {
                "bottom": "24px",
                "left": "28px"
              }
            }
          ],
          "sfx": [
            {
              "word": "KRAAA-SHHHH!",
              "style": "red-impact",
              "animation": "shake",
              "position": {
                "top": "30px",
                "right": "40px",
                "fontSize": "56px"
              }
            }
          ]
        }
      ]
    },
    {
      "pageNumber": 10,
      "title": "The Holographic Indictment",
      "act": "Act III: Eclipse and Exposure",
      "sequenceBeat": "The Truth Revealed",
      "layoutGrammar": "Dual Split Widescreen Revelation",
      "panels": [
        {
          "panelNumber": 1,
          "geometry": "widescreen-letterbox",
          "flex": 6,
          "cameraAngle": "wide",
          "eyeVector": "Lyra Slamming Crystal Drive -> Giant Blue Hologram",
          "artBrief": "Lyra slams the golden data crystal into the central terminal. A massive 360-degree holographic projection fills the room with bank accounts, sabotage contracts, and casualty projections.",
          "generationPrompt": "High tech boardroom dominated by massive glowing blue hologram of treason documents, oligarchs backing away in panic --ar 21:9",
          "captions": [
            {
              "text": "BROADCAST FREQUENCY: OPEN INTERPLANETARY FEDERATION\nSix billion souls across Earth, Mars, and the Belt watching in real time.",
              "kind": "technical-hud",
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
          "geometry": "widescreen-letterbox",
          "flex": 6,
          "cameraAngle": "close-up",
          "eyeVector": "Chief Oligarch Vane Pale Face -> Trembling Hands",
          "artBrief": "Close up of Council Chairman Vane dropping his gold pen, his patrician arrogance evaporating as emergency alerts ping across his comms.",
          "generationPrompt": "Close up wealthy corrupt oligarch turning pale with terror as holographic evidence exposes his crimes, cinematic prestige --ar 21:9",
          "captions": [],
          "balloons": [
            {
              "speaker": "CHAIRMAN VANE",
              "text": "Cut the feed! Kill the transmitter array now!",
              "style": "shout",
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
      "pageNumber": 11,
      "title": "The Solar Flare Siren",
      "act": "Act III: Eclipse and Exposure",
      "sequenceBeat": "The Station Alarm",
      "layoutGrammar": "Dual Split Crisis Tier",
      "panels": [
        {
          "panelNumber": 1,
          "geometry": "standard-rect",
          "flex": 6,
          "cameraAngle": "wide",
          "eyeVector": "Panoramic Windows Flashing Crimson -> Solar Prominence Rising",
          "artBrief": "Through the panoramic observation windows, a gargantuan class-X solar flare rises from the Sun’s corona like a wall of living fire, heading straight for the station.",
          "generationPrompt": "Panoramic view from space station window, colossal tidal wave of solar fire rising from sun, crimson alarm lights, cinematic scale --ar 16:9",
          "captions": [
            {
              "text": "SOLAR FLARE IMPACT IN 180 SECONDS // EVACUATION ORDERS IN EFFECT",
              "kind": "technical-hud",
              "position": {
                "top": "14px",
                "left": "14px"
              }
            }
          ],
          "balloons": []
        },
        {
          "panelNumber": 2,
          "geometry": "standard-rect",
          "flex": 6,
          "cameraAngle": "medium",
          "eyeVector": "Oligarchs Scrambling for Private Pods -> Chaos",
          "artBrief": "Complete pandemonium. Oligarchs draw concealed plasma derringers on each other, fighting for the single remaining escape pod.",
          "generationPrompt": "Corrupt elites fighting each other for escape shuttle in luxury docking bay, smoke and alarm lights --ar 16:9",
          "captions": [
            {
              "text": "Gilded empires always end the same way: with gentlemen baring their teeth.",
              "kind": "voiceover",
              "position": {
                "bottom": "14px",
                "left": "14px"
              }
            }
          ],
          "balloons": []
        }
      ]
    },
    {
      "pageNumber": 12,
      "title": "Race to the VIP Shuttle",
      "act": "Act III: Eclipse and Exposure",
      "sequenceBeat": "The Desperate Sprint",
      "layoutGrammar": "3-Panel Dynamic Motion Cascade",
      "panels": [
        {
          "panelNumber": 1,
          "geometry": "slanted-slash-left",
          "flex": 4,
          "cameraAngle": "close-up",
          "eyeVector": "Kael’s Boots Sprinting -> Debris on Floor",
          "artBrief": "Kael and Lyra sprinting down the buckling docking corridor as artificial gravity fluctuates between 0g and 2g.",
          "generationPrompt": "Dynamic motion shot, boots running down vibrating metallic spaceship gantry, sparks falling --ar 1:1",
          "captions": [],
          "balloons": []
        },
        {
          "panelNumber": 2,
          "geometry": "standard-rect",
          "flex": 4,
          "cameraAngle": "medium",
          "eyeVector": "Kael Firing Over Shoulder -> Exploding Fuel Tank",
          "artBrief": "Kael fires his last magazine into a hydrogen fuel pod behind them, blowing the corridor bulkhead to block the remaining mercenaries.",
          "generationPrompt": "Operative firing backwards, massive fireball explosion sealing corridor, heroic action comic art --ar 1:1",
          "captions": [],
          "balloons": [],
          "sfx": [
            {
              "word": "KA-BOOOOOOM!",
              "style": "orange-kinetic",
              "animation": "shake",
              "position": {
                "top": "12px",
                "right": "12px"
              }
            }
          ]
        },
        {
          "panelNumber": 3,
          "geometry": "standard-rect",
          "flex": 4,
          "cameraAngle": "medium",
          "eyeVector": "Lyra Punching Shuttle Hatch Keypad",
          "artBrief": "Lyra slamming her consular override code into the airlock hatch of her private Martian diplomatic shuttle \"Ares Whisper\".",
          "generationPrompt": "Woman keying launch codes into sleek black spacecraft airlock, green verification light flashing --ar 1:1",
          "captions": [],
          "balloons": [
            {
              "speaker": "AMBASSADOR LYRA",
              "text": "Engines spinning up! Get in and seal the hatch!",
              "style": "shout",
              "position": {
                "bottom": "12px",
                "right": "12px"
              }
            }
          ]
        }
      ]
    },
    {
      "pageNumber": 13,
      "title": "The Severing of the Umbilical",
      "act": "Act III: Eclipse and Exposure",
      "sequenceBeat": "The Launch Under Fire",
      "layoutGrammar": "Full Page Widescreen Release",
      "panels": [
        {
          "panelNumber": 1,
          "geometry": "open-bleed",
          "flex": 12,
          "cameraAngle": "extreme-wide",
          "eyeVector": "Shuttle Detaching -> Explosive Decoupling Bolts -> Solar Wall Behind",
          "artBrief": "The sleek matte-black diplomatic shuttle detaches from the station docking clamp with four explosive bolts, firing its fusion aerospikes into maximum burn.",
          "generationPrompt": "Cinematic wide shot, sleek black stealth shuttle launching from exploding golden space station, intense blue engine plumes against orange solar flare --ar 21:9",
          "captions": [
            {
              "text": "UMBILICAL SEVERED // FULL THRUST ENGAGED",
              "kind": "technical-hud",
              "position": {
                "top": "20px",
                "left": "20px"
              }
            }
          ],
          "balloons": [],
          "sfx": [
            {
              "word": "THRRRRR-BOOOST!",
              "style": "cyan-electric",
              "animation": "speedline",
              "position": {
                "right": "40px",
                "bottom": "40px"
              }
            }
          ]
        }
      ]
    },
    {
      "pageNumber": 14,
      "title": "The Torus Collapses",
      "act": "Act III: Eclipse and Exposure",
      "sequenceBeat": "The Fate of the Corona Sovereign",
      "layoutGrammar": "Dual Split Cataclysmic Balance",
      "panels": [
        {
          "panelNumber": 1,
          "geometry": "widescreen-letterbox",
          "flex": 6,
          "cameraAngle": "extreme-wide",
          "eyeVector": "Solar Prominence Engulfing Golden Ring -> Secondary Explosions",
          "artBrief": "The solar flare crashes over the abandoned Corona Sovereign. The golden ring buckles under magnetic torque, disintegrating into glorious trails of molten gold.",
          "generationPrompt": "Colossal golden space station buckling and tearing apart in titanic wave of solar plasma, spectacular sci-fi destruction --ar 21:9",
          "captions": [
            {
              "text": "The Corona Sovereign disappears into the chromosphere. A hundred billion credits of gilded arrogance melted into hydrogen.",
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
          "cameraAngle": "close-up",
          "eyeVector": "Lyra and Kael in Cockpit -> Fireball Reflected on Visors",
          "artBrief": "Inside the cockpit: Kael and Lyra watching the golden explosion reflect in their flight visors in stunned, quiet awe.",
          "generationPrompt": "Close up of pilot and woman in spaceship cockpit bathed in warm orange light of distant explosion, quiet emotional tension --ar 16:9",
          "captions": [],
          "balloons": [
            {
              "speaker": "KAEL THORNE",
              "text": "You just started an interplanetary revolution, Ambassador.",
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
      "pageNumber": 15,
      "title": "The Truth in Flight",
      "act": "Act III: Eclipse and Exposure",
      "sequenceBeat": "The New Reality",
      "layoutGrammar": "Dual Split Intimate Reflection",
      "panels": [
        {
          "panelNumber": 1,
          "geometry": "standard-rect",
          "flex": 6,
          "cameraAngle": "medium",
          "eyeVector": "Lyra Unpinning Broken Brooch -> Throwing It in Recycler",
          "artBrief": "Lyra removes her diamond Martian ambassador’s brooch, tossing it into the recycling chute with a wry, liberating smile.",
          "generationPrompt": "Woman taking off expensive formal jewelry in spaceship cabin, smiling with newfound freedom, Fiona Staples expressive style --ar 16:9",
          "captions": [],
          "balloons": [
            {
              "speaker": "AMBASSADOR LYRA",
              "text": "I am no longer an ambassador, Kael. I am a witness.",
              "style": "standard",
              "position": {
                "bottom": "16px",
                "left": "16px"
              }
            }
          ]
        },
        {
          "panelNumber": 2,
          "geometry": "standard-rect",
          "flex": 6,
          "cameraAngle": "medium",
          "eyeVector": "Kael Bandaging Mechanical Arm -> Checking Navigation HUD",
          "artBrief": "Kael wrapping thermal tape around his exposed cybernetic forearm, setting the navigation plot toward the Jovian orbital freeports.",
          "generationPrompt": "Rugged operative repairing cybernetic arm with tape, holographic navigation map showing Jupiter ahead, warm cabin lighting --ar 16:9",
          "captions": [],
          "balloons": [
            {
              "speaker": "KAEL THORNE",
              "text": "Then we’d better make sure you stay alive to testify.",
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
      "pageNumber": 16,
      "title": "Eclipse Over Sol",
      "act": "Act III: Eclipse and Exposure",
      "sequenceBeat": "Masterpiece Final Cinematic Spread",
      "layoutGrammar": "2.39:1 Anamorphic Final Splash",
      "panels": [
        {
          "panelNumber": 1,
          "geometry": "widescreen-letterbox",
          "flex": 12,
          "cameraAngle": "extreme-wide",
          "eyeVector": "Left Sleek Shuttle Velocity -> Center Black Moon Eclipsing Sun -> Right Starlit Deep Space",
          "artBrief": "The diplomatic shuttle accelerates toward the deep darkness of Jupiter. In the background, the scorched iron moon of Mercury crosses the face of the blazing sun in a breathtaking solar eclipse, ringed in diamond corona light.",
          "generationPrompt": "2.39:1 widescreen masterpiece comic panel, sleek black stealth shuttle flying into star-filled deep space, magnificent total solar eclipse behind with glowing golden diamond ring corona, prestige cinematic graphic novel art --ar 21:9",
          "captions": [
            {
              "text": "THE TRUTH CANNOT BE ASSASSINATED.\nAcross three systems, the fleets are turning around.\n\nEND OF THE GILDED VANGUARD: ECLIPSE OVER SOL.",
              "kind": "voiceover",
              "position": {
                "bottom": "24px",
                "left": "24px",
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
    "Transpose to a luxury zeppelin cruising through the clouds of Venus.",
    "Replace the solar station with an underwater ocean trench resort during a tectonic quake.",
    "Frame as a modern cyberpunk corporate boardroom espionage thriller."
  ],
  "councilDirectorNotes": "Modern Cinematic relies on letterbox discipline and conversational rhythm. Balloons should feel light, translucent, and never cover character expressions or eyes."
};
