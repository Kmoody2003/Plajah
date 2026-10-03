// Merge-duplicates tool: side-by-side, choose per-field winner, repoints attendance/giving/notes via mergePeople().
import React, { useMemo, useState } from 'react';
import { Loader2, GitMerge, ArrowLeftRight } from 'lucide-react';
import type { ChmsPerson } from '../../../types';
import { findDuplicatePairs, mergePeople, fullName } from '../../../services/chmsPeople';
import { usePeople, Modal, btn, btnPrimary, Empty, label } from './PeopleUI';

const FIELDS: [keyof ChmsPerson, string][] = [
  ['email', 'Email'], ['phone', 'Phone'], ['birthDate', 'Birth date'], ['anniversary', 'Anniversary'], ['gender', 'Gender'],
  ['memberSince', 'Member since'], ['baptismDate', 'Baptism'], ['householdId', 'Household'], ['photoUrl', 'Photo'],
];
const show = (p: ChmsPerson, k: keyof ChmsPerson) => { const v: any = p[k]; return v ? (typeof v === 'object' ? JSON.stringify(v) : String(v)) : ''; };

const PeopleMerge: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { org, people, reload } = usePeople();
  const pairs = useMemo(() => findDuplicatePairs(people), [people]);
  const [i, setI] = useState(0);
  const [swap, setSwap] = useState(false);
  const [prefer, setPrefer] = useState<Partial<Record<keyof ChmsPerson, 'keep' | 'drop'>>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const pair = pairs[i];

  const doMerge = async () => {
    if (!pair) return;
    const keep = swap ? pair.b : pair.a, drop = swap ? pair.a : pair.b;
    if (!confirm(`Merge ${fullName(drop)} into ${fullName(keep)}? This repoints attendance, giving and notes and archives the duplicate.`)) return;
    setBusy(true);
    try {
      const r = await mergePeople(org.id, keep.id, drop.id, prefer);
      setMsg(`Merged. Repointed: ${Object.entries(r.repointed).map(([k, v]) => `${k.replace('chms', '')} ${v}`).join(', ') || 'nothing'}${r.skipped.length ? `. Could not update (needs finance/author access): ${r.skipped.join(', ')}` : ''}`);
      setPrefer({}); await reload();
    } catch (e: any) { setMsg(e?.message || 'Merge failed.'); }
    setBusy(false);
  };

  return (
    <Modal title={`Merge duplicates${pairs.length ? ` (${pairs.length})` : ''}`} onClose={onClose} wide>
      {msg && <p className="mb-3 text-[11px] font-bold text-emerald-300">{msg}</p>}
      {!pair ? <Empty>No likely duplicates found.</Empty> : (() => {
        const keep = swap ? pair.b : pair.a, drop = swap ? pair.a : pair.b;
        return (
          <div className="space-y-4">
            <p className="text-[10px] text-white/40">{pair.reason} · pair {i + 1} of {pairs.length}</p>
            <div className="grid grid-cols-[1fr_auto_1fr] gap-3 items-center">
              <div className="text-center"><p className={label}>Keep</p><p className="text-sm font-black text-white">{fullName(keep)}</p></div>
              <button className={btn} onClick={() => { setSwap(s => !s); setPrefer({}); }}><ArrowLeftRight size={13} /></button>
              <div className="text-center"><p className={label}>Merge in &amp; archive</p><p className="text-sm font-black text-white/60">{fullName(drop)}</p></div>
            </div>
            <div className="rounded-2xl border border-white/10 overflow-hidden text-xs">
              {FIELDS.map(([k, l]) => {
                const a = show(keep, k), b = show(drop, k); if (!a && !b) return null;
                const pick = prefer[k] || (a ? 'keep' : 'drop');
                return (
                  <div key={String(k)} className="grid grid-cols-[90px_1fr_1fr] border-b border-white/5 last:border-0">
                    <span className="px-3 py-2 text-white/30 font-bold">{l}</span>
                    <button disabled={!a} onClick={() => setPrefer(p => ({ ...p, [k]: 'keep' }))} className={`px-3 py-2 text-left truncate ${pick === 'keep' && a ? 'bg-emerald-500/10 text-emerald-200' : 'text-white/40'}`}>{a || '—'}</button>
                    <button disabled={!b} onClick={() => setPrefer(p => ({ ...p, [k]: 'drop' }))} className={`px-3 py-2 text-left truncate ${pick === 'drop' && b ? 'bg-emerald-500/10 text-emerald-200' : 'text-white/40'}`}>{b || '—'}</button>
                  </div>
                );
              })}
            </div>
            <p className="text-[10px] text-white/40">Tags, skills, ministries and custom fields are combined automatically. Click a value to choose which one survives.</p>
            <div className="flex gap-2">
              <button className={btnPrimary} disabled={busy} onClick={doMerge}>{busy ? <Loader2 size={13} className="animate-spin" /> : <GitMerge size={13} />} Merge</button>
              <button className={btn} onClick={() => { setI(n => Math.min(pairs.length - 1, n + 1)); setPrefer({}); setSwap(false); setMsg(''); }}>Not a duplicate / skip</button>
            </div>
          </div>
        );
      })()}
    </Modal>
  );
};

export default PeopleMerge;
