// data/showcase/comics/paleHydrangeas.ts
// Master Showcase Book: PALE HYDRANGEAS OF THE ABYSS
// COMPLETE UNABRIDGED 16-PAGE SEQUENTIAL ART SCRIPT

import { ShowcaseComicBook } from '../comicTypes';

export const paleHydrangeas: ShowcaseComicBook = {
  "id": "pale-hydrangeas",
  "templateId": "manga-shojo-gothic",
  "title": "PALE HYDRANGEAS OF THE ABYSS",
  "subtitle": "The Chiming Clocks of House Valerius",
  "genre": "shojo-gothic",
  "councilLenses": {
    "leadArtist": "CLAMP & Kaori Yuki (Lyrical Asymmetric Montages, Filigree Frames & Floating Symbolism)",
    "leadWriter": "Neil Gaiman & CLAMP (Dark Fairytale Poetics & Psychological Memory Traps)",
    "storyIntelligence": "Plajah Shojo-Gothic Engine (Borderless Floating Panels, Rose Thorn Motifs, Dreamtime Vectors)"
  },
  "targetAudience": "young-adult-13+",
  "pageCount": 16,
  "logline": "Trapped inside a labyrinthine ancestral castle where grandfather clocks chime backward, a young countess must confront the porcelain spirit that preserves her family’s forgotten tragedies.",
  "blurb": "In the valley of the Black Pines, House Valerius does not bury its dead; it preserves their grief inside seventy-seven grandfather clocks. Lady Vivienne has spent sixteen years wandering corridors of velvet and dying hydrangeas, unable to leave the wrought-iron gates. When the clocks begin striking midnight in broad daylight, a silent companion appears in the mirror: Prince Lucien, a creature woven from porcelain fragments, black lace, and briar thorns.",
  "theme": "The ache of lingering grief, memory as a prison, and finding the courage to let the clocks run down.",
  "visualGrammar": {
    "gutterWidth": "18px",
    "gutterColor": "#0a0510",
    "pageTexture": "filigree-velvet-dark",
    "primaryPalette": [
      "#170b24",
      "#e0e7ff",
      "#f43f5e",
      "#a855f7",
      "#000000"
    ],
    "typography": {
      "bodyFont": "Georgia, serif",
      "captionFont": "Georgia, serif",
      "sfxFont": "Trebuchet MS, cursive, sans-serif"
    },
    "inkingStyle": "Intricate late-90s psychological gothic manga: delicate feathering on hair and lace, borderless panels dissolving into cascading flower petals, sharp diagonal psychological slashes, high emotional contrast."
  },
  "characters": [
    {
      "id": "vivienne",
      "name": "Lady Vivienne Valerius",
      "role": "protagonist",
      "archetype": "The Gilded Captive",
      "personality": [
        "melancholic",
        "inquisitive",
        "poetic",
        "yearning",
        "brave"
      ],
      "lockedVisualLook": "Delicate porcelain skin, raven black hair cascading in ornate ringlets past her waist, Victorian midnight-purple mourning gown trimmed with black lace and silver clock gears.",
      "palette": [
        "#1e1b4b",
        "#a855f7",
        "#f43f5e",
        "#ffffff"
      ],
      "voiceSignature": "Whispered internal verse, lyrical, fragile yet concealing fierce inner dignity.",
      "arc": "Discovers that the clocks are powered by her own refusal to mourn; chooses to break the pendulum."
    },
    {
      "id": "lucien",
      "name": "Prince Lucien (The Porcelain Shadow)",
      "role": "deuteragonist",
      "archetype": "The Mirror Familiar",
      "personality": [
        "cryptic",
        "tender",
        "spectral",
        "protective"
      ],
      "lockedVisualLook": "A tall ethereal youth with cracked porcelain skin, silver hair falling over one violet eye, wearing a high-collared velvet coat with thorny briars wrapping his forearms.",
      "palette": [
        "#f8fafc",
        "#c084fc",
        "#0f172a"
      ],
      "voiceSignature": "Sibilant musical cadence, speaking in riddles and poetic reflections.",
      "arc": "Reveals he was born from Vivienne’s very first unshed tear; fades into morning mist once she heals."
    }
  ],
  "pages": [
    {
      "pageNumber": 1,
      "title": "The Room of Seventy-Seven Pendulums",
      "act": "Act I: The Gilded Captive",
      "sequenceBeat": "Gothic Atmosphere & Time Trapped",
      "layoutGrammar": "Lyrical Asymmetric Montage + Floating Rose & Hydrangea Petals",
      "panels": [
        {
          "panelNumber": 1,
          "geometry": "open-bleed",
          "flex": 12,
          "cameraAngle": "high-angle-dutch",
          "eyeVector": "Top Pendulum Arcs -> Center Vivienne Mourning Gown -> Cascading Hydrangea Petals",
          "artBrief": "A cavernous gothic cathedral chamber filled with seventy-seven ornate antique grandfather clocks of dark mahogany and brass. Lady Vivienne Valerius stands at the center in her black lace mourning gown, surrounded by floating blue hydrangea petals.",
          "generationPrompt": "Haunting CLAMP / Kaori Yuki shojo gothic manga splash page, beautiful melancholic young countess in Victorian black lace mourning dress surrounded by seventy-seven antique grandfather clocks, floating blue hydrangea petals, delicate hair linework, high contrast ink --ar 21:9",
          "captions": [
            {
              "text": "VALERIUS CHÂTEAU // THE TIMELESS HALL\nIn this house, the dead are not buried. Their grief is preserved in seventy-seven pendulums.",
              "kind": "voiceover",
              "position": {
                "top": "24px",
                "left": "28px",
                "maxWidth": "60%"
              }
            }
          ],
          "balloons": [],
          "sfx": [
            {
              "word": "tick... tock... tick...",
              "style": "ligne-ink",
              "animation": "pulse",
              "position": {
                "right": "40px",
                "top": "30px"
              }
            }
          ]
        }
      ]
    },
    {
      "pageNumber": 2,
      "title": "The Gilded Mirror",
      "act": "Act I: The Gilded Captive",
      "sequenceBeat": "The Spectral Familiar Appears",
      "layoutGrammar": "Dual Split Gothic Portrait",
      "panels": [
        {
          "panelNumber": 1,
          "geometry": "standard-rect",
          "flex": 6,
          "cameraAngle": "close-up",
          "eyeVector": "Vivienne Finger -> Ornate Mirror Glass",
          "artBrief": "Vivienne touches the cold glass of a full-length gilded mirror adorned with iron briars. Her reflection does not copy her; it smiles tenderly.",
          "generationPrompt": "Shojo gothic manga panel, pale girl touching antique gilded mirror, reflection moving independently with gentle smile, delicate lace details --ar 16:9",
          "captions": [],
          "balloons": [
            {
              "speaker": "VIVIENNE",
              "text": "Are you another ghost, or only my own shadow growing tired of waiting?",
              "style": "whisper",
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
          "cameraAngle": "close-up",
          "eyeVector": "Prince Lucien Face Inside Glass -> Cracked Porcelain Skin",
          "artBrief": "Inside the glass: Prince Lucien, an ethereal youth with silver hair over one violet eye, his porcelain cheek delicately cracked like an antique teacup.",
          "generationPrompt": "Gorgeous Kaori Yuki style male porcelain spirit inside mirror, cracked china skin on cheek, silver bangs, violet eye, thorn crown --ar 16:9",
          "captions": [],
          "balloons": [
            {
              "speaker": "PRINCE LUCIEN",
              "text": "I am whatever you refused to let die, Vivienne.",
              "style": "whisper",
              "position": {
                "bottom": "16px",
                "right": "16px"
              }
            }
          ],
          "sfx": [
            {
              "word": "kriiiiing...",
              "style": "ligne-ink",
              "animation": "float",
              "position": {
                "top": "16px",
                "right": "20px"
              }
            }
          ]
        }
      ]
    },
    {
      "pageNumber": 3,
      "title": "The Clock Strikes Backward",
      "act": "Act I: The Gilded Captive",
      "sequenceBeat": "Temporal Anomaly",
      "layoutGrammar": "3-Panel Clockwork Whirlwind",
      "panels": [
        {
          "panelNumber": 1,
          "geometry": "circle-reticle",
          "flex": 4,
          "cameraAngle": "close-up",
          "eyeVector": "Clock Face Hands Spinning Counter-Clockwise",
          "artBrief": "Close up of the clock face: the gilded brass roman numeral hands spin rapidly backward against the gears, sparks flying from the escapement.",
          "generationPrompt": "Intricate circular manga panel, antique brass clock hands spinning backward violently, gears meshing, Gothic filigree frame --ar 1:1",
          "captions": [],
          "balloons": [],
          "sfx": [
            {
              "word": "CHIME-CHIME-CHIME!",
              "style": "orange-kinetic",
              "animation": "shake",
              "position": {
                "top": "10px",
                "right": "10px"
              }
            }
          ]
        },
        {
          "panelNumber": 2,
          "geometry": "standard-rect",
          "flex": 4,
          "cameraAngle": "medium",
          "eyeVector": "Shadows Stretching Backward Across Carpet",
          "artBrief": "The shadows on the crimson velvet carpet reverse direction, stretching toward the windows as broad daylight turns abruptly into violet twilight.",
          "generationPrompt": "Gothic mansion room where daylight suddenly inverts into deep twilight, shadows pulling backward, surreal psychological horror --ar 1:1",
          "captions": [
            {
              "text": "Midday strikes thirteen. The sun retreats into the pines.",
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
          "cameraAngle": "close-up",
          "eyeVector": "Vivienne Eyes Dilating in Terror",
          "artBrief": "Vivienne clutches her lace collar, eyes wide as she hears her late mother’s piano melody echoing through the empty rafters.",
          "generationPrompt": "Close up gothic anime girl gripping her chest in fear, expressive eyes, hair floating in spectral wind --ar 1:1",
          "captions": [],
          "balloons": [
            {
              "speaker": "VIVIENNE",
              "text": "Mother’s waltz... but she hasn’t touched the keys in ten years!",
              "style": "thought",
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
      "pageNumber": 4,
      "title": "Briar Thorns and Porcelain",
      "act": "Act I: The Gilded Captive",
      "sequenceBeat": "The Mirror Glass Breached",
      "layoutGrammar": "Slanted Slash Gothic Intrusion",
      "panels": [
        {
          "panelNumber": 1,
          "geometry": "slanted-slash-left",
          "flex": 6,
          "cameraAngle": "medium",
          "eyeVector": "Lucien Hand Emerging from Glass Surface -> Rippling Mercury",
          "artBrief": "Prince Lucien steps directly through the surface of the mirror as if it were water, black briar thorns wrapping around his forearms like thorny vines.",
          "generationPrompt": "Shojo manga art, beautiful male spirit stepping through rippling liquid mirror, black rose thorns on pale arms, falling petals --ar 16:9",
          "captions": [],
          "balloons": [],
          "sfx": [
            {
              "word": "shhh-riiiip...",
              "style": "ligne-ink",
              "animation": "float",
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
          "eyeVector": "Lucien Hand Touching Vivienne Tear",
          "artBrief": "Lucien gently catches a single unshed tear from Vivienne’s cheek with a cold porcelain fingertip; the tear freezes into purple quartz.",
          "generationPrompt": "Close up tender romantic gothic touch, porcelain hand catching tear on girl’s cheek, tear turning into crystal jewel, CLAMP style --ar 16:9",
          "captions": [],
          "balloons": [
            {
              "speaker": "PRINCE LUCIEN",
              "text": "You keep your tears in bottles, countess. That is why the clocks will not let you leave.",
              "style": "whisper",
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
      "pageNumber": 5,
      "title": "The Corridor of Lost Winters",
      "act": "Act II: The Labyrinth of Memory",
      "sequenceBeat": "The Ancestral Walk",
      "layoutGrammar": "Widescreen Infinite Corridor Spread",
      "panels": [
        {
          "panelNumber": 1,
          "geometry": "widescreen-letterbox",
          "flex": 12,
          "cameraAngle": "extreme-wide",
          "eyeVector": "Endless Wrought-Iron Sconces -> Vivienne and Lucien Walking -> Whispering Oil Paintings",
          "artBrief": "An endless gothic corridor lined with frozen oil portraits whose eyes track Vivienne. Frost creeps across the gilt frames, and snow drifts from the ceiling down upon the velvet runner.",
          "generationPrompt": "21:9 wide shojo gothic manga panel, endless frozen hallway with snow falling indoors onto velvet carpet, countess and ghost prince walking, whispering ancestor portraits, Kaori Yuki art --ar 21:9",
          "captions": [
            {
              "text": "THE CORRIDOR OF LOST WINTERS\nEvery portrait holds a year she wished to erase.",
              "kind": "voiceover",
              "position": {
                "top": "20px",
                "left": "24px",
                "maxWidth": "60%"
              }
            }
          ],
          "balloons": [
            {
              "speaker": "VIVIENNE",
              "text": "Where are you leading me, Lucien?",
              "style": "whisper",
              "position": {
                "bottom": "20px",
                "right": "24px"
              }
            }
          ]
        }
      ]
    },
    {
      "pageNumber": 6,
      "title": "The Mother’s Music Box",
      "act": "Act II: The Labyrinth of Memory",
      "sequenceBeat": "The Root Trauma",
      "layoutGrammar": "3-Panel Nostalgic Micro-Beat",
      "panels": [
        {
          "panelNumber": 1,
          "geometry": "standard-rect",
          "flex": 4,
          "cameraAngle": "close-up",
          "eyeVector": "Silver Music Box on Velvet Pedestal",
          "artBrief": "An ornate silver music box shaped like a cathedral. A silver ballerina stands frozen mid-turn on a cracked mirror disc.",
          "generationPrompt": "Close up antique gothic music box, delicate silver ballerina frozen mid-spin, velvet pedestal, soft candlelight --ar 1:1",
          "captions": [],
          "balloons": []
        },
        {
          "panelNumber": 2,
          "geometry": "standard-rect",
          "flex": 4,
          "cameraAngle": "medium",
          "eyeVector": "Vivienne Reaching for Wind-Up Key",
          "artBrief": "Vivienne reaches her trembling hand toward the silver winding key, her heart beating in cadence with the distant pendulums.",
          "generationPrompt": "Young countess trembling hand reaching for music box key, emotional vulnerability, delicate manga linework --ar 1:1",
          "captions": [
            {
              "text": "The last song they played before the carriage departed into the storm.",
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
          "cameraAngle": "close-up",
          "eyeVector": "Lucien’s Hand Halting Her Wrist",
          "artBrief": "Lucien’s hand stops her wrist with gentle, unyielding firmness; his violet eyes solemn and full of sorrow.",
          "generationPrompt": "Spirit prince gently stopping girl’s hand, intense romantic sadness in violet eyes, CLAMP style --ar 1:1",
          "captions": [],
          "balloons": [
            {
              "speaker": "PRINCE LUCIEN",
              "text": "If you wind it again, you will remain sixteen forever. Is that truly what you want?",
              "style": "standard",
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
      "pageNumber": 7,
      "title": "The Swarm of Black Lace",
      "act": "Act II: The Labyrinth of Memory",
      "sequenceBeat": "Psychological Nightmare Manifestation",
      "layoutGrammar": "Open Bleed Shadow Whirlpool",
      "panels": [
        {
          "panelNumber": 1,
          "geometry": "open-bleed",
          "flex": 12,
          "cameraAngle": "high-angle-dutch",
          "eyeVector": "Swirling Black Lace Tendrils -> Vivienne Trapped in Center -> Clock Gears Raining",
          "artBrief": "The walls dissolve into thousands of swirling ribbons of black funeral lace. Phantom hands made of lace reach for Vivienne, trying to pull her into the ticking grandfather clocks.",
          "generationPrompt": "Surreal dark psychological shojo manga splash, giant whirlpool of black mourning lace and clock gears suffocating heroine, high contrast black and white with violet highlights --ar 21:9",
          "captions": [
            {
              "text": "THE ANCESTRAL WEIGHT\n\"Stay with us, Vivienne. Here, no one grows old. Here, no one leaves.\"",
              "kind": "voiceover",
              "position": {
                "top": "24px",
                "left": "28px",
                "maxWidth": "65%"
              }
            }
          ],
          "balloons": [
            {
              "speaker": "VIVIENNE",
              "text": "NO! I am breathing! I want the sun!",
              "style": "shout",
              "position": {
                "bottom": "24px",
                "right": "28px"
              }
            }
          ],
          "sfx": [
            {
              "word": "SKRRRR-RIIIIIIP!",
              "style": "red-impact",
              "animation": "shake",
              "position": {
                "top": "30px",
                "right": "40px"
              }
            }
          ]
        }
      ]
    },
    {
      "pageNumber": 8,
      "title": "Lucien’s True Origin",
      "act": "Act II: The Labyrinth of Memory",
      "sequenceBeat": "The Confession & Revelation",
      "layoutGrammar": "Dual Split Intimate Heartbreak",
      "panels": [
        {
          "panelNumber": 1,
          "geometry": "standard-rect",
          "flex": 6,
          "cameraAngle": "close-up",
          "eyeVector": "Lucien Cracking Chest -> Glowing Blue Hydrangea Heart",
          "artBrief": "Lucien pulls open his velvet coat. His porcelain chest is hollow, holding only a single living blue hydrangea glowing with soft starlight.",
          "generationPrompt": "Poignant shojo manga panel, male porcelain spirit opening coat to reveal single glowing blue hydrangea flower inside hollow chest, emotional depth --ar 16:9",
          "captions": [],
          "balloons": [
            {
              "speaker": "PRINCE LUCIEN",
              "text": "I was never an ancestor, Vivienne. Ten years ago, when your mother died, you wept one tear and built me out of porcelain to keep you company.",
              "style": "whisper",
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
          "cameraAngle": "close-up",
          "eyeVector": "Vivienne Touching the Flower -> Understanding",
          "artBrief": "Vivienne touches the glowing petals. Her eyes soften from fear into deep, cathartic recognition.",
          "generationPrompt": "Girl touching the glowing flower in boy’s chest, gentle tears of healing, beautifully inked eyes, CLAMP artwork --ar 16:9",
          "captions": [],
          "balloons": [
            {
              "speaker": "VIVIENNE",
              "text": "You were my sorrow. You kept me safe from the cold.",
              "style": "whisper",
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
      "title": "The Ascent to the Clock Tower",
      "act": "Act III: Breaking the Pendulum",
      "sequenceBeat": "The Climax Begins",
      "layoutGrammar": "Vertical Monolith Spiral Ascent",
      "panels": [
        {
          "panelNumber": 1,
          "geometry": "vertical-monolith",
          "flex": 12,
          "cameraAngle": "worm-eye",
          "eyeVector": "Bottom Vivienne Climbing -> Winding Iron Spiral Stairs -> Top Giant Pendulum",
          "artBrief": "Vivienne runs up a towering circular wrought-iron staircase toward the apex of the central clock tower. Above her, the colossal 40-foot brass master pendulum swings with deafening rhythmic force.",
          "generationPrompt": "Vertical gothic manga panel, girl running up endless spiral iron staircase inside colossal clock tower, massive swinging brass pendulum above, dramatic angles --ar 9:16",
          "captions": [
            {
              "text": "THE MASTER CLOCK // APEX TOWER\nThe heart that drives all seventy-seven pendulums in the valley.",
              "kind": "voiceover",
              "position": {
                "top": "20px",
                "left": "20px"
              }
            }
          ],
          "balloons": [],
          "sfx": [
            {
              "word": "THOOOOM... THOOOOM...",
              "style": "orange-kinetic",
              "animation": "shake",
              "position": {
                "left": "30px",
                "top": "160px",
                "fontSize": "50px"
              }
            }
          ]
        }
      ]
    },
    {
      "pageNumber": 10,
      "title": "The Great Brass Pendulum",
      "act": "Act III: Breaking the Pendulum",
      "sequenceBeat": "Confronting the Mechanism",
      "layoutGrammar": "Dual Split Monumental Action",
      "panels": [
        {
          "panelNumber": 1,
          "geometry": "standard-rect",
          "flex": 6,
          "cameraAngle": "wide",
          "eyeVector": "Massive Brass Disc Swiping Across Room -> Wind Pressure",
          "artBrief": "The giant pendulum slices through the air like a gilded guillotine, blowing gale-force wind through Vivienne’s black ringlets and lace sleeves.",
          "generationPrompt": "Giant brass clock pendulum swinging dangerously close to courageous girl on tower balcony, wind whipping dark hair, Kaori Yuki dramatic style --ar 16:9",
          "captions": [],
          "balloons": [
            {
              "speaker": "VIVIENNE",
              "text": "I am not your prisoner any longer! Time belongs to the living!",
              "style": "shout",
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
          "cameraAngle": "close-up",
          "eyeVector": "Vivienne Holding the Master Silver Key",
          "artBrief": "Vivienne raises the ornate antique silver clock key in both hands, its teeth glowing with violet starlight.",
          "generationPrompt": "Close up heroic shojo heroine raising ornate silver key aloft, violet magical aura, determined expression --ar 16:9",
          "captions": [],
          "balloons": []
        }
      ]
    },
    {
      "pageNumber": 11,
      "title": "Shattering the Master Escapement",
      "act": "Act III: Breaking the Pendulum",
      "sequenceBeat": "The Decisive Strike",
      "layoutGrammar": "Full Page Dynamic Climax Splash",
      "panels": [
        {
          "panelNumber": 1,
          "geometry": "open-bleed",
          "flex": 12,
          "cameraAngle": "low-angle-heroic",
          "eyeVector": "Key Thrust into Central Gear Teeth -> Shattering Brass Teeth -> Bursting Light",
          "artBrief": "Vivienne thrusts the silver key directly into the meshing teeth of the master escapement wheel. Brass cogs fracture, springs snap, and an explosive blinding shockwave of white light erupts across the tower.",
          "generationPrompt": "Monumental shojo manga climax splash, girl jamming silver key into giant clock gears, gears shattering in explosive burst of white light and brass shards, dramatic speedlines, CLAMP art --ar 21:9",
          "captions": [],
          "balloons": [],
          "sfx": [
            {
              "word": "KRA-SHIIIIIIIIING!",
              "style": "cyan-electric",
              "animation": "shake",
              "position": {
                "left": "30%",
                "top": "40%",
                "fontSize": "64px"
              }
            }
          ]
        }
      ]
    },
    {
      "pageNumber": 12,
      "title": "The Deluge of Blue Hydrangeas",
      "act": "Act III: Breaking the Pendulum",
      "sequenceBeat": "The Poetic Transformation",
      "layoutGrammar": "Floating Borderless Petal Whirlwind",
      "panels": [
        {
          "panelNumber": 1,
          "geometry": "open-bleed",
          "flex": 12,
          "cameraAngle": "extreme-wide",
          "eyeVector": "Center Tower Shattering Glass -> Millions of Hydrangea Petals Cascading Down Valley",
          "artBrief": "The stained glass face of the clock tower blows outward. Instead of shrapnel, millions of soft blue and violet hydrangea blossoms pour into the valley like a warm summer rain.",
          "generationPrompt": "Breathtakingly gorgeous shojo manga panel, millions of soft blue hydrangea flowers erupting from gothic clock tower into evening sky, magical petal rain, Kaori Yuki aesthetic --ar 21:9",
          "captions": [
            {
              "text": "SEVENTY-SEVEN CLOCKS FALL SILENT AT ONCE.\nThe valley is flooded with petals instead of chimes.",
              "kind": "voiceover",
              "position": {
                "top": "24px",
                "left": "28px",
                "maxWidth": "60%"
              }
            }
          ],
          "balloons": [],
          "sfx": [
            {
              "word": "frouuuu-shhhhh...",
              "style": "ligne-ink",
              "animation": "float",
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
      "pageNumber": 13,
      "title": "Lucien’s Farewell",
      "act": "Act III: Breaking the Pendulum",
      "sequenceBeat": "The Bittersweet Release",
      "layoutGrammar": "Dual Split Intimate Romance",
      "panels": [
        {
          "panelNumber": 1,
          "geometry": "standard-rect",
          "flex": 6,
          "cameraAngle": "medium",
          "eyeVector": "Lucien Body Dissolving into Morning Mist -> Gentle Smile",
          "artBrief": "Prince Lucien stands on the balcony in the morning breeze. His porcelain fingers and velvet coat are softly dissolving into glowing white mist and lavender petals.",
          "generationPrompt": "Heartbreakingly beautiful manga scene, porcelain spirit youth fading into gentle morning mist with loving serene smile, CLAMP bittersweet ending --ar 16:9",
          "captions": [],
          "balloons": [
            {
              "speaker": "PRINCE LUCIEN",
              "text": "Thank you, Vivienne. You do not need a shadow to protect you anymore. The sun has arrived.",
              "style": "whisper",
              "position": {
                "bottom": "16px",
                "left": "16px",
                "maxWidth": "80%"
              }
            }
          ]
        },
        {
          "panelNumber": 2,
          "geometry": "standard-rect",
          "flex": 6,
          "cameraAngle": "close-up",
          "eyeVector": "Vivienne Smiling Through Tears -> Touching the Empty Mist",
          "artBrief": "Vivienne touches the warm morning mist where his cheek was, smiling peacefully as she bids farewell to her grief.",
          "generationPrompt": "Close up young woman smiling peacefully through gentle tears as she touches golden morning sunlight, emotional healing --ar 16:9",
          "captions": [],
          "balloons": [
            {
              "speaker": "VIVIENNE",
              "text": "Goodbye, Lucien. Rest in the garden.",
              "style": "whisper",
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
      "pageNumber": 14,
      "title": "The Iron Gates Swing Open",
      "act": "Act III: Breaking the Pendulum",
      "sequenceBeat": "The Threshold to the World",
      "layoutGrammar": "Dual Split Liberation Tier",
      "panels": [
        {
          "panelNumber": 1,
          "geometry": "standard-rect",
          "flex": 6,
          "cameraAngle": "wide",
          "eyeVector": "Ancient Rust-Locked Gates Swinging Inward -> Morning Sunlight",
          "artBrief": "The colossal black wrought-iron gates of House Valerius, locked for over a century, swing open on ancient oiled hinges as golden morning sunlight floods the driveway.",
          "generationPrompt": "Massive ornate black iron gates of gothic estate swinging open, bright morning sunlight pouring onto gravel driveway, birds taking flight --ar 16:9",
          "captions": [
            {
              "text": "The locks do not hold when the heart refuses to be confined.",
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
              "word": "CREEEEEAK...",
              "style": "ligne-ink",
              "animation": "float",
              "position": {
                "top": "14px",
                "right": "20px"
              }
            }
          ]
        },
        {
          "panelNumber": 2,
          "geometry": "standard-rect",
          "flex": 6,
          "cameraAngle": "medium",
          "eyeVector": "Vivienne Unbuttoning Heavy Black Velvet Cloak",
          "artBrief": "Vivienne sheds her heavy black mourning cloak, letting it fall onto the marble threshold to reveal a simple, light white summer dress underneath.",
          "generationPrompt": "Young countess shedding heavy black mourning cloak, revealing white dress underneath, stepping into morning light, symbolic rebirth --ar 16:9",
          "captions": [],
          "balloons": []
        }
      ]
    },
    {
      "pageNumber": 15,
      "title": "Barefoot on the Petals",
      "act": "Act III: Breaking the Pendulum",
      "sequenceBeat": "Physical Sensory Freedom",
      "layoutGrammar": "3-Panel Sensory Reconnection",
      "panels": [
        {
          "panelNumber": 1,
          "geometry": "standard-rect",
          "flex": 4,
          "cameraAngle": "close-up",
          "eyeVector": "Bare Feet Stepping onto Cool Green Grass and Dew",
          "artBrief": "Extreme close up of Vivienne’s bare feet stepping onto cool, dew-kissed green clover and soft fallen hydrangea petals.",
          "generationPrompt": "Close up bare feet stepping on lush green grass and fallen blue petals in morning dew, beautiful delicate linework --ar 1:1",
          "captions": [
            {
              "text": "For the first time in sixteen years: real grass. Real dew.",
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
          "panelNumber": 2,
          "geometry": "standard-rect",
          "flex": 4,
          "cameraAngle": "close-up",
          "eyeVector": "Vivienne Face Turned Upward to the Warm Sun",
          "artBrief": "Vivienne tilts her head upward toward the dawn sky, golden sunlight warming her pale cheeks and shining through her eyelashes.",
          "generationPrompt": "Close up beautiful young woman basking in warm golden dawn sunlight, eyes closed in peaceful bliss, delicate hair --ar 1:1",
          "captions": [],
          "balloons": []
        },
        {
          "panelNumber": 3,
          "geometry": "standard-rect",
          "flex": 4,
          "cameraAngle": "medium",
          "eyeVector": "Blue Butterfly Landing on Her Finger",
          "artBrief": "A wild blue butterfly alights gently on Vivienne’s outstretched index finger, opening and closing its wings in silent harmony.",
          "generationPrompt": "Blue butterfly resting on girl’s finger in sunlit garden, shojo manga beauty, CLAMP style --ar 1:1",
          "captions": [],
          "balloons": [
            {
              "speaker": "VIVIENNE",
              "text": "Good morning.",
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
      "pageNumber": 16,
      "title": "The Valley in Bloom",
      "act": "Act III: Breaking the Pendulum",
      "sequenceBeat": "Masterpiece Final Shojo Spread",
      "layoutGrammar": "Full Page Shojo Gothic Transcendent Splash",
      "panels": [
        {
          "panelNumber": 1,
          "geometry": "open-bleed",
          "flex": 12,
          "cameraAngle": "extreme-wide",
          "eyeVector": "Center Vivienne in White Dress Walking Down Path -> Entire Green Valley in Bloom -> Silent Distant Château",
          "artBrief": "Masterpiece final open bleed spread: Lady Vivienne Valerius in her simple white dress walking down the winding sunlit hill into the open world. Behind her, the dark château rests quietly among ancient pines, its clocks forever still. Ahead of her, infinite rolling green hills carpeted with wild blue hydrangeas beneath a flawless summer sky.",
          "generationPrompt": "Masterpiece final splash page by CLAMP and Kaori Yuki, beautiful young countess in white summer dress walking down lush green sunlit valley filled with blooming blue hydrangeas, distant silent gothic mansion, golden morning light, butterflies, transcendent emotional healing ending --ar 21:9",
          "captions": [
            {
              "text": "THE CLOCKS NEVER CHIMED AGAIN.\nAND FOR THE FIRST TIME, HOUSE VALERIUS LEARNED TO LIVE.\n\nEND OF PALE HYDRANGEAS OF THE ABYSS.",
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
    "Adapt into a haunted Victorian glasshouse where greenhouse spirits tend extinct orchids.",
    "Shift to a modern psychological memory ward where patients enter each other’s dreams.",
    "Frame as a dark fairy tale retelling of Beauty and the Beast in a clockwork underworld."
  ],
  "councilDirectorNotes": "Shojo Gothic layouts prioritize emotional and psychological resonance over rigid spatial geometry. Panels should float like memories or tears across the velvet darkness of the page."
};
