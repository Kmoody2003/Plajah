// Versions of a shared song as variants: the Session version everyone edits, plus each person's own
// line. Open one as your private draft over the live session, make a line the session version
// (editors), go back to the session, or save what you have as your version.

import React, { useEffect, useState } from 'react';
import { GitBranch, Check } from 'lucide-react';
import { auth } from '../../../../services/firebase';
import { canEdit } from '../../../../services/coedit/project';
import type { UseCoedit } from '../../../../hooks/useCoedit';
import type { VersionMeta } from '../../../../services/coedit/session';

type Line = { id: string; label: string; byName?: string; at: number; version?: VersionMeta; mine: boolean };

export function VersionChip<T>({ co, flash }: { co: UseCoedit<T>; flash?: (m: string) => void }) {
  const [open, setOpen] = useState(false);
  const [lines, setLines] = useState<Line[]>([]);
  const [busy, setBusy] = useState(false);
  const session = co.session;
  const editor = canEdit(co.project, auth.currentUser?.uid);
  const drafting = co.snap?.mode === 'draft';

  useEffect(() => {
    if (!open || !session) return;
    void session.listLines().then(setLines).catch(() => setLines([]));
  }, [open, session]);

  if (!co.isShared || !session) return null;
  const run = async (fn: () => Promise<unknown>, done: string) => {
    setBusy(true);
    try { await fn(); flash?.(done); setLines(await session.listLines()); } catch (e) { flash?.(e instanceof Error ? e.message : 'That did not work'); } finally { setBusy(false); }
  };
  const myName = (auth.currentUser?.displayName || 'My').split(' ')[0];

  return (
    <div className="relative shrink-0">
      <button onClick={() => setOpen((v) => !v)} className={`h-7 px-2.5 rounded-full border text-[11px] flex items-center gap-1.5 ${drafting ? 'border-[#FFD166]/50 text-[#FFD166] bg-[#FFD166]/10' : 'border-white/15 text-white/75 hover:bg-white/10'}`}
        title="Versions of this song: the session version and each person's own">
        <GitBranch size={12} /> {drafting ? `${myName}'s version` : 'Session'}
      </button>
      {open && (
        <div className="absolute right-0 top-9 z-[170] w-72 rounded-xl border border-white/15 bg-[#0A0A0D]/97 backdrop-blur-xl p-2 shadow-2xl text-[11px] text-white space-y-1">
          {lines.length === 0 && <p className="px-1 py-2 text-white/40">Loading versions…</p>}
          {lines.map((l) => {
            const current = l.id === 'session' ? !drafting : drafting && l.mine;
            return (
              <div key={l.id} className="rounded-lg border border-white/10 p-1.5">
                <div className="flex items-center gap-1.5">
                  {current && <Check size={11} className="text-[#06D6A0]" />}
                  <span className="flex-1 truncate font-semibold">{l.mine ? 'My version' : l.label}</span>
                  <span className="text-white/30 text-[10px]">{new Date(l.at).toLocaleDateString()}</span>
                </div>
                <div className="flex gap-1 mt-1">
                  {l.id === 'session'
                    ? <button disabled={busy || !drafting} onClick={() => void run(() => session.adoptSession(), 'Following the session version')} className="h-6 px-2 rounded border border-white/15 disabled:opacity-30">Use session</button>
                    : <>
                        <button disabled={busy || !l.version} onClick={() => void run(() => session.openAsMine(l.version!), `Opened ${l.label} as your version`)} className="h-6 px-2 rounded border border-white/15 disabled:opacity-30">Open</button>
                        {editor && <button disabled={busy || !l.version} onClick={() => { if (window.confirm(`Make “${l.label}” the session version for everyone? The current session is saved in history first.`)) void run(() => session.promoteLine(l.version!), 'That version is now the session version'); }} className="h-6 px-2 rounded border border-[#FF8C00]/40 text-[#FF8C00] disabled:opacity-30">Make main</button>}
                      </>}
                </div>
              </div>
            );
          })}
          <button disabled={busy} onClick={() => void run(() => session.saveMyLine(), 'Saved as your version')} className="w-full h-7 rounded-lg bg-[#B84DFF]/20 border border-[#B84DFF]/40 disabled:opacity-40">Save mine</button>
        </div>
      )}
    </div>
  );
}
