// Freeze the channel numbers.
//
// Numbers used to be computed at read time and never stored, which is why they drifted — a
// channel's number depended on who else happened to be on air when you looked. There is
// therefore no record anywhere of what any channel's number "was"; it has to be recomputed from
// the old algorithm and written down.
//
// That is what this does, once. It is not an allocator: it replays the previous behaviour over
// every account in the guide and commits the result, so each one keeps the address its audience
// already knows. New channels are assigned on creation from then on, and nothing ever reissues a
// retired number.
//
// It lists LIVE sources as well as FAST channels, because an account can be in the guide on the
// strength of a live channel alone — and numbering only the FAST owners is exactly how an account
// ends up with a guide number the registry has never heard of.
//
// Deliberately preview-then-apply rather than a single button. This writes an address for every
// channel on the platform, and an operation of that shape should be looked at before it runs.

import React, { useCallback, useState } from 'react';
import { Hash, Check, AlertTriangle, Loader2, Radio, Tv } from 'lucide-react';
import {
  backfillChannelNumbers, fetchChannelNumberRegistry, fetchGuideAccounts,
} from '../../services/backendService';
import { legacyMajors, UNNUMBERED, type NumberRegistry } from '../../services/fast/channelNumbers';
import { sourceNumber, type GuideAccount } from '../../services/fast/guideLineup';

interface Row {
  account: GuideAccount;
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
      const [accounts, reg]: [GuideAccount[], NumberRegistry] =
        await Promise.all([fetchGuideAccounts(), fetchChannelNumberRegistry()]);

      // The same computation the migration performs, so what is shown is what will happen.
      const legacy = legacyMajors(accounts.map((a) => ({
        ownerId: a.ownerId,
        name: a.name,
        number: reg.byOwner[a.ownerId] ?? a.number,
      })));

      setRows(accounts
        .map((account) => ({
          account,
          current: reg.byOwner[account.ownerId] ?? account.number ?? null,
          proposed: legacy.get(account.ownerId) ?? 0,
          frozen: typeof reg.byOwner[account.ownerId] === 'number',
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
  const liveCount = rows?.filter((r) => r.account.sources.some((s) => s.kind === 'live')).length ?? 0;

  return (
    <div className="p-6 max-w-4xl">
      <div className="flex items-center gap-3 mb-1">
        <Hash size={18} className="text-white/40" />
        <h2 className="text-lg font-black">Channel Numbers</h2>
      </div>
      <p className="text-white/50 text-sm mb-5 max-w-[64ch] leading-relaxed">
        Channel numbers used to be worked out each time the guide loaded, so they moved whenever a
        different account went on air. This writes each account's number down permanently. It does
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
        {!!rows && (
          <span className="text-white/35 text-[12px] ml-1">
            {rows.length} {rows.length === 1 ? 'account' : 'accounts'}
            {liveCount > 0 && ` · ${liveCount} with a live source`}
          </span>
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
          Froze {done.assigned} of {done.total}. Every account now keeps its number permanently,
          including while it is off air.
        </div>
      )}

      {rows && rows.length === 0 && (
        <p className="text-white/40 text-[13px]">No channels found — no published FAST channels and no live sources.</p>
      )}

      {!!rows?.length && (
        <div className="border border-white/10 rounded-xl overflow-hidden">
          <table className="w-full text-[13px]">
            <thead className="bg-white/5 text-white/40">
              <tr>
                <th className="text-left font-medium px-3 py-2 w-16">Ch</th>
                <th className="text-left font-medium px-3 py-2">Account &amp; sources</th>
                <th className="text-left font-medium px-3 py-2 w-28">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.account.ownerId} className="border-t border-white/[0.06] align-top">
                  <td className="px-3 py-2.5 font-mono tabular-nums text-white/80">{r.proposed}</td>
                  <td className="px-3 py-2.5">
                    <div className="text-white/75 truncate">{r.account.name}</div>
                    {/* One account is one channel; its sources are sub-channels, the way an
                        over-the-air station has virtual subs. Showing them is the only way to
                        tell that a number covers a live feed as well as a FAST channel. */}
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
                      {r.account.sources.map((src, i) => (
                        <span key={src.id} className="inline-flex items-center gap-1.5 text-[11.5px] text-white/40">
                          {src.kind === 'live'
                            ? <Radio size={11} className="text-red-400/70" />
                            : <Tv size={11} className="text-sky-400/70" />}
                          <span className="font-mono tabular-nums text-white/55">
                            {sourceNumber(r.proposed, i, r.account.sources.length, UNNUMBERED)}
                          </span>
                          <span className="truncate max-w-[22ch]">{src.title}</span>
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-[11px] uppercase tracking-wider whitespace-nowrap">
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

      <p className="text-white/30 text-[11.5px] mt-4 max-w-[68ch] leading-relaxed">
        An account is one channel; a live source and a FAST channel under it become sub-channels
        (12.1, 12.2). Channel 8 is reserved for Plajah's own channels and is never given to an
        account. A number whose owner leaves is retired rather than reused — nobody inherits an
        address other people still have written down, and an account that comes back gets its own
        number returned.
      </p>
    </div>
  );
};

export default ChannelNumberMigration;
