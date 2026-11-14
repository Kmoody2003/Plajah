// AnnouncementComposer — post an update, a themed flyer or a one-page newsletter, with an optional
// poll or survey. Flyers start from a preset (or any library template) and can be opened in Tela
// for full design control; Tela's back button returns here with the edited page.
import React, { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import type { TelaDoc } from '../../types';
import { FLYER_PRESETS, findFlyerPreset, flyerToTelaDoc, type FlyerFields } from '../../services/announcements/flyerPresets';
import {
  encodeFlyer, newAnnouncementId, postAnnouncement,
  type Announcement, type AnnouncementAudience, type AnnouncementPoll, type SurveyQuestion,
} from '../../services/announcements/announcementService';
import { loadTelaDoc, saveTelaDoc } from '../../services/telaStore';
import { instantiateTemplate, type LibraryTemplate } from '../../services/templates/docTemplateLibrary';
import FlyerView from './FlyerView';

const TemplateLibrary = lazy(() => import('../templates/TemplateLibrary'));

export interface AudienceOption {
  key: string;
  label: string;
  audience: AnnouncementAudience;
  programId?: string;
  programName?: string;
  audienceUids?: string[];
}

export interface ComposerDraft {
  orgId: string;
  programId?: string;
  mode: Mode;
  audienceKey: string;
  text: string;
  presetId: string;
  fields: FlyerFields;
  telaDocId?: string;
  poll?: AnnouncementPoll;
  survey?: { title?: string; questions: SurveyQuestion[]; anonymous?: boolean };
}
export const ANN_DRAFT_KEY = 'plajah:annDraft';
export function takeComposerDraft(orgId: string, programId?: string): ComposerDraft | null {
  try {
    const raw = sessionStorage.getItem(ANN_DRAFT_KEY); if (!raw) return null;
    const d = JSON.parse(raw) as ComposerDraft;
    if (d.orgId !== orgId || (d.programId || '') !== (programId || '')) return null;
    sessionStorage.removeItem(ANN_DRAFT_KEY);
    return d;
  } catch { return null; }
}

type Mode = 'POST' | 'FLYER' | 'NEWSLETTER';
const qid = () => `q_${Math.random().toString(36).slice(2, 8)}`;
const FLYER_IDS = FLYER_PRESETS.filter(p => p.kind !== 'NEWSLETTER').map(p => p.id);

export default function AnnouncementComposer({ orgId, orgName, viewer, authorRole, audiences, initialAudienceKey, draft, returnLabel, onClose, onPosted }: {
  orgId: string; orgName: string;
  viewer: { uid: string; name: string };
  authorRole?: string;
  audiences: AudienceOption[];
  initialAudienceKey?: string;
  draft?: ComposerDraft | null;
  returnLabel?: string;
  onClose: () => void;
  onPosted?: (a: Announcement) => void;
}) {
  const [mode, setMode] = useState<Mode>(draft?.mode || 'POST');
  const [audienceKey, setAudienceKey] = useState(draft?.audienceKey || initialAudienceKey || audiences[0]?.key || '');
  const [text, setText] = useState(draft?.text || '');
  const [presetId, setPresetId] = useState(draft?.presetId || 'celebration');
  const [fields, setFields] = useState<FlyerFields>(draft?.fields || { headline: '', footer: orgName, ...findFlyerPreset('celebration')!.defaults });
  const [customDoc, setCustomDoc] = useState<TelaDoc | null>(null);
  const [customId, setCustomId] = useState<string | undefined>(draft?.telaDocId);
  const [poll, setPoll] = useState<AnnouncementPoll | undefined>(draft?.poll);
  const [survey, setSurvey] = useState<ComposerDraft['survey']>(draft?.survey);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  // Coming back from Tela: load the page the author edited.
  useEffect(() => {
    if (!customId) return;
    let live = true;
    void loadTelaDoc(customId).then(d => { if (live && d) setCustomDoc(d); });
    return () => { live = false; };
  }, [customId]);

  const preset = findFlyerPreset(mode === 'NEWSLETTER' ? 'newsletter' : presetId) || FLYER_PRESETS[0];
  const [debounced, setDebounced] = useState(fields);
  useEffect(() => { const t = setTimeout(() => setDebounced(fields), 220); return () => clearTimeout(t); }, [fields]);
  const previewDoc = useMemo(() => (mode === 'POST' ? null : customDoc || flyerToTelaDoc(preset, debounced, viewer.uid, 'preview')), [mode, customDoc, preset, debounced, viewer.uid]);

  const audience = audiences.find(a => a.key === audienceKey) || audiences[0];
  const setF = (k: keyof FlyerFields, v: string) => setFields(f => ({ ...f, [k]: v }));

  // A kicker or button label the author never changed follows the design; one they typed stays.
  const isDefault = (k: 'kicker' | 'ctaLabel', v?: string) => !v || v === 'This week' || FLYER_PRESETS.some(x => x.defaults[k] === v);
  const pickPreset = (id: string) => {
    const p = findFlyerPreset(id); if (!p) return;
    setPresetId(id); setCustomDoc(null); setCustomId(undefined);
    setFields(f => ({ ...f, kicker: isDefault('kicker', f.kicker) ? p.defaults.kicker : f.kicker, ctaLabel: isDefault('ctaLabel', f.ctaLabel) ? p.defaults.ctaLabel : f.ctaLabel }));
  };

  const switchMode = (m: Mode) => {
    setMode(m); setCustomDoc(null); setCustomId(undefined);
    if (m === 'NEWSLETTER') setFields(f => ({ ...f, kicker: isDefault('kicker', f.kicker) ? 'This week' : f.kicker, ctaLabel: isDefault('ctaLabel', f.ctaLabel) ? '' : f.ctaLabel, headline: f.headline || `${orgName} newsletter` }));
    if (m === 'FLYER') {
      const id = FLYER_IDS.includes(presetId) ? presetId : 'celebration'; const p = findFlyerPreset(id)!;
      setPresetId(id);
      setFields(f => ({ ...f, kicker: isDefault('kicker', f.kicker) ? p.defaults.kicker : f.kicker, ctaLabel: isDefault('ctaLabel', f.ctaLabel) ? p.defaults.ctaLabel : f.ctaLabel }));
    }
  };

  const fromLibrary = (t: LibraryTemplate) => {
    setPicking(false);
    if (t.flyer) { if (t.flyer.kind === 'NEWSLETTER') switchMode('NEWSLETTER'); else { setMode('FLYER'); pickPreset(t.flyer.id); } return; }
    const d = instantiateTemplate(t, viewer.uid);
    setMode(m => (m === 'POST' ? 'FLYER' : m)); setCustomDoc(d); setCustomId(undefined);
  };

  const openInTela = async () => {
    setErr('');
    const d = customDoc || flyerToTelaDoc(preset, fields, viewer.uid);
    const withOrigin: TelaDoc = { ...d, orgOrigin: { orgId, orgName } };
    const r = await saveTelaDoc(withOrigin);
    if (!r.ok) { setErr('Couldn’t open this flyer in Tela. Try again.'); return; }
    const save: ComposerDraft = { orgId, programId: audience?.programId, mode, audienceKey, text, presetId, fields, telaDocId: withOrigin.id, poll, survey };
    try { sessionStorage.setItem(ANN_DRAFT_KEY, JSON.stringify(save)); } catch { /* */ }
    window.dispatchEvent(new CustomEvent('plajah:openTela', { detail: { docId: withOrigin.id, returnTo: { label: returnLabel || 'announcement', programId: audience?.programId } } }));
  };

  const validPoll = !poll || (poll.question.trim() && poll.options.filter(o => o.trim()).length >= 2);
  const validSurvey = !survey || survey.questions.some(q => q.prompt.trim());
  const canPost = !!audience && validPoll && validSurvey && (mode === 'POST' ? !!(text.trim() || poll || survey) : !!(customDoc || fields.headline.trim()));

  const submit = async () => {
    if (!canPost || !audience) return;
    setBusy(true); setErr('');
    try {
      const flyer = mode === 'POST' ? null : { ...(customDoc || flyerToTelaDoc(preset, fields, viewer.uid)), orgOrigin: { orgId, orgName } };
      const now = Date.now();
      const a: Announcement = {
        id: newAnnouncementId(), orgId, orgName, programId: audience.programId, programName: audience.programName,
        audience: audience.audience, audienceUids: audience.audience === 'members' ? [...new Set([viewer.uid, ...(audience.audienceUids || [])])] : undefined,
        authorUid: viewer.uid, authorName: viewer.name, authorRole,
        kind: flyer ? 'FLYER' : 'POST', title: flyer ? flyer.title : undefined, text: text.trim(),
        presetId: flyer && !customDoc ? preset.id : undefined, flyerJson: flyer ? encodeFlyer(flyer) : undefined,
        ctaUrl: flyer && !customDoc ? fields.ctaUrl?.trim() || undefined : undefined,
        poll: poll ? { ...poll, question: poll.question.trim(), options: poll.options.map(o => o.trim()).filter(Boolean) } : undefined,
        survey: survey ? { ...survey, questions: survey.questions.filter(q => q.prompt.trim()).map(q => ({ ...q, prompt: q.prompt.trim(), options: q.type === 'choice' ? (q.options || []).map(o => o.trim()).filter(Boolean) : undefined })) } : undefined,
        pinned: false, createdAt: now, updatedAt: now,
      };
      await postAnnouncement(a);
      onPosted?.(a);
      onClose();
    } catch (e) { setErr(e instanceof Error ? e.message : 'Couldn’t post this announcement.'); }
    finally { setBusy(false); }
  };

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="New announcement" onKeyDown={e => { if (e.key === 'Escape') onClose(); }}>
      <div className="box">
        <div className="row wrap">
          <div className="grow">
            <div className="eyebrow">New announcement</div>
            <h2 style={{ fontSize: '1.2rem', fontWeight: 900 }}>{mode === 'POST' ? 'Post an update' : mode === 'FLYER' ? 'Make a flyer' : 'Write a newsletter'}</h2>
          </div>
          <div className="seg" role="group" aria-label="Kind">
            {(['POST', 'FLYER', 'NEWSLETTER'] as Mode[]).map(m => <button key={m} type="button" aria-pressed={mode === m} onClick={() => switchMode(m)}>{m === 'POST' ? 'Post' : m === 'FLYER' ? 'Flyer' : 'Newsletter'}</button>)}
          </div>
          <button type="button" className="btn sm" onClick={onClose}>Close</button>
        </div>

        <div className={`compose ${mode === 'POST' ? '' : 'two'}`}>
          <div className="stack" style={{ gap: 14 }}>
            <label className="lbl">Who sees it
              <select className="field" value={audienceKey} onChange={e => setAudienceKey(e.target.value)}>
                {audiences.map(a => <option key={a.key} value={a.key}>{a.label}</option>)}
              </select>
            </label>

            {mode !== 'POST' && (
              <>
                {mode === 'FLYER' && (
                  <div className="stack">
                    <div className="row"><span className="lbl grow" style={{ margin: 0 }}>Design</span><button type="button" className="btn link sm" onClick={() => setPicking(true)}>More templates…</button></div>
                    <div className="presets">
                      {FLYER_PRESETS.filter(p => p.kind !== 'NEWSLETTER').map(p => (
                        <button key={p.id} type="button" className="preset" aria-pressed={!customDoc && presetId === p.id} onClick={() => pickPreset(p.id)} title={p.blurb}>
                          <span className="sw" style={{ background: p.swatch[0], color: p.swatch[1], borderBottom: `4px solid ${p.swatch[2]}` }}>Aa</span>
                          <span className="n">{p.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {customDoc ? (
                  <div className="card">
                    <div className="t">Using “{customDoc.title}”</div>
                    <div className="u">This page was designed in Tela, so edit its words there. Your post text and any poll still go with it.</div>
                    <div className="row wrap"><button type="button" className="btn sm" onClick={() => void openInTela()}>Edit in Tela</button><button type="button" className="btn sm" onClick={() => { setCustomDoc(null); setCustomId(undefined); }}>Back to the preset</button></div>
                  </div>
                ) : (
                  <div className="stack">
                    <label className="lbl">{mode === 'NEWSLETTER' ? 'Title' : 'Headline'}<input className="field" value={fields.headline} maxLength={80} onChange={e => setF('headline', e.target.value)} placeholder={mode === 'NEWSLETTER' ? 'Grace Notes · November' : 'Fall family night'} /></label>
                    <label className="lbl">Small line above it<input className="field" value={fields.kicker || ''} maxLength={40} onChange={e => setF('kicker', e.target.value)} /></label>
                    <div className="row wrap" style={{ alignItems: 'stretch' }}>
                      <label className="lbl grow">When<input className="field" value={fields.when || ''} maxLength={60} onChange={e => setF('when', e.target.value)} placeholder="Sat, Nov 14 · 5–7 PM" /></label>
                      <label className="lbl grow">Where<input className="field" value={fields.where || ''} maxLength={60} onChange={e => setF('where', e.target.value)} placeholder="Fellowship hall" /></label>
                    </div>
                    <label className="lbl">{mode === 'NEWSLETTER' ? 'Stories (a blank line starts the next one; its first line is the heading)' : 'Details'}
                      <textarea className="field" rows={mode === 'NEWSLETTER' ? 8 : 3} value={fields.body || ''} maxLength={mode === 'NEWSLETTER' ? 3000 : 320} onChange={e => setF('body', e.target.value)} />
                    </label>
                    <div className="row wrap" style={{ alignItems: 'stretch' }}>
                      <label className="lbl grow">Button<input className="field" value={fields.ctaLabel || ''} maxLength={24} onChange={e => setF('ctaLabel', e.target.value)} placeholder="RSVP" /></label>
                      <label className="lbl grow">Button opens<input className="field" value={fields.ctaUrl || ''} onChange={e => setF('ctaUrl', e.target.value)} placeholder="https://… (optional)" inputMode="url" /></label>
                    </div>
                    <label className="lbl">Footer<input className="field" value={fields.footer || ''} maxLength={60} onChange={e => setF('footer', e.target.value)} /></label>
                  </div>
                )}
              </>
            )}

            <label className="lbl">{mode === 'POST' ? 'Message' : 'Caption (optional)'}
              <textarea className="field" rows={mode === 'POST' ? 5 : 2} value={text} maxLength={4000} onChange={e => setText(e.target.value)} placeholder={mode === 'POST' ? 'What do people need to know?' : 'A line to go with the flyer'} />
            </label>

            <PollEditor poll={poll} onChange={setPoll} />
            <SurveyEditor survey={survey} onChange={setSurvey} />

            {err && <div className="err" role="alert">{err}</div>}
            <div className="row wrap">
              <button type="button" className="btn p" disabled={!canPost || busy} onClick={() => void submit()}>{busy ? 'Posting…' : `Post to ${audience?.label || '…'}`}</button>
              {mode !== 'POST' && <button type="button" className="btn" onClick={() => void openInTela()}>Customize in Tela</button>}
            </div>
          </div>

          {previewDoc && (
            <div className="stack sticky-prev">
              <div className="row"><span className="eyebrow grow">Preview · hover and tap it</span></div>
              <FlyerView doc={previewDoc} ctaUrl={fields.ctaUrl} maxWidth={420} />
            </div>
          )}
        </div>
      </div>
      {picking && (
        <Suspense fallback={null}>
          <TemplateLibrary orgId={orgId} orgName={orgName} viewer={viewer} pickOnly categories={['FLYER', 'POSTER', 'NEWSLETTER', 'ANNOUNCEMENT', 'SOCIAL']} onPick={fromLibrary} onClose={() => setPicking(false)} />
        </Suspense>
      )}
    </div>
  );
}

function PollEditor({ poll, onChange }: { poll?: AnnouncementPoll; onChange: (p?: AnnouncementPoll) => void }) {
  if (!poll) return <button type="button" className="btn sm" style={{ justifySelf: 'start' }} onClick={() => onChange({ question: '', options: ['', ''], showResults: true })}>+ Add a poll</button>;
  const set = (p: Partial<AnnouncementPoll>) => onChange({ ...poll, ...p });
  return (
    <div className="qrow">
      <div className="row"><span className="eyebrow grow">Poll</span><button type="button" className="btn link sm" onClick={() => onChange(undefined)}>Remove</button></div>
      <input className="field" placeholder="Ask a question" value={poll.question} maxLength={140} onChange={e => set({ question: e.target.value })} />
      {poll.options.map((o, i) => (
        <div className="row" key={i}>
          <input className="field" placeholder={`Option ${i + 1}`} value={o} maxLength={80} onChange={e => set({ options: poll.options.map((x, j) => (j === i ? e.target.value : x)) })} />
          {poll.options.length > 2 && <button type="button" className="btn sm" aria-label={`Remove option ${i + 1}`} onClick={() => set({ options: poll.options.filter((_, j) => j !== i) })}>×</button>}
        </div>
      ))}
      <div className="row wrap">
        {poll.options.length < 6 && <button type="button" className="btn sm" onClick={() => set({ options: [...poll.options, ''] })}>+ Option</button>}
        <label className="small row" style={{ gap: 6 }}><input type="checkbox" checked={!!poll.multi} onChange={e => set({ multi: e.target.checked })} /> People can pick more than one</label>
        <label className="small row" style={{ gap: 6 }}><input type="checkbox" checked={poll.showResults !== false} onChange={e => set({ showResults: e.target.checked })} /> Show results after voting</label>
      </div>
    </div>
  );
}

function SurveyEditor({ survey, onChange }: { survey?: ComposerDraft['survey']; onChange: (s?: ComposerDraft['survey']) => void }) {
  if (!survey) return <button type="button" className="btn sm" style={{ justifySelf: 'start' }} onClick={() => onChange({ questions: [{ id: qid(), prompt: '', type: 'short' }] })}>+ Add a survey</button>;
  const setQ = (i: number, q: Partial<SurveyQuestion>) => onChange({ ...survey, questions: survey.questions.map((x, j) => (j === i ? { ...x, ...q } : x)) });
  return (
    <div className="qrow">
      <div className="row"><span className="eyebrow grow">Survey</span><button type="button" className="btn link sm" onClick={() => onChange(undefined)}>Remove</button></div>
      {survey.questions.map((q, i) => (
        <div key={q.id} className="stack" style={{ gap: 6 }}>
          <div className="row">
            <input className="field" placeholder={`Question ${i + 1}`} value={q.prompt} maxLength={200} onChange={e => setQ(i, { prompt: e.target.value })} />
            <select className="field" style={{ width: 150 }} value={q.type} onChange={e => setQ(i, { type: e.target.value as SurveyQuestion['type'], options: e.target.value === 'choice' ? (q.options?.length ? q.options : ['', '']) : undefined })} aria-label="Answer type">
              <option value="short">Short answer</option><option value="long">Paragraph</option><option value="choice">Pick one</option><option value="scale">1–5 scale</option>
            </select>
            {survey.questions.length > 1 && <button type="button" className="btn sm" aria-label={`Remove question ${i + 1}`} onClick={() => onChange({ ...survey, questions: survey.questions.filter((_, j) => j !== i) })}>×</button>}
          </div>
          {q.type === 'choice' && (
            <div className="row wrap" style={{ paddingLeft: 12 }}>
              {(q.options || []).map((o, k) => <input key={k} className="field" style={{ width: 150 }} placeholder={`Choice ${k + 1}`} value={o} maxLength={60} onChange={e => setQ(i, { options: (q.options || []).map((x, m) => (m === k ? e.target.value : x)) })} />)}
              {(q.options || []).length < 8 && <button type="button" className="btn sm" onClick={() => setQ(i, { options: [...(q.options || []), ''] })}>+ Choice</button>}
            </div>
          )}
        </div>
      ))}
      <div className="row wrap">
        {survey.questions.length < 12 && <button type="button" className="btn sm" onClick={() => onChange({ ...survey, questions: [...survey.questions, { id: qid(), prompt: '', type: 'short' }] })}>+ Question</button>}
        <label className="small row" style={{ gap: 6 }}><input type="checkbox" checked={!!survey.anonymous} onChange={e => onChange({ ...survey, anonymous: e.target.checked })} /> Anonymous answers</label>
      </div>
    </div>
  );
}
