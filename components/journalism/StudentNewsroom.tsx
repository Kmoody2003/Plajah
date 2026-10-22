/**
 * StudentNewsroom — where School of Journalism lessons become reporting.
 *
 * Pick a band and a story kit, report into the kit's fields, and the coach (studentDesk.coach)
 * reads along with the pro desk's linters turned to the right volume for the reporter's age.
 * Stories move Drafting → Peer edit → Teacher review → Approved; the Press Room distributes them.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Check, ChevronRight, Image as ImageIcon, Lightbulb, Plus, ShieldAlert, Sparkles, Trash2, UserCheck, Undo2 } from 'lucide-react';
import type { DepthLevel } from '../../services/dossier/dossierTypes';
import { BAND_LABEL, STORY_KITS, kitById, kitsForBand, type KitField, type StoryKit } from '../../services/journalismSchool/storyKits';
import {
  STAGE_LABEL, STAGE_ORDER, advance, applyTeacherReview, canAdvance, coach, markTurnedIn, newQuote, newSource, newStory, safetyReview, sendBack, signOff,
  storyText, wordCount, type StudentStory,
} from '../../services/journalismSchool/studentDesk';
import { getBand, setBand as persistBand, useStories } from '../../services/journalismSchool/newsroomStore';
import type { TemplateAssignment } from '../../services/assignmentTemplateService';

export const JR_ACCENT = '#E8553E';
const BANDS: DepthLevel[] = ['early', 'elementary', 'middle', 'high', 'university'];

export interface NewsroomViewer { id: string; name: string; isMinor: boolean; isChildAccount: boolean }

interface Props {
  viewer: NewsroomViewer;
  initialKitId?: string;
  initialStoryId?: string;
  /** The Academia assignment that opened the newsroom — preselected at turn-in. */
  initialAssignmentId?: string;
  onOpenLesson?: (lessonId: string) => void;
  onOpenExhibitRoom?: (roomId: string) => void;
  onOpenPress?: () => void;
}

const FIELD_LABEL: Record<KitField, string> = {
  picture: 'Picture', caption: 'Caption', fiveWs: 'The 5 Ws and How', lede: 'Lede', quotes: 'Quotes', sources: 'Sources',
  dek: 'Dek (one-line summary)', counterpoint: 'The strongest counterargument', script: 'Script', records: 'Records', plan: 'Plan', data: 'Numbers',
};

const inputCls = 'w-full rounded-xl border border-[#d9cfbd] bg-white/80 px-3 py-2.5 text-[15px] text-[#1a1612] placeholder:text-[#a2988a] focus:outline-none focus:ring-2 focus:ring-[#E8553E]/50';
const label = 'block text-[10px] font-black uppercase tracking-[0.16em] text-[#8a3324] mb-1.5';

const StudentNewsroom: React.FC<Props> = ({ viewer, initialKitId, initialStoryId, initialAssignmentId, onOpenLesson, onOpenExhibitRoom, onOpenPress }) => {
  const { stories, save, remove } = useStories(viewer.id);
  const [band, setBandState] = useState<DepthLevel>(() => getBand());
  const [openId, setOpenId] = useState<string | null>(initialStoryId || null);
  const started = useRef(false);

  const setBand = (b: DepthLevel) => { setBandState(b); persistBand(b); };

  const startKit = (kit: StoryKit) => {
    const b = kit.bands.includes(band) ? band : kit.bands[0];
    const s = { ...newStory(kit, b, { id: viewer.id, name: viewer.name }), ...(initialAssignmentId ? { assignmentId: initialAssignmentId } : {}) };
    save(s); setOpenId(s.id);
  };

  // A lesson or the Writers Desk asked for a specific kit: start one fresh, once.
  useEffect(() => {
    if (started.current || !initialKitId) return;
    started.current = true;
    const kit = kitById(initialKitId);
    if (kit) { if (!kit.bands.includes(band)) setBand(kit.bands[0]); startKit(kit); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialKitId]);

  // Teacher decisions made from their own account land here and update the local story.
  const storiesRef = useRef(stories); storiesRef.current = stories;
  useEffect(() => {
    if (!viewer.id || viewer.id === 'guest') return;
    let stop = () => {};
    let alive = true;
    import('../../services/journalismSchool/newsroomReview').then(m => {
      if (!alive) return;
      stop = m.watchMyNewsroomSubmissions(viewer.id, subs => {
        for (const st of storiesRef.current) {
          const sub = st.submission && subs.find(x => x.id === st.submission!.id);
          if (!sub) continue;
          const next = applyTeacherReview(st, sub);
          if (next !== st) save(next);
        }
      });
    }).catch(() => { /* no Firebase (dev lab) */ });
    return () => { alive = false; stop(); };
  }, [viewer.id, save]);

  const open = stories.find(s => s.id === openId) || null;
  if (open) {
    return <StoryEditor story={open} viewer={viewer} onChange={save} onClose={() => setOpenId(null)} onDelete={() => { remove(open.id); setOpenId(null); }}
      onOpenLesson={onOpenLesson} onOpenExhibitRoom={onOpenExhibitRoom} onOpenPress={onOpenPress} />;
  }

  const kits = kitsForBand(band);
  return (
    <div className="space-y-8">
      <div>
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40 mb-2">Your band</p>
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
          {BANDS.map(b => (
            <button key={b} type="button" onClick={() => setBand(b)}
              className={`shrink-0 rounded-full px-4 py-2 text-xs font-black uppercase tracking-wider min-h-[40px] transition-all ${band === b ? 'text-[#1a0d08]' : 'bg-white/[0.05] text-white/60 hover:text-white'}`}
              style={band === b ? { background: JR_ACCENT } : undefined}>
              {BAND_LABEL[b]}
            </button>
          ))}
        </div>
      </div>

      <section>
        <h3 className="text-sm font-black uppercase tracking-widest text-white/80 mb-3">Start a story</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {kits.map(k => (
            <button key={k.id} type="button" onClick={() => startKit(k)} data-kit={k.id}
              className="group text-left rounded-3xl border border-[#d9cfbd]/20 bg-[#f6f0e3] p-5 text-[#1a1612] hover:-translate-y-0.5 hover:shadow-[0_10px_30px_rgba(232,85,62,0.25)] transition-all">
              <div className="flex items-center justify-between">
                <span className="text-3xl">{k.emoji}</span>
                <span className="rounded-full border border-[#d9cfbd] px-2 py-0.5 text-[10px] font-bold text-[#6b6258]">{k.words[0]}–{k.words[1]} words</span>
              </div>
              <h4 className="mt-3 font-serif text-xl font-bold leading-tight">{k.title}</h4>
              <p className="mt-1 text-[13px] leading-relaxed text-[#4a4238]">{k.pitch}</p>
              <span className="mt-3 inline-flex items-center gap-1 text-[11px] font-black uppercase tracking-wider" style={{ color: JR_ACCENT }}>
                <Plus size={13} /> New {k.title.toLowerCase()}
              </span>
            </button>
          ))}
        </div>
      </section>

      <section>
        <h3 className="text-sm font-black uppercase tracking-widest text-white/80 mb-3">My stories ({stories.length})</h3>
        {stories.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-white/15 p-6 text-sm text-white/50">No stories yet. Pick a kit above — every lesson’s assignment opens one too.</p>
        ) : (
          <ul className="divide-y divide-white/10 rounded-2xl border border-white/10 bg-white/[0.02]">
            {stories.map(s => {
              const k = kitById(s.kitId);
              return (
                <li key={s.id}>
                  <button type="button" onClick={() => setOpenId(s.id)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.04] min-h-[56px]">
                    <span className="text-xl">{k?.emoji || '📰'}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-bold text-white">{s.headline || s.caption || `Untitled ${k?.title.toLowerCase() || 'story'}`}</span>
                      <span className="block text-[11px] text-white/45">{k?.title} · {BAND_LABEL[s.band]} · {wordCount(storyText(s))} words</span>
                    </span>
                    <StagePill stage={s.stage} />
                    <ChevronRight size={16} className="text-white/30" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
};

const StagePill: React.FC<{ stage: StudentStory['stage'] }> = ({ stage }) => (
  <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${stage === 'PUBLISHED' ? 'bg-emerald-400/15 text-emerald-300' : stage === 'APPROVED' ? 'bg-sky-400/15 text-sky-300' : stage === 'REVIEW' ? 'bg-amber-400/15 text-amber-300' : 'bg-white/10 text-white/60'}`}>
    {STAGE_LABEL[stage]}
  </span>
);

// ── Editor ────────────────────────────────────────────────────────────────────
interface EditorProps {
  story: StudentStory; viewer: NewsroomViewer;
  onChange: (s: StudentStory) => void; onClose: () => void; onDelete: () => void;
  onOpenLesson?: (lessonId: string) => void; onOpenExhibitRoom?: (roomId: string) => void; onOpenPress?: () => void;
}

const StoryEditor: React.FC<EditorProps> = ({ story, viewer, onChange, onClose, onDelete, onOpenLesson, onOpenExhibitRoom, onOpenPress }) => {
  const kit = kitById(story.kitId) || STORY_KITS[0];
  const young = story.band === 'early';
  const ctx = { authorIsMinor: viewer.isMinor };
  const notes = useMemo(() => coach(story), [story]);
  const safety = useMemo(() => safetyReview(story, ctx), [story, ctx.authorIsMinor]); // eslint-disable-line react-hooks/exhaustive-deps
  const gate = canAdvance(story, ctx);
  const [signer, setSigner] = useState('');
  const [sendNote, setSendNote] = useState('');
  const set = (patch: Partial<StudentStory>) => onChange({ ...story, ...patch, updatedAt: Date.now() });
  const locked = story.stage === 'REVIEW' || story.stage === 'APPROVED' || story.stage === 'PUBLISHED';
  const has = (f: KitField) => kit.fields.includes(f);

  const onPicture = (file: File | undefined) => {
    if (!file) return;
    const img = new Image(); const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, 900 / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
      set({ picture: c.toDataURL('image/jpeg', 0.82) }); URL.revokeObjectURL(url);
    };
    img.src = url;
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6">
      <div className="rounded-3xl bg-[#f6f0e3] text-[#1a1612] p-5 sm:p-8 shadow-[0_20px_60px_rgba(0,0,0,0.4)]">
        <div className="flex flex-wrap items-center gap-2 mb-5">
          <button type="button" onClick={onClose} className="inline-flex items-center gap-1.5 rounded-full border border-[#d9cfbd] px-3 py-1.5 text-[11px] font-black uppercase tracking-wider text-[#4a4238] hover:bg-white min-h-[36px]">
            <ArrowLeft size={13} /> My stories
          </button>
          <span className="text-[11px] font-bold text-[#6b6258]">{kit.emoji} {kit.title} · {BAND_LABEL[story.band]}</span>
          <span className="ml-auto flex items-center gap-1">
            {STAGE_ORDER.map((st, i) => (
              <span key={st} title={STAGE_LABEL[st]} className="h-1.5 w-6 rounded-full" style={{ background: STAGE_ORDER.indexOf(story.stage) >= i ? JR_ACCENT : '#d9cfbd' }} />
            ))}
          </span>
        </div>

        <ol className="mb-6 grid gap-1.5 text-[13px] text-[#4a4238]">
          {kit.steps.map((s, i) => <li key={s} className="flex gap-2"><span className="font-black" style={{ color: JR_ACCENT }}>{i + 1}.</span>{s}</li>)}
        </ol>

        <fieldset disabled={locked} className="space-y-5 disabled:opacity-80">
          {kit.form !== 'picture-news' && (
            <div>
              <label className={label} htmlFor="jr-headline">Headline</label>
              <input id="jr-headline" className={`${inputCls} font-serif text-2xl font-bold`} value={story.headline} onChange={e => set({ headline: e.target.value })} placeholder="Robotics team wins regional title" />
            </div>
          )}
          {has('dek') && (
            <div><label className={label}>{FIELD_LABEL.dek}</label><input className={inputCls} value={story.dek} onChange={e => set({ dek: e.target.value })} /></div>
          )}
          {has('picture') && (
            <div>
              <label className={label}>{FIELD_LABEL.picture}</label>
              {story.picture
                ? <img src={story.picture} alt={story.caption || 'Picture news'} className="max-h-72 rounded-xl border border-[#d9cfbd]" />
                : <p className="text-[13px] text-[#6b6258] mb-2">Draw on paper and take a photo, or pick a picture you made.</p>}
              <label className="mt-2 inline-flex cursor-pointer items-center gap-2 rounded-full border border-[#d9cfbd] bg-white px-4 py-2 text-[12px] font-bold text-[#4a4238] min-h-[40px]">
                <ImageIcon size={14} /> {story.picture ? 'Change picture' : 'Add picture'}
                <input type="file" accept="image/*" className="hidden" onChange={e => onPicture(e.target.files?.[0])} />
              </label>
              <label className="ml-3 inline-flex items-center gap-2 text-[12px] text-[#4a4238]">
                <input type="checkbox" checked={!!story.pictureEdited} onChange={e => set({ pictureEdited: e.target.checked })} /> I changed what the picture shows
              </label>
            </div>
          )}
          {has('caption') && (
            <div><label className={label}>{FIELD_LABEL.caption}</label><input className={inputCls} value={story.caption} onChange={e => set({ caption: e.target.value })} placeholder={young ? 'Ms. Ana waters the plant by the window.' : 'Who and what, left to right.'} /></div>
          )}
          {has('fiveWs') && (
            <div>
              <span className={label}>{FIELD_LABEL.fiveWs}</span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {(Object.keys(story.fiveWs) as (keyof StudentStory['fiveWs'])[]).map(k => (
                  <label key={k} className="flex items-center gap-2 rounded-xl border border-[#d9cfbd] bg-white/70 px-3">
                    <span className="w-14 shrink-0 text-[11px] font-black uppercase" style={{ color: JR_ACCENT }}>{k}?</span>
                    <input className="w-full bg-transparent py-2.5 text-[14px] focus:outline-none" value={story.fiveWs[k]} onChange={e => set({ fiveWs: { ...story.fiveWs, [k]: e.target.value } })} />
                  </label>
                ))}
              </div>
            </div>
          )}
          {(has('lede') || has('fiveWs')) && (
            <div><label className={label}>{FIELD_LABEL.lede}</label><textarea rows={2} className={`${inputCls} font-serif`} value={story.lede} onChange={e => set({ lede: e.target.value })} placeholder="The most important thing, first." /></div>
          )}
          {kit.form !== 'picture-news' && (
            <div>
              <label className={label}>{has('script') ? FIELD_LABEL.script : has('records') && kit.form === 'records-request' ? 'Request letter' : has('plan') ? 'Plan & findings' : 'Story'}</label>
              <textarea rows={has('script') ? 8 : 12} className={`${inputCls} font-serif leading-relaxed`} value={story.body} onChange={e => set({ body: e.target.value })}
                placeholder={has('script') ? 'VIDEO: wide of the gym | AUDIO: Police say the road reopens Monday…' : kit.form === 'records-request' ? 'Under the [statute], I request copies of…' : 'Keep going: next most important facts, attributed.'} />
              <p className="mt-1 text-right text-[11px] text-[#6b6258]">{wordCount(storyText(story))} / {kit.words[0]}–{kit.words[1]} words</p>
            </div>
          )}
          {has('counterpoint') && (
            <div><label className={label}>{FIELD_LABEL.counterpoint}</label><textarea rows={4} className={`${inputCls} font-serif`} value={story.counterpoint} onChange={e => set({ counterpoint: e.target.value })} /></div>
          )}
          {(has('sources') || has('quotes')) && <SourcesEditor story={story} young={young} onChange={set} />}
          {!young && (
            <label className="inline-flex items-center gap-2 text-[12px] text-[#4a4238]">
              <input type="checkbox" checked={!!story.aiUsed} onChange={e => set({ aiUsed: e.target.checked })} /> AI tools helped write, translate or illustrate this
            </label>
          )}
        </fieldset>

        {story.stage === 'EDITING' && (
          <div className="mt-6 rounded-2xl border border-[#d9cfbd] bg-white/70 p-4">
            <p className={label}>Editor’s checklist</p>
            {kit.checklist.map(item => (
              <label key={item} className="flex items-center gap-2 py-1.5 text-[14px]">
                <input type="checkbox" checked={!!story.checklist[item]} onChange={e => set({ checklist: { ...story.checklist, [item]: e.target.checked } })} /> {item}
              </label>
            ))}
          </div>
        )}

        {story.notes.length > 0 && (
          <div className="mt-6 space-y-2">
            {story.notes.map((n, i) => <p key={i} className="rounded-xl bg-[#fff6d9] px-3 py-2 text-[13px] text-[#4a4238]"><b>{n.by}:</b> {n.text}</p>)}
          </div>
        )}

        <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-[#d9cfbd] pt-5">
          {(story.stage === 'DRAFT' || story.stage === 'EDITING') && (
            <button type="button" disabled={!gate.ok} onClick={() => onChange(advance(story, ctx))}
              className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[12px] font-black uppercase tracking-wider text-white disabled:opacity-40 min-h-[44px]" style={{ background: JR_ACCENT }}>
              <Check size={14} /> {story.stage === 'DRAFT' ? 'Send to peer edit' : 'Send to teacher'}
            </button>
          )}
          {story.stage === 'REVIEW' && <TurnInPanel story={story} viewer={viewer} onChange={onChange} />}
          {story.stage === 'REVIEW' && !viewer.isMinor && !story.submission && (
            <div className="w-full rounded-2xl border border-amber-300 bg-amber-50 p-4">
              <p className="text-[13px] font-bold text-[#4a4238] mb-2"><UserCheck size={14} className="inline mr-1" /> Or: editor sign-off at this desk</p>
              <p className="text-[12px] text-[#6b6258] mb-3">For adult reporters working with an editor in person. Student stories are approved from the teacher’s own account.</p>
              <div className="flex flex-wrap gap-2">
                <input className={`${inputCls} max-w-xs`} value={signer} onChange={e => setSigner(e.target.value)} placeholder="Your name (teacher or guardian)" />
                <button type="button" disabled={!signer.trim()} onClick={() => onChange(signOff(story, { id: `signer:${signer.trim().toLowerCase()}`, name: signer.trim(), role: 'teacher' }))}
                  className="rounded-full bg-emerald-600 px-4 py-2 text-[12px] font-black uppercase text-white disabled:opacity-40 min-h-[40px]">Approve</button>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <input className={`${inputCls} max-w-xs`} value={sendNote} onChange={e => setSendNote(e.target.value)} placeholder="What should the reporter fix?" />
                <button type="button" disabled={!sendNote.trim()} onClick={() => { onChange(sendBack(story, { by: signer.trim() || 'Editor', text: sendNote.trim() })); setSendNote(''); }}
                  className="inline-flex items-center gap-1 rounded-full border border-[#d9cfbd] px-4 py-2 text-[12px] font-black uppercase text-[#4a4238] disabled:opacity-40 min-h-[40px]"><Undo2 size={13} /> Send back</button>
              </div>
            </div>
          )}
          {(story.stage === 'APPROVED' || story.stage === 'PUBLISHED') && (
            <>
              <p className="text-[13px] text-[#4a4238]">{story.approval ? <>Approved by <b>{story.approval.by}</b>{story.approval.byUid ? ' from their Academia account' : ' at this desk'}.</> : 'Approved.'}</p>
              <button type="button" onClick={onOpenPress} className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[12px] font-black uppercase tracking-wider text-white min-h-[44px]" style={{ background: JR_ACCENT }}>
                Go to the Press Room <ChevronRight size={14} />
              </button>
            </>
          )}
          {story.stage === 'DRAFT' && (
            <button type="button" onClick={() => { if (confirm('Delete this draft? This cannot be undone.')) onDelete(); }} className="ml-auto inline-flex items-center gap-1 rounded-full px-3 py-2 text-[11px] font-bold text-[#8a3324] hover:bg-white min-h-[40px]">
              <Trash2 size={13} /> Delete draft
            </button>
          )}
        </div>
        {!gate.ok && (story.stage === 'DRAFT' || story.stage === 'EDITING') && (
          <ul className="mt-2 text-[12px] text-[#8a3324]">{gate.reasons.map(r => <li key={r}>• {r}</li>)}</ul>
        )}
      </div>

      <aside className="space-y-4 lg:sticky lg:top-4 self-start">
        <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
          <p className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-white/80"><Sparkles size={14} style={{ color: JR_ACCENT }} /> {young ? 'Your helper' : 'Desk coach'}</p>
          <ul className="mt-3 space-y-2" data-testid="coach-notes">
            {notes.length === 0 && <li className="text-[13px] text-white/50">Start writing and the coach will read along.</li>}
            {notes.map((n, i) => (
              <li key={i} className={`rounded-xl px-3 py-2 text-[13px] leading-snug ${n.tone === 'fix' ? 'bg-[#E8553E]/15 text-[#ffb4a6]' : n.tone === 'praise' ? 'bg-emerald-400/10 text-emerald-200' : 'bg-white/[0.05] text-white/75'}`}>{n.text}</li>
            ))}
          </ul>
          {!young && <p className="mt-3 text-[10px] text-white/35">Style checks cover common mechanical rules, not the licensed AP Stylebook. Only a human can mark a fact verified.</p>}
        </div>
        {safety.length > 0 && (
          <div className="rounded-3xl border border-amber-400/30 bg-amber-400/[0.06] p-5">
            <p className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-amber-200"><ShieldAlert size={14} /> Kind &amp; safe</p>
            <ul className="mt-2 space-y-1.5">{safety.map(f => <li key={f.text} className={`text-[13px] ${f.severity === 'block' ? 'text-amber-100' : 'text-amber-200/70'}`}>• {f.text}</li>)}</ul>
          </div>
        )}
        <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5 space-y-2">
          <p className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-white/80"><Lightbulb size={14} style={{ color: JR_ACCENT }} /> Learn it</p>
          {onOpenLesson && <button type="button" onClick={() => onOpenLesson(kit.lessonId)} className="block w-full rounded-xl bg-white/[0.05] px-3 py-2.5 text-left text-[13px] text-white/80 hover:bg-white/[0.1] min-h-[44px]">Read the lesson for this kit</button>}
          {onOpenExhibitRoom && kit.exhibitRoom && <button type="button" onClick={() => onOpenExhibitRoom(kit.exhibitRoom!)} className="block w-full rounded-xl bg-white/[0.05] px-3 py-2.5 text-left text-[13px] text-white/80 hover:bg-white/[0.1] min-h-[44px]">Play it in Lorea’s “The First Draft”</button>}
        </div>
      </aside>
    </div>
  );
};

// ── Turn in to an Academia assignment ────────────────────────────────────────
const TurnInPanel: React.FC<{ story: StudentStory; viewer: NewsroomViewer; onChange: (s: StudentStory) => void }> = ({ story, viewer, onChange }) => {
  const [assignments, setAssignments] = useState<TemplateAssignment[] | null>(null);
  const [pick, setPick] = useState(story.assignmentId || '');
  const [state, setState] = useState<'idle' | 'busy' | 'err'>('idle');
  const signedIn = !!viewer.id && viewer.id !== 'guest';

  useEffect(() => {
    if (!signedIn || story.submission) return;
    let alive = true;
    import('../../services/journalismSchool/newsroomReview')
      .then(m => m.listMyNewsroomAssignments(viewer.id))
      .then(list => { if (!alive) return; setAssignments(list); setPick(p => p || list.find(a => a.newsroomKitId === story.kitId)?.id || list[0]?.id || ''); })
      .catch(() => { if (alive) setAssignments([]); });
    return () => { alive = false; };
  }, [signedIn, viewer.id, story.submission, story.kitId]);

  if (story.submission) {
    return (
      <div className="w-full rounded-2xl border border-sky-300 bg-sky-50 p-4 text-[13px] text-[#4a4238]" data-testid="turned-in">
        <p className="font-bold"><UserCheck size={14} className="inline mr-1" /> Turned in to {story.submission.className} — {story.submission.title}</p>
        <p className="mt-1 text-[12px] text-[#6b6258]">Your teacher reviews it from their account. Their decision shows up here by itself.</p>
      </div>
    );
  }
  if (!signedIn) return <p className="w-full text-[13px] text-[#8a3324]">Sign in to turn this in to your teacher.</p>;
  if (assignments === null) return <p className="w-full text-[13px] text-[#6b6258]">Looking for your School of Journalism assignments…</p>;
  if (!assignments.length) {
    return (
      <div className="w-full rounded-2xl border border-[#d9cfbd] bg-white/70 p-4 text-[13px] text-[#4a4238]">
        <p className="font-bold">No School of Journalism assignment yet.</p>
        <p className="mt-1 text-[12px] text-[#6b6258]">Ask your teacher to assign one (Teacher Tools → Build a lesson → a School of Journalism template), then turn this story in to it.</p>
      </div>
    );
  }
  const assignment = assignments.find(a => a.id === pick);
  const turnIn = async () => {
    if (!assignment) return;
    setState('busy');
    const m = await import('../../services/journalismSchool/newsroomReview');
    const id = await m.turnInStory({ story, assignment, studentId: viewer.id, studentName: viewer.name });
    if (!id) { setState('err'); return; }
    onChange(markTurnedIn(story, { id, assignmentId: assignment.id, title: assignment.title, className: assignment.className }));
  };
  return (
    <div className="w-full rounded-2xl border border-amber-300 bg-amber-50 p-4">
      <p className="text-[13px] font-bold text-[#4a4238] mb-2"><UserCheck size={14} className="inline mr-1" /> Turn in to your teacher</p>
      <div className="flex flex-wrap gap-2">
        <select value={pick} onChange={e => setPick(e.target.value)} className={`${inputCls} max-w-sm`}>
          {assignments.map(a => <option key={a.id} value={a.id}>{a.title} — {a.className}</option>)}
        </select>
        <button type="button" disabled={!assignment || state === 'busy'} onClick={turnIn}
          className="rounded-full px-5 py-2 text-[12px] font-black uppercase text-white disabled:opacity-40 min-h-[40px]" style={{ background: JR_ACCENT }}>
          {state === 'busy' ? 'Turning in…' : 'Turn in'}
        </button>
      </div>
      {state === 'err' && <p className="mt-2 text-[12px] text-[#8a3324]">That didn’t go through. Check your connection and try again.</p>}
    </div>
  );
};

const SourcesEditor: React.FC<{ story: StudentStory; young: boolean; onChange: (p: Partial<StudentStory>) => void }> = ({ story, young, onChange }) => {
  const upd = (id: string, patch: Partial<StudentStory['sources'][number]>) => onChange({ sources: story.sources.map(s => s.id === id ? { ...s, ...patch } : s) });
  const updQ = (id: string, patch: Partial<StudentStory['quotes'][number]>) => onChange({ quotes: story.quotes.map(q => q.id === id ? { ...q, ...patch } : q) });
  return (
    <div className="space-y-3">
      <span className={label}>{young ? 'Who told you? How do you know?' : 'Sources'}</span>
      {story.sources.map(s => (
        <div key={s.id} className="rounded-xl border border-[#d9cfbd] bg-white/70 p-3 space-y-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <input className={inputCls} value={s.name} onChange={e => upd(s.id, { name: e.target.value })} placeholder={s.isMinor ? 'First name only' : 'Name'} />
            <input className={inputCls} value={s.role} onChange={e => upd(s.id, { role: e.target.value })} placeholder="Role (coach, seventh-grader, city budget)" />
          </div>
          <div className="flex flex-wrap items-center gap-3 text-[12px] text-[#4a4238]">
            <select value={s.how} onChange={e => upd(s.id, { how: e.target.value as any })} className="rounded-lg border border-[#d9cfbd] bg-white px-2 py-1.5">
              <option value="saw">I saw it</option><option value="interview">Interview</option><option value="document">Document</option><option value="told">Someone told me</option><option value="online">Online</option>
            </select>
            <label className="inline-flex items-center gap-1"><input type="checkbox" checked={s.primary} onChange={e => upd(s.id, { primary: e.target.checked })} /> Primary</label>
            <label className="inline-flex items-center gap-1"><input type="checkbox" checked={!!s.isMinor} onChange={e => upd(s.id, { isMinor: e.target.checked })} /> A student</label>
            <label className="inline-flex items-center gap-1 font-bold"><input type="checkbox" checked={s.consent} onChange={e => upd(s.id, { consent: e.target.checked })} /> Agreed to be in it</label>
            <button type="button" onClick={() => onChange({ sources: story.sources.filter(x => x.id !== s.id), quotes: story.quotes.filter(q => q.speakerId !== s.id) })} className="ml-auto text-[#8a3324]">Remove</button>
          </div>
          {!young && story.quotes.filter(q => q.speakerId === s.id).map(q => (
            <div key={q.id} className="flex flex-wrap items-center gap-2">
              <input className={`${inputCls} flex-1 font-serif italic`} value={q.text} onChange={e => updQ(q.id, { text: e.target.value })} placeholder="Exact words" />
              <label className="inline-flex items-center gap-1 text-[12px] text-[#4a4238]"><input type="checkbox" checked={q.readBack} onChange={e => updQ(q.id, { readBack: e.target.checked })} /> Read back</label>
            </div>
          ))}
          {!young && <button type="button" onClick={() => onChange({ quotes: [...story.quotes, newQuote(s.id)] })} className="text-[12px] font-bold" style={{ color: JR_ACCENT }}>+ Add a quote from {s.name.split(' ')[0] || 'this source'}</button>}
        </div>
      ))}
      <button type="button" onClick={() => onChange({ sources: [...story.sources, newSource()] })} className="inline-flex items-center gap-1 rounded-full border border-[#d9cfbd] bg-white px-4 py-2 text-[12px] font-bold text-[#4a4238] min-h-[40px]">
        <Plus size={13} /> Add a source
      </button>
    </div>
  );
};

export default StudentNewsroom;
