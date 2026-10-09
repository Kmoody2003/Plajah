import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, FileText, Rocket, X } from 'lucide-react';
import { Button, Chip, Input, Surface, Textarea } from '../ui';
import type { Article, ArticleBlock, UserProfile } from '../../types';
import { articlePlainText, locateInBlocks } from '../../services/journalist/articleTela';
import { EMPTY_DISCLOSURES, isLiveArticle, publishArticle, type ArticleTemplateCatalog, type PublishResult } from '../../services/journalist/articleService';
import { appendNotice, classifyEdit, NOTICE_LABELS, NOTICE_ORDER } from '../../services/journalist/correctionLog';
import { evaluatePublishGate } from '../../services/journalist/publishGate';
import type { ArticleDisclosures, ArticleNotice, Claim, ImageRights, NoticeLabel, Publication } from '../../services/journalist/types';
import type { StyleIssue } from '../../services/journalist/styleChecker';
import StyleHeadlinePanel from './StyleHeadlinePanel';
import FactCheckBench from './FactCheckBench';
import { useNewsroomList } from './useNewsroom';
import EditorialCouncilPanel from '../editorial/council/EditorialCouncilPanel';
import { articleToManuscript } from '../../services/editorial/council/editorialAdapters';

export type DeskTab = 'publish' | 'style' | 'headline' | 'facts' | 'council';

const LICENSES: Array<{ v: ImageRights['license']; label: string }> = [
  { v: 'OWNED', label: 'I own it / I made it' }, { v: 'LICENSED', label: 'Licensed (agency / stock)' }, { v: 'CC_BY', label: 'Creative Commons BY' },
  { v: 'CC_BY_SA', label: 'Creative Commons BY-SA' }, { v: 'CC0', label: 'CC0 / public dedication' }, { v: 'PUBLIC_DOMAIN', label: 'Public domain' },
  { v: 'EDITORIAL_USE', label: 'Editorial-use permission' }, { v: 'FAIR_USE_CLAIMED', label: 'Fair use (my claim, not a license)' }, { v: 'AI_GENERATED', label: 'AI-generated image' },
];

interface Props {
  open: boolean; onClose: () => void; tab: DeskTab; setTab: (t: DeskTab) => void;
  article?: Article | null;
  content: { title: string; subtitle: string; coverImage: string; category?: string; blocks: ArticleBlock[] };
  user: UserProfile;
  templates: ArticleTemplateCatalog;
  templateId: string; setTemplateId: (id: string) => void;
  aiUsed: boolean;
  claims: Claim[]; setClaims: (c: Claim[]) => void; claimKey: string;
  ariaHeadlines: string[]; ariaClaims: string[];
  onPickHeadline: (h: string) => void;
  onBlocksChange: (blocks: ArticleBlock[]) => void;
  onSaveDraft: () => Promise<string | undefined>;
  onOpenInTela: () => Promise<void>;
  onPublished: (r: PublishResult) => void;
}

export const ArticleDesk: React.FC<Props> = (p) => {
  const { article, content, templates } = p;
  const live = isLiveArticle(article);
  const [disclosures, setDisclosures] = useState<ArticleDisclosures>({ ...EMPTY_DISCLOSURES, ...(article?.disclosures || {}) });
  const [rights, setRights] = useState<ImageRights[]>((article?.imageRights as ImageRights[]) || []);
  const [embargo, setEmbargo] = useState(article?.embargoUntil ? new Date(article.embargoUntil - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '');
  const [publicationId, setPublicationId] = useState(article?.publicationId || '');
  const [section, setSection] = useState(article?.section || '');
  const [access, setAccess] = useState<'FREE' | 'SUBSCRIBERS'>(article?.access === 'SUBSCRIBERS' ? 'SUBSCRIBERS' : 'FREE');
  const [noticeLabel, setNoticeLabel] = useState<NoticeLabel>('CORRECTION');
  const [noticeText, setNoticeText] = useState('');
  const [source, setSource] = useState<'blocks' | 'tela'>('blocks');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<PublishResult | null>(null);
  const pubs = useNewsroomList<Publication>('publications');
  const [showMag, setShowMag] = useState(false);

  useEffect(() => { if (article?.disclosures) setDisclosures({ ...EMPTY_DISCLOSURES, ...article.disclosures }); }, [article?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const bodyText = useMemo(() => articlePlainText(content.blocks), [content.blocks]);
  const imageRefs = useMemo(() => [...(content.coverImage ? ['cover'] : []), ...content.blocks.filter(b => b.type === 'IMAGE' && b.content).map(b => b.id)], [content.coverImage, content.blocks]);
  const rightFor = (ref: string): ImageRights => rights.find(r => r.ref === ref) || { ref, credit: '', license: '' as any };
  const setRight = (ref: string, patch: Partial<ImageRights>) => setRights(prev => (prev.some(r => r.ref === ref) ? prev.map(r => (r.ref === ref ? { ...r, ...patch } : r)) : [...prev, { ...rightFor(ref), ...patch }]));

  const publishedText = article && live ? (article.bodyText ?? articlePlainText(article.blocks || [])) : undefined;
  const edit = publishedText !== undefined ? classifyEdit(publishedText, bodyText) : null;
  const prior = (article?.notices as ArticleNotice[] | undefined) || [];
  const nextNotices = useMemo(() => {
    if (!noticeText.trim() || noticeText.trim().length < 8) return prior;
    try { return appendNotice(prior, { label: noticeLabel, text: noticeText, byUid: p.user.uid, byName: p.user.displayName || 'Editor' }); } catch { return prior; }
  }, [noticeText, noticeLabel, prior, p.user.uid, p.user.displayName]);
  const embargoMs = embargo ? new Date(embargo).getTime() : undefined;

  const gate = useMemo(() => evaluatePublishGate({
    title: content.title, bodyText, imageRefs, rights, disclosures, aiUsedInEditor: p.aiUsed, claims: p.claims, embargoUntil: embargoMs,
    ...(publishedText !== undefined ? { publishedText, priorNotices: prior, nextNotices } : {}),
  }), [content.title, bodyText, imageRefs, rights, disclosures, p.aiUsed, p.claims, embargoMs, publishedText, prior, nextNotices]);

  const applyFix = (i: StyleIssue) => {
    const loc = locateInBlocks(content.blocks, i.start, i.end);
    if (!loc || i.suggestion === undefined) return;
    p.onBlocksChange(content.blocks.map(b => (b.id === loc.blockId ? { ...b, content: b.content.slice(0, loc.start) + i.suggestion + b.content.slice(loc.end) } : b)));
  };

  const publish = async () => {
    setBusy(true); setResult(null);
    const r = await publishArticle({
      articleId: article?.id, title: content.title, subtitle: content.subtitle, coverImage: content.coverImage, category: content.category, blocks: content.blocks,
      templateId: p.templateId || undefined, disclosures, rights: rights.filter(r => imageRefs.includes(r.ref)), claims: p.claims, embargoUntil: embargoMs,
      publicationId: publicationId || undefined, section: section || undefined, access, aiUsedInEditor: p.aiUsed, source,
      notice: noticeText.trim() ? { label: noticeLabel, text: noticeText } : undefined,
    }, article);
    setBusy(false); setResult(r);
    if (r.ok) p.onPublished(r);
  };

  if (!p.open) return null;
  const tabs: Array<[DeskTab, string]> = [['publish', 'Publish'], ['style', 'Style'], ['headline', 'Headline'], ['facts', 'Fact-check'], ['council', 'Council review']];
  const catalog = [...templates.ARTICLE];
  const noTemplates = catalog.length === 0;

  return (
    <aside role="dialog" aria-label="Journalist tools" className="fixed inset-y-0 right-0 z-[120] w-full sm:w-[460px] flex flex-col shadow-2xl border-l"
      style={{ background: 'var(--card-bg, #14110d)', borderColor: 'var(--pj-border, rgba(255,255,255,.12))', backdropFilter: 'var(--blur-lg, blur(24px))' }}>
      <div className="flex items-center gap-2 p-3 border-b" style={{ borderColor: 'var(--pj-border, rgba(255,255,255,.12))' }}>
        <div className="flex gap-1 overflow-x-auto no-scrollbar flex-1">
          {tabs.map(([id, label]) => <Chip key={id} interactive selected={p.tab === id} onClick={() => p.setTab(id)}>{label}</Chip>)}
        </div>
        <Button variant="ghost" size="sm" iconOnly aria-label="Close tools" onClick={p.onClose}><X /></Button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-5">
        {p.tab === 'style' && <StyleHeadlinePanel text={bodyText} headline={content.title} subtitle={content.subtitle} onReplace={applyFix} onPickHeadline={p.onPickHeadline} />}
        {p.tab === 'headline' && <StyleHeadlinePanel text={bodyText} headline={content.title} subtitle={content.subtitle} onPickHeadline={p.onPickHeadline} extraVariants={p.ariaHeadlines} />}
        {p.tab === 'council' && (
          <EditorialCouncilPanel label="Ask the editors about this piece" getManuscript={() => articleToManuscript({ title: content.title, text: bodyText, disclosures, rights, imageRefs, claims: p.claims, aiUsed: p.aiUsed, notices: prior.length })} />
        )}
        {p.tab === 'facts' && <FactCheckBench articleId={p.claimKey} articleText={bodyText} onClaims={p.setClaims} incoming={p.ariaClaims} />}

        {p.tab === 'publish' && (
          <>
            <section className="flex flex-col gap-2">
              <h3 className="pj-eyebrow">Layout template (Tela)</h3>
              {noTemplates && <p className="text-xs rounded-xl p-2" style={{ background: 'rgba(255,255,255,.05)', color: 'var(--on-surface-variant)' }}>No article templates are in the Tela gallery yet, so this article uses the built-in masthead. When article templates are added they appear here automatically.</p>}
              <div className="grid grid-cols-2 gap-2">
                <TemplateCard label="Built-in masthead" palette={['#FBF8F2', '#16130F', '#B3261E']} selected={!p.templateId} onClick={() => p.setTemplateId('')} />
                {catalog.map(t => <TemplateCard key={t.id} label={t.name} palette={t.palette} selected={p.templateId === t.id} onClick={() => p.setTemplateId(t.id)} />)}
              </div>
              {templates.MAGAZINE.length > 0 && (
                <>
                  <button type="button" className="text-xs underline self-start opacity-70" onClick={() => setShowMag(s => !s)}>{showMag ? 'Hide' : 'Show'} magazine page styles ({templates.MAGAZINE.length})</button>
                  {showMag && <div className="grid grid-cols-2 gap-2">{templates.MAGAZINE.map(t => <TemplateCard key={t.id} label={t.name} palette={t.palette} selected={p.templateId === t.id} onClick={() => p.setTemplateId(t.id)} />)}</div>}
                </>
              )}
              <div className="pj-actions">
                <Button size="sm" variant="secondary" icon={<FileText />} onClick={() => void p.onOpenInTela()}>Fine-tune layout in Tela</Button>
              </div>
              {article?.id && (
                <div className="flex gap-2 text-xs items-center">Publish from:
                  <Chip interactive selected={source === 'blocks'} onClick={() => setSource('blocks')}>Block editor (rebuilds layout)</Chip>
                  <Chip interactive selected={source === 'tela'} onClick={() => setSource('tela')}>My Tela edits</Chip>
                </div>
              )}
              {source === 'tela' && <p className="text-xs" style={{ color: '#FF8C00' }}>Publishes the Tela document on this device as you left it. The block editor's text is ignored for the published layout.</p>}
            </section>

            <section className="flex flex-col gap-2">
              <h3 className="pj-eyebrow">Images: credit and rights (required)</h3>
              {imageRefs.length === 0 && <p className="text-xs opacity-60">No images in this article.</p>}
              {imageRefs.map(ref => {
                const r = rightFor(ref);
                const label = ref === 'cover' ? 'Cover image' : `Image: ${(content.blocks.find(b => b.id === ref)?.caption || ref).slice(0, 30)}`;
                return (
                  <Surface key={ref} level={1} className="flex flex-col gap-2 !p-3">
                    <p className="text-xs font-semibold">{label}</p>
                    <Input label="Credit line" placeholder="Photo by Jo Smith / The Eastside Dispatch" value={r.credit} onChange={e => setRight(ref, { credit: e.target.value })} />
                    <label className="flex flex-col gap-1 text-sm">Rights basis
                      <select className="pj-input" value={r.license || ''} onChange={e => setRight(ref, { license: e.target.value as any })}>
                        <option value="">Choose...</option>
                        {LICENSES.map(l => <option key={l.v} value={l.v}>{l.label}</option>)}
                      </select>
                    </label>
                    <Input label="Source / license link" placeholder="https://" value={r.sourceUrl || ''} onChange={e => setRight(ref, { sourceUrl: e.target.value })} />
                  </Surface>
                );
              })}
              <p className="text-[11px] opacity-60">Plajah records what you tell it here. It does not check licenses or detect copyright.</p>
            </section>

            <section className="flex flex-col gap-2">
              <h3 className="pj-eyebrow">Disclosures (shown to readers)</h3>
              <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={disclosures.aiAssisted} onChange={e => setDisclosures({ ...disclosures, aiAssisted: e.target.checked })} /><span>AI was used in this article{p.aiUsed && !disclosures.aiAssisted ? <em className="text-xs" style={{ color: '#FF8C00' }}> (Aria edited this draft)</em> : null}</span></label>
              {disclosures.aiAssisted && <Input label="How AI was used" placeholder="Aria suggested the headline and tightened two paragraphs; all facts were checked by the reporter." value={disclosures.aiNote || ''} onChange={e => setDisclosures({ ...disclosures, aiNote: e.target.value })} />}
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={disclosures.sponsored} onChange={e => setDisclosures({ ...disclosures, sponsored: e.target.checked })} /> Sponsored / paid content</label>
              {disclosures.sponsored && <Input label="Sponsor" value={disclosures.sponsorName || ''} onChange={e => setDisclosures({ ...disclosures, sponsorName: e.target.value })} />}
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={disclosures.affiliateLinks} onChange={e => setDisclosures({ ...disclosures, affiliateLinks: e.target.checked })} /> Contains affiliate links</label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={disclosures.conflictOfInterest} onChange={e => setDisclosures({ ...disclosures, conflictOfInterest: e.target.checked })} /> I have a conflict of interest</label>
              {disclosures.conflictOfInterest && <Textarea label="Describe it plainly" rows={2} value={disclosures.conflictNote || ''} onChange={e => setDisclosures({ ...disclosures, conflictNote: e.target.value })} />}
            </section>

            <section className="flex flex-col gap-2">
              <h3 className="pj-eyebrow">Placement and timing</h3>
              <label className="flex flex-col gap-1 text-sm">Publication
                <select className="pj-input" value={publicationId} onChange={e => { setPublicationId(e.target.value); setSection(''); }}>
                  <option value="">My own byline page</option>
                  {pubs.items.map(pb => <option key={pb.id} value={pb.id}>{pb.name}</option>)}
                </select>
              </label>
              {publicationId && (
                <label className="flex flex-col gap-1 text-sm">Section
                  <select className="pj-input" value={section} onChange={e => setSection(e.target.value)}>
                    <option value="">None</option>
                    {(pubs.items.find(pb => pb.id === publicationId)?.sections || []).map(s => <option key={s}>{s}</option>)}
                  </select>
                </label>
              )}
              <div className="flex gap-2 text-sm items-center">Reader access:
                <Chip interactive selected={access === 'FREE'} onClick={() => setAccess('FREE')}>Free</Chip>
                <Chip interactive selected={access === 'SUBSCRIBERS'} onClick={() => setAccess('SUBSCRIBERS')}>Subscribers</Chip>
              </div>
              <Input label="Embargo / schedule (your local time)" type="datetime-local" value={embargo} onChange={e => setEmbargo(e.target.value)} hint="Held privately until then. There is no background clock: it goes live the next time the desk or a feed is opened after this time." />
            </section>

            {live && (
              <section className="flex flex-col gap-2">
                <h3 className="pj-eyebrow">This article is live: public notice</h3>
                {edit?.changed && <p className="text-xs flex gap-2" style={{ color: '#FF8C00' }}><AlertTriangle size={13} className="shrink-0" />The text changed ({edit.level}: +{edit.addedWords} / -{edit.removedWords} words). Readers must be told.</p>}
                <div className="flex flex-wrap gap-2">
                  {NOTICE_ORDER.map(l => <Chip key={l} interactive selected={noticeLabel === l} onClick={() => { setNoticeLabel(l); if (!noticeText) setNoticeText(NOTICE_LABELS[l].prefix + ' '); }}>{NOTICE_LABELS[l].heading}</Chip>)}
                </div>
                <Textarea label="Notice (public, dated, with your name)" rows={3} value={noticeText} onChange={e => setNoticeText(e.target.value)} />
                <p className="text-[11px] opacity-60">The earlier text stays readable from the notice. Notices cannot be edited or deleted later.</p>
              </section>
            )}

            <section className="flex flex-col gap-2">
              {gate.blockers.map(b => <p key={b} className="text-sm flex gap-2" style={{ color: 'var(--pj-danger)' }}><AlertTriangle size={14} className="shrink-0 mt-0.5" />{b}</p>)}
              {gate.warnings.map(w => <p key={w} className="text-xs flex gap-2" style={{ color: '#FF8C00' }}><AlertTriangle size={12} className="shrink-0 mt-0.5" />{w}</p>)}
              {gate.canPublish && gate.blockers.length === 0 && <p className="text-xs flex gap-2" style={{ color: 'var(--pj-success)' }}><Check size={13} />Ready.</p>}
              {result && !result.ok && <p role="alert" className="text-sm" style={{ color: 'var(--pj-danger)' }}>{result.error}</p>}
              {result?.ok && <p role="status" className="text-sm" style={{ color: 'var(--pj-success)' }}>{result.status === 'SCHEDULED' ? 'Scheduled. It stays private until the embargo passes.' : 'Published as a frozen Tela version.'}</p>}
              <div className="pj-actions">
                <Button variant="secondary" onClick={() => void p.onSaveDraft()}>Save draft</Button>
                <Button variant="primary" icon={<Rocket />} loading={busy} disabled={!gate.canPublish} onClick={publish}>
                  {gate.action === 'SCHEDULE' ? 'Schedule' : live ? (noticeText.trim() ? `Publish ${NOTICE_LABELS[noticeLabel].heading.toLowerCase()}` : 'Publish update') : 'Publish'}
                </Button>
              </div>
            </section>
          </>
        )}
      </div>
    </aside>
  );
};

const TemplateCard: React.FC<{ label: string; palette: string[]; selected: boolean; onClick: () => void }> = ({ label, palette, selected, onClick }) => (
  <button type="button" onClick={onClick} aria-pressed={selected} className="text-left rounded-xl p-2 border flex flex-col gap-2" style={{ borderColor: selected ? 'var(--pj-cyan, #00DAF3)' : 'var(--pj-border, rgba(255,255,255,.12))', background: selected ? 'rgba(0,218,243,.08)' : 'transparent' }}>
    <div className="flex h-6 rounded overflow-hidden">{palette.slice(0, 4).map((c, i) => <span key={i} className="flex-1" style={{ background: c }} />)}</div>
    <span className="text-xs font-semibold">{label}</span>
  </button>
);

export default ArticleDesk;
