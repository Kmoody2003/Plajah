/**
 * Native timeline cards (see services/feedCardsCore.ts for the data shapes).
 *
 *   <FeedCard item onOpen={(item) => route(item)} onDismiss?={(item) => mute kind} />
 *
 * `onOpen(item)` routing contract for the lead (switch on item.kind):
 *   LIVE_NOW        → watch stream: item.data.streamId (preferred, unified viewer) else item.data.url
 *   NEW_RELEASE     → open Chora album item.data.albumId
 *   NEW_VIDEO       → open Reello/video item.data.videoId
 *   CLUB_HIGHLIGHT  → open club item.data.clubId (scroll to post item.data.postId)
 *   LABS_DATAVIZ    → open post item.data.postId
 *   EVENT_SOON      → open event item.data.eventId (ppv_events)
 *   HISTORY_MOMENT  → navigate to history view (called when the embedded card's "See more" is tapped)
 *   DEBATE          → open debate detail: item.data.debateId (the existing DEBATE_DETAIL view; notifications use link 'DEBATE_DETAIL' + targetId)
 *   ACHIEVEMENT     → open the achiever's profile: item.data.userId (or congratulate/like — lead's choice)
 *   SPORTS_MOMENT   → open the Sports view for item.data.league / item.data.gameId (PlajahSportsView; fall back to the sports tab)
 */

import React from 'react';
import { Radio, Disc3, Play, Users, BarChart3, CalendarClock, Swords, Trophy, Activity } from 'lucide-react';
import FeedCardFrame from './FeedCardFrame';
import HistoryMomentPulseCard from '../../HistoryMomentPulseCard';
import type {
  FeedCardItem, LiveNowData, NewReleaseData, NewVideoData, ClubHighlightData, DataVizData, EventSoonData, HistoryMomentData,
  DebateCardData, AchievementCardData, SportsMomentData,
} from '../../../services/feedCardsCore';

interface CardProps<D> {
  item: Extract<FeedCardItem, { data: D }>;
  onOpen: (item: FeedCardItem) => void;
  onDismiss?: (item: FeedCardItem) => void;
}

const Avatar: React.FC<{ src?: string; name: string; size?: number }> = ({ src, name, size = 36 }) => (
  src
    ? <img src={src} alt="" loading="lazy" className="rounded-full object-cover" style={{ width: size, height: size }} />
    : <span className="inline-flex items-center justify-center rounded-full text-xs font-black" style={{ width: size, height: size, background: 'var(--pj-glass-3)' }}>{name.slice(0, 1).toUpperCase()}</span>
);

const Title: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="line-clamp-2 text-sm font-bold leading-snug" style={{ color: 'var(--text-main, inherit)' }}>{children}</p>
);
const Sub: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="line-clamp-1 text-xs opacity-60">{children}</p>
);

export const LiveNowCard: React.FC<CardProps<LiveNowData>> = ({ item, onOpen, onDismiss }) => {
  const d = item.data;
  return (
    <FeedCardFrame icon={<Radio size={14} />} kicker={d.viaClub && d.clubName ? `Live in ${d.clubName}` : 'Live now'} accent="magenta" live
      cta="Watch live" onOpen={() => onOpen(item)} onDismiss={onDismiss && (() => onDismiss(item))}>
      <div className="flex items-center gap-3">
        <Avatar src={d.ownerPhoto} name={d.ownerName} size={44} />
        <div className="min-w-0"><Title>{d.title}</Title><Sub>{d.ownerName}</Sub></div>
      </div>
    </FeedCardFrame>
  );
};

export const NewReleaseCard: React.FC<CardProps<NewReleaseData>> = ({ item, onOpen, onDismiss }) => {
  const d = item.data;
  return (
    <FeedCardFrame icon={<Disc3 size={14} />} kicker="New release" accent="orange" cta="Listen now"
      onOpen={() => onOpen(item)} onDismiss={onDismiss && (() => onDismiss(item))}>
      <div className="flex items-center gap-3">
        {d.coverImage
          ? <img src={d.coverImage} alt="" loading="lazy" className="h-16 w-16 shrink-0 rounded-xl object-cover" />
          : <span className="h-16 w-16 shrink-0 rounded-xl" style={{ background: 'var(--pj-grad-brand)' }} aria-hidden />}
        <div className="min-w-0">
          <Title>{d.title}</Title>
          <Sub>{d.artist}{d.trackCount ? ` · ${d.trackCount} ${d.trackCount === 1 ? 'track' : 'tracks'}` : ''}</Sub>
        </div>
      </div>
    </FeedCardFrame>
  );
};

export const NewVideoCard: React.FC<CardProps<NewVideoData>> = ({ item, onOpen, onDismiss }) => {
  const d = item.data;
  return (
    <FeedCardFrame icon={<Play size={14} />} kicker="New video" accent="cyan" cta="Watch"
      onOpen={() => onOpen(item)} onDismiss={onDismiss && (() => onDismiss(item))}>
      <div className="relative aspect-video w-full overflow-hidden rounded-2xl" style={{ background: 'var(--pj-glass-2)' }}>
        {d.thumbnailUrl && <img src={d.thumbnailUrl} alt="" loading="lazy" className="h-full w-full object-cover" />}
        <span className="absolute inset-0 flex items-center justify-center" aria-hidden>
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-black/55 text-white"><Play size={20} /></span>
        </span>
      </div>
      <div className="mt-3"><Title>{d.title}</Title>{d.ownerName && <Sub>{d.ownerName}</Sub>}</div>
    </FeedCardFrame>
  );
};

export const ClubHighlightCard: React.FC<CardProps<ClubHighlightData>> = ({ item, onOpen, onDismiss }) => {
  const d = item.data;
  return (
    <FeedCardFrame icon={<Users size={14} />} kicker={`Highlight · ${d.clubName}`} accent="purple" cta="Open club"
      onOpen={() => onOpen(item)} onDismiss={onDismiss && (() => onDismiss(item))}>
      <div className="flex items-start gap-3">
        <Avatar src={d.authorPhoto} name={d.authorName} />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold opacity-80">{d.authorName}</p>
          {d.text && <p className="mt-1 line-clamp-3 text-sm leading-snug">{d.text}</p>}
          <p className="mt-2 text-[11px] opacity-50">{d.likeCount} likes · {d.commentCount} comments</p>
        </div>
        {d.imageUrl && <img src={d.imageUrl} alt="" loading="lazy" className="h-16 w-16 shrink-0 rounded-xl object-cover" />}
      </div>
    </FeedCardFrame>
  );
};

export const DataVizCard: React.FC<CardProps<DataVizData>> = ({ item, onOpen, onDismiss }) => {
  const d = item.data;
  return (
    <FeedCardFrame icon={<BarChart3 size={14} />} kicker="Labs data story" accent="cyan" cta="Explore the data"
      onOpen={() => onOpen(item)} onDismiss={onDismiss && (() => onDismiss(item))}>
      <div className="flex items-center gap-3">
        <Avatar src={d.authorPhoto} name={d.authorName} />
        <div className="min-w-0"><Title>{d.text || 'A live data visualisation'}</Title><Sub>by {d.authorName}</Sub></div>
      </div>
    </FeedCardFrame>
  );
};

export const EventSoonCard: React.FC<CardProps<EventSoonData>> = ({ item, onOpen, onDismiss }) => {
  const d = item.data;
  const when = new Date(d.startTime).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  return (
    <FeedCardFrame icon={<CalendarClock size={14} />} kicker="Event soon" accent="orange" cta={d.price > 0 ? 'Get tickets' : 'Save my spot'}
      onOpen={() => onOpen(item)} onDismiss={onDismiss && (() => onDismiss(item))}>
      <div className="flex items-center gap-3">
        {d.thumbnailUrl
          ? <img src={d.thumbnailUrl} alt="" loading="lazy" className="h-16 w-24 shrink-0 rounded-xl object-cover" />
          : <span className="h-16 w-24 shrink-0 rounded-xl" style={{ background: 'var(--pj-grad-warm)' }} aria-hidden />}
        <div className="min-w-0"><Title>{d.title}</Title><Sub>{d.ownerName} · {when}</Sub></div>
      </div>
    </FeedCardFrame>
  );
};

const hoursLeft = (endsAt: number) => {
  const h = Math.max(0, Math.round((endsAt - Date.now()) / 3_600_000));
  return h <= 0 ? 'closing soon' : h === 1 ? '1 hour left' : `${h} hours left`;
};

export const DebateCard: React.FC<CardProps<DebateCardData>> = ({ item, onOpen, onDismiss }) => {
  const d = item.data;
  return (
    <FeedCardFrame icon={<Swords size={14} />} kicker={d.involvesFollowed ? 'Debate · someone you follow' : 'Live debate'} accent="magenta"
      cta="Watch & vote" onOpen={() => onOpen(item)} onDismiss={onDismiss && (() => onDismiss(item))}>
      <Title>{d.topic}</Title>
      <div className="mt-3 flex items-center gap-2">
        <Avatar src={d.challengerPhoto} name={d.challengerName} size={32} />
        <span className="text-[10px] font-black uppercase tracking-widest opacity-50">vs</span>
        <Avatar src={d.defenderPhoto} name={d.defenderName} size={32} />
        <div className="ml-2 min-w-0"><Sub>{d.challengerName} vs {d.defenderName}</Sub></div>
      </div>
      <p className="mt-2 text-[11px] opacity-50">{d.postCount} {d.postCount === 1 ? 'argument' : 'arguments'} · {d.supporterCount} {d.supporterCount === 1 ? 'vote' : 'votes'} · {hoursLeft(d.endsAt)}</p>
    </FeedCardFrame>
  );
};

export const AchievementCard: React.FC<CardProps<AchievementCardData>> = ({ item, onOpen, onDismiss }) => {
  const d = item.data;
  const color = d.color && /^#[0-9a-f]{3,8}$/i.test(d.color) ? d.color : undefined;
  return (
    <FeedCardFrame icon={<Trophy size={14} />} kicker="Achievement unlocked" accent="orange" cta={`See ${d.userName.split(' ')[0]}'s profile`}
      onOpen={() => onOpen(item)} onDismiss={onDismiss && (() => onDismiss(item))}>
      <div className="flex items-center gap-3">
        <Avatar src={d.userPhoto} name={d.userName} size={44} />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold opacity-80">{d.userName} earned</p>
          <Title>{d.title}</Title>
          {d.description && <Sub>{d.description}</Sub>}
        </div>
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl" style={{ background: color ? `${color}33` : 'var(--pj-orange-soft)', color: color ?? 'var(--pj-orange)' }} aria-hidden>
          <Trophy size={22} />
        </span>
      </div>
    </FeedCardFrame>
  );
};

export const SportsMomentCard: React.FC<CardProps<SportsMomentData>> = ({ item, onOpen, onDismiss }) => {
  const d = item.data;
  const live = d.state === 'in';
  const Side: React.FC<{ s: SportsMomentData['home'] }> = ({ s }) => (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-1 text-center">
      {s.logo ? <img src={s.logo} alt="" loading="lazy" className="h-10 w-10 object-contain" /> : <span className="flex h-10 w-10 items-center justify-center rounded-full text-xs font-black" style={{ background: 'var(--pj-glass-3)' }}>{(s.abbr || s.name).slice(0, 3).toUpperCase()}</span>}
      <span className="line-clamp-1 text-[11px] font-bold opacity-80">{s.abbr || s.name}</span>
      <span className="text-2xl font-black tabular-nums">{s.score || '–'}</span>
    </div>
  );
  return (
    <FeedCardFrame icon={<Activity size={14} />} kicker={live ? `${d.teamName} · playing now` : `${d.teamName} · final`} accent={live ? 'magenta' : 'cyan'} live={live}
      cta={live ? 'Follow the game' : 'See the recap'} onOpen={() => onOpen(item)} onDismiss={onDismiss && (() => onDismiss(item))}>
      <div className="flex items-center gap-2">
        <Side s={d.away} />
        <span className="text-[10px] font-black uppercase tracking-widest opacity-40">@</span>
        <Side s={d.home} />
      </div>
      <p className="mt-2 text-center text-[11px] opacity-60">
        {d.statusText}{!live && d.outcome ? ` · ${d.outcome === 'W' ? 'Win' : d.outcome === 'L' ? 'Loss' : 'Draw'}` : ''}
      </p>
    </FeedCardFrame>
  );
};

export const HistoryMomentCard: React.FC<CardProps<HistoryMomentData>> = ({ item, onOpen }) => (
  <div>
    <HistoryMomentPulseCard uid={item.data.uid} size="feed" category="MIX" startOffset={item.data.startOffset} onNavigate={() => onOpen(item)} />
  </div>
);

/** Dispatcher — renders the right card for `item.kind`. */
export const FeedCard: React.FC<{
  item: FeedCardItem;
  onOpen: (item: FeedCardItem) => void;
  onDismiss?: (item: FeedCardItem) => void;
}> = ({ item, onOpen, onDismiss }) => {
  switch (item.kind) {
    case 'LIVE_NOW': return <LiveNowCard item={item} onOpen={onOpen} onDismiss={onDismiss} />;
    case 'NEW_RELEASE': return <NewReleaseCard item={item} onOpen={onOpen} onDismiss={onDismiss} />;
    case 'NEW_VIDEO': return <NewVideoCard item={item} onOpen={onOpen} onDismiss={onDismiss} />;
    case 'CLUB_HIGHLIGHT': return <ClubHighlightCard item={item} onOpen={onOpen} onDismiss={onDismiss} />;
    case 'LABS_DATAVIZ': return <DataVizCard item={item} onOpen={onOpen} onDismiss={onDismiss} />;
    case 'EVENT_SOON': return <EventSoonCard item={item} onOpen={onOpen} onDismiss={onDismiss} />;
    case 'DEBATE': return <DebateCard item={item} onOpen={onOpen} onDismiss={onDismiss} />;
    case 'ACHIEVEMENT': return <AchievementCard item={item} onOpen={onOpen} onDismiss={onDismiss} />;
    case 'SPORTS_MOMENT': return <SportsMomentCard item={item} onOpen={onOpen} onDismiss={onDismiss} />;
    case 'HISTORY_MOMENT': return <HistoryMomentCard item={item} onOpen={onOpen} />;
    default: return null;
  }
};

export default FeedCard;
