// Communications: segment builder → Plajah notification + email (+ SMS hook), templates, letter merge print,
// Avery-style mailing labels (print + CSV), message log. Minors are never messaged directly.
import React, { useEffect, useMemo, useState } from 'react';
import { Send, Printer, Download, Loader2, FileText, Tag } from 'lucide-react';
import type { ChmsMemberStatus } from '../../../types';
import type { ChmsMessageLog, Segment } from '../../../services/chmsPeople';
import { applySegment, sendSegmentMessage, fetchMessageLog, mergeTokens, mailingLabels, mailingLabelsCSV, downloadText, isMinor, fullName } from '../../../services/chmsPeople';
import { logOrgAction } from '../../../services/orgAudit';
import { usePeople, card, field, fieldSm, btn, btnPrimary, h2, label, STATUSES, Empty } from './PeopleUI';

const BUILTIN = [
  { name: 'Welcome visitor', subject: 'Thank you for visiting {{church_name}}', body: 'Hi {{first_name}},\n\nIt was a joy to have you with us. We would love to see you again — and to hear how we can pray for you.\n\n— {{church_name}}' },
  { name: 'We missed you', subject: 'We missed you, {{first_name}}', body: 'Hi {{first_name}},\n\nWe noticed you were not with us recently and wanted you to know you are thought of and loved. Reply any time if we can help or pray.\n\n— {{church_name}}' },
  { name: 'Announcement', subject: '', body: 'Hello {{first_name}},\n\n' },
];
const tplKey = (orgId: string) => `chmsTemplates:${orgId}`;
const esc = (s: string) => s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!));

const CommsHub: React.FC = () => {
  const { org, people, households, attendance, access, myMembership } = usePeople();
  const [seg, setSeg] = useState<Segment>({});
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('Hello {{first_name}},\n\n');
  const [ch, setCh] = useState({ notify: true, email: true, sms: false });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState('');
  const [log, setLog] = useState<ChmsMessageLog[]>([]);
  const [saved, setSaved] = useState<{ name: string; subject: string; body: string }[]>([]);
  const [tab, setTab] = useState<'compose' | 'print' | 'log'>('compose');

  useEffect(() => { try { setSaved(JSON.parse(localStorage.getItem(tplKey(org.id)) || '[]')); } catch { /* ignore */ } }, [org.id]);
  useEffect(() => { if (access.staff) fetchMessageLog(org.id).then(setLog).catch(() => {}); }, [org.id, access.staff]);

  const recipients = useMemo(() => applySegment(people, attendance, seg), [people, attendance, seg]);
  const adults = recipients.filter(p => !isMinor(p));
  const reach = { linked: adults.filter(p => p.linkedUid).length, email: adults.filter(p => p.email).length, phone: adults.filter(p => p.phone).length };
  const segLabel = [seg.statuses?.join('/'), seg.ministryIds?.length ? `${seg.ministryIds.length} ministries` : '', seg.tags?.join(','), seg.lapsedWeeks ? `away ${seg.lapsedWeeks}w+` : ''].filter(Boolean).join(' · ') || 'Everyone';
  const toggle = <T,>(arr: T[] | undefined, v: T) => { const a = arr || []; return a.includes(v) ? a.filter(x => x !== v) : [...a, v]; };

  const send = async () => {
    if (!body.trim() || !adults.length) return;
    if (!ch.notify && !ch.email && !ch.sms) { alert('Choose at least one channel.'); return; }
    if (!confirm(`Send to ${adults.length} people (${segLabel})?`)) return;
    setBusy(true);
    try {
      const r = await sendSegmentMessage(org, adults, { subject: subject.trim() || org.name, body, channels: ch, segmentLabel: segLabel }, myMembership?.displayName || 'Staff');
      setResult(Object.entries(r).map(([k, v]) => `${k}: ${v}`).join(' · ')); setLog(await fetchMessageLog(org.id));
    } catch (e: any) { setResult(e?.message || 'Send failed.'); }
    setBusy(false);
  };
  const saveTpl = () => { const name = prompt('Template name?'); if (!name) return; const next = [...saved.filter(t => t.name !== name), { name, subject, body }]; setSaved(next); try { localStorage.setItem(tplKey(org.id), JSON.stringify(next)); } catch { /* ignore */ } };

  const printWin = (title: string, html: string, css: string) => {
    const w = window.open('', '_blank'); if (!w) { alert('Allow pop-ups to print.'); return; }
    w.document.write(`<html><head><title>${esc(title)}</title><style>body{font-family:Georgia,serif;margin:0}${css}</style></head><body>${html}</body></html>`);
    w.document.close(); w.focus(); setTimeout(() => w.print(), 300);
  };
  const printLetters = () => {
    logOrgAction(org.id, 'CHMS_EXPORT', { meta: { what: 'letters', rows: adults.length } });
    const hh = new Map(households.map(h => [h.id, h]));
    const seen = new Set<string>(); const html = adults.filter(p => { const k = p.householdId || p.id; if (seen.has(k)) return false; seen.add(k); return true; })
      .map(p => `<section style="page-break-after:always;padding:1in;font-size:12pt;line-height:1.5;white-space:pre-wrap">${esc(mergeTokens(body, p, { household: p.householdId ? hh.get(p.householdId) : undefined, org }))}</section>`).join('');
    printWin('Letters', html, '');
  };
  const labels = useMemo(() => mailingLabels(adults, households), [adults, households]);
  const printLabels = () => {
    logOrgAction(org.id, 'CHMS_EXPORT', { meta: { what: 'labels', rows: labels.length } });
    const html = `<div class="sheet">${labels.map(l => `<div class="l"><b>${esc(l.name)}</b><br>${esc(l.line1)}${l.line2 ? '<br>' + esc(l.line2) : ''}<br>${esc(l.city)}, ${esc(l.region)} ${esc(l.postal)}</div>`).join('')}</div>`;
    // Avery 5160: 3 x 10, 2-5/8" x 1", 0.5in top margin
    printWin('Labels', html, '@page{size:letter;margin:0}.sheet{width:8.5in;padding:0.5in 0.19in;display:flex;flex-wrap:wrap}.l{width:2.625in;height:1in;padding:0.1in 0.15in;box-sizing:border-box;font:9pt Arial;margin-right:0.125in;overflow:hidden}.l:nth-child(3n){margin-right:0}');
  };

  if (!access.staff) return <Empty>Communications require roster access.</Empty>;
  return (
    <div className="space-y-5">
      <div className="flex gap-1.5">{(['compose', 'print', 'log'] as const).map(t => <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest ${tab === t ? 'bg-white text-black' : 'bg-white/5 text-white/50'}`}>{t === 'compose' ? 'Compose' : t === 'print' ? 'Letters & labels' : `Log (${log.length})`}</button>)}</div>

      {tab !== 'log' && (
        <div className={`${card} p-5 space-y-3`}>
          <h3 className={`${h2} flex items-center gap-1.5`}><Tag size={12} /> Audience</h3>
          <div className="flex flex-wrap gap-1.5">{STATUSES.filter(s => s !== 'DECEASED').map(s => <button key={s} onClick={() => setSeg(g => ({ ...g, statuses: toggle(g.statuses, s as ChmsMemberStatus) }))} className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border ${seg.statuses?.includes(s) ? 'bg-white text-black border-white' : 'bg-white/5 border-white/10 text-white/50'}`}>{s}</button>)}</div>
          <div className="flex flex-wrap gap-1.5">{(org.ministries || []).map(m => <button key={m.id} onClick={() => setSeg(g => ({ ...g, ministryIds: toggle(g.ministryIds, m.id) }))} className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border ${seg.ministryIds?.includes(m.id) ? 'bg-small-orange text-black border-small-orange' : 'bg-white/5 border-white/10 text-white/50'}`}>{m.name}</button>)}</div>
          <div className="flex flex-wrap gap-2 items-center text-[10px] text-white/50">
            <input placeholder="tag" value={seg.tags?.[0] || ''} onChange={e => setSeg(g => ({ ...g, tags: e.target.value ? [e.target.value.trim()] : undefined }))} className={`${fieldSm} w-24`} />
            <span>Age</span><input type="number" placeholder="min" className={`${fieldSm} w-16`} onChange={e => setSeg(g => ({ ...g, minAge: e.target.value ? Number(e.target.value) : undefined }))} /><input type="number" placeholder="max" className={`${fieldSm} w-16`} onChange={e => setSeg(g => ({ ...g, maxAge: e.target.value ? Number(e.target.value) : undefined }))} />
            <span>Away ≥</span><input type="number" placeholder="wks" className={`${fieldSm} w-16`} onChange={e => setSeg(g => ({ ...g, lapsedWeeks: e.target.value ? Number(e.target.value) : undefined }))} />
            <span>Attended within</span><input type="number" placeholder="wks" className={`${fieldSm} w-16`} onChange={e => setSeg(g => ({ ...g, attendedWithinWeeks: e.target.value ? Number(e.target.value) : undefined }))} />
            <label className="flex items-center gap-1"><input type="checkbox" onChange={e => setSeg(g => ({ ...g, hasChildren: e.target.checked || undefined }))} /> has children</label>
          </div>
          <p className="text-xs text-white"><b>{adults.length}</b> adults in audience <span className="text-white/40">· {reach.linked} on Plajah · {reach.email} email · {reach.phone} phone · minors and "do-not-contact" excluded</span></p>
        </div>
      )}

      {tab === 'compose' && (
        <div className={`${card} p-5 space-y-3`}>
          <div className="flex flex-wrap gap-2 items-center">
            <FileText size={13} className="text-white/40" />
            <select className={fieldSm} defaultValue="" onChange={e => { const t = [...BUILTIN, ...saved][Number(e.target.value)]; if (t) { setSubject(t.subject); setBody(t.body); } e.target.value = ''; }}>
              <option value="">Load template…</option>{[...BUILTIN, ...saved].map((t, i) => <option key={t.name + i} value={i}>{t.name}</option>)}
            </select>
            <button className={btn} onClick={saveTpl}>Save as template</button>
            <span className="text-[9px] text-white/30">Tokens: {'{{first_name}} {{last_name}} {{full_name}} {{household_name}} {{church_name}}'}</span>
          </div>
          <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Subject / title" className={field} />
          <textarea value={body} onChange={e => setBody(e.target.value)} rows={7} className={field} />
          <div className="flex flex-wrap items-center gap-4 text-xs text-white/70">
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={ch.notify} onChange={e => setCh(c => ({ ...c, notify: e.target.checked }))} /> Plajah notification</label>
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={ch.email} onChange={e => setCh(c => ({ ...c, email: e.target.checked }))} /> Email</label>
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={ch.sms} onChange={e => setCh(c => ({ ...c, sms: e.target.checked }))} /> SMS <span className="text-white/30">(no provider connected yet)</span></label>
          </div>
          {adults[0] && <p className="text-[10px] text-white/40 whitespace-pre-wrap border-l-2 border-white/10 pl-3">Preview for {fullName(adults[0])}: {mergeTokens(body, adults[0], { org }).slice(0, 240)}</p>}
          <div className="flex items-center gap-3"><button className={btnPrimary} onClick={send} disabled={busy || !adults.length}>{busy ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />} Send to {adults.length}</button>{result && <span className="text-[11px] font-bold text-emerald-300">{result}</span>}</div>
        </div>
      )}

      {tab === 'print' && (
        <div className="grid md:grid-cols-2 gap-5">
          <div className={`${card} p-5 space-y-3`}><h3 className={h2}>Letter merge</h3><p className="text-[11px] text-white/50">Uses the message body above (one letter per household). Write it on the Compose tab first.</p>
            <button className={btn} disabled={!adults.length} onClick={printLetters}><Printer size={13} /> Print letters</button></div>
          <div className={`${card} p-5 space-y-3`}><h3 className={h2}>Mailing labels ({labels.length})</h3><p className="text-[11px] text-white/50">One per household, Avery 5160 layout (3×10).</p>
            <div className="flex gap-2"><button className={btn} disabled={!labels.length} onClick={printLabels}><Printer size={13} /> Print</button><button className={btn} disabled={!labels.length} onClick={() => { logOrgAction(org.id, 'CHMS_EXPORT', { meta: { what: 'labels-csv', rows: labels.length } }); downloadText('labels.csv', mailingLabelsCSV(labels)); }}><Download size={13} /> CSV</button></div></div>
        </div>
      )}

      {tab === 'log' && (log.length === 0 ? <Empty>No messages sent yet.</Empty> : (
        <div className="space-y-2">{log.slice(0, 50).map(m => (
          <div key={m.id} className={`${card} p-4 text-xs`}><div className="flex justify-between gap-3"><b className="text-white truncate">{m.subject || '(no subject)'}</b><span className="text-white/30 shrink-0">{new Date(m.sentAt).toLocaleString()}</span></div>
            <p className="text-white/50 mt-1 line-clamp-2 whitespace-pre-wrap">{m.body}</p>
            <p className={`${label} mt-2`}>{m.channels.join(' + ')} · {m.recipientCount} recipients · {m.segmentLabel} · {m.sentByName}</p></div>))}</div>
      ))}
    </div>
  );
};

export default CommsHub;
