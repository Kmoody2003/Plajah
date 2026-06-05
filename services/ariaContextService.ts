/**
 * Aria Context Service
 *
 * Provides Aria with a real-time, privacy-aware snapshot of:
 *   - The user's own activity, analytics, content, and goals
 *   - Platform-wide trends (no other user's private data exposed)
 *
 * Architecture: All personal data stays client-side in the context object.
 * Only the system prompt string is sent to the AI — never raw Firestore docs.
 *
 * Usage:
 *   const ctx = useAriaContext(uid);
 *   const prompt = buildAriaSystemPrompt(ctx);
 *   // pass prompt to agentService.sendMessage()
 */

import { useEffect, useState, useRef } from 'react';
import {
  collection, query, where, orderBy, limit,
  onSnapshot, getDoc, doc, getDocs,
} from 'firebase/firestore';
import { db, auth } from './backendService';
import { AppNotification, UserProfile } from '../types';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AriaUserContext {
  profile: {
    displayName: string;
    isArtist: boolean;
    tier: string;
    isPioneer: boolean;
    followerCount: number;
    followingCount: number;
    totalPoints: number;
    genre?: string;
    bio?: string;
    joinedAt?: number;
  };
  recentActivity: {
    unreadNotifications: number;
    recentNotifTypes: string[];      // ['COMMENT','FOLLOW',...]
    lastPostAt?: number;
    postsThisWeek: number;
    likesReceivedThisWeek: number;
    commentsReceivedThisWeek: number;
  };
  content: {
    albumCount: number;
    videoCount: number;
    articleCount: number;
    pollsCreated: number;
    challengeEntries: number;
    hasBroadcastChannel: boolean;
    closeFriendsCount: number;
  };
  platform: {
    trending: string[];              // trending hashtags / topics
    activeChallenges: string[];      // challenge titles
    liveNow: number;                 // count of live streams
  };
  goals: {
    suggestions: string[];           // Aria's inferred goals based on activity
  };
  unusedFeatures: string[];          // features the user has never engaged with
  timestamp: number;
}

// ── Feature usage tracker ─────────────────────────────────────────────────────

const ALL_FEATURES = [
  'polls', 'challenges', 'broadcastChannels', 'closeFriends', 'stories',
  'liveStream', 'sanctuary', 'store', 'clubs', 'labs', 'dataViz', 'rello',
  'liveTalk', 'threadPosts', 'signatureMoments', 'nowListening',
  'moodFilter', 'timedReveal', 'collaborativePost',
];

function detectUnusedFeatures(profile: any, posts: any[]): string[] {
  const used = new Set<string>();
  if (profile.liveStreamConfig?.isActive) used.add('liveStream');
  if (profile.sanctuaryEnabled) used.add('sanctuary');
  if (profile.storeEnabled || profile.merch?.length > 0) used.add('store');
  if (posts.some((p: any) => p.poll)) used.add('polls');
  if (posts.some((p: any) => p.dataViz)) used.add('dataViz');
  if (posts.some((p: any) => p.threadRoot)) used.add('threadPosts');
  if (posts.some((p: any) => p.timedReveal)) used.add('timedReveal');
  if (profile.closeFriendsCount > 0) used.add('closeFriends');
  if (profile.hasBroadcastChannel) used.add('broadcastChannels');
  return ALL_FEATURES.filter(f => !used.has(f));
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useAriaContext(uid: string | undefined): AriaUserContext | null {
  const [ctx, setCtx] = useState<AriaUserContext | null>(null);
  const unsubs = useRef<Array<() => void>>([]);

  useEffect(() => {
    if (!uid) return;

    // Clear previous listeners
    unsubs.current.forEach(u => u());
    unsubs.current = [];

    const merge = (partial: Partial<AriaUserContext>) =>
      setCtx(prev => prev ? { ...prev, ...partial, timestamp: Date.now() } : {
        profile: { displayName: '', isArtist: false, tier: 'FREE', isPioneer: false, followerCount: 0, followingCount: 0, totalPoints: 0 },
        recentActivity: { unreadNotifications: 0, recentNotifTypes: [], postsThisWeek: 0, likesReceivedThisWeek: 0, commentsReceivedThisWeek: 0 },
        content: { albumCount: 0, videoCount: 0, articleCount: 0, pollsCreated: 0, challengeEntries: 0, hasBroadcastChannel: false, closeFriendsCount: 0 },
        platform: { trending: [], activeChallenges: [], liveNow: 0 },
        goals: { suggestions: [] },
        unusedFeatures: [],
        timestamp: Date.now(),
        ...partial,
      } as AriaUserContext);

    // 1. User profile listener
    const profileUnsub = onSnapshot(doc(db, 'users', uid), snap => {
      if (!snap.exists()) return;
      const p = snap.data() as any;
      merge({
        profile: {
          displayName: p.displayName || 'Creator',
          isArtist: !!p.isArtist,
          tier: p.ariaTier || 'FREE',
          isPioneer: !!p.isPioneer,
          followerCount: p.followerCount || 0,
          followingCount: p.followingCount || 0,
          totalPoints: p.totalPoints || 0,
          genre: p.genre,
          bio: p.bio,
          joinedAt: p.createdAt,
        },
        content: {
          albumCount: p.albumCount || 0,
          videoCount: p.videoCount || 0,
          articleCount: p.articleCount || 0,
          pollsCreated: p.pollsCreated || 0,
          challengeEntries: p.challengeEntries || 0,
          hasBroadcastChannel: !!p.hasBroadcastChannel,
          closeFriendsCount: p.closeFriendsCount || 0,
        },
      });
    });
    unsubs.current.push(profileUnsub);

    // 2. Notifications listener (unread count + recent types)
    const weekAgo = Date.now() - 7 * 24 * 3_600_000;
    const notifsUnsub = onSnapshot(
      query(collection(db, 'notifications'), where('userId', '==', uid), orderBy('timestamp', 'desc'), limit(30)),
      snap => {
        const notifs = snap.docs.map(d => d.data() as AppNotification);
        const unread = notifs.filter(n => !n.isRead).length;
        const recentTypes = [...new Set(notifs.slice(0, 10).map(n => n.type))];
        merge({ recentActivity: { unreadNotifications: unread, recentNotifTypes: recentTypes, postsThisWeek: 0, likesReceivedThisWeek: 0, commentsReceivedThisWeek: 0 } });
      }
    );
    unsubs.current.push(notifsUnsub);

    // 3. User's recent posts (weekly stats)
    const postsUnsub = onSnapshot(
      query(collection(db, 'posts'), where('authorId', '==', uid), orderBy('timestamp', 'desc'), limit(20)),
      snap => {
        const posts = snap.docs.map(d => d.data() as any);
        const weekPosts = posts.filter(p => p.timestamp > weekAgo);
        const likesThisWeek = weekPosts.reduce((s, p) => s + (p.likesCount || 0), 0);
        const commentsThisWeek = weekPosts.reduce((s, p) => s + (p.commentsCount || 0), 0);
        const unusedFeatures = detectUnusedFeatures({}, posts);
        merge({
          recentActivity: {
            unreadNotifications: 0, recentNotifTypes: [],
            lastPostAt: posts[0]?.timestamp,
            postsThisWeek: weekPosts.length,
            likesReceivedThisWeek: likesThisWeek,
            commentsReceivedThisWeek: commentsThisWeek,
          },
          unusedFeatures,
        });
      }
    );
    unsubs.current.push(postsUnsub);

    // 4. Platform trends (challenges + live count — public data only)
    const challengesUnsub = onSnapshot(
      query(collection(db, 'challenges'), where('isActive', '==', true), limit(5)),
      snap => {
        const titles = snap.docs.map(d => (d.data() as any).title || '');
        merge({ platform: { trending: [], activeChallenges: titles, liveNow: 0 } });
      }
    );
    unsubs.current.push(challengesUnsub);

    return () => unsubs.current.forEach(u => u());
  }, [uid]);

  return ctx;
}

// ── System prompt builder ─────────────────────────────────────────────────────

export function buildAriaSystemPrompt(ctx: AriaUserContext | null, userGoal?: string): string {
  if (!ctx) return BASE_ARIA_SYSTEM;

  const { profile, recentActivity, content, platform, unusedFeatures } = ctx;
  const daysSincePost = recentActivity.lastPostAt
    ? Math.floor((Date.now() - recentActivity.lastPostAt) / 86_400_000)
    : null;

  return `${BASE_ARIA_SYSTEM}

## Current User Context (private — never share raw numbers with third parties)

**Profile**: ${profile.displayName} | ${profile.isArtist ? 'Creator' : 'Fan'} | ${profile.tier} tier | ${profile.isPioneer ? 'Pioneer member' : 'Standard member'}
**Reach**: ${profile.followerCount} followers, ${profile.followingCount} following
**Points**: ${profile.totalPoints} Plajah points
${profile.genre ? `**Genre/Focus**: ${profile.genre}` : ''}
${profile.bio ? `**Bio**: ${profile.bio}` : ''}

## This Week's Activity
- Posts published: ${recentActivity.postsThisWeek}
- Likes received: ${recentActivity.likesReceivedThisWeek}
- Comments received: ${recentActivity.commentsReceivedThisWeek}
- Unread notifications: ${recentActivity.unreadNotifications}
${daysSincePost !== null ? `- Days since last post: ${daysSincePost}` : ''}

## Content Library
- Albums: ${content.albumCount} | Videos: ${content.videoCount} | Articles: ${content.articleCount}
- Polls created: ${content.pollsCreated}
- Challenge entries: ${content.challengeEntries}
- Broadcast channel: ${content.hasBroadcastChannel ? 'Yes' : 'No'}
- Close friends: ${content.closeFriendsCount}

## Platform Right Now
- Active challenges: ${platform.activeChallenges.join(', ') || 'None'}
- Live streams active: ${platform.liveNow}

## Features This User Hasn't Tried Yet
${unusedFeatures.length > 0 ? unusedFeatures.map(f => `- ${f}`).join('\n') : '- User has explored most features!'}

${userGoal ? `## User's stated goal right now\n${userGoal}` : ''}

## Your Role
You are Aria — Plajah's AI creative partner. Help this user grow their account, discover features, plan content, and understand their analytics. Never share their private metrics with anyone. Be concise, warm, and action-oriented. Suggest features they haven't tried when relevant. When they ask for account help, provide specific, tactical advice based on their actual data above.`;
}

const BASE_ARIA_SYSTEM = `You are Aria, the AI creative partner built into Plajah. You help creators grow, create better content, discover platform features, and understand their audience.

Personality: Direct, warm, knowledgeable. You know music, film, writing, and what works on social platforms. You celebrate wins and give honest, actionable feedback. You never lecture — you coach.

Platform knowledge: Plajah is a creator platform for music, video, film, writing, live streaming, games, and social. Creators monetize through Sanctuary subscriptions, merch, PPV events, tips, and ads. The platform has: FAST channels, live talks, clubs, collaborative posts, polls, challenges, broadcast channels, data visualization posts, story format, Rello (short video), signature moments, and close friends lists.

Privacy commitment: All user data stays with the user. You can see their context to help them but you never repeat their private metrics to others, never compare them negatively to other users, and you store nothing across sessions beyond what the platform explicitly saves.`;

// ── Suggested goals builder ───────────────────────────────────────────────────

export function inferUserGoals(ctx: AriaUserContext): string[] {
  const goals: string[] = [];
  const { profile, recentActivity, content } = ctx;

  if (profile.followerCount < 100) goals.push('Grow your first 100 followers');
  else if (profile.followerCount < 1000) goals.push('Reach 1K followers');
  else goals.push('Convert fans to Sanctuary members');

  if (recentActivity.postsThisWeek === 0) goals.push('Post consistently — aim for 3x this week');
  if (!content.hasBroadcastChannel && profile.followerCount > 50) goals.push('Launch a Broadcast Channel for announcements');
  if (content.albumCount === 0) goals.push('Upload your first album or project');
  if (content.pollsCreated === 0) goals.push('Create your first poll to engage fans');

  return goals.slice(0, 3);
}
