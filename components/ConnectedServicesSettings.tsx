// ConnectedServicesSettings — the account-settings home for external creative-service accounts.
//
// The same links can be made from Fabula's GENERATE panel, but that is link-at-point-of-need. This is
// where people actually look for credentials, and — more importantly — where they can see what is
// linked and revoke it without having to open a tool and load a production first.
//
// What a key is and isn't, stated on the page because users deserve to know before pasting:
//   - it goes straight to our server over HTTPS, is verified against the provider, then encrypted
//     (AES-256-GCM) and stored against your uid;
//   - it never comes back to the browser — this screen only ever sees a masked tail;
//   - it is never written to localStorage and never enters the client bundle.
//
// Providers with no public API (Dreamina, Google Flow) are deliberately NOT shown as linkable. There
// is nothing to link, and offering a form would imply otherwise. They're listed at the bottom instead.

import { useEffect, useState } from 'react';
import {
  Link2, ShieldCheck, AlertTriangle, Loader, ExternalLink, Trash2, RefreshCw, Wallet,
} from 'lucide-react';
import {
  CONNECTORS, listConnectors, connectAccount, saveProviderKey, revokeProvider, agentStatus,
  type Connector, type AgentStatus, type ConnectChallenge,
} from '../services/fabula/genAgent';

const WALLET_LABEL: Record<string, string> = {
  shared: 'Draws your plan credits',
  separate: 'Separate developer balance',
  none: 'No API — hand off only',
};

export default function ConnectedServicesSettings() {
  const [status, setStatus] = useState<AgentStatus | null>(null);
  const [connectors, setConnectors] = useState<Connector[]>(CONNECTORS);
  const [loading, setLoading] = useState(true);
  const [challenge, setChallenge] = useState<(ConnectChallenge & { provider: string }) | null>(null);
  const [keyValue, setKeyValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const load = async () => {
    setLoading(true);
    const [s, cs] = await Promise.all([agentStatus(), listConnectors()]);
    setStatus(s); setConnectors(cs); setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const linkable = connectors.filter((c) => c.modes?.includes('connected'));
  const handoffOnly = connectors.filter((c) => !c.modes?.includes('connected'));
  const isWired = (id: string) => !!status?.connected?.includes(id);

  const startLink = async (id: string) => {
    setErr(''); setKeyValue('');
    try {
      const r = await connectAccount(id);
      if (r.needsKey) setChallenge({ provider: id, ...r });
      else if (r.authUrl) window.open(r.authUrl, '_blank', 'noopener');
      else if (r.connected) await load();
    } catch (e: any) { setErr(e?.message || 'Could not start linking that account.'); }
  };

  const submitKey = async () => {
    if (!challenge || !keyValue.trim()) return;
    setBusy(true); setErr('');
    try {
      await saveProviderKey(challenge.provider, keyValue.trim());
      setChallenge(null); setKeyValue('');
      await load();
    } catch (e: any) { setErr(e?.message || 'That key was rejected.'); }
    finally { setBusy(false); }
  };

  const unlink = async (c: Connector) => {
    if (!window.confirm(`Unlink ${c.name}? The stored key is deleted — generations will stop until you link again.`)) return;
    if (await revokeProvider(c.id)) await load();
  };

  return (
    <div className="flex flex-col gap-6 max-w-xl">

      <div className="flex items-start gap-3 p-4 rounded-xl"
        style={{ background: 'rgba(52,211,153,0.07)', border: '1px solid rgba(52,211,153,0.18)' }}>
        <ShieldCheck size={16} className="text-emerald-400 shrink-0 mt-0.5" />
        <p className="text-[11px] leading-relaxed text-white/60">
          Keys are sent straight to our server over HTTPS, verified with the provider, then encrypted and
          stored against your account. <b className="text-white/80">They are never sent back to your
          browser</b> — this page only ever shows the last four characters. Jobs run on your own account,
          so generations are billed to you, not to Plajah.
        </p>
      </div>

      {status && !status.ok && (
        <div className="flex items-center gap-2 p-3 rounded-xl text-[11px] text-amber-200"
          style={{ background: 'rgba(180,140,40,0.12)', border: '1px solid rgba(200,160,60,0.28)' }}>
          <AlertTriangle size={13} /> The generation service isn’t reachable, so linking is unavailable right now.
        </div>
      )}
      {status?.ok && status.encryptionConfigured === false && (
        <div className="flex items-center gap-2 p-3 rounded-xl text-[11px] text-rose-200"
          style={{ background: 'rgba(251,113,133,0.12)', border: '1px solid rgba(251,113,133,0.3)' }}>
          <AlertTriangle size={13} /> Credential encryption isn’t configured on the server — linking is
          disabled until it is. Nothing will be stored unencrypted.
        </div>
      )}

      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-black uppercase tracking-widest text-white/60">Creative services</h3>
          <button onClick={load} disabled={loading}
            className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-white/30 hover:text-white/60 transition-colors">
            <RefreshCw size={10} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>

        {loading && !connectors.length ? (
          <div className="flex items-center gap-2 text-white/30 py-4 text-[11px]">
            <Loader size={12} className="animate-spin" /> Loading…
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {linkable.map((c) => {
              const wired = isWired(c.id);
              const blocked = !status?.ok || status?.encryptionConfigured === false;
              return (
                <div key={c.id} className="p-4 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <div className="flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[12px] font-black text-white">{c.name}</span>
                        {c.connected && (
                          <span className="text-[9px] font-bold px-2 py-0.5 rounded-full text-emerald-300"
                            style={{ background: 'rgba(52,211,153,0.12)', border: '1px solid rgba(52,211,153,0.3)' }}>
                            {c.hint || 'linked'}
                          </span>
                        )}
                        {!wired && (
                          <span className="text-[9px] font-bold px-2 py-0.5 rounded-full text-white/40"
                            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)' }}>
                            not wired yet
                          </span>
                        )}
                      </div>
                      <p className="text-[10.5px] text-white/40 mt-1">{c.blurb}</p>
                      <p className="flex items-center gap-1.5 text-[10px] mt-1.5"
                        style={{ color: c.walletModel === 'separate' ? '#f0b35f' : '#9c98aa' }}>
                        <Wallet size={10} /> {WALLET_LABEL[c.walletModel] || ''}
                      </p>
                    </div>
                    {c.connected ? (
                      <button onClick={() => unlink(c)}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest text-rose-300 hover:bg-rose-500/10 transition-colors shrink-0"
                        style={{ border: '1px solid rgba(251,113,133,0.3)' }}>
                        <Trash2 size={11} /> Unlink
                      </button>
                    ) : (
                      <button onClick={() => startLink(c.id)} disabled={blocked || !wired}
                        title={!wired ? `${c.name} has an API but no adapter here yet — use Hand off in Fabula.` : undefined}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest text-white/70 hover:text-white hover:bg-white/10 transition-colors shrink-0 disabled:opacity-35 disabled:cursor-not-allowed"
                        style={{ border: '1px solid rgba(255,255,255,0.16)' }}>
                        <Link2 size={11} /> Link
                      </button>
                    )}
                  </div>

                  {c.walletNote && (
                    <p className="text-[10px] leading-relaxed text-white/35 mt-3 pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                      {c.walletNote}
                    </p>
                  )}

                  {challenge?.provider === c.id && (
                    <div className="mt-3 pt-3" style={{ borderTop: '1px solid rgba(120,180,255,0.2)' }}>
                      {challenge.keyHelp && <p className="text-[10.5px] text-white/45 mb-2.5 leading-relaxed">{challenge.keyHelp}</p>}
                      <div className="flex gap-2">
                        <input type="password" autoComplete="off" spellCheck={false}
                          placeholder={challenge.keyLabel || 'Paste your API key'}
                          value={keyValue} onChange={(e) => setKeyValue(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') submitKey(); }}
                          className="flex-1 min-w-0 px-3 py-2 rounded-lg text-[11px] font-mono text-white bg-black/40 focus:outline-none"
                          style={{ border: '1px solid rgba(255,255,255,0.16)' }} />
                        <button onClick={submitKey} disabled={busy || !keyValue.trim()}
                          className="px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest text-black bg-white disabled:opacity-40 shrink-0">
                          {busy ? 'Verifying…' : 'Save'}
                        </button>
                      </div>
                      <div className="flex items-center gap-3 mt-2.5">
                        {challenge.keyUrl && (
                          <a href={challenge.keyUrl} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-sky-300 hover:text-sky-200">
                            <ExternalLink size={10} /> Create a key
                          </a>
                        )}
                        <button onClick={() => { setChallenge(null); setKeyValue(''); setErr(''); }}
                          className="text-[10px] font-bold uppercase tracking-widest text-white/30 hover:text-white/60">
                          Cancel
                        </button>
                      </div>
                      {err && (
                        <p className="flex items-center gap-1.5 mt-2.5 text-[10px] text-rose-300">
                          <AlertTriangle size={10} /> {err}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {err && !challenge && (
          <p className="flex items-center gap-1.5 mt-3 text-[10px] text-rose-300">
            <AlertTriangle size={10} /> {err}
          </p>
        )}
      </div>

      {/* No form for these on purpose — there is nothing to link. */}
      {!!handoffOnly.length && (
        <div className="pt-5" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <h3 className="text-xs font-black uppercase tracking-widest text-white/40 mb-2">Nothing to link</h3>
          <p className="text-[10.5px] text-white/35 leading-relaxed mb-3">
            These have no public API, so there is no key to store. Fabula compiles the prompt and
            reference pack and hands off — you run it in your own browser on the subscription you
            already pay for, and the result is picked up automatically.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {handoffOnly.map((c) => (
              <span key={c.id} className="text-[10px] px-2.5 py-1 rounded-full text-white/45"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)' }}>
                {c.name}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
