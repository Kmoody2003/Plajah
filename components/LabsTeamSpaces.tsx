import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowLeft, Plus, Users, X, Edit, Send, Trash2, ChevronRight,
  BookOpen, FileText, Clipboard, Pin, Globe, Lock, Copy, Check,
  MessageSquare, FlaskConical,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TeamPost {
  id: string;
  authorId: string;
  authorName: string;
  content: string;
  isPinned?: boolean;
  tags?: string[];
  createdAt: number;
}

export interface TeamSpace {
  id: string;
  name: string;
  description?: string;
  discipline?: string;
  isPublic: boolean;
  ownerId: string;
  ownerName: string;
  members: { uid: string; name: string; role: 'OWNER' | 'MEMBER' }[];
  posts: TeamPost[];
  inviteCode: string;
  color: string;
  createdAt: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const uid_short = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const fmtDate = (ts: number) => new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

const SPACE_COLORS = ['#00B4D8', '#06D6A0', '#9775FA', '#60a5fa', '#fbbf24', '#f472b6', '#34d399', '#fb923c'];

function generateInviteCode(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

// ── Space Board (inside a space) ──────────────────────────────────────────────

const SpaceBoard: React.FC<{
  space: TeamSpace;
  currentUser: any;
  onUpdate: (s: TeamSpace) => void;
  onBack: () => void;
}> = ({ space, currentUser, onUpdate, onBack }) => {
  const [postText, setPostText] = useState('');
  const [copiedCode, setCopiedCode] = useState(false);

  const upd = (patch: Partial<TeamSpace>) => onUpdate({ ...space, ...patch });

  const addPost = () => {
    if (!postText.trim()) return;
    const post: TeamPost = {
      id: uid_short(),
      authorId: currentUser?.uid ?? 'guest',
      authorName: currentUser?.displayName ?? 'Anonymous',
      content: postText.trim(),
      createdAt: Date.now(),
    };
    upd({ posts: [post, ...space.posts] });
    setPostText('');
  };

  const deletePost = (id: string) => upd({ posts: space.posts.filter(p => p.id !== id) });
  const togglePin = (id: string) => upd({ posts: space.posts.map(p => p.id === id ? { ...p, isPinned: !p.isPinned } : p) });

  const copyCode = () => {
    navigator.clipboard.writeText(space.inviteCode);
    setCopiedCode(true); setTimeout(() => setCopiedCode(false), 2000);
  };

  const sortedPosts = [...space.posts].sort((a, b) => {
    if (a.isPinned && !b.isPinned) return -1;
    if (!a.isPinned && b.isPinned) return 1;
    return b.createdAt - a.createdAt;
  });

  const isOwner = space.ownerId === (currentUser?.uid ?? 'guest');

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Space header */}
      <div className="px-6 py-4 border-b border-white/8 shrink-0">
        <div className="flex items-center gap-3 mb-2">
          <button onClick={onBack} className="text-white/30 hover:text-white transition-colors"><ArrowLeft size={16} /></button>
          <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${space.color}20` }}>
            <FlaskConical size={14} style={{ color: space.color }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-black text-white text-sm truncate">{space.name}</p>
            <p className="text-[8px] text-white/25 uppercase tracking-widest">{space.members.length} member{space.members.length !== 1 ? 's' : ''} · {space.isPublic ? <><Globe size={8} className="inline" /> Public</> : <><Lock size={8} className="inline" /> Private</>}</p>
          </div>
        </div>
        {space.description && <p className="text-xs text-white/40 leading-relaxed pl-11">{space.description}</p>}

        {/* Invite code */}
        <div className="flex items-center gap-3 mt-3 pl-11">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-white/[0.04] border border-white/8 rounded-xl">
            <span className="text-[8px] text-white/30 uppercase tracking-widest">Invite Code</span>
            <span className="text-xs font-black text-white font-mono">{space.inviteCode}</span>
            <button onClick={copyCode} className="text-white/30 hover:text-white transition-colors">
              {copiedCode ? <Check size={10} className="text-green-400" /> : <Copy size={10} />}
            </button>
          </div>
          <div className="flex -space-x-2">
            {space.members.slice(0, 5).map((m, i) => (
              <div key={m.uid} className="w-6 h-6 rounded-full border-2 border-[#080808] flex items-center justify-center text-[7px] font-black text-white"
                style={{ background: SPACE_COLORS[i % SPACE_COLORS.length] + '60', zIndex: 5 - i }}>
                {m.name.charAt(0).toUpperCase()}
              </div>
            ))}
            {space.members.length > 5 && <div className="w-6 h-6 rounded-full bg-white/10 border-2 border-[#080808] flex items-center justify-center text-[7px] font-black text-white/50">+{space.members.length - 5}</div>}
          </div>
        </div>
      </div>

      {/* Post composer */}
      <div className="px-6 py-3 border-b border-white/6 shrink-0">
        <div className="flex gap-3">
          <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-black text-white shrink-0 mt-0.5"
            style={{ background: `${space.color}40` }}>
            {(currentUser?.displayName ?? 'A').charAt(0).toUpperCase()}
          </div>
          <div className="flex-1">
            <textarea value={postText} onChange={e => setPostText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && e.metaKey) addPost(); }}
              placeholder="Share a finding, note, or update with your team… (⌘Enter to post)"
              rows={2}
              className="w-full px-3 py-2 bg-white/[0.04] border border-white/8 rounded-xl text-sm text-white placeholder:text-white/15 focus:outline-none focus:border-white/20 resize-none" />
            <div className="flex justify-end mt-2">
              <button onClick={addPost} disabled={!postText.trim()}
                className="flex items-center gap-1.5 px-4 py-1.5 bg-gradient-to-r from-[#6B0099] to-[#D40055] text-white rounded-xl text-xs font-black uppercase disabled:opacity-40">
                <Send size={11} /> Post
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Posts feed */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
        {sortedPosts.length === 0 && (
          <div className="py-16 text-center">
            <MessageSquare size={28} className="text-white/10 mx-auto mb-2" />
            <p className="text-sm text-white/25">No posts yet — be the first to share something</p>
          </div>
        )}
        {sortedPosts.map(post => (
          <motion.div key={post.id} layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
            className={`p-4 rounded-2xl border ${post.isPinned ? 'bg-[#fbbf24]/5 border-[#fbbf24]/20' : 'bg-white/[0.03] border-white/8'}`}>
            <div className="flex items-center justify-between gap-3 mb-2">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-black" style={{ background: `${space.color}35`, color: space.color }}>
                  {post.authorName.charAt(0).toUpperCase()}
                </div>
                <span className="text-[9px] font-black text-white/50">{post.authorName}</span>
                <span className="text-[8px] text-white/20 font-mono">{fmtDate(post.createdAt)}</span>
                {post.isPinned && <span className="text-[7px] font-black text-[#fbbf24] uppercase tracking-widest">📌 Pinned</span>}
              </div>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100">
                <button onClick={() => togglePin(post.id)} className="p-1 text-white/20 hover:text-[#fbbf24] transition-colors"><Pin size={11} /></button>
                {(isOwner || post.authorId === currentUser?.uid) && (
                  <button onClick={() => deletePost(post.id)} className="p-1 text-white/15 hover:text-red-400 transition-colors"><Trash2 size={11} /></button>
                )}
              </div>
            </div>
            <p className="text-sm text-white/80 leading-relaxed whitespace-pre-wrap">{post.content}</p>
          </motion.div>
        ))}
      </div>
    </div>
  );
};

// ── Main Component ────────────────────────────────────────────────────────────

interface Props { currentUser: any; onBack: () => void; }

const LabsTeamSpaces: React.FC<Props> = ({ currentUser, onBack }) => {
  const [spaces, setSpaces] = useState<TeamSpace[]>([]);
  const [activeSpace, setActiveSpace] = useState<TeamSpace | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [joinError, setJoinError] = useState('');
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newDiscipline, setNewDiscipline] = useState('');
  const [newPublic, setNewPublic] = useState(false);
  const [selectedColor, setSelectedColor] = useState(SPACE_COLORS[0]);

  const sKey = `labsTeamSpaces_${currentUser?.uid ?? 'guest'}`;
  useEffect(() => { try { const s = localStorage.getItem(sKey); if (s) setSpaces(JSON.parse(s)); } catch {} }, [sKey]);
  const save = (updated: TeamSpace[]) => { setSpaces(updated); localStorage.setItem(sKey, JSON.stringify(updated)); };

  const createSpace = () => {
    if (!newName.trim()) return;
    const space: TeamSpace = {
      id: uid_short(), name: newName.trim(), description: newDesc.trim() || undefined,
      discipline: newDiscipline.trim() || undefined, isPublic: newPublic,
      ownerId: currentUser?.uid ?? 'guest', ownerName: currentUser?.displayName ?? 'Anonymous',
      members: [{ uid: currentUser?.uid ?? 'guest', name: currentUser?.displayName ?? 'Anonymous', role: 'OWNER' }],
      posts: [], inviteCode: generateInviteCode(), color: selectedColor, createdAt: Date.now(),
    };
    const updated = [space, ...spaces]; save(updated);
    setShowCreate(false); setNewName(''); setNewDesc(''); setNewDiscipline(''); setActiveSpace(space);
  };

  const joinSpace = () => {
    const target = spaces.find(s => s.inviteCode === joinCode.toUpperCase().trim());
    if (!target) { setJoinError('No space found with this code. Double-check and try again.'); return; }
    const alreadyMember = target.members.some(m => m.uid === (currentUser?.uid ?? 'guest'));
    if (alreadyMember) { setActiveSpace(target); setJoinCode(''); return; }
    const updated = spaces.map(s => s.id === target.id
      ? { ...s, members: [...s.members, { uid: currentUser?.uid ?? 'guest', name: currentUser?.displayName ?? 'Anonymous', role: 'MEMBER' as const }] }
      : s);
    save(updated); setActiveSpace(updated.find(s => s.id === target.id)!); setJoinCode(''); setJoinError('');
  };

  const updateSpace = (updated: TeamSpace) => {
    const next = spaces.map(s => s.id === updated.id ? updated : s);
    save(next); setActiveSpace(updated);
  };

  if (activeSpace) {
    return (
      <div className="h-screen flex flex-col">
        <SpaceBoard space={activeSpace} currentUser={currentUser} onUpdate={updateSpace} onBack={() => setActiveSpace(null)} />
      </div>
    );
  }

  return (
    <div className="min-h-screen text-white">
      <div className="flex items-center gap-3 px-6 py-4 border-b border-white/8">
        <button onClick={onBack} className="text-white/30 hover:text-white transition-colors"><ArrowLeft size={16} /></button>
        <div className="flex-1">
          <div className="flex items-center gap-2"><Users size={15} className="text-[#06D6A0]" /><h1 className="font-black text-white text-sm">Lab Team Spaces</h1></div>
          <p className="text-[8px] text-white/25 uppercase tracking-widest mt-0.5">{spaces.length} spaces · Museion</p>
        </div>
        <button onClick={() => setShowCreate(v => !v)} className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#6B0099] to-[#D40055] text-white rounded-xl text-xs font-black uppercase">
          <Plus size={12} /> New Space
        </button>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-6 space-y-6">
        {/* Create form */}
        <AnimatePresence>
          {showCreate && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
              <div className="p-5 bg-white/[0.04] border border-white/10 rounded-2xl space-y-4">
                <p className="text-[9px] font-black uppercase tracking-widest text-white/30">Create a New Team Space</p>
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <label className="block text-[8px] font-black uppercase tracking-widest text-white/25 mb-1">Space Name *</label>
                    <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. Quantum Optics Lab, Climate Team 2025"
                      className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-white focus:outline-none" />
                  </div>
                  <div>
                    <label className="block text-[8px] font-black uppercase tracking-widest text-white/25 mb-1">Discipline</label>
                    <input value={newDiscipline} onChange={e => setNewDiscipline(e.target.value)} placeholder="Physics, Biology…"
                      className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-white focus:outline-none" />
                  </div>
                  <div>
                    <label className="block text-[8px] font-black uppercase tracking-widest text-white/25 mb-1">Visibility</label>
                    <div className="flex gap-2">
                      <button onClick={() => setNewPublic(false)} className={`flex-1 py-2 rounded-xl text-xs font-black uppercase flex items-center justify-center gap-1 transition-all ${!newPublic ? 'bg-white text-black' : 'bg-white/5 text-white/30 hover:text-white'}`}>
                        <Lock size={10} /> Private
                      </button>
                      <button onClick={() => setNewPublic(true)} className={`flex-1 py-2 rounded-xl text-xs font-black uppercase flex items-center justify-center gap-1 transition-all ${newPublic ? 'bg-white text-black' : 'bg-white/5 text-white/30 hover:text-white'}`}>
                        <Globe size={10} /> Public
                      </button>
                    </div>
                  </div>
                  <div className="col-span-2">
                    <label className="block text-[8px] font-black uppercase tracking-widest text-white/25 mb-1">Description</label>
                    <input value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="What is this space for?"
                      className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-white focus:outline-none" />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-[8px] font-black uppercase tracking-widest text-white/25 mb-2">Space Color</label>
                    <div className="flex gap-2 flex-wrap">
                      {SPACE_COLORS.map(c => (
                        <button key={c} onClick={() => setSelectedColor(c)}
                          className={`w-7 h-7 rounded-xl border-2 transition-all ${selectedColor === c ? 'border-white scale-110' : 'border-transparent'}`}
                          style={{ background: c + '50' }} />
                      ))}
                    </div>
                  </div>
                </div>
                <div className="flex gap-3">
                  <button onClick={createSpace} disabled={!newName.trim()} className="flex-1 py-2.5 bg-gradient-to-r from-[#6B0099] to-[#D40055] text-white rounded-xl text-xs font-black uppercase disabled:opacity-40">Create Space</button>
                  <button onClick={() => setShowCreate(false)} className="px-4 py-2.5 bg-white/5 border border-white/10 text-white/50 rounded-xl text-xs font-black uppercase hover:text-white transition-all">Cancel</button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Join by code */}
        <div className="flex gap-3 items-start">
          <div className="flex-1">
            <input value={joinCode} onChange={e => { setJoinCode(e.target.value); setJoinError(''); }}
              onKeyDown={e => e.key === 'Enter' && joinSpace()}
              placeholder="Enter invite code to join a space…"
              className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white font-mono uppercase placeholder:text-white/20 placeholder:normal-case focus:outline-none" />
            {joinError && <p className="text-[9px] text-red-400 mt-1">{joinError}</p>}
          </div>
          <button onClick={joinSpace} disabled={!joinCode.trim()} className="px-4 py-2.5 bg-white/8 border border-white/12 text-white/60 rounded-xl text-xs font-black uppercase hover:text-white transition-all disabled:opacity-40">Join</button>
        </div>

        {/* Spaces grid */}
        {spaces.length === 0 ? (
          <div className="py-20 text-center">
            <Users size={32} className="text-white/10 mx-auto mb-3" />
            <p className="text-sm text-white/30">No team spaces yet</p>
            <p className="text-[10px] text-white/15 mt-1">Create a space to collaborate with your research team</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {spaces.map(s => (
              <button key={s.id} onClick={() => setActiveSpace(s)}
                className="text-left p-5 bg-white/[0.04] border border-white/8 rounded-2xl hover:border-white/18 hover:bg-white/[0.06] transition-all group">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${s.color}20` }}>
                    <FlaskConical size={18} style={{ color: s.color }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-black text-white text-sm truncate">{s.name}</p>
                      {s.isPublic ? <Globe size={10} className="text-white/20" /> : <Lock size={10} className="text-white/20" />}
                    </div>
                    {s.description && <p className="text-[9px] text-white/40 leading-relaxed line-clamp-2">{s.description}</p>}
                    <div className="flex items-center gap-3 mt-2">
                      <span className="text-[8px] text-white/25 flex items-center gap-1"><Users size={9} />{s.members.length}</span>
                      <span className="text-[8px] text-white/25 flex items-center gap-1"><MessageSquare size={9} />{s.posts.length}</span>
                      {s.discipline && <span className="text-[8px] text-white/25">{s.discipline}</span>}
                    </div>
                  </div>
                  <ChevronRight size={14} className="text-white/20 group-hover:text-white/50 group-hover:translate-x-0.5 transition-all shrink-0 mt-0.5" />
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default LabsTeamSpaces;
