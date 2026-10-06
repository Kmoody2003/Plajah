import React, { useEffect, useState } from 'react';
import { X, RotateCcw, Plus } from 'lucide-react';
import Portal from '../../Portal';
import {
  ALL_CONTENT_TYPES, CONTENT_TYPE_LABELS, type FeedContentType,
} from '../../../services/feedPreferencesCore';
import type { UseFeedPreferences } from '../../../services/feedPreferencesService';
import { FEED_CARD_KINDS, FEED_CARD_LABELS } from '../../../services/feedCardsCore';

/**
 * Feed controls bottom-sheet / dialog.
 *
 *   const fp = useFeedPreferences();
 *   <FeedControlsSheet open={open} onClose={() => setOpen(false)} fp={fp} />
 *
 * Lets the viewer: pick the default tab ('For You' algorithmic vs 'Following only'), choose which content
 * types and which inline card kinds appear, mute topics / hashtags, and reset everything (incl. the soft
 * "show less like this" weights). Every change is applied immediately (optimistic) and saved.
 */
const Toggle: React.FC<{ on: boolean; label: string; onChange: () => void }> = ({ on, label, onChange }) => (
  <button type="button" role="switch" aria-checked={on} onClick={onChange}
    className="flex w-full items-center justify-between rounded-2xl px-3 py-2.5 text-left text-sm font-semibold transition-colors"
    style={{ background: on ? 'var(--pj-glass-2)' : 'transparent' }}>
    <span className={on ? '' : 'opacity-50'}>{label}</span>
    <span className="relative h-5 w-9 rounded-full transition-colors" style={{ background: on ? 'var(--pj-orange)' : 'var(--pj-glass-4)' }}>
      <span className="absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all" style={{ left: on ? 18 : 2 }} />
    </span>
  </button>
);

const Section: React.FC<{ title: string; hint?: string; children: React.ReactNode }> = ({ title, hint, children }) => (
  <section className="space-y-2">
    <div>
      <h3 className="text-[11px] font-black uppercase tracking-[0.18em] opacity-60">{title}</h3>
      {hint && <p className="mt-0.5 text-xs opacity-45">{hint}</p>}
    </div>
    {children}
  </section>
);

const FeedControlsSheet: React.FC<{ open: boolean; onClose: () => void; fp: UseFeedPreferences }> = ({ open, onClose, fp }) => {
  const [topic, setTopic] = useState('');
  const { prefs } = fp;

  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [open, onClose]);

  if (!open) return null;
  const addTopic = () => { if (topic.trim()) { fp.muteTopic(topic); setTopic(''); } };

  return (
    <Portal>
      <div className="fixed inset-0 z-[300] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label="Feed controls">
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
        <div className="relative max-h-[88vh] w-full overflow-y-auto rounded-t-3xl border p-5 sm:max-w-lg sm:rounded-3xl"
          style={{ background: 'var(--pj-menu-bg)', borderColor: 'var(--pj-border-strong)', boxShadow: 'var(--pj-elev-4)' }}>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-black">Customize your feed</h2>
            <button type="button" onClick={onClose} aria-label="Close" className="rounded-full p-2 opacity-60 hover:opacity-100"><X size={18} /></button>
          </div>

          <div className="space-y-6">
            <Section title="Open the feed on" hint="'For You' mixes people you follow with posts we think you'll like. 'Following' is a plain, newest-first feed of your follows.">
              <div className="grid grid-cols-2 gap-1 rounded-full p-1" style={{ background: 'var(--pj-glass-2)' }}>
                {([['FOR_YOU', 'For You'], ['FOLLOWING', 'Following only']] as const).map(([v, label]) => (
                  <button key={v} type="button" onClick={() => fp.setDefaultTab(v)}
                    className="rounded-full px-3 py-2 text-xs font-black uppercase tracking-widest transition-colors"
                    style={prefs.defaultTab === v ? { background: 'var(--pj-grad-ember)', color: '#fff' } : { opacity: 0.6 }}
                    aria-pressed={prefs.defaultTab === v}>
                    {label}
                  </button>
                ))}
              </div>
            </Section>

            <Section title="Show these kinds of posts">
              <div className="space-y-0.5">
                {ALL_CONTENT_TYPES.map((t: FeedContentType) => (
                  <Toggle key={t} label={CONTENT_TYPE_LABELS[t]} on={!prefs.mutedContentTypes.includes(t)} onChange={() => fp.toggleContentType(t)} />
                ))}
              </div>
            </Section>

            <Section title="Show these cards in my feed" hint="Live streams, new releases, club highlights and more, woven between posts.">
              <div className="space-y-0.5">
                {FEED_CARD_KINDS.map(k => (
                  <Toggle key={k} label={FEED_CARD_LABELS[k]} on={!prefs.mutedCardKinds.includes(k)} onChange={() => fp.toggleCardKind(k)} />
                ))}
              </div>
            </Section>

            <Section title="Muted topics" hint="Posts with these hashtags or topics are hidden.">
              <form className="flex gap-2" onSubmit={e => { e.preventDefault(); addTopic(); }}>
                <input value={topic} onChange={e => setTopic(e.target.value)} placeholder="#topic" maxLength={40} aria-label="Topic to mute"
                  className="min-w-0 flex-1 rounded-full border bg-transparent px-4 text-sm outline-none"
                  style={{ height: 'var(--pj-ctl-h-sm)', borderColor: 'var(--pj-border)' }} />
                <button type="submit" aria-label="Mute topic" className="inline-flex items-center justify-center rounded-full px-4"
                  style={{ height: 'var(--pj-ctl-h-sm)', background: 'var(--pj-glass-3)' }}><Plus size={16} /></button>
              </form>
              {prefs.mutedTopics.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {prefs.mutedTopics.map(t => (
                    <button key={t} type="button" onClick={() => fp.unmuteTopic(t)} aria-label={`Unmute ${t}`}
                      className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold" style={{ background: 'var(--pj-glass-3)' }}>
                      #{t} <X size={12} />
                    </button>
                  ))}
                </div>
              )}
            </Section>

            <button type="button" onClick={fp.reset}
              className="inline-flex w-full items-center justify-center gap-2 rounded-full border px-4 text-xs font-black uppercase tracking-widest"
              style={{ height: 'var(--pj-ctl-h-md)', borderColor: 'var(--pj-border-strong)' }}>
              <RotateCcw size={14} /> Reset my feed
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
};

export default FeedControlsSheet;
