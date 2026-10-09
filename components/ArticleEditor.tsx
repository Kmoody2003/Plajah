import React, { useState, useEffect } from 'react';
import { Article, ArticleBlock, UserProfile } from '../types';
import { 
  Type, 
  Image as ImageIcon, 
  Music, 
  Video as VideoIcon, 
  Quote, 
  Heading1, 
  Plus, 
  Trash2, 
  MoveUp, 
  MoveDown, 
  Save, 
  Eye, 
  Layout, 
  AlignLeft, 
  AlignCenter, 
  AlignRight, 
  Maximize,
  X,
  Check,
  Play
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useGlobalPlayerState } from '../contexts/GlobalPlayerContext';
import { createArticle, updateArticle, uploadFile } from '../services/backendService';
import { useAriaSurface } from '../services/aria/useAriaSurface';
import ArticleDesk, { type DeskTab } from './journalist/ArticleDesk';
import { loadArticleTemplates, prepareTelaDoc, saveDraft, workingCopy, type ArticleTemplateCatalog } from '../services/journalist/articleService';
import { makeVariants } from '../services/journalist/headlineTester';
import { detectCheckableClaims } from '../services/journalist/factCheck';
import type { Claim } from '../services/journalist/types';

interface ArticleEditorProps {
  article?: Article;
  onSave: (articleId: string, title?: string) => void;
  onCancel: () => void;
  user: UserProfile;
}

const ArticleEditor: React.FC<ArticleEditorProps> = ({ article, onSave, onCancel, user }) => {
  // Open with the unpublished working copy when there is one (edits to a live article never go live without a publish).
  const wc = article ? workingCopy(article) : null;
  const [title, setTitle] = useState(wc?.title || '');
  const [subtitle, setSubtitle] = useState(wc?.subtitle || '');
  const [coverImage, setCoverImage] = useState(wc?.coverImage || '');
  const [blocks, setBlocks] = useState<ArticleBlock[]>(wc?.blocks?.length ? wc.blocks : [
    { id: 'initial', type: 'TEXT', content: '', layout: 'FULL' }
  ]);
  // Journalist desk (Tela publishing, style, headline, fact-check)
  const [deskOpen, setDeskOpen] = useState(false);
  const [deskTab, setDeskTab] = useState<DeskTab>('publish');
  const [templates, setTemplates] = useState<ArticleTemplateCatalog>({ ARTICLE: [], MAGAZINE: [], CATALOG: [] });
  const [templateId, setTemplateId] = useState(article?.tela?.templateId || '');
  const [claims, setClaims] = useState<Claim[]>([]);
  const [aiUsed, setAiUsed] = useState(false);
  const [ariaHeadlines, setAriaHeadlines] = useState<string[]>([]);
  const [ariaClaims, setAriaClaims] = useState<string[]>([]);
  const [savedId, setSavedId] = useState<string | undefined>(article?.id);
  const [stub, setStub] = useState<Article | null>(null);   // a draft this session created (not in the `article` prop)
  const [draftKey] = useState(() => `draft_${Date.now().toString(36)}`);
  const [notice, setNotice] = useState('');
  useEffect(() => { void loadArticleTemplates().then(setTemplates); }, []);
  const track = <T extends Record<string, (params: any) => any>>(h: T): T =>
    Object.fromEntries(Object.entries(h).map(([k, fn]) => [k, (params: any) => { setAiUsed(true); return fn(params); }])) as T;
  const [isSaving, setIsSaving] = useState(false);
  const [isPreview, setIsPreview] = useState(false);
  const { theme } = useGlobalPlayerState();

  const addBlock = (type: ArticleBlock['type']) => {
    const newBlock: ArticleBlock = {
      id: Math.random().toString(36).substr(2, 9),
      type,
      content: '',
      layout: type === 'IMAGE' ? 'CENTER' : 'FULL'
    };
    setBlocks([...blocks, newBlock]);
  };

  const updateBlock = (id: string, updates: Partial<ArticleBlock>) => {
    setBlocks(blocks.map(b => b.id === id ? { ...b, ...updates } : b));
  };

  const removeBlock = (id: string) => {
    setBlocks(blocks.filter(b => b.id !== id));
  };

  const moveBlock = (index: number, direction: 'UP' | 'DOWN') => {
    const newBlocks = [...blocks];
    const targetIndex = direction === 'UP' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= blocks.length) return;
    [newBlocks[index], newBlocks[targetIndex]] = [newBlocks[targetIndex], newBlocks[index]];
    setBlocks(newBlocks);
  };

  const handleFileUpload = async (blockId: string, file: File) => {
    try {
      const url = await uploadFile(`articles/${user.uid}/${blockId}_${file.name}`, file);
      updateBlock(blockId, { content: url });
    } catch (error) {
      console.error("Upload failed:", error);
    }
  };

  // ── Aria co-author wiring ────────────────────────────────────────────────────
  // Publishes what the writer is doing + the edits Aria may make, so she can act
  // as a genuine co-author from her chat panel. See services/aria/ariaContext.ts.
  const newId = () => Math.random().toString(36).substr(2, 9);
  const ariaPlainText = blocks
    .filter(b => b.type === 'TEXT' || b.type === 'HEADING' || b.type === 'QUOTE')
    .map(b => (b.type === 'HEADING' ? `# ${b.content}` : b.content))
    .filter(Boolean)
    .join('\n\n');
  const ariaWordCount = ariaPlainText.trim() ? ariaPlainText.trim().split(/\s+/).length : 0;

  useAriaSurface({
    surface: 'article-editor',
    domain: 'writing',
    title: `Editing article: ${title || 'Untitled'}`,
    summary: `${blocks.length} block(s), ~${ariaWordCount} words${subtitle ? `; subtitle "${subtitle}"` : ''}. You are co-authoring with the writer — continue, tighten, or restructure the piece in their voice. This is a journalism tool: never invent facts, quotes or sources; you can propose headline variants, pick a Tela layout, and flag claims for the writer to fact-check (you cannot verify them).`,
    documentText: ariaPlainText,
    data: {
      articleTitle: title,
      subtitle,
      wordCount: ariaWordCount,
      templateId,
      availableTemplates: [...templates.ARTICLE, ...templates.MAGAZINE].slice(0, 24).map(t => ({ id: t.id, name: t.name })),
      checkableClaimCount: detectCheckableClaims(ariaPlainText).length,
      headlineVariants: makeVariants(title, { subtitle }).map(v => v.text).slice(0, 4),
      blocks: blocks.map(b => ({ id: b.id, type: b.type, preview: (b.content || '').slice(0, 120) })),
    },
    actions: [
      { id: 'appendParagraph', label: 'Add paragraph(s)',
        description: 'Append one or more finished paragraphs of prose to the end of the article. Separate multiple paragraphs with a blank line.',
        params: { text: "the full prose to add, written in the author's voice" } },
      { id: 'insertHeading', label: 'Add a heading',
        description: 'Append a section heading to the article.',
        params: { text: 'the heading text' } },
      { id: 'rewriteBlock', label: 'Rewrite a block',
        description: 'Replace the entire text of one existing block. Use a blockId from the STRUCTURED STATE blocks list.',
        params: { blockId: 'id of the block to replace', text: 'the new full text for that block' } },
      { id: 'setTitle', label: 'Set the title',
        description: 'Set or replace the article title.',
        params: { text: 'the new title' } },
      { id: 'setSubtitle', label: 'Set the subtitle',
        description: 'Set or replace the article subtitle / deck.',
        params: { text: 'the new subtitle' } },
      { id: 'suggestHeadlines', label: 'Propose headline variants',
        description: 'Offer alternative headlines in the Headline tab. Use only facts stated in the article, sentence case, under 70 characters. The writer chooses; nothing is replaced.',
        params: { variants: 'headline alternatives, one per line' } },
      { id: 'pickTemplate', label: 'Choose the Tela layout template',
        description: 'Select an article layout from the Tela template gallery by id or name. Use an empty string for the built-in masthead.',
        params: { template: 'template id or name' } },
      { id: 'flagClaims', label: 'Flag claims for fact-checking',
        description: 'Add sentences from the article to the fact-check list as UNVERIFIED. You can never mark a claim verified; only the human journalist can.',
        params: { claims: 'exact sentences from the article, one per line' } },
      { id: 'openDesk', label: 'Open the journalist tools',
        description: 'Open the publish / style / headline / fact-check drawer.',
        params: { tab: 'publish | style | headline | facts' } },
    ],
    handlers: track({
      appendParagraph: ({ text }) => {
        const paras = String(text ?? '').split(/\n{2,}/).map(s => s.trim()).filter(Boolean);
        if (!paras.length) return { ok: false, message: 'No text to add.' };
        setBlocks(prev => [
          ...prev,
          ...paras.map(p => ({ id: newId(), type: 'TEXT' as const, content: p, layout: 'FULL' as const })),
        ]);
        return { ok: true, message: `Added ${paras.length} paragraph${paras.length > 1 ? 's' : ''}.` };
      },
      insertHeading: ({ text }) => {
        const t = String(text ?? '').trim();
        if (!t) return { ok: false, message: 'No heading text.' };
        setBlocks(prev => [...prev, { id: newId(), type: 'HEADING' as const, content: t, layout: 'FULL' as const }]);
        return { ok: true, message: 'Added a heading.' };
      },
      rewriteBlock: ({ blockId, text }) => {
        const id = String(blockId ?? '');
        const t = String(text ?? '');
        let found = false;
        setBlocks(prev => {
          found = prev.some(b => b.id === id);
          return found ? prev.map(b => (b.id === id ? { ...b, content: t } : b)) : prev;
        });
        return found ? { ok: true, message: 'Rewrote the block.' } : { ok: false, message: 'No block with that id.' };
      },
      setTitle: ({ text }) => { setTitle(String(text ?? '')); return { ok: true, message: 'Updated the title.' }; },
      setSubtitle: ({ text }) => { setSubtitle(String(text ?? '')); return { ok: true, message: 'Updated the subtitle.' }; },
      suggestHeadlines: ({ variants }) => {
        const list = String(variants ?? '').split(/\n+/).map(v => v.replace(/^[-*\d.)\s]+/, '').trim()).filter(Boolean).slice(0, 8);
        if (!list.length) return { ok: false, message: 'No headline variants given.' };
        setAriaHeadlines(list); setDeskTab('headline'); setDeskOpen(true);
        return { ok: true, message: `Put ${list.length} headline variants in the Headline tab for the writer to choose.` };
      },
      pickTemplate: ({ template }) => {
        const all = [...templates.ARTICLE, ...templates.MAGAZINE];
        const q = String(template ?? '').trim().toLowerCase();
        if (!q) { setTemplateId(''); return { ok: true, message: 'Using the built-in masthead.' }; }
        const hit = all.find(t => t.id.toLowerCase() === q || t.name.toLowerCase() === q) || all.find(t => t.name.toLowerCase().includes(q));
        if (!hit) return { ok: false, message: all.length ? `No template matches. Available: ${all.slice(0, 12).map(t => t.name).join(', ')}.` : 'There are no article templates in the Tela gallery yet.' };
        setTemplateId(hit.id); return { ok: true, message: `Layout set to "${hit.name}".` };
      },
      flagClaims: ({ claims: list }) => {
        const lines = String(list ?? '').split(/\n+/).map(v => v.trim()).filter(Boolean).slice(0, 20);
        if (!lines.length) return { ok: false, message: 'No claims given.' };
        setAriaClaims(lines); setDeskTab('facts'); setDeskOpen(true);
        return { ok: true, message: `Added ${lines.length} claim${lines.length > 1 ? 's' : ''} to the fact-check list, all unverified. The writer must verify them.` };
      },
      openDesk: ({ tab }) => { const t = (['publish', 'style', 'headline', 'facts', 'council'] as const).find(x => x === String(tab)) || 'publish'; setDeskTab(t); setDeskOpen(true); return { ok: true, message: `Opened the ${t} tab.` }; },
    }),
  }, [title, subtitle, blocks, templates, templateId]);

  const deskArticle: Article | null = article ? { ...article, id: savedId || article.id } : stub;
  const currentDraft = () => ({ title, subtitle, coverImage, category: article?.category, tags: article?.tags, blocks });

  const handleSaveDraft = async (): Promise<string | undefined> => {
    if (!title.trim()) { setNotice('Add a headline before saving.'); return undefined; }
    setIsSaving(true); setNotice('');
    try {
      const r = await saveDraft(currentDraft(), deskArticle);
      if (r.ok) { setSavedId(r.articleId); if (!article && r.articleId) setStub({ id: r.articleId, isPublic: false, status: 'DRAFT' } as Article); setNotice(article?.tela?.versionId ? 'Saved as an unpublished working copy. Readers still see the published version.' : 'Draft saved.'); return r.articleId; }
      setNotice(r.error || 'Save failed.');
    } finally { setIsSaving(false); }
    return undefined;
  };

  const handleOpenInTela = async () => {
    const id = await handleSaveDraft();
    if (!id) return;
    const docId = await prepareTelaDoc(currentDraft(), deskArticle ? { ...deskArticle, id } : ({ id } as any), templateId || undefined);
    window.dispatchEvent(new CustomEvent('plajah:openTela', { detail: { docId } }));
  };

  return (
    <div className="min-h-screen bg-[var(--bg-color)] text-[var(--text-primary)] p-6 lg:p-12 pb-32">
      <div className="max-w-4xl mx-auto">
        <header className="flex items-center justify-between mb-12">
          <div className="flex items-center gap-4">
            <button onClick={onCancel} className="p-2 hover:bg-white/10 rounded-full transition-all">
              <X size={24} />
            </button>
            <h1 className="text-2xl font-black uppercase tracking-tighter">
              {article ? 'Edit Article' : 'New Article'}
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setIsPreview(!isPreview)}
              className="px-6 py-2 rounded-full border border-white/10 hover:bg-white/5 transition-all flex items-center gap-2 text-xs font-black uppercase tracking-widest"
            >
              <Eye size={14} /> {isPreview ? 'Editor' : 'Preview'}
            </button>
            <button
              onClick={() => { setDeskTab('style'); setDeskOpen(true); }}
              className="px-5 py-2 rounded-full border border-white/10 hover:bg-white/5 transition-all text-xs font-black uppercase tracking-widest"
            >
              Tools
            </button>
            <button
              onClick={() => void handleSaveDraft()}
              disabled={isSaving}
              className="px-5 py-2 rounded-full border border-white/10 hover:bg-white/5 transition-all flex items-center gap-2 text-xs font-black uppercase tracking-widest disabled:opacity-50"
            >
              {isSaving ? 'Saving...' : <><Save size={14} /> Save draft</>}
            </button>
            <button
              onClick={() => { setDeskTab('publish'); setDeskOpen(true); }}
              className="px-8 py-2 rounded-full bg-[var(--text-primary)] text-[var(--bg-color)] hover:scale-105 transition-all flex items-center gap-2 text-xs font-black uppercase tracking-widest"
            >
              Publish
            </button>
          </div>
        </header>
        {notice && <p role="status" className="mb-6 text-sm text-white/60">{notice}</p>}

        {isPreview ? (
          <div className="prose prose-invert max-w-none">
            {coverImage && (
              <img src={coverImage || null} alt="Cover" className="w-full aspect-video object-cover rounded-[2rem] mb-12" />
            )}
            <h1 className="text-6xl md:text-[12rem] font-black uppercase tracking-tighter text-white leading-[0.8] italic select-none">{title}</h1>
            {subtitle && <p className="text-xl text-white/60 mb-12 font-medium italic">{subtitle}</p>}
            
            <div className="space-y-8">
              {blocks.map(block => (
                <div key={block.id} className="relative">
                  {block.type === 'HEADING' && <h2 className="text-3xl font-black uppercase tracking-tight mt-12 mb-6">{block.content}</h2>}
                  {block.type === 'TEXT' && <p className="text-lg leading-relaxed text-white/80 whitespace-pre-wrap">{block.content}</p>}
                  {block.type === 'QUOTE' && (
                    <blockquote className="border-l-4 border-small-orange pl-8 py-4 my-8">
                      <p className="text-2xl font-medium italic text-white/90">{block.content}</p>
                    </blockquote>
                  )}
                  {block.type === 'IMAGE' && (
                    <div className={`my-8 ${
                      block.layout === 'LEFT' ? 'float-left w-1/2 mr-8 mb-4' : 
                      block.layout === 'RIGHT' ? 'float-right w-1/2 ml-8 mb-4' : 
                      'w-full'
                    }`}>
                      <img src={block.content || 'https://picsum.photos/seed/article/800/450'} className="w-full rounded-2xl shadow-2xl" />
                      {block.caption && <p className="text-[10px] font-bold uppercase tracking-widest text-white/40 mt-3 text-center">{block.caption}</p>}
                    </div>
                  )}
                  {block.type === 'AUDIO' && (
                    <div className="bg-white/5 p-6 rounded-2xl border border-white/10 my-8 flex items-center gap-4">
                      <div className="w-12 h-12 rounded-full bg-small-orange flex items-center justify-center">
                        <Play size={20} fill="white" />
                      </div>
                      <div className="flex-1 h-1 bg-white/10 rounded-full overflow-hidden">
                        <div className="w-1/3 h-full bg-small-orange" />
                      </div>
                    </div>
                  )}
                  {block.type === 'VIDEO' && (
                    <div className="aspect-video bg-black rounded-2xl overflow-hidden border border-white/10 my-8">
                      <video src={block.content || null} controls className="w-full h-full object-cover" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-12">
            {/* Metadata Editor */}
            <section className="space-y-6">
              <div className="relative group aspect-video w-full bg-white/5 rounded-[2.5rem] overflow-hidden border border-white/5 flex flex-col items-center justify-center cursor-pointer hover:bg-white/10 transition-all">
                {coverImage ? (
                  <>
                    <img src={coverImage || null} className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                      <button onClick={() => setCoverImage('')} className="p-3 bg-red-500 rounded-full text-white"><Trash2 size={20} /></button>
                    </div>
                  </>
                ) : (
                  <label className="flex flex-col items-center gap-4 cursor-pointer">
                    <ImageIcon size={48} className="text-white/20" />
                    <span className="text-xs font-black uppercase tracking-widest text-white/40">Upload Cover Image</span>
                    <input 
                      type="file" 
                      className="hidden" 
                      accept="image/*"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const url = await uploadFile(`articles/${user.uid}/cover_${file.name}`, file);
                          setCoverImage(url);
                        }
                      }}
                    />
                  </label>
                )}
              </div>

              <input 
                type="text" 
                placeholder="Article Title" 
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full bg-transparent text-5xl lg:text-7xl font-display font-black tracking-tightest uppercase focus:outline-none placeholder:text-white/10"
              />
              <input 
                type="text" 
                placeholder="Subtitle or short description..." 
                value={subtitle}
                onChange={(e) => setSubtitle(e.target.value)}
                className="w-full bg-transparent text-xl font-medium text-white/60 focus:outline-none placeholder:text-white/10 italic"
              />
            </section>

            {/* Blocks Editor */}
            <div className="space-y-8">
              {blocks.map((block, index) => (
                <motion.div 
                  key={block.id}
                  layout
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="group relative bg-white/5 rounded-[2rem] p-8 border border-white/5 hover:border-white/10 transition-all"
                >
                  <div className="absolute -left-12 top-1/2 -translate-y-1/2 flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => moveBlock(index, 'UP')} className="p-2 hover:bg-white/10 rounded-lg text-white/40 hover:text-white"><MoveUp size={16} /></button>
                    <button onClick={() => moveBlock(index, 'DOWN')} className="p-2 hover:bg-white/10 rounded-lg text-white/40 hover:text-white"><MoveDown size={16} /></button>
                    <button onClick={() => removeBlock(block.id)} className="p-2 hover:bg-red-500/20 rounded-lg text-red-500/40 hover:text-red-500"><Trash2 size={16} /></button>
                  </div>

                  <div className="flex items-center gap-3 mb-6">
                    <div className="p-2 bg-white/10 rounded-lg">
                      {block.type === 'TEXT' && <Type size={16} />}
                      {block.type === 'IMAGE' && <ImageIcon size={16} />}
                      {block.type === 'AUDIO' && <Music size={16} />}
                      {block.type === 'VIDEO' && <VideoIcon size={16} />}
                      {block.type === 'QUOTE' && <Quote size={16} />}
                      {block.type === 'HEADING' && <Heading1 size={16} />}
                    </div>
                    <span className="text-[10px] font-black uppercase tracking-widest text-white/40">{block.type} BLOCK</span>
                    
                    {block.type === 'IMAGE' && (
                      <div className="ml-auto flex items-center gap-2 bg-black/40 p-1 rounded-lg">
                        <button onClick={() => updateBlock(block.id, { layout: 'LEFT' })} className={`p-1.5 rounded-md transition-all ${block.layout === 'LEFT' ? 'bg-white text-black' : 'text-white/40 hover:text-white'}`}><AlignLeft size={14} /></button>
                        <button onClick={() => updateBlock(block.id, { layout: 'CENTER' })} className={`p-1.5 rounded-md transition-all ${block.layout === 'CENTER' ? 'bg-white text-black' : 'text-white/40 hover:text-white'}`}><AlignCenter size={14} /></button>
                        <button onClick={() => updateBlock(block.id, { layout: 'RIGHT' })} className={`p-1.5 rounded-md transition-all ${block.layout === 'RIGHT' ? 'bg-white text-black' : 'text-white/40 hover:text-white'}`}><AlignRight size={14} /></button>
                        <button onClick={() => updateBlock(block.id, { layout: 'FULL' })} className={`p-1.5 rounded-md transition-all ${block.layout === 'FULL' ? 'bg-white text-black' : 'text-white/40 hover:text-white'}`}><Maximize size={14} /></button>
                      </div>
                    )}
                  </div>

                  {block.type === 'TEXT' && (
                    <textarea 
                      placeholder="Write your thoughts..." 
                      value={block.content}
                      onChange={(e) => updateBlock(block.id, { content: e.target.value })}
                      className="w-full bg-transparent text-lg leading-relaxed focus:outline-none resize-none min-h-[100px]"
                    />
                  )}

                  {block.type === 'HEADING' && (
                    <input 
                      type="text"
                      placeholder="Section Heading" 
                      value={block.content}
                      onChange={(e) => updateBlock(block.id, { content: e.target.value })}
                      className="w-full bg-transparent text-3xl font-black uppercase tracking-tight focus:outline-none"
                    />
                  )}

                  {block.type === 'QUOTE' && (
                    <textarea 
                      placeholder="Enter quote..." 
                      value={block.content}
                      onChange={(e) => updateBlock(block.id, { content: e.target.value })}
                      className="w-full bg-transparent text-2xl font-medium italic border-l-2 border-small-orange pl-6 focus:outline-none resize-none"
                    />
                  )}

                  {(block.type === 'IMAGE' || block.type === 'VIDEO' || block.type === 'AUDIO') && (
                    <div className="space-y-4">
                      <div className="relative aspect-video w-full bg-black/40 rounded-2xl overflow-hidden border border-white/5 flex flex-col items-center justify-center">
                        {block.content ? (
                          <>
                            {block.type === 'IMAGE' && <img src={block.content || null} className="w-full h-full object-cover" />}
                            {block.type === 'VIDEO' && <video src={block.content || null} className="w-full h-full object-cover" />}
                            {block.type === 'AUDIO' && (
                              <div className="flex flex-col items-center gap-4">
                                <Music size={48} className="text-small-orange" />
                                <span className="text-xs font-bold text-white/40">Audio Uploaded</span>
                              </div>
                            )}
                            <div className="absolute inset-0 bg-black/40 opacity-0 hover:opacity-100 flex items-center justify-center transition-opacity">
                              <button onClick={() => updateBlock(block.id, { content: '' })} className="p-3 bg-red-500 rounded-full text-white"><Trash2 size={20} /></button>
                            </div>
                          </>
                        ) : (
                          <label className="flex flex-col items-center gap-4 cursor-pointer">
                            <Plus size={32} className="text-white/20" />
                            <span className="text-[10px] font-black uppercase tracking-widest text-white/40">Upload {block.type}</span>
                            <input 
                              type="file" 
                              className="hidden" 
                              accept={block.type === 'IMAGE' ? 'image/*' : block.type === 'VIDEO' ? 'video/*' : 'audio/*'}
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) handleFileUpload(block.id, file);
                              }}
                            />
                          </label>
                        )}
                      </div>
                      {block.type === 'IMAGE' && (
                        <input 
                          type="text" 
                          placeholder="Add a caption..." 
                          value={block.caption}
                          onChange={(e) => updateBlock(block.id, { caption: e.target.value })}
                          className="w-full bg-transparent text-[10px] font-bold uppercase tracking-widest text-white/40 focus:outline-none text-center"
                        />
                      )}
                    </div>
                  )}
                </motion.div>
              ))}
            </div>

            {/* Add Block Controls */}
            <div className="flex flex-wrap items-center justify-center gap-4 py-12 border-t border-white/5">
              <button onClick={() => addBlock('TEXT')} className="flex items-center gap-2 px-6 py-3 bg-white/5 hover:bg-white/10 rounded-full transition-all text-[10px] font-black uppercase tracking-widest"><Type size={14} /> Text</button>
              <button onClick={() => addBlock('HEADING')} className="flex items-center gap-2 px-6 py-3 bg-white/5 hover:bg-white/10 rounded-full transition-all text-[10px] font-black uppercase tracking-widest"><Heading1 size={14} /> Heading</button>
              <button onClick={() => addBlock('IMAGE')} className="flex items-center gap-2 px-6 py-3 bg-white/5 hover:bg-white/10 rounded-full transition-all text-[10px] font-black uppercase tracking-widest"><ImageIcon size={14} /> Image</button>
              <button onClick={() => addBlock('AUDIO')} className="flex items-center gap-2 px-6 py-3 bg-white/5 hover:bg-white/10 rounded-full transition-all text-[10px] font-black uppercase tracking-widest"><Music size={14} /> Audio</button>
              <button onClick={() => addBlock('VIDEO')} className="flex items-center gap-2 px-6 py-3 bg-white/5 hover:bg-white/10 rounded-full transition-all text-[10px] font-black uppercase tracking-widest"><VideoIcon size={14} /> Video</button>
              <button onClick={() => addBlock('QUOTE')} className="flex items-center gap-2 px-6 py-3 bg-white/5 hover:bg-white/10 rounded-full transition-all text-[10px] font-black uppercase tracking-widest"><Quote size={14} /> Quote</button>
            </div>
          </div>
        )}
      </div>
      <ArticleDesk
        open={deskOpen} onClose={() => setDeskOpen(false)} tab={deskTab} setTab={setDeskTab}
        article={deskArticle}
        content={{ title, subtitle, coverImage, category: article?.category, blocks }}
        user={user} templates={templates} templateId={templateId} setTemplateId={setTemplateId}
        aiUsed={aiUsed} claims={claims} setClaims={setClaims} claimKey={savedId || article?.id || draftKey}
        ariaHeadlines={ariaHeadlines} ariaClaims={ariaClaims}
        onPickHeadline={setTitle} onBlocksChange={setBlocks}
        onSaveDraft={handleSaveDraft} onOpenInTela={handleOpenInTela}
        onPublished={(r) => { if (r.articleId) onSave(r.articleId, title); }}
      />
    </div>
  );
};

export default ArticleEditor;
