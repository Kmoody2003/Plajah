import React, { useEffect, useState } from 'react';
import { collection, documentId, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../services/firebase';
import type { AvatarConfig } from '../../types';
import { CharacterAvatarFlip } from './CharacterAvatarFlip';

/**
 * A user's profile picture, anywhere on the platform. When the user picked a movie character
 * as their avatar (avatar.type === 'CHARACTER', isActive), it renders CharacterAvatarFlip so the
 * photo and the character portrait trade places with Miriam's green lightning; otherwise it is
 * the same plain <img> the call site used to render, with the same classes.
 *
 * Avatar lookups are cached per uid for the session. Avatars requested in the same tick are
 * fetched together (one `documentId() in [...]` query per 30 uids), so a feed or chat list costs
 * a handful of reads, and there is no listener per avatar.
 */

type CachedAvatar = { characterUrl: string | null };

const cache = new Map<string, CachedAvatar>();
const listeners = new Map<string, Set<() => void>>();
const queued = new Set<string>();
let flushTimer: number | null = null;

const characterUrlOf = (avatar?: AvatarConfig | null): string | null =>
  avatar && avatar.isActive && avatar.type === 'CHARACTER' && avatar.thumbnailUrl ? avatar.thumbnailUrl : null;

const notify = (uid: string) => listeners.get(uid)?.forEach((fn) => fn());

/** Seed or refresh the cache when a user doc is already in hand (e.g. after saving in the avatar studio). */
export function setCachedUserAvatar(uid: string, avatar?: AvatarConfig | null): void {
  if (!uid) return;
  const next = { characterUrl: characterUrlOf(avatar) };
  const prev = cache.get(uid);
  cache.set(uid, next);
  if (!prev || prev.characterUrl !== next.characterUrl) notify(uid);
}

async function flush(): Promise<void> {
  flushTimer = null;
  const uids = [...queued];
  queued.clear();
  for (let i = 0; i < uids.length; i += 30) {
    const chunk = uids.slice(i, i + 30);
    try {
      const snap = await getDocs(query(collection(db, 'users'), where(documentId(), 'in', chunk)));
      const found = new Set<string>();
      snap.forEach((d) => {
        found.add(d.id);
        setCachedUserAvatar(d.id, (d.data() as { avatar?: AvatarConfig }).avatar);
      });
      chunk.forEach((uid) => !found.has(uid) && setCachedUserAvatar(uid, null));
    } catch {
      // Offline / denied: treat as "no character" for this session rather than retrying per render.
      chunk.forEach((uid) => !cache.has(uid) && setCachedUserAvatar(uid, null));
    }
  }
}

function request(uid: string): void {
  if (cache.has(uid) || queued.has(uid)) return;
  queued.add(uid);
  if (flushTimer == null) flushTimer = window.setTimeout(flush, 0);
}

/** The character portrait URL for a user with an active movie-character avatar, else null. */
export function useCharacterAvatarUrl(uid?: string | null): string | null {
  const [url, setUrl] = useState<string | null>(() => (uid ? cache.get(uid)?.characterUrl ?? null : null));
  useEffect(() => {
    if (!uid) {
      setUrl(null);
      return;
    }
    const update = () => setUrl(cache.get(uid)?.characterUrl ?? null);
    let set = listeners.get(uid);
    if (!set) listeners.set(uid, (set = new Set()));
    set.add(update);
    update();
    request(uid);
    return () => {
      set!.delete(update);
    };
  }, [uid]);
  return url;
}

export interface UserAvatarProps extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src'> {
  /** Whose avatar this is. Without a uid it is always the plain photo. */
  uid?: string | null;
  src?: string | null;
  /** Rendered instead of the <img> when there is no photo and no character. */
  fallback?: React.ReactNode;
}

const HAS_DISPLAY = /(^|\s)(block|inline-block|inline-flex|flex|grid|hidden|contents)(\s|$)/;

export const UserAvatar: React.FC<UserAvatarProps> = ({ uid, src, fallback, className = '', alt = '', ...imgProps }) => {
  const characterUrl = useCharacterAvatarUrl(uid);
  if (characterUrl) {
    // The call site's classes/style go on an outer box (so `absolute`, borders, sizes and click
    // handlers behave exactly as they did on the <img>); the flip fills it.
    const { style, onClick, title } = imgProps;
    const display = HAS_DISPLAY.test(className) ? '' : ' inline-block';
    return (
      <span className={`${className}${display} overflow-hidden`} style={style} onClick={onClick as any} title={title}>
        <CharacterAvatarFlip
          photoUrl={src || null}
          characterUrl={characterUrl}
          alt={alt}
          className="w-full h-full"
          fallback={fallback}
        />
      </span>
    );
  }
  if (!src && fallback !== undefined) return <>{fallback}</>;
  return <img {...imgProps} src={src || undefined} alt={alt} className={className} />;
};

export default UserAvatar;
