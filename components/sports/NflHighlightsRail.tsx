import React from 'react';
import { ExternalLink, Play, Tv } from 'lucide-react';
import type { NflGameSummary, NflPlay, NflTeamInfo } from '../../services/nflGameService';
import { Eyebrow } from '../ui/Surface';

interface Props {
  game: NflGameSummary;
}

export function NflHighlightsRail({ game }: Props) {
  const { home, away, headlines, scoringPlays } = game;

  const videoCards = [];

  if (headlines && headlines.length > 0) {
    headlines.forEach((headline: any, index: number) => {
      videoCards.push({
        id: `headline-${index}`,
        title: headline.text || headline.shortText || 'NFL Highlight',
        subtitle: headline.shortText || 'Video',
        thumbnailUrl: headline.thumbnailUrl || null,
        link: headline.videoUrl || `https://www.espn.com/nfl/game/_/gameId/${game.gameId || ''}`,
        ctaText: headline.videoUrl ? 'Watch on ESPN' : 'Read on ESPN',
        color1: home?.color,
        color2: away?.color,
        icon: 'Tv'
      });
    });
  } else if (scoringPlays && scoringPlays.length > 0) {
    scoringPlays.forEach((play: NflPlay, index: number) => {
      let emoji = '🏈';
      const lowerType = (play.type || '').toLowerCase();
      if (lowerType.includes('field goal')) emoji = '🥅';
      else if (lowerType.includes('safety')) emoji = '🛡️';

      const playTeam = play.team === 'home' ? home : away;
      const otherTeam = play.team === 'home' ? away : home;

      videoCards.push({
        id: `play-${play.id || index}`,
        title: play.shortText || play.text || 'Scoring Play',
        subtitle: `${playTeam?.abbreviation || ''} Scoring Play`,
        thumbnailUrl: null,
        emoji,
        link: `https://www.youtube.com/results?search_query=${playTeam?.displayName?.replace(/ /g, '+') || ''}+${(play.shortText || play.text || '').replace(/ /g, '+')}`,
        ctaText: 'Search Play',
        color1: playTeam?.color,
        color2: otherTeam?.color,
        icon: 'Search'
      });
    });
  }

  // Always include full game search
  const dateStr = new Date().toLocaleDateString();
  const hName = home?.shortDisplayName || home?.displayName || '';
  const aName = away?.shortDisplayName || away?.displayName || '';
  const fullGameLink = `https://www.youtube.com/results?search_query=NFL+${aName.replace(/ /g, '+')}+vs+${hName.replace(/ /g, '+')}+highlights+${dateStr.replace(/\//g, '+')}`;

  videoCards.push({
    id: 'full-game',
    title: 'Full Game Highlights',
    subtitle: 'YouTube Search',
    thumbnailUrl: null,
    emoji: '🎬',
    link: fullGameLink,
    ctaText: 'Search YouTube',
    color1: away?.color,
    color2: home?.color,
    icon: 'Search'
  });

  return (
    <div className="flex flex-col gap-3 mt-6">
      <Eyebrow>🎬 Highlights & Recaps</Eyebrow>
      <div className="flex gap-3 overflow-x-auto no-scrollbar pb-2 -mx-1 px-1">
        {videoCards.map((card) => (
          <a
            key={card.id}
            href={card.link}
            target="_blank"
            rel="noopener noreferrer"
            className="flex flex-col flex-shrink-0 w-[280px] sm:w-[320px] rounded-2xl overflow-hidden transition-transform hover:scale-[1.02] active:scale-[0.98]"
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)'
            }}
          >
            <div className="relative h-[160px] w-full flex items-center justify-center">
              {card.thumbnailUrl ? (
                <img src={card.thumbnailUrl} alt={card.title} className="w-full h-full object-cover" />
              ) : (
                <div
                  className="w-full h-full flex items-center justify-center text-5xl"
                  style={{
                    background: `linear-gradient(135deg, ${card.color1 || '#111'} 0%, ${card.color2 || '#333'} 100%)`
                  }}
                >
                  {card.emoji}
                </div>
              )}
              <div className="absolute inset-0 bg-black/20 flex items-center justify-center transition-opacity hover:bg-black/10">
                <div className="w-10 h-10 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center text-white border border-white/20 shadow-lg">
                  <Play size={20} className="ml-1" fill="currentColor" />
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-2 p-4 flex-1">
              <div className="type-title-sm text-white line-clamp-2 leading-tight">
                {card.title}
              </div>
              <div className="type-label-sm text-[var(--text-secondary)] truncate">
                {card.subtitle}
              </div>
              <div className="mt-auto pt-2 flex items-center gap-1.5 text-xs font-medium text-[var(--pj-orange)] uppercase tracking-wider">
                {card.icon === 'Tv' ? <Tv size={14} /> : <ExternalLink size={14} />}
                {card.ctaText}
              </div>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
