/**
 * SportsStreamWrapper — viewer-side broadcast overlay.
 *
 * Drop this around any video/player component to add:
 *  - Real-time score bug canvas (synced via Firestore)
 *  - Highlight event toasts ("TOUCHDOWN! HOME 21 - 14 AWAY")
 *  - Player tracking coordinate overlay (when video ref is passed)
 *  - Commentary text scroll (text version of AI announcer voice)
 *  - Replay banner
 *
 * Usage:
 *   <SportsStreamWrapper feedId={feedId}>
 *     <PlajahLivePlayer ... />
 *   </SportsStreamWrapper>
 *
 * Or with player tracking enabled:
 *   <SportsStreamWrapper feedId={feedId} videoRef={videoRef} trackPlayers>
 *     <video ref={videoRef} ... />
 *   </SportsStreamWrapper>
 */

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import ScoreBugCanvas from './ScoreBugCanvas';
import { usePlayerTracker } from '../hooks/usePlayerTracker';
import {
  subscribeGameState, subscribeHighlights,
  type GameState, type HighlightEvent,
} from '../services/sportscastService';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  feedId: string;
  children: React.ReactNode;
  videoRef?: React.RefObject<HTMLVideoElement | null>;
  trackPlayers?: boolean;
}

interface HighlightToast {
  id: string;
  event: HighlightEvent;
}

// ─── Emoji map for highlight types ────────────────────────────────────────────

const HL_EMOJI: Record<string, string> = {
  TOUCHDOWN:    '🏈',
  GOAL:         '⚽',
  THREE_POINTER:'🏀',
  HOME_RUN:     '⚾',
  INTERCEPTION: '🔵',
  SAVE:         '🧤',
  BIG_PLAY:     '⚡',
  CUSTOM:       '🔥',
};

// ─── Component ────────────────────────────────────────────────────────────────

const SportsStreamWrapper: React.FC<Props> = ({
  feedId, children, videoRef, trackPlayers = false,
}) => {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [toasts, setToasts]       = useState<HighlightToast[]>([]);
  const [commentary, setCommentary] = useState('');
  const [showCommentary, setShowCommentary] = useState(false);
  const internalRef = useRef<HTMLVideoElement>(null);
  const effectiveRef = videoRef ?? internalRef;

  const { players } = usePlayerTracker(effectiveRef, trackPlayers && !!videoRef);

  // Subscribe to game state
  useEffect(() => {
    if (!feedId) return;
    return subscribeGameState(feedId, setGameState);
  }, [feedId]);

  // Subscribe to highlights → show toasts
  useEffect(() => {
    if (!feedId) return;
    let seenIds = new Set<string>();
    const startTs = Date.now();

    return subscribeHighlights(feedId, events => {
      // Only toast events that arrived after we joined
      events.forEach(ev => {
        if (!ev.id || seenIds.has(ev.id)) return;
        if (ev.timestamp < startTs - 5000) { seenIds.add(ev.id); return; }
        seenIds.add(ev.id);

        const toast: HighlightToast = { id: ev.id, event: ev };
        setToasts(prev => [toast, ...prev].slice(0, 4));
        if (ev.commentaryText) {
          setCommentary(ev.commentaryText);
          setShowCommentary(true);
          setTimeout(() => setShowCommentary(false), 8000);
        }
        // Auto-dismiss toast after 6s
        setTimeout(() => {
          setToasts(prev => prev.filter(t => t.id !== ev.id));
        }, 6000);
      });
    });
  }, [feedId]);

  // No active game → render children passthrough
  if (!gameState) return <>{children}</>;

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      {children}

      {/* Score bug canvas layer */}
      <ScoreBugCanvas
        gameState={gameState}
        players={players}
        showPlayerTracking={trackPlayers && players.length > 0}
      />

      {/* ── Highlight toasts (top-right) ──────────────────────────────── */}
      <div
        style={{
          position: 'absolute',
          top: 12,
          right: 16,
          zIndex: 20,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          pointerEvents: 'none',
        }}
      >
        <AnimatePresence>
          {toasts.map(t => (
            <motion.div
              key={t.id}
              initial={{ x: 80, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 80, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 400, damping: 28 }}
              style={{
                background: 'rgba(8,8,16,0.90)',
                border: '1px solid rgba(245,158,11,0.35)',
                borderRadius: 14,
                padding: '10px 16px',
                minWidth: 200,
                backdropFilter: 'blur(12px)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 20 }}>
                  {HL_EMOJI[t.event.type] ?? '🔥'}
                </span>
                <div>
                  <p style={{
                    color: '#F59E0B',
                    fontWeight: 900,
                    fontSize: 11,
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    margin: 0,
                  }}>
                    {t.event.label}
                  </p>
                  <p style={{
                    color: 'rgba(255,255,255,0.5)',
                    fontSize: 10,
                    margin: 0,
                    marginTop: 1,
                  }}>
                    {t.event.team === 'home'
                      ? gameState.homeTeam
                      : t.event.team === 'away'
                      ? gameState.awayTeam
                      : 'Play'}
                  </p>
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* ── AI Commentary scroll (bottom ticker) ─────────────────────── */}
      <AnimatePresence>
        {showCommentary && commentary && (
          <motion.div
            key="commentary"
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 20, opacity: 0 }}
            style={{
              position: 'absolute',
              bottom: 108, // sits above the score bug
              left: 0,
              right: 0,
              zIndex: 15,
              pointerEvents: 'none',
            }}
          >
            <div style={{
              margin: '0 20px',
              background: 'rgba(8,8,16,0.80)',
              backdropFilter: 'blur(8px)',
              border: '1px solid rgba(245,158,11,0.2)',
              borderRadius: 10,
              padding: '8px 16px',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}>
              <span style={{
                color: '#F59E0B',
                fontSize: 10,
                fontWeight: 900,
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                whiteSpace: 'nowrap',
              }}>
                📣 COMMENTATOR
              </span>
              <p style={{
                color: 'rgba(255,255,255,0.75)',
                fontSize: 11,
                fontStyle: 'italic',
                margin: 0,
              }}>
                "{commentary}"
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Player tracking badge ─────────────────────────────────────── */}
      {trackPlayers && players.length > 0 && (
        <div style={{
          position: 'absolute',
          top: 12,
          left: 20,
          zIndex: 20,
          pointerEvents: 'none',
        }}>
          <div style={{
            background: 'rgba(8,8,16,0.80)',
            border: '1px solid rgba(34,197,94,0.3)',
            borderRadius: 8,
            padding: '4px 10px',
            fontSize: 9,
            fontWeight: 900,
            color: '#22C55E',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
          }}>
            📡 {players.length} Player{players.length > 1 ? 's' : ''} Tracked
          </div>
        </div>
      )}
    </div>
  );
};

export default SportsStreamWrapper;
