// Council builds for the Lorea exhibits. scripts/council/runLoreaExhibitCouncil.ts writes
// docs/lorea/council/<id>.json; scripts/council/applyLoreaExhibitCouncil.ts regenerates
// LOREA_COUNCIL_BUILDS below from those. A council build wins over the hand-authored materials,
// title line and credit; rooms and stations stay authored so nothing playable breaks.
import type { ExhibitMaterials, LoreaExhibit, LoreaExhibitId, ExhibitCouncilCredit } from '../../services/loreaExhibits/loreaExhibitTypes';

export interface LoreaCouncilBuild {
  id: LoreaExhibitId;
  tagline?: string;
  epigraph?: { text: string; cite: string };
  materials?: Partial<ExhibitMaterials>;
  council: ExhibitCouncilCredit;
  /** extra nuggets the Writers Council proposed */
  nuggets?: LoreaExhibit['nuggets'];
}

// @generated-start — applyLoreaExhibitCouncil.ts replaces this block
export const LOREA_COUNCIL_BUILDS: LoreaCouncilBuild[] = [
  {
    "id": "character",
    "tagline": "Everyone in a story wants something. The good ones want the wrong thing first.",
    "epigraph": {
      "text": "I am no bird; and no net ensnares me: I am a free human being with an independent will.",
      "cite": "Charlotte Brontë, Jane Eyre (1847)"
    },
    "materials": {
      "paper": "rag",
      "ink": "iron-gall",
      "hand": "type",
      "motif": "mask"
    },
    "council": {
      "source": "council",
      "art": {
        "lead": "CLASSICAL",
        "counterpoint": "REBEL",
        "note": "The council chose a rigid 1:1.618 structure with the mask as negative space, preserving ragged iron-gall pressure in a single 4-second settle."
      },
      "writers": {
        "note": "Iron-gall mask: a 1:1.618 settle that lets the face breathe before the want cracks."
      }
    },
    "nuggets": [
      {
        "id": "character-wc-1",
        "exhibitId": "character",
        "roomId": "want",
        "hook": "A cup cracks at the exact moment it becomes honest.",
        "body": "Want is not the same as need; the crack is where the character stops performing.",
        "depths": [
          "early",
          "elementary",
          "middle",
          "high",
          "university"
        ]
      },
      {
        "id": "character-wc-2",
        "exhibitId": "character",
        "roomId": "shape",
        "hook": "A flat face can be a door if it refuses to turn.",
        "body": "Roundness isn't realism; it's the reader's invitation to follow a choice.",
        "depths": [
          "elementary",
          "middle",
          "high",
          "university"
        ]
      },
      {
        "id": "character-wc-3",
        "exhibitId": "character",
        "roomId": "reveal",
        "hook": "Tell the wound once, then show the hand that hides it.",
        "body": "Voice leaves fingerprints: diction, rhythm, and what the character won't say.",
        "depths": [
          "middle",
          "high",
          "university"
        ]
      },
      {
        "id": "character-wc-4",
        "exhibitId": "character",
        "roomId": "masks",
        "hook": "Every mask is a costume, but one is the face underneath.",
        "body": "Name the mask first, then ask what it protects; the trickster, the monster, and the saint all borrow it.",
        "depths": [
          "early",
          "elementary",
          "middle",
          "high",
          "university"
        ]
      }
    ]
  },
  {
    "id": "grammar",
    "tagline": "Not a rulebook. A machine for meaning, and you already know how to run it.",
    "epigraph": {
      "text": "'When I use a word,' Humpty Dumpty said, in rather a scornful tone, 'it means just what I choose it to mean—neither more nor less.'",
      "cite": "Lewis Carroll, Through the Looking-Glass (1871)"
    },
    "materials": {
      "paper": "rag",
      "ink": "iron-gall",
      "wash": [
        "#F2ECDF",
        "#C9B89B"
      ],
      "hand": "script"
    },
    "council": {
      "source": "council",
      "art": {
        "lead": "CLASSICAL",
        "counterpoint": "REBEL",
        "note": "The council decided to keep the strict grid and iron-gall marginalia, using capillary feathering to make the hand feel pressed into the paper."
      },
      "writers": {
        "note": "The voice is iron-gall and capillary: precise, handmade, and argumentative, entering through the reader's own grammar instincts."
      }
    },
    "nuggets": [
      {
        "id": "grammar-wc-1",
        "exhibitId": "grammar",
        "roomId": "workshop",
        "hook": "One verb can turn a list into a sentence.",
        "body": "Nouns, verbs, and adjectives are not labels; they are workers. Put the verb in charge and the sentence gets a direction.",
        "depths": [
          "early",
          "elementary"
        ]
      },
      {
        "id": "grammar-wc-2",
        "exhibitId": "grammar",
        "roomId": "logic",
        "hook": "Rules are bridges, not fences.",
        "body": "Grammar rules keep clauses from colliding. When two ideas snap together, the reader knows who is doing what to whom.",
        "depths": [
          "middle",
          "high"
        ]
      },
      {
        "id": "grammar-wc-3",
        "exhibitId": "grammar",
        "roomId": "machine",
        "hook": "A dash can make a sentence hold its breath.",
        "body": "Punctuation is the traffic control of the page. A dash can pause, a comma can turn, and a semicolon can wait politely for the next thought.",
        "depths": [
          "elementary",
          "middle"
        ]
      },
      {
        "id": "grammar-wc-4",
        "exhibitId": "grammar",
        "roomId": "trial",
        "hook": "Can a rule be guilty if everyone already breaks it?",
        "body": "Descriptive grammar records what speakers already do. Prescriptive grammar asks what speakers should do, and the courtroom is where the two meet.",
        "depths": [
          "high",
          "university"
        ]
      }
    ]
  },
  {
    "id": "journalism",
    "tagline": "A true thing, torn and re-set in a strict grid, dries into words a stranger can trust by night.",
    "epigraph": {
      "text": "The report of my death was an exaggeration.",
      "cite": "Mark Twain, to the New York Journal, 1897"
    },
    "materials": {
      "paper": "rag",
      "ink": "iron-gall",
      "accent": "#c8102e",
      "hand": "script"
    },
    "council": {
      "source": "council",
      "art": {
        "lead": "CLASSICAL",
        "counterpoint": "REBEL",
        "note": "The council chose to keep the Rebel's fibrous tears and editing scars inside a strict 1:1.618 grid, replacing hand-pasted chaos with a procedural 60 BPM iron-gall settle and a single #c8102e wet edge."
      },
      "writers": {
        "note": "The council's voice is a 60 BPM newsroom clock: exact, ink-stained, and honest enough to earn a stranger's trust."
      }
    },
    "nuggets": [
      {
        "id": "journalism-wc-1",
        "exhibitId": "journalism",
        "roomId": "newsroom",
        "hook": "A fact is only news after it survives six questions.",
        "body": "Before the ink settles, every claim asks who, what, when, where, why, and how. The answers become the story's spine.",
        "depths": [
          "early",
          "elementary"
        ]
      },
      {
        "id": "journalism-wc-2",
        "exhibitId": "journalism",
        "roomId": "lede",
        "hook": "Forty words decide whether a stranger keeps reading.",
        "body": "The first sentence must carry the biggest fact, the clearest name, and the least waste. If it wobbles, the rest of the page feels suspicious.",
        "depths": [
          "early",
          "elementary",
          "middle"
        ]
      },
      {
        "id": "journalism-wc-3",
        "exhibitId": "journalism",
        "roomId": "pyramid",
        "hook": "The most important fact gets the shortest room.",
        "body": "The upside-down pyramid puts the core event at the top and the context below. A reader can stop at any line and still trust the shape.",
        "depths": [
          "elementary",
          "middle"
        ]
      },
      {
        "id": "journalism-wc-4",
        "exhibitId": "journalism",
        "roomId": "presses",
        "hook": "Old ink, new power: newspapers can change a nation.",
        "body": "From hand-presses to muckrakers, the press became a machine for checking power. Its speed made it dangerous, and its errors made it human.",
        "depths": [
          "middle",
          "high",
          "university"
        ]
      }
    ]
  },
  {
    "id": "plot",
    "tagline": "Plot is not what happens. It is why the next thing must.",
    "epigraph": {
      "text": "It was the best of times, it was the worst of times.",
      "cite": "Charles Dickens, A Tale of Two Cities (1859)"
    },
    "materials": {
      "paper": "rag",
      "ink": "indigo",
      "accent": "#1b2a5e",
      "hand": "type"
    },
    "council": {
      "source": "council",
      "art": {
        "lead": "RADICAL_MINIMAL",
        "counterpoint": "BAROQUE",
        "note": "The council approved a single indigo knot on unbleached rag cotton with an equal four-second silence, rejecting additional color or decoration."
      },
      "writers": {
        "note": "One indigo knot and a four-second pause: the room follows cause, not spectacle."
      }
    },
    "nuggets": [
      {
        "id": "plot-wc-1",
        "exhibitId": "plot",
        "roomId": "knot",
        "hook": "A knot can hide a whole story in one pull.",
        "body": "Pull one thread and the whole pattern tightens. A plot begins when something has to follow.",
        "depths": [
          "early",
          "elementary",
          "middle"
        ]
      },
      {
        "id": "plot-wc-2",
        "exhibitId": "plot",
        "roomId": "because",
        "hook": "The queen died of a broken heart. The king died of the why.",
        "body": "A plot is a chain of causes, not a line of events. The word because turns a sequence into a story.",
        "depths": [
          "elementary",
          "middle",
          "high"
        ]
      },
      {
        "id": "plot-wc-3",
        "exhibitId": "plot",
        "roomId": "shapes",
        "hook": "A story can start at the top of the mountain.",
        "body": "Some plots begin after the climb, on the long way down. The shape decides what the struggle means.",
        "depths": [
          "middle",
          "high",
          "university"
        ]
      },
      {
        "id": "plot-wc-4",
        "exhibitId": "plot",
        "roomId": "clues",
        "hook": "Four seconds of silence can hold the whole twist.",
        "body": "Before the reveal, the room waits. A twist is a promise kept in the first lines.",
        "depths": [
          "elementary",
          "middle",
          "high"
        ]
      }
    ]
  },
  {
    "id": "poetry",
    "tagline": "A poem is language under pressure. Let a few words settle like indigo ink.",
    "epigraph": {
      "text": "Hope is the thing with feathers / That perches in the soul",
      "cite": "Emily Dickinson (1891)"
    },
    "materials": {
      "paper": "rag",
      "ink": "indigo",
      "hand": "script"
    },
    "council": {
      "source": "council",
      "art": {
        "lead": "WORLD_ECLECTIC",
        "counterpoint": "REBEL",
        "note": "The council decided the page should behave like a field notebook, with indigo ink settling for four seconds on rag and leaving a human trace rather than a responsive system."
      },
      "writers": {
        "note": "Field-notebook voice: indigo ink settles on rag, asking the reader to trace how pressure turns words into a poem."
      }
    },
    "nuggets": [
      {
        "id": "poetry-wc-1",
        "exhibitId": "poetry",
        "roomId": "image",
        "hook": "A poem can make you smell rain without naming it.",
        "body": "Look for the concrete noun doing the work: a leaf, a window, a stone. It can carry more than an adjective.",
        "depths": [
          "elementary",
          "middle"
        ]
      },
      {
        "id": "poetry-wc-2",
        "exhibitId": "poetry",
        "roomId": "line",
        "hook": "Break the line at the hinge and the poem turns.",
        "body": "Line breaks decide when the reader pauses, so the same words can mean two different things. Try moving the break to the hinge.",
        "depths": [
          "middle",
          "high"
        ]
      },
      {
        "id": "poetry-wc-3",
        "exhibitId": "poetry",
        "roomId": "sound",
        "hook": "Some words hum because their consonants knock.",
        "body": "Say the line aloud and listen for hard stops, hisses, and repeating vowels. Sound can make meaning land before the brain catches up.",
        "depths": [
          "elementary",
          "middle",
          "high"
        ]
      },
      {
        "id": "poetry-wc-4",
        "exhibitId": "poetry",
        "roomId": "forms",
        "hook": "A sonnet can argue, confess, and turn in 14 lines.",
        "body": "Form is a constraint that gives the poem a shape to push against. Find the turn - the place where the argument changes.",
        "depths": [
          "high",
          "university"
        ]
      }
    ]
  },
  {
    "id": "prose",
    "tagline": "Every story you love is made of sentences. Come see how they are built, tuned and set loose.",
    "epigraph": {
      "text": "It was the best of times, it was the worst of times…",
      "cite": "Charles Dickens, A Tale of Two Cities (1859)"
    },
    "materials": {
      "paper": "rag",
      "ink": "iron-gall",
      "accent": "#7a2e20",
      "hand": "type",
      "motif": "quill"
    },
    "council": {
      "source": "council",
      "art": {
        "lead": "BAROQUE",
        "counterpoint": "REBEL",
        "note": "The council decided to keep the Baroque structural grid and iron-gall settle while allowing visible capillary feathering as the only imperfection."
      },
      "writers": {
        "note": "We kept the grid but let the ink bleed where the reader breathes; the workshop is a place of controlled imperfection."
      }
    },
    "nuggets": [
      {
        "id": "prose-wc-1",
        "exhibitId": "prose",
        "roomId": "sentence",
        "hook": "A sentence with no subject is like a house with no door.",
        "body": "Sometimes the who is hidden, but the action still happens. Try writing a sentence where the person is the secret.",
        "depths": [
          "early",
          "elementary"
        ]
      },
      {
        "id": "prose-wc-2",
        "exhibitId": "prose",
        "roomId": "voice",
        "hook": "Can you hear the grumpy cat in this paragraph?",
        "body": "Voice is the personality behind the words. Swap one word and watch the character change from shy to sassy.",
        "depths": [
          "elementary",
          "middle"
        ]
      },
      {
        "id": "prose-wc-3",
        "exhibitId": "prose",
        "roomId": "lantern",
        "hook": "Don’t tell me the moon is bright. Show me the silver dust.",
        "body": "Telling is a summary; showing is a photograph. Your job is to let the reader see the dust before they read the word bright.",
        "depths": [
          "middle",
          "high"
        ]
      },
      {
        "id": "prose-wc-4",
        "exhibitId": "prose",
        "roomId": "music",
        "hook": "Short sentences hit hard. Long sentences flow like a river.",
        "body": "Rhythm is the heartbeat of prose. Read this line aloud and feel where your breath wants to pause.",
        "depths": [
          "high",
          "university"
        ]
      }
    ]
  },
  {
    "id": "rhythm",
    "tagline": "Every sentence has a heartbeat. Tap it, hear it, let it rest.",
    "epigraph": {
      "text": "'Tis not enough no harshness gives offence, / The sound must seem an echo to the sense.",
      "cite": "Alexander Pope, An Essay on Criticism (1711)"
    },
    "materials": {
      "paper": "cotton",
      "ink": "iron-gall",
      "wash": [
        "#F4EFE6",
        "#E7DCCB"
      ],
      "accent": "#C2492F",
      "hand": "script",
      "motif": "metronome"
    },
    "council": {
      "source": "council",
      "art": {
        "lead": "WORLD_ECLECTIC",
        "counterpoint": "RADICAL_MINIMAL",
        "note": "The council decided to keep the exhibit a static, tactile artifact with a breathing asymmetric grid, using negative space as rhythmic rest and wet-ink script for the primary handmade feel."
      },
      "writers": {
        "note": "Wet-ink whispers and open rests that let the reader tap, step, and breathe with the line."
      }
    },
    "nuggets": [
      {
        "id": "rhythm-wc-1",
        "exhibitId": "rhythm",
        "roomId": "heartbeat",
        "hook": "A line can whisper, shout, or skip a beat.",
        "body": "Tap along with the strong syllables. When the pattern breaks, your ear knows before your mind does.",
        "depths": [
          "early",
          "elementary"
        ]
      },
      {
        "id": "rhythm-wc-2",
        "exhibitId": "rhythm",
        "roomId": "feet",
        "hook": "Your feet know the rhythm before your eyes do.",
        "body": "Marches, waltzes, and gallops hide in stressed syllables. Try walking a line of verse to feel its speed.",
        "depths": [
          "elementary",
          "middle"
        ]
      },
      {
        "id": "rhythm-wc-3",
        "exhibitId": "rhythm",
        "roomId": "chimes",
        "hook": "Some words chime even when they don't rhyme.",
        "body": "Repeated vowels and consonants make a line hum. Listen for echoes that are not rhymes.",
        "depths": [
          "middle",
          "high"
        ]
      },
      {
        "id": "rhythm-wc-4",
        "exhibitId": "rhythm",
        "roomId": "pulse",
        "hook": "A sentence can hold its breath for one page.",
        "body": "Long clauses stretch the pulse; short ones land like drums. Slow a line down to hear its hidden tempo.",
        "depths": [
          "high",
          "university"
        ]
      }
    ]
  },
  {
    "id": "story",
    "tagline": "Somebody wants, something resists, and we lean closer to hear what happens.",
    "epigraph": {
      "text": "Marley was dead: to begin with. There is no doubt whatever about that.",
      "cite": "Charles Dickens, A Christmas Carol, 1843"
    },
    "materials": {
      "paper": "cotton",
      "ink": "iron-gall",
      "wash": [
        "#f2c879",
        "#a9cdbf"
      ],
      "accent": "#c8102e",
      "hand": "script"
    },
    "council": {
      "source": "council",
      "art": {
        "lead": "REBEL",
        "counterpoint": "CLASSICAL",
        "note": "The council balanced the tactile urgency of the Rebellious Hand with the rhythmic stability of the Classical Mind by adopting a non-uniform grid on cotton rag with iron-gall ink, using a metronome motif to ensure the 4-second settle timing provides structural breath amidst the visual chaos."
      },
      "writers": {
        "note": "The voice is a circle of listeners: plain, warm, and slightly conspiratorial, inviting every age to lean in."
      }
    },
    "nuggets": [
      {
        "id": "story-wc-1",
        "exhibitId": "story",
        "roomId": "fire",
        "hook": "The first line is a door, not a map.",
        "body": "It can open straight into a voice, a place, or a strange detail. Once it clicks, the room changes and the story starts breathing.",
        "depths": [
          "early",
          "elementary",
          "middle"
        ]
      },
      {
        "id": "story-wc-2",
        "exhibitId": "story",
        "roomId": "eyes",
        "hook": "Turn the lantern: whose shadow is on the wall?",
        "body": "A narrator chooses what we see first and what stays dark. Ask what the teller wants us to believe, and what they cannot stop repeating.",
        "depths": [
          "elementary",
          "middle",
          "high"
        ]
      },
      {
        "id": "story-wc-3",
        "exhibitId": "story",
        "roomId": "worlds",
        "hook": "A world can be a kitchen table or a whole planet.",
        "body": "Where and when matter because they set the rules, the smells, and the stakes. Let the details do the work before the plot rushes in.",
        "depths": [
          "elementary",
          "middle"
        ]
      },
      {
        "id": "story-wc-4",
        "exhibitId": "story",
        "roomId": "shapes",
        "hook": "Stories can wear stories like rings in a tree.",
        "body": "A frame tale opens a smaller tale inside, then closes it with a breath. Unpack the layers and you can hear the oldest voice at the center.",
        "depths": [
          "middle",
          "high",
          "university"
        ]
      }
    ]
  }
];
// @generated-end

export function applyLoreaCouncilBuilds(list: LoreaExhibit[]): LoreaExhibit[] {
  return list.map(ex => {
    const b = LOREA_COUNCIL_BUILDS.find(x => x.id === ex.id);
    if (!b) return ex;
    return {
      ...ex,
      tagline: b.tagline || ex.tagline,
      epigraph: b.epigraph || ex.epigraph,
      materials: { ...ex.materials, ...(b.materials || {}) },
      council: b.council,
      nuggets: [...ex.nuggets, ...(b.nuggets || [])
        .filter(n => !ex.nuggets.some(o => o.id === n.id))
        .map(n => (n.roomId && !ex.rooms.some(r => r.id === n.roomId) ? { ...n, roomId: undefined } : n))],
    };
  });
}
