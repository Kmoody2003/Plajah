// Social playbook — the preset's content pillars, weekly cadence and a two-week starter calendar,
// loaded into the identity's Studio queue (users/{operator}/scheduledPosts, ownerId = business/org id).
// Plajah-feed posts can be scheduled outright; other networks are saved as drafts so the owner picks the
// connected accounts in Studio (fediverse) or taps Post (X web intent). Nothing is auto-posted elsewhere.

import React, { useMemo, useState } from 'react';
import { CalendarPlus, Check, Hash, Loader2 } from 'lucide-react';
import type { SocialPlaybook, SocialNet } from '../../services/opsPresets';
import { createScheduledPost } from '../../services/managerSuite/scheduledPostsService';
import { BO, BoLabel, BoSectionHead, BoSegmented } from '../business/opsKit';

export interface SocialPlaybookPanelProps {
  playbook: SocialPlaybook;
  scope: { kind: 'BUSINESS' | 'ORG'; id: string; name: string };
  /** Optional: seed one extra post (e.g. "Promote this event"). */
  seed?: { text: string; when?: number } | null;
  onOpenStudio?: () => void;
}

const NET_LABEL: Record<SocialNet, string> = {
  plajah: 'Plajah', instagram: 'Instagram', facebook: 'Facebook', tiktok: 'TikTok', x: 'X', linkedin: 'LinkedIn', youtube: 'YouTube', bluesky: 'Bluesky', mastodon: 'Mastodon',
};

/** Next Monday 00:00 local. */
function nextMonday(from = new Date()): Date {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const add = ((8 - d.getDay()) % 7) || 7;
  d.setDate(d.getDate() + add);
  return d;
}

const at = (base: Date, dayOffset: number, hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date(base);
  d.setDate(d.getDate() + dayOffset);
  d.setHours(h || 9, m || 0, 0, 0);
  return d;
};

export default function SocialPlaybookPanel({ playbook, scope, seed, onOpenStudio }: SocialPlaybookPanelProps) {
  const [view, setView] = useState<'calendar' | 'pillars'>('calendar');
  const [texts, setTexts] = useState<string[]>(() => playbook.starterPosts.map(p => p.text));
  const [picked, setPicked] = useState<Set<number>>(() => new Set(playbook.starterPosts.map((_, i) => i)));
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ scheduled: number; drafts: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [seedText, setSeedText] = useState(seed?.text ?? '');
  const base = useMemo(() => nextMonday(), []);
  const pillarLabel = useMemo(() => Object.fromEntries(playbook.pillars.map(p => [p.id, p.label])), [playbook]);

  const load = async () => {
    setBusy(true); setErr(null);
    let scheduled = 0, drafts = 0;
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const common = { ownerId: scope.id, ownerKind: scope.kind, authorOrgId: scope.id, targetAccountIds: [] as string[], timezone: tz };
      const tags = playbook.hashtags.slice(0, 3).join(' ');
      if (seedText.trim()) {
        await createScheduledPost({ ...common, text: seedText.trim(), alsoPostToPlajah: true, scheduledAt: seed?.when && seed.when > Date.now() ? seed.when : undefined });
        seed?.when && seed.when > Date.now() ? scheduled++ : drafts++;
      }
      for (const i of picked) {
        const p = playbook.starterPosts[i];
        const text = `${texts[i]}\n\n${tags}`.trim();
        const plajahOnly = p.networks.every(n => n === 'plajah');
        // Plajah feed: schedule at the slot. Other networks: a draft with the slot in the text's metadata,
        // so Studio can attach the connected accounts before it goes out.
        await createScheduledPost({
          ...common, text,
          alsoPostToPlajah: p.networks.includes('plajah'),
          shareToX: p.networks.includes('x') || undefined,
          scheduledAt: plajahOnly || p.networks.includes('plajah') ? at(base, p.dayOffset, p.time).getTime() : undefined,
        });
        p.networks.includes('plajah') ? scheduled++ : drafts++;
      }
      setDone({ scheduled, drafts });
    } catch (e: any) {
      setErr(e?.message || 'Could not load the calendar.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section>
      <BoSectionHead
        title="Social"
        sub={<>A content plan built for {scope.name}: what to post, how often, and two weeks of posts ready to edit.</>}
        action={<BoSegmented value={view} onChange={k => setView(k as any)} options={[{ k: 'calendar', label: 'Starter calendar', count: playbook.starterPosts.length }, { k: 'pillars', label: 'Pillars & cadence' }]} />}
      />

      {view === 'pillars' && (
        <div className="grid gap-8" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
          <div>
            <BoLabel className="mb-3">Content pillars</BoLabel>
            <div className="bo-rule">
              {playbook.pillars.map(p => (
                <div key={p.id} className="py-4">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="bo-title text-lg text-white">{p.label}</span>
                    <span className="bo-num text-[15px] text-[#A39BAE]">{p.share}%</span>
                  </div>
                  <div className="h-1.5 rounded-full mt-2 mb-3" style={{ background: 'rgba(255,255,255,0.06)' }}>
                    <div className="h-full rounded-full" style={{ width: `${p.share}%`, background: 'var(--bo-accent)' }} />
                  </div>
                  <ul className="m-0 pl-4 text-sm text-[#D9D3E0] space-y-1">{p.ideas.map(i => <li key={i}>{i}</li>)}</ul>
                </div>
              ))}
            </div>
          </div>
          <div>
            <BoLabel className="mb-3">Weekly cadence</BoLabel>
            <div className="bo-rule">
              {playbook.cadence.map(c => (
                <div key={c.network} className="py-3.5 grid items-baseline gap-3" style={{ gridTemplateColumns: 'minmax(0,1fr) auto auto' }}>
                  <span className="text-[15px] text-white">{NET_LABEL[c.network]}</span>
                  <span className="bo-num text-lg text-white">{c.perWeek}<span className="text-[13px] text-[#A39BAE] ml-1">/ week</span></span>
                  <span className="text-[13px] text-[#A39BAE]">{c.bestTimes.join(' · ')}</span>
                </div>
              ))}
            </div>
            <BoLabel className="mt-8 mb-3">Hashtags</BoLabel>
            <div className="flex flex-wrap gap-2">{playbook.hashtags.map(h => <span key={h} className="bo-chip"><Hash size={12} />{h.replace(/^#/, '')}</span>)}</div>
          </div>
        </div>
      )}

      {view === 'calendar' && (
        <>
          {seed && (
            <div className="bo-panel p-5 mb-5">
              <BoLabel className="mb-2">Promote</BoLabel>
              <textarea className="bo-input" value={seedText} onChange={e => setSeedText(e.target.value)} />
            </div>
          )}
          <div className="bo-rule">
            {playbook.starterPosts.map((p, i) => {
              const when = at(base, p.dayOffset, p.time);
              const on = picked.has(i);
              return (
                <div key={i} className="py-4 grid gap-4 items-start" style={{ gridTemplateColumns: '44px 92px minmax(0,1fr)' }}>
                  <button aria-pressed={on} aria-label={on ? 'Skip this post' : 'Include this post'}
                    onClick={() => setPicked(s => { const n = new Set(s); n.has(i) ? n.delete(i) : n.add(i); return n; })}
                    className="w-11 h-11 rounded-xl grid place-items-center transition-colors"
                    style={on ? { background: 'var(--bo-accent)', color: '#160A00' } : { border: `1px solid ${BO.lineStrong}`, color: BO.muted }}>
                    {on && <Check size={18} />}
                  </button>
                  <div className="pt-1">
                    <div className="bo-num text-white text-[15px]">{when.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</div>
                    <div className="text-[13px] text-[#A39BAE]">{when.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</div>
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      <span className="bo-chip">{pillarLabel[p.pillar] || p.pillar}</span>
                      {p.networks.map(n => <span key={n} className="bo-chip" style={{ background: 'transparent', border: `1px solid ${BO.line}` }}>{NET_LABEL[n]}</span>)}
                    </div>
                    <textarea className="bo-input" style={{ minHeight: 64 }} value={texts[i]} onChange={e => setTexts(t => t.map((x, j) => (j === i ? e.target.value : x)))} />
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center gap-3 pt-6">
            <button className="bo-btn bo-btn-primary" disabled={busy || (picked.size === 0 && !seedText.trim())} onClick={load}>
              {busy ? <Loader2 size={16} className="animate-spin" /> : <CalendarPlus size={16} />}
              Load {picked.size + (seedText.trim() ? 1 : 0)} posts into the queue
            </button>
            {onOpenStudio && <button className="bo-btn bo-btn-ghost" onClick={onOpenStudio}>Open Studio</button>}
            {done && <span className="text-sm" style={{ color: BO.success }}>{done.scheduled} scheduled on Plajah, {done.drafts} saved as drafts for other networks.</span>}
            {err && <span className="text-sm" style={{ color: BO.danger }}>{err}</span>}
          </div>
          <p className="text-[13px] text-[#A39BAE] mt-3 max-w-2xl">Posts to the Plajah feed go out at the time shown. Instagram, Facebook, TikTok and others are saved as drafts: open Studio to attach your connected accounts or post them yourself.</p>
        </>
      )}
    </section>
  );
}
