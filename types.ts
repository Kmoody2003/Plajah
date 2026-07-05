
export interface Story {
  id: string;
  ownerId: string;
  ownerName: string;
  ownerPhoto?: string;
  mediaUrl: string;
  mediaType: 'PHOTO' | 'VIDEO';
  caption?: string;
  photoDisplayDuration?: number; // seconds (default 5)
  timestamp: number;
  expiresAt: number; // timestamp + 24h
  viewerIds?: string[];
  isPublic?: boolean;
  link?: string;
  backgroundColor?: string;
}

export interface InteractiveZone {
  id: string;
  type: 'PHOTO' | 'TEXT' | 'VINYL' | 'GAME_SCREEN';
  x: number; // percentage 0-100
  y: number; // percentage 0-100
  width: number; // percentage 0-100
  height: number; // percentage 0-100
  rotation?: number; // degrees
}

export interface PostThemeBackground {
  id: string;
  theme: 'SCRAPBOOK' | 'PHOTO_ALBUM' | 'MUSIC_PLAYER' | 'NEWSPAPER' | 'ARCADE';
  imageUrl: string;
  zones: InteractiveZone[];
  name: string;
  createdAt: number;
}

export interface MovieSpecialFeature {
  id: string;
  title: string;
  url: string;
  type?: 'BEHIND_THE_SCENES' | 'DELETED_SCENE' | 'INTERVIEW' | 'TRAILER' | 'OTHER';
}

export interface CastMember {
  id: string;
  actorName: string;
  characterName?: string;
  characterId?: string;
  role?: string;
}

export interface ProductionCredit {
  id: string;
  name: string;
  role: string;
  department: string;
}

export interface MovieMetadata {
  trailerUrl?: string;
  tagline?: string;
  cast?: string[];
  crew?: string[];
  castMembers?: CastMember[];
  productionCredits?: ProductionCredit[];
  releaseYear?: number;
  specialFeatures?: MovieSpecialFeature[];
}

/** Film/TV distribution + release choices, collected in the project uploader (folded in
 *  from the old "Distribute New Film" wizard) and refined later in the Film Distribution
 *  Hub. Stored on the Album as `filmDistribution`; legacy flags (isPaywalled/isAdSupported/
 *  price/isScheduled/releaseDate/earlyAccessEnabled/isPrivate) are also set from it. */
export interface FilmDistribution {
  /** FREE_FAST = ad-supported FAST channel; RENTAL/PURCHASE/HYBRID/PPV = paid. */
  model: 'FREE_FAST' | 'RENTAL' | 'PURCHASE' | 'HYBRID' | 'PPV';
  rentalPrice?: number;
  purchasePrice?: number;
  rentalWindowHrs?: 24 | 48 | 72;
  release: 'NOW' | 'SCHEDULED' | 'EARLY_ACCESS' | 'PRIVATE';
  releaseAt?: number;            // ms — for SCHEDULED
  fastChannel?: boolean;         // also run on the free 24/7 FAST channel
  watchParty?: boolean;          // host a premiere watch party
  contentRating?: string;        // G / PG / PG-13 / R / NC-17 / TV-MA …
}

/** An alternate cut/version of a film (extended, director's, unrated, …). The main film
 *  is tracks[0]; these are additional selectable versions the viewer can switch between. */
export interface FilmVersion {
  id: string;
  label: string;                 // "Director's Cut"
  type: 'THEATRICAL' | 'EXTENDED' | 'DIRECTORS' | 'UNRATED' | 'ALTERNATE' | 'OTHER';
  url: string;
  runtimeMin?: number;
  note?: string;
}

export interface TVSeason {
  id: string;
  number: number;
  episodes: Video[];
}

export interface Track {
  id: string;
  title: string;
  artist: string;
  artistId?: string; // Added artistId for radio/tips
  file?: File;
  url: string;
  duration?: number;
  videoUrl?: string;
  /** Whether this item is audio or video (video files can land in a track list). */
  mediaKind?: 'AUDIO' | 'VIDEO';
  images?: string[]; 
  lyrics?: string; 
  timeCodedLyrics?: { time: number; text: string }[];
  price?: number; // Price for individual purchase, 0 or undefined means free
  isPaywalled?: boolean; // If true, requires purchase to play/view
  license?: string; // Content license id (licensingService); defaults to All Rights Reserved
  genre?: string;
  isRadioEligible?: boolean; // Artist can opt-in
  isSlideshowEligible?: boolean; // Artist can opt-in
  likes?: number; // For radio ranking
  isExclusive?: boolean; // Members only content
  albumId?: string; // For personal collection grouping
  albumTitle?: string;
  albumCover?: string;
  videoId?: string; // Linked music video ID
  playCount?: number;
  shareCount?: number;
  isGlobalArchive?: boolean; // Original work by artist
  isPersonalMedia?: boolean; // Uploaded by user for personal use
  isAdSupported?: boolean; // If true, plays ads at adMarkers
  rightsOwnerId?: string; // ID of the rights holder
  tags?: string[];
  adMarkers?: AdMarker[]; // Time codes for ad insertion
  podcastMetadata?: PodcastMetadata;
  artistNotes?: string[];
  hnsSlot1?: { url: string; title: string; uploadedAt: number };
  hnsSlot2?: { url: string; title: string; uploadedAt: number };
  isEclipsa?: boolean;
  isAtmos?: boolean;    // Dolby Atmos / EC-3 JOC source — enables passthrough badge
  characterIds?: string[];                      // Characters featured in this song
  trackCharacterImages?: Record<string, string>; // Per-song image override (characterId → imageUrl)
  originalUrl?: string; // Preserved original URL when track has been auto-converted for browser compatibility
  browserCompatUrl?: string; // Browser-optimized WAV URL (16-bit PCM, plays natively without decode fallback)
  browserCompatStatus?: 'pending' | 'converting' | 'done' | 'failed'; // Conversion state
}

export interface Photo {
  id: string;
  url: string;
  title?: string;
  description?: string;
  timestamp: number;
  ownerId: string;
  isPublic?: boolean;
  isGalleryEligible?: boolean;
  mediaType?: 'PHOTO' | 'VIDEO';
  albumId?: string;
  likesCount?: number;
  favorites?: string[]; // UIDs
  tags?: string[];
  worldId?: string;     // Set when uploaded from the Worlds editor
  addedToLibrary?: boolean; // Whether it also appears in the user's personal library
}

export interface PhotoAlbum {
  id: string;
  ownerId: string;
  title: string;
  description?: string;
  photoIds: string[];
  isPublic: boolean;
  timestamp: number;
  order?: string[]; // For slideshow arrangement
}

export interface EventPhotoPool {
  id: string;
  eventId: string;
  ownerId: string;
  title: string;
  description?: string;
  mediaIds: string[];
  qrCodeUrl?: string;
  inviteLink?: string;
  timestamp: number;
}

export interface TVChannel {
  id: string;
  ownerId: string;
  title: string;
  description?: string;
  isAutoGenerated: boolean;
  curatedVideoIds: string[];
  liveStreamUrl?: string;
}

export interface WebApp {
  id: string;
  ownerId: string;
  developerName: string;
  title: string;
  description: string;
  url: string; // The link to the web app
  thumbnailUrl: string;
  screenshots: string[];
  videoTrailerUrl?: string;
  category: string;
  version: string;
  size: string; // e.g. "12.5 MB"
  rating: number; // 0-5
  reviewCount: number;
  installCount: number;
  timestamp: number;
  tags?: string[];
  isGlobalArchive?: boolean;
  state?: 'PUBLISHED' | 'IDLE' | 'INSTALLING' | 'RUNNING';
}

export interface AppReview {
  id: string;
  appId: string;
  userId: string;
  userName: string;
  userPhoto: string;
  rating: number; // 1-5
  comment: string;
  timestamp: number;
}

export interface Game {
  id: string;
  ownerId: string;
  title: string;
  description: string;
  url: string; // Web-based game link
  thumbnailUrl: string;
  playCount: number;
  timestamp: number;
  tags?: string[];
}

export interface RadioAd {
  id: string;
  url: string;
  title: string;
  duration: number;
}

export interface BookPage {
  id: string;
  url: string; // Image URL for comic pages
  pageNumber: number;
}

export interface BookNote {
  id: string;
  bookId: string;
  userId: string;
  pageNumber?: number; // if undefined, it's a general note
  chapterId?: string;
  type: 'TEXT' | 'AUDIO' | 'LINK';
  content: string; // text, audio url, or link url
  timestamp: number;
}

export interface BookChapter {
  id: string;
  title: string;
  content?: string; // Text content
  url?: string; // PDF or EPUB URL
  audioUrl?: string; // For audiobook/narration
  pages?: BookPage[]; // For comics/graphic novels
  price?: number; // 0 or undefined means free
  isPaywalled?: boolean;
  description?: string;
  tags?: string[];
  format?: 'EPUB' | 'PDF' | 'TXT' | 'COMIC' | 'DOCX' | 'RTF' | 'FB2' | 'HTML' | 'MOBI' | 'DJVU' | 'FILE';
  fallbackUrl?: string; // tried if url fails to load (e.g. Gutenberg when Storage miss)
}

// ── Book Authoring Studio types ────────────────────────────────────────────────

export type StudioPageType = 'TEXT' | 'COMIC' | 'MANGA' | 'FULL_BLEED' | 'MEDIA' | 'COVER' | 'CHAPTER_BREAK';

export interface SpeechBubble {
  id: string;
  type: 'speech' | 'thought' | 'shout' | 'whisper' | 'narration' | 'sfx';
  text: string;
  x: number; y: number;   // percent of panel
  width: number;           // percent of panel
  tailDir?: 'bl' | 'br' | 'tl' | 'tr';
  fontSize?: number;
}

export interface StudioPanel {
  id: string;
  x: number; y: number;       // percent of page canvas (0–100)
  width: number; height: number;
  imageUrl?: string;
  bgColor?: string;
  bubbles: SpeechBubble[];
  caption?: string;
  captionPos?: 'top' | 'bottom';
  borderStyle?: 'solid' | 'thick' | 'double' | 'none';
  shape?: 'rect' | 'diag-left' | 'diag-right';
  sfxText?: string;
  sfxStyle?: 'bold' | 'impact' | 'manga';
}

export interface InteractiveEmbed {
  id: string;
  type: 'VIDEO' | 'AUDIO' | 'IMAGE' | 'HOTSPOT' | 'QUIZ';
  url?: string;
  label?: string;
  x?: number; y?: number;  // position on page (percent)
  trackId?: string;
  videoId?: string;
  quizData?: { question: string; options: string[]; answer: number };
}

export interface StudioPage {
  id: string;
  type: StudioPageType;
  order: number;
  // TEXT pages
  richText?: string;
  chapterTitle?: string;
  // COMIC / MANGA pages
  panels?: StudioPanel[];
  readingDir?: 'ltr' | 'rtl';
  colorMode?: 'color' | 'bw' | 'sepia';
  panelGutter?: number;
  // FULL_BLEED / COVER / MEDIA
  imageUrl?: string;
  mediaUrl?: string;
  mediaType?: 'IMAGE' | 'VIDEO' | 'AUDIO';
  overlay?: string;
  // Interactive embeds (any page type)
  embeds?: InteractiveEmbed[];
  // Metadata
  notes?: string;
  bgColor?: string;
}

export interface StudioBook {
  id: string;
  title: string;
  author: string;
  synopsis: string;
  genre: string;
  format: 'NOVEL' | 'GRAPHIC_NOVEL' | 'MANGA' | 'WEBTOON' | 'COMIC' | 'NON_FICTION' | 'ILLUSTRATED';
  coverImageUrl?: string;
  pages: StudioPage[];
  readingDir: 'ltr' | 'rtl';
  colorMode: 'color' | 'bw';
  defaultPageColor: string;
  createdAt: number;
  updatedAt: number;
  publishedAlbumId?: string;
}

export interface Book {
  id: string;
  title: string;
  author: string;
  description: string;
  coverImage: string;
  chapters: BookChapter[];
  genre: string;
  price?: number; // Price for full book, 0 or undefined means free
  isPaywalled?: boolean;
  createdAt: number;
  tags?: string[];
  isGraphicNovel?: boolean;
}

export interface Album {
  id: string;
  ownerId?: string; // UID of the user who created it
  isDraft?: boolean;
  title: string;
  artist: string;
  artistBio?: string;
  artistImage?: string;
  artistFile?: File; // For direct upload
  coverImage: string;
  coverFile?: File; // For direct upload
  headerImage?: string;
  description: string;
  linerNotes?: string;
  trackListLabel?: string;
  tracks: Track[];
  slideshow?: string[]; 
  slideshowFiles?: File[]; // For direct upload
  createdAt: number;
  themeColor: string;
  isPublic?: boolean;
  isPrivate?: boolean; // If true, only accessible in chats/groups or to owner
  publishVideosToGallery?: boolean; // If true, album videos are mirrored to videos collection
  releaseDate?: number; // Timestamp for scheduled release
  isScheduled?: boolean; // Toggle for scheduling
  galleryUrl?: string; // Link to "Gallery Experience"
  genre?: string;
  price?: number; // Price for full album
  isPaywalled?: boolean;
  /** Content license id (see services/licensingService ContentLicenseId).
   *  Defaults to All Rights Reserved when unset. Gated behind CONTENT_LICENSING. */
  license?: string;
  type?: 'MUSIC' | 'VIDEO' | 'BOOK' | 'PHOTO' | 'GAME';
  subType?: 'MOVIE' | 'TV_SERIES' | 'GRAPHIC_NOVEL' | 'PODCAST' | 'NOVEL' | 'PLAYLIST';
  donationGoal?: number;
  donationCurrent?: number;
  socialLinks?: {
    twitter?: string;
    instagram?: string;
    spotify?: string;
    youtube?: string;
    website?: string;
  };
  musicVideos?: Video[];
  videoPlaylists?: VideoPlaylist[];
  seasons?: TVSeason[]; // For TV Series
  bookChapters?: BookChapter[];
  movieMetadata?: MovieMetadata; // Added for Movie Album type
  filmDistribution?: FilmDistribution; // Film/TV monetization + release (uploader → Taleo)
  alternateVersions?: FilmVersion[]; // Extended / director's / unrated cuts (film)
  bookPreviewConfig?: {
    type: 'CHAPTERS' | 'PAGES';
    allowedChapterIds?: string[];
    allowedPageRange?: [number, number];
  };
  liveFeedUrl?: string; // Album-specific live feed
  isGlobalArchive?: boolean; // Original work by artist
  playCount?: number;
  shareCount?: number;
  isAdSupported?: boolean; 
  customVideoUrl?: string;
  rightsOwnerId?: string;
  tags?: string[];
  featuredMedia?: {
    url: string;
    type: 'IMAGE' | 'VIDEO';
  };
  relatedProjectIds?: string[]; // IDs of other albums/projects connected to the same IP
  worldId?: string;
  timelineId?: string;
  characterIds?: string[];
  isSlideshowEnabled?: boolean; // Toggle for slideshow experience in player
  hideNSeekConfig?: HideNSeekConfig;
  gameUrl?: string;
  gameFeatures?: Record<string, boolean>;
  gameScreenshots?: string[];
  gameVideoUrl?: string;
  allowPageSharing?: boolean;
  scriptData?: ScriptData;
  // Audius decentralized publishing
  publishToAudius?: boolean;        // artist toggled "publish to Audius"
  audiusPublishStatus?: 'pending' | 'publishing' | 'published' | 'failed';
  audiusPermalinks?: string[];      // one URL per track published to Audius
  // Early Access & Review Codes
  earlyAccessEnabled?: boolean;
  earlyAccessList?: EarlyAccessEntry[];
  reviewCodes?: ReviewCode[];
}

// ─── EARLY ACCESS ────────────────────────────────────────────────────────────

export interface EarlyAccessEntry {
  email?: string;                   // invited by email
  uid?: string;                     // invited by Plajah UID
  displayName?: string;
  addedAt: number;
  label?: string;                   // e.g. "Press", "Reviewer"
  codeUsed?: string;                // review code that was redeemed to grant access
}

export interface ReviewCode {
  id: string;
  albumId: string;
  code: string;                     // 8-char uppercase alphanumeric
  label: string;                    // e.g. "Press Copy #1", "Spotify Editorial"
  createdAt: number;
  expiresAt?: number;
  maxUses: number;                  // 1 = single use, 0 = unlimited
  useCount: number;
  isRevoked: boolean;
}

export interface EarlyAccessRequest {
  id: string;
  albumId: string;
  albumTitle: string;
  albumCover?: string;
  requesterId: string;
  requesterName: string;
  requesterPhoto?: string;
  creatorId: string;
  status: 'PENDING' | 'GRANTED' | 'DENIED';
  generatedCode?: string;           // set when creator grants access
  message?: string;                 // optional note from requester
  requestedAt: number;
  respondedAt?: number;
}

// ─── HIDE N SEEK ─────────────────────────────────────────────────────────────

export interface HideNSeekAlternate {
  id: string;              // "{parentTrackId}_slot{1|2}"
  albumId: string;
  parentTrackId: string;
  slot: 1 | 2;
  title: string;
  artist: string;
  url: string;
  duration?: number;
  uploadedAt: number;
}

export interface HideNSeekTrackConfig {
  trackId: string;
  enabled: boolean;
  slot1Id?: string;        // HideNSeekAlternate.id in slot 1
  slot2Id?: string;        // HideNSeekAlternate.id in slot 2
}

export interface HideNSeekWindow {
  id: string;
  startTime: string;       // "HH:MM" 24-h local time
  daysOfWeek: number[];    // 0 = Sun … 6 = Sat
}

export interface HideNSeekConfig {
  isEnabled: boolean;
  globalEnabled: boolean;  // true → every track with alts participates automatically
  windows: HideNSeekWindow[];   // max 3; each window lasts exactly 3 h, min 1 h apart
  trackConfigs: HideNSeekTrackConfig[];
  timezone?: string;       // IANA timezone string of the artist
}

export interface HideNSeekUserProgress {
  userId: string;
  albumId: string;
  discoveredAlternateIds: string[];
  updatedAt: number;
}

export interface HideNSeekStats {
  albumId: string;
  discoveryCount: Record<string, number>;   // alternateId → unique discovery count
  uniqueDiscovererIds: string[];
}

// ─────────────────────────────────────────────────────────────────────────────

export interface Universe {
  id: string;
  name: string;
  type: 'ON_PLATFORM' | 'ALLY';
  url?: string; // For ALLY
  coverImage?: string;
  description: string;
  createdAt: number;
}

export interface Episode {
  id: string;
  title: string;
  description: string;
  videoUrl?: string; // or content ID
  thumbnail?: string;
  duration: number; // in seconds
}

export interface Season {
  id: string;
  number: number;
  episodes: Episode[];
}

export interface TVSeries {
  id: string;
  title: string;
  description: string;
  coverImage?: string;
  genre: string;
  universeId: string; // Ref to Universe
  seasons: Season[];
}

export interface WorldBackgroundConfig {
  type: 'IMAGE' | 'VIDEO' | 'SLIDESHOW';
  images?: string[];           // For IMAGE or SLIDESHOW
  videoUrl?: string;           // For VIDEO
  slideshowInterval?: number;  // ms between slides (default 5000)
  opacity?: number;            // 0-1 overlay opacity
  blur?: boolean;
}

// Which Plajah tool a world entry originated from. Worlds is the shared hub:
// Lorea (books + scripts), FABULA, and the Worlds editor all read/write entries
// tagged with their source so data flows freely between them.
export type WorldSourceApp = 'WORLD' | 'LOREA_BOOK' | 'LOREA_SCRIPT' | 'FABULA';

export interface IPWorld {
  id: string;
  creatorId: string;
  name: string;
  description: string;
  coverImage: string;
  worldType: 'FICTION' | 'NON_FICTION';
  status?: 'DRAFT' | 'PUBLISHED';
  publishedAt?: number;
  parentWorldId?: string | null;
  timelineConfig: {
    startYear: number;
    endYear: number;
    unitName: string;
  };
  themeConfig: {
    primaryColor: string;
    secondaryColor: string;
    backgroundId: string;
    customBackgroundImage?: string;
    useFrostedGlassDefault?: boolean;
  };
  backgroundConfig?: WorldBackgroundConfig;  // Rich background imagery
  backgroundMusicAlbumId?: string;           // Album ID for ambient music
  backgroundMusicRadioArtistId?: string;     // Artist ID for radio stream
  assetIds: string[];
  characterIds: string[];
  loreIds: string[];
  timelineIds: string[];
  storyListIds: string[];
  moduleIds: string[];
  associatedClubIds: string[];
  graphConnections: GraphNodeConnection[];
  createdAt: number;
}

export interface GraphNodeConnection {
  sourceId: string;
  sourceType: 'WORLD' | 'CHARACTER' | 'LORE' | 'TIMELINE' | 'ALBUM' | 'VIDEO' | 'BOOK';
  targetId: string;
  targetType: 'WORLD' | 'CHARACTER' | 'LORE' | 'TIMELINE' | 'ALBUM' | 'VIDEO' | 'BOOK';
  relationshipType: string; // e.g. "LOVER", "BIRTHPLACE", "INSPIRED_BY"
}

export interface StoryList {
  id: string;
  worldId: string;
  name: string;
  description: string;
  assetIds: string[]; // Linked assets (movies, books, etc.)
  tags: string[]; // For intelligent association
}

export interface CharacterRelationship {
  characterId: string;
  characterName: string;
  type: 'FAMILY' | 'FRIEND' | 'RIVAL' | 'ALLY' | 'ENEMY' | 'ROMANTIC' | 'COWORKER' | 'ACQUAINTANCE' | 'MENTOR' | 'STUDENT';
  note?: string;
}

export interface CharacterJournalEntry {
  id: string;
  date: string;
  content: string;
  mood?: string;
}

export interface Character {
  id: string;
  worldId: string;
  name: string;
  bio: string;
  imageUrl: string;
  role: string;
  stats?: Record<string, string | number>;
  tags: string[];
  appearanceAt: { projectId: string; timestamp: number }[];
  isPublished?: boolean;
  // World Hub: which tool created/synced this entry and an idempotency ref, so
  // Lorea (book/script), FABULA, and Worlds can share entries without
  // duplicating. Re-syncing matches on (sourceApp, sourceRefId).
  sourceApp?: WorldSourceApp;
  sourceProjectId?: string;
  sourceRefId?: string;
  // Non-destructive dedup: an entry is never deleted — when a duplicate is
  // merged/superseded it is flagged discarded and moved to the Discarded folder.
  discarded?: boolean;
  discardedAt?: number;
  discardedReason?: string;       // e.g. "merged_into:<id>"
  themeAlbumId?: string;
  themeTrackId?: string;
  actorName?: string;
  // Enhanced fields
  gallery?: string[];          // Additional portrait/scene images
  clips?: string[];            // Short video clips
  physicalStats?: {
    height?: string;
    weight?: string;
    age?: string;
    birthdate?: string;
    species?: string;
    alignment?: string;
  };
  lore?: string;               // Long-form lore / origin story
  relationships?: CharacterRelationship[];
  journalEntries?: CharacterJournalEntry[];
  playlistAlbumIds?: string[]; // Album IDs linked for character playlist
  playlistTrackIds?: string[]; // Specific track IDs
  modelUrl?: string;           // GLTF/GLB 3D model URL
  accentColor?: string;        // Character accent color
}

export interface LoreEntry {
  id: string;
  worldId: string;
  title: string;
  content: string;
  tags: string[];
  type: 'LOCATION' | 'ENVIRONMENT' | 'ITEM' | 'PLOT_POINT' | 'BACKSTORY' | 'EVENT' | 'FACTION' | 'CREATURE';
  conflictsDetected: string[];
  isPublished?: boolean;
  // World Hub: shared-source tagging + idempotency ref (see Character).
  sourceApp?: WorldSourceApp;
  sourceProjectId?: string;
  sourceRefId?: string;
  // Non-destructive dedup — never deleted; discarded entries move to the folder.
  discarded?: boolean;
  discardedAt?: number;
  discardedReason?: string;
  // Enhanced fields
  gallery?: string[];          // Images for this lore entry
  clips?: string[];            // Video clips
  modelUrl?: string;           // 3D model URL for props/locations
  coordinates?: { x: number; y: number; description?: string }; // Map coordinates
  linkedCharacterIds?: string[];
  linkedEventIds?: string[];
  ambientMusicAlbumId?: string; // Background music for this location
}

export interface Timeline {
  id: string;
  worldId: string;
  name: string;
  description?: string;
  color?: string;
  createdAt: number;
}

export interface TimelineEvent {
  id: string;
  worldId: string;
  timelineId: string;
  title: string;
  description: string;
  year: number;
  isPublished?: boolean;
  linkedCharacterIds?: string[];
  linkedLoreIds?: string[];
  linkedAssetIds?: string[];
  // Enhanced fields
  gallery?: string[];
  clips?: string[];
  locationRef?: string;        // LoreEntry ID of the location
  significance?: 'MINOR' | 'MAJOR' | 'PIVOTAL';
}


// Character appearance markers on a video timeline (creator-tagged)
export interface CharacterTimestamp {
  characterId: string;
  characterName: string;
  imageUrl?: string;
  timestamps: number[]; // seconds into the video
}

// "What If" interactive branching system
export interface WhatIfChoice {
  id: string;
  label: string;
  description?: string;
  jumpsToTimestamp?: number;     // seek to this second in the same video
  jumpsToVideoId?: string;       // alternate scene / ending video
  jumpsToVideoTimestamp?: number;
}

export interface WhatIfBranchPoint {
  id: string;
  videoId: string;
  timestamp: number;   // seconds — pauses playback here and shows the question
  question: string;
  choices: WhatIfChoice[];
  createdBy: string;
}

export interface Video {
  id: string;
  ownerId: string;
  title: string;
  url: string;
  embedUrl?: string; // Added for YouTube/Vimeo support
  file?: File;
  thumbnailUrl?: string;
  thumbnailFile?: File;
  coverImageUrl?: string;
  coverImageFile?: File;
  description?: string;
  duration?: number;
  playsCount?: number;
  price?: number;
  isPaywalled?: boolean;
  license?: string; // Content license id (licensingService); defaults to All Rights Reserved
  genre?: string;
  artist?: string; 
  isPrivate?: boolean;
  worldId?: string;
  characterIds?: string[];        // Characters from this world that appear in this video
  timelinePointYear?: number;     // In-universe year/timestamp this video is set in
  releaseDate?: number;
  isScheduled?: boolean;
  likesCount?: number;
  commentsCount?: number;
  timestamp: number;
  tags?: string[];
  isAdSupported?: boolean;
  isAdFreeLocked?: boolean; // If true, and purchased, no ads
  allowInFastChannel?: boolean;
  adMarkers?: AdMarker[]; // Time codes for ad insertion
  muxPlaybackId?: string; // Mux streaming support
  muxAssetId?: string;
  podcastMetadata?: PodcastMetadata;
  /** Saved recording of a finished live stream — shown in Reello's "Past Live Streams". */
  isLiveRecording?: boolean;
  category?: 'MUSIC_VIDEO' | 'MOVIE' | 'TV_EPISODE' | 'TRAILER' | 'SHORT_FILM' | 'DOCUMENTARY';
  subType?: 'MOVIE' | 'TV_SERIES'; // Added subType to Video
  episodeNumber?: number; // Added for TV Series episodes
  seasonNumber?: number; // Added for TV Series episodes
  movieMetadata?: MovieMetadata;
  tvMetadata?: {
    seasonNumber?: number;
    episodeNumber?: number;
    seriesTitle?: string;
  };
  characterTimestamps?: CharacterTimestamp[];   // creator-tagged character appearances on timeline
  whatIfBranchPoints?: WhatIfBranchPoint[];     // interactive branch points
  isRello?: boolean;
  contentRating?: string;                       // G / PG / PG-13 / R / TV-MA … (maturity)
  /** Streaming subtitle/caption tracks (WebVTT). */
  subtitles?: { label: string; srclang: string; url: string; default?: boolean }[];
  /** Skip-intro / skip-recap timeline markers (seconds). */
  skipIntro?: { start: number; end: number };
  skipRecap?: { start: number; end: number };
}

export interface VideoLike {
  id: string;
  videoId: string;
  userId: string;
  timestamp: number;
}

export interface VideoComment {
  id: string;
  videoId: string;
  userId: string;
  userName: string;
  userPhoto: string;
  text: string;
  timestamp: number;
  parentId?: string; // For replies
}

export interface VideoPlaylist {
  id: string;
  ownerId: string;
  ownerName?: string;
  ownerPhoto?: string;
  title: string;
  description?: string;
  videoIds: string[];
  videos?: Video[];
  thumbnailUrl?: string;
  isPrivate?: boolean;
  isDraft?: boolean;
  isPublic: boolean;
  /** YouTube-style "Unlisted": readable by link but hidden from public browse. */
  unlisted?: boolean;
  /** Auto-managed system playlists (Watch Later). Not user-deletable. */
  system?: 'WATCH_LATER';
  updatedAt?: number;
  timestamp: number;
}

export interface Comment {
  id: string;
  author: string;
  text: string;
  timestamp: number;
  trackId?: string;
  videoId?: string;
  uid?: string | null;
  parentId?: string;
  mediaTimestamp?: number;
  gifUrl?: string;
}

export interface Review {
  id: string;
  productId: string;
  userId: string;
  userName: string;
  userPhoto: string;
  rating: number; // 1-5
  comment: string;
  timestamp: number;
}

export interface MerchItem {
  id: string;
  ownerId: string; // Artist or Brand ID
  title: string;
  description: string;
  price: number;
  salePrice?: number;
  imageUrl: string;
  videoUrl?: string; // Video for product page
  category: 'APPAREL' | 'MUSIC' | 'ACCESSORY' | 'DIGITAL' | 'COLLECTIBLES' | 'MEDIA';
  stock: number;
  timestamp: number;
  rating?: number;
  reviewCount?: number;
  isDigitalAsset?: boolean;
  linkedAssetId?: string; // ID of Track or Video if it's a media asset
  worldId?: string; // ID of the specific World this item belongs to
  // ── Rich product-page fields (managed in Store Manager) ──
  images?: string[];                                // gallery beyond imageUrl
  features?: string[];                              // bullet highlights
  specs?: { label: string; value: string }[];       // details / dimensions / material
  colorOptions?: { name: string; hex: string }[];   // swatch selector
  sizeOptions?: string[];                            // size selector
  isClothing?: boolean;                             // enables AI try-on
  // Printful fulfillment fields
  printfulSyncProductId?: number;
  printfulVariantId?: number;
  fulfillmentSource?: 'printful' | 'gelato' | 'manual' | 'external'; // 'external' = linked web store
  externalStoreUrl?: string; // e.g. Shopify/WooCommerce product URL
}

export interface UserRevenue {
  donations: number;
  merch: number;
  adRevenue: number;
  subscriptions: number;
  // Film distribution revenue
  filmRentals?: number;
  filmPurchases?: number;
  filmPPVTickets?: number;
  filmFastAdIncome?: number;
  filmReviewCodeLicenses?: number;
  cryptoWallet?: {
    bitcoin?: string;
    ethereum?: string;
    solana?: string;
  };
}

export interface FilmVideoAnalytics {
  videoId: string;
  title: string;
  completionRate: number;       // 0–1
  avgWatchDuration: number;     // seconds
  dropOffSegments: { pct: number; dropOffRate: number }[]; // pct 0-100 in 10% steps
  rentalCount: number;
  purchaseCount: number;
  ppvCount: number;
  uniqueViewers: number;
  sourceAttribution: { source: string; conversions: number }[];
}

export interface StoreSettings {
  isEnabled: boolean;
  useExternalStore: boolean;
  externalStoreUrl?: string;
  showDemoContent?: boolean;
}

export interface Donation {
  id: string;
  fromId: string;
  fromName: string;
  toId: string;
  albumId?: string;
  amount: number;
  message?: string;
  timestamp: number;
  // Church giving
  churchId?: string;
  fund?: string;
  recurring?: boolean;
}

export interface PrivateBoard {
  id: string;
  ownerId: string;
  name: string;
  createdAt: number;
  items: BoardItem[];
}

export interface BoardItem {
  id: string;
  type: string; // 'ALBUM', 'TRACK', 'POST', 'ARTICLE', 'BOOK', 'MOVIE', 'CUSTOM'
  contentId: string;
  x: number;
  y: number;
  width?: number;
  payload: any; // e.g. { title, imageUrl, snippet }
}

export interface SidebarItemConfig {
  id: string;
  order: number;
  isVisible: boolean;
}

/**
 * The kind of account. This is the SINGLE source of truth for account identity —
 * the legacy `isArtist`/`isBrandAdmin`/… booleans on UserProfile are derived from
 * it (see services/accountCapabilities.ts). Persist changes via
 * backendService.updateAccountType() so the enum and the derived flags never drift.
 */
export type AccountType =
  | 'FAN' | 'ARTIST' | 'BRAND' | 'WRITER' | 'STUDENT' | 'TEACHER'
  | 'PARTNER' | 'ORGANIZATION' | 'ATHLETE' | 'PARENT' | 'CHILD' | 'CLERGY';

export interface UserProfile {
  uid: string;
  displayName: string;
  photoURL: string;
  email: string;
  bio?: string;
  followerCount: number;
  followingCount: number;
  following?: string[];
  friendsCount?: number;
  joinedAt?: number;
  isArtist?: boolean; // True if they have uploaded content
  merch?: MerchItem[];
  acceptsTips?: boolean;
  tipGoal?: number;
  tipCurrent?: number;
  payItForwardOptIn?: boolean;
  payItForwardWinsMonth?: number;
  payItForwardWinsYear?: number;
  lastPayItForwardWinTimestamp?: number;
  photos?: Photo[];
  photoAlbums?: PhotoAlbum[];
  tvChannel?: TVChannel;
  games?: Game[];
  apps?: WebApp[];
  library?: string[]; // Track IDs of other people's music
  personalTracks?: Track[]; // Uploaded personal music
  personalPlaylists?: Playlist[]; // User created playlists
  activeEngagementScore?: number; // For radio ranking
  membershipConfig?: ArtistMembershipConfig;
  activeMemberships?: string[]; // Artist IDs where user is a member
  /** Canonical background slideshow. (A dead duplicate previously also lived under
   *  uiSettings — removed; nothing read it.) */
  backgroundSlideshow?: {
    enabled: boolean;
    items: { id: string; url: string; type: 'PHOTO' | 'VIDEO' }[];
  };
  fcmToken?: string;
  brandColor?: string;
  uiSettings?: {
    chatIconPosition?: { x: number; y: number };
    isChatIconPinned?: boolean;
    lastTheme?: ThemeType;
    isSpatialModeEnabled?: boolean;
    audiusEnabled?: boolean;
    syncedFolders?: { id: string; name: string }[];
  };
  pinnedItems?: { id: string; refId: string; type: 'POST' | 'VIDEO' | 'AUDIO' }[];
  fastChannelEnabled?: boolean;
  liveStreamConfig?: {
    streamUrl: string;
    fastChannelUrl?: string;
    activeStreamType?: 'LIVE' | 'FAST';
    title: string;
    isActive: boolean;
    source: string; // e.g., 'YouTube', 'Twitch', 'Custom', 'MUX'
    muxStreamId?: string;
    muxPlaybackId?: string;
    streamKey?: string;
    rtmpUrl?: string;
  };
  interestsNotebook?: string;
  publicInterests?: string[];
  privateInterests?: string[];
  interestAlgorithmProfile?: string;
  coverArt?: string;
  customPhotoURL?: string;
  mailingListCount?: number;
  sidebarConfig?: SidebarItemConfig[];
  hiddenSections?: string[];
  savedThemePresets?: string[];
  activeThemePresetId?: string;
  videos?: Video[];
  videoPlaylists?: VideoPlaylist[];
  articles?: Article[];
  favoriteSportsTeams?: string[];
  favoriteScienceFields?: string[];
  favoriteCoins?: string[];
  favoriteStocks?: string[];
  radioSettings?: {
    enabled: boolean;
    stationName?: string;
    stingers: string[]; // URLs
    ads: string[];      // URLs
    stingerFrequency: number;
    adFrequency?: number; // Added for ad playback logic
    otherCreators?: string[]; // UIDs of other creators to play on this station
    exclusiveContentIds?: string[]; // IDs of Tracks/Videos for members
    scheduledEvents?: {
      id: string;
      title: string;
      startTime: number;
      type: 'LIVE_TALK' | 'LIVE_STREAM';
    }[];
  };
  accountType?: AccountType;
  /** Athlete-account fields (accountType === 'ATHLETE'). The sports/chain layer reads these. */
  athleteSport?: 'FOOTBALL' | 'BASKETBALL' | 'SOCCER' | 'BASEBALL' | 'VOLLEYBALL' | 'HOCKEY' | 'TRACK' | 'OTHER';
  athletePosition?: string;
  athleteJersey?: number;
  athleteSchool?: string;
  athleteState?: string;
  athleteClassYear?: number;

  // ─── Family / child-safety (accountType 'PARENT' | 'CHILD') ─────────────────
  /** True for a managed child account. Safe defaults are applied regardless of who edits. */
  isChild?: boolean;
  /** uid of the managing parent/guardian (set on a CHILD account). */
  guardianUid?: string;
  /** uids of the children a PARENT account manages. */
  childUids?: string[];
  birthYear?: number;
  /** Per-account safety + screen-time settings. A child's are owned by the guardian. */
  parentalControls?: ParentalControls;
  // ─── Learner identity & lifecycle (Education Ledger — see docs/education) ───────
  /** Login handle for a CHILD account (the only account type with no email). */
  username?: string;
  /** Lifecycle of a child account: school-provisioned (walled) → parent-owned → self-owned. */
  childState?: 'SCHOOL_PROVISIONED' | 'PARENT_OWNED' | 'SELF_OWNED' | 'ARCHIVED';
  /** Teacher who provisioned a yet-unclaimed child account (classroom-scoped access only). */
  provisionedByTeacherUid?: string;
  /** Additional guardians granted scoped access beyond the primary (custody / pods). */
  coGuardianUids?: string[];
  /** Teacher verification tier — gates the right to provision child accounts. */
  teacherVerification?: 'UNVERIFIED' | 'DOMAIN' | 'DISTRICT_SSO' | 'ADMIN_APPROVED';
  /** Teaching designation. TEACHER = academic/K-12 (standards, ledger, student provisioning,
   *  verification). INSTRUCTOR = creator-economy courses (MasterClass/Skillshare-style, monetized,
   *  learners self-enroll). A user may hold both. Drives the Teaching-tab default + provisioning UI. */
  teachingKind?: ('TEACHER' | 'INSTRUCTOR')[];
  revenue?: UserRevenue;
  storeSettings?: StoreSettings;
  isWriter?: boolean;
  isBrandAdmin?: boolean;
  isFan?: boolean;
  isStudent?: boolean;
  isTeacher?: boolean;
  managedBrandIds?: string[];
  managedByBrandIds?: string[];
  role?: 'admin' | 'staff' | 'user';
  createdAt?: number;
  isPioneer?: boolean;
  pioneerRewardClaimed?: boolean;
  hasSeenWelcomePackage?: boolean;
  tier?: 'FREE' | 'PIONEER' | 'PRO' | 'ELITE';
  storageLimit: number; // 0 means unlimited
  storageUsage: {
    total: number;
    audio: number;
    video: number;
    photos: number;
  };
  isPartner?: boolean;
  isAdFree?: boolean;
  isFeatured?: boolean;
  featuredArtistPhoto?: string;
  masterEmail?: string;
  aliases?: UserAlias[];
  partnerConfig?: PartnerConfig;
  hasCompletedOnboarding?: boolean;
  experienceMode?: ExperienceMode;
  welcomeAchievementShown?: boolean;
  totalPoints?: number;
  onboardingStartTimestamp?: number;
  tooltipsEnabled?: boolean;
  frostedBackground?: string;
  themeBackgrounds?: { [theme: string]: string };
  videoBackgroundUrl?: string;
  videoBackgroundFrosted?: boolean;
  videoBackgroundBlur?: boolean;
  customBgEnabled?: boolean;      // false = hide frostedBackground/videoBackgroundUrl
  customThemeEnabled?: boolean;   // false = hide activeThemePreset slideshow
  defaultProfileTab?: 'FEED' | 'CONTENT' | 'ARTICLES' | 'PHOTOS' | 'VIDEOS' | 'TV' | 'GAMES' | 'LIVE_CHAT' | 'MERCH' | 'FOLLOWING' | 'FRIENDS' | 'INTERESTS' | 'LIBRARY' | 'MEMBERS';
  xHandle?: string;
  xUrl?: string;
  xEmbedHtml?: string;
  mastodonHandle?: string;
  mastodonInstance?: string; // e.g., mastodon.social
  blueskyHandle?: string; // e.g., username.bsky.social
  threadsHandle?: string; // e.g., username
  subscribedPodcastIds?: string[]; // Album IDs of podcasts user has subscribed to from the podcast section
  podcastRss?: PodcastRssSettings;
  avatar?: AvatarConfig;
  // Audius decentralized music platform
  audiusHandle?: string;       // e.g., "@myartist" on audius.co
  audiusUserId?: string;       // internal Audius user ID after OAuth
  audiusBearerToken?: string;  // OAuth bearer token for write API (stored encrypted in practice)
  // Stripe Connect — creator payouts
  stripeConnectAccountId?: string;   // acct_... Express account ID
  stripeConnectOnboarded?: boolean;  // details_submitted && charges_enabled
  stripeConnectPayoutsEnabled?: boolean;
  // Artist Mode — immersive landing page shown to visitors for 30 seconds
  artistModeEnabled?: boolean;
  // Artist Services
  artistServicesSubscription?: ArtistServicesSubscription;
  adCampaigns?: ArtistAdCampaign[];
  // Right Now — real-time presence sharing (opt-in)
  presenceEnabled?: boolean;
  // Smart Guide — contextual feature discovery assistant
  hasSeenSmartGuide?: boolean;
  smartGuideEnabled?: boolean;
  // Linked accounts for hot-switching (up to 4 slots)
  linkedAccounts?: LinkedAccount[];
}

// ── Right Now Presence ────────────────────────────────────────────────────────

export interface NowActiveEntry {
  uid: string;
  displayName: string;
  photoURL: string;
  type: 'TRACK' | 'VIDEO' | 'RADIO' | 'LIVE';
  // Track
  trackId?: string;
  trackTitle?: string;
  trackArtist?: string;
  albumId?: string;
  albumTitle?: string;
  albumCover?: string;
  // Video
  videoId?: string;
  videoTitle?: string;
  videoThumbnail?: string;
  // Creator of the content
  creatorUid?: string;
  creatorName?: string;
  // Timing
  startedAt: number;
  expiresAt: number;
}

// ── Creator Earnings ──────────────────────────────────────────────────────────

export type EarningCategory =
  | 'tip'            // live stream tips & gift payments
  | 'digital_sale'   // music, books, movies sold individually
  | 'sanctuary'      // Sanctuary membership fees
  | 'plajahplus'     // Plajah+ subscriptions bound to this creator
  | 'store_order'    // merch / physical store orders
  | 'club'           // club membership fees
  | 'seedraiser'     // crowdfunding pledge
  | 'other';

export interface EarningSplit {
  creatorUid: string;
  displayName: string;
  photoURL?: string;
  amountCents: number;
  percentage: number;
}

export interface CreatorEarning {
  id: string;
  creatorUid: string;
  payerUid?: string;
  category: EarningCategory;
  grossCents: number;        // total charged
  platformFeeCents: number;  // Plajah's cut
  netCents: number;          // what creator receives before splits
  splits?: EarningSplit[];   // amounts paid to split partners
  creatorNetCents: number;   // what THIS creator keeps after splits
  title: string;             // "Tip from @user" / "Album: Name" / etc.
  stripePaymentIntentId?: string;
  stripeTransferId?: string;
  status: 'pending' | 'transferred' | 'paid_out';
  timestamp: number;
}

// ── Split Configuration ───────────────────────────────────────────────────────

export interface SplitRecipient {
  creatorUid: string;
  displayName: string;
  photoURL?: string;
  percentage: number;        // of the creator's net (after platform fee)
}

export interface SplitConfig {
  ownerUid: string;
  recipients: SplitRecipient[];  // must sum to < 100
  appliesTo: EarningCategory[];  // which categories this split applies to
  updatedAt: number;
}

// ── Payout Summary ────────────────────────────────────────────────────────────

export interface PayoutSummary {
  period: '7d' | '30d' | '90d' | '1y' | 'all';
  totalGrossCents: number;
  totalPlatformFeeCents: number;
  totalNetCents: number;
  byCategory: Record<EarningCategory, { grossCents: number; netCents: number; count: number }>;
  pendingCents: number;
  paidOutCents: number;
  transactions: CreatorEarning[];
}

export interface SystemStats {
  totalUsers: number;
  activeUsers24h: number;
  globalStorage: {
    total: number;
    audio: number;
    video: number;
    photos: number;
  };
  globalBandwidth: {
    daily: number;
    monthly: number;
  };
  sectionUsage: {
    music: number;
    video: number;
    books: number;
    photos: number;
  };
}

export interface AdConfig {
  id: string;
  title: string;
  imageUrl: string;
  linkUrl: string;
  placement: 'SIDEBAR' | 'FEED' | 'PLAYER' | 'BANNER';
  isActive: boolean;
  impressions: number;
  clicks: number;
  targetGenres?: string[];
}

export type UserAdPromotedType =
  | 'MUSIC' | 'VIDEO' | 'PODCAST' | 'ARTICLE'
  | 'BOOK'  | 'FILM'  | 'TV'      | 'GAME'
  | 'LIVE_EVENT' | 'SANCTUARY';

export interface UserAdTrack {
  id: string;
  title: string;
  url: string;
}

export interface UserAd {
  id: string;
  ownerId: string;
  createdAt: number;
  updatedAt: number;
  isActive: boolean;

  /** Background fill of the billboard */
  backgroundType: 'video' | 'image' | 'cover_art';
  backgroundUrl?: string;

  /** Draggable profile-pic button position, 0–100 % of canvas */
  profilePicX: number;
  profilePicY: number;

  /** Promoted asset */
  promotedType?: UserAdPromotedType;
  promotedAssetId?: string;
  promotedAssetTitle?: string;
  promotedAssetImageUrl?: string;

  /** CTA tag shown at bottom */
  ctaText?: string;

  /** Autoplay-muted video teaser (centre of ad) */
  miniVideoUrl?: string;
  miniVideoAssetId?: string;

  /** Album sample player */
  albumPreviewId?: string;
  albumPreviewTitle?: string;
  albumPreviewTracks?: UserAdTrack[];
}

export interface Newsletter {
  id: string;
  artistId: string;
  title: string;
  content: string;
  timestamp: number;
  sentCount: number;
}

export interface MailingListSubscriber {
  id: string;
  artistId: string;
  subscriberId: string;
  subscriberEmail: string;
  subscriberName: string;
  timestamp: number;
}

export interface ExternalPlaylistTrack {
  id: string;           // e.g. "audius_abc123" or "ia_xyz"
  title: string;
  artist: string;
  url: string;
  thumbnailUrl?: string;
  source: 'AUDIUS' | 'INTERNET_ARCHIVE' | 'WIKIMEDIA' | 'JAMENDO' | 'SOUND_CLOUD';
  genre?: string;
  duration?: number;
}

export interface Playlist {
  id: string;
  ownerId: string;
  authorName?: string;
  authorPhoto?: string;
  title: string;
  description?: string;
  coverUrl?: string;
  coverImage?: string; // Unified with coverUrl usage in MusiView
  trackIds: string[];
  tracks?: Track[];
  externalTracks?: ExternalPlaylistTrack[]; // Audius / archive / vault tracks mixed in
  isDraft?: boolean;
  timestamp: number;
}

export interface CommunityPlaylist extends Omit<Playlist, 'timestamp'> {
  tags: string[];                  // 'workout', 'wellness', 'meditation', 'study', 'hype', 'chill', 'sleep'
  likes: number;
  plays: number;
  isPublic: true;
  sharedAt: number;
  timestamp: number;
}

export interface MembershipTier {
  id: string;
  name: string;
  price: number;
  description: string;
  benefits: string[];
}

export interface ArtistMembershipConfig {
  isEnabled: boolean;
  fee: number;
  isWaitingListEnabled: boolean;
  description: string;
  tiers?: MembershipTier[];
}

export interface Membership {
  id: string;
  artistId: string;
  memberId: string;
  status: 'PENDING' | 'ACTIVE' | 'REVOKED';
  startDate: number;
  expiryDate?: number;
}

export interface FollowRelation {
  id: string;
  followerId: string;
  followingId: string;
  timestamp: number;
}

export interface Post {
  id: string;
  authorId: string;         // always the owning user's uid (permissions)
  authorName: string;
  authorPhoto: string;
  /** Set when posted "as" an organization — display uses the org identity. */
  authorIsOrg?: boolean;
  authorOrgId?: string;
  text: string;
  /** Creator-applied safety labels — viewer settings decide blur/consent gating */
  contentLabels?: ('GRAPHIC_VIOLENCE' | 'MATURE_18' | 'ARTISTIC_NUDITY' | 'SENSITIVE_OTHER')[];
  media?: {
    type: 'PHOTO' | 'VIDEO' | 'AUDIO' | 'ALBUM' | 'LINK' | 'GIF' | 'STICKER' | 'MODEL3D';
    url?: string;
    id?: string; // For on-platform IDs
    title?: string;
    thumbnail?: string;
    linkPreview?: {
      title?: string;
      description?: string;
      image?: string;
      url: string;
    };
  }[];
  likesCount: number;
  likedBy?: string[];
  commentsCount: number;
  timestamp: number;
  isPublic: boolean;
  sourceCollection?: 'feed' | 'posts';
  albumEmbed?: Album; // For the mini player
  autoPlayEmbed?: boolean;
  modifiedAt?: number;
  targetUserId?: string;
  targetUserName?: string;
  tags?: string[];
  theme?: string;
  /** When set, this post's media/body is locked behind a Sanctuary (members or à la carte). */
  sanctuaryGate?: SanctuaryGate;
  /** Auto-created when the author goes live; cleared to a replay when it ends. */
  liveStreamId?: string;
  isLiveNow?: boolean;
  /** Live Room — when set, this post is a time-boxed live room (see services/roomService). */
  roomId?: string;
  roomTitle?: string;
  roomEndsAt?: number;
}

export interface FeedPage {
  id: string;
  type: 'IMAGE' | 'VIDEO' | 'TEXT' | 'MUSIC';
  url?: string;
  content?: string;
  media?: { url: string; type: 'IMAGE' | 'VIDEO' }[]; // For Photo Album (up to 4)
}

export interface FeedItem {
  id: string;
  authorId: string;
  authorName: string;
  authorPhoto: string;
  // Engagement score — written on every interaction, feed sorts by this
  score?: number;
  scoreUpdatedAt?: number;
  // Interaction buckets (keys match feedScoreEngine action types)
  interactions?: {
    deep: Record<string, number>;
    medium: Record<string, number>;
    base: Record<string, number>;
    dmSharerIds?: string[];
  };
  // Creator signal snapshot denormalized at post-creation and refreshed hourly
  creatorSignals?: {
    hasPaidSanctuaryMembers: boolean;
    hasActivePitchDeck: boolean;
    hasActiveFundraiser: boolean;
    isNewProjectLaunch: boolean;
    isFediverseConnected: boolean;
    isVerifiedIndependent: boolean;
  };
  type: 'PICTURE' | 'SONG' | 'COMMENT' | 'VIDEO' | 'BOOK' | 'NEWS' | 'GAME' | 'WATCH_ALONG' | 'LIVE_FEED' | 'RESEARCH_PAPER';
  theme?: 'SCRAPBOOK' | 'PHOTO_ALBUM' | 'MUSIC_PLAYER' | 'NEWSPAPER' | 'ARCADE' | 'WATCH_ALONG' | 'LIVE_FEED' | 'STANDARD';
  title?: string; // For news headlines
  content: string; // Text content or comment
  imageUrl?: string;
  songUrl?: string;
  songTitle?: string;
  albumId?: string;
  timestamp: number;
  source?: string; // For news
  url?: string; // For news links
  parentId?: string; // For threaded replies
  sourceCollection?: 'feed' | 'posts'; // Indicates which Firestore collection this item came from
  pages?: FeedPage[]; // For Scrapbook and Photo Album
  gameId?: string;
  shareCount: number;
  commentCount?: number;
  playCount?: number;
  backgroundId?: string;
  articleIds?: string[];
  deepLinkUrl?: string;
  aspectRatio?: 'VERTICAL' | 'HORIZONTAL' | 'SQUARE';
  autoCrop?: boolean;
  likesCount?: number;
  mediaTimestamp?: number;
}

export interface LiveFeed {
  id: string;
  ownerId: string;
  ownerName: string;
  ownerPhoto: string;
  title: string;
  url: string; // Embed URL (YouTube, Twitch, etc.)
  muxPlaybackId?: string; // For Mux live streams
  muxStreamId?: string;
  timestamp: number;
  status?: 'OFFLINE' | 'LIVE';
  isPublic?: boolean;
  price?: number;
  sanctuaryOnly?: boolean;
  genre?: string;
  subject?: string;
  brandId?: string;
  tags?: string[];
}

/** Saved after a live stream ends — rewatchable VOD via Mux asset. */
export interface StreamArchive {
  id: string;
  ownerId: string;
  ownerName: string;
  ownerPhoto: string;
  title: string;
  startedAt: number;
  endedAt: number;
  durationMs: number;
  /** Mux asset ID — asset may still be "preparing" for a few minutes after stream end. */
  muxAssetId: string | null;
  /** Mux playback ID — use https://stream.mux.com/{playbackId}.m3u8 once asset is ready. */
  muxPlaybackId: string | null;
  streamType: string;
}

export interface FanPage {
  id: string;
  ownerId: string;
  name: string;
  description: string;
  members: string[];
  timestamp: number;
}

export type ClubChannelType = 'TEXT' | 'ANNOUNCEMENT' | 'MEDIA' | 'EVENTS';

export interface ClubChannel {
  id: string;
  name: string;
  type: ClubChannelType;
  description?: string;
  isReadOnly?: boolean;   // only admins/writers can post
  createdAt: number;
}

export type ClubType = 'CLUB' | 'CHARITY' | 'SANCTUARY';
export type ClubJoinProcess = 'AUTO' | 'REVIEW' | 'QUESTIONNAIRE';
export type ClubRole = 'OWNER' | 'ADMIN' | 'MODERATOR' | 'WRITER' | 'MEMBER';
export type ClubAssetType = 'MUSIC' | 'VIDEO' | 'PHOTO' | 'ARTICLE' | 'BOOK' | 'PLAYLIST' | 'WORLD' | 'LINK';

export interface Club {
  id: string;
  name: string;
  description: string;
  creatorId: string;
  admins: string[];
  moderators: string[];
  coverImage?: string;
  iconImage?: string;
  category: string;
  tags: string[];
  isPrivate: boolean;
  joinProcess: ClubJoinProcess;
  questionnaire?: string[];
  rules?: string;
  allowedAssetTypes: ClubAssetType[];
  linksAllowed: boolean;
  memberCount: number;
  type: ClubType;
  customBackground?: string;
  customThemeId?: string;
  customFont?: string;
  hasLiveChat: boolean;
  hasMerchStore: boolean;
  hasExclusiveEvents: boolean;
  externalJoinUrl?: string;
  monthlyPrice?: number;
  yearlyPrice?: number;
  charityGoal?: number;
  charityRaised?: number;
  charityOrgName?: string;
  slowMode?: boolean;
  slowModeSeconds?: number;
  isDemo?: boolean;
  linkedBookId?: string;    // links club to a specific book (Album type: BOOK)
  inviteToken?: string;     // shareable invite token for join links
  channels?: ClubChannel[]; // sub-channels (optional; default = single general channel)
  timestamp: number;
  updatedAt: number;
}

export interface ClubMembership {
  id: string;
  clubId: string;
  userId: string;
  role: ClubRole;
  status: 'ACTIVE' | 'PENDING' | 'BANNED';
  displayName: string;
  photoUrl?: string;
  questionnaireAnswers?: string[];
  joinedAt: number;
}

// ─── CHURCH VERTICAL (Part 3) ───────────────────────────────────────────────
// A church is an Organization with orgType 'CHURCH'. Ministries are its sub-groups
// (youth, worship, prayer…) each with a leader + meeting time; service times drive
// the "plan your visit" surface. Giving/streaming/sermons layer on in later phases.

export interface Ministry {
  id: string;
  name: string;
  description?: string;
  leaderId?: string;
  leaderName?: string;
  meetingTime?: string;   // e.g. "Wednesdays 7:00 PM"
  iconEmoji?: string;
}

export interface ServiceTime {
  id: string;
  label: string;          // "Sunday Worship"
  day: string;            // "Sunday"
  time: string;           // "10:00 AM"
  isOnline?: boolean;
}

export interface GivingFund {
  id: string;
  name: string;           // "General", "Missions", "Building"
  description?: string;
  goal?: number;          // fundraising target ($), optional
  raised?: number;        // amount given so far ($)
}

// A community prayer request on a church/org page.
export interface ChurchPrayer {
  id: string;
  orgId: string;
  authorId: string;
  authorName: string;
  authorPhoto?: string;
  request: string;
  isPrivate?: boolean;        // visible to staff only
  prayingIds: string[];       // members who tapped "I'm praying"
  answered?: boolean;
  answeredNote?: string;
  timestamp: number;
}

// Multi-site: a church can have several campuses; each can publish a live program
// feed that a master-control location pulls as a switcher source.
export interface Campus {
  id: string;
  name: string;
  location?: string;
  isPrimary?: boolean;
}

export interface ProgramFeed {
  id: string;
  churchId: string;
  campusId: string;
  campusName: string;
  sessionId: string;      // rtc_sessions id the campus broadcasts its program on
  status: 'LIVE' | 'ENDED';
  startedAt: number;
}

// ─── ORGANIZATIONS (Part 2) ─────────────────────────────────────────────────
// A first-class parallel account — a merger of a business page + a club. Brand
// accounts are Organizations with orgType 'BRAND'; the church vertical specializes
// this same primitive (orgType 'CHURCH'), never forks it.

export type OrgType = 'BRAND' | 'BUSINESS' | 'CHURCH' | 'NONPROFIT' | 'CULTURAL' | 'LABEL' | 'TEAM' | 'OTHER';
export type OrgRole = 'OWNER' | 'ADMIN' | 'STAFF' | 'MODERATOR' | 'MEMBER';

export interface OrgRosterMember {
  memberId: string;      // uid (or free id) of a person on the org's public roster
  name: string;
  photo?: string;
  role?: string;         // e.g. "Lead Vocalist", "Senior Pastor"
}

export interface Organization {
  id: string;
  orgType: OrgType;
  name: string;
  handle?: string;       // unique @handle for the org page
  tagline?: string;
  about: string;
  logoUrl?: string;
  coverUrl?: string;
  accentColor?: string;

  // Ownership & staff
  creatorId: string;
  admins: string[];

  // Community (from Club)
  channels?: ClubChannel[];
  isPrivate?: boolean;
  joinProcess?: ClubJoinProcess;
  monthlyPrice?: number;
  yearlyPrice?: number;

  // Roster + showcase (from BrandPublicPageData)
  roster?: OrgRosterMember[];
  featuredIds?: string[];               // album/video/post ids to feature
  socialLinks?: { instagram?: string; twitter?: string; spotify?: string; youtube?: string; website?: string };

  // Business face (from BusinessPage)
  category?: string;
  location?: { address?: string; city?: string; phone?: string; email?: string; website?: string };
  hours?: { [day: string]: { open: string; close: string; closed?: boolean } };
  isVerified?: boolean;

  // Money
  stripeAccountId?: string;

  // Metrics + flags
  followerCount?: number;
  memberCount?: number;
  isPublic?: boolean;
  isDemo?: boolean;
  tags?: string[];

  /** If migrated from a legacy BrandAccount, its id — prevents re-migration. */
  legacyBrandId?: string;

  // Church vertical (orgType 'CHURCH')
  ministries?: Ministry[];
  serviceTimes?: ServiceTime[];
  givingFunds?: GivingFund[];
  campuses?: Campus[];        // multi-site locations
  denomination?: string;
  statementOfFaith?: string;
  givingUrl?: string;         // external giving link (fallback to native Stripe giving)

  createdAt: number;
  updatedAt: number;
}

export interface OrgMembership {
  id: string;
  orgId: string;
  userId: string;
  role: OrgRole;
  status: 'ACTIVE' | 'PENDING' | 'BANNED';
  displayName: string;
  photoUrl?: string;
  title?: string;        // staff title, e.g. "Youth Pastor", "Tour Manager"
  joinedAt: number;
}

export interface ClubPost {
  id: string;
  clubId: string;
  authorId: string;
  authorName: string;
  authorPhoto?: string;
  content: string;
  type: 'POST' | 'ANNOUNCEMENT' | 'ARTICLE_LINK';
  attachments?: Array<{ type: string; url: string; title?: string; thumbnailUrl?: string; assetId?: string }>;
  likes: string[];
  commentCount: number;
  isPinned: boolean;
  isBulletin: boolean;
  isNewArticle: boolean;
  channelId?: string;  // null = general channel
  timestamp: number;
}

export interface ClubGalleryItem {
  id: string;
  clubId: string;
  uploaderId: string;
  uploaderName: string;
  uploaderPhoto?: string;
  type: 'PHOTO' | 'VIDEO' | 'MUSIC' | 'ARTICLE' | 'BOOK' | 'PLAYLIST';
  url: string;
  thumbnailUrl?: string;
  title: string;
  description?: string;
  assetId?: string;
  likes: string[];
  timestamp: number;
}

export interface ClubChatMessage {
  id: string;
  clubId: string;
  senderId: string;
  senderName: string;
  senderPhoto?: string;
  content: string;
  isSticky: boolean;
  timestamp: number;
}

export interface ClubEvent {
  id: string;
  clubId: string;
  hostId: string;
  title: string;
  description?: string;
  type: 'LIVE_TALK' | 'LIVE_STREAM' | 'WATCH_PARTY';
  scheduledAt: number;
  isExclusive: boolean;
  isActive: boolean;
  attendeeIds: string[];
  timestamp: number;
}

export interface ClubStickyNote {
  id: string;
  clubId: string;
  userId: string;
  content: string;
  color: string;
  timestamp: number;
}

export interface BrandAccount {
  id: string;
  name: string;
  description: string;
  logoUrl?: string;
  coverUrl?: string;
  adminId: string;
  managers: string[];
  brandPages: string[];
  managedArtistIds: string[];
  timestamp: number;
}

export interface PPVEvent {
  id: string;
  ownerId: string;
  ownerName: string;
  title: string;
  description: string;
  thumbnailUrl: string;
  streamUrl: string;
  price: number;
  isExclusive: boolean; // Members only
  startTime: number;
  duration: number; // in minutes
  status: 'UPCOMING' | 'LIVE' | 'ENDED';
  purchasedBy?: string[]; // UIDs
  photoPoolId?: string;
}

export interface Lesson {
  id: string;
  title: string;
  description: string;
  type: 'VIDEO' | 'AUDIO' | 'TEXT';
  contentUrl?: string;
  textContent?: string;
  order: number;
}

export interface Assignment {
  id: string;
  title: string;
  description: string;
  dueDate: number;
  maxPoints: number;
}

export interface Submission {
  id: string;
  assignmentId: string;
  studentId: string;
  studentName: string;
  contentUrl?: string;
  textContent?: string;
  grade?: number;
  feedback?: string;
  timestamp: number;
}

export interface Classroom {
  id: string;
  ownerId: string;
  ownerName: string;
  title: string;
  description: string;
  thumbnailUrl: string;
  price: number; // 0 for free
  syllabus: string;
  lessons: Lesson[];
  assignments: Assignment[];
  enrolledStudents: string[]; // UIDs
  liveSessionUrl?: string;
  category: string;
  // Which track this class belongs to. Both share the same classroom infrastructure:
  //   ACADEMIC — K-12/academia, run by a verified TEACHER (standards, Learner Ledger,
  //              provisioned student accounts). CREATOR — creator-economy course (MasterClass/
  //              Skillshare/tutoring-style) run by an INSTRUCTOR; learners self-enroll. Existing
  //              classes (no track) are treated as CREATOR. See docs/education blueprint.
  track?: 'ACADEMIC' | 'CREATOR';
  gradeBand?: string; // academic only — e.g. 'g34'
}

export interface ClassroomModule {
  id: string;
  name: string;
  description: string;
  url: string; // The experience ID or route
  coverArt: string;
  createdAt: number;
  isActive: boolean;
}

export interface ProgressReport {
  id: string;
  classId: string;
  studentId: string;
  overallGrade: number;
  completedLessons: string[]; // Lesson IDs
  lastAccessed: number;
}

export interface VideoChatSession {
  id: string;
  roomId: string; // Linked to ChatRoom
  participants: { uid: string; displayName: string; photoURL: string; isMuted: boolean; isVideoOff: boolean }[];
  startTime: number;
  isActive: boolean;
}

export interface ArticleBlock {
  id: string;
  type: 'TEXT' | 'IMAGE' | 'AUDIO' | 'VIDEO' | 'QUOTE' | 'HEADING';
  content: string; // Text or URL
  layout?: 'FULL' | 'LEFT' | 'RIGHT' | 'CENTER'; // For text wrap
  caption?: string;
  assetId?: string; // Reference to backend asset
}

export interface Article {
  id: string;
  authorId: string;
  authorName: string;
  authorPhoto: string;
  title: string;
  subtitle?: string;
  coverImage?: string;
  blocks: ArticleBlock[];
  timestamp: number;
  isPublic: boolean;
  tags?: string[];
  likesCount: number;
  commentsCount: number;
  readTime?: number; // in minutes
  category?: string;
  // News/sports aggregator fields
  url?: string;
  imageUrl?: string;
  source?: string;
  content?: string;
}

export interface LiveTalk {
  id: string;
  hostId: string;
  hostName: string;
  hostPhoto: string;
  title: string;
  description: string;
  topic: string;
  category: string;
  isActive: boolean;
  speakers: Array<{ uid: string; name: string; photoURL: string; isMuted: boolean }>;
  listeners: string[]; // UIDs
  sharedAssets: SharedAsset[];
  timestamp: number;
}

export interface SharedAsset {
  id: string;
  type: 'MUSIC' | 'VIDEO' | 'ALBUM' | 'BOOK';
  title: string;
  url: string;
  sharedBy: string; // UID
  timestamp: number;
  mediaId?: string;
}

export type ExperienceMode =
  | 'RAW_DOG'
  | 'MUSIC_CREATOR'
  | 'WRITER'
  | 'SPORTS_FAN'
  | 'STORY_TELLER'
  | 'CONTENT_CREATOR'
  | 'SCIENCE_ENGINEER';

/** Maturity ceiling, lowest → highest. The safety engine hides anything above the
 *  viewer's ceiling. Child accounts default to 'PG'. */
export type MaturityRating = 'G' | 'PG' | 'PG13' | 'TEEN' | 'MATURE';

export interface ParentalControls {
  /** Hide adult / explicit / NSFW / age-restricted content. ON by default for children
   *  and not child-overridable. */
  adultFilter: boolean;
  /** Highest maturity the viewer may see. */
  maxMaturity: MaturityRating;
  /** Run the social Feed through the safety filter (hide adult-themed posts). */
  hideAdultPosts: boolean;
  /** Re-skin the whole experience as Kids Mode (friendlier theme, curated entry points,
   *  adult surfaces hidden). */
  kidsMode: boolean;
  /** Daily screen-time cap in minutes (0 / undefined = unlimited). */
  dailyTimeLimitMins?: number;
  /** Allowed hours window (24h local), e.g. { start: 7, end: 20 }. */
  allowedHours?: { start: number; end: number };
  /** Guardian passcode (hashed) to unlock a locked session or change controls. */
  guardianPasscodeHash?: string;
  /** Surfaces a child may open in Kids Mode (allow-list of AppView ids). Empty = default set. */
  allowedSurfaces?: string[];
  updatedAt?: number;
  updatedBy?: string;
}

export type AppView = 'LANDING' | 'DASHBOARD' | 'CREATOR' | 'PLAYER' | 'PREVIEW' | 'SEARCH' | 'FEED' | 'USER_PROFILE' | 'LIVE_HUB' | 'RADIO' | 'LIVE_TV' | 'GAMES' | 'CHAT' | 'GAME_PLAYER' | 'CLASSROOMS' | 'CLASSROOM_DETAIL' | 'PPV_EVENTS' | 'VIDEOS' | 'BOOKS' | 'BOOK_READER' | 'MUSIC' | 'GLOBAL_PHOTOS' | 'ART_GALLERY' | 'EVENT_PHOTO_POOL' | 'ADMIN_DASHBOARD' | 'ARTICLES' | 'ARTICLE_EDITOR' | 'ARTICLE_VIEW' | 'BRAND_DASHBOARD' | 'VIDEO_MANAGER' | 'SANCTUARY' | 'SANCTUARY_HUB' | 'STORE' | 'STORE_HUB' | 'GARAGE_SALE' | 'BUSINESS_PUBLIC' | 'BRAND_PUBLIC' | 'ADMIN_AD_DASHBOARD' | 'PARTNER_DASHBOARD' | 'HELP_CENTER' | 'MOVIE_UX' | 'CLUBS' | 'CHARITY' | 'MOVIES_TV' | 'APPS' | 'APP_DETAIL' | 'APP_PLAYER' | 'POSTMAN' | 'WORLDS' | 'WORLD_MANAGER' | 'LIVETALK_GALLERY' | 'TEAM_DETAIL' | 'PLAYER_DETAIL' | 'PRIVATE_BOARDS' | 'AVATAR_STUDIO' | 'DISCUSSION' | 'DELETE_ACCOUNT' | 'BROWSER' | 'BUSINESS_DASHBOARD' | 'PLAJAH_BUSINESS' | 'AD_PACKAGES' | 'RELLO' | 'PLAJAH_SPORTS' | 'CREATOR_PAYMENTS' | 'ARTIST_MANAGER' | 'ARTIST_BOARDS' | 'EVENT_PRODUCTION_STUDIO' | 'TICKET_DESIGNER' | 'PLAJAH_PIXELS' | 'BIBLE' | 'ATHLETE_SHOWCASE' | 'MATCH_FAN_ROOMS' | 'CLASS_POINTS' | 'KIDS_LIBRARY' | 'ROOM' | 'PODCAST_STUDIO' | 'LIVE_TRANSLATION' | 'PODCAST_CALLIN' | 'PODCAST_LISTEN' | 'ORG_HUB' | 'TELEPROMPTER' | 'PLAJAH_ELEVATE' | 'PLATFORM_CHANGELOG' | 'MEDIA_ROUTER'
  | 'EVENTS' | 'EVENT_DETAIL' | 'EVENT_CREATE' | 'EVENT_DASHBOARD' | 'MY_TICKETS' | 'EVENT_KIOSK'
  | 'EVENT_PRODUCTION' | 'EVENT_PRODUCTION_DETAIL' | 'ARTIST_SERVICES'
  // Internal pitch documents — not linked in nav. Access via ?view=pitch-music|pitch-film|pitch-writer
  | 'PITCH_MUSIC' | 'PITCH_FILM' | 'PITCH_WRITER'
  // Book Authoring Studio
  | 'BOOK_STUDIO'
  // Pitch Deck Studio
  | 'PITCH_DECK_STUDIO'
  // History Moments — Chora (music) and Taleo (film/TV)
  | 'CHORA_HISTORY' | 'TALEO_HISTORY'
  // Music Theory Studio — Chora
  | 'MUSIC_THEORY'
  // Chora Conservatory — music museum (composers/musicians) + music history
  | 'CHORA_CONSERVATORY'
  // Film School — Taleo
  | 'FILM_SCHOOL'
  // Math Classroom (BETA) — Classrooms
  | 'MATH_CLASSROOM'
  // Reading Quest (BETA) — Classrooms, Class-Points-integrated
  | 'READING_QUEST'
  // Science Quest (BETA) — NGSS cartridge on the same chassis
  | 'SCIENCE_QUEST'
  // Learner Ledger / Academic Passport — the portable record across subjects
  | 'LEARNER_LEDGER'
  // Teacher Tools — gradebook, plan-from-mastery, creative assessment
  | 'TEACHER_TOOLS'
  // Audio Book Studio — Lorea (MAI Voice 2 + MAI Transcribe 1.5)
  | 'AUDIO_BOOK_STUDIO'
  // Science & Engineering hub
  | 'PLAJAH_LABS'
  // Plajah Research Manifesto — 5-section research platform pitch
  | 'RESEARCH_MANIFESTO'
  // TV Studio — browser production switcher (Blackmagic-style)
  | 'TV_STUDIO'
  // People directory — filters SearchView to users only
  | 'PEOPLE'
  // Structured debate system
  | 'DEBATES' | 'DEBATE_DETAIL'
  // Social feature hubs
  | 'CHALLENGES' | 'BROADCAST_CHANNELS' | 'CLOSE_FRIENDS' | 'POLL_ARCHIVE'
  | 'SOCIAL_INSIGHTS' | 'SIGNATURE_MOMENTS'
  // Health & Fitness hub
  | 'HEALTH_FITNESS'
  // Script Writing Studio — film, TV, stage
  | 'SCRIPT_STUDIO'
  // Plajah Studio — Hootsuite/Buffer-class publishing & scheduling suite
  | 'PLAJAH_STUDIO'
  // FABULA — story-aware video editor (Productions / Slate / Edit)
  | 'FABULA';

// ── Script Writing Studio ─────────────────────────────────────────────────────

export type ScriptFormat =
  | 'FEATURE_FILM' | 'TV_PILOT' | 'TV_EPISODE' | 'SHORT_FILM'
  | 'WEB_SERIES' | 'STAGE_PLAY' | 'AUDIO_DRAMA';

export type ScriptElementType =
  | 'SCENE_HEADING' | 'ACTION' | 'CHARACTER' | 'DIALOGUE'
  | 'PARENTHETICAL' | 'TRANSITION' | 'SHOT' | 'SECTION' | 'NOTE';

export type RevisionColor =
  | 'WHITE' | 'BLUE' | 'PINK' | 'YELLOW' | 'GREEN' | 'GOLDENROD';

export interface ScriptElement {
  id: string;
  type: ScriptElementType;
  text: string;
  revColor?: RevisionColor;
  notes?: string;
  linkedCharId?: string;
  locked?: boolean;
}

export interface ScriptBeat {
  id: string;
  label: string;
  description: string;
  pageTarget?: number;
  sceneElementId?: string;
  actNumber: number;
  beatType: string;
  color?: string;
}

export interface ScriptTitlePage {
  title: string;
  writtenBy: string;
  basedOn?: string;
  draftDate: string;
  contact?: string;
  address?: string;
  wgaNumber?: string;
  revisionColor?: RevisionColor;
}

export interface ScriptData {
  id: string;
  format: ScriptFormat;
  genre?: string;
  logline?: string;
  synopsis?: string;
  titlePage: ScriptTitlePage;
  elements: ScriptElement[];
  beats: ScriptBeat[];
  linkedWorldId?: string;
  linkedCharacterIds?: string[];
  currentRevisionColor?: RevisionColor;
  pageCount?: number;
  ownerId?: string;
  createdAt?: number;
  updatedAt?: number;
}

export type ThemeType = 'DARK' | 'LIGHT' | 'PASTEL' | 'PLAJAH' | 'BIG_SCREEN' | 'PHONE' | 'ETHEREAL' | 'NEBULA' | 'CITRUS';

// ── Structured Debate System ──────────────────────────────────────────────────

export type DebateStatus =
  | 'PENDING'       // challenger issued, waiting for defender to accept
  | 'ACTIVE'        // both parties engaged, 24h clock running
  | 'DECLINED'      // defender declined — polite auto-message shown
  | 'ENDED'         // 24h elapsed, awaiting Aria judgment
  | 'JUDGED';       // Aria has delivered a verdict

export type DebateSide = 'CHALLENGER' | 'DEFENDER' | 'CHALLENGER_SUPPORT' | 'DEFENDER_SUPPORT';

/** A span of text the challenger marked up in the original post */
export interface DebateHighlightSegment {
  start: number;
  end: number;
  text: string;
}

export interface Debate {
  id: string;
  // Source context — for post-level debates, sourceCommentId is empty string
  sourceCommentId: string;
  sourceCommentText: string;
  sourcePostId: string;
  // Post-level debate fields
  isPostDebate?: boolean;
  sourcePostText?: string;
  highlightedSegments?: DebateHighlightSegment[];
  challengePoints?: string[];
  // Participants
  challengerId: string;
  challengerName: string;
  challengerPhoto: string;
  defenderId: string;
  defenderName: string;
  defenderPhoto: string;
  // Topic
  topic: string;                // resolved from comment text
  // Timing
  createdAt: number;
  acceptedAt?: number;
  endsAt: number;               // acceptedAt + 24h
  // Engagement
  challengerSupporters: string[];   // uids who side with challenger
  defenderSupporters: string[];     // uids who side with defender
  postCount: number;
  viewCount: number;
  // Moderation
  disqualified: { uid: string; name: string; reason: string; at: number }[];
  // Verdict
  verdict?: DebateVerdict;
  // Display
  heroImageUrl?: string;
  status: DebateStatus;
  // Highlights shown in gallery
  highlightQuote?: string;
  highlightSide?: DebateSide;
}

export interface DebatePost {
  id: string;
  debateId: string;
  authorId: string;
  authorName: string;
  authorPhoto: string;
  side: DebateSide;
  text: string;
  mediaUrl?: string;
  mediaType?: 'PHOTO' | 'VIDEO' | 'AUDIO';
  dataVizPresetId?: string;
  timestamp: number;
  isDisqualified: boolean;
  disqualifyReason?: string;
  flaggedForReview: boolean;
  reactions: Record<string, string[]>;   // emoji → [uid]
  replyToId?: string;
}

export interface DebateVerdict {
  winner: 'CHALLENGER' | 'DEFENDER' | 'DRAW';
  winnerUid?: string;
  winnerName?: string;
  challengerScore: number;      // 0–100
  defenderScore: number;        // 0–100
  consensusScore: number;       // % of observers who agreed with winner
  publicVoteChallenger: number; // % of supporters who sided with challenger
  publicVoteDefender: number;
  summary: string;              // Aria's narrative overview
  factCheck: string;            // what each side got right/wrong
  ignoredFacts: string;         // important facts both parties missed
  debateQuality: 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR';
  disqualificationNotes?: string;
  academicScore: {
    logic: number;          // 0–10
    evidence: number;
    civility: number;
    clarity: number;
  };
  generatedAt: number;
}

// ── Dynamic Social Feature Types ──────────────────────────────────────────────

export interface Challenge {
  id: string;
  title: string;
  description: string;
  prompt: string;           // what creators should do
  category: 'MUSIC' | 'VIDEO' | 'ART' | 'WRITING' | 'PHOTO' | 'ANY';
  hashtag: string;          // e.g. #PlajahChallenge
  createdAt: number;
  endsAt: number;
  createdBy: string;        // uid — 'PLAJAH_SYSTEM' for platform challenges
  coverImage?: string;
  prize?: string;           // e.g. "Feature on homepage"
  entryCount: number;
  isActive: boolean;
}

export interface ChallengeEntry {
  id: string;
  challengeId: string;
  authorId: string;
  authorName: string;
  authorPhoto: string;
  postId?: string;
  mediaUrl?: string;
  caption: string;
  votes: number;
  votedBy: string[];        // uids
  submittedAt: number;
}

export interface BroadcastChannel {
  id: string;
  ownerId: string;
  ownerName: string;
  ownerPhoto: string;
  name: string;
  description?: string;
  coverImage?: string;
  subscriberCount: number;
  createdAt: number;
  lastPostAt?: number;
  isVerified?: boolean;
}

export interface BroadcastMessage {
  id: string;
  channelId: string;
  text: string;
  mediaUrl?: string;
  mediaType?: 'PHOTO' | 'VIDEO' | 'AUDIO';
  pollData?: { question: string; options: string[]; votes: Record<string, string[]> };
  timestamp: number;
  reactions: Record<string, string[]>; // emoji → [uid]
  pinned?: boolean;
}

export interface CloseFriend {
  uid: string;
  displayName: string;
  photoURL: string;
  addedAt: number;
  mutualScore?: number;     // interaction strength
}

export interface SignatureMoment {
  id: string;
  contentId: string;        // track/video/article ID
  contentType: 'TRACK' | 'VIDEO' | 'ARTICLE';
  contentTitle: string;
  timestampSec?: number;    // playback position in seconds (for audio/video)
  authorId: string;
  authorName: string;
  authorPhoto: string;
  note: string;             // why it matters
  likes: string[];          // uids
  createdAt: number;
}

export interface UserMoodStatus {
  emoji: string;
  label: string;
  updatedAt: number;
  expiresAt?: number;       // optional auto-clear
}

export interface TimedRevealSettings {
  revealAt: number;         // ms timestamp
  teaser?: string;          // shown before reveal
  isRevealed?: boolean;
}

export interface ThreadPost {
  id: string;
  parentId?: string;        // null for root; set for replies
  rootId: string;           // always the first post in the thread
  threadIndex: number;      // 0 = root, 1 = first reply, etc.
  authorId: string;
  authorName: string;
  authorPhoto: string;
  text: string;
  media?: { type: string; url: string }[];
  timestamp: number;
  likes: string[];
  replyCount: number;
}

// ── Do You Know (Aria feature discovery) ─────────────────────────────────────

export type DoYouKnowCategory =
  | 'UPLOAD' | 'SOCIAL' | 'MONETIZE' | 'AI' | 'LIVE' | 'COMMUNITY' | 'ANALYTICS' | 'CREATOR';

export interface DoYouKnowTip {
  id: string;
  category: DoYouKnowCategory;
  emoji: string;
  headline: string;
  body: string;
  cta: string;                // button label
  ctaView?: string;           // AppView to navigate to on CTA
  ariaPrompt: string;         // what to ask Aria when user wants more help
  requiredFeature?: string;   // optional — only show if user has not used this feature
  priority: number;           // higher = shown first
}

// ── Poll archive ──────────────────────────────────────────────────────────────

export interface PollArchiveEntry {
  id: string;
  postId: string;
  question: string;
  options: string[];
  votes: Record<string, string[]>; // optionIndex → [uid]
  totalVoters: number;
  createdAt: number;
  closedAt: number;
  winningOption?: string;
}

// ── Now Listening presence ────────────────────────────────────────────────────

export interface NowListeningPresence {
  uid: string;
  displayName: string;
  photoURL: string;
  trackId: string;
  trackTitle: string;
  artist: string;
  albumCover?: string;
  startedAt: number;         // timestamp when they started
  albumId?: string;
  isPublic: boolean;
}

export type AvatarStyle = 'ANIME' | 'CHIBI' | 'REALISTIC' | 'URBAN' | 'STREETWEAR' | 'CLAY';

export interface AvatarConfig {
  type: 'RPM' | 'VRM' | 'NONE';
  style: AvatarStyle;
  modelUrl?: string;
  rpmGlbUrl?: string;
  rpmAvatarId?: string;
  thumbnailUrl?: string;
  isActive: boolean;
  skinTone?: string;
  hairColor?: string;
  accessories?: string[]; // wardrobe item IDs equipped by the user
}

export interface ProfileThemePreset {
  id: string;
  creatorId: string;
  title: string;
  description: string;
  mode: 'PHOTO_ONLY' | 'VIDEO_ONLY' | 'MIX';
  assets: { id: string; url: string; type: 'PHOTO' | 'VIDEO' }[];
  coverImage?: string;
  isPublic: boolean;
  downloads?: number;
  timestamp: number;
}

export interface AppNotification {
  id: string;
  userId: string;
  senderId: string;
  senderName: string;
  senderPhoto: string;
  type: 'MESSAGE' | 'COMMENT' | 'CONTENT' | 'SYSTEM' | 'LIKE' | 'FOLLOW';
  title: string;
  message: string;
  link?: string;
  targetId?: string;
  isRead: boolean;
  timestamp: number;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  senderPhoto: string;
  text?: string;
  voiceUrl?: string;
  imageUrl?: string;
  gifUrl?: string;
  mediaId?: string;
  mediaType?: 'ALBUM' | 'TRACK' | 'VIDEO';
  timestamp: number;
  type: 'TEXT' | 'VOICE' | 'SYSTEM' | 'MEDIA' | 'ACTION' | 'IMAGE' | 'VIDEO_NOTE';
  videoNoteUrl?: string;
  burnAfterSeen?: boolean;
  burnAfter?: number;
  metadata?: {
    action?: string;
    time?: number;
    url?: string;
  };
  seenBy?: string[]; // Array of UIDs who have seen this message
  pageTag?: string; // Page the sender was visiting when they posted
}

export interface ChatRoom {
  id: string;
  participants: string[]; // UIDs
  lastMessage?: string;
  updatedAt: number;
  type: 'PRIVATE' | 'GROUP' | 'PUBLIC_LIVE';
  name?: string; // For groups/public
  ownerId?: string; // For groups/public
  isPublic?: boolean;
  typingUsers?: string[]; // Array of UIDs currently typing
  // Song live chat metadata (populated for live_chat_* rooms)
  coverUrl?: string;
  mediaId?: string;
  mediaTitle?: string;
  mediaArtist?: string;
}

export interface CollabProject {
  id: string;
  name: string;
  chatRoomId: string;
  whiteboardData?: string; // JSON string of Konva/Fabric state
  assets: { id: string; name: string; url: string; type: string }[];
  links: { title: string; url: string }[];
  updatedAt: number;
  ownerId: string;
}

export interface CallSession {
  id: string;
  callerId: string;
  receiverId: string;
  type: 'AUDIO' | 'VIDEO';
  status: 'RINGING' | 'CONNECTED' | 'ENDED' | 'MISSED';
  offer?: string; // WebRTC offer
  answer?: string; // WebRTC answer
  iceCandidates?: string[];
  timestamp: number;
  /** The chat room the call belongs to — the callee joins this rtc session on answer. */
  roomId?: string;
  roomName?: string;
  callerName?: string;
  callerPhoto?: string;
}

export interface PayItForwardPool {
  status: 'ACTIVE' | 'PASSED';
  lastWinnerId: string;
  lastWinTimestamp: number;
  totalGivenOutMonth: number;
  totalGivenOutYear: number;
  resetMonthTimestamp: number;
  resetYearTimestamp: number;
}

export interface PayItForwardVault {
  currentPot: number;
}

export interface PayItForwardWinner {
  id?: string;
  uid: string;
  amount: number;
  timestamp: number;
  status: 'PENDING' | 'CLAIMED' | 'PASSED';
}

export interface PayItForwardDonation {
  id?: string;
  amount: number;
  donorId: string;
  timestamp: number;
}

export interface RSSFeed {
  id: string;
  url: string;
  title: string;
  ownerId: string;
  timestamp: number;
}

export interface PodcastSeries {
  id: string;
  title: string;
  description: string;
  coverImage?: string;
  creatorId: string;
  rssUrl?: string;
  episodeIds: string[]; // Refs to Video or Track
  timestamp: number;
}

export interface PodcastMetadata {
  episodeNumber: number;
  seasonNumber?: number;
  isExplicit?: boolean;
  showTitle: string;
  category?: string;
}

export interface ImportedRssEpisode {
  id: string;
  title: string;
  description?: string;
  audioUrl: string;
  imageUrl?: string;
  duration?: string;
  pubDate?: number;
  episodeNumber?: number;
  season?: number;
  isExplicit?: boolean;
  showTitle?: string;
  importedAt: number;
}

export interface PodcastRssSettings {
  externalFeedUrl?: string;
  feedTitle?: string;
  feedDescription?: string;
  feedImageUrl?: string;
  syncEnabled: boolean;
  lastSynced?: number;
  importedEpisodeCount?: number;
  isExplicit?: boolean;
  language?: string;
  category?: string;
}

export interface AdMarker {
  id: string;
  time: number;
  label?: string;
}

export interface AdCampaign {
  id: string;
  ownerId: string;
  title: string;
  name?: string; // Alias for title
  type: 'USER_PROMOTION' | 'PARTNER' | 'THIRD_PARTY';
  targetType: 'POST' | 'ALBUM' | 'PROFILE' | 'EXTERNAL';
  targetId?: string;
  externalUrl?: string;
  imageUrl: string;
  budget: number;
  frequency: number; // times per hour/day
  probability: number; // 0-1 weight
  isActive: boolean;
  status?: 'ACTIVE' | 'PAUSED' | 'COMPLETED';
  targetInterests?: string[];
  timestamp: number;
}

export interface PartnerConfig {
  cloudProvider: 'AWS' | 'GCP' | 'AZURE' | 'ONEDRIVE';
  provider?: string; // Alias for cloudProvider
  bucketName: string;
  region?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  endpoint?: string;
  externalEndpoint?: string;
  importStatus: 'IDLE' | 'SYNCING' | 'COMPLETED';
}

export interface UserAlias {
  id: string;
  email: string;
  provider: string;
  isVerified: boolean;
}

/** A saved account slot for hot-switching between up to 4 Firebase accounts. */
export interface LinkedAccount {
  slot: 1 | 2 | 3 | 4;
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  provider: string;
  lastUsed?: number;
}

export interface AdRatioConfig {
  userPromos: number; // e.g. 33
  partners: number;   // e.g. 33
  thirdParty: number; // e.g. 34
}

export interface StationIDStinger {
  id: string;
  name: string;
  url: string;
  duration: number;
}

export interface AutoFastChannelConfig {
  rulesEnabled: boolean;
  adInterval: number; // every N videos
  maxAdDuration: number; // seconds
}

export interface PlayerStats {
  id: string;
  name: string;
  position: string;
  number: string;
  photoUrl: string;
  stats: { [key: string]: string | number };
  recentNews?: any[];
}

export interface Team {
  id: string;
  name: string;
  location: string;
  abbreviation: string;
  logo: string;
  league: string;
  color?: string;
  roster: PlayerStats[];
  recentResults: any[];
  highlights: any[];
}

// ── LANDING PAGE BACKGROUND ───────────────────────────────────────────────────
export type LandingBgMode = 'EARTH' | 'PHOTO' | 'VIDEO' | 'SLIDESHOW';

export interface LandingBgAsset {
  id: string;
  type: 'photo' | 'video';
  url: string;
  thumbnailUrl?: string;
  name: string;
  size?: number;
  uploadedAt: number;
  isSelected: boolean; // pinned for PHOTO/VIDEO single-mode, included in slideshow
}

export interface LandingBgConfig {
  mode: LandingBgMode;
  slideshowIntervalMs: number; // default 5000
  overlayOpacity: number;      // 0–100, default 40
  assets: LandingBgAsset[];
}

export interface SportsHeroAsset {
  id: string;
  type: 'photo' | 'video';
  url: string;
  name: string;
  leagueId?: string;
  title?: string;
  subtitle?: string;
  uploadedAt: number;
  isSelected: boolean;
}

export interface SportsHeroConfig {
  assets: SportsHeroAsset[];
}

export interface SystemSettingsConfig {
  id: string;
  adRatios: AdRatioConfig;
  isLiveStreamAdsEnabledDefault: boolean;
  fastChannelAds: AutoFastChannelConfig;
  radioAdInterval: number; // every N songs
  stingers: StationIDStinger[];
  globalFreeStorageLimit: number;
  curatedMusicPlaylists?: string[]; // IDs of Playlists
  curatedVideoPlaylists?: string[]; // IDs of Video Playlists
  mustWatchMovies?: string[];       // IDs of Videos (Movies)
  landingBg?: LandingBgConfig;
  externalSocialLinks: {
    xEnabled: boolean;
    mastodonEnabled: boolean;
    blueskyEnabled: boolean;
    threadsEnabled: boolean;
  };
  updatedAt: number;
}

// ── ACHIEVEMENTS & GAMIFICATION ──────────────────────────────────────────────

export type AchievementCategory = 'USER' | 'ARTIST' | 'ORGANIZATION';
export type AchievementTriggerType =
  | 'FIRST_PLAY' | 'FIRST_ALBUM_LISTEN' | 'FIRST_SONG' | 'FIRST_MOVIE_COMPLETED'
  | 'FIRST_TV_COMPLETED' | 'FIRST_VIDEO_COMPLETED' | 'FIRST_GIFT' | 'FIRST_DONATION'
  | 'FIRST_ENGAGEMENT' | 'FIRST_UPLOAD' | 'FIRST_LISTENER' | 'FIRST_FAN'
  | 'FIRST_SIGN_IN' | 'FIRST_FOLLOW' | 'WATCH_LIVE' | 'POST_COMMENT'
  | 'FIRST_LIVE_STREAM'
  | 'HNS_DISCOVER_FIRST' | 'HNS_BOTH_SLOTS' | 'HNS_ARTIST_10' | 'HNS_ARTIST_50'
  | 'THEME_FIRST_ADD' | 'THEME_RECEIVED' | 'USE_FEELING_LUCKY'
  | 'CUSTOM' | 'MANUAL';

export interface AchievementUnlockRequirement {
  type: 'METRIC' | 'ACTION' | 'CUSTOM';
  metric?: string; // e.g., 'listener_count', 'song_plays', 'followers'
  targetValue?: number;
  actionTrigger?: AchievementTriggerType;
  customCondition?: string; // For admin-defined complex logic
}

export interface AchievementReward {
  pointsBonus: number;
  platformBoost?: {
    type: 'FEATURED' | 'PROMOTED' | 'VISIBILITY_BOOST';
    durationMs: number;
  };
  unlocksFeatures?: string[]; // Feature IDs that unlock
  unlocksContent?: string[]; // Content IDs that unlock
  unlocksTheme?: string; // Theme ID
}

export interface AchievementAnimation {
  animationUrl?: string; // Custom animation file/URL
  soundEffectUrl?: string; // Custom sound effect
  animationType?: 'BOUNCE' | 'SLIDE' | 'FADE' | 'ROTATE' | 'SCALE'; // Default types
  soundType?: 'CHIME' | 'BELL' | 'FANFARE' | 'SPARKLE'; // Default sounds
}

export interface Achievement {
  id: string;
  title: string;
  description: string;
  category: AchievementCategory;
  triggerType: AchievementTriggerType;
  icon: string;
  backgroundColor?: string;
  pointsValue: number;
  points?: number; // legacy alias for pointsValue
  type?: string;   // legacy category label
  requirements: AchievementUnlockRequirement;
  rewards?: AchievementReward;
  animation?: AchievementAnimation;
  createdBy: 'SYSTEM' | 'ADMIN' | 'CREATOR';
  creatorId?: string;
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
  // Linking fields
  albumId?: string; // For album-specific achievements
  fandomId?: string; // For fan-fandom-specific achievements
}

export interface UserAchievementProgress {
  id: string;
  userId: string;
  achievementId: string;
  achievement?: Achievement; // Denormalized for convenience
  unlockedAt?: number;
  progressValue?: number; // For % completion tracking
  isNew?: boolean; // UI flag for notification
  viewedAt?: number; // When user last saw this achievement
  timestamp: number;
}

// ── POINTS SYSTEM ────────────────────────────────────────────────────────────

export interface PointsTransaction {
  id: string;
  userId: string;
  amount: number;
  type: 'ACHIEVEMENT_UNLOCK' | 'DAILY_ACTIVITY' | 'SHARE' | 'LOGIN' | 'REWARD' | 'MANUAL' | 'REDEMPTION';
  source?: string; // e.g., achievement ID, activity type
  description?: string;
  timestamp: number;
  relatedEntityId?: string; // e.g., achievementId, eventId
}

export interface UserPointsBalance {
  id: string;
  userId: string;
  totalPoints: number;
  availablePlajahBucks: number;
  lifetime: number;
  lastEarnedAt?: number;
  timestamp?: number; // legacy alias for lastEarnedAt
  lastRedeemedAt?: number;
  pointsHistory?: PointsTransaction[];
}

// ── BADGE SYSTEM ────────────────────────────────────────────────────────────

export type BadgeType = 'PIONEER' | 'PIONEER_ELITE' | 'ARTIST' | 'CUSTOM';

export interface Badge {
  id: string;
  type: BadgeType;
  title: string;
  description: string;
  icon: string;
  backgroundColor?: string;
  displayPriority: number; // Lower = higher priority on display
  criteria: {
    maxUsersEligible?: number; // e.g., 100 for Pioneer
    createdBeforeDateMs?: number; // Account creation date threshold
    requiresAccountType?: 'ARTIST' | 'FAN' | 'BRAND' | 'ORGANIZATION';
    customCondition?: string;
  };
  isActive: boolean;
  createdAt: number;
}

export interface UserBadge {
  id: string;
  userId: string;
  badgeId: string;
  badge?: Badge; // Denormalized for convenience
  earnedAt: number;
  badgeType: BadgeType;
}

// ── DISCUSSION (Reddit-style forum) ──────────────────────────────────────────

export interface DiscussionBoard {
  id: string;
  name: string;
  slug: string;
  description: string;
  coverImage?: string;
  icon?: string;
  creatorId: string;
  memberCount: number;
  postCount: number;
  isNSFW: boolean;
  tags: string[];
  timestamp: number;
}

export interface DiscussionPost {
  id: string;
  boardId: string;
  boardName: string;
  authorId: string;
  aliasId?: string;
  displayName: string;
  displayPhoto?: string;
  isAnonymous: boolean;
  title: string;
  body: string;
  imageUrls?: string[];
  linkUrl?: string;
  upvotes: number;
  downvotes: number;
  commentCount: number;
  timestamp: number;
  isPinned?: boolean;
  flair?: string;
  reportedBy?: string[];  // UIDs who reported this post
  isRemoved?: boolean;
  removedReason?: string;
}

export interface DiscussionComment {
  id: string;
  postId: string;
  parentCommentId?: string;
  authorId: string;
  aliasId?: string;
  displayName: string;
  displayPhoto?: string;
  isAnonymous: boolean;
  body: string;
  upvotes: number;
  downvotes: number;
  replyCount: number;
  timestamp: number;
  depth: number;
  reportedBy?: string[];
  isRemoved?: boolean;
}

export interface DiscussionAlias {
  id: string;
  userId: string;
  name: string;
  avatar?: string;
  bio?: string;
  timestamp: number;
}

export interface DiscussionVote {
  id: string;
  userId: string;
  targetId: string;
  targetType: 'POST' | 'COMMENT';
  value: 1 | -1;
  timestamp: number;
}

// ── EXTENDED USER TYPE ADDITIONS ─────────────────────────────────────────────
// These fields should be added to the User interface:
//
// achievementIds?: string[]; // References to UserAchievementProgress docs
// pointsBalanceId?: string; // Reference to UserPointsBalance doc
// badgeIds?: string[]; // References to UserBadge docs
// pointsDisplayName?: 'POINTS' | 'PLAJAH_BUCKS' | 'BOTH'; // User preference
// gamificationOptOut?: boolean; // User can disable gamification notifications
// unlockedFeatures?: string[]; // Feature IDs unlocked via achievements

// ── FAST CHANNEL TYPES ────────────────────────────────────────────────────────

export type FastChannelSlotType = 'VIDEO' | 'BUMPER' | 'AD_BREAK' | 'LIVE_INTERRUPT' | 'PUBLIC_DOMAIN';

export interface FastChannelSlot {
  id: string;
  type: FastChannelSlotType;
  order: number;
  // VIDEO / PUBLIC_DOMAIN
  videoId?: string;
  videoUrl?: string;
  videoTitle?: string;
  videoThumbnail?: string;
  videoDurationSeconds?: number;
  // BUMPER
  bumperId?: string;
  bumperUrl?: string;
  bumperTitle?: string;
  bumperDurationSeconds?: number;
  // AD_BREAK
  adDurationSeconds?: number; // 30–180
  // LIVE_INTERRUPT — when to break to live and how long to stay
  liveInterruptAt?: number; // unix ms
  liveInterruptMaxDurationSeconds?: number;
  // per-slot overrides
  adMarkersSeconds?: number[]; // timestamps within this video to insert mid-roll ads
  adFrequencyOverrideMinutes?: number;
  // source
  sourceUserId?: string; // who owns this asset (for shared/granted content)
  isPublicDomain?: boolean;
}

export interface FastChannelSchedule {
  userId: string;
  slots: FastChannelSlot[];
  // Global channel defaults
  adFrequencyMinutes: number; // insert an ad break every N minutes
  adDurationSeconds: number; // 30–180
  loopSchedule: boolean;
  autoGenerated: boolean;
  includePublicDomain: boolean;
  // Pending live interrupt
  pendingLiveInterrupt?: {
    scheduledAt: number; // unix ms
    maxDurationSeconds: number;
  };
  lastUpdated: number;
}

export interface ChannelBumper {
  id: string;
  userId: string;
  title: string;
  url: string;
  thumbnailUrl?: string;
  type: 'INTRO' | 'OUTRO' | 'STATION_ID' | 'TRANSITION';
  durationSeconds: number;
  timestamp: number;
}

/** Grants a user (or the platform library) access to another creator's FAST channel assets */
export interface FastChannelAssetGrant {
  id: string;
  fromUserId: string;
  fromUserName: string;
  fromUserPhoto?: string;
  /** Target user UID, or '*' to add to the platform global library */
  toUserId: string;
  /** Specific video IDs; empty array means entire FAST channel library */
  assetIds: string[];
  entireLibrary: boolean;
  /** Whether this is a paid placement or free */
  isPaid: boolean;
  pricePerMonth?: number;
  isActive: boolean;
  timestamp: number;
}

/** An entry in the platform-wide FAST channel content library */
export interface FastChannelLibraryEntry {
  id: string;
  videoId: string;
  videoTitle: string;
  videoUrl: string;
  thumbnailUrl?: string;
  durationSeconds?: number;
  genre?: string;
  tags?: string[];
  ownerUserId: string;
  ownerName: string;
  isPublicDomain: boolean;
  isPaid: boolean;
  pricePerMonth?: number;
  timestamp: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PLAJAH+ SUBSCRIPTIONS, BUSINESS, ADS, AND PLATFORM ECONOMY
// ═══════════════════════════════════════════════════════════════════════════════

export type SubscriptionTier = 1 | 2 | 3;

export interface PlajahPlusSubscription {
  id: string;
  subscriberId: string;
  stripeSubscriptionId: string;
  stripeCustomerId: string;
  tier: SubscriptionTier;
  status: 'active' | 'canceled' | 'past_due' | 'trialing' | 'incomplete';
  isMorph: boolean;
  boundCreatorId?: string;
  morphCreatorIds?: string[];
  morphMode?: 'SPLIT' | 'RANDOM';
  currentPeriodEnd: number;
  cancelAtPeriodEnd: boolean;
  storageLimitGb: number;
  monthlyPoints: number;
  createdAt: number;
  updatedAt: number;
}

export interface CreatorSplitEntry {
  targetId: string;
  targetType: 'USER' | 'CHARITY' | 'CLUB';
  targetName: string;
  percentage: number;
}

export interface CreatorSplit {
  creatorId: string;
  splits: CreatorSplitEntry[];
  updatedAt: number;
}

export interface BusinessMenuItem {
  id: string;
  name: string;
  description?: string;
  price: number;
  category: string;
  imageUrl?: string;
  isFeatured?: boolean;
  isAvailable?: boolean;
  tags?: string[];
}

export interface BusinessEvent {
  id: string;
  title: string;
  description?: string;
  date: string;
  time?: string;
  imageUrl?: string;
  isFree?: boolean;
  price?: number;
  ticketUrl?: string;
}

export interface BusinessPage {
  id: string;
  ownerId: string;
  businessName: string;
  businessType: 'RETAIL' | 'RESTAURANT' | 'SERVICE' | 'ENTERTAINMENT' | 'TECH' | 'HEALTH' | 'OTHER' | string;
  tagline?: string;
  description: string;
  logoUrl?: string;
  coverUrl?: string;
  coverImageUrl?: string;
  address?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  phone?: string;
  email?: string;
  website?: string;
  socialLinks?: {
    instagram?: string;
    twitter?: string;
    facebook?: string;
    tiktok?: string;
    youtube?: string;
  };
  hours?: {
    [day: string]: { open: string; close: string; closed?: boolean };
  };
  amenities?: string[];
  priceRange?: '$' | '$$' | '$$$' | '$$$$';
  isPublic?: boolean;
  isVerified: boolean;
  plajahUserDiscountPct?: number;
  discount?: number;
  rating?: number;
  reviewCount?: number;
  stripeAccountId?: string;
  isAcceptingOrders: boolean;
  radioServiceEnabled: boolean;
  digitalSignageEnabled: boolean;
  crmEnabled: boolean;
  rewardsEnabled: boolean;
  rewardPointsPerDollar?: number;
  seedRaiserId?: string;
  tags?: string[];
  menuItems?: BusinessMenuItem[];
  galleryImages?: string[];
  events?: BusinessEvent[];
  promoBanner?: string;
  isDemo?: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface BusinessOrder {
  id: string;
  businessId: string;
  customerId: string;
  customerName: string;
  customerPhotoURL?: string;
  items: { name: string; price: number; quantity: number; notes?: string }[];
  subtotal: number;
  discount: number;
  total: number;
  status: 'PENDING' | 'CONFIRMED' | 'PROCESSING' | 'READY' | 'COMPLETED' | 'CANCELLED';
  notes?: string;
  createdAt: number;
  updatedAt: number;
}

export interface BusinessReward {
  id: string;
  businessId: string;
  customerId: string;
  points: number;
  lifetimePoints: number;
  createdAt: number;
  updatedAt: number;
}

export interface DigitalSignageSlide {
  id: string;
  businessId: string;
  type: 'IMAGE' | 'VIDEO' | 'TEXT' | 'PROMO';
  url?: string;
  headline?: string;
  subtext?: string;
  backgroundColor?: string;
  durationSeconds: number;
  isActive: boolean;
  order: number;
}

export interface SeedRaiserCampaign {
  id: string;
  creatorId: string;
  creatorName: string;
  creatorPhoto?: string;
  title: string;
  description: string;
  category: 'MUSIC' | 'VIDEO' | 'ART' | 'TECH' | 'COMMUNITY' | 'BUSINESS' | 'OTHER';
  goalAmount: number;
  currentAmount: number;
  backerCount: number;
  endDate: number;
  rewards: SeedRaiserReward[];
  status: 'DRAFT' | 'ACTIVE' | 'FUNDED' | 'FAILED' | 'CANCELLED';
  coverUrl?: string;
  videoUrl?: string;
  updates: { id: string; title: string; text: string; timestamp: number }[];
  stripeConnectAccountId?: string;
  platformFeePct: number;
  createdAt: number;
}

export interface SeedRaiserReward {
  id: string;
  title: string;
  minPledge: number;
  description: string;
  limitedCount?: number;
  claimedCount: number;
  estimatedDelivery?: string;
  includes?: string[];
}

export interface SeedRaiserPledge {
  id: string;
  campaignId: string;
  backerId: string;
  backerName: string;
  backerPhoto?: string;
  amount: number;
  rewardId?: string;
  stripePaymentIntentId: string;
  status: 'PENDING' | 'COMPLETED' | 'REFUNDED';
  isAnonymous: boolean;
  message?: string;
  createdAt: number;
}

export type AdPackageType = 'BASIC' | 'FEATURED' | 'PREMIUM' | 'MAXIMUM';

export interface AdPackage {
  id: string;
  userId: string;
  packageType: AdPackageType;
  price: number;
  durationDays: number;
  boostMultiplier: number;
  contentId?: string;
  contentType?: string;
  stripePaymentIntentId: string;
  isActive: boolean;
  expiresAt: number;
  createdAt: number;
}

export type OffPlatformTier = 'STANDARD' | 'PREMIUM';

export interface OffPlatformPromotion {
  id: string;
  userId: string;
  tier: OffPlatformTier;
  price: number;
  stripeSubscriptionId: string;
  currentPeriodEnd: number;
  status: 'active' | 'canceled' | 'past_due';
  createdAt: number;
}

export interface AdBoostProfile {
  userId: string;
  subscriptionTierBoost: number;
  achievementBoostMultiplier: number;
  achievementBoostExpiresAt?: number;
  activeAdPackageBoost: number;
  activityScore: number;
  totalBoostScore: number;
  lastUpdated: number;
}

export interface AdSlotAllocation {
  userId: string;
  displayName: string;
  photoURL: string;
  contentId?: string;
  contentType?: string;
  boostScore: number;
  slotType: 'USER_PROMO' | 'CONTENT_PARTNER' | 'THIRD_PARTY';
  impressionWeight: number;
}

export interface CrmContact {
  id: string;
  businessId: string;
  userId?: string;
  name: string;
  email?: string;
  phone?: string;
  tags: string[];
  notes: string;
  rewardPoints: number;
  totalSpend: number;
  visitCount: number;
  lastVisit?: number;
  createdAt: number;
}

// ── SANCTUARY (TIERED FAN MEMBERSHIP) ────────────────────────────────────────

export interface SanctuaryTier {
  id: string;
  creatorId: string;
  name: string;
  description: string;
  price: number;          // monthly USD
  annualPrice?: number;   // annual discount option
  color: string;          // accent color for tier card
  iconEmoji: string;
  benefits: string[];
  exclusiveContentIds?: string[];  // Content IDs unlocked at this tier
  hasPrivateChat: boolean;
  hasMemberBadge: boolean;
  memberCount: number;
  isActive: boolean;
  sortOrder: number;
  createdAt: number;
}

export interface SanctuaryMembership {
  id: string;
  tierId: string;
  tierName: string;
  tierColor: string;
  creatorId: string;
  memberId: string;
  memberName: string;
  memberPhoto?: string;
  billingCycle: 'MONTHLY' | 'ANNUAL';
  status: 'ACTIVE' | 'PAUSED' | 'CANCELLED' | 'PENDING';
  startedAt: number;
  renewsAt: number;
  cancelledAt?: number;
  stripeSubscriptionId?: string;
}

// Everything a creator can lock inside a Sanctuary. Far beyond the original
// media types — secret playlists, remixes, whole films, deleted scenes, BTS,
// games, papers, private conversations, collaborations and live streams.
export type SanctuaryContentKind =
  | 'VIDEO' | 'AUDIO' | 'POST' | 'ARTICLE' | 'LIVE' | 'DOWNLOAD'
  | 'PLAYLIST' | 'REMIX' | 'BOOK' | 'FILM' | 'DELETED_SCENE' | 'BTS'
  | 'GAME' | 'WHITEPAPER' | 'RESEARCH' | 'CONVERSATION' | 'COLLAB' | 'LIVESTREAM';

// How a member gains access to a single item, independent of the sanctuary's
// overall model — this is what makes content (and chats) à la carte.
export type SanctuaryAccessType =
  | 'FREE'      // open to anyone (a public teaser / lead magnet)
  | 'TIER'      // unlocked by membership in one of requiredTierIds
  | 'ONE_TIME'; // buy this single item once (à la carte), no membership needed

export interface SanctuaryExclusiveContent {
  id: string;
  creatorId: string;
  sanctuaryId?: string;       // owner id (== creatorId); explicit for querying
  title: string;
  description?: string;
  type: SanctuaryContentKind;
  contentUrl?: string;
  thumbnailUrl?: string;
  previewUrl?: string;        // free teaser (clip / excerpt) shown before unlock
  mediaAssetId?: string;      // link to an existing album / film / book / playlist
  accessType?: SanctuaryAccessType;  // default 'TIER'
  requiredTierIds: string[];  // for TIER: member of at least one of these tiers
  oneTimePrice?: number;      // for ONE_TIME: à la carte unlock price (USD)
  isPublicPreview: boolean;
  publishedAt: number;
  likesCount: number;
  commentsCount: number;
}

export interface SanctuaryCreatorConfig {
  isEnabled: boolean;
  tiers: SanctuaryTier[];
  welcomeMessage?: string;
  coverImageUrl?: string;
  totalMembers: number;
  monthlyRevenue: number;
}

// ── SANCTUARY (Patreon / Kickstarter / GoFundMe hybrid) ─────────────────────────
// A Sanctuary is a first-class, distinct-from-a-Club space any account can run —
// a user OR an organization. One per account by default (doc id == ownerId), it
// carries identity, an access model, an optional crowdfunding campaign, and its
// own gated feed. Tiers / memberships / exclusive content remain keyed by the
// owner (creatorId == ownerId).

export type SanctuaryVisibility = 'PUBLIC' | 'PRIVATE'; // PRIVATE = hidden, invite/member only
export type SanctuaryAccessModel = 'FREE' | 'PAID' | 'MIXED'; // the sanctuary's overall posture
export type SanctuaryOwnerType = 'USER' | 'ORG';

export interface SanctuaryCampaign {
  isActive: boolean;
  title: string;
  story?: string;
  goalAmount: number;      // Kickstarter/GoFundMe target (USD)
  raisedAmount: number;
  backerCount: number;
  deadline?: number;       // optional funding deadline (ms)
  allOrNothing?: boolean;  // Kickstarter-style vs GoFundMe keep-what-you-raise
}

export interface Sanctuary {
  id: string;              // == ownerId (uid or orgId)
  ownerId: string;
  ownerType: SanctuaryOwnerType;
  ownerName: string;
  ownerPhoto?: string;
  name: string;            // the sanctuary's own name ("The Vault", "Backstage"…)
  handle?: string;         // unique @handle
  tagline?: string;
  about?: string;
  bannerUrl?: string;
  avatarUrl?: string;
  accentColor?: string;    // creator accent (layered over the sanctuary skin)
  visibility: SanctuaryVisibility;
  accessModel: SanctuaryAccessModel;
  welcomeMessage?: string;
  campaign?: SanctuaryCampaign;
  memberCount: number;
  contentCount?: number;
  isEnabled: boolean;
  createdAt: number;
  updatedAt: number;
}

// The gated social feed inside a Sanctuary. Public-preview posts are visible to
// anyone (teasers); member/tier/one-time posts require access.
export interface SanctuaryPost {
  id: string;
  sanctuaryId: string;     // owner id
  authorId: string;
  authorName: string;
  authorPhoto?: string;
  content: string;
  attachments?: Array<{ type: string; url: string; title?: string; thumbnailUrl?: string; assetId?: string }>;
  accessType: SanctuaryAccessType;   // FREE teaser vs TIER vs ONE_TIME
  requiredTierIds?: string[];
  oneTimePrice?: number;
  isPinned?: boolean;
  likes: string[];
  commentCount: number;
  timestamp: number;
}

// Member chat inside a Sanctuary. A channel can be open to all members or gated
// (à la carte paid chat) — access is decided by the same SanctuaryAccessType rules.
export interface SanctuaryChatMessage {
  id: string;
  sanctuaryId: string;
  channelId?: string;      // undefined = the main members lounge
  senderId: string;
  senderName: string;
  senderPhoto?: string;
  content: string;
  timestamp: number;
}

// A gated media wall inside a Sanctuary (photos, clips, stems, artwork).
export interface SanctuaryGalleryItem {
  id: string;
  sanctuaryId: string;
  uploaderId: string;
  uploaderName: string;
  type: 'PHOTO' | 'VIDEO' | 'AUDIO';
  url: string;
  thumbnailUrl?: string;
  title?: string;
  accessType: SanctuaryAccessType;
  requiredTierIds?: string[];
  oneTimePrice?: number;
  timestamp: number;
}

// A scheduled member event (livestream, AMA, watch party, listening session).
export interface SanctuaryEvent {
  id: string;
  sanctuaryId: string;
  hostId: string;
  title: string;
  description?: string;
  type: 'LIVESTREAM' | 'AMA' | 'WATCH_PARTY' | 'LISTENING' | 'CALL';
  scheduledAt: number;
  accessType: SanctuaryAccessType;
  requiredTierIds?: string[];
  attendeeIds: string[];
  isLive?: boolean;
  timestamp: number;
}

// A one-time backing of a Sanctuary's crowdfunding campaign (Stripe-recorded).
export interface SanctuaryPledge {
  id: string;
  sanctuaryId: string;
  backerId: string;
  amount: number;
  createdAt: number;
}

// An à la carte unlock — a one-time purchase of a single content item or post.
export interface SanctuaryPurchase {
  id: string;
  sanctuaryId: string;
  buyerId: string;
  itemId: string;          // content or post id
  itemType: 'CONTENT' | 'POST' | 'CHAT';
  amount: number;          // USD paid
  purchasedAt: number;
}

// A portable gate any platform asset can carry so it can be locked behind a
// Sanctuary — a secret track, a whole film, a research paper, a private chat.
export interface SanctuaryGate {
  sanctuaryId: string;        // owning sanctuary (ownerId)
  accessType: SanctuaryAccessType;
  requiredTierIds?: string[]; // for TIER
  oneTimePrice?: number;      // for ONE_TIME
  previewUrl?: string;        // optional free teaser
  label?: string;             // e.g. "Members only", "Backstage tier"
}

// ── STORE & E-COMMERCE ────────────────────────────────────────────────────────

export type StoreProductCategory =
  | 'APPAREL' | 'MUSIC' | 'ACCESSORIES' | 'DIGITAL'
  | 'COLLECTIBLES' | 'BOOKS' | 'ELECTRONICS' | 'HOME' | 'ART' | 'OTHER';

export interface StoreProductVariant {
  id: string;
  name: string;    // e.g. "Large / Black"
  sku?: string;
  stock: number;
  priceModifier?: number; // + or - from base price
  imageUrl?: string;
}

export interface StoreProduct {
  id: string;
  sellerId: string;
  sellerName: string;
  sellerPhoto?: string;
  title: string;
  description: string;
  category: StoreProductCategory;
  price: number;
  compareAtPrice?: number;  // crossed-out original price
  images: string[];
  variants?: StoreProductVariant[];
  stock: number;            // total across all variants
  weight?: number;          // grams, for shipping calc
  isDigital: boolean;
  digitalFileUrl?: string;
  tags?: string[];
  // ── Rich product-page fields (high-end shopping experience) ──
  features?: string[];                              // bullet highlights
  specs?: { label: string; value: string }[];       // details / dimensions / material
  colorOptions?: { name: string; hex: string }[];   // swatch selector
  sizeOptions?: string[];                            // size selector
  isClothing?: boolean;                              // enables AI try-on
  rating?: number;
  reviewCount?: number;
  soldCount?: number;
  isFeatured?: boolean;
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
  worldId?: string;         // linked world/brand
}

export interface StoreOrderItem {
  productId: string;
  variantId?: string;
  title: string;
  imageUrl?: string;
  price: number;
  quantity: number;
}

export type StoreOrderStatus = 'PENDING' | 'CONFIRMED' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED' | 'REFUNDED';

export interface StoreOrder {
  id: string;
  buyerId: string;
  buyerName: string;
  buyerEmail?: string;
  items: StoreOrderItem[];
  subtotal: number;
  shippingCost: number;
  tax: number;
  total: number;
  status: StoreOrderStatus;
  shippingAddress?: {
    line1: string;
    line2?: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
  trackingNumber?: string;
  stripePaymentIntentId?: string;
  notes?: string;
  createdAt: number;
  updatedAt: number;
}

export interface StoreCartItem {
  product: StoreProduct;
  variantId?: string;
  variantName?: string;
  quantity: number;
}

export interface StoreReview {
  id: string;
  productId: string;
  reviewerId: string;
  reviewerName: string;
  reviewerPhoto?: string;
  rating: number;      // 1-5
  title?: string;
  body: string;
  images?: string[];
  isVerifiedPurchase: boolean;
  helpfulCount: number;
  timestamp: number;
}

// ── GARAGE SALE (AUCTIONS) ────────────────────────────────────────────────────

export type GarageSaleStatus = 'DRAFT' | 'ACTIVE' | 'ENDED' | 'SOLD' | 'CANCELLED';
export type GarageSaleCondition = 'NEW' | 'LIKE_NEW' | 'GOOD' | 'FAIR' | 'PARTS_ONLY';

export interface GarageSaleItem {
  id: string;
  sellerId: string;
  sellerName: string;
  sellerPhoto?: string;
  title: string;
  description: string;
  condition: GarageSaleCondition;
  category: StoreProductCategory;
  images: string[];
  startingBid: number;
  reservePrice?: number;    // Hidden minimum acceptable price
  buyItNowPrice?: number;   // Instant purchase option
  currentBid?: number;
  currentBidderId?: string;
  currentBidderName?: string;
  bidCount: number;
  watchers: string[];       // UIDs watching this auction
  startTime: number;
  endTime: number;
  status: GarageSaleStatus;
  winnerId?: string;
  winnerName?: string;
  finalPrice?: number;
  shippingCost?: number;
  isLocalPickup?: boolean;
  tags?: string[];
  createdAt: number;
}

export interface GarageSaleBid {
  id: string;
  itemId: string;
  bidderId: string;
  bidderName: string;
  bidderPhoto?: string;
  amount: number;
  isAutoBid?: boolean;
  maxAutoBid?: number;      // Auto-bidding ceiling
  timestamp: number;
}

// ── CHAT EXTENSIONS (REACTIONS, REPLIES, PINS) ────────────────────────────────

export interface ChatReaction {
  emoji: string;
  userIds: string[];       // UIDs who reacted with this emoji
}

export interface ChatPoll {
  question: string;
  options: string[];
  votes: Record<string, string>;  // uid -> optionIndex string
  endsAt?: number;
  allowMultiple?: boolean;
}

// Extended ChatMessage fields (merged into ChatMessage via optional fields)
// replyToId, reactions, isPinned, poll added to ChatMessage interface above

// ── COMMENT POLLS ─────────────────────────────────────────────────────────────

export interface PostPoll {
  id: string;
  postId: string;           // or clubPostId, etc.
  creatorId: string;
  question: string;
  options: string[];
  votes: Record<string, number[]>; // optionIndex string -> array of voterUIDs
  allowMultiple: boolean;
  endsAt?: number;
  createdAt: number;
  isAnonymous: boolean;
}

// ── BRAND PUBLIC PAGE ─────────────────────────────────────────────────────────

export interface BrandPublicPageData {
  id: string;
  brandId: string;
  adminId: string;
  brandName: string;
  tagline?: string;
  about: string;
  coverImageUrl?: string;
  logoUrl?: string;
  accentColor?: string;
  roster: {
    artistId: string;
    artistName: string;
    artistPhoto?: string;
    role?: string;          // e.g. "Lead Vocalist", "Manager"
  }[];
  featuredReleaseIds: string[];  // Album/Video IDs
  socialLinks?: {
    instagram?: string;
    twitter?: string;
    spotify?: string;
    website?: string;
  };
  pressKitUrl?: string;
  contactEmail?: string;
  isPublic: boolean;
  createdAt: number;
  updatedAt: number;
}

// ── CLASSROOM EXTENSIONS ──────────────────────────────────────────────────────

export interface LiveClassSession {
  id: string;
  classroomId: string;
  hostId: string;
  title: string;
  scheduledAt: number;
  durationMinutes: number;
  meetingUrl?: string;
  status: 'SCHEDULED' | 'LIVE' | 'ENDED';
  recordingUrl?: string;
  attendeeIds: string[];
  createdAt: number;
}

export interface StudentGrade {
  id: string;
  classroomId: string;
  studentId: string;
  studentName: string;
  assignmentId: string;
  grade: number;
  maxPoints: number;
  feedback?: string;
  gradedBy: string;
  gradedAt: number;
}

export interface EnrollmentRequest {
  id: string;
  classroomId: string;
  studentId: string;
  studentName: string;
  studentPhoto?: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  requestedAt: number;
  message?: string;
}

// ── Pitch Deck types ───────────────────────────────────────────────────────────

export type PitchDeckTheme = 'music' | 'film' | 'business' | 'fashion';
export type PitchElementType = 'text' | 'image' | 'video' | 'button' | 'shape';
export type PitchTransition = 'fade' | 'slide-left' | 'slide-up' | 'zoom' | 'none';

export interface PitchElement {
  id: string;
  type: PitchElementType;
  // Position on slide (% of slide dimensions)
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  zIndex?: number;
  opacity?: number;
  // Text
  content?: string;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: string;
  fontStyle?: 'normal' | 'italic';
  color?: string;
  textAlign?: 'left' | 'center' | 'right';
  lineHeight?: number;
  letterSpacing?: number;
  textShadow?: string;
  // Image
  src?: string;
  objectFit?: 'cover' | 'contain' | 'fill';
  borderRadius?: number;
  cutoutApplied?: boolean;     // AI background removal has been applied
  originalSrc?: string;        // pre-cutout original
  shadow?: string;
  // Video
  videoSrc?: string;
  autoPlay?: boolean;
  loop?: boolean;
  muted?: boolean;
  // Button / CTA
  href?: string;
  label?: string;
  btnColor?: string;
  btnTextColor?: string;
  btnBorderRadius?: number;
  // Shape
  shapeType?: 'rect' | 'circle' | 'triangle' | 'line';
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  // Animation (entrance)
  animation?: 'fade-in' | 'slide-up' | 'pop' | 'none';
  animationDelay?: number;
}

export interface PitchSlide {
  id: string;
  order: number;
  // Background
  bgType: 'color' | 'gradient' | 'image' | 'video';
  bgValue: string;            // hex, gradient CSS, image URL, or video URL
  bgOverlay?: string;         // rgba overlay on top of image/video bg
  // Elements
  elements: PitchElement[];
  // Narration
  narrationSegmentMs?: [number, number]; // [startMs, endMs] of narration audio
  // Timing
  transition?: PitchTransition;
  duration?: number;          // auto-advance after N seconds (0 = manual)
  // Layout hint for reflow
  layout?: 'hero' | 'split' | 'full-media' | 'text-only' | 'cta';
}

export interface PitchDeck {
  id: string;
  title: string;
  subtitle?: string;
  theme: PitchDeckTheme;
  slides: PitchSlide[];
  // Audio
  narrationUrl?: string;       // full narration audio track (synced to slides)
  bgMusicUrl?: string;
  bgMusicVolume?: number;      // 0-1
  // Linked monetization page
  ctaUrl?: string;             // destination for all CTA buttons
  ctaLabel?: string;
  linkedTo?: {
    type: 'sanctuary' | 'charity' | 'business' | 'club';
    id: string;
    displayName: string;
  };
  // Meta
  createdBy: string;
  isPublic: boolean;
  createdAt: number;
  updatedAt: number;
  // Sharing / embed
  embedCode?: string;          // generated <iframe> embed HTML
  verticalVideoUrl?: string;   // pre-rendered 9:16 version
  thumbnailUrl?: string;
  coverImageUrl?: string;      // hero image used in the deck cover slide
}

// AppView addition for PitchDeck Studio is in the AppView type — see above in types.ts

// ── Events & Ticketing ────────────────────────────────────────────────────────

export type EventType = 'IN_PERSON' | 'VIRTUAL' | 'HYBRID';
export type EventStatus = 'DRAFT' | 'PUBLISHED' | 'ON_SALE' | 'SOLD_OUT' | 'CANCELLED' | 'COMPLETED';
export type TicketStatus = 'VALID' | 'USED' | 'REFUNDED' | 'CANCELLED' | 'TRANSFERRED';
export type RefundPolicy = 'NO_REFUND' | '24H' | '48H' | '7D' | '30D';

export interface TicketTier {
  id: string;
  name: string;
  description: string;
  priceCents: number;
  quantity: number;
  sold: number;
  perOrderMin: number;
  perOrderMax: number;
  isVisible: boolean;
  saleStartDate?: number;
  saleEndDate?: number;
  benefits: string[];
  color: string;
  physicalTicketAvailable: boolean;
  customPackagingAvailable: boolean;
  customPackagingFeeCents: number;
}

export interface ItineraryItem {
  id: string;
  time: string;
  title: string;
  description?: string;
  performer?: string;
  type: 'DOORS' | 'PERFORMANCE' | 'BREAK' | 'WORKSHOP' | 'MEET_GREET' | 'CEREMONY' | 'OTHER';
  durationMins?: number;
}

export interface PlajahEvent {
  id: string;
  creatorUid: string;
  creatorName: string;
  creatorPhotoURL?: string;
  title: string;
  subtitle?: string;
  description: string;
  coverImage?: string;
  heroVideoUrl?: string;
  galleryImages?: string[];
  type: EventType;
  status: EventStatus;
  // Location
  venueName?: string;
  venueAddress?: string;
  city?: string;
  state?: string;
  country?: string;
  lat?: number;
  lng?: number;
  // Virtual
  streamUrl?: string;
  streamPassword?: string;
  virtualPlatform?: string;
  // Timing
  startDate: number;
  endDate: number;
  doorsOpenDate?: number;
  timezone: string;
  // Tickets
  tiers: TicketTier[];
  totalCapacity: number;
  totalSold: number;
  // Itinerary
  itinerary: ItineraryItem[];
  // Settings
  requiresApproval: boolean;
  refundPolicy: RefundPolicy;
  ageRestriction?: string;
  dresscode?: string;
  accessibilityInfo?: string;
  faqItems?: { question: string; answer: string }[];
  // Promo
  promoCodes?: { code: string; discountPct: number; usesLeft: number }[];
  // Platform integrations
  linkedAlbumId?: string;
  sanctuaryMembersOnly?: boolean;
  plajahPlusDiscount?: number;
  linkedFastChannelId?: string;
  linkedLiveStreamId?: string;
  // Kiosk
  kioskEnabled: boolean;
  // Printing
  printingEnabled: boolean;
  printNodeApiKey?: string;
  printNodePrinterId?: string;
  customTicketDesignUrl?: string;
  // Sharing / SEO
  slug?: string;
  metaTitle?: string;
  metaDescription?: string;
  // Analytics
  viewCount: number;
  shareCount: number;
  // Meta
  tags: string[];
  createdAt: number;
  updatedAt: number;
}

export interface EventTicket {
  id: string;
  eventId: string;
  eventTitle: string;
  eventStartDate: number;
  eventVenue?: string;
  eventCoverImage?: string;
  tierId: string;
  tierName: string;
  tierColor: string;
  holderName: string;
  holderEmail: string;
  holderUid?: string;
  orderNumber: string;
  quantity: number;
  unitPriceCents: number;
  totalPriceCents: number;
  status: TicketStatus;
  checkedInAt?: number;
  checkedInBy?: string;
  stripePaymentIntentId?: string;
  // Physical
  physicalRequested: boolean;
  customPackagingRequested: boolean;
  shippingAddress?: {
    name: string; line1: string; line2?: string;
    city: string; state: string; zip: string; country: string;
  };
  printedAt?: number;
  mailedAt?: number;
  trackingNumber?: string;
  // Transfer
  transferredTo?: string;
  transferredAt?: number;
  createdAt: number;
}

export interface EventKioskSession {
  id: string;
  eventId: string;
  creatorUid: string;
  deviceLabel: string;
  startedAt: number;
  lastActivityAt: number;
  ordersCount: number;
  totalRevenueCents: number;
  isActive: boolean;
}

// ── Event Production Management ───────────────────────────────────────────────

export type EventProductionType = 'CONCERT' | 'FILM_PREMIERE' | 'BOOK_SIGNING' | 'GAME_LAUNCH' | 'PODCAST_LIVE' | 'ART_SHOW' | 'COMEDY_SHOW' | 'CUSTOM';

export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'DONE' | 'BLOCKED';
export type VendorStatus = 'PROSPECTING' | 'CONTACTED' | 'NEGOTIATING' | 'CONTRACTED' | 'PAID' | 'CANCELLED';
export type ContractType = 'VENUE' | 'SOUND_AV' | 'CATERING' | 'SECURITY' | 'PHOTOGRAPHER' | 'MUSICIAN_PERFORMER' | 'MARKETING_PR' | 'LIGHTING' | 'TRANSPORT' | 'CUSTOM';

export interface EventTask {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  dueDate?: number;
  assignedTo?: string;
  category: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  isAiSuggested?: boolean;
  completedAt?: number;
  notes?: string;
}

export interface EventVendor {
  id: string;
  name: string;
  type: ContractType;
  contactName?: string;
  email?: string;
  phone?: string;
  website?: string;
  quoteCents?: number;
  finalCents?: number;
  status: VendorStatus;
  contractSigned: boolean;
  contractUrl?: string;
  depositPaidCents?: number;
  depositDueDate?: number;
  finalPaymentDueDate?: number;
  stripePaymentIntentId?: string;
  notes?: string;
  introLetterDraft?: string;
  createdAt: number;
}

export interface EventBudgetItem {
  id: string;
  category: string;
  label: string;
  estimatedCents: number;
  actualCents?: number;
  vendorId?: string;
  dueDate?: number;
  isPaid: boolean;
  paidAt?: number;
  stripePaymentIntentId?: string;
  notes?: string;
}

export interface EventProductionProject {
  id: string;
  creatorUid: string;
  eventId?: string;
  title: string;
  type: EventProductionType;
  eventDate?: number;
  venue?: string;
  city?: string;
  status: 'PLANNING' | 'IN_PROGRESS' | 'READY' | 'COMPLETED' | 'CANCELLED';
  tasks: EventTask[];
  vendors: EventVendor[];
  budgetItems: EventBudgetItem[];
  totalBudgetCents: number;
  isFreeEvent: boolean;
  museChatHistory?: { role: 'user' | 'assistant'; content: string; timestamp: number }[];
  createdAt: number;
  updatedAt: number;
}

// ── Artist Services & Ads ─────────────────────────────────────────────────────

export type ArtistAdPlatform = 'PLAJAH' | 'GOOGLE' | 'META' | 'BING' | 'TIKTOK';
export type ArtistAdStatus = 'DRAFT' | 'PENDING_REVIEW' | 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'REJECTED';
export type ArtistAdObjective = 'AWARENESS' | 'TRAFFIC' | 'ENGAGEMENT' | 'TICKET_SALES' | 'MERCH_SALES' | 'FOLLOWERS' | 'STREAMS';

export interface ArtistAdCreative {
  headline: string;
  description: string;
  imageUrl?: string;
  videoUrl?: string;
  ctaText: string;
  destinationUrl: string;
}

export interface ArtistAdCampaign {
  id: string;
  creatorUid: string;
  name: string;
  objective: ArtistAdObjective;
  platforms: ArtistAdPlatform[];
  status: ArtistAdStatus;
  creative: ArtistAdCreative;
  dailyBudgetCents: number;
  totalBudgetCents: number;
  spentCents: number;
  startDate: number;
  endDate?: number;
  targeting?: {
    ageMin?: number; ageMax?: number;
    locations?: string[];
    interests?: string[];
    lookalike?: boolean;
  };
  analytics: {
    impressions: number; clicks: number; ctr: number;
    conversions: number; cpc: number; spend: number;
  };
  externalCampaignIds?: Record<string, string>;
  linkedEventId?: string;
  linkedAlbumId?: string;
  createdAt: number;
  updatedAt: number;
}

export interface ArtistServicesSubscription {
  uid: string;
  plan: 'PER_EVENT' | 'MONTHLY';
  status: 'ACTIVE' | 'CANCELLED' | 'TRIAL';
  stripeSubscriptionId?: string;
  monthlyFeeCents: 499;
  perEventFeeCents: 2999;
  freeEventsUsed: number;
  currentPeriodEnd?: number;
  adBudgetCents: number;
  adBudgetUsedCents: number;
  createdAt: number;
}
