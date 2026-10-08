// DeleteOrgDialog — permanent organization deletion with a typed-name confirmation.
// Shows exactly what goes away and what is sealed (financial records are append-only and cannot be erased),
// and offers a records download first so nothing is lost by accident.
import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Download, Loader2, Trash2, X } from 'lucide-react';
import type { Organization } from '../../types';
import { deleteElevateOrg, previewOrgDeletion, type OrgDeletionPreview } from '../../services/elevateService';

const DeleteOrgDialog: React.FC<{ org: Organization; onClose: () => void; onDeleted: () => void }> = ({ org, onClose, onDeleted }) => {
  const [preview, setPreview] = useState<OrgDeletionPreview | null>(null);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [downloaded, setDownloaded] = useState(false);
  const [dlBusy, setDlBusy] = useState(false);

  useEffect(() => { previewOrgDeletion(org.id).then(setPreview).catch(() => setPreview(null)); }, [org.id]);

  const hasRecords = !!preview && (preview.people > 0 || preview.gifts > 0 || preview.journals > 0);
  const matches = typed.trim().toLowerCase() === org.name.trim().toLowerCase();

  const download = async () => {
    setDlBusy(true); setErr('');
    try {
      const { downloadFullBundle } = await import('../../services/chmsExport');
      await downloadFullBundle(org.id, org.name);
      setDownloaded(true);
    } catch (e: any) { setErr(e?.message || 'Could not prepare the download. You may not have access to the records.'); }
    setDlBusy(false);
  };

  const remove = async () => {
    if (!matches) return;
    setBusy(true); setErr('');
    try { await deleteElevateOrg(org); onDeleted(); }
    catch (e: any) { setErr(e?.message || 'Could not delete the organization.'); setBusy(false); }
  };

  const row = (label: string, n: number | undefined) => n ? <li className="flex justify-between"><span>{label}</span><span className="font-black text-white">{n.toLocaleString()}</span></li> : null;

  return createPortal(
    <div className="fixed inset-0 z-[400] bg-black/80 backdrop-blur flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={`Delete ${org.name}`}>
      <div className="w-full max-w-md max-h-[90vh] overflow-y-auto bg-[#0c0c0f] border border-red-500/30 rounded-3xl p-6 relative">
        <button onClick={onClose} disabled={busy} className="absolute top-4 right-4 text-white/40 hover:text-white" aria-label="Close"><X size={16} /></button>
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2.5 bg-red-500/15 rounded-xl"><AlertTriangle className="text-red-400" size={20} /></div>
          <h2 className="text-lg font-black uppercase tracking-tight text-white">Delete {org.name}?</h2>
        </div>
        <p className="text-sm text-white/60 leading-relaxed mb-4">This permanently removes the organization page and its community. <b className="text-white">It cannot be undone.</b></p>

        <div className="rounded-2xl bg-white/[0.04] border border-white/10 p-4 mb-4 text-xs text-white/55">
          <p className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-2">What will be removed</p>
          <ul className="space-y-1">
            <li className="flex justify-between"><span>The public page, ministries & settings</span><span className="font-black text-white">✓</span></li>
            {row('Members & roles', preview?.members)}
            {row('Invites', preview?.invites)}
            {row('Followers', preview?.followers)}
            {row('Prayer requests', preview?.prayers)}
            {row('Congregation records', preview?.people)}
            <li className="flex justify-between"><span>Announcements & threads</span><span className="font-black text-white">✓</span></li>
          </ul>
          {!preview && <p className="mt-2 text-white/30">Counting…</p>}
        </div>

        {(preview?.gifts || preview?.journals) ? (
          <div className="rounded-2xl bg-amber-500/10 border border-amber-500/30 p-4 mb-4 text-xs text-amber-100/90 leading-relaxed">
            <p className="font-black uppercase tracking-widest text-[10px] text-amber-300 mb-1.5">Financial records are sealed, not erased</p>
            {preview.gifts.toLocaleString()} gift{preview.gifts === 1 ? '' : 's'} and {preview.journals.toLocaleString()} journal entr{preview.journals === 1 ? 'y' : 'ies'} are append-only for audit integrity. They stay in storage but become inaccessible once the organization is deleted. <b>Download a copy first</b> if you may need them for taxes or an audit.
          </div>
        ) : null}

        {hasRecords && (
          <button onClick={download} disabled={dlBusy} className="w-full mb-4 flex items-center justify-center gap-2 py-3 rounded-full border border-white/15 bg-white/5 text-white/80 hover:bg-white/10 text-[10px] font-black uppercase tracking-widest disabled:opacity-40">
            {dlBusy ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />} {downloaded ? 'Downloaded — download again' : 'Download my records first'}
          </button>
        )}

        <label className="block text-[10px] font-black uppercase tracking-widest text-white/40 mb-2">Type <span className="text-white">{org.name}</span> to confirm</label>
        <input value={typed} onChange={e => setTyped(e.target.value)} disabled={busy} autoComplete="off" placeholder={org.name}
          className="w-full bg-black/40 border border-white/10 rounded-2xl px-4 py-3 text-sm text-white outline-none focus:border-red-400/60 placeholder:text-white/20 mb-4" />

        {err && <p className="text-xs text-red-400 mb-3">{err}</p>}

        <div className="flex gap-2">
          <button onClick={onClose} disabled={busy} className="flex-1 py-3 rounded-full bg-white/5 border border-white/10 text-white/70 text-[10px] font-black uppercase tracking-widest hover:bg-white/10">Keep it</button>
          <button onClick={remove} disabled={!matches || busy} className="flex-1 py-3 rounded-full bg-red-500 text-white text-[10px] font-black uppercase tracking-widest hover:brightness-110 disabled:opacity-30 flex items-center justify-center gap-2">
            {busy ? <><Loader2 size={13} className="animate-spin" /> Deleting…</> : <><Trash2 size={13} /> Delete forever</>}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default DeleteOrgDialog;
