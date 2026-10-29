// The song's contribution ledger in the collaboration dock: who did what (from the server's
// hash-chained record, never typed), the credits that supports, and "Seal this version" — a
// proof-of-authorship entry that fixes the exact audio (sha-256) the song is made of right now.

import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, ShieldCheck, ShieldAlert, Stamp, Copy } from 'lucide-react';
import type { GrooveDoc } from '../../../../services/melos/beats/grooveDoc';
import { cloudProjectId } from '../../../../services/creativeCloud/cloudStore';
import { fetchLedger, sealVersion } from '../../../../services/chora/contrib/client';
import { suggestCredits, summarizeByPerson } from '../../../../services/chora/contrib/derive';
import { KIND_LABEL, type ContribEntry, type ContribKind } from '../../../../services/chora/contrib/types';
import { ago, btn, btnPrimary, card, lbl } from '../../../collab/collabUi';

/** Content addresses of every piece of audio the song plays (sample keys are sha-256). */
function audioHashes(doc: GrooveDoc): string[] {
  const out = new Set<string>();
  const add = (k?: string) => { const m = k && /([0-9a-f]{64})/i.exec(k); if (m) out.add(m[1].toLowerCase()); };
  for (const t of doc.arrangement) for (const c of t.clips) add(c.audio?.sampleKey);
  for (const p of doc.kit) add(p.sample?.key);
  return [...out].sort();
}

async function docHash(doc: GrooveDoc): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify({ ...doc, updatedAt: 0 }));
  const dig = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(dig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export const ContribLedgerPanel: React.FC<{ doc: GrooveDoc; signedIn: boolean }> = ({ doc, signedIn }) => {
  const pid = cloudProjectId('beats', doc.id);
  const [state, setState] = useState<{ entries: ContribEntry[]; ok: boolean; problem?: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [note, setNote] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const r = await fetchLedger(pid);
    setState(r ? { entries: r.entries, ok: r.check.ok, problem: r.check.problem } : { entries: [], ok: true });
    setLoading(false);
  }, [pid]);
  useEffect(() => { if (signedIn) void load(); }, [signedIn, load]);

  if (!signedIn) return <p className="p-3 text-[.7rem] text-white/50">Sign in to keep a record of who did what on this song.</p>;
  if (!state) return <div className="p-4 flex justify-center"><Loader2 size={16} className="animate-spin text-white/40" /></div>;

  const people = summarizeByPerson(state.entries);
  const credits = suggestCredits(state.entries);
  const seals = state.entries.filter((e) => e.kind === 'sealed');

  const seal = async () => {
    const sha = [await docHash(doc), ...audioHashes(doc)];
    const e = await sealVersion(pid, sha, doc.name || 'Untitled');
    setNote(e ? `Sealed as entry #${e.seq} — ${new Date(e.at).toLocaleString()}` : 'Could not seal right now — try again.');
    if (e) void load();
  };

  const copyCredits = () => {
    const text = credits.map((c) => `${c.name} — ${c.role}`).join('\n');
    void navigator.clipboard?.writeText(text).then(() => setNote('Credits copied. Paste them into the release’s Credits bay.'));
  };

  return (
    <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-3 text-white">
      <div className="flex items-center gap-2 text-[.66rem]">
        {state.ok ? <ShieldCheck size={13} className="text-emerald-400" /> : <ShieldAlert size={13} className="text-amber-400" />}
        <span className="text-white/60">{state.ok ? `${state.entries.length} entries · chain intact` : `Chain problem: ${state.problem}`}</span>
        <button className={`${btn} ml-auto`} onClick={() => void load()} disabled={loading}>Refresh</button>
      </div>

      <section className={`${card} p-2.5`}>
        <div className={lbl}>Who did what</div>
        {!people.length && <p className="text-[.68rem] text-white/45 mt-1">Nothing recorded yet. Edits are logged automatically a few seconds after you pause.</p>}
        <ul className="mt-1.5 space-y-2">
          {people.map((p) => (
            <li key={p.uid} className="text-[.7rem]">
              <div className="font-bold">{p.name} <span className="font-normal text-white/40">· {ago(p.lastAt)}</span></div>
              <div className="text-white/60">
                {(Object.entries(p.kinds) as [ContribKind, number][]).map(([k, n]) => `${KIND_LABEL[k]} ${n}`).join(' · ')}
              </div>
              {Object.entries(p.tracks).filter(([, t]) => t.inputs.length || t.playedBy).map(([name, t]) => (
                <div key={name} className="text-white/40">{name}: {[t.playedBy && `played by ${t.playedBy}`, ...t.inputs].filter(Boolean).join(' · ')}</div>
              ))}
              {p.devices.length > 0 && <div className="text-white/35">{p.devices.join(' · ')}</div>}
            </li>
          ))}
        </ul>
      </section>

      <section className={`${card} p-2.5`}>
        <div className="flex items-center">
          <div className={lbl}>Credits the record supports</div>
          {credits.length > 0 && <button className={`${btn} ml-auto`} onClick={copyCredits}><Copy size={11} /> Copy</button>}
        </div>
        <ul className="mt-1.5 text-[.7rem] space-y-0.5">
          {credits.map((c) => <li key={c.id}>{c.name} <span className="text-white/45">— {c.role}</span></li>)}
        </ul>
        <p className="mt-2 text-[.62rem] text-white/40">
          Suggestions from the record, with no splits. Splits and ownership are agreed between you and your collaborators; Plajah keeps the record but isn’t a party to it.
        </p>
      </section>

      <section className={`${card} p-2.5`}>
        <div className={lbl}>Proof of authorship</div>
        <p className="text-[.66rem] text-white/55 mt-1">
          Sealing fixes this exact version (its audio fingerprints and the song file) to your account with a server timestamp. That’s evidence of who made what and when. It isn’t a government copyright registration.
        </p>
        <button className={`${btnPrimary} mt-2`} onClick={() => void seal()}><Stamp size={12} /> Seal this version</button>
        {seals.length > 0 && (
          <ul className="mt-2 text-[.64rem] text-white/50 space-y-0.5">
            {seals.slice(-5).reverse().map((s) => <li key={s.seq}>#{s.seq} {s.label} · {s.name} · {new Date(s.at).toLocaleString()} · {s.hash.slice(0, 12)}…</li>)}
          </ul>
        )}
      </section>
      {note && <p className="text-[.66rem] text-[var(--pj-cyan,#00DAF3)]">{note}</p>}
    </div>
  );
};
