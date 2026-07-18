// ConceptDetail — the full-page deep dive for a single concept.
//
// Replaces the cramped modal with a proper reading page: a large hero (live Wikipedia), the
// principle in plain language, the interactive experiment that demonstrates it, the math that
// formalises it (KaTeX), the primary evidence (experiments / documents / data), curated video,
// and Findings — the in-context social layer where learners post discoveries and questions
// anchored right here.

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion } from 'motion/react';
import {
  ArrowLeft, ExternalLink, FlaskConical, Sigma, ScrollText, Play, MessageSquare,
  Lightbulb, Send, FileText, Database, Microscope, Eye, CheckCircle2,
} from 'lucide-react';
import { fetchWiki } from '../MuseumHall';
import { SIMULATORS } from './Simulators';
import Katex from './Katex';
import YouTubeEmbed from './YouTubeEmbed';
import AssetActions from '../AssetActions';
import { auth } from '../../services/backendService';
import { postFinding, subscribeFindings, findingDisplayText } from '../../services/labsFindings';
import type { ScienceDisciplineData, Concept } from '../../data/scienceDisciplines/types';
import type { Post } from '../../types';

const KIND_ICON: Record<string, React.ComponentType<any>> = {
  experiment: Microscope, document: FileText, dataset: Database, observation: Eye, proof: CheckCircle2,
};

const tokenize = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 3);

// Module-scoped so it keeps a stable identity across re-renders (typing in Findings must NOT
// remount the embedded simulator or steal textarea focus).
const DDSection: React.FC<{ icon: React.ComponentType<any>; kicker: string; title: string; accent: string; children: React.ReactNode }> = ({ icon: Icon, kicker, title, accent, children }) => (
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
  concept: Concept;
  data: ScienceDisciplineData;
  onBack: () => void;
  currentUser?: any;
}

const ConceptDetail: React.FC<Props> = ({ concept, data, onBack, currentUser }) => {
  const accent = data.accent;
  const [wiki, setWiki] = useState<{ thumb: string; extract: string }>({ thumb: '', extract: '' });
  useEffect(() => { let a = true; if (concept.wikiSlug) fetchWiki(concept.wikiSlug).then(d => a && setWiki(d)); return () => { a = false; }; }, [concept.wikiSlug]);

  // ── Auto-match the concept to its laws, experiment and videos ──
  const laws = useMemo(() => {
    if (concept.lawIds?.length) return data.laws.filter(l => concept.lawIds!.includes(l.id));
    const toks = new Set([...tokenize(concept.name), ...(concept.tags || []).flatMap(tokenize)]);
    return data.laws
      .map(l => ({ l, score: tokenize(`${l.name} ${l.category} ${l.description}`).filter(w => toks.has(w)).length }))
      .filter(x => x.score > 0).sort((a, b) => b.score - a.score).slice(0, 3).map(x => x.l);
  }, [concept, data.laws]);

  const simId = useMemo(() => {
    if (concept.simulatorId && SIMULATORS[concept.simulatorId]) return concept.simulatorId;
    const toks = new Set([...tokenize(concept.name), ...(concept.tags || []).flatMap(tokenize)]);
    for (const sid of data.simulators || []) {
      const entry = SIMULATORS[sid];
      if (entry && tokenize(entry.label).some(w => toks.has(w))) return sid;
    }
    return null;
  }, [concept, data.simulators]);

  const videos = useMemo(() => {
    if (!data.videos?.length) return [];
    if (concept.videoIds?.length) return data.videos.filter(v => concept.videoIds!.includes(v.id));
    const toks = new Set([...tokenize(concept.name), ...(concept.tags || []).flatMap(tokenize)]);
    return data.videos.filter(v => tokenize(`${v.title} ${v.topic || ''}`).some(w => toks.has(w))).slice(0, 3);
  }, [concept, data.videos]);

  const SimComp = simId ? SIMULATORS[simId].Component : null;

  // ── Findings (social layer, scoped to this concept) ──
  const [findings, setFindings] = useState<Post[]>([]);
  useEffect(() => subscribeFindings(data.id, setFindings, concept.id), [data.id, concept.id]);
  const [draft, setDraft] = useState('');
  const [kind, setKind] = useState<'insight' | 'question' | 'result'>('insight');
  const [posting, setPosting] = useState(false);
  const submit = async () => {
    if (!draft.trim() || posting) return;
    setPosting(true);
    try {
      await postFinding({ disciplineId: data.id, disciplineLabel: data.label, conceptId: concept.id, conceptName: concept.name, simulatorId: simId || undefined, text: draft.trim(), kind });
      setDraft('');
    } finally { setPosting(false); }
  };

  return (
    <div className="min-h-screen text-white pb-24">
      {/* Hero */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-24 left-[10%] w-[520px] h-[520px] rounded-full blur-[130px]" style={{ background: `${accent}22` }} />
          <div className="absolute -bottom-32 right-[6%] w-[420px] h-[420px] rounded-full blur-[110px]" style={{ background: `${data.accent2}22` }} />
        </div>
        <div className="relative max-w-5xl mx-auto px-5 sm:px-6 pt-7">
          <button onClick={onBack} className="inline-flex items-center gap-2 text-white/40 hover:text-white transition-colors mb-6">
            <ArrowLeft size={16} /> <span className="text-[10px] font-black uppercase tracking-widest">{data.label}</span>
          </button>
          <div className="grid lg:grid-cols-[1fr_minmax(0,420px)] gap-8 items-center">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.4em]" style={{ color: accent }}>Concept</p>
              <h1 className="font-black tracking-tighter mt-2 leading-[0.95]" style={{ fontSize: 'clamp(2.6rem, 8vw, 4.2rem)' }}>{concept.name}</h1>
              {concept.tags?.length ? <div className="flex flex-wrap gap-1.5 mt-4">{concept.tags.map(t => <span key={t} className="px-2.5 py-1 rounded-full text-[10px] font-bold text-white/60 bg-white/5 border border-white/10">{t}</span>)}</div> : null}
            </div>
            {wiki.thumb && (
              <div className="rounded-3xl overflow-hidden border border-white/10 aspect-[4/3] bg-white/5 shadow-2xl">
                <img src={wiki.thumb} alt={concept.name} className="w-full h-full object-cover" />
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="px-5 sm:px-6">
        {/* The Principle */}
        <DDSection accent={accent} icon={Lightbulb} kicker="The Principle" title="What it says">
          <p className="text-[1.15rem] leading-relaxed text-white/80">{concept.blurb}</p>
          {concept.deepDive && <p className="text-[1.05rem] leading-relaxed text-white/55 mt-4">{concept.deepDive}</p>}
          {wiki.extract && <p className="text-[0.98rem] leading-relaxed text-white/45 mt-4 pt-4 border-t border-white/8">{wiki.extract}</p>}
        </DDSection>

        {/* The Experiment */}
        {SimComp && (
          <DDSection accent={accent} icon={FlaskConical} kicker="The Experiment" title="See it for yourself">
            <p className="text-[0.98rem] text-white/50 mb-4 leading-relaxed">Change the inputs and watch the principle play out. When you spot something worth sharing, post it as a Finding below.</p>
            <SimComp accent={accent} />
          </DDSection>
        )}

        {/* The Math */}
        {laws.length > 0 && (
          <DDSection accent={accent} icon={Sigma} kicker="The Math" title="How we formalise it">
            <div className="space-y-3">
              {laws.map(l => (
                <div key={l.id} className="rounded-2xl border border-white/8 bg-white/[0.03] p-5">
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <p className="text-[14px] font-black text-white">{l.name}</p>
                    <span className="px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-[8px] font-black uppercase tracking-widest text-white/45 shrink-0">{l.category}</span>
                  </div>
                  <div className="p-4 rounded-xl bg-black/40 border border-white/8 text-lg"><Katex latex={l.latex} /></div>
                  <p className="text-[13px] text-white/55 leading-relaxed mt-3">{l.description}</p>
                  {l.variables.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {l.variables.map(v => <span key={v.sym} className="px-2 py-1 rounded-lg bg-white/[0.04] border border-white/8 text-[11px] text-white/55"><b style={{ color: accent }}>{v.sym}</b> — {v.name}{v.unit ? ` (${v.unit})` : ''}</span>)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </DDSection>
        )}

        {/* The Evidence */}
        {concept.evidence?.length ? (
          <DDSection accent={accent} icon={ScrollText} kicker="The Record" title="The evidence &amp; the experiments">
            <div className="space-y-2.5">
              {concept.evidence.map((e, i) => {
                const Icon = KIND_ICON[e.kind || 'experiment'] || Microscope;
                const inner = (
                  <>
                    <div className="flex items-center gap-2.5">
                      <Icon size={15} style={{ color: accent }} className="shrink-0" />
                      <p className="text-[14px] font-black text-white">{e.label}</p>
                      {e.url && <ExternalLink size={12} className="text-white/30 ml-auto shrink-0" />}
                    </div>
                    {e.detail && <p className="text-[12.5px] text-white/50 mt-1.5 leading-relaxed pl-[26px]">{e.detail}</p>}
                  </>
                );
                return e.url
                  ? <a key={i} href={e.url} target="_blank" rel="noreferrer" className="block rounded-2xl border border-white/8 bg-white/[0.03] p-4 hover:bg-white/[0.06] transition-all">{inner}</a>
                  : <div key={i} className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">{inner}</div>;
              })}
            </div>
          </DDSection>
        ) : null}

        {/* Watch */}
        {(videos.length > 0) && (
          <DDSection accent={accent} icon={Play} kicker="Watch" title="Go deeper on video">
            <div className="grid sm:grid-cols-2 gap-4">
              {videos.map(v => <YouTubeEmbed key={v.id} id={v.id} title={v.title} channel={v.channel} query={v.query} blurb={v.blurb} accent={accent} />)}
            </div>
          </DDSection>
        )}
        {videos.length === 0 && (
          <DDSection accent={accent} icon={Play} kicker="Watch" title="Go deeper on video">
            <div className="max-w-md"><YouTubeEmbed title={concept.name} channel={data.label} query={`${concept.name} ${data.label} explained`} accent={accent} /></div>
          </DDSection>
        )}

        {/* Findings — the social layer */}
        <DDSection accent={accent} icon={MessageSquare} kicker="Findings" title="Discoveries &amp; questions">
          <p className="text-[0.95rem] text-white/50 leading-relaxed mb-4">The living conversation, anchored right here. Post what you noticed running the experiment, ask what puzzles you, or share a result. Every finding threads into the discipline's feed.</p>
          {auth.currentUser ? (
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 mb-5">
              <div className="flex gap-1.5 mb-3">
                {(['insight', 'question', 'result'] as const).map(k => (
                  <button key={k} onClick={() => setKind(k)} className="px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all"
                    style={kind === k ? { background: accent, color: '#000' } : { background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.5)' }}>{k}</button>
                ))}
              </div>
              <textarea value={draft} onChange={e => setDraft(e.target.value)} rows={3} placeholder={`Post a ${kind} about ${concept.name}…`}
                className="w-full px-3 py-2.5 rounded-xl bg-black/40 border border-white/10 text-white text-sm resize-y focus:outline-none focus:border-white/25" />
              <div className="flex justify-end mt-2.5">
                <button onClick={submit} disabled={!draft.trim() || posting} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all disabled:opacity-40"
                  style={{ background: accent, color: '#000' }}><Send size={12} /> {posting ? 'Posting…' : 'Post Finding'}</button>
              </div>
            </div>
          ) : (
            <p className="text-[12px] text-white/30 mb-5 italic">Sign in to post a finding.</p>
          )}
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
              <p className="text-[11px] font-black uppercase tracking-widest text-white/25">No findings yet — start the conversation</p>
            </div>
          )}
        </DDSection>

        {/* Share / save */}
        <div className="max-w-3xl mx-auto pt-10">
          <AssetActions accent={accent} asset={{
            kind: 'concept', title: concept.name, subtitle: data.label, description: concept.blurb, imageUrl: wiki.thumb,
            sourceUrl: concept.wikiSlug ? `https://en.wikipedia.org/wiki/${concept.wikiSlug}` : undefined,
            discipline: data.label, interests: concept.tags || [],
          }} />
          {concept.wikiSlug && (
            <a href={`https://en.wikipedia.org/wiki/${concept.wikiSlug}`} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-white">
              Full article on Wikipedia <ExternalLink size={11} />
            </a>
          )}
        </div>
      </div>
    </div>
  );
};

export default ConceptDetail;
