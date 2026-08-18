import { useEffect, useMemo, useRef, useState } from 'react';
import {
  fetchAllLiveFeeds, fetchAllPublicAlbums, fetchAllPublicWorlds, fetchAllVideos, fetchDiscussionPosts,
  fetchGames, fetchGlobalApps, fetchGlobalPhotos, listenToGlobalArticles, listenToGlobalPosts, searchUsers,
} from '../services/backendService';
import { semanticSearch, type AzureSearchResult } from '../services/microsoftAIService';
import { diversifyPublicSearchResults, maxPublicSearchScore, normalizePublicSearchQuery } from '../services/platformSearchService';
import type { Album, Post, UserProfile, Video } from '../types';

export type UniversalResultType = 'USER' | 'MUSIC' | 'PODCAST' | 'BOOK' | 'VIDEO' | 'MOVIE' | 'TV' | 'ARTICLE' | 'GAME' | 'WORLD' | 'LIVE' | 'DISCUSSION' | 'PHOTO' | 'APP' | 'POST';
export interface UniversalPlatformResult { id: string; title: string; subtitle?: string; thumbnail?: string; type: UniversalResultType; raw: any; _score: number }

const ORDER: Record<UniversalResultType, number> = { USER: 0, MUSIC: 1, PODCAST: 2, MOVIE: 3, TV: 4, VIDEO: 5, ARTICLE: 6, POST: 7, GAME: 8, LIVE: 9, WORLD: 10, BOOK: 11, DISCUSSION: 12, APP: 13, PHOTO: 14 };
const albumType = (album: Album): UniversalResultType => {
  const sub = String((album as any).subType || '').toUpperCase();
  if (album.type === 'BOOK' || ['NOVEL', 'GRAPHIC_NOVEL'].includes(sub)) return 'BOOK';
  if (sub === 'PODCAST') return 'PODCAST';
  if (['MOVIE', 'SHORT FILM', 'SHORT_FILM'].includes(sub)) return 'MOVIE';
  if (['TV_SERIES', 'TV SERIES'].includes(sub)) return 'TV';
  return 'MUSIC';
};

export function useUniversalPlatformSearch(query: string) {
  const [catalogs, setCatalogs] = useState<{ albums: Album[]; videos: Video[]; articles: any[]; games: any[]; worlds: any[]; apps: any[]; photos: any[]; live: any[]; discussions: any[]; posts: Post[] }>({ albums: [], videos: [], articles: [], games: [], worlds: [], apps: [], photos: [], live: [], discussions: [], posts: [] });
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [semantic, setSemantic] = useState<AzureSearchResult[]>([]);
  const [loading, setLoading] = useState(true);
  const request = useRef(0);
  useEffect(() => {
    let alive = true;
    Promise.all([fetchAllPublicAlbums().catch(() => []), fetchAllVideos().catch(() => []), fetchGames().catch(() => []), fetchAllPublicWorlds().catch(() => []), fetchGlobalApps().catch(() => []), fetchGlobalPhotos().catch(() => []), fetchDiscussionPosts(undefined, 'hot').catch(() => [])]).then(([albums, videos, games, worlds, apps, photos, discussions]) => { if (alive) setCatalogs(current => ({ ...current, albums, videos, games, worlds, apps, photos, discussions })); }).finally(() => alive && setLoading(false));
    const unsubs = [listenToGlobalArticles(rows => setCatalogs(current => ({ ...current, articles: rows }))), fetchAllLiveFeeds(rows => setCatalogs(current => ({ ...current, live: rows }))), listenToGlobalPosts(rows => setCatalogs(current => ({ ...current, posts: rows.filter(post => post.isPublic !== false && !post.isToday) })))];
    return () => { alive = false; unsubs.forEach(unsub => typeof unsub === 'function' && unsub()); };
  }, []);
  useEffect(() => {
    const q = normalizePublicSearchQuery(query); const id = ++request.current;
    if (q.length < 2) { setUsers([]); setSemantic([]); return; }
    const timer = setTimeout(async () => {
      const [people, semanticRows] = await Promise.all([searchUsers(q).catch(() => []), semanticSearch(q).catch(() => [])]);
      if (id !== request.current) return;
      setUsers(people.filter(user => !(user as any).isChild && user.accountType !== 'CHILD'));
      setSemantic(semanticRows || []);
    }, 220);
    return () => clearTimeout(timer);
  }, [query]);
  const results = useMemo(() => {
    const q = normalizePublicSearchQuery(query); if (q.length < 2) return [] as UniversalPlatformResult[];
    const rows: UniversalPlatformResult[] = [];
    const add = (type: UniversalResultType, raw: any, id: string, title: string, subtitle: string | undefined, thumbnail: string | undefined, fields: Array<string | undefined>, bonus = 0) => { const score = maxPublicSearchScore(fields, q); if (score > 0) rows.push({ type, raw, id, title, subtitle, thumbnail, _score: score + bonus }); };
    users.forEach(user => add('USER', user, user.uid, user.displayName || 'Plajah user', (user as any).isArtist ? 'Artist' : 'Person', user.photoURL, [user.displayName, (user as any).username, (user as any).bio, (user as any).genre]));
    catalogs.albums.forEach(album => { const type = albumType(album); add(type, album, album.id, album.title, (album as any).artist || album.genre, (album as any).coverImage || (album as any).coverUrl, [album.title, (album as any).artist, album.genre, album.description, ...((album as any).tags || [])]); (album.tracks || []).forEach(track => add('MUSIC', album, `${album.id}:${track.id}`, track.title, `${(track as any).artist || (album as any).artist || 'Music'} · ${album.title}`, (album as any).coverImage || (album as any).coverUrl, [track.title, (track as any).artist, album.title, album.genre], .15)); });
    catalogs.videos.forEach(video => { const category = String((video as any).category || '').toUpperCase(); add(category === 'MOVIE' ? 'MOVIE' : category === 'TV_EPISODE' ? 'TV' : 'VIDEO', video, video.id, video.title, (video as any).artist || video.genre, video.thumbnailUrl, [video.title, (video as any).artist, video.genre, video.description, ...((video as any).tags || [])]); });
    catalogs.articles.forEach(article => add('ARTICLE', article, article.id, article.title, article.authorName, article.coverImage, [article.title, article.subtitle, article.authorName, article.category, ...(article.tags || [])]));
    catalogs.games.forEach(game => add('GAME', game, game.id, game.title, 'Game', game.thumbnailUrl, [game.title, game.description, ...(game.tags || [])]));
    catalogs.worlds.forEach(world => add('WORLD', world, world.id, world.name, world.worldType, world.coverImage, [world.name, world.description]));
    catalogs.apps.forEach(app => add('APP', app, app.id, app.title, app.category, app.thumbnailUrl, [app.title, app.description, app.category]));
    catalogs.photos.forEach(photo => add('PHOTO', photo, photo.id, photo.title || 'Photo', 'Photo', photo.url, [photo.title, photo.description, ...(photo.tags || [])]));
    catalogs.live.forEach(feed => add('LIVE', feed, feed.id, feed.title, feed.status === 'LIVE' ? 'Live now' : 'Stream', feed.thumbnailUrl, [feed.title, feed.genre, feed.subject, ...(feed.tags || [])]));
    catalogs.discussions.forEach(post => add('DISCUSSION', post, post.id, post.title || 'Discussion post', post.displayName, undefined, [post.title, post.body, post.displayName]));
    catalogs.posts.forEach(post => { const mediaTitles = (post.media || []).map(media => media.title || media.linkPreview?.title || ''); add('POST', post, post.id, post.text.trim().slice(0, 90) || mediaTitles.find(Boolean) || 'Public post', post.authorName, post.contentLabels?.length ? undefined : post.media?.find(media => media.thumbnail)?.thumbnail || post.media?.find(media => media.type === 'PHOTO')?.url, [post.text, post.authorName, ...(post.tags || []), ...mediaTitles]); });
    semantic.forEach(item => { const type: UniversalResultType = item.type === 'BOOK' ? 'BOOK' : item.type === 'ALBUM' ? 'MUSIC' : item.type === 'VIDEO' ? 'VIDEO' : 'ARTICLE'; if (!rows.some(row => row.id === item.id && row.type === type)) rows.push({ id: item.id, title: item.title || item.id, subtitle: item.snippet, type, raw: item, _score: item.score || .5 }); });
    return diversifyPublicSearchResults(rows, ORDER, 20, 4);
  }, [query, catalogs, users, semantic]);
  return { results, loading: loading && normalizePublicSearchQuery(query).length >= 2 };
}
