// Browser → server nudge after a post is created or deleted, so the open networks hear about it:
// ActivityPub followers (@handle@plajah.com) and Nostr auto-publish. Posts are written to Firestore by the
// browser, so the server never sees them being made; this one call is how it finds out.
//
// Fire-and-forget: a failure here never affects the post. The server re-reads the post and decides everything
// itself (author, federation switch, audience/paywall rules), so nothing the browser sends is trusted.
// Server: POST /api/federate/post/:postId in server.ts.

import { auth } from '../firebase';

export function announcePost(postId: string, event: 'create' | 'delete'): void {
  const user = auth.currentUser;
  if (!user || !postId) return;
  void user.getIdToken()
    .then(token => fetch(`/api/federate/post/${encodeURIComponent(postId)}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ event }),
      keepalive: true,
    }))
    .catch(() => {});
}
