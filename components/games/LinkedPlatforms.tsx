// Linked platforms card — bring your history from other platforms onto your Plajah gamer ledger.
// Steam links through Steam's own sign-in (OpenID), so only the account's owner can link it. Imports count
// toward the gamer score at "linked" trust (0.6); each sync imports only what changed since the last one.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link2, Loader2, RefreshCw, Unlink, ExternalLink } from 'lucide-react';
import { gamer, failed, type LinkView, type PlatformInfo } from '../../services/gamerNet/client';

const REASONS: Record<string, string> = {
  cancelled: 'Steam sign-in was cancelled.',
  expired: 'That sign-in took too long — try again.',
  claimed: 'That Steam account is already linked to another Plajah gamer profile.',
  'unlink-first': 'Unlink your current Steam account before linking a different one.',
};
const STATE_LABEL: Record<PlatformInfo['state'], string> = { live: '', planned: 'Coming soon', 'partner-only': 'Needs Xbox partner access' };
const MAX_PASSES = 25; // big libraries import in passes of 40 games

export default function LinkedPlatforms({ onChanged }: { onChanged?: () => void }) {
  const [links, setLinks] = useState<LinkView[] | null>(null);
  const [platforms, setPlatforms] = useState<PlatformInfo[]>([]);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  const load = useCallback(async () => {
    const r = await gamer.links();
    if (!alive.current) return;
    if (failed(r)) { setLinks([]); setMsg(r.error); return; }
    setLinks(r.links); setPlatforms(r.platforms);
    return r.links;
  }, []);

  const sync = useCallback(async () => {
    setBusy('steam'); setMsg('');
    let total = 0, hours = 0;
    for (let i = 0; i < MAX_PASSES; i++) {
      const r = await gamer.syncSteam();
      if (!alive.current) return;
      if (failed(r)) { setMsg(r.error); break; }
      total += r.imported; hours += r.hours;
      setLinks(ls => (ls ?? []).map(l => (l.platform === 'steam' ? r.link : l)));
      if (!r.more) { setMsg(total ? `Imported ${total} game${total === 1 ? '' : 's'} · +${Math.round(hours * 10) / 10} h` : 'Up to date — nothing new since the last sync.'); break; }
      setMsg(`Importing… ${total} games so far`);
    }
    setBusy('');
    onChanged?.();
  }, [onChanged]);

  // Coming back from Steam: show the outcome, tidy the URL, finish a large first import.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const from = q.get('gamerLink'), status = q.get('status'), reason = q.get('reason') ?? '';
    if (from) {
      ['gamerLink', 'status', 'reason'].forEach(k => q.delete(k));
      const rest = q.toString();
      window.history.replaceState(null, '', `${window.location.pathname}${rest ? `?${rest}` : ''}${window.location.hash}`);
      setMsg(status === 'ok' ? 'Steam linked — your history is on your ledger.' : REASONS[reason] ?? `Steam link failed${reason ? `: ${reason}` : ''}.`);
      if (status === 'ok') onChanged?.();
    }
    void load().then(ls => { if (ls?.some(l => l.platform === 'steam' && l.pending)) void sync(); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const linkSteam = async () => {
    setBusy('steam'); setMsg('');
    const r = await gamer.startSteamLink(`${window.location.pathname}${window.location.search}`);
    if (failed(r)) { setBusy(''); setMsg(r.error); return; }
    window.location.assign(r.url);
  };

  const unlink = async () => {
    if (!window.confirm('Unlink Steam? Your imported history stays on your ledger.')) return;
    setBusy('steam');
    const r = await gamer.unlinkSteam();
    setBusy('');
    if (failed(r)) { setMsg(r.error); return; }
    setMsg('Steam unlinked. Imported history stays on your ledger.');
    await load(); onChanged?.();
  };

  const steam = links?.find(l => l.platform === 'steam');
  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-4 sm:p-5">
      <div className="flex items-center gap-2 mb-1"><Link2 size={18} className="text-sky-400" /><h4 className="text-sm font-black uppercase tracking-widest">Linked platforms</h4></div>
      <p className="text-[11px] text-white/50 mb-3">Bring your history with you. Imports count toward your gamer score (linked trust ×0.6).</p>
      {links === null ? (
        <div className="flex items-center gap-2 text-white/50 text-sm"><Loader2 size={16} className="animate-spin" /> Loading…</div>
      ) : (
        <ul className="space-y-2">
          {platforms.map(p => {
            if (p.id === 'steam' && steam) return (
              <li key={p.id} className="rounded-2xl bg-white/[0.04] border border-white/10 p-3">
                <div className="flex items-center gap-3">
                  {steam.avatar ? <img src={steam.avatar} alt="" className="w-9 h-9 rounded-lg object-cover" /> : <span className="w-9 h-9 rounded-lg bg-white/10" />}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold truncate">Steam{steam.name ? ` · ${steam.name}` : ''}</div>
                    <div className="text-[11px] text-white/55">{steam.hours.toLocaleString()} h · {steam.games} games · {steam.achievements} achievements</div>
                  </div>
                  {steam.profileUrl && <a href={steam.profileUrl} target="_blank" rel="noreferrer" aria-label="Open Steam profile" className="text-white/40 hover:text-white p-2"><ExternalLink size={14} /></a>}
                </div>
                {steam.error && <p className="mt-2 text-[11px] text-amber-300">{steam.error}</p>}
                <div className="mt-2 flex items-center gap-2">
                  <button onClick={() => void sync()} disabled={!!busy} className="flex-1 min-h-[36px] rounded-xl bg-white/5 border border-white/10 text-[11px] font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-white/10 disabled:opacity-50">
                    {busy === 'steam' ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Sync
                  </button>
                  <button onClick={() => void unlink()} disabled={!!busy} aria-label="Unlink Steam" className="min-h-[36px] px-3 rounded-xl bg-white/5 border border-white/10 text-white/60 hover:text-white disabled:opacity-50"><Unlink size={13} /></button>
                </div>
                <div className="mt-1.5 text-[10px] text-white/35">{steam.lastSyncAt ? `Last synced ${new Date(steam.lastSyncAt).toLocaleString()}` : 'Not synced yet'}</div>
              </li>
            );
            return (
              <li key={p.id} className="flex items-center gap-3 rounded-2xl bg-white/[0.02] border border-white/5 p-3">
                <div className="flex-1 min-w-0"><div className="text-sm font-bold">{p.name}</div><div className="text-[11px] text-white/45 truncate">{p.imports}</div></div>
                {p.state === 'live' ? (
                  <button onClick={() => void linkSteam()} disabled={!!busy || !p.available} title={p.available ? p.proof : 'Not switched on yet'} className="shrink-0 min-h-[36px] px-4 rounded-full bg-white text-black text-[11px] font-black uppercase tracking-widest disabled:opacity-40">
                    {busy === p.id ? <Loader2 size={13} className="animate-spin" /> : 'Link'}
                  </button>
                ) : <span className="shrink-0 text-[10px] font-bold uppercase tracking-widest text-white/35">{STATE_LABEL[p.state]}</span>}
              </li>
            );
          })}
        </ul>
      )}
      {msg && <p className="mt-3 text-[11px] text-white/70" role="status">{msg}</p>}
    </div>
  );
}
