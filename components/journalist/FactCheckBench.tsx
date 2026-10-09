import React, { useEffect, useMemo, useState } from 'react';
import { Archive, Check, ExternalLink, Flag, Link2, Plus, ShieldQuestion, Sparkles, Trash2, X } from 'lucide-react';
import { Button, Chip, Input, Surface, Textarea } from '../ui';
import { auth } from '../../services/backendService';
import { addSource, ClaimError, claimSummary, detectCheckableClaims, isTrulyVerified, newClaim, setClaimStatus, wayback } from '../../services/journalist/factCheck';
import { suggestClaimsWithAI } from '../../services/journalist/aiAssist';
import { newId } from '../../services/journalist/newsroomStore';
import { listMyArticles, type MyArticleRow } from '../../services/journalist/articleService';
import type { Claim, ClaimStatus } from '../../services/journalist/types';
import { useNewsroomList } from './useNewsroom';

interface Props {
  /** Fix the bench to one article (editor side panel). Without it, an article picker is shown. */
  articleId?: string;
  articleText?: string;
  /** Called with the current claims so the editor's publish gate sees them. */
  onClaims?: (claims: Claim[]) => void;
  /** Extra claim sentences proposed by Aria (they enter as UNVERIFIED suggestions). */
  incoming?: string[];
}

const COLOR: Record<ClaimStatus, string> = { VERIFIED: '#06D6A0', UNVERIFIED: '#9C96B4', DISPUTED: '#FF5C6C' };

export const FactCheckBench: React.FC<Props> = ({ articleId: fixedId, articleText = '', onClaims, incoming }) => {
  const claimsStore = useNewsroomList<Claim>('newsroom_claims');
  const [articles, setArticles] = useState<MyArticleRow[]>([]);
  const [articleId, setArticleId] = useState(fixedId || '');
  const [text, setText] = useState('');
  const [err, setErr] = useState('');
  const [busyAi, setBusyAi] = useState(false);
  const uid = auth.currentUser?.uid || '';

  useEffect(() => { if (!fixedId && uid) listMyArticles(uid).then(setArticles).catch(() => setArticles([])); }, [fixedId, uid]);
  useEffect(() => { if (fixedId) setArticleId(fixedId); }, [fixedId]);

  const claims = useMemo(() => claimsStore.items.filter(c => c.articleId === (articleId || '__draft__')), [claimsStore.items, articleId]);
  useEffect(() => { onClaims?.(claims); }, [claims]); // eslint-disable-line react-hooks/exhaustive-deps

  const key = articleId || '__draft__';
  const have = new Set(claims.map(c => c.text));
  const addClaim = (t: string, by?: 'heuristic' | 'ai') => {
    const s = t.trim(); if (!s || have.has(s)) return;
    void claimsStore.save(newClaim({ id: newId('claim'), ownerId: uid, articleId: key, text: s, suggestedBy: by }));
  };
  useEffect(() => { (incoming || []).forEach(t => addClaim(t, 'ai')); }, [incoming?.join('|')]); // eslint-disable-line react-hooks/exhaustive-deps

  const heur = useMemo(() => detectCheckableClaims(articleText).filter(c => !have.has(c.text)).slice(0, 12), [articleText, claims.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const act = (fn: () => Claim) => { try { setErr(''); void claimsStore.save(fn()); } catch (e) { setErr(e instanceof ClaimError || e instanceof Error ? e.message : 'Could not update the claim.'); } };
  const summary = claimSummary(claims);

  const runAi = async () => {
    setBusyAi(true); setErr('');
    const found = await suggestClaimsWithAI(articleText);
    setBusyAi(false);
    if (!found.length) setErr('The AI helper returned no usable suggestions (it may be offline). The rule-based list below still works.');
    found.forEach(t => addClaim(t, 'ai'));
  };

  return (
    <div className="flex flex-col gap-4">
      {!fixedId && (
        <label className="flex flex-col gap-1 text-sm">Article
          <select className="pj-input" value={articleId} onChange={e => setArticleId(e.target.value)}>
            <option value="">Scratch (no article)</option>
            {articles.map(a => <option key={a.id} value={a.id}>{a.title}</option>)}
          </select>
        </label>
      )}
      <div className="flex flex-wrap gap-2 text-xs items-center">
        <Chip style={{ color: COLOR.VERIFIED }}>{summary.verified} verified</Chip>
        <Chip style={{ color: COLOR.UNVERIFIED }}>{summary.unverified} unverified</Chip>
        <Chip style={{ color: COLOR.DISPUTED }}>{summary.disputed} disputed</Chip>
      </div>
      <p className="text-xs rounded-xl p-2" style={{ background: 'rgba(0,218,243,.07)', color: 'var(--on-surface-variant)' }}>
        <ShieldQuestion size={13} className="inline mr-1" />Only you can mark a claim verified, and only with a source attached. Suggestions from rules or AI always start unverified.
      </p>

      <Surface level={2} className="flex flex-col gap-2">
        <Textarea label="Add a claim to check" rows={2} value={text} onChange={e => setText(e.target.value)} />
        <div className="pj-actions">
          <Button variant="primary" icon={<Plus />} disabled={!text.trim()} onClick={() => { addClaim(text); setText(''); }}>Add claim</Button>
          {articleText && <Button variant="secondary" icon={<Sparkles />} loading={busyAi} onClick={runAi}>Ask AI to flag checkable claims</Button>}
        </div>
      </Surface>

      {heur.length > 0 && (
        <Surface level={1} className="flex flex-col gap-2">
          <p className="pj-eyebrow flex items-center gap-1"><Flag size={11} /> Worth a second look</p>
          {heur.map(c => (
            <div key={c.start} className="flex gap-2 items-start text-sm">
              <div className="flex-1 min-w-0"><p>{c.text}</p><p className="text-[11px] opacity-60">{c.reasons.join(', ')}</p></div>
              <Button size="xs" variant="secondary" onClick={() => addClaim(c.text, 'heuristic')}>Track</Button>
            </div>
          ))}
        </Surface>
      )}
      {err && <p role="alert" className="text-sm" style={{ color: 'var(--pj-danger)' }}>{err}</p>}

      <ul className="flex flex-col gap-3">
        {claims.map(c => <ClaimRow key={c.id} claim={c} uid={uid} onChange={n => void claimsStore.save(n)} onDelete={() => void claimsStore.remove(c.id)} onError={setErr} act={act} />)}
        {claims.length === 0 && <li className="text-sm opacity-60">No claims tracked for this article yet.</li>}
      </ul>
    </div>
  );
};

const ClaimRow: React.FC<{ claim: Claim; uid: string; onChange: (c: Claim) => void; onDelete: () => void; onError: (m: string) => void; act: (fn: () => Claim) => void }> = ({ claim, uid, onChange, onDelete, act }) => {
  const [url, setUrl] = useState(''); const [archive, setArchive] = useState(''); const [note, setNote] = useState(claim.note || '');
  const trulyVerified = isTrulyVerified(claim);
  const human = { kind: 'human' as const, uid };
  return (
    <li>
      <Surface level={1} className="flex flex-col gap-2" style={{ borderLeft: `3px solid ${COLOR[claim.status]}` }}>
        <p className="text-sm">{claim.text}</p>
        <p className="text-[11px]" style={{ color: COLOR[claim.status] }}>
          {trulyVerified ? 'VERIFIED by you' : claim.status}{claim.suggestedBy ? ` · suggested by ${claim.suggestedBy === 'ai' ? 'AI' : 'rules'}` : ''}
          {claim.status === 'VERIFIED' && !trulyVerified ? ' · not counted: no human verifier or no source' : ''}
        </p>
        {claim.sources.map(s => (
          <p key={s.url} className="text-xs flex flex-wrap gap-2 items-center">
            <Link2 size={11} /><a href={s.url} target="_blank" rel="noopener noreferrer" className="underline break-all">{s.label || s.url}</a>
            {s.archiveUrl ? <a href={s.archiveUrl} target="_blank" rel="noopener noreferrer" className="underline opacity-70 inline-flex items-center gap-1"><Archive size={11} />archived</a> : null}
          </p>
        ))}
        <div className="flex flex-wrap gap-2 items-end">
          <Input label="Source link" placeholder="https://" value={url} onChange={e => setUrl(e.target.value)} className="flex-1 min-w-[200px]" />
          <Input label="Archive snapshot (optional)" placeholder="https://web.archive.org/web/..." value={archive} onChange={e => setArchive(e.target.value)} className="flex-1 min-w-[200px]" />
          <Button size="sm" variant="secondary" disabled={!url.trim()} onClick={() => act(() => { const n = addSource(claim, { url: url.trim(), archiveUrl: archive.trim() || undefined }); setUrl(''); setArchive(''); return n; })}>Add source</Button>
        </div>
        {url.trim().startsWith('http') && (() => { try { const w = wayback(url.trim()); return (
          <p className="text-[11px] flex flex-wrap gap-3 opacity-80">
            <a className="underline inline-flex items-center gap-1" href={w.saveNow} target="_blank" rel="noopener noreferrer"><Archive size={11} />Capture now in the Wayback Machine <ExternalLink size={10} /></a>
            <a className="underline" href={w.latest} target="_blank" rel="noopener noreferrer">Latest snapshot</a>
          </p>); } catch { return null; } })()}
        <Input label="Note (required for Disputed: what is disputed, by whom)" value={note} onChange={e => setNote(e.target.value)} />
        <div className="pj-actions">
          <Button size="sm" variant="success" icon={<Check />} onClick={() => act(() => setClaimStatus(claim, 'VERIFIED', human, { note: note || undefined }))}>I verified this</Button>
          <Button size="sm" variant="danger-quiet" icon={<X />} onClick={() => act(() => setClaimStatus(claim, 'DISPUTED', human, { note }))}>Disputed</Button>
          <Button size="sm" variant="ghost" onClick={() => act(() => setClaimStatus(claim, 'UNVERIFIED', human))}>Reset</Button>
          <Button size="sm" variant="danger-quiet" iconOnly aria-label="Remove claim" onClick={onDelete}><Trash2 /></Button>
        </div>
      </Surface>
    </li>
  );
};

export default FactCheckBench;
