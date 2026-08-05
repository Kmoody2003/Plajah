/**
 * pitchDeckTemplates
 *
 * Generates pre-populated PitchDeck objects from live page data so creators
 * can launch the Pitch Deck Studio with a ready-to-edit template instead of
 * a blank canvas.
 *
 * Three factory functions:
 *   generateSanctuaryDeck(creator, tiers)  — for user Sanctuary pages
 *   generateClubDeck(club)                 — for Club pages
 *   generateBusinessDeck(business)         — for Business pages
 */

import { v4 as uuidv4 } from 'uuid';
import { auth } from './firebase';
import type {
  PitchDeck, PitchSlide, PitchElement, PitchElementType,
  UserProfile, SanctuaryTier, Club, BusinessPage,
} from '../types';

// ─── helpers ──────────────────────────────────────────────────────────────────

const el = (type: PitchElementType, o: Partial<PitchElement> = {}): PitchElement => ({
  id: uuidv4(), type,
  x: 20, y: 20, width: 60, height: 20,
  zIndex: 1, opacity: 1,
  ...o,
});

const slide = (order: number, o: Partial<PitchSlide> = {}): PitchSlide => ({
  id: uuidv4(), order,
  bgType: 'color', bgValue: '#0a0a0a',
  elements: [], transition: 'fade', duration: 0, layout: 'hero',
  ...o,
});

const uid = () => auth.currentUser?.uid ?? '';

// ─── Sanctuary deck ────────────────────────────────────────────────────────────
// Theme: music (dark with orange accent)

export function generateSanctuaryDeck(creator: UserProfile, tiers: SanctuaryTier[]): PitchDeck {
  const name = creator.displayName || 'Creator';
  const bio  = creator.bio || 'Join my exclusive community for early access, behind-the-scenes content, and more.';
  const lowestTier = [...tiers].sort((a, b) => a.price - b.price)[0];

  const slides: PitchSlide[] = [
    // 0 — Hero
    slide(0, {
      bgType: 'gradient',
      bgValue: 'linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 50%, #0a0a0a 100%)',
      layout: 'hero',
      elements: [
        el('text', { x:10, y:24, width:80, height:18, content: name.toUpperCase(), fontSize:52, fontWeight:'900', color:'#ff8c00', textAlign:'center', fontFamily:'"Outfit",sans-serif', letterSpacing:4, animation:'fade-in' }),
        el('text', { x:12, y:48, width:76, height:14, content: bio, fontSize:16, fontWeight:'400', color:'rgba(255,255,255,0.6)', textAlign:'center', lineHeight:1.6, animation:'slide-up', animationDelay:300 }),
        el('button', { x:30, y:76, width:40, height:10, label:'Join My Sanctuary', href:'#', btnColor:'#ff8c00', btnTextColor:'#000', btnBorderRadius:999, animation:'pop', animationDelay:600 }),
      ],
    }),

    // 1 — About
    slide(1, {
      bgType: 'color', bgValue: '#111', layout: 'split',
      elements: [
        el('text', { x:5, y:10, width:50, height:12, content:'WHO I AM', fontSize:36, fontWeight:'900', color:'#fff', textAlign:'left', fontFamily:'"Outfit",sans-serif' }),
        el('text', { x:5, y:28, width:48, height:50, content: bio, fontSize:16, color:'rgba(255,255,255,0.6)', lineHeight:1.7 }),
        el('shape', { x:56, y:5, width:40, height:88, shapeType:'rect', fill:'#1a1a2e', borderRadius:16 }),
      ],
    }),

    // 2 — Membership tiers
    slide(2, {
      bgType: 'gradient', bgValue: 'linear-gradient(180deg, #0a0a0a 0%, #1a1a2e 100%)', layout: 'text-only',
      elements: [
        el('text', { x:10, y:10, width:80, height:12, content:'MEMBERSHIP TIERS', fontSize:32, fontWeight:'900', color:'#ff8c00', textAlign:'center', fontFamily:'"Outfit",sans-serif' }),
        ...tiers.slice(0, 4).map((tier, i) =>
          el('text', {
            x:10, y:28 + i * 15, width:80, height:10,
            content: `${tier.iconEmoji ?? '✦'}  ${tier.name} — $${tier.price}/mo · ${tier.description ?? ''}`,
            fontSize:15, color: i === 0 ? '#ff8c00' : '#fff', textAlign:'center', lineHeight:1.4,
          })
        ),
      ],
    }),

    // 3 — What you get
    slide(3, {
      bgType: 'color', bgValue: '#111', layout: 'text-only',
      elements: [
        el('text', { x:10, y:12, width:80, height:12, content:'WHAT YOU GET', fontSize:32, fontWeight:'900', color:'#fff', textAlign:'center', fontFamily:'"Outfit",sans-serif' }),
        el('text', { x:10, y:32, width:80, height:8, content:'✓  Exclusive early access to every release', fontSize:17, color:'#fff', textAlign:'center' }),
        el('text', { x:10, y:44, width:80, height:8, content:'✓  Monthly behind-the-scenes & bonus content', fontSize:17, color:'rgba(255,255,255,0.7)', textAlign:'center' }),
        el('text', { x:10, y:56, width:80, height:8, content:'✓  Direct access & community chat', fontSize:17, color:'rgba(255,255,255,0.7)', textAlign:'center' }),
        el('text', { x:10, y:68, width:80, height:8, content:'✓  Cancel anytime — no commitment', fontSize:17, color:'rgba(255,255,255,0.5)', textAlign:'center' }),
      ],
    }),

    // 4 — CTA
    slide(4, {
      bgType: 'gradient', bgValue: 'linear-gradient(135deg, #ff8c00 0%, #ff4500 100%)', layout: 'cta',
      elements: [
        el('text', { x:10, y:26, width:80, height:18, content:`JOIN ${name.toUpperCase()}`, fontSize:44, fontWeight:'900', color:'#000', textAlign:'center', fontFamily:'"Outfit",sans-serif' }),
        el('text', { x:12, y:51, width:76, height:10,
          content: lowestTier ? `From $${lowestTier.price}/month · Cancel anytime.` : 'Be part of something real.',
          fontSize:20, color:'#000', textAlign:'center', opacity:0.7,
        }),
        el('button', { x:25, y:70, width:50, height:12, label:'Subscribe Now →', href:'#', btnColor:'#000', btnTextColor:'#fff', btnBorderRadius:999 }),
      ],
    }),
  ];

  return {
    id: uuidv4(),
    title: `${name} — Sanctuary Pitch`,
    theme: 'music',
    slides,
    bgMusicVolume: 0.3,
    createdBy: uid(),
    isPublic: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    linkedTo: { type: 'sanctuary', id: creator.uid, displayName: name },
  };
}

// ─── Club deck ─────────────────────────────────────────────────────────────────
// Theme: business (dark navy with blue accent)

export function generateClubDeck(club: Club): PitchDeck {
  const slides: PitchSlide[] = [
    // 0 — Hero
    slide(0, {
      bgType: 'gradient', bgValue: 'linear-gradient(135deg, #0f1923 0%, #1e3a5f 100%)', layout: 'hero',
      elements: [
        el('text', { x:8, y:22, width:84, height:20, content: club.name.toUpperCase(), fontSize:52, fontWeight:'900', color:'#ffffff', textAlign:'center', fontFamily:'"Outfit",sans-serif', letterSpacing:3, animation:'fade-in' }),
        el('text', { x:12, y:48, width:76, height:14, content: club.description, fontSize:17, color:'rgba(255,255,255,0.6)', textAlign:'center', lineHeight:1.5 }),
        el('button', { x:30, y:76, width:40, height:10, label:'Join the Club →', href:'#', btnColor:'#4a90d9', btnTextColor:'#fff', btnBorderRadius:8 }),
      ],
    }),

    // 1 — What we are
    slide(1, {
      bgType: 'color', bgValue: '#0f1923', layout: 'split',
      elements: [
        el('text', { x:5, y:8, width:55, height:12, content:'WHAT WE ARE', fontSize:34, fontWeight:'900', color:'#4a90d9', textAlign:'left', fontFamily:'"Outfit",sans-serif' }),
        el('text', { x:5, y:26, width:52, height:55, content: club.description, fontSize:17, color:'rgba(255,255,255,0.7)', lineHeight:1.8 }),
        el('shape', { x:60, y:5, width:36, height:88, shapeType:'rect', fill:'#1e3a5f', borderRadius:12 }),
      ],
    }),

    // 2 — Community stats
    slide(2, {
      bgType: 'color', bgValue: '#0f1923', layout: 'text-only',
      elements: [
        el('text', { x:10, y:10, width:80, height:12, content:'COMMUNITY', fontSize:32, fontWeight:'900', color:'#4a90d9', textAlign:'center', fontFamily:'"Outfit",sans-serif' }),
        el('text', { x:10, y:32, width:80, height:12, content:`${club.memberCount?.toLocaleString() ?? '0'} Members`, fontSize:42, fontWeight:'900', color:'#fff', textAlign:'center' }),
        el('text', { x:10, y:50, width:80, height:8, content:`Category: ${club.category}`, fontSize:18, color:'rgba(255,255,255,0.5)', textAlign:'center' }),
        el('text', { x:10, y:62, width:80, height:8,
          content: club.isPrivate ? '🔒 Private · Members only' : '🌍 Open · Everyone welcome',
          fontSize:16, color:'rgba(255,255,255,0.5)', textAlign:'center',
        }),
      ],
    }),

    // 3 — Benefits
    slide(3, {
      bgType: 'color', bgValue: '#0f1923', layout: 'text-only',
      elements: [
        el('text', { x:10, y:10, width:80, height:12, content:'MEMBER BENEFITS', fontSize:30, fontWeight:'900', color:'#4a90d9', textAlign:'center', fontFamily:'"Outfit",sans-serif' }),
        el('text', { x:10, y:30, width:80, height:8, content:'✓  Exclusive community space', fontSize:17, color:'#fff', textAlign:'center' }),
        ...(club.hasLiveChat ? [el('text', { x:10, y:42, width:80, height:8, content:'✓  Live group chat', fontSize:17, color:'rgba(255,255,255,0.7)', textAlign:'center' })] : []),
        ...(club.hasExclusiveEvents ? [el('text', { x:10, y:54, width:80, height:8, content:'✓  Exclusive events', fontSize:17, color:'rgba(255,255,255,0.7)', textAlign:'center' })] : []),
        ...(club.hasMerchStore ? [el('text', { x:10, y:66, width:80, height:8, content:'✓  Member merch store', fontSize:17, color:'rgba(255,255,255,0.7)', textAlign:'center' })] : []),
      ],
    }),

    // 4 — CTA
    slide(4, {
      bgType: 'gradient', bgValue: 'linear-gradient(135deg, #1e3a5f 0%, #0f1923 100%)', layout: 'cta',
      elements: [
        el('text', { x:10, y:22, width:80, height:18, content:'READY TO JOIN?', fontSize:46, fontWeight:'900', color:'#fff', textAlign:'center', fontFamily:'"Outfit",sans-serif' }),
        el('text', { x:12, y:47, width:76, height:12,
          content: `Join ${club.name} — a community built around ${club.category.toLowerCase()}.`,
          fontSize:18, color:'rgba(255,255,255,0.6)', textAlign:'center',
        }),
        el('button', { x:22, y:70, width:56, height:12,
          label: (club.monthlyPrice ?? 0) > 0 ? `Become a Member · $${club.monthlyPrice}/mo →` : 'Become a Member →',
          href:'#', btnColor:'#4a90d9', btnTextColor:'#fff', btnBorderRadius:8,
        }),
      ],
    }),
  ];

  return {
    id: uuidv4(),
    title: `${club.name} — Club Pitch`,
    theme: 'business',
    slides,
    bgMusicVolume: 0.3,
    createdBy: uid(),
    isPublic: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    linkedTo: { type: 'club', id: club.id, displayName: club.name },
  };
}

// ─── Business deck ─────────────────────────────────────────────────────────────
// Theme: business (dark navy with blue accent)

export function generateBusinessDeck(business: BusinessPage): PitchDeck {
  const tagline = business.tagline || business.description;
  const address  = [business.address, business.city, business.state].filter(Boolean).join(', ') || 'See website for location';

  const slides: PitchSlide[] = [
    // 0 — Hero
    slide(0, {
      bgType: 'gradient', bgValue: 'linear-gradient(135deg, #0f1923 0%, #1e3a5f 100%)', layout: 'hero',
      elements: [
        el('text', { x:8, y:22, width:84, height:20, content: business.businessName.toUpperCase(), fontSize:52, fontWeight:'900', color:'#ffffff', textAlign:'center', fontFamily:'"Outfit",sans-serif', letterSpacing:2, animation:'fade-in' }),
        el('text', { x:12, y:48, width:76, height:12, content: tagline, fontSize:19, color:'rgba(255,255,255,0.6)', textAlign:'center', lineHeight:1.5 }),
        el('button', { x:28, y:76, width:44, height:10, label:'Learn More →', href: business.website || '#', btnColor:'#4a90d9', btnTextColor:'#fff', btnBorderRadius:8 }),
      ],
    }),

    // 1 — About
    slide(1, {
      bgType: 'color', bgValue: '#0f1923', layout: 'split',
      elements: [
        el('text', { x:5, y:8, width:55, height:12, content:'ABOUT US', fontSize:34, fontWeight:'900', color:'#4a90d9', textAlign:'left', fontFamily:'"Outfit",sans-serif' }),
        el('text', { x:5, y:26, width:52, height:55, content: business.description, fontSize:17, color:'rgba(255,255,255,0.7)', lineHeight:1.8 }),
        el('shape', { x:60, y:5, width:36, height:88, shapeType:'rect', fill:'#1e3a5f', borderRadius:12 }),
      ],
    }),

    // 2 — Highlights / numbers
    slide(2, {
      bgType: 'color', bgValue: '#0f1923', layout: 'split',
      elements: [
        el('text', { x:5, y:8, width:55, height:12, content:'BY THE NUMBERS', fontSize:32, fontWeight:'900', color:'#4a90d9', textAlign:'left', fontFamily:'"Outfit",sans-serif' }),
        el('text', { x:5, y:28, width:50, height:14, content: business.priceRange ?? '$$', fontSize:48, fontWeight:'900', color:'#fff', textAlign:'left' }),
        el('text', { x:5, y:44, width:50, height:8,  content:'Price range', fontSize:14, color:'rgba(255,255,255,0.35)', textAlign:'left' }),
        el('text', { x:5, y:59, width:50, height:12, content: business.rating != null ? `${business.rating.toFixed(1)} ★` : '—', fontSize:40, fontWeight:'900', color:'#4a90d9', textAlign:'left' }),
        el('text', { x:5, y:73, width:50, height:8,  content: `${business.reviewCount ?? 0} reviews`, fontSize:14, color:'rgba(255,255,255,0.35)', textAlign:'left' }),
      ],
    }),

    // 3 — Amenities / offerings
    slide(3, {
      bgType: 'color', bgValue: '#0f1923', layout: 'text-only',
      elements: [
        el('text', { x:10, y:10, width:80, height:12, content:'WHAT WE OFFER', fontSize:30, fontWeight:'900', color:'#4a90d9', textAlign:'center', fontFamily:'"Outfit",sans-serif' }),
        el('text', { x:10, y:28, width:80, height:8, content:`Type: ${business.businessType.replace(/_/g, ' ')}`, fontSize:17, color:'#fff', textAlign:'center' }),
        ...(business.amenities ?? []).slice(0, 3).map((a, i) =>
          el('text', { x:10, y:40 + i * 13, width:80, height:8, content:`✓  ${a}`, fontSize:16, color:'rgba(255,255,255,0.7)', textAlign:'center' })
        ),
      ],
    }),

    // 4 — CTA
    slide(4, {
      bgType: 'gradient', bgValue: 'linear-gradient(135deg, #1e3a5f 0%, #0f1923 100%)', layout: 'cta',
      elements: [
        el('text', { x:10, y:22, width:80, height:18, content:'VISIT US TODAY', fontSize:46, fontWeight:'900', color:'#fff', textAlign:'center', fontFamily:'"Outfit",sans-serif' }),
        el('text', { x:12, y:47, width:76, height:10, content: address, fontSize:17, color:'rgba(255,255,255,0.6)', textAlign:'center' }),
        el('button', { x:22, y:70, width:56, height:12,
          label: business.website ? 'Visit Our Website →' : 'Get in Touch →',
          href: business.website || '#', btnColor:'#4a90d9', btnTextColor:'#fff', btnBorderRadius:8,
        }),
      ],
    }),
  ];

  return {
    id: uuidv4(),
    title: `${business.businessName} — Business Pitch`,
    theme: 'business',
    slides,
    bgMusicVolume: 0.3,
    createdBy: uid(),
    isPublic: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    linkedTo: { type: 'business', id: business.id, displayName: business.businessName },
  };
}
