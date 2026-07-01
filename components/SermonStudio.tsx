// SermonStudio — Aria turns sermons into articles + books (Part 3, Phase 3).
// Paste a transcript → generate an article draft → edit → save; then compile the
// church's saved sermon articles into a book for the library.

import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, Sparkles, Loader2, Save, BookOpen, Check, FileText } from 'lucide-react';
import type { Organization } from '../types';
import {
  generateSermonArticle, saveSermonArticle, fetchChurchSermonArticles, compileSermonsIntoBook,
  type SermonDraft, type SermonArticle,
} from '../services/sermonService';

const field = 'w-full bg-black/40 border border-white/10 rounded-2xl px-4 py-3 text-sm text-white outline-none focus:border-small-orange/50 transition-all placeholder:text-white/25';

const SermonStudio: React.FC<{ church: Organization; onClose: () => void }> = ({ church, onClose }) => {
  const [tab, setTab] = useState<'create' | 'book'>('create');

  // Create-article state
  const [hint, setHint] = useState('');
  const [transcript, setTranscript] = useState('');
  const [draft, setDraft] = useState<SermonDraft | null>(null);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Book state
  const [articles, setArticles] = useState<SermonArticle[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bookTitle, setBookTitle] = useState('');
  const [compiling, setCompiling] = useState(false);
  const [bookDone, setBookDone] = useState(false);

  const loadArticles = () => fetchChurchSermonArticles(church.id).then(setArticles).catch(() => {});
  useEffect(() => { if (tab === 'book') loadArticles(); }, [tab]);

  const generate = async () => {
    if (!transcript.trim()) return;
    setGenerating(true); setSaved(false);
    try { setDraft(await generateSermonArticle(transcript, hint.trim() || undefined)); }
    catch { alert('Aria could not generate the article. Try again.'); }
    setGenerating(false);
  };

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    try { const id = await saveSermonArticle(church, draft); if (id) { setSaved(true); setDraft(null); setTranscript(''); setHint(''); } }
    catch { alert('Could not save.'); }
    setSaving(false);
  };

  const compile = async () => {
    const chosen = articles.filter(a => selected.has(a.id));
    if (!chosen.length) return;
    setCompiling(true);
    try { const id = await compileSermonsIntoBook(church, chosen, { title: bookTitle.trim() || `${church.name} — Sermon Collection` }); if (id) { setBookDone(true); setSelected(new Set()); } }
    catch { alert('Could not compile the book.'); }
    setCompiling(false);
  };

  return (
    <div className="min-h-full p-6 lg:p-12 max-w-2xl mx-auto">
      <button onClick={onClose} className="flex items-center gap-2 text-white/40 hover:text-white text-[10px] font-black uppercase tracking-widest mb-8"><ArrowLeft size={14} /> Back</button>

      <div className="flex items-center gap-3 mb-6">
        <div className="p-3 bg-small-orange/15 rounded-2xl"><Sparkles className="text-small-orange" size={24} /></div>
        <div>
          <h1 className="text-2xl font-black uppercase tracking-tight text-white leading-none">Sermon Studio</h1>
          <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest mt-1">Aria turns sermons into articles & books</p>
        </div>
      </div>

      <div className="flex gap-1 p-1 bg-white/5 rounded-2xl self-start mb-8 w-fit">
        {(['create', 'book'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} className={`px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${tab === t ? 'bg-white text-black' : 'text-white/40 hover:text-white'}`}>
            {t === 'create' ? 'Sermon → Article' : 'Compile a Book'}
          </button>
        ))}
      </div>

      {tab === 'create' ? (
        <div className="space-y-5">
          {saved && <div className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-green-500/10 border border-green-500/25 text-green-400 text-[11px] font-black uppercase tracking-widest"><Check size={14} /> Saved to the church library</div>}
          <input value={hint} onChange={e => setHint(e.target.value)} placeholder="Sermon title (optional)" className={field} />
          <textarea value={transcript} onChange={e => setTranscript(e.target.value)} rows={7} placeholder="Paste the sermon transcript or notes…" className={`${field} resize-none`} />
          <button onClick={generate} disabled={generating || !transcript.trim()} className="w-full py-3.5 bg-small-orange text-black rounded-full font-black text-xs uppercase tracking-widest hover:brightness-110 disabled:opacity-30 flex items-center justify-center gap-2">
            {generating ? <><Loader2 size={16} className="animate-spin" /> Aria is writing…</> : <><Sparkles size={16} /> Generate article</>}
          </button>

          {draft && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-3 pt-4 border-t border-white/10">
              <p className="text-[10px] font-black uppercase tracking-widest text-white/40 flex items-center gap-2"><FileText size={12} className="text-small-orange" /> Draft — edit before saving</p>
              <input value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} placeholder="Title" className={`${field} text-lg font-black`} />
              <input value={draft.subtitle} onChange={e => setDraft({ ...draft, subtitle: e.target.value })} placeholder="Subtitle" className={field} />
              <textarea value={draft.body} onChange={e => setDraft({ ...draft, body: e.target.value })} rows={14} className={`${field} resize-none font-mono text-[13px] leading-relaxed`} />
              <button onClick={save} disabled={saving} className="w-full py-3.5 bg-white text-black rounded-full font-black text-xs uppercase tracking-widest hover:brightness-90 disabled:opacity-30 flex items-center justify-center gap-2">
                {saving ? <><Loader2 size={16} className="animate-spin" /> Saving…</> : <><Save size={16} /> Save to library</>}
              </button>
            </motion.div>
          )}
        </div>
      ) : (
        <div className="space-y-5">
          {bookDone && <div className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-green-500/10 border border-green-500/25 text-green-400 text-[11px] font-black uppercase tracking-widest"><Check size={14} /> Book published to the library</div>}
          {articles.length === 0 ? (
            <p className="text-[11px] text-white/40 py-8 text-center">No sermon articles yet — create some in the first tab, then compile them into a book here.</p>
          ) : (
            <>
              <p className="text-[10px] font-black uppercase tracking-widest text-white/40">Select sermons ({selected.size} chosen)</p>
              <div className="space-y-2">
                {articles.map(a => {
                  const on = selected.has(a.id);
                  return (
                    <button key={a.id} onClick={() => setSelected(s => { const n = new Set(s); n.has(a.id) ? n.delete(a.id) : n.add(a.id); return n; })}
                      className={`w-full flex items-center gap-3 p-3.5 rounded-2xl border text-left transition-all ${on ? 'bg-small-orange/15 border-small-orange/40' : 'bg-white/[0.03] border-white/10 hover:bg-white/[0.06]'}`}>
                      <span className={`w-5 h-5 rounded-md grid place-items-center shrink-0 ${on ? 'bg-small-orange text-black' : 'bg-white/10'}`}>{on && <Check size={12} />}</span>
                      <span className="flex-1 text-sm font-bold text-white truncate">{a.title}</span>
                    </button>
                  );
                })}
              </div>
              <input value={bookTitle} onChange={e => setBookTitle(e.target.value)} placeholder={`Book title (default: ${church.name} — Sermon Collection)`} className={field} />
              <button onClick={compile} disabled={compiling || selected.size === 0} className="w-full py-3.5 bg-small-orange text-black rounded-full font-black text-xs uppercase tracking-widest hover:brightness-110 disabled:opacity-30 flex items-center justify-center gap-2">
                {compiling ? <><Loader2 size={16} className="animate-spin" /> Compiling…</> : <><BookOpen size={16} /> Compile {selected.size || ''} into a book</>}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default SermonStudio;
