// "Followable from anywhere" card: shows your @handle@plajah.com, the on/off switch and how many people on
// Mastodon/Threads/Pixelfed/etc. follow you. Talks to /api/activitypub/me (routes/activitypub.ts).
// Pass `orgId` to manage an organization's identity instead of your own (owner/admin only).

import React, { useCallback, useEffect, useState } from 'react';
import { Globe, Copy, Check, Loader2 } from 'lucide-react';
import { auth } from '../../services/firebase';

interface Status {
  eligible: boolean;
  reason?: string;
  enabled: boolean;
  handle: string | null;
  address: string | null;
  suggestedHandle: string | null;
  handleLocked: boolean;
  followerCount: number;
  notice?: string;
  deletionNotice: string;
}

async function call(method: 'GET' | 'POST', orgId?: string, body?: Record<string, unknown>): Promise<Status> {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error('Sign in first.');
  const qs = method === 'GET' && orgId ? `?org=${encodeURIComponent(orgId)}` : '';
  const res = await fetch(`/api/activitypub/me${qs}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify({ ...body, ...(orgId ? { org: orgId } : {}) }) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || 'Something went wrong.');
  return json as Status;
}

export default function FediverseIdentityCard({ orgId, className = '' }: { orgId?: string; className?: string }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [handle, setHandle] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const s = await call('GET', orgId);
      setStatus(s);
      setHandle(s.handle ?? s.suggestedHandle ?? '');
    } catch (e: any) { setError(e.message); }
  }, [orgId]);

  useEffect(() => { void load(); }, [load]);

  const toggle = async () => {
    if (!status) return;
    setBusy(true); setError(null);
    try {
      const s = await call('POST', orgId, { enabled: !status.enabled, ...(!status.handleLocked ? { handle } : {}) });
      setStatus(s);
    } catch (e: any) { setError(e.message); }
    finally { setBusy(false); }
  };

  const copy = async () => {
    if (!status?.address) return;
    try { await navigator.clipboard.writeText(status.address); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard blocked */ }
  };

  const host = typeof window !== 'undefined' ? window.location.host : 'plajah.com';

  return (
    <section className={`rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white ${className}`} aria-label="Fediverse identity">
      <div className="flex items-start gap-3">
        <Globe className="mt-0.5 h-5 w-5 shrink-0 text-violet-300" aria-hidden />
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold">Followable from other networks</h3>
          <p className="mt-0.5 text-white/60">People on Mastodon, Threads, Pixelfed and other fediverse apps can follow {orgId ? 'this organization' : 'you'} and reply to public posts.</p>
        </div>
        {status?.eligible && (
          <button
            type="button" role="switch" aria-checked={status.enabled} disabled={busy}
            onClick={toggle}
            className={`relative h-6 w-11 shrink-0 rounded-full transition ${status.enabled ? 'bg-violet-500' : 'bg-white/20'} disabled:opacity-60`}
          >
            <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${status.enabled ? 'left-[22px]' : 'left-0.5'}`} />
            <span className="sr-only">{status.enabled ? 'Turn off' : 'Turn on'}</span>
          </button>
        )}
      </div>

      {!status && !error && <div className="mt-3 flex items-center gap-2 text-white/60"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>}

      {status && !status.eligible && <p className="mt-3 rounded-lg bg-white/5 p-3 text-white/70">{status.reason}</p>}

      {status?.eligible && (
        <div className="mt-3 space-y-3">
          {status.handleLocked ? (
            <div className="flex items-center gap-2">
              <code className="truncate rounded-lg bg-black/30 px-2 py-1">{status.address}</code>
              <button type="button" onClick={copy} className="rounded-lg p-1.5 hover:bg-white/10" aria-label="Copy address">
                {copied ? <Check className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>
          ) : (
            <label className="block">
              <span className="text-white/60">Choose your handle (it can't be changed later)</span>
              <div className="mt-1 flex items-center rounded-lg bg-black/30 px-2">
                <span className="text-white/50">@</span>
                <input
                  value={handle} onChange={e => setHandle(e.target.value.toLowerCase())} maxLength={64}
                  className="min-w-0 flex-1 bg-transparent px-1 py-1.5 outline-none" aria-label="Handle" spellCheck={false} autoCapitalize="none"
                />
                <span className="text-white/50">@{host}</span>
              </div>
            </label>
          )}
          {status.enabled && <p className="text-white/70">{status.followerCount.toLocaleString()} {status.followerCount === 1 ? 'follower' : 'followers'} on other networks</p>}
          {status.notice && <p className="text-amber-200/90">{status.notice}</p>}
          <p className="text-white/50">Only public posts are shared — private, members-only, locked and paid posts stay on Plajah. {status.deletionNotice}</p>
        </div>
      )}

      {error && <p className="mt-3 text-red-300" role="alert">{error}</p>}
    </section>
  );
}
