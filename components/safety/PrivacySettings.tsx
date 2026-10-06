import React, { useEffect, useState } from 'react';
import { Lock, Trophy } from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { db, auth } from '../../services/firebase';
import { setAccountPrivate, PRIVACY_CONFIRM_COPY } from '../../services/socialSafetyService';
import { resumePendingMigration } from '../../services/privatePostsService';
import { setShareAchievements } from '../../services/publicAchievementsService';
import FollowRequestsInbox from './FollowRequestsInbox';
import BlockedAccountsView from './BlockedAccountsView';

/**
 * Account privacy: private-account toggle, pending follow requests, and blocked/muted accounts.
 * Already mounted inside ContentSafetySettings (Settings > Content & Safety); also exported so
 * the lead can mount it on a dedicated privacy screen.
 */
const PrivacySettings: React.FC = () => {
  const [isPrivate, setIsPrivate] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [shareAch, setShareAch] = useState<boolean | null>(null);
  const uid = auth.currentUser?.uid;

  useEffect(() => {
    if (!uid) return;
    let live = true;
    getDoc(doc(db, 'users', uid)).then(s => { if (live) { setIsPrivate((s.data() as any)?.isPrivate === true); setShareAch((s.data() as any)?.shareAchievements !== false); } }).catch(() => { if (live) { setIsPrivate(false); setShareAch(true); } });
    resumePendingMigration().catch(() => {}); // finish a public<->private post move interrupted earlier
    return () => { live = false; };
  }, [uid]);

  if (!uid) return null;

  const toggle = async () => {
    if (isPrivate === null || saving) return;
    const next = !isPrivate;
    if (!window.confirm(next ? PRIVACY_CONFIRM_COPY.toPrivate : PRIVACY_CONFIRM_COPY.toPublic)) return;
    setSaving(true); setErr('');
    try {
      const r = await setAccountPrivate(next);
      setIsPrivate(next);
      if (!r.done) setErr('Some existing posts are still being moved. Keep this page open or reopen it to finish.');
    }
    catch { setErr('Could not update your account privacy. Try again.'); }
    finally { setSaving(false); }
  };

  const toggleShareAch = async () => {
    if (shareAch === null || saving) return;
    const next = !shareAch;
    setSaving(true); setErr('');
    try { await setShareAchievements(uid, next); setShareAch(next); }
    catch { setErr('Could not update achievement sharing. Try again.'); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-4 p-5 bg-white/[0.03] border border-white/8 rounded-[1.5rem]">
        <div className="w-9 h-9 rounded-xl bg-[#FF8C00]/10 border border-[#FF8C00]/25 flex items-center justify-center shrink-0">
          <Lock size={15} className="text-[#FF8C00]" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-black uppercase tracking-widest">Private account</p>
          <p className="text-[10px] text-white/40 leading-relaxed mt-1">
            People must send a follow request that you approve. Your existing followers stay. Your posts become
            followers-only and are protected by the database itself, not just hidden in the app.
          </p>
          {err && <p className="text-[10px] text-red-400 mt-1">{err}</p>}
        </div>
        <button
          role="switch" aria-checked={!!isPrivate} disabled={isPrivate === null || saving} onClick={toggle}
          className={`w-12 h-6 rounded-full transition-all relative shrink-0 disabled:opacity-50 ${isPrivate ? 'bg-[#FF8C00]' : 'bg-white/10'}`}
        >
          <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${isPrivate ? 'right-1' : 'left-1'}`} />
        </button>
      </div>
      <div className="flex items-start gap-4 p-5 bg-white/[0.03] border border-white/8 rounded-[1.5rem]">
        <div className="w-9 h-9 rounded-xl bg-[#FF8C00]/10 border border-[#FF8C00]/25 flex items-center justify-center shrink-0">
          <Trophy size={15} className="text-[#FF8C00]" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-black uppercase tracking-widest">Share my achievements</p>
          <p className="text-[10px] text-white/40 leading-relaxed mt-1">
            Show the achievements you unlock on your public profile. Turning this off removes the ones already shown.
          </p>
        </div>
        <button
          role="switch" aria-checked={shareAch !== false} disabled={shareAch === null || saving} onClick={toggleShareAch}
          className={`w-12 h-6 rounded-full transition-all relative shrink-0 disabled:opacity-50 ${shareAch !== false ? 'bg-[#FF8C00]' : 'bg-white/10'}`}
        >
          <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${shareAch !== false ? 'right-1' : 'left-1'}`} />
        </button>
      </div>
      <FollowRequestsInbox />
      <BlockedAccountsView />
    </div>
  );
};

export default PrivacySettings;
