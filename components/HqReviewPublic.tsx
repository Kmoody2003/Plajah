import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Clock, Download, Loader2, MessageSquare, Send, ShieldCheck, ThumbsDown } from 'lucide-react';

// ── Content HQ · account-free external reviewer page ──────────────────────────
// Rendered standalone from index.tsx (before the app/auth tree) for `/review/:shareId?t=<token>`.
// No Plajah account, no login. Everything is fetched from and written through the tokenized
// share endpoints in server.ts, which re-validate the link on every call. The visitor never
// sees the protected storage path — media streams via the tokenized /download URL.

interface ReviewComment {
  id: string; authorName: string; authorKind?: 'MEMBER' | 'GUEST';
  body: string; timeStartSeconds?: number; resolved?: boolean; createdAt: number;
}
interface ReviewContext {
  asset: { id: string; title: string; kind: string; status: string; versionCount: number };
  currentVersion: { id: string; version: number; name: string; mimeType: string; sizeBytes: number; createdAt: number } | null;
  versions: { id: string; version: number; name: string; mimeType: string; createdAt: number }[];
  comments: ReviewComment[];
  flags: { allowComments: boolean; allowApproval: boolean; allowDownload: boolean; requireEmail: boolean };
  label: string;
  decision: { decision: 'APPROVED' | 'CHANGES_REQUESTED'; note?: string; guestName: string; createdAt: number } | null;
}

const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const kindOf = (kind: string, mime: string) => {
  if (kind === 'image' || kind === 'video' || kind === 'audio') return kind;
  if (mime === 'application/pdf' || kind === 'pdf') return 'pdf';
  if (mime?.startsWith('image/')) return 'image';
  if (mime?.startsWith('video/')) return 'video';
  if (mime?.startsWith('audio/')) return 'audio';
  return 'file';
};

const HqReviewPublic: React.FC<{ shareId: string; token: string }> = ({ shareId, token }) => {
  const base = `/api/hq/share/${encodeURIComponent(shareId)}/${encodeURIComponent(token)}`;
  const [ctx, setCtx] = useState<ReviewContext | null>(null);
  const [loadErr, setLoadErr] = useState('');
  const [loading, setLoading] = useState(true);

  const [guestName, setGuestName] = useState(() => { try { return localStorage.getItem('hqGuestName') || ''; } catch { return ''; } });
  const [guestEmail, setGuestEmail] = useState(() => { try { return localStorage.getItem('hqGuestEmail') || ''; } catch { return ''; } });

  const [comment, setComment] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionErr, setActionErr] = useState('');
  const media = useRef<HTMLVideoElement | HTMLAudioElement>(null);

  const load = useCallback(async () => {
    setLoading(true); setLoadErr('');
    try {
      const res = await fetch(base);
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.error || 'This review link is no longer available.'); }
      setCtx(await res.json());
    } catch (e: any) { setLoadErr(e?.message || 'This review link is no longer available.'); }
    finally { setLoading(false); }
  }, [base]);
  useEffect(() => { load(); }, [load]);

  const rememberGuest = () => {
    try { localStorage.setItem('hqGuestName', guestName.trim()); if (guestEmail.trim()) localStorage.setItem('hqGuestEmail', guestEmail.trim()); } catch { /* ignore */ }
  };
  const identityReady = guestName.trim().length > 0 && (!ctx?.flags.requireEmail || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestEmail.trim()));

  const mediaKind = ctx?.currentVersion ? kindOf(ctx.asset.kind, ctx.currentVersion.mimeType) : kindOf(ctx?.asset.kind || 'file', '');
  const currentTimeMs = () => Math.round((media.current?.currentTime || 0) * 1000);

  async function post(path: string, payload: Record<string, any>): Promise<any> {
    const res = await fetch(`${base}/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, guestName: guestName.trim(), guestEmail: guestEmail.trim() || undefined }) });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(j.error || 'That could not be completed.');
    return j;
  }

  async function submitComment() {
    if (!comment.trim() || !identityReady) return;
    setBusy(true); setActionErr('');
    try {
      const j = await post('comment', { body: comment.trim(),
        timecodeMs: ['video', 'audio'].includes(mediaKind) ? currentTimeMs() : undefined });
      rememberGuest();
      setCtx(c => c ? { ...c, comments: [...c.comments, j.comment] } : c);
      setComment('');
    } catch (e: any) { setActionErr(e?.message || 'Comment failed.'); } finally { setBusy(false); }
  }

  async function decide(decision: 'APPROVED' | 'CHANGES_REQUESTED') {
    if (!identityReady) { setActionErr('Add your name first.'); return; }
    setBusy(true); setActionErr('');
    try {
      await post('decision', { decision, note: note.trim() || undefined });
      rememberGuest();
      setCtx(c => c ? { ...c, asset: { ...c.asset, status: decision },
        decision: { decision, note: note.trim(), guestName: guestName.trim(), createdAt: Date.now() } } : c);
      setNote('');
    } catch (e: any) { setActionErr(e?.message || 'Could not record your decision.'); } finally { setBusy(false); }
  }

  const downloadUrl = `${base}/download`;

  if (loading) return <Shell><div className="grid place-items-center py-24"><Loader2 className="animate-spin motion-reduce:animate-none" style={{ color: 'var(--pj-orange)' }} /></div></Shell>;
  if (loadErr || !ctx) return <Shell><div className="max-w-md mx-auto text-center py-24 px-6">
    <ShieldCheck size={40} className="mx-auto mb-4 opacity-40" />
    <h1 className="text-xl font-black mb-2">Review link unavailable</h1>
    <p className="text-sm opacity-60">{loadErr || 'This link has expired, been revoked, or is invalid.'}</p>
  </div></Shell>;

  const { asset, flags, comments } = ctx;
  const decided = ctx.decision;

  return <Shell>
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 w-full">
      <header className="flex items-start gap-3 mb-5">
        <div className="min-w-0 flex-1">
          <div className="text-[10px] uppercase tracking-widest opacity-40">Review · {asset.status.replace('_', ' ')} · v{asset.versionCount}</div>
          <h1 className="font-black text-2xl truncate">{asset.title}</h1>
          {ctx.label && <div className="text-xs opacity-50 mt-0.5">{ctx.label}</div>}
        </div>
        {flags.allowDownload && <a href={downloadUrl} className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-full text-[11px] font-bold"
          style={{ background: 'var(--pj-glass-2)', border: '1px solid var(--pj-border)' }}><Download size={14} /> Download</a>}
      </header>

      <div className="grid lg:grid-cols-[1fr_360px] gap-5 items-start">
        {/* Preview */}
        <div className="rounded-2xl overflow-hidden grid place-items-center min-h-[240px]" style={{ background: '#000', border: '1px solid var(--pj-border)' }}>
          {mediaKind === 'image' && <img src={downloadUrl} alt={asset.title} className="max-w-full max-h-[70vh] object-contain" />}
          {mediaKind === 'video' && <video ref={media as any} src={downloadUrl} controls playsInline className="w-full max-h-[70vh]" />}
          {mediaKind === 'audio' && <div className="w-full p-8"><audio ref={media as any} src={downloadUrl} controls className="w-full" /></div>}
          {mediaKind === 'pdf' && <iframe src={downloadUrl} title={asset.title} className="w-full h-[70vh]" style={{ background: '#fff' }} />}
          {mediaKind === 'file' && <a href={downloadUrl} className="p-8 text-sm underline opacity-80">Open file</a>}
        </div>

        {/* Side panel: identity + decision + comments */}
        <div className="space-y-4 min-w-0">
          {/* Guest identity */}
          <div className="rounded-2xl p-4 space-y-2" style={{ background: 'var(--pj-glass-1)', border: '1px solid var(--pj-border)' }}>
            <div className="text-[10px] font-black uppercase tracking-widest opacity-50">You are reviewing as</div>
            <input value={guestName} onChange={e => setGuestName(e.target.value)} placeholder="Your name" maxLength={120}
              className="w-full rounded-xl px-3 py-2 text-sm outline-none" style={{ background: 'var(--pj-glass-2)', border: '1px solid var(--pj-border)' }} />
            {flags.requireEmail && <input value={guestEmail} onChange={e => setGuestEmail(e.target.value)} placeholder="Your email (required)" type="email" maxLength={200}
              className="w-full rounded-xl px-3 py-2 text-sm outline-none" style={{ background: 'var(--pj-glass-2)', border: '1px solid var(--pj-border)' }} />}
          </div>

          {/* Decision bar */}
          {flags.allowApproval && <div className="rounded-2xl p-4 space-y-3" style={{ background: 'var(--pj-glass-1)', border: '1px solid var(--pj-border)' }}>
            <div className="text-[10px] font-black uppercase tracking-widest opacity-50">Your decision</div>
            {decided ? <div className="rounded-xl px-3 py-2 text-sm font-bold"
              style={{ background: decided.decision === 'APPROVED' ? 'var(--pj-success-soft)' : 'var(--pj-warning-soft)' }}>
              {decided.decision === 'APPROVED' ? 'You approved this.' : 'You requested changes.'}
              {decided.note && <div className="text-xs font-normal opacity-70 mt-1">{decided.note}</div>}
            </div> : <>
              <textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Optional note…" rows={2} maxLength={2000}
                className="w-full rounded-xl px-3 py-2 text-sm outline-none resize-none" style={{ background: 'var(--pj-glass-2)', border: '1px solid var(--pj-border)' }} />
              <div className="flex gap-2">
                <button disabled={busy || !identityReady} onClick={() => decide('APPROVED')}
                  className="flex-1 py-2.5 rounded-xl text-black text-xs font-black disabled:opacity-40 inline-flex items-center justify-center gap-1.5"
                  style={{ background: 'var(--pj-success)' }}><Check size={14} /> Approve</button>
                <button disabled={busy || !identityReady} onClick={() => decide('CHANGES_REQUESTED')}
                  className="flex-1 py-2.5 rounded-xl text-black text-xs font-black disabled:opacity-40 inline-flex items-center justify-center gap-1.5"
                  style={{ background: 'var(--pj-warning)' }}><ThumbsDown size={14} /> Request changes</button>
              </div>
            </>}
          </div>}

          {/* Comments */}
          <div className="rounded-2xl p-4 space-y-3" style={{ background: 'var(--pj-glass-1)', border: '1px solid var(--pj-border)' }}>
            <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest opacity-50"><MessageSquare size={12} /> Comments</div>
            <div className="space-y-2 max-h-[46vh] overflow-y-auto">
              {comments.length === 0 && <p className="text-xs opacity-40 py-2">No comments yet.</p>}
              {comments.map(c => <div key={c.id} className={`rounded-xl p-3 ${c.resolved ? 'opacity-45' : ''}`} style={{ background: 'var(--pj-glass-2)' }}>
                <div className="flex items-center gap-2 text-[11px]">
                  <strong className="truncate">{c.authorName}</strong>
                  {c.authorKind === 'GUEST' && <span className="text-[9px] uppercase tracking-wide px-1.5 py-0.5 rounded-full" style={{ background: 'var(--pj-glass-3)' }}>Guest</span>}
                  {c.timeStartSeconds !== undefined && <button onClick={() => { if (media.current) { media.current.currentTime = c.timeStartSeconds!; media.current.play?.(); } }}
                    className="font-bold" style={{ color: 'var(--pj-orange)' }}>{fmtTime(c.timeStartSeconds)}</button>}
                  <span className="ml-auto opacity-30">{new Date(c.createdAt).toLocaleDateString()}</span>
                </div>
                <p className="text-sm mt-1 opacity-85 break-words">{c.body}</p>
              </div>)}
            </div>
            {flags.allowComments ? <div className="flex gap-2 pt-1">
              <input value={comment} onChange={e => setComment(e.target.value)} onKeyDown={e => e.key === 'Enter' && submitComment()}
                placeholder={identityReady ? (['video', 'audio'].includes(mediaKind) ? 'Comment at current time…' : 'Leave feedback…') : 'Add your name above first'}
                disabled={!identityReady} maxLength={4000}
                className="flex-1 rounded-xl px-3 py-2 text-sm outline-none disabled:opacity-50" style={{ background: 'var(--pj-glass-2)', border: '1px solid var(--pj-border)' }} />
              <button disabled={busy || !identityReady || !comment.trim()} onClick={submitComment}
                className="p-3 rounded-xl text-black disabled:opacity-40" style={{ background: 'var(--pj-orange)' }}><Send size={15} /></button>
            </div> : <p className="text-[11px] opacity-40">Comments are turned off for this link.</p>}
            {actionErr && <p className="text-xs" style={{ color: 'var(--pj-danger)' }}>{actionErr}</p>}
          </div>

          <p className="flex items-center gap-1.5 text-[10px] opacity-35"><Clock size={11} /> Reviewing on Plajah · no account needed</p>
        </div>
      </div>
    </div>
  </Shell>;
};

const Shell: React.FC<{ children: React.ReactNode }> = ({ children }) => <div
  className="min-h-real-screen w-full overflow-x-hidden"
  style={{ background: 'var(--pj-bg, #0b0b10)', color: 'var(--pj-text, #fff)' }}
>{children}</div>;

export default HqReviewPublic;
