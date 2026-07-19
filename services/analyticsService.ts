import { collection, getDocs, query, where, orderBy, limit, Timestamp } from 'firebase/firestore';
import { db } from './firebase';
import type { FilmVideoAnalytics } from '../types';

// ── Types ───────────────────────────────────────────────────────────────────

export interface PlatformKPIs {
  totalUsers: number;
  newUsersLast30d: number;
  totalAlbums: number;
  totalVideos: number;
  totalPosts: number;
  totalArticles: number;
  totalGames: number;
  totalPhotos: number;
  totalWorlds: number;
  totalPlays: number;
  totalLikes: number;
  totalComments: number;
  totalFollows: number;
  totalLiveStreams: number;
}

export interface ContentBreakdown {
  name: string;
  count: number;
  plays: number;
  likes: number;
  fill: string;
}

export interface TopContent {
  id: string;
  title: string;
  author: string;
  plays: number;
  likes: number;
  type: 'music' | 'video' | 'post' | 'article' | 'game';
  thumbnail?: string;
}

export interface TopUser {
  uid: string;
  displayName: string;
  photoURL: string;
  followerCount: number;
  role: string;
}

export interface AdminAnalytics {
  kpis: PlatformKPIs;
  contentBreakdown: ContentBreakdown[];
  topMusic: TopContent[];
  topVideos: TopContent[];
  topPosts: TopContent[];
  topUsers: TopUser[];
  recentSignups: { date: string; count: number }[];
}

export interface UserKPIs {
  followerCount: number;
  followingCount: number;
  totalPlays: number;
  totalLikes: number;
  totalComments: number;
  totalShares: number;
  totalAlbums: number;
  totalVideos: number;
  totalPosts: number;
  totalArticles: number;
  totalGames: number;
  totalWorlds: number;
  points: number;
}

export interface TrackStat {
  id: string;
  title: string;
  album: string;
  plays: number;
  likes: number;
  shares: number;
}

export interface AlbumStat {
  id: string;
  title: string;
  plays: number;
  likes: number;
  shares: number;
  trackCount: number;
  thumbnail?: string;
}

export interface VideoStat {
  id: string;
  title: string;
  plays: number;
  likes: number;
  comments: number;
  thumbnail?: string;
}

export interface PostStat {
  id: string;
  content: string;
  likes: number;
  comments: number;
  shares: number;
  timestamp: number;
}

export interface ArticleStat {
  id: string;
  title: string;
  likes: number;
  comments: number;
  readTime: number;
  timestamp: number;
}

export interface GameStat {
  id: string;
  title: string;
  installs: number;
  rating: number;
  reviews: number;
  thumbnail?: string;
}

export interface WorldStat {
  id: string;
  name: string;
  likes: number;
  timestamp: number;
}

export interface UserAnalytics {
  kpis: UserKPIs;
  albums: AlbumStat[];
  videos: VideoStat[];
  posts: PostStat[];
  articles: ArticleStat[];
  games: GameStat[];
  worlds: WorldStat[];
  engagementTimeline: { label: string; plays: number; likes: number }[];
}

// ── Helpers ─────────────────────────────────────────────────────────────────

const sum = (arr: any[], field: string): number =>
  arr.reduce((acc, d) => acc + (Number(d[field]) || 0), 0);

const daysAgo = (n: number): number => Date.now() - n * 86_400_000;

// Build a synthetic 6-month timeline from content timestamps
function buildTimeline(
  items: { timestamp?: number; plays?: number; playCount?: number; playsCount?: number; likesCount?: number }[]
): { label: string; plays: number; likes: number }[] {
  const now = new Date();
  const months: { label: string; plays: number; likes: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({
      label: d.toLocaleString('default', { month: 'short', year: '2-digit' }),
      plays: 0,
      likes: 0,
    });
  }
  // Distribute plays/likes across months proportionally using creation timestamps
  items.forEach(item => {
    const ts = item.timestamp || 0;
    const d = new Date(ts);
    const diff = (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
    if (diff >= 0 && diff < 6) {
      const idx = 5 - diff;
      months[idx].plays += (item.playCount || item.playsCount || item.plays || 0);
      months[idx].likes += (item.likesCount || 0);
    }
  });
  return months;
}

// ── Admin Analytics ──────────────────────────────────────────────────────────

export async function fetchAdminAnalytics(): Promise<AdminAnalytics> {
  // Resilient fetch: one collection being denied or empty must NOT blank the whole
  // dashboard. Each read degrades to an empty snapshot on failure (logged, not thrown).
  const EMPTY = { docs: [] as any[], size: 0 };
  const safe = async (label: string, p: Promise<any>) => {
    try { return await p; } catch (e) { console.error(`[analytics] ${label} read failed:`, (e as Error)?.message); return EMPTY; }
  };
  const [
    usersSnap,
    albumsSnap,
    videosSnap,
    postsSnap,
    articlesSnap,
    gamesSnap,
    photosSnap,
    worldsSnap,
    followsSnap,
    liveFeedSnap,
  ] = await Promise.all([
    safe('users', getDocs(collection(db, 'users'))),
    safe('albums', getDocs(query(collection(db, 'albums'), orderBy('playCount', 'desc'), limit(200)))),
    safe('videos', getDocs(query(collection(db, 'videos'), orderBy('playCount', 'desc'), limit(200)))),
    safe('posts', getDocs(query(collection(db, 'posts'), orderBy('likesCount', 'desc'), limit(200)))),
    safe('articles', getDocs(query(collection(db, 'articles'), orderBy('likesCount', 'desc'), limit(200)))),
    safe('games', getDocs(query(collection(db, 'games'), limit(100)))),
    safe('photos', getDocs(query(collection(db, 'photos'), limit(200)))),
    safe('worlds', getDocs(query(collection(db, 'worlds'), limit(100)))),
    safe('follows', getDocs(query(collection(db, 'follows'), limit(500)))),
    safe('liveFeed', getDocs(query(collection(db, 'liveFeed'), limit(100)))),
  ]);

  const users = usersSnap.docs.map(d => ({ uid: d.id, ...d.data() } as any));
  const albums = albumsSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
  const videos = videosSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
  const posts = postsSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
  const articles = articlesSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
  const games = gamesSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
  const photos = photosSnap.docs.map(d => d.data() as any);
  const worlds = worldsSnap.docs.map(d => d.data() as any);

  const cutoff30 = daysAgo(30);
  const newUsers = users.filter(u => (u.createdAt || 0) > cutoff30).length;

  const totalMusicPlays = sum(albums, 'playCount');
  const totalVideoPlays = sum(videos, 'playCount');
  const totalLikes =
    sum(albums, 'likesCount') + sum(videos, 'likesCount') + sum(posts, 'likesCount') + sum(articles, 'likesCount');
  const totalComments = sum(posts, 'commentsCount') + sum(videos, 'commentsCount') + sum(articles, 'commentsCount');

  const kpis: PlatformKPIs = {
    totalUsers: users.length,
    newUsersLast30d: newUsers,
    totalAlbums: albumsSnap.size,
    totalVideos: videosSnap.size,
    totalPosts: postsSnap.size,
    totalArticles: articlesSnap.size,
    totalGames: gamesSnap.size,
    totalPhotos: photosSnap.size,
    totalWorlds: worldsSnap.size,
    totalPlays: totalMusicPlays + totalVideoPlays,
    totalLikes,
    totalComments,
    totalFollows: followsSnap.size,
    totalLiveStreams: liveFeedSnap.size,
  };

  const contentBreakdown: ContentBreakdown[] = [
    { name: 'Music', count: albumsSnap.size, plays: totalMusicPlays, likes: sum(albums, 'likesCount'), fill: '#D40055' },
    { name: 'Video', count: videosSnap.size, plays: totalVideoPlays, likes: sum(videos, 'likesCount'), fill: '#6B0099' },
    { name: 'Posts', count: postsSnap.size, plays: 0, likes: sum(posts, 'likesCount'), fill: '#FF8C00' },
    { name: 'Articles', count: articlesSnap.size, plays: 0, likes: sum(articles, 'likesCount'), fill: '#00B4D8' },
    { name: 'Games', count: gamesSnap.size, plays: sum(games, 'installCount'), likes: 0, fill: '#7B2FBE' },
    { name: 'Photos', count: photosSnap.size, plays: 0, likes: sum(photos, 'likesCount'), fill: '#06D6A0' },
    { name: 'Worlds', count: worldsSnap.size, plays: 0, likes: sum(worlds, 'likesCount'), fill: '#FFD166' },
  ];

  const topMusic: TopContent[] = albums.slice(0, 10).map(a => ({
    id: a.id,
    title: a.title || 'Untitled',
    author: a.artist || a.authorName || 'Unknown',
    plays: a.playCount || 0,
    likes: a.likesCount || 0,
    type: 'music',
    thumbnail: a.coverArt || a.artworkUrl,
  }));

  const topVideos: TopContent[] = videos.slice(0, 10).map(v => ({
    id: v.id,
    title: v.title || 'Untitled',
    author: v.artistName || v.ownerName || 'Unknown',
    plays: v.playCount || 0,
    likes: v.likesCount || 0,
    type: 'video',
    thumbnail: v.thumbnailUrl,
  }));

  const topPosts: TopContent[] = posts.slice(0, 10).map(p => ({
    id: p.id,
    title: p.content?.slice(0, 80) || 'Post',
    author: p.authorName || 'Unknown',
    plays: 0,
    likes: p.likesCount || 0,
    type: 'post',
  }));

  const topUsers: TopUser[] = users
    .sort((a: any, b: any) => (b.followerCount || 0) - (a.followerCount || 0))
    .slice(0, 10)
    .map((u: any) => ({
      uid: u.uid,
      displayName: u.displayName || 'Unknown',
      photoURL: u.photoURL || '',
      followerCount: u.followerCount || 0,
      role: u.role || 'user',
    }));

  // Signup timeline: last 6 months
  const now = new Date();
  const recentSignups: { date: string; count: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1).getTime();
    const start = d.getTime();
    const count = users.filter((u: any) => {
      const ts = u.createdAt || 0;
      return ts >= start && ts < end;
    }).length;
    recentSignups.push({
      date: d.toLocaleString('default', { month: 'short', year: '2-digit' }),
      count,
    });
  }

  return { kpis, contentBreakdown, topMusic, topVideos, topPosts, topUsers, recentSignups };
}

// ── User Analytics ───────────────────────────────────────────────────────────

export async function fetchUserAnalytics(uid: string, userProfile: any): Promise<UserAnalytics> {
  const [albumsSnap, videosSnap, postsSnap, articlesSnap, gamesSnap, worldsSnap] = await Promise.all([
    getDocs(query(collection(db, 'albums'), where('ownerId', '==', uid))),
    getDocs(query(collection(db, 'videos'), where('ownerId', '==', uid))),
    getDocs(query(collection(db, 'posts'), where('authorId', '==', uid), orderBy('timestamp', 'desc'), limit(50))),
    getDocs(query(collection(db, 'articles'), where('authorId', '==', uid), orderBy('timestamp', 'desc'), limit(50))),
    getDocs(query(collection(db, 'games'), where('ownerId', '==', uid))),
    getDocs(query(collection(db, 'worlds'), where('creatorId', '==', uid))),
  ]);

  const albums = albumsSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
  const videos = videosSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
  const posts = postsSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
  const articles = articlesSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
  const games = gamesSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
  const worlds = worldsSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));

  const totalPlays = sum(albums, 'playCount') + sum(videos, 'playCount');
  const totalLikes =
    sum(albums, 'likesCount') + sum(videos, 'likesCount') + sum(posts, 'likesCount') + sum(articles, 'likesCount');
  const totalComments = sum(posts, 'commentsCount') + sum(videos, 'commentsCount') + sum(articles, 'commentsCount');
  const totalShares = sum(albums, 'shareCount') + sum(posts, 'shareCount');

  const kpis: UserKPIs = {
    followerCount: userProfile?.followerCount || 0,
    followingCount: userProfile?.followingCount || 0,
    totalPlays,
    totalLikes,
    totalComments,
    totalShares,
    totalAlbums: albumsSnap.size,
    totalVideos: videosSnap.size,
    totalPosts: postsSnap.size,
    totalArticles: articlesSnap.size,
    totalGames: gamesSnap.size,
    totalWorlds: worldsSnap.size,
    points: userProfile?.points || 0,
  };

  const albumStats: AlbumStat[] = albums
    .map(a => ({
      id: a.id,
      title: a.title || 'Untitled',
      plays: a.playCount || 0,
      likes: a.likesCount || 0,
      shares: a.shareCount || 0,
      trackCount: a.tracks?.length || 0,
      thumbnail: a.coverArt || a.artworkUrl,
    }))
    .sort((a, b) => b.plays - a.plays);

  const videoStats: VideoStat[] = videos
    .map(v => ({
      id: v.id,
      title: v.title || 'Untitled',
      plays: v.playCount || 0,
      likes: v.likesCount || 0,
      comments: v.commentsCount || 0,
      thumbnail: v.thumbnailUrl,
    }))
    .sort((a, b) => b.plays - a.plays);

  const postStats: PostStat[] = posts.map(p => ({
    id: p.id,
    content: p.content?.slice(0, 100) || '',
    likes: p.likesCount || 0,
    comments: p.commentsCount || 0,
    shares: p.shareCount || 0,
    timestamp: p.timestamp || 0,
  }));

  const articleStats: ArticleStat[] = articles.map(a => ({
    id: a.id,
    title: a.title || 'Untitled',
    likes: a.likesCount || 0,
    comments: a.commentsCount || 0,
    readTime: a.readTime || 0,
    timestamp: a.timestamp || 0,
  }));

  const gameStats: GameStat[] = games.map(g => ({
    id: g.id,
    title: g.title || 'Untitled',
    installs: g.installCount || 0,
    rating: g.rating || 0,
    reviews: g.reviewCount || 0,
    thumbnail: g.thumbnailUrl,
  }));

  const worldStats: WorldStat[] = worlds.map(w => ({
    id: w.id,
    name: w.name || 'Untitled World',
    likes: w.likesCount || 0,
    timestamp: w.createdAt || 0,
  }));

  const allContent = [
    ...albums.map(a => ({ timestamp: a.createdAt, playCount: a.playCount, likesCount: a.likesCount })),
    ...videos.map(v => ({ timestamp: v.timestamp, playCount: v.playCount, likesCount: v.likesCount })),
  ];
  const engagementTimeline = buildTimeline(allContent);

  return {
    kpis,
    albums: albumStats,
    videos: videoStats,
    posts: postStats,
    articles: articleStats,
    games: gameStats,
    worlds: worldStats,
    engagementTimeline,
  };
}

// ── Film / Video Analytics ────────────────────────────────────────────────────

export async function fetchFilmAnalytics(uid: string): Promise<FilmVideoAnalytics[]> {
  const videosSnap = await getDocs(
    query(collection(db, 'videos'), where('ownerId', '==', uid))
  );
  const albumsSnap = await getDocs(
    query(collection(db, 'albums'), where('ownerId', '==', uid), where('type', '==', 'VIDEO'))
  );

  const videos = videosSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
  const filmAlbums = albumsSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));

  // Combine VIDEO-type albums and standalone MOVIE/DOCUMENTARY videos
  const filmVideos = [
    ...videos.filter((v: any) => v.category === 'MOVIE' || v.category === 'DOCUMENTARY' || v.category === 'SHORT_FILM'),
    ...filmAlbums,
  ];

  return filmVideos.map((v: any): FilmVideoAnalytics => {

    // Everything below used to be INVENTED when the real field was missing: dropOffSegments were
    // generated with Math.random() (so the "retention heatmap" showed different numbers on every
    // page load), avgWatchDuration defaulted to duration * 0.45, and sourceAttribution was a
    // fixed percentage split of the play count dressed up as traffic sources. A creator studying
    // that heatmap to decide where their film loses people was reading noise.
    //
    // Real equivalents now come from contentStats, populated by /api/metrics/events. Until a
    // title has accumulated data, these stay EMPTY and the UI says so — an honest blank beats a
    // confident fiction.
    return {
      videoId:          v.id,
      title:            v.title || 'Untitled',
      completionRate:   typeof v.completionRate === 'number' ? v.completionRate : 0,
      avgWatchDuration: typeof v.avgWatchDuration === 'number' ? v.avgWatchDuration : 0,
      dropOffSegments:  [],
      rentalCount:      v.rentalCount   || 0,
      purchaseCount:    v.purchaseCount || 0,
      ppvCount:         v.ppvCount      || 0,
      uniqueViewers:    typeof v.uniqueViewers === 'number' ? v.uniqueViewers : 0,
      sourceAttribution: [],
    };
  });
}
