/**
 * postingService — quote posts, plain reposts and post editing.
 *
 * Quote:   createQuotePost(source, text, extra?)   -> new post id
 * Repost:  repost(source) / undoRepost(source) / hasReposted(source)
 * Edit:    editPostText(post, newText)             (keeps last 5 revisions)
 *
 * Counters (quoteCount / repostCount) are bounded +/-1 client increments that
 * firestore.rules permits for any signed-in user (see the posts update rule).
 * All writes are undefined-stripped (Firestore throws on undefined).
 */
import { doc, getDoc, setDoc, updateDoc, deleteDoc, increment } from 'firebase/firestore';
import { db, auth } from './firebase';
import { createPost, createNotification } from './backendService';
import type { Post } from '../types';
import {
  buildQuoteSnapshot, resolveQuoteTarget, repostDocId, pushRevision, extractHashtags,
  composerPostExtras, stripUndefined, type ReplyAudience,
} from './postingLogic';
import { recordHashtags } from './hashtagService';

type SourcePost = Pick<Post, 'id' | 'authorId' | 'text'> & Partial<Post>;

export class PostingError extends Error {
  constructor(public code: 'SIGNED_OUT' | 'UNAVAILABLE' | 'PRIVATE', message: string) { super(message); }
}

function assertQuotable(src: SourcePost, uid: string) {
  if (src.isPublic === false && src.authorId !== uid) {
    throw new PostingError('PRIVATE', 'This post is private and can’t be shared.');
  }
}

function notifyAuthor(src: SourcePost, kind: 'quote' | 'repost') {
  const me = auth.currentUser;
  if (!me || src.authorId === me.uid) return;
  createNotification({
    userId: src.authorId,
    senderId: me.uid,
    senderName: me.displayName || 'Someone',
    senderPhoto: me.photoURL || '',
    type: 'CONTENT',
    title: kind === 'quote' ? 'Your post was quoted' : 'Your post was reposted',
    message: `${me.displayName || 'Someone'} ${kind === 'quote' ? 'quoted' : 'reposted'} your post`,
    link: 'FEED',
    targetId: src.id,
  })?.catch?.(() => {});
}

/**
 * Publish a quote post. `extra` can carry any other Post fields the caller
 * builds (media, labels, theme, replyAudience...). Returns the new post id.
 */
export async function createQuotePost(
  source: SourcePost,
  text: string,
  extra: Partial<Post> & { replyAudience?: ReplyAudience } = {},
): Promise<string | undefined> {
  const me = auth.currentUser;
  if (!me) throw new PostingError('SIGNED_OUT', 'Sign in to quote posts.');
  assertQuotable(source, me.uid);
  const fields = composerPostExtras({ text, replyAudience: extra.replyAudience, quoteOf: source as any });
  const id = await createPost(stripUndefined({ ...extra, ...fields, text }) as Partial<Post>);
  if (!id) return undefined;
  const target = resolveQuoteTarget(source as any);
  updateDoc(doc(db, 'posts', target.id), { quoteCount: increment(1) }).catch(() => {});
  if (fields.hashtags?.length) recordHashtags(fields.hashtags);
  notifyAuthor({ ...(source as any), id: target.id, authorId: target.authorId }, 'quote');
  return id;
}

/** Has the signed-in user already reposted this post? */
export async function hasReposted(source: Pick<Post, 'id'> & Partial<Post>): Promise<boolean> {
  const me = auth.currentUser;
  if (!me) return false;
  const target = resolveQuoteTarget(source as any);
  try { return (await getDoc(doc(db, 'posts', repostDocId(me.uid, target.id)))).exists(); } catch { return false; }
}

/**
 * One-tap repost. De-duped per user: the doc id is deterministic, so a second
 * call is an idempotent overwrite and the counter only moves on first create.
 * Returns true if a NEW repost was created.
 */
export async function repost(source: SourcePost): Promise<boolean> {
  const me = auth.currentUser;
  if (!me) throw new PostingError('SIGNED_OUT', 'Sign in to repost.');
  const target = resolveQuoteTarget(source as any);
  assertQuotable(source, me.uid);
  if (target.authorId === me.uid) throw new PostingError('UNAVAILABLE', 'You can’t repost your own post.');
  const ref = doc(db, 'posts', repostDocId(me.uid, target.id));
  const existing = await getDoc(ref);
  if (existing.exists()) return false;
  const snap = buildQuoteSnapshot(target);
  await setDoc(ref, stripUndefined({
    authorId: me.uid,
    authorName: me.displayName || 'Anonymous',
    authorPhoto: me.photoURL || '',
    text: '',
    timestamp: Date.now(),
    likesCount: 0,
    commentsCount: 0,
    isPublic: true,
    repostOf: target.id,
    quotedPostId: target.id,
    quotedPost: snap,
    targetUserId: null,
    targetUserName: null,
  }));
  updateDoc(doc(db, 'posts', target.id), { repostCount: increment(1) }).catch(() => {});
  notifyAuthor({ ...(source as any), id: target.id, authorId: target.authorId }, 'repost');
  return true;
}

/** Undo a repost (the "Undo" toast). No-op if there is none. */
export async function undoRepost(source: Pick<Post, 'id'> & Partial<Post>): Promise<boolean> {
  const me = auth.currentUser;
  if (!me) return false;
  const target = resolveQuoteTarget(source as any);
  const ref = doc(db, 'posts', repostDocId(me.uid, target.id));
  const existing = await getDoc(ref);
  if (!existing.exists()) return false;
  await deleteDoc(ref);
  updateDoc(doc(db, 'posts', target.id), { repostCount: increment(-1) }).catch(() => {});
  return true;
}

/**
 * Edit a post's text (author only — enforced by the posts update rule). The
 * replaced text is pushed to `editHistory` (newest last, capped at 5) and the
 * hashtags are re-derived. Returns the written fields.
 */
export async function editPostText(post: Pick<Post, 'id' | 'authorId' | 'text'> & Partial<Post>, newText: string) {
  const me = auth.currentUser;
  if (!me || me.uid !== post.authorId) throw new PostingError('SIGNED_OUT', 'Only the author can edit this post.');
  if (newText === post.text) return null;
  const now = Date.now();
  const tags = extractHashtags(newText);
  const patch = stripUndefined({
    text: newText,
    modifiedAt: now,
    editHistory: pushRevision(post.editHistory, post.text, now),
    hashtags: tags,
  });
  await updateDoc(doc(db, 'posts', post.id), patch);
  const fresh = tags.filter(t => !(post.hashtags || []).includes(t));
  if (fresh.length) recordHashtags(fresh);
  return patch;
}

/**
 * Single entry point for the composer's onPost: routes quote posts through
 * createQuotePost (counter + notification) and everything else through
 * createPost, adding hashtags / replyAudience / rollup bump. `base` is the
 * caller's existing Partial<Post> (text, media, labels, org fields...).
 * Returns the new post id.
 */
export async function publishComposerPost(
  data: { text: string; quoteOf?: SourcePost; replyAudience?: ReplyAudience },
  base: Partial<Post>,
): Promise<string | undefined> {
  if (data.quoteOf) {
    return createQuotePost(data.quoteOf, data.text, { ...base, replyAudience: data.replyAudience });
  }
  const fields = composerPostExtras({ text: data.text, replyAudience: data.replyAudience });
  const id = await createPost(stripUndefined({ ...base, ...fields, text: data.text }) as Partial<Post>);
  if (id && fields.hashtags?.length) recordHashtags(fields.hashtags);
  return id;
}
