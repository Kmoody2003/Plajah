import React, { useEffect, useState } from 'react';
import { collection, documentId, getDocs, query, where, doc, getDoc } from 'firebase/firestore';
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
 *
 * The same read also gives the user's profile photo. A call site with a uid but no photo of its
 * own (a video card whose doc never stored the owner's picture) shows that real photo, never a
 * stand-in image.
 */

type CachedAvatar = { characterUrl: string | null; photoUrl: string | null };
type UserDocLite = { avatar?: AvatarConfig; photoURL?: string; customPhotoURL?: string };
const photoOf = (d?: UserDocLite | null): string | null => d?.customPhotoURL || d?.photoURL || null;

const cache = new Map<string, CachedAvatar>();
const listeners = new Map<string, Set<() => void>>();
const queued = new Set<string>();
let flushTimer: number | null = null;

const characterUrlOf = (avatar?: AvatarConfig | null): string | null =>
  avatar && avatar.isActive && avatar.type === 'CHARACTER' && avatar.thumbnailUrl ? avatar.thumbnailUrl : null;

const notify = (uid: string) => listeners.get(uid)?.forEach((fn) => fn());

/** Seed or refresh the cache when a user doc is already in hand (e.g. after saving in the avatar studio).
 *  `photoUrl` undefined keeps the photo already cached. */
export function setCachedUserAvatar(uid: string, avatar?: AvatarConfig | null, photoUrl?: string | null): void {
  if (!uid) return;
  const prev = cache.get(uid);
  const next = { characterUrl: characterUrlOf(avatar), photoUrl: photoUrl === undefined ? prev?.photoUrl ?? null : photoUrl };
  cache.set(uid, next);
  if (!prev || prev.characterUrl !== next.characterUrl || prev.photoUrl !== next.photoUrl) notify(uid);
}

async function flush(): Promise<void> {
  flushTimer = null;
  const uids = [...queued];
  queued.clear();
  for (let i = 0; i < uids.length; i += 30) {
    const chunk = uids.slice(i, i + 30);
    try {
      const snap = await getDocs(query(collection(db, 'users'), where('listable', '==', true), where(documentId(), 'in', chunk)));
      const found = new Set<string>();
      snap.forEach((d) => {
        found.add(d.id);
        const data = d.data() as UserDocLite;
        setCachedUserAvatar(d.id, data.avatar, photoOf(data));
      });
      // Unlisted accounts (children) can't be listed but can be opened one by one.
      await Promise.all(chunk.filter((uid) => !found.has(uid)).map(async (uid) => {
        const one = await getDoc(doc(db, 'users', uid)).catch(() => null);
        const data = one?.data() as UserDocLite | undefined;
        setCachedUserAvatar(uid, data?.avatar ?? null, photoOf(data));
      }));
    } catch {
      // Offline / denied: treat as "no character" for this session rather than retrying per render.
      chunk.forEach((uid) => !cache.has(uid) && setCachedUserAvatar(uid, null, null));
    }
  }
}

function request(uid: string): void {
  if (cache.has(uid) || queued.has(uid)) return;
  queued.add(uid);
  if (flushTimer == null) flushTimer = window.setTimeout(flush, 0);
}

function useCached<K extends keyof CachedAvatar>(uid: string | null | undefined, key: K): CachedAvatar[K] | null {
  const [val, setVal] = useState<CachedAvatar[K] | null>(() => (uid ? cache.get(uid)?.[key] ?? null : null));
  useEffect(() => {
    if (!uid) {
      setVal(null);
      return;
    }
    const update = () => setVal(cache.get(uid)?.[key] ?? null);
    let set = listeners.get(uid);
    if (!set) listeners.set(uid, (set = new Set()));
    set.add(update);
    update();
    request(uid);
    return () => {
      set!.delete(update);
    };
  }, [uid, key]);
  return val;
}

/** The character portrait URL for a user with an active movie-character avatar, else null. */
export function useCharacterAvatarUrl(uid?: string | null): string | null {
  return useCached(uid, 'characterUrl');
}

/** The user's own profile photo (custom first), else null. */
export function useUserPhotoUrl(uid?: string | null): string | null {
  return useCached(uid, 'photoUrl');
}

export interface UserAvatarProps extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src'> {
  /** Whose avatar this is. Without a uid it is always the plain photo. */
  uid?: string | null;
  src?: string | null;
  /** Rendered instead of the <img> when there is no photo and no character. */
  fallback?: React.ReactNode;
}

const HAS_DISPLAY = /(^|\s)(block|inline-block|inline-flex|flex|grid|hidden|contents)(\s|$)/;

export const UserAvatar: React.FC<UserAvatarProps> = ({ uid, src: givenSrc, fallback, className = '', alt = '', ...imgProps }) => {
  const characterUrl = useCharacterAvatarUrl(uid);
  const cachedPhoto = useUserPhotoUrl(givenSrc ? null : uid);
  const src = givenSrc || cachedPhoto;
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
