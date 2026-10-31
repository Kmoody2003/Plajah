import React, { useCallback, useEffect, useState } from 'react';
import { Download, Loader2, ShieldAlert, ShieldCheck, UserX, X } from 'lucide-react';
import type { TelaDoc } from '../../types';
import type { UseCoedit } from '../../hooks/useCoedit';
import { auth } from '../../services/firebase';
import { revokeEveryone, revokeMember, ROLE_LABEL, setMemberExpiry, type CoProject } from '../../services/coedit/project';
import { AUDIT_LABEL, auditCsv, listDocAudit, type DocAuditEvent } from '../../services/coedit/audit';
import { cleanTelaDoc, THREAT_LABEL, type TelaThreat } from '../../services/tela/telaSecurity';

const heading = 'text-[10px] font-black uppercase tracking-widest text-white/40 mb-2';
const smallBtn = 'h-7 px-2.5 rounded-[8px] text-[.68rem] font-bold bg-white/[.06] hover:bg-white/[.12] text-white/80 inline-flex items-center gap-1.5 disabled:opacity-50';

const toLocalInput = (ms?: number) => {
  if (!ms) return '';
  const d = new Date(ms - new Date(ms).getTimezoneOffset() * 60000);
  return d.toISOString().slice(0, 16);
};

const MemberAccess: React.FC<{ project: CoProject; uid: string }> = ({ project, uid }) => {
  const name = project.names?.[uid] || 'Collaborator';
  const [busy, setBusy] = useState(false);
  const revoke = async () => {
    const reason = window.prompt(`Revoke ${name}'s access? Their app removes its copy of this document the next time it's online. Reason for the record (optional):`, '');
    if (reason === null) return;
    setBusy(true);
    try { await revokeMember(project, uid, reason.trim()); } catch (e: any) { window.alert(e?.message || 'Could not revoke access.'); } finally { setBusy(false); }
  };
  return (
    <div className="flex flex-wrap items-center gap-2 py-1.5 border-b border-white/[.06] last:border-0">
      <div className="min-w-[120px] flex-1">
        <div className="text-[.74rem] font-semibold text-white truncate">{name}</div>
        <div className="text-[.62rem] text-white/45">{ROLE_LABEL[project.members[uid]]}</div>
      </div>
      <label className="text-[.62rem] text-white/45 flex items-center gap-1.5">
        Ends
        <input
          type="datetime-local"
          className="h-7 rounded-[6px] bg-black/30 border border-white/10 text-[.66rem] text-white/80 px-1.5"
          value={toLocalInput(project.expires?.[uid])}
          onChange={e => void setMemberExpiry(project, uid, e.target.value ? new Date(e.target.value).getTime() : null)}
        />
      </label>
      <button className={`${smallBtn} text-red-300`} disabled={busy} onClick={() => void revoke()}><UserX size={12} /> Revoke</button>
    </div>
  );
};

/** A document's safety scan, who can reach it, and its paper trail. */
export const TelaSecurityPanel: React.FC<{
  doc: TelaDoc;
  co: UseCoedit<TelaDoc>;
  threats: TelaThreat[];
  onClean: (doc: TelaDoc, threats: TelaThreat[]) => void;
  onClose: () => void;
}> = ({ doc, co, threats, onClean, onClose }) => {
  const uid = auth.currentUser?.uid;
  const project = co.project;
  const isOwner = !!uid && (project ? project.ownerId === uid : doc.ownerId === uid);
  const [events, setEvents] = useState<DocAuditEvent[] | null>(null);
  const [trailNote, setTrailNote] = useState('');
  const [scanNote, setScanNote] = useState('');
  const auditTarget = { pid: co.projectId || '', ownerId: project?.ownerId || doc.ownerId, ...(doc.orgOrigin?.orgId ? { orgId: doc.orgOrigin.orgId } : {}) };

  const loadTrail = useCallback(() => {
    setTrailNote('');
    listDocAudit(auditTarget).then(setEvents).catch(() => { setEvents([]); setTrailNote("Only this document's owner and its organization's IT Admins can read the trail."); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auditTarget.pid, auditTarget.ownerId, auditTarget.orgId]);
  useEffect(loadTrail, [loadTrail]);

  const scan = () => {
    const result = cleanTelaDoc(doc);
    if (result.threats.length) onClean(result.doc, result.threats);
    setScanNote(result.threats.length ? `Removed ${result.threats.length} unsafe ${result.threats.length === 1 ? 'item' : 'items'}.` : 'Nothing unsafe found.');
  };

  const revokeAll = async () => {
    if (!project) return;
    const reason = window.prompt('Revoke everyone except you? Reason for the record (optional):', '');
    if (reason === null) return;
    try { await revokeEveryone(project, reason.trim()); } catch (e: any) { window.alert(e?.message || 'Could not revoke access.'); }
  };

  const downloadTrail = () => {
    const url = URL.createObjectURL(new Blob([auditCsv(events || [])], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = `${(doc.title || 'document').replace(/[^\w-]+/g, '_')}-paper-trail.csv`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const others = project ? project.memberIds.filter(m => m !== project.ownerId) : [];

  return (
    <div className="fixed inset-0 z-[9000] grid place-items-center bg-black/60 p-4" role="dialog" aria-label="Document security" onClick={onClose}>
      <div className="w-full max-w-[560px] max-h-[86vh] overflow-y-auto rounded-2xl border border-white/10 bg-[#141418] p-5 space-y-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2">
          {threats.length ? <ShieldAlert size={18} className="text-amber-300" /> : <ShieldCheck size={18} className="text-[#34e0d0]" />}
          <h2 className="text-sm font-bold text-white flex-1 truncate">Security · {doc.title || 'Untitled canvas'}</h2>
          <button className="text-white/50 hover:text-white" aria-label="Close" onClick={onClose}><X size={16} /></button>
        </div>

        <section>
          <div className={heading}>Unsafe content</div>
          <p className="text-xs text-white/60 mb-2">Tela checks a document whenever it opens or changes from someone else. Code is removed before it can run; your words and images stay.</p>
          {threats.length > 0 && (
            <ul className="space-y-1.5 mb-2">
              {threats.slice(0, 30).map((t, i) => (
                <li key={i} className="rounded-lg bg-amber-300/[.07] border border-amber-300/20 px-2.5 py-1.5">
                  <div className="text-[.7rem] font-bold text-amber-200">{THREAT_LABEL[t.kind]} · {t.where}</div>
                  <code className="block text-[.62rem] text-white/50 break-all">{t.sample}</code>
                </li>
              ))}
            </ul>
          )}
          <div className="flex items-center gap-2">
            <button className={smallBtn} onClick={scan}>Scan now</button>
            {scanNote && <span className="text-[.68rem] text-white/60">{scanNote}</span>}
          </div>
        </section>

        <section>
          <div className={heading}>Who can reach it</div>
          {!project ? (
            <p className="text-xs text-white/60">Only you. Nobody else can open this document until you share it.</p>
          ) : isOwner ? (
            <>
              {others.length === 0 && <p className="text-xs text-white/60">Only you so far.</p>}
              {others.map(m => <MemberAccess key={m} project={project} uid={m} />)}
              {others.length > 1 && <button className={`${smallBtn} text-red-300 mt-2`} onClick={() => void revokeAll()}><UserX size={12} /> Revoke everyone</button>}
              <p className="text-[.66rem] text-white/40 mt-2">Revoking closes the document and its history and removes the copy in Plajah on their devices. Files they already exported aren't recalled.</p>
            </>
          ) : (
            <p className="text-xs text-white/60">{project.names?.[project.ownerId] || 'The owner'} manages who can reach this document.</p>
          )}
        </section>

        <section>
          <div className="flex items-center justify-between mb-2">
            <div className={`${heading} mb-0`}>Paper trail</div>
            {!!events?.length && <button className={smallBtn} onClick={downloadTrail}><Download size={12} /> CSV</button>}
          </div>
          {events === null ? <Loader2 size={14} className="animate-spin text-white/40" />
            : trailNote ? <p className="text-xs text-white/60">{trailNote}</p>
            : !events.length ? <p className="text-xs text-white/60">Nothing recorded yet.</p>
            : (
              <ul className="space-y-1">
                {events.map(e => (
                  <li key={e.id} className="text-[.68rem] text-white/70 flex gap-2">
                    <span className="text-white/35 shrink-0 w-[118px]">{e.at ? new Date(e.at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : 'Just now'}</span>
                    <span className="min-w-0 break-words"><b className="text-white/85">{e.byName}</b> · {AUDIT_LABEL[e.action] || e.action}{e.detail ? ` · ${e.detail}` : ''}</span>
                  </li>
                ))}
              </ul>
            )}
          <p className="text-[.66rem] text-white/40 mt-2">Entries can't be edited or deleted, by anyone, and stay after the document is gone.</p>
        </section>
      </div>
    </div>
  );
};

export default TelaSecurityPanel;
