import React, { useEffect, useMemo, useState } from 'react';
import { collection, query, where, limit, onSnapshot, doc, writeBatch, setDoc, serverTimestamp } from 'firebase/firestore';
import { Flag, CheckCircle2, Trash2, AlertTriangle, Ban, ShieldOff } from 'lucide-react';
import { db, auth } from '../../services/firebase';
import {
  triageReports, availableActions, ageLabel, RESOLUTION_FOR, SUSPEND_DAYS,
  type QueueReport, type ReportGroup, type ReportAction,
} from '../../services/reportTriageCore';
import { createEnforcementAction } from '../../services/enforcement/enforcementApi';
import { ruleTextFor } from '../../services/enforcement/standingCore';
import AppealsQueuePanel from '../enforcement/AppealsQueuePanel';

/**
 * Admin queue of OPEN content_reports (rules: staff read/update). Grouped per reported target,
 * ranked by severity / distinct reporters / age. Every action resolves ALL open reports for the
 * target with status + reviewer + resolution. Warn/suspend go through Fair Process
 * (POST /api/enforcement/action → enforcement_actions + user_sanctions.actions + user notice + appeal
 * rights; enforced by standingCore/requireCapability). Warn = LIMITED_REACH for WARN_HOURS; suspend =
 * RESTRICTED_PUBLIC for SUSPEND_DAYS (never a full lockout). Reporter-block stays a direct
 * user_sanctions write; `reportBlocked` IS enforced (content_reports create rule).
 */
const WARN_HOURS = 72;
const toMs = (t: any): number => (t?.toMillis ? t.toMillis() : typeof t === 'number' ? t : 0);

const ACTION_META: Record<ReportAction, { label: string; Icon: React.ComponentType<{ size?: number }>; danger?: boolean }> = {
  dismiss: { label: 'Dismiss', Icon: CheckCircle2 },
  remove_content: { label: 'Remove content', Icon: Trash2, danger: true },
  warn_author: { label: 'Warn · limit reach 3d', Icon: AlertTriangle },
  suspend_author: { label: `Pause public posting ${SUSPEND_DAYS}d`, Icon: Ban, danger: true },
  block_reporter_spam: { label: 'Block reporter (spam)', Icon: ShieldOff },
};

const ReportsQueue: React.FC = () => {
  const [reports, setReports] = useState<QueueReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'content_reports'), where('status', '==', 'OPEN'), limit(300)),
      snap => {
        setReports(snap.docs.map(d => {
          const x = d.data() as any;
          return {
            id: d.id, contentId: String(x.contentId ?? ''), contentType: String(x.contentType ?? 'post'), reason: String(x.reason ?? 'other'),
            reporterId: x.reporterId, authorId: x.authorId, details: x.details, snapshot: x.snapshot, parentId: x.parentId, createdAtMs: toMs(x.createdAt),
          } as QueueReport;
        }));
        setNow(Date.now()); setLoading(false);
      },
      e => { setErr(e?.message || 'Could not load reports'); setLoading(false); },
    );
    return unsub;
  }, []);

  const groups = useMemo(() => triageReports(reports.filter(r => r.contentId !== 'pre-publish'), now), [reports, now]);

  const act = async (g: ReportGroup, action: ReportAction) => {
    const reviewer = auth.currentUser?.uid;
    if (!reviewer) return;
    if (action === 'remove_content' && !window.confirm('Remove the reported content? It is hidden everywhere and its media links are revoked, but the record is kept (evidence + appeals).')) return;
    setBusy(g.key + action); setErr('');
    try {
      if (action === 'remove_content') {
        // SOFT remove on the server (routes/trustSafety.ts): moderationStatus:'removed' + removedAt/By, media
        // download tokens revoked, doc + files KEPT (evidence, appeals, legal preservation). Never hard-delete here.
        const { adminSoftRemove } = await import('../../services/safety/safetyScanClient');
        const ok = await adminSoftRemove({ contentType: g.contentType, contentId: g.contentId, parentId: g.parentId, reason: g.topReason });
        if (!ok) throw new Error('Remove failed on the server — nothing was changed. Try again.');
      } else if ((action === 'warn_author' || action === 'suspend_author') && g.authorId) {
        const warn = action === 'warn_author';
        await createEnforcementAction({
          uid: g.authorId, level: warn ? 'LIMITED_REACH' : 'RESTRICTED_PUBLIC',
          rule: g.topReason, ruleText: ruleTextFor(g.topReason),
          contentRef: { kind: g.contentType, id: g.contentId, ...(g.snapshot ? { snapshot: String(g.snapshot).slice(0, 500) } : {}) },
          durationHours: warn ? WARN_HOURS : SUSPEND_DAYS * 24,
          reportIds: g.reports.map(r => r.id),
        });
      } else if (action === 'block_reporter_spam') {
        const reporters = [...new Set(g.reports.map(r => r.reporterId).filter(Boolean) as string[])];
        for (const rid of reporters) await setDoc(doc(db, 'user_sanctions', rid), { reportBlocked: true, reportBlockedAt: Date.now(), updatedBy: reviewer }, { merge: true });
      }
      const batch = writeBatch(db);
      for (const r of g.reports) {
        batch.update(doc(db, 'content_reports', r.id), {
          status: action === 'dismiss' || action === 'block_reporter_spam' ? 'DISMISSED' : 'ACTIONED',
          resolution: RESOLUTION_FOR[action], reviewedBy: reviewer, reviewedAt: serverTimestamp(),
        });
      }
      await batch.commit();
    } catch (e: any) {
      setErr(e?.message || 'Action failed');
    } finally { setBusy(null); }
  };

  return (
    <div className="space-y-4">
      <AppealsQueuePanel />
      <div className="flex items-center gap-3 pt-2">
        <Flag size={18} className="text-red-400" />
        <h3 className="text-sm font-black uppercase tracking-widest text-white">Reports queue</h3>
        <span className="text-[10px] text-white/40">{groups.length} open target{groups.length === 1 ? '' : 's'} · {reports.length} report{reports.length === 1 ? '' : 's'}</span>
      </div>
      {err && <p className="text-xs text-red-400">{err}</p>}
      {loading && <p className="text-xs text-white/40">Loading…</p>}
      {!loading && groups.length === 0 && <p className="text-xs text-white/40">Nothing waiting.</p>}
      {groups.map(g => {
        const detail = g.reports.find(r => r.details)?.details;
        return (
          <div key={g.key} className="p-4 rounded-2xl bg-white/[0.03] border border-white/8 space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-[10px] font-black uppercase tracking-widest">
              <span className="px-2 py-0.5 rounded-full bg-red-500/15 text-red-300">{g.topReason.replace(/_/g, ' ')}</span>
              <span className="text-white/50">{g.contentType}</span>
              <span className="text-white/30">{g.reports.length} report{g.reports.length === 1 ? '' : 's'} · oldest {ageLabel(g.oldestMs, now)}</span>
              {Object.keys(g.reasons).length > 1 && <span className="text-white/30">{Object.entries(g.reasons).map(([k, n]) => `${k}×${n}`).join(' ')}</span>}
            </div>
            <p className="text-xs text-white/70 break-words whitespace-pre-wrap">{g.snapshot || '(no snapshot — open the content to review)'}</p>
            {detail && <p className="text-[11px] text-white/40 italic">{detail}</p>}
            <p className="text-[10px] text-white/30 break-all">target {g.contentId}{g.authorId ? ` · author ${g.authorId}` : ''}</p>
            <div className="flex flex-wrap gap-2 pt-1">
              {availableActions(g).map(a => {
                const m = ACTION_META[a];
                return (
                  <button key={a} disabled={!!busy} onClick={() => act(g, a)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border disabled:opacity-40 ${m.danger ? 'border-red-500/30 text-red-300 hover:bg-red-500/10' : 'border-white/15 text-white/70 hover:bg-white/5'}`}>
                    <m.Icon size={12} /> {m.label}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default ReportsQueue;
