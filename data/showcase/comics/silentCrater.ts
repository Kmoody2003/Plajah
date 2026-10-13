// data/showcase/comics/silentCrater.ts
// Master Showcase Book: VOYAGE TO THE SILENT CRATER
// COMPLETE UNABRIDGED 16-PAGE SEQUENTIAL ART SCRIPT

import { ShowcaseComicBook } from '../comicTypes';

export const silentCrater: ShowcaseComicBook = {
  "id": "silent-crater",
  "templateId": "bd-ligne-claire",
  "title": "VOYAGE TO THE SILENT CRATER",
  "subtitle": "A Meditative Odyssey Across the Petrified Crystal Plains",
  "genre": "ligne-claire",
  "councilLenses": {
    "leadArtist": "Moebius (Jean Giraud) & Enki Bilal (Uniform Delicate 1.5px Linework & Pastel Desaturation)",
    "leadWriter": "Alejandro Jodorowsky & René Goscinny (Philosophical Poetics & Meditative Solitude)",
    "storyIntelligence": "Plajah Ligne-Claire Engine (Expansive Breathing Gutters, Watercolor Matte Tints, Silent Spreads)"
  },
  "targetAudience": "mature-17+",
  "pageCount": 16,
  "logline": "Across the infinite turquoise salt deserts of a forgotten terraformed moon, a solitary cartographer on a giant feathered saurian seeks the legendary crater where time ceases to advance.",
  "blurb": "The moon of Oros was abandoned by the Architects ten thousand cycles ago. All that remains are silent crystal dunes, monumental statues half-buried in pale sand, and the wind that sings through fossilized bone arches. Master Elian, last surveyor of the Cartographer’s Guild, rides his faithful saurian Pteron toward the Silent Crater—a geographical anomaly where gravity floats upward and memories take physical form as glass flowers.",
  "theme": "The beauty of transience, the acceptance of silence, and the contemplation of geological eternity.",
  "visualGrammar": {
    "gutterWidth": "26px",
    "gutterColor": "#ded8c7",
    "pageTexture": "parchment-french-bd",
    "primaryPalette": [
      "#fcfaf2",
      "#78716c",
      "#0d9488",
      "#f97316",
      "#e0e7ff"
    ],
    "typography": {
      "bodyFont": "Georgia, serif",
      "captionFont": "Georgia, serif",
      "sfxFont": "Trebuchet MS, sans-serif"
    },
    "inkingStyle": "Pure Franco-Belgian Ligne Claire: single uniform 1.5px pen line weight, zero cross-hatching, colors laid in flat desaturated watercolor washes, expansive breathing margins."
  },
  "characters": [
    {
      "id": "elian",
      "name": "Master Elian",
      "role": "protagonist",
      "archetype": "The Contemplative Pilgrim",
      "personality": [
        "meditative",
        "gentle",
        "curious",
        "patient",
        "unburdened"
      ],
      "lockedVisualLook": "Slender, stoic elder wearing a hooded saffron tunic, high leather sand-boots, brass navigational armillary sphere strapped to his hip, eyes calm and clear.",
      "palette": [
        "#f59e0b",
        "#78716c",
        "#fcfaf2",
        "#0f766e"
      ],
      "voiceSignature": "Soft, lyrical, philosophical observations phrased like quiet poetic aphorisms.",
      "arc": "Crosses the desolate wastes not to conquer or map the unknown, but to surrender his compass to the eternal sands."
    },
    {
      "id": "pteron",
      "name": "Pteron (The Feathersaur)",
      "role": "deuteragonist",
      "archetype": "The Ancient Beast of Burden",
      "personality": [
        "loyal",
        "stoic",
        "gentle",
        "perceptive"
      ],
      "lockedVisualLook": "A tall bipedal saurian with long graceful neck, covered in downy lavender-and-turquoise plumage, large golden intelligent eyes.",
      "palette": [
        "#818cf8",
        "#2dd4bf",
        "#fef08a"
      ],
      "voiceSignature": "Low musical trills and rhythmic soft footfalls across the dunes.",
      "arc": "Guides Elian faithfully through shifting mirages to the threshold of the crater."
    }
  ],
  "pages": [
    {
      "pageNumber": 1,
      "title": "The Turquoise Dunes of Oros",
      "act": "Act I: The Journey Inward",
      "sequenceBeat": "Contemplative Ligne Claire Establishing / Breathing Silence",
      "layoutGrammar": "Panoramic Golden Ratio Spreads + Silent Environmental Observation",
      "panels": [
        {
          "panelNumber": 1,
          "geometry": "open-bleed",
          "flex": 12,
          "cameraAngle": "extreme-wide",
          "eyeVector": "Left Dune Crest -> Center Rider & Saurian -> Right Vast Desert Horizon",
          "artBrief": "Endless rolling dunes of pale turquoise sand beneath an enormous pale lemon-yellow sky with two ringed sister planets. In the distance, a colossal weathered stone face sleeps half-buried in the sand.",
          "generationPrompt": "Extreme wide desert landscape by Moebius, Jean Giraud style, delicate uniform black pen outlines, pale pastel turquoise dunes, solitary traveler riding tall feathered ostrich lizard creature, gigantic ancient sleeping stone face buried in dunes, soft watercolor wash, Franco-Belgian comic art --ar 21:9",
          "captions": [
            {
              "text": "THE DESERT OF DREAMS // CYCLE 14,082\nHere, the silence is not empty. It is simply complete.",
              "kind": "voiceover",
              "position": {
                "top": "24px",
                "left": "28px",
                "maxWidth": "50%"
              }
            }
          ],
          "balloons": [],
          "sfx": [
            {
              "word": "frouuuu...",
              "style": "ligne-ink",
              "animation": "float",
              "position": {
                "right": "60px",
                "bottom": "30px"
              }
            }
          ]
        }
      ]
    },
    {
      "pageNumber": 2,
      "title": "The Floating Astrolabe",
      "act": "Act I: The Journey Inward",
      "sequenceBeat": "The Instrument of Navigation",
      "layoutGrammar": "Dual Balanced Panel Tier",
      "panels": [
        {
          "panelNumber": 1,
          "geometry": "standard-rect",
          "flex": 6,
          "cameraAngle": "medium",
          "eyeVector": "Left Elian Compass -> Right Horizon Line",
          "artBrief": "Elian consulting a brass armillary sphere that floats weightlessly above his palm, its miniature rings spinning in silent harmony with the planetary rings above.",
          "generationPrompt": "Franco-Belgian comic panel, serene elderly cartographer in saffron robes holding weightless floating brass astrolabe, delicate 1.5px uniform linework, pastel sand dunes background, Moebius style --ar 16:9",
          "captions": [],
          "balloons": [
            {
              "speaker": "MASTER ELIAN",
              "text": "Still fourteen leagues to the rim. Drink, Pteron. The salt wind drinks more than we do.",
              "style": "standard",
              "position": {
                "bottom": "20px",
                "left": "24px",
                "maxWidth": "70%"
              }
            }
          ]
        },
        {
          "panelNumber": 2,
          "geometry": "standard-rect",
          "flex": 6,
          "cameraAngle": "close-up",
          "eyeVector": "Pteron Golden Eye -> Feather Texture",
          "artBrief": "Close up of Pteron’s gentle golden eye, lavender plumage rustling in the thermal breeze, nuzzling Elian’s shoulder.",
          "generationPrompt": "Close up of magnificent feathered saurian head with soft lavender and turquoise down, golden intelligent eye, Jean Giraud clean lines --ar 16:9",
          "captions": [],
          "balloons": [],
          "sfx": [
            {
              "word": "krrrr-krr...",
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
      "title": "The Bone Arches of the Old World",
      "act": "Act I: The Journey Inward",
      "sequenceBeat": "Geological Antiquity",
      "layoutGrammar": "3-Panel Vertical Architectural Cascade",
      "panels": [
        {
          "panelNumber": 1,
          "geometry": "standard-rect",
          "flex": 4,
          "cameraAngle": "wide",
          "eyeVector": "Saurian Walking Through Giant Bone Ribs -> Distant Mirage",
          "artBrief": "Elian and Pteron riding through the petrified ribcage of a leviathan that died a million years before the desert formed; bone arches framing the pale lemon sky.",
          "generationPrompt": "Wide shot of traveler on bipedal saurian walking beneath titanic fossilized bone arches in pastel desert, Moebius surrealism, delicate watercolor tint --ar 1:1",
          "captions": [
            {
              "text": "The leviathans did not drown in water. They drowned in time.",
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
          "flex": 8,
          "cameraAngle": "medium",
          "eyeVector": "Carved Glyphs on Bone -> Elian’s Touch",
          "artBrief": "Elian gently resting his weathered fingers on ancient geometric glyphs carved into the ivory surface by forgotten pilgrims.",
          "generationPrompt": "Medium shot of gentle cartographer touching carved geometric alien runes on ancient ivory megalith, uniform line art, pastel colors --ar 16:9",
          "captions": [],
          "balloons": [
            {
              "speaker": "MASTER ELIAN",
              "text": "Someone stood here before the stars shifted. And they, too, were searching.",
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
      "pageNumber": 4,
      "title": "Pteron’s Song",
      "act": "Act I: The Journey Inward",
      "sequenceBeat": "The Animal Companion Bond",
      "layoutGrammar": "Dual Split Horizontal Balance",
      "panels": [
        {
          "panelNumber": 1,
          "geometry": "widescreen-letterbox",
          "flex": 6,
          "cameraAngle": "extreme-wide",
          "eyeVector": "Dunes Rippling in Wind -> Saurian Call",
          "artBrief": "Pteron extends his slender neck toward the lemon sky, releasing a three-tone flute melody that creates gentle ripples across the turquoise sand.",
          "generationPrompt": "Surreal desert landscape, graceful feathered saurian singing to ringed planets, sound waves visible as faint pastel ripples in air, Ligne Claire --ar 21:9",
          "captions": [],
          "balloons": [],
          "sfx": [
            {
              "word": "TOOOOO-LA-LIIII...",
              "style": "ligne-ink",
              "animation": "float",
              "position": {
                "top": "20px",
                "left": "40px",
                "fontSize": "38px"
              }
            }
          ]
        },
        {
          "panelNumber": 2,
          "geometry": "standard-rect",
          "flex": 6,
          "cameraAngle": "medium",
          "eyeVector": "Elian Smiling -> Campfire Smoke",
          "artBrief": "Elian unpacking small brass cups and petrified herbal leaves for twilight tea, smiling as the saurian rests its head beside him on the dune.",
          "generationPrompt": "Peaceful campsite in pastel sci-fi desert, saffron robed pilgrim brewing tea beside sleeping feathered saurian, Moebius warm twilight watercolor --ar 16:9",
          "captions": [
            {
              "text": "No clocks in the desert. The day ends when the tea cools.",
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
      "pageNumber": 5,
      "title": "The Buried Colossus",
      "act": "Act I: The Journey Inward",
      "sequenceBeat": "Monumental Solitude",
      "layoutGrammar": "Open Bleed Low-Angle Majesty",
      "panels": [
        {
          "panelNumber": 1,
          "geometry": "open-bleed",
          "flex": 12,
          "cameraAngle": "low-angle-heroic",
          "eyeVector": "Bottom Traveler -> Enormous Stone Forehead -> Twin Sister Moons",
          "artBrief": "Elian and Pteron at the base of a 200-meter weathered stone face sleeping peacefully in the dunes, its closed stone eyes covered in pale lichen.",
          "generationPrompt": "Monumental ancient sleeping stone god head half-buried in turquoise sand dunes, tiny traveler and feathered saurian standing at the chin, Moebius Arzach style, vast scale --ar 21:9",
          "captions": [
            {
              "text": "THE FIRST ARCHITECT // SLEEPING SINCE THE FOUNDING CYCLE\nDo they dream of what we built? Or are we only their waking nightmare?",
              "kind": "voiceover",
              "position": {
                "top": "24px",
                "left": "28px",
                "maxWidth": "55%"
              }
            }
          ],
          "balloons": []
        }
      ]
    },
    {
      "pageNumber": 6,
      "title": "The Hermit of the Astrolabe",
      "act": "Act II: The Whispering Mirage",
      "sequenceBeat": "Encounter with the Forgotten",
      "layoutGrammar": "3-Panel Conversational Intimacy",
      "panels": [
        {
          "panelNumber": 1,
          "geometry": "standard-rect",
          "flex": 4,
          "cameraAngle": "medium",
          "eyeVector": "Ancient Stone Hut -> Hermit Sitting in Threshold",
          "artBrief": "A tiny hexagonal stone cell built from basalt blocks. An ancient hermit with a beard like woven silk sits cross-legged, polishing glass lenses.",
          "generationPrompt": "Old hermit in geometric desert cell polishing crystal astronomical lenses, gentle linework, pastel tones, French graphic novel --ar 1:1",
          "captions": [],
          "balloons": [
            {
              "speaker": "HERMIT",
              "text": "You carry the guild armillary. Which century are you seeking, traveler?",
              "style": "standard",
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
          "flex": 4,
          "cameraAngle": "close-up",
          "eyeVector": "Elian’s Compass -> Hermit’s Blind Milky Eyes",
          "artBrief": "Elian holds out the brass astrolabe. The hermit touches its rings with fingertips worn smooth as river stones.",
          "generationPrompt": "Close up of hands touching intricate brass astrolabe rings, serene blind elder smiling, delicate linework --ar 1:1",
          "captions": [],
          "balloons": [
            {
              "speaker": "MASTER ELIAN",
              "text": "I am not seeking a century. I am seeking the place where the needles stop.",
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
          "cameraAngle": "medium",
          "eyeVector": "Hermit Pointing North -> Shimmering Horizon",
          "artBrief": "The hermit points a crooked wooden staff toward the northern salt ridges, where the horizon shimmers with pale violet mirages.",
          "generationPrompt": "Elder pilgrim pointing across shimmering desert horizon, lavender mirage towers in distance, Ligne Claire art --ar 1:1",
          "captions": [],
          "balloons": [
            {
              "speaker": "HERMIT",
              "text": "Then look where the sand falls upward. But remember: what enters the crater never returns to measure it.",
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
      "pageNumber": 7,
      "title": "The Tea of Petrified Leaves",
      "act": "Act II: The Whispering Mirage",
      "sequenceBeat": "Contemplative Respite",
      "layoutGrammar": "Dual Split Calm Tier",
      "panels": [
        {
          "panelNumber": 1,
          "geometry": "standard-rect",
          "flex": 6,
          "cameraAngle": "medium",
          "eyeVector": "Steam Rising from Cup -> Twilight Stars",
          "artBrief": "Steam spiraling from a jade teacup into the violet twilight. The sky deepens to indigo, revealing spiral galaxies so bright they cast sharp shadows on the dunes.",
          "generationPrompt": "Gentle night scene in sci-fi desert, steam rising from cup, stunning starlit sky with glowing galaxies, Moebius pastel colors --ar 16:9",
          "captions": [
            {
              "text": "The leaves grew before the moons had names. They taste of cold rain and mint.",
              "kind": "voiceover",
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
          "cameraAngle": "wide",
          "eyeVector": "Pteron Sleeping Curled -> Elian Leaning on Beast",
          "artBrief": "Pteron curled asleep like a giant pastel bird; Elian resting his back against the saurian’s soft plumage, writing quiet notes in his leather journal.",
          "generationPrompt": "Peaceful night drawing of traveler leaning against giant sleeping feathered creature under starlight, Ligne Claire comic --ar 16:9",
          "captions": [],
          "balloons": [
            {
              "speaker": "MASTER ELIAN",
              "text": "If no one reads this map, does the desert still exist? Yes. And it is happier for it.",
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
      "pageNumber": 8,
      "title": "Two Moons Over Oros",
      "act": "Act II: The Whispering Mirage",
      "sequenceBeat": "Celestial Splendor",
      "layoutGrammar": "Widescreen Panoramic Double Spread",
      "panels": [
        {
          "panelNumber": 1,
          "geometry": "widescreen-letterbox",
          "flex": 12,
          "cameraAngle": "extreme-wide",
          "eyeVector": "Twin Ringed Planets in Sky -> Vast Shadow Dunes -> Solitary Rider",
          "artBrief": "The twin sister planets rise in conjunction: one pale azure with gold rings, the other crimson with violet cloud bands, lighting the dunes in pearlescent silver.",
          "generationPrompt": "Astonishing panoramic alien landscape by Jean Giraud Moebius, two gigantic ringed planets dominating the sky, vast silver dunes, solitary traveler, exquisite fine lines --ar 21:9",
          "captions": [
            {
              "text": "MIDNIGHT // CONJUNCTION OF THE SISTERS\nGravity sighs. The sand shifts three centimeters toward the sky.",
              "kind": "voiceover",
              "position": {
                "top": "20px",
                "left": "24px",
                "maxWidth": "60%"
              }
            }
          ],
          "balloons": [],
          "sfx": [
            {
              "word": "shhhhhhh...",
              "style": "ligne-ink",
              "animation": "float",
              "position": {
                "right": "40px",
                "bottom": "30px"
              }
            }
          ]
        }
      ]
    },
    {
      "pageNumber": 9,
      "title": "The Whispering Mirage",
      "act": "Act II: The Whispering Mirage",
      "sequenceBeat": "Botanical Anomaly / Glass Flowers",
      "layoutGrammar": "3-Panel Flora Exploration",
      "panels": [
        {
          "panelNumber": 1,
          "geometry": "standard-rect",
          "flex": 4,
          "cameraAngle": "close-up",
          "eyeVector": "Translucent Glass Petal -> Sun Refraction",
          "artBrief": "Extreme close up of a flower made entirely of transparent volcanic silica glass, chiming like a miniature bell in the wind.",
          "generationPrompt": "Close up of crystalline glass flower growing from turquoise sand, sunbeams refracting rainbows through petals, Moebius line art --ar 1:1",
          "captions": [],
          "balloons": [],
          "sfx": [
            {
              "word": "ting-ting-ting...",
              "style": "ligne-ink",
              "animation": "float",
              "position": {
                "top": "12px",
                "right": "12px"
              }
            }
          ]
        },
        {
          "panelNumber": 2,
          "geometry": "standard-rect",
          "flex": 4,
          "cameraAngle": "medium",
          "eyeVector": "Pteron Sniffing Flower -> Gentle Reaction",
          "artBrief": "Pteron gently sniffing the glass blossom; the flower’s vibration causes the saurian’s neck plumage to fluff in amusement.",
          "generationPrompt": "Charming scene of feathered saurian inspecting glass crystal flower with curiosity, delicate pastel watercolors --ar 1:1",
          "captions": [],
          "balloons": []
        },
        {
          "panelNumber": 3,
          "geometry": "standard-rect",
          "flex": 4,
          "cameraAngle": "wide",
          "eyeVector": "Field of Glass Trees -> Distant Ridge",
          "artBrief": "An entire grove of fossilized trees with crystal canopies, catching the morning light like an ocean of diamonds.",
          "generationPrompt": "Wide shot of forest of crystal trees in pastel desert, shimmering prismatic light, Franco-Belgian masterwork --ar 1:1",
          "captions": [
            {
              "text": "Here, memories do not fade. They mineralize.",
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
      "pageNumber": 10,
      "title": "The Inverted Gravity Ridge",
      "act": "Act II: The Whispering Mirage",
      "sequenceBeat": "The Physical Anomaly",
      "layoutGrammar": "Vertical Monolith Levitation",
      "panels": [
        {
          "panelNumber": 1,
          "geometry": "vertical-monolith",
          "flex": 12,
          "cameraAngle": "worm-eye",
          "eyeVector": "Bottom Rider -> Floating Pebbles -> Ascending Sand Columns",
          "artBrief": "Elian and Pteron step onto the ridge. Tiny turquoise pebbles and ribbons of fine sand detach from the ground, drifting weightlessly upward into the yellow sky.",
          "generationPrompt": "Vertical comic panel, traveler and saurian watching sand and pebbles float upward into sky like reverse snow, Moebius surrealism --ar 9:16",
          "captions": [
            {
              "text": "THE RIDGE OF WEIGHTLESSNESS\nThe planet forgets to hold on. The sky forgets to resist.",
              "kind": "voiceover",
              "position": {
                "top": "20px",
                "left": "20px",
                "maxWidth": "65%"
              }
            }
          ],
          "balloons": [
            {
              "speaker": "MASTER ELIAN",
              "text": "Hold steady, Pteron. We are walking on the roof of the world.",
              "style": "whisper",
              "position": {
                "bottom": "24px",
                "right": "20px"
              }
            }
          ],
          "sfx": [
            {
              "word": "woooo-shhh...",
              "style": "ligne-ink",
              "animation": "float",
              "position": {
                "left": "20px",
                "top": "140px"
              }
            }
          ]
        }
      ]
    },
    {
      "pageNumber": 11,
      "title": "The Glass Siphon Canyon",
      "act": "Act II: The Whispering Mirage",
      "sequenceBeat": "Approaching the Crater Threshold",
      "layoutGrammar": "Dual Split Symmetrical Pass",
      "panels": [
        {
          "panelNumber": 1,
          "geometry": "widescreen-letterbox",
          "flex": 6,
          "cameraAngle": "wide",
          "eyeVector": "Canyon Walls of Smooth Obsidian -> Center Path",
          "artBrief": "A narrow canyon flanked by mirror-smooth obsidian cliffs that reflect Elian, Pteron, and the lemon sky in perfect symmetry.",
          "generationPrompt": "Smooth reflective obsidian canyon in pastel desert, traveler riding saurian down center of mirror floor, Jean Giraud art --ar 21:9",
          "captions": [
            {
              "text": "The walls have heard every word spoken since the first tide.",
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
          "eyeVector": "Elian’s Astrolabe Needles Spinning Wildly",
          "artBrief": "Close up of the brass astrolabe: its needles spin lazily, decoupling from the magnetic poles and pointing nowhere.",
          "generationPrompt": "Close up brass astrolabe needles spinning weightlessly, serene traveler hand, delicate line art --ar 16:9",
          "captions": [],
          "balloons": [
            {
              "speaker": "MASTER ELIAN",
              "text": "North has retired. South is asleep.",
              "style": "whisper",
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
      "pageNumber": 12,
      "title": "Pteron Hesitates",
      "act": "Act III: The Silent Crater",
      "sequenceBeat": "The Emotional Threshold",
      "layoutGrammar": "Dual Split Tender Balance",
      "panels": [
        {
          "panelNumber": 1,
          "geometry": "standard-rect",
          "flex": 6,
          "cameraAngle": "medium",
          "eyeVector": "Pteron Halting at Crater Lip -> Elian Dismounting",
          "artBrief": "At the precipice of the colossal Silent Crater, Pteron pauses, gently nudging Elian’s chest with his feathered beak.",
          "generationPrompt": "Tender scene at the edge of colossal white crater, elderly traveler dismounting feathered saurian to hug creature’s neck, pastel tones --ar 16:9",
          "captions": [],
          "balloons": [
            {
              "speaker": "MASTER ELIAN",
              "text": "You do not have to follow me down, my friend. You belong to the wind.",
              "style": "standard",
              "position": {
                "bottom": "16px",
                "left": "16px",
                "maxWidth": "70%"
              }
            }
          ]
        },
        {
          "panelNumber": 2,
          "geometry": "standard-rect",
          "flex": 6,
          "cameraAngle": "close-up",
          "eyeVector": "Pteron Nuzzling Elian -> Single Golden Tear",
          "artBrief": "Pteron rests his chin gently against Elian’s forehead, then takes three slow steps downward into the crater beside him.",
          "generationPrompt": "Close up of bond between traveler and feathered companion stepping together into white mist, Moebius style --ar 16:9",
          "captions": [
            {
              "text": "Loyalty is not an obligation. It is simply choosing the same horizon.",
              "kind": "voiceover",
              "position": {
                "top": "14px",
                "right": "14px"
              }
            }
          ],
          "balloons": []
        }
      ]
    },
    {
      "pageNumber": 13,
      "title": "The Descent into the Terraces",
      "act": "Act III: The Silent Crater",
      "sequenceBeat": "Stepping Into Stasis",
      "layoutGrammar": "Full Vertical Floating Perspective",
      "panels": [
        {
          "panelNumber": 1,
          "geometry": "open-bleed",
          "flex": 12,
          "cameraAngle": "extreme-wide",
          "eyeVector": "Top Crater Rim -> Cascading White Basalt Terraces -> Center Traveler Floating Down",
          "artBrief": "A 50-kilometer wide circular crater terraced with white crystal steps. Elian and Pteron descend by floating weightlessly from terrace to terrace, untouched by gravity.",
          "generationPrompt": "Breathtaking colossal white crystal crater with concentric terraces, traveler and saurian floating gently down into luminous center, Moebius masterpiece --ar 21:9",
          "captions": [
            {
              "text": "THE SILENT CRATER // CORE ELEVATION: UNMEASURED\nSound ceases to travel through air. It travels through understanding.",
              "kind": "voiceover",
              "position": {
                "top": "24px",
                "left": "28px",
                "maxWidth": "60%"
              }
            }
          ],
          "balloons": []
        }
      ]
    },
    {
      "pageNumber": 14,
      "title": "The Lake of Preserved Memories",
      "act": "Act III: The Silent Crater",
      "sequenceBeat": "The Mirror Core",
      "layoutGrammar": "Dual Split Harmonic Reflection",
      "panels": [
        {
          "panelNumber": 1,
          "geometry": "widescreen-letterbox",
          "flex": 6,
          "cameraAngle": "wide",
          "eyeVector": "Mirror-Still Silver Pool -> Ancient Towers Reflected Below",
          "artBrief": "At the crater floor lies a shallow pool of liquid mercury-silver. In its reflection, ancient celestial cities and soaring towers stand intact, though the surface above is bare.",
          "generationPrompt": "Surreal landscape with mirror mercury lake reflecting magnificent ancient futuristic city under bare crater floor, Moebius line art --ar 21:9",
          "captions": [
            {
              "text": "The past is not lost. It simply stepped behind the mirror.",
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
          "cameraAngle": "medium",
          "eyeVector": "Elian Kneeling -> Reflection of His Younger Self",
          "artBrief": "Elian kneels at the pool edge. In the water, his reflection is a young boy staring up with wide, hopeful eyes.",
          "generationPrompt": "Old pilgrim kneeling beside liquid mirror seeing his young child self smiling back, deeply touching, Jean Giraud style --ar 16:9",
          "captions": [],
          "balloons": [
            {
              "speaker": "MASTER ELIAN",
              "text": "We made it, little one. The map was true.",
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
      "pageNumber": 15,
      "title": "The Gift of the Sands",
      "act": "Act III: The Silent Crater",
      "sequenceBeat": "The Surrender of Measurement",
      "layoutGrammar": "3-Panel Poetic Release",
      "panels": [
        {
          "panelNumber": 1,
          "geometry": "standard-rect",
          "flex": 4,
          "cameraAngle": "close-up",
          "eyeVector": "Elian Unclasping Leather Belt -> Brass Astrolabe",
          "artBrief": "Elian unbuckles his guild master’s navigational belt, holding the beloved brass astrolabe in both hands.",
          "generationPrompt": "Close up hands releasing antique brass navigation instrument, soft pastel watercolor, clean linework --ar 1:1",
          "captions": [],
          "balloons": []
        },
        {
          "panelNumber": 2,
          "geometry": "standard-rect",
          "flex": 4,
          "cameraAngle": "medium",
          "eyeVector": "Astrolabe Resting on Sand -> Gilded Sand Covering Rings",
          "artBrief": "The brass sphere rests gently in the turquoise sand. Tiny grain particles drift across its rings, locking them in permanent peaceful rest.",
          "generationPrompt": "Intricate brass astrolabe half-buried in turquoise sand, wildflowers blooming around it, quiet poetic beauty --ar 1:1",
          "captions": [
            {
              "text": "The last map is finished. Because the destination is here.",
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
          "cameraAngle": "medium",
          "eyeVector": "Elian Standing Straight -> Robes Catching Breeze",
          "artBrief": "Elian stands tall, unburdened, his face radiant with quiet joy, breathing the cool still air of the crater.",
          "generationPrompt": "Serene elderly pilgrim standing peaceful and free in vast alien crater, warm smile, Moebius masterwork --ar 1:1",
          "captions": [],
          "balloons": []
        }
      ]
    },
    {
      "pageNumber": 16,
      "title": "The Eternal Horizon",
      "act": "Act III: The Silent Crater",
      "sequenceBeat": "Masterpiece Final Silent Spread",
      "layoutGrammar": "Full Page Panoramic French BD Splash",
      "panels": [
        {
          "panelNumber": 1,
          "geometry": "open-bleed",
          "flex": 12,
          "cameraAngle": "extreme-wide",
          "eyeVector": "Center Elian & Pteron Silhouette -> Three Rising Sister Moons -> Infinite Turquoise Wastes",
          "artBrief": "Breathtaking final panoramic spread: Master Elian and Pteron standing peacefully side by side at the center of the silent crater. Above them, three ringed moons rise into a soft violet-lemon sky. Complete silence and eternal beauty.",
          "generationPrompt": "Masterpiece final splash page by Moebius, Jean Giraud style, solitary pilgrim and tall feathered saurian standing peaceful on vast turquoise salt flats, three gigantic ringed moons in sky, exquisite delicate 1.5px lines, transcendent Franco-Belgian comic art --ar 21:9",
          "captions": [
            {
              "text": "THE VOYAGE DOES NOT CONCLUDE.\nIT SIMPLY CEASES TO COUNT THE STEPS.\n\nEND OF VOYAGE TO THE SILENT CRATER.",
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
    "Shift the setting to a submerged oceanic shelf explored by a lone marine archivist.",
    "Replace the saurian with a vintage mechanical ornithopter with canvas wings.",
    "Set in a post-human Alpine valley where mechanical shepherds tend stone obelisks."
  ],
  "councilDirectorNotes": "Ligne Claire requires absolute discipline of line and generous negative space. Do not rush the page. Allow the reader’s eye to wander across the dunes and breathe in the stillness."
};
