// FigureDetail — the full-screen deep dive for a pioneer, opened from the MuseumHall cards.
//
// The cards stay; tapping one now opens this: a large, immersive page with the live-Wikipedia
// portrait and biography, their era and identity, signature works, techniques & contributions,
// documentaries (inline video), further reading, and — inside a discipline — Findings, so a
// pioneer's page is itself a place to discuss and discover.

import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import {
  ArrowLeft, ExternalLink, Award, Wrench, Film, BookOpen, MessageSquare, Send, Sparkles,
} from 'lucide-react';
import { fetchWiki, type MuseumFigure } from '../MuseumHall';
import YouTubeEmbed from './YouTubeEmbed';
import AssetActions from '../AssetActions';
import { auth } from '../../services/backendService';
import { postFinding, subscribeFindings, findingDisplayText } from '../../services/labsFindings';
import type { Post } from '../../types';

const Section: React.FC<{ icon: React.ComponentType<any>; kicker: string; title: string; accent: string; children: React.ReactNode }> = ({ icon: Icon, kicker, title, accent, children }) => (
  <section className="max-w-3xl mx-auto pt-10">
    <div className="flex items-center gap-2.5 mb-4">
      <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${accent}1f`, border: `1px solid ${accent}3a` }}><Icon size={15} style={{ color: accent }} /></div>
      <div>
        <p className="text-[9px] font-black uppercase tracking-[0.3em]" style={{ color: accent }}>{kicker}</p>
        <h2 className="text-xl font-black tracking-tight text-white leading-none mt-0.5">{title}</h2>
      </div>
    </div>
    {children}
  </section>
);

interface Props {
  figure: MuseumFigure;
  accent: string;
  disciplineLabel: string;
  disciplineId?: string;   // when present (science studios), enables Findings
  onBack: () => void;
  currentUser?: any;
}

const FigureDetail: React.FC<Props> = ({ figure, accent, disciplineLabel, disciplineId, onBack, currentUser }) => {
  const [wiki, setWiki] = useState<{ thumb: string; extract: string }>({ thumb: '', extract: '' });
  useEffect(() => { let a = true; fetchWiki(figure.wikiSlug).then(d => a && setWiki(d)); return () => { a = false; }; }, [figure.wikiSlug]);
  const portrait = figure.imageUrl || wiki.thumb;

  // Findings anchored to this figure (only inside a science discipline).
  const anchorId = `figure:${figure.id}`;
  const [findings, setFindings] = useState<Post[]>([]);
  useEffect(() => { if (!disciplineId) return; return subscribeFindings(disciplineId, setFindings, anchorId); }, [disciplineId, anchorId]);
  const [draft, setDraft] = useState('');
  const [posting, setPosting] = useState(false);
  const submit = async () => {
    if (!draft.trim() || posting || !disciplineId) return;
    setPosting(true);
    try { await postFinding({ disciplineId, disciplineLabel, conceptId: anchorId, conceptName: figure.name, text: draft.trim(), kind: 'insight' }); setDraft(''); }
    finally { setPosting(false); }
  };

  const meta = [figure.role, figure.era, figure.nationality].filter(Boolean);

  return (
    <div className="min-h-screen text-white pb-24">
      {/* Hero */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-24 left-[8%] w-[520px] h-[520px] rounded-full blur-[130px]" style={{ background: `${accent}22` }} />
        </div>
        <div className="relative max-w-5xl mx-auto px-5 sm:px-6 pt-7">
          <button onClick={onBack} className="inline-flex items-center gap-2 text-white/40 hover:text-white transition-colors mb-6">
            <ArrowLeft size={16} /> <span className="text-[10px] font-black uppercase tracking-widest">{disciplineLabel} · Pioneers</span>
          </button>
          <div className="grid lg:grid-cols-[minmax(0,300px)_1fr] gap-8 items-end">
            <div className="rounded-3xl overflow-hidden border border-white/12 aspect-[3/4] bg-white/5 shadow-2xl max-w-[300px]">
              {portrait
                ? <img src={portrait} alt={figure.name} className="w-full h-full object-cover" />
                : <div className="w-full h-full flex items-center justify-center"><Sparkles size={40} className="text-white/10" /></div>}
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.4em]" style={{ color: accent }}>Pioneer</p>
              <h1 className="font-black tracking-tighter mt-2 leading-[0.95]" style={{ fontSize: 'clamp(2.4rem, 7vw, 4rem)' }}>{figure.name}</h1>
              {figure.years && <p className="text-white/45 font-bold mt-2 tabular-nums">{figure.years}</p>}
              {meta.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-4">
                  {meta.map(m => <span key={m} className="px-2.5 py-1 rounded-full text-[11px] font-bold text-white/70 bg-white/5 border border-white/10">{m}</span>)}
                </div>
              )}
              {figure.tagline && <p className="mt-4 text-lg italic leading-relaxed" style={{ color: `${accent}` }}>“{figure.tagline}”</p>}
            </div>
          </div>
        </div>
      </div>

      <div className="px-5 sm:px-6">
        {/* Biography */}
        <Section icon={BookOpen} kicker="Biography" title="The life & the work" accent={accent}>
          {wiki.extract
            ? <p className="text-[1.1rem] leading-relaxed text-white/75">{wiki.extract}</p>
            : <p className="text-white/40">Loading biography…</p>}
          <a href={`https://en.wikipedia.org/wiki/${figure.wikiSlug}`} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-white">
            Full article on Wikipedia <ExternalLink size={11} />
          </a>
        </Section>

        {/* Signature works */}
        {figure.works?.length ? (
          <Section icon={Award} kicker="Signature Works" title="What they gave us" accent={accent}>
            <div className="flex flex-wrap gap-2">
              {figure.works.map(w => <span key={w} className="px-3 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-[13px] text-white/75 font-medium">{w}</span>)}
            </div>
          </Section>
        ) : null}

        {/* Techniques / contributions */}
        {figure.techniques?.length ? (
          <Section icon={Wrench} kicker="Techniques & Contributions" title="How they changed the field" accent={accent}>
            <ul className="space-y-2">
              {figure.techniques.map(t => (
                <li key={t} className="flex gap-3 text-[14px] text-white/65 leading-relaxed"><span className="mt-2 w-1.5 h-1.5 rounded-full shrink-0" style={{ background: accent }} />{t}</li>
              ))}
            </ul>
          </Section>
        ) : null}

        {/* Documentaries — inline video */}
        {figure.docs?.length ? (
          <Section icon={Film} kicker="Watch" title="Documentaries & talks" accent={accent}>
            <div className="grid sm:grid-cols-2 gap-4">
              {figure.docs.map((d, i) => d.videoId
                ? <YouTubeEmbed key={i} id={d.videoId} title={d.label} channel={figure.name} query={`${figure.name} ${d.label}`} accent={accent} />
                : <a key={i} href={d.url} target="_blank" rel="noreferrer" className="rounded-2xl border border-white/8 bg-white/[0.03] p-4 hover:bg-white/[0.06] transition-all flex items-center gap-3">
                    <Film size={16} style={{ color: accent }} /><span className="text-[13px] font-bold text-white flex-1">{d.label}</span><ExternalLink size={13} className="text-white/30" />
                  </a>)}
            </div>
          </Section>
        ) : null}

        {/* Further reading */}
        {figure.links?.length ? (
          <Section icon={BookOpen} kicker="Further Reading" title="Go deeper" accent={accent}>
            <div className="grid sm:grid-cols-2 gap-2.5">
              {figure.links.map((l, i) => (
                <a key={i} href={l.url} target="_blank" rel="noreferrer" className="rounded-2xl border border-white/8 bg-white/[0.03] p-4 hover:bg-white/[0.06] transition-all flex items-center gap-3">
                  <span className="text-[13px] font-bold text-white flex-1">{l.label}</span><ExternalLink size={13} className="text-white/30" />
                </a>
              ))}
            </div>
          </Section>
        ) : null}

        {/* Findings — social layer (science studios only) */}
        {disciplineId && (
          <Section icon={MessageSquare} kicker="Findings" title="Discuss this pioneer" accent={accent}>
            {auth.currentUser ? (
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 mb-5">
                <textarea value={draft} onChange={e => setDraft(e.target.value)} rows={3} placeholder={`Share what makes ${figure.name} matter…`}
                  className="w-full px-3 py-2.5 rounded-xl bg-black/40 border border-white/10 text-white text-sm resize-y focus:outline-none focus:border-white/25" />
                <div className="flex justify-end mt-2.5">
                  <button onClick={submit} disabled={!draft.trim() || posting} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all disabled:opacity-40" style={{ background: accent, color: '#000' }}><Send size={12} /> {posting ? 'Posting…' : 'Post'}</button>
                </div>
              </div>
            ) : <p className="text-[12px] text-white/30 mb-5 italic">Sign in to post.</p>}
            {findings.length > 0 ? (
              <div className="space-y-2.5">
                {findings.map(f => (
                  <motion.div key={f.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
                    <div className="flex items-center gap-2 mb-1.5">
                      {f.authorPhoto ? <img src={f.authorPhoto} alt="" className="w-6 h-6 rounded-full object-cover" /> : <div className="w-6 h-6 rounded-full bg-white/10" />}
                      <p className="text-[11px] font-bold text-white/70">{f.authorName || 'Anonymous'}</p>
                    </div>
                    <p className="text-[13.5px] text-white/75 leading-relaxed whitespace-pre-wrap">{findingDisplayText(f.text)}</p>
                  </motion.div>
                ))}
              </div>
            ) : (
              <div className="py-10 text-center border-2 border-dashed border-white/8 rounded-2xl">
                <MessageSquare size={24} className="mx-auto text-white/12 mb-2" />
                <p className="text-[11px] font-black uppercase tracking-widest text-white/25">Start the conversation</p>
              </div>
            )}
          </Section>
        )}

        {/* Share */}
        <div className="max-w-3xl mx-auto pt-10">
          <AssetActions accent={accent} asset={{
            kind: 'figure', title: figure.name, subtitle: [disciplineLabel, ...meta].filter(Boolean).join(' · '),
            description: figure.tagline || wiki.extract, imageUrl: portrait,
            sourceUrl: `https://en.wikipedia.org/wiki/${figure.wikiSlug}`, discipline: disciplineLabel,
            interests: [figure.era, figure.nationality].filter(Boolean) as string[],
          }} />
        </div>
      </div>
    </div>
  );
};

export default FigureDetail;
