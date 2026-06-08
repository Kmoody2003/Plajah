// World Cup 2026 — Prediction Market
// Uses Plajah Points stored in Firestore (not the blockchain contract yet).
// This component is intentionally HIDDEN — set PREDICTIONS_LIVE = true in WorldCupHub.tsx to enable.

import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { TrendingUp, Lock, Coins, CheckCircle } from 'lucide-react';
import { collection, doc, getDoc, setDoc, getDocs, query, where } from 'firebase/firestore';
import { db, auth } from '../services/firebase';
import { WC26_MATCHES, getTeam, type WC26Match } from '../data/worldCup2026';
import { UserProfile } from '../types';

type Outcome = 'HOME' | 'DRAW' | 'AWAY';

interface PredictionEntry {
  uid: string;
  matchId: string;
  outcome: Outcome;
  stake: number;
  createdAt: number;
  settled?: boolean;
  won?: boolean;
  payout?: number;
}

interface MatchPool {
  matchId: string;
  homeStake: number;
  drawStake: number;
  awayStake: number;
  totalStake: number;
  locked: boolean;
}

interface Props {
  currentUser: UserProfile | null;
}

const STAKE_OPTIONS = [10, 25, 50, 100];

const WorldCupPredictionMarket: React.FC<Props> = ({ currentUser }) => {
  const uid = auth.currentUser?.uid;
  const [predictions, setPredictions] = useState<Record<string, PredictionEntry>>({});
  const [pools, setPools] = useState<Record<string, MatchPool>>({});
  const [placing, setPlacing] = useState<string | null>(null);
  const [selectedOutcome, setSelectedOutcome] = useState<Record<string, Outcome>>({});
  const [selectedStake, setSelectedStake] = useState<Record<string, number>>({});
  const [userPoints, setUserPoints] = useState<number>(0);

  const upcomingMatches = WC26_MATCHES
    .filter(m => m.kickoffMs > Date.now() - 2 * 60 * 60 * 1000)
    .sort((a, b) => a.kickoffMs - b.kickoffMs)
    .slice(0, 20);

  useEffect(() => {
    if (!uid) return;
    // Load user's existing predictions
    getDocs(query(collection(db, 'wc2026_predictions'), where('uid', '==', uid))).then(snap => {
      const map: Record<string, PredictionEntry> = {};
      snap.docs.forEach(d => { map[d.data().matchId] = d.data() as PredictionEntry; });
      setPredictions(map);
    }).catch(() => {});

    // Load user points
    getDoc(doc(db, 'users', uid)).then(d => {
      setUserPoints(d.data()?.points ?? 0);
    }).catch(() => {});

    // Load pools
    upcomingMatches.forEach(m => {
      getDoc(doc(db, 'wc2026_pools', m.id)).then(d => {
        if (d.exists()) {
          setPools(prev => ({ ...prev, [m.id]: d.data() as MatchPool }));
        }
      }).catch(() => {});
    });
  }, [uid]);

  const placePrediction = async (match: WC26Match) => {
    if (!uid || !auth.currentUser) return;
    const outcome = selectedOutcome[match.id];
    const stake = selectedStake[match.id] ?? 10;
    if (!outcome) return;
    if (stake > userPoints) return;

    setPlacing(match.id);
    try {
      const entry: PredictionEntry = {
        uid,
        matchId: match.id,
        outcome,
        stake,
        createdAt: Date.now(),
      };
      await setDoc(doc(db, 'wc2026_predictions', `${uid}_${match.id}`), entry, { merge: true });

      // Update pool
      const poolRef = doc(db, 'wc2026_pools', match.id);
      const poolSnap = await getDoc(poolRef);
      const existing: MatchPool = poolSnap.exists() ? (poolSnap.data() as MatchPool) : {
        matchId: match.id, homeStake: 0, drawStake: 0, awayStake: 0, totalStake: 0, locked: false,
      };
      const field = outcome === 'HOME' ? 'homeStake' : outcome === 'DRAW' ? 'drawStake' : 'awayStake';
      const updated = {
        ...existing,
        [field]: existing[field as keyof MatchPool] as number + stake,
        totalStake: existing.totalStake + stake,
      };
      await setDoc(poolRef, updated, { merge: true });

      setPredictions(prev => ({ ...prev, [match.id]: entry }));
      setPools(prev => ({ ...prev, [match.id]: updated }));
      setUserPoints(p => p - stake);
    } catch (e) {
      console.error('[WC Predictions]', e);
    } finally {
      setPlacing(null);
    }
  };

  const getOdds = (pool: MatchPool | undefined, outcome: Outcome): string => {
    if (!pool || pool.totalStake === 0) return '—';
    const side = outcome === 'HOME' ? pool.homeStake : outcome === 'DRAW' ? pool.drawStake : pool.awayStake;
    if (side === 0) return '∞';
    return (pool.totalStake / side).toFixed(2) + 'x';
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[9px] font-black uppercase tracking-[0.3em] text-[#FF8C00] mb-1 flex items-center gap-2">
            <TrendingUp size={10} /> Prediction Market
          </p>
          <p className="text-xs text-white/35">Stake Plajah Points · No real money involved</p>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 bg-[#FF8C00]/10 border border-[#FF8C00]/20 rounded-xl">
          <Coins size={13} className="text-[#FF8C00]" />
          <span className="text-sm font-black text-white">{userPoints.toLocaleString()}</span>
          <span className="text-[9px] text-white/40 font-bold">pts</span>
        </div>
      </div>

      {!uid && (
        <div className="py-12 text-center bg-white/[0.02] border border-white/8 rounded-2xl">
          <Lock size={28} className="text-white/15 mx-auto mb-3" />
          <p className="text-sm text-white/30">Sign in to place predictions</p>
        </div>
      )}

      {uid && upcomingMatches.map(match => {
        const home = getTeam(match.homeTeamId);
        const away = getTeam(match.awayTeamId);
        if (!home || !away) return null;
        const existing = predictions[match.id];
        const pool = pools[match.id];
        const kickoff = new Date(match.kickoffMs);
        const isLocked = match.kickoffMs < Date.now() + 30 * 60 * 1000; // locked 30min before kick

        return (
          <div key={match.id} className="p-4 bg-white/[0.03] border border-white/8 rounded-2xl space-y-3">
            {/* Match header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-xl">{home.flag}</span>
                <span className="text-[10px] font-bold text-white/40">vs</span>
                <span className="text-xl">{away.flag}</span>
                <div>
                  <p className="text-xs font-black text-white">{home.shortName} vs {away.shortName}</p>
                  <p className="text-[8px] text-white/30">
                    {kickoff.toLocaleDateString([], { month: 'short', day: 'numeric' })} · {match.city}
                  </p>
                </div>
              </div>
              {isLocked && (
                <span className="flex items-center gap-1 text-[8px] font-black text-white/30 uppercase tracking-widest">
                  <Lock size={9} /> Locked
                </span>
              )}
            </div>

            {/* Pool odds */}
            {pool && (
              <div className="grid grid-cols-3 gap-2 text-center">
                {(['HOME','DRAW','AWAY'] as Outcome[]).map(o => (
                  <div key={o} className="p-2 bg-white/[0.02] rounded-xl">
                    <p className="text-[7px] font-black uppercase tracking-wider text-white/30">{o}</p>
                    <p className="text-sm font-black text-white mt-1">{getOdds(pool, o)}</p>
                    <p className="text-[7px] text-white/20">{o === 'HOME' ? pool.homeStake : o === 'DRAW' ? pool.drawStake : pool.awayStake} pts pooled</p>
                  </div>
                ))}
              </div>
            )}

            {/* Already predicted */}
            {existing ? (
              <div className="flex items-center gap-2 p-3 bg-green-500/8 border border-green-500/20 rounded-xl">
                <CheckCircle size={14} className="text-green-400 shrink-0" />
                <div>
                  <p className="text-[9px] font-black text-green-400">Prediction placed: {existing.outcome} · {existing.stake} pts</p>
                  {existing.settled && (
                    <p className="text-[8px] text-white/40 mt-0.5">
                      {existing.won ? `Won ${existing.payout} pts` : 'Lost'}
                    </p>
                  )}
                </div>
              </div>
            ) : isLocked ? (
              <p className="text-center text-[9px] text-white/20 py-1">Predictions closed</p>
            ) : (
              <div className="space-y-2">
                {/* Outcome selector */}
                <div className="grid grid-cols-3 gap-2">
                  {([
                    { o: 'HOME' as Outcome, label: home.shortName, flag: home.flag },
                    { o: 'DRAW' as Outcome, label: 'Draw',         flag: '🤝' },
                    { o: 'AWAY' as Outcome, label: away.shortName, flag: away.flag },
                  ]).map(({ o, label, flag }) => (
                    <button
                      key={o}
                      onClick={() => setSelectedOutcome(prev => ({ ...prev, [match.id]: o }))}
                      className={`py-2.5 rounded-xl border text-center transition-all ${
                        selectedOutcome[match.id] === o
                          ? 'border-[#FF8C00] bg-[#FF8C00]/15 text-white'
                          : 'border-white/10 bg-white/[0.02] text-white/40 hover:text-white/70 hover:border-white/20'
                      }`}
                    >
                      <span className="block text-lg mb-0.5">{flag}</span>
                      <span className="text-[8px] font-black uppercase tracking-wider">{label}</span>
                    </button>
                  ))}
                </div>

                {/* Stake selector */}
                <div className="flex items-center gap-2">
                  <span className="text-[8px] font-bold text-white/30 shrink-0">Stake:</span>
                  {STAKE_OPTIONS.map(pts => (
                    <button
                      key={pts}
                      onClick={() => setSelectedStake(prev => ({ ...prev, [match.id]: pts }))}
                      disabled={pts > userPoints}
                      className={`flex-1 py-1.5 rounded-lg text-[8px] font-black transition-all disabled:opacity-30 ${
                        (selectedStake[match.id] ?? 10) === pts
                          ? 'bg-[#FF8C00] text-black'
                          : 'bg-white/5 text-white/50 hover:bg-white/10'
                      }`}
                    >
                      {pts}pts
                    </button>
                  ))}
                </div>

                {/* Place button */}
                <button
                  onClick={() => placePrediction(match)}
                  disabled={!selectedOutcome[match.id] || placing === match.id}
                  className="w-full py-2.5 rounded-xl bg-[#FF8C00] text-black text-[10px] font-black uppercase tracking-widest disabled:opacity-40 hover:bg-orange-400 transition-colors"
                >
                  {placing === match.id ? 'Placing…' : `Place Prediction · ${selectedStake[match.id] ?? 10} pts`}
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default WorldCupPredictionMarket;
