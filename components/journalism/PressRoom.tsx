/**
 * PressRoom — distribution for the Student Newsroom.
 *
 * Approved stories go out through real channels, each behind studentDesk.channelGate:
 *   print       a laid-out front page (frontPageHtml) to print or save as PDF
 *   newsletter  a ready-to-send email issue rendered by the pro desk's buildEmailIssue
 *   classWall   a post tagged #journalismschool on the School of Journalism student wall
 *   broadcast   opens Fabula to record the script
 *   journalistDesk  hands an adult reporter to the professional desk
 * Published stories keep a visible correction log; corrections are filed here, never silently.
 */
import React, { useMemo, useState } from 'react';
import { Check, Download, FileText, Printer } from 'lucide-react';
import { buildEmailIssue, type FeedArticle } from '../../services/journalist/feedGenerators';
import type { ArticleNotice } from '../../services/journalist/types';
import { kitById } from '../../services/journalismSchool/storyKits';
import {
  CHANNEL_META, channelGate, fileCorrection, frontPageHtml, markDistributed, storyHtml, storyPlain, type Channel, type StudentStory,
} from '../../services/journalismSchool/studentDesk';
import { loadMasthead, saveMasthead, useStories, type Masthead } from '../../services/journalismSchool/newsroomStore';
import { JR_ACCENT, type NewsroomViewer } from './StudentNewsroom';

const CHANNELS: Channel[] = ['print', 'newsletter', 'classWall', 'broadcast', 'journalistDesk'];

const download = (name: string, body: string, type: string) => {
  const url = URL.createObjectURL(new Blob([body], { type }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
};

function toFeedArticle(s: StudentStory): FeedArticle {
  return {
    id: s.id, title: s.headline || s.caption || 'Picture News', subtitle: s.dek || undefined,
    url: `https://plajah.com/academia/journalism#${s.id}`, authorName: s.authorName, authorId: s.authorId,
    publishedAt: s.distributed.newsletter || Date.now(), bodyHtml: storyHtml(s), bodyText: storyPlain(s),
    tags: ['journalismschool'],
    disclosures: s.aiUsed ? { aiAssisted: true, aiNote: 'AI tools assisted; a human reporter checked every fact.' } : undefined,
    // Corrections are already printed inside storyHtml, so they are not repeated as feed notices.
    notices: [] as ArticleNotice[],
  };
}

const PressRoom: React.FC<{ viewer: NewsroomViewer }> = ({ viewer }) => {
  const { stories, save } = useStories(viewer.id);
  const ready = stories.filter(s => s.stage === 'APPROVED' || s.stage === 'PUBLISHED');
  const [picked, setPicked] = useState<string[]>(() => ready.slice(0, 4).map(s => s.id));
  const [mast, setMast] = useState<Masthead>(() => loadMasthead(viewer.id));
  const [status, setStatus] = useState<Record<string, string>>({});
  const [correction, setCorrection] = useState<Record<string, string>>({});
  const ctx = { authorIsMinor: viewer.isMinor, isChildAccount: viewer.isChildAccount };

  const issue = useMemo(() => ready.filter(s => picked.includes(s.id)), [ready, picked]);
  const fpHtml = useMemo(() => frontPageHtml({
    masthead: mast.name, edition: `No. ${mast.edition} · ${new Date().toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}`,
    audience: mast.audience, stories: issue,
  }), [issue, mast]);

  const updMast = (p: Partial<Masthead>) => { const m = { ...mast, ...p }; setMast(m); saveMasthead(viewer.id, m); };
  const note = (id: string, text: string) => setStatus(st => ({ ...st, [id]: text }));
  const markAll = (ch: Channel) => issue.forEach(s => save(markDistributed(s, ch)));

  const distribute = async (ch: Channel) => {
    const blocked = issue.map(s => ({ s, g: channelGate(s, ch, ctx) })).filter(x => !x.g.allowed);
    if (!issue.length) return note(ch, 'Pick at least one approved story.');
    if (blocked.length) return note(ch, `${blocked[0].s.headline || 'A story'}: ${blocked[0].g.reason}`);
    if (ch === 'print') {
      const w = window.open('', '_blank');
      if (w) { w.document.write(fpHtml); w.document.close(); setTimeout(() => w.print(), 400); }
      else download(`${mast.name.replace(/\W+/g, '-')}-no-${mast.edition}.html`, fpHtml, 'text/html');
      markAll('print'); updMast({ edition: mast.edition + 1 }); return note(ch, 'Front page opened for printing. Edition number advanced.');
    }
    if (ch === 'newsletter') {
      const [lead, ...briefs] = issue;
      const email = buildEmailIssue({ ...toFeedArticle(lead), bodyHtml: [storyHtml(lead), ...briefs.map(b => `<h2>${b.headline}</h2>${storyHtml(b)}`)].join('\n') }, { publicationName: mast.name });
      download(`${mast.name.replace(/\W+/g, '-')}-newsletter.html`, email.html, 'text/html');
      try { await navigator.clipboard.writeText(email.text); } catch { /* clipboard blocked */ }
      markAll('newsletter');
      return note(ch, viewer.isMinor ? 'Newsletter saved and the plain text copied. Give it to your teacher to send to families.' : 'Newsletter saved and plain text copied — send it from your mailing list to people who opted in.');
    }
    if (ch === 'classWall') {
      try {
        const { createPost } = await import('../../services/backendService');
        for (const s of issue) {
          await createPost({
            text: `${s.headline || s.caption}\n\n${s.dek || s.lede}\n\n— ${s.authorName}, School of Journalism (${kitById(s.kitId)?.title || 'story'})`,
            tags: ['journalismschool', s.kitId],
            hashtags: ['JournalismSchool'],
          } as any);
          save(markDistributed(s, 'classWall'));
        }
        return note(ch, `Posted ${issue.length} to the student wall.`);
      } catch { return note(ch, 'Sign in to post to the wall.'); }
    }
    if (ch === 'broadcast') {
      try { await navigator.clipboard.writeText(issue.map(storyPlain).join('\n\n———\n\n')); } catch { /* */ }
      window.dispatchEvent(new CustomEvent('OPEN_FABULA', { detail: {} }));
      markAll('broadcast'); return note(ch, 'Script copied. Fabula is opening — paste it into the teleprompter.');
    }
    if (ch === 'journalistDesk') {
      try { await navigator.clipboard.writeText(issue.map(storyPlain).join('\n\n———\n\n')); } catch { /* */ }
      window.dispatchEvent(new CustomEvent('NAVIGATE', { detail: { target: 'JOURNALIST_DESK' } }));
      return note(ch, 'Story copied. The Journalist Desk is opening — paste it into a new article.');
    }
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1fr_1.1fr] gap-6">
      <div className="space-y-6">
        <section className="rounded-3xl border border-white/10 bg-white/[0.02] p-5">
          <h3 className="text-sm font-black uppercase tracking-widest text-white/80 mb-3">Masthead</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="text-[11px] text-white/50">Paper name<input value={mast.name} onChange={e => updMast({ name: e.target.value })} className="mt-1 w-full rounded-xl bg-white/[0.06] border border-white/10 px-3 py-2.5 text-white" /></label>
            <label className="text-[11px] text-white/50">Audience (this is for…)<input value={mast.audience} onChange={e => updMast({ audience: e.target.value })} className="mt-1 w-full rounded-xl bg-white/[0.06] border border-white/10 px-3 py-2.5 text-white" /></label>
          </div>
        </section>

        <section className="rounded-3xl border border-white/10 bg-white/[0.02] p-5">
          <h3 className="text-sm font-black uppercase tracking-widest text-white/80 mb-1">This issue</h3>
          <p className="text-[12px] text-white/45 mb-3">Approved stories only. The first one leads the front page.</p>
          {ready.length === 0 ? <p className="text-sm text-white/50">Nothing approved yet. Stories reach the Press Room after teacher review.</p> : (
            <ul className="space-y-2">
              {ready.map(s => (
                <li key={s.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                  <label className="flex items-center gap-3">
                    <input type="checkbox" checked={picked.includes(s.id)} onChange={e => setPicked(p => e.target.checked ? [...p, s.id] : p.filter(x => x !== s.id))} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-bold text-white">{s.headline || s.caption || 'Picture News'}</span>
                      <span className="block text-[11px] text-white/45">{kitById(s.kitId)?.title} · {Object.keys(s.distributed).map(c => CHANNEL_META[c as Channel].label).join(', ') || 'not yet distributed'}</span>
                    </span>
                  </label>
                  {s.stage === 'PUBLISHED' && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {s.corrections.map((c, i) => <p key={i} className="w-full text-[12px] text-amber-200/80">Correction: {c.text}</p>)}
                      <input value={correction[s.id] || ''} onChange={e => setCorrection(c => ({ ...c, [s.id]: e.target.value }))} placeholder="File a correction: what was wrong, what is right"
                        className="flex-1 min-w-[200px] rounded-xl bg-white/[0.06] border border-white/10 px-3 py-2 text-[13px] text-white" />
                      <button type="button" disabled={!correction[s.id]?.trim()} onClick={() => { save(fileCorrection(s, correction[s.id])); setCorrection(c => ({ ...c, [s.id]: '' })); }}
                        className="rounded-full bg-amber-400/20 px-3 py-2 text-[11px] font-black uppercase text-amber-200 disabled:opacity-40 min-h-[40px]">File correction</button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-3">
          <h3 className="text-sm font-black uppercase tracking-widest text-white/80">Distribute</h3>
          {CHANNELS.map(ch => {
            const meta = CHANNEL_META[ch];
            const blocked = issue.length ? issue.map(s => channelGate(s, ch, ctx)).find(g => !g.allowed) : { allowed: false, reason: 'Pick a story.' };
            return (
              <div key={ch} className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <span className="text-2xl">{meta.emoji}</span>
                <span className="min-w-0 flex-1">
                  <span className="block font-bold text-white">{meta.label}</span>
                  <span className="block text-[12px] text-white/50">{status[ch] || blocked?.reason || meta.blurb}</span>
                </span>
                <button type="button" onClick={() => distribute(ch)} disabled={!!blocked}
                  className="inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-[11px] font-black uppercase tracking-wider text-[#1a0d08] disabled:opacity-30 min-h-[44px]" style={{ background: JR_ACCENT }}>
                  {ch === 'print' ? <Printer size={13} /> : ch === 'newsletter' ? <Download size={13} /> : status[ch] ? <Check size={13} /> : <FileText size={13} />} Send
                </button>
              </div>
            );
          })}
        </section>
      </div>

      <section className="rounded-3xl overflow-hidden border border-white/10 bg-[#f4efe3] min-h-[520px]">
        <iframe title="Front page preview" srcDoc={fpHtml} className="w-full h-[760px] bg-[#f4efe3]" sandbox="allow-same-origin" />
      </section>
    </div>
  );
};

export default PressRoom;
