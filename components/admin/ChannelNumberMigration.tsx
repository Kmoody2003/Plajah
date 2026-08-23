// Freeze the channel numbers.
//
// Numbers used to be computed at read time and never stored, which is why they drifted — a
// channel's number depended on who else happened to be on air when you looked. There is
// therefore no record anywhere of what any channel's number "was"; it has to be recomputed from
// the old algorithm and written down.
//
// That is what this does, once. It is not an allocator: it replays the previous behaviour over
// the full set of enabled channels and commits the result, so every account keeps the address
// its audience already knows. New channels are assigned on creation from then on, and nothing
// ever reissues a retired number.
//
// Deliberately a preview-then-apply rather than a single button. This writes an address for
// every channel on the platform, and an operation of that shape should be looked at before it
// runs.

import React, { useCallback, useState } from 'react';
import { Hash, Check, AlertTriangle, Loader2 } from 'lucide-react';
import {
  backfillChannelNumbers, fetchAllFastChannels, fetchChannelNumberRegistry,
  type FastChannelListing,
} from '../../services/backendService';
import { legacyMajors, type NumberRegistry } from '../../services/fast/channelNumbers';

interface Row {
  ownerId: string;
  name: string;
  current: number | null;
  proposed: number;
  /** Already committed to the registry — this run will not touch it. */
  frozen: boolean;
}

export const ChannelNumberMigration: React.FC = () => {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ assigned: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const preview = useCallback(async () => {
    setBusy(true); setError(null); setDone(null);
    try {
      const [listings, reg]: [FastChannelListing[], NumberRegistry] =
        await Promise.all([fetchAllFastChannels(1000), fetchChannelNumberRegistry()]);

      // The same computation the migration will perform, so what is shown is what will happen.
      const legacy = legacyMajors(listings.map((l) => ({
        ownerId: l.ownerId,
        name: l.name,
        number: reg.byOwner[l.ownerId] ?? l.number,
      })));

      setRows(listings
        .map((l) => ({
          ownerId: l.ownerId,
          name: l.name,
          current: reg.byOwner[l.ownerId] ?? l.number ?? null,
          proposed: legacy.get(l.ownerId) ?? 0,
          frozen: typeof reg.byOwner[l.ownerId] === 'number',
        }))
        .sort((a, b) => a.proposed - b.proposed));
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  }, []);

  const apply = useCallback(async () => {
    setBusy(true); setError(null);
    try {
      const r = await backfillChannelNumbers();
      setDone({ assigned: r.assigned, total: r.total });
      await preview();
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  }, [preview]);

  const pending = rows?.filter((r) => !r.frozen).length ?? 0;

  return (
    <div className="p-6 max-w-3xl">
      <div className="flex items-center gap-3 mb-1">
        <Hash size={18} className="text-white/40" />
        <h2 className="text-lg font-black">Channel Numbers</h2>
      </div>
      <p className="text-white/50 text-sm mb-5 max-w-[64ch] leading-relaxed">
        Channel numbers used to be worked out each time the guide loaded, so they moved whenever a
        different account went on air. This writes each channel's number down permanently. It does
        not hand out new ones — it reproduces what the guide was already showing and freezes it, so
        nobody's channel number changes.
      </p>

      <div className="flex items-center gap-2 mb-5">
        <button
          onClick={preview}
          disabled={busy}
          className="px-4 h-9 rounded-full border border-white/15 text-[13px] hover:border-white/40 disabled:opacity-40 flex items-center gap-2"
        >
          {busy && !rows ? <Loader2 size={14} className="animate-spin" /> : null}
          Preview
        </button>
        {!!rows && pending > 0 && (
          <button
            onClick={apply}
            disabled={busy}
            className="px-4 h-9 rounded-full bg-white text-black text-[13px] font-bold hover:bg-white/90 disabled:opacity-40 flex items-center gap-2"
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : null}
            Freeze {pending} {pending === 1 ? 'number' : 'numbers'}
          </button>
        )}
      </div>

      {error && (
        <div className="flex items-start gap-2 text-[13px] text-red-300 mb-4">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" /> {error}
        </div>
      )}

      {done && (
        <div className="flex items-start gap-2 text-[13px] text-emerald-300 mb-4">
          <Check size={15} className="mt-0.5 shrink-0" />
          Froze {done.assigned} of {done.total}. Every channel now keeps its number permanently,
          including while it is off air.
        </div>
      )}

      {rows && rows.length === 0 && (
        <p className="text-white/40 text-[13px]">No published FAST channels found.</p>
      )}

      {!!rows?.length && (
        <div className="border border-white/10 rounded-xl overflow-hidden">
          <table className="w-full text-[13px]">
            <thead className="bg-white/5 text-white/40">
              <tr>
                <th className="text-left font-medium px-3 py-2 w-16">Ch</th>
                <th className="text-left font-medium px-3 py-2">Channel</th>
                <th className="text-left font-medium px-3 py-2 w-28">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.ownerId} className="border-t border-white/[0.06]">
                  <td className="px-3 py-2 font-mono tabular-nums text-white/80">{r.proposed}</td>
                  <td className="px-3 py-2 text-white/70 truncate max-w-0">{r.name}</td>
                  <td className="px-3 py-2 text-[11px] uppercase tracking-wider">
                    {r.frozen
                      ? <span className="text-emerald-300/70">Permanent</span>
                      : r.current === r.proposed
                        ? <span className="text-white/35">Unchanged</span>
                        : <span className="text-amber-300/70">Was {r.current ?? '—'}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-white/30 text-[11.5px] mt-4 max-w-[64ch] leading-relaxed">
        Channel 8 is reserved for Plajah's own channels and is never given to an account. A number
        whose owner leaves is retired rather than reused — nobody inherits an address other people
        still have written down, and an account that comes back gets its own number returned.
      </p>
    </div>
  );
};

export default ChannelNumberMigration;
