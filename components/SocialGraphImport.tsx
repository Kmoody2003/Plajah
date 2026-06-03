/**
 * SocialGraphImport — seed your Plajah follow graph from Twitter/X and Instagram.
 *
 * Flow:
 *   Twitter/X:
 *     1. OAuth2 PKCE redirect to /api/social-import/twitter/auth
 *     2. Callback exchanges code → user access token (server-side)
 *     3. GET /api/social-import/twitter/following → list of followings
 *     4. Match email / username against Plajah users → auto-follow
 *
 *   Instagram (Basic Display API):
 *     1. OAuth redirect → Instagram auth → /api/social-import/instagram/callback
 *     2. Fetch followed accounts → match against Plajah
 *
 * The import is one-way and non-destructive — it only FOLLOWS new people.
 * Users can review matched accounts before confirming.
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Twitter, Instagram, UserPlus, Check, X, Loader2, AlertCircle, Users, ArrowRight, ExternalLink } from 'lucide-react';
import { auth } from '../services/firebase';

interface MatchedUser {
  plajahUid: string;
  displayName: string;
  photoURL?: string;
  externalHandle: string;
  alreadyFollowing: boolean;
}

type Platform = 'twitter' | 'instagram';
type ImportState = 'idle' | 'authorizing' | 'fetching' | 'review' | 'importing' | 'done' | 'error';

async function getAuthToken(): Promise<string | null> {
  return auth.currentUser?.getIdToken() ?? null;
}

async function startOAuth(platform: Platform): Promise<void> {
  const token = await getAuthToken();
  if (!token) { alert('Sign in first'); return; }
  const res = await fetch(`/api/social-import/${platform}/auth`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const { url } = await res.json();
  if (url) window.location.href = url;
}

async function fetchMatches(platform: Platform, code: string): Promise<MatchedUser[]> {
  const token = await getAuthToken();
  if (!token) return [];
  const res = await fetch(`/api/social-import/${platform}/matches?code=${encodeURIComponent(code)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Match fetch failed');
  return res.json();
}

async function importFollows(uids: string[]): Promise<void> {
  const token = await getAuthToken();
  if (!token) return;
  await fetch('/api/social-import/follow-batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ uids }),
  });
}

export default function SocialGraphImport() {
  const [platform, setPlatform] = useState<Platform | null>(null);
  const [importState, setImportState] = useState<ImportState>('idle');
  const [matches, setMatches] = useState<MatchedUser[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [imported, setImported] = useState(0);
  const [error, setError] = useState('');

  // Detect OAuth callback (code param in URL)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('social_import_code');
    const plt = params.get('social_import_platform') as Platform | null;
    if (code && plt) {
      // Clean URL
      window.history.replaceState({}, '', window.location.pathname);
      setPlatform(plt);
      setImportState('fetching');
      fetchMatches(plt, code)
        .then(m => {
          setMatches(m);
          setSelected(new Set(m.filter(u => !u.alreadyFollowing).map(u => u.plajahUid)));
          setImportState('review');
        })
        .catch(err => { setError(err.message); setImportState('error'); });
    }
  }, []);

  const toggleUser = (uid: string) =>
    setSelected(s => { const n = new Set(s); n.has(uid) ? n.delete(uid) : n.add(uid); return n; });

  const handleImport = async () => {
    setImportState('importing');
    const uids = [...selected];
    await importFollows(uids);
    setImported(uids.length);
    setImportState('done');
  };

  const newFollows = matches.filter(m => !m.alreadyFollowing);
  const alreadyFollowing = matches.filter(m => m.alreadyFollowing);

  return (
    <div className="space-y-4">
      <div className="text-xs font-bold uppercase tracking-widest text-white/30 mb-3">
        Find your people on Plajah
      </div>

      {importState === 'idle' && (
        <div className="grid grid-cols-2 gap-3">
          {/* Twitter/X */}
          <button
            onClick={() => { setPlatform('twitter'); setImportState('authorizing'); startOAuth('twitter'); }}
            className="flex flex-col items-center gap-3 p-5 bg-white/[0.03] border border-white/8 rounded-2xl hover:bg-white/6 hover:border-white/15 transition-all group"
          >
            <div className="w-10 h-10 rounded-xl bg-black border border-white/10 flex items-center justify-center">
              <span className="font-black text-white text-lg">𝕏</span>
            </div>
            <div>
              <div className="font-bold text-sm">Import from X</div>
              <div className="text-xs text-white/30 mt-0.5">Find people you follow</div>
            </div>
            <ArrowRight size={14} className="text-white/20 group-hover:text-white/50 transition-colors"/>
          </button>

          {/* Instagram */}
          <button
            onClick={() => { setPlatform('instagram'); setImportState('authorizing'); startOAuth('instagram'); }}
            className="flex flex-col items-center gap-3 p-5 bg-white/[0.03] border border-white/8 rounded-2xl hover:bg-white/6 hover:border-white/15 transition-all group"
          >
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
              <span className="text-white font-black text-xl">IG</span>
            </div>
            <div>
              <div className="font-bold text-sm">Import from Instagram</div>
              <div className="text-xs text-white/30 mt-0.5">Find your Instagram follows</div>
            </div>
            <ArrowRight size={14} className="text-white/20 group-hover:text-white/50 transition-colors"/>
          </button>
        </div>
      )}

      {(importState === 'authorizing' || importState === 'fetching') && (
        <div className="flex flex-col items-center gap-4 py-10">
          <Loader2 size={24} className="text-orange-400 animate-spin"/>
          <p className="text-sm text-white/50">
            {importState === 'authorizing' ? `Connecting to ${platform}…` : 'Finding your people on Plajah…'}
          </p>
        </div>
      )}

      {importState === 'review' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-white/60">
              Found <strong className="text-white">{newFollows.length}</strong> people from your {platform} to follow
            </p>
            <div className="flex gap-2">
              <button onClick={() => setSelected(new Set(newFollows.map(u => u.plajahUid)))} className="text-xs text-orange-400 hover:text-orange-300">All</button>
              <span className="text-white/20">/</span>
              <button onClick={() => setSelected(new Set())} className="text-xs text-white/40 hover:text-white">None</button>
            </div>
          </div>

          {newFollows.length === 0 && (
            <p className="text-sm text-white/30 text-center py-6">
              Everyone you follow on {platform} is already on Plajah and you're following them!
            </p>
          )}

          <div className="space-y-2 max-h-64 overflow-y-auto">
            {newFollows.map(u => (
              <button key={u.plajahUid} onClick={() => toggleUser(u.plajahUid)}
                className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-colors text-left ${selected.has(u.plajahUid) ? 'bg-orange-500/8 border-orange-500/30' : 'bg-white/[0.02] border-white/5 hover:bg-white/5'}`}>
                {u.photoURL
                  ? <img src={u.photoURL} alt="" className="w-9 h-9 rounded-full object-cover shrink-0"/>
                  : <div className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center shrink-0"><Users size={14} className="text-white/30"/></div>
                }
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">{u.displayName}</div>
                  <div className="text-xs text-white/30">@{u.externalHandle}</div>
                </div>
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${selected.has(u.plajahUid) ? 'border-orange-400 bg-orange-400' : 'border-white/20'}`}>
                  {selected.has(u.plajahUid) && <Check size={10} className="text-black"/>}
                </div>
              </button>
            ))}
          </div>

          {alreadyFollowing.length > 0 && (
            <p className="text-xs text-white/20">{alreadyFollowing.length} already following</p>
          )}

          <button onClick={handleImport} disabled={selected.size === 0}
            className="w-full flex items-center justify-center gap-2 py-3 bg-orange-500 text-black font-bold rounded-xl hover:bg-orange-400 transition-colors disabled:opacity-40">
            <UserPlus size={15}/>
            Follow {selected.size} creator{selected.size !== 1 ? 's' : ''} on Plajah
          </button>
        </div>
      )}

      {importState === 'importing' && (
        <div className="flex flex-col items-center gap-3 py-8">
          <Loader2 size={20} className="text-orange-400 animate-spin"/>
          <p className="text-sm text-white/50">Following {selected.size} creators…</p>
        </div>
      )}

      {importState === 'done' && (
        <div className="text-center py-8 space-y-3">
          <div className="w-12 h-12 bg-green-500/10 rounded-full flex items-center justify-center mx-auto">
            <Check size={20} className="text-green-400"/>
          </div>
          <p className="font-bold">Done! Following {imported} new creators.</p>
          <p className="text-xs text-white/30">Your feed will update with their posts.</p>
          <button onClick={() => { setImportState('idle'); setMatches([]); setSelected(new Set()); }}
            className="text-xs text-orange-400 hover:text-orange-300 underline">Import from another platform</button>
        </div>
      )}

      {importState === 'error' && (
        <div className="space-y-3 text-center py-6">
          <AlertCircle size={20} className="text-red-400 mx-auto"/>
          <p className="text-sm text-red-400">{error}</p>
          <button onClick={() => setImportState('idle')} className="text-xs text-white/40 hover:text-white underline">Try again</button>
        </div>
      )}

      {importState === 'idle' && (
        <p className="text-[10px] text-white/15 text-center">
          We only read your following list. We never post, DM, or access private data.
        </p>
      )}
    </div>
  );
}
