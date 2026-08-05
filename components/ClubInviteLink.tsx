import React, { useState } from 'react';
import { Link2, Copy, Check, RefreshCw, Loader2, Lock, Globe } from 'lucide-react';
import { generateClubInviteToken } from '../services/backendService';
import type { Club } from '../types';

interface Props { club: Club; isAdmin: boolean; }

export default function ClubInviteLink({ club, isAdmin }: Props) {
  const [token, setToken]       = useState<string>(club.inviteToken ?? '');
  const [copied, setCopied]     = useState(false);
  const [generating, setGenerating] = useState(false);

  const inviteUrl = token ? `${window.location.origin}/clubs/${club.id}?invite=${token}` : '';

  const handleGenerate = async () => {
    if (!isAdmin || generating) return;
    setGenerating(true);
    const t = await generateClubInviteToken(club.id);
    setToken(t);
    setGenerating(false);
  };

  const handleCopy = () => {
    if (!inviteUrl) return;
    navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-5 space-y-3">
      <div className="flex items-center gap-2">
        <Link2 size={14} className="text-white/40" />
        <p className="text-[9px] font-black uppercase tracking-widest text-white/40">Invite Link</p>
        {club.isPrivate
          ? <Lock size={10} className="text-white/20" />
          : <Globe size={10} className="text-white/20" />}
      </div>

      {inviteUrl ? (
        <div className="flex items-center gap-2">
          <div className="flex-1 bg-black/30 border border-white/8 rounded-xl px-4 py-2.5 font-mono text-[10px] text-white/40 truncate">
            {inviteUrl}
          </div>
          <button onClick={handleCopy}
            className="flex items-center gap-1 px-4 py-2.5 rounded-xl text-[8px] font-black uppercase tracking-widest transition-all hover:scale-105 flex-shrink-0"
            style={{ background: copied ? 'rgba(34,197,94,0.12)' : 'rgba(255,255,255,0.08)', color: copied ? '#22c55e' : 'rgba(255,255,255,0.5)' }}>
            {copied ? <Check size={10} /> : <Copy size={10} />}
            {copied ? 'Copied!' : 'Copy'}
          </button>
          {isAdmin && (
            <button onClick={handleGenerate} disabled={generating}
              className="p-2.5 rounded-xl bg-white/5 text-white/30 hover:text-white transition-all disabled:opacity-40"
              title="Generate new link (invalidates old one)">
              {generating ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
            </button>
          )}
        </div>
      ) : (
        <div>
          <p className="text-[9px] text-white/25 mb-3">No invite link generated yet. Generate one to share with potential members.</p>
          {isAdmin && (
            <button onClick={handleGenerate} disabled={generating}
              className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest bg-white/8 text-white/50 hover:text-white transition-all disabled:opacity-40">
              {generating ? <Loader2 size={11} className="animate-spin" /> : <Link2 size={11} />}
              {generating ? 'Generating…' : 'Generate Invite Link'}
            </button>
          )}
        </div>
      )}
      <p className="text-[8px] text-white/15">Anyone with this link can join the club. Generate a new link to invalidate the old one.</p>
    </div>
  );
}
