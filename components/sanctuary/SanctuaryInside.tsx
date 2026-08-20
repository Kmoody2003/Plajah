import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { MessageSquare, Calendar, Radio, Mic, Users, Lock, ChevronRight, Clock } from 'lucide-react';
import { SanctuaryMembership, SanctuaryTier, SanctuaryEvent } from '../../types';
import { listenToSanctuaryEvents, hasAccess } from '../../services/sanctuaryService';
import { SANCTUARY_THEME } from './SanctuaryIdentity';
import SanctuaryFeed from './SanctuaryFeed';
import SanctuaryChat from './SanctuaryChat';

// ── Membership Home · "Inside the Sanctuary" preview ────────────────────────────
// A members-only preview: the real gated feed (locked overlays for non-members),
// a Members' Lounge teaser (embeds the real chat for members), and the next event.
// Reuses SanctuaryFeed, SanctuaryChat and the events listener — no new pipeline.

const EVENT_ICON: Record<SanctuaryEvent['type'], React.ReactNode> = {
  LIVESTREAM: <Radio size={13} />, AMA: <Mic size={13} />, WATCH_PARTY: <Users size={13} />,
  LISTENING: <Radio size={13} />, CALL: <Mic size={13} />,
};

const SectionHeading: React.FC<{ children: React.ReactNode; hint?: string }> = ({ children, hint }) => (
  <div className="flex items-baseline justify-between mb-3">
    <h2 className="text-xl md:text-2xl font-black italic tracking-tight" style={{ color: SANCTUARY_THEME.goldSoft }}>{children}</h2>
    {hint && <span className="text-[9px] font-bold text-white/30 uppercase tracking-widest">{hint}</span>}
  </div>
);

interface Props {
  sanctuaryId: string;
  isOwner?: boolean;
  membership: SanctuaryMembership | null;
  tiers: SanctuaryTier[];
  purchasedIds: Set<string>;
  onPurchased: (id: string) => void;
  onJoinClick: () => void;
}

const SanctuaryInside: React.FC<Props> = ({
  sanctuaryId, isOwner, membership, tiers, purchasedIds, onPurchased, onJoinClick,
}) => {
  const [events, setEvents] = useState<SanctuaryEvent[]>([]);
  const [loungeOpen, setLoungeOpen] = useState(false);

  useEffect(() => listenToSanctuaryEvents(sanctuaryId, setEvents), [sanctuaryId]);

  const canChat = !!isOwner || !!membership;
  const ctx = useMemo(() => ({ isOwner, membership, purchasedItemIds: purchasedIds }), [isOwner, membership, purchasedIds]);

  // Soonest upcoming event (any that hasn't passed).
  const nextEvent = useMemo(
    () => events.filter(e => e.scheduledAt >= Date.now() - 3600_000).sort((a, b) => a.scheduledAt - b.scheduledAt)[0],
    [events],
  );

  return (
    <div className="space-y-10">
      {/* Latest from inside — the real gated feed */}
      <section>
        <SectionHeading hint={membership || isOwner ? 'You have access' : 'Preview'}>Inside the Sanctuary</SectionHeading>
        <SanctuaryFeed
          sanctuaryId={sanctuaryId} isOwner={isOwner} membership={membership}
          tiers={tiers} purchasedIds={purchasedIds} onPurchased={onPurchased}
        />
      </section>

      {/* Next event */}
      {nextEvent && (
        <section>
          <SectionHeading>Next event</SectionHeading>
          {(() => {
            const open = hasAccess({ accessType: nextEvent.accessType, requiredTierIds: nextEvent.requiredTierIds }, nextEvent.id, ctx);
            const when = new Date(nextEvent.scheduledAt);
            return (
              <div className="rounded-2xl p-5 flex items-center gap-4" style={{ background: SANCTUARY_THEME.panel, border: `1px solid ${SANCTUARY_THEME.line}` }}>
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0" style={{ background: SANCTUARY_THEME.goldSheen, color: SANCTUARY_THEME.gold }}>
                  {EVENT_ICON[nextEvent.type]}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[8px] font-black uppercase tracking-[0.25em] mb-0.5" style={{ color: SANCTUARY_THEME.gold }}>{nextEvent.type.replace('_', ' ')}</p>
                  <h3 className="text-sm font-black tracking-tight truncate">{nextEvent.title}</h3>
                  <p className="flex items-center gap-1.5 text-[10px] text-white/40 mt-0.5">
                    <Clock size={10} /> {when.toLocaleDateString()} · {when.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
                {!open && (
                  <span className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest shrink-0" style={{ color: SANCTUARY_THEME.goldSoft }}>
                    <Lock size={11} /> Members
                  </span>
                )}
              </div>
            );
          })()}
        </section>
      )}

      {/* Members' Lounge teaser */}
      <section>
        <SectionHeading>Members' Lounge</SectionHeading>
        {loungeOpen && canChat ? (
          <SanctuaryChat
            sanctuaryId={sanctuaryId} canChat={canChat}
            lockReason={tiers.length ? 'Join a tier to enter the lounge' : 'Members-only lounge'}
            channels={[
              { id: undefined, label: 'Lounge', canAccess: canChat },
              ...tiers.filter(t => t.hasPrivateChat).map(t => ({
                id: t.id, label: t.name,
                canAccess: !!isOwner || membership?.tierId === t.id,
              })),
            ]}
          />
        ) : (
          <div className="rounded-2xl p-6 flex items-center gap-4" style={{ background: SANCTUARY_THEME.panel, border: `1px solid ${SANCTUARY_THEME.line}` }}>
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0" style={{ background: SANCTUARY_THEME.goldSheen }}>
              <MessageSquare size={20} style={{ color: SANCTUARY_THEME.gold }} />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-black tracking-tight">The lounge is where members hang out</h3>
              <p className="text-[11px] text-white/45 mt-0.5">Real-time chat with {membership || isOwner ? 'the community' : 'the creator and other members'}.</p>
            </div>
            {canChat ? (
              <motion.button whileTap={{ scale: 0.97 }} onClick={() => setLoungeOpen(true)}
                className="flex items-center gap-1.5 px-5 h-11 rounded-full text-[10px] font-black uppercase tracking-widest text-black shrink-0"
                style={{ background: SANCTUARY_THEME.gold }}>
                Enter <ChevronRight size={13} />
              </motion.button>
            ) : (
              <motion.button whileTap={{ scale: 0.97 }} onClick={onJoinClick}
                className="flex items-center gap-1.5 px-5 h-11 rounded-full text-[10px] font-black uppercase tracking-widest text-white shrink-0"
                style={{ background: 'var(--pj-grad-warm)' }}>
                <Lock size={12} /> Join to access
              </motion.button>
            )}
          </div>
        )}
      </section>
    </div>
  );
};

export default SanctuaryInside;
