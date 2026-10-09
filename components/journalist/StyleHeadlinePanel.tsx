import React, { useMemo, useState } from 'react';
import { AlertTriangle, Check, Info, Search, Share2, Type } from 'lucide-react';
import { Button, Chip, Surface, Textarea, Input } from '../ui';
import { checkStyle, type StyleIssue } from '../../services/journalist/styleChecker';
import { makeVariants, scoreHeadline, searchPreview, socialPreview, SEARCH_TITLE_MAX, SOCIAL_TITLE_MAX } from '../../services/journalist/headlineTester';

interface Props {
  /** Body copy to lint. When omitted the panel offers its own scratch box. */
  text?: string;
  headline?: string;
  subtitle?: string;
  slugUrl?: string;
  /** Apply a suggestion back into the editor. Omit for read-only use. */
  onReplace?: (issue: StyleIssue) => void;
  onPickHeadline?: (headline: string) => void;
  /** Headline variants proposed elsewhere (Aria). Shown beside the rule-based ones. */
  extraVariants?: string[];
}

const SEV = {
  error: { color: 'var(--pj-danger)', icon: <AlertTriangle size={13} />, label: 'Fix' },
  warn: { color: '#FF8C00', icon: <AlertTriangle size={13} />, label: 'Check' },
  info: { color: 'var(--on-surface-variant)', icon: <Info size={13} />, label: 'Tip' },
} as const;

export const StyleHeadlinePanel: React.FC<Props> = ({ text, headline, subtitle, slugUrl = 'plajah.com/article', onReplace, onPickHeadline, extraVariants }) => {
  const [scratch, setScratch] = useState('');
  const [scratchHead, setScratchHead] = useState('');
  const [tab, setTab] = useState<'style' | 'headline'>('style');
  const [showInfo, setShowInfo] = useState(true);
  const body = text ?? scratch;
  const head = headline ?? scratchHead;

  const report = useMemo(() => checkStyle(body), [body]);
  const issues = report.issues.filter(i => showInfo || i.severity !== 'info');
  const score = useMemo(() => scoreHeadline(head), [head]);
  const variants = useMemo(() => {
    const base = makeVariants(head, { subtitle });
    const extra = (extraVariants || []).filter(v => v.trim() && !base.some(b => b.text === v.trim())).map((t, i) => ({ id: `aria${i}`, label: 'Aria', text: t.trim(), note: 'Suggested by Aria. Check it states only what the story supports.' }));
    return [...base, ...extra];
  }, [head, subtitle, extraVariants]);
  const desc = subtitle || body.replace(/\s+/g, ' ').slice(0, 155);
  const sp = searchPreview(head, slugUrl, desc);
  const so = socialPreview(head, desc);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">
        <Chip interactive selected={tab === 'style'} onClick={() => setTab('style')}><Type size={12} /> Style ({report.issues.filter(i => i.severity !== 'info').length})</Chip>
        <Chip interactive selected={tab === 'headline'} onClick={() => setTab('headline')}><Search size={12} /> Headline</Chip>
      </div>

      {tab === 'style' && (
        <div className="flex flex-col gap-3">
          {text === undefined && <Textarea label="Paste copy to check" rows={5} value={scratch} onChange={e => setScratch(e.target.value)} />}
          <div className="flex flex-wrap gap-3 text-xs" style={{ color: 'var(--on-surface-variant)' }}>
            <span>{report.stats.words} words</span><span>{report.stats.sentences} sentences</span>
            <span>avg {report.stats.avgSentenceWords} words/sentence</span>
            <span style={{ color: report.stats.passiveRatio > 0.25 ? '#FF8C00' : undefined }}>{Math.round(report.stats.passiveRatio * 100)}% passive</span>
            <label className="flex items-center gap-1 ml-auto"><input type="checkbox" checked={showInfo} onChange={e => setShowInfo(e.target.checked)} /> show tips</label>
          </div>
          {issues.length === 0 && body.trim() && <p className="text-sm flex items-center gap-2" style={{ color: 'var(--pj-success)' }}><Check size={14} /> No AP-style flags in this copy.</p>}
          <ul className="flex flex-col gap-2 max-h-[46vh] overflow-y-auto">
            {issues.map((i, k) => {
              const s = SEV[i.severity];
              return (
                <li key={`${i.start}-${k}`} className="flex gap-2 items-start text-sm rounded-xl p-2" style={{ background: 'var(--pj-glass-2, rgba(255,255,255,.04))' }}>
                  <span style={{ color: s.color, marginTop: 2 }} aria-label={s.label}>{s.icon}</span>
                  <div className="min-w-0 flex-1">
                    <p><code className="px-1 rounded" style={{ background: 'rgba(255,255,255,.08)' }}>{i.match.length > 40 ? `${i.match.slice(0, 40)}...` : i.match}</code> <span style={{ color: 'var(--on-surface-variant)' }}>{i.message}</span></p>
                  </div>
                  {onReplace && i.suggestion !== undefined && <Button size="xs" variant="secondary" onClick={() => onReplace(i)}>Use {i.suggestion ? `"${i.suggestion}"` : 'fix'}</Button>}
                </li>
              );
            })}
          </ul>
          <p className="text-[11px]" style={{ color: 'var(--on-surface-variant)' }}>AP-style basics only (numbers, titles, datelines, attribution, passive voice, dates, times). It does not check facts, fairness or libel.</p>
        </div>
      )}

      {tab === 'headline' && (
        <div className="flex flex-col gap-4">
          {headline === undefined && <Input label="Headline" value={scratchHead} onChange={e => setScratchHead(e.target.value)} />}
          <div className="flex flex-wrap gap-3 items-center text-xs">
            <span className="font-black text-lg" style={{ color: score.score >= 85 ? 'var(--pj-success)' : score.score >= 60 ? '#FF8C00' : 'var(--pj-danger)' }}>{score.score}</span>
            <span>{score.chars} chars</span><span>{score.words} words</span>
            <span style={{ color: score.searchFits ? 'var(--pj-success)' : '#FF8C00' }}>search {score.searchFits ? 'fits' : `over ${SEARCH_TITLE_MAX}`}</span>
            <span style={{ color: score.socialFits ? 'var(--pj-success)' : '#FF8C00' }}>social {score.socialFits ? 'fits' : `over ${SOCIAL_TITLE_MAX}`}</span>
          </div>
          {score.issues.map((i, k) => <p key={k} className="text-xs flex gap-2" style={{ color: SEV[i.severity].color }}>{SEV[i.severity].icon}{i.message}</p>)}

          <Surface level={2} className="flex flex-col gap-1">
            <p className="pj-eyebrow flex items-center gap-1"><Search size={11} /> Search result</p>
            <p className="text-[#8ab4f8] text-base leading-snug">{sp.title}{sp.titleTruncated && <span title="Truncated in search results"> ...</span>}</p>
            <p className="text-xs" style={{ color: 'var(--pj-success)' }}>{sp.url}</p>
            <p className="text-xs" style={{ color: 'var(--on-surface-variant)' }}>{sp.description}</p>
          </Surface>
          <Surface level={2} className="flex flex-col gap-1">
            <p className="pj-eyebrow flex items-center gap-1"><Share2 size={11} /> Share card</p>
            <p className="text-[10px] uppercase opacity-60">{so.site}</p>
            <p className="font-bold leading-snug">{so.title}</p>
            <p className="text-xs" style={{ color: 'var(--on-surface-variant)' }}>{so.description}</p>
          </Surface>

          <div className="flex flex-col gap-2">
            <p className="pj-eyebrow">Variants</p>
            {variants.map(v => {
              const sc = scoreHeadline(v.text);
              return (
                <div key={v.id} className="flex items-start gap-2 rounded-xl p-2 text-sm" style={{ background: 'var(--pj-glass-2, rgba(255,255,255,.04))' }}>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold break-words">{v.text}</p>
                    <p className="text-[11px]" style={{ color: 'var(--on-surface-variant)' }}>{v.label}: {v.note} ({sc.chars} chars, score {sc.score})</p>
                  </div>
                  {onPickHeadline && v.text !== head && <Button size="xs" variant="secondary" onClick={() => onPickHeadline(v.text)}>Use</Button>}
                </div>
              );
            })}
            <p className="text-[11px]" style={{ color: 'var(--on-surface-variant)' }}>Variants are rule-based rewrites of your own words; none add facts. Check each still matches the story.</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default StyleHeadlinePanel;
