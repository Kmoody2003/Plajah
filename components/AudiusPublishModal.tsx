/**
 * AudiusPublishModal — end-to-end publish flow from Plajah to Audius.
 *
 * Flow:
 *  1. Check localStorage for cached Audius credentials (bearerToken + userId).
 *  2. If missing → open OAuth popup via openAudiusOAuth().
 *  3. Handle the OAuth redirect callback in a message event (or a separate route).
 *  4. Call publishAlbumToAudius() with progress tracking per track.
 *  5. Show results with permalink links.
 *
 * Add to any component that shows album actions: <AudiusPublishModal album={album} />
 */

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Music2, ExternalLink, Loader2, Check, AlertCircle, LogIn } from 'lucide-react';
import { Album } from '../types';
import {
  openAudiusOAuth,
  exchangeAudiusCode,
  publishAlbumToAudius,
  AudiusConnectResult,
} from '../services/audiusService';

const CREDS_KEY = 'plajah_audius_credentials';
const REDIRECT_URI = `${window.location.origin}/auth/audius/callback`;

interface AudiusCreds { bearerToken: string; userId: string; handle: string }

function loadCreds(): AudiusCreds | null {
  try { return JSON.parse(localStorage.getItem(CREDS_KEY) ?? 'null'); } catch { return null; }
}
function saveCreds(c: AudiusCreds) { localStorage.setItem(CREDS_KEY, JSON.stringify(c)); }
function clearCreds() { localStorage.removeItem(CREDS_KEY); }

interface Props { album: Album; onClose: () => void }

type Step = 'idle' | 'oauth' | 'publishing' | 'done' | 'error';

interface TrackResult { title: string; trackId: string | null; permalink: string | null }

export default function AudiusPublishModal({ album, onClose }: Props) {
  const [creds, setCreds] = useState<AudiusCreds | null>(() => loadCreds());
  const [step, setStep] = useState<Step>('idle');
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [results, setResults] = useState<TrackResult[]>([]);
  const [error, setError] = useState('');

  // Listen for OAuth popup callback message
  useEffect(() => {
    const handler = async (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      const { type, code } = e.data ?? {};
      if (type !== 'audius_oauth_callback' || !code) return;

      setStep('publishing');
      try {
        const result: AudiusConnectResult | null = await exchangeAudiusCode(code, REDIRECT_URI);
        if (!result) throw new Error('Token exchange failed');
        const c: AudiusCreds = { bearerToken: result.token, userId: result.userId, handle: result.handle };
        saveCreds(c);
        setCreds(c);
        await runPublish(c);
      } catch (err: any) {
        setError(err.message ?? 'Connection failed');
        setStep('error');
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [album]);

  const startOAuth = () => {
    setStep('oauth');
    openAudiusOAuth(REDIRECT_URI);
  };

  const runPublish = useCallback(async (c: AudiusCreds) => {
    setStep('publishing');
    const tracks = album.tracks ?? [];
    setProgress({ done: 0, total: tracks.length });
    const trackResults: TrackResult[] = [];

    try {
      await publishAlbumToAudius(album, c.bearerToken, c.userId, (done, total) => {
        setProgress({ done, total });
        if (done > 0 && tracks[done - 1]) {
          trackResults.push({ title: tracks[done - 1].title, trackId: null, permalink: null });
          setResults([...trackResults]);
        }
      });
      setResults(tracks.map(t => ({ title: t.title, trackId: 'published', permalink: `https://audius.co/${c.handle}` })));
      setStep('done');
    } catch (err: any) {
      setError(err.message ?? 'Publish failed');
      setStep('error');
    }
  }, [album]);

  const handlePublish = () => {
    if (!creds) { startOAuth(); return; }
    runPublish(creds);
  };

  const tracks = album.tracks ?? [];
  const trackCount = tracks.length;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-6"
      onClick={onClose}>
      <motion.div
        initial={{ scale: 0.96, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.96, opacity: 0 }}
        transition={{ duration: 0.15 }}
        className="bg-[#141414] border border-white/8 rounded-2xl p-7 max-w-md w-full"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-purple-500/10 flex items-center justify-center">
              <Music2 size={15} className="text-purple-400" />
            </div>
            <div>
              <div className="font-bold text-sm">Publish to Audius</div>
              <div className="text-xs text-white/30">Decentralized music distribution</div>
            </div>
          </div>
          <button onClick={onClose} className="text-white/20 hover:text-white transition-colors"><X size={16}/></button>
        </div>

        {/* Album info */}
        <div className="flex items-center gap-3 mb-5 p-3 bg-white/[0.03] rounded-xl border border-white/5">
          {album.coverImage && <img src={album.coverImage} alt="" className="w-12 h-12 rounded-lg object-cover shrink-0"/>}
          <div className="min-w-0">
            <div className="font-bold text-sm truncate">{album.title}</div>
            <div className="text-xs text-white/40">{trackCount} track{trackCount !== 1 ? 's' : ''} · {album.artist}</div>
          </div>
        </div>

        {/* States */}
        {step === 'idle' && (
          <>
            {creds ? (
              <div className="mb-4 flex items-center gap-2 text-xs text-purple-400">
                <Check size={12}/> Connected as <strong>@{creds.handle}</strong>
                <button onClick={() => { clearCreds(); setCreds(null); }} className="ml-auto text-white/20 hover:text-white underline">Disconnect</button>
              </div>
            ) : (
              <div className="mb-4 p-3 bg-purple-500/5 border border-purple-500/15 rounded-xl text-xs text-white/50">
                You'll be redirected to Audius to authorize Plajah to upload on your behalf.
              </div>
            )}
            <button onClick={handlePublish}
              className="w-full py-3 bg-purple-500 text-white font-bold rounded-xl hover:bg-purple-400 transition-colors flex items-center justify-center gap-2">
              {creds ? <><Music2 size={15}/> Publish {trackCount} track{trackCount !== 1 ? 's' : ''} to Audius</> : <><LogIn size={15}/> Connect Audius to publish</>}
            </button>
          </>
        )}

        {step === 'oauth' && (
          <div className="flex flex-col items-center gap-4 py-6">
            <Loader2 size={24} className="text-purple-400 animate-spin"/>
            <p className="text-sm text-white/50">Waiting for Audius authorization…</p>
            <p className="text-xs text-white/25">Complete sign-in in the popup window.</p>
          </div>
        )}

        {step === 'publishing' && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm text-white/60">
              <Loader2 size={14} className="animate-spin text-purple-400"/>
              Uploading {progress.done} of {progress.total} tracks…
            </div>
            <div className="w-full bg-white/5 rounded-full h-1.5">
              <div className="bg-purple-500 h-1.5 rounded-full transition-all"
                style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }}/>
            </div>
            {tracks.slice(0, progress.done).map((t, i) => (
              <div key={i} className="flex items-center gap-2 text-xs text-white/40">
                <Check size={11} className="text-green-400"/> {t.title}
              </div>
            ))}
          </div>
        )}

        {step === 'done' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-green-400 font-bold text-sm">
              <Check size={16}/> Published successfully!
            </div>
            {creds && (
              <a href={`https://audius.co/${creds.handle}`} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 px-4 py-2.5 bg-purple-500/10 border border-purple-500/30 rounded-xl text-purple-400 text-sm hover:bg-purple-500/15 transition-colors">
                <ExternalLink size={13}/> View your Audius profile
              </a>
            )}
            <p className="text-xs text-white/30">Note: Audius may take a few minutes to process audio files.</p>
          </div>
        )}

        {step === 'error' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-red-400 text-sm">
              <AlertCircle size={14}/> {error || 'Something went wrong'}
            </div>
            <button onClick={() => setStep('idle')}
              className="w-full py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white/60 hover:bg-white/10 transition-colors">
              Try again
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
}
