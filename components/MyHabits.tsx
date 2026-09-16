import React, { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../services/firebase';
import { HabitEntry, loadHabits } from '../services/habitsService';

const groups: { name: string; kinds: HabitEntry['kind'][] }[] = [
  { name: 'Albums & Songs', kinds: ['CHORA'] },
  { name: 'Shows & Movies', kinds: ['TALEO', 'RELLO', 'VIDEO'] },
  { name: 'Books', kinds: ['BOOK'] },
  { name: 'Articles', kinds: ['ARTICLE'] },
  { name: 'Games opened', kinds: ['GAME'] },
];

export default function MyHabits({ uid }: { uid: string }) {
  const [entries, setEntries] = useState<HabitEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [revision, refresh] = useState(0);
  useEffect(() => {
    let alive = true;
    let request = 0;
    const reload = async () => {
      const token = ++request;
      if (auth.currentUser?.uid !== uid) { setEntries([]); setMessage('Sign in to view your activity.'); setLoading(false); return; }
      try {
        const result = await loadHabits(uid);
        if (!alive || token !== request) return;
        setEntries(result.entries);
        setMessage(result.offline ? 'Cloud history is unavailable. Showing activity saved on this device where available.' : '');
      } catch { if (alive && token === request) { setEntries([]); setMessage('Unable to load your activity. Please retry.'); } }
      finally { if (alive && token === request) setLoading(false); }
    };
    setEntries([]); setLoading(true);
    const unsubscribe = onAuthStateChanged(auth, reload);
    window.addEventListener('focus', reload);
    window.addEventListener('plajah:habits-updated', reload);
    return () => { alive = false; request++; unsubscribe(); window.removeEventListener('focus', reload); window.removeEventListener('plajah:habits-updated', reload); };
  }, [uid, revision]);
  const days = new Set(entries.map(e => new Date(e.updatedAt).toLocaleDateString())).size;
  return <div className="space-y-10 text-white">
    <header><p className="text-xs uppercase tracking-widest text-orange-400">Your activity</p><h2 className="font-bebas text-6xl">My Habits</h2><p className="text-sm text-white/50">Your recorded listening, watching, reading, and game activity.</p><button onClick={() => refresh(v => v + 1)} className="mt-4 px-4 py-2 rounded-full bg-white/10">Refresh history</button></header>
    {message && <p role="status" className="text-amber-300 text-sm">{message}</p>}
    {loading ? <p role="status">Loading your activity…</p> : <>
      <div className="grid grid-cols-2 gap-4"><div className="p-5 rounded-2xl bg-white/5"><strong className="text-3xl">{entries.length}</strong><p className="text-sm text-white/50">Titles in recorded history</p></div><div className="p-5 rounded-2xl bg-white/5"><strong className="text-3xl">{days}</strong><p className="text-sm text-white/50">Distinct last-active dates</p></div></div>
      <p className="text-xs text-white/40">Based on your latest saved activity per title. This is not a count of all sessions or total time spent.</p>
      {groups.map(group => <section key={group.name}><h3 className="text-2xl font-bold mb-4">{group.name}</h3><div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {entries.filter(e => group.kinds.includes(e.kind)).map(entry => {
          const progress = Number.isFinite(entry.positionSec) && Number.isFinite(entry.durationSec) && entry.durationSec! > 0 ? Math.max(0, Math.min(100, Math.round(entry.positionSec! / entry.durationSec! * 100))) : undefined;
          const type = entry.kind === 'CHORA' ? 'album' : entry.kind === 'TALEO' ? 'movie' : entry.kind === 'BOOK' ? 'book' : entry.kind === 'ARTICLE' ? 'article' : entry.kind === 'GAME' ? 'game' : 'video';
          const href = entry.kind === 'CHORA' && !entry.albumId ? undefined : `/?${new URLSearchParams({ type, id: entry.albumId || entry.id, ...(entry.kind === 'CHORA' ? { track: entry.id } : {}) })}`;
          return <article key={`${entry.kind}:${entry.id}`} className="p-4 rounded-2xl border border-white/10 bg-white/[.03] flex gap-4">
            {entry.thumbnailUrl && <img src={entry.thumbnailUrl} alt="" className="w-14 h-14 rounded-lg object-cover" />}
            <div className="min-w-0 flex-1"><h4 className="font-bold truncate">{entry.title || 'Untitled'}</h4><p className="text-xs text-white/50">{entry.ownerName}</p><p className="text-xs text-white/40 mt-2">{new Date(entry.updatedAt).toLocaleString()}</p>{entry.location && <p className="text-xs mt-2">Last position · {entry.location}</p>}
              {progress !== undefined && <div className="mt-3"><progress className="w-full h-1 accent-orange-400" max={100} value={progress} aria-label={`${entry.title} playback position`} /><p className="text-xs text-white/50">{progress}% playback position{entry.completed ? ' · Finished' : ''}</p></div>}
              {href && <a href={href} className="inline-block text-xs text-cyan-300 mt-3">Open →</a>}
            </div>
          </article>;
        })}
        {!entries.some(e => group.kinds.includes(e.kind)) && <p className="p-6 border border-dashed border-white/10 rounded-2xl text-sm text-white/40">No recorded activity yet.</p>}
      </div></section>)}
    </>}
  </div>;
}
