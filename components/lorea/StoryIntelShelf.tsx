// Lorea · Writer's Desk · "From your videos": the writing Story Intelligence drafted from your Reello
// uploads (the blog post, the quotable lines), with the way into Tela's Story Intelligence workspace
// for everything else. Reads the same jobs as Tela, so it never holds a second copy.

import React, { useEffect, useState } from 'react';
import { Sparkles, Quote, FileText, ChevronRight } from 'lucide-react';
import { listIntel } from '../../services/reello/reelloApi';
import type { ReelloIntelJob } from '../../services/reello/intel/types';
import { openStoryIntelWorkspace } from '../../services/storyIntel/open';
import { waitingCount } from '../../services/storyIntel/findings';

const ARTICLE_STATE: Record<string, string> = { POSTED: 'Published', DISCARDED: 'Discarded', DRAFT: 'Draft', NEEDS_REVIEW: 'Needs a look' };

export default function StoryIntelShelf() {
  const [jobs, setJobs] = useState<ReelloIntelJob[] | null>(null);
  useEffect(() => { void listIntel().then(js => setJobs(js.filter(j => j.status === 'READY' && j.report))).catch(() => setJobs([])); }, []);
  if (!jobs?.length) return null;
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-sm font-black uppercase tracking-wider text-white">From your videos</h2>
        <span className="text-[11px] text-white/45">Drafted by Story Intelligence from your Reello uploads</span>
        <span className="flex-1" />
        <button onClick={() => openStoryIntelWorkspace({ view: 'inbox' })}
          className="px-3 py-1.5 rounded-xl bg-[#7c5cff]/20 hover:bg-[#7c5cff]/30 text-[#d7ccff] border border-[#7c5cff]/40 text-xs font-bold flex items-center gap-1.5">
          <Sparkles size={13} /> Open in Tela
        </button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {jobs.slice(0, 6).map(j => {
          const q = j.report?.quotes || [];
          const waiting = waitingCount(j);
          return (
            <article key={j.videoId} className="rounded-2xl border border-white/10 bg-white/[.03] p-4 space-y-2.5 min-w-0">
              <p className="text-[11px] text-white/45 truncate">{j.videoTitle}</p>
              {j.article && (
                <div className="flex gap-2 items-start">
                  <FileText size={14} className="mt-0.5 text-cyan-300 flex-none" />
                  <div className="min-w-0">
                    <p className="text-sm font-bold leading-snug">{j.article.title}</p>
                    <p className="text-[11px] text-white/50">Blog post · {ARTICLE_STATE[j.drafts?.article?.status || 'DRAFT'] || 'Draft'}</p>
                  </div>
                </div>
              )}
              {q.slice(0, 2).map(x => (
                <p key={x.id} className="flex gap-2 text-[12.5px] text-white/75"><Quote size={12} className="mt-1 flex-none text-white/35" /><span className="min-w-0">{x.text}{x.speaker ? <span className="text-white/45"> · {x.speaker}</span> : null}</span></p>
              ))}
              <button onClick={() => openStoryIntelWorkspace({ videoId: j.videoId, view: 'desk' })} className="text-[12px] font-bold text-[#b9a4ff] hover:underline inline-flex items-center gap-1">
                {waiting ? `${waiting} findings to add to a World` : 'Open story notes'}<ChevronRight size={12} />
              </button>
            </article>
          );
        })}
      </div>
    </section>
  );
}
