// AmboShareDialog — share a saved template with people (they find it under
// "Shared with me"), or remove people it is shared with. Rendered in its own
// portal above the gallery; Escape closes only this dialog.
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Users, X, Search, Check, Copy, Loader2, Globe } from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { db, auth } from '../../services/backendService';
import { findPeople, saveTemplate, type SavedTemplate } from '../../services/ambo/templateLibrary';

const LILAC = '#D0BCFF', CYAN = '#00DAF3';
type Person = { uid: string; name: string; handle?: string; avatar?: string };

/** Names for uids already shared with (best-effort; uid shown when unreadable). Session cache. */
const nameCache = new Map<string, Person>();
async function personFor(uid: string): Promise<Person> {
  const hit = nameCache.get(uid); if (hit) return hit;
  try {
    const s = await getDoc(doc(db, 'users', uid));
    const u: any = s.exists() ? s.data() : null;
    const p = { uid, name: u?.displayName || u?.username || 'Plajah user', handle: u?.username || u?.handle, avatar: u?.photoURL || u?.avatarUrl };
    nameCache.set(uid, p); return p;
  } catch { return { uid, name: uid.slice(0, 8) + '…' }; }
}

/** Escape closes the top dialog only (capture phase beats the gallery's own Escape handler). */
export function useDialogEscape(open: boolean, onClose: () => void) {
  const ref = useRef(onClose); ref.current = onClose;
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopImmediatePropagation(); e.preventDefault(); ref.current(); } };
    window.addEventListener('keydown', h, true);
    return () => window.removeEventListener('keydown', h, true);
  }, [open]);
}

export const dialogShell: React.CSSProperties = { background: 'rgba(16,13,28,0.98)', border: '1px solid rgba(208,188,255,.22)', boxShadow: '0 24px 80px rgba(0,0,0,.6)' };

export const AmboShareDialog: React.FC<{ template: SavedTemplate | null; onClose: () => void; onSaved?: (t: SavedTemplate) => void; where?: string }> = ({ template, onClose, onSaved, where = 'Ambo → Slide Templates → Shared with me' }) => {
  const [term, setTerm] = useState('');
  const [results, setResults] = useState<Person[]>([]);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState<Person[]>([]);
  const [current, setCurrent] = useState<Person[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [copied, setCopied] = useState(false);
  const [rec, setRec] = useState<SavedTemplate | null>(template);
  const signedIn = !!auth.currentUser;
  useDialogEscape(!!template, onClose);

  useEffect(() => { setRec(template); setPicked([]); setTerm(''); setResults([]); setErr(''); }, [template?.id]);
  useEffect(() => {
    let alive = true;
    const uids = rec?.sharedWith || [];
    Promise.all(uids.map(personFor)).then(p => { if (alive) setCurrent(p); });
    return () => { alive = false; };
  }, [rec?.id, (rec?.sharedWith || []).join(',')]);

  // Debounced people search.
  useEffect(() => {
    if (!signedIn || !term.trim()) { setResults([]); setSearching(false); return; }
    setSearching(true);
    let alive = true;
    const id = window.setTimeout(() => {
      findPeople(term).then(r => { if (alive) { r.forEach(p => nameCache.set(p.uid, p)); setResults(r); } })
        .catch(e => { if (alive) setErr(`Search failed: ${e?.message || e}`); })
        .finally(() => { if (alive) setSearching(false); });
    }, 300);
    return () => { alive = false; window.clearTimeout(id); };
  }, [term, signedIn]);

  if (!template || !rec || typeof document === 'undefined') return null;
  const already = new Set([...(rec.sharedWith || []), ...picked.map(p => p.uid)]);
  const note = `I shared the template “${rec.name}” with you on Plajah — you'll find it under ${where}.`;

  const commit = async (sharedWith: string[], label: string) => {
    setBusy(true); setErr('');
    try {
      const visibility = rec.visibility === 'public' ? 'public' : sharedWith.length ? 'shared' : 'private';
      const next = await saveTemplate({ ...rec, sharedWith: Array.from(new Set(sharedWith)).filter(u => u && u !== rec.ownerUid), visibility });
      setRec(next); setPicked([]); onSaved?.(next);
      return next;
    } catch (e: any) {
      setErr(`${label} failed: ${e?.code === 'permission-denied' ? 'you can only share templates you own' : e?.message || e}`);
      return null;
    } finally { setBusy(false); }
  };

  return createPortal(
    <div className="fixed inset-0 z-[10060] flex items-center justify-center p-4" style={{ background: 'rgba(4,3,10,.55)' }} data-share-dialog
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-[min(460px,100%)] rounded-2xl text-white flex flex-col max-h-[86vh]" style={dialogShell}>
        <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10">
          <Users size={15} style={{ color: LILAC }} />
          <div className="min-w-0">
            <div className="text-[12.5px] font-extrabold truncate">Share “{rec.name}”</div>
            <div className="text-[9.5px] text-white/45">{rec.visibility === 'public' ? 'Also public in Community.' : 'Only the people below can see it.'}</div>
          </div>
          <button onClick={onClose} className="ml-auto w-7 h-7 grid place-items-center rounded-lg hover:bg-white/10" aria-label="Close"><X size={14} /></button>
        </div>
        <div className="p-4 space-y-3 overflow-y-auto">
          {!signedIn ? (
            <div className="text-[11px] text-white/60 rounded-lg p-3" style={{ background: 'rgba(255,255,255,.04)' }}>
              Sign in to share. Templates you save while signed out live only in this browser.
            </div>
          ) : (<>
            <label className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 bg-white/5 border border-white/10">
              <Search size={13} className="text-white/40" />
              <input autoFocus value={term} onChange={e => setTerm(e.target.value)} placeholder="Search people by name or @handle"
                className="flex-1 bg-transparent outline-none text-[12px] placeholder:text-white/30" data-share-search />
              {searching && <Loader2 size={13} className="animate-spin text-white/40" />}
            </label>
            {results.length > 0 && (
              <div className="rounded-lg border border-white/10 divide-y divide-white/5 max-h-44 overflow-y-auto">
                {results.map(p => {
                  const on = already.has(p.uid);
                  return (
                    <button key={p.uid} disabled={on} onClick={() => setPicked(x => [...x, p])}
                      className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left hover:bg-white/5 disabled:opacity-50">
                      {p.avatar ? <img src={p.avatar} alt="" className="w-6 h-6 rounded-full object-cover" /> : <span className="w-6 h-6 rounded-full grid place-items-center text-[10px] font-bold" style={{ background: 'rgba(208,188,255,.2)', color: LILAC }}>{p.name.slice(0, 1).toUpperCase()}</span>}
                      <span className="min-w-0 flex-1"><span className="block text-[11.5px] font-bold truncate">{p.name}</span>{p.handle && <span className="block text-[9.5px] text-white/40 truncate">@{p.handle}</span>}</span>
                      {on && <Check size={12} style={{ color: CYAN }} />}
                    </button>
                  );
                })}
              </div>
            )}
            {term.trim() && !searching && !results.length && <div className="text-[10.5px] text-white/40">Nobody found for “{term}”.</div>}
            {picked.length > 0 && (
              <div className="flex flex-wrap gap-1.5" data-share-picked>
                {picked.map(p => (
                  <span key={p.uid} className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full text-[10.5px] font-bold" style={{ background: 'rgba(0,218,243,.12)', color: CYAN, border: '1px solid rgba(0,218,243,.3)' }}>
                    {p.name}<button onClick={() => setPicked(x => x.filter(y => y.uid !== p.uid))} className="w-4 h-4 grid place-items-center rounded-full hover:bg-white/10" aria-label={`Remove ${p.name}`}><X size={10} /></button>
                  </span>
                ))}
              </div>
            )}
            <div>
              <div className="text-[9.5px] font-extrabold uppercase tracking-wider text-white/40 mb-1">Shared with</div>
              {!current.length ? <div className="text-[10.5px] text-white/40">Nobody yet.</div> : (
                <div className="space-y-1">
                  {current.map(p => (
                    <div key={p.uid} className="flex items-center gap-2 text-[11px]">
                      <span className="w-5 h-5 rounded-full grid place-items-center text-[9px] font-bold" style={{ background: 'rgba(208,188,255,.18)', color: LILAC }}>{p.name.slice(0, 1).toUpperCase()}</span>
                      <span className="flex-1 truncate">{p.name}{p.handle ? <span className="text-white/40"> @{p.handle}</span> : null}</span>
                      <button disabled={busy} onClick={() => commit((rec.sharedWith || []).filter(u => u !== p.uid), 'Remove')} className="text-[9.5px] font-bold text-white/45 hover:text-[#FF8A8A]">Remove</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="rounded-lg p-2.5 text-[10.5px] text-white/65 flex items-start gap-2" style={{ background: 'rgba(255,255,255,.04)' }}>
              {rec.visibility === 'public' ? <Globe size={12} className="flex-none mt-0.5" /> : <Users size={12} className="flex-none mt-0.5" />}
              <span className="flex-1">{note}</span>
              <button onClick={() => { try { void navigator.clipboard?.writeText(note); setCopied(true); window.setTimeout(() => setCopied(false), 1500); } catch { /* */ } }}
                className="flex-none text-[9.5px] font-bold flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-white/10" style={{ color: copied ? CYAN : LILAC }}>
                {copied ? <Check size={10} /> : <Copy size={10} />}{copied ? 'Copied' : 'Copy note'}
              </button>
            </div>
          </>)}
          {err && <div className="text-[10.5px] rounded-md px-2 py-1" style={{ color: '#FFB547', background: 'rgba(255,181,71,.08)' }}>{err}</div>}
        </div>
        <div className="px-4 py-3 border-t border-white/10 flex items-center gap-2">
          <button onClick={onClose} className="h-8 px-3 rounded-lg text-[11px] font-bold bg-white/5 hover:bg-white/10">Done</button>
          {signedIn && (
            <button disabled={busy || !picked.length} data-share-commit onClick={() => commit([...(rec.sharedWith || []), ...picked.map(p => p.uid)], 'Share')}
              className="ml-auto h-8 px-4 rounded-lg text-[11.5px] font-extrabold flex items-center gap-1.5 disabled:opacity-40"
              style={{ background: `linear-gradient(135deg, ${LILAC}, ${CYAN})`, color: '#0b0a12' }}>
              {busy ? <Loader2 size={13} className="animate-spin" /> : <Users size={13} />}Share{picked.length ? ` with ${picked.length}` : ''}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default AmboShareDialog;
