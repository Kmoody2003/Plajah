import React, { useEffect, useRef, useState } from 'react';
import { MoreHorizontal, Flag, VolumeX, Volume2, Ban, ThumbsDown, Link as LinkIcon } from 'lucide-react';
import { auth } from '../../services/firebase';
import { blockUser, unblockUser, muteUser, unmuteUser } from '../../services/socialSafetyService';
import { useSocialSafety } from '../../hooks/useSocialSafety';
import type { ReportTargetType } from '../../services/socialSafetyCore';
import ReportDialog from './ReportDialog';
import { SafetyToastHost, showSafetyToast } from './SafetyToast';

export interface SafetyContentRef {
  type: ReportTargetType;
  /** post id / comment id / profile uid / live id. */
  id: string;
  /** Text of the content (stored with a report). */
  snapshot?: string;
  /** For comments: the owning post id. */
  parentId?: string;
}

export interface UserSafetyMenuProps {
  targetUid: string;
  targetName: string;
  /** What "Report" points at. Omit to report the profile. */
  contentRef?: SafetyContentRef;
  /** Shows "Copy link" when set. */
  linkUrl?: string;
  /** Shows "Show less like this" when set (wire to the feed-preferences service). */
  onShowLess?: () => void;
  /** Fired after a block/mute lands so the host can hide the row immediately. */
  onHidden?: (kind: 'block' | 'mute') => void;
  /** Classes for the trigger button (default is a subtle ghost icon button). */
  triggerClassName?: string;
  /** Menu opens toward this side. */
  align?: 'right' | 'left';
}

/**
 * The reusable "..." safety menu: Report, Mute, Block, Show less, Copy link.
 * Mount it next to any person-authored thing (post header, comment row, profile header).
 * Renders nothing for your own content or when signed out.
 */
const UserSafetyMenu: React.FC<UserSafetyMenuProps> = ({
  targetUid, targetName, contentRef, linkUrl, onShowLess, onHidden,
  triggerClassName = 'p-1 rounded-full text-white/30 hover:text-white hover:bg-white/10 transition-all',
  align = 'right',
}) => {
  const { blocked, muted } = useSocialSafety();
  const [open, setOpen] = useState(false);
  const [confirmBlock, setConfirmBlock] = useState(false);
  const [reporting, setReporting] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (!wrapRef.current?.contains(e.target as Node)) { setOpen(false); setConfirmBlock(false); } };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const me = auth.currentUser?.uid;
  if (!me || me === targetUid) return null;

  const isMuted = muted.has(targetUid);
  const isBlocked = blocked.has(targetUid);
  const handle = targetName || 'this user';
  const close = () => { setOpen(false); setConfirmBlock(false); };

  const doMute = async () => {
    close();
    try {
      if (isMuted) { await unmuteUser(targetUid); showSafetyToast({ message: `Unmuted @${handle}` }); return; }
      await muteUser(targetUid);
      onHidden?.('mute');
      showSafetyToast({ message: `Muted @${handle}`, onUndo: () => unmuteUser(targetUid) });
    } catch { showSafetyToast({ message: 'Could not update mute. Try again.' }); }
  };

  const doBlock = async () => {
    close();
    try {
      if (isBlocked) { await unblockUser(targetUid); showSafetyToast({ message: `Unblocked @${handle}` }); return; }
      await blockUser(targetUid);
      onHidden?.('block');
      showSafetyToast({ message: `Blocked @${handle}`, onUndo: () => unblockUser(targetUid) });
    } catch { showSafetyToast({ message: 'Could not block. Try again.' }); }
  };

  const copyLink = async () => {
    close();
    try { await navigator.clipboard.writeText(linkUrl!); showSafetyToast({ message: 'Link copied', durationMs: 2500 }); }
    catch { showSafetyToast({ message: 'Could not copy the link', durationMs: 2500 }); }
  };

  const item = 'w-full px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest flex items-center gap-3 transition-all hover:bg-white/5';

  return (
    <div className="relative flex-shrink-0" ref={wrapRef}>
      <button
        onClick={e => { e.stopPropagation(); setOpen(o => !o); setConfirmBlock(false); }}
        className={triggerClassName}
        aria-label="More options"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <MoreHorizontal size={16} />
      </button>
      {open && (
        <div
          role="menu"
          onClick={e => e.stopPropagation()}
          className={`absolute ${align === 'right' ? 'right-0' : 'left-0'} mt-1 w-56 bg-black/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl z-50 overflow-hidden`}
        >
          {confirmBlock ? (
            <div className="p-4 space-y-3">
              <p className="text-[11px] text-white/70 leading-relaxed">
                Block @{handle}? You will not see each other's posts, and they cannot follow or message you.
              </p>
              <div className="flex gap-2">
                <button onClick={() => setConfirmBlock(false)} className="flex-1 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest text-white/60 hover:bg-white/10">Cancel</button>
                <button onClick={doBlock} className="flex-1 py-2 rounded-lg bg-red-500/90 hover:bg-red-500 text-[10px] font-black uppercase tracking-widest text-white">Block</button>
              </div>
            </div>
          ) : (
            <>
              <button role="menuitem" onClick={() => { close(); setReporting(true); }} className={`${item} text-red-400`}>
                <Flag size={14} /> Report {contentRef ? contentRef.type : 'profile'}
              </button>
              <button role="menuitem" onClick={doMute} className={`${item} text-white/70 hover:text-white`}>
                {isMuted ? <Volume2 size={14} /> : <VolumeX size={14} />} {isMuted ? 'Unmute' : 'Mute'} @{handle}
              </button>
              <button role="menuitem" onClick={() => (isBlocked ? doBlock() : setConfirmBlock(true))} className={`${item} text-white/70 hover:text-white`}>
                <Ban size={14} /> {isBlocked ? 'Unblock' : 'Block'} @{handle}
              </button>
              {onShowLess && (
                <button role="menuitem" onClick={() => { close(); onShowLess(); showSafetyToast({ message: 'Got it. You will see less like this.', durationMs: 3000 }); }} className={`${item} text-white/70 hover:text-white`}>
                  <ThumbsDown size={14} /> Show less like this
                </button>
              )}
              {linkUrl && (
                <button role="menuitem" onClick={copyLink} className={`${item} text-white/70 hover:text-white`}>
                  <LinkIcon size={14} /> Copy link
                </button>
              )}
            </>
          )}
        </div>
      )}
      <ReportDialog
        open={reporting}
        onClose={() => setReporting(false)}
        targetType={contentRef?.type ?? 'profile'}
        targetId={contentRef?.id ?? targetUid}
        targetUid={targetUid}
        parentId={contentRef?.parentId}
        snapshot={contentRef?.snapshot}
        targetName={targetName}
      />
      <SafetyToastHost />
    </div>
  );
};

export default UserSafetyMenu;
