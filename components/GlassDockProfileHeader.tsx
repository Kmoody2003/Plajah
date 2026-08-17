/**
 * GlassDockProfileHeader — the "Glass Dock" identity block for the 2026 shell
 * redesign (gated behind {@link useShellNext}). It is a drop-in visual
 * replacement for the classic floating info block in UserProfileView: the
 * cinematic hero above it and every section below it (Pinned, Latest Releases,
 * tabs, tab content) are unchanged.
 *
 * Design: the identity floats inside a rounded glass panel (radius ~28px) with
 * backdrop-blur and a 1px brand-gradient hairline border (#6B0099 → #D40055 →
 * #FF8C00, drawn with the mask-composite technique). It LOSES NO FEATURE from
 * the classic header — avatar (+ own-profile photo upload, live dot, standing
 * VRM), the per-character rotateY flip-in display name (reused verbatim), the
 * stats row, the Pioneer badge, every action pill (own + visitor variants),
 * the social links row, the live/radio/channel strip, and the bio/quote +
 * relationship status + RSS viewer.
 *
 * Everything it needs is passed via props so the component stays presentational
 * and the classic branch in UserProfileView is left byte-for-byte intact.
 */
import React from 'react';
import { motion } from 'motion/react';
import {
  Camera,
  Tv,
  Radio,
  UserPlus,
  UserMinus,
  Mail,
  HeartHandshake,
  MessageSquare,
  Shield,
  Sparkles,
  X,
  Heart,
  Lock,
  AtSign,
} from 'lucide-react';
import { UserProfile, AppView } from '../types';
import { getSocialLinks } from '../services/socialLinks';
import { isPartneredStatus, statusLabel } from '../services/relationships';
import PioneerGoldFrame from './PioneerGoldFrame';
import SafeAvatarViewer from './SafeAvatarViewer';
import ThreeDImage from './ThreeDImage';
import ShareButton from './ShareButton';
import PlajahPlusButton from './PlajahPlusButton';
import PayItForwardButton from './PayItForwardButton';
import RssFeedViewer from './RssFeedViewer';

interface GlassDockProfileHeaderProps {
  profile: UserProfile;
  uid: string;
  isOwnProfile: boolean;
  isMobile: boolean;
  showArtistMode: boolean;
  following: boolean;
  isSubscribed: boolean;
  hasFastContent: boolean;
  isLivePlayerExpanded: boolean;
  onProfileUpdate: (type: 'photo' | 'cover', file: File) => void;
  onFollowToggle: () => void;
  onMailingListToggle: () => void;
  onClaimPioneerReward: () => void;
  onMessage?: (uid: string) => void;
  onVisitUser: (uid: string) => void;
  onNavigate?: (view: AppView) => void;
  onShowStatCard: () => void;
  onOpenDonation: () => void;
  onOpenPlajahPlusLanding: () => void;
  onSetLivePlayerExpanded: (v: boolean) => void;
  onSetLivePlaying: (v: boolean) => void;
  onShowFastChannel: () => void;
  onShowFastChannelManager: () => void;
  onOpenXFeed: () => void;
}

const BRAND_GRADIENT = 'linear-gradient(135deg,#6B0099,#D40055 55%,#FF8C00)';

const GlassDockProfileHeader: React.FC<GlassDockProfileHeaderProps> = ({
  profile,
  uid,
  isOwnProfile,
  isMobile,
  showArtistMode,
  following,
  isSubscribed,
  hasFastContent,
  isLivePlayerExpanded,
  onProfileUpdate,
  onFollowToggle,
  onMailingListToggle,
  onClaimPioneerReward,
  onMessage,
  onVisitUser,
  onNavigate,
  onShowStatCard,
  onOpenDonation,
  onOpenPlajahPlusLanding,
  onSetLivePlayerExpanded,
  onSetLivePlaying,
  onShowFastChannel,
  onShowFastChannelManager,
  onOpenXFeed,
}) => {
  const socialLinks = getSocialLinks(profile);
  const handle = (profile.username || profile.displayName || 'creator')
    .toString()
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '');
  const hasLiveStrip =
    profile.liveStreamConfig?.isActive ||
    profile.radioSettings?.enabled ||
    profile.fastChannelEnabled ||
    hasFastContent ||
    profile.liveStreamConfig?.fastChannelUrl ||
    (isOwnProfile && (profile.fastChannelEnabled || hasFastContent));

  return (
    <div className={`relative ${isMobile ? '' : ''}`}>
      {/* ── Glass dock panel: rounded, backdrop-blurred, 1px brand hairline ── */}
      <div
        className="relative overflow-hidden"
        style={{ borderRadius: 28 }}
      >
        {/* Frosted body */}
        <div
          className="absolute inset-0 backdrop-blur-2xl backdrop-saturate-150"
          style={{
            background:
              'linear-gradient(180deg, rgba(20,18,28,0.62) 0%, rgba(12,10,18,0.5) 100%)',
            borderRadius: 28,
          }}
        />
        {/* Soft brand aura */}
        <div
          aria-hidden="true"
          className="absolute inset-0 pointer-events-none opacity-40"
          style={{
            background:
              'radial-gradient(120% 90% at 0% 0%, rgba(107,0,153,0.22), transparent 55%), radial-gradient(120% 90% at 100% 0%, rgba(255,140,0,0.16), transparent 55%)',
            borderRadius: 28,
          }}
        />
        {/* 1px gradient hairline border (mask-composite) */}
        <div
          aria-hidden="true"
          className="absolute inset-0 pointer-events-none"
          style={{
            borderRadius: 28,
            padding: 1,
            background: BRAND_GRADIENT,
            WebkitMask:
              'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)',
            WebkitMaskComposite: 'xor',
            maskComposite: 'exclude',
          }}
        />

        {/* ── Dock content ── */}
        <div className={`relative z-10 ${isMobile ? 'p-5' : 'p-6 lg:p-8'}`}>
          <div
            className={`flex flex-col ${
              isMobile ? 'items-center text-center' : 'lg:flex-row lg:items-end'
            } gap-6 lg:gap-10`}
          >
            {/* ── Avatar column ── */}
            <div className="relative group/avatar flex flex-col items-center gap-2">
              <div className="absolute -inset-3 bg-gradient-to-r from-small-orange via-[#D40055] to-[#6B0099] rounded-[3rem] blur-xl opacity-20 group-hover/avatar:opacity-50 transition-all duration-[1200ms]" />
              <PioneerGoldFrame
                active={!!(profile.hasSeenWelcomePackage || profile.isPioneer)}
                size="lg"
                className={isMobile ? 'w-28 h-28' : 'w-36 h-36 lg:w-48 lg:h-48'}
              >
                <div className="relative w-full h-full rounded-[2.5rem] lg:rounded-[3rem] overflow-hidden bg-white/5">
                  {profile.avatar?.isActive ? (
                    <SafeAvatarViewer config={profile.avatar} compact autoRotate className="w-full h-full" />
                  ) : (
                    <ThreeDImage
                      src={profile.customPhotoURL || profile.photoURL || null}
                      alt={profile.displayName}
                      className="w-full h-full object-cover"
                    />
                  )}
                  {profile.liveStreamConfig?.isActive && (
                    <div className="absolute top-3 right-3 lg:top-4 lg:right-4 z-20">
                      <div className="w-3 h-3 lg:w-4 lg:h-4 bg-red-600 rounded-full shadow-[0_0_15px_rgba(220,38,38,0.8)] border-2 border-white" />
                    </div>
                  )}
                  {isOwnProfile && !profile.avatar?.isActive && (
                    <label className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 group-hover/avatar:opacity-100 transition-all cursor-pointer backdrop-blur-md">
                      <div className="flex flex-col items-center gap-2">
                        <Camera size={isMobile ? 20 : 24} />
                        <span className="text-[7px] lg:text-[8px] font-black uppercase tracking-widest">Update Photo</span>
                      </div>
                      <input
                        type="file"
                        className="hidden"
                        accept="image/*"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) onProfileUpdate('photo', file);
                        }}
                      />
                    </label>
                  )}
                </div>
              </PioneerGoldFrame>

              {/* Actions under avatar — Avatar Studio / Teacher / Share / Stat Card */}
              <div className="relative z-10 flex flex-col items-stretch gap-1.5 w-full max-w-[190px] mt-1">
                {isOwnProfile && onNavigate && (profile.accountType === 'TEACHER' || (profile as any).isTeacher || (!!profile.teacherVerification && profile.teacherVerification !== 'UNVERIFIED')) && (
                  <button
                    onClick={() => onNavigate('ACADEMIA_HOME')}
                    className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-full bg-[#3FB98E]/15 border border-[#3FB98E]/30 text-[#3FB98E] text-[9px] font-black uppercase tracking-widest hover:bg-[#3FB98E]/25 transition-all"
                  >
                    🎓 Teacher Dashboard
                  </button>
                )}
                {isOwnProfile && onNavigate && (
                  <button
                    onClick={() => onNavigate('AVATAR_STUDIO')}
                    className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-full bg-[#ff8c00]/15 border border-[#ff8c00]/30 text-[#ff8c00] text-[9px] font-black uppercase tracking-widest hover:bg-[#ff8c00]/25 transition-all"
                  >
                    Avatar Studio
                  </button>
                )}
                <ShareButton
                  title={`${profile.displayName}'s Profile`}
                  text={`Check out ${profile.displayName} on Plajah!`}
                  url={`${window.location.origin}/profile/${profile.uid}`}
                  imageUrl={profile.statCardImageUrl || profile.photoURL || profile.coverArt}
                  artist={profile.displayName}
                  label={isOwnProfile ? 'Share My Profile' : 'Share Profile'}
                  iconSize={13}
                  style={{ background: BRAND_GRADIENT }}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-full text-white text-[9px] font-black uppercase tracking-widest shadow-lg hover:brightness-110 transition-all"
                />
                <button
                  onClick={onShowStatCard}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-full text-white text-[9px] font-black uppercase tracking-widest shadow-lg hover:brightness-110 transition-all"
                  style={{ background: BRAND_GRADIENT }}
                >
                  <Sparkles size={13} /> Stat Card
                </button>
              </div>
            </div>

            {/* ── Identity column ── */}
            <div className="flex-1 w-full min-w-0">
              {/* Name row */}
              <div className={`flex ${isMobile ? 'flex-col items-center' : 'flex-row items-end'} gap-4 min-w-0 max-w-full`}>
                {!isMobile && profile.avatar?.isActive && (
                  <div className="shrink-0 self-end" style={{ width: 90, height: 200 }}>
                    <SafeAvatarViewer config={profile.avatar} compact wave autoRotate={false} className="w-full h-full" />
                  </div>
                )}
                {/* Per-character 3D flip-in display name — reused verbatim */}
                <h1
                  key={uid}
                  className={`font-black uppercase tracking-tighter w-full max-w-full min-w-0 text-white leading-[0.85] italic select-none break-words ${isMobile ? 'text-center' : ''}`}
                  style={{ perspective: '1200px', perspectiveOrigin: 'left center', fontSize: 'clamp(1.8rem, 9vw, 5rem)', overflowWrap: 'anywhere' }}
                >
                  {(profile.displayName ?? '').split(' ').map((word, wi, words) => {
                    const charOffset = words.slice(0, wi).reduce((acc, w) => acc + w.length, 0) + wi;
                    return (
                      <span key={wi} className="inline-block whitespace-nowrap">
                        {word.split('').map((char, ci) => (
                          <motion.span
                            key={`${uid}-${wi}-${ci}`}
                            initial={{ rotateY: 90, opacity: 0, display: 'inline-block' }}
                            animate={showArtistMode
                              ? { rotateY: 90, opacity: 0, display: 'inline-block' }
                              : { rotateY: 0, opacity: 1, display: 'inline-block' }
                            }
                            transition={{ delay: showArtistMode ? 0 : 0.05 + (charOffset + ci) * 0.05, duration: 2.0, ease: 'easeInOut' }}
                            style={{ transformOrigin: 'left center' }}
                          >
                            {char}
                          </motion.span>
                        ))}
                        {wi < words.length - 1 && <span>&nbsp;</span>}
                      </span>
                    );
                  })}
                </h1>
              </div>

              {/* @handle + badges */}
              <div className={`flex items-center gap-2 mt-3 flex-wrap ${isMobile ? 'justify-center' : ''}`}>
                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-white/[0.06] border border-white/10 text-white/60 text-[10px] font-black uppercase tracking-[0.2em]">
                  <AtSign size={11} className="text-small-orange" />{handle}
                </span>
                {profile.tier === 'PIONEER' && (
                  <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-gradient-to-r from-yellow-500 to-amber-600 rounded-full shadow-[0_0_20px_rgba(245,158,11,0.3)] border border-yellow-400/30">
                    <Sparkles size={12} className="text-white" />
                    <span className="text-[9px] font-black uppercase tracking-widest text-white">Pioneer</span>
                  </div>
                )}
              </div>

              {/* Stats */}
              <div className={`flex items-center gap-6 mt-4 ${isMobile ? 'justify-center' : ''}`}>
                <div className={isMobile ? 'text-center' : ''}>
                  <p className="text-2xl font-black text-white leading-none tabular-nums">{profile.followerCount?.toLocaleString()}</p>
                  <p className="text-[8px] font-black text-white/35 uppercase tracking-[0.3em] mt-0.5">Followers</p>
                </div>
                <div className={isMobile ? 'text-center' : ''}>
                  <p className="text-2xl font-black text-white leading-none tabular-nums">{profile.followingCount?.toLocaleString()}</p>
                  <p className="text-[8px] font-black text-white/35 uppercase tracking-[0.3em] mt-0.5">Following</p>
                </div>
                {typeof (profile as any).totalPlays === 'number' && (
                  <div className={isMobile ? 'text-center' : ''}>
                    <p className="text-2xl font-black text-white leading-none tabular-nums">{(profile as any).totalPlays?.toLocaleString()}</p>
                    <p className="text-[8px] font-black text-white/35 uppercase tracking-[0.3em] mt-0.5">Plays</p>
                  </div>
                )}
              </div>

              {/* Action pills */}
              <div className={`flex flex-wrap items-center gap-2 mt-5 ${isMobile ? 'justify-center' : ''}`}>
                {isOwnProfile && profile.isPioneer && !profile.pioneerRewardClaimed && (
                  <button
                    onClick={onClaimPioneerReward}
                    className="inline-flex items-center justify-center px-5 py-2 bg-gradient-to-r from-purple-600 to-blue-600 rounded-full text-white text-[10px] font-black uppercase tracking-widest hover:scale-105 transition-all shadow-xl"
                  >
                    Claim Pioneer Reward
                  </button>
                )}

                {/* Own-profile pills */}
                {isOwnProfile && (
                  <>
                    <PayItForwardButton variant="FULL" className="inline-flex items-center gap-2 px-5 py-2 bg-small-orange text-white rounded-full text-[10px] font-black uppercase tracking-widest hover:brightness-110 transition-all shadow-lg" />
                    <PlajahPlusButton
                      creatorId={profile.uid}
                      creatorName={profile.displayName}
                      isOwnProfile={true}
                      onOpenLanding={onOpenPlajahPlusLanding}
                    />
                    {(profile.xUrl || profile.xHandle) && (
                      <button
                        onClick={onOpenXFeed}
                        className="px-5 py-2 rounded-full inline-flex items-center gap-2 bg-white/5 border border-white/10 text-white/70 hover:bg-white/10 hover:text-white transition-all text-[10px] font-black uppercase tracking-widest"
                        title="View X Feed"
                      >
                        <X size={13} /> X Feed
                      </button>
                    )}
                  </>
                )}

                {/* Visitor pills */}
                {!isOwnProfile && (
                  <>
                    <button
                      onClick={onFollowToggle}
                      className={`px-5 py-2 rounded-full font-black text-[10px] uppercase tracking-widest transition-all flex items-center gap-2 ${
                        following
                          ? 'bg-white/10 text-white hover:bg-red-500/20 hover:text-red-500'
                          : 'bg-small-orange text-black hover:scale-105 active:scale-95'
                      }`}
                    >
                      {following ? <UserMinus size={12} /> : <UserPlus size={12} />}
                      {following ? 'Unfollow' : 'Follow'}
                    </button>
                    <button
                      onClick={onMailingListToggle}
                      className={`px-5 py-2 rounded-full font-black text-[10px] uppercase tracking-widest transition-all flex items-center gap-2 ${
                        isSubscribed
                          ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                          : 'bg-white/5 border border-white/10 text-white hover:bg-white/10'
                      }`}
                    >
                      <Mail size={12} />
                      {isSubscribed ? 'Subscribed' : 'Mailing List'}
                    </button>
                    <button
                      onClick={onOpenDonation}
                      className="px-5 py-2 bg-white/5 border border-white/10 rounded-full font-black text-[10px] uppercase tracking-widest hover:bg-white/10 transition-all flex items-center gap-2"
                    >
                      <HeartHandshake size={12} className="text-small-orange" />
                      Gifts
                    </button>
                    <PlajahPlusButton
                      creatorId={profile.uid}
                      creatorName={profile.displayName}
                      isOwnProfile={false}
                      onOpenLanding={onOpenPlajahPlusLanding}
                    />
                    {onMessage && !isOwnProfile && (
                      <button
                        onClick={() => onMessage(uid)}
                        className="px-5 py-2 bg-small-orange text-white font-black text-[10px] uppercase tracking-widest rounded-full hover:bg-small-orange/80 transition-all flex items-center gap-2"
                      >
                        <MessageSquare size={12} />
                        Message
                      </button>
                    )}
                  </>
                )}

                {/* Admin Panel */}
                {isOwnProfile && (profile.role === 'admin' || profile.role === 'staff') && (
                  <button
                    onClick={() => { window.dispatchEvent(new CustomEvent('NAVIGATE', { detail: { target: 'ADMIN_DASHBOARD' } })); }}
                    className="px-5 py-2 bg-red-600 text-white font-black text-[10px] uppercase tracking-widest rounded-full hover:bg-red-700 transition-all flex items-center gap-2 shadow-[0_0_20px_rgba(220,38,38,0.3)]"
                  >
                    <Shield size={12} />
                    Admin Panel
                  </button>
                )}
              </div>

              {/* Social links */}
              {socialLinks.length > 0 && (
                <div className={`flex items-center gap-2 flex-wrap mt-4 ${isMobile ? 'justify-center' : ''}`}>
                  {socialLinks.map(s => (
                    <a key={s.platform} href={s.url} target="_blank" rel="noopener noreferrer" title={s.handle}
                      className="px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-[9px] font-black uppercase tracking-widest text-white/50 hover:text-white hover:bg-white/10 transition-all">
                      {s.label}
                    </a>
                  ))}
                </div>
              )}

              {/* Live / radio / channel strip */}
              {hasLiveStrip && (
                <div className={`flex items-center gap-2 overflow-x-auto no-scrollbar pb-0.5 mt-4 ${isMobile ? 'justify-center' : ''}`}>
                  {profile.liveStreamConfig?.isActive && (
                    <div className="px-3 py-1.5 bg-red-600 text-white text-[10px] font-black uppercase tracking-[0.3em] rounded-full flex items-center gap-1.5 shrink-0">
                      <div className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />On Air
                    </div>
                  )}
                  {profile.liveStreamConfig?.isActive && (
                    <button onClick={() => { onSetLivePlayerExpanded(!isLivePlayerExpanded); if (!isLivePlayerExpanded) onSetLivePlaying(true); }}
                      className={`px-4 py-1.5 rounded-full transition-all border flex items-center gap-1.5 shrink-0 text-[10px] font-black uppercase tracking-widest whitespace-nowrap ${isLivePlayerExpanded ? 'bg-white text-black border-white' : 'bg-white/10 hover:bg-white/20 border-white/10'}`}>
                      <Tv size={12} />{isLivePlayerExpanded ? 'Close' : 'Watch Live'}
                    </button>
                  )}
                  {profile.radioSettings?.enabled && (
                    <button onClick={() => window.dispatchEvent(new CustomEvent('NAVIGATE', { detail: { target: 'RADIO', artistId: profile.uid } }))}
                      className="px-4 py-2 bg-[#00DAF3]/20 hover:bg-[#00DAF3]/30 text-[#00DAF3] rounded-full transition-all border border-[#00DAF3]/30 flex items-center gap-1.5 shrink-0 text-[10px] font-black uppercase tracking-widest whitespace-nowrap">
                      <Radio size={12} />Artist Radio
                    </button>
                  )}
                  {(profile.fastChannelEnabled || hasFastContent || profile.liveStreamConfig?.fastChannelUrl) && (
                    <button onClick={onShowFastChannel}
                      className="px-4 py-2 bg-gradient-to-r from-[#6B0099] to-[#D40055] text-white rounded-full transition-all hover:scale-105 active:scale-95 flex items-center gap-1.5 shrink-0 text-[10px] font-black uppercase tracking-widest whitespace-nowrap shadow-[0_0_14px_rgba(107,0,153,0.35)]">
                      <Tv size={12} />Watch Channel
                    </button>
                  )}
                  {isOwnProfile && (profile.fastChannelEnabled || hasFastContent) && (
                    <button onClick={onShowFastChannelManager}
                      className="px-4 py-2 bg-white/10 border border-white/10 text-white rounded-full transition-all hover:bg-white/20 active:scale-95 flex items-center gap-1.5 shrink-0 text-[10px] font-black uppercase tracking-widest whitespace-nowrap">
                      <Radio size={12} />Manage Channel
                    </button>
                  )}
                </div>
              )}

              {/* Bio / quote */}
              <div className={`mt-4 ${profile.bio ? 'pl-4 border-l-2 border-small-orange/40' : ''}`}>
                <p className={`text-white/55 max-w-2xl font-medium leading-relaxed ${isMobile ? 'text-xs' : 'text-sm'}`}>
                  {profile.bio || <span className="italic text-white/25">No bio yet.</span>}
                </p>
              </div>

              {/* Relationship status */}
              {(profile.relationshipPublic || isOwnProfile) && isPartneredStatus(profile.relationshipStatus) && (
                <div className={`mt-2 flex items-center gap-1.5 text-[11px] font-bold text-rose-300/80 ${isMobile ? 'justify-center' : ''}`}>
                  <Heart size={12} fill="currentColor" />
                  <span>
                    {statusLabel(profile.relationshipStatus)}
                    {profile.relationshipPartnerUid ? (
                      <> with <button onClick={() => onVisitUser(profile.relationshipPartnerUid!)} className="underline hover:text-rose-200">{profile.relationshipPartnerName || 'their partner'}</button></>
                    ) : profile.relationshipPartnerName ? ` with ${profile.relationshipPartnerName}` : ''}
                  </span>
                  {isOwnProfile && !profile.relationshipPublic && (
                    <span className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-white/30" title="Only you can see your relationship status. Turn it on in settings to make it public."><Lock size={9} /> Only you</span>
                  )}
                </div>
              )}

              {/* RSS feed viewer */}
              {profile.podcastRss?.externalFeedUrl && (
                <div className="max-w-2xl mt-2">
                  <RssFeedViewer feedUrl={profile.podcastRss.externalFeedUrl} feedTitle={profile.podcastRss.feedTitle} />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GlassDockProfileHeader;
