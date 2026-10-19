import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Sparkles, X, Eye, EyeOff, RotateCcw, Check, Music, Play, Pause, SkipBack, SkipForward, Repeat, Volume2, Layers, Sliders } from 'lucide-react';
import { resolveBookGutenbergId } from './classicBooks';
import {
  CLASSIC_BOOK_SOUNDTRACKS,
  getOrRenderBookMovementAudioUrl,
  getMasterBookScore,
  launchClassicBookInChoraDaw,
  type ClassicBookTrackScore,
} from './classicBookSoundtracks';
import {
  playRealtimeSympMovement,
  stopRealtimeSympPlayback,
  seekRealtimeSympPlayback,
} from '../services/melos/melosRealtimeSympPlayer';
import {
  buildClassicBookTelaFlourishBundle,
  type OmniFlourishRecipe,
} from '../services/tela/classicBookTelaFlourishes';

export interface ClassicPageTheme {
  id: string;
  gutenbergIds: number[];
  title: string;
  author: string;
  era: string;
  themeName: string;
  coverUrl: string;
  flourishDesc: string;
  palette: {
    pageBg: string;
    pageBorder: string;
    ink: string;
    muted: string;
    heading: string;
    accent: string;
    secondary: string;
    dropCapBg: string;
    glow: string;
  };
  moteType: 'spark' | 'ember' | 'fog' | 'crimson' | 'pollen' | 'sun' | 'sea' | 'leaf' | 'spray' | 'star' | 'candle';
  quote: string;
}

export const CLASSIC_PAGE_THEMES: ClassicPageTheme[] = [
  {
    id: 'pride-and-prejudice',
    gutenbergIds: [1342, 161, 158, 145, 844],
    title: 'Pride and Prejudice',
    author: 'Jane Austen',
    era: 'Regency Botanical · 1813',
    themeName: 'Pemberley Briar Rose, Foxglove, Lavender & Peacock Filigree',
    coverUrl: '/covers/audiobooks/pride-and-prejudice.jpg',
    flourishDesc: 'Pink wild Briar rose arrangements, tall magenta foxgloves, purple lavender spikes, white daisies, gold peacock-feather corners & Pemberley lake reflection.',
    palette: {
      pageBg: 'linear-gradient(165deg, #fbf6ea 0%, #f5ebd6 52%, #eee0c5 100%)',
      pageBorder: 'rgba(176, 130, 48, 0.42)',
      ink: '#2a221a',
      muted: '#6c5842',
      heading: '#1f1710',
      accent: '#b48228',
      secondary: '#d96b86',
      dropCapBg: 'rgba(217, 107, 134, 0.14)',
      glow: 'rgba(217, 107, 134, 0.14)',
    },
    moteType: 'sun',
    quote: 'There is a stubbornness about me that never can bear to be frightened at the will of others.',
  },
  {
    id: 'frankenstein',
    gutenbergIds: [84, 43],
    title: 'Frankenstein; or, The Modern Prometheus',
    author: 'Mary Wollstonecraft Shelley',
    era: 'Romantic Gothic · 1818',
    themeName: 'Galvanic Copper Coils, Voltaic Pile, Surgical Sutures & Mer de Glace',
    coverUrl: '/covers/audiobooks/frankenstein.jpg',
    flourishDesc: 'Ingolstadt copper induction coils, stacked Voltaic battery discs, surgical cross-stitch suture margin, riveted brass lab-viewport drop-cap & Mer de Glace lightning.',
    palette: {
      pageBg: 'linear-gradient(165deg, #0d1624 0%, #101c2e 52%, #0a111c 100%)',
      pageBorder: 'rgba(110, 196, 255, 0.36)',
      ink: '#e4eef7',
      muted: '#8aa8c7',
      heading: '#f3f8fc',
      accent: '#5ec2ff',
      secondary: '#f5b041',
      dropCapBg: 'rgba(94, 194, 255, 0.13)',
      glow: 'rgba(94, 194, 255, 0.16)',
    },
    moteType: 'spark',
    quote: 'Beware; for I am fearless, and therefore powerful.',
  },
  {
    id: 'alice-in-wonderland',
    gutenbergIds: [11, 236],
    title: "Alice's Adventures in Wonderland",
    author: 'Lewis Carroll',
    era: 'Golden Age Illustrated · 1865',
    themeName: 'Golden Keyhole, Cheshire Cat Grin, Tumbling Cards & Painted Roses',
    coverUrl: '/covers/audiobooks/alice-in-wonderland.jpg',
    flourishDesc: 'Baroque golden keyhole escutcheon, Cheshire Cat grin in foliage, dripping half-painted roses, bioluminescent mushrooms, tumbling playing cards & melting pocket-watch.',
    palette: {
      pageBg: 'linear-gradient(165deg, #0b1c1b 0%, #102826 52%, #081514 100%)',
      pageBorder: 'rgba(244, 203, 96, 0.38)',
      ink: '#ebf5f2',
      muted: '#8ec2ba',
      heading: '#fff7df',
      accent: '#f4cb60',
      secondary: '#e83e59',
      dropCapBg: 'rgba(46, 213, 181, 0.15)',
      glow: 'rgba(46, 213, 181, 0.16)',
    },
    moteType: 'pollen',
    quote: 'Why, sometimes I’ve believed as many as six impossible things before breakfast.',
  },
  {
    id: 'dracula',
    gutenbergIds: [345, 174],
    title: 'Dracula',
    author: 'Bram Stoker',
    era: 'Victorian Gothic · 1897',
    themeName: 'Gothic Lancet Ironwork, Whitby Abbey Arch, Bats & Order of the Dragon',
    coverUrl: '/covers/audiobooks/dracula.jpg',
    flourishDesc: 'Wrought-iron cemetery spear-pales, ruined Whitby Abbey pointed Gothic lancet arch, spiralling vampire bats, coffin-shield drop-cap & Carpathian blood moon.',
    palette: {
      pageBg: 'linear-gradient(165deg, #16090d 0%, #210d13 52%, #100609 100%)',
      pageBorder: 'rgba(229, 57, 75, 0.38)',
      ink: '#f2e4e6',
      muted: '#b88c94',
      heading: '#ffe8ec',
      accent: '#e5394b',
      secondary: '#c8cdd6',
      dropCapBg: 'rgba(229, 57, 75, 0.15)',
      glow: 'rgba(229, 57, 75, 0.18)',
    },
    moteType: 'crimson',
    quote: 'Listen to them—the children of the night. What music they make!',
  },
  {
    id: 'sherlock-holmes',
    gutenbergIds: [1661, 1400, 730, 46, 2554, 5200],
    title: 'The Adventures of Sherlock Holmes',
    author: 'Sir Arthur Conan Doyle',
    era: 'Victorian Mystery · 1892',
    themeName: '221B Gas-Lamp, Forensic Fingerprint Lens, Stradivarius Violin & Clue Thread',
    coverUrl: '/covers/audiobooks/sherlock-holmes.jpg',
    flourishDesc: '221B wrought-iron gas-lamp in London fog, brass magnifying glass over a concentric fingerprint whorl, Stradivarius violin, calabash pipe & Scotland Yard ruler margin.',
    palette: {
      pageBg: 'linear-gradient(165deg, #121819 0%, #172123 52%, #0d1213 100%)',
      pageBorder: 'rgba(240, 184, 92, 0.36)',
      ink: '#ece6d8',
      muted: '#9eadad',
      heading: '#fff3d6',
      accent: '#f0b85c',
      secondary: '#45a29e',
      dropCapBg: 'rgba(240, 184, 92, 0.14)',
      glow: 'rgba(240, 184, 92, 0.15)',
    },
    moteType: 'fog',
    quote: 'When you have eliminated the impossible, whatever remains, however improbable, must be the truth.',
  },
  {
    id: 'art-of-war',
    gutenbergIds: [17405, 2680, 2388, 4014],
    title: 'The Art of War',
    author: 'Sun Tzu',
    era: 'Eastern Zhou · 5th Century BC',
    themeName: 'Imperial Gold Dragon & Phoenix, Bamboo Scroll, Jian & Weiqi',
    coverUrl: '/covers/audiobooks/art-of-war.jpg',
    flourishDesc: 'Vermilion-and-black lacquer fretwork rails, coiled gold dragons & phoenixes, tied bamboo scroll (孫子兵法), jade-hilted bronze Jian sword & Go stones.',
    palette: {
      pageBg: 'linear-gradient(165deg, #16110e 0%, #1f1612 52%, #120d0a 100%)',
      pageBorder: 'rgba(232, 185, 96, 0.38)',
      ink: '#f3e9d7',
      muted: '#bfa37c',
      heading: '#fae8c8',
      accent: '#e8b960',
      secondary: '#d93829',
      dropCapBg: 'rgba(217, 56, 41, 0.16)',
      glow: 'rgba(217, 56, 41, 0.16)',
    },
    moteType: 'ember',
    quote: 'Supreme excellence consists in breaking the enemy’s resistance without fighting.',
  },
  {
    id: 'the-odyssey',
    gutenbergIds: [1727, 6130, 11000, 1001],
    title: 'The Odyssey',
    author: 'Homer',
    era: 'Classical Antiquity · 8th Century BC',
    themeName: 'Greek Meander, Sunburst Rosettes, Athena Owl Sail & Trireme',
    coverUrl: '/covers/audiobooks/the-odyssey.jpg',
    flourishDesc: 'Continuous Greek key (meander) border, corner sunburst rosettes, scallop shells, Athena’s owl emblem, and bronze Greek trireme over Aegean waves.',
    palette: {
      pageBg: 'linear-gradient(165deg, #0c1726 0%, #122238 52%, #09111c 100%)',
      pageBorder: 'rgba(235, 168, 76, 0.38)',
      ink: '#f2eadc',
      muted: '#9ab4d1',
      heading: '#ffefd1',
      accent: '#eba84c',
      secondary: '#c85a32',
      dropCapBg: 'rgba(235, 168, 76, 0.14)',
      glow: 'rgba(235, 168, 76, 0.16)',
    },
    moteType: 'sea',
    quote: 'Be strong, saith my heart; I am a soldier; I have seen worse sights than this.',
  },
  {
    id: 'tom-sawyer',
    gutenbergIds: [74, 76, 215],
    title: 'The Adventures of Tom Sawyer',
    author: 'Mark Twain',
    era: 'American Classic · 1876',
    themeName: 'Weeping Willows, White Picket Fence, Cattails & River Steamboat',
    coverUrl: '/covers/audiobooks/tom-sawyer.jpg',
    flourishDesc: 'Tooled gold Americana leather corners, draping green weeping willow branches, river cattails & reeds, whitewashed picket fence, and twin-stack Mississippi steamboat.',
    palette: {
      pageBg: 'linear-gradient(165deg, #fbf5e6 0%, #f4ead2 52%, #eadbc0 100%)',
      pageBorder: 'rgba(158, 107, 43, 0.38)',
      ink: '#2b2218',
      muted: '#6e5840',
      heading: '#1e160d',
      accent: '#9e6b2b',
      secondary: '#3c7a57',
      dropCapBg: 'rgba(158, 107, 43, 0.13)',
      glow: 'rgba(158, 107, 43, 0.15)',
    },
    moteType: 'sun',
    quote: 'In order to make a man or a boy covet a thing, it is only necessary to make the thing difficult to attain.',
  },
  {
    id: 'little-women',
    gutenbergIds: [514, 25344],
    title: 'Little Women',
    author: 'Louisa May Alcott',
    era: 'New England Autumn · 1868',
    themeName: 'Embossed Gold Oak Leaves & Acorns, Leaded Window & Feather Quill',
    coverUrl: '/covers/audiobooks/little-women.jpg',
    flourishDesc: 'Embossed gold oak-leaf, acorn & autumn-vine botanical garland border, diamond-pane Concord window lattice, glowing hearth candle & Jo’s white feather quill.',
    palette: {
      pageBg: 'linear-gradient(165deg, #faf2e6 0%, #f3e5d2 52%, #ead6bc 100%)',
      pageBorder: 'rgba(158, 66, 46, 0.38)',
      ink: '#2d1f1a',
      muted: '#735348',
      heading: '#221410',
      accent: '#a84a2a',
      secondary: '#c8872e',
      dropCapBg: 'rgba(168, 74, 42, 0.13)',
      glow: 'rgba(200, 135, 46, 0.15)',
    },
    moteType: 'leaf',
    quote: 'I am not afraid of storms, for I am learning how to sail my ship.',
  },
  {
    id: 'moby-dick',
    gutenbergIds: [2701, 120, 164, 103, 36, 35],
    title: 'Moby Dick; or, The Whale',
    author: 'Herman Melville',
    era: 'Maritime Epic · 1851',
    themeName: 'Breaching White Leviathan, Foaming Swells, Pequod & Harpoons',
    coverUrl: '/covers/audiobooks/moby-dick.jpg',
    flourishDesc: 'Golden nautical rope-and-wave scroll flourishes, breaching scarred White Whale in foaming turquoise swells, three-masted Pequod & crossed whaling harpoons.',
    palette: {
      pageBg: 'linear-gradient(165deg, #0b161f 0%, #10212e 52%, #081017 100%)',
      pageBorder: 'rgba(148, 197, 224, 0.36)',
      ink: '#e5eff5',
      muted: '#8aacc2',
      heading: '#f5fbff',
      accent: '#8ecae6',
      secondary: '#e0a96d',
      dropCapBg: 'rgba(142, 202, 230, 0.14)',
      glow: 'rgba(142, 202, 230, 0.16)',
    },
    moteType: 'spray',
    quote: 'I know not all that may be coming, but be it what it will, I’ll go to it laughing.',
  },
  {
    id: 'count-of-monte-cristo',
    gutenbergIds: [1184, 1257, 135, 98, 996, 2600, 1399, 1513, 1524],
    title: 'The Count of Monte Cristo',
    author: 'Alexandre Dumas',
    era: 'French Romantic · 1844',
    themeName: 'French Baroque Gold Filigree, Château d’If, Rapier & Treasure Chest',
    coverUrl: '/covers/audiobooks/count-of-monte-cristo.jpg',
    flourishDesc: 'French Baroque gold acanthus & Fleur-de-Lis crown frame, island fortress Château d’If under crescent moon, swept-hilt rapier & treasure chest of rubies, emeralds and pearls.',
    palette: {
      pageBg: 'linear-gradient(165deg, #0b1524 0%, #0f1f33 52%, #080f1a 100%)',
      pageBorder: 'rgba(235, 192, 92, 0.40)',
      ink: '#f2ecdf',
      muted: '#9ab0c9',
      heading: '#fff4d9',
      accent: '#ebc05c',
      secondary: '#2ec486',
      dropCapBg: 'rgba(46, 196, 134, 0.15)',
      glow: 'rgba(235, 192, 92, 0.16)',
    },
    moteType: 'star',
    quote: 'All human wisdom is contained in these two words—Wait and Hope.',
  },
  {
    id: 'jane-eyre',
    gutenbergIds: [1260, 768],
    title: 'Jane Eyre',
    author: 'Charlotte Brontë',
    era: 'Victorian Moorland Gothic · 1847',
    themeName: 'Yorkshire Purple Heather Arrangements, Hawthorn & Thornfield Window',
    coverUrl: '/covers/audiobooks/jane-eyre.jpg',
    flourishDesc: 'Blooming purple Yorkshire heather & moorland wildflower arrangements, wind-swept gnarly hawthorn branches, and Thornfield Hall’s glowing amber Gothic tower window.',
    palette: {
      pageBg: 'linear-gradient(165deg, #19111f 0%, #23182b 52%, #120c17 100%)',
      pageBorder: 'rgba(238, 184, 98, 0.36)',
      ink: '#f0e6f5',
      muted: '#b39abf',
      heading: '#ffefd9',
      accent: '#eeb862',
      secondary: '#b565a7',
      dropCapBg: 'rgba(238, 184, 98, 0.14)',
      glow: 'rgba(181, 101, 167, 0.18)',
    },
    moteType: 'candle',
    quote: 'I am no bird; and no net ensnares me; I am a free human being with an independent will.',
  },
];

export const resolveClassicPageTheme = (
  bookTitle?: string,
  bookId?: string,
  overrideThemeId?: string | null
): ClassicPageTheme | null => {
  if (overrideThemeId) {
    const manual = CLASSIC_PAGE_THEMES.find(t => t.id === overrideThemeId);
    if (manual) return manual;
  }

  const gid =
    (bookId && resolveBookGutenbergId(bookId)) ||
    (bookTitle && resolveBookGutenbergId(bookTitle)) ||
    null;

  if (gid) {
    const byGid = CLASSIC_PAGE_THEMES.find(t => t.gutenbergIds.includes(gid));
    if (byGid) return byGid;
    // Map Classical Philosophers & Dramatists (Plato, Aristotle, Marcus Aurelius, Sophocles, Homer's Iliad) to the Classical Antiquity Greek-Key theme
    if ([1497, 1600, 1656, 1974, 8438, 6762, 2680, 31, 6130].includes(gid)) {
      return CLASSIC_PAGE_THEMES.find(t => t.id === 'the-odyssey') || CLASSIC_PAGE_THEMES[0];
    }
    if ([2147, 1524].includes(gid)) {
      return CLASSIC_PAGE_THEMES.find(t => t.id === 'dracula') || CLASSIC_PAGE_THEMES[0];
    }
    if ([1513].includes(gid)) {
      return CLASSIC_PAGE_THEMES.find(t => t.id === 'jane-eyre') || CLASSIC_PAGE_THEMES[0];
    }
    if ([1001].includes(gid)) {
      return CLASSIC_PAGE_THEMES.find(t => t.id === 'count-of-monte-cristo') || CLASSIC_PAGE_THEMES[0];
    }
    if ([1322].includes(gid)) {
      return CLASSIC_PAGE_THEMES.find(t => t.id === 'tom-sawyer') || CLASSIC_PAGE_THEMES[0];
    }
  }

  const s = `${bookTitle || ''} ${bookId || ''}`.toLowerCase();
  for (const theme of CLASSIC_PAGE_THEMES) {
    if (s.includes(theme.id.replace(/-/g, ' ')) || s.includes(theme.title.toLowerCase())) {
      return theme;
    }
  }

  if (gid || s.includes('gutenberg') || s.includes('guttenberg') || s.startsWith('se-') || s.startsWith('heritage-')) {
    return CLASSIC_PAGE_THEMES[0];
  }

  return null;
};

/**
 * Rich, multi-layered TOP CORNER vector art rendered in code, directly adapted from each Gemini cover's upper frame:
 * - Pride & Prejudice: Gold Regency peacock-feather eye filigree + scrolling acanthus + blooming pink Briar rose & lavender sprigs
 * - Frankenstein: Jagged icy-blue Alpine glacier shards + forked electric blue-white lightning bolt + gold double bookplate border
 * - Alice: Baroque gold scrollwork + painted red & white Wonderland roses with emerald leaves + golden heart & spade emblems
 * - Dracula: Antique pewter-silver Gothic pointed cathedral arch + crimson thorny rose-briars + spread-winged vampire bat
 * - Sherlock: Ornate Victorian gold acanthus-scroll leather corner + wrought-iron amber street gas-lamp bracket
 * - Art of War: Black-and-vermilion lacquer fretwork rail + coiled imperial gold Chinese dragon in cloud scrolls
 * - Odyssey: Continuous gold-and-terracotta Greek key (meander) + corner sunburst rosette medallion + inner scallop shell spandrel
 * - Tom Sawyer: Tooled gold Americana scroll corner + draping lush green weeping-willow branches
 * - Little Women: Embossed gold oak-leaf & acorn botanical garland + Concord diamond-leaded window lattice
 * - Moby Dick: Golden nautical wave-scroll & rope-knot filigree + crossed whaling harpoon tip
 * - Count of Monte Cristo: Sumptuous French Baroque gold acanthus & Fleur-de-Lis corner + emerald & ruby cabochons
 * - Jane Eyre: Windswept gnarly Yorkshire hawthorn branches + twilight moorland clouds & purple heather sprig
 */
export const renderCornerFlourishSvg = (themeId: string, strokeColor: string, secondaryColor: string) => {
  switch (themeId) {
    case 'pride-and-prejudice':
      return (
        <svg viewBox="0 0 150 150" fill="none" className="w-full h-full">
          {/* Regency double gold border rails */}
          <path className="lorea-fl-path" pathLength={1} d="M6 144 V28 Q6 6 28 6 H144" stroke={strokeColor} strokeWidth="2" />
          <path className="lorea-fl-path" pathLength={1} d="M13 132 V34 Q13 13 34 13 H132" stroke={strokeColor} strokeWidth="1" opacity="0.7" />
          {/* Gold Peacock-Feather Eye Medallion in Corner (from Gemini cover top corners) */}
          <g transform="translate(26, 26) rotate(-45)">
            <ellipse cx="0" cy="0" rx="16" ry="10" fill="rgba(180,130,40,0.15)" stroke={strokeColor} strokeWidth="1.5" />
            <ellipse cx="0" cy="0" rx="10" ry="6" fill="rgba(74,120,98,0.35)" stroke="#4a7862" strokeWidth="1.2" />
            <circle cx="2" cy="0" r="3.5" fill={strokeColor} />
            <path d="M-16 0 C-22 -8, -12 -15, 0 -12 M-16 0 C-22 8, -12 15, 0 12" stroke={strokeColor} strokeWidth="1" opacity="0.8" />
          </g>
          {/* Regency scrolling gold filigree & sage leaf vines */}
          <path className="lorea-fl-path" pathLength={1} d="M14 78 C22 52, 34 42, 54 32 C42 22, 52 14, 82 14" stroke="#4a7862" strokeWidth="1.6" />
          <path d="M24 58 Q36 52 38 62 Q26 66 24 58 Z M56 22 Q64 32 54 36 Q48 26 56 22 Z" fill="#5b8c6f" opacity="0.85" />
          {/* Blooming Pink English Briar Rose & Rosebuds */}
          <g transform="translate(44, 44)">
            <circle cx="0" cy="0" r="10" fill="#e88ca5" opacity="0.9" />
            <circle cx="-3" cy="-2" r="7" fill="#f4b2c4" />
            <circle cx="3" cy="2" r="6.5" fill="#d96b86" />
            <path d="M-5 -1 C-2 -6, 4 -6, 6 -1 C4 5, -3 5, -5 -1 Z" fill="#fde2e9" />
            <circle cx="0" cy="0" r="2.5" fill="#e6a832" />
          </g>
          {/* Purple Lavender Spikes extending along top & left */}
          <g stroke="#7a5299" strokeWidth="1.2" fill="#9b6ec2">
            <ellipse cx="72" cy="22" rx="3" ry="1.8" transform="rotate(-20 72 22)" />
            <ellipse cx="80" cy="20" rx="3" ry="1.8" transform="rotate(-20 80 20)" />
            <ellipse cx="88" cy="19" rx="2.8" ry="1.6" transform="rotate(-20 88 19)" />
            <ellipse cx="22" cy="72" rx="1.8" ry="3" transform="rotate(20 22 72)" />
            <ellipse cx="20" cy="80" rx="1.8" ry="3" transform="rotate(20 20 80)" />
          </g>
          {/* White Daisy */}
          <g transform="translate(24, 52)">
            <circle cx="0" cy="-4" r="2.2" fill="#fffdf7" />
            <circle cx="4" cy="0" r="2.2" fill="#fffdf7" />
            <circle cx="0" cy="4" r="2.2" fill="#fffdf7" />
            <circle cx="-4" cy="0" r="2.2" fill="#fffdf7" />
            <circle cx="0" cy="0" r="2" fill="#e6a832" />
          </g>
        </svg>
      );

    case 'frankenstein':
      return (
        <svg viewBox="0 0 150 150" fill="none" className="w-full h-full">
          {/* Gold-foil double bookplate border (from Gemini cover) */}
          <path className="lorea-fl-path" pathLength={1} d="M6 144 V14 L14 6 H144" stroke="#d4a853" strokeWidth="2" />
          <path className="lorea-fl-path" pathLength={1} d="M12 132 V20 L20 12 H132" stroke="#d4a853" strokeWidth="1" opacity="0.65" />
          {/* Jagged Mer de Glace Glacial Ice Shards */}
          <polygon points="12,12 58,12 42,26 64,28 32,44 26,64 12,48" fill="rgba(94,194,255,0.18)" stroke={strokeColor} strokeWidth="1.2" />
          <polygon points="12,12 36,12 24,28 12,36" fill="rgba(180,230,255,0.28)" />
          {/* Forked Electric Blue-White Lightning Bolt */}
          <path className="lorea-fl-path" pathLength={1} d="M16 16 L38 30 L30 36 L58 54 L48 58 L76 80" stroke="#ffffff" strokeWidth="2.2" strokeLinecap="round" />
          <path className="lorea-fl-path" pathLength={1} d="M38 30 L56 24 L64 34 M58 54 L40 70" stroke={strokeColor} strokeWidth="1.5" strokeLinecap="round" />
          {/* Alchemical Amber Spark Nodes */}
          <circle cx="16" cy="16" r="3.5" fill={secondaryColor} />
          <circle cx="58" cy="54" r="2.5" fill="#ffffff" />
        </svg>
      );

    case 'alice-in-wonderland':
      return (
        <svg viewBox="0 0 150 150" fill="none" className="w-full h-full">
          {/* Ornate Baroque Gold Scrollwork Frame */}
          <path className="lorea-fl-path" pathLength={1} d="M6 142 V24 Q6 6 24 6 H142" stroke={strokeColor} strokeWidth="2.2" />
          <path className="lorea-fl-path" pathLength={1} d="M14 128 V30 Q14 14 30 14 H128" stroke={strokeColor} strokeWidth="1.1" opacity="0.75" />
          {/* Emerald Vine & Foliage */}
          <path className="lorea-fl-path" pathLength={1} d="M14 88 C22 52, 46 24, 88 14" stroke="#2ead7b" strokeWidth="2" />
          <path d="M22 64 Q34 56 36 68 Q24 72 22 64 Z M60 22 Q70 32 58 36 Q52 26 60 22 Z" fill="#2ead7b" opacity="0.85" />
          {/* Painted Red Rose & Half-Painted White Rose (from Alice cover border) */}
          <g transform="translate(34, 34)">
            <circle cx="0" cy="0" r="11" fill="#d92644" />
            <circle cx="-3" cy="-3" r="7" fill="#ff5d73" />
            <path d="M-5 -2 C0 -7, 6 -4, 4 3 C1 6, -6 4, -5 -2 Z" fill="#ff8fa0" />
            <circle cx="0" cy="0" r="2.5" fill={strokeColor} />
          </g>
          <g transform="translate(64, 22)">
            <circle cx="0" cy="0" r="7.5" fill="#f7f3e8" stroke="#d92644" strokeWidth="1.5" />
            <path d="M0 -7.5 A7.5 7.5 0 0 1 7.5 0 L0 0 Z" fill="#d92644" />
            <circle cx="0" cy="0" r="2" fill={strokeColor} />
          </g>
          <g transform="translate(22, 64)">
            <circle cx="0" cy="0" r="7" fill="#d92644" />
            <circle cx="-2" cy="-1" r="4.5" fill="#ff6b81" />
          </g>
          {/* Golden Heart Suit Emblem */}
          <path d="M48 52 C48 48, 42 46, 42 51 C42 55, 48 58, 48 61 C48 58, 54 55, 54 51 C54 46, 48 48, 48 52 Z" fill={strokeColor} />
        </svg>
      );

    case 'dracula':
      return (
        <svg viewBox="0 0 150 150" fill="none" className="w-full h-full">
          {/* Pewter-Silver Gothic Cathedral Pointed Arch Frame */}
          <path className="lorea-fl-path" pathLength={1} d="M6 144 V18 L18 6 H144" stroke="#c8cdd6" strokeWidth="2.2" />
          <path className="lorea-fl-path" pathLength={1} d="M14 130 V42 C14 22, 22 14, 42 14 H130" stroke="#9ea6b4" strokeWidth="1.4" />
          {/* Crimson Thorny Briar Vines Weaving Through the Arch */}
          <path className="lorea-fl-path" pathLength={1} d="M10 96 C18 62, 34 34, 62 18 C78 10, 96 14, 114 10" stroke={strokeColor} strokeWidth="1.8" />
          <path d="M22 68 L15 63 M34 46 L28 39 M52 25 L47 17 M78 14 L82 7" stroke="#c8cdd6" strokeWidth="1.4" />
          {/* Spread-Winged Vampire Bat in Corner Medallion */}
          <path d="M34 32 C26 20, 16 22, 12 30 C20 29, 24 33, 26 39 C33 35, 35 33, 39 39 C33 35, 29 29, 30 12 C22 16, 20 26, 32 34 Z" fill={strokeColor} stroke="#c8cdd6" strokeWidth="0.9" />
          {/* Dark Crimson Gothic Rose */}
          <circle cx="52" cy="26" r="6" fill="#9e1424" stroke={strokeColor} strokeWidth="1.2" />
          <circle cx="26" cy="52" r="5.5" fill="#9e1424" stroke={strokeColor} strokeWidth="1.2" />
        </svg>
      );

    case 'sherlock-holmes':
      return (
        <svg viewBox="0 0 150 150" fill="none" className="w-full h-full">
          {/* Victorian Tooled Gold Leather Double Border */}
          <path className="lorea-fl-path" pathLength={1} d="M6 144 V20 Q6 6 20 6 H144" stroke={strokeColor} strokeWidth="2" />
          <path className="lorea-fl-path" pathLength={1} d="M13 130 V26 Q13 13 26 13 H130" stroke={strokeColor} strokeWidth="1" opacity="0.7" />
          {/* Victorian Gold Acanthus Scrollwork (from cover corners) */}
          <path className="lorea-fl-path" pathLength={1} d="M14 68 C14 36, 36 14, 68 14 M20 48 C30 48, 36 38, 30 30 C24 24, 16 30, 22 38" stroke={strokeColor} strokeWidth="1.7" strokeLinecap="round" />
          {/* Wrought-Iron Baker Street Gas Lamp with Warm Amber Glow */}
          <g transform="translate(38, 38)">
            <circle cx="0" cy="0" r="14" fill="rgba(240,184,92,0.22)" />
            <polygon points="-6,-8 6,-8 8,0 4,9 -4,9 -8,0" fill="rgba(255,215,130,0.45)" stroke={strokeColor} strokeWidth="1.5" />
            <path d="M-8 -8 H8 M0 -13 L-4 -8 H4 Z M0 9 V22 M-12 14 H0" stroke={strokeColor} strokeWidth="1.5" />
            <circle cx="0" cy="0" r="3.5" fill="#fff4cc" />
          </g>
        </svg>
      );

    case 'art-of-war':
      return (
        <svg viewBox="0 0 150 150" fill="none" className="w-full h-full">
          {/* Vermilion-and-Black Lacquer Border with Gold Chinese Fretwork */}
          <path className="lorea-fl-path" pathLength={1} d="M6 144 V6 H144" stroke={strokeColor} strokeWidth="2.4" />
          <path className="lorea-fl-path" pathLength={1} d="M14 132 V14 H132" stroke={secondaryColor} strokeWidth="1.6" />
          <path className="lorea-fl-path" pathLength={1} d="M20 56 V20 H56 V32 H32 V44 H44" stroke={strokeColor} strokeWidth="1.5" />
          {/* Coiled Imperial Gold Dragon & Cloud Scroll in Top Corner */}
          <path className="lorea-fl-path" pathLength={1} d="M26 38 C24 22, 44 18, 52 28 C60 38, 42 50, 34 42 C28 36, 36 26, 44 30" stroke={strokeColor} strokeWidth="2.2" strokeLinecap="round" />
          <circle cx="44" cy="30" r="3" fill={secondaryColor} />
          {/* Crimson Seal Stamp Cartouche */}
          <rect x="18" y="64" width="12" height="22" rx="2" fill="rgba(217,56,41,0.3)" stroke={secondaryColor} strokeWidth="1.3" />
        </svg>
      );

    case 'the-odyssey':
      return (
        <svg viewBox="0 0 150 150" fill="none" className="w-full h-full">
          {/* Classical Greek Key (Meander) Border + Corner Sunburst Rosette + Scallop Shell Spandrel */}
          <path className="lorea-fl-path" pathLength={1} d="M6 144 V6 H144" stroke={strokeColor} strokeWidth="2.2" />
          <path className="lorea-fl-path" pathLength={1} d="M22 136 V22 H136" stroke={strokeColor} strokeWidth="1.4" />
          {/* Meander Fretwork along Top & Left */}
          <path className="lorea-fl-path" pathLength={1} d="M36 14 H52 V20 H42 V10 H60 V20 M14 36 V52 H20 V42 H10 V60 H20" stroke={secondaryColor} strokeWidth="1.4" />
          {/* Outer Corner Sunburst Rosette Medallion (matching Odyssey cover corners) */}
          <rect x="6" y="6" width="22" height="22" fill="rgba(200,90,50,0.35)" stroke={strokeColor} strokeWidth="1.6" />
          <circle cx="17" cy="17" r="7" stroke={strokeColor} strokeWidth="1.4" fill="rgba(235,168,76,0.25)" />
          <circle cx="17" cy="17" r="2.5" fill={strokeColor} />
          {/* Inner Scallop Shell Spandrel */}
          <path d="M28 28 L48 32 C46 42, 42 46, 32 48 Z" fill="rgba(235,168,76,0.22)" stroke={strokeColor} strokeWidth="1.3" />
          <path d="M28 28 L44 38 M28 28 L38 44" stroke={strokeColor} strokeWidth="1" />
        </svg>
      );

    case 'tom-sawyer':
      return (
        <svg viewBox="0 0 150 150" fill="none" className="w-full h-full">
          {/* Tooled Gold Americana Leather Frame */}
          <path className="lorea-fl-path" pathLength={1} d="M6 144 V20 Q6 6 20 6 H144" stroke={strokeColor} strokeWidth="2" />
          <path className="lorea-fl-path" pathLength={1} d="M14 130 V28 Q14 14 28 14 H130" stroke={strokeColor} strokeWidth="1" opacity="0.7" />
          {/* Draping Green Weeping-Willow Fronds from Top Corner (matching Tom Sawyer cover) */}
          <path className="lorea-fl-path" pathLength={1} d="M20 14 Q28 52 18 96 M36 14 Q42 48 32 84 M54 14 Q58 40 50 68" stroke="#3c7a57" strokeWidth="1.6" strokeLinecap="round" />
          <g fill="#4d946b" opacity="0.85">
            <ellipse cx="22" cy="36" rx="4" ry="1.8" transform="rotate(35 22 36)" />
            <ellipse cx="20" cy="52" rx="4" ry="1.8" transform="rotate(35 20 52)" />
            <ellipse cx="18" cy="68" rx="4" ry="1.8" transform="rotate(35 18 68)" />
            <ellipse cx="37" cy="34" rx="4" ry="1.8" transform="rotate(30 37 34)" />
            <ellipse cx="35" cy="50" rx="4" ry="1.8" transform="rotate(30 35 50)" />
            <ellipse cx="54" cy="32" rx="3.8" ry="1.6" transform="rotate(25 54 32)" />
          </g>
          {/* Gold Americana Corner Scroll */}
          <circle cx="22" cy="22" r="5" fill={strokeColor} opacity="0.85" />
        </svg>
      );

    case 'little-women':
      return (
        <svg viewBox="0 0 150 150" fill="none" className="w-full h-full">
          {/* Embossed Gold Botanical Frame */}
          <path className="lorea-fl-path" pathLength={1} d="M6 144 V20 Q6 6 20 6 H144" stroke={strokeColor} strokeWidth="2" />
          <path className="lorea-fl-path" pathLength={1} d="M14 130 V26 Q14 14 26 14 H130" stroke={secondaryColor} strokeWidth="1.2" opacity="0.8" />
          {/* Gold & Autumn Russet Oak Leaves and Acorns Garland (matching Little Women cover border) */}
          <path className="lorea-fl-path" pathLength={1} d="M16 86 C20 48, 48 20, 86 16" stroke={strokeColor} strokeWidth="1.8" />
          {/* Lobed Oak Leaf 1 */}
          <path d="M28 46 C22 40, 26 32, 32 34 C34 26, 42 28, 42 36 C48 36, 46 44, 38 46 Z" fill="#c8872e" opacity="0.88" stroke={strokeColor} strokeWidth="1.2" />
          {/* Lobed Oak Leaf 2 */}
          <path d="M52 24 C48 18, 54 12, 60 16 C64 10, 72 14, 68 22 C74 24, 68 32, 60 28 Z" fill="#a84a2a" opacity="0.85" stroke={strokeColor} strokeWidth="1.1" />
          {/* Acorn in Cup */}
          <ellipse cx="24" cy="64" rx="4.5" ry="6" transform="rotate(-25 24 64)" fill="#8c4a27" stroke={strokeColor} strokeWidth="1.2" />
          <path d="M19 60 Q24 56 29 60" stroke="#5c2e14" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
      );

    case 'moby-dick':
      return (
        <svg viewBox="0 0 150 150" fill="none" className="w-full h-full">
          {/* Nautical Chart Frame & Golden Rope-and-Wave Scroll Flourish */}
          <path className="lorea-fl-path" pathLength={1} d="M6 144 V18 L18 6 H144" stroke={strokeColor} strokeWidth="2" />
          <path className="lorea-fl-path" pathLength={1} d="M14 130 V24 L24 14 H130" stroke={secondaryColor} strokeWidth="1.2" opacity="0.75" />
          {/* Golden Wave-Scroll Filigree (from Moby Dick title flourish) */}
          <path className="lorea-fl-path" pathLength={1} d="M18 64 C18 36, 36 18, 64 18 C48 26, 44 42, 54 48 C62 52, 68 42, 60 36" stroke={secondaryColor} strokeWidth="2" strokeLinecap="round" />
          {/* Barbed Whaling Harpoon Spearhead */}
          <path className="lorea-fl-path" pathLength={1} d="M14 14 L56 56 M56 40 L56 56 L40 56" stroke={strokeColor} strokeWidth="1.8" strokeLinecap="round" />
          <circle cx="28" cy="28" r="5" stroke={secondaryColor} strokeWidth="1.5" />
        </svg>
      );

    case 'count-of-monte-cristo':
      return (
        <svg viewBox="0 0 150 150" fill="none" className="w-full h-full">
          {/* Opulent French Baroque Gold Acanthus & Fleur-de-Lis Frame */}
          <path className="lorea-fl-path" pathLength={1} d="M6 144 V22 Q6 6 22 6 H144" stroke={strokeColor} strokeWidth="2.2" />
          <path className="lorea-fl-path" pathLength={1} d="M14 130 V30 Q14 14 30 14 H130" stroke={strokeColor} strokeWidth="1.1" opacity="0.75" />
          {/* French Royal Fleur-de-Lis Crest in Corner */}
          <g transform="translate(32, 32) rotate(-45)">
            <path d="M0 -16 C4 -8, 4 0, 0 8 C-4 0, -4 -8, 0 -16 Z" fill={strokeColor} />
            <path d="M0 2 C6 -6, 14 -4, 12 4 C10 8, 4 6, 0 6 M0 2 C-6 -6, -14 -4, -12 4 C-10 8, -4 6, 0 6" fill="rgba(235,192,92,0.45)" stroke={strokeColor} strokeWidth="1.4" />
            <rect x="-7" y="5" width="14" height="2.5" rx="1" fill={secondaryColor} />
          </g>
          {/* Emerald & Ruby Jewel Cabochons */}
          <polygon points="62,14 68,20 62,26 56,20" fill="#2ec486" stroke={strokeColor} strokeWidth="1.2" />
          <circle cx="20" cy="62" r="4.5" fill="#d92644" stroke={strokeColor} strokeWidth="1.2" />
        </svg>
      );

    case 'jane-eyre':
    default:
      return (
        <svg viewBox="0 0 150 150" fill="none" className="w-full h-full">
          {/* Victorian Gothic Double Frame */}
          <path className="lorea-fl-path" pathLength={1} d="M6 144 V20 Q6 6 20 6 H144" stroke={strokeColor} strokeWidth="2" />
          <path className="lorea-fl-path" pathLength={1} d="M14 130 V28 Q14 14 28 14 H130" stroke={secondaryColor} strokeWidth="1.1" opacity="0.75" />
          {/* Windswept Gnarly Yorkshire Hawthorn Branches (from Jane Eyre cover top corners) */}
          <path className="lorea-fl-path" pathLength={1} d="M14 64 C24 42, 42 28, 78 18 M34 38 C46 36, 56 42, 68 36 M28 46 C26 58, 34 68, 42 74" stroke="#6e506b" strokeWidth="2" strokeLinecap="round" />
          {/* Purple Moorland Heather Blossoms on the Branch */}
          <g fill="#b565a7">
            <circle cx="48" cy="28" r="3" />
            <circle cx="56" cy="24" r="2.6" />
            <circle cx="64" cy="21" r="2.2" />
            <circle cx="36" cy="52" r="2.8" />
            <circle cx="40" cy="60" r="2.4" />
          </g>
          <circle cx="24" cy="24" r="4" fill={strokeColor} opacity="0.9" />
        </svg>
      );
  }
};

/**
 * Rich, multi-layered BOTTOM CORNER vector artwork rendered in code, directly adapted from the lower foreground of each Gemini cover:
 * - Pride & Prejudice: Lush English garden flower arrangement (layered pink wild Briar roses, tall magenta foxglove spires, purple lavender spikes, white daisies & sage foliage)
 * - Alice: Bioluminescent cyan & violet Wonderland mushroom cluster, painted roses & floating playing card
 * - Dracula: Sculpted pewter winged gargoyle crouching on Gothic pedestal + crimson thorny roses & medieval iron clasp
 * - Art of War: Imperial gold Phoenix + misty ink-wash mountain peaks & crimson war banner
 * - Odyssey: Athena's Owl emblem + bronze Greek trireme spandrel & Aegean wave scrolls
 * - Tom Sawyer: Whitewashed wooden picket fence + river cattails, reeds & tied log raft
 * - Little Women: Concord diamond-pane leaded window + autumn oak/maple leaves & acorns
 * - Moby Dick: Foaming turquoise ocean swells + whaleboat & crossed harpoons
 * - Count of Monte Cristo: Open iron-bound treasure chest overflowing with gold coins, ruby goblet, emerald gems & pearl necklace
 * - Jane Eyre: Lush purple Yorkshire heather spires & golden gorse wildflower arrangement
 */
export const renderBottomCornerFlourishSvg = (themeId: string, strokeColor: string, secondaryColor: string) => {
  switch (themeId) {
    case 'pride-and-prejudice':
      return (
        <svg viewBox="0 0 170 170" fill="none" className="w-full h-full">
          {/* Lower Regency Border Rails */}
          <path className="lorea-fl-path" pathLength={1} d="M6 16 V142 Q6 164 28 164 H154" stroke={strokeColor} strokeWidth="2" />
          <path className="lorea-fl-path" pathLength={1} d="M13 28 V136 Q13 157 34 157 H142" stroke={strokeColor} strokeWidth="1" opacity="0.65" />
          {/* Tall Magenta/Pink Foxglove Spire rising along the left margin (exact match to cover lower corners) */}
          <path className="lorea-fl-path" pathLength={1} d="M24 148 C22 112, 26 78, 30 44" stroke="#4a7862" strokeWidth="2" />
          <g fill="#c94a7c" stroke="#f7c6d9" strokeWidth="0.7">
            <ellipse cx="29" cy="52" rx="4" ry="2.5" transform="rotate(25 29 52)" />
            <ellipse cx="27" cy="64" rx="5" ry="3" transform="rotate(25 27 64)" />
            <ellipse cx="26" cy="77" rx="5.5" ry="3.2" transform="rotate(25 26 77)" />
            <ellipse cx="25" cy="91" rx="6" ry="3.5" transform="rotate(25 25 91)" />
            <ellipse cx="24" cy="105" rx="6.5" ry="3.6" transform="rotate(25 24 105)" />
          </g>
          {/* Purple Lavender Spikes fanning into the bottom margin */}
          <path className="lorea-fl-path" pathLength={1} d="M36 150 Q64 132 96 138 M32 146 Q52 114 74 98" stroke="#5b8c6f" strokeWidth="1.5" />
          <g fill="#8c5bb5">
            <ellipse cx="56" cy="112" rx="3.2" ry="2" transform="rotate(-35 56 112)" />
            <ellipse cx="64" cy="105" rx="3.2" ry="2" transform="rotate(-35 64 105)" />
            <ellipse cx="72" cy="99" rx="3" ry="1.8" transform="rotate(-35 72 99)" />
            <ellipse cx="74" cy="136" rx="3.2" ry="2" transform="rotate(-10 74 136)" />
            <ellipse cx="84" cy="136" rx="3.2" ry="2" transform="rotate(-10 84 136)" />
            <ellipse cx="94" cy="137" rx="3" ry="1.8" transform="rotate(-10 94 137)" />
          </g>
          {/* Sage Botanical Leaves */}
          <path d="M16 124 Q34 116 38 130 Q22 136 16 124 Z M48 152 Q64 138 72 150 Q56 160 48 152 Z" fill="#4a7862" opacity="0.9" />
          {/* Multi-Petal Pink English Briar Rose Arrangement in the Foreground */}
          <g transform="translate(36, 134)">
            <circle cx="0" cy="0" r="15" fill="#d96b86" />
            <circle cx="-4" cy="-3" r="11" fill="#ec95ac" />
            <circle cx="4" cy="3" r="10.5" fill="#e07b96" />
            <circle cx="0" cy="-1" r="7.5" fill="#f7bfd0" />
            <circle cx="0" cy="0" r="3.5" fill="#e6a832" />
          </g>
          <g transform="translate(60, 144)">
            <circle cx="0" cy="0" r="10" fill="#e88ca5" />
            <circle cx="-2" cy="-2" r="6.5" fill="#f9d0dc" />
            <circle cx="0" cy="0" r="2.5" fill="#e6a832" />
          </g>
          {/* White Regency Garden Daisy */}
          <g transform="translate(22, 114)">
            <circle cx="0" cy="-4.5" r="2.5" fill="#fffdf7" />
            <circle cx="4.5" cy="0" r="2.5" fill="#fffdf7" />
            <circle cx="0" cy="4.5" r="2.5" fill="#fffdf7" />
            <circle cx="-4.5" cy="0" r="2.5" fill="#fffdf7" />
            <circle cx="0" cy="0" r="2.2" fill="#e6a832" />
          </g>
        </svg>
      );

    case 'alice-in-wonderland':
      return (
        <svg viewBox="0 0 170 170" fill="none" className="w-full h-full">
          <path className="lorea-fl-path" pathLength={1} d="M6 20 V144 Q6 164 26 164 H152" stroke={strokeColor} strokeWidth="2.2" />
          {/* Bioluminescent Cyan & Violet Wonderland Mushrooms (from lower corners of Alice cover) */}
          <g transform="translate(34, 134)">
            {/* Stem */}
            <path d="M-4 24 C-3 10, -2 2, 0 -4 C2 2, 4 10, 5 24 Z" fill="#e2d9f3" />
            {/* Glowing Cap */}
            <path d="M-20 -2 C-18 -20, 18 -20, 20 -2 Z" fill="#2ed5b5" stroke="#9ef7e6" strokeWidth="1.4" />
            <circle cx="-8" cy="-9" r="2.2" fill="#ffffff" opacity="0.85" />
            <circle cx="2" cy="-12" r="2.6" fill="#ffffff" opacity="0.85" />
            <circle cx="10" cy="-8" r="1.8" fill="#ffffff" opacity="0.85" />
          </g>
          <g transform="translate(64, 144)">
            <path d="M-2.5 16 L0 -2 L3 16 Z" fill="#dcd0ff" />
            <path d="M-13 0 C-11 -13, 11 -13, 13 0 Z" fill="#9b5de5" stroke="#e0bbff" strokeWidth="1.2" />
            <circle cx="-4" cy="-5" r="1.6" fill="#fff" />
            <circle cx="4" cy="-6" r="1.8" fill="#fff" />
          </g>
          {/* Painted Red Rose at Base */}
          <circle cx="20" cy="112" r="8" fill="#d92644" />
          <circle cx="18" cy="110" r="4.5" fill="#ff758f" />
        </svg>
      );

    case 'dracula':
      return (
        <svg viewBox="0 0 170 170" fill="none" className="w-full h-full">
          <path className="lorea-fl-path" pathLength={1} d="M6 20 V152 L18 164 H152" stroke="#c8cdd6" strokeWidth="2.2" />
          {/* Sculpted Pewter Winged Gargoyle Crouching in Bottom Corner (matching Dracula cover) */}
          <path d="M14 148 L14 102 C26 106, 38 116, 42 132 C34 128, 28 132, 26 140 L38 148 Z" fill="rgba(200,205,214,0.35)" stroke="#c8cdd6" strokeWidth="1.5" />
          <circle cx="26" cy="122" r="5" fill="#9ea6b4" stroke="#c8cdd6" strokeWidth="1.2" />
          <circle cx="28" cy="121" r="1.3" fill={strokeColor} />
          {/* Crimson Thorny Roses */}
          <circle cx="52" cy="148" r="8" fill="#9e1424" stroke={strokeColor} strokeWidth="1.4" />
          <circle cx="52" cy="148" r="3.5" fill="#ff4d63" />
        </svg>
      );

    case 'tom-sawyer':
      return (
        <svg viewBox="0 0 170 170" fill="none" className="w-full h-full">
          <path className="lorea-fl-path" pathLength={1} d="M6 20 V146 Q6 164 24 164 H152" stroke={strokeColor} strokeWidth="2" />
          {/* Whitewashed Wooden Picket Fence in Bottom Corner (matching Tom Sawyer cover) */}
          <g fill="#f5efe2" stroke={strokeColor} strokeWidth="1.2">
            <polygon points="18,156 18,124 23,117 28,124 28,156" />
            <polygon points="34,156 34,124 39,117 44,124 44,156" />
            <polygon points="50,156 50,124 55,117 60,124 60,156" />
            <rect x="14" y="130" width="52" height="4" />
            <rect x="14" y="145" width="52" height="4" />
          </g>
          {/* Mississippi River Cattails & Reeds */}
          <path d="M22 156 Q20 112 26 78 M32 156 Q34 118 42 88" stroke="#3c7a57" strokeWidth="1.8" />
          <ellipse cx="25" cy="88" rx="3" ry="10" transform="rotate(8 25 88)" fill="#6b3e26" />
          <ellipse cx="40" cy="96" rx="2.8" ry="9" transform="rotate(12 40 96)" fill="#6b3e26" />
        </svg>
      );

    case 'count-of-monte-cristo':
      return (
        <svg viewBox="0 0 170 170" fill="none" className="w-full h-full">
          <path className="lorea-fl-path" pathLength={1} d="M6 20 V144 Q6 164 26 164 H152" stroke={strokeColor} strokeWidth="2.2" />
          {/* Monte Cristo Treasure Chest, Gold Coins, Emeralds & Ruby Goblet */}
          <rect x="18" y="132" width="38" height="22" rx="3" fill="rgba(120,78,34,0.65)" stroke={strokeColor} strokeWidth="1.6" />
          <path d="M16 132 L24 120 H50 L56 132 Z" fill="rgba(235,192,92,0.35)" stroke={strokeColor} strokeWidth="1.4" />
          {/* Overflowing Gold Coins & Gems */}
          <circle cx="28" cy="130" r="3.5" fill={strokeColor} />
          <circle cx="36" cy="128" r="4" fill="#ffd970" />
          <circle cx="44" cy="130" r="3.5" fill={strokeColor} />
          <polygon points="36,136 41,142 36,148 31,142" fill="#2ec486" stroke={strokeColor} strokeWidth="1" />
          <circle cx="66" cy="148" r="4" fill="#e5394b" stroke={strokeColor} strokeWidth="1" />
        </svg>
      );

    case 'jane-eyre':
      return (
        <svg viewBox="0 0 170 170" fill="none" className="w-full h-full">
          <path className="lorea-fl-path" pathLength={1} d="M6 20 V144 Q6 164 26 164 H152" stroke={strokeColor} strokeWidth="2" />
          {/* Lush Purple Yorkshire Heather & Moorland Wildflower Arrangement (matching Jane Eyre cover foreground) */}
          <path className="lorea-fl-path" pathLength={1} d="M18 156 Q24 114 32 78 M26 156 Q42 120 56 92 M36 156 Q68 134 98 138" stroke="#4f6d5a" strokeWidth="1.7" />
          <g fill="#b565a7">
            <circle cx="30" cy="84" r="3.5" /><circle cx="28" cy="94" r="4" /><circle cx="25" cy="105" r="4.2" />
            <circle cx="52" cy="98" r="3.5" /><circle cx="47" cy="108" r="4" /><circle cx="41" cy="118" r="4.2" />
            <circle cx="72" cy="138" r="3.8" /><circle cx="84" cy="137" r="3.5" /><circle cx="94" cy="138" r="3" />
          </g>
          <g fill="#e0a3d4">
            <circle cx="32" cy="89" r="2.2" /><circle cx="29" cy="100" r="2.5" />
            <circle cx="50" cy="103" r="2.2" /><circle cx="45" cy="113" r="2.5" />
            <circle cx="78" cy="136" r="2.2" />
          </g>
          {/* Golden Gorse Blossoms at Base */}
          <circle cx="28" cy="142" r="5.5" fill={strokeColor} />
          <circle cx="44" cy="146" r="4.5" fill={strokeColor} />
        </svg>
      );

    default:
      return (
        <svg viewBox="0 0 150 150" fill="none" className="w-full h-full" style={{ transform: 'scaleY(-1)' }}>
          {renderCornerFlourishSvg(themeId, strokeColor, secondaryColor).props.children}
        </svg>
      );
  }
};

/**
 * Rich, multi-layered CHAPTER HEADER CREST SVG rendered in code above the chapter title,
 * translating each Gemini cover's central illustration into scalable vector artwork:
 */
export const renderChapterCrestSvg = (themeId: string, strokeColor: string, secondaryColor: string) => {
  void strokeColor;
  void secondaryColor;
  return renderTelaChapterCrestSvg(themeId);
};

export const renderLegacyChapterCrestSvg = (themeId: string, strokeColor: string, secondaryColor: string) => {
  switch (themeId) {
    case 'pride-and-prejudice':
      return (
        <svg className="w-64 sm:w-80 h-20 mx-auto mb-2" viewBox="0 0 320 82" fill="none">
          {/* Sunlit Regency Halo & Lake Reflection Lines */}
          <ellipse cx="160" cy="44" rx="58" ry="26" fill="rgba(217,107,134,0.10)" />
          {/* Palladian Pemberley Estate Facade & Pediment (from cover background) */}
          <polygon points="160,12 128,26 192,26" fill="rgba(180,130,40,0.22)" stroke={strokeColor} strokeWidth="1.5" />
          <rect x="132" y="26" width="56" height="22" fill="rgba(255,250,238,0.65)" stroke={strokeColor} strokeWidth="1.4" />
          <line x1="144" y1="26" x2="144" y2="48" stroke={strokeColor} strokeWidth="1.3" />
          <line x1="154" y1="26" x2="154" y2="48" stroke={strokeColor} strokeWidth="1.3" />
          <line x1="166" y1="26" x2="166" y2="48" stroke={strokeColor} strokeWidth="1.3" />
          <line x1="176" y1="26" x2="176" y2="48" stroke={strokeColor} strokeWidth="1.3" />
          {/* Tranquil Lake Reflection Ripples */}
          <path className="lorea-fl-path" pathLength={1} d="M112 54 H208 M124 60 H196 M138 66 H182" stroke="#4a7862" strokeWidth="1.2" opacity="0.75" />
          {/* Left & Right Floral Sprays: Pink Briar Roses, Foxgloves & Lavender */}
          <path className="lorea-fl-path" pathLength={1} d="M18 52 C48 48, 78 36, 114 48 M302 52 C272 48, 242 36, 206 48" stroke="#4a7862" strokeWidth="1.8" />
          {/* Left Briar Rose & Lavender */}
          <g transform="translate(88, 44)">
            <circle cx="0" cy="0" r="10" fill="#d96b86" />
            <circle cx="-2" cy="-2" r="6.5" fill="#f5b8c9" />
            <circle cx="0" cy="0" r="2.3" fill="#e6a832" />
          </g>
          <g transform="translate(64, 48)">
            <circle cx="0" cy="0" r="7" fill="#ec95ac" />
            <circle cx="0" cy="0" r="2" fill="#e6a832" />
          </g>
          {/* Right Briar Rose & Lavender */}
          <g transform="translate(232, 44)">
            <circle cx="0" cy="0" r="10" fill="#d96b86" />
            <circle cx="2" cy="-2" r="6.5" fill="#f5b8c9" />
            <circle cx="0" cy="0" r="2.3" fill="#e6a832" />
          </g>
          <g transform="translate(256, 48)">
            <circle cx="0" cy="0" r="7" fill="#ec95ac" />
            <circle cx="0" cy="0" r="2" fill="#e6a832" />
          </g>
          {/* Lavender Spikes on Both Sides */}
          <g fill="#8c5bb5">
            <ellipse cx="44" cy="42" rx="3" ry="1.8" transform="rotate(-20 44 42)" />
            <ellipse cx="35" cy="45" rx="3" ry="1.8" transform="rotate(-20 35 45)" />
            <ellipse cx="276" cy="42" rx="3" ry="1.8" transform="rotate(20 276 42)" />
            <ellipse cx="285" cy="45" rx="3" ry="1.8" transform="rotate(20 285 45)" />
          </g>
        </svg>
      );

    case 'frankenstein':
      return (
        <svg className="w-64 sm:w-80 h-20 mx-auto mb-2" viewBox="0 0 320 82" fill="none">
          {/* Jagged Mer de Glace Alpine Glacier Peaks */}
          <polygon points="36,68 88,28 118,52 160,12 202,52 232,28 284,68" fill="rgba(94,194,255,0.15)" stroke={strokeColor} strokeWidth="1.7" />
          <polygon points="118,52 160,12 168,52" fill="rgba(180,232,255,0.22)" />
          {/* Forked Electric Lightning Bolt Splitting the Sky */}
          <path className="lorea-fl-path" pathLength={1} d="M160 2 L148 24 L166 26 L150 54 L164 54 L154 76" stroke="#ffffff" strokeWidth="2.4" strokeLinecap="round" />
          <path className="lorea-fl-path" pathLength={1} d="M148 24 L126 38 M166 26 L192 40" stroke={strokeColor} strokeWidth="1.5" />
          {/* Amber Alchemical Glow Nodes */}
          <circle cx="88" cy="28" r="3" fill={secondaryColor} />
          <circle cx="232" cy="28" r="3" fill={secondaryColor} />
        </svg>
      );

    case 'alice-in-wonderland':
      return (
        <svg className="w-64 sm:w-80 h-20 mx-auto mb-2" viewBox="0 0 320 82" fill="none">
          {/* Ornate Golden Keyhole Centerpiece + Pocket Watch + Painted Roses & Glowing Mushrooms */}
          <path className="lorea-fl-path" pathLength={1} d="M24 54 C68 54, 96 34, 132 46 M296 54 C252 54, 224 34, 188 46" stroke={strokeColor} strokeWidth="1.8" />
          {/* Keyhole Arch */}
          <circle cx="160" cy="26" r="15" fill="rgba(46,213,181,0.18)" stroke={strokeColor} strokeWidth="2.2" />
          <polygon points="151,38 169,38 175,68 145,68" fill="rgba(46,213,181,0.15)" stroke={strokeColor} strokeWidth="2" />
          {/* Clock Hands Inside Keyhole */}
          <path d="M160 26 V16 M160 26 L168 29" stroke={strokeColor} strokeWidth="1.6" strokeLinecap="round" />
          {/* Painted Red Roses & Glowing Mushrooms Flanking the Keyhole */}
          <circle cx="118" cy="48" r="9" fill="#d92644" />
          <circle cx="116" cy="46" r="5" fill="#ff758f" />
          <circle cx="202" cy="48" r="9" fill="#d92644" />
          <circle cx="204" cy="46" r="5" fill="#ff758f" />
          <path d="M84 52 C86 40, 102 40, 104 52 Z" fill="#2ed5b5" />
          <path d="M216 52 C218 40, 234 40, 236 52 Z" fill="#9b5de5" />
        </svg>
      );

    case 'dracula':
      return (
        <svg className="w-64 sm:w-80 h-20 mx-auto mb-2" viewBox="0 0 320 82" fill="none">
          {/* Colossal Blood-Red Full Moon + Castle Dracula Spires + Bats */}
          <circle cx="160" cy="40" r="26" fill="rgba(229,57,75,0.28)" stroke={strokeColor} strokeWidth="1.8" />
          {/* Castle Dracula Silhouette */}
          <polygon points="140,66 140,42 146,28 152,42 156,34 160,16 164,34 168,42 174,28 180,42 180,66" fill="#120609" stroke="#c8cdd6" strokeWidth="1.2" />
          {/* Spread-Winged Bats Flanking the Blood Moon */}
          <path className="lorea-fl-path" pathLength={1} d="M44 44 C72 20, 102 26, 124 42 C98 44, 76 52, 44 44 Z M276 44 C248 20, 218 26, 196 42 C222 44, 244 52, 276 44 Z" fill="rgba(229,57,75,0.24)" stroke={strokeColor} strokeWidth="1.6" />
        </svg>
      );

    case 'sherlock-holmes':
      return (
        <svg className="w-64 sm:w-80 h-20 mx-auto mb-2" viewBox="0 0 320 82" fill="none">
          {/* Swirling London Fog & Brass Magnifying Glass + 221B Gas Lamp */}
          <path className="lorea-fl-path" pathLength={1} d="M24 46 Q76 34 128 46 M192 46 Q244 58 296 46" stroke="#45a29e" strokeWidth="1.6" />
          <circle cx="160" cy="36" r="20" fill="rgba(240,184,92,0.16)" stroke={strokeColor} strokeWidth="2.2" />
          <circle cx="160" cy="36" r="15" stroke={strokeColor} strokeWidth="1" opacity="0.65" />
          <path d="M174 50 L194 70" stroke={strokeColor} strokeWidth="4" strokeLinecap="round" />
          <text x="160" y="40" textAnchor="middle" fill={strokeColor} fontSize="11" fontWeight="bold" fontFamily="Georgia, serif">221B</text>
        </svg>
      );

    case 'art-of-war':
      return (
        <svg className="w-64 sm:w-80 h-20 mx-auto mb-2" viewBox="0 0 320 82" fill="none">
          {/* Tied Bamboo-Slip Scroll + Bronze Jian Sword + Black & White Go Stones */}
          <rect x="96" y="24" width="128" height="32" rx="4" fill="rgba(232,185,96,0.14)" stroke={strokeColor} strokeWidth="1.6" />
          <line x1="116" y1="24" x2="116" y2="56" stroke={strokeColor} strokeWidth="1.2" />
          <line x1="136" y1="24" x2="136" y2="56" stroke={strokeColor} strokeWidth="1.2" />
          <line x1="160" y1="24" x2="160" y2="56" stroke={strokeColor} strokeWidth="1.2" />
          <line x1="184" y1="24" x2="184" y2="56" stroke={strokeColor} strokeWidth="1.2" />
          <line x1="204" y1="24" x2="204" y2="56" stroke={strokeColor} strokeWidth="1.2" />
          {/* Bronze Jian Sword Horizontally Across */}
          <path className="lorea-fl-path" pathLength={1} d="M28 40 H292" stroke={strokeColor} strokeWidth="2.2" />
          <polygon points="160,14 172,40 160,66 148,40" fill="rgba(217,56,41,0.32)" stroke={strokeColor} strokeWidth="1.6" />
          {/* Go Stones (Weiqi) */}
          <circle cx="68" cy="40" r="5.5" fill="#111" stroke={strokeColor} strokeWidth="1.2" />
          <circle cx="252" cy="40" r="5.5" fill="#f5efe2" stroke={strokeColor} strokeWidth="1.2" />
        </svg>
      );

    case 'the-odyssey':
      return (
        <svg className="w-64 sm:w-80 h-20 mx-auto mb-2" viewBox="0 0 320 82" fill="none">
          {/* Bronze Greek Trireme with Billowing Sail & Aegean Waves */}
          <path className="lorea-fl-path" pathLength={1} d="M118 54 C132 70, 188 70, 206 50 L194 50 H126 Z" fill="rgba(200,90,50,0.38)" stroke={strokeColor} strokeWidth="1.8" />
          {/* Billowing Sail with Athena's Owl Emblem */}
          <path d="M160 10 L160 50 M136 18 Q160 12 184 18 Q190 32 182 44 H138 Q130 32 136 18 Z" fill="rgba(235,168,76,0.22)" stroke={strokeColor} strokeWidth="1.6" />
          <circle cx="156" cy="30" r="3" fill={strokeColor} />
          <circle cx="164" cy="30" r="3" fill={strokeColor} />
          {/* Cresting Aegean Waves */}
          <path className="lorea-fl-path" pathLength={1} d="M24 64 Q44 50 64 64 T104 64 T144 64 T184 64 T224 64 T264 64 T296 64" stroke={strokeColor} strokeWidth="1.8" />
        </svg>
      );

    case 'tom-sawyer':
      return (
        <svg className="w-64 sm:w-80 h-20 mx-auto mb-2" viewBox="0 0 320 82" fill="none">
          {/* Twin-Stack Mississippi Paddlewheel Steamboat & River Ripples */}
          <rect x="122" y="36" width="76" height="18" rx="2" fill="rgba(255,250,240,0.75)" stroke={strokeColor} strokeWidth="1.6" />
          <rect x="138" y="14" width="6" height="22" fill={strokeColor} />
          <rect x="172" y="14" width="6" height="22" fill={strokeColor} />
          <circle cx="160" cy="48" r="11" fill="rgba(158,107,43,0.22)" stroke={strokeColor} strokeWidth="1.6" />
          <path className="lorea-fl-path" pathLength={1} d="M32 60 Q80 50 128 60 T224 60 T288 60" stroke="#2e6f8e" strokeWidth="1.8" />
        </svg>
      );

    case 'little-women':
      return (
        <svg className="w-64 sm:w-80 h-20 mx-auto mb-2" viewBox="0 0 320 82" fill="none">
          {/* Jo's White Feather Quill & Brass Inkwell + Oak Leaves */}
          <path className="lorea-fl-path" pathLength={1} d="M138 64 L188 14 C196 22, 184 44, 158 52 Z" fill="rgba(255,250,240,0.8)" stroke={strokeColor} strokeWidth="1.6" />
          <rect x="126" y="52" width="20" height="14" rx="2" fill="rgba(200,135,46,0.45)" stroke={strokeColor} strokeWidth="1.5" />
          {/* Flanking Autumn Oak Leaves */}
          <path className="lorea-fl-path" pathLength={1} d="M36 48 Q80 34 118 48 M284 48 Q240 34 202 48" stroke={strokeColor} strokeWidth="1.6" />
          <circle cx="92" cy="44" r="6" fill="#c8872e" />
          <circle cx="228" cy="44" r="6" fill="#a84a2a" />
        </svg>
      );

    case 'moby-dick':
      return (
        <svg className="w-64 sm:w-80 h-20 mx-auto mb-2" viewBox="0 0 320 82" fill="none">
          {/* Breaching White Whale & Crossed Whaling Harpoons over Foaming Swells */}
          <path className="lorea-fl-path" pathLength={1} d="M110 66 L210 14 M210 66 L110 14" stroke={secondaryColor} strokeWidth="1.6" />
          <path d="M132 54 C136 24, 166 16, 184 32 C192 40, 190 52, 202 56 L126 56 Z" fill="#e5eff5" stroke={strokeColor} strokeWidth="1.6" />
          <path className="lorea-fl-path" pathLength={1} d="M24 62 Q64 46 104 62 T184 62 T264 62 T296 62" stroke={strokeColor} strokeWidth="2" />
        </svg>
      );

    case 'count-of-monte-cristo':
      return (
        <svg className="w-64 sm:w-80 h-20 mx-auto mb-2" viewBox="0 0 320 82" fill="none">
          {/* Island Fortress Château d'If + Crescent Moon + Crossed Rapiers & Fleur-de-Lis */}
          <path className="lorea-fl-path" pathLength={1} d="M88 58 L232 22 M232 58 L88 22" stroke={strokeColor} strokeWidth="1.6" />
          <polygon points="142,60 146,30 156,30 156,22 166,22 166,30 174,30 178,60" fill="#0f1f33" stroke={strokeColor} strokeWidth="1.6" />
          <polygon points="160,10 167,20 160,30 153,20" fill="#2ec486" stroke={strokeColor} strokeWidth="1.3" />
        </svg>
      );

    case 'jane-eyre':
    default:
      return (
        <svg className="w-64 sm:w-80 h-20 mx-auto mb-2" viewBox="0 0 320 82" fill="none">
          {/* Crenellated Thornfield Hall Tower with Glowing Amber Gothic Window + Purple Heather */}
          <polygon points="142,66 142,20 148,20 148,26 156,26 156,18 164,18 164,26 172,26 172,20 178,20 178,66" fill="#23182b" stroke={strokeColor} strokeWidth="1.6" />
          {/* Glowing Amber Gothic Window */}
          <path d="M155 46 V36 C155 31, 165 31, 165 36 V46 Z" fill={strokeColor} />
          {/* Flanking Purple Heather Sprays */}
          <path className="lorea-fl-path" pathLength={1} d="M36 54 Q88 38 134 54 M284 54 Q232 38 186 54" stroke="#b565a7" strokeWidth="1.8" />
          <circle cx="96" cy="46" r="4" fill="#b565a7" />
          <circle cx="110" cy="48" r="3.5" fill="#e0a3d4" />
          <circle cx="224" cy="46" r="4" fill="#b565a7" />
          <circle cx="210" cy="48" r="3.5" fill="#e0a3d4" />
        </svg>
      );
  }
};

// Optional per-theme Omni recipe overrides when rebuilt live via Omni -> Tela
const omniRecipeOverrides = new Map<string, Partial<OmniFlourishRecipe>>();

export function setThemeOmniRecipeOverride(themeId: string, recipe: Partial<OmniFlourishRecipe>) {
  omniRecipeOverrides.set(themeId, recipe);
}

export const renderTelaChapterCrestSvg = (themeId: string) => {
  const bundle = buildClassicBookTelaFlourishBundle(themeId, omniRecipeOverrides.get(themeId));
  return (
    <div
      className="w-64 sm:w-80 h-22 mx-auto mb-2 flex items-center justify-center [&>svg]:w-full [&>svg]:h-full"
      dangerouslySetInnerHTML={{ __html: bundle.chapterCrestSvg }}
    />
  );
};

export const renderUnderTitleFlourishSvg = (strokeColor: string, secondaryColor: string, themeId?: string) => {
  const resolvedId = themeId || 'pride-and-prejudice';
  const bundle = buildClassicBookTelaFlourishBundle(resolvedId, omniRecipeOverrides.get(resolvedId));
  void strokeColor;
  void secondaryColor;
  return (
    <div
      className="w-64 sm:w-80 h-11 mx-auto mt-1.5 mb-5 flex items-center justify-center [&>svg]:w-full [&>svg]:h-full"
      dangerouslySetInnerHTML={{ __html: bundle.underTitleSvg }}
    />
  );
};

export const renderIlluminatedDropCapSvg = (themeId: string) => {
  const bundle = buildClassicBookTelaFlourishBundle(themeId, omniRecipeOverrides.get(themeId));
  return (
    <div
      className="w-full h-full [&>svg]:w-full [&>svg]:h-full"
      dangerouslySetInnerHTML={{ __html: bundle.illuminatedDropCapSvg }}
    />
  );
};

export const renderSceneBreakDividerSvg = (themeId: string) => {
  const bundle = buildClassicBookTelaFlourishBundle(themeId, omniRecipeOverrides.get(themeId));
  return (
    <div
      className="w-56 sm:w-64 h-8 mx-auto my-5 flex items-center justify-center [&>svg]:w-full [&>svg]:h-full"
      dangerouslySetInnerHTML={{ __html: bundle.sceneBreakSvg }}
    />
  );
};

const FLOURISH_ANIMATION_CSS = `
@keyframes lorea-flourish-draw {
  0% { stroke-dashoffset: 1; opacity: 0.25; }
  65% { stroke-dashoffset: 0; opacity: 1; }
  100% { stroke-dashoffset: 0; opacity: 0.95; }
}
@keyframes lorea-tela-bloom {
  0% { opacity: 0.15; transform: scale(0.96); }
  100% { opacity: 1; transform: scale(1); }
}
.lorea-flourish-awakening .lorea-fl-path {
  stroke-dasharray: 1;
  stroke-dashoffset: 1;
  animation: lorea-flourish-draw 2.6s cubic-bezier(0.22, 1, 0.36, 1) forwards;
}
.lorea-flourish-awakening .lorea-tela-scene {
  animation: lorea-tela-bloom 1.6s cubic-bezier(0.22, 1, 0.36, 1) forwards;
}
.lorea-flourish-settled .lorea-fl-path {
  stroke-dasharray: none;
  stroke-dashoffset: 0;
  opacity: 0.92;
}
`;

interface ClassicPageFlourishFrameProps {
  theme: ClassicPageTheme;
  motionState: 'awakening' | 'settled' | 'static';
  pageKey: string;
  children: React.ReactNode;
}

/**
 * Wraps the book page surface with the bespoke cover-matched Tela Painterly & Vector Scene
 * corner flourishes (`topCornerSvg`, `bottomCornerSvg`), vertical outer-margin garlands (`marginGarlandSvg`),
 * double-ruled borders, subtle cover-art watermark wash, and 6-second settling particles.
 */
export const ClassicPageFlourishFrame: React.FC<ClassicPageFlourishFrameProps> = ({
  theme,
  motionState,
  pageKey,
  children,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const telaBundle = useMemo(
    () => buildClassicBookTelaFlourishBundle(theme.id, omniRecipeOverrides.get(theme.id)),
    [theme.id, pageKey]
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (motionState === 'static') {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }

    let rafId = 0;
    const startTime = performance.now();
    const SETTLE_MS = 6000;
    const w = (canvas.width = canvas.offsetWidth || 720);
    const h = (canvas.height = canvas.offsetHeight || 920);

    const motes = Array.from({ length: 24 }, (_, i) => ({
      x: ((i * 97) % 100) * 0.01 * w,
      y: ((i * 53) % 100) * 0.01 * h,
      vx: (((i % 5) - 2) * 0.16),
      vy: theme.moteType === 'leaf' || theme.moteType === 'pollen' ? 0.22 : -0.24,
      r: 1.3 + (i % 3) * 0.9,
      phase: i * 0.8,
    }));

    const tick = (now: number) => {
      const elapsed = now - startTime;
      const damp = motionState === 'settled' ? 0 : Math.max(0, 1 - elapsed / SETTLE_MS);
      ctx.clearRect(0, 0, w, h);

      if (damp <= 0.01) return;

      for (const m of motes) {
        m.x = (m.x + m.vx * damp + w) % w;
        m.y = (m.y + m.vy * damp + h) % h;
        const alpha = (0.18 + 0.22 * Math.sin(now * 0.002 + m.phase)) * damp;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = theme.palette.accent;
        ctx.beginPath();
        ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      if (damp > 0.01) {
        rafId = requestAnimationFrame(tick);
      }
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [theme.id, pageKey, motionState, theme.moteType, theme.palette.accent]);

  const animClass =
    motionState === 'awakening' ? 'lorea-flourish-awakening' : 'lorea-flourish-settled';

  return (
    <div
      className={`relative w-full h-full overflow-y-auto rounded-2xl sm:rounded-3xl transition-colors duration-500 ${animClass}`}
      style={{
        background: theme.palette.pageBg,
        color: theme.palette.ink,
        border: `1px solid ${theme.palette.pageBorder}`,
        boxShadow: `0 24px 70px rgba(0,0,0,0.55), inset 0 0 72px ${theme.palette.glow}`,
      }}
    >
      <style>{FLOURISH_ANIMATION_CSS}</style>

      {/* Subtle Cover-Art Atmospheric Wash at Top of Page */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-56 opacity-[0.11] bg-cover bg-center"
        style={{
          backgroundImage: `url('${theme.coverUrl}')`,
          WebkitMaskImage: 'linear-gradient(to bottom, rgba(0,0,0,0.95), transparent)',
          maskImage: 'linear-gradient(to bottom, rgba(0,0,0,0.95), transparent)',
          filter: 'saturate(1.2) blur(2px)',
        }}
      />

      {/* Settling Atmospheric Mote Canvas (draws gently for 6s then settles to stillness) */}
      <canvas
        ref={canvasRef}
        className="pointer-events-none absolute inset-0 w-full h-full z-[1]"
        aria-hidden="true"
      />

      {/* Outer Page-Framing Double Border, Top & Bottom Tela Painterly Scene Corners & Side-Margin Garlands */}
      <div className="pointer-events-none absolute inset-1.5 sm:inset-3 z-[2]" aria-hidden="true">
        {/* Outer & Inner Regency / Classical Double-Ruled Frame */}
        <div
          className="absolute inset-1.5 sm:inset-2.5 rounded-xl opacity-55"
          style={{ border: `1.5px solid ${theme.palette.pageBorder}` }}
        />
        <div
          className="absolute inset-3 sm:inset-4 rounded-lg opacity-35"
          style={{ border: `1px dashed ${theme.palette.pageBorder}` }}
        />

        {/* Subtle Centered Full-Page Bookplate Watermark Engraving */}
        <div
          className="lorea-tela-scene absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-56 h-56 sm:w-72 sm:h-72 opacity-[0.14] [&>svg]:w-full [&>svg]:h-full"
          dangerouslySetInnerHTML={{ __html: telaBundle.watermarkSvg }}
        />

        {/* Top-Left & Top-Right High-Fidelity Tela Painterly Scene Vector Art */}
        <div
          className="lorea-tela-scene absolute top-0 left-0 w-24 h-24 sm:w-36 sm:h-36 [&>svg]:w-full [&>svg]:h-full"
          dangerouslySetInnerHTML={{ __html: telaBundle.topCornerSvg }}
        />
        <div
          className="lorea-tela-scene absolute top-0 right-0 w-24 h-24 sm:w-36 sm:h-36 [&>svg]:w-full [&>svg]:h-full"
          style={{ transform: 'scaleX(-1)' }}
          dangerouslySetInnerHTML={{ __html: telaBundle.topCornerSvg }}
        />

        {/* Left & Right Vertical Illuminated Margin Garlands */}
        <div
          className="lorea-tela-scene hidden md:block absolute left-0 top-1/2 -translate-y-1/2 w-9 h-64 opacity-85 [&>svg]:w-full [&>svg]:h-full"
          dangerouslySetInnerHTML={{ __html: telaBundle.marginGarlandSvg }}
        />
        <div
          className="lorea-tela-scene hidden md:block absolute right-0 top-1/2 -translate-y-1/2 w-9 h-64 opacity-85 [&>svg]:w-full [&>svg]:h-full"
          style={{ transform: 'scaleX(-1)' }}
          dangerouslySetInnerHTML={{ __html: telaBundle.marginGarlandSvg }}
        />

        {/* Bottom-Left & Bottom-Right Lush Tela Botanical / Scenic Vector Arrangements */}
        <div
          className="lorea-tela-scene absolute bottom-0 left-0 w-28 h-28 sm:w-40 sm:h-40 [&>svg]:w-full [&>svg]:h-full"
          dangerouslySetInnerHTML={{ __html: telaBundle.bottomCornerSvg }}
        />
        <div
          className="lorea-tela-scene absolute bottom-0 right-0 w-28 h-28 sm:w-40 sm:h-40 [&>svg]:w-full [&>svg]:h-full"
          style={{ transform: 'scaleX(-1)' }}
          dangerouslySetInnerHTML={{ __html: telaBundle.bottomCornerSvg }}
        />
      </div>

      {/* Main Page Content */}
      <div className="relative z-[3]">{children}</div>
    </div>
  );
};

interface ClassicThemeViewerDrawerProps {
  open: boolean;
  onClose: () => void;
  themesEnabled: boolean;
  onToggleThemesEnabled: (enabled: boolean) => void;
  motionMode: 'settle' | 'static';
  onChangeMotionMode: (mode: 'settle' | 'static') => void;
  motionState: 'awakening' | 'settled' | 'static';
  onReplayMotion: () => void;
  activeTheme: ClassicPageTheme;
  selectedThemeOverride: string | null;
  onSelectThemeOverride: (themeId: string | null) => void;
  matchedBookTheme: ClassicPageTheme | null;
}

/**
 * Interactive "Themes & Literary Score" Drawer in BookReader.tsx:
 * 1. Tela Painterly & Vector Scene Flourishes (with Omni -> Tela Vector Studio live rebuild).
 * Clean user-facing drawer for:
 * 1. Choosing any of the 12 Illuminated Edition Page Themes (with ON/OFF toggle & motion settle preference)
 * 2. Listening to the book's 6-Track Original Soundtrack Playlist while reading (admin-seeded in Melos Studio)
 */
export const ClassicThemeViewerDrawer: React.FC<ClassicThemeViewerDrawerProps> = ({
  open,
  onClose,
  themesEnabled,
  onToggleThemesEnabled,
  motionMode,
  onChangeMotionMode,
  onReplayMotion,
  activeTheme,
  selectedThemeOverride,
  onSelectThemeOverride,
  matchedBookTheme,
}) => {
  const [activeTab, setActiveTab] = useState<'flourishes' | 'soundtrack'>('flourishes');
  const [scoreMode, setScoreMode] = useState<'full-film-score' | 'light-background'>('full-film-score');
  const [playingTrackId, setPlayingTrackId] = useState<string | null>(null);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [renderingTrackId, setRenderingTrackId] = useState<string | null>(null);
  const [selectedTrackIdx, setSelectedTrackIdx] = useState<number>(0);
  const [currentTimeSec, setCurrentTimeSec] = useState<number>(0);
  const [durationSec, setDurationSec] = useState<number>(0);
  const [activeSectionCue, setActiveSectionCue] = useState<string>('I. Overture & Atmospheric Establishing Shot');
  const [autoAdvance, setAutoAdvance] = useState<boolean>(true);

  const audioElRef = useRef<HTMLAudioElement | null>(null);

  const soundtrackAlbum =
    CLASSIC_BOOK_SOUNDTRACKS[activeTheme.id] || CLASSIC_BOOK_SOUNDTRACKS['pride-and-prejudice'];
  const masterScore = getMasterBookScore(activeTheme.id);
  const currentTrack: ClassicBookTrackScore =
    soundtrackAlbum.tracks[selectedTrackIdx] || soundtrackAlbum.tracks[0];
  const currentMasterMvt = masterScore?.movements[selectedTrackIdx] || masterScore?.movements[0];

  const telaBundle = useMemo(
    () => buildClassicBookTelaFlourishBundle(activeTheme.id, omniRecipeOverrides.get(activeTheme.id)),
    [activeTheme.id]
  );

  const stopPlayback = () => {
    stopRealtimeSympPlayback();
    if (audioElRef.current) {
      audioElRef.current.pause();
      audioElRef.current.src = '';
      audioElRef.current = null;
    }
    setPlayingTrackId(null);
    setIsPaused(false);
    setCurrentTimeSec(0);
    setDurationSec(0);
  };

  useEffect(() => {
    return () => {
      stopRealtimeSympPlayback();
      if (audioElRef.current) {
        audioElRef.current.pause();
        audioElRef.current = null;
      }
    };
  }, []);

  const playMovementAtIndex = async (idx: number, modeOverride?: 'full-film-score' | 'light-background') => {
    const activeMode = modeOverride ?? scoreMode;
    const tracks = soundtrackAlbum.tracks;
    const clampedIdx = ((idx % tracks.length) + tracks.length) % tracks.length;
    const targetTrack = tracks[clampedIdx];
    const targetMasterMvt = masterScore?.movements[clampedIdx] || masterScore?.movements[0];
    if (!targetTrack) return;

    // If clicking the currently playing track without changing mode, stop/pause
    if (!modeOverride && playingTrackId === targetTrack.id && !isPaused) {
      stopPlayback();
      return;
    }

    stopPlayback();
    setSelectedTrackIdx(clampedIdx);
    setRenderingTrackId(targetTrack.id);

    const estBeats = activeMode === 'light-background'
      ? (targetMasterMvt?.lightBackgroundLengthBeats || 32)
      : (targetMasterMvt?.lengthBeats || 320);
    const estDuration = Math.round((estBeats * 60) / (targetMasterMvt?.bpm || targetTrack.bpm));
    setDurationSec(estDuration);
    setPlayingTrackId(targetTrack.id);
    setIsPaused(false);
    setRenderingTrackId(null);

    await playRealtimeSympMovement(
      activeTheme.id,
      clampedIdx,
      activeMode,
      (curSec, totSec, _beat16, sectionLabel) => {
        setCurrentTimeSec(curSec);
        if (totSec > 0) setDurationSec(totSec);
        if (sectionLabel) setActiveSectionCue(sectionLabel);
      },
      () => {
        if (autoAdvance) {
          const nextIdx = (clampedIdx + 1) % tracks.length;
          void playMovementAtIndex(nextIdx, activeMode);
        } else {
          setPlayingTrackId(null);
          setIsPaused(false);
          setCurrentTimeSec(0);
        }
      }
    );
  };

  const handleSwitchScoreMode = (nextMode: 'full-film-score' | 'light-background') => {
    if (nextMode === scoreMode) return;
    setScoreMode(nextMode);
    if (playingTrackId) {
      void playMovementAtIndex(selectedTrackIdx, nextMode);
    }
  };

  const handleOpenInChoraDaw = (trackIdx = selectedTrackIdx) => {
    stopPlayback();
    onClose();
    launchClassicBookInChoraDaw(activeTheme.id, trackIdx);
  };

  const formatTime = (sec: number) => {
    if (!Number.isFinite(sec) || sec < 0) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  if (!open) return null;

  const sectionMarkers = currentMasterMvt?.sectionMarkers || [];
  const shortSectionNames = ['I. Overture', 'II. Theme A', 'III. Dialogue', 'IV. Conflict', 'V. Soliloquy', 'VI. Climax', 'VII. Coda'];

  return (
    <div
      className="fixed inset-0 z-[180] bg-black/60 backdrop-blur-sm flex justify-end"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-[#0e0d14]/95 backdrop-blur-2xl border-l border-white/15 h-full flex flex-col text-white shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-white/10 flex items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles size={16} className="text-amber-400" />
              <h3 className="text-sm font-black uppercase tracking-widest">
                Illuminated Page Themes & Symphonic Film Score
              </h3>
            </div>
            <p className="text-[11px] text-white/55 mt-0.5">
              Art Council Page Flourishes · ACE-Step 2.5 + 7-Synth MPE Film Scores · Chora DAW Showcases
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/15 flex items-center justify-center text-white/60 hover:text-white transition-colors"
            aria-label="Close Themes Viewer"
          >
            <X size={16} />
          </button>
        </div>

        {/* Mode Switcher Tabs */}
        <div className="px-4 pt-3 pb-2 border-b border-white/10 flex gap-2 bg-white/[0.01]">
          <button
            type="button"
            onClick={() => setActiveTab('flourishes')}
            className={`flex-1 py-2.5 px-3 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5 transition-all ${
              activeTab === 'flourishes'
                ? 'bg-amber-400 text-black shadow-lg'
                : 'bg-white/5 text-white/60 hover:text-white hover:bg-white/10'
            }`}
          >
            <Layers size={13} />
            <span>Page Themes (12)</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('soundtrack')}
            className={`flex-1 py-2.5 px-3 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5 transition-all ${
              activeTab === 'soundtrack'
                ? 'bg-gradient-to-r from-amber-400 to-orange-500 text-black shadow-lg'
                : 'bg-white/5 text-white/60 hover:text-white hover:bg-white/10'
            }`}
          >
            <Music size={13} />
            <span>Film Score & DAW (6)</span>
            {playingTrackId && !isPaused && <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />}
          </button>
        </div>

        {activeTab === 'flourishes' ? (
          <>
            {/* Master ON / OFF Switch & Art Council Deliberation */}
            <div className="p-4 border-b border-white/10 space-y-3 bg-white/[0.02]">
              <div className="flex items-center justify-between gap-3 p-3.5 rounded-2xl bg-white/[0.04] border border-white/10">
                <div>
                  <div className="text-xs font-black uppercase tracking-wider flex items-center gap-2">
                    {themesEnabled ? <Eye size={14} className="text-emerald-400" /> : <EyeOff size={14} className="text-white/40" />}
                    <span>Illuminated Page Flourishes</span>
                    <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${themesEnabled ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-white/10 text-white/50'}`}>
                      {themesEnabled ? 'ON' : 'OFF'}
                    </span>
                  </div>
                  <p className="text-[11px] text-white/55 mt-1">
                    {telaBundle.mediumDescription}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onToggleThemesEnabled(!themesEnabled)}
                  className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shrink-0 ${
                    themesEnabled
                      ? 'bg-emerald-500 text-black shadow-[0_0_20px_rgba(16,185,129,0.4)]'
                      : 'bg-white/10 text-white/70 hover:bg-white/20'
                  }`}
                >
                  {themesEnabled ? 'Turn Off' : 'Turn On'}
                </button>
              </div>

              {/* Art Council Deliberation Card for Active Book */}
              <div className="p-3 rounded-xl bg-amber-400/[0.06] border border-amber-400/25 space-y-1.5">
                <div className="flex flex-wrap items-center justify-between gap-1 text-[9px] font-black uppercase tracking-wider text-amber-300">
                  <span>
                    Art Council: {telaBundle.artCouncilDeliberation.leadDirectorName} × {telaBundle.artCouncilDeliberation.counterpointDirectorName}
                  </span>
                  <span className="text-white/55">
                    Editor: {telaBundle.artCouncilDeliberation.editorDirectorName}
                  </span>
                </div>
                <p className="text-[10.5px] text-white/80 leading-relaxed">
                  {telaBundle.artCouncilDeliberation.structuralDirective}
                </p>
                <div className="flex flex-wrap gap-1.5 pt-0.5 text-[9.5px] text-amber-200/80">
                  <span className="px-2 py-0.5 rounded bg-white/5 border border-white/10">
                    Margin: {telaBundle.artCouncilDeliberation.borderArchitectureName}
                  </span>
                  <span className="px-2 py-0.5 rounded bg-white/5 border border-white/10">
                    Drop-Cap: {telaBundle.artCouncilDeliberation.dropCapArchitectureName}
                  </span>
                </div>
              </div>

              {themesEnabled && (
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <div className="flex items-center gap-1.5 bg-white/5 p-1 rounded-xl border border-white/10">
                    <button
                      type="button"
                      onClick={() => onChangeMotionMode('settle')}
                      className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${
                        motionMode === 'settle' ? 'bg-amber-400 text-black' : 'text-white/60 hover:text-white'
                      }`}
                    >
                      Settle After 6s
                    </button>
                    <button
                      type="button"
                      onClick={() => onChangeMotionMode('static')}
                      className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${
                        motionMode === 'static' ? 'bg-amber-400 text-black' : 'text-white/60 hover:text-white'
                      }`}
                    >
                      Static Only
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={onReplayMotion}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-[10px] font-black uppercase tracking-wider text-amber-300 transition-all"
                    title="Replay page flourish entrance"
                  >
                    <RotateCcw size={12} />
                    <span>Replay Entrance</span>
                  </button>
                </div>
              )}
            </div>

            {/* 12 Cover-Matched Classic Themes Gallery */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2.5 custom-scrollbar">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-black uppercase tracking-widest text-white/45">
                  12 Museum-Grade Illuminated Editions
                </span>
                {selectedThemeOverride && matchedBookTheme && (
                  <button
                    type="button"
                    onClick={() => onSelectThemeOverride(null)}
                    className="text-[10px] font-bold text-amber-300 hover:underline"
                  >
                    Reset to Book Default ({matchedBookTheme.title})
                  </button>
                )}
              </div>

              {CLASSIC_PAGE_THEMES.map(t => {
                const isSelected = themesEnabled && activeTheme.id === t.id;
                const isBookDefault = matchedBookTheme?.id === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      if (!themesEnabled) onToggleThemesEnabled(true);
                      onSelectThemeOverride(isBookDefault ? null : t.id);
                    }}
                    className={`w-full text-left p-2.5 rounded-2xl border transition-all flex items-center gap-3.5 ${
                      isSelected
                        ? 'bg-amber-400/12 border-amber-400/60 shadow-[0_8px_24px_rgba(0,0,0,0.35)]'
                        : 'bg-white/[0.03] border-white/10 hover:bg-white/[0.06] hover:border-white/20'
                    }`}
                  >
                    <img
                      src={t.coverUrl}
                      alt={t.title}
                      className="w-12 h-16 rounded-lg object-cover shrink-0 shadow-md border border-white/15"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-black text-white truncate">{t.title}</span>
                        {isBookDefault && (
                          <span className="px-1.5 py-0.5 rounded text-[8px] font-black uppercase bg-amber-400/20 text-amber-300 shrink-0">
                            Matched
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] font-bold text-amber-300/90 truncate mt-0.5">{t.themeName}</div>
                      <div className="text-[10px] text-white/50 line-clamp-1 mt-0.5">{t.flourishDesc}</div>
                    </div>
                    {isSelected && (
                      <div className="w-6 h-6 rounded-full bg-amber-400 text-black flex items-center justify-center shrink-0">
                        <Check size={13} strokeWidth={3} />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </>
        ) : (
          /* Full Symphonic Film Score + Light Background Switcher + Chora DAW Showcase Launcher */
          <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
            {/* Score Mode Switcher: Full Film Score (2:15–5:30m) vs Light Reading Background (30s) */}
            <div className="p-2 rounded-2xl bg-black/50 border border-amber-400/30 flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => handleSwitchScoreMode('full-film-score')}
                className={`flex-1 py-2 px-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all ${
                  scoreMode === 'full-film-score'
                    ? 'bg-amber-400 text-black shadow-md'
                    : 'text-white/60 hover:text-white hover:bg-white/5'
                }`}
              >
                ★ Full Film Score (2:15–5:30m · ACE-Step 2.5 + MPE)
              </button>
              <button
                type="button"
                onClick={() => handleSwitchScoreMode('light-background')}
                className={`py-2 px-3 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all ${
                  scoreMode === 'light-background'
                    ? 'bg-emerald-400 text-black shadow-md'
                    : 'text-white/60 hover:text-white hover:bg-white/5'
                }`}
              >
                Light Background
              </button>
            </div>

            {/* Now Playing / Album Hero Card */}
            <div className="p-4 rounded-2xl bg-gradient-to-br from-amber-500/15 via-white/[0.04] to-transparent border border-amber-400/30 space-y-3.5">
              <div className="flex items-center gap-3.5">
                <img
                  src={activeTheme.coverUrl}
                  alt={activeTheme.title}
                  className="w-16 h-22 rounded-xl object-cover shadow-lg border border-white/20 shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <div className="text-[9px] font-black uppercase tracking-widest text-amber-300 flex items-center gap-1.5">
                    <Volume2 size={11} />
                    <span>
                      {scoreMode === 'full-film-score'
                        ? 'ACE-Step 2.5 Symphonic Stems + 5 Melos MPE Synths'
                        : 'Light Reading Chamber Cue (30s Loop)'}
                    </span>
                  </div>
                  <h4 className="text-sm font-black text-white truncate mt-0.5">
                    {masterScore ? masterScore.albumTitle : soundtrackAlbum.albumTitle}
                  </h4>
                  <p className="text-[11px] text-white/70 truncate">{soundtrackAlbum.ensembleName}</p>
                  <p className="text-[10px] text-amber-200/90 font-semibold truncate mt-1">
                    0{currentTrack.trackNumber}. {currentMasterMvt?.title || currentTrack.title}
                  </p>
                </div>
              </div>

              {/* 1-Click Open in Chora Studio DAW Showcase Project Button */}
              <button
                type="button"
                onClick={() => handleOpenInChoraDaw(selectedTrackIdx)}
                className="w-full py-2.5 px-3 rounded-xl bg-purple-500/20 hover:bg-purple-500/30 border border-purple-400/50 text-purple-200 text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all shadow-sm"
              >
                <Sliders size={13} className="text-purple-300" />
                <span>★ Open Movement in Chora Studio DAW (8-Track MPE + ACE-Step 2.5 Project)</span>
              </button>

              {/* Progress Scrubber + 7-Section Film Cue Sheet Pills */}
              <div className="space-y-1.5">
                <div
                  className="h-2 rounded-full bg-white/10 overflow-hidden cursor-pointer"
                  onClick={e => {
                    const tot = durationSec || (scoreMode === 'full-film-score' ? 210 : 28);
                    const rect = e.currentTarget.getBoundingClientRect();
                    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                    const target = pct * tot;
                    setCurrentTimeSec(target);
                    seekRealtimeSympPlayback(target);
                  }}
                >
                  <div
                    className="h-full bg-gradient-to-r from-amber-400 to-emerald-400 transition-all"
                    style={{
                      width: `${durationSec > 0 ? Math.min(100, (currentTimeSec / durationSec) * 100) : 0}%`,
                    }}
                  />
                </div>
                <div className="flex items-center justify-between text-[10px] font-mono text-white/60">
                  <span>{formatTime(currentTimeSec)}</span>
                  <span className="text-emerald-300 font-bold truncate px-2">
                    {scoreMode === 'full-film-score' ? activeSectionCue : currentTrack.chapterCue}
                  </span>
                  <span>
                    {formatTime(
                      durationSec ||
                        Math.round(
                          (((scoreMode === 'light-background'
                            ? currentMasterMvt?.lightBackgroundLengthBeats || 32
                            : currentMasterMvt?.lengthBeats || 320) *
                            60) /
                            (currentMasterMvt?.bpm || currentTrack.bpm))
                        )
                    )}
                  </span>
                </div>

                {scoreMode === 'full-film-score' && sectionMarkers.length > 0 && (
                  <div className="grid grid-cols-7 gap-1 pt-1">
                    {sectionMarkers.map((mk, sIdx) => {
                      const bpmVal = currentMasterMvt?.bpm || currentTrack.bpm || 90;
                      const startSec = (mk.startBeat * 60) / bpmVal;
                      const nextMk = sectionMarkers[sIdx + 1];
                      const endSec = nextMk ? (nextMk.startBeat * 60) / bpmVal : (durationSec || 240);
                      const isCurrentSec = currentTimeSec >= startSec && currentTimeSec < endSec;
                      return (
                        <button
                          key={mk.id || sIdx}
                          type="button"
                          onClick={() => {
                            if (!playingTrackId) {
                              void playMovementAtIndex(selectedTrackIdx).then(() => {
                                setTimeout(() => seekRealtimeSympPlayback(startSec), 120);
                              });
                            } else {
                              setCurrentTimeSec(startSec);
                              seekRealtimeSympPlayback(startSec);
                            }
                          }}
                          title={`${mk.label} (${mk.dynamicMarking || 'mf'}) — Click to jump`}
                          className={`px-1 py-1 rounded text-[8.5px] font-bold truncate border transition-all ${
                            isCurrentSec
                              ? 'bg-amber-400 text-black border-white shadow-sm'
                              : 'bg-white/5 text-white/65 border-white/10 hover:bg-white/15'
                          }`}
                        >
                          {shortSectionNames[sIdx] || mk.label}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Transport Controls: Prev / Play-Pause / Next / Auto-Advance */}
              <div className="flex items-center justify-between pt-1">
                <button
                  type="button"
                  onClick={() => setAutoAdvance(v => !v)}
                  className={`px-2.5 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider flex items-center gap-1 border transition-all ${
                    autoAdvance
                      ? 'bg-amber-400/20 border-amber-400/40 text-amber-200'
                      : 'bg-white/5 border-white/10 text-white/45'
                  }`}
                  title="Auto-play next movement while reading"
                >
                  <Repeat size={11} />
                  <span>Continuous Play</span>
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void playMovementAtIndex(selectedTrackIdx - 1)}
                    className="w-9 h-9 rounded-xl bg-white/5 hover:bg-white/15 flex items-center justify-center text-white/75 hover:text-white transition-all"
                    aria-label="Previous movement"
                  >
                    <SkipBack size={15} />
                  </button>
                  <button
                    type="button"
                    onClick={() => void playMovementAtIndex(selectedTrackIdx)}
                    disabled={renderingTrackId !== null}
                    className="px-5 h-10 rounded-xl bg-gradient-to-r from-amber-400 to-orange-500 text-black text-[11px] font-black uppercase tracking-widest flex items-center gap-2 shadow-lg hover:brightness-110 transition-all"
                  >
                    {renderingTrackId ? (
                      <span>Loading Score…</span>
                    ) : playingTrackId === currentTrack.id && !isPaused ? (
                      <>
                        <Pause size={14} fill="currentColor" />
                        <span>Stop Score</span>
                      </>
                    ) : (
                      <>
                        <Play size={14} fill="currentColor" />
                        <span>{scoreMode === 'full-film-score' ? 'Stream Film Score' : 'Play Light Cue'}</span>
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => void playMovementAtIndex(selectedTrackIdx + 1)}
                    className="w-9 h-9 rounded-xl bg-white/5 hover:bg-white/15 flex items-center justify-center text-white/75 hover:text-white transition-all"
                    aria-label="Next movement"
                  >
                    <SkipForward size={15} />
                  </button>
                </div>
              </div>
            </div>

            {/* 6-Track Playlist */}
            <div className="space-y-2">
              <div className="flex items-center justify-between px-1">
                <span className="text-[10px] font-black uppercase tracking-widest text-white/45">
                  {scoreMode === 'full-film-score'
                    ? '6 Full-Length Symphonic Film Movements (2:15–5:30 Min)'
                    : '6 Light Reading Background Cues (~30s)'}
                </span>
                <span className="text-[10px] text-amber-300/80 font-bold">
                  ACE-Step 2.5 + MPE
                </span>
              </div>

              {soundtrackAlbum.tracks.map((tr, idx) => {
                const mvt = masterScore?.movements[idx];
                const isPlayingThis = playingTrackId === tr.id && !isPaused;
                const isSelected = selectedTrackIdx === idx;
                const isRenderingThis = renderingTrackId === tr.id;
                const beats = scoreMode === 'light-background'
                  ? (mvt?.lightBackgroundLengthBeats || 32)
                  : (mvt?.lengthBeats || 320);
                const estSec = Math.round((beats * 60) / (mvt?.bpm || tr.bpm));
                return (
                  <div
                    key={tr.id}
                    onClick={() => void playMovementAtIndex(idx)}
                    className={`p-3 rounded-2xl border transition-all cursor-pointer flex items-center gap-3 ${
                      isPlayingThis
                        ? 'bg-emerald-500/12 border-emerald-400/50 shadow-[0_6px_20px_rgba(16,185,129,0.12)]'
                        : isSelected
                        ? 'bg-amber-400/10 border-amber-400/45'
                        : 'bg-white/[0.03] border-white/10 hover:bg-white/[0.06]'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={e => {
                        e.stopPropagation();
                        void playMovementAtIndex(idx);
                      }}
                      className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-all ${
                        isPlayingThis
                          ? 'bg-emerald-400 text-black shadow-[0_0_16px_rgba(16,185,129,0.5)]'
                          : 'bg-amber-400/20 text-amber-300 hover:bg-amber-400 hover:text-black'
                      }`}
                      aria-label={isPlayingThis ? `Pause ${tr.title}` : `Play ${tr.title}`}
                    >
                      {isPlayingThis ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}
                    </button>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-black text-amber-300">0{tr.trackNumber}</span>
                        <span className="text-xs font-black text-white truncate">{mvt?.title || tr.title}</span>
                      </div>
                      <div className="text-[10px] text-white/55 truncate mt-0.5">
                        {mvt?.characterOrTheme || tr.chapterCue} · {mvt?.key || tr.key} {mvt?.mode || tr.mode} · {mvt?.bpm || tr.bpm} BPM
                      </div>
                      <div className="text-[10px] text-amber-200/75 truncate mt-0.5">
                        ACE-Step 2.5 Orchestra + {tr.instrumentation}
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className="text-[10px] font-mono font-bold text-amber-300">
                        {isRenderingThis ? '…' : isPlayingThis ? 'Streaming' : formatTime(estSec)}
                      </span>
                      <button
                        type="button"
                        onClick={e => {
                          e.stopPropagation();
                          handleOpenInChoraDaw(idx);
                        }}
                        className="px-2 py-0.5 rounded bg-purple-500/25 hover:bg-purple-500/40 border border-purple-400/40 text-[8.5px] font-black uppercase tracking-wider text-purple-200"
                        title="Open this movement in Chora Studio DAW (Timeline + MPE Piano Roll)"
                      >
                        Open DAW
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};


