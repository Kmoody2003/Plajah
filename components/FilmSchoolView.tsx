import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Film, BookOpen, Archive, Clock, ChevronRight, ArrowLeft, X,
  Check, ExternalLink, Sparkles, Clapperboard, Pen, Camera,
  Users, Star, Globe, Play,
} from 'lucide-react';

interface Props {
  onBack: () => void;
  user: any;
}

type Tab = 'MODULES' | 'SCRIPT_VAULT' | 'HISTORY';

// ── Module data ────────────────────────────────────────────────────────────────
interface ModuleSection { heading: string; body: string; callout?: string }
interface FilmModule {
  id: string;
  title: string;
  subtitle: string;
  emoji: string;
  duration: string;
  category: string;
  sections: ModuleSection[];
}

const FILM_MODULES: FilmModule[] = [
  {
    id: 'three-act',
    title: 'Three-Act Structure',
    subtitle: 'The blueprint every story follows',
    emoji: '📖',
    duration: '8 min',
    category: 'Story',
    sections: [
      {
        heading: 'Act One: The Setup',
        body: 'Act One establishes the world, the protagonist, and the problem. It ends at the First Plot Point — the moment the protagonist is thrust into a new situation with no way back. In Star Wars, Luke finds the message in R2-D2 and his aunt and uncle are killed — he has no reason to stay and every reason to leave. In The Wizard of Oz, Dorothy\'s house lands in Oz. In Jaws, the first shark attack occurs. This plot point should occur at roughly the 25% mark of the script.',
        callout: 'Key question: Who wants what, and what stands in their way?',
      },
      {
        heading: 'Act Two: Confrontation',
        body: 'The longest act — the middle 50% of the story. The protagonist pursues their goal but faces escalating obstacles. Halfway through Act Two is the Midpoint — a false peak or valley that changes the direction of the story. The Act Two break, at the 75% mark, is the lowest point: the Dark Night of the Soul. All seems lost. The protagonist must find a new, deeper motivation to push through.',
        callout: 'The Midpoint and the "All Is Lost" moment are the two engines of Act Two.',
      },
      {
        heading: 'Act Three: Resolution',
        body: 'Act Three is the final 25% — culmination and resolution. The protagonist, having changed internally, faces the final confrontation with fresh eyes and deeper resources. The climax answers the central dramatic question. The denouement — brief but essential — shows the world after the conflict is resolved. The audience must feel both surprise (it couldn\'t have gone any other way) and inevitability (of course it went that way).',
        callout: 'The ending re-contextualizes everything that came before it.',
      },
    ],
  },
  {
    id: 'screenplay-format',
    title: 'Screenplay Format',
    subtitle: 'The industry-standard page',
    emoji: '📄',
    duration: '10 min',
    category: 'Writing',
    sections: [
      {
        heading: 'Scene Headings (Sluglines)',
        body: 'Every scene begins with a slugline: INT. or EXT. (interior or exterior), the location, and the time (DAY or NIGHT). Example: INT. DETECTIVE\'S OFFICE - NIGHT. The slugline is always in ALL CAPS. It tells the reader where and when. Keep locations specific. "INT. NONDESCRIPT ROOM" gives the director nothing to work with. "INT. ABANDONED MEAT-PACKING PLANT - NIGHT" creates a world.',
        callout: 'Format: INT./EXT. LOCATION - TIME',
      },
      {
        heading: 'Action Lines',
        body: 'Action lines describe what the camera sees — present tense, active voice. "John ENTERS" not "John entered." "Rain pelts the windshield" not "It was raining." Write only what can be seen or heard; no internal states ("she wonders if he loves her"). Industry standard: Courier 12pt, one page = approximately one minute of screen time. Target 90–120 pages for a feature.',
        callout: 'Rule: If you can\'t see it or hear it, don\'t write it.',
      },
      {
        heading: 'Dialogue',
        body: 'Character names are in ALL CAPS, centered, above the dialogue. Dialogue is indented 2.5" from the left margin. A parenthetical (a brief action description) goes between the name and the dialogue — use sparingly. The test: could this dialogue come from only this character? If any other character could say the same line, rewrite it. Subtext is what the character means but doesn\'t say. The best screen dialogue is the iceberg — one-tenth on the surface.',
        callout: '"Good dialogue is people talking past each other." — Robert Towne',
      },
    ],
  },
  {
    id: 'character-development',
    title: 'Character Development',
    subtitle: 'Building people audiences believe in',
    emoji: '👤',
    duration: '12 min',
    category: 'Characters',
    sections: [
      {
        heading: 'The Want vs. The Need',
        body: 'Every compelling protagonist has two goals: what they want (the external, conscious goal) and what they need (the internal, unconscious transformation required). In The Wizard of Oz, Dorothy wants to get home. She needs to understand there\'s no place like home — that she already had what she was looking for. In Citizen Kane, Kane wants love. He needs to learn that he drove love away. The story is the protagonist discovering — or failing to discover — their need.',
        callout: 'The gap between want and need IS your story.',
      },
      {
        heading: 'The Wound & The Lie',
        body: 'Every character carries a wound from their past — a traumatic event or formative experience that has left them with a fundamental misbelief about the world or themselves. This "Lie" drives their behavior. Indiana Jones believes people are untrustworthy and relationships are burdens — he works alone. By Raiders\' end he must trust Marion. Katniss believes caring for others makes her vulnerable. By the end she must allow herself to be vulnerable. The wound shapes the character; the story heals — or fails to heal — it.',
      },
      {
        heading: 'Supporting Characters as Mirrors',
        body: 'Great supporting characters aren\'t just plot mechanics — they reflect different aspects of the protagonist\'s possibilities. The mentor shows who the protagonist could become. The shadow (antagonist) shows their dark potential. The love interest embodies the protagonist\'s need. The ally provides what the protagonist lacks. In The Godfather, Tom Hagen (reason without passion), Sonny (passion without reason), and Fredo (weakness) are all facets of Michael before he chooses his path.',
        callout: 'The antagonist believes they are the hero of their own story.',
      },
    ],
  },
  {
    id: 'directing',
    title: 'Directing for the Screen',
    subtitle: 'Translating words into images',
    emoji: '🎬',
    duration: '15 min',
    category: 'Direction',
    sections: [
      {
        heading: 'Shot Types & Their Language',
        body: 'Cinema communicates through the size and angle of the shot. An Extreme Wide Shot establishes geography and isolation — a single figure in a vast landscape. A Medium Shot is conversational — two people in dialogue. A Close-Up creates intimacy and reveals internal states. An Extreme Close-Up isolates a detail with symbolic weight — Hitchcock\'s close-up on the shower drain in Psycho. Every shot choice is a rhetorical choice about what the audience should feel and notice.',
        callout: 'The close-up is cinema\'s unique power — the theater cannot do this.',
      },
      {
        heading: 'Camera Movement',
        body: 'Movement carries meaning. A zoom in creates urgency or revelation; a zoom out creates isolation or irony. A dolly (the camera physically moves) creates psychological intimacy — the camera joins the character\'s space. Kubrick\'s symmetric, slow-zoom compositions create dread by their very geometric perfection. Cassavetes\'s handheld camera creates documentary immediacy. Scorsese\'s fluid tracking shots create exhilarating complicity with characters. The director\'s movement vocabulary is their style.',
        callout: 'Hitchcock\'s rule: Cut when the emotion changes.',
      },
      {
        heading: 'Working with Actors',
        body: 'The director\'s primary instrument is the actor\'s performance. The director must create safety — a set where an actor can try, fail, and try again without judgment. Instead of technical notes ("be angrier"), give action-based notes ("you\'ve been waiting for this for 20 years and it\'s finally here"). Ask actors what their character wants in this specific moment, not in the film overall. The actor\'s impulse is almost always right — the director\'s job is to recognize and protect it.',
      },
    ],
  },
  {
    id: 'cinematography',
    title: 'Cinematography Essentials',
    subtitle: 'The language of light and lens',
    emoji: '📷',
    duration: '14 min',
    category: 'Cinematography',
    sections: [
      {
        heading: 'Exposure Triangle',
        body: 'Three variables determine exposure: aperture (f-stop), shutter speed, and ISO. Aperture controls depth of field — a wide aperture (f/1.8) blurs the background (bokeh), isolating the subject; a narrow aperture (f/16) keeps everything sharp. Shutter speed controls motion blur — cinematic motion blur is created by the 180° rule: set shutter speed to double your frame rate (24fps → 1/48s). ISO controls sensor sensitivity — higher ISO captures more light but introduces grain/noise.',
        callout: '180° rule: shutter speed = 2× your frame rate.',
      },
      {
        heading: 'Three-Point Lighting',
        body: 'The classic lighting setup: a Key Light (the primary, dominant light source — usually from the front/side), a Fill Light (softer light from the opposite side to reduce shadows), and a Back/Rim Light (from behind the subject — separates them from the background and creates a halo). Hard light (direct, sharp shadows) is dramatic and expressive. Soft light (diffused, gentle shadows) is naturalistic. Film noir used hard, low-key light to create moral ambiguity. Comedy uses soft, high-key light for openness.',
      },
      {
        heading: 'Color Theory in Film',
        body: 'Color is emotional language. Warm colors (orange, red, yellow) signal energy, passion, warmth, danger. Cool colors (blue, teal, green) signal distance, melancholy, calm, the unnatural. The distinctive "orange-and-teal" look in Hollywood blockbusters places warm skin tones against cool environments. In Schindler\'s List Spielberg used a single red coat in the otherwise black-and-white film — a meticulously planned intervention of color as pure meaning. Color grading in post-production allows the colorist to shape the emotional temperature of every frame.',
      },
    ],
  },
  {
    id: 'acting-and-the-craft',
    title: 'Acting & the Craft',
    subtitle: 'Technique lineages, scene study, and the audition',
    emoji: '🎭',
    duration: '16 min',
    category: 'Acting',
    sections: [
      {
        heading: 'Technique Lineages',
        body: 'Modern screen acting descends from Konstantin Stanislavski\'s "system" — the pursuit of truthful behavior under imaginary circumstances through given circumstances, objectives, and emotional memory. In America his ideas branched. Lee Strasberg\'s Method (the Actors Studio) intensified affective/emotional memory — mining the actor\'s own past to fuel the scene. Stella Adler rejected that, insisting instead on the imagination and specificity of the given circumstances. Sanford Meisner distilled it further into "living truthfully under imaginary circumstances," building his technique on the Repetition Exercise to pull attention off oneself and onto the partner. David Mamet and William H. Macy\'s Practical Aesthetics reframed the whole thing as analysis and action — no wallowing, just play the action.',
        callout: 'Stanislavski is the root; Method, Meisner, Adler, and Practical Aesthetics are the branches.',
      },
      {
        heading: 'Scene-Study Fundamentals',
        body: 'Every scene is a negotiation. Before the actor speaks a line they must know: What does my character want in this scene (the objective)? What am I willing to do to get it (the actions/tactics)? Who is stopping me (the obstacle)? Actors break a script into "beats" — units of action that shift when a tactic changes. The verb is everything: "to seduce," "to warn," "to shame" — an active, playable verb that acts on the other person. Amateurs play emotions ("be sad"); professionals play actions and let emotion arrive as a byproduct. Listening — actually receiving what the partner does — is the entire game. As Meisner said, acting is "the reality of doing."',
        callout: 'Play the action, not the emotion. Emotion is the result, never the goal.',
      },
      {
        heading: 'Audition Craft',
        body: 'The audition is a separate skill from acting. The reader is usually flat and off-camera, so the actor must supply the whole scene\'s life alone. Make a strong, specific choice in the first ten seconds — casting directors decide fast. Own your mistakes: never apologize or restart unless invited; stay in it. Frame your eyeline just off the lens, not into it. For self-tapes: clean audio, even light, plain background, and a slate that\'s warm but brief. Know your sides cold enough to lift your eyes off the page. And detach from the outcome — you are auditioning for the room as much as the role; your job is to give a clear, alive read and leave.',
        callout: 'Make a bold choice in the first ten seconds. Indecision reads as fear.',
      },
      {
        heading: 'Voice & Movement',
        body: 'The body is the instrument, and it must be tuned. Voice work — breath support from the diaphragm, resonance, articulation, and release of tension — lets an actor be heard and stay truthful under pressure; the lineages here run through Kristin Linklater ("freeing the natural voice") and Cicely Berry at the RSC. Movement disciplines give the body a vocabulary: Rudolf Laban\'s effort system (weight, space, time, flow) helps an actor find how a character walks, gestures, and occupies space; the Alexander Technique undoes habitual tension; Michael Chekhov\'s Psychological Gesture externalizes a character\'s inner drive into a single physical shape. Great physical transformation — posture, rhythm, center of gravity — often communicates character faster than any line of dialogue.',
        callout: 'Character lives in the body: how they breathe, stand, and take up space.',
      },
    ],
  },
];

// ── Script Vault ───────────────────────────────────────────────────────────────
interface ScriptEntry {
  title: string;
  year: number;
  writer: string;
  genre: string;
  logline: string;
  sourceUrl: string;
  awards?: string;
  color: string;
}

const SCRIPT_VAULT: ScriptEntry[] = [
  {
    title: 'Chinatown',
    year: 1974,
    writer: 'Robert Towne',
    genre: 'Noir / Thriller',
    logline: 'A private detective uncovers layers of conspiracy while investigating a simple infidelity case in 1930s Los Angeles.',
    sourceUrl: 'https://www.imsdb.com/scripts/Chinatown.html',
    awards: 'WGA Award — Best Original Screenplay',
    color: 'from-amber-900 to-orange-800',
  },
  {
    title: 'Casablanca',
    year: 1942,
    writer: 'Julius Epstein, Philip Epstein, Howard Koch',
    genre: 'Romance / Drama',
    logline: 'A cynical American expatriate must choose between love and virtue when his former lover seeks his help in wartime Casablanca.',
    sourceUrl: 'https://www.imsdb.com/scripts/Casablanca.html',
    awards: 'Academy Award — Best Screenplay',
    color: 'from-slate-800 to-gray-700',
  },
  {
    title: 'Network',
    year: 1976,
    writer: 'Paddy Chayefsky',
    genre: 'Drama / Satire',
    logline: 'A fading news network exploits an unhinged anchorman\'s on-air breakdown for ratings, with devastating consequences.',
    sourceUrl: 'https://www.screenwriter.io/2013/01/network-screenplay/',
    awards: 'Academy Award — Best Original Screenplay',
    color: 'from-red-900 to-rose-800',
  },
  {
    title: 'Sunset Blvd.',
    year: 1950,
    writer: 'Billy Wilder, Charles Brackett, D.M. Marshman Jr.',
    genre: 'Noir / Drama',
    logline: 'A struggling screenwriter becomes entangled with a delusional former silent film star living in grotesque Hollywood fantasy.',
    sourceUrl: 'https://www.imsdb.com/scripts/Sunset-Boulevard.html',
    awards: 'Academy Award — Best Writing (Story and Screenplay)',
    color: 'from-zinc-900 to-neutral-800',
  },
  {
    title: 'All About Eve',
    year: 1950,
    writer: 'Joseph L. Mankiewicz',
    genre: 'Drama',
    logline: 'An ambitious young actress systematically destroys the career of the aging Broadway star who befriended her.',
    sourceUrl: 'https://www.imsdb.com/scripts/All-About-Eve.html',
    awards: 'Academy Award — Best Writing (Screenplay)',
    color: 'from-emerald-900 to-teal-800',
  },
  {
    title: 'Bicycle Thieves',
    year: 1948,
    writer: 'Cesare Zavattini',
    genre: 'Neo-realist Drama',
    logline: 'A poor Roman father searches the city with his young son for the stolen bicycle his livelihood depends on.',
    sourceUrl: 'https://screenplaytranslations.wordpress.com/2012/04/19/bicycle-thieves/',
    awards: 'Honorary Academy Award — Best Foreign Language Film',
    color: 'from-stone-800 to-stone-700',
  },
  {
    title: 'North by Northwest',
    year: 1959,
    writer: 'Ernest Lehman',
    genre: 'Thriller',
    logline: 'An advertising executive is mistaken for a government agent by foreign spies and pursued across America.',
    sourceUrl: 'https://www.imsdb.com/scripts/North-by-Northwest.html',
    color: 'from-blue-900 to-indigo-800',
  },
  {
    title: 'Rashomon',
    year: 1950,
    writer: 'Akira Kurosawa & Shinobu Hashimoto',
    genre: 'Drama / Mystery',
    logline: 'A samurai\'s murder is recounted in four irreconcilable versions by the witnesses and the accused.',
    sourceUrl: 'https://www.weirdwildrealm.com/f-rashomon.html',
    awards: 'Honorary Academy Award — Best Foreign Language Film',
    color: 'from-red-950 to-amber-900',
  },
  {
    title: 'The Philadelphia Story',
    year: 1940,
    writer: 'Donald Ogden Stewart',
    genre: 'Romantic Comedy',
    logline: 'A socialite\'s remarriage is complicated by the arrival of her ex-husband and two tabloid journalists.',
    sourceUrl: 'https://www.imsdb.com/scripts/Philadelphia-Story,-The.html',
    awards: 'Academy Award — Best Screenplay',
    color: 'from-purple-900 to-violet-800',
  },
  {
    title: 'City Lights',
    year: 1931,
    writer: 'Charles Chaplin',
    genre: 'Silent Comedy / Romance',
    logline: 'The Tramp falls in love with a blind flower girl and schemes to pay for an operation to restore her sight.',
    sourceUrl: 'https://charlot.info/city-lights/',
    color: 'from-gray-800 to-gray-700',
  },
  {
    title: 'Metropolis',
    year: 1927,
    writer: 'Fritz Lang & Thea von Harbou',
    genre: 'Science Fiction',
    logline: 'In a future city divided between privileged elite above and oppressed workers below, a man uncovers a revolutionary plot.',
    sourceUrl: 'https://www.imsdb.com/scripts/Metropolis.html',
    color: 'from-cyan-900 to-teal-900',
  },
];

// ── Film History Timeline ──────────────────────────────────────────────────────
const HISTORY_EVENTS = [
  { year: 1888, event: 'Louis Le Prince shoots Roundhay Garden Scene — the oldest surviving motion picture film.' },
  { year: 1895, event: 'The Lumière brothers hold the first commercial film screening in Paris. L\'Arrivée d\'un Train causes audiences to flee in terror.' },
  { year: 1902, event: 'Georges Méliès creates Le Voyage dans la lune — the first sci-fi film and the first to use fantasy narrative.' },
  { year: 1915, event: 'D.W. Griffith\'s The Birth of a Nation introduces film grammar — close-ups, crosscutting, tracking shots — but also introduces racist propaganda at scale.' },
  { year: 1920, event: 'Das Cabinet des Dr. Caligari establishes German Expressionism — distorted sets, extreme angles, psychology as visual design.' },
  { year: 1922, event: 'Robert Flaherty\'s Nanook of the North invents documentary cinema.' },
  { year: 1924, event: 'Buster Keaton\'s The Navigator and Sherlock Jr. establish the architecture of physical comedy.' },
  { year: 1925, event: 'Eisenstein\'s Battleship Potemkin defines Soviet montage theory and the political potential of cinema.' },
  { year: 1927, event: 'The Jazz Singer — first sound film with synchronized speech. Warner Bros. bets everything on it; the entire industry changes overnight.' },
  { year: 1939, event: 'Hollywood\'s greatest single year: Gone with the Wind, The Wizard of Oz, Stagecoach, Mr. Smith Goes to Washington, Ninotchka, Only Angels Have Wings.' },
  { year: 1941, event: 'Orson Welles\'s Citizen Kane. Every formal innovation cinema has produced — deep focus, non-linear narrative, extreme angles — combined in one film by a 25-year-old on his first picture.' },
  { year: 1946, event: 'Post-war boom. Film noir flourishes: The Big Sleep, The Killers, Gilda. 4 billion Americans go to the cinema annually.' },
  { year: 1948, event: 'Italian Neo-realism peaks: Bicycle Thieves. Using non-professional actors, natural light, location shooting — a revolt against Hollywood artifice.' },
  { year: 1950, event: 'Rashomon premieres in Venice, wins the Golden Lion. Japanese and European cinema enter the world conversation.' },
  { year: 1954, event: 'Kurosawa\'s Seven Samurai. CinemaScope widescreen format adopted by Hollywood to compete with television.' },
  { year: 1958, event: 'French New Wave emerges. Truffaut\'s The 400 Blows and Godard\'s Breathless reject classical narrative for existentialist spontaneity.' },
  { year: 1960, event: 'Psycho shatters the Production Code. Fellini\'s La Dolce Vita coins "paparazzi." Cinema becomes adult and dangerous again.' },
  { year: 1968, event: 'MPAA rating system replaces the Hays Code. 2001: A Space Odyssey and Rosemary\'s Baby mark the beginning of the New Hollywood era.' },
  { year: 1972, event: 'The Godfather earns $245M — proves a serious adult film can be a blockbuster. Begins the Auteur Decade.' },
  { year: 1975, event: 'Jaws invents the summer blockbuster. Steven Spielberg is 27 years old.' },
  { year: 1977, event: 'Star Wars changes everything — merchandising, sequels, the blockbuster as default mode. George Lucas and Spielberg displace the auteurs.' },
  { year: 1999, event: 'The Matrix, Fight Club, American Beauty, Being John Malkovich — a brief second golden age of Hollywood ambition.' },
  { year: 2007, event: 'No Country for Old Men, There Will Be Blood — prestige cinema reaches theatrical audiences again.' },
  { year: 2019, event: 'Parasite becomes the first non-English-language film to win Best Picture. Streaming services have already disrupted theatrical distribution.' },
];

// ── Module Detail ──────────────────────────────────────────────────────────────
const ModuleDetail: React.FC<{ module: FilmModule; onClose: () => void }> = ({ module, onClose }) => {
  const [sectionIndex, setSectionIndex] = useState(0);
  const section = module.sections[sectionIndex];
  const isLast = sectionIndex === module.sections.length - 1;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] bg-[#0a0812]/95 backdrop-blur-xl overflow-y-auto p-4 flex items-center justify-center"
    >
      <div className="w-full max-w-2xl">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <span className="text-3xl">{module.emoji}</span>
            <div>
              <h2 className="text-xl font-black text-white">{module.title}</h2>
              <p className="text-xs text-white/40">{module.subtitle}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center"><X size={16} /></button>
        </div>

        <div className="flex gap-1 mb-6">
          {module.sections.map((_, i) => (
            <div key={i} className={`h-1 flex-1 rounded-full transition-all ${i <= sectionIndex ? 'bg-amber-500' : 'bg-white/10'}`} />
          ))}
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={sectionIndex}
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -30 }}
            className="bg-white/[0.04] border border-white/[0.08] rounded-[1.5rem] p-6"
          >
            <h3 className="text-lg font-black text-white mb-3">{section.heading}</h3>
            <p className="text-white/70 text-sm leading-relaxed">{section.body}</p>
            {section.callout && (
              <div className="mt-4 p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl">
                <p className="text-amber-300 text-xs font-bold italic">{section.callout}</p>
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        <div className="flex gap-3 mt-4">
          <button disabled={sectionIndex === 0} onClick={() => setSectionIndex(s => s - 1)}
            className="flex items-center gap-2 px-4 py-3 bg-white/5 border border-white/10 rounded-2xl text-xs font-black disabled:opacity-30">
            <ChevronRight size={14} className="rotate-180" /> Back
          </button>
          {isLast ? (
            <button onClick={onClose} className="flex-1 flex items-center justify-center gap-2 py-3 bg-amber-600 hover:bg-amber-500 rounded-2xl text-xs font-black uppercase tracking-widest">
              <Check size={14} /> Complete Module
            </button>
          ) : (
            <button onClick={() => setSectionIndex(s => s + 1)} className="flex-1 flex items-center justify-center gap-2 py-3 bg-amber-600 hover:bg-amber-500 rounded-2xl text-xs font-black uppercase tracking-widest">
              Next <ChevronRight size={14} />
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
};

// ── Main component ─────────────────────────────────────────────────────────────
const CATEGORY_ICONS: Record<string, React.FC<any>> = {
  Story: BookOpen, Writing: Pen, Characters: Users,
  Direction: Clapperboard, Cinematography: Camera, Acting: Star,
};

const FilmSchoolView: React.FC<Props> = ({ onBack }) => {
  const [tab, setTab] = useState<Tab>('MODULES');
  const [selectedModule, setSelectedModule] = useState<FilmModule | null>(null);
  const [completedIds, setCompletedIds] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem('plajah_filmschool_completed') || '[]')); }
    catch { return new Set(); }
  });
  const [scriptFilter, setScriptFilter] = useState('All');
  const genres = ['All', ...Array.from(new Set(SCRIPT_VAULT.map(s => s.genre.split(' / ')[0])))];

  const markComplete = (id: string) => {
    setCompletedIds(prev => {
      const next = new Set(prev).add(id);
      localStorage.setItem('plajah_filmschool_completed', JSON.stringify([...next]));
      return next;
    });
  };

  const filteredScripts = scriptFilter === 'All' ? SCRIPT_VAULT : SCRIPT_VAULT.filter(s => s.genre.includes(scriptFilter));

  return (
    <div className="min-h-screen bg-black/60 backdrop-blur-sm text-white">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-black/60 backdrop-blur-xl border-b border-white/5 px-4 py-3">
        <div className="flex items-center gap-3 mb-3">
          <button onClick={onBack} className="w-9 h-9 rounded-full bg-white/5 flex items-center justify-center hover:bg-white/10 transition-all">
            <ArrowLeft size={16} />
          </button>
          <div>
            <h1 className="text-base font-black text-white">Film & TV School</h1>
            <p className="text-[9px] text-white/40 font-black uppercase tracking-widest">Taleo — Learn Filmmaking</p>
          </div>
        </div>
        <div className="flex gap-1 border-b border-white/5 pb-1">
          {([['MODULES', 'Modules', Clapperboard], ['SCRIPT_VAULT', 'Script Vault', BookOpen], ['HISTORY', 'Film History', Film]] as const).map(([id, label, Icon]) => (
            <button key={id} onClick={() => setTab(id)}
              className={`flex items-center gap-1.5 px-3 py-2 text-[9px] font-black uppercase tracking-widest rounded-t-lg transition-all ${tab === id ? 'text-amber-400 border-b-2 border-amber-400' : 'text-white/40 hover:text-white/70'}`}>
              <Icon size={12} />{label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-4xl mx-auto p-4">

        {/* ── MODULES ── */}
        {tab === 'MODULES' && (
          <div className="flex flex-col gap-4 pt-2">
            <p className="text-xs text-white/40 px-1">A complete introduction to filmmaking craft — story, writing, characters, directing, and cinematography.</p>
            {FILM_MODULES.map(module => {
              const done = completedIds.has(module.id);
              const Icon = CATEGORY_ICONS[module.category] || Film;
              return (
                <motion.button
                  key={module.id}
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                  onClick={() => setSelectedModule(module)}
                  className="w-full text-left flex items-center gap-4 p-5 bg-white/[0.04] border border-white/[0.08] rounded-[1.5rem] hover:border-amber-500/40 transition-all"
                >
                  <span className="text-3xl shrink-0">{module.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-black text-white truncate">{module.title}</h3>
                      {done && <div className="shrink-0 w-5 h-5 rounded-full bg-green-500/20 border border-green-500/40 flex items-center justify-center"><Check size={10} className="text-green-400" /></div>}
                    </div>
                    <p className="text-xs text-white/50">{module.subtitle}</p>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-[9px] text-amber-400/70 font-black uppercase tracking-widest">{module.category}</span>
                      <span className="text-[9px] text-white/30 font-black uppercase tracking-widest">{module.duration} · {module.sections.length} sections</span>
                    </div>
                  </div>
                  <ChevronRight size={16} className="text-white/30 shrink-0" />
                </motion.button>
              );
            })}
          </div>
        )}

        {/* ── SCRIPT VAULT ── */}
        {tab === 'SCRIPT_VAULT' && (
          <div className="pt-2">
            <div className="bg-amber-900/20 border border-amber-500/20 rounded-2xl p-4 mb-4">
              <p className="text-xs text-amber-200/80 font-bold leading-relaxed">
                These scripts are sourced from publicly accessible archives maintained by film schools, screenwriting databases, and digital libraries. They are provided for study and educational purposes. Always verify the rights status in your jurisdiction before any commercial use.
              </p>
            </div>

            {/* Genre filter */}
            <div className="flex gap-2 overflow-x-auto custom-scrollbar pb-2 mb-4">
              {genres.map(g => (
                <button key={g} onClick={() => setScriptFilter(g)}
                  className={`shrink-0 px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest transition-all ${scriptFilter === g ? 'bg-amber-600 text-white' : 'bg-white/5 text-white/50 hover:bg-white/10'}`}>
                  {g}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {filteredScripts.map(script => (
                <motion.div
                  key={script.title}
                  whileHover={{ scale: 1.01 }}
                  className={`relative overflow-hidden rounded-[1.5rem] bg-gradient-to-br ${script.color} border border-white/10 p-5 flex flex-col gap-3`}
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-black text-white text-lg leading-tight">{script.title}</h3>
                      <span className="shrink-0 text-[9px] font-black bg-black/30 rounded-full px-2 py-0.5 text-white/70">{script.year}</span>
                    </div>
                    <p className="text-[10px] text-white/60 mt-0.5">{script.writer}</p>
                  </div>
                  <p className="text-xs text-white/70 leading-relaxed flex-1">{script.logline}</p>
                  {script.awards && (
                    <div className="flex items-center gap-1.5">
                      <Star size={10} className="text-amber-400" />
                      <span className="text-[9px] text-amber-300/80">{script.awards}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <span className="text-[8px] font-black bg-black/30 rounded-full px-2 py-0.5 text-white/50 uppercase tracking-wider">{script.genre}</span>
                    <a
                      href={script.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-white/20 hover:bg-white/30 rounded-full text-[9px] font-black uppercase tracking-widest text-white transition-all"
                      onClick={e => e.stopPropagation()}
                    >
                      <ExternalLink size={10} /> Read Script
                    </a>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        )}

        {/* ── FILM HISTORY ── */}
        {tab === 'HISTORY' && (
          <div className="pt-2">
            <div className="relative">
              {/* Timeline line */}
              <div className="absolute left-8 top-0 bottom-0 w-px bg-gradient-to-b from-amber-500/40 via-white/10 to-transparent" />

              <div className="flex flex-col gap-6 pl-20">
                {HISTORY_EVENTS.map((ev, i) => (
                  <motion.div
                    key={ev.year}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.04 }}
                    className="relative"
                  >
                    {/* Dot */}
                    <div className="absolute -left-[3.2rem] top-1 w-3 h-3 rounded-full bg-amber-500 border-2 border-[#0a0812]" />
                    {/* Year */}
                    <span className="absolute -left-[6rem] top-0.5 text-[10px] font-black text-amber-400/70 w-10 text-right">{ev.year}</span>

                    <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4 hover:border-amber-500/20 transition-all">
                      <p className="text-sm text-white/70 leading-relaxed">{ev.event}</p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      <AnimatePresence>
        {selectedModule && (
          <ModuleDetail
            module={selectedModule}
            onClose={() => { markComplete(selectedModule.id); setSelectedModule(null); }}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

export default FilmSchoolView;
