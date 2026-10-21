// ElevateBriefingDoc — renders an Elevate Live briefing INSIDE a feed post.
//
// The briefing auto-publishes as a document post (createPost dual write:
// Elevate members feed via org identity + the public Plajah social feed).
// The whole document travels on the post (`telaDocument`) so it renders
// inline in the post itself — no link-out. It always carries the AI-draft
// caveat. Org role-holders (post.editableUids = org creator + admins) get an
// in-document editor to revise it; for everyone else it is read-only.

import React, { useState } from 'react';
import { Sparkles, Pencil, Check, Loader2, BookOpen, Users, Megaphone } from 'lucide-react';
import { auth } from '../services/firebase';
import { formatClock, type ElevateArticleBlock } from '../services/elevateLiveBriefing';
import { updateElevateDocument } from '../services/elevateLiveStore';

const label = 'text-[10px] font-black uppercase tracking-widest text-white/40';

const Block: React.FC<{ block: ElevateArticleBlock }> = ({ block }) => {
  if (block.type === 'HEADING') return <h4 className="text-base font-black text-white mt-4 mb-1">{block.content}</h4>;
  if (block.type === 'QUOTE') return (
    <blockquote className="border-l-2 border-small-orange pl-3 my-3">
      <p className="text-sm text-white/85 italic">&ldquo;{block.content}&rdquo;</p>
      {block.caption && <cite className="text-[11px] text-white/40 not-italic">{block.caption}</cite>}
    </blockquote>
  );
  if (block.type === 'IMAGE') return (
    <figure className={`my-3 ${block.layout === 'LEFT' ? 'sm:float-left sm:w-1/2 sm:mr-4' : block.layout === 'RIGHT' ? 'sm:float-right sm:w-1/2 sm:ml-4' : ''}`}>
      <img src={block.content} alt={block.caption || ''} className="w-full rounded-2xl border border-white/10" loading="lazy" />
      {block.caption && <figcaption className="text-[11px] text-white/40 mt-1">{block.caption}</figcaption>}
    </figure>
  );
  if (block.type === 'VIDEO') return (
    <figure className="my-3 clear-both">
      <video src={block.content} controls preload="none" className="w-full rounded-2xl border border-white/10 bg-black" />
      {block.caption && <figcaption className="text-[11px] text-white/40 mt-1">{block.caption}</figcaption>}
    </figure>
  );
  return <p className="text-sm text-white/75 leading-relaxed my-2 whitespace-pre-wrap">{block.content}</p>;
};

const ElevateBriefingDoc: React.FC<{ post: any }> = ({ post }) => {
  const doc = post?.telaDocument;
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState(doc?.title || '');
  const [summary, setSummary] = useState('');
  const [blocks, setBlocks] = useState<ElevateArticleBlock[]>(doc?.blocks || []);
  const [revised, setRevised] = useState(!!doc?.revisedAt);

  if (!doc) return null;
  const canEdit = !!auth.currentUser && Array.isArray(post.editableUids) && post.editableUids.includes(auth.currentUser.uid);

  const beginEdit = () => {
    setTitle(doc.title || '');
    const firstText = (doc.blocks || []).find((b: ElevateArticleBlock) => b.type === 'TEXT');
    setSummary(firstText?.content || '');
    setBlocks(doc.blocks || []);
    setEditing(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      const nextBlocks = blocks.map(b => (b.type === 'TEXT' && summary && b === blocks.find(x => x.type === 'TEXT') ? { ...b, content: summary } : b));
      await updateElevateDocument({ postId: post.id, briefingId: post.briefingId, title, summary, blocks: nextBlocks });
      doc.title = title; doc.blocks = nextBlocks;
      setRevised(true); setEditing(false);
    } catch { /* keep editing open on failure */ }
    setSaving(false);
  };

  return (
    <div className="mt-3 bg-white/[0.03] border border-white/10 rounded-3xl p-4 sm:p-5 overflow-hidden">
      {/* AI-draft caveat — always visible */}
      <div className="flex items-start gap-2 bg-small-orange/10 border border-small-orange/25 rounded-2xl px-3 py-2 mb-4">
        <Sparkles size={14} className="text-small-orange shrink-0 mt-0.5" />
        <p className="text-[11px] leading-snug text-white/60">
          <span className="font-black uppercase tracking-widest text-small-orange">AI draft</span>
          {' — '}{post.draftNotice || doc.caveat || 'AI-generated draft. The author may revise this briefing later.'}
          {revised && <span className="text-white/40"> · Revised by the author after publishing.</span>}
        </p>
        {canEdit && !editing && (
          <button onClick={beginEdit} className="ml-auto shrink-0 flex items-center gap-1 px-3 py-1.5 bg-white/5 border border-white/10 rounded-full text-[9px] font-black uppercase tracking-widest text-white/60 hover:text-white">
            <Pencil size={11} /> Edit
          </button>
        )}
      </div>

      {editing ? (
        <div className="space-y-3">
          <input value={title} onChange={e => setTitle(e.target.value)} className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-small-orange/50" />
          <textarea value={summary} onChange={e => setSummary(e.target.value)} rows={5} className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-small-orange/50 resize-y" />
          <p className="text-[11px] text-white/30">Editing the title and lead section. Full editing lives in Master Control → Elevate Live and Sermon Studio.</p>
          <div className="flex gap-2">
            <button onClick={save} disabled={saving} className="flex items-center gap-2 px-5 py-2.5 bg-small-orange text-black rounded-full text-[10px] font-black uppercase tracking-widest disabled:opacity-40">
              {saving ? <Loader2 className="animate-spin" size={14} /> : <Check size={14} />} Save revision
            </button>
            <button onClick={() => setEditing(false)} className="px-5 py-2.5 bg-white/5 border border-white/10 rounded-full text-[10px] font-black uppercase tracking-widest text-white/60">Cancel</button>
          </div>
        </div>
      ) : (
        <>
          <h3 className="text-lg font-black text-white leading-tight">{doc.title}</h3>
          <p className="text-[11px] text-white/40 mt-0.5">{doc.orgName} · {new Date(doc.serviceDate).toLocaleString()} · Tela document</p>
          <div className="mt-2">
            {(doc.blocks || []).map((b: ElevateArticleBlock) => <Block key={b.id} block={b} />)}
          </div>
          <div className="clear-both" />
          {!!doc.scriptureIndex?.length && (
            <div className="mt-4">
              <p className={`${label} mb-1.5 flex items-center gap-2`}><BookOpen size={12} /> Scripture in this service</p>
              <div className="flex flex-wrap gap-1.5">
                {doc.scriptureIndex.map((s: any, i: number) => (
                  <span key={i} title={`${s.teachingPoint} (${formatClock(s.timecode)})`} className="px-2.5 py-1 bg-small-orange/15 border border-small-orange/30 rounded-full text-[11px] font-bold text-small-orange">{s.reference}</span>
                ))}
              </div>
            </div>
          )}
          {!!doc.biblicalFigures?.length && (
            <div className="mt-4">
              <p className={`${label} mb-1.5 flex items-center gap-2`}><Users size={12} /> People of the Bible in this teaching</p>
              {doc.biblicalFigures.map((f: any, i: number) => (
                <p key={i} className="text-sm text-white/70 mb-1"><span className="font-bold text-white">{f.name}</span> — {f.whatWasSaid} <span className="text-white/40">→ {f.relationToTeaching}</span></p>
              ))}
            </div>
          )}
          {!!doc.announcements?.length && (
            <div className="mt-4">
              <p className={`${label} mb-1.5 flex items-center gap-2`}><Megaphone size={12} /> Announcements &amp; reminders</p>
              {doc.announcements.map((a: any, i: number) => (
                <p key={i} className="text-sm text-white/70 mb-1">{a.isSaveTheDate ? '📅 ' : ''}<span className="font-bold text-white">{a.title}</span>{a.whenText ? ` — ${a.whenText}` : ''}. {a.details}</p>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default ElevateBriefingDoc;
