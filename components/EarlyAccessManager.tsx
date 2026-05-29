import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Lock, Plus, Copy, Trash2, Check, RefreshCw,
  Mail, User, Tag, ExternalLink, Eye, EyeOff, X,
} from 'lucide-react';
import type { Album, EarlyAccessEntry, ReviewCode } from '../types';
import {
  generateReviewCode, revokeReviewCode,
  addEarlyAccessUser, removeEarlyAccessUser, updateAlbum,
} from '../services/backendService';
import { searchUsers } from '../services/backendService';
import type { UserProfile } from '../types';

interface Props {
  album: Album;
  onAlbumUpdate: (updated: Partial<Album>) => void;
}

export default function EarlyAccessManager({ album, onAlbumUpdate }: Props) {
  const codes: ReviewCode[] = album.reviewCodes ?? [];
  const list: EarlyAccessEntry[] = album.earlyAccessList ?? [];
  const enabled = album.earlyAccessEnabled ?? false;

  const [newLabel, setNewLabel] = useState('');
  const [newMaxUses, setNewMaxUses] = useState(1);
  const [generating, setGenerating] = useState(false);

  const [emailInput, setEmailInput] = useState('');
  const [userQuery, setUserQuery] = useState('');
  const [userResults, setUserResults] = useState<UserProfile[]>([]);
  const [searching, setSearching] = useState(false);
  const [labelInput, setLabelInput] = useState('Press');

  const [copied, setCopied] = useState<string | null>(null);
  const [tab, setTab] = useState<'codes' | 'list'>('codes');

  // --- User search ---
  useEffect(() => {
    if (!userQuery.trim()) { setUserResults([]); return; }
    const id = setTimeout(async () => {
      setSearching(true);
      const results = await searchUsers(userQuery);
      setUserResults(results.slice(0, 6));
      setSearching(false);
    }, 400);
    return () => clearTimeout(id);
  }, [userQuery]);

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  const shareUrl = `${window.location.origin}/release/${album.id}`;

  // ── Toggle early access ──────────────────────────────────────────────────────
  const toggleEnabled = async () => {
    const next = !enabled;
    onAlbumUpdate({ earlyAccessEnabled: next });
    await updateAlbum(album.id, { earlyAccessEnabled: next });
  };

  // ── Generate code ────────────────────────────────────────────────────────────
  const handleGenerate = async () => {
    if (generating) return;
    setGenerating(true);
    const code = await generateReviewCode(album.id, newLabel || 'Review Code', newMaxUses);
    if (code) {
      onAlbumUpdate({ reviewCodes: [...codes, code], earlyAccessEnabled: true });
      setNewLabel('');
    }
    setGenerating(false);
  };

  // ── Revoke code ──────────────────────────────────────────────────────────────
  const handleRevoke = async (codeId: string) => {
    await revokeReviewCode(album.id, codeId);
    onAlbumUpdate({ reviewCodes: codes.map(c => c.id === codeId ? { ...c, isRevoked: true } : c) });
  };

  // ── Add by email ─────────────────────────────────────────────────────────────
  const handleAddEmail = async () => {
    if (!emailInput.trim()) return;
    const entry: EarlyAccessEntry = { email: emailInput.trim(), label: labelInput, addedAt: Date.now() };
    await addEarlyAccessUser(album.id, { email: emailInput.trim(), label: labelInput });
    onAlbumUpdate({ earlyAccessList: [...list, entry], earlyAccessEnabled: true });
    setEmailInput('');
  };

  // ── Add by user ──────────────────────────────────────────────────────────────
  const handleAddUser = async (u: UserProfile) => {
    const entry: EarlyAccessEntry = { uid: u.uid, email: u.email, displayName: u.displayName, label: labelInput, addedAt: Date.now() };
    await addEarlyAccessUser(album.id, { uid: u.uid, email: u.email, displayName: u.displayName, label: labelInput });
    onAlbumUpdate({ earlyAccessList: [...list, entry], earlyAccessEnabled: true });
    setUserQuery('');
    setUserResults([]);
  };

  // ── Remove user ──────────────────────────────────────────────────────────────
  const handleRemove = async (entry: EarlyAccessEntry) => {
    await removeEarlyAccessUser(album.id, entry.email, entry.uid);
    onAlbumUpdate({ earlyAccessList: list.filter(e => !(e.email === entry.email && e.uid === entry.uid)) });
  };

  const activeCodes = codes.filter(c => !c.isRevoked);
  const revokedCodes = codes.filter(c => c.isRevoked);

  return (
    <div className="space-y-5">
      {/* Master toggle */}
      <div className="flex items-center justify-between p-5 rounded-[2rem]"
        style={{ background: enabled ? 'rgba(255,140,0,0.08)' : 'rgba(255,255,255,0.03)', border: enabled ? '1px solid rgba(255,140,0,0.3)' : '1px solid rgba(255,255,255,0.08)' }}>
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-2xl flex items-center justify-center border"
            style={{ background: enabled ? 'rgba(255,140,0,0.15)' : 'rgba(255,255,255,0.05)', borderColor: enabled ? 'rgba(255,140,0,0.4)' : 'rgba(255,255,255,0.1)' }}>
            <Lock size={16} className={enabled ? 'text-small-orange' : 'text-white/20'} />
          </div>
          <div>
            <p className="text-xs font-black uppercase tracking-widest">Early Access</p>
            <p className="text-[9px] font-bold uppercase tracking-widest mt-0.5" style={{ color: enabled ? 'rgba(255,140,0,0.7)' : 'rgba(255,255,255,0.3)' }}>
              {enabled ? `${list.length} users · ${activeCodes.length} active codes` : 'Off — album is public on release'}
            </p>
          </div>
        </div>
        <button type="button" onClick={toggleEnabled}
          className="w-12 h-7 rounded-full transition-all relative shrink-0"
          style={{ background: enabled ? '#ff8c00' : 'rgba(255,255,255,0.1)' }}>
          <div className={`absolute top-0.5 w-6 h-6 bg-white rounded-full transition-all ${enabled ? 'left-5' : 'left-0.5'}`} />
        </button>
      </div>

      {/* Landing page link */}
      {album.isScheduled && album.releaseDate && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-2xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
          <div className="flex-1 min-w-0">
            <p className="text-[8px] font-black uppercase tracking-widest text-white/30 mb-0.5">Release Landing Page</p>
            <p className="text-[9px] text-white/50 truncate">{shareUrl}</p>
          </div>
          <button onClick={() => copyToClipboard(shareUrl, 'url')}
            className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[8px] font-black uppercase tracking-widest transition-all"
            style={{ background: copied === 'url' ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.05)', color: copied === 'url' ? '#22c55e' : 'rgba(255,255,255,0.4)', border: '1px solid rgba(255,255,255,0.1)' }}>
            {copied === 'url' ? <Check size={10} /> : <Copy size={10} />}
            {copied === 'url' ? 'Copied' : 'Copy'}
          </button>
          <a href={shareUrl} target="_blank" rel="noopener noreferrer"
            className="shrink-0 p-1.5 rounded-xl text-white/30 hover:text-white transition-all">
            <ExternalLink size={13} />
          </a>
        </div>
      )}

      {enabled && (
        <div className="space-y-4">
          {/* Tab bar */}
          <div className="flex gap-1 p-1 rounded-2xl" style={{ background: 'rgba(255,255,255,0.04)' }}>
            {(['codes', 'list'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)}
                className="flex-1 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all"
                style={tab === t ? { background: '#ff8c00', color: '#000' } : { color: 'rgba(255,255,255,0.4)' }}>
                {t === 'codes' ? `Review Codes (${activeCodes.length})` : `Access List (${list.length})`}
              </button>
            ))}
          </div>

          <AnimatePresence mode="wait">

            {/* ── REVIEW CODES TAB ── */}
            {tab === 'codes' && (
              <motion.div key="codes" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">
                {/* Generate form */}
                <div className="p-4 rounded-2xl space-y-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                  <p className="text-[8px] font-black uppercase tracking-widest text-white/30">Generate New Code</p>
                  <div className="flex gap-2">
                    <input value={newLabel} onChange={e => setNewLabel(e.target.value)} placeholder="Label (e.g. Press Copy #1)"
                      className="flex-1 bg-white/[0.04] border border-white/10 rounded-xl px-3 py-2 text-xs font-bold text-white placeholder:text-white/20 outline-none focus:border-small-orange/50 transition-all" />
                    <select value={newMaxUses} onChange={e => setNewMaxUses(Number(e.target.value))}
                      className="bg-white/[0.04] border border-white/10 rounded-xl px-3 py-2 text-xs font-bold text-white outline-none">
                      <option value={1}>1 use</option>
                      <option value={5}>5 uses</option>
                      <option value={10}>10 uses</option>
                      <option value={0}>Unlimited</option>
                    </select>
                    <button onClick={handleGenerate} disabled={generating}
                      className="shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all hover:scale-105 disabled:opacity-40"
                      style={{ background: '#ff8c00', color: '#000' }}>
                      {generating ? <RefreshCw size={11} className="animate-spin" /> : <Plus size={11} />}
                      Generate
                    </button>
                  </div>
                </div>

                {/* Active codes */}
                {activeCodes.length === 0 && (
                  <p className="text-[9px] text-white/20 text-center py-6 uppercase tracking-widest">No codes yet — generate one above</p>
                )}
                <div className="space-y-2">
                  {activeCodes.map(c => (
                    <div key={c.id} className="flex items-center gap-3 p-3 rounded-2xl"
                      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-sm font-black tracking-[0.2em] text-white">{c.code}</span>
                          <span className="text-[7px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-full"
                            style={{ background: 'rgba(255,140,0,0.12)', color: 'rgba(255,140,0,0.8)' }}>
                            {c.maxUses === 0 ? '∞' : `${c.useCount}/${c.maxUses}`} uses
                          </span>
                        </div>
                        <p className="text-[8px] text-white/30 uppercase tracking-widest">{c.label}</p>
                      </div>
                      <button onClick={() => copyToClipboard(c.code, c.id)}
                        className="shrink-0 p-1.5 rounded-xl transition-all"
                        style={{ color: copied === c.id ? '#22c55e' : 'rgba(255,255,255,0.3)' }}>
                        {copied === c.id ? <Check size={13} /> : <Copy size={13} />}
                      </button>
                      <button onClick={() => handleRevoke(c.id)}
                        className="shrink-0 p-1.5 rounded-xl text-white/20 hover:text-red-400 transition-all">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>

                {revokedCodes.length > 0 && (
                  <p className="text-[8px] text-white/15 uppercase tracking-widest">{revokedCodes.length} revoked code{revokedCodes.length !== 1 ? 's' : ''} hidden</p>
                )}
              </motion.div>
            )}

            {/* ── ACCESS LIST TAB ── */}
            {tab === 'list' && (
              <motion.div key="list" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">
                {/* Label input */}
                <div className="flex items-center gap-2">
                  <Tag size={12} className="text-white/20 shrink-0" />
                  <select value={labelInput} onChange={e => setLabelInput(e.target.value)}
                    className="bg-white/[0.04] border border-white/10 rounded-xl px-3 py-1.5 text-[9px] font-black uppercase tracking-widest text-white outline-none">
                    {['Press', 'Reviewer', 'Label A&R', 'Playlist Curator', 'Fan Club', 'VIP', 'Friend', 'Other'].map(l => (
                      <option key={l} value={l}>{l}</option>
                    ))}
                  </select>
                </div>

                {/* Add by email */}
                <div className="flex gap-2">
                  <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                    <Mail size={12} className="text-white/20 shrink-0" />
                    <input value={emailInput} onChange={e => setEmailInput(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleAddEmail()}
                      placeholder="Email address…"
                      className="flex-1 bg-transparent outline-none text-xs font-bold text-white placeholder:text-white/20" />
                  </div>
                  <button onClick={handleAddEmail} disabled={!emailInput.trim()}
                    className="shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all disabled:opacity-30"
                    style={{ background: 'rgba(255,140,0,0.12)', color: 'rgba(255,140,0,0.8)', border: '1px solid rgba(255,140,0,0.25)' }}>
                    <Plus size={11} /> Add
                  </button>
                </div>

                {/* Add by Plajah user */}
                <div className="relative">
                  <div className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                    <User size={12} className="text-white/20 shrink-0" />
                    <input value={userQuery} onChange={e => setUserQuery(e.target.value)}
                      placeholder="Search Plajah user…"
                      className="flex-1 bg-transparent outline-none text-xs font-bold text-white placeholder:text-white/20" />
                    {searching && <RefreshCw size={11} className="animate-spin text-white/20 shrink-0" />}
                  </div>
                  {userResults.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-1 rounded-2xl overflow-hidden z-50"
                      style={{ background: '#0d0d14', border: '1px solid rgba(255,255,255,0.1)' }}>
                      {userResults.map(u => (
                        <button key={u.uid} onClick={() => handleAddUser(u)}
                          className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-white/[0.06] transition-all text-left">
                          <img src={u.photoURL} className="w-7 h-7 rounded-full object-cover shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-[10px] font-black uppercase tracking-widest truncate">{u.displayName}</p>
                            <p className="text-[8px] text-white/30">{u.email}</p>
                          </div>
                          <Plus size={11} className="text-white/30 shrink-0" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* List */}
                {list.length === 0 && (
                  <p className="text-[9px] text-white/20 text-center py-6 uppercase tracking-widest">No one on the list yet</p>
                )}
                <div className="space-y-1.5">
                  {list.map((entry, idx) => (
                    <div key={idx} className="flex items-center gap-3 p-3 rounded-2xl"
                      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                      <div className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center shrink-0 text-[9px] font-black text-white/30">
                        {entry.displayName?.[0] ?? entry.email?.[0] ?? '?'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-black uppercase tracking-widest truncate">
                          {entry.displayName ?? entry.email ?? entry.uid}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          {entry.label && (
                            <span className="text-[7px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-full"
                              style={{ background: 'rgba(255,140,0,0.1)', color: 'rgba(255,140,0,0.6)' }}>
                              {entry.label}
                            </span>
                          )}
                          {entry.codeUsed && (
                            <span className="text-[7px] text-white/25">via code {entry.codeUsed}</span>
                          )}
                        </div>
                      </div>
                      <button onClick={() => handleRemove(entry)}
                        className="shrink-0 p-1.5 rounded-xl text-white/20 hover:text-red-400 transition-all">
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Redeem code widget (for preview/testing) */}
          <div className="pt-3 border-t border-white/[0.05]">
            <p className="text-[7px] text-white/15 uppercase tracking-widest text-center">
              Share codes or the landing page link — listeners redeem the code on the release page to unlock early access.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
