import React, { useState, useMemo, useEffect } from 'react';
import { 
  ArrowRight, BookOpen, ChevronLeft, Clock3, FileBarChart, FilePlus2, 
  FileText, GraduationCap, Grid3X3, Import, LayoutPanelTop, Newspaper, 
  PenLine, ScrollText, Sparkles, Wand2, Database, FormInput, Music, 
  Layers, Cpu, Zap, Radio, Search, CheckCircle2, SlidersHorizontal, Plus,
  Volume2, VolumeX, Activity, Compass, Flame, Play, Pause, Grid, Clapperboard,
  Tv, Mail, Film, Printer, Store, Share2, Receipt, QrCode, MonitorPlay,
  RotateCcw, Sliders, Waves, Eye, Mic
} from 'lucide-react';
import type { TelaDocMeta, TelaVectorObject } from '../../types';
import type { TelaStyleEra } from '../../services/telaStyleEraLibrary';
import type { TelaPublicationTemplate } from '../../services/telaPublicationTemplates';
import TelaTemplateGallery from './TelaTemplateGallery';
import TelaChannelDial from './TelaChannelDial';
import TelaCarouselRow from './TelaCarouselRow';
import TelaShaderCanvas from './TelaShaderCanvas';
import { TelaStaticSvg } from './TelaVector';
import { ensureFontsForObjects } from '../../services/tela/telaFonts';
import { TELA_TEMPLATE_GALLERY, type TelaDesignTemplate } from '../../services/tela/telaTemplateRegistry';
import { SLIDE_TEMPLATES, buildSlideObjects } from '../../services/ambo/slideTemplates/registry';

export type TelaHomeDocumentKind = 'BLANK'|'REPORT'|'PROPOSAL'|'RESUME'|'LESSON'|'NEWSLETTER'|'SCREENPLAY'|'RESEARCH'|'BOARD';

interface DocumentKindMeta {
  id: TelaHomeDocumentKind;
  name: string;
  note: string;
  tagline: string;
  superpower: string;
  icon: React.ElementType;
  wash: string;
}

const kinds: DocumentKindMeta[] = [
  { id: 'BLANK', name: 'Sanctuary Folio & Blank', note: 'Monumental walk-in welcome or pure boundless stage.', tagline: 'Trajan capitals, 24k gold rules & liturgical harmony', superpower: 'Sanctuary Liturgical Vector', icon: FilePlus2, wash: '#00DAF3' },
  { id: 'REPORT', name: 'Executive Report', note: 'Structured business findings, inventory & KPI cards.', tagline: 'Executive briefing, quarterly yield & reactive charts', superpower: 'Live reactive charts', icon: FileBarChart, wash: '#2563EB' },
  { id: 'PROPOSAL', name: 'Commercial Proposal', note: 'Art Deco master rate cards, pitch decks & signage.', tagline: 'Chrysler geometric rules, rate cards & signage', superpower: 'Art Deco 1925 Canon', icon: ScrollText, wash: '#D40055' },
  { id: 'RESUME', name: 'Curator Portfolio', note: 'Photographer edit, gallery curation & spatial spreads.', tagline: 'Minimal spatial sequencing & full-bleed layout', superpower: 'Spatial portfolio spread', icon: FileText, wash: '#0F9F8F' },
  { id: 'LESSON', name: 'Academic Lesson', note: 'School chronicle, syllabi, rubrics & student work.', tagline: 'Multi-column curriculum & verified rubrics', superpower: 'Interactive student validator', icon: GraduationCap, wash: '#E07819' },
  { id: 'NEWSLETTER', name: 'Community Broadsheet', note: 'Editorial rhythm, local reporting & departments.', tagline: 'Multi-column community news & serif masthead', superpower: 'Forkable social embeds', icon: Newspaper, wash: '#A33BC2' },
  { id: 'SCREENPLAY', name: 'Cinematic Storyboard', note: 'Noir comic screenplay, 5-act beat boards & wides.', tagline: 'Midnight casefiles, wide panels & impact lettering', superpower: 'Lorea studio bridge', icon: PenLine, wash: '#C13939' },
  { id: 'RESEARCH', name: 'Observable Science', note: 'Science & discovery features with precision diagrams.', tagline: 'Observable astronomy, celestial charts & evidence', superpower: 'Semantic citation blocks', icon: BookOpen, wash: '#34715C' },
  { id: 'BOARD', name: 'Constructivist Board', note: 'Bauhaus 1923 vector grid, circular motifs & balance.', tagline: 'Asymmetric typography, diagonal wedges & rules', superpower: 'Bauhaus Geometric Grid', icon: Grid3X3, wash: '#5056B8' },
];

const templatePageCache = new Map<string, TelaVectorObject[]>();
function getRealTemplatePage(t: TelaDesignTemplate, pageIndex: number = 0): TelaVectorObject[] {
  const key = `${t.id}#${pageIndex}`;
  let v = templatePageCache.get(key);
  if (!v) {
    try {
      v = t.pages[pageIndex]?.build() || [];
    } catch {
      v = [];
    }
    templatePageCache.set(key, v);
    ensureFontsForObjects(v);
  }
  return v;
}

// Ecosystem Pillars: Where Tela powers the Plajah Experience
const PLAJAH_ECOSYSTEM_PILLARS = [
  {
    studio: 'Ambo Worship & Broadcast Studio',
    badge: 'LIVE LYRICS & SACRED',
    tag: '10 Council Styles & 4K Output',
    desc: 'The complete broadcast presentation engine: 10 council-authored lyric looks (Sanctuary Lower Third, Karaoke Sweep, Word Stack, Gilded), sermon slides, live scripture search, and multi-screen SDI/NDI output.',
    icon: Tv,
    color: '#00DAF3',
    example: 'Live Hymnal & Sermon Slides'
  },
  {
    studio: 'Plajah Academia & Knowledge',
    badge: 'INTERACTIVE LEARNING',
    tag: 'Self-Grading Lessons & Syllabi',
    desc: 'Powers Elevate Classrooms with dynamic self-grading question fields, formula checks, academic syllabi, semantic citation cards, and visual lecture folios that make learning tactile and alive.',
    icon: GraduationCap,
    color: '#F59E0B',
    example: 'Student Worksheets & Syllabi'
  },
  {
    studio: 'The Plajah Social Network',
    badge: 'VIRAL BROADSIDES',
    tag: 'Feed Carousels & Community Drops',
    desc: 'Every multi-slide carousel and announcement drop in the Plajah feed is a living Tela document. Users read, flip through slides, comment inline, and fork templates directly into their own studios.',
    icon: Share2,
    color: '#A855F7',
    example: 'Feed Carousels & Announcements'
  },
  {
    studio: 'Film Production & Lorea Studio',
    badge: 'CINEMA PIPELINE',
    tag: 'Screenplays, Call Sheets & Beats',
    desc: 'The complete independent film pipeline: Courier 12pt screenplay scripts, daily call sheets, shot lists, 5-act visual beatboards, and Fabula video editor broadcast motion graphics & titling.',
    icon: Film,
    color: '#EC4899',
    example: 'Scripts, Call Sheets & Overlays'
  },
  {
    studio: 'Small Business Operations & POS',
    badge: 'RETAIL & SIGNAGE',
    tag: 'TV Menu Boards & POS Receipts',
    desc: 'Grassroots small business power for cafes, food trucks, pop-up boutiques, and salons: 4K digital signage TV menus, Point-of-Sale printable order slips, daily specials, price lists, and QR table cards.',
    icon: Store,
    color: '#10B981',
    example: '4K TV Menus & POS Receipts'
  },
  {
    studio: 'Chora Conservatory & Music',
    badge: 'INTERACTIVE SCORE',
    tag: 'Music Notation & Lyric Folios',
    desc: 'Direct integration with Verovio MusicXML engraving, dynamic chord chart sheets, vinyl album art folios, and synchronized lyric broadsides.',
    icon: Music,
    color: '#FF8A00',
    example: 'Sheet Music & Liner Notes'
  },
];

// Ambo Showcase Songs
const AMBO_SHOWCASE_SONGS = [
  {
    id: 'vision',
    title: 'Be Thou My Vision',
    artist: 'Traditional Irish Hymn (8th Century)',
    key: 'Key of Eb · 3/4 Time · CCLI #30639',
    lines: [
      { text: 'Be Thou my vision, O Lord of my heart;', time: 0 },
      { text: 'Naught be all else to me, save that Thou art;', time: 3.5 },
      { text: 'Thou my best thought, by day or by night,', time: 7.0 },
      { text: 'Waking or sleeping, Thy presence my light.', time: 10.5 },
      { text: 'Be Thou my wisdom, and Thou my true word;', time: 14.0 },
      { text: 'I ever with Thee and Thou with me, Lord;', time: 17.5 },
      { text: 'Thou my great Father, I Thy true son;', time: 21.0 },
      { text: 'Thou in me dwelling, and I with Thee one.', time: 24.5 },
    ]
  },
  {
    id: 'faithfulness',
    title: 'Great Is Thy Faithfulness',
    artist: 'Thomas O. Chisholm · William M. Runyan',
    key: 'Key of D · 3/4 Time · CCLI #22324',
    lines: [
      { text: 'Great is Thy faithfulness, O God my Father,', time: 0 },
      { text: 'There is no shadow of turning with Thee;', time: 3.5 },
      { text: 'Thou changest not, Thy compassions, they fail not;', time: 7.0 },
      { text: 'As Thou hast been Thou forever wilt be.', time: 10.5 },
      { text: 'Great is Thy faithfulness! Great is Thy faithfulness!', time: 14.0 },
      { text: 'Morning by morning new mercies I see;', time: 17.5 },
      { text: 'All I have needed Thy hand hath provided—', time: 21.0 },
      { text: 'Great is Thy faithfulness, Lord, unto me!', time: 24.5 },
    ]
  },
  {
    id: 'obsidian',
    title: 'The Obsidian Anthem',
    artist: 'Plajah Chora Master Choir',
    key: '432 Hz Chamber Tuning · 6/8 Meter',
    lines: [
      { text: 'From silence rising, an ancient harmonic stone,', time: 0 },
      { text: 'Through velvet darkness where living frequencies roam,', time: 3.5 },
      { text: 'Every word illuminated on the sovereign plane,', time: 7.0 },
      { text: 'The choir echoes across the celestial domain.', time: 10.5 },
    ]
  }
];

const AMBO_LYRIC_STYLES = [
  { id: 'sanctuary', name: 'Sanctuary Lower Third', council: 'Art Council', director: 'The Classical Mind', blurb: 'Hymnal serif on thin gold rule with next-line small caps' },
  { id: 'karaoke', name: 'Karaoke Sweep', council: 'Motion Council', director: 'The Kinetic Typographer', blurb: 'Words fill with luminous amber as sung with lift-away ease' },
  { id: 'gilded', name: 'Gilded Gold', council: 'Art Council', director: 'The Master Illuminator', blurb: 'Gold leaf illuminated drop cap & classical frame' },
  { id: 'stack', name: 'Word Stack', council: 'Motion Council', director: 'The Type Architect', blurb: 'Monumental condensed words stacking vertically' },
  { id: 'neon', name: 'Neon Signal', council: 'Motion Council', director: 'The Cyberneticist', blurb: 'Glowing neon gas tubes with chromatic bloom' },
];

function ScrollReveal({
  children,
  className = '',
  delay = 0,
  direction = 'up',
  distance = 28,
  duration = 750,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  direction?: 'up' | 'down' | 'left' | 'right' | 'none';
  distance?: number;
  duration?: number;
}) {
  const [isVisible, setIsVisible] = useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      setIsVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.unobserve(el);
        }
      },
      { threshold: 0.05, rootMargin: '0px 0px -40px 0px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const getTransform = () => {
    if (isVisible) return 'none';
    switch (direction) {
      case 'up': return `translate3d(0, ${distance}px, 0)`;
      case 'down': return `translate3d(0, -${distance}px, 0)`;
      case 'left': return `translate3d(${distance}px, 0, 0)`;
      case 'right': return `translate3d(-${distance}px, 0, 0)`;
      case 'none': return 'none';
    }
  };

  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: isVisible ? 1 : 0,
        transform: getTransform(),
        filter: isVisible ? 'blur(0px)' : 'blur(4px)',
        transition: `opacity ${duration}ms cubic-bezier(0.16, 1, 0.3, 1) ${delay}ms, transform ${duration}ms cubic-bezier(0.16, 1, 0.3, 1) ${delay}ms, filter ${duration}ms cubic-bezier(0.16, 1, 0.3, 1) ${delay}ms`,
        willChange: 'opacity, transform, filter',
      }}
    >
      {children}
    </div>
  );
}

export default function TelaHome({
  recent,
  onOpen,
  onCreate,
  onChooseStyle,
  onChoosePublication,
  onChooseTemplate,
  onImport,
  onBack,
}: {
  recent: TelaDocMeta[];
  onOpen: (id: string) => void;
  onCreate: (kind: TelaHomeDocumentKind) => void;
  onChooseStyle: (style: TelaStyleEra) => void;
  onChoosePublication: (template: TelaPublicationTemplate) => void;
  onChooseTemplate: (template: TelaDesignTemplate) => void;
  onImport: () => void;
  onBack?: () => void;
}) {
  const [promptText, setPromptText] = useState('');
  // Put the living dial carousel prominently near the top by default!
  const [templateView, setTemplateView] = useState<'dial' | 'shelves' | 'grid'>('dial');

  // Interactive Multi-Workflow Laboratory State
  const [activeWorkflow, setActiveWorkflow] = useState<'AMBO' | 'SHADERS' | 'LOTTIE_MOTION' | 'STORYBOOK' | 'DATA_VIZ' | 'SMALL_BIZ' | 'ACADEMIA' | 'SOCIAL'>('AMBO');

  // Workflow 0: Ambo Live Lyrics State
  const [selectedSongId, setSelectedSongId] = useState<'vision' | 'faithfulness' | 'obsidian'>('vision');
  const [selectedLyricStyle, setSelectedLyricStyle] = useState<'sanctuary' | 'karaoke' | 'gilded' | 'stack' | 'neon'>('sanctuary');
  const [lyricLineIndex, setLyricLineIndex] = useState(0);
  const [lyricWordProgress, setLyricWordProgress] = useState(0.65);
  const [isLyricPlaying, setIsLyricPlaying] = useState(true);
  const [lyricBackdrop, setLyricBackdrop] = useState<'SANCTUARY' | 'AUDITORIUM' | 'OBSIDIAN'>('SANCTUARY');

  // Workflow 1: Small Business POS & Signage State
  const [bizItem, setBizItem] = useState('Single-Origin Ethiopian Cold Brew');
  const [bizPrice, setBizPrice] = useState(5.50);
  const [bizPromo, setBizPromo] = useState('20% OFF TODAY');
  const [receiptCount, setReceiptCount] = useState(1);

  // Workflow 2: Film Production & Motion State
  const [filmTitle, setFilmTitle] = useState('THE OBSIDIAN SIGNAL');
  const [filmCallTime, setFilmCallTime] = useState('06:00 AM // DAY 14 OF 28');
  const [motionTime, setMotionTime] = useState(1.2);
  const [isMotionPlaying, setIsMotionPlaying] = useState(false);

  // Workflow 3: Storybook State
  const [storybookPage, setStorybookPage] = useState(0);
  const [stargazerMood, setStargazerMood] = useState<'CURIOUS' | 'AMAZED' | 'DREAMING'>('CURIOUS');
  const [storybookSound, setStorybookSound] = useState<string | null>(null);

  // Workflow 4: Data Viz State
  const [creatorsCount, setCreatorsCount] = useState(84000);
  const [docYield, setDocYield] = useState(18.5);
  const [forkMultiplier, setForkMultiplier] = useState(2.4);

  // Workflow 5: Academia State
  const [studentInput, setStudentInput] = useState('6CO2 + 6H2O -> C6H12O6 + 6O2');
  const [isGraded, setIsGraded] = useState(true);

  // Workflow 6: Social Network Carousel State
  const [socialSlide, setSocialSlide] = useState(0);
  const [forkCount, setForkCount] = useState(142);

  // Soundscape State
  const [isPlayingAudio, setIsPlayingAudio] = useState(true);

  // Top Rotating Call-to-Action State (6 iconic showcases)
  const [activeHeroSlide, setActiveHeroSlide] = useState(0);
  const [isHeroPaused, setIsHeroPaused] = useState(false);
  const [pageMounted, setPageMounted] = useState(false);

  // Trigger page entrance animation immediately upon mounting
  useEffect(() => {
    const timer = setTimeout(() => setPageMounted(true), 40);
    return () => clearTimeout(timer);
  }, []);

  // Auto-rotate hero slide every 7 seconds unless hovered/interacting
  useEffect(() => {
    if (isHeroPaused) return;
    const timer = setInterval(() => {
      setActiveHeroSlide(prev => (prev + 1) % 6);
    }, 7000);
    return () => clearInterval(timer);
  }, [isHeroPaused]);

  // Auto-play lyric sync loop when active in Ambo workflow
  useEffect(() => {
    if (!isLyricPlaying || activeWorkflow !== 'AMBO') return;
    const interval = setInterval(() => {
      setLyricWordProgress(p => {
        if (p >= 1.0) {
          setLyricLineIndex(idx => {
            const song = AMBO_SHOWCASE_SONGS.find(s => s.id === selectedSongId) || AMBO_SHOWCASE_SONGS[0];
            return (idx + 1) % song.lines.length;
          });
          return 0;
        }
        return Number((p + 0.05).toFixed(2));
      });
    }, 140);
    return () => clearInterval(interval);
  }, [isLyricPlaying, activeWorkflow, selectedSongId]);

  // Auto-play motion graphic loop when active in Film workflow
  useEffect(() => {
    if (!isMotionPlaying || activeWorkflow !== 'LOTTIE_MOTION') return;
    const interval = setInterval(() => {
      setMotionTime(t => {
        if (t >= 2.4) return 0;
        return Number((t + 0.1).toFixed(1));
      });
    }, 100);
    return () => clearInterval(interval);
  }, [isMotionPlaying, activeWorkflow]);

  // Active song details
  const activeSong = useMemo(() => {
    return AMBO_SHOWCASE_SONGS.find(s => s.id === selectedSongId) || AMBO_SHOWCASE_SONGS[0];
  }, [selectedSongId]);

  const currentLyricLine = activeSong.lines[lyricLineIndex] || activeSong.lines[0];
  const nextLyricLine = activeSong.lines[(lyricLineIndex + 1) % activeSong.lines.length];
  const prevLyricLine = activeSong.lines[(lyricLineIndex - 1 + activeSong.lines.length) % activeSong.lines.length];

  // ── FILTERED TEMPLATE LISTS FOR MULTI-ROW SHELVES ────────────────────────────

  // 1. Ambo Broadcast & Sacred Slide Presets
  const amboTemplates = useMemo(() => {
    const selectedIds = ['welcome', 'countdown', 'sermon-title', 'sermon-point', 'song-title', 'giving', 'prayer', 'benediction', 'lyrics-sanctuary', 'lyrics-karaoke', 'lyrics-gilded'];
    return selectedIds.map(id => {
      const def = SLIDE_TEMPLATES.find(t => t.id === id);
      if (!def) return null;
      return {
        id: `ambo:${def.id}`,
        name: def.name,
        collection: 'PRESENTATION' as const,
        group: 'AMBO BROADCAST',
        tagline: def.blurb,
        description: `Ambo Sanctuary live template · ${def.category}. Reflows to 16:9, 4:3, or ultrawide.`,
        palette: ['#0C0814', '#FAF8EE', '#D4AF37', '#6B0099'],
        fonts: ['fraunces', 'inter'],
        width: 1920,
        height: 1080,
        frameKind: 'SCREEN' as const,
        pages: [{
          label: '4K Broadcast Slide',
          build: () => (buildSlideObjects(def.id, 'sanctuary', undefined, 1920, 1080) as TelaVectorObject[]) || []
        }],
        tags: ['ambo', 'worship', 'lyrics', 'broadcast', 'sacred', def.category.toLowerCase()]
      };
    }).filter(Boolean) as TelaDesignTemplate[];
  }, []);

  // 2. The Living Story Books & Illustrated Folios
  const storybookTemplates = useMemo(() => 
    TELA_TEMPLATE_GALLERY.filter(t => 
      t.group?.toLowerCase().includes('comic') || 
      t.group?.toLowerCase().includes('children') || 
      t.name.toLowerCase().includes('book') || 
      t.name.toLowerCase().includes('manga') || 
      t.name.toLowerCase().includes('comic') || 
      t.tags.some(tag => ['comic', 'manga', 'picture book', 'children', 'story', 'book', 'photo book'].includes(tag.toLowerCase()))
    ), []
  );

  // 3. Motion Graphics, .Lottie & Broadcast Titling
  const lottieMotionTemplates = useMemo(() => 
    TELA_TEMPLATE_GALLERY.filter(t => 
      t.collection === 'LOWER_THIRD' || 
      t.tags.includes('motion') || 
      t.tags.includes('fabula')
    ), []
  );

  // 4. Small Business Operations, Menus & POS
  const smallBizTemplates = useMemo(() => 
    TELA_TEMPLATE_GALLERY.filter(t => 
      t.collection === 'MENU' || 
      t.collection === 'POSTER' || 
      t.name.toLowerCase().includes('café') || 
      t.name.toLowerCase().includes('menu') || 
      t.name.toLowerCase().includes('bistro') || 
      t.name.toLowerCase().includes('market') || 
      t.tags.some(tag => ['menu', 'business', 'food', 'retail', 'pos', 'signage'].includes(tag.toLowerCase()))
    ), []
  );

  // 5. Plajah Academia, Lessons & Research
  const academiaTemplates = useMemo(() => 
    TELA_TEMPLATE_GALLERY.filter(t => 
      t.name.toLowerCase().includes('worksheet') || 
      t.name.toLowerCase().includes('lesson') || 
      t.name.toLowerCase().includes('research') || 
      t.name.toLowerCase().includes('paper') || 
      t.name.toLowerCase().includes('field journal') || 
      t.tags.some(tag => ['academic', 'education', 'research', 'lesson', 'school'].includes(tag.toLowerCase()))
    ), []
  );

  // 6. Data Visualization, Cap Tables & Financial Grids
  const dataVizTemplates = useMemo(() => 
    TELA_TEMPLATE_GALLERY.filter(t => 
      t.collection === 'DOCUMENT' || 
      t.name.toLowerCase().includes('report') || 
      t.name.toLowerCase().includes('dossier') || 
      t.name.toLowerCase().includes('pitch') || 
      t.tags.some(tag => ['report', 'finance', 'data', 'analytics', 'pitch', 'proposal'].includes(tag.toLowerCase()))
    ), []
  );

  // 7. Social Network Broadsides & Carousels
  const socialTemplates = useMemo(() => 
    TELA_TEMPLATE_GALLERY.filter(t => 
      t.collection === 'SOCIAL' || 
      t.name.toLowerCase().includes('drop') || 
      t.name.toLowerCase().includes('notice') || 
      t.name.toLowerCase().includes('card') || 
      t.tags.some(tag => ['social', 'broadside', 'post', 'feed', 'newsletter'].includes(tag.toLowerCase()))
    ), []
  );

  // 8. Design History Eras & Typographic Canons
  const historyTemplates = useMemo(() => 
    TELA_TEMPLATE_GALLERY.filter(t => t.collection === 'DESIGN_HISTORY'), []
  );

  // Real templates selected for Interactive Laboratory showcases
  const labAmboTemplate = useMemo(() => {
    return amboTemplates.find(t => t.id === 'ambo:song-title') || amboTemplates.find(t => t.id === 'ambo:welcome') || amboTemplates[0];
  }, [amboTemplates]);

  const labShaderTemplate = useMemo(() => {
    return TELA_TEMPLATE_GALLERY.find(t => t.id === 'era:bauhaus-1923') || TELA_TEMPLATE_GALLERY[0];
  }, []);

  const labMotionTemplate = useMemo(() => {
    return TELA_TEMPLATE_GALLERY.find(t => t.id === 'pub:comic-noir') || TELA_TEMPLATE_GALLERY.find(t => t.collection === 'LOWER_THIRD') || TELA_TEMPLATE_GALLERY[0];
  }, []);

  const labStoryTemplate = useMemo(() => {
    return TELA_TEMPLATE_GALLERY.find(t => t.id === 'pub:story-ocean') || TELA_TEMPLATE_GALLERY.find(t => t.id.includes('story')) || TELA_TEMPLATE_GALLERY[0];
  }, []);

  const labDataVizTemplate = useMemo(() => {
    return TELA_TEMPLATE_GALLERY.find(t => t.id === 'pub:news-business') || TELA_TEMPLATE_GALLERY.find(t => t.id === 'pub:mag-science') || TELA_TEMPLATE_GALLERY[0];
  }, []);

  const labSmallBizTemplate = useMemo(() => {
    return TELA_TEMPLATE_GALLERY.find(t => t.id === 'era:art-deco-1925') || amboTemplates.find(t => t.id === 'ambo:event') || TELA_TEMPLATE_GALLERY[0];
  }, [amboTemplates]);

  const labAcademiaTemplate = useMemo(() => {
    return TELA_TEMPLATE_GALLERY.find(t => t.id === 'pub:news-school') || TELA_TEMPLATE_GALLERY.find(t => t.id === 'pub:mag-science') || TELA_TEMPLATE_GALLERY[0];
  }, []);

  const labSocialTemplate = useMemo(() => {
    return TELA_TEMPLATE_GALLERY.find(t => t.id === 'pub:news-community') || TELA_TEMPLATE_GALLERY[0];
  }, []);

  // Canonical template mappings for large visual archetype cards (pulling from REAL built templates!)
  const kindTemplates = useMemo<Record<TelaHomeDocumentKind, TelaDesignTemplate | null>>(() => {
    return {
      BLANK: amboTemplates.find(t => t.id === 'ambo:welcome') || amboTemplates[0] || null,
      REPORT: TELA_TEMPLATE_GALLERY.find(t => t.id === 'pub:news-business') || TELA_TEMPLATE_GALLERY.find(t => t.id === 'pub:mag-science') || null,
      PROPOSAL: TELA_TEMPLATE_GALLERY.find(t => t.id === 'era:art-deco-1925') || amboTemplates.find(t => t.id === 'ambo:event') || null,
      RESUME: TELA_TEMPLATE_GALLERY.find(t => t.id === 'pub:photo-portfolio') || null,
      LESSON: TELA_TEMPLATE_GALLERY.find(t => t.id === 'pub:news-school') || TELA_TEMPLATE_GALLERY.find(t => t.id === 'pub:mag-science') || null,
      NEWSLETTER: TELA_TEMPLATE_GALLERY.find(t => t.id === 'pub:news-community') || null,
      SCREENPLAY: TELA_TEMPLATE_GALLERY.find(t => t.id === 'pub:comic-noir') || TELA_TEMPLATE_GALLERY.find(t => t.collection === 'LOWER_THIRD') || null,
      RESEARCH: TELA_TEMPLATE_GALLERY.find(t => t.id === 'pub:mag-science') || TELA_TEMPLATE_GALLERY.find(t => t.id === 'pub:mag-culture') || null,
      BOARD: TELA_TEMPLATE_GALLERY.find(t => t.id === 'era:bauhaus-1923') || null,
    };
  }, [amboTemplates]);

  // 6 Rotating Showcase Call-to-Actions for the Top Hero
  const HERO_SLIDES = useMemo(() => [
    {
      id: 'sanctuary',
      pill: '01 Sacred Hymnal',
      badge: 'SACRED LITURGY & CHORAL HYMN',
      color: '#00DAF3',
      headline: 'What will you make clear and beautiful?',
      subhead: 'Bring sacred verse, choral lyrics, and scripture into physical communion with true optical font sizing, discretionary ligatures, and SDI/NDI broadcast lower-thirds.',
      emotive: '✦ Synchronized with the Chora 432Hz audio bus — words illuminate dynamically as sung by the choir.',
      tags: ['Palatino 144pt', 'fi Ligatures', 'Chora 432Hz Sync', 'Gold Hairlines'],
      actionLabel: '✦ Open Sanctuary Hymnal in Studio',
      template: labAmboTemplate,
      kind: 'BOARD' as const,
      metaText: 'AMBO SANCTUARY · 4K PROGRAM // LIVE CUE 01',
      title: 'Be Thou My Vision',
      caption: 'Traditional 8th-Century Hymnal — Palatino Serif on 24k Gold Hairline Rule',
    },
    {
      id: 'cinema',
      pill: '02 Cinema Film',
      badge: 'FILM PRODUCTION & SCREENPLAY',
      color: '#EC4899',
      headline: 'What worlds will you write into motion?',
      subhead: 'From Courier 12pt screenplay treatments and 5-act beat boards to 60 FPS broadcast motion graphics and printable principal photography call sheets.',
      emotive: '✦ Seamless bridge from Lorea script development to broadcast-ready .lottie overlays and scene slates.',
      tags: ['Courier 12pt', '60 FPS Motion Alpha', 'Lorea Film Bridge', 'Day 14 Call Sheet'],
      actionLabel: '✦ Open Cinema Script & Lower Third',
      template: labMotionTemplate,
      kind: 'SCREENPLAY' as const,
      metaText: 'LOREA CINEMA // PRINCIPAL PHOTOGRAPHY DAY 14',
      title: 'The Obsidian Signal',
      caption: 'Fabula Broadcast Lower Third & 4K Title Slate (60 FPS Vector Alpha)',
    },
    {
      id: 'commerce',
      pill: '03 Café TV & POS',
      badge: 'COMMERCE & DIGITAL SIGNAGE',
      color: '#10B981',
      headline: 'How will you command your space?',
      subhead: 'One single living document streams 4K television menu signage, updates real-time specials, and formats instant thermal POS order receipts for kitchen printers.',
      emotive: '✦ Zero-restraint layout: dynamic prices update live across the dining room TV and register receipt.',
      tags: ['4K TV Signage', 'Instant Thermal POS', 'Dynamic QR Ordering', 'Live Menu Wire'],
      actionLabel: '✦ Open Café Menu & POS in Studio',
      template: labSmallBizTemplate,
      kind: 'PROPOSAL' as const,
      metaText: 'L’ATELIER CAFÉ & BAR // 4K TV DIGITAL MENU',
      title: 'Single-Origin Cold Brew ($5.50)',
      caption: 'Live Table Ordering QR Code & Thermal Kitchen Order Slip #1042',
    },
    {
      id: 'dataviz',
      pill: '04 Reactive Data',
      badge: 'REACTIVE DATA & CAP TABLES',
      color: '#2563EB',
      headline: 'What truths will you calculate and prove?',
      subhead: 'Ditch dead PDF exports. Tela documents bind live calculations to vector charts, investor cap tables, and balance sheets that recalculate on the fly.',
      emotive: '✦ Dynamic spreadsheet-to-vector binding — slide variables and witness bars react at 120 FPS.',
      tags: ['Two-Way Formula Wires', '100% Vector Charts', 'Interactive Sliders', 'Real-Time Yield'],
      actionLabel: '✦ Open Operations Report in Studio',
      template: labDataVizTemplate,
      kind: 'REPORT' as const,
      metaText: 'OPERATIONS DOSSIER // REAL-TIME KPI SHEET',
      title: '$13.4M (+86% Q4 Yield)',
      caption: 'Two-Way Reactive Formula Wire Graph (100% Vector Native SVG)',
    },
    {
      id: 'academia',
      pill: '05 Academia',
      badge: 'ELEVATE ACADEMIA & RESEARCH',
      color: '#F59E0B',
      headline: 'What wisdom will you pass forward?',
      subhead: 'Create self-grading interactive student worksheets, peer-reviewed scientific journals, and lecture rubrics backed by semantic citation blocks.',
      emotive: '✦ Accredited evaluation: student equations validate automatically against academic standards.',
      tags: ['Auto-Graded Rubrics', 'Calvin Cycle Solver', 'Semantic Citations', 'Peer-Review Grids'],
      actionLabel: '✦ Open Academia Lesson in Studio',
      template: labAcademiaTemplate,
      kind: 'LESSON' as const,
      metaText: 'ELEVATE ACADEMY // MODULE 4: BIO-CHEMISTRY 201',
      title: 'Calvin Cycle Rubric (100/100)',
      caption: 'Self-Grading Student Worksheet & Accredited Semantic Citation Block',
    },
    {
      id: 'storybook',
      pill: '06 Living Story',
      badge: 'LIVING STORYBOOKS & SHADERS',
      color: '#A855F7',
      headline: 'What stories will leap off the page?',
      subhead: 'Interactive children’s picture books, comic spreads, and procedural WebGL wave shaders where characters move and stars twinkle whenever a reader turns the page.',
      emotive: '✦ Wet watercolor washes, animated character sprites, and hardware-accelerated GLSL wave dynamics.',
      tags: ['120 FPS WebGL2', '.Lottie Sprites', 'Touchpoint Audio Bed', 'Wet Watercolor Washes'],
      actionLabel: '✦ Open Living Storybook in Studio',
      template: labStoryTemplate,
      kind: 'NEWSLETTER' as const,
      metaText: 'CHILDREN’S FOLIO // BELOW THE BLUE SPREAD 1',
      title: 'Below the Blue (Coral & Lumi)',
      caption: 'Procedural WebGL Fluid Shader & Animated Vector Character Spreads',
    },
  ], [labAmboTemplate, labMotionTemplate, labSmallBizTemplate, labDataVizTemplate, labAcademiaTemplate, labStoryTemplate]);

  const activeHero = HERO_SLIDES[activeHeroSlide] || HERO_SLIDES[0];

  const handleQuickManifest = (e: React.FormEvent) => {
    e.preventDefault();
    const prompt = promptText.trim().toLowerCase();
    if (prompt.includes('ambo') || prompt.includes('lyric') || prompt.includes('worship') || prompt.includes('hymn') || prompt.includes('sermon')) {
      onCreate('BOARD');
    } else if (prompt.includes('menu') || prompt.includes('signage') || prompt.includes('pos') || prompt.includes('retail') || prompt.includes('cafe') || prompt.includes('store')) {
      onCreate('PROPOSAL');
    } else if (prompt.includes('screenplay') || prompt.includes('script') || prompt.includes('movie') || prompt.includes('film') || prompt.includes('call sheet')) {
      onCreate('SCREENPLAY');
    } else if (prompt.includes('worksheet') || prompt.includes('lesson') || prompt.includes('syllabus') || prompt.includes('curriculum') || prompt.includes('class')) {
      onCreate('LESSON');
    } else if (prompt.includes('social') || prompt.includes('post') || prompt.includes('feed') || prompt.includes('carousel')) {
      onCreate('NEWSLETTER');
    } else if (prompt.includes('data') || prompt.includes('report') || prompt.includes('dossier')) {
      onCreate('REPORT');
    } else {
      onCreate('BLANK');
    }
  };

  return (
    <div 
      className="flex-1 h-screen overflow-y-auto custom-scrollbar text-white select-none"
      style={{
        background: `
          radial-gradient(1200px 600px at 75% -10%, rgba(212,0,85,.26), transparent 70%),
          radial-gradient(900px 500px at 15% 15%, rgba(107,0,153,.30), transparent 60%),
          radial-gradient(800px 500px at 50% 90%, rgba(255,138,0,.15), transparent 70%),
          linear-gradient(165deg, #09070D 0%, #060508 55%, #0B0810 100%)
        `
      }}
    >
      {/* ── Dynamic Keyframe & Animation Styles ───────────────────────────────── */}
      <style>{`
        @keyframes telaBloom {
          0% { opacity: 0; transform: translateY(10px) scale(0.985); filter: blur(3px); }
          100% { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }
        }
        @keyframes telaPulseGlow {
          0%, 100% { opacity: 0.35; transform: scale(1); }
          50% { opacity: 0.65; transform: scale(1.03); }
        }
        .animate-tela-bloom {
          animation: telaBloom 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
      `}</style>

      {/* ── Top Bar ────────────────────────────────────────────────────────── */}
      <header 
        className={`sticky top-0 z-40 h-16 px-4 sm:px-8 flex items-center gap-3 backdrop-blur-2xl transition-all duration-700 ease-out ${
          pageMounted ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'
        }`}
        style={{
          background: 'rgba(9, 7, 13, 0.85)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)'
        }}
      >
        {onBack && (
          <button 
            onClick={onBack} 
            className="grid place-items-center w-9 h-9 rounded-[11px] text-white/65 bg-white/[.05] border border-white/[.08] hover:bg-white/[.1] transition-colors"
          >
            <ChevronLeft size={16} />
          </button>
        )}

        <div className="flex items-center gap-3">
          <span 
            className="grid place-items-center w-9 h-9 rounded-[11px] text-white shadow-lg"
            style={{ background: 'linear-gradient(135deg, #6B0099, #D40055, #FF8A00)' }}
          >
            <LayoutPanelTop size={18} />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold tracking-tight text-[1.15rem] leading-none text-white font-sans">Tela</span>
              <span className="text-[8px] font-mono font-extrabold tracking-[0.16em] uppercase px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                LIVING DOCUMENT STUDIO
              </span>
            </div>
            <div className="text-[8px] font-mono font-bold tracking-[.18em] text-white/50 mt-0.5 flex flex-wrap items-center gap-1.5">
              <span className="text-cyan-300">AMBO SANCTUARY</span>
              <span className="text-white/20">·</span>
              <span className="text-amber-300">ELEVATE ACADEMIA</span>
              <span className="text-white/20">·</span>
              <span className="text-pink-300">LOREA CINEMA</span>
              <span className="text-white/20">·</span>
              <span className="text-emerald-300">TV SIGNAGE & POS</span>
              <span className="text-white/20">|</span>
              <span className="text-white/40">// 120 FPS KINETIC CANVAS</span>
            </div>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          <button 
            onClick={onImport} 
            className="h-9 px-3.5 flex items-center gap-2 rounded-[10px] text-[.72rem] font-bold text-white/75 bg-white/[.05] border border-white/[0.09] hover:bg-white/[.09] hover:text-white transition-all font-sans"
            title="Import Word, PDF, Markdown, CSV, or .tela archives"
          >
            <Import size={13} />
            <span className="hidden sm:inline">Import Document</span>
          </button>

          <button 
            onClick={() => onCreate('BLANK')} 
            className="h-9 px-4 flex items-center gap-2 rounded-[10px] text-[.74rem] font-black text-white shadow-lg hover:brightness-110 active:scale-95 transition-all font-sans"
            style={{ 
              background: 'linear-gradient(135deg, #6B0099 0%, #D40055 60%, #FF8A00 100%)',
              boxShadow: '0 4px 18px rgba(212,0,85,.38)'
            }}
          >
            <FilePlus2 size={14} />
            <span>＋ New Document</span>
          </button>
        </div>
      </header>

      {/* ── Main Scroll Stage ──────────────────────────────────────────────── */}
      <main className="mx-auto max-w-[1440px] px-4 sm:px-8 pb-32 font-sans">

        {/* 1. HERO SECTION: Rotating Expressive Call to Action & Synchronized Live Showcase */}
        <section 
          className={`pt-8 pb-8 transition-all duration-1000 ease-out ${
            pageMounted ? 'opacity-100 translate-y-0 filter-none' : 'opacity-0 translate-y-8 blur-[4px]'
          }`}
          onMouseEnter={() => setIsHeroPaused(true)}
          onMouseLeave={() => setIsHeroPaused(false)}
        >
          {/* Top Kicker Bar with Rotating Capsule */}
          <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
            <div className="flex flex-wrap items-center gap-2.5">
              <div 
                className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border text-[10px] font-mono font-bold tracking-[0.2em] shadow-lg transition-all duration-500"
                style={{
                  background: `linear-gradient(135deg, ${activeHero.color}25, rgba(0,0,0,0.5))`,
                  borderColor: `${activeHero.color}60`,
                  color: activeHero.color,
                }}
              >
                <Sparkles size={12} className="animate-pulse" />
                <span>{activeHero.badge}</span>
              </div>
              <span className="hidden sm:inline text-white/20 font-mono text-xs">//</span>
              <span className="text-[9px] font-mono text-white/50 tracking-wider">
                ROTATING ARCHETYPE {activeHeroSlide + 1} OF {HERO_SLIDES.length}
              </span>
            </div>

            {/* Slide Navigation Pills */}
            <div className="flex flex-wrap items-center gap-1 p-1 rounded-[12px] bg-black/50 border border-white/10 shadow-inner">
              {HERO_SLIDES.map((slide, idx) => (
                <button
                  key={slide.id}
                  onClick={() => {
                    setActiveHeroSlide(idx);
                    setIsHeroPaused(true);
                  }}
                  className={`px-2.5 py-1 rounded-[8px] text-[8px] font-mono font-bold transition-all ${
                    activeHeroSlide === idx
                      ? 'shadow-md'
                      : 'text-white/40 hover:text-white/80'
                  }`}
                  style={{
                    background: activeHeroSlide === idx ? slide.color : 'transparent',
                    color: activeHeroSlide === idx ? '#000000' : undefined,
                  }}
                >
                  {slide.pill}
                </button>
              ))}
            </div>
          </div>

          {/* Hero Content: Left Rotating CTA + Right Synchronized Live Showcase */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            
            {/* Left Side: Expressive Headline, Emotive Revelation, and Direct Action */}
            <div key={`hero-left-${activeHero.id}`} className="lg:col-span-7 space-y-4 animate-tela-bloom">
              <h1 className="font-display italic text-[clamp(2.3rem,4.8vw,4.5rem)] leading-[0.95] tracking-[-0.035em] text-white transition-all duration-300">
                {activeHero.headline.split(' ').slice(0, -2).join(' ')}{' '}
                <span 
                  className="text-transparent bg-clip-text font-bold"
                  style={{ backgroundImage: `linear-gradient(90deg, #FFFFFF 0%, ${activeHero.color} 50%, #FFB05B 100%)` }}
                >
                  {activeHero.headline.split(' ').slice(-2).join(' ')}
                </span>
              </h1>

              <p className="text-[.92rem] leading-relaxed text-white/75 font-sans max-w-xl">
                {activeHero.subhead}
              </p>

              <p className="text-[.80rem] leading-relaxed font-mono" style={{ color: activeHero.color }}>
                {activeHero.emotive}
              </p>

              {/* Tag badges */}
              <div className="pt-1 flex flex-wrap items-center gap-1.5 text-[7.5px] font-mono">
                {activeHero.tags.map((tag, tIdx) => (
                  <span 
                    key={tIdx} 
                    className="px-2 py-0.5 rounded-[6px] border text-white"
                    style={{ background: `${activeHero.color}15`, borderColor: `${activeHero.color}35` }}
                  >
                    {tag}
                  </span>
                ))}
              </div>

              {/* Action Buttons */}
              <div className="pt-3 flex flex-wrap items-center gap-3">
                <button
                  onClick={() => onChooseTemplate(activeHero.template)}
                  className="h-11 px-5 rounded-[12px] flex items-center gap-2 text-[.78rem] font-bold text-white shadow-xl hover:brightness-110 active:scale-95 transition-all font-sans"
                  style={{
                    background: `linear-gradient(135deg, #6B0099, ${activeHero.color})`,
                    boxShadow: `0 6px 24px ${activeHero.color}40`,
                    color: '#FFFFFF'
                  }}
                >
                  <Sparkles size={14} />
                  <span>{activeHero.actionLabel}</span>
                </button>

                <button
                  onClick={() => onCreate(activeHero.kind)}
                  className="h-11 px-4 rounded-[12px] flex items-center gap-1.5 text-[.76rem] font-bold text-white/70 hover:text-white bg-white/[0.05] border border-white/10 hover:bg-white/[0.09] transition-all font-sans"
                >
                  <span>Start Blank {kinds.find(k => k.id === activeHero.kind)?.name}</span>
                  <ArrowRight size={13} />
                </button>
              </div>
            </div>

            {/* Right Side: Showcase Example Synchronized to Active CTA */}
            <div key={`hero-right-${activeHero.id}`} className="lg:col-span-5 flex justify-center animate-tela-bloom">
              <div 
                className="w-full max-w-[420px] aspect-[1/1.22] p-5 rounded-[24px] border shadow-2xl transition-all duration-500 relative flex flex-col justify-between overflow-hidden"
                style={{
                  background: `radial-gradient(circle at 85% 15%, ${activeHero.color}30, transparent 65%), linear-gradient(155deg, rgba(20, 16, 28, 0.95), rgba(10, 8, 16, 0.98))`,
                  borderColor: `${activeHero.color}40`,
                  boxShadow: `0 20px 60px rgba(0,0,0,0.6), 0 0 40px ${activeHero.color}20`
                }}
              >
                {/* Meta header of showcase */}
                <div className="flex items-center justify-between text-[8px] font-mono border-b border-white/10 pb-2.5">
                  <span className="font-bold uppercase tracking-wider" style={{ color: activeHero.color }}>
                    {activeHero.metaText}
                  </span>
                  <span className="text-white/40">120 FPS VECTOR</span>
                </div>

                {/* Main Vector Preview Body */}
                <div className="my-auto py-3">
                  {/* Real Template Vector SVG Preview */}
                  <div className="w-full aspect-[16/10] rounded-[16px] overflow-hidden bg-black/60 border border-white/10 shadow-inner relative flex items-center justify-center p-3 mb-3">
                    {activeHero.template && activeHero.template.pages && activeHero.template.pages.length > 0 ? (
                      <TelaStaticSvg 
                        objects={getRealTemplatePage(activeHero.template, 0)}
                        width={activeHero.template.width}
                        height={activeHero.template.height}
                        className="w-full h-full object-contain pointer-events-none drop-shadow-xl"
                      />
                    ) : (
                      <div className="text-center font-mono text-white/50 text-xs">
                        Loading vector showcase...
                      </div>
                    )}
                  </div>

                  <h3 className="font-bold text-[1.12rem] text-white tracking-tight leading-tight font-sans">
                    {activeHero.title}
                  </h3>
                  <p className="mt-1 text-[.74rem] text-white/60 leading-relaxed font-sans">
                    {activeHero.caption}
                  </p>
                </div>

                {/* Footer Telemetry of Showcase */}
                <div className="pt-2.5 border-t border-white/10 flex items-center justify-between text-[8px] font-mono text-white/45">
                  <span className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full animate-ping" style={{ background: activeHero.color }} />
                    LIVE DEMONSTRATION
                  </span>
                  <button 
                    onClick={() => onChooseTemplate(activeHero.template)}
                    className="hover:underline font-bold"
                    style={{ color: activeHero.color }}
                  >
                    Open Canvas ↗
                  </button>
                </div>
              </div>
            </div>

          </div>
        </section>

        {/* ── USER'S MOST RECENT DOCUMENTS & CREATIVE ACTIVITY (ELEVATED PROMINENTLY ABOVE ARCHETYPES) ── */}
        <section className="my-8">
          <ScrollReveal direction="up" distance={20}>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div className="flex items-center gap-3">
                <span className="grid place-items-center w-7 h-7 rounded-[10px] bg-fuchsia-500/20 text-fuchsia-300 border border-fuchsia-500/30">
                  <Clock3 size={15} />
                </span>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white font-sans">
                      Recent Documents & Activity
                    </h2>
                    <span className="px-2 py-0.5 rounded text-[8px] font-mono font-extrabold uppercase tracking-wider bg-white/[0.08] text-white/70 border border-white/10">
                      {recent.length} {recent.length === 1 ? 'FILE' : 'FILES'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Activity & System Telemetry Strip */}
              <div className="flex items-center gap-2 text-[9px] font-mono text-white/40">
                <span className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/25 text-emerald-300 font-semibold">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  AUTOSAVE PERSISTENT
                </span>
                <span className="hidden md:inline px-2 py-1 rounded-full bg-white/[0.04] border border-white/[0.08]">
                  LOCAL CACHE SYNCED
                </span>
              </div>
            </div>

            {recent.length ? (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5">
                {recent.slice(0, 8).map((doc, index) => (
                  <button
                    key={doc.id}
                    onClick={() => onOpen(doc.id)}
                    className="group flex items-center gap-3.5 p-3.5 rounded-[18px] text-left transition-all duration-300 hover:-translate-y-1 hover:border-fuchsia-500/40 relative overflow-hidden"
                    style={{
                      background: 'linear-gradient(155deg, rgba(28, 20, 40, 0.85) 0%, rgba(14, 11, 20, 0.95) 100%)',
                      border: '1px solid rgba(255, 255, 255, 0.10)',
                      boxShadow: '0 10px 30px rgba(0,0,0,0.35)'
                    }}
                  >
                    <span
                      className="grid place-items-center w-12 h-14 rounded-[12px] text-white/90 shadow-md group-hover:scale-105 transition-transform shrink-0"
                      style={{
                        background: index % 3 === 0 
                          ? 'linear-gradient(145deg, #6B0099, #30103E)' 
                          : index % 3 === 1 
                          ? 'linear-gradient(145deg, #174B65, #142333)' 
                          : 'linear-gradient(145deg, #9B3D2E, #382019)',
                        border: '1px solid rgba(255,255,255,0.15)'
                      }}
                    >
                      <FileText size={20} />
                    </span>

                    <span className="min-w-0 flex-1">
                      <strong className="block truncate text-[.82rem] font-bold text-white group-hover:text-fuchsia-200 transition-colors font-sans">
                        {doc.title || 'Untitled canvas'}
                      </strong>
                      <span className="mt-1 flex items-center gap-1.5 text-[9.5px] text-white/45 font-mono">
                        <Clock3 size={10} className="text-fuchsia-400" />
                        {new Date(doc.updatedAt).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          year: doc.updatedAt < Date.now() - 31_536_000_000 ? 'numeric' : undefined
                        })}
                      </span>
                    </span>

                    <span className="w-7 h-7 rounded-full bg-white/[0.04] border border-white/10 grid place-items-center text-white/30 group-hover:text-white group-hover:bg-fuchsia-500/20 group-hover:border-fuchsia-500/40 transition-all shrink-0">
                      <ArrowRight size={13} className="group-hover:translate-x-0.5 transition-transform" />
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <div 
                className="p-5 rounded-[20px] border border-white/[0.08] bg-white/[0.02] flex flex-col sm:flex-row items-center justify-between gap-4"
              >
                <div className="flex items-center gap-3 text-center sm:text-left">
                  <div className="w-10 h-10 rounded-full bg-fuchsia-500/15 border border-fuchsia-500/30 grid place-items-center text-fuchsia-300 shrink-0">
                    <FilePlus2 size={18} />
                  </div>
                  <div>
                    <h4 className="text-[.86rem] font-bold text-white font-sans">No recent canvas files yet</h4>
                    <p className="text-[.74rem] text-white/50 font-sans">
                      Start your first document below from 9 canonical archetypes or launch the 3D channel dial.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onCreate('BLANK')}
                  className="px-4 py-2 rounded-[12px] bg-white/[0.06] hover:bg-white/[0.12] border border-white/12 text-white text-[.74rem] font-bold flex items-center gap-1.5 transition-all shrink-0"
                >
                  <Plus size={13} />
                  <span>Start Blank Slate</span>
                </button>
              </div>
            )}
          </ScrollReveal>
        </section>

        {/* ── THE BELOVED FIRST CALL TO ACTION: START BY DOCUMENT TYPE (LARGE VISUAL STATEMENT) ─────── */}
        <section className="my-10">
          <ScrollReveal direction="up" distance={20}>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
              <div className="flex items-center gap-3">
                <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white font-sans">Start by document type</h2>
                <span className="text-[9px] font-mono px-2 py-0.5 rounded bg-fuchsia-500/20 text-fuchsia-300 border border-fuchsia-500/30 font-bold">
                  9 CANONICAL ARCHETYPES
                </span>
              </div>
              <span className="text-[10px] font-mono text-white/40 tracking-wider">
                // SELECT AN ARCHETYPE OR BROWSE REAL VECTOR BLUEPRINTS
              </span>
            </div>
          </ScrollReveal>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {kinds.map(({ id, name, note, superpower, icon: Icon, wash }, kIdx) => {
              const sampleTemplate = kindTemplates[id];
              const sampleObjects = sampleTemplate ? getRealTemplatePage(sampleTemplate, 0) : null;

              return (
                <ScrollReveal key={id} delay={kIdx * 45} distance={24} duration={650}>
                  <button
                    onClick={() => onCreate(id)}
                    className="w-full h-full group relative p-5 rounded-[24px] text-left transition-all duration-300 hover:-translate-y-1.5 flex flex-col justify-between overflow-hidden"
                    style={{
                      background: `radial-gradient(circle at 100% 0%, ${wash}35, transparent 65%), linear-gradient(145deg, rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0.02))`,
                      border: '1px solid rgba(255, 255, 255, 0.12)',
                      boxShadow: '0 16px 40px rgba(0,0,0,0.35)'
                    }}
                  >
                    {/* Top Header of the Card */}
                    <div>
                      <div className="flex items-center justify-between mb-2.5">
                        <div className="flex items-center gap-2.5">
                          <span 
                            className="grid place-items-center w-10 h-10 rounded-[12px] shadow-md transition-transform group-hover:scale-110"
                            style={{ background: `${wash}33`, color: wash, border: `1px solid ${wash}50` }}
                          >
                            <Icon size={19} />
                          </span>
                          <div>
                            <div className="text-[8px] font-mono font-bold tracking-widest text-white/40 uppercase">
                              CANONICAL ARCHETYPE
                            </div>
                            <div className="text-[1.05rem] font-bold tracking-tight text-white group-hover:text-fuchsia-200 transition-colors leading-tight font-sans">
                              {name}
                            </div>
                          </div>
                        </div>

                        <span className="w-8 h-8 rounded-full bg-white/[0.04] border border-white/10 grid place-items-center text-white/40 group-hover:text-white group-hover:bg-white/10 group-hover:translate-x-0.5 transition-all">
                          <ArrowRight size={14} />
                        </span>
                      </div>

                      <p className="text-[.76rem] leading-relaxed text-white/60 mb-3.5 font-sans">
                        {note}
                      </p>
                    </div>

                    {/* LARGE VISUAL STATEMENT: Template Vector Thumbnail Stage */}
                    <div className="w-full aspect-[16/10] rounded-[16px] overflow-hidden bg-black/50 border border-white/10 relative flex items-center justify-center p-2.5 group-hover:border-white/25 transition-all shadow-inner my-2">
                      {sampleTemplate && sampleObjects && sampleObjects.length > 0 ? (
                        <>
                          <TelaStaticSvg 
                            objects={sampleObjects}
                            width={sampleTemplate.width}
                            height={sampleTemplate.height}
                            className="w-full h-full object-contain pointer-events-none drop-shadow-md group-hover:scale-105 transition-transform duration-300"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-60 group-hover:opacity-20 transition-opacity pointer-events-none" />
                          <div className="absolute bottom-2 left-2.5 right-2.5 flex items-center justify-between text-[7.5px] font-mono backdrop-blur-md bg-black/60 border border-white/10 px-2.5 py-1 rounded-[8px]">
                            <span className="text-white/80 font-bold truncate max-w-[170px]">{sampleTemplate.name}</span>
                            <span className="text-cyan-300 font-bold">{sampleTemplate.width}×{sampleTemplate.height}</span>
                          </div>
                        </>
                      ) : (
                        <div className="w-full h-full rounded-[12px] border border-dashed border-white/20 bg-white/[0.02] flex flex-col items-center justify-center p-4 relative">
                          <div className="w-9 h-9 rounded-full bg-purple-500/20 border border-purple-500/40 grid place-items-center text-purple-300 mb-1.5 group-hover:scale-110 transition-transform">
                            <FilePlus2 size={18} />
                          </div>
                          <span className="text-[8.5px] font-mono text-white/70 font-bold tracking-wider">PURE BLANK SLATE</span>
                          <span className="text-[7.5px] font-mono text-purple-300/80 mt-0.5">✦ Unbounded Bézier Canvas (0,0)</span>
                        </div>
                      )}
                    </div>

                    {/* Card Footer with Superpower Pill and Action */}
                    <div className="mt-2.5 pt-2.5 border-t border-white/[0.08] flex items-center justify-between text-[8px] font-mono">
                      <span className="font-bold tracking-wide" style={{ color: wash }}>
                        ✦ {superpower}
                      </span>
                      <span 
                        onClick={(e) => {
                          if (sampleTemplate) {
                            e.stopPropagation();
                            onChooseTemplate(sampleTemplate);
                          }
                        }}
                        className="text-white/50 group-hover:text-cyan-300 flex items-center gap-1 transition-colors hover:underline cursor-pointer font-bold"
                      >
                        Launch Template <span className="text-[10px]">→</span>
                      </span>
                    </div>
                  </button>
                </ScrollReveal>
              );
            })}
          </div>

          {/* ── FAST DIRECTORIAL INTENT & MANIFEST CAPSULE ───────────────────── */}
          <ScrollReveal delay={150} distance={20}>
            <form 
              onSubmit={handleQuickManifest}
              className="mt-6 p-2 rounded-[20px] border shadow-2xl transition-all"
              style={{
                background: 'rgba(14, 11, 20, 0.90)',
                borderColor: 'rgba(255, 255, 255, 0.16)',
                boxShadow: '0 20px 50px rgba(0,0,0,0.6), 0 0 35px rgba(212,0,85,0.15)'
              }}
            >
              <div className="flex items-center gap-2 px-3 pt-1.5 pb-1">
                <span className="text-amber-400 text-xs">✨</span>
                <span className="text-[10px] font-black uppercase tracking-wider text-white/70">
                  What do you want to manifest?
                </span>
                <span className="ml-auto text-[9px] font-mono text-white/35 hidden sm:inline">
                  Type an intent or pick a fast prompt below
                </span>
              </div>

              <div className="flex flex-col sm:flex-row items-stretch gap-2">
                <input
                  type="text"
                  value={promptText}
                  onChange={e => setPromptText(e.target.value)}
                  placeholder='e.g., "Ambo Sanctuary hymnal lyric slide", "4K digital signage TV menu", "Film call sheet day 14", "Interactive worksheet"...'
                  className="flex-1 bg-white/[0.05] border border-white/[0.08] hover:border-white/[0.16] focus:border-[var(--pj-magenta,#D40055)] rounded-[14px] px-4 py-3 text-[.84rem] text-white placeholder-white/30 outline-none transition-all font-sans"
                />
                <button
                  type="submit"
                  className="h-12 px-6 flex items-center justify-center gap-2 rounded-[14px] text-[.80rem] font-black text-white shadow-lg hover:brightness-110 active:scale-95 transition-all shrink-0"
                  style={{
                    background: 'linear-gradient(135deg, #6B0099 0%, #D40055 50%, #FF8A00 100%)',
                    boxShadow: '0 4px 20px rgba(212,0,85,0.45)'
                  }}
                >
                  <Zap size={15} />
                  <span>Manifest Document</span>
                </button>
              </div>

              {/* Expressive fast prompt suggestion pills */}
              <div className="mt-2 pt-2 border-t border-white/[0.06] flex items-center gap-1.5 overflow-x-auto px-2 pb-0.5 custom-scrollbar text-[8px] font-mono">
                <span className="text-white/30 shrink-0">TRY:</span>
                {[
                  { label: '🎙️ Sanctuary Hymnal Slide', q: 'Ambo Sanctuary hymnal lyric slide' },
                  { label: '🏪 Cafe 4K TV Menu', q: '4K digital signage TV menu board' },
                  { label: '🎬 Noir Screenplay Treatment', q: 'Courier 12pt film screenplay script' },
                  { label: '📚 Ocean Picture Book', q: 'Children picture book watercolor' },
                  { label: '🎓 Chemistry Lab Worksheet', q: 'Interactive chemistry equation worksheet' },
                  { label: '📊 Quarterly Cap Table', q: 'Annual executive review dossier' },
                ].map((p, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setPromptText(p.q)}
                    className="shrink-0 px-2 py-0.5 rounded-full bg-white/[0.04] hover:bg-white/[0.09] text-white/50 hover:text-white border border-white/[0.07] transition-colors"
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </form>
          </ScrollReveal>
        </section>

        {/* 2. THE LIVING TEMPLATE CAROUSEL & 3D CHANNEL DIAL (NEAR THE TOP!) ─── */}
        <section className="my-10">
          <ScrollReveal distance={32}>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
              <div>
                <div className="flex items-center gap-2 text-[9px] font-mono font-bold tracking-[.2em] text-fuchsia-300 uppercase">
                  <Sparkles size={11} className="text-amber-400" />
                  <span>LIVING TEMPLATE LIBRARY & 3D DIAL</span>
                </div>
                <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-white font-sans mt-0.5">
                  Living Template Channels & Shelves
                </h2>
              </div>

              {/* Mode Toggle */}
              <div className="flex items-center gap-1 p-1 rounded-[12px] bg-white/[0.05] border border-white/10">
              <button
                onClick={() => setTemplateView('dial')}
                className={`px-3 py-1.5 rounded-[9px] text-[.74rem] font-bold transition-all ${
                  templateView === 'dial' 
                    ? 'bg-gradient-to-r from-[#6B0099] to-[#D40055] text-white shadow-md' 
                    : 'text-white/50 hover:text-white'
                }`}
              >
                📺 3D Channel Dial
              </button>
              <button
                onClick={() => setTemplateView('shelves')}
                className={`px-3 py-1.5 rounded-[9px] text-[.74rem] font-bold transition-all ${
                  templateView === 'shelves' 
                    ? 'bg-gradient-to-r from-[#6B0099] to-[#D40055] text-white shadow-md' 
                    : 'text-white/50 hover:text-white'
                }`}
              >
                ✦ Multi-Row Shelves
              </button>
              <button
                onClick={() => setTemplateView('grid')}
                className={`px-3 py-1.5 rounded-[9px] text-[.74rem] font-bold transition-all ${
                  templateView === 'grid' 
                    ? 'bg-gradient-to-r from-[#6B0099] to-[#D40055] text-white shadow-md' 
                    : 'text-white/50 hover:text-white'
                }`}
              >
                <Grid size={13} className="inline mr-1" />
                Full Grid View
              </button>
            </div>
          </div>

          {/* VIEW MODE A: 3D Single Channel Dial (Physical 3D Movement with Mouse Wheel) */}
          {templateView === 'dial' && (
            <div className="py-2">
              <TelaChannelDial 
                onUse={onChooseTemplate} 
                onOpenFullGallery={() => setTemplateView('grid')} 
              />
            </div>
          )}

          {/* VIEW MODE B: Multi-Row Shelves with Mouse Scroll Wheel Navigation */}
          {templateView === 'shelves' && (
            <div className="space-y-4">
              {/* Row 1: Ambo Sacred & Worship Broadcast Slides */}
              <TelaCarouselRow
                title="Ambo Sacred & Worship Broadcast Slides"
                subtitle="10 Council-authored hymnal & kinetic lyric looks, 4K sermon cards, scripture looks, and prayer slides"
                badge="AMBO SACRED"
                accentColor="#00DAF3"
                icon={Tv}
                templates={amboTemplates}
                onUse={onChooseTemplate}
              />

              {/* Row 2: The Living Story Books & Illustrated Folios */}
              <TelaCarouselRow
                title="The Living Story Books & Illustrated Folios"
                subtitle="Children's picture books, comics, manga folios with animated vector characters and storybook drop caps"
                badge="LIVING FOLIOS"
                accentColor="#F59E0B"
                icon={BookOpen}
                templates={storybookTemplates}
                onUse={onChooseTemplate}
              />

              {/* Row 3: Motion Graphics, .Lottie & Broadcast Titling */}
              <TelaCarouselRow
                title="Motion Graphics, .Lottie & Broadcast Titling"
                subtitle="Fabula broadcast lower thirds, chyrons, kinetic title cards, and animated .lottie overlay badges"
                badge="MOTION GRAPHICS"
                accentColor="#EC4899"
                icon={Clapperboard}
                templates={lottieMotionTemplates}
                onUse={onChooseTemplate}
              />

              {/* Row 4: Small Business Operations, Menus & POS */}
              <TelaCarouselRow
                title="Small Business Operations, Menus & POS"
                subtitle="4K TV digital signage menu boards, cafe price lists, retail promo posters, and printable POS receipts"
                badge="SMALL BIZ & POS"
                accentColor="#10B981"
                icon={Store}
                templates={smallBizTemplates}
                onUse={onChooseTemplate}
              />

              {/* Row 5: Plajah Academia, Lessons & Research */}
              <TelaCarouselRow
                title="Plajah Academia, Lessons & Research"
                subtitle="Self-grading student worksheets, academic syllabi, scientific research notebooks, and lecture folios"
                badge="ACADEMIA"
                accentColor="#F59E0B"
                icon={GraduationCap}
                templates={academiaTemplates}
                onUse={onChooseTemplate}
              />

              {/* Row 6: Data Visualization, Cap Tables & Financial Grids */}
              <TelaCarouselRow
                title="Data Visualization, Cap Tables & Financial Grids"
                subtitle="Live reactive formula wire charts, operations dossiers, executive cap tables, and research graphs"
                badge="REACTIVE DATA"
                accentColor="#2563EB"
                icon={FileBarChart}
                templates={dataVizTemplates}
                onUse={onChooseTemplate}
              />

              {/* Row 7: The Social Network: Broadsides & Carousels */}
              <TelaCarouselRow
                title="The Social Network: Broadsides & Carousels"
                subtitle="Multi-slide feed carousels, announcement drops, event notices, quote cards, and creator portfolios"
                badge="SOCIAL FEED"
                accentColor="#A855F7"
                icon={Share2}
                templates={socialTemplates}
                onUse={onChooseTemplate}
              />

              {/* Row 8: Design History Eras & Typographic Canons */}
              <TelaCarouselRow
                title="Design History Eras & Typographic Canons"
                subtitle="Bauhaus 1923, Swiss International Grid, Italian Futurism, Russian Constructivism, Punk Zine & Memphis"
                badge="ART HISTORY"
                accentColor="#FF8A00"
                icon={Compass}
                templates={historyTemplates}
                onUse={onChooseTemplate}
              />
            </div>
          )}

          {/* VIEW MODE C: Full Grid */}
          {templateView === 'grid' && (
            <div className="rounded-[22px] overflow-hidden border border-white/10">
              <TelaTemplateGallery onUse={onChooseTemplate} />
            </div>
          )}
          </ScrollReveal>
        </section>

        {/* 3. INTERACTIVE MULTI-WORKFLOW LABORATORY ─────────────────────────── */}
        <section className="my-10">
          <ScrollReveal distance={32}>
            <div 
              className="p-5 sm:p-7 rounded-[26px] border relative overflow-hidden transition-all"
              style={{
                background: 'linear-gradient(145deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)',
                borderColor: 'rgba(255, 255, 255, 0.12)',
                boxShadow: '0 20px 60px rgba(0,0,0,0.4)'
              }}
            >
            {/* Laboratory Header */}
            <div className="flex flex-wrap items-center justify-between gap-4 mb-5 pb-4 border-b border-white/[0.08]">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-cyan-400">
                    INTERACTIVE WORKFLOW LABORATORY
                  </span>
                  <span className="px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 text-[8px] font-mono font-bold animate-pulse">
                    ● REAL-WORLD OPERATIONS
                  </span>
                </div>
                <h3 className="text-xl sm:text-2xl font-bold tracking-tight text-white font-sans mt-0.5">
                  Experience How Tela Operates in Daily Life
                </h3>
              </div>

              {/* Soundscape Visualizer Badge */}
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-purple-950/40 border border-purple-800/40">
                <button 
                  onClick={() => setIsPlayingAudio(!isPlayingAudio)}
                  className="text-purple-300 hover:text-white transition-colors"
                  title="Toggle Soundscape Bed"
                >
                  {isPlayingAudio ? <Volume2 size={14} /> : <VolumeX size={14} />}
                </button>
                <div className="flex items-center gap-0.5 h-3">
                  {[40, 80, 55, 95, 70, 30].map((h, i) => (
                    <span 
                      key={i} 
                      className={`w-0.5 rounded-full bg-purple-400 ${isPlayingAudio ? 'animate-pulse' : 'opacity-30'}`}
                      style={{ height: isPlayingAudio ? `${h}%` : '20%', animationDelay: `${i * 120}ms` }}
                    />
                  ))}
                </div>
                <span className="text-[8.5px] font-mono text-purple-200/80">
                  432Hz Ambient Bed
                </span>
              </div>
            </div>

            {/* Workflow Mode Tabs */}
            <div className="flex gap-2 overflow-x-auto pb-3 custom-scrollbar">
              {[
                { id: 'AMBO', label: '🎙️ Ambo: Live Lyric Sync', tag: 'WORSHIP' },
                { id: 'SHADERS', label: '🔮 Shaders & Quantum Waves', tag: 'ART COUNCIL' },
                { id: 'LOTTIE_MOTION', label: '🎬 Motion Graphics & .Lottie', tag: 'CINEMA' },
                { id: 'STORYBOOK', label: '📖 The Living Story Books', tag: 'FOLIO' },
                { id: 'DATA_VIZ', label: '📊 Reactive Data Viz & Wires', tag: 'ANALYTICS' },
                { id: 'SMALL_BIZ', label: '🏪 Small Biz: TV Menu & POS', tag: 'RETAIL' },
                { id: 'ACADEMIA', label: '🎓 Academia: Self-Grading Worksheet', tag: 'EDUCATION' },
                { id: 'SOCIAL', label: '🌐 Social Network: Feed Carousel', tag: 'COMMUNITY' },
              ].map(tab => {
                const isSel = activeWorkflow === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveWorkflow(tab.id as any)}
                    className="shrink-0 h-9 px-3.5 rounded-[12px] flex items-center gap-2 text-[.74rem] font-bold font-mono transition-all"
                    style={{
                      background: isSel 
                        ? 'linear-gradient(135deg, #6B0099, #D40055)' 
                        : 'rgba(255, 255, 255, 0.04)',
                      color: isSel ? '#FFFFFF' : 'rgba(255, 255, 255, 0.6)',
                      border: `1px solid ${isSel ? 'rgba(212,0,85,0.6)' : 'rgba(255, 255, 255, 0.08)'}`,
                      boxShadow: isSel ? '0 4px 15px rgba(212,0,85,0.35)' : 'none'
                    }}
                  >
                    <span>{tab.label}</span>
                    <span className="text-[7.5px] px-1 py-0.2 rounded bg-black/40 text-white/50">{tab.tag}</span>
                  </button>
                );
              })}
            </div>

            {/* ── TAB 1: AMBO LIVE LYRIC SYNC & HYMNAL TYPOGRAPHY ─────────────── */}
            {activeWorkflow === 'AMBO' && (
              <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center mt-4">
                {/* Left Controller */}
                <div className="md:col-span-5 p-5 rounded-[20px] bg-black/50 border border-white/10 shadow-inner space-y-3 font-mono text-xs">
                  <div className="flex items-center justify-between text-[9px] text-cyan-400 font-bold">
                    <span>AMBO BROADCAST // CHORA LYRIC SYNC</span>
                    <span className="text-emerald-400">● 4K PROGRAM OUT</span>
                  </div>

                  {/* Song Picker */}
                  <div>
                    <label className="text-[9px] text-white/50 block mb-1">Select Hymn / Song</label>
                    <select
                      value={selectedSongId}
                      onChange={e => {
                        setSelectedSongId(e.target.value as any);
                        setLyricLineIndex(0);
                        setLyricWordProgress(0);
                      }}
                      className="w-full bg-white/[0.06] border border-white/10 rounded-[10px] px-3 py-2 text-[.80rem] text-white outline-none focus:border-cyan-500 font-sans cursor-pointer"
                    >
                      {AMBO_SHOWCASE_SONGS.map(s => (
                        <option key={s.id} value={s.id} className="bg-neutral-900 text-white">
                          {s.title} ({s.artist})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Council Style Picker */}
                  <div>
                    <div className="flex justify-between text-[9px] text-white/50 mb-1">
                      <span>Council Style ({AMBO_LYRIC_STYLES.length} Looks)</span>
                      <span className="text-amber-300 font-bold">
                        {AMBO_LYRIC_STYLES.find(st => st.id === selectedLyricStyle)?.council}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                      {AMBO_LYRIC_STYLES.map(st => (
                        <button
                          key={st.id}
                          onClick={() => setSelectedLyricStyle(st.id as any)}
                          className={`px-2 py-1.5 rounded-[8px] text-[8px] font-mono text-left transition-all truncate ${
                            selectedLyricStyle === st.id
                              ? 'bg-cyan-500/25 border border-cyan-400 text-cyan-200 font-bold shadow-sm'
                              : 'bg-white/[0.04] border border-white/[0.08] text-white/60 hover:text-white'
                          }`}
                        >
                          {st.name}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Line Stepper & Scrubber */}
                  <div>
                    <div className="flex justify-between text-[9px] text-white/50 mb-1">
                      <span>Sung Line Progress</span>
                      <span className="text-cyan-300 font-bold">
                        Line {lyricLineIndex + 1} of {activeSong.lines.length} ({Math.round(lyricWordProgress * 100)}%)
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.02}
                      value={lyricWordProgress}
                      onChange={e => setLyricWordProgress(Number(e.target.value))}
                      className="w-full accent-cyan-400 bg-white/10 rounded-lg cursor-pointer h-1.5"
                    />
                  </div>

                  {/* Controls */}
                  <div className="pt-2 flex items-center justify-between">
                    <button
                      onClick={() => setIsLyricPlaying(!isLyricPlaying)}
                      className="h-9 px-4 rounded-[10px] flex items-center gap-2 text-[.74rem] font-bold text-white shadow-md active:scale-95 transition-all"
                      style={{ background: isLyricPlaying ? '#00DAF3' : 'linear-gradient(135deg, #6B0099, #D40055)', color: isLyricPlaying ? '#000' : '#fff' }}
                    >
                      {isLyricPlaying ? <Pause size={13} /> : <Play size={13} />}
                      <span>{isLyricPlaying ? 'Pause Sync' : 'Follow Vocalist'}</span>
                    </button>

                    <div className="flex gap-1.5">
                      <button
                        onClick={() => {
                          setLyricLineIndex(i => (i - 1 + activeSong.lines.length) % activeSong.lines.length);
                          setLyricWordProgress(0);
                        }}
                        className="px-2.5 py-1.5 rounded-[8px] bg-white/[0.06] border border-white/10 text-white/70 hover:text-white text-[8px] font-bold"
                      >
                        Prev Line
                      </button>
                      <button
                        onClick={() => {
                          setLyricLineIndex(i => (i + 1) % activeSong.lines.length);
                          setLyricWordProgress(0);
                        }}
                        className="px-2.5 py-1.5 rounded-[8px] bg-white/[0.06] border border-white/10 text-white/70 hover:text-white text-[8px] font-bold"
                      >
                        Next Line
                      </button>
                    </div>
                  </div>

                  <div className="pt-1 border-t border-white/[0.08] flex items-center justify-between text-[7.5px] text-white/40">
                    <span>TIMING: CHORA 432Hz BUS</span>
                    <span className="text-amber-400 font-bold">SDI/NDI LOW-LATENCY</span>
                  </div>
                </div>

                {/* Right 16:9 Ambo Program Output Display */}
                <div className="md:col-span-7 p-4 sm:p-5 rounded-[22px] bg-black/70 border border-white/12 shadow-2xl relative overflow-hidden">
                  <div className="flex items-center justify-between mb-2 text-[8px] font-mono text-white/50">
                    <span className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping"></span>
                      AMBO OUTPUT WINDOW 1 (1920×1080 4K PROGRAM)
                    </span>
                    <span className="text-cyan-300 font-bold uppercase">{selectedLyricStyle} STYLE</span>
                  </div>

                  {/* 16:9 Monitor Frame */}
                  <div 
                    className="relative w-full aspect-[16/9] rounded-[16px] overflow-hidden flex flex-col justify-between p-6 sm:p-8 border border-white/15 shadow-2xl"
                    style={{
                      background: lyricBackdrop === 'SANCTUARY'
                        ? 'radial-gradient(ellipse at 50% 20%, #1e1338 0%, #0c0814 75%, #050308 100%)'
                        : 'linear-gradient(135deg, #0d131f 0%, #06090e 100%)'
                    }}
                  >
                    {/* Top Meta Header */}
                    <div className="flex items-center justify-between text-[8px] font-mono tracking-widest text-white/50">
                      <span className="px-2 py-0.5 rounded bg-black/50 border border-white/10 text-cyan-300 font-bold">
                        {activeSong.title}
                      </span>
                      <span>{activeSong.key}</span>
                    </div>

                    {/* Render style: Sanctuary Lower Third */}
                    {selectedLyricStyle === 'sanctuary' && (
                      <div className="my-auto text-center space-y-3">
                        <div 
                          className="font-display italic text-[clamp(1.2rem,2.8vw,2.1rem)] text-[#FAF8EE] font-bold leading-tight transition-all duration-300"
                          style={{ textShadow: '0 4px 20px rgba(0,0,0,0.8)' }}
                        >
                          "{currentLyricLine.text}"
                        </div>
                        {/* Golden hairline rule */}
                        <div className="h-[1.5px] bg-gradient-to-r from-transparent via-[#D4AF37] to-transparent w-48 sm:w-80 mx-auto opacity-80" />
                        {/* Next line small caps cue */}
                        <div className="text-[9px] sm:text-[11px] font-serif uppercase tracking-[0.22em] text-[#D5CBBA]/75">
                          {nextLyricLine.text}
                        </div>
                      </div>
                    )}

                    {/* Render style: Karaoke Sweep */}
                    {selectedLyricStyle === 'karaoke' && (
                      <div className="my-auto text-center space-y-4">
                        {/* Fading previous line */}
                        <div className="text-[.85rem] text-white/30 font-bold blur-[0.3px] transition-all">
                          {prevLyricLine.text}
                        </div>
                        {/* Active line with per-word fill */}
                        <div className="text-[clamp(1.3rem,3.2vw,2.3rem)] font-black tracking-tight flex flex-wrap justify-center gap-x-2.5">
                          {currentLyricLine.text.split(' ').map((wd, wIdx, arr) => {
                            const wordThreshold = (wIdx + 1) / arr.length;
                            const isSung = lyricWordProgress >= wordThreshold - 0.15;
                            return (
                              <span 
                                key={wIdx}
                                className="transition-all duration-200"
                                style={{
                                  color: isSung ? '#FFB05B' : 'rgba(255,255,255,0.38)',
                                  textShadow: isSung ? '0 0 16px rgba(255,176,91,0.6)' : 'none',
                                  transform: isSung ? 'scale(1.05)' : 'scale(1)'
                                }}
                              >
                                {wd}
                              </span>
                            );
                          })}
                        </div>
                        {/* Waiting next line */}
                        <div className="text-[.85rem] text-white/35 font-bold">
                          {nextLyricLine.text}
                        </div>
                      </div>
                    )}

                    {/* Render style: Gilded Gold */}
                    {selectedLyricStyle === 'gilded' && (
                      <div className="my-auto p-4 sm:p-6 rounded-[14px] border border-[#D4AF37]/40 bg-black/40 backdrop-blur-md relative">
                        <div className="absolute top-2 left-2 text-[#D4AF37] text-xs">✦</div>
                        <div className="absolute top-2 right-2 text-[#D4AF37] text-xs">✦</div>
                        <div className="flex items-start gap-4">
                          <span className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#D4AF37] to-[#8C6D23] text-black font-display font-black text-2xl grid place-items-center shadow-lg shrink-0">
                            {currentLyricLine.text.charAt(0)}
                          </span>
                          <div>
                            <div className="font-display italic text-[1.2rem] sm:text-[1.6rem] text-[#FDFBF7] font-bold leading-tight">
                              {currentLyricLine.text.slice(1)}
                            </div>
                            <div className="mt-2 text-[9px] font-mono text-[#D4AF37]/90 tracking-wider">
                              FOLIO VERSE {lyricLineIndex + 1} // SACRED ILLUMINATION
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Render style: Word Stack */}
                    {selectedLyricStyle === 'stack' && (
                      <div className="my-auto text-left max-w-md mx-auto">
                        <div className="text-[8px] font-mono text-cyan-400 font-bold uppercase mb-1">CHORA WORD STACK</div>
                        <div className="font-sans font-black text-[clamp(1.4rem,3.4vw,2.4rem)] uppercase leading-[0.95] text-white tracking-tighter">
                          {currentLyricLine.text}
                        </div>
                        <div className="mt-2 text-[10px] font-mono text-white/40 border-l-2 border-cyan-400 pl-2">
                          NEXT: {nextLyricLine.text}
                        </div>
                      </div>
                    )}

                    {/* Render style: Neon Signal */}
                    {selectedLyricStyle === 'neon' && (
                      <div className="my-auto text-center space-y-2">
                        <div 
                          className="font-mono text-[clamp(1.2rem,2.8vw,2.2rem)] font-black text-[#00DAF3] tracking-widest uppercase transition-all"
                          style={{ textShadow: '0 0 10px #00DAF3, 0 0 25px rgba(0,218,243,0.5)' }}
                        >
                          {currentLyricLine.text}
                        </div>
                        <div className="text-[9px] font-mono text-pink-400/80 tracking-widest uppercase">
                          CYBER-BROADCAST TUBE // 60 FPS
                        </div>
                      </div>
                    )}

                    {/* Bottom Progress Bar */}
                    <div className="pt-2 border-t border-white/10 flex items-center justify-between text-[7px] font-mono text-white/40">
                      <span>CHORA BUS SYNC // LIVE CUE {lyricLineIndex + 1}</span>
                      <span className="text-cyan-300 font-bold">100% VECTOR RESISTANT</span>
                    </div>
                  </div>

                  {/* Real Ambo Template Integration Bar */}
                  <div className="mt-3 p-3 rounded-[14px] bg-white/[0.04] border border-cyan-500/20 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-cyan-400"></span>
                      <span className="text-[8.5px] font-mono text-cyan-200 font-bold">
                        REAL TEMPLATE: {labAmboTemplate.name}
                      </span>
                      <span className="text-[7.5px] font-mono text-white/40">
                        ({labAmboTemplate.width}×{labAmboTemplate.height} · {labAmboTemplate.group})
                      </span>
                    </div>
                    <button
                      onClick={() => onChooseTemplate(labAmboTemplate)}
                      className="px-3 py-1.5 rounded-[9px] text-[8px] font-bold text-white shadow-md active:scale-95 transition-all flex items-center gap-1.5"
                      style={{ background: 'linear-gradient(135deg, #00DAF3, #2563EB)', color: '#000' }}
                    >
                      <Sparkles size={11} />
                      <span>✦ Open Real Ambo Template in Tela Studio</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ── TAB 2: HARDWARE-ACCELERATED SHADERS & VISUALIZERS ────────── */}
            {activeWorkflow === 'SHADERS' && (
              <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center mt-4">
                <div className="md:col-span-5 p-5 rounded-[20px] bg-black/50 border border-white/10 shadow-inner space-y-3 font-mono text-xs">
                  <div className="flex items-center justify-between text-[9px] text-fuchsia-400 font-bold">
                    <span>THE ART COUNCIL FLEX // LIVE SHADER NODE</span>
                    <span className="text-emerald-400">● 120 FPS WEBGL2</span>
                  </div>

                  <p className="text-[.76rem] font-sans text-white/70 leading-relaxed">
                    Tela documents are not static printed paper trapped on a screen. Every document natively hosts procedural WebGL and Canvas shaders, quantum probability wave interference, and real-time audio FFT spectral visualizers as first-class vector layers.
                  </p>

                  <div className="p-3 rounded-xl bg-white/[0.04] border border-white/[0.08] space-y-1.5 text-[8.5px]">
                    <div className="flex justify-between text-white/60">
                      <span>ENGINE:</span> <span className="text-amber-300 font-bold">GLSL PROCEDURAL CORE</span>
                    </div>
                    <div className="flex justify-between text-white/60">
                      <span>REFRESH RATE:</span> <span className="text-emerald-400 font-bold">120 HZ LOW-LATENCY</span>
                    </div>
                    <div className="flex justify-between text-white/60">
                      <span>INTERACTIVITY:</span> <span className="text-cyan-300 font-bold">CLICK SHOCKWAVE / MOUSE RIPPLE</span>
                    </div>
                    <div className="flex justify-between text-white/60">
                      <span>DOC INTEGRATION:</span> <span className="text-fuchsia-300 font-bold">ZERO IFRAMES · NATIVE NODE</span>
                    </div>
                  </div>

                  <div className="pt-2 space-y-2">
                    <button
                      onClick={() => onChooseTemplate(labShaderTemplate)}
                      className="w-full h-9 px-4 rounded-[10px] flex items-center justify-center gap-2 text-[.74rem] font-bold text-white shadow-md active:scale-95 transition-all"
                      style={{ background: 'linear-gradient(135deg, #6B0099, #D40055)' }}
                    >
                      <Sparkles size={14} />
                      <span>✦ Open Real Bauhaus Canvas in Tela Studio</span>
                    </button>
                    <div className="flex items-center justify-between text-[8px] text-white/45 font-mono">
                      <span>Vector Host: {labShaderTemplate.name}</span>
                      <span className="text-amber-300 font-bold">120 FPS GPU Core</span>
                    </div>
                  </div>
                </div>

                <div className="md:col-span-7">
                  {/* Embedded Shader Canvas in Illuminated Manuscript Folio */}
                  <div className="p-3.5 sm:p-5 rounded-[24px] bg-[#0E0B14] border border-amber-400/30 shadow-2xl relative">
                    <div className="flex items-center justify-between text-[8px] font-mono text-amber-300/80 mb-2.5">
                      <span>ILLUMINATED FOLIO · PAGE 3 // ROYAL ASTROLABE TREATISE</span>
                      <span>FIG 1.4 PROCEDURAL WAVE FORM</span>
                    </div>
                    
                    <div className="h-[280px] sm:h-[340px] rounded-[16px] overflow-hidden border border-white/15 shadow-inner">
                      <TelaShaderCanvas initialMode="CHROMATIC_FLUID" />
                    </div>

                    <div className="mt-2.5 flex items-center justify-between text-[8px] font-mono text-white/40">
                      <span>Click the canvas above to emit chromatic shockwaves</span>
                      <span className="text-amber-400 font-bold">COORD: [120, 240, 720, 480]</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── TAB 3: FILM PRODUCTION, CALL SHEET & MOTION GRAPHICS ───────── */}
            {activeWorkflow === 'LOTTIE_MOTION' && (
              <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center mt-4">
                <div className="md:col-span-5 p-5 rounded-[20px] bg-black/50 border border-white/10 shadow-inner space-y-3 font-mono text-xs">
                  <div className="flex items-center justify-between text-[9px] text-pink-400 font-bold">
                    <span>FABULA 4K CINEMATIC LOWER THIRD</span>
                    <span>60 FPS VECTOR ALPHA</span>
                  </div>

                  <div>
                    <label className="text-[9px] text-white/50 block mb-1">Production Title</label>
                    <input
                      type="text"
                      value={filmTitle}
                      onChange={e => setFilmTitle(e.target.value)}
                      className="w-full bg-white/[0.06] border border-white/10 rounded-[10px] px-3 py-2 text-[.80rem] text-white outline-none focus:border-pink-500 font-sans"
                    />
                  </div>

                  <div>
                    <label className="text-[9px] text-white/50 block mb-1">Call Time & Day</label>
                    <input
                      type="text"
                      value={filmCallTime}
                      onChange={e => setFilmCallTime(e.target.value)}
                      className="w-full bg-white/[0.06] border border-white/10 rounded-[10px] px-3 py-2 text-[.80rem] text-white outline-none focus:border-pink-500 font-sans"
                    />
                  </div>

                  <div className="pt-2 flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <button
                        onClick={() => setIsMotionPlaying(!isMotionPlaying)}
                        className="h-9 px-4 rounded-[10px] flex items-center gap-2 text-[.74rem] font-bold text-white shadow-md transition-all active:scale-95"
                        style={{ background: isMotionPlaying ? '#D40055' : 'linear-gradient(135deg, #6B0099, #D40055)' }}
                      >
                        {isMotionPlaying ? <Pause size={14} /> : <Play size={14} />}
                        <span>{isMotionPlaying ? 'Pause Keyframes' : 'Play Fabula Motion'}</span>
                      </button>
                      <span className="text-[9px] text-emerald-400 font-bold">● 60 FPS KEYFRAME EASING</span>
                    </div>

                    <button
                      onClick={() => onChooseTemplate(labMotionTemplate)}
                      className="w-full h-8 px-3 rounded-[9px] flex items-center justify-center gap-1.5 text-[.72rem] font-bold text-pink-200 bg-pink-500/15 border border-pink-500/30 hover:bg-pink-500/25 transition-all active:scale-95"
                    >
                      <Sparkles size={12} />
                      <span>✦ Open Real Lower Third in Tela Studio ({labMotionTemplate.name})</span>
                    </button>
                  </div>
                </div>

                <div className="md:col-span-7 p-5 rounded-[20px] bg-black/60 border border-white/12 shadow-2xl relative overflow-hidden">
                  <div className="flex items-center justify-between mb-3 text-[9px] font-mono text-white/50">
                    <span>FABULA 4K CINEMATIC TITLE OVERLAY</span>
                    <span className="text-pink-400 font-bold">KEYFRAME: {motionTime}s / 2.4s</span>
                  </div>

                  <div 
                    className="relative w-full aspect-[16/9] rounded-[14px] overflow-hidden flex flex-col justify-end p-5"
                    style={{
                      background: 'radial-gradient(circle at 70% 30%, #200e1f 0%, #09030c 100%)',
                      border: '1px solid rgba(255,255,255,0.1)'
                    }}
                  >
                    <div className="absolute top-4 left-4 font-mono text-[8px] text-white/40">
                      SCENE 14 // INT. BIO-ARCHIVE // CALL: {filmCallTime}
                    </div>

                    <div 
                      className="relative z-10 transition-all duration-300"
                      style={{
                        transform: motionTime > 0.1 
                          ? `translateX(${Math.min(0, (motionTime - 0.5) * 40)}px)` 
                          : 'translateX(-120%)',
                        opacity: motionTime > 0.05 ? 1 : 0
                      }}
                    >
                      <div className="p-3 sm:p-4 rounded-[14px] backdrop-blur-xl border border-white/20 shadow-2xl max-w-md" style={{ background: 'linear-gradient(135deg, rgba(35, 12, 30, 0.9), rgba(15, 6, 14, 0.95))' }}>
                        <div className="text-[8px] font-mono text-pink-400 font-bold">DIRECTED BY LOREA STUDIOS</div>
                        <div className="font-display italic text-[1.25rem] font-bold text-white tracking-tight mt-0.5">{filmTitle}</div>
                        <div className="text-[.70rem] text-white/70 font-mono mt-0.5">PRINCIPAL PHOTOGRAPHY DAY 14</div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center gap-3">
                    <span className="text-[8px] font-mono text-white/40">IN: 0.0s</span>
                    <input
                      type="range"
                      min={0}
                      max={2.4}
                      step={0.1}
                      value={motionTime}
                      onChange={e => setMotionTime(Number(e.target.value))}
                      className="flex-1 accent-pink-400 bg-white/10 rounded-lg cursor-pointer h-1.5"
                    />
                    <span className="text-[8px] font-mono text-white/40">OUT: 2.4s</span>
                  </div>
                </div>
              </div>
            )}

            {/* ── TAB 4: THE LIVING STORY BOOKS & COMICS ─────────────────────── */}
            {activeWorkflow === 'STORYBOOK' && (
              <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center mt-4">
                <div className="md:col-span-5 p-5 rounded-[20px] bg-black/50 border border-white/10 shadow-inner space-y-3 font-mono text-xs">
                  <div className="flex items-center justify-between text-[9px] text-amber-300 font-bold">
                    <span>THE LIVING STORY BOOKS // VECTOR COMICS</span>
                    <span>CHILDREN’S FOLIO</span>
                  </div>

                  <p className="text-[.76rem] font-sans text-white/70 leading-relaxed">
                    Interactive picture books, comics, and manga brought alive with animated vector characters, responsive dialogue balloons, and ambient touchpoint soundscapes.
                  </p>

                  <div>
                    <label className="text-[9px] text-white/50 block mb-1">Turn Real Template Page</label>
                    <div className="flex gap-2">
                      {[0, 1, 2].map(pIdx => (
                        <button
                          key={pIdx}
                          onClick={() => setStorybookPage(pIdx)}
                          className={`flex-1 py-1.5 rounded-[9px] text-[8.5px] font-bold font-mono transition-all ${
                            storybookPage === pIdx
                              ? 'bg-amber-500 text-black shadow-md'
                              : 'bg-white/[0.06] text-white/60 hover:text-white'
                          }`}
                        >
                          Page {pIdx + 1}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="text-[9px] text-white/50 block mb-1">Stargazer Mood</label>
                    <div className="flex gap-2">
                      {(['CURIOUS', 'AMAZED', 'DREAMING'] as const).map(mood => (
                        <button
                          key={mood}
                          onClick={() => setStargazerMood(mood)}
                          className={`flex-1 py-1 rounded-[8px] text-[8px] font-mono font-bold transition-all ${
                            stargazerMood === mood
                              ? 'bg-purple-500 text-white shadow-sm'
                              : 'bg-white/[0.04] text-white/50 hover:text-white'
                          }`}
                        >
                          {mood}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="pt-2">
                    <label className="text-[9px] text-white/50 block mb-1">Interactive Sound Triggers</label>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setStorybookSound('✨ Stardust Chimes')}
                        className="flex-1 py-1.5 rounded-[8px] bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[8px] font-bold hover:bg-amber-500/30 transition-colors"
                      >
                        ✨ Stardust
                      </button>
                      <button
                        onClick={() => setStorybookSound('🚀 Nebula Jet')}
                        className="flex-1 py-1.5 rounded-[8px] bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-[8px] font-bold hover:bg-cyan-500/30 transition-colors"
                      >
                        🚀 Nebula
                      </button>
                    </div>
                    {storybookSound && (
                      <div className="mt-1.5 text-[8px] font-mono text-emerald-400">
                        Triggered: {storybookSound}
                      </div>
                    )}
                  </div>
                </div>

                {/* Right Storybook Folio Card rendering REAL vector template */}
                <div className="md:col-span-7 p-5 rounded-[22px] bg-[#120D1F] border border-amber-300/30 shadow-2xl relative flex flex-col justify-between">
                  <div className="flex items-center justify-between text-[8px] font-mono text-amber-300/80 pb-2 border-b border-white/10 mb-3">
                    <span className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"></span>
                      REAL VECTOR SPREAD // {labStoryTemplate.name.toUpperCase()} ({labStoryTemplate.group})
                    </span>
                    <span>PAGE {storybookPage + 1} OF {Math.max(3, labStoryTemplate.pages?.length || 1)}</span>
                  </div>

                  {/* Render the actual vector objects from the real template */}
                  <div className="w-full aspect-[4/3] rounded-[16px] overflow-hidden bg-black/40 border border-white/10 shadow-inner relative flex items-center justify-center p-3">
                    {labStoryTemplate.pages && labStoryTemplate.pages.length > 0 ? (
                      <TelaStaticSvg 
                        objects={getRealTemplatePage(labStoryTemplate, Math.min(storybookPage, (labStoryTemplate.pages?.length || 1) - 1))} 
                        width={labStoryTemplate.width} 
                        height={labStoryTemplate.height} 
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <div className="text-center font-mono text-white/60 text-xs">
                        Loading vector template...
                      </div>
                    )}
                  </div>

                  <div className="pt-3 border-t border-white/10 flex flex-wrap items-center justify-between gap-2 mt-3">
                    <div className="text-[8px] font-mono text-white/50">
                      <span>AUDIENCE: {labStoryTemplate.audience || 'Ages 6–8'}</span>
                      <span className="mx-1.5 text-white/20">·</span>
                      <span className="text-amber-300 font-bold">{labStoryTemplate.width}×{labStoryTemplate.height} BEZIER SVG</span>
                    </div>
                    <button
                      onClick={() => onChooseTemplate(labStoryTemplate)}
                      className="px-3 py-1.5 rounded-[9px] text-[8px] font-bold text-black shadow-md active:scale-95 transition-all flex items-center gap-1.5"
                      style={{ background: 'linear-gradient(135deg, #F59E0B, #FF8A00)' }}
                    >
                      <Sparkles size={11} />
                      <span>✦ Open Real Storybook in Tela Studio</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ── TAB 5: REACTIVE DATA VISUALIZATION & WIRE GRAPHS ──────────── */}
            {activeWorkflow === 'DATA_VIZ' && (
              <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center mt-4">
                <div className="md:col-span-5 p-5 rounded-[20px] bg-black/50 border border-white/10 shadow-inner space-y-3 font-mono text-xs">
                  <div className="flex items-center justify-between text-[9px] text-blue-400 font-bold">
                    <span>REACTIVE FORMULA WIRE GRAPH</span>
                    <span className="text-emerald-400">● LIVE CALCULATION</span>
                  </div>

                  <div>
                    <div className="flex justify-between text-[9px] text-white/50 mb-1">
                      <span>Active Creators</span>
                      <span className="text-blue-300 font-bold">{creatorsCount.toLocaleString()}</span>
                    </div>
                    <input
                      type="range"
                      min={10000}
                      max={250000}
                      step={5000}
                      value={creatorsCount}
                      onChange={e => setCreatorsCount(Number(e.target.value))}
                      className="w-full accent-blue-400 bg-white/10 rounded-lg cursor-pointer h-1.5"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-[9px] text-white/50 mb-1">
                      <span>Avg. Yield per Document ($)</span>
                      <span className="text-emerald-400 font-bold">${docYield.toFixed(2)}</span>
                    </div>
                    <input
                      type="range"
                      min={2}
                      max={50}
                      step={0.5}
                      value={docYield}
                      onChange={e => setDocYield(Number(e.target.value))}
                      className="w-full accent-emerald-400 bg-white/10 rounded-lg cursor-pointer h-1.5"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-[9px] text-white/50 mb-1">
                      <span>Viral Fork Multiplier</span>
                      <span className="text-purple-300 font-bold">{forkMultiplier.toFixed(1)}x</span>
                    </div>
                    <input
                      type="range"
                      min={1.0}
                      max={5.0}
                      step={0.1}
                      value={forkMultiplier}
                      onChange={e => setForkMultiplier(Number(e.target.value))}
                      className="w-full accent-purple-400 bg-white/10 rounded-lg cursor-pointer h-1.5"
                    />
                  </div>

                  <div className="p-3 rounded-xl bg-white/[0.04] border border-white/[0.08] space-y-1 text-[8.5px]">
                    <div className="flex justify-between text-white/60">
                      <span>PROJECTED NETWORK YIELD:</span>
                      <span className="text-emerald-400 font-bold">
                        ${Math.round(creatorsCount * docYield * forkMultiplier * 0.05).toLocaleString()} / MO
                      </span>
                    </div>
                    <div className="flex justify-between text-white/60">
                      <span>LIVING NODES SYNCED:</span>
                      <span className="text-cyan-300 font-bold">
                        {Math.round(creatorsCount * forkMultiplier * 1.8).toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Right Reactive Chart Card */}
                <div className="md:col-span-7 p-6 rounded-[22px] bg-[#0E131F] border border-blue-400/30 shadow-2xl relative">
                  <div className="flex items-center justify-between text-[8px] font-mono text-blue-300/80 pb-2 border-b border-white/10">
                    <span>OPERATIONS DOSSIER · REAL-TIME KPI SHEET</span>
                    <span>SPREADSHEET-TO-VECTOR WIRE</span>
                  </div>

                  <div className="py-4">
                    <div className="text-[1.3rem] font-bold text-white font-mono">
                      ${Math.round(creatorsCount * docYield * forkMultiplier * 0.05).toLocaleString()}
                      <span className="text-[.7rem] text-emerald-400 font-normal ml-2">↑ {Math.round(forkMultiplier * 18)}% VS LAST MO</span>
                    </div>

                    {/* Dynamic Bar Chart */}
                    <div className="mt-4 flex items-end gap-3 h-32 pt-4 px-2 bg-black/40 rounded-xl border border-white/10">
                      {[0.4, 0.65, 0.5, 0.85, 0.7, 1.0].map((ratio, idx) => {
                        const calculatedHeight = Math.min(100, Math.round(ratio * forkMultiplier * 20));
                        return (
                          <div key={idx} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end">
                            <span className="text-[7px] font-mono text-white/40">{calculatedHeight}%</span>
                            <div 
                              className="w-full rounded-t-md transition-all duration-300"
                              style={{ 
                                height: `${calculatedHeight}%`,
                                background: idx === 5 
                                  ? 'linear-gradient(180deg, #00DAF3, #2563EB)' 
                                  : 'linear-gradient(180deg, #6B0099, #D40055)'
                              }}
                            />
                            <span className="text-[7.5px] font-mono text-white/50">M{idx + 1}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="pt-3 border-t border-white/10 flex flex-wrap items-center justify-between gap-2">
                    <div className="text-[8px] font-mono text-white/50">
                      <span>BOUND TO: <strong className="text-blue-300">{labDataVizTemplate.name}</strong></span>
                      <span className="mx-1.5 text-white/20">·</span>
                      <span className="text-emerald-400 font-bold">REACTIVE FORMULA WIRE</span>
                    </div>
                    <button
                      onClick={() => onChooseTemplate(labDataVizTemplate)}
                      className="px-3 py-1.5 rounded-[9px] text-[8px] font-bold text-white shadow-md active:scale-95 transition-all flex items-center gap-1.5"
                      style={{ background: 'linear-gradient(135deg, #2563EB, #00DAF3)', color: '#fff' }}
                    >
                      <Sparkles size={11} />
                      <span>✦ Open Real Report in Tela Studio</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ── TAB 6: SMALL BUSINESS TV MENU SIGNAGE & POS RECEIPT ─────────── */}
            {activeWorkflow === 'SMALL_BIZ' && (
              <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center mt-4">
                <div className="md:col-span-5 p-5 rounded-[20px] bg-black/50 border border-white/10 shadow-inner space-y-3">
                  <div className="flex items-center justify-between text-[9px] font-mono text-emerald-400 font-bold">
                    <span>CAFE / BOUTIQUE MENU CONTROLLER</span>
                    <span>LIVE TV SYNC</span>
                  </div>

                  <div>
                    <label className="text-[9px] font-mono text-white/50 block mb-1">Featured Item Name</label>
                    <input
                      type="text"
                      value={bizItem}
                      onChange={e => setBizItem(e.target.value)}
                      className="w-full bg-white/[0.06] border border-white/10 rounded-[10px] px-3 py-2 text-[.80rem] text-white outline-none focus:border-emerald-500 font-sans"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-[9px] font-mono text-white/60 mb-1">
                      <span>Item Price ($)</span>
                      <span className="text-emerald-400 font-bold">${bizPrice.toFixed(2)}</span>
                    </div>
                    <input
                      type="range"
                      min={2}
                      max={18}
                      step={0.25}
                      value={bizPrice}
                      onChange={e => setBizPrice(Number(e.target.value))}
                      className="w-full accent-emerald-400 bg-white/10 rounded-lg cursor-pointer h-1.5"
                    />
                  </div>

                  <div>
                    <label className="text-[9px] font-mono text-white/50 block mb-1">Daily Special Promo Banner</label>
                    <input
                      type="text"
                      value={bizPromo}
                      onChange={e => setBizPromo(e.target.value)}
                      className="w-full bg-white/[0.06] border border-white/10 rounded-[10px] px-3 py-2 text-[.80rem] text-white outline-none focus:border-emerald-500 font-sans"
                    />
                  </div>

                  <div className="pt-2 flex items-center justify-between text-[8px] font-mono text-white/40">
                    <span>4K TV SIGNAGE: STREAMING</span>
                    <button
                      onClick={() => setReceiptCount(c => c + 1)}
                      className="px-2.5 py-1 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/30 transition-colors font-bold"
                    >
                      + Print Order Slip ({receiptCount})
                    </button>
                  </div>
                </div>

                <div className="md:col-span-7 grid grid-cols-1 sm:grid-cols-12 gap-4">
                  {/* Digital Signage TV Frame */}
                  <div className="sm:col-span-7 p-4 rounded-[18px] bg-black/60 border border-white/12 shadow-xl flex flex-col justify-between aspect-[16/10]">
                    <div className="flex items-center justify-between border-b border-white/10 pb-2">
                      <span className="font-display italic text-amber-300 font-bold text-sm">L’Atelier Café & Bar</span>
                      <span className="text-[7.5px] font-mono text-emerald-400 bg-emerald-950/60 px-1.5 py-0.5 rounded">4K TV SIGNAGE</span>
                    </div>

                    <div className="my-auto py-2">
                      <div className="text-[8px] font-mono text-amber-400 uppercase tracking-widest font-bold">TODAY’S HIGHLIGHT</div>
                      <div className="font-display italic text-[1.05rem] text-white font-bold leading-tight mt-0.5">{bizItem}</div>
                      <div className="text-[1.3rem] font-bold text-emerald-400 font-mono mt-1">${bizPrice.toFixed(2)}</div>
                      <div className="inline-block mt-1 px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[8px] font-mono font-bold">
                        {bizPromo}
                      </div>
                    </div>

                    <div className="pt-2 border-t border-white/10 flex items-center justify-between text-[7px] font-mono text-white/40">
                      <span>SCAN TABLE QR FOR MOBILE ORDER</span>
                      <QrCode size={14} className="text-white/60" />
                    </div>
                  </div>

                  {/* POS Order Receipt Slip */}
                  <div className="sm:col-span-5 p-4 rounded-[18px] bg-[#FAF8F3] text-slate-900 border border-white/20 shadow-xl flex flex-col justify-between font-mono text-[9px]">
                    <div className="border-b border-dashed border-slate-300 pb-2 text-center">
                      <div className="font-bold text-[10px]">L’ATELIER POS SLIP</div>
                      <div className="text-slate-500 text-[8px]">ORDER #{1042 + receiptCount} · TABLE 04</div>
                    </div>

                    <div className="py-2 space-y-1">
                      <div className="flex justify-between">
                        <span className="truncate pr-1">1x {bizItem}</span>
                        <span className="font-bold">${bizPrice.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-slate-500 text-[8px]">
                        <span>Tax (8%)</span>
                        <span>${(bizPrice * 0.08).toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between font-bold text-[10px] pt-1 border-t border-slate-300">
                        <span>TOTAL</span>
                        <span className="text-emerald-800">${(bizPrice * 1.08).toFixed(2)}</span>
                      </div>
                    </div>

                    <div className="border-t border-dashed border-slate-300 pt-2 text-center text-slate-500 text-[7.5px]">
                      Printed directly via Tela POD Engine
                    </div>
                  </div>

                  {/* Real Small Business Template Action Bar */}
                  <div className="sm:col-span-12 p-3 rounded-[14px] bg-white/[0.04] border border-emerald-500/20 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                      <span className="text-[8.5px] font-mono text-emerald-200 font-bold">
                        REAL TEMPLATE: {labSmallBizTemplate.name}
                      </span>
                      <span className="text-[7.5px] font-mono text-white/40">
                        ({labSmallBizTemplate.width}×{labSmallBizTemplate.height} · {labSmallBizTemplate.group})
                      </span>
                    </div>
                    <button
                      onClick={() => onChooseTemplate(labSmallBizTemplate)}
                      className="px-3 py-1.5 rounded-[9px] text-[8px] font-bold text-white shadow-md active:scale-95 transition-all flex items-center gap-1.5"
                      style={{ background: 'linear-gradient(135deg, #059669, #10B981)', color: '#fff' }}
                    >
                      <Sparkles size={11} />
                      <span>✦ Open Real Café & POS Template in Tela Studio</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ── TAB 7: PLAJAH ACADEMIA & INTERACTIVE WORKSHEET ─────────────── */}
            {activeWorkflow === 'ACADEMIA' && (
              <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center mt-4">
                <div className="md:col-span-5 p-5 rounded-[20px] bg-black/50 border border-white/10 shadow-inner space-y-3 font-mono text-xs">
                  <div className="flex items-center justify-between text-[9px] text-amber-400 font-bold">
                    <span>ELEVATE ACADEMIA STUDENT WORKSHEET</span>
                    <span>BIO-CHEMISTRY 201</span>
                  </div>

                  <div>
                    <label className="text-[9px] text-white/50 block mb-1">Student Answer Field</label>
                    <input
                      type="text"
                      value={studentInput}
                      onChange={e => setStudentInput(e.target.value)}
                      className="w-full bg-white/[0.06] border border-white/10 rounded-[10px] px-3 py-2 text-[.80rem] text-white outline-none focus:border-amber-500 font-mono"
                    />
                  </div>

                  <div className="pt-2 flex items-center justify-between">
                    <button
                      onClick={() => setIsGraded(!isGraded)}
                      className="h-9 px-4 rounded-[10px] text-[.74rem] font-bold text-white shadow-md active:scale-95 transition-all"
                      style={{ background: 'linear-gradient(135deg, #F59E0B, #FF8A00)' }}
                    >
                      {isGraded ? '✓ Re-validate Answer' : 'Submit for Grading'}
                    </button>
                    <span className="text-[8.5px] font-mono text-emerald-400 font-bold">
                      {isGraded ? '✓ 100/100 · AUTO-GRADED' : 'AWAITING VALIDATION'}
                    </span>
                  </div>
                </div>

                <div className="md:col-span-7 p-5 rounded-[20px] bg-[#FAF8F3] text-slate-900 border border-white/20 shadow-xl space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-300 pb-2">
                    <span className="font-mono text-[9px] font-bold text-amber-800 uppercase">
                      REAL TEMPLATE: {labAcademiaTemplate.name} // LESSON RUBRIC
                    </span>
                    <span className="font-mono text-[9px] text-emerald-700 font-bold">ACCREDITED SCORE: 100%</span>
                  </div>

                  {/* Real Vector Preview Box */}
                  <div className="w-full aspect-[16/9] rounded-[12px] overflow-hidden bg-white border border-slate-300 shadow-inner relative flex items-center justify-center p-2">
                    {labAcademiaTemplate.pages && labAcademiaTemplate.pages.length > 0 ? (
                      <TelaStaticSvg 
                        objects={getRealTemplatePage(labAcademiaTemplate, 0)} 
                        width={labAcademiaTemplate.width} 
                        height={labAcademiaTemplate.height} 
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <div className="text-center font-mono text-slate-500 text-xs">
                        Loading vector template...
                      </div>
                    )}
                  </div>

                  <div className="pt-2 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[8.5px] font-mono text-slate-600">
                      Verified input: <strong className="text-amber-800">{studentInput}</strong>
                    </span>
                    <button
                      onClick={() => onChooseTemplate(labAcademiaTemplate)}
                      className="px-3 py-1.5 rounded-[9px] text-[8px] font-bold text-white shadow-md active:scale-95 transition-all flex items-center gap-1.5"
                      style={{ background: 'linear-gradient(135deg, #F59E0B, #D97706)' }}
                    >
                      <Sparkles size={11} />
                      <span>✦ Open Real Academia Lesson in Tela Studio</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ── TAB 8: PLAJAH SOCIAL NETWORK FEED CAROUSEL ─────────────────── */}
            {activeWorkflow === 'SOCIAL' && (
              <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center mt-4">
                <div className="md:col-span-5 p-5 rounded-[20px] bg-black/50 border border-white/10 shadow-inner space-y-3">
                  <div className="flex items-center justify-between text-[9px] font-mono text-purple-300 font-bold">
                    <span>FEED CAROUSEL COMPOSER</span>
                    <span>SOCIAL DISTRIBUTION</span>
                  </div>

                  <p className="text-[.74rem] text-white/60 leading-relaxed">
                    Social broadsides in the Plajah feed are interactive, multi-slide documents that readers can read, flip through, and fork directly to their own account.
                  </p>

                  <div className="flex items-center gap-2 pt-2">
                    {[0, 1, 2].map(idx => (
                      <button
                        key={idx}
                        onClick={() => setSocialSlide(idx)}
                        className={`px-3 py-1.5 rounded-[9px] text-[8.5px] font-mono font-bold transition-all ${
                          socialSlide === idx 
                            ? 'bg-purple-500 text-white shadow-md' 
                            : 'bg-white/10 text-white/50 hover:bg-white/15'
                        }`}
                      >
                        Slide {idx + 1}
                      </button>
                    ))}
                  </div>

                  <div className="pt-2 flex items-center justify-between text-[9px] font-mono text-white/40">
                    <span>FEED INTERACTIONS: 2.4K</span>
                    <button
                      onClick={() => setForkCount(c => c + 1)}
                      className="px-2.5 py-1 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30 hover:bg-purple-500/30 transition-colors font-bold"
                    >
                      ✦ Fork Document ({forkCount})
                    </button>
                  </div>
                </div>

                <div className="md:col-span-7 flex flex-col items-center">
                  <div className="w-full max-w-[360px] aspect-square rounded-[22px] p-4 text-white border border-white/15 shadow-2xl flex flex-col justify-between bg-black/60 relative overflow-hidden">
                    <div className="flex items-center justify-between text-[8px] font-mono pb-2 border-b border-white/10">
                      <span className="text-purple-300 font-bold">REAL TEMPLATE: {labSocialTemplate.name}</span>
                      <span>SLIDE {socialSlide + 1} / {Math.max(3, labSocialTemplate.pages?.length || 1)}</span>
                    </div>

                    <div className="my-auto w-full aspect-square rounded-[14px] overflow-hidden bg-black/40 border border-white/10 flex items-center justify-center p-2">
                      {labSocialTemplate.pages && labSocialTemplate.pages.length > 0 ? (
                        <TelaStaticSvg 
                          objects={getRealTemplatePage(labSocialTemplate, Math.min(socialSlide, (labSocialTemplate.pages?.length || 1) - 1))} 
                          width={labSocialTemplate.width} 
                          height={labSocialTemplate.height} 
                          className="w-full h-full object-contain"
                        />
                      ) : (
                        <div className="text-center font-mono text-white/50 text-xs">
                          Loading vector template...
                        </div>
                      )}
                    </div>

                    <div className="pt-2.5 border-t border-white/10 flex items-center justify-between text-[8px] font-mono text-white/50">
                      <span>{labSocialTemplate.width}×{labSocialTemplate.height} SQUARE</span>
                      <button
                        onClick={() => onChooseTemplate(labSocialTemplate)}
                        className="px-3 py-1 rounded-[8px] text-[8px] font-bold text-white shadow-sm active:scale-95 transition-all flex items-center gap-1"
                        style={{ background: 'linear-gradient(135deg, #9333EA, #C026D3)' }}
                      >
                        <Sparkles size={10} />
                        <span>✦ Open Real Template</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            </div>
          </ScrollReveal>
        </section>

        {/* 4. THE SOVEREIGN CORE: POWERING THE ENTIRE PLAJAH EXPERIENCE ─────── */}
        <section className="my-14">
          <ScrollReveal distance={20}>
            <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
              <div>
                <div className="text-[9px] font-mono font-bold tracking-[.2em] uppercase text-cyan-400">
                  THE SOVEREIGN UNIFIED CORE
                </div>
                <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white font-sans mt-0.5">
                  The Engine Powering the Entire Plajah Experience
                </h2>
              </div>
              <div className="text-[.72rem] text-white/40 font-mono">
                // ONE DOCUMENT ARCHITECTURE · REAL-WORLD WORKFLOWS
              </div>
            </div>
          </ScrollReveal>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {PLAJAH_ECOSYSTEM_PILLARS.map((eco, idx) => {
              const Icon = eco.icon;
              return (
                <ScrollReveal key={idx} delay={idx * 50} distance={24}>
                  <div
                    className="w-full h-full p-5 rounded-[22px] border transition-all duration-300 hover:-translate-y-1"
                    style={{
                      background: `radial-gradient(circle at 100% 0%, ${eco.color}20, transparent 60%), rgba(255, 255, 255, 0.035)`,
                      borderColor: 'rgba(255, 255, 255, 0.09)',
                      boxShadow: '0 12px 36px rgba(0,0,0,0.3)'
                    }}
                  >
                    <div className="flex items-center justify-between mb-3.5">
                      <span 
                        className="grid place-items-center w-10 h-10 rounded-[12px] shadow-md"
                        style={{ background: `${eco.color}25`, color: eco.color, border: `1px solid ${eco.color}40` }}
                      >
                        <Icon size={19} />
                      </span>
                      <span 
                        className="text-[8px] font-mono font-extrabold tracking-widest uppercase px-2 py-0.5 rounded-full"
                        style={{ background: `${eco.color}1f`, color: eco.color, border: `1px solid ${eco.color}35` }}
                      >
                        {eco.badge}
                      </span>
                    </div>

                    <h3 className="text-[1.05rem] text-white font-bold font-sans tracking-tight">
                      {eco.studio}
                    </h3>
                    <div className="text-[.74rem] font-bold text-white/80 mt-1">
                      {eco.tag}
                    </div>
                    <p className="mt-2 text-[.70rem] leading-relaxed text-white/45">
                      {eco.desc}
                    </p>

                    <div className="mt-3.5 pt-2.5 border-t border-white/[0.08] flex items-center justify-between text-[8px] font-mono" style={{ color: eco.color }}>
                      <span>POWERS: {eco.example}</span>
                      <ArrowRight size={12} />
                    </div>
                  </div>
                </ScrollReveal>
              );
            })}
          </div>
        </section>

        {/* 5. FULL TEMPLATE LIBRARY & DESIGN ARCHIVE ───────────────────────── */}
        <section className="my-14">
          <ScrollReveal distance={28}>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
              <div className="flex items-center gap-3">
                <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white font-sans">Full Template Library & Design Archive</h2>
                <span className="text-[9px] font-mono px-2 py-0.5 rounded bg-white/10 text-white/60">
                  {TELA_TEMPLATE_GALLERY.length} CANONICAL TEMPLATES
                </span>
              </div>
              <span className="text-[.76rem] font-mono text-white/40">
                // SEARCHABLE · CANONICAL · PRINT & SCREEN READY
              </span>
            </div>

            <div className="rounded-[24px] overflow-hidden border border-white/10 bg-black/30 p-2 sm:p-4 shadow-2xl">
              <TelaTemplateGallery onUse={onChooseTemplate} />
            </div>
          </ScrollReveal>
        </section>

      </main>
    </div>
  );
}
