import React, { useEffect, useMemo, useState } from 'react';
import {
  Film,
  Sparkles,
  User,
  Users,
  Clapperboard,
  Award,
  BookOpen,
  Play,
  X,
  Clock,
  Globe,
  ChevronRight,
  Theater,
  Layers,
  Star,
  MapPin,
  Flame,
  Shuffle,
  ArrowLeftRight,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import {
  CLASSIC_DIRECTORS,
  getDirectorProfile,
  getAllClassicDirectors,
  type ClassicDirectorProfile,
} from '../../data/classicDirectors';
import {
  HALLOWEEN_STORY_INTEL_BUNDLES,
  getHalloweenStoryIntelBundle,
  getCharactersForFilm,
  getAllHalloweenCharactersWithActors,
  type HalloweenCharacterWithActor,
  type HalloweenFilmIntelBundle,
} from '../../data/halloweenStoryIntel';
import {
  CURATED_HALLOWEEN_FILMS,
  CURATED_EUROPEANA_FILMS,
  CURATED_KOFA_FILMS,
  ALL_CURATED_ARCHIVE_FILMS,
  PUMPKIN_PATCH_HERO_ALBUM,
  type ArchiveVideo,
} from '../../services/archiveContentService';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../services/firebase';

// ── Live Plajah Account Profile Photo Cache (for Platform Creators) ─────────
const PLATFORM_CREATOR_USER_IDS: Record<string, string> = {
  'brian james gage': 'u4XNVf41QeQERFqO0CB8JEhegXz2',
  'brian cage james': 'u4XNVf41QeQERFqO0CB8JEhegXz2',
};

const userProfilePhotoCache = new Map<string, string>();

export async function fetchPlatformUserProfilePhoto(uid: string): Promise<string> {
  if (!uid) return '';
  const cached = userProfilePhotoCache.get(uid);
  if (cached) return cached;
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    if (snap.exists()) {
      const data = snap.data() as Record<string, any>;
      const photo =
        data?.customPhotoURL ||
        data?.photoURL ||
        data?.avatar ||
        data?.profilePicture ||
        '';
      if (photo) {
        userProfilePhotoCache.set(uid, photo);
        return photo;
      }
    }
  } catch {
    // Fall back to static portraitUrl on network/permission hiccup
  }
  return '';
}

// ── Live Wikipedia Portrait & Bio Enrichment Cache ──────────────────────────
const wikiSummaryCache = new Map<string, { thumb: string; extract: string }>();

export async function fetchWikiPortraitAndBio(
  slug?: string
): Promise<{ thumb: string; extract: string }> {
  if (!slug) return { thumb: '', extract: '' };
  const cached = wikiSummaryCache.get(slug);
  if (cached) return cached;
  try {
    const r = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(slug)}`
    );
    if (!r.ok) throw new Error('wiki non-200');
    const d = await r.json();
    const entry = {
      thumb: d.thumbnail?.source || d.originalimage?.source || '',
      extract: d.extract || '',
    };
    wikiSummaryCache.set(slug, entry);
    return entry;
  } catch {
    const empty = { thumb: '', extract: '' };
    wikiSummaryCache.set(slug, empty);
    return empty;
  }
}

/**
 * Rewrites legacy unauthenticated Firebase Storage character still URLs for Pumpkin Patch
 * (which return HTTP 403 without a download token) to the verified local character portraits.
 */
export function resolveStoryIntelPortraitUrl(rawUrl?: string): string {
  if (!rawUrl) return '';
  const match = rawUrl.match(/char_(\d+)_portrait\.jpg/i);
  if (
    match &&
    (rawUrl.includes('album_1787881859314_mlt23') ||
      rawUrl.includes('taleoAnalysis') ||
      rawUrl.startsWith('stills/'))
  ) {
    return `/generated/comics/pumpkin_patch_v4/char_${match[1]}_portrait.jpg`;
  }
  return rawUrl;
}

export function useWikiPortrait(
  wikiSlug?: string,
  fallbackUrl?: string,
  ownerUserId?: string
) {
  const safeFallback = resolveStoryIntelPortraitUrl(fallbackUrl);
  const [resolvedUrl, setResolvedUrl] = useState<string>(safeFallback);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    setFailed(false);
    setResolvedUrl(safeFallback);

    // If this person is a Plajah account holder, always prioritize their live account profile photo
    if (ownerUserId) {
      fetchPlatformUserProfilePhoto(ownerUserId).then((livePhoto) => {
        if (!alive) return;
        if (livePhoto) {
          setResolvedUrl(livePhoto);
        }
      });
      return () => {
        alive = false;
      };
    }

    if (wikiSlug) {
      fetchWikiPortraitAndBio(wikiSlug).then((res) => {
        if (!alive) return;
        if (res.thumb) {
          setResolvedUrl(res.thumb);
        }
      });
    }
    return () => {
      alive = false;
    };
  }, [wikiSlug, safeFallback, ownerUserId]);

  return {
    src: !failed ? resolvedUrl : '',
    onError: () => {
      if (resolvedUrl && safeFallback && resolvedUrl !== safeFallback) {
        setResolvedUrl(safeFallback);
      } else {
        setFailed(true);
      }
    },
  };
}

// Helper to find playable ArchiveVideo or Album by identifier
export function findPlayableFilmById(filmId: string): ArchiveVideo | any | null {
  if (filmId === 'album_1787881859314_mlt23') return PUMPKIN_PATCH_HERO_ALBUM;
  return ALL_CURATED_ARCHIVE_FILMS.find((f) => f.identifier === filmId) || null;
}

// ── Portrait Component with Account Profile Priority, Wikipedia Enrichment & Monogram Fallback ──
export const EnrichedPortrait: React.FC<{
  name: string;
  wikiSlug?: string;
  wikiPageTitle?: string;
  fallbackUrl?: string;
  ownerUserId?: string;
  disableAccountLookup?: boolean;
  alt?: string;
  className?: string;
  imgClassName?: string;
  accentColor?: string;
}> = ({
  name,
  wikiSlug,
  wikiPageTitle,
  fallbackUrl,
  ownerUserId,
  disableAccountLookup = false,
  alt,
  className = 'w-16 h-16 rounded-2xl',
  imgClassName = 'w-full h-full object-cover object-top',
  accentColor = 'from-amber-500/30 to-orange-900/40',
}) => {
  const resolvedOwnerUid = useMemo(() => {
    if (disableAccountLookup) return undefined;
    if (ownerUserId) return ownerUserId;
    const normalized = (name || '').trim().toLowerCase();
    for (const [creatorKey, uid] of Object.entries(PLATFORM_CREATOR_USER_IDS)) {
      if (normalized.includes(creatorKey)) return uid;
    }
    return undefined;
  }, [name, ownerUserId, disableAccountLookup]);

  const { src, onError } = useWikiPortrait(
    resolvedOwnerUid ? undefined : wikiSlug || wikiPageTitle,
    fallbackUrl,
    resolvedOwnerUid
  );
  const initials = useMemo(() => {
    return (name || 'C')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase())
      .join('');
  }, [name]);

  return (
    <div
      className={`relative overflow-hidden bg-gradient-to-br ${accentColor} border border-white/15 flex items-center justify-center shrink-0 ${className}`}
    >
      {src ? (
        <img
          src={src}
          alt={alt || name}
          onError={onError}
          loading="lazy"
          className={imgClassName}
        />
      ) : (
        <span className="font-black text-white/80 tracking-tight select-none text-sm">
          {initials}
        </span>
      )}
    </div>
  );
};

// ── Full Director Dossier Modal (Bio + Portrait + Playable & Other Works) ────
export const ClassicDirectorDossierModal: React.FC<{
  director: ClassicDirectorProfile | null;
  onClose: () => void;
  onPlayFilm?: (filmId: string) => void;
}> = ({ director, onClose, onPlayFilm }) => {
  if (!director) return null;

  const playableWorks = director.filmography.filter((f) => f.isOnPlatform && f.platformFilmId);
  const otherWorks = director.filmography.filter((f) => !f.isOnPlatform);

  return (
    <div
      className="fixed inset-0 z-[120] bg-black/85 backdrop-blur-xl flex items-center justify-center p-4 md:p-6 overflow-y-auto animate-fade-in"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-4xl bg-zinc-950 border border-amber-500/30 rounded-3xl shadow-2xl overflow-hidden my-auto max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Banner */}
        <div className="relative bg-gradient-to-r from-amber-950/60 via-zinc-900 to-zinc-950 p-6 md:p-8 border-b border-white/10">
          <button
            onClick={onClose}
            className="absolute top-5 right-5 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition"
            title="Close Director Dossier"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
            <EnrichedPortrait
              name={director.name}
              wikiSlug={director.wikiSlug}
              fallbackUrl={director.portraitUrl}
              className="w-24 h-28 md:w-28 md:h-32 rounded-2xl shadow-2xl ring-2 ring-amber-500/40"
            />
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span className="px-2.5 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300 text-[10px] font-black uppercase tracking-widest">
                  Master of Cinema
                </span>
                <span className="px-2.5 py-0.5 rounded-full bg-white/5 border border-white/10 text-zinc-300 text-[10px] font-bold uppercase tracking-wider">
                  {director.movement}
                </span>
              </div>
              <h2 className="text-2xl md:text-3xl font-black text-white tracking-tight">
                {director.name}
              </h2>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-400 mt-1.5">
                <span className="flex items-center gap-1.5">
                  <Globe className="w-3.5 h-3.5 text-amber-400" />
                  {director.nationality}
                </span>
                <span>•</span>
                <span>{director.lifespan}</span>
                <span>•</span>
                <span className="text-amber-300/90 font-semibold">
                  Active {director.yearsActive}
                </span>
              </div>
              {director.knownFor && director.knownFor.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {director.knownFor.map((title) => (
                    <span
                      key={title}
                      className="px-2.5 py-1 rounded-lg bg-black/50 border border-white/10 text-[11px] text-zinc-200 font-medium"
                    >
                      {title}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Scrollable Body */}
        <div className="p-6 md:p-8 overflow-y-auto space-y-8">
          {/* Biography & Signature Style */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-3">
              <h3 className="text-xs font-black uppercase tracking-widest text-amber-400 flex items-center gap-2">
                <BookOpen className="w-4 h-4" />
                Director Biography & Historical Legacy
              </h3>
              <p className="text-sm text-zinc-200 leading-relaxed">{director.bio}</p>
            </div>
            <div className="bg-amber-500/[0.06] border border-amber-500/20 rounded-2xl p-4 space-y-2.5">
              <h4 className="text-[11px] font-black uppercase tracking-widest text-amber-300 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" />
                Signature Visual & Narrative Style
              </h4>
              <p className="text-xs text-zinc-300 leading-relaxed">
                {director.signatureStyle}
              </p>
            </div>
          </div>

          {/* Playable on Plajah Taleo */}
          {playableWorks.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-xs font-black uppercase tracking-widest text-emerald-400 flex items-center gap-2">
                <Play className="w-4 h-4 fill-current" />
                Streaming Now on Plajah Taleo ({playableWorks.length})
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {playableWorks.map((work) => (
                  <div
                    key={`${work.title}-${work.year}`}
                    className="flex items-center justify-between gap-4 p-4 rounded-2xl bg-emerald-950/20 border border-emerald-500/30 hover:border-emerald-400/60 transition"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-black text-white truncate">
                          {work.title}
                        </span>
                        <span className="text-xs font-bold text-emerald-400 shrink-0">
                          ({work.year})
                        </span>
                      </div>
                      <p className="text-xs text-zinc-300 mt-1 line-clamp-2">{work.note}</p>
                    </div>
                    {onPlayFilm && work.platformFilmId && (
                      <button
                        onClick={() => {
                          onPlayFilm(work.platformFilmId!);
                          onClose();
                        }}
                        className="px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-black text-xs flex items-center gap-1.5 shrink-0 transition"
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                        Watch
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Complete Filmography & Other Landmark Works */}
          <div className="space-y-3">
            <h3 className="text-xs font-black uppercase tracking-widest text-amber-400 flex items-center gap-2">
              <Clapperboard className="w-4 h-4" />
              Complete Selected Filmography & Other Works ({director.filmography.length})
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {director.filmography.map((work) => (
                <div
                  key={`${work.title}-${work.year}`}
                  className={`p-4 rounded-2xl border transition ${
                    work.isOnPlatform
                      ? 'bg-amber-500/10 border-amber-500/30'
                      : 'bg-white/[0.03] border-white/10 hover:border-white/20'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="px-2 py-0.5 rounded bg-white/10 text-amber-300 font-mono text-[11px] font-bold">
                        {work.year}
                      </span>
                      <h4 className="text-sm font-bold text-white truncate">{work.title}</h4>
                    </div>
                    {work.isOnPlatform && work.platformFilmId ? (
                      <button
                        onClick={() => {
                          if (onPlayFilm && work.platformFilmId) {
                            onPlayFilm(work.platformFilmId);
                            onClose();
                          }
                        }}
                        className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-[10px] font-black uppercase tracking-wider hover:bg-emerald-500/30 transition shrink-0"
                      >
                        On Platform
                      </button>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full bg-white/5 text-zinc-400 text-[10px] font-semibold uppercase tracking-wider shrink-0">
                        {work.role || 'Director'}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-zinc-400 leading-relaxed mt-1">{work.note}</p>
                </div>
              ))}
            </div>
            {otherWorks.length > 0 && (
              <p className="text-[11px] text-zinc-500 italic">
                Includes {otherWorks.length} additional landmark works from {director.name}’s broader career filmography for historical context.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Inline Director Spotlight Card (for Film Detail Pages & Curator Modal) ──
export const DirectorSpotlightCard: React.FC<{
  directorName?: string;
  filmId?: string;
  onPlayFilm?: (filmId: string) => void;
  compact?: boolean;
}> = ({ directorName, filmId, onPlayFilm, compact = false }) => {
  const [modalOpen, setModalOpen] = useState(false);
  const profile = useMemo(
    () => getDirectorProfile(directorName, filmId),
    [directorName, filmId]
  );

  if (!profile) return null;

  const otherWorks = profile.filmography.filter(
    (w) => !w.platformFilmId || w.platformFilmId !== filmId
  );

  return (
    <>
      <div className="rounded-3xl bg-gradient-to-br from-zinc-900/95 via-zinc-950 to-amber-950/20 border border-amber-500/25 p-5 md:p-6 shadow-xl">
        <div className="flex flex-col md:flex-row items-start gap-5">
          <div
            onClick={() => setModalOpen(true)}
            className="cursor-pointer group relative"
          >
            <EnrichedPortrait
              name={profile.name}
              wikiSlug={profile.wikiSlug}
              fallbackUrl={profile.portraitUrl}
              className="w-20 h-24 md:w-24 md:h-28 rounded-2xl ring-2 ring-amber-500/30 group-hover:ring-amber-400 transition shadow-xl"
            />
            <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full bg-amber-500 text-black text-[9px] font-black uppercase tracking-wider whitespace-nowrap shadow">
              Director
            </span>
          </div>

          <div className="flex-1 min-w-0 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[10px] font-black uppercase tracking-widest text-amber-400">
                    Auteur & Director Dossier
                  </span>
                  <span className="text-xs text-zinc-500">•</span>
                  <span className="text-[11px] font-semibold text-zinc-300">
                    {profile.movement}
                  </span>
                </div>
                <h3
                  onClick={() => setModalOpen(true)}
                  className="text-xl md:text-2xl font-black text-white hover:text-amber-300 cursor-pointer transition mt-0.5"
                >
                  {profile.name}
                </h3>
                <p className="text-xs text-zinc-400">
                  {profile.nationality} • {profile.lifespan} • Active {profile.yearsActive}
                </p>
              </div>

              <button
                onClick={() => setModalOpen(true)}
                className="px-3.5 py-2 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 text-xs font-bold flex items-center gap-1.5 transition"
              >
                <BookOpen className="w-3.5 h-3.5" />
                Full Bio & Filmography ({profile.filmography.length})
              </button>
            </div>

            <p className="text-xs md:text-sm text-zinc-300 leading-relaxed">
              {profile.bio}
            </p>

            {!compact && (
              <div className="pt-1">
                <div className="text-[11px] font-bold text-amber-300/90 mb-1">
                  Signature Style:
                </div>
                <p className="text-xs text-zinc-400 italic">{profile.signatureStyle}</p>
              </div>
            )}

            {/* Other Works Filmography Strip */}
            {otherWorks.length > 0 && (
              <div className="pt-3 border-t border-white/10">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400 flex items-center gap-1.5">
                    <Clapperboard className="w-3.5 h-3.5 text-amber-400" />
                    Other Works & Career Filmography by {profile.name}
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {otherWorks.slice(0, compact ? 3 : 6).map((work) => (
                    <div
                      key={`${work.title}-${work.year}`}
                      onClick={() => {
                        if (work.isOnPlatform && work.platformFilmId && onPlayFilm) {
                          onPlayFilm(work.platformFilmId);
                        } else {
                          setModalOpen(true);
                        }
                      }}
                      className="p-2.5 rounded-xl bg-black/40 hover:bg-white/[0.06] border border-white/10 cursor-pointer transition flex flex-col justify-between"
                    >
                      <div className="flex items-center justify-between gap-1.5">
                        <span className="text-xs font-bold text-white truncate">
                          {work.title}
                        </span>
                        <span className="text-[10px] font-mono text-amber-400 shrink-0">
                          {work.year}
                        </span>
                      </div>
                      <p className="text-[11px] text-zinc-400 line-clamp-2 mt-1">
                        {work.note}
                      </p>
                      {work.isOnPlatform && (
                        <span className="mt-1.5 inline-flex items-center gap-1 text-[10px] font-black text-emerald-400 uppercase tracking-wider">
                          <Play className="w-2.5 h-2.5 fill-current" /> Stream on Plajah
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {modalOpen && (
        <ClassicDirectorDossierModal
          director={profile}
          onClose={() => setModalOpen(false)}
          onPlayFilm={onPlayFilm}
        />
      )}
    </>
  );
};

// ── Landing Page Showcase: Masters of Classic Cinema (Directors, Bios & Filmographies) ──
export const ClassicDirectorsShowcaseSection: React.FC<{
  onPlayFilm?: (filmId: string) => void;
  onSelectFilmByIdentifier?: (filmId: string) => void;
  filterMovement?: 'ALL' | 'HALLOWEEN' | 'SILENT_WEIMAR' | 'KOREAN_GOLDEN_AGE' | 'WORLD_NOIR';
  title?: string;
  subtitle?: string;
}> = ({
  onPlayFilm: propOnPlayFilm,
  onSelectFilmByIdentifier,
  filterMovement = 'ALL',
  title = 'Masters of Classic Cinema: Directors, Biographies & Filmographies',
  subtitle = 'Explore the visionary auteurs behind our preserved films — complete with biographical dossiers, archival portraits, and career filmographies of their other landmark works.',
}) => {
  const onPlayFilm = propOnPlayFilm || onSelectFilmByIdentifier;
  const [selectedDirector, setSelectedDirector] =
    useState<ClassicDirectorProfile | null>(null);
  const [activeTab, setActiveTab] = useState<
    'ALL' | 'HALLOWEEN' | 'SILENT_WEIMAR' | 'KOREAN_GOLDEN_AGE' | 'WORLD_NOIR'
  >(filterMovement);

  const allDirectors = useMemo(() => getAllClassicDirectors(), []);

  const directors = useMemo(() => {
    const all = allDirectors;
    if (activeTab === 'HALLOWEEN') {
      const halloweenIds = new Set([
        'george-a-romero',
        'william-castle',
        'herk-harvey',
        'kim-ki-young',
        'f-w-murnau',
        'robert-wiene',
        'rupert-julian',
        'benjamin-christensen',
        'eugenio-martin',
        'victor-halperin',
        'roger-corman',
        't-hayes-hunter',
        'j-searle-dawley',
        'brian-james-gage',
      ]);
      return all.filter((d) => halloweenIds.has(d.id));
    }
    if (activeTab === 'SILENT_WEIMAR') {
      const silentIds = new Set([
        'f-w-murnau',
        'fritz-lang',
        'robert-wiene',
        'benjamin-christensen',
        'rupert-julian',
        'georges-melies',
        'dziga-vertov',
        'j-searle-dawley',
        'sergei-eisenstein',
        'carl-theodor-dreyer',
        'buster-keaton',
        'charlie-chaplin',
      ]);
      return all.filter((d) => silentIds.has(d.id));
    }
    if (activeTab === 'KOREAN_GOLDEN_AGE') {
      const kofaIds = new Set([
        'kim-ki-young',
        'yu-hyun-mok',
        'han-hyung-mo',
        'shin-sang-ok',
        'kang-dae-jin',
        'yang-ju-nam',
      ]);
      return all.filter((d) => kofaIds.has(d.id));
    }
    if (activeTab === 'WORLD_NOIR') {
      const worldNoirIds = new Set([
        'akira-kurosawa',
        'yasujiro-ozu',
        'sergei-eisenstein',
        'carl-theodor-dreyer',
        'alfred-hitchcock',
        'orson-welles',
        'fritz-lang',
        'buster-keaton',
        'charlie-chaplin',
      ]);
      return all.filter((d) => worldNoirIds.has(d.id));
    }
    return all;
  }, [activeTab, allDirectors]);

  return (
    <section className="py-8">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-6">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[10px] font-black uppercase tracking-widest mb-2">
            <Award className="w-3.5 h-3.5" />
            Auteur Archive • Portraits, Biographies & Filmographies
          </div>
          <h2 className="text-2xl md:text-3xl font-black text-white tracking-tight">
            {title}
          </h2>
          <p className="text-xs md:text-sm text-zinc-400 max-w-3xl mt-1">{subtitle}</p>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {(
            [
              { id: 'ALL', label: `All Masters (${allDirectors.length})` },
              { id: 'WORLD_NOIR', label: 'World Cinema & Noir' },
              { id: 'HALLOWEEN', label: 'Halloween Auteurs' },
              { id: 'SILENT_WEIMAR', label: 'Silent & Weimar Pioneers' },
              { id: 'KOREAN_GOLDEN_AGE', label: 'Korean Golden Age (KOFA)' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                activeTab === tab.id
                  ? 'bg-amber-500 text-black shadow-lg shadow-amber-500/20'
                  : 'bg-white/5 hover:bg-white/10 text-zinc-300 border border-white/10'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {directors.map((dir) => {
          const onPlatform = dir.filmography.filter((f) => f.isOnPlatform);
          const otherFilms = dir.filmography.filter((f) => !f.isOnPlatform);
          return (
            <div
              key={dir.id}
              onClick={() => setSelectedDirector(dir)}
              className="group rounded-3xl bg-gradient-to-b from-zinc-900/90 to-zinc-950 border border-white/10 hover:border-amber-500/40 p-5 transition-all duration-300 cursor-pointer flex flex-col justify-between shadow-lg hover:shadow-amber-500/10"
            >
              <div>
                {/* Header: Portrait + Name + Era */}
                <div className="flex items-start gap-4 mb-4">
                  <EnrichedPortrait
                    name={dir.name}
                    wikiSlug={dir.wikiSlug}
                    fallbackUrl={dir.portraitUrl}
                    className="w-16 h-20 rounded-2xl ring-2 ring-amber-500/30 group-hover:ring-amber-400 transition"
                  />
                  <div className="flex-1 min-w-0">
                    <span className="inline-block px-2 py-0.5 rounded-md bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[10px] font-black uppercase tracking-wider mb-1">
                      {dir.movement}
                    </span>
                    <h3 className="text-lg font-black text-white group-hover:text-amber-300 transition truncate">
                      {dir.name}
                    </h3>
                    <p className="text-[11px] text-zinc-400">
                      {dir.nationality} • {dir.lifespan}
                    </p>
                  </div>
                </div>

                {/* Biography Excerpt */}
                <p className="text-xs text-zinc-300 leading-relaxed line-clamp-3 mb-4">
                  {dir.bio}
                </p>

                {/* Playable on Platform */}
                {onPlatform.length > 0 && (
                  <div className="mb-3">
                    <div className="text-[10px] font-black uppercase tracking-widest text-emerald-400 mb-1.5 flex items-center gap-1">
                      <Play className="w-3 h-3 fill-current" /> Streaming on Plajah
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {onPlatform.map((w) => (
                        <button
                          key={`${w.title}-${w.year}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (w.platformFilmId && onPlayFilm) {
                              onPlayFilm(w.platformFilmId);
                            } else {
                              setSelectedDirector(dir);
                            }
                          }}
                          className="px-2.5 py-1 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/30 border border-emerald-500/30 text-emerald-300 text-[11px] font-bold flex items-center gap-1.5 transition"
                        >
                          <Play className="w-2.5 h-2.5 fill-current" />
                          {w.title} ({w.year})
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Other Landmark Works in Filmography */}
                {otherFilms.length > 0 && (
                  <div className="pt-3 border-t border-white/10">
                    <div className="text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-1.5 flex items-center gap-1">
                      <Clapperboard className="w-3 h-3 text-amber-400" />
                      Other Filmography Works ({otherFilms.length})
                    </div>
                    <div className="space-y-1">
                      {otherFilms.slice(0, 3).map((w) => (
                        <div
                          key={`${w.title}-${w.year}`}
                          className="text-[11px] text-zinc-300 flex items-baseline justify-between gap-2"
                        >
                          <span className="font-semibold text-zinc-200 truncate">
                            • {w.title}
                          </span>
                          <span className="text-[10px] font-mono text-amber-400/90 shrink-0">
                            {w.year}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between text-xs font-bold text-amber-300 group-hover:text-amber-200">
                <span>View Full Bio & {dir.filmography.length}-Film Dossier</span>
                <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </div>
            </div>
          );
        })}
      </div>

      {selectedDirector && (
        <ClassicDirectorDossierModal
          director={selectedDirector}
          onClose={() => setSelectedDirector(null)}
          onPlayFilm={onPlayFilm}
        />
      )}
    </section>
  );
};

// ── Interactive 2-Card Shuffle Deck (Character Front ⇄ Actor Behind) ────────
export const CharacterActorShuffleDeck: React.FC<{
  character: HalloweenCharacterWithActor;
  activeFace: 'CHARACTER' | 'ACTOR';
  onToggleFace: (e: React.MouseEvent) => void;
  size?: 'sm' | 'md' | 'lg';
}> = ({ character, activeFace, onToggleFace, size = 'md' }) => {
  const [shuffleKey, setShuffleKey] = useState(0);

  const handleShuffleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShuffleKey((k) => k + 1);
    onToggleFace(e);
  };

  const charImgUrl =
    character.characterImageUrl ||
    character.imageUrl ||
    character.actorPortraitUrl;
  const charWikiSlug = (character as any).characterWikiSlug || '';

  const isCharFront = activeFace === 'CHARACTER';

  const dims =
    size === 'lg'
      ? {
          container: 'w-40 h-36 sm:w-44 sm:h-40',
          card: 'w-24 h-32 sm:w-28 sm:h-36 rounded-2xl',
          offsetBackX: 46,
          swingOutX: 54,
        }
      : size === 'sm'
      ? {
          container: 'w-28 h-24',
          card: 'w-16 h-20 rounded-xl',
          offsetBackX: 30,
          swingOutX: 36,
        }
      : {
          container: 'w-32 h-28',
          card: 'w-20 h-24 rounded-2xl',
          offsetBackX: 36,
          swingOutX: 42,
        };

  return (
    <div
      onClick={handleShuffleClick}
      title={`Click to shuffle between ${character.characterName} (Character) and ${character.actorName} (Actor)`}
      className={`relative ${dims.container} shrink-0 cursor-pointer select-none group/deck`}
      style={{ perspective: '900px' }}
    >
      {/* Card 1: CHARACTER THUMBNAIL CARD */}
      <motion.div
        key={`char-card-${shuffleKey}-${isCharFront ? 'front' : 'back'}`}
        initial={
          shuffleKey > 0
            ? {
                x: isCharFront ? dims.offsetBackX : 0,
                y: isCharFront ? 5 : 0,
                rotateZ: isCharFront ? 10 : -3,
                scale: isCharFront ? 0.9 : 1,
              }
            : false
        }
        animate={{
          x: isCharFront
            ? [dims.offsetBackX, -dims.swingOutX * 0.65, 0]
            : [0, -dims.swingOutX, dims.offsetBackX],
          y: isCharFront ? [5, -10, 0] : [0, -8, 5],
          rotateZ: isCharFront ? [10, -16, -3] : [-3, -18, 10],
          rotateY: isCharFront ? [0, -35, 0] : [0, 35, 0],
          scale: isCharFront ? [0.9, 1.06, 1] : [1, 0.94, 0.9],
        }}
        transition={{
          duration: 0.44,
          ease: [0.22, 1, 0.36, 1],
        }}
        style={{
          zIndex: isCharFront ? 20 : 10,
          transformStyle: 'preserve-3d',
        }}
        className={`absolute left-0 top-1 ${dims.card} shadow-2xl transition-shadow ${
          isCharFront
            ? 'ring-2 ring-orange-500 shadow-[0_10px_28px_rgba(249,115,22,0.35)]'
            : 'ring-1 ring-white/25 opacity-90 group-hover/deck:translate-x-1 group-hover/deck:opacity-100'
        }`}
      >
        <EnrichedPortrait
          name={character.characterName}
          wikiSlug={charWikiSlug}
          fallbackUrl={charImgUrl}
          disableAccountLookup={true}
          className={`w-full h-full ${dims.card}`}
          accentColor="from-orange-500/40 to-amber-950/60"
        />
        <span
          className={`absolute bottom-1.5 left-1.5 px-1.5 py-0.5 rounded-md text-[8px] font-black uppercase tracking-wider shadow ${
            isCharFront
              ? 'bg-orange-500 text-black'
              : 'bg-black/80 text-orange-300 border border-orange-500/40'
          }`}
        >
          Character
        </span>
      </motion.div>

      {/* Card 2: ACTOR / VOICE PORTRAIT CARD (Sits behind/beside like a playing card) */}
      <motion.div
        key={`actor-card-${shuffleKey}-${!isCharFront ? 'front' : 'back'}`}
        initial={
          shuffleKey > 0
            ? {
                x: !isCharFront ? dims.offsetBackX : 0,
                y: !isCharFront ? 5 : 0,
                rotateZ: !isCharFront ? 10 : -3,
                scale: !isCharFront ? 0.9 : 1,
              }
            : false
        }
        animate={{
          x: !isCharFront
            ? [dims.offsetBackX, dims.swingOutX * 1.35, 0]
            : [0, dims.swingOutX * 1.4, dims.offsetBackX],
          y: !isCharFront ? [5, -10, 0] : [0, -8, 5],
          rotateZ: !isCharFront ? [10, 20, -3] : [-3, 18, 10],
          rotateY: !isCharFront ? [0, 35, 0] : [0, -35, 0],
          scale: !isCharFront ? [0.9, 1.06, 1] : [1, 0.94, 0.9],
        }}
        transition={{
          duration: 0.44,
          ease: [0.22, 1, 0.36, 1],
        }}
        style={{
          zIndex: !isCharFront ? 20 : 10,
          transformStyle: 'preserve-3d',
        }}
        className={`absolute left-0 top-1 ${dims.card} shadow-2xl transition-shadow ${
          !isCharFront
            ? 'ring-2 ring-emerald-400 shadow-[0_10px_28px_rgba(16,185,129,0.35)]'
            : 'ring-1 ring-white/25 opacity-90 group-hover/deck:translate-x-1 group-hover/deck:opacity-100'
        }`}
      >
        <EnrichedPortrait
          name={character.actorName}
          wikiSlug={character.actorWikiSlug}
          fallbackUrl={character.actorPortraitUrl}
          className={`w-full h-full ${dims.card}`}
          accentColor="from-emerald-500/35 to-purple-950/60"
        />
        <span
          className={`absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded-md text-[8px] font-black uppercase tracking-wider shadow ${
            !isCharFront
              ? 'bg-emerald-400 text-black'
              : 'bg-black/80 text-emerald-300 border border-emerald-500/40'
          }`}
        >
          Actor
        </span>
      </motion.div>

      {/* Floating Shuffle Badge Pill */}
      <button
        type="button"
        onClick={handleShuffleClick}
        className="absolute -bottom-1 left-1/2 -translate-x-1/2 z-30 px-2 py-0.5 rounded-full bg-zinc-900/95 hover:bg-orange-500 text-zinc-200 hover:text-black border border-white/20 hover:border-orange-300 text-[8px] font-black uppercase tracking-widest flex items-center gap-1 shadow-lg transition-colors whitespace-nowrap"
      >
        <Shuffle className="w-2.5 h-2.5" />
        <span>Flip Card</span>
      </button>
    </div>
  );
};

// ── Individual Character ⇄ Actor Shuffling Card ─────────────────────────────
export const CharacterActorShuffleCard: React.FC<{
  char: HalloweenCharacterWithActor;
  onSelect: (char: HalloweenCharacterWithActor) => void;
}> = ({ char, onSelect }) => {
  const [activeFace, setActiveFace] = useState<'CHARACTER' | 'ACTOR'>('CHARACTER');

  const toggleFace = (e: React.MouseEvent) => {
    e.stopPropagation();
    setActiveFace((prev) => (prev === 'CHARACTER' ? 'ACTOR' : 'CHARACTER'));
  };

  const isChar = activeFace === 'CHARACTER';

  return (
    <div
      onClick={() => onSelect(char)}
      className={`group rounded-2xl bg-gradient-to-b from-zinc-900/90 to-zinc-950 border p-4 transition-all cursor-pointer flex flex-col justify-between shadow-md ${
        isChar
          ? 'border-white/10 hover:border-orange-500/40'
          : 'border-emerald-500/30 hover:border-emerald-400/60'
      }`}
    >
      <div>
        {/* Top Row: Side-by-Side Stacked Character + Actor Shuffle Deck & Header */}
        <div className="flex items-start gap-3.5 mb-3.5">
          <CharacterActorShuffleDeck
            character={char}
            activeFace={activeFace}
            onToggleFace={toggleFace}
            size="md"
          />

          <div className="flex-1 min-w-0">
            {/* Interactive Character / Actor Switcher Pills */}
            <div className="flex items-center gap-1 mb-1.5">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveFace('CHARACTER');
                }}
                className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider transition ${
                  isChar
                    ? 'bg-orange-500 text-black shadow-sm'
                    : 'bg-white/5 text-zinc-400 hover:text-white'
                }`}
              >
                {char.tier || 'ROLE'}
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveFace('ACTOR');
                }}
                className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider flex items-center gap-1 transition ${
                  !isChar
                    ? 'bg-emerald-400 text-black shadow-sm'
                    : 'bg-white/5 text-emerald-300/80 hover:text-emerald-200'
                }`}
              >
                <ArrowLeftRight className="w-2.5 h-2.5" />
                Actor
              </button>
            </div>

            <AnimatePresence mode="wait">
              {isChar ? (
                <motion.div
                  key="char-head"
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 6 }}
                  transition={{ duration: 0.18 }}
                >
                  <div className="text-[10px] text-orange-300/90 font-bold uppercase tracking-wider truncate">
                    {char.role || char.roleArchetype}
                  </div>
                  <h4 className="text-base font-black text-white group-hover:text-orange-300 transition truncate">
                    {char.characterName}
                  </h4>
                  <button
                    type="button"
                    onClick={toggleFace}
                    className="text-xs font-bold text-amber-300/90 hover:text-emerald-300 truncate mt-0.5 flex items-center gap-1 text-left"
                  >
                    <span>Played by {char.actorName}</span>
                  </button>
                </motion.div>
              ) : (
                <motion.div
                  key="actor-head"
                  initial={{ opacity: 0, x: 6 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -6 }}
                  transition={{ duration: 0.18 }}
                >
                  <div className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider truncate">
                    Actor / Voice Cast
                  </div>
                  <h4 className="text-base font-black text-white group-hover:text-emerald-300 transition truncate">
                    {char.actorName}
                  </h4>
                  <button
                    type="button"
                    onClick={toggleFace}
                    className="text-xs font-bold text-orange-300/90 hover:text-orange-200 truncate mt-0.5 flex items-center gap-1 text-left"
                  >
                    <span>Role: {char.characterName}</span>
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            {char.actorYears && (
              <div className="text-[10px] text-zinc-500 truncate mt-0.5">
                {char.actorNationality ? `${char.actorNationality} • ` : ''}
                {char.actorYears}
              </div>
            )}
          </div>
        </div>

        {/* Dynamic Body Content that Swivels with the Card Selection */}
        <AnimatePresence mode="wait">
          {isChar ? (
            <motion.div
              key="char-body"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.18 }}
              className="space-y-2 text-xs"
            >
              <p className="text-zinc-300 line-clamp-2 leading-relaxed">
                <strong className="text-zinc-100">Character:</strong> {char.characterBio}
              </p>
              {char.characterArc && (
                <p className="text-zinc-400 line-clamp-2 leading-relaxed">
                  <strong className="text-orange-300">Arc:</strong> {char.characterArc}
                </p>
              )}
              <div className="mt-2.5 pt-2 border-t border-white/10 flex items-center justify-between gap-2">
                <p className="text-[11px] text-zinc-400 truncate">
                  <strong className="text-emerald-400">Actor:</strong> {char.actorName}
                </p>
                <button
                  type="button"
                  onClick={toggleFace}
                  className="text-[10px] font-black uppercase tracking-wider text-emerald-400 hover:text-emerald-300 flex items-center gap-1 shrink-0"
                >
                  <Shuffle className="w-3 h-3" /> Shuffle to Actor
                </button>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="actor-body"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.18 }}
              className="space-y-2 text-xs"
            >
              <p className="text-zinc-200 line-clamp-3 leading-relaxed">
                <strong className="text-emerald-400">Actor Bio:</strong> {char.actorBio}
              </p>
              {char.performanceNote && (
                <p className="text-amber-200/90 text-[11px] line-clamp-2 leading-relaxed">
                  <strong className="text-amber-400">Performance:</strong> {char.performanceNote}
                </p>
              )}
              {(char.actorNotableWorks || char.actorOtherWorks || []).length > 0 && (
                <div className="flex flex-wrap gap-1 pt-1">
                  {(char.actorNotableWorks || char.actorOtherWorks || [])
                    .slice(0, 3)
                    .map((w) => (
                      <span
                        key={w}
                        className="px-2 py-0.5 rounded bg-white/5 text-[10px] text-zinc-300 truncate max-w-[180px]"
                      >
                        {w}
                      </span>
                    ))}
                </div>
              )}
              <div className="mt-2.5 pt-2 border-t border-white/10 flex items-center justify-between gap-2">
                <p className="text-[11px] text-zinc-400 truncate">
                  <strong className="text-orange-400">Character:</strong> {char.characterName}
                </p>
                <button
                  type="button"
                  onClick={toggleFace}
                  className="text-[10px] font-black uppercase tracking-wider text-orange-400 hover:text-orange-300 flex items-center gap-1 shrink-0"
                >
                  <Shuffle className="w-3 h-3" /> Shuffle to Character
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="mt-3 pt-2 border-t border-white/5 flex items-center justify-between text-[11px] font-bold text-orange-300">
        <span>
          ~{Math.max(1, Math.round((char.screenTimeSec || 180) / 60))}m screen time
        </span>
        <span className="flex items-center gap-1 group-hover:translate-x-0.5 transition-transform">
          Character & Actor Dossier <ChevronRight className="w-3.5 h-3.5" />
        </span>
      </div>
    </div>
  );
};

// ── Character & Actor Behind Them Modal ─────────────────────────────────────
export const CharacterActorModal: React.FC<{
  character: HalloweenCharacterWithActor | null;
  filmTitle?: string;
  onClose: () => void;
  onSeekToScene?: (tSec: number) => void;
}> = ({ character, filmTitle, onClose, onSeekToScene }) => {
  const [activeFace, setActiveFace] = useState<'CHARACTER' | 'ACTOR'>('CHARACTER');

  useEffect(() => {
    setActiveFace('CHARACTER');
  }, [character?.id, character?.characterId]);

  if (!character) return null;

  return (
    <div
      className="fixed inset-0 z-[120] bg-black/85 backdrop-blur-xl flex items-center justify-center p-4 md:p-6 overflow-y-auto animate-fade-in"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-3xl bg-zinc-950 border border-orange-500/30 rounded-3xl shadow-2xl overflow-hidden my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-5 right-5 z-10 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="p-6 md:p-8 bg-gradient-to-br from-orange-950/50 via-zinc-900 to-zinc-950 border-b border-white/10">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
            <CharacterActorShuffleDeck
              character={character}
              activeFace={activeFace}
              onToggleFace={() =>
                setActiveFace((prev) => (prev === 'CHARACTER' ? 'ACTOR' : 'CHARACTER'))
              }
              size="lg"
            />
            <div className="space-y-2 flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full bg-orange-500/20 border border-orange-500/40 text-orange-300 text-[10px] font-black uppercase tracking-widest">
                  {character.tier} CHARACTER
                </span>
                <span className="px-2.5 py-0.5 rounded-full bg-white/10 text-zinc-200 text-[10px] font-bold uppercase tracking-wider">
                  {character.role || character.roleArchetype}
                </span>
                {filmTitle && (
                  <span className="text-xs text-zinc-400 font-semibold">• {filmTitle}</span>
                )}
              </div>
              <h2 className="text-2xl md:text-3xl font-black text-white">
                {character.characterName}
              </h2>
              <p className="text-sm text-emerald-300 font-bold">
                Portrayed / Voiced by {character.actorName}{' '}
                {character.actorYears ? `(${character.actorYears})` : ''}
                {character.actorNationality ? ` • ${character.actorNationality}` : ''}
              </p>
              <div className="pt-1 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setActiveFace((prev) => (prev === 'CHARACTER' ? 'ACTOR' : 'CHARACTER'))
                  }
                  className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-orange-500 hover:text-black text-white text-[11px] font-black uppercase tracking-wider flex items-center gap-1.5 transition"
                >
                  <Shuffle className="w-3.5 h-3.5" />
                  Shuffle Card ({activeFace === 'CHARACTER' ? 'Show Actor Front' : 'Show Character Front'})
                </button>
                {onSeekToScene && typeof character.bestFrameSec === 'number' && (
                  <button
                    type="button"
                    onClick={() => {
                      onSeekToScene(character.bestFrameSec);
                      onClose();
                    }}
                    className="px-3 py-1.5 rounded-xl bg-orange-500/20 hover:bg-orange-500/30 border border-orange-500/40 text-orange-300 text-[11px] font-bold flex items-center gap-1.5 transition"
                  >
                    <Play className="w-3 h-3 fill-current" />
                    Jump to Key Scene
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="p-6 md:p-8 space-y-6">
          {/* Character Intelligence */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-2">
              <h3 className="text-xs font-black uppercase tracking-widest text-orange-400 flex items-center gap-1.5">
                <Theater className="w-4 h-4" />
                Character Profile & Motivation
              </h3>
              <p className="text-xs md:text-sm text-zinc-200 leading-relaxed">
                {character.characterBio}
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-orange-500/[0.06] border border-orange-500/20 space-y-2">
              <h3 className="text-xs font-black uppercase tracking-widest text-amber-300 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4" />
                Narrative Arc (Story Intelligence)
              </h3>
              <p className="text-xs md:text-sm text-zinc-200 leading-relaxed">
                {character.characterArc}
              </p>
              <div className="flex flex-wrap gap-3 pt-2 text-[11px] text-zinc-400">
                <span>
                  Screen Time:{' '}
                  <strong className="text-white">
                    {Math.max(1, Math.round((character.screenTimeSec || 180) / 60))} min
                  </strong>
                </span>
                <span>•</span>
                <span>
                  Dialogue / Key Beats:{' '}
                  <strong className="text-white">{character.dialogueLines || 12}</strong>
                </span>
              </div>
            </div>
          </div>

          {/* The Actor Behind the Character */}
          <div className="p-5 rounded-2xl bg-gradient-to-br from-zinc-900 to-zinc-950 border border-white/10 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-black uppercase tracking-widest text-emerald-400 flex items-center gap-2">
                <User className="w-4 h-4" />
                The Actor Behind the Role: {character.actorName}
              </h3>
            </div>
            <p className="text-xs md:text-sm text-zinc-200 leading-relaxed">
              {character.actorBio}
            </p>
            {character.performanceNote && (
              <div className="p-3 rounded-xl bg-black/40 border border-white/10 text-xs text-amber-200/90">
                <strong className="text-amber-400 uppercase tracking-wider text-[10px] block mb-0.5">
                  Performance Note:
                </strong>
                {character.performanceNote}
              </div>
            )}
            {(character.actorNotableWorks || character.actorOtherWorks || []).length > 0 && (
              <div className="pt-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400 block mb-2">
                  Actor’s Other Notable Filmography & Roles:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {(character.actorNotableWorks || character.actorOtherWorks || []).map((work) => (
                    <span
                      key={work}
                      className="px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-xs text-zinc-200 font-medium"
                    >
                      {work}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Characters & The Actors Behind Them Section (for MovieUXView & Showcases) ──
export const CharactersAndActorsSection: React.FC<{
  filmId: string;
  filmTitle?: string;
  directorName?: string;
  characters?: HalloweenCharacterWithActor[];
  fallbackCastMembers?: any[];
  worldCharacters?: any[];
  onSeekToScene?: (tSec: number) => void;
  onOpenStoryIntel?: () => void;
}> = ({
  filmId,
  filmTitle,
  directorName,
  characters: propCharacters,
  fallbackCastMembers,
  worldCharacters,
  onSeekToScene,
  onOpenStoryIntel,
}) => {
  const [selectedChar, setSelectedChar] =
    useState<HalloweenCharacterWithActor | null>(null);

  const characters = useMemo(() => {
    const normalizeCharName = (s?: string) =>
      String(s || '')
        .toLowerCase()
        .replace(/^special\s+/i, '')
        .replace(/[^a-z0-9]/g, '');

    const base =
      propCharacters && propCharacters.length > 0
        ? propCharacters
        : getCharactersForFilm(filmId);

    const byKey = new Map<string, HalloweenCharacterWithActor>();
    for (const c of base) {
      const k = (c.id || c.characterId || c.characterName || '').toLowerCase();
      if (k) {
        const resolvedImg = resolveStoryIntelPortraitUrl(
          c.characterImageUrl || c.imageUrl
        );
        byKey.set(k, {
          ...c,
          characterImageUrl: resolvedImg || c.characterImageUrl,
          imageUrl: resolvedImg || c.imageUrl,
        });
      }
    }

    // Merge any additional castMembers from movieMetadata or worldCharacters
    const extras = [...(fallbackCastMembers || []), ...(worldCharacters || [])];
    for (const raw of extras) {
      if (!raw) continue;
      const charName = raw.characterName || raw.name || raw.role || '';
      if (!charName) continue;
      const rawId = String(raw.id || '').toLowerCase();
      const canonicalCharId = rawId.replace(/^cast_(\d+)$/i, 'char_$1');
      const key = (canonicalCharId || charName).toLowerCase();
      const normIncoming = normalizeCharName(charName);

      const alreadyExists =
        byKey.has(key) ||
        byKey.has(rawId) ||
        Array.from(byKey.values()).some((x) => {
          if (normalizeCharName(x.characterName) === normIncoming) return true;
          if (
            Array.isArray(x.aka) &&
            x.aka.some((alias) => normalizeCharName(alias) === normIncoming)
          ) {
            return true;
          }
          return false;
        });

      if (alreadyExists) {
        continue;
      }

      const defaultActor =
        raw.actorName ||
        (directorName && directorName.toLowerCase().includes('brian james gage')
          ? 'Brian James Gage'
          : directorName || 'Ensemble Cast');
      const isBrian = defaultActor.toLowerCase().includes('brian james gage');
      const charThumb = resolveStoryIntelPortraitUrl(
        raw.characterImageUrl || raw.imageUrl || raw.image || raw.avatar || ''
      );
      byKey.set(key, {
        id: raw.id || key,
        characterId: raw.id || key,
        characterName: charName,
        name: charName,
        tier: raw.tier || 'SUPPORTING',
        roleArchetype: raw.role || 'Featured Character',
        role: raw.role || 'Featured Character',
        characterBio:
          raw.bio ||
          raw.description ||
          `${charName} in ${filmTitle || 'this film'}.`,
        characterArc:
          raw.arc ||
          `Key narrative presence throughout ${filmTitle || 'the film'}.`,
        screenTimeSec: 420,
        dialogueLines: 28,
        bestFrameSec: 60,
        accentColor: raw.accentColor || '#F97316',
        characterImageUrl: charThumb,
        imageUrl: charThumb,
        actorName: defaultActor,
        actorWikiSlug: isBrian ? '' : defaultActor.replace(/\s+/g, '_'),
        actorPortraitUrl: isBrian
          ? 'https://firebasestorage.googleapis.com/v0/b/gen-lang-client-0665118474.firebasestorage.app/o/users%2Fu4XNVf41QeQERFqO0CB8JEhegXz2%2Fphoto_1780582675240?alt=media&token=bd675512-565b-4a98-83c5-5fe72e40b0dc'
          : raw.actorPortraitUrl || charThumb,
        actorYears: isBrian ? 'Contemporary' : '',
        actorNationality: isBrian ? 'American' : '',
        actorBio:
          raw.actorBio ||
          (isBrian
            ? 'Creator, writer, director, and multi-character voice actor of Pumpkin Patch and the Planet Ween Universe.'
            : `Performer portraying ${charName} in ${filmTitle || 'this production'}.`),
        performanceNote: raw.performanceNote || '',
        actorOtherWorks: raw.actorOtherWorks || [],
        actorNotableWorks: raw.actorNotableWorks || [],
      });
    }

    return Array.from(byKey.values());
  }, [filmId, filmTitle, directorName, propCharacters, fallbackCastMembers, worldCharacters]);

  if (!characters || characters.length === 0) return null;

  return (
    <section className="py-6 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-orange-500/15 border border-orange-500/30 text-orange-300 text-[10px] font-black uppercase tracking-widest mb-1.5">
            <Shuffle className="w-3.5 h-3.5" />
            Interactive Cast Deck • Click Any Card Stack to Shuffle Character ⇄ Actor
          </div>
          <h3 className="text-xl md:text-2xl font-black text-white tracking-tight">
            Characters & The Actors Behind Them ({characters.length})
          </h3>
          <p className="text-xs text-zinc-400 mt-0.5">
            Each character thumbnail sits in front with the actor or voice performer’s card behind it — click the stacked cards to swivel and shuffle between the Character and the Actor.
          </p>
        </div>

        {onOpenStoryIntel && (
          <button
            onClick={onOpenStoryIntel}
            className="px-4 py-2 rounded-xl bg-orange-500 hover:bg-orange-400 text-black font-black text-xs flex items-center gap-1.5 transition shrink-0 shadow-lg shadow-orange-500/20"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Open Full Story Intelligence Report
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {characters.map((char) => (
          <CharacterActorShuffleCard
            key={char.id || char.characterId}
            char={char}
            onSelect={setSelectedChar}
          />
        ))}
      </div>

      {selectedChar && (
        <CharacterActorModal
          character={selectedChar}
          filmTitle={filmTitle}
          onClose={() => setSelectedChar(null)}
          onSeekToScene={onSeekToScene}
        />
      )}
    </section>
  );
};

// ── Halloween Curation Story Intelligence, Character & Actor Hub ─────────────
export const HalloweenCurationStoryIntelSection: React.FC<{
  onPlayFilm?: (filmId: string) => void;
  onOpenFilmStoryIntel?: (filmId: string) => void;
}> = ({ onPlayFilm, onOpenFilmStoryIntel }) => {
  const bundles = useMemo(
    () => Object.values(HALLOWEEN_STORY_INTEL_BUNDLES),
    []
  );
  const [selectedFilmId, setSelectedFilmId] = useState<string>(
    bundles[0]?.filmId || 'Night.Of.The.Living.Dead_1080p'
  );
  const [selectedChar, setSelectedChar] =
    useState<HalloweenCharacterWithActor | null>(null);
  const [selectedDirector, setSelectedDirector] =
    useState<ClassicDirectorProfile | null>(null);

  const activeBundle: HalloweenFilmIntelBundle | undefined = useMemo(
    () =>
      HALLOWEEN_STORY_INTEL_BUNDLES[selectedFilmId] ||
      bundles[0],
    [selectedFilmId, bundles]
  );

  const activeDirector = useMemo(
    () =>
      activeBundle
        ? getDirectorProfile(activeBundle.director, activeBundle.filmId)
        : undefined,
    [activeBundle]
  );

  if (!activeBundle) return null;

  return (
    <section className="py-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-orange-500/20 border border-orange-500/40 text-orange-300 text-[10px] font-black uppercase tracking-widest mb-2">
            <Flame className="w-3.5 h-3.5 text-orange-400" />
            Story Intelligence Engine • Full Curation Coverage ({bundles.length} Films)
          </div>
          <h2 className="text-2xl md:text-3xl font-black text-white tracking-tight">
            Halloween Curation: Story Intelligence, Characters & The Actors Behind Them
          </h2>
          <p className="text-xs md:text-sm text-zinc-400 max-w-3xl mt-1">
            Every film in the Halloween Curation has been analyzed by Taleo Story Intelligence — unlocking 3-act structural breakdowns, timestamped scenes, key MacGuffins, character psychological arcs, and the biographies & filmographies of the actors and directors behind them.
          </p>
        </div>
      </div>

      {/* Film Selector Pills */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 no-scrollbar">
        {bundles.map((b) => {
          const active = b.filmId === activeBundle.filmId;
          return (
            <button
              key={b.filmId}
              onClick={() => setSelectedFilmId(b.filmId)}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition flex items-center gap-2 shrink-0 ${
                active
                  ? 'bg-gradient-to-r from-orange-500 to-amber-500 text-black font-black shadow-lg shadow-orange-500/25'
                  : 'bg-white/5 hover:bg-white/10 text-zinc-300 border border-white/10'
              }`}
            >
              <Film className="w-3.5 h-3.5" />
              <span>{b.title}</span>
              <span className={active ? 'text-black/70' : 'text-zinc-500'}>
                ({b.year})
              </span>
            </button>
          );
        })}
      </div>

      {/* Active Film Story Intelligence Workspace */}
      <div className="rounded-3xl bg-gradient-to-br from-zinc-900/95 via-zinc-950 to-orange-950/20 border border-orange-500/30 p-6 md:p-8 space-y-8 shadow-2xl">
        {/* Top Row: Film Overview + Director Mini-Card + Actions */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          <div className="lg:col-span-2 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-[10px] font-black uppercase tracking-widest">
                STORY INTEL READY
              </span>
              <span className="px-2.5 py-0.5 rounded-full bg-white/10 text-amber-300 text-[10px] font-bold uppercase tracking-wider">
                {activeBundle.year} • {Math.round(activeBundle.runtimeSec / 60)} min
              </span>
              <span className="text-xs text-zinc-400">
                {Array.isArray(activeBundle.tone) ? activeBundle.tone.join(' • ') : activeBundle.tone}
              </span>
            </div>

            <h3 className="text-2xl md:text-3xl font-black text-white">
              {activeBundle.title}
            </h3>

            <p className="text-sm md:text-base text-orange-200/95 font-medium italic">
              “{activeBundle.logline || activeBundle.report.logline}”
            </p>

            <p className="text-xs md:text-sm text-zinc-300 leading-relaxed">
              {activeBundle.synopsis || activeBundle.report.synopsis}
            </p>

            {/* Themes */}
            <div className="flex flex-wrap gap-1.5 pt-1">
              {(activeBundle.themes || activeBundle.report.themes || []).map((th) => (
                <span
                  key={th}
                  className="px-2.5 py-1 rounded-lg bg-orange-500/10 border border-orange-500/25 text-[11px] font-semibold text-orange-200"
                >
                  #{th}
                </span>
              ))}
            </div>

            <div className="flex flex-wrap gap-3 pt-2">
              {onPlayFilm && (
                <button
                  onClick={() => onPlayFilm(activeBundle.filmId || activeBundle.identifier)}
                  className="px-5 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-400 text-black font-black text-xs uppercase tracking-wider flex items-center gap-2 transition shadow-lg shadow-orange-500/25"
                >
                  <Play className="w-4 h-4 fill-current" />
                  Watch & Inspect {activeBundle.title}
                </button>
              )}
              {onOpenFilmStoryIntel && (
                <button
                  onClick={() => onOpenFilmStoryIntel(activeBundle.filmId || activeBundle.identifier)}
                  className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-white font-bold text-xs flex items-center gap-2 transition"
                >
                  <Sparkles className="w-4 h-4 text-orange-400" />
                  Open Interactive Story Intel & Screenplay
                </button>
              )}
            </div>
          </div>

          {/* Director Card on the Right */}
          {activeDirector && (
            <div
              onClick={() => setSelectedDirector(activeDirector)}
              className="p-4 rounded-2xl bg-black/50 border border-amber-500/30 hover:border-amber-400 transition cursor-pointer space-y-3"
            >
              <div className="flex items-center gap-3.5">
                <EnrichedPortrait
                  name={activeDirector.name}
                  wikiSlug={activeDirector.wikiSlug}
                  fallbackUrl={activeDirector.portraitUrl}
                  className="w-16 h-20 rounded-xl ring-2 ring-amber-500/40"
                />
                <div className="min-w-0">
                  <span className="text-[10px] font-black uppercase tracking-widest text-amber-400 block">
                    Director & Auteur
                  </span>
                  <h4 className="text-base font-black text-white truncate">
                    {activeDirector.name}
                  </h4>
                  <p className="text-[11px] text-zinc-400">
                    {activeDirector.nationality} • {activeDirector.lifespan || activeDirector.birthDeath}
                  </p>
                  <span className="inline-block mt-1 px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 text-[10px] font-bold">
                    {activeDirector.movement}
                  </span>
                </div>
              </div>
              <p className="text-xs text-zinc-300 line-clamp-3 leading-relaxed">
                {activeDirector.bio || activeDirector.biography}
              </p>
              <div className="pt-2 border-t border-white/10">
                <div className="text-[10px] font-black uppercase tracking-wider text-zinc-400 mb-1">
                  Other Works in Filmography:
                </div>
                <div className="flex flex-wrap gap-1">
                  {activeDirector.filmography.slice(0, 4).map((f) => (
                    <span
                      key={`${f.title}-${f.year}`}
                      className="px-2 py-0.5 rounded bg-white/5 text-[10px] text-zinc-300"
                    >
                      {f.title} ({f.year})
                    </span>
                  ))}
                </div>
              </div>
              <div className="text-[11px] font-bold text-amber-300 flex items-center justify-between pt-1">
                <span>Open Director Bio & Filmography</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </div>
            </div>
          )}
        </div>

        {/* 3-Act Structure + Key Scenes & Props */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {activeBundle.report.structure.acts.map((act) => (
            <div
              key={act.number}
              className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-2"
            >
              <div className="flex items-center justify-between">
                <span className="px-2.5 py-0.5 rounded-md bg-orange-500/20 text-orange-300 text-[10px] font-black uppercase tracking-widest">
                  Act {act.number}: {act.title}
                </span>
                <span className="text-[11px] font-mono text-zinc-400">
                  {Math.floor(act.startSec / 60)}m – {Math.floor(act.endSec / 60)}m
                </span>
              </div>
              <p className="text-xs text-zinc-300 leading-relaxed">{act.summary}</p>
              {act.turningPoint && (
                <div className="text-[11px] text-amber-300/90 pt-1 border-t border-white/5">
                  <strong>Turning Point:</strong> {act.turningPoint}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Characters & The Actors Behind Them */}
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-sm font-black uppercase tracking-widest text-orange-400 flex items-center gap-2">
              <Users className="w-4 h-4" />
              Characters & The Actors Behind Them in {activeBundle.title} (
              {(activeBundle.characters || activeBundle.charactersWithActors || []).length})
            </h4>
            <span className="text-[11px] text-zinc-400 flex items-center gap-1.5">
              <Shuffle className="w-3.5 h-3.5 text-orange-400" />
              Click any card stack to swivel & shuffle between Character and Actor
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {(activeBundle.characters || activeBundle.charactersWithActors || []).map((char) => (
              <CharacterActorShuffleCard
                key={char.id || char.characterId}
                char={char}
                onSelect={setSelectedChar}
              />
            ))}
          </div>
        </div>
      </div>

      {selectedChar && (
        <CharacterActorModal
          character={selectedChar}
          filmTitle={activeBundle.title}
          onClose={() => setSelectedChar(null)}
        />
      )}

      {selectedDirector && (
        <ClassicDirectorDossierModal
          director={selectedDirector}
          onClose={() => setSelectedDirector(null)}
          onPlayFilm={onPlayFilm}
        />
      )}
    </section>
  );
};
