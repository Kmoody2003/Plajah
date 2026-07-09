import React, { useEffect, useState } from 'react';
import { Heart, Loader2, Check, Clock, UserPlus, X, Copy, Share2, UserMinus } from 'lucide-react';
import type { UserProfile, RelationshipStatus } from '../types';
import { fetchUserProfile } from '../services/backendService';
import { RELATIONSHIP_OPTIONS, isPartneredStatus, partnerConfirmed, setRelationship, clearRelationship, statusLabel } from '../services/relationships';
import { createNibbleInvite } from '../services/nibbleInvites';
import PartnerPickerModal from './PartnerPickerModal';

// Profile section: turn on a relationship status and link your spouse/partner. The
// link (once confirmed by them) is what unlocks Nibbles in your DM together. Also
// offers a shareable invite to bring a partner who isn't on Plajah yet.
const RelationshipSettings: React.FC<{ me: UserProfile; accent?: string }> = ({ me, accent = '#ff6b6b' }) => {
  const [status, setStatus] = useState<RelationshipStatus>(me.relationshipStatus || 'SINGLE');
  const [isPublic, setIsPublic] = useState<boolean>(me.relationshipPublic ?? false); // private by default
  const [partnerUid, setPartnerUid] = useState<string | null>(me.relationshipPartnerUid || null);
  const [partnerName, setPartnerName] = useState<string>(me.relationshipPartnerName || '');
  const [partnerPhoto, setPartnerPhoto] = useState<string>('');
  const [mutual, setMutual] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [inviteUrl, setInviteUrl] = useState('');
  const [copied, setCopied] = useState(false);

  // Resolve the linked partner's live profile to show name/photo + confirm state.
  useEffect(() => {
    let alive = true;
    if (!partnerUid) { setMutual(false); setPartnerPhoto(''); return; }
    fetchUserProfile(partnerUid).then(p => {
      if (!alive || !p) return;
      setPartnerName(p.displayName || partnerName);
      setPartnerPhoto((p as any).photoURL || (p as any).avatarUrl || '');
      setMutual(partnerConfirmed({ ...me, relationshipPartnerUid: partnerUid }, p));
    }).catch(() => {});
    return () => { alive = false; };
  }, [partnerUid]); // eslint-disable-line react-hooks/exhaustive-deps

  const partnered = isPartneredStatus(status);

  const save = async () => {
    setSaving(true); setSaved(false);
    try {
      await setRelationship(me, { status, partnerUid: partnered ? partnerUid : null, partnerName, isPublic });
      setSaved(true); setTimeout(() => setSaved(false), 2500);
    } catch (e: any) { alert(e?.message || 'Could not save.'); }
    finally { setSaving(false); }
  };

  const unlink = async () => {
    if (!confirm('Remove your partner link and set your status to Single?')) return;
    setSaving(true);
    try { await clearRelationship(me); setStatus('SINGLE'); setPartnerUid(null); setPartnerName(''); setPartnerPhoto(''); setMutual(false); }
    catch (e: any) { alert(e?.message || 'Could not update.'); }
    finally { setSaving(false); }
  };

  const makeInvite = async () => {
    try { const { url } = await createNibbleInvite(me); setInviteUrl(url); }
    catch (e: any) { alert(e?.message || 'Could not create an invite.'); }
  };
  const copyInvite = async () => { try { await navigator.clipboard.writeText(inviteUrl); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* clipboard blocked */ } };
  const shareInvite = async () => {
    if ((navigator as any).share) { try { await (navigator as any).share({ title: 'Join me on Plajah 💞', text: "Let's link up on Plajah.", url: inviteUrl }); return; } catch { /* fell through */ } }
    copyInvite();
  };

  return (
    <div className="rounded-2xl border p-5 space-y-4" style={{ borderColor: `${accent}33`, background: `${accent}0a` }}>
      <div className="flex items-center gap-2">
        <Heart size={16} fill={accent} stroke="none" />
        <h3 className="text-[11px] font-black uppercase tracking-widest text-white">Relationship</h3>
        <span className="ml-auto text-[9px] font-black uppercase tracking-widest text-white/30">Gate for Nibbles</span>
      </div>
      <p className="text-[11px] text-white/45 leading-relaxed">Set your status and link your spouse or partner. Once they confirm the link, Nibbles (private couples chat) unlocks in your direct messages together.</p>

      {/* Status */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-[9px] font-black uppercase tracking-widest text-white/40 mb-1.5">Status</label>
          <select value={status} onChange={e => setStatus(e.target.value as RelationshipStatus)} className="w-full bg-white/[0.06] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white outline-none [color-scheme:dark]">
            {RELATIONSHIP_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div className="self-end pb-2.5">
          <label className="flex items-center gap-2.5 cursor-pointer">
            <input type="checkbox" checked={isPublic} onChange={e => setIsPublic(e.target.checked)} style={{ accentColor: accent }} />
            <span className="text-[11px] text-white/60">Show on my public profile</span>
          </label>
          <p className="text-[9px] text-white/30 mt-1 leading-relaxed pl-6">Private by default — only you can see it until you turn this on.</p>
        </div>
      </div>

      {/* Partner link */}
      {partnered && (
        <div>
          <label className="block text-[9px] font-black uppercase tracking-widest text-white/40 mb-1.5">Partner</label>
          {partnerUid ? (
            <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/[0.05] border border-white/10">
              <img src={partnerPhoto} alt="" className="w-9 h-9 rounded-full object-cover bg-white/10" onError={(e) => { (e.target as HTMLImageElement).style.visibility = 'hidden'; }} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-white truncate">{partnerName || 'Partner'}</p>
                {mutual
                  ? <span className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-emerald-400"><Check size={10} /> Confirmed</span>
                  : <span className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-amber-400"><Clock size={10} /> Waiting for them to confirm</span>}
              </div>
              <button onClick={() => { setPartnerUid(null); setPartnerName(''); setPartnerPhoto(''); }} className="p-1.5 rounded-lg text-white/30 hover:text-white hover:bg-white/10"><X size={14} /></button>
            </div>
          ) : (
            <button onClick={() => setShowPicker(true)} className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border border-dashed border-white/15 text-white/60 hover:text-white hover:border-white/30 text-[11px] font-black uppercase tracking-widest">
              <UserPlus size={14} /> Choose your partner
            </button>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-2 pt-1">
        <button onClick={save} disabled={saving || (partnered && !partnerUid)} className="flex items-center gap-2 px-5 py-2.5 rounded-full text-[10px] font-black uppercase tracking-widest text-black disabled:opacity-40" style={{ background: accent }}>
          {saving ? <Loader2 size={13} className="animate-spin" /> : saved ? <Check size={13} /> : <Heart size={13} fill="currentColor" />} {saved ? 'Saved' : 'Save status'}
        </button>
        {me.relationshipPartnerUid && (
          <button onClick={unlink} disabled={saving} className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-white/5 border border-white/10 text-white/60 hover:text-white text-[10px] font-black uppercase tracking-widest"><UserMinus size={13} /> Unlink</button>
        )}
      </div>

      {/* Invite a partner who isn't on Plajah yet */}
      <div className="pt-3 border-t" style={{ borderColor: `${accent}22` }}>
        <p className="text-[9px] font-black uppercase tracking-widest text-white/40 mb-2">Partner not on Plajah?</p>
        {!inviteUrl ? (
          <button onClick={makeInvite} className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 text-white/70 hover:text-white text-[10px] font-black uppercase tracking-widest"><Share2 size={13} /> Invite &amp; share a nibble</button>
        ) : (
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/[0.05] border border-white/10">
            <span className="flex-1 min-w-0 truncate text-[11px] text-white/60">{inviteUrl}</span>
            <button onClick={copyInvite} title="Copy" className="p-1.5 rounded-lg text-white/50 hover:text-white hover:bg-white/10">{copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}</button>
            <button onClick={shareInvite} title="Share" className="p-1.5 rounded-lg text-white/50 hover:text-white hover:bg-white/10"><Share2 size={14} /></button>
          </div>
        )}
        <p className="text-[9px] text-white/25 mt-1.5 leading-relaxed">They join through your link and get pre-linked to you as your partner (you confirm to make it official).</p>
      </div>

      {showPicker && (
        <PartnerPickerModal
          excludeUid={me.uid}
          accent={accent}
          onPick={(u) => { setPartnerUid(u.uid); setPartnerName(u.displayName || ''); setPartnerPhoto((u as any).photoURL || (u as any).avatarUrl || ''); setShowPicker(false); }}
          onClose={() => setShowPicker(false)}
        />
      )}
    </div>
  );
};

export default RelationshipSettings;
