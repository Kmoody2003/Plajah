// Label Desk: run a record label on Chora. Roster, release deals and identifiers, distributor reports,
// advances, and royalty statements (routes/labels.ts). Artists on a roster see only their own side.
// Statements are an accounting record; payments are made outside Plajah and recorded here.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, Building2, CheckCircle2, Copy, Disc3, Download, FileSpreadsheet, Plus, Receipt, Trash2, Upload, Users } from 'lucide-react';
import { auth } from '../../services/firebase';
import { LABEL_PARTY, BPS_TOTAL, isMonth, toCsv, type DealParty, type StatementDraft } from '../../services/label/labelCore';

/** The lab swaps this for a stand-in identity. */
export let labelIdentity = async (): Promise<{ token: string; uid: string } | null> => {
  const u = auth.currentUser;
  return u ? { token: await u.getIdToken(), uid: u.uid } : null;
};
export const setLabelIdentity = (fn: typeof labelIdentity) => { labelIdentity = fn; };

async function api<T = any>(method: string, path: string, body?: unknown): Promise<T> {
  const me = await labelIdentity();
  if (!me) throw new Error('Sign in first.');
  const res = await fetch(`/api/labels${path}`, {
    method,
    headers: { Authorization: `Bearer ${me.token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'Something went wrong. Try again.');
  return json;
}

const money = (cents: number) => `${cents < 0 ? '-' : ''}$${(Math.abs(cents) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct = (bps: number) => `${(bps / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}%`;
const toCents = (s: string) => Math.round(parseFloat(s.replace(/[$,\s]/g, '')) * 100);
const monthLabel = (m: string) => new Date(`${m}-15T00:00:00Z`).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const lastMonth = () => { const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - 1); return d.toISOString().slice(0, 7); };

function downloadCsv(name: string, rows: unknown[][]) {
  const url = URL.createObjectURL(new Blob([toCsv(rows)], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

const ACCENT = '#FF8C00';
const card = 'rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4 sm:p-5';
const field = 'w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder-white/30 outline-none focus:border-[#FF8C00]/60';
const primary = 'inline-flex items-center justify-center gap-2 rounded-xl bg-[#FF8C00] px-4 py-2 text-sm font-bold text-black transition hover:brightness-110 disabled:opacity-40';
const quiet = 'inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-sm font-semibold text-white/70 transition hover:border-white/25 hover:text-white disabled:opacity-40';
const heading = 'text-sm font-bold text-white';
const muted = 'text-sm text-white/50';

const Notice: React.FC<{ error?: string; ok?: string }> = ({ error, ok }) => (!error && !ok ? null : (
  <div role={error ? 'alert' : 'status'} className={`flex items-start gap-2 rounded-xl px-3 py-2 text-sm ${error ? 'bg-red-500/10 text-red-300' : 'bg-emerald-500/10 text-emerald-300'}`}>
    {error ? <AlertCircle size={15} className="mt-0.5 shrink-0" /> : <CheckCircle2 size={15} className="mt-0.5 shrink-0" />}
    <span>{error || ok}</span>
  </div>
));

/** Runs a server action and reports the outcome in one place. */
function useAction(after?: () => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const run = useCallback(async (fn: () => Promise<unknown>, success = '') => {
    setBusy(true); setError(''); setOk('');
    try { await fn(); setOk(success); after?.(); return true; }
    catch (e: any) { setError(e.message); return false; }
    finally { setBusy(false); }
  }, [after]);
  return { busy, error, ok, run };
}

const InviteCode: React.FC<{ code: string }> = ({ code }) => (
  <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[#FF8C00]/30 bg-[#FF8C00]/10 px-3 py-2">
    <code className="font-mono text-base font-bold text-[#FFB866]">{code}</code>
    <button className={quiet} onClick={() => navigator.clipboard?.writeText(code)}><Copy size={14} /> Copy</button>
    <span className="text-xs text-white/50">Works once and expires in 7 days. It won't be shown again.</span>
  </div>
);

// ── Start: create a label or join with a code ────────────────────────────────

const Start: React.FC<{ onDone: (id: string) => void }> = ({ onDone }) => {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [invite, setInvite] = useState<any>(null);
  const a = useAction();
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className={card}>
        <h2 className={heading}>Start a label</h2>
        <p className={`${muted} mt-1 mb-3`}>Bring your roster, releases and royalty reports into one place.</p>
        <label className="sr-only" htmlFor="label-name">Label name</label>
        <input id="label-name" className={field} placeholder="Label name" value={name} onChange={e => setName(e.target.value)} />
        <button className={`${primary} mt-3`} disabled={a.busy || name.trim().length < 2}
          onClick={() => a.run(async () => onDone((await api('POST', '', { name })).id))}><Plus size={15} /> Create label</button>
      </div>
      <div className={card}>
        <h2 className={heading}>Join with a code</h2>
        <p className={`${muted} mt-1 mb-3`}>Signing to a label or joining its team? Enter the code they sent you.</p>
        <label className="sr-only" htmlFor="label-code">Invite code</label>
        <input id="label-code" className={field} placeholder="XXXXX-XXXXX" value={code} onChange={e => { setCode(e.target.value); setInvite(null); }} />
        {!invite ? (
          <button className={`${quiet} mt-3`} disabled={a.busy || !code.trim()} onClick={() => a.run(async () => setInvite(await api('POST', '/invites/lookup', { code })))}>Check code</button>
        ) : (
          <div className="mt-3 space-y-3">
            <p className="text-sm text-white/80">
              {invite.kind === 'artist'
                ? <><b>{invite.labelName}</b> is offering you <b>{pct(invite.artistBps)}</b> of income on any release you choose to add. Your albums stay yours.</>
                : <><b>{invite.labelName}</b> is inviting you to its team as <b>{invite.role}</b>.</>}
            </p>
            <button className={primary} disabled={a.busy} onClick={() => a.run(async () => onDone((await api('POST', '/invites/accept', { code })).labelId))}>
              {invite.kind === 'artist' ? 'Accept these terms' : 'Join the team'}
            </button>
          </div>
        )}
      </div>
      <div className="md:col-span-2"><Notice error={a.error} /></div>
    </div>
  );
};

// ── Roster ───────────────────────────────────────────────────────────────────

const RosterTab: React.FC<{ label: any; reload: () => void }> = ({ label, reload }) => {
  const [share, setShare] = useState('50');
  const [code, setCode] = useState('');
  const a = useAction(reload);
  const artists = Object.entries<any>(label.artists || {});
  return (
    <div className="space-y-4">
      <div className={card}>
        <h2 className={heading}>Invite an artist</h2>
        <p className={`${muted} mt-1 mb-3`}>They see the share before accepting, and choose which albums to add.</p>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="artist-share" className="mb-1 block text-xs font-semibold text-white/60">Artist share (%)</label>
            <input id="artist-share" className={`${field} w-28`} inputMode="decimal" value={share} onChange={e => setShare(e.target.value)} />
          </div>
          <button className={primary} disabled={a.busy} onClick={() => a.run(async () => {
            const bps = Math.round(parseFloat(share) * 100);
            setCode((await api('POST', `/${label.id}/invites`, { kind: 'artist', artistBps: bps })).code);
          })}><Plus size={15} /> Create invite</button>
        </div>
        {code && <div className="mt-3"><InviteCode code={code} /></div>}
      </div>
      <Notice error={a.error} ok={a.ok} />
      <div className={card}>
        <h2 className={`${heading} mb-3`}>Roster</h2>
        {!artists.length && <p className={muted}>No artists yet. Invite your first one above.</p>}
        <ul className="divide-y divide-white/[0.06]">
          {artists.map(([uid, x]) => (
            <li key={uid} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div>
                <div className="text-sm font-semibold text-white">{x.name}</div>
                <div className="text-xs text-white/50">{pct(x.artistBps)} standard share, joined {new Date(x.joinedAt).toLocaleDateString()}</div>
              </div>
              <button className={quiet} disabled={a.busy} aria-label={`Remove ${x.name}`} onClick={() => a.run(() => api('DELETE', `/${label.id}/artists/${uid}`), `${x.name} removed.`)}><Trash2 size={14} /> Remove</button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

// ── Catalog ──────────────────────────────────────────────────────────────────

const DealEditor: React.FC<{ label: any; entry: any; canEdit: boolean; me: string; reload: () => void }> = ({ label, entry, canEdit, me, reload }) => {
  const [parties, setParties] = useState<DealParty[]>(entry.parties);
  const [editing, setEditing] = useState(false);
  const a = useAction(() => { setEditing(false); reload(); });
  const total = parties.reduce((s, p) => s + p.bps, 0);
  const pending = entry.pendingDeal;
  const proposerIsMe = pending?.by === me;
  const update = (i: number, patch: Partial<DealParty>) => setParties(ps => ps.map((p, n) => (n === i ? { ...p, ...patch } : p)));
  return (
    <div className="mt-3 rounded-xl bg-black/20 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-bold text-white/60">Deal</span>
        {canEdit && !editing && !pending && <button className="text-xs font-semibold text-[#FFB866] hover:underline" onClick={() => setEditing(true)}>Propose a change</button>}
      </div>
      {!editing ? (
        <ul className="mt-2 space-y-1">
          {entry.parties.map((p: DealParty) => <li key={p.id} className="flex justify-between text-sm"><span className="text-white/80">{p.name}</span><span className="tabular-nums text-white">{pct(p.bps)}</span></li>)}
        </ul>
      ) : (
        <div className="mt-2 space-y-2">
          {parties.map((p, i) => (
            <div key={p.id} className="flex items-center gap-2">
              <input aria-label="Party name" className={`${field} flex-1`} value={p.name} disabled={p.id === LABEL_PARTY} onChange={e => update(i, { name: e.target.value })} />
              <input aria-label={`${p.name} share in percent`} className={`${field} w-24`} inputMode="decimal" value={p.bps / 100} onChange={e => update(i, { bps: Math.round((parseFloat(e.target.value) || 0) * 100) })} />
              {p.id !== LABEL_PARTY && p.uid !== entry.ownerUid && <button className={quiet} aria-label={`Remove ${p.name}`} onClick={() => setParties(ps => ps.filter((_, n) => n !== i))}><Trash2 size={14} /></button>}
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-2">
            <button className={quiet} onClick={() => setParties(ps => [...ps, { id: `p_${Date.now().toString(36)}`, name: 'New party', bps: 0 }])}><Plus size={14} /> Add party</button>
            <span className={`text-xs ${total === BPS_TOTAL ? 'text-emerald-300' : 'text-amber-300'}`}>Total {pct(total)}</span>
            <span className="flex-1" />
            <button className={quiet} onClick={() => { setParties(entry.parties); setEditing(false); }}>Cancel</button>
            <button className={primary} disabled={a.busy || total !== BPS_TOTAL} onClick={() => a.run(() => api('POST', `/${label.id}/catalog/${entry.albumId}/deal`, { parties }))}>Send proposal</button>
          </div>
        </div>
      )}
      {pending && (
        <div className="mt-3 rounded-lg border border-amber-400/25 bg-amber-400/10 p-3">
          <div className="text-xs font-bold text-amber-200">{proposerIsMe ? 'Waiting for the other side' : 'A change is proposed'}</div>
          <ul className="mt-1 space-y-0.5">{pending.parties.map((p: DealParty) => <li key={p.id} className="flex justify-between text-sm text-white/80"><span>{p.name}</span><span className="tabular-nums">{pct(p.bps)}</span></li>)}</ul>
          <div className="mt-2 flex gap-2">
            {!proposerIsMe && <button className={primary} disabled={a.busy} onClick={() => a.run(() => api('POST', `/${label.id}/catalog/${entry.albumId}/deal/accept`))}>Accept</button>}
            <button className={quiet} disabled={a.busy} onClick={() => a.run(() => api('POST', `/${label.id}/catalog/${entry.albumId}/deal/decline`))}>{proposerIsMe ? 'Withdraw' : 'Decline'}</button>
          </div>
        </div>
      )}
      <div className="mt-2"><Notice error={a.error} /></div>
    </div>
  );
};

const Identifiers: React.FC<{ label: any; entry: any; reload: () => void }> = ({ label, entry, reload }) => {
  const [upc, setUpc] = useState(entry.upc);
  const [isrcs, setIsrcs] = useState<Record<string, string>>(() => Object.fromEntries(entry.tracks.map((t: any) => [t.id, t.isrc])));
  const a = useAction(reload);
  return (
    <details className="mt-3 rounded-xl bg-black/20 p-3">
      <summary className="cursor-pointer text-xs font-bold text-white/60">UPC and ISRC codes</summary>
      <div className="mt-3 space-y-2">
        <div>
          <label htmlFor={`upc-${entry.albumId}`} className="mb-1 block text-xs text-white/60">UPC</label>
          <input id={`upc-${entry.albumId}`} className={`${field} font-mono`} value={upc} onChange={e => setUpc(e.target.value)} />
        </div>
        {entry.tracks.map((t: any) => (
          <div key={t.id}>
            <label htmlFor={`isrc-${t.id}`} className="mb-1 block text-xs text-white/60">{t.title}</label>
            <input id={`isrc-${t.id}`} className={`${field} font-mono`} placeholder="ISRC" value={isrcs[t.id] || ''} onChange={e => setIsrcs(s => ({ ...s, [t.id]: e.target.value }))} />
          </div>
        ))}
        <button className={primary} disabled={a.busy} onClick={() => a.run(() => api('POST', `/${label.id}/catalog/${entry.albumId}/identifiers`, { upc, isrcs }), 'Codes saved.')}>Save codes</button>
        <Notice error={a.error} ok={a.ok} />
      </div>
    </details>
  );
};

const CatalogTab: React.FC<{ label: any; me: string }> = ({ label, me }) => {
  const [catalog, setCatalog] = useState<any[] | null>(null);
  const [linkable, setLinkable] = useState<any[]>([]);
  const [pick, setPick] = useState('');
  const load = useCallback(async () => {
    const [c, l] = await Promise.all([api('GET', `/${label.id}/catalog`), api('GET', `/${label.id}/linkable`)]);
    setCatalog(c.catalog); setLinkable(l.albums);
  }, [label.id]);
  const a = useAction(load);
  useEffect(() => { a.run(load); }, [load]); // eslint-disable-line react-hooks/exhaustive-deps
  const canManage = label.myRole === 'owner' || label.myRole === 'admin' || label.myRole === 'catalog';

  const exportSheet = () => {
    const rows: unknown[][] = [['Release', 'Artist', 'UPC', 'Track', 'ISRC', 'Ready']];
    for (const c of catalog || []) for (const t of c.tracks) rows.push([c.title, c.artist, c.upc, t.title, t.isrc, c.problems.some((p: any) => p.level === 'error') ? 'No' : 'Yes']);
    downloadCsv(`${label.name} catalog.csv`, rows);
  };

  return (
    <div className="space-y-4">
      <div className={card}>
        <h2 className={heading}>Add one of your albums</h2>
        <p className={`${muted} mt-1 mb-3`}>Only an album's owner can add it to a label. The album stays theirs.</p>
        {linkable.length ? (
          <div className="flex flex-wrap gap-2">
            <label className="sr-only" htmlFor="link-album">Album</label>
            <select id="link-album" className={`${field} max-w-sm flex-1`} value={pick} onChange={e => setPick(e.target.value)}>
              <option value="">Choose an album</option>
              {linkable.map(x => <option key={x.id} value={x.id}>{x.title}</option>)}
            </select>
            <button className={primary} disabled={a.busy || !pick} onClick={() => a.run(() => api('POST', `/${label.id}/catalog`, { albumId: pick }).then(() => setPick('')))}><Plus size={15} /> Add</button>
          </div>
        ) : <p className={muted}>You have no published albums to add.</p>}
      </div>
      <Notice error={a.error} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className={heading}>Releases{catalog ? ` (${catalog.length})` : ''}</h2>
        {!!catalog?.length && <button className={quiet} onClick={exportSheet}><Download size={14} /> Export metadata</button>}
      </div>
      {catalog && !catalog.length && <p className={muted}>No releases yet. Artists add theirs after they join the roster.</p>}
      {!catalog && <p className={muted}>Loading releases…</p>}
      <div className="grid gap-4 lg:grid-cols-2">
        {catalog?.map(c => {
          const errors = c.problems.filter((p: any) => p.level === 'error');
          const mine = c.ownerUid === me;
          return (
            <article key={c.albumId} className={card}>
              <div className="flex items-start gap-3">
                {c.coverUrl ? <img src={c.coverUrl} alt="" className="h-14 w-14 shrink-0 rounded-lg object-cover" /> : <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-white/5 text-white/30"><Disc3 size={20} /></div>}
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-sm font-bold text-white">{c.title}</h3>
                  <p className="truncate text-xs text-white/50">{c.artist}</p>
                  <p className={`mt-1 text-xs font-semibold ${errors.length ? 'text-amber-300' : 'text-emerald-300'}`}>{errors.length ? `${errors.length} to fix before distribution` : 'Ready to distribute'}</p>
                </div>
              </div>
              {!!c.problems.length && (
                <ul className="mt-3 list-inside list-disc space-y-0.5 text-xs text-white/60">{c.problems.slice(0, 5).map((p: any, i: number) => <li key={i}>{p.text}</li>)}{c.problems.length > 5 && <li>and {c.problems.length - 5} more</li>}</ul>
              )}
              <DealEditor label={label} entry={c} canEdit={canManage || mine} me={me} reload={load} />
              {(canManage || mine) && <Identifiers label={label} entry={c} reload={load} />}
              {(canManage || mine) && <button className={`${quiet} mt-3`} disabled={a.busy} onClick={() => { if (window.confirm(`End the deal for "${c.title}"? Earlier statements stay on record.`)) a.run(() => api('DELETE', `/${label.id}/catalog/${c.albumId}`)); }}>End deal</button>}
            </article>
          );
        })}
      </div>
    </div>
  );
};

// ── Royalties ────────────────────────────────────────────────────────────────

const statementRows = (s: any): unknown[][] => [
  ['Statement through', s.periodEnd, s.labelName || ''],
  [],
  ['Party', 'Opening', 'Earned', 'Recouped', 'Plajah sales received', 'Closing', 'Unrecouped'],
  ...s.parties.map((p: any) => [p.name, p.openingCents / 100, p.earnedCents / 100, p.recoupedCents / 100, p.directReceivedCents / 100, p.closingCents / 100, p.unrecoupedCents / 100]),
  [],
  ['Release', 'Distributor income', 'Plajah sales'],
  ...s.releases.map((r: any) => [r.title, r.externalCents / 100, r.directCents / 100]),
];

const PartyTable: React.FC<{ parties: StatementDraft['parties'] }> = ({ parties }) => (
  <div className="overflow-x-auto">
    <table className="w-full min-w-[34rem] text-sm">
      <thead><tr className="text-left text-xs text-white/50">
        <th scope="col" className="py-2 pr-3 font-semibold">Party</th>
        {['Opening', 'Earned', 'Recouped', 'Plajah sales received', 'Balance'].map(h => <th key={h} scope="col" className="py-2 pl-3 text-right font-semibold">{h}</th>)}
      </tr></thead>
      <tbody>
        {parties.map(p => (
          <tr key={p.id} className="border-t border-white/[0.06]">
            <th scope="row" className="py-2 pr-3 text-left font-semibold text-white">{p.name}</th>
            {[p.openingCents, p.earnedCents, p.recoupedCents, p.directReceivedCents].map((v, i) => <td key={i} className="py-2 pl-3 text-right tabular-nums text-white/70">{money(v)}</td>)}
            <td className={`py-2 pl-3 text-right font-bold tabular-nums ${p.closingCents < 0 ? 'text-amber-300' : 'text-white'}`}>{money(p.closingCents)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

const RoyaltiesTab: React.FC<{ label: any; isFinance: boolean }> = ({ label, isFinance }) => {
  const [imports, setImports] = useState<any[]>([]);
  const [recoupables, setRecoupables] = useState<any[]>([]);
  const [statements, setStatements] = useState<any[]>([]);
  const [catalog, setCatalog] = useState<any[]>([]);
  const [source, setSource] = useState('');
  const [month, setMonth] = useState('');
  const [through, setThrough] = useState(lastMonth());
  const [preview, setPreview] = useState<{ draft: StatementDraft; blocked: string | null } | null>(null);
  const [rc, setRc] = useState({ partyId: '', amount: '', date: new Date().toLocaleDateString('en-CA'), kind: 'advance', note: '' });
  const [imported, setImported] = useState('');

  const load = useCallback(async () => {
    const [st, re] = await Promise.all([api('GET', `/${label.id}/statements`), api('GET', `/${label.id}/recoupables`)]);
    setStatements(st.statements); setRecoupables(re.recoupables);
    if (isFinance) {
      const [im, ca] = await Promise.all([api('GET', `/${label.id}/imports`), api('GET', `/${label.id}/catalog`)]);
      setImports(im.imports); setCatalog(ca.catalog);
    }
    setPreview(null);
  }, [label.id, isFinance]);
  const a = useAction(load);
  // No reload afterwards: `load` clears the preview because anything else changing makes it stale.
  const previewing = useAction();
  useEffect(() => { a.run(load); }, [load]); // eslint-disable-line react-hooks/exhaustive-deps

  const parties = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of catalog) for (const p of c.parties) if (p.id !== LABEL_PARTY) m.set(p.id, p.name);
    return [...m];
  }, [catalog]);
  const nameOf = (id: string) => parties.find(p => p[0] === id)?.[1] || label.artists?.[id]?.name || 'Artist';

  const onFile = (file: File | undefined) => {
    if (!file) return;
    a.run(async () => {
      if (file.size > 8 * 1024 * 1024) throw new Error('That file is over 8 MB. Split it into smaller files.');
      const out = await api('POST', `/${label.id}/imports`, { csv: await file.text(), source, filename: file.name, month: isMonth(month) ? month : undefined });
      const s = out.skipped;
      const dropped = [s.noIdentifier && `${s.noIdentifier} with no valid ISRC or UPC`, s.badAmount && `${s.badAmount} with an unreadable amount`, s.otherCurrency && `${s.otherCurrency} not in USD`, s.noMonth && `${s.noMonth} with no month`].filter(Boolean);
      setImported(`Read ${out.lineCount} lines into ${out.rowCount} recording-months.${dropped.length ? ` Left out: ${dropped.join(', ')}.` : ''}`);
    });
  };

  return (
    <div className="space-y-4">
      {isFinance && <>
        <div className={card}>
          <h2 className={heading}>Add a distributor report</h2>
          <p className={`${muted} mt-1 mb-3`}>Upload the CSV from any distributor. It needs an amount column and ISRC or UPC. Only USD lines are read for now.</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label htmlFor="imp-source" className="mb-1 block text-xs font-semibold text-white/60">Distributor</label>
              <input id="imp-source" className={field} placeholder="DistroKid" value={source} onChange={e => setSource(e.target.value)} />
            </div>
            <div>
              <label htmlFor="imp-month" className="mb-1 block text-xs font-semibold text-white/60">Month, if the file has none</label>
              <input id="imp-month" type="month" className={field} value={month} onChange={e => setMonth(e.target.value)} />
            </div>
            <div className="flex items-end">
              <label className={`${primary} w-full cursor-pointer ${!source.trim() || a.busy ? 'pointer-events-none opacity-40' : ''}`}>
                <Upload size={15} /> Choose CSV
                <input type="file" accept=".csv,.tsv,text/csv" className="sr-only" disabled={!source.trim() || a.busy} onChange={e => { onFile(e.target.files?.[0]); e.target.value = ''; }} />
              </label>
            </div>
          </div>
          {imported && <div className="mt-3"><Notice ok={imported} /></div>}
          {!!imports.length && (
            <ul className="mt-3 divide-y divide-white/[0.06]">
              {imports.map(i => (
                <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <span className="min-w-0 truncate text-white/80"><FileSpreadsheet size={14} className="mr-1.5 inline text-white/40" />{i.source}: {i.filename || 'report'}</span>
                  <span className="flex items-center gap-3">
                    <span className="tabular-nums text-white">{money(Math.round(i.totalMicros / 1e4))}</span>
                    <button className="text-white/40 hover:text-red-300" aria-label={`Remove ${i.filename || 'report'}`} onClick={() => a.run(() => api('DELETE', `/${label.id}/imports/${i.id}`))}><Trash2 size={14} /></button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className={card}>
          <h2 className={heading}>Advances and expenses</h2>
          <p className={`${muted} mt-1 mb-3`}>Recouped from that party's earnings before anything is owed to them.</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div>
              <label htmlFor="rc-party" className="mb-1 block text-xs font-semibold text-white/60">From</label>
              <select id="rc-party" className={field} value={rc.partyId} onChange={e => setRc({ ...rc, partyId: e.target.value })}>
                <option value="">Choose</option>
                {parties.map(([id, n]) => <option key={id} value={id}>{n}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="rc-kind" className="mb-1 block text-xs font-semibold text-white/60">Type</label>
              <select id="rc-kind" className={field} value={rc.kind} onChange={e => setRc({ ...rc, kind: e.target.value })}><option value="advance">Advance</option><option value="expense">Expense</option></select>
            </div>
            <div>
              <label htmlFor="rc-amount" className="mb-1 block text-xs font-semibold text-white/60">Amount ($)</label>
              <input id="rc-amount" className={field} inputMode="decimal" value={rc.amount} onChange={e => setRc({ ...rc, amount: e.target.value })} />
            </div>
            <div>
              <label htmlFor="rc-date" className="mb-1 block text-xs font-semibold text-white/60">Date</label>
              <input id="rc-date" type="date" className={field} value={rc.date} onChange={e => setRc({ ...rc, date: e.target.value })} />
            </div>
            <div>
              <label htmlFor="rc-note" className="mb-1 block text-xs font-semibold text-white/60">Note</label>
              <input id="rc-note" className={field} value={rc.note} onChange={e => setRc({ ...rc, note: e.target.value })} />
            </div>
          </div>
          <button className={`${primary} mt-3`} disabled={a.busy || !rc.partyId || !(toCents(rc.amount) > 0)} onClick={() => a.run(() => api('POST', `/${label.id}/recoupables`, { partyId: rc.partyId, amountCents: toCents(rc.amount), date: rc.date, kind: rc.kind, note: rc.note }).then(() => setRc(x => ({ ...x, amount: '', note: '' }))))}><Plus size={15} /> Add</button>
        </div>

        <div className={card}>
          <h2 className={heading}>Prepare a statement</h2>
          <p className={`${muted} mt-1 mb-3`}>Covers everything not yet on a statement, through the month you pick. Late lines from earlier months are included.</p>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label htmlFor="st-through" className="mb-1 block text-xs font-semibold text-white/60">Through</label>
              <input id="st-through" type="month" className={field} value={through} onChange={e => { setThrough(e.target.value); setPreview(null); }} />
            </div>
            <button className={quiet} disabled={previewing.busy || !through} onClick={() => previewing.run(async () => setPreview(await api('GET', `/${label.id}/statements/preview?through=${through}`)))}><Receipt size={14} /> Preview</button>
          </div>
          <div className="mt-3"><Notice error={previewing.error} /></div>
          {preview && (
            <div className="mt-4 space-y-3">
              <p className="text-sm text-white/80">Income {money(preview.draft.totals.incomeCents)}: {money(preview.draft.totals.externalCents)} from distributors and {money(preview.draft.totals.directCents)} from Plajah sales.</p>
              <PartyTable parties={preview.draft.parties} />
              {!!preview.draft.unmatched.length && (
                <div className="rounded-xl bg-amber-400/10 p-3 text-sm text-amber-200">
                  <b>{money(preview.draft.unmatched.reduce((s, u) => s + u.cents, 0))} isn't matched to a release</b> and won't be on this statement. Add the code to the release in Catalog, then preview again.
                  <ul className="mt-1 font-mono text-xs">{preview.draft.unmatched.slice(0, 8).map(u => <li key={u.key + u.month + u.source}>{u.key} ({u.month}, {u.source}): {money(u.cents)}</li>)}</ul>
                </div>
              )}
              {preview.draft.warnings.map(w => <Notice key={w} error={w} />)}
              {preview.blocked
                ? <Notice error={preview.blocked} />
                : <button className={primary} disabled={a.busy} onClick={() => { if (window.confirm(`Finalize the statement through ${monthLabel(through)}? It can't be edited afterwards.`)) a.run(() => api('POST', `/${label.id}/statements`, { through }), 'Statement finalized. Artists on it can now see their side.'); }}>Finalize statement</button>}
            </div>
          )}
        </div>
      </>}

      <Notice error={a.error} ok={a.ok} />

      <div className={card}>
        <h2 className={`${heading} mb-3`}>Statements</h2>
        {!statements.length && <p className={muted}>No finalized statements yet.</p>}
        <div className="space-y-5">
          {statements.map(s => (
            <section key={s.id} aria-label={`Statement through ${monthLabel(s.periodEnd)}`}>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-white">Through {monthLabel(s.periodEnd)}</h3>
                <button className={quiet} onClick={() => downloadCsv(`${label.name} statement ${s.periodEnd}.csv`, statementRows(s))}><Download size={14} /> CSV</button>
              </div>
              {!isFinance && s.parties.map((p: any) => {
                const paid = (s.payments || []).filter((x: any) => x.partyId === p.id).reduce((n: number, x: any) => n + x.amountCents, 0);
                const left = p.closingCents - paid;
                return (
                  <p key={p.id} className="mb-2 text-sm font-semibold text-white">
                    {left > 0 ? `${s.labelName || label.name} owes you ${money(left)}.` : left < 0 ? `You're ${money(-left)} ahead. This comes off future earnings.` : 'Nothing is owed on this statement.'}
                    {p.unrecoupedCents > 0 && <span className="block text-xs font-normal text-white/50">{money(p.unrecoupedCents)} of advances and expenses still to recoup.</span>}
                  </p>
                );
              })}
              <PartyTable parties={s.parties} />
              {!!s.payments?.length && (
                <ul className="mt-2 space-y-0.5 text-xs text-white/60">{s.payments.map((p: any, i: number) => <li key={i}>Paid {money(p.amountCents)} to {s.parties.find((x: any) => x.id === p.partyId)?.name} on {new Date(p.at).toLocaleDateString()}{p.reference ? ` (${p.reference})` : ''}</li>)}</ul>
              )}
              {isFinance && <RecordPayment label={label} statement={s} onDone={load} />}
            </section>
          ))}
        </div>
      </div>

      {!!recoupables.length && (
        <div className={card}>
          <h2 className={`${heading} mb-3`}>Advances and expenses on record</h2>
          <ul className="divide-y divide-white/[0.06]">
            {recoupables.map(r => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <span className="text-white/80">{r.date}: {r.kind}{isFinance ? ` for ${nameOf(r.partyId)}` : ''}{r.note ? `, ${r.note}` : ''}</span>
                <span className="flex items-center gap-3">
                  <span className="tabular-nums text-white">{money(r.amountCents)}</span>
                  {isFinance && <button className="text-white/40 hover:text-red-300" aria-label="Remove this entry" onClick={() => a.run(() => api('DELETE', `/${label.id}/recoupables/${r.id}`))}><Trash2 size={14} /></button>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

const RecordPayment: React.FC<{ label: any; statement: any; onDone: () => void }> = ({ label, statement, onDone }) => {
  const owed = statement.parties.filter((p: any) => p.id !== LABEL_PARTY && (statement.closing?.[p.id]?.balanceCents - (statement.closing?.[p.id]?.paidCents || 0)) > 0);
  const [partyId, setPartyId] = useState('');
  const [amount, setAmount] = useState('');
  const [reference, setReference] = useState('');
  const a = useAction(onDone);
  if (!owed.length) return null;
  return (
    <details className="mt-3 rounded-xl bg-black/20 p-3">
      <summary className="cursor-pointer text-xs font-bold text-white/60">Record a payment</summary>
      <p className="mt-2 text-xs text-white/50">For money you've already sent outside Plajah. This doesn't send anything.</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <select aria-label="Paid to" className={`${field} flex-1`} value={partyId} onChange={e => setPartyId(e.target.value)}>
          <option value="">Paid to</option>
          {owed.map((p: any) => <option key={p.id} value={p.id}>{p.name}: {money(statement.closing[p.id].balanceCents - (statement.closing[p.id].paidCents || 0))} owed</option>)}
        </select>
        <input aria-label="Amount in dollars" className={`${field} w-28`} inputMode="decimal" placeholder="Amount" value={amount} onChange={e => setAmount(e.target.value)} />
        <input aria-label="Reference" className={`${field} flex-1`} placeholder="Reference" value={reference} onChange={e => setReference(e.target.value)} />
        <button className={primary} disabled={a.busy || !partyId || !(toCents(amount) > 0)} onClick={() => a.run(() => api('POST', `/${label.id}/statements/${statement.id}/payments`, { partyId, amountCents: toCents(amount), reference }))}>Record</button>
      </div>
      <div className="mt-2"><Notice error={a.error} /></div>
    </details>
  );
};

// ── Team ─────────────────────────────────────────────────────────────────────

const ROLE_INFO: Record<string, string> = {
  admin: 'Everything, including the team',
  finance: 'Reports, advances and statements',
  catalog: 'Roster, releases and codes',
  viewer: 'Look, but no statements',
};

const TeamTab: React.FC<{ label: any; me: string; reload: () => void }> = ({ label, me, reload }) => {
  const [role, setRole] = useState('catalog');
  const [code, setCode] = useState('');
  const a = useAction(reload);
  const canManage = label.myRole === 'owner' || label.myRole === 'admin';
  return (
    <div className="space-y-4">
      {canManage && (
        <div className={card}>
          <h2 className={`${heading} mb-3`}>Invite to the team</h2>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label htmlFor="team-role" className="mb-1 block text-xs font-semibold text-white/60">Role</label>
              <select id="team-role" className={field} value={role} onChange={e => setRole(e.target.value)}>
                {Object.entries(ROLE_INFO).map(([k, v]) => <option key={k} value={k}>{k[0].toUpperCase() + k.slice(1)}: {v}</option>)}
              </select>
            </div>
            <button className={primary} disabled={a.busy} onClick={() => a.run(async () => setCode((await api('POST', `/${label.id}/invites`, { kind: 'team', role })).code))}><Plus size={15} /> Create invite</button>
          </div>
          {code && <div className="mt-3"><InviteCode code={code} /></div>}
        </div>
      )}
      <Notice error={a.error} ok={a.ok} />
      <div className={card}>
        <h2 className={`${heading} mb-3`}>Team</h2>
        <ul className="divide-y divide-white/[0.06]">
          {Object.entries<any>(label.members || {}).map(([uid, m]) => (
            <li key={uid} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="text-sm font-semibold text-white">{m.name}{uid === me && <span className="ml-2 text-xs font-normal text-white/40">You</span>}</div>
              <div className="flex items-center gap-2">
                {canManage && m.role !== 'owner' ? (
                  <select aria-label={`Role for ${m.name}`} className={field} value={m.role} disabled={a.busy} onChange={e => a.run(() => api('PATCH', `/${label.id}/members/${uid}`, { role: e.target.value }))}>
                    {Object.keys(ROLE_INFO).map(k => <option key={k} value={k}>{k[0].toUpperCase() + k.slice(1)}</option>)}
                  </select>
                ) : <span className="text-xs capitalize text-white/50">{m.role}</span>}
                {m.role !== 'owner' && (canManage || uid === me) && <button className={quiet} disabled={a.busy} onClick={() => a.run(() => api('DELETE', `/${label.id}/members/${uid}`))}>{uid === me ? 'Leave' : 'Remove'}</button>}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

// ── Shell ────────────────────────────────────────────────────────────────────

type Tab = 'catalog' | 'royalties' | 'roster' | 'team';

export const LabelDesk: React.FC = () => {
  const [me, setMe] = useState('');
  const [labels, setLabels] = useState<any[] | null>(null);
  const [activeId, setActiveId] = useState('');
  const [label, setLabel] = useState<any>(null);
  const [adding, setAdding] = useState(false);
  const [tab, setTab] = useState<Tab>('catalog');
  const [error, setError] = useState('');

  const refresh = useCallback(async (select?: string) => {
    setError('');
    try {
      const who = await labelIdentity();
      if (!who) { setError('Sign in to use the Label Desk.'); setLabels([]); return; }
      setMe(who.uid);
      const { labels: list } = await api('GET', '');
      setLabels(list);
      const id = select || activeId || list[0]?.id || '';
      setActiveId(id);
      setLabel(id ? (await api('GET', `/${id}`)).label : null);
      if (select) setAdding(false);
    } catch (e: any) { setError(e.message); setLabels(l => l ?? []); }
  }, [activeId]);
  useEffect(() => { refresh(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const reload = useCallback(() => { refresh(); }, [refresh]);
  const switchLabel = (id: string) => { setActiveId(id); setTab('catalog'); refresh(id); };

  if (!labels) return <p className={muted}>Loading…</p>;
  const hasLabel = !!label && !adding;
  const isTeam = !!label?.myRole;
  const isFinance = label?.myRole === 'owner' || label?.myRole === 'admin' || label?.myRole === 'finance';
  const canRoster = label?.myRole === 'owner' || label?.myRole === 'admin' || label?.myRole === 'catalog';
  const tabs: { id: Tab; text: string; icon: React.ReactNode; show: boolean }[] = [
    { id: 'catalog', text: 'Catalog', icon: <Disc3 size={14} />, show: true },
    { id: 'royalties', text: 'Royalties', icon: <Receipt size={14} />, show: isFinance || !!label?.isArtist },
    { id: 'roster', text: 'Roster', icon: <Users size={14} />, show: canRoster },
    { id: 'team', text: 'Team', icon: <Building2 size={14} />, show: isTeam },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-lg font-bold text-white">{hasLabel ? label.name : 'Label Desk'}</h1>
          {hasLabel && <p className="text-xs text-white/50">{label.myRole ? label.myRole[0].toUpperCase() + label.myRole.slice(1) : 'Artist on this roster'}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {labels.length > 1 && !adding && (
            <select aria-label="Switch label" className={`${field} w-auto`} value={activeId} onChange={e => switchLabel(e.target.value)}>
              {labels.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          )}
          {!!labels.length && <button className={quiet} onClick={() => setAdding(x => !x)}>{adding ? 'Back' : <><Plus size={14} /> New or join</>}</button>}
        </div>
      </div>
      <Notice error={error} />
      {!hasLabel ? <Start onDone={id => refresh(id)} /> : (
        <>
          <div role="tablist" aria-label="Label sections" className="flex gap-1 overflow-x-auto border-b border-white/[0.08]">
            {tabs.filter(t => t.show).map(t => (
              <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
                className={`flex shrink-0 items-center gap-2 border-b-2 px-3 py-2 text-sm font-semibold transition ${tab === t.id ? 'text-white' : 'border-transparent text-white/50 hover:text-white'}`}
                style={tab === t.id ? { borderColor: ACCENT } : undefined}>{t.icon}{t.text}</button>
            ))}
          </div>
          {tab === 'catalog' && <CatalogTab key={label.id} label={label} me={me} />}
          {tab === 'royalties' && <RoyaltiesTab key={label.id} label={label} isFinance={isFinance} />}
          {tab === 'roster' && canRoster && <RosterTab label={label} reload={reload} />}
          {tab === 'team' && isTeam && <TeamTab label={label} me={me} reload={reload} />}
        </>
      )}
    </div>
  );
};

export default LabelDesk;
