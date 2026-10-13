/**
 * Story-Adaptive Council Engine (Plajah / Tela / Story Intelligence)
 * 
 * Dynamically synthesizes a bespoke Council of Writers, Art Directors, and
 * Sequential Layout Masters tailored specifically to the detected Genre,
 * Vibe, Tone, and Thematic Core of any movie or story project.
 */

import { COMIC_MANGA_COUNCIL, type ComicCouncilId, type ComicCouncilMember } from './comicMangaCouncil';

export interface StoryDossierInput {
  title: string;
  genres: string[];
  tones: string[];
  themes: string[];
  logline?: string;
  setting?: string;
  timePeriod?: string;
  visualWorld?: string;
}

export interface AdaptiveDesignGrammar {
  colorPalette: {
    background: string;
    gutter: string;
    panelBorder: string;
    keyAccent: string;
    secondaryAccent: string;
    captionBg: string;
    captionText: string;
    balloonBg: string;
    balloonText: string;
  };
  gutterSpec: {
    widthPx: number;
    color: string;
    style: 'SOLID' | 'SLANTED' | 'BORDERLESS_BLEED' | 'DOUBLE_RULE';
    atmosphere: string;
  };
  panelLayoutArchetypes: Array<{
    name: string;
    structure: string;
    purpose: string;
    exampleScene: string;
  }>;
  balloonGrammar: {
    shape: 'ROUNDED_OVAL' | 'SHARP_RECTANGLE' | 'ORGANIC_CLOUD' | 'JAGGED_BURST' | 'TECHNO_HEXAGONAL';
    tailPhysics: string;
    maxWordsPerBalloon: number;
    fontFamily: string;
    fontStyle: string;
  };
  sfxGrammar: {
    typography: string;
    perspectiveIntegration: boolean;
    colorTreatment: string;
    soundPalette: string[];
  };
}

export interface AssembledStoryCouncil {
  projectTitle: string;
  detectedDossier: StoryDossierInput;
  leadArtDirector: {
    title: string;
    historicalStyleEra: string;
    mandate: string;
    visualRules: string[];
  };
  coArtDirector: {
    title: string;
    layoutChoreography: string;
    panelRules: string[];
  };
  leadWriter: {
    title: string;
    dialogueCadence: string;
    scriptRules: string[];
  };
  letteringMaster: {
    title: string;
    balloonAndSfxMandate: string;
  };
  designGrammar: AdaptiveDesignGrammar;
  councilDebateExcerpt: {
    artDirectorStance: string;
    writerStance: string;
    synthesisVerdict: string;
  };
}

/**
 * Main Story-Adaptive Council Assembler
 * Analyzes the film's genre, tone, and themes to build a completely bespoke creative board.
 */
export function assembleStoryCouncil(dossier: StoryDossierInput): AssembledStoryCouncil {
  const genresUpper = dossier.genres.map(g => g.toUpperCase());
  const tonesUpper = dossier.tones.map(t => t.toUpperCase());
  const themesUpper = dossier.themes.map(t => t.toUpperCase());

  const isSciFiOrAction = genresUpper.some(g => g.includes('SCI-FI') || g.includes('ACTION') || g.includes('CYBER') || g.includes('FANTASY'));
  const isGospelOrFaith = genresUpper.some(g => g.includes('GOSPEL') || g.includes('FAITH') || g.includes('RELIGIOUS') || g.includes('MUSICAL') || g.includes('DRAMA')) ||
                          themesUpper.some(t => t.includes('FAITH') || t.includes('REDEMPTION') || t.includes('SPIRITUAL'));
  const isNoirOrGritty = tonesUpper.some(t => t.includes('GRITTY') || t.includes('NOIR') || t.includes('DARK') || t.includes('VIOLENT') || t.includes('CYNICAL'));
  const isEmotionalOrWarm = tonesUpper.some(t => t.includes('EMOTIONAL') || t.includes('WARM') || t.includes('INSPIRATIONAL') || t.includes('SENTIMENTAL'));

  // ── BRANCH A: DYSTOPIAN SCI-FI / DARK ACTION (e.g. Pumpkin Patch) ──────────
  if (isSciFiOrAction && isNoirOrGritty) {
    return {
      projectTitle: dossier.title,
      detectedDossier: dossier,
      leadArtDirector: {
        title: "The Cyber-Gothic Noir Carver (Frank Miller & Mike Mignola Lens)",
        historicalStyleEra: "1980s Dark Age Graphic Novel & Industrial Brutalism",
        mandate: "Heavy spotting blacks. Carve figures out of pure shadows. The world must feel choked with smog, scorched steel, and radioactive orange neon.",
        visualRules: [
          "Minimum 45% black ink fill per page; let shadows swallow secondary details.",
          "High-contrast chiaroscuro: Only illumination sources (muzzle flashes, neon visor, flaming chain) reveal anatomy.",
          "Single vivid key accent color (#F97316 Pumpkin Flame) over deep obsidian (#04060A) and toxic green (#10B981)."
        ]
      },
      coArtDirector: {
        title: "The Seinen Kineticist (Katsuhiro Otomo & Tsutomu Nihei Lens)",
        layoutChoreography: "Breakneck momentum and massive industrial scale. Three-point forced perspective for ballistic firefights, diving escape pods, and crumbling mega-cathedrals.",
        panelRules: [
          "Use diagonal 15-degree slanted gutters during vehicle crashes and chain strikes.",
          "Deconstruct heavy impacts into 3 rapid micro-beat panels before the full-width splash frame.",
          "Zero empty whitespace in borders; gutters must be pitch black (#000000) to maintain claustrophobia."
        ]
      },
      leadWriter: {
        title: "The Hardboiled Dystopian Scenarist (John Carpenter & Garth Ennis Lens)",
        dialogueCadence: "Clipped, cynical, punchy, and rhythmically dry. Characters speak in survival tactics, deadpan threats, and radio jargon.",
        scriptRules: [
          "Internal monologue in dark gunmetal rectangular caption cards at reading entrance/exit.",
          "Spoken dialogue is brief—maximum 15-20 words per balloon. Never lecture during an active firefight.",
          "Radio and comm transmissions rendered in green phosphor techno-boxes with dashed borders."
        ]
      },
      letteringMaster: {
        title: "The Industrial Impact Letterer",
        balloonAndSfxMandate: "Sound effects are heavy physical artillery. Lettering (THOOM, BLAM, KATZUMMM) must angle along the physical trajectory of the bullet or chain, layered behind foreground character silhouettes."
      },
      designGrammar: {
        colorPalette: {
          background: "#04060a",
          gutter: "#000000",
          panelBorder: "#1f293d",
          keyAccent: "#f97316",
          secondaryAccent: "#10b981",
          captionBg: "#18181b",
          captionText: "#f4f4f5",
          balloonBg: "#ffffff",
          balloonText: "#090d16"
        },
        gutterSpec: {
          widthPx: 12,
          color: "#000000",
          style: "SLANTED",
          atmosphere: "Choking industrial void, oppressive claustrophobia"
        },
        panelLayoutArchetypes: [
          { name: "The Anamorphic Stratosphere", structure: "21:9 Widescreen Letterbox", purpose: "Establish desolate scale of Planet Ween", exampleScene: "Transport gliding over violet smog" },
          { name: "The Kinetic Chain Slash", structure: "3-Tier Diagonal Cascade", purpose: "Convey supersonic melee speed", exampleScene: "Jack whipping the meteor-chain through raiders" },
          { name: "The Industrial Breakout", structure: "Splash with Element Breaking Border", purpose: "Visceral impact shockwave", exampleScene: "Escape pod slamming into District 13 rubble" }
        ],
        balloonGrammar: {
          shape: "SHARP_RECTANGLE",
          tailPhysics: "Rigid 45-degree angled directional tails pointing to armor helmets/cockpits",
          maxWordsPerBalloon: 20,
          fontFamily: "'Space Grotesk', system-ui, sans-serif",
          fontStyle: "700 Bold, Condensed"
        },
        sfxGrammar: {
          typography: "'Impact', 'Arial Black', sans-serif",
          perspectiveIntegration: true,
          colorTreatment: "Fiery orange fill with thick 2.5px black outline and radial motion blur",
          soundPalette: ["THOOM!", "KATZUMMM!", "SKRRREEEE!", "BLAM!", "CHK-CHK!"]
        }
      },
      councilDebateExcerpt: {
        artDirectorStance: "Noir Carver: 'If the reader can see the background clearly, it's not District 13. Drown the gutters in ink and let the orange fire carve out Jack's jawline.'",
        writerStance: "Dystopian Scenarist: 'Keep Jack's lines under eight words. In this world, anyone who talks too much gets a slug in the chest.'",
        synthesisVerdict: "The council unanimously mandates high-contrast chiaroscuro, black gutters, and kinetic asymmetric paneling."
      }
    };
  }

  // ── BRANCH B: FAITH-BASED GOSPEL MUSICAL / REDEMPTION DRAMA (e.g. Hosanna) ──
  if (isGospelOrFaith || isEmotionalOrWarm) {
    return {
      projectTitle: dossier.title,
      detectedDossier: dossier,
      leadArtDirector: {
        title: "The Luminous Sacred Colorist (Bradford Young & Barry Jenkins Cinematic Lens)",
        historicalStyleEra: "Byzantine Luminous & Modern Emotional Realism",
        mandate: "Golden halation, warm tungsten pools, and deep stained-glass primaries. The frame must feel reverent, vulnerable, and spiritually resonant.",
        visualRules: [
          "Rich warm chiaroscuro: Tungsten amber (#D97706) meeting deep sanctuary mahogany (#3B1D11) and sapphire (#1D4E89).",
          "Soft, breathing gutters: Use generous 16px warm-tinted charcoal (#0F1117) gutters to give emotional moments room to breathe.",
          "Delicate rim lighting on tear tracks, collars, and ivory piano keys."
        ]
      },
      coArtDirector: {
        title: "The Humanist Dramatic Sequentialist (Will Eisner & Alison Bechdel Lens)",
        layoutChoreography: "Intimate character-first pacing. Focus on expressive micro-gestures—trembling hands on a microphone, clasped hymnals, the subtle tilt of Pastor Marcus's head during prayer.",
        panelRules: [
          "Widescreen 16:9 two-shots for moments of mentorship and communion at the piano.",
          "Circular or soft-rounded insets focusing on intimate tactile objects (the 'GOD IS' shirt collar, the cracked family hymnal).",
          "Gentle horizontal letterbox tiers that slow the reading cadence, matching the tempo of a gospel ballad."
        ]
      },
      leadWriter: {
        title: "The Gospel Stage Playwright (August Wilson & Kirk Franklin Lens)",
        dialogueCadence: "Soul-stirring, rhythmic, emotionally raw, and grounded in authentic Black church vernacular. Spoken dialogue carries theological weight without feeling stilted.",
        scriptRules: [
          "Lyrical musical notation: Spoken prayers and gospel belting are distinguished by italicized warm gold banners.",
          "Stacked conversational balloons that capture natural breath cadences and vocal runs.",
          "Reverent, contemplative captions that function like pastoral reflections."
        ]
      },
      letteringMaster: {
        title: "The Calligraphic Soul Letterer",
        balloonAndSfxMandate: "Speech balloons must have soft, organic curves with delicate calligraphic tapering tails. Sound indicators are musical ripples, resonance halos, and gentle whispers (shiver... amen... chime...)."
      },
      designGrammar: {
        colorPalette: {
          background: "#090d16",
          gutter: "#0d131f",
          panelBorder: "#2a374f",
          keyAccent: "#f59e0b",
          secondaryAccent: "#059669",
          captionBg: "#fef3c7",
          captionText: "#78350f",
          balloonBg: "#ffffff",
          balloonText: "#111827"
        },
        gutterSpec: {
          widthPx: 16,
          color: "#0d131f",
          style: "DOUBLE_RULE",
          atmosphere: "Sacred cathedral quietude, generous contemplative space"
        },
        panelLayoutArchetypes: [
          { name: "The Altar Solitude", structure: "Full-Width Cathedral Panoramic", purpose: "Convey the grandeur of the sanctuary vs. the fragile broken worshipper", exampleScene: "Pastor Marcus at the oak pulpit under stained glass" },
          { name: "The Audition Trial", structure: "3-Tier Horizontal Escalation", purpose: "Capture fear turning into transcendent vocal release", exampleScene: "Elder Lavonia looking over glasses -> Hosanna belting a cappella" },
          { name: "The Midnight Communion", structure: "Intimate Dual Splash with Golden Halo", purpose: "Emotional climax of spiritual restoration", exampleScene: "Marcus and Hosanna singing duet at the grand piano" }
        ],
        balloonGrammar: {
          shape: "ROUNDED_OVAL",
          tailPhysics: "Graceful, organic curved tapering tails aiming softly at character lips",
          maxWordsPerBalloon: 25,
          fontFamily: "'Comic Neue', 'Georgia', serif",
          fontStyle: "600 Semi-Bold, Humanist"
        },
        sfxGrammar: {
          typography: "'Cinzel', 'Georgia', italic serif",
          perspectiveIntegration: false,
          colorTreatment: "Luminous gold aura with soft translucent drop blur",
          soundPalette: ["*whisper*", "*shiver...*", "*chime*", "*resonate*", "*amen...*"]
        }
      },
      councilDebateExcerpt: {
        artDirectorStance: "Sacred Colorist: 'This is not a comic book about violence; it is a story of deliverance. The panels must hold the light the way church windows hold the sunset.'",
        writerStance: "Gospel Playwright: 'When Hosanna sings, don't write generic music notes. Put the weight of every tear she swallowed into the lyric banner.'",
        synthesisVerdict: "The council mandates breathing gutters, rich warm amber chiaroscuro, and lyrical, musical typography."
      }
    };
  }

  // ── BRANCH C: GENERAL PURPOSE / AUTEUR HYBRID FALLBACK ────────────────────
  return {
    projectTitle: dossier.title,
    detectedDossier: dossier,
    leadArtDirector: {
      title: "The Modern Cinematic Sequentialist",
      historicalStyleEra: "Contemporary Prestige Graphic Novel",
      mandate: "Cinematic letterbox pacing, balanced atmospheric lighting, and high-fidelity panel hierarchies.",
      visualRules: ["Balanced 3-tier grid", "Neutral dark slate palette", "Clean conversational framing"]
    },
    coArtDirector: {
      title: "The Dynamic Architect",
      layoutChoreography: "Structured rhythmic flow with clear Z-path reading grammar.",
      panelRules: ["Clear panel borders", "Prominent focal anchors"]
    },
    leadWriter: {
      title: "The Narrative Dramatist",
      dialogueCadence: "Naturalistic, filmic dialogue with crisp subtext.",
      scriptRules: ["Max 25 words per balloon", "Clear conversational turn-taking"]
    },
    letteringMaster: {
      title: "The Clean Standard Letterer",
      balloonAndSfxMandate: "Standard oval balloons with clear directional pointers."
    },
    designGrammar: {
      colorPalette: {
        background: "#0b0f17",
        gutter: "#05070a",
        panelBorder: "#1e293b",
        keyAccent: "#38bdf8",
        secondaryAccent: "#f59e0b",
        captionBg: "#fef08a",
        captionText: "#713f12",
        balloonBg: "#ffffff",
        balloonText: "#0f172a"
      },
      gutterSpec: {
        widthPx: 12,
        color: "#05070a",
        style: "SOLID",
        atmosphere: "Balanced contemporary cinematic neutral"
      },
      panelLayoutArchetypes: [
        { name: "Establishing Letterbox", structure: "16:9 Top Panel", purpose: "Establish scene location", exampleScene: "Opening exterior" }
      ],
      balloonGrammar: {
        shape: "ROUNDED_OVAL",
        tailPhysics: "Standard triangular directional tail",
        maxWordsPerBalloon: 25,
        fontFamily: "system-ui, sans-serif",
        fontStyle: "600 Semi-Bold"
      },
      sfxGrammar: {
        typography: "Impact, sans-serif",
        perspectiveIntegration: true,
        colorTreatment: "Contrasting bold fill",
        soundPalette: ["THUD", "CLICK", "RING"]
      }
    },
    councilDebateExcerpt: {
      artDirectorStance: "Cinematic Sequentialist: 'Maintain visual clarity and balanced anamorphic ratios.'",
      writerStance: "Narrative Dramatist: 'Prioritize character motivation and clean reading rhythm.'",
      synthesisVerdict: "The council approves a balanced contemporary graphic novel layout."
    }
  };
}
