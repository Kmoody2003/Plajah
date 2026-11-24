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
import { ChallengeButton } from './games/social/ChallengeButton';
import { InviteToPartyButton } from './games/together/InviteToPartyButton';
import { motion } from 'motion/react';
import {
  Camera,
  UserPlus,
  UserMinus,
  Mail,
  HeartHandshake,
  MessageSquare,
  Shield,
  Sparkles,
  Heart,
  Lock,
  AtSign,
  Rocket,
  GraduationCap,
  Ticket,
  ChevronDown,
  MoreHorizontal,
} from 'lucide-react';
import { UserProfile, AppView, Album, MerchItem, FeaturedProjectRef } from '../types';
import { getSocialLinks } from '../services/socialLinks';
import { resolveAcademiaHubs } from '../services/academiaHubs';
import { isPartneredStatus, statusLabel, canHaveRelationshipStatus } from '../services/relationships';
import PioneerGoldFrame from './PioneerGoldFrame';
import SafeAvatarViewer from './SafeAvatarViewer';
import { CharacterAvatarFlip } from './avatar/CharacterAvatarFlip';
import ThreeDImage from './ThreeDImage';
import ShareButton from './ShareButton';
import PlajahPlusButton from './PlajahPlusButton';
import CreateEventButton from './events/CreateEventButton';
import RssFeedViewer from './RssFeedViewer';
import ProfileLiveTiles from './profile/ProfileLiveTiles';
import ProfileFeaturedProject from './profile/ProfileFeaturedProject';
import ProfileSupportRail from './profile/ProfileSupportRail';
import ProfileOrgBanner from './elevate/ProfileOrgBanner';
import ProfileMenu, { MenuHead, MenuItem, MenuDivider, MENU_ITEM_CLS } from './profile/ProfileMenu';
import {
  useRadioNowPlaying,
  useChannelNowPlaying,
  useSanctuarySummary,
  resolveFeaturedProject,
} from '../hooks/useProfileMarquee';

interface GlassDockProfileHeaderProps {
  profile: UserProfile;
  uid: string;
  isOwnProfile: boolean;
  isMobile: boolean;
  showArtistMode: boolean;
  following: boolean;
  isSubscribed: boolean;
  hasFastContent: boolean;
  onProfileUpdate: (type: 'photo' | 'cover', file: File) => void;
  onFollowToggle: () => void;
  onMailingListToggle: () => void;
  onMessage?: (uid: string) => void;
  onVisitUser: (uid: string) => void;
  onNavigate?: (view: AppView) => void;
  onOpenOrg?: (orgId: string) => void;
  onShowStatCard: () => void;
  onOpenDonation: () => void;
  onOpenPlajahPlusLanding: () => void;
  onShowFastChannel: () => void;
  onShowFastChannelManager: () => void;
  // ── Marquee (the reworked card body) ──
  /** The account's own content — already loaded by the profile, so the marquee never refetches. */
  albums: Album[];
  videos: any[];
  articles: any[];
  merch: MerchItem[];
  onOpenRadio: () => void;
  onSetFeatured: (ref: FeaturedProjectRef | null) => void;
  onPlayAlbum: (album: Album) => void;
  onOpenAlbum: (album: Album) => void;
  onOpenVideo: (video: any) => void;
  onOpenArticle: (article: any) => void;
  onOpenSanctuary: () => void;
  onOpenMerch: () => void;
}

const RAIL_BTN = 'inline-flex h-[42px] items-center justify-center gap-2 rounded-full px-5 text-[10px] font-black uppercase tracking-widest transition-all';
const RAIL_GLASS = 'border border-white/15 bg-white/5 text-white hover:bg-white/10';
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
  onProfileUpdate,
  onFollowToggle,
  onMailingListToggle,
  onMessage,
  onVisitUser,
  onNavigate,
  onOpenOrg,
  onShowStatCard,
  onOpenDonation,
  onOpenPlajahPlusLanding,
  onShowFastChannel,
  onShowFastChannelManager,
  albums,
  videos,
  articles,
  merch,
  onOpenRadio,
  onSetFeatured,
  onPlayAlbum,
  onOpenAlbum,
  onOpenVideo,
  onOpenArticle,
  onOpenSanctuary,
  onOpenMerch,
}) => {
  const socialLinks = getSocialLinks(profile);
  const handle = (profile.username || profile.displayName || 'creator')
    .toString()
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '');
  // The two live surfaces the marquee previews. Gating is unchanged from the pill strip
  // this replaced — a station/channel that was never set up still shows nothing.
  const showRadio = !!profile.radioSettings?.enabled;
  const showChannel = !!(profile.fastChannelEnabled || hasFastContent || profile.liveStreamConfig?.fastChannelUrl);
  const canManageChannel = !!(profile.fastChannelEnabled || hasFastContent);

  const radioNow = useRadioNowPlaying(uid, profile, albums, showRadio);
  const channelNow = useChannelNowPlaying(uid, showChannel);
  const { sanctuary, campaign, activity } = useSanctuarySummary(uid, isOwnProfile);
  const featured = React.useMemo(
    () => resolveFeaturedProject(profile, albums, videos, articles),
    [profile, albums, videos, articles],
  );

  // "My Academia Hub" identity pill (Concept B) — role-aware, cyan when
  // school-affiliated, brand when a platform learner; popover when multi-role.
  const academiaHubs = React.useMemo(() => resolveAcademiaHubs(profile), [profile]);
  const isTeacher = profile.accountType === 'TEACHER' || (profile as any).isTeacher || (!!profile.teacherVerification && profile.teacherVerification !== 'UNVERIFIED');

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
                  {profile.avatar?.isActive && profile.avatar.type === 'CHARACTER' ? (
                    // Movie-character avatar: photo ⇄ character portrait with a green lightning flip.
                    <CharacterAvatarFlip
                      photoUrl={profile.customPhotoURL || profile.photoURL || null}
                      characterUrl={profile.avatar.thumbnailUrl}
                      alt={profile.displayName}
                      className="w-full h-full"
                    />
                  ) : profile.avatar?.isActive ? (
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

              {/* Action rail. One primary action, one secondary, and everything else behind a menu
                  (More for visitors, My tools for the owner). Nothing was removed: Mailing List,
                  Gifts, Challenge, Party, the Academia hubs, Avatar Studio, Teacher Dashboard,
                  Start a Room, Create Event, Welcome Package and Admin Panel are all in the menus. */}
              <div className={`flex flex-wrap items-center gap-2.5 mt-5 ${isMobile ? 'justify-center' : ''}`}>
                {isOwnProfile ? (
                  <>
                    <ShareButton
                      title={`${profile.displayName}'s Profile`}
                      text={`Check out ${profile.displayName} on Plajah!`}
                      url={`${window.location.origin}/profile/${profile.uid}`}
                      imageUrl={profile.statCardImageUrl || profile.photoURL || profile.coverArt}
                      artist={profile.displayName}
                      label="Share My Profile"
                      iconSize={13}
                      className={`${RAIL_BTN} bg-small-orange text-black hover:brightness-110 border border-transparent`}
                    />
                    <button onClick={onShowStatCard} className={`${RAIL_BTN} ${RAIL_GLASS}`}>
                      <Sparkles size={13} /> Stat Card
                    </button>
                    <PlajahPlusButton
                      creatorId={profile.uid}
                      creatorName={profile.displayName}
                      isOwnProfile={true}
                      onOpenLanding={onOpenPlajahPlusLanding}
                    />
                    <ProfileMenu
                      width={300}
                      trigger={({ toggle, aria }) => (
                        <button onClick={toggle} {...aria} className={`${RAIL_BTN} text-white border border-transparent hover:brightness-110`} style={{ background: BRAND_GRADIENT }}>
                          My tools <ChevronDown size={12} aria-hidden="true" />
                        </button>
                      )}
                    >
                      {close => (
                        <>
                          <MenuHead>Create</MenuHead>
                          {onNavigate && (
                            <MenuItem title="Creator Hub" sub="Your daily creator tools" icon={<Rocket size={15} />} onClick={() => { close(); onNavigate('CREATOR'); }} />
                          )}
                          {onNavigate && (
                            <MenuItem title="Avatar Studio" icon={<Sparkles size={15} />} onClick={() => { close(); onNavigate('AVATAR_STUDIO'); }} />
                          )}
                          <MenuItem
                            title="Start a Room"
                            sub="Go live with people"
                            icon={<span className="h-2 w-2 rounded-full bg-[#e23b3b]" />}
                            onClick={() => { close(); window.dispatchEvent(new CustomEvent('plajah:start-room')); }}
                          />
                          <CreateEventButton host={{ kind: 'user' }} label="Create event" className={MENU_ITEM_CLS} />
                          <MenuHead>Work and school</MenuHead>
                          {onNavigate && isTeacher && (
                            <MenuItem title="Teacher Dashboard" icon={<GraduationCap size={15} />} onClick={() => { close(); onNavigate('ACADEMIA_HOME'); }} />
                          )}
                          {onNavigate && academiaHubs.map(h => (
                            <MenuItem key={h.id} title={h.label} sub={h.sub} icon={<span>{h.icon}</span>} onClick={() => { close(); onNavigate(h.view); }} />
                          ))}
                          <MenuItem
                            title="Welcome Package"
                            icon={<Ticket size={15} />}
                            onClick={() => { close(); window.dispatchEvent(new CustomEvent('NAVIGATE', { detail: { target: 'WELCOME_PACKAGE' } })); }}
                          />
                          {(profile.role === 'admin' || profile.role === 'staff') && (
                            <>
                              <MenuDivider />
                              <MenuItem
                                title="Admin Panel"
                                sub="Staff and admins only"
                                icon={<Shield size={15} />}
                                onClick={() => { close(); window.dispatchEvent(new CustomEvent('NAVIGATE', { detail: { target: 'ADMIN_DASHBOARD' } })); }}
                              />
                            </>
                          )}
                        </>
                      )}
                    </ProfileMenu>
                  </>
                ) : (
                  <>
                    <button
                      onClick={onFollowToggle}
                      className={`${RAIL_BTN} ${
                        following
                          ? 'bg-white/10 text-white border border-white/15 hover:bg-red-500/20 hover:text-red-400'
                          : 'bg-small-orange text-black border border-transparent hover:brightness-110'
                      }`}
                    >
                      {following ? <UserMinus size={12} /> : <UserPlus size={12} />}
                      {following ? 'Unfollow' : 'Follow'}
                    </button>
                    {onMessage && (
                      <button onClick={() => onMessage(uid)} className={`${RAIL_BTN} ${RAIL_GLASS}`}>
                        <MessageSquare size={12} /> Message
                      </button>
                    )}
                    <PlajahPlusButton
                      creatorId={profile.uid}
                      creatorName={profile.displayName}
                      isOwnProfile={false}
                      onOpenLanding={onOpenPlajahPlusLanding}
                    />
                    <ShareButton
                      title={`${profile.displayName}'s Profile`}
                      text={`Check out ${profile.displayName} on Plajah!`}
                      url={`${window.location.origin}/profile/${profile.uid}`}
                      imageUrl={profile.statCardImageUrl || profile.photoURL || profile.coverArt}
                      artist={profile.displayName}
                      iconSize={15}
                      className="inline-flex h-[42px] w-[42px] items-center justify-center rounded-full border border-white/15 bg-white/5 text-white hover:bg-white/10 transition-all"
                    />
                    <ProfileMenu
                      width={300}
                      align="right"
                      trigger={({ toggle, aria }) => (
                        <button onClick={toggle} {...aria} aria-label="More actions" className="inline-flex h-[42px] w-[42px] items-center justify-center rounded-full border border-white/15 bg-white/5 text-white hover:bg-white/10 transition-all">
                          <MoreHorizontal size={18} aria-hidden="true" />
                        </button>
                      )}
                    >
                      {close => (
                        <>
                          <MenuHead>More from this creator</MenuHead>
                          <MenuItem
                            title={isSubscribed ? 'Subscribed to mailing list' : 'Mailing list'}
                            sub={isSubscribed ? 'Tap to unsubscribe' : 'Get their updates by email'}
                            icon={<Mail size={15} />}
                            onClick={() => { onMailingListToggle(); close(); }}
                          />
                          <MenuItem title="Send a gift" sub="Direct to the creator" icon={<HeartHandshake size={15} className="text-small-orange" />} onClick={() => { close(); onOpenDonation(); }} />
                          <MenuItem title="Stat Card" icon={<Sparkles size={15} />} onClick={() => { close(); onShowStatCard(); }} />
                          <MenuDivider />
                          <ChallengeButton uid={profile.uid} name={profile.displayName || 'Player'} source="profile" className={MENU_ITEM_CLS} />
                          <InviteToPartyButton uid={profile.uid} name={profile.displayName || 'Player'} label="Party" className={MENU_ITEM_CLS} />
                          {onNavigate && academiaHubs.length > 0 && <MenuDivider />}
                          {onNavigate && academiaHubs.map(h => (
                            <MenuItem key={h.id} title={h.label} sub={h.sub} icon={<span>{h.icon}</span>} onClick={() => { close(); onNavigate(h.view); }} />
                          ))}
                        </>
                      )}
                    </ProfileMenu>
                  </>
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

              {/* Live rail — ON AIR plus the two preview tiles (Artist Radio · Watch Channel).
                  Replaces the old pill strip; the tiles open the same surfaces the pills did. */}
              <ProfileLiveTiles
                profile={profile}
                isOwnProfile={isOwnProfile}
                isMobile={isMobile}
                radio={radioNow}
                channel={channelNow}
                showRadio={showRadio}
                showChannel={showChannel}
                onOpenRadio={onOpenRadio}
                onOpenChannel={onShowFastChannel}
                onManageChannel={onShowFastChannelManager}
                canManageChannel={canManageChannel}
              />

              {/* Bio / quote */}
              <div className={`mt-4 ${profile.bio ? 'pl-4 border-l-2 border-small-orange/40' : ''}`}>
                <p className={`text-white/55 max-w-2xl font-medium leading-relaxed ${isMobile ? 'text-xs' : 'text-sm'}`}>
                  {profile.bio || <span className="italic text-white/25">No bio yet.</span>}
                </p>
              </div>

              {/* Organization / Elevate link, Follow Org, and Claim / Request Org Membership */}
              <ProfileOrgBanner
                profile={profile}
                isOwnProfile={isOwnProfile}
                isMobile={isMobile}
                onOpenOrg={onOpenOrg}
              />

              {/* Relationship status — personal accounts only */}
              {canHaveRelationshipStatus(profile) && (profile.relationshipPublic || isOwnProfile) && isPartneredStatus(profile.relationshipStatus) && (
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

          {/* ── The rest of the card: the one project they're putting forward, then the
                support rail (Sanctuary · merch · an active funding goal). Each piece
                renders only when it has something real to show, so a bare account's card
                stays exactly as tall as it was. ── */}
          <ProfileFeaturedProject
            featured={featured}
            albums={albums}
            videos={videos}
            articles={articles}
            isOwnProfile={isOwnProfile}
            isMobile={isMobile}
            onSetFeatured={onSetFeatured}
            onPlayAlbum={onPlayAlbum}
            onOpenAlbum={onOpenAlbum}
            onOpenVideo={onOpenVideo}
            onOpenArticle={onOpenArticle}
          />

          <ProfileSupportRail
            sanctuary={sanctuary}
            campaign={campaign}
            activity={activity}
            merch={merch}
            isOwnProfile={isOwnProfile}
            isMobile={isMobile}
            onOpenSanctuary={onOpenSanctuary}
            onOpenMerch={onOpenMerch}
          />
        </div>
      </div>
    </div>
  );
};

export default GlassDockProfileHeader;
