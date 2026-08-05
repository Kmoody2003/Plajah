import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { Heart, X, Lock, Unlock, BookHeart, Trash2, Plus, Music, Link as LinkIcon, StickyNote, ShieldAlert } from 'lucide-react';
import type { Album, DiaryEntry } from '../types';
import { auth, fetchUserContent } from '../services/backendService';
import {
  ensureDiary, getDiary, hasSafeword, setSafeword, verifySafeword,
  addEntry, deleteEntry, resetDiary, decryptEntryText,
} from '../services/couplesDiary';

interface Props {
  roomId: string;
  participantUids: string[];
  accent?: string;               // intimate theme accent
  onClose: () => void;
}

const MOODS: { key: NonNullable<DiaryEntry['mood']>; label: string; emoji: string }[] = [
  { key: 'LOVED', label: 'Loved', emoji: '💗' },
  { key: 'HAPPY', label: 'Happy', emoji: '😊' },
  { key: 'PLAYFUL', label: 'Playful', emoji: '😏' },
  { key: 'INTIMATE', label: 'Intimate', emoji: '🔥' },
];

const CouplesDiaryView: React.FC<Props> = ({ roomId, participantUids, accent = '#ff6b6b', onClose }) => {
  const [loading, setLoading] = useState(true);
  const [needsSafeword, setNeedsSafeword] = useState(false); // a safeword exists → must enter it
  const [firstTime, setFirstTime] = useState(false);         // no safeword yet → set one
  const [unlocked, setUnlocked] = useState(false);
  const [safeword, setSafewordState] = useState('');         // held for the session only
  const [pwInput, setPwInput] = useState('');
  const [pwConfirm, setPwConfirm] = useState('');
  const [error, setError] = useState('');

  const [entries, setEntries] = useState<DiaryEntry[]>([]);
  const [plain, setPlain] = useState<Record<string, string>>({}); // entryId → decrypted note

  // Composer
  const [kind, setKind] = useState<DiaryEntry['kind']>('NOTE');
  const [noteText, setNoteText] = useState('');
  const [mood, setMood] = useState<DiaryEntry['mood']>('LOVED');
  const [linkUrl, setLinkUrl] = useState('');
  const [linkTitle, setLinkTitle] = useState('');
  const [albums, setAlbums] = useState<Album[]>([]);
  const [selectedAlbumId, setSelectedAlbumId] = useState('');
  const [saving, setSaving] = useState(false);

  const uid = auth.currentUser?.uid;

  // Load / create the diary
  useEffect(() => {
    (async () => {
      setLoading(true);
      const d = await ensureDiary(roomId, participantUids);
      setEntries(d.entries || []);
      if (hasSafeword(d)) setNeedsSafeword(true);
      else setFirstTime(true);
      setLoading(false);
    })();
  }, [roomId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load the user's albums for the "attach playlist" picker
  useEffect(() => { if (uid) fetchUserContent(uid).then(setAlbums).catch(() => {}); }, [uid]);

  // Decrypt notes whenever unlocked / entries change
  useEffect(() => {
    if (!unlocked) return;
    let cancelled = false;
    (async () => {
      const map: Record<string, string> = {};
      await Promise.all(entries.filter(e => e.kind === 'NOTE' && e.text).map(async (e) => {
        map[e.id] = await decryptEntryText(e, roomId, safeword);
      }));
      if (!cancelled) setPlain(map);
    })();
    return () => { cancelled = true; };
  }, [unlocked, entries, safeword, roomId]);

  const refresh = async () => {
    const d = await getDiary(roomId);
    setEntries(d?.entries || []);
  };

  const handleSetSafeword = async () => {
    setError('');
    if (pwInput.length < 4) { setError('Choose a safeword of at least 4 characters.'); return; }
    if (pwInput !== pwConfirm) { setError('The safewords do not match.'); return; }
    await setSafeword(roomId, pwInput);
    setSafewordState(pwInput);
    setFirstTime(false);
    setUnlocked(true);
    setPwInput(''); setPwConfirm('');
  };

  const handleUnlock = async () => {
    setError('');
    const d = await getDiary(roomId);
    if (!d) { setError('Diary unavailable.'); return; }
    if (await verifySafeword(d, pwInput)) {
      setSafewordState(pwInput);
      setEntries(d.entries || []);
      setUnlocked(true);
      setNeedsSafeword(false);
      setPwInput('');
    } else {
      setError('That safeword is not right.');
    }
  };

  const relock = () => { setUnlocked(false); setSafewordState(''); setPlain({}); setNeedsSafeword(true); setPwInput(''); };

  const canSave = kind === 'NOTE' ? !!noteText.trim() : kind === 'LINK' ? !!linkUrl.trim() : !!selectedAlbumId;

  const handleAdd = async () => {
    if (!canSave || saving) return;
    setSaving(true);
    try {
      if (kind === 'NOTE') {
        await addEntry(roomId, { kind: 'NOTE', text: noteText.trim(), mood }, safeword);
        setNoteText('');
      } else if (kind === 'LINK') {
        await addEntry(roomId, { kind: 'LINK', url: linkUrl.trim(), title: linkTitle.trim() || linkUrl.trim() }, safeword);
        setLinkUrl(''); setLinkTitle('');
      } else {
        const al = albums.find(a => a.id === selectedAlbumId);
        await addEntry(roomId, { kind: 'PLAYLIST', albumId: selectedAlbumId, mediaTitle: al?.title, mediaCover: al?.coverImage }, safeword);
        setSelectedAlbumId('');
      }
      await refresh();
    } catch (e: any) {
      setError(e?.message || 'Could not save that entry.');
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => { await deleteEntry(roomId, id); await refresh(); };

  const handleReset = async () => {
    if (!confirm('Reset the diary? This permanently erases every entry and the safeword for both of you.')) return;
    await resetDiary(roomId);
    setEntries([]); setPlain({}); setUnlocked(false); setSafewordState(''); setNeedsSafeword(false); setFirstTime(true);
  };

  const sortedEntries = useMemo(() => [...entries].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)), [entries]);

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/80 backdrop-blur-xl" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg max-h-[88vh] flex flex-col rounded-3xl border overflow-hidden"
        style={{ background: 'rgba(14,5,9,0.96)', borderColor: `${accent}44` }}
      >
        {/* Header */}
        <div className="shrink-0 flex items-center gap-2 px-5 py-4 border-b" style={{ borderColor: `${accent}22` }}>
          <BookHeart size={18} style={{ color: accent }} />
          <span className="text-sm font-black uppercase tracking-widest">Shared Diary</span>
          {unlocked && (
            <button onClick={relock} title="Lock" className="ml-2 p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/10"><Lock size={13} /></button>
          )}
          <button onClick={onClose} className="ml-auto p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/10"><X size={16} /></button>
        </div>

        {loading ? (
          <div className="p-10 text-center text-white/40 text-sm">Opening your diary…</div>
        ) : !unlocked ? (
          // ── Lock screen ──────────────────────────────────────────────
          <div className="p-6 flex flex-col gap-4">
            <div className="flex flex-col items-center text-center gap-2 py-2">
              <div className="w-14 h-14 rounded-2xl grid place-items-center" style={{ background: `${accent}1e`, color: accent }}>
                {firstTime ? <BookHeart size={26} /> : <Lock size={26} />}
              </div>
              <p className="text-sm font-black uppercase tracking-widest">{firstTime ? 'Create your safeword' : 'Enter your safeword'}</p>
              <p className="text-[11px] text-white/40 leading-relaxed max-w-xs">
                {firstTime
                  ? 'Choose a private safeword together. It unlocks this diary and encrypts every note — only the two of you, with the safeword, can read them.'
                  : 'Enter the safeword you set together to unlock your notes.'}
              </p>
            </div>

            <input
              type="password"
              value={pwInput}
              onChange={(e) => setPwInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !firstTime) handleUnlock(); }}
              placeholder="Safeword"
              className="w-full bg-white/[0.06] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/25 outline-none focus:border-white/30"
            />
            {firstTime && (
              <input
                type="password"
                value={pwConfirm}
                onChange={(e) => setPwConfirm(e.target.value)}
                placeholder="Confirm safeword"
                className="w-full bg-white/[0.06] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/25 outline-none focus:border-white/30"
              />
            )}
            {error && <p className="text-[11px] font-bold text-red-400 flex items-center gap-1"><ShieldAlert size={12} /> {error}</p>}

            <button
              onClick={firstTime ? handleSetSafeword : handleUnlock}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-[11px] font-black uppercase tracking-widest text-black"
              style={{ background: accent }}
            >
              <Unlock size={14} /> {firstTime ? 'Create & Open' : 'Unlock'}
            </button>

            {!firstTime && (
              <button onClick={handleReset} className="text-[10px] font-bold text-white/30 hover:text-red-400 uppercase tracking-widest">
                Forgot the safeword? Reset the diary
              </button>
            )}
            <p className="text-[9px] text-white/25 leading-relaxed text-center">
              Notes are encrypted with your safeword — if it's lost, they can't be recovered, only reset.
            </p>
          </div>
        ) : (
          // ── Unlocked diary ───────────────────────────────────────────
          <>
            <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
              {sortedEntries.length === 0 && (
                <p className="text-center text-white/30 text-xs py-10 uppercase tracking-widest">Your first shared memory goes here 💗</p>
              )}
              {sortedEntries.map((e) => (
                <div key={e.id} className="group relative p-4 rounded-2xl border" style={{ background: 'rgba(255,255,255,0.03)', borderColor: `${accent}1f` }}>
                  <button onClick={() => handleDelete(e.id)} className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 p-1 text-white/30 hover:text-red-400 transition-opacity"><Trash2 size={13} /></button>
                  {e.kind === 'NOTE' && (
                    <>
                      <div className="flex items-center gap-1.5 mb-1.5">
                        {e.mood && <span className="text-sm">{MOODS.find(m => m.key === e.mood)?.emoji}</span>}
                        <span className="text-[8px] font-black uppercase tracking-widest text-white/30">{e.authorUid === uid ? 'You' : 'Them'}</span>
                      </div>
                      <p className="text-sm text-white/90 whitespace-pre-wrap break-words">{plain[e.id] ?? '…'}</p>
                    </>
                  )}
                  {e.kind === 'PLAYLIST' && (
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-xl overflow-hidden bg-white/5 grid place-items-center shrink-0">
                        {e.mediaCover ? <img src={e.mediaCover} alt="" className="w-full h-full object-cover" /> : <Music size={16} className="text-white/30" />}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold truncate">{e.mediaTitle || 'Shared playlist'}</p>
                        <p className="text-[9px] uppercase tracking-widest text-white/30">Playlist</p>
                      </div>
                    </div>
                  )}
                  {e.kind === 'LINK' && (
                    <a href={e.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm" style={{ color: accent }}>
                      <LinkIcon size={14} className="shrink-0" />
                      <span className="truncate underline">{e.title || e.url}</span>
                    </a>
                  )}
                </div>
              ))}
            </div>

            {/* Composer */}
            <div className="shrink-0 border-t p-4 space-y-3" style={{ borderColor: `${accent}22` }}>
              <div className="flex gap-1.5">
                {([['NOTE', StickyNote, 'Note'], ['PLAYLIST', Music, 'Playlist'], ['LINK', LinkIcon, 'Link']] as const).map(([k, Icon, label]) => (
                  <button
                    key={k}
                    onClick={() => setKind(k)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all"
                    style={kind === k ? { background: `${accent}26`, color: accent } : { background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.4)' }}
                  >
                    <Icon size={12} /> {label}
                  </button>
                ))}
              </div>

              {kind === 'NOTE' && (
                <>
                  <textarea
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    rows={2}
                    placeholder="Write something just for the two of you…"
                    className="w-full bg-white/[0.06] border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-white/25 outline-none focus:border-white/30 resize-none"
                  />
                  <div className="flex gap-1.5">
                    {MOODS.map(m => (
                      <button key={m.key} onClick={() => setMood(m.key)}
                        className="px-2.5 py-1 rounded-full text-[9px] font-bold transition-all"
                        style={mood === m.key ? { background: `${accent}26`, color: accent } : { background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.4)' }}>
                        {m.emoji} {m.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
              {kind === 'LINK' && (
                <div className="space-y-2">
                  <input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://…" className="w-full bg-white/[0.06] border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-white/25 outline-none focus:border-white/30" />
                  <input value={linkTitle} onChange={(e) => setLinkTitle(e.target.value)} placeholder="Label (optional)" className="w-full bg-white/[0.06] border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-white/25 outline-none focus:border-white/30" />
                </div>
              )}
              {kind === 'PLAYLIST' && (
                <select
                  value={selectedAlbumId}
                  onChange={(e) => setSelectedAlbumId(e.target.value)}
                  className="w-full bg-white/[0.06] border border-white/10 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-white/30"
                >
                  <option value="" className="bg-[#1a0a10]">Choose one of your albums…</option>
                  {albums.map(a => <option key={a.id} value={a.id} className="bg-[#1a0a10]">{a.title}</option>)}
                </select>
              )}

              {error && <p className="text-[11px] font-bold text-red-400">{error}</p>}
              <div className="flex items-center gap-2">
                <button onClick={handleReset} title="Reset diary" className="p-2.5 rounded-xl text-white/25 hover:text-red-400 hover:bg-white/5"><Trash2 size={14} /></button>
                <button
                  onClick={handleAdd}
                  disabled={!canSave || saving}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest text-black disabled:opacity-30"
                  style={{ background: accent }}
                >
                  <Plus size={14} /> {saving ? 'Saving…' : 'Add to diary'}
                </button>
              </div>
            </div>
          </>
        )}
      </motion.div>
    </div>
  );
};

export default CouplesDiaryView;
