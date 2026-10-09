// "Share to Bluesky" panel for the Plajah composer.
//
// A Plajah post can do more than a Bluesky post (polls, embedded music/video, locked content, long threads), so
// before it goes out the author gets to SEE and JUDGE the Bluesky version: this renders exactly what
// planBlueskyVersion() will hand the server at publish time — same function, so there is no drift between the
// preview and what is actually posted — plus plain-language notes about everything that changes, and an editable
// text override for people who want to word it differently for that audience.

import React, { useMemo, useState } from 'react';
import { AlertTriangle, Info, RotateCcw, Pencil, Link2, EyeOff } from 'lucide-react';
import type { FediverseAccount } from '../../../services/fediverse/types';
import { planBlueskyVersion, BSKY_LIMIT, type NativePostLike } from '../../../services/fediverse/blueskyVersion';

// Same shape/length as a real share link, so the character count in the preview is the real count.
const PLACEHOLDER_URL = 'https://plajah.com/share?type=feed&id=xxxxxxxxxxxxxxxxxxxx';
const BLUE = '#1185fe';

export interface BlueskyShareProps {
  post: NativePostLike;
  accounts: FediverseAccount[];          // the user's active fediverse accounts
  selectedIds: string[];
  onSelectIds: (ids: string[]) => void;
  override: string | undefined;
  onOverride: (v: string | undefined) => void;
  displayName?: string;
}

const BlueskyShare: React.FC<BlueskyShareProps> = ({ post, accounts, selectedIds, onSelectIds, override, onOverride, displayName }) => {
  const [editing, setEditing] = useState(false);
  const plan = useMemo(() => planBlueskyVersion(post, { postUrl: PLACEHOLDER_URL, override }), [post, override]);
  const bsky = accounts.find(a => a.protocol === 'bluesky' && selectedIds.includes(a.id)) ?? accounts.find(a => a.protocol === 'bluesky');
  const others = accounts.filter(a => a.protocol !== 'bluesky' && selectedIds.includes(a.id));
  const over = plan.graphemes > BSKY_LIMIT;

  const toggle = (id: string) => onSelectIds(selectedIds.includes(id) ? selectedIds.filter(x => x !== id) : [...selectedIds, id]);

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 space-y-3 ml-0 sm:ml-12">
      {/* Where it goes */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-[9px] font-black uppercase tracking-widest text-white/35 mr-1">Also posting to</span>
        {accounts.map(a => {
          const on = selectedIds.includes(a.id);
          return (
            <button key={a.id} type="button" onClick={() => toggle(a.id)}
              className={`px-2.5 py-1 rounded-full text-[10px] font-bold border transition-all ${on ? 'border-[#1185fe]/50 bg-[#1185fe]/15 text-[#7ab8ff]' : 'border-white/10 text-white/35 hover:text-white/60'}`}>
              {a.protocol === 'bluesky' ? '🦋 ' : ''}{a.handle}
            </button>
          );
        })}
      </div>

      {plan.blocked ? (
        <div className="flex items-start gap-2 rounded-xl bg-white/[0.04] px-3 py-2.5 text-[12px] text-white/55">
          <EyeOff size={14} className="mt-0.5 shrink-0 text-white/40" />
          <span><strong className="text-white/75">Won't be shared.</strong> {plan.blocked}</span>
        </div>
      ) : (
        <>
          {/* What Bluesky sees */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[9px] font-black uppercase tracking-widest text-white/35">What Bluesky sees</span>
              <span className={`text-[10px] font-black tabular-nums ${over ? 'text-red-400' : plan.truncated ? 'text-amber-300' : 'text-white/30'}`}>{plan.graphemes}/{BSKY_LIMIT}</span>
            </div>
            <div className="rounded-xl bg-[#0a0f1a] border border-[#1185fe]/20 p-3">
              <div className="flex items-center gap-2 mb-2">
                {bsky?.avatarUrl
                  ? <img src={bsky.avatarUrl} alt="" className="w-8 h-8 rounded-full object-cover" />
                  : <div className="w-8 h-8 rounded-full bg-[#1185fe]/20 flex items-center justify-center text-sm">🦋</div>}
                <div className="min-w-0">
                  <p className="text-[12px] font-bold text-white/90 truncate leading-tight">{bsky?.displayName || displayName || 'You'}</p>
                  <p className="text-[10px] text-white/35 truncate leading-tight">{bsky?.handle ?? '@you.bsky.social'} · now</p>
                </div>
              </div>

              <p className="text-[13px] leading-relaxed text-white/85 whitespace-pre-wrap break-words">
                {plan.tokens.map((t, i) => t.kind === 'text'
                  ? <React.Fragment key={i}>{t.text}</React.Fragment>
                  : <span key={i} style={{ color: BLUE }} className={t.kind === 'link' ? 'underline decoration-[#1185fe]/40' : ''}>{t.text}</span>)}
              </p>

              {plan.images.length > 0 && (
                <div className={`mt-2 grid gap-1 rounded-lg overflow-hidden ${plan.images.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
                  {plan.images.map((im, i) => (
                    <div key={i} className="relative bg-black/40" style={{ aspectRatio: plan.images.length === 1 ? '16/10' : '1' }}>
                      <img src={im.url} alt={im.alt} className="w-full h-full object-cover" />
                      {im.alt && <span className="absolute bottom-1 left-1 px-1 rounded bg-black/70 text-[8px] font-black text-white/80">ALT</span>}
                    </div>
                  ))}
                </div>
              )}

              {plan.card && (
                <div className="mt-2 rounded-lg border border-white/10 overflow-hidden flex">
                  {plan.card.thumbUrl && <img src={plan.card.thumbUrl} alt="" className="w-20 h-20 object-cover shrink-0" />}
                  <div className="p-2 min-w-0">
                    <p className="text-[11px] font-bold text-white/85 line-clamp-2">{plan.card.title}</p>
                    {plan.card.description && <p className="text-[10px] text-white/45 line-clamp-2 mt-0.5">{plan.card.description}</p>}
                    <p className="flex items-center gap-1 text-[9px] text-white/30 mt-1 truncate"><Link2 size={9} />{(() => { try { return new URL(plan.card.uri).hostname; } catch { return plan.card.uri; } })()}</p>
                  </div>
                </div>
              )}

              {plan.labels.length > 0 && (
                <p className="mt-2 text-[9px] font-black uppercase tracking-widest text-amber-300/80">Media is blurred behind a content warning</p>
              )}
            </div>
          </div>

          {/* What changes */}
          {plan.notes.length > 0 && (
            <ul className="space-y-1.5">
              {plan.notes.map((n, i) => (
                <li key={i} className={`flex items-start gap-2 text-[11px] leading-relaxed ${n.level === 'warn' ? 'text-amber-300/90' : 'text-white/50'}`}>
                  {n.level === 'warn' ? <AlertTriangle size={12} className="mt-0.5 shrink-0" /> : <Info size={12} className="mt-0.5 shrink-0 text-white/35" />}
                  <span>{n.text}</span>
                </li>
              ))}
            </ul>
          )}
          {others.length > 0 && (
            <p className="text-[10px] text-white/35">{others.map(o => o.handle).join(', ')} get your text and a link back to Plajah (up to 500 characters).</p>
          )}

          {/* Edit */}
          {editing ? (
            <div className="space-y-1.5">
              <textarea
                value={override ?? post.text}
                onChange={e => onOverride(e.target.value)}
                rows={3}
                placeholder="Word it for Bluesky…"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-[12px] text-white placeholder-white/25 focus:outline-none focus:border-[#1185fe]/50 resize-none"
              />
              <div className="flex items-center gap-3">
                <button type="button" onClick={() => setEditing(false)} className="text-[10px] font-bold text-white/50 hover:text-white">Done</button>
                {override !== undefined && (
                  <button type="button" onClick={() => { onOverride(undefined); setEditing(false); }} className="flex items-center gap-1 text-[10px] font-bold text-white/40 hover:text-white">
                    <RotateCcw size={10} /> Use my post's text
                  </button>
                )}
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => setEditing(true)} className="flex items-center gap-1.5 text-[10px] font-bold text-[#7ab8ff] hover:text-white">
              <Pencil size={11} /> {override !== undefined ? 'Edit the Bluesky version (customised)' : 'Edit the Bluesky version'}
            </button>
          )}
        </>
      )}
    </div>
  );
};

export default BlueskyShare;
